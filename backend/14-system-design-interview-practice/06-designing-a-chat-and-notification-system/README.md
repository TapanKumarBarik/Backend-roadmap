# Module 06: Designing a Chat and Notification System

## Why this matters

Chat (WhatsApp, Slack, Messenger) and its close cousin push notifications flip
the whole orientation of the previous problems. The feed was read-heavy, pull-
oriented, and perfectly happy with data arriving seconds late. Chat is the
opposite: it's **write-and-deliver-heavy**, **push-oriented**, and **latency-
critical** — a message that arrives five seconds late feels broken, and the
system must maintain a **persistent connection to every online user** so it can
deliver *to* them the instant something happens, rather than waiting for them to
ask.

That single requirement — servers pushing to millions of persistently-connected
clients — drags in a cluster of concepts you haven't had to confront yet:
**websockets** and long-lived connections (recall real-time transport from
**06-background-processing-and-realtime**), **presence** (who's online right
now?), **message ordering and delivery guarantees** (at-least-once vs.
exactly-once, and how you dedupe), **offline delivery** (store-and-forward for
users who aren't connected), and the routing problem of finding *which* server
holds the recipient's connection. Notifications are the generalization: the same
delivery fabric, fanned out across web/mobile/email channels. Master this and you
understand every real-time, connection-oriented system — the hardest delivery
class in the track.

## Concepts

### Requirements and scope

**Functional:**
- Send a message from one user to another (1:1) and to a group.
- Deliver messages in **real time** to online recipients; **store and forward**
  to offline ones so they get them on reconnect.
- **Delivery/read receipts** (sent, delivered, read) and **presence** (online/
  offline/last-seen).
- (Notifications) push an event to a user across channels (in-app, mobile push,
  email).

**Non-functional (these define the shape):**
- **Low latency.** Sub-second end-to-end delivery for online users; this is the
  headline requirement.
- **Persistent connections at massive scale.** Millions of concurrent long-lived
  connections — the connection count, not just QPS, is the scaling axis.
- **Reliable delivery & ordering.** No lost messages; messages in a conversation
  arrive in order. Requires at-least-once delivery + dedup, or careful
  sequencing.
- **High availability.** Chat being down is immediately visible and unacceptable.
- **Durability.** Message history is persisted (often forever); losing a message
  is not okay.

### Persistent connections and the connection layer

HTTP request/response can't push — the server can only answer when asked. Chat
needs the server to send *unprompted*, so it uses **websockets** (a persistent,
bidirectional TCP connection kept open) — or a fallback like long-polling/SSE.
This creates a whole new tier:

- **The connection layer (gateway/chat servers).** A fleet of servers whose job
  is to *hold* millions of open websocket connections. Each server keeps a few
  hundred thousand connections; the fleet scales horizontally with connection
  count. These servers are **stateful** in a way app servers usually aren't —
  they own live sockets.
- **The routing problem.** To deliver a message to user B, you must find *which
  connection server currently holds B's socket*. This needs a **presence/routing
  registry** — a fast shared map of `user_id → connection_server` (recall the
  distributed KV store from module 04) that's updated on connect/disconnect. When
  A sends to B, the system looks up B's server and forwards the message there,
  which pushes it down B's socket.
- **Load balancing long-lived connections** differs from balancing requests:
  connections are sticky and long, so you balance by connection count and handle
  reconnection storms (a server dying drops all its connections, which reconnect
  en masse) gracefully.

### Message flow, storage, and ordering

The path of a 1:1 message from A to B:

```
A's client ──ws──► A's conn server ──► [persist message] ──► [route: where is B?]
                                                              │
                        B online:  forward to B's conn server ──ws──► B's client
                        B offline: store in B's "mailbox" / inbox; deliver on reconnect
```

- **Persist first, then deliver.** The message is written to durable storage
  before (or as) it's delivered, so it survives a crash and offline users can
  fetch it later. This is a **store-and-forward** design.
- **Data model.** Messages are stored per-conversation, ordered by time/sequence.
  The natural shape is a **wide-column / KV store** partitioned by
  `conversation_id` with a clustering key on `(timestamp, message_id)` — writes
  are append-heavy and reads are "recent messages in this conversation," which is
  exactly what a partitioned, time-ordered store does well. Estimation: at 50M
  DAU × 40 msgs/day × 1 KB, that's ~2 TB/day (recall the module-00 exercise) — so
  the store is **sharded** and old messages tier to cold storage.
- **Ordering.** Within a conversation, messages need a consistent order. Use a
  **per-conversation sequence number** (or a monotonic timestamp with tiebreak)
  so all participants render the same order regardless of network jitter. Global
  ordering across all conversations is unnecessary and expensive — order is only
  required *within* a conversation.

### Delivery guarantees and offline handling

Networks drop packets and clients disconnect mid-delivery, so "did B get it?"
needs an explicit guarantee:

- **At-least-once + idempotent dedup** is the pragmatic default. The sender/server
  retries until acknowledged, which can deliver duplicates; the client dedupes on
  a unique **message id** (recall the idempotency-key pattern from
  **10-distributed-systems-patterns**). Exactly-once is very hard end-to-end;
  at-least-once + client-side dedup gives the same *user-visible* result far more
  cheaply.
- **Acknowledgements drive the state machine.** *Sent* (server persisted it),
  *delivered* (recipient's device acked receipt), *read* (recipient opened it) —
  each is an ack flowing back, updating the message's status and powering read
  receipts.
- **Offline delivery (store-and-forward).** If B is offline, the message sits in
  durable storage / a per-user inbox. On reconnect, B's client syncs everything
  since its last-seen sequence number — a **catch-up read** — and the connection
  server resumes live delivery. Presence (online/offline) is what tells the system
  which path to take, and it's itself a small, fast, slightly-stale KV lookup.

### The notification system (generalizing delivery)

Notifications are the same "deliver an event to a user" problem, generalized
across channels and made asynchronous:

- **A notification service** consumes events (a like, a mention, a DM) from a
  queue and fans them out to the right **channels**: in-app (via the websocket
  layer above), **mobile push** (APNs for iOS, FCM for Android — you hand the
  payload to the platform's push gateway, which delivers to the device), and
  **email/SMS** (via a provider).
- **Async and queue-driven.** Producing an event just enqueues it (recall
  **06-background-processing-and-realtime**); workers handle rendering,
  per-channel delivery, retries, and rate limiting. This decouples the event
  source from delivery and absorbs bursts.
- **User preferences, templating, and dedup/throttling.** Respect per-user,
  per-channel opt-outs; render from templates; **collapse/throttle** floods (10
  likes in a minute → one "10 people liked your post" notification) so you don't
  spam. Delivery is best-effort per channel with retries, and idempotency keys
  prevent double-sends on retry.

## Command reference

The real-time delivery concept map.

| Concern | Mechanism |
|---|---|
| Server → client push | **Websockets** (persistent, bidirectional); SSE/long-poll fallback |
| Hold millions of connections | Stateful **connection/gateway server** fleet, scaled by connection count |
| Find recipient's server | **Presence/routing registry**: `user_id → conn_server` (fast KV) |
| Don't lose messages | **Persist first**, then deliver (store-and-forward) |
| Ordering | **Per-conversation sequence number** (not global) |
| Delivery guarantee | **At-least-once + client dedup** on message id (not exactly-once) |
| Offline users | Durable inbox; **catch-up sync** since last-seen seq on reconnect |
| Message status | Acks: **sent → delivered → read** |
| Notifications | Queue-driven **notification service** → in-app / APNs / FCM / email |
| Notification floods | **Collapse/throttle** + per-user channel preferences |

Message store shape (partitioned, time-ordered):

```
Partition key:  conversation_id
Clustering key: (created_at, message_id)   ← recent-messages-in-conversation reads
Columns:        sender_id, body, seq_no, status

# Access pattern: "last N messages in conversation X" and "everything after seq S"
# → wide-column / KV store sharded by conversation_id; old data tiers to cold storage
```

Websocket send/receive sketch (FastAPI):

```python
from fastapi import FastAPI, WebSocket

app = FastAPI()

@app.websocket("/ws")
async def chat(ws: WebSocket, user=Depends(ws_auth)):
    await ws.accept()
    presence.set_online(user.id, this_server_id)          # register in routing map
    await deliver_backlog(ws, user.id)                    # catch-up sync (offline msgs)
    try:
        async for raw in ws.iter_text():
            msg = parse(raw)
            msg.id = new_message_id()                     # unique id → client dedup
            message_store.append(msg.conversation_id, msg)  # persist FIRST
            await route_and_deliver(msg)                  # find recipients' servers, push
            await ws.send_json({"ack": msg.id, "status": "sent"})
    finally:
        presence.set_offline(user.id)                     # deregister on disconnect

async def route_and_deliver(msg):
    for uid in recipients(msg):
        server = presence.server_for(uid)                 # routing lookup
        if server:                                        # online → forward to their conn server
            await forward(server, uid, msg)
        # offline → already persisted; delivered on their next catch-up sync
```

Notification fan-out (queue-driven, multi-channel):

```python
def handle_notification_event(event):
    prefs = get_prefs(event.user_id)
    if throttled(event):                                  # collapse floods
        return
    if prefs.in_app:  ws_layer.push(event.user_id, render_inapp(event))
    if prefs.mobile:  push_gateway.send(apns_or_fcm(event.user_id), render_push(event))
    if prefs.email:   email_provider.send(event.user_id, render_email(event))
    # each channel: at-least-once with an idempotency key to prevent double-send
```

## Hands-on exercises

Written design exercises — reason about delivery, ordering, and connections.

### 1. Size the connection layer

You have **10M concurrent online users**, and one connection server holds
~250,000 websocket connections. How many connection servers do you need for the
live connections, before redundancy? Add N+2 and 30% headroom. Contrast this
scaling axis (connections) with the QPS axis you've used before.

### 2. Design the routing lookup

Write the flow for delivering a message from A to B when B is online on a
*different* connection server than A. Name every lookup and hop, and say what the
presence/routing registry stores and when it's updated. What happens to the
lookup if B disconnected a moment ago?

### 3. Guarantee ordering without global order

Two messages from A to a group arrive at the server out of order due to network
jitter. Design the mechanism that makes every participant render them in the same
order, and explain why a **per-conversation** sequence is sufficient and global
ordering is unnecessary and costly.

### 4. Handle offline delivery

User B is offline for two hours, during which 40 messages arrive across 3
conversations. Describe exactly what's stored while B is offline and what happens
on reconnect (the catch-up sync). What does B's client send to request only what
it missed?

### 5. Pick a delivery guarantee

Argue why **at-least-once + client-side dedup** is preferred over attempting
exactly-once for chat. Describe the duplicate scenario it tolerates and the
specific field the client uses to dedupe (tie back to idempotency from
**10-distributed-systems-patterns**).

### 6. Design notification throttling

A popular post gets 500 likes in 5 minutes. Naively that's 500 push
notifications to the author. Design the collapse/throttle rule that turns this
into a sane experience, where it lives in the pipeline, and how per-user channel
preferences factor in.

### 7. Estimate message storage and tiering

At 50M DAU, 40 messages/day, 1 KB each, kept indefinitely, replicated 3×,
estimate daily and 3-year storage (reuse the module-00 recipe). State why the
store must be sharded and propose a hot/cold tiering split (recent in fast store,
old in cheap cold storage).

### 8. Diagnose and fix a flawed design

Critique and fix this chat design.

> "Clients poll `GET /messages?since=<ts>` every 2 seconds to check for new
> messages. Messages are delivered best-effort: the server sends over the socket
> and forgets — no persistence, no acks — because storing every message is
> expensive. Ordering is by the server's wall-clock arrival time across all
> conversations globally. If a user is offline, messages to them are simply
> dropped. We scale by adding stateless app servers behind a round-robin load
> balancer."

<details>
<summary>Solution</summary>

Flaws and fixes:

1. **2-second polling can't meet sub-second real-time delivery** and wastes huge
   request volume (every client polling constantly). Use **websockets** (server
   push) so messages arrive the instant they're sent, with no polling.
2. **No persistence + fire-and-forget = lost messages.** A crash or a dropped
   packet loses data permanently, violating durability and reliable delivery.
   **Persist first, then deliver**, and use **acks** (sent/delivered/read) with
   at-least-once retry + client dedup.
3. **Global wall-clock ordering is both wrong and expensive.** Clocks skew across
   servers, and you only need order *within* a conversation. Use a **per-
   conversation sequence number**; drop the global ordering entirely.
4. **Dropping messages to offline users is unacceptable.** Chat requires
   **store-and-forward**: persist to the recipient's inbox and deliver on
   reconnect via catch-up sync.
5. **"Stateless app servers + round-robin" ignores that connections are
   stateful and long-lived.** The connection layer *holds* sockets and must be
   scaled by connection count, with a **presence/routing registry** to find which
   server holds a given user — round-robin request balancing doesn't apply to
   established websocket connections.
6. **"Storing every message is expensive" is a false economy.** Durability is a
   hard requirement; the fix is sharding + hot/cold tiering, not skipping
   persistence.

Corrected: websocket connection-server fleet (scaled by connection count) + a
presence/routing KV registry; persist-first store-and-forward with per-
conversation sequencing; at-least-once delivery with acks and client-side dedup;
offline inbox + catch-up sync; sharded, time-ordered message store with cold
tiering.

</details>

## Independent challenge

No solution given. Design **Slack-style group channels** at scale — channels with
anywhere from 3 to 100,000 members, real-time delivery to all online members,
threaded replies, and reliable history. The group case reintroduces a *fan-out*
problem (a message to a 100K-member channel must reach every online member's
connection) that echoes the celebrity problem from **05-designing-a-news-feed-or-
social-timeline**, but now with hard real-time latency instead of eventual
consistency. Decide how you fan a group message out to connection servers
efficiently, how you handle a huge channel where most members are offline, and how
ordering and catch-up sync work per channel. Use the connection-layer and routing
concepts here plus the partitioned message store from
**04-designing-a-distributed-cache-and-key-value-store**.

<details>
<summary>Hint</summary>

The efficient move for large channels is to fan out to **connection servers, not
individual users**: instead of doing 100K per-user routing lookups, publish the
message once to each connection server that currently holds *at least one* member
of the channel, and let that server deliver locally to all the member sockets it
holds — turning a 100K-lookup problem into an M-server publish (where M is the
number of connection servers, far smaller). A pub/sub layer keyed by
`channel_id` does this cleanly (each conn server subscribes to the channels its
connected users belong to). Offline members don't get pushed at all — they rely
on catch-up sync from the persisted per-channel message log on reconnect (the
store-and-forward path), so a 100K channel where 95% are offline costs almost
nothing in live fan-out. This is the same "push to the many, but be smart about
the fan-out unit" instinct as the feed's hybrid, adapted to real-time.

</details>

## Common mistakes & troubleshooting

- **Polling instead of pushing.** Periodic `GET` can't meet sub-second delivery
  and floods the system. Use websockets (server push).
- **Fire-and-forget delivery.** No persistence and no acks loses messages. Persist
  first, then deliver; ack with at-least-once + client dedup.
- **Global ordering.** Ordering all messages across all conversations is
  unnecessary and expensive. Order **per conversation** with a sequence number.
- **Attempting exactly-once.** End-to-end exactly-once is impractical.
  At-least-once + idempotent client dedup gives the same user-visible result.
- **Dropping messages for offline users.** Chat requires store-and-forward and
  catch-up sync, not best-effort delivery to whoever's connected.
- **Treating connection servers as stateless.** They hold live sockets; scale by
  connection count and plan for reconnection storms and a routing registry — not
  round-robin request balancing.
- **Ignoring the routing problem.** You must know which connection server holds
  each user; a presence/routing registry is not optional.
- **Un-throttled notifications.** Fanning every event to every channel spams
  users. Collapse/throttle and honor per-channel preferences.
- **Naive per-user fan-out for big groups.** Fan out to connection servers (or via
  pub/sub per channel), not one lookup per member.

## Checkpoint quiz

Write down your answer to each question before expanding it — checking without attempting first is the single easiest way to fool yourself into thinking you've learned this.

1. Why can't plain HTTP request/response power real-time chat delivery, and what
   transport is used instead?
2. What is the connection/gateway layer, why is it stateful, and what scaling axis
   (different from QPS) governs its size?
3. Describe the routing problem and the registry that solves it. What does it map,
   and when is it updated?
4. Why is ordering only required *within* a conversation, and what mechanism
   enforces it without needing a global clock?
5. Why is at-least-once + client-side dedup preferred over exactly-once for chat,
   and what field does the client dedupe on?
6. How does store-and-forward handle a user who's offline for hours, and what does
   their client do on reconnect?
7. How does a notification system avoid spamming a user who receives 500 likes in
   a few minutes, and where in the pipeline does that logic live?

<details>
<summary>Answers</summary>

1. Because HTTP is client-initiated — the server can only respond to a request, it
   can't push unprompted, so a recipient would have to poll. Chat uses
   **websockets** (a persistent, bidirectional connection the server can push
   down), with SSE/long-poll as fallback.
2. A fleet of **stateful** servers that hold millions of open websocket
   connections. It's stateful because each server *owns* live sockets for specific
   users. It scales by **concurrent connection count** (not request QPS) — e.g.
   ~250K connections/server.
3. To deliver to user B you must find which connection server currently holds B's
   socket. A **presence/routing registry** (a fast shared KV map) maps
   `user_id → connection_server`, updated on every connect/disconnect. The sender's
   server looks B up and forwards the message to B's server, which pushes it.
4. Because participants only observe messages within their shared conversations;
   there's no user-visible need for one global order across unrelated
   conversations, and enforcing it would be expensive. A **per-conversation
   sequence number** (or monotonic timestamp with tiebreak) gives every
   participant the same order.
5. Exactly-once end-to-end is very hard/expensive; retrying until acked
   (at-least-once) can duplicate, and the client **dedupes on the unique message
   id**, yielding the same user-visible result far more cheaply.
6. The message is **persisted** to durable storage / the recipient's inbox while
   they're offline (store-and-forward). On reconnect, the client requests
   everything since its **last-seen sequence number** (catch-up sync) and then
   resumes live delivery.
7. It **collapses/throttles** the flood — aggregating many like-events into a
   single "500 people liked your post" notification — and honors per-user,
   per-channel preferences. This lives in the **notification service / worker**
   that consumes the event queue, before per-channel delivery.

</details>

## Cumulative review

Closed-book. Don't reopen modules 00–06 while attempting these — the point is to
find out what actually stuck.

1. A messaging app has **80M DAU** each sending **50 messages/day**, each 1 KB.
   Compute message write QPS (avg and peak, stating your constants), daily storage,
   and 2-year storage at ×3 replication. State the two architectural conclusions
   the numbers force.
2. Run the seven-step framework, one sentence per step, for "design a group chat."
   Which non-functional requirement most separates this design from a news feed,
   and why?
3. A URL shortener and a chat message store both need a partitioned key-value
   store. State the shard key you'd choose for each and why point-lookup vs.
   recent-messages-in-conversation leads to different clustering choices.
4. For the same chat store, state your CAP position under a network partition and
   justify it. Contrast that with the CAP choice you'd make for a bank balance,
   and tie both to quorum settings (W, R, N).
5. Rewrite this bare assertion as a proper tradeoff (module-01 template): "We'll
   use websockets." Include the requirement that forces it and the cost it carries
   versus polling.
6. A candidate designs chat with per-server in-memory connection maps, global
   wall-clock ordering, and best-effort fire-and-forget delivery. Name the three
   independent bugs and give the fix and the *earlier module* whose concept each
   fix draws on.
7. Explain why the news feed can be eventually consistent and asynchronous while
   chat cannot, and how that single difference changes the delivery mechanism
   (push timing, persistence order, and acks).
8. Both the news feed's celebrity problem and Slack's 100K-member channel are
   fan-out problems, but one tolerates eventual consistency and the other demands
   real-time. Describe how the *fan-out unit* differs in the efficient solution to
   each, and what stays the same.

<details>
<summary>Answers</summary>

1. 80M × 50 = 4×10⁹ msgs/day ÷ 10⁵ = **40,000 msg/sec avg**; ×3 peak ≈
   **120,000/sec**. Storage: 4×10⁹ × 1 KB = **4 TB/day**; ×365×2 ≈ 2.9 PB; ×3
   replication ≈ **~8.8 PB**. Conclusions: (a) the message store must be
   **sharded** (petabytes exceed any single machine) with hot/cold tiering; (b)
   the write/delivery path needs a **real-time connection fabric**, not a single
   DB — 120K writes/sec with push delivery can't come off one primary.
2. (1) Requirements: send/deliver group messages real-time, history, receipts;
   NFRs sub-second latency, durable, ordered. (2) Estimation: DAU, msg/sec,
   storage, concurrent connections. (3) API: websocket connect + send; REST for
   history. (4) Data model: message store sharded by conversation_id, time-
   clustered. (5) High-level: conn-server fleet + routing registry + persist-first
   store + fan-out. (6) Deep-dive: group fan-out to conn servers / pub-sub. (7)
   Bottlenecks: connection count, big-channel fan-out. The distinguishing NFR is
   **latency/consistency** — chat needs sub-second, ordered, reliable delivery
   where a feed tolerates seconds of eventual-consistency lag, which forces
   persistent connections and acks.
3. Shortener: shard by **short_code** (pure point lookups → hash partition, no
   clustering needed). Chat: shard by **conversation_id** with clustering on
   **(timestamp, message_id)** because the access pattern is "recent messages in
   this conversation" (range read), so you co-locate and time-order a
   conversation's messages — different access pattern → different clustering.
4. Chat store: lean **AP-ish with strong-enough durability** — under partition
   keep accepting/persisting messages and reconcile order via sequence numbers;
   losing availability (can't send) is worse than brief cross-region staleness,
   though each message must be durably persisted. A bank balance is **CP** — refuse
   rather than serve/accept an inconsistent balance. Quorum: chat can run lower
   R/W for availability; the balance uses **W+R>N** (e.g. N=3,W=2,R=2) for strong
   consistency.
5. "I'll use websockets, which give the server the ability to push messages to
   clients the instant they arrive (sub-second delivery) at the cost of holding
   millions of stateful long-lived connections and a routing registry; that's
   right here because the real-time-delivery NFR can't be met by polling, which
   is both too slow and far more total request volume."
6. (a) **Per-server in-memory connection maps** can't route across the fleet — a
   sender can't find a recipient on another server; fix with a shared
   **presence/routing registry** (KV store, module 04). (b) **Global wall-clock
   ordering** is skewed and unnecessary; fix with a **per-conversation sequence
   number** (ordering concept, this module). (c) **Fire-and-forget** loses
   messages; fix with **persist-first + at-least-once acks + client dedup**
   (idempotency, module 10 / distributed-systems patterns).
7. A feed read is a pull the user initiates and tolerates stale/late data, so
   fan-out can be async and reads served from cache. Chat must deliver *to* a
   recipient the instant a message is sent, in order, without loss — so the
   mechanism becomes **server push over persistent connections**, **persist
   before delivering** (durability), and **acks** (sent/delivered/read) to confirm
   receipt, none of which a feed needs.
8. Feed (eventual): fan-out unit is the **follower's precomputed feed**, done
   async via a queue, and celebrities are *pulled* at read time. Chat big channel
   (real-time): fan-out unit is the **connection server** — publish once per conn
   server holding a member (via pub/sub on channel_id) and deliver locally,
   rather than per-user. What stays the same: both avoid naive per-recipient
   fan-out for high-fan-out cases, and both let offline/absent recipients catch up
   on demand (feed on next read, chat on reconnect sync).

</details>

## Next

[07-designing-a-video-streaming-or-large-scale-search-system](../07-designing-a-video-streaming-or-large-scale-search-system/README.md)
— you've covered read-heavy, write-heavy, and real-time systems; next you'll
tackle two large-scale specializations — video streaming (massive blobs, CDNs,
transcoding, adaptive bitrate) and full-text search (inverted indexes, relevance,
distributed query) — that push storage, bandwidth, and indexing to their limits
and round out the classic problem set before the capstone.
