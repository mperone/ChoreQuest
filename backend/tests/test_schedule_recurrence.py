import unittest
from datetime import date

from backend.services.recurrence import should_create_on_day


class ScheduleRecurrenceTests(unittest.TestCase):
    def test_once_runs_only_on_start_date(self):
        self.assertTrue(
            should_create_on_day(
                None,
                date(2026, 6, 12),
                0,
                schedule_type="once",
                start_date=date(2026, 6, 12),
            )
        )
        self.assertFalse(
            should_create_on_day(
                None,
                date(2026, 6, 13),
                0,
                schedule_type="once",
                start_date=date(2026, 6, 12),
            )
        )

    def test_legacy_once_runs_only_on_created_date_when_available(self):
        self.assertTrue(
            should_create_on_day(
                "once",
                date(2026, 6, 12),
                4,
                created_at_date=date(2026, 6, 12),
            )
        )
        self.assertFalse(
            should_create_on_day(
                "once",
                date(2026, 6, 13),
                4,
                created_at_date=date(2026, 6, 12),
            )
        )

    def test_weekly_runs_on_selected_weekdays_after_start_date(self):
        self.assertFalse(
            should_create_on_day(
                None,
                date(2026, 6, 10),
                0,
                schedule_type="weekly",
                start_date=date(2026, 6, 11),
                weekdays=[0, 2],
            )
        )
        self.assertTrue(
            should_create_on_day(
                None,
                date(2026, 6, 15),
                0,
                schedule_type="weekly",
                start_date=date(2026, 6, 11),
                weekdays=[0, 2],
            )
        )
        self.assertFalse(
            should_create_on_day(
                None,
                date(2026, 6, 16),
                0,
                schedule_type="weekly",
                start_date=date(2026, 6, 11),
                weekdays=[0, 2],
            )
        )

    def test_fortnightly_runs_on_selected_weekdays_in_alternating_weeks(self):
        start = date(2026, 6, 10)  # Wednesday

        self.assertTrue(
            should_create_on_day(
                None,
                date(2026, 6, 10),
                0,
                schedule_type="fortnightly",
                start_date=start,
                weekdays=[0, 2],
            )
        )
        self.assertFalse(
            should_create_on_day(
                None,
                date(2026, 6, 15),
                0,
                schedule_type="fortnightly",
                start_date=start,
                weekdays=[0, 2],
            )
        )
        self.assertFalse(
            should_create_on_day(
                None,
                date(2026, 6, 17),
                0,
                schedule_type="fortnightly",
                start_date=start,
                weekdays=[0, 2],
            )
        )
        self.assertTrue(
            should_create_on_day(
                None,
                date(2026, 6, 22),
                0,
                schedule_type="fortnightly",
                start_date=start,
                weekdays=[0, 2],
            )
        )
        self.assertTrue(
            should_create_on_day(
                None,
                date(2026, 6, 24),
                0,
                schedule_type="fortnightly",
                start_date=start,
                weekdays=[0, 2],
            )
        )

    def test_monthly_runs_on_selected_month_day_after_start_date(self):
        self.assertFalse(
            should_create_on_day(
                None,
                date(2026, 6, 9),
                0,
                schedule_type="monthly",
                start_date=date(2026, 6, 10),
                month_day=10,
            )
        )
        self.assertTrue(
            should_create_on_day(
                None,
                date(2026, 6, 10),
                0,
                schedule_type="monthly",
                start_date=date(2026, 6, 10),
                month_day=10,
            )
        )
        self.assertTrue(
            should_create_on_day(
                None,
                date(2026, 7, 10),
                0,
                schedule_type="monthly",
                start_date=date(2026, 6, 10),
                month_day=10,
            )
        )
        self.assertFalse(
            should_create_on_day(
                None,
                date(2026, 7, 11),
                0,
                schedule_type="monthly",
                start_date=date(2026, 6, 10),
                month_day=10,
            )
        )

    def test_monthly_last_day_runs_on_each_month_end(self):
        self.assertTrue(
            should_create_on_day(
                None,
                date(2026, 1, 31),
                0,
                schedule_type="monthly",
                start_date=date(2026, 1, 10),
                month_day=-1,
            )
        )
        self.assertFalse(
            should_create_on_day(
                None,
                date(2026, 2, 27),
                0,
                schedule_type="monthly",
                start_date=date(2026, 1, 10),
                month_day=-1,
            )
        )
        self.assertTrue(
            should_create_on_day(
                None,
                date(2026, 2, 28),
                0,
                schedule_type="monthly",
                start_date=date(2026, 1, 10),
                month_day=-1,
            )
        )


if __name__ == "__main__":
    unittest.main()
