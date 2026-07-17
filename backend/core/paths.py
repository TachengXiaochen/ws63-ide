"""Path helpers for WSL / Windows hybrid environment."""

from __future__ import annotations

import os
import subprocess
from typing import List

BACKEND_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
IDE_ROOT = os.path.dirname(BACKEND_ROOT)
THIRD_PARTY_DIR = os.path.join(IDE_ROOT, "third_party")
CONFIG_DIR = os.path.join(BACKEND_ROOT, "config")


def is_wsl() -> bool:
    if not os.path.exists("/proc/version"):
        return False
    with open("/proc/version", encoding="utf-8", errors="ignore") as fp:
        return "microsoft" in fp.read().lower()


def wsl_to_win_path(path: str) -> str:
    if not path.startswith("/"):
        return path.replace("/", "\\")
    result = subprocess.run(["wslpath", "-w", path], capture_output=True, text=True, check=False)
    if result.returncode == 0:
        return result.stdout.strip()
    return path


def repo_root_from_sdk(sdk_path: str) -> str:
    """SDK lives in fbb_ws63/src; repo root is one level up."""
    return os.path.abspath(os.path.join(sdk_path, ".."))


def ws63flash_candidates(sdk_path: str = "") -> List[str]:
    """Search order: bundled next to backend, repo third_party, SDK sibling tools."""
    names = [
        os.path.join("ws63flash-0.3.1", "ws63flash.exe"),
        os.path.join("ws63flash-0.3.1", "ws63flash"),
    ]
    roots = [
        os.path.join(IDE_ROOT, "third_party"),
        os.path.join(BACKEND_ROOT, "..", "third_party"),
        os.path.join(IDE_ROOT, "..", "third_party"),
    ]
    if sdk_path:
        roots.append(
            os.path.join(sdk_path, "..", "tools", "ws63-ide", "third_party")
        )
    out: List[str] = []
    seen = set()
    for root in roots:
        root = os.path.abspath(root)
        for name in names:
            p = os.path.abspath(os.path.join(root, name))
            if p not in seen:
                seen.add(p)
                out.append(p)
    return out


def resolve_ws63flash(sdk_path: str = "") -> str:
    for p in ws63flash_candidates(sdk_path):
        if os.path.isfile(p):
            return p
    raise FileNotFoundError(
        "ws63flash not found (checked extension/third_party and tools/ws63-ide/third_party)"
    )
