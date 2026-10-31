# Module 08: Capstone Project

## Why this matters

Every module so far handed you scaffolding — a code block to paste, an expected
output to check against, a hint when you got stuck. This one doesn't. The
capstone is the integration test for the whole track, and the only way to find
out whether the knowledge actually transferred is to take a real service with
*no tests* and bring it to genuine test-pyramid coverage from scratch, with no
solution to peek at. The guided exercises built *recognition*: you could follow
along and it made sense. Real competence is *recall plus judgment* — sitting in
front of an untested `main.py` and knowing, without prompting, which behaviors
belong in fast unit tests with a fake repository, which need a real Postgres
behind `TestClient`, where a mock guards a side effect versus where it would be
over-mocking, which single journey earns an e2e test, and that none of it counts
until `ruff`, `mypy`, and the whole suite go green in CI.

This is also the most realistic thing you'll do in the track, because *adding
tests to existing untested code* is the actual job far more often than writing
tests alongside greenfield code. It forces every skill at once: you'll feel
where the service resists testing (a service that imports the DB directly, a
route that calls Stripe inline) and have to *refactor for testability* — the
design pressure from modules 01 and 04 made real. You'll decide the shape of the
pyramid deliberately (module 07) instead of accreting one. If a piece feels
shaky when you try to place it, that's the signal to go back to that module's
exercises and redo one from memory. Struggling here, before you look anything
up, is the entire point.

## The project

Take an **existing small FastAPI service from an earlier track** — the layered
task/order API from **02-api-layer-and-request-handling** is the intended
target, but any earlier service with a database and at least one external-ish
dependency works — that currently has little or no test coverage, and bring it
to real test-pyramid coverage plus a passing quality gate. Start from the
existing code; your job is to add tests (and refactor for testability where the
code fights you), not to rebuild the app. No solution code is given.

```
   BEFORE                              AFTER (the capstone deliverable)
   untested main.py                            /\
   - routes hit the DB inline       ===>      /e2e\    1 journey OR contract test
   - Stripe called inline                    /------\
   - no ruff / mypy / CI                     / integ \  real Postgres via TestClient
                                            /  ration \ + overrides + isolation
   refactor for testability                /----------\
   push externals behind interfaces       /   unit     \ fakes, spec'd mocks,
   + ruff + mypy + pre-commit + CI       /--------------\ parametrized branches
                                        (fast gating lane | non-gating tip)
```

Your deliverable must include every layer of the pyramid, real static analysis,
and CI wiring:

**Unit tests (the base — with mocks/fakes)**
- Unit-test the service/business-logic layer with an **in-memory fake
  repository**, covering every branch: happy paths, each validation/domain
  rule, and boundary cases — using **parametrization** where inputs vary.
- Introduce (or use an existing) **external dependency** — a payment gateway,
  an email sender, or the clock — behind an injected interface, and test it with
  a **fake** for state verification plus a **mock-with-`spec`** exactly where an
  interaction *is* the contract (e.g. "charged once," "no receipt on failure").
- No mocking of the code's own internal logic; assert on outcomes, not on a wall
  of `assert_called`.

**Integration tests (the middle — against a real test DB)**
- Test the data/repository layer and the routes against a **real Postgres**
  (testcontainers or an equivalent disposable DB — *not* SQLite), through
  `TestClient`/`httpx`.
- Per-test **isolation** (transaction rollback or truncate) so tests are
  order-independent and leave the DB clean; wire routes to the test DB via
  **dependency overrides** and clear them in teardown.
- Cover the real seams: status codes, `Location`/headers, aggregated `422`,
  `404`, `409`, pagination cap, whitelisted sort rejecting unknown fields.

**One e2e or contract test (the tip)**
- Either one **e2e journey** against the actually-running stack (real process +
  real Postgres, readiness-polled, never `sleep`), *or* a **schemathesis
  contract test** verifying the running API conforms to its OpenAPI spec — one
  of these, correctly shaped, not a cone of them.

**Static quality + CI**
- `ruff check` (lint + format) and `mypy` pass clean; fix real findings
  (treat possibly-`None` as a bug to handle, not to ignore); one module brought
  to `--strict`-clean.
- A **CI pipeline** (GitHub Actions or equivalent) that runs cheap checks first,
  then a **fast gating lane** (`-m "not e2e"`) and a **non-gating lane** for the
  e2e/contract test; markers split the layers.
- A `.pre-commit-config.yaml` running ruff + mypy locally.

### Acceptance checklist

Tick every box. If you can't, you've found a module to revisit.

- [ ] The service layer is unit-tested with a **fake repository**, every branch
      covered, with visible Arrange–Act–Assert and one behavior per test.
- [ ] Varying-input cases use `@pytest.mark.parametrize`, and repeated setup is
      extracted into **fixtures**; each test is independent (passes alone and in
      the suite, in any order).
- [ ] An external dependency is injected behind an interface; a **fake** covers
      the state cases and a **`spec`'d mock** covers exactly one true-interaction
      case (e.g. exactly-once charge). A **negative side-effect** test exists
      (e.g. no email on a declined charge).
- [ ] No test mocks the service's own internal methods; assertions are on
      outcomes/state, not solely on `assert_called`.
- [ ] Integration tests run against a **real Postgres** (not SQLite) with
      **per-test isolation**; routes are wired to it via dependency overrides
      that are cleared in teardown.
- [ ] Integration tests cover create→`201`+`Location`, read→`200`/`404`,
      duplicate→`409`, invalid body→aggregated `422`, list pagination cap, and
      an unknown sort field→`400`.
- [ ] Exactly one correctly-shaped tip test exists: either one readiness-polled
      **e2e journey** (no fixed `sleep`) or a **schemathesis** conformance test
      that's green (drift fixed).
- [ ] `ruff check .` and `mypy app/` pass clean; at least one module is
      `--strict`-clean; no lint/type finding was silenced without a documented
      reason.
- [ ] A complexity ceiling is enforced and no function exceeds it (refactored
      under a green suite if needed).
- [ ] CI runs cheap checks first, gates the merge on the **fast lane**
      (`-m "not e2e"`), and runs the e2e/contract test in a **non-gating** lane;
      `.pre-commit-config.yaml` runs ruff + mypy locally.
- [ ] `pytest --durations` shows your slow tests are only the integration/e2e
      ones; the base is fast. You can state, for each test, why it lives at its
      layer.
- [ ] Coverage was used to *find* untested risky code (not to hit a mandated
      number), and every test has a meaningful assertion.

### Suggested build order

1. **Inventory the behaviors** and place each on the pyramid *before* writing a
   test — business rules → unit, seams → integration, one journey/contract →
   tip. This is the module-07 strategy step, done up front.
2. **Refactor for testability** only as far as the tests demand: push any inline
   external call (DB, payment) behind an injected interface (modules 04, 06) so
   it's fakeable.
3. Build the **unit base** first (fastest feedback): fakes, fixtures,
   parametrized branches, the mock-vs-fake decisions.
4. Stand up the **real test DB** and add **integration tests** through
   `TestClient` with isolation and overrides.
5. Add the **one tip test** (e2e journey or schemathesis contract).
6. Turn on **ruff + mypy**, fix findings, enforce a complexity ceiling, wire
   **pre-commit**.
7. Wire **CI** with fast/slow lanes and branch protection; confirm red can't
   merge.
8. Run the acceptance checklist as an adversary trying to break each box — run
   the suite reversed/parallel to prove isolation, and check `--durations` to
   prove the shape.

### Hints (design nudges, not solutions)

<details>
<summary>Hint: deciding a test's layer (the one question)</summary>

For every behavior, ask "what's the fastest test that gives me this
confidence?" A pure rule (a discount, a validation) → unit with a fake. Anything
that could break in the *seam* — SQL/ORM mapping, route wiring, serialization,
a real constraint → integration against real Postgres. Interface drift → a
contract test. Only a critical, deploy-spanning journey earns e2e — and you want
just one. If you're tempted to test a business rule end-to-end "to be safe,"
that's the ice-cream cone forming; push it down.

</details>

<details>
<summary>Hint: fake vs. mock without over-mocking</summary>

Default to a **fake** and assert on outcomes/state (the email was queued to this
address, the order persisted) — it survives refactors. Reach for a
**mock-with-`spec`** only when the interaction itself is the contract and there's
no observable state: "charged exactly once," "not charged twice," "no receipt on
failure." If a test needs five mocks to run one method, that's a design signal
(too many dependencies), not a cue to write five mocks. Never mock the service's
own internal methods — that tests nothing.

</details>

<details>
<summary>Hint: integration isolation that actually holds</summary>

Scope the container/engine `session` (starting Postgres per test is brutally
slow) and layer a `function`-scoped transaction-rollback session on top. The
subtle bug: your `get_db` override must yield the *same* session your fixture
rolls back — otherwise the route writes in a different transaction than the one
you clean up and rows leak between tests. Assert on your own created rows, never
on global counts, and prove isolation by running the suite reversed and in
parallel and getting the same result.

</details>

<details>
<summary>Hint: keeping the tip cheap and CI honest</summary>

Do the schemathesis contract test first even if you also add an e2e journey — it
covers every endpoint for almost no code and often surfaces the drift an e2e
test would otherwise get blamed for. For the e2e journey, a readiness *poll* on
`/health` (bounded by a timeout) and per-run unique data are what keep it from
flaking — never a fixed `sleep`, never blanket `--reruns` in CI. Gate the merge
on the fast lane only; let the tip run non-gating so a flaky journey never
blocks an honest unit-only fix.

</details>

## Further reading & sources

- [pytest documentation](https://docs.pytest.org/en/stable/) - The runner, fixtures, and parametrization underpinning every layer of the capstone suite.
- [FastAPI — Testing & database dependency overrides](https://fastapi.tiangolo.com/advanced/testing-database/) - Wiring routes to a real test DB via `dependency_overrides`, as the integration layer requires.
- [testcontainers-python documentation](https://testcontainers-python.readthedocs.io/en/latest/) - Standing up the disposable real Postgres the integration tests must run against.
- [Schemathesis documentation](https://schemathesis.readthedocs.io/en/stable/) - The contract-test option for the pyramid's tip, verifying the API against its OpenAPI spec.
- [Ruff](https://docs.astral.sh/ruff/) and [mypy](https://mypy.readthedocs.io/en/stable/) documentation - The lint/format and type-check tools the quality gate must pass clean.
- [GitHub Actions — Building and testing Python](https://docs.github.com/en/actions/automating-builds-and-tests/building-and-testing-python) - Wiring the fast-gating and non-gating CI lanes that finish the capstone.

## Next

You've finished the testing and code-quality track — you can now bring an
untested service to a balanced, trustworthy test pyramid with static quality
gates and enforce it all in CI. Next is
[../../13-devops-for-backend-engineers/README.md](../../13-devops-for-backend-engineers/README.md),
which picks up exactly where this track's CI section stopped: it takes the
pipeline you sketched here and goes deep on CI/CD, containers, and deployment
strategies — connecting the tests and quality gates you just built to the full
path that gets code safely to production.
