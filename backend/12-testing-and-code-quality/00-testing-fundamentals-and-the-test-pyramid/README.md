# Module 00: Testing Fundamentals and the Test Pyramid

## Why this matters

Every line of code you've written in the earlier tracks made a promise: this
endpoint returns `201`, this validator rejects a future birth date, this
service raises `InsufficientStockError`. Right now the only thing verifying
those promises is *you*, manually, by poking the running app — and you only do
it once, the day you write the code. The moment someone else (or you, three
months later) changes a nearby line, those promises silently break and nobody
finds out until a user does. **Automated tests are executable promises**: they
state what the code should do, and they re-check it on every change, for free,
forever. That's the entire value proposition — not "catching bugs" in some
vague sense, but pinning down behavior so you can change code without fear.

The catch is that not all tests are equal. A test that spins up your whole
app, a real database, and a real payment sandbox to check one validation rule
is slow, flaky, and tells you almost nothing when it fails (which of the fifty
moving parts broke?). A test that calls one pure function with three inputs is
fast, stable, and points a laser at the fault. Most teams learn this the hard
way, ending up with a slow, brittle suite nobody trusts. The **test pyramid**
is the shape that avoids that: lots of small fast tests, fewer medium ones, a
tiny number of big ones. This module gives you the vocabulary — unit,
integration, e2e, and the four kinds of test doubles — and gets `pytest`
running so every later module has a foundation to build on.

## Concepts

### What a test actually is (arrange–act–assert)

A test is just a function that runs some code and *asserts* something is true
about the result; if the assertion fails, the test fails. There's no magic. The
universal shape is **Arrange–Act–Assert** (AAA): set up the inputs, perform the
one action under test, then check the outcome. Keeping those three phases
visually distinct is the single biggest readability win in testing.

```python
def test_discount_applies_to_total():
    cart = Cart(items=[Item(price=100), Item(price=50)])   # arrange
    total = cart.total_with_discount(pct=10)               # act
    assert total == 135                                    # assert
```

One test should exercise *one* behavior and, ideally, have *one* logical
reason to fail. A test that arranges five things, acts three times, and asserts
on eight is really several tests wearing a trenchcoat — when it goes red you
won't know which promise broke.

### The test pyramid: unit, integration, e2e

Tests differ in *scope* — how much of the system they exercise at once — and
scope trades off against speed and stability. The **test pyramid** arranges the
three main scopes by how many of each you should have:

- **Unit tests** (the wide base) — exercise one small piece (a function, a
  class, a service method) in isolation, with its collaborators replaced by
  test doubles. Milliseconds each. You have hundreds or thousands. When one
  fails, it names the exact broken piece.
- **Integration tests** (the middle) — exercise several real pieces wired
  together: a service against a *real* test database, a FastAPI route through
  `TestClient`. Tens to low hundreds. Slower (they touch I/O), but they catch
  the bugs unit tests can't — wrong SQL, a mis-wired dependency, a serialization
  mismatch.
- **End-to-end tests** (the narrow tip) — drive the whole running system from
  the outside, as a real client would, across process boundaries. A handful.
  Slow and the most prone to flakiness. They prove the assembled system works
  at all, but they're a terrible place to test business-rule permutations.

```
        /\        e2e         few, slow, high-confidence-in-the-whole
       /  \
      /----\      integration  some, medium speed, real wiring/IO
     /      \
    /--------\    unit          many, fast, isolated, precise failures
```

The shape matters because the wrong shape is expensive. An **inverted pyramid**
(mostly e2e, few unit) — sometimes called the "ice-cream cone" — gives you a
suite that's slow, flaky, and vague on failure. Push behavior coverage *down*
to the fastest layer that can meaningfully test it.

### Test doubles: mock, stub, fake, spy

To test a unit *in isolation* you replace its real collaborators (the database,
a payment API, an email sender) with stand-ins called **test doubles**. The
word "mock" gets used for all of them colloquially, but the distinctions matter
because they answer different questions:

- **Stub** — returns canned answers to calls. Used to *supply* input to the
  code under test. "When `get_stock('sku-1')` is called, return `10`." You
  assert on the code's output, not on the stub.
- **Fake** — a real, working, lightweight implementation. An in-memory
  dictionary standing in for a repository; SQLite standing in for Postgres. It
  actually behaves, just without the production weight.
- **Mock** — a double with *expectations* about how it's called. You assert on
  the *interaction*: "`send_email` was called exactly once, with this address."
  Used when the behavior under test *is* the side effect.
- **Spy** — records the calls that happened so you can inspect them afterward,
  without pre-set expectations. A "mock" you interrogate after the fact.

The key division is **state verification** (stub/fake — you check the resulting
value or state) versus **interaction verification** (mock/spy — you check that
a call happened). Reach for state verification first; it's less brittle. Use
interaction verification only when the side effect *is* the thing you're
testing (an email must be sent) — module 04 goes deep on this.

### Why isolate at all — the cost of I/O and nondeterminism

Isolation isn't dogma; it buys two concrete things. **Speed**: a unit test that
touches no network, disk, or clock runs in under a millisecond, so a thousand
of them run in a second and you run them on every save. **Determinism**: real
collaborators fail for reasons unrelated to your code — the DB is down, the
payment sandbox is slow, `datetime.now()` is different every run. A test that
fails intermittently for reasons outside the code under test is a **flaky
test**, and flaky tests are worse than no test because they train the team to
ignore red. Replacing I/O and nondeterminism (time, randomness) with doubles
makes tests fast *and* stable. The tradeoff — doubles can drift from the real
thing they impersonate — is exactly why the pyramid also keeps a layer of
integration tests that use the real thing.

### What tests are for (and what they are not for)

Tests exist to let you **change code safely** — that's the north star. A good
suite is a *regression net*: it lets you refactor, upgrade a dependency, or add
a feature and get immediate, specific feedback if you broke a promise. Tests
are also **design pressure**: code that's hard to test is usually hard to *use*
(tangled dependencies, hidden global state), so the pain of testing is a signal
to fix the design, not to skip the test.

What tests are *not*: they're not a proof of correctness (they check the cases
you thought of), not a substitute for thinking, and not a metric to game.
"100% of lines executed" says nothing about whether you *asserted* the right
things. Treat tests as a tool for confidence and change-safety, and the rest of
this track — coverage, TDD, mocking, contracts, CI — falls into place as ways
to make that tool sharper.

### `pytest`: the tool you'll use for all of it

Python ships with `unittest`, but the ecosystem standard is **`pytest`**: plain
`assert` statements (no `self.assertEqual`), functions instead of classes,
powerful fixtures and parametrization, and a rich plugin ecosystem
(`pytest-cov`, `pytest-asyncio`, `pytest-mock`). A `pytest` test is just a
function named `test_*` in a file named `test_*.py` containing `assert`s.
`pytest` discovers and runs them, and when an `assert` fails it *introspects*
the expression to show you the actual values — no manual failure messages
needed.

```python
# test_math.py
def test_addition():
    assert 2 + 2 == 4
```

```
$ pytest -q
.                                                          [100%]
1 passed in 0.01s
```

That's the whole loop: write `test_*` functions with `assert`s, run `pytest`,
read the report. Everything else in this track is refinement.

## Command reference

| Command / concept | What it does |
|---|---|
| `pip install pytest pytest-cov` | Install the runner and coverage plugin |
| `pytest` | Discover and run every `test_*.py` / `*_test.py` |
| `pytest -q` | Quiet output (one char per test) |
| `pytest -v` | Verbose: one line per test with its name |
| `pytest path/to/test_file.py` | Run one file |
| `pytest test_file.py::test_name` | Run one specific test |
| `pytest -k "discount and not tax"` | Run tests whose name matches an expression |
| `pytest -x` | Stop at the first failure |
| `pytest --lf` | Re-run only last-failed tests |
| `pytest -s` | Don't capture stdout (let `print` through) |
| `assert expr` | The assertion; `pytest` rewrites it to show values |
| `pytest.raises(Error)` | Assert a block raises a given exception |
| `conftest.py` | Shared fixtures/config, auto-discovered per directory |

Standard project layout `pytest` expects:

```
myapp/
  app/
    __init__.py
    services.py
  tests/
    __init__.py
    conftest.py          # shared fixtures
    test_services.py     # test_* files
  pyproject.toml         # [tool.pytest.ini_options] lives here
```

A minimal `pytest` config in `pyproject.toml` so discovery and imports behave:

```toml
[tool.pytest.ini_options]
testpaths = ["tests"]
python_files = ["test_*.py"]
addopts = "-q"
```

Asserting an exception is raised (you'll use this constantly for domain errors):

```python
import pytest
from app.services import OrderService, InsufficientStockError

def test_place_order_rejects_oversell():
    svc = OrderService(FakeRepo(stock={"sku-1": 1}))     # arrange (fake double)
    with pytest.raises(InsufficientStockError) as exc:   # act + assert
        svc.place_order(user_id=1, items=[Item("sku-1", qty=5)])
    assert exc.value.sku == "sku-1"                      # assert on the error
```

A stub vs. a fake, concretely:

```python
# STUB: canned answer, used to feed the code under test
class StubStockRepo:
    def get_stock(self, sku): return 10          # always says 10

# FAKE: a real, working, in-memory implementation
class FakeOrderRepo:
    def __init__(self): self._orders, self._next = {}, 1
    def create_order(self, user_id, items):
        oid = self._next; self._next += 1
        self._orders[oid] = {"id": oid, "user_id": user_id}
        return self._orders[oid]
    def get(self, oid): return self._orders.get(oid)
```

## Hands-on exercises

Create a fresh project folder `testing-lab/` with the layout above. You'll grow
it across this whole track. Install `pytest` and `pytest-cov` into a virtualenv.

### 1. Get `pytest` running

Write `tests/test_smoke.py` with a single `test_addition` asserting `2 + 2 ==
4`. Run `pytest -q`. Expected: `1 passed`. Now change the assertion to `2 + 2
== 5` and re-run. Read the failure output carefully — note how `pytest` shows
you the actual left/right values without you writing a message. Change it back.

### 2. Write a pure function and unit-test it (AAA)

Add `app/pricing.py` with `def total_with_discount(prices: list[int], pct:
int) -> int` that sums prices and applies a percentage discount, rounding down.
Write `tests/test_pricing.py` with a test that clearly shows the three AAA
phases (blank line between arrange, act, assert). Add a second test for the
`pct=0` case. Expected: both pass.

### 3. Assert an exception with `pytest.raises`

Extend `total_with_discount` to raise `ValueError` if `pct` is outside `0–100`.
Write a test using `with pytest.raises(ValueError):` for `pct=150`. Then make
it stricter: capture the exception and assert its message mentions the bad
value. Expected: the test passes and pins the error contract.

### 4. Build a stub and a fake

In `app/services.py`, write a tiny `OrderService` whose `place_order` checks
stock via an injected repo and raises `InsufficientStockError` on oversell.
Write one test using the `StubStockRepo` (canned stock) to prove the oversell
path, and one using a `FakeOrderRepo` to prove a successful order gets an id.
Note in a comment which double you used and why.

### 5. Classify the scope

Look at the two tests you just wrote and the ones from exercises 2–3. For each,
write a one-line comment labeling it **unit / integration / e2e** and justify
it in a few words. Expected: all of them are unit tests — you replaced or
avoided every real collaborator. Notice you have *zero* of the other two kinds
so far; that's normal this early.

### 6. Feel the flakiness

Write a function `def greet_by_hour() -> str` that returns `"good morning"`
before noon and `"good afternoon"` otherwise, reading `datetime.now()`
directly. Write a test asserting it returns `"good morning"`. Run it. Now
reason: this test passes or fails depending on *what time you run it*. That's a
nondeterministic (flaky) test. Don't fix it yet — just write down *why* it's
flaky and what collaborator you'd need to control. (Module 04 controls the
clock; module 01 refactors for injectability.)

### 7. Run subsets like you will in real life

With five-plus tests now, practice the runner: `pytest -v` (see names),
`pytest -k pricing` (only pricing tests), `pytest tests/test_pricing.py::
test_total_with_discount`, and `pytest -x` after deliberately breaking one
test. Expected: you can slice the suite three different ways from memory.

### 8. Diagnose and fix: a test that tests nothing

This test is green, but it's worthless. Explain *both* problems and fix them.

```python
def test_place_order():
    svc = OrderService(FakeOrderRepo(stock={"sku-1": 10}))
    order = svc.place_order(user_id=1, items=[Item("sku-1", qty=2)])
    # (no assertions below)
    svc.place_order(user_id=1, items=[Item("sku-1", qty=2)])
    order2 = svc.place_order(user_id=2, items=[Item("sku-1", qty=1)])
```

<details>
<summary>Solution</summary>

Two problems. **(1) No assertion.** The test executes code but never checks
anything, so it can only fail if the code *raises* — it verifies almost
nothing. A test with no `assert` is a false sense of security. **(2) It tests
three behaviors at once** (two different users, a repeated order) with no clear
single reason to fail, and still asserts on none of them.

Fix: split into focused tests, each asserting one promise.

```python
def test_place_order_returns_created_order_with_id():
    svc = OrderService(FakeOrderRepo(stock={"sku-1": 10}))
    order = svc.place_order(user_id=1, items=[Item("sku-1", qty=2)])
    assert order["id"] == 1
    assert order["user_id"] == 1

def test_place_order_rejects_oversell():
    svc = OrderService(FakeOrderRepo(stock={"sku-1": 1}))
    with pytest.raises(InsufficientStockError):
        svc.place_order(user_id=1, items=[Item("sku-1", qty=5)])
```

The lesson: green is not the goal — *green with meaningful assertions* is. A
test that can't fail for the right reason isn't protecting anything.

</details>

## Independent challenge

No code given. Take the `OrderService` layering you built in
**02-api-layer-and-request-handling / module 06 (Handlers, Controllers, and
Services)** — the HTTP-ignorant service that raises domain exceptions — and
give it a real unit-test suite from scratch. Write a `FakeOrderRepository` (an
in-memory fake, not a mock) and use it to test *every* branch of
`place_order`: the empty-order rejection, the oversell rejection (asserting the
error carries the right `sku`), and the happy path (asserting the returned
order's fields). Every test must follow visible Arrange–Act–Assert, exercise
exactly one behavior, and touch no web server, no real database, and no clock.
Then classify each test's scope in a comment and confirm you've built a small
pyramid *base* with nothing above it yet — that's the correct starting shape.

<details>
<summary>Hint</summary>

The reason you *can* unit-test the service at all is the discipline from module
06: it imports no FastAPI and takes plain arguments, so you construct it with
your fake repo and call methods directly. For the oversell test, seed the fake
with `stock={"sku-x": 0}` so the branch is forced; for the happy path, seed
enough stock and assert on the returned dict's `id`/`user_id`. Use
`pytest.raises(InsufficientStockError) as exc` and then `assert exc.value.sku
== ...` to pin the error's payload, not just its type.

</details>

## Common mistakes & troubleshooting

- **Tests with no assertions.** Code runs, nothing is checked; it only catches
  crashes. Every test needs at least one meaningful `assert`.
- **One test, many behaviors.** Multiple acts and asserts in one function; when
  it fails you can't tell which promise broke. One behavior per test.
- **Inverted pyramid.** Leaning on slow e2e tests for logic that a unit test
  could pin. Push behavior coverage down to the fastest layer that can test it.
- **Confusing the doubles.** Asserting on a stub's calls (that's a mock's job)
  or building an elaborate mock when a simple fake would do. Prefer state
  verification (stub/fake); reserve interaction verification (mock/spy) for
  when the side effect *is* the behavior.
- **Testing the clock / randomness directly.** `datetime.now()` and
  `random.random()` inside code under test make flaky tests. Inject them so a
  test can control them (module 04).
- **`ModuleNotFoundError` in tests.** Usually a layout/`__init__.py` or
  `testpaths`/`pythonpath` issue. Add `__init__.py` files and configure
  `[tool.pytest.ini_options]`; run `pytest` from the project root.
- **Chasing green instead of confidence.** A passing suite that asserts trivia
  protects nothing. Ask of each test: "what real bug would this catch?"

## Checkpoint quiz

Write down your answer to each question before expanding it — checking without attempting first is the single easiest way to fool yourself into thinking you've learned this.

1. What are the three phases of a well-structured test, and why keep them
   visually distinct?
2. Name the three layers of the test pyramid from base to tip, and for each
   give its scope, relative speed, and roughly how many you should have.
3. Why is an inverted pyramid (mostly e2e) a bad place to be? Give two concrete
   symptoms.
4. Distinguish a stub from a mock. Which verifies *state* and which verifies
   *interaction*, and which should you reach for first?
5. What is a fake, and when would you choose one over a stub?
6. What two concrete things does isolating a unit from its real collaborators
   buy you, and what's the tradeoff you accept?
7. A test passes reliably in the morning and fails every afternoon. What kind
   of test is this, what's the likely cause, and why is such a test worse than
   having no test at all?

<details>
<summary>Answers</summary>

1. Arrange (set up inputs/collaborators), Act (perform the one action under
   test), Assert (check the outcome). Keeping them distinct makes the test
   readable and makes each test exercise one behavior with one reason to fail.
2. Unit (base): one small piece in isolation, fastest (ms), hundreds/thousands.
   Integration (middle): several real pieces wired together incl. real test DB/
   TestClient, medium speed, tens–low hundreds. E2e (tip): the whole running
   system from outside, slowest, a handful.
3. Because e2e tests are slow and the most flaky, and they give vague failures
   (any of many parts could be the cause). Symptoms: a suite so slow nobody
   runs it locally, and red builds that don't tell you what actually broke.
4. A stub returns canned values to feed the code under test — you verify the
   code's resulting **state/output**. A mock carries expectations about how
   it's called — you verify the **interaction** (a call happened as expected).
   Reach for stub/fake (state) first; it's less brittle.
5. A fake is a real, lightweight, working implementation (in-memory repo,
   SQLite for Postgres). Choose it over a stub when you need the collaborator to
   actually *behave* across multiple calls (store then retrieve), not just
   return one canned value.
6. Speed (no I/O → sub-millisecond tests you run constantly) and determinism
   (no external systems, clock, or randomness to fail for unrelated reasons).
   The tradeoff: doubles can drift from the real thing, which is why you keep a
   layer of integration tests that use the real collaborators.
7. A flaky (nondeterministic) test; the likely cause is reading the real clock
   (`datetime.now()`) inside the code. It's worse than no test because
   intermittent red trains the team to ignore failures, eroding trust in the
   whole suite.

</details>

## Next

[01-unit-testing-in-depth](../01-unit-testing-in-depth/README.md) — you can run
a test and name the layers; now you'll get fluent at the unit layer itself:
`pytest` fixtures for setup/teardown, parametrization to cover many cases
without duplication, testing pure functions versus functions with side effects,
and reading coverage as a signal rather than chasing it as a target.
