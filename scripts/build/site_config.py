"""Shared access to site.config.json for the Python build scripts (the Node scripts use scripts/lib/config.mjs).

Keeps the repo root and the list of curriculum folders in one place, so the generators do not each carry
their own copy of them."""
import json
import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

with open(os.path.join(ROOT, "site.config.json"), "r", encoding="utf-8") as _f:
    CONFIG = json.load(_f)

TRACK_DIRS = CONFIG["content"]["curricula"]
PLACEHOLDER_MARKER = CONFIG["content"]["placeholderMarker"]
PLACEHOLDER_SCAN_LINES = CONFIG["content"]["placeholderScanLines"]
WORDS_PER_MINUTE = CONFIG["content"]["wordsPerMinute"]
# Notes for whoever is writing the content (build status, hand-over files). They live beside the lessons in the
# repository but are not lessons, so the site neither lists, searches nor counts them.
IGNORED_FILES = set(CONFIG["content"]["ignoredFiles"])

_FENCE_RE = re.compile(r"```[\s\S]*?```")


def reading_facts(md_path):
    """(planned, minutes) for one lesson file.

    planned: the file still carries the placeholder sentence, so it is a promise, not a lesson.
    minutes: the reading time the module page shows (code blocks are not read, so they are not counted)."""
    try:
        with open(md_path, "r", encoding="utf-8") as f:
            raw = f.read()
    except OSError:
        return False, 0
    planned = PLACEHOLDER_MARKER in "\n".join(raw.split("\n")[:PLACEHOLDER_SCAN_LINES])
    words = len(_FENCE_RE.sub(" ", raw).split())
    return planned, max(1, int(words / WORDS_PER_MINUTE + 0.5))
