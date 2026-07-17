"""Project name validation."""

from __future__ import annotations

import re

NAME_RE = re.compile(r"^[a-z][a-z0-9_]{2,31}$")


def validate_project_name(name: str) -> str:
    if not NAME_RE.match(name):
        raise ValueError(
            "project name must match [a-z][a-z0-9_]{2,31} (e.g. my_app)"
        )
    return name


def to_upper(name: str) -> str:
    return name.upper()


def component_name(name: str) -> str:
    return name.lower()
