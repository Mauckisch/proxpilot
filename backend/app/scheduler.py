from __future__ import annotations

import calendar
import json
import uuid
from datetime import UTC, datetime, timedelta
from typing import Any, Literal
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from .database import get_connection


IntervalUnit = Literal[
    "minutes",
    "hours",
    "days",
    "weeks",
    "months",
]


class SchedulerError(RuntimeError):
    pass


def get_scheduled_task_target(
    task: dict[str, Any],
) -> str:
    target_type = str(
        task.get("target_type") or ""
    ).strip()

    node = str(
        task.get("node") or ""
    ).strip()

    if target_type == "guest":
        guest_type = str(
            task.get("guest_type") or ""
        ).strip().upper()

        vmid = task.get("vmid")

        guest_label = "Guest"

        if guest_type and vmid is not None:
            guest_label = (
                f"{guest_type} {vmid}"
            )
        elif vmid is not None:
            guest_label = (
                f"Guest {vmid}"
            )

        if node:
            return (
                f"{guest_label} · {node}"
            )

        return guest_label

    if target_type == "node":
        return node or "Unknown node"

    return node or target_type or "Unknown"


ALLOWED_SCHEDULED_ACTIONS = {
    "guest.start",
    "guest.shutdown",
    "guest.stop",
    "guest.reboot",
    "guest.suspend",
    "guest.resume",
    "backup.guest",
    "backup.guest_restore",
    "snapshot.create",
    "snapshot.delete",
    "snapshot.rollback",
    "guest.migrate",
    "node.check_updates",
    "node.install_updates",
    "node.package_cleanup",
    "node.reboot",
    "node.shutdown",
    "node.maintenance.enable",
    "node.maintenance.disable",
}


def _validate_scheduled_action(
    *,
    action: str,
    target_type: str,
    node: str | None,
    guest_type: str | None,
    vmid: int | None,
    payload: dict[str, Any] | None,
) -> None:
    if action not in ALLOWED_SCHEDULED_ACTIONS:
        raise SchedulerError(
            "This action is not allowed in the Task Scheduler."
        )

    values = payload or {}

    guest_actions = {
        "guest.start",
        "guest.shutdown",
        "guest.stop",
        "guest.reboot",
        "guest.suspend",
        "guest.resume",
        "backup.guest",
        "backup.guest_restore",
        "snapshot.create",
        "snapshot.delete",
        "snapshot.rollback",
        "guest.migrate",
    }

    node_actions = {
        "node.check_updates",
        "node.install_updates",
        "node.package_cleanup",
        "node.reboot",
        "node.shutdown",
        "node.maintenance.enable",
        "node.maintenance.disable",
    }

    if action in guest_actions:
        if target_type != "guest":
            raise SchedulerError(
                "Guest actions require target_type 'guest'."
            )

        if guest_type not in {
            "qemu",
            "lxc",
        }:
            raise SchedulerError(
                "Guest actions require a valid guest type."
            )

        if vmid is None or vmid <= 0:
            raise SchedulerError(
                "Guest actions require a valid VMID."
            )

    if action in node_actions:
        if target_type != "node":
            raise SchedulerError(
                "Node actions require target_type 'node'."
            )

        configured_nodes_raw = (
            values.get("nodes", [])
        )

        if (
            configured_nodes_raw is not None
            and not isinstance(
                configured_nodes_raw,
                list,
            )
        ):
            raise SchedulerError(
                "Node action payload field 'nodes' "
                "must be a list."
            )

        configured_nodes = list(
            dict.fromkeys(
                str(value).strip()
                for value in (
                    configured_nodes_raw
                    if isinstance(
                        configured_nodes_raw,
                        list,
                    )
                    else []
                )
                if str(value).strip()
            )
        )

        clean_node = (
            node.strip()
            if node
            else None
        )

        multi_node_actions = {
            "node.check_updates",
            "node.install_updates",
            "node.package_cleanup",
        }

        single_node_actions = {
            "node.reboot",
            "node.shutdown",
            "node.maintenance.enable",
            "node.maintenance.disable",
        }

        if action in multi_node_actions:
            effective_nodes = (
                configured_nodes
                if configured_nodes
                else (
                    [clean_node]
                    if clean_node
                    else []
                )
            )

            if not effective_nodes:
                raise SchedulerError(
                    "Node action requires at least one node."
                )

        if action in single_node_actions:
            effective_nodes = list(
                dict.fromkeys(
                    [
                        *configured_nodes,
                        *(
                            [clean_node]
                            if clean_node
                            else []
                        ),
                    ]
                )
            )

            if len(effective_nodes) != 1:
                raise SchedulerError(
                    (
                        "This node action requires exactly "
                        "one node. Multiple-node execution "
                        "is allowed only for update checks, "
                        "update installation and package cleanup."
                    )
                )

    if action in {
        "snapshot.create",
        "snapshot.delete",
        "snapshot.rollback",
    }:
        snapshot_name = str(
            values.get("snapshot_name", "")
        ).strip()

        if not snapshot_name:
            operation_label = {
                "snapshot.create":
                    "Snapshot creation",
                "snapshot.delete":
                    "Snapshot deletion",
                "snapshot.rollback":
                    "Snapshot rollback",
            }[action]

            raise SchedulerError(
                operation_label
                + " requires a snapshot_name."
            )

    if action == "backup.guest":
        job_id = str(
            values.get("job_id", "")
        ).strip()

        if not job_id:
            raise SchedulerError(
                "Guest backup requires a job_id."
            )

    if action == "backup.guest_restore":
        archive = str(
            values.get(
                "archive",
                "",
            )
            or ""
        ).strip()

        if not archive:
            raise SchedulerError(
                "Guest restore requires an archive."
            )

        target_storage = values.get(
            "target_storage"
        )

        if (
            target_storage is not None
            and not isinstance(
                target_storage,
                str,
            )
        ):
            raise SchedulerError(
                "Guest restore target_storage "
                "must be a string or null."
            )

        start_after_restore = values.get(
            "start_after_restore",
            False,
        )

        if not isinstance(
            start_after_restore,
            bool,
        ):
            raise SchedulerError(
                "Guest restore start_after_restore "
                "must be a boolean."
            )

    if action == "guest.migrate":
        target_node = str(
            values.get("target_node", "")
        ).strip()

        if not target_node:
            raise SchedulerError(
                "Guest migration requires a target_node."
            )


def _utc_now() -> datetime:
    return datetime.now(UTC)


def _utc_now_iso() -> str:
    return _utc_now().isoformat()


def _parse_datetime(
    value: str,
    timezone_name: str,
) -> datetime:
    try:
        parsed = datetime.fromisoformat(
            value.replace("Z", "+00:00")
        )
    except ValueError as exc:
        raise SchedulerError(
            "Invalid start date/time."
        ) from exc

    try:
        timezone = ZoneInfo(
            timezone_name
        )
    except ZoneInfoNotFoundError as exc:
        raise SchedulerError(
            f"Unknown timezone: {timezone_name}"
        ) from exc

    if parsed.tzinfo is None:
        parsed = parsed.replace(
            tzinfo=timezone
        )

    return parsed.astimezone(UTC)


def _add_months(
    value: datetime,
    months: int,
) -> datetime:
    if months <= 0:
        raise SchedulerError(
            "Month interval must be greater than zero."
        )

    month_index = (
        value.year * 12
        + value.month
        - 1
        + months
    )

    year = month_index // 12
    month = month_index % 12 + 1

    day = min(
        value.day,
        calendar.monthrange(
            year,
            month,
        )[1],
    )

    return value.replace(
        year=year,
        month=month,
        day=day,
    )


def calculate_next_run(
    *,
    previous_run: datetime,
    interval_value: int,
    interval_unit: IntervalUnit,
) -> datetime:
    if interval_value <= 0:
        raise SchedulerError(
            "Interval must be greater than zero."
        )

    if interval_unit == "minutes":
        return previous_run + timedelta(
            minutes=interval_value
        )

    if interval_unit == "hours":
        return previous_run + timedelta(
            hours=interval_value
        )

    if interval_unit == "days":
        return previous_run + timedelta(
            days=interval_value
        )

    if interval_unit == "weeks":
        return previous_run + timedelta(
            weeks=interval_value
        )

    if interval_unit == "months":
        return _add_months(
            previous_run,
            interval_value,
        )

    raise SchedulerError(
        "Unsupported interval unit."
    )


def _validate_repeat_settings(
    *,
    repeat_enabled: bool,
    interval_value: int | None,
    interval_unit: str | None,
) -> tuple[int | None, IntervalUnit | None]:
    if not repeat_enabled:
        return None, None

    if (
        interval_value is None
        or interval_value <= 0
    ):
        raise SchedulerError(
            "A repeating task requires a positive interval."
        )

    allowed_units = {
        "minutes",
        "hours",
        "days",
        "weeks",
        "months",
    }

    if interval_unit not in allowed_units:
        raise SchedulerError(
            "A repeating task requires a valid interval unit."
        )

    return (
        interval_value,
        interval_unit,  # type: ignore[return-value]
    )


def _decode_json(
    value: str | None,
) -> dict[str, Any]:
    if not value:
        return {}

    try:
        decoded = json.loads(value)
    except json.JSONDecodeError:
        return {}

    return (
        decoded
        if isinstance(decoded, dict)
        else {}
    )


def _row_to_task(
    row: Any,
) -> dict[str, Any]:
    data = dict(row)

    data["enabled"] = bool(
        data.get("enabled")
    )

    data["repeat_enabled"] = bool(
        data.get("repeat_enabled")
    )

    data["payload"] = _decode_json(
        data.get("payload")
    )

    return data


def _validate_infrastructure_id(
    infrastructure_id: int,
) -> None:
    if infrastructure_id <= 0:
        raise SchedulerError(
            "Invalid infrastructure ID."
        )

    with get_connection() as connection:
        row = connection.execute(
            """
            SELECT id
            FROM infrastructures
            WHERE id = ?
              AND enabled = 1
            """,
            (infrastructure_id,),
        ).fetchone()

    if row is None:
        raise SchedulerError(
            "Infrastructure not found or disabled."
        )



def create_scheduled_task(
    *,
    infrastructure_id: int,
    name: str,
    description: str | None,
    action: str,
    target_type: str,
    node: str | None,
    guest_type: str | None,
    vmid: int | None,
    payload: dict[str, Any] | None,
    repeat_enabled: bool,
    interval_value: int | None,
    interval_unit: str | None,
    timezone_name: str,
    start_at: str,
    created_by_user_id: int | None,
    created_by_username: str,
    enabled: bool = True,
) -> dict[str, Any]:
    _validate_infrastructure_id(
        infrastructure_id
    )

    clean_name = name.strip()

    if not clean_name:
        raise SchedulerError(
            "Task name must not be empty."
        )

    clean_action = action.strip()

    if not clean_action:
        raise SchedulerError(
            "Task action must not be empty."
        )

    clean_target_type = (
        target_type.strip()
    )

    if not clean_target_type:
        raise SchedulerError(
            "Target type must not be empty."
        )

    if guest_type not in {
        None,
        "qemu",
        "lxc",
    }:
        raise SchedulerError(
            "Invalid guest type."
        )

    if (
        vmid is not None
        and vmid <= 0
    ):
        raise SchedulerError(
            "Invalid VMID."
        )

    _validate_scheduled_action(
        action=clean_action,
        target_type=clean_target_type,
        node=node,
        guest_type=guest_type,
        vmid=vmid,
        payload=payload,
    )

    (
        normalized_interval_value,
        normalized_interval_unit,
    ) = _validate_repeat_settings(
        repeat_enabled=repeat_enabled,
        interval_value=interval_value,
        interval_unit=interval_unit,
    )

    start_utc = _parse_datetime(
        start_at,
        timezone_name,
    )

    now = _utc_now_iso()
    task_uuid = str(uuid.uuid4())

    payload_text = json.dumps(
        payload or {},
        ensure_ascii=False,
        separators=(",", ":"),
    )

    with get_connection() as connection:
        cursor = connection.execute(
            """
            INSERT INTO scheduled_tasks (
                uuid,
                infrastructure_id,
                name,
                description,
                enabled,
                action,
                target_type,
                node,
                guest_type,
                vmid,
                payload,
                repeat_enabled,
                interval_value,
                interval_unit,
                timezone,
                start_at,
                next_run,
                created_by_user_id,
                created_by_username,
                created_at,
                updated_at
            )
            VALUES (
                ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
                ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
                ?
            )
            """,
            (
                task_uuid,
                infrastructure_id,
                clean_name,
                (
                    description.strip()
                    if description
                    else None
                ),
                int(enabled),
                clean_action,
                clean_target_type,
                node.strip()
                if node
                else None,
                guest_type,
                vmid,
                payload_text,
                int(repeat_enabled),
                normalized_interval_value,
                normalized_interval_unit,
                timezone_name,
                start_utc.isoformat(),
                start_utc.isoformat(),
                created_by_user_id,
                created_by_username,
                now,
                now,
            ),
        )

        connection.commit()

        task_id = int(
            cursor.lastrowid
        )

    task = get_scheduled_task(
        task_id
    )

    if task is None:
        raise SchedulerError(
            "Task was created but could not be loaded."
        )

    return task


def get_scheduled_task(
    task_id: int,
) -> dict[str, Any] | None:
    with get_connection() as connection:
        row = connection.execute(
            """
            SELECT *
            FROM scheduled_tasks
            WHERE id = ?
            """,
            (task_id,),
        ).fetchone()

    if row is None:
        return None

    return _row_to_task(row)


def list_scheduled_tasks() -> list[dict[str, Any]]:
    with get_connection() as connection:
        rows = connection.execute(
            """
            SELECT *
            FROM scheduled_tasks
            ORDER BY
                CASE
                    WHEN next_run IS NULL
                    THEN 1
                    ELSE 0
                END,
                next_run ASC,
                id ASC
            """
        ).fetchall()

    return [
        _row_to_task(row)
        for row in rows
    ]


def update_scheduled_task(
    task_id: int,
    *,
    infrastructure_id: int,
    name: str,
    description: str | None,
    action: str,
    target_type: str,
    node: str | None,
    guest_type: str | None,
    vmid: int | None,
    payload: dict[str, Any] | None,
    repeat_enabled: bool,
    interval_value: int | None,
    interval_unit: str | None,
    timezone_name: str,
    start_at: str,
    enabled: bool,
) -> dict[str, Any]:
    existing = get_scheduled_task(
        task_id
    )

    if existing is None:
        raise SchedulerError(
            "Scheduled task not found."
        )

    _validate_infrastructure_id(
        infrastructure_id
    )

    clean_name = name.strip()

    if not clean_name:
        raise SchedulerError(
            "Task name must not be empty."
        )

    if not action.strip():
        raise SchedulerError(
            "Task action must not be empty."
        )

    if not target_type.strip():
        raise SchedulerError(
            "Target type must not be empty."
        )

    if guest_type not in {
        None,
        "qemu",
        "lxc",
    }:
        raise SchedulerError(
            "Invalid guest type."
        )

    if (
        vmid is not None
        and vmid <= 0
    ):
        raise SchedulerError(
            "Invalid VMID."
        )

    _validate_scheduled_action(
        action=action.strip(),
        target_type=target_type.strip(),
        node=node,
        guest_type=guest_type,
        vmid=vmid,
        payload=payload,
    )

    (
        normalized_interval_value,
        normalized_interval_unit,
    ) = _validate_repeat_settings(
        repeat_enabled=repeat_enabled,
        interval_value=interval_value,
        interval_unit=interval_unit,
    )

    start_utc = _parse_datetime(
        start_at,
        timezone_name,
    )

    payload_text = json.dumps(
        payload or {},
        ensure_ascii=False,
        separators=(",", ":"),
    )

    with get_connection() as connection:
        connection.execute(
            """
            UPDATE scheduled_tasks
            SET
                infrastructure_id = ?,
                name = ?,
                description = ?,
                enabled = ?,
                action = ?,
                target_type = ?,
                node = ?,
                guest_type = ?,
                vmid = ?,
                payload = ?,
                repeat_enabled = ?,
                interval_value = ?,
                interval_unit = ?,
                timezone = ?,
                start_at = ?,
                next_run = ?,
                updated_at = ?,
                completed_at = NULL
            WHERE id = ?
            """,
            (
                infrastructure_id,
                clean_name,
                (
                    description.strip()
                    if description
                    else None
                ),
                int(enabled),
                action.strip(),
                target_type.strip(),
                node.strip()
                if node
                else None,
                guest_type,
                vmid,
                payload_text,
                int(repeat_enabled),
                normalized_interval_value,
                normalized_interval_unit,
                timezone_name,
                start_utc.isoformat(),
                start_utc.isoformat(),
                _utc_now_iso(),
                task_id,
            ),
        )

        connection.commit()

    updated = get_scheduled_task(
        task_id
    )

    if updated is None:
        raise SchedulerError(
            "Updated task could not be loaded."
        )

    return updated


def set_scheduled_task_enabled(
    task_id: int,
    enabled: bool,
) -> dict[str, Any]:
    existing = get_scheduled_task(
        task_id
    )

    if existing is None:
        raise SchedulerError(
            "Scheduled task not found."
        )

    with get_connection() as connection:
        connection.execute(
            """
            UPDATE scheduled_tasks
            SET
                enabled = ?,
                updated_at = ?
            WHERE id = ?
            """,
            (
                int(enabled),
                _utc_now_iso(),
                task_id,
            ),
        )

        connection.commit()

    updated = get_scheduled_task(
        task_id
    )

    if updated is None:
        raise SchedulerError(
            "Updated task could not be loaded."
        )

    return updated


def delete_scheduled_task(
    task_id: int,
) -> dict[str, Any]:
    existing = get_scheduled_task(
        task_id
    )

    if existing is None:
        raise SchedulerError(
            "Scheduled task not found."
        )

    with get_connection() as connection:
        connection.execute(
            """
            DELETE FROM scheduled_tasks
            WHERE id = ?
            """,
            (task_id,),
        )

        connection.commit()

    return existing
