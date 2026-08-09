from __future__ import annotations

import json
import re
import shlex
from pathlib import Path
from typing import Any

import paramiko

from .infrastructures import get_infrastructure


class HostDetailsError(RuntimeError):
    pass


def _ssh_client(
    node: str,
    infrastructure_id: int,
) -> paramiko.SSHClient:
    if infrastructure_id <= 0:
        raise HostDetailsError(
            "A valid infrastructure ID is required."
        )

    infrastructure = get_infrastructure(
        infrastructure_id
    )

    if infrastructure is None:
        raise HostDetailsError(
            f"Infrastructure {infrastructure_id} not found."
        )

    if not infrastructure["enabled"]:
        raise HostDetailsError(
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
        raise HostDetailsError(
            f"Node '{node}' is not configured in "
            f"infrastructure {infrastructure_id}."
        )

    host = node_entry.get("host")
    ssh_user = infrastructure["ssh_user"]
    ssh_key = infrastructure["ssh_key"]
    ssh_port = infrastructure["ssh_port"]

    if not host:
        raise HostDetailsError(
            f"Keine SSH-Adresse für Node '{node}' konfiguriert."
        )

    key = Path(ssh_key)

    if not key.is_file():
        raise HostDetailsError(
            f"SSH-Key nicht gefunden: {key}"
        )

    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(
        paramiko.AutoAddPolicy()
    )

    try:
        client.connect(
            hostname=host,
            port=ssh_port,
            username=ssh_user,
            key_filename=str(key),
            look_for_keys=False,
            allow_agent=False,
            timeout=10,
            banner_timeout=10,
            auth_timeout=10,
        )
    except Exception as exc:
        raise HostDetailsError(
            f"SSH-Verbindung zu {node} fehlgeschlagen: {exc}"
        ) from exc

    return client


def _run_command(
    client: paramiko.SSHClient,
    command: str,
    *,
    required: bool = True,
    timeout: int = 30,
) -> str:
    try:
        _, stdout, stderr = client.exec_command(
            command,
            timeout=timeout,
        )

        output = stdout.read().decode(
            "utf-8",
            errors="replace",
        ).strip()

        error = stderr.read().decode(
            "utf-8",
            errors="replace",
        ).strip()

        exit_code = stdout.channel.recv_exit_status()

    except Exception as exc:
        if required:
            raise HostDetailsError(
                f"Host-Kommando fehlgeschlagen: {exc}"
            ) from exc

        return ""

    if exit_code != 0:
        if required:
            raise HostDetailsError(
                error
                or (
                    f"Kommando wurde mit Exit-Code "
                    f"{exit_code} beendet: {command}"
                )
            )

        return ""

    return output


def _run_json(
    client: paramiko.SSHClient,
    command: str,
    *,
    required: bool = False,
) -> Any:
    output = _run_command(
        client,
        command,
        required=required,
    )

    if not output:
        return None

    try:
        return json.loads(output)
    except json.JSONDecodeError:
        if required:
            raise HostDetailsError(
                f"Ungültige JSON-Ausgabe von: {command}"
            )

        return None


def _smart_attribute_normalized(
    data: dict[str, Any],
    attribute_ids: set[int],
    names: set[str] | None = None,
) -> int | None:
    attributes = (
        data.get("ata_smart_attributes", {})
        .get("table", [])
    )

    if not isinstance(attributes, list):
        return None

    normalized_names = {
        name.lower()
        for name in (names or set())
    }

    for attribute in attributes:
        if not isinstance(attribute, dict):
            continue

        attribute_id = attribute.get("id")
        attribute_name = str(
            attribute.get("name", "")
        ).lower()

        if (
            attribute_id not in attribute_ids
            and attribute_name not in normalized_names
        ):
            continue

        try:
            value = int(attribute.get("value"))
        except (TypeError, ValueError):
            continue

        if 0 <= value <= 100:
            return value

    return None


def _smart_attribute_raw(
    data: dict[str, Any],
    attribute_id: int,
) -> int:
    attributes = (
        data.get("ata_smart_attributes", {})
        .get("table", [])
    )

    if not isinstance(attributes, list):
        return 0

    for attribute in attributes:
        if not isinstance(attribute, dict):
            continue

        if attribute.get("id") != attribute_id:
            continue

        raw = attribute.get("raw", {})

        if not isinstance(raw, dict):
            return 0

        try:
            return int(raw.get("value", 0))
        except (TypeError, ValueError):
            return 0

    return 0


def _parse_smart_device(
    path: str,
    data: dict[str, Any],
) -> dict[str, Any]:
    passed = data.get(
        "smart_status",
        {},
    ).get("passed")

    warnings: list[str] = []
    critical = False

    if passed is False:
        critical = True
        warnings.append(
            "SMART overall health check failed"
        )

    protocol = str(
        data.get("device", {}).get(
            "protocol",
            "",
        )
    ).upper()

    temperature = data.get(
        "temperature",
        {},
    ).get("current")

    percentage_used = None
    wear_remaining_percent = None
    critical_warning = 0
    media_errors = 0

    if protocol == "NVME":
        nvme = data.get(
            "nvme_smart_health_information_log",
            {},
        )

        if isinstance(nvme, dict):
            try:
                critical_warning = int(
                    nvme.get(
                        "critical_warning",
                        0,
                    )
                )
            except (TypeError, ValueError):
                critical_warning = 0

            try:
                media_errors = int(
                    nvme.get(
                        "media_errors",
                        0,
                    )
                )
            except (TypeError, ValueError):
                media_errors = 0

            try:
                percentage_used = int(
                    nvme.get(
                        "percentage_used",
                        0,
                    )
                )

                wear_remaining_percent = max(
                    0,
                    min(
                        100,
                        100 - percentage_used,
                    ),
                )
            except (TypeError, ValueError):
                percentage_used = None
                wear_remaining_percent = None

            try:
                available_spare = int(
                    nvme.get(
                        "available_spare",
                        100,
                    )
                )
                spare_threshold = int(
                    nvme.get(
                        "available_spare_threshold",
                        0,
                    )
                )
            except (TypeError, ValueError):
                available_spare = 100
                spare_threshold = 0

            if critical_warning > 0:
                critical = True
                warnings.append(
                    "NVMe critical warning is active"
                )

            if media_errors > 0:
                warnings.append(
                    f"{media_errors} NVMe media error(s)"
                )

            if available_spare < spare_threshold:
                warnings.append(
                    "NVMe available spare is below threshold"
                )

    if protocol != "NVME":
        wear_remaining_percent = (
            _smart_attribute_normalized(
                data,
                {202, 231, 233},
                {
                    "Media_Wearout_Indicator",
                    "Percent_Lifetime_Remain",
                    "SSD_Life_Left",
                    "Remaining_Lifetime_Perc",
                },
            )
        )

    reallocated = _smart_attribute_raw(
        data,
        5,
    )
    reported_uncorrect = _smart_attribute_raw(
        data,
        187,
    )
    pending = _smart_attribute_raw(
        data,
        197,
    )
    offline_uncorrectable = _smart_attribute_raw(
        data,
        198,
    )
    crc_errors = _smart_attribute_raw(
        data,
        199,
    )

    if reallocated > 0:
        warnings.append(
            f"{reallocated} reallocated sector(s)"
        )

    if reported_uncorrect > 0:
        warnings.append(
            f"{reported_uncorrect} reported uncorrectable error(s)"
        )

    if pending > 0:
        warnings.append(
            f"{pending} pending sector(s)"
        )

    if offline_uncorrectable > 0:
        warnings.append(
            f"{offline_uncorrectable} offline uncorrectable sector(s)"
        )

    if crc_errors > 0:
        warnings.append(
            f"{crc_errors} interface CRC error(s)"
        )

    if critical:
        health = "critical"
    elif warnings:
        health = "warning"
    elif passed is True:
        health = "healthy"
    else:
        health = "unknown"

    return {
        "path": path,
        "model": data.get("model_name"),
        "serial": data.get("serial_number"),
        "protocol": protocol or None,
        "passed": passed,
        "health": health,
        "warnings": warnings,
        "temperature_celsius": temperature,
        "percentage_used": percentage_used,
        "wear_remaining_percent": wear_remaining_percent,
        "critical_warning": critical_warning,
        "media_errors": media_errors,
        "reallocated_sectors": reallocated,
        "reported_uncorrect": reported_uncorrect,
        "pending_sectors": pending,
        "offline_uncorrectable": offline_uncorrectable,
        "crc_errors": crc_errors,
    }


def _read_text_file(
    client: paramiko.SSHClient,
    path: str,
) -> str | None:
    safe_path = shlex.quote(path)

    output = _run_command(
        client,
        f"cat {safe_path} 2>/dev/null",
        required=False,
    )

    return output or None


def _read_first_existing_file(
    client: paramiko.SSHClient,
    paths: list[str],
) -> str | None:
    for path in paths:
        value = _read_text_file(client, path)

        if value:
            return value.strip()

    return None


def _parse_integer(value: Any) -> int | None:
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _parse_float(value: Any) -> float | None:
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _parse_os_release(output: str) -> dict[str, str]:
    result: dict[str, str] = {}

    for line in output.splitlines():
        if "=" not in line:
            continue

        key, value = line.split("=", 1)

        result[key.strip().lower()] = (
            value.strip().strip('"').strip("'")
        )

    return result


def _parse_lscpu(data: Any) -> dict[str, Any]:
    result: dict[str, Any] = {}

    if not isinstance(data, dict):
        return result

    entries = data.get("lscpu")

    if not isinstance(entries, list):
        return result

    values: dict[str, str] = {}

    for item in entries:
        if not isinstance(item, dict):
            continue

        field = str(item.get("field", "")).strip().rstrip(":")
        value = str(item.get("data", "")).strip()

        if field:
            values[field] = value

    result["architecture"] = values.get("Architecture")
    result["model_name"] = values.get("Model name")
    result["vendor"] = values.get("Vendor ID")
    result["sockets"] = _parse_integer(values.get("Socket(s)"))
    result["cores_per_socket"] = _parse_integer(
        values.get("Core(s) per socket")
    )
    result["threads_per_core"] = _parse_integer(
        values.get("Thread(s) per core")
    )
    result["logical_cpus"] = _parse_integer(values.get("CPU(s)"))
    result["numa_nodes"] = _parse_integer(
        values.get("NUMA node(s)")
    )

    min_mhz = values.get("CPU min MHz")
    max_mhz = values.get("CPU max MHz")

    result["minimum_mhz"] = _parse_float(min_mhz)
    result["maximum_mhz"] = _parse_float(max_mhz)

    sockets = result.get("sockets")
    cores_per_socket = result.get("cores_per_socket")

    if sockets and cores_per_socket:
        result["physical_cores"] = sockets * cores_per_socket
    else:
        result["physical_cores"] = None

    result["virtualization"] = values.get("Virtualization")
    result["hypervisor_vendor"] = values.get("Hypervisor vendor")
    result["cache"] = {
        "l1d": values.get("L1d"),
        "l1i": values.get("L1i"),
        "l2": values.get("L2"),
        "l3": values.get("L3"),
    }

    return result


def _parse_meminfo(output: str) -> dict[str, Any]:
    values: dict[str, int] = {}

    for line in output.splitlines():
        match = re.match(
            r"^([^:]+):\s+(\d+)(?:\s+kB)?$",
            line.strip(),
        )

        if not match:
            continue

        key = match.group(1)
        kilobytes = int(match.group(2))
        values[key] = kilobytes * 1024

    total = values.get("MemTotal", 0)
    available = values.get("MemAvailable", 0)
    free = values.get("MemFree", 0)
    buffers = values.get("Buffers", 0)
    cached = values.get("Cached", 0)
    swap_total = values.get("SwapTotal", 0)
    swap_free = values.get("SwapFree", 0)

    return {
        "total": total,
        "available": available,
        "used": max(0, total - available),
        "free": free,
        "buffers": buffers,
        "cached": cached,
        "swap_total": swap_total,
        "swap_free": swap_free,
        "swap_used": max(0, swap_total - swap_free),
    }


def _parse_loadavg(output: str) -> dict[str, float | None]:
    parts = output.split()

    return {
        "one_minute": _parse_float(parts[0])
        if len(parts) > 0
        else None,
        "five_minutes": _parse_float(parts[1])
        if len(parts) > 1
        else None,
        "fifteen_minutes": _parse_float(parts[2])
        if len(parts) > 2
        else None,
    }


def _parse_uptime(output: str) -> float | None:
    first = output.split()[0] if output.split() else None
    return _parse_float(first)


def _parse_df(output: str) -> list[dict[str, Any]]:
    filesystems: list[dict[str, Any]] = []

    lines = output.splitlines()

    for line in lines[1:]:
        parts = line.split(None, 6)

        if len(parts) < 7:
            continue

        filesystem, fstype, total, used, available, usage, target = (
            parts
        )

        filesystems.append(
            {
                "filesystem": filesystem,
                "type": fstype,
                "total": _parse_integer(total),
                "used": _parse_integer(used),
                "available": _parse_integer(available),
                "usage_percent": _parse_integer(
                    usage.rstrip("%")
                ),
                "mountpoint": target,
            }
        )

    return filesystems


def _parse_pci(output: str) -> list[dict[str, Any]]:
    devices: list[dict[str, Any]] = []

    for line in output.splitlines():
        line = line.strip()

        if not line:
            continue

        match = re.match(
            r"^(\S+)\s+(.+?):\s+(.+?)(?:\s+\(rev\s+([^)]+)\))?$",
            line,
        )

        if match:
            devices.append(
                {
                    "slot": match.group(1),
                    "class": match.group(2),
                    "device": match.group(3),
                    "revision": match.group(4),
                    "raw": line,
                }
            )
        else:
            devices.append(
                {
                    "slot": None,
                    "class": None,
                    "device": line,
                    "revision": None,
                    "raw": line,
                }
            )

    return devices


def _parse_usb(output: str) -> list[dict[str, Any]]:
    devices: list[dict[str, Any]] = []

    pattern = re.compile(
        r"^Bus\s+(\d+)\s+Device\s+(\d+):\s+"
        r"ID\s+([0-9A-Fa-f]{4}:[0-9A-Fa-f]{4})\s*(.*)$"
    )

    for line in output.splitlines():
        match = pattern.match(line.strip())

        if not match:
            continue

        devices.append(
            {
                "bus": match.group(1),
                "device_number": match.group(2),
                "usb_id": match.group(3),
                "description": match.group(4).strip(),
            }
        )

    return devices


def _parse_zpool_list(output: str) -> list[dict[str, Any]]:
    pools: list[dict[str, Any]] = []

    for line in output.splitlines():
        parts = line.split("\t")

        if len(parts) < 7:
            parts = line.split()

        if len(parts) < 7:
            continue

        pools.append(
            {
                "name": parts[0],
                "size": _parse_integer(parts[1]),
                "allocated": _parse_integer(parts[2]),
                "free": _parse_integer(parts[3]),
                "fragmentation_percent": _parse_integer(
                    parts[4].rstrip("%")
                ),
                "capacity_percent": _parse_integer(
                    parts[5].rstrip("%")
                ),
                "health": parts[6],
            }
        )

    return pools


def _parse_zfs_list(output: str) -> list[dict[str, Any]]:
    datasets: list[dict[str, Any]] = []

    for line in output.splitlines():
        parts = line.split("\t")

        if len(parts) < 6:
            parts = line.split(None, 5)

        if len(parts) < 6:
            continue

        datasets.append(
            {
                "name": parts[0],
                "type": parts[1],
                "used": _parse_integer(parts[2]),
                "available": _parse_integer(parts[3]),
                "referenced": _parse_integer(parts[4]),
                "mountpoint": parts[5],
            }
        )

    return datasets


def _parse_zpool_status(output: str) -> list[dict[str, Any]]:
    if not output:
        return []

    sections = re.split(
        r"(?=^\s*pool:\s+)",
        output,
        flags=re.MULTILINE,
    )

    statuses: list[dict[str, Any]] = []

    for section in sections:
        if not section.strip():
            continue

        pool_match = re.search(
            r"^\s*pool:\s+(.+)$",
            section,
            flags=re.MULTILINE,
        )

        if not pool_match:
            continue

        state_match = re.search(
            r"^\s*state:\s+(.+)$",
            section,
            flags=re.MULTILINE,
        )

        scan_match = re.search(
            r"^\s*scan:\s+(.+)$",
            section,
            flags=re.MULTILINE,
        )

        errors_match = re.search(
            r"^\s*errors:\s+(.+)$",
            section,
            flags=re.MULTILINE,
        )

        pool_name = pool_match.group(1).strip()

        read_errors = 0
        write_errors = 0
        checksum_errors = 0

        pool_error_match = re.search(
            (
                r"^\s*"
                + re.escape(pool_name)
                + r"\s+\S+\s+(\d+)\s+(\d+)\s+(\d+)\s*$"
            ),
            section,
            flags=re.MULTILINE,
        )

        if pool_error_match:
            read_errors = int(
                pool_error_match.group(1)
            )
            write_errors = int(
                pool_error_match.group(2)
            )
            checksum_errors = int(
                pool_error_match.group(3)
            )

        statuses.append(
            {
                "name": pool_name,
                "state": (
                    state_match.group(1).strip()
                    if state_match
                    else None
                ),
                "scan": (
                    scan_match.group(1).strip()
                    if scan_match
                    else None
                ),
                "errors": (
                    errors_match.group(1).strip()
                    if errors_match
                    else None
                ),
                "read_errors": read_errors,
                "write_errors": write_errors,
                "checksum_errors": checksum_errors,
                "raw_status": section.strip(),
            }
        )

    return statuses


def _parse_sensors(data: Any) -> list[dict[str, Any]]:
    sensors: list[dict[str, Any]] = []

    if not isinstance(data, dict):
        return sensors

    for chip_name, chip_data in data.items():
        if not isinstance(chip_data, dict):
            continue

        for sensor_name, sensor_data in chip_data.items():
            if not isinstance(sensor_data, dict):
                continue

            temperatures = {
                key: value
                for key, value in sensor_data.items()
                if key.endswith("_input")
                and isinstance(value, (int, float))
            }

            for key, value in temperatures.items():
                sensors.append(
                    {
                        "chip": chip_name,
                        "label": sensor_name,
                        "source": key,
                        "temperature_celsius": float(value),
                    }
                )

    return sensors


def _get_dmi_data(
    client: paramiko.SSHClient,
) -> dict[str, Any]:
    return {
        "manufacturer": _read_first_existing_file(
            client,
            [
                "/sys/class/dmi/id/sys_vendor",
            ],
        ),
        "product_name": _read_first_existing_file(
            client,
            [
                "/sys/class/dmi/id/product_name",
            ],
        ),
        "product_version": _read_first_existing_file(
            client,
            [
                "/sys/class/dmi/id/product_version",
            ],
        ),
        "product_serial": _read_first_existing_file(
            client,
            [
                "/sys/class/dmi/id/product_serial",
            ],
        ),
        "product_uuid": _read_first_existing_file(
            client,
            [
                "/sys/class/dmi/id/product_uuid",
            ],
        ),
        "board_manufacturer": _read_first_existing_file(
            client,
            [
                "/sys/class/dmi/id/board_vendor",
            ],
        ),
        "board_name": _read_first_existing_file(
            client,
            [
                "/sys/class/dmi/id/board_name",
            ],
        ),
        "board_version": _read_first_existing_file(
            client,
            [
                "/sys/class/dmi/id/board_version",
            ],
        ),
        "board_serial": _read_first_existing_file(
            client,
            [
                "/sys/class/dmi/id/board_serial",
            ],
        ),
        "bios_vendor": _read_first_existing_file(
            client,
            [
                "/sys/class/dmi/id/bios_vendor",
            ],
        ),
        "bios_version": _read_first_existing_file(
            client,
            [
                "/sys/class/dmi/id/bios_version",
            ],
        ),
        "bios_date": _read_first_existing_file(
            client,
            [
                "/sys/class/dmi/id/bios_date",
            ],
        ),
    }



def _parse_nut_mode(output: str) -> str | None:
    for raw_line in output.splitlines():
        line = raw_line.strip()

        if not line or line.startswith("#"):
            continue

        if not line.startswith("MODE="):
            continue

        return (
            line.split("=", 1)[1]
            .strip()
            .strip('"')
            .strip("'")
            .lower()
        )

    return None


def _parse_nut_monitor_targets(
    output: str,
) -> list[str]:
    targets: list[str] = []

    for raw_line in output.splitlines():
        line = raw_line.strip()

        if not line or line.startswith("#"):
            continue

        parts = line.split()

        if len(parts) < 2:
            continue

        if parts[0].upper() != "MONITOR":
            continue

        target = parts[1].strip()

        if (
            not target
            or "@" not in target
            or target in targets
        ):
            continue

        targets.append(target)

    return targets


def _parse_upsc_output(
    output: str,
) -> dict[str, str]:
    values: dict[str, str] = {}

    for raw_line in output.splitlines():
        line = raw_line.strip()

        if not line or ":" not in line:
            continue

        key, value = line.split(":", 1)

        key = key.strip()
        value = value.strip()

        if key:
            values[key] = value

    return values


def _collect_nut_data(
    client: paramiko.SSHClient,
) -> dict[str, Any]:
    nut_conf = _read_text_file(
        client,
        "/etc/nut/nut.conf",
    )

    if not nut_conf:
        return {
            "available": False,
            "ups": [],
        }

    if _parse_nut_mode(nut_conf) != "netclient":
        return {
            "available": False,
            "ups": [],
        }

    monitor_active = _run_command(
        client,
        "systemctl is-active nut-monitor 2>/dev/null",
        required=False,
    )

    if monitor_active.strip() != "active":
        return {
            "available": False,
            "ups": [],
        }

    upsmon_conf = _read_text_file(
        client,
        "/etc/nut/upsmon.conf",
    )

    if not upsmon_conf:
        return {
            "available": False,
            "ups": [],
        }

    targets = _parse_nut_monitor_targets(
        upsmon_conf
    )

    if not targets:
        return {
            "available": False,
            "ups": [],
        }

    ups_entries: list[dict[str, Any]] = []

    for target in targets:
        output = _run_command(
            client,
            f"upsc {shlex.quote(target)} 2>/dev/null",
            required=False,
            timeout=15,
        )

        values = _parse_upsc_output(output)

        if not values:
            continue

        ups_entries.append(
            {
                "target": target,
                "values": values,
            }
        )

    return {
        "available": bool(ups_entries),
        "ups": ups_entries,
    }

def collect_host_details(
    node: str,
    infrastructure_id: int,
) -> dict[str, Any]:
    client = _ssh_client(
        node,
        infrastructure_id,
    )

    try:
        hostname = _run_command(
            client,
            "hostname",
            required=False,
        )

        fqdn = _run_command(
            client,
            "hostname --fqdn 2>/dev/null || hostname",
            required=False,
        )

        kernel = _run_command(
            client,
            "uname -r",
            required=False,
        )

        architecture = _run_command(
            client,
            "uname -m",
            required=False,
        )

        pve_version = _run_command(
            client,
            "pveversion 2>/dev/null",
            required=False,
        )

        pve_packages = _run_command(
            client,
            "pveversion -v 2>/dev/null",
            required=False,
        )

        os_release_output = _run_command(
            client,
            "cat /etc/os-release 2>/dev/null",
            required=False,
        )

        uptime_output = _run_command(
            client,
            "cat /proc/uptime",
            required=False,
        )

        load_output = _run_command(
            client,
            "cat /proc/loadavg",
            required=False,
        )

        boot_time = _run_command(
            client,
            "uptime -s 2>/dev/null",
            required=False,
        )

        current_time = _run_command(
            client,
            "date --iso-8601=seconds",
            required=False,
        )

        virtualization = _run_command(
            client,
            "systemd-detect-virt 2>/dev/null || true",
            required=False,
        )

        lscpu_data = _run_json(
            client,
            "lscpu -J 2>/dev/null",
            required=False,
        )

        meminfo_output = _run_command(
            client,
            "cat /proc/meminfo",
            required=False,
        )

        filesystems_output = _run_command(
            client,
            (
                "df -B1 -P -T "
                "-x tmpfs -x devtmpfs -x squashfs "
                "-x overlay 2>/dev/null"
            ),
            required=False,
        )

        block_devices = _run_json(
            client,
            (
                "lsblk -J -b "
                "-o NAME,KNAME,PATH,TYPE,SIZE,MODEL,VENDOR,SERIAL,"
                "ROTA,TRAN,FSTYPE,FSVER,LABEL,UUID,MOUNTPOINTS,"
                "PKNAME,STATE,HOTPLUG,RM,RO 2>/dev/null"
            ),
            required=False,
        )

        smart_devices: list[dict[str, Any]] = []

        if isinstance(block_devices, dict):
            for device in block_devices.get(
                "blockdevices",
                [],
            ):
                if not isinstance(device, dict):
                    continue

                if device.get("type") != "disk":
                    continue

                device_path = str(
                    device.get("path", "")
                ).strip()

                device_name = str(
                    device.get("name", "")
                ).strip()

                if not device_path:
                    continue

                # Ignore virtual/logical block devices such
                # as ZFS zvols, loop and device-mapper disks.
                if (
                    device_name.startswith("zd")
                    or device_name.startswith("loop")
                    or device_name.startswith("dm-")
                    or device_name.startswith("md")
                ):
                    continue

                smart_data = _run_json(
                    client,
                    (
                        "smartctl -a -j "
                        + shlex.quote(device_path)
                        + " 2>/dev/null || true"
                    ),
                    required=False,
                )

                if not isinstance(
                    smart_data,
                    dict,
                ):
                    continue

                smart_devices.append(
                    _parse_smart_device(
                        device_path,
                        smart_data,
                    )
                )

        pci_output = _run_command(
            client,
            "lspci -Dnn 2>/dev/null",
            required=False,
        )

        usb_output = _run_command(
            client,
            "lsusb 2>/dev/null",
            required=False,
        )

        sensors_data = _run_json(
            client,
            "sensors -j 2>/dev/null",
            required=False,
        )

        nut_data = _collect_nut_data(
            client,
        )

        zpool_list_output = _run_command(
            client,
            (
                "zpool list -Hp "
                "-o name,size,alloc,free,frag,cap,health "
                "2>/dev/null"
            ),
            required=False,
        )

        zpool_status_output = _run_command(
            client,
            "zpool status -P 2>/dev/null",
            required=False,
            timeout=60,
        )

        zfs_list_output = _run_command(
            client,
            (
                "zfs list -Hp "
                "-o name,type,used,available,refer,mountpoint "
                "2>/dev/null"
            ),
            required=False,
        )

        root_usage = next(
            (
                item
                for item in _parse_df(filesystems_output)
                if item.get("mountpoint") == "/"
            ),
            None,
        )

        filesystems = _parse_df(filesystems_output)
        zpool_list = _parse_zpool_list(zpool_list_output)
        zpool_status = _parse_zpool_status(
            zpool_status_output
        )

        status_by_name = {
            item["name"]: item
            for item in zpool_status
        }

        zfs_pools = []

        for pool in zpool_list:
            status = status_by_name.get(
                str(pool.get("name")),
                {},
            )

            zfs_pools.append(
                {
                    **pool,
                    "state": status.get("state"),
                    "scan": status.get("scan"),
                    "errors": status.get("errors"),
                    "read_errors": status.get(
                        "read_errors",
                        0,
                    ),
                    "write_errors": status.get(
                        "write_errors",
                        0,
                    ),
                    "checksum_errors": status.get(
                        "checksum_errors",
                        0,
                    ),
                    "raw_status": status.get("raw_status"),
                }
            )

        return {
            "node": node,
            "overview": {
                "hostname": hostname or node,
                "fqdn": fqdn or hostname or node,
                "kernel": kernel or None,
                "architecture": architecture or None,
                "pve_version": pve_version or None,
                "os": _parse_os_release(
                    os_release_output
                ),
                "uptime_seconds": _parse_uptime(
                    uptime_output
                ),
                "boot_time": boot_time or None,
                "current_time": current_time or None,
                "load": _parse_loadavg(load_output),
                "virtualization": virtualization or None,
                "root_filesystem": root_usage,
            },
            "hardware": {
                "system": _get_dmi_data(client),
                "cpu": _parse_lscpu(lscpu_data),
                "memory": _parse_meminfo(
                    meminfo_output
                ),
            },
            "storage": {
                "filesystems": filesystems,
                "block_devices": (
                    block_devices.get("blockdevices", [])
                    if isinstance(block_devices, dict)
                    else []
                ),
                "smart_devices": smart_devices,
            },
            "pci": {
                "devices": _parse_pci(pci_output),
                "count": len(_parse_pci(pci_output)),
            },
            "usb": {
                "devices": _parse_usb(usb_output),
                "count": len(_parse_usb(usb_output)),
            },
            "temperatures": {
                "available": bool(sensors_data),
                "sensors": _parse_sensors(sensors_data),
            },
            "ups": nut_data,
            "zfs": {
                "available": bool(
                    zfs_pools
                    or zfs_list_output
                    or zpool_status_output
                ),
                "pools": zfs_pools,
                "datasets": _parse_zfs_list(
                    zfs_list_output
                ),
            },
            "software": {
                "pve_packages_raw": pve_packages.splitlines()
                if pve_packages
                else [],
            },
        }

    finally:
        client.close()
