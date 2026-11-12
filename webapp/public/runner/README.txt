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

sql-worker.js  the web worker of the SQL problems: loads SQLite (sql.js) and sql-core.js, and runs a learner's query on a fresh in-memory copy of a problem's data
sql-core.js    what a SQL job is (the same file is run by scripts/lib/sqlEngine.mjs, with Node, to check the problems)
sqljs-1.15.2/  sql.js 1.15.2, unmodified: SQLite 3.54 compiled to WebAssembly (sql-wasm.js and sql-wasm.wasm)

sql.js is made by its contributors and is licensed under the MIT license (LICENSE in its folder); SQLite is in the public domain.
Source and licence: https://github.com/sql-js/sql.js . Obtained with `npm pack sql.js@1.15.2`; the files here are dist/sql-wasm.js and dist/sql-wasm.wasm
from that package. To upgrade, add the new version's folder, point sql-worker.js at it, and delete the old one.

Nothing a learner writes leaves their browser: the code runs in a worker on their own machine.
