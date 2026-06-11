"""Shared recurrence logic for determining when chores should be assigned."""

from __future__ import annotations

import calendar
from datetime import date, timedelta


def _enum_value(value):
    return value.value if hasattr(value, "value") else value


def _week_start(day: date) -> date:
    return day - timedelta(days=day.weekday())


def _normalize_weekdays(weekdays: list[int] | None, start_date: date | None) -> list[int]:
    if weekdays:
        return sorted({day for day in weekdays if isinstance(day, int) and 0 <= day <= 6})
    if start_date is not None:
        return [start_date.weekday()]
    return []


def _last_day_of_month(day: date) -> int:
    return calendar.monthrange(day.year, day.month)[1]


def _normalize_month_day(month_day: int | None, start_date: date | None) -> int | None:
    if month_day == -1:
        return -1
    if isinstance(month_day, int) and 1 <= month_day <= 31:
        return month_day
    if start_date is not None:
        return start_date.day
    return None


def _matches_month_day(target_day: date, month_day: int) -> bool:
    if month_day == -1:
        return target_day.day == _last_day_of_month(target_day)
    return target_day.day == month_day


def should_create_on_day(
    recurrence,
    target_day: date,
    created_at_weekday: int,
    custom_days: list[int] | None = None,
    *,
    created_at_date: date | None = None,
    schedule_type=None,
    start_date: date | None = None,
    weekdays: list[int] | None = None,
    month_day: int | None = None,
) -> bool:
    """Determine whether a chore with the given recurrence schedule
    should have an assignment created on ``target_day``.

    Args:
        recurrence: The recurrence type (once, daily, weekly, fortnightly, custom).
        target_day: The date to evaluate.
        created_at_weekday: Weekday (0=Mon) of the chore's creation date,
            used for weekly and fortnightly recurrence.
        custom_days: List of weekday ints for custom recurrence.
        created_at_date: The actual creation date, required for fortnightly
            to determine even/odd week parity.
    """
    schedule = _enum_value(schedule_type)
    if schedule:
        if start_date is None:
            start_date = created_at_date
        if start_date is None:
            return False
        if target_day < start_date:
            return False

        if schedule == "once":
            return target_day == start_date
        if schedule == "daily":
            return True
        if schedule == "monthly":
            active_month_day = _normalize_month_day(month_day, start_date)
            return (
                active_month_day is not None
                and _matches_month_day(target_day, active_month_day)
            )

        active_weekdays = _normalize_weekdays(weekdays, start_date)
        if target_day.weekday() not in active_weekdays:
            return False
        if schedule == "weekly":
            return True
        if schedule == "fortnightly":
            weeks_diff = (_week_start(target_day) - _week_start(start_date)).days // 7
            return weeks_diff % 2 == 0
        return False

    recurrence_value = _enum_value(recurrence)
    if recurrence_value == "once":
        return created_at_date is None or target_day == created_at_date
    if recurrence_value == "daily":
        return True
    if recurrence_value == "weekly":
        return target_day.weekday() == created_at_weekday
    if recurrence_value == "fortnightly":
        if target_day.weekday() != created_at_weekday:
            return False
        if created_at_date is None:
            return True
        weeks_diff = (target_day - created_at_date).days // 7
        return weeks_diff % 2 == 0
    if recurrence_value == "monthly":
        if created_at_date is not None and target_day < created_at_date:
            return False
        active_month_day = _normalize_month_day(month_day, created_at_date)
        return (
            active_month_day is not None
            and _matches_month_day(target_day, active_month_day)
        )
    if recurrence_value == "custom":
        return bool(custom_days and target_day.weekday() in custom_days)
    return False
