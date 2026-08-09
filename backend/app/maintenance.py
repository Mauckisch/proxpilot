import asyncio
from pathlib import Path

import paramiko

from .infrastructures import get_infrastructure


class MaintenanceError(RuntimeError):
    pass


def _run(
    node: str,
    action: str,
    infrastructure_id: int,
):
    if action not in {
        "enable",
        "disable",
    }:
        raise MaintenanceError(
            "Ungültige Aktion"
        )

    if infrastructure_id <= 0:
        raise MaintenanceError(
            "A valid infrastructure ID is required."
        )

    infrastructure = get_infrastructure(
        infrastructure_id
    )

    if infrastructure is None:
        raise MaintenanceError(
            f"Infrastructure {infrastructure_id} not found."
        )

    if not infrastructure["enabled"]:
        raise MaintenanceError(
            f"Infrastructure {infrastructure_id} is disabled."
        )

    if infrastructure["type"] != "cluster":
        raise MaintenanceError(
            "HA maintenance mode is only available "
            "for clustered infrastructures."
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
        raise MaintenanceError(
            f"Node '{node}' is not configured in "
            f"infrastructure {infrastructure_id}."
        )

    host = node_entry.get("host")
    ssh_user = infrastructure["ssh_user"]
    ssh_key = infrastructure["ssh_key"]
    ssh_port = infrastructure["ssh_port"]

    if not host:
        raise MaintenanceError(
            f"Keine SSH-Adresse für {node}"
        )

    key = Path(ssh_key)

    if not key.is_file():
        raise MaintenanceError(
            f"SSH-Key fehlt: {ssh_key}"
        )

    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(
        paramiko.AutoAddPolicy()
    )

    try:
        client.connect(
            host,
            port=ssh_port,
            username=ssh_user,
            key_filename=str(key),
            look_for_keys=False,
            allow_agent=False,
            timeout=10,
        )

        _, stdout, stderr = (
            client.exec_command(
                (
                    "ha-manager crm-command "
                    f"node-maintenance {action} {node}"
                ),
                timeout=30,
            )
        )

        code = (
            stdout.channel.recv_exit_status()
        )

        output = (
            stdout.read()
            .decode()
            .strip()
        )

        error = (
            stderr.read()
            .decode()
            .strip()
        )

        if code:
            raise MaintenanceError(
                error
                or output
                or f"Exit-Code {code}"
            )

        return (
            output
            or (
                f"Maintenance {action} "
                f"für {node} angefordert"
            )
        )

    finally:
        client.close()


async def set_maintenance(
    node: str,
    action: str,
    infrastructure_id: int,
):
    return await asyncio.to_thread(
        _run,
        node,
        action,
        infrastructure_id,
    )
