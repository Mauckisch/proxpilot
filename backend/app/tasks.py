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
    EVENT_GUEST_RESTORE_FAILED,
    EVENT_GUEST_RESTORE_SUCCESS,
    EVENT_GUEST_MIGRATION_FAILED,
    EVENT_GUEST_MIGRATION_SUCCESS,
    EVENT_MAINTENANCE_DISABLED,
    EVENT_MAINTENANCE_ENABLED,
    EVENT_MAINTENANCE_FAILED,
    EVENT_PACKAGE_CLEANUP_FAILED,
    EVENT_PACKAGE_CLEANUP_SUCCESS,
    EVENT_REBOOT_REQUIRED,
    EVENT_SNAPSHOT_CREATED,
    EVENT_SNAPSHOT_DELETED,
    EVENT_SNAPSHOT_FAILED,
    EVENT_SNAPSHOT_ROLLED_BACK,
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

        if task.kind == "guest-restore":
            guest_type = str(
                task.result.get(
                    "guest_type",
                    "",
                )
                or ""
            ).upper()

            vmid = task.result.get(
                "vmid"
            )

            archive = str(
                task.result.get(
                    "archive",
                    "",
                )
                or ""
            )

            storage = str(
                task.result.get(
                    "storage",
                    "",
                )
                or ""
            )

            storage_line = (
                f"\nTarget storage: {storage}"
                if storage
                else ""
            )

            if task.state == "success":
                send_notification_event(
                    EVENT_GUEST_RESTORE_SUCCESS,
                    (
                        "ProxPilot - Guest restore "
                        "completed"
                    ),
                    (
                        "✅ ProxPilot · Guest restore completed\n\n"
                        f"Infrastructure: {infrastructure_name}\n"
                        f"Node: {task.node}\n"
                        f"Guest: {guest_type} {vmid}\n"
                        f"Archive: {archive}"
                        f"{storage_line}"
                    ),
                )
            else:
                send_notification_event(
                    EVENT_GUEST_RESTORE_FAILED,
                    (
                        "ProxPilot - Guest restore "
                        "failed"
                    ),
                    (
                        "❌ ProxPilot · Guest restore failed\n\n"
                        f"Infrastructure: {infrastructure_name}\n"
                        f"Node: {task.node}\n"
                        f"Guest: {guest_type} {vmid}\n"
                        f"Archive: {archive}"
                        f"{storage_line}\n"
                        f"Error: {task.error or 'Unknown error'}"
                    ),
                )

            return

        if task.kind in {
            "snapshot",
            "scheduled-snapshot",
            "snapshot-rollback",
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

            operation_labels = {
                "create": "Create",
                "delete": "Delete",
                "rollback": "Rollback",
            }

            operation_success_text = {
                "create": "created",
                "delete": "deleted",
                "rollback": "rolled back",
            }

            operation_label = (
                operation_labels.get(
                    operation,
                    operation.replace(
                        "_",
                        " ",
                    ).title(),
                )
            )

            operation_text = (
                operation_success_text.get(
                    operation,
                    operation.replace(
                        "_",
                        " ",
                    ),
                )
            )

            if task.state == "success":
                success_event = {
                    "create":
                        EVENT_SNAPSHOT_CREATED,
                    "delete":
                        EVENT_SNAPSHOT_DELETED,
                    "rollback":
                        EVENT_SNAPSHOT_ROLLED_BACK,
                }.get(
                    operation
                )

                if success_event:
                    send_notification_event(
                        success_event,
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

            return

        if task.kind == "maintenance":
            maintenance_action = str(
                task.result.get(
                    "action",
                    "",
                )
                or ""
            ).lower()

            if task.state == "success":
                if maintenance_action == "enable":
                    send_notification_event(
                        EVENT_MAINTENANCE_ENABLED,
                        (
                            "ProxPilot - Maintenance "
                            f"mode enabled on {task.node}"
                        ),
                        (
                            "✅ ProxPilot · Maintenance mode enabled\n\n"
                            f"Infrastructure: {infrastructure_name}\n"
                            f"Node: {task.node}\n"
                            "Maintenance mode: Enabled"
                        ),
                    )

                elif maintenance_action == "disable":
                    send_notification_event(
                        EVENT_MAINTENANCE_DISABLED,
                        (
                            "ProxPilot - Maintenance "
                            f"mode disabled on {task.node}"
                        ),
                        (
                            "✅ ProxPilot · Maintenance mode disabled\n\n"
                            f"Infrastructure: {infrastructure_name}\n"
                            f"Node: {task.node}\n"
                            "Maintenance mode: Disabled"
                        ),
                    )

            else:
                action_label = {
                    "enable": "Enable",
                    "disable": "Disable",
                }.get(
                    maintenance_action,
                    maintenance_action.replace(
                        "_",
                        " ",
                    ).title()
                    or "Change",
                )

                send_notification_event(
                    EVENT_MAINTENANCE_FAILED,
                    (
                        "ProxPilot - Maintenance "
                        "mode change failed"
                    ),
                    (
                        "❌ ProxPilot · Maintenance mode change failed\n\n"
                        f"Infrastructure: {infrastructure_name}\n"
                        f"Node: {task.node}\n"
                        f"Operation: {action_label}\n"
                        f"Error: {task.error or 'Unknown error'}"
                    ),
                )

            return

        if task.kind == "guest-migration":
            guest_type = str(
                task.result.get(
                    "guest_type",
                    "",
                )
                or ""
            ).upper()

            vmid = task.result.get(
                "vmid"
            )

            source_node = str(
                task.result.get(
                    "source_node",
                    task.node,
                )
                or task.node
            )

            target_node = str(
                task.result.get(
                    "target_node",
                    "",
                )
                or ""
            )

            target_storage = (
                task.result.get(
                    "target_storage"
                )
            )

            storage_line = (
                f"\nTarget storage: {target_storage}"
                if target_storage
                else ""
            )

            if task.state == "success":
                send_notification_event(
                    EVENT_GUEST_MIGRATION_SUCCESS,
                    "ProxPilot - Guest migration completed",
                    (
                        "✅ ProxPilot · Guest migration completed\n\n"
                        f"Infrastructure: {infrastructure_name}\n"
                        f"Guest: {guest_type} {vmid}\n"
                        f"Source node: {source_node}\n"
                        f"Target node: {target_node}"
                        f"{storage_line}"
                    ),
                )
            else:
                send_notification_event(
                    EVENT_GUEST_MIGRATION_FAILED,
                    "ProxPilot - Guest migration failed",
                    (
                        "❌ ProxPilot · Guest migration failed\n\n"
                        f"Infrastructure: {infrastructure_name}\n"
                        f"Guest: {guest_type} {vmid}\n"
                        f"Source node: {source_node}\n"
                        f"Target node: {target_node}"
                        f"{storage_line}\n"
                        f"Error: {task.error or 'Unknown error'}"
                    ),
                )

            return

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

        if action == "reboot":
            update_cache.clear_reboot_required(
                task.node,
                task.infrastructure_id,
            )

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


async def _wait_proxmox_task(
        client,
        node: str,
        upid: str,
        *,
        task: ManagedTask | None = None,
        poll_interval: float = 2.0,
    ) -> dict:
        last_log_line = 0

        while True:
            details = await client.task_details(
                node,
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

            if task is not None:
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
                    != "OK"
                ):
                    raise RuntimeError(
                        "Proxmox task failed: "
                        f"{exit_status}"
                    )

                return status

            await asyncio.sleep(
                poll_interval
            )


async def _wait_guest_stopped(
    client,
    node: str,
    guest_type: str,
    vmid: int,
    *,
    timeout: int = 180,
) -> None:
    deadline = (
        asyncio.get_running_loop().time()
        + timeout
    )

    while True:
        status = await client.guest_status(
            node,
            guest_type,
            vmid,
        )

        current_state = str(
            status.get(
                "status",
                "",
            )
            or ""
        ).lower()

        if current_state == "stopped":
            return

        if (
            asyncio.get_running_loop().time()
            >= deadline
        ):
            raise RuntimeError(
                "Guest did not stop within "
                f"{timeout} seconds."
            )

        await asyncio.sleep(2)


async def _execute_guest_restore(
    task: ManagedTask,
    client,
    guest_type: str,
    vmid: int,
    archive: str,
    storage: str | None,
    *,
    start_after_restore: bool = False,
    execute: bool = False,
) -> None:
    manager.start(task)

    if not execute:
        manager.fail(
            task,
            (
                "Guest restore execution was blocked because "
                "the destructive execution guard was not enabled."
            ),
            {
                "guest_type": guest_type,
                "vmid": vmid,
                "archive": archive,
                "storage": storage,
                "start_after_restore":
                    start_after_restore,
                "restore_started": False,
                "restore_completed": False,
                "execution_blocked": True,
            },
        )
        return

    original_running = False
    ha_resource: dict | None = None
    original_ha_state: str | None = None
    restore_started = False
    restore_completed = False

    base_result = {
        "guest_type":
            guest_type,
        "vmid":
            vmid,
        "archive":
            archive,
        "storage":
            storage,
        "start_after_restore":
            start_after_restore,
        "ha_managed":
            False,
        "original_ha_state":
            None,
        "original_running":
            False,
    }

    try:
        manager.append(
            task,
            (
                "Reading current guest and HA "
                "state..."
            ),
        )

        status = await client.guest_status(
            task.node,
            guest_type,
            vmid,
        )

        original_running = (
            str(
                status.get(
                    "status",
                    "",
                )
                or ""
            ).lower()
            == "running"
        )

        ha_resource = (
            await client.guest_ha_resource(
                vmid
            )
        )

        if ha_resource is not None:
            original_ha_state = str(
                ha_resource.get(
                    "state",
                    "",
                )
                or ""
            ).strip()

        base_result[
            "ha_managed"
        ] = ha_resource is not None

        base_result[
            "original_ha_state"
        ] = original_ha_state

        base_result[
            "original_running"
        ] = original_running

        task.result = dict(
            base_result
        )

        if ha_resource is not None:
            manager.append(
                task,
                (
                    "Guest is HA managed"
                    + (
                        f" (state={original_ha_state})."
                        if original_ha_state
                        else "."
                    )
                ),
            )

            if (
                original_ha_state
                != "stopped"
            ):
                manager.append(
                    task,
                    (
                        "Requesting HA state "
                        "'stopped' before restore..."
                    ),
                )

                await client.set_guest_ha_state(
                    vmid,
                    "stopped",
                )

            await _wait_guest_stopped(
                client,
                task.node,
                guest_type,
                vmid,
            )

            manager.append(
                task,
                "Guest is stopped.",
            )

        elif original_running:
            manager.append(
                task,
                (
                    "Guest is running and is not "
                    "HA managed. Stopping guest "
                    "before restore..."
                ),
            )

            stop_upid = (
                await client.guest_action(
                    task.node,
                    guest_type,
                    vmid,
                    "stop",
                )
            )

            if (
                isinstance(stop_upid, str)
                and stop_upid.startswith(
                    "UPID:"
                )
            ):
                await _wait_proxmox_task(
                    client,
                    task.node,
                    stop_upid,
                    task=task,
                )

            await _wait_guest_stopped(
                client,
                task.node,
                guest_type,
                vmid,
            )

            manager.append(
                task,
                "Guest is stopped.",
            )

        manager.append(
            task,
            (
                "Starting restore from "
                f"{archive}..."
            ),
        )

        restore_upid = (
            await client.restore_guest(
                task.node,
                guest_type,
                vmid,
                archive,
                storage=storage,
            )
        )

        restore_started = True

        base_result[
            "upid"
        ] = restore_upid

        task.result = dict(
            base_result
        )

        manager.append(
            task,
            (
                "Restore task started: "
                f"{restore_upid}"
            ),
        )

        await _wait_proxmox_task(
            client,
            task.node,
            restore_upid,
            task=task,
        )

        restore_completed = True

        base_result[
            "restore_started"
        ] = True

        base_result[
            "restore_completed"
        ] = True

        task.result = dict(
            base_result
        )

        manager.append(
            task,
            "Guest restore completed successfully.",
        )

        if ha_resource is not None:
            desired_ha_state = (
                "started"
                if start_after_restore
                else "stopped"
            )

            manager.append(
                task,
                (
                    "Setting final HA state to "
                    f"'{desired_ha_state}'..."
                ),
            )

            await client.set_guest_ha_state(
                vmid,
                desired_ha_state,
            )

            base_result[
                "final_ha_state"
            ] = desired_ha_state

            base_result[
                "guest_started_after_restore"
            ] = start_after_restore

            manager.append(
                task,
                (
                    "Final HA state set to "
                    f"'{desired_ha_state}'."
                ),
            )

        elif start_after_restore:
            manager.append(
                task,
                (
                    "Starting guest after "
                    "successful restore..."
                ),
            )

            start_upid = (
                await client.guest_action(
                    task.node,
                    guest_type,
                    vmid,
                    "start",
                )
            )

            if (
                isinstance(start_upid, str)
                and start_upid.startswith(
                    "UPID:"
                )
            ):
                await _wait_proxmox_task(
                    client,
                    task.node,
                    start_upid,
                    task=task,
                )

            base_result[
                "guest_started_after_restore"
            ] = True

            manager.append(
                task,
                "Guest started successfully.",
            )

        else:
            base_result[
                "guest_started_after_restore"
            ] = False

            manager.append(
                task,
                (
                    "Guest remains stopped "
                    "after successful restore."
                ),
            )

        manager.finish(
            task,
            base_result,
        )

    except Exception as exc:
        failure_result = {
            **base_result,
            "restore_started":
                restore_started,
            "restore_completed":
                restore_completed,
        }

        #
        # If the destructive restore never started,
        # it is safe to return the guest to its
        # previous operational state.
        #
        if not restore_started:
            if (
                ha_resource is not None
                and original_ha_state
                and original_ha_state
                != "stopped"
            ):
                manager.append(
                    task,
                    (
                        "Restore did not start. "
                        "Restoring previous HA state "
                        f"'{original_ha_state}'..."
                    ),
                )

                try:
                    await client.set_guest_ha_state(
                        vmid,
                        original_ha_state,
                    )

                    failure_result[
                        "ha_state_restored"
                    ] = True

                    manager.append(
                        task,
                        (
                            "Previous HA state restored "
                            "because no restore data was "
                            "written."
                        ),
                    )

                except Exception as recovery_exc:
                    failure_result[
                        "ha_state_restored"
                    ] = False

                    failure_result[
                        "ha_recovery_error"
                    ] = str(
                        recovery_exc
                    )

                    manager.append(
                        task,
                        (
                            "WARNING: Restore never "
                            "started, but the previous "
                            "HA state could not be "
                            "restored: "
                            f"{recovery_exc}"
                        ),
                    )

            elif (
                ha_resource is None
                and original_running
            ):
                manager.append(
                    task,
                    (
                        "Restore did not start. Guest "
                        "was running before the "
                        "operation; starting it again..."
                    ),
                )

                try:
                    start_upid = (
                        await client.guest_action(
                            task.node,
                            guest_type,
                            vmid,
                            "start",
                        )
                    )

                    if (
                        isinstance(
                            start_upid,
                            str,
                        )
                        and start_upid.startswith(
                            "UPID:"
                        )
                    ):
                        await _wait_proxmox_task(
                            client,
                            task.node,
                            start_upid,
                            task=task,
                        )

                    failure_result[
                        "guest_restarted"
                    ] = True

                    manager.append(
                        task,
                        (
                            "Guest restarted because "
                            "the restore never began."
                        ),
                    )

                except Exception as recovery_exc:
                    failure_result[
                        "guest_restarted"
                    ] = False

                    failure_result[
                        "guest_recovery_error"
                    ] = str(
                        recovery_exc
                    )

                    manager.append(
                        task,
                        (
                            "WARNING: Restore never "
                            "started, but the guest "
                            "could not be restarted: "
                            f"{recovery_exc}"
                        ),
                    )

        #
        # Once the destructive restore has started,
        # never automatically return the guest to a
        # running state when the restore itself did
        # not complete successfully.
        #
        elif not restore_completed:
            if (
                ha_resource is not None
                and original_ha_state
                and original_ha_state
                != "stopped"
            ):
                failure_result[
                    "ha_state_restored"
                ] = False

                manager.append(
                    task,
                    (
                        "Restore started but did not "
                        "complete successfully. HA "
                        "resource is intentionally left "
                        "stopped for safety."
                    ),
                )

            elif (
                ha_resource is None
                and original_running
            ):
                failure_result[
                    "guest_restarted"
                ] = False

                manager.append(
                    task,
                    (
                        "Restore started but did not "
                        "complete successfully. Guest "
                        "is intentionally left stopped "
                        "for safety."
                    ),
                )

        #
        # The restore itself completed, but a
        # subsequent recovery action failed.
        #
        else:
            manager.append(
                task,
                (
                    "Restore data was completed, but "
                    "post-restore state recovery "
                    "failed. Guest state requires "
                    "manual verification."
                ),
            )

        manager.fail(
            task,
            str(exc),
            failure_result,
        )


async def start_guest_restore_task(
    client,
    node: str,
    guest_type: str,
    vmid: int,
    archive: str,
    infrastructure_id: int,
    *,
    storage: str | None = None,
    start_after_restore: bool = False,
    source: str = "manual",
) -> ManagedTask:
    task = manager.create(
        node,
        "guest-restore",
        (
            f"Restore {guest_type.upper()} "
            f"{vmid} from backup"
        ),
        infrastructure_id=
            infrastructure_id,
        source=source,
        notifications_enabled=True,
    )

    task.result = {
        "guest_type":
            guest_type,
        "vmid":
            vmid,
        "archive":
            archive,
        "storage":
            storage,
        "start_after_restore":
            start_after_restore,
    }

    asyncio.create_task(
        _execute_guest_restore(
            task,
            client,
            guest_type,
            vmid,
            archive,
            storage,
            start_after_restore=
                start_after_restore,
            execute=True,
        )
    )

    return task


async def _monitor_proxmox_activity(
    task: ManagedTask,
    client,
    upid: str,
    result: dict | None = None,
) -> None:
    manager.start(task)

    last_log_line = 0
    base_result = dict(result or {})
    base_result["upid"] = upid

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

                final_result = {
                    **base_result,
                    "exitstatus":
                        exit_status,
                }

                migration_cleanup_error = None

                if (
                    task.kind == "guest-migration"
                    and bool(
                        base_result.get(
                            "cross_infrastructure",
                            False,
                        )
                    )
                    and str(
                        base_result.get(
                            "guest_type",
                            "",
                        )
                    ).lower() == "qemu"
                ):
                    vmid = int(
                        base_result.get(
                            "vmid",
                            0,
                        )
                        or 0
                    )

                    delete_source = bool(
                        base_result.get(
                            "delete_source",
                            False,
                        )
                    )

                    migration_succeeded = (
                        exit_status.upper()
                        == "OK"
                    )

                    source_should_exist = not (
                        migration_succeeded
                        and delete_source
                    )

                    if (
                        vmid > 0
                        and source_should_exist
                    ):
                        try:
                            source_config = (
                                await client.request_node(
                                    task.node,
                                    "GET",
                                    (
                                        f"/nodes/{task.node}"
                                        f"/qemu/{vmid}/config"
                                    ),
                                )
                            )

                            source_lock = str(
                                (
                                    source_config
                                    or {}
                                ).get(
                                    "lock",
                                    "",
                                )
                                or ""
                            ).strip().lower()

                            final_result[
                                "source_lock_after_migration"
                            ] = (
                                source_lock
                                or None
                            )

                            if source_lock == "migrate":
                                manager.append(
                                    task,
                                    (
                                        "[cleanup] Removing "
                                        "migration lock from "
                                        f"source VM {vmid}."
                                    ),
                                )

                                unlock_code, _ = (
                                    await asyncio.to_thread(
                                        _run_streaming,
                                        task,
                                        f"qm unlock {vmid}",
                                        60,
                                        False,
                                    )
                                )

                                if unlock_code != 0:
                                    raise RuntimeError(
                                        (
                                            "Failed to unlock "
                                            f"source VM {vmid} "
                                            "after migration."
                                        )
                                    )

                                verify_config = (
                                    await client.request_node(
                                        task.node,
                                        "GET",
                                        (
                                            f"/nodes/{task.node}"
                                            f"/qemu/{vmid}/config"
                                        ),
                                    )
                                )

                                remaining_lock = str(
                                    (
                                        verify_config
                                        or {}
                                    ).get(
                                        "lock",
                                        "",
                                    )
                                    or ""
                                ).strip()

                                if remaining_lock:
                                    raise RuntimeError(
                                        (
                                            "Source VM "
                                            f"{vmid} is still "
                                            "locked after cleanup: "
                                            f"{remaining_lock}"
                                        )
                                    )

                                final_result[
                                    "source_unlocked"
                                ] = True

                                manager.append(
                                    task,
                                    (
                                        "[cleanup] Source VM "
                                        f"{vmid} unlocked."
                                    ),
                                )

                            else:
                                final_result[
                                    "source_unlocked"
                                ] = False

                                if source_lock:
                                    raise RuntimeError(
                                        (
                                            "Source VM "
                                            f"{vmid} has unexpected "
                                            "lock after migration: "
                                            f"{source_lock}"
                                        )
                                    )

                            staging_restore_plan = (
                                base_result.get(
                                    "staging_restore_plan",
                                    [],
                                )
                                or []
                            )

                            if staging_restore_plan:
                                manager.append(
                                    task,
                                    (
                                        "[cleanup] Restoring "
                                        "source VM disks to "
                                        "their original storage."
                                    ),
                                )

                            restored_disks = []

                            for restore_item in (
                                staging_restore_plan
                            ):
                                if not isinstance(
                                    restore_item,
                                    dict,
                                ):
                                    continue

                                disk_key = str(
                                    restore_item.get(
                                        "disk",
                                        "",
                                    )
                                    or ""
                                ).strip()

                                original_storage = str(
                                    restore_item.get(
                                        "original_storage",
                                        "",
                                    )
                                    or ""
                                ).strip()

                                if (
                                    not disk_key
                                    or not original_storage
                                ):
                                    raise RuntimeError(
                                        (
                                            "Invalid staging "
                                            "restore metadata."
                                        )
                                    )

                                config_before_restore = (
                                    await client.request_node(
                                        task.node,
                                        "GET",
                                        (
                                            f"/nodes/{task.node}"
                                            f"/qemu/{vmid}/config"
                                        ),
                                    )
                                )

                                if not isinstance(
                                    config_before_restore,
                                    dict,
                                ):
                                    raise RuntimeError(
                                        (
                                            "Could not load "
                                            "source VM config "
                                            "before storage restore."
                                        )
                                    )

                                disk_value = (
                                    config_before_restore.get(
                                        disk_key
                                    )
                                )

                                if not isinstance(
                                    disk_value,
                                    str,
                                ):
                                    raise RuntimeError(
                                        (
                                            f"Source disk "
                                            f"{disk_key} is missing "
                                            "before storage restore."
                                        )
                                    )

                                current_volume = (
                                    disk_value
                                    .split(",", 1)[0]
                                    .strip()
                                )

                                current_storage = (
                                    current_volume
                                    .split(":", 1)[0]
                                    .strip()
                                    if ":" in current_volume
                                    else ""
                                )

                                if (
                                    current_storage
                                    == original_storage
                                ):
                                    manager.append(
                                        task,
                                        (
                                            "[cleanup] "
                                            f"{disk_key} already "
                                            "uses original storage "
                                            f"{original_storage}."
                                        ),
                                    )

                                    restored_disks.append(
                                        {
                                            "disk":
                                                disk_key,
                                            "storage":
                                                original_storage,
                                            "already_restored":
                                                True,
                                        }
                                    )

                                    continue

                                existing_unused_keys = {
                                    str(key)
                                    for key
                                    in config_before_restore
                                    if (
                                        str(key).startswith(
                                            "unused"
                                        )
                                        and str(key)[6:].isdigit()
                                    )
                                }

                                manager.append(
                                    task,
                                    (
                                        "[cleanup] Moving "
                                        f"{disk_key} from "
                                        f"{current_storage or 'unknown'} "
                                        "back to "
                                        f"{original_storage}."
                                    ),
                                )

                                restore_upid = (
                                    await client.move_qemu_disk(
                                        node=task.node,
                                        vmid=vmid,
                                        disk=disk_key,
                                        target_storage=
                                            original_storage,
                                        delete_source=True,
                                    )
                                )

                                restore_timeout_seconds = (
                                    60 * 60 * 6
                                )

                                restore_started = (
                                    asyncio.get_running_loop()
                                    .time()
                                )

                                while True:
                                    restore_task = (
                                        await client.task_details(
                                            task.node,
                                            restore_upid,
                                        )
                                    )

                                    restore_status = (
                                        restore_task.get(
                                            "status",
                                            {},
                                        )
                                        or {}
                                    )

                                    restore_state = str(
                                        restore_status.get(
                                            "status",
                                            "",
                                        )
                                        or ""
                                    ).lower()

                                    if (
                                        restore_state
                                        == "stopped"
                                    ):
                                        restore_exit_status = str(
                                            restore_status.get(
                                                "exitstatus",
                                                "",
                                            )
                                            or ""
                                        ).upper()

                                        if (
                                            restore_exit_status
                                            != "OK"
                                        ):
                                            restore_log = (
                                                restore_task.get(
                                                    "log",
                                                    [],
                                                )
                                                or []
                                            )

                                            last_restore_line = ""

                                            if restore_log:
                                                last_restore_line = str(
                                                    (
                                                        restore_log[-1]
                                                        or {}
                                                    ).get(
                                                        "t",
                                                        "",
                                                    )
                                                    or ""
                                                ).strip()

                                            raise RuntimeError(
                                                (
                                                    "Source storage "
                                                    "restore failed for "
                                                    f"{disk_key}"
                                                )
                                                + (
                                                    ": "
                                                    + last_restore_line
                                                    if last_restore_line
                                                    else (
                                                        " with exit "
                                                        "status "
                                                        + (
                                                            restore_exit_status
                                                            or "unknown"
                                                        )
                                                    )
                                                )
                                            )

                                        break

                                    restore_elapsed = (
                                        asyncio.get_running_loop()
                                        .time()
                                        - restore_started
                                    )

                                    if (
                                        restore_elapsed
                                        >=
                                        restore_timeout_seconds
                                    ):
                                        raise RuntimeError(
                                            (
                                                "Source storage "
                                                "restore timed out "
                                                f"for {disk_key}."
                                            )
                                        )

                                    await asyncio.sleep(2)

                                config_after_restore = (
                                    await client.request_node(
                                        task.node,
                                        "GET",
                                        (
                                            f"/nodes/{task.node}"
                                            f"/qemu/{vmid}/config"
                                        ),
                                    )
                                )

                                if not isinstance(
                                    config_after_restore,
                                    dict,
                                ):
                                    raise RuntimeError(
                                        (
                                            "Could not verify "
                                            "source VM config "
                                            "after storage restore."
                                        )
                                    )

                                restored_value = (
                                    config_after_restore.get(
                                        disk_key
                                    )
                                )

                                if not isinstance(
                                    restored_value,
                                    str,
                                ):
                                    raise RuntimeError(
                                        (
                                            f"Restored disk "
                                            f"{disk_key} is missing."
                                        )
                                    )

                                restored_volume = (
                                    restored_value
                                    .split(",", 1)[0]
                                    .strip()
                                )

                                restored_storage = (
                                    restored_volume
                                    .split(":", 1)[0]
                                    .strip()
                                    if ":" in restored_volume
                                    else ""
                                )

                                if (
                                    restored_storage
                                    != original_storage
                                ):
                                    raise RuntimeError(
                                        (
                                            "Source storage restore "
                                            f"verification failed for "
                                            f"{disk_key}: expected "
                                            f"{original_storage}, got "
                                            f"{restored_storage or 'unknown'}."
                                        )
                                    )

                                current_unused_keys = {
                                    str(key)
                                    for key
                                    in config_after_restore
                                    if (
                                        str(key).startswith(
                                            "unused"
                                        )
                                        and str(key)[6:].isdigit()
                                    )
                                }

                                restore_unused_keys = sorted(
                                    current_unused_keys
                                    - existing_unused_keys
                                )

                                if restore_unused_keys:
                                    manager.append(
                                        task,
                                        (
                                            "[cleanup] Removing "
                                            "temporary staging "
                                            "volume reference(s): "
                                            + ", ".join(
                                                restore_unused_keys
                                            )
                                        ),
                                    )

                                    await client.request_node(
                                        task.node,
                                        "POST",
                                        (
                                            f"/nodes/{task.node}"
                                            f"/qemu/{vmid}/config"
                                        ),
                                        data={
                                            "delete":
                                                ",".join(
                                                    restore_unused_keys
                                                ),
                                        },
                                    )

                                    cleanup_verify = (
                                        await client.request_node(
                                            task.node,
                                            "GET",
                                            (
                                                f"/nodes/{task.node}"
                                                f"/qemu/{vmid}/config"
                                            ),
                                        )
                                    )

                                    remaining_unused = [
                                        key
                                        for key
                                        in restore_unused_keys
                                        if (
                                            isinstance(
                                                cleanup_verify,
                                                dict,
                                            )
                                            and key
                                            in cleanup_verify
                                        )
                                    ]

                                    if remaining_unused:
                                        raise RuntimeError(
                                            (
                                                "Temporary staging "
                                                "disk cleanup failed: "
                                            )
                                            + ", ".join(
                                                remaining_unused
                                            )
                                        )

                                restored_disks.append(
                                    {
                                        "disk":
                                            disk_key,
                                        "storage":
                                            original_storage,
                                        "already_restored":
                                            False,
                                    }
                                )

                                manager.append(
                                    task,
                                    (
                                        "[cleanup] "
                                        f"{disk_key} restored "
                                        "to original storage "
                                        f"{original_storage}."
                                    ),
                                )

                            if restored_disks:
                                final_result[
                                    "source_storage_restored"
                                ] = True

                                final_result[
                                    "restored_disks"
                                ] = restored_disks

                                manager.append(
                                    task,
                                    (
                                        "[cleanup] Source VM "
                                        "storage layout restored."
                                    ),
                                )

                        except Exception as exc:
                            migration_cleanup_error = str(
                                exc
                            )

                            final_result[
                                "source_unlock_error"
                            ] = (
                                migration_cleanup_error
                            )

                            manager.append(
                                task,
                                (
                                    "[cleanup] WARNING: "
                                    "Source migration lock "
                                    "cleanup failed: "
                                    f"{migration_cleanup_error}"
                                ),
                            )

                    elif (
                        migration_succeeded
                        and delete_source
                    ):
                        final_result[
                            "source_unlock_skipped"
                        ] = (
                            "source_deleted"
                        )

                if (
                    exit_status.upper()
                    == "OK"
                ):
                    if migration_cleanup_error:
                        manager.partial(
                            task,
                            final_result,
                        )
                    else:
                        manager.finish(
                            task,
                            final_result,
                        )
                else:
                    manager.fail(
                        task,
                        (
                            "Proxmox task failed: "
                            f"{exit_status}"
                        ),
                        final_result,
                    )

                return

            await asyncio.sleep(2)

    except Exception as exc:
        manager.fail(
            task,
            str(exc),
            base_result,
        )


async def create_managed_proxmox_activity(
    node: str,
    infrastructure_id: int,
    *,
    kind: str,
    title: str,
    result: dict | None = None,
    source: str = "manual",
    notifications_enabled: bool = False,
) -> ManagedTask:
    """
    Create and start a ProxPilot managed task before a
    Proxmox UPID exists.

    This is used for multi-stage operations where ProxPilot
    performs preparation work before starting the actual
    Proxmox task, for example:

        ZFS -> staging storage
        remote migration
        source storage restoration
    """

    task = manager.create(
        node,
        kind,
        title,
        infrastructure_id=
            infrastructure_id,
        source=source,
        notifications_enabled=
            notifications_enabled,
    )

    task.result = dict(
        result or {}
    )

    manager.start(
        task
    )

    return task


async def monitor_managed_proxmox_activity(
    task: ManagedTask,
    client,
    upid: str,
    result: dict | None = None,
) -> None:
    """
    Attach an already existing ProxPilot ManagedTask to a
    real Proxmox UPID.

    This is used for multi-stage operations that already
    started before Proxmox created the final task UPID.
    """

    merged_result = {
        **dict(task.result or {}),
        **dict(result or {}),
        "upid": upid,
    }

    task.result = merged_result

    await _monitor_proxmox_activity(
        task,
        client,
        upid,
        merged_result,
    )


async def track_proxmox_activity(
    client,
    node: str,
    upid: str,
    infrastructure_id: int,
    *,
    kind: str,
    title: str,
    result: dict | None = None,
    source: str = "manual",
    notifications_enabled: bool = False,
) -> ManagedTask:
    task = manager.create(
        node,
        kind,
        title,
        infrastructure_id=
            infrastructure_id,
        source=source,
        notifications_enabled=
            notifications_enabled,
    )

    task.result = {
        **dict(result or {}),
        "upid": upid,
    }

    asyncio.create_task(
        _monitor_proxmox_activity(
            task,
            client,
            upid,
            result,
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
