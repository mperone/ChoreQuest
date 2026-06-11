import unittest

from pydantic import ValidationError

from backend.models import ChoreDaypart, Difficulty, Recurrence
from backend.schemas import (
    ChoreCreate,
    ChoreDaypartOrderItem,
    ChoreDaypartReorderRequest,
    ChoreUpdate,
)


class ChoreDaypartSchemaTests(unittest.TestCase):
    def test_reorder_request_accepts_daypart_and_position(self):
        request = ChoreDaypartReorderRequest(
            items=[
                {"chore_id": 10, "daypart": "morning", "sort_order": 0},
                {"chore_id": 11, "daypart": "evening", "sort_order": 1},
            ],
        )

        self.assertEqual(request.items[0].daypart, ChoreDaypart.morning)
        self.assertEqual(request.items[1].sort_order, 1)

    def test_reorder_request_requires_non_negative_sort_order(self):
        with self.assertRaises(ValidationError):
            ChoreDaypartOrderItem(
                chore_id=10,
                daypart="morning",
                sort_order=-1,
            )

    def test_chore_create_and_update_require_non_negative_sort_order(self):
        with self.assertRaises(ValidationError):
            ChoreCreate(
                title="Clean sink",
                points=5,
                difficulty=Difficulty.easy,
                category_id=1,
                recurrence=Recurrence.daily,
                sort_order=-1,
            )

        with self.assertRaises(ValidationError):
            ChoreUpdate(sort_order=-1)


if __name__ == "__main__":
    unittest.main()
