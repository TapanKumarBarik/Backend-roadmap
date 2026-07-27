# Module 03: Integration Testing

## Why this matters

Your unit tests replaced every real collaborator with a double — that's what
made them fast and precise. But it also means they can *all pass while the app
is completely broken*. A fake repository can't have a SQL typo. A stubbed DB
can't reject a row for a constraint violation. A service tested in isolation
never proves it's actually *wired* to the route, that the Pydantic model
serializes the way the client expects, or that your session commits when you
think it does. Unit tests verify the pieces; **integration tests verify the
pieces fit together** — real database, real ORM, real FastAPI routing — which
is exactly the class of bug isolation hides. This is the middle of the pyramid,
and it exists because "every unit works" and "the assembled system works" are
different claims.

The reason there are *fewer* integration tests than unit tests is that this
truthfulness costs you: they touch real I/O, so they're slower, and they
require real setup and teardown to stay isolated from each other. A test that
leaves rows behind poisons the next test; a test that shares a database with a
parallel run gets nondeterministic results. So the craft of integration testing
is largely the craft of **test data lifecycle** — giving each test a clean,
known database state and guaranteeing it's cleaned up whether the test passes,
fails, or explodes. You'll test a real service against a real (test) database,
drive FastAPI endpoints through `TestClient` and `httpx`, master transaction-
rollback and truncate strategies for isolation, and meet **testcontainers** as
the way to get a production-grade database into your test run on demand.

## Concepts

### What integration tests cover that unit tests can't

An integration test exercises **two or more real components across a boundary**
— typically your code plus a real database, or an HTTP client plus your real
routing/serialization stack. It catches the bugs that live *in the seams*:

- **Wrong SQL / ORM mapping** — a mistyped column, a bad join, a missing index
  causing a constraint error, a relationship that doesn't load. A fake repo
  can't reproduce any of these.
- **Wiring mistakes** — the route calls the wrong service, a dependency isn't
  overridden, a transaction isn't committed, the session is shared across
  requests when it shouldn't be.
- **Serialization contracts** — the response model drops a field, renders a
  `datetime` in the wrong format, or a `422` comes back where you expected
  `400`. Only a real request through the real stack proves the wire shape.
- **Real constraint & transaction behavior** — unique violations, foreign keys,
  cascades, and whether a rolled-back transaction actually undoes writes.

The rule for what belongs here: if the *interaction between real components* is
the thing that could break, it's an integration test. If it's pure logic, push
it down to a unit test — don't re-test business rules through the database.

### Testing a service against a real (test) database

To test data-layer code truthfully you point it at a **real database dedicated
to tests** — never the dev or prod database. Two dimensions to get right:
*which* database engine, and *how each test gets a clean slate*.

On the engine: prefer the **same engine you run in production** (Postgres for
Postgres). SQLite-in-memory is tempting because it's instant, but it has
different SQL dialect, type affinity, and constraint behavior, so a green SQLite
test can hide a Postgres bug — an integration test that lies defeats its own
purpose. Use real Postgres (via a container, below) for anything that touches
Postgres-specific behavior.

```python
# a session fixture bound to a real test database
@pytest.fixture
def db_session(engine):
    connection = engine.connect()
    txn = connection.begin()                 # open a transaction
    session = Session(bind=connection)
    yield session                            # test runs inside the transaction
    session.close()
    txn.rollback()                           # undo everything the test wrote
    connection.close()
```

That rollback pattern is the workhorse of DB isolation — covered next.

### Test isolation: rollback, truncate, and a fresh schema

Each integration test must start from a **known state** and leave **no trace**,
or tests contaminate each other and order starts to matter. Three strategies,
fastest to most thorough:

- **Transaction rollback per test** — begin a transaction before the test, run
  the test inside it, `rollback()` after. Nothing is ever committed, so the DB
  is pristine for the next test and cleanup is instant. Fast and clean; the
  catch is code that manages its *own* commits/transactions needs care (nested/
  savepoint transactions) so it doesn't defeat the outer rollback.
- **Truncate tables between tests** — let the test commit, then `TRUNCATE` (or
  delete) all tables in a teardown fixture. Slower than rollback but handles
  code that commits internally, and closer to real runtime behavior.
- **Fresh schema per run/module** — create the schema (and optionally reseed)
  once per session or module, combined with one of the above per test. Creating
  tables is expensive, so scope it wide (module 01's fixture scopes); the
  per-test isolation stays narrow.

The teardown must run **whether the test passes or fails** — that's exactly what
a `yield` fixture guarantees (module 01). A test that only cleans up on success
leaves the database dirty the moment it fails, cascading failures into unrelated
tests.

### Testing FastAPI routes with TestClient and httpx

FastAPI gives you an in-process way to make real HTTP requests against your app
without binding a port: `TestClient` (Starlette's sync client, built on
`httpx`) and, for async tests, `httpx.AsyncClient` with an ASGI transport. The
request goes through your *actual* middleware, routing, validation,
dependencies, and serialization — so this is a genuine integration test of the
web layer, just without a network socket.

```python
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def test_create_and_read_task():
    r = client.post("/v1/tasks", json={"title": "write tests"})
    assert r.status_code == 201
    task_id = r.json()["id"]

    r2 = client.get(f"/v1/tasks/{task_id}")
    assert r2.status_code == 200
    assert r2.json()["title"] == "write tests"
```

For async apps and async DB drivers you use the httpx `AsyncClient` with
`ASGITransport` under `pytest-asyncio` so the whole path (including `async def`
dependencies) runs on the event loop. Either way you assert on the real
`status_code`, headers, and JSON body — the client's contract, not internals.

### Wiring the test app to the test database (dependency overrides)

The endpoint under test asks for a DB session via `Depends(get_db)`. In a test
you don't want it opening a *production* session — you want it bound to your
isolated test transaction. FastAPI's **dependency override** lets you swap the
provider for the duration of the test:

```python
def override_get_db():
    # yields the same transaction-scoped session your fixture set up
    yield test_session

app.dependency_overrides[get_db] = override_get_db
# ... run requests via TestClient ...
app.dependency_overrides.clear()     # always undo it afterward
```

This is the seam that connects the two halves of this module: the route runs
for real, but its data dependency points at the test database with per-test
isolation. (Module 04 goes deep on overrides for *external* services — payments,
email — using the exact same mechanism.) The important discipline is
**clearing overrides** after each test so they don't leak into others; a fixture
with `yield` does this reliably.

### Testcontainers: a real database, on demand, disposable

Where does the "real test Postgres" come from? Hardcoding a shared database
means tests fight each other and depend on someone's machine being set up
right. **Testcontainers** is the pattern (and library) that starts a *real*
Postgres (or Redis, or anything) in a throwaway Docker container at test time,
hands your suite its connection URL, and destroys it when the run ends. You get
production-fidelity behavior with zero shared state and nothing to install
globally — the container is created fresh, used, and thrown away.

```python
from testcontainers.postgres import PostgresContainer

@pytest.fixture(scope="session")
def engine():
    with PostgresContainer("postgres:16") as pg:   # real Postgres in Docker
        eng = create_engine(pg.get_connection_url())
        create_all(eng)                            # build schema once
        yield eng                                  # torn down at session end
```

Because starting a container is expensive, you scope it `session` (module 01)
and layer fast per-test rollback isolation on top. This is the bridge to CI
(module 07 and track 13): the same container-based approach that gives you a
clean DB locally gives your CI pipeline one too, with no external database to
provision. The concept is the point here — a real, isolated, disposable
dependency — more than any one library's API.

## Command reference

| Tool / construct | Purpose |
|---|---|
| `pip install httpx pytest-asyncio testcontainers[postgres] sqlalchemy` | Integration-testing toolkit |
| `TestClient(app)` | In-process sync HTTP client through the real app |
| `httpx.AsyncClient(transport=ASGITransport(app=app))` | Async in-process client |
| `@pytest.mark.asyncio` | Run an `async def` test (pytest-asyncio) |
| `app.dependency_overrides[dep] = fn` | Swap a `Depends` provider in tests |
| `app.dependency_overrides.clear()` | Remove overrides (do this in teardown) |
| `connection.begin()` / `txn.rollback()` | Per-test transaction isolation |
| `TRUNCATE TABLE ... CASCADE` | Reset tables between committing tests |
| `PostgresContainer("postgres:16")` | Spin up a disposable real Postgres |
| `pytest -m "integration"` | Run only tests marked integration |
| `pytest -m "not integration"` | Skip slow integration tests (fast inner loop) |

Marking integration tests so you can run the fast set alone (register the marker
in `pyproject.toml` to avoid warnings):

```toml
[tool.pytest.ini_options]
markers = ["integration: touches a real database or external service"]
```

```python
@pytest.mark.integration
def test_repo_persists_and_reads_back(db_session):
    repo = TaskRepository(db_session)
    created = repo.create(title="ship it")
    fetched = repo.get(created.id)
    assert fetched.title == "ship it"        # proves the real round-trip
```

A complete route-level integration test with overrides and rollback isolation:

```python
# conftest.py
@pytest.fixture
def client(db_session):
    def _get_db():
        yield db_session                      # the transaction-scoped session
    app.dependency_overrides[get_db] = _get_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()          # never leak the override

# test_tasks_api.py
@pytest.mark.integration
def test_create_returns_201_and_persists(client):
    r = client.post("/v1/tasks", json={"title": "write tests"})
    assert r.status_code == 201
    assert r.headers["location"].endswith(f"/v1/tasks/{r.json()['id']}")
```

## Hands-on exercises

Work in `testing-lab/`. You'll need Docker running for the testcontainers
exercises. Bring in the layered FastAPI service (handlers → service →
repository) you built in track 02.

### 1. Prove a fake can lie

Write a unit test of your `TaskRepository` using an *in-memory fake*, then a
real SQL bug into the actual repository (e.g. a wrong column name in the query).
Confirm the fake-based test still passes. Sit with that: your unit test is green
and the data layer is broken. This is *why* the middle of the pyramid exists.

### 2. Stand up a real test database with testcontainers

Add a `session`-scoped `engine` fixture using `PostgresContainer("postgres:16")`
that creates your schema once. Write one integration test that inserts a row via
the real repository and reads it back, asserting the round-trip. Re-run the
buggy repo from exercise 1 against this — now it fails, as it should.

### 3. Per-test rollback isolation

Add a `db_session` fixture that opens a transaction, yields a session, and rolls
back in teardown. Write two tests that each insert a task with the *same* unique
title. If isolation works, both pass independently (neither sees the other's
row). Remove the rollback and watch the second fail on a unique-violation —
that's the isolation you just built, proven.

### 4. Drive a route with TestClient

Wire a `client` fixture that overrides `get_db` to your test session and yields
a `TestClient`. Write an integration test: `POST /v1/tasks` returns `201` with a
`Location` header, then `GET` that location returns `200` with the same title.
Assert on status codes, headers, and JSON body.

### 5. Test the error paths through the real stack

Add integration tests that a missing id returns `404`, an invalid body returns
`422` (aggregated), and creating a duplicate title returns `409`. These prove
your *real* validation and exception-handler wiring (track 02, module 06),
not just the service in isolation.

### 6. Async client variant

If your app uses async endpoints/DB, write one test using
`httpx.AsyncClient(transport=ASGITransport(app=app))` under
`@pytest.mark.asyncio` that creates and reads a task. Confirm the async
dependency path runs. Note the difference from the sync `TestClient` in a
comment.

### 7. Split fast from slow

Mark every DB/route test `@pytest.mark.integration` and register the marker.
Confirm `pytest -m "not integration"` runs only your fast unit tests (sub-second)
and `pytest -m integration` runs the DB-backed ones. This is the split CI will
use (module 07): fast tests on every push, slow ones gated.

### 8. Diagnose and fix: the leaking, order-dependent suite

These two tests pass when run together in this order, but `pytest -k
test_lists_all_tasks` alone fails, and running them in reverse fails. Find every
isolation problem and fix it.

```python
client = TestClient(app)   # module-level, shares the real dev DB via get_db

def test_creates_a_task():
    r = client.post("/v1/tasks", json={"title": "first"})
    assert r.status_code == 201

def test_lists_all_tasks():
    r = client.get("/v1/tasks")
    assert r.status_code == 200
    assert len(r.json()["data"]) == 1     # assumes exactly the row above exists
```

<details>
<summary>Solution</summary>

Problems: **(1) No test database / no override** — `get_db` isn't overridden, so
the tests hit whatever `get_db` points at (dev/prod), polluting real data and
depending on its contents. **(2) No isolation** — nothing rolls back or
truncates, so `test_creates_a_task` *commits* a row that `test_lists_all_tasks`
then depends on; run alone or reversed, the row isn't there and the length
assertion fails. **(3) Order dependence via shared state** — the second test's
`len(...) == 1` assumes exactly the first test's row and nothing else, so it's
coupled to run order and to a clean starting DB.

Fix: bind to a testcontainer DB, override `get_db` to a rollback-isolated
session via a fixture, and make each test self-contained (create its own data,
assert on *its* data, not a global count).

```python
@pytest.fixture
def client(db_session):                       # db_session = per-test rollback
    app.dependency_overrides[get_db] = lambda: iter([db_session])
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()

def test_lists_only_its_own_tasks(client):
    client.post("/v1/tasks", json={"title": "only one"})
    r = client.get("/v1/tasks")
    titles = [t["title"] for t in r.json()["data"]]
    assert "only one" in titles              # asserts on its own row, not a count
```

Now each test starts from a clean transaction, sees only what it created, and
passes in any order or alone.

</details>

## Independent challenge

No code given. Take the layered task/order API from
**02-api-layer-and-request-handling (module 07, CRUD deep dive)** and give it a
real integration-test suite backed by a **disposable Postgres from
testcontainers**, not SQLite. Build the fixture stack: a `session`-scoped
container+engine that creates the schema once, and a `function`-scoped
transaction-rollback `db_session` layered on top for per-test isolation. Wire a
`client` fixture that overrides the app's `get_db` to that session and clears
the override in teardown. Then cover the CRUD contract *through the real stack*:
create returns `201`+`Location` and persists; read returns the row; list
paginates with a capped limit; a whitelisted sort works and an unknown sort
field returns `400`; a duplicate returns `409`; a missing id returns `404`.
Every test must be order-independent and leave the database clean — prove it by
running the suite, then running it again reversed (`pytest -p no:randomly` off,
or a shuffle plugin on) and getting the same result.

<details>
<summary>Hint</summary>

The two hardest parts are scope and the override seam. Give the container/engine
`scope="session"` (starting Postgres per test would be brutally slow) and build
the schema in that fixture; give the rollback `db_session` `scope="function"` so
each test is isolated. For the seam, your `get_db` override must yield the *same*
session object your `db_session` fixture created and is rolling back — otherwise
the route writes in a different transaction than the one you clean up, and the
row leaks. Assert on your own created rows, never on global counts, to stay
order-independent.

</details>

## Common mistakes & troubleshooting

- **Testing against SQLite when you run Postgres.** Different dialect/constraint
  behavior means green tests hide real bugs. Use a real Postgres (testcontainers)
  for anything Postgres-specific.
- **Sharing the dev/prod database with tests.** Pollutes real data and makes
  results depend on its contents. Always a dedicated, disposable test DB.
- **No per-test isolation.** Tests that commit and don't clean up contaminate
  each other and make order matter. Use transaction-rollback (or truncate)
  teardown that runs on pass *and* fail.
- **Cleanup only on success.** A test that tears down at the end of the happy
  path leaves the DB dirty when it fails. Put teardown after `yield` in a
  fixture so it always runs.
- **Forgetting to clear dependency overrides.** A leaked override changes the
  behavior of later tests. Clear it in the fixture's teardown.
- **Re-testing business rules through the database.** Slow and redundant — that
  logic belongs in fast unit tests. Integration tests target the seams (SQL,
  wiring, serialization), not rule permutations.
- **Container starts per test.** Wildly slow. Scope the container `session`;
  keep only the cheap rollback isolation per test.
- **Asserting on global counts.** `len(rows) == 1` couples a test to a clean DB
  and to run order. Assert on the specific data the test created.

## Checkpoint quiz

Write down your answer to each question before expanding it — checking without attempting first is the single easiest way to fool yourself into thinking you've learned this.

1. Give three concrete bug classes an integration test catches that a
   unit-with-fakes test structurally cannot.
2. Why prefer a real Postgres over SQLite-in-memory for integration tests, even
   though SQLite is faster and simpler?
3. Describe the transaction-rollback isolation strategy and one situation where
   truncate is the better choice.
4. Why must test teardown run on failure as well as success, and what `pytest`
   construct guarantees it?
5. What does `TestClient` actually exercise, and why is a request through it a
   genuine integration test even without a network socket?
6. What is a FastAPI dependency override used for in integration tests, and what
   must you always do after using one?
7. What problem does testcontainers solve, and why do you scope the container
   fixture `session` while keeping isolation `function`-scoped?

<details>
<summary>Answers</summary>

1. Wrong SQL/ORM mapping (bad column, join, constraint) that a fake repo can't
   reproduce; wiring mistakes (route→service, uncommitted transaction, session
   sharing); and serialization/contract mismatches (dropped field, wrong status
   code, bad datetime format) that only a real request through the real stack
   reveals.
2. Because SQLite has a different SQL dialect, type affinity, and constraint
   behavior than Postgres, so a green SQLite test can hide a real Postgres bug —
   an integration test that isn't faithful to production defeats its own purpose.
3. Begin a transaction before the test, run the test inside it, and roll back in
   teardown so nothing is ever committed and the next test starts clean;
   instant and pristine. Truncate is better when the code under test manages its
   own commits (which would defeat the outer rollback) or when you want behavior
   closer to real commit semantics.
4. Because a test that fails mid-way still may have written rows; if cleanup only
   runs on success, a failure leaves the DB dirty and cascades into unrelated
   tests. A `yield` fixture runs its post-`yield` teardown regardless of
   pass/fail.
5. It sends real HTTP requests in-process through the app's actual middleware,
   routing, validation, dependencies, and serialization — everything but the
   socket — so it verifies the real web-layer wiring and wire contract, which is
   exactly an integration concern.
6. It swaps a `Depends` provider (e.g. `get_db`) so the route runs for real but
   its dependency points at the isolated test database (or a fake external
   service). You must clear the override afterward (`dependency_overrides.clear()`,
   ideally in fixture teardown) so it doesn't leak into other tests.
7. It provides a real, production-fidelity database (or other service) in a
   throwaway Docker container created at test time and destroyed after, avoiding
   shared/global state. Starting a container is expensive so you do it once per
   session; per-test isolation (rollback/truncate) is cheap and stays
   function-scoped so tests don't contaminate each other.

</details>

## Cumulative review

Closed-book. Don't reopen modules 00–03 while attempting these — the point is to
find out what actually stuck.

1. Draw the test pyramid and, for each layer, place these four tests: (a)
   `total_with_discount([100], 10) == 90`; (b) a service `place_order` oversell
   raising a domain error with a fake repo; (c) `POST /v1/tasks` through
   `TestClient` returns `201` and the row is in Postgres; (d) a full browser-
   driven signup flow. State each one's scope, speed, and roughly how many of it
   you'd want.
2. For test (b) above, name the test double you'd use for the repository and
   justify it over the other three kinds; then say why the *same* behavior does
   *not* warrant an integration test.
3. You're TDD-ing the discount rule from test (a). Write the red→green→refactor
   beats in words, including what "the simplest thing that passes" looks like on
   the first green and where module 01's parametrize belongs.
4. A colleague's unit suite reports 100% coverage and the app is broken in
   production because of a bad SQL join. Explain, using the coverage-vs-
   verification idea *and* the unit-vs-integration idea, how both facts are true
   at once and what two changes fix it.
5. Give the correct status code for each and name the module whose principle
   dictates it: an aggregated invalid body; a missing resource id; a duplicate
   unique title; a `datetime.now()`-dependent test that fails every afternoon
   (trick — what *kind* of problem is this and where do you fix it?).
6. Your integration suite passes when run whole but a single test fails in
   isolation. List the two most likely root causes (one about the DB, one about
   FastAPI wiring) and the fix for each.
7. Explain why you'd run testcontainers Postgres instead of SQLite for
   integration tests, and separately why you'd still keep the discount-rule test
   as a pure unit test rather than exercising it through the database.

<details>
<summary>Answers</summary>

1. Base = unit: (a) and (b) — isolated, sub-millisecond, hundreds/thousands.
   Middle = integration: (c) — real routing + real Postgres, medium speed, tens
   to low hundreds. Tip = e2e: (d) — whole running system from outside, slow, a
   handful.
2. A **fake** in-memory repository (or a **stub** returning canned stock): you
   verify the resulting behavior/error (state verification), which is less
   brittle than a mock's interaction assertions and doesn't need the real DB.
   It doesn't warrant an integration test because the oversell rule is pure
   business logic in the (HTTP/DB-ignorant) service — testing it through the
   database would be slow and redundant; integration tests target the seams,
   not rule permutations.
3. Red: write `assert total_with_discount([100], 10) == 90` first and watch it
   fail (function/module missing). Green: simplest thing that passes — e.g.
   `return int(sum(prices) * (100 - pct) / 100)` (even hardcoding for one case
   is legitimate, triangulated by a second row). Refactor: with the suite green,
   collapse the growing cases into a `@pytest.mark.parametrize` table and dedupe
   — behavior unchanged.
4. Coverage measures which lines *executed*, not whether anything was
   *asserted*, and unit tests use fakes that can't contain a SQL bug — so a
   fully-executed, fake-backed suite can be 100% green while the real join is
   wrong. Fixes: (1) add meaningful assertions (don't chase the percentage), and
   (2) add integration tests against a real (testcontainers) Postgres that
   exercise the actual SQL.
5. Aggregated invalid body → `422` (validation, track 02 / this track's unit-vs-
   integration wiring). Missing id → `404`. Duplicate unique title → `409`. The
   afternoon-failing test is not a status-code issue at all — it's a **flaky/
   nondeterministic test** caused by reading the real clock; fix it by injecting/
   controlling the clock (module 00's flakiness concept; module 04 controls it),
   not by changing a status code.
6. DB cause: no per-test isolation — an earlier test committed a row the failing
   test depends on (or vice-versa); fix with transaction-rollback/truncate
   teardown and asserting on own data, not global counts. Wiring cause: a leaked
   or missing `dependency_overrides` (e.g. `get_db` not overridden, or not
   cleared); fix by setting the override in a fixture and clearing it in
   teardown.
7. SQLite differs from Postgres in dialect, types, and constraints, so a green
   SQLite test can hide a real Postgres bug — an unfaithful integration test is
   worse than none. You keep the discount rule as a pure unit test because it's
   logic with no I/O; running it through the DB adds slowness and flakiness
   while testing nothing the seam-level tests should own.

</details>

## Next

[04-mocking-and-dependency-injection-for-testability](../04-mocking-and-dependency-injection-for-testability/README.md)
— you've used fakes and dependency overrides to swap the *database*. Next you'll
use the same tools to control *external* services — payment APIs, email
providers, the clock — with mocks and FastAPI's override system, and learn the
line between healthy mocking and over-mocking that makes tests mirror the code.
