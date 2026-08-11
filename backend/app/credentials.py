from __future__ import annotations

import os
from pathlib import Path

from cryptography.hazmat.primitives.ciphers.aead import (
    AESGCM,
)


SECRET_KEY_FILE = Path(
    "/app/data/secret.key"
)

KEY_SIZE = 32
NONCE_SIZE = 12


class CredentialEncryptionError(
    RuntimeError
):
    pass


def _load_or_create_master_key() -> bytes:
    SECRET_KEY_FILE.parent.mkdir(
        parents=True,
        exist_ok=True,
    )

    if SECRET_KEY_FILE.exists():
        try:
            key = SECRET_KEY_FILE.read_bytes()
        except OSError as exc:
            raise CredentialEncryptionError(
                "ProxPilot master encryption key "
                "could not be read."
            ) from exc

        if len(key) != KEY_SIZE:
            raise CredentialEncryptionError(
                "Invalid ProxPilot master key "
                "length in /app/data/secret.key."
            )

        return key

    key = AESGCM.generate_key(
        bit_length=256,
    )

    try:
        fd = os.open(
            SECRET_KEY_FILE,
            (
                os.O_WRONLY
                | os.O_CREAT
                | os.O_EXCL
            ),
            0o600,
        )
    except FileExistsError:
        return _load_or_create_master_key()
    except OSError as exc:
        raise CredentialEncryptionError(
            "ProxPilot master encryption key "
            "could not be created."
        ) from exc

    try:
        os.write(
            fd,
            key,
        )
    finally:
        os.close(fd)

    return key


def ensure_master_key() -> None:
    _load_or_create_master_key()


def encrypt_secret(
    value: str,
) -> tuple[bytes, bytes]:
    if not value:
        raise ValueError(
            "Secret must not be empty."
        )

    key = _load_or_create_master_key()

    nonce = os.urandom(
        NONCE_SIZE
    )

    aesgcm = AESGCM(
        key
    )

    ciphertext = aesgcm.encrypt(
        nonce,
        value.encode(
            "utf-8"
        ),
        None,
    )

    return (
        nonce,
        ciphertext,
    )


def decrypt_secret(
    nonce: bytes,
    ciphertext: bytes,
) -> str:
    key = _load_or_create_master_key()

    aesgcm = AESGCM(
        key
    )

    try:
        plaintext = aesgcm.decrypt(
            nonce,
            ciphertext,
            None,
        )
    except Exception as exc:
        raise CredentialEncryptionError(
            "Encrypted ProxPilot secret "
            "could not be decrypted."
        ) from exc

    return plaintext.decode(
        "utf-8"
    )
