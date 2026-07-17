"""Kconfig helpers — getconfig / setconfig / saveconfig via SDK usr_config.py."""

from __future__ import annotations

import json
import os
import re
import subprocess
import sys
from dataclasses import dataclass
from typing import Dict, List, Optional

from kconfig.paths import (
    build_output_path,
    config_file_path,
    normalize_symbol,
    usr_config_script,
)


@dataclass
class ConfigContext:
    sdk_root: str
    chip: str = "ws63"
    core: str = "acore"
    target: str = "ws63-liteos-app"

    @property
    def config_path(self) -> str:
        return config_file_path(self.sdk_root, self.chip, self.core, self.target)

    @property
    def output_path(self) -> str:
        return build_output_path(self.sdk_root, self.chip, self.core, self.target)


def _config_line_key(line: str) -> Optional[tuple[str, bool]]:
    line = line.strip()
    m = re.match(r"^(CONFIG_[A-Z0-9_]+)=y$", line)
    if m:
        return m.group(1), True
    m = re.match(r"^# (CONFIG_[A-Z0-9_]+) is not set$", line)
    if m:
        return m.group(1), False
    return None


def read_bool_values(ctx: ConfigContext, keys: List[str]) -> Dict[str, bool]:
    path = ctx.config_path
    if not os.path.isfile(path):
        raise FileNotFoundError(f"config not found: {path}")

    wanted = {normalize_symbol(k): k for k in keys}
    found: Dict[str, bool] = {}

    with open(path, encoding="utf-8", errors="replace") as fp:
        for line in fp:
            parsed = _config_line_key(line)
            if not parsed:
                continue
            conf_key, val = parsed
            sym = normalize_symbol(conf_key)
            if sym in wanted:
                found[wanted[sym]] = val

    for key in keys:
        found.setdefault(key, False)
    return found


def getconfig_json(ctx: ConfigContext, keys: List[str]) -> str:
    values = read_bool_values(ctx, keys)
    payload = {
        "target": ctx.target,
        "chip": ctx.chip,
        "config_path": ctx.config_path,
        "values": values,
    }
    return json.dumps(payload, indent=2, ensure_ascii=False)


def _run_usr_config(
    ctx: ConfigContext,
    command: str,
    assignments: Optional[List[str]] = None,
    output: Optional[str] = None,
) -> subprocess.CompletedProcess:
    script = usr_config_script(ctx.sdk_root)
    if not os.path.isfile(script):
        raise FileNotFoundError(f"usr_config.py not found: {script}")

    cmd = [
        sys.executable,
        script,
        "--command",
        command,
        "--chip",
        ctx.chip,
        "--core",
        ctx.core,
        "--target",
        ctx.target,
    ]
    if output:
        cmd.extend(["--output", output])
    if assignments:
        cmd.extend(assignments)

    return subprocess.run(
        cmd,
        cwd=ctx.sdk_root,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        check=False,
    )


def setconfig(ctx: ConfigContext, assignments: List[str], *, quiet: bool = False) -> int:
    """Apply NAME=value pairs (with or without CONFIG_ prefix)."""
    normalized: List[str] = []
    for item in assignments:
        if "=" not in item:
            raise ValueError(f"invalid assignment (missing '='): {item}")
        name, value = item.split("=", 1)
        normalized.append(f"{normalize_symbol(name)}={value}")

    result = _run_usr_config(ctx, "setconfig", normalized)
    if result.stdout and not quiet:
        print(result.stdout, end="" if result.stdout.endswith("\n") else "\n")
    if result.returncode != 0:
        if result.stderr:
            print(result.stderr, file=sys.stderr, end="")
        return result.returncode
    return 0


def saveconfig(ctx: ConfigContext, *, quiet: bool = False) -> int:
    """Write mconfig.h from current .config (savemenuconfig)."""
    out = ctx.output_path
    os.makedirs(out, exist_ok=True)
    result = _run_usr_config(ctx, "savemenuconfig", output=out)
    if result.stdout and not quiet:
        print(result.stdout, end="" if result.stdout.endswith("\n") else "\n")
    if result.returncode != 0:
        if result.stderr:
            print(result.stderr, file=sys.stderr, end="")
        return result.returncode or 1
    return 0
