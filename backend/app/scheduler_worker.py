from __future__ import annotations

import asyncio
import json
import logging
from datetime import UTC, datetime
from typing import Any

from .audit import write_audit_event
from .database import get_connection
from .maintenance import set_maintenance
from .proxmox import ProxmoxClient
from .scheduler import (
    SchedulerError,
    calculate_next_run,
    get_scheduled_task,
)
from .tasks import (
    manager,
    start_backup_task,
    start_package_cleanup,
    start_power_action,
    start_update_check,
    start_update_install,
)


logger = logging.getLogger(__name__)

POLL_INTERVAL_SECONDS = 5

client = ProxmoxClient()

_scheduler_task: asyncio.Task | None = None
_scheduler_stop_event: asyncio.Event | None = None


def _utc_now() -> datetime:
    return datetime.now(UTC)


def _utc_now_iso() -> str:
    return _utc_now().isoformat()


def _execution_message(
    trigger: str,
) -> str:
    if trigger == "manual":
        return "Started manually from Task Scheduler."

    return "Started automatically by Task Scheduler."


def _execution_label(
    trigger: str,
) -> str:
    return (
        "Manual"
        if trigger == "manual"
        else "Scheduled"
    )


def _decode_payload(
    value: str | None,
) -> dict[str, Any]:
    if not value:
        return {}

    try:
        decoded = json.loads(value)
    except json.JSONDecodeError:
        return {}

    if not isinstance(decoded, dict):
        return {}

    return decoded


def _row_to_task(
    row: Any,
) -> dict[str, Any]:
    task = dict(row)
    task["enabled"] = bool(task["enabled"])
    task["repeat_enabled"] = bool(
        task["repeat_enabled"]
    )
    task["payload"] = _decode_payload(
        task.get("payload")
    )
    return task


def claim_due_tasks() -> list[dict[str, Any]]:
    now = _utc_now_iso()
    claimed: list[dict[str, Any]] = []

    with get_connection() as connection:
        connection.execute(
            "BEGIN IMMEDIATE"
        )

        rows = connection.execute(
            """
            SELECT *
            FROM scheduled_tasks
            WHERE enabled = 1
              AND next_run IS NOT NULL
              AND next_run <= ?
              AND NOT EXISTS (
                  SELECT 1
                  FROM scheduled_task_runs AS running_run
                  WHERE running_run.task_id = scheduled_tasks.id
                    AND running_run.result = 'running'
              )
            ORDER BY next_run ASC, id ASC
            """,
            (now,),
        ).fetchall()

        for row in rows:
            task = _row_to_task(row)

            cursor = connection.execute(
                """
                UPDATE scheduled_tasks
                SET
                    next_run = NULL,
                    updated_at = ?
                WHERE id = ?
                  AND enabled = 1
                  AND next_run = ?
                """,
                (
                    now,
                    task["id"],
                    task["next_run"],
                ),
            )

            if cursor.rowcount != 1:
                continue

            run_cursor = connection.execute(
                """
                INSERT INTO scheduled_task_runs (
                    task_id,
                    trigger,
                    scheduled_for,
                    started_at,
                    result
                )
                VALUES (
                    ?,
                    'scheduled',
                    ?,
                    ?,
                    'running'
                )
                """,
                (
                    task["id"],
                    task["next_run"],
                    now,
                ),
            )

            task["_run_id"] = int(
                run_cursor.lastrowid
            )

            claimed.append(task)

        connection.commit()

    return claimed


def _finish_run_success(
    task: dict[str, Any],
    details: dict[str, Any],
) -> None:
    finished_at = _utc_now()

    next_run: str | None = None
    completed_at: str | None = None
    enabled = 1

    if task["repeat_enabled"]:
        interval_value = task.get(
            "interval_value"
        )
        interval_unit = task.get(
            "interval_unit"
        )

        if (
            not isinstance(
                interval_value,
                int,
            )
            or not interval_unit
        ):
            raise SchedulerError(
                "Repeating task has invalid interval configuration."
            )

        previous_run = datetime.fromisoformat(
            task["next_run"]
        )

        calculated = calculate_next_run(
            previous_run=previous_run,
            interval_value=interval_value,
            interval_unit=interval_unit,
        )

        now = _utc_now()

        while calculated <= now:
            calculated = calculate_next_run(
                previous_run=calculated,
                interval_value=interval_value,
                interval_unit=interval_unit,
            )

        next_run = calculated.isoformat()

    else:
        enabled = 0
        completed_at = finished_at.isoformat()

    with get_connection() as connection:
        connection.execute(
            """
            UPDATE scheduled_task_runs
            SET
                finished_at = ?,
                result = 'success',
                details = ?
            WHERE id = ?
            """,
            (
                finished_at.isoformat(),
                json.dumps(
                    details,
                    ensure_ascii=False,
                    separators=(",", ":"),
                ),
                task["_run_id"],
            ),
        )

        connection.execute(
            """
            UPDATE scheduled_tasks
            SET
                enabled = ?,
                next_run = ?,
                last_run = ?,
                last_result = 'success',
                last_error = NULL,
                updated_at = ?,
                completed_at = ?
            WHERE id = ?
            """,
            (
                enabled,
                next_run,
                finished_at.isoformat(),
                finished_at.isoformat(),
                completed_at,
                task["id"],
            ),
        )

        connection.commit()


def _finish_run_failed(
    task: dict[str, Any],
    error: str,
) -> None:
    finished_at = _utc_now()

    next_run: str | None = None
    completed_at: str | None = None
    enabled = 1

    if task["repeat_enabled"]:
        interval_value = task.get(
            "interval_value"
        )
        interval_unit = task.get(
            "interval_unit"
        )

        if (
            isinstance(
                interval_value,
                int,
            )
            and interval_unit
        ):
            previous_run = datetime.fromisoformat(
                task["next_run"]
            )

            calculated = calculate_next_run(
                previous_run=previous_run,
                interval_value=interval_value,
                interval_unit=interval_unit,
            )

            now = _utc_now()

            while calculated <= now:
                calculated = calculate_next_run(
                    previous_run=calculated,
                    interval_value=interval_value,
                    interval_unit=interval_unit,
                )

            next_run = calculated.isoformat()

    else:
        enabled = 0
        completed_at = finished_at.isoformat()

    with get_connection() as connection:
        connection.execute(
            """
            UPDATE scheduled_task_runs
            SET
                finished_at = ?,
                result = 'failed',
                error = ?
            WHERE id = ?
            """,
            (
                finished_at.isoformat(),
                error,
                task["_run_id"],
            ),
        )

        connection.execute(
            """
            UPDATE scheduled_tasks
            SET
                enabled = ?,
                next_run = ?,
                last_run = ?,
                last_result = 'failed',
                last_error = ?,
                updated_at = ?,
                completed_at = ?
            WHERE id = ?
            """,
            (
                enabled,
                next_run,
                finished_at.isoformat(),
                error,
                finished_at.isoformat(),
                completed_at,
                task["id"],
            ),
        )

        connection.commit()


async def _wait_for_managed_task(
    managed_task,
    timeout_seconds: int = 7200,
) -> dict[str, Any]:
    started = asyncio.get_running_loop().time()

    while True:
        if managed_task.state == "success":
            return {
                "managed_task_id":
                    managed_task.id,
                "result":
                    managed_task.result,
            }

        if managed_task.state == "error":
            raise RuntimeError(
                managed_task.error
                or "Managed task failed."
            )

        if (
            asyncio.get_running_loop().time()
            - started
            >= timeout_seconds
        ):
            raise RuntimeError(
                "Managed task timed out."
            )

        await asyncio.sleep(1)


async def _execute_node_action(
    task: dict[str, Any],
    trigger: str = "scheduled",
) -> dict[str, Any]:
    node = task.get("node")
    action = task["action"]

    if not node:
        raise RuntimeError(
            "Scheduled node action has no node."
        )

    if action == "node.check_updates":
        managed = await start_update_check(
            node,
            source="scheduler",
        )

        manager.append(
            managed,
            _execution_message(trigger),
        )

        return await _wait_for_managed_task(
            managed,
            timeout_seconds=1800,
        )

    if action == "node.install_updates":
        managed = await start_update_install(
            node,
            source="scheduler",
        )

        manager.append(
            managed,
            _execution_message(trigger),
        )

        return await _wait_for_managed_task(
            managed,
            timeout_seconds=7200,
        )

    if action == "node.package_cleanup":
        managed = await start_package_cleanup(
            node,
            source="scheduler",
        )

        manager.append(
            managed,
            _execution_message(trigger),
        )

        return await _wait_for_managed_task(
            managed,
            timeout_seconds=3600,
        )

    if action in {
        "node.reboot",
        "node.shutdown",
    }:
        managed = await start_power_action(
            node,
            (
                "reboot"
                if action == "node.reboot"
                else "shutdown"
            ),
            source="scheduler",
        )

        manager.append(
            managed,
            _execution_message(trigger),
        )

        return await _wait_for_managed_task(
            managed,
            timeout_seconds=120,
        )

    if action in {
        "node.maintenance.enable",
        "node.maintenance.disable",
    }:
        maintenance_action = (
            "enable"
            if action.endswith(".enable")
            else "disable"
        )

        activity = manager.create(
            node,
            "scheduled-maintenance",
            (
                f"Scheduled maintenance "
                f"{maintenance_action} on {node}"
            ),
            source="scheduler",
        )

        manager.start(activity)

        try:
            message = await set_maintenance(
                node,
                maintenance_action,
            )

            manager.append(
                activity,
                _execution_message(trigger),
            )

            manager.append(
                activity,
                message,
            )

            manager.finish(
                activity,
                {
                    "message": message,
                },
            )

            return {
                "managed_task_id":
                    activity.id,
                "message": message,
            }

        except Exception as exc:
            manager.fail(
                activity,
                str(exc),
            )
            raise

    raise RuntimeError(
        f"Unsupported scheduled node action: {action}"
    )


async def _execute_guest_action(
    task: dict[str, Any],
    trigger: str = "scheduled",
) -> dict[str, Any]:
    node = task.get("node")
    guest_type = task.get("guest_type")
    vmid = task.get("vmid")
    action = task["action"]
    payload = task["payload"]

    if (
        not node
        or guest_type not in {
            "qemu",
            "lxc",
        }
        or not isinstance(vmid, int)
    ):
        raise RuntimeError(
            "Scheduled guest target is incomplete."
        )

    if action.startswith("guest.") and action != "guest.migrate":
        guest_action = action.split(
            ".",
            1,
        )[1]

        activity = manager.create(
            node,
            "scheduled-guest-action",
            (
                f"Scheduled {guest_action} "
                f"{guest_type.upper()} {vmid}"
            ),
            source="scheduler",
        )

        manager.start(activity)

        try:
            manager.append(
                activity,
                _execution_message(trigger),
            )

            upid = await client.guest_action(
                node,
                guest_type,
                vmid,
                guest_action,
            )

            manager.finish(
                activity,
                {
                    "upid": upid,
                },
            )

            return {
                "managed_task_id":
                    activity.id,
                "upid": upid,
            }

        except Exception as exc:
            manager.fail(
                activity,
                str(exc),
            )
            raise

    if action == "snapshot.create":
        snapshot_name = str(
            payload.get(
                "snapshot_name",
                "",
            )
        ).strip()

        activity = manager.create(
            node,
            "scheduled-snapshot",
            (
                f"Create snapshot "
                f"{snapshot_name} on "
                f"{guest_type.upper()} {vmid}"
            ),
            source="scheduler",
        )

        manager.start(activity)

        try:
            manager.append(
                activity,
                _execution_message(trigger),
            )

            upid = await client.create_snapshot(
                node,
                guest_type,
                vmid,
                snapshot_name,
                str(
                    payload.get(
                        "description",
                        "",
                    )
                ),
                bool(
                    payload.get(
                        "include_ram",
                        False,
                    )
                )
                if guest_type == "qemu"
                else False,
            )

            manager.finish(
                activity,
                {
                    "upid": upid,
                    "snapshot_name":
                        snapshot_name,
                },
            )

            return {
                "managed_task_id":
                    activity.id,
                "upid": upid,
                "snapshot_name":
                    snapshot_name,
            }

        except Exception as exc:
            manager.fail(
                activity,
                str(exc),
            )
            raise

    if action == "snapshot.delete":
        snapshot_name = str(
            payload.get(
                "snapshot_name",
                "",
            )
        ).strip()

        snapshots = await client.list_snapshots(
            node,
            guest_type,
            vmid,
        )

        existing_names = {
            str(
                item.get(
                    "name",
                    item.get(
                        "snapname",
                        "",
                    ),
                )
            )
            for item in snapshots
            if isinstance(item, dict)
        }

        if snapshot_name not in existing_names:
            raise RuntimeError(
                f'Snapshot "{snapshot_name}" no longer exists.'
            )

        activity = manager.create(
            node,
            "scheduled-snapshot",
            (
                f"Delete snapshot "
                f"{snapshot_name} from "
                f"{guest_type.upper()} {vmid}"
            ),
            source="scheduler",
        )

        manager.start(activity)

        try:
            manager.append(
                activity,
                _execution_message(trigger),
            )

            upid = await client.delete_snapshot(
                node,
                guest_type,
                vmid,
                snapshot_name,
            )

            manager.finish(
                activity,
                {
                    "upid": upid,
                    "snapshot_name":
                        snapshot_name,
                },
            )

            return {
                "managed_task_id":
                    activity.id,
                "upid": upid,
                "snapshot_name":
                    snapshot_name,
            }

        except Exception as exc:
            manager.fail(
                activity,
                str(exc),
            )
            raise

    if action == "guest.migrate":
        target_node = str(
            payload.get(
                "target_node",
                "",
            )
        ).strip()

        activity = manager.create(
            node,
            "scheduled-migration",
            (
                f"Migrate "
                f"{guest_type.upper()} {vmid} "
                f"to {target_node}"
            ),
            source="scheduler",
        )

        manager.start(activity)

        try:
            manager.append(
                activity,
                _execution_message(trigger),
            )

            upid = await client.migrate_guest(
                node=node,
                guest_type=guest_type,
                vmid=vmid,
                target=target_node,
                online=bool(
                    payload.get(
                        "online",
                        False,
                    )
                ),
                restart=bool(
                    payload.get(
                        "restart",
                        False,
                    )
                ),
                with_local_disks=bool(
                    payload.get(
                        "with_local_disks",
                        False,
                    )
                ),
                target_storage=(
                    str(
                        payload.get(
                            "target_storage",
                            "",
                        )
                    ).strip()
                    or None
                ),
            )

            manager.finish(
                activity,
                {
                    "upid": upid,
                    "target_node":
                        target_node,
                },
            )

            return {
                "managed_task_id":
                    activity.id,
                "upid": upid,
                "target_node":
                    target_node,
            }

        except Exception as exc:
            manager.fail(
                activity,
                str(exc),
            )
            raise

    if action == "backup.guest":
        job_id = str(
            payload.get(
                "job_id",
                "",
            )
        ).strip()

        dashboard = await client.dashboard()

        job = next(
            (
                item
                for item in dashboard.get(
                    "backup_jobs",
                    [],
                )
                if item.get("id") == job_id
            ),
            None,
        )

        if not job:
            raise RuntimeError(
                f'Backup job "{job_id}" no longer exists.'
            )

        if not job.get("enabled"):
            raise RuntimeError(
                f'Backup job "{job_id}" is disabled.'
            )

        storage = job.get(
            "storage"
        )

        if not storage:
            raise RuntimeError(
                "Backup job has no target storage."
            )

        parameters = {
            "vmid": vmid,
            "storage": storage,
            "mode": job.get(
                "mode",
                "snapshot",
            ),
            "compress": job.get(
                "compress",
                "zstd",
            ),
        }

        optional = {
            "notes-template":
                job.get(
                    "notes-template"
                ),
            "notification-mode":
                job.get(
                    "notification-mode"
                ),
        }

        for key, value in optional.items():
            if value not in (
                None,
                "",
            ):
                parameters[key] = value

        prune = job.get(
            "prune-backups"
        )

        if isinstance(
            prune,
            dict,
        ):
            prune_values = [
                f"{key}={value}"
                for key, value in prune.items()
                if value not in (
                    None,
                    "",
                )
            ]

            if prune_values:
                parameters[
                    "prune-backups"
                ] = ",".join(
                    prune_values
                )

        managed = await start_backup_task(
            client,
            node,
            (
                f"{job_id} · VMID {vmid} "
                f"· {_execution_label(trigger)}"
            ),
            parameters,
            source="scheduler",
        )

        manager.append(
            managed,
            _execution_message(trigger),
        )

        return await _wait_for_managed_task(
            managed,
            timeout_seconds=7200,
        )

    raise RuntimeError(
        f"Unsupported scheduled guest action: {action}"
    )


async def execute_scheduled_task(
    task: dict[str, Any],
) -> None:
    action = task["action"]

    audit_details = {
        "execution": "scheduled",
        "schedule_id": task["id"],
        "schedule_uuid": task["uuid"],
        "schedule_name": task["name"],
        "created_by": task[
            "created_by_username"
        ],
        "created_by_user_id":
            task.get(
                "created_by_user_id"
            ),
        "scheduled_for":
            task["next_run"],
        "requested_action": action,
        "guest_type":
            task.get("guest_type"),
        "vmid":
            task.get("vmid"),
        "payload":
            task.get("payload", {}),
    }

    try:
        if action.startswith("node."):
            result = await _execute_node_action(
                task
            )
        else:
            result = await _execute_guest_action(
                task
            )

        _finish_run_success(
            task,
            result,
        )

        write_audit_event(
            action=action,
            result="success",
            severity="info",
            user_id=None,
            username="System",
            role="scheduler",
            source="scheduler",
            target_type=task.get(
                "target_type"
            ),
            target=task["name"],
            node=task.get("node"),
            details={
                **audit_details,
                "result": result,
            },
        )

    except Exception as exc:
        error = str(exc)

        logger.exception(
            "Scheduled task %s failed: %s",
            task["id"],
            error,
        )

        _finish_run_failed(
            task,
            error,
        )

        write_audit_event(
            action=action,
            result="failed",
            severity="error",
            user_id=None,
            username="System",
            role="scheduler",
            source="scheduler",
            target_type=task.get(
                "target_type"
            ),
            target=task["name"],
            node=task.get("node"),
            details={
                **audit_details,
                "error": error,
            },
        )


async def _execute_manual_scheduled_task(
    task: dict[str, Any],
    *,
    user_id: int | None,
    username: str,
    role: str,
    source: str,
) -> None:
    action = task["action"]

    audit_details = {
        "execution": "manual",
        "trigger": "manual",
        "schedule_id": task["id"],
        "schedule_uuid": task["uuid"],
        "schedule_name": task["name"],
        "created_by": task[
            "created_by_username"
        ],
        "created_by_user_id": task.get(
            "created_by_user_id"
        ),
        "requested_action": action,
        "guest_type": task.get(
            "guest_type"
        ),
        "vmid": task.get(
            "vmid"
        ),
        "payload": task.get(
            "payload",
            {},
        ),
    }

    try:
        if action.startswith("node."):
            result = await _execute_node_action(
                task,
                trigger="manual",
            )
        else:
            result = await _execute_guest_action(
                task,
                trigger="manual",
            )

        finished_at = _utc_now_iso()

        with get_connection() as connection:
            connection.execute(
                """
                UPDATE scheduled_task_runs
                SET
                    finished_at = ?,
                    result = 'success',
                    details = ?
                WHERE id = ?
                """,
                (
                    finished_at,
                    json.dumps(
                        {
                            "managed_execution": result,
                        },
                        ensure_ascii=False,
                        separators=(",", ":"),
                    ),
                    task["_run_id"],
                ),
            )

            connection.commit()

        write_audit_event(
            action="schedule.run_now",
            result="success",
            severity="info",
            user_id=user_id,
            username=username,
            role=role,
            source=source,
            target_type="scheduled_task",
            target=task["name"],
            node=task.get("node"),
            details={
                **audit_details,
                "result": result,
            },
        )

    except Exception as exc:
        error = str(exc)
        finished_at = _utc_now_iso()

        logger.exception(
            "Manual scheduled task %s failed: %s",
            task["id"],
            error,
        )

        with get_connection() as connection:
            connection.execute(
                """
                UPDATE scheduled_task_runs
                SET
                    finished_at = ?,
                    result = 'failed',
                    error = ?
                WHERE id = ?
                """,
                (
                    finished_at,
                    error,
                    task["_run_id"],
                ),
            )

            connection.commit()

        write_audit_event(
            action="schedule.run_now",
            result="failed",
            severity="error",
            user_id=user_id,
            username=username,
            role=role,
            source=source,
            target_type="scheduled_task",
            target=task["name"],
            node=task.get("node"),
            details={
                **audit_details,
                "error": error,
            },
        )


async def start_manual_scheduled_task(
    task_id: int,
    *,
    user_id: int | None,
    username: str,
    role: str,
    source: str,
) -> dict[str, Any]:
    task = get_scheduled_task(
        task_id
    )

    if task is None:
        raise SchedulerError(
            "Scheduled task not found."
        )

    started_at = _utc_now_iso()

    with get_connection() as connection:
        connection.execute(
            "BEGIN IMMEDIATE"
        )

        running = connection.execute(
            """
            SELECT id
            FROM scheduled_task_runs
            WHERE task_id = ?
              AND result = 'running'
            LIMIT 1
            """,
            (task_id,),
        ).fetchone()

        if running is not None:
            connection.rollback()

            raise SchedulerError(
                "This scheduled task is already running."
            )

        cursor = connection.execute(
            """
            INSERT INTO scheduled_task_runs (
                task_id,
                trigger,
                scheduled_for,
                started_at,
                result,
                executed_by_user_id,
                executed_by_username
            )
            VALUES (
                ?,
                'manual',
                NULL,
                ?,
                'running',
                ?,
                ?
            )
            """,
            (
                task_id,
                started_at,
                user_id,
                username,
            ),
        )

        run_id = int(
            cursor.lastrowid
        )

        connection.commit()

    task["_run_id"] = run_id

    asyncio.create_task(
        _execute_manual_scheduled_task(
            task,
            user_id=user_id,
            username=username,
            role=role,
            source=source,
        )
    )

    return {
        "ok": True,
        "task_id": task_id,
        "run_id": run_id,
        "trigger": "manual",
        "started_at": started_at,
    }


async def scheduler_loop() -> None:
    global _scheduler_stop_event

    logger.info(
        "Task Scheduler worker started."
    )

    while (
        _scheduler_stop_event is not None
        and not _scheduler_stop_event.is_set()
    ):
        try:
            due_tasks = claim_due_tasks()

            for task in due_tasks:
                asyncio.create_task(
                    execute_scheduled_task(
                        task
                    )
                )

        except Exception:
            logger.exception(
                "Task Scheduler polling failed."
            )

        try:
            await asyncio.wait_for(
                _scheduler_stop_event.wait(),
                timeout=POLL_INTERVAL_SECONDS,
            )
        except asyncio.TimeoutError:
            pass

    logger.info(
        "Task Scheduler worker stopped."
    )


async def start_scheduler_worker() -> None:
    global _scheduler_task
    global _scheduler_stop_event

    if (
        _scheduler_task is not None
        and not _scheduler_task.done()
    ):
        return

    _scheduler_stop_event = asyncio.Event()

    _scheduler_task = asyncio.create_task(
        scheduler_loop()
    )


async def stop_scheduler_worker() -> None:
    global _scheduler_task
    global _scheduler_stop_event

    if _scheduler_stop_event is not None:
        _scheduler_stop_event.set()

    if _scheduler_task is not None:
        try:
            await _scheduler_task
        except asyncio.CancelledError:
            pass

    _scheduler_task = None
    _scheduler_stop_event = None
