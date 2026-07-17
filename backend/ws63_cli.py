#!/usr/bin/env python3
"""
WS63 CLI — backend entry (analog: idf.py / idf_monitor.py).

Usage:
  python3 ws63_cli.py ports
  python3 ws63_cli.py monitor --forever -p COM19
  python3 ws63_cli.py flash -p COM19
"""

from __future__ import annotations

import argparse
import os
import sys

BACKEND_ROOT = os.path.dirname(os.path.abspath(__file__))
if BACKEND_ROOT not in sys.path:
    sys.path.insert(0, BACKEND_ROOT)

from core.settings import load_defaults
from core.doctor import doctor_json, doctor_markdown, run_doctor
from flash.flasher import flash_firmware
from kconfig.config_cli import ConfigContext, getconfig_json, read_bool_values, saveconfig, setconfig
from kconfig.confserver import run_interactive, run_single_request
from kconfig.env import default_menus_export_path
from kconfig.menu_exporter import export_menus
from portio.session import SerialSession, list_ports


def firmware_path(cfg: dict, override: str | None) -> str:
    if override:
        return override
    sdk = cfg.get("sdk_path", "")
    rel = cfg.get("firmware_rel", "")
    return os.path.join(sdk, rel)


def cmd_ports(_: argparse.Namespace) -> int:
    cfg = load_defaults()
    ports = list_ports(cfg["win_python"])
    if not ports:
        print("No serial ports found.")
        return 1
    for port in ports:
        print(f"{port.device}\t{port.backend}\t{port.description}")
    return 0


def cmd_monitor(args: argparse.Namespace) -> int:
    cfg = load_defaults()
    session = SerialSession(args.port, args.baud, cfg["win_python"])
    if args.forever:
        return session.monitor_forever(pattern=args.grep)
    with session:
        session.monitor(args.duration, pattern=args.grep)
    return 0


def cmd_read(args: argparse.Namespace) -> int:
    cfg = load_defaults()
    with SerialSession(args.port, args.baud, cfg["win_python"]) as session:
        lines = session.read_lines(args.timeout, max_lines=args.lines, pattern=args.grep)
    for line in lines:
        print(line)
    if args.grep and not any(args.grep in line for line in lines):
        return 1
    return 0


def cmd_write(args: argparse.Namespace) -> int:
    cfg = load_defaults()
    text = args.text
    if args.newline and not text.endswith("\n"):
        text += "\r\n"
    with SerialSession(args.port, args.baud, cfg["win_python"]) as session:
        session.write(text)
    print(f"sent {len(text)} bytes")
    return 0


def cmd_console(args: argparse.Namespace) -> int:
    cfg = load_defaults()
    session = SerialSession(args.port, args.baud, cfg["win_python"])
    return session.console_forever()


def cmd_flash(args: argparse.Namespace) -> int:
    cfg = load_defaults()
    port = args.port.upper()
    ports = list_ports(cfg["win_python"])
    available = {p.device.upper() for p in ports}
    norm = args.port.upper()
    if norm.startswith(r"\\.\COM"):
        norm = norm[4:]
    if available and norm not in available and port not in available:
        print(f"error: port {args.port} not found", file=sys.stderr)
        print(f"available: {', '.join(sorted(available))}", file=sys.stderr)
        return 4
    fw = firmware_path(cfg, args.firmware)
    return flash_firmware(
        args.port, fw, baud=args.baud, bins=args.bin or None, timeout=args.timeout
    )


def cmd_check_sle(args: argparse.Namespace) -> int:
    cfg = load_defaults()
    patterns = ["SLE_TP", "sle_tp_server", "announce enabled", "RX:"]
    with SerialSession(args.port, args.baud, cfg["win_python"]) as session:
        lines = session.read_lines(args.timeout, max_lines=500)
    hits = {p: any(p in line for line in lines) for p in patterns}
    print("=== WS63 SLE health check ===")
    for line in lines[-30:]:
        print(line)
    print("--- pattern hits ---")
    for key, ok in hits.items():
        print(f"{key}: {'OK' if ok else 'MISSING'}")
    return 0 if hits["SLE_TP"] else 1


def _config_ctx(args: argparse.Namespace) -> ConfigContext:
    cfg = load_defaults()
    return ConfigContext(
        sdk_root=args.sdk or cfg["sdk_path"],
        chip=args.chip,
        core=args.core,
        target=args.target or cfg.get("default_target", "ws63-liteos-app"),
    )


def cmd_getconfig(args: argparse.Namespace) -> int:
    ctx = _config_ctx(args)
    keys = args.keys or [
        "SLE_TP_APP_ENABLE",
        "SLE_TP_APP_SERVER",
        "SLE_TP_APP_CLIENT",
    ]
    print(getconfig_json(ctx, keys))
    return 0


def cmd_setconfig(args: argparse.Namespace) -> int:
    if not args.assignments:
        print("error: no assignments (NAME=value ...)", file=sys.stderr)
        return 2
    ctx = _config_ctx(args)
    code = setconfig(ctx, list(args.assignments))
    if code != 0:
        return code
    if args.save:
        return saveconfig(ctx)
    return 0


def cmd_saveconfig(args: argparse.Namespace) -> int:
    ctx = _config_ctx(args)
    return saveconfig(ctx)


def cmd_export_menus(args: argparse.Namespace) -> int:
    ctx = _config_ctx(args)
    out = args.output or default_menus_export_path(ctx.sdk_root, ctx.target)
    path = export_menus(ctx.sdk_root, ctx.chip, ctx.core, ctx.target, out)
    print(path)
    return 0


def cmd_confserver(args: argparse.Namespace) -> int:
    ctx = _config_ctx(args)
    if args.request:
        return run_single_request(
            ctx.sdk_root, ctx.chip, ctx.core, ctx.target, args.request
        )
    return run_interactive(ctx.sdk_root, ctx.chip, ctx.core, ctx.target)


def cmd_doctor(args: argparse.Namespace) -> int:
    report = run_doctor(
        sdk_path=args.sdk or "",
        port=args.port or "",
        firmware_rel=args.firmware_rel or "",
        target=args.target or "",
        win_python=args.win_python or "",
    )
    if args.format == "markdown":
        print(doctor_markdown(report))
    else:
        print(doctor_json(report))
    return 0 if report.get("overall") != "fail" else 1


def build_parser() -> argparse.ArgumentParser:
    cfg = load_defaults()
    parser = argparse.ArgumentParser(description="WS63 IDE backend CLI")
    sub = parser.add_subparsers(dest="command", required=True)

    sub.add_parser("ports", help="list serial ports").set_defaults(func=cmd_ports)

    p_monitor = sub.add_parser("monitor", help="stream serial output")
    p_monitor.add_argument("-p", "--port", default=cfg["default_port"])
    p_monitor.add_argument("-b", "--baud", type=int, default=cfg["default_baud"])
    p_monitor.add_argument("-t", "--duration", type=float, default=30.0)
    p_monitor.add_argument("-g", "--grep", default=None)
    p_monitor.add_argument("--forever", action="store_true")
    p_monitor.set_defaults(func=cmd_monitor)

    p_read = sub.add_parser("read", help="read serial lines then exit")
    p_read.add_argument("-p", "--port", default=cfg["default_port"])
    p_read.add_argument("-b", "--baud", type=int, default=cfg["default_baud"])
    p_read.add_argument("-t", "--timeout", type=float, default=10.0)
    p_read.add_argument("-n", "--lines", type=int, default=200)
    p_read.add_argument("-g", "--grep", default=None)
    p_read.set_defaults(func=cmd_read)

    p_write = sub.add_parser("write", help="send text to serial port")
    p_write.add_argument("-p", "--port", default=cfg["default_port"])
    p_write.add_argument("-b", "--baud", type=int, default=cfg["default_baud"])
    p_write.add_argument("text")
    p_write.add_argument("--newline", action="store_true", default=True)
    p_write.set_defaults(func=cmd_write)

    p_console = sub.add_parser("console", help="interactive serial console (stdin → port)")
    p_console.add_argument("-p", "--port", default=cfg["default_port"])
    p_console.add_argument("-b", "--baud", type=int, default=cfg["default_baud"])
    p_console.set_defaults(func=cmd_console)

    p_flash = sub.add_parser("flash", help="flash fwpkg via ws63flash")
    p_flash.add_argument("-p", "--port", default=cfg["default_port"])
    p_flash.add_argument("-f", "--firmware", default=None)
    p_flash.add_argument("-b", "--baud", type=int, default=cfg["flash_baud"])
    p_flash.add_argument("-t", "--timeout", type=int, default=120, help="flash timeout seconds (0=disable)")
    p_flash.add_argument("--bin", action="append")
    p_flash.set_defaults(func=cmd_flash)

    p_check = sub.add_parser("check-sle", help="verify sle_tp markers in boot log")
    p_check.add_argument("-p", "--port", default=cfg["default_port"])
    p_check.add_argument("-b", "--baud", type=int, default=cfg["default_baud"])
    p_check.add_argument("-t", "--timeout", type=float, default=8.0)
    p_check.set_defaults(func=cmd_check_sle)

    def add_config_args(p: argparse.ArgumentParser) -> None:
        p.add_argument("--chip", default="ws63")
        p.add_argument("--core", default="acore")
        p.add_argument("--target", default=cfg.get("default_target", "ws63-liteos-app"))
        p.add_argument("--sdk", default=None, help="SDK root override")

    p_get = sub.add_parser("getconfig", help="read Kconfig bool values as JSON")
    p_get.add_argument(
        "--keys",
        nargs="*",
        help="symbol names (default: sle_tp trio)",
    )
    add_config_args(p_get)
    p_get.set_defaults(func=cmd_getconfig)

    p_set = sub.add_parser("setconfig", help="set Kconfig values via usr_config.py")
    p_set.add_argument(
        "assignments",
        nargs="+",
        metavar="NAME=value",
        help="e.g. SLE_TP_APP_SERVER=y",
    )
    p_set.add_argument("--save", action="store_true", help="run saveconfig after set")
    add_config_args(p_set)
    p_set.set_defaults(func=cmd_setconfig)

    p_save = sub.add_parser("saveconfig", help="generate mconfig.h from .config")
    add_config_args(p_save)
    p_save.set_defaults(func=cmd_saveconfig)

    p_menus = sub.add_parser("export-menus", help="export Kconfig menu tree JSON")
    p_menus.add_argument("--output", default=None, help="output JSON path")
    add_config_args(p_menus)
    p_menus.set_defaults(func=cmd_export_menus)

    p_conf = sub.add_parser("confserver", help="Kconfig JSON confserver (stdin/stdout)")
    p_conf.add_argument(
        "--request",
        default=None,
        help="optional single JSON request after initial state (non-interactive test)",
    )
    add_config_args(p_conf)
    p_conf.set_defaults(func=cmd_confserver)

    p_doc = sub.add_parser("doctor", help="environment diagnostics (JSON/Markdown)")
    p_doc.add_argument("--sdk", default=None)
    p_doc.add_argument("-p", "--port", default=None)
    p_doc.add_argument("--firmware-rel", default=None)
    p_doc.add_argument("--target", default=None)
    p_doc.add_argument("--win-python", default=None)
    p_doc.add_argument(
        "--format",
        choices=("json", "markdown"),
        default="json",
    )
    p_doc.set_defaults(func=cmd_doctor)

    return parser


def main() -> int:
    args = build_parser().parse_args()
    try:
        return args.func(args)
    except FileNotFoundError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2
    except RuntimeError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 3


if __name__ == "__main__":
    raise SystemExit(main())
