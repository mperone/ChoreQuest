"""Helpers for deciding whether required quest streaks should continue."""

from datetime import date, timedelta

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.models import Chore, ChoreAssignment


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
