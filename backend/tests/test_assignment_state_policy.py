import unittest
from datetime import date, datetime, timezone
from types import SimpleNamespace

from backend.services.assignment_state import (
    assignment_status_blocks_chore_delete,
    event_credit_timestamp,
    is_one_off_assignment_rule,
    one_off_assignment_keeps_rule_active,
    one_off_rule_is_exhausted,
    point_totals_after_credit_reversal,
    should_preserve_on_assignment_save,
    streak_credit_date,
)


class AssignmentStatePolicyTests(unittest.TestCase):
    def test_assignment_save_preserves_addressable_or_settled_states(self):
        for status in ("completed", "verified", "skipped"):
            with self.subTest(status=status):
                self.assertTrue(should_preserve_on_assignment_save(status))

    def test_assignment_save_can_update_pending_rows(self):
        self.assertFalse(should_preserve_on_assignment_save("pending"))
        self.assertFalse(should_preserve_on_assignment_save(None))

    def test_streak_credit_uses_assignment_date_instead_of_approval_day(self):
        assignment = SimpleNamespace(date=date(2026, 6, 14))

        self.assertEqual(
            streak_credit_date(assignment, fallback_date=date(2026, 6, 15)),
            date(2026, 6, 14),
        )

    def test_one_off_rule_detection_supports_explicit_and_legacy_schedules(self):
        self.assertTrue(
            is_one_off_assignment_rule(
                SimpleNamespace(schedule_type="once", recurrence="daily")
            )
        )
        self.assertTrue(
            is_one_off_assignment_rule(
                SimpleNamespace(schedule_type=None, recurrence="once")
            )
        )
        self.assertFalse(
            is_one_off_assignment_rule(
                SimpleNamespace(schedule_type="weekly", recurrence="weekly")
            )
        )

    def test_one_off_rule_remains_active_only_for_open_work(self):
        for status in ("pending", "completed"):
            with self.subTest(status=status):
                self.assertTrue(one_off_assignment_keeps_rule_active(status))

        for status in ("verified", "skipped"):
            with self.subTest(status=status):
                self.assertFalse(one_off_assignment_keeps_rule_active(status))

    def test_chore_delete_is_blocked_by_completed_work_awaiting_approval(self):
        self.assertTrue(assignment_status_blocks_chore_delete("completed"))
        for status in ("pending", "verified", "skipped", None):
            with self.subTest(status=status):
                self.assertFalse(assignment_status_blocks_chore_delete(status))

    def test_one_off_rule_is_exhausted_after_its_only_date_without_approval_work(self):
        rule = SimpleNamespace(
            schedule_type="once",
            recurrence="once",
            start_date=date(2026, 6, 14),
        )

        self.assertTrue(
            one_off_rule_is_exhausted(
                rule,
                today=date(2026, 6, 15),
                has_completed_assignment=False,
            )
        )
        self.assertFalse(
            one_off_rule_is_exhausted(
                rule,
                today=date(2026, 6, 15),
                has_completed_assignment=True,
            )
        )

    def test_one_off_rule_is_not_exhausted_before_or_on_its_date(self):
        rule = SimpleNamespace(
            schedule_type="once",
            recurrence="once",
            start_date=date(2026, 6, 15),
        )

        self.assertFalse(
            one_off_rule_is_exhausted(
                rule,
                today=date(2026, 6, 14),
                has_completed_assignment=False,
            )
        )
        self.assertFalse(
            one_off_rule_is_exhausted(
                rule,
                today=date(2026, 6, 15),
                has_completed_assignment=False,
            )
        )

    def test_event_bonus_uses_completion_time_as_naive_utc(self):
        assignment = SimpleNamespace(
            completed_at=datetime(
                2026, 6, 14, 21, 30, tzinfo=timezone.utc
            )
        )

        self.assertEqual(
            event_credit_timestamp(
                assignment,
                fallback=datetime(2026, 6, 15, 12, 0, tzinfo=timezone.utc),
            ),
            datetime(2026, 6, 14, 21, 30),
        )

    def test_event_bonus_falls_back_to_approval_time_when_completion_missing(self):
        assignment = SimpleNamespace(completed_at=None)

        self.assertEqual(
            event_credit_timestamp(
                assignment,
                fallback=datetime(2026, 6, 15, 12, 0, tzinfo=timezone.utc),
            ),
            datetime(2026, 6, 15, 12, 0),
        )

    def test_credit_reversal_deducts_balance_and_total_earned_without_going_negative(self):
        self.assertEqual(
            point_totals_after_credit_reversal(
                points_balance=120,
                total_points_earned=500,
                amount=40,
            ),
            (80, 460),
        )
        self.assertEqual(
            point_totals_after_credit_reversal(
                points_balance=10,
                total_points_earned=20,
                amount=40,
            ),
            (0, 0),
        )


if __name__ == "__main__":
    unittest.main()
