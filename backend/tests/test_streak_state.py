import unittest
from datetime import date

from backend.services.streak_state import current_streak_from_credit_dates


class StreakStateTests(unittest.TestCase):
    def test_approval_order_does_not_change_current_streak(self):
        result = current_streak_from_credit_dates(
            [date(2026, 6, 16), date(2026, 6, 14), date(2026, 6, 15)],
            preserved_dates=set(),
        )

        self.assertEqual(result.current_streak, 3)
        self.assertEqual(result.last_streak_date, date(2026, 6, 16))

    def test_gap_days_without_required_quests_bridge_credit_dates(self):
        result = current_streak_from_credit_dates(
            [date(2026, 6, 12), date(2026, 6, 15)],
            preserved_dates={date(2026, 6, 13), date(2026, 6, 14)},
        )

        self.assertEqual(result.current_streak, 2)
        self.assertEqual(result.last_streak_date, date(2026, 6, 15))

    def test_required_gap_breaks_current_streak(self):
        result = current_streak_from_credit_dates(
            [date(2026, 6, 14), date(2026, 6, 16)],
            preserved_dates=set(),
        )

        self.assertEqual(result.current_streak, 1)
        self.assertEqual(result.last_streak_date, date(2026, 6, 16))

    def test_available_freeze_bridges_one_gap(self):
        result = current_streak_from_credit_dates(
            [date(2026, 6, 14), date(2026, 6, 16)],
            preserved_dates=set(),
            can_use_freeze=True,
        )

        self.assertEqual(result.current_streak, 2)
        self.assertEqual(result.last_streak_date, date(2026, 6, 16))
        self.assertEqual(result.freeze_month_used, 2026 * 12 + 6)


if __name__ == "__main__":
    unittest.main()
