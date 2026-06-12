import unittest

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from backend.achievements import check_achievements
from backend.database import Base
from backend.models import Achievement, User, UserAchievement, UserRole
from backend.routers.stats import (
    _count_achievements,
    get_achievement_badge,
    get_all_achievements,
    update_achievement,
)
from backend.schemas import AchievementUpdate


class RetiredPetAchievementTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.engine = create_async_engine(
            "sqlite+aiosqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        self.Session = async_sessionmaker(self.engine, expire_on_commit=False)
        async with self.engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)

    async def asyncTearDown(self):
        await self.engine.dispose()

    def _kid(self):
        return User(
            username="kid",
            display_name="Kid",
            password_hash="hash",
            role=UserRole.kid,
            points_balance=500,
            total_points_earned=500,
        )

    def _achievement(
        self,
        *,
        key: str,
        criteria: dict,
        title: str = "Achievement",
        sort_order: int = 1,
    ):
        return Achievement(
            key=key,
            title=title,
            description=f"{title} description",
            icon="star",
            points_reward=10,
            criteria=criteria,
            sort_order=sort_order,
        )

    async def _seed_user_with_active_and_retired_achievements(self, db):
        user = self._kid()
        active = self._achievement(
            key="active_points",
            title="Active Points",
            criteria={"type": "total_points_earned", "amount": 100},
            sort_order=1,
        )
        retired_by_key = self._achievement(
            key="pet_youngling",
            title="Growing Bond",
            criteria={"type": "total_points_earned", "amount": 1},
            sort_order=2,
        )
        retired_by_criteria = self._achievement(
            key="legacy_pet_criteria",
            title="Legacy Criteria",
            criteria={"type": "pet_level_reached", "level": 2},
            sort_order=3,
        )
        db.add_all([user, active, retired_by_key, retired_by_criteria])
        await db.commit()
        return user, active, retired_by_key, retired_by_criteria

    async def test_achievement_list_hides_legacy_pet_achievements(self):
        async with self.Session() as db:
            user, active, _, _ = await self._seed_user_with_active_and_retired_achievements(db)
            db.add(UserAchievement(user_id=user.id, achievement_id=active.id))
            await db.commit()

            achievements = await get_all_achievements(current_user=user, db=db)

        self.assertEqual(["active_points"], [achievement.key for achievement in achievements])
        self.assertTrue(achievements[0].unlocked)

    async def test_achievement_count_ignores_unlocked_legacy_pet_achievements(self):
        async with self.Session() as db:
            user, active, retired_by_key, retired_by_criteria = (
                await self._seed_user_with_active_and_retired_achievements(db)
            )
            db.add_all([
                UserAchievement(user_id=user.id, achievement_id=active.id),
                UserAchievement(user_id=user.id, achievement_id=retired_by_key.id),
                UserAchievement(user_id=user.id, achievement_id=retired_by_criteria.id),
            ])
            await db.commit()

            count = await _count_achievements(db, user.id)

        self.assertEqual(1, count)

    async def test_check_achievements_does_not_unlock_retired_pet_keys(self):
        async with self.Session() as db:
            user, active, retired_by_key, _ = await self._seed_user_with_active_and_retired_achievements(db)

            await check_achievements(db, user)

            unlocked_result = await db.execute(
                select(UserAchievement.achievement_id).where(
                    UserAchievement.user_id == user.id
                )
            )
            unlocked_ids = set(unlocked_result.scalars().all())

        self.assertIn(active.id, unlocked_ids)
        self.assertNotIn(retired_by_key.id, unlocked_ids)

    async def test_badge_and_update_treat_retired_pet_achievements_as_missing(self):
        async with self.Session() as db:
            user, _, retired_by_key, _ = await self._seed_user_with_active_and_retired_achievements(db)
            db.add(UserAchievement(user_id=user.id, achievement_id=retired_by_key.id))
            await db.commit()

            with self.assertRaises(HTTPException) as badge_raised:
                await get_achievement_badge(
                    retired_by_key.id,
                    db=db,
                    current_user=user,
                )

            with self.assertRaises(HTTPException) as update_raised:
                await update_achievement(
                    retired_by_key.id,
                    AchievementUpdate(points_reward=25),
                    parent=user,
                    db=db,
                )

        self.assertEqual(404, badge_raised.exception.status_code)
        self.assertEqual(404, update_raised.exception.status_code)


if __name__ == "__main__":
    unittest.main()
