from __future__ import annotations

from dataclasses import (
    asdict,
    dataclass,
    field,
)
from datetime import datetime, timezone
from threading import Lock


@dataclass
class PackageUpdate:
    name: str
    repository: str
    current_version: str
    available_version: str


@dataclass
class NodeUpdateStatus:
    node: str
    infrastructure_id: int
    checked_at: str | None = None
    updates: int = 0
    reboot_required: bool = False
    kernel_update: bool = False
    packages: list[PackageUpdate] = field(
        default_factory=list
    )

    def public(self) -> dict:
        return {
            "node": self.node,
            "infrastructure_id":
                self.infrastructure_id,
            "checked_at": self.checked_at,
            "updates": self.updates,
            "reboot_required":
                self.reboot_required,
            "kernel_update":
                self.kernel_update,
            "packages": [
                asdict(package)
                for package in self.packages
            ],
        }


class UpdateCache:
    def __init__(self) -> None:
        self._lock = Lock()

        self._nodes: dict[
            tuple[int, str],
            NodeUpdateStatus,
        ] = {}

    @staticmethod
    def _key(
        infrastructure_id: int,
        node: str,
    ) -> tuple[int, str]:
        return (
            infrastructure_id,
            node,
        )

    def set(
        self,
        status: NodeUpdateStatus,
    ) -> None:
        status.checked_at = datetime.now(
            timezone.utc
        ).isoformat()

        with self._lock:
            self._nodes[
                self._key(
                    status.infrastructure_id,
                    status.node,
                )
            ] = status

    def get(
        self,
        node: str,
        infrastructure_id: int,
    ):
        with self._lock:
            return self._nodes.get(
                self._key(
                    infrastructure_id,
                    node,
                )
            )

    def list(self):
        with self._lock:
            return [
                item.public()
                for item in sorted(
                    self._nodes.values(),
                    key=lambda x: (
                        x.infrastructure_id,
                        x.node,
                    ),
                )
            ]


update_cache = UpdateCache()
