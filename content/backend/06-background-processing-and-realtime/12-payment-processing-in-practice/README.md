# Module 12: Payment Processing in Practice

## Why this matters

Module 06 taught webhook receiving generically: verify an HMAC signature,
reject stale timestamps, dedupe by event id, ack fast and process later.
Payment processing is where every one of those disciplines stops being
theoretical hardening and becomes the only thing standing between your
system and a real customer's real money moving incorrectly. A missed
signature check means anyone can forge a `charge.succeeded` event and
grant themselves a paid feature for free. A missing idempotency key on
your *outbound* charge call means a network timeout — not a bug, just an
ordinary retry — can charge a card twice. This module takes module 06's
generic receiver discipline and applies it end to end to a real payment
provider's flow (Stripe's actual webhook signature scheme, verified
against real HMAC math, not a hypothetical), plus the one thing module 06
didn't cover: making the *outbound* charge-creation call itself safe to
retry.

## Concepts

### Two directions, two different reliability problems

A payment integration has two independent flows, and conflating them is
the most common design mistake:

- **Outbound: your backend calls the payment provider** to create a
  charge or payment intent. *You* are the caller here, and *you* control
  retries — this is where an **idempotency key** on the request itself
  is what prevents a retried network call from charging twice.
- **Inbound: the provider calls you back via webhooks** — `charge.succeeded`,
  `charge.failed`, `charge.refunded` — because payment confirmation is
  often asynchronous (bank transfers, 3-D Secure challenges, fraud
  review) and can't always be returned synchronously from the initial
  API call. This is exactly module 06's territory: verify the signature,
  dedupe by event id, ack fast.

```
  OUTBOUND (you retry)                  INBOUND (provider retries)
  your backend ──create charge──►       provider ──webhook──► your backend
       │         (idempotency key           │
       │          prevents double-charge     │ (module 06: HMAC verify,
       │          on YOUR retry)              │  dedupe by event id,
       └── you own this side                  │  ack fast)
                                               └── provider owns retry here
```

### Idempotency keys on the outbound call: preventing your own retry from double-charging

A network call to create a charge can fail in a way that's genuinely
ambiguous: did the request never reach the provider, or did it reach
them and the charge succeeded but the *response* was lost? Blindly
retrying "to be safe" risks a real double charge if the first attempt
actually succeeded. The fix (module 01's idempotency-key pattern,
applied to the highest-stakes case in this whole track) is to generate a
stable key **once per logical charge attempt** and send it with every
retry of that same attempt:

```python
import httpx

def create_charge(amount_cents: int, idempotency_key: str):
    return httpx.post(
        "https://api.example-payments.com/v1/charges",
        json={"amount": amount_cents, "currency": "usd"},
        headers={"Idempotency-Key": idempotency_key},
    )
```

The provider stores the *first* response returned for a given
idempotency key and replays that exact response for any repeat request
with the same key — a retried call after a timeout gets back the
original charge's result, not a second charge. The key must be
**generated once and reused across retries of that specific attempt**
(e.g. derived from your own order id), never regenerated per HTTP call —
regenerating it defeats the entire mechanism.

### Verifying a real payment provider's webhook signature

Module 06 taught HMAC signature verification generically. Real providers
publish an exact scheme; Stripe's (representative of the pattern most
providers use) is: the signed content is
`"{timestamp}.{raw_request_body}"`, HMAC-SHA256'd with your webhook
signing secret, sent in a header shaped like `t=<timestamp>,v1=<hex
signature>`:

```python
import hmac, hashlib, time

def verify_webhook_signature(payload: str, sig_header: str, secret: str, tolerance_seconds: int = 300) -> bool:
    parts = dict(p.split("=", 1) for p in sig_header.split(","))
    timestamp = int(parts["t"])
    if abs(time.time() - timestamp) > tolerance_seconds:
        return False  # too old -- possible replay (module 06)
    signed_payload = f"{timestamp}.{payload}"
    computed_sig = hmac.new(secret.encode(), signed_payload.encode(), hashlib.sha256).hexdigest()
    return hmac.compare_digest(computed_sig, parts["v1"])
```

This is module 06's HMAC-and-timestamp discipline, verified here against
the *exact* algorithm a real provider uses — the timestamp is folded
*into* the signed content (not just carried alongside it), so tampering
with the timestamp to bypass the replay-tolerance check also invalidates
the signature. There's no way to slide the timestamp forward without
recomputing a signature you don't have the secret to produce.

### Out-of-order and duplicate webhook delivery

Providers explicitly do not guarantee webhook delivery order — a
`charge.failed` event can arrive after a *later* `charge.succeeded` for
the same charge if their infrastructure retries or reorders internally,
and any event can be delivered more than once (module 06's dedupe-by-id
lesson again, but now with a new wrinkle: dedup alone isn't enough if
two *different* events for the same charge can race). The correct
design treats **the provider's charge object as the source of truth**,
not "whichever event I processed most recently": on receiving any event
about a charge, use the event's own timestamp/data to decide whether it's
newer than what you've already recorded, and only update your local
state if it is.

```python
# WRONG: blindly applies whatever event arrives, in arrival order
def handle_event_naive(event):
    charge_id = event["data"]["object"]["id"]
    db.update_charge_status(charge_id, event["type"])  # last-write-wins on ARRIVAL order

# RIGHT: compare against the event's own ordering info before applying
def handle_event_safe(event):
    charge_id = event["data"]["object"]["id"]
    event_created = event["created"]  # provider's own event timestamp
    current = db.get_charge(charge_id)
    if current and current.last_event_created >= event_created:
        return  # a newer (or same) event already recorded -- ignore this one
    db.update_charge_status(charge_id, event["type"], last_event_created=event_created)
```

### Ledger correctness: append, never overwrite

Because money is involved, a payment system should keep an **append-only
ledger** of every charge/refund/dispute event received — not just a
mutable "current balance" column — so any state can be reconstructed and
audited later (module 10's event-sourcing idea, applied specifically to
money, where "what actually happened, in order" matters more than almost
anywhere else). The "current status" your application reads is a
*derived* view over that ledger, not the only copy of the truth.

### Never trust a client-reported amount

The charge amount your backend tells the payment provider to charge must
come from **your own server-side price calculation**, never from a value
the client sends you — a client-controlled amount is a direct "let the
user set their own price" vulnerability. Verify the cart/order total
server-side immediately before creating the charge, using the same
authoritative pricing logic the rest of your system trusts.

## Command reference

This module uses a **local mock payment API and webhook sender** that
reproduce a real payment provider's exact idempotency-key behavior and
webhook signature scheme, so the exercises below exercise real HTTP
behavior rather than a hypothetical.

| Concern | Pattern |
|---|---|
| Outbound idempotency key | `httpx.post(url, json=..., headers={"Idempotency-Key": key})` |
| Verify inbound signature | `hmac.compare_digest(computed, provided)` over `f"{timestamp}.{body}"` |
| Dedupe inbound events | a `processed_event_ids` set/table keyed on the event's own `id` |
| Out-of-order safety | compare the event's own `created` timestamp against what's already recorded before applying |
| Ledger write | `INSERT` a new row per event; never `UPDATE` history in place |

## Hands-on exercises

`pip install fastapi uvicorn httpx`.

### 1. Build the mock payment API with idempotency-key support

```python
# mock_payment_api.py
from fastapi import FastAPI, Request, Header
import uuid

app = FastAPI()
idempotency_store = {}
charge_count = {"n": 0}

@app.post("/v1/charges")
async def create_charge(request: Request, idempotency_key: str = Header(None, alias="Idempotency-Key")):
    body = await request.json()
    if idempotency_key and idempotency_key in idempotency_store:
        return idempotency_store[idempotency_key]
    charge_count["n"] += 1
    result = {"id": f"ch_{uuid.uuid4().hex[:8]}", "amount": body["amount"], "status": "succeeded"}
    if idempotency_key:
        idempotency_store[idempotency_key] = result
    return result

@app.get("/debug/charge_count")
async def debug_count():
    return charge_count
```

```bash
python3 -m uvicorn mock_payment_api:app --port 8501
```

### 2. Prove a retried request with the same idempotency key doesn't double-charge

```bash
curl -s -X POST http://localhost:8501/v1/charges -H "Idempotency-Key: idem-abc" -H "Content-Type: application/json" -d '{"amount": 5000}'
curl -s -X POST http://localhost:8501/v1/charges -H "Idempotency-Key: idem-abc" -H "Content-Type: application/json" -d '{"amount": 5000}'
curl -s http://localhost:8501/debug/charge_count
```

Expected: both charge calls return the **same** charge id, and
`debug/charge_count` shows `{"n": 1}` — exactly one real charge was
created despite two HTTP calls, because the second request replayed the
first's stored result instead of creating a new charge.

### 3. Prove a *different* idempotency key creates a genuinely new charge

```bash
curl -s -X POST http://localhost:8501/v1/charges -H "Idempotency-Key: idem-xyz" -H "Content-Type: application/json" -d '{"amount": 1000}'
curl -s http://localhost:8501/debug/charge_count
```

Expected: a new, different charge id, and the count increments to `2` —
confirming the dedup is scoped to the *key*, not a blanket "ignore
repeat calls" rule.

### 4. Build the webhook receiver and verify a real signature

```python
# webhook_receiver.py
from fastapi import FastAPI, Request, HTTPException
import hmac, hashlib, time, json

app = FastAPI()
WEBHOOK_SECRET = "whsec_test_secret"
processed_events = set()

def verify_signature(payload: str, sig_header: str, secret: str, tolerance_seconds=300) -> bool:
    parts = dict(p.split("=", 1) for p in sig_header.split(","))
    timestamp = int(parts["t"])
    if abs(time.time() - timestamp) > tolerance_seconds:
        return False
    signed_payload = f"{timestamp}.{payload}"
    computed_sig = hmac.new(secret.encode(), signed_payload.encode(), hashlib.sha256).hexdigest()
    return hmac.compare_digest(computed_sig, parts["v1"])

@app.post("/webhooks/payment")
async def receive_webhook(request: Request):
    raw_body = (await request.body()).decode()
    sig_header = request.headers.get("X-Signature", "")
    if not verify_signature(raw_body, sig_header, WEBHOOK_SECRET):
        raise HTTPException(status_code=400, detail="invalid signature")
    event = json.loads(raw_body)
    if event["id"] in processed_events:
        return {"status": "duplicate_ignored"}
    processed_events.add(event["id"])
    return {"status": "processed", "type": event["type"]}
```

```bash
python3 -m uvicorn webhook_receiver:app --port 8502
```

Send a correctly-signed event:

```python
import hmac, hashlib, time, json, httpx

WEBHOOK_SECRET = "whsec_test_secret"
def sign(payload, secret, ts):
    sig = hmac.new(secret.encode(), f"{ts}.{payload}".encode(), hashlib.sha256).hexdigest()
    return f"t={ts},v1={sig}"

payload = json.dumps({"id": "evt_1", "type": "charge.succeeded"})
ts = int(time.time())
header = sign(payload, WEBHOOK_SECRET, ts)
r = httpx.post("http://localhost:8502/webhooks/payment", content=payload, headers={"X-Signature": header})
print(r.json())
```

Expected: `{"status": "processed", "type": "charge.succeeded"}`.

### 5. Prove a redelivered event is ignored, and a forged one is rejected

Send the exact same signed payload from exercise 4 a second time:

Expected: `{"status": "duplicate_ignored"}` — the same event id was
recognized and not reprocessed.

Now send a request with a signature that doesn't match (e.g.
`X-Signature: t=<ts>,v1=deadbeef`):

Expected: `HTTP 400` — an unsigned or incorrectly-signed request is
rejected outright, exactly module 06's "verify before you trust
anything in the body" rule, now exercised against a scheme matching a
real provider's exact algorithm.

### 6. Simulate out-of-order delivery and confirm the safe handler wins

Using the "RIGHT" handler from the Concepts section, simulate a
`charge.succeeded` event with `created=200` arriving, followed by a
*stale* `charge.pending` event with `created=100` (an out-of-order
redelivery) for the same charge. Expected: the naive last-write-wins
handler would incorrectly downgrade the charge back to `pending`; the
timestamp-comparing handler correctly ignores the stale event because
its `created` value is older than what's already recorded. Write both
handlers and run both scenarios to see the difference directly.

### 7. Diagnose and fix: a customer was charged twice

A team's checkout flow calls "create charge" directly from the request
handler with no idempotency key. Under normal load it's fine; during a
brief spike in provider latency, the client's HTTP request to your
backend times out and the frontend automatically retries the checkout
submission. Support tickets report a customer charged twice for one order.

<details>
<summary>Solution</summary>

Root cause: the outbound charge-creation call had no idempotency key, so
when the client (correctly, per normal retry behavior) resubmitted after
a timeout, your backend had no way to recognize "this is the same
logical checkout attempt as a moment ago" — it just made a second,
independent call to the payment provider, which dutifully charged the
card again. The provider's timeout was on your backend-to-client
connection; the original charge to the provider may well have succeeded
the first time, and the retry created a second, real charge.

Fix: generate an idempotency key **once per checkout attempt** (e.g.
tied to the order id, generated when the order is first created, not
regenerated on each retry) and send it on every attempt to charge that
same order, exactly as exercise 2 demonstrated. The provider then
recognizes the retried request as the same attempt and returns the
original charge's result instead of creating a new one — the fix is
entirely on the outbound side, and no amount of inbound webhook
correctness (module 06) would have prevented this specific bug, because
the double charge happened on the *sending* side, before any webhook was
even involved.

</details>

### 8. Clean up

```bash
# Ctrl+C the running mock_payment_api and webhook_receiver uvicorn processes.
```

## Independent challenge

No code given. Design the full payment flow for a subscription business:
a monthly charge is attempted automatically for each active
subscriber. Specify: (1) how the idempotency key for each month's charge
attempt is derived so that automatic retries within the same billing
cycle can't double-charge, but *next* month's charge is still a genuinely
new attempt; (2) how your webhook handler treats a
`charge.succeeded`
arriving for a subscription that was cancelled by the customer *after*
the charge was already initiated but *before* the webhook arrived —
should the charge be refunded automatically, and what does the
append-only ledger from the Concepts section let you reconstruct about
what happened, in what order; (3) what happens if the payment provider's
webhook delivery is degraded for several hours during your billing run —
does your system still know which subscribers were actually charged.

<details>
<summary>Stuck? One hint</summary>

Derive the idempotency key from `(subscription_id, billing_period)` —
e.g. `sub_42-2026-08` — so any retry *within* August's billing attempt
reuses the same key (safe, no double charge), but September's attempt
naturally gets a different key (a genuinely new charge is expected and
correct). For (2), the ledger should record both the cancellation event
and the charge-succeeded event with their own timestamps, in the order
your system actually learned about them — that record is exactly what
lets a human or an automated reconciliation job decide "this charge
happened after a cancellation initiated first, refund it" without
guessing, because the full history is preserved rather than a single
overwritten "current status" field. For (3), because the *outbound*
charge call already got a synchronous response from the provider at
call time (module 12's outbound flow doesn't depend on webhooks to know
if a charge was created) — a webhook outage delays your ability to
react to *asynchronous* status changes (disputes, delayed bank
confirmations), but doesn't erase your own record of which charges you
initiated and what immediate response each one got.

</details>

## Common mistakes & troubleshooting

- **No idempotency key on the outbound charge call.** As exercise 7
  showed, an ordinary client retry after a timeout becomes a real
  double charge with no protection — this is the single highest-stakes
  gap this module addresses.
- **Regenerating the idempotency key on every retry instead of once per
  attempt.** A key that changes on each retry defeats the entire
  mechanism — the provider sees each retry as a brand-new request. The
  key must be stable across retries of the *same* logical attempt.
- **Trusting a client-supplied charge amount.** Always compute the
  amount server-side from your own authoritative pricing logic
  immediately before charging — never accept an amount from the request
  body as-is.
- **Applying webhook events in arrival order instead of the event's own
  order.** Providers don't guarantee delivery order; exercise 6 showed a
  stale, out-of-order redelivery can incorrectly overwrite newer state
  if you don't compare the event's own timestamp before applying it.
- **Treating "current status" as the only source of truth.** An
  append-only ledger (module 10's event-sourcing idea, applied to money)
  lets you reconstruct and audit what actually happened and in what
  order — a single mutable status column can't answer "wait, what
  happened here?" after the fact.
- **Skipping module 06's signature verification because "it's just an
  internal endpoint."** A payment webhook endpoint is exactly the
  highest-stakes place to apply that discipline rigorously, not a place
  to relax it.

## Checkpoint quiz

Write down your answer to each question before expanding it — checking without attempting first is the single easiest way to fool yourself into thinking you've learned this.

1. What are the two independent directions in a payment integration,
   and which reliability mechanism belongs to which direction?
2. Why must an idempotency key be generated once per logical attempt
   and reused across retries, rather than generated fresh on every HTTP
   call?
3. In the Stripe-style signature scheme, why is the timestamp folded
   *into* the signed content instead of just being carried in a separate
   header field?
4. Why isn't deduplicating webhook events by their id alone always
   sufficient to keep your local state correct?
5. Why should a payment system's local record be an append-only ledger
   rather than a single mutable "current status" column?
6. In the double-charge scenario from exercise 7, why wouldn't perfect
   inbound webhook handling (module 06's discipline) have prevented the
   bug?

<details>
<summary>Answers</summary>

1. Outbound (your backend calls the provider to create a charge) is
   protected by an idempotency key you generate and control, since you
   own the retries on that side. Inbound (the provider calls your
   webhook endpoint) is protected by module 06's discipline — signature
   verification, timestamp/replay checking, and deduplication by event
   id — since the provider owns the retries on that side.
2. Because the mechanism works by the provider recognizing "I've seen
   this exact key before" and replaying the original response instead of
   creating a new charge. If the key changes on every retry, the
   provider sees each one as a brand-new, never-seen-before request and
   processes it as a new charge — exactly the double-charge the key was
   supposed to prevent.
3. Because folding the timestamp into the signed payload
   (`f"{timestamp}.{body}"`) means an attacker can't simply slide the
   timestamp forward to bypass a replay-tolerance check — doing so
   changes the signed content, which invalidates the signature unless
   they also have the secret to recompute it. A timestamp carried
   separately from the signed content wouldn't have this protection.
4. Because two *different* events for the same underlying charge can
   still arrive out of order (a `charge.failed` after a later
   `charge.succeeded`, say). Deduping by id only stops the *same* event
   from being processed twice — it doesn't stop a stale, older, but
   never-before-seen event from overwriting newer state if you don't
   also compare each event's own ordering information before applying it.
5. Because a mutable "current status" column only ever tells you the
   latest state, discarding the history of how you got there. An
   append-only ledger preserves every event as it was received, in
   order, so a later audit, dispute, or reconciliation can reconstruct
   exactly what happened and when — essential for money, where "we don't
   know why the balance is what it is" is not an acceptable answer.
6. Because the double charge happened entirely on the *outbound* side —
   the client retried the checkout submission, and your backend made a
   second, independent call to create a charge with no idempotency key.
   No webhook was involved in creating the duplicate; the bug was in
   how the outbound charge-creation call handled a retry, a completely
   separate mechanism from inbound webhook processing.

</details>

## Further reading & sources

- [Stripe: Idempotent requests](https://docs.stripe.com/api/idempotent_requests) - the exact idempotency-key mechanism this module's outbound examples are modeled on.
- [Stripe: Webhook signatures](https://docs.stripe.com/webhooks#verify-manually) - the precise `t=...,v1=...` signature scheme and manual verification algorithm this module's receiver reproduces exactly.
- [Stripe: Best practices for webhooks](https://docs.stripe.com/webhooks/best-practices) - out-of-order delivery, retry behavior, and idempotent event handling from the payment provider's own side.
- [PCI Security Standards Council: PCI DSS Quick Reference Guide](https://www.pcisecuritystandards.org/document_library/) - why you generally should never handle raw card numbers yourself and should rely on a provider's tokenization/hosted fields instead.
- [Martin Fowler: Event Sourcing](https://martinfowler.com/eaaDev/EventSourcing.html) - the append-only-ledger reasoning behind this module's "never overwrite, always append" guidance, referenced from module 10.

## Next

[13-batch-etl-pipeline-orchestration](../13-batch-etl-pipeline-orchestration/README.md)
— a different kind of "work that happens outside the request cycle":
not a single job or a single webhook, but many dependent steps that
must run on a schedule, in the right order, with the failure of one
step correctly blocking the ones that depend on it.
</content>
