"""Shared access to site.config.json for the Python build scripts (the Node scripts use scripts/lib/config.mjs).

Keeps the repo root and the list of curriculum folders in one place, so the generators do not each carry
their own copy of them."""
import json
import os

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

with open(os.path.join(ROOT, "site.config.json"), "r", encoding="utf-8") as _f:
    CONFIG = json.load(_f)

TRACK_DIRS = CONFIG["content"]["curricula"]
