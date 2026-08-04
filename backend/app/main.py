import asyncio
import json
from pathlib import Path
from typing import Literal

from fastapi import (
    FastAPI,
    HTTPException,
    Query,
    Request,
    Response,
)
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from .auth import (
    SESSION_COOKIE_NAME,
    AuthenticationConfigurationError,
    create_session_token,
    username_matches,
    validate_auth_configuration,
    verify_password,
    verify_session_token,
)
from .config import get_settings
from .host_details import (
    HostDetailsError,
    collect_host_details,
)
from .maintenance import MaintenanceError, set_maintenance
from .network import (
    NetworkError,
    collect_cluster_network,
    collect_node_network,
)
from .proxmox import ProxmoxClient, ProxmoxError
from .update_cache import update_cache
from .tasks import (
    manager,
    start_backup_task,
    start_package_cleanup,
    start_power_action,
    start_update_check,
    start_update_install,
)


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


app = FastAPI(
    title="ProxPilot Backend",
    version=APP_VERSION,
)

client = ProxmoxClient()


class AuthLogin(BaseModel):
    username: str = Field(
        min_length=1,
        max_length=128,
    )
    password: str = Field(
        min_length=1,
        max_length=1024,
    )


class GuestAction(BaseModel):
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
    node: str = Field(
        min_length=1,
        max_length=64,
        pattern=r"^[A-Za-z0-9._-]+$",
    )
    guest_type: Literal["qemu", "lxc"]
    vmid: int = Field(gt=0)
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
    confirmed: bool = False


class SnapshotCreate(BaseModel):
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
        pattern=r"^[A-Za-z0-9._-]+$",
    )
    description: str = Field(
        default="",
        max_length=500,
    )
    include_ram: bool = False


class SnapshotOperation(BaseModel):
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
    job_id: str = Field(
        min_length=1,
        max_length=128,
        pattern=r"^[A-Za-z0-9._-]+$",
    )
    confirmed: bool = False


class GuestBackupRun(BaseModel):
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


class Maintenance(BaseModel):
    node: str
    action: Literal["enable", "disable"]


class NodeAction(BaseModel):
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

    token = request.cookies.get(
        SESSION_COOKIE_NAME,
    )

    authenticated = verify_session_token(
        token=token,
        expected_username=(
            settings.proxpilot_auth_username.strip()
        ),
        secret=settings.proxpilot_session_secret,
    )

    if not authenticated:
        return JSONResponse(
            status_code=401,
            content={
                "detail": "Authentication required.",
            },
        )

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

    authenticated = verify_session_token(
        token=request.cookies.get(
            SESSION_COOKIE_NAME,
        ),
        expected_username=(
            settings.proxpilot_auth_username.strip()
        ),
        secret=settings.proxpilot_session_secret,
    )

    return {
        "enabled": True,
        "authenticated": authenticated,
        "username": (
            settings.proxpilot_auth_username
            if authenticated
            else None
        ),
    }


@app.post("/api/auth/login")
async def auth_login(
    credentials: AuthLogin,
    response: Response,
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

    valid_username = username_matches(
        credentials.username,
    )

    valid_password = verify_password(
        credentials.password,
        settings.proxpilot_auth_password,
    )

    if not valid_username or not valid_password:
        raise HTTPException(
            status_code=401,
            detail="Invalid username or password.",
        )

    token = create_session_token(
        username=(
            settings.proxpilot_auth_username.strip()
        ),
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

    return {
        "ok": True,
        "authenticated": True,
        "username": settings.proxpilot_auth_username,
    }


@app.post("/api/auth/logout")
async def auth_logout(response: Response):
    response.delete_cookie(
        key=SESSION_COOKIE_NAME,
        path="/",
    )

    return {
        "ok": True,
        "authenticated": False,
    }


@app.get("/api/config")
async def config():
    settings = get_settings()

    return {
        "refresh_interval": settings.refresh_interval,
    }


@app.get("/api/network")
async def network_overview():
    try:
        network = await asyncio.to_thread(
            collect_cluster_network
        )

        dashboard = await client.dashboard()

        guests = {}

        for guest in dashboard.get("guests", []):
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

        for node in network.get("nodes", []):
            for interface in node.get("interfaces", []):
                name = interface.get("name", "")

                match = re.match(
                    r"^(?:tap|veth)(\d+)i\d+$",
                    name,
                )

                if not match:
                    continue

                vmid = int(match.group(1))

                if vmid in guests:
                    interface["guest"] = guests[vmid]

        return {
            **network,
            "guests": guests,
        }

    except (NetworkError, ProxmoxError) as exc:
        raise HTTPException(
            status_code=502,
            detail=str(exc),
        ) from exc


@app.get("/api/network/{node}")
async def node_network(node: str):
    settings = get_settings()

    if node not in settings.node_hosts:
        raise HTTPException(
            status_code=404,
            detail=(
                f"Node '{node}' ist nicht konfiguriert."
            ),
        )

    try:
        network = await asyncio.to_thread(
            collect_node_network,
            node,
        )

        dashboard = await client.dashboard()

        guests = {}

        for guest in dashboard.get("guests", []):
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

        for interface in network.get("interfaces", []):
            match = re.match(
                r"^(?:tap|veth)(\d+)i\d+$",
                interface.get("name", ""),
            )

            if not match:
                continue

            vmid = int(match.group(1))

            if vmid in guests:
                interface["guest"] = guests[vmid]

        return network

    except (NetworkError, ProxmoxError) as exc:
        raise HTTPException(
            status_code=502,
            detail=str(exc),
        ) from exc


@app.get("/api/node/{node}/details")
async def node_details(node: str):
    settings = get_settings()

    if node not in settings.node_hosts:
        raise HTTPException(
            status_code=404,
            detail=(
                f"Node '{node}' ist nicht konfiguriert."
            ),
        )

    try:
        return await asyncio.to_thread(
            collect_host_details,
            node,
        )

    except HostDetailsError as exc:
        raise HTTPException(
            status_code=502,
            detail=str(exc),
        ) from exc


@app.get("/api/dashboard")
async def dashboard():
    try:
        data = await client.dashboard()

        maintenance_nodes = {
            item.get("node") or item.get("name")
            for item in data.get("ha", [])
            if item.get("type") == "lrm"
            and "maintenance" in str(item.get("status", "")).lower()
        }

        for node in data.get("nodes", []):
            node["maintenance"] = node.get("node") in maintenance_nodes

        return data

    except ProxmoxError as exc:
        raise HTTPException(
            status_code=502,
            detail=str(exc),
        ) from exc


@app.post("/api/backup/run")
async def run_backup(request: BackupRun):
    if not request.confirmed:
        raise HTTPException(
            status_code=400,
            detail="Der manuelle Backup-Start muss bestätigt werden.",
        )

    try:
        data = await client.dashboard()

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
                client,
                node,
                request.job_id,
                dict(parameters),
            )

            tasks.append(task.public())

        return {
            "ok": True,
            "job_id": request.job_id,
            "nodes": online_nodes,
            "tasks": tasks,
        }

    except HTTPException:
        raise

    except ProxmoxError as exc:
        raise HTTPException(
            status_code=502,
            detail=str(exc),
        ) from exc


@app.post("/api/backup/guest")
async def run_guest_backup(request: GuestBackupRun):
    if not request.confirmed:
        raise HTTPException(
            status_code=400,
            detail="Der Einzelbackup-Start muss bestätigt werden.",
        )

    try:
        data = await client.dashboard()

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
            client,
            request.node,
            f"{request.job_id} · VMID {request.vmid}",
            parameters,
        )

        public_task = task.public()

        if task.state == "failed":
            raise HTTPException(
                status_code=502,
                detail=(
                    getattr(task, "error", None)
                    or "Der Backup-Task konnte nicht gestartet werden."
                ),
            )

        return {
            "ok": True,
            "job_id": request.job_id,
            "node": request.node,
            "guest_type": request.guest_type,
            "vmid": request.vmid,
            "storage": storage,
            "mode": parameters.get("mode"),
            "compress": parameters.get("compress"),
            "task": public_task,
        }

    except HTTPException:
        raise

    except ProxmoxError as exc:
        raise HTTPException(
            status_code=502,
            detail=str(exc),
        ) from exc


@app.get("/api/backup/task-log")
async def backup_task_log(
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
        return await client.task_details(node, upid)

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
):
    if vmid <= 0:
        raise HTTPException(
            status_code=400,
            detail="Ungültige VM-ID.",
        )

    try:
        items = await client.snapshots(
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
async def create_snapshot(request: SnapshotCreate):
    if request.guest_type == "lxc" and request.include_ram:
        raise HTTPException(
            status_code=400,
            detail="RAM-Snapshots werden für LXC-Container nicht unterstützt.",
        )

    try:
        upid = await client.create_snapshot(
            request.node,
            request.guest_type,
            request.vmid,
            request.name,
            request.description,
            request.include_ram,
        )

        return {
            "ok": True,
            "action": "create",
            "node": request.node,
            "guest_type": request.guest_type,
            "vmid": request.vmid,
            "snapshot_name": request.name,
            "upid": upid,
        }

    except ProxmoxError as exc:
        raise HTTPException(
            status_code=502,
            detail=str(exc),
        ) from exc


@app.post("/api/snapshots/delete")
async def delete_snapshot(request: SnapshotOperation):
    if not request.confirmed:
        raise HTTPException(
            status_code=400,
            detail="Das Löschen des Snapshots muss bestätigt werden.",
        )

    try:
        upid = await client.delete_snapshot(
            request.node,
            request.guest_type,
            request.vmid,
            request.snapshot_name,
        )

        return {
            "ok": True,
            "action": "delete",
            "node": request.node,
            "guest_type": request.guest_type,
            "vmid": request.vmid,
            "snapshot_name": request.snapshot_name,
            "upid": upid,
        }

    except ProxmoxError as exc:
        raise HTTPException(
            status_code=502,
            detail=str(exc),
        ) from exc


@app.post("/api/snapshots/rollback")
async def rollback_snapshot(request: SnapshotOperation):
    if not request.confirmed:
        raise HTTPException(
            status_code=400,
            detail="Das Zurückrollen des Snapshots muss bestätigt werden.",
        )

    try:
        upid = await client.rollback_snapshot(
            request.node,
            request.guest_type,
            request.vmid,
            request.snapshot_name,
        )

        return {
            "ok": True,
            "action": "rollback",
            "node": request.node,
            "guest_type": request.guest_type,
            "vmid": request.vmid,
            "snapshot_name": request.snapshot_name,
            "upid": upid,
        }

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
):
    if vmid <= 0:
        raise HTTPException(
            status_code=400,
            detail="Ungültige VM-ID.",
        )

    try:
        return await client.guest_details(
            node,
            guest_type,
            vmid,
        )

    except ProxmoxError as exc:
        raise HTTPException(
            status_code=502,
            detail=str(exc),
        ) from exc


@app.post("/api/guest/migrate")
async def migrate_guest(request: GuestMigration):
    if not request.confirmed:
        raise HTTPException(
            status_code=400,
            detail="Die Migration muss ausdrücklich bestätigt werden.",
        )

    if request.node == request.target:
        raise HTTPException(
            status_code=400,
            detail="Der Ziel-Node muss sich vom Quell-Node unterscheiden.",
        )

    if request.guest_type == "lxc" and request.online:
        raise HTTPException(
            status_code=400,
            detail=(
                "Für LXC wird keine QEMU-Live-Migration unterstützt. "
                "Verwende stattdessen die Restart-Migration."
            ),
        )

    try:
        upid = await client.migrate_guest(
            node=request.node,
            guest_type=request.guest_type,
            vmid=request.vmid,
            target=request.target,
            online=request.online,
            restart=request.restart,
            with_local_disks=request.with_local_disks,
            target_storage=request.target_storage,
        )

        return {
            "ok": True,
            "node": request.node,
            "target": request.target,
            "guest_type": request.guest_type,
            "vmid": request.vmid,
            "upid": upid,
        }

    except ProxmoxError as exc:
        raise HTTPException(
            status_code=502,
            detail=str(exc),
        ) from exc


@app.get("/api/proxmox-task/{node}")
async def proxmox_task(
    node: str,
    upid: str = Query(
        min_length=6,
        max_length=1024,
    ),
):
    try:
        return await client.task_details(node, upid)

    except ProxmoxError as exc:
        raise HTTPException(
            status_code=502,
            detail=str(exc),
        ) from exc


@app.post("/api/guest/action")
async def guest_action(request: GuestAction):
    try:
        upid = await client.guest_action(
            request.node,
            request.guest_type,
            request.vmid,
            request.action,
        )

        return {
            "ok": True,
            "upid": upid,
        }

    except ProxmoxError as exc:
        raise HTTPException(
            status_code=502,
            detail=str(exc),
        ) from exc


@app.post("/api/node/maintenance")
async def maintenance(request: Maintenance):
    try:
        message = await set_maintenance(
            request.node,
            request.action,
        )

        return {
            "ok": True,
            "message": message,
        }

    except MaintenanceError as exc:
        raise HTTPException(
            status_code=502,
            detail=str(exc),
        ) from exc


@app.post("/api/node/action")
async def node_action(request: NodeAction):
    critical_actions = {
        "install-updates",
        "package-cleanup",
        "reboot",
        "shutdown",
    }

    if request.action in critical_actions and not request.confirmed:
        raise HTTPException(
            status_code=400,
            detail="Diese Aktion muss ausdrücklich bestätigt werden.",
        )

    if (
        request.action == "shutdown"
        and not request.acknowledge_no_maintenance
    ):
        try:
            data = await client.dashboard()

            maintenance_enabled = any(
                (item.get("node") or item.get("name")) == request.node
                and item.get("type") == "lrm"
                and "maintenance" in str(item.get("status", "")).lower()
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

    try:
        if request.action == "check-updates":
            task = await start_update_check(request.node)

        elif request.action == "install-updates":
            task = await start_update_install(request.node)

        elif request.action == "package-cleanup":
            task = await start_package_cleanup(request.node)

        elif request.action in {"reboot", "shutdown"}:
            task = await start_power_action(
                request.node,
                request.action,
            )

        else:
            raise HTTPException(
                status_code=400,
                detail="Unbekannte Node-Aktion.",
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
