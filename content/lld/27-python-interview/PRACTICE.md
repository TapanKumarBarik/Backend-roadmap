# Python Internals & Architecture Practice Arena: 20 Drills

> **Track:** [Track 27: Python Interview Questions](README.md)  
> **Target Audience:** Python backend developers and architects preparing for senior and staff engineering interviews.  
> **Format:** 20 deliberate coding challenges dissecting CPython internals, data model dunder protocols, and concurrency.

---

## Part 1: CPython Data Model, Metaprogramming & Memory

- [ ] **Drill 01: Bytecode & Symbol Table Inspection ([Lesson 01](01-how-python-runs-your-code/README.md)):** Disassemble a function with `dis.dis()` to inspect `LOAD_FAST`, `LOAD_GLOBAL`, `STORE_FAST`, and explain why local variable lookup is significantly faster than global lookup.
- [ ] **Drill 02: Mutable Default Argument Reproduction & Fix ([Lesson 02](02-mutability-identity-and-copying/README.md)):** Write a function with a `data=[]` default argument, append to it across 3 calls, inspect `func.__defaults__`, and fix it using the `None` sentinel pattern.
- [ ] **Drill 03: Closures, Cells & Late-Binding Fix ([Lesson 03](03-functions-args-kwargs-closures-and-scope/README.md)):** Create a list of multiplier lambdas in a loop, inspect `lambda.__closure__[0].cell_contents`, and fix the late-binding trap using default arguments.
- [ ] **Drill 04: Parameterized Decorator Factory ([Lesson 04](04-decorators/README.md)):** Write a 3-level `@retry(max_retries=3, delay=1.0)` decorator using `@functools.wraps(func)` that catches network timeouts. Verify metadata (`__name__`, `__doc__`) is preserved.
- [ ] **Drill 05: Lazy Stream Pipeline with Generators ([Lesson 05](05-iterators-generators-and-yield/README.md)):** Build a memory-efficient log parser reading 100,000 lines using `(line for line in file if 'ERROR' in line)` with $O(1)$ RAM usage.
- [ ] **Drill 06: `__new__` vs `__init__` and `__slots__` ([Lesson 06](06-classes-init-new-and-slots/README.md)):** Implement a Singleton via `__new__`. Create a `Point` class with `__slots__ = ('x', 'y')` and benchmark memory usage against a standard class with `__dict__`.
- [ ] **Drill 07: Custom Collection via Dunder Protocols ([Lesson 07](07-dunder-methods-and-the-data-model/README.md)):** Build an immutable `DeckOfCards` implementing `__len__`, `__getitem__`, `__contains__`, and slicing support without inheriting from `list`.
- [ ] **Drill 08: C3 Linearization & Cooperative `super()` ([Lesson 08](08-inheritance-super-and-the-mro/README.md)):** Construct a diamond inheritance hierarchy (`A -> B, C -> D`) and manually calculate `D.mro()` before confirming with Python's MRO.
- [ ] **Drill 09: Structural Subtyping with `@typing.runtime_checkable` Protocol ([Lesson 09](09-abcs-protocols-duck-typing-and-type-hints/README.md)):** Define a `Renderable` protocol with `render() -> str`. Verify that classes matching the signature pass `isinstance(obj, Renderable)` without explicit inheritance.
- [ ] **Drill 10: Dataclass vs Pydantic Serialization ([Lesson 10](10-dataclasses-namedtuples-enums-and-pydantic/README.md)):** Benchmark validation speed and memory between `@dataclass(frozen=True)` and Pydantic `BaseModel`.
- [ ] **Drill 11: Reentrant Context Manager ([Lesson 11](11-context-managers/README.md)):** Build a database transaction context manager with `__enter__` and `__exit__` supporting nested transactions via SQL savepoints.
- [ ] **Drill 12: Exception Chaining & Custom Hierarchies ([Lesson 12](12-exceptions-done-right/README.md)):** Handle an internal `sqlite3.IntegrityError` and raise a domain `DuplicateUserError` using `raise ... from err`. Inspect `__cause__` and `__context__`.
- [ ] **Drill 13: Cyclic Garbage Collection & Weak References ([Lesson 13](13-memory-garbage-collection-and-performance/README.md)):** Create a circular reference (`a.b = b; b.a = a`). Inspect `gc.collect()`, `gc.garbage`, and break the cycle using `weakref.ref`.
- [ ] **Drill 14: GIL Measurement: CPU vs I/O Bounds ([Lesson 14](14-the-gil-threads-processes-and-asyncio/README.md)):** Benchmark running a CPU-heavy Fibonacci function across 4 `threading.Thread` vs 4 `multiprocessing.Process`. Observe why threads take 2x longer due to GIL thrashing.
- [ ] **Drill 15: Asyncio Task Gathering & Timeout ([Lesson 15](15-asyncio-in-depth/README.md)):** Write an asyncio crawler fanning out to 10 endpoints using `asyncio.TaskGroup` (Python 3.11+) or `asyncio.gather` with `asyncio.wait_for`.
- [ ] **Drill 16: Custom Descriptor Protocol ([Lesson 16](16-metaclasses-descriptors-and-property/README.md)):** Build a typed descriptor `ValidatedString(min_len=3, max_len=50)` that enforces validation on attribute assignment.
- [ ] **Drill 17: Circular Import Debugging ([Lesson 17](17-modules-packages-and-imports/README.md)):** Reproduce a circular import error between `models.py` and `services.py`, then resolve it using local imports and type guards (`if TYPE_CHECKING:`).
- [ ] **Drill 18: FastAPI vs WSGI Architecture ([Lesson 18](18-web-apps-app-run-wsgi-asgi-and-fastapi/README.md)):** Trace the ASGI receive/send callable contract and explain how Uvicorn event loops multiplex async requests.
- [ ] **Drill 19: Pytest Fixture Lifecycles & Mocks ([Lesson 19](19-testing-pytest-fixtures-and-mocking/README.md)):** Write a test suite with `yield` fixtures for database setup/teardown, `unittest.mock.patch` for external APIs, and monkeypatching environment variables.
- [ ] **Drill 20: 73-Question Rapid-Fire Python Revision ([Lesson 20](20-rapid-fire-python/README.md)):** Drill all 73 questions covering CPython, memory, typing, and backend frameworks.

