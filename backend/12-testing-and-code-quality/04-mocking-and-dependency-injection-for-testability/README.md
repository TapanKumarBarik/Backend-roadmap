# Module 04: Mocking and Dependency Injection for Testability

## Why this matters

In module 03 you swapped the *database* for an isolated test one using FastAPI's
dependency-override system. But a real service depends on more than a database:
it charges a card through Stripe, sends a receipt through SendGrid, reads the
clock, calls a shipping API. You cannot — and must not — hit a real payment
processor in your test suite. It's slow, it costs money, it's flaky when their
sandbox is down, and it might actually *charge someone*. The whole point of a
test is to be fast, free, deterministic, and safe to run a thousand times a day,
and every real external call breaks all four of those. **Mocking** is how you
replace those external collaborators with controllable stand-ins so you can test
*your* logic — "when the charge succeeds, do we send the receipt; when it's
declined, do we return `402` and *not* send one" — without touching anyone
else's system.

The danger is the opposite extreme. Mocking is seductive: it's easy to mock
*everything*, and a test where every collaborator is a mock stops testing your
code and starts testing your *mocks*. Such tests mirror the implementation
line-for-line, break on every refactor, and catch almost no real bugs — they're
the "tests that mirror the implementation" warned about back in module 02. This
module teaches both halves: the mechanics (FastAPI dependency overrides for
your own seams; `unittest.mock`/`pytest-mock` and fakes for external SDKs;
controlling time and randomness) *and* the judgment — mock at your
architectural boundaries, prefer fakes over mocks, verify interactions only when
the interaction *is* the behavior, and never mock what you don't own without a
thin wrapper.

## Concepts

### What to mock, and where — mock at the boundary

The single most important mocking decision is *where*. Mock at your
**architectural boundaries** — the seams where your code hands off to something
external, slow, nondeterministic, or with side effects: the payment gateway,
the email sender, the clock, an outbound HTTP call. Do **not** mock your own
internal business logic, value objects, or pure functions — those are the thing
under test, and replacing them with mocks means you test nothing.

The clean way to make a boundary mockable is the layering from track 02: your
service depends on an *interface* (`PaymentGateway`, `EmailSender`) that it
receives by injection, and the real implementation wraps the vendor SDK. Then a
test injects a fake or mock in its place. If you instead call `stripe.Charge.
create(...)` directly inside your service, the boundary is buried and you're
forced to patch deep inside a third-party library — brittle and painful. **Push
external calls to the edges behind small interfaces**, and mocking becomes clean
injection instead of invasive patching.

### Mocks vs. fakes for external services — prefer fakes

Recall the doubles taxonomy from module 00. For external services you'll mostly
choose between a **fake** (a working in-memory implementation of the interface)
and a **mock** (a double you assert interactions on). Reach for a **fake
first**:

```python
class FakeEmailSender:                     # a fake: it actually "works"
    def __init__(self): self.sent = []
    def send(self, to, subject, body):
        self.sent.append({"to": to, "subject": subject})   # records, no network

def test_receipt_is_emailed_on_success():
    emailer = FakeEmailSender()
    svc = CheckoutService(payments=FakeGateway(ok=True), emailer=emailer)
    svc.checkout(user, cart)
    assert emailer.sent == [{"to": user.email, "subject": "Your receipt"}]  # state
```

A fake lets you verify *state/outcome* ("an email to this address was queued"),
which is robust to refactors — you don't care *how* the code sent it, only that
it did. Use a **mock with interaction assertions** only when the interaction
itself is the contract and there's no observable state to check:

```python
def test_charge_called_once_with_total(mocker):
    gateway = mocker.Mock(spec=PaymentGateway)     # spec = only real methods
    gateway.charge.return_value = ChargeResult(ok=True, id="ch_1")
    CheckoutService(payments=gateway, emailer=FakeEmailSender()).checkout(user, cart)
    gateway.charge.assert_called_once_with(amount=cart.total, currency="usd")
```

`spec=` matters: it makes the mock reject calls to methods that don't exist on
the real interface, so a renamed method fails the test instead of silently
passing against a mock that accepts *anything*.

### FastAPI dependency overrides for external services

The exact override mechanism you used for `get_db` in module 03 is how you
inject fakes for *external* dependencies in route-level tests. Your endpoint
declares its needs via `Depends(get_payment_gateway)`; the test swaps the
provider:

```python
# app: the real provider wires the vendor SDK
def get_payment_gateway() -> PaymentGateway:
    return StripeGateway(api_key=settings.stripe_key)

@router.post("/v1/checkout")
def checkout(body: CheckoutIn, gw: PaymentGateway = Depends(get_payment_gateway)):
    ...

# test: override with a fake, exercise the real route + serialization
def test_declined_card_returns_402(client_factory):
    app.dependency_overrides[get_payment_gateway] = lambda: FakeGateway(ok=False)
    client = client_factory()
    r = client.post("/v1/checkout", json={...})
    assert r.status_code == 402
    app.dependency_overrides.clear()
```

This is the best of both worlds: the request runs through your **real** routing,
validation, and serialization (a true integration test of the web layer), while
the one genuinely-external dependency is faked. Because it's your DI seam, you
never patch inside Stripe's library — you replace your own provider function.

### Controlling nondeterminism: time, randomness, IDs, network

Back in module 00 you wrote a flaky `greet_by_hour()` that read `datetime.now()`
directly. Nondeterministic inputs — the clock, `random`, `uuid4`, the network —
must be brought under test control, and there are two styles:

- **Inject them** (preferred): pass a `clock` / `id_generator` callable into the
  code, so a test passes a fixed one. Same design move as any other dependency,
  and no patching needed.
- **Patch them** with `monkeypatch`/`mocker.patch` when injection isn't
  practical: replace `app.services.datetime` or freeze time with a library like
  `freezegun`. Patch **where the name is looked up**, not where it's defined —
  patch `app.services.datetime`, not `datetime.datetime`, or the patch misses.

```python
def test_greeting_before_noon(mocker):
    mocker.patch("app.services.now", return_value=datetime(2026, 1, 1, 9, 0))
    assert greet() == "good morning"
```

For outbound HTTP specifically, prefer a mock transport / `respx` (for httpx) or
a fake client over patching `requests` internals — you get to assert on the
request you *would* have sent and control the response, deterministically.

### Over-mocking: the anti-pattern and how to avoid it

**Over-mocking** is mocking so much that the test no longer verifies real
behavior — it verifies that your code calls your mocks in a particular order,
which is just the implementation restated as assertions. Symptoms: mocking your
*own* internal functions; a test with five `assert_called_with` and no state or
output assertion; tests that break every time you refactor even though behavior
is unchanged; mocks whose return values you have to keep in sync with the real
code by hand. Such tests are **change-detectors, not behavior-verifiers** — they
raise the cost of every refactor while catching few real bugs.

Antidotes: **(1)** Mock only at real boundaries; let internal collaborators run
for real. **(2)** Prefer fakes and state verification over mocks and interaction
verification. **(3)** Assert on *outcomes* (return value, resulting state, HTTP
response), reserving `assert_called` for when the side effect is the whole point
(an email *must* be sent; a card *must not* be charged twice). **(4)** If a test
needs to mock five things to run one method, treat that as a *design* signal —
the unit has too many dependencies — not as a cue to write five mocks. Healthy
mocking is a scalpel at the edges, not a blanket over the whole call graph.

### Don't mock what you don't own — wrap it

A subtle but load-bearing rule: **don't mock third-party types directly**. If
you `mocker.patch("stripe.Charge.create")`, your test is coupled to Stripe's
internal API shape, and it happily passes even if Stripe changed that shape in a
way that breaks you — your mock encodes your *assumption* about their library,
which nothing verifies. Instead, wrap the vendor behind your own thin interface
(`PaymentGateway.charge(...)`), mock *that* (which you own and control), and
cover the real wrapper with a small number of **integration/contract tests**
against the vendor's sandbox (or a recorded interaction). This keeps the bulk of
your suite fast and stable against an interface you control, while a thin,
slower layer guards the actual third-party contract — a preview of the contract
testing you'll formalize in module 05.

## Command reference

| Tool / construct | Purpose |
|---|---|
| `pip install pytest-mock freezegun respx` | Mocking, time-freezing, httpx mock transport |
| `mocker.Mock(spec=Interface)` | A mock that only allows the real interface's methods |
| `mock.return_value = x` | Canned return (stub behavior) |
| `mock.side_effect = Exc()` / `[a, b]` | Raise, or return a sequence across calls |
| `mock.assert_called_once_with(...)` | Interaction assertion (use sparingly) |
| `mock.assert_not_called()` | Prove a side effect did *not* happen |
| `mocker.patch("pkg.mod.name")` | Patch where the name is *used*, not defined |
| `monkeypatch.setattr(obj, "attr", val)` | Built-in patching, auto-undone per test |
| `monkeypatch.setenv("KEY", "v")` | Set env var for one test |
| `app.dependency_overrides[dep] = fn` | Inject a fake external service into a route |
| `freeze_time("2026-01-01")` | Deterministic `datetime.now()` |
| `respx.mock` | Mock outbound httpx calls, assert on the request |

Faking an external gateway behind your own interface (the recommended default):

```python
# app/payments.py  -- your interface + real impl
class PaymentGateway(Protocol):
    def charge(self, amount: int, currency: str) -> "ChargeResult": ...

class StripeGateway:                       # the ONLY place that imports stripe
    def charge(self, amount, currency):
        resp = stripe.Charge.create(amount=amount, currency=currency)
        return ChargeResult(ok=resp.paid, id=resp.id)

# tests/fakes.py
class FakeGateway:
    def __init__(self, ok=True): self.ok, self.charges = ok, []
    def charge(self, amount, currency):
        self.charges.append((amount, currency))
        if not self.ok: raise CardDeclined()
        return ChargeResult(ok=True, id="ch_fake")
```

Proving a side effect does *not* happen on the failure path (a real bug class):

```python
def test_declined_charge_does_not_send_receipt():
    emailer = FakeEmailSender()
    svc = CheckoutService(payments=FakeGateway(ok=False), emailer=emailer)
    with pytest.raises(CardDeclined):
        svc.checkout(user, cart)
    assert emailer.sent == []              # no receipt for a failed charge
```

Mocking outbound HTTP with respx instead of patching library internals:

```python
@pytest.mark.asyncio
async def test_fetches_shipping_rate(respx_mock):
    respx_mock.get("https://ship.example/rate").respond(json={"cents": 599})
    rate = await ShippingClient().get_rate(zip="94107")
    assert rate == 599                     # deterministic, no network
```

## Hands-on exercises

Work in `testing-lab/`. Build a small `CheckoutService(payments, emailer)` that
charges a card and, on success, sends a receipt.

### 1. Introduce a boundary interface

Refactor any direct vendor call so `CheckoutService` depends on injected
`PaymentGateway` and `EmailSender` interfaces, with a `StripeGateway`/
`SmtpEmailSender` as the only modules importing the SDKs. Confirm the service
imports no vendor library. This is the seam everything else here relies on.

### 2. Fake the happy path (state verification)

Write `FakeGateway(ok=True)` and `FakeEmailSender`. Test that a successful
checkout returns a result *and* that the fake emailer recorded exactly one
receipt to the right address. Assert on the recorded state, not on any mock
call.

### 3. Prove a negative side effect

Write `FakeGateway(ok=False)` (raises `CardDeclined`). Test that checkout raises,
and critically that `emailer.sent == []` — no receipt on a declined card. This
"the side effect must *not* happen" assertion is one mocking does uniquely well.

### 4. When interaction *is* the behavior, use a mock with `spec`

Test that the gateway is charged **exactly once** with the cart total (guarding
against a double-charge bug). Use `mocker.Mock(spec=PaymentGateway)` and
`assert_called_once_with(...)`. Then rename `charge`→`capture` on the interface
and watch the `spec`'d mock catch it; a spec-less mock would not.

### 5. Control the clock

Give the service a `created_at` from a `now` callable. Test with an injected
fixed clock first, then achieve the same by `mocker.patch`ing the name *where
it's used*. Deliberately patch `datetime.datetime` (the wrong place) and observe
the patch miss — then fix the target.

### 6. Override an external dependency at the route level

Add `POST /v1/checkout` with `Depends(get_payment_gateway)`. Write two
integration tests via `TestClient`: an approved card → `200`, a declined card →
`402`, each by overriding the provider with a `FakeGateway`. Clear the override
in teardown. The real routing/validation runs; only the vendor is faked.

### 7. Mock outbound HTTP, not the library

Add a `ShippingClient` that GETs a rate over httpx. Test it with `respx`,
asserting both the returned rate *and* that the request went to the expected
URL. Note why this beats `mocker.patch("httpx.get")` (you assert on the request
you'd send, and stay off the network).

### 8. Diagnose and fix: an over-mocked test

This test is green and "thorough," but it's a change-detector that verifies
almost no real behavior. Identify every over-mocking problem and rewrite it to
verify outcomes.

```python
def test_checkout(mocker):
    svc = CheckoutService(payments=mocker.Mock(), emailer=mocker.Mock())
    mocker.patch.object(svc, "_calculate_total", return_value=100)   # mocks own logic
    mocker.patch.object(svc, "_build_receipt", return_value="R")     # mocks own logic
    svc.payments.charge.return_value = mocker.Mock(ok=True, id="x")
    svc.checkout(user, cart)
    svc.payments.charge.assert_called_once()
    svc._calculate_total.assert_called_once()
    svc._build_receipt.assert_called_once()
    svc.emailer.send.assert_called_once()
```

<details>
<summary>Solution</summary>

Problems: **(1) It mocks the service's own internal methods** (`_calculate_
total`, `_build_receipt`) — those are the logic under test, so the test verifies
nothing about totals or receipt contents. **(2) Every assertion is an
interaction assertion** (`assert_called_once`) with no check on any *outcome* —
it verifies the code *calls itself in a certain order*, i.e. it restates the
implementation. **(3) Mocks have no `spec`**, so a renamed method or wrong
signature passes silently. **(4) It'll break on any refactor** (rename an
internal method, inline it) even though behavior is unchanged — a
change-detector, not a behavior-verifier.

Fix: mock only the real boundaries (payments, emailer — ideally as fakes), let
the internal logic run, and assert on outcomes.

```python
def test_successful_checkout_charges_total_and_emails_receipt():
    gateway = FakeGateway(ok=True)
    emailer = FakeEmailSender()
    svc = CheckoutService(payments=gateway, emailer=emailer)

    result = svc.checkout(user, cart)                # real total/receipt logic runs

    assert result.paid is True
    assert gateway.charges == [(cart.total, "usd")]  # charged the real computed total
    assert emailer.sent[0]["to"] == user.email       # receipt actually queued
```

Now the internal calculation runs for real, the assertions are about outcomes,
and a refactor that preserves behavior keeps the test green.

</details>

## Independent challenge

No code given. Return to the layered service from
**02-api-layer-and-request-handling (module 06, Handlers, Controllers, and
Services)** and add an external dependency to it — say an `OrderService` that,
on placing an order, must **charge a payment gateway** and **send a
confirmation email**, both injected as interfaces. Build fakes for both, and
write a unit suite that covers: a successful order charges the gateway with the
correct total and queues exactly one confirmation (state verification); a
declined card raises the domain exception, is **not** persisted, and sends **no
email** (negative side-effect assertion); and — only where the interaction is
the contract — a mock-with-`spec` proving the gateway is charged exactly once
(no double-charge). Then wire it into a route and add two `TestClient`
integration tests using **dependency overrides** (approved → success, declined →
`402`) exactly as in module 03. Nowhere should you mock the service's own
internal methods or a vendor library directly.

<details>
<summary>Hint</summary>

The design that makes all of this clean is the module-06 rule pushed one step
further: the service imports no vendor SDK and receives `PaymentGateway`/
`EmailSender` as constructor arguments, so tests inject fakes with zero
patching. For the "not persisted, no email" test, order the service so the
charge happens *before* the write and email, then assert the fake repo is empty
and `emailer.sent == []` after the raise. Use `Mock(spec=PaymentGateway)` only
for the exactly-once charge assertion; use fakes and outcome assertions for
everything else.

</details>

## Common mistakes & troubleshooting

- **Mocking your own internal logic.** Replacing the code under test with a mock
  verifies nothing. Mock only external boundaries; let internal collaborators
  run.
- **All-interaction, no-outcome assertions.** A wall of `assert_called_with`
  restates the implementation and breaks on refactor. Assert on outcomes; use
  interaction assertions only when the side effect *is* the behavior.
- **Mocks without `spec=`.** A specless mock accepts any method/args, so typos
  and renames pass silently. Always `spec=` (or `autospec`) against the real
  interface.
- **Patching where a name is defined, not used.** `mocker.patch("datetime.
  datetime")` misses a module that did `from datetime import datetime`. Patch
  `app.module.datetime` — the lookup location.
- **Mocking third-party libraries directly.** Couples tests to a vendor's
  internal shape and encodes an unverified assumption. Wrap the vendor behind
  your own interface, mock that, and contract-test the wrapper.
- **Hitting real external services in tests.** Slow, flaky, costs money, may
  cause real side effects. Fake them; reserve real calls for a tiny, isolated
  contract-test layer.
- **Needing five mocks to test one method.** A design smell (too many
  dependencies), not a mocking task. Consider splitting the unit.
- **Leaking overrides / patches.** An uncleared `dependency_overrides` or a
  manual patch not undone corrupts later tests. Use fixtures / `monkeypatch` /
  `mocker` which auto-undo, and clear overrides in teardown.

## Checkpoint quiz

Write down your answer to each question before expanding it — checking without attempting first is the single easiest way to fool yourself into thinking you've learned this.

1. Where should you mock, and what should you *never* mock? Give the one-line
   rule.
2. Why prefer a fake over a mock for an email sender, and when is a mock with
   interaction assertions actually the right call?
3. What does `spec=` (or autospec) buy you, and what bug does a specless mock
   let through?
4. When patching the clock, why does `mocker.patch("app.services.datetime")`
   work while `mocker.patch("datetime.datetime")` often doesn't?
5. Define over-mocking and give two symptoms that a test has become a
   change-detector rather than a behavior-verifier.
6. Why is mocking a third-party library directly a trap, and what's the
   recommended structure instead?
7. A route charges a card via `Depends(get_payment_gateway)`. How do you test
   the declined-card path returns `402` without touching the real gateway, and
   what must you do afterward?

<details>
<summary>Answers</summary>

1. Mock at architectural boundaries — external, slow, nondeterministic, or
   side-effecting collaborators (payment, email, clock, outbound HTTP). Never
   mock your own internal business logic/pure functions; that's the thing under
   test.
2. A fake lets you verify the *outcome/state* (a receipt to the right address
   was queued), which is robust to refactors because it doesn't care how the
   email was sent. A mock with interaction assertions is right only when the
   interaction itself is the contract and there's no observable state — e.g.
   proving a card is charged exactly once, or that no email is sent on failure.
3. `spec=` restricts the mock to the real interface's methods/signatures, so a
   renamed or mistyped method fails the test. A specless mock accepts any
   attribute/call, so such bugs pass silently against a mock that agrees with
   anything.
4. Because you patch where the name is *looked up*. If `app.services` did `from
   datetime import datetime`, the name lives at `app.services.datetime`; patching
   `datetime.datetime` changes the original module but not the already-imported
   reference the service uses.
5. Over-mocking is mocking so much that the test verifies your code calls your
   mocks rather than verifying real behavior. Symptoms: mocking the code's own
   internal methods; only `assert_called` assertions with no outcome/state
   check; the test breaks on every behavior-preserving refactor.
6. Directly mocking a vendor library couples the test to that library's internal
   shape and encodes an assumption nothing verifies (it stays green even if the
   real API changed). Instead wrap the vendor behind your own thin interface,
   mock that interface in the bulk of tests, and cover the real wrapper with a
   small number of contract/integration tests.
7. Override the provider: `app.dependency_overrides[get_payment_gateway] =
   lambda: FakeGateway(ok=False)`, then drive `POST /v1/checkout` via
   `TestClient` and assert `402`. Afterward you must clear the override
   (`dependency_overrides.clear()`, ideally in fixture teardown) so it doesn't
   leak into other tests.

</details>

## Next

[05-e2e-and-contract-testing](../05-e2e-and-contract-testing/README.md) — you've
faked external services to test your code in isolation. Next you'll zoom all the
way out to end-to-end tests that drive the whole assembled system, and to
*contract* testing that verifies your API actually matches its OpenAPI spec
(schemathesis) — plus the hard question of when an e2e test's confidence is
worth its cost and flakiness.
