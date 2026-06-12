import unittest
from unittest.mock import patch

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from backend.database import Base
from backend.models import (
    AvatarItem,
    AvatarItemRarity,
    AvatarUnlockMethod,
    User,
    UserAvatarItem,
    UserRole,
)
from backend.routers.avatar import (
    get_avatar_items,
    purchase_avatar_item,
    try_quest_drop,
)


class AvatarRouterLegacyPetItemTests(unittest.IsolatedAsyncioTestCase):
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

    def _avatar_item(
        self,
        *,
        category: str,
        item_id: str,
        display_name: str,
        unlock_method: AvatarUnlockMethod = AvatarUnlockMethod.shop,
    ):
        return AvatarItem(
            category=category,
            item_id=item_id,
            display_name=display_name,
            rarity=AvatarItemRarity.rare,
            unlock_method=unlock_method,
            unlock_value=80 if unlock_method == AvatarUnlockMethod.shop else None,
            is_default=False,
        )

    async def test_get_avatar_items_filters_legacy_pet_categories(self):
        async with self.Session() as db:
            user = self._kid()
            hat = self._avatar_item(
                category="hat",
                item_id="cap",
                display_name="Cap",
            )
            pet = self._avatar_item(
                category="pet",
                item_id="cat",
                display_name="Cat",
            )
            pet_color = self._avatar_item(
                category="pet_color",
                item_id="pink",
                display_name="Pink Pet",
            )
            db.add_all([user, hat, pet, pet_color])
            await db.commit()

            items = await get_avatar_items(db=db, user=user)

        self.assertEqual(["hat"], [item["category"] for item in items])

    async def test_purchase_rejects_legacy_pet_categories_as_not_found(self):
        async with self.Session() as db:
            user = self._kid()
            pet = self._avatar_item(
                category="pet",
                item_id="cat",
                display_name="Cat",
            )
            pet_color = self._avatar_item(
                category="pet_color",
                item_id="pink",
                display_name="Pink Pet",
            )
            db.add_all([user, pet, pet_color])
            await db.commit()

            for item in (pet, pet_color):
                with self.subTest(category=item.category):
                    with self.assertRaises(HTTPException) as raised:
                        await purchase_avatar_item(item.id, db=db, user=user)

                    self.assertEqual(raised.exception.status_code, 404)

    async def test_quest_drop_ignores_legacy_pet_categories(self):
        async with self.Session() as db:
            user = self._kid()
            pet_drop = self._avatar_item(
                category="pet",
                item_id="phoenix",
                display_name="Phoenix",
                unlock_method=AvatarUnlockMethod.quest_drop,
            )
            pet_color_drop = self._avatar_item(
                category="pet_color",
                item_id="sparkle",
                display_name="Sparkle Pet",
                unlock_method=AvatarUnlockMethod.quest_drop,
            )
            db.add_all([user, pet_drop, pet_color_drop])
            await db.commit()

            with patch("backend.routers.avatar.random.random", return_value=0):
                drop = await try_quest_drop(db, user, "expert")

            owned_result = await db.execute(select(UserAvatarItem))
            owned_items = owned_result.scalars().all()

        self.assertIsNone(drop)
        self.assertEqual([], owned_items)


if __name__ == "__main__":
    unittest.main()
