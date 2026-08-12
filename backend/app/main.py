import asyncio
import csv
import io
import json
import os
import platform
import socket
import sqlite3
import sys
from datetime import UTC, datetime
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError, available_timezones
from pathlib import Path
from typing import Literal

from fastapi import (
    FastAPI,
    HTTPException,
    Query,
    Request,
    Response,
)
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel, Field

from .audit import (
    clear_audit_events,
    get_audit_filter_values,
    get_client_ip,
    get_audit_summary,
    list_audit_events,
    purge_expired_audit_events,
    write_audit_event,
    write_request_audit_event,
)
from .auth import (
    SESSION_COOKIE_NAME,
    AuthenticationConfigurationError,
    create_session_token,
    read_session_token,
    validate_auth_configuration,
)
from .config import get_settings
from .settings_store import (
    get_bool_setting,
    get_int_setting,
    get_setting,
    set_bool_setting,
    set_int_setting,
    set_setting,
)
from .database import (
    CURRENT_SCHEMA_VERSION,
    DATABASE_PATH,
    get_connection,
    initialize_database,
)
from .users import (
    authenticate_local_user,
    authenticate_or_create_ldap_user,
    count_enabled_admins,
    create_user,
    delete_user,
    ensure_initial_admin,
    get_public_user,
    get_user_by_id,
    list_users,
    update_user,
)
from .host_details import (
    HostDetailsError,
    collect_host_details,
)
from .ldap_auth import (
    LdapConfiguration,
    authenticate_ldap_user,
    test_ldap_configuration,
)
from .maintenance import MaintenanceError, set_maintenance
from .routes.console import router as console_router
from .network import (
    NetworkError,
    collect_node_network,
)
from .proxmox import ProxmoxClient, ProxmoxError
from .infrastructures import (
    InfrastructureError,
    create_infrastructure,
    delete_infrastructure,
    delete_infrastructure_node,
    discover_infrastructure,
    get_infrastructure,
    list_infrastructures,
    update_infrastructure,
)
from .update_cache import update_cache
from .credentials import (
    ensure_master_key,
)
from .notifications import (
    delete_discord_settings,
    delete_email_settings,
    get_notification_settings,
    send_discord_message,
    send_email_message,
    update_discord_settings,
    update_email_settings,
    update_event_preferences,
)
from .ssh_keys import (
    SshKeyError,
    ensure_ssh_keypair,
    get_ssh_public_key,
)
from .tasks import (
    manager,
    start_backup_task,
    track_snapshot_task,
    start_package_cleanup,
    start_power_action,
    start_update_check,
    start_update_install,
    start_node_batch_action,
    track_proxmox_activity,
    create_managed_proxmox_activity,
    monitor_managed_proxmox_activity,
    start_guest_restore_task,
)
from .scheduler_worker import (
    start_manual_scheduled_task,
    start_scheduler_worker,
    stop_scheduler_worker,
)
from .scheduler import (
    SchedulerError,
    create_scheduled_task,
    delete_scheduled_task,
    get_scheduled_task,
    get_scheduled_task_target,
    list_scheduled_tasks,
    set_scheduled_task_enabled,
    update_scheduled_task,
)



class InfrastructureDiscoverPayload(BaseModel):
    endpoint: str = Field(
        min_length=1,
        max_length=1024,
    )
    token_id: str = Field(
        min_length=1,
        max_length=512,
    )
    token_secret: str = Field(
        min_length=1,
        max_length=4096,
    )
    verify_ssl: bool = False


class InfrastructureNodePayload(BaseModel):
    node_name: str = Field(
        min_length=1,
        max_length=128,
    )
    host: str = Field(
        min_length=1,
        max_length=512,
    )


class InfrastructureCreatePayload(BaseModel):
    name: str = Field(
        min_length=1,
        max_length=128,
    )
    type: Literal[
        "cluster",
        "standalone",
    ]
    description: str | None = Field(
        default=None,
        max_length=512,
    )
    enabled: bool = True
    api_endpoints: list[str]
    api_token_id: str = Field(
        min_length=1,
        max_length=512,
    )
    api_token_secret: str = Field(
        min_length=1,
        max_length=4096,
    )
    verify_ssl: bool = False
    ssh_user: str = Field(
        default="root",
        min_length=1,
        max_length=128,
    )
    ssh_key: str = Field(
        default="/app/ssh/id_ed25519",
        min_length=1,
        max_length=1024,
    )
    ssh_port: int = Field(
        default=22,
        ge=1,
        le=65535,
    )
    proxmox_cluster_name: str | None = Field(
        default=None,
        max_length=128,
    )
    nodes: list[InfrastructureNodePayload]


class InfrastructureUpdatePayload(BaseModel):
    name: str = Field(
        min_length=1,
        max_length=128,
    )
    description: str | None = Field(
        default=None,
        max_length=512,
    )
    enabled: bool = True
    verify_ssl: bool = False
    ssh_user: str = Field(
        default="root",
        min_length=1,
        max_length=128,
    )
    ssh_key: str = Field(
        default="/app/ssh/id_ed25519",
        min_length=1,
        max_length=1024,
    )
    ssh_port: int = Field(
        default=22,
        ge=1,
        le=65535,
    )


class ScheduledTaskPayload(BaseModel):
    infrastructure_id: int = Field(gt=0)
    name: str = Field(
        min_length=1,
        max_length=128,
    )
    description: str | None = Field(
        default=None,
        max_length=512,
    )
    action: str = Field(
        min_length=1,
        max_length=128,
    )
    target_type: str = Field(
        min_length=1,
        max_length=64,
    )
    node: str | None = Field(
        default=None,
        max_length=128,
    )
    nodes: list[str] = Field(
        default_factory=list,
        max_length=100,
    )
    guest_type: Literal[
        "qemu",
        "lxc",
    ] | None = None
    vmid: int | None = Field(
        default=None,
        gt=0,
    )
    payload: dict = Field(
        default_factory=dict,
    )
    repeat_enabled: bool = False
    interval_value: int | None = Field(
        default=None,
        gt=0,
    )
    interval_unit: Literal[
        "minutes",
        "hours",
        "days",
        "weeks",
        "months",
    ] | None = None
    timezone: str = Field(
        default="UTC",
        min_length=1,
        max_length=128,
    )
    start_at: str = Field(
        min_length=1,
        max_length=128,
    )
    enabled: bool = True


class ScheduledTaskEnabledPayload(BaseModel):
    enabled: bool


def load_app_version() -> str:
    version_files = (
        Path("/app/package.json"),
        Path(__file__).resolve().parents[2] / "frontend" / "package.json",
    )

    for version_file in version_files:
        try:
            package_data = json.loads(version_file.read_text(encoding="utf-8"))
            version = package_data.get("version")

            if isinstance(version, str) and version.strip():
                return version.strip()
        except (OSError, json.JSONDecodeError):
            continue

    return "unknown"


APP_VERSION = load_app_version()
APP_STARTED_AT = datetime.now(UTC)


app = FastAPI(
    title="ProxPilot Backend",
    version=APP_VERSION,
)

app.include_router(console_router)

def _database_schema_version() -> int | None:
    try:
        with get_connection() as connection:
            row = connection.execute(
                '''
                SELECT value
                FROM settings
                WHERE key = 'database_version'
                '''
            ).fetchone()

        if row is None:
            return None

        return int(row['value'])
    except (
        OSError,
        sqlite3.Error,
        TypeError,
        ValueError,
    ):
        return None


def _database_user_counts() -> dict[str, int]:
    try:
        with get_connection() as connection:
            row = connection.execute(
                '''
                SELECT
                    COUNT(*) AS total,
                    SUM(
                        CASE
                            WHEN source = 'local'
                            THEN 1
                            ELSE 0
                        END
                    ) AS local_count,
                    SUM(
                        CASE
                            WHEN source = 'ldap'
                            THEN 1
                            ELSE 0
                        END
                    ) AS ldap_count,
                    SUM(
                        CASE
                            WHEN enabled = 1
                            THEN 1
                            ELSE 0
                        END
                    ) AS enabled_count
                FROM users
                '''
            ).fetchone()

        if row is None:
            return {
                'total': 0,
                'local': 0,
                'ldap': 0,
                'enabled': 0,
            }

        return {
            'total': int(row['total'] or 0),
            'local': int(row['local_count'] or 0),
            'ldap': int(row['ldap_count'] or 0),
            'enabled': int(row['enabled_count'] or 0),
        }
    except sqlite3.Error:
        return {
            'total': 0,
            'local': 0,
            'ldap': 0,
            'enabled': 0,
        }


def _database_size_bytes() -> int | None:
    try:
        return DATABASE_PATH.stat().st_size
    except OSError:
        return None


def require_authenticated(request: Request) -> None:
    session = getattr(
        request.state,
        "session",
        None,
    )

    if session is None:
        raise HTTPException(
            status_code=401,
            detail="Authentication required.",
        )


def require_admin(request: Request) -> None:
    session = getattr(
        request.state,
        "session",
        None,
    )

    if session is None:
        raise HTTPException(
            status_code=401,
            detail="Authentication required.",
        )

    if session.role != "admin":
        raise HTTPException(
            status_code=403,
            detail="Administrator permissions required.",
        )


def require_operator_or_admin(
    request: Request,
) -> None:
    session = getattr(
        request.state,
        "session",
        None,
    )

    if session is None:
        raise HTTPException(
            status_code=401,
            detail="Authentication required.",
        )

    if session.role not in {
        "admin",
        "operator",
    }:
        raise HTTPException(
            status_code=403,
            detail=(
                "Operator or administrator "
                "permissions required."
            ),
        )


@app.on_event("startup")
async def initialize_application() -> None:
    settings = get_settings()

    initialize_database()

    ensure_master_key()

    ensure_ssh_keypair()

    if settings.proxpilot_auth_enabled:
        ensure_initial_admin(
            username=settings.proxpilot_auth_username,
            password=settings.proxpilot_auth_password,
        )

    await start_scheduler_worker()


@app.on_event("shutdown")
async def shutdown_application() -> None:
    await stop_scheduler_worker()


class AuthLogin(BaseModel):
    username: str = Field(
        min_length=1,
        max_length=128,
    )
    password: str = Field(
        min_length=1,
        max_length=1024,
    )


class UserCreate(BaseModel):
    username: str = Field(
        min_length=1,
        max_length=128,
    )
    password: str = Field(
        min_length=8,
        max_length=1024,
    )
    role: Literal[
        "admin",
        "operator",
        "viewer",
    ] = "viewer"


class UserUpdate(BaseModel):
    username: str | None = Field(
        default=None,
        min_length=1,
        max_length=128,
    )
    role: Literal[
        "admin",
        "operator",
        "viewer",
    ] | None = None
    enabled: bool | None = None


class UserPasswordUpdate(BaseModel):
    password: str = Field(
        min_length=8,
        max_length=1024,
    )


class LdapSettingsUpdate(BaseModel):
    enabled: bool = False
    server: str = Field(
        default="",
        max_length=512,
    )
    port: int = Field(
        default=389,
        ge=1,
        le=65535,
    )
    use_ssl: bool = False
    start_tls: bool = False
    verify_ssl: bool = True
    bind_dn: str = Field(
        default="",
        max_length=1024,
    )
    bind_password: str | None = Field(
        default=None,
        max_length=4096,
    )
    base_dn: str = Field(
        default="",
        max_length=1024,
    )
    user_filter: str = Field(
        default=(
            "(&(objectClass=user)"
            "(sAMAccountName={username}))"
        ),
        min_length=1,
        max_length=2048,
    )
    admin_group_dn: str = Field(
        default="",
        max_length=1024,
    )
    operator_group_dn: str = Field(
        default="",
        max_length=1024,
    )
    viewer_group_dn: str = Field(
        default="",
        max_length=1024,
    )
    default_role: Literal[
        "admin",
        "operator",
        "viewer",
    ] = "viewer"


class GuestAction(BaseModel):
    infrastructure_id: int = Field(gt=0)
    node: str
    guest_type: Literal["qemu", "lxc"]
    vmid: int = Field(gt=0)
    action: Literal[
        "start",
        "shutdown",
        "reboot",
        "stop",
        "reset",
        "suspend",
        "resume",
    ]


class GuestMigration(BaseModel):
    infrastructure_id: int = Field(gt=0)
    target_infrastructure_id: int | None = Field(
        default=None,
        gt=0,
    )
    node: str = Field(
        min_length=1,
        max_length=64,
        pattern=r"^[A-Za-z0-9._-]+$",
    )
    guest_type: Literal["qemu", "lxc"]
    vmid: int = Field(gt=0)
    target_vmid: int | None = Field(
        default=None,
        gt=0,
    )
    target: str = Field(
        min_length=1,
        max_length=64,
        pattern=r"^[A-Za-z0-9._-]+$",
    )
    online: bool = False
    restart: bool = False
    with_local_disks: bool = False
    target_storage: str | None = Field(
        default=None,
        max_length=128,
    )
    target_bridge: str | None = Field(
        default=None,
        max_length=128,
    )
    delete_source: bool = False
    confirmed: bool = False


class SnapshotCreate(BaseModel):
    infrastructure_id: int = Field(gt=0)
    node: str = Field(
        min_length=1,
        max_length=64,
        pattern=r"^[A-Za-z0-9._-]+$",
    )
    guest_type: Literal["qemu", "lxc"]
    vmid: int = Field(gt=0)
    name: str = Field(
        min_length=1,
        max_length=64,
        pattern=r"^[A-Za-z0-9_]+$",
    )
    description: str = Field(
        default="",
        max_length=500,
    )
    include_ram: bool = False


class SnapshotOperation(BaseModel):
    infrastructure_id: int = Field(gt=0)
    node: str = Field(
        min_length=1,
        max_length=64,
        pattern=r"^[A-Za-z0-9._-]+$",
    )
    guest_type: Literal["qemu", "lxc"]
    vmid: int = Field(gt=0)
    snapshot_name: str = Field(
        min_length=1,
        max_length=64,
        pattern=r"^[A-Za-z0-9._-]+$",
    )
    confirmed: bool = False


class BackupRun(BaseModel):
    infrastructure_id: int = Field(gt=0)
    job_id: str = Field(
        min_length=1,
        max_length=128,
        pattern=r"^[A-Za-z0-9._-]+$",
    )
    confirmed: bool = False


class GuestBackupRun(BaseModel):
    infrastructure_id: int = Field(gt=0)
    job_id: str = Field(
        min_length=1,
        max_length=128,
        pattern=r"^[A-Za-z0-9._-]+$",
    )
    node: str = Field(
        min_length=1,
        max_length=64,
        pattern=r"^[A-Za-z0-9._-]+$",
    )
    guest_type: Literal["qemu", "lxc"]
    vmid: int = Field(gt=0)
    confirmed: bool = False


class GuestRestore(BaseModel):
    infrastructure_id: int = Field(gt=0)

    node: str = Field(
        min_length=1,
        max_length=64,
        pattern=r"^[A-Za-z0-9._-]+$",
    )

    guest_type: Literal[
        "qemu",
        "lxc",
    ]

    vmid: int = Field(
        gt=0
    )

    archive: str = Field(
        min_length=1,
        max_length=1024,
    )

    target_storage: str | None = Field(
        default=None,
        max_length=128,
        pattern=r"^[A-Za-z0-9._-]+$",
    )

    start_after_restore: bool = False

    confirmed: bool = False


class Maintenance(BaseModel):
    infrastructure_id: int = Field(gt=0)
    node: str
    action: Literal["enable", "disable"]


class NodeAction(BaseModel):
    infrastructure_id: int = Field(gt=0)
    node: str
    action: Literal[
        "check-updates",
        "install-updates",
        "package-cleanup",
        "reboot",
        "shutdown",
    ]
    confirmed: bool = False
    acknowledge_no_maintenance: bool = False


class NodeBatchAction(BaseModel):
    infrastructure_id: int = Field(gt=0)

    nodes: list[str] = Field(
        min_length=1,
        max_length=100,
    )

    action: Literal[
        "check-updates",
        "install-updates",
        "package-cleanup",
    ]

    confirmed: bool = False


class TimezoneSettingsUpdate(
    BaseModel
):
    timezone: str = Field(
        min_length=1,
        max_length=128,
    )


class NotificationDiscordSettingsUpdate(
    BaseModel
):
    enabled: bool = False
    webhook_url: str | None = Field(
        default=None,
        max_length=2048,
    )


class NotificationEmailSettingsUpdate(
    BaseModel
):
    enabled: bool = False

    smtp_host: str | None = Field(
        default=None,
        max_length=255,
    )

    smtp_port: int = Field(
        default=587,
        ge=1,
        le=65535,
    )

    smtp_security: Literal[
        "none",
        "starttls",
        "tls",
    ] = "starttls"

    smtp_username: str | None = Field(
        default=None,
        max_length=255,
    )

    # None keeps the currently stored password.
    smtp_password: str | None = Field(
        default=None,
        max_length=4096,
    )

    email_from: str | None = Field(
        default=None,
        max_length=255,
    )

    email_recipients: list[str] = Field(
        default_factory=list,
    )


class NotificationEventPreferenceUpdate(
    BaseModel
):
    event_key: str = Field(
        min_length=1,
        max_length=100,
    )

    email_enabled: bool = False
    discord_enabled: bool = False


class NotificationEventsUpdate(
    BaseModel
):
    events: list[
        NotificationEventPreferenceUpdate
    ] = Field(
        default_factory=list,
    )


class NotificationTestRequest(
    BaseModel
):
    channel: Literal[
        "email",
        "discord",
    ]

    # Optional temporary Discord configuration.
    webhook_url: str | None = Field(
        default=None,
        max_length=2048,
    )

    # Optional temporary SMTP configuration.
    smtp_host: str | None = Field(
        default=None,
        max_length=255,
    )

    smtp_port: int | None = Field(
        default=None,
        ge=1,
        le=65535,
    )

    smtp_security: Literal[
        "none",
        "starttls",
        "tls",
    ] | None = None

    smtp_username: str | None = Field(
        default=None,
        max_length=255,
    )

    smtp_password: str | None = Field(
        default=None,
        max_length=4096,
    )

    email_from: str | None = Field(
        default=None,
        max_length=255,
    )

    email_recipients: list[str] | None = None


@app.get("/")
async def root():
    return {
        "name": "ProxPilot Backend",
        "status": "ok",
        "documentation": "/docs",
    }


@app.get("/api/health")
async def health():
    return {
        "status": "ok",
        "version": APP_VERSION,
    }


@app.get("/api/ssh/public-key")
async def ssh_public_key():
    try:
        public_key = get_ssh_public_key()

    except SshKeyError as exc:
        raise HTTPException(
            status_code=503,
            detail=str(exc),
        ) from exc

    return {
        "algorithm": "ssh-ed25519",
        "public_key": public_key,
        "private_key_path":
            "/app/ssh/id_ed25519",
    }


@app.middleware("http")
async def authentication_middleware(
    request: Request,
    call_next,
):
    settings = get_settings()

    if not settings.proxpilot_auth_enabled:
        return await call_next(request)

    public_paths = {
        "/api/health",
        "/api/auth/login",
        "/api/auth/status",
        "/api/auth/logout",
    }

    if (
        not request.url.path.startswith("/api/")
        or request.url.path in public_paths
    ):
        return await call_next(request)

    try:
        validate_auth_configuration()
    except AuthenticationConfigurationError as exc:
        return JSONResponse(
            status_code=503,
            content={
                "detail": str(exc),
            },
        )

    session = read_session_token(
        token=request.cookies.get(
            SESSION_COOKIE_NAME,
        ),
        secret=settings.proxpilot_session_secret,
        max_age=settings.proxpilot_session_max_age,
    )

    if session is None:
        return JSONResponse(
            status_code=401,
            content={
                "detail": "Authentication required.",
            },
        )

    request.state.session = session

    return await call_next(request)


@app.get("/api/auth/status")
async def auth_status(request: Request):
    settings = get_settings()

    if not settings.proxpilot_auth_enabled:
        return {
            "enabled": False,
            "authenticated": True,
            "username": None,
        }

    try:
        validate_auth_configuration()
    except AuthenticationConfigurationError as exc:
        raise HTTPException(
            status_code=503,
            detail=str(exc),
        ) from exc

    session = read_session_token(
        token=request.cookies.get(
            SESSION_COOKIE_NAME,
        ),
        secret=settings.proxpilot_session_secret,
        max_age=settings.proxpilot_session_max_age,
    )

    return {
        "enabled": True,
        "authenticated": session is not None,
        "username": (
            session.username
            if session is not None
            else None
        ),
        "role": (
            session.role
            if session is not None
            else None
        ),
        "source": (
            session.source
            if session is not None
            else None
        ),
    }


@app.post("/api/auth/login")
async def auth_login(
    credentials: AuthLogin,
    response: Response,
    request: Request,
):
    settings = get_settings()

    if not settings.proxpilot_auth_enabled:
        return {
            "ok": True,
            "authenticated": True,
        }

    try:
        validate_auth_configuration()
    except AuthenticationConfigurationError as exc:
        raise HTTPException(
            status_code=503,
            detail=str(exc),
        ) from exc

    # Lokale Benutzer werden immer zuerst geprüft.
    # LDAP ist ausschließlich eine zusätzliche
    # Authentifizierungsmethode.
    user = authenticate_local_user(
        username=credentials.username,
        password=credentials.password,
    )

    if user is None:
        ldap_user = await asyncio.to_thread(
            authenticate_ldap_user,
            credentials.username,
            credentials.password,
        )

        if ldap_user is not None:
            user = authenticate_or_create_ldap_user(
                username=ldap_user.username,
                role=ldap_user.role,
            )

    if user is None:
        write_audit_event(
            action="auth.login",
            result="failed",
            severity="warning",
            request=request,
            username=credentials.username.strip(),
            target_type="authentication",
            target="login",
            details={
                "reason": "invalid_credentials",
            },
        )

        raise HTTPException(
            status_code=401,
            detail="Invalid username or password.",
        )

    token = create_session_token(
        user_id=int(user["id"]),
        username=user["username"],
        role=user["role"],
        source=user["source"],
        max_age=settings.proxpilot_session_max_age,
        secret=settings.proxpilot_session_secret,
    )

    response.set_cookie(
        key=SESSION_COOKIE_NAME,
        value=token,
        max_age=settings.proxpilot_session_max_age,
        httponly=True,
        secure=settings.proxpilot_cookie_secure,
        samesite="lax",
        path="/",
    )

    write_audit_event(
        action="auth.login",
        result="success",
        severity="info",
        request=request,
        user_id=int(user["id"]),
        username=user["username"],
        role=user["role"],
        source=user["source"],
        target_type="authentication",
        target="login",
    )

    return {
        "ok": True,
        "authenticated": True,
        "username": user["username"],
        "role": user["role"],
        "source": user["source"],
    }


@app.post("/api/auth/logout")
async def auth_logout(
    response: Response,
    request: Request,
):
    settings = get_settings()

    session = read_session_token(
        token=request.cookies.get(
            SESSION_COOKIE_NAME,
        ),
        secret=settings.proxpilot_session_secret,
        max_age=settings.proxpilot_session_max_age,
    )

    if session is not None:
        write_audit_event(
            action="auth.logout",
            result="success",
            severity="info",
            request=request,
            user_id=session.user_id,
            username=session.username,
            role=session.role,
            source=session.source,
            target_type="authentication",
            target="logout",
        )

    response.delete_cookie(
        key=SESSION_COOKIE_NAME,
        path="/",
    )

    return {
        "ok": True,
        "authenticated": False,
    }


@app.post("/api/users", status_code=201)
async def users_create(
    user_data: UserCreate,
    request: Request,
):
    require_admin(request)

    try:
        user_id = create_user(
            username=user_data.username,
            password=user_data.password,
            role=user_data.role,
            source="local",
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=400,
            detail=str(exc),
        ) from exc

    created_user = get_public_user(user_id)

    if created_user is None:
        raise HTTPException(
            status_code=500,
            detail="User was created but could not be loaded.",
        )

    write_request_audit_event(
        request,
        action="user.create",
        result="success",
        severity="info",
        target_type="user",
        target=created_user["username"],
        details={
            "user_id": created_user["id"],
            "username": created_user["username"],
            "role": created_user["role"],
            "source": created_user["source"],
            "enabled": created_user["enabled"],
        },
    )

    return created_user


@app.get("/api/users")
async def users_list(request: Request):
    session = request.state.session

    if session.role != "admin":
        raise HTTPException(
            status_code=403,
            detail="Administrator permissions required.",
        )

    return {
        "users": list_users(),
    }


@app.patch("/api/users/{user_id}")
async def users_update(
    user_id: int,
    user_data: UserUpdate,
    request: Request,
):
    require_admin(request)

    existing_user = get_user_by_id(user_id)

    if existing_user is None:
        raise HTTPException(
            status_code=404,
            detail="User not found.",
        )

    current_user_id = request.state.session.user_id

    if user_id == current_user_id:
        if user_data.enabled is False:
            raise HTTPException(
                status_code=400,
                detail="You cannot disable your own account.",
            )

        if (
            user_data.role is not None
            and user_data.role != "admin"
        ):
            raise HTTPException(
                status_code=400,
                detail="You cannot remove your own administrator role.",
            )

    removes_enabled_admin = (
        existing_user["role"] == "admin"
        and bool(existing_user["enabled"])
        and (
            (
                user_data.role is not None
                and user_data.role != "admin"
            )
            or user_data.enabled is False
        )
    )

    if removes_enabled_admin and count_enabled_admins() <= 1:
        raise HTTPException(
            status_code=400,
            detail="The last enabled administrator cannot be changed.",
        )

    try:
        updated_user = update_user(
            user_id,
            username=user_data.username,
            role=user_data.role,
            enabled=user_data.enabled,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=400,
            detail=str(exc),
        ) from exc

    if updated_user is None:
        raise HTTPException(
            status_code=404,
            detail="User not found.",
        )

    write_request_audit_event(
        request,
        action="user.update",
        result="success",
        severity="info",
        target_type="user",
        target=updated_user["username"],
        details={
            "user_id": updated_user["id"],
            "old_username": existing_user["username"],
            "new_username": updated_user["username"],
            "old_role": existing_user["role"],
            "new_role": updated_user["role"],
            "old_enabled": bool(existing_user["enabled"]),
            "new_enabled": updated_user["enabled"],
            "source": updated_user["source"],
        },
    )

    return updated_user


@app.post("/api/users/{user_id}/password")
async def users_update_password(
    user_id: int,
    password_data: UserPasswordUpdate,
    request: Request,
):
    require_admin(request)

    existing_user = get_user_by_id(user_id)

    if existing_user is None:
        raise HTTPException(
            status_code=404,
            detail="User not found.",
        )

    if existing_user["source"] != "local":
        raise HTTPException(
            status_code=400,
            detail="Passwords can only be changed for local users.",
        )

    try:
        updated_user = update_user(
            user_id,
            password=password_data.password,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=400,
            detail=str(exc),
        ) from exc

    if updated_user is None:
        raise HTTPException(
            status_code=404,
            detail="User not found.",
        )

    write_request_audit_event(
        request,
        action="user.password.change",
        result="success",
        severity="warning",
        target_type="user",
        target=updated_user["username"],
        details={
            "user_id": updated_user["id"],
            "username": updated_user["username"],
            "source": updated_user["source"],
        },
    )

    return {
        "ok": True,
        "user": updated_user,
    }


@app.delete("/api/users/{user_id}")
async def users_delete(
    user_id: int,
    request: Request,
):
    require_admin(request)

    existing_user = get_user_by_id(user_id)

    if existing_user is None:
        raise HTTPException(
            status_code=404,
            detail="User not found.",
        )

    if user_id == request.state.session.user_id:
        raise HTTPException(
            status_code=400,
            detail="You cannot delete your own account.",
        )

    removes_enabled_admin = (
        existing_user["role"] == "admin"
        and bool(existing_user["enabled"])
    )

    if removes_enabled_admin and count_enabled_admins() <= 1:
        raise HTTPException(
            status_code=400,
            detail="The last enabled administrator cannot be deleted.",
        )

    if not delete_user(user_id):
        raise HTTPException(
            status_code=404,
            detail="User not found.",
        )

    write_request_audit_event(
        request,
        action="user.delete",
        result="success",
        severity="warning",
        target_type="user",
        target=existing_user["username"],
        details={
            "user_id": user_id,
            "username": existing_user["username"],
            "role": existing_user["role"],
            "source": existing_user["source"],
            "enabled": bool(existing_user["enabled"]),
        },
    )

    return {
        "ok": True,
        "deleted_user_id": user_id,
    }


@app.post("/api/settings/ldap/test")
async def ldap_settings_test(
    ldap_data: LdapSettingsUpdate,
    request: Request,
):
    require_admin(request)

    defaults = get_settings()

    bind_password = (
        ldap_data.bind_password
        if ldap_data.bind_password is not None
        else (
            get_setting(
                "ldap.bind_password",
                defaults.proxpilot_ldap_bind_password,
            )
            or ""
        )
    )

    configuration = LdapConfiguration(
        enabled=ldap_data.enabled,
        server=ldap_data.server.strip(),
        port=ldap_data.port,
        use_ssl=ldap_data.use_ssl,
        start_tls=ldap_data.start_tls,
        verify_ssl=ldap_data.verify_ssl,
        bind_dn=ldap_data.bind_dn.strip(),
        bind_password=bind_password,
        base_dn=ldap_data.base_dn.strip(),
        user_filter=ldap_data.user_filter.strip(),
        admin_group_dn=(
            ldap_data.admin_group_dn.strip()
        ),
        operator_group_dn=(
            ldap_data.operator_group_dn.strip()
        ),
        viewer_group_dn=(
            ldap_data.viewer_group_dn.strip()
        ),
        default_role=ldap_data.default_role,
    )

    try:
        result = await asyncio.to_thread(
            test_ldap_configuration,
            configuration,
        )

        write_request_audit_event(
            request,
            action="ldap.test",
            result="success",
            severity="info",
            target_type="ldap",
            target=configuration.server,
            details={
                "server": configuration.server,
                "port": configuration.port,
                "use_ssl": configuration.use_ssl,
                "start_tls": configuration.start_tls,
                "verify_ssl": configuration.verify_ssl,
                "base_dn": configuration.base_dn,
                "bind_dn_configured": bool(
                    configuration.bind_dn
                ),
            },
        )

        return result

    except ValueError as exc:
        write_request_audit_event(
            request,
            action="ldap.test",
            result="failed",
            severity="warning",
            target_type="ldap",
            target=configuration.server,
            details={
                "server": configuration.server,
                "port": configuration.port,
                "error": str(exc),
            },
        )

        raise HTTPException(
            status_code=400,
            detail=str(exc),
        ) from exc


@app.get("/api/settings/ldap")
async def ldap_settings_get(
    request: Request,
):
    require_admin(request)

    defaults = get_settings()

    stored_password = get_setting(
        "ldap.bind_password",
        defaults.proxpilot_ldap_bind_password,
    ) or ""

    return {
        "enabled": get_bool_setting(
            "ldap.enabled",
            defaults.proxpilot_ldap_enabled,
        ),
        "server": get_setting(
            "ldap.server",
            defaults.proxpilot_ldap_server,
        ) or "",
        "port": get_int_setting(
            "ldap.port",
            defaults.proxpilot_ldap_port,
        ),
        "use_ssl": get_bool_setting(
            "ldap.use_ssl",
            defaults.proxpilot_ldap_use_ssl,
        ),
        "start_tls": get_bool_setting(
            "ldap.start_tls",
            defaults.proxpilot_ldap_start_tls,
        ),
        "verify_ssl": get_bool_setting(
            "ldap.verify_ssl",
            defaults.proxpilot_ldap_verify_ssl,
        ),
        "bind_dn": get_setting(
            "ldap.bind_dn",
            defaults.proxpilot_ldap_bind_dn,
        ) or "",
        "bind_password_configured": bool(
            stored_password
        ),
        "base_dn": get_setting(
            "ldap.base_dn",
            defaults.proxpilot_ldap_base_dn,
        ) or "",
        "user_filter": get_setting(
            "ldap.user_filter",
            defaults.proxpilot_ldap_user_filter,
        ) or defaults.proxpilot_ldap_user_filter,
        "admin_group_dn": get_setting(
            "ldap.admin_group_dn",
            defaults.proxpilot_ldap_admin_group_dn,
        ) or "",
        "operator_group_dn": get_setting(
            "ldap.operator_group_dn",
            defaults.proxpilot_ldap_operator_group_dn,
        ) or "",
        "viewer_group_dn": get_setting(
            "ldap.viewer_group_dn",
            defaults.proxpilot_ldap_viewer_group_dn,
        ) or "",
        "default_role": get_setting(
            "ldap.default_role",
            defaults.proxpilot_ldap_default_role,
        ) or "viewer",
    }


@app.put("/api/settings/ldap")
async def ldap_settings_update(
    ldap_data: LdapSettingsUpdate,
    request: Request,
):
    require_admin(request)

    server = ldap_data.server.strip()
    bind_dn = ldap_data.bind_dn.strip()
    base_dn = ldap_data.base_dn.strip()
    user_filter = ldap_data.user_filter.strip()

    if ldap_data.enabled:
        missing = []

        if not server:
            missing.append("server")

        if not base_dn:
            missing.append("base DN")

        if "{username}" not in user_filter:
            raise HTTPException(
                status_code=400,
                detail=(
                    "The LDAP user filter must contain "
                    "{username}."
                ),
            )

        if missing:
            raise HTTPException(
                status_code=400,
                detail=(
                    "LDAP cannot be enabled because these "
                    "values are missing: "
                    + ", ".join(missing)
                    + "."
                ),
            )

    if ldap_data.use_ssl and ldap_data.start_tls:
        raise HTTPException(
            status_code=400,
            detail=(
                "LDAPS and StartTLS cannot be enabled "
                "at the same time."
            ),
        )

    set_bool_setting(
        "ldap.enabled",
        ldap_data.enabled,
    )
    set_setting(
        "ldap.server",
        server,
    )
    set_int_setting(
        "ldap.port",
        ldap_data.port,
    )
    set_bool_setting(
        "ldap.use_ssl",
        ldap_data.use_ssl,
    )
    set_bool_setting(
        "ldap.start_tls",
        ldap_data.start_tls,
    )
    set_bool_setting(
        "ldap.verify_ssl",
        ldap_data.verify_ssl,
    )
    set_setting(
        "ldap.bind_dn",
        bind_dn,
    )
    set_setting(
        "ldap.base_dn",
        base_dn,
    )
    set_setting(
        "ldap.user_filter",
        user_filter,
    )
    set_setting(
        "ldap.admin_group_dn",
        ldap_data.admin_group_dn.strip(),
    )
    set_setting(
        "ldap.operator_group_dn",
        ldap_data.operator_group_dn.strip(),
    )
    set_setting(
        "ldap.viewer_group_dn",
        ldap_data.viewer_group_dn.strip(),
    )
    set_setting(
        "ldap.default_role",
        ldap_data.default_role,
    )

    if ldap_data.bind_password is not None:
        set_setting(
            "ldap.bind_password",
            ldap_data.bind_password,
        )

    write_request_audit_event(
        request,
        action="ldap.settings.update",
        result="success",
        severity="warning",
        target_type="ldap",
        target=server or "LDAP",
        details={
            "enabled": ldap_data.enabled,
            "server": server,
            "port": ldap_data.port,
            "use_ssl": ldap_data.use_ssl,
            "start_tls": ldap_data.start_tls,
            "verify_ssl": ldap_data.verify_ssl,
            "bind_dn": bind_dn,
            "bind_password_changed":
                ldap_data.bind_password is not None,
            "base_dn": base_dn,
            "user_filter": user_filter,
            "admin_group_dn":
                ldap_data.admin_group_dn.strip(),
            "operator_group_dn":
                ldap_data.operator_group_dn.strip(),
            "viewer_group_dn":
                ldap_data.viewer_group_dn.strip(),
            "default_role":
                ldap_data.default_role,
        },
    )

    return {
        "ok": True,
        "message": "LDAP settings saved.",
    }


@app.get("/api/audit")
async def audit_log_list(
    request: Request,
    limit: int = Query(
        default=100,
        ge=1,
        le=500,
    ),
    offset: int = Query(
        default=0,
        ge=0,
    ),
    username: list[str] | None = Query(
        default=None,
    ),
    role: list[str] | None = Query(
        default=None,
    ),
    source: list[str] | None = Query(
        default=None,
    ),
    action: list[str] | None = Query(
        default=None,
    ),
    result: list[str] | None = Query(
        default=None,
    ),
    severity: list[str] | None = Query(
        default=None,
    ),
    node: list[str] | None = Query(
        default=None,
    ),
    infrastructure_id: list[int] | None = Query(
        default=None,
    ),
    target_type: list[str] | None = Query(
        default=None,
    ),
    search: str | None = Query(
        default=None,
        max_length=256,
    ),
    date_from: str | None = Query(
        default=None,
        max_length=64,
    ),
    date_to: str | None = Query(
        default=None,
        max_length=64,
    ),
):
    require_operator_or_admin(request)

    retention_days = get_int_setting(
        "audit.retention_days",
        90,
    )

    purge_expired_audit_events(
        retention_days
    )

    events, total = list_audit_events(
        limit=limit,
        offset=offset,
        usernames=username,
        roles=role,
        sources=source,
        actions=action,
        results=result,
        severities=severity,
        nodes=node,
        infrastructure_ids=infrastructure_id,
        target_types=target_type,
        search=search,
        date_from=date_from,
        date_to=date_to,
    )

    infrastructures = {
        int(item["id"]): item
        for item in list_infrastructures()
    }

    for event in events:
        infrastructure = infrastructures.get(
            event.get("infrastructure_id")
        )

        event["infrastructure_name"] = (
            infrastructure.get("name")
            if infrastructure
            else None
        )

        event["infrastructure_type"] = (
            infrastructure.get("type")
            if infrastructure
            else None
        )

    return {
        "events": events,
        "total": total,
        "limit": limit,
        "offset": offset,
        "retention_days": retention_days,
        "infrastructures": [
            {
                "id": int(item["id"]),
                "name": str(item["name"]),
                "type": str(item["type"]),
            }
            for item in infrastructures.values()
        ],
        "filters": get_audit_filter_values(
            usernames=username,
            roles=role,
            sources=source,
            actions=action,
            results=result,
            severities=severity,
            nodes=node,
            infrastructure_ids=infrastructure_id,
            target_types=target_type,
            search=search,
            date_from=date_from,
            date_to=date_to,
        ),
        "summary": get_audit_summary(),
    }


@app.get("/api/audit/export/csv")
async def audit_export_csv(
    request: Request,
    username: list[str] | None = Query(
        default=None,
    ),
    role: list[str] | None = Query(
        default=None,
    ),
    source: list[str] | None = Query(
        default=None,
    ),
    action: list[str] | None = Query(
        default=None,
    ),
    result: list[str] | None = Query(
        default=None,
    ),
    severity: list[str] | None = Query(
        default=None,
    ),
    node: list[str] | None = Query(
        default=None,
    ),
    infrastructure_id: list[int] | None = Query(
        default=None,
    ),
    target_type: list[str] | None = Query(
        default=None,
    ),
    search: str | None = Query(
        default=None,
        max_length=256,
    ),
    date_from: str | None = Query(
        default=None,
        max_length=64,
    ),
    date_to: str | None = Query(
        default=None,
        max_length=64,
    ),
):
    require_operator_or_admin(request)

    events, _ = list_audit_events(
        limit=100000,
        offset=0,
        usernames=username,
        roles=role,
        sources=source,
        actions=action,
        results=result,
        severities=severity,
        nodes=node,
        infrastructure_ids=infrastructure_id,
        target_types=target_type,
        search=search,
        date_from=date_from,
        date_to=date_to,
    )

    infrastructures = {
        int(item["id"]): item
        for item in list_infrastructures()
    }

    buffer = io.StringIO()
    writer = csv.writer(buffer)

    writer.writerow([
        "id",
        "created_at",
        "username",
        "role",
        "source",
        "ip_address",
        "action",
        "target_type",
        "target",
        "node",
        "infrastructure_id",
        "infrastructure_name",
        "result",
        "severity",
        "duration_ms",
        "details",
    ])

    for event in events:
        details = event.get("details")

        if isinstance(details, (dict, list)):
            details = json.dumps(
                details,
                ensure_ascii=False,
            )

        writer.writerow([
            event.get("id"),
            event.get("created_at"),
            event.get("username"),
            event.get("role"),
            event.get("source"),
            event.get("ip_address"),
            event.get("action"),
            event.get("target_type"),
            event.get("target"),
            event.get("node"),
            event.get("infrastructure_id"),
            (
                infrastructures.get(
                    event.get("infrastructure_id")
                ) or {}
            ).get("name"),
            event.get("result"),
            event.get("severity"),
            event.get("duration_ms"),
            details,
        ])

    filename = (
        "proxpilot-audit-"
        + datetime.now(UTC).strftime("%Y%m%d-%H%M%S")
        + ".csv"
    )

    write_request_audit_event(
        request,
        action="audit.export.csv",
        result="success",
        severity="info",
        target_type="audit",
        target="export",
        details={
            "entries": len(events),
        },
    )

    return StreamingResponse(
        iter([buffer.getvalue()]),
        media_type="text/csv; charset=utf-8",
        headers={
            "Content-Disposition":
                f'attachment; filename="{filename}"',
        },
    )


@app.get("/api/audit/export/json")
async def audit_export_json(
    request: Request,
    username: list[str] | None = Query(
        default=None,
    ),
    role: list[str] | None = Query(
        default=None,
    ),
    source: list[str] | None = Query(
        default=None,
    ),
    action: list[str] | None = Query(
        default=None,
    ),
    result: list[str] | None = Query(
        default=None,
    ),
    severity: list[str] | None = Query(
        default=None,
    ),
    node: list[str] | None = Query(
        default=None,
    ),
    infrastructure_id: list[int] | None = Query(
        default=None,
    ),
    target_type: list[str] | None = Query(
        default=None,
    ),
    search: str | None = Query(
        default=None,
        max_length=256,
    ),
    date_from: str | None = Query(
        default=None,
        max_length=64,
    ),
    date_to: str | None = Query(
        default=None,
        max_length=64,
    ),
):
    require_operator_or_admin(request)

    events, _ = list_audit_events(
        limit=100000,
        offset=0,
        usernames=username,
        roles=role,
        sources=source,
        actions=action,
        results=result,
        severities=severity,
        nodes=node,
        infrastructure_ids=infrastructure_id,
        target_types=target_type,
        search=search,
        date_from=date_from,
        date_to=date_to,
    )

    filename = (
        "proxpilot-audit-"
        + datetime.now(UTC).strftime("%Y%m%d-%H%M%S")
        + ".json"
    )

    write_request_audit_event(
        request,
        action="audit.export.json",
        result="success",
        severity="info",
        target_type="audit",
        target="export",
        details={
            "entries": len(events),
        },
    )

    infrastructures = {
        int(item["id"]): item
        for item in list_infrastructures()
    }

    for event in events:
        infrastructure = infrastructures.get(
            event.get("infrastructure_id")
        )

        event["infrastructure_name"] = (
            infrastructure.get("name")
            if infrastructure
            else None
        )

        event["infrastructure_type"] = (
            infrastructure.get("type")
            if infrastructure
            else None
        )

    payload = json.dumps(
        events,
        ensure_ascii=False,
        indent=2,
    )

    return StreamingResponse(
        iter([payload]),
        media_type="application/json; charset=utf-8",
        headers={
            "Content-Disposition":
                f'attachment; filename="{filename}"',
        },
    )


@app.get("/api/audit/settings")
async def audit_settings_get(
    request: Request,
):
    require_operator_or_admin(request)

    return {
        "retention_days": get_int_setting(
            "audit.retention_days",
            90,
        ),
    }


@app.put("/api/audit/settings")
async def audit_settings_update(
    request: Request,
    retention_days: int = Query(
        ge=1,
        le=3650,
    ),
):
    require_admin(request)

    old_retention = get_int_setting(
        "audit.retention_days",
        90,
    )

    set_int_setting(
        "audit.retention_days",
        retention_days,
    )

    deleted = purge_expired_audit_events(
        retention_days
    )

    write_request_audit_event(
        request,
        action="audit.retention.update",
        result="success",
        severity="warning",
        target_type="audit",
        target="retention",
        details={
            "old_retention_days":
                old_retention,
            "new_retention_days":
                retention_days,
            "expired_entries_deleted":
                deleted,
        },
    )

    return {
        "ok": True,
        "retention_days":
            retention_days,
        "deleted":
            deleted,
    }


@app.delete("/api/audit")
async def audit_log_clear(
    request: Request,
    confirmed: bool = Query(
        default=False,
    ),
):
    require_admin(request)

    if not confirmed:
        raise HTTPException(
            status_code=400,
            detail=(
                "Das Löschen des Audit-Logs "
                "muss ausdrücklich bestätigt werden."
            ),
        )

    deleted = clear_audit_events()

    # Der Löschvorgang selbst wird anschließend
    # wieder als erster neuer Audit-Eintrag angelegt.
    write_request_audit_event(
        request,
        action="audit.clear",
        result="success",
        severity="warning",
        target_type="audit",
        target="all",
        details={
            "deleted_entries":
                deleted,
        },
    )

    return {
        "ok": True,
        "deleted": deleted,
    }


@app.get("/api/system")
async def system_information(
    request: Request,
):
    require_operator_or_admin(request)

    settings = get_settings()
    now = datetime.now(UTC)
    uptime_seconds = int(
        (now - APP_STARTED_AT).total_seconds()
    )

    ldap_enabled = get_bool_setting(
        'ldap.enabled',
        settings.proxpilot_ldap_enabled,
    )

    return {
        'application': {
            'name': 'ProxPilot',
            'version': APP_VERSION,
            'started_at': APP_STARTED_AT.isoformat(),
            'uptime_seconds': uptime_seconds,
        },
        'runtime': {
            'python_version': platform.python_version(),
            'python_implementation': (
                platform.python_implementation()
            ),
            'platform': platform.platform(),
            'system': platform.system(),
            'release': platform.release(),
            'machine': platform.machine(),
            'architecture': platform.architecture()[0],
            'hostname': socket.gethostname(),
            'process_id': os.getpid(),
        },
        'database': {
            'engine': 'SQLite',
            'sqlite_version': sqlite3.sqlite_version,
            'path': str(DATABASE_PATH),
            'size_bytes': _database_size_bytes(),
            'schema_version': _database_schema_version(),
            'supported_schema_version': (
                CURRENT_SCHEMA_VERSION
            ),
        },
        'authentication': {
            'enabled': settings.proxpilot_auth_enabled,
            'local_enabled': True,
            'ldap_enabled': ldap_enabled,
            'session_max_age': (
                settings.proxpilot_session_max_age
            ),
            'cookie_secure': (
                settings.proxpilot_cookie_secure
            ),
            'users': _database_user_counts(),
        },
        'api': {
            'refresh_interval': (
                settings.refresh_interval
            ),
            'docs_path': '/docs',
        },
        'current_user': {
            'id': request.state.session.user_id,
            'username': (
                request.state.session.username
            ),
            'role': request.state.session.role,
            'source': request.state.session.source,
        },
    }


@app.get("/api/infrastructures")
async def infrastructure_list(
    request: Request,
):
    require_authenticated(request)

    return {
        "infrastructures":
            list_infrastructures(),
    }


@app.get("/api/infrastructures/{infrastructure_id}")
async def infrastructure_get(
    infrastructure_id: int,
    request: Request,
):
    require_authenticated(request)

    infrastructure = get_infrastructure(
        infrastructure_id
    )

    if infrastructure is None:
        raise HTTPException(
            status_code=404,
            detail="Infrastructure not found.",
        )

    return infrastructure


@app.post("/api/infrastructures/discover")
async def infrastructure_discover(
    payload: InfrastructureDiscoverPayload,
    request: Request,
):
    require_admin(request)

    try:
        return await discover_infrastructure(
            endpoint=payload.endpoint,
            token_id=payload.token_id,
            token_secret=payload.token_secret,
            verify_ssl=payload.verify_ssl,
        )

    except InfrastructureError as exc:
        raise HTTPException(
            status_code=400,
            detail=str(exc),
        ) from exc


@app.post("/api/infrastructures")
async def infrastructure_create(
    payload: InfrastructureCreatePayload,
    request: Request,
):
    require_admin(request)

    try:
        return create_infrastructure(
            name=payload.name,
            infrastructure_type=payload.type,
            description=payload.description,
            api_endpoints=payload.api_endpoints,
            api_token_id=payload.api_token_id,
            api_token_secret=payload.api_token_secret,
            verify_ssl=payload.verify_ssl,
            ssh_user=payload.ssh_user,
            ssh_key=payload.ssh_key,
            ssh_port=payload.ssh_port,
            proxmox_cluster_name=(
                payload.proxmox_cluster_name
            ),
            nodes=[
                node.model_dump()
                for node in payload.nodes
            ],
            enabled=payload.enabled,
        )

    except InfrastructureError as exc:
        raise HTTPException(
            status_code=400,
            detail=str(exc),
        ) from exc


@app.put("/api/infrastructures/{infrastructure_id}")
async def infrastructure_update(
    infrastructure_id: int,
    payload: InfrastructureUpdatePayload,
    request: Request,
):
    require_admin(request)

    try:
        return update_infrastructure(
            infrastructure_id,
            name=payload.name,
            description=payload.description,
            enabled=payload.enabled,
            verify_ssl=payload.verify_ssl,
            ssh_user=payload.ssh_user,
            ssh_key=payload.ssh_key,
            ssh_port=payload.ssh_port,
        )

    except InfrastructureError as exc:
        raise HTTPException(
            status_code=404
            if "not found" in str(exc).lower()
            else 400,
            detail=str(exc),
        ) from exc


@app.delete(
    "/api/infrastructures/"
    "{infrastructure_id}/nodes/{node_id}"
)
async def infrastructure_node_delete(
    infrastructure_id: int,
    node_id: int,
    request: Request,
):
    require_admin(request)

    try:
        deleted = delete_infrastructure_node(
            infrastructure_id,
            node_id,
        )

        return {
            "ok": True,
            "deleted_node_id":
                deleted["id"],
            "deleted_node_name":
                deleted["node_name"],
        }

    except InfrastructureError as exc:
        raise HTTPException(
            status_code=404
            if "not found" in str(exc).lower()
            else 400,
            detail=str(exc),
        ) from exc


@app.delete("/api/infrastructures/{infrastructure_id}")
async def infrastructure_delete(
    infrastructure_id: int,
    request: Request,
):
    require_admin(request)

    try:
        deleted = delete_infrastructure(
            infrastructure_id
        )

        return {
            "ok": True,
            "deleted_id":
                infrastructure_id,
            "deleted_name":
                deleted["name"],
        }

    except InfrastructureError as exc:
        raise HTTPException(
            status_code=404,
            detail=str(exc),
        ) from exc


@app.get("/api/notifications/settings")
async def notification_settings_get(
    request: Request,
):
    require_admin(request)

    return get_notification_settings()


@app.patch("/api/notifications/settings/discord")
async def notification_discord_settings_update(
    payload: NotificationDiscordSettingsUpdate,
    request: Request,
):
    require_admin(request)

    try:
        return update_discord_settings(
            enabled=payload.enabled,
            webhook_url=payload.webhook_url,
        )

    except ValueError as exc:
        raise HTTPException(
            status_code=422,
            detail=str(exc),
        ) from exc


@app.delete("/api/notifications/settings/discord")
async def notification_discord_settings_delete(
    request: Request,
):
    require_admin(request)

    return delete_discord_settings()


@app.patch("/api/notifications/settings/email")
async def notification_email_settings_update(
    payload: NotificationEmailSettingsUpdate,
    request: Request,
):
    require_admin(request)

    try:
        return update_email_settings(
            enabled=payload.enabled,
            smtp_host=payload.smtp_host,
            smtp_port=payload.smtp_port,
            smtp_security=payload.smtp_security,
            smtp_username=payload.smtp_username,
            smtp_password=payload.smtp_password,
            email_from=payload.email_from,
            email_recipients=(
                payload.email_recipients
            ),
        )

    except ValueError as exc:
        raise HTTPException(
            status_code=422,
            detail=str(exc),
        ) from exc


@app.delete("/api/notifications/settings/email")
async def notification_email_settings_delete(
    request: Request,
):
    require_admin(request)

    return delete_email_settings()


@app.patch("/api/notifications/settings/events")
async def notification_events_update(
    payload: NotificationEventsUpdate,
    request: Request,
):
    require_admin(request)

    try:
        events = [
            item.model_dump()
            for item in payload.events
        ]

        return update_event_preferences(
            events
        )

    except ValueError as exc:
        raise HTTPException(
            status_code=422,
            detail=str(exc),
        ) from exc


@app.post("/api/notifications/test")
async def notification_test(
    payload: NotificationTestRequest,
    request: Request,
):
    require_admin(request)

    try:
        if payload.channel == "discord":
            send_discord_message(
                (
                    "🔔 **ProxPilot**\n\n"
                    "Discord notifications are configured "
                    "correctly.\n\n"
                    "This is a test notification from "
                    "ProxPilot."
                ),
                webhook_url=payload.webhook_url,
            )

            return {
                "channel": "discord",
                "success": True,
            }

        send_email_message(
            "ProxPilot - Test Notification",
            (
                "ProxPilot\n\n"
                "Email notifications are configured "
                "correctly.\n\n"
                "This is a test notification from "
                "ProxPilot."
            ),
            smtp_host=payload.smtp_host,
            smtp_port=payload.smtp_port,
            smtp_security=payload.smtp_security,
            smtp_username=payload.smtp_username,
            smtp_password=payload.smtp_password,
            email_from=payload.email_from,
            email_recipients=(
                payload.email_recipients
            ),
        )

        return {
            "channel": "email",
            "success": True,
        }

    except (
        ValueError,
        RuntimeError,
    ) as exc:
        raise HTTPException(
            status_code=502,
            detail=str(exc),
        ) from exc


@app.get("/api/settings/regional")
async def regional_settings_get(
    request: Request,
):
    require_admin(request)

    timezone_name = (
        get_setting(
            "app.timezone",
            "UTC",
        )
        or "UTC"
    )

    return {
        "timezone": timezone_name,
        "timezones": sorted(
            available_timezones()
        ),
    }


@app.put("/api/settings/regional")
async def regional_settings_update(
    payload: TimezoneSettingsUpdate,
    request: Request,
):
    require_admin(request)

    timezone_name = (
        payload.timezone.strip()
    )

    try:
        ZoneInfo(
            timezone_name
        )
    except ZoneInfoNotFoundError as exc:
        raise HTTPException(
            status_code=422,
            detail=(
                "Unknown timezone: "
                f"{timezone_name}"
            ),
        ) from exc

    set_setting(
        "app.timezone",
        timezone_name,
    )

    write_request_audit_event(
        request,
        action="settings.regional.update",
        result="success",
        severity="info",
        target_type="settings",
        target="regional",
        details={
            "timezone": timezone_name,
        },
    )

    return {
        "timezone": timezone_name,
    }


@app.get("/api/config")
async def config():
    settings = get_settings()

    return {
        "refresh_interval":
            settings.refresh_interval,
        "timezone":
            get_setting(
                "app.timezone",
                "UTC",
            )
            or "UTC",
    }


@app.get(
    "/api/infrastructures/"
    "{infrastructure_id}/network/{node}"
)
async def infrastructure_node_network(
    infrastructure_id: int,
    node: str,
):
    infrastructure = get_infrastructure(
        infrastructure_id
    )

    if infrastructure is None:
        raise HTTPException(
            status_code=404,
            detail="Infrastructure not found.",
        )

    try:
        network = await asyncio.to_thread(
            collect_node_network,
            node,
            infrastructure_id,
        )

        infrastructure_client = ProxmoxClient(
            infrastructure_id=infrastructure_id
        )

        dashboard = await (
            infrastructure_client.dashboard()
        )

        guests = {}

        for guest in dashboard.get(
            "guests",
            [],
        ):
            vmid = guest.get("vmid")

            if vmid is None:
                continue

            guests[int(vmid)] = {
                "vmid": int(vmid),
                "type": guest.get("type"),
                "name": guest.get("name"),
                "status": guest.get("status"),
                "node": guest.get("node"),
            }

        import re

        for interface in network.get(
            "interfaces",
            [],
        ):
            match = re.match(
                r"^(?:tap|veth)(\d+)i\d+$",
                interface.get("name", ""),
            )

            if not match:
                continue

            vmid = int(
                match.group(1)
            )

            if vmid in guests:
                interface["guest"] = (
                    guests[vmid]
                )

        return network

    except (
        NetworkError,
        ProxmoxError,
    ) as exc:
        raise HTTPException(
            status_code=502,
            detail=str(exc),
        ) from exc


@app.get(
    "/api/infrastructures/"
    "{infrastructure_id}/node/{node}/details"
)
async def infrastructure_node_details(
    infrastructure_id: int,
    node: str,
):
    infrastructure = get_infrastructure(
        infrastructure_id
    )

    if infrastructure is None:
        raise HTTPException(
            status_code=404,
            detail="Infrastructure not found.",
        )

    try:
        return await asyncio.to_thread(
            collect_host_details,
            node,
            infrastructure_id,
        )

    except HostDetailsError as exc:
        raise HTTPException(
            status_code=502,
            detail=str(exc),
        ) from exc


@app.get("/api/dashboard")
async def dashboard():
    infrastructures = [
        infrastructure
        for infrastructure in list_infrastructures()
        if infrastructure.get("enabled")
    ]

    if not infrastructures:
        return {
            "nodes": [],
            "guests": [],
            "storages": [],
            "replications": [],
            "backup_jobs": [],
            "backup_tasks": [],
            "ha": [],
            "infrastructure_errors": [],
        }

    async def load_infrastructure(
        infrastructure: dict,
    ):
        infrastructure_id = int(
            infrastructure["id"]
        )

        infrastructure_name = str(
            infrastructure["name"]
        )

        infrastructure_type = str(
            infrastructure["type"]
        )

        try:
            infrastructure_client = (
                ProxmoxClient(
                    infrastructure_id=
                        infrastructure_id
                )
            )

            data = await (
                infrastructure_client.dashboard()
            )

            maintenance_nodes = {
                item.get("node")
                or item.get("name")
                for item in data.get(
                    "ha",
                    [],
                )
                if (
                    item.get("type") == "lrm"
                    and "maintenance"
                    in str(
                        item.get(
                            "status",
                            "",
                        )
                    ).lower()
                )
            }

            metadata = {
                "infrastructure_id":
                    infrastructure_id,
                "infrastructure_name":
                    infrastructure_name,
                "infrastructure_type":
                    infrastructure_type,
            }

            for key in (
                "nodes",
                "guests",
                "storages",
                "replications",
                "backup_jobs",
                "backup_tasks",
                "ha",
            ):
                entries = data.get(
                    key,
                    [],
                )

                if not isinstance(
                    entries,
                    list,
                ):
                    data[key] = []
                    continue

                enriched = []

                for entry in entries:
                    if not isinstance(
                        entry,
                        dict,
                    ):
                        continue

                    item = {
                        **entry,
                        **metadata,
                    }

                    if key == "nodes":
                        item["maintenance"] = (
                            item.get("node")
                            in maintenance_nodes
                        )

                    enriched.append(
                        item
                    )

                data[key] = enriched

            return {
                "ok": True,
                "infrastructure_id":
                    infrastructure_id,
                "infrastructure_name":
                    infrastructure_name,
                "data": data,
            }

        except Exception as exc:
            return {
                "ok": False,
                "infrastructure_id":
                    infrastructure_id,
                "infrastructure_name":
                    infrastructure_name,
                "error": str(exc),
            }

    results = await asyncio.gather(
        *[
            load_infrastructure(
                infrastructure
            )
            for infrastructure
            in infrastructures
        ]
    )

    aggregated = {
        "nodes": [],
        "guests": [],
        "storages": [],
        "replications": [],
        "backup_jobs": [],
        "backup_tasks": [],
        "ha": [],
        "infrastructure_errors": [],
    }

    for result in results:
        if not result["ok"]:
            aggregated[
                "infrastructure_errors"
            ].append(
                {
                    "infrastructure_id":
                        result[
                            "infrastructure_id"
                        ],
                    "infrastructure_name":
                        result[
                            "infrastructure_name"
                        ],
                    "error":
                        result["error"],
                }
            )

            infrastructure = next(
                (
                    item
                    for item in infrastructures
                    if int(
                        item["id"]
                    )
                    == int(
                        result[
                            "infrastructure_id"
                        ]
                    )
                ),
                None,
            )

            if infrastructure is not None:
                infrastructure_id = int(
                    infrastructure["id"]
                )

                infrastructure_name = str(
                    infrastructure["name"]
                )

                infrastructure_type = str(
                    infrastructure["type"]
                )

                for configured_node in (
                    infrastructure.get(
                        "nodes",
                        [],
                    )
                    or []
                ):
                    if not configured_node.get(
                        "enabled"
                    ):
                        continue

                    node_name = str(
                        configured_node.get(
                            "node_name",
                            "",
                        )
                    ).strip()

                    if not node_name:
                        continue

                    aggregated[
                        "nodes"
                    ].append(
                        {
                            "node":
                                node_name,
                            "host":
                                configured_node.get(
                                    "host"
                                ),
                            "status":
                                "disconnected",
                            "maintenance":
                                False,
                            "infrastructure_id":
                                infrastructure_id,
                            "infrastructure_name":
                                infrastructure_name,
                            "infrastructure_type":
                                infrastructure_type,
                        }
                    )

            continue

        data = result["data"]

        for key in (
            "nodes",
            "guests",
            "storages",
            "replications",
            "backup_jobs",
            "backup_tasks",
            "ha",
        ):
            aggregated[key].extend(
                data.get(
                    key,
                    [],
                )
            )

    return aggregated


@app.post("/api/backup/run")
async def run_backup(
    request: BackupRun,
    http_request: Request,
):
    require_operator_or_admin(http_request)

    try:
        if not request.confirmed:
            raise HTTPException(
                status_code=400,
                detail="Der manuelle Backup-Start muss bestätigt werden.",
            )

        backup_client = ProxmoxClient(
            infrastructure_id=request.infrastructure_id
        )

        data = await backup_client.dashboard()

        job = next(
            (
                item
                for item in data.get("backup_jobs", [])
                if item.get("id") == request.job_id
            ),
            None,
        )

        if not job:
            raise HTTPException(
                status_code=404,
                detail="Der Backup-Job wurde nicht gefunden.",
            )

        online_nodes = [
            node.get("node")
            for node in data.get("nodes", [])
            if node.get("node")
            and str(node.get("status", "")).lower() == "online"
        ]

        if not online_nodes:
            raise HTTPException(
                status_code=409,
                detail="Es ist kein Proxmox-Node online.",
            )

        parameters = {
            "all": 1,
            "storage": job.get("storage"),
            "mode": job.get("mode", "snapshot"),
            "compress": job.get("compress", "zstd"),
        }

        optional_parameters = {
            "notes-template": job.get("notes-template"),
            "notification-mode": job.get("notification-mode"),
        }

        for key, value in optional_parameters.items():
            if value not in (None, ""):
                parameters[key] = value

        prune = job.get("prune-backups")

        if isinstance(prune, dict):
            prune_values = [
                f"{key}={value}"
                for key, value in prune.items()
                if value not in (None, "")
            ]

            if prune_values:
                parameters["prune-backups"] = ",".join(prune_values)

        tasks = []

        for node in online_nodes:
            task = await start_backup_task(
                backup_client,
                node,
                request.job_id,
                dict(parameters),
                infrastructure_id=
                    request.infrastructure_id,
            )

            tasks.append(task.public())

        write_request_audit_event(
            http_request,
            action="backup.run",
            result="success",
            severity="info",
            target_type="backup_job",
            target=request.job_id,
            infrastructure_id=request.infrastructure_id,
            details={
                "infrastructure_id":
                    request.infrastructure_id,
                "job_id": request.job_id,
                "nodes": online_nodes,
                "storage": parameters.get("storage"),
                "mode": parameters.get("mode"),
                "compress": parameters.get("compress"),
                "tasks_started": len(tasks),
                "status": "tasks_started",
            },
        )

        return {
            "ok": True,
            "infrastructure_id":
                request.infrastructure_id,
            "job_id": request.job_id,
            "nodes": online_nodes,
            "tasks": tasks,
        }

    except HTTPException as exc:
        write_request_audit_event(
            http_request,
            action="backup.run",
            result="failed",
            severity=(
                "error"
                if exc.status_code >= 500
                else "warning"
            ),
            target_type="backup_job",
            target=request.job_id,
            infrastructure_id=request.infrastructure_id,
            details={
                "job_id": request.job_id,
                "http_status": exc.status_code,
                "error": str(exc.detail),
            },
        )

        raise

    except ProxmoxError as exc:
        write_request_audit_event(
            http_request,
            action="backup.run",
            result="failed",
            severity="error",
            target_type="backup_job",
            target=request.job_id,
            infrastructure_id=request.infrastructure_id,
            details={
                "job_id": request.job_id,
                "error": str(exc),
            },
        )

        raise HTTPException(
            status_code=502,
            detail=str(exc),
        ) from exc


@app.post("/api/backup/guest")
async def run_guest_backup(
    request: GuestBackupRun,
    http_request: Request,
):
    require_operator_or_admin(http_request)

    audit_target = (
        f"{request.guest_type.upper()} "
        f"{request.vmid}"
    )

    try:
        if not request.confirmed:
            raise HTTPException(
                status_code=400,
                detail="Der Einzelbackup-Start muss bestätigt werden.",
            )

        backup_client = ProxmoxClient(
            infrastructure_id=request.infrastructure_id
        )

        data = await backup_client.dashboard()

        job = next(
            (
                item
                for item in data.get("backup_jobs", [])
                if item.get("id") == request.job_id
            ),
            None,
        )

        if not job:
            raise HTTPException(
                status_code=404,
                detail="Der Backup-Job wurde nicht gefunden.",
            )

        if not job.get("enabled"):
            raise HTTPException(
                status_code=409,
                detail="Der ausgewählte Backup-Job ist deaktiviert.",
            )

        guest = next(
            (
                item
                for item in data.get("guests", [])
                if int(item.get("vmid", 0)) == request.vmid
            ),
            None,
        )

        if not guest:
            raise HTTPException(
                status_code=404,
                detail="Der angegebene Gast wurde nicht gefunden.",
            )

        guest_node = str(guest.get("node", ""))
        guest_type = str(guest.get("type", ""))

        if guest_node != request.node:
            raise HTTPException(
                status_code=409,
                detail=(
                    f"Der Gast befindet sich auf Node "
                    f"{guest_node or 'unbekannt'} und nicht auf "
                    f"{request.node}."
                ),
            )

        if guest_type != request.guest_type:
            raise HTTPException(
                status_code=409,
                detail=(
                    f"Der Gasttyp ist {guest_type or 'unbekannt'} "
                    f"und nicht {request.guest_type}."
                ),
            )

        node = next(
            (
                item
                for item in data.get("nodes", [])
                if item.get("node") == request.node
            ),
            None,
        )

        if not node:
            raise HTTPException(
                status_code=404,
                detail="Der angegebene Proxmox-Node wurde nicht gefunden.",
            )

        if str(node.get("status", "")).lower() != "online":
            raise HTTPException(
                status_code=409,
                detail="Der Proxmox-Node ist nicht online.",
            )

        storage = job.get("storage")

        if not storage:
            raise HTTPException(
                status_code=409,
                detail="Im Backup-Job ist kein Ziel-Storage konfiguriert.",
            )

        parameters = {
            "vmid": request.vmid,
            "storage": storage,
            "mode": job.get("mode", "snapshot"),
            "compress": job.get("compress", "zstd"),
        }

        optional_parameters = {
            "notes-template": job.get("notes-template"),
            "notification-mode": job.get("notification-mode"),
        }

        for key, value in optional_parameters.items():
            if value not in (None, ""):
                parameters[key] = value

        prune = job.get("prune-backups")

        if isinstance(prune, dict):
            prune_values = [
                f"{key}={value}"
                for key, value in prune.items()
                if value not in (None, "")
            ]

            if prune_values:
                parameters["prune-backups"] = ",".join(prune_values)

        task = await start_backup_task(
            backup_client,
            request.node,
            f"{request.job_id} · VMID {request.vmid}",
            parameters,
            infrastructure_id=
                request.infrastructure_id,
        )

        public_task = task.public()

        if task.state == "error":
            raise HTTPException(
                status_code=502,
                detail=(
                    getattr(task, "error", None)
                    or "Der Backup-Task konnte nicht gestartet werden."
                ),
            )

        write_request_audit_event(
            http_request,
            action="backup.guest",
            result="success",
            severity="info",
            target_type=request.guest_type,
            target=audit_target,
            node=request.node,
            infrastructure_id=request.infrastructure_id,
            details={
                "vmid": request.vmid,
                "guest_type": request.guest_type,
                "job_id": request.job_id,
                "storage": storage,
                "mode": parameters.get("mode"),
                "compress": parameters.get("compress"),
                "status": "task_started",
            },
        )

        return {
            "ok": True,
            "infrastructure_id":
                request.infrastructure_id,
            "job_id": request.job_id,
            "node": request.node,
            "guest_type": request.guest_type,
            "vmid": request.vmid,
            "storage": storage,
            "mode": parameters.get("mode"),
            "compress": parameters.get("compress"),
            "task": public_task,
        }

    except HTTPException as exc:
        write_request_audit_event(
            http_request,
            action="backup.guest",
            result="failed",
            severity=(
                "error"
                if exc.status_code >= 500
                else "warning"
            ),
            target_type=request.guest_type,
            target=audit_target,
            node=request.node,
            infrastructure_id=request.infrastructure_id,
            details={
                "vmid": request.vmid,
                "guest_type": request.guest_type,
                "job_id": request.job_id,
                "http_status": exc.status_code,
                "error": str(exc.detail),
            },
        )

        raise

    except ProxmoxError as exc:
        write_request_audit_event(
            http_request,
            action="backup.guest",
            result="failed",
            severity="error",
            target_type=request.guest_type,
            target=audit_target,
            node=request.node,
            infrastructure_id=request.infrastructure_id,
            details={
                "vmid": request.vmid,
                "guest_type": request.guest_type,
                "job_id": request.job_id,
                "error": str(exc),
            },
        )

        raise HTTPException(
            status_code=502,
            detail=str(exc),
        ) from exc


@app.get("/api/backup/guest-archives")
async def guest_backup_archives(
    infrastructure_id: int = Query(gt=0),
    node: str = Query(
        min_length=1,
        max_length=64,
        pattern=r"^[A-Za-z0-9._-]+$",
    ),
    guest_type: Literal[
        "qemu",
        "lxc",
    ] = Query(),
    vmid: int = Query(gt=0),
):
    try:
        backup_client = ProxmoxClient(
            infrastructure_id=
                infrastructure_id
        )

        archives = (
            await backup_client.guest_backup_archives(
                node,
                guest_type,
                vmid,
            )
        )

        return {
            "infrastructure_id":
                infrastructure_id,
            "node":
                node,
            "guest_type":
                guest_type,
            "vmid":
                vmid,
            "count":
                len(archives),
            "archives":
                archives,
        }

    except ProxmoxError as exc:
        raise HTTPException(
            status_code=502,
            detail=str(exc),
        ) from exc


@app.post("/api/backup/guest-restore")
async def restore_guest_backup(
    request: GuestRestore,
    http_request: Request,
):
    require_operator_or_admin(
        http_request
    )

    audit_target = (
        f"{request.guest_type.upper()} "
        f"{request.vmid}"
    )

    if not request.confirmed:
        write_request_audit_event(
            http_request,
            action="backup.guest_restore",
            result="failed",
            severity="warning",
            target_type=
                request.guest_type,
            target=audit_target,
            node=request.node,
            infrastructure_id=
                request.infrastructure_id,
            details={
                "vmid":
                    request.vmid,
                "archive":
                    request.archive,
                "reason":
                    "not_confirmed",
            },
        )

        raise HTTPException(
            status_code=400,
            detail=(
                "The guest restore must be "
                "explicitly confirmed."
            ),
        )

    try:
        restore_client = ProxmoxClient(
            infrastructure_id=
                request.infrastructure_id
        )

        archives = (
            await restore_client.guest_backup_archives(
                request.node,
                request.guest_type,
                request.vmid,
            )
        )

        selected_archive = next(
            (
                archive
                for archive in archives
                if str(
                    archive.get(
                        "volid",
                        "",
                    )
                )
                == request.archive
            ),
            None,
        )

        if selected_archive is None:
            raise HTTPException(
                status_code=404,
                detail=(
                    "The selected backup archive "
                    "was not found for this guest."
                ),
            )

        task = await start_guest_restore_task(
            restore_client,
            request.node,
            request.guest_type,
            request.vmid,
            request.archive,
            request.infrastructure_id,
            storage=request.target_storage,
            start_after_restore=
                request.start_after_restore,
        )

        write_request_audit_event(
            http_request,
            action="backup.guest_restore",
            result="success",
            severity="warning",
            target_type=
                request.guest_type,
            target=audit_target,
            node=request.node,
            infrastructure_id=
                request.infrastructure_id,
            details={
                "vmid":
                    request.vmid,
                "guest_type":
                    request.guest_type,
                "archive":
                    request.archive,
                "target_storage":
                    request.target_storage,
                "start_after_restore":
                    request.start_after_restore,
                "status":
                    "task_started",
            },
        )

        return {
            "ok":
                True,
            "node":
                request.node,
            "guest_type":
                request.guest_type,
            "vmid":
                request.vmid,
            "archive":
                request.archive,
            "target_storage":
                request.target_storage,
            "start_after_restore":
                request.start_after_restore,
            "task":
                task.public(),
        }

    except HTTPException:
        raise

    except ProxmoxError as exc:
        write_request_audit_event(
            http_request,
            action="backup.guest_restore",
            result="failed",
            severity="error",
            target_type=
                request.guest_type,
            target=audit_target,
            node=request.node,
            infrastructure_id=
                request.infrastructure_id,
            details={
                "vmid":
                    request.vmid,
                "guest_type":
                    request.guest_type,
                "archive":
                    request.archive,
                "target_storage":
                    request.target_storage,
                "start_after_restore":
                    request.start_after_restore,
                "error":
                    str(exc),
            },
        )

        raise HTTPException(
            status_code=502,
            detail=str(exc),
        ) from exc


@app.get("/api/backup/task-log")
async def backup_task_log(
    infrastructure_id: int = Query(gt=0),
    node: str = Query(
        min_length=1,
        max_length=64,
        pattern=r"^[A-Za-z0-9._-]+$",
    ),
    upid: str = Query(
        min_length=10,
        max_length=512,
    ),
):
    try:
        task_client = ProxmoxClient(
            infrastructure_id=infrastructure_id
        )

        return await task_client.task_details(
            node,
            upid,
        )

    except ProxmoxError as exc:
        raise HTTPException(
            status_code=502,
            detail=str(exc),
        ) from exc



@app.get("/api/node-updates")
async def node_updates():
    return {
        "nodes": update_cache.list(),
    }

@app.get("/api/tasks")
async def tasks():
    return {
        "tasks": manager.list(),
    }


@app.get("/api/snapshots/{node}/{guest_type}/{vmid}")
async def snapshots(
    node: str,
    guest_type: Literal["qemu", "lxc"],
    vmid: int,
    infrastructure_id: int = Query(gt=0),
):
    if vmid <= 0:
        raise HTTPException(
            status_code=400,
            detail="Ungültige VM-ID.",
        )

    try:
        snapshot_client = ProxmoxClient(
            infrastructure_id=infrastructure_id
        )

        items = await snapshot_client.snapshots(
            node,
            guest_type,
            vmid,
        )

        return {
            "node": node,
            "guest_type": guest_type,
            "vmid": vmid,
            "count": len(items),
            "has_snapshots": bool(items),
            "snapshots": items,
        }

    except ProxmoxError as exc:
        raise HTTPException(
            status_code=502,
            detail=str(exc),
        ) from exc


@app.post("/api/snapshots/create")
async def create_snapshot(
    request: SnapshotCreate,
    http_request: Request,
):
    require_operator_or_admin(http_request)

    audit_target = (
        f"{request.guest_type.upper()} "
        f"{request.vmid}"
    )

    if request.guest_type == "lxc" and request.include_ram:
        write_request_audit_event(
            http_request,
            action="snapshot.create",
            result="failed",
            severity="warning",
            target_type=request.guest_type,
            target=audit_target,
            node=request.node,
            infrastructure_id=request.infrastructure_id,
            details={
                "vmid": request.vmid,
                "snapshot_name": request.name,
                "reason": "ram_snapshot_not_supported_for_lxc",
            },
        )

        raise HTTPException(
            status_code=400,
            detail="RAM-Snapshots werden für LXC-Container nicht unterstützt.",
        )

    try:
        snapshot_client = ProxmoxClient(
            infrastructure_id=
                request.infrastructure_id
        )

        upid = await snapshot_client.create_snapshot(
            request.node,
            request.guest_type,
            request.vmid,
            request.name,
            request.description,
            request.include_ram,
        )

        task = await track_snapshot_task(
            snapshot_client,
            request.node,
            request.guest_type,
            request.vmid,
            request.name,
            upid,
            request.infrastructure_id,
        )

        write_request_audit_event(
            http_request,
            action="snapshot.create",
            result="success",
            severity="info",
            target_type=request.guest_type,
            target=audit_target,
            node=request.node,
            infrastructure_id=request.infrastructure_id,
            details={
                "vmid": request.vmid,
                "snapshot_name": request.name,
                "include_ram": request.include_ram,
                "description": request.description,
                "upid": upid,
                "status": "task_started",
            },
        )

        return {
            "ok": True,
            "action": "create",
            "node": request.node,
            "guest_type": request.guest_type,
            "vmid": request.vmid,
            "snapshot_name": request.name,
            "upid": upid,
            "task": task.public(),
        }

    except ProxmoxError as exc:
        write_request_audit_event(
            http_request,
            action="snapshot.create",
            result="failed",
            severity="error",
            target_type=request.guest_type,
            target=audit_target,
            node=request.node,
            infrastructure_id=request.infrastructure_id,
            details={
                "vmid": request.vmid,
                "snapshot_name": request.name,
                "error": str(exc),
            },
        )

        raise HTTPException(
            status_code=502,
            detail=str(exc),
        ) from exc


@app.post("/api/snapshots/delete")
async def delete_snapshot(
    request: SnapshotOperation,
    http_request: Request,
):
    require_operator_or_admin(http_request)

    audit_target = (
        f"{request.guest_type.upper()} "
        f"{request.vmid}"
    )

    if not request.confirmed:
        write_request_audit_event(
            http_request,
            action="snapshot.delete",
            result="failed",
            severity="warning",
            target_type=request.guest_type,
            target=audit_target,
            node=request.node,
            infrastructure_id=request.infrastructure_id,
            details={
                "vmid": request.vmid,
                "snapshot_name": request.snapshot_name,
                "reason": "not_confirmed",
            },
        )

        raise HTTPException(
            status_code=400,
            detail="Das Löschen des Snapshots muss bestätigt werden.",
        )

    try:
        snapshot_client = ProxmoxClient(
            infrastructure_id=
                request.infrastructure_id
        )

        upid = await snapshot_client.delete_snapshot(
            request.node,
            request.guest_type,
            request.vmid,
            request.snapshot_name,
        )

        task = await track_snapshot_task(
            snapshot_client,
            request.node,
            request.guest_type,
            request.vmid,
            request.snapshot_name,
            upid,
            request.infrastructure_id,
            operation="delete",
        )

        write_request_audit_event(
            http_request,
            action="snapshot.delete",
            result="success",
            severity="info",
            target_type=request.guest_type,
            target=audit_target,
            node=request.node,
            infrastructure_id=request.infrastructure_id,
            details={
                "vmid": request.vmid,
                "snapshot_name": request.snapshot_name,
                "upid": upid,
                "status": "task_started",
            },
        )

        return {
            "ok": True,
            "action": "delete",
            "node": request.node,
            "guest_type": request.guest_type,
            "vmid": request.vmid,
            "snapshot_name": request.snapshot_name,
            "upid": upid,
            "task": task.public(),
        }

    except ProxmoxError as exc:
        write_request_audit_event(
            http_request,
            action="snapshot.delete",
            result="failed",
            severity="error",
            target_type=request.guest_type,
            target=audit_target,
            node=request.node,
            infrastructure_id=request.infrastructure_id,
            details={
                "vmid": request.vmid,
                "snapshot_name": request.snapshot_name,
                "error": str(exc),
            },
        )

        raise HTTPException(
            status_code=502,
            detail=str(exc),
        ) from exc


@app.post("/api/snapshots/rollback")
async def rollback_snapshot(
    request: SnapshotOperation,
    http_request: Request,
):
    require_operator_or_admin(http_request)

    audit_target = (
        f"{request.guest_type.upper()} "
        f"{request.vmid}"
    )

    if not request.confirmed:
        write_request_audit_event(
            http_request,
            action="snapshot.rollback",
            result="failed",
            severity="warning",
            target_type=request.guest_type,
            target=audit_target,
            node=request.node,
            infrastructure_id=request.infrastructure_id,
            details={
                "vmid": request.vmid,
                "snapshot_name": request.snapshot_name,
                "reason": "not_confirmed",
            },
        )

        raise HTTPException(
            status_code=400,
            detail="Das Zurückrollen des Snapshots muss bestätigt werden.",
        )

    try:
        snapshot_client = ProxmoxClient(
            infrastructure_id=
                request.infrastructure_id
        )

        upid = await snapshot_client.rollback_snapshot(
            request.node,
            request.guest_type,
            request.vmid,
            request.snapshot_name,
        )

        task = await track_proxmox_activity(
            snapshot_client,
            request.node,
            upid,
            request.infrastructure_id,
            kind="snapshot",
            title=(
                f"Rollback snapshot "
                f"{request.snapshot_name} · "
                f"{request.guest_type.upper()} "
                f"{request.vmid}"
            ),
            result={
                "guest_type":
                    request.guest_type,
                "vmid":
                    request.vmid,
                "snapshot_name":
                    request.snapshot_name,
                "operation":
                    "rollback",
            },
            notifications_enabled=True,
        )

        write_request_audit_event(
            http_request,
            action="snapshot.rollback",
            result="success",
            severity="warning",
            target_type=request.guest_type,
            target=audit_target,
            node=request.node,
            infrastructure_id=request.infrastructure_id,
            details={
                "vmid": request.vmid,
                "snapshot_name": request.snapshot_name,
                "upid": upid,
                "status": "task_started",
            },
        )

        return {
            "ok": True,
            "action": "rollback",
            "node": request.node,
            "guest_type": request.guest_type,
            "vmid": request.vmid,
            "snapshot_name": request.snapshot_name,
            "upid": upid,
            "task": task.public(),
        }

    except ProxmoxError as exc:
        write_request_audit_event(
            http_request,
            action="snapshot.rollback",
            result="failed",
            severity="error",
            target_type=request.guest_type,
            target=audit_target,
            node=request.node,
            infrastructure_id=request.infrastructure_id,
            details={
                "vmid": request.vmid,
                "snapshot_name": request.snapshot_name,
                "error": str(exc),
            },
        )

        raise HTTPException(
            status_code=502,
            detail=str(exc),
        ) from exc


@app.get("/api/guest/{node}/qemu/{vmid}/disk-usage")
async def guest_disk_usage(
    node: str,
    vmid: int,
    infrastructure_id: int = Query(gt=0),
):
    if vmid <= 0:
        raise HTTPException(
            status_code=400,
            detail="Ungültige VM-ID.",
        )

    try:
        guest_client = ProxmoxClient(
            infrastructure_id=infrastructure_id
        )

        return await guest_client.guest_disk_usage(
            node,
            vmid,
        )

    except ProxmoxError as exc:
        raise HTTPException(
            status_code=502,
            detail=str(exc),
        ) from exc


@app.get("/api/guest/{node}/{guest_type}/{vmid}")
async def guest_details(
    node: str,
    guest_type: Literal["qemu", "lxc"],
    vmid: int,
    infrastructure_id: int = Query(gt=0),
):
    if vmid <= 0:
        raise HTTPException(
            status_code=400,
            detail="Ungültige VM-ID.",
        )

    try:
        guest_client = ProxmoxClient(
            infrastructure_id=infrastructure_id
        )

        return await guest_client.guest_details(
            node,
            guest_type,
            vmid,
        )

    except ProxmoxError as exc:
        raise HTTPException(
            status_code=502,
            detail=str(exc),
        ) from exc



@app.post("/api/guest/migrate/preflight")
async def migrate_guest_preflight(
    request: GuestMigration,
    http_request: Request,
):
    require_operator_or_admin(http_request)

    source_infrastructure_id = (
        request.infrastructure_id
    )

    target_infrastructure_id = (
        request.target_infrastructure_id
        or request.infrastructure_id
    )

    cross_infrastructure = (
        target_infrastructure_id
        != source_infrastructure_id
    )

    checks: list[dict] = []
    warnings: list[dict] = []

    def add_check(
        name: str,
        ok: bool,
        message: str,
        *,
        details: dict | None = None,
    ):
        checks.append(
            {
                "name": name,
                "ok": bool(ok),
                "message": message,
                "details": details or {},
            }
        )

    def add_warning(
        name: str,
        message: str,
        *,
        details: dict | None = None,
    ):
        warnings.append(
            {
                "name": name,
                "message": message,
                "details": details or {},
            }
        )

    source_infrastructure = (
        get_infrastructure(
            source_infrastructure_id
        )
    )

    if source_infrastructure is None:
        raise HTTPException(
            status_code=404,
            detail="Source infrastructure not found.",
        )

    target_infrastructure = (
        get_infrastructure(
            target_infrastructure_id
        )
    )

    if target_infrastructure is None:
        raise HTTPException(
            status_code=404,
            detail="Target infrastructure not found.",
        )

    if not target_infrastructure.get(
        "enabled"
    ):
        add_check(
            "target_infrastructure",
            False,
            "Target infrastructure is disabled.",
        )
    else:
        add_check(
            "target_infrastructure",
            True,
            "Target infrastructure is enabled.",
        )

    try:
        source_client = ProxmoxClient(
            infrastructure_id=
                source_infrastructure_id
        )

        target_client = ProxmoxClient(
            infrastructure_id=
                target_infrastructure_id
        )

        guest_status = (
            await source_client.guest_status(
                request.node,
                request.guest_type,
                request.vmid,
            )
        )

        guest_config = (
            await source_client.request_node(
                request.node,
                "GET",
                (
                    f"/nodes/{request.node}/"
                    f"{request.guest_type}/"
                    f"{request.vmid}/config"
                ),
            )
        )

        if not isinstance(
            guest_config,
            dict,
        ):
            raise ProxmoxError(
                "Proxmox returned an invalid "
                "guest configuration."
            )

        source_status = str(
            guest_status.get(
                "status",
                "",
            )
        ).lower()

        if cross_infrastructure:
            add_check(
                "guest_stopped",
                source_status == "stopped",
                (
                    "Guest is stopped and can be "
                    "prepared for remote migration."
                    if source_status == "stopped"
                    else (
                        "Guest must be stopped before "
                        "cross-infrastructure migration."
                    )
                ),
                details={
                    "status": source_status,
                },
            )

        target_dashboard = (
            await target_client.dashboard()
        )

        target_nodes = (
            target_dashboard.get(
                "nodes",
                [],
            )
            or []
        )

        target_node_data = next(
            (
                node
                for node in target_nodes
                if str(
                    node.get(
                        "node",
                        "",
                    )
                )
                == request.target
            ),
            None,
        )

        target_node_online = (
            isinstance(
                target_node_data,
                dict,
            )
            and str(
                target_node_data.get(
                    "status",
                    "",
                )
            ).lower()
            == "online"
        )

        add_check(
            "target_node",
            target_node_online,
            (
                "Target node is online."
                if target_node_online
                else (
                    "Target node was not found "
                    "or is not online."
                )
            ),
            details={
                "target_node":
                    request.target,
            },
        )

        target_guests = (
            target_dashboard.get(
                "guests",
                [],
            )
            or []
        )

        target_vmid = (
            request.target_vmid
            if cross_infrastructure
            and request.target_vmid is not None
            else request.vmid
        )

        conflicting_guest = next(
            (
                guest
                for guest in target_guests
                if int(
                    guest.get(
                        "vmid",
                        0,
                    )
                    or 0
                )
                == target_vmid
            ),
            None,
        )

        add_check(
            "target_vmid",
            conflicting_guest is None,
            (
                f"VMID {target_vmid} is available "
                "on the target infrastructure."
                if conflicting_guest is None
                else (
                    f"VMID {target_vmid} already exists "
                    "on the target infrastructure."
                )
            ),
            details={
                "source_vmid":
                    request.vmid,
                "target_vmid":
                    target_vmid,
                "conflict":
                    conflicting_guest,
            },
        )

        if cross_infrastructure:
            source_host = (
                await asyncio.to_thread(
                    collect_host_details,
                    request.node,
                    source_infrastructure_id,
                )
            )

            target_host = (
                await asyncio.to_thread(
                    collect_host_details,
                    request.target,
                    target_infrastructure_id,
                )
            )

            source_architecture = str(
                (
                    source_host.get(
                        "overview",
                        {},
                    )
                    or {}
                ).get(
                    "architecture",
                    "",
                )
                or ""
            ).strip()

            target_architecture = str(
                (
                    target_host.get(
                        "overview",
                        {},
                    )
                    or {}
                ).get(
                    "architecture",
                    "",
                )
                or ""
            ).strip()

            architecture_ok = (
                bool(
                    source_architecture
                )
                and bool(
                    target_architecture
                )
                and source_architecture
                    == target_architecture
            )

            add_check(
                "architecture",
                architecture_ok,
                (
                    "Source and target use the same "
                    f"architecture ({source_architecture})."
                    if architecture_ok
                    else (
                        "Source and target architecture "
                        "do not match."
                    )
                ),
                details={
                    "source":
                        source_architecture,
                    "target":
                        target_architecture,
                },
            )

        try:
            configured_memory_mib = int(
                guest_config.get(
                    "memory",
                    0,
                )
                or 0
            )
        except (
            TypeError,
            ValueError,
        ):
            configured_memory_mib = 0

        guest_memory_bytes = (
            configured_memory_mib
            * 1024
            * 1024
        )

        if guest_memory_bytes <= 0:
            try:
                guest_memory_bytes = int(
                    guest_status.get(
                        "maxmem",
                        0,
                    )
                    or 0
                )
            except (
                TypeError,
                ValueError,
            ):
                guest_memory_bytes = 0

        try:
            target_maxmem = int(
                (
                    target_node_data
                    or {}
                ).get(
                    "maxmem",
                    0,
                )
                or 0
            )

            target_mem = int(
                (
                    target_node_data
                    or {}
                ).get(
                    "mem",
                    0,
                )
                or 0
            )
        except (
            TypeError,
            ValueError,
        ):
            target_maxmem = 0
            target_mem = 0

        target_free_memory = max(
            0,
            target_maxmem
            - target_mem,
        )

        memory_ok = (
            guest_memory_bytes > 0
            and target_free_memory
                >= guest_memory_bytes
        )

        add_check(
            "memory",
            memory_ok,
            (
                "Target node has sufficient "
                "currently free memory."
                if memory_ok
                else (
                    "Target node does not have "
                    "sufficient currently free memory."
                )
            ),
            details={
                "guest_required_bytes":
                    guest_memory_bytes,
                "target_free_bytes":
                    target_free_memory,
                "target_total_bytes":
                    target_maxmem,
                "target_used_bytes":
                    target_mem,
            },
        )

        if cross_infrastructure:
            target_storage = (
                request.target_storage
                or ""
            ).strip()

            if not target_storage:
                add_check(
                    "target_storage",
                    False,
                    (
                        "A target storage must be "
                        "selected for remote migration."
                    ),
                )

            else:
                target_node_storages = (
                    await target_client.request_node(
                        request.target,
                        "GET",
                        f"/nodes/{request.target}/storage",
                    )
                    or []
                )

                if not isinstance(
                    target_node_storages,
                    list,
                ):
                    target_node_storages = []

                storage_data = next(
                    (
                        storage
                        for storage
                        in target_node_storages
                        if (
                            isinstance(
                                storage,
                                dict,
                            )
                            and str(
                                storage.get(
                                    "storage",
                                    "",
                                )
                            )
                            == target_storage
                        )
                    ),
                    None,
                )

                required_content = (
                    "images"
                    if request.guest_type
                        == "qemu"
                    else "rootdir"
                )

                storage_active = bool(
                    (
                        storage_data
                        or {}
                    ).get(
                        "active",
                        0,
                    )
                )

                storage_enabled = bool(
                    (
                        storage_data
                        or {}
                    ).get(
                        "enabled",
                        1,
                    )
                )

                storage_content = {
                    item.strip().lower()
                    for item in str(
                        (
                            storage_data
                            or {}
                        ).get(
                            "content",
                            "",
                        )
                    ).split(",")
                    if item.strip()
                }

                storage_valid = (
                    isinstance(
                        storage_data,
                        dict,
                    )
                    and storage_active
                    and storage_enabled
                    and required_content
                        in storage_content
                )

                try:
                    storage_total = int(
                        (
                            storage_data
                            or {}
                        ).get(
                            "total",
                            0,
                        )
                        or 0
                    )

                    storage_used = int(
                        (
                            storage_data
                            or {}
                        ).get(
                            "used",
                            0,
                        )
                        or 0
                    )
                except (
                    TypeError,
                    ValueError,
                ):
                    storage_total = 0
                    storage_used = 0

                storage_free = max(
                    0,
                    storage_total
                    - storage_used,
                )

                try:
                    guest_disk_bytes = int(
                        guest_status.get(
                            "maxdisk",
                            0,
                        )
                        or 0
                    )
                except (
                    TypeError,
                    ValueError,
                ):
                    guest_disk_bytes = 0

                storage_space_ok = (
                    storage_valid
                    and guest_disk_bytes > 0
                    and storage_free
                        >= guest_disk_bytes
                )

                source_storage_names = set()

                for key, raw_value in guest_config.items():
                    if request.guest_type == "qemu":
                        is_guest_disk = (
                            bool(
                                __import__("re").match(
                                    r"^(?:scsi|sata|ide|virtio)\d+$",
                                    str(key),
                                )
                            )
                            or bool(
                                __import__("re").match(
                                    r"^(?:efidisk|tpmstate)\d+$",
                                    str(key),
                                )
                            )
                        )
                    else:
                        is_guest_disk = (
                            key == "rootfs"
                            or bool(
                                __import__("re").match(
                                    r"^mp\d+$",
                                    str(key),
                                )
                            )
                        )

                    if not is_guest_disk:
                        continue

                    if not isinstance(raw_value, str):
                        continue

                    volume = (
                        raw_value
                        .split(",", 1)[0]
                        .strip()
                    )

                    if ":" not in volume:
                        continue

                    source_storage_name = (
                        volume
                        .split(":", 1)[0]
                        .strip()
                    )

                    if source_storage_name:
                        source_storage_names.add(
                            source_storage_name
                        )

                source_node_storages = (
                    await source_client.request_node(
                        request.node,
                        "GET",
                        f"/nodes/{request.node}/storage",
                    )
                    or []
                )

                if not isinstance(
                    source_node_storages,
                    list,
                ):
                    source_node_storages = []

                source_storage_types = {}

                for source_storage_name in source_storage_names:
                    source_storage_data = next(
                        (
                            storage
                            for storage
                            in source_node_storages
                            if (
                                isinstance(
                                    storage,
                                    dict,
                                )
                                and str(
                                    storage.get(
                                        "storage",
                                        "",
                                    )
                                )
                                == source_storage_name
                            )
                        ),
                        None,
                    )

                    if isinstance(
                        source_storage_data,
                        dict,
                    ):
                        source_storage_types[
                            source_storage_name
                        ] = str(
                            source_storage_data.get(
                                "type",
                                "",
                            )
                            or ""
                        ).strip().lower()

                target_storage_type = str(
                    (
                        storage_data
                        or {}
                    ).get(
                        "type",
                        "",
                    )
                    or ""
                ).strip().lower()

                incompatible_storage_pairs = {
                    (
                        "zfspool",
                        "lvmthin",
                    ),
                }

                incompatible_sources = [
                    {
                        "storage":
                            source_storage_name,
                        "type":
                            source_storage_type,
                    }
                    for (
                        source_storage_name,
                        source_storage_type,
                    )
                    in source_storage_types.items()
                    if (
                        source_storage_type,
                        target_storage_type,
                    )
                    in incompatible_storage_pairs
                ]

                direct_storage_transfer_ok = (
                    storage_valid
                    and not incompatible_sources
                )

                staging_storage = None

                if (
                    storage_valid
                    and incompatible_sources
                    and request.guest_type == "qemu"
                ):
                    for candidate in (
                        source_node_storages
                    ):
                        if not isinstance(
                            candidate,
                            dict,
                        ):
                            continue

                        candidate_node = str(
                            candidate.get(
                                "node",
                                "",
                            )
                            or ""
                        ).strip()

                        if (
                            candidate_node
                            and candidate_node
                                != request.node
                        ):
                            continue

                        candidate_active = bool(
                            candidate.get(
                                "active",
                                0,
                            )
                        )

                        candidate_enabled = bool(
                            candidate.get(
                                "enabled",
                                1,
                            )
                        )

                        if not (
                            candidate_active
                            and candidate_enabled
                        ):
                            continue

                        candidate_content = {
                            item.strip().lower()
                            for item in str(
                                candidate.get(
                                    "content",
                                    "",
                                )
                                or ""
                            ).split(",")
                            if item.strip()
                        }

                        if "images" not in (
                            candidate_content
                        ):
                            continue

                        candidate_type = str(
                            candidate.get(
                                "type",
                                "",
                            )
                            or ""
                        ).strip().lower()

                        candidate_name = str(
                            candidate.get(
                                "storage",
                                "",
                            )
                            or ""
                        ).strip()

                        if not candidate_name:
                            continue

                        if candidate_name in (
                            source_storage_names
                        ):
                            continue

                        # Currently validated staging path:
                        #
                        #   source -> lvmthin -> lvmthin
                        #
                        # LVM/LVM-thin use raw+size for the
                        # remote transfer path.
                        if not (
                            candidate_type
                                == "lvmthin"
                            and target_storage_type
                                == "lvmthin"
                        ):
                            continue

                        try:
                            candidate_total = int(
                                candidate.get(
                                    "total",
                                    0,
                                )
                                or 0
                            )

                            candidate_used = int(
                                candidate.get(
                                    "used",
                                    0,
                                )
                                or 0
                            )
                        except (
                            TypeError,
                            ValueError,
                        ):
                            continue

                        candidate_free = max(
                            0,
                            candidate_total
                            - candidate_used,
                        )

                        if (
                            guest_disk_bytes <= 0
                            or candidate_free
                                < guest_disk_bytes
                        ):
                            continue

                        staging_storage = {
                            "storage":
                                candidate_name,
                            "type":
                                candidate_type,
                            "free_bytes":
                                candidate_free,
                            "total_bytes":
                                candidate_total,
                            "used_bytes":
                                candidate_used,
                        }

                        break

                staged_storage_transfer_ok = (
                    storage_valid
                    and bool(
                        incompatible_sources
                    )
                    and staging_storage
                        is not None
                )

                storage_transfer_ok = (
                    direct_storage_transfer_ok
                    or staged_storage_transfer_ok
                )

                if incompatible_sources:
                    incompatible_description = ", ".join(
                        (
                            f"{item['storage']} "
                            f"({item['type']})"
                        )
                        for item in incompatible_sources
                    )
                else:
                    incompatible_description = ""

                add_check(
                    "storage_transfer_compatibility",
                    storage_transfer_ok,
                    (
                        "Source and target storage types are "
                        "directly compatible with the known "
                        "remote migration transfer path."
                        if direct_storage_transfer_ok
                        else (
                            "Direct storage transfer is not "
                            "compatible, but a supported "
                            "staged transfer path is available."
                            if staged_storage_transfer_ok
                            else (
                                "Remote migration from "
                                f"{incompatible_description} to "
                                f"{target_storage} "
                                f"({target_storage_type}) is not "
                                "supported and no compatible "
                                "staging storage was found on "
                                "the source node."
                            )
                        )
                    ),
                    details={
                        "mode":
                            (
                                "direct"
                                if direct_storage_transfer_ok
                                else (
                                    "staged"
                                    if staged_storage_transfer_ok
                                    else "unsupported"
                                )
                            ),
                        "source_storages":
                            source_storage_types,
                        "target_storage":
                            target_storage,
                        "target_storage_type":
                            target_storage_type,
                        "incompatible_sources":
                            incompatible_sources,
                        "staging_storage":
                            staging_storage,
                    },
                )

                if staged_storage_transfer_ok:
                    add_warning(
                        "staged_storage_transfer",
                        (
                            "Direct remote migration is not "
                            "possible for the current storage "
                            "combination. ProxPilot can stage "
                            "the guest disks on source storage "
                            f"{staging_storage['storage']} "
                            f"({staging_storage['type']}) before "
                            "starting the remote migration. "
                            "This preparation step can take "
                            "additional time."
                        ),
                        details={
                            "source_storages":
                                source_storage_types,
                            "staging_storage":
                                staging_storage,
                            "target_storage":
                                target_storage,
                            "target_storage_type":
                                target_storage_type,
                        },
                    )

                add_check(
                    "target_storage",
                    storage_valid,
                    (
                        "Target storage is available "
                        "and supports the required "
                        "guest content type."
                        if storage_valid
                        else (
                            "Target storage is unavailable "
                            "or does not support the required "
                            "guest content type."
                        )
                    ),
                    details={
                        "storage":
                            target_storage,
                        "required_content":
                            required_content,
                        "content":
                            sorted(
                                storage_content
                            ),
                        "active":
                            storage_active,
                        "enabled":
                            storage_enabled,
                    },
                )

                add_check(
                    "storage_space",
                    storage_space_ok,
                    (
                        "Target storage has sufficient "
                        "free capacity."
                        if storage_space_ok
                        else (
                            "Target storage does not have "
                            "sufficient free capacity."
                        )
                    ),
                    details={
                        "guest_required_bytes":
                            guest_disk_bytes,
                        "target_free_bytes":
                            storage_free,
                        "target_total_bytes":
                            storage_total,
                        "target_used_bytes":
                            storage_used,
                    },
                )

            target_bridge = (
                request.target_bridge
                or ""
            ).strip()

            if not target_bridge:
                add_check(
                    "target_bridge",
                    False,
                    (
                        "A target network bridge must "
                        "be selected for remote migration."
                    ),
                )

            else:
                target_network = (
                    await asyncio.to_thread(
                        collect_node_network,
                        request.target,
                        target_infrastructure_id,
                    )
                )

                bridge_data = next(
                    (
                        interface
                        for interface
                        in target_network.get(
                            "interfaces",
                            [],
                        )
                        or []
                        if (
                            str(
                                interface.get(
                                    "name",
                                    "",
                                )
                            )
                            == target_bridge
                            and str(
                                interface.get(
                                    "type",
                                    "",
                                )
                            )
                            == "bridge"
                        )
                    ),
                    None,
                )

                bridge_state = str(
                    (
                        bridge_data
                        or {}
                    ).get(
                        "state",
                        "",
                    )
                ).lower()

                bridge_ok = (
                    isinstance(
                        bridge_data,
                        dict,
                    )
                    and bridge_state
                        == "up"
                )

                add_check(
                    "target_bridge",
                    bridge_ok,
                    (
                        f"Target bridge {target_bridge} "
                        "is available and up."
                        if bridge_ok
                        else (
                            f"Target bridge {target_bridge} "
                            "does not exist or is not up."
                        )
                    ),
                    details={
                        "bridge":
                            target_bridge,
                        "state":
                            bridge_state,
                    },
                )

            if (
                request.guest_type
                == "qemu"
            ):
                cpu_model = str(
                    guest_config.get(
                        "cpu",
                        "kvm64",
                    )
                    or "kvm64"
                )

                add_warning(
                    "cpu_model",
                    (
                        "The configured QEMU CPU model "
                        f"is '{cpu_model}'. ProxPilot "
                        "cannot guarantee that this CPU "
                        "model will start successfully "
                        "on different target hardware."
                    ),
                    details={
                        "cpu_model":
                            cpu_model,
                    },
                )

        blocking_checks = [
            check
            for check in checks
            if not check["ok"]
        ]

        result = {
            "ok":
                len(
                    blocking_checks
                )
                == 0,
            "cross_infrastructure":
                cross_infrastructure,
            "source_infrastructure_id":
                source_infrastructure_id,
            "target_infrastructure_id":
                target_infrastructure_id,
            "source_node":
                request.node,
            "target_node":
                request.target,
            "guest_type":
                request.guest_type,
            "vmid":
                request.vmid,
            "target_vmid":
                target_vmid,
            "checks":
                checks,
            "warnings":
                warnings,
            "blocking_checks":
                len(
                    blocking_checks
                ),
        }

        return result

    except (
        ProxmoxError,
        HostDetailsError,
        NetworkError,
    ) as exc:
        raise HTTPException(
            status_code=502,
            detail=str(exc),
        ) from exc


@app.post("/api/guest/migrate")
async def migrate_guest(
    request: GuestMigration,
    http_request: Request,
):
    require_operator_or_admin(http_request)

    audit_target = (
        f"{request.guest_type.upper()} "
        f"{request.vmid}"
    )

    target_infrastructure_id = (
        request.target_infrastructure_id
        or request.infrastructure_id
    )

    cross_infrastructure = (
        target_infrastructure_id
        != request.infrastructure_id
    )

    if not request.confirmed:
        write_request_audit_event(
            http_request,
            action="guest.migrate",
            result="failed",
            severity="warning",
            target_type=request.guest_type,
            target=audit_target,
            node=request.node,
            infrastructure_id=request.infrastructure_id,
            details={
                "vmid": request.vmid,
                "target_node": request.target,
                "reason": "not_confirmed",
            },
        )

        raise HTTPException(
            status_code=400,
            detail="Die Migration muss ausdrücklich bestätigt werden.",
        )

    if (
        not cross_infrastructure
        and request.node == request.target
    ):
        write_request_audit_event(
            http_request,
            action="guest.migrate",
            result="failed",
            severity="warning",
            target_type=request.guest_type,
            target=audit_target,
            node=request.node,
            infrastructure_id=request.infrastructure_id,
            details={
                "vmid": request.vmid,
                "target_node": request.target,
                "reason": "source_equals_target",
            },
        )

        raise HTTPException(
            status_code=400,
            detail="Der Ziel-Node muss sich vom Quell-Node unterscheiden.",
        )

    if (
        cross_infrastructure
        and request.guest_type != "qemu"
    ):
        write_request_audit_event(
            http_request,
            action="guest.migrate",
            result="failed",
            severity="warning",
            target_type=request.guest_type,
            target=audit_target,
            node=request.node,
            infrastructure_id=
                request.infrastructure_id,
            details={
                "vmid":
                    request.vmid,
                "target_node":
                    request.target,
                "target_infrastructure_id":
                    target_infrastructure_id,
                "reason":
                    "remote_lxc_not_enabled",
            },
        )

        raise HTTPException(
            status_code=400,
            detail=(
                "Cross-infrastructure migration "
                "is currently enabled only for "
                "QEMU virtual machines."
            ),
        )

    if request.guest_type == "lxc" and request.online:
        write_request_audit_event(
            http_request,
            action="guest.migrate",
            result="failed",
            severity="warning",
            target_type=request.guest_type,
            target=audit_target,
            node=request.node,
            infrastructure_id=request.infrastructure_id,
            details={
                "vmid": request.vmid,
                "target_node": request.target,
                "reason": "lxc_live_migration_not_supported",
            },
        )

        raise HTTPException(
            status_code=400,
            detail=(
                "Für LXC wird keine QEMU-Live-Migration unterstützt. "
                "Verwende stattdessen die Restart-Migration."
            ),
        )

    try:
        migration_client = ProxmoxClient(
            infrastructure_id=
                request.infrastructure_id
        )

        guest_display_name = (
            f"{request.guest_type.upper()} "
            f"{request.vmid}"
        )

        try:
            source_guest_config = (
                await migration_client.request_node(
                    request.node,
                    "GET",
                    (
                        f"/nodes/{request.node}/"
                        f"{request.guest_type}/"
                        f"{request.vmid}/config"
                    ),
                )
            )

            if isinstance(
                source_guest_config,
                dict,
            ):
                if request.guest_type == "qemu":
                    configured_guest_name = str(
                        source_guest_config.get(
                            "name",
                            "",
                        )
                        or ""
                    ).strip()
                else:
                    configured_guest_name = str(
                        source_guest_config.get(
                            "hostname",
                            "",
                        )
                        or ""
                    ).strip()

                if configured_guest_name:
                    guest_display_name = (
                        configured_guest_name
                    )

        except ProxmoxError:
            # The display name is cosmetic only.
            # Never prevent a valid migration when
            # the config cannot be queried here.
            pass

        if cross_infrastructure:
            preflight = (
                await migrate_guest_preflight(
                    request,
                    http_request,
                )
            )

            if not preflight.get(
                "ok",
                False,
            ):
                failed_checks = [
                    str(
                        check.get(
                            "message",
                            check.get(
                                "name",
                                "Unknown check",
                            ),
                        )
                    )
                    for check
                    in preflight.get(
                        "checks",
                        [],
                    )
                    if not check.get(
                        "ok",
                        False,
                    )
                ]

                write_request_audit_event(
                    http_request,
                    action="guest.migrate",
                    result="failed",
                    severity="warning",
                    target_type=
                        request.guest_type,
                    target=audit_target,
                    node=request.node,
                    infrastructure_id=
                        request.infrastructure_id,
                    details={
                        "vmid":
                            request.vmid,
                        "target_node":
                            request.target,
                        "target_infrastructure_id":
                            target_infrastructure_id,
                        "reason":
                            "preflight_failed",
                        "failed_checks":
                            failed_checks,
                    },
                )

                raise HTTPException(
                    status_code=400,
                    detail=(
                        "Remote migration preflight "
                        "failed: "
                        + "; ".join(
                            failed_checks
                        )
                    ),
                )

            storage_transfer_check = next(
                (
                    check
                    for check
                    in preflight.get(
                        "checks",
                        [],
                    )
                    if check.get(
                        "name"
                    )
                    == "storage_transfer_compatibility"
                ),
                None,
            )

            storage_transfer_details = (
                storage_transfer_check.get(
                    "details",
                    {},
                )
                if isinstance(
                    storage_transfer_check,
                    dict,
                )
                else {}
            )

            storage_transfer_mode = str(
                storage_transfer_details.get(
                    "mode",
                    "direct",
                )
                or "direct"
            ).strip().lower()

            task = (
                await create_managed_proxmox_activity(
                    request.node,
                    request.infrastructure_id,
                    kind="guest-migration",
                    title=(
                        f"Migrate "
                        f"{guest_display_name} · "
                        f"{request.node} → "
                        f"{request.target}"
                    ),
                    result={
                        "guest_type":
                            request.guest_type,
                        "vmid":
                            request.vmid,
                        "source_node":
                            request.node,
                        "target_node":
                            request.target,
                        "online":
                            False,
                        "restart":
                            False,
                        "with_local_disks":
                            True,
                        "target_storage":
                            request.target_storage,
                        "target_bridge":
                            request.target_bridge,
                        "target_infrastructure_id":
                            target_infrastructure_id,
                        "cross_infrastructure":
                            True,
                        "delete_source":
                            request.delete_source,
                        "storage_transfer_mode":
                            storage_transfer_mode,
                        "phase":
                            "preparing",
                    },
                    notifications_enabled=True,
                )
            )

            manager.append(
                task,
                (
                    "[migration] Remote migration "
                    "preflight completed."
                ),
            )

            manager.append(
                task,
                (
                    "[migration] Storage transfer mode: "
                    f"{storage_transfer_mode}."
                ),
            )

            async def run_remote_migration():
                try:
                    staging_restore_plan: list[
                        dict[str, str]
                    ] = []

                    if storage_transfer_mode == "staged":
                        staging_storage_data = (
                            storage_transfer_details.get(
                                "staging_storage"
                            )
                            or {}
                        )

                        staging_storage = str(
                            staging_storage_data.get(
                                "storage",
                                "",
                            )
                            or ""
                        ).strip()

                        if not staging_storage:
                            raise ProxmoxError(
                                "Remote migration requires "
                                "staging, but no staging "
                                "storage was returned by "
                                "the preflight check."
                            )

                        source_config_before = (
                            await migration_client
                            .request_node(
                                request.node,
                                "GET",
                                (
                                    f"/nodes/{request.node}/qemu/"
                                    f"{request.vmid}/config"
                                ),
                            )
                        )

                        if not isinstance(
                            source_config_before,
                            dict,
                        ):
                            raise ProxmoxError(
                                "Source VM configuration "
                                "could not be loaded before "
                                "disk staging."
                            )

                        import re

                        existing_unused_keys = {
                            str(key)
                            for key
                            in source_config_before
                            if re.match(
                                r"^unused\d+$",
                                str(key),
                            )
                        }

                        staging_disks: list[str] = []

                        for key, raw_value in (
                            source_config_before.items()
                        ):
                            disk_key = str(key)

                            if not (
                                re.match(
                                    r"^(?:scsi|sata|ide|virtio)\d+$",
                                    disk_key,
                                )
                                or re.match(
                                    r"^(?:efidisk|tpmstate)\d+$",
                                    disk_key,
                                )
                            ):
                                continue

                            if not isinstance(
                                raw_value,
                                str,
                            ):
                                continue

                            normalized_value = (
                                raw_value.strip()
                            )

                            if not normalized_value:
                                continue

                            disk_parts = [
                                part.strip()
                                for part
                                in normalized_value.split(",")
                            ]

                            if any(
                                part.lower()
                                == "media=cdrom"
                                for part in disk_parts
                            ):
                                continue

                            volume = (
                                disk_parts[0]
                                if disk_parts
                                else ""
                            )

                            if ":" not in volume:
                                continue

                            current_storage = (
                                volume
                                .split(":", 1)[0]
                                .strip()
                            )

                            if (
                                not current_storage
                                or current_storage
                                == staging_storage
                            ):
                                continue

                            staging_disks.append(
                                disk_key
                            )

                            staging_restore_plan.append(
                                {
                                    "disk":
                                        disk_key,
                                    "original_storage":
                                        current_storage,
                                }
                            )

                        staging_disks.sort()

                        for disk_key in staging_disks:
                            staging_upid = (
                                await migration_client
                                .move_qemu_disk(
                                    node=request.node,
                                    vmid=request.vmid,
                                    disk=disk_key,
                                    target_storage=
                                        staging_storage,
                                    delete_source=True,
                                )
                            )

                            staging_timeout_seconds = (
                                60 * 60 * 6
                            )

                            staging_started = (
                                asyncio.get_running_loop()
                                .time()
                            )

                            while True:
                                staging_task = (
                                    await migration_client
                                    .task_details(
                                        request.node,
                                        staging_upid,
                                    )
                                )

                                staging_status = (
                                    staging_task.get(
                                        "status",
                                        {},
                                    )
                                    or {}
                                )

                                task_state = str(
                                    staging_status.get(
                                        "status",
                                        "",
                                    )
                                    or ""
                                ).lower()

                                if task_state == "stopped":
                                    exit_status = str(
                                        staging_status.get(
                                            "exitstatus",
                                            "",
                                        )
                                        or ""
                                    ).upper()

                                    if exit_status != "OK":
                                        staging_log = (
                                            staging_task.get(
                                                "log",
                                                [],
                                            )
                                            or []
                                        )

                                        last_log_line = ""

                                        if staging_log:
                                            last_log_line = str(
                                                (
                                                    staging_log[-1]
                                                    or {}
                                                ).get(
                                                    "t",
                                                    "",
                                                )
                                                or ""
                                            ).strip()

                                        raise ProxmoxError(
                                            (
                                                "Disk staging failed "
                                                f"for {disk_key}"
                                            )
                                            + (
                                                f": {last_log_line}"
                                                if last_log_line
                                                else (
                                                    f" with exit status "
                                                    f"{exit_status or 'unknown'}"
                                                )
                                            )
                                        )

                                    break

                                elapsed = (
                                    asyncio.get_running_loop()
                                    .time()
                                    - staging_started
                                )

                                if (
                                    elapsed
                                    >= staging_timeout_seconds
                                ):
                                    raise ProxmoxError(
                                        "Disk staging timed out "
                                        f"for {disk_key}."
                                    )

                                await asyncio.sleep(2)

                        source_config_after = (
                            await migration_client
                            .request_node(
                                request.node,
                                "GET",
                                (
                                    f"/nodes/{request.node}/qemu/"
                                    f"{request.vmid}/config"
                                ),
                            )
                        )

                        if not isinstance(
                            source_config_after,
                            dict,
                        ):
                            raise ProxmoxError(
                                "Source VM configuration "
                                "could not be loaded after "
                                "disk staging."
                            )

                        for disk_key in staging_disks:
                            raw_value = (
                                source_config_after.get(
                                    disk_key
                                )
                            )

                            if not isinstance(
                                raw_value,
                                str,
                            ):
                                raise ProxmoxError(
                                    "Staged disk "
                                    f"{disk_key} is missing "
                                    "from the VM configuration."
                                )

                            volume = (
                                raw_value
                                .split(",", 1)[0]
                                .strip()
                            )

                            current_storage = (
                                volume
                                .split(":", 1)[0]
                                .strip()
                                if ":" in volume
                                else ""
                            )

                            if (
                                current_storage
                                != staging_storage
                            ):
                                raise ProxmoxError(
                                    "Disk staging verification "
                                    f"failed for {disk_key}: "
                                    f"expected storage "
                                    f"{staging_storage}, got "
                                    f"{current_storage or 'unknown'}."
                                )

                        current_unused_keys = {
                            str(key)
                            for key
                            in source_config_after
                            if re.match(
                                r"^unused\d+$",
                                str(key),
                            )
                        }

                        staging_unused_keys = sorted(
                            current_unused_keys
                            - existing_unused_keys
                        )

                        if staging_unused_keys:
                            await migration_client.request_node(
                                request.node,
                                "POST",
                                (
                                    f"/nodes/{request.node}/qemu/"
                                    f"{request.vmid}/config"
                                ),
                                data={
                                    "delete":
                                        ",".join(
                                            staging_unused_keys
                                        ),
                                },
                            )

                            source_config_clean = (
                                await migration_client
                                .request_node(
                                    request.node,
                                    "GET",
                                    (
                                        f"/nodes/{request.node}/qemu/"
                                        f"{request.vmid}/config"
                                    ),
                                )
                            )

                            if not isinstance(
                                source_config_clean,
                                dict,
                            ):
                                raise ProxmoxError(
                                    "Source VM configuration "
                                    "could not be verified "
                                    "after staging cleanup."
                                )

                            remaining_staging_unused = [
                                key
                                for key
                                in staging_unused_keys
                                if key
                                in source_config_clean
                            ]

                            if remaining_staging_unused:
                                raise ProxmoxError(
                                    "Staging cleanup failed "
                                    "for unused disk entries: "
                                    + ", ".join(
                                        remaining_staging_unused
                                    )
                                )

                    target_client = ProxmoxClient(
                        infrastructure_id=
                            target_infrastructure_id
                    )

                    target_dashboard = (
                        await target_client.dashboard()
                    )

                    target_node_data = next(
                        (
                            item
                            for item
                            in target_dashboard.get(
                                "nodes",
                                [],
                            )
                            or []
                            if str(
                                item.get(
                                    "node",
                                    "",
                                )
                            )
                            == request.target
                        ),
                        None,
                    )

                    if not isinstance(
                        target_node_data,
                        dict,
                    ):
                        raise ProxmoxError(
                            "Target node information "
                            "could not be resolved."
                        )

                    target_fingerprint = str(
                        target_node_data.get(
                            "ssl_fingerprint",
                            "",
                        )
                        or ""
                    ).strip()

                    if not target_fingerprint:
                        raise ProxmoxError(
                            "Target node SSL fingerprint "
                            "could not be resolved."
                        )

                    target_host = (
                        target_client.node_host(
                            request.target
                        )
                    )

                    if not target_host:
                        raise ProxmoxError(
                            "Target node host mapping "
                            "could not be resolved."
                        )

                    target_port = 8006

                    if target_client.endpoints:
                        from urllib.parse import urlparse

                        parsed_endpoint = urlparse(
                            target_client.endpoints[0]
                        )

                        if parsed_endpoint.port:
                            target_port = (
                                parsed_endpoint.port
                            )

                    remote_target_endpoint = (
                        "apitoken="
                        "PVEAPIToken="
                        f"{target_client.token_id}="
                        f"{target_client.token_secret}"
                        ",host="
                        f"{target_host}"
                        ",fingerprint="
                        f"{target_fingerprint}"
                        ",port="
                        f"{target_port}"
                    )

                    target_storage = (
                        request.target_storage
                        or ""
                    ).strip()

                    target_bridge = (
                        request.target_bridge
                        or ""
                    ).strip()

                    upid = (
                        await migration_client
                        .remote_migrate_guest(
                            node=request.node,
                            vmid=request.vmid,
                            target_endpoint=
                                remote_target_endpoint,
                            target_storage=
                                target_storage,
                            target_bridge=
                                target_bridge,
                            target_vmid=(
                                request.target_vmid
                                or request.vmid
                            ),
                            online=False,
                            delete_source=
                                request.delete_source,
                        )
                    )


                    migration_result = {
                        "guest_type":
                            request.guest_type,
                        "vmid":
                            request.vmid,
                        "source_node":
                            request.node,
                        "target_node":
                            request.target,
                        "online":
                            False,
                        "restart":
                            False,
                        "with_local_disks":
                            True,
                        "target_storage":
                            request.target_storage,
                        "target_bridge":
                            request.target_bridge,
                        "target_infrastructure_id":
                            target_infrastructure_id,
                        "cross_infrastructure":
                            True,
                        "delete_source":
                            request.delete_source,
                        "storage_transfer_mode":
                            storage_transfer_mode,
                        "staging_restore_plan":
                            staging_restore_plan,
                        "phase":
                            "remote_migration",
                    }

                    manager.append(
                        task,
                        (
                            "[migration] Remote Proxmox "
                            "migration started."
                        ),
                    )

                    manager.append(
                        task,
                        (
                            "[migration] Proxmox UPID: "
                            f"{upid}"
                        ),
                    )

                    await monitor_managed_proxmox_activity(
                        task,
                        migration_client,
                        upid,
                        migration_result,
                    )

                except Exception as exc:
                    manager.append(
                        task,
                        (
                            "[migration] Migration failed: "
                            f"{exc}"
                        ),
                    )

                    manager.fail(
                        task,
                        str(exc),
                        {
                            **dict(
                                task.result
                                or {}
                            ),
                            "phase":
                                "failed",
                        },
                    )

            asyncio.create_task(
                run_remote_migration()
            )

            managed_upid = (
                f"managed:{task.id}"
            )

            write_request_audit_event(
                http_request,
                action="guest.migrate",
                result="success",
                severity="info",
                target_type=
                    request.guest_type,
                target=audit_target,
                node=request.node,
                infrastructure_id=
                    request.infrastructure_id,
                details={
                    "vmid":
                        request.vmid,
                    "source_node":
                        request.node,
                    "target_node":
                        request.target,
                    "target_storage":
                        request.target_storage,
                    "target_bridge":
                        request.target_bridge,
                    "target_infrastructure_id":
                        target_infrastructure_id,
                    "cross_infrastructure":
                        True,
                    "delete_source":
                        request.delete_source,
                    "managed_task_id":
                        task.id,
                    "status":
                        "background_task_started",
                },
            )

            return {
                "ok":
                    True,
                "node":
                    request.node,
                "target":
                    request.target,
                "target_infrastructure_id":
                    target_infrastructure_id,
                "cross_infrastructure":
                    True,
                "guest_type":
                    request.guest_type,
                "vmid":
                    request.vmid,
                "upid":
                    managed_upid,
                "task":
                    task.public(),
            }

        else:
            upid = (
                await migration_client
                .migrate_guest(
                    node=request.node,
                    guest_type=
                        request.guest_type,
                    vmid=request.vmid,
                    target=request.target,
                    online=request.online,
                    restart=request.restart,
                    with_local_disks=
                        request.with_local_disks,
                    target_storage=
                        request.target_storage,
                )
            )

        task = await track_proxmox_activity(
            migration_client,
            request.node,
            upid,
            request.infrastructure_id,
            kind="guest-migration",
            title=(
                f"Migrate "
                f"{guest_display_name} · "
                f"{request.node} → "
                f"{request.target}"
            ),
            result={
                "guest_type":
                    request.guest_type,
                "vmid":
                    request.vmid,
                "source_node":
                    request.node,
                "target_node":
                    request.target,
                "online":
                    request.online,
                "restart":
                    request.restart,
                "with_local_disks":
                    request.with_local_disks,
                "target_storage":
                    request.target_storage,
                "target_bridge":
                    request.target_bridge,
                "target_infrastructure_id":
                    target_infrastructure_id,
                "cross_infrastructure":
                    cross_infrastructure,
                "delete_source":
                    (
                        request.delete_source
                        if cross_infrastructure
                        else None
                    ),
                "staging_restore_plan":
                    (
                        staging_restore_plan
                        if cross_infrastructure
                        else []
                    ),
            },
            notifications_enabled=True,
        )

        write_request_audit_event(
            http_request,
            action="guest.migrate",
            result="success",
            severity="info",
            target_type=request.guest_type,
            target=audit_target,
            node=request.node,
            infrastructure_id=request.infrastructure_id,
            details={
                "vmid": request.vmid,
                "source_node": request.node,
                "target_node": request.target,
                "online": request.online,
                "restart": request.restart,
                "with_local_disks": request.with_local_disks,
                "target_storage": request.target_storage,
                "target_bridge": request.target_bridge,
                "target_infrastructure_id":
                    target_infrastructure_id,
                "cross_infrastructure":
                    cross_infrastructure,
                "delete_source":
                    (
                        request.delete_source
                        if cross_infrastructure
                        else None
                    ),
                "upid": upid,
                "status": "task_started",
            },
        )

        return {
            "ok": True,
            "node": request.node,
            "target": request.target,
            "target_infrastructure_id":
                target_infrastructure_id,
            "cross_infrastructure":
                cross_infrastructure,
            "guest_type": request.guest_type,
            "vmid": request.vmid,
            "upid": upid,
            "task": task.public(),
        }

    except ProxmoxError as exc:
        write_request_audit_event(
            http_request,
            action="guest.migrate",
            result="failed",
            severity="error",
            target_type=request.guest_type,
            target=audit_target,
            node=request.node,
            infrastructure_id=request.infrastructure_id,
            details={
                "vmid": request.vmid,
                "source_node": request.node,
                "target_node": request.target,
                "error": str(exc),
            },
        )

        raise HTTPException(
            status_code=502,
            detail=str(exc),
        ) from exc


@app.get("/api/proxmox-task/{node}")
async def proxmox_task(
    node: str,
    infrastructure_id: int = Query(gt=0),
    upid: str = Query(
        min_length=6,
        max_length=1024,
    ),
):
    if upid.startswith("managed:"):
        managed_task_id = (
            upid.split(
                ":",
                1,
            )[1].strip()
        )

        task = manager.get(
            managed_task_id
        )

        if task is None:
            raise HTTPException(
                status_code=404,
                detail=(
                    "Managed migration task "
                    "was not found."
                ),
            )

        state = str(
            task.state
            or ""
        ).lower()

        if state in {
            "success",
            "partial",
            "error",
        }:
            proxmox_status = "stopped"
        else:
            proxmox_status = "running"

        if state == "success":
            exit_status = "OK"
        elif state == "partial":
            exit_status = "WARNING"
        elif state == "error":
            exit_status = (
                task.error
                or "ERROR"
            )
        else:
            exit_status = None

        status = {
            "status":
                proxmox_status,
            "type":
                "managed-migration",
            "id":
                str(
                    (
                        task.result
                        or {}
                    ).get(
                        "vmid",
                        "",
                    )
                ),
            "node":
                task.node,
        }

        if exit_status is not None:
            status["exitstatus"] = (
                exit_status
            )

        return {
            "status":
                status,
            "log": [
                {
                    "n":
                        index,
                    "t":
                        line,
                }
                for index, line
                in enumerate(
                    task.output,
                    start=1,
                )
            ],
        }

    try:
        task_client = ProxmoxClient(
            infrastructure_id=infrastructure_id
        )

        return await task_client.task_details(
            node,
            upid,
        )

    except ProxmoxError as exc:
        raise HTTPException(
            status_code=502,
            detail=str(exc),
        ) from exc


@app.post("/api/guest/action")
async def guest_action(
    request: GuestAction,
    http_request: Request,
):
    require_operator_or_admin(http_request)

    audit_action = f"guest.{request.action}"
    audit_target = (
        f"{request.guest_type.upper()} "
        f"{request.vmid}"
    )

    try:
        guest_client = ProxmoxClient(
            infrastructure_id=
                request.infrastructure_id
        )

        upid = await guest_client.guest_action(
            request.node,
            request.guest_type,
            request.vmid,
            request.action,
        )

        action_labels = {
            "start": "Start",
            "shutdown": "Shutdown",
            "reboot": "Reboot",
            "stop": "Force stop",
            "reset": "Reset",
            "suspend": "Suspend",
            "resume": "Resume",
        }

        action_label = action_labels.get(
            request.action,
            request.action.replace(
                "_",
                " ",
            ).title(),
        )

        task = await track_proxmox_activity(
            guest_client,
            request.node,
            upid,
            request.infrastructure_id,
            kind="guest-action",
            title=(
                f"{action_label} "
                f"{request.guest_type.upper()} "
                f"{request.vmid}"
            ),
            result={
                "guest_type":
                    request.guest_type,
                "vmid":
                    request.vmid,
                "action":
                    request.action,
            },
        )

        write_request_audit_event(
            http_request,
            action=audit_action,
            result="success",
            severity="info",
            target_type=request.guest_type,
            target=audit_target,
            node=request.node,
            infrastructure_id=request.infrastructure_id,
            details={
                "vmid": request.vmid,
                "guest_type": request.guest_type,
                "requested_action": request.action,
                "upid": upid,
                "status": "task_started",
            },
        )

        return {
            "ok": True,
            "upid": upid,
            "task": task.public(),
        }

    except ProxmoxError as exc:
        write_request_audit_event(
            http_request,
            action=audit_action,
            result="failed",
            severity="error",
            target_type=request.guest_type,
            target=audit_target,
            node=request.node,
            infrastructure_id=request.infrastructure_id,
            details={
                "vmid": request.vmid,
                "guest_type": request.guest_type,
                "requested_action": request.action,
                "error": str(exc),
            },
        )

        raise HTTPException(
            status_code=502,
            detail=str(exc),
        ) from exc


@app.post("/api/node/maintenance")
async def maintenance(
    request: Maintenance,
    http_request: Request,
):
    require_operator_or_admin(http_request)

    task = manager.create(
        request.node,
        "maintenance",
        (
            f"{'Enable' if request.action == 'enable' else 'Disable'} "
            f"maintenance mode · {request.node}"
        ),
        infrastructure_id=
            request.infrastructure_id,
        source="manual",
        notifications_enabled=True,
    )

    manager.start(task)

    try:
        message = await set_maintenance(
            request.node,
            request.action,
            request.infrastructure_id,
        )

        manager.append(
            task,
            message,
        )

        manager.finish(
            task,
            {
                "action":
                    request.action,
                "message":
                    message,
            },
        )

        write_request_audit_event(
            http_request,
            action=f"node.maintenance.{request.action}",
            result="success",
            severity="info",
            target_type="node",
            target=request.node,
            node=request.node,
            infrastructure_id=request.infrastructure_id,
            details={
                "maintenance_action": request.action,
                "message": message,
            },
        )

        return {
            "ok": True,
            "message": message,
        }

    except MaintenanceError as exc:
        manager.fail(
            task,
            str(exc),
            {
                "action":
                    request.action,
            },
        )

        write_request_audit_event(
            http_request,
            action=f"node.maintenance.{request.action}",
            result="failed",
            severity="error",
            target_type="node",
            target=request.node,
            node=request.node,
            infrastructure_id=request.infrastructure_id,
            details={
                "maintenance_action": request.action,
                "error": str(exc),
            },
        )

        raise HTTPException(
            status_code=502,
            detail=str(exc),
        ) from exc


@app.post("/api/node/batch-action")
async def node_batch_action(
    request: NodeBatchAction,
    http_request: Request,
):
    require_operator_or_admin(
        http_request
    )

    if (
        request.action in {
            "install-updates",
            "package-cleanup",
        }
        and not request.confirmed
    ):
        raise HTTPException(
            status_code=400,
            detail=(
                "This batch action must be "
                "explicitly confirmed."
            ),
        )

    session = http_request.state.session

    try:
        task = await start_node_batch_action(
            request.nodes,
            request.action,
            request.infrastructure_id,
            user_id=int(
                session.user_id
            ),
            username=session.username,
            role=session.role,
            auth_source=session.source,
            ip_address=get_client_ip(
                http_request
            ),
        )

        return {
            "ok": True,
            "task": task.public(),
        }

    except RuntimeError as exc:
        raise HTTPException(
            status_code=409,
            detail=str(exc),
        ) from exc


@app.post("/api/node/action")
async def node_action(
    request: NodeAction,
    http_request: Request,
):
    require_operator_or_admin(http_request)

    audit_action = (
        "node."
        + request.action.replace("-", ".")
    )

    critical_actions = {
        "install-updates",
        "package-cleanup",
        "reboot",
        "shutdown",
    }

    try:
        if (
            request.action in critical_actions
            and not request.confirmed
        ):
            raise HTTPException(
                status_code=400,
                detail="Diese Aktion muss ausdrücklich bestätigt werden.",
            )

        if (
            request.action == "shutdown"
            and not request.acknowledge_no_maintenance
        ):
            try:
                action_client = ProxmoxClient(
                    infrastructure_id=
                        request.infrastructure_id
                )

                data = await action_client.dashboard()

                maintenance_enabled = any(
                    (
                        item.get("node")
                        or item.get("name")
                    ) == request.node
                    and item.get("type") == "lrm"
                    and "maintenance"
                    in str(
                        item.get("status", "")
                    ).lower()
                    for item in data.get("ha", [])
                )

            except ProxmoxError as exc:
                raise HTTPException(
                    status_code=502,
                    detail=str(exc),
                ) from exc

            if not maintenance_enabled:
                raise HTTPException(
                    status_code=409,
                    detail=(
                        "Der Node befindet sich nicht im Wartungsmodus. "
                        "Bestätige diese Warnung ausdrücklich."
                    ),
                )

        if request.action == "check-updates":
            task = await start_update_check(
                request.node,
                infrastructure_id=
                    request.infrastructure_id,
            )

        elif request.action == "install-updates":
            task = await start_update_install(
                request.node,
                infrastructure_id=
                    request.infrastructure_id,
            )

        elif request.action == "package-cleanup":
            task = await start_package_cleanup(
                request.node,
                infrastructure_id=
                    request.infrastructure_id,
            )

        elif request.action in {
            "reboot",
            "shutdown",
        }:
            task = await start_power_action(
                request.node,
                request.action,
                infrastructure_id=
                    request.infrastructure_id,
            )

        else:
            raise HTTPException(
                status_code=400,
                detail="Unbekannte Node-Aktion.",
            )

        public_task = task.public()

        write_request_audit_event(
            http_request,
            action=audit_action,
            result="success",
            severity=(
                "warning"
                if request.action
                in {
                    "install-updates",
                    "package-cleanup",
                    "reboot",
                    "shutdown",
                }
                else "info"
            ),
            target_type="node",
            target=request.node,
            node=request.node,
            infrastructure_id=request.infrastructure_id,
            details={
                "requested_action": request.action,
                "confirmed": request.confirmed,
                "acknowledge_no_maintenance":
                    request.acknowledge_no_maintenance,
                "status": "task_started",
            },
        )

        return {
            "ok": True,
            "task": public_task,
        }

    except HTTPException as exc:
        write_request_audit_event(
            http_request,
            action=audit_action,
            result="failed",
            severity=(
                "error"
                if exc.status_code >= 500
                else "warning"
            ),
            target_type="node",
            target=request.node,
            node=request.node,
            infrastructure_id=request.infrastructure_id,
            details={
                "requested_action": request.action,
                "http_status": exc.status_code,
                "error": str(exc.detail),
            },
        )

        raise

    except RuntimeError as exc:
        write_request_audit_event(
            http_request,
            action=audit_action,
            result="failed",
            severity="error",
            target_type="node",
            target=request.node,
            node=request.node,
            infrastructure_id=request.infrastructure_id,
            details={
                "requested_action": request.action,
                "error": str(exc),
            },
        )

        raise HTTPException(
            status_code=409,
            detail=str(exc),
        ) from exc


@app.get("/api/scheduler/tasks")
async def scheduler_list_tasks(
    request: Request,
):
    require_authenticated(request)

    return {
        "tasks": list_scheduled_tasks(),
    }


@app.get("/api/scheduler/tasks/{task_id}")
async def scheduler_get_task(
    task_id: int,
    request: Request,
):
    require_authenticated(request)

    task = get_scheduled_task(task_id)

    if task is None:
        raise HTTPException(
            status_code=404,
            detail="Scheduled task not found.",
        )

    return task


@app.post("/api/scheduler/tasks")
async def scheduler_create_task(
    payload: ScheduledTaskPayload,
    request: Request,
):
    require_operator_or_admin(request)

    session = request.state.session

    try:
        task = create_scheduled_task(
            infrastructure_id=
                payload.infrastructure_id,
            name=payload.name,
            description=payload.description,
            action=payload.action,
            target_type=payload.target_type,
            node=payload.node,
            guest_type=payload.guest_type,
            vmid=payload.vmid,
            payload={
                **payload.payload,
                "nodes": payload.nodes,
            },
            repeat_enabled=payload.repeat_enabled,
            interval_value=payload.interval_value,
            interval_unit=payload.interval_unit,
            timezone_name=payload.timezone,
            start_at=payload.start_at,
            created_by_user_id=int(session.user_id),
            created_by_username=session.username,
            enabled=payload.enabled,
        )

        write_request_audit_event(
            request,
            action="schedule.create",
            result="success",
            severity="info",
            target_type="scheduled_task",
            target=get_scheduled_task_target(task),
            node=task.get("node"),
            infrastructure_id=task.get(
                "infrastructure_id"
            ),
            details={
                "task_id": task["id"],
                "task_uuid": task["uuid"],
                "infrastructure_id":
                    task.get("infrastructure_id"),
                "action": task["action"],
                "target_type": task["target_type"],
                "guest_type": task.get("guest_type"),
                "vmid": task.get("vmid"),
                "start_at": task["start_at"],
                "repeat_enabled": task["repeat_enabled"],
                "interval_value": task.get("interval_value"),
                "interval_unit": task.get("interval_unit"),
            },
        )

        return task

    except SchedulerError as exc:
        write_request_audit_event(
            request,
            action="schedule.create",
            result="failed",
            severity="warning",
            target_type="scheduled_task",
            target=payload.name,
            node=payload.node,
            infrastructure_id=payload.infrastructure_id,
            details={
                "error": str(exc),
            },
        )

        raise HTTPException(
            status_code=400,
            detail=str(exc),
        ) from exc


@app.put("/api/scheduler/tasks/{task_id}")
async def scheduler_update_task(
    task_id: int,
    payload: ScheduledTaskPayload,
    request: Request,
):
    require_operator_or_admin(request)

    try:
        task = update_scheduled_task(
            task_id,
            infrastructure_id=
                payload.infrastructure_id,
            name=payload.name,
            description=payload.description,
            action=payload.action,
            target_type=payload.target_type,
            node=payload.node,
            guest_type=payload.guest_type,
            vmid=payload.vmid,
            payload={
                **payload.payload,
                "nodes": payload.nodes,
            },
            repeat_enabled=payload.repeat_enabled,
            interval_value=payload.interval_value,
            interval_unit=payload.interval_unit,
            timezone_name=payload.timezone,
            start_at=payload.start_at,
            enabled=payload.enabled,
        )

        write_request_audit_event(
            request,
            action="schedule.update",
            result="success",
            severity="info",
            target_type="scheduled_task",
            target=get_scheduled_task_target(task),
            node=task.get("node"),
            infrastructure_id=task.get(
                "infrastructure_id"
            ),
            details={
                "task_id": task["id"],
                "task_uuid": task["uuid"],
                "infrastructure_id":
                    task.get("infrastructure_id"),
                "action": task["action"],
                "start_at": task["start_at"],
                "repeat_enabled": task["repeat_enabled"],
                "interval_value": task.get("interval_value"),
                "interval_unit": task.get("interval_unit"),
                "enabled": task["enabled"],
            },
        )

        return task

    except SchedulerError as exc:
        raise HTTPException(
            status_code=404
            if "not found" in str(exc).lower()
            else 400,
            detail=str(exc),
        ) from exc


@app.patch("/api/scheduler/tasks/{task_id}/enabled")
async def scheduler_set_enabled(
    task_id: int,
    payload: ScheduledTaskEnabledPayload,
    request: Request,
):
    require_operator_or_admin(request)

    try:
        task = set_scheduled_task_enabled(
            task_id,
            payload.enabled,
        )

        write_request_audit_event(
            request,
            action=(
                "schedule.enable"
                if payload.enabled
                else "schedule.disable"
            ),
            result="success",
            severity="info",
            target_type="scheduled_task",
            target=get_scheduled_task_target(task),
            node=task.get("node"),
            infrastructure_id=task.get(
                "infrastructure_id"
            ),
            details={
                "task_id": task["id"],
                "task_uuid": task["uuid"],
                "enabled": task["enabled"],
            },
        )

        return task

    except SchedulerError as exc:
        raise HTTPException(
            status_code=404,
            detail=str(exc),
        ) from exc


@app.post("/api/scheduler/tasks/{task_id}/run")
async def scheduler_run_task_now(
    task_id: int,
    request: Request,
):
    require_operator_or_admin(request)

    session = request.state.session

    try:
        result = await start_manual_scheduled_task(
            task_id,
            user_id=int(session.user_id),
            username=session.username,
            role=session.role,
            source=session.source,
            ip_address=get_client_ip(request),
        )

        return result

    except SchedulerError as exc:
        message = str(exc)

        raise HTTPException(
            status_code=(
                404
                if "not found" in message.lower()
                else 409
            ),
            detail=message,
        ) from exc


@app.delete("/api/scheduler/tasks/{task_id}")
async def scheduler_delete_task(
    task_id: int,
    request: Request,
):
    require_operator_or_admin(request)

    try:
        task = delete_scheduled_task(
            task_id
        )

        write_request_audit_event(
            request,
            action="schedule.delete",
            result="success",
            severity="warning",
            target_type="scheduled_task",
            target=get_scheduled_task_target(task),
            node=task.get("node"),
            infrastructure_id=task.get(
                "infrastructure_id"
            ),
            details={
                "task_id": task["id"],
                "task_uuid": task["uuid"],
                "infrastructure_id":
                    task.get("infrastructure_id"),
                "action": task["action"],
            },
        )

        return {
            "ok": True,
            "deleted_task_id": task_id,
        }

    except SchedulerError as exc:
        raise HTTPException(
            status_code=404,
            detail=str(exc),
        ) from exc
