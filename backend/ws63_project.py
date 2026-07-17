#!/usr/bin/env python3
"""WS63 New Application Wizard CLI (Phase 2.5)."""

from __future__ import annotations

import argparse
import os
import sys

BACKEND_ROOT = os.path.dirname(os.path.abspath(__file__))
if BACKEND_ROOT not in sys.path:
    sys.path.insert(0, BACKEND_ROOT)

from core.settings import load_defaults
from kconfig.config_cli import ConfigContext, setconfig, saveconfig
from project.schema import to_upper, validate_project_name
from project.wizard import create_standalone, validate_project

TEMPLATES = ["standalone"]


def cmd_list_templates(_: argparse.Namespace) -> int:
    for t in TEMPLATES:
        print(t)
    return 0


def cmd_create(args: argparse.Namespace) -> int:
    cfg = load_defaults()
    sdk = args.sdk or cfg["sdk_path"]
    if args.template != "standalone":
        print(f"error: unsupported template {args.template}", file=sys.stderr)
        return 2

    try:
        validate_project_name(args.name)
    except ValueError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2

    result = create_standalone(
        sdk_root=sdk,
        name=args.name,
        target=args.target or cfg.get("default_target", "ws63-liteos-app"),
        title=args.title,
        register=not args.no_register,
        dry_run=args.dry_run,
    )
    print(result.to_json())

    if args.dry_run or args.no_register or not args.enable_config:
        return 0

    ctx = ConfigContext(
        sdk_root=sdk,
        target=args.target or cfg.get("default_target", "ws63-liteos-app"),
    )
    upper = to_upper(args.name)
    code = setconfig(ctx, [f"{upper}_ENABLE=y", f"{upper}_HEARTBEAT=y"], quiet=True)
    if code != 0:
        return code
    return saveconfig(ctx, quiet=True)


def cmd_validate(args: argparse.Namespace) -> int:
    cfg = load_defaults()
    sdk = args.sdk or cfg["sdk_path"]
    try:
        errors = validate_project(sdk, args.name, args.target or cfg.get("default_target", "ws63-liteos-app"))
    except ValueError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2
    if errors:
        print("INVALID")
        for err in errors:
            print(f"  - {err}")
        return 1
    print("OK")
    return 0


def main() -> int:
    cfg = load_defaults()
    parser = argparse.ArgumentParser(description="WS63 application wizard")
    sub = parser.add_subparsers(dest="command", required=True)

    sub.add_parser("list-templates", help="list available templates").set_defaults(func=cmd_list_templates)

    p_create = sub.add_parser("create", help="create new application")
    p_create.add_argument("name")
    p_create.add_argument("--template", default="standalone", choices=TEMPLATES)
    p_create.add_argument("--target", default=cfg.get("default_target", "ws63-liteos-app"))
    p_create.add_argument("--title", default=None)
    p_create.add_argument("--sdk", default=None)
    p_create.add_argument("--dry-run", action="store_true")
    p_create.add_argument("--no-register", action="store_true")
    p_create.add_argument("--enable-config", action="store_true", help="set Kconfig + saveconfig")
    p_create.set_defaults(func=cmd_create)

    p_val = sub.add_parser("validate", help="check registration")
    p_val.add_argument("name")
    p_val.add_argument("--target", default=cfg.get("default_target", "ws63-liteos-app"))
    p_val.add_argument("--sdk", default=None)
    p_val.set_defaults(func=cmd_validate)

    args = parser.parse_args()
    try:
        return args.func(args)
    except FileExistsError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 3


if __name__ == "__main__":
    raise SystemExit(main())
