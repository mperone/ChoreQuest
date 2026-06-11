"""Shared optional-quest policy helpers."""

COMPLETED_STATUSES = {"completed", "verified"}


def _value(value):
    return value.value if hasattr(value, "value") else value


def assignment_is_optional(assignment) -> bool:
    return bool(getattr(assignment, "is_optional", False))


def assignment_counts_for_required_progress(assignment) -> bool:
    return not assignment_is_optional(assignment)


def assignment_completion_advances_streak(assignment) -> bool:
    status = _value(getattr(assignment, "status", None))
    return (
        assignment_counts_for_required_progress(assignment)
        and status in COMPLETED_STATUSES
    )
