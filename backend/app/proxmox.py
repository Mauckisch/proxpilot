from urllib.parse import quote, urlparse

import httpx

from .infrastructures import get_infrastructure


class ProxmoxError(RuntimeError):
    pass


class ProxmoxClient:
    def __init__(
        self,
        infrastructure_id: int,
    ):
        if infrastructure_id <= 0:
            raise ProxmoxError(
                "A valid infrastructure ID is required."
            )

        self.infrastructure_id = (
            infrastructure_id
        )

        infrastructure = (
            get_infrastructure(
                infrastructure_id,
                include_secret=True,
            )
        )

        if infrastructure is None:
            raise ProxmoxError(
                (
                    "Infrastructure "
                    f"{infrastructure_id} "
                    "was not found."
                )
            )

        if not infrastructure[
            "enabled"
        ]:
            raise ProxmoxError(
                (
                    "Infrastructure "
                    f"{infrastructure_id} "
                    "is disabled."
                )
            )

        self.infrastructure = (
            infrastructure
        )

        self.endpoints = list(
            infrastructure[
                "api_endpoints"
            ]
        )

        self.token_id = str(
            infrastructure[
                "api_token_id"
            ]
        )

        self.token_secret = str(
            infrastructure[
                "api_token_secret"
            ]
        )

        self.verify_ssl = bool(
            infrastructure[
                "verify_ssl"
            ]
        )

        self.node_hosts = {
            str(node["node_name"]):
                str(node["host"])
            for node in infrastructure[
                "nodes"
            ]
            if (
                node.get("enabled")
                and node.get("node_name")
                and node.get("host")
            )
        }

        self.headers = {
            "Authorization": (
                f"PVEAPIToken="
                f"{self.token_id}="
                f"{self.token_secret}"
            )
        }

    @staticmethod
    def _format_http_error(
        response: httpx.Response,
    ) -> str:
        status = response.status_code
        message = response.reason_phrase or "HTTP error"
        details: list[str] = []

        try:
            payload = response.json()
        except Exception:
            payload = None

        if isinstance(payload, dict):
            api_message = payload.get("message")

            if isinstance(api_message, str) and api_message.strip():
                message = api_message.strip()

            api_errors = payload.get("errors")

            if isinstance(api_errors, dict):
                for field, error in api_errors.items():
                    if isinstance(error, str):
                        details.append(f"{field}: {error}")
                    else:
                        details.append(f"{field}: {error!s}")

            api_data = payload.get("data")

            if (
                isinstance(api_data, str)
                and api_data.strip()
                and api_data.strip() != message
            ):
                details.append(api_data.strip())

        if not details:
            body = response.text.strip()

            if (
                body
                and not body.startswith("<")
                and len(body) <= 500
            ):
                details.append(body)

        result = f"Proxmox API error {status}: {message}"

        if details:
            result += " — " + "; ".join(details)

        return result

    async def request(
        self,
        method: str,
        path: str,
        data: dict | None = None,
    ):
        connection_errors: list[str] = []
        server_errors: list[str] = []

        for endpoint in self.endpoints:
            url = (
                f"{endpoint}/api2/json/"
                f"{path.lstrip('/')}"
            )

            try:
                async with httpx.AsyncClient(
                    verify=self.verify_ssl,
                    timeout=20,
                    headers=self.headers,
                ) as client:
                    response = await client.request(
                        method,
                        url,
                        data=data,
                    )

            except httpx.RequestError as exc:
                connection_errors.append(
                    f"{endpoint}: {exc}"
                )
                continue

            if response.is_success:
                try:
                    payload = response.json()
                except ValueError as exc:
                    raise ProxmoxError(
                        "Proxmox returned an invalid JSON response."
                    ) from exc

                return payload.get("data")

            error_message = self._format_http_error(response)

            # 4xx errors are definitive request, permission or
            # validation errors. Trying every cluster endpoint only
            # repeats the same failure and creates unreadable messages.
            if 400 <= response.status_code < 500:
                raise ProxmoxError(error_message)

            # A single node may temporarily return a server error.
            # In that case, another cluster endpoint may still work.
            server_errors.append(
                f"{endpoint}: {error_message}"
            )

        errors = connection_errors + server_errors

        if not errors:
            raise ProxmoxError(
                "No Proxmox API endpoints are configured."
            )

        raise ProxmoxError(
            "No Proxmox API endpoint was reachable: "
            + " | ".join(errors)
        )

    async def request_node(
        self,
        node: str,
        method: str,
        path: str,
        data: dict | None = None,
    ):
        node_host = self.node_host(node)

        if not node_host:
            raise ProxmoxError(
                f"No host mapping is configured for node {node}."
            )

        if not self.endpoints:
            raise ProxmoxError(
                "No Proxmox API endpoints are configured."
            )

        reference_endpoint = urlparse(
            self.endpoints[0]
        )

        scheme = reference_endpoint.scheme or "https"
        port = reference_endpoint.port or (
            443 if scheme == "https" else 80
        )

        if "://" in node_host:
            parsed_host = urlparse(node_host)
            scheme = parsed_host.scheme or scheme
            hostname = parsed_host.hostname
            port = parsed_host.port or port
        else:
            hostname = node_host

        if not hostname:
            raise ProxmoxError(
                f"Invalid host mapping for node {node}."
            )

        url = (
            f"{scheme}://{hostname}:{port}"
            f"/api2/json/{path.lstrip('/')}"
        )

        try:
            async with httpx.AsyncClient(
                verify=self.verify_ssl,
                timeout=20,
                headers=self.headers,
            ) as api_client:
                response = await api_client.request(
                    method,
                    url,
                    data=data,
                )

        except httpx.RequestError as exc:
            raise ProxmoxError(
                f"Unable to reach Proxmox node {node}: {exc}"
            ) from exc

        if not response.is_success:
            raise ProxmoxError(
                self._format_http_error(response)
            )

        try:
            payload = response.json()
        except ValueError as exc:
            raise ProxmoxError(
                "Proxmox returned an invalid JSON response."
            ) from exc

        return payload.get("data")


    async def dashboard(self):
        resources = (
            await self.request(
                "GET",
                "/cluster/resources",
            )
            or []
        )

        nodes = (
            await self.request(
                "GET",
                "/nodes",
            )
            or []
        )

        try:
            ha = (
                await self.request(
                    "GET",
                    "/cluster/ha/status/current",
                )
                or []
            )

        except ProxmoxError:
            ha = []

        try:
            replications = (
                await self.request(
                    "GET",
                    "/cluster/replication",
                )
                or []
            )

        except ProxmoxError:
            replications = []

        guests = []

        for item in resources:
            if item.get("type") not in {"qemu", "lxc"}:
                continue

            guest = dict(item)

            try:
                snaps = await self.snapshots(
                    guest["node"],
                    guest["type"],
                    guest["vmid"],
                )

                guest["snapshot_count"] = len(snaps)
                guest["has_snapshots"] = bool(snaps)
                guest["latest_snapshot"] = (
                    snaps[0]["name"] if snaps else None
                )

            except Exception:
                guest["snapshot_count"] = 0
                guest["has_snapshots"] = False
                guest["latest_snapshot"] = None

            guests.append(guest)

        storages = [
            item
            for item in resources
            if item.get("type") == "storage"
        ]

        try:
            backup_jobs = (
                await self.request(
                    "GET",
                    "/cluster/backup",
                )
                or []
            )
        except ProxmoxError:
            backup_jobs = []

        backup_tasks = []

        for node in nodes:
            name = node.get("node")
            if not name:
                continue

            try:
                tasks = (
                    await self.request(
                        "GET",
                        f"/nodes/{name}/tasks",
                    )
                    or []
                )

                for task in tasks:
                    if task.get("type") == "vzdump":
                        backup_tasks.append(task)

            except ProxmoxError:
                pass

        backup_tasks.sort(
            key=lambda task: task.get("starttime", 0),
            reverse=True,
        )

        return {
            "nodes": nodes,
            "guests": guests,
            "storages": storages,
            "replications": replications,
            "backup_jobs": backup_jobs,
            "backup_tasks": backup_tasks,
            "ha": ha,
        }

    async def snapshots(
        self,
        node: str,
        guest_type: str,
        vmid: int,
    ) -> list[dict]:
        if guest_type not in {"qemu", "lxc"}:
            raise ProxmoxError("Ungültiger Gasttyp")

        snapshots = (
            await self.request(
                "GET",
                f"/nodes/{node}/{guest_type}/{vmid}/snapshot",
            )
            or []
        )

        result = []

        for snapshot in snapshots:
            name = snapshot.get("name")

            # Proxmox liefert zusätzlich den aktuellen Zustand als
            # Eintrag mit dem Namen "current". Das ist kein Snapshot.
            if not name or name == "current":
                continue

            result.append(
                {
                    "name": name,
                    "description": snapshot.get("description") or "",
                    "created_at": snapshot.get("snaptime"),
                    "includes_ram": bool(snapshot.get("vmstate")),
                    "parent": snapshot.get("parent"),
                }
            )

        result.sort(
            key=lambda item: item.get("created_at") or 0,
            reverse=True,
        )

        return result

    async def create_snapshot(
        self,
        node: str,
        guest_type: str,
        vmid: int,
        name: str,
        description: str = "",
        include_ram: bool = False,
    ) -> str:
        if guest_type not in {"qemu", "lxc"}:
            raise ProxmoxError("Ungültiger Gasttyp")

        parameters = {
            "snapname": name,
        }

        # Optionale Parameter nur senden, wenn sie tatsächlich gesetzt sind.
        if description.strip():
            parameters["description"] = description.strip()

        # vmstate nur bei aktivierter RAM-Sicherung senden.
        if guest_type == "qemu" and include_ram:
            parameters["vmstate"] = 1

        upid = await self.request(
            "POST",
            f"/nodes/{node}/{guest_type}/{vmid}/snapshot",
            data=parameters,
        )

        if not isinstance(upid, str) or not upid.startswith("UPID:"):
            raise ProxmoxError(
                "Proxmox lieferte keine gültige Task-ID "
                "für die Snapshot-Erstellung."
            )

        return upid

    async def delete_snapshot(
        self,
        node: str,
        guest_type: str,
        vmid: int,
        snapshot_name: str,
    ) -> str:
        if guest_type not in {"qemu", "lxc"}:
            raise ProxmoxError("Ungültiger Gasttyp")

        upid = await self.request(
            "DELETE",
            (
                f"/nodes/{node}/{guest_type}/{vmid}"
                f"/snapshot/{quote(snapshot_name, safe='')}"
            ),
        )

        if not isinstance(upid, str) or not upid.startswith("UPID:"):
            raise ProxmoxError(
                "Proxmox lieferte keine gültige Task-ID "
                "für das Löschen des Snapshots."
            )

        return upid

    async def rollback_snapshot(
        self,
        node: str,
        guest_type: str,
        vmid: int,
        snapshot_name: str,
    ) -> str:
        if guest_type not in {"qemu", "lxc"}:
            raise ProxmoxError("Ungültiger Gasttyp")

        upid = await self.request(
            "POST",
            (
                f"/nodes/{node}/{guest_type}/{vmid}"
                f"/snapshot/{quote(snapshot_name, safe='')}/rollback"
            ),
        )

        if not isinstance(upid, str) or not upid.startswith("UPID:"):
            raise ProxmoxError(
                "Proxmox lieferte keine gültige Task-ID "
                "für das Zurückrollen des Snapshots."
            )

        return upid

    async def guest_status(
        self,
        node: str,
        guest_type: str,
        vmid: int,
    ) -> dict:
        if guest_type not in {"qemu", "lxc"}:
            raise ProxmoxError(
                "Unsupported guest type."
            )

        if vmid <= 0:
            raise ProxmoxError(
                "Invalid VM ID."
            )

        result = await self.request_node(
            node,
            "GET",
            (
                f"/nodes/{node}/"
                f"{guest_type}/{vmid}/status/current"
            ),
        )

        if not isinstance(result, dict):
            raise ProxmoxError(
                "Proxmox returned an invalid guest status."
            )

        return result


    async def guest_ha_resource(
        self,
        vmid: int,
    ) -> dict | None:
        if vmid <= 0:
            raise ProxmoxError(
                "Invalid VM ID."
            )

        sid = f"vm:{vmid}"

        resources = (
            await self.request(
                "GET",
                "/cluster/ha/resources",
            )
            or []
        )

        if not isinstance(resources, list):
            raise ProxmoxError(
                "Proxmox returned an invalid HA resource list."
            )

        for resource in resources:
            if not isinstance(resource, dict):
                continue

            if str(
                resource.get(
                    "sid",
                    "",
                )
            ) == sid:
                return dict(resource)

        return None


    async def set_guest_ha_state(
        self,
        vmid: int,
        state: str,
    ) -> None:
        if vmid <= 0:
            raise ProxmoxError(
                "Invalid VM ID."
            )

        normalized_state = state.strip()

        if not normalized_state:
            raise ProxmoxError(
                "HA state must not be empty."
            )

        await self.request(
            "PUT",
            (
                "/cluster/ha/resources/"
                f"vm:{vmid}"
            ),
            data={
                "state":
                    normalized_state,
            },
        )


    async def restore_guest(
        self,
        node: str,
        guest_type: str,
        vmid: int,
        archive: str,
        *,
        storage: str | None = None,
    ) -> str:
        if guest_type not in {"qemu", "lxc"}:
            raise ProxmoxError(
                "Unsupported guest type."
            )

        if vmid <= 0:
            raise ProxmoxError(
                "Invalid VM ID."
            )

        normalized_archive = archive.strip()

        if not normalized_archive:
            raise ProxmoxError(
                "Backup archive must be specified."
            )

        normalized_storage = (
            storage.strip()
            if storage
            else ""
        )

        if guest_type == "qemu":
            parameters: dict[str, str | int] = {
                "vmid":
                    vmid,
                "archive":
                    normalized_archive,
                "force":
                    1,
            }

        else:
            parameters = {
                "vmid":
                    vmid,
                "ostemplate":
                    normalized_archive,
                "restore":
                    1,
                "force":
                    1,
            }

        if normalized_storage:
            parameters["storage"] = (
                normalized_storage
            )

        upid = await self.request_node(
            node,
            "POST",
            (
                f"/nodes/{node}/"
                f"{guest_type}"
            ),
            data=parameters,
        )

        if (
            not isinstance(upid, str)
            or not upid.startswith("UPID:")
        ):
            raise ProxmoxError(
                "Proxmox did not return a valid task ID "
                "for the guest restore."
            )

        return upid


    async def guest_backup_archives(
        self,
        node: str,
        guest_type: str,
        vmid: int,
    ) -> list[dict]:
        if guest_type not in {"qemu", "lxc"}:
            raise ProxmoxError(
                "Unsupported guest type."
            )

        if vmid <= 0:
            raise ProxmoxError(
                "Invalid VM ID."
            )

        storage_items = (
            await self.request_node(
                node,
                "GET",
                f"/nodes/{node}/storage",
            )
            or []
        )

        if not isinstance(
            storage_items,
            list,
        ):
            raise ProxmoxError(
                "Proxmox returned an invalid storage list."
            )

        result: list[dict] = []

        expected_prefix = (
            f"vzdump-qemu-{vmid}-"
            if guest_type == "qemu"
            else f"vzdump-lxc-{vmid}-"
        )

        expected_formats = (
            {"vma", "vma.gz", "vma.lzo", "vma.zst"}
            if guest_type == "qemu"
            else {
                "tar",
                "tar.gz",
                "tar.lzo",
                "tar.zst",
            }
        )

        for storage in storage_items:
            if not isinstance(
                storage,
                dict,
            ):
                continue

            storage_id = str(
                storage.get(
                    "storage",
                    "",
                )
                or ""
            ).strip()

            if not storage_id:
                continue

            content_value = str(
                storage.get(
                    "content",
                    "",
                )
                or ""
            )

            content_types = {
                value.strip()
                for value in content_value.split(",")
                if value.strip()
            }

            if (
                content_types
                and "backup"
                not in content_types
            ):
                continue

            try:
                archives = (
                    await self.request_node(
                        node,
                        "GET",
                        (
                            f"/nodes/{node}/storage/"
                            f"{quote(storage_id, safe='')}/content"
                        ),
                    )
                    or []
                )
            except ProxmoxError:
                continue

            if not isinstance(
                archives,
                list,
            ):
                continue

            for archive in archives:
                if not isinstance(
                    archive,
                    dict,
                ):
                    continue

                archive_vmid = archive.get(
                    "vmid"
                )

                try:
                    normalized_vmid = int(
                        archive_vmid
                    )
                except (
                    TypeError,
                    ValueError,
                ):
                    continue

                if normalized_vmid != vmid:
                    continue

                volid = str(
                    archive.get(
                        "volid",
                        "",
                    )
                    or ""
                ).strip()

                if not volid:
                    continue

                filename = (
                    volid.split(
                        "/",
                        1,
                    )[-1]
                )

                if not filename.startswith(
                    expected_prefix
                ):
                    continue

                archive_format = str(
                    archive.get(
                        "format",
                        "",
                    )
                    or ""
                ).strip()

                if (
                    archive_format
                    and archive_format
                    not in expected_formats
                ):
                    continue

                try:
                    size = int(
                        archive.get(
                            "size",
                            0,
                        )
                        or 0
                    )
                except (
                    TypeError,
                    ValueError,
                ):
                    size = 0

                try:
                    ctime = int(
                        archive.get(
                            "ctime",
                            0,
                        )
                        or 0
                    )
                except (
                    TypeError,
                    ValueError,
                ):
                    ctime = 0

                result.append(
                    {
                        "storage":
                            storage_id,
                        "volid":
                            volid,
                        "vmid":
                            normalized_vmid,
                        "guest_type":
                            guest_type,
                        "format":
                            archive_format,
                        "size":
                            size,
                        "ctime":
                            ctime,
                        "notes":
                            archive.get(
                                "notes"
                            ),
                        "protected":
                            bool(
                                archive.get(
                                    "protected"
                                )
                            ),
                        "encrypted":
                            bool(
                                archive.get(
                                    "encrypted"
                                )
                            ),
                        "verification":
                            archive.get(
                                "verification"
                            ),
                    }
                )

        result.sort(
            key=lambda item:
                int(
                    item.get(
                        "ctime",
                        0,
                    )
                    or 0
                ),
            reverse=True,
        )

        return result


    async def run_backup(
        self,
        node: str,
        parameters: dict,
    ) -> str:
        upid = await self.request(
            "POST",
            f"/nodes/{node}/vzdump",
            data=parameters,
        )

        if not isinstance(upid, str) or not upid.startswith("UPID:"):
            raise ProxmoxError(
                f"Proxmox lieferte für {node} keine gültige Task-ID."
            )

        return upid

    async def task_details(
        self,
        node: str,
        upid: str,
    ):
        if not upid.startswith("UPID:"):
            raise ProxmoxError("Ungültige Proxmox-Task-ID")

        encoded_upid = quote(upid, safe="")

        status = (
            await self.request(
                "GET",
                f"/nodes/{node}/tasks/{encoded_upid}/status",
            )
            or {}
        )

        log = (
            await self.request(
                "GET",
                f"/nodes/{node}/tasks/{encoded_upid}/log",
            )
            or []
        )

        return {
            "status": status,
            "log": log,
        }

    def node_host(
        self,
        node: str,
    ) -> str | None:
        host = self.node_hosts.get(
            node
        )

        if not host:
            return None

        resolved_host = str(
            host
        ).strip()

        return resolved_host or None

    async def guest_details(
        self,
        node: str,
        guest_type: str,
        vmid: int,
    ) -> dict:
        if guest_type not in {"qemu", "lxc"}:
            raise ProxmoxError("Ungültiger Gasttyp")

        config = (
            await self.request(
                "GET",
                f"/nodes/{node}/{guest_type}/{vmid}/config",
            )
            or {}
        )

        status = (
            await self.request(
                "GET",
                f"/nodes/{node}/{guest_type}/{vmid}/status/current",
            )
            or {}
        )

        guest_agent_network = []
        guest_agent_hostname = None
        guest_agent_os = None
        guest_agent_filesystems = []

        if (
            guest_type == "qemu"
            and str(status.get("status", "")).lower() == "running"
        ):
            try:
                agent_response = await self.request_node(
                    node,
                    "GET",
                    (
                        f"/nodes/{node}/qemu/{vmid}"
                        "/agent/network-get-interfaces"
                    ),
                )

                if isinstance(agent_response, dict):
                    interfaces = agent_response.get(
                        "result",
                        [],
                    )
                elif isinstance(agent_response, list):
                    interfaces = agent_response
                else:
                    interfaces = []

                if isinstance(interfaces, list):
                    for interface in interfaces:
                        if not isinstance(interface, dict):
                            continue

                        name = str(
                            interface.get("name", "")
                        ).strip()

                        if name == "lo":
                            continue

                        addresses = []

                        for address in (
                            interface.get(
                                "ip-addresses",
                                [],
                            )
                            or []
                        ):
                            if not isinstance(address, dict):
                                continue

                            ip_address = str(
                                address.get(
                                    "ip-address",
                                    "",
                                )
                            ).strip()

                            if (
                                not ip_address
                                or ip_address == "::1"
                                or ip_address.startswith(
                                    "127."
                                )
                            ):
                                continue

                            addresses.append(
                                {
                                    "address": ip_address,
                                    "type": address.get(
                                        "ip-address-type"
                                    ),
                                    "prefix": address.get(
                                        "prefix"
                                    ),
                                }
                            )

                        guest_agent_network.append(
                            {
                                "name": name,
                                "hardware_address": interface.get(
                                    "hardware-address"
                                ),
                                "ip_addresses": addresses,
                            }
                        )

            except ProxmoxError:
                guest_agent_network = []

            try:
                hostname_response = await self.request_node(
                    node,
                    "GET",
                    (
                        f"/nodes/{node}/qemu/{vmid}"
                        "/agent/get-host-name"
                    ),
                )

                if isinstance(hostname_response, dict):
                    result = hostname_response.get("result")

                    if isinstance(result, dict):
                        guest_agent_hostname = result.get(
                            "host-name"
                        )

            except ProxmoxError:
                guest_agent_hostname = None

            try:
                os_response = await self.request_node(
                    node,
                    "GET",
                    (
                        f"/nodes/{node}/qemu/{vmid}"
                        "/agent/get-osinfo"
                    ),
                )

                if isinstance(os_response, dict):
                    result = os_response.get("result")

                    if isinstance(result, dict):
                        guest_agent_os = result

            except ProxmoxError:
                guest_agent_os = None

            try:
                fs_response = await self.request_node(
                    node,
                    "GET",
                    (
                        f"/nodes/{node}/qemu/{vmid}"
                        "/agent/get-fsinfo"
                    ),
                )

                if isinstance(fs_response, dict):
                    filesystems = fs_response.get(
                        "result",
                        [],
                    )
                elif isinstance(fs_response, list):
                    filesystems = fs_response
                else:
                    filesystems = []

                ignored_types = {
                    "tmpfs",
                    "devtmpfs",
                    "overlay",
                    "squashfs",
                    "erofs",
                    "ramfs",
                }

                ignored_mountpoints = {
                    "/tmp",
                    "/run",
                    "/proc",
                    "/sys",
                    "/dev",
                    "/boot",
                    "/boot/efi",
                    "/mnt/overlay",
                }

                if isinstance(filesystems, list):
                    for filesystem in filesystems:
                        if not isinstance(filesystem, dict):
                            continue

                        mountpoint = str(
                            filesystem.get(
                                "mountpoint",
                                "",
                            )
                        ).strip()

                        filesystem_type = str(
                            filesystem.get(
                                "type",
                                "",
                            )
                        ).strip().lower()

                        name = str(
                            filesystem.get(
                                "name",
                                "",
                            )
                        ).strip().lower()

                        if (
                            not mountpoint
                            or mountpoint in ignored_mountpoints
                            or filesystem_type in ignored_types
                            or name.startswith("zram")
                        ):
                            continue

                        try:
                            total_bytes = int(
                                filesystem.get(
                                    "total-bytes",
                                    0,
                                )
                            )
                            used_bytes = int(
                                filesystem.get(
                                    "used-bytes",
                                    0,
                                )
                            )
                        except (TypeError, ValueError):
                            continue

                        if total_bytes <= 0:
                            continue

                        guest_agent_filesystems.append(
                            {
                                "mountpoint": mountpoint,
                                "name": filesystem.get(
                                    "name"
                                ),
                                "type": filesystem.get(
                                    "type"
                                ),
                                "total_bytes": total_bytes,
                                "used_bytes": used_bytes,
                            }
                        )

            except ProxmoxError:
                guest_agent_filesystems = []

        return {
            "node": node,
            "node_host": self.node_host(node),
            "guest_type": guest_type,
            "vmid": vmid,
            "config": config,
            "status": status,
            "guest_agent_network": guest_agent_network,
            "guest_agent_hostname": guest_agent_hostname,
            "guest_agent_os": guest_agent_os,
            "guest_agent_filesystems": guest_agent_filesystems,
        }

    async def guest_disk_usage(
        self,
        node: str,
        vmid: int,
    ) -> dict:
        try:
            fs_response = await self.request_node(
                node,
                "GET",
                (
                    f"/nodes/{node}/qemu/{vmid}"
                    "/agent/get-fsinfo"
                ),
            )
        except ProxmoxError:
            return {
                "available": False,
                "used_bytes": 0,
                "total_bytes": 0,
            }

        if isinstance(fs_response, dict):
            filesystems = fs_response.get(
                "result",
                [],
            )
        elif isinstance(fs_response, list):
            filesystems = fs_response
        else:
            filesystems = []

        ignored_types = {
            "tmpfs",
            "devtmpfs",
            "overlay",
            "squashfs",
            "erofs",
            "ramfs",
        }

        ignored_mountpoints = {
            "/tmp",
            "/run",
            "/proc",
            "/sys",
            "/dev",
            "/boot",
            "/boot/efi",
            "/mnt/overlay",
        }

        used_bytes = 0
        total_bytes = 0

        if isinstance(filesystems, list):
            for filesystem in filesystems:
                if not isinstance(filesystem, dict):
                    continue

                mountpoint = str(
                    filesystem.get(
                        "mountpoint",
                        "",
                    )
                ).strip()

                filesystem_type = str(
                    filesystem.get(
                        "type",
                        "",
                    )
                ).strip().lower()

                name = str(
                    filesystem.get(
                        "name",
                        "",
                    )
                ).strip().lower()

                if (
                    not mountpoint
                    or mountpoint in ignored_mountpoints
                    or filesystem_type in ignored_types
                    or name.startswith("zram")
                ):
                    continue

                try:
                    filesystem_total = int(
                        filesystem.get(
                            "total-bytes",
                            0,
                        )
                    )

                    filesystem_used = int(
                        filesystem.get(
                            "used-bytes",
                            0,
                        )
                    )
                except (TypeError, ValueError):
                    continue

                if filesystem_total <= 0:
                    continue

                total_bytes += filesystem_total
                used_bytes += max(
                    0,
                    filesystem_used,
                )

        return {
            "available": total_bytes > 0,
            "used_bytes": used_bytes,
            "total_bytes": total_bytes,
        }


    async def migrate_guest(
        self,
        node: str,
        guest_type: str,
        vmid: int,
        target: str,
        online: bool = False,
        restart: bool = False,
        with_local_disks: bool = False,
        target_storage: str | None = None,
    ) -> str:
        if guest_type not in {"qemu", "lxc"}:
            raise ProxmoxError("Ungültiger Gasttyp")

        if not node or not target:
            raise ProxmoxError("Quell- und Ziel-Node müssen angegeben werden.")

        if node == target:
            raise ProxmoxError(
                "Quell- und Ziel-Node dürfen nicht identisch sein."
            )

        parameters: dict[str, str | int] = {
            "target": target,
        }

        if guest_type == "qemu":
            if online:
                parameters["online"] = 1

            if with_local_disks:
                parameters["with-local-disks"] = 1

            if target_storage and target_storage.strip():
                parameters["targetstorage"] = target_storage.strip()

        else:
            # Laufende LXC-Container werden bei einer Migration
            # kontrolliert neu gestartet. Eine echte Live-Migration
            # wie bei QEMU wird hier nicht angeboten.
            if restart:
                parameters["restart"] = 1

            if target_storage and target_storage.strip():
                parameters["target-storage"] = target_storage.strip()

        upid = await self.request(
            "POST",
            f"/nodes/{node}/{guest_type}/{vmid}/migrate",
            data=parameters,
        )

        if not isinstance(upid, str) or not upid.startswith("UPID:"):
            raise ProxmoxError(
                "Proxmox lieferte keine gültige Task-ID "
                "für die Migration."
            )

        return upid

    async def create_console_ticket(
        self,
        node: str,
        guest_type: str,
        vmid: int,
    ) -> dict:
        if not node.strip():
            raise ProxmoxError(
                "A Proxmox node must be specified."
            )

        if guest_type not in {"qemu", "lxc"}:
            raise ProxmoxError(
                "Unsupported guest type."
            )

        if vmid <= 0:
            raise ProxmoxError(
                "Invalid VM ID."
            )

        # The VNC proxy must be created through the
        # same Proxmox node that will later handle
        # the vncwebsocket connection.
        result = await self.request_node(
            node,
            "POST",
            (
                f"/nodes/{node}/{guest_type}/{vmid}"
                "/vncproxy"
            ),
            data={
                "websocket": 1,
            },
        )

        if not isinstance(result, dict):
            raise ProxmoxError(
                "Proxmox returned an invalid VNC "
                "proxy response."
            )

        ticket = result.get("ticket")
        port = result.get("port")

        if not isinstance(ticket, str) or not ticket:
            raise ProxmoxError(
                "Proxmox did not return a VNC ticket."
            )

        try:
            normalized_port = int(port)
        except (TypeError, ValueError) as exc:
            raise ProxmoxError(
                "Proxmox did not return a valid VNC port."
            ) from exc

        if not 5900 <= normalized_port <= 5999:
            raise ProxmoxError(
                "Proxmox returned a VNC port outside "
                "the expected range."
            )

        return {
            "ticket": ticket,
            "port": normalized_port,
            "cert": result.get("cert"),
            "user": result.get("user"),
        }


    async def guest_action(
        self,
        node: str,
        kind: str,
        vmid: int,
        action: str,
    ):
        allowed = {
            "qemu": {
                "start",
                "shutdown",
                "reboot",
                "stop",
                "reset",
                "suspend",
                "resume",
            },
            "lxc": {
                "start",
                "shutdown",
                "reboot",
                "stop",
                "suspend",
                "resume",
            },
        }

        if (
            kind not in allowed
            or action not in allowed[kind]
        ):
            raise ProxmoxError("Ungültige Aktion")

        return await self.request(
            "POST",
            (
                f"/nodes/{node}/{kind}/{vmid}"
                f"/status/{action}"
            ),
        )
