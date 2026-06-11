# Daily Rollover Timezone Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace UTC reset-hour behavior with one family day timezone that controls daily rollover, backend "today", and frontend date selection.

**Architecture:** Store `daily_rollover_timezone` as an app setting using an IANA timezone name such as `America/Chicago` or `Europe/Belgrade`. Add backend helpers that compute the current local date and next local midnight from that timezone with Python `zoneinfo`, and frontend helpers that compute the same local date with `Intl.DateTimeFormat`. Date-only chore schedules remain date-only; only "today" and rollover behavior use the timezone.

**Tech Stack:** FastAPI, SQLAlchemy async, Python `zoneinfo`, React, Vite, Node test runner, Python unittest.

---

### Task 1: Backend Timezone Helpers

**Files:**
- Create: `backend/services/daytime.py`
- Test: `backend/tests/test_daytime.py`

- [ ] **Step 1: Write failing tests**

```python
from datetime import datetime, timezone
import unittest

from backend.services.daytime import (
    local_date_for_timezone,
    next_local_midnight_utc,
    normalize_timezone_name,
)


class DaytimeTests(unittest.TestCase):
    def test_local_date_uses_requested_timezone(self):
        instant = datetime(2026, 6, 11, 22, 30, tzinfo=timezone.utc)
        self.assertEqual(
            local_date_for_timezone("Europe/Belgrade", instant).isoformat(),
            "2026-06-12",
        )
        self.assertEqual(
            local_date_for_timezone("America/Chicago", instant).isoformat(),
            "2026-06-11",
        )

    def test_next_local_midnight_accounts_for_dst_offset(self):
        instant = datetime(2026, 6, 11, 21, 0, tzinfo=timezone.utc)
        self.assertEqual(
            next_local_midnight_utc("Europe/Belgrade", instant),
            datetime(2026, 6, 11, 22, 0, tzinfo=timezone.utc),
        )
        self.assertEqual(
            next_local_midnight_utc("America/Chicago", instant),
            datetime(2026, 6, 12, 5, 0, tzinfo=timezone.utc),
        )

    def test_invalid_timezone_falls_back_to_default(self):
        self.assertEqual(normalize_timezone_name("Nope/Bad"), "America/Chicago")
        self.assertEqual(normalize_timezone_name("Europe/Belgrade"), "Europe/Belgrade")
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m unittest backend.tests.test_daytime`

Expected: FAIL because `backend.services.daytime` does not exist.

- [ ] **Step 3: Implement helper**

Create `backend/services/daytime.py` with:

```python
from datetime import date, datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

DEFAULT_DAILY_ROLLOVER_TIMEZONE = "America/Chicago"


def normalize_timezone_name(value: str | None) -> str:
    name = (value or "").strip()
    if not name:
        return DEFAULT_DAILY_ROLLOVER_TIMEZONE
    try:
        ZoneInfo(name)
    except ZoneInfoNotFoundError:
        return DEFAULT_DAILY_ROLLOVER_TIMEZONE
    return name


def local_date_for_timezone(
    timezone_name: str | None,
    now: datetime | None = None,
) -> date:
    zone = ZoneInfo(normalize_timezone_name(timezone_name))
    current = now or datetime.now(timezone.utc)
    if current.tzinfo is None:
        current = current.replace(tzinfo=timezone.utc)
    return current.astimezone(zone).date()


def next_local_midnight_utc(
    timezone_name: str | None,
    now: datetime | None = None,
) -> datetime:
    zone = ZoneInfo(normalize_timezone_name(timezone_name))
    current = now or datetime.now(timezone.utc)
    if current.tzinfo is None:
        current = current.replace(tzinfo=timezone.utc)
    local_now = current.astimezone(zone)
    next_day = local_now.date() + timedelta(days=1)
    local_midnight = datetime.combine(next_day, time.min, tzinfo=zone)
    return local_midnight.astimezone(timezone.utc)
```

### Task 2: Settings Defaults and API

**Files:**
- Modify: `backend/seed.py`
- Modify: `backend/routers/admin.py`
- Test: `backend/tests/test_seed_source.py`

- [ ] **Step 1: Add settings-source assertions**

Extend `test_seed_source.py` to assert `daily_rollover_timezone` is seeded and `daily_reset_hour` is not the primary setting.

- [ ] **Step 2: Implement defaults**

Seed `daily_rollover_timezone` with `America/Chicago`. Keep reading legacy `daily_reset_hour` only as deprecated data; do not show or use it for rollover.

### Task 3: Backend Today/Rollover Wiring

**Files:**
- Modify: `backend/main.py`
- Modify: `backend/routers/calendar.py`
- Modify: `backend/routers/chores.py`
- Modify: `backend/routers/spin.py`
- Modify: `backend/routers/stats.py`
- Modify: `backend/routers/progress.py`
- Modify: `backend/routers/vacation.py`
- Modify: `backend/routers/pets.py`
- Modify: `backend/achievements.py`

- [ ] **Step 1: Add settings helper**

Add an async helper that reads `daily_rollover_timezone` from `AppSetting`, falls back to env `TZ`, then falls back to `America/Chicago`.

- [ ] **Step 2: Replace `date.today()` where it means app day**

Use `local_date_for_timezone(await get_daily_rollover_timezone(db))` for assignment generation, calendar windows, spin availability, stats, achievements, vacation validation, pet interactions, and streak logic.

- [ ] **Step 3: Replace reset-hour scheduler**

Make `daily_reset_task` recompute `next_local_midnight_utc(timezone_name)` and sleep in capped intervals so settings changes take effect without waiting a full day.

### Task 4: Frontend Timezone Helpers and Settings UI

**Files:**
- Create: `frontend/src/utils/daytime.js`
- Test: `frontend/src/utils/daytime.test.js`
- Modify: `frontend/src/hooks/useSettings.jsx`
- Modify: `frontend/src/pages/Settings.jsx`
- Modify: frontend files that call `toISO(new Date())` or local `todayISO()`

- [ ] **Step 1: Add frontend helper tests**

Test that `isoDateInTimeZone(new Date('2026-06-11T22:30:00Z'), 'Europe/Belgrade')` returns `2026-06-12`, while Chicago returns `2026-06-11`.

- [ ] **Step 2: Add helper and wire settings**

Expose `daily_rollover_timezone` from `useSettings`, show a select/input in Family Settings, and use it anywhere frontend code asks for "today".

### Task 5: Verification

Run:

```bash
python -m unittest backend.tests.test_daytime backend.tests.test_seed_source
python -m compileall backend
node --test frontend/src/utils/daytime.test.js frontend/src/utils/scheduleDays.test.js frontend/src/utils/calendarWeek.test.js
npm.cmd --prefix frontend run build
```

Expected: all tests pass; build may retain the existing large chunk warning.
