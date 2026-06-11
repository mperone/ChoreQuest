"""Helpers for repairing planned assignment rows without touching history."""

from __future__ import annotations

from datetime import date, timedelta

from backend.services.recurrence import should_create_on_day


def _value(value):
    return value.value if hasattr(value, "value") else value


def _created_at_date(chore) -> date:
    created_at = getattr(chore, "created_at", None)
    return created_at.date() if hasattr(created_at, "date") else created_at


def _rule_runs_on_day(rule, chore, day: date) -> bool:
    return should_create_on_day(
        getattr(rule, "recurrence", None),
        day,
        getattr(chore, "created_at").weekday(),
        getattr(rule, "custom_days", None),
        created_at_date=_created_at_date(chore),
        schedule_type=getattr(rule, "schedule_type", None),
        start_date=getattr(rule, "start_date", None),
        weekdays=getattr(rule, "weekdays", None),
        month_day=getattr(rule, "month_day", None),
    )


def _count_occurrences(start: date, end: date, weekdays: list[int]) -> int:
    if start == end or not weekdays:
        return 0

    forward = end >= start
    a, b = (start, end) if forward else (end, start)
    total_days = (b - a).days
    full_weeks, remaining = divmod(total_days, 7)

    wd_set = set(weekdays)
    count = full_weeks * len(wd_set)
    for i in range(1, remaining + 1):
        if (a + timedelta(days=i)).weekday() in wd_set:
            count += 1

    return count if forward else -count


def _rotation_kid_for_day(
    rotation,
    target_day: date,
    reference_day: date,
    active_weekdays: list[int] | None,
) -> int:
    cadence = _value(getattr(rotation, "cadence", "weekly"))
    if cadence == "daily":
        if active_weekdays is not None:
            offset = _count_occurrences(reference_day, target_day, active_weekdays)
        else:
            offset = (target_day - reference_day).days
        idx = (getattr(rotation, "current_index", 0) + offset) % len(rotation.kid_ids)
    else:
        idx = getattr(rotation, "current_index", 0)
    return int(rotation.kid_ids[idx])


def pending_assignment_is_stale(
    assignment,
    chore,
    rules,
    *,
    exclusion_set: set[tuple[int, int, date]],
    today: date,
    rotation=None,
    reference_day: date | None = None,
    active_weekdays: list[int] | None = None,
) -> bool:
    """Return True when a pending assignment should be removed by repair."""
    status = _value(getattr(assignment, "status", None)) or "pending"
    if status != "pending":
        return False

    if getattr(assignment, "date") < today:
        return True

    chore_id = getattr(assignment, "chore_id")
    user_id = getattr(assignment, "user_id")
    assignment_date = getattr(assignment, "date")
    if (chore_id, user_id, assignment_date) in exclusion_set:
        return True

    if chore is None or not getattr(chore, "is_active", False):
        return True

    user_rules = [rule for rule in rules if getattr(rule, "user_id", None) == user_id]
    if user_rules:
        should_keep = any(_rule_runs_on_day(rule, chore, assignment_date) for rule in user_rules)
        if should_keep and rotation and getattr(rotation, "kid_ids", None):
            expected_kid = _rotation_kid_for_day(
                rotation,
                assignment_date,
                reference_day or today,
                active_weekdays,
            )
            should_keep = int(user_id) == expected_kid
        return not should_keep

    recurrence = _value(getattr(chore, "recurrence", None))
    if recurrence == "once":
        return assignment_date != _created_at_date(chore)

    return not should_create_on_day(
        recurrence,
        assignment_date,
        getattr(chore, "created_at").weekday(),
        getattr(chore, "custom_days", None),
        created_at_date=_created_at_date(chore),
    )
