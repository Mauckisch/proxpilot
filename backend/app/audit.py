from __future__ import annotations

import json
from datetime import UTC, datetime
from typing import Any

from fastapi import Request

from .database import get_connection


def get_client_ip(
    request: Request | None,
) -> str | None:
    if request is None:
        return None

    forwarded_for = request.headers.get(
        "x-forwarded-for"
    )

    if forwarded_for:
        return forwarded_for.split(",", 1)[0].strip()

    real_ip = request.headers.get(
        "x-real-ip"
    )

    if real_ip:
        return real_ip.strip()

    if request.client is not None:
        return request.client.host

    return None


def write_audit_event(
    *,
    action: str,
    result: str = "success",
    severity: str = "info",
    request: Request | None = None,
    user_id: int | None = None,
    username: str | None = None,
    role: str | None = None,
    source: str | None = None,
    target_type: str | None = None,
    target: str | None = None,
    node: str | None = None,
    infrastructure_id: int | None = None,
    ip_address: str | None = None,
    duration_ms: int | None = None,
    details: dict[str, Any] | str | None = None,
) -> int:
    if result not in {
        "success",
        "failed",
    }:
        raise ValueError(
            "Invalid audit result."
        )

    if severity not in {
        "info",
        "warning",
        "error",
    }:
        raise ValueError(
            "Invalid audit severity."
        )

    if isinstance(details, dict):
        details_text = json.dumps(
            details,
            ensure_ascii=False,
            separators=(",", ":"),
        )
    else:
        details_text = details

    with get_connection() as connection:
        cursor = connection.execute(
            """
            INSERT INTO audit_log (
                created_at,
                user_id,
                username,
                role,
                source,
                ip_address,
                action,
                target_type,
                target,
                node,
                infrastructure_id,
                result,
                severity,
                duration_ms,
                details
            )
            VALUES (
                ?, ?, ?, ?, ?, ?, ?, ?,
                ?, ?, ?, ?, ?, ?, ?
            )
            """,
            (
                datetime.now(UTC).isoformat(),
                user_id,
                username,
                role,
                source,
                (
                    ip_address
                    if ip_address is not None
                    else get_client_ip(request)
                ),
                action,
                target_type,
                target,
                node,
                infrastructure_id,
                result,
                severity,
                duration_ms,
                details_text,
            ),
        )

        connection.commit()

        return int(cursor.lastrowid)


def write_request_audit_event(
    request: Request,
    *,
    action: str,
    result: str = "success",
    severity: str = "info",
    target_type: str | None = None,
    target: str | None = None,
    node: str | None = None,
    infrastructure_id: int | None = None,
    duration_ms: int | None = None,
    details: dict[str, Any] | str | None = None,
) -> int:
    session = getattr(
        request.state,
        "session",
        None,
    )

    return write_audit_event(
        action=action,
        result=result,
        severity=severity,
        request=request,
        user_id=(
            session.user_id
            if session is not None
            else None
        ),
        username=(
            session.username
            if session is not None
            else None
        ),
        role=(
            session.role
            if session is not None
            else None
        ),
        source=(
            session.source
            if session is not None
            else None
        ),
        target_type=target_type,
        target=target,
        node=node,
        infrastructure_id=infrastructure_id,
        duration_ms=duration_ms,
        details=details,
    )


def list_audit_events(
    *,
    limit: int = 100,
    offset: int = 0,
    usernames: list[str] | None = None,
    roles: list[str] | None = None,
    sources: list[str] | None = None,
    actions: list[str] | None = None,
    results: list[str] | None = None,
    severities: list[str] | None = None,
    nodes: list[str] | None = None,
    infrastructure_ids: list[int] | None = None,
    target_types: list[str] | None = None,
    search: str | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
) -> tuple[list[dict[str, Any]], int]:
    conditions: list[str] = []
    parameters: list[Any] = []

    def add_multi_filter(
        column: str,
        values: list[str] | None,
    ) -> None:
        if not values:
            return

        normalized = [
            value.strip()
            for value in values
            if value.strip()
        ]

        if not normalized:
            return

        placeholders = ",".join(
            "?"
            for _ in normalized
        )

        conditions.append(
            f"{column} IN ({placeholders})"
        )

        parameters.extend(normalized)

    add_multi_filter(
        "username",
        usernames,
    )

    add_multi_filter(
        "role",
        roles,
    )

    add_multi_filter(
        "source",
        sources,
    )

    add_multi_filter(
        "action",
        actions,
    )

    add_multi_filter(
        "result",
        results,
    )

    add_multi_filter(
        "severity",
        severities,
    )

    add_multi_filter(
        "node",
        nodes,
    )

    if infrastructure_ids:
        normalized_ids = [
            int(value)
            for value in infrastructure_ids
            if int(value) > 0
        ]

        if normalized_ids:
            placeholders = ",".join(
                "?"
                for _ in normalized_ids
            )

            conditions.append(
                f"infrastructure_id IN ({placeholders})"
            )

            parameters.extend(normalized_ids)

    add_multi_filter(
        "target_type",
        target_types,
    )

    if search:
        conditions.append(
            """
            (
                username LIKE ?
                OR action LIKE ?
                OR target LIKE ?
                OR node LIKE ?
                OR ip_address LIKE ?
                OR details LIKE ?
            )
            """
        )

        search_value = (
            f"%{search.strip()}%"
        )

        parameters.extend(
            [search_value] * 6
        )

    if date_from:
        conditions.append(
            "created_at >= ?"
        )
        parameters.append(
            date_from
        )

    if date_to:
        conditions.append(
            "created_at <= ?"
        )
        parameters.append(
            date_to
        )

    where_clause = ""

    if conditions:
        where_clause = (
            "WHERE "
            + " AND ".join(
                conditions
            )
        )

    with get_connection() as connection:
        total_row = connection.execute(
            f"""
            SELECT COUNT(*) AS total
            FROM audit_log
            {where_clause}
            """,
            parameters,
        ).fetchone()

        rows = connection.execute(
            f"""
            SELECT
                id,
                created_at,
                user_id,
                username,
                role,
                source,
                ip_address,
                action,
                target_type,
                target,
                node,
                infrastructure_id,
                result,
                severity,
                duration_ms,
                details
            FROM audit_log
            {where_clause}
            ORDER BY id DESC
            LIMIT ?
            OFFSET ?
            """,
            [
                *parameters,
                limit,
                offset,
            ],
        ).fetchall()

    events: list[dict[str, Any]] = []

    for row in rows:
        event = dict(row)

        details_value = event.get(
            "details"
        )

        if details_value:
            try:
                event["details"] = (
                    json.loads(
                        details_value
                    )
                )
            except (
                json.JSONDecodeError,
                TypeError,
            ):
                pass

        events.append(event)

    return (
        events,
        int(
            total_row["total"]
            if total_row
            else 0
        ),
    )

def get_audit_filter_values(
    *,
    usernames: list[str] | None = None,
    roles: list[str] | None = None,
    sources: list[str] | None = None,
    actions: list[str] | None = None,
    results: list[str] | None = None,
    severities: list[str] | None = None,
    nodes: list[str] | None = None,
    infrastructure_ids: list[int] | None = None,
    target_types: list[str] | None = None,
    search: str | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
) -> dict[str, list[str]]:
    facets = {
        "usernames": "username",
        "roles": "role",
        "sources": "source",
        "actions": "action",
        "results": "result",
        "severities": "severity",
        "nodes": "node",
        "target_types": "target_type",
    }

    active_filters = {
        "usernames": usernames,
        "roles": roles,
        "sources": sources,
        "actions": actions,
        "results": results,
        "severities": severities,
        "nodes": nodes,
        "target_types": target_types,
    }

    result: dict[str, list[str]] = {}

    def add_multi_filter(
        conditions: list[str],
        parameters: list[Any],
        column: str,
        values: list[str] | None,
    ) -> None:
        if not values:
            return

        normalized = [
            value.strip()
            for value in values
            if value.strip()
        ]

        if not normalized:
            return

        placeholders = ",".join(
            "?"
            for _ in normalized
        )

        conditions.append(
            f"{column} IN ({placeholders})"
        )

        parameters.extend(normalized)

    def add_infrastructure_filter(
        conditions: list[str],
        parameters: list[Any],
    ) -> None:
        if not infrastructure_ids:
            return

        normalized_ids = [
            int(value)
            for value in infrastructure_ids
            if int(value) > 0
        ]

        if not normalized_ids:
            return

        placeholders = ",".join(
            "?"
            for _ in normalized_ids
        )

        conditions.append(
            f"infrastructure_id IN ({placeholders})"
        )

        parameters.extend(
            normalized_ids
        )

    with get_connection() as connection:
        for facet_name, facet_column in facets.items():
            conditions: list[str] = []
            parameters: list[Any] = []

            # Alle anderen Facetten berücksichtigen.
            # Die eigene Facette wird bewusst ausgelassen,
            # damit innerhalb eines Feldes weiterhin mehrere
            # Werte per ODER gewählt werden können.
            for filter_name, values in active_filters.items():
                if filter_name == facet_name:
                    continue

                add_multi_filter(
                    conditions,
                    parameters,
                    facets[filter_name],
                    values,
                )

            add_infrastructure_filter(
                conditions,
                parameters,
            )

            if search:
                conditions.append(
                    """
                    (
                        username LIKE ?
                        OR action LIKE ?
                        OR target LIKE ?
                        OR node LIKE ?
                        OR ip_address LIKE ?
                        OR details LIKE ?
                    )
                    """
                )

                search_value = (
                    f"%{search.strip()}%"
                )

                parameters.extend(
                    [search_value] * 6
                )

            if date_from:
                conditions.append(
                    "created_at >= ?"
                )
                parameters.append(
                    date_from
                )

            if date_to:
                conditions.append(
                    "created_at <= ?"
                )
                parameters.append(
                    date_to
                )

            where_parts = [
                f"{facet_column} IS NOT NULL",
                f"{facet_column} != ''",
                *conditions,
            ]

            where_clause = (
                "WHERE "
                + " AND ".join(
                    where_parts
                )
            )

            rows = connection.execute(
                f"""
                SELECT DISTINCT {facet_column}
                FROM audit_log
                {where_clause}
                ORDER BY {facet_column}
                """,
                parameters,
            ).fetchall()

            result[facet_name] = [
                str(row[facet_column])
                for row in rows
            ]

    return result

def purge_expired_audit_events(
    retention_days: int,
) -> int:
    retention_days = max(
        1,
        int(retention_days),
    )

    with get_connection() as connection:
        cursor = connection.execute(
            """
            DELETE FROM audit_log
            WHERE created_at < datetime(
                'now',
                ?
            )
            """,
            (
                f"-{retention_days} days",
            ),
        )

        connection.commit()

        return cursor.rowcount


def clear_audit_events() -> int:
    with get_connection() as connection:
        cursor = connection.execute(
            """
            DELETE FROM audit_log
            """
        )

        connection.commit()

        return cursor.rowcount



def get_audit_summary() -> dict[str, Any]:
    with get_connection() as connection:
        row = connection.execute(
            """
            SELECT
                COUNT(*) AS total,
                MIN(created_at) AS oldest_entry,
                MAX(created_at) AS newest_entry,
                SUM(
                    CASE
                        WHEN result = 'failed'
                        THEN 1
                        ELSE 0
                    END
                ) AS failed_count,
                SUM(
                    CASE
                        WHEN severity = 'warning'
                        THEN 1
                        ELSE 0
                    END
                ) AS warning_count,
                SUM(
                    CASE
                        WHEN severity = 'error'
                        THEN 1
                        ELSE 0
                    END
                ) AS error_count
            FROM audit_log
            """
        ).fetchone()

    if row is None:
        return {
            "total": 0,
            "oldest_entry": None,
            "newest_entry": None,
            "failed_count": 0,
            "warning_count": 0,
            "error_count": 0,
        }

    return {
        "total": int(
            row["total"] or 0
        ),
        "oldest_entry":
            row["oldest_entry"],
        "newest_entry":
            row["newest_entry"],
        "failed_count": int(
            row["failed_count"] or 0
        ),
        "warning_count": int(
            row["warning_count"] or 0
        ),
        "error_count": int(
            row["error_count"] or 0
        ),
    }
