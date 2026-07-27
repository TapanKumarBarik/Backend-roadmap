# Module 04: Caching for Web Apps and Databases

## Why this matters

The first four modules built the caching *toolkit*: what a cache is, the
read/write strategies, eviction/invalidation, and multi-level hierarchies. This
module aims that toolkit at the two places a web backend actually needs it,
end to end:

- **The edge and the client** — static assets and API responses cached in the
  browser and on a CDN, controlled by HTTP headers. This is the cheapest caching
  there is (a hit never touches your origin), and it's mostly a matter of sending
  the right `Cache-Control`/`ETag` headers — which you met in track 01, now seen
  deliberately as a caching layer.
- **The data layer** — expensive joins and aggregates cached in Redis, the
  query-result caching track 04 module 07 previewed, now done properly.

And it confronts the failure mode that only shows up *under load*, the one that
turns a helpful cache into an outage amplifier: the **cache stampede** (a.k.a.
thundering herd / dogpile). A single hot key expiring at the wrong moment can
send thousands of simultaneous requests straight through to your database and
knock it over — the cache making things *worse* than no cache. Knowing the three
standard defenses (locking, jittered TTLs, request coalescing) is the difference
between a cache that protects your database and one that occasionally
executes it.

## Concepts

### HTTP caching, from the caching-strategy angle

Track 01 taught the mechanics of `Cache-Control`, `ETag`, and `Last-Modified`.
Here's what they *are* in this track's vocabulary: instructions your backend
sends so that **client-side and CDN caches** (module 00's cheapest layers)
serve copies without hitting your origin. The response headers are your
*write* into those caches; you have no other API to them.

The key directives, as caching decisions:

- **`Cache-Control: max-age=<seconds>`** — a TTL (module 02) for the browser's
  cache. `max-age=300` means "reuse this for 5 minutes without asking me." This
  is pure TTL-based invalidation pushed to the client — and note the module 00
  caveat: once sent, you *cannot* recall it, so pick `max-age` for how stale the
  client may safely be.
- **`Cache-Control: s-maxage=<seconds>`** — a separate TTL for *shared* caches
  (CDNs/proxies), overriding `max-age` for them. Lets you cache longer at the CDN
  (shared, one copy for everyone) than in each browser.
- **`Cache-Control: public` vs `private`** — `public` allows shared caches
  (CDN) to store it; `private` restricts to the end user's browser (use for
  per-user responses so a CDN never serves one user's data to another — a
  serious bug).
- **`Cache-Control: no-store`** — never cache anywhere (correctness-sensitive
  responses: balances, auth). `no-cache` is different and subtle — it means "you
  may store it, but revalidate with me before every reuse" (see conditional
  requests).
- **`ETag` + `If-None-Match` (conditional requests / revalidation)** — the
  server sends an `ETag` (a version/hash of the response); the client caches the
  body and, when it wants to reuse a possibly-stale copy, sends
  `If-None-Match: <etag>`. If unchanged, the server replies **`304 Not
  Modified`** with *no body* — the client reuses its cached copy. This is a
  cheaper-than-full-response *validation* mechanism: it saves bandwidth (no body)
  even when it can't save the round-trip. `Last-Modified`/`If-Modified-Since` is
  the timestamp-based equivalent.

The mental model: **`max-age`/`s-maxage` are TTLs that avoid the round-trip
entirely; `ETag`/`304` is revalidation that avoids re-sending the body.** Use
long `max-age` for truly static, versioned assets; short `max-age` + `ETag` for
things that change but where a cheap revalidation is worth it.

### Static assets: cache-forever + fingerprinting

Static assets (JS/CSS bundles, images, fonts) are the ideal caching target:
large, unchanging, requested constantly. The professional pattern:

- **Fingerprint the filename** with a content hash: `app.9f3c2a1.js`. The URL
  changes if and only if the content changes.
- **Cache it effectively forever**: `Cache-Control: public, max-age=31536000,
  immutable` (one year; `immutable` tells the browser not to even revalidate).
- **To "invalidate," change the URL** — a new build produces `app.7b0e4d2.js`,
  the HTML references the new name, and the old cached file is simply never
  requested again. This is *generational invalidation* (module 02's version-in-
  the-key trick) applied to URLs: you never bust the asset cache; you change the
  key.

This is why you can cache assets for a year with zero staleness risk — the URL
*is* the version. Serve these through a **CDN** so a hit is served from an edge
node near the user, never reaching your origin at all (module 00's edge layer).

### API response caching

Caching whole API responses at the edge/CDN is higher-leverage but trickier than
assets, because responses are often personalized and change more often. Rules:

- **Cache only safe, idempotent reads** (`GET`/`HEAD`). Never cache `POST`/
  `PUT`/`DELETE` responses — they have side effects and per-request meaning.
- **Mark per-user responses `private` (or `no-store`)** so a shared CDN never
  serves user A's data to user B. This is a real and dangerous class of bug: a
  misconfigured `public` on an authenticated endpoint leaks data across users
  via the CDN.
- **Use the `Vary` header** when a response depends on a request header (e.g.
  `Vary: Accept-Encoding`, `Vary: Authorization`) so caches key on that header
  too and don't serve the wrong variant.
- **Short `s-maxage` + `stale-while-revalidate`** is a common API pattern: serve
  a cached response instantly, and if it's within a grace window, revalidate in
  the background so the *next* request is fresh — hiding the miss latency.

For dynamic, personalized, or frequently-changing API data, edge caching often
isn't viable, and the right layer is server-side Redis (below) — which you
control precisely.

### Query-result caching in Redis (the data-layer workhorse)

The pattern from track 04 module 07, now with the full discipline of modules
00–03: cache the *result* of an expensive query — a multi-table join, a big
aggregate, a report — in Redis, keyed by the query's parameters, with a TTL.

```python
import json, hashlib, redis
r = redis.Redis(decode_responses=True)

def sales_by_region(quarter: str, region: str) -> list[dict]:
    key = f"agg:sales:{quarter}:{region}"          # stable key from the params
    if (hit := r.get(key)) is not None:
        return json.loads(hit)                      # cache hit: skip the 400ms query
    rows = run_expensive_aggregate(quarter, region) # miss: the real work
    r.set(key, json.dumps(rows), ex=300)            # TTL bounds staleness
    return rows
```

Design notes that separate a robust cache from a fragile one:

- **Key from *all* parameters that change the result** — the quarter and region
  here. Miss one and you serve region A's data for a region-B request (a
  correctness bug, not a staleness one). For many parameters, hash a normalized
  representation: `key = "agg:" + hashlib.sha1(json.dumps(params,
  sort_keys=True).encode()).hexdigest()`.
- **Cache the *result*, not the row objects** — store plain JSON/serialized data,
  not ORM objects (which don't serialize and carry session state).
- **Pick the TTL from the data's change rate** (module 02): a "this quarter"
  aggregate that shifts slowly tolerates minutes; a "last 5 minutes" metric needs
  seconds.
- **Invalidate on the writes that affect it** where you can name them (a new sale
  in region A busts `agg:sales:*:A` — or bump a generational version), and lean
  on the TTL for what you can't (module 02's un-enumerable problem — aggregate
  keys are often exactly that).

This is where caching gives its biggest single-query wins: a 400ms aggregate
requested constantly becomes a ~1ms Redis read, and the database is freed to do
the work only a cache miss demands.

### The cache stampede (thundering herd / dogpile)

Here is the load-only failure mode. Consider a very hot key — a homepage
aggregate hit 5,000×/second — cached with a TTL. The instant that key **expires**,
the *next* request misses... but so do the thousands of other requests arriving
during the ~400ms it takes to recompute the value, because none of them find a
cached value either. So **all of them** stampede through to the database and run
the same expensive query simultaneously. The database, sized for ~1 of these
queries at a time (because the cache normally absorbs the rest), is suddenly hit
with thousands at once — and may slow to a crawl or fall over. Worse, the
overload makes the recompute *slower*, widening the window, admitting *more*
stampeding requests: a self-amplifying collapse.

This is counterintuitive and important: **the cache didn't just stop helping at
expiry — it created a synchronized load spike that plain uncached access would
never produce.** Uncached, the 5,000 req/s would be spread as a steady 5,000
queries/s the DB was (presumably not) coping with; the cache concentrated the
miss into a simultaneous burst. Related triggers: a cold start (empty cache,
everything misses at once), a mass eviction, or many keys sharing an identical
TTL so they all expire together.

### The three standard stampede defenses

1. **Locking / mutex (single-flight recompute).** On a miss, the first request
   acquires a short-lived lock (`SET lock:key 1 NX EX 10`); only the lock holder
   recomputes and repopulates the cache. Everyone else, seeing the lock, either
   briefly waits and retries the cache, or serves a stale value. Result: **one**
   recompute instead of thousands. The core primitive:

   ```python
   def get_with_lock(key: str, loader, ttl=300):
       if (hit := r.get(key)) is not None:
           return json.loads(hit)
       lock = f"lock:{key}"
       if r.set(lock, "1", nx=True, ex=10):        # I won the right to recompute
           try:
               val = loader()
               r.set(key, json.dumps(val), ex=ttl)
               return val
           finally:
               r.delete(lock)
       else:                                        # someone else is recomputing
           time.sleep(0.05)                         # brief backoff, then retry the cache
           return get_with_lock(key, loader, ttl)
   ```

   This is a *local* mutual-exclusion for recompute; the distributed-lock
   correctness subtleties (lock expiry vs slow work, fencing) are a track 10
   topic — here, a short lock TTL and idempotent recompute are enough.

2. **Jittered / randomized TTLs.** The mass-expiry trigger is many keys sharing
   the same TTL. Add randomness: `ex = base_ttl + random.randint(0,
   jitter)`. Now keys expire spread across a window instead of all at once, so
   misses are staggered and never synchronize into a herd. Cheap, and it should be
   your default for any large set of similarly-created keys. (It doesn't help a
   *single* hot key's expiry — combine with locking for that.)

3. **Request coalescing (single-flight).** The in-process cousin of locking:
   within one process, if many concurrent requests miss the same key, let only
   the *first* actually compute, and have the rest **await the same in-flight
   result** rather than launching their own. In async Python this is a shared
   `asyncio.Future`/`Task` per key; conceptually identical to the lock but scoped
   to one process and zero-latency (no polling). Combine with the Redis lock to
   cover both intra-process and cross-process herds.

A fourth, complementary technique — **early/probabilistic recomputation
(`stale-while-revalidate`)**: refresh a hot key slightly *before* it expires, in
the background, so it never actually reaches the miss state under load. The HTTP
`stale-while-revalidate` directive is the edge version of this idea; Redis-side
you approximate it by recomputing when the remaining TTL drops below a threshold
(optionally with a probability that rises as expiry nears — the "XFetch"
algorithm). The unifying goal of all four: **never let more than one recompute of
a hot value happen at a time, and avoid synchronized expiry.**

## Command reference

| Header / API / command | Purpose | Example |
|---|---|---|
| `Cache-Control: public, max-age=31536000, immutable` | Cache a fingerprinted asset ~forever | static JS/CSS/images |
| `Cache-Control: private, max-age=0, no-store` | Never cache a per-user/sensitive response | balances, auth |
| `Cache-Control: s-maxage=60, stale-while-revalidate=30` | CDN TTL + background refresh grace | hot public API read |
| `ETag` + `If-None-Match` → `304` | Revalidate without re-sending the body | changed-rarely resources |
| `Vary: <header>` | Cache separate variants per request header | `Vary: Accept-Encoding` |
| `r.set(k, v, nx=True, ex=10)` | Acquire a stampede lock (set-if-absent + TTL) | single-flight recompute |
| `ex = base + random.randint(0, jitter)` | Jittered TTL to avoid synchronized expiry | any bulk-populated keys |
| `asyncio.Future` per key | In-process request coalescing | async single-flight |
| `PTTL key` | Remaining TTL in ms (for early-recompute checks) | probabilistic refresh |

Setting response cache headers in FastAPI:

```python
from fastapi import FastAPI, Response, Request
app = FastAPI()

@app.get("/assets/config.json")
def public_config(response: Response):
    response.headers["Cache-Control"] = "public, max-age=300, s-maxage=600"
    return {"feature_x": True}

@app.get("/me")
def me(response: Response):
    response.headers["Cache-Control"] = "private, no-store"   # never cache per-user data
    return {"user": "..."}
```

An async request-coalescing (single-flight) cache:

```python
import asyncio, json, redis.asyncio as aioredis
r = aioredis.Redis(decode_responses=True)
_inflight: dict[str, asyncio.Future] = {}

async def get_coalesced(key: str, loader):
    if (hit := await r.get(key)) is not None:
        return json.loads(hit)
    if key in _inflight:                      # a recompute is already running here
        return await _inflight[key]           # await it instead of starting our own
    fut = asyncio.get_event_loop().create_future()
    _inflight[key] = fut
    try:
        val = await loader()                  # only the first caller runs this
        await r.set(key, json.dumps(val), ex=300)
        fut.set_result(val)
        return val
    finally:
        _inflight.pop(key, None)
```

## Hands-on exercises

Redis running; FastAPI + a Postgres from track 04 (or a fake slow query). Install
`pip install "fastapi[standard]" redis`. Use a load tool — `hey`, `wrk`, or a
quick `asyncio`/`httpx` script — for the stampede exercises.

### 1. See `Cache-Control` and `304` on the wire

Add the two endpoints from the Command reference. `curl -i` each and read the
`Cache-Control` header. For an `ETag` endpoint, request it once, grab the
`ETag`, then re-request with `-H 'If-None-Match: <etag>'`.

Expected: the public endpoint carries a `max-age`; the `/me` endpoint carries
`no-store`; the conditional request returns **`304 Not Modified`** with an empty
body. You've watched the client-cache instructions and revalidation that module
00's "cheapest layer" runs on.

### 2. Fingerprint-and-cache-forever, then "invalidate" by renaming

Serve `app.<hash>.js` with `max-age=31536000, immutable`. Change the file's
contents, recompute the hash, serve it under the new name, and update the
referencing HTML.

Expected: the browser (check DevTools Network) serves the old file from cache
with zero requests until the *name* changes; the new name is fetched fresh. You've
implemented generational invalidation (module 02) at the URL level — cache-forever
with no staleness risk.

### 3. Query-result cache an expensive aggregate

Wrap a genuinely slow aggregate (`sales_by_region`, or reuse track 04's
"customers by spend") with the Redis cache from Concepts, keyed by *all* its
parameters. Call it with two different parameter sets, twice each.

Expected: first call per parameter set is a miss (slow, runs SQL); the second is
a ~1ms hit; and the two parameter sets never collide (different keys). Then
deliberately drop a parameter from the key and re-run — observe one parameter
set serving the *other's* data, the correctness bug of an incomplete key.

### 4. Reproduce a cache stampede under load

Cache a key that takes 400ms to compute, TTL 5s, via plain cache-aside (no
defenses). Point a load tool at the endpoint at high concurrency (e.g. `hey -z
20s -c 200`). Log every time the loader actually runs.

Expected: mostly cheap hits, but **every 5 seconds** (at each expiry) you see a
*burst* of simultaneous loader runs — dozens/hundreds at once — and a latency
spike as they all hit the DB together. You've reproduced the thundering herd: the
cache concentrating misses into synchronized bursts.

### 5. Fix it with a lock (single-flight)

Swap in `get_with_lock` from Concepts. Re-run the same load test.

Expected: at each expiry, the loader runs **once** (the lock winner); the other
requests briefly back off and then hit the freshly-repopulated cache. The
per-expiry burst of DB queries collapses from hundreds to one, and the latency
spike largely disappears. This is the stampede defense that matters most for a
single hot key.

### 6. Add jittered TTLs for a bulk-populated key set

Populate 1,000 keys all with `ex=60` (identical TTL). Observe (log expiries or
watch `DBSIZE`) that they vanish in a clump ~60s later — a mass-expiry herd
trigger. Repopulate with `ex = 60 + random.randint(0, 30)` and observe.

Expected: with identical TTLs, ~1,000 keys expire together (a herd waiting to
happen); with jitter, expiries spread over a 30s window and never synchronize.
Cheap insurance for any large set of similarly-created keys.

### 7. Async request coalescing

Implement `get_coalesced`. Fire 100 *concurrent* `asyncio` requests for the same
uncached key at once (all within one process). Count loader invocations.

Expected: the loader runs **once**; the other 99 await the same in-flight
`Future` and all receive that result — zero redundant work, and no polling
latency (unlike the lock's backoff). Note this covers only *intra-process* herds;
combine with the Redis lock (exercise 5) for multi-process protection.

### 8. Diagnose and fix: the cache that takes down the database at midnight

A dashboard endpoint caches its data with `ex=3600` (1 hour). Every day around
the same time, the database CPU spikes to 100% for ~30 seconds and requests time
out, then it recovers — and it correlates with a nightly cache flush the ops team
runs at midnight for "a clean slate." Under normal load the endpoint is fast.
Diagnose and give two independent fixes.

<details>
<summary>Answer</summary>

The nightly `FLUSHDB` empties the cache, so at 00:00 **every** hot key is
simultaneously absent — a cold-start stampede. The first wave of requests all
miss the same expensive keys at once and stampede the database, spiking it to
100% until the cache repopulates (~30s), exactly matching the symptom. Two
independent fixes: (1) **stop cold-flushing the cache** — a "clean slate" flush
is an anti-pattern for a live cache; if entries must be cleared, rely on
TTL/eviction or targeted invalidation, not a global wipe during traffic; (2) add
**stampede protection** so a cold cache can't herd the DB — a per-key lock
(single-flight, exercise 5) so only one request recomputes each key, plus
**jittered TTLs** (exercise 6) so keys don't all expire together in normal
operation. Optionally, warm the cache proactively (a background job repopulates
the hot keys) rather than letting live traffic pay the cold-start cost. Root
cause: a synchronized mass-miss (here caused by the flush) with no single-flight
defense — the canonical stampede.

</details>

## Independent challenge

No code given. Take the storefront/dashboard app you've grown since module 03 and
apply caching at both ends. At the **edge/client**: serve its static assets
fingerprinted with a one-year `immutable` `Cache-Control`, mark one genuinely
public read cacheable at the CDN (`s-maxage`) and one per-user endpoint `private`/
`no-store`, and add an `ETag`/`304` revalidation to a changes-rarely resource —
proving each with `curl -i`. At the **data layer**: query-result-cache your single
most expensive aggregate in Redis with a correct, all-parameters key and a
justified TTL. Then reproduce a **cache stampede** on that hot aggregate under a
load tool (from **04**'s own exercises), and defend it with *at least two* of the
three techniques — a single-flight lock plus jittered TTLs — proving with loader-
invocation counts that the per-expiry burst collapses to one recompute. State
which correctness-sensitive endpoint you deliberately marked `no-store` and why
caching it anywhere (browser, CDN, or Redis) would be a bug.

<details>
<summary>Hint</summary>

For assets, the pattern is fingerprint-in-the-filename +
`max-age=31536000, immutable`, invalidated by renaming (module 02's generational
trick) — never bust the asset cache. For the per-user endpoint, `private,
no-store` keeps a shared CDN from ever serving one user's data to another (the
dangerous `public`-on-authenticated bug). For the aggregate, build the key from
*every* parameter that changes the result (hash them if there are many) and pick
the TTL from how fast the underlying data moves. For the stampede, reproduce it
with a 400ms loader + short TTL + high concurrency, then wrap it in
`SET lock:key 1 NX EX 10` single-flight (only the winner recomputes) and add
`ex = base + random jitter` so keys don't expire in lockstep — log loader calls
before/after to prove one recompute per expiry instead of a herd. The `no-store`
endpoint is anything where staleness or cross-user leakage is a correctness bug —
a balance, an auth/session response, an inventory-decrementing checkout view.

</details>

## Common mistakes & troubleshooting

- **`public` on an authenticated/per-user response.** A shared CDN caches user
  A's data and serves it to user B — a serious data-leak bug. Per-user responses
  must be `private` or `no-store`, and use `Vary` where a header changes the
  response.
- **Caching non-idempotent methods.** Never cache `POST`/`PUT`/`DELETE`
  responses; only safe `GET`/`HEAD` reads.
- **Long `max-age` on a URL that doesn't change with content.** You can't recall
  a client cache; without fingerprinting, users are stuck with a stale asset for
  the whole `max-age`. Fingerprint the filename and cache forever, or use a short
  `max-age` + `ETag`.
- **Incomplete query-cache keys.** Omitting a parameter that changes the result
  serves one request's data for another's — a correctness bug, worse than
  staleness. Key on *all* result-determining parameters.
- **Caching ORM objects instead of plain results.** They don't serialize cleanly
  and carry session state; cache serialized data (JSON/msgpack).
- **No stampede defense on a hot key.** A single hot key's expiry (or a cold
  start / mass eviction / flush) sends a synchronized herd to the DB. Use
  single-flight locking, and jittered TTLs so keys don't expire together.
- **Identical TTLs on a large key set.** Guarantees synchronized mass expiry —
  always add jitter to bulk-populated keys.
- **Flushing a live cache for a "clean slate."** A global wipe under traffic is a
  self-inflicted cold-start stampede (exercise 8). Prefer TTL/eviction and
  targeted invalidation.

## Checkpoint quiz

Write down your answer to each question before expanding it — checking without attempting first is the single easiest way to fool yourself into thinking you've learned this.

1. Distinguish `Cache-Control: max-age` from an `ETag`/`If-None-Match`/`304`
   exchange — what does each save, and when do you use which?
2. Why can a fingerprinted static asset (`app.9f3c2a1.js`) be cached for a year
   with `immutable` and zero staleness risk, and how do you "invalidate" it?
3. Why must a per-user API response never be `Cache-Control: public`, and what's
   the concrete bug if it is?
4. When query-result caching in Redis, why is keying on *all* result-determining
   parameters a *correctness* requirement, not just a hit-ratio nicety?
5. Explain a cache stampede: what triggers it, why it can make a system worse
   than having no cache at all, and why it's a load-only failure.
6. Name the three standard stampede defenses, say which trigger each addresses,
   and why you'd often combine a lock with jittered TTLs.

<details>
<summary>Answers</summary>

1. `max-age` is a client-side TTL that lets the cache reuse the response *without
   any request* for that many seconds — it saves the whole round-trip. An
   `ETag`/`304` exchange still makes a request but, if the resource is unchanged,
   the server returns `304` with **no body** — it saves re-sending the body (and
   the recompute) but not the round-trip. Use long `max-age` for static/versioned
   content; use `ETag` revalidation for things that change but where a cheap
   "still valid?" check beats resending the whole body.
2. Because the filename contains a hash of the content, the URL changes if and
   only if the content changes — so a cached copy can never be stale (a different
   content = a different URL). You "invalidate" by producing a new build with a
   new hash and referencing the new filename; the old URL is simply never
   requested again (generational invalidation at the URL level).
3. Because `public` permits *shared* caches (CDNs/proxies) to store one copy and
   serve it to everyone — so user A's personalized response gets served to user B.
   The concrete bug is a cross-user data leak. Per-user responses must be
   `private` (browser-only) or `no-store`, plus `Vary: Authorization`/cookie
   where relevant.
4. Because the cache key *is* the identity of the cached value: if two different
   parameter sets map to the same key, a lookup for one returns the other's data.
   Missing a result-determining parameter therefore doesn't just lower the hit
   ratio — it serves *wrong* data (region A's numbers for a region-B request),
   which is a correctness bug, strictly worse than staleness.
5. A stampede happens when a hot key expires (or the cache is cold/flushed/mass-
   evicted) and the many concurrent requests arriving during the recompute window
   *all* miss and run the same expensive query at once, hammering a database sized
   to handle ~one at a time — and the overload lengthens the recompute, admitting
   more requests (self-amplifying). It's worse than no cache because it
   *concentrates* misses into a synchronized burst instead of a steady stream. It
   only appears under load because it needs many concurrent requests hitting the
   same expiry.
6. **Locking/single-flight** (only the lock winner recomputes) — addresses a
   single hot key's expiry herd; **jittered TTLs** — address synchronized
   mass-expiry of many similarly-created keys; **request coalescing** (in-process
   single-flight) — addresses concurrent misses within one process. You combine a
   lock with jitter because they cover different triggers: jitter stops keys from
   expiring in lockstep, while the lock ensures that even when a hot key *does*
   expire, only one recompute runs across processes.

</details>

## Next

[05-performance-bottlenecks-and-identifying-them](../05-performance-bottlenecks-and-identifying-them/README.md)
— caching is one tool for performance, and you've now applied it across the whole
stack. The track now widens from caching to performance in general: the key
metrics (response time, throughput, resource utilization), how to *systematically
find* a bottleneck instead of guessing, the N+1 problem seen as a general
bottleneck, and the discipline of fixing measured problems rather than
prematurely optimizing.
