import unittest
from datetime import date, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from backend.achievements import check_achievements
from backend.database import Base
from backend.models import (
    AppSetting,
    Achievement,
    AssignmentStatus,
    Chore,
    ChoreAssignment,
    ChoreCategory,
    Difficulty,
    Recurrence,
    User,
    UserAchievement,
    UserRole,
)


class AchievementCriteriaTests(unittest.IsolatedAsyncioTestCase):
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
            points_balance=0,
            total_points_earned=0,
        )

    def _achievement(self, key, criteria, points=10):
        return Achievement(
            key=key,
            title=key.replace("_", " ").title(),
            description="test achievement",
            icon="star",
            points_reward=points,
            criteria=criteria,
            sort_order=1,
        )

    def _category(self):
        return ChoreCategory(name="Room", icon="home", colour="#14b8a6")

    def _chore(self, creator_id, category_id, title):
        return Chore(
            title=title,
            points=10,
            difficulty=Difficulty.easy,
            category_id=category_id,
            recurrence=Recurrence.daily,
            created_by=creator_id,
        )

    async def _unlocked_keys(self, db, user_id):
        result = await db.execute(
            select(Achievement.key)
            .join(UserAchievement, UserAchievement.achievement_id == Achievement.id)
            .where(UserAchievement.user_id == user_id)
        )
        return set(result.scalars().all())

    async def test_total_completions_counts_only_parent_approved_assignments(self):
        async with self.Session() as db:
            parent = User(
                username="parent",
                display_name="Parent",
                password_hash="hash",
                role=UserRole.parent,
            )
            kid = self._kid()
            category = self._category()
            db.add_all([parent, kid, category])
            await db.flush()

            chore = self._chore(parent.id, category.id, "Make bed")
            achievement = self._achievement(
                "first_steps",
                {"type": "total_completions", "count": 1},
            )
            db.add_all([chore, achievement])
            await db.flush()

            db.add(ChoreAssignment(
                chore_id=chore.id,
                user_id=kid.id,
                date=date(2026, 6, 11),
                status=AssignmentStatus.completed,
                completed_at=datetime(2026, 6, 11, 13, 0),
            ))
            await db.commit()

            await check_achievements(db, kid, activity_date=date(2026, 6, 11))

            self.assertEqual(set(), await self._unlocked_keys(db, kid.id))

            result = await db.execute(select(ChoreAssignment))
            assignment = result.scalar_one()
            assignment.status = AssignmentStatus.verified
            await db.commit()

            await check_achievements(db, kid, activity_date=date(2026, 6, 11))

            self.assertEqual({"first_steps"}, await self._unlocked_keys(db, kid.id))

    async def test_daily_achievements_use_activity_date_and_require_approval(self):
        async with self.Session() as db:
            parent = User(
                username="parent",
                display_name="Parent",
                password_hash="hash",
                role=UserRole.parent,
            )
            kid = self._kid()
            category = self._category()
            db.add_all([parent, kid, category])
            await db.flush()

            make_bed = self._chore(parent.id, category.id, "Make bed")
            homework = self._chore(parent.id, category.id, "Homework")
            all_done = self._achievement("all_done", {"type": "all_daily_completed"})
            db.add_all([make_bed, homework, all_done])
            await db.flush()

            db.add_all([
                ChoreAssignment(
                    chore_id=make_bed.id,
                    user_id=kid.id,
                    date=date(2026, 6, 10),
                    status=AssignmentStatus.verified,
                    completed_at=datetime(2026, 6, 10, 13, 0),
                ),
                ChoreAssignment(
                    chore_id=homework.id,
                    user_id=kid.id,
                    date=date(2026, 6, 10),
                    status=AssignmentStatus.completed,
                    completed_at=datetime(2026, 6, 10, 14, 0),
                ),
                ChoreAssignment(
                    chore_id=make_bed.id,
                    user_id=kid.id,
                    date=date(2026, 6, 11),
                    status=AssignmentStatus.verified,
                    completed_at=datetime(2026, 6, 11, 13, 0),
                ),
            ])
            await db.commit()

            await check_achievements(db, kid, activity_date=date(2026, 6, 10))

            self.assertEqual(set(), await self._unlocked_keys(db, kid.id))

            result = await db.execute(
                select(ChoreAssignment).where(ChoreAssignment.date == date(2026, 6, 10))
            )
            for assignment in result.scalars().all():
                assignment.status = AssignmentStatus.verified
            await db.commit()

            await check_achievements(db, kid, activity_date=date(2026, 6, 10))

            self.assertEqual({"all_done"}, await self._unlocked_keys(db, kid.id))

    async def test_before_noon_achievement_uses_family_timezone(self):
        async with self.Session() as db:
            db.add(AppSetting(key="daily_rollover_timezone", value="America/Chicago"))
            parent = User(
                username="parent",
                display_name="Parent",
                password_hash="hash",
                role=UserRole.parent,
            )
            kid = self._kid()
            category = self._category()
            db.add_all([parent, kid, category])
            await db.flush()

            chore = self._chore(parent.id, category.id, "Homework")
            achievement = self._achievement(
                "early_bird",
                {"type": "completion_before_time", "hour": 9},
            )
            db.add_all([chore, achievement])
            await db.flush()

            db.add(ChoreAssignment(
                chore_id=chore.id,
                user_id=kid.id,
                date=date(2026, 6, 11),
                status=AssignmentStatus.verified,
                completed_at=datetime(2026, 6, 11, 13, 30),
            ))
            await db.commit()

            await check_achievements(db, kid, activity_date=date(2026, 6, 11))

            self.assertEqual({"early_bird"}, await self._unlocked_keys(db, kid.id))


if __name__ == "__main__":
    unittest.main()
