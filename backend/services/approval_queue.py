"""Open approval queue policy shared by parent-facing views."""

from __future__ import annotations

from typing import Iterable, TypeVar

T = TypeVar("T")


def _value(value):
    return value.value if hasattr(value, "value") else value


def _sort_value(value) -> str:
    if value is None:
        return ""
    if hasattr(value, "isoformat"):
        return value.isoformat()
    return str(value)


def _chore_is_active(assignment) -> bool:
    chore = getattr(assignment, "chore", None)
    return bool(getattr(chore, "is_active", True))


def collect_pending_approvals(
    assignments: Iterable[T],
    *,
    kid_id: int | None = None,
    limit: int | None = None,
) -> list[T]:
    """Return completed assignments that still need parent action.

    This deliberately has no date-window parameter: if a row needs parent
    approval, it belongs in the queue whether it is today, last week, or older.
    """
    rows = [
        assignment
        for assignment in assignments
        if _value(getattr(assignment, "status", None)) == "completed"
        and _chore_is_active(assignment)
        and (
            kid_id is None
            or int(getattr(assignment, "user_id")) == int(kid_id)
        )
    ]
    rows.sort(
        key=lambda assignment: (
            _sort_value(getattr(assignment, "date", None)),
            _sort_value(getattr(assignment, "completed_at", None)),
            int(getattr(assignment, "id", 0) or 0),
        )
    )
    return rows[:limit] if limit is not None else rows
