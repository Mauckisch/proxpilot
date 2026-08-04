from __future__ import annotations

import base64
import hashlib
import hmac
import json
import secrets
import time

from .config import get_settings


SESSION_COOKIE_NAME = 'proxpilot_session'


class AuthenticationConfigurationError(RuntimeError):
    pass


def _encode_base64(value: bytes) -> str:
    return base64.urlsafe_b64encode(
        value,
    ).decode('ascii').rstrip('=')


def _decode_base64(value: str) -> bytes:
    padding = '=' * (-len(value) % 4)

    return base64.urlsafe_b64decode(
        (value + padding).encode('ascii'),
    )


def verify_password(
    password: str,
    configured_password: str,
) -> bool:
    return hmac.compare_digest(
        password.encode('utf-8'),
        configured_password.encode('utf-8'),
    )


def create_session_token(
    username: str,
    max_age: int,
    secret: str,
) -> str:
    payload = {
        'username': username,
        'expires_at': int(time.time()) + max_age,
        'nonce': secrets.token_urlsafe(16),
    }

    encoded_payload = _encode_base64(
        json.dumps(
            payload,
            separators=(',', ':'),
        ).encode('utf-8'),
    )

    signature = hmac.new(
        secret.encode('utf-8'),
        encoded_payload.encode('ascii'),
        hashlib.sha256,
    ).digest()

    return (
        f'{encoded_payload}.'
        f'{_encode_base64(signature)}'
    )


def verify_session_token(
    token: str | None,
    expected_username: str,
    secret: str,
) -> bool:
    if not token:
        return False

    try:
        encoded_payload, encoded_signature = token.split(
            '.',
            1,
        )

        expected_signature = hmac.new(
            secret.encode('utf-8'),
            encoded_payload.encode('ascii'),
            hashlib.sha256,
        ).digest()

        supplied_signature = _decode_base64(
            encoded_signature,
        )

        if not hmac.compare_digest(
            supplied_signature,
            expected_signature,
        ):
            return False

        payload = json.loads(
            _decode_base64(
                encoded_payload,
            ).decode('utf-8'),
        )

        username = payload.get('username')
        expires_at = payload.get('expires_at')

        if not isinstance(username, str):
            return False

        if not isinstance(expires_at, int):
            return False

        if expires_at < int(time.time()):
            return False

        return hmac.compare_digest(
            username.encode('utf-8'),
            expected_username.encode('utf-8'),
        )

    except (
        ValueError,
        TypeError,
        KeyError,
        json.JSONDecodeError,
        UnicodeDecodeError,
        base64.binascii.Error,
    ):
        return False


def validate_auth_configuration() -> None:
    settings = get_settings()

    if not settings.proxpilot_auth_enabled:
        return

    missing: list[str] = []

    if not settings.proxpilot_auth_username.strip():
        missing.append('PROXPILOT_AUTH_USERNAME')

    if not settings.proxpilot_auth_password:
        missing.append('PROXPILOT_AUTH_PASSWORD')

    if len(settings.proxpilot_session_secret) < 32:
        missing.append(
            'PROXPILOT_SESSION_SECRET '
            '(mindestens 32 Zeichen)',
        )

    if missing:
        raise AuthenticationConfigurationError(
            'Ungültige Auth-Konfiguration: '
            + ', '.join(missing)
        )


def username_matches(username: str) -> bool:
    configured_username = (
        get_settings()
        .proxpilot_auth_username
        .strip()
    )

    return hmac.compare_digest(
        username.strip().encode('utf-8'),
        configured_username.encode('utf-8'),
    )
