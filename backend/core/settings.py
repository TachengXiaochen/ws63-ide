"""Load backend defaults (like idf.py user config merge)."""

from __future__ import annotations

import json
import os
from typing import Any, Dict

from core.paths import CONFIG_DIR


def load_defaults() -> Dict[str, Any]:
    path = os.path.join(CONFIG_DIR, "defaults.json")
    with open(path, encoding="utf-8") as fp:
        return json.load(fp)
