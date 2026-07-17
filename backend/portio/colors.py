"""ANSI colors for serial monitor output (VS Code / Cursor terminals support these)."""

from __future__ import annotations

import re

RESET = "\033[0m"
BOLD = "\033[1m"
DIM = "\033[2m"
RED = "\033[91m"
GREEN = "\033[92m"
YELLOW = "\033[93m"
BLUE = "\033[94m"
CYAN = "\033[96m"
MAGENTA = "\033[95m"
GRAY = "\033[90m"


def colorize_line(line: str) -> str:
    if not line:
        return line
    upper = line.upper()
    if re.search(r"\b(ERROR|ERR|FATAL|FAIL)\b", upper) or "error:" in line.lower():
        return f"{BOLD}{RED}✖ {line}{RESET}"
    if re.search(r"\b(WARN|WARNING)\b", upper) or "warning:" in line.lower():
        return f"{BOLD}{YELLOW}⚠ {line}{RESET}"
    if "[SLE_TP]" in line:
        return f"{BOLD}{CYAN}● {line}{RESET}"
    if "[SLE]" in upper:
        return f"{CYAN}● {line}{RESET}"
    if "RX:" in line:
        return f"{GREEN}← {line}{RESET}"
    if "TX:" in line:
        return f"{BLUE}→ {line}{RESET}"
    if line.startswith("[") and "]" in line[:24]:
        return f"{GRAY}{line}{RESET}"
    return line


def banner_line(text: str, color: str = MAGENTA) -> str:
    return f"{BOLD}{color}{text}{RESET}"
