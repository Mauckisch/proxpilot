from __future__ import annotations

import json
import smtplib
import ssl
import urllib.error
import urllib.request
from email.message import EmailMessage
from typing import Literal

from .credentials import (
    decrypt_secret,
    encrypt_secret,
)
from .database import get_connection


NotificationSecurity = Literal[
    "none",
    "starttls",
    "tls",
]


EVENT_NODE_OFFLINE = "NODE_OFFLINE"
EVENT_NODE_ONLINE = "NODE_ONLINE"

EVENT_UPDATES_AVAILABLE = "UPDATES_AVAILABLE"
EVENT_UPDATE_INSTALL_SUCCESS = (
    "UPDATE_INSTALL_SUCCESS"
)
EVENT_UPDATE_INSTALL_FAILED = (
    "UPDATE_INSTALL_FAILED"
)
EVENT_PACKAGE_CLEANUP_SUCCESS = (
    "PACKAGE_CLEANUP_SUCCESS"
)
EVENT_PACKAGE_CLEANUP_FAILED = (
    "PACKAGE_CLEANUP_FAILED"
)
EVENT_REBOOT_REQUIRED = "REBOOT_REQUIRED"

EVENT_GUEST_BACKUP_SUCCESS = (
    "GUEST_BACKUP_SUCCESS"
)
EVENT_GUEST_BACKUP_FAILED = (
    "GUEST_BACKUP_FAILED"
)

EVENT_GUEST_RESTORE_SUCCESS = (
    "GUEST_RESTORE_SUCCESS"
)
EVENT_GUEST_RESTORE_FAILED = (
    "GUEST_RESTORE_FAILED"
)

EVENT_SNAPSHOT_CREATED = (
    "SNAPSHOT_CREATED"
)
EVENT_SNAPSHOT_DELETED = (
    "SNAPSHOT_DELETED"
)
EVENT_SNAPSHOT_ROLLED_BACK = (
    "SNAPSHOT_ROLLED_BACK"
)
EVENT_SNAPSHOT_FAILED = (
    "SNAPSHOT_FAILED"
)

EVENT_GUEST_MIGRATION_SUCCESS = (
    "GUEST_MIGRATION_SUCCESS"
)
EVENT_GUEST_MIGRATION_FAILED = (
    "GUEST_MIGRATION_FAILED"
)

EVENT_MAINTENANCE_ENABLED = (
    "MAINTENANCE_ENABLED"
)
EVENT_MAINTENANCE_DISABLED = (
    "MAINTENANCE_DISABLED"
)
EVENT_MAINTENANCE_FAILED = (
    "MAINTENANCE_FAILED"
)

EVENT_SCHEDULED_TASK_SUCCESS = (
    "SCHEDULED_TASK_SUCCESS"
)
EVENT_SCHEDULED_TASK_FAILED = (
    "SCHEDULED_TASK_FAILED"
)


NOTIFICATION_EVENTS = (
    EVENT_NODE_OFFLINE,
    EVENT_NODE_ONLINE,
    EVENT_UPDATES_AVAILABLE,
    EVENT_UPDATE_INSTALL_SUCCESS,
    EVENT_UPDATE_INSTALL_FAILED,
    EVENT_PACKAGE_CLEANUP_SUCCESS,
    EVENT_PACKAGE_CLEANUP_FAILED,
    EVENT_REBOOT_REQUIRED,
    EVENT_GUEST_BACKUP_SUCCESS,
    EVENT_GUEST_BACKUP_FAILED,
    EVENT_GUEST_RESTORE_SUCCESS,
    EVENT_GUEST_RESTORE_FAILED,
    EVENT_SNAPSHOT_CREATED,
    EVENT_SNAPSHOT_DELETED,
    EVENT_SNAPSHOT_ROLLED_BACK,
    EVENT_SNAPSHOT_FAILED,
    EVENT_GUEST_MIGRATION_SUCCESS,
    EVENT_GUEST_MIGRATION_FAILED,
    EVENT_MAINTENANCE_ENABLED,
    EVENT_MAINTENANCE_DISABLED,
    EVENT_MAINTENANCE_FAILED,
    EVENT_SCHEDULED_TASK_SUCCESS,
    EVENT_SCHEDULED_TASK_FAILED,
)


def _normalize_optional_string(
    value: str | None,
) -> str | None:
    if value is None:
        return None

    value = value.strip()

    return value or None


def _normalize_recipients(
    values: list[str],
) -> list[str]:
    result: list[str] = []

    for value in values:
        value = value.strip()

        if (
            value
            and value not in result
        ):
            result.append(
                value
            )

    return result


def ensure_event_preferences() -> None:
    with get_connection() as connection:
        legacy_maintenance = (
            connection.execute(
                """
                SELECT
                    email_enabled,
                    discord_enabled
                FROM notification_event_preferences
                WHERE event_key = 'MAINTENANCE_SUCCESS'
                """
            ).fetchone()
        )

        if legacy_maintenance is not None:
            for event_key in (
                EVENT_MAINTENANCE_ENABLED,
                EVENT_MAINTENANCE_DISABLED,
            ):
                existing_event = (
                    connection.execute(
                        """
                        SELECT event_key
                        FROM notification_event_preferences
                        WHERE event_key = ?
                        """,
                        (
                            event_key,
                        ),
                    ).fetchone()
                )

                if existing_event is None:
                    connection.execute(
                        """
                        INSERT INTO
                            notification_event_preferences (
                                event_key,
                                email_enabled,
                                discord_enabled
                            )
                        VALUES (?, ?, ?)
                        """,
                        (
                            event_key,
                            int(
                                legacy_maintenance[
                                    "email_enabled"
                                ]
                                or 0
                            ),
                            int(
                                legacy_maintenance[
                                    "discord_enabled"
                                ]
                                or 0
                            ),
                        ),
                    )

            connection.execute(
                """
                DELETE FROM notification_event_preferences
                WHERE event_key = 'MAINTENANCE_SUCCESS'
                """
            )

        legacy_snapshot = (
            connection.execute(
                """
                SELECT
                    email_enabled,
                    discord_enabled
                FROM notification_event_preferences
                WHERE event_key = 'SNAPSHOT_SUCCESS'
                """
            ).fetchone()
        )

        if legacy_snapshot is not None:
            for event_key in (
                EVENT_SNAPSHOT_CREATED,
                EVENT_SNAPSHOT_DELETED,
                EVENT_SNAPSHOT_ROLLED_BACK,
            ):
                existing_event = (
                    connection.execute(
                        """
                        SELECT event_key
                        FROM notification_event_preferences
                        WHERE event_key = ?
                        """,
                        (
                            event_key,
                        ),
                    ).fetchone()
                )

                if existing_event is None:
                    connection.execute(
                        """
                        INSERT INTO
                            notification_event_preferences (
                                event_key,
                                email_enabled,
                                discord_enabled
                            )
                        VALUES (?, ?, ?)
                        """,
                        (
                            event_key,
                            int(
                                legacy_snapshot[
                                    "email_enabled"
                                ]
                                or 0
                            ),
                            int(
                                legacy_snapshot[
                                    "discord_enabled"
                                ]
                                or 0
                            ),
                        ),
                    )

            connection.execute(
                """
                DELETE FROM notification_event_preferences
                WHERE event_key = 'SNAPSHOT_SUCCESS'
                """
            )

        existing = {
            str(row["event_key"])
            for row in connection.execute(
                """
                SELECT event_key
                FROM notification_event_preferences
                """
            ).fetchall()
        }

        for event_key in NOTIFICATION_EVENTS:
            if event_key in existing:
                continue

            connection.execute(
                """
                INSERT INTO
                    notification_event_preferences (
                        event_key,
                        email_enabled,
                        discord_enabled
                    )
                VALUES (?, 0, 0)
                """,
                (
                    event_key,
                ),
            )

        connection.commit()


def get_notification_settings() -> dict:
    ensure_event_preferences()

    with get_connection() as connection:
        settings = connection.execute(
            """
            SELECT *
            FROM notification_settings
            WHERE id = 1
            """
        ).fetchone()

        preferences = connection.execute(
            """
            SELECT
                event_key,
                email_enabled,
                discord_enabled
            FROM notification_event_preferences
            ORDER BY id
            """
        ).fetchall()

    if settings is None:
        raise RuntimeError(
            "Notification settings row is missing."
        )

    recipients: list[str] = []

    if settings["email_recipients"]:
        recipients = [
            value.strip()
            for value in str(
                settings["email_recipients"]
            ).splitlines()
            if value.strip()
        ]

    return {
        "email_enabled":
            bool(settings["email_enabled"]),

        "smtp_host":
            settings["smtp_host"],

        "smtp_port":
            int(settings["smtp_port"]),

        "smtp_security":
            str(settings["smtp_security"]),

        "smtp_username":
            settings["smtp_username"],

        "smtp_password_configured":
            bool(
                settings[
                    "smtp_password_nonce"
                ]
                and settings[
                    "smtp_password_ciphertext"
                ]
            ),

        "email_from":
            settings["email_from"],

        "email_recipients":
            recipients,

        "discord_enabled":
            bool(
                settings[
                    "discord_enabled"
                ]
            ),

        "discord_webhook_configured":
            bool(
                settings[
                    "discord_webhook_nonce"
                ]
                and settings[
                    "discord_webhook_ciphertext"
                ]
            ),

        "events": [
            {
                "event_key":
                    str(row["event_key"]),
                "email_enabled":
                    bool(row["email_enabled"]),
                "discord_enabled":
                    bool(
                        row[
                            "discord_enabled"
                        ]
                    ),
            }
            for row in preferences
        ],
    }


def update_discord_settings(
    *,
    enabled: bool,
    webhook_url: str | None,
) -> dict:
    with get_connection() as connection:
        if webhook_url is not None:
            webhook = webhook_url.strip()

            if webhook:
                nonce, ciphertext = (
                    encrypt_secret(
                        webhook
                    )
                )

                connection.execute(
                    """
                    UPDATE notification_settings
                    SET
                        discord_enabled = ?,
                        discord_webhook_nonce = ?,
                        discord_webhook_ciphertext = ?
                    WHERE id = 1
                    """,
                    (
                        1 if enabled else 0,
                        nonce,
                        ciphertext,
                    ),
                )
            else:
                connection.execute(
                    """
                    UPDATE notification_settings
                    SET discord_enabled = ?
                    WHERE id = 1
                    """,
                    (
                        1 if enabled else 0,
                    ),
                )
        else:
            connection.execute(
                """
                UPDATE notification_settings
                SET discord_enabled = ?
                WHERE id = 1
                """,
                (
                    1 if enabled else 0,
                ),
            )

        connection.commit()

    return get_notification_settings()


def delete_discord_settings() -> dict:
    with get_connection() as connection:
        connection.execute(
            """
            UPDATE notification_settings
            SET
                discord_enabled = 0,
                discord_webhook_nonce = NULL,
                discord_webhook_ciphertext = NULL
            WHERE id = 1
            """
        )

        connection.execute(
            """
            UPDATE notification_event_preferences
            SET discord_enabled = 0
            """
        )

        connection.commit()

    return get_notification_settings()


def update_email_settings(
    *,
    enabled: bool,
    smtp_host: str | None,
    smtp_port: int,
    smtp_security: NotificationSecurity,
    smtp_username: str | None,
    smtp_password: str | None,
    email_from: str | None,
    email_recipients: list[str],
) -> dict:
    if not 1 <= smtp_port <= 65535:
        raise ValueError(
            "Invalid SMTP port."
        )

    if smtp_security not in {
        "none",
        "starttls",
        "tls",
    }:
        raise ValueError(
            "Invalid SMTP security mode."
        )

    recipients = _normalize_recipients(
        email_recipients
    )

    with get_connection() as connection:
        connection.execute(
            """
            UPDATE notification_settings
            SET
                email_enabled = ?,
                smtp_host = ?,
                smtp_port = ?,
                smtp_security = ?,
                smtp_username = ?,
                email_from = ?,
                email_recipients = ?
            WHERE id = 1
            """,
            (
                1 if enabled else 0,
                _normalize_optional_string(
                    smtp_host
                ),
                smtp_port,
                smtp_security,
                _normalize_optional_string(
                    smtp_username
                ),
                _normalize_optional_string(
                    email_from
                ),
                "\n".join(
                    recipients
                )
                or None,
            ),
        )

        if smtp_password is not None:
            password = smtp_password.strip()

            if password:
                nonce, ciphertext = (
                    encrypt_secret(
                        password
                    )
                )

                connection.execute(
                    """
                    UPDATE notification_settings
                    SET
                        smtp_password_nonce = ?,
                        smtp_password_ciphertext = ?
                    WHERE id = 1
                    """,
                    (
                        nonce,
                        ciphertext,
                    ),
                )

        connection.commit()

    return get_notification_settings()


def delete_email_settings() -> dict:
    with get_connection() as connection:
        connection.execute(
            """
            UPDATE notification_settings
            SET
                email_enabled = 0,
                smtp_host = NULL,
                smtp_port = 587,
                smtp_security = 'starttls',
                smtp_username = NULL,
                smtp_password_nonce = NULL,
                smtp_password_ciphertext = NULL,
                email_from = NULL,
                email_recipients = NULL
            WHERE id = 1
            """
        )

        connection.execute(
            """
            UPDATE notification_event_preferences
            SET email_enabled = 0
            """
        )

        connection.commit()

    return get_notification_settings()


def update_event_preferences(
    events: list[dict],
) -> dict:
    requested = {
        str(item.get("event_key")):
            item
        for item in events
    }

    unsupported = (
        set(requested)
        - set(NOTIFICATION_EVENTS)
    )

    if unsupported:
        raise ValueError(
            "Unsupported notification event(s): "
            + ", ".join(
                sorted(
                    unsupported
                )
            )
        )

    ensure_event_preferences()

    with get_connection() as connection:
        for event_key in NOTIFICATION_EVENTS:
            item = requested.get(
                event_key
            )

            if item is None:
                continue

            connection.execute(
                """
                UPDATE notification_event_preferences
                SET
                    email_enabled = ?,
                    discord_enabled = ?
                WHERE event_key = ?
                """,
                (
                    1
                    if item.get(
                        "email_enabled"
                    )
                    else 0,
                    1
                    if item.get(
                        "discord_enabled"
                    )
                    else 0,
                    event_key,
                ),
            )

        connection.commit()

    return get_notification_settings()


def _stored_discord_webhook() -> str:
    with get_connection() as connection:
        row = connection.execute(
            """
            SELECT
                discord_webhook_nonce,
                discord_webhook_ciphertext
            FROM notification_settings
            WHERE id = 1
            """
        ).fetchone()

    if (
        row is None
        or row[
            "discord_webhook_nonce"
        ] is None
        or row[
            "discord_webhook_ciphertext"
        ] is None
    ):
        raise ValueError(
            "Discord webhook is not configured."
        )

    return decrypt_secret(
        row["discord_webhook_nonce"],
        row[
            "discord_webhook_ciphertext"
        ],
    )


def send_discord_message(
    message: str,
    *,
    webhook_url: str | None = None,
) -> None:
    resolved_webhook = (
        webhook_url.strip()
        if webhook_url
        else _stored_discord_webhook()
    )

    payload = json.dumps(
        {
            "content": message,
        }
    ).encode(
        "utf-8"
    )

    request = urllib.request.Request(
        resolved_webhook,
        data=payload,
        headers={
            "Content-Type":
                "application/json",
            "User-Agent":
                "ProxPilot/2.0",
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(
            request,
            timeout=15,
        ) as response:
            status_code = (
                response.status
            )

    except urllib.error.HTTPError as exc:
        raise RuntimeError(
            "Discord webhook returned "
            f"HTTP {exc.code}."
        ) from exc

    except urllib.error.URLError as exc:
        raise RuntimeError(
            "Discord webhook connection failed: "
            f"{exc.reason}"
        ) from exc

    if not 200 <= status_code < 300:
        raise RuntimeError(
            "Discord webhook returned "
            f"HTTP {status_code}."
        )


def _stored_email_configuration() -> dict:
    with get_connection() as connection:
        row = connection.execute(
            """
            SELECT *
            FROM notification_settings
            WHERE id = 1
            """
        ).fetchone()

    if row is None:
        raise RuntimeError(
            "Notification settings row is missing."
        )

    password: str | None = None

    if (
        row["smtp_password_nonce"]
        and row[
            "smtp_password_ciphertext"
        ]
    ):
        password = decrypt_secret(
            row[
                "smtp_password_nonce"
            ],
            row[
                "smtp_password_ciphertext"
            ],
        )

    recipients = [
        value.strip()
        for value in str(
            row["email_recipients"]
            or ""
        ).splitlines()
        if value.strip()
    ]

    return {
        "smtp_host":
            row["smtp_host"],
        "smtp_port":
            int(row["smtp_port"]),
        "smtp_security":
            str(
                row["smtp_security"]
            ),
        "smtp_username":
            row["smtp_username"],
        "smtp_password":
            password,
        "email_from":
            row["email_from"],
        "email_recipients":
            recipients,
    }


def send_email_message(
    subject: str,
    message: str,
    *,
    smtp_host: str | None = None,
    smtp_port: int | None = None,
    smtp_security: NotificationSecurity | None = None,
    smtp_username: str | None = None,
    smtp_password: str | None = None,
    email_from: str | None = None,
    email_recipients: list[str] | None = None,
) -> None:
    stored = (
        _stored_email_configuration()
    )

    resolved_host = (
        _normalize_optional_string(
            smtp_host
        )
        if smtp_host is not None
        else stored["smtp_host"]
    )

    resolved_port = (
        smtp_port
        if smtp_port is not None
        else stored["smtp_port"]
    )

    resolved_security = (
        smtp_security
        if smtp_security is not None
        else stored[
            "smtp_security"
        ]
    )

    resolved_username = (
        _normalize_optional_string(
            smtp_username
        )
        if smtp_username is not None
        else stored[
            "smtp_username"
        ]
    )

    resolved_password = (
        smtp_password
        if smtp_password
        else stored[
            "smtp_password"
        ]
    )

    resolved_from = (
        _normalize_optional_string(
            email_from
        )
        if email_from is not None
        else stored["email_from"]
    )

    resolved_recipients = (
        _normalize_recipients(
            email_recipients
        )
        if email_recipients
        is not None
        else stored[
            "email_recipients"
        ]
    )

    if not resolved_host:
        raise ValueError(
            "SMTP host is not configured."
        )

    if not resolved_from:
        raise ValueError(
            "Email sender is not configured."
        )

    if not resolved_recipients:
        raise ValueError(
            "No email recipients are configured."
        )

    email = EmailMessage()

    email["Subject"] = subject
    email["From"] = resolved_from
    email["To"] = ", ".join(
        resolved_recipients
    )

    email.set_content(
        message
    )

    context = (
        ssl.create_default_context()
    )

    try:
        if resolved_security == "tls":
            with smtplib.SMTP_SSL(
                resolved_host,
                resolved_port,
                timeout=15,
                context=context,
            ) as smtp:
                if resolved_username:
                    smtp.login(
                        resolved_username,
                        resolved_password or "",
                    )

                smtp.send_message(
                    email
                )

            return

        with smtplib.SMTP(
            resolved_host,
            resolved_port,
            timeout=15,
        ) as smtp:
            smtp.ehlo()

            if (
                resolved_security
                == "starttls"
            ):
                smtp.starttls(
                    context=context
                )
                smtp.ehlo()

            if resolved_username:
                smtp.login(
                    resolved_username,
                    resolved_password or "",
                )

            smtp.send_message(
                email
            )

    except (
        OSError,
        smtplib.SMTPException,
    ) as exc:
        raise RuntimeError(
            "Email notification failed: "
            f"{exc}"
        ) from exc


def send_notification_event(
    event_key: str,
    subject: str,
    message: str,
) -> dict[str, bool]:
    if event_key not in NOTIFICATION_EVENTS:
        raise ValueError(
            "Unsupported notification event: "
            f"{event_key}"
        )

    settings = (
        get_notification_settings()
    )

    preference = next(
        (
            item
            for item in settings["events"]
            if item["event_key"]
            == event_key
        ),
        None,
    )

    result = {
        "email": False,
        "discord": False,
    }

    if preference is None:
        return result

    if (
        settings[
            "discord_enabled"
        ]
        and preference[
            "discord_enabled"
        ]
    ):
        send_discord_message(
            message
        )
        result["discord"] = True

    if (
        settings["email_enabled"]
        and preference[
            "email_enabled"
        ]
    ):
        send_email_message(
            subject,
            message,
        )
        result["email"] = True

    return result
