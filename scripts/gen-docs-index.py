#!/usr/bin/env python3
"""Regenerate docs-index.json by scanning the repo for README.md / *.md files.

Run this whenever files/folders under backend/, learn/, genai/ change:
    python scripts/gen-docs-index.py
"""
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from tags import tags_for  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TRACK_DIRS = ["backend", "learn", "genai", "lld"]
SKIP_DIRS = {".git", "node_modules", "__pycache__"}

TITLE_RE = re.compile(r"^#\s+(.+?)\s*$")


def extract_title(md_path, fallback):
    try:
        with open(md_path, "r", encoding="utf-8") as f:
            for line in f:
                m = TITLE_RE.match(line.strip())
                if m:
                    return m.group(1)
    except OSError:
        pass
    return fallback


def humanize(name):
    name = re.sub(r"^\d+[-_.]?", "", name)
    return name.replace("-", " ").replace("_", " ").strip().title()


def build_node(dir_path):
    name = os.path.basename(dir_path)
    rel_dir = os.path.relpath(dir_path, ROOT).replace(os.sep, "/")
    own_readme = os.path.join(dir_path, "README.md")
    file_rel = None
    title = humanize(name)
    own_tags = []
    if os.path.isfile(own_readme):
        file_rel = os.path.relpath(own_readme, ROOT).replace(os.sep, "/")
        title = extract_title(own_readme, humanize(name))
        own_tags = tags_for(own_readme, file_rel)

    children = []
    entries = sorted(os.listdir(dir_path))
    for entry in entries:
        full = os.path.join(dir_path, entry)
        if os.path.isdir(full) and entry not in SKIP_DIRS:
            child = build_node(full)
            if child is not None:
                children.append(child)
        elif entry.endswith(".md") and entry != "README.md":
            rel = os.path.relpath(full, ROOT).replace(os.sep, "/")
            children.append({
                "name": entry,
                "path": rel_dir,
                "file": rel,
                "title": extract_title(full, entry),
                "tags": tags_for(full, rel),
                "children": [],
            })

    if file_rel is None and not children:
        return None

    return {
        "name": name,
        "path": rel_dir,
        "file": file_rel,
        "title": title,
        "tags": own_tags,
        "children": children,
    }


def main():
    tree = []
    for track in TRACK_DIRS:
        track_path = os.path.join(ROOT, track)
        if os.path.isdir(track_path):
            node = build_node(track_path)
            if node is not None:
                tree.append(node)

    # global tag catalogue, so the viewer can offer them without re-walking the tree
    catalogue = {}
    untagged = []

    def collect(nodes):
        total = 0
        for n in nodes:
            if n["file"]:
                total += 1
                if not n.get("tags"):
                    untagged.append(n["file"])
                for t in n.get("tags", []):
                    catalogue[t] = catalogue.get(t, 0) + 1
            total += collect(n["children"])
        return total

    n_files = collect(tree)

    out = {
        "tree": tree,
        "tags": dict(sorted(catalogue.items(), key=lambda kv: (-kv[1], kv[0]))),
    }
    out_path = os.path.join(ROOT, "docs-index.json")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(out, f, indent=2, ensure_ascii=False)

    print(f"Wrote {out_path} ({n_files} files indexed, {len(catalogue)} distinct tags)")
    if untagged:
        print(f"  WARNING: {len(untagged)} file(s) received no tags:")
        for u in untagged[:10]:
            print(f"    {u}")


if __name__ == "__main__":
    sys.exit(main())
