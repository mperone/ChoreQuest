"""Pure helpers for deriving quest streak state from credited family dates."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, timedelta


@dataclass(frozen=True)
class StreakComputation:
    current_streak: int
    last_streak_date: date | None
    freeze_month_used: int | None = None


def _month_key(day: date) -> int:
    return day.year * 12 + day.month


def _gap_days(start: date, end: date):
    current = start + timedelta(days=1)
    while current < end:
        yield current
        current += timedelta(days=1)


def current_streak_from_credit_dates(
    credit_dates,
    *,
    preserved_dates,
    existing_freeze_month: int | None = None,
    can_use_freeze: bool = False,
) -> StreakComputation:
    """Return the active streak run from credited assignment dates.

    Streak length counts credited dates, while vacation/no-quest days can bridge
    gaps without increasing the count.
    """
    dates = sorted({day for day in credit_dates if day is not None})
    if not dates:
        return StreakComputation(current_streak=0, last_streak_date=None)

    preserved = set(preserved_dates)
    latest = dates[-1]
    current_streak = 1
    previous = latest
    freeze_month_used = None
    freeze_month_consumed = None

    for credit_date in reversed(dates[:-1]):
        missing_gap_day = any(
            gap_day not in preserved
            for gap_day in _gap_days(credit_date, previous)
        )
        if missing_gap_day:
            month = _month_key(previous)
            can_apply_existing_freeze = (
                existing_freeze_month == month
                and freeze_month_consumed is None
            )
            can_apply_new_freeze = (
                can_use_freeze
                and freeze_month_used is None
                and existing_freeze_month != month
            )
            if can_apply_existing_freeze:
                freeze_month_consumed = month
            elif can_apply_new_freeze:
                freeze_month_used = month
                freeze_month_consumed = month
            else:
                break

        current_streak += 1
        previous = credit_date

    return StreakComputation(
        current_streak=current_streak,
        last_streak_date=latest,
        freeze_month_used=freeze_month_used,
    )
