"""Detect Windows python.exe from WSL for COM port proxy."""

from __future__ import annotations

import glob
import os
from typing import List


def detect_win_python(explicit: str = "") -> str:
    if explicit and os.path.isfile(explicit):
        return explicit
    env = (os.environ.get("WS63_WIN_PYTHON") or "").strip()
    if env and os.path.isfile(env):
        return env

    patterns: List[str] = [
        "/mnt/c/Users/*/AppData/Local/Programs/Python/Python3*/python.exe",
        "/mnt/c/Users/*/AppData/Local/Programs/Python/Python3*/python3.exe",
        "/mnt/c/Program Files/Python3*/python.exe",
        "/mnt/c/Python3*/python.exe",
    ]
    found: List[str] = []
    for pat in patterns:
        found.extend(sorted(glob.glob(pat)))
    # Prefer newest-looking path (higher version folder name sorts later often)
    for path in reversed(found):
        if os.path.isfile(path):
            return path
    return ""


def com_port_help(port: str, win_python: str, *, wsl: bool) -> str:
    if wsl:
        return (
            f"Cannot open Windows port {port} from WSL without a Windows Python proxy.\n"
            "Fix options:\n"
            "  1) WS63 Settings → Win Python → pick C:\\...\\python.exe "
            f"(auto tried: {win_python or 'none'})\n"
            "  2) WS63: Select Port after Doctor sees windows COM devices\n"
            "  3) Close SSCOM/BurnTool if the port is busy"
        )
    return (
        f"{port} is a Windows COM name, but this host is Linux (no COM* devices).\n"
        "Fix options:\n"
        "  1) WS63: Select Port → choose /dev/ttyUSB* or /dev/ttyACM*\n"
        "  2) If the board is plugged into Windows, use Cursor Remote-WSL "
        "and set Win Python so COM ports are proxied\n"
        "This is NOT a Python version issue."
    )
