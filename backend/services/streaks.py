"""Helpers for deciding whether required quest streaks should continue."""

from datetime import date, timedelta

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.models import AssignmentStatus, Chore, ChoreAssignment
from backend.services.streak_state import (
    StreakComputation,
    current_streak_from_credit_dates,
)


async def has_required_assignments(
    db: AsyncSession,
    user_id: int,
    target_day: date,
) -> bool:
    result = await db.execute(
        select(func.count())
        .select_from(ChoreAssignment)
        .join(Chore, ChoreAssignment.chore_id == Chore.id)
        .where(
            ChoreAssignment.user_id == user_id,
            ChoreAssignment.date == target_day,
            ChoreAssignment.is_optional == False,
            ChoreAssignment.status != AssignmentStatus.skipped,
            Chore.is_active == True,
        )
    )
    return (result.scalar() or 0) > 0


async def day_preserves_streak(
    db: AsyncSession,
    user_id: int,
    target_day: date,
) -> bool:
    from backend.routers.vacation import is_vacation_day

    if await is_vacation_day(db, target_day):
        return True
    return not await has_required_assignments(db, user_id, target_day)


async def gap_preserves_streak(
    db: AsyncSession,
    user_id: int,
    last_streak_date: date,
    today: date,
) -> bool:
    gap = (today - last_streak_date).days
    for offset in range(1, gap):
        gap_day = last_streak_date + timedelta(days=offset)
        if not await day_preserves_streak(db, user_id, gap_day):
            return False
    return True


async def recompute_user_streak(
    db: AsyncSession,
    user,
) -> StreakComputation:
    """Recompute a user's display streak from assignment dates."""
    computation = await calculate_user_streak(
        db,
        user,
        statuses=[AssignmentStatus.completed, AssignmentStatus.verified],
        can_use_freeze=(user.current_streak or 0) > 0,
    )

    user.current_streak = computation.current_streak
    user.last_streak_date = computation.last_streak_date
    if computation.freeze_month_used is not None:
        user.streak_freezes_used = (user.streak_freezes_used or 0) + 1
        user.streak_freeze_month = computation.freeze_month_used
    if user.current_streak > (user.longest_streak or 0):
        user.longest_streak = user.current_streak

    return computation


async def calculate_user_streak(
    db: AsyncSession,
    user,
    *,
    statuses: list[AssignmentStatus],
    can_use_freeze: bool = False,
) -> StreakComputation:
    """Calculate a user's streak for the given assignment statuses."""
    result = await db.execute(
        select(ChoreAssignment.date).where(
            ChoreAssignment.user_id == user.id,
            ChoreAssignment.is_optional == False,
            ChoreAssignment.status.in_(statuses),
        )
    )
    credit_dates = sorted({day for day in result.scalars().all() if day is not None})
    if not credit_dates:
        return StreakComputation(current_streak=0, last_streak_date=None)

    preserved_dates: set[date] = set()
    first = credit_dates[0]
    last = credit_dates[-1]
    for offset in range(1, (last - first).days):
        gap_day = first + timedelta(days=offset)
        if await day_preserves_streak(db, user.id, gap_day):
            preserved_dates.add(gap_day)

    computation = current_streak_from_credit_dates(
        credit_dates,
        preserved_dates=preserved_dates,
        existing_freeze_month=user.streak_freeze_month,
        can_use_freeze=can_use_freeze,
    )
    return computation
