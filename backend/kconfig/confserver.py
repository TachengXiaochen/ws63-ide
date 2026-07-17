"""Kconfig confserver — JSON lines protocol (ESP-IDF kconfserver v3 subset)."""

from __future__ import annotations

import json
import os
import sys
from typing import Any, Dict, List, Optional, Tuple

from kconfiglib import BOOL, HEX, INT, STRING, TRISTATE, Kconfig, MenuNode

from kconfig.env import apply_kconfig_env

PROTOCOL_VERSION = 3


class Confserver:
    def __init__(self, kconf: Kconfig, config_path: str, output_path: str):
        self.kconf = kconf
        self.config_path = config_path
        self.output_path = output_path
        self._values: Dict[str, Any] = {}
        self._visible: Dict[str, bool] = {}
        self._ranges: Dict[str, List[int]] = {}
        self._defaults: Dict[str, bool] = {}
        self._refresh_state(full=True)

    def _sym_visible(self, sym) -> bool:
        return sym.visibility != 0

    def _menu_visible(self, node: MenuNode) -> bool:
        item = node.item
        if hasattr(item, "visibility"):
            vis = item.visibility
            if isinstance(vis, int):
                return vis != 0
        return True

    def _menu_id(self, node: MenuNode) -> Optional[str]:
        if hasattr(node.item, "name") and node.item.name and not hasattr(node.item, "orig_type"):
            return None
        if hasattr(node.item, "name") and node.item.name and hasattr(node.item, "orig_type"):
            return node.item.name
        if node.prompt:
            import re

            slug = re.sub(r"[^a-z0-9]+", "-", node.prompt[0].lower()).strip("-")
            return slug[:56] if slug else None
        return None

    def _json_value(self, sym) -> Any:
        if sym.orig_type in (BOOL, TRISTATE):
            if sym.orig_type == TRISTATE and sym.tri_value == 1:
                return "m"
            return sym.tri_value == 2
        if sym.orig_type in (INT, HEX):
            try:
                return int(sym.str_value, 0) if sym.orig_type == HEX else int(sym.str_value)
            except (ValueError, TypeError):
                return 0
        return sym.str_value

    def _sym_range(self, sym) -> Optional[List[int]]:
        if sym.orig_type not in (INT, HEX) or not sym.ranges:
            return None
        try:
            low, high = sym.ranges[0][0], sym.ranges[0][1]
            lo = int(str(low)) if not isinstance(low, int) else low
            hi = int(str(high)) if not isinstance(high, int) else high
            if hasattr(low, "str_value"):
                lo = int(low.str_value, 0 if sym.orig_type == HEX else 10)
            if hasattr(high, "str_value"):
                hi = int(high.str_value, 0 if sym.orig_type == HEX else 10)
            return [lo, hi]
        except (ValueError, TypeError, AttributeError):
            return None

    def _has_default(self, sym) -> bool:
        return sym.defaults != []

    def _collect_state(self, full: bool) -> Tuple[Dict[str, Any], Dict[str, bool], Dict[str, List[int]], Dict[str, bool]]:
        values: Dict[str, Any] = {}
        visible: Dict[str, bool] = {}
        ranges: Dict[str, List[int]] = {}
        defaults: Dict[str, bool] = {}

        for sym in self.kconf.unique_defined_syms:
            if sym.name in ("y", "n", "m", "MODULES"):
                continue
            vis = self._sym_visible(sym)
            visible[sym.name] = vis
            if vis or full:
                values[sym.name] = self._json_value(sym)
            rng = self._sym_range(sym)
            if rng is not None:
                ranges[sym.name] = rng
            defaults[sym.name] = self._has_default(sym)

        return values, visible, ranges, defaults

    def _refresh_state(self, full: bool = False) -> None:
        self._values, self._visible, self._ranges, self._defaults = self._collect_state(full)

    def _delta(self, old: Dict, new: Dict) -> Dict:
        out = {}
        for key, val in new.items():
            if old.get(key) != val:
                out[key] = val
        return out

    def initial_response(self) -> Dict[str, Any]:
        return {
            "version": PROTOCOL_VERSION,
            "values": self._values,
            "visible": self._visible,
            "ranges": self._ranges,
            "defaults": self._defaults,
            "warnings": {},
            "config_path": self.config_path,
        }

    def _apply_set(self, assignments: Dict[str, Any]) -> List[str]:
        errors: List[str] = []
        for name, value in assignments.items():
            sym = self.kconf.syms.get(name)
            if not sym:
                errors.append(f"unknown symbol: {name}")
                continue
            if isinstance(value, bool):
                ok = sym.set_value("y" if value else "n")
            elif value == "m":
                ok = sym.set_value("m")
            elif isinstance(value, (int, float)):
                ok = sym.set_value(str(int(value)))
            else:
                ok = sym.set_value(str(value))
            if not ok:
                errors.append(f"invalid value for {name}: {value!r}")
        return errors

    def handle(self, req: Dict[str, Any]) -> Dict[str, Any]:
        version = req.get("version")
        if version != PROTOCOL_VERSION:
            return {
                "version": PROTOCOL_VERSION,
                "error": [f"Unsupported request version {version}. Use {PROTOCOL_VERSION}."],
            }

        prev_values = dict(self._values)
        prev_visible = dict(self._visible)
        prev_ranges = dict(self._ranges)
        prev_defaults = dict(self._defaults)
        errors: List[str] = []

        if "load" in req:
            path = req["load"]
            if isinstance(path, str) and path:
                self.kconf.load_config(path)
            else:
                self.kconf.load_config()
            self._refresh_state(full=True)
            return self.initial_response()

        if "reset" in req:
            targets = req["reset"]
            if targets == "all" or (isinstance(targets, list) and "all" in targets):
                self.kconf.reset_all()
            elif isinstance(targets, list):
                for name in targets:
                    sym = self.kconf.syms.get(name)
                    if sym:
                        sym.set_value(sym.orig_value)

        if "set" in req and isinstance(req["set"], dict):
            errors.extend(self._apply_set(req["set"]))

        if "save" in req:
            save_path = req["save"]
            if isinstance(save_path, str) and save_path:
                self.kconf.write_config(save_path)
            else:
                self.kconf.write_config()
            os.makedirs(self.output_path, exist_ok=True)
            self.kconf.write_autoconf()

        self._refresh_state(full=False)

        resp: Dict[str, Any] = {"version": PROTOCOL_VERSION}
        if errors:
            resp["error"] = errors

        values_delta = self._delta(prev_values, self._values)
        visible_delta = self._delta(prev_visible, self._visible)
        ranges_delta = self._delta(prev_ranges, self._ranges)
        defaults_delta = self._delta(prev_defaults, self._defaults)

        if values_delta:
            resp["values"] = values_delta
        if visible_delta:
            resp["visible"] = visible_delta
        if ranges_delta:
            resp["ranges"] = ranges_delta
        if defaults_delta:
            resp["defaults"] = defaults_delta

        if "save" in req and not errors:
            resp["save"] = {"success": True, "config_path": self.config_path}

        return resp


def create_confserver(
    sdk_root: str,
    chip: str,
    core: str,
    target: str,
) -> Confserver:
    paths = apply_kconfig_env(sdk_root, chip, core, target)
    os.chdir(sdk_root)
    kconf = Kconfig(filename=paths["kconfig_root"])
    kconf.load_config()
    return Confserver(kconf, paths["config_path"], paths["output_path"])


def run_interactive(
    sdk_root: str,
    chip: str,
    core: str,
    target: str,
) -> int:
    server = create_confserver(sdk_root, chip, core, target)
    print("Server running, waiting for requests on stdin...", file=sys.stderr, flush=True)
    print(json.dumps(server.initial_response(), ensure_ascii=False), flush=True)

    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            req = json.loads(line)
        except json.JSONDecodeError as exc:
            print(
                json.dumps({"version": PROTOCOL_VERSION, "error": [str(exc)]}),
                flush=True,
            )
            continue
        resp = server.handle(req)
        print(json.dumps(resp, ensure_ascii=False), flush=True)

    return 0


def run_single_request(
    sdk_root: str,
    chip: str,
    core: str,
    target: str,
    request_json: str,
) -> int:
    server = create_confserver(sdk_root, chip, core, target)
    print(json.dumps(server.initial_response(), ensure_ascii=False))
    if request_json.strip():
        req = json.loads(request_json)
        print(json.dumps(server.handle(req), ensure_ascii=False))
    return 0
