"""Assignment state policies used when schedule settings change."""

from __future__ import annotations

from datetime import timezone


def _value(value):
    return value.value if hasattr(value, "value") else value


def should_preserve_on_assignment_save(status) -> bool:
    """Return True when a rule save must not reset an existing row.

    Non-pending rows represent child or parent action. A schedule edit can update
    future planned rows, but it should not erase submitted, approved, or skipped
    history.
    """
    return _value(status) in {"completed", "verified", "skipped"}


def is_one_off_assignment_rule(rule) -> bool:
    """Return True for current and legacy one-time assignment rules."""
    schedule_type = _value(getattr(rule, "schedule_type", None))
    recurrence = _value(getattr(rule, "recurrence", None))
    return schedule_type == "once" or (
        schedule_type is None and recurrence == "once"
    )


def one_off_assignment_keeps_rule_active(status) -> bool:
    """Return True while a one-time assignment still needs user action."""
    return _value(status) in {"pending", "completed"}


def assignment_status_blocks_chore_delete(status) -> bool:
    """Return True when deleting would hide parent action that is still due."""
    return _value(status) == "completed"


def one_off_rule_is_exhausted(
    rule,
    *,
    today,
    has_completed_assignment: bool,
) -> bool:
    """Return True when an active one-time rule has no future work left."""
    if not is_one_off_assignment_rule(rule) or has_completed_assignment:
        return False

    start_date = getattr(rule, "start_date", None)
    return start_date is not None and start_date < today


def streak_credit_date(assignment, *, fallback_date):
    """Return the family date a completed assignment should credit."""
    return getattr(assignment, "date", None) or fallback_date


def _naive_utc(value):
    if getattr(value, "tzinfo", None) is not None:
        return value.astimezone(timezone.utc).replace(tzinfo=None)
    return value


def event_credit_timestamp(assignment, *, fallback):
    """Return the UTC-naive timestamp used for event bonus eligibility."""
    completed_at = getattr(assignment, "completed_at", None)
    return _naive_utc(completed_at or fallback)


def point_totals_after_credit_reversal(
    *,
    points_balance,
    total_points_earned,
    amount,
) -> tuple[int, int]:
    """Return balance and lifetime earned after reversing quest credit."""
    deducted = max(0, int(amount or 0))
    return (
        max(0, int(points_balance or 0) - deducted),
        max(0, int(total_points_earned or 0) - deducted),
    )

