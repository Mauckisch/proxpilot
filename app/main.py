from pathlib import Path
from typing import Literal

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from .config import get_settings
from .maintenance import MaintenanceError, set_maintenance
from .proxmox import ProxmoxClient, ProxmoxError
from .tasks import manager, start_power_action, start_update_check, start_update_install

base = Path(__file__).parent
static = base / "static"
app = FastAPI(title="Proxmox Management Dashboard", version="0.2.0")
app.mount("/static", StaticFiles(directory=static), name="static")
client = ProxmoxClient()


class GuestAction(BaseModel):
    node: str
    guest_type: Literal["qemu", "lxc"]
    vmid: int = Field(gt=0)
    action: Literal["start", "shutdown", "reboot", "stop", "reset", "suspend", "resume"]


class Maintenance(BaseModel):
    node: str
    action: Literal["enable", "disable"]


class NodeAction(BaseModel):
    node: str
    action: Literal["check-updates", "install-updates", "reboot", "shutdown"]
    confirmed: bool = False
    acknowledge_no_maintenance: bool = False


@app.get("/")
async def index():
    return FileResponse(static / "index.html")


@app.get("/api/health")
async def health():
    return {"status": "ok", "version": "0.2.0"}


@app.get("/api/config")
async def config():
    return {"refresh_interval": get_settings().refresh_interval}


@app.get("/api/dashboard")
async def dashboard():
    try:
        data = await client.dashboard()
        maintenance_nodes = {
            item.get("node") or item.get("name")
            for item in data.get("ha", [])
            if item.get("type") == "node" and str(item.get("status", "")).lower() == "maintenance"
        }
        for node in data.get("nodes", []):
            node["maintenance"] = node.get("node") in maintenance_nodes
        return data
    except ProxmoxError as exc:
        raise HTTPException(502, str(exc)) from exc


@app.get("/api/tasks")
async def tasks():
    return {"tasks": manager.list()}


@app.post("/api/guest/action")
async def guest_action(request: GuestAction):
    try:
        return {
            "ok": True,
            "upid": await client.guest_action(
                request.node, request.guest_type, request.vmid, request.action
            ),
        }
    except ProxmoxError as exc:
        raise HTTPException(502, str(exc)) from exc


@app.post("/api/node/maintenance")
async def maintenance(request: Maintenance):
    try:
        return {"ok": True, "message": await set_maintenance(request.node, request.action)}
    except MaintenanceError as exc:
        raise HTTPException(502, str(exc)) from exc


@app.post("/api/node/action")
async def node_action(request: NodeAction):
    if request.action in {"install-updates", "reboot", "shutdown"} and not request.confirmed:
        raise HTTPException(400, "Diese Aktion muss ausdrücklich bestätigt werden.")

    if request.action == "shutdown" and not request.acknowledge_no_maintenance:
        try:
            data = await client.dashboard()
            maintenance = any(
                (item.get("node") or item.get("name")) == request.node
                and item.get("type") == "node"
                and str(item.get("status", "")).lower() == "maintenance"
                for item in data.get("ha", [])
            )
        except ProxmoxError as exc:
            raise HTTPException(502, str(exc)) from exc
        if not maintenance:
            raise HTTPException(
                409,
                "Der Node befindet sich nicht im Wartungsmodus. Bestätige diese Warnung ausdrücklich.",
            )

    try:
        if request.action == "check-updates":
            task = await start_update_check(request.node)
        elif request.action == "install-updates":
            task = await start_update_install(request.node)
        elif request.action in {"reboot", "shutdown"}:
            task = await start_power_action(request.node, request.action)
        else:
            raise HTTPException(400, "Unbekannte Node-Aktion.")
        return {"ok": True, "task": task.public()}
    except RuntimeError as exc:
        raise HTTPException(409, str(exc)) from exc
