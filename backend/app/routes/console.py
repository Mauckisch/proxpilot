from __future__ import annotations

import asyncio
from dataclasses import dataclass
import logging
import secrets
import ssl
import time
from urllib.parse import urlencode, urlparse
from typing import Literal

from fastapi import (
    APIRouter,
    HTTPException,
    Request,
    WebSocket,
    WebSocketDisconnect,
)
from pydantic import BaseModel, Field
from websockets.asyncio.client import connect
from websockets.exceptions import (
    ConnectionClosed,
    InvalidHandshake,
)

from ..auth import (
    SESSION_COOKIE_NAME,
    read_session_token,
)
from ..config import get_settings
from ..proxmox import (
    ProxmoxClient,
    ProxmoxError,
)


logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api/guest",
    tags=["console"],
)

client = ProxmoxClient()

CONSOLE_SESSION_TTL = 60


@dataclass
class ConsoleSession:
    user_id: int
    node: str
    guest_type: Literal["qemu", "lxc"]
    vmid: int
    ticket: str
    port: int
    expires_at: float


console_sessions: dict[str, ConsoleSession] = {}


class ConsoleTicketRequest(BaseModel):
    node: str = Field(
        min_length=1,
        max_length=64,
        pattern=r"^[A-Za-z0-9._-]+$",
    )
    guest_type: Literal["qemu", "lxc"]
    vmid: int = Field(gt=0)


def require_operator_or_admin(request: Request) -> None:
    session = getattr(
        request.state,
        "session",
        None,
    )

    if session is None:
        raise HTTPException(
            status_code=401,
            detail="Authentication required.",
        )

    if session.role not in {
        "admin",
        "operator",
    }:
        raise HTTPException(
            status_code=403,
            detail=(
                "Operator or administrator "
                "permissions required."
            ),
        )


def cleanup_console_sessions() -> None:
    now = time.monotonic()

    expired_ids = [
        console_id
        for console_id, session in console_sessions.items()
        if session.expires_at <= now
    ]

    for console_id in expired_ids:
        console_sessions.pop(console_id, None)


def build_proxmox_websocket_url(
    node: str,
    guest_type: Literal["qemu", "lxc"],
    vmid: int,
    port: int,
    ticket: str,
) -> tuple[str, ssl.SSLContext | None]:
    node_host = client.node_host(node)

    if not node_host:
        raise ProxmoxError(
            f"No host mapping is configured for node {node}."
        )

    endpoints = client.s.endpoints

    if not endpoints:
        raise ProxmoxError(
            "No Proxmox API endpoints are configured."
        )

    endpoint = urlparse(endpoints[0])

    default_scheme = endpoint.scheme or "https"
    default_port = endpoint.port or (
        443 if default_scheme == "https" else 80
    )

    if "://" in node_host:
        parsed_node = urlparse(node_host)
        scheme = parsed_node.scheme or default_scheme
        hostname = parsed_node.hostname
        api_port = parsed_node.port or default_port
    else:
        scheme = default_scheme
        hostname = node_host
        api_port = default_port

    if not hostname:
        raise ProxmoxError(
            f"Invalid host mapping for node {node}."
        )

    websocket_scheme = (
        "wss"
        if scheme == "https"
        else "ws"
    )

    query = urlencode(
        {
            "port": port,
            "vncticket": ticket,
        }
    )

    websocket_url = (
        f"{websocket_scheme}://{hostname}:{api_port}"
        f"/api2/json/nodes/{node}/{guest_type}/{vmid}"
        f"/vncwebsocket?{query}"
    )

    ssl_context: ssl.SSLContext | None = None

    if websocket_scheme == "wss":
        if client.s.pve_verify_ssl:
            ssl_context = ssl.create_default_context()
        else:
            ssl_context = ssl._create_unverified_context()

    return websocket_url, ssl_context


def read_admin_websocket_session(
    websocket: WebSocket,
):
    settings = get_settings()

    session = read_session_token(
        token=websocket.cookies.get(
            SESSION_COOKIE_NAME,
        ),
        secret=settings.proxpilot_session_secret,
        max_age=settings.proxpilot_session_max_age,
    )

    if (
        session is None
        or session.role not in {
            "admin",
            "operator",
        }
    ):
        return None

    return session


@router.post("/console")
async def create_console_ticket(
    console_request: ConsoleTicketRequest,
    request: Request,
):
    require_operator_or_admin(request)
    cleanup_console_sessions()

    try:
        ticket_data = await client.create_console_ticket(
            node=console_request.node,
            guest_type=console_request.guest_type,
            vmid=console_request.vmid,
        )
    except ProxmoxError as exc:
        raise HTTPException(
            status_code=502,
            detail=str(exc),
        ) from exc

    console_id = secrets.token_urlsafe(32)

    console_sessions[console_id] = ConsoleSession(
        user_id=int(request.state.session.user_id),
        node=console_request.node,
        guest_type=console_request.guest_type,
        vmid=console_request.vmid,
        ticket=ticket_data["ticket"],
        port=int(ticket_data["port"]),
        expires_at=(
            time.monotonic()
            + CONSOLE_SESSION_TTL
        ),
    )

    from ..audit import write_request_audit_event

    write_request_audit_event(
        request,
        action="console.open",
        result="success",
        severity="info",
        target_type=console_request.guest_type,
        target=(
            f"{console_request.guest_type.upper()} "
            f"{console_request.vmid}"
        ),
        node=console_request.node,
        details={
            "vmid": console_request.vmid,
            "node": console_request.node,
        },
    )

    return {
        "ok": True,
        "node": console_request.node,
        "guest_type": console_request.guest_type,
        "vmid": console_request.vmid,
        "console_id": console_id,
        "websocket_path": (
            "/api/guest/console/websocket"
            f"?console_id={console_id}"
        ),
        # Proxmox uses the short-lived VNC ticket as the
        # password during the RFB security handshake.
        # It is delivered only to an authenticated admin
        # over HTTPS and is not the permanent API token.
        "vnc_password": ticket_data["ticket"],
        "expires_in": CONSOLE_SESSION_TTL,
    }


@router.websocket("/console/websocket")
async def console_websocket(
    websocket: WebSocket,
    console_id: str,
):
    authenticated_session = (
        read_admin_websocket_session(websocket)
    )

    if authenticated_session is None:
        await websocket.close(code=1008)
        return

    cleanup_console_sessions()

    console_session = console_sessions.pop(
        console_id,
        None,
    )

    if console_session is None:
        await websocket.close(code=1008)
        return

    if (
        console_session.expires_at <= time.monotonic()
        or console_session.user_id
        != int(authenticated_session.user_id)
    ):
        await websocket.close(code=1008)
        return

    try:
        upstream_url, ssl_context = (
            build_proxmox_websocket_url(
                node=console_session.node,
                guest_type=console_session.guest_type,
                vmid=console_session.vmid,
                port=console_session.port,
                ticket=console_session.ticket,
            )
        )

        async with connect(
            upstream_url,
            additional_headers=client.headers,
            subprotocols=["binary"],
            compression=None,
            proxy=None,
            open_timeout=15,
            close_timeout=5,
            ping_interval=20,
            ping_timeout=20,
            max_size=None,
            ssl=ssl_context,
        ) as upstream:
            requested_protocols = (
                websocket.scope.get(
                    "subprotocols",
                    [],
                )
            )

            await websocket.accept(
                subprotocol=(
                    "binary"
                    if "binary" in requested_protocols
                    else None
                )
            )

            async def browser_to_proxmox() -> None:
                try:
                    while True:
                        message = await websocket.receive()

                        if (
                            message["type"]
                            == "websocket.disconnect"
                        ):
                            return

                        binary_data = message.get("bytes")
                        text_data = message.get("text")

                        if binary_data is not None:
                            await upstream.send(binary_data)
                        elif text_data is not None:
                            await upstream.send(text_data)

                except WebSocketDisconnect:
                    return

            async def proxmox_to_browser() -> None:
                try:
                    async for message in upstream:
                        if isinstance(message, bytes):
                            await websocket.send_bytes(
                                message
                            )
                        else:
                            await websocket.send_text(
                                message
                            )

                except ConnectionClosed:
                    return

            tasks = {
                asyncio.create_task(
                    browser_to_proxmox()
                ),
                asyncio.create_task(
                    proxmox_to_browser()
                ),
            }

            done, pending = await asyncio.wait(
                tasks,
                return_when=asyncio.FIRST_COMPLETED,
            )

            for task in pending:
                task.cancel()

            await asyncio.gather(
                *pending,
                return_exceptions=True,
            )

            for task in done:
                exception = task.exception()

                if exception is not None:
                    raise exception

    except (
        InvalidHandshake,
        OSError,
        TimeoutError,
        ProxmoxError,
    ) as exc:
        logger.warning(
            "Unable to establish Proxmox console "
            "WebSocket for node=%s vmid=%s: %s",
            console_session.node,
            console_session.vmid,
            exc,
        )

        try:
            await websocket.close(code=1011)
        except RuntimeError:
            pass

    except Exception:
        logger.exception(
            "Unexpected console WebSocket error "
            "for node=%s vmid=%s",
            console_session.node,
            console_session.vmid,
        )

        try:
            await websocket.close(code=1011)
        except RuntimeError:
            pass
