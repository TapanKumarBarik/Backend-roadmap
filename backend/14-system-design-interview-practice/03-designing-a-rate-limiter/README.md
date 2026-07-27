# Module 03: Designing a Rate Limiter

## Why this matters

A rate limiter is the component that answers "should this request be allowed
right now, or rejected because the caller has done too much too fast?" It's how
you protect a system from abuse, from accidental thundering herds, from a single
misbehaving client exhausting shared capacity, and from cost blowouts on
expensive downstream calls. You already met rate limiting as a concrete
middleware in **09-security-deep-dive**; this module zooms out to the *design*
problem: how do you enforce a limit **accurately and cheaply across a fleet of
servers**, where no single machine sees all of a user's traffic?

That's what makes it a favorite interview problem — it's deceptively small but
forces precise thinking about **algorithms** (token bucket vs. sliding window
each have real, testable differences in burst behavior and memory), **shared
distributed state** (the counter has to live somewhere every server can atomically
update — usually Redis), **race conditions** (two servers checking-then-
incrementing the same counter concurrently), and the classic **accuracy vs. cost
vs. latency** tradeoff. Get this right and you can reason about any "enforce a
global constraint across a distributed fleet" problem, of which rate limiting is
the cleanest example.

## Concepts

### Requirements and scope

**Functional:**
- Allow or reject a request based on whether the caller (by user id, API key, or
  IP) has exceeded a configured limit (e.g. 100 requests/minute).
- Support different limits for different callers/tiers and different endpoints.
- On rejection, return **HTTP 429 Too Many Requests**, ideally with a
  `Retry-After` header telling the client when to try again.

**Non-functional:**
- **Low latency.** The limiter sits in front of *every* request, so its own
  overhead must be tiny (sub-millisecond) — it can't become the bottleneck it's
  meant to prevent.
- **Distributed accuracy.** In a fleet of N app servers, the limit is *global*
  ("100/min per user across the whole service"), not per-server. State must be
  shared.
- **Highly available & fail-open vs. fail-closed.** If the limiter's datastore is
  unreachable, do you allow all traffic (fail-open, favors availability) or block
  it (fail-closed, favors protection)? A real decision tied to what you're
  protecting.
- **Low memory.** With millions of distinct callers, per-caller state must be
  compact.

### Where the limiter lives

The limiter can sit at several layers, and the choice affects both what it can
see and how much it protects:

- **At the API gateway / load balancer / reverse proxy** (recall the gateway/BFF
  from **11-advanced-api-paradigms**). Centralizes enforcement before requests
  reach app servers; protects the whole backend. Common in practice.
- **As middleware in each app server** (like the **09-security-deep-dive**
  middleware). Simpler to deploy with the app, but every instance must consult
  *shared* state to enforce a global limit — which is the crux of the design.
- **As a dedicated rate-limiter service** the app calls. Cleanest separation and
  reusable across services, at the cost of an extra network hop per request.

Wherever it lives, the enforcement logic needs a **shared, fast, atomic counter
store** — almost always **Redis** — because the limit is global and many servers
update the same counter concurrently.

### The algorithms (this is the heart of the problem)

Five classic algorithms, in roughly increasing sophistication. Know the burst
behavior, memory, and accuracy of each.

- **Fixed window counter.** Count requests per fixed time bucket (e.g. per
  minute); reset at the boundary. One integer per caller per window — tiny and
  simple. **Flaw:** a burst straddling the boundary can allow up to *2× the
  limit* — 100 requests at 11:00:59 and 100 more at 11:01:00 pass, 200 in two
  seconds.
- **Sliding window log.** Store a timestamp for every request; on each new
  request, drop timestamps older than the window and count what's left. Perfectly
  accurate, no boundary flaw. **Flaw:** memory grows with request volume (a
  timestamp per request per caller) — expensive at scale.
- **Sliding window counter.** A hybrid: keep the current and previous fixed-
  window counts and *weight* the previous window by how much of it still overlaps
  the sliding window. Smooths the boundary burst of the fixed window using O(1)
  memory. A very common production choice — good accuracy, cheap.
- **Token bucket.** A bucket holds up to `capacity` tokens and refills at a
  steady `refill_rate` tokens/sec; each request consumes one token, and a request
  with no token available is rejected. **Allows bursts** up to the bucket
  capacity while enforcing a long-run average rate — often exactly the behavior
  you want (tolerate short spikes, cap sustained rate). O(1) state per caller
  (two numbers: token count + last-refill timestamp).
- **Leaky bucket.** Requests enter a fixed-size queue and are processed
  (leak out) at a constant rate; a full queue rejects new requests. **Smooths**
  bursty input into a steady output rate — good when the thing you're protecting
  needs a *constant* processing rate, at the cost of added latency (queued
  requests wait).

The most-reached-for defaults are **token bucket** (when bursts are acceptable
and you want a simple average-rate cap) and **sliding window counter** (when you
want accurate windowed limits with tiny memory).

### Distributed state and race conditions

The subtle, high-signal part. In a fleet, a naive "read counter, check limit,
write counter+1" is a **read-modify-write race**: two servers read `count=99`
simultaneously, both see it's under 100, both write `100`, and *two* requests
pass when only one should. The fix is to make the check-and-increment **atomic**:

- **Atomic increment** — Redis `INCR` returns the new value in one atomic op, so
  each request gets a unique count; the first read that exceeds the limit
  rejects. Combine with `EXPIRE` to reset the window.
- **Atomic compound logic via a Lua script.** Token bucket needs to read tokens,
  compute refill, decrement, and write back *atomically* — a Redis Lua script
  runs the whole read-modify-write as one atomic unit on the server, eliminating
  the race without round-trips.

This is the same class of problem as the distributed lock and idempotency work in
**10-distributed-systems-patterns**: whenever multiple nodes mutate shared state,
you need an atomic primitive or you get lost updates. Rate limiting is the
cleanest illustration.

### Accuracy vs. cost vs. latency (the tradeoffs)

Every algorithm and deployment choice trades among three things:

- **Accuracy** — how precisely you enforce the limit (sliding window log is
  exact; fixed window is loose at boundaries).
- **Memory/cost** — per-caller state size × number of callers (log is expensive;
  counter/token-bucket are O(1)).
- **Latency** — a shared central store adds a network hop per request; some
  designs trade accuracy for speed by allowing each server a *local* sub-limit
  and syncing periodically (fast, but the global limit becomes approximate).

The **fail-open vs. fail-closed** decision belongs here too: if Redis is down,
fail-open keeps the product working but drops protection; fail-closed keeps
protection but causes an outage. For most user-facing traffic, **fail-open** is
the common default (a rate limiter shouldn't take the whole site down); for
protecting something expensive or dangerous (a payment endpoint, a costly
downstream), **fail-closed** may be right. State the choice and its justification.

## Command reference

Algorithm comparison — memorize this table; it's the crux of the interview.

| Algorithm | State per caller | Burst behavior | Accuracy | Notes |
|---|---|---|---|---|
| Fixed window | 1 counter | Up to **2× at boundary** | Loose | Simplest; boundary flaw |
| Sliding window log | 1 timestamp **per request** | Exact | Perfect | Memory grows with traffic |
| Sliding window counter | 2 counters | Smoothed | Good | O(1); common production pick |
| Token bucket | tokens + timestamp | **Allows bursts** to capacity | Good | Average-rate cap; very common |
| Leaky bucket | queue + rate | **Smooths** to constant output | Good | Adds latency; steady output |

Key numbers and mechanics:

```
429 Too Many Requests  +  Retry-After: <seconds>   ← the rejection response
Redis INCR + EXPIRE     ← atomic fixed-window counter, race-free
Redis Lua script        ← atomic token-bucket read-modify-write
fail-open   = allow on store outage   (favors availability)
fail-closed = reject on store outage  (favors protection)
```

Token-bucket implementation (the one to be able to write from memory):

```python
import time

class TokenBucket:
    def __init__(self, capacity: int, refill_rate: float):
        self.capacity = capacity          # max tokens (burst size)
        self.refill_rate = refill_rate    # tokens added per second
        self.tokens = float(capacity)
        self.last = time.monotonic()

    def allow(self, cost: int = 1) -> bool:
        now = time.monotonic()
        # refill based on elapsed time, capped at capacity
        self.tokens = min(self.capacity,
                          self.tokens + (now - self.last) * self.refill_rate)
        self.last = now
        if self.tokens >= cost:
            self.tokens -= cost
            return True          # allowed
        return False             # rejected → 429
```

The distributed version moves `tokens`/`last` into Redis and runs the
refill-check-decrement as an **atomic Lua script** so concurrent servers can't
race. As FastAPI middleware:

```python
from fastapi import Request
from fastapi.responses import JSONResponse

async def rate_limit_middleware(request: Request, call_next):
    key = f"rl:{client_id(request)}"
    allowed, retry_after = redis_token_bucket(key, capacity=100, rate=100/60)
    if not allowed:
        return JSONResponse(
            status_code=429,
            content={"detail": "rate limit exceeded"},
            headers={"Retry-After": str(retry_after)},
        )
    return await call_next(request)
```

## Hands-on exercises

Written and pseudocode exercises — reason about correctness and tradeoffs.

### 1. Expose the fixed-window boundary flaw

With a limit of 100 requests/minute using a fixed window, construct the exact
sequence of requests and timestamps that lets **200 requests** through in a ~2-
second span without violating the per-window count. Then explain in one sentence
which two algorithms fix it and how.

### 2. Pick the algorithm per scenario

For each, name the best-fit algorithm and justify in one line: (a) an API that
should tolerate short bursts but cap the sustained rate; (b) a downstream that
must be fed at a strictly constant rate; (c) a limit that must be accurate at the
window boundary but use minimal memory; (d) a compliance requirement for
*exactly* N per rolling hour, memory no object.

### 3. Write the token bucket from memory

Without looking, implement `TokenBucket.allow()` — refill by elapsed time, cap at
capacity, consume on success. Then answer: what do `capacity` and `refill_rate`
each control in observable behavior, and how would you set them for "burst of 50,
sustained 10/sec"?

### 4. Find and fix the race condition

This distributed limiter is wrong. Identify the race and rewrite it to be
correct.

```python
def allow(user_id):
    key = f"rl:{user_id}:{current_minute()}"
    count = redis.get(key) or 0        # read
    if int(count) >= 100:              # check
        return False
    redis.set(key, int(count) + 1)     # modify-write
    redis.expire(key, 60)
    return True
```

### 5. Size the state

You have **50M distinct API keys**, each needing token-bucket state of two 8-byte
numbers (~16 bytes, call it ~50 bytes with Redis key overhead). Estimate total
memory. Does it fit in one Redis node (~256 GB)? Now redo it for the **sliding
window log** if each active caller averages 1,000 requests in the window — what
happens to the memory, and what does that tell you about algorithm choice at
scale?

### 6. Design the fail mode

Your rate limiter's Redis becomes unreachable during a spike. Design the behavior
for two different endpoints: a public read-only search endpoint, and a
`POST /payments/charge` endpoint. Choose fail-open or fail-closed for each and
justify from what each endpoint protects. Reference the availability-vs-
protection framing.

### 7. Multi-tier and multi-key limits

Design limits that apply *simultaneously*: 10 req/sec per IP **and** 1,000
req/hour per API key **and** 100 req/min per endpoint-per-user. Explain how you'd
evaluate all three per request, what you return when any one trips, and how you'd
keep the total Redis round-trips low (hint: pipeline / a single Lua script).

### 8. Diagnose and fix a flawed design

Critique and fix this design.

> "Each app server keeps an in-memory dictionary `counts[user_id]` and allows 100
> requests/minute per user by incrementing it, resetting every minute with a
> local timer. We run 20 app servers behind a round-robin load balancer. On
> reject we return `403 Forbidden`. If a server restarts, its counts reset. We
> chose this because it's fast and needs no external dependency."

<details>
<summary>Solution</summary>

Flaws and fixes:

1. **Per-server local state can't enforce a global limit.** With 20 servers and
   round-robin balancing, a user hitting all of them gets up to 20 × 100 =
   **2,000/min**, not 100. The limit must use **shared state** (Redis) that all
   servers read/increment atomically.
2. **Wrong status code.** Rate-limit rejection is **429 Too Many Requests**, not
   `403 Forbidden` (which means "authenticated but not allowed"). Also add
   `Retry-After`.
3. **Server restart wipes counts → limit bypass.** Because state is in process
   memory, a restart (or a deploy) resets a user's count to zero, letting them
   exceed the limit. Shared external state survives restarts.
4. **Local timer reset is a fixed-window with the boundary flaw *and* unsynced
   clocks** — 20 servers reset at 20 slightly different instants, making the
   global window incoherent. A shared store with `EXPIRE` (or a sliding window
   counter) gives one coherent window.
5. **"No external dependency" is a false economy.** The whole point of a
   distributed limiter is shared state; avoiding it defeats the requirement. The
   right design accepts a Redis dependency and adds a **fail-open/closed** policy
   for when it's unavailable.

Corrected: all servers enforce via atomic Redis operations (`INCR`+`EXPIRE` for
fixed/sliding-window counter, or a Lua-scripted token bucket) keyed on `user_id`;
return **429** + `Retry-After`; pick a documented fail-open (public) or
fail-closed (sensitive) policy for Redis outages.

</details>

## Independent challenge

No solution given. Design a rate limiter for a **public API with tiered pricing**
— free, pro, and enterprise tiers with different limits — that also needs to
**protect an expensive downstream ML inference service** whose calls cost real
money. Your design must enforce per-tier limits accurately across a fleet, pick
an algorithm justified by the burst behavior you want, choose a fail mode
justified by what's being protected, and return proper 429s with `Retry-After`.
Reuse the atomic-state reasoning from **10-distributed-systems-patterns**: the
per-tier counters live in shared storage and must be updated race-free under
concurrent load. Then estimate the Redis memory for your expected number of
active keys.

<details>
<summary>Hint</summary>

The expensive-downstream requirement pushes you toward **fail-closed** on the ML
path (allowing unlimited calls during a Redis outage could cost thousands of
dollars) even if you fail-open on cheap read endpoints — a per-endpoint fail
policy, not one global one. For the tiers, don't build three separate limiters:
key the token bucket on `(api_key)` and look up that key's tier to pick
`capacity`/`refill_rate`, so one code path serves all tiers with per-tier
parameters. And because inference calls are costly and bursty, token bucket
(tolerate a small burst, cap sustained rate) usually beats a leaky bucket's
forced latency — but justify whichever you pick against the downstream's actual
tolerance.

</details>

## Common mistakes & troubleshooting

- **Per-server local counters for a global limit.** N servers → N× the intended
  limit. The limit is global; the state must be shared.
- **Read-modify-write race on the counter.** Concurrent check-then-increment lets
  extra requests through. Use an atomic primitive (`INCR`, or a Lua script for
  compound logic).
- **Wrong status code.** Returning `403` (or `503`) instead of **429 Too Many
  Requests** with `Retry-After`. 429 is the specific, correct signal.
- **Ignoring the fixed-window boundary flaw.** Claiming a fixed-window enforces
  the limit when a boundary-straddling burst doubles it. Know the flaw and when it
  matters.
- **Sliding window log at scale.** A timestamp per request per caller blows up
  memory. Use the sliding window *counter* (O(1)) unless exactness is mandatory.
- **No fail-mode decision.** Not saying what happens when Redis is down. Choose
  fail-open or fail-closed *per what's protected* and state it.
- **Confusing token bucket and leaky bucket.** Token bucket *allows* bursts to
  capacity; leaky bucket *smooths* to a constant output rate. They produce
  different traffic shapes — pick by the behavior you want.

## Checkpoint quiz

Write down your answer to each question before expanding it — checking without attempting first is the single easiest way to fool yourself into thinking you've learned this.

1. What HTTP status code and header does a rate limiter return on rejection, and
   what does the header tell the client?
2. Explain the fixed-window boundary flaw with a concrete example, and name two
   algorithms that fix it.
3. Contrast token bucket and leaky bucket in terms of burst behavior and output
   shape. When would you pick each?
4. Why can't a fleet of servers each keep a local counter to enforce a global
   limit, and what does the correct design use instead?
5. Describe the read-modify-write race on a shared counter and the specific Redis
   mechanism that eliminates it for compound (token-bucket) logic.
6. What is the fail-open vs. fail-closed decision, and which would you pick for a
   public search endpoint versus a payment endpoint?
7. At 50M callers, why does the sliding window *log* become impractical while the
   sliding window *counter* stays cheap?

<details>
<summary>Answers</summary>

1. **429 Too Many Requests**, with a **`Retry-After`** header giving the number
   of seconds (or a date) until the client may retry.
2. With 100/min fixed windows, 100 requests at 11:00:59 and 100 at 11:01:00 are
   in *different* windows but only ~2 seconds apart — 200 requests in 2 seconds,
   up to 2× the limit. **Sliding window log** and **sliding window counter** fix
   it (and token bucket avoids it by construction).
3. **Token bucket allows bursts** up to the bucket capacity while capping the
   long-run average — bursty output, good when short spikes are fine. **Leaky
   bucket smooths** input into a constant-rate output (queuing excess), adding
   latency — good when the protected downstream needs a steady rate.
4. Because with round-robin balancing a caller's requests spread across all N
   servers, so each local counter sees only ~1/N of the traffic and the effective
   global limit becomes N× the intended one (and restarts reset it). The correct
   design uses **shared atomic state** (Redis) all servers update.
5. Two servers read the same count, both see it under the limit, both write
   count+1 — a lost update that lets an extra request through. A **Redis Lua
   script** runs the refill-check-decrement as one atomic server-side operation,
   so no interleaving is possible.
6. On a limiter-store outage: **fail-open** allows all traffic (favors
   availability), **fail-closed** blocks it (favors protection). Public search →
   fail-open (don't take the site down over a limiter). Payment endpoint →
   fail-closed (don't let unlimited/expensive/dangerous calls through).
7. The log stores a timestamp per request per caller, so memory scales with total
   in-window request volume (50M callers × hundreds/thousands of timestamps) —
   huge. The counter keeps just two integers per caller (O(1)), so 50M callers is
   a bounded, modest amount regardless of request volume.

</details>

## Cumulative review

Closed-book. Don't reopen modules 00–03 while attempting these — the point is to
find out what actually stuck.

1. A social API has **300M DAU**, each making **20 requests/day**. Compute
   average and peak request QPS (state your peak factor and the seconds-per-day
   constant you used), then say whether this is "one database" or "shard
   everything" scale and why.
2. Walk the seven-step framework in order for "design a pastebin." For each step
   give one sentence of what you'd produce. Which step most determines whether
   you need sharding, and why?
3. For a URL shortener at 100M new URLs/day, justify from the numbers why the
   design needs a cache and read replicas but *not* an exotic write path — and
   name the id-generation strategy that avoids both a central bottleneck and a
   per-creation uniqueness read.
4. Turn this bare assertion into a proper tradeoff statement using the module-01
   template: "We'll use a token bucket." Invent the requirement that justifies it.
5. A candidate designs a distributed rate limiter with per-server in-memory
   counters and returns `403` on reject. Name the two independent bugs (one about
   correctness of the limit, one about the response) and fix each.
6. Give the storage formula and apply it: 20M chat messages/day, 1 KB each, kept
   3 years, replicated 3×. State the total *and* the architectural conclusion.
7. Explain, using the latency ladder, why moving a rate limiter's counter from a
   cross-region database to a same-datacenter Redis matters for a component that
   sits in front of every request — put rough numbers on the per-request cost of
   each.
8. For both the URL shortener and the rate limiter, identify the single shared
   distributed-systems primitive that makes the write path correct under
   concurrency, and name the module (00–03) where you'd expect to have learned
   the general pattern.

<details>
<summary>Answers</summary>

1. 300M × 20 = 6×10⁹ requests/day. ÷10⁵ = **60,000 QPS average**; ×3 peak ≈
   **180,000 QPS peak**. That read/request rate can't come off one primary —
   it's **shard-everything (plus caching/replicas)** scale; a single DB tops out
   in the low thousands of writes/sec and can't serve ~10⁵ QPS.
2. (1) Requirements: create/read a paste, TTL, maybe syntax highlight; NFRs
   read-heavy, low-latency read. (2) Estimation: pastes/day, read:write, storage.
   (3) API: `POST /pastes`, `GET /{id}`. (4) Data model: KV by paste id, choose
   store + shard key. (5) High-level: LB → app → cache → KV store + blob for
   large bodies. (6) Deep-dive: id generation or cache strategy. (7) Bottlenecks:
   hot pastes, storage growth. **Capacity estimation (step 2)** most determines
   sharding — the storage/QPS numbers decide one-box vs. many.
3. 100M/day → ~1,000 writes/sec (peak ~3,000): modest, a normal store handles it,
   so no exotic write path. But 100:1 reads → ~300K redirects/sec peak, which
   *must* be served from a cache + read replicas, and ~270 TB over 5 years exceeds
   one machine so the store is partitioned. The id strategy that avoids both a
   central bottleneck and a per-creation uniqueness read is a **pre-allocated
   block/ticket counter → base62**.
4. "I'll use a token bucket, which tolerates short bursts up to a capacity while
   capping the sustained rate, at the cost of allowing brief spikes; that's right
   here because our clients legitimately batch-call in bursts but we must cap
   long-run load on an expensive downstream."
5. (a) **Per-server in-memory counters can't enforce a global limit** — across N
   servers the effective limit becomes N× intended and restarts reset it; fix
   with shared atomic Redis state (`INCR`+`EXPIRE` or a Lua token bucket). (b)
   **`403` is the wrong code** — use **429 Too Many Requests** with `Retry-After`.
6. `storage = item_size × item_rate × retention × replication`. 20M × 1 KB =
   20 GB/day; ×365×3 ≈ 21.9 TB; ×3 replication ≈ **~66 TB**. Conclusion: exceeds
   a single machine's comfortable capacity → partition/shard the message store
   (and consider tiered/cold storage for old messages).
7. Every request pays the limiter's store round-trip. Same-datacenter Redis ≈
   ~0.5 ms; a cross-region DB round trip ≈ 100+ ms. On a component in front of
   *every* request, that's the difference between adding ~0.5 ms and adding
   ~100 ms of latency to all traffic — the latter makes the limiter the
   bottleneck it was meant to prevent.
8. Both need an **atomic check-and-update on shared state** (put-if-absent /
   conditional write for the shortener's unique code; atomic increment / Lua
   token bucket for the limiter). The general pattern — atomic operations,
   idempotency, distributed coordination — is the material of
   **10-distributed-systems-patterns** (previewed here; this track just applies
   it).

</details>

## Next

[04-designing-a-distributed-cache-and-key-value-store](../04-designing-a-distributed-cache-and-key-value-store/README.md)
— the last two problems *used* a cache and a partitioned store as black boxes;
next you'll design the black box itself: consistent hashing, replication,
eviction, and the CAP/consistency tradeoffs that decide how a distributed
key-value store behaves under failure.
