from pathlib import Path
import sqlite3


DATABASE_PATH = Path("/app/data/proxpilot.db")
CURRENT_SCHEMA_VERSION = 8


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


def _migrate_to_version_2(
    connection: sqlite3.Connection,
) -> None:
    connection.execute(
        """
        ALTER TABLE users
        RENAME TO users_v1
        """
    )

    connection.execute(
        """
        CREATE TABLE users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL UNIQUE,
            password_hash TEXT NOT NULL,
            role TEXT NOT NULL
                CHECK (
                    role IN (
                        'admin',
                        'operator',
                        'viewer'
                    )
                ),
            enabled INTEGER NOT NULL DEFAULT 1
                CHECK (enabled IN (0, 1)),
            source TEXT NOT NULL DEFAULT 'local'
                CHECK (source IN ('local', 'ldap')),
            created_at TEXT NOT NULL,
            last_login TEXT
        )
        """
    )

    connection.execute(
        """
        INSERT INTO users (
            id,
            username,
            password_hash,
            role,
            enabled,
            source,
            created_at,
            last_login
        )
        SELECT
            id,
            username,
            password_hash,
            role,
            enabled,
            source,
            created_at,
            last_login
        FROM users_v1
        """
    )

    connection.execute(
        """
        DROP TABLE users_v1
        """
    )

    _set_schema_version(
        connection,
        2,
    )


def _migrate_to_version_3(
    connection: sqlite3.Connection,
) -> None:
    connection.execute(
        """
        CREATE TABLE audit_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            created_at TEXT NOT NULL,
            user_id INTEGER,
            username TEXT,
            role TEXT,
            source TEXT,
            ip_address TEXT,
            action TEXT NOT NULL,
            target_type TEXT,
            target TEXT,
            node TEXT,
            result TEXT NOT NULL
                CHECK (
                    result IN (
                        'success',
                        'failed'
                    )
                ),
            severity TEXT NOT NULL
                CHECK (
                    severity IN (
                        'info',
                        'warning',
                        'error'
                    )
                ),
            duration_ms INTEGER,
            details TEXT
        )
        """
    )

    connection.execute(
        """
        CREATE INDEX idx_audit_log_created_at
        ON audit_log(created_at)
        """
    )

    connection.execute(
        """
        CREATE INDEX idx_audit_log_username
        ON audit_log(username)
        """
    )

    connection.execute(
        """
        CREATE INDEX idx_audit_log_action
        ON audit_log(action)
        """
    )

    connection.execute(
        """
        CREATE INDEX idx_audit_log_result
        ON audit_log(result)
        """
    )

    connection.execute(
        """
        INSERT INTO settings (
            key,
            value
        )
        VALUES (
            'audit.retention_days',
            '90'
        )
        ON CONFLICT(key) DO NOTHING
        """
    )

    _set_schema_version(
        connection,
        3,
    )



def _migrate_to_version_4(
    connection: sqlite3.Connection,
) -> None:
    connection.execute(
        """
        CREATE TABLE scheduled_tasks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            uuid TEXT NOT NULL UNIQUE,

            name TEXT NOT NULL,
            description TEXT,

            enabled INTEGER NOT NULL DEFAULT 1
                CHECK (enabled IN (0, 1)),

            action TEXT NOT NULL,

            target_type TEXT NOT NULL,
            node TEXT,

            guest_type TEXT
                CHECK (
                    guest_type IS NULL
                    OR guest_type IN (
                        'qemu',
                        'lxc'
                    )
                ),

            vmid INTEGER,

            payload TEXT NOT NULL DEFAULT '{}',

            repeat_enabled INTEGER NOT NULL DEFAULT 0
                CHECK (
                    repeat_enabled IN (0, 1)
                ),

            interval_value INTEGER
                CHECK (
                    interval_value IS NULL
                    OR interval_value > 0
                ),

            interval_unit TEXT
                CHECK (
                    interval_unit IS NULL
                    OR interval_unit IN (
                        'minutes',
                        'hours',
                        'days',
                        'weeks',
                        'months'
                    )
                ),

            timezone TEXT NOT NULL,

            start_at TEXT NOT NULL,
            next_run TEXT,
            last_run TEXT,

            last_result TEXT
                CHECK (
                    last_result IS NULL
                    OR last_result IN (
                        'success',
                        'failed'
                    )
                ),

            last_error TEXT,

            created_by_user_id INTEGER,
            created_by_username TEXT NOT NULL,

            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            completed_at TEXT,

            CHECK (
                (
                    repeat_enabled = 0
                    AND interval_value IS NULL
                    AND interval_unit IS NULL
                )
                OR
                (
                    repeat_enabled = 1
                    AND interval_value IS NOT NULL
                    AND interval_unit IS NOT NULL
                )
            ),

            FOREIGN KEY (
                created_by_user_id
            )
            REFERENCES users(id)
            ON DELETE SET NULL
        )
        """
    )

    connection.execute(
        """
        CREATE INDEX idx_scheduled_tasks_next_run
        ON scheduled_tasks(next_run)
        """
    )

    connection.execute(
        """
        CREATE INDEX idx_scheduled_tasks_enabled
        ON scheduled_tasks(enabled)
        """
    )

    connection.execute(
        """
        CREATE INDEX idx_scheduled_tasks_action
        ON scheduled_tasks(action)
        """
    )

    connection.execute(
        """
        CREATE TABLE scheduled_task_runs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,

            task_id INTEGER NOT NULL,

            trigger TEXT NOT NULL
                CHECK (
                    trigger IN (
                        'scheduled',
                        'manual'
                    )
                ),

            scheduled_for TEXT,
            started_at TEXT NOT NULL,
            finished_at TEXT,

            result TEXT NOT NULL
                CHECK (
                    result IN (
                        'running',
                        'success',
                        'failed'
                    )
                ),

            error TEXT,
            details TEXT,

            executed_by_user_id INTEGER,
            executed_by_username TEXT,

            FOREIGN KEY (
                task_id
            )
            REFERENCES scheduled_tasks(id)
            ON DELETE CASCADE,

            FOREIGN KEY (
                executed_by_user_id
            )
            REFERENCES users(id)
            ON DELETE SET NULL
        )
        """
    )

    connection.execute(
        """
        CREATE INDEX idx_scheduled_task_runs_task_id
        ON scheduled_task_runs(task_id)
        """
    )

    connection.execute(
        """
        CREATE INDEX idx_scheduled_task_runs_started_at
        ON scheduled_task_runs(started_at)
        """
    )

    _set_schema_version(
        connection,
        4,
    )

def _migrate_to_version_5(
    connection: sqlite3.Connection,
) -> None:
    connection.execute(
        """
        CREATE TABLE infrastructures (
            id INTEGER PRIMARY KEY AUTOINCREMENT,

            uuid TEXT NOT NULL UNIQUE,

            name TEXT NOT NULL,

            type TEXT NOT NULL
                CHECK (
                    type IN (
                        'cluster',
                        'standalone'
                    )
                ),

            description TEXT,

            enabled INTEGER NOT NULL DEFAULT 1
                CHECK (
                    enabled IN (0, 1)
                ),

            api_endpoints TEXT NOT NULL DEFAULT '[]',

            api_token_id TEXT NOT NULL,
            api_token_secret TEXT NOT NULL,

            verify_ssl INTEGER NOT NULL DEFAULT 0
                CHECK (
                    verify_ssl IN (0, 1)
                ),

            ssh_user TEXT NOT NULL DEFAULT 'root',
            ssh_key TEXT NOT NULL DEFAULT '/app/ssh/id_ed25519',

            ssh_port INTEGER NOT NULL DEFAULT 22
                CHECK (
                    ssh_port >= 1
                    AND ssh_port <= 65535
                ),

            proxmox_cluster_name TEXT,

            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )
        """
    )

    connection.execute(
        """
        CREATE INDEX idx_infrastructures_type
        ON infrastructures(type)
        """
    )

    connection.execute(
        """
        CREATE INDEX idx_infrastructures_enabled
        ON infrastructures(enabled)
        """
    )

    connection.execute(
        """
        CREATE TABLE infrastructure_nodes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,

            infrastructure_id INTEGER NOT NULL,

            node_name TEXT NOT NULL,

            host TEXT NOT NULL,

            enabled INTEGER NOT NULL DEFAULT 1
                CHECK (
                    enabled IN (0, 1)
                ),

            discovered_at TEXT,
            updated_at TEXT NOT NULL,

            UNIQUE (
                infrastructure_id,
                node_name
            ),

            FOREIGN KEY (
                infrastructure_id
            )
            REFERENCES infrastructures(id)
            ON DELETE CASCADE
        )
        """
    )

    connection.execute(
        """
        CREATE INDEX idx_infrastructure_nodes_infrastructure
        ON infrastructure_nodes(infrastructure_id)
        """
    )

    connection.execute(
        """
        CREATE INDEX idx_infrastructure_nodes_node_name
        ON infrastructure_nodes(node_name)
        """
    )

    _set_schema_version(
        connection,
        5,
    )


def _migrate_to_version_6(
    connection: sqlite3.Connection,
) -> None:
    connection.execute(
        """
        ALTER TABLE scheduled_tasks
        ADD COLUMN infrastructure_id INTEGER
        REFERENCES infrastructures(id)
        ON DELETE SET NULL
        """
    )

    connection.execute(
        """
        CREATE INDEX
        idx_scheduled_tasks_infrastructure
        ON scheduled_tasks(infrastructure_id)
        """
    )

    # Existing scheduler entries predate multi-infrastructure
    # support. Disable them until an administrator assigns
    # the correct infrastructure explicitly.
    connection.execute(
        """
        UPDATE scheduled_tasks
        SET enabled = 0
        WHERE infrastructure_id IS NULL
        """
    )

    _set_schema_version(
        connection,
        6,
    )



def _migrate_to_version_7(
    connection: sqlite3.Connection,
) -> None:
    connection.execute(
        '''
        ALTER TABLE audit_log
        ADD COLUMN infrastructure_id INTEGER
        '''
    )

    connection.execute(
        '''
        CREATE INDEX idx_audit_log_infrastructure_id
        ON audit_log(infrastructure_id)
        '''
    )

    _set_schema_version(
        connection,
        7,
    )



def _migrate_to_version_8(
    connection: sqlite3.Connection,
) -> None:
    connection.execute(
        """
        CREATE TABLE notification_settings (
            id INTEGER PRIMARY KEY
                CHECK (id = 1),

            email_enabled INTEGER NOT NULL DEFAULT 0
                CHECK (email_enabled IN (0, 1)),

            smtp_host TEXT,

            smtp_port INTEGER NOT NULL DEFAULT 587
                CHECK (
                    smtp_port >= 1
                    AND smtp_port <= 65535
                ),

            smtp_security TEXT NOT NULL DEFAULT 'starttls'
                CHECK (
                    smtp_security IN (
                        'none',
                        'starttls',
                        'tls'
                    )
                ),

            smtp_username TEXT,

            smtp_password_nonce BLOB,
            smtp_password_ciphertext BLOB,

            email_from TEXT,
            email_recipients TEXT,

            discord_enabled INTEGER NOT NULL DEFAULT 0
                CHECK (discord_enabled IN (0, 1)),

            discord_webhook_nonce BLOB,
            discord_webhook_ciphertext BLOB
        )
        """
    )

    connection.execute(
        """
        INSERT INTO notification_settings (
            id
        )
        VALUES (1)
        """
    )

    connection.execute(
        """
        CREATE TABLE notification_event_preferences (
            id INTEGER PRIMARY KEY AUTOINCREMENT,

            event_key TEXT NOT NULL UNIQUE,

            email_enabled INTEGER NOT NULL DEFAULT 0
                CHECK (
                    email_enabled IN (0, 1)
                ),

            discord_enabled INTEGER NOT NULL DEFAULT 0
                CHECK (
                    discord_enabled IN (0, 1)
                )
        )
        """
    )

    connection.execute(
        """
        CREATE INDEX
        idx_notification_event_preferences_event_key
        ON notification_event_preferences(event_key)
        """
    )

    connection.execute(
        """
        INSERT INTO settings (
            key,
            value
        )
        VALUES (
            'app.timezone',
            'UTC'
        )
        ON CONFLICT(key) DO NOTHING
        """
    )

    _set_schema_version(
        connection,
        8,
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
            schema_version = 1

        if schema_version < 2:
            _migrate_to_version_2(connection)
            schema_version = 2

        if schema_version < 3:
            _migrate_to_version_3(connection)
            schema_version = 3

        if schema_version < 4:
            _migrate_to_version_4(connection)
            schema_version = 4

        if schema_version < 5:
            _migrate_to_version_5(connection)
            schema_version = 5

        if schema_version < 6:
            _migrate_to_version_6(connection)
            schema_version = 6

        if schema_version < 7:
            _migrate_to_version_7(connection)
            schema_version = 7

        if schema_version < 8:
            _migrate_to_version_8(connection)
            schema_version = 8

        connection.commit()
