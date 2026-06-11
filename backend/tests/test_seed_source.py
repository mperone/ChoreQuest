import unittest
from pathlib import Path


class SeedSourceTests(unittest.TestCase):
    def test_seed_does_not_create_prewritten_quests(self):
        seed_source = Path("backend/seed.py").read_text(encoding="utf-8")

        self.assertNotIn("DEFAULT_QUESTS", seed_source)
        self.assertNotIn("Seed template quests", seed_source)

    def test_seed_defines_daily_rollover_timezone(self):
        seed_source = Path("backend/seed.py").read_text(encoding="utf-8")

        self.assertIn('"daily_rollover_timezone": "America/Chicago"', seed_source)


if __name__ == "__main__":
    unittest.main()
