from pathlib import Path
import sqlite3


DATABASE_PATH = Path("/app/data/proxpilot.db")
CURRENT_SCHEMA_VERSION = 1


def get_connection() -> sqlite3.Connection:
    DATABASE_PATH.parent.mkdir(
        parents=True,
        exist_ok=True,
    )

    connection = sqlite3.connect(
        DATABASE_PATH,
        check_same_thread=False,
    )

    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")

    return connection


def _create_settings_table(
    connection: sqlite3.Connection,
) -> None:
    connection.execute(
        """
        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        )
        """
    )


def _get_schema_version(
    connection: sqlite3.Connection,
) -> int:
    row = connection.execute(
        """
        SELECT value
        FROM settings
        WHERE key = 'database_version'
        """
    ).fetchone()

    if row is None:
        return 0

    try:
        return int(row["value"])
    except (TypeError, ValueError):
        raise RuntimeError(
            "Invalid database schema version."
        )


def _set_schema_version(
    connection: sqlite3.Connection,
    version: int,
) -> None:
    connection.execute(
        """
        INSERT INTO settings (
            key,
            value
        )
        VALUES (
            'database_version',
            ?
        )
        ON CONFLICT(key) DO UPDATE SET
            value = excluded.value
        """,
        (str(version),),
    )


def _migrate_to_version_1(
    connection: sqlite3.Connection,
) -> None:
    connection.execute(
        """
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL UNIQUE,
            password_hash TEXT NOT NULL,
            role TEXT NOT NULL
                CHECK (role IN ('admin', 'viewer')),
            enabled INTEGER NOT NULL DEFAULT 1
                CHECK (enabled IN (0, 1)),
            source TEXT NOT NULL DEFAULT 'local'
                CHECK (source IN ('local', 'ldap')),
            created_at TEXT NOT NULL,
            last_login TEXT
        )
        """
    )

    _set_schema_version(
        connection,
        1,
    )


def initialize_database() -> None:
    with get_connection() as connection:
        _create_settings_table(connection)

        schema_version = _get_schema_version(
            connection,
        )

        if schema_version > CURRENT_SCHEMA_VERSION:
            raise RuntimeError(
                "Database schema is newer than this "
                "ProxPilot version supports."
            )

        if schema_version < 1:
            _migrate_to_version_1(connection)

        connection.commit()
