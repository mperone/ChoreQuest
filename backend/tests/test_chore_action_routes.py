import unittest
from unittest.mock import AsyncMock, patch

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from backend.database import Base
from backend.dependencies import require_parent
from backend.models import (
    Chore,
    ChoreCategory,
    ChoreDaypart,
    Difficulty,
    Recurrence,
    User,
    UserRole,
)
from backend.routers.chores import _CHORE_CHANGED, reorder_chore_dayparts, router
from backend.schemas import ChoreDaypartReorderRequest


def route_methods():
    return {
        (route.path, method)
        for route in router.routes
        for method in getattr(route, "methods", set())
    }


def route_for(path, method):
    for route in router.routes:
        if route.path == path and method in getattr(route, "methods", set()):
            return route
    raise AssertionError(f"Route not found: {method} {path}")


class ChoreActionRouteTests(unittest.TestCase):
    def test_assignment_action_routes_are_available(self):
        routes = route_methods()

        self.assertIn(("/api/chores/assignments/{assignment_id}/approve", "POST"), routes)
        self.assertIn(("/api/chores/assignments/{assignment_id}/needs-work", "POST"), routes)
        self.assertIn(("/api/chores/assignments/{assignment_id}/skip", "POST"), routes)

    def test_legacy_assignment_action_aliases_still_work(self):
        routes = route_methods()

        self.assertIn(("/api/chores/assignments/{assignment_id}/verify", "POST"), routes)
        self.assertIn(("/api/chores/assignments/{assignment_id}/uncomplete", "POST"), routes)

    def test_chore_assignment_list_route_is_available(self):
        routes = route_methods()

        self.assertIn(("/api/chores/{chore_id}/assignments", "GET"), routes)

    def test_parent_chore_daypart_reorder_route_is_available(self):
        routes = route_methods()

        self.assertIn(("/api/chores/reorder-dayparts", "POST"), routes)

    def test_parent_chore_daypart_reorder_route_requires_parent(self):
        route = route_for("/api/chores/reorder-dayparts", "POST")

        dependency_calls = {dependency.call for dependency in route.dependant.dependencies}
        self.assertIn(require_parent, dependency_calls)


class ChoreDaypartReorderEndpointTests(unittest.IsolatedAsyncioTestCase):
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

    async def _seed_users_and_category(self, db):
        parent = User(
            username="parent",
            display_name="Parent",
            password_hash="hash",
            role=UserRole.parent,
        )
        other_parent = User(
            username="other-parent",
            display_name="Other",
            password_hash="hash",
            role=UserRole.parent,
        )
        category = ChoreCategory(name="Kitchen", icon="sparkles", colour="#abcdef")
        db.add_all([parent, other_parent, category])
        await db.flush()
        return parent, other_parent, category

    def _chore(self, *, title, category, created_by, is_active=True):
        return Chore(
            title=title,
            points=5,
            difficulty=Difficulty.easy,
            category_id=category.id,
            recurrence=Recurrence.daily,
            requires_photo=False,
            daypart=ChoreDaypart.anytime,
            sort_order=0,
            is_active=is_active,
            created_by=created_by,
        )

    async def test_reorder_rejects_wrong_parent_and_inactive_chore_ids(self):
        async with self.Session() as db:
            parent, other_parent, category = await self._seed_users_and_category(db)
            other_parent_chore = self._chore(
                title="Other Parent Chore",
                category=category,
                created_by=other_parent.id,
            )
            inactive_chore = self._chore(
                title="Inactive Chore",
                category=category,
                created_by=parent.id,
                is_active=False,
            )
            db.add_all([other_parent_chore, inactive_chore])
            await db.commit()

            request = ChoreDaypartReorderRequest(
                items=[
                    {
                        "chore_id": other_parent_chore.id,
                        "daypart": "morning",
                        "sort_order": 0,
                    },
                    {
                        "chore_id": inactive_chore.id,
                        "daypart": "evening",
                        "sort_order": 1,
                    },
                ]
            )

            with self.assertRaises(HTTPException) as raised:
                await reorder_chore_dayparts(request, db=db, user=parent)

        self.assertEqual(raised.exception.status_code, 404)
        self.assertIn(str(other_parent_chore.id), raised.exception.detail)
        self.assertIn(str(inactive_chore.id), raised.exception.detail)

    async def test_reorder_persists_returns_ordered_response_and_broadcasts(self):
        async with self.Session() as db:
            parent, _, category = await self._seed_users_and_category(db)
            chores = [
                self._chore(title="Zeta", category=category, created_by=parent.id),
                self._chore(title="alpha", category=category, created_by=parent.id),
                self._chore(title="Books", category=category, created_by=parent.id),
            ]
            db.add_all(chores)
            await db.commit()

            request = ChoreDaypartReorderRequest(
                items=[
                    {
                        "chore_id": chores[0].id,
                        "daypart": "morning",
                        "sort_order": 1,
                    },
                    {
                        "chore_id": chores[1].id,
                        "daypart": "morning",
                        "sort_order": 1,
                    },
                    {
                        "chore_id": chores[2].id,
                        "daypart": "afternoon",
                        "sort_order": 0,
                    },
                ]
            )

            with patch(
                "backend.routers.chores.ws_manager.broadcast",
                new=AsyncMock(),
            ) as broadcast:
                response = await reorder_chore_dayparts(request, db=db, user=parent)

            persisted = await db.execute(
                select(Chore).where(Chore.id.in_([chore.id for chore in chores]))
            )
            persisted_by_id = {chore.id: chore for chore in persisted.scalars().all()}

        self.assertEqual([chore.title for chore in response], ["alpha", "Zeta", "Books"])
        self.assertEqual(persisted_by_id[chores[0].id].daypart, ChoreDaypart.morning)
        self.assertEqual(persisted_by_id[chores[0].id].sort_order, 1)
        self.assertEqual(persisted_by_id[chores[2].id].daypart, ChoreDaypart.afternoon)
        self.assertEqual(persisted_by_id[chores[2].id].sort_order, 0)
        broadcast.assert_awaited_once_with(_CHORE_CHANGED, exclude_user=parent.id)


if __name__ == "__main__":
    unittest.main()
