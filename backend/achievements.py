from datetime import datetime, date, timezone
from zoneinfo import ZoneInfo
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from backend.models import (
    Achievement, UserAchievement, User, ChoreAssignment, AssignmentStatus,
    PointTransaction, PointType, RewardRedemption, Notification, NotificationType,
)
from backend.websocket_manager import ws_manager
from backend.services.daytime import get_daily_rollover_timezone

RETIRED_ACHIEVEMENT_KEYS = frozenset({
    "pet_youngling",
    "pet_loyal",
    "pet_mighty",
    "pet_legendary",
})
RETIRED_ACHIEVEMENT_CRITERIA_TYPES = frozenset({"pet_level_reached"})


def is_retired_achievement(achievement: Achievement) -> bool:
    criteria = achievement.criteria or {}
    return (
        achievement.key in RETIRED_ACHIEVEMENT_KEYS
        or criteria.get("type") in RETIRED_ACHIEVEMENT_CRITERIA_TYPES
    )


def _as_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


async def _completed_before_local_hour(
    db: AsyncSession,
    completed_at: datetime | None,
    hour: int,
) -> bool:
    if completed_at is None:
        return False
    time_zone = ZoneInfo(await get_daily_rollover_timezone(db))
    local_completed_at = _as_utc(completed_at).astimezone(time_zone)
    return local_completed_at.hour < hour


async def check_achievements(
    db: AsyncSession,
    user: User,
    *,
    activity_date: date | None = None,
):
    result = await db.execute(select(Achievement))
    all_achievements = [
        achievement
        for achievement in result.scalars().all()
        if not is_retired_achievement(achievement)
    ]

    result = await db.execute(
        select(UserAchievement.achievement_id).where(UserAchievement.user_id == user.id)
    )
    unlocked_ids = set(result.scalars().all())

    for achievement in all_achievements:
        if achievement.id in unlocked_ids:
            continue
        if await _check_criteria(
            db,
            user,
            achievement.criteria,
            activity_date=activity_date,
        ):
            await _unlock_achievement(db, user, achievement)


async def _check_criteria(
    db: AsyncSession,
    user: User,
    criteria: dict,
    *,
    activity_date: date | None = None,
) -> bool:
    ctype = criteria.get("type")

    if ctype in RETIRED_ACHIEVEMENT_CRITERIA_TYPES:
        return False

    if ctype == "total_completions":
        result = await db.execute(
            select(func.count()).select_from(ChoreAssignment).where(
                ChoreAssignment.user_id == user.id,
                ChoreAssignment.status == AssignmentStatus.verified,
            )
        )
        count = result.scalar()
        return count >= criteria["count"]

    elif ctype == "consecutive_days_all_complete":
        return user.current_streak >= criteria["days"]

    elif ctype == "total_points_earned":
        return user.total_points_earned >= criteria["amount"]

    elif ctype == "completion_before_time":
        hour = criteria["hour"]
        result = await db.execute(
            select(ChoreAssignment).where(
                ChoreAssignment.user_id == user.id,
                ChoreAssignment.status == AssignmentStatus.verified,
                ChoreAssignment.completed_at.isnot(None),
            )
        )
        for assignment in result.scalars().all():
            if await _completed_before_local_hour(db, assignment.completed_at, hour):
                return True
        return False

    elif ctype == "streak_reached":
        return user.current_streak >= criteria["days"]

    elif ctype == "total_redemptions":
        result = await db.execute(
            select(func.count()).select_from(RewardRedemption).where(
                RewardRedemption.user_id == user.id,
                RewardRedemption.status == "approved",
            )
        )
        count = result.scalar()
        return count >= criteria["count"]

    elif ctype == "all_daily_before_time":
        if activity_date is None:
            return False
        hour = criteria["hour"]
        result = await db.execute(
            select(ChoreAssignment).where(
                ChoreAssignment.user_id == user.id,
                ChoreAssignment.date == activity_date,
                ChoreAssignment.is_optional == False,
                ChoreAssignment.status != AssignmentStatus.skipped,
            )
        )
        assignments = result.scalars().all()
        if not assignments:
            return False
        for a in assignments:
            if a.status != AssignmentStatus.verified:
                return False
            if not await _completed_before_local_hour(db, a.completed_at, hour):
                return False
        return True

    elif ctype == "all_daily_completed":
        if activity_date is None:
            return False
        result = await db.execute(
            select(ChoreAssignment).where(
                ChoreAssignment.user_id == user.id,
                ChoreAssignment.date == activity_date,
                ChoreAssignment.is_optional == False,
                ChoreAssignment.status != AssignmentStatus.skipped,
            )
        )
        assignments = result.scalars().all()
        if not assignments:
            return False
        return all(a.status == AssignmentStatus.verified for a in assignments)

    elif ctype == "unassigned_chore_completed":
        # This would require tracking if chore was self-claimed
        return False

    return False


async def _unlock_achievement(db: AsyncSession, user: User, achievement: Achievement):
    ua = UserAchievement(user_id=user.id, achievement_id=achievement.id)
    db.add(ua)

    # Award bonus XP
    if achievement.points_reward > 0:
        user.points_balance += achievement.points_reward
        user.total_points_earned += achievement.points_reward
        tx = PointTransaction(
            user_id=user.id,
            amount=achievement.points_reward,
            type=PointType.achievement,
            description=f"Achievement unlocked: {achievement.title}",
            reference_id=achievement.id,
        )
        db.add(tx)

    # Create notification
    notif = Notification(
        user_id=user.id,
        type=NotificationType.achievement_unlocked,
        title="Achievement Unlocked!",
        message=f"You earned '{achievement.title}' — +{achievement.points_reward} XP!",
        reference_type="achievement",
        reference_id=achievement.id,
    )
    db.add(notif)
    await db.commit()

    await ws_manager.send_to_user(user.id, {
        "type": "achievement_unlocked",
        "data": {"achievement_key": achievement.key, "title": achievement.title, "points": achievement.points_reward},
    })
