# Kid Daily Chore Home Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the approved Kid Home daily chore flow with daypart ordering, parent drag ordering, consistent kid-facing completion language, Done Today rewards, and the pet system removed from active product surfaces.

**Architecture:** Add chore-level `daypart` and `sort_order` as backend data, expose them through the existing chore and assignment responses, and use focused frontend utilities to group today's assignments into `Now`, `Anytime`, `Later`, and `Bonus`. Keep Kid Home as the primary action surface, keep Chores as browse/history, and remove pet routes, XP awards, badges, avatar rendering, and interactions without destructively rewriting legacy `avatar_config` JSON.

**Tech Stack:** FastAPI, SQLAlchemy async, SQLite startup migrations, Pydantic, React 18, Vite, Tailwind CSS 4, lucide-react, Node built-in test runner, Python unittest.

---

## File Structure

Create:
- `frontend/src/utils/choreDayparts.js`: daypart constants, labels, order helpers, current-daypart calculation, assignment grouping, reorder payload helpers.
- `frontend/src/utils/choreDayparts.test.js`: unit coverage for grouping, ordering, empty sections, current daypart, and parent reorder payloads.

Modify:
- `backend/models.py`: add `ChoreDaypart` enum and `Chore.daypart` / `Chore.sort_order`.
- `backend/migrations.py`: add SQLite migration for `chores.daypart` and `chores.sort_order`.
- `backend/tests/test_migrations.py`: add migration coverage for the new chore columns.
- `backend/schemas.py`: expose daypart/order on chore create, update, response, and parent reorder request schemas; remove `PetInteractionRequest`.
- `backend/routers/chores.py`: persist daypart/order, order chore lists, add parent reorder endpoint, remove pet XP side effects, and update kid-facing response messages away from quest language when touched.
- `backend/routers/calendar.py`: include chore daypart/order in assignment entries returned to the frontend.
- `backend/routers/stats.py`: include chore daypart/order in assignment entries and remove active pet stats from `/api/stats/me`.
- `backend/routers/spin.py`: stop awarding pet XP from wheel spins.
- `backend/routers/points.py`: stop awarding or deducting pet XP from manual point adjustments.
- `backend/achievements.py`: remove pet-level achievement criteria and pet XP award side effects.
- `backend/seed.py`: stop seeding pet achievements and pet avatar shop items.
- `backend/routers/avatar.py`: remove active pet avatar shop items and stop synchronizing pet XP fields.
- `backend/main.py`: stop registering the pets router.
- `frontend/src/pages/KidDashboard.jsx`: replace current quest board/pet panel/spin placement with the approved home layout and inline `Mark Done` flow.
- `frontend/src/pages/Chores.jsx`: add parent daypart grouped drag ordering, add daypart editing support, and remove kid inline completion controls from the browse/history screen.
- `frontend/src/components/QuestCreateModal.jsx`: add daypart selector and send `daypart` on create.
- `frontend/src/components/AvatarDisplay.jsx`: stop rendering pets next to avatars.
- `frontend/src/components/AvatarEditor.jsx`: remove the Pet tab, pet controls, and pet preview handling.
- `frontend/src/components/avatar/index.js`: stop exporting pet rendering helpers.
- `frontend/src/pages/Profile.jsx`: remove pet level badge.
- `frontend/src/pages/AvatarShop.jsx`: remove the active `pet` shop category.
- `frontend/src/index.css`: remove unused pet animation blocks after frontend imports are gone.

Delete:
- `backend/routers/pets.py`: active pet interaction API.
- `backend/services/pet_leveling.py`: active pet XP/leveling service.
- `frontend/src/components/PetLevelBadge.jsx`: active pet level UI.
- `frontend/src/components/avatar/pets.jsx`: active pet SVG renderer.

Do not modify unless a later test failure proves it is necessary:
- `frontend/src/pages/Calendar.jsx`
- `frontend/src/utils/parentCalendarGroups.js`
- `frontend/src/utils/parentCalendarGroups.test.js`

Those files are already dirty in the local checkout and are unrelated to this feature.

## Product Decisions Locked In

- Use `chore` language on kid surfaces. `ChoreQuest` may remain as the app brand.
- All kid-facing completion buttons say `Mark Done`.
- Photo-required chores still use `Mark Done` as the primary action. Their card also shows inline proof UI: `Photo needed` plus `Add Photo` before a file is attached, then a thumbnail/check state plus `Change` after selection. If a kid taps `Mark Done` before adding proof, the same card opens the photo picker instead of navigating away.
- All completed kid chores go through parent approval. The kid UI does not say `Submit for Approval` as the primary action.
- Empty `Now`, `Anytime`, `Later`, and `Bonus` sections disappear.
- `Now` means required chores for the current daypart.
- `Anytime` means required chores whose chore daypart is `anytime`.
- `Later` means required chores assigned to a later daypart on the same day.
- `Bonus` means optional chores, independent of daypart.
- Spin the wheel lives in the Done Today reward state after required chores are complete.
- Streak mercy/save status lives inside the Streak card, with a compact notice only when a save was used.
- Parents set daypart on the chore and order chores through drag-and-drop grouped by daypart. There is no visible numeric sort field.
- Chores screen remains useful for `Today`, `Upcoming`, `Recent`, filtering, status, and details; Home becomes the primary daily completion screen.
- Pet features are removed from active routes, points, achievements, avatar UI, profile UI, Kid Home, and shop categories. Existing legacy pet fields inside `avatar_config` can remain inert data.

---

### Task 1: Backend Chore Daypart And Order Schema

**Files:**
- Modify: `backend/models.py`
- Modify: `backend/migrations.py`
- Modify: `backend/schemas.py`
- Modify: `backend/tests/test_migrations.py`

- [ ] **Step 1: Write the migration test**

Add this method to `MigrationRunnerTests` in `backend/tests/test_migrations.py`:

```python
    def test_adds_chore_daypart_and_sort_order_columns(self):
        with tempfile.TemporaryDirectory() as tmp:
            db_path = Path(tmp) / "app.db"
            backup_dir = Path(tmp) / "backups"

            with closing(sqlite3.connect(db_path)) as conn:
                conn.execute(
                    """
                    CREATE TABLE chores (
                        id INTEGER PRIMARY KEY,
                        title TEXT NOT NULL
                    )
                    """
                )
                conn.execute("INSERT INTO chores VALUES (1, 'Make bed')")
                conn.commit()

            migration = next(
                m for m in MIGRATIONS if m.id == "2026_06_11_chore_daypart_order_v1"
            )

            run_sqlite_migrations(
                f"sqlite+aiosqlite:///{db_path}",
                migrations=[migration],
                backup_dir=backup_dir,
            )

            with closing(sqlite3.connect(db_path)) as conn:
                cols = {
                    row[1]: row[4]
                    for row in conn.execute("PRAGMA table_info(chores)")
                }
                row = conn.execute(
                    "SELECT daypart, sort_order FROM chores WHERE id = 1"
                ).fetchone()

            self.assertIn("daypart", cols)
            self.assertIn("sort_order", cols)
            self.assertEqual(row, ("anytime", 0))
```

- [ ] **Step 2: Run the migration test to verify it fails**

Run:

```powershell
python -m unittest backend.tests.test_migrations.MigrationRunnerTests.test_adds_chore_daypart_and_sort_order_columns
```

Expected: FAIL with `StopIteration` because `2026_06_11_chore_daypart_order_v1` does not exist yet.

- [ ] **Step 3: Add the backend enum and model fields**

In `backend/models.py`, add the enum near the existing chore enums:

```python
class ChoreDaypart(str, PyEnum):
    morning = "morning"
    afternoon = "afternoon"
    evening = "evening"
    anytime = "anytime"
```

In `class Chore`, add the columns after `requires_photo`:

```python
    daypart: Mapped[ChoreDaypart] = mapped_column(
        Enum(ChoreDaypart),
        nullable=False,
        default=ChoreDaypart.anytime,
    )
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
```

- [ ] **Step 4: Add the SQLite migration**

In `backend/migrations.py`, add:

```python
def _migrate_chore_daypart_order_v1(conn: sqlite3.Connection) -> None:
    _add_column_if_missing(
        conn,
        "chores",
        "daypart",
        "VARCHAR(20) DEFAULT 'anytime' NOT NULL",
    )
    _add_column_if_missing(
        conn,
        "chores",
        "sort_order",
        "INTEGER DEFAULT 0 NOT NULL",
    )
    if _table_exists(conn, "chores"):
        conn.execute(
            """
            UPDATE chores
            SET daypart = 'anytime'
            WHERE daypart IS NULL OR daypart = ''
            """
        )
        conn.execute(
            """
            UPDATE chores
            SET sort_order = 0
            WHERE sort_order IS NULL
            """
        )
```

Append to `MIGRATIONS` after `2026_06_11_drop_quest_templates`:

```python
    Migration(
        id="2026_06_11_chore_daypart_order_v1",
        description="Add chore daypart and parent-managed sort order",
        migrate=_migrate_chore_daypart_order_v1,
    ),
```

- [ ] **Step 5: Expose daypart/order through schemas**

In `backend/schemas.py`, import `ChoreDaypart` from `backend.models`, then change the chore schemas:

```python
class ChoreCreate(BaseModel):
    title: str = Field(max_length=200)
    description: str | None = None
    points: int = Field(gt=0)
    difficulty: Difficulty
    icon: str | None = None
    category_id: int
    recurrence: Recurrence
    custom_days: list[int] | None = None
    requires_photo: bool = False
    daypart: ChoreDaypart = ChoreDaypart.anytime
    sort_order: int = 0
    assigned_user_ids: list[int] = []


class ChoreUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    points: int | None = None
    difficulty: Difficulty | None = None
    icon: str | None = None
    category_id: int | None = None
    recurrence: Recurrence | None = None
    custom_days: list[int] | None = None
    requires_photo: bool | None = None
    daypart: ChoreDaypart | None = None
    sort_order: int | None = None
    assigned_user_ids: list[int] | None = None
```

Add these fields to `ChoreResponse` after `requires_photo`:

```python
    daypart: ChoreDaypart = ChoreDaypart.anytime
    sort_order: int = 0
```

- [ ] **Step 6: Run tests for this task**

Run:

```powershell
python -m unittest backend.tests.test_migrations.MigrationRunnerTests.test_adds_chore_daypart_and_sort_order_columns
python -m compileall backend
```

Expected: both commands pass.

- [ ] **Step 7: Commit**

Run:

```powershell
git -c safe.directory=C:/Users/mpero/Data/Coding/ChoreQuest-dev add backend/models.py backend/migrations.py backend/schemas.py backend/tests/test_migrations.py
git -c safe.directory=C:/Users/mpero/Data/Coding/ChoreQuest-dev commit -m "Add chore daypart ordering schema"
```

---

### Task 2: Backend Chore Ordering API

**Files:**
- Modify: `backend/schemas.py`
- Modify: `backend/routers/chores.py`
- Modify: `backend/tests/test_chore_action_routes.py`

- [ ] **Step 1: Write route presence and schema tests**

Add to `backend/tests/test_chore_action_routes.py`:

```python
    def test_parent_chore_daypart_reorder_route_is_available(self):
        routes = route_methods()

        self.assertIn(("/api/chores/reorder-dayparts", "POST"), routes)
```

Create `backend/tests/test_chore_daypart_schemas.py`:

```python
import unittest

from pydantic import ValidationError

from backend.models import ChoreDaypart
from backend.schemas import ChoreDaypartOrderItem, ChoreDaypartReorderRequest


class ChoreDaypartSchemaTests(unittest.TestCase):
    def test_reorder_request_accepts_daypart_and_position(self):
        request = ChoreDaypartReorderRequest(
            items=[
                {"chore_id": 10, "daypart": "morning", "sort_order": 0},
                {"chore_id": 11, "daypart": "evening", "sort_order": 1},
            ],
        )

        self.assertEqual(request.items[0].daypart, ChoreDaypart.morning)
        self.assertEqual(request.items[1].sort_order, 1)

    def test_reorder_request_requires_non_negative_sort_order(self):
        with self.assertRaises(ValidationError):
            ChoreDaypartOrderItem(
                chore_id=10,
                daypart="morning",
                sort_order=-1,
            )


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```powershell
python -m unittest backend.tests.test_chore_action_routes.ChoreActionRouteTests.test_parent_chore_daypart_reorder_route_is_available backend.tests.test_chore_daypart_schemas
```

Expected: FAIL because the route and schemas do not exist yet.

- [ ] **Step 3: Add reorder schemas**

In `backend/schemas.py`, add below `ChoreResponse`:

```python
class ChoreDaypartOrderItem(BaseModel):
    chore_id: int = Field(gt=0)
    daypart: ChoreDaypart
    sort_order: int = Field(ge=0)


class ChoreDaypartReorderRequest(BaseModel):
    items: list[ChoreDaypartOrderItem]
```

- [ ] **Step 4: Update chore create/update/list behavior**

In `backend/routers/chores.py`, import `ChoreDaypartReorderRequest`.

When creating a `Chore`, include:

```python
        daypart=body.daypart,
        sort_order=body.sort_order,
```

In the parent/kid list query ordering, apply stable daypart ordering before title:

```python
DAYPART_SORT_SQL = case(
    (Chore.daypart == "morning", 0),
    (Chore.daypart == "afternoon", 1),
    (Chore.daypart == "evening", 2),
    (Chore.daypart == "anytime", 3),
    else_=4,
)
```

Use:

```python
.order_by(DAYPART_SORT_SQL, Chore.sort_order, Chore.title)
```

If the file already has a local `order_by(Chore.title)`, replace it with that ordering.

- [ ] **Step 5: Add the parent reorder endpoint**

In `backend/routers/chores.py`, add this route before `@router.post("/{chore_id}/complete", ...)` so the static route wins over the path parameter route:

```python
@router.post("/reorder-dayparts", response_model=list[ChoreResponse])
async def reorder_chore_dayparts(
    body: ChoreDaypartReorderRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_parent),
):
    if not body.items:
        return []

    chore_ids = [item.chore_id for item in body.items]
    result = await db.execute(
        select(Chore)
        .where(Chore.id.in_(chore_ids))
        .where(Chore.created_by == user.id)
        .where(Chore.is_active == True)
        .options(selectinload(Chore.category))
    )
    chores = {chore.id: chore for chore in result.scalars().all()}

    missing = [chore_id for chore_id in chore_ids if chore_id not in chores]
    if missing:
        raise HTTPException(
            status_code=404,
            detail=f"Chores not found for reorder: {', '.join(map(str, missing))}",
        )

    for item in body.items:
        chore = chores[item.chore_id]
        chore.daypart = item.daypart
        chore.sort_order = item.sort_order

    await db.commit()

    ordered = sorted(
        chores.values(),
        key=lambda chore: (
            {"morning": 0, "afternoon": 1, "evening": 2, "anytime": 3}.get(
                getattr(chore.daypart, "value", chore.daypart),
                4,
            ),
            chore.sort_order,
            chore.title.lower(),
        ),
    )
    for chore in ordered:
        await db.refresh(chore, attribute_names=["category"])

    return [ChoreResponse.model_validate(chore) for chore in ordered]
```

- [ ] **Step 6: Run tests for this task**

Run:

```powershell
python -m unittest backend.tests.test_chore_action_routes backend.tests.test_chore_daypart_schemas
python -m compileall backend
```

Expected: route test, schema test, and compileall pass.

- [ ] **Step 7: Commit**

Run:

```powershell
git -c safe.directory=C:/Users/mpero/Data/Coding/ChoreQuest-dev add backend/schemas.py backend/routers/chores.py backend/tests/test_chore_action_routes.py backend/tests/test_chore_daypart_schemas.py
git -c safe.directory=C:/Users/mpero/Data/Coding/ChoreQuest-dev commit -m "Add parent chore daypart reorder API"
```

---

### Task 3: Assignment Responses Carry Chore Daypart Metadata

**Files:**
- Modify: `backend/routers/calendar.py`
- Modify: `backend/routers/stats.py`
- Modify: `backend/services/assignment_generator.py` only if existing assignment generation omits `Chore` relationships needed by response builders.

- [ ] **Step 1: Locate assignment response builders**

Run:

```powershell
rg "_build_.*assignment|AssignmentResponse|chore =" backend/routers/calendar.py backend/routers/stats.py backend/services/assignment_generator.py -n
```

Expected: find the calendar and stats functions that build assignment dictionaries.

- [ ] **Step 2: Add explicit chore metadata in stats**

In `backend/routers/stats.py`, ensure `_build_kid_assignment` returns a nested chore object containing:

```python
        "chore": {
            "id": chore.id,
            "title": chore.title,
            "description": chore.description,
            "points": chore.points,
            "difficulty": chore.difficulty,
            "icon": chore.icon,
            "category_id": chore.category_id,
            "category": chore.category,
            "recurrence": chore.recurrence,
            "custom_days": chore.custom_days,
            "schedule_type": getattr(rule, "schedule_type", None),
            "start_date": getattr(rule, "start_date", None),
            "weekdays": getattr(rule, "weekdays", None),
            "month_day": getattr(rule, "month_day", None),
            "requires_photo": chore.requires_photo,
            "daypart": chore.daypart,
            "sort_order": chore.sort_order,
            "is_optional": assignment.is_optional,
            "is_active": chore.is_active,
            "created_by": chore.created_by,
            "created_at": chore.created_at,
        },
```

If the function already delegates to `AssignmentResponse.model_validate`, confirm `ChoreResponse` from Task 1 is enough and do not duplicate the nested dictionary.

- [ ] **Step 3: Add explicit chore metadata in calendar**

In `backend/routers/calendar.py`, ensure every assignment entry returned to the frontend includes:

```python
        "chore": {
            "id": assignment.chore.id,
            "title": assignment.chore.title,
            "description": assignment.chore.description,
            "points": assignment.chore.points,
            "difficulty": assignment.chore.difficulty,
            "icon": assignment.chore.icon,
            "category_id": assignment.chore.category_id,
            "category": assignment.chore.category,
            "recurrence": assignment.chore.recurrence,
            "custom_days": assignment.chore.custom_days,
            "requires_photo": assignment.chore.requires_photo,
            "daypart": assignment.chore.daypart,
            "sort_order": assignment.chore.sort_order,
            "is_optional": assignment.is_optional,
            "is_active": assignment.chore.is_active,
            "created_by": assignment.chore.created_by,
            "created_at": assignment.chore.created_at,
        },
```

Use the existing local variable names in the file; do not create a second representation if the function already uses `AssignmentResponse`.

- [ ] **Step 4: Run backend verification**

Run:

```powershell
python -m compileall backend
python -m unittest backend.tests.test_migrations backend.tests.test_chore_action_routes backend.tests.test_chore_daypart_schemas
```

Expected: all commands pass.

- [ ] **Step 5: Commit**

Run:

```powershell
git -c safe.directory=C:/Users/mpero/Data/Coding/ChoreQuest-dev add backend/routers/calendar.py backend/routers/stats.py backend/services/assignment_generator.py
git -c safe.directory=C:/Users/mpero/Data/Coding/ChoreQuest-dev commit -m "Expose chore daypart metadata on assignments"
```

If `backend/services/assignment_generator.py` was not modified, omit it from `git add`.

---

### Task 4: Frontend Daypart Utilities

**Files:**
- Create: `frontend/src/utils/choreDayparts.js`
- Create: `frontend/src/utils/choreDayparts.test.js`

- [ ] **Step 1: Write grouping and ordering tests**

Create `frontend/src/utils/choreDayparts.test.js`:

```javascript
import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  DAYPART_ORDER,
  buildChoreReorderPayload,
  currentDaypartForHour,
  groupDailyAssignments,
} from './choreDayparts.js'

function item({
  id,
  title,
  daypart = 'anytime',
  sortOrder = 0,
  status = 'pending',
  optional = false,
  date = '2026-06-11',
}) {
  return {
    assignment_id: id,
    id: id + 100,
    title,
    date,
    assignment_status: status,
    is_optional: optional,
    chore: {
      id: id + 100,
      title,
      daypart,
      sort_order: sortOrder,
      requires_photo: false,
    },
  }
}

test('maps clock hour to kid daypart', () => {
  assert.equal(currentDaypartForHour(5), 'morning')
  assert.equal(currentDaypartForHour(11), 'morning')
  assert.equal(currentDaypartForHour(12), 'afternoon')
  assert.equal(currentDaypartForHour(16), 'afternoon')
  assert.equal(currentDaypartForHour(17), 'evening')
  assert.equal(currentDaypartForHour(22), 'evening')
})

test('groups today chores into now, anytime, later, and bonus', () => {
  const groups = groupDailyAssignments(
    [
      item({ id: 1, title: 'Read', daypart: 'evening', sortOrder: 0 }),
      item({ id: 2, title: 'Make bed', daypart: 'morning', sortOrder: 0 }),
      item({ id: 3, title: 'Water plants', daypart: 'anytime', sortOrder: 0 }),
      item({ id: 4, title: 'Extra help', daypart: 'afternoon', optional: true }),
      item({ id: 5, title: 'Already done', daypart: 'morning', status: 'verified' }),
    ],
    { currentDaypart: 'morning' },
  )

  assert.deepEqual(groups.now.items.map((entry) => entry.title), ['Make bed'])
  assert.deepEqual(groups.anytime.items.map((entry) => entry.title), ['Water plants'])
  assert.deepEqual(groups.later.items.map((entry) => entry.title), ['Read'])
  assert.deepEqual(groups.bonus.items.map((entry) => entry.title), ['Extra help'])
  assert.equal(groups.requiredTotal, 3)
  assert.equal(groups.requiredDone, 1)
  assert.equal(groups.requiredLeft, 2)
})

test('hides empty daily groups and sorts by daypart order then sort order', () => {
  const groups = groupDailyAssignments(
    [
      item({ id: 1, title: 'Second', daypart: 'morning', sortOrder: 20 }),
      item({ id: 2, title: 'First', daypart: 'morning', sortOrder: 10 }),
    ],
    { currentDaypart: 'morning' },
  )

  const visible = Object.values(groups.sections).filter((section) => section.items.length > 0)

  assert.deepEqual(visible.map((section) => section.id), ['now'])
  assert.deepEqual(groups.now.items.map((entry) => entry.title), ['First', 'Second'])
})

test('builds parent reorder payload from grouped chore ids', () => {
  const payload = buildChoreReorderPayload({
    morning: [3, 2],
    afternoon: [],
    evening: [9],
    anytime: [4],
  })

  assert.deepEqual(payload, {
    items: [
      { chore_id: 3, daypart: 'morning', sort_order: 0 },
      { chore_id: 2, daypart: 'morning', sort_order: 1 },
      { chore_id: 9, daypart: 'evening', sort_order: 0 },
      { chore_id: 4, daypart: 'anytime', sort_order: 0 },
    ],
  })
  assert.deepEqual(DAYPART_ORDER, ['morning', 'afternoon', 'evening', 'anytime'])
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```powershell
node --test frontend/src/utils/choreDayparts.test.js
```

Expected: FAIL because `choreDayparts.js` does not exist yet.

- [ ] **Step 3: Implement daypart utilities**

Create `frontend/src/utils/choreDayparts.js`:

```javascript
export const DAYPART_ORDER = ['morning', 'afternoon', 'evening', 'anytime']

export const DAYPART_LABELS = {
  morning: 'Morning',
  afternoon: 'Afternoon',
  evening: 'Evening',
  anytime: 'Anytime',
}

export const DAILY_SECTION_META = {
  now: { id: 'now', title: 'Now' },
  anytime: { id: 'anytime', title: 'Anytime' },
  later: { id: 'later', title: 'Later' },
  bonus: { id: 'bonus', title: 'Bonus' },
}

const REQUIRED_DONE_STATUSES = new Set(['completed', 'verified', 'skipped'])

export function currentDaypartForHour(hour) {
  if (hour < 12) return 'morning'
  if (hour < 17) return 'afternoon'
  return 'evening'
}

function normaliseDaypart(value) {
  return DAYPART_ORDER.includes(value) ? value : 'anytime'
}

function choreFromAssignment(item) {
  return item?.chore || item || {}
}

function assignmentStatus(item) {
  return item.assignment_status || item.status || 'pending'
}

function isDone(item) {
  return REQUIRED_DONE_STATUSES.has(assignmentStatus(item))
}

function isOptional(item) {
  const chore = choreFromAssignment(item)
  return Boolean(item.is_optional ?? chore.is_optional)
}

function daypartRank(daypart) {
  const index = DAYPART_ORDER.indexOf(normaliseDaypart(daypart))
  return index === -1 ? DAYPART_ORDER.length : index
}

function sortDailyItems(items) {
  return [...items].sort((a, b) => {
    const choreA = choreFromAssignment(a)
    const choreB = choreFromAssignment(b)
    return (
      daypartRank(choreA.daypart) - daypartRank(choreB.daypart)
      || Number(choreA.sort_order || 0) - Number(choreB.sort_order || 0)
      || String(choreA.title || a.title || '').localeCompare(String(choreB.title || b.title || ''))
    )
  })
}

export function groupDailyAssignments(items, { currentDaypart } = {}) {
  const activeDaypart = normaliseDaypart(currentDaypart)
  const sections = {
    now: { ...DAILY_SECTION_META.now, items: [] },
    anytime: { ...DAILY_SECTION_META.anytime, items: [] },
    later: { ...DAILY_SECTION_META.later, items: [] },
    bonus: { ...DAILY_SECTION_META.bonus, items: [] },
  }

  let requiredDone = 0
  let requiredTotal = 0

  for (const item of items || []) {
    const chore = choreFromAssignment(item)
    const daypart = normaliseDaypart(chore.daypart)
    const optional = isOptional(item)
    const done = isDone(item)

    if (optional) {
      if (!done) sections.bonus.items.push(item)
      continue
    }

    requiredTotal += 1
    if (done) {
      requiredDone += 1
      continue
    }

    if (daypart === activeDaypart) {
      sections.now.items.push(item)
    } else if (daypart === 'anytime') {
      sections.anytime.items.push(item)
    } else if (daypartRank(daypart) > daypartRank(activeDaypart)) {
      sections.later.items.push(item)
    } else {
      sections.anytime.items.push(item)
    }
  }

  for (const section of Object.values(sections)) {
    section.items = sortDailyItems(section.items)
  }

  return {
    ...sections,
    sections,
    requiredDone,
    requiredTotal,
    requiredLeft: Math.max(0, requiredTotal - requiredDone),
    nextUp: sections.now.items[0] || sections.anytime.items[0] || sections.later.items[0] || null,
  }
}

export function buildChoreReorderPayload(groupedIds) {
  return {
    items: DAYPART_ORDER.flatMap((daypart) => (
      (groupedIds[daypart] || []).map((choreId, index) => ({
        chore_id: Number(choreId),
        daypart,
        sort_order: index,
      }))
    )),
  }
}
```

- [ ] **Step 4: Run utility tests**

Run:

```powershell
node --test frontend/src/utils/choreDayparts.test.js
```

Expected: PASS.

- [ ] **Step 5: Commit**

Run:

```powershell
git -c safe.directory=C:/Users/mpero/Data/Coding/ChoreQuest-dev add frontend/src/utils/choreDayparts.js frontend/src/utils/choreDayparts.test.js
git -c safe.directory=C:/Users/mpero/Data/Coding/ChoreQuest-dev commit -m "Add chore daypart grouping utilities"
```

---

### Task 5: Parent Daypart Picker And Drag Ordering

**Files:**
- Modify: `frontend/src/components/QuestCreateModal.jsx`
- Modify: `frontend/src/pages/Chores.jsx`
- Modify: `frontend/src/utils/choreDayparts.js`
- Modify: `frontend/src/utils/choreDayparts.test.js`

- [ ] **Step 1: Add a reorder state helper test**

In `frontend/src/utils/choreDayparts.test.js`, change the existing import from `./choreDayparts.js` to include the new helper:

```javascript
import {
  DAYPART_ORDER,
  buildChoreReorderPayload,
  currentDaypartForHour,
  groupDailyAssignments,
  moveChoreBetweenDayparts,
} from './choreDayparts.js'
```

Then append this test:

```javascript
test('moves a chore within and across parent daypart groups', () => {
  const first = moveChoreBetweenDayparts(
    {
      morning: [1, 2, 3],
      afternoon: [],
      evening: [],
      anytime: [],
    },
    { choreId: 1, fromDaypart: 'morning', toDaypart: 'morning', toIndex: 2 },
  )

  assert.deepEqual(first.morning, [2, 3, 1])

  const second = moveChoreBetweenDayparts(
    {
      morning: [2, 3, 1],
      afternoon: [],
      evening: [],
      anytime: [4],
    },
    { choreId: 3, fromDaypart: 'morning', toDaypart: 'anytime', toIndex: 1 },
  )

  assert.deepEqual(second.morning, [2, 1])
  assert.deepEqual(second.anytime, [4, 3])
})
```

- [ ] **Step 2: Run helper test to verify it fails**

Run:

```powershell
node --test frontend/src/utils/choreDayparts.test.js
```

Expected: FAIL because `moveChoreBetweenDayparts` is not exported.

- [ ] **Step 3: Implement the reorder state helper**

Add to `frontend/src/utils/choreDayparts.js`:

```javascript
export function groupChoresForParentOrdering(chores) {
  const groups = Object.fromEntries(DAYPART_ORDER.map((daypart) => [daypart, []]))
  for (const chore of chores || []) {
    const daypart = normaliseDaypart(chore.daypart)
    groups[daypart].push(chore)
  }
  for (const daypart of DAYPART_ORDER) {
    groups[daypart].sort((a, b) => (
      Number(a.sort_order || 0) - Number(b.sort_order || 0)
      || String(a.title || '').localeCompare(String(b.title || ''))
    ))
  }
  return groups
}

export function moveChoreBetweenDayparts(groups, move) {
  const next = Object.fromEntries(
    DAYPART_ORDER.map((daypart) => [daypart, [...(groups[daypart] || [])]]),
  )
  const fromDaypart = normaliseDaypart(move.fromDaypart)
  const toDaypart = normaliseDaypart(move.toDaypart)
  const choreId = Number(move.choreId)

  next[fromDaypart] = next[fromDaypart].filter((id) => Number(id) !== choreId)
  const boundedIndex = Math.max(0, Math.min(Number(move.toIndex), next[toDaypart].length))
  next[toDaypart].splice(boundedIndex, 0, choreId)

  return next
}
```

- [ ] **Step 4: Add the daypart selector to chore creation**

In `frontend/src/components/QuestCreateModal.jsx`, import `DAYPART_LABELS` and `DAYPART_ORDER`:

```javascript
import { DAYPART_LABELS, DAYPART_ORDER } from '../utils/choreDayparts'
```

Add `daypart: 'anytime'` to the initial form state. Add this field to the payload sent to `/api/chores`:

```javascript
daypart: form.daypart,
```

Add this segmented control near the category/points fields:

```jsx
<div>
  <label className="block text-sm font-semibold text-ink mb-2">Best time</label>
  <div className="grid grid-cols-2 gap-2">
    {DAYPART_ORDER.map((daypart) => (
      <button
        key={daypart}
        type="button"
        onClick={() => setForm((prev) => ({ ...prev, daypart }))}
        className={`rounded-lg border px-3 py-2 text-sm font-semibold transition ${
          form.daypart === daypart
            ? 'border-primary bg-primary text-white shadow-sm'
            : 'border-border bg-white text-ink hover:border-primary/60'
        }`}
      >
        {DAYPART_LABELS[daypart]}
      </button>
    ))}
  </div>
</div>
```

- [ ] **Step 5: Add parent drag ordering to the Chores parent view**

In `frontend/src/pages/Chores.jsx`, import:

```javascript
import {
  DAYPART_LABELS,
  DAYPART_ORDER,
  buildChoreReorderPayload,
  groupChoresForParentOrdering,
  moveChoreBetweenDayparts,
} from '../utils/choreDayparts'
```

Add state near the other parent chore state:

```javascript
const [draggedChore, setDraggedChore] = useState(null)
const [savingOrder, setSavingOrder] = useState(false)
```

Create grouped chore IDs from active/library chores:

```javascript
const parentOrderGroups = useMemo(() => {
  const groups = groupChoresForParentOrdering(chores)
  return Object.fromEntries(
    DAYPART_ORDER.map((daypart) => [
      daypart,
      groups[daypart].map((chore) => chore.id),
    ]),
  )
}, [chores])
```

Add the save function:

```javascript
const saveDaypartOrder = async (nextGroups) => {
  setSavingOrder(true)
  try {
    await api('/api/chores/reorder-dayparts', {
      method: 'POST',
      body: buildChoreReorderPayload(nextGroups),
    })
    await loadChores()
  } finally {
    setSavingOrder(false)
  }
}
```

Add a parent-only ordering band above the chore list:

```jsx
<section className="space-y-3">
  <div className="flex items-center justify-between gap-3">
    <h2 className="text-lg font-black text-ink">Arrange Chores</h2>
    {savingOrder && <span className="text-sm font-semibold text-muted">Saving...</span>}
  </div>
  <div className="grid gap-3 md:grid-cols-4">
    {DAYPART_ORDER.map((daypart) => {
      const grouped = groupChoresForParentOrdering(chores)
      return (
        <div
          key={daypart}
          className="rounded-lg border border-border bg-white p-3"
          onDragOver={(event) => event.preventDefault()}
          onDrop={async () => {
            if (!draggedChore) return
            const nextGroups = moveChoreBetweenDayparts(parentOrderGroups, {
              choreId: draggedChore.choreId,
              fromDaypart: draggedChore.daypart,
              toDaypart: daypart,
              toIndex: parentOrderGroups[daypart].length,
            })
            setDraggedChore(null)
            await saveDaypartOrder(nextGroups)
          }}
        >
          <h3 className="mb-2 text-sm font-black text-ink">{DAYPART_LABELS[daypart]}</h3>
          <div className="space-y-2">
            {grouped[daypart].map((chore, index) => (
              <div
                key={chore.id}
                draggable
                onDragStart={() => setDraggedChore({ choreId: chore.id, daypart })}
                onDragOver={(event) => event.preventDefault()}
                onDrop={async (event) => {
                  event.stopPropagation()
                  if (!draggedChore) return
                  const nextGroups = moveChoreBetweenDayparts(parentOrderGroups, {
                    choreId: draggedChore.choreId,
                    fromDaypart: draggedChore.daypart,
                    toDaypart: daypart,
                    toIndex: index,
                  })
                  setDraggedChore(null)
                  await saveDaypartOrder(nextGroups)
                }}
                className="cursor-grab rounded-md border border-border bg-surface px-3 py-2 text-sm font-semibold text-ink active:cursor-grabbing"
              >
                {chore.title}
              </div>
            ))}
          </div>
        </div>
      )
    })}
  </div>
</section>
```

- [ ] **Step 6: Run frontend tests**

Run:

```powershell
node --test frontend/src/utils/choreDayparts.test.js frontend/src/utils/kidQuestBoard.test.js frontend/vite.config.test.js
```

Expected: all tests pass.

- [ ] **Step 7: Commit**

Run:

```powershell
git -c safe.directory=C:/Users/mpero/Data/Coding/ChoreQuest-dev add frontend/src/components/QuestCreateModal.jsx frontend/src/pages/Chores.jsx frontend/src/utils/choreDayparts.js frontend/src/utils/choreDayparts.test.js
git -c safe.directory=C:/Users/mpero/Data/Coding/ChoreQuest-dev commit -m "Add parent chore daypart ordering UI"
```

---

### Task 6: Kid Home Daily Chore Layout

**Files:**
- Modify: `frontend/src/pages/KidDashboard.jsx`
- Modify: `frontend/src/utils/choreDayparts.js`
- Modify: `frontend/src/utils/choreDayparts.test.js`

- [ ] **Step 1: Add completion label and done-state tests**

In `frontend/src/utils/choreDayparts.test.js`, change the import from `./choreDayparts.js` to include `kidCompletionLabelForAssignment`:

```javascript
import {
  DAYPART_ORDER,
  buildChoreReorderPayload,
  currentDaypartForHour,
  groupDailyAssignments,
  kidCompletionLabelForAssignment,
  moveChoreBetweenDayparts,
} from './choreDayparts.js'
```

Then append these tests:

```javascript
test('uses Mark Done as the kid-facing completion action for every pending chore', () => {
  assert.equal(
    kidCompletionLabelForAssignment(item({ id: 1, title: 'No photo' })),
    'Mark Done',
  )
  assert.equal(
    kidCompletionLabelForAssignment({
      ...item({ id: 2, title: 'Photo chore' }),
      chore: {
        id: 102,
        title: 'Photo chore',
        daypart: 'morning',
        sort_order: 0,
        requires_photo: true,
      },
    }),
    'Mark Done',
  )
})

test('uses waiting copy after a kid marks a chore done', () => {
  assert.equal(
    kidCompletionLabelForAssignment(item({ id: 3, title: 'Done', status: 'completed' })),
    'Waiting for approval',
  )
  assert.equal(
    kidCompletionLabelForAssignment(item({ id: 4, title: 'Approved', status: 'verified' })),
    'Done',
  )
})
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
node --test frontend/src/utils/choreDayparts.test.js
```

Expected: FAIL because `kidCompletionLabelForAssignment` is not exported.

- [ ] **Step 3: Implement kid action labels**

Add to `frontend/src/utils/choreDayparts.js`:

```javascript
export function kidCompletionLabelForAssignment(item) {
  const status = assignmentStatus(item)
  if (status === 'verified') return 'Done'
  if (status === 'completed') return 'Waiting for approval'
  if (status === 'needs_work') return 'Try Again'
  if (status === 'skipped') return 'Skipped'
  return 'Mark Done'
}
```

- [ ] **Step 4: Replace the Kid Home structure**

In `frontend/src/pages/KidDashboard.jsx`, remove imports and state used only by pet care:

```javascript
import PetLevelBadge from '../components/PetLevelBadge'
import { renderPet, renderPetExtras, renderPetAccessory, buildPetColors } from '../components/avatar'
```

Remove `petInteracting`, `petAction`, `petMessage`, `handlePetInteraction`, `hasPet`, `petColors`, and the entire `Pet Care` section.

Import daypart helpers:

```javascript
import {
  DAILY_SECTION_META,
  currentDaypartForHour,
  groupDailyAssignments,
  kidCompletionLabelForAssignment,
} from '../utils/choreDayparts'
```

Create derived home data after calendar and stats data are loaded:

```javascript
const currentDaypart = currentDaypartForHour(new Date().getHours())
const dailyGroups = useMemo(() => (
  groupDailyAssignments(todayAssignments, { currentDaypart })
), [todayAssignments, currentDaypart])
const requiredComplete = dailyGroups.requiredTotal > 0 && dailyGroups.requiredLeft === 0
```

Use the existing `todayAssignments` source if already available. If the file only has `assignments` from `/api/calendar`, define:

```javascript
const todayAssignments = useMemo(() => (
  assignments.filter((assignment) => assignment.date === todayISO)
), [assignments, todayISO])
```

- [ ] **Step 5: Add the fun status strip**

In the top area of `KidDashboard.jsx`, render a two-card status strip:

```jsx
<section className="grid grid-cols-2 gap-3">
  <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 shadow-sm">
    <div className="text-xs font-black uppercase tracking-wide text-amber-700">Points</div>
    <div className="mt-1 text-3xl font-black text-amber-900">{user?.points_balance ?? 0}</div>
    <div className="text-xs font-semibold text-amber-700">ready to spend</div>
  </div>
  <div className="rounded-lg border border-sky-200 bg-sky-50 p-4 shadow-sm">
    <div className="text-xs font-black uppercase tracking-wide text-sky-700">Streak</div>
    <div className="mt-1 text-3xl font-black text-sky-900">{user?.current_streak ?? 0}</div>
    <div className="text-xs font-semibold text-sky-700">
      {myStats?.streak_freeze_available ? 'Save ready' : 'Keep it going'}
    </div>
  </div>
</section>
```

Keep `PointCounter` if its animation is useful, but the visible label must be `Points`, not `Points Balance`, `Balance`, or `XP Balance`.

- [ ] **Step 6: Add the Today card**

Below the status strip, render:

```jsx
<section className="rounded-lg border border-border bg-white p-4 shadow-sm">
  <div className="flex items-start justify-between gap-4">
    <div>
      <h2 className="text-xl font-black text-ink">Today</h2>
      <p className="text-sm font-semibold text-muted">
        {dailyGroups.requiredDone} done · {dailyGroups.requiredLeft} left
      </p>
    </div>
    {dailyGroups.nextUp && (
      <div className="text-right">
        <div className="text-xs font-black uppercase text-muted">Next up</div>
        <div className="text-sm font-black text-ink">{dailyGroups.nextUp.title}</div>
      </div>
    )}
  </div>
</section>
```

- [ ] **Step 7: Add consistent chore cards**

Create a local `DailyChoreCard` component inside `KidDashboard.jsx`. The proof control stays on the card for photo-required chores:

```jsx
function DailyChoreCard({ item, onMarkDone, onPhotoSelected, selectedPhoto, uploading }) {
  const chore = item.chore || item
  const label = kidCompletionLabelForAssignment(item)
  const disabled = label !== 'Mark Done' || uploading
  const needsPhoto = Boolean(chore.requires_photo)

  return (
    <article className="rounded-lg border border-border bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-base font-black text-ink">{chore.title || item.title}</h3>
          <p className="mt-1 text-sm font-semibold text-muted">{chore.points || item.points || 0} pts</p>
        </div>
        <button
          type="button"
          onClick={() => onMarkDone(item)}
          disabled={disabled}
          className={`shrink-0 rounded-lg px-3 py-2 text-sm font-black transition ${
            disabled
              ? 'bg-surface text-muted'
              : 'bg-primary text-white shadow-sm hover:bg-primary/90'
          }`}
        >
          {uploading ? 'Saving...' : label}
        </button>
      </div>
      {needsPhoto && label === 'Mark Done' && (
        <div className="mt-3 flex items-center justify-between gap-3 rounded-lg bg-surface px-3 py-2">
          <div className="min-w-0">
            <div className="text-xs font-black uppercase text-muted">Photo needed</div>
            <div className="truncate text-sm font-semibold text-ink">
              {selectedPhoto ? selectedPhoto.name : 'Add proof before marking done'}
            </div>
          </div>
          <label className="shrink-0 cursor-pointer rounded-md bg-white px-3 py-2 text-sm font-black text-primary shadow-sm">
            {selectedPhoto ? 'Change' : 'Add Photo'}
            <input
              data-proof-input={item.assignment_id || item.id || item.chore_id}
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={(event) => onPhotoSelected(item, event.target.files?.[0] || null)}
            />
          </label>
        </div>
      )}
    </article>
  )
}
```

Render sections with empty groups hidden:

```jsx
{Object.values(DAILY_SECTION_META).map((section) => {
  const group = dailyGroups[section.id]
  if (!group?.items?.length) return null
  return (
    <section key={section.id} className="space-y-3">
      <h2 className="text-lg font-black text-ink">{section.title}</h2>
      <div className="space-y-3">
        {group.items.map((item) => (
          <DailyChoreCard
            key={item.assignment_id || item.id}
            item={item}
            uploading={completingChoreId === (item.id || item.chore_id)}
            selectedPhoto={photoProofFiles[item.assignment_id || item.id]}
            onPhotoSelected={handleHomePhotoSelected}
            onMarkDone={handleHomeMarkDone}
          />
        ))}
      </div>
    </section>
  )
})}
```

- [ ] **Step 8: Implement the Home `Mark Done` flow**

Add state:

```javascript
const [completingChoreId, setCompletingChoreId] = useState(null)
const [photoProofFiles, setPhotoProofFiles] = useState({})
```

Add the handler:

```javascript
const proofKeyFor = (item) => item.assignment_id || item.id || item.chore_id

const handleHomePhotoSelected = (item, file) => {
  const key = proofKeyFor(item)
  setPhotoProofFiles((prev) => {
    if (!file) {
      const next = { ...prev }
      delete next[key]
      return next
    }
    return { ...prev, [key]: file }
  })
}

const handleHomeMarkDone = async (item) => {
  const chore = item.chore || item
  const proofKey = proofKeyFor(item)
  const proofFile = photoProofFiles[proofKey]
  if (chore.requires_photo) {
    if (!proofFile) {
      document.querySelector(`[data-proof-input="${proofKey}"]`)?.click()
      return
    }
  }

  setCompletingChoreId(chore.id)
  try {
    if (proofFile) {
      const formData = new FormData()
      formData.append('file', proofFile)
      await api(`/api/chores/${chore.id}/complete`, { method: 'POST', body: formData })
    } else {
      await api(`/api/chores/${chore.id}/complete`, { method: 'POST' })
    }
    setPhotoProofFiles((prev) => {
      const next = { ...prev }
      delete next[proofKey]
      return next
    })
    await Promise.all([loadStats(), loadCalendar(), loadSpinAvailability?.()].filter(Boolean))
  } finally {
    setCompletingChoreId(null)
  }
}
```

The upload request posts to `/api/chores/{chore.id}/complete` with `FormData` containing `file`.

- [ ] **Step 9: Move spin into Done Today**

Replace the standalone spin placement with:

```jsx
<section className="rounded-lg border border-border bg-white p-4 shadow-sm">
  <div className="flex items-start justify-between gap-4">
    <div>
      <h2 className="text-xl font-black text-ink">Done Today</h2>
      <p className="text-sm font-semibold text-muted">
        {requiredComplete ? 'Nice work. Your daily chores are done.' : `Finish ${dailyGroups.requiredLeft} more to spin.`}
      </p>
    </div>
  </div>
  {spin_wheel_enabled && requiredComplete && (
    <div className="mt-4">
      <SpinWheel
        availability={spinAvailability}
        onSpinComplete={() => {
          loadSpinAvailability()
          loadStats()
        }}
      />
    </div>
  )}
</section>
```

Do not render the full wheel while required chores are still left.

- [ ] **Step 10: Run frontend tests and build**

Run:

```powershell
node --test frontend/src/utils/choreDayparts.test.js frontend/src/utils/kidQuestBoard.test.js frontend/vite.config.test.js
npm --prefix frontend run build
```

If the local npm shim fails with missing `npm-cli.js`, run:

```powershell
C:\Users\mpero\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe node_modules\vite\bin\vite.js build
```

from `frontend/`.

Expected: tests pass and the Vite production build completes.

- [ ] **Step 11: Commit**

Run:

```powershell
git -c safe.directory=C:/Users/mpero/Data/Coding/ChoreQuest-dev add frontend/src/pages/KidDashboard.jsx frontend/src/utils/choreDayparts.js frontend/src/utils/choreDayparts.test.js
git -c safe.directory=C:/Users/mpero/Data/Coding/ChoreQuest-dev commit -m "Build kid daily chore home"
```

---

### Task 7: Reframe Chores Screen As Browse And History

**Files:**
- Modify: `frontend/src/pages/Chores.jsx`
- Modify: `frontend/src/utils/kidQuestBoard.js`
- Modify: `frontend/src/utils/kidQuestBoard.test.js`

- [ ] **Step 1: Add a browse-card action test**

In `frontend/src/utils/kidQuestBoard.test.js`, change the existing import from `./kidQuestBoard.js` to include the new helper:

```javascript
import {
  kidBrowseActionForStatus,
  filterKidQuestItems,
  groupKidQuestAssignments,
  isDoneStatus,
} from './kidQuestBoard.js'
```

Then append this test:

```javascript
test('kid chores browse screen does not expose primary completion actions', () => {
  assert.equal(kidBrowseActionForStatus('pending'), 'View')
  assert.equal(kidBrowseActionForStatus('needs_work'), 'View')
  assert.equal(kidBrowseActionForStatus('completed'), 'Waiting for approval')
  assert.equal(kidBrowseActionForStatus('verified'), 'Done')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
node --test frontend/src/utils/kidQuestBoard.test.js
```

Expected: FAIL because `kidBrowseActionForStatus` is not exported.

- [ ] **Step 3: Implement browse action labels**

In `frontend/src/utils/kidQuestBoard.js`, add:

```javascript
export function kidBrowseActionForStatus(status) {
  if (status === 'verified') return 'Done'
  if (status === 'completed') return 'Waiting for approval'
  return 'View'
}
```

- [ ] **Step 4: Remove kid inline completion controls from Chores**

In `frontend/src/pages/Chores.jsx`, remove kid-only state and functions used only for inline completion on the browse screen:

```javascript
const [completingId, setCompletingId] = useState(null)
const [photoTarget, setPhotoTarget] = useState(null)
const handleKidComplete = async (...)
```

Keep tab state, category/difficulty filters, completed toggle, card navigation, and route to details.

For kid cards, replace primary completion buttons with:

```jsx
<button
  type="button"
  onClick={() => navigate(`/chores/${item.id}`)}
  className="rounded-lg bg-surface px-3 py-2 text-sm font-black text-ink hover:bg-border/60"
>
  {kidBrowseActionForStatus(item.assignment_status)}
</button>
```

The `ChoreDetail` page may retain a secondary completion fallback for direct links.

- [ ] **Step 5: Update copy**

In kid-facing headings inside `Chores.jsx`, use:

```jsx
<h1 className="text-2xl font-black text-ink">Chores</h1>
```

Use tab labels:

```javascript
['Today', 'Upcoming', 'Recent']
```

Avoid top-billing text such as `Today's Quest Run`, `Quest Board`, or `My Quests` on this screen.

- [ ] **Step 6: Run tests**

Run:

```powershell
node --test frontend/src/utils/kidQuestBoard.test.js frontend/src/utils/choreDayparts.test.js frontend/vite.config.test.js
```

Expected: all tests pass.

- [ ] **Step 7: Commit**

Run:

```powershell
git -c safe.directory=C:/Users/mpero/Data/Coding/ChoreQuest-dev add frontend/src/pages/Chores.jsx frontend/src/utils/kidQuestBoard.js frontend/src/utils/kidQuestBoard.test.js
git -c safe.directory=C:/Users/mpero/Data/Coding/ChoreQuest-dev commit -m "Reframe chores screen for browsing"
```

---

### Task 8: Remove Active Pet Backend

**Files:**
- Modify: `backend/main.py`
- Modify: `backend/schemas.py`
- Modify: `backend/routers/chores.py`
- Modify: `backend/routers/points.py`
- Modify: `backend/routers/spin.py`
- Modify: `backend/routers/stats.py`
- Modify: `backend/achievements.py`
- Modify: `backend/seed.py`
- Modify: `backend/routers/avatar.py`
- Delete: `backend/routers/pets.py`
- Delete: `backend/services/pet_leveling.py`
- Modify: `backend/tests/test_chore_action_routes.py`

- [ ] **Step 1: Add route absence test**

Add to `backend/tests/test_chore_action_routes.py`:

```python
    def test_pet_interaction_route_is_removed(self):
        routes = route_methods()

        self.assertNotIn(("/api/pets/interact", "POST"), routes)
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
python -m unittest backend.tests.test_chore_action_routes.ChoreActionRouteTests.test_pet_interaction_route_is_removed
```

Expected: FAIL because `/api/pets/interact` is still registered.

- [ ] **Step 3: Stop registering the pets router**

In `backend/main.py`, remove `pets` from the router import list:

```python
from backend.routers import (
    auth,
    chores,
    rewards,
    avatar,
    users,
    categories,
    points,
    rewards_parent,
    spin,
    stats,
    notifications,
    calendar,
    vacation,
    progress,
)
```

Remove:

```python
app.include_router(pets.router)
```

- [ ] **Step 4: Remove pet request schema**

In `backend/schemas.py`, delete:

```python
# Pet Interaction
class PetInteractionRequest(BaseModel):
    action: str = Field(pattern="^(feed|pet|play)$")
```

- [ ] **Step 5: Remove pet XP awards and deductions**

In `backend/routers/chores.py`, delete the `award_pet_xp_db` import block and `NotificationType.pet_levelup` notification inside `_approve_assignment`.

Delete the pet XP deduction block inside `_mark_assignment_needs_work`:

```python
    if total_deducted > 0:
        config = assigned_user.avatar_config or {}
        if config.get("pet") and config["pet"] != "none":
            ...
```

Point deductions should still update points and create normal chore review notifications.

In `backend/routers/points.py`, remove:

```python
from backend.services.pet_leveling import award_pet_xp_db
```

Remove each call to `award_pet_xp_db` and the pet-level notification block. Manual points still affect `points_balance` and point history exactly as before.

In `backend/routers/spin.py`, remove:

```python
from backend.services.pet_leveling import award_pet_xp_db
```

Remove:

```python
await award_pet_xp_db(db, user, points_won)
```

- [ ] **Step 6: Remove active pet stats**

In `backend/routers/stats.py`, remove imports from `backend.services.pet_leveling`. Remove computation of `pet_info`, `interactions_remaining`, and pet interaction budgets.

The `/api/stats/me` payload should no longer include:

```python
"pet": pet_info,
"interactions_remaining": remaining,
```

Keep points, streak, streak freeze availability, rank, assignments, and progress data unchanged.

- [ ] **Step 7: Remove pet achievements and seed data**

In `backend/achievements.py`, remove the `pet_level_reached` criteria branch and the pet XP award side effect after achievement rewards.

In `backend/seed.py`, remove the pet achievement rows whose keys are:

```python
"pet_youngling"
"pet_loyal"
"pet_mighty"
"pet_legendary"
```

Remove active shop seed entries in the `pet` category. Leave the chore category named `Pets` alone because it can still mean household animal care chores.

- [ ] **Step 8: Remove active pet avatar catalog behavior**

In `backend/routers/avatar.py`, remove the `pet_color` shop category and pet XP synchronization:

```python
if "pet_xp_map" in existing:
    new_config["pet_xp_map"] = existing["pet_xp_map"]
if "pet_xp" in existing:
    new_config.setdefault("pet_xp", existing["pet_xp"])
...
```

Do not write a migration that strips legacy `avatar_config` keys.

- [ ] **Step 9: Delete active pet backend files**

Run:

```powershell
git -c safe.directory=C:/Users/mpero/Data/Coding/ChoreQuest-dev rm backend/routers/pets.py backend/services/pet_leveling.py
```

- [ ] **Step 10: Verify no backend pet service references remain**

Run:

```powershell
rg "pet_leveling|PetInteractionRequest|/api/pets|pet_levelup|pet_level_reached" backend
```

Expected: no matches.

- [ ] **Step 11: Run backend tests**

Run:

```powershell
python -m unittest backend.tests.test_chore_action_routes backend.tests.test_migrations backend.tests.test_chore_daypart_schemas
python -m compileall backend
```

Expected: all commands pass.

- [ ] **Step 12: Commit**

Run:

```powershell
git -c safe.directory=C:/Users/mpero/Data/Coding/ChoreQuest-dev add backend/main.py backend/schemas.py backend/routers/chores.py backend/routers/points.py backend/routers/spin.py backend/routers/stats.py backend/achievements.py backend/seed.py backend/routers/avatar.py backend/tests/test_chore_action_routes.py
git -c safe.directory=C:/Users/mpero/Data/Coding/ChoreQuest-dev commit -m "Remove active pet backend"
```

The deleted files are already staged by `git rm`.

---

### Task 9: Remove Active Pet Frontend

**Files:**
- Modify: `frontend/src/components/AvatarDisplay.jsx`
- Modify: `frontend/src/components/AvatarEditor.jsx`
- Modify: `frontend/src/components/avatar/index.js`
- Modify: `frontend/src/pages/Profile.jsx`
- Modify: `frontend/src/pages/AvatarShop.jsx`
- Modify: `frontend/src/index.css`
- Delete: `frontend/src/components/PetLevelBadge.jsx`
- Delete: `frontend/src/components/avatar/pets.jsx`

- [ ] **Step 1: Confirm current pet imports**

Run:

```powershell
rg "PetLevelBadge|renderPet|renderPetExtras|renderPetAccessory|buildPetColors|pet_xp|pet_position|pet_accessory|/api/pets" frontend/src -n
```

Expected: matches in KidDashboard, Profile, AvatarDisplay, AvatarEditor, avatar index, pet renderer, and styles.

- [ ] **Step 2: Remove pet rendering from avatar display**

In `frontend/src/components/AvatarDisplay.jsx`, remove imports:

```javascript
renderPet,
renderPetExtras,
buildPetColors,
renderPetAccessory,
```

Remove pet-derived variables:

```javascript
const petColors = buildPetColors(config)
const petPosition = config.pet_position || 'right'
```

Remove the JSX block headed by the comment:

```jsx
{/* Pet — wrapped for wiggle animation, grows with pet level */}
```

Avatar display should still render the kid avatar and non-pet accessories exactly as before.

- [ ] **Step 3: Remove the Pet tab from avatar editor**

In `frontend/src/components/AvatarEditor.jsx`, remove:

```javascript
import { renderPet, renderPetExtras, buildPetColors } from './avatar/pets'
```

Remove pet keys from the default config:

```javascript
pet_color
pet_color_body
pet_color_ears
pet_color_tail
pet_color_accent
pet_position
pet_x
pet_y
pet_accessory
```

Remove the Pet category entry:

```javascript
{ id: 'pet', label: 'Pet' }
```

Delete these functions and constants:

```javascript
getPetLevelInfo
PetPreviewSvg
getPetXpForPet
PetCustomiser
PET_OPTIONS
PET_POSITION_OPTIONS
PET_ACCESSORY_OPTIONS
PET_COLORS
```

Remove render handling:

```javascript
if (openCategory === 'pet') return <PetCustomiser ... />
```

Remove the custom pet-position overlay block:

```jsx
{openCategory === 'pet' && config.pet_position === 'custom' && ...}
```

Remove special update behavior that rewrites `pet_xp` when switching pets.

- [ ] **Step 4: Remove pet exports and profile/shop UI**

In `frontend/src/components/avatar/index.js`, delete:

```javascript
export { renderPet, renderPetExtras, buildPetColors, renderPetAccessory } from './pets'
```

In `frontend/src/pages/Profile.jsx`, remove:

```javascript
import PetLevelBadge from '../components/PetLevelBadge'
```

Remove:

```jsx
<PetLevelBadge pet={stats.pet} />
```

In `frontend/src/pages/AvatarShop.jsx`, remove the `pet` category from `CATEGORY_ORDER` and `CATEGORY_LABELS`.

- [ ] **Step 5: Delete frontend pet files**

Run:

```powershell
git -c safe.directory=C:/Users/mpero/Data/Coding/ChoreQuest-dev rm frontend/src/components/PetLevelBadge.jsx frontend/src/components/avatar/pets.jsx
```

- [ ] **Step 6: Remove unused pet CSS**

In `frontend/src/index.css`, delete the blocks headed:

```css
/* Pet Level Visual Effects */
/* Pet Interaction Animations */
```

- [ ] **Step 7: Verify no active frontend pet references remain**

Run:

```powershell
rg "PetLevelBadge|renderPet|renderPetExtras|renderPetAccessory|buildPetColors|/api/pets" frontend/src
```

Expected: no matches.

Run:

```powershell
rg "pet_xp|pet_position|pet_accessory|pet_color" frontend/src
```

Expected: no matches, except if a legacy data migration display is intentionally kept out of visible UI. This plan keeps no visible pet config UI, so remove all matches under `frontend/src`.

- [ ] **Step 8: Run frontend tests and build**

Run:

```powershell
node --test frontend/src/utils/choreDayparts.test.js frontend/src/utils/kidQuestBoard.test.js frontend/vite.config.test.js
npm --prefix frontend run build
```

If the local npm shim fails with missing `npm-cli.js`, run:

```powershell
C:\Users\mpero\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe node_modules\vite\bin\vite.js build
```

from `frontend/`.

Expected: tests pass and Vite build completes.

- [ ] **Step 9: Commit**

Run:

```powershell
git -c safe.directory=C:/Users/mpero/Data/Coding/ChoreQuest-dev add frontend/src/components/AvatarDisplay.jsx frontend/src/components/AvatarEditor.jsx frontend/src/components/avatar/index.js frontend/src/pages/Profile.jsx frontend/src/pages/AvatarShop.jsx frontend/src/index.css
git -c safe.directory=C:/Users/mpero/Data/Coding/ChoreQuest-dev commit -m "Remove active pet frontend"
```

The deleted files are already staged by `git rm`.

---

### Task 10: Final Verification And Visual Check

**Files:**
- Read: current git diff and test output.
- Modify: only files that fail verification from Tasks 1-9.

- [ ] **Step 1: Run full focused verification**

Run:

```powershell
python -m unittest backend.tests.test_migrations backend.tests.test_chore_action_routes backend.tests.test_chore_daypart_schemas
python -m compileall backend
node --test frontend/src/utils/choreDayparts.test.js frontend/src/utils/kidQuestBoard.test.js frontend/vite.config.test.js
npm --prefix frontend run build
```

If the local npm shim fails with missing `npm-cli.js`, run:

```powershell
C:\Users\mpero\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe node_modules\vite\bin\vite.js build
```

from `frontend/`.

Expected: backend tests pass, compileall passes, frontend tests pass, Vite build completes.

- [ ] **Step 2: Inspect remaining pet and quest language**

Run:

```powershell
rg "PetLevelBadge|renderPet|renderPetExtras|renderPetAccessory|buildPetColors|/api/pets|pet_leveling|PetInteractionRequest" backend frontend/src
```

Expected: no matches.

Run:

```powershell
rg "Quest Board|Today's Quest Run|My Quests|Submit for Approval|Points Balance" frontend/src
```

Expected: no matches in kid-facing Home or Chores surfaces.

- [ ] **Step 3: Start the app for visual verification**

Run backend from the repository root:

```powershell
python -m uvicorn backend.main:app --host 0.0.0.0 --port 8123
```

In another terminal, run frontend:

```powershell
$env:CHOREQUEST_BACKEND_URL='http://localhost:8123'; npm --prefix frontend run dev -- --host 0.0.0.0 --port 5173
```

If the npm shim fails, use the bundled Node runtime from `frontend/`:

```powershell
$env:CHOREQUEST_BACKEND_URL='http://localhost:8123'; C:\Users\mpero\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe node_modules\vite\bin\vite.js --host 0.0.0.0 --port 5173
```

- [ ] **Step 4: Browser check**

Open `http://localhost:5173`.

Verify as a kid:
- Header/top area does not say `Quest Board`.
- The first meaningful status area shows `Points` and `Streak` as fun, prominent status cards.
- Today card shows done count, left count, and next up.
- `Now`, `Anytime`, `Later`, and `Bonus` sections disappear when empty.
- Every pending chore action says `Mark Done`, including photo-required chores.
- Photo-required cards show `Photo needed` and `Add Photo` inline; tapping `Mark Done` without a file opens that card's file picker.
- A completed-but-not-approved chore says `Waiting for approval`.
- Spin wheel appears only in the Done Today reward state after required chores are complete.
- Pet Care does not appear.

Verify as a parent:
- Chore create/edit includes a `Best time` daypart selector.
- Arrange Chores shows daypart groups.
- Dragging within a group updates order.
- Dragging between groups changes daypart and order.
- No numeric sort order field is visible.

Verify Chores screen:
- Kid view is browse/history with `Today`, `Upcoming`, and `Recent`.
- Kid cards route to details or show passive status; they do not expose primary inline completion buttons.

- [ ] **Step 5: Check git status**

Run:

```powershell
git -c safe.directory=C:/Users/mpero/Data/Coding/ChoreQuest-dev status --short
```

Expected: only unrelated pre-existing dirty files may remain:

```text
 M frontend/src/pages/Calendar.jsx
 M frontend/src/utils/parentCalendarGroups.js
 M frontend/src/utils/parentCalendarGroups.test.js
```

If implementation files are dirty, inspect and commit them.

- [ ] **Step 6: Final commit if verification required fixes**

Run only if Step 1-4 forced follow-up edits:

```powershell
git -c safe.directory=C:/Users/mpero/Data/Coding/ChoreQuest-dev add backend/models.py backend/migrations.py backend/schemas.py backend/routers/chores.py backend/routers/calendar.py backend/routers/stats.py backend/routers/spin.py backend/routers/points.py backend/achievements.py backend/seed.py backend/routers/avatar.py backend/main.py backend/tests/test_migrations.py backend/tests/test_chore_action_routes.py backend/tests/test_chore_daypart_schemas.py frontend/src/utils/choreDayparts.js frontend/src/utils/choreDayparts.test.js frontend/src/utils/kidQuestBoard.js frontend/src/utils/kidQuestBoard.test.js frontend/src/pages/KidDashboard.jsx frontend/src/pages/Chores.jsx frontend/src/components/QuestCreateModal.jsx frontend/src/components/AvatarDisplay.jsx frontend/src/components/AvatarEditor.jsx frontend/src/components/avatar/index.js frontend/src/pages/Profile.jsx frontend/src/pages/AvatarShop.jsx frontend/src/index.css
git -c safe.directory=C:/Users/mpero/Data/Coding/ChoreQuest-dev commit -m "Polish daily chore home verification"
```

---

## Self-Review

Spec coverage:
- Kid Home as primary action surface: Task 6.
- Back off quest language: Tasks 6, 7, and 10.
- Points and Streak prominent and fun: Task 6.
- Today card contains today-only status: Task 6.
- Empty sections disappear: Tasks 4 and 6.
- Consistent `Mark Done` kid action, including photo proof: Tasks 4 and 6.
- All kid completions still go through approval: Tasks 6 and 7 keep the existing `/complete` to parent approval flow, with photo proof collected inline on the card when required.
- Spin wheel integrated into Done Today: Task 6.
- Streak mercy integrated into Streak card: Task 6.
- Parent daypart and drag ordering: Tasks 1, 2, 4, and 5.
- Chores screen reframed: Task 7.
- Pets removed from active product: Tasks 8 and 9.
- Verification covers tests, build, copy checks, and browser behavior: Task 10.

Placeholder scan:
- No red-flag placeholder terms remain, no generic test instruction remains without code, and no task depends on an undefined helper.

Type consistency:
- Backend uses `ChoreDaypart`, `daypart`, `sort_order`, `ChoreDaypartOrderItem`, and `ChoreDaypartReorderRequest` consistently.
- Frontend uses lowercase daypart ids: `morning`, `afternoon`, `evening`, `anytime`.
- Kid action helper returns exactly `Mark Done`, `Waiting for approval`, `Done`, `Try Again`, and `Skipped`.
