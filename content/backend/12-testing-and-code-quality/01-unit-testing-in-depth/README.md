# Module 01: Unit Testing in Depth

## Why this matters

In module 00 you wrote unit tests by hand — construct the object, call the
method, assert. That works for five tests. At fifty, the cracks show: every
test repeats the same three lines of setup, and each new input case means
another near-identical copy-pasted function. Duplicated setup means that when
the constructor signature changes you edit fifty tests; copy-pasted cases mean
your "coverage" is really one test wearing forty hats, and a gap hides in the
noise. The unit layer is the *base* of the pyramid — it's where most of your
tests live — so the ergonomics of writing them well is not a nicety, it's what
decides whether the suite stays maintainable or rots into something the team
routes around.

`pytest` has two features that turn that grind into leverage: **fixtures**
(reusable, composable setup/teardown with explicit dependencies) and
**parametrization** (run one test body across many inputs, each reported
separately). Get fluent with these and you write less test code that covers
more, and a failure names the exact input that broke. This module also draws
the line that trips people up most in practice — **pure functions vs. functions
with side effects** — because that line decides *how* a thing can be tested, and
it teaches you to read **coverage** correctly: as a map of what you *haven't*
exercised, never as a score to maximize.

## Concepts

### Fixtures: setup and teardown with explicit dependencies

A **fixture** is a function that produces something a test needs — a
constructed object, a fake repo, a temp directory — and `pytest` injects it
into any test that names it as a parameter. Instead of repeating setup in every
test, you write it once and *request* it:

```python
import pytest

@pytest.fixture
def svc():
    return OrderService(FakeOrderRepo(stock={"sku-1": 10}))

def test_places_order(svc):          # names the fixture -> gets the object
    order = svc.place_order(1, [Item("sku-1", 2)])
    assert order["id"] == 1

def test_rejects_oversell(svc):      # same setup, zero duplication
    with pytest.raises(InsufficientStockError):
        svc.place_order(1, [Item("sku-1", 99)])
```

Fixtures **compose** — a fixture can request other fixtures — so you build a
dependency graph, not a pile of copy-paste. And they handle **teardown** via
`yield`: everything before the `yield` is setup, everything after runs when the
test finishes, pass *or* fail:

```python
@pytest.fixture
def temp_db():
    conn = connect(":memory:")       # setup
    yield conn                       # hand it to the test
    conn.close()                     # teardown, always runs
```

Fixtures live in the test file or, when shared across files, in `conftest.py`
(auto-discovered per directory — no import needed). This is the same
dependency-injection idea from track 02's `Depends`, applied to tests.

### Fixture scope: function, class, module, session

By default a fixture runs **once per test** (`scope="function"`) — maximum
isolation, because each test gets a fresh object and can't be polluted by
another. But some setup is expensive (starting a container, building a schema)
and safe to share. `scope=` controls the reuse:

```python
@pytest.fixture(scope="session")     # built once for the whole test run
def db_engine():
    engine = create_engine(TEST_DB_URL)
    yield engine
    engine.dispose()
```

Scopes, widest reuse to narrowest: `session` (once per `pytest` run) →
`package` → `module` (once per file) → `class` → `function` (default). The
tradeoff is **speed vs. isolation**: wider scope is faster but risks state
leaking between tests. Rule of thumb — expensive, read-only, or externally-torn-
down resources (an engine, a container) get a wide scope; anything a test
*mutates* stays `function`-scoped so tests can't contaminate each other.

### Parametrization: one test, many inputs

Copy-pasting a test to change one input value is how coverage gaps hide.
`@pytest.mark.parametrize` runs the *same* test body across a table of inputs,
reporting each as its own test with the values in the name:

```python
@pytest.mark.parametrize("prices, pct, expected", [
    ([100, 50], 10, 135),
    ([100], 0, 100),
    ([], 50, 0),
    ([100], 100, 0),
])
def test_total_with_discount(prices, pct, expected):
    assert total_with_discount(prices, pct) == expected
```

Four cases, one body. If the `pct=100` row breaks, `pytest` reports
`test_total_with_discount[100-100-0]` — the failing input is right there in the
name. This is the primary tool for covering **boundaries and edge cases**
cheaply: empty input, zero, the max, one-past-the-max, negative. You can also
parametrize the *expected exception*, mixing valid and invalid rows with
`pytest.raises` inside, or stack multiple `parametrize` decorators to get the
cartesian product.

### Pure functions vs. functions with side effects

A **pure function** depends only on its arguments and returns a value with no
observable effect on the outside world — same input, same output, always. Pure
functions are the *easiest thing in software to test*: no setup, no doubles,
just `assert f(input) == output`. Parametrization was made for them.

A function with **side effects** reads or changes something outside itself:
writes a row, sends an email, reads the clock, mutates a shared list, calls an
API. You can't test it by return value alone — you have to either verify the
*effect* (state verification: did the row get written to the fake?) or verify
the *interaction* (did `send_email` get called?). The practical lesson is
**separate the two**: keep the decision logic pure and push the side effect to
the edges, so the hard-to-test part is a thin shell and the interesting logic is
a pure function you test trivially.

```
   pure core (easy)              imperative shell (thin)
  +-------------------+         +----------------------+
  | penalty_for(acct) |  value  |  caller does the     |
  | no I/O, no clock  |-------->|  side effect:        |----> emailer.send()
  | same in->same out |         |  send email / write  |----> repo.save()
  +-------------------+         +----------------------+
   test by value                 test by interaction/state
   (parametrize, no doubles)     (one small double)
```

```python
# HARD to test: decision + side effect tangled
def charge_if_overdue(account, emailer):
    if account.balance < 0 and account.days_overdue > 30:
        emailer.send(account.email, "Your account is overdue")
        return account.balance * 1.05

# EASIER: pure decision, side effect at the edge
def penalty_for(account) -> Decimal | None:                 # pure
    if account.balance < 0 and account.days_overdue > 30:
        return account.balance * Decimal("1.05")
    return None
```

Now `penalty_for` is tested with a parametrize table and no doubles at all;
only the thin caller that actually sends the email needs an interaction test.

### Coverage as a signal, not a target

**Code coverage** measures which lines (or branches) your tests *executed* —
`pytest-cov` runs the suite and reports the percentage plus exactly which lines
were never hit. It's genuinely useful for one thing: **finding code you forgot
to test**. An uncovered branch is a branch no test exercises, which is a real
gap worth a look.

The trap is treating the number as the *goal*. Coverage measures execution, not
verification — a test with no assertions still "covers" every line it runs, and
you can hit 100% while asserting nothing meaningful. Worse, mandating a high
number (via a CI gate) incentivizes people to write execution-only tests that
game the metric, actively degrading the suite. **Line coverage** also
overstates safety: a line with an `if` counts as covered when executed once,
even if you never tested the `else`; **branch coverage** (`--cov-branch`) is
stricter because it wants both directions. Use coverage as a *map of the
untested*, investigate the gaps with judgment (some uncovered code isn't worth
testing), and never confuse "100% executed" with "correct."

### Test naming, structure, and independence

Because unit tests are numerous, their *names* are documentation — a failing
test's name should tell you what promise broke without opening the file. Prefer
`test_<unit>_<condition>_<expected>`: `test_place_order_oversell_raises`,
`test_discount_zero_pct_returns_full_total`. Each test must be **independent**:
it sets up its own state (via fixtures) and doesn't depend on running order or
on side effects left by another test. Order-dependent tests are a classic
source of "passes alone, fails in the suite" — `pytest -p no:randomly` vs.
random ordering plugins exist precisely to surface that coupling. Keep tests
small, isolated, and named for behavior, and the base of your pyramid stays
trustworthy at scale.

## Command reference

| Command / construct | What it does |
|---|---|
| `@pytest.fixture` | Declare a reusable setup function |
| `def test_x(myfix):` | Inject a fixture by parameter name |
| `yield` in a fixture | Split setup (before) / teardown (after) |
| `@pytest.fixture(scope="module")` | Reuse across a scope (function/class/module/session) |
| `conftest.py` | Fixtures shared across files, auto-discovered |
| `@pytest.mark.parametrize("a,b", [...])` | Run the body once per row |
| `pytest.param(..., id="name")` | Give a parametrized case a readable id |
| `pytest.param(..., marks=pytest.mark.xfail)` | Mark one row expected-to-fail |
| `pytest --cov=app` | Report line coverage for the `app` package |
| `pytest --cov=app --cov-branch` | Include branch coverage (stricter) |
| `pytest --cov=app --cov-report=term-missing` | List the exact uncovered lines |
| `pytest --cov-report=html` | Write a browsable HTML coverage report |
| `tmp_path` (built-in fixture) | A unique temp `Path` per test |
| `monkeypatch` (built-in fixture) | Safely patch attrs/env for one test |

Coverage config in `pyproject.toml` (fail the build under a threshold, but see
the mistakes section on why a *low* floor is healthier than a high mandate):

```toml
[tool.coverage.run]
branch = true
source = ["app"]

[tool.coverage.report]
show_missing = true
skip_covered = true
# fail_under = 80    # a floor, not an aspiration — see Common mistakes
```

Composing fixtures and using a built-in one (`tmp_path`):

```python
@pytest.fixture
def repo():
    return FakeOrderRepo(stock={"sku-1": 10})

@pytest.fixture
def svc(repo):                          # fixture depending on a fixture
    return OrderService(repo)

def test_writes_receipt_file(svc, tmp_path):
    order = svc.place_order(1, [Item("sku-1", 2)])
    path = tmp_path / "receipt.txt"     # unique temp dir, auto-cleaned
    path.write_text(f"order {order['id']}")
    assert path.read_text() == "order 1"
```

Parametrizing valid and invalid cases together:

```python
@pytest.mark.parametrize("pct, expectation", [
    (0, does_not_raise(100)),
    (10, does_not_raise(90)),
    (150, pytest.raises(ValueError)),
    (-1, pytest.raises(ValueError)),
])
def test_discount_validation(pct, expectation):
    with expectation as expected:
        result = total_with_discount([100], pct)
        if expected is not None:
            assert result == expected
```

## Hands-on exercises

Work in the `testing-lab/` project from module 00.

### 1. Extract setup into a fixture

Take the two `OrderService` tests you wrote by hand in module 00 and refactor
the repeated construction into a `@pytest.fixture` named `svc`. Both tests
should now request `svc` as a parameter and contain zero setup lines. Run and
confirm still green. Note how adding a third test now costs one line of setup.

### 2. Add teardown with `yield`

Write a fixture `temp_log` that creates a file in `tmp_path`, `yield`s its path
to the test, and after the yield asserts/records that it deletes the file. Write
a test that writes to it. Add a `print` before and after the `yield` and run
with `pytest -s` to *see* setup run before the test and teardown after.

### 3. Parametrize a pure function

Rewrite your `total_with_discount` tests as a single
`@pytest.mark.parametrize`ed test with at least six rows: empty list, single
item, `pct=0`, `pct=100`, a normal case, and a rounding case. Run `pytest -v`
and confirm each row shows as its own named test. Deliberately break one row's
expected value and confirm the failure names the exact input.

### 4. Parametrize the error cases too

Add rows (or a second parametrized test) covering `pct=150` and `pct=-1`, each
asserting `ValueError` via `pytest.raises`. Aim to have *all* validation
branches of the function driven from parametrized tables, not hand-written
duplicates.

### 5. Separate a pure decision from its side effect

Given a tangled function like `charge_if_overdue(account, emailer)` (decision +
email in one), refactor it into a pure `penalty_for(account)` and a thin caller
that sends the email. Write a *parametrized* unit test for `penalty_for` (in
credit, overdue-but-not-30-days, overdue-past-30) with no doubles at all.
Expected: the interesting logic is now testable without any emailer.

### 6. Measure coverage and find a real gap

Run `pytest --cov=app --cov-branch --cov-report=term-missing`. Read the
"Missing" column. Find one genuinely untested branch (e.g. an `else` you never
hit) and add a test for it. Re-run and watch that line leave the missing list.
Write one sentence on *why* that branch mattered.

### 7. Choose a fixture scope deliberately

Add a fixture that simulates expensive setup (a `time.sleep(0.2)` "connect"
that returns a shared object). Give it `scope="function"` and time the suite;
switch to `scope="module"` and time again. Then answer in a comment: is this
resource safe to share across tests, or would sharing let one test's mutation
leak into another?

### 8. Diagnose and fix: the metric got gamed

This test file reports **100% coverage** of `pricing.py`, yet a real bug ships.
Explain how both things are true, and fix the suite so the bug would be caught.

```python
# pricing.py
def total_with_discount(prices, pct):
    subtotal = sum(prices)
    if pct < 0 or pct > 100:
        raise ValueError("pct out of range")
    return int(subtotal - subtotal * pct / 100)   # BUG: should floor per spec, ok here

# test_pricing.py
@pytest.mark.parametrize("prices, pct", [
    ([100, 50], 10),
    ([], 0),
    ([100], 150),      # invalid
])
def test_total(prices, pct):
    try:
        total_with_discount(prices, pct)   # no assertion on the result
    except ValueError:
        pass                               # swallow, assert nothing
```

<details>
<summary>Solution</summary>

**How 100% coverage coexists with a shipped bug:** the three rows *execute*
every line — the valid path, the empty path, and the `raise` path all run — so
line (and even branch) coverage is 100%. But the test **asserts nothing**: it
calls the function and either ignores the return value or swallows the
exception. Coverage measures *execution*, not *verification*, so a bug in the
computed value (or the wrong exception message) sails through with a green,
"fully covered" suite.

**Fix:** assert on outcomes, and separate valid from invalid cases so each has
a real expectation.

```python
@pytest.mark.parametrize("prices, pct, expected", [
    ([100, 50], 10, 135),
    ([], 0, 0),
    ([100], 100, 0),
])
def test_total_valid(prices, pct, expected):
    assert total_with_discount(prices, pct) == expected

@pytest.mark.parametrize("pct", [150, -1])
def test_total_rejects_bad_pct(pct):
    with pytest.raises(ValueError):
        total_with_discount([100], pct)
```

The lesson: coverage tells you which lines you *ran*, never whether you
*checked* the right thing. Chase assertions, not the percentage.

</details>

## Independent challenge

No code given. Return to the `OrderService` you unit-tested in **module 00
(Testing Fundamentals and the Test Pyramid)** and level it up to the standards
of this module. Replace all hand-written setup with a small graph of composed
fixtures (a `repo` fixture feeding a `svc` fixture). Convert your happy-path and
error tests into **parametrized** tables that cover the boundaries: empty
order, exactly-enough stock, one-past stock, multiple line items. Add a *new*
service method that has a side effect (e.g. it appends to an audit log passed
in), then refactor so the *decision* is a pure function you parametrize and only
the thin writer needs a state-verifying test. Finally run coverage with
`--cov-branch --cov-report=term-missing`, drive it up by adding tests for any
genuinely missing branch, and write one sentence justifying any line you chose
to leave uncovered.

<details>
<summary>Hint</summary>

For the boundary table, the highest-value rows are the *edges*: `qty` equal to
stock (should pass), `qty` one greater (should raise), and an empty item list.
Put the valid rows in one parametrized test asserting on the returned order and
the invalid rows in another using `pytest.raises`. For the side-effecting
method, follow exercise 5's shape — a pure `should_audit(...)`/`audit_entry(...)`
you parametrize, plus one small test that the writer actually appends the entry
to a fake list.

</details>

## Common mistakes & troubleshooting

- **Duplicated setup instead of fixtures.** Every test rebuilding the same
  object. Extract a fixture; put shared ones in `conftest.py`.
- **Over-wide fixture scope on mutable state.** A `session`/`module` fixture
  that tests mutate leaks state between tests ("passes alone, fails together").
  Keep mutated resources `function`-scoped; reserve wide scope for expensive,
  read-only, or externally-cleaned resources.
- **Copy-pasted tests instead of parametrize.** Ten near-identical functions
  where one parametrized table belongs — gaps hide in the duplication and the
  failing input isn't obvious. Use `@pytest.mark.parametrize`.
- **Testing side-effecting code by return value.** You can't; either verify the
  effect/state or the interaction. Better: refactor the pure decision out and
  test *that* directly.
- **Treating coverage as a target.** Mandating a high percentage breeds
  assertion-free tests that game it. Use coverage to *find* untested code, then
  add meaningful assertions.
- **Line coverage mistaken for branch coverage.** A 100% line-covered `if` may
  never have run its `else`. Enable `--cov-branch` for the honest number.
- **Order-dependent tests.** A test that only passes because an earlier one ran
  first. Make each test set up its own state; consider a randomizing plugin to
  surface hidden coupling.

## Checkpoint quiz

Write down your answer to each question before expanding it — checking without attempting first is the single easiest way to fool yourself into thinking you've learned this.

1. What problem do fixtures solve, and how does a fixture handle teardown?
2. What does `scope=` control on a fixture, and what's the tradeoff between a
   wide scope and the default `function` scope? Which resources are safe to
   widen?
3. Why is parametrization better than copy-pasting a test for each input, and
   what does it give you in the failure report?
4. Define a pure function. Why is it the easiest kind of code to test, and what
   design move makes side-effecting code easier to test?
5. What does code coverage actually measure, and name two reasons a high
   coverage number can be misleading.
6. Line coverage says 100% but you suspect an untested branch. What's going on
   and what do you turn on to get the honest picture?
7. A test passes when run alone but fails when the whole suite runs. What's the
   most likely cause and how do you prevent it?

<details>
<summary>Answers</summary>

1. Fixtures remove duplicated setup: you define reusable setup once and tests
   request it by parameter name; they also compose (fixtures using fixtures).
   Teardown uses `yield` — code before the yield is setup, code after runs when
   the test finishes (pass or fail).
2. `scope=` controls how often the fixture is (re)built — function/class/
   module/package/session. Wider scope is faster (built fewer times) but risks
   state leaking between tests; default `function` gives a fresh instance per
   test (max isolation). Safe to widen: expensive, read-only, or
   externally-torn-down resources (engines, containers). Keep mutated state
   function-scoped.
3. It runs one test body across a table of inputs with no duplication, so gaps
   don't hide in copy-paste and boundaries are cheap to add; the failing input
   appears in the test's reported name/id, pointing straight at the case.
4. A pure function depends only on its arguments and returns a value with no
   external effect. It's trivial to test (`assert f(in) == out`, no doubles).
   For side-effecting code, extract the pure decision and push the effect to a
   thin edge, so the logic is testable by value and only the shell needs an
   interaction/state test.
5. It measures which lines/branches the tests *executed* — not whether anything
   was asserted. Misleading because: (a) assertion-free tests still "cover"
   lines, so 100% can verify nothing; (b) line coverage counts an `if` as
   covered without exercising its `else`, overstating safety; and mandating a
   high number incentivizes gaming.
6. A line-covered `if` may have run only one direction; the `else`/false branch
   was never taken. Turn on branch coverage (`--cov-branch`) to require both
   directions and reveal the untaken branch.
7. Order dependence / shared mutable state — an earlier test left state a later
   one relies on (or a wide-scoped fixture was mutated). Prevent it by making
   each test set up its own state via function-scoped fixtures and avoiding
   cross-test globals; randomized ordering surfaces the coupling.

</details>

## Further reading & sources

- [pytest — How to use fixtures](https://docs.pytest.org/en/stable/how-to/fixtures.html) - The official guide to fixtures, composition, and `yield`-based teardown used throughout this module.
- [pytest — Fixture scopes](https://docs.pytest.org/en/stable/how-to/fixtures.html#scope-sharing-fixtures-across-classes-modules-packages-or-session) - Reference for the function/module/session scopes and the speed-vs-isolation tradeoff.
- [pytest — Parametrizing tests](https://docs.pytest.org/en/stable/how-to/parametrize.html) - Official docs for `@pytest.mark.parametrize`, the core edge-case tool of this module.
- [pytest-cov documentation](https://pytest-cov.readthedocs.io/en/latest/) - The coverage plugin, including branch coverage and `term-missing`, used to find untested code.
- [Martin Fowler — TestCoverage](https://martinfowler.com/bliki/TestCoverage.html) - Why coverage is a signal for finding untested code, never a target to maximize.
- [Gary Bernhardt — Boundaries (functional core, imperative shell)](https://www.destroyallsoftware.com/talks/boundaries) - The talk behind separating a pure decision core from a thin side-effecting shell.

## Next

[02-test-driven-development-in-practice](../02-test-driven-development-in-practice/README.md)
— you can now write clean, parametrized, well-covered unit tests *after* the
code exists. Next you'll flip the order: write the failing test *first* and let
red-green-refactor drive a small feature into existence, then learn honestly
where TDD pays off and where it just slows you down.
