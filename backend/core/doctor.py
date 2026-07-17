"""Environment doctor — JSON diagnostics for IDE Setup / preflight."""

from __future__ import annotations

import importlib.util
import json
import os
import sys
from typing import Any, Dict, List

from core.paths import BACKEND_ROOT, IDE_ROOT, is_wsl, resolve_ws63flash
from core.settings import load_defaults
from portio.session import list_ports, normalize_port
from portio.win_python import detect_win_python


Status = str  # "ok" | "warn" | "fail"


def _check(
    id: str,
    status: Status,
    message: str,
    *,
    value: str = "",
    fix: str = "",
    code: str = "",
) -> Dict[str, Any]:
    return {
        "id": id,
        "status": status,
        "message": message,
        "value": value,
        "fix": fix,
        "code": code,
    }


def _python_version() -> str:
    return f"{sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}"


def _has_module(name: str) -> bool:
    return importlib.util.find_spec(name) is not None


def run_doctor(
    *,
    sdk_path: str = "",
    port: str = "",
    firmware_rel: str = "",
    target: str = "",
    win_python: str = "",
) -> Dict[str, Any]:
    cfg = load_defaults()
    sdk = (sdk_path or cfg.get("sdk_path") or "").strip()
    port = (port or cfg.get("default_port") or "COM19").strip()
    firmware_rel = (
        firmware_rel
        or cfg.get("firmware_rel")
        or "output/ws63/fwpkg/ws63-liteos-app/ws63-liteos-app_all.fwpkg"
    ).strip()
    target = (target or cfg.get("default_target") or "ws63-liteos-app").strip()
    win_python = detect_win_python(
        (win_python or cfg.get("win_python") or "").strip()
    )

    checks: List[Dict[str, Any]] = []

    # Host
    host = "wsl" if is_wsl() else ("linux" if sys.platform.startswith("linux") else sys.platform)
    checks.append(
        _check(
            "host",
            "ok",
            f"Running on {host}",
            value=host,
        )
    )

    # Backend
    cli = os.path.join(BACKEND_ROOT, "ws63_cli.py")
    if os.path.isfile(cli):
        checks.append(_check("backend", "ok", "Backend CLI found", value=cli))
    else:
        checks.append(
            _check(
                "backend",
                "fail",
                "ws63_cli.py missing",
                value=cli,
                fix="Reinstall the WS63 IDE extension (backend should be bundled).",
                code="BACKEND_MISSING",
            )
        )

    # Python
    checks.append(
        _check(
            "python",
            "ok",
            f"python3 {_python_version()}",
            value=sys.executable,
        )
    )

    # pyserial
    if _has_module("serial"):
        checks.append(_check("pyserial", "ok", "pyserial importable"))
    else:
        req = os.path.join(BACKEND_ROOT, "requirements.txt")
        checks.append(
            _check(
                "pyserial",
                "fail",
                "pyserial not installed",
                fix=f"pip3 install -r {req}",
                code="DEPS_MISSING",
            )
        )

    # SDK
    build_py = os.path.join(sdk, "build.py") if sdk else ""
    if sdk and os.path.isfile(build_py):
        checks.append(_check("sdk", "ok", "SDK root OK (build.py found)", value=sdk))
    elif sdk:
        checks.append(
            _check(
                "sdk",
                "fail",
                "SDK path set but build.py not found",
                value=sdk,
                fix="Open the folder that contains build.py, or set ws63.sdkPath.",
                code="SDK_INVALID",
            )
        )
    else:
        checks.append(
            _check(
                "sdk",
                "fail",
                "SDK path empty",
                fix="Open the WS63 SDK workspace (folder with build.py).",
                code="SDK_MISSING",
            )
        )

    # Firmware (warn if missing — need build first)
    fw = os.path.join(sdk, firmware_rel) if sdk else ""
    if fw and os.path.isfile(fw):
        checks.append(_check("firmware", "ok", "Firmware package found", value=fw))
    elif sdk:
        checks.append(
            _check(
                "firmware",
                "warn",
                "Firmware not found (build first before flash)",
                value=fw,
                fix=f"Run Build for target {target}.",
                code="FIRMWARE_MISSING",
            )
        )
    else:
        checks.append(
            _check(
                "firmware",
                "warn",
                "Skipped (no SDK)",
                code="FIRMWARE_MISSING",
            )
        )

    # ws63flash
    try:
        flash_bin = resolve_ws63flash()
        checks.append(
            _check("ws63flash", "ok", "ws63flash found", value=flash_bin)
        )
    except FileNotFoundError as exc:
        checks.append(
            _check(
                "ws63flash",
                "fail",
                str(exc),
                fix="Ensure tools/ws63-ide/third_party/ws63flash-0.3.1 is present, "
                "or reinstall the extension package that bundles third_party.",
                code="TOOL_MISSING",
            )
        )

    # win_python (only relevant on WSL for COM proxy)
    if is_wsl():
        if win_python and os.path.isfile(win_python):
            checks.append(
                _check("win_python", "ok", "Windows Python proxy OK", value=win_python)
            )
        else:
            checks.append(
                _check(
                    "win_python",
                    "fail" if port.upper().startswith("COM") else "warn",
                    "Windows Python not found — cannot open COM* from WSL/Linux",
                    value=win_python or "(auto detect failed)",
                    fix="WS63 Settings → Win Python → pick Windows python.exe under /mnt/c/...",
                    code="WIN_PYTHON_MISSING",
                )
            )
        if port.upper().startswith("COM") and not (win_python and os.path.isfile(win_python)):
            checks.append(
                _check(
                    "com_on_linux",
                    "fail",
                    f"Port {port} is Windows COM; needs Win Python proxy or use /dev/ttyUSB*",
                    value=port,
                    fix="Select Port for Linux tty, or set Win Python. Not a Python version issue.",
                    code="PORT_MISSING",
                )
            )
    else:
        if port.upper().startswith("COM"):
            checks.append(
                _check(
                    "com_on_linux",
                    "fail",
                    f"Port {port} is Windows-only; this host is Linux",
                    value=port,
                    fix="WS63: Select Port → choose /dev/ttyUSB* or /dev/ttyACM*. Not a Python version issue.",
                    code="PORT_MISSING",
                )
            )
        checks.append(
            _check("win_python", "ok", "Not required on this host", value="n/a")
        )

    # Ports
    try:
        ports = list_ports(win_python)
        names = [p.device for p in ports]
        port_norm = normalize_port(port).upper()
        if port_norm.startswith(r"\\.\COM"):
            port_norm = port_norm[4:]
        available = {p.device.upper() for p in ports}
        if not names:
            checks.append(
                _check(
                    "ports",
                    "warn",
                    "No serial ports detected",
                    fix="Plug in USB and refresh, or close drivers locking the port.",
                    code="PORT_NONE",
                )
            )
        elif port_norm in available or port.upper() in available:
            checks.append(
                _check(
                    "ports",
                    "ok",
                    f"Configured port {port} is available",
                    value=", ".join(names),
                )
            )
        else:
            checks.append(
                _check(
                    "ports",
                    "fail",
                    f"Configured port {port} not in list",
                    value=", ".join(names),
                    fix="Run WS63: Select Port and pick an available COM device.",
                    code="PORT_MISSING",
                )
            )
    except Exception as exc:  # noqa: BLE001
        checks.append(
            _check(
                "ports",
                "warn",
                f"Port scan failed: {exc}",
                fix="Check pyserial / win_python proxy.",
                code="PORT_SCAN_FAILED",
            )
        )

    # Stale path: another user's home directory baked into settings
    try:
        import getpass
        import re

        m = re.search(r"/home/([^/]+)/", sdk.replace("\\", "/"))
        if m and m.group(1) != getpass.getuser():
            checks.append(
                _check(
                    "stale_path",
                    "fail",
                    f"SDK path points at another user's home ({m.group(1)})",
                    value=sdk,
                    fix="Clear ws63.sdkPath and reopen your own SDK folder.",
                    code="STALE_PATH",
                )
            )
    except Exception:  # noqa: BLE001
        pass

    summary = {
        "ok": sum(1 for c in checks if c["status"] == "ok"),
        "warn": sum(1 for c in checks if c["status"] == "warn"),
        "fail": sum(1 for c in checks if c["status"] == "fail"),
    }
    overall = "fail" if summary["fail"] else ("warn" if summary["warn"] else "ok")

    return {
        "version": 1,
        "overall": overall,
        "summary": summary,
        "ide_root": IDE_ROOT,
        "backend_root": BACKEND_ROOT,
        "checks": checks,
    }


def doctor_markdown(report: Dict[str, Any]) -> str:
    lines = [
        f"# WS63 Doctor — overall: {report.get('overall', '?').upper()}",
        "",
        f"- ok: {report['summary']['ok']}  warn: {report['summary']['warn']}  "
        f"fail: {report['summary']['fail']}",
        f"- backend: `{report.get('backend_root', '')}`",
        "",
        "| Status | ID | Message | Fix |",
        "|--------|----|---------|-----|",
    ]
    for c in report.get("checks", []):
        fix = (c.get("fix") or "").replace("|", "/")
        msg = (c.get("message") or "").replace("|", "/")
        lines.append(
            f"| {c['status'].upper()} | {c['id']} | {msg} | {fix} |"
        )
    lines.append("")
    return "\n".join(lines)


def doctor_json(report: Dict[str, Any]) -> str:
    return json.dumps(report, ensure_ascii=False, indent=2)
