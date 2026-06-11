"""Centralised assignment generation logic.

Used by both the calendar auto-generation endpoint and the daily reset
background task to avoid duplicating the complex scheduling rules.
"""

import logging
from datetime import date, datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.models import (
    Chore,
    ChoreAssignment,
    ChoreAssignmentRule,
    ChoreExclusion,
    ChoreRotation,
    AssignmentStatus,
    Recurrence,
)
from backend.services.recurrence import should_create_on_day
from backend.services.rotation import (
    get_rotation_kid_for_day,
    should_advance_rotation,
    advance_rotation,
)

logger = logging.getLogger(__name__)


def _value(value):
    return value.value if hasattr(value, "value") else value


def _created_at_date(chore: Chore) -> date:
    return chore.created_at.date() if hasattr(chore.created_at, "date") else chore.created_at


def _rule_runs_on_day(rule: ChoreAssignmentRule, chore: Chore, day: date) -> bool:
    return should_create_on_day(
        rule.recurrence,
        day,
        chore.created_at.weekday(),
        rule.custom_days,
        created_at_date=_created_at_date(chore),
        schedule_type=rule.schedule_type,
        start_date=rule.start_date,
        weekdays=rule.weekdays,
        month_day=rule.month_day,
    )


def _rule_active_weekdays(rule: ChoreAssignmentRule, chore: Chore) -> list[int] | None:
    schedule_type = _value(rule.schedule_type)
    if schedule_type in {"daily", "monthly"}:
        return None
    if schedule_type == "once":
        return []
    if schedule_type in {"weekly", "fortnightly"}:
        if rule.weekdays:
            return sorted(set(rule.weekdays))
        if rule.start_date:
            return [rule.start_date.weekday()]
        return [chore.created_at.weekday()]

    if rule.recurrence in (Recurrence.once,):
        return []
    if rule.recurrence == Recurrence.daily:
        return None
    if rule.recurrence == Recurrence.custom and rule.custom_days:
        return sorted(set(rule.custom_days))
    if rule.recurrence in (Recurrence.weekly, Recurrence.fortnightly):
        return [chore.created_at.weekday()]
    return []


async def auto_generate_week_assignments(
    db: AsyncSession, week_start: date, start_date: date | None = None
) -> None:
    """Generate ChoreAssignment records for recurring chores across a week.

    Slots recorded in ``chore_exclusions`` are skipped so that
    intentionally removed assignments are not recreated.

    This function does NOT advance rotations -- it reads the current
    rotation state and projects forward (useful for calendar views).

    When ``start_date`` is provided, only dates on or after that day are
    generated. Calendar views omit this so they can display complete weeks;
    assignment-list views use it to avoid creating stale past rows.
    """
    week_end = week_start + timedelta(days=6)
    week_dates = [week_start + timedelta(days=i) for i in range(7)]
    if start_date is not None:
        week_dates = [d for d in week_dates if d >= start_date]
    if not week_dates:
        return

    # Filter out vacation days from week generation
    from backend.routers.vacation import is_vacation_day
    active_dates = []
    for d in week_dates:
        if not await is_vacation_day(db, d):
            active_dates.append(d)
    week_dates = active_dates
    if not week_dates:
        return

    exclusion_set = await _load_exclusion_set(
        db, min(week_dates), min(week_end, max(week_dates)),
    )

    chores = await _load_active_chores(db)

    for chore in chores:
        rules = await _load_active_rules(db, chore.id)

        if rules:
            rotation = await _load_rotation(db, chore.id)
            await _generate_from_rules(
                db, chore, rules, rotation, week_dates, exclusion_set,
            )
        else:
            await _generate_legacy(db, chore, week_dates, exclusion_set)

    await db.commit()


async def generate_daily_assignments(db: AsyncSession, today: date) -> None:
    """Generate assignments for today with rotation advancement.

    Called by the daily reset background task. Unlike the week-based
    generator, this function advances rotations when their cadence
    period has elapsed.  Rotation is only advanced on days when the
    chore actually has an occurrence so that non-active days (e.g.
    weekends for a Mon-Fri custom schedule) don't waste rotation slots.
    """
    # Check vacation mode — skip generation if today is a vacation day
    from backend.routers.vacation import is_vacation_day
    if await is_vacation_day(db, today):
        logger.info("Skipping assignment generation — vacation day %s", today)
        return

    now = datetime.now(timezone.utc)
    chores = await _load_active_chores(db)

    for chore in chores:
        rules = await _load_active_rules(db, chore.id)

        if rules:
            rotation = await _load_rotation(db, chore.id)

            # Pre-compute which rules fire today so we know whether
            # the chore has an occurrence before advancing rotation.
            active_rules = [
                r for r in rules
                if _rule_runs_on_day(r, chore, today)
            ]

            # Only advance rotation on days the chore actually runs
            if rotation and active_rules and should_advance_rotation(rotation, now):
                advance_rotation(rotation, now)

            for rule in active_rules:
                # Rotation filtering: only generate for the current rotation kid
                if rotation and int(rule.user_id) != int(
                    rotation.kid_ids[rotation.current_index]
                ):
                    continue

                await _create_if_missing(
                    db, chore.id, rule.user_id, today, is_optional=rule.is_optional,
                )
        else:
            # Legacy: chore-level recurrence
            if chore.recurrence == Recurrence.once:
                continue

            if not should_create_on_day(
                chore.recurrence, today, chore.created_at.weekday(), chore.custom_days,
                created_at_date=chore.created_at.date() if hasattr(chore.created_at, 'date') else chore.created_at,
            ):
                continue

            rotation = await _load_rotation(db, chore.id)
            if rotation:
                if should_advance_rotation(rotation, now):
                    advance_rotation(rotation, now)
                user_ids = [rotation.kid_ids[rotation.current_index]]
            else:
                user_ids = await _get_legacy_user_ids(db, chore.id)

            for uid in user_ids:
                await _create_if_missing(db, chore.id, uid, today)


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


async def _load_active_chores(db: AsyncSession) -> list[Chore]:
    result = await db.execute(select(Chore).where(Chore.is_active == True))
    return list(result.scalars().all())


async def _load_active_rules(
    db: AsyncSession, chore_id: int
) -> list[ChoreAssignmentRule]:
    result = await db.execute(
        select(ChoreAssignmentRule).where(
            ChoreAssignmentRule.chore_id == chore_id,
            ChoreAssignmentRule.is_active == True,
        )
    )
    return list(result.scalars().all())


async def _load_rotation(
    db: AsyncSession, chore_id: int
) -> ChoreRotation | None:
    result = await db.execute(
        select(ChoreRotation).where(ChoreRotation.chore_id == chore_id)
    )
    return result.scalar_one_or_none()


async def _load_exclusion_set(
    db: AsyncSession, start: date, end: date
) -> set[tuple[int, int, date]]:
    result = await db.execute(
        select(ChoreExclusion).where(
            ChoreExclusion.date >= start,
            ChoreExclusion.date <= end,
        )
    )
    return {
        (e.chore_id, e.user_id, e.date) for e in result.scalars().all()
    }


async def _get_legacy_user_ids(db: AsyncSession, chore_id: int) -> list[int]:
    """Fall back to distinct user IDs from past assignments."""
    result = await db.execute(
        select(ChoreAssignment.user_id)
        .where(ChoreAssignment.chore_id == chore_id)
        .distinct()
    )
    return list(result.scalars().all())


async def _remove_stale_rotation_assignment(
    db: AsyncSession, chore_id: int, user_id: int, day: date
) -> None:
    """Delete a pending assignment that shouldn't exist per the rotation.

    Only removes assignments that are still pending — completed or
    verified ones are never touched.
    """
    result = await db.execute(
        select(ChoreAssignment).where(
            ChoreAssignment.chore_id == chore_id,
            ChoreAssignment.user_id == user_id,
            ChoreAssignment.date == day,
            ChoreAssignment.status == AssignmentStatus.pending,
        )
    )
    stale = result.scalar_one_or_none()
    if stale:
        await db.delete(stale)
        logger.debug(
            "Removed stale rotation assignment: chore=%d user=%d day=%s",
            chore_id, user_id, day,
        )


async def _create_if_missing(
    db: AsyncSession,
    chore_id: int,
    user_id: int,
    day: date,
    *,
    is_optional: bool = False,
) -> bool:
    """Create a pending assignment if one doesn't already exist.

    Returns True if a new assignment was created.
    """
    existing = await db.execute(
        select(ChoreAssignment).where(
            ChoreAssignment.chore_id == chore_id,
            ChoreAssignment.user_id == user_id,
            ChoreAssignment.date == day,
        )
    )
    existing_assignment = existing.scalar_one_or_none()
    if existing_assignment is None:
        db.add(
            ChoreAssignment(
                chore_id=chore_id,
                user_id=user_id,
                date=day,
                status=AssignmentStatus.pending,
                is_optional=is_optional,
            )
        )
        logger.debug("Created assignment: chore=%d user=%d day=%s", chore_id, user_id, day)
        return True
    if existing_assignment.status == AssignmentStatus.pending:
        existing_assignment.is_optional = is_optional
    return False


async def _remove_stale_pending_assignments_for_week(
    db: AsyncSession,
    chore: Chore,
    rules: list[ChoreAssignmentRule],
    rotation: ChoreRotation | None,
    week_dates: list[date],
    exclusion_set: set[tuple[int, int, date]],
    active_weekdays: list[int] | None,
    reference_day: date,
) -> None:
    """Remove planned rows that no longer match active rules for this week."""
    if not week_dates:
        return

    start = min(week_dates)
    end = max(week_dates)
    rules_by_user: dict[int, list[ChoreAssignmentRule]] = {}
    for rule in rules:
        rules_by_user.setdefault(rule.user_id, []).append(rule)

    result = await db.execute(
        select(ChoreAssignment).where(
            ChoreAssignment.chore_id == chore.id,
            ChoreAssignment.date >= start,
            ChoreAssignment.date <= end,
            ChoreAssignment.status == AssignmentStatus.pending,
        )
    )

    for assignment in result.scalars().all():
        if (chore.id, assignment.user_id, assignment.date) in exclusion_set:
            await db.delete(assignment)
            continue

        user_rules = rules_by_user.get(assignment.user_id, [])
        should_keep = any(
            _rule_runs_on_day(rule, chore, assignment.date)
            for rule in user_rules
        )

        if should_keep and rotation and rotation.kid_ids:
            expected_kid = get_rotation_kid_for_day(
                rotation, assignment.date, reference_day, active_weekdays,
            )
            should_keep = int(assignment.user_id) == expected_kid

        if not should_keep:
            await db.delete(assignment)


async def _generate_from_rules(
    db: AsyncSession,
    chore: Chore,
    rules: list[ChoreAssignmentRule],
    rotation: ChoreRotation | None,
    week_dates: list[date],
    exclusion_set: set[tuple[int, int, date]],
) -> None:
    """Generate week assignments using per-kid assignment rules."""
    active_weekdays = _collect_active_weekdays(rules, chore) if rotation else None

    # Anchor the projection to when current_index was last set, NOT today.
    # This keeps the calendar consistent regardless of whether the daily
    # reset task has advanced the rotation yet (e.g. after container restart).
    if rotation and rotation.last_rotated:
        lr = rotation.last_rotated
        reference_day = lr.date() if hasattr(lr, "date") else lr
    else:
        reference_day = date.today()

    await _remove_stale_pending_assignments_for_week(
        db,
        chore,
        rules,
        rotation,
        week_dates,
        exclusion_set,
        active_weekdays,
        reference_day,
    )

    for rule in rules:
        for day in week_dates:
            if not _rule_runs_on_day(rule, chore, day):
                continue

            # Rotation filtering
            if rotation and rotation.kid_ids:
                expected_kid = get_rotation_kid_for_day(
                    rotation, day, reference_day, active_weekdays,
                )
                if int(rule.user_id) != expected_kid:
                    # Clean up any stale pending assignment for the wrong kid
                    # on this day (could have been created by a prior buggy run).
                    await _remove_stale_rotation_assignment(
                        db, chore.id, rule.user_id, day,
                    )
                    continue

            if (chore.id, rule.user_id, day) in exclusion_set:
                continue

            await _create_if_missing(
                db, chore.id, rule.user_id, day, is_optional=rule.is_optional,
            )


def _collect_active_weekdays(
    rules: list[ChoreAssignmentRule], chore: Chore,
) -> list[int] | None:
    """Determine the set of weekdays on which a chore has occurrences.

    Returns ``None`` when the chore runs every day (no filtering needed).
    """
    weekdays: set[int] = set()
    for rule in rules:
        rule_weekdays = _rule_active_weekdays(rule, chore)
        if rule_weekdays is None:
            return None  # Runs every day — calendar-day counting is fine
        weekdays.update(rule_weekdays)
    return sorted(weekdays) if weekdays else None


async def _generate_legacy(
    db: AsyncSession,
    chore: Chore,
    week_dates: list[date],
    exclusion_set: set[tuple[int, int, date]],
) -> None:
    """Generate week assignments using chore-level recurrence (legacy path)."""
    if chore.recurrence == Recurrence.once:
        return

    # Determine assigned user IDs
    rules_result = await db.execute(
        select(ChoreAssignmentRule.user_id).where(
            ChoreAssignmentRule.chore_id == chore.id,
            ChoreAssignmentRule.is_active == True,
        )
    )
    user_ids = list(rules_result.scalars().all())

    if not user_ids:
        rotation = await _load_rotation(db, chore.id)
        if rotation and rotation.kid_ids:
            user_ids = [int(kid_id) for kid_id in rotation.kid_ids]
        else:
            user_ids = await _get_legacy_user_ids(db, chore.id)

    if not user_ids:
        return

    for day in week_dates:
        if not should_create_on_day(
            chore.recurrence, day, chore.created_at.weekday(), chore.custom_days,
            created_at_date=chore.created_at.date() if hasattr(chore.created_at, 'date') else chore.created_at,
        ):
            continue

        for user_id in user_ids:
            if (chore.id, user_id, day) in exclusion_set:
                continue
            await _create_if_missing(db, chore.id, user_id, day)
