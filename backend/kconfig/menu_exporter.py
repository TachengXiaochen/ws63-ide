"""Export Kconfig menu tree to JSON for SDK Configuration Webview."""

from __future__ import annotations

import json
import os
import re
from typing import Any, Dict, List, Optional

from kconfiglib import BOOL, HEX, INT, STRING, TRISTATE, Choice, Kconfig, MenuNode

from kconfig.env import apply_kconfig_env

TYPE_NAMES = {
    BOOL: "bool",
    TRISTATE: "tristate",
    INT: "int",
    HEX: "hex",
    STRING: "string",
}


def _slug(text: str, fallback: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")
    return (slug[:56] if slug else fallback)


def _node_title(node: MenuNode) -> str:
    if node.prompt:
        return node.prompt[0]
    if hasattr(node.item, "name") and node.item.name:
        return node.item.name
    return "Menu"


def _choice_members(node: MenuNode) -> List[str]:
    members: List[str] = []
    child = node.list
    while child:
        if hasattr(child.item, "name") and getattr(child.item, "name", None):
            name = child.item.name
            if name not in ("y", "n", "m", "MODULES"):
                members.append(name)
        child = child.next
    return members


def _export_menu_node(kconf: Kconfig, node: MenuNode, path: str) -> Optional[Dict[str, Any]]:
    children: List[Dict[str, Any]] = []
    child = node.list
    while child:
        exported = _export_menu_node(kconf, child, path)
        if exported:
            children.append(exported)
        child = child.next

    if isinstance(node.item, Choice):
        title = _node_title(node)
        members = _choice_members(node)
        choice_id = _slug(f"{path}-choice-{title}", f"choice-{id(node)}")
        return {
            "id": choice_id,
            "kind": "choice",
            "type": "choice",
            "title": title,
            "help": node.help or "",
            "members": members,
            "children": children,
        }

    if hasattr(node.item, "name") and getattr(node.item, "name", None):
        sym = node.item
        if sym.name in ("y", "n", "m", "MODULES"):
            return None
        entry: Dict[str, Any] = {
            "id": sym.name,
            "kind": "config",
            "type": TYPE_NAMES.get(sym.orig_type, "unknown"),
            "title": _node_title(node),
            "help": node.help or "",
        }
        if sym.choice is not None:
            entry["inChoice"] = True
        if children:
            entry["children"] = children
        return entry

    if not node.prompt and not children:
        return None

    title = _node_title(node)
    menu_id = _slug(f"{path}-{title}", f"menu-{id(node)}")
    return {
        "id": menu_id,
        "kind": "menu",
        "title": title,
        "children": children,
    }


def export_menus(
    sdk_root: str,
    chip: str,
    core: str,
    target: str,
    output_path: Optional[str] = None,
) -> str:
    paths = apply_kconfig_env(sdk_root, chip, core, target)
    os.chdir(sdk_root)
    kconf = Kconfig(filename=paths["kconfig_root"])
    kconf.load_config()

    menus: List[Dict[str, Any]] = []
    node = kconf.top_node.list
    while node:
        exported = _export_menu_node(kconf, node, "root")
        if exported:
            menus.append(exported)
        node = node.next

    payload = {
        "version": 1,
        "target": target,
        "chip": chip,
        "core": core,
        "config_path": paths["config_path"],
        "menus": menus,
    }

    if not output_path:
        from kconfig.env import default_menus_export_path

        output_path = default_menus_export_path(sdk_root, target)

    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as fp:
        json.dump(payload, fp, indent=2, ensure_ascii=False)

    return output_path
