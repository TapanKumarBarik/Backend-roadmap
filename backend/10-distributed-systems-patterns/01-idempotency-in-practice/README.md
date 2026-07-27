# Module 01: Idempotency in Practice

## Why this matters

In track 06 you kept hearing one word every time reliability came up: *idempotent*.
At-least-once queues redeliver messages, so tasks must be idempotent. Webhook
receivers get the same event twice, so they must dedupe. Retry-with-backoff only
works if retrying is safe. You were told *that* it mattered and shown the shape of
it; this module is where you actually learn to *design* for it, because in a
distributed system duplication isn't an edge case — it's the default.

Here's the uncomfortable truth that makes idempotency non-negotiable: **in a
distributed system you can never know for certain whether an operation succeeded.**
A client sends "charge $50," the server charges the card, and then the network
drops the *response* on its way back. The client sees a timeout. Did the charge
happen? The client has no way to know. Its only safe options are to retry (risking
a double charge) or give up (risking a lost charge). This is the *two generals*
problem in miniature, and it appears everywhere: a mobile app on flaky wifi, a
worker whose broker redelivers after a crash (track 06), a load balancer that
retries an upstream that was actually still processing. If retrying a request can
cause a second charge, a duplicate order, or a doubled inventory decrement, your
system is broken — not occasionally, but predictably, under exactly the conditions
distributed systems always operate in.

Idempotency is the property that makes retries *safe*: performing an operation
once or performing it five times leaves the system in the same state. Master this
and the entire reliability story of the rest of the track — sagas that retry
steps, event handlers that replay, locks that expire and get re-acquired — rests
on a foundation that doesn't corrupt data when (not if) work happens twice.

## Concepts

### Idempotency defined, and why "at-least-once" makes it mandatory

An operation is **idempotent** if applying it multiple times has the same effect
as applying it once. `SET x = 5` is idempotent (run it a hundred times, `x` is 5).
`x = x + 1` is *not* (run it twice, you added 2). That's the whole definition — but
its importance comes from a systems fact you met in track 06: reliable messaging
gives you **at-least-once** delivery, not exactly-once. Exactly-once delivery is,
in the general case, *impossible* — the sender can't distinguish "message lost" from
"ack lost," so any system that guarantees delivery must be willing to redeliver,
which means duplicates. The industry's honest phrasing is **"at-least-once
delivery plus idempotent processing = effectively-once."** You don't get
exactly-once on the wire; you get it by making the *processing* idempotent so
duplicates are harmless. That shifts the burden from the impossible (perfect
delivery) to the achievable (safe reprocessing) — and that burden is *yours*, in
the handler.

### Idempotent HTTP methods vs idempotent operations

HTTP has opinions about idempotency baked into its method semantics (you met these
in track 01), and it's crucial not to confuse the *spec's promise* with *your
implementation actually keeping it*.

- **GET, PUT, DELETE are defined as idempotent; POST is not.** `PUT /users/42`
  with a full representation is idempotent *by design* — sending it twice leaves
  user 42 in the same final state. `DELETE /users/42` is idempotent: the first
  deletes, the second is a no-op (still "gone"). `GET` changes nothing. `POST
  /orders` is *not* idempotent by design — each call is meant to create a new
  order, so two calls make two orders.
- **The spec is a promise about semantics, not a guarantee your code keeps it.**
  A `PUT` handler that does `INSERT ... ; counter += 1` has made a "PUT" that isn't
  actually idempotent. The method name doesn't enforce anything; *you* must
  implement it idempotently.
- **The hard case is the non-idempotent operation you must make safe anyway.**
  "Create an order," "charge a card," "send an email" are genuinely
  create-a-new-thing operations, and they're exactly the ones a retry double-fires.
  You can't change them to `PUT`. Instead you make them idempotent *at the
  application level* with an idempotency key. That's the technique the rest of this
  module is about.

### Idempotency keys: the standard technique for making POST safe

The industry-standard way (Stripe, PayPal, every serious payments API) to make a
non-idempotent operation safe to retry is the **idempotency key**: the *client*
generates a unique key (a UUID) for a logical operation and sends it with the
request, typically in an `Idempotency-Key` header. The *server* remembers which
keys it has already processed and, on seeing a key again, returns the *stored
result of the first execution* instead of performing the operation a second time.

The mechanism, precisely:

1. Client generates a key once, per logical intent ("this one checkout"), and
   *reuses the same key on every retry* of that intent.
2. Server, on receiving a request with a key, atomically checks: have I seen this
   key? If **no**, it records the key as "in progress," performs the operation,
   stores the response against the key, and returns it. If **yes and completed**,
   it returns the *saved* response without re-executing. If **yes but still
   in progress**, it returns a "request in progress, retry later" signal
   (typically `409`) so two concurrent copies don't both run.
3. The record has a TTL (24h is common) after which the key can be reused.

The subtle, critical part is step 2's *atomicity*. If two retries arrive
simultaneously, a naive "check then insert" has a race: both check (not found),
both proceed, both charge. The check-and-record must be a single atomic operation
— a unique-constraint insert that one loses, or an atomic Redis `SET key value NX`.
This is why idempotency keys and the locking/consistency ideas from module 00 are
the same family of problem.

### Natural idempotency: design the operation so a key isn't even needed

An idempotency key is a general tool, but the *best* idempotency is often
structural — arrange the operation so that repeating it is inherently harmless,
and you need no bookkeeping at all. Techniques you already have from track 04:

- **Use the client-supplied ID as the primary key.** If the client generates the
  order's UUID and you `INSERT` with it, a duplicate insert hits the primary-key
  constraint and you catch it as "already created" — the database *is* your dedupe
  store. This is `INSERT ... ON CONFLICT DO NOTHING` (Postgres upsert).
- **Make writes absolute, not relative.** `SET status = 'paid'` is idempotent;
  `balance = balance + 50` is not. When you can express the change as "set to this
  final value" rather than "adjust by this delta," repetition is free. When you
  genuinely need a delta (crediting money), you need a key or a dedupe record.
- **Check-before-act on observable state.** "Send the 'welcome' email only if
  `welcome_sent_at IS NULL`, and set it in the same transaction." The state itself
  records that the side effect happened.
- **Upsert instead of insert.** `INSERT ... ON CONFLICT (id) DO UPDATE` converges
  to the same row regardless of how many times it runs.

The rule of thumb: reach for structural idempotency first (it's simpler and has no
extra store to manage), and use an explicit idempotency key when the operation is
an irreversible external side effect (charging a card, calling a third-party API)
where you can't rely on your own database state alone.

### Idempotent background jobs and consumers

Everything above applies double to the background work from track 06, because
queues *guarantee* redelivery. A Celery task or webhook consumer must assume it
will run more than once for the same logical event and produce the same result.
The patterns:

- **Dedupe on a stable event/message id.** The producer stamps each message with
  an id that's *stable across retries* (not regenerated each attempt). The consumer
  records processed ids and skips ones it's seen — the receiver-side dedupe you saw
  in track 06's webhook module, generalized.
- **Make the effect check-and-set.** Before doing the side effect, atomically claim
  it: `INSERT INTO processed_events (event_id) VALUES (:id)` inside the same
  transaction as the effect; if the insert conflicts, you've already done it —
  bail. Because the claim and the effect commit together, a crash between them
  can't leave a "claimed but not done" gap.
- **Beware non-idempotent side effects hiding inside a "mostly idempotent" task.**
  A task that upserts a row (idempotent) *and* sends an email (not) is not
  idempotent overall — the retry re-sends the email. Every side effect needs its
  own idempotency guard, keyed appropriately.

## Command reference

| Technique | Mechanism | When |
|---|---|---|
| Idempotency key (header) | client UUID + server-side store of results | non-idempotent POST with external side effects (payments) |
| Client-generated primary key | `INSERT` with client UUID as PK | creating a resource; DB constraint dedupes |
| `INSERT ... ON CONFLICT DO NOTHING` | Postgres upsert, insert-once | dedupe records, processed-event log |
| `INSERT ... ON CONFLICT DO UPDATE` | Postgres upsert, converge | "set to final state" writes |
| Atomic `SET key val NX EX ttl` | Redis set-if-absent with TTL | fast in-flight/idempotency claim |
| Check-before-act flag | `WHERE effect_done_at IS NULL` + set it | one-shot side effects (welcome email) |
| Stable event id + processed-log | dedupe consumer on message id | at-least-once queues, webhooks |

A production-shaped idempotency-key middleware for a FastAPI payment endpoint,
using Postgres for the atomic claim and the stored response:

```python
import hashlib, json
from fastapi import FastAPI, Header, HTTPException, Request, Response
from sqlalchemy import create_engine, text
from sqlalchemy.exc import IntegrityError

api = FastAPI()
db = create_engine("postgresql+psycopg://app@primary:5432/shop")

# CREATE TABLE idempotency_keys (
#   key           TEXT PRIMARY KEY,
#   request_hash  TEXT NOT NULL,
#   status        TEXT NOT NULL,          -- 'in_progress' | 'completed'
#   response_code INT,
#   response_body JSONB,
#   created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
# );

@api.post("/charges")
async def create_charge(request: Request,
                        idempotency_key: str = Header(...)):
    body = await request.body()
    req_hash = hashlib.sha256(body).hexdigest()

    with db.begin() as c:
        # Atomic claim: only ONE concurrent request wins this INSERT.
        try:
            c.execute(
                text("INSERT INTO idempotency_keys (key, request_hash, status) "
                     "VALUES (:k, :h, 'in_progress')"),
                {"k": idempotency_key, "h": req_hash},
            )
            claimed = True
        except IntegrityError:
            claimed = False

    if not claimed:
        # We've seen this key. Return the saved result or say "still running".
        with db.begin() as c:
            row = c.execute(
                text("SELECT request_hash, status, response_code, response_body "
                     "FROM idempotency_keys WHERE key = :k"),
                {"k": idempotency_key},
            ).one()
        if row.request_hash != req_hash:
            # Same key, DIFFERENT body -> client bug; never silently reuse.
            raise HTTPException(422, "Idempotency-Key reused with a different payload")
        if row.status == "in_progress":
            raise HTTPException(409, "A request with this key is still in progress")
        return Response(content=json.dumps(row.response_body),
                        status_code=row.response_code,
                        media_type="application/json")

    # We won the claim: actually perform the (non-idempotent) side effect ONCE.
    result = charge_card(body)            # the real, irreversible operation
    with db.begin() as c:
        c.execute(
            text("UPDATE idempotency_keys SET status='completed', "
                 "response_code=:rc, response_body=:rb WHERE key=:k"),
            {"k": idempotency_key, "rc": 201, "rb": json.dumps(result)},
        )
    return Response(content=json.dumps(result), status_code=201,
                    media_type="application/json")
```

Note two production-grade details: (1) storing the **request hash** so reusing a
key with a *different* body is caught as a client error rather than silently
returning the wrong stored response; (2) the `in_progress` → `409` path so two
concurrent retries don't both execute the charge.

An idempotent Celery consumer, deduping on a stable event id in the same
transaction as its effect:

```python
@app.task(bind=True, max_retries=5)
def apply_payment(self, event_id: str, order_id: int, amount: int):
    try:
        with db.begin() as c:
            # Claim the event; if already processed, this conflicts and we stop.
            claimed = c.execute(
                text("INSERT INTO processed_events (event_id) VALUES (:e) "
                     "ON CONFLICT DO NOTHING RETURNING event_id"),
                {"e": event_id},
            ).first()
            if claimed is None:
                return "duplicate; already applied"   # at-least-once redelivery
            # Effect and claim commit together -> no 'claimed but not done' gap.
            c.execute(text("UPDATE orders SET status='paid' WHERE id=:o"),
                      {"o": order_id})
    except OperationalError as exc:
        raise self.retry(exc=exc, countdown=2 ** self.request.retries)
```

## Hands-on exercises

Use one Postgres (from module 00's setup or a fresh `docker run -d --name pg -p
5432:5432 -e POSTGRES_PASSWORD=pg postgres:16`) and Redis (`docker run -d --name
redis -p 6379:6379 redis:7`). `pip install fastapi uvicorn "sqlalchemy>=2"
psycopg[binary] redis`. Create the `idempotency_keys` and `processed_events`
tables from the command reference, plus `CREATE TABLE ledger (id SERIAL PRIMARY
KEY, account TEXT, delta INT, note TEXT);`.

### 1. Prove a naive create double-fires

Write `POST /orders` that does `INSERT INTO orders (customer, total) VALUES (...)`
with an auto-increment id, no key. Call it twice with identical bodies (simulating
a client retry). Query the table.

Expected: two order rows with different ids for one logical checkout. This is the
bug idempotency exists to prevent — and it's *invisible* in any test that calls the
endpoint once.

### 2. Fix it with a client-generated primary key (natural idempotency)

Change the design so the *client* sends an `order_id` UUID and you `INSERT INTO
orders (id, ...) VALUES (:id, ...) ON CONFLICT (id) DO NOTHING`. Call twice with the
same `order_id`.

Expected: exactly one row; the second call is a harmless no-op. You made a
create-operation idempotent *without any extra store* by letting the primary-key
constraint be the dedupe. Note how much simpler this is than a key middleware —
prefer it when the operation is a pure DB write.

### 3. Build the idempotency-key middleware

Implement the `POST /charges` handler from the command reference (stub
`charge_card` to append a row to `ledger` and return `{"charge_id": ...}`). Send
the same request with the same `Idempotency-Key` three times.

Expected: exactly one `ledger` row; all three responses identical (the stored
result). Now inspect `idempotency_keys` — one row, `status='completed'`, with the
stored response body.

### 4. Race two retries at the same key

Send two `POST /charges` with the same key *concurrently* (two `curl &` in the
background, or `httpx.AsyncClient` firing both without awaiting between). 

Expected: exactly one performs the charge; the other either gets `409 in progress`
or the stored result — never a second `ledger` row. If you see two ledger rows,
your claim wasn't atomic (you did check-then-insert instead of insert-and-catch).
This exercise is the whole reason the claim must be a single atomic statement.

### 5. Catch the reused-key-different-body bug

Send `POST /charges` with key `K` and body `{"amount": 50}`. Then send key `K`
again with body `{"amount": 5000}`.

Expected: `422` — the request hash differs, so the server refuses rather than
silently returning the `$50` result for a `$5000` request. Explain why silently
returning the stored `$50` response would be *worse* than an error here (the
client thinks it charged $5000; it didn't, and got no signal).

### 6. Make a background consumer idempotent

Build the `apply_payment` Celery task from the command reference (or a plain
function you call twice to simulate redelivery). Call it twice with the same
`event_id` and `order_id`.

Expected: the order is marked `paid` once; the second call returns "duplicate" and
does nothing. Then deliberately move the `INSERT INTO processed_events` to a
*separate* transaction that commits *before* the `UPDATE`, kill the process between
them, and reason about the resulting "claimed but not applied" gap — this is why
the claim and the effect must commit together.

### 7. Redis-based fast idempotency claim

Reimplement the claim using Redis `SET key val NX EX 86400` instead of a Postgres
row. Return a "duplicate" signal when `SET` returns nil (key already existed).

Expected: same dedupe behavior with a single round-trip and automatic TTL
expiry. Discuss the trade-off versus the Postgres version: Redis is faster and
self-expiring but is a *separate* store from your business data, so the claim and
the DB effect are no longer in one transaction — if the effect's DB commit fails
*after* the Redis claim succeeded, you've marked something done that isn't. (This
gap is exactly what module 02's fencing and module 04's sagas address.)

### 8. Idempotent DELETE and PUT

Write `DELETE /orders/{id}` and `PUT /orders/{id}` (full-replacement) and call each
twice. Confirm the second call leaves the system in the same state as the first
(DELETE: still gone, second returns `204` or `404` consistently; PUT: same final
representation). Then write a *broken* `PUT` that also increments a counter, and
show it violates the idempotency the method promises.

Expected: correct DELETE/PUT are naturally idempotent; the counter-incrementing PUT
proves the method name guarantees nothing — *your implementation* must honor it.

### 9. Diagnose and fix: the double-shipped order

Ops reports some customers received two identical shipments. The flow: `POST
/checkout` writes an order and enqueues a Celery `fulfill_order.delay(order_id)`;
the worker calls the warehouse API to create a shipment, then sets `orders.status
= 'fulfilled'`. The broker occasionally redelivers tasks after a worker restart.
Explain the root cause and give the fix, naming which side effect is the
non-idempotent one.

<details>
<summary>Answer</summary>

Root cause: the task is **not idempotent**, and the broker delivers
**at-least-once**, so a redelivered `fulfill_order` runs the warehouse
shipment-creation call a second time. Marking the order `fulfilled` at the end
doesn't help, because on redelivery the task starts over from the top and calls
the warehouse *before* it would check status — and even a status check at the top
races with the first run. The non-idempotent side effect is the **external
warehouse "create shipment" call**: it creates a new shipment every time it's
invoked, and the worker has no way to know the first attempt already did.

Fix: give the shipment operation a stable idempotency key derived from the order
(e.g. `idempotency_key = f"ship-{order_id}"`) and pass it to the warehouse API so
*they* dedupe — most shipping/payment APIs accept an idempotency key exactly for
this. If the warehouse API has no such feature, record shipment creation locally
in a `processed_events`/`shipments` row keyed by `order_id` inside a transaction,
and only call the API if the claim insert succeeded (`ON CONFLICT DO NOTHING
RETURNING`), so a redelivery finds the claim already present and skips the call.
Either way: the external side effect needs its own idempotency guard keyed by the
order — marking the order fulfilled at the end is not enough because the redelivery
re-executes from the beginning.

</details>

## Independent challenge

No code given. Recall the **00-cap-theorem-and-consistency-models** module's
read-your-writes discussion. Now design an idempotent **"redeem gift card"**
endpoint for a checkout system with these rules: a gift card has a balance;
redeeming applies some or all of it to an order; the client (a flaky mobile app)
*will* retry on timeout; a redemption must never be double-applied (that would
credit the customer twice and lose the merchant money); and two *different* orders
must be able to redeem from the same card concurrently without corrupting the
balance. Specify: what the idempotency key is keyed on (per what — per card? per
order? per redemption attempt?), how you make the balance decrement itself safe
under concurrency, what you store and return on a duplicate, and how a reused key
with a different amount is handled. Then state which parts are "natural
idempotency" and which need an explicit key.

<details>
<summary>Hint</summary>

Two separate concerns are hiding here and each needs its own mechanism. (1)
**Duplicate-retry safety** is per *redemption attempt*: key the idempotency record
on a client-supplied `redemption_id` (one per logical "apply this card to this
order" intent), store the resulting new balance + applied amount, and return the
stored result on retry — this is the explicit-key technique from this module. (2)
**Concurrent redemptions from the same card** (two different orders at once) is a
lost-update problem from track 04 module 04, not an idempotency problem — the
balance decrement must be atomic/serialized (`UPDATE cards SET balance = balance -
:amt WHERE id = :c AND balance >= :amt` returning row count, or `SELECT ... FOR
UPDATE`), so two concurrent redemptions can't both spend the same dollars. A reused
key with a different amount is a client bug → reject with `422` (the request-hash
check). The natural-idempotency part is the atomic conditional `UPDATE`; the
explicit-key part is deduping the retry of one attempt.

</details>

## Common mistakes & troubleshooting

- **Chasing exactly-once delivery.** It's impossible in the general case. Aim for
  at-least-once delivery + idempotent processing = effectively-once. The safety
  lives in your handler, not on the wire.
- **Check-then-act without atomicity.** "SELECT to see if the key exists, then
  INSERT if not" has a race that lets two concurrent retries both execute. Use a
  single atomic operation: a unique-constraint insert you catch, or Redis `SET NX`.
- **Assuming the HTTP method makes you idempotent.** `PUT`/`DELETE` are idempotent
  *by contract*, but only if your implementation keeps the promise. A `PUT` that
  also increments a counter is not idempotent regardless of the verb.
- **Regenerating the idempotency key on each retry.** The client must reuse the
  *same* key for every retry of one logical intent; a fresh key per attempt defeats
  the entire mechanism.
- **Not binding the key to the request body.** Store a request hash so a key reused
  with a *different* payload is rejected, not silently answered with the wrong
  stored response.
- **One guard for a task with multiple side effects.** Upserting a row *and* sending
  an email *and* calling an external API — each is a separate side effect needing
  its own idempotency key. "The task is idempotent" is false if any one side effect
  isn't.
- **Claim and effect in separate transactions.** Marking an event "processed"
  before (or in a different transaction from) the effect creates a
  claimed-but-not-done gap on a crash. Commit the claim and the effect together;
  when they *can't* be in one transaction (external call), that gap is exactly what
  fencing (module 02) and sagas (module 04) exist to handle.
- **No TTL / unbounded key store.** Idempotency records accumulate forever without
  an expiry. Give them a TTL (24h is typical) so old keys are reclaimed.

## Checkpoint quiz

Write down your answer to each question before expanding it — checking without attempting first is the single easiest way to fool yourself into thinking you've learned this.

1. Define idempotency, and explain why at-least-once delivery makes it mandatory
   rather than nice-to-have.
2. Why is exactly-once delivery impossible, and what's the practical phrase the
   industry uses instead?
3. `PUT` is defined as idempotent and `POST` is not. What does that actually
   guarantee, and what doesn't it guarantee?
4. Walk through the idempotency-key mechanism for a payment `POST`, including the
   one step that *must* be atomic and why.
5. Give two "natural idempotency" techniques that need no separate key store, and
   say when you'd reach for an explicit key instead.
6. Why must a background consumer's "claim this event as processed" and its actual
   side effect commit together? What breaks if they don't?
7. A client reuses an idempotency key but changes the request body. What should the
   server do, and why is silently returning the stored response wrong?

<details>
<summary>Answers</summary>

1. Idempotency: performing an operation multiple times has the same effect as
   performing it once. It's mandatory because reliable messaging (and client
   retries, and load-balancer retries) is at-least-once — duplicates *will* happen
   — so any non-idempotent side effect *will* be executed more than once and
   corrupt state. It's not an edge case; it's the default operating condition.
2. Because the sender can't distinguish "message was lost" from "the ack was lost,"
   so guaranteeing delivery requires being willing to resend, which produces
   duplicates. The practical phrase: **at-least-once delivery + idempotent
   processing = effectively-once**.
3. It guarantees the *intended semantics*: a `PUT` twice should leave the resource
   in the same final state, a `POST` twice may create two resources. It does *not*
   guarantee your implementation is actually idempotent — the method name enforces
   nothing; a `PUT` handler with a side effect like a counter increment breaks the
   promise.
4. The client generates one key per logical intent and reuses it on every retry.
   The server atomically claims the key (insert-if-absent); if it wins, it performs
   the operation once, stores the response against the key, and returns it; if the
   key already exists it returns the stored response (or `409` if still in
   progress) without re-executing. The **claim must be atomic** (a single
   unique-insert or `SET NX`), because a check-then-insert lets two concurrent
   retries both pass the check and both execute the charge.
5. (a) Client-generated primary key with `INSERT ... ON CONFLICT DO NOTHING` — the
   DB constraint dedupes creates. (b) Absolute writes (`SET status='paid'`) or
   upserts that converge to the same state regardless of repetition; also
   check-before-act flags (`WHERE done_at IS NULL`). Reach for an explicit key when
   the operation is an irreversible *external* side effect (charging a card, calling
   a third-party API) where your own DB state can't dedupe it.
6. So there's no window where the event is marked processed but the effect didn't
   happen (or vice versa). If the claim commits first and the process crashes before
   the effect, the event looks done forever but isn't (lost work); if the effect
   commits first and the claim doesn't, a redelivery re-runs the effect (duplicate).
   Committing both in one transaction makes it all-or-nothing.
7. Reject it (e.g. `422`), because the stored response corresponds to a *different*
   request. Silently returning the old response tells the client its new,
   different operation succeeded when it never ran — worse than an error, because
   the client gets no signal that its intended change didn't happen. Bind the key
   to a request hash to detect this.

</details>

## Next

[02-distributed-locking](../02-distributed-locking/README.md) — idempotency makes
a *repeated* operation safe; sometimes you instead need to guarantee that only
*one* actor performs an operation *at a time* across many processes and machines
(only one scheduler fires the nightly job, only one worker rebuilds the cache).
The next module shows why the `threading.Lock` from a single process is useless
across machines, how to build a correct Redis-based distributed lock, and why lock
expiry forces you to think about fencing tokens.
