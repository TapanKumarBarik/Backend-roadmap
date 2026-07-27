# Module 02: Test-Driven Development in Practice

## Why this matters

So far you've written tests *after* the code — you had a working
`total_with_discount`, then you pinned its behavior. Test-driven development
(TDD) inverts that: you write a *failing* test first, then write the minimum
code to pass it, then clean up. It sounds like a small reordering, but it
changes what the tests *are*. Tests written after the fact tend to confirm what
the code already does (including its bugs); tests written first are a
*specification you commit to before you know how you'll implement it*. That
forces you to think about the interface — what the function is called, what it
takes, what it returns, how it fails — from the caller's side, before
implementation details can bias you. It's the difference between describing a
house you already built and drawing the blueprint first.

TDD's second payoff is rhythm and safety. Working in tiny red-green-refactor
loops means you're never more than a few minutes from a known-good state, you
always know exactly what you're working on (the one failing test), and you
build a regression net as a *side effect* of building the feature. But TDD is a
technique, not a religion, and this module is honest about that: it genuinely
shines for logic with clear input/output and clear rules, and it genuinely gets
in the way for exploratory work, throwaway spikes, and code whose "correct
behavior" you're still discovering. You'll do a real red-green-refactor cycle on
a small feature end to end, then learn to tell the two situations apart so you
apply TDD where it earns its keep.

## Concepts

### Red-green-refactor: the core loop

TDD is a three-beat cycle you repeat for every small increment of behavior:

1. **Red** — write one small test for a behavior that doesn't exist yet, and
   run it. It **must fail**, and fail for the *right reason* (the behavior is
   missing), not because of a typo or import error. A red test you've *seen
   fail* is a test you trust; a test that was green from the start might be
   asserting nothing.
2. **Green** — write the **minimum** code to make that test (and all existing
   tests) pass. Not the elegant version, not the general version — the smallest
   thing that goes green. Hardcoding a return value to pass the first test is
   legitimate; the next test will force you to generalize.
3. **Refactor** — now that you're green, improve the code *and* the tests
   (remove duplication, rename, extract) **without changing behavior**, running
   the suite continuously to prove you didn't break anything. The passing tests
   are what make refactoring safe.

Then loop: pick the next tiny behavior, write the next red test. The discipline
is doing these one at a time and running the tests at every beat.

### Why write the test first — the design pressure

Writing the test first means you become the *first caller* of code that doesn't
exist yet, and that's where the value is. You have to decide the name, the
arguments, the return type, and the failure mode from the *outside*, based on
what's convenient to use — not what's convenient to implement. Interfaces
designed this way come out simpler and more usable, because awkwardness shows up
immediately as an awkward test. Code that's hard to write a test for is code
that's hard to *call*: too many dependencies to construct, hidden global state,
a function that does five things. TDD surfaces those design problems at the
cheapest possible moment — before the code exists — instead of after you've
built around them. This is the "tests as design pressure" idea from module 00,
turned into a working method.

### One reason to fail, and the simplest thing that works

Two disciplines keep TDD honest. First, **each test drives one behavior**, so
when it's red you know exactly what you're building and when it's green you know
exactly what you finished. A test that asserts three things forces three
implementation decisions at once and muddies the loop. Second, **write the
simplest code that passes** — resist implementing the whole feature to satisfy
one test. This feels absurd at first ("I'll just return `True`?"), but it does
two things: it keeps you from building unused generality (YAGNI), and it makes
the *next* test do real work — each new test ratchets the implementation from
specific toward general only as far as the tests demand. The tests, not your
imagination, drive how general the code becomes.

### The triangulation technique

When one test can be passed by an obviously-too-specific implementation
(hardcode the answer), **triangulation** is how you force generality honestly:
add a *second* test with different inputs so the hardcoded value can no longer
satisfy both, and the simplest thing that passes both is the real logic.

```python
# Red 1
def test_add_2_2(): assert add(2, 2) == 4
# Green 1 (deliberately naive — it passes!)
def add(a, b): return 4
# Red 2 forces the issue
def test_add_2_3(): assert add(2, 3) == 5
# Green 2 — now the only simple thing that passes both is the real impl
def add(a, b): return a + b
```

You won't literally hardcode every function, but triangulation is the mental
model: when you're unsure of the general rule, add examples until the general
rule is the *only* simple thing that fits. It's especially useful for logic with
tricky boundaries — add the edge cases as tests and let them shape the code.

### TDD's tradeoffs: where it helps, where it hurts

TDD is not free and not universal. It **helps most** when: the requirements are
clear enough to state as examples; the logic has real branching/rules (pricing,
validation, state machines, parsers, algorithms); bugs are expensive; and you
expect the code to be changed later (the regression net pays off). It **helps
least, or actively slows you down**, when: you're *exploring* and don't yet know
what correct looks like (a spike, a prototype, "what does this API even
return?"); the code is a thin, logic-free wrapper (a one-line pass-through to a
library); the thing is throwaway; or the behavior is dominated by external
systems you'd have to heavily mock, where the test becomes a restatement of the
implementation rather than a specification.

The honest practitioner's stance: **TDD for logic, spike-then-stabilize for the
unknown.** When you don't know the shape yet, *spike* — write throwaway
exploratory code with no tests to learn the domain — then throw it away and
rebuild it test-first now that you know what "correct" means. Dogmatic
"always/never" positions both cost you; the skill is reading the situation.

### Refactoring under a green suite

The third beat is the one people skip, and it's where the compounding value is.
**Refactoring** means changing the *structure* of code without changing its
*behavior* — and the only thing that lets you do that confidently is a green
test suite that will go red the instant behavior changes. TDD builds that suite
as you go, so refactoring becomes a safe, routine step rather than a scary
rewrite. Crucially, you refactor the *tests* too: after green, dedupe setup into
fixtures (module 01), collapse similar tests into a parametrized table, and
rename tests to describe behavior. And you never refactor and change behavior in
the same step — if the suite goes red during a refactor, you know it was the
refactor, because you weren't also adding behavior.

## Command reference

| Command / practice | Purpose in the TDD loop |
|---|---|
| `pytest --lf` | Re-run only last-failed — your inner red→green loop |
| `pytest -x` | Stop at first failure — stay focused on one red test |
| `pytest -k <name>` | Run just the test you're driving right now |
| `pytest -q` after every beat | Confirm red, then green, then still-green |
| `pytest-watch` / `ptw` | Auto-run the suite on save (tight feedback) |
| `@pytest.mark.xfail(reason=...)` | Mark a not-yet-implemented behavior red-on-purpose |
| `git commit` on each green | Small safe checkpoints; easy to revert a bad refactor |
| `assert` one behavior per test | Keep "one reason to fail" in the loop |

A full red-green-refactor cycle for one behavior of a `slugify` feature:

```python
# --- RED: write the test first, run it, watch it fail ---
# test_slug.py
from app.slug import slugify

def test_lowercases_and_hyphenates():
    assert slugify("Hello World") == "hello-world"
```

```
$ pytest -q
E   ModuleNotFoundError: No module named 'app.slug'   # red for the right reason
```

```python
# --- GREEN: minimum code to pass ---
# app/slug.py
def slugify(text: str) -> str:
    return text.lower().replace(" ", "-")
```

```
$ pytest -q
1 passed
```

```python
# --- RED again: drive the next behavior (strip punctuation) ---
def test_strips_punctuation():
    assert slugify("Hello, World!") == "hello-world"
```

```python
# --- GREEN: generalize just enough ---
import re
def slugify(text: str) -> str:
    text = re.sub(r"[^\w\s-]", "", text.lower())
    return re.sub(r"[\s]+", "-", text).strip("-")
```

```python
# --- REFACTOR: no new behavior; collapse the tests into a table ---
@pytest.mark.parametrize("raw, expected", [
    ("Hello World", "hello-world"),
    ("Hello, World!", "hello-world"),
    ("  spaced  out  ", "spaced-out"),
])
def test_slugify(raw, expected):
    assert slugify(raw) == expected     # suite stays green throughout
```

## Hands-on exercises

Work in `testing-lab/`. For each exercise, actually *run the test and see it
red before you make it green* — that's the part that's tempting to skip and the
part that matters.

### 1. Do one full cycle by the book

Build `slugify` exactly as in the reference: write `test_lowercases_and_
hyphenates` first, run it, **screenshot/note the red**, make it green with the
one-liner, then add the punctuation test (red), generalize (green), then
refactor the two tests into a parametrized table (stay green). Do not write
punctuation handling before its test exists.

### 2. Triangulate a rule you don't hardcode

Build a `roman(n) -> str` converter test-first, starting from `roman(1) ==
"I"`. Deliberately make the first test pass by `return "I"`. Add `roman(2) ==
"II"`, then `roman(4) == "IV"`, then `roman(9) == "IX"`, letting each new test
force more of the real algorithm. Notice how the edge cases (4, 9, 40) drive the
design, not your upfront cleverness.

### 3. Drive a small feature end to end

TDD a `PasswordPolicy.validate(pw) -> list[str]` (returns a list of rule
violations) with these rules, one test at a time, red first each time: min
length 8, at least one digit, at least one uppercase, not in a small
`COMMON_PASSWORDS` set. After all are green, refactor the rule checks into a
clean structure without changing behavior. Expected: ~5 tests, each added red.

### 4. Refactor under green

Take your green `PasswordPolicy` and refactor the implementation from a pile of
`if`s into a list of `(predicate, message)` rules iterated in a loop. Run the
suite after *every* small edit. The suite must stay green the entire time — if
it goes red, you changed behavior, so revert and try again.

### 5. Spike, then stabilize

Pick something you *don't* know the shape of — e.g. parsing a `"1h30m"`-style
duration string into seconds. First **spike**: write throwaway code in a REPL/
scratch file with no tests until you understand the cases (empty, `"45m"`,
`"2h"`, `"1h30m"`, garbage). Then **delete the spike** and rebuild it
test-first. Write one sentence on what the spike taught you that made the
test-first version better.

### 6. Decide TDD or not, and justify

For each of these, write "TDD" or "spike-first" and one line of why: (a) a tax
bracket calculator with published rules; (b) gluing together an unfamiliar
third-party SDK you've never used; (c) a JSON-to-CSV exporter with clear
mapping rules; (d) a one-line wrapper that forwards to `logging.info`; (e) a
retry/backoff state machine. Expected: a, c, e → TDD; b, d → spike/skip.

### 7. Diagnose and fix: TDD done wrong

A teammate says they "did TDD" and shows you this. Identify every way it
violates the discipline, and describe the correct sequence.

```python
# They wrote the full implementation first...
def price_with_tax(cents: int, rate: float) -> int:
    if cents < 0:
        raise ValueError("negative")
    return round(cents * (1 + rate))

# ...then wrote this test afterward and it passed on the first run:
def test_price_with_tax():
    assert price_with_tax(1000, 0.1) == 1100
    assert price_with_tax(0, 0.2) == 0
    assert price_with_tax(-5, 0.1)  # expecting it to raise? no pytest.raises
```

<details>
<summary>Solution</summary>

Violations: **(1) Code was written before the test** — the whole point of TDD
is the test comes first and you *see it fail*; this test was green on its first
run, so it never demonstrated it can fail and never drove the design. **(2) The
test bundles three behaviors** (normal calc, zero, negative) into one function —
no single reason to fail, and it drives nothing incrementally. **(3) The
negative case is broken**: `price_with_tax(-5, 0.1)` is called as a bare
expression with no `pytest.raises`, so it *actually raises `ValueError`* and
fails the test the moment you reach that line — or if it didn't raise, the line
asserts nothing. The "test" is confused about what it's checking.

Correct sequence, test-first, one behavior per loop:

```python
# Red 1
def test_adds_tax(): assert price_with_tax(1000, 0.1) == 1100
# Green 1: return round(cents * (1 + rate))
# Red 2
def test_zero_amount_is_zero(): assert price_with_tax(0, 0.2) == 0
# (already green — fine, it confirms a boundary)
# Red 3 — drive the negative rule into existence
def test_negative_amount_raises():
    with pytest.raises(ValueError):
        price_with_tax(-5, 0.1)
# Green 3: add the guard clause. Refactor if needed, suite stays green.
```

Each behavior added as its own red test, seen failing, then made green.

</details>

## Independent challenge

No code given. Build a small **shopping-cart discount engine**
*entirely test-first* — no production line written before a failing test
demands it. Requirements, to be introduced one red test at a time: a cart sums
its line items; a `SAVE10` code takes 10% off; a `FREESHIP` code zeroes a flat
shipping fee; percentage discounts never apply to shipping; two codes can't
stack (the second is rejected); an unknown code raises a domain exception.
Reach back to **module 01 (Unit Testing in Depth)** to keep the suite clean as
it grows — extract the cart construction into a fixture and collapse the
per-code cases into a parametrized table *during the refactor beat*, never
while adding behavior. When you finish, you should have driven every rule into
existence red-first, and be able to point at the exact commit where each rule
turned green.

<details>
<summary>Hint</summary>

Keep each loop to one rule: write the smallest test (e.g. "empty cart totals
0"), watch it fail, add the minimum code, then move on — don't build the
discount-code machinery until a test for `SAVE10` forces it. The "no stacking"
and "unknown code raises" rules are the ones people implement prematurely;
resist until their red tests exist. Do the fixture extraction and the
parametrize collapse strictly in the refactor beat with the suite green, so you
always know a red came from behavior, not restructuring.

</details>

## Common mistakes & troubleshooting

- **Writing code first, then a test that passes immediately.** That's
  test-after wearing a TDD label — the test never proved it can fail. Write the
  test first and *watch it go red*.
- **A first test that's green from the start.** Means it asserts nothing real or
  the behavior already existed. Make sure red is red for the right reason before
  you write any implementation.
- **Implementing the whole feature to pass one test.** Builds unused generality
  and skips the ratchet. Write the simplest thing that passes; let the next test
  force generality (triangulate).
- **Skipping the refactor beat.** Green-green-green with no cleanup accretes
  duplication and mess; the suite you were building to enable safe refactoring
  never gets used for it. Refactor every cycle, under green.
- **Refactoring and adding behavior in the same step.** When it breaks you won't
  know which caused it. Separate the beats.
- **TDD-ing a spike.** Test-driving code whose correct behavior you don't know
  yet wastes effort on tests you'll throw away. Spike first (no tests), learn,
  then rebuild test-first.
- **Tests that mirror the implementation.** If the test just restates the code
  line-for-line (heavy mocking of every internal call), it's not a spec, it's a
  copy — it'll break on every refactor and catch no real bugs.

## Checkpoint quiz

Write down your answer to each question before expanding it — checking without attempting first is the single easiest way to fool yourself into thinking you've learned this.

1. Name the three beats of the TDD loop and state the single most important
   rule of each.
2. Why must you *see the test fail* before making it pass? What does a
   green-on-first-run test fail to prove?
3. What is the "design pressure" argument for writing the test first — what does
   being the first caller force you to decide?
4. What is triangulation, and what problem does it solve during the green beat?
5. Give two situations where TDD clearly helps and two where it clearly hurts,
   with the reason in each case.
6. What is a "spike," and what's the recommended way to combine spiking with
   TDD when you don't yet know what correct looks like?
7. Why must you never refactor and add behavior in the same step, and what makes
   the refactor step safe at all?

<details>
<summary>Answers</summary>

1. Red: write one small failing test first and see it fail for the right
   reason. Green: write the *minimum* code to pass (all) tests. Refactor:
   improve structure of code and tests *without changing behavior*, staying
   green.
2. Because a test you've watched fail is one you trust to actually check the
   behavior; a green-on-first-run test proves nothing — it might assert nothing,
   or the behavior may already exist, so it can't demonstrate it would catch the
   bug it's supposed to guard.
3. Writing the test first makes you the first *caller* of code that doesn't
   exist, forcing you to design the name, arguments, return type, and failure
   mode from the outside (what's convenient to use), which yields simpler,
   more usable interfaces and surfaces bad design immediately.
4. Triangulation is adding a second (and more) example with different inputs so
   an over-specific implementation (e.g. a hardcoded return) can no longer pass
   all tests, forcing the general rule to emerge as the simplest thing that
   fits. It solves "how do I honestly generalize" without guessing ahead of the
   tests.
5. Helps: clear-rule logic (pricing, validation, state machines) where examples
   are easy to state; code you'll change later (the regression net pays off).
   Hurts: exploratory/spike work where correct behavior is unknown; thin
   logic-free wrappers or throwaway code where tests just restate the
   implementation.
6. A spike is throwaway exploratory code written with no tests to learn the
   domain/API. When you don't know what correct looks like, spike first, learn,
   then *delete the spike* and rebuild it test-first now that you can state the
   behavior as tests.
7. Because if you change structure and behavior at once and the suite goes red,
   you can't tell which caused it. Refactoring is only safe *because* a green
   suite will go red the instant behavior changes — so you keep behavior
   changes (with their own new tests) in separate steps from pure restructuring.

</details>

## Next

[03-integration-testing](../03-integration-testing/README.md) — your unit tests
and TDD loop work entirely with doubles, in isolation. Next you'll wire real
pieces together: test a service against a *real* test database, drive FastAPI
routes through `TestClient`/`httpx`, manage test data setup and teardown, and
meet the testcontainers idea — plus the track's first cumulative review,
closed-book over modules 00–03.
