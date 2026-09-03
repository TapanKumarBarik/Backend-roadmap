#!/usr/bin/env python3
"""Regenerate search-index.json — a compact inverted word index over every
module's raw markdown body, so the command palette can match on content,
not just title/path/tags. Run alongside gen-docs-index.py:

    python scripts/gen-docs-index.py
    python scripts/gen-search-index.py
"""
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TRACK_DIRS = ["backend", "learn", "genai", "lld"]
SKIP_DIRS = {".git", "node_modules", "__pycache__"}

# Presence-only inverted index (word -> file indices), not term-frequency —
# keeps this simple and the output small. Client-side ranks by how many
# distinct query words a file matches.
TOKEN_RE = re.compile(r"[a-z0-9]+")
STOPWORDS = {
    "the", "and", "for", "are", "but", "not", "you", "your", "with", "this",
    "that", "from", "have", "has", "will", "can", "use", "used", "using",
    "into", "than", "then", "them", "they", "their", "there", "when",
    "where", "which", "while", "what", "who", "how", "why", "all", "any",
    "each", "some", "such", "only", "own", "same", "out", "about", "over",
    "under", "again", "once", "here", "more", "most", "other", "should",
    "would", "could", "also", "one", "two", "these", "those", "was", "were",
    "been", "being", "does", "did", "doing", "get", "gets", "got"
}
MIN_TOKEN_LEN = 3


def tokenize(text):
    return {
        t for t in TOKEN_RE.findall(text.lower())
        if len(t) >= MIN_TOKEN_LEN and t not in STOPWORDS and not t.isdigit()
    }


def collect_files(dir_path, out_files):
    entries = sorted(os.listdir(dir_path))
    for entry in entries:
        full = os.path.join(dir_path, entry)
        if os.path.isdir(full):
            if entry not in SKIP_DIRS:
                collect_files(full, out_files)
        elif entry.endswith(".md"):
            rel = os.path.relpath(full, ROOT).replace(os.sep, "/")
            out_files.append((rel, full))


def main():
    files = []
    for track in TRACK_DIRS:
        track_path = os.path.join(ROOT, track)
        if os.path.isdir(track_path):
            collect_files(track_path, files)
    files.sort(key=lambda f: f[0])

    file_paths = [f[0] for f in files]
    index = {}
    for i, (_rel, full) in enumerate(files):
        try:
            with open(full, "r", encoding="utf-8") as f:
                text = f.read()
        except OSError:
            continue
        for word in tokenize(text):
            index.setdefault(word, []).append(i)

    out = {"files": file_paths, "index": index}
    out_path = os.path.join(ROOT, "search-index.json")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(out, f, separators=(",", ":"), ensure_ascii=False)

    size_kb = os.path.getsize(out_path) / 1024
    print(f"Wrote {out_path} ({len(file_paths)} files, {len(index)} distinct words, {size_kb:.0f} KB)")


if __name__ == "__main__":
    sys.exit(main())
