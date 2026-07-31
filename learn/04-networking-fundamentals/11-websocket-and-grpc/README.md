# WebSocket & gRPC

## Why this matters

Every protocol this track has covered so far — HTTP included — follows
the same shape: client sends a request, server sends one response, done.
Module 04's HTTP is genuinely request/response only, even with
keep-alive connections reusing the same TCP connection for many separate
request/response pairs. Two real needs don't fit that shape at all: a
server that needs to **push** data to a client the instant something
happens, with no new request to trigger it (a chat message arriving, a
live price update) — and fast, strongly-typed calls **between your own
backend services** where JSON's flexibility and HTTP's per-request
overhead cost more than they're worth. **WebSocket** solves the first;
**gRPC** solves the second. Both build directly on protocols you already
know (WebSocket upgrades from an HTTP request; gRPC runs over HTTP/2) —
this module is about what changes once you go beyond plain request/
response, not a new foundation.

## Concepts

### The limitation both protocols exist to fix

Plain HTTP request/response means the **client always initiates**. A
server has no way to say "here's a new message" unless the client asks
first. Before WebSocket existed, workarounds like **polling** (the client
repeatedly asks "anything new?" every few seconds) and **long polling**
(the client asks, and the server holds the request open until something
actually happens, then responds) simulated push over request/response —
at the cost of either wasted requests (polling) or one held-open
connection per waiting client (long polling), neither of which is what
you actually want for something like a chat app with thousands of
simultaneously-connected users.

### WebSocket: one persistent, two-way connection

**WebSocket** starts as a normal HTTP request carrying an `Upgrade:
websocket` header — the server, if it supports WebSocket, responds `101
Switching Protocols`, and from that point on the **same underlying TCP
connection** (module 03) stops speaking HTTP and starts speaking the
WebSocket protocol instead: a lightweight, persistent, full-duplex
channel where **either side can send a message to the other at any
time**, with no new request/response cycle needed per message. This is
the direct mechanism behind live chat, real-time notifications,
collaborative editing, and live dashboards — the server can push the
instant something happens, and the client can send without waiting for a
poll interval.

The handshake matters to understand for debugging: a WebSocket connection
that fails to establish is failing at that initial HTTP `Upgrade`
request — which means everything you already know about HTTP headers,
status codes, and TLS (module 04) still applies to *that* first step,
before WebSocket's own framing ever begins. A proxy or load balancer
(module 06/10) that doesn't know to preserve the `Upgrade`/`Connection`
headers, or that closes idle connections after a timeout tuned for normal
HTTP request/response, is a common, specific cause of "WebSocket connects
then randomly drops" — because the intermediary is treating a long-lived
persistent connection the way it'd treat a normal short HTTP request.

### gRPC: fast, strongly-typed calls between services

**gRPC** is a remote-procedure-call (RPC) framework — instead of a client
constructing an HTTP request and parsing a JSON response by hand, you
define a **service contract** in **Protocol Buffers (protobuf)**, a
strongly-typed schema language, and generated client/server code lets you
call a remote method that *looks like* a normal local function call. Two
things make it fast and strict where a typical JSON-over-HTTP API isn't:

- **Protobuf's binary encoding** is smaller and faster to
  serialize/deserialize than JSON's text-based format — meaningful at the
  volume of internal service-to-service traffic a real backend generates.
- **The schema is enforced by generated code**, not by convention or
  runtime validation — a field that's supposed to be an integer literally
  cannot arrive as a string the way it silently could in a hand-parsed
  JSON API, because the generated client/server code won't compile or
  serialize it that way in the first place.

gRPC runs **over HTTP/2**, not HTTP/1.1 — this is a deliberate design
choice, not an implementation detail, because HTTP/2's
**multiplexing** (many concurrent request/response exchanges over one
single TCP connection, no head-of-line blocking between them) is what
lets gRPC support genuinely concurrent calls efficiently on one
connection, and its native support for **streaming** (data flowing
continuously in one or both directions over the life of a call, not just
one request then one response) is what lets gRPC offer four call shapes
instead of HTTP's one:

- **Unary** — one request, one response (the familiar shape).
- **Server streaming** — one request, a stream of responses over time
  (e.g. subscribing to ongoing updates).
- **Client streaming** — a stream of requests, one final response (e.g.
  uploading data in chunks, then getting a summary).
- **Bidirectional streaming** — both sides stream to each other
  concurrently over the same call, closest in spirit to what a WebSocket
  gives you, but strongly-typed and RPC-shaped rather than raw messages.

### When to use which — and when to use neither

None of WebSocket, gRPC, or plain HTTP is a universal replacement for the
others; each fits a different shape of communication:

- **Plain HTTP/REST** — the default for public-facing APIs and anything
  browser-facing that's genuinely request/response — universal client
  support, human-readable JSON, cacheable (module 10's entire CDN chapter
  assumes this shape), and the least operationally surprising choice.
- **WebSocket** — when the server genuinely needs to push to the client
  unprompted, and low-latency two-way messaging matters (chat, live
  collaboration, real-time dashboards, gaming). Browser-native, so it's
  the right choice specifically when a *browser* is one end of the
  connection.
- **gRPC** — internal service-to-service calls where both ends are
  services you control (so you can generate and deploy matching
  client/server code from the same schema), and you want speed, strict
  typing, and/or streaming. Historically weaker/awkward direct browser
  support (needs a proxy layer like gRPC-Web) is why it's rarely the
  first choice for a public browser-facing API, even though it's
  extremely common *behind* one.

A real production system commonly uses all three at once for different
edges: REST or GraphQL-style HTTP for the public API, WebSocket for a
live-updating dashboard feature, and gRPC for the internal calls between
your own microservices — matching the protocol to what each specific
connection actually needs, not standardizing on one everywhere.

### How these interact with everything else in this track

WebSocket and gRPC don't replace the layers you've already learned —
they sit on top of them, and every earlier module's diagnostic instincts
still apply, adjusted for the new shape:

- **Load balancing (module 06)**: a WebSocket connection is long-lived,
  so **round-robin per-message doesn't apply** — the balancer picks a
  backend once, at connection time, and the entire persistent connection
  stays pinned there (this is effectively forced "stickiness," not
  optional). gRPC's HTTP/2 multiplexing creates a related but different
  wrinkle: a balancer that load-balances at the *TCP connection* level
  (common for plain HTTP/1.1) can end up sending a huge number of
  multiplexed gRPC calls to one backend if it doesn't understand HTTP/2
  well enough to balance at the individual-request/stream level instead.
- **CDN/reverse proxy (module 10)**: a plain content-caching CDN has
  nothing meaningful to cache for either protocol (there's no static,
  repeatable response) — both need the proxy layer configured explicitly
  to pass through/preserve the upgrade and multiplexing behavior rather
  than caching or buffering it.
- **Firewalls/timeouts (module 05)**: a firewall or proxy idle-timeout
  tuned for short-lived HTTP request/response can silently kill a
  perfectly healthy, just-currently-quiet WebSocket or gRPC streaming
  connection — this is the single most common real-world "why does my
  persistent connection randomly drop after N minutes" bug, and the fix
  is almost always either raising the idle timeout or adding an
  application-level keepalive/ping message, not anything wrong with the
  WebSocket/gRPC code itself.

## Command reference

| Command | What it does | Example |
|---------|--------------|---------|
| `curl -i -N -H "Upgrade: websocket" ...` | Manually sends a WebSocket upgrade request to inspect the raw handshake | `curl -i -N -H "Connection: Upgrade" -H "Upgrade: websocket" -H "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==" -H "Sec-WebSocket-Version: 13" http://localhost:8080/` |
| `websocat` | A CLI WebSocket client for interactive testing (install via package manager) | `websocat ws://localhost:8080/chat` |
| `grpcurl` | A CLI gRPC client — like `curl` for gRPC, works even without generated client code | `grpcurl -plaintext localhost:50051 list` |
| `curl --http2` | Forces HTTP/2, useful to confirm a server actually supports the protocol gRPC requires | `curl --http2 -I https://example.com/` |
| `nc` | Low-level: watch the raw handshake response/upgrade bytes on the wire | `nc localhost 8080` then paste a raw upgrade request |

Flag/output notes:

- `curl -i -N -H "Upgrade: websocket" ...` — `-i` includes response
  headers, `-N` disables curl's output buffering (needed to see a
  streamed/kept-open response as it happens rather than only after the
  connection closes). A successful handshake shows `101 Switching
  Protocols` in the response; anything else (a normal `200`, a `404`,
  or the connection just hanging) means the upgrade itself failed, before
  any WebSocket-specific behavior is even relevant.
- `grpcurl -plaintext localhost:50051 list` — `-plaintext` skips TLS
  (fine for local testing, never for production traffic); `list` uses
  gRPC's reflection API (if the server has it enabled) to enumerate
  available services without needing the `.proto` schema file locally —
  the gRPC equivalent of hitting an unknown REST API's root and seeing
  what's there.
- `curl --http2 -I https://example.com/` — confirms whether a server
  actually negotiates HTTP/2 (`HTTP/2 200` in the response) versus
  silently falling back to HTTP/1.1, which is worth checking directly
  before assuming a gRPC deployment issue is application-level rather
  than "the server/proxy in front of it doesn't actually speak HTTP/2."

## Hands-on exercises

Install `websocat` and `grpcurl` (both available via common package
managers) for the interactive exercises; a simple Python
`websockets`-library script or Node `ws` script works fine as a
throwaway WebSocket server if you don't have one handy.

1. **Watch a WebSocket handshake succeed by hand.** Stand up any simple
   WebSocket echo server (a few lines with Python's `websockets` library
   or `websocat -s 8080` in echo mode). Run the manual `curl` upgrade
   request from the Command reference against it. Expected: a `101
   Switching Protocols` response — confirm this is happening *before* any
   WebSocket message has been exchanged, purely from the HTTP-level
   handshake succeeding.

2. **Send and receive over the persistent connection.** Connect with
   `websocat ws://localhost:8080/` (against your echo server) and type a
   few messages. Expected: each message you send is echoed back
   immediately over the *same* connection — no new request/response
   cycle, no new TCP handshake per message (confirm with `ss -tan` in
   another terminal that exactly one connection to that port stays
   `ESTABLISHED` the whole time you're chatting).

3. **Break the handshake and read the failure.** Repeat exercise 1's
   manual `curl` request but omit the `Sec-WebSocket-Version` header.
   Expected: the server rejects the upgrade (commonly a `400`), not a
   `101` — confirming that a WebSocket failure at this stage is a normal,
   readable HTTP error, using nothing beyond module 04's vocabulary.

4. **List gRPC services with grpcurl.** Stand up any simple gRPC server
   with reflection enabled (many example/tutorial gRPC servers in any
   language enable this by default), then run `grpcurl -plaintext
   localhost:50051 list`. Expected: the available service/method names
   print out — confirm you did this with no `.proto` file on hand,
   purely via the server's own reflection.

5. **Call a unary gRPC method and inspect it as HTTP/2.** Use `grpcurl`
   to invoke a simple method, then separately confirm the server
   negotiates HTTP/2 with `curl --http2 -I` against the same port (if it
   also serves plain HTTP, otherwise reason about why gRPC specifically
   requires this rather than testing it directly). Connect the dots: the
   gRPC call you just made was, underneath, one HTTP/2 stream on a
   connection that could be carrying several other concurrent streams
   simultaneously — module 03's one-TCP-connection idea, with HTTP/2
   multiplexing multiple logical exchanges on top of it.

6. **Diagnose and fix: the idle-timeout drop.** Simulate it: put a
   reverse proxy (reuse module 10's NGINX setup) in front of your
   WebSocket echo server with a deliberately short
   `proxy_read_timeout` (e.g. 5s). Connect with `websocat` through the
   proxy and go quiet (send nothing) for longer than the timeout.
   Expected: the connection drops even though both the client and the
   real WebSocket server are still healthy — the proxy killed an
   idle-but-fine connection because its timeout was tuned for normal
   short-lived HTTP requests. **Fix**: raise `proxy_read_timeout` to a
   value appropriate for a long-lived connection (or add periodic
   ping/pong keepalive messages from the client so the connection is
   never actually idle from the proxy's point of view), and confirm the
   connection now survives the same quiet period.

## Independent challenge

No lab given. A team runs a chat feature over WebSocket, deployed behind
a load balancer distributing traffic across four backend instances
(module 06's setup). Users intermittently report messages from other
users not appearing in real time, even though the WebSocket connection
itself shows as open in the browser dev tools the whole time. Using this
module's concept of how load balancing interacts with a persistent
connection, explain the likely architectural cause (not a bug in the
WebSocket code itself) and the fix. Hint: think about what has to be true
for *any* backend instance to be able to push a message to *any*
connected user, when each user's WebSocket connection is pinned to
exactly one backend instance for its entire lifetime.

<details><summary>Stuck? One hint</summary>

Each user's WebSocket connection is pinned to whichever single backend
instance the load balancer picked at connect time (per this module's
Concepts section). If User A's connection lives on backend 2 and sends a
message meant for User B, whose connection lives on backend 3, backend 2
has no way to reach User B's socket directly — it's a completely
separate process, possibly on a separate machine. The connection being
"open" in the browser is irrelevant if the message never reaches the
backend instance actually holding that specific user's socket. The fix
is introducing a shared message-distribution layer between backend
instances — commonly a pub/sub system (Redis pub/sub, or a message
broker) that every backend instance subscribes to, so when backend 2
receives a message for User B, it publishes it to the shared layer, and
backend 3 (holding User B's actual connection) receives it from there and
pushes it down that specific socket. This is a genuinely common real
gap in a first WebSocket-plus-load-balancer deployment — connection
pinning solves *routing a user to a backend*, but says nothing about
*backends talking to each other*, which turns out to be required the
moment two different users' connections land on two different instances.

</details>

## Common mistakes & troubleshooting

- **Load-balancing a WebSocket connection per-message instead of
  per-connection.** A persistent connection has to stay pinned to one
  backend for its lifetime — this is forced stickiness, not optional, and
  getting it wrong breaks the connection outright rather than just
  unbalancing load.
- **Assuming backend instances can push to any connected user without a
  shared layer.** The independent challenge's exact gap — connection
  pinning alone doesn't let one backend instance message a user connected
  to a different instance; that needs an explicit pub/sub or broker layer
  between backends.
- **Reusing HTTP/1.1-tuned idle timeouts for a persistent
  WebSocket/gRPC connection.** Exercise 6's bug, and a very common
  real-world cause of "randomly drops after a few minutes" — raise the
  timeout or add application-level keepalive pings.
- **Treating a WebSocket handshake failure as mysterious instead of a
  normal HTTP error.** It's still HTTP at that stage — a non-`101`
  response has an ordinary, readable status code and headers, per module
  04's vocabulary (exercise 3).
- **Choosing gRPC for a public, browser-facing API by default.** Direct
  browser support is weak/awkward without an extra proxy layer
  (gRPC-Web) — plain HTTP/REST is almost always the better fit for a
  public API a browser calls directly; gRPC shines specifically for
  internal service-to-service calls you control both ends of.
- **Assuming a CDN/cache in front of a WebSocket or gRPC endpoint helps
  the way it helps static content (module 10).** Neither produces a
  cacheable, repeatable response — the proxy layer needs to be configured
  to pass the connection/stream through, not attempt to cache it.

## Checkpoint quiz

Write down your answer to each question before expanding it — checking
without attempting first is the single easiest way to fool yourself into
thinking you've learned this.

1. What problem do WebSocket and gRPC's streaming modes both solve that
   plain HTTP request/response cannot, and what workaround did people use
   before WebSocket existed?
2. How does a WebSocket connection start, and what single response status
   confirms the handshake succeeded?
3. Why does gRPC run over HTTP/2 specifically, rather than HTTP/1.1?
4. Name gRPC's four call shapes and what makes bidirectional streaming
   the closest in spirit to WebSocket.
5. Why can't a normal round-robin load balancer treat a WebSocket
   connection the same way it treats individual HTTP requests?
6. A persistent connection (WebSocket or gRPC stream) drops after a few
   minutes of inactivity even though both endpoints are healthy. What's
   the likely cause, and what are the two possible fixes?
7. Why is gRPC usually the wrong choice for a public API a browser calls
   directly, but a common choice for internal service-to-service calls?

<details><summary>Show answers</summary>

1. Both solve the need for the server to push data to the client (or for
   data to flow continuously in one or both directions) without a new
   request initiating each exchange — something plain HTTP request/
   response cannot do at all. Before WebSocket, people simulated this
   with polling (repeated requests asking "anything new?") or long
   polling (holding a request open until something happens), both
   costlier workarounds around the same fundamental limitation.
2. It starts as a normal HTTP request carrying `Upgrade: websocket` (and
   related headers); the server responds `101 Switching Protocols` to
   confirm the handshake succeeded, after which the same TCP connection
   switches from speaking HTTP to speaking the WebSocket protocol.
3. Because HTTP/2's multiplexing (many concurrent exchanges over one TCP
   connection with no head-of-line blocking between them) and native
   streaming support are exactly what let gRPC support efficient
   concurrent calls and its four call shapes (including streaming) — HTTP
   /1.1 doesn't provide either capability.
4. Unary (one request, one response); server streaming (one request, a
   stream of responses); client streaming (a stream of requests, one
   response); bidirectional streaming (both sides stream concurrently).
   Bidirectional streaming is closest to WebSocket because both sides can
   send data to each other continuously over the life of the call, the
   same two-way, ongoing-exchange shape WebSocket provides — just
   strongly-typed and RPC-shaped rather than raw messages.
5. A WebSocket connection is long-lived and stateful for its whole
   duration — the balancer must pick one backend at connection time and
   keep every subsequent message on that same connection routed to that
   same backend, because switching backends mid-connection would break
   the persistent channel entirely. This is forced pinning, not an
   optional stickiness feature you can turn off.
6. Likely cause: a firewall or reverse-proxy idle timeout tuned for
   short-lived HTTP request/response killed the connection simply for
   being quiet, not because either endpoint failed. Fixes: raise the
   relevant idle/read timeout to suit a long-lived connection, or add
   application-level keepalive/ping messages so the connection is never
   actually idle from the intermediary's point of view.
7. gRPC has historically weak/awkward direct browser support, needing an
   extra proxy layer (gRPC-Web) to work from a browser at all — plain
   HTTP/REST has universal browser support and is cacheable/human-
   readable, better fitting a public API. For internal service-to-service
   calls, you control both the client and server, so you can generate and
   deploy matching code from one shared schema and get gRPC's speed and
   strict typing without the browser-compatibility concern applying at
   all.

</details>

## Next

[12 — Capstone project](../12-capstone-project/README.md): put the whole
toolkit — layering, addressing, DNS, TCP/UDP, TLS, routing/NAT/firewalls,
routing protocols, VPNs, load balancing, CDN/reverse proxy, and now
WebSocket/gRPC — to work diagnosing and fixing a chain of deliberately
broken connectivity problems across a small multi-host lab.
