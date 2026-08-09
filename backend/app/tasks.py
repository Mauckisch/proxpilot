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

from .infrastructures import get_infrastructure
from .update_cache import NodeUpdateStatus, update_cache
from .update_parser import parse_packages

TaskState = Literal["queued", "running", "success", "error"]


@dataclass
class ManagedTask:
    id: str
    node: str
    kind: str
    title: str
    infrastructure_id: int
    source: str = "manual"
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
        self._node_update_locks: set[tuple[int, str]] = set()

    def list(self) -> list[dict]:
        with self._lock:
            return [self._tasks[task_id].public() for task_id in reversed(self._order)]

    def get(self, task_id: str) -> ManagedTask | None:
        with self._lock:
            return self._tasks.get(task_id)

    def create(
        self,
        node: str,
        kind: str,
        title: str,
        infrastructure_id: int,
        source: str = "manual",
    ) -> ManagedTask:
        task = ManagedTask(
            id=str(uuid.uuid4()),
            node=node,
            kind=kind,
            title=title,
            source=source,
            infrastructure_id=infrastructure_id,
        )
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
            self._node_update_locks.discard(
                (task.infrastructure_id, task.node)
            )

    def fail(self, task: ManagedTask, error: str) -> None:
        with self._lock:
            task.state = "error"
            task.finished_at = datetime.now(timezone.utc).isoformat()
            task.error = error
            self._node_update_locks.discard(
                (task.infrastructure_id, task.node)
            )

    def reserve_update(
        self,
        node: str,
        infrastructure_id: int,
    ) -> bool:
        key = (
            infrastructure_id,
            node,
        )

        with self._lock:
            if key in self._node_update_locks:
                return False

            self._node_update_locks.add(
                key
            )

            return True


manager = TaskManager()


def _ssh_client(
    node: str,
    infrastructure_id: int,
) -> paramiko.SSHClient:
    if infrastructure_id <= 0:
        raise RuntimeError(
            "A valid infrastructure ID is required."
        )

    infrastructure = get_infrastructure(
        infrastructure_id
    )

    if infrastructure is None:
        raise RuntimeError(
            f"Infrastructure {infrastructure_id} not found."
        )

    if not infrastructure["enabled"]:
        raise RuntimeError(
            f"Infrastructure {infrastructure_id} is disabled."
        )

    node_entry = next(
        (
            item
            for item in infrastructure["nodes"]
            if item.get("node_name") == node
            and item.get("enabled")
        ),
        None,
    )

    if node_entry is None:
        raise RuntimeError(
            f"Node '{node}' is not configured in "
            f"infrastructure {infrastructure_id}."
        )

    host = node_entry.get("host")
    ssh_user = infrastructure["ssh_user"]
    ssh_key = infrastructure["ssh_key"]
    ssh_port = infrastructure["ssh_port"]

    if not host:
        raise RuntimeError(
            f"Keine SSH-Adresse für Node '{node}' konfiguriert."
        )

    key = Path(ssh_key)

    if not key.is_file():
        raise RuntimeError(
            f"SSH-Key nicht gefunden: {key}"
        )

    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(
        paramiko.AutoAddPolicy()
    )

    client.connect(
        hostname=host,
        port=ssh_port,
        username=ssh_user,
        key_filename=str(key),
        look_for_keys=False,
        allow_agent=False,
        timeout=10,
    )

    return client


def _run_streaming(
    task: ManagedTask,
    command: str,
    timeout: int = 3600,
    use_pty: bool = False,
) -> tuple[int, str]:
    client = _ssh_client(
        task.node,
        task.infrastructure_id,
    )
    collected: list[str] = []
    try:
        _, stdout, stderr = client.exec_command(
            command,
            timeout=timeout,
            get_pty=use_pty,
        )
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


def _execute_update_check(
    task: ManagedTask,
    start_task: bool = True,
) -> None:
    if start_task:
        manager.start(task)

    try:
        command = (
            "export DEBIAN_FRONTEND=noninteractive && "
            "export PAGER=cat && "
            "export APT_PAGER=cat && "
            "export TERM=dumb && "
            "apt-get update -q -o Dpkg::Use-Pty=0 && "
            "echo '---UPGRADABLE---' && "
            "apt list --upgradable 2>/dev/null && "
            "echo '---REBOOT---' && "
            "if [ -f /var/run/reboot-required ]; "
            "then echo yes; else echo no; fi && "
            "echo '---RUNNING-KERNEL---' && "
            "uname -r && "
            "echo '---NEWEST-KERNEL---' && "
            "find /boot -maxdepth 1 -type f "
            "-name 'vmlinuz-*' -printf '%f\\n' 2>/dev/null "
            "| sed 's/^vmlinuz-//' "
            "| sort -V "
            "| tail -n 1"
        )

        code, output = _run_streaming(
            task,
            command,
            timeout=900,
            use_pty=False,
        )

        if code != 0:
            raise RuntimeError(
                f"Update-Prüfung fehlgeschlagen "
                f"(Exit-Code {code})."
            )

        package_output = output

        if "---UPGRADABLE---" in output:
            package_output = output.split(
                "---UPGRADABLE---",
                1,
            )[1]

        if "---REBOOT---" in package_output:
            package_output, system_output = package_output.split(
                "---REBOOT---",
                1,
            )
        else:
            system_output = ""

        reboot_output = system_output
        running_kernel_output = ""
        newest_kernel_output = ""

        if "---RUNNING-KERNEL---" in reboot_output:
            reboot_output, running_kernel_output = (
                reboot_output.split(
                    "---RUNNING-KERNEL---",
                    1,
                )
            )

        if "---NEWEST-KERNEL---" in running_kernel_output:
            running_kernel_output, newest_kernel_output = (
                running_kernel_output.split(
                    "---NEWEST-KERNEL---",
                    1,
                )
            )

        packages = parse_packages(
            package_output.splitlines()
        )

        reboot_file_required = (
            reboot_output.strip()
            .splitlines()[-1:]
            == ["yes"]
        )

        running_kernel_lines = [
            line.strip()
            for line in running_kernel_output.splitlines()
            if line.strip()
        ]

        newest_kernel_lines = [
            line.strip()
            for line in newest_kernel_output.splitlines()
            if line.strip()
        ]

        running_kernel = (
            running_kernel_lines[-1]
            if running_kernel_lines
            else ""
        )

        newest_kernel = (
            newest_kernel_lines[-1]
            if newest_kernel_lines
            else ""
        )

        kernel_reboot_pending = bool(
            running_kernel
            and newest_kernel
            and running_kernel != newest_kernel
        )

        reboot_required = (
            reboot_file_required
            or kernel_reboot_pending
        )

        kernel_prefixes = (
            "pve-kernel",
            "proxmox-kernel",
            "linux-image",
        )

        kernel_package_available = any(
            package.name.startswith(kernel_prefixes)
            for package in packages
        )

        kernel_update = (
            kernel_package_available
            or kernel_reboot_pending
        )

        status = NodeUpdateStatus(
            node=task.node,
            infrastructure_id=task.infrastructure_id,
            updates=len(packages),
            reboot_required=reboot_required,
            kernel_update=kernel_update,
            packages=packages,
        )

        update_cache.set(status)

        manager.finish(
            task,
            {
                "updates": len(packages),
                "packages": [
                    {
                        "name": package.name,
                        "repository": package.repository,
                        "current_version": package.current_version,
                        "available_version": package.available_version,
                    }
                    for package in packages
                ],
                "reboot_required": reboot_required,
                "kernel_update": kernel_update,
                "running_kernel": running_kernel,
                "newest_kernel": newest_kernel,
                "kernel_reboot_pending": kernel_reboot_pending,
                "checked_at": status.checked_at,
            },
        )

    except Exception as exc:
        manager.fail(task, str(exc))


def _execute_update_install(task: ManagedTask) -> None:
    manager.start(task)
    try:
        command = (
            "export DEBIAN_FRONTEND=noninteractive && "
            "export PAGER=cat && "
            "export APT_PAGER=cat && "
            "export TERM=dumb && "
            "apt-get update -o Dpkg::Use-Pty=0 && "
            "apt-get -y -o Dpkg::Options::='--force-confold' full-upgrade"
        )
        code, _ = _run_streaming(task, command, timeout=7200)
        if code != 0:
            raise RuntimeError(f"Update-Installation fehlgeschlagen (Exit-Code {code}).")
        manager.append(
            task,
            "Update-Installation abgeschlossen. "
            "Verbleibende Updates werden automatisch geprüft.",
        )

        _execute_update_check(
            task,
            start_task=False,
        )
    except Exception as exc:
        manager.fail(task, str(exc))


def _execute_package_cleanup(task: ManagedTask) -> None:
    manager.start(task)
    try:
        command = (
            "export DEBIAN_FRONTEND=noninteractive && "
            "export PAGER=cat && "
            "export APT_PAGER=cat && "
            "export TERM=dumb && "
            "apt-get -y -o Dpkg::Use-Pty=0 autoremove && "
            "apt-get -o Dpkg::Use-Pty=0 autoclean"
        )
        code, _ = _run_streaming(task, command, timeout=3600)
        if code != 0:
            raise RuntimeError(
                f"Paketbereinigung fehlgeschlagen (Exit-Code {code})."
            )
        manager.finish(task)
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


async def start_update_check(
    node: str,
    infrastructure_id: int,
    source: str = "manual",
) -> ManagedTask:
    if not manager.reserve_update(
        node,
        infrastructure_id,
    ):
        raise RuntimeError("Es läuft bereits eine Update-Aktion auf einem Node.")

    task = manager.create(
        node,
        "update-check",
        f"Updates auf {node} prüfen",
        source=source,
        infrastructure_id=infrastructure_id,
    )

    asyncio.create_task(
        asyncio.to_thread(
            _execute_update_check,
            task,
        )
    )

    return task


async def start_update_install(
    node: str,
    infrastructure_id: int,
    source: str = "manual",
) -> ManagedTask:
    if not manager.reserve_update(
        node,
        infrastructure_id,
    ):
        raise RuntimeError("Es läuft bereits eine Update-Aktion auf einem Node.")

    task = manager.create(
        node,
        "update-install",
        f"Updates auf {node} installieren",
        source=source,
        infrastructure_id=infrastructure_id,
    )

    asyncio.create_task(
        asyncio.to_thread(
            _execute_update_install,
            task,
        )
    )

    return task


async def start_package_cleanup(
    node: str,
    infrastructure_id: int,
    source: str = "manual",
) -> ManagedTask:
    if not manager.reserve_update(
        node,
        infrastructure_id,
    ):
        raise RuntimeError("Es läuft bereits eine Update-Aktion auf einem Node.")

    task = manager.create(
        node,
        "package-cleanup",
        f"Paketbereinigung auf {node}",
        source=source,
        infrastructure_id=infrastructure_id,
    )

    asyncio.create_task(
        asyncio.to_thread(
            _execute_package_cleanup,
            task,
        )
    )

    return task


async def start_power_action(
    node: str,
    action: str,
    infrastructure_id: int,
    source: str = "manual",
) -> ManagedTask:
    task = manager.create(
        node,
        action,
        f"{node} {('neu starten' if action == 'reboot' else 'herunterfahren')}",
        source=source,
        infrastructure_id=infrastructure_id,
    )

    asyncio.create_task(
        asyncio.to_thread(
            _execute_power,
            task,
            action,
        )
    )

    return task


async def _monitor_proxmox_backup(
    task: ManagedTask,
    client,
    upid: str,
) -> None:
    manager.start(task)

    last_log_line = 0

    try:
        while True:
            details = await client.task_details(
                task.node,
                upid,
            )

            status = details.get("status", {}) or {}
            log_entries = details.get("log", []) or []

            for entry in log_entries:
                line_number = int(entry.get("n", 0) or 0)

                if line_number <= last_log_line:
                    continue

                message = str(entry.get("t", "")).strip()

                if message:
                    manager.append(task, message)

                last_log_line = max(
                    last_log_line,
                    line_number,
                )

            if status.get("status") == "stopped":
                exit_status = str(
                    status.get("exitstatus", "unknown")
                )

                if exit_status.upper() == "OK":
                    manager.finish(
                        task,
                        {
                            "upid": upid,
                            "exitstatus": exit_status,
                        },
                    )
                else:
                    raise RuntimeError(
                        f"Backup fehlgeschlagen: {exit_status}"
                    )

                return

            await asyncio.sleep(2)

    except Exception as exc:
        manager.fail(task, str(exc))


async def _monitor_proxmox_snapshot(
    task: ManagedTask,
    client,
    upid: str,
    snapshot_name: str,
) -> None:
    manager.start(task)

    last_log_line = 0

    try:
        while True:
            details = await client.task_details(
                task.node,
                upid,
            )

            status = (
                details.get("status", {})
                or {}
            )

            log_entries = (
                details.get("log", [])
                or []
            )

            for entry in log_entries:
                line_number = int(
                    entry.get("n", 0)
                    or 0
                )

                if (
                    line_number
                    <= last_log_line
                ):
                    continue

                message = str(
                    entry.get("t", "")
                ).strip()

                if message:
                    manager.append(
                        task,
                        message,
                    )

                last_log_line = max(
                    last_log_line,
                    line_number,
                )

            if (
                status.get("status")
                == "stopped"
            ):
                exit_status = str(
                    status.get(
                        "exitstatus",
                        "unknown",
                    )
                )

                if (
                    exit_status.upper()
                    == "OK"
                ):
                    manager.finish(
                        task,
                        {
                            "upid": upid,
                            "snapshot_name":
                                snapshot_name,
                            "exitstatus":
                                exit_status,
                        },
                    )
                else:
                    raise RuntimeError(
                        (
                            "Snapshot "
                            "fehlgeschlagen: "
                            f"{exit_status}"
                        )
                    )

                return

            await asyncio.sleep(2)

    except Exception as exc:
        manager.fail(
            task,
            str(exc),
        )


async def track_snapshot_task(
    client,
    node: str,
    guest_type: str,
    vmid: int,
    snapshot_name: str,
    upid: str,
    infrastructure_id: int,
    source: str = "manual",
) -> ManagedTask:
    task = manager.create(
        node,
        "snapshot",
        (
            f"Snapshot {snapshot_name} "
            f"auf {guest_type.upper()} "
            f"{vmid}"
        ),
        infrastructure_id=
            infrastructure_id,
        source=source,
    )

    task.result = {
        "upid": upid,
        "snapshot_name":
            snapshot_name,
        "guest_type":
            guest_type,
        "vmid": vmid,
    }

    asyncio.create_task(
        _monitor_proxmox_snapshot(
            task,
            client,
            upid,
            snapshot_name,
        )
    )

    return task


async def start_backup_task(
    client,
    node: str,
    job_id: str,
    parameters: dict,
    infrastructure_id: int,
    source: str = "manual",
) -> ManagedTask:
    task = manager.create(
        node,
        "backup",
        f"Backup auf {node} · {job_id}",
        source=source,
        infrastructure_id=infrastructure_id,
    )

    try:
        upid = await client.run_backup(
            node,
            parameters,
        )
    except Exception as exc:
        manager.fail(task, str(exc))
        return task

    task.result = {
        "upid": upid,
        "job_id": job_id,
    }

    asyncio.create_task(
        _monitor_proxmox_backup(
            task,
            client,
            upid,
        )
    )

    return task
