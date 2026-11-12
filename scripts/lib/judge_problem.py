"""Runs one coding problem's tests the way the browser does, with ordinary Python (scripts/check/check-code-problems.mjs uses it).

Reads {"code": "...", "tests": [{"name": null | "...", "code": "..."}]} (or {"snippet": "..."}) from standard input and prints what the harness returns, as JSON, with
the seconds it took. The harness is webapp/public/runner/harness.py, the very file the browser loads into Pyodide, so a problem that passes
here passes there.
"""
import importlib.util
import json
import os
import sys
import time

sys.dont_write_bytecode = True  # the harness sits in webapp/public/runner, which is copied into the site: no __pycache__ beside it

HARNESS = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "webapp", "public", "runner", "harness.py")

spec = importlib.util.spec_from_file_location("harness", HARNESS)
harness = importlib.util.module_from_spec(spec)
spec.loader.exec_module(harness)

job = json.load(sys.stdin)
started = time.perf_counter()
if "snippet" in job:  # a piece of code from a lesson, run on its own
    result = harness.run_snippet(job["snippet"])
else:
    result = harness.run_all(job["code"], [t["code"] for t in job["tests"]], [t["name"] for t in job["tests"]])
result["seconds"] = round(time.perf_counter() - started, 3)
json.dump(result, sys.stdout)
