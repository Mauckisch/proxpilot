from __future__ import annotations

import os
from pathlib import Path

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ed25519


DEFAULT_PRIVATE_KEY_PATH = Path(
    "/app/ssh/id_ed25519"
)

PUBLIC_KEY_COMMENT = "proxpilot"


class SshKeyError(RuntimeError):
    pass


def _public_key_text(
    private_key: ed25519.Ed25519PrivateKey,
) -> str:
    public_key = private_key.public_key()

    public_bytes = public_key.public_bytes(
        encoding=serialization.Encoding.OpenSSH,
        format=serialization.PublicFormat.OpenSSH,
    )

    return (
        public_bytes.decode("ascii")
        + f" {PUBLIC_KEY_COMMENT}\n"
    )


def _write_public_key(
    path: Path,
    content: str,
) -> None:
    path.write_text(
        content,
        encoding="utf-8",
    )

    os.chmod(
        path,
        0o644,
    )


def ensure_ssh_keypair(
    private_key_path: Path = DEFAULT_PRIVATE_KEY_PATH,
) -> None:
    private_key_path = Path(
        private_key_path
    )

    public_key_path = Path(
        f"{private_key_path}.pub"
    )

    private_exists = (
        private_key_path.is_file()
    )

    public_exists = (
        public_key_path.is_file()
    )

    private_key_path.parent.mkdir(
        parents=True,
        exist_ok=True,
    )

    # Existing complete keypair:
    # never replace or regenerate it.
    if private_exists and public_exists:
        return

    # Private key exists but public key is missing.
    # Rebuild only the public part.
    if private_exists:
        try:
            private_data = (
                private_key_path.read_bytes()
            )

            loaded_key = (
                serialization.load_ssh_private_key(
                    private_data,
                    password=None,
                )
            )

        except Exception as exc:
            raise SshKeyError(
                "Existing ProxPilot SSH private key "
                "could not be loaded."
            ) from exc

        if not isinstance(
            loaded_key,
            ed25519.Ed25519PrivateKey,
        ):
            raise SshKeyError(
                "Existing ProxPilot SSH key is not "
                "an Ed25519 private key."
            )

        _write_public_key(
            public_key_path,
            _public_key_text(
                loaded_key
            ),
        )

        os.chmod(
            private_key_path,
            0o600,
        )

        return

    # Public key without matching private key:
    # do not silently create a replacement.
    if public_exists:
        raise SshKeyError(
            "ProxPilot SSH public key exists, but "
            "the matching private key is missing."
        )

    # No keypair exists: create a new one.
    private_key = (
        ed25519.Ed25519PrivateKey.generate()
    )

    private_bytes = (
        private_key.private_bytes(
            encoding=
                serialization.Encoding.PEM,
            format=
                serialization.PrivateFormat.OpenSSH,
            encryption_algorithm=
                serialization.NoEncryption(),
        )
    )

    private_key_path.write_bytes(
        private_bytes
    )

    os.chmod(
        private_key_path,
        0o600,
    )

    _write_public_key(
        public_key_path,
        _public_key_text(
            private_key
        ),
    )


def get_ssh_public_key(
    private_key_path: Path = DEFAULT_PRIVATE_KEY_PATH,
) -> str:
    public_key_path = Path(
        f"{private_key_path}.pub"
    )

    if not public_key_path.is_file():
        raise SshKeyError(
            "ProxPilot SSH public key is missing."
        )

    value = public_key_path.read_text(
        encoding="utf-8",
    ).strip()

    if not value.startswith(
        "ssh-ed25519 "
    ):
        raise SshKeyError(
            "ProxPilot SSH public key is invalid."
        )

    return value
