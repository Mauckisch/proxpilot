from __future__ import annotations

import asyncio
import threading
import uuid
from collections import deque
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Literal

import paramiko

from .config import get_settings

TaskState = Literal["queued", "running", "success", "error"]


@dataclass
class ManagedTask:
    id: str
    node: str
    kind: str
    title: str
    state: TaskState = "queued"
    created_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    started_at: str | None = None
    finished_at: str | None = None
    output: list[str] = field(default_factory=list)
    result: dict = field(default_factory=dict)
    error: str | None = None

    def public(self) -> dict:
        data = asdict(self)
        data["output"] = data["output"][-500:]
        return data


class TaskManager:
    def __init__(self) -> None:
        self._tasks: dict[str, ManagedTask] = {}
        self._order: deque[str] = deque(maxlen=100)
        self._lock = threading.Lock()
        self._node_update_locks: set[str] = set()

    def list(self) -> list[dict]:
        with self._lock:
            return [self._tasks[task_id].public() for task_id in reversed(self._order)]

    def get(self, task_id: str) -> ManagedTask | None:
        with self._lock:
            return self._tasks.get(task_id)

    def create(self, node: str, kind: str, title: str) -> ManagedTask:
        task = ManagedTask(id=str(uuid.uuid4()), node=node, kind=kind, title=title)
        with self._lock:
            self._tasks[task.id] = task
            self._order.append(task.id)
        return task

    def append(self, task: ManagedTask, line: str) -> None:
        clean = line.rstrip("\r\n")
        if not clean:
            return
        with self._lock:
            task.output.append(clean)
            if len(task.output) > 1000:
                del task.output[:-500]

    def start(self, task: ManagedTask) -> None:
        with self._lock:
            task.state = "running"
            task.started_at = datetime.now(timezone.utc).isoformat()

    def finish(self, task: ManagedTask, result: dict | None = None) -> None:
        with self._lock:
            task.state = "success"
            task.finished_at = datetime.now(timezone.utc).isoformat()
            task.result = result or {}
            self._node_update_locks.discard(task.node)

    def fail(self, task: ManagedTask, error: str) -> None:
        with self._lock:
            task.state = "error"
            task.finished_at = datetime.now(timezone.utc).isoformat()
            task.error = error
            self._node_update_locks.discard(task.node)

    def reserve_update(self, node: str) -> bool:
        with self._lock:
            if self._node_update_locks:
                return False
            self._node_update_locks.add(node)
            return True


manager = TaskManager()


def _ssh_client(node: str) -> paramiko.SSHClient:
    settings = get_settings()
    host = settings.node_hosts.get(node)
    if not host:
        raise RuntimeError(f"Keine SSH-Adresse für Node '{node}' konfiguriert.")
    key = Path(settings.pve_ssh_key)
    if not key.is_file():
        raise RuntimeError(f"SSH-Key nicht gefunden: {key}")

    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(
        hostname=host,
        port=settings.pve_ssh_port,
        username=settings.pve_ssh_user,
        key_filename=str(key),
        look_for_keys=False,
        allow_agent=False,
        timeout=10,
    )
    return client


def _run_streaming(task: ManagedTask, command: str, timeout: int = 3600) -> tuple[int, str]:
    client = _ssh_client(task.node)
    collected: list[str] = []
    try:
        _, stdout, stderr = client.exec_command(command, timeout=timeout, get_pty=True)
        channel = stdout.channel
        while True:
            if channel.recv_ready():
                text = channel.recv(4096).decode("utf-8", errors="replace")
                collected.append(text)
                for line in text.splitlines():
                    manager.append(task, line)
            if channel.recv_stderr_ready():
                text = channel.recv_stderr(4096).decode("utf-8", errors="replace")
                collected.append(text)
                for line in text.splitlines():
                    manager.append(task, line)
            if channel.exit_status_ready() and not channel.recv_ready() and not channel.recv_stderr_ready():
                break
        return channel.recv_exit_status(), "".join(collected)
    finally:
        client.close()


def _execute_update_check(task: ManagedTask) -> None:
    manager.start(task)
    try:
        command = (
            "export DEBIAN_FRONTEND=noninteractive; "
            "apt-get update && "
            "echo '---UPGRADABLE---' && "
            "apt list --upgradable 2>/dev/null"
        )
        code, output = _run_streaming(task, command, timeout=900)
        if code != 0:
            raise RuntimeError(f"Update-Prüfung fehlgeschlagen (Exit-Code {code}).")
        lines = [line for line in output.splitlines() if "/" in line and "upgradable from:" in line]
        manager.finish(task, {"updates": len(lines), "packages": lines})
    except Exception as exc:
        manager.fail(task, str(exc))


def _execute_update_install(task: ManagedTask) -> None:
    manager.start(task)
    try:
        command = (
            "export DEBIAN_FRONTEND=noninteractive; "
            "apt-get update && "
            "apt-get -y -o Dpkg::Options::='--force-confold' full-upgrade"
        )
        code, _ = _run_streaming(task, command, timeout=7200)
        if code != 0:
            raise RuntimeError(f"Update-Installation fehlgeschlagen (Exit-Code {code}).")
        reboot_code, reboot_output = _run_streaming(
            task,
            "if [ -f /var/run/reboot-required ]; then echo yes; else echo no; fi",
            timeout=30,
        )
        reboot_required = reboot_code == 0 and reboot_output.strip().endswith("yes")
        manager.finish(task, {"reboot_required": reboot_required})
    except Exception as exc:
        manager.fail(task, str(exc))


def _execute_power(task: ManagedTask, action: str) -> None:
    manager.start(task)
    try:
        systemctl_action = "reboot" if action == "reboot" else "poweroff"
        command = f"nohup sh -c 'sleep 2; systemctl {systemctl_action}' >/dev/null 2>&1 & echo scheduled"
        code, output = _run_streaming(task, command, timeout=30)
        if code != 0 or "scheduled" not in output:
            raise RuntimeError(f"{action} konnte nicht geplant werden.")
        manager.finish(task, {"scheduled": True})
    except Exception as exc:
        manager.fail(task, str(exc))


async def start_update_check(node: str) -> ManagedTask:
    if not manager.reserve_update(node):
        raise RuntimeError("Es läuft bereits eine Update-Aktion auf einem Node.")
    task = manager.create(node, "update-check", f"Updates auf {node} prüfen")
    asyncio.create_task(asyncio.to_thread(_execute_update_check, task))
    return task


async def start_update_install(node: str) -> ManagedTask:
    if not manager.reserve_update(node):
        raise RuntimeError("Es läuft bereits eine Update-Aktion auf einem Node.")
    task = manager.create(node, "update-install", f"Updates auf {node} installieren")
    asyncio.create_task(asyncio.to_thread(_execute_update_install, task))
    return task


async def start_power_action(node: str, action: str) -> ManagedTask:
    task = manager.create(node, action, f"{node} {('neu starten' if action == 'reboot' else 'herunterfahren')}")
    asyncio.create_task(asyncio.to_thread(_execute_power, task, action))
    return task
