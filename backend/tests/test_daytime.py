from datetime import datetime, timezone
import unittest

from backend.services.daytime import (
    local_date_for_timezone,
    next_local_midnight_utc,
    normalize_timezone_name,
)


class DaytimeTests(unittest.TestCase):
    def test_local_date_uses_requested_timezone(self):
        instant = datetime(2026, 6, 11, 22, 30, tzinfo=timezone.utc)

        self.assertEqual(
            local_date_for_timezone("Europe/Belgrade", instant).isoformat(),
            "2026-06-12",
        )
        self.assertEqual(
            local_date_for_timezone("America/Chicago", instant).isoformat(),
            "2026-06-11",
        )

    def test_next_local_midnight_accounts_for_dst_offset(self):
        instant = datetime(2026, 6, 11, 21, 0, tzinfo=timezone.utc)

        self.assertEqual(
            next_local_midnight_utc("Europe/Belgrade", instant),
            datetime(2026, 6, 11, 22, 0, tzinfo=timezone.utc),
        )
        self.assertEqual(
            next_local_midnight_utc("America/Chicago", instant),
            datetime(2026, 6, 12, 5, 0, tzinfo=timezone.utc),
        )

    def test_invalid_timezone_falls_back_to_default(self):
        self.assertEqual(normalize_timezone_name("Nope/Bad"), "America/Chicago")
        self.assertEqual(normalize_timezone_name("Europe/Belgrade"), "Europe/Belgrade")


if __name__ == "__main__":
    unittest.main()
