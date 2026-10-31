# Module 06: Code Quality and Static Analysis

## Why this matters

Tests answer one question: does the code *do* the right thing at runtime? They
say nothing about whether the code is *correct in ways that don't show up in a
passing test* — a function that can hit `None` on a path your tests didn't
exercise, an unused import that hints at dead logic, a parameter you renamed in
the signature but not the docstring, a 200-line function nobody can safely
change. **Static analysis** reads your code *without running it* and catches
this entire class of problem: bugs, type mismatches, style drift, and
excessive complexity, mechanically, on every file, in seconds. It's the perfect
complement to testing — tests explore the runtime behavior you thought to check;
static analysis inspects the whole surface of the code for problems you didn't.
Together they're your two nets, and they catch different fish.

The higher-leverage reason to care is *consistency at scale and speed of
feedback*. A **linter** (ruff) enforces one style and flags likely-bug patterns
so code review stops wasting human attention on spacing and unused variables. A
**type checker** (mypy) verifies that the types flowing through your program
actually line up, turning a class of runtime `AttributeError`/`TypeError` into
compile-time-style errors you see while writing. **Complexity metrics** put a
number on "this function is too tangled to test or change safely." And
**pre-commit hooks** run all of it automatically before code ever leaves your
machine, so the feedback is instant and the mistakes never reach review or CI.
This module is about that whole toolchain — and about what "quality" means
*beyond* passing a linter: readability, low complexity, and changeability, which
are the properties that actually decide whether a codebase stays healthy.

## Concepts

### What static analysis is (and how it complements tests)

**Static analysis** inspects source code *without executing it* — parsing it
into a syntax tree and reasoning about its structure, names, types, and control
flow. Because it never runs the code, it needs no test data, no database, no
setup; it just reads every line and reports problems. That gives it different
strengths from tests:

- **Tests** verify *behavior* on the inputs you chose. They can't tell you a
  variable is unused, a type is wrong on an untested branch, or a function is
  too complex — those aren't behaviors.
- **Static analysis** verifies *properties of the code itself* across all of it
  at once: syntax/style consistency, likely bugs (unused vars, shadowed names,
  mutable default args), type soundness, and complexity — but it can't tell you
  whether your business logic is *right*, only that it's well-formed.

You need both. A codebase can pass 100% of tests and be riddled with type holes
and unmaintainable functions; it can be beautifully typed and linted and compute
the wrong total. Static analysis is fast (no runtime), total (every line), and
early (as you type) — which is exactly why it belongs in your editor, your
pre-commit hook, and your CI, catching the cheap-to-fix problems before a human
or a test ever looks.

```
                       your code
                          |
        +-----------------+------------------+
        |                                    |
     TESTS                            STATIC ANALYSIS
     run the code                     read the code (no run)
     behavior on chosen inputs        every line, all at once
        |                                    |
   "does it do the                   "is it well-formed: typed,
    right thing?"                     lint-clean, simple, consistent?"
        |                                    |
        +----> two nets, different fish <----+
```

### Linting with ruff

A **linter** flags code that is syntactically valid but stylistically
inconsistent or likely buggy. **ruff** is the modern Python linter and formatter
— a single, extremely fast tool (written in Rust) that subsumes what used to be
a pile of separate tools (flake8, isort, pyupgrade, and more) and can also
*format* code (a drop-in for black). It does two distinct jobs:

- **Formatting** (`ruff format`) — mechanically rewrites code to one canonical
  layout: line length, quotes, indentation, import ordering. This ends all style
  debate; there's one format and the tool applies it. No human should ever
  argue about spacing again.
- **Linting** (`ruff check`) — flags rule violations: unused imports/variables,
  undefined names, mutable default arguments, shadowed builtins, comparisons to
  `None` with `==`, unreachable code, and hundreds more. Many are
  **auto-fixable** (`ruff check --fix`).

```python
# ruff flags every one of these:
import os                          # F401 unused import
def f(items=[]):                   # B006 mutable default argument (classic bug)
    x = 1                          # F841 local variable assigned but never used
    if status == None:             # E711 comparison to None should be 'is'
        return
```

The value isn't pedantry — it's that a consistent style makes diffs smaller and
review focused on logic, and that a *lot* of lint rules encode real bug patterns
(the mutable default arg above is a genuine, common Python footgun). ruff makes
running all of this effectively free.

### Type checking with mypy

Python is dynamically typed, but **type hints** (`def total(prices: list[int])
-> int`) let a **static type checker** verify, without running the code, that
the types actually line up: that you don't pass a `str` where an `int` is
expected, don't access an attribute that might be `None`, don't return the wrong
type. **mypy** is the reference type checker; it reads your annotations and flags
mismatches as errors.

```python
def get_user(uid: int) -> User | None:
    return db.get(uid)

def greet(uid: int) -> str:
    user = get_user(uid)
    return f"Hi {user.name}"        # mypy error: user may be None -> no .name
```

That `None` bug is exactly the kind of thing that passes every test where the
user *does* exist and blows up in production for the one that doesn't. mypy
catches it statically. Key ideas:

- **Gradual typing** — you can add types incrementally; unannotated code is
  simply not checked. This lets you adopt mypy on a legacy codebase file by file.
- **Strictness is a dial** — `--strict` turns on all checks (no implicit
  `Any`, no untyped defs, etc.). Start lenient, ratchet toward strict.
- **Types are executable documentation** — a signature that says `-> User |
  None` tells every caller (and mypy) they must handle absence, enforced
  mechanically instead of by hope.

Type checking is not a substitute for tests (it doesn't check that your logic is
right), but it eliminates a whole category of `TypeError`/`AttributeError`/
`None`-handling bugs that tests often miss.

### Complexity metrics: measuring changeability

Beyond correctness and style there's a third axis: **how hard is this code to
understand and change?** **Cyclomatic complexity** counts the number of
independent paths through a function — essentially one plus the number of
branches (`if`, `for`, `and`, `except`, etc.). A function with complexity 3 has
three paths and is easy to hold in your head and to test; a function with
complexity 25 has twenty-five, is nearly impossible to fully test, and is where
bugs breed. Related metrics: **cognitive complexity** (weights nesting more
heavily, closer to human "hard to read"), function **length**, and parameter
count.

These metrics matter because complexity is the leading indicator of
*maintenance cost*: highly complex functions are the ones that get bugs, resist
tests (recall module 01 — hard to test usually means badly structured), and
scare people away from changing them. Tools like ruff (via its `C901` rule) or
`radon` compute complexity and let you set a ceiling, so a function that grows
past, say, complexity 10 fails the check and prompts a refactor *before* it
becomes the untouchable monster. The number is a *signal*, not a law — but a
function screaming past the threshold is a reliable prompt to extract, simplify,
or split.

### Pre-commit hooks: automating the toolchain

Running these tools manually means someone forgets, and inconsistent code
reaches the repo. **Pre-commit hooks** run configured checks automatically at
`git commit` time, on the files you're committing, and *block the commit* if
they fail — so formatting, linting, and type checks happen every time, with no
discipline required. The `pre-commit` framework manages this with a single
config file:

```yaml
# .pre-commit-config.yaml
repos:
  - repo: https://github.com/astral-sh/ruff-pre-commit
    rev: v0.6.0
    hooks:
      - id: ruff          # lint (with --fix)
        args: [--fix]
      - id: ruff-format   # format
  - repo: https://github.com/pre-commit/mirrors-mypy
    rev: v1.11.0
    hooks:
      - id: mypy
```

Now `ruff format`, `ruff check --fix`, and `mypy` run on every commit
automatically. The payoff is **shifting feedback left**: problems are caught on
your machine, in the second before they'd have entered history, instead of in
CI ten minutes later or in review a day later. The same tools then run *again*
in CI (module 07, track 13) as the enforcement backstop for anyone who bypassed
the hook — hooks are the fast local net, CI is the authoritative one.

### What "code quality" actually means (beyond style)

It's tempting to equate "quality" with "passes the linter," but that's the
smallest part. **Quality is fitness for change** — how easily and safely the
next person (usually future-you) can understand and modify the code. Its real
components:

- **Readability** — names that say what they mean, small functions doing one
  thing, obvious control flow. A linter enforces *style* consistency, which
  aids readability, but can't make a bad name good.
- **Low complexity** — few paths per unit, shallow nesting, so code fits in your
  head and is fully testable.
- **Correctness of types and contracts** — interfaces that say what they take
  and return, enforced by mypy, so misuse is caught early.
- **Testability** — which, as module 01 showed, is a *proxy* for good design:
  code that's easy to test tends to be well-structured, low-coupling code.
- **Consistency** — one style, one set of idioms, so the whole codebase reads
  like it was written by one careful person.

Static analysis *measures and enforces the mechanical subset* of these (style,
types, complexity ceilings) so human review can focus on the parts only humans
judge — is this the right abstraction, is the name honest, is the logic sound.
Tools don't create quality; they remove the noise so people can attend to the
quality that matters. Treat lint/type/complexity as a *floor* the machine keeps
you above, not the *ceiling* of what good code is.

## Command reference

| Command / construct | Purpose |
|---|---|
| `pip install ruff mypy pre-commit radon` | The static-analysis toolchain |
| `ruff format .` | Auto-format the whole tree to one canonical style |
| `ruff check .` | Lint: report violations |
| `ruff check --fix .` | Lint and auto-fix what's safely fixable |
| `ruff check --select C901 .` | Flag functions over the complexity ceiling |
| `mypy app/` | Type-check a package |
| `mypy --strict app/` | Full-strength type checking |
| `radon cc app/ -a` | Cyclomatic complexity per function, with average |
| `pre-commit install` | Install the git hook so checks run on commit |
| `pre-commit run --all-files` | Run all hooks over the whole repo (first time / CI) |
| `# type: ignore[code]` | Suppress one specific mypy error (with a reason) |
| `# noqa: F401` | Suppress one specific ruff rule on a line |

Configuring ruff and mypy in `pyproject.toml` (one place, versioned with the
code):

```toml
[tool.ruff]
line-length = 88
target-version = "py312"

[tool.ruff.lint]
select = ["E", "F", "I", "B", "C901", "UP"]   # errors, pyflakes, isort, bugbear, complexity, pyupgrade
# C901 flags overly complex functions; tune the ceiling:
[tool.ruff.lint.mccabe]
max-complexity = 10

[tool.mypy]
python_version = "3.12"
strict = true
warn_return_any = true
warn_unused_ignores = true
```

A before/after that mypy and ruff would both improve:

```python
# before: untyped, a None hole, a mutable default, an unused import
import json                                   # F401 unused
def load(cfg={}):                             # B006 mutable default
    user = cfg.get("user")                    # user: str | None
    return user.strip().lower()               # AttributeError if user is None

# after: typed, safe, lint-clean
def load(cfg: dict[str, str] | None = None) -> str | None:
    cfg = cfg or {}
    user = cfg.get("user")
    return user.strip().lower() if user is not None else None
```

Reducing complexity by extraction (what a `C901` failure prompts):

```python
# complexity ~12: one function branching on everything (fails max-complexity=10)
def price(order): 
    ...  # nested ifs for discounts, tax, shipping, coupons all inline

# refactored: each concern is a small, testable, low-complexity function
def price(order):
    subtotal = _subtotal(order)
    subtotal = _apply_discounts(subtotal, order)
    return subtotal + _tax(subtotal, order) + _shipping(order)
```

## Hands-on exercises

Work in `testing-lab/`. Install `ruff`, `mypy`, `pre-commit`, and `radon`.

### 1. Format and lint the whole project

Run `ruff format .` then `ruff check .`. Read every violation ruff reports. Fix
the auto-fixable ones with `ruff check --fix .` and hand-fix the rest. Commit the
now-consistent tree. Note how many were real issues vs. pure style.

### 2. Catch a real bug with a lint rule

Introduce a function with a mutable default argument (`def add(item, bucket=[])`)
and call it twice, appending each time. Observe the shared-list bug at runtime,
then confirm `ruff check` flags it as `B006` *statically* — before you ever ran
it. Fix it (`bucket=None` + `bucket = bucket or []`).

### 3. Add types and let mypy find a None hole

Add type hints to a function that calls something returning `X | None` and then
uses the result without a None check (like the `greet`/`get_user` example). Run
`mypy app/`. Confirm it reports the possible-`None` access. Fix it and re-run to
green.

### 4. Turn strictness up gradually

Run `mypy app/` (lenient), note the count, then `mypy --strict app/` and note
the larger count. Pick one file and get it fully strict-clean (add annotations
until zero errors). Reflect: strict mode surfaced how much of your code was
implicitly `Any`.

### 5. Measure and reduce complexity

Run `radon cc app/ -a` (or `ruff check --select C901` with `max-complexity=10`).
Find your most complex function and refactor it by extracting helpers until it's
under the ceiling. Re-measure and confirm the number dropped. Your existing
tests (keep them green) prove the refactor preserved behavior.

### 6. Wire up pre-commit

Add a `.pre-commit-config.yaml` with ruff (lint+format) and mypy, run
`pre-commit install`, then make a commit that deliberately includes a lint
error. Confirm the commit is *blocked*. Fix and commit successfully. You now
have an automatic local net.

### 7. Distinguish "passes the linter" from "quality"

Take a function that is fully lint- and type-clean but genuinely hard to read
(bad names, deep nesting, doing three things). Improve its *readability* — rename,
extract, flatten — without any tool complaining either before or after. Write one
sentence on what you improved that no tool measured.

### 8. Diagnose and fix: green tests, green lint, latent bug

This module passes its tests and `ruff check` is clean, yet it has a bug mypy
would catch and a complexity problem a metric would flag. Find both and fix
them.

```python
def classify(score):                       # no type hints
    if score >= 90:
        if score >= 97:
            grade = "A+"
        else:
            grade = "A"
    elif score >= 80:
        grade = "B"
    elif score >= 70:
        grade = "C"
    else:
        grade = None                        # returns None for < 70
    return grade.lower()                    # bug: None.lower() on low scores
```

<details>
<summary>Solution</summary>

**The latent bug (mypy would catch it):** `grade` is `str | None` — the `else`
branch sets it to `None` — and then `grade.lower()` is called unconditionally,
so any score below 70 raises `AttributeError: 'NoneType' object has no attribute
'lower'`. Tests pass only because they never fed a sub-70 score; `ruff` doesn't
model values so it stays quiet. **mypy with types would flag `grade.lower()`** as
calling a method on a possibly-`None` value.

**The complexity/readability problem:** the nested `if score >= 90 / if score >=
97` plus the chain pushes cyclomatic complexity up and nests unnecessarily; a
metric (radon / `C901`) flags it, and it reads worse than it needs to.

Fix — annotate, handle the `None`/low case honestly, and flatten:

```python
def classify(score: int) -> str:
    if score >= 97: return "a+"
    if score >= 90: return "a"
    if score >= 80: return "b"
    if score >= 70: return "c"
    return "f"                              # a real grade, never None
```

Now mypy is satisfied (always returns `str`), the `None.lower()` bug is
structurally impossible, and the flattened early-returns drop the complexity and
read top-to-bottom. Add a parametrized test (module 01) covering the sub-70
boundary that the original suite missed.

</details>

## Independent challenge

No code given. Take the layered service from
**02-api-layer-and-request-handling (module 06, Handlers, Controllers, and
Services)** — or any earlier-track project you have — and bring it up to a real
static-analysis standard from scratch. Configure `ruff` (lint + format, with a
`max-complexity` ceiling) and `mypy` (start lenient, then push one whole module
to `--strict`-clean by adding annotations) in `pyproject.toml`. Fix every lint
and type finding — and treat any possibly-`None` access mypy reports as a real
bug to handle, not to `# type: ignore` away. Use a complexity metric to find your
worst function and refactor it under the ceiling while keeping your existing
tests green (proving behavior is unchanged). Finally, wire a
`.pre-commit-config.yaml` running all of it and `pre-commit run --all-files` to
green. The deliverable is a project where `ruff check`, `mypy`, and the
pre-commit suite all pass, plus one paragraph on a quality improvement you made
that *no* tool measured (a rename, a clearer abstraction).

<details>
<summary>Hint</summary>

Do it in the cheap-to-expensive order so each step shrinks the next: `ruff
format` first (mechanical, resolves most noise), then `ruff check --fix`, then
`mypy` (which now reads cleaner code). For the strict-clean module, the most
valuable errors are the `X | None` ones — resist `# type: ignore`; each one is a
real "what happens when this is absent?" you should answer in code, exactly the
kind of latent bug tests miss. Keep your module-01 tests running throughout the
complexity refactor so a green suite proves you only changed structure, not
behavior.

</details>

## Common mistakes & troubleshooting

- **Treating "passes the linter" as "high quality."** Style/type/complexity are
  the mechanical *floor*; readability, honest names, and right abstractions are
  the quality that matters and that tools can't judge.
- **Silencing mypy with blanket `# type: ignore`.** Each ignore hides a real
  question (often a `None` hole). Fix the underlying issue; if you must ignore,
  scope it (`[error-code]`) and comment why.
- **Adopting `--strict` on a whole legacy codebase at once.** Overwhelming.
  Gradual typing: annotate and stricten file by file, ratcheting up.
- **Ignoring complexity numbers.** A function screaming past the ceiling is
  where bugs and untestability live. Extract and split before it becomes
  untouchable.
- **Running tools only in CI.** Feedback comes ten minutes late. Add pre-commit
  hooks so problems are caught locally, in the second before commit.
- **Formatting debates in review.** A total waste of human attention. Adopt
  `ruff format` and let the tool decide, once, for everyone.
- **Confusing formatting with linting.** Formatting rewrites layout;
  linting/type-checking find bugs and smells. You want all of them, not just
  the pretty-printer.
- **Mutable default arguments and `== None`.** Classic footguns ruff flags for
  free — don't wave them off as pedantry; they're real bugs waiting for a
  specific input.

## Checkpoint quiz

Write down your answer to each question before expanding it — checking without attempting first is the single easiest way to fool yourself into thinking you've learned this.

1. What does static analysis check that tests structurally cannot, and vice
   versa? Why do you need both?
2. What are the two distinct jobs ruff does, and why does auto-formatting matter
   beyond aesthetics?
3. Give a concrete bug class mypy catches that a passing test suite commonly
   misses, and explain why the tests miss it.
4. What does cyclomatic complexity measure, and why is a high number a reliable
   signal even though it's not a hard law?
5. What do pre-commit hooks buy you over running the same tools in CI, and why
   run them in *both* places?
6. "The code passes ruff and mypy, so it's high quality." What's wrong with that
   claim, and what components of quality do the tools *not* capture?
7. mypy reports a possibly-`None` attribute access. What are your two options,
   and which is almost always right?

<details>
<summary>Answers</summary>

1. Static analysis checks properties of the code itself across every line
   without running it — style, likely-bug patterns, type soundness, complexity —
   but can't tell if the business logic is *right*. Tests check runtime behavior
   on chosen inputs but can't see unused code, type holes on untested branches,
   or complexity. They catch different problems, so you need both.
2. Formatting (`ruff format`) rewrites code to one canonical layout, and linting
   (`ruff check`) flags violations/likely bugs. Auto-formatting matters because
   it ends style debate, keeps diffs small, and lets review focus on logic
   instead of spacing — a consistency and human-attention win, not just looks.
3. A possibly-`None` (or wrong-type) access — e.g. calling `.name` on a
   `User | None` — raising `AttributeError`/`TypeError` on a path where the value
   is absent. Tests miss it because they typically exercise the case where the
   value exists; mypy checks *all* paths statically via the declared type.
4. The number of independent paths through a function (roughly branches + 1). A
   high number is a reliable maintenance/bug/testability signal because more
   paths mean harder to understand, fully test, and change safely; it's a prompt
   to refactor, not an absolute rule, since context sometimes justifies it.
5. Pre-commit hooks catch problems locally, instantly, before code enters
   history — feedback shifted left, no reliance on discipline. You still run them
   in CI as the authoritative backstop for anyone who bypassed or skipped the
   local hook, so nothing unchecked merges.
6. It conflates the mechanical floor with quality. Passing tools means consistent
   style, sound types, and bounded complexity — but not good names, right
   abstractions, honest readability, or correct logic. Those human-judged
   components are what actually make code fit for change, and no tool measures
   them.
7. Either handle the `None` (add a guard / return early / change the contract),
   or suppress with a scoped `# type: ignore[...]` and a reason. Handling it is
   almost always right — the report usually reveals a real unhandled-absence bug
   that a specific input would trigger.

</details>

## Further reading & sources

- [Ruff documentation](https://docs.astral.sh/ruff/) - Official docs for the fast Python linter and formatter used throughout this module.
- [mypy documentation](https://mypy.readthedocs.io/en/stable/) - The reference type checker, including gradual typing and `--strict`.
- [pre-commit.com](https://pre-commit.com/) - The framework for running ruff/mypy automatically at commit time via `.pre-commit-config.yaml`.
- [PEP 484 — Type Hints](https://peps.python.org/pep-0484/) - The specification that introduced Python's type-hint syntax mypy checks.
- [Radon documentation](https://radon.readthedocs.io/en/latest/) - Tool for computing cyclomatic and cognitive complexity, the changeability metric discussed here.
- [Wikipedia — Cyclomatic complexity](https://en.wikipedia.org/wiki/Cyclomatic_complexity) - Background on McCabe's path-counting metric behind ruff's `C901` rule.

## Next

[07-testing-in-ci-and-test-strategy](../07-testing-in-ci-and-test-strategy/README.md)
— you now have tests across every layer and a static-analysis toolchain. Next
you'll automate all of it in CI (briefly — track 13 goes deep on CI/CD), learn
to triage flaky tests systematically, and design a coherent test strategy that
keeps the pyramid balanced as a codebase grows — plus the track's second
cumulative review, closed-book over everything from module 00 on.
