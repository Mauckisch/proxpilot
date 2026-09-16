import asyncio
from pathlib import Path

import paramiko

from .infrastructures import get_infrastructure


class HaControlError(RuntimeError):
    pass


def _run(
    infrastructure_id: int,
    action: str,
    resource_mode: str | None = None,
):
    if action not in {"arm", "disarm"}:
        raise HaControlError("Invalid HA action.")

    if action == "disarm" and resource_mode not in {
        "freeze",
        "ignore",
    }:
        raise HaControlError(
            "Disarming HA requires resource mode "
            "'freeze' or 'ignore'."
        )

    if infrastructure_id <= 0:
        raise HaControlError(
            "A valid infrastructure ID is required."
        )

    infrastructure = get_infrastructure(
        infrastructure_id
    )

    if infrastructure is None:
        raise HaControlError(
            f"Infrastructure {infrastructure_id} not found."
        )

    if not infrastructure["enabled"]:
        raise HaControlError(
            f"Infrastructure {infrastructure_id} is disabled."
        )

    if infrastructure["type"] != "cluster":
        raise HaControlError(
            "HA arm/disarm is only available for "
            "clustered infrastructures."
        )

    node_entry = next(
        (
            item
            for item in infrastructure["nodes"]
            if item.get("enabled")
            and item.get("host")
        ),
        None,
    )

    if node_entry is None:
        raise HaControlError(
            "No enabled cluster node with an SSH "
            "address is configured."
        )

    node = node_entry.get("node_name") or "cluster"
    host = node_entry["host"]
    ssh_user = infrastructure["ssh_user"]
    ssh_key = infrastructure["ssh_key"]
    ssh_port = infrastructure["ssh_port"]

    key = Path(ssh_key)

    if not key.is_file():
        raise HaControlError(
            f"SSH key is missing: {ssh_key}"
        )

    if action == "arm":
        command = "ha-manager crm-command arm-ha"
    else:
        command = (
            "ha-manager crm-command disarm-ha "
            f"{resource_mode}"
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

        _, stdout, stderr = client.exec_command(
            command,
            timeout=30,
        )

        code = stdout.channel.recv_exit_status()
        output = stdout.read().decode().strip()
        error = stderr.read().decode().strip()

        if code:
            raise HaControlError(
                error
                or output
                or f"Exit code {code}"
            )

        if output:
            return output, node

        if action == "arm":
            return "HA arm requested.", node

        return (
            f"HA disarm requested "
            f"(resource mode: {resource_mode}).",
            node,
        )

    finally:
        client.close()


async def set_ha_state(
    infrastructure_id: int,
    action: str,
    resource_mode: str | None = None,
):
    return await asyncio.to_thread(
        _run,
        infrastructure_id,
        action,
        resource_mode,
    )
