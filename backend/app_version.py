"""Application compatibility version shared with the frontend bundle."""

from __future__ import annotations

import json
from pathlib import Path

DEFAULT_COMPAT_VERSION = "dev"
COMPAT_FILE = Path(__file__).resolve().parent.parent / "app_compat.json"


def load_compat_version(path: Path = COMPAT_FILE) -> str:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return DEFAULT_COMPAT_VERSION

    version = data.get("compat_version")
    if not isinstance(version, str) or not version.strip():
        return DEFAULT_COMPAT_VERSION
    return version.strip()


APP_COMPAT_VERSION = load_compat_version()
