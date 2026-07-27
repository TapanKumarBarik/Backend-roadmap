# Module 02: Designing a URL Shortener

## Why this matters

The URL shortener (think bit.ly, TinyURL) is the classic warm-up design problem,
and it earns that status honestly: it looks trivial — "just store a mapping and
redirect" — but running it through the framework surfaces a surprising density of
real distributed-systems concepts in a small, tractable package. You'll confront
**unique-id generation at scale** (how do you mint billions of distinct short
codes without collisions and without a central bottleneck?), the archetypal
**extremely read-heavy** workload (redirects vastly outnumber creations, so
caching and read replicas dominate the design), **storage estimation over
years**, and a genuine **consistency vs. availability** decision on the write
path.

Because it's small, it's the perfect place to practice the *whole* framework end
to end without drowning in scope — you can actually finish all seven steps. And
because every later problem in this track reuses these building blocks (id
generation, cache-aside reads, read replicas, key-based partitioning), getting
them crisp here pays off everywhere. Treat this module as the reference
implementation of "run the framework cleanly on a bounded problem."

## Concepts

### Requirements and scope

**Functional:**
- Given a long URL, return a short URL (a short code on your domain, e.g.
  `sho.rt/aB3xK9`).
- Given a short URL, redirect to the original long URL.
- (Optional) custom alias chosen by the user.
- (Optional) expiration / TTL on links.

**Non-functional (the ones that shape everything):**
- **Massively read-heavy.** Redirects dominate creations — assume ~**100:1**
  read:write. This single NFR pushes the entire design toward caching and read
  replicas.
- **Low-latency redirects.** A redirect is on the user's critical path to the
  destination site; target <100 ms. Users won't tolerate a slow indirection.
- **High availability.** If the shortener is down, every link everywhere breaks.
  Redirects especially must stay up — leaning toward **availability over strong
  consistency** (recall the CAP tradeoff from **10-distributed-systems-
  patterns**).
- **Not-so-strict durability/consistency on creation.** It's acceptable if a
  freshly created link takes a second to be globally visible; it is *not*
  acceptable to ever hand out the *same* short code for two different long URLs.

Out of scope for the warm-up: user accounts, analytics dashboards, spam
detection (mention them, defer them).

### Capacity estimation

Run the module-00 recipe. Assume **100M new URLs/day**.

```
writes:  100M/day ÷ 10^5 s        = 1,000 writes/sec average
         × 3 peak                 ≈ 3,000 writes/sec peak
reads:   1,000 × 100 (r:w ratio)  = 100,000 reads/sec average
         × 3 peak                 ≈ 300,000 redirects/sec peak
```

Storage (each row: short code + long URL + metadata ≈ **500 bytes**, kept 5
years):

```
per day    = 100M × 500 B         = 50 GB/day
5 years    = 50 GB × 365 × 5      ≈ 91 TB
× 3 replication                   ≈ ~270 TB
```

Two conclusions that drive the architecture: (1) 300K reads/sec **mandates a
cache and read replicas** — you will not serve that from a single primary; (2)
~270 TB **exceeds one machine**, so the key-value store must be **partitioned/
sharded**. The write rate (3K/sec) is modest and a well-chosen datastore handles
it, so writes are *not* the bottleneck — reads are.

### The core problem: short-code generation

The heart of the design is minting a short, unique code for each URL. Codes are
**base62** (`[a-z A-Z 0-9]`, 62 characters), which is compact and URL-safe.
Length math:

```
62^6 ≈ 5.7 × 10^10  (57 billion)   → 6 chars covers years at 100M/day
62^7 ≈ 3.5 × 10^12                 → 7 chars is very comfortable headroom
```

So **7 base62 characters** gives ample space. Now, *how* to generate the code —
three viable strategies, each with a tradeoff:

1. **Counter → base62 (id encoding).** Maintain a global monotonically
   increasing 64-bit counter; each new URL gets the next integer, which you
   **base62-encode** into the short code. Pros: guaranteed unique, no collision
   checks, dense (short codes). Cons: needs a distributed counter without a
   single bottleneck — solved with a **key-generation service** or a ranged
   ticket server (each app server pre-allocates a block of ids, e.g. 1,000 at a
   time, from a central allocator, so it only talks to the allocator once per
   thousand URLs). Also, sequential codes are *guessable/enumerable* — a downside
   if that matters.
2. **Random code + collision check.** Generate a random 7-char base62 string,
   check the datastore for existence, retry on the rare collision. Pros: codes
   are non-enumerable; no central counter. Cons: an extra read per creation to
   check uniqueness (cheap at low collision density but not free), and collision
   probability grows as the space fills.
3. **Hash the long URL (e.g. MD5/SHA) → take first N base62 chars.** Pros:
   deterministic (same long URL → same code, which can dedupe). Cons: hash
   collisions on the truncated prefix must still be handled, and determinism
   leaks that two people shortened the same URL.

The **pre-allocated-block counter** approach is usually the strongest default:
it removes the central bottleneck (each server hands out codes from its local
block) while guaranteeing uniqueness with no collision checks. This is the same
"batch to amortize a central coordination cost" idea you'll see again in module
04's key-value store.

### The read path: cache-aside and redirects

Redirects are 99% of traffic, so the read path *is* the system. The flow:

```
GET /aB3xK9
  → Load Balancer
  → App server
  → check Redis cache for "aB3xK9"     ── hit (common) ──► 301/302 redirect
                                       └─ miss ─► read replica → cache it → redirect
```

Key design points on the read path:

- **Cache-aside** (recall **05-caching-and-performance**): on a miss, read from
  the store, populate the cache, then serve. With a 100:1 read ratio and hot
  links following an 80/20 distribution, cache hit rates are very high, so almost
  every redirect is served from memory in <1 ms.
- **301 vs. 302.** A **301 (permanent)** lets browsers and intermediaries cache
  the redirect, slashing load on your service — but then you *lose* the ability to
  track clicks and you can't easily change the target. A **302 (temporary/found)**
  keeps every redirect flowing through your service (so you can count clicks and
  change targets) at the cost of more traffic. The choice is a real tradeoff tied
  to whether analytics matter.
- **Read replicas + CDN.** Behind the cache, replicate the datastore for read
  scaling; optionally push hot redirects to edge/CDN. Redirects are trivially
  cacheable because they rarely change.

### Data model and partitioning

The data is a simple key-value mapping, so a **NoSQL key-value store** (or a
partitioned SQL table) fits naturally — you only ever look up *by short code*.

```
short_code (PK)   long_url        created_at   expires_at   owner_id?
"aB3xK9"          "https://…"     2026-07-24   null         null
```

- **Access pattern:** point lookup by `short_code` on reads; insert on writes.
  No range scans, no joins. This is the ideal shape for a hash-partitioned KV
  store.
- **Shard key:** `short_code`. Hash-partition on it so lookups go straight to the
  owning shard, and the ~270 TB spreads evenly across nodes. Because reads are
  single-key point lookups, sharding adds no scatter-gather cost — every read
  hits exactly one shard.
- **Custom aliases** are just user-supplied `short_code`s; you must check
  uniqueness on insert (a conditional write) and reject duplicates with `409`.
- **Expiration** is a TTL column; a background cleanup job (recall
  **06-background-processing-and-realtime**) lazily purges expired rows, or you
  check `expires_at` on read and treat expired as `404`.

## Command reference

The design at a glance — reference numbers, API, and architecture.

Capacity summary (100M new URLs/day assumption):

| Quantity | Value | Drives |
|---|---|---|
| Write QPS (avg / peak) | 1,000 / ~3,000 | Modest — not the bottleneck |
| Read QPS (avg / peak) | 100,000 / ~300,000 | Cache + read replicas mandatory |
| Storage (5 yr, ×3) | ~270 TB | Must partition/shard the KV store |
| Short code | 7 base62 chars (62⁷ ≈ 3.5×10¹²) | Years of headroom |
| Read:write ratio | ~100:1 | Read-heavy → caching dominates |

Core API (a redirect is a plain GET; creation is a POST):

```python
from fastapi import FastAPI, HTTPException
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, HttpUrl

app = FastAPI()

class ShortenRequest(BaseModel):
    long_url: HttpUrl
    custom_alias: str | None = None
    ttl_days: int | None = None

class ShortenResponse(BaseModel):
    short_url: str

@app.post("/api/v1/shorten", response_model=ShortenResponse, status_code=201)
def shorten(req: ShortenRequest):
    code = req.custom_alias or generate_code()   # counter→base62, or random
    if not store.put_if_absent(code, str(req.long_url), req.ttl_days):
        raise HTTPException(409, "alias already taken")   # uniqueness conflict
    return ShortenResponse(short_url=f"https://sho.rt/{code}")

@app.get("/{code}")
def redirect(code: str):
    long_url = cache.get(code) or store.get(code)   # cache-aside
    if long_url is None:
        raise HTTPException(404, "unknown or expired link")
    cache.set(code, long_url)
    return RedirectResponse(long_url, status_code=302)   # 302 to keep click tracking
```

Base62 encoding of a counter value (strategy 1):

```python
ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ"

def base62_encode(n: int) -> str:
    if n == 0:
        return ALPHABET[0]
    out = []
    while n > 0:
        n, rem = divmod(n, 62)
        out.append(ALPHABET[rem])
    return "".join(reversed(out))
```

High-level architecture:

```
                        ┌──────────────┐
  Client ─── GET /code ►│ Load Balancer│
                        └──────┬───────┘
                               ▼
                        ┌──────────────┐   hit    ┌──────────┐
                        │ App servers  │ ───────► │  Redis   │  (hot codes, <1ms)
                        │ (stateless)  │ ◄─────── │  cache   │
                        └──────┬───────┘   miss   └──────────┘
             writes (POST)     │  read miss
                               ▼
                     ┌────────────────────┐    ┌───────────────────┐
                     │ Key-Gen / Allocator│    │ Partitioned KV     │
                     │ (block of ids)     │    │ store (hash by     │
                     └────────────────────┘    │ short_code) +      │
                                               │ read replicas      │
                                               └───────────────────┘
```

## Hands-on exercises

Written design exercises — reason on paper, state assumptions and tradeoffs.

### 1. Size the short code

Assume the service must not run out of codes for **20 years** at 100M new
URLs/day. Compute total codes needed and the minimum base62 length. Show that 7
characters suffices and by how much headroom. Then argue whether you'd still pick
7 or go to 8, and why.

### 2. Estimate and conclude

Redo the full capacity estimate for a *smaller* internal shortener: **1M new
URLs/day**, 100:1 reads, 5-year retention, 500-byte rows, ×3 replication. Compute
write/read QPS (peak) and total storage. Then state the architectural
consequence: at *this* scale, do you still need sharding and read replicas, or
would a single primary + one cache suffice? Justify from the numbers.

### 3. Choose an id-generation strategy

For each of the three strategies (counter→base62, random+check, hash-of-URL),
list one scenario where it's the *best* choice. Then pick a default for a public
shortener where codes should be non-enumerable *and* creation must not hit a
central counter on every request, and describe how you'd get both properties.

### 4. Design the cache-aside read path

Write pseudocode for the redirect handler including: cache check, miss →
replica read → cache populate, expired-link handling, and unknown-code `404`.
Then state your cache eviction policy and TTL, and justify them against the 80/20
hot-link assumption.

### 5. 301 vs. 302 tradeoff

Your product team wants per-link click analytics *and* the lowest possible
infrastructure cost. Explain why these two goals conflict through the 301/302
choice, and recommend one, stating exactly what you give up.

### 6. Handle custom aliases and collisions

Describe how you enforce uniqueness for user-chosen custom aliases without a race
condition when two users request the same alias simultaneously. Name the specific
datastore primitive you'd use (hint: recall conditional writes / put-if-absent
and idempotency from **10-distributed-systems-patterns**) and the status code you
return on conflict.

### 7. Scale the write path's counter

Your single global counter has become a bottleneck at high write volume. Design
the **pre-allocated block (ticket) allocator**: how big a block each app server
grabs, what happens to unused ids when a server crashes, and why this is
acceptable. Estimate how much you reduce load on the central allocator with a
block size of 1,000.

### 8. Diagnose and fix a flawed design

Critique this proposed design and fix every flaw.

> "Every redirect does a `SELECT * FROM urls WHERE long_url = ?` on the primary
> Postgres database to find the short code — wait, no, to find the long URL from
> the short code, so `WHERE short_code = ?`. There's one Postgres instance, no
> cache, and no replicas. Short codes are generated by `SELECT MAX(id)+1 FROM
> urls` on each insert. We use a 301 permanent redirect and also want to show
> users a live click counter on their dashboard."

<details>
<summary>Solution</summary>

Flaws, each with a fix:

1. **No cache on a 100:1 read-heavy system.** 300K peak redirects/sec against a
   single Postgres is impossible. Add a Redis cache-aside layer; hot codes serve
   from memory in <1 ms.
2. **Single Postgres instance, no replicas.** A single point of failure and no
   read scaling. Add read replicas (and partition the ~270 TB — one box can't
   hold it anyway). Reads should hit replicas/cache, never the primary.
3. **`SELECT MAX(id)+1` for id generation is a race and a bottleneck.** Two
   concurrent inserts read the same MAX and collide, and it serializes every
   write. Use a proper allocator: a pre-allocated block/ticket server or an
   atomic sequence, base62-encoded — no scan, no race.
4. **301 permanent redirect *contradicts* the live click-counter requirement.**
   A 301 lets browsers cache the redirect and skip your service entirely, so you
   *can't* count most clicks. If analytics are required, use **302** so every
   redirect flows through you — accept the higher traffic as the cost of
   tracking.
5. **(Implied) point-lookup workload modeled as a relational scan.** Access is
   purely by `short_code`; a hash-partitioned KV store (or a well-indexed,
   sharded table keyed on `short_code`) fits far better than ad-hoc `SELECT`s on
   a single relational box.

The corrected design: LB → stateless app servers → Redis cache-aside → sharded
KV store (hash by `short_code`) with read replicas; codes from a block allocator,
base62-encoded; 302 redirects to preserve click tracking; TTL-based expiry.

</details>

## Independent challenge

No solution given. Extend the shortener into a **link-analytics platform**: on
top of redirects, capture per-link click events (timestamp, coarse geo, referrer,
device) and serve a dashboard showing click counts over time — *without* slowing
the redirect down. Design the ingestion and aggregation path end to end, and be
explicit about where you accept eventual consistency. Lean on the async
processing patterns from **06-background-processing-and-realtime**: the redirect
must stay <100 ms, so the click event cannot be written synchronously to an
analytics store on the hot path.

<details>
<summary>Hint</summary>

The redirect handler should do the absolute minimum on the critical path — look
up the target and 302 — and fire the click event *asynchronously* onto a message
queue/stream, never blocking the response. A pool of workers consumes the stream
and writes to an analytics store optimized for time-series aggregation (or
pre-aggregates counts in rolling windows). This is exactly the fan-out-to-a-queue
pattern from module 06, and it's why the redirect stays fast while the dashboard
is allowed to lag by seconds — the click count is an eventually-consistent
number, and the NFR says that's fine.

</details>

## Common mistakes & troubleshooting

- **No cache on a read-heavy system.** The defining mistake here. 100:1 reads
  means the cache *is* the design; serving redirects from the primary DB doesn't
  scale.
- **`SELECT MAX(id)+1` (or any read-then-write) for id generation.** A race
  condition and a serialization bottleneck. Use an atomic sequence or block
  allocator.
- **Ignoring the 301/302 tradeoff.** Picking 301 for "performance" then being
  unable to count clicks, or 302 without realizing you've forgone browser-side
  caching. Tie the choice to whether analytics matter.
- **Over-long or over-short codes.** Guessing a length instead of computing it
  from base62ⁿ vs. required capacity. Do the math: 7 chars ≈ 3.5×10¹², plenty.
- **Modeling a pure point-lookup as a relational scan.** Access is by key only;
  reaching for joins/scans on a single relational box misses the natural KV/
  hash-partition fit.
- **Forgetting expiration cleanup.** TTL'd links pile up forever without a purge
  strategy (lazy on-read, or a background sweeper).
- **Central counter as a single point of failure/bottleneck.** A naive global
  counter serializes all writes; batch it with block pre-allocation.

## Checkpoint quiz

Write down your answer to each question before expanding it — checking without attempting first is the single easiest way to fool yourself into thinking you've learned this.

1. Why is a URL shortener overwhelmingly read-heavy, and what two architectural
   components does that single fact force into the design?
2. How many base62 characters do you need to comfortably cover 100M new
   URLs/day for years, and how did you arrive at that length?
3. Compare the three short-code generation strategies (counter→base62,
   random+check, hash-of-URL). Which gives non-enumerable codes, and which
   avoids a per-creation uniqueness read?
4. Explain the block/ticket allocator: what problem it solves and why it's
   acceptable to lose a few ids when a server crashes.
5. What's the concrete tradeoff between a 301 and a 302 redirect, and which do
   you pick if click analytics are required?
6. Why is `short_code` the natural shard key, and why does sharding on it add no
   scatter-gather penalty to reads?
7. Two users request the same custom alias at the same instant. What primitive
   prevents a double-assignment, and what do you return to the loser?

<details>
<summary>Answers</summary>

1. Redirects vastly outnumber creations (~100:1) because a link is created once
   and clicked many times. That forces (a) a **cache** (cache-aside on the
   redirect path) and (b) **read replicas** behind it — reads must be served from
   memory and replicas, never a single primary.
2. **7 characters.** 62⁷ ≈ 3.5×10¹², and 100M/day over even 20 years is ~7×10¹¹
   codes, so 7 chars leaves several times headroom (6 chars, 62⁶ ≈ 5.7×10¹⁰, is
   too tight). Compute required-codes vs. 62ⁿ.
3. **Random+check** and **counter→base62** differ on enumerability: counter codes
   are sequential/guessable, random codes are non-enumerable. **Counter→base62**
   (and hash-of-URL) avoid a per-creation uniqueness read; **random+check**
   requires a lookup to detect collisions.
4. Each app server pre-allocates a *block* of ids (e.g. 1,000) from the central
   allocator in one call, then hands them out locally — so the central allocator
   is hit once per 1,000 URLs instead of every URL, removing the bottleneck.
   Losing an unused block on a crash just skips some ids; the id space is
   astronomically large, so gaps are harmless.
5. **301** is cacheable by browsers/intermediaries (less load on you) but you
   lose click tracking and can't change the target; **302** routes every redirect
   through your service (enables analytics and target changes) at higher traffic.
   If analytics are required, pick **302**.
6. Reads are point lookups by `short_code`, so hash-partitioning on it sends each
   read to exactly one shard — no query ever needs to touch multiple shards, so
   there's no scatter-gather. It also spreads the ~270 TB and the read load
   evenly.
7. A conditional write / **put-if-absent** (or a unique constraint) on
   `short_code` makes one insert win atomically; the loser gets a **409
   Conflict**.

</details>

## Next

[03-designing-a-rate-limiter](../03-designing-a-rate-limiter/README.md) — you've
run the framework on a read-heavy storage problem; next you'll design a rate
limiter, which flips the focus to *write-path enforcement*, distributed counter
state, and precise algorithm tradeoffs (token bucket, sliding window). It also
carries the track's **first cumulative review**, mixing everything from modules
00–03.
