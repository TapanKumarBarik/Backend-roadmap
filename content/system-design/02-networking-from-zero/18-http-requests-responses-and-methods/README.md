# Lesson 18: HTTP Part 1 — Requests, Responses and Methods

> **Prerequisites:** [Lesson 07: What Happens When You Type a URL](../07-what-happens-when-you-type-a-url/README.md), [Lesson 17: DNS Traffic Management](../17-dns-traffic-management/README.md), and [Networking From Zero Overview](../README.md) (Lesson 18 of 30).  
> **Estimated Reading Time:** 35 minutes  
> **Target Audience:** Backend and API engineers designing REST endpoints, hardening reverse proxies against `CL.TE` HTTP request smuggling, and implementing retry-safe `Idempotency-Key` middleware.  
> **Free PDF Notes:** [Download SD-N-018.pdf](https://backendroadmap.com/notes/system-design/SD-N-018.pdf)

> [!NOTE]
> **In one line:** HTTP is a stateless request/response protocol framed in text; idempotent methods are safe to retry, `POST` needs an `Idempotency-Key`, conflicting `Content-Length` and `Transfer-Encoding` headers enable request smuggling, and ETags turn a re-download into a tiny `304`.

> [!TIP]
> **The Golden Rule of HTTP Wire Framing & Methods:** HTTP/1.1 runs as plain text over a continuous TCP byte stream delimited by `\r\n\r\n`, `Content-Length`, or `Transfer-Encoding: chunked`—so front proxies and origin servers must **never disagree on message boundaries** (`400 Bad Request` on conflicting `CL` + `TE`). On top of that wire contract, design retries strictly around method semantics: **`Safe` (`GET`, `HEAD`, `OPTIONS`)** and **`Idempotent` (`PUT`, `DELETE`)** calls retry cleanly, whereas **`POST`** mutations require an explicit **`Idempotency-Key`** to prevent duplicate charges.

---

## Words You'll Meet Today

| Word | In Plain Words | Role in a Live Backend System |
| :--- | :--- | :--- |
| **Request-line / Status-line** | The very first line of an HTTP message. | Declares `METHOD /path HTTP/1.1` on requests or `HTTP/1.1 200 OK` on responses. |
| **`CRLF` (`\r\n`)** | Carriage Return + Line Feed line ending. | Separates every header line; a double `\r\n\r\n` marks where headers end and body begins. |
| **`Host` header** | Mandatory HTTP/1.1 header naming the target domain. | Enables virtual hosting so one reverse proxy IP serves thousands of domains. |
| **`Content-Length`** | Exact byte size of the message body in decimal. | Tells a keep-alive TCP socket exactly how many bytes belong to this request/response. |
| **`Transfer-Encoding: chunked`** | Sending a body in size-prefixed streaming pieces. | Allows dynamic responses/uploads without knowing total size upfront, ending in `0\r\n\r\n`. |
| **Request smuggling (`CL.TE`)** | Exploiting front/back-end disagreement on body length. | Smuggles a hidden second request inside a keep-alive socket, hijacking another user's traffic. |
| **Safe method** | A read-only HTTP method (`GET`, `HEAD`, `OPTIONS`). | Guarantees clients, crawlers, and caches can call it freely with zero state mutation. |
| **Idempotent method** | Calling once or ten times yields the same server state. | Lets network clients safely retry `GET`, `PUT`, `DELETE`—or `POST` paired with `Idempotency-Key`. |

---

## Visual Mental Models & Architecture

### The Question: What Bytes Actually Flow Over the TCP Socket?

In [Lesson 17](../17-dns-traffic-management/README.md), DNS resolved a hostname to an IP, and TCP opened a clean stream of bytes between your client and the server. Yet TCP knows nothing about URLs, JSON payloads, or API endpoints—it only delivers raw bytes in order. How does a server sharing one TCP socket across fifty consecutive requests know where request #1 ends and request #2 begins, or whether retrying a timed-out payment call is safe?

### An Everyday Picture First: A Sealed Crate with a Shipping Waybill

Think of sending an HTTP/1.1 message like dropping boxes onto a continuously moving conveyor belt (a persistent TCP connection):

- The **top line** is the job order: *"GET item `/v1/orders` using protocol HTTP/1.1"* (`request-line`).
- The **sticker lines** below list metadata: which tenant building inside the warehouse owns the box (**`Host`**), what format is inside (`Content-Type`), and either **"exactly 42 kilograms"** (`Content-Length: 42`) or **"sub-crates labeled with weight, ending with a 0-kg empty box"** (`Transfer-Encoding: chunked`).
- An **empty gap line** (`\r\n\r\n`) separates the shipping label from the actual crate contents (`body`).
- **The smuggling trap:** If the front loading dock weighs the box by the `42 kg` sticker (`CL`) while the back warehouse reads the sub-crate end marker (`TE`), an attacker can pack a sneaky second box *inside* the first crate—and the warehouse executes it on the next customer's turn!

### Exact HTTP/1.1 Wire Anatomy

On the wire, an HTTP/1.1 request and response are plain ASCII headers ending at `\r\n\r\n`, followed by optional body bytes:

```text
POST /v1/charges HTTP/1.1\r\n
Host: api.payments.example\r\n
Content-Type: application/json\r\n
Idempotency-Key: 9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d\r\n
Content-Length: 27\r\n
\r\n
{"amount":4900,"ccy":"USD"}
--- Response on same TCP socket ---
HTTP/1.1 201 Created\r\n
Location: /v1/charges/ch_8812\r\n
Content-Length: 30\r\n
\r\n
{"id":"ch_8812","status":"ok"}
```

Notice the four structural parts:
1. **Start-line:** Request-line (`METHOD SP request-target SP HTTP-version CRLF`) or Status-line (`HTTP-version SP status-code SP reason-phrase CRLF`).
2. **Headers (`key: value\r\n`):** Case-insensitive field names. In HTTP/1.1, **`Host` is mandatory** (`RFC 9112`): one cloud load balancer IP (`198.51.100.10`) serves `api.foo.com` and `admin.bar.com` via **virtual hosting**, so missing or duplicate `Host` headers MUST return **`400 Bad Request`**.
3. **Blank-line delimiter (`\r\n\r\n`):** Marks where headers end and the optional body begins.
4. **Optional Message Body:** Present when `Content-Length` or `Transfer-Encoding` is sent.

```mermaid
flowchart TD
    S["Raw TCP Byte Stream"] --> L1["1. Start-Line: METHOD /path HTTP/1.1 + CRLF"]
    L1 --> H["2. Headers: Host, Content-Type, Auth + CRLF"]
    H --> D["3. Empty Line Delimiter: CRLF CRLF"]
    D --> F{"Body Framing Header?"}
    F -->|"Neither CL nor TE"| NB["Zero-Byte Body (e.g. GET / HEAD / 204)"]
    F -->|"Content-Length: N"| CL["Read Exactly N Bytes"]
    F -->|"Transfer-Encoding: chunked"| TE["Read Hex-Length Chunks Until 0 CRLF CRLF"]
    F -->|"Both CL and TE Present!"| ERR["Reject 400 Bad Request (Prevent CL.TE Smuggling!)"]
```

*Figure 1. Exact HTTP/1.1 wire parsing pipeline over a persistent TCP stream: the blank `\r\n\r\n` boundary separates headers from the body, whose length must be framed unambiguously.*

### `Content-Length` vs. `Transfer-Encoding: chunked` & `CL.TE` Smuggling

When `Connection: keep-alive` (default in HTTP/1.1) reuses one TCP socket for multiple back-to-back requests, both client and server must agree **to the exact byte** where Request 1 ends and Request 2 begins:

- **`Content-Length: 27`**: Sender knows the full payload size upfront (`27` bytes); receiver reads `27` bytes and immediately expects Request 2 next.
- **`Transfer-Encoding: chunked`**: Streams chunks dynamically using **hexadecimal** byte lengths (`5\r\nhello\r\n6\r\n world\r\n0\r\n\r\n`), ending with a `0`-byte sentinel chunk.

**How `CL.TE` HTTP Request Smuggling Happens:**
Suppose an attacker sends a malformed request containing **both** `Content-Length: 13` and `Transfer-Encoding: chunked`, with body `0\r\n\r\nSMUGGLED`:
- The **front-end proxy** looks only at `Content-Length: 13` (`CL`), reads all `13` bytes, and forwards the whole packet down a shared keep-alive backend TCP pool.
- The **back-end server** follows `Transfer-Encoding: chunked` (`TE`): it sees `0\r\n\r\n` and stops parsing Request 1 after `5` bytes! The remaining `8` bytes (`SMUGGLED`—actually a crafted prefix like `GET /admin/delete HTTP/1.1\r\n...`) stay stuck in the backend socket buffer and **prepend themselves to the next victim user's legitimate request**!

**The `RFC 9112` Hardening Rule:** If a request contains both `Transfer-Encoding` and `Content-Length`, or multiple differing `Content-Length` headers, proxies and servers MUST reject it immediately with **`400 Bad Request`** and close the TCP connection. Even better: terminate HTTP/2 or HTTP/3 between proxies and backends (`h2c` / `HTTP/2`) because HTTP/2 uses binary length-prefixed frames rather than text delimiters, eliminating `CL.TE` ambiguity altogether.

```mermaid
sequenceDiagram
    participant Att as Attacker
    participant Proxy as Legacy Front Proxy (Uses CL)
    participant Back as Legacy Backend (Uses TE)
    participant Vic as Victim User

    Att->>Proxy: POST / with CL=36, TE=chunked, body "0\r\n\r\nGET /admin HTTP/1.1\r\nX: "
    Note over Proxy: Reads 36 bytes using CL -> sees 1 request
    Proxy->>Back: Forwards 36 bytes on shared keep-alive pool
    Note over Back: Parses TE chunked -> stops at "0\r\n\r\n"! Leaves "GET /admin..." buffered!
    Back-->>Proxy: 200 OK for Attacker POST
    Vic->>Proxy: GET /profile with Cookie=secret_session
    Proxy->>Back: Appends Victim GET onto same pooled socket
    Note over Back: Prepends buffered "GET /admin..." + Victim Cookie!
    Back-->>Vic: Executes smuggled admin action with Victim Cookie!
```

*Figure 2. `CL.TE` request smuggling over a shared keep-alive backend connection: conflicting body-length rules let an attacker poison the next legitimate caller's request.*

### Safe vs. Idempotent Methods & Why Retries Need `Idempotency-Key`

HTTP methods are not just labels—they are **machine-readable safety contracts** for browsers, load balancers, and retry libraries:

1. **Safe Methods (`GET`, `HEAD`, `OPTIONS`):** Must **never** mutate server state (read-only). Search crawlers, prefetchers, and load balancers can invoke or retry them freely. (`HEAD` returns identical headers as `GET` with zero body; `OPTIONS` queries CORS/method capabilities.)
2. **Idempotent Methods (`GET`, `HEAD`, `OPTIONS`, `PUT`, `DELETE`):** Calling an idempotent endpoint $1$ time or $N$ times leaves the **server resource in the exact same final state** (ignoring log entries or timestamps).
   - **Watch the `DELETE` subtlety:** First `DELETE /orders/42` returns `200 OK`; a retry after a dropped packet returns `404 Not Found`. Is `DELETE` still idempotent? **Yes!** Idempotency governs **final server state** (order `42` no longer exists), not receiving identical HTTP status codes.
   - **Full-replacement `PUT` vs. Partial `PATCH`:** `PUT /users/7` replaces the entire user object (`{"name":"Ana","plan":"pro"}`)—retrying produces the exact same user record (`idempotent`). `PATCH` is *not* idempotent by specification: `{"op":"increment","balance":50}` adds `50` on every retry unless written as conditional overwrite or keyed!
3. **Non-Idempotent `POST` + `Idempotency-Key`:** `POST /v1/charges` creates a brand-new resource each time. If your mobile SDK sends `POST /v1/charges`, the server commits the charge, and a cellular tunnel drops before `201 Created` reaches the phone, blindly retrying `POST` charges the customer **twice**.
   - **The Production Pattern (`Idempotency-Key`):** Client generates a random UUIDv4 (`Idempotency-Key: <uuid>`) once per logical checkout attempt and sends it across retries. The server atomically stores `(client_id, idempotency_key) -> {request_hash, status, body}` in a durable database/Redis lock:
     - First arrival: executes charge, persists response, returns `201 Created`.
     - Retry with identical key & matching payload hash: **skips charge execution and replays the cached `201 Created`**!
     - Retry with identical key while first request is still running: returns **`409 Conflict`** (or waits on lock).
     - Reuse of old key with a *different* request payload: rejects with **`422 Unprocessable Content`** (`400`) to catch client bugs!

```mermaid
flowchart TD
    M["HTTP Request Timed Out / Returned 503"] --> CHK{"Which HTTP Method?"}
    CHK -->|"GET, HEAD, OPTIONS"| SAFE["Safe & Idempotent: Retry Immediately (Backoff + Jitter)"]
    CHK -->|"PUT, DELETE"| IDEM["Idempotent (Not Safe): Safe to Retry if Unconditional"]
    CHK -->|"POST or Non-Idempotent PATCH"| KEY{"Has Client Idempotency-Key?"}
    KEY -->|"Yes"| RETRY["Safe to Retry: Server Deduplicates & Replays Stored Result"]
    KEY -->|"No"| STOP["NEVER Auto-Retry: Surface Uncertain State to Caller"]
```

*Figure 3. Retry safety decision tree: only Safe methods, unconditionally Idempotent methods, or `POST` requests protected by a server-enforced `Idempotency-Key` can be automatically retried.*

---

## Systematic Reference & Comparison Grid

### HTTP Method Semantics (`RFC 9110`)

| Method | Typical Request Body? | Safe (Read-Only)? | Idempotent? | Cacheable? | Auto-Retry Safe on Network Timeout? |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **`GET`** | No (ignored/discouraged) | **Yes** | **Yes** | **Yes** | **Yes** |
| **`HEAD`** | No | **Yes** | **Yes** | **Yes** | **Yes** |
| **`OPTIONS`** | Rare | **Yes** | **Yes** | No | **Yes** |
| **`PUT`** | Yes (full replacement) | No | **Yes** | No | **Yes** (if no relative counter) |
| **`DELETE`** | Optional (avoid) | No | **Yes** | No | **Yes** (`200`/`204`/`404` all valid) |
| **`POST`** | Yes | No | **No** | Rare (explicit only) | **Only with `Idempotency-Key`** |
| **`PATCH`** | Yes (partial diff) | No | **No** (unless designed so) | No | **Only if conditional (`If-Match`) or keyed** |

### HTTP/1.1 Framing Validation & Retry Math

Consider a checkout API at $1{,}000\text{ RPS}$ experiencing a $1.5\%$ TCP/LB response-drop rate (`504` after origin commit). Without `Idempotency-Key`, auto-retrying `POST` causes:

$$\text{Duplicate Charges/sec} = 1{,}000\text{ RPS} \times 0.015 = 15\text{ double-charges per second}\; (54{,}000/\text{hour})$$

Meanwhile, for chunked streaming (`Transfer-Encoding: chunked`), every chunk of length $L_i$ bytes adds $\lceil \log_{16}(L_i + 1) \rceil + 4$ framing bytes (`hex_len` + `\r\n` + `\r\n`) plus a `5`-byte closing terminator `0\r\n\r\n`—tiny overhead for `4 KB` chunks ($8 / 4096 \approx 0.2\%$), but huge ($>100\%$) if you flush `1`-byte chunks!

| Wire Framing Combination | RFC 9112 Status | Security / Parsing Risk | Compliant Proxy / Server Action |
| :--- | :--- | :--- | :--- |
| **Missing `Host` header (HTTP/1.1)** | Invalid | Ambiguous virtual-host routing | Reject **`400 Bad Request`** |
| **Duplicate `Host` headers** | Invalid | Host-routing confusion / cache poisoning | Reject **`400 Bad Request`** |
| **Single `Content-Length: N`** | Valid | Must match exact body byte count | Read exactly `N` bytes |
| **`Transfer-Encoding: chunked` only** | Valid | Incomplete terminator hangs socket | Stream chunks until `0\r\n\r\n` |
| **Both `Content-Length` AND `Transfer-Encoding`** | **Forbidden** | **`CL.TE` / `TE.CL` Request Smuggling** | Reject **`400 Bad Request`**, close socket |
| **Two `Content-Length` headers with different values** | **Forbidden** | **Header desync smuggling** | Reject **`400 Bad Request`**, close socket |

---

## Core Definition & Taxonomic Comparison

**HTTP/1.1 is a stateless, text-framed request/response protocol layered on a reliable byte stream.** TCP delivers bytes in order and has no idea where one message ends; HTTP supplies that boundary with a start-line, headers, a blank line, and an explicitly framed body. What it is not: a session. The server keeps no memory between requests; cookies or tokens re-identify the caller on every message, which is exactly why any server behind a load balancer can answer any request.

Four distinctions decide whether an API is retry-safe and attack-resistant:

| Term | Precise Meaning | Production Example |
| :--- | :--- | :--- |
| **Safe** vs. **Idempotent** vs. **Cacheable** | *Safe*: no state change is expected (`GET`, `HEAD`, `OPTIONS`). *Idempotent*: $N$ identical calls leave the same final state as one (`PUT`, `DELETE` + all safe methods). *Cacheable*: a stored response may satisfy later requests. Safe $\subset$ idempotent. | `PUT /users/7` is idempotent but **not** safe; `GET /users/7` is both. |
| **`PUT`** vs. **`POST`** vs. **`PATCH`** | `PUT`: replace the target resource with this full representation. `POST`: process this payload (create, or run an action) under server-chosen semantics. `PATCH`: apply a partial change, idempotent only if written as "set X to V". | `PATCH {"status":"paid"}` is idempotent; `PATCH {"addBalance":100}` is not. |
| **`Content-Length`** vs. **`Transfer-Encoding: chunked`** vs. **HTTP/2 frames** | Three body-framing schemes: a known byte count; size-prefixed hex chunks ending in `0`; or binary length-prefixed frames with no text delimiters. Having *two* text schemes at once is the root of request smuggling. | `Content-Length: 27` for a JSON `POST`; chunked for a streamed export; `h2` between proxy and origin. |
| **`Idempotency-Key`** vs. **`ETag` / `If-Match`** | `Idempotency-Key` de-duplicates a *retry of the same creation* (replay the stored result). `If-Match` prevents a *lost update* by making a write conditional on the version the client saw. They solve different failure modes. | `POST /charges` + key (no double charge); `PUT /doc/9` + `If-Match: "v3"` (`412` if someone else edited). |

**Business impact.** Method semantics are a contract with every retry library, CDN, crawler, and link-preview bot between you and the user. Violate it (state change on `GET`, unkeyed `POST` retries) and the failure mode is financial: duplicate charges, accidental unsubscribes, or deleted data triggered by a prefetcher.

---

## Component Anatomy & The Observability Gap

### Byte-Accurate Anatomy of One Exchange

```text
 REQUEST  (191 bytes on the wire)                                          bytes
 POST /v1/charges HTTP/1.1\r\n                  <- request-line            27
 Host: api.payments.example\r\n                 <- mandatory (RFC 9112)    28
 Content-Type: application/json\r\n                                        32
 Idempotency-Key: 9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d\r\n                 55
 Content-Length: 27\r\n                         <- body framing            20
 \r\n                                           <- header/body delimiter    2
 {"amount":4900,"ccy":"USD"}                    <- body                    27
 
 RESPONSE (105 bytes on the wire)
 HTTP/1.1 201 Created\r\n                       <- status-line             22
 Location: /v1/charges/ch_8812\r\n                                         31
 Content-Length: 30\r\n                                                    20
 \r\n                                                                       2
 {"id":"ch_8812","status":"ok"}                                            30
```

For this tiny JSON call, **headers are `164 / 191 = 86%` of the bytes**. Real browser requests carry `500-800 B` of headers (cookies, `User-Agent`, `Accept-*`), which is why HTTP/2's `HPACK` header compression (Lesson 23) matters on chatty APIs.

**Request-target has four legal forms (RFC 9112 §3.2):** *origin-form* `/v1/orders?id=7` (normal), *absolute-form* `http://host/path` (to forward proxies), *authority-form* `host:443` (only for `CONNECT` tunnels), and *asterisk-form* `*` (only `OPTIONS *`). Disagreement between a proxy and an origin about which form it received is a second classic desync source.

### The Observability Gap: Where Each Layer Is Blind

| Vantage Point | What It Captures | What It Hides |
| :--- | :--- | :--- |
| **Client SDK / mobile trace** | Total time, retry count, the exact `Idempotency-Key` it sent. | Whether the server *committed* before the timeout (the central uncertainty of every retry). |
| **Edge proxy / L7 LB access log** | Method, path, status, bytes, `$request_time`; a `504` it generated itself. | That the origin actually committed the work; **smuggled requests** (the proxy saw exactly one request). |
| **App handler / business log** | Whether the charge executed, ledger IDs, replay (`X-Idempotent-Replay: true`). | Network-level losses before the request arrived; framing errors rejected earlier return `400` with no app log. |
| **Metrics to add** | `http_framing_rejects_total` (CL+TE, dup Host), `idempotent_replays_total`, `idempotency_conflicts_total` (`409`/`422`), `retry_attempts_by_method`. | Nothing: these are the early-warning signals that unkeyed retries or smuggling probes exist. |

**Debug rule:** a customer says "I was charged twice". Join client request IDs, edge log lines, and ledger rows on `Idempotency-Key`; two ledger rows with different keys mean the *client* regenerated the key per retry, and two rows with no key mean the retry layer was blind.

---

## Mathematical Model of Retries, Duplicates & Framing Overhead

### 1. Retry Amplification

If each attempt fails independently with probability $p$ and a caller allows up to $k$ retries, expected attempts per logical request are:

$$\mathbb{E}[\text{attempts}] = \sum_{i=0}^{k} p^i = \frac{1 - p^{k+1}}{1 - p}$$

| Per-Attempt Failure $p$ | $k = 3$ Attempts | Load Multiplier on Backend |
| :--- | :--- | :--- |
| `1.5%` (healthy blip) | `1.015` | `+1.5%` |
| `50%` (degraded) | `1.875` | **`1.9x`** |
| `90%` (brownout) | `3.44` | **`3.4x`** |
| `100%` (hard down) | `4.0` | **`4x`** |

**Layered retries multiply:** client (`3`) x gateway (`3`) x service (`3`) gives up to $(1+3)^3 = 64$ attempts per user action at the origin during an outage. Retry at **one** layer, with backoff + jitter, and a retry budget (for example `<= 10%` extra traffic).

### 2. Duplicate Charges Without an `Idempotency-Key`

A response lost *after* commit with probability $q$ makes a blind `POST` retry create a duplicate:

$$\text{Duplicates/s} = \text{RPS} \times q = 1{,}000 \times 0.015 = 15/\text{s} \;\;(54{,}000/\text{hour})$$

With a key, duplicates become replays: the store returns the saved `201` and the ledger gets exactly one row per key.

### 3. Sizing the Idempotency Store

$$\text{Rows} = \text{POST RPS} \times T_{\text{retention}},\qquad \text{Memory} \approx \text{Rows} \times \text{bytes per row}$$

At `1,000` RPS, `256 B` per row (`36 B` key + `32 B` payload hash + status + trimmed response):

| Retention $T$ | Rows | Memory | Fit |
| :--- | :--- | :--- | :--- |
| `1 h` | `3.6 M` | `~0.9 GB` | Single Redis node |
| `24 h` (Stripe-style) | `86.4 M` | `~22 GB` | Sharded Redis or a unique-index table with TTL job |
| `7 d` | `605 M` | `~155 GB` | Durable DB, not cache |

Pick $T$ from the longest *client retry horizon* (mobile queues can retry for hours), not from convenience.

### 4. Chunked Framing Overhead

Each chunk of $L$ bytes costs $\lceil \log_{16}(L+1) \rceil + 4$ bytes (hex size + 2 CRLFs), plus the `5`-byte terminator `0\r\n\r\n`:

| Chunk Size $L$ | Overhead Bytes | Overhead % | Verdict |
| :--- | :--- | :--- | :--- |
| `1 B` | `5` | `500%` | Pathological (flush-per-byte logging) |
| `16 B` | `6` | `37.5%` | Wasteful |
| `256 B` | `7` | `2.7%` | Acceptable |
| `4,096 B` | `8` | `0.195%` | Sweet spot |
| `65,536 B` | `9` | `0.014%` | Negligible |

### 5. Keep-Alive Savings

A cold HTTP/1.1 request over TLS 1.3 costs `3 RTT` before the response begins (TCP + TLS + HTTP); a reused connection costs `1 RTT`. At `RTT = 50 ms`: **`150 ms` vs. `50 ms`**, a `3x` difference that connection pooling captures on every call after the first (Lesson 29).

---

## Production War Story Post-Mortem: `CL.TE` Smuggling & `POST` Double-Charge Cascade

- **Severity:** SEV-1 (Cross-Tenant Session Hijacking + `1,400` Duplicate Checkout Charges)
- **Detection / Resolution Time:** 14 minutes to patch proxy header validation; 3 hours to refund duplicate ledger rows
- **Impact:** A misconfigured legacy L7 edge proxy forwarded requests containing *both* `Content-Length` and `Transfer-Encoding: chunked` to a Python HTTP/1.1 upstream pool. Attackers smuggled `GET /admin/export` prefixes onto pooled sockets, while simultaneous mobile SDK retries on `504` timeouts triggered `1,400` duplicate `POST /v1/orders` charges lacking `Idempotency-Key`.

### What Happened

```mermaid
sequenceDiagram
    participant Att as Attacker Client
    participant Edge as Edge LB (Honored CL)
    participant App as App Server (Honored TE)
    participant Cust as Mobile Checkout Client

    Att->>Edge: Request 1 with CL=44 and TE=chunked (smuggled prefix in body)
    Edge->>App: Forwards 44 bytes down shared HTTP/1.1 keep-alive socket
    Note over App: Reads TE chunk "0\r\n\r\n", leaves smuggled "POST /v1/orders..." buffered!
    Cust->>Edge: Legitimate GET /v1/catalog (with Cust Bearer Token)
    Edge->>App: Writes Cust request directly behind smuggled prefix
    Note over App: Executes smuggled POST using Cust Bearer Token!
    App-->>Cust: Unexpected 504 / Error -> Mobile SDK auto-retries raw POST!
```

### Root Cause Analysis

1. **Permissive Edge Framing (`CL + TE` Forwarded):** The outer proxy accepted requests with both `Content-Length` and `Transfer-Encoding: chunked`, parsed using `Content-Length`, and passed the raw headers untouched to an app server configured to prefer `Transfer-Encoding`—enabling `CL.TE` request smuggling on shared keep-alive backend pools.
2. **Blind Retry on Unkeyed `POST`:** When smuggled collisions and backend overload returned `504 Gateway Timeout`, the mobile SDK retried `POST /v1/orders` 3 times without an `Idempotency-Key`, duplicating orders that had already committed before the timeout.

### The Fix & Architectural Hardening

- **Strict RFC 9112 Framing Gate + HTTP/2 Upstreams:** Upgraded edge proxy validation to reject any request carrying `CL + TE`, duplicate `Content-Length`, or whitespace before header colons with `400 Bad Request` + socket close, and enabled **HTTP/2** (`h2`) on proxy-to-origin links (binary framing prevents smuggling by construction).
- **`Idempotency-Key` Enforcement:** Required `Idempotency-Key` (UUIDv4) on all `POST /v1/orders` and `/v1/charges` routes, backed by an atomic PostgreSQL/Redis `(tenant_id, key)` unique record that replays identical responses and rejects payload mismatches with `422`.
- **Method-Aware Client Retries:** Restricted automatic SDK retries exclusively to `GET`/`HEAD`/`OPTIONS`, `PUT`/`DELETE`, or `POST` requests carrying an explicit `Idempotency-Key`.

---

## Multi-Language Production Implementation

Below is a production-structured **HTTP/1.1 Wire Framing Validator (`CL.TE` Guard) + Method-Aware `Idempotency-Key` Middleware** across Go, TypeScript, Python, and C#.

````carousel
```go
package httpmw

import (
	"crypto/sha256"
	"encoding/hex"
	"io"
	"net/http"
	"sync"
)

type reply struct {
	hash string; status int; body []byte
}

type Guard struct {
	mu    sync.Mutex
	store map[string]reply
}

func CanAutoRetry(method string, h http.Header) bool {
	switch method {
	case http.MethodGet, http.MethodHead, http.MethodOptions, http.MethodPut, http.MethodDelete:
		return true
	case http.MethodPost:
		return h.Get("Idempotency-Key") != ""
	default:
		return false
	}
}

func (g *Guard) Middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Host == "" || (len(r.TransferEncoding) > 0 && r.Header.Get("Content-Length") != "") {
			w.Header().Set("Connection", "close")
			http.Error(w, "invalid Host or CL+TE framing", http.StatusBadRequest)
			return
		}
		if r.Method != http.MethodPost { next.ServeHTTP(w, r); return }

		key := r.Header.Get("Idempotency-Key")
		if key == "" { http.Error(w, "Idempotency-Key required", http.StatusBadRequest); return }
		raw, _ := io.ReadAll(io.LimitReader(r.Body, 1<<20))
		sum := sha256.Sum256(raw)
		hash := hex.EncodeToString(sum[:])

		g.mu.Lock()
		prev, ok := g.store[key]
		g.mu.Unlock()
		if ok {
			if prev.hash != hash { http.Error(w, "key payload mismatch", http.StatusUnprocessableEntity); return }
			w.Header().Set("X-Idempotent-Replay", "true")
			w.WriteHeader(prev.status); _, _ = w.Write(prev.body); return
		}
		body := []byte(`{"status":"created"}`)
		g.mu.Lock(); g.store[key] = reply{hash, http.StatusCreated, body}; g.mu.Unlock()
		w.WriteHeader(http.StatusCreated); _, _ = w.Write(body)
	})
}
```
<!-- slide -->
```typescript
import { createHash } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";

const IDEMPOTENT = new Set(["GET", "HEAD", "OPTIONS", "PUT", "DELETE"]);
const store = new Map<string, { hash: string; status: number; body: string }>();

export const canAutoRetry = (method: string, headers: Record<string, string>) =>
  IDEMPOTENT.has(method.toUpperCase()) || (method.toUpperCase() === "POST" && Boolean(headers["idempotency-key"]?.trim()));

export function validateAndHandle(req: IncomingMessage, res: ServerResponse, rawBody: Buffer, run: () => { status: number; body: string }): void {
  const hasCl = req.headers["content-length"] !== undefined;
  const hasTe = req.headers["transfer-encoding"] !== undefined;
  if (!req.headers.host || Array.isArray(req.headers.host) || (hasCl && hasTe)) {
    res.writeHead(400, { Connection: "close" }); res.end("Invalid Host or CL+TE framing"); return;
  }
  const key = String(req.headers["idempotency-key"] ?? "").trim();
  if (!key) { res.writeHead(400); res.end("Missing Idempotency-Key"); return; }
  const hash = createHash("sha256").update(rawBody).digest("hex");
  const prev = store.get(key);
  if (prev) {
    if (prev.hash !== hash) { res.writeHead(422); res.end("Payload mismatch"); return; }
    res.writeHead(prev.status, { "X-Idempotent-Replay": "true" }); res.end(prev.body); return;
  }
  const out = run();
  store.set(key, { hash, ...out });
  res.writeHead(out.status, { "Content-Type": "application/json" }); res.end(out.body);
}
```
<!-- slide -->
```python
import hashlib

IDEMPOTENT_METHODS = frozenset({"GET", "HEAD", "OPTIONS", "PUT", "DELETE"})

def can_auto_retry(method: str, headers: dict[str, str]) -> bool:
    up = method.upper()
    return up in IDEMPOTENT_METHODS or (up == "POST" and bool(headers.get("idempotency-key", "").strip()))

def validate_framing(headers: list[tuple[str, str]]) -> None:
    names = [k.lower() for k, _ in headers]
    if names.count("host") != 1 or ("content-length" in names and "transfer-encoding" in names):
        raise ValueError("400 Bad Request: missing Host or ambiguous CL+TE framing")

class IdempotencyGuard:
    def __init__(self) -> None:
        self._store: dict[str, tuple[str, int, bytes]] = {}

    def handle_post(self, key: str, body: bytes, run) -> tuple[int, bytes, bool]:
        if not key.strip(): return 400, b"Idempotency-Key required", False
        digest = hashlib.sha256(body).hexdigest()
        if key in self._store:
            old_hash, status, resp = self._store[key]
            return (status, resp, True) if old_hash == digest else (422, b"Payload mismatch", False)
        status, resp = run(body)
        self._store[key] = (digest, status, resp)
        return status, resp, False
```
<!-- slide -->
```csharp
using System;
using System.Collections.Concurrent;
using System.Security.Cryptography;
using System.Text;
using Microsoft.AspNetCore.Http;

public sealed class HttpContractGuard
{
    private readonly ConcurrentDictionary<string, (string Hash, int Status, string Body)> _store = new();

    public static bool CanAutoRetry(string method, IHeaderDictionary headers) =>
        method.ToUpperInvariant() is "GET" or "HEAD" or "OPTIONS" or "PUT" or "DELETE"
        || (method.Equals("POST", StringComparison.OrdinalIgnoreCase) && !string.IsNullOrWhiteSpace(headers["Idempotency-Key"]));

    public IResult HandlePost(HttpRequest req, string rawBody, Func<(int Status, string Body)> run)
    {
        if (string.IsNullOrWhiteSpace(req.Headers.Host) || (req.Headers.ContainsKey("Content-Length") && req.Headers.ContainsKey("Transfer-Encoding")))
            return Results.BadRequest("Missing Host or conflicting CL+TE framing");

        string key = req.Headers["Idempotency-Key"].ToString().Trim();
        if (string.IsNullOrEmpty(key)) return Results.BadRequest("Idempotency-Key required");

        string hash = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(rawBody)));
        if (_store.TryGetValue(key, out var prev))
        {
            if (prev.Hash != hash) return Results.UnprocessableEntity("Idempotency-Key payload mismatch");
            req.HttpContext.Response.Headers["X-Idempotent-Replay"] = "true";
            return Results.Text(prev.Body, "application/json", statusCode: prev.Status);
        }
        var (status, body) = run();
        _store.TryAdd(key, (hash, status, body));
        return Results.Text(body, "application/json", statusCode: status);
    }
}
```
````

---

## Practical Hands-On Verification CLI Workflows

### 1. Send a Raw HTTP/1.1 Wire Request (`Host`, `\r\n\r\n`, and Status-Line)

```bash
printf "HEAD / HTTP/1.1\r\nHost: example.com\r\nConnection: close\r\n\r\n" | nc -w 3 example.com 80
```

**Expected Output:**

```text
HTTP/1.1 200 OK
Accept-Ranges: bytes
Content-Type: text/html
Content-Length: 1256
Connection: close
```

Omitting `Host` returns `HTTP/1.1 400 Bad Request` on any RFC 9112-compliant server.

### 2. Inspect Raw `Transfer-Encoding: chunked` Framing & `OPTIONS`

```bash
curl -sS --http1.1 --raw -D - https://httpbin.org/stream/2 | head -n 14
```

**Expected Output:**

```text
HTTP/1.1 200 OK
Transfer-Encoding: chunked
Content-Type: application/json

10e
{"url": "https://httpbin.org/stream/2", "id": 0, ...}

0
```

Notice the hex byte length (`10e` = `270` bytes) and `0` (`0\r\n\r\n`) terminator. You can also inspect allowed methods with `curl -sS -i -X OPTIONS https://httpbin.org/anything`.

---

## Pause and Think

> [!exercise] A mobile banking client calls `POST /v1/transfers` (`USD 250`). The server commits the transfer in PostgreSQL, then the client's Wi-Fi drops just before `201 Created` reaches the phone. Two seconds later on 5G, the SDK automatically retries `POST /v1/transfers`. What happens without `Idempotency-Key` vs. with `Idempotency-Key`—and why wouldn't `PUT /v1/profiles/42` suffer the same duplicate creation bug? Decide before you open the answer.

<details><summary>Answer</summary>

Without `Idempotency-Key`, the server treats the retried `POST` as a brand-new transfer request and debits `USD 250` **twice** (`USD 500` total!). With an `Idempotency-Key` generated once on checkout click, the server sees the duplicate key, skips executing the transfer, and replays the stored `201 Created` JSON safely.

`PUT /v1/profiles/42` doesn't create a second profile because `PUT` targets a **known, fixed resource ID** and overwrites it cleanly—sending the same full payload once or twice leaves profile `42` in the exact same state (`idempotent`).

</details>

---

## Operational Validation Checkpoints

<details><summary><strong>Checkpoint 1: Detecting `CL.TE` Smuggling Risk in Proxy Configs</strong></summary>

**Scenario:** Your API gateway receives incoming HTTP/1.1 requests carrying both `Content-Length: 45` and `Transfer-Encoding: chunked`, and forwards *both* headers intact over a reused HTTP/1.1 upstream socket pool to a legacy app server. Why is this a critical SEV-1 vulnerability, and what two architectural fixes eliminate it?

**Solution:**
If the gateway reads `45` bytes using `Content-Length` while the backend reads chunks using `Transfer-Encoding: chunked`, an attacker can end the chunk early (`0\r\n\r\n`) and leave smuggled HTTP bytes queued on the shared backend TCP socket—hijacking the next user's request.
1. Reject any request carrying both `Content-Length` and `Transfer-Encoding` (or duplicate differing `CL` headers) with `400 Bad Request` and close the connection.
2. Upgrade gateway-to-backend transport to **HTTP/2** (`h2` / `h2c`), which uses binary length-prefixed frames with zero text-delimiter smuggling ambiguity.

</details>

<details><summary><strong>Checkpoint 2: Why `DELETE` Is Idempotent Even When Retries Return `404`</strong></summary>

**Scenario:** A junior engineer writes in a code review: *"Our `DELETE /items/99` endpoint returns `200 OK` on the first call and `404 Not Found` on the second call—so `DELETE` isn't idempotent, right?"* Also, they implemented `PATCH /wallets/99` as `{"addBalance": 100}`. Address both points.

**Solution:**
1. **`DELETE` IS idempotent:** RFC 9110 defines idempotency strictly in terms of **intended effect on server state**, not identical response codes. Calling `DELETE /items/99` once or five times results in the same state: item `99` is deleted. Retry clients should accept `200`, `204`, and `404` cleanly for `DELETE`.
2. **`PATCH {"addBalance": 100}` is NOT idempotent:** Every retry adds another `100`! To make `PATCH` safe against retries, either send absolute desired state (`{"balance": 500}`), use optimistic concurrency (`If-Match: "etag-v3"` returning `412 Precondition Failed` on retry), or require an `Idempotency-Key`.

</details>

<details><summary><strong>Checkpoint 3: Virtual Hosting `Host` Header vs. TLS `SNI` Mismatch (`421`)</strong></summary>

**Scenario:** An HTTP/2 client opens one TLS connection with `SNI = a.example.com` and then sends a request over that same connection with `Host: b.example.com` (`:authority: b.example.com`). Both domains live behind your CDN IP, though `a` and `b` have different backend routing/mTLS policies. What HTTP status code should the server return?

**Solution:**
Return **`421 Misdirected Request`** (`RFC 9110`). While HTTP/2 permits connection coalescing across SAN-matching domains, whenever a server cannot or refuses to serve the requested `Host` / `:authority` on the current TLS connection (due to differing tenant isolation or client-cert requirements), `421` tells the client to open a dedicated socket for `b.example.com`.

</details>

---

## Common Mistakes & Troubleshooting

### What Goes Wrong

- **Auto-retrying every timeout indiscriminately:** Retrying `POST` without `Idempotency-Key` on `504` / socket reset turns transient blips into duplicate orders and ledger corruption.
- **Ignoring conflicting framing headers:** Allowing proxies to silently pick `CL` while upstreams pick `TE` opens `CL.TE` request smuggling over shared keep-alive pools.
- **Using `GET` for state-changing links:** Putting `GET /unsubscribe?user=42` or `GET /approve?tx=9` in emails lets link-preview bots and browser prefetchers mutate user data accidentally.

### Common Myths

- **"Idempotent means returning the exact same HTTP status and JSON every time."** No. It means repeating the request produces the **same final resource state** on the server (`DELETE` -> `200`, then `404` is still idempotent).
- **"PUT creates or updates, POST only creates—so PUT isn't idempotent."** Wrong. Because `PUT` replaces the target URI's full representation (`PUT /items/42`), calling it 10 times produces the identical representation `42`.
- **"HTTP/1.1 doesn't strictly need `Host` if only one site runs on the server."** False. `RFC 9112` mandates exactly one `Host` header on all HTTP/1.1 requests; compliant servers reject requests missing `Host` with `400 Bad Request`.

| Symptom | Root Cause | Fix |
| :--- | :--- | :--- |
| Duplicate charges/orders during upstream `504` blips | Client retries `POST` without server deduplication | Require `Idempotency-Key` UUIDv4 + atomic response cache + `422` hash check |
| Random user receives another tenant's response body | `CL.TE` or `TE.CL` smuggling across keep-alive proxy pool | Reject `CL + TE` with `400 Bad Request`; switch proxy-to-origin to `HTTP/2` |
| Link-preview scanners trigger account actions | State mutation exposed on a `GET` route | Move all state mutations to `POST` / `PUT` / `DELETE` (`Safe` = read-only) |

---

## Recap in Three Lines

1. HTTP/1.1 sends plain-text start-lines, headers (`Host` mandatory), `\r\n\r\n`, and bodies framed by `Content-Length` or `Transfer-Encoding: chunked`.
2. Conflicting `CL` and `TE` headers cause `CL.TE` request smuggling on shared keep-alive pools—reject them immediately with `400 Bad Request`.
3. `Safe` (`GET`/`HEAD`/`OPTIONS`) and `Idempotent` (`PUT`/`DELETE`) methods retry cleanly, while `POST` mutations demand `Idempotency-Key` to prevent duplicates.

---

## Interview Practice Questions

Each question is tagged by kind: **Basic** (definitions), **Scenario** (apply it to a system), and **Tricky** (deep follow-ups). Answer out loud before opening the solution.

<details>
<summary><strong>1. Walk through the parts of an HTTP/1.1 request and response on the wire. [BASIC]</strong></summary>

<strong>What a strong answer covers:</strong>
A message starts with a request-line (`GET /orders HTTP/1.1`) or status-line (`HTTP/1.1 200 OK`) ending in `\r\n`, followed by `Name: Value\r\n` headers (including the mandatory `Host`). A blank line `\r\n\r\n` ends the headers. The optional body is bounded by an exact byte count in `Content-Length` or by hex-sized chunks under `Transfer-Encoding: chunked` that end with `0\r\n\r\n`. In the example payment call, headers are about `86%` of the bytes.

</details>

<details>
<summary><strong>2. What is the difference between a safe and an idempotent HTTP method? [BASIC]</strong></summary>

<strong>What a strong answer covers:</strong>
A **safe** method (`GET`, `HEAD`, `OPTIONS`) is read-only by contract. An **idempotent** method (`GET`, `HEAD`, `OPTIONS`, `PUT`, `DELETE`) may change state, but $N$ calls leave the same final state as one. Every safe method is idempotent; `PUT` and `DELETE` are idempotent without being safe. `POST` is neither, and `PATCH` is idempotent only if written as "set to a value".

</details>

<details>
<summary><strong>3. What does it mean that HTTP is stateless? [BASIC]</strong></summary>

<strong>What a strong answer covers:</strong>
The server keeps no memory between requests: each one carries everything needed to process it, with cookies or bearer tokens identifying the session. That is what lets a load balancer send consecutive requests to different servers, lets you scale horizontally, and lets caches and proxies reason about each message alone. State lives in a shared store (database, Redis), not in the connection.

</details>

<details>
<summary><strong>4. Why is the `Host` header mandatory in HTTP/1.1, and what happens if it is missing? [BASIC]</strong></summary>

<strong>What a strong answer covers:</strong>
One IP and port routinely serve thousands of domains through virtual hosting, and the request-line carries only the path. `Host` tells the server which site is wanted. RFC 9112 requires exactly one; a request with none or two must be rejected with `400 Bad Request`. In HTTP/2 the equivalent is the `:authority` pseudo-header, and a TLS `SNI` / `Host` mismatch can justify `421 Misdirected Request`.

</details>

<details>
<summary><strong>5. A payment `POST` times out. Can the client retry? [SCENARIO]</strong></summary>

<strong>What a strong answer covers:</strong>
Only safely with an **idempotency key**. The client generates one UUID per logical purchase and reuses it for every retry. The server atomically stores `(tenant, key) -> {request hash, status, body}`: the first call executes, a repeat with the same key and payload **replays** the saved `201`, a repeat while the first is still running returns `409`, and a reused key with a different payload returns `422`. Without a key, surface "outcome unknown" and reconcile instead of retrying blindly.

</details>

<details>
<summary><strong>6. Your mobile app downloads a 2 MB catalog on every launch. How do you cut bandwidth? [SCENARIO]</strong></summary>

<strong>What a strong answer covers:</strong>
Return an `ETag` and a short `Cache-Control: max-age`. The app sends `If-None-Match`; when nothing changed the server answers `304 Not Modified` with no body, about `300 B` instead of `2 MB`. At `100,000` opens/day that is `200 GB` versus about `30 MB`. Add `Accept-Encoding: gzip`/`br` compression for changed responses. (Status codes and caching internals continue in Lesson 19.)

</details>

<details>
<summary><strong>7. Users get 502 from the load balancer, and 503 at peak. What do they tell you? [SCENARIO]</strong></summary>

<strong>What a strong answer covers:</strong>
`502 Bad Gateway`: the proxy got an invalid response or a closed connection from the backend (crash, protocol mismatch, idle-timeout race). `503 Service Unavailable`: overload, no healthy backends, or maintenance; clients should back off, ideally honoring `Retry-After`. `504` would mean the backend was too slow. Respond with retries only for idempotent calls, plus load shedding and capacity fixes for `503`.

</details>

<details>
<summary><strong>8. Design an `Idempotency-Key` middleware. What are the hard parts? [SCENARIO]</strong></summary>

<strong>What a strong answer covers:</strong>
Scope keys per tenant and route; hash the request body to catch reuse with a different payload (`422`). Make "claim the key" **atomic** (`INSERT ... ON CONFLICT` or `SET NX`) so two concurrent retries cannot both execute; return `409` (or wait) while in progress. Persist the response *in the same transaction* as the side effect, otherwise a crash between commit and store creates a duplicate window. Choose retention from the client retry horizon (`24 h` is common), cap stored response size, and emit replay/conflict metrics.

</details>

<details>
<summary><strong>9. Explain `CL.TE` request smuggling and how you prevent it. [TRICKY]</strong></summary>

<strong>What a strong answer covers:</strong>
A front proxy and a back-end reuse keep-alive connections but parse a dual-framed request differently: the proxy trusts `Content-Length`, the origin trusts `Transfer-Encoding: chunked`. Bytes after the origin's `0\r\n\r\n` stay in the socket buffer and prepend to the next user's request, so an attacker can hijack sessions or poison caches. Prevention: reject any message with both headers (or differing `Content-Length` values) using `400` and close the connection, normalize at the edge, and prefer **HTTP/2 (binary framing) to the origin**.

</details>

<details>
<summary><strong>10. `DELETE /items/42` returns `200` the first time and `404` on retry. Is it still idempotent? [TRICKY]</strong></summary>

<strong>What a strong answer covers:</strong>
Yes. Idempotency (RFC 9110) concerns the **effect on server state**, not the response. After one or five `DELETE`s item `42` is gone either way. Clients should treat `200`, `204`, and `404` as success for `DELETE` retries. The same reasoning explains why a counter-style `PATCH {"addBalance": 100}` is *not* idempotent: its final state depends on how many times it ran.

</details>

<details>
<summary><strong>11. Is `PATCH` idempotent, and how do you make it retry-safe? [TRICKY]</strong></summary>

<strong>What a strong answer covers:</strong>
Not guaranteed. "Set `status` to `paid`" is idempotent; "add `1` to `quantity`" is not. Make relative updates retry-safe by sending the absolute target value, making the write conditional with `If-Match: "v3"` (a retry gets `412 Precondition Failed`), or requiring an `Idempotency-Key`. Until the API defines otherwise, treat `PATCH` like `POST` for retry decisions.

</details>

<details>
<summary><strong>12. Why is a state change behind a `GET` URL dangerous? [TRICKY]</strong></summary>

<strong>What a strong answer covers:</strong>
Everything between the user and the server assumes `GET` is safe: link-preview bots in chat and email, security scanners, browser prefetch, crawlers, caches, and retry middleware will all call it, sometimes many times. `GET /unsubscribe?user=42` or `GET /approve?tx=9` therefore executes without user intent (and may be cached or logged with the secret in the URL). Use `POST`/`PUT`/`DELETE` plus CSRF protection and authentication for any mutation.

</details>

---

## One-Page Master Cheat Sheet

```text
====================================================================================================
                  HTTP/1.1 REQUESTS, RESPONSES & METHODS  —  CHEAT SHEET
====================================================================================================
MESSAGE ANATOMY
  start-line CRLF | headers (Name: value CRLF)* | CRLF | body        Host: REQUIRED (exactly one) else 400
  Framing: Content-Length: N (read N bytes) | chunked (hex size CRLF data CRLF ... 0 CRLF CRLF) | HTTP/2 frames
  BOTH CL and TE, or duplicate differing CL  =>  REJECT 400 + close socket   (CL.TE / TE.CL smuggling)
  Stateless: every request carries identity (cookie / bearer token) -> any server can answer.

METHODS                 SAFE   IDEMPOTENT   CACHEABLE   AUTO-RETRY ON TIMEOUT
  GET / HEAD / OPTIONS   yes      yes         yes/yes/no  yes
  PUT / DELETE           no       yes         no          yes (DELETE: 200/204/404 all fine)
  POST                   no       NO          rare        ONLY with Idempotency-Key
  PATCH                  no       NO*         no          only if absolute / If-Match / keyed   (*set-style can be)

IDEMPOTENCY-KEY CONTRACT
  1st call executes + stores (tenant,key)->{hash,status,body}  |  same key+hash => replay stored 2xx
  same key, in flight => 409 (or wait)   |  same key, different body => 422   |  retention = client retry horizon

MATH
  Retry multiplier = (1 - p^(k+1)) / (1 - p)      layered retries multiply: (1+k)^layers
  Duplicates/s     = RPS * P(response lost after commit)         1,000 * 1.5% = 15/s
  Store rows       = POST RPS * retention          1,000 RPS * 24 h = 86.4M rows ~ 22 GB @ 256 B
  Chunk overhead   = ceil(log16(L+1)) + 4 bytes per chunk (+5 terminator)   4 KB chunks = 0.2%
  Example payment POST = 191 B, of which headers 164 B (86%)

OBSERVABILITY
  Metrics: framing_rejects, idempotent_replays, idempotency_conflicts, retries_by_method, 4xx/5xx by route
  Client sees timeout; LB logs its own 504; only the LEDGER knows if it committed -> join on Idempotency-Key.

ANTI-PATTERNS
  X blind retry of POST      X forwarding CL+TE upstream      X state change on GET      X key per retry attempt
  X retries at 3 layers      X plaintext h1 to origin pools   X PATCH add-delta w/o keys X ignoring 421/425
====================================================================================================
```

---

## Free PDF notes

Download these notes as a printable PDF, with the HTTP/1.1 wire anatomy diagrams, method matrix, and interview answers: [SD-N-018.pdf](https://backendroadmap.com/notes/system-design/SD-N-018.pdf).

---

## Sources

- [RFC 9110: HTTP Semantics](https://www.rfc-editor.org/rfc/rfc9110), safe and idempotent method definitions (`GET`, `HEAD`, `OPTIONS`, `PUT`, `DELETE`, `POST`, `PATCH`).
- [RFC 9112: HTTP/1.1](https://www.rfc-editor.org/rfc/rfc9112), message syntax, `Host` header rules, `Content-Length`, `Transfer-Encoding: chunked`, and smuggling prohibitions.
- [PortSwigger Web Security Academy: HTTP Request Smuggling](https://portswigger.net/web-security/request-smuggling), detailed walkthrough of `CL.TE` and `TE.CL` framing desynchronization.
- [IETF Draft: The Idempotency-Key HTTP Header Field](https://datatracker.ietf.org/doc/draft-ietf-httpapi-idempotency-key-header/), standardizing `Idempotency-Key` replay and payload-mismatch semantics.
- [MDN: HTTP Request Methods](https://developer.mozilla.org/en-US/docs/Web/HTTP/Methods), practical reference for method safety and idempotency.

---

## Next

Next comes [Lesson 19: HTTP Part 2 — Status Codes, 401 vs 403, Caching and ETags](../19-http-status-codes-and-caching/README.md): what the three-digit response numbers mean, why `401` and `403` drive completely different client behavior, and how `Cache-Control` + `ETag` slash payload transfers. See [the track overview](../README.md) for the whole series.
