import unittest

from pydantic import ValidationError

from backend.models import ChoreDaypart
from backend.schemas import ChoreDaypartOrderItem, ChoreDaypartReorderRequest


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


if __name__ == "__main__":
    unittest.main()
