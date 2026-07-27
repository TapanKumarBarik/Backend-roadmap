# Module 05: Webhooks Fundamentals

## Why this matters

Systems need to tell other systems when things happen. A payment settles, an
order ships, a video finishes transcoding, a document is signed — and some
*other* application, owned by someone else, needs to know the moment it
occurs. The naive way for that other system to find out is **polling**: call
`GET /order/123/status` every few seconds and check. Polling is wasteful (the
vast majority of polls return "nothing changed"), it's slow (you learn about
the event up to one poll-interval late), and it doesn't scale (every consumer
hammering your API on a timer). It's the difference between refreshing your
email every thirty seconds versus getting a notification when mail arrives.

**Webhooks invert this.** Instead of the consumer pulling, the producer
*pushes*: when the event happens, your server makes an HTTP request to a URL
the consumer registered in advance, delivering the event data. It's push, not
pull; it's real-time; and it costs a request only when there's actually
something to report. This is how Stripe tells you a payment succeeded, how
GitHub tells your CI a commit was pushed, how Slack delivers events to your
bot. Webhooks are the connective tissue of modern integrations.

This module is about being the **sender** — the system emitting webhooks.
You'll design the event model, the payload, and a delivery system that's
reliable enough for other developers to build businesses on. (Module 06 flips
to the *receiver* side: verifying, securing, and processing webhooks you
receive — the security-critical half.) Being a good webhook sender is a
service-design skill: your consumers' reliability depends on choices you make
here.

## Concepts

### Push vs. pull: what a webhook actually is

A **webhook** is a user-defined HTTP callback. The consumer tells you, ahead
of time, "when event X happens, POST the details to *this* URL of mine." When
X happens, your backend sends an HTTP request (almost always `POST`) to that
URL with a body describing the event. That's it — a webhook is just an
outbound HTTP request your server makes *to the consumer* when something
happens, instead of the consumer making requests *to you* on a timer.

Contrast the two models directly:

| | Polling (pull) | Webhooks (push) |
|---|---|---|
| Who initiates | Consumer, repeatedly | Producer, when event occurs |
| Latency | Up to one poll interval | Near-immediate |
| Wasted calls | Most polls find nothing | Only fires on real events |
| Load pattern | Constant, regardless of activity | Proportional to event rate |
| Consumer needs | Nothing public | A public HTTPS endpoint to receive |

The one thing polling has going for it: the consumer needs no publicly
reachable endpoint, and no delivery can be "missed" because the consumer is
always the one asking. Webhooks trade that for immediacy and efficiency, and
you buy back reliability with retries and a way to catch up on missed events
(covered below and in module 06).

### The key components of a webhook system (as the sender)

1. **Webhook URL (endpoint registration).** Consumers register one or more
   URLs with you, each subscribed to some set of event types. Store these
   (URL, secret, subscribed events, active/disabled) per consumer. Require
   HTTPS URLs — you're about to POST potentially sensitive event data to them.

2. **Event triggers.** Something in your system produces an event worth
   telling the world about: `order.shipped`, `payment.succeeded`,
   `invoice.paid`. Name events with a stable, namespaced scheme
   (`resource.past_tense_action`) so consumers can subscribe to precisely what
   they care about.

3. **Payload.** The JSON body you send. It describes *what happened* — the
   event type, when it occurred, a unique event ID, and the relevant data.

4. **HTTP method and delivery.** Webhooks are delivered as HTTP `POST` with a
   JSON body and headers that carry metadata (event type, event ID, a
   signature — module 06). Your server is the client making this request.

5. **Response handling.** The consumer's endpoint returns a status code. A
   `2xx` means "received, I've got it" — you mark the delivery successful.
   Anything else (or a timeout/connection error) means the delivery failed and
   should be **retried** (below). Crucially, you treat *only* a fast `2xx` as
   success.

### Designing the payload

A good webhook payload is self-describing and stable. Include:

- **A unique event ID** (`evt_...`). This is the single most important field
  for reliability — it lets the *receiver* deduplicate (module 06) and lets
  both sides reference a specific delivery in support conversations. Generate
  it once when the event is created; reuse it across all retries of that
  delivery.
- **The event type** (`order.shipped`) so the receiver can route without
  parsing the whole body.
- **A timestamp** of when the event occurred (helps receivers order events and
  detect replays).
- **The data** — either the full resource ("fat" payload) or just identifiers
  the receiver uses to call back and fetch the current state ("thin"/ID-only
  payload).

**Fat vs. thin payloads** is a real design choice. Fat payloads (include the
whole order object) save the receiver a round-trip but can carry stale data by
the time they're processed, and expose more data over the wire. Thin payloads
(just `order_id` + event type) are smaller and force the receiver to fetch
fresh state, but add a callback and require the receiver to have API access. A
common middle path: send key fields plus an ID, and document that the ID is
the source of truth.

```json
{
  "id": "evt_01HXYZ...",
  "type": "order.shipped",
  "created": "2026-07-27T14:03:22Z",
  "data": {
    "order_id": "ord_10432",
    "tracking": "TRK10432",
    "carrier": "UPS"
  }
}
```

### Delivery is background work with retries

Sending a webhook is an outbound HTTP call to a server you don't control,
which might be slow, down, or returning `500`. That is *exactly* the profile
of a background task (modules 00-02). **Never send a webhook inline** in the
request/transaction that produced the event — if you do, a slow or dead
consumer endpoint blocks your own request, and a failure in *their* system
becomes a failure in *yours*. Instead:

1. When the event occurs, write it to an outbox/event log and enqueue a
   delivery task.
2. A Celery task looks up all URLs subscribed to that event type and delivers
   the payload to each (often one task per (event, endpoint) so one failing
   consumer doesn't block delivery to the others).
3. On non-2xx/timeout, **retry with exponential backoff** — consumers have
   outages, and a robust sender retries over minutes and hours, not just
   seconds. Reuse the *same* event ID across retries so the receiver can
   dedupe.
4. After N failed attempts, mark the delivery failed, disable a persistently-
   dead endpoint, and surface it (a dashboard, an email to the consumer). Give
   consumers a way to see and **replay** deliveries.

This is why webhook sending sits in this track: it's the union of "background
task," "retries with backoff," and "idempotent event ID" from the first three
modules, aimed outward.

### The transactional outbox: don't fire before you commit

A subtle but critical correctness issue: if you enqueue the "order.shipped"
webhook *before* the database transaction that marks the order shipped
commits, and the transaction then rolls back, you've told the world about an
event that never actually happened. Conversely, if you commit and *then* the
process crashes before enqueuing, the event is lost. The **transactional
outbox** pattern fixes this: within the same DB transaction that changes the
state, insert a row into an `outbox` table describing the event; a separate
poller/relay reads committed outbox rows and enqueues deliveries. The event is
recorded atomically with the state change, so you never emit a webhook for a
rolled-back change and never lose one for a committed change.

```
  ONE DB transaction                        separate relay (poller)
  ┌───────────────────────────────┐
  │ UPDATE orders SET shipped=true │        reads committed
  │ INSERT INTO outbox (evt...)    │──commit─► outbox rows ──► enqueue deliver()
  └───────────────────────────────┘             │
        rolls back? BOTH vanish ─► no event      └─ nothing to relay = no webhook
  The event row and the fact commit together, or neither does.
```

## Command reference

| Concern | Approach |
|---|---|
| Register an endpoint | store (url, secret, event_types, active) per consumer |
| Emit an event | write to outbox in the same txn, then relay enqueues delivery |
| Deliver | Celery task: `requests.post(url, json=payload, headers=..., timeout=)` |
| Success criterion | consumer returns `2xx` quickly; else retry |
| Retry policy | exponential backoff over minutes/hours; cap attempts |
| Reuse across retries | same `event_id` every attempt |
| Fan-out | one delivery task per (event, endpoint) |
| Timeout | short, aggressive client timeout (e.g. 5-10s) so a slow consumer can't pin your worker |
| Replay / visibility | store deliveries + statuses; expose a "resend" action |

A sender-side delivery system — `webhooks.py`:

```python
import uuid, json, datetime, requests
from celery import Celery

app = Celery("hooks", broker="redis://localhost:6379/0",
             backend="redis://localhost:6379/1")

def emit_event(event_type: str, data: dict) -> str:
    """Called within the state-changing transaction (outbox row)."""
    event_id = f"evt_{uuid.uuid4().hex}"
    payload = {
        "id": event_id,
        "type": event_type,
        "created": datetime.datetime.utcnow().isoformat() + "Z",
        "data": data,
    }
    save_to_outbox(event_id, event_type, payload)   # same DB txn as the change
    return event_id

def relay_outbox():
    """A separate poller (module 03 scheduled job) enqueues committed rows."""
    for row in fetch_unrelayed_outbox_rows():
        for endpoint in endpoints_subscribed_to(row.event_type):
            deliver.apply_async(args=[endpoint.id, row.event_id])
        mark_relayed(row.event_id)

@app.task(
    bind=True,
    autoretry_for=(requests.RequestException,),
    max_retries=8,                 # retry over a long window
    retry_backoff=True,            # 1,2,4,8... seconds
    retry_backoff_max=3600,        # cap at 1 hour between attempts
    retry_jitter=True,
)
def deliver(self, endpoint_id, event_id):
    endpoint = get_endpoint(endpoint_id)
    if not endpoint.active:
        return "endpoint disabled"
    payload = get_payload(event_id)                 # SAME id across retries
    body = json.dumps(payload)
    headers = {
        "Content-Type": "application/json",
        "X-Webhook-Id": payload["id"],              # lets receiver dedupe
        "X-Webhook-Event": payload["type"],
        # signature header added in module 06
    }
    resp = requests.post(endpoint.url, data=body, headers=headers, timeout=8)
    record_attempt(endpoint_id, event_id, resp.status_code)
    if resp.status_code // 100 != 2:
        resp.raise_for_status()                     # non-2xx -> retry
    return "delivered"

    def on_failure(self, exc, task_id, args, kwargs, einfo):
        # exhausted all retries: flag the endpoint, surface to the consumer
        mark_delivery_failed(args[0], args[1])
        maybe_disable_endpoint(args[0])
```

Producing an event from a request handler (thin, correct):

```python
@api.post("/orders/{order_id}/ship")
def ship(order_id: str):
    with db.transaction():                         # atomic
        mark_order_shipped(order_id)
        emit_event("order.shipped", {"order_id": order_id,
                                     "tracking": tracking_for(order_id)})
    return {"status": "shipped"}                    # webhook delivered by worker later
```

## Hands-on exercises

Continue in `bg-queues`. You'll play both sender and receiver locally. Run a
throwaway receiver so you can watch deliveries arrive:

```python
# receiver.py — a stand-in consumer endpoint
from fastapi import FastAPI, Request
app = FastAPI()

@app.post("/hook")
async def hook(req: Request):
    body = await req.json()
    print("RECEIVED", body["type"], body["id"])
    return {"ok": True}          # 2xx = success
```

Run it on port 9000: `uvicorn receiver:app --port 9000`.

### 1. Deliver a webhook and see the push

Implement `deliver` and enqueue it targeting `http://localhost:9000/hook` with
a sample payload. Expected: the receiver prints `RECEIVED order.shipped
evt_...` within moments of enqueuing — the sender pushed; the receiver didn't
poll. Confirm the sender task recorded a `200`.

### 2. Contrast with polling

Write a loop that polls a `GET /order/1/status` endpoint every second for 30
seconds and count how many calls returned "no change." Expected: nearly all of
them — that wasted traffic is exactly what webhooks eliminate. Note you learned
about a change up to a second late with polling; the webhook was near-instant.

### 3. Design and inspect the payload

Send an event with a unique `id`, `type`, `created`, and a `data` object.
Confirm at the receiver that all four are present and that `id` is unique per
event. Then send the "same" logical event twice and give both the *same* `id`
(simulating a retry). Expected: the receiver sees the same `id` twice — the
hook for dedup in module 06.

### 4. Fan out to multiple endpoints

Register two receiver URLs (run the receiver on ports 9000 and 9001)
subscribed to `order.shipped`. Emit one event. Expected: one delivery task per
endpoint, both receivers print the event. Confirm that making one receiver
slow/dead doesn't stop delivery to the other (separate tasks).

### 5. Retry a failing delivery with backoff

Make the receiver return `500` for the first two calls, then `200`:

```python
_calls = {}
@app.post("/hook")
async def hook(req: Request):
    body = await req.json()
    _calls[body["id"]] = _calls.get(body["id"], 0) + 1
    if _calls[body["id"]] <= 2:
        from fastapi.responses import JSONResponse
        return JSONResponse(status_code=500, content={"err": "try later"})
    print("ACCEPTED", body["id"])
    return {"ok": True}
```

Expected: the delivery task retries with growing backoff and succeeds on the
third attempt — and every attempt carried the *same* event `id`. This is why
reusing the id matters: the receiver can tell it's the same event.

### 6. Short timeout so a slow consumer can't pin a worker

Make the receiver `await asyncio.sleep(30)` before responding. With
`timeout=8` on the sender's `requests.post`, expected: the sender gives up
after 8s, records a timeout, and retries later — it did *not* block a worker
for 30s waiting on a slow consumer. Lesson: aggressive client timeouts protect
the sender from the receiver.

### 7. Transactional outbox: don't emit on rollback

Simulate a handler that emits the event and then the transaction rolls back:

```python
try:
    with db.transaction():
        mark_order_shipped(order_id)
        emit_event("order.shipped", {...})   # writes outbox row IN the txn
        raise RuntimeError("something failed after")   # forces rollback
except RuntimeError:
    pass
```

Expected: because the outbox row was written *inside* the transaction, the
rollback removes it too, so the relay never enqueues a delivery — no webhook is
sent for an event that didn't really happen. Contrast with enqueuing directly
in the handler before commit (the bug in exercise 9).

### 8. Exhaust retries and disable a dead endpoint

Point a delivery at a URL that always returns `500`. Expected: after
`max_retries` the task fails terminally, `on_failure` marks the delivery
failed and disables the endpoint, and subsequent deliveries to it short-
circuit (`endpoint disabled`). Confirm you have a record a human could inspect
and replay.

### 9. Diagnose and fix: webhooks fired for events that didn't happen

A consumer complains: "you sent us `order.shipped` for order 55, but order 55
was never shipped — it errored out." The sender's handler:

```python
@api.post("/orders/{order_id}/ship")
def ship(order_id: str):
    deliver_shipped.delay(order_id)      # enqueue webhook FIRST
    mark_order_shipped(order_id)         # then do the DB work (which can fail)
    return {"status": "shipped"}
```

Explain the two bugs: (1) the webhook is enqueued *before* the state change,
so if `mark_order_shipped` raises (or its transaction later rolls back) the
webhook still fires for a non-event; (2) even if reordered, enqueuing directly
in the handler isn't atomic with the DB commit — a crash between commit and
enqueue loses the event. Fix with the transactional outbox: write the event to
an outbox row *inside* the same transaction as the state change, and let a
separate relay enqueue deliveries from committed rows.

<details>
<summary>Solution</summary>

```python
@api.post("/orders/{order_id}/ship")
def ship(order_id: str):
    with db.transaction():                  # atomic: both or neither commit
        mark_order_shipped(order_id)
        emit_event("order.shipped",         # writes an outbox row in the SAME txn
                   {"order_id": order_id, "tracking": tracking_for(order_id)})
    return {"status": "shipped"}
# a separate scheduled relay (module 03) reads committed outbox rows and
# enqueues deliver() tasks -- so the webhook fires only if the change committed.
```

Bug (1): enqueuing before the change means a subsequent failure/rollback
leaves a webhook already in flight for an event that never happened. Bug (2):
even "commit then enqueue" has a gap — a crash after commit but before enqueue
silently drops the event. The transactional outbox closes both: the event
record and the state change commit together (or not at all), and a durable
relay guarantees committed events eventually get delivered. This is the sender-
side analogue of the idempotency discipline from module 02 — the event's
existence is tied to the fact actually being true.

</details>

## Independent challenge

No code given. Build the sender side of a webhook system for a "document
signing" service that emits `document.signed` and `document.declined` events.
Requirements: consumers register HTTPS endpoints subscribed to specific event
types; events are emitted atomically with the state change (no webhook for a
rolled-back signature) using a transactional outbox; delivery happens in a
background task with exponential-backoff retries over a long window and a short
per-request timeout; each event carries a stable unique id reused across
retries; fan-out delivers to every subscribed endpoint independently; and a
persistently-failing endpoint gets disabled with a record a human can replay.
Prove the outbox behavior by rolling back a signature and confirming no webhook
is sent.

Reuse the background-delivery-with-retries shape from
[02-retries-prioritization-and-rate-limiting-in-queues](../02-retries-prioritization-and-rate-limiting-in-queues/README.md)
and the scheduled relay poller idea from
[03-scheduling-recurring-jobs](../03-scheduling-recurring-jobs/README.md).

<details>
<summary>Hint</summary>

Two moving parts keep it correct: `emit_event` writes only to the outbox
inside the business transaction (it never enqueues directly), and a scheduled
`relay_outbox` job reads committed rows and enqueues one `deliver` task per
(event, subscribed endpoint). The stable event id is generated in
`emit_event` and stored, so every retry of `deliver` reads and sends the same
id.

</details>

## Common mistakes & troubleshooting

- **Sending webhooks inline in the request.** A slow or dead consumer blocks
  your request/transaction; their outage becomes yours. Always deliver from a
  background task with a short timeout.
- **Emitting before the change commits.** A webhook for a rolled-back event is
  a lie your consumers act on. Use a transactional outbox so the event is
  recorded atomically with the state change.
- **New event id on each retry.** The receiver can't tell retries apart from
  genuinely new events, so it can't dedupe. Generate the id once and reuse it
  across all attempts.
- **Treating a slow `2xx` as fine.** Without a short client timeout, one slow
  consumer pins your workers. Set an aggressive timeout and retry.
- **One task delivering to all endpoints.** One dead consumer then blocks or
  fails delivery to healthy ones. Fan out to one task per (event, endpoint).
- **No retry over a long enough window.** Consumers have real outages; retrying
  only for a few seconds drops events during a 10-minute blip. Back off over
  minutes/hours and cap attempts.
- **No visibility or replay.** When a delivery ultimately fails, consumers need
  to see it and re-trigger it. Store deliveries/statuses and expose a resend.
- **Unstable event-type names.** Renaming `shipped` to `order.shipped` later
  breaks every consumer's subscription. Choose a stable, namespaced scheme up
  front.

## Checkpoint quiz

Write down your answer to each question before expanding it — checking without attempting first is the single easiest way to fool yourself into thinking you've learned this.

1. In one sentence, what is a webhook, and how does it differ from polling in
   who initiates and when?
2. Name the five key components of a webhook system from the sender's side.
3. Why must webhook delivery happen in a background task rather than inline in
   the request that produced the event?
4. What is the single most important field in a webhook payload for
   reliability, and what two things does it enable?
5. What problem does the transactional outbox pattern solve, and how?
6. What's the tradeoff between a "fat" payload (full resource) and a "thin"
   payload (IDs only)?
7. Why do you fan out to one delivery task per (event, endpoint) instead of one
   task delivering to all endpoints?

<details>
<summary>Answers</summary>

1. A webhook is a user-defined HTTP callback: the producer POSTs event data to
   a URL the consumer registered, *when* the event happens. Polling has the
   consumer repeatedly pull on a timer; webhooks have the producer push once,
   at event time.
2. The webhook URL (registered endpoint), event triggers (what produces an
   event), the payload (JSON body describing the event), the HTTP method/
   delivery (a POST with headers), and response handling (treating a fast
   `2xx` as success, else retry).
3. Because delivery is an outbound HTTP call to a server you don't control; if
   it's inline, a slow or dead consumer blocks your own request/transaction and
   their outage becomes yours. A background task with a short timeout isolates
   you and enables retries.
4. A unique, stable event ID. It enables the receiver to deduplicate
   (recognize a retried delivery as the same event) and lets both parties
   reference a specific delivery for debugging/support.
5. It prevents emitting webhooks for events that didn't really happen (and
   losing events for changes that did). You write the event to an outbox row
   inside the same DB transaction as the state change, so they commit
   atomically; a separate relay enqueues deliveries only from committed rows.
6. Fat payloads save the receiver a round-trip but can be stale by processing
   time and expose more data; thin payloads are smaller and force a fetch of
   fresh state but add a callback and require the receiver to have API access.
7. So one dead or slow consumer doesn't block or fail delivery to the healthy
   ones — each endpoint's delivery retries and succeeds/fails independently.

</details>

## Further reading & sources

- [microservices.io: Transactional Outbox pattern](https://microservices.io/patterns/data/transactional-outbox.html) - the canonical description of emitting events atomically with a state change.
- [Stripe: Webhooks](https://docs.stripe.com/webhooks) - a reference design for event objects, delivery, and retries from a major sender.
- [GitHub: About webhooks](https://docs.github.com/en/webhooks/about-webhooks) - event types, payloads, and delivery semantics from another well-known sender.
- [Stripe: Event object & types](https://docs.stripe.com/api/events) - how a self-describing event payload (id, type, created, data) is structured.
- [Celery: Retrying tasks](https://docs.celeryq.dev/en/stable/userguide/tasks.html#retrying) - the backoff-over-a-long-window retry policy webhook delivery relies on.

## Next

[06-webhooks-security-and-reliability](../06-webhooks-security-and-reliability/README.md)
— now flip to the receiving side, which is where the security lives. You'll
verify webhook signatures with HMAC (the way Stripe and GitHub do it),
acknowledge fast and process asynchronously, make receivers idempotent by
deduping on event ID, and test webhooks locally with a tunnel like ngrok.
