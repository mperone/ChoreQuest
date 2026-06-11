import json
from datetime import date
from sqlalchemy import select, func, and_
from sqlalchemy.ext.asyncio import AsyncSession
from backend.models import (
    ChoreCategory, Achievement, AppSetting, Chore, ChoreAssignment,
    ChoreAssignmentRule, Recurrence,
    ScheduleType, AssignmentStatus, AvatarItem, AvatarItemRarity, AvatarUnlockMethod,
)

DEFAULT_CATEGORIES = [
    {"name": "Kitchen", "icon": "cooking-pot", "colour": "#ff6b6b"},
    {"name": "Bedroom", "icon": "bed", "colour": "#b388ff"},
    {"name": "Bathroom", "icon": "bath", "colour": "#64dfdf"},
    {"name": "Garden", "icon": "flower-2", "colour": "#2de2a6"},
    {"name": "Pets", "icon": "paw-print", "colour": "#f9d71c"},
    {"name": "Homework", "icon": "book-open", "colour": "#4ecdc4"},
    {"name": "Laundry", "icon": "shirt", "colour": "#ff9ff3"},
    {"name": "General", "icon": "home", "colour": "#a29bfe"},
    {"name": "Outdoor", "icon": "trees", "colour": "#55efc4"},
]

DEFAULT_ACHIEVEMENTS = [
    # ── Quest Completions (Bronze/Silver/Gold) ──
    {"key": "first_steps", "title": "First Steps", "description": "Complete your first quest", "icon": "footprints", "points_reward": 10, "criteria": {"type": "total_completions", "count": 1}, "tier": "bronze", "group_key": "completions", "sort_order": 1},
    {"key": "quest_veteran", "title": "Quest Veteran", "description": "Complete 50 quests", "icon": "footprints", "points_reward": 30, "criteria": {"type": "total_completions", "count": 50}, "tier": "silver", "group_key": "completions", "sort_order": 2},
    {"key": "quest_legend", "title": "Quest Legend", "description": "Complete 200 quests", "icon": "footprints", "points_reward": 75, "criteria": {"type": "total_completions", "count": 200}, "tier": "gold", "group_key": "completions", "sort_order": 3},
    # ── Consistency ──
    {"key": "week_warrior", "title": "Week Warrior", "description": "Complete all assigned quests every day for 7 consecutive days", "icon": "shield", "points_reward": 50, "criteria": {"type": "consecutive_days_all_complete", "days": 7}, "sort_order": 4},
    # ── Lifetime XP (Bronze/Silver/Gold) ──
    {"key": "piggy_bank", "title": "Piggy Bank", "description": "Earn 100 total lifetime XP", "icon": "piggy-bank", "points_reward": 10, "criteria": {"type": "total_points_earned", "amount": 100}, "tier": "bronze", "group_key": "lifetime_xp", "sort_order": 5},
    {"key": "money_bags", "title": "Money Bags", "description": "Earn 500 total lifetime XP", "icon": "banknote", "points_reward": 25, "criteria": {"type": "total_points_earned", "amount": 500}, "tier": "silver", "group_key": "lifetime_xp", "sort_order": 6},
    {"key": "point_millionaire", "title": "Point Millionaire", "description": "Earn 1,000 total lifetime XP", "icon": "gem", "points_reward": 50, "criteria": {"type": "total_points_earned", "amount": 1000}, "tier": "gold", "group_key": "lifetime_xp", "sort_order": 7},
    # ── Timing ──
    {"key": "early_bird", "title": "Early Bird", "description": "Complete a quest before 9:00 AM", "icon": "sunrise", "points_reward": 15, "criteria": {"type": "completion_before_time", "hour": 9}, "sort_order": 8},
    {"key": "helping_hand", "title": "Helping Hand", "description": "Claim and complete a quest that was not assigned to you", "icon": "hand-helping", "points_reward": 20, "criteria": {"type": "unassigned_chore_completed"}, "sort_order": 9},
    # ── Streaks (Bronze/Silver/Gold) ──
    {"key": "on_fire", "title": "On Fire", "description": "Maintain a 7-day streak", "icon": "flame", "points_reward": 25, "criteria": {"type": "streak_reached", "days": 7}, "tier": "bronze", "group_key": "streaks", "sort_order": 10},
    {"key": "streak_master", "title": "Streak Master", "description": "Maintain a 30-day streak", "icon": "flame-kindling", "points_reward": 75, "criteria": {"type": "streak_reached", "days": 30}, "tier": "silver", "group_key": "streaks", "sort_order": 11},
    {"key": "unstoppable", "title": "Unstoppable", "description": "Maintain a 100-day streak", "icon": "zap", "points_reward": 200, "criteria": {"type": "streak_reached", "days": 100}, "tier": "gold", "group_key": "streaks", "sort_order": 12},
    # ── Redemptions (Bronze/Silver) ──
    {"key": "treat_yourself", "title": "Treat Yourself", "description": "Redeem 5 rewards from the Treasure Shop", "icon": "gift", "points_reward": 15, "criteria": {"type": "total_redemptions", "count": 5}, "tier": "bronze", "group_key": "redemptions", "sort_order": 13},
    {"key": "big_spender", "title": "Big Spender", "description": "Redeem 20 rewards from the Treasure Shop", "icon": "shopping-cart", "points_reward": 50, "criteria": {"type": "total_redemptions", "count": 20}, "tier": "silver", "group_key": "redemptions", "sort_order": 14},
    # ── Daily challenges ──
    {"key": "speed_demon", "title": "Speed Demon", "description": "Complete all daily assigned quests before noon", "icon": "timer", "points_reward": 20, "criteria": {"type": "all_daily_before_time", "hour": 12}, "sort_order": 15},
    {"key": "all_done", "title": "All Done!", "description": "Complete every assigned quest in a single day", "icon": "check-check", "points_reward": 15, "criteria": {"type": "all_daily_completed"}, "sort_order": 16},
    # ── Pet milestones (Bronze/Silver/Gold/Platinum) ──
    {"key": "pet_youngling", "title": "Growing Bond", "description": "Raise a pet to Level 2 (Youngling)", "icon": "paw-print", "points_reward": 15, "criteria": {"type": "pet_level_reached", "level": 2}, "tier": "bronze", "group_key": "pets", "sort_order": 17},
    {"key": "pet_loyal", "title": "Loyal Companion", "description": "Raise a pet to Level 4 (Loyal)", "icon": "paw-print", "points_reward": 30, "criteria": {"type": "pet_level_reached", "level": 4}, "tier": "silver", "group_key": "pets", "sort_order": 18},
    {"key": "pet_mighty", "title": "Mighty Beast", "description": "Raise a pet to Level 6 (Mighty)", "icon": "paw-print", "points_reward": 50, "criteria": {"type": "pet_level_reached", "level": 6}, "tier": "gold", "group_key": "pets", "sort_order": 19},
    {"key": "pet_legendary", "title": "Legendary Tamer", "description": "Raise a pet to Level 8 (Legendary)", "icon": "paw-print", "points_reward": 100, "criteria": {"type": "pet_level_reached", "level": 8}, "tier": "gold", "group_key": "pets", "sort_order": 20},
]

DEFAULT_SETTINGS = {
    "daily_reset_hour": "0",
    "leaderboard_enabled": "true",
    "spin_wheel_enabled": "true",
    "chore_trading_enabled": "true",
}

# fmt: off
# Avatar items: (category, item_id, display_name, rarity, unlock_method, unlock_value, is_default)
_F = AvatarUnlockMethod.free
_S = AvatarUnlockMethod.shop
_X = AvatarUnlockMethod.xp
_K = AvatarUnlockMethod.streak
_Q = AvatarUnlockMethod.quest_drop
_C = AvatarItemRarity.common
_U = AvatarItemRarity.uncommon
_R = AvatarItemRarity.rare
_E = AvatarItemRarity.epic
_L = AvatarItemRarity.legendary

DEFAULT_AVATAR_ITEMS = [
    # ── Head ──
    ("head", "round", "Round", _C, _F, None, True),
    ("head", "oval", "Oval", _C, _F, None, True),
    ("head", "square", "Square", _C, _F, None, True),
    ("head", "diamond", "Diamond", _C, _F, None, True),
    ("head", "heart", "Heart", _C, _F, None, True),
    ("head", "long", "Long", _C, _F, None, True),
    ("head", "triangle", "Triangle", _U, _S, 25, False),
    ("head", "pear", "Pear", _U, _S, 25, False),
    ("head", "wide", "Wide", _U, _S, 25, False),
    # ── Hair ──
    ("hair", "none", "None", _C, _F, None, True),
    ("hair", "short", "Short", _C, _F, None, True),
    ("hair", "long", "Long", _C, _F, None, True),
    ("hair", "spiky", "Spiky", _C, _F, None, True),
    ("hair", "curly", "Curly", _C, _F, None, True),
    ("hair", "mohawk", "Mohawk", _C, _F, None, True),
    ("hair", "buzz", "Buzz", _C, _F, None, True),
    ("hair", "ponytail", "Ponytail", _C, _F, None, True),
    ("hair", "bun", "Bun", _C, _F, None, True),
    ("hair", "pigtails", "Pigtails", _C, _F, None, True),
    ("hair", "afro", "Afro", _C, _F, None, True),
    ("hair", "braids", "Braids", _U, _S, 30, False),
    ("hair", "wavy", "Wavy", _U, _S, 30, False),
    ("hair", "side_part", "Side Part", _U, _S, 30, False),
    ("hair", "fade", "Fade", _U, _S, 30, False),
    ("hair", "dreadlocks", "Dreadlocks", _R, _S, 50, False),
    ("hair", "bob", "Bob", _U, _S, 30, False),
    ("hair", "shoulder", "Shoulder", _U, _S, 30, False),
    ("hair", "undercut", "Undercut", _U, _S, 30, False),
    ("hair", "twin_buns", "Twin Buns", _R, _S, 40, False),
    # ── Eyes ──
    ("eyes", "normal", "Normal", _C, _F, None, True),
    ("eyes", "happy", "Happy", _C, _F, None, True),
    ("eyes", "wide", "Wide", _C, _F, None, True),
    ("eyes", "sleepy", "Sleepy", _C, _F, None, True),
    ("eyes", "wink", "Wink", _C, _F, None, True),
    ("eyes", "angry", "Angry", _C, _F, None, True),
    ("eyes", "dot", "Dot", _C, _F, None, True),
    ("eyes", "star", "Star", _C, _F, None, True),
    ("eyes", "glasses", "Glasses", _U, _S, 40, False),
    ("eyes", "sunglasses", "Sunglasses", _R, _X, 200, False),
    ("eyes", "eye_patch", "Eye Patch", _R, _Q, None, False),
    ("eyes", "crying", "Crying", _U, _S, 30, False),
    ("eyes", "heart_eyes", "Heart Eyes", _R, _K, 7, False),
    ("eyes", "dizzy", "Dizzy", _U, _S, 30, False),
    ("eyes", "closed", "Closed", _U, _S, 30, False),
    # ── Mouth ──
    ("mouth", "smile", "Smile", _C, _F, None, True),
    ("mouth", "grin", "Grin", _C, _F, None, True),
    ("mouth", "neutral", "Neutral", _C, _F, None, True),
    ("mouth", "open", "Open", _C, _F, None, True),
    ("mouth", "tongue", "Tongue", _C, _F, None, True),
    ("mouth", "frown", "Frown", _C, _F, None, True),
    ("mouth", "surprised", "Surprised", _C, _F, None, True),
    ("mouth", "smirk", "Smirk", _C, _F, None, True),
    ("mouth", "braces", "Braces", _U, _S, 30, False),
    ("mouth", "vampire", "Vampire Fangs", _R, _Q, None, False),
    ("mouth", "whistle", "Whistle", _U, _S, 25, False),
    ("mouth", "mask", "Mask", _U, _S, 40, False),
    ("mouth", "beard", "Beard", _R, _S, 50, False),
    ("mouth", "moustache", "Moustache", _R, _S, 40, False),
    # ── Hats ──
    ("hat", "none", "None", _C, _F, None, True),
    ("hat", "crown", "Royal Crown", _E, _X, 500, False),
    ("hat", "wizard", "Wizard Hat", _R, _K, 14, False),
    ("hat", "beanie", "Beanie", _U, _S, 40, False),
    ("hat", "cap", "Cap", _U, _S, 30, False),
    ("hat", "pirate", "Pirate Hat", _R, _Q, None, False),
    ("hat", "headphones", "Headphones", _U, _S, 50, False),
    ("hat", "tiara", "Tiara", _R, _X, 300, False),
    ("hat", "horns", "Horns", _R, _Q, None, False),
    ("hat", "bunny_ears", "Bunny Ears", _U, _S, 40, False),
    ("hat", "cat_ears", "Cat Ears", _U, _S, 40, False),
    ("hat", "halo", "Halo", _E, _K, 30, False),
    ("hat", "viking", "Viking Helmet", _E, _Q, None, False),
    # ── Accessories ──
    ("accessory", "none", "None", _C, _F, None, True),
    ("accessory", "scarf", "Scarf", _U, _S, 30, False),
    ("accessory", "necklace", "Necklace", _U, _S, 40, False),
    ("accessory", "bow_tie", "Bow Tie", _U, _S, 25, False),
    ("accessory", "cape", "Hero's Cape", _E, _X, 400, False),
    ("accessory", "wings", "Angel Wings", _E, _K, 21, False),
    ("accessory", "shield", "Shield", _R, _S, 60, False),
    ("accessory", "sword", "Sword", _L, _Q, None, False),
    # ── Face extras ──
    ("face_extra", "none", "None", _C, _F, None, True),
    ("face_extra", "freckles", "Freckles", _C, _F, None, True),
    ("face_extra", "blush", "Blush", _C, _F, None, True),
    ("face_extra", "face_paint", "Face Paint", _U, _S, 30, False),
    ("face_extra", "scar", "Battle Scar", _R, _Q, None, False),
    ("face_extra", "bandage", "Bandage", _U, _S, 25, False),
    ("face_extra", "stickers", "Stickers", _U, _S, 20, False),
    # ── Outfit patterns ──
    ("outfit_pattern", "none", "None", _C, _F, None, True),
    ("outfit_pattern", "stripes", "Stripes", _C, _F, None, True),
    ("outfit_pattern", "stars", "Stars", _U, _S, 25, False),
    ("outfit_pattern", "camo", "Camo", _U, _S, 30, False),
    ("outfit_pattern", "tie_dye", "Tie Dye", _R, _S, 35, False),
    ("outfit_pattern", "plaid", "Plaid", _U, _S, 25, False),
    # ── Pets ──
    ("pet", "none", "None", _C, _F, None, True),
    ("pet", "cat", "Cat", _R, _S, 80, False),
    ("pet", "dog", "Dog", _R, _S, 80, False),
    ("pet", "dragon", "Dragon", _L, _X, 1000, False),
    ("pet", "owl", "Owl", _R, _K, 14, False),
    ("pet", "bunny", "Bunny", _R, _S, 60, False),
    ("pet", "phoenix", "Phoenix", _L, _Q, None, False),
]
# fmt: on


async def seed_database(db: AsyncSession):
    # Seed categories
    result = await db.execute(select(ChoreCategory).limit(1))
    if result.scalar_one_or_none() is None:
        for cat in DEFAULT_CATEGORIES:
            db.add(ChoreCategory(name=cat["name"], icon=cat["icon"], colour=cat["colour"], is_default=True))
        await db.commit()

    # Seed achievements (add any missing by key, update tier/group_key/sort_order)
    existing_result = await db.execute(select(Achievement))
    existing_map = {a.key: a for a in existing_result.scalars().all()}
    added_achievements = 0
    for ach in DEFAULT_ACHIEVEMENTS:
        if ach["key"] not in existing_map:
            db.add(Achievement(**ach))
            added_achievements += 1
        else:
            # Backfill tier/group_key/sort_order on existing achievements
            existing = existing_map[ach["key"]]
            if existing.tier != ach.get("tier") or existing.group_key != ach.get("group_key") or existing.sort_order != ach.get("sort_order", 0):
                existing.tier = ach.get("tier")
                existing.group_key = ach.get("group_key")
                existing.sort_order = ach.get("sort_order", 0)
                added_achievements += 1
    if added_achievements > 0:
        await db.commit()

    # Seed settings
    for key, value in DEFAULT_SETTINGS.items():
        result = await db.execute(select(AppSetting).where(AppSetting.key == key))
        if result.scalar_one_or_none() is None:
            db.add(AppSetting(key=key, value=json.dumps(value) if not isinstance(value, str) else value))
    await db.commit()

    # Migrate existing chores to assignment rules (one-time migration)
    rule_count = await db.execute(select(func.count()).select_from(ChoreAssignmentRule))
    if rule_count.scalar() == 0:
        today = date.today()
        chores_result = await db.execute(
            select(Chore).where(Chore.is_active == True)
        )
        migrated = 0
        for chore in chores_result.scalars().all():
            # Only create rules from today's pending assignments (not all historical)
            kid_result = await db.execute(
                select(ChoreAssignment.user_id)
                .where(
                    ChoreAssignment.chore_id == chore.id,
                    ChoreAssignment.date == today,
                    ChoreAssignment.status == AssignmentStatus.pending,
                )
                .distinct()
            )
            kid_ids = list(kid_result.scalars().all())
            for kid_id in kid_ids:
                if chore.recurrence == Recurrence.custom:
                    schedule_type = ScheduleType.weekly
                    start_date = today
                    weekdays = sorted(chore.custom_days or [today.weekday()])
                    month_day = None
                elif chore.recurrence in (Recurrence.weekly, Recurrence.fortnightly):
                    schedule_type = ScheduleType(chore.recurrence.value)
                    start_date = chore.created_at.date()
                    weekdays = [chore.created_at.weekday()]
                    month_day = None
                elif chore.recurrence == Recurrence.monthly:
                    schedule_type = ScheduleType.monthly
                    start_date = chore.created_at.date()
                    weekdays = None
                    month_day = start_date.day
                else:
                    schedule_type = ScheduleType(chore.recurrence.value)
                    start_date = today if chore.recurrence == Recurrence.once else chore.created_at.date()
                    weekdays = None
                    month_day = None

                db.add(ChoreAssignmentRule(
                    chore_id=chore.id,
                    user_id=kid_id,
                    recurrence=chore.recurrence,
                    custom_days=chore.custom_days,
                    schedule_type=schedule_type,
                    start_date=start_date,
                    weekdays=weekdays,
                    month_day=month_day,
                    requires_photo=chore.requires_photo,
                    is_active=True,
                ))
                migrated += 1
        if migrated > 0:
            await db.commit()

    # Seed avatar items catalogue
    avatar_count = await db.execute(select(func.count()).select_from(AvatarItem))
    if avatar_count.scalar() == 0:
        for cat, item_id, name, rarity, method, value, default in DEFAULT_AVATAR_ITEMS:
            db.add(AvatarItem(
                category=cat, item_id=item_id, display_name=name,
                rarity=rarity, unlock_method=method, unlock_value=value,
                is_default=default,
            ))
        await db.commit()

    # One-time cleanup: deactivate stale rules created by migration that were
    # never manually managed through the assign modal.
    cleanup_key = "assignment_rules_cleanup_v1"
    cleanup_check = await db.execute(
        select(AppSetting).where(AppSetting.key == cleanup_key)
    )
    if cleanup_check.scalar_one_or_none() is None:
        active_rules = await db.execute(
            select(ChoreAssignmentRule).where(ChoreAssignmentRule.is_active == True)
        )
        deactivated = 0
        for rule in active_rules.scalars().all():
            # Rules from migration have created_at == updated_at (never touched)
            if rule.created_at == rule.updated_at:
                rule.is_active = False
                deactivated += 1
        db.add(AppSetting(key=cleanup_key, value=f"deactivated {deactivated} stale rules"))
        await db.commit()
