import unittest
from datetime import date

from backend.services.calendar_windows import monday_week_starts_to_generate


class CalendarWindowTests(unittest.TestCase):
    def test_generates_current_and_future_monday_weeks_only(self):
        self.assertEqual(
            monday_week_starts_to_generate(
                today=date(2026, 6, 10),
                end_date=date(2026, 7, 8),
            ),
            [
                date(2026, 6, 8),
                date(2026, 6, 15),
                date(2026, 6, 22),
                date(2026, 6, 29),
                date(2026, 7, 6),
            ],
        )

    def test_does_not_generate_past_week_for_sunday(self):
        self.assertEqual(
            monday_week_starts_to_generate(
                today=date(2026, 6, 14),
                end_date=date(2026, 6, 14),
            ),
            [date(2026, 6, 8)],
        )


if __name__ == "__main__":
    unittest.main()
