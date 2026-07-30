from __future__ import annotations

import re

from .update_cache import PackageUpdate

ANSI_RE = re.compile(r"\x1b\[[0-9;?]*[A-Za-z]")
LINE_RE = re.compile(
    r"^(?P<name>[^/]+)/(?P<repo>\S+)\s+"
    r"(?P<available>\S+).*?"
    r"\[upgradable from:\s*(?P<current>[^\]]+)\]"
)


def parse_packages(lines: list[str]) -> list[PackageUpdate]:
    packages: list[PackageUpdate] = []

    for line in lines:
        clean = ANSI_RE.sub("", line).strip()

        if "/" not in clean:
            continue

        match = LINE_RE.search(clean)

        if not match:
            continue

        packages.append(
            PackageUpdate(
                name=match.group("name"),
                repository=match.group("repo"),
                current_version=match.group("current"),
                available_version=match.group("available"),
            )
        )

    packages.sort(key=lambda package: package.name.lower())

    return packages
