# Module 07: HTTP/1.1 vs HTTP/2 vs HTTP/3

## Why this matters

Everything you've learned so far — methods, headers, status codes, caching
— is the *semantics* of HTTP, and here's the good news: those semantics
are **identical** across HTTP/1.1, HTTP/2, and HTTP/3. A `GET` is a `GET`,
a `404` is a `404`, `Cache-Control` works the same. What changes between
versions is purely *how the bytes are framed and moved on the wire* — the
performance engineering underneath the same application-level contract.

So why care, if the semantics don't change? Because the wire format
determines real-world speed, and the differences explain things you'll hit
constantly: why bundling all your JS into one file was a performance hack
that HTTP/2 made *unnecessary* (even counterproductive); why a single
dropped packet can stall an entire HTTP/2 connection but not HTTP/3; why
your `curl -v` sometimes says `HTTP/2` and sometimes `HTTP/1.1`; why
HTTP/3 needs UDP and what "QUIC" is. When someone says "we moved to HTTP/2
and cut page load time," you'll know exactly which mechanism did it.

This is also where the module 01 detail — "one connection can carry many
requests" — gets its full story: HTTP/1.1's keep-alive, HTTP/2's
multiplexing, and HTTP/3's independent streams are three increasingly
clever answers to "how do we send many requests fast over one
connection?"

## Concepts

### The one thing that stays the same

HTTP semantics — the meaning of methods, headers, status codes, bodies —
are version-independent. When we say "HTTP/2," we mean a new *transport
framing* for the same messages. Your FastAPI handler code doesn't change
at all between versions; the server/proxy negotiates the version and
frames the bytes. This is why you could learn all of modules 01-06 without
ever mentioning versions: they're the semantic layer, and it's stable.

What changes: how requests/responses are *encoded into bytes*, *multiplexed
over a connection*, and *transported* (TCP vs. UDP). Pure performance.

### HTTP/1.1: text, one-at-a-time per connection

HTTP/1.1 (from 1997, still everywhere) frames messages as the **plain text**
you hand-typed in module 01: a request line, header lines, blank line,
body. Two performance characteristics define it:

- **Persistent connections (keep-alive):** a TCP connection stays open for
  multiple request/response pairs instead of a fresh TCP+TLS handshake per
  request (module 00's expensive setup). This was HTTP/1.1's big win over
  HTTP/1.0.
- **Head-of-line (HOL) blocking at the request level:** on one connection,
  requests are answered **in order, one at a time**. Request 2 can't be
  sent until request 1's response comes back (pipelining was specced but
  broken in practice and effectively unused). So a slow response *blocks*
  everything behind it on that connection.

```
  HTTP/1.1 on one connection — serial; a slow req 1 blocks 2 and 3:
     ├─[ req1 ═══════ slow ═══════ ]
     │                             ├─[ req2 ══ ]
     │                                         ├─[ req3 ══ ]
     └──────────────────── time ──────────────────────────►
```

Browsers worked around this by opening **6+ parallel TCP connections** per
origin — 6 requests at once, but each connection still serial, and each
paying its own handshake cost. This is why front-end performance advice
for years was "reduce the number of requests": bundle all JS into one
file, sprite all images into one image, inline small assets. Those were
all hacks around HTTP/1.1's one-request-at-a-time limit.

### HTTP/2: binary framing and true multiplexing

HTTP/2 (2015) keeps the exact same semantics but changes everything below:

- **Binary framing:** messages are encoded as binary *frames*, not text.
  You can't `telnet` an HTTP/2 server and type a request — it's not
  human-readable on the wire anymore. (curl still shows you the semantic
  request/response; it's decoding the binary for you.)
- **Multiplexing over one connection:** many requests and responses are
  broken into frames and interleaved over a **single** TCP connection,
  each request/response pair being a **stream** with its own ID. Request 2
  no longer waits for request 1 — dozens of requests fly concurrently on
  one connection. This *eliminates HTTP/1.1's request-level HOL blocking*
  and makes the "open 6 connections" and "bundle everything" hacks
  unnecessary (bundling can even hurt, because a change to one file
  invalidates the whole bundle's cache — module 06).
- **Header compression (HPACK):** headers repeat enormously across
  requests (same `User-Agent`, `Cookie`, `Accept` every time). HPACK
  compresses them, saving bandwidth on every request.
- **Server push (mostly dead):** HTTP/2 could "push" resources the client
  hadn't asked for yet. It proved hard to use well and is deprecated/
  removed in practice — don't rely on it.

The catch: HTTP/2 multiplexes over **one TCP connection**, and TCP
guarantees *in-order delivery of the whole byte stream*. So if a single
packet is lost, TCP holds back *all* the streams' data until it's
retransmitted — even streams that had all their bytes. This is
**TCP-level head-of-line blocking**: HTTP/2 solved HOL blocking at the
HTTP layer but inherited it at the TCP layer. On a lossy network (mobile,
congested Wi-Fi), one lost packet stalls every concurrent request.

```
  HTTP/2 — multiplexed streams over ONE TCP connection:
     stream1 ▓▓░▓▓   ┐
     stream2 ▓▓▓▓▓   ├─ interleaved frames, concurrent...
     stream3 ▓▓▓▓░   ┘   but a lost TCP packet (░) stalls ALL streams

  HTTP/3 — independent streams over QUIC/UDP:
     stream1 ▓▓░▓▓   ← only stream1 waits for its retransmit
     stream2 ▓▓▓▓▓   ← keeps flowing
     stream3 ▓▓▓▓▓   ← keeps flowing
```

### HTTP/3: QUIC over UDP kills TCP head-of-line blocking

HTTP/3 (2022) keeps the same semantics *and* the same multiplexing idea,
but replaces the transport. Instead of TCP, it runs over **QUIC**, a new
transport protocol built on **UDP**:

- **Independent streams:** QUIC understands streams *at the transport
  level*. A lost packet affecting stream A no longer blocks streams B and
  C — only stream A waits for its retransmission. This finally eliminates
  the TCP-level HOL blocking HTTP/2 suffered. On lossy networks the
  difference is dramatic.
- **Faster connection setup:** QUIC folds the transport and TLS handshakes
  together, so establishing a secure connection takes fewer round trips
  (often 1-RTT, or 0-RTT for resumption) versus TCP's handshake *then*
  TLS's handshake (module 00's separate steps 3 and 4). Fewer round trips =
  lower latency (module 00's lesson).
- **Connection migration:** a QUIC connection is identified by a
  connection ID, not the IP/port 4-tuple, so it can survive a network
  change — walking from Wi-Fi to cellular doesn't drop your connection.
- **UDP-based:** because it's UDP, it needs no changes to get through most
  networks, but some restrictive firewalls block UDP, in which case
  clients fall back to HTTP/2 over TCP.

Encryption is *mandatory* in HTTP/3 (QUIC has TLS 1.3 built in) — there is
no plaintext HTTP/3.

### How the version gets chosen

You don't usually pick the version in a header. It's negotiated:

- **HTTP/1.1 vs HTTP/2** over TLS is negotiated during the TLS handshake
  via **ALPN** (Application-Layer Protocol Negotiation): the client offers
  `h2` and `http/1.1`; the server picks. (Module 09 covers TLS/ALPN.)
- **HTTP/3** can't be negotiated in-band the same way (it's a different
  transport). A server advertises HTTP/3 availability via the
  **`Alt-Svc`** response header (e.g. `Alt-Svc: h3=":443"`), and a client
  that saw it may try HTTP/3 (UDP) on the next connection, falling back to
  HTTP/2 if UDP is blocked.

So a first visit is often HTTP/2, and the browser upgrades to HTTP/3 on
subsequent connections after seeing `Alt-Svc`.

### The comparison at a glance

| Property | HTTP/1.1 | HTTP/2 | HTTP/3 |
|---|---|---|---|
| Wire format | Text | Binary frames | Binary frames |
| Transport | TCP | TCP | QUIC (UDP) |
| Requests per connection | Serial (1 at a time) | Multiplexed (many) | Multiplexed (many) |
| HTTP-level HOL blocking | Yes | No | No |
| TCP-level HOL blocking | N/A (serial) | Yes (one lost packet stalls all) | No (independent streams) |
| Header compression | No | HPACK | QPACK |
| Handshake round trips | TCP + TLS separately | TCP + TLS separately | Combined (fewer) |
| Encryption | Optional | Optional in spec, always TLS in practice | Mandatory |
| Connection migration | No | No | Yes |
| Negotiated via | (default) | ALPN (`h2`) | `Alt-Svc` header |

### What this means for you as a backend engineer

- Your handler code is version-agnostic — write it once.
- Version is usually decided by your reverse proxy / load balancer / CDN
  (module 00), which terminates HTTP/2 or /3 from the client and often
  talks HTTP/1.1 to your app internally. So your app frequently *sees*
  HTTP/1.1 even when users get HTTP/2 or /3.
- The old "bundle everything / few requests" front-end dogma is an HTTP/1.1
  artifact; under HTTP/2/3 many small cacheable files (module 06) can beat
  one big bundle.
- On lossy/mobile networks, HTTP/3 is a real, measurable win because of
  independent streams and connection migration.

## Command reference

| Command | What it does |
|---|---|
| `curl -v --http1.1 URL` | Force HTTP/1.1; see the text framing |
| `curl -v --http2 URL` | Prefer HTTP/2 (needs TLS + a supporting server) |
| `curl -v --http3 URL` | Try HTTP/3 (needs an HTTP/3-capable curl + server) |
| `curl -sI URL \| grep -i alt-svc` | See if the server advertises HTTP/3 via `Alt-Svc` |
| `curl -w '%{http_version}\n' -o /dev/null -s URL` | Print which version was actually used |

Notes:

- **`--http2` / `--http3`** are *preferences*; the server may not support
  them, and curl falls back. Check the actual version with
  `-w '%{http_version}'`.
- Over plain `http://` (no TLS) you'll get HTTP/1.1 — browsers only do
  HTTP/2 over TLS. Local `uvicorn` speaks HTTP/1.1 by default; to see
  HTTP/2/3 you generally test against a public site or put a proxy in
  front.
- **`Alt-Svc`** in a response is the breadcrumb that a server also offers
  HTTP/3.

## Hands-on exercises

You mostly test against real public servers here (they support HTTP/2/3);
local `uvicorn` is HTTP/1.1.

### 1. Force HTTP/1.1 and read the text framing

```bash
curl -v --http1.1 https://www.cloudflare.com/ 2>&1 | grep -E '^[<>]' | head -20
```

Expected: `> GET / HTTP/1.1` and `< HTTP/1.1 200` — the classic text
protocol lines you learned in module 01. This is the human-readable wire
format.

### 2. See HTTP/2 in action

```bash
curl -v --http2 https://www.cloudflare.com/ 2>&1 | grep -iE 'HTTP/2|ALPN|using http' | head
curl -w 'negotiated: HTTP/%{http_version}\n' -o /dev/null -s https://www.cloudflare.com/
```

Expected: ALPN offering `h2`, lines like `using HTTP/2`, and the version
readout showing `2`. Note the request lines look lowercased/pseudo-header
style (`:method`, `:path`) — that's the binary protocol decoded for you.

### 3. Discover HTTP/3 availability

```bash
curl -sI https://www.cloudflare.com/ | grep -i alt-svc
```

Expected: an `alt-svc: h3=":443"; ...` header — the server advertising
HTTP/3. That header is how a browser learns to try QUIC next time.

### 4. Try HTTP/3 (if your curl supports it)

```bash
curl --http3 -w 'used: HTTP/%{http_version}\n' -o /dev/null -s https://www.cloudflare.com/ 2>&1
```

Expected: if your curl was built with HTTP/3 support, `used: HTTP/3`;
otherwise an error saying HTTP/3 isn't supported (`curl --version` lists
features — look for `HTTP3`). Either outcome teaches you HTTP/3 needs
explicit client support and UDP reachability.

### 5. Compare which version different sites negotiate

```bash
for host in https://www.google.com https://example.com https://www.cloudflare.com; do
  v=$(curl -w '%{http_version}' -o /dev/null -s "$host")
  echo "$host -> HTTP/$v"
done
```

Expected: a mix — most big sites negotiate HTTP/2 (or /3), while
`example.com` may be HTTP/1.1 or /2. This shows negotiation is per-server.

### 6. See that semantics are identical across versions

```bash
curl -s --http1.1 -o /dev/null -w 'h1: code=%{http_code} type=%{content_type}\n' https://example.com/
curl -s --http2   -o /dev/null -w 'h2: code=%{http_code} type=%{content_type}\n' https://example.com/
```

Expected: the same status code and content type regardless of version. The
*meaning* is version-independent; only the framing differed. This is the
module's core point, demonstrated.

### 7. Your local app is HTTP/1.1

```bash
# with `uvicorn app:app` running from an earlier module
curl -w 'local: HTTP/%{http_version}\n' -o /dev/null -s http://127.0.0.1:8000/
```

Expected: `HTTP/1.1`. Plain `http://` and a default uvicorn = HTTP/1.1.
This is why "my app sees HTTP/1.1 even though users get HTTP/2" — a proxy
in front handles the newer version and speaks 1.1 to your app.

### 8. Diagnose and fix: forcing a version that isn't offered

```bash
curl -v --http2-prior-knowledge http://example.com/ 2>&1 | head -15
```

Expected: an error or failure — `--http2-prior-knowledge` tells curl to
*assume* HTTP/2 with no negotiation over *cleartext*, but the server
expects HTTP/1.1 there and the connection breaks. **Diagnose:** you forced
a wire format the server wasn't offering, over a scheme (plain http) where
browsers don't do HTTP/2 anyway. **Fix:** let negotiation happen — use
`--http2` (a preference, with fallback) over `https://`, e.g.
`curl -v --http2 https://example.com/`. Lesson: versions are *negotiated*;
forcing one the peer doesn't offer breaks the connection.

## Independent challenge

No code given.

**Task:** Produce a short written comparison, backed by evidence you
gather yourself, of how a real high-traffic site serves its homepage:
determine (a) which HTTP version your client actually negotiates with it,
(b) whether it advertises HTTP/3, and (c) at least two concrete wire-level
differences you can *observe* between an HTTP/1.1 and an HTTP/2 fetch of
the same URL (hint: look at how request headers appear, and whether
multiple resources could share one connection). Then explain, in terms of
this module's mechanisms, why the old front-end practice of bundling all
JavaScript into one file (which module 06's caching concepts also touch)
became unnecessary — even counterproductive — once that site moved to
HTTP/2. You'll reuse the `curl -w '%{http_version}'` and `Alt-Svc`
techniques from the command reference.

<details>
<summary>Hint</summary>

For (c), fetch the same URL with `--http1.1` and then `--http2` under
`curl -v` and compare the `>`/`<` lines: HTTP/2 shows pseudo-headers
(`:method`, `:path`, `:authority`) and lowercased header names, and its
multiplexing means many resources ride one connection. The bundling point:
under HTTP/1.1's one-request-at-a-time-per-connection limit, fewer files =
fewer serialized round trips; under HTTP/2 multiplexing, many small files
download concurrently on one connection *and* each can be cached and
invalidated independently (module 06), so a one-line change doesn't bust
the whole bundle's cache.

</details>

## Common mistakes & troubleshooting

- **Thinking a new HTTP version changes your API's behavior.** Semantics
  are identical; only framing/transport change. Your handler code is
  version-agnostic.
- **Expecting HTTP/2 over plaintext in browsers.** Browsers only do
  HTTP/2 over TLS. Plain `http://` gets HTTP/1.1.
- **Assuming multiplexing removes *all* head-of-line blocking in HTTP/2.**
  It removes it at the HTTP layer but not at the TCP layer — one lost
  packet still stalls all streams. Only HTTP/3 (QUIC) fixes that.
- **Still bundling aggressively "for performance" under HTTP/2/3.** The
  many-small-requests penalty is largely gone; huge bundles hurt caching.
- **Relying on HTTP/2 Server Push.** It's deprecated/removed in practice.
- **Forgetting your app usually sees HTTP/1.1 behind a proxy.** The proxy
  terminates HTTP/2/3 from users and talks 1.1 to your app. Don't debug
  version behavior in your app expecting the client's version.
- **Assuming HTTP/3 always works.** UDP can be blocked; clients fall back
  to HTTP/2. It's an optimization, not a guarantee.

## Checkpoint quiz

Write down your answer to each question before expanding it — checking without attempting first is the single easiest way to fool yourself into thinking you've learned this.

1. What stays the same across HTTP/1.1, /2, and /3, and what changes?
2. What is HTTP/1.1's core performance limitation on a single connection,
   and what two hacks did front-end developers use to work around it?
3. What does HTTP/2 multiplexing fix, and what head-of-line blocking does
   it *not* fix — and why?
4. How does HTTP/3 eliminate the head-of-line blocking that still affected
   HTTP/2? What transport does it use?
5. How is the version chosen between client and server for HTTP/2 vs.
   HTTP/3?
6. Your users get HTTP/2 but your FastAPI app logs show HTTP/1.1. Explain.
7. Why did "bundle all your JS into one file" stop being good advice under
   HTTP/2?

<details>
<summary>Answers</summary>

1. HTTP *semantics* (methods, headers, status codes, bodies) stay
   identical. What changes is the *wire format* (text vs. binary frames),
   *multiplexing*, and *transport* (TCP vs. QUIC/UDP) — purely
   performance.
2. On one connection, requests are answered serially (one at a time),
   causing request-level head-of-line blocking. Workarounds: open ~6
   parallel TCP connections per origin, and reduce request count by
   bundling JS/spriting images/inlining assets.
3. Multiplexing lets many requests/responses interleave over one
   connection as independent streams, fixing HTTP-level HOL blocking. It
   does *not* fix TCP-level HOL blocking: because it's one TCP connection
   and TCP delivers bytes in order, a single lost packet stalls all streams
   until retransmission.
4. HTTP/3 runs over QUIC (on UDP), which understands streams at the
   transport layer, so a lost packet only stalls its own stream, not the
   others — eliminating TCP-level HOL blocking.
5. HTTP/1.1 vs HTTP/2 is chosen during the TLS handshake via ALPN (client
   offers `h2`/`http/1.1`, server picks). HTTP/3 is advertised via the
   `Alt-Svc` response header and tried on a later connection over UDP.
6. A reverse proxy/load balancer/CDN terminates HTTP/2 from the user and
   forwards the request to your app over HTTP/1.1 internally, so the app
   only ever sees HTTP/1.1.
7. HTTP/2 multiplexes many requests concurrently over one connection, so
   many small files download in parallel without the old per-request
   penalty — and keeping them separate means one file changing doesn't
   invalidate the whole bundle's cache (module 06).

</details>

## Further reading & sources

- [MDN: Evolution of HTTP](https://developer.mozilla.org/en-US/docs/Web/HTTP/Basics_of_HTTP/Evolution_of_HTTP) - a readable history of the 0.9 → 1.1 → 2 → 3 progression and why each changed.
- [RFC 9113: HTTP/2](https://www.rfc-editor.org/rfc/rfc9113) - the authoritative spec for binary framing, streams, and HPACK.
- [RFC 9114: HTTP/3](https://www.rfc-editor.org/rfc/rfc9114) and [RFC 9000: QUIC](https://www.rfc-editor.org/rfc/rfc9000) - the HTTP/3 mapping and the QUIC transport it rides on.
- [Cloudflare: HTTP/3 vs HTTP/2](https://blog.cloudflare.com/http3-the-past-present-and-future/) - a clear explainer of QUIC, HOL blocking, and connection migration.
- [caniuse: HTTP/3](https://caniuse.com/http3) and [HTTP/2](https://caniuse.com/http2) - real-world browser and version support you can cite.
- [MDN: Alt-Svc](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Alt-Svc) - the header that advertises HTTP/3 availability, from exercise 3.

## Next

[08-content-negotiation-and-compression](../08-content-negotiation-and-compression/README.md)
— now that you understand connections and framing, we look at how client
and server agree on *format* and *encoding*: content negotiation and
compression.
