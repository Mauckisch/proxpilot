from __future__ import annotations

import json
import uuid
from datetime import UTC, datetime
from typing import Any
from urllib.parse import urlparse

import httpx

from .config import get_settings
from .database import get_connection


class InfrastructureError(RuntimeError):
    pass


def _utc_now_iso() -> str:
    return datetime.now(UTC).isoformat()


def _normalize_endpoint(value: str) -> str:
    endpoint = value.strip().rstrip("/")

    if not endpoint:
        raise InfrastructureError(
            "API endpoint must not be empty."
        )

    parsed = urlparse(endpoint)

    if parsed.scheme not in {
        "http",
        "https",
    }:
        raise InfrastructureError(
            "API endpoint must use http or https."
        )

    if not parsed.hostname:
        raise InfrastructureError(
            "API endpoint has no valid hostname."
        )

    return endpoint


def _normalize_endpoints(
    endpoints: list[str],
) -> list[str]:
    result: list[str] = []

    for entry in endpoints:
        normalized = _normalize_endpoint(
            entry
        )

        if normalized not in result:
            result.append(normalized)

    if not result:
        raise InfrastructureError(
            "At least one API endpoint is required."
        )

    return result


def _decode_endpoints(
    value: str | None,
) -> list[str]:
    if not value:
        return []

    try:
        decoded = json.loads(value)
    except json.JSONDecodeError:
        return []

    if not isinstance(decoded, list):
        return []

    result: list[str] = []

    for entry in decoded:
        if not isinstance(entry, str):
            continue

        cleaned = entry.strip().rstrip("/")

        if cleaned:
            result.append(cleaned)

    return result


def _row_to_infrastructure(
    row: Any,
    *,
    include_secret: bool = False,
) -> dict[str, Any]:
    infrastructure = dict(row)

    infrastructure["enabled"] = bool(
        infrastructure["enabled"]
    )

    infrastructure["verify_ssl"] = bool(
        infrastructure["verify_ssl"]
    )

    infrastructure["api_endpoints"] = (
        _decode_endpoints(
            infrastructure.get(
                "api_endpoints"
            )
        )
    )

    if not include_secret:
        infrastructure.pop(
            "api_token_secret",
            None,
        )

    return infrastructure


def list_infrastructure_nodes(
    infrastructure_id: int,
) -> list[dict[str, Any]]:
    with get_connection() as connection:
        rows = connection.execute(
            """
            SELECT
                id,
                infrastructure_id,
                node_name,
                host,
                enabled,
                discovered_at,
                updated_at
            FROM infrastructure_nodes
            WHERE infrastructure_id = ?
            ORDER BY node_name
            """,
            (infrastructure_id,),
        ).fetchall()

    result: list[dict[str, Any]] = []

    for row in rows:
        node = dict(row)
        node["enabled"] = bool(
            node["enabled"]
        )
        result.append(node)

    return result


def get_infrastructure(
    infrastructure_id: int,
    *,
    include_secret: bool = False,
) -> dict[str, Any] | None:
    with get_connection() as connection:
        row = connection.execute(
            """
            SELECT
                id,
                uuid,
                name,
                type,
                description,
                enabled,
                api_endpoints,
                api_token_id,
                api_token_secret,
                verify_ssl,
                ssh_user,
                ssh_key,
                ssh_port,
                proxmox_cluster_name,
                created_at,
                updated_at
            FROM infrastructures
            WHERE id = ?
            """,
            (infrastructure_id,),
        ).fetchone()

    if row is None:
        return None

    infrastructure = _row_to_infrastructure(
        row,
        include_secret=include_secret,
    )

    infrastructure["nodes"] = (
        list_infrastructure_nodes(
            infrastructure_id
        )
    )

    return infrastructure


def list_infrastructures() -> list[dict[str, Any]]:
    with get_connection() as connection:
        rows = connection.execute(
            """
            SELECT
                id,
                uuid,
                name,
                type,
                description,
                enabled,
                api_endpoints,
                api_token_id,
                api_token_secret,
                verify_ssl,
                ssh_user,
                ssh_key,
                ssh_port,
                proxmox_cluster_name,
                created_at,
                updated_at
            FROM infrastructures
            ORDER BY name, id
            """
        ).fetchall()

    result: list[dict[str, Any]] = []

    for row in rows:
        infrastructure = (
            _row_to_infrastructure(
                row
            )
        )

        infrastructure["nodes"] = (
            list_infrastructure_nodes(
                infrastructure["id"]
            )
        )

        result.append(
            infrastructure
        )

    return result


def count_infrastructures() -> int:
    with get_connection() as connection:
        row = connection.execute(
            """
            SELECT COUNT(*) AS total
            FROM infrastructures
            """
        ).fetchone()

    return int(
        row["total"] if row else 0
    )


async def _api_request(
    *,
    endpoint: str,
    token_id: str,
    token_secret: str,
    verify_ssl: bool,
    path: str,
) -> Any:
    headers = {
        "Authorization": (
            f"PVEAPIToken="
            f"{token_id}="
            f"{token_secret}"
        )
    }

    url = (
        f"{endpoint}/api2/json/"
        f"{path.lstrip('/')}"
    )

    try:
        async with httpx.AsyncClient(
            verify=verify_ssl,
            timeout=15,
            headers=headers,
        ) as client:
            response = await client.get(
                url
            )

    except httpx.RequestError as exc:
        raise InfrastructureError(
            f"Unable to reach Proxmox API: {exc}"
        ) from exc

    if not response.is_success:
        raise InfrastructureError(
            (
                "Proxmox API returned "
                f"HTTP {response.status_code}: "
                f"{response.reason_phrase}"
            )
        )

    try:
        payload = response.json()
    except ValueError as exc:
        raise InfrastructureError(
            "Proxmox returned invalid JSON."
        ) from exc

    if not isinstance(payload, dict):
        raise InfrastructureError(
            "Proxmox returned an invalid API response."
        )

    return payload.get("data")


async def discover_infrastructure(
    *,
    endpoint: str,
    token_id: str,
    token_secret: str,
    verify_ssl: bool,
) -> dict[str, Any]:
    endpoint = _normalize_endpoint(
        endpoint
    )

    token_id = token_id.strip()
    token_secret = token_secret.strip()

    if not token_id:
        raise InfrastructureError(
            "API token ID must not be empty."
        )

    if not token_secret:
        raise InfrastructureError(
            "API token secret must not be empty."
        )

    version = await _api_request(
        endpoint=endpoint,
        token_id=token_id,
        token_secret=token_secret,
        verify_ssl=verify_ssl,
        path="/version",
    )

    nodes = await _api_request(
        endpoint=endpoint,
        token_id=token_id,
        token_secret=token_secret,
        verify_ssl=verify_ssl,
        path="/nodes",
    )

    resources = await _api_request(
        endpoint=endpoint,
        token_id=token_id,
        token_secret=token_secret,
        verify_ssl=verify_ssl,
        path="/cluster/resources",
    )

    cluster_status: list[dict[str, Any]] = []

    try:
        raw_cluster_status = (
            await _api_request(
                endpoint=endpoint,
                token_id=token_id,
                token_secret=token_secret,
                verify_ssl=verify_ssl,
                path="/cluster/status",
            )
        )

        if isinstance(
            raw_cluster_status,
            list,
        ):
            cluster_status = [
                item
                for item in raw_cluster_status
                if isinstance(item, dict)
            ]

    except InfrastructureError:
        cluster_status = []

    if not isinstance(nodes, list):
        raise InfrastructureError(
            "Proxmox did not return a valid node list."
        )

    node_entries = [
        item
        for item in nodes
        if isinstance(item, dict)
        and item.get("node")
    ]

    cluster_entry = next(
        (
            item
            for item in cluster_status
            if str(
                item.get("type", "")
            ).lower() == "cluster"
        ),
        None,
    )

    infrastructure_type = (
        "cluster"
        if (
            cluster_entry is not None
            or len(node_entries) > 1
        )
        else "standalone"
    )

    cluster_name = None

    if cluster_entry is not None:
        raw_name = (
            cluster_entry.get("name")
            or cluster_entry.get(
                "cluster_name"
            )
        )

        if raw_name:
            cluster_name = str(
                raw_name
            ).strip() or None

    status_by_name: dict[
        str,
        dict[str, Any],
    ] = {}

    for item in cluster_status:
        node_name = str(
            item.get("name")
            or item.get("node")
            or ""
        ).strip()

        if node_name:
            status_by_name[
                node_name
            ] = item

    parsed_endpoint = urlparse(
        endpoint
    )

    endpoint_host = (
        parsed_endpoint.hostname
        or ""
    )

    discovered_nodes: list[
        dict[str, Any]
    ] = []

    for node in node_entries:
        node_name = str(
            node["node"]
        ).strip()

        status = status_by_name.get(
            node_name,
            {},
        )

        host = str(
            status.get("ip")
            or ""
        ).strip()

        if (
            not host
            and len(node_entries) == 1
        ):
            host = endpoint_host

        discovered_nodes.append(
            {
                "node_name": node_name,
                "host": host or None,
                "status": node.get(
                    "status"
                ),
                "cpu": node.get("cpu"),
                "maxcpu": node.get(
                    "maxcpu"
                ),
                "mem": node.get("mem"),
                "maxmem": node.get(
                    "maxmem"
                ),
                "uptime": node.get(
                    "uptime"
                ),
            }
        )

    storages: list[dict[str, Any]] = []

    if isinstance(resources, list):
        for item in resources:
            if (
                not isinstance(
                    item,
                    dict,
                )
                or item.get("type")
                != "storage"
            ):
                continue

            storages.append(
                {
                    "storage":
                        item.get(
                            "storage"
                        ),
                    "node":
                        item.get(
                            "node"
                        ),
                    "plugintype":
                        item.get(
                            "plugintype"
                        ),
                    "content":
                        item.get(
                            "content"
                        ),
                    "status":
                        item.get(
                            "status"
                        ),
                }
            )

    suggested_name = (
        cluster_name
        if infrastructure_type
        == "cluster"
        and cluster_name
        else (
            discovered_nodes[0][
                "node_name"
            ]
            if len(
                discovered_nodes
            ) == 1
            else "Proxmox Infrastructure"
        )
    )

    return {
        "ok": True,
        "endpoint": endpoint,
        "type": infrastructure_type,
        "cluster_name": cluster_name,
        "suggested_name":
            suggested_name,
        "version": version,
        "nodes": discovered_nodes,
        "storages": storages,
    }


def create_infrastructure(
    *,
    name: str,
    infrastructure_type: str,
    description: str | None,
    api_endpoints: list[str],
    api_token_id: str,
    api_token_secret: str,
    verify_ssl: bool,
    ssh_user: str,
    ssh_key: str,
    ssh_port: int,
    proxmox_cluster_name: str | None,
    nodes: list[dict[str, Any]],
    enabled: bool = True,
) -> dict[str, Any]:
    clean_name = name.strip()

    if not clean_name:
        raise InfrastructureError(
            "Infrastructure name must not be empty."
        )

    if infrastructure_type not in {
        "cluster",
        "standalone",
    }:
        raise InfrastructureError(
            "Invalid infrastructure type."
        )

    endpoints = _normalize_endpoints(
        api_endpoints
    )

    token_id = api_token_id.strip()
    token_secret = (
        api_token_secret.strip()
    )

    if not token_id:
        raise InfrastructureError(
            "API token ID must not be empty."
        )

    if not token_secret:
        raise InfrastructureError(
            "API token secret must not be empty."
        )

    if not 1 <= ssh_port <= 65535:
        raise InfrastructureError(
            "Invalid SSH port."
        )

    clean_nodes: list[
        dict[str, Any]
    ] = []

    seen_names: set[str] = set()

    for node in nodes:
        node_name = str(
            node.get("node_name")
            or ""
        ).strip()

        host = str(
            node.get("host")
            or ""
        ).strip()

        if not node_name:
            raise InfrastructureError(
                "Every node requires a node name."
            )

        if not host:
            raise InfrastructureError(
                (
                    f"Node '{node_name}' "
                    "requires a reachable host."
                )
            )

        if node_name in seen_names:
            raise InfrastructureError(
                (
                    f"Duplicate node "
                    f"'{node_name}'."
                )
            )

        seen_names.add(
            node_name
        )

        clean_nodes.append(
            {
                "node_name":
                    node_name,
                "host": host,
            }
        )

    if not clean_nodes:
        raise InfrastructureError(
            "At least one node is required."
        )

    if (
        infrastructure_type
        == "standalone"
        and len(clean_nodes) != 1
    ):
        raise InfrastructureError(
            (
                "A standalone infrastructure "
                "must contain exactly one node."
            )
        )

    now = _utc_now_iso()

    with get_connection() as connection:
        existing = connection.execute(
            """
            SELECT id
            FROM infrastructures
            WHERE name = ?
            COLLATE NOCASE
            """,
            (clean_name,),
        ).fetchone()

        if existing is not None:
            raise InfrastructureError(
                (
                    "An infrastructure with "
                    "this name already exists."
                )
            )

        cursor = connection.execute(
            """
            INSERT INTO infrastructures (
                uuid,
                name,
                type,
                description,
                enabled,
                api_endpoints,
                api_token_id,
                api_token_secret,
                verify_ssl,
                ssh_user,
                ssh_key,
                ssh_port,
                proxmox_cluster_name,
                created_at,
                updated_at
            )
            VALUES (
                ?,
                ?,
                ?,
                ?,
                ?,
                ?,
                ?,
                ?,
                ?,
                ?,
                ?,
                ?,
                ?,
                ?,
                ?
            )
            """,
            (
                str(uuid.uuid4()),
                clean_name,
                infrastructure_type,
                (
                    description.strip()
                    if description
                    else None
                ),
                int(enabled),
                json.dumps(
                    endpoints,
                    ensure_ascii=False,
                    separators=(",", ":"),
                ),
                token_id,
                token_secret,
                int(verify_ssl),
                ssh_user.strip()
                or "root",
                ssh_key.strip()
                or "/app/ssh/id_ed25519",
                ssh_port,
                (
                    proxmox_cluster_name.strip()
                    if proxmox_cluster_name
                    else None
                ),
                now,
                now,
            ),
        )

        infrastructure_id = int(
            cursor.lastrowid
        )

        for node in clean_nodes:
            connection.execute(
                """
                INSERT INTO infrastructure_nodes (
                    infrastructure_id,
                    node_name,
                    host,
                    enabled,
                    discovered_at,
                    updated_at
                )
                VALUES (
                    ?,
                    ?,
                    ?,
                    1,
                    ?,
                    ?
                )
                """,
                (
                    infrastructure_id,
                    node["node_name"],
                    node["host"],
                    now,
                    now,
                ),
            )

        connection.commit()

    infrastructure = get_infrastructure(
        infrastructure_id
    )

    if infrastructure is None:
        raise InfrastructureError(
            (
                "Created infrastructure "
                "could not be loaded."
            )
        )

    return infrastructure


def update_infrastructure(
    infrastructure_id: int,
    *,
    name: str,
    description: str | None,
    enabled: bool,
    verify_ssl: bool,
    ssh_user: str,
    ssh_key: str,
    ssh_port: int,
) -> dict[str, Any]:
    existing = get_infrastructure(
        infrastructure_id
    )

    if existing is None:
        raise InfrastructureError(
            "Infrastructure not found."
        )

    clean_name = name.strip()

    if not clean_name:
        raise InfrastructureError(
            "Infrastructure name must not be empty."
        )

    if not 1 <= ssh_port <= 65535:
        raise InfrastructureError(
            "Invalid SSH port."
        )

    with get_connection() as connection:
        duplicate = connection.execute(
            """
            SELECT id
            FROM infrastructures
            WHERE name = ?
              AND id != ?
            COLLATE NOCASE
            """,
            (
                clean_name,
                infrastructure_id,
            ),
        ).fetchone()

        if duplicate is not None:
            raise InfrastructureError(
                (
                    "An infrastructure with "
                    "this name already exists."
                )
            )

        connection.execute(
            """
            UPDATE infrastructures
            SET
                name = ?,
                description = ?,
                enabled = ?,
                verify_ssl = ?,
                ssh_user = ?,
                ssh_key = ?,
                ssh_port = ?,
                updated_at = ?
            WHERE id = ?
            """,
            (
                clean_name,
                (
                    description.strip()
                    if description
                    else None
                ),
                int(enabled),
                int(verify_ssl),
                ssh_user.strip()
                or "root",
                ssh_key.strip()
                or "/app/ssh/id_ed25519",
                ssh_port,
                _utc_now_iso(),
                infrastructure_id,
            ),
        )

        connection.commit()

    updated = get_infrastructure(
        infrastructure_id
    )

    if updated is None:
        raise InfrastructureError(
            "Infrastructure not found."
        )

    return updated


def delete_infrastructure_node(
    infrastructure_id: int,
    node_id: int,
) -> dict[str, Any]:
    infrastructure = get_infrastructure(
        infrastructure_id
    )

    if infrastructure is None:
        raise InfrastructureError(
            "Infrastructure not found."
        )

    with get_connection() as connection:
        row = connection.execute(
            """
            SELECT
                id,
                infrastructure_id,
                node_name,
                host,
                enabled,
                discovered_at,
                updated_at
            FROM infrastructure_nodes
            WHERE infrastructure_id = ?
              AND id = ?
            """,
            (
                infrastructure_id,
                node_id,
            ),
        ).fetchone()

        if row is None:
            raise InfrastructureError(
                "Infrastructure node not found."
            )

        deleted = dict(row)

        connection.execute(
            """
            DELETE FROM infrastructure_nodes
            WHERE infrastructure_id = ?
              AND id = ?
            """,
            (
                infrastructure_id,
                node_id,
            ),
        )

        connection.commit()

    deleted["enabled"] = bool(
        deleted["enabled"]
    )

    return deleted


def delete_infrastructure(
    infrastructure_id: int,
) -> dict[str, Any]:
    existing = get_infrastructure(
        infrastructure_id
    )

    if existing is None:
        raise InfrastructureError(
            "Infrastructure not found."
        )

    with get_connection() as connection:
        connection.execute(
            """
            DELETE FROM infrastructures
            WHERE id = ?
            """,
            (infrastructure_id,),
        )

        connection.commit()

    return existing
