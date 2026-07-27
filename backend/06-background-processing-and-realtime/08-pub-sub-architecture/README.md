# Module 08: Pub/Sub Architecture

## Why this matters

Module 07 ended on a cliffhanger: a `ConnectionManager` can broadcast to
clients connected to *its own process*, but production runs many processes,
and a chat message produced on process 1 never reaches the users connected to
process 2. That gap is an instance of a general problem — **how do independent
parts of a system tell each other that something happened, without being
wired directly together?** — and the general solution is the
**publish/subscribe** (pub/sub) pattern.

Pub/sub decouples the thing that produces a message (the **publisher**) from
the things that consume it (the **subscribers**). The publisher doesn't know
or care who's listening; it just publishes to a named **channel**. Anyone
subscribed to that channel receives a copy. Add a new subscriber and the
publisher's code doesn't change. This is the backbone of event-driven
architectures, real-time fan-out, and the WebSocket backplane you need to
finish module 07.

But there's a trap that catches people who confuse pub/sub with the task
queue they learned in module 00 — and they look superficially similar (both
have "producers" and "consumers" and a broker in the middle). The critical
difference is **durability**: a classic pub/sub message is fire-and-forget,
delivered only to subscribers *connected at the moment it's published*, and
**lost forever if nobody is listening**. A task queue durably holds work until
a worker takes it. Using pub/sub where you needed a queue means silently
dropping work whenever a consumer is momentarily down — one of the nastier
"it works in the demo, loses data in production" bugs. This module builds
Redis Pub/Sub, uses it as the WebSocket backplane, and draws that line
sharply.

## Concepts

### Publishers, subscribers, channels

The model has three nouns:

- **Publisher** — code that emits a message to a named channel. It calls
  something like `redis.publish("chat:room1", message)` and moves on. It has
  no idea how many subscribers exist (zero, one, or a thousand) and gets no
  per-subscriber acknowledgment.
- **Channel (or topic)** — a named stream messages are published to and
  subscribed from. `chat:room1`, `orders:events`, `user:42:notifications`.
  Channels are the routing key: subscribers pick which channels they care
  about.
- **Subscriber** — code that subscribes to one or more channels and receives a
  copy of every message published to them *while it is subscribed*. Multiple
  subscribers to the same channel each get their own copy (that's the
  "fan-out").

The defining property is **decoupling in space and knowledge**: publishers and
subscribers don't reference each other, don't need to start in any order, and
can be added/removed independently. The channel name is the only contract
between them.

### Fan-out: one message, many consumers

The signature pattern of pub/sub is **fan-out**: one published message is
delivered to *every* current subscriber. Publish an `order.placed` event once,
and the analytics service, the fulfillment service, the fraud-check service,
and three WebSocket server processes all receive it — without the publisher
knowing any of them exist. This is why pub/sub underlies event-driven systems:
a single event can trigger many independent reactions, and you add reactions
by adding subscribers, never by editing the publisher.

Contrast this with a task queue's typical **competing-consumers** pattern,
where many workers share *one* queue and each message goes to *exactly one*
worker (so N workers split the load). Pub/sub fan-out (everyone gets a copy) vs.
queue work-sharing (one consumer gets each item) is a core distinction. Some
systems support both modes; know which one you're using.

### Redis Pub/Sub

Redis has a built-in pub/sub with a tiny API: `PUBLISH channel message` sends;
`SUBSCRIBE channel` (or `PSUBSCRIBE channel.*` for patterns) receives. It's
fast and simple, and it's the natural choice when you're already running Redis
as your Celery broker/cache.

Its defining limitation, which you *must* internalize: **Redis Pub/Sub is
fire-and-forget with no persistence.** A message published to a channel with
no current subscribers is dropped — not queued, not stored, gone. A subscriber
that disconnects and reconnects misses everything published while it was away.
There is no acknowledgment, no replay, no delivery guarantee. This is fine —
even ideal — for ephemeral real-time signals (live presence, a chat message,
a "cache invalidated" ping) where a missed message is no big deal. It is
*wrong* for anything you must not lose. (Redis also offers **Streams**, a
separate, durable, log-based structure with consumer groups and replay, for
when you need durability *and* pub/sub-like fan-out — reach for Streams or a
real log like Kafka when "lost if nobody's listening" is unacceptable.)

```python
import redis
r = redis.Redis()

# publisher
r.publish("chat:room1", "hello everyone")

# subscriber (blocking loop)
pubsub = r.pubsub()
pubsub.subscribe("chat:room1")
for message in pubsub.listen():
    if message["type"] == "message":
        handle(message["data"])
```

### The WebSocket backplane: closing module 07's gap

Here's the payoff. Each WebSocket server process runs a `ConnectionManager`
for its *local* connections and also (a) **subscribes** to a shared Redis
channel and (b) **publishes** every outgoing broadcast to that channel instead
of sending directly. When any process publishes a chat message, *every*
process — including itself — receives it via the subscription and forwards it
to its local connections. Now a message from a client on process 1 reaches
clients on process 2, 3, and 4.

```
client A --ws--> [process 1] --publish--> Redis channel --> [process 2] --ws--> client B
                     ^                        (fan-out)          |
                     +----------- subscribe ------------- subscribe
```

The local `ConnectionManager` from module 07 still owns per-connection
lifecycle and cleanup (the leak discipline still applies); Redis Pub/Sub is
purely the *cross-process delivery* layer. This is the standard way real-time
apps scale past one process, and it's exactly why "it worked on my single dev
process but broke in production with multiple workers" is such a common
report.

### Message bus vs. durable task queue: the distinction that matters

This is the concept most worth getting crisp, because pub/sub and a task queue
*look* alike (broker in the middle, producers, consumers) but make opposite
promises:

| | Pub/Sub message bus (Redis Pub/Sub) | Durable task queue (Celery/Redis-as-broker) |
|---|---|---|
| Delivery | Fire-and-forget | At-least-once, held until acked |
| No consumer available | Message **lost** | Message **waits** in the queue |
| Fan-out | Every subscriber gets a copy | One worker gets each task |
| Retries/ack | None | Yes (redelivery on failure) |
| Ordering/replay | None | Limited, but work isn't dropped |
| Use it for | Ephemeral real-time signals | Work that must not be lost |

The decision rule: **if losing the message is acceptable when no one's
listening, pub/sub is fine; if the work must eventually happen no matter what,
use a durable queue.** "Notify connected dashboards that a metric changed" —
pub/sub (a disconnected dashboard just gets the next update). "Charge the
customer's card" — queue (must happen even if every worker is restarting).
Some events want *both*: emit a durable task to do the work *and* publish an
ephemeral pub/sub signal to update live UIs.

### At-most-once vs. at-least-once, and idempotency's role

Framed in delivery-semantics terms: Redis Pub/Sub gives **at-most-once**
(you get it zero or one times — never redelivered, so never duplicated, but
possibly missed). A task queue gives **at-least-once** (you get it one or more
times — never missed, but possibly duplicated, which is why module 02's
idempotency matters). There is no free lunch; you pick which failure mode is
acceptable for each message type. Real-time UI signals prefer at-most-once
(a missed frame is invisible; a duplicated one might flicker); money and
provisioning prefer at-least-once with idempotent handling.

## Command reference

| Concern | Redis command / API |
|---|---|
| Publish | `redis.publish("channel", data)` |
| Subscribe (exact) | `pubsub.subscribe("channel")` |
| Subscribe (pattern) | `pubsub.psubscribe("orders.*")` |
| Receive loop | `for m in pubsub.listen(): ...` (filter `m["type"] == "message"`) |
| Async receive | `async for m in pubsub.listen():` (redis.asyncio) |
| Unsubscribe | `pubsub.unsubscribe("channel")` |
| Durable + fan-out | Redis **Streams** (`XADD`/`XREADGROUP`) or Kafka |
| Durable work (one consumer) | a task queue (Celery), not pub/sub |

A multi-process WebSocket chat with a Redis backplane — `chat_scaled.py`:

```python
import asyncio, json
import redis.asyncio as aioredis
from fastapi import FastAPI, WebSocket, WebSocketDisconnect

app = FastAPI()
CHANNEL = "chat:global"

class LocalManager:
    """Owns THIS process's connections (module 07 lifecycle/cleanup)."""
    def __init__(self):
        self.active: set[WebSocket] = set()
    async def connect(self, ws): await ws.accept(); self.active.add(ws)
    def disconnect(self, ws): self.active.discard(ws)
    async def send_local(self, msg: str):
        for ws in list(self.active):
            try: await ws.send_text(msg)
            except Exception: self.disconnect(ws)

manager = LocalManager()
_redis = aioredis.Redis()

@app.on_event("startup")
async def start_backplane():
    # One subscriber per process, forwarding channel messages to local sockets.
    async def relay():
        pubsub = _redis.pubsub()
        await pubsub.subscribe(CHANNEL)
        async for m in pubsub.listen():
            if m["type"] == "message":
                await manager.send_local(m["data"].decode())
    asyncio.create_task(relay())

@app.websocket("/ws/chat")
async def chat(ws: WebSocket):
    await manager.connect(ws)
    try:
        while True:
            text = await ws.receive_text()
            # PUBLISH (don't send_local directly) so ALL processes fan it out.
            await _redis.publish(CHANNEL, f"user: {text}")
    except WebSocketDisconnect:
        pass
    finally:
        manager.disconnect(ws)        # local cleanup still mandatory
```

Emitting an event to both a durable queue and an ephemeral bus:

```python
def order_placed(order_id):
    # 1. Durable work that MUST happen -> task queue (survives worker downtime)
    process_order.delay(order_id)
    # 2. Ephemeral live-UI signal -> pub/sub (fine to miss if no dashboard open)
    _redis.publish("orders:live", json.dumps({"type": "placed", "id": order_id}))
```

## Hands-on exercises

Continue in `bg-queues`, Redis running. `pip install "redis>=4.2"` (includes
`redis.asyncio`).

### 1. Publish and subscribe by hand

In one terminal, `redis-cli SUBSCRIBE chat:room1`. In another,
`redis-cli PUBLISH chat:room1 "hello"`. Expected: the subscriber prints the
message. Open a *second* subscriber and publish again. Expected: **both**
subscribers receive it — fan-out. This is the whole pattern in two commands.

### 2. Prove messages are lost with no subscriber

With **no** subscriber running, `redis-cli PUBLISH chat:room1 "anyone?"`.
Expected: `PUBLISH` returns `(integer) 0` — the count of subscribers that
received it: zero. The message is gone; nothing stored it. Now subscribe and
publish again: returns `1`. Lesson: Redis Pub/Sub delivers only to *current*
subscribers; publish-to-nobody is a silent drop.

### 3. Contrast with a task queue holding work

Recall module 00 exercise 3: with no Celery worker running, enqueue tasks and
confirm they *wait* in the broker (`LLEN`), then run when a worker starts.
Expected: unlike exercise 2, the queued work is not lost — it persisted until a
consumer appeared. Write one sentence contrasting the two behaviors. This is
the distinction the whole module hinges on.

### 4. Pattern subscriptions

Subscribe with `PSUBSCRIBE user.*` and publish to `user.42`, `user.99`.
Expected: the pattern subscriber receives both. Use this for routing (e.g.
one subscriber handling all `orders.*` events). Note the message includes
which concrete channel it came from.

### 5. Build the WebSocket backplane

Run `chat_scaled.py` as **two** separate processes on different ports
(`uvicorn chat_scaled:app --port 8001` and `--port 8002`). Connect one client
to each. Send a message from the client on 8001. Expected: **both** clients
see it — the message was published to Redis, both processes' relay tasks
received it, and each forwarded to its local socket. You've just closed module
07's multi-process gap.

### 6. Remove the backplane and reproduce the bug

Temporarily change the WebSocket handler to `await manager.send_local(...)`
directly instead of `_redis.publish(...)`. Re-run the two processes and two
clients. Expected: a client on 8001 only sees messages from other clients on
8001 — the client on 8002 is invisible to it. This is the exact "works on one
process, breaks on many" bug. Restore the publish version and confirm it's
fixed.

### 7. Local cleanup still matters with a backplane

With the backplane version running, connect and kill clients while watching a
`/count` endpoint (per process). Expected: the local `LocalManager` still must
unregister in `finally` — the backplane didn't remove the leak discipline from
module 07; it only added cross-process delivery. Confirm counts return to zero
on disconnect.

### 8. Emit to both a queue and a bus

Implement `order_placed` from the reference. Kill all Celery workers and all
pub/sub subscribers, then call `order_placed(1)`. Restart a worker. Expected:
the *task* runs (it waited in the durable queue) but the pub/sub live-UI signal
was lost (no subscriber at publish time). Exactly the intended split: the work
that must happen happened; the ephemeral signal was disposable.

### 9. Diagnose and fix: critical work silently dropped

A team built order processing on Redis Pub/Sub: the API publishes
`orders:process` and a subscriber process does the charging. Under normal load
it works; during a deploy (when the subscriber restarts) some orders "just
never get charged, with no error anywhere." Explain the root cause and give
the fix.

<details>
<summary>Solution</summary>

Root cause: Redis Pub/Sub is fire-and-forget with no persistence. During the
deploy, the subscriber (the charging consumer) is momentarily down, so any
`orders:process` message published in that window is delivered to zero
subscribers and **dropped** — no queue held it, no retry, no error, because
"no subscribers" is a normal `PUBLISH` outcome (it just returns `0`). Those
orders are never charged.

Fix: charging is durable work that must happen regardless of consumer
availability, so it belongs on a **task queue**, not a pub/sub bus. Replace
`redis.publish("orders:process", ...)` with `charge_order.delay(order_id)` on
a Celery (durable) queue: the message then waits in the broker through the
deploy and is processed (with at-least-once delivery + idempotency from module
02) when the worker returns. If the team *also* wants live dashboards updated,
keep a *separate* pub/sub publish for that ephemeral signal — but never carry
must-not-lose work over fire-and-forget pub/sub. Lesson: pub/sub for
disposable real-time signals, durable queue for work you can't afford to lose.

</details>

## Independent challenge

No code given. Build a real-time "live order feed" for an ops dashboard:
whenever an order is placed, (1) the order must be *processed* (charge +
fulfill) reliably even if every consumer is restarting during a deploy, and
(2) any currently-open dashboard should see the order appear on a live feed
within a moment — but a dashboard that's closed doesn't need to catch up on
what it missed. Choose the right transport for each of the two requirements and
justify it in terms of durability. Make the live feed work correctly when the
WebSocket/SSE layer runs as multiple processes. Prove the split by taking the
processing consumer down during a burst of orders and confirming none are lost,
while confirming a dashboard that was closed during the burst does *not* replay
the missed feed items.

Requirement (1) is durable work — the task-queue discipline from
[00-task-queues-fundamentals](../00-task-queues-fundamentals/README.md) and
[02-retries-prioritization-and-rate-limiting-in-queues](../02-retries-prioritization-and-rate-limiting-in-queues/README.md).
Requirement (2) is an ephemeral fan-out — pub/sub plus the multi-process
backplane, feeding the connection-manager layer from
[07-websockets-and-server-sent-events](../07-websockets-and-server-sent-events/README.md).

<details>
<summary>Hint</summary>

Two transports, deliberately: `process_order.delay(order_id)` on a durable
Celery queue for requirement (1) (it waits through the deploy — nothing lost),
and `redis.publish("orders:live", ...)` for requirement (2) (a closed
dashboard simply misses those messages, which is the accepted behavior). The
multi-process live feed needs each WebSocket/SSE process to subscribe to
`orders:live` and forward to its local connections — the backplane from
exercise 5.

</details>

## Common mistakes & troubleshooting

- **Using pub/sub for work that must not be lost.** Fire-and-forget drops
  messages published while no subscriber is connected (e.g. during a deploy).
  Use a durable task queue for must-happen work; pub/sub only for disposable
  real-time signals.
- **Confusing fan-out with work-sharing.** Pub/sub delivers a copy to *every*
  subscriber; a task queue gives each item to *one* worker. If you run N
  pub/sub subscribers expecting them to split the load, they each do all of it.
- **Expecting redelivery or acks from Redis Pub/Sub.** There are none — it's
  at-most-once. If you need retries/replay/durability, use Redis Streams or a
  log like Kafka, or a task queue.
- **Broadcasting directly instead of via the backplane in multi-process
  deployments.** Sending only to local connections means clients on other
  processes never receive the message. Publish to a shared channel every
  process subscribes to.
- **Thinking the backplane removes the connection-cleanup discipline.** The
  local connection manager still must unregister on every disconnect path
  (module 07's leak). The backplane only adds cross-process delivery.
- **A slow/blocking subscriber loop.** A subscriber that does heavy work
  in-line delays all subsequent messages on that subscription. Hand slow work
  to a task and keep the subscribe loop tight.
- **Ignoring reconnect gaps.** A subscriber that reconnects misses everything
  published while it was away; if that matters, you needed durability
  (Streams/queue), not plain pub/sub.

## Checkpoint quiz

Write down your answer to each question before expanding it — checking without attempting first is the single easiest way to fool yourself into thinking you've learned this.

1. Define publisher, subscriber, and channel, and state the property that makes
   pub/sub "decoupled."
2. What happens to a message published to a Redis Pub/Sub channel that has no
   current subscribers, and what does `PUBLISH` return?
3. State the core difference between pub/sub fan-out and a task queue's
   competing-consumers model.
4. Give the one-line decision rule for choosing a pub/sub bus vs. a durable
   task queue, with an example of each.
5. How does a Redis Pub/Sub backplane let a multi-process WebSocket app
   broadcast to all clients, and what module-07 responsibility does it *not*
   replace?
6. Redis Pub/Sub is "at-most-once" and a task queue is "at-least-once."
   Explain both terms and which failure mode each accepts.
7. A team's critical order-charging (built on pub/sub) loses orders during
   deploys with no errors. Why, and what's the fix?

<details>
<summary>Answers</summary>

1. A publisher emits messages to a named channel without knowing who listens; a
   subscriber receives copies of messages on channels it has subscribed to; a
   channel is the named stream that routes between them. It's decoupled because
   publishers and subscribers never reference each other, can start in any
   order, and can be added/removed independently — the channel name is the only
   contract.
2. It's dropped — delivered to zero subscribers and not stored anywhere.
   `PUBLISH` returns the integer count of subscribers that received it, which
   is `0` in that case (a normal, non-error outcome).
3. Pub/sub fan-out delivers a copy of each message to *every* current
   subscriber; a task queue's competing consumers share one queue so each
   message goes to *exactly one* worker (N workers split the load).
4. If losing the message when no one is listening is acceptable, use pub/sub
   (e.g. "notify open dashboards a metric changed"); if the work must happen
   regardless, use a durable queue (e.g. "charge the customer's card").
5. Each process subscribes to a shared Redis channel and publishes its outgoing
   broadcasts there instead of sending only locally; every process's subscriber
   receives the message and forwards it to its local connections, so a message
   from any process reaches clients on all processes. It does *not* replace the
   per-connection lifecycle/cleanup (the leak discipline) — the local manager
   must still unregister on every disconnect path.
6. At-most-once: a message is delivered zero or one times — never duplicated
   but possibly missed (Redis Pub/Sub). At-least-once: delivered one or more
   times — never missed but possibly duplicated, hence the need for idempotency
   (task queue). Real-time signals accept possibly-missed; must-happen work
   accepts possibly-duplicated.
7. Because pub/sub is fire-and-forget: while the charging subscriber restarts
   during a deploy, messages published in that window reach zero subscribers
   and are silently dropped (no queue, no retry, `PUBLISH` returns `0`
   normally). Fix: move charging to a durable task queue (`.delay()`) so the
   work waits through the deploy and is processed with at-least-once delivery +
   idempotency; keep pub/sub only for the ephemeral live-UI signal if desired.

</details>

## Next

[09-object-storage-and-large-files](../09-object-storage-and-large-files/README.md)
— the last building block before the capstone. You'll handle large files the
right way: why they don't belong in your database, object storage (S3-style)
concepts, multipart uploads in FastAPI, chunked/streamed downloads, and
presigned URLs that let clients upload and download directly to storage
without proxying gigabytes through your API.
