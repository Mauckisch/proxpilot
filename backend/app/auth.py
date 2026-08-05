from __future__ import annotations

from dataclasses import dataclass
import time
from typing import Literal

from itsdangerous import (
    BadSignature,
    SignatureExpired,
    URLSafeTimedSerializer,
)

from .config import get_settings


SESSION_COOKIE_NAME = "proxpilot_session"
SESSION_SALT = "proxpilot-session-v2"

UserRole = Literal["admin", "viewer"]
UserSource = Literal["local", "ldap"]


class AuthenticationConfigurationError(RuntimeError):
    pass


@dataclass(frozen=True)
class SessionData:
    user_id: int
    username: str
    role: UserRole
    source: UserSource
    expires_at: int


def _get_serializer(secret: str) -> URLSafeTimedSerializer:
    return URLSafeTimedSerializer(
        secret_key=secret,
        salt=SESSION_SALT,
    )


def create_session_token(
    username: str,
    max_age: int,
    secret: str,
    user_id: int = 0,
    role: UserRole = "admin",
    source: UserSource = "local",
) -> str:
    payload = {
        "uid": user_id,
        "usr": username,
        "rol": role,
        "src": source,
        "exp": int(time.time()) + max_age,
    }

    return _get_serializer(secret).dumps(payload)


def read_session_token(
    token: str | None,
    secret: str,
    max_age: int,
) -> SessionData | None:
    if not token:
        return None

    try:
        payload = _get_serializer(secret).loads(
            token,
            max_age=max_age,
        )
    except (
        BadSignature,
        SignatureExpired,
    ):
        return None

    if not isinstance(payload, dict):
        return None

    user_id = payload.get("uid")
    username = payload.get("usr")
    role = payload.get("rol")
    source = payload.get("src")
    expires_at = payload.get("exp")

    if not isinstance(user_id, int):
        return None

    if not isinstance(username, str) or not username:
        return None

    if role not in {"admin", "viewer"}:
        return None

    if source not in {"local", "ldap"}:
        return None

    if not isinstance(expires_at, int):
        return None

    if expires_at < int(time.time()):
        return None

    return SessionData(
        user_id=user_id,
        username=username,
        role=role,
        source=source,
        expires_at=expires_at,
    )


def verify_session_token(
    token: str | None,
    expected_username: str,
    secret: str,
) -> bool:
    settings = get_settings()

    session = read_session_token(
        token=token,
        secret=secret,
        max_age=settings.proxpilot_session_max_age,
    )

    if session is None:
        return False

    return session.username == expected_username


def validate_auth_configuration() -> None:
    settings = get_settings()

    if not settings.proxpilot_auth_enabled:
        return

    missing: list[str] = []

    if not settings.proxpilot_auth_username.strip():
        missing.append("PROXPILOT_AUTH_USERNAME")

    if not settings.proxpilot_auth_password:
        missing.append("PROXPILOT_AUTH_PASSWORD")

    if len(settings.proxpilot_session_secret) < 32:
        missing.append(
            "PROXPILOT_SESSION_SECRET "
            "(at least 32 characters)"
        )

    if settings.proxpilot_session_max_age <= 0:
        missing.append(
            "PROXPILOT_SESSION_MAX_AGE "
            "(must be greater than zero)"
        )

    if missing:
        raise AuthenticationConfigurationError(
            "Invalid authentication configuration: "
            + ", ".join(missing)
        )
