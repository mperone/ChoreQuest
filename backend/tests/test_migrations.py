import sqlite3
import tempfile
import unittest
from contextlib import closing
import json
from pathlib import Path

from backend.migrations import MIGRATIONS, Migration, run_sqlite_migrations


class MigrationRunnerTests(unittest.TestCase):
    def test_runs_pending_migration_once_and_creates_backup(self):
        with tempfile.TemporaryDirectory() as tmp:
            db_path = Path(tmp) / "app.db"
            backup_dir = Path(tmp) / "backups"

            with closing(sqlite3.connect(db_path)) as conn:
                conn.execute("CREATE TABLE sample (id INTEGER PRIMARY KEY)")
                conn.execute("INSERT INTO sample (id) VALUES (1)")
                conn.commit()

            calls = []

            def add_name_column(conn):
                calls.append("ran")
                conn.execute("ALTER TABLE sample ADD COLUMN name TEXT")
                conn.execute("UPDATE sample SET name = 'before'")

            migration = Migration(
                id="2026_06_10_test_add_name",
                description="add name column",
                migrate=add_name_column,
            )

            first = run_sqlite_migrations(
                f"sqlite+aiosqlite:///{db_path}",
                migrations=[migration],
                backup_dir=backup_dir,
            )
            second = run_sqlite_migrations(
                f"sqlite+aiosqlite:///{db_path}",
                migrations=[migration],
                backup_dir=backup_dir,
            )

            self.assertEqual(calls, ["ran"])
            self.assertEqual(first.applied, ["2026_06_10_test_add_name"])
            self.assertEqual(second.applied, [])
            self.assertIsNotNone(first.backup_path)
            self.assertIsNone(second.backup_path)

            backups = list(backup_dir.glob("app-*.db"))
            self.assertEqual(len(backups), 1)

            with closing(sqlite3.connect(db_path)) as conn:
                cols = [row[1] for row in conn.execute("PRAGMA table_info(sample)")]
                applied = [
                    row[0]
                    for row in conn.execute("SELECT id FROM schema_migrations")
                ]
                value = conn.execute("SELECT name FROM sample WHERE id = 1").fetchone()[0]

            self.assertIn("name", cols)
            self.assertEqual(value, "before")
            self.assertEqual(applied, ["2026_06_10_test_add_name"])

            with closing(sqlite3.connect(backups[0])) as conn:
                backup_cols = [
                    row[1] for row in conn.execute("PRAGMA table_info(sample)")
                ]
                backup_value = conn.execute("SELECT id FROM sample").fetchone()[0]

            self.assertNotIn("name", backup_cols)
            self.assertEqual(backup_value, 1)

    def test_failed_migration_is_not_marked_applied(self):
        with tempfile.TemporaryDirectory() as tmp:
            db_path = Path(tmp) / "app.db"
            backup_dir = Path(tmp) / "backups"

            with closing(sqlite3.connect(db_path)) as conn:
                conn.execute("CREATE TABLE sample (id INTEGER PRIMARY KEY)")
                conn.commit()

            def fail_after_write(conn):
                conn.execute("INSERT INTO sample (id) VALUES (1)")
                raise RuntimeError("boom")

            migration = Migration(
                id="2026_06_10_test_fail",
                description="fail after write",
                migrate=fail_after_write,
            )

            with self.assertLogs("backend.migrations", level="ERROR") as logs:
                with self.assertRaises(RuntimeError):
                    run_sqlite_migrations(
                        f"sqlite+aiosqlite:///{db_path}",
                        migrations=[migration],
                        backup_dir=backup_dir,
                    )

            self.assertIn("Migration 2026_06_10_test_fail failed", logs.output[0])

            with closing(sqlite3.connect(db_path)) as conn:
                rows = list(conn.execute("SELECT * FROM sample"))
                applied = list(conn.execute("SELECT id FROM schema_migrations"))

            self.assertEqual(rows, [])
            self.assertEqual(applied, [])
            self.assertEqual(len(list(backup_dir.glob("app-*.db"))), 1)

    def test_migrates_legacy_assignment_rules_to_explicit_schedules(self):
        with tempfile.TemporaryDirectory() as tmp:
            db_path = Path(tmp) / "app.db"
            backup_dir = Path(tmp) / "backups"

            with closing(sqlite3.connect(db_path)) as conn:
                conn.execute(
                    """
                    CREATE TABLE chores (
                        id INTEGER PRIMARY KEY,
                        recurrence TEXT NOT NULL,
                        custom_days TEXT,
                        created_at TEXT NOT NULL
                    )
                    """
                )
                conn.execute(
                    """
                    CREATE TABLE chore_assignment_rules (
                        id INTEGER PRIMARY KEY,
                        chore_id INTEGER NOT NULL,
                        user_id INTEGER NOT NULL,
                        recurrence TEXT NOT NULL,
                        custom_days TEXT,
                        created_at TEXT NOT NULL
                    )
                    """
                )
                conn.execute(
                    """
                    CREATE TABLE chore_assignments (
                        id INTEGER PRIMARY KEY,
                        chore_id INTEGER NOT NULL,
                        user_id INTEGER NOT NULL,
                        date DATE NOT NULL
                    )
                    """
                )
                conn.execute(
                    "INSERT INTO chores VALUES (1, 'weekly', NULL, '2026-06-09 12:00:00')"
                )
                conn.execute(
                    "INSERT INTO chores VALUES (2, 'custom', '[2,0,1]', '2026-06-08 12:00:00')"
                )
                conn.execute(
                    """
                    INSERT INTO chore_assignment_rules
                    VALUES (11, 1, 101, 'weekly', NULL, '2026-06-10 10:00:00')
                    """
                )
                conn.execute(
                    """
                    INSERT INTO chore_assignment_rules
                    VALUES (12, 2, 102, 'custom', '[2,0,1]', '2026-06-11 10:00:00')
                    """
                )
                conn.execute(
                    "INSERT INTO chore_assignments VALUES (21, 1, 101, '2026-06-17')"
                )
                conn.commit()

            migration = next(
                m for m in MIGRATIONS if m.id == "2026_06_10_schedule_rules_v2"
            )

            run_sqlite_migrations(
                f"sqlite+aiosqlite:///{db_path}",
                migrations=[migration],
                backup_dir=backup_dir,
            )

            with closing(sqlite3.connect(db_path)) as conn:
                rows = {
                    row[0]: row[1:]
                    for row in conn.execute(
                        """
                        SELECT id, schedule_type, start_date, weekdays
                        FROM chore_assignment_rules
                        ORDER BY id
                        """
                    )
                }

            self.assertEqual(rows[11], ("weekly", "2026-06-09", json.dumps([1])))
            self.assertEqual(rows[12], ("weekly", "2026-06-11", json.dumps([0, 1, 2])))

    def test_adds_monthly_schedule_day_column(self):
        with tempfile.TemporaryDirectory() as tmp:
            db_path = Path(tmp) / "app.db"
            backup_dir = Path(tmp) / "backups"

            with closing(sqlite3.connect(db_path)) as conn:
                conn.execute(
                    """
                    CREATE TABLE chore_assignment_rules (
                        id INTEGER PRIMARY KEY,
                        schedule_type TEXT,
                        start_date DATE
                    )
                    """
                )
                conn.execute(
                    """
                    INSERT INTO chore_assignment_rules
                    VALUES (1, 'monthly', '2026-06-10')
                    """
                )
                conn.commit()

            migration = next(
                m for m in MIGRATIONS if m.id == "2026_06_10_schedule_monthly_v1"
            )

            run_sqlite_migrations(
                f"sqlite+aiosqlite:///{db_path}",
                migrations=[migration],
                backup_dir=backup_dir,
            )

            with closing(sqlite3.connect(db_path)) as conn:
                cols = [
                    row[1]
                    for row in conn.execute(
                        "PRAGMA table_info(chore_assignment_rules)"
                    )
                ]
                month_day = conn.execute(
                    "SELECT month_day FROM chore_assignment_rules WHERE id = 1"
                ).fetchone()[0]

            self.assertIn("month_day", cols)
            self.assertEqual(month_day, 10)

    def test_adds_optional_quest_columns(self):
        with tempfile.TemporaryDirectory() as tmp:
            db_path = Path(tmp) / "app.db"
            backup_dir = Path(tmp) / "backups"

            with closing(sqlite3.connect(db_path)) as conn:
                conn.execute(
                    """
                    CREATE TABLE chore_assignment_rules (
                        id INTEGER PRIMARY KEY
                    )
                    """
                )
                conn.execute(
                    """
                    CREATE TABLE chore_assignments (
                        id INTEGER PRIMARY KEY
                    )
                    """
                )
                conn.commit()

            migration = next(
                m for m in MIGRATIONS if m.id == "2026_06_10_optional_quests_v1"
            )

            run_sqlite_migrations(
                f"sqlite+aiosqlite:///{db_path}",
                migrations=[migration],
                backup_dir=backup_dir,
            )

            with closing(sqlite3.connect(db_path)) as conn:
                rule_cols = [
                    row[1]
                    for row in conn.execute(
                        "PRAGMA table_info(chore_assignment_rules)"
                    )
                ]
                assignment_cols = [
                    row[1]
                    for row in conn.execute(
                        "PRAGMA table_info(chore_assignments)"
                    )
                ]

            self.assertIn("is_optional", rule_cols)
            self.assertIn("is_optional", assignment_cols)

    def test_drops_retired_quest_templates_table(self):
        with tempfile.TemporaryDirectory() as tmp:
            db_path = Path(tmp) / "app.db"
            backup_dir = Path(tmp) / "backups"

            with closing(sqlite3.connect(db_path)) as conn:
                conn.execute(
                    """
                    CREATE TABLE quest_templates (
                        id INTEGER PRIMARY KEY,
                        title TEXT NOT NULL
                    )
                    """
                )
                conn.execute("INSERT INTO quest_templates VALUES (1, 'Template')")
                conn.commit()

            migration = next(
                m for m in MIGRATIONS if m.id == "2026_06_11_drop_quest_templates"
            )

            run_sqlite_migrations(
                f"sqlite+aiosqlite:///{db_path}",
                migrations=[migration],
                backup_dir=backup_dir,
            )

            with closing(sqlite3.connect(db_path)) as conn:
                table = conn.execute(
                    """
                    SELECT name
                    FROM sqlite_master
                    WHERE type = 'table'
                      AND name = 'quest_templates'
                    """
                ).fetchone()

            self.assertIsNone(table)

    def test_adds_chore_daypart_and_sort_order_columns(self):
        with tempfile.TemporaryDirectory() as tmp:
            db_path = Path(tmp) / "app.db"
            backup_dir = Path(tmp) / "backups"

            with closing(sqlite3.connect(db_path)) as conn:
                conn.execute(
                    """
                    CREATE TABLE chores (
                        id INTEGER PRIMARY KEY,
                        title TEXT NOT NULL
                    )
                    """
                )
                conn.execute("INSERT INTO chores VALUES (1, 'Make bed')")
                conn.commit()

            migration = next(
                m for m in MIGRATIONS if m.id == "2026_06_11_chore_daypart_order_v1"
            )

            run_sqlite_migrations(
                f"sqlite+aiosqlite:///{db_path}",
                migrations=[migration],
                backup_dir=backup_dir,
            )

            with closing(sqlite3.connect(db_path)) as conn:
                cols = {
                    row[1]: row[4]
                    for row in conn.execute("PRAGMA table_info(chores)")
                }
                row = conn.execute(
                    "SELECT daypart, sort_order FROM chores WHERE id = 1"
                ).fetchone()

            self.assertIn("daypart", cols)
            self.assertIn("sort_order", cols)
            self.assertEqual(row, ("anytime", 0))


if __name__ == "__main__":
    unittest.main()
