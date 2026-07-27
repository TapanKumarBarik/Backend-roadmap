# Module 07: Testing in CI and Test Strategy

## Why this matters

A test that only runs when someone remembers to run it is barely a test. The
whole value of the suite you've built — fast unit tests, DB-backed integration
tests, a contract test, a critical e2e journey, plus ruff and mypy — is only
realized when it runs **automatically, on every change, for everyone, before it
merges**. That's **continuous integration (CI)**: a server that, on every push,
checks out the code, installs dependencies, and runs your checks, blocking the
merge if anything fails. Without it, "the tests pass" means "passed on someone's
machine, at some point, maybe" — and the suite slowly rots as failures get
ignored. With it, main stays green because nothing red can get in. This module
covers the CI mechanics *briefly and on purpose* — **track 13
(DevOps for Backend Engineers)** owns CI/CD in depth, and this module cross-
references it rather than duplicating it — so we focus on the parts that are
*about testing*: how to structure the pipeline around your pyramid layers.

The larger subject here is **test strategy** — the judgment that ties this whole
track together. A real codebase's suite is a living system with a budget: total
runtime, flakiness, and maintenance all cost something, and you're constantly
deciding where a new test should live, when a slow suite needs re-balancing, and
what to do when a test flakes. Get this wrong and even a well-intentioned team
ends up with a 40-minute, 8%-flaky suite nobody trusts — the exact failure the
pyramid was invented to prevent. So this module is about running tests in CI,
triaging flaky tests systematically (not with blanket retries), and steering the
pyramid's shape deliberately as the codebase grows. It closes with the track's
second cumulative review, closed-book over everything from module 00.

## Concepts

### CI fundamentals for testing (the short version)

**Continuous integration** means every change is automatically built and
verified against the shared codebase, frequently, so integration problems
surface immediately instead of at a painful "merge day." For testing purposes,
the mechanics reduce to: a **CI service** (GitHub Actions, GitLab CI, etc.)
watches your repo; on each push/PR it runs a **pipeline** — a declarative list
of steps: check out code, set up Python, install deps, run linters, run tests,
report status. If any step fails, the pipeline is **red** and a
**branch-protection rule** blocks merging. The result is an enforced invariant:
*code that fails checks cannot reach main.*

```yaml
# .github/workflows/ci.yml -- the testing-relevant skeleton (track 13 goes deep)
name: ci
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with: { python-version: "3.12" }
      - run: pip install -e ".[dev]"
      - run: ruff check .            # static analysis
      - run: mypy app/
      - run: pytest -m "not e2e" --cov=app --cov-report=term-missing
```

The two testing-specific ideas to carry into track 13: **the CI environment
must be reproducible** (pinned dependencies, a clean checkout, services like
Postgres provided by the pipeline — this is where testcontainers/CI service
containers earn their keep, module 03), and **the pipeline should fail fast and
loud** — cheap checks first, so a lint error doesn't wait behind a ten-minute
e2e run to tell you about a missing import.

### Structuring the pipeline around the pyramid

Your pyramid layers have wildly different costs, so you don't run them all the
same way. The strategy is **stage by speed and blast radius**, cheapest and most
frequent first:

- **On every push / pre-merge (must be fast):** static analysis (ruff, mypy) and
  the full **unit** suite, plus the **integration** suite if it fits the time
  budget (a few minutes). These gate the merge. The markers from modules 03/05
  (`pytest -m "not e2e"`) are exactly what lets you run everything *but* the slow
  tip here.
- **On merge to main / nightly (can be slower):** the **e2e** journeys and any
  long contract/fuzz runs. These are too slow and flaky to block every PR, but
  they must run regularly against an integrated environment so a real systemic
  break is caught within hours, not at release.

This mirrors the pyramid directly: the wide, fast base runs constantly and
gates; the narrow, slow tip runs less often and informs. **Fail fast** within a
stage too — lint before tests, unit before integration — so the quickest signal
comes first. The anti-pattern is running everything, always, in one giant
serial job: PRs take twenty minutes, people batch changes to avoid the wait, and
the flaky e2e tests block unrelated unit-only fixes.

### Flaky tests: triage, don't tolerate

A **flaky test** passes and fails nondeterministically with no code change. Flaky
tests are corrosive beyond their own failures: they train the team to ignore red
("just re-run it"), and once "re-run it" is the reflex, a *real* failure gets
re-run and merged too. So the discipline is a **triage process**, not tolerance:

1. **Detect & quantify** — track which tests fail intermittently (CI can flag
   re-run-passes). A test that fails ~5% of runs is a defect with a number, not
   background noise.
2. **Quarantine** — move a known-flaky test out of the merge-blocking lane
   (mark it, run it non-gating) so it stops blocking honest work — but keep it
   *visible*, never just delete or `skip` and forget.
3. **Fix the root cause** — flakes have a small set of usual causes: *timing*
   (fixed `sleep`, asserting before an async result lands → wait for a
   condition), *shared state / order dependence* (tests colliding on a DB row or
   global → isolate state, module 03), *nondeterminism* (real clock, `random`,
   `uuid`, dict ordering → inject/control it, module 04), and *external
   dependencies* (a live third party → fake at the edge, module 05).
4. **De-quarantine** once fixed and stable.

The one thing you must **not** do is paper over flakes with **blanket automatic
retries**. A global "retry failed tests 3×" turns a flaky test green *and* turns
a genuine intermittent bug green — you've disabled your own detector. Retries can
be a narrow, deliberate tool for a specific irreducibly-nondeterministic
boundary, but as a blanket policy they hide exactly the bugs tests exist to
find.

### Test strategy for a growing codebase

Early on, any tests are better than none. As a codebase grows, the suite becomes
a system you must actively *steer*, against a budget of **total runtime,
flakiness, and maintenance effort**. The guiding questions:

- **Where does a new test belong?** Default to the *lowest layer that can give
  the confidence you need* (the pyramid's core rule). A business rule → unit. A
  SQL/wiring/serialization concern → integration. Interface drift → contract. A
  critical deployed-system journey → e2e. Resisting the pull to test everything
  at the top is the single most important habit.
- **Is the shape drifting?** Watch for the **ice-cream cone** creeping in (slow
  suite, growing e2e count, rising flake rate). Re-balance by pushing coverage
  down: replace three e2e rule-tests with three integration or unit tests that
  give the same confidence faster.
- **What's the suite's runtime trend?** If the pre-merge suite crosses a few
  minutes, developers start avoiding it. Parallelize, split fast/slow lanes,
  and cut redundant slow tests before the trend makes the suite unusable.
- **Is coverage guiding or gaming?** Use coverage (module 01) to find untested
  *risky* code, not to hit a mandated number that breeds assertion-free tests.

Strategy is continuous, not one-time: every PR is a small decision about where a
test goes, and every few months a look at runtime and flake trends to
re-balance.

### Balancing the pyramid layers in practice

The pyramid is a *shape*, not exact ratios — the point is relative proportion:
**many fast isolated tests, fewer integration tests, a handful of e2e.** In
practice you balance three forces per candidate test:

- **Confidence** — does this test catch a real, likely, costly bug? (If not,
  it's noise regardless of layer.)
- **Speed** — how much does it add to the suite's runtime, and how often does it
  run? (A slow test on the pre-merge path is expensive; the same test nightly is
  cheap.)
- **Stability** — how likely is it to flake? (Higher layers flake more, which is
  the tax you pay for their broader coverage.)

The recurring decision is **push down**: whenever a bug could be caught at a
lower layer, catch it there — faster, more stable, more precise on failure —
and reserve each higher layer for the bugs *only it* can catch (wiring/SQL for
integration, deployment/journeys for e2e, drift for contract). Do that
consistently and the shape stays healthy on its own; skip it "just to be safe"
repeatedly and you rebuild the cone one reasonable-seeming test at a time. A
balanced pyramid isn't an accident — it's the cumulative result of answering
"what's the fastest test that gives me this confidence?" every single time.

## Command reference

| Command / construct | Purpose |
|---|---|
| `pytest -m "not e2e"` | Pre-merge lane: everything but the slow tip |
| `pytest -m e2e` | Post-merge / nightly lane: the slow journeys |
| `pytest -n auto` (pytest-xdist) | Run tests in parallel across CPUs |
| `pytest --durations=10` | Show the 10 slowest tests (find what to trim/parallelize) |
| `pytest --lf` / `--ff` | Last-failed / failed-first — fast local triage |
| `pytest -p no:randomly` vs `pytest-randomly` | Toggle random ordering to surface order-dependence |
| `pytest --maxfail=1` | Fail fast in CI |
| `@pytest.mark.flaky` / quarantine marker | Tag a known flake to run non-gating |
| `@pytest.mark.skip(reason=...)` / `xfail` | Skip / expected-fail with a documented reason |
| branch protection: "require CI to pass" | Enforce that red can't merge |
| `ruff check . && mypy app/ && pytest` | The local pre-push mirror of CI |

Splitting the pipeline into a gating fast lane and a nightly slow lane:

```yaml
jobs:
  fast:                                   # every push/PR — gates the merge
    steps:
      - run: ruff check . && mypy app/
      - run: pytest -m "not e2e" -n auto --maxfail=1 --cov=app
  e2e:                                    # only on main / schedule — informs
    if: github.ref == 'refs/heads/main'
    steps:
      - run: pytest -m e2e
```

Systematically finding the flaky/slow tests to triage:

```bash
pytest --durations=15                     # what's slow enough to move to nightly?
pytest -p randomly --count=20 test_x.py   # re-run to expose intermittency (pytest-repeat)
```

Quarantining a flake without hiding it (visible, non-gating, tracked):

```python
@pytest.mark.flaky_quarantine   # a custom marker your CI runs but does NOT gate on
def test_async_notification_arrives():
    ...
# CI fast lane runs:  pytest -m "not e2e and not flaky_quarantine"
# a separate reported (non-blocking) job runs the quarantined ones, tracked to a fix
```

## Hands-on exercises

Work in `testing-lab/`. You have unit, integration, contract, and e2e tests plus
ruff/mypy from earlier modules.

### 1. Write a minimal CI pipeline

Create `.github/workflows/ci.yml` that checks out code, sets up Python, installs
deps, and runs `ruff check`, `mypy`, and `pytest -m "not e2e"`. Push it (or run
`act`/read it carefully if offline). Confirm the ordering puts the cheap checks
first. Cross-reference: note which parts track 13 will expand.

### 2. Make CI fail fast and loud

Introduce a lint error and a failing unit test in one commit. Confirm the
pipeline goes red at the *first* failing step and that the report tells you which
step. Then reorder so tests run before lint and observe the worse feedback (you
wait for tests to learn about a typo). Restore cheap-checks-first.

### 3. Split fast and slow lanes

Restructure into two jobs: a `fast` job (lint, mypy, `-m "not e2e"`) that gates
every PR, and an `e2e` job that runs only on main. Time both. Write one sentence
on why gating every PR on the e2e job would be a mistake.

### 4. Parallelize and find the slow tests

Add `pytest-xdist` and run the base suite with `-n auto`; compare wall-clock to
serial. Run `pytest --durations=10` and identify your slowest tests. Decide for
each: legitimately slow (integration/e2e → belongs in a slower lane) or an
accidentally-slow unit test to fix.

### 5. Reproduce and triage a real flake

Take an integration test and reintroduce an isolation bug (shared row, no
rollback — module 03). Run it 20× (`pytest-repeat`) to see intermittent
failures. Triage it by the four-cause checklist, identify the cause (shared
state), and fix the root cause. Confirm 20/20 green.

### 6. Quarantine without hiding

For a genuinely hard-to-stabilize test, add a `flaky_quarantine` marker, exclude
it from the gating lane (`-m "not flaky_quarantine"`), and run it in a separate
non-blocking job. Write the one-line tracking note ("quarantined <date>, cause
suspected X, owner Y"). Confirm honest PRs no longer block on it.

### 7. Place five new tests deliberately

You're adding: (a) a new discount rule; (b) a new SQL query with a join; (c) a
renamed response field; (d) a new critical checkout step; (e) a util that
formats a date. For each, state the layer, the marker, and which CI lane it runs
in — and justify with "the fastest test that gives the confidence."

### 8. Diagnose and fix: the CI that lies green

This pipeline is green on every PR, the team trusts it, yet broken code reaches
production regularly. Find every strategic flaw and fix the pipeline + policy.

```yaml
jobs:
  test:
    steps:
      - run: pip install -r requirements.txt        # unpinned versions
      - run: pytest --reruns 3 -q                    # blanket 3x retry on ALL tests
      # no ruff, no mypy
      # no branch protection: merges allowed while red
      # runs unit + integration + e2e together, serially, ~19 min
```

<details>
<summary>Solution</summary>

Strategic flaws: **(1) Blanket `--reruns 3`** turns every flake green — including
genuine intermittent bugs — so the suite has stopped detecting exactly what it
exists to catch; broken-but-flaky code passes. **(2) No branch protection**
means red never actually blocks a merge, so "green CI" is advisory, not enforced
— broken code merges freely. **(3) No static analysis** (ruff/mypy), so the
whole class of type holes and lint-catchable bugs from module 06 sails through.
**(4) Unpinned dependencies** make the environment non-reproducible: it passes
today and breaks tomorrow when a transitive dep changes, and "works on CI" isn't
stable. **(5) One serial 19-minute job** mixing e2e in the gating path makes PRs
slow and lets flaky e2e block unrelated fixes, pushing people to batch/bypass.

Fixes: remove the blanket retry (quarantine specific flakes and fix root causes
instead); pin dependencies (lockfile); add `ruff check` + `mypy` as gating
steps; enable branch protection so red blocks merge; and split into a fast gating
lane (`-m "not e2e" -n auto`, cheap checks first) plus a non-gating e2e lane on
main.

```yaml
jobs:
  fast:                                   # gates the merge (branch protection ON)
    steps:
      - run: pip install -e ".[dev]"      # from a lockfile / pinned
      - run: ruff check . && mypy app/
      - run: pytest -m "not e2e and not flaky_quarantine" -n auto --maxfail=1
  e2e:
    if: github.ref == 'refs/heads/main'
    steps: [ { run: pytest -m e2e } ]     # informs, does not gate PRs
```

The theme: a pipeline is only as honest as its weakest policy — retries and
missing branch protection quietly convert "green" into "meaningless."

</details>

## Independent challenge

No code given. Take the full test suite you assembled across this track for the
service from **05-e2e-and-contract-testing** — unit, integration, contract, one
e2e journey — plus the `ruff`/`mypy` setup from **06-code-quality-and-static-
analysis**, and design its complete CI + strategy. Build a two-lane pipeline: a
**fast gating lane** (cheap static checks first, then unit + integration in
parallel, marker-scoped to exclude e2e and any quarantine) that branch
protection requires green before merge, and a **non-gating lane** (e2e +
contract fuzz) that runs on main/nightly. Then do the strategy work: run
`--durations` to find your slowest tests and place each in the right lane;
deliberately introduce one flaky test, triage it through the four-cause
checklist to a root-cause fix (no blanket retries); and write a one-page test
strategy stating, for your service, where each *kind* of new test should live
and how you'll watch the pyramid's shape (runtime + flake trend) over time. The
deliverable is an enforced, correctly-staged pipeline plus a written strategy
that would keep the suite healthy as the service grows.

<details>
<summary>Hint</summary>

The markers you added back in modules 03 and 05 (`integration`, `e2e`, and a
`flaky_quarantine`) are the whole mechanism — the fast lane is just `pytest -m
"not e2e and not flaky_quarantine"` and the slow lane is `-m e2e`; you don't need
new machinery, just the right selection per job. When you triage the flake,
resist reaching for `--reruns`; walk the four causes (timing → wait-for-
condition, shared state → isolate, nondeterminism → inject/control, external →
fake at the edge) and fix the actual one, because a blanket retry would also hide
a real bug. For the strategy page, anchor every "where does it go" answer to the
one question that keeps the pyramid balanced: *what's the fastest test that gives
me this confidence?*

</details>

## Common mistakes & troubleshooting

- **CI that doesn't actually gate.** Green without branch protection is advisory;
  broken code still merges. Require the fast lane to pass before merge.
- **One giant serial job.** Mixing e2e into the pre-merge path makes PRs slow and
  lets flaky tip-tests block unrelated fixes. Split fast (gating) and slow
  (informing) lanes.
- **Cheap checks last.** Waiting for a ten-minute suite to learn about a lint
  error wastes time. Fail fast: lint → types → unit → integration.
- **Blanket test retries.** `--reruns` on everything turns real intermittent
  bugs green and disables your detector. Quarantine specific flakes and fix root
  causes.
- **Ignoring flakes ("just re-run").** Trains the team to ignore red, so real
  failures get merged. Triage systematically; a 5%-flaky test is a defect.
- **Deleting/`skip`ping a flake and forgetting it.** Removes the coverage
  silently. Quarantine *visibly*, tracked to a fix, then de-quarantine.
- **Unpinned dependencies in CI.** Non-reproducible builds pass today, break
  tomorrow. Pin/lock dependencies.
- **Letting the cone grow "to be safe."** Every top-heavy addition slows and
  destabilizes the suite. Always ask for the fastest layer that gives the
  confidence, and re-balance when runtime/flake trends drift.

## Checkpoint quiz

Write down your answer to each question before expanding it — checking without attempting first is the single easiest way to fool yourself into thinking you've learned this.

1. What invariant does CI plus branch protection actually enforce, and why is
   "green CI" without branch protection close to meaningless?
2. How should you stage the pipeline relative to your pyramid layers, and why
   don't the e2e tests gate every PR?
3. Why is "fail fast, cheap checks first" the right ordering within a stage?
4. Define a flaky test and explain why blanket automatic retries are the wrong
   response to flakiness.
5. Name the four usual root causes of flaky tests and the corresponding fix for
   each (referencing the module that covered it).
6. When deciding where a new test belongs, what's the single guiding question,
   and what shape drift are you guarding against?
7. What three forces do you balance for each candidate test, and what's the
   recurring decision that keeps the pyramid healthy?

<details>
<summary>Answers</summary>

1. That code failing the required checks cannot reach main — every change is
   verified before merge. Without branch protection, CI can be red and merges
   still go through, so "green" is advisory only; nothing actually stops broken
   code from landing.
2. Cheapest/most-frequent first: static analysis + unit (+ integration if it
   fits) run on every push and *gate* the merge; e2e (and long contract/fuzz
   runs) run on merge-to-main/nightly and *inform*. E2e doesn't gate every PR
   because it's slow and flake-prone — gating on it makes PRs slow and lets
   tip-test flakiness block unrelated work.
3. Because you want the quickest possible signal: a lint error or missing import
   should fail in seconds, not after waiting behind a ten-minute test run. Cheap
   checks first shortens feedback and saves compute.
4. A test that passes/fails nondeterministically without a code change. Blanket
   retries are wrong because they turn *both* harmless flakes and genuine
   intermittent bugs green — disabling the very detector the suite is for — and
   they train the team to trust re-runs.
5. Timing (fixed sleeps / asserting before async results → wait for a condition,
   module 05); shared state/order dependence (colliding DB rows/globals →
   isolate state, module 03); nondeterminism (clock/random/uuid/ordering →
   inject and control, module 04); external dependencies (live third parties →
   fake at the edge, module 05).
6. "What's the fastest/lowest-layer test that gives me the confidence I need?"
   Default to that layer. You're guarding against the ice-cream cone — the suite
   drifting top-heavy (slow, flaky) as people add high-level tests "to be safe."
7. Confidence (does it catch a real, costly bug), speed (runtime × frequency),
   and stability (flake likelihood). The recurring decision is *push down*: catch
   each bug at the lowest layer that can, reserving higher layers only for bugs
   solely they can catch.

</details>

## Cumulative review

Closed-book. Don't reopen modules 00–07 while attempting these — the point is to
find out what actually stuck.

1. For each test below, name its pyramid layer, the double(s) (if any) it should
   use, and the CI lane it belongs in: (a) `slugify("A B") == "a-b"`; (b) a
   service charges a payment gateway exactly once on checkout; (c) `POST /orders`
   through `TestClient` against a real Postgres returns `201` and persists; (d)
   schemathesis conformance over `/openapi.json`; (e) a real signup→purchase
   journey against the running stack.
2. You're building the discount rule from (a) with TDD. Give the red-green-
   refactor beats in words, say what "simplest thing that passes" looks like on
   the first green, and say where module 01's parametrize and a fixture enter.
3. A unit suite is 100% covered and green; production breaks on a bad SQL join
   *and* on an `AttributeError` from a `None`. Explain, using three separate
   ideas from this track (coverage-vs-verification, unit-vs-integration, and
   static analysis), how all three facts coexist, and give the specific fix each
   idea prescribes.
4. Give the correct status code and the layer you'd test it at for: an
   aggregated invalid body; a missing id; a duplicate unique key; a declined
   card. Then explain why none of these should be an e2e test.
5. A test passes when the suite runs whole but fails alone (and vice-versa).
   Give the two most likely root causes (one DB, one FastAPI wiring), the fix
   for each, and which module covered it.
6. Your CI is green on every PR yet broken code reaches prod. List four distinct
   policy/pipeline flaws that produce "CI that lies green" and the fix for each.
7. A teammate wants to add 30 e2e tests for business-rule permutations "to be
   safe," and to set `--reruns 3` because a few flake. Make the case against
   both, and say precisely where those 30 behaviors and those flakes should go
   instead.
8. Define, in one sentence each, the distinct job of: a stub, a fake, a mock, a
   dependency override, a contract test, and a complexity metric — and name a
   situation where each is the *right* tool.

<details>
<summary>Answers</summary>

1. (a) Unit, no doubles, fast gating lane. (b) Unit, a mock-with-`spec` (the
   exactly-once interaction is the contract) or a fake gateway, fast gating lane.
   (c) Integration, real Postgres (testcontainers) + rollback isolation, gating
   lane (if within budget). (d) Contract test, in-process against the app spec,
   gating lane (cheap) or nightly if long. (e) E2e, real stack (fake externals at
   the edge), non-gating main/nightly lane.
2. Red: write `assert slugify("A B") == "a-b"` first, watch it fail (missing
   function). Green: simplest thing — `return text.lower().replace(" ", "-")`.
   Add a punctuation case (red), generalize with a regex (green). Refactor:
   suite green, collapse cases into a `@pytest.mark.parametrize` table and, if
   setup repeats, extract a fixture — behavior unchanged throughout.
3. Coverage measures execution not assertions, so a fully-covered suite can
   verify little → fix: add meaningful assertions, don't chase the number.
   Unit-with-fakes can't contain a SQL bug → fix: add integration tests against
   real Postgres. Neither tests nor coverage catch a type/`None` hole on an
   untested path → fix: run mypy, which flags the possibly-`None` access
   statically. All three coexist because each net catches different fish.
4. Invalid body → `422`, integration (real validation wiring) or unit for the
   rule. Missing id → `404`, integration. Duplicate key → `409`, integration
   (real constraint). Declined card → `402`, integration with a fake gateway (or
   unit on the service). None should be e2e because they're logic/wiring a faster
   layer verifies deterministically; e2e is for critical deployed journeys, and
   testing rule permutations there builds a slow, flaky cone.
5. DB cause: no per-test isolation — an earlier test committed state the other
   depends on (or global counts); fix with rollback/truncate teardown and
   asserting on own data (module 03). Wiring cause: a leaked/missing
   `dependency_overrides` (e.g. `get_db` not set or not cleared); fix by setting
   it in a fixture and clearing it in teardown (modules 03/04).
6. (i) No branch protection → red doesn't block; enable it. (ii) Blanket
   `--reruns` → hides real intermittent bugs; quarantine specific flakes, fix
   root cause. (iii) No ruff/mypy → type/lint bugs slip through; add them as
   gating steps. (iv) Unpinned deps → non-reproducible builds; pin/lock.
   (Also acceptable: e2e mixed into the gating serial job.)
7. Against 30 e2e tests: each is slow and flake-prone, so they build an
   ice-cream cone that's slow and untrustworthy, and business rules don't need
   the real stack — put them in unit tests (pure rules) or integration tests
   (`TestClient` + fake gateway + isolated DB), keeping only one/two critical
   journeys at e2e. Against `--reruns 3`: it turns genuine intermittent bugs
   green and disables detection — instead triage each flake to its root cause
   (timing/state/nondeterminism/external) and fix it, quarantining visibly
   meanwhile.
8. Stub: returns canned values to feed the code under test — right when you need
   to supply an input (canned stock level). Fake: a working lightweight
   implementation — right when a collaborator must behave across calls (in-memory
   repo). Mock: a double you assert interactions on — right when the side effect
   *is* the behavior (charged exactly once). Dependency override: swaps a
   `Depends` provider in tests — right for pointing a route at a test DB or fake
   service. Contract test: verifies the running API matches its OpenAPI spec —
   right for catching interface drift that breaks consumers. Complexity metric:
   quantifies paths through a function — right for finding untestable/
   unmaintainable code before it becomes a monster.

</details>

## Next

[08-capstone-project](../08-capstone-project/README.md) — you've learned to test
at every layer, drive features with TDD, mock at the boundaries, contract- and
e2e-test the whole system, enforce static quality, and run it all in CI. The
capstone puts it together: take a real FastAPI service and bring it to genuine
test-pyramid coverage — unit tests with mocks, integration tests against a test
database, one e2e/contract test, and lint + type checks passing — with no
solution to peek at.
