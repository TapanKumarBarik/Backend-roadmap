The Python runner of the practice screens
==========================================

py-worker.js   the web worker: loads Pyodide and runs a learner's code against a problem's tests
harness.py     how a solution is judged (the same file is run by scripts/dev/check-code-problems.mjs with ordinary Python)
pyodide-314.0.7/   Pyodide 314.0.7, unmodified: CPython compiled to WebAssembly

Pyodide is made by the Pyodide contributors and is licensed under the Mozilla Public License 2.0 (see package.json in its folder).
Source and licence: https://github.com/pyodide/pyodide . Obtained with `npm pack pyodide@314.0.7`; the files here are the ones
named pyodide.mjs, pyodide.asm.mjs, pyodide.asm.wasm, python_stdlib.zip and pyodide-lock.json from that package.

The folder name carries the version so that the browser can keep the files for good (webapp/public/_headers). To upgrade, add the new
version's folder, point py-worker.js at it, and delete the old one.

Nothing a learner writes leaves their browser: the code runs in a worker on their own machine.
