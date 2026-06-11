import unittest
from datetime import date, datetime
from types import SimpleNamespace

from backend.services.assignment_cleanup import pending_assignment_is_stale


def ns(**kwargs):
    return SimpleNamespace(**kwargs)


class AssignmentCleanupTests(unittest.TestCase):
    def test_matching_future_rule_is_not_stale(self):
        assignment = ns(chore_id=1, user_id=2, date=date(2026, 6, 10), status="pending")
        chore = ns(
            id=1,
            is_active=True,
            recurrence="daily",
            custom_days=None,
            created_at=datetime(2026, 6, 1, 12, 0, 0),
        )
        rule = ns(
            chore_id=1,
            user_id=2,
            recurrence="daily",
            custom_days=None,
            schedule_type="weekly",
            start_date=date(2026, 6, 8),
            weekdays=[2],
            month_day=None,
        )

        self.assertFalse(
            pending_assignment_is_stale(
                assignment,
                chore,
                [rule],
                exclusion_set=set(),
                today=date(2026, 6, 10),
            )
        )

    def test_assignment_that_no_longer_matches_rule_is_stale(self):
        assignment = ns(chore_id=1, user_id=2, date=date(2026, 6, 11), status="pending")
        chore = ns(
            id=1,
            is_active=True,
            recurrence="daily",
            custom_days=None,
            created_at=datetime(2026, 6, 1, 12, 0, 0),
        )
        rule = ns(
            chore_id=1,
            user_id=2,
            recurrence="daily",
            custom_days=None,
            schedule_type="weekly",
            start_date=date(2026, 6, 8),
            weekdays=[2],
            month_day=None,
        )

        self.assertTrue(
            pending_assignment_is_stale(
                assignment,
                chore,
                [rule],
                exclusion_set=set(),
                today=date(2026, 6, 10),
            )
        )

    def test_excluded_assignment_is_stale_but_exclusion_is_preserved(self):
        assignment = ns(chore_id=1, user_id=2, date=date(2026, 6, 10), status="pending")
        chore = ns(
            id=1,
            is_active=True,
            recurrence="daily",
            custom_days=None,
            created_at=datetime(2026, 6, 1, 12, 0, 0),
        )
        rule = ns(
            chore_id=1,
            user_id=2,
            recurrence="daily",
            custom_days=None,
            schedule_type="daily",
            start_date=date(2026, 6, 1),
            weekdays=None,
            month_day=None,
        )

        self.assertTrue(
            pending_assignment_is_stale(
                assignment,
                chore,
                [rule],
                exclusion_set={(1, 2, date(2026, 6, 10))},
                today=date(2026, 6, 10),
            )
        )

    def test_overdue_pending_assignment_is_stale(self):
        assignment = ns(chore_id=1, user_id=2, date=date(2026, 6, 9), status="pending")
        chore = ns(
            id=1,
            is_active=True,
            recurrence="daily",
            custom_days=None,
            created_at=datetime(2026, 6, 1, 12, 0, 0),
        )

        self.assertTrue(
            pending_assignment_is_stale(
                assignment,
                chore,
                [],
                exclusion_set=set(),
                today=date(2026, 6, 10),
            )
        )


if __name__ == "__main__":
    unittest.main()
