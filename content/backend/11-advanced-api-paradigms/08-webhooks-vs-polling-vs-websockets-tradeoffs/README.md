# Module 05: Webhooks vs Polling vs WebSockets — Tradeoffs

## Why this matters

You now know gRPC and GraphQL in depth, and module 00 gave you the four-paradigm
map. This module fills the last quadrant of that map — **server-initiated /
continuous communication** — but from a very specific angle. Track 06
(background-processing-and-realtime) already teaches the *mechanics* of webhooks,
WebSockets, SSE, and pub/sub in depth: how to sign a webhook payload with HMAC,
how to broadcast to many WebSocket clients without leaking connections, how to
fan out across processes with Redis. This module does **not** re-teach any of
that. What it teaches is the **decision**: given a particular consumer with a
particular need to be kept up to date, which delivery mechanism do you expose to
them — and when is "just poll a REST endpoint" the correct, boring answer?

That decision is where teams actually go wrong. The failure isn't usually a bad
HMAC implementation; it's reaching for WebSockets because they sound modern when
the consumer would have been perfectly happy polling every 30 seconds, or
building a polling loop that hammers your database every second when a webhook
would have delivered the one event that mattered. Each mechanism trades away
something real — freshness, server cost, client complexity, deliverability
guarantees, or firewall-friendliness — and the right choice falls out of *who
the consumer is and how fresh they truly need to be*, exactly the consumer-first
reasoning from module 00.

This is deliberately a **short** module. It's a framework, not a new technology.
By the end you should be able to look at "the partner needs to know when an
order ships" versus "the trader needs live price ticks" versus "the dashboard
should refresh every so often" and name the mechanism — and its cost — without
hesitation, then hand the implementation off to track 06.

## Concepts

### The three (plus one) mechanisms, and what "server-initiated" really means

Everything here is a way to answer "how does the consumer find out that
something changed?" There are two client-initiated options and two
server-initiated ones:

- **Polling** — the consumer *asks* on a timer: `GET /orders/123` every N
  seconds and diffs the result. Client-initiated, pull. Dead simple, works over
  plain REST with zero new infrastructure, and it's what you should reach for
  first. Its cost is wasted work: most polls return "nothing changed," and
  freshness is bounded by the interval.
- **Long polling** — a middle option: the client makes a request that the server
  *holds open* until there's something to report (or a timeout), then the client
  immediately re-requests. Client-initiated in shape, but pushes latency down to
  near-real-time without a persistent bidirectional socket. The historical
  bridge before WebSockets; still useful where sockets are awkward.
- **Webhooks** — the server makes an outbound HTTP `POST` to a URL the consumer
  registered, when an event happens. Server-initiated, push, but between
  *servers*: the consumer must be a publicly reachable HTTP endpoint. Best for
  server-to-server event notification ("order.shipped", "payment.succeeded").
  Track 06 owns the sender/receiver mechanics (retries, HMAC, idempotency).
- **WebSockets / SSE** — a persistent connection over which the server pushes
  messages as they happen, typically to a *browser or app*. Server-initiated,
  push, to a client that can't receive an inbound HTTP call. WebSockets are
  bidirectional; SSE is server→client only and simpler. Track 06 owns the
  connection-lifecycle and broadcast mechanics.

```text
  POLL       consumer ── GET? ──► server      pull, on a timer (most say "no change")
             consumer ◄─ 304 ── server

  WEBHOOK    server ── POST event ──► consumer   push, server-to-server
             (needs consumer to have a public URL)

  SSE / WS   client ── open connection ──► server
             client ◄══ push ══ server         push, to a browser/app that
                                               can't be called inbound
  routing question: CAN THE CONSUMER RECEIVE AN INBOUND CALL?
     yes (a server w/ URL) -> webhook possible | no (browser/app) -> poll or hold open SSE/WS
```

The one distinction that organizes all of this: **can the consumer receive an
inbound connection?** Another server with a public URL can — so a webhook works.
A browser tab or a mobile app behind NAT cannot — so it must *hold open* a
connection it initiated (WebSocket/SSE) or poll. That single question routes most
decisions.

### Polling: the correct default, and its real costs

Polling is the REST-native answer, and module 00's discipline applies directly:
don't add a real-time mechanism before the pain exists. Polling wins whenever the
consumer's freshness tolerance is loose relative to how often things actually
change. Its costs are precise and worth naming:

- **Wasted requests.** If 95% of polls return "no change," you're paying request
  overhead, auth, and a database read for nothing — multiplied by every consumer
  and every interval tick. This is the cost that grows with scale.
- **Bounded freshness.** A 30-second interval means up to 30 seconds of
  staleness. Fine for "has my export finished?", unacceptable for a live trade.
- **The tightening trap.** Teams "fix" staleness by shrinking the interval to 1s,
  which multiplies server load by 30× to shave latency — at which point a push
  mechanism is almost always cheaper. If you find yourself polling faster than a
  few seconds, that's the signal to switch.

Mitigations keep polling viable longer: **conditional requests** (`ETag` /
`If-None-Match`, `Last-Modified` / `If-Modified-Since`) let the server answer
`304 Not Modified` cheaply without serializing a body — the track-02 caching
discipline directly reduces poll cost. And **rate limiting** (track 06 / track
02) protects you from a consumer that polls too aggressively.

### Webhooks: server-to-server push, and why "at-least-once" shapes everything

A webhook is the right tool when the consumer is *another server* that wants to
know about discrete events without polling you. You call *them*. This inverts the
usual dependency — now your reliability depends on *their* endpoint being up — and
that inversion drives every webhook design decision, all of which track 06 covers
in depth:

- **Delivery is at-least-once, never exactly-once.** Networks fail after the
  receiver committed but before it acked, so senders retry and receivers see
  duplicates. Receivers must be **idempotent** (dedupe on an event id). This is
  the same idempotency discipline from track 06's queue and webhook modules.
- **The receiver must be reachable and authenticated.** The consumer exposes a
  public URL; the sender signs payloads (HMAC) so the receiver can verify
  authenticity and reject replays. You're trusting an outbound call to reach the
  open internet.
- **Ack fast, work later.** A receiver should validate, enqueue, and return `2xx`
  quickly — doing slow work inline risks the sender timing out and retrying.
  That's the "return fast, process off the request path" theme of track 06.

The decision-level point: webhooks give near-real-time server-to-server
notification with no polling waste, at the cost of requiring the consumer to run
and secure an endpoint, and of at-least-once semantics both sides must handle.
Great for partners and integrations; useless for a browser (a web page can't
receive an inbound `POST`).

### WebSockets and SSE: pushing to a client that can't be called

When the consumer is a **browser or mobile app** — something that can't accept an
inbound connection — and it needs low-latency, ongoing updates, the client opens
a persistent connection to you and the server pushes over it. Two flavors, and
the choice between them is itself a tradeoff:

- **SSE (Server-Sent Events)** — one-way, server→client, over a plain long-lived
  HTTP response. Simpler, auto-reconnects, works through most proxies, is enough
  for "stream me updates" (notifications, live feed, progress). Prefer it when you
  don't need the client to send messages over the same channel.
- **WebSockets** — full-duplex, both directions over one connection. Needed for
  genuinely interactive/bidirectional cases (chat, collaborative editing, live
  cursors, a game). More moving parts and less proxy-friendly than SSE.

Both share the costs track 06 dwells on: a **persistent connection per client**
consumes server resources and must be cleaned up on disconnect (the connection
leak), and neither fans out across processes without a **shared pub/sub backend**
(Redis) behind it. That standing cost is exactly why you don't reach for them
when the consumer's freshness need is loose — polling has no idle cost per
consumer, WebSockets do. And recall from module 04 that **GraphQL subscriptions**
are this same push-over-persistent-connection idea wearing a GraphQL schema:
choose them when your client already speaks GraphQL and wants live fields in the
typed graph, plain WebSockets/SSE when it doesn't.

### The decision framework

Walk these in order; the first strong signal usually decides it. This mirrors
module 00's consumer-first framework, specialized to "keeping a consumer up to
date":

1. **Can the consumer receive an inbound HTTP call?** Another server with a
   public URL → a **webhook** is on the table. A browser/app behind NAT → it
   must **poll** or hold open a **WebSocket/SSE**; a webhook is impossible.
2. **How fresh does the consumer truly need to be?** Seconds-to-minutes of
   staleness acceptable → **polling** (cheapest, simplest, REST-native).
   Sub-second / "the moment it happens" → a **push** mechanism.
3. **How often does the thing actually change vs how often you'd poll?** Rare
   changes but you'd poll constantly → push (webhook/SSE) eliminates the waste.
   Frequent changes and a loose interval → polling is fine and simple.
4. **Is it discrete events or a continuous stream?** Discrete server-to-server
   facts ("order.shipped") → **webhook**. A continuous stream to a UI (ticks,
   progress, a live feed) → **SSE**; if the client also needs to *send* over the
   same channel (chat, collaboration) → **WebSocket**.
5. **What operational cost can you carry?** Push mechanisms add standing cost —
   an endpoint the consumer must run and you must secure (webhooks), or a
   persistent connection and pub/sub backend you must operate and scale
   (WebSockets/SSE). If none of the above forced a push, **poll** — don't buy
   that cost speculatively (module 00).

If no question produces a strong signal, **poll a REST endpoint.** It's the
correct low-cost default here, just as REST is in module 00.

## Command reference

This module is a decision framework, so the "commands" are the routing questions
and small illustrations of each mechanism's *shape* — the deep implementations
live in track 06. Study the tradeoffs table first.

| Mechanism | Direction | Consumer must… | Freshness | Idle cost | Best for |
|---|---|---|---|---|---|
| Polling | Client pull | Run a timer, call REST | Bounded by interval | None per consumer | Loose freshness, simple integrations |
| Long polling | Client pull (held) | Re-request on each reply | Near real-time | Held request per consumer | Push-like without sockets |
| Webhook | Server push (S2S) | Expose + secure a public URL | Near real-time | None until an event | Server-to-server event notification |
| SSE | Server push (→client) | Hold open one HTTP stream | Real-time | 1 connection/consumer | One-way live feed to a browser/app |
| WebSocket | Server push (duplex) | Hold open a socket | Real-time | 1 connection/consumer | Bidirectional/interactive UIs |
| GraphQL subscription | Server push (→client) | Speak GraphQL over WS | Real-time | 1 connection/consumer | Live fields in a GraphQL client (mod 04) |

Polling with conditional requests, so most polls are cheap (track-02 caching):

```python
# FastAPI: cheap polling via ETag — the 95% "nothing changed" case costs no body
from fastapi import FastAPI, Response, Request

app = FastAPI()

@app.get("/orders/{order_id}")
def get_order(order_id: int, request: Request, response: Response):
    order = db.get_order(order_id)
    etag = f'"{order.version}"'                       # cheap change token
    if request.headers.get("if-none-match") == etag:
        return Response(status_code=304)              # no body serialized — cheap poll
    response.headers["ETag"] = etag
    return order
```

A webhook is just an outbound POST when a fact occurs (sender side; track 06 adds
retries + HMAC):

```python
# The server calls the CONSUMER when something happens — no polling on their side
import httpx

async def on_order_shipped(order, subscription_url: str):
    payload = {"event": "order.shipped", "id": order.id, "shipped_at": str(order.shipped_at)}
    # track 06: sign with HMAC, retry with backoff, dedupe key = event id
    async with httpx.AsyncClient() as client:
        await client.post(subscription_url, json=payload, timeout=5)
```

SSE pushes a one-way stream to a browser that can't be called inbound:

```python
# FastAPI SSE: the browser opens this and the server streams events (track 06 owns lifecycle)
from fastapi.responses import StreamingResponse

@app.get("/orders/{order_id}/events")
async def order_events(order_id: int):
    async def stream():
        async for event in order_event_source(order_id):   # some async source
            yield f"data: {event.json()}\n\n"               # SSE frame
    return StreamingResponse(stream(), media_type="text/event-stream")
```

## Hands-on exercises

These are analysis-and-design exercises with a couple of small builds. The point
is the *routing decision*; implementations lean on track 06. Write your reasoning
down — you'll reuse it in module 07 and the capstone.

### 1. Route five consumers

For each, name the mechanism and one sentence why: (a) a partner backend that
wants to know when a shipment's status changes, (b) a browser dashboard that
should show the latest order count "within a minute or so," (c) a trading UI that
needs live price ticks, (d) a chat feature between two users, (e) a mobile app
checking whether a background export has finished. Expected: (a) webhook, (b)
polling, (c) SSE/WebSocket, (d) WebSocket, (e) polling.

### 2. Apply the "can it be called inbound?" test

For consumers (a)–(e) above, answer only the first framework question — can this
consumer receive an inbound HTTP call? — and note how the answer alone rules out
one whole class of mechanism for the browser/mobile cases. Expected: only the
partner backend (a) can receive inbound; the rest are browsers/apps, so webhooks
are off the table for them regardless of freshness.

### 3. Make polling cheap

Take a `GET /jobs/{id}` endpoint a client polls every 5 seconds. Add `ETag` /
`If-None-Match` so unchanged polls return `304` with no body. Measure (or reason
about) the bytes and DB work saved when the job hasn't changed. Expected: the
common "still running" poll returns `304` and serializes no payload — most poll
traffic gets cheap.

### 4. Find the tightening-trap threshold

A consumer needs order status "as fresh as possible" and you're considering
polling. Sketch server load (requests/sec across 10,000 consumers) at a 30s, 5s,
and 1s interval. State the interval below which you'd switch to a push mechanism
and why. Expected: load scales inversely with interval (≈333 → 2,000 → 10,000
rps); somewhere around a few seconds the push mechanism becomes cheaper than the
waste — that's the switch signal.

### 5. Webhook vs SSE for the same event

"Notify me when my report is ready." Design it once for a **partner backend** and
once for a **logged-in browser user**. Name the mechanism for each and why they
differ despite being "the same event." Expected: partner → webhook (it can
receive an inbound POST); browser → SSE or poll (it can't, so it holds a
connection open or polls).

### 6. Choose SSE or WebSocket

For each, pick SSE or WebSocket and justify with the one-way-vs-bidirectional
test: (a) a live "orders shipped today" counter, (b) a collaborative whiteboard,
(c) a notifications bell, (d) a multiplayer game lobby. Expected: (a) SSE, (b)
WebSocket, (c) SSE, (d) WebSocket — bidirectional/interactive needs WebSocket;
one-way feeds take the simpler SSE.

### 7. Bridge to GraphQL subscriptions

Your client already talks to a GraphQL BFF (module 04) and now needs live
comment updates on a post. Decide between a plain WebSocket/SSE channel and a
GraphQL **subscription**, and justify. Expected: a GraphQL subscription — the
client already speaks GraphQL and wants a live *field* in the same typed schema,
so a separate socket protocol is redundant (module 04's subscription concept).

### 8. Diagnose and fix

A team is unhappy with this setup. Name the mismatch and prescribe the fix:

> "Our public status page shows whether each of our 12 services is up. The
> browser polls `GET /status` every second so it feels live. `/status` runs 12
> health checks on each call. With ~40,000 concurrent visitors we're doing
> ~40,000 requests/sec, each firing 12 checks, and our health-check subsystem is
> melting. We also added a second polling loop at 500ms because a VP said it
> 'still felt laggy.'"

<details>
<summary>Solution</summary>

**The mismatch:** they're using sub-second **polling** to simulate push, at
massive fan-out, for data that changes rarely (a service flips up/down maybe a
few times a day). Every 1s tick pays full request + 12 health checks × 40,000
consumers to almost always report "no change" — the classic tightening trap
(exercise 4) taken to its extreme, and tightening it further (500ms) doubled the
self-inflicted load without addressing the cause.

**The fixes, in order of leverage:**
1. **Stop recomputing per request.** Health status should be computed on a
   backend timer (once every few seconds, centrally) and cached; the endpoint
   reads the cached value. 40,000 requests no longer trigger 480,000 checks.
2. **Push instead of poll.** Status changes are rare discrete events to a
   browser that can't be called inbound → **SSE**: the browser opens one stream
   and the server pushes only when a service actually flips. Idle cost is a held
   connection, but zero recompute-per-poll and true real-time. (Fan-out across
   processes uses a shared pub/sub backend — track 06.)
3. If you must stay on polling short-term, add **`ETag`/`304`** and a sane
   interval (10–30s) so unchanged polls are cheap — but the real answer is push
   for rare events at high fan-out.

Lesson: polling faster to feel "live" is the anti-pattern the framework warns
against — when changes are rare and consumers are many, a push mechanism (here
SSE) is both fresher *and* cheaper. The VP's "laggy" complaint is a signal to
switch mechanisms, not to shrink the interval.

</details>

## Independent challenge

No code given. Revisit the **event-ticketing platform** you designed an API
strategy for in the **module 00** independent challenge. It had partners (public
API), a web and mobile app, internal services, and a requirement that buyers see
seat availability update live. Now produce the **"keeping consumers up to date"
plan** specifically: for each consumer that needs to know about changes — a
partner tracking ticket sales, a buyer watching a seat map, an internal
`notifications-service` reacting to `payment.succeeded`, and an operations
dashboard showing venue fill rates — name the mechanism (poll / webhook / SSE /
WebSocket / GraphQL subscription), justify it against the five framework
questions, and explicitly call out one place where you'd *resist* a push
mechanism because polling is good enough.

<details>
<summary>Hint</summary>

Route each edge by the first framework question — can it receive an inbound
call? Partners and the internal `notifications-service` are servers with URLs →
**webhooks** for discrete events (sales, `payment.succeeded`). The buyer's seat
map is a browser needing sub-second, high-churn updates it can't be called for →
**SSE** (one-way feed) or a **GraphQL subscription** if the app already talks to
your GraphQL BFF (module 04). The operations dashboard is the "resist push" case:
venue fill rates that refresh every 15–30s are perfectly served by cheap
`ETag`-conditional **polling** — a persistent connection per ops user would buy
standing cost for freshness nobody needs, the exact premature-complexity trap
from module 00. Hand every mechanism's implementation to track 06.

</details>

## Common mistakes & troubleshooting

- **Reaching for WebSockets because they sound modern.** They carry a standing
  per-consumer connection cost and need a pub/sub backend to scale. If the
  freshness need is loose, polling has zero idle cost and is simpler — don't buy
  real-time you don't need (module 00).
- **Tightening the poll interval to fake real-time.** Sub-second polling to shave
  latency multiplies server load to keep answering "no change." Past a few
  seconds, switch to push — that's the signal, not a reason to poll harder.
- **Trying to webhook a browser.** A web page or mobile app can't receive an
  inbound `POST`. Server-to-server → webhook; to a browser/app → it must poll or
  hold open a WebSocket/SSE. The "can it be called inbound?" test settles it.
- **Polling without conditional requests.** Skipping `ETag`/`If-None-Match` makes
  every poll serialize a full body and hit the datastore even when nothing
  changed — the cheap `304` path is the difference between viable and wasteful
  polling (track 02 caching).
- **Treating webhook delivery as exactly-once.** It's at-least-once; receivers
  see duplicates and must dedupe by event id (track 06). Assuming exactly-once is
  how you double-charge someone.
- **Using a WebSocket where SSE suffices.** If the client only *receives*, SSE is
  simpler, proxy-friendlier, and auto-reconnects. Reserve WebSockets for genuine
  bidirectional/interactive needs.
- **Forgetting connection cleanup and cross-process fan-out.** Persistent
  connections leak without disconnect handling and don't broadcast across
  processes without Redis pub/sub — both are track-06 mechanics, but they're the
  standing cost you're signing up for when you choose push.

## Checkpoint quiz

Write down your answer to each question before expanding it — checking without attempting first is the single easiest way to fool yourself into thinking you've learned this.

1. What single question about the consumer rules a webhook in or out, and why?
2. Polling is the default here. Name its two main costs and the two mitigations
   that keep it viable longer.
3. Describe the "tightening trap" and the signal that tells you to switch from
   polling to push.
4. Why is webhook delivery at-least-once, and what does that force the receiver
   to do?
5. Give the test that decides SSE vs WebSocket, with one example on each side.
6. When would you choose a GraphQL subscription over a plain WebSocket/SSE for a
   live update?

<details>
<summary>Answers</summary>

1. **Can the consumer receive an inbound HTTP call?** A webhook is the server
   calling the consumer, so the consumer must be a publicly reachable endpoint —
   another server with a URL qualifies; a browser or mobile app behind NAT can't
   receive an inbound `POST`, so it must poll or hold open a WebSocket/SSE
   instead.
2. Costs: **wasted requests** (most polls return "nothing changed," multiplied by
   consumers × interval) and **bounded freshness** (staleness up to one
   interval). Mitigations: **conditional requests** (`ETag`/`If-None-Match` →
   cheap `304`s) and **rate limiting** to cap aggressive pollers.
3. The tightening trap: shrinking the poll interval (e.g. to 1s or 500ms) to make
   data feel live, which multiplies server load to keep answering "no change"
   without addressing the cause. The signal to switch to push: when you're
   polling faster than every few seconds — at that point a push mechanism is
   usually both fresher and cheaper.
4. Because a network can fail after the receiver has committed but before its ack
   reaches the sender, so senders retry and receivers see **duplicates**. That
   forces the receiver to be **idempotent** — dedupe on the event id so a
   redelivered event has no additional effect (track 06).
5. Test: **does the client only receive, or also send over the same channel?**
   One-way (receive only) → **SSE** (e.g. a notifications feed / live counter);
   bidirectional/interactive → **WebSocket** (e.g. chat, collaborative editing, a
   game). SSE is simpler and proxy-friendlier, so prefer it unless you need
   duplex.
6. When the client **already speaks GraphQL** (talks to a GraphQL BFF) and wants
   the live update as a *field in the same typed schema* — a subscription
   delivers it over the existing GraphQL contract instead of standing up a
   separate socket protocol and message format (module 04).

</details>

## Further reading & sources

- [MDN — Using server-sent events](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events) - the reference for one-way SSE streaming to a browser, the simpler of the two push channels.
- [MDN — The WebSocket API](https://developer.mozilla.org/en-US/docs/Web/API/WebSockets_API) - full-duplex client/server messaging for the genuinely bidirectional cases.
- [Stripe — Webhooks documentation](https://docs.stripe.com/webhooks) - the canonical production webhook design: signing, retries, and at-least-once idempotency.
- [MDN — HTTP conditional requests (ETag / If-None-Match)](https://developer.mozilla.org/en-US/docs/Web/HTTP/Conditional_requests) - how `304 Not Modified` makes the "nothing changed" poll cheap.
- [Ably — Long polling vs WebSockets vs SSE](https://ably.com/topic/long-polling-vs-websockets-vs-sse) - a side-by-side comparison of the real-time mechanisms weighed in this module's framework.
- [RFC 6202 — Known issues with bidirectional HTTP (long polling)](https://datatracker.ietf.org/doc/html/rfc6202) - background on long polling as the historical bridge before WebSockets.

## Next

[09-api-gateways-and-bff](../09-api-gateways-and-bff/README.md) — you can now
route any consumer to the right paradigm *and* the right update mechanism. Next
you'll learn the edge components that sit in front of all of this: the **API
gateway** (rate limiting, auth termination, routing at the edge) and the
**Backend-for-Frontend** pattern — and, in keeping with the whole track, when
that machinery earns its complexity versus when it's premature.
