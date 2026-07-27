# Module 07: WebSockets and Server-Sent Events

## Why this matters

HTTP's request-response model has a built-in limitation: the server can only
speak when spoken to. The client asks; the server answers; the connection
closes. That's fine for loading a page, but it's the wrong shape for anything
*live* — a chat message someone else just sent, a notification that your
background task finished, a stock price ticking, a "user is typing"
indicator, a progress bar for a long-running job. For those, the server needs
to push data to an already-connected client *whenever it has something to
say*, without the client asking first.

There are three ways to get there, and choosing wrong is a common early
mistake. **Polling** fakes it by asking repeatedly (you saw its waste in
module 05). **Server-Sent Events (SSE)** give you a one-way, server→client
stream over plain HTTP. **WebSockets** give you a full-duplex, bidirectional
connection where both sides can send at any time. Knowing which to reach for
— and, just as important, how to *clean up* the connections you open — is the
skill here.

That cleanup part is where this module earns its keep. A WebSocket is a
long-lived connection holding server resources (memory, a file descriptor, an
entry in whatever registry you use to broadcast). Forget to remove a
connection when the client vanishes and you have a **connection leak**: your
server slowly accumulates dead connections until it runs out of resources and
falls over. This is one of the most common real-world bugs in real-time
systems, and this module builds the connection-manager pattern that prevents
it — then makes you diagnose the leak when it's missing.

## Concepts

### Three options: polling, SSE, WebSockets

**Polling** — the client repeatedly requests updates on a timer. Simple, works
everywhere, no special protocol. But it's wasteful (most polls return nothing)
and laggy (up to one interval behind). "Long polling" (hold the request open
until there's data) reduces lag but ties up a connection per waiting client.
Use plain polling only when updates are infrequent and a few seconds of lag is
fine.

**Server-Sent Events (SSE)** — a standardized one-way stream: the client opens
a normal HTTP `GET` to an endpoint that keeps the response open and writes
events to it over time (`text/event-stream`). The browser's `EventSource` API
handles it, including **automatic reconnection** if the connection drops. SSE
is *server→client only* — the client can't send over the same channel (it uses
ordinary requests for that). It runs over plain HTTP/HTTPS, so it passes
through proxies and infrastructure easily. Ideal for: notifications, live
feeds, progress updates, dashboards — anything where the server pushes and the
client mostly listens.

**WebSockets** — a protocol that upgrades an HTTP connection into a persistent,
**full-duplex** channel: both client and server can send messages at any time,
independently, until either closes. This is what you want for genuinely
interactive, bidirectional, low-latency features: chat, collaborative editing,
multiplayer games, live trading. It's more powerful than SSE but also more to
manage (no built-in reconnection, a distinct protocol some proxies need
configuring for, and you own the connection lifecycle).

The decision rule:

| Need | Use |
|---|---|
| Infrequent updates, lag tolerable, dead simple | Polling |
| Server pushes to client, client just listens | **SSE** |
| Both sides send, interactive, low latency | **WebSockets** |

```
  HTTP request/response      SSE (one-way stream)        WebSocket (full-duplex)
  client ──req──► server     client ──GET──► server      client ◄════════► server
  client ◄─resp── server     client ◄─event─ server        both send anytime,
     one shot, then closed    ◄─event─  (stays open,        persistent, until
                              ◄─event─   server pushes)      either side closes
```

A huge number of features people build with WebSockets ("show me
notifications," "update this progress bar") only ever push *server→client* and
would be simpler, more robust, and reconnection-free as SSE. Reach for
WebSockets when you genuinely need the *client* to send over the persistent
channel too.

### The WebSocket connection lifecycle

A WebSocket connection has distinct phases, and you must handle each:

1. **Handshake / accept.** The client sends an HTTP request with an `Upgrade:
   websocket` header; the server `accept()`s it, switching the protocol. In
   FastAPI: `await websocket.accept()`.
2. **Open / message exchange.** Both sides send/receive messages in a loop.
   The server typically `await websocket.receive_text()` in a loop and
   `await websocket.send_text(...)` whenever it has something to push.
3. **Close / disconnect.** Either side closes, *or* the client vanishes
   (browser tab closed, network dropped, laptop slept). A clean close raises
   `WebSocketDisconnect` on the server's next receive; an unclean one is
   detected on the next send/receive attempt or a ping timeout.

The non-negotiable rule: **whatever you did on connect, you must undo on
disconnect**, and you must do it in a `finally` block so it runs no matter
*how* the connection ended. If you registered the connection in a broadcast
list on accept, you must remove it on disconnect — including the disconnect
you didn't expect.

### The connection manager and the leak it prevents

To broadcast (send to many clients), you need a registry of active
connections. That registry *is* the thing that leaks if you're careless. A
**connection manager** centralizes register/unregister/broadcast:

```python
class ConnectionManager:
    def __init__(self):
        self.active: set[WebSocket] = set()

    async def connect(self, ws: WebSocket):
        await ws.accept()
        self.active.add(ws)                 # register

    def disconnect(self, ws: WebSocket):
        self.active.discard(ws)             # unregister (idempotent)

    async def broadcast(self, message: str):
        dead = []
        for ws in list(self.active):        # copy: we may mutate during iteration
            try:
                await ws.send_text(message)
            except Exception:
                dead.append(ws)             # sending failed -> it's gone
        for ws in dead:
            self.disconnect(ws)             # prune the ones that failed
```

```
  broadcast fan-out                       the leak (missing unregister)
  one message ─► registry `active`         active = {c1, c2, DEAD, DEAD, c5, DEAD...}
        ┌─► client 1 (send ok)                     │            │      │
        ├─► client 2 (send ok)              grows forever; every broadcast
        ├─► client 3 (send fails) ─► prune  still tries the DEAD sockets
        └─► client 4 (send ok)              until memory/fds run out
```

The **leak** happens when a connection is added to `active` on connect but
*not* removed when the client disconnects — because you only removed it in the
happy-path branch, or forgot the `finally`, or assumed clients always close
cleanly. Every dead connection stays in `active` forever: it consumes memory,
and every `broadcast` wastes time trying to send to a socket that's gone (or
worse, blocks). Under real traffic — where clients constantly connect and
disappear — `active` grows without bound until the server dies. The fix is
always the same: remove the connection in a `finally` (or prune on send
failure), so *every* exit path unregisters it.

### Broadcasting and the multi-process problem

`ConnectionManager` broadcasts to every client connected *to this process*.
But production runs multiple worker processes/servers, and a given client is
connected to only one of them. If user A (on process 1) sends a chat message,
process 1's manager can only reach the clients connected to process 1 — users
on process 2 never see it. The solution is a **pub/sub backplane** (module
08): each process publishes outgoing messages to a shared channel (Redis
Pub/Sub) and subscribes to it, so a message from any process fans out to the
connections on *every* process. This module builds the single-process manager;
module 08 supplies the backplane that makes it work across processes.

### Heartbeats and detecting dead clients

A client can vanish without the OS ever telling your server (a yanked network
cable, a slept laptop). The connection looks open but is dead. **Heartbeats**
— periodic ping/pong frames — detect this: if a client misses pings, you close
and unregister it, reclaiming the resources and keeping intermediary proxies
from silently timing out an idle connection. WebSocket has built-in ping/pong
frames; SSE conventionally sends a periodic comment line (`: keepalive`) to
keep the stream and proxies alive. Without heartbeats, dead-but-open
connections are another source of the leak.

## Command reference

| Concern | FastAPI / approach |
|---|---|
| Accept a WebSocket | `await websocket.accept()` |
| Receive a message | `await websocket.receive_text()` / `receive_json()` |
| Send a message | `await websocket.send_text(...)` / `send_json(...)` |
| Detect disconnect | catch `WebSocketDisconnect` on receive |
| Guaranteed cleanup | unregister in a `finally` block |
| SSE endpoint | return `StreamingResponse(gen(), media_type="text/event-stream")` |
| SSE event format | `data: <payload>\n\n` per event |
| SSE reconnection | automatic via the browser's `EventSource` |
| Broadcast | connection manager iterating a registry, pruning failures |
| Cross-process broadcast | Redis Pub/Sub backplane (module 08) |
| Heartbeat | WebSocket ping/pong; SSE `: keepalive\n\n` comments |

A complete WebSocket chat with correct cleanup — `ws.py`:

```python
from fastapi import FastAPI, WebSocket, WebSocketDisconnect

app = FastAPI()

class ConnectionManager:
    def __init__(self):
        self.active: set[WebSocket] = set()

    async def connect(self, ws: WebSocket):
        await ws.accept()
        self.active.add(ws)

    def disconnect(self, ws: WebSocket):
        self.active.discard(ws)          # idempotent: safe to call twice

    async def broadcast(self, msg: str):
        for ws in list(self.active):
            try:
                await ws.send_text(msg)
            except Exception:
                self.disconnect(ws)      # prune sockets that error on send

manager = ConnectionManager()

@app.websocket("/ws/chat")
async def chat(ws: WebSocket):
    await manager.connect(ws)
    try:
        while True:
            text = await ws.receive_text()          # raises on disconnect
            await manager.broadcast(f"user: {text}")
    except WebSocketDisconnect:
        pass                                         # normal client close
    finally:
        manager.disconnect(ws)                       # <-- ALWAYS unregister
        await manager.broadcast("a user left")
```

An SSE progress stream (server→client only) — pushing task progress:

```python
import asyncio, json
from fastapi.responses import StreamingResponse

@app.get("/tasks/{task_id}/stream")
async def stream_progress(task_id: str):
    async def gen():
        try:
            while True:
                state = get_task_state(task_id)      # e.g. from the result backend
                yield f"data: {json.dumps(state)}\n\n"
                if state["status"] in ("SUCCESS", "FAILURE"):
                    return                            # end the stream
                yield ": keepalive\n\n"               # comment: keeps proxies happy
                await asyncio.sleep(1)
        except asyncio.CancelledError:
            # client disconnected -> generator is cancelled; clean up here
            raise
    return StreamingResponse(gen(), media_type="text/event-stream")
```

Browser side (for reference):

```javascript
// SSE — automatic reconnection, server->client only
const es = new EventSource("/tasks/abc/stream");
es.onmessage = (e) => console.log("progress", JSON.parse(e.data));

// WebSocket — bidirectional, you handle reconnection yourself
const ws = new WebSocket("wss://example.com/ws/chat");
ws.onmessage = (e) => console.log("msg", e.data);
ws.onopen = () => ws.send("hello");
```

## Hands-on exercises

Continue in `bg-queues`. `pip install "uvicorn[standard]"` (WebSocket
support). Use `websocat` or a couple of browser tabs to connect.

### 1. A first WebSocket echo

Write a `/ws/echo` endpoint that accepts, then loops receiving text and
sending it back. Connect with `websocat ws://localhost:8000/ws/echo` and type.
Expected: the server echoes each line back over the *same* connection — no new
request per message. That persistent, bidirectional channel is the WebSocket.

### 2. Broadcast chat to multiple clients

Implement the `ConnectionManager` chat above. Open three `websocat`
connections (or browser tabs). Send from one. Expected: all three receive the
message — the server pushed to every registered connection. This is what a
registry buys you.

### 3. Watch the registry grow and shrink

Add a `/count` HTTP endpoint returning `len(manager.active)`. Connect and
disconnect clients while polling `/count`. Expected: the count rises on
connect and falls on *clean* disconnect (Ctrl+C the client) — because
`finally` unregisters. Keep this endpoint; it's your leak detector.

### 4. Diagnose and fix: the connection leak

Break the manager by removing the `finally` and only unregistering inside a
non-disconnect branch:

```python
@app.websocket("/ws/leaky")
async def leaky(ws: WebSocket):
    await manager.connect(ws)
    while True:
        try:
            text = await ws.receive_text()
            await manager.broadcast(text)
        except WebSocketDisconnect:
            break                        # leaves the loop but NEVER calls disconnect()
```

Connect several clients and kill them (close the tab / kill `websocat`),
watching `/count`. Expected: the count only ever goes *up* — dead connections
are never removed. Now every `broadcast` also iterates dead sockets. This is
the leak. Fix it by moving `manager.disconnect(ws)` into a `finally` so it
runs on *every* exit path, clean or not. Re-run and confirm `/count` drops
when clients vanish.

### 5. Prune on send failure too

Even with `finally`, a client can die between receives (so the server is
blocked on `receive_text` and hasn't noticed). Confirm that `broadcast`'s
try/except prunes such a socket the next time you broadcast to it (the
`send_text` raises). Expected: a client killed mid-connection is removed on the
next broadcast, not left forever. Two cleanup paths — `finally` and
send-failure pruning — cover the cases each other misses.

### 6. Build an SSE progress stream instead

Implement `/tasks/{id}/stream` from the reference, backed by a Celery task
whose progress you can read (use `self.update_state(state=..., meta=...)` in
the task). Consume it with `curl -N http://localhost:8000/tasks/abc/stream`.
Expected: a stream of `data: {...}` lines, one per second, ending when the task
finishes. Note you did this with *plain HTTP* and no connection manager —
server→client only.

### 7. SSE auto-reconnect vs. WebSocket manual reconnect

In a tiny HTML page, open the SSE stream with `EventSource` and the chat with
`WebSocket`. Kill and restart the server. Expected: the `EventSource`
reconnects on its own; the `WebSocket` does *not* (its `onclose` fires and
stays closed until you write reconnection logic). Lesson: SSE's built-in
reconnection is a real ergonomic win when you only need server→client.

### 8. Choose the right tool for three features

For each, decide polling / SSE / WebSocket and justify: (a) a live "your
export is N% done" progress bar; (b) a two-player tic-tac-toe game; (c) a
"new blog comments" badge that can be a few minutes stale. Expected reasoning:
(a) SSE — server pushes, client only listens; (b) WebSocket — both players
send moves, low latency; (c) polling — infrequent, staleness tolerable. Write
your justifications before checking the quiz.

### 9. Heartbeat to detect a silently-dead client

Add a background ping loop to the chat that sends a ping every 20s and closes/
unregisters a connection that fails. Simulate a "network drop" by pausing a
client without closing it cleanly. Expected: within a ping cycle the server
detects the dead socket and removes it from `active`, rather than holding it
forever. Lesson: heartbeats catch the disconnects the OS never reported.

## Independent challenge

No code given. Build a real-time "job status" feature: a client connects and
subscribes to updates for a specific background job id, and as the job
progresses (queued → running → done/failed) the server pushes each state
change to that client the instant it happens. Decide SSE vs. WebSocket and
justify it (hint: does the client need to *send* anything over the channel?).
Guarantee that when a client disconnects — cleanly or by vanishing — its
connection/stream is fully cleaned up with no leak, and prove it with a live
connection-count endpoint that returns to zero after all clients leave. Include
a heartbeat so a silently-dead client is detected and cleaned up within a
bounded time.

The connection-count-returns-to-zero proof is the same leak-detection
technique from exercise 3-4; the "push job progress" data can come from the
task-state mechanism you used to poll in
[00-task-queues-fundamentals](../00-task-queues-fundamentals/README.md), now
pushed instead of polled.

<details>
<summary>Hint</summary>

Since the client only *listens* to job progress and never sends over the
channel, SSE is the better fit — you get automatic reconnection for free and
skip the connection-manager bookkeeping. Cleanup for SSE lives in the
generator: when the client disconnects, the async generator is cancelled
(`asyncio.CancelledError`) — decrement your active-stream counter in a
`finally`. If you do choose WebSockets, unregister in a `finally` and prune on
send failure, exactly as in the chat example.

</details>

## Common mistakes & troubleshooting

- **The connection leak: not unregistering on every exit path.** Removing a
  connection only in the happy branch (or forgetting `finally`) leaves dead
  connections in your registry forever, growing memory and slowing every
  broadcast until the server falls over. Always unregister in `finally` and
  prune on send failure.
- **Using WebSockets when SSE would do.** If the client only listens (progress,
  notifications, feeds), SSE is simpler, runs over plain HTTP, and reconnects
  automatically. Reserve WebSockets for genuinely bidirectional needs.
- **Assuming clients disconnect cleanly.** Tabs close, networks drop, laptops
  sleep — you often get no clean close. Detect via exceptions on send/receive
  and heartbeats, and clean up regardless.
- **Broadcasting from one process and expecting all clients to hear it.** A
  connection manager only reaches connections on its own process; multi-process
  deployments need a Redis Pub/Sub backplane (module 08).
- **Mutating the connection set while iterating it.** Iterate a copy
  (`list(self.active)`) so pruning failed sockets mid-broadcast doesn't raise.
- **No heartbeat.** Silently-dead connections linger and proxies time out idle
  streams. Send periodic pings (WS) / keepalive comments (SSE).
- **Doing heavy work inside the WebSocket receive loop.** Blocking the loop
  delays all messages on that connection; offload slow work to a task
  (module 00) and push the result when done.

## Checkpoint quiz

Write down your answer to each question before expanding it — checking without attempting first is the single easiest way to fool yourself into thinking you've learned this.

1. Give the decision rule for polling vs. SSE vs. WebSockets in one line each.
2. What is the one capability WebSockets have that SSE does not, and what does
   SSE give you "for free" that WebSockets don't?
3. Describe the WebSocket connection leak precisely: what accumulates, why,
   and what's the consequence under real traffic?
4. What is the single most important structural fix that prevents the leak, and
   why must it be in a `finally` block specifically?
5. Why does a connection manager in one process fail to broadcast to all users
   in a multi-process deployment, and what fixes it?
6. Why do you need heartbeats even if you correctly unregister on disconnect?
7. For a "your export is 40% done" progress bar, which of the three would you
   choose and why?

<details>
<summary>Answers</summary>

1. Polling: infrequent updates where a few seconds of lag is acceptable and you
   want maximum simplicity. SSE: the server pushes and the client only listens
   (notifications, progress, feeds). WebSockets: both sides send, interactive,
   low latency (chat, games, collaboration).
2. WebSockets are full-duplex — the client can send over the persistent channel
   too; SSE is server→client only. SSE gives automatic reconnection (via the
   browser's `EventSource`) and runs over plain HTTP, which WebSockets don't
   provide out of the box.
3. Connections that were added to the broadcast registry on connect but never
   removed on disconnect accumulate in the registry. It happens because cleanup
   was only on the happy path / not guaranteed, and clients often vanish
   uncleanly. Under real traffic (constant connect/disconnect churn) the
   registry grows without bound, wasting memory and making every broadcast
   iterate dead sockets, until the server exhausts resources.
4. Unregistering the connection in a `finally` block so it runs on *every* exit
   path — normal close, `WebSocketDisconnect`, or any other exception. It must
   be `finally` because you cannot predict how the connection ends; only
   `finally` guarantees the cleanup runs regardless of which branch/exception
   terminated the handler.
5. Each process's manager only knows about connections made to *that* process,
   and a client is connected to just one process; a message produced on one
   process can't reach clients on the others. A shared pub/sub backplane (Redis
   Pub/Sub) that every process publishes to and subscribes from fixes it
   (module 08).
6. Because a client can die without any clean close or OS notification (yanked
   network, slept laptop); the connection looks open but is dead, so you never
   hit the disconnect path. Heartbeats detect the silent death (missed pings)
   so you can close and unregister it, and keep proxies from timing out idle
   connections.
7. SSE — the server pushes progress updates and the client only listens
   (nothing needs to be sent from client to server over the channel), so SSE's
   simplicity, plain-HTTP transport, and automatic reconnection make it the
   better fit than WebSockets, and it's more timely than polling.

</details>

## Cumulative review

Closed-book. Don't reopen modules 00-07 while attempting these.

1. A `POST /videos` endpoint accepts an upload, transcodes it (slow, CPU-
   heavy), emails the user when done, and fires a webhook to a partner. Design
   the whole flow: what returns immediately, what runs in the background and
   how the steps are wired, how the partner webhook is emitted without risking
   a fire-for-a-rolled-back-event, and how the user sees live progress. Name
   the module concepts for each piece.
2. Your transcoding task is enqueued but "sometimes runs twice and produces two
   output files." Give the delivery-model reason it can run twice and the fix
   that makes the *effect* happen once.
3. A webhook you *receive* credits an account. Walk through every defense that
   stops (a) a forged request, (b) a replayed request, and (c) a legitimately-
   retried duplicate from each causing a wrong credit.
4. You added two Celery Beat replicas for availability and now a nightly job
   runs twice. Explain the cause and give the two-layer fix.
5. Your WebSocket server's memory climbs steadily over days and broadcasts get
   slower. Name the bug, its root cause in code, and the exact fix.
6. A teammate built "live notifications" with WebSockets and is fighting
   reconnection logic and proxy issues. What would you switch to and what two
   problems does that immediately solve?
7. A transactional receipt email lands in customers' spam even though your
   send code is correct and works against MailHog. List the non-code layer
   you'd investigate and name what SPF, DKIM, and DMARC each do.
8. You need to deliver a webhook to five subscribed endpoints, one of which is
   frequently down. Describe the delivery design that keeps the healthy four
   fast and reliable while the fifth retries, and how retries stay
   deduplicatable by the receiver.
9. Explain why sending a webhook, sending an email, and processing a received
   webhook should *all* happen in background tasks rather than inline — and
   what specific bad thing happens inline in each case.

<details>
<summary>Show answers</summary>

1. `POST /videos` validates, stores the file, writes the "video.uploaded"
   state and an outbox row, enqueues the pipeline, and returns `202` with a job
   id immediately (module 00). The background work is a chain:
   `transcode.s(id) | notify_email.si(id) | emit_partner_event.si(id)` — chain
   so a transcode failure stops the rest (module 01), transcode retrying
   transient errors idempotently (module 02). The partner webhook is emitted
   via a transactional outbox written in the same txn as the "done" state and
   relayed after commit, so a rollback never fires it (module 05), delivered
   with backoff retries and a stable event id (module 05/06). The user sees
   progress via an SSE stream of task state (module 07). The email is a
   transactional send from a task with retries + idempotency (module 04).
2. At-least-once delivery: a worker can complete the transcode then crash
   before acking, so the broker redelivers and it runs again (module 00/02).
   Fix: make it idempotent — derive a deterministic output key from the video
   id and skip/overwrite if that output already exists (check-before-act with a
   stable key), so two runs produce one output.
3. (a) Forged: HMAC signature verification over the raw bytes with the shared
   secret, constant-time compared — no secret, no valid signature, `401`. (b)
   Replayed: a signed timestamp checked against a freshness window rejects a
   stale captured request; and idempotency by event id makes any within-window
   replay a no-op. (c) Duplicate retry: the atomic per-event-id dedupe record
   means the second delivery returns `2xx` and skips the credit; the effect
   happens once. All three: process in a task after a fast `2xx`.
4. Both Beat replicas independently reach each due entry and enqueue it, so the
   job runs twice. Fix: run exactly one Beat instance (availability via fast
   restart), and guard the task with a distributed lock keyed by job + time
   window and/or make its effect idempotent so a duplicate fire no-ops.
5. A WebSocket connection leak: connections are added to the broadcast registry
   on connect but not removed on every disconnect path (missing/incorrect
   `finally`), so dead connections accumulate — climbing memory and slower
   broadcasts (each iterates dead sockets). Fix: unregister in a `finally`
   block and prune sockets that error on send.
6. Switch to SSE. It immediately solves reconnection (the browser's
   `EventSource` reconnects automatically) and proxy/infrastructure friction
   (it's plain HTTP), since notifications are server→client-only and don't need
   the client to send over the channel.
7. The deliverability/DNS + reputation layer, not the code. SPF: a DNS record
   listing which servers may send for your domain. DKIM: a cryptographic
   signature (public key in DNS) proving the message came from your domain
   unaltered. DMARC: a DNS policy telling receivers what to do when SPF/DKIM
   fail, plus reporting. Also check bounce/complaint suppression and whether
   you send a text part.
8. Fan out to one delivery task per (event, endpoint) so each retries
   independently — the healthy four deliver immediately while the fifth backs
   off and retries over a long window without blocking the others. Every retry
   of the fifth reuses the *same* event id, so when it finally lands the
   receiver can dedupe it.
9. All three are slow, I/O-bound, third-party-dependent work that shouldn't
   block the request-response cycle. Sending a webhook inline: a slow/dead
   consumer blocks your request/transaction — their outage becomes yours.
   Sending email inline: the user waits on your mail provider's latency.
   Processing a received webhook inline: you blow the sender's timeout, so it
   marks the delivery failed and retries, amplifying load and duplicates.

</details>

## Further reading & sources

- [MDN: WebSockets API](https://developer.mozilla.org/en-US/docs/Web/API/WebSockets_API) - the client protocol, lifecycle, and framing.
- [MDN: Using server-sent events](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events) - `EventSource`, the `text/event-stream` format, and automatic reconnection.
- [FastAPI: WebSockets](https://fastapi.tiangolo.com/advanced/websockets/) - accepting connections, the receive loop, and `WebSocketDisconnect`.
- [MDN: WebSockets vs Server-sent events](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events) - when one-way SSE is the simpler, more robust choice.
- [RFC 6455: The WebSocket Protocol](https://datatracker.ietf.org/doc/html/rfc6455) - the handshake, framing, and ping/pong heartbeats.

## Next

[08-pub-sub-architecture](../08-pub-sub-architecture/README.md) — module 07
left a gap: a connection manager can only broadcast to clients on its own
process. Next you'll close it with the publish/subscribe pattern — using Redis
Pub/Sub as a backplane so a message from any process reaches connections on
every process — and learn the crucial difference between a pub/sub bus (fire-
and-forget, lost if nobody's listening) and a durable task queue.
