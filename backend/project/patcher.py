"""Safe patches to SDK registration files."""

from __future__ import annotations

import os
import re
from dataclasses import dataclass
from typing import List, Optional


@dataclass
class PatchResult:
    path: str
    action: str  # created | patched | skipped
    detail: str = ""


def _read(path: str) -> str:
    with open(path, encoding="utf-8") as fp:
        return fp.read()


def _write(path: str, content: str, dry_run: bool) -> None:
    if dry_run:
        return
    with open(path, "w", encoding="utf-8") as fp:
        fp.write(content)


def patch_application_cmake(sdk_root: str, name: str, dry_run: bool) -> PatchResult:
    path = os.path.join(sdk_root, "application", "CMakeLists.txt")
    line = f'add_subdirectory_if_exist({name})'
    content = _read(path)
    if line in content:
        return PatchResult(path, "skipped", "already registered")
    marker = "add_subdirectory_if_exist(sle_tp_app)"
    if marker in content:
        content = content.replace(marker, f"{marker}\n{line}")
    else:
        content = content.rstrip() + f"\n{line}\n"
    _write(path, content, dry_run)
    return PatchResult(path, "patched", line)


def patch_application_kconfig(sdk_root: str, name: str, upper: str, title: str, dry_run: bool) -> PatchResult:
    path = os.path.join(sdk_root, "application", "Kconfig")
    block = f'''
config {upper}_ENABLE
    bool
    prompt "Enable {title}."
    default n
    help
        Application component {name} (ws63-ide wizard).

if {upper}_ENABLE
osource "application/{name}/Kconfig"
endif
'''
    content = _read(path)
    if f"config {upper}_ENABLE" in content:
        return PatchResult(path, "skipped", "Kconfig gate exists")
    content = content.rstrip() + "\n" + block
    _write(path, content, dry_run)
    return PatchResult(path, "patched", f"{upper}_ENABLE")


def patch_target_ram_component(
    sdk_root: str, target: str, component: str, dry_run: bool
) -> PatchResult:
    path = os.path.join(sdk_root, "build", "config", "target_config", "ws63", "config.py")
    content = _read(path)
    if f"'{component}'" in content:
        return PatchResult(path, "skipped", "ram_component exists")

    key = f"'{target}'"
    idx = content.find(key)
    if idx < 0:
        return PatchResult(path, "skipped", f"target {target} not found")

    sub = content[idx:]
    ram_idx = sub.find("'ram_component'")
    if ram_idx < 0:
        return PatchResult(path, "skipped", "ram_component block not found")

    sub = content[idx:]
    ram_idx = sub.find("'ram_component'")
    if ram_idx < 0:
        return PatchResult(path, "skipped", "ram_component block not found")

    block = sub[ram_idx:]
    markers = ["            'sle_tp_app',\n", "            'AIoTComm',\n", "            'samples',\n"]
    inserted = False
    for marker in markers:
        if marker in block:
            block = block.replace(marker, marker + f"            '{component}',\n", 1)
            inserted = True
            break
    if not inserted:
        close = block.find("],")
        if close < 0:
            return PatchResult(path, "skipped", "ram_component list end not found")
        block = block[:close] + f"            '{component}',\n" + block[close:]

    content = content[: idx + ram_idx] + block
    _write(path, content, dry_run)
    return PatchResult(path, "patched", f"ram_component += {component}")


def validate_registration(sdk_root: str, name: str, component: str, target: str) -> List[str]:
    errors: List[str] = []
    app_cmake = os.path.join(sdk_root, "application", "CMakeLists.txt")
    if f"add_subdirectory_if_exist({name})" not in _read(app_cmake):
        errors.append(f"missing add_subdirectory in {app_cmake}")

    app_kconfig = os.path.join(sdk_root, "application", "Kconfig")
    upper = name.upper()
    if f"config {upper}_ENABLE" not in _read(app_kconfig):
        errors.append(f"missing Kconfig gate in application/Kconfig")

    config_py = os.path.join(sdk_root, "build", "config", "target_config", "ws63", "config.py")
    if f"'{component}'" not in _read(config_py):
        errors.append(f"missing ram_component '{component}' in config.py")

    app_dir = os.path.join(sdk_root, "application", name)
    if not os.path.isdir(app_dir):
        errors.append(f"missing directory {app_dir}")

    return errors
