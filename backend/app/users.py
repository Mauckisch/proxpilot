from __future__ import annotations

from datetime import UTC, datetime
import sqlite3
from typing import Any

from argon2 import PasswordHasher
from argon2.exceptions import (
    InvalidHashError,
    VerifyMismatchError,
)

from .database import get_connection


password_hasher = PasswordHasher()


def _utc_now() -> str:
    return datetime.now(UTC).isoformat()


def _validate_role(role: str) -> None:
    if role not in {"admin", "operator", "viewer"}:
        raise ValueError("Invalid role.")


def _validate_source(source: str) -> None:
    if source not in {"local", "ldap"}:
        raise ValueError("Invalid user source.")


def _user_to_dict(
    user: sqlite3.Row,
) -> dict[str, Any]:
    return {
        "id": int(user["id"]),
        "username": user["username"],
        "role": user["role"],
        "enabled": bool(user["enabled"]),
        "source": user["source"],
        "created_at": user["created_at"],
        "last_login": user["last_login"],
    }


def hash_password(password: str) -> str:
    if not password:
        raise ValueError("Password must not be empty.")

    return password_hasher.hash(password)


def verify_password(
    password_hash: str,
    password: str,
) -> bool:
    try:
        return password_hasher.verify(
            password_hash,
            password,
        )
    except (
        VerifyMismatchError,
        InvalidHashError,
    ):
        return False


def create_user(
    username: str,
    password: str,
    role: str = "admin",
    source: str = "local",
) -> int:
    normalized_username = username.strip()

    if not normalized_username:
        raise ValueError("Username must not be empty.")

    _validate_role(role)
    _validate_source(source)

    if source == "local":
        password_hash = hash_password(password)
    else:
        password_hash = ""

    try:
        with get_connection() as connection:
            cursor = connection.execute(
                """
                INSERT INTO users (
                    username,
                    password_hash,
                    role,
                    enabled,
                    source,
                    created_at
                )
                VALUES (?, ?, ?, 1, ?, ?)
                """,
                (
                    normalized_username,
                    password_hash,
                    role,
                    source,
                    _utc_now(),
                ),
            )

            connection.commit()

            return int(cursor.lastrowid)

    except sqlite3.IntegrityError as exc:
        raise ValueError(
            "A user with this username already exists."
        ) from exc


def get_user_by_id(
    user_id: int,
) -> sqlite3.Row | None:
    with get_connection() as connection:
        return connection.execute(
            """
            SELECT
                id,
                username,
                password_hash,
                role,
                enabled,
                source,
                created_at,
                last_login
            FROM users
            WHERE id = ?
            """,
            (user_id,),
        ).fetchone()


def get_user_by_username(
    username: str,
) -> sqlite3.Row | None:
    with get_connection() as connection:
        return connection.execute(
            """
            SELECT
                id,
                username,
                password_hash,
                role,
                enabled,
                source,
                created_at,
                last_login
            FROM users
            WHERE username = ?
            """,
            (username.strip(),),
        ).fetchone()


def list_users() -> list[dict[str, Any]]:
    with get_connection() as connection:
        rows = connection.execute(
            """
            SELECT
                id,
                username,
                role,
                enabled,
                source,
                created_at,
                last_login
            FROM users
            ORDER BY username COLLATE NOCASE
            """
        ).fetchall()

    return [
        _user_to_dict(row)
        for row in rows
    ]


def get_public_user(
    user_id: int,
) -> dict[str, Any] | None:
    user = get_user_by_id(user_id)

    if user is None:
        return None

    return _user_to_dict(user)


def authenticate_local_user(
    username: str,
    password: str,
) -> sqlite3.Row | None:
    user = get_user_by_username(username)

    if user is None:
        return None

    if not bool(user["enabled"]):
        return None

    if user["source"] != "local":
        return None

    if not verify_password(
        user["password_hash"],
        password,
    ):
        return None

    with get_connection() as connection:
        connection.execute(
            """
            UPDATE users
            SET last_login = ?
            WHERE id = ?
            """,
            (
                _utc_now(),
                user["id"],
            ),
        )

        connection.commit()

    return get_user_by_username(username)


def update_user(
    user_id: int,
    *,
    username: str | None = None,
    role: str | None = None,
    enabled: bool | None = None,
    password: str | None = None,
) -> dict[str, Any] | None:
    existing_user = get_user_by_id(user_id)

    if existing_user is None:
        return None

    new_username = existing_user["username"]
    new_role = existing_user["role"]
    new_enabled = int(existing_user["enabled"])
    new_password_hash = existing_user["password_hash"]

    if username is not None:
        normalized_username = username.strip()

        if not normalized_username:
            raise ValueError("Username must not be empty.")

        new_username = normalized_username

    if role is not None:
        _validate_role(role)
        new_role = role

    if enabled is not None:
        new_enabled = 1 if enabled else 0

    if password is not None:
        if existing_user["source"] != "local":
            raise ValueError(
                "Passwords can only be changed for local users."
            )

        new_password_hash = hash_password(password)

    try:
        with get_connection() as connection:
            connection.execute(
                """
                UPDATE users
                SET
                    username = ?,
                    password_hash = ?,
                    role = ?,
                    enabled = ?
                WHERE id = ?
                """,
                (
                    new_username,
                    new_password_hash,
                    new_role,
                    new_enabled,
                    user_id,
                ),
            )

            connection.commit()

    except sqlite3.IntegrityError as exc:
        raise ValueError(
            "A user with this username already exists."
        ) from exc

    return get_public_user(user_id)


def delete_user(
    user_id: int,
) -> bool:
    with get_connection() as connection:
        cursor = connection.execute(
            """
            DELETE FROM users
            WHERE id = ?
            """,
            (user_id,),
        )

        connection.commit()

        return cursor.rowcount > 0


def ensure_initial_admin(
    username: str,
    password: str,
) -> None:
    normalized_username = username.strip()

    if not normalized_username:
        raise ValueError(
            "Initial admin username must not be empty."
        )

    if not password:
        raise ValueError(
            "Initial admin password must not be empty."
        )

    existing_user = get_user_by_username(
        normalized_username,
    )

    if existing_user is not None:
        return

    create_user(
        username=normalized_username,
        password=password,
        role="admin",
        source="local",
    )


def count_enabled_admins() -> int:
    with get_connection() as connection:
        row = connection.execute(
            """
            SELECT COUNT(*) AS count
            FROM users
            WHERE role = 'admin'
              AND enabled = 1
            """
        ).fetchone()

    if row is None:
        return 0

    return int(row["count"])


def authenticate_or_create_ldap_user(
    username: str,
    role: str,
) -> sqlite3.Row | None:
    normalized_username = username.strip()

    if not normalized_username:
        return None

    _validate_role(role)

    existing_user = get_user_by_username(
        normalized_username,
    )

    if existing_user is not None:
        # Ein lokaler Benutzer darf niemals durch einen
        # gleichnamigen LDAP-Benutzer übernommen werden.
        if existing_user["source"] != "ldap":
            return None

        if not bool(existing_user["enabled"]):
            return None

        with get_connection() as connection:
            connection.execute(
                """
                UPDATE users
                SET last_login = ?
                WHERE id = ?
                """,
                (
                    _utc_now(),
                    existing_user["id"],
                ),
            )

            connection.commit()

        return get_user_by_username(
            normalized_username,
        )

    create_user(
        username=normalized_username,
        password="",
        role=role,
        source="ldap",
    )

    created_user = get_user_by_username(
        normalized_username,
    )

    if created_user is None:
        return None

    with get_connection() as connection:
        connection.execute(
            """
            UPDATE users
            SET last_login = ?
            WHERE id = ?
            """,
            (
                _utc_now(),
                created_user["id"],
            ),
        )

        connection.commit()

    return get_user_by_username(
        normalized_username,
    )
