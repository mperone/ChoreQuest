import logging
import os
import uuid
from datetime import datetime, date, timezone, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from sqlalchemy import select, and_, case, func, text
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from backend.database import get_db
from backend.models import (
    Chore,
    ChoreAssignment,
    ChoreAssignmentRule,
    ChoreCategory,
    ChoreExclusion,
    ChoreRotation,
    User,
    UserRole,
    AssignmentStatus,
    PointTransaction,
    PointType,
    SeasonalEvent,
    Notification,
    NotificationType,
    Recurrence,
    ScheduleType,
)
from backend.schemas import (
    ChoreCreate,
    ChoreUpdate,
    ChoreResponse,
    ChoreDaypartReorderRequest,
    AssignmentResponse,
    AssignmentRuleResponse,
    CategoryCreate,
    CategoryResponse,
    ChoreAssignRequest,
    AssignmentRuleUpdate,
    RotationResponse,
    QuestFeedbackRequest,
)
from backend.config import settings
from backend.dependencies import get_current_user, require_parent
from backend.achievements import check_achievements
from backend.websocket_manager import ws_manager
from backend.services.assignment_generator import auto_generate_week_assignments
from backend.services.calendar_windows import monday_week_start, monday_week_starts_to_generate
from backend.services.recurrence import should_create_on_day
from backend.services.rotation import get_rotation_kid_for_day
from backend.services.assignment_cleanup import pending_assignment_is_stale
from backend.services.optional_quests import assignment_completion_advances_streak
from backend.services.streaks import gap_preserves_streak
from backend.services.daytime import app_today

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/chores", tags=["chores"])

_CHORE_CHANGED = {"type": "data_changed", "data": {"entity": "chore"}}
_CATEGORY_CHANGED = {"type": "data_changed", "data": {"entity": "category"}}

DAYPART_SORT_SQL = case(
    (Chore.daypart == "morning", 0),
    (Chore.daypart == "afternoon", 1),
    (Chore.daypart == "evening", 2),
    (Chore.daypart == "anytime", 3),
    else_=4,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _value(value):
    return value.value if hasattr(value, "value") else value


def _normalize_weekdays(weekdays: list[int] | None) -> list[int]:
    if not weekdays:
        return []
    return sorted({day for day in weekdays if isinstance(day, int) and 0 <= day <= 6})


def _normalize_month_day(month_day: int | None, start_date: date) -> int | None:
    if month_day == -1:
        return -1
    if isinstance(month_day, int) and 1 <= month_day <= 31:
        return month_day
    return start_date.day


def _schedule_from_assignment_item(item, default_start: date) -> dict:
    schedule_type = item.schedule_type
    if schedule_type is None:
        if item.recurrence == Recurrence.custom:
            schedule_type = ScheduleType.weekly
        else:
            schedule_type = ScheduleType(item.recurrence.value)

    start_date = item.start_date or default_start
    weekdays = None
    if schedule_type in (ScheduleType.weekly, ScheduleType.fortnightly):
        weekdays = _normalize_weekdays(item.weekdays or item.custom_days)
        if not weekdays:
            weekdays = [start_date.weekday()]
    month_day = None
    if schedule_type == ScheduleType.monthly:
        month_day = _normalize_month_day(item.month_day, start_date)

    recurrence = Recurrence(schedule_type.value)
    custom_days = weekdays if weekdays else None

    return {
        "user_id": item.user_id,
        "recurrence": recurrence,
        "custom_days": custom_days,
        "schedule_type": schedule_type,
        "start_date": start_date,
        "weekdays": weekdays,
        "month_day": month_day,
        "requires_photo": item.requires_photo,
        "is_optional": item.is_optional,
    }


def _chore_created_date(chore: Chore) -> date:
    return chore.created_at.date() if hasattr(chore.created_at, "date") else chore.created_at


def _schedule_item_runs_on_day(item: dict, chore: Chore, target_day: date) -> bool:
    return should_create_on_day(
        item["recurrence"],
        target_day,
        chore.created_at.weekday(),
        item["custom_days"],
        created_at_date=_chore_created_date(chore),
        schedule_type=item["schedule_type"],
        start_date=item["start_date"],
        weekdays=item["weekdays"],
        month_day=item["month_day"],
    )


def _active_weekdays_for_schedule_items(assignments: list[dict]) -> list[int] | None:
    active_weekdays: set[int] = set()
    for item in assignments:
        if item["schedule_type"] in (ScheduleType.daily, ScheduleType.monthly):
            return None
        if item["weekdays"]:
            active_weekdays.update(item["weekdays"])
    return sorted(active_weekdays) if active_weekdays else None


def _apply_rule_schedule(data: dict, rule: ChoreAssignmentRule | None) -> dict:
    if not rule:
        return data

    data["schedule_type"] = _value(rule.schedule_type)
    data["start_date"] = rule.start_date
    data["weekdays"] = rule.weekdays
    data["month_day"] = rule.month_day
    data["is_optional"] = rule.is_optional
    return data


async def _remove_stale_pending_assignments_for_schedule(
    db: AsyncSession,
    chore: Chore,
    assignments: list[dict],
    rotation: ChoreRotation | None,
    reference_day: date,
) -> int:
    """Delete pending rows that no longer match the submitted schedule.

    Completed, verified, skipped, and missed rows are history and are left
    alone. Pending rows are just planned calendar entries, so they should
    follow the current assignment rule exactly.
    """
    assignments_by_user: dict[int, list[dict]] = {}
    for item in assignments:
        assignments_by_user.setdefault(item["user_id"], []).append(item)

    active_weekdays = (
        _active_weekdays_for_schedule_items(assignments)
        if rotation and rotation.kid_ids
        else None
    )

    result = await db.execute(
        select(ChoreAssignment).where(
            ChoreAssignment.chore_id == chore.id,
            ChoreAssignment.status == AssignmentStatus.pending,
        )
    )

    removed = 0
    for pending in result.scalars().all():
        user_items = assignments_by_user.get(pending.user_id, [])
        should_keep = any(
            _schedule_item_runs_on_day(item, chore, pending.date)
            for item in user_items
        )

        if should_keep and rotation and rotation.kid_ids:
            expected_kid = get_rotation_kid_for_day(
                rotation, pending.date, reference_day, active_weekdays,
            )
            should_keep = int(pending.user_id) == expected_kid

        if not should_keep:
            await db.delete(pending)
            removed += 1

    return removed

async def _get_chore_or_404(
    db: AsyncSession,
    chore_id: int,
    *,
    active_only: bool = True,
    load_category: bool = False,
) -> Chore:
    """Load a chore by ID, raising 404 if not found."""
    stmt = select(Chore).where(Chore.id == chore_id)
    if active_only:
        stmt = stmt.where(Chore.is_active == True)
    if load_category:
        stmt = stmt.options(selectinload(Chore.category))
    result = await db.execute(stmt)
    chore = result.scalar_one_or_none()
    if chore is None:
        raise HTTPException(status_code=404, detail="Chore not found")
    return chore


async def _reload_chore_with_category(db: AsyncSession, chore_id: int) -> Chore:
    """Reload a chore with its category relationship eagerly loaded."""
    result = await db.execute(
        select(Chore)
        .where(Chore.id == chore_id)
        .options(selectinload(Chore.category))
    )
    return result.scalar_one()


async def _reload_assignment_with_relations(
    db: AsyncSession, assignment_id: int
) -> ChoreAssignment:
    """Reload an assignment with chore (+ category) and user eagerly loaded."""
    result = await db.execute(
        select(ChoreAssignment)
        .where(ChoreAssignment.id == assignment_id)
        .options(
            selectinload(ChoreAssignment.chore).selectinload(Chore.category),
            selectinload(ChoreAssignment.user),
        )
    )
    return result.scalar_one()


def _quest_assigned_notification(user_id: int, chore: Chore) -> Notification:
    """Build a 'quest assigned' notification for the given user."""
    return Notification(
        user_id=user_id,
        type=NotificationType.chore_assigned,
        title="New Quest Assigned!",
        message=f"You've been given a new quest: '{chore.title}' (+{chore.points} XP)",
        reference_type="chore",
        reference_id=chore.id,
    )


# ---------------------------------------------------------------------------
# Categories
# ---------------------------------------------------------------------------

@router.get("/categories", response_model=list[CategoryResponse])
async def list_categories(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(select(ChoreCategory))
    return [CategoryResponse.model_validate(c) for c in result.scalars().all()]


@router.post("/categories", response_model=CategoryResponse, status_code=201)
async def create_category(
    body: CategoryCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_parent),
):
    category = ChoreCategory(
        name=body.name, icon=body.icon, colour=body.colour, is_default=False,
    )
    db.add(category)
    await db.commit()
    await db.refresh(category)
    await ws_manager.broadcast(_CATEGORY_CHANGED, exclude_user=user.id)
    return CategoryResponse.model_validate(category)


@router.put("/categories/{category_id}", response_model=CategoryResponse)
async def update_category(
    category_id: int,
    body: CategoryCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_parent),
):
    result = await db.execute(
        select(ChoreCategory).where(ChoreCategory.id == category_id)
    )
    category = result.scalar_one_or_none()
    if category is None:
        raise HTTPException(status_code=404, detail="Category not found")

    category.name = body.name
    category.icon = body.icon
    category.colour = body.colour
    await db.commit()
    await db.refresh(category)
    await ws_manager.broadcast(_CATEGORY_CHANGED, exclude_user=user.id)
    return CategoryResponse.model_validate(category)


@router.delete("/categories/{category_id}", status_code=204)
async def delete_category(
    category_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_parent),
):
    result = await db.execute(
        select(ChoreCategory).where(ChoreCategory.id == category_id)
    )
    category = result.scalar_one_or_none()
    if category is None:
        raise HTTPException(status_code=404, detail="Category not found")
    if category.is_default:
        raise HTTPException(status_code=400, detail="Cannot delete a default category")

    await db.delete(category)
    await db.commit()
    await ws_manager.broadcast(_CATEGORY_CHANGED, exclude_user=user.id)
    return None


# ---------------------------------------------------------------------------
# Chores CRUD
# ---------------------------------------------------------------------------

@router.get("")
async def list_chores(
    view: str | None = Query(None, description="library | active"),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if user.role in (UserRole.parent, UserRole.admin):
        query = (
            select(Chore)
            .where(Chore.is_active == True)
            .options(selectinload(Chore.category))
            .order_by(DAYPART_SORT_SQL, Chore.sort_order, Chore.title)
        )

        if view == "active":
            query = query.join(
                ChoreAssignmentRule,
                and_(
                    ChoreAssignmentRule.chore_id == Chore.id,
                    ChoreAssignmentRule.is_active == True,
                ),
            ).distinct()

        result = await db.execute(query)
        chores = result.scalars().all()

        # Batch-load rule counts (avoids N+1 per-chore COUNT queries)
        chore_ids = [c.id for c in chores]
        rule_counts: dict[int, int] = {}
        schedule_rules: dict[int, ChoreAssignmentRule] = {}
        if chore_ids:
            count_result = await db.execute(
                select(
                    ChoreAssignmentRule.chore_id,
                    func.count().label("cnt"),
                )
                .where(
                    ChoreAssignmentRule.chore_id.in_(chore_ids),
                    ChoreAssignmentRule.is_active == True,
                )
                .group_by(ChoreAssignmentRule.chore_id)
            )
            rule_counts = {row.chore_id: row.cnt for row in count_result.all()}

            rules_result = await db.execute(
                select(ChoreAssignmentRule)
                .where(
                    ChoreAssignmentRule.chore_id.in_(chore_ids),
                    ChoreAssignmentRule.is_active == True,
                )
                .order_by(ChoreAssignmentRule.id)
            )
            for rule in rules_result.scalars().all():
                schedule_rules.setdefault(rule.chore_id, rule)

        enriched = []
        for c in chores:
            data = ChoreResponse.model_validate(c).model_dump()
            data["assignment_count"] = rule_counts.get(c.id, 0)
            _apply_rule_schedule(data, schedule_rules.get(c.id))
            enriched.append(data)
        return enriched
    else:
        # Kids see only chores assigned to them
        result = await db.execute(
            select(Chore)
            .join(ChoreAssignment, ChoreAssignment.chore_id == Chore.id)
            .where(
                Chore.is_active == True,
                ChoreAssignment.user_id == user.id,
            )
            .options(selectinload(Chore.category))
            .distinct()
            .order_by(DAYPART_SORT_SQL, Chore.sort_order, Chore.title)
        )
        chores = result.scalars().all()

        # Batch-load per-kid photo overrides (avoids N+1 per-chore rule queries)
        chore_ids = [c.id for c in chores]
        photo_overrides: dict[int, bool] = {}
        schedule_rules: dict[int, ChoreAssignmentRule] = {}
        if chore_ids:
            rule_result = await db.execute(
                select(ChoreAssignmentRule).where(
                    ChoreAssignmentRule.chore_id.in_(chore_ids),
                    ChoreAssignmentRule.user_id == user.id,
                    ChoreAssignmentRule.is_active == True,
                )
            )
            for rule in rule_result.scalars().all():
                photo_overrides[rule.chore_id] = rule.requires_photo
                schedule_rules[rule.chore_id] = rule

        enriched = []
        for c in chores:
            data = ChoreResponse.model_validate(c).model_dump()
            if c.id in photo_overrides:
                data["requires_photo"] = photo_overrides[c.id]
            _apply_rule_schedule(data, schedule_rules.get(c.id))
            enriched.append(data)
        return enriched


@router.post("", response_model=ChoreResponse, status_code=201)
async def create_chore(
    body: ChoreCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_parent),
):
    cat_result = await db.execute(
        select(ChoreCategory).where(ChoreCategory.id == body.category_id)
    )
    if cat_result.scalar_one_or_none() is None:
        raise HTTPException(status_code=404, detail="Category not found")

    chore = Chore(
        title=body.title,
        description=body.description,
        points=body.points,
        difficulty=body.difficulty,
        icon=body.icon,
        category_id=body.category_id,
        recurrence=body.recurrence,
        custom_days=body.custom_days,
        requires_photo=body.requires_photo,
        daypart=body.daypart,
        sort_order=body.sort_order,
        created_by=user.id,
    )
    db.add(chore)
    await db.flush()

    today = await app_today(db)
    for uid in body.assigned_user_ids:
        u_result = await db.execute(select(User).where(User.id == uid))
        if u_result.scalar_one_or_none() is None:
            raise HTTPException(status_code=400, detail=f"User {uid} not found")
        db.add(ChoreAssignment(chore_id=chore.id, user_id=uid, date=today))
        db.add(_quest_assigned_notification(uid, chore))

    await db.commit()
    chore = await _reload_chore_with_category(db, chore.id)
    await ws_manager.broadcast(_CHORE_CHANGED, exclude_user=user.id)
    return ChoreResponse.model_validate(chore)


@router.post("/cleanup-all-stale")
async def cleanup_all_stale(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_parent),
):
    """Repair planned assignment rows while preserving history and exclusions."""
    today = await app_today(db)

    pending_result = await db.execute(
        select(ChoreAssignment)
        .options(selectinload(ChoreAssignment.chore))
        .where(ChoreAssignment.status == AssignmentStatus.pending)
    )
    pending_assignments = pending_result.scalars().all()

    rules_result = await db.execute(
        select(ChoreAssignmentRule).where(
            ChoreAssignmentRule.is_active == True,
        )
    )
    rules_by_chore: dict[int, list[ChoreAssignmentRule]] = {}
    for rule in rules_result.scalars().all():
        rules_by_chore.setdefault(rule.chore_id, []).append(rule)

    exclusions_result = await db.execute(select(ChoreExclusion))
    exclusion_set = {
        (e.chore_id, e.user_id, e.date)
        for e in exclusions_result.scalars().all()
    }

    rotations_result = await db.execute(select(ChoreRotation))
    rotations_by_chore = {
        rotation.chore_id: rotation
        for rotation in rotations_result.scalars().all()
    }

    removed = 0
    for assignment in pending_assignments:
        rotation = rotations_by_chore.get(assignment.chore_id)
        reference_day = None
        if rotation and rotation.last_rotated:
            reference_day = (
                rotation.last_rotated.date()
                if hasattr(rotation.last_rotated, "date")
                else rotation.last_rotated
            )
        if pending_assignment_is_stale(
            assignment,
            assignment.chore,
            rules_by_chore.get(assignment.chore_id, []),
            exclusion_set=exclusion_set,
            today=today,
            rotation=rotation,
            reference_day=reference_day,
        ):
            await db.delete(assignment)
            removed += 1

    await db.commit()

    plural = "" if removed == 1 else "s"
    return {
        "message": (
            f"Repaired planned calendar: removed {removed} stale pending "
            f"assignment{plural}. Preserved {len(exclusion_set)} exclusions."
        ),
        "pending_removed": removed,
        "exclusions_preserved": len(exclusion_set),
    }


@router.get("/{chore_id}", response_model=ChoreResponse)
async def get_chore(
    chore_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    chore = await _get_chore_or_404(db, chore_id, load_category=True)
    data = ChoreResponse.model_validate(chore).model_dump()
    rule_query = select(ChoreAssignmentRule).where(
        ChoreAssignmentRule.chore_id == chore_id,
        ChoreAssignmentRule.is_active == True,
    )
    if user.role == UserRole.kid:
        rule_query = rule_query.where(ChoreAssignmentRule.user_id == user.id)
    rule_query = rule_query.order_by(ChoreAssignmentRule.id)
    rule_result = await db.execute(rule_query)
    _apply_rule_schedule(data, rule_result.scalars().first())
    return data


@router.get("/{chore_id}/assignments", response_model=list[AssignmentResponse])
async def get_chore_assignments(
    chore_id: int,
    past_days: int = Query(14, ge=0, le=90),
    future_days: int = Query(28, ge=0, le=90),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    await _get_chore_or_404(db, chore_id)

    today = await app_today(db)
    start_date = today - timedelta(days=past_days)
    end_date = today + timedelta(days=future_days)

    current_week_start = monday_week_start(today)
    for week_start in monday_week_starts_to_generate(today, end_date):
        await auto_generate_week_assignments(
            db,
            week_start,
            start_date=today if week_start == current_week_start else None,
        )

    stmt = (
        select(ChoreAssignment)
        .join(Chore, ChoreAssignment.chore_id == Chore.id)
        .options(
            selectinload(ChoreAssignment.chore).selectinload(Chore.category),
            selectinload(ChoreAssignment.user),
        )
        .where(
            ChoreAssignment.chore_id == chore_id,
            ChoreAssignment.date >= start_date,
            ChoreAssignment.date <= end_date,
            Chore.is_active == True,
        )
        .order_by(ChoreAssignment.date, ChoreAssignment.id)
    )
    if user.role == UserRole.kid:
        stmt = stmt.where(ChoreAssignment.user_id == user.id)

    result = await db.execute(stmt)
    return [AssignmentResponse.model_validate(a) for a in result.scalars().all()]


@router.put("/{chore_id}", response_model=ChoreResponse)
async def update_chore(
    chore_id: int,
    body: ChoreUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_parent),
):
    chore = await _get_chore_or_404(db, chore_id, load_category=True)

    update_data = body.model_dump(exclude_unset=True)
    assigned_user_ids = update_data.pop("assigned_user_ids", None)

    for field, value in update_data.items():
        setattr(chore, field, value)
    chore.updated_at = datetime.now(timezone.utc)

    newly_assigned = []
    if assigned_user_ids is not None:
        today = await app_today(db)
        for uid in assigned_user_ids:
            existing = await db.execute(
                select(ChoreAssignment).where(
                    ChoreAssignment.chore_id == chore_id,
                    ChoreAssignment.user_id == uid,
                    ChoreAssignment.date == today,
                )
            )
            if existing.scalar_one_or_none() is None:
                db.add(ChoreAssignment(chore_id=chore_id, user_id=uid, date=today))
                newly_assigned.append(uid)

        # Remove pending assignments for kids no longer in the list
        stale = await db.execute(
            select(ChoreAssignment).where(
                ChoreAssignment.chore_id == chore_id,
                ChoreAssignment.date == today,
                ChoreAssignment.status == AssignmentStatus.pending,
                ChoreAssignment.user_id.notin_(assigned_user_ids),
            )
        )
        for old in stale.scalars().all():
            await db.delete(old)

    for uid in newly_assigned:
        db.add(_quest_assigned_notification(uid, chore))

    await db.commit()
    chore = await _reload_chore_with_category(db, chore.id)
    await ws_manager.broadcast(_CHORE_CHANGED, exclude_user=user.id)
    return ChoreResponse.model_validate(chore)


@router.delete("/{chore_id}", status_code=204)
async def delete_chore(
    chore_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_parent),
):
    chore = await _get_chore_or_404(db, chore_id)
    chore.is_active = False
    chore.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await ws_manager.broadcast(_CHORE_CHANGED, exclude_user=user.id)
    return None


# ---------------------------------------------------------------------------
# Assignment Rules
# ---------------------------------------------------------------------------

@router.get("/{chore_id}/rules", response_model=list[AssignmentRuleResponse])
async def get_assignment_rules(
    chore_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_parent),
):
    result = await db.execute(
        select(ChoreAssignmentRule)
        .where(ChoreAssignmentRule.chore_id == chore_id)
        .options(selectinload(ChoreAssignmentRule.user))
    )
    return [AssignmentRuleResponse.model_validate(r) for r in result.scalars().all()]


@router.get("/{chore_id}/rotation")
async def get_chore_rotation(
    chore_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_parent),
):
    result = await db.execute(
        select(ChoreRotation).where(ChoreRotation.chore_id == chore_id)
    )
    rotation = result.scalar_one_or_none()
    if rotation is None:
        return None
    return RotationResponse.model_validate(rotation)


@router.post("/{chore_id}/assign", status_code=201)
async def assign_chore(
    chore_id: int,
    body: ChoreAssignRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_parent),
):
    chore = await _get_chore_or_404(db, chore_id)

    today = await app_today(db)
    assignments = [
        _schedule_from_assignment_item(item, today)
        for item in body.assignments
    ]
    submitted_user_ids = {item["user_id"] for item in assignments}

    # Deactivate rules for kids NOT in the submitted list
    existing_rules_result = await db.execute(
        select(ChoreAssignmentRule).where(
            ChoreAssignmentRule.chore_id == chore_id,
            ChoreAssignmentRule.is_active == True,
        )
    )
    removed_user_ids = set()
    for existing_rule in existing_rules_result.scalars().all():
        if existing_rule.user_id not in submitted_user_ids:
            existing_rule.is_active = False
            removed_user_ids.add(existing_rule.user_id)

    # Remove all pending assignments (today and future) for unassigned kids,
    # so that calendar entries are cleaned up when a recurring quest is unassigned.
    if removed_user_ids:
        stale_assignments = await db.execute(
            select(ChoreAssignment).where(
                ChoreAssignment.chore_id == chore_id,
                ChoreAssignment.date >= today,
                ChoreAssignment.status == AssignmentStatus.pending,
                ChoreAssignment.user_id.in_(removed_user_ids),
            )
        )
        for stale in stale_assignments.scalars().all():
            await db.delete(stale)

    # Handle rotation
    rotation_active = (
        body.rotation
        and body.rotation.enabled
        and len(assignments) >= 2
    )
    rot_result = await db.execute(
        select(ChoreRotation).where(ChoreRotation.chore_id == chore_id)
    )
    existing_rotation = rot_result.scalar_one_or_none()

    if rotation_active:
        kid_ids = [a["user_id"] for a in assignments]
        if existing_rotation:
            existing_rotation.kid_ids = kid_ids
            existing_rotation.cadence = body.rotation.cadence
            existing_rotation.current_index = 0
            existing_rotation.last_rotated = datetime.now(timezone.utc)
        else:
            existing_rotation = ChoreRotation(
                chore_id=chore_id,
                kid_ids=kid_ids,
                cadence=body.rotation.cadence,
                current_index=0,
                last_rotated=datetime.now(timezone.utc),
            )
            db.add(existing_rotation)
            await db.flush()

        # Compute active weekdays for occurrence-based rotation projection
        active_weekdays = _active_weekdays_for_schedule_items(assignments)

        # Clean stale pending assignments that don't match the new rotation
        stale_result = await db.execute(
            select(ChoreAssignment).where(
                ChoreAssignment.chore_id == chore_id,
                ChoreAssignment.date >= today,
                ChoreAssignment.status == AssignmentStatus.pending,
            )
        )
        removed = 0
        for sa in stale_result.scalars().all():
            expected_kid = get_rotation_kid_for_day(
                existing_rotation, sa.date, today, active_weekdays,
            )
            if int(sa.user_id) != expected_kid:
                await db.delete(sa)
                removed += 1
        logger.debug(
            "Cleaned %d stale pending assignments from %s onward", removed, today,
        )

        # Clear exclusions so auto-gen can recreate the new rotation pattern
        excl_result = await db.execute(
            select(ChoreExclusion).where(
                ChoreExclusion.chore_id == chore_id,
                ChoreExclusion.date >= today,
            )
        )
        excl_count = 0
        for exc in excl_result.scalars().all():
            await db.delete(exc)
            excl_count += 1
        if excl_count:
            logger.debug("Cleared %d exclusions from %s onward", excl_count, today)

    elif existing_rotation:
        await db.delete(existing_rotation)
        existing_rotation = None

    # Determine the rotation kid for today
    rotation_kid_id = None
    if rotation_active and existing_rotation and existing_rotation.kid_ids:
        rotation_kid_id = existing_rotation.kid_ids[existing_rotation.current_index]

    removed_stale = await _remove_stale_pending_assignments_for_schedule(
        db,
        chore,
        assignments,
        existing_rotation if rotation_active else None,
        today,
    )
    if removed_stale:
        logger.debug(
            "Removed %d stale pending assignments for chore=%d after schedule update",
            removed_stale,
            chore_id,
        )

    for item in assignments:
        # Verify kid exists
        kid_result = await db.execute(select(User).where(User.id == item["user_id"]))
        if kid_result.scalar_one_or_none() is None:
            raise HTTPException(status_code=400, detail=f"User {item['user_id']} not found")

        # Upsert assignment rule
        existing = await db.execute(
            select(ChoreAssignmentRule).where(
                ChoreAssignmentRule.chore_id == chore_id,
                ChoreAssignmentRule.user_id == item["user_id"],
            )
        )
        rule = existing.scalar_one_or_none()
        if rule:
            rule.recurrence = item["recurrence"]
            rule.custom_days = item["custom_days"]
            rule.schedule_type = item["schedule_type"]
            rule.start_date = item["start_date"]
            rule.weekdays = item["weekdays"]
            rule.month_day = item["month_day"]
            rule.requires_photo = item["requires_photo"]
            rule.is_optional = item["is_optional"]
            rule.is_active = True
        else:
            rule = ChoreAssignmentRule(
                chore_id=chore_id,
                user_id=item["user_id"],
                recurrence=item["recurrence"],
                custom_days=item["custom_days"],
                schedule_type=item["schedule_type"],
                start_date=item["start_date"],
                weekdays=item["weekdays"],
                month_day=item["month_day"],
                requires_photo=item["requires_photo"],
                is_optional=item["is_optional"],
                is_active=True,
            )
            db.add(rule)

        # Create today's assignment if schedule matches
        create_today = _schedule_item_runs_on_day(item, chore, today)

        # Rotation filtering: only the current rotation kid gets today's assignment
        if create_today and rotation_kid_id is not None:
            if int(item["user_id"]) != int(rotation_kid_id):
                create_today = False

        if create_today:
            existing_assignment_result = await db.execute(
                select(ChoreAssignment).where(
                    ChoreAssignment.chore_id == chore_id,
                    ChoreAssignment.user_id == item["user_id"],
                    ChoreAssignment.date == today,
                )
            )
            existing_assignment = existing_assignment_result.scalar_one_or_none()
            if existing_assignment is None:
                db.add(ChoreAssignment(
                    chore_id=chore_id,
                    user_id=item["user_id"],
                    date=today,
                    status=AssignmentStatus.pending,
                    is_optional=item["is_optional"],
                ))
            elif existing_assignment.status == AssignmentStatus.pending:
                existing_assignment.is_optional = item["is_optional"]
            elif existing_assignment.status in (
                AssignmentStatus.completed,
                AssignmentStatus.verified,
                AssignmentStatus.skipped,
            ):
                # Re-assigning a quest that was already completed/verified/skipped
                # today: reset it to pending so the kid sees it again.
                existing_assignment.status = AssignmentStatus.pending
                existing_assignment.completed_at = None
                existing_assignment.verified_at = None
                existing_assignment.verified_by = None
                existing_assignment.is_optional = item["is_optional"]
                existing_assignment.updated_at = datetime.now(timezone.utc)

        db.add(_quest_assigned_notification(item["user_id"], chore))

    # Sync the chore-level recurrence with the assignment rules so the
    # quest list / detail pages display the correct schedule.
    if assignments:
        first = assignments[0]
        chore.recurrence = first["recurrence"]
        chore.custom_days = first["custom_days"]
    elif not assignments:
        # All kids unassigned — reset to once
        chore.recurrence = Recurrence.once
        chore.custom_days = None

    await db.commit()
    await ws_manager.broadcast(_CHORE_CHANGED, exclude_user=user.id)

    count = len(assignments)
    if count == 0:
        return {"message": "All heroes unassigned from this quest"}
    return {"message": f"Quest assigned to {count} hero(es)"}


@router.get("/{chore_id}/debug")
async def debug_chore(
    chore_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_parent),
):
    """Debug endpoint: show all DB state for a chore's rotation/assignments."""
    chore = await _get_chore_or_404(db, chore_id, active_only=False)

    rot_result = await db.execute(
        select(ChoreRotation).where(ChoreRotation.chore_id == chore_id)
    )
    rotation = rot_result.scalar_one_or_none()

    rules_result = await db.execute(
        select(ChoreAssignmentRule).where(ChoreAssignmentRule.chore_id == chore_id)
    )
    rules = rules_result.scalars().all()

    today = await app_today(db)
    week_start = today - timedelta(days=today.weekday())
    week_end = week_start + timedelta(days=6)

    assign_result = await db.execute(
        select(ChoreAssignment)
        .where(
            ChoreAssignment.chore_id == chore_id,
            ChoreAssignment.date >= week_start,
            ChoreAssignment.date <= week_end,
        )
        .order_by(ChoreAssignment.date)
    )
    assignments = assign_result.scalars().all()

    excl_result = await db.execute(
        select(ChoreExclusion).where(
            ChoreExclusion.chore_id == chore_id,
            ChoreExclusion.date >= week_start,
            ChoreExclusion.date <= week_end,
        )
    )
    exclusions = excl_result.scalars().all()

    return {
        "chore": {
            "id": chore.id,
            "title": chore.title,
            "is_active": chore.is_active,
            "recurrence": chore.recurrence.value,
        },
        "rotation": {
            "id": rotation.id,
            "kid_ids": rotation.kid_ids,
            "kid_ids_types": [type(k).__name__ for k in rotation.kid_ids] if rotation.kid_ids else [],
            "cadence": rotation.cadence.value if rotation.cadence else None,
            "current_index": rotation.current_index,
            "last_rotated": str(rotation.last_rotated) if rotation.last_rotated else None,
        } if rotation else None,
        "rules": [
            {
                "id": r.id,
                "user_id": r.user_id,
                "recurrence": r.recurrence.value,
                "is_active": r.is_active,
                "is_optional": r.is_optional,
            }
            for r in rules
        ],
        "assignments_this_week": [
            {
                "id": a.id,
                "user_id": a.user_id,
                "date": a.date.isoformat(),
                "status": a.status.value if a.status else None,
                "is_optional": a.is_optional,
            }
            for a in assignments
        ],
        "exclusions_this_week": [
            {
                "chore_id": e.chore_id,
                "user_id": e.user_id,
                "date": e.date.isoformat(),
            }
            for e in exclusions
        ],
        "server_today": today.isoformat(),
        "week_start": week_start.isoformat(),
    }


@router.put("/rules/{rule_id}", response_model=AssignmentRuleResponse)
async def update_assignment_rule(
    rule_id: int,
    body: AssignmentRuleUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_parent),
):
    result = await db.execute(
        select(ChoreAssignmentRule)
        .where(ChoreAssignmentRule.id == rule_id)
        .options(selectinload(ChoreAssignmentRule.user))
    )
    rule = result.scalar_one_or_none()
    if not rule:
        raise HTTPException(status_code=404, detail="Assignment rule not found")

    update_data = body.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(rule, field, value)

    if "is_optional" in update_data:
        today = await app_today(db)
        pending_result = await db.execute(
            select(ChoreAssignment).where(
                ChoreAssignment.chore_id == rule.chore_id,
                ChoreAssignment.user_id == rule.user_id,
                ChoreAssignment.date >= today,
                ChoreAssignment.status == AssignmentStatus.pending,
            )
        )
        for assignment in pending_result.scalars().all():
            assignment.is_optional = rule.is_optional

    await db.commit()
    await db.refresh(rule)
    await ws_manager.broadcast(_CHORE_CHANGED, exclude_user=user.id)
    return AssignmentRuleResponse.model_validate(rule)


@router.delete("/rules/{rule_id}", status_code=204)
async def delete_assignment_rule(
    rule_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_parent),
):
    result = await db.execute(
        select(ChoreAssignmentRule).where(ChoreAssignmentRule.id == rule_id)
    )
    rule = result.scalar_one_or_none()
    if not rule:
        raise HTTPException(status_code=404, detail="Assignment rule not found")

    rule.is_active = False
    await db.commit()
    await ws_manager.broadcast(_CHORE_CHANGED, exclude_user=user.id)
    return None


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
    await ws_manager.broadcast(_CHORE_CHANGED, exclude_user=user.id)

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


# ---------------------------------------------------------------------------
# Chore Lifecycle (complete / verify / uncomplete / skip)
# ---------------------------------------------------------------------------

@router.post("/{chore_id}/complete", response_model=AssignmentResponse)
async def complete_chore(
    chore_id: int,
    file: UploadFile | None = File(None),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    today = await app_today(db)
    now = datetime.now(timezone.utc)

    result = await db.execute(
        select(ChoreAssignment)
        .where(
            ChoreAssignment.chore_id == chore_id,
            ChoreAssignment.user_id == user.id,
            ChoreAssignment.date == today,
            ChoreAssignment.status == AssignmentStatus.pending,
        )
        .options(selectinload(ChoreAssignment.chore))
    )
    assignment = result.scalar_one_or_none()
    if assignment is None:
        raise HTTPException(
            status_code=404,
            detail="No pending assignment found for this chore today",
        )

    chore = assignment.chore

    # Determine if photo is required: per-kid rule overrides chore-level
    requires_photo = chore.requires_photo
    rule_result = await db.execute(
        select(ChoreAssignmentRule).where(
            ChoreAssignmentRule.chore_id == chore_id,
            ChoreAssignmentRule.user_id == user.id,
            ChoreAssignmentRule.is_active == True,
        )
    )
    rule = rule_result.scalar_one_or_none()
    if rule is not None:
        requires_photo = rule.requires_photo

    if requires_photo and (file is None or (hasattr(file, "size") and file.size == 0)):
        raise HTTPException(
            status_code=400,
            detail="Photo proof is required for this quest. Please attach a photo.",
        )

    # Save photo proof if provided
    if file and file.size and file.size > 0:
        allowed_types = {"image/jpeg", "image/png", "image/gif", "image/webp"}
        if file.content_type not in allowed_types:
            raise HTTPException(status_code=400, detail="Invalid file type. Allowed: JPEG, PNG, GIF, WebP")
        contents = await file.read()
        max_size = settings.MAX_UPLOAD_SIZE_MB * 1024 * 1024
        if len(contents) > max_size:
            raise HTTPException(status_code=400, detail=f"File too large. Max {settings.MAX_UPLOAD_SIZE_MB}MB")
        upload_dir = "/app/data/uploads"
        os.makedirs(upload_dir, exist_ok=True)
        ext = os.path.splitext(file.filename or "photo.jpg")[1] or ".jpg"
        filename = f"{uuid.uuid4().hex}{ext}"
        filepath = os.path.join(upload_dir, filename)
        with open(filepath, "wb") as f:
            f.write(contents)
        assignment.photo_proof_path = filename

    assignment.status = AssignmentStatus.completed
    assignment.completed_at = now
    assignment.updated_at = now

    await db.commit()

    # Notify parents for approval
    parent_result = await db.execute(
        select(User.id).where(
            User.role.in_([UserRole.parent, UserRole.admin]),
            User.is_active == True,
        )
    )
    parent_ids = [row[0] for row in parent_result.all()]

    await ws_manager.send_to_parents(
        {
            "type": "chore_completed",
            "data": {
                "chore_id": chore.id,
                "chore_title": chore.title,
                "user_id": user.id,
                "user_display_name": user.display_name,
                "points": chore.points,
                "assignment_id": assignment.id,
            },
        },
        parent_ids,
    )

    for pid in parent_ids:
        db.add(Notification(
            user_id=pid,
            type=NotificationType.chore_completed,
            title="Quest Awaiting Approval",
            message=f"{user.display_name} completed '{chore.title}' - tap to approve (+{chore.points} XP)",
            reference_type="chore_assignment",
            reference_id=assignment.id,
        ))
    await db.commit()

    assignment = await _reload_assignment_with_relations(db, assignment.id)
    return AssignmentResponse.model_validate(assignment)


async def _load_assignment_for_action(
    db: AsyncSession,
    assignment_id: int,
) -> ChoreAssignment:
    result = await db.execute(
        select(ChoreAssignment)
        .where(ChoreAssignment.id == assignment_id)
        .options(
            selectinload(ChoreAssignment.chore),
            selectinload(ChoreAssignment.user),
        )
    )
    assignment = result.scalar_one_or_none()
    if assignment is None:
        raise HTTPException(status_code=404, detail="Assignment not found")
    return assignment


async def _deactivate_one_time_rule_if_needed(
    db: AsyncSession,
    assignment: ChoreAssignment,
) -> None:
    rule_result = await db.execute(
        select(ChoreAssignmentRule).where(
            ChoreAssignmentRule.chore_id == assignment.chore_id,
            ChoreAssignmentRule.user_id == assignment.user_id,
            ChoreAssignmentRule.is_active == True,
        )
    )
    rule = rule_result.scalar_one_or_none()
    if not rule:
        return

    rule_schedule_type = _value(rule.schedule_type)
    if (
        rule_schedule_type == "once"
        or (rule_schedule_type is None and rule.recurrence == Recurrence.once)
    ):
        rule.is_active = False


async def _approve_assignment(
    db: AsyncSession,
    assignment: ChoreAssignment,
    parent: User,
) -> AssignmentResponse:
    if assignment.status != AssignmentStatus.completed:
        raise HTTPException(
            status_code=400,
            detail="Only completed assignments can be approved",
        )

    now = datetime.now(timezone.utc)
    today = await app_today(db)
    chore = assignment.chore
    base_points = chore.points

    assignment.status = AssignmentStatus.verified
    assignment.verified_at = now
    assignment.verified_by = parent.id
    assignment.updated_at = now

    # Calculate event multiplier (use naive UTC to match SQLite storage)
    now_naive = now.replace(tzinfo=None)
    ev_result = await db.execute(
        select(SeasonalEvent).where(
            SeasonalEvent.is_active == True,
            SeasonalEvent.start_date <= now_naive,
            SeasonalEvent.end_date >= now_naive,
        )
    )
    active_events = ev_result.scalars().all()

    multiplier = 1.0
    for event in active_events:
        multiplier *= event.multiplier

    db.add(PointTransaction(
        user_id=assignment.user_id,
        amount=base_points,
        type=PointType.chore_complete,
        description=f"Completed: {chore.title}",
        reference_id=assignment.id,
    ))
    total_awarded = base_points

    if multiplier > 1.0:
        bonus_points = int(base_points * multiplier) - base_points
        if bonus_points > 0:
            event_names = ", ".join(e.title for e in active_events)
            db.add(PointTransaction(
                user_id=assignment.user_id,
                amount=bonus_points,
                type=PointType.event_multiplier,
                description=f"Event bonus ({event_names}): {chore.title}",
                reference_id=assignment.id,
            ))
            total_awarded += bonus_points

    kid_result = await db.execute(select(User).where(User.id == assignment.user_id))
    kid = kid_result.scalar_one()

    kid.points_balance += total_awarded
    kid.total_points_earned += total_awarded

    from backend.services.pet_leveling import award_pet_xp_db
    pet_levelup = await award_pet_xp_db(db, kid, total_awarded)
    if pet_levelup:
        db.add(Notification(
            user_id=kid.id,
            type=NotificationType.pet_levelup,
            title="Pet Leveled Up!",
            message=f"Your pet reached level {pet_levelup['new_level']} — {pet_levelup['name']}!",
            reference_type="pet",
        ))

    if assignment_completion_advances_streak(assignment):
        if kid.last_streak_date == today:
            pass
        elif kid.last_streak_date is not None:
            gap = (today - kid.last_streak_date).days
            if gap == 1:
                kid.current_streak += 1
                kid.last_streak_date = today
            elif gap > 1:
                if await gap_preserves_streak(
                    db, kid.id, kid.last_streak_date, today
                ):
                    kid.current_streak += 1
                    kid.last_streak_date = today
                else:
                    current_month = today.month + today.year * 12
                    freeze_month = kid.streak_freeze_month or 0
                    if kid.current_streak > 0 and freeze_month != current_month:
                        kid.streak_freezes_used = (kid.streak_freezes_used or 0) + 1
                        kid.streak_freeze_month = current_month
                        kid.current_streak += 1
                        kid.last_streak_date = today
                    else:
                        kid.current_streak = 1
                        kid.last_streak_date = today
            else:
                kid.current_streak = 1
                kid.last_streak_date = today
        else:
            kid.current_streak = 1
            kid.last_streak_date = today

        if kid.current_streak > kid.longest_streak:
            kid.longest_streak = kid.current_streak

        _STREAK_MILESTONES = (7, 30, 100)
        if kid.current_streak in _STREAK_MILESTONES:
            db.add(Notification(
                user_id=kid.id,
                type=NotificationType.streak_milestone,
                title=f"{kid.current_streak}-Day Streak!",
                message=f"You've completed quests {kid.current_streak} days in a row! Keep it up!",
                reference_type="streak",
            ))

    await db.commit()
    await check_achievements(db, kid)
    await _deactivate_one_time_rule_if_needed(db, assignment)

    db.add(Notification(
        user_id=assignment.user_id,
        type=NotificationType.chore_verified,
        title="Quest Approved!",
        message=f"'{chore.title}' was approved! You earned {total_awarded} XP!",
        reference_type="chore_assignment",
        reference_id=assignment.id,
    ))
    await db.commit()

    from backend.routers.avatar import try_quest_drop
    drop = await try_quest_drop(db, kid, chore.difficulty.value)
    if drop:
        await db.commit()

    ws_data = {
        "chore_id": chore.id,
        "chore_title": chore.title,
        "points": total_awarded,
        "assignment_id": assignment.id,
    }
    if drop:
        ws_data["avatar_drop"] = drop

    await ws_manager.send_to_user(
        assignment.user_id,
        {"type": "chore_verified", "data": ws_data},
    )
    await ws_manager.broadcast(_CHORE_CHANGED, exclude_user=parent.id)

    assignment = await _reload_assignment_with_relations(db, assignment.id)
    return AssignmentResponse.model_validate(assignment)


async def _mark_assignment_needs_work(
    db: AsyncSession,
    assignment: ChoreAssignment,
    parent: User,
) -> AssignmentResponse:
    if assignment.status not in (AssignmentStatus.completed, AssignmentStatus.verified):
        raise HTTPException(
            status_code=400,
            detail="Only completed or approved assignments can be sent back",
        )

    now = datetime.now(timezone.utc)
    assigned_user_id = assignment.user_id

    tx_result = await db.execute(
        select(PointTransaction).where(
            PointTransaction.user_id == assigned_user_id,
            PointTransaction.reference_id == assignment.id,
            PointTransaction.type.in_(
                [PointType.chore_complete, PointType.event_multiplier]
            ),
        )
    )
    transactions = tx_result.scalars().all()
    total_deducted = sum(tx.amount for tx in transactions)

    assigned_user_result = await db.execute(
        select(User).where(User.id == assigned_user_id)
    )
    assigned_user = assigned_user_result.scalar_one()
    assigned_user.points_balance = max(0, assigned_user.points_balance - total_deducted)

    if total_deducted > 0:
        config = assigned_user.avatar_config or {}
        if config.get("pet") and config["pet"] != "none":
            from backend.services.pet_leveling import (
                get_current_pet_xp, set_current_pet_xp, migrate_pet_xp,
            )
            import json as _json
            config = migrate_pet_xp(config)
            old_pet_xp = get_current_pet_xp(config)
            new_pet_xp = max(0, old_pet_xp - total_deducted)
            set_current_pet_xp(config, new_pet_xp)
            await db.execute(
                text("UPDATE users SET avatar_config = :config WHERE id = :uid"),
                {"config": _json.dumps(config), "uid": assigned_user.id},
            )
            assigned_user.avatar_config = config

    for tx in transactions:
        await db.delete(tx)

    assignment.status = AssignmentStatus.pending
    assignment.completed_at = None
    assignment.verified_at = None
    assignment.verified_by = None
    assignment.updated_at = now

    await db.commit()
    assignment = await _reload_assignment_with_relations(db, assignment.id)
    await ws_manager.broadcast(_CHORE_CHANGED, exclude_user=parent.id)
    return AssignmentResponse.model_validate(assignment)


async def _skip_assignment(
    db: AsyncSession,
    assignment: ChoreAssignment,
    parent: User,
) -> AssignmentResponse:
    if assignment.status != AssignmentStatus.pending:
        raise HTTPException(
            status_code=400,
            detail="Only pending assignments can be skipped",
        )

    now = datetime.now(timezone.utc)
    assignment.status = AssignmentStatus.skipped
    assignment.updated_at = now
    await db.commit()

    await ws_manager.broadcast(_CHORE_CHANGED, exclude_user=parent.id)
    assignment = await _reload_assignment_with_relations(db, assignment.id)
    return AssignmentResponse.model_validate(assignment)


async def _load_today_assignment_for_chore_action(
    db: AsyncSession,
    chore_id: int,
    statuses: list[AssignmentStatus],
    not_found_detail: str,
) -> ChoreAssignment:
    today = await app_today(db)
    result = await db.execute(
        select(ChoreAssignment)
        .where(
            ChoreAssignment.chore_id == chore_id,
            ChoreAssignment.date == today,
            ChoreAssignment.status.in_(statuses),
        )
        .options(
            selectinload(ChoreAssignment.chore).selectinload(Chore.category),
            selectinload(ChoreAssignment.user),
        )
        .order_by(ChoreAssignment.id)
    )
    assignment = result.scalars().first()
    if assignment is None:
        raise HTTPException(status_code=404, detail=not_found_detail)
    return assignment


@router.post("/assignments/{assignment_id}/approve", response_model=AssignmentResponse)
async def approve_assignment(
    assignment_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_parent),
):
    assignment = await _load_assignment_for_action(db, assignment_id)
    return await _approve_assignment(db, assignment, user)


@router.post("/assignments/{assignment_id}/needs-work", response_model=AssignmentResponse)
async def mark_assignment_needs_work(
    assignment_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_parent),
):
    assignment = await _load_assignment_for_action(db, assignment_id)
    return await _mark_assignment_needs_work(db, assignment, user)


@router.post("/assignments/{assignment_id}/skip", response_model=AssignmentResponse)
async def skip_assignment_by_id(
    assignment_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_parent),
):
    assignment = await _load_assignment_for_action(db, assignment_id)
    return await _skip_assignment(db, assignment, user)


@router.post("/assignments/{assignment_id}/verify", response_model=AssignmentResponse)
async def verify_assignment_alias(
    assignment_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_parent),
):
    assignment = await _load_assignment_for_action(db, assignment_id)
    return await _approve_assignment(db, assignment, user)


@router.post("/assignments/{assignment_id}/uncomplete", response_model=AssignmentResponse)
async def uncomplete_assignment_alias(
    assignment_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_parent),
):
    assignment = await _load_assignment_for_action(db, assignment_id)
    return await _mark_assignment_needs_work(db, assignment, user)


@router.post("/{chore_id}/verify", response_model=AssignmentResponse)
async def verify_chore(
    chore_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_parent),
):
    assignment = await _load_today_assignment_for_chore_action(
        db,
        chore_id,
        [AssignmentStatus.completed],
        "No completed assignment found to approve for this chore today",
    )
    return await _approve_assignment(db, assignment, user)


@router.post("/{chore_id}/uncomplete", response_model=AssignmentResponse)
async def uncomplete_chore(
    chore_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_parent),
):
    assignment = await _load_today_assignment_for_chore_action(
        db,
        chore_id,
        [AssignmentStatus.completed, AssignmentStatus.verified],
        "No completed assignment found to send back for this chore today",
    )
    return await _mark_assignment_needs_work(db, assignment, user)


@router.post("/{chore_id}/skip", response_model=AssignmentResponse)
async def skip_chore(
    chore_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_parent),
):
    assignment = await _load_today_assignment_for_chore_action(
        db,
        chore_id,
        [AssignmentStatus.pending],
        "No pending assignment found to skip for this chore today",
    )
    return await _skip_assignment(db, assignment, user)


@router.post("/assignments/{assignment_id}/feedback", response_model=AssignmentResponse)
async def add_quest_feedback(
    assignment_id: int,
    body: QuestFeedbackRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_parent),
):
    """Add parent feedback/comment to a completed or verified assignment."""
    result = await db.execute(
        select(ChoreAssignment)
        .where(ChoreAssignment.id == assignment_id)
        .options(selectinload(ChoreAssignment.chore))
    )
    assignment = result.scalar_one_or_none()
    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found")

    assignment.feedback = body.feedback
    await db.commit()

    # Notify the kid
    chore_title = assignment.chore.title if assignment.chore else "a quest"
    db.add(Notification(
        user_id=assignment.user_id,
        type=NotificationType.quest_feedback,
        title="Quest Feedback",
        message=f"{user.display_name} left feedback on \"{chore_title}\": {body.feedback}",
        reference_type="chore_assignment",
        reference_id=assignment.id,
    ))
    await db.commit()

    assignment = await _reload_assignment_with_relations(db, assignment.id)
    return AssignmentResponse.model_validate(assignment)
