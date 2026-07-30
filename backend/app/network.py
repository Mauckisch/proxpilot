from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import paramiko

from .config import get_settings


class NetworkError(RuntimeError):
    pass


def _ssh_client(node: str) -> paramiko.SSHClient:
    settings = get_settings()
    host = settings.node_hosts.get(node)

    if not host:
        raise NetworkError(
            f"Keine SSH-Adresse für Node '{node}' konfiguriert."
        )

    key = Path(settings.pve_ssh_key)

    if not key.is_file():
        raise NetworkError(
            f"SSH-Key nicht gefunden: {key}"
        )

    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(
        paramiko.AutoAddPolicy()
    )

    try:
        client.connect(
            hostname=host,
            port=settings.pve_ssh_port,
            username=settings.pve_ssh_user,
            key_filename=str(key),
            look_for_keys=False,
            allow_agent=False,
            timeout=10,
        )
    except Exception as exc:
        raise NetworkError(
            f"SSH-Verbindung zu {node} fehlgeschlagen: {exc}"
        ) from exc

    return client


def _run_command(
    client: paramiko.SSHClient,
    command: str,
    *,
    required: bool = True,
) -> str:
    try:
        _, stdout, stderr = client.exec_command(
            command,
            timeout=30,
        )

        output = stdout.read().decode(
            "utf-8",
            errors="replace",
        )

        error = stderr.read().decode(
            "utf-8",
            errors="replace",
        ).strip()

        exit_code = stdout.channel.recv_exit_status()

    except Exception as exc:
        if required:
            raise NetworkError(
                f"Netzwerkkommando fehlgeschlagen: {exc}"
            ) from exc

        return ""

    if exit_code != 0:
        if required:
            raise NetworkError(
                error
                or (
                    "Netzwerkkommando wurde mit "
                    f"Exit-Code {exit_code} beendet."
                )
            )

        return ""

    return output.strip()


def _run_json(
    client: paramiko.SSHClient,
    command: str,
    *,
    required: bool = True,
) -> list[dict[str, Any]]:
    output = _run_command(
        client,
        command,
        required=required,
    )

    if not output:
        return []

    try:
        data = json.loads(output)
    except json.JSONDecodeError as exc:
        if required:
            raise NetworkError(
                f"Ungültige JSON-Ausgabe von '{command}'."
            ) from exc

        return []

    if not isinstance(data, list):
        if required:
            raise NetworkError(
                f"Unerwartete Ausgabe von '{command}'."
            )

        return []

    return data


def _compress_vlans(
    vlans: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    vlan_ids = sorted(
        {
            int(item["vlan"])
            for item in vlans
            if item.get("vlan") is not None
        }
    )

    if not vlan_ids:
        return []

    ranges: list[dict[str, Any]] = []
    start = vlan_ids[0]
    end = vlan_ids[0]

    for vlan_id in vlan_ids[1:]:
        if vlan_id == end + 1:
            end = vlan_id
            continue

        ranges.append(
            {
                "start": start,
                "end": end,
                "label": (
                    str(start)
                    if start == end
                    else f"{start}-{end}"
                ),
            }
        )

        start = vlan_id
        end = vlan_id

    ranges.append(
        {
            "start": start,
            "end": end,
            "label": (
                str(start)
                if start == end
                else f"{start}-{end}"
            ),
        }
    )

    return ranges


def _interface_type(
    interface: dict[str, Any],
) -> str:
    ifname = str(interface.get("ifname", ""))

    linkinfo = interface.get("linkinfo") or {}
    kind = str(linkinfo.get("info_kind", "")).lower()

    if kind == "bridge":
        return "bridge"

    if kind == "vlan":
        return "vlan"

    if kind == "bond":
        return "bond"

    if kind:
        return kind

    if ifname == "lo":
        return "loopback"

    if interface.get("link_type") == "ether":
        if ifname.startswith(
            (
                "tap",
                "veth",
                "fwbr",
                "fwln",
                "fwpr",
            )
        ):
            return "virtual"

        return "physical"

    return str(
        interface.get("link_type") or "unknown"
    )


def _read_speed(
    client: paramiko.SSHClient,
    interface_name: str,
) -> int | None:
    safe_name = interface_name.replace("'", "")

    output = _run_command(
        client,
        (
            "cat "
            f"'/sys/class/net/{safe_name}/speed' "
            "2>/dev/null || true"
        ),
        required=False,
    ).strip()

    try:
        speed = int(output)
    except (TypeError, ValueError):
        return None

    if speed <= 0 or speed >= 2_147_483_647:
        return None

    return speed


def collect_node_network(
    node: str,
) -> dict[str, Any]:
    client = _ssh_client(node)

    try:
        links = _run_json(
            client,
            "ip -j -d -s link show",
        )

        addresses = _run_json(
            client,
            "ip -j address show",
        )

        routes = _run_json(
            client,
            "ip -j route show table all",
        )

        bridge_links = _run_json(
            client,
            "bridge -j link show",
            required=False,
        )

        bridge_vlans = _run_json(
            client,
            "bridge -j vlan show",
            required=False,
        )

        hostname = _run_command(
            client,
            "hostname",
            required=False,
        )

        dns_servers_output = _run_command(
            client,
            (
                "awk '/^nameserver[[:space:]]+/ "
                "{print $2}' /etc/resolv.conf "
                "2>/dev/null"
            ),
            required=False,
        )

        dns_servers = [
            line.strip()
            for line in dns_servers_output.splitlines()
            if line.strip()
        ]

        address_map = {
            str(item.get("ifname")): item.get(
                "addr_info",
                [],
            )
            for item in addresses
            if item.get("ifname")
        }

        ifindex_map = {
            item.get("ifindex"): item.get("ifname")
            for item in links
            if item.get("ifindex") is not None
        }

        bridge_link_map = {
            str(item.get("ifname")): item
            for item in bridge_links
            if item.get("ifname")
        }

        vlan_map = {
            str(item.get("ifname")): item.get(
                "vlans",
                [],
            )
            for item in bridge_vlans
            if item.get("ifname")
        }

        interfaces: list[dict[str, Any]] = []

        for link in links:
            ifname = str(link.get("ifname", ""))

            if not ifname:
                continue

            linkinfo = link.get("linkinfo") or {}
            info_data = linkinfo.get("info_data") or {}

            master = link.get("master")

            if isinstance(master, int):
                master = ifindex_map.get(master)

            bridge_data = bridge_link_map.get(
                ifname,
                {},
            )

            if not master:
                master = bridge_data.get("master")

            stats = (
                link.get("stats64")
                or link.get("stats")
                or {}
            )

            rx = stats.get("rx") or {}
            tx = stats.get("tx") or {}

            interface_addresses = []

            for address in address_map.get(ifname, []):
                interface_addresses.append(
                    {
                        "family": address.get("family"),
                        "address": address.get("local"),
                        "prefix_length": address.get(
                            "prefixlen"
                        ),
                        "scope": address.get("scope"),
                        "broadcast": address.get(
                            "broadcast"
                        ),
                        "dynamic": bool(
                            address.get("dynamic", False)
                        ),
                    }
                )

            interface_type = _interface_type(link)

            vlan_id = None
            vlan_parent = None

            if interface_type == "vlan":
                vlan_id = info_data.get("id")
                vlan_parent = link.get("link")

                if isinstance(vlan_parent, int):
                    vlan_parent = ifindex_map.get(
                        vlan_parent
                    )

            interfaces.append(
                {
                    "name": ifname,
                    "ifindex": link.get("ifindex"),
                    "type": interface_type,
                    "state": str(
                        link.get(
                            "operstate",
                            "UNKNOWN",
                        )
                    ).lower(),
                    "flags": link.get("flags", []),
                    "mac_address": link.get("address"),
                    "broadcast_address": link.get(
                        "broadcast"
                    ),
                    "mtu": link.get("mtu"),
                    "qdisc": link.get("qdisc"),
                    "master": master,
                    "link": link.get("link"),
                    "speed_mbps": _read_speed(
                        client,
                        ifname,
                    ),
                    "vlan_id": vlan_id,
                    "vlan_parent": vlan_parent,
                    "bridge_vlan_filtering": (
                        info_data.get(
                            "vlan_filtering"
                        )
                        if interface_type == "bridge"
                        else None
                    ),
                    "addresses": interface_addresses,
                    "bridge_vlans": _compress_vlans(
                        vlan_map.get(
                            ifname,
                            [],
                        )
                    ),
                    "statistics": {
                        "rx_bytes": rx.get("bytes", 0),
                        "rx_packets": rx.get(
                            "packets",
                            0,
                        ),
                        "rx_errors": rx.get(
                            "errors",
                            0,
                        ),
                        "rx_dropped": rx.get(
                            "dropped",
                            0,
                        ),
                        "tx_bytes": tx.get("bytes", 0),
                        "tx_packets": tx.get(
                            "packets",
                            0,
                        ),
                        "tx_errors": tx.get(
                            "errors",
                            0,
                        ),
                        "tx_dropped": tx.get(
                            "dropped",
                            0,
                        ),
                    },
                }
            )

        default_routes = [
            route
            for route in routes
            if route.get("dst") == "default"
        ]

        return {
            "node": node,
            "hostname": hostname or node,
            "interfaces": interfaces,
            "routes": routes,
            "default_routes": default_routes,
            "dns_servers": dns_servers,
            "summary": {
                "interface_count": len(interfaces),
                "physical_count": sum(
                    item["type"] == "physical"
                    for item in interfaces
                ),
                "bridge_count": sum(
                    item["type"] == "bridge"
                    for item in interfaces
                ),
                "vlan_count": sum(
                    item["type"] == "vlan"
                    for item in interfaces
                ),
                "bond_count": sum(
                    item["type"] == "bond"
                    for item in interfaces
                ),
                "up_count": sum(
                    item["state"] == "up"
                    for item in interfaces
                ),
                "down_count": sum(
                    item["state"] == "down"
                    for item in interfaces
                ),
            },
        }

    finally:
        client.close()


def collect_cluster_network() -> dict[str, Any]:
    settings = get_settings()

    nodes = []
    errors = []

    for node in settings.node_hosts:
        try:
            nodes.append(
                collect_node_network(node)
            )
        except Exception as exc:
            errors.append(
                {
                    "node": node,
                    "error": str(exc),
                }
            )

    return {
        "nodes": nodes,
        "errors": errors,
        "summary": {
            "configured_nodes": len(
                settings.node_hosts
            ),
            "successful_nodes": len(nodes),
            "failed_nodes": len(errors),
        },
    }
