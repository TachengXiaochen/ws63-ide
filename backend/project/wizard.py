"""New application wizard — standalone template."""

from __future__ import annotations

import json
import os
from dataclasses import dataclass, field
from typing import List, Optional

from project.patcher import (
    PatchResult,
    patch_application_cmake,
    patch_application_kconfig,
    patch_target_ram_component,
    validate_registration,
)
from project.schema import component_name, to_upper, validate_project_name


@dataclass
class WizardResult:
    name: str
    template: str
    target: str
    created_files: List[str] = field(default_factory=list)
    patches: List[PatchResult] = field(default_factory=list)
    dry_run: bool = False

    def to_json(self) -> str:
        return json.dumps(
            {
                "name": self.name,
                "template": self.template,
                "target": self.target,
                "dry_run": self.dry_run,
                "created_files": self.created_files,
                "patches": [p.__dict__ for p in self.patches],
            },
            indent=2,
            ensure_ascii=False,
        )


def _template_dir() -> str:
    return os.path.join(os.path.dirname(__file__), "templates", "standalone")


def _render(template_name: str, mapping: dict) -> str:
    path = os.path.join(_template_dir(), template_name)
    with open(path, encoding="utf-8") as fp:
        content = fp.read()
    for key, val in mapping.items():
        content = content.replace(f"{{{{{key}}}}}", val)
    return content


def create_standalone(
    sdk_root: str,
    name: str,
    target: str = "ws63-liteos-app",
    title: Optional[str] = None,
    register: bool = True,
    dry_run: bool = False,
) -> WizardResult:
    validate_project_name(name)
    upper = to_upper(name)
    component = component_name(name)
    display = title or name.replace("_", " ").title()

    app_dir = os.path.join(sdk_root, "application", name)
    if os.path.exists(app_dir):
        raise FileExistsError(f"application/{name} already exists")

    mapping = {
        "name": name,
        "NAME": upper,
        "component": component,
        "title": display,
    }

    files = {
        os.path.join(app_dir, "CMakeLists.txt"): _render("CMakeLists.txt.tpl", mapping),
        os.path.join(app_dir, "Kconfig"): _render("Kconfig.tpl", mapping),
        os.path.join(app_dir, "inc", ".gitkeep"): "",
        os.path.join(app_dir, "src", f"{name}_main.c"): _render("src_main.c.tpl", mapping),
        os.path.join(app_dir, ".ws63-ide.json"): json.dumps(
            {"name": name, "template": "standalone", "target": target, "component": component},
            indent=2,
        ),
    }

    result = WizardResult(name=name, template="standalone", target=target, dry_run=dry_run)

    if not dry_run:
        for path, content in files.items():
            os.makedirs(os.path.dirname(path), exist_ok=True)
            with open(path, "w", encoding="utf-8") as fp:
                fp.write(content)
            result.created_files.append(path)
    else:
        result.created_files = list(files.keys())

    if register:
        result.patches.append(patch_application_cmake(sdk_root, name, dry_run))
        result.patches.append(patch_application_kconfig(sdk_root, name, upper, display, dry_run))
        result.patches.append(patch_target_ram_component(sdk_root, target, component, dry_run))

    return result


def validate_project(sdk_root: str, name: str, target: str = "ws63-liteos-app") -> List[str]:
    validate_project_name(name)
    return validate_registration(sdk_root, name, component_name(name), target)
