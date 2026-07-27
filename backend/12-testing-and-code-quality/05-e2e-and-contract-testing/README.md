# Module 05: E2E and Contract Testing

## Why this matters

Every test you've written so far has, deliberately, *not* run the whole system.
Unit tests replaced collaborators with doubles; integration tests used a real
DB but through the in-process `TestClient` with a faked payment gateway. That's
by design — it's what made them fast and precise. But it leaves one question
unanswered: **does the fully-assembled, actually-running system work?** Do the
real containers start, does the real migration apply, does the app connect to
the real database over a real socket, does a request that crosses process
boundaries come back correct? Those failures live *between* the components, in
the deployment and wiring that in-process tests skip. **End-to-end (e2e) tests**
drive the whole running system from the outside, as a real client, to answer
exactly that — and they're the narrow tip of the pyramid precisely because they
are slow, expensive, and the most prone to flakiness.

There's a second, cheaper kind of "does it really work" test that's easy to
overlook: **contract testing**. Your API publishes an OpenAPI spec (track 02,
module 09). Clients — a frontend, a mobile app, another service — build against
that spec. If your implementation drifts from the spec (a field renamed, a
status code changed, a nullable that isn't), you break every consumer *silently*
because nothing checks that the code still matches the contract. Tools like
**schemathesis** read your OpenAPI spec and generate hundreds of requests to
verify the running API actually conforms — catching drift and whole classes of
edge-case bugs for almost no test-writing effort. This module covers the e2e
strategy (and the discipline to keep it a *tip*, not a cone), contract testing
as a high-leverage complement, and the honest cost/benefit calculus of when an
e2e test earns its keep.

## Concepts

### What e2e actually means, and what it uniquely proves

An **end-to-end test** exercises the system the way a real user or client does:
against the *actually deployed and running* application — real process, real
web server, real database, real (or realistically-faked-at-the-edge) external
services — driving it only through its public interface (HTTP for an API, the
browser for a web app). No in-process shortcuts, no `TestClient`, no dependency
overrides reaching inside. It answers questions no lower layer can:

- **Does it boot and wire up for real?** Config loads, migrations run, the app
  connects to the DB and cache over real sockets, health checks pass.
- **Does it work across process/network boundaries?** Serialization,
  timeouts, connection pools, and the reverse proxy all behave together.
- **Does a whole user journey hold?** Sign up → log in → create a resource →
  see it in a list — the *sequence*, with real state persisting between steps.

That's genuine, high-value confidence. The catch is that an e2e test can fail
for a hundred unrelated reasons (a slow container, a network blip, a race in
setup), gives vague failures ("something in the stack broke"), and runs in
seconds-to-minutes, not milliseconds. So it buys *systemic* confidence at a high
price — which dictates how many you should have.

### Keeping e2e a tip, not a cone: how many and which journeys

The cardinal rule: **e2e tests cover a few critical happy-path journeys, not
business-rule permutations.** You do *not* test "declined card returns 402,"
"empty cart is rejected," "unknown discount code errors" at the e2e level — each
of those is a fast unit or integration test. You reserve e2e for a handful of
**smoke-test-grade journeys** that prove the assembled system is alive and the
most important flows work end to end: the signup-to-first-value path, the core
purchase flow, maybe auth. A useful mental model is the **"critical path" test**:
if this one journey is broken, the product is down — so test *that* end to end,
and push everything else down the pyramid.

Why so strict? Because e2e cost compounds: every journey you add is another slow,
flaky test that someone has to keep green. Ten e2e tests is often plenty; a
hundred is an ice-cream cone that takes twenty minutes to run and fails randomly
twice a week, and the team learns to click "re-run" instead of reading it — the
inverted pyramid failure mode from module 00, now with real infrastructure
attached.

### Flakiness: why e2e is prone to it and how to fight it

A **flaky test** passes and fails nondeterministically without the code
changing. E2e tests are the most flake-prone layer because they depend on the
most moving, timing-sensitive parts: a container that isn't ready yet, an async
write that hasn't landed when you assert, a fixed `sleep` that's sometimes too
short, a shared environment another test is mutating, an external sandbox
hiccup. The disciplines that keep e2e usable:

- **Wait for conditions, never sleep for durations.** Poll a health endpoint /
  readiness / the actual state until ready (with a timeout), instead of
  `sleep(2)` and hoping. Fixed sleeps are the #1 cause of e2e flake.
- **Isolate state per test/run.** A fresh database (testcontainers again) and
  unique data per test, so tests don't collide. Shared mutable environments
  breed order-dependence.
- **Control the truly-external.** Point at vendor *sandboxes* or stand up fakes
  at the network edge (a mock server) so a third party being slow doesn't fail
  your build.
- **Quarantine, don't ignore, a flaky test.** When one flakes, move it to a
  quarantined lane and *fix the root cause* — never sprinkle blanket retries
  that hide real intermittent bugs. (Module 07 covers triage in depth.)

### Contract testing: verifying the API matches its spec

A **contract** is the agreed shape of the interface between a provider (your
API) and its consumers: the paths, methods, request/response schemas, and status
codes — exactly what your OpenAPI document describes. **Contract testing**
verifies that the *running implementation* still honors that contract, so
provider and consumers don't drift apart. Two flavors:

- **Spec-conformance (schema-based) testing** — take your OpenAPI spec as the
  source of truth and check that real responses conform: right status codes,
  bodies matching the declared schema, declared response present. This is the
  cheap, high-leverage one for a single API, and it's what schemathesis
  automates.
- **Consumer-driven contracts** (e.g. Pact) — consumers declare the exact
  requests/responses they depend on; the provider's build verifies it still
  satisfies every consumer's expectations. Heavier; worth it across many
  services owned by different teams.

Contract testing sits *beside* the pyramid rather than inside it: it's cheaper
than e2e (often runs in-process against `TestClient`) but catches a specific,
high-impact bug class — interface drift — that ordinary tests miss because your
own tests and your own code can both be wrong in the same way while the *spec*
says something else.

### Property-based / spec-driven testing with schemathesis

**schemathesis** reads your OpenAPI spec and *generates* test cases from it —
hundreds of requests with valid, boundary, and malformed inputs derived from
your declared schemas — then asserts the responses conform to the spec and that
the server doesn't 500. This is **property-based testing** applied to your API:
instead of you enumerating examples, the tool explores the input space and
hunts for inputs that violate a general property ("no input in the declared
schema should cause an undeclared response or a crash").

```python
import schemathesis

schema = schemathesis.from_asgi("/openapi.json", app)   # in-process, fast

@schema.parametrize()          # generates many cases per operation
def test_api_conforms_to_spec(case):
    case.call_and_validate()   # sends the request, validates response vs spec
```

For almost no code you get: every endpoint hit with generated inputs,
conformance checked against your own spec, and unhandled `500`s surfaced. It
routinely finds edge cases you'd never write by hand (a huge integer, a null in
an optional field, an empty string where you assumed non-empty). The lesson it
teaches: **an accurate spec is testable for free** — which is a strong reason to
keep the OpenAPI document truthful (track 02, module 09), because here it becomes
an executable oracle.

### The cost/benefit calculus: when e2e is worth it

Every e2e test is a standing liability (slow, flaky, maintenance) that you pay
for continuously, in exchange for systemic confidence you can't get elsewhere.
So the decision is explicitly economic:

**Worth an e2e test:** the critical revenue/onboarding path where a break is
catastrophic; a flow that genuinely spans real deployment concerns (migrations,
real auth handshake, cross-service calls) that lower layers can't simulate; a
smoke test that proves a fresh deploy is actually alive before traffic hits it.

**Not worth an e2e test:** any behavior a unit or integration test can verify
(all business-rule permutations, validation cases, error mappings); anything you
find yourself tempted to add "just to be safe" — that instinct is how the cone
grows. The heuristic: **for each candidate e2e test, ask "could a faster test
give me the same confidence?" If yes, push it down.** And prefer *contract
tests* over e2e whenever the risk is interface drift rather than deployment
wiring — you get most of the confidence at a fraction of the cost and flake.
This economic framing is the throughline into module 07's whole-suite strategy.

## Command reference

| Tool / construct | Purpose |
|---|---|
| `pip install schemathesis` | Spec-driven / property-based API testing |
| `schemathesis.from_asgi("/openapi.json", app)` | Load spec in-process (fast) |
| `schemathesis.from_uri("http://host/openapi.json")` | Load spec from a running server (true e2e) |
| `st run http://host/openapi.json` | CLI: fuzz a running API against its spec |
| `@schema.parametrize()` / `case.call_and_validate()` | Generate + validate cases |
| `httpx.Client(base_url=...)` | Real HTTP client for e2e against a running app |
| `PostgresContainer` / `DockerCompose` | Bring up the real system for e2e |
| poll a `/health` endpoint until ready | Replace `sleep` with a readiness wait |
| `@pytest.mark.e2e` | Mark slow full-system tests to run selectively |
| `pytest -m "not e2e"` | Skip e2e for the fast inner loop |
| Pact / `pact-python` | Consumer-driven contract testing across services |

A true e2e test against a running app (real socket, real server), with a
readiness wait instead of a sleep:

```python
import httpx, time

def wait_until_ready(base_url, timeout=30):
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            if httpx.get(f"{base_url}/health", timeout=2).status_code == 200:
                return
        except httpx.TransportError:
            pass
        time.sleep(0.25)               # short poll interval, bounded by deadline
    raise TimeoutError("app never became ready")

@pytest.mark.e2e
def test_signup_to_first_task_journey(running_app):     # fixture boots the stack
    base = running_app.base_url
    wait_until_ready(base)
    with httpx.Client(base_url=base) as c:
        token = c.post("/v1/signup", json={"email": "a@b.c", "password": "pw123456"}).json()["token"]
        auth = {"Authorization": f"Bearer {token}"}
        created = c.post("/v1/tasks", json={"title": "first"}, headers=auth)
        assert created.status_code == 201
        listed = c.get("/v1/tasks", headers=auth)
        assert any(t["title"] == "first" for t in listed.json()["data"])
```

Contract testing with schemathesis, in-process (cheap) and against a server
(e2e):

```python
# cheap: conformance without deploying anything
schema = schemathesis.from_asgi("/openapi.json", app)

@schema.parametrize()
def test_conforms_to_spec(case):
    case.call_and_validate()          # generated inputs, response validated vs spec
```

```bash
# e2e flavor: fuzz a really-running instance from the CLI
st run --checks all http://localhost:8000/openapi.json
```

## Hands-on exercises

Work in `testing-lab/`. You'll need Docker for the full-stack e2e exercises.
Reuse the FastAPI service and its OpenAPI spec from earlier tracks.

### 1. Contract-test your spec in-process (cheapest, do this first)

Wire schemathesis with `from_asgi("/openapi.json", app)` and a
`@schema.parametrize()` test calling `case.call_and_validate()`. Run it. Fix any
conformance failure it finds (a response your spec doesn't declare, a `500` on a
generated input). Note how many cases it generated for near-zero code.

### 2. Make the spec lie, watch contract testing catch it

Change one endpoint's response model so the *code* returns a field the *spec*
doesn't declare (or a wrong status code) without updating the OpenAPI metadata.
Re-run schemathesis and confirm it flags the drift. This is the exact silent-
break-a-client bug contract testing exists to catch.

### 3. Stand up the real system for e2e

Write a `running_app` fixture that brings up the app + a real Postgres (via
testcontainers or docker-compose) as actual processes and exposes a `base_url`.
Add a `wait_until_ready` that polls `/health` — no `sleep`. Confirm the fixture
tears the stack down afterward.

### 4. Write one critical-path journey

Write a single `@pytest.mark.e2e` test for the most important journey (e.g.
signup → auth → create → list) using a real `httpx.Client` over the socket.
Assert the *sequence* works with state persisting between steps. Keep it to one
journey.

### 5. Decide what belongs at e2e (and prove most doesn't)

List five behaviors of your API (a happy path, a validation error, a declined
card, an unknown-id 404, a pagination cap). For each, mark e2e / integration /
unit and justify. Then confirm your suite has exactly *one or two* e2e tests and
everything else lives lower. Expected: only the happy-path journey is e2e.

### 6. Induce and then kill a flake

Deliberately write a bad e2e assertion that reads state immediately after an
async write (no wait), and run it several times to see it flake. Then fix it by
polling for the expected state (with a timeout) instead of asserting
immediately. Write one sentence on why the fix is a "wait for condition," not a
"sleep longer."

### 7. Split the lanes for CI

Mark tests `unit` / `integration` / `e2e` and confirm three commands:
`pytest -m "not e2e and not integration"` (fast, every save), `pytest -m
integration`, and `pytest -m e2e`. This is the layering CI will use in module 07
and track 13. Note the rough runtime of each lane.

### 8. Diagnose and fix: an e2e suite that's really a cone

A team's e2e suite has 60 tests, takes 18 minutes, and flakes ~5% of runs. A
sample below. Identify why this is the wrong shape and what each test should
become.

```python
@pytest.mark.e2e
def test_declined_card_returns_402(running_app):
    wait_until_ready(running_app.base_url)
    ... # full stack up, real signup, real cart, real declined charge -> assert 402

@pytest.mark.e2e
def test_empty_cart_rejected(running_app): ...          # full stack for a validation rule

@pytest.mark.e2e
def test_discount_code_stacking_rejected(running_app): ...   # full stack for a business rule

@pytest.mark.e2e
def test_unknown_task_id_returns_404(running_app): ...  # full stack for a 404
# ...56 more like these, one per business rule/edge case
```

<details>
<summary>Solution</summary>

The shape is an **ice-cream cone**: business-rule permutations and simple error
cases are being tested end-to-end, so the suite is slow (18 min), flaky (60
chances to hit infrastructure timing), and gives vague failures. Each of these
behaviors is *logic*, not *deployment wiring* — none needs the real stack:

- `declined_card_returns_402`, `empty_cart_rejected`, `discount_stacking`,
  `unknown_id_404` → **integration tests** via `TestClient` with a fake payment
  gateway (module 04) and a rollback-isolated DB (module 03), or even **unit
  tests** for the pure rules. Milliseconds each, deterministic.
- Keep **one or two** genuine `@pytest.mark.e2e` journeys — e.g.
  signup→auth→create→list — that prove the assembled, deployed system actually
  boots and the critical path holds.

Result: the 60-test, 18-minute cone collapses to ~2 e2e smoke journeys plus a
fast integration/unit suite covering every rule. Same confidence, a fraction of
the time and flake. The rule that got violated: *for each e2e candidate, ask
whether a faster test gives the same confidence — here, for 58 of them, it does.*

</details>

## Independent challenge

No code given. Take the FastAPI service you built integration tests for in
**03-integration-testing** and add the top of its pyramid. First, bolt on
**contract testing**: point schemathesis at the app's `/openapi.json` and get a
`@schema.parametrize()` conformance test green, fixing any drift or unhandled
`500` it finds — and confirm the accuracy work you did on the OpenAPI spec in
**02-api-layer-and-request-handling (module 09, OpenAPI standards)** is what
makes this possible. Then add **exactly one** e2e journey: bring the real app +
real Postgres up as processes with a `running_app` fixture, wait on `/health`
(never sleep), and drive the single most critical journey over a real socket
with `httpx`. Finally, write a two-column justification: for five other
behaviors you *could* have tested e2e, state which faster layer you put each in
and why. The deliverable is a correctly-shaped tip: one e2e journey, broad
contract coverage, and a written argument for everything you *didn't* push to
e2e.

<details>
<summary>Hint</summary>

Do the contract test first — it's the cheapest and it exercises every endpoint
for almost no code, so it often surfaces the drift your e2e test would otherwise
get blamed for. For the single e2e journey, the two things that keep it from
flaking are a readiness *poll* on `/health` (bounded by a timeout, not a fixed
`sleep`) and per-run isolated data (unique email/titles), so re-running the
suite is deterministic. When justifying the five non-e2e behaviors, the tell is
"is the risk deployment/wiring or is it logic?" — logic goes to unit/integration
every time.

</details>

## Common mistakes & troubleshooting

- **E2e-testing business rules.** Validation, error mappings, and rule
  permutations at the full-stack level make a slow, flaky cone. Push them to
  unit/integration; keep e2e for critical journeys.
- **`sleep(n)` instead of waiting for a condition.** The #1 e2e flake source.
  Poll a readiness endpoint / the actual expected state with a timeout.
- **Shared mutable environment across e2e tests.** Causes order-dependence and
  collisions. Isolate state per run (fresh DB, unique data).
- **Blanket retries to "fix" flakes.** Hides real intermittent bugs. Quarantine
  the flaky test and fix the root cause instead.
- **Hitting live third-party services in e2e.** A vendor outage fails your
  build. Use their sandbox or a network-edge fake.
- **No contract test, trusting your own tests.** Your code and your tests can be
  wrong the same way while the spec disagrees. Add spec-conformance testing to
  catch interface drift.
- **A spec that doesn't match reality.** schemathesis is only as good as the
  OpenAPI document; an inaccurate spec makes the tool validate against a
  fiction. Keep the spec truthful (track 02, module 09).
- **Adding e2e "just to be safe."** Every one is standing cost. Add only when a
  faster test genuinely can't give the same confidence.

## Checkpoint quiz

Write down your answer to each question before expanding it — checking without attempting first is the single easiest way to fool yourself into thinking you've learned this.

1. What does an e2e test uniquely prove that an in-process integration test
   (with `TestClient`) cannot?
2. Why should e2e tests cover only a few critical journeys, and what shape do
   you get if you ignore that?
3. Why is the e2e layer the most flake-prone, and name the single biggest source
   of flake plus its fix.
4. What is contract testing, and what specific bug class does it catch that your
   ordinary unit/integration tests can miss?
5. How does schemathesis work, and why is keeping your OpenAPI spec accurate a
   prerequisite for it to be useful?
6. Give one behavior that clearly belongs at e2e and one that clearly doesn't,
   with the reasoning for each.
7. You're tempted to add an e2e test "just to be safe." What one question should
   you ask first, and what usually follows from the answer?

<details>
<summary>Answers</summary>

1. Whether the fully-assembled, actually-running system works across real
   process/network boundaries — real boot, config, migrations, DB connection
   over a socket, and a whole user journey with persisting state — none of which
   in-process `TestClient` (which shortcuts wiring and can override
   dependencies) exercises.
2. Because each e2e test is slow, flaky, and expensive to maintain, so many of
   them make the suite unusable; they should cover only critical happy-path
   journeys where a break means the product is down. Ignoring this yields an
   inverted pyramid / ice-cream cone: slow, flaky, vague-failing.
3. It depends on the most moving, timing-sensitive parts (container readiness,
   async writes, networks, shared state), so nondeterminism creeps in. Biggest
   source: fixed `sleep`s that are sometimes too short; fix by waiting for a
   condition/readiness with a timeout instead.
4. Verifying that the running implementation still honors the agreed interface
   (paths, schemas, status codes) described by the OpenAPI spec. It catches
   *interface drift* — the code silently diverging from the published contract —
   which your own tests can miss because your tests and code can be wrong the
   same way while the spec says otherwise.
5. It reads your OpenAPI spec and generates many requests (valid, boundary,
   malformed) per operation, then validates each response against the spec and
   flags undeclared responses/`500`s. It's only meaningful if the spec is
   accurate, because it validates responses *against the spec* — an inaccurate
   spec makes it check conformance to a fiction.
6. Belongs at e2e: the critical signup→auth→purchase journey — it spans real
   deployment/wiring and a break means the product is down. Doesn't: "declined
   card returns 402" or an unknown-id 404 — pure logic a fast integration/unit
   test verifies deterministically without the full stack.
7. Ask "could a faster test (unit/integration/contract) give me the same
   confidence?" Usually yes — the behavior is logic, not deployment wiring — so
   you push it down the pyramid instead of adding another slow, flaky e2e test.

</details>

## Next

[06-code-quality-and-static-analysis](../06-code-quality-and-static-analysis/README.md)
— you can now test behavior at every layer from unit to e2e. Next you'll measure
the *other* axis of software health that tests don't cover: code quality —
linting with ruff, type checking with mypy, complexity metrics, and pre-commit
hooks — and what "quality" really means beyond style.
