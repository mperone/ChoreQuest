import unittest
from datetime import date, datetime

from pydantic import ValidationError

from backend.models import (
    AssignmentStatus,
    Chore,
    ChoreAssignment,
    ChoreAssignmentRule,
    ChoreCategory,
    ChoreDaypart,
    Difficulty,
    Recurrence,
    ScheduleType,
)
from backend.routers.calendar import _build_assignment_entry
from backend.routers.stats import _build_kid_assignment
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


class AssignmentDaypartResponseBuilderTests(unittest.TestCase):
    def _assignment_fixture(self):
        category = ChoreCategory(
            id=7,
            name="Kitchen",
            icon="utensils",
            colour="#abcdef",
            is_default=False,
        )
        chore = Chore(
            id=10,
            title="Wipe counters",
            description="After breakfast",
            points=5,
            difficulty=Difficulty.easy,
            icon="sparkles",
            category_id=category.id,
            category=category,
            recurrence=Recurrence.daily,
            custom_days=[0, 2, 4],
            requires_photo=True,
            daypart=ChoreDaypart.morning,
            sort_order=3,
            is_active=True,
            created_by=2,
            created_at=datetime(2026, 6, 11, 8, 30),
        )
        assignment = ChoreAssignment(
            id=99,
            chore_id=chore.id,
            user_id=4,
            date=date(2026, 6, 11),
            status=AssignmentStatus.pending,
            is_optional=True,
            chore=chore,
        )
        rule = ChoreAssignmentRule(
            chore_id=chore.id,
            user_id=assignment.user_id,
            recurrence=Recurrence.daily,
            custom_days=None,
            schedule_type=ScheduleType.weekly,
            start_date=date(2026, 6, 8),
            weekdays=[0, 2, 4],
            month_day=None,
            requires_photo=True,
            is_optional=True,
        )
        return assignment, rule

    def test_calendar_assignment_entry_includes_chore_daypart_metadata(self):
        assignment, rule = self._assignment_fixture()

        entry = _build_assignment_entry(assignment, True, rule)

        self.assertEqual(entry["chore"]["daypart"], ChoreDaypart.morning)
        self.assertEqual(entry["chore"]["sort_order"], 3)
        self.assertEqual(entry["chore"]["is_optional"], True)

    def test_stats_kid_assignment_includes_chore_daypart_metadata(self):
        assignment, rule = self._assignment_fixture()

        entry = _build_kid_assignment(assignment, rule)

        self.assertEqual(entry["chore"]["category_id"], 7)
        self.assertEqual(entry["chore"]["schedule_type"], ScheduleType.weekly)
        self.assertEqual(entry["chore"]["start_date"], date(2026, 6, 8))
        self.assertEqual(entry["chore"]["weekdays"], [0, 2, 4])
        self.assertEqual(entry["chore"]["daypart"], ChoreDaypart.morning)
        self.assertEqual(entry["chore"]["sort_order"], 3)


if __name__ == "__main__":
    unittest.main()
