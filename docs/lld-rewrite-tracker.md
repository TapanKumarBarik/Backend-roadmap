# LLD curriculum rewrite tracker

> **Rubric:** [`lld-quality-rubric.md`](lld-quality-rubric.md)  
> **Voice:** interview coach · **UI direction:** motion-first (scenes + studio) after Wave 1 content starts landing

Status: ⬜ Not started · 🟡 In progress / rewritten but not audit-complete · 🟢 Completed (all 12 rubric points verified) · ⏸ Deferred

> **Audit 2026-11-23:** 🟢 means *read in full, Python demos executed, links resolved, all 12 points checked.* Modules marked 🟡 "landed, unaudited" pass automated structure checks (callouts, Mermaid, Q&A tags, Try it, cheat sheet, no broken relative links) but have **not** been read in full. C# / Go / TS snippets are not compiled in CI; only Python is run-verified.

## Wave 1 — Interview core (do first)

| Module | Title | Status | Notes |
| :--- | :--- | :---: | :--- |
| `04-solid-principles` | SOLID Principles | 🟢 | Audited + fixed: added runnable OCP/LSP contract-test + Square demo, edges, anti-patterns, Try it. 8 Q&A |
| `05-core-design-principles` | DRY, KISS, YAGNI, LoD | 🟢 | Audited + fixed: runnable DRY drift demo, YAGNI before/after, thread-safe Wallet, decision flowchart, anti-patterns table |
| `06-creational-patterns` | Creational patterns | 🟢 | Audited + fixed: runnable Abstract Factory, Prototype shallow/deep, Singleton race vs safe, anti-patterns, Try it |
| `07-structural-patterns` | Structural patterns | 🟢 | Audited + fixed: runnable Composite + caching Proxy + Facade (with compensation edge), Try it list |
| `08-behavioral-patterns-i` | Behavioral I | 🟢 | Audited + fixed: runnable Observer / State / Template Method, Command edges, Try it list |
| `09-behavioral-patterns-ii` | Behavioral II | 🟡 | Full 12-point rewrite 2026-11-24 by [patterns/parking/playbook](46a321cd-e71a-4961-9d6c-10e38ccb5b8f); Python+C# run-verified; needs re-audit (prior 🟢 audit may be stale after rewrite) |
| `12-parking-lot-and-elevator` | Parking Lot & Elevator | 🟡 | Full 12-point rewrite 2026-11-24 by [patterns/parking/playbook](46a321cd-e71a-4961-9d6c-10e38ccb5b8f); 100-thread demo + race Try it kept; needs re-audit (prior 🟢 audit may be stale) |
| `15-splitwise-expense-sharing` | Splitwise | 🟡 | Full 12-point rewrite 2026-11-24 by [patterns/parking/playbook](46a321cd-e71a-4961-9d6c-10e38ccb5b8f); Python+C# run-verified; unaudited for 10/10 |
| `18-lru-lfu-cache-and-rate-limiter` | Cache & Rate Limiter | 🟡 | Full 12-point rewrite 2026-11-24 by [patterns/parking/playbook](46a321cd-e71a-4961-9d6c-10e38ccb5b8f); LRU/LFU O(1) + token/sliding + Redis Lua; Studio + rate-limiting links; unaudited |
| `21-lld-interview-playbook` | 45-minute playbook | 🟡 | Full 12-point rewrite 2026-11-24 by [patterns/parking/playbook](46a321cd-e71a-4961-9d6c-10e38ccb5b8f); timed protocol + meeting-room walkthrough; unaudited for 10/10 |

## Wave 2 — Foundations + classic problems

| Module | Title | Status | Notes |
| :--- | :--- | :---: | :--- |
| `00-programming-basics-python-and-csharp` | Programming basics | 🟢 | Audited 2026-11-23 (edge lab + BadCart). Refreshed 2026-11-24 by [LLD foundations](e14e6d6d-2278-4b31-ba65-adc3b50a15aa): full 12-point rubric, Python+C# carousel run-verified; edge lab still present |
| `01-classes-objects-and-oop-building-blocks` | Classes & OOP | 🟡 | Full 12-point rewrite 2026-11-24 by [LLD foundations](e14e6d6d-2278-4b31-ba65-adc3b50a15aa); Python+C# + Mermaid claimed run; unaudited for 10/10 |
| `02-oop-foundations-and-uml` | OOP & UML | 🟡 | Full 12-point rewrite 2026-11-24 by [LLD foundations](e14e6d6d-2278-4b31-ba65-adc3b50a15aa); Python+C# + Mermaid claimed run; unaudited for 10/10 |
| `03-generics-exceptions-and-value-objects` | Generics & VOs | 🟡 | Full 12-point rewrite 2026-11-24 by [LLD foundations](e14e6d6d-2278-4b31-ba65-adc3b50a15aa); Python+C# + Mermaid claimed run; unaudited for 10/10 |
| `10-concurrency-safe-design` | Concurrency-safe design | 🟢 | Audited 2026-11-23 (4-probe lab + striping). Refreshed 2026-11-24 by [LLD foundations](e14e6d6d-2278-4b31-ba65-adc3b50a15aa): ticket race demos run-verified; striping/try-lock content retained |
| `11-requirements-to-class-diagrams` | Requirements → diagrams | 🟡 | Full 12-point rewrite 2026-11-24 by [LLD foundations](e14e6d6d-2278-4b31-ba65-adc3b50a15aa); CRC + diagrams + race demo; unaudited for 10/10 |
| `13-library-and-vending-machine` | Library & Vending | 🟡 | Full rewrite by [Wave 2 classics](9e43c18e-0a27-49ba-952f-d11b74916943); Python+C# run-verified by author; unaudited for 10/10 |
| `14-tic-tac-toe-and-chess` | Tic-Tac-Toe & Chess | 🟡 | Full rewrite (same batch); long (~1100 lines) — split candidate; unaudited for 10/10 |
| `16-movie-ticket-booking` | Movie booking | 🟡 | Verified 2026-11-23: single runnable Python block (`__main__`, 16-thread race, expiry, refund) executes → `booking ok`. Anti-pattern fragment is a `text` fence, now also introduced by a prose line "ANTI-PATTERN — not runnable". Not yet fully read/audited |
| `17-ride-sharing` | Ride sharing | 🟡 | Verified 2026-11-23: single runnable Python block executes → `ride-sharing ok`. Anti-pattern fragment (`nearest_available`) is a `text` fence, now also introduced by prose "ANTI-PATTERN — not runnable". Not yet fully read/audited |

## Wave 3 — Capstones + interview banks

| Module | Title | Status | Notes |
| :--- | :--- | :---: | :--- |
| `19-api-library-design-and-di` | API & DI | 🟡 | Full rewrite by [Wave 3 + Python](b54a00e3-43ef-4d1c-b99d-012a606e7f53); Python+C# claimed run; unaudited for 10/10 |
| `20-anti-patterns-and-code-smells` | Anti-patterns | 🟡 | Full rewrite (same batch); unaudited for 10/10 |
| `22-capstone-project` | Capstone | 🟡 | Full rewrite (same batch); unaudited for 10/10 |
| `23-supply-chain-platform` | Supply chain | 🟡 | Full rewrite (same batch); unaudited for 10/10 |
| `24-oop-interview-questions` | OOP Q bank | 🟡 | Hub rewrite (same batch); unaudited for 10/10 |
| `25-design-patterns-one-at-a-time` | 30 patterns | 🟡 | Hub rewrite (same batch); unaudited for 10/10 |
| `26-csharp-and-dotnet-interview` | C# interview | 🟡 | Hub rewrite (same batch); unaudited for 10/10 |
| `27-python-interview` | Python interview | 🟡 | All 20 lessons audited ~9–9.5 by [remaining Python audit](56c583b4-9f75-4622-857e-06e968cf5bd5) (Python run-verified). Hub ~9. Not 🟢 until a fresh end-to-end pass with no concurrent overwrites |

## Python interview lessons (track 27) — audited 2026-11-23

Rubric applied Python-primary. Every added snippet was executed; asserts fail loudly if the claim is wrong.

| Lesson | Before | After | What changed |
| :--- | :---: | :---: | :--- |
| `27/README` (hub) | 7.5 | 9 | Self-scoring after the seven-trap file, why trap 4 prints `2 0 0` and trap 7 `D>B>C>A`, trap 6 mapped to lesson 02, Q8 on tuple `+=` |
| `01-how-python-runs-your-code` | 8 | 9.5 | Try it referenced a non-existent `x = 10`; replaced by a runnable 4-probe lab (small-int identity built at run time, `LOAD_GLOBAL` count vs local, import caching via `sys.modules`, constant folding in `co_consts`) with expected output |
| `02-mutability-identity-and-copying` | 8 | 9.5 | Escaped `\|=` that was breaking a table row; labelled the predict-the-output fragment (raises on purpose); five new edges (`a += b` vs `a = a + b`, `dict.fromkeys`, dataclass mutable default, `__eq__` without `__hash__`, sentinels); runnable 7-probe lab + 3 predict-first exercises |
| `03-functions-args-kwargs-closures-and-scope` | 8 | 9.5 | Try it inspected a non-existent `adders[0]`; added the missing expected output; the "evaluated once" bullet conflated mutable defaults with late binding (rewritten); explained why `describe(a=1, …)` says *missing* (the keyword goes into `**extras`); 9-probe scope lab (`UnboundLocalError` from a later assignment, `global`/`nonlocal`, `**kwargs` copy, duplicate key, three late-binding fixes, `itertools.count` under 4 threads, `RecursionError`) |
| `04-decorators` | 8.5 | 9.5 | Stacking order, `@log` vs `@log(...)`, sync/async decorator, production retry (backoff + jitter + only transient errors) were described but never shown; added runnable lab with asserts and 4 follow-up exercises |
| `05-iterators-generators-and-yield` | 8 | 9.5 | Q8 said Python generators "compile to a state machine" (CPython keeps a suspended frame; only C# rewrites to one) — corrected; Try it vague; added the real expected output (`[read]` stops at line 4); 13-probe lab (iter protocol by hand, `__getitem__` fallback, reusable iterable, late errors, eager outermost iterable, `StopIteration.value`, PEP 479, `close()`/`GeneratorExit`, `send()` priming, `generator already executing`, `tee`) |
| `06-classes-init-new-and-slots` | 8 | 9.5 | Try it used `acct` (variable is `a`); slots edge was imprecise (multiple-inheritance wording, "pickle needs `__getstate__`" is only for protocols 0/1) — each now proven; added expected output; 11-probe lab incl. a *deterministic* singleton race (4 threads → 4 "singletons", fixed with `Lock`), `__init__` skipped when `__new__` returns another type, slots vs `cached_property`/`__weakref__`, measured ~30% memory saving |
| `07-dunder-methods-and-the-data-model` | 8 | 9.5 | Try it now states the exact failure; expected output added (mixed-currency error is Python's generic text); C# `CompareTo` ignored currency — flagged; new edges (reflected-operator priority for subclasses, `==` falling back to identity); 13-probe lab (repr in containers, hash drift corrupting a set, `__bool__`/`__len__` order, `__iadd__` vs `__add__`, instance-level dunder ignored, `@total_ordering`, `__format__`) |
| `08-inheritance-super-and-the-mro` | 8 | 9.5 | No expected output (the `log` order surprised readers — explained); lab proves what the text only asserted: explicit `A.hello(self)` runs the base **twice**, mixin on the wrong side is never reached, leftover kwargs reach `object.__init__` (exact message), `super(B, obj)`, inconsistent MRO, `Stack(list)` leak, mutable `Square(Rectangle)` LSP break (11 probes) |
| `09-abcs-protocols-duck-typing-and-type-hints` | 8 | 9.5 | Ran `mypy` on the lesson file: it reports 3 errors on the deliberate misuse lines and a 4th once `charge` is removed — Try it now says exactly that. `@runtime_checkable` claim corrected (`isinstance` works for data members, `issubclass` is refused); added `register()` caveat, version notes, expected output; 11-probe lab (incl. a real `mypy -c` probe, skipped if absent) |
| `10-dataclasses-namedtuples-enums-and-pydantic` | 8 | 9.5 | Try it referenced a non-existent `Point` (class is `OrderLine`); pydantic tab mislabelled "snippet" though it runs; added expected output and 2 edges (frozen-but-hashing-a-list, `datetime.now()` default is accepted but frozen at class creation); 11-probe lab (`unsafe_hash`, `kw_only`, `InitVar`, `asdict` copy, `slots=True`, NamedTuple vs dataclass equality, Enum alias/`@unique`/`IntEnum`/`StrEnum` JSON, pydantic lax vs strict) |
| `11-context-managers` | 8.5 | 9.5 | Added expected output (and flagged that `['<b>']` is deliberate); new edges (partial setup, `NamedTemporaryFile(delete=False)`, generator managers are single-use — error type differs by version); 11-probe lab (exit on `return`/`continue`, failed `__enter__`, `__exit__` raising chains `__context__`, `ContextDecorator`, `ExitStack` unwinding after a failed open, `nullcontext`) |
| `12-exceptions-done-right` | 8.5 | 9.5 | Claim check found one wrong assumption of mine (any `from` sets `__suppress_context__`, not just `from None`); added edges for `return`-in-`finally` (3.14 `SyntaxWarning`), `as e` deletion, `str(KeyError)` quoting; expected output; 14-probe lab incl. unreachable clause order, bare `except` vs `Ctrl-C`, thread `excepthook`, silent failed asyncio task, a deterministic EAFP-vs-LBYL race |
| `13-memory-garbage-collection-and-performance` | 8.5 | 9.5 | Already had correct expected output; Try it improved; the lesson claimed leaks but never reproduced the two classic ones — lab now does (`lru_cache(maxsize=None)` pins arguments, `err.__traceback__` pins frame locals), plus PEP 442 `__del__` cycles, aliased `+=` ≫ `join`, `WeakValueDictionary`, bounded vs unbounded cache under `tracemalloc` (11 probes; timing probes assert direction only) |
| `14-the-gil-threads-processes-and-asyncio` | 8 | 9.5 | The lesson's own unlocked counter prints exactly 400000 on 3.13, so it never showed the bug; added deterministic lost-update, measured event-loop stall vs `to_thread`, measured `Semaphore` cap, `run_in_executor` + process pool, with expected output |
| `15-asyncio-in-depth` | 8.5 | 9.5 | Try it told readers to swap an `asyncio.sleep(0.1)` that does not exist; rewritten and verified — swapping in `time.sleep` also makes the `timeout:` line vanish (a deadline can't fire while the loop is blocked), now an Edge; C# "Tasks run on the thread pool" corrected to SynchronizationContext/thread-pool continuations; removed unused `HttpClient`; expected output; 11-probe lab (never-awaited warning, `gather` leaves siblings running vs `TaskGroup` cancels, swallowed `CancelledError`, read-modify-write across `await` = 1 vs 100 with `Lock`, semaphore peak = 3, `run_coroutine_threadsafe`, debug-mode slow-callback log) |
| `16-metaclasses-descriptors-and-property` | 8 | 9.5 | `property` setter error text is outdated on 3.11+ (fixed); no expected output (added, with the hook order explained); lab reproduces the shared-state-on-descriptor bug, `__set_name__` skipped on late assignment, member descriptors, `cached_property` writing to `__dict__`, `__init_subclass__` kwargs, metaclass conflict, `type()` classes, metaclass singleton, `__getattribute__` recursion (13 probes) |
| `17-modules-packages-and-imports` | 8.5 | 9.5 | The demo left a temp package and `sys.path` entry behind (now cleaned up); added expected output; lab launches real subprocesses: `no known parent package` vs `-m`, a file imported under two names runs twice, local `json.py` shadows stdlib, `TYPE_CHECKING` cycle break, lazy import, half-built module visible in `sys.modules`; found that a same-size edit + `reload` can run a stale `.pyc` (documented) (11 probes) |
| `18-web-apps-app-run-wsgi-asgi-and-fastapi` | 8 | 9.5 | Section 5 silently needs `fastapi httpx` — install note added; expected output added; lab: `wsgiref` serving the callable (what `app.run()` is), WSGI/ASGI middleware ordering and `send` wrapping, process workers don't share memory, `Depends` cache vs `use_cache=False`, 422 `loc`, domain-error handler → 409, and the headline claim **measured on a real uvicorn server**: 4 parallel 0.2 s blocking calls take ~0.8 s via `async def`, ~0.2 s via `def` (8 probes; FastAPI probes skip without the packages) |
| `19-testing-pytest-fixtures-and-mocking` | 8.5 | 9.5 | `pytest -p random` is not a plugin (→ `pytest-randomly`/`xdist`); `datetime.utcnow` default is deprecated (→ `now(timezone.utc)`); stale `1.51s` in expected output; lab runs **real pytest sessions** on throwaway files: patch where looked up, `create_autospec` arity check vs `Mock(spec=)`, `MagicMock` magic methods, `datetime` can't be patched, teardown runs on failure but not on setup error, session vs function scope, `conftest.py` discovery, `monkeypatch` undo, strict `xfail` (13 probes) |
| `20-rapid-fire-python` | 8 | 9 | **Another agent shrank/rewrote this file (36 KB → 22 KB) mid-audit**; audited the new version: its single block runs and passes, but the ~80 table answers were never executed — lab now asserts the uncovered ones (dict mutation during iteration, `zip(strict=True)`, tuple hash, pass-by-object-reference, truthiness, Decimal-from-float, stable `reverse=True`, dict order after re-insert, `deque` vs `list.insert(0)`, `lru_cache`, `Counter` ties; found `sum()` of floats is compensated on 3.12+, so a naive "sum drifts" claim would be wrong). Added expected output + 3.14 `finally`-return warning. Not 9.5: version-sensitive one-liners remain unverifiable per-version |

Scores are the author's rubric estimate (12 points, 0–10 scale), not an automated metric.

> **Conflict note:** [Wave 3 + Python](b54a00e3-43ef-4d1c-b99d-012a606e7f53) rewrote all 20 lessons after/while [quality pass](196f0efb-8c1d-4bb0-aa59-e43fe2bca559) hardened 01/02/04/14. Lesson 14 still has the quality labs; 01/02/04 may need a re-pass if probe labs were overwritten. Audit of 03, 05–13, 15–20 completed 2026-11-23 via [remaining Python audit](56c583b4-9f75-4622-857e-06e968cf5bd5): every `python` block in all 20 lessons (including the new labs) was extracted and executed on Python 3.13 (02's first fragment raises on purpose); relative links and `#try-it--…` anchors resolve; no BOMs or mojibake; files left LF (index is LF). Lessons 03, 05–13, 15–20 all now carry a labelled runnable lab with asserts plus expected output next to the main demo. Re-run all blocks if another agent rewrites a lesson again (lesson 20 changed size mid-audit).

## Python refresher (`content/learn/00-python-refresher/`)

Upgraded by [Wave 3 + Python](b54a00e3-43ef-4d1c-b99d-012a606e7f53): root + modules `00`–`08` gained NOTE/TIP, edges, mini Q&A, cheat sheets; examples run-verified. Status: 🟡 landed, not 10/10-audited.

## Product decisions (locked 2026-11-23)

| Decision | Choice |
| :--- | :--- |
| 90-day outcome | Interview prep (LLD + System Design), not equal polish of all 7 areas |
| Lesson voice | Interview coach |
| UI direction | Motion-first (scenes, studio, step scrubbers) after clarity + Wave 1 content |
| Scope of cool UI | Landing + reading + practice first |
| Next after Wave 1 start | Finish Wave 1 modules → landing/reading visual pass → Wave 2 |
