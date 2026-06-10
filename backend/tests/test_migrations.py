import sqlite3
import tempfile
import unittest
from contextlib import closing
from pathlib import Path

from backend.migrations import Migration, run_sqlite_migrations


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


if __name__ == "__main__":
    unittest.main()
