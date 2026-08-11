from __future__ import annotations

import asyncio
import re
import threading
import uuid
from collections import deque
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Literal

import paramiko

from .audit import write_audit_event
from .infrastructures import get_infrastructure
from .notifications import (
    EVENT_GUEST_BACKUP_FAILED,
    EVENT_GUEST_BACKUP_SUCCESS,
    EVENT_PACKAGE_CLEANUP_FAILED,
    EVENT_PACKAGE_CLEANUP_SUCCESS,
    EVENT_REBOOT_REQUIRED,
    EVENT_SNAPSHOT_FAILED,
    EVENT_SNAPSHOT_SUCCESS,
    EVENT_UPDATE_INSTALL_FAILED,
    EVENT_UPDATE_INSTALL_SUCCESS,
    EVENT_UPDATES_AVAILABLE,
    send_notification_event,
)
from .update_cache import NodeUpdateStatus, update_cache
from .update_parser import parse_packages

TaskState = Literal[
    "queued",
    "running",
    "success",
    "partial",
    "error",
]


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
    notifications_enabled: bool = True

    def public(self) -> dict:
        data = asdict(self)
        data["output"] = data["output"][-500:]
        return data


def _task_infrastructure_name(
    task: ManagedTask,
) -> str:
    infrastructure = get_infrastructure(
        task.infrastructure_id
    )

    if infrastructure is None:
        return str(
            task.infrastructure_id
        )

    return str(
        infrastructure.get(
            "name",
            task.infrastructure_id,
        )
    )


def _send_task_notification(
    task: ManagedTask,
) -> None:
    # Scheduled executions are summarized by
    # scheduler_worker.py after the complete
    # scheduled run has finished. This prevents
    # duplicate notifications for the internal
    # managed task and the schedule itself.
    if task.source == "scheduler":
        return

    try:
        infrastructure_name = (
            _task_infrastructure_name(
                task
            )
        )

        if task.kind in {
            "batch-update-check",
            "batch-update-install",
            "batch-package-cleanup",
        }:
            _send_batch_notification(
                task
            )
            return

        if task.kind == "update-check":
            if task.state != "success":
                return

            updates = int(
                task.result.get(
                    "updates",
                    0,
                )
                or 0
            )

            reboot_required = bool(
                task.result.get(
                    "reboot_required",
                    False,
                )
            )

            if updates > 0:
                message = (
                    "📦 ProxPilot · Updates available\n\n"
                    f"Infrastructure: {infrastructure_name}\n"
                    f"Node: {task.node}\n"
                    f"Available updates: {updates}\n"
                    "Reboot required: "
                    f"{'Yes' if reboot_required else 'No'}"
                )

                delivery = send_notification_event(
                    EVENT_UPDATES_AVAILABLE,
                    (
                        "ProxPilot - Updates available "
                        f"on {task.node}"
                    ),
                    message,
                )

                manager.append(
                    task,
                    (
                        "[notification] UPDATES_AVAILABLE "
                        f"email={delivery['email']} "
                        f"discord={delivery['discord']}"
                    ),
                )

            if reboot_required:
                delivery = send_notification_event(
                    EVENT_REBOOT_REQUIRED,
                    (
                        "ProxPilot - Reboot required "
                        f"on {task.node}"
                    ),
                    (
                        "🔄 ProxPilot · Reboot required\n\n"
                        f"Infrastructure: {infrastructure_name}\n"
                        f"Node: {task.node}\n"
                        "A reboot is required to complete "
                        "installed system or kernel updates."
                    ),
                )

                manager.append(
                    task,
                    (
                        "[notification] REBOOT_REQUIRED "
                        f"email={delivery['email']} "
                        f"discord={delivery['discord']}"
                    ),
                )

            return

        if task.kind == "update-install":
            if task.state == "success":
                remaining = int(
                    task.result.get(
                        "updates",
                        0,
                    )
                    or 0
                )

                reboot_required = bool(
                    task.result.get(
                        "reboot_required",
                        False,
                    )
                )

                send_notification_event(
                    EVENT_UPDATE_INSTALL_SUCCESS,
                    (
                        "ProxPilot - Updates installed "
                        f"on {task.node}"
                    ),
                    (
                        "✅ ProxPilot · Update installation completed\n\n"
                        f"Infrastructure: {infrastructure_name}\n"
                        f"Node: {task.node}\n"
                        f"Remaining updates: {remaining}\n"
                        "Reboot required: "
                        f"{'Yes' if reboot_required else 'No'}"
                    ),
                )

                if reboot_required:
                    send_notification_event(
                        EVENT_REBOOT_REQUIRED,
                        (
                            "ProxPilot - Reboot required "
                            f"on {task.node}"
                        ),
                        (
                            "🔄 ProxPilot · Reboot required\n\n"
                            f"Infrastructure: {infrastructure_name}\n"
                            f"Node: {task.node}\n"
                            "The update installation completed, "
                            "but a reboot is required."
                        ),
                    )

            else:
                send_notification_event(
                    EVENT_UPDATE_INSTALL_FAILED,
                    (
                        "ProxPilot - Update installation failed "
                        f"on {task.node}"
                    ),
                    (
                        "❌ ProxPilot · Update installation failed\n\n"
                        f"Infrastructure: {infrastructure_name}\n"
                        f"Node: {task.node}\n"
                        f"Error: {task.error or 'Unknown error'}"
                    ),
                )

            return

        if task.kind == "package-cleanup":
            if task.state == "success":
                send_notification_event(
                    EVENT_PACKAGE_CLEANUP_SUCCESS,
                    (
                        "ProxPilot - Cleanup completed "
                        f"on {task.node}"
                    ),
                    (
                        "✅ ProxPilot · Package cleanup completed\n\n"
                        f"Infrastructure: {infrastructure_name}\n"
                        f"Node: {task.node}"
                    ),
                )
            else:
                send_notification_event(
                    EVENT_PACKAGE_CLEANUP_FAILED,
                    (
                        "ProxPilot - Cleanup failed "
                        f"on {task.node}"
                    ),
                    (
                        "❌ ProxPilot · Package cleanup failed\n\n"
                        f"Infrastructure: {infrastructure_name}\n"
                        f"Node: {task.node}\n"
                        f"Error: {task.error or 'Unknown error'}"
                    ),
                )

            return

        if task.kind == "backup":
            job_id = str(
                task.result.get(
                    "job_id",
                    "",
                )
                or ""
            )

            if task.state == "success":
                send_notification_event(
                    EVENT_GUEST_BACKUP_SUCCESS,
                    "ProxPilot - Backup completed",
                    (
                        "✅ ProxPilot · Backup completed\n\n"
                        f"Infrastructure: {infrastructure_name}\n"
                        f"Node: {task.node}\n"
                        f"Job: {job_id or task.title}"
                    ),
                )
            else:
                send_notification_event(
                    EVENT_GUEST_BACKUP_FAILED,
                    "ProxPilot - Backup failed",
                    (
                        "❌ ProxPilot · Backup failed\n\n"
                        f"Infrastructure: {infrastructure_name}\n"
                        f"Node: {task.node}\n"
                        f"Job: {job_id or task.title}\n"
                        f"Error: {task.error or 'Unknown error'}"
                    ),
                )

            return

        if task.kind in {
            "snapshot",
            "scheduled-snapshot",
        }:
            snapshot_name = str(
                task.result.get(
                    "snapshot_name",
                    "",
                )
                or ""
            )

            operation = str(
                task.result.get(
                    "operation",
                    "create",
                )
                or "create"
            )

            operation_label = (
                "Delete"
                if operation == "delete"
                else "Create"
            )

            operation_text = (
                "deleted"
                if operation == "delete"
                else "created"
            )

            if task.state == "success":
                send_notification_event(
                    EVENT_SNAPSHOT_SUCCESS,
                    (
                        "ProxPilot - Snapshot "
                        f"{operation_text}"
                    ),
                    (
                        "✅ ProxPilot · Snapshot "
                        f"{operation_text}\n\n"
                        f"Infrastructure: {infrastructure_name}\n"
                        f"Node: {task.node}\n"
                        f"Operation: {operation_label}\n"
                        f"Snapshot: {snapshot_name or task.title}"
                    ),
                )
            else:
                send_notification_event(
                    EVENT_SNAPSHOT_FAILED,
                    (
                        "ProxPilot - Snapshot "
                        f"{operation_label.lower()} failed"
                    ),
                    (
                        "❌ ProxPilot · Snapshot "
                        f"{operation_label.lower()} failed\n\n"
                        f"Infrastructure: {infrastructure_name}\n"
                        f"Node: {task.node}\n"
                        f"Operation: {operation_label}\n"
                        f"Snapshot: {snapshot_name or task.title}\n"
                        f"Error: {task.error or 'Unknown error'}"
                    ),
                )

    except Exception as exc:
        # Notification delivery must never change
        # the actual task result.
        manager.append(
            task,
            (
                "[notification] Delivery failed: "
                f"{exc}"
            ),
        )


def _natural_node_sort_key(
    value: str,
) -> list[object]:
    return [
        int(part)
        if part.isdigit()
        else part.lower()
        for part in re.split(
            r"(\d+)",
            value,
        )
    ]


def _send_batch_notification(
    task: ManagedTask,
) -> None:
    result = task.result or {}

    items = (
        result.get("nodes", [])
        if isinstance(
            result.get("nodes", []),
            list,
        )
        else []
    )

    items = sorted(
        items,
        key=lambda item:
            _natural_node_sort_key(
                str(
                    item.get(
                        "node",
                        "",
                    )
                )
            )
        if isinstance(item, dict)
        else [],
    )

    infrastructure_name = (
        _task_infrastructure_name(task)
    )

    total = int(
        result.get("total", len(items))
        or len(items)
    )

    successful = int(
        result.get("successful", 0)
        or 0
    )

    failed = int(
        result.get("failed", 0)
        or 0
    )

    lines = []

    for item in items:
        if not isinstance(item, dict):
            continue

        node = str(
            item.get("node", "unknown")
        )

        if item.get("state") == "success":
            suffix = ""

            node_result = item.get("result")

            if isinstance(node_result, dict):
                if task.kind == "batch-update-check":
                    updates = int(
                        node_result.get(
                            "updates",
                            0,
                        )
                        or 0
                    )

                    suffix = (
                        f" · {updates} update"
                        f"{'' if updates == 1 else 's'}"
                    )

                    if node_result.get(
                        "reboot_required"
                    ):
                        suffix += (
                            " · reboot required"
                        )

                elif task.kind == "batch-update-install":
                    remaining = int(
                        node_result.get(
                            "updates",
                            0,
                        )
                        or 0
                    )

                    suffix = (
                        f" · {remaining} remaining"
                    )

                    if node_result.get(
                        "reboot_required"
                    ):
                        suffix += (
                            " · reboot required"
                        )

            lines.append(
                f"✅ {node}{suffix}"
            )

        else:
            lines.append(
                (
                    f"❌ {node} · "
                    f"{item.get('error') or 'Unknown error'}"
                )
            )

    result_label = (
        "Success"
        if failed == 0
        else (
            "Partial failure"
            if successful > 0
            else "Failed"
        )
    )

    reboot_nodes = [
        str(item.get("node"))
        for item in items
        if (
            isinstance(item, dict)
            and item.get("state") == "success"
            and isinstance(
                item.get("result"),
                dict,
            )
            and bool(
                item["result"].get(
                    "reboot_required",
                    False,
                )
            )
        )
    ]

    reboot_summary = (
        "\nReboot required: "
        + ", ".join(reboot_nodes)
        if reboot_nodes
        else ""
    )

    if task.kind == "batch-update-check":
        total_updates = sum(
            int(
                (
                    item.get("result") or {}
                ).get(
                    "updates",
                    0,
                )
                or 0
            )
            for item in items
            if (
                isinstance(item, dict)
                and item.get("state")
                == "success"
                and isinstance(
                    item.get("result"),
                    dict,
                )
            )
        )

        # "Updates available" should only fire when
        # updates actually exist.
        if total_updates <= 0:
            return

        event_key = EVENT_UPDATES_AVAILABLE
        subject = (
            "ProxPilot - Updates available "
            f"on {total} nodes"
        )
        heading = (
            "📦 ProxPilot · Cluster update check"
        )

        summary_extra = (
            f"\nAvailable updates: {total_updates}"
        )

    elif task.kind == "batch-update-install":
        event_key = (
            EVENT_UPDATE_INSTALL_SUCCESS
            if failed == 0
            else EVENT_UPDATE_INSTALL_FAILED
        )

        subject = (
            "ProxPilot - Cluster update "
            + (
                "completed"
                if failed == 0
                else "partially failed"
            )
        )

        heading = (
            "✅ ProxPilot · Cluster update installation"
            if failed == 0
            else "⚠️ ProxPilot · Cluster update installation"
        )

        summary_extra = ""

    elif task.kind == "batch-package-cleanup":
        event_key = (
            EVENT_PACKAGE_CLEANUP_SUCCESS
            if failed == 0
            else EVENT_PACKAGE_CLEANUP_FAILED
        )

        subject = (
            "ProxPilot - Cluster cleanup "
            + (
                "completed"
                if failed == 0
                else "partially failed"
            )
        )

        heading = (
            "✅ ProxPilot · Cluster package cleanup"
            if failed == 0
            else "⚠️ ProxPilot · Cluster package cleanup"
        )

        summary_extra = ""

    else:
        return

    message = (
        f"{heading}\n\n"
        f"Infrastructure: {infrastructure_name}\n"
        f"Nodes: {total}\n"
        f"Successful: {successful}\n"
        f"Failed: {failed}"
        f"{summary_extra}"
        f"{reboot_summary}\n\n"
        + "\n".join(lines)
        + f"\n\nResult: {result_label}"
    )

    delivery = send_notification_event(
        event_key,
        subject,
        message,
    )

    manager.append(
        task,
        (
            f"[notification] {event_key} "
            f"email={delivery['email']} "
            f"discord={delivery['discord']}"
        ),
    )


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
        *,
        visible: bool = True,
        notifications_enabled: bool = True,
    ) -> ManagedTask:
        task = ManagedTask(
            id=str(uuid.uuid4()),
            node=node,
            kind=kind,
            title=title,
            source=source,
            infrastructure_id=infrastructure_id,
            notifications_enabled=
                notifications_enabled,
        )

        if visible:
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

        if task.notifications_enabled:
            _send_task_notification(
                task
            )

    def fail(
        self,
        task: ManagedTask,
        error: str,
        result: dict | None = None,
    ) -> None:
        with self._lock:
            task.state = "error"
            task.finished_at = datetime.now(timezone.utc).isoformat()
            task.error = error

            if result is not None:
                task.result = result

            self._node_update_locks.discard(
                (task.infrastructure_id, task.node)
            )

        if task.notifications_enabled:
            _send_task_notification(
                task
            )

    def partial(
        self,
        task: ManagedTask,
        result: dict,
    ) -> None:
        with self._lock:
            task.state = "partial"
            task.finished_at = datetime.now(timezone.utc).isoformat()
            task.result = result

        if task.notifications_enabled:
            _send_task_notification(
                task
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


async def _execute_batch_node_action(
    task: ManagedTask,
    nodes: list[str],
    action: str,
    *,
    user_id: int | None,
    username: str,
    role: str,
    auth_source: str,
    ip_address: str | None,
) -> None:
    manager.start(task)

    results: list[dict] = []

    async def execute_node(
        node: str,
    ) -> dict:
        if not manager.reserve_update(
            node,
            task.infrastructure_id,
        ):
            return {
                "node": node,
                "state": "error",
                "error":
                    "An update action is already running on this node.",
            }

        kind_map = {
            "check-updates":
                "update-check",
            "install-updates":
                "update-install",
            "package-cleanup":
                "package-cleanup",
        }

        child = manager.create(
            node,
            kind_map[action],
            f"Internal batch action on {node}",
            infrastructure_id=
                task.infrastructure_id,
            source="batch",
            visible=False,
            notifications_enabled=False,
        )

        try:
            if action == "check-updates":
                await asyncio.to_thread(
                    _execute_update_check,
                    child,
                )

            elif action == "install-updates":
                await asyncio.to_thread(
                    _execute_update_install,
                    child,
                )

            elif action == "package-cleanup":
                await asyncio.to_thread(
                    _execute_package_cleanup,
                    child,
                )

            else:
                raise RuntimeError(
                    f"Unsupported batch action: {action}"
                )

            if child.state == "success":
                return {
                    "node": node,
                    "state": "success",
                    "result": child.result,
                }

            return {
                "node": node,
                "state": "error",
                "error":
                    child.error
                    or "Node action failed.",
            }

        except Exception as exc:
            manager.fail(
                child,
                str(exc),
            )

            return {
                "node": node,
                "state": "error",
                "error": str(exc),
            }

    try:
        results = list(
            await asyncio.gather(
                *[
                    execute_node(node)
                    for node in nodes
                ]
            )
        )

        successful = sum(
            1
            for item in results
            if item["state"] == "success"
        )

        failed = (
            len(results)
            - successful
        )

        summary = {
            "action": action,
            "total": len(results),
            "successful": successful,
            "failed": failed,
            "nodes": results,
        }

        for item in results:
            if item["state"] == "success":
                manager.append(
                    task,
                    (
                        f"[success] "
                        f"{item['node']}"
                    ),
                )
            else:
                manager.append(
                    task,
                    (
                        f"[failed] "
                        f"{item['node']}: "
                        f"{item.get('error')}"
                    ),
                )

        if failed == 0:
            manager.finish(
                task,
                summary,
            )
            audit_result = "success"
            severity = "info"

        elif successful > 0:
            manager.partial(
                task,
                summary,
            )
            audit_result = "partial"
            severity = "warning"

        else:
            manager.fail(
                task,
                "All node actions failed.",
                summary,
            )
            audit_result = "failed"
            severity = "error"

        infrastructure_name = (
            _task_infrastructure_name(
                task
            )
        )

        write_audit_event(
            action=(
                "node.batch."
                + action.replace(
                    "-",
                    ".",
                )
            ),
            result=audit_result,
            severity=severity,
            user_id=user_id,
            username=username,
            role=role,
            source=auth_source,
            ip_address=ip_address,
            target_type="infrastructure",
            target=infrastructure_name,
            node=None,
            infrastructure_id=
                task.infrastructure_id,
            details={
                "batch_task_id":
                    task.id,
                **summary,
            },
        )

    except Exception as exc:
        if task.state in {
            "queued",
            "running",
        }:
            manager.fail(
                task,
                str(exc),
            )


async def start_node_batch_action(
    nodes: list[str],
    action: str,
    infrastructure_id: int,
    *,
    user_id: int | None,
    username: str,
    role: str,
    auth_source: str,
    ip_address: str | None,
) -> ManagedTask:
    unique_nodes = list(
        dict.fromkeys(
            node.strip()
            for node in nodes
            if node.strip()
        )
    )

    if not unique_nodes:
        raise RuntimeError(
            "At least one node is required."
        )

    kind_map = {
        "check-updates":
            "batch-update-check",
        "install-updates":
            "batch-update-install",
        "package-cleanup":
            "batch-package-cleanup",
    }

    title_map = {
        "check-updates":
            "Check updates",
        "install-updates":
            "Install updates",
        "package-cleanup":
            "Package cleanup",
    }

    if action not in kind_map:
        raise RuntimeError(
            f"Unsupported batch action: {action}"
        )

    task = manager.create(
        "batch",
        kind_map[action],
        (
            f"{title_map[action]} on "
            f"{len(unique_nodes)} nodes"
        ),
        infrastructure_id=
            infrastructure_id,
        source="manual",
    )

    asyncio.create_task(
        _execute_batch_node_action(
            task,
            unique_nodes,
            action,
            user_id=user_id,
            username=username,
            role=role,
            auth_source=auth_source,
            ip_address=ip_address,
        )
    )

    return task


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
    operation: str = "create",
) -> ManagedTask:
    if operation == "delete":
        title = (
            f"Delete snapshot {snapshot_name} "
            f"from {guest_type.upper()} "
            f"{vmid}"
        )
    else:
        title = (
            f"Create snapshot {snapshot_name} "
            f"on {guest_type.upper()} "
            f"{vmid}"
        )

    task = manager.create(
        node,
        "snapshot",
        title,
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
        "operation": operation,
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
