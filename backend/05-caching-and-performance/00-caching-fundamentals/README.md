# Module 00: Caching Fundamentals

## Why this matters

Track 04 ended on a preview of it: the cheapest query is the one you never run.
Caching is that idea generalized to the entire stack. Almost every performance
problem you will meet as a backend engineer is really a problem of *doing
expensive work repeatedly when the answer hasn't changed* — recomputing the same
aggregate, re-reading the same row, re-rendering the same page, re-fetching the
same asset. A cache is a small, fast store that sits in front of a slow or
expensive resource and remembers recent answers so the expensive path runs far
less often.

Done well, a single well-placed cache can cut a p99 latency from 800ms to 8ms
and drop database load by 90% — with a few dozen lines of code. Done badly, it
serves a customer someone else's data, shows a "deleted" item that's still
there, or falls over harder than the thing it was protecting. The difference is
almost entirely conceptual: *knowing what a cache actually is, where it can
live, what belongs in it, and what its failure modes are* — before you write a
single `r.set(...)`. That's this module. The strategies, eviction policies, and
multi-level architectures in the rest of the track all build on the mental model
you form here.

## Concepts

### What a cache is, precisely

A cache is a **key-value store of previously-computed answers**, placed closer
(in time or space) to the consumer than the authoritative source, whose entire
value proposition is that reading from it is dramatically cheaper than
recomputing or re-fetching the real thing. Three properties define one:

- **It is a copy, never the source of truth.** The authoritative data lives
  somewhere else (a database, an upstream API, a filesystem, a CPU-expensive
  computation). The cache holds a *duplicate* that is allowed to be thrown away
  at any moment without losing information. This single property is what makes
  caching safe *and* what makes it dangerous — because a copy can disagree with
  its source.
- **It trades space (and freshness) for time.** You spend memory to store
  answers, and you accept that an answer might be slightly out of date, in
  exchange for serving it far faster.
- **It is allowed to miss.** Asking a cache for a key that isn't there (a
  *miss*) is normal and must always fall back to the real source. A cache that
  you *depend* on having the data isn't a cache — it's a primary datastore with
  no durability guarantees, which is a bug waiting to happen.

The core operation is the **cache lookup**: check the cache first; on a **hit**,
return the cached answer and skip the expensive work; on a **miss**, do the
expensive work, store the result, and return it. The fraction of lookups that
hit is the **hit ratio**, and it is the single number that tells you whether a
cache is earning its keep (module 03 goes deep on measuring and improving it).

### Why caching exists: the latency and cost hierarchy

Caching exists because not all data access is equally expensive, and the
differences are *enormous* — orders of magnitude, not percentages. A rough,
much-simplified ladder of how long it takes to get a piece of data, from a
backend's point of view:

| Source | Rough order of latency | Relative cost |
|---|---|---|
| CPU register / L1 cache | ~1 ns | 1× |
| Main memory (RAM) | ~100 ns | ~100× |
| Local SSD read | ~100 µs | ~100,000× |
| Redis over local network | ~0.5–1 ms | ~1,000,000× |
| PostgreSQL query (indexed) | ~1–10 ms | ~10,000,000× |
| PostgreSQL query (complex join/aggregate) | ~50–500 ms | up to ~1,000,000,000× |
| Call to a slow upstream API | ~100–2000 ms | even more |

The numbers are approximate and hardware-dependent, but the *shape* is the whole
point: each rung down is roughly 10–1000× slower than the one above. A cache
works by moving an answer **up** this ladder — from a 200ms aggregate query to a
0.8ms Redis read, or from a 0.8ms Redis read to a 100ns in-process dictionary
lookup. That's why the exact same idea appears at every layer of a system: any
time there's a big latency gap between where data *is* and where it's *needed*,
a cache in the gap pays off.

Two things are being reduced at once, and it's worth separating them:

- **Latency** — the individual request gets faster (the user waits less).
- **Load** — the expensive resource does less total work (it survives more
  traffic, or costs less to run). A query result cached with a 60s TTL and
  requested 10,000 times a minute turns 10,000 database queries into ~1. The
  *database* is the real beneficiary there, not any single request.

You cache for one or both of these, and being clear about which you're buying
changes the design (a cache that only helps latency but not load is still
useful; one bought "for load" that doesn't actually raise the hit ratio is
useless — module 03).

### Where caches live: the layers

"Caching" is not one thing in one place. The same lookup-first-fall-back-on-miss
pattern is implemented independently at many layers between the user and the
data. Knowing the layers keeps you from solving a problem at the wrong one.

- **Client-side / browser caching.** The user's browser stores responses on the
  user's own disk and reuses them without any network request at all. Governed
  by HTTP headers (`Cache-Control`, `ETag`, `Last-Modified` — you met these in
  track 01, and module 04 revisits them from the caching angle). This is the
  *cheapest possible* cache because a hit means **zero** work for your backend —
  the request never leaves the user's machine.
- **CDN / edge caching.** A content-delivery network keeps copies of responses
  (especially static assets, but increasingly API responses too) in data
  centers physically near users. A hit is served from the edge without ever
  reaching your origin servers — cutting both latency (geography) and origin
  load.
- **Server-side application caching.** Inside your own infrastructure. This
  splits further into two sub-layers that module 03 treats as L1 and L2:
  - **In-process / in-memory cache** — a plain data structure (a `dict`, an
    LRU cache) living inside your application process's own memory. Fastest
    possible server-side hit (~100ns, no network), but *local to one process*:
    not shared between replicas, and gone when the process restarts.
  - **Distributed cache** — a separate service like **Redis** or Memcached that
    all your app instances share over the network (~1ms). Slower than in-process
    but *shared* (every replica sees the same cached value) and *survives* app
    restarts. This is the workhorse of backend caching and the main tool of this
    track.
- **Database caching.** The database itself caches. Postgres keeps recently-read
  pages in its **shared buffer pool** in RAM (the `shared hit` vs `read` you saw
  in `EXPLAIN (ANALYZE, BUFFERS)` in track 04 module 07), and the OS keeps a
  page cache underneath that. You don't manage these directly, but they're why a
  "warm" query is faster than a "cold" one, and why benchmarking a query twice
  gives different numbers.

A single user request can hit several of these in sequence: browser cache →
CDN → app in-process cache → Redis → Postgres buffer pool → disk. Each layer it
*stops* at is a layer of work everything below it didn't have to do.

### Client-side vs server-side caching: a real distinction, not a synonym

These are often confused, so be precise:

- **Client-side caching** stores copies on the *consumer's* machine (browser
  disk, mobile app storage) and is controlled *indirectly* by your backend
  through HTTP response headers. You don't hold the data; you send instructions
  ("you may reuse this for 300 seconds"). Its huge advantage is that a hit costs
  your backend *nothing*. Its limitations: you can't forcibly invalidate it (the
  copy is on a machine you don't control — once you've said "cache for an hour,"
  you can't take it back), and it's per-user (a value cached in one user's
  browser does nothing for the next user).
- **Server-side caching** stores copies on *your* infrastructure (in-process, or
  in Redis) and is controlled *directly* by your code. You can read, write, and
  invalidate entries whenever you want, and one cached value serves *all* users
  who need it. The cost is that the request still had to reach your servers to
  get the hit — you saved the database, not the network round-trip to you.

They are complementary, not alternatives. A well-tuned system uses client-side
caching to eliminate requests entirely where possible, *and* server-side caching
to make the requests that do arrive cheap. This track focuses on server-side
caching (especially Redis), because that's the layer you write application code
for; but never forget the cheapest cache is the one on the user's own machine.

### What belongs in a cache — and what emphatically does not

A value is a good caching candidate when **all** of these hold:

- **It's expensive to produce.** A complex aggregate, a fan-out of API calls, an
  N+1-shaped read, a rendered template. Caching a `SELECT 1` saves nothing;
  caching a 300ms report saves a lot.
- **It's read far more often than it changes.** The whole economy of a cache is
  amortizing one expensive computation over many cheap reads. A value read
  10,000×/min and updated once/hour is ideal. A value read once and never again
  should *not* be cached (you paid the store cost for nothing).
- **Slight staleness is acceptable.** Because a cache is a copy, it *will* at
  times disagree with the source. If serving a value that's a few seconds or
  minutes old is fine (a "top products" list, a follower count, a rendered blog
  post), it's cacheable. This is the property people get wrong most often.

A value is a **bad** caching candidate — or must be cached only with extreme
care — when:

- **Staleness is a correctness bug, not a cosmetic one.** An account balance, a
  remaining-inventory count you decrement on purchase, an authorization
  decision, a one-time token. Serving an old copy here doesn't look slightly
  dated — it *double-spends*, *over-sells*, or *grants access that was revoked*.
  If in doubt, ask: "what's the worst thing that happens if a user sees a value
  N seconds out of date?" If the answer is "money moves incorrectly" or "someone
  sees data they shouldn't," don't TTL-cache it.
- **It's unique per request and never reused.** Caching something with a
  cardinality as high as the request rate just fills memory with entries that
  never get a second hit — pure overhead.
- **It's already cheap.** Adding a network hop to Redis to avoid a 0.2ms indexed
  primary-key lookup can make things *slower*, not faster.
- **It's sensitive and the cache isn't as protected as the source.** A cache is
  another copy of the data in another system; if it holds PII or secrets, it's
  another thing to secure, expire, and reason about under a breach.

The recurring discipline of the whole track, first stated here: **cache
read-heavy, change-rarely, expensive, staleness-tolerant data — and nothing
else, until you've measured that you should.**

### The two hard problems (named now, solved later)

There's a famous industry joke: *"There are only two hard things in computer
science: cache invalidation and naming things."* It's a joke, but the first half
is deadly serious and it's the reason caching is a *skill* and not a library
call. Because a cache is a copy:

1. **Invalidation** — knowing *when* a cached copy no longer matches its source,
   and getting rid of it, is genuinely hard. Do it too eagerly and your hit
   ratio collapses (you're barely caching). Do it too late and you serve stale
   data. Miss an update path entirely and you serve stale data *forever*.
2. **Consistency** — even with invalidation, there are windows where the cache
   and source disagree, and races (two requests, one reading while another
   writes) that can leave the *wrong* value cached durably.

You don't need to solve these yet — module 01 (strategies) and module 02
(eviction & invalidation) are entirely about them. But name them now, because
every design decision in this track is ultimately a position on how much
staleness you'll tolerate to get how much speed. Caching is easy; *invalidating*
is the hard part, and pretending otherwise is how stale-data bugs are born.

## Command reference

There's little to *run* in a fundamentals module — the real tool arrives in
module 01 — but here is the minimal shape of a manual cache lookup in Python, and
the Redis commands you'll lean on all track. Stand up Redis first:

```bash
docker run --name redis -p 6379:6379 -d redis:7
docker exec -it redis redis-cli PING   # -> PONG
```

| Redis command | What it does | Example |
|---|---|---|
| `SET key value` | Store a value | `SET greeting hello` |
| `SET key value EX <secs>` | Store with a TTL (expiry) in seconds | `SET report:top 42 EX 60` |
| `GET key` | Read a value (nil if missing/expired) | `GET greeting` |
| `TTL key` | Seconds left before expiry (`-1` none, `-2` gone) | `TTL report:top` |
| `EXISTS key` | 1 if present, 0 if not | `EXISTS greeting` |
| `DEL key` | Delete a key (manual invalidation) | `DEL report:top` |
| `INCR key` | Atomically increment a counter | `INCR hits` |
| `INFO stats` | Server stats incl. `keyspace_hits`/`misses` | `redis-cli INFO stats` |
| `DBSIZE` | Number of keys currently stored | `DBSIZE` |
| `FLUSHDB` | Wipe the current DB (dev only!) | `FLUSHDB` |

The canonical **cache-aside lookup** (module 01 formalizes this as a pattern) —
the single most important shape in the whole track:

```python
import json
import redis

r = redis.Redis(host="localhost", port=6379, decode_responses=True)

def expensive_report(limit: int) -> list[dict]:
    # ...imagine a 300ms aggregate query against Postgres...
    raise NotImplementedError

def get_report(limit: int) -> list[dict]:
    key = f"report:top:{limit}"          # a stable, parameterized cache key
    cached = r.get(key)
    if cached is not None:               # HIT: skip the expensive path entirely
        return json.loads(cached)
    result = expensive_report(limit)     # MISS: do the real work
    r.set(key, json.dumps(result), ex=60)  # store as a copy, TTL 60s bounds staleness
    return result                        # ...and return it
```

Everything in this track is a variation on, or a defense of, those ten lines:
the key design, the serialization, the TTL, the hit/miss branch, and what
happens when two requests miss at the same instant.

## Hands-on exercises

Do these in a terminal with Redis running (`docker run --name redis -p 6379:6379
-d redis:7`). A couple use a tiny FastAPI app; install with `pip install
"fastapi[standard]" redis`.

### 1. Feel the latency ladder yourself

Time a trivial in-memory lookup, a Redis round-trip, and a deliberately slow
"computation," to internalize the orders of magnitude from Concepts.

```python
import time, redis
r = redis.Redis(decode_responses=True)
r.set("k", "v")

def timeit(label, fn, n=1000):
    start = time.perf_counter()
    for _ in range(n):
        fn()
    per = (time.perf_counter() - start) / n * 1e6  # microseconds per op
    print(f"{label:20} {per:8.2f} µs/op")

d = {"k": "v"}
timeit("dict lookup",  lambda: d["k"])
timeit("redis GET",    lambda: r.get("k"))
timeit("sleep(0.05)",  lambda: time.sleep(0.05), n=20)  # a 'slow query'
```

Expected: the dict lookup is well under a microsecond, the Redis `GET` is
hundreds of microseconds to ~1ms (network + serialization), and the "slow query"
is ~50,000 µs. You've just measured the gaps a cache exploits — moving the
slow-query answer up to the Redis rung is a ~50–100× win; up to the dict rung is
more still (and why module 03 exists).

### 2. Build the cache-aside lookup by hand

Implement `get_report` from the Command reference against a fake slow function
that `time.sleep(0.3)`s and prints "COMPUTING" each time it actually runs. Call
`get_report(10)` three times in a row and observe.

Expected: only the *first* call prints "COMPUTING" and takes ~300ms; the next two
are near-instant and silent — they hit the cache. Now `docker exec redis
redis-cli DEL report:top:10` and call it again: "COMPUTING" reappears. You've
just seen a hit, a miss, and a manual invalidation.

### 3. Watch a TTL bound staleness

`SET report:top:10 "..." EX 5` from `redis-cli`, then run `TTL report:top:10`
repeatedly and finally `GET` it after 5+ seconds.

Expected: `TTL` counts down from 5 to 0, then `GET` returns `(nil)` and `TTL`
returns `-2`. This is *time-based invalidation* — the cache forgets on its own,
so a bug that forgets to invalidate manually still can't serve infinitely-stale
data. Note the tradeoff you just set: a 5s TTL means data can be up to 5s stale.

### 4. Measure a hit ratio

Reset stats context by noting the current counters, then generate traffic:

```bash
docker exec redis redis-cli INFO stats | grep keyspace
```

Run exercise 2's three calls again, then re-check. Compute
`hits / (hits + misses)`.

Expected: `keyspace_hits` and `keyspace_misses` climbed; with 1 miss and 2 hits
your ratio is ~0.67. This single number (module 03) is how you'll later judge
whether any cache is worth keeping — internalize that a *low* ratio means you're
paying cache overhead without getting the amortization payoff.

### 5. Classify real values as cacheable or not

For each of the following, write down: cache it or not, and if yes, roughly what
TTL and *why staleness is acceptable*. Then check your reasoning against
Concepts.

1. The homepage "trending articles" list.
2. A user's current account balance on a banking screen.
3. The result of a 400ms "sales by region this quarter" dashboard query.
4. A per-request, per-user personalized recommendation with a unique key each time.
5. A product's name and description on a catalog page.
6. The number of items left in stock, shown on a checkout page that decrements on purchase.

Expected reasoning: (1) yes, short TTL (30–120s), trending is inherently
approximate; (2) no — staleness is a correctness/trust bug; (3) yes, longer TTL
(minutes), quarter data barely moves; (4) no — cardinality equals request rate,
never a second hit; (5) yes, long TTL, descriptions change rarely; (6) *careful*
— caching the display is fine but the *decision to sell* must read the source,
or you oversell (this exact tension returns in module 02 and the capstone).

### 6. See a database's own cache warm up

Against any Postgres table with a few thousand rows (reuse `events` from track
04 module 03 if you have it), run the same query twice under
`EXPLAIN (ANALYZE, BUFFERS)`:

```sql
EXPLAIN (ANALYZE, BUFFERS) SELECT count(*) FROM events WHERE kind = 'buy';
-- run it a second time immediately
EXPLAIN (ANALYZE, BUFFERS) SELECT count(*) FROM events WHERE kind = 'buy';
```

Expected: the first run shows some `Buffers: shared read=...` (pages fetched from
disk/OS); the second shows those turned into `shared hit=...` (served from
Postgres's buffer pool in RAM) and a lower `Execution Time`. You just watched a
cache you don't manage do its job — and learned why "run the benchmark twice"
matters.

### 7. Diagnose and fix: the cache that never hits

A colleague added caching to a per-user profile endpoint but reports "the cache
isn't doing anything — the database load didn't drop." Their code:

```python
import time, json, redis
r = redis.Redis(decode_responses=True)

def get_profile(user_id: int) -> dict:
    key = f"profile:{user_id}:{time.time()}"   # <-- look closely
    cached = r.get(key)
    if cached:
        return json.loads(cached)
    profile = load_profile_from_db(user_id)     # the expensive call
    r.set(key, json.dumps(profile), ex=300)
    return profile
```

Reproduce it (stub `load_profile_from_db` to print "DB!" and sleep 100ms), call
`get_profile(1)` five times, and watch every call print "DB!". Diagnose and fix.

<details>
<summary>Answer</summary>

The cache **key includes `time.time()`**, which changes on every call, so every
lookup is for a brand-new key that has never been stored — a guaranteed 100%
miss rate, and worse, it fills Redis with single-use entries. The key must be
**stable for the same logical request**: `key = f"profile:{user_id}"`. A cache
key must depend only on the inputs that determine the answer (here, `user_id`),
never on the current time or any per-call random value. After the fix, call 1
prints "DB!" and populates the key; calls 2–5 hit and are silent. This is the
single most common "my cache doesn't work" bug — an unstable key — and it's why
exercise 2 stressed that the key must be a pure function of the inputs.

</details>

## Independent challenge

No code given. Take the "customers ranked by spend" report you built or saw in
**04-databases-and-data-layer** (module 07's caching exercise) and, *before*
writing any caching code, produce a written **caching design** for it: name the
authoritative source, decide whether it belongs in a client-side cache, a
server-side distributed cache, or both, and justify the choice using the "what
belongs in a cache" checklist. Pick a TTL and defend it by stating the maximum
staleness a user could see and why that's acceptable *for this specific report*.
Then name one *other* read in that same app for which caching would be a
correctness bug, and say exactly what would go wrong. Only after the written
design, implement the cache-aside lookup and confirm (via a hit-ratio
measurement like exercise 4) that a realistic access pattern actually produces a
high hit ratio — if it doesn't, your value wasn't a good candidate and you should
be able to say why.

<details>
<summary>Hint</summary>

The report is expensive (an aggregate/join), read often (a dashboard), and
tolerant of being a minute stale (spend rankings don't change meaningfully
second-to-second) — a textbook server-side Redis candidate with a TTL in the
tens of seconds to a few minutes. The correctness-bug counterexample in the same
app is anything where an old copy causes a wrong *action* rather than a
slightly-dated *display* — e.g. the exact current balance or available credit you
decide a transaction against. For the hit-ratio check, remember that a report
with a *shared* key (same for all users) hits far more than one keyed per user;
if your chosen value has a unique key per request, its hit ratio will be near
zero and it never belonged in a cache.

</details>

## Common mistakes & troubleshooting

- **Treating the cache as a source of truth.** Depending on data being in the
  cache (no fallback path, or writing *only* to the cache) turns an eviction or a
  restart into data loss. Always be able to reconstruct any cached value from the
  authoritative source on a miss.
- **Unstable cache keys.** Keys built from `time.time()`, random values, or
  fields that don't determine the answer produce a permanent 100% miss rate
  (exercise 7). A key must be a pure function of the inputs that decide the
  value.
- **Caching things that must not be stale.** Balances, inventory counts you sell
  against, auth decisions, one-time tokens. Staleness there is a correctness bug,
  not a cosmetic one — no TTL is safe.
- **Caching things that are never re-read.** Per-request unique values just burn
  memory and cache-write time for a hit that never comes. High key cardinality
  relative to traffic = bad candidate.
- **Caching something already cheap.** Wrapping a 0.2ms primary-key lookup in a
  1ms Redis round-trip is a *slowdown*. Cache the expensive thing, not everything.
- **Forgetting the cache is another copy of the data to secure.** PII/secrets in
  a cache are PII/secrets in one more place, with their own expiry and access
  rules to get right.
- **Confusing client-side and server-side caching.** You *instruct* client caches
  via headers and can't forcibly invalidate them; you *control* server-side
  caches directly. Reaching for one when you needed the other is a category
  error.
- **Optimizing the hit case while ignoring the miss case.** What happens when
  10,000 requests all miss the same key at once? (A stampede — module 04.) The
  miss path and its concurrency are as important as the hit path.

## Checkpoint quiz

Write down your answer to each question before expanding it — checking without attempting first is the single easiest way to fool yourself into thinking you've learned this.

1. Give the one-sentence definition of a cache, and name the single property
   (that it's a *copy*) that makes it both useful and dangerous.
2. What two distinct things does a cache reduce, and why might a cache help one
   but not the other?
3. Name the layers a single user request's data could be cached at, from the
   user's machine down to the database, and say which layer a hit costs your
   backend the *least*.
4. State the three conditions that together make a value a good caching
   candidate, and give one example of a value that fails the "staleness is
   acceptable" condition.
5. What is a cache hit ratio, and why is it *the* number that tells you whether a
   cache is worth keeping?
6. Name the "two hard things in computer science" cache-invalidation joke's
   serious point: why is invalidation genuinely hard, in terms of the copy
   property?

<details>
<summary>Answers</summary>

1. A cache is a key-value store of previously-computed answers, placed closer to
   the consumer than the authoritative source, whose reads are far cheaper than
   recomputing/re-fetching the real thing. The defining property is that it's a
   *copy, never the source of truth* — which is what lets you throw it away
   freely (useful) and what lets it disagree with the source (dangerous).
2. **Latency** (each request gets faster) and **load** (the expensive resource
   does less total work). A cache can cut latency for a request that misses
   rarely without meaningfully reducing load if that value is seldom re-read;
   conversely a value with a high hit ratio slashes load. You buy one or both,
   and should know which.
3. Browser/client cache → CDN/edge → app in-process (L1) → distributed cache like
   Redis (L2) → database buffer pool → disk. A **browser/client** hit costs the
   backend the least — nothing at all, because the request never leaves the
   user's machine.
4. Expensive to produce, read far more often than it changes, and slight
   staleness is acceptable. A value failing the staleness condition: an account
   balance, live inventory you sell against, or an authorization decision —
   serving an old copy is a correctness bug, not a cosmetic one.
5. It's the fraction of lookups that find the value already cached
   (`hits / (hits + misses)`). It's decisive because a cache only pays off by
   amortizing expensive work over many cheap hits — a low hit ratio means you're
   paying cache overhead (memory, a lookup, a store) without getting the
   amortization, so the cache isn't earning its keep.
6. Because a cache holds a *copy*, that copy can silently diverge from its
   source the instant the source changes. Invalidation is knowing *when* the copy
   went stale and removing it — hard because too-eager invalidation destroys the
   hit ratio, too-late invalidation serves stale data, and missing an update path
   entirely serves stale data forever. Modules 01 and 02 are devoted to it.

</details>

## Next

[01-caching-strategies](../01-caching-strategies/README.md) — you now know what a
cache is, where it can live, and what belongs in one. Next is *how* your code and
the cache actually coordinate reads and writes: cache-aside, read-through,
write-through, and write-behind — the four strategies, their consistency-vs-
latency-vs-complexity tradeoffs, and how to choose between them.
