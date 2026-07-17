"""Kconfig / menuconfig path helpers (aligned with usr_config.py)."""

from __future__ import annotations

import os


def target_to_config_basename(target: str) -> str:
    return target.replace("-", "_")


def config_file_path(sdk_root: str, chip: str, core: str, target: str) -> str:
    base = target_to_config_basename(target)
    return os.path.join(
        sdk_root,
        "build",
        "config",
        "target_config",
        chip,
        "menuconfig",
        core,
        f"{base}.config",
    )


def build_output_path(sdk_root: str, chip: str, core: str, target: str) -> str:
    return os.path.join(sdk_root, "output", chip, core, target)


def usr_config_script(sdk_root: str) -> str:
    return os.path.join(sdk_root, "build", "script", "usr_config.py")


def normalize_symbol(name: str) -> str:
    """Kconfig symbol name without CONFIG_ prefix."""
    upper = name.upper()
    if upper.startswith("CONFIG_"):
        return upper[7:]
    return upper
