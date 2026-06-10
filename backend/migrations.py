"""SQLite startup migrations with backup and once-only tracking."""

from __future__ import annotations

from contextlib import closing
from dataclasses import dataclass
from datetime import datetime, timezone
import logging
from pathlib import Path
import sqlite3
from typing import Callable
from urllib.parse import unquote

logger = logging.getLogger(__name__)

MigrationFunc = Callable[[sqlite3.Connection], None]


@dataclass(frozen=True)
class Migration:
    id: str
    description: str
    migrate: MigrationFunc
    backup: bool = True


@dataclass(frozen=True)
class MigrationResult:
    applied: list[str]
    backup_path: Path | None = None
    skipped_reason: str | None = None


def sqlite_path_from_url(database_url: str) -> Path | None:
    """Return a filesystem path for supported SQLite URLs."""
    prefixes = ("sqlite+aiosqlite:///", "sqlite:///")
    for prefix in prefixes:
        if database_url.startswith(prefix):
            raw_path = database_url[len(prefix):].split("?", 1)[0]
            raw_path = unquote(raw_path)
            if raw_path in {"", ":memory:"}:
                return None
            return Path(raw_path)
    return None


def run_startup_migrations(database_url: str) -> MigrationResult:
    return run_sqlite_migrations(database_url, MIGRATIONS)


def run_sqlite_migrations(
    database_url: str,
    migrations: list[Migration],
    backup_dir: Path | None = None,
) -> MigrationResult:
    db_path = sqlite_path_from_url(database_url)
    if db_path is None:
        return MigrationResult(applied=[], skipped_reason="not a file-backed SQLite database")

    db_path.parent.mkdir(parents=True, exist_ok=True)

    with closing(sqlite3.connect(db_path)) as conn:
        _ensure_schema_migrations(conn)
        applied_ids = _applied_migration_ids(conn)
        pending = [migration for migration in migrations if migration.id not in applied_ids]

        if not pending:
            return MigrationResult(applied=[])

        backup_path = None
        if any(migration.backup for migration in pending):
            backup_path = _backup_database(conn, db_path, backup_dir)
            logger.info("Created SQLite migration backup at %s", backup_path)

        applied: list[str] = []
        for migration in pending:
            logger.info("Applying migration %s: %s", migration.id, migration.description)
            try:
                conn.execute("BEGIN")
                migration.migrate(conn)
                conn.execute(
                    """
                    INSERT INTO schema_migrations (id, description, applied_at)
                    VALUES (?, ?, ?)
                    """,
                    (
                        migration.id,
                        migration.description,
                        datetime.now(timezone.utc).isoformat(),
                    ),
                )
                conn.commit()
            except Exception:
                conn.rollback()
                logger.exception("Migration %s failed", migration.id)
                raise
            applied.append(migration.id)

    return MigrationResult(applied=applied, backup_path=backup_path)


def _ensure_schema_migrations(conn: sqlite3.Connection) -> None:
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS schema_migrations (
            id TEXT PRIMARY KEY,
            description TEXT NOT NULL DEFAULT '',
            applied_at TEXT NOT NULL
        )
        """
    )
    conn.commit()


def _applied_migration_ids(conn: sqlite3.Connection) -> set[str]:
    return {
        row[0]
        for row in conn.execute("SELECT id FROM schema_migrations")
    }


def _backup_database(
    conn: sqlite3.Connection,
    db_path: Path,
    backup_dir: Path | None,
) -> Path:
    destination_dir = backup_dir or db_path.parent / "backups"
    destination_dir.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S-%f")
    backup_path = destination_dir / f"{db_path.stem}-{timestamp}.db"

    with closing(sqlite3.connect(backup_path)) as backup_conn:
        conn.backup(backup_conn)

    return backup_path


def _quote_identifier(identifier: str) -> str:
    return '"' + identifier.replace('"', '""') + '"'


def _table_exists(conn: sqlite3.Connection, table: str) -> bool:
    row = conn.execute(
        "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?",
        (table,),
    ).fetchone()
    return row is not None


def _column_exists(conn: sqlite3.Connection, table: str, column: str) -> bool:
    if not _table_exists(conn, table):
        return False
    table_name = _quote_identifier(table)
    return any(
        row[1] == column
        for row in conn.execute(f"PRAGMA table_info({table_name})")
    )


def _add_column_if_missing(
    conn: sqlite3.Connection,
    table: str,
    column: str,
    definition: str,
) -> None:
    if not _table_exists(conn, table) or _column_exists(conn, table, column):
        return

    table_name = _quote_identifier(table)
    column_name = _quote_identifier(column)
    conn.execute(f"ALTER TABLE {table_name} ADD COLUMN {column_name} {definition}")


def _migrate_existing_lightweight_columns(conn: sqlite3.Connection) -> None:
    columns = [
        ("reward_redemptions", "fulfilled_by", "INTEGER REFERENCES users(id)"),
        ("reward_redemptions", "fulfilled_at", "DATETIME"),
        ("users", "streak_freezes_used", "INTEGER DEFAULT 0"),
        ("users", "streak_freeze_month", "INTEGER"),
        ("chore_assignments", "feedback", "TEXT"),
        ("rewards", "category", "VARCHAR(50)"),
        ("achievements", "tier", "VARCHAR(10)"),
        ("achievements", "group_key", "VARCHAR(50)"),
        ("achievements", "sort_order", "INTEGER DEFAULT 0"),
    ]
    for table, column, definition in columns:
        _add_column_if_missing(conn, table, column, definition)


MIGRATIONS = [
    Migration(
        id="2026_06_10_existing_lightweight_columns",
        description="Record existing SQLite column backfills in schema_migrations",
        migrate=_migrate_existing_lightweight_columns,
    ),
]
