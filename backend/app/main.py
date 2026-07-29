from typing import Literal

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

from .config import get_settings
from .maintenance import MaintenanceError, set_maintenance
from .proxmox import ProxmoxClient, ProxmoxError
from .tasks import (
    manager,
    start_power_action,
    start_update_check,
    start_update_install,
)


app = FastAPI(
    title="ProxPilot Backend",
    version="0.3.0-alpha",
)

client = ProxmoxClient()


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


class Maintenance(BaseModel):
    node: str
    action: Literal["enable", "disable"]


class NodeAction(BaseModel):
    node: str
    action: Literal[
        "check-updates",
        "install-updates",
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
        "version": "0.3.0-alpha",
    }


@app.get("/api/config")
async def config():
    settings = get_settings()

    return {
        "refresh_interval": settings.refresh_interval,
    }


@app.get("/api/dashboard")
async def dashboard():
    try:
        data = await client.dashboard()

        maintenance_nodes = {
            item.get("node") or item.get("name")
            for item in data.get("ha", [])
            if item.get("type") == "node"
            and str(item.get("status", "")).lower() == "maintenance"
        }

        for node in data.get("nodes", []):
            node["maintenance"] = node.get("node") in maintenance_nodes

        return data

    except ProxmoxError as exc:
        raise HTTPException(
            status_code=502,
            detail=str(exc),
        ) from exc


@app.get("/api/tasks")
async def tasks():
    return {
        "tasks": manager.list(),
    }


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
                and item.get("type") == "node"
                and str(item.get("status", "")).lower() == "maintenance"
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
