# Lesson 30: Timeouts — Connect, Read, Deadlines and the Random 502

> **Prerequisites:** [Lesson 29: Connection Pooling and Keep-Alive](../29-connection-pooling-and-keep-alive/README.md), [Lesson 19: HTTP Status Codes and Caching](../19-http-status-codes-and-caching/README.md), and [Networking From Zero Overview](../README.md) (Lesson 30 of 30).  
> **Estimated Reading Time:** 35 minutes  
> **Target Audience:** Backend and SRE engineers preventing cascading worker exhaustion, propagating end-to-end deadlines across microservices, diagnosing `502`/`503`/`504` gateway errors, and capping retry storms.  
> **Free PDF Notes:** [Download SD-N-030.pdf](https://backendroadmap.com/notes/system-design/SD-N-030.pdf)

> [!NOTE]
> **In one line:** every outbound call needs a connect, read and pool timeout plus an overall deadline; pass the remaining budget downstream, make inner timeouts shorter than outer ones, and keep the app's keep-alive longer than the load balancer's.

> [!TIP]
> **The Golden Rule of Timeouts & Resilience:** Never leave HTTP client timeouts at their infinite defaults (`requests.get()`, bare `&http.Client{}`): configure fast **connect/TLS timeouts (`1–3 s`)**, bounded **per-attempt read timeouts**, and propagate a single **end-to-end deadline** (`context.WithTimeout` / `Grpc-Timeout` / `X-Request-Deadline-Ms`) across `A -> B -> C` so downstream databases abort zombie work the caller already abandoned. Pair this with **idempotency-gated retries** capped by a **retry budget (`<= 10%`)** to eliminate `502`/`504` retry amplification storms. Shrink timeouts inward (LB `60 s` > app `55 s` > DB `50 s`) and set app keep-alive **above** the LB idle timeout (e.g. `uvicorn --timeout-keep-alive 75`) to stop random `502`s.

---

## Words You'll Meet Today

| Word | In Plain Words | Role in a Live Backend System |
| :--- | :--- | :--- |
| **Connect timeout** | Max wait to complete the TCP `SYN` / `SYN-ACK` / `ACK` handshake. | Must fail fast (`1–3 s`) instead of blocking `~127 s` on Linux `tcp_syn_retries`. |
| **TLS timeout** | Max wait for TLS negotiation and certificate verification after TCP opens. | Prevents stalled workers when a peer accepts TCP then stalls before `ServerHello`. |
| **TTFB timeout** | Max time waiting for HTTP status line and response headers (`ResponseHeaderTimeout`). | Catches hung upstreams immediately without killing legitimate large file downloads. |
| **Per-attempt timeout** | Hard ceiling on one single HTTP call including headers and body read. | Bounds worker residency per try so retries or fallbacks still fit the overall SLA. |
| **Deadline propagation** | Passing the caller's remaining time budget across service hops (`A -> B -> C`). | Stops leaf services and SQL queries from doing useless work after the user gave up. |
| **`502 Bad Gateway`** | A proxy received a broken, truncated, or `RST`-aborted answer from upstream. | Signals keep-alive races, upstream OOM kills, header buffer overflows, or stale DNS. |
| **`504 Gateway Timeout`** | A proxy waited past its upstream response timeout and got no timely answer. | Signals a slow or deadlocked upstream—retrying blindly multiplies load on it! |
| **Retry budget** | A hard cap (e.g., `<= 10%` extra RPS) limiting total retries across a client pool. | Prevents `3`-attempt retries across `3` hops from magnifying load into a `27×` storm. |

---

## Visual Mental Models & Architecture

### The Question: Why Did One Slow Downstream Service Freeze the Whole Platform?

In [lesson 29](../29-connection-pooling-and-keep-alive/README.md) we kept sockets warm with pooling, and in [lesson 19](../19-http-status-codes-and-caching/README.md) we learned what `502`, `503`, and `504` mean. Yet in production, one slow internal recommendation database (`Service C`) routinely brings down *unrelated* checkout, login, and profile endpoints across an entire microservice mesh. Why? Because when upstream services call downstream services **without strict timeouts and shared deadlines**, worker threads sit blocked forever—turning a `1%` leaf slowdown into a `100%` fleet freeze.

### An Everyday Picture First: Ordering Dinner With a Hard 7:00 PM Cutoff

Suppose you must leave for the airport at **7:00 PM**, and at **6:30 PM** (`total budget = 30 min`) you ask a courier (`Service A`) to pick up soup from a café (`Service B`), which must first get bread from a bakery (`Service C`):

- **Without deadline propagation:** You tell the courier "wait up to 30 min." The courier tells the café "no rush, take up to 30 min." The café spends 28 minutes waiting on bread from the bakery. Even though you left for the airport at 7:00 PM, the bakery keeps baking bread at 7:15 PM for an empty house!
- **With deadline propagation:** Everyone shares the **remaining clock** (`7:00 PM - now`). If `28` minutes are already spent when the request reaches the café, the café checks its watch (`2 min` left), realizes bread takes `10 min`, and **aborts immediately**—saving the bakery from burning ovens on canceled orders.

### Anatomy of Timeouts (and Why Default Libraries Hang Forever)

A single HTTP call traverses **five distinct timeout stages**. Relying on a single giant total timeout—or worse, standard-library defaults—leaves dangerous gaps:

1. **DNS Resolve Timeout (`500 ms – 2 s`):** Bounds blocked recursive DNS queries when local resolvers stall.
2. **TCP Connect Timeout (`1 – 3 s`):** On Linux, `net.ipv4.tcp_syn_retries` defaults to `6`, backing off exponentially (`1 + 2 + 4 + 8 + 16 + 32 + 64 = 127 s`!) whenever `SYN` packets are silently dropped by a firewall or dead EC2 host. Always set `connectTimeout` to `1–3 s` so dead endpoints fail fast!
3. **TLS Handshake Timeout (`2 – 3 s`):** Bounds `ClientHello` / `ServerHello` after TCP opens.
4. **ResponseHeader / TTFB Timeout (`2 – 10 s`):** Limits time spent waiting for the upstream to think and emit the first response header bytes, without punishing legitimate slow multi-megabyte body downloads.
5. **Per-Attempt / Idle Stream Read Timeout (`5 – 15 s`):** Bounds total attempt duration (or max silence between streamed body chunks).

**The Default Infinite Timeout Trap:** Both Python's `requests.get(url)` (`timeout=None`!) and Go's bare `&http.Client{}` (`Timeout: 0`!) wait **forever** by default. One half-open TCP socket or hung upstream permanently pins a Gunicorn worker thread or goroutine + memory buffer until every pod runs out of workers!

```mermaid
flowchart LR
    Start["Outbound Call"] --> T1["1. DNS Resolve (0.5-2s)"]
    T1 --> T2["2. TCP Connect (1-3s vs 127s OS SYN Retry!)"]
    T2 --> T3["3. TLS 1.3 Handshake (2-3s)"]
    T3 --> T4["4. ResponseHeader / TTFB (2-10s)"]
    T4 --> T5["5. Body Read / Attempt Ceiling (5-15s)"]
    Trap["Default requests.get() / bare http.Client{}"] -.->|"No Limit (Infinite Wait)"| Freeze["Worker Thread + Pool Exhaustion"]
```

*Figure 1. The five timeout stages of an HTTP call: short connect/TLS/TTFB timers isolate dead nodes in `1–3 s`, whereas default infinite library settings lock workers indefinitely.*

### End-to-End Deadline Propagation (`A -> B -> C`)

Static per-hop timeouts fail in microservice call graphs. If `Gateway` waits `2,000 ms`, `Service A` waits `2,000 ms`, and `Service B` waits `2,000 ms`, then when `A` spends `1,800 ms`, `B` still gives `C` another `2,000 ms`—consuming resources long after `Gateway` already dropped the connection and sent `504` to the user!

Instead, carry the **remaining deadline budget** across every hop (`context.WithTimeout` internally in Go, `Grpc-Timeout: 1800m` in gRPC, or `X-Request-Deadline-Ms` / relative `X-Timeout-Remaining-Ms` in HTTP):

- **Relative remaining time (`1850 ms`) vs. absolute UTC timestamp:** Sending *remaining milliseconds* (like `Grpc-Timeout`) avoids clock-skew bugs between servers whose NTP clocks drift by `100–500 ms`.
- **Clamp + Safety Margin:** Each hop computes `childTimeout = min(localAttemptCap, remainingBudget - safetyMarginMs)` (e.g., `25 ms` for serialization/network transit). If `remaining <= 0`, abort **before** making any downstream TCP write or SQL query!

```mermaid
sequenceDiagram
    participant Client as Mobile App (2000ms SLA)
    participant SvcA as Service A (Orchestrator)
    participant SvcB as Service B (Pricing)
    participant SvcC as Service C (Inventory DB)

    Client->>SvcA: GET /checkout with remaining 2000ms
    Note over SvcA: Local work takes 400ms (remaining = 1600ms - 25ms margin)
    SvcA->>SvcB: GET /quote with remaining 1575ms
    Note over SvcB: Cache miss + slow lock takes 1560ms!
    Note over SvcB: Remaining before calling C = 15ms (< 30ms min viable)
    SvcB-->>SvcA: Fails fast locally (504 / Deadline Exceeded) - Zero wasted call to C!
    Note over SvcC: Inventory DB spared from zombie query after SLA expired
    SvcA-->>Client: Returns clean degraded response or 504 within 2000ms
```

*Figure 2. End-to-end deadline propagation: shrinking budgets cancel work cleanly at `Service B` when insufficient time remains, shielding `Service C` and its database from zombie queries.*

### Decoding `502` vs. `503` vs. `504` & Stopping Retry Amplification

When an API gateway fails, distinguishing the three `5xx` gateway codes points straight to the root cause:

- **`502 Bad Gateway` (Broken / Invalid Upstream Response):** The proxy reached the upstream (or picked a pooled socket), then received invalid HTTP bytes or an abrupt socket close (`EOF` / `RST`). Four classic causes:
  1. **Keep-Alive Race Condition** ([lesson 29](../29-connection-pooling-and-keep-alive/README.md)): Upstream sent `FIN` right as proxy reused socket -> `RST`.
  2. **Upstream OOM Kill (`SIGKILL`) Mid-Request:** Kernel killed the backend container mid-response, dropping the TCP socket (`ECONNRESET`) before headers/body finished.
  3. **Response Header Buffer Overflow:** Upstream returned huge cookies or `JWT`s (`> 8 KB`), overflowing Nginx's `proxy_buffer_size` (`upstream sent too big header`).
  4. **Stale DNS IP:** Proxy dialed a recently terminated pod IP -> immediate `ECONNREFUSED` or `RST`.
- **`503 Service Unavailable` (Overload / No Healthy Endpoints):** Intentional rejection—all upstreams failed health checks, circuit breaker is open, or server is shedding load (often includes `Retry-After`).
- **`504 Gateway Timeout` (Alive Upstream Too Slow):** TCP connected cleanly, request was written, and the proxy hit its **read/response timeout** waiting for upstream bytes.

**The Retry Amplification Disaster & Retry Budgets:**
Suppose your architecture is `3` hops deep (`A -> B -> C`), and each hop configures `3` automatic retries (`4` total attempts per hop). During a `Service C` brownout, **1 single user request becomes**:

$$A_{\text{total}} = \prod_{i=1}^{3} (1 + r_i) = 4 \times 4 \times 4 = 64\times\text{ load on Service C!}$$

Adding `64×` traffic onto an already-struggling database turns a minor slowdown into a complete meltdown. To eliminate retry storms:

1. **Retry Only Safe / Idempotent Calls:** Only retry `GET`/`HEAD`/`PUT`/`DELETE` (or `POST` carrying an `Idempotency-Key` header!) on transient `502`/`503`/`504`—never blindly retry un-keyed `POST /payments` after a `504` (the payment may already have committed on the server!).
2. **Enforce a Retry Budget (`<= 10%`):** Maintain a sliding-window token bucket where every normal request credits `0.1` retry tokens and every retry spends `1.0` token. Once retries exceed `10%` of baseline traffic, stop retrying and fail fast so overloaded upstreams can recover.
3. **Retry at One Layer (Prefer Edge/Caller):** Avoid stacking retries at every internal hop.

---

## Systematic Reference & Comparison Grid

### HTTP Timeout Stages & Language Default Traps

| Timeout Stage | Recommended Value | Protects Against | Default Trap in Common Runtimes |
| :--- | :--- | :--- | :--- |
| **DNS Lookup** | `500 ms – 2 s` | Hung corporate/VPC DNS resolvers | OS resolver timeouts (`5–15 s`) block threads |
| **TCP Connect** | `1 – 3 s` | Dead pod IPs / dropped `SYN` packets | Linux `tcp_syn_retries=6` stalls **`127 s`** if unset |
| **TLS Handshake** | `2 – 3 s` | Stalled TLS peers post-SYN | Often shares infinite request wait if omitted |
| **ResponseHeader (TTFB)** | `2 – 10 s` | Hung backend goroutines/DB locks | Go `&http.Client{}` = `0` (**infinite!**) |
| **Attempt / Stream Idle** | `5 – 30 s` | Infinite read hangs & slowloris streams | Python `requests.get()` = `None` (**infinite!**) |

### Diagnostic Matrix: `502` vs. `503` vs. `504`

| Status Code | Wire Symptom at Proxy | Top Root Causes | Safe to Retry? | First Verification Check |
| :--- | :--- | :--- | :--- | :--- |
| **`502 Bad Gateway`** | `EOF`, `RST`, `ECONNREFUSED`, or malformed HTTP | Keep-alive race, OOM `SIGKILL`, `proxy_buffer_size` overflow, stale DNS | Yes (if idempotent + jitter + budget) | Check proxy error log (`upstream prematurely closed`, `too big header`) & pod `OOMKilled` |
| **`503 Service Unavailable`** | Explicit `503` or zero healthy pool backends | Load shedding, open circuit breaker, deploy rollout with `0` ready pods | Yes after **`Retry-After`** + jitter | Inspect `/healthz` readiness endpoints & queue/rate-limit metrics |
| **`504 Gateway Timeout`** | Proxy read timer fired waiting for upstream headers/body | Slow SQL lock, thread/DB pool exhaustion, missing deadline propagation | **Carefully!** Only idempotent + **retry budget** | Trace `X-Request-Id` latency across hops & slow query logs |

### Retry Amplification Formula

For a call chain of depth $d$ where hop $i$ performs up to $r_i$ retries:

$$A_{\text{total}} = \prod_{i=1}^{d} (1 + r_i), \qquad \text{Retry Budget: } R_{\text{retries}} \le 0.10 \times R_{\text{requests}}$$

---

## Core Definition & Taxonomic Comparison

**A timeout is a hard cap on how long you wait for one phase of an outbound call; a deadline is the absolute remaining budget for the whole operation (including retries).** Without them, a hung dependency drains threads and pools until *your* service is down too. Timeouts stop one slow friend from taking the party with them.

| Term | Precise Meaning | Production Example |
| :--- | :--- | :--- |
| **Connect** vs. **read** vs. **write** vs. **pool** timeout | *Connect*: TCP+TLS setup (`1–2 s`). *Read*: max gap waiting for **next** bytes (not whole body). *Write*: sending a large body. *Pool*: max wait to borrow. | `httpx.Timeout(1.0, connect=1.0, pool=0.5)` |
| **Read timeout** vs. **overall deadline** | Read limits the *gap between bytes*; a trickling server never trips it. Deadline caps the **whole call + retries**. | `5 s` read + `1 B` every `4 s` = forever; wrap with `asyncio.timeout(1.5)`. |
| **`502`** vs. **`503`** vs. **`504`** | `502`: broken/invalid/aborted upstream response. `503`: shedding / no healthy backends. `504`: upstream too slow for the proxy's read timer. | Keep-alive `RST` → `502`; circuit open → `503`; slow SQL → `504`. |
| **Outer > inner timeouts** vs. **app keep-alive > LB idle** | Inner fails first with a clear error while the outer still has time to retry/fallback. App keep-alive must exceed LB idle so the **LB closes first** (else random `502`). | LB `60 s` > app request `55 s` > DB `50 s`; `uvicorn --timeout-keep-alive 75`. |

**Business impact.** One dependency hang without timeouts turns into worker exhaustion, then `502`/`504` storms, then a platform-wide SEV-1—even when CPU is near idle.

---

## Component Anatomy & The Observability Gap

### Anatomy of One Outbound Call

```text
 one outbound call
   |-- pool wait (borrow)     ≤ pool timeout (0.5–1 s)
   |-- connect TCP + TLS      ≤ connect timeout (1–2 s)
   |-- write request body     ≤ write timeout
   |-- read next bytes...     ≤ read timeout (above dependency p99)
   +-- OVERALL DEADLINE       caps sum + retries; remaining budget passed downstream
 Gateway 2.0s → Orders 1.7s → Payments 1.2s → Ledger 0s (don't start)
```

### The Observability Gap: Who Sees Which Timeout?

| Vantage Point | What It Captures | What It Hides |
| :--- | :--- | :--- |
| **Client / SDK metrics** (connect vs read errors, deadline exceeded) | Which phase failed for *this* caller. | Whether the server finished the work after you gave up (`504` ambiguity). |
| **LB / proxy error log** | `502`/`504` reason strings (`prematurely closed`, `upstream timed out`, `too big header`). | App-level which SQL lock; need `X-Request-Id` correlation. |
| **App access logs (`200` in `4 ms`)** | Handler returned successfully. | Proxy still emitted `502` (buffer overflow / keep-alive race)—logs disagree. |
| **DB `pg_stat_activity`** | Queries still running after user saw `504`. | Proves missing deadline propagation to `statement_timeout`. |
| **Metrics to add** | Timeout reason counters (connect/read/pool/deadline), remaining-budget histogram, retry rate vs `10%` budget, keep-alive mismatch `502`s at low traffic. | A single "error rate" chart that blends all causes. |

**Operational rule:** classify every gateway failure as **`502` / `503` / `504` + phase**, and verify deadlines reach SQL—not just HTTP clients.

---

## Mathematical Model of Budgets, Trickle Reads & Retry Storms

### 1. Worked Defaults from Dependency p99 (PDF)

Payments API $p_{99} = 400\ \text{ms}$; endpoint SLA $= 2\ \text{s}$:

| Knob | Value | Why |
| :--- | :--- | :--- |
| Connect | `1 s` | Fail dead IPs fast (not Linux `127 s`) |
| Read | `1 s` | Above `400 ms` p99 with margin |
| Pool | `0.5 s` | Don't block workers on borrow |
| Overall deadline | `1.5 s` | Leaves `0.5 s` for local work + one idempotent retry |
| App keep-alive (behind `60 s` LB) | **`75 s`** | LB closes first |

In httpx: `httpx.Timeout(1.0, connect=1.0, pool=0.5)` plus `asyncio.timeout(1.5)` around the call; run `uvicorn --timeout-keep-alive 75`.

### 2. Why Read Timeout Alone Is Not Enough

A read timeout $T_r$ only bounds silence between bytes. A malicious or broken server sending $1$ byte every $T_r - \varepsilon$ runs for:

$$T_{\text{wall}} \approx N_{\text{bytes}} \times (T_r - \varepsilon) \quad \text{(unbounded without a deadline)}$$

Always add $T_{\text{deadline}} \le \text{remaining parent budget}$.

### 3. Shrink Timeouts Inward

$$T_{\text{LB}} > T_{\text{app}} > T_{\text{DB}} > T_{\text{leaf}}$$

| Layer | Example | Failure mode if inverted |
| :--- | :--- | :--- |
| Load balancer | `60 s` | Cuts mid-work → opaque `504`/`502` |
| App request | `55 s` | Inner still running after client gone |
| DB query | `50 s` | Zombie SQL after HTTP returns |

### 4. Percentiles: Base Timeouts on Real Tails

| Dependency latency | Who it describes | Client read timeout heuristic |
| :--- | :--- | :--- |
| $p_{50} = 40\ \text{ms}$ | Typical | Do **not** size from this |
| $p_{95} = 120\ \text{ms}$ | Busy periods | Lower bound for alerts |
| $p_{99} = 400\ \text{ms}$ | Tail users | **Base read timeout here** (+ margin) |
| $p_{99.9} = 2\ \text{s}$ | Incidents / locks | Covered by deadline + circuit breaker, not infinite wait |

Average of `90×40 + 9×300 + 1×2000 = 83 ms` looks fine while $p_{99}$ already needs a `~1 s` read budget.

### 5. Compounding Retry Amplification

$$A_{\text{total}} = \prod_{i=1}^{d}(1+r_i)$$

| Depth $d$ | Retries/hop $r$ | Amplification |
| :--- | :--- | :--- |
| `1` | `3` | `4×` |
| `2` | `3` | `16×` |
| `3` | `3` | **`64×`** |
| `4` | `3` | **`256×`** |

Cap with retry budget $R_{\text{retries}} \le 0.10 \times R_{\text{requests}}$, idempotency keys, and **one** retry layer.

### 6. Numbers Every Backend Engineer Must Know

| Fact | Value | Implication |
| :--- | :--- | :--- |
| Linux `tcp_syn_retries=6` | **`~127 s`** stall | Always set connect `1–3 s` |
| Python `requests` default | **`timeout=None`** | Infinite hang |
| Go bare `http.Client` | **`Timeout=0`** | Infinite hang |
| Uvicorn keep-alive default | **`5 s`** | Random `502` vs LB `60 s` |
| Safe keep-alive | App `75 s` `>` LB `60 s` | LB closes first |
| Retry budget | `≤ 10%` | Stops self-DDoS |
| Safety margin per hop | `~25 ms` | Serialization + network |

### 7. Hierarchical Deadline Budget (2 s Gateway)

| Hop | Spent | Remaining passed | Action if remaining ≈ 0 |
| :--- | :--- | :--- | :--- |
| Gateway | `300 ms` | `1.7 s` | — |
| Orders | `500 ms` | `1.2 s` | — |
| Payments | `1.2 s` | `0` | Ledger **does not start** |
| Ledger | — | — | Immediate deadline exceeded |

### 8. Top Engineering Mitigations

1. **Per-phase timeouts + overall deadline** on every outbound call.
2. **Deadline propagation** (gRPC deadlines / `X-Request-Deadline` / `context`) down to SQL `statement_timeout`.
3. **Shrink inward** so the innermost failure is clear and retryable.
4. **App keep-alive > LB idle** to eliminate random low-traffic `502`s.
5. **Idempotent retries + `≤10%` retry budget + circuit breaker**—never stack blind retries on every hop.

---

## Production War Story Post-Mortem: Infinite `requests.get()` + `3^3` Retry Storm

- **Severity:** SEV-1 (Complete Multi-Service Cascade Outage)
- **Detection / Resolution Time:** 8 minutes to cut internal retries via feature flag; 30 minutes to deploy timeouts + deadline propagation
- **Impact:** A `30`-second lock contention spike on `InventoryDB` escalated into a `42`-minute platform-wide outage affecting `100%` of endpoints.

### What Happened

```mermaid
sequenceDiagram
    participant Gateway as Edge API Gateway (5s timeout, 2 retries)
    participant SvcA as Checkout API (requests.get infinite!)
    participant SvcB as Inventory Service (2 retries)
    participant InvDB as Inventory DB (Row Lock Contention)

    Note over InvDB: Brief 15s lock spike slows SQL queries to 40s
    Gateway->>SvcA: POST /cart/preview (attempt 1)
    SvcA->>SvcB: requests.get(/stock) with timeout=None (infinite!)
    SvcB->>InvDB: SELECT FOR UPDATE (blocks 40s)
    Note over Gateway: Gateway hits 5s timeout -> emits 504 -> retries 2x more!
    Gateway->>SvcA: Retry 2 and Retry 3 (plus SvcB retries 2x = 9x load!)
    Note over SvcA: All Gunicorn sync workers block forever on timeout=None!
    SvcA-->>Gateway: 502 / 504 on ALL routes (even cached health/login endpoints!)
```

### Root Cause Analysis

1. **Missing Client Timeout (`timeout=None`):** `Service A` called `Service B` using Python `requests.get(url)` without `timeout=(2.0, 5.0)`. Every timed-out gateway request remained stuck inside `Service A`'s Gunicorn worker indefinitely—saturating `100%` of workers within `45` seconds.
2. **Stacked Multi-Hop Retries Without Budget or Deadlines:** `Gateway` retried twice (`3×`), `Service B` retried twice (`3×`), and no deadline header propagated downward—multiplying load `9×` on `InventoryDB` long after users closed their browser tabs.

### The Fix & Architectural Hardening

- **Mandatory Client Timeout Wrapper:** Enforced lint + wrapper forbidding `requests` or `http.Client` calls without explicit `(connect_timeout=2s, read_timeout)` tuples.
- **Deadline Propagation + `10%` Retry Budget:** Propagated `X-Request-Deadline-Ms` from the edge gateway down to SQL `statement_timeout`, and replaced fixed multi-hop retries with an edge-only `10%` token-bucket retry budget.

---

## Multi-Language Production Implementation

Below is a production-structured **Deadline-Propagating HTTP Client with Retry Budget** across Go, TypeScript, Python, and C#. Each helper computes remaining parent budget minus a `25 ms` transit margin, clamps the child attempt timeout, aborts immediately if expired, propagates the updated deadline header, and retries only safe/idempotent `502`/`503`/`504` responses within a `10%` retry budget.

````carousel
```go
package resilienthttp

import (
	"context"
	"errors"
	"net/http"
	"strconv"
	"sync"
	"time"
)

type RetryBudget struct {
	mu     sync.Mutex
	tokens float64
	max    float64
}

func NewRetryBudget(maxBurst float64) *RetryBudget {
	return &RetryBudget{tokens: maxBurst, max: maxBurst}
}

func (b *RetryBudget) RecordRequest() {
	b.mu.Lock()
	b.tokens = min(b.max, b.tokens+0.10) // Allow 10% retry overhead
	b.mu.Unlock()
}

func (b *RetryBudget) TryConsumeRetry() bool {
	b.mu.Lock()
	defer b.mu.Unlock()
	if b.tokens < 1.0 {
		return false
	}
	b.tokens -= 1.0
	return true
}

func DoWithDeadline(
	ctx context.Context,
	client *http.Client,
	budget *RetryBudget,
	method, url string,
	perAttemptCap time.Duration,
) (*http.Response, error) {
	const safetyMargin = 25 * time.Millisecond
	idempotent := method == http.MethodGet || method == http.MethodHead || method == http.MethodPut || method == http.MethodDelete
	budget.RecordRequest()

	for attempt := 0; attempt < 2; attempt++ {
		if attempt > 0 && (!idempotent || !budget.TryConsumeRetry()) {
			return nil, errors.New("retry skipped: non-idempotent or 10% retry budget exhausted")
		}
		parentDeadline, ok := ctx.Deadline()
		rem := perAttemptCap
		if ok {
			rem = time.Until(parentDeadline) - safetyMargin
			if rem <= 0 {
				return nil, context.DeadlineExceeded
			}
			rem = min(rem, perAttemptCap)
		}

		attemptCtx, cancel := context.WithTimeout(ctx, rem)
		req, err := http.NewRequestWithContext(attemptCtx, method, url, nil)
		if err != nil {
			cancel()
			return nil, err
		}
		req.Header.Set("X-Timeout-Remaining-Ms", strconv.FormatInt(rem.Milliseconds(), 10))

		resp, err := client.Do(req)
		cancel()
		if err == nil && resp.StatusCode != 502 && resp.StatusCode != 503 && resp.StatusCode != 504 {
			return resp, nil
		}
		if resp != nil {
			_ = resp.Body.Close()
		}
	}
	return nil, errors.New("upstream unavailable after bounded attempt")
}
```
<!-- slide -->
```typescript
export class RetryBudget {
  private tokens: number;
  constructor(private readonly maxTokens = 20) {
    this.tokens = maxTokens;
  }
  recordRequest(): void {
    this.tokens = Math.min(this.maxTokens, this.tokens + 0.1); // 10% overhead
  }
  tryConsumeRetry(): boolean {
    if (this.tokens < 1.0) return false;
    this.tokens -= 1.0;
    return true;
  }
}

export async function fetchWithDeadline(
  url: string,
  opts: { method?: string; parentRemainingMs: number; perAttemptCapMs?: number; budget: RetryBudget }
): Promise<Response> {
  const method = (opts.method ?? "GET").toUpperCase();
  const idempotent = ["GET", "HEAD", "PUT", "DELETE"].includes(method);
  const start = performance.now();
  const capMs = opts.perAttemptCapMs ?? 2000;
  const safetyMarginMs = 25;

  opts.budget.recordRequest();

  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt > 0 && (!idempotent || !opts.budget.tryConsumeRetry())) {
      throw new Error("Retry aborted: non-idempotent method or 10% retry budget depleted");
    }

    const elapsed = performance.now() - start;
    const remaining = Math.floor(opts.parentRemainingMs - elapsed - safetyMarginMs);
    if (remaining <= 0) {
      throw new Error("Parent deadline expired before downstream call");
    }

    const childTimeoutMs = Math.min(capMs, remaining);
    const res = await fetch(url, {
      method,
      headers: { "X-Timeout-Remaining-Ms": String(childTimeoutMs) },
      signal: AbortSignal.timeout(childTimeoutMs),
    });

    if (![502, 503, 504].includes(res.status)) return res;
  }
  throw new Error("Transient 502/503/504 persisted within deadline");
}
```
<!-- slide -->
```python
import time
import threading
import requests

SAFE_IDEMPOTENT = frozenset({"GET", "HEAD", "PUT", "DELETE"})
TRANSIENT_STATUSES = frozenset({502, 503, 504})


class RetryBudget:
    def __init__(self, max_tokens: float = 20.0) -> None:
        self._lock = threading.Lock()
        self._tokens = max_tokens
        self._max = max_tokens

    def record_request(self) -> None:
        with self._lock:
            self._tokens = min(self._max, self._tokens + 0.10)  # Max 10% retries

    def try_consume_retry(self) -> bool:
        with self._lock:
            if self._tokens < 1.0:
                return False
            self._tokens -= 1.0
            return True


def call_with_deadline(
    session: requests.Session,
    budget: RetryBudget,
    method: str,
    url: str,
    parent_remaining_ms: int,
    per_attempt_cap_ms: int = 2000,
) -> requests.Response:
    budget.record_request()
    start = time.monotonic()
    idempotent = method.upper() in SAFE_IDEMPOTENT

    for attempt in range(2):
        if attempt > 0 and (not idempotent or not budget.try_consume_retry()):
            raise RuntimeError("Retry skipped: unsafe method or 10% retry budget exhausted")

        elapsed_ms = int((time.monotonic() - start) * 1000)
        remaining_ms = parent_remaining_ms - elapsed_ms - 25  # 25ms safety margin
        if remaining_ms <= 0:
            raise TimeoutError("Parent deadline expired prior to downstream call")

        child_ms = min(per_attempt_cap_ms, remaining_ms)
        connect_s = min(1.5, child_ms / 1000.0)
        read_s = child_ms / 1000.0

        resp = session.request(
            method,
            url,
            headers={"X-Timeout-Remaining-Ms": str(child_ms)},
            timeout=(connect_s, read_s),
        )
        if resp.status_code not in TRANSIENT_STATUSES:
            return resp
    raise RuntimeError("Upstream returned transient 502/503/504 after bounded retry")
```
<!-- slide -->
```csharp
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Net;
using System.Net.Http;
using System.Threading;
using System.Threading.Tasks;

public sealed class RetryBudget
{
    private readonly object _gate = new();
    private double _tokens;
    private readonly double _max;

    public RetryBudget(double maxTokens = 20.0) { _tokens = maxTokens; _max = maxTokens; }
    public void RecordRequest() { lock (_gate) _tokens = Math.Min(_max, _tokens + 0.10); }
    public bool TryConsumeRetry() { lock (_gate) { if (_tokens < 1.0) return false; _tokens -= 1.0; return true; } }
}

public static class DeadlineHttpCaller
{
    private static readonly HashSet<HttpMethod> Idempotent = new() { HttpMethod.Get, HttpMethod.Head, HttpMethod.Put, HttpMethod.Delete };

    public static async Task<HttpResponseMessage> SendAsync(
        HttpClient client, RetryBudget budget, HttpMethod method, string url,
        TimeSpan parentRemaining, TimeSpan perAttemptCap, CancellationToken ct)
    {
        budget.RecordRequest();
        var sw = Stopwatch.StartNew();
        var safetyMargin = TimeSpan.FromMilliseconds(25);

        for (int attempt = 0; attempt < 2; attempt++)
        {
            if (attempt > 0 && (!Idempotent.Contains(method) || !budget.TryConsumeRetry()))
                throw new HttpRequestException("Retry blocked: non-idempotent or 10% retry budget exhausted.");

            var left = parentRemaining - sw.Elapsed - safetyMargin;
            if (left <= TimeSpan.Zero)
                throw new TimeoutException("Parent request deadline already expired.");

            var childTimeout = left < perAttemptCap ? left : perAttemptCap;
            using var cts = CancellationTokenSource.CreateLinkedTokenSource(ct);
            cts.CancelAfter(childTimeout);

            using var req = new HttpRequestMessage(method, url);
            req.Headers.Add("X-Timeout-Remaining-Ms", ((int)childTimeout.TotalMilliseconds).ToString());

            var resp = await client.SendAsync(req, cts.Token);
            if (resp.StatusCode is not (HttpStatusCode.BadGateway or HttpStatusCode.ServiceUnavailable or HttpStatusCode.GatewayTimeout))
                return resp;
            resp.Dispose();
        }
        throw new HttpRequestException("Transient 502/503/504 exceeded bounded attempt.");
    }
}
```
````

---

## Practical Hands-On Verification CLI Workflows

### 1. Demonstrate Fast Connect Timeout (`--connect-timeout`) vs. Max Request Timeout (`--max-time`)

```bash
time curl --connect-timeout 2 --max-time 4 https://192.0.2.1/health
```

**Expected Output:**

```text
curl: (28) Connection timed out after 2001 milliseconds
real    0m2.008s
```

`192.0.2.1` (RFC 5737 TEST-NET-1) drops `SYN` packets silently. With `--connect-timeout 2`, `curl` fails cleanly in `2.0 s` instead of stalling for Linux's `127 s` default!

### 2. Inspect Linux Kernel `tcp_syn_retries` Default

```bash
sysctl net.ipv4.tcp_syn_retries
```

**Expected Output:**

```text
net.ipv4.tcp_syn_retries = 6
```

With `6` retries (`1 + 2 + 4 + 8 + 16 + 32 + 64`), any application omitting an explicit `connect_timeout` can block a worker thread for **`127` seconds** against a single blackholed IP.

### 3. Distinguish `502`, `503`, and `504` Gateway Responses via `curl -i`

```bash
curl -sS -i https://httpbin.org/status/502,503,504
```

**Expected Output:**

```text
HTTP/2 502
content-length: 0
```

When debugging a live `502` vs `504`, always correlate the edge proxy's `X-Request-Id` with upstream pod logs: **`502`** usually leaves an abrupt EOF/OOM/buffer error in the proxy log with *zero* slow timing, whereas **`504`** hits an exact round-number proxy read timeout (`5.00 s`, `30.00 s`, `60.00 s`).

---

## Pause and Think

> [!exercise] A user triggers `POST /v1/orders` through a 4-hop chain (`Gateway -> Orders -> Inventory -> Warehouse`). Each hop is configured with up to `3` automatic retries (`4` total attempts per hop) and NO retry budget. During a Warehouse slow-down, how much traffic amplification hits `Warehouse`, and what happens if `Gateway` retries `POST /v1/orders` blindly after a `504 Gateway Timeout` without an `Idempotency-Key`? Decide before opening the answer.

<details><summary>Answer</summary>

1. **Traffic amplification:** $(1 + 3)^4 = 4^4 = \mathbf{256\times}$ load hits `Warehouse` for every single user request!
2. **Duplicate charge / duplicate order bug:** A `504 Gateway Timeout` means the request *was* delivered and `Orders`/`Warehouse` may still commit the write after `Gateway`'s read timer expired. Retrying `POST /v1/orders` blindly without an **`Idempotency-Key`** can charge the customer or reserve stock twice!

</details>

---

## Operational Validation Checkpoints

<details><summary><strong>Checkpoint 1: Giant Cookie Triggers `502` on Nginx While Backend Logs `200 OK`</strong></summary>

**Scenario:** A developer adds several feature-flag claims to an OAuth session cookie, growing response headers to `9 KB`. Nginx starts returning **`502 Bad Gateway`** on `/callback`, even though the upstream Go app logs `200 OK` in `4 ms` with zero crashes. Why?

**Solution:**
Nginx's default `proxy_buffer_size` (`4 KB` or `8 KB`) is too small to hold the upstream's `9 KB` HTTP response header block, causing Nginx to log `upstream sent too big header while reading response header from upstream` and emit `502 Bad Gateway`. Trim oversized cookies/headers (store session flags server-side) and tune `proxy_buffer_size` / `proxy_buffers` appropriately.

</details>

<details><summary><strong>Checkpoint 2: Upstream Pod `OOMKilled` Mid-Response Produces Random `502`s</strong></summary>

**Scenario:** Every time users export a large CSV report, the ALB returns `502 Bad Gateway` after `~1.8 s`, and `kubectl get pods` shows `RESTARTS` incrementing with `Reason: OOMKilled`. Why is it `502` instead of `500` or `504`?

**Solution:**
The backend pod began streaming or assembling the report, hit its cgroup memory limit, and received an immediate `SIGKILL` from the Linux kernel OOM killer. Because the process died mid-request without sending an HTTP response (or after closing the socket mid-body with `RST`), the ALB saw an abruptly broken upstream socket and mapped it directly to **`502 Bad Gateway`**. Stream CSV rows chunk-by-chunk instead of buffering them in memory.

</details>

<details><summary><strong>Checkpoint 3: SQL Queries Finish 12 Seconds After User Saw `504`</strong></summary>

**Scenario:** Your API gateway enforces a strict `3 s` total SLA and returns `504` promptly at `3.0 s`. Yet PostgreSQL `pg_stat_activity` shows expensive search queries from abandoned requests continuing to run for `15+` seconds! How do you close the gap?

**Solution:**
Closing the HTTP response at the gateway does not automatically cancel downstream SQL queries unless **deadline propagation** reaches the database! Propagate `X-Timeout-Remaining-Ms` into each service's `context.Context` (`ctx, cancel := context.WithTimeout(...)`), cancel downstream requests when the client disconnects (`r.Context().Done()`), and pass the remaining milliseconds to Postgres via `SET LOCAL statement_timeout = <remaining_ms>`.

</details>

---

## Common Mistakes & Troubleshooting

### What Goes Wrong

- **Using Python `requests.get()` or Go `&http.Client{}` defaults:** Zero/infinite timeouts silently hang worker pools until the entire service stops responding.
- **One Huge Total Timeout Without Connect Timeout:** Setting `timeout=30` lets a dead host stall for `30 s` on TCP `SYN` instead of failing over in `1–2 s`.
- **Retrying `POST` Requests Without `Idempotency-Key`:** Retrying after `504` causes double payments, duplicate orders, and corrupted state.
- **No Retry Budget Across Microservices:** Fixed `3×` retries at multiple layers magnify small hiccups into $27\times$ to $256\times$ self-inflicted DDoS storms.

### Common Myths

- **"If the load balancer returns `504` at `3 s`, my backend stopped working on the request."** False unless you explicitly propagate deadlines and tie `context.Context` cancellation all the way to DB queries.
- **"`502` always means the backend crashed."** False. Keep-alive races (`FIN`/`RST`), oversized response headers overflowing proxy buffers, and stale DNS entries all produce `502` even when backend CPU is `10%`.
- **"Adding retries always improves availability."** Without idempotency checks, jitter, and a `10%` retry budget, retries during an overload event actively destroy availability.

| Symptom | Root Cause | Fix |
| :--- | :--- | :--- |
| Entire fleet hangs while CPU is `5%` during minor upstream blip | Infinite default client timeout (`requests.get`, `&http.Client{}`) | Set `connect=1–3 s`, `TTFB=2–5 s`, and bounded total `attempt` timeouts everywhere |
| `502` on Nginx while backend logs `200 OK` immediately | Response headers exceed `proxy_buffer_size` or keep-alive `FIN`/`RST` race | Increase `proxy_buffer_size` / shrink cookies, and ensure `origin_keepalive > lb_idle` |
| Leaf DB melts under `10×` QPS during brief latency spikes | Stacked multi-hop retries without deadline propagation or budget | Propagate remaining deadline down to SQL `statement_timeout`; enforce `10%` retry budget |

---

## Recap in Three Lines

1. Replace infinite client defaults with distinct **connect (`1–3 s`)**, **TLS**, **TTFB**, and **per-attempt** timeouts so dead hosts fail fast and hung sockets never exhaust workers.
2. Propagate a single **end-to-end deadline** across hops (`A -> B -> C` down to SQL `statement_timeout`), and distinguish **`502`** (broken socket/OOM/keep-alive race/buffer overflow), **`503`** (shedding), and **`504`** (slow upstream).
3. Gate retries strictly on **idempotency**, **backoff + jitter**, and a **`<= 10%` retry budget** so transient faults heal without retry amplification storms.

---

## Interview Practice Questions

Each question is tagged by kind: **Basic** (definitions), **Scenario** (apply it to a system), and **Tricky** (deep follow-ups). Answer out loud before opening the solution.

<details>
<summary><strong>1. What timeouts should every outbound call have? [BASIC]</strong></summary>

<strong>What a strong answer covers:</strong>
A **connect** timeout (`1–2 s`), a **read** timeout (above the dependency's `p99`), a **pool/acquire** timeout, and an **overall deadline** that covers retries. Optionally a write timeout for large bodies. Never trust library defaults (`requests` / bare Go client = infinite).

</details>

<details>
<summary><strong>2. Why isn't a read timeout enough on its own? [BASIC]</strong></summary>

<strong>What a strong answer covers:</strong>
It limits the **gap between bytes**, not the whole response. A server trickling one byte every `4 s` never trips a `5 s` read timeout, so add a total deadline. Likewise a single `30 s` total timeout without a fast connect still lets dead IPs burn workers for most of that window (Linux `SYN` retries can hit `~127 s` if unset).

</details>

<details>
<summary><strong>3. What is the difference between `502`, `503`, and `504`? [BASIC]</strong></summary>

<strong>What a strong answer covers:</strong>
`502 Bad Gateway`: proxy got a broken, truncated, or `RST`-aborted upstream response (keep-alive race, OOM kill, oversized headers). `503 Service Unavailable`: intentional shedding or no healthy backends. `504 Gateway Timeout`: upstream accepted the request but did not answer before the proxy read timer.

</details>

<details>
<summary><strong>4. Why shrink timeouts as you go deeper? [BASIC]</strong></summary>

<strong>What a strong answer covers:</strong>
So the **innermost** call fails first with a clear error while outer layers still have time to retry or return a fallback—instead of the outer proxy cutting the connection mid-work. Example: LB `60 s` > app `55 s` > DB `50 s`.

</details>

<details>
<summary><strong>5. A dependency hangs and your whole service goes down. Why, and how do you prevent it? [SCENARIO]</strong></summary>

<strong>What a strong answer covers:</strong>
Without timeouts, each request waits forever, holding a thread and a connection; pools drain and everything queues. Set timeouts and a deadline on every call, add a circuit breaker to fail fast while it is down, and propagate cancellation so SQL does not keep running after the client left.

</details>

<details>
<summary><strong>6. Gateway has a 2 s budget and calls three services in a chain. How do you set timeouts? [SCENARIO]</strong></summary>

<strong>What a strong answer covers:</strong>
**Propagate the deadline**: each hop gets what's left (`2.0 → 1.7 → 1.2 s…`) via gRPC deadlines or a header. A service that receives an already-expired budget returns at once without starting work. Prefer relative remaining time over absolute clocks to avoid NTP skew.

</details>

<details>
<summary><strong>7. Random `502`s from the LB, mostly at night with little traffic. Cause? [SCENARIO]</strong></summary>

<strong>What a strong answer covers:</strong>
Keep-alive race: LB idle `60 s`, app keep-alive shorter (Uvicorn default `5 s`). App closes; LB reuses; `RST` → `502`. Fix: app keep-alive **above** LB idle (e.g. `75 s`). See also [Lesson 29](../29-connection-pooling-and-keep-alive/README.md).

</details>

<details>
<summary><strong>8. Why are Python `requests` / Go `http.Client` defaults dangerous? [SCENARIO]</strong></summary>

<strong>What a strong answer covers:</strong>
`timeout=None` and `Timeout=0` wait forever. One hung upstream pins every worker until the fleet stops serving even unrelated routes. Mandate explicit `(connect, read)` tuples / transport timers and lint against bare clients.

</details>

<details>
<summary><strong>9. Why should a client timeout be shorter than the server's? [TRICKY]</strong></summary>

<strong>What a strong answer covers:</strong>
So the inner side gives up first with a clear error while the caller still has budget to retry or fall back. For idle connections, the **client/LB** should also expire before the server so you never reuse a socket the peer already closed.

</details>

<details>
<summary><strong>10. Is it safe to retry every timed-out call? [TRICKY]</strong></summary>

<strong>What a strong answer covers:</strong>
No. A timeout does not tell you whether the server did the work (`504` especially). Retry only idempotent operations (`GET`, or `POST` with an idempotency key), with backoff and jitter, inside the overall deadline, and under a `≤10%` retry budget.

</details>

<details>
<summary><strong>11. How does a retry storm happen, and how does a retry budget stop it? [TRICKY]</strong></summary>

<strong>What a strong answer covers:</strong>
If three hops each retry three times, one user request becomes $4^3 = 64×$ load at the leaf. A token-bucket retry budget (credit `0.1` per request, spend `1.0` per retry) caps overhead at ~`10%` so a brownout can recover instead of melting further.

</details>

<details>
<summary><strong>12. Nginx returns `502` while the app logs `200 OK` in 5 ms. Three non-crash causes? [TRICKY]</strong></summary>

<strong>What a strong answer covers:</strong>
(1) Keep-alive `FIN`/`RST` race. (2) Response headers exceed `proxy_buffer_size` (`upstream sent too big header`). (3) Stale DNS / truncated framing before the proxy finished parsing—even though the app believes it succeeded. Correlate proxy error strings with `X-Request-Id`.

</details>

---

## One-Page Master Cheat Sheet

```text
====================================================================================================
                      NETWORK TIMEOUTS & 502s  —  CHEAT SHEET
====================================================================================================
IN ONE LINE   connect + read + pool + deadline; pass remaining budget down; inner < outer; app KA > LB idle

PHASES        pool borrow | connect TCP+TLS | write body | read next bytes | OVERALL deadline (+ retries)
DEFAULTS TRAP requests timeout=None | Go Client Timeout=0 | Linux SYN retries ≈ 127 s without connect cap

WORKED (p99=400 ms, SLA=2 s)
  connect 1 s | read 1 s | pool 0.5 s | deadline 1.5 s (0.5 s local) | uvicorn keep-alive 75 (> LB 60)

SHRINK INWARD   LB 60s > app 55s > DB 50s     innermost fails first with a clear error
KEEP-ALIVE 502  App KA 5s (Uvicorn) < LB idle 60s → random 502 at low traffic → set app KA 75s

DEADLINES       Gateway 2.0 → 1.7 → 1.2 → 0 (don't start)   gRPC native | HTTP header remaining ms
                Cancel down to SQL statement_timeout or zombies outlive the user's 504

502 vs 503 vs 504
  502 broken/RST/OOM/big header/keep-alive race   503 shedding/no backends   504 upstream too slow

RETRIES         Only idempotent (+ Idempotency-Key) | backoff+jitter | ONE layer | budget ≤ 10%
AMPLIFICATION   A = Π(1+r_i)     3 hops × 3 retries = 64×     4 hops = 256×

OBSERVE         timeout reason counters, remaining-budget hist, proxy error strings, pg_stat after 504
ANTI-PATTERNS   X no timeout=   X retries without deadline   X inner > outer   X app KA < LB idle
                X retry POST without key   X stacked retries every hop   X trust access logs alone for 502
====================================================================================================
```

---

## Free PDF notes

Download these notes as a printable PDF with the timeout anatomy diagram, `502`/`503`/`504` diagnostic grid, and interview answers: [SD-N-030.pdf](https://backendroadmap.com/notes/system-design/SD-N-030.pdf).

---

## Sources

- [RFC 9110: HTTP Semantics](https://www.rfc-editor.org/rfc/rfc9110), `502`, `503`, `504` definitions and safe/idempotent method contracts.
- [RFC 9112: HTTP/1.1](https://www.rfc-editor.org/rfc/rfc9112), persistent connection closure and half-closed message framing errors.
- [Google SRE Book: Addressing Cascading Failures](https://sre.google/sre-book/addressing-cascading-failures/), deadline propagation, load shedding, and avoiding retry amplification.
- [gRPC Deadlines Documentation](https://grpc.io/docs/guides/deadlines/), relative `Grpc-Timeout` propagation across distributed service meshes.
- [Go `context` & `net/http` Documentation](https://pkg.go.dev/net/http#Client), explicit transport timers (`Dialer.Timeout`, `TLSHandshakeTimeout`, `ResponseHeaderTimeout`).

---

## Next — Series Complete!

Congratulations on completing all **30 lessons of Networking From Zero**! You have traced data all the way from a physical wire and IP packet (`Lessons 01–07`), through TCP handshakes, congestion control, and `TIME_WAIT` (`Lessons 08–12`), subnets, NAT, and DNS traffic management (`Lessons 13–17`), HTTP semantics, caching, and TLS 1.3 cryptography (`Lessons 18–22`), modern HTTP/2/3, WebSockets, SSE, and streaming (`Lessons 23–26`), right up to production infrastructure: **reverse proxies, CDNs, connection pools, and deadlines (`Lessons 27–30`)**.

Where to go from here:
- Revisit any step in [the track overview](../README.md) to reinforce weak spots.
- Continue your system design foundations in [Core Fundamentals](../../01-core-fundamentals/README.md).
- Apply these networking guarantees directly inside service internals in [Backend Architecture](../../../backend/README.md).
