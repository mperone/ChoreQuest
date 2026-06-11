"""Helpers for ChoreQuest's family-day timezone.

Chore schedules are date-only. This module only decides what "today" means
for daily rollover behavior such as kid home, spins, streaks, and resets.
"""

from datetime import date, datetime, time, timedelta, timezone
from typing import Any, Optional
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

DAILY_ROLLOVER_TIMEZONE_KEY = "daily_rollover_timezone"
DEFAULT_DAILY_ROLLOVER_TIMEZONE = "America/Chicago"


def normalize_timezone_name(value: Optional[str]) -> str:
    name = (value or "").strip()
    if not name:
        return DEFAULT_DAILY_ROLLOVER_TIMEZONE
    try:
        ZoneInfo(name)
    except ZoneInfoNotFoundError:
        return DEFAULT_DAILY_ROLLOVER_TIMEZONE
    return name


def local_date_for_timezone(
    timezone_name: Optional[str],
    now: Optional[datetime] = None,
) -> date:
    zone = ZoneInfo(normalize_timezone_name(timezone_name))
    current = now or datetime.now(timezone.utc)
    if current.tzinfo is None:
        current = current.replace(tzinfo=timezone.utc)
    return current.astimezone(zone).date()


def next_local_midnight_utc(
    timezone_name: Optional[str],
    now: Optional[datetime] = None,
) -> datetime:
    zone = ZoneInfo(normalize_timezone_name(timezone_name))
    current = now or datetime.now(timezone.utc)
    if current.tzinfo is None:
        current = current.replace(tzinfo=timezone.utc)
    local_now = current.astimezone(zone)
    next_day = local_now.date() + timedelta(days=1)
    local_midnight = datetime.combine(next_day, time.min, tzinfo=zone)
    return local_midnight.astimezone(timezone.utc)


async def get_daily_rollover_timezone(db: Any) -> str:
    from sqlalchemy import select

    from backend.config import settings
    from backend.models import AppSetting

    result = await db.execute(
        select(AppSetting).where(AppSetting.key == DAILY_ROLLOVER_TIMEZONE_KEY)
    )
    setting = result.scalar_one_or_none()
    if setting and setting.value:
        return normalize_timezone_name(setting.value)
    return normalize_timezone_name(settings.TZ)


async def app_today(db: Any, now: Optional[datetime] = None) -> date:
    return local_date_for_timezone(await get_daily_rollover_timezone(db), now)
