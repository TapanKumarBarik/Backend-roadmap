# Module 04: Rate Limiting and Abuse Prevention

## Why this matters

Modules 01-03 were about a *single* malicious request doing damage. This module
is about the opposite: requests that are individually legitimate but
catastrophic *in volume*. Without a limit on how often a caller can hit an
endpoint, an attacker gets **unlimited attempts** — and unlimited attempts
break things that are secure against any single request:

- **Brute force / credential stuffing** — guessing passwords or replaying leaked
  credential lists until one works. Track 03 hardened the login (argon2,
  constant-time, MFA); none of that matters if the attacker can try ten million
  passwords. Rate limiting is what makes those defenses *hold*.
- **Scraping and enumeration** — walking every `/users/{id}` or `/products/{id}`
  to steal your whole catalog or user base.
- **Resource exhaustion / DoS** — hammering an expensive endpoint (a report, a
  search, a signup that sends email) until the service falls over or the bill
  explodes.
- **Abuse of costly actions** — flooding password-reset emails, SMS codes,
  or free-tier compute.

Rate limiting is the single most important *abuse* control, and it's a
secure-by-design decision (module 00, A04): a login endpoint without one is
insecure *by design*, not by bug. This module gives you the two algorithms worth
knowing (token bucket and sliding window), a correct Redis implementation
(track 06 leaned on Redis for exactly this), and the surrounding abuse-
prevention toolkit — because a limiter you can trivially bypass is no limiter.

## Concepts

### What rate limiting is, and the key design questions

Rate limiting caps how many operations a given *subject* may perform in a given
*time window*, rejecting the excess (typically with HTTP `429 Too Many
Requests`). Before picking an algorithm, answer three design questions — getting
these wrong makes even a perfect algorithm useless:

- **Limit by *what key*?** IP address, user id, API key, or a combination.
  Each has a failure mode: per-IP punishes users behind shared NAT/corporate
  proxies (many real users, one IP) and is evaded by attackers with many IPs
  (botnets, cloud); per-user can't protect *pre-login* endpoints (there's no
  user yet — the login itself); per-API-key is clean for machine clients. Real
  systems combine: per-IP *and* per-account on login, per-key for APIs, with
  different limits.
- **Limit *where*?** At the edge (API gateway, reverse proxy, WAF, Cloudflare) or
  in the app. The edge is cheaper and stops floods before they touch your code;
  the app has the context (which user, which action) for precise limits. Do
  both — a coarse edge limit plus fine-grained app limits (defense in depth).
- **What limit, and what response?** Set per-endpoint (a login gets a tight
  limit; a read endpoint a loose one). On exceed, return `429` with a
  **`Retry-After`** header so well-behaved clients back off, and make sure the
  rejection itself is *cheap* (you're defending against volume — the limit check
  must cost far less than the work it's protecting).

### Fixed window — simple, with a burst flaw

The simplest algorithm: a counter per (key, time-window), incremented per
request, reset each window. "Max 100 requests per minute" = a counter keyed by
`user:minute` that resets every minute.

```python
# Fixed window with Redis INCR + EXPIRE (track 06's pattern).
def fixed_window(key: str, limit: int, window_s: int) -> bool:
    n = redis.incr(f"rl:{key}")
    if n == 1:
        redis.expire(f"rl:{key}", window_s)   # start the clock on first hit
    return n <= limit
```

It's cheap and easy but has the **boundary-burst** flaw: a client can send
`limit` requests at 11:00:59 and another `limit` at 11:01:00 — `2 × limit` in
two seconds — because the window reset in between. For a login limiter that
"burst" is exactly what you're trying to stop. Fine for coarse throttling,
insufficient for tight abuse limits.

### Sliding window — smoothing the boundary

Sliding-window algorithms fix the burst by considering a *rolling* window rather
than fixed calendar buckets:

- **Sliding window log** — store a timestamp per request (a Redis sorted set),
  drop entries older than the window, and count what remains. Exact, but stores
  one entry per request (memory-heavy under load).
- **Sliding window counter** — an approximation that weights the previous fixed
  window by how much of it still overlaps the rolling window. Nearly as accurate
  as the log, far cheaper. The common production choice.

```python
# Sliding window log with a Redis sorted set — exact, no boundary burst.
import time
def sliding_log(key: str, limit: int, window_s: int) -> bool:
    now = time.time()
    k = f"rl:{key}"
    pipe = redis.pipeline()
    pipe.zremrangebyscore(k, 0, now - window_s)   # evict entries older than the window
    pipe.zadd(k, {f"{now}": now})                 # record this request
    pipe.zcard(k)                                 # count what's left in the window
    pipe.expire(k, window_s)
    _, _, count, _ = pipe.execute()
    return count <= limit
```

### Token bucket — allowing controlled bursts

The token bucket is the most flexible and the one most gateways/libraries use.
Model: a bucket holds up to `capacity` tokens and refills at `rate` tokens per
second; each request removes one token; if the bucket is empty, the request is
rejected (or waits). Two parameters give you independent control of **burst**
(the capacity — how many can arrive at once) and **sustained rate** (the refill
— the long-run average). That's its advantage: it *permits* legitimate bursts (a
page that fires 10 API calls on load) while still capping the sustained rate,
where a naive per-second limit would reject the burst.

```python
# Token bucket, conceptually (production: do this atomically in a Redis Lua script
# so the read-compute-write can't race between concurrent requests).
def token_bucket(key, capacity, refill_per_s) -> bool:
    now = time.time()
    tokens, last = get_bucket(key)                     # stored: tokens + last-refill time
    tokens = min(capacity, tokens + (now - last) * refill_per_s)   # refill by elapsed time
    if tokens < 1:
        return False                                   # empty → reject (429)
    save_bucket(key, tokens - 1, now)                  # spend a token
    return True
```

The **leaky bucket** is a close cousin (requests queue and drain at a fixed
rate, smoothing bursts *out* instead of allowing them); token bucket is more
common for API rate limiting. Rule of thumb: **token bucket** when you want to
allow bursts up to a cap; **sliding window** when you want a strict "N per
period" with no burst.

### Why Redis, and the atomicity trap

Rate limit state must be **shared across all your app instances** — if you run
three FastAPI workers and keep the counter in each process's memory, an attacker
gets `3 × limit` (one bucket per worker), and the count resets on every deploy.
A shared store (Redis) is the standard answer — the same role it played as
broker/cache in track 06.

The trap is **atomicity**. A rate-limit check is read-modify-write (read the
count/tokens, decide, write back). Under concurrency, two requests can both read
"1 token left," both decide "ok," and both spend it — the check races and the
limit leaks. Fixes:

- Use **atomic Redis operations**: `INCR` is atomic (the fixed-window snippet is
  safe); the sorted-set pipeline should run as a transaction/Lua script.
- For token bucket, do the whole read-compute-write in a **Lua script**
  (`EVAL`), which Redis runs atomically — the standard production implementation.
- Or use a battle-tested library. In Python, **`slowapi`** (built on
  `limits`) wires rate limiting into FastAPI with a Redis backend and correct
  atomics; `fastapi-limiter` is another. Prefer these over hand-rolling unless
  you're learning (you are — so build one by hand once, then use a library).

### The response, and abuse prevention beyond rate limits

A correct rejection and the wider toolkit:

- **`429 Too Many Requests` + `Retry-After`** (seconds or an HTTP-date) so
  clients back off politely. Optionally expose `X-RateLimit-Limit/Remaining/
  Reset` headers so good clients self-regulate.
- **Account lockout / exponential backoff** (track 03 m07) complements rate
  limiting: rate limiting protects the *endpoint* from volume; lockout protects
  a *specific account* from targeted guessing. Remember its DoS caveat — naive
  lockout lets an attacker lock a victim out on purpose; prefer backoff, lock on
  IP+account, don't reveal lockout state.
- **CAPTCHA / proof-of-work** after a threshold, to separate humans from bots
  without hard-blocking.
- **Progressive friction** — a small tarpit/delay on suspicious traffic costs
  attackers (who need volume) far more than the occasional real user.
- **Cost-based limiting** — weight expensive endpoints more (a report costs 10
  "tokens," a health check 1), so you limit *work*, not just request count.
- **Anti-enumeration** — cap and monitor sequential-id access patterns
  (module 00's IDOR signature); rate-limit per-resource-type reads to blunt
  scraping.
- **Never trust a client-provided identity for the key.** Rate-limiting by a
  header the client sets (a `X-User-Id` they choose, or a spoofable
  `X-Forwarded-For`) is trivially bypassed by rotating it. Key off something you
  *establish* (authenticated user id, the real peer IP as your proxy sets it).

## Command reference

| Pattern | Purpose | Snippet |
|---|---|---|
| `redis.incr` + `expire` | fixed-window counter (atomic incr) | `n=incr(k); if n==1: expire(k,w)` |
| sorted-set + pipeline | sliding-window log (exact) | `zremrangebyscore`/`zadd`/`zcard` |
| Lua `EVAL` script | atomic token bucket | read-compute-write in one atomic op |
| `slowapi` / `fastapi-limiter` | production limiter for FastAPI | Redis backend, decorators |
| `429` + `Retry-After` | correct rejection | `HTTPException(429, headers={"Retry-After":"60"})` |
| per-IP **and** per-account key | login abuse defense | limit both; combine with lockout |
| `X-RateLimit-*` headers | let good clients self-regulate | Limit/Remaining/Reset |
| real peer IP (not `X-Forwarded-For` blindly) | don't key off spoofable input | trust only your proxy's set value |

A FastAPI dependency doing per-IP + per-account login limiting with `429`:

```python
import time
from fastapi import APIRouter, Request, HTTPException
router = APIRouter()

def rate_limit(key: str, limit: int, window: int):        # fixed-window, atomic INCR
    n = redis.incr(f"rl:{key}")
    if n == 1:
        redis.expire(f"rl:{key}", window)
    if n > limit:
        ttl = redis.ttl(f"rl:{key}")
        raise HTTPException(429, "too many attempts",
                            headers={"Retry-After": str(max(ttl, 1))})

@router.post("/login")
def login(request: Request, username: str, password: str):
    ip = request.client.host                              # trust your proxy to set this correctly
    rate_limit(f"login-ip:{ip}", limit=10, window=60)     # endpoint flood control (per IP)
    rate_limit(f"login-user:{username}", limit=5, window=300)  # targeted-account control
    user = authenticate(username, password)               # constant-time (track 03 m07)
    if not user:
        raise HTTPException(401, "invalid credentials")   # one generic message
    return {"ok": True}

# In production, prefer slowapi:
#   from slowapi import Limiter;  limiter = Limiter(key_func=get_remote_address, storage_uri="redis://…")
#   @router.post("/login"); @limiter.limit("5/minute")
```

## Hands-on exercises

Continue in `sec-track`. Run Redis in Docker (`docker run -p 6379:6379 redis`),
same as track 06. Have your track-03 login endpoint handy — it's the natural
thing to protect.

### 1. Implement a fixed-window limiter

Write the `rate_limit` helper (Redis `INCR`/`EXPIRE`) and apply it to an
endpoint at 5 requests/minute. Fire 7 rapid `curl`s. Expected: the first 5
succeed, the 6th and 7th return `429` with a `Retry-After`. Confirm the counter
resets after the window.

### 2. Expose the fixed-window burst flaw

With a 5/minute limit, send 5 requests in the last second of one minute and 5 in
the first second of the next. Expected: 10 requests succeed within ~2 seconds —
double the intended rate. Write one sentence on why this defeats a tight login
limiter.

### 3. Fix the burst with a sliding-window log

Reimplement the limiter using a Redis sorted set (the `sliding_log` snippet).
Repeat the boundary test from exercise 2. Expected: the burst is now correctly
rejected — no more than 5 in any rolling 60-second window regardless of clock
alignment.

### 4. Build a token bucket and watch it allow controlled bursts

Implement a token bucket (capacity 10, refill 1/sec). Send 10 requests instantly
(all succeed — the burst), then observe that further requests succeed roughly
once per second as tokens refill. Expected: bursts up to capacity are allowed
while the sustained rate is capped — the behavior a strict per-second limit
can't give you.

### 5. Prove the atomicity trap, then fix it

Point your token-bucket read-compute-write at a bucket with 1 token and fire ~50
concurrent requests (threads or `asyncio.gather` of `httpx` calls). With a naive
non-atomic implementation, count how many got through. Expected: *more than one*
slips through (the race). Move the logic into a Redis Lua `EVAL` (or use `INCR`)
and confirm exactly one succeeds.

### 6. Prove the per-process trap

Run your app with 2+ workers (`uvicorn --workers 2`) using an *in-memory* dict as
the limiter store. Hammer the endpoint. Expected: you get roughly `limit ×
workers` through, because each worker has its own counter. Switch to Redis and
confirm the limit is now global.

### 7. Rate-limit login by IP *and* account

Protect your track-03 login with two keys: per-IP (endpoint flood) and
per-account (targeted brute force). Demonstrate: hammering *one* account from
one IP trips the account limit; spreading attempts across many accounts from one
IP still trips the IP limit. Expected: neither "many guesses at one account" nor
"one guess at many accounts" gets unlimited attempts.

### 8. Adopt a library and add cost-based limits

Swap your hand-rolled limiter for `slowapi` (Redis storage) on a couple of
endpoints. Then make an expensive endpoint (a report) consume more budget than a
cheap one. Expected: you can articulate why limiting *work* (cost) beats limiting
raw request count, and you trust a maintained implementation for the atomics.

### 9. Diagnose and fix: the reset-password flood

Audit this endpoint for abuse issues and fix them.

```python
@app.post("/reset-password")
def reset(email: str, request: Request):
    key = request.headers.get("X-Client-Id", "anon")   # client sends this
    n = LOCAL_COUNTS.get(key, 0) + 1                    # in-process dict
    LOCAL_COUNTS[key] = n
    if n > 100:
        raise HTTPException(429)
    send_reset_email(email)                             # costly: sends an email each call
    return {"sent": True}
```

<details>
<summary>Solution</summary>

Flaws: (1) **Client-controlled key** — limiting by `X-Client-Id` (a header the
caller sets) is trivially bypassed by rotating it; key off something you
establish (the real peer IP set by your proxy, and/or the target email). (2)
**In-process counter** — `LOCAL_COUNTS` isn't shared across workers and resets on
deploy, so the real limit is `100 × workers` and evaporates on restart; use
Redis. (3) **Limit far too loose for a costly action** — 100 reset emails per
window is an email-flood/DoS-on-the-victim vector; tighten drastically (e.g.
3–5 per email per hour) since each call *sends mail*. (4) **Per-email
enumeration/abuse** — also key by target email and, per track 03 m07, return the
same "if that account exists, we sent a link" response whether or not the email
exists (don't reveal existence). (5) **No `Retry-After`**. Corrected shape:
Redis-backed sliding-window limit keyed by real IP *and* target email, tight
limits for the costly send, `429`+`Retry-After`, and an enumeration-safe
response.

</details>

## Independent challenge

No code given. Add a complete abuse-prevention layer to `sec-track`'s most
sensitive endpoints: the login and the password-reset. Requirements: a
**Redis-backed** limiter (so it's correct across multiple workers — prove the
per-process trap doesn't apply to you), **atomic** (no race under concurrency —
justify how you guarantee it), keyed by **real peer IP *and* target
account/email** (never a client-settable header), returning **`429` +
`Retry-After`**, with an algorithm you can justify (token bucket vs sliding
window — say which and why for *each* endpoint). Layer it with **account
backoff** (reach back to **track 03 module 07** — and avoid its DoS/enumeration
pitfalls) and make the reset endpoint **enumeration-safe**. Then write a note
mapping each control to the specific abuse it stops (brute force, credential
stuffing, reset-email flood, scraping) and explaining why rate limiting is a
*secure-by-design* (module 00 / A04) requirement rather than a feature you add
after an incident.

<details>
<summary>Hint</summary>

The two mistakes that quietly void a rate limiter are **non-shared state** and
**a spoofable key** — get either wrong and the limit is decorative. Shared state
means Redis (or another central store), not per-process memory, so N workers
don't multiply the limit N-fold; atomicity means the read-compute-write happens
as one indivisible operation (an atomic `INCR`, or a Lua `EVAL` for token
bucket) so concurrent requests can't both spend the last token. For the key,
anything the client can set (`X-Client-Id`, a raw `X-Forwarded-For`) can be
rotated to reset the counter — key off the peer IP *your proxy* sets plus the
authenticated/target identity. Choose the algorithm per endpoint by whether
bursts are legitimate: an API that fires several calls on page load wants token
bucket; a login where *any* burst is suspicious wants a strict sliding window.

</details>

## Common mistakes & troubleshooting

- **In-process/in-memory rate limit state.** Multiplies the limit by your worker
  count and resets on deploy. Use a shared store (Redis).
- **Non-atomic read-compute-write.** Concurrent requests race and the limit
  leaks. Use atomic ops (`INCR`) or a Lua `EVAL` script; or a vetted library.
- **Keying off client-settable input.** `X-Client-Id`, unvalidated
  `X-Forwarded-For` — trivially rotated to bypass. Key off established identity
  and the real peer IP your proxy sets.
- **Fixed window for tight limits.** The boundary-burst allows ~2× the limit
  across a window edge. Use sliding window (or token bucket) where the burst
  matters.
- **Per-IP only.** Punishes shared-NAT users and is evaded by many-IP attackers.
  Combine per-IP with per-account/per-key.
- **No `Retry-After` / expensive rejection.** Good clients can't back off, and a
  costly limit check undermines the point. Return `429`+`Retry-After` cheaply.
- **Limiting count, not cost.** A few requests to a very expensive endpoint can
  still exhaust you. Weight expensive actions higher (cost-based).
- **Treating rate limiting as an afterthought.** It's secure-by-design (A04) —
  an unlimited login/reset is insecure *by design*. Build it in, don't bolt it
  on post-incident.

## Checkpoint quiz

Write down your answer to each question before expanding it — checking without attempting first is the single easiest way to fool yourself into thinking you've learned this.

1. Name the three design questions to answer before choosing a rate-limit
   algorithm, and a failure mode for keying by IP alone.
2. Describe the fixed-window burst flaw and which algorithm fixes it.
3. What does a token bucket give you that a strict per-second limit does not,
   and name its two parameters.
4. Why must rate-limit state live in a shared store, and what is the atomicity
   trap and its fix?
5. Why is rate-limiting by a client-supplied header (or raw `X-Forwarded-For`)
   broken, and what should you key off instead?
6. How do rate limiting and account lockout differ in what they protect, and
   what's the danger of naive lockout?
7. Why is rate limiting a *secure-by-design* concern rather than a feature you
   add after an incident?

<details>
<summary>Answers</summary>

1. *What key* (IP/user/API key/combination), *where* (edge vs app), and *what
   limit + what response*. Keying by IP alone punishes users behind shared
   NAT/proxies (many users, one IP) and is evaded by attackers with many IPs
   (botnets/cloud).
2. A fixed-window counter resets on calendar boundaries, so a client can send a
   full window's worth just before the reset and another just after — ~2× the
   limit in seconds. A sliding window (log or counter) considers a rolling
   window and fixes it.
3. It allows controlled *bursts* up to a capacity while still capping the
   sustained rate, where a strict per-second limit would reject a legitimate
   burst. Parameters: **capacity** (max burst) and **refill rate** (sustained
   average).
4. Because otherwise each worker/process keeps its own counter, so N workers give
   ~N× the limit and it resets on deploy — a shared store (Redis) makes it
   global. The atomicity trap: the read-modify-write can race so two concurrent
   requests both spend the last token; fix with atomic ops (`INCR`) or a Lua
   `EVAL` script.
5. Anything the client sets (`X-Client-Id`, unvalidated `X-Forwarded-For`) can be
   rotated per request to reset the counter, so it enforces nothing. Key off
   something you establish: the authenticated user/target account and the real
   peer IP as set by your trusted proxy.
6. Rate limiting caps request *volume* per key/window, protecting the endpoint
   from brute force/stuffing/floods; account lockout protects a *specific*
   targeted account after N failures. Naive lockout is dangerous because an
   attacker can deliberately lock out a victim (DoS) and lockout responses can
   leak which accounts exist — prefer backoff, lock on IP+account, hide state.
7. Because an endpoint with no limit (login, reset, expensive report) is insecure
   *by design*, not by a code bug — the vulnerability is the missing control, so
   it must be designed in up front (A04). Adding it only after a brute-force or
   flood incident means you shipped the hole knowingly.

</details>

## Next

[05-secrets-management](../05-secrets-management/README.md) — you've defended the
*surface* of the app; now defend the *keys to the kingdom*. Never hardcoding
secrets, environment- and vault-based secret storage, rotation, and keeping
secrets out of logs and git history. That module also carries this track's
second **cumulative review** (modules 00-05), taken closed-book.
