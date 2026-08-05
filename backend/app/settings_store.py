from __future__ import annotations

import json
from typing import Any

from .database import get_connection


def get_setting(
    key: str,
    default: str | None = None,
) -> str | None:
    with get_connection() as connection:
        row = connection.execute(
            """
            SELECT value
            FROM settings
            WHERE key = ?
            """,
            (key,),
        ).fetchone()

    if row is None:
        return default

    return str(row["value"])


def set_setting(
    key: str,
    value: str,
) -> None:
    with get_connection() as connection:
        connection.execute(
            """
            INSERT INTO settings (
                key,
                value
            )
            VALUES (?, ?)
            ON CONFLICT(key) DO UPDATE SET
                value = excluded.value
            """,
            (
                key,
                value,
            ),
        )

        connection.commit()


def delete_setting(
    key: str,
) -> bool:
    with get_connection() as connection:
        cursor = connection.execute(
            """
            DELETE FROM settings
            WHERE key = ?
            """,
            (key,),
        )

        connection.commit()

        return cursor.rowcount > 0


def get_bool_setting(
    key: str,
    default: bool = False,
) -> bool:
    value = get_setting(key)

    if value is None:
        return default

    return value.strip().lower() in {
        "1",
        "true",
        "yes",
        "on",
    }


def set_bool_setting(
    key: str,
    value: bool,
) -> None:
    set_setting(
        key,
        "true" if value else "false",
    )


def get_int_setting(
    key: str,
    default: int,
) -> int:
    value = get_setting(key)

    if value is None:
        return default

    try:
        return int(value)
    except ValueError:
        return default


def set_int_setting(
    key: str,
    value: int,
) -> None:
    set_setting(
        key,
        str(value),
    )


def get_json_setting(
    key: str,
    default: Any = None,
) -> Any:
    value = get_setting(key)

    if value is None:
        return default

    try:
        return json.loads(value)
    except json.JSONDecodeError:
        return default


def set_json_setting(
    key: str,
    value: Any,
) -> None:
    set_setting(
        key,
        json.dumps(
            value,
            ensure_ascii=False,
        ),
    )


def get_settings_by_prefix(
    prefix: str,
) -> dict[str, str]:
    with get_connection() as connection:
        rows = connection.execute(
            """
            SELECT
                key,
                value
            FROM settings
            WHERE key LIKE ?
            ORDER BY key
            """,
            (f"{prefix}%",),
        ).fetchall()

    return {
        str(row["key"]): str(row["value"])
        for row in rows
    }
