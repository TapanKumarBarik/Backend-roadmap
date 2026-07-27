# Module 02: Cache Eviction and Invalidation

## Why this matters

A cache is a *bounded* fast store in front of an *unbounded* slow one. Two
different forces therefore decide what's in it at any moment, and beginners
conflate them constantly:

- **Eviction** is the cache removing entries because it's *out of room* — a
  capacity decision. Which entry gets thrown out when a new one needs space is
  governed by an **eviction policy** (LRU, LFU, TTL, FIFO). This is about
  *memory management* and *hit ratio*.
- **Invalidation** is *you* removing (or expiring) an entry because it's *no
  longer correct* — a freshness decision. This is about *staleness* and
  *correctness*, and it's the genuinely hard problem module 00 named.

Getting eviction wrong wastes memory and tanks your hit ratio (the cache evicts
the very things you were about to reuse). Getting invalidation wrong serves
stale, incorrect data — the more dangerous failure. This module makes both
concrete: which eviction policy actually wins for which access pattern (not just
their definitions), and the three invalidation approaches (manual, TTL-based,
event-based) with their real tradeoffs — ending on why "cache invalidation" is
proverbially one of the two hard things in computer science, demonstrated rather
than asserted.

## Concepts

### Eviction vs invalidation: keep them separate

Say it precisely, because the rest of the module depends on it:

- Eviction answers *"we're full — what do we drop to make room?"* The dropped
  entry might still be perfectly *correct*; it's just the least valuable to keep.
  Eviction is triggered by **memory pressure**, and its goal is to maximize
  future hit ratio given a fixed memory budget.
- Invalidation answers *"this entry no longer matches the source — get rid of
  it."* The entry has room; it's just *wrong* now. Invalidation is triggered by
  a **write to the source**, and its goal is correctness.

A TTL sits at the boundary and is genuinely both: it's an *invalidation*
mechanism (a bound on staleness) that Redis *also* uses as an input to eviction
(a `volatile-*` policy evicts among keys that have a TTL). Don't let that overlap
blur the distinction — you set a TTL for *freshness*; the cache may *also* use it
for *capacity*.

### Eviction policies, and when each actually wins

An eviction policy is the rule for choosing a victim when the cache is full and a
new entry needs space. The four canonical ones:

- **LRU — Least Recently Used.** Evict the entry that hasn't been *accessed* for
  the longest time. Bet: *recently used → likely used again soon* (temporal
  locality). **Wins when** access has strong recency — a working set of "hot"
  keys that shifts over time (active users' sessions, recently-viewed products).
  This is the sane default and Redis's most common choice. **Loses when** you do
  a big one-off scan that touches many cold keys once (a nightly report reading
  everything) — that scan evicts your hot working set to cache things it'll never
  touch again ("cache pollution" / scan resistance is LRU's weakness).
- **LFU — Least Frequently Used.** Evict the entry accessed the *fewest times*.
  Bet: *popular overall → popular in future* (frequency beats recency). **Wins
  when** there's a stable, skewed popularity distribution — a few keys are hot
  *persistently* and you don't want a one-off scan to evict them just because
  they weren't touched in the last minute (fixes LRU's scan-pollution weakness).
  Redis's `allkeys-lfu` uses a decaying frequency counter so "popular five hours
  ago but dead now" ages out. **Loses when** popularity shifts fast — a newly-hot
  key has a low count and gets evicted before it can prove itself (the "new item
  problem").
- **TTL — Time To Live (as an eviction input).** Evict entries *closest to
  expiry* first (Redis `volatile-ttl`), or more commonly, entries simply vanish
  when their TTL passes regardless of memory. **Wins when** data has a natural
  freshness lifetime (a 60s report, a 5-min token) — expiry doubles as a
  reasonable eviction signal. **Loses** as a *sole* capacity strategy: if
  everything has a long TTL and memory fills before anything expires, you still
  need a recency/frequency policy to pick a victim.
- **FIFO — First In, First Out.** Evict the *oldest-inserted* entry regardless of
  how often or recently it's used. Simple, cheap, no per-access bookkeeping.
  **Wins when** entries have roughly equal value and a natural "age out" makes
  sense, or when you can't afford LRU/LFU's tracking overhead. **Loses** in most
  application caches, because it happily evicts a hot entry that's been resident a
  long time *precisely because* it's useful — it ignores usage entirely. (Note:
  Redis doesn't offer a pure FIFO policy; it's more common in CPU/OS caches and
  simple in-process caches. Know it as the baseline the others improve on.)

A concrete way to feel the LRU-vs-LFU difference: imagine a cache of size 3 and
the access sequence `A A A A B C D` (A is persistently hot; B, C, D are a
one-time scan). **LRU** after the scan holds `B C D` — it evicted the hot A
because A wasn't touched *recently*, a pollution disaster. **LFU** holds `A` plus
two of the scan keys — A's high count protected it. Here LFU wins. Reverse it —
a workload where yesterday's hot key is today's cold key — and LFU clings to the
stale-popular key while LRU correctly follows the moving working set. *There is
no universally best policy; it depends on your access pattern*, which is why you
measure hit ratio (module 03) rather than assume.

```
  policy   evicts the entry with the...     tracks per key
  ─────────────────────────────────────────────────────────
  LRU      oldest LAST-ACCESS time          when it was last read
  LFU      lowest ACCESS COUNT (decaying)   how often it's read
  TTL      soonest EXPIRY                    its expiry timestamp
  FIFO     oldest INSERT time               when it was written
           └─ usage-blind ─┘   └─ usage-aware: LRU, LFU ─┘
```

### Redis's `maxmemory` and eviction policies (the real config)

Redis makes this operational. You cap memory, then choose a policy:

```
maxmemory 512mb
maxmemory-policy allkeys-lru
```

The policies, grouped:

- `noeviction` (default): don't evict; **reject writes** with an OOM error when
  full. Safe for a Redis used as a *primary* store, dangerous for one used as a
  cache — a full cache stops accepting new entries and every new key is a
  guaranteed miss.
- `allkeys-lru` / `allkeys-lfu` / `allkeys-random`: evict from **all** keys by
  recency / frequency / at random. Use these when Redis is purely a cache. Random
  is a surprisingly-not-terrible cheap option when access is uniform.
- `volatile-lru` / `volatile-lfu` / `volatile-ttl` / `volatile-random`: evict
  only among keys that **have a TTL set**, by recency / frequency / soonest-
  expiry / random. Use when Redis mixes cache data (with TTLs) and persistent
  data (without) — eviction only touches the TTL'd cache portion.

The most common cache config is `allkeys-lru` (or `allkeys-lfu` for skewed-
popularity workloads). Choosing `volatile-*` and then forgetting to set TTLs on
your cache keys is a classic trap: nothing is eligible for eviction, so Redis
hits `maxmemory` and starts *rejecting writes* as if it were `noeviction`.

### Invalidation approach 1: manual (explicit)

You `DEL` the key (or overwrite it) from application code when the underlying
data changes — the cache-aside write companion from module 01.

- **Pros:** immediate and precise — the moment a write commits, you can bust
  exactly the affected key(s); highest freshness.
- **Cons:** you must find and instrument **every** write path, or you get the
  stale-cache-on-write bug (module 01, exercise 8); it doesn't scale when one
  write affects *many* cached entries (a category rename that should bust 10,000
  product-list cache keys — which keys, exactly?); and it's fragile across
  service boundaries (another service writing the DB has no idea your cache
  exists).

### Invalidation approach 2: TTL-based (time)

Every entry expires after a fixed lifetime; you never explicitly invalidate,
you just let staleness be *bounded* by the TTL. The workhorse of pragmatic
caching.

- **Pros:** dead simple; no write-path instrumentation; self-healing (a missed
  invalidation self-corrects at expiry); works across service boundaries (nobody
  needs to know about your cache); a natural fit for data that's "fresh enough
  if it's under N seconds old."
- **Cons:** you *always* serve data that can be up to one TTL stale (unacceptable
  for correctness-critical data); choosing the TTL is a direct
  freshness-vs-hit-ratio dial (short TTL = fresher but more misses/load; long TTL
  = higher hit ratio but staler); and synchronized TTLs create the **stampede**
  problem (many keys expiring together → thundering herd — module 04).

Choosing a TTL is an engineering decision, not a default: pick it from *how stale
is acceptable* for this specific value (module 00's checklist), then sanity-check
it against the resulting miss rate. "5 minutes" is not an answer; "5 minutes
because the underlying report is regenerated every few minutes and users tolerate
that staleness" is.

### Invalidation approach 3: event-based (push)

When the source changes, an **event** actively busts the relevant cache
entries — the DB write publishes a message (Redis Pub/Sub, a message queue, a
change-data-capture stream, a database trigger/`LISTEN`/`NOTIFY`) that a
subscriber turns into cache invalidations.

- **Pros:** combines the freshness of manual invalidation with decoupling — the
  writer doesn't need to know which caches exist; works across services (anyone
  who wrote the DB emits an event; any cache subscribes); can bust *derived* /
  *many* entries in response to one change (a category rename event → a handler
  that knows to bust all affected list keys).
- **Cons:** the most infrastructure and moving parts (a working pub/sub or
  queue, subscribers, delivery guarantees); events can be *lost* or *delayed*
  (so you still want a TTL backstop — belt and suspenders); ordering and
  at-least-once delivery introduce their own correctness puzzles (which track 06
  and track 10 pick up). This is where caching meets the background-processing
  world track 06 opens.

```
  three invalidation triggers, three flows:

  manual    write ──► your code ──► DEL key        (precise, must instrument
                                                    every write path)
  TTL       write ──► (nothing)     key expires    (self-heals, but stale
                        ...Ns later ─► gone          up to one TTL)
  event     write ──► publish event ──► subscriber ──► DEL key(s)
                      (decoupled; writer needn't know which caches exist)
```

The mature pattern is usually **event-based (or manual) for promptness + a TTL
backstop for safety**: bust explicitly when you can, and let a bounded TTL clean
up anything you missed. Pure-manual is fragile; pure-TTL is stale-by-design;
combined, they cover each other's weaknesses.

### Cache invalidation made concrete: why it's "hard"

The proverb ("two hard things: cache invalidation and naming things") is funny
but the difficulty is real and specific. Make it concrete with one scenario:

A storefront caches, under different keys: `product:42` (one product),
`products:category:5` (a list of products in category 5), `products:search:shoes`
(a search result page), and `homepage:featured` (a curated list that *might*
include product 42). An admin changes product 42's price. Which cache keys are
now stale?

- `product:42` — obviously. Easy to bust.
- `products:category:5` — if product 42 is in category 5, its price shows in the
  list → stale. But *does* the list include price? And which category is 42 in?
  You need to *know* the dependency.
- `products:search:shoes` — if 42 matches "shoes" and the result shows price →
  stale. But search keys are open-ended (`products:search:*` for every term
  anyone ever searched); you can't enumerate them, and you certainly can't know
  which contained 42 without re-running the searches.
- `homepage:featured` — maybe. Depends on curation logic you may not control.

That's the hardness, precisely: **a single write can invalidate an unbounded,
hard-to-enumerate set of derived cache entries, and knowing the full dependency
graph is often impossible.** The practical responses, in escalating order:

1. **Bust what you can name** (the direct key) explicitly.
2. **Give derived/aggregate keys short TTLs** so the ones you *can't* name go
   stale for only a bounded time (the list and search caches expire on their
   own).
3. **Use key namespacing / tag-based invalidation** where the infrastructure
   supports it — group keys under a tag and bust the tag (e.g. bust everything
   tagged `category:5`). Redis doesn't do this natively, but you can emulate it
   with a version number embedded in the key: bump `category:5:v` and every key
   built from it (`products:category:5:v{n}`) instantly becomes unreachable
   (a "generational" invalidation — no scanning, the old keys just age out via
   TTL/eviction). This is the single most useful advanced trick in this module.
4. **Accept bounded staleness** for the truly un-enumerable (open-ended search
   caches): short TTL and move on. Perfect invalidation there is not worth it.

The lesson isn't "invalidation is impossible" — it's "invalidation is a *design
problem* about dependency graphs and acceptable staleness, not a `DEL` call." You
design the key structure *so that* invalidation is tractable, and you use TTLs
to cover what remains.

## Command reference

| Command / API | Purpose | Example |
|---|---|---|
| `CONFIG SET maxmemory 256mb` | Cap Redis memory at runtime | `redis-cli CONFIG SET maxmemory 256mb` |
| `CONFIG SET maxmemory-policy allkeys-lru` | Set the eviction policy | `... allkeys-lru` |
| `CONFIG GET maxmemory-policy` | Check the current policy | `redis-cli CONFIG GET maxmemory-policy` |
| `INFO stats` → `evicted_keys` | How many keys eviction has removed | `redis-cli INFO stats \| grep evicted` |
| `INFO memory` → `used_memory_human` | Current memory use | `redis-cli INFO memory \| grep used_memory_human` |
| `TTL key` / `PTTL key` | Seconds / ms until expiry | `TTL report:top` |
| `EXPIRE key <secs>` | Set/refresh a TTL on an existing key | `EXPIRE product:42 300` |
| `PERSIST key` | Remove a key's TTL (make it non-volatile) | `PERSIST config:flags` |
| `DEL key` / `UNLINK key` | Invalidate (UNLINK frees memory async) | `UNLINK product:42` |
| `SCAN 0 MATCH prefix:*` | Iterate keys without blocking (never `KEYS`) | `SCAN 0 MATCH product:*` |
| `OBJECT FREQ key` (lfu) / `OBJECT IDLETIME key` (lru) | Inspect a key's LFU count / LRU idle time | `OBJECT IDLETIME product:42` |

Generational (version-based) invalidation in Python — the tag trick from
Concepts:

```python
def category_list_key(category_id: int) -> str:
    version = r.get(f"category:{category_id}:ver") or "0"
    return f"products:category:{category_id}:v{version}"

def get_category_list(category_id: int) -> list:
    key = category_list_key(category_id)
    if (hit := r.get(key)) is not None:
        return json.loads(hit)
    data = load_category_products(category_id)          # expensive
    r.set(key, json.dumps(data), ex=300)                # TTL backstop
    return data

def invalidate_category(category_id: int) -> None:
    # Bump the version: every key built from the old version is now unreachable
    # and will age out via TTL/eviction. No scanning, no enumerating keys.
    r.incr(f"category:{category_id}:ver")
```

## Hands-on exercises

Redis running. Some exercises change `maxmemory`, so do them on a throwaway
Redis (or `FLUSHDB` after). Restore defaults when done.

### 1. Force eviction and watch `evicted_keys` climb

```bash
redis-cli CONFIG SET maxmemory 3mb
redis-cli CONFIG SET maxmemory-policy allkeys-lru
# write lots of data until it overflows 3mb:
redis-cli --eval /dev/stdin <<'LUA'
for i=1,100000 do redis.call('SET', 'k:'..i, string.rep('x', 200)) end
return redis.call('DBSIZE')
LUA
redis-cli INFO stats | grep evicted_keys
redis-cli DBSIZE
```

Expected: `DBSIZE` is far less than 100,000 and `evicted_keys` is large — Redis
hit `maxmemory` and started evicting LRU victims to make room. You've seen
eviction happen under real memory pressure.

### 2. Contrast `allkeys-lru` with `noeviction`

Repeat exercise 1 but with `CONFIG SET maxmemory-policy noeviction` first
(FLUSHDB in between). Watch for errors.

Expected: instead of evicting, writes start **failing** with `OOM command not
allowed when used memory > 'maxmemory'`. This is the trap: `noeviction` on a
cache turns "full" into "every new key errors and every read of an un-cached key
misses." Confirm you understand when `noeviction` is right (Redis as a primary
store you must not silently lose data from) vs wrong (Redis as a cache).

### 3. Demonstrate LRU scan pollution

Set `maxmemory` tiny and `allkeys-lru`. Write 3 "hot" keys and read them in a
loop many times. Then do a one-time "scan": write and read 1,000 cold keys once.
Check whether the hot keys survived (`EXISTS hot:1`).

Expected: after the cold scan, the hot keys have been **evicted** — LRU dropped
them because they weren't touched *recently* during the scan, even though they're
your real working set. This is scan pollution, LRU's weakness, and the motivation
for LFU.

### 4. Show LFU protecting the hot keys

Repeat exercise 3 with `maxmemory-policy allkeys-lfu`. Read the hot keys many
times *first* (building their frequency count), then run the cold scan.

Expected: the hot keys are far more likely to **survive** the scan — their high
access frequency protected them where recency didn't. You've now seen the exact
workload where LFU beats LRU (and can articulate the reverse: a workload where
popularity shifts fast would favor LRU).

### 5. TTL as bounded staleness, measured

Cache a value with `ex=10`. Update the source directly (no invalidation). Read
every 2 seconds and record when the served value flips from stale to fresh.

Expected: stale for up to ~10s, then a miss reloads the fresh value. You've
quantified exactly what "TTL-based invalidation" costs you in worst-case
staleness — the number you must justify per value.

### 6. Generational (version-based) invalidation

Implement `get_category_list` / `invalidate_category` from the Command
reference. Populate category 5's list, read it (hit), then call
`invalidate_category(5)` and read again.

Expected: after the version bump, the next read is a **miss** (the key now
carries `v1`, and `...v0` is orphaned to age out) and repopulates — *without* you
ever enumerating or scanning the old keys. Confirm the old `...v0` key still
exists momentarily (`SCAN MATCH products:category:5:*`) but is unreachable, and
would be cleaned up by its TTL/eviction. This is how you bust "all keys derived
from category 5" without knowing what they are.

### 7. Confront the un-enumerable search cache

Cache three search result keys: `products:search:shoes`,
`products:search:boots`, `products:search:sandals`. Now "change product 42's
price." Try to write code that busts exactly the search keys that contained
product 42.

Expected: you *can't* — without re-running each search (or maintaining a
reverse index of which products appear in which cached searches), you don't know
which keys are affected, and `products:search:*` is open-ended. Conclude the
correct engineering answer: give search-result caches a **short TTL** and accept
bounded staleness, because precise invalidation here costs more than it's worth.
This is the "hard thing" made concrete.

### 8. Diagnose and fix: the cache that fills up and stops accepting writes

A team reports: "Our Redis cache was fine, then one day new keys stopped being
cached — the hit ratio cratered and database load spiked, with no code change."
`INFO memory` shows `used_memory` pinned at `maxmemory`; `INFO stats` shows
`evicted_keys: 0` and a rising number of errors. The config:
`maxmemory 2gb`, `maxmemory-policy volatile-lru`. Most cache keys are set with
`r.set(key, val)` — no `ex=`. Diagnose and give the fix.

<details>
<summary>Answer</summary>

The policy is `volatile-lru`, which only evicts keys that **have a TTL**. But the
code sets keys with `r.set(key, val)` and **no `ex=`**, so almost no key is
volatile — nothing is eligible for eviction. Redis fills to `maxmemory` and,
finding no evictable keys, behaves like `noeviction`: it **rejects new writes**
with OOM errors (hence `evicted_keys: 0`, rising errors, and new keys not being
cached). The database load spikes because every new key is now a permanent miss.
Two fixes, ideally both: (1) set a TTL on cache keys (`r.set(key, val, ex=...)`)
so they're actually eligible under `volatile-lru` — and TTLs are good practice
anyway (module 01); or (2) if these keys are pure cache data with no TTL by
design, switch to `allkeys-lru` so *all* keys are eviction-eligible. The root
cause is a policy/usage mismatch: `volatile-*` requires TTLs to function, and
this cache had none.

</details>

## Independent challenge

No code given. Take the storefront-style app you've been building since
**01-caching-strategies**. Design and implement an invalidation scheme that
handles three tiers of cache key with the *right* approach for each: (1) the
single-entity read (`product:{id}`) with **manual** invalidation on write; (2) a
per-category list (`products:category:{id}`) with **generational/version-based**
invalidation so a category change busts the whole list without enumerating keys;
and (3) an open-ended search-result cache with a justified **short TTL** because
precise invalidation is intractable. Then set an appropriate `maxmemory` and
eviction policy for a Redis used purely as a cache, and justify LRU vs LFU by
describing *your app's* access pattern. Finally, reproduce the exercise-8
`volatile-lru`-with-no-TTLs failure on purpose and fix it, proving the fix by
showing `evicted_keys` climbing instead of writes erroring.

<details>
<summary>Hint</summary>

Map each key tier to the approach whose tradeoffs fit: a single product's key is
nameable on write, so manual `DEL` is precise and cheap; a category list is
derived from many rows and its exact key set is awkward to track, so a version
counter (`category:{id}:ver`) that you `INCR` on any change to that category is
the clean bust; search results are unbounded and un-enumerable, so a short TTL
(seconds to a couple of minutes) is the only sane option — state the max
staleness a searcher could see and why it's fine. For the policy, `allkeys-lru`
is the safe default; argue for `allkeys-lfu` only if your app has a stable,
skewed hot set that a one-off scan (a report, a crawler) would otherwise pollute.
The exercise-8 fix is either adding TTLs so `volatile-lru` has something to evict
or switching to `allkeys-lru`.

</details>

## Common mistakes & troubleshooting

- **Conflating eviction and invalidation.** Eviction = out of room (capacity);
  invalidation = out of date (correctness). They're triggered by different things
  and solve different problems.
- **`volatile-*` policy with no TTLs on the keys.** Nothing is eligible for
  eviction; Redis fills up and rejects writes like `noeviction` (exercise 8). Use
  `allkeys-*` for pure caches, or actually set TTLs.
- **`noeviction` on a cache.** A full cache stops accepting writes and every new
  key is a guaranteed miss. `noeviction` is for Redis-as-primary-store, not
  Redis-as-cache.
- **Assuming LRU is always best.** LRU suffers scan pollution; LFU suffers with
  fast-shifting popularity. The right policy depends on your access pattern —
  measure hit ratio (module 03), don't assume.
- **Manual-only invalidation.** You'll miss a write path and serve stale data
  forever (no TTL backstop). Combine explicit busting with a bounded TTL.
- **Trying to enumerate un-enumerable keys.** Open-ended derived caches (search
  results) can't be precisely invalidated; short TTLs are the answer, not a
  heroic reverse index (usually).
- **Using `KEYS pattern` in production to find keys to invalidate.** `KEYS`
  blocks the whole server scanning the keyspace. Use `SCAN` (non-blocking,
  cursor-based) or, better, design keys (generational versioning) so you don't
  need to scan at all.
- **Picking a TTL by habit ("5 minutes") instead of by staleness budget.** The
  TTL is a freshness-vs-hit-ratio decision derived from how stale the value may
  acceptably be — justify it per value.

## Checkpoint quiz

Write down your answer to each question before expanding it — checking without attempting first is the single easiest way to fool yourself into thinking you've learned this.

1. State the difference between eviction and invalidation, including what
   *triggers* each.
2. Give an access pattern where LFU clearly beats LRU, and one where LRU clearly
   beats LFU, and explain why in each case.
3. What does Redis's `noeviction` policy do when full, and why is it the wrong
   default for a cache but potentially right for a primary store?
4. Compare manual, TTL-based, and event-based invalidation on freshness, on
   write-path coupling, and on whether they self-heal a missed invalidation.
5. Explain generational/version-based invalidation and the specific problem it
   solves that a plain `DEL` can't.
6. Using the storefront example, explain concretely *why* cache invalidation is
   proverbially "hard," and give the practical response for the un-enumerable
   case.

<details>
<summary>Answers</summary>

1. Eviction removes entries because the cache is **out of room** (a capacity
   decision, triggered by memory pressure, governed by an eviction policy) — the
   entry may still be correct. Invalidation removes entries because they're **no
   longer correct** (a freshness decision, triggered by a write to the source).
   Different triggers, different goals (hit ratio vs correctness).
2. LFU beats LRU when a few keys are *persistently* hot and a one-time scan of
   many cold keys would otherwise pollute the cache — LFU's frequency counts
   protect the hot set that LRU would evict for not being touched *recently*. LRU
   beats LFU when popularity shifts fast (yesterday's hot key is today's cold
   key) — LRU follows the moving working set, while LFU clings to the
   stale-popular key whose high count no longer reflects reality.
3. `noeviction` refuses to evict and **rejects new writes with an OOM error**
   once at `maxmemory`. Wrong for a cache because a full cache then stops
   accepting entries and every new key is a guaranteed miss (load spikes to the
   source); right for a primary store where silently evicting data would be
   *data loss* and erroring is the safer failure.
4. Manual: freshest/most precise, but tightly coupled to every write path and
   does **not** self-heal a missed path (stale forever without a TTL). TTL-based:
   no write-path coupling and **self-heals** at expiry, but always serves up to
   one TTL of staleness. Event-based: fresh and decoupled (works across
   services) but needs pub/sub-or-queue infra and events can be lost/delayed, so
   it doesn't fully self-heal without a TTL backstop.
5. Embed a version number in the key (`...:v{n}`), stored separately; to
   invalidate *all* keys derived from some entity, `INCR` its version so every
   key built from the old version becomes unreachable at once and ages out via
   TTL/eviction. It solves busting an *un-enumerable set* of derived keys — which
   a plain `DEL` can't, because `DEL` needs to know each exact key and you often
   can't enumerate them (without a blocking `KEYS`/`SCAN`).
6. A single write (a product's price) can invalidate an unbounded, hard-to-
   enumerate set of *derived* entries — the product key, every category list it
   appears in, every search result that matched it, curated homepage lists — and
   you often can't know the full dependency set (search keys are open-ended). The
   practical response for the un-enumerable case is to give those derived/search
   caches a **short TTL** and accept bounded staleness, busting precisely only the
   keys you *can* name.

</details>

## Cumulative review

Closed-book. These mix modules 00–02. Write full answers before expanding; if one
stumps you, redo that module's exercises before moving on.

1. A value is read ~5,000×/min, recomputed by a 250ms aggregate query, and
   changes at most once an hour. Walk through the module 00 checklist to decide
   if it's cacheable, then pick a strategy (module 01) and an invalidation
   approach (module 02), justifying each with the specific tradeoff you're
   accepting.
2. Explain why a bounded TTL is simultaneously (a) an invalidation mechanism, (b)
   a safety net for a missed manual invalidation, and (c) an input a Redis
   `volatile-*` policy uses for eviction — three roles, one setting.
3. Your Redis is configured `maxmemory 1gb`, `maxmemory-policy allkeys-lfu`. A
   nightly analytics job scans millions of one-time keys through the same Redis.
   Predict the effect on your daytime hot keys' hit ratio, name the phenomenon,
   and say whether LFU helps or hurts here versus LRU.
4. A teammate "added caching" by wrapping a per-user endpoint, but load didn't
   drop and Redis memory is growing without bound. Give the two *most likely*
   root causes drawing on modules 00–02 (one about keys, one about eviction/TTL),
   and how you'd confirm each from Redis stats.
5. Contrast the failure mode of write-behind (module 01) with the failure mode of
   a `volatile-lru` policy with no TTLs (module 02): both can *lose* or *fail to
   store* data — explain how the mechanisms differ and what each costs you.

<details>
<summary>Answers</summary>

1. Checklist: expensive to produce (250ms — yes), read far more than it changes
   (5,000/min reads vs ≤1/hour writes — overwhelmingly yes), staleness tolerable
   (an aggregate that changes hourly can be seconds-to-minutes stale — yes) →
   cacheable. Strategy: **cache-aside** (or read-through if centralizing) — the
   default; it lazily populates and the DB stays authoritative. Invalidation:
   **manual bust on the hourly write + a TTL backstop** (e.g. a few minutes), or
   even pure TTL given the generous staleness tolerance; the tradeoff accepted is
   up to one TTL (or one bust-lag) of staleness in exchange for turning ~5,000
   queries/min into ~1 — a massive load win on a value where staleness is
   harmless.
2. (a) It's a bound on staleness — the entry is *invalidated* (expires) after the
   TTL regardless of anything else. (b) If you also invalidate manually but miss
   a write path, the entry can't be stale longer than the TTL, so the TTL cleans
   up your mistake. (c) A `volatile-*` eviction policy only considers keys that
   *have* a TTL, and `volatile-ttl` specifically evicts those closest to expiry —
   so the same TTL that governs freshness also makes the key eligible for, and
   ranks it within, capacity eviction.
3. The nightly scan of millions of one-time keys pollutes the cache, evicting
   daytime hot keys → the next day's hit ratio drops until the hot set
   re-warms — this is **cache (scan) pollution**. LFU *helps versus LRU* here:
   the hot keys' accumulated frequency counts resist eviction by the one-time
   scan keys (which each have a count of ~1), whereas LRU would evict the hot
   keys simply for not being touched *recently* during the scan. (Even better:
   isolate the analytics job on a separate Redis/DB so it can't pollute the app
   cache at all.)
4. (i) **Unstable / per-request-unique keys** (module 00, e.g. a timestamp in the
   key) → ~100% miss rate (load doesn't drop) and unbounded distinct keys (memory
   grows) — confirm via `INFO stats` showing `keyspace_misses` ≫ `keyspace_hits`
   and `DBSIZE` climbing without plateau. (ii) **No TTLs plus a policy that can't
   evict them** (e.g. `volatile-lru` with no TTLs, or `noeviction`) → memory
   grows to `maxmemory` then writes error — confirm via `INFO memory` at
   `maxmemory`, `evicted_keys: 0`, and OOM errors. The fixes are a stable key and
   a TTL + appropriate `allkeys-*` policy respectively.
5. Write-behind loses data that was *successfully written to the cache and
   acknowledged* but not yet flushed to the durable store when the cache dies —
   you lose recent *writes* (a durability gap you chose for write speed).
   `volatile-lru`-with-no-TTLs doesn't lose stored data; it *fails to store new
   data* — nothing is evictable, memory is full, so new writes are rejected and
   become permanent misses (a correctness/availability gap caused by
   misconfiguration). One drops committed writes; the other refuses new ones.

</details>

## Further reading & sources

- [Redis: key eviction & maxmemory policies](https://redis.io/docs/latest/develop/reference/eviction/) - the authoritative reference for `allkeys-lru`, `volatile-*`, LFU tuning, and `noeviction`.
- [Redis: EXPIRE / TTL](https://redis.io/docs/latest/commands/expire/) - how TTL-based expiry works, including active vs lazy expiration.
- [Redis: SCAN](https://redis.io/docs/latest/commands/scan/) - the non-blocking cursor iteration to use instead of the server-blocking `KEYS`.
- [Redis: Using LFU mode](https://redis.io/docs/latest/develop/reference/eviction/#the-new-lfu-mode) - the decaying frequency counter that fixes LRU's scan-pollution weakness.
- [Martin Fowler: TwoHardThings](https://martinfowler.com/bliki/TwoHardThings.html) - the invalidation-is-hard proverb the storefront scenario demonstrates.

## Next

[03-multi-level-caching](../03-multi-level-caching/README.md) — you can now
manage what's in a single cache and when it leaves. Next is stacking caches:
an in-process L1 in front of a distributed L2 (Redis), how the two combine into a
hierarchy, and how to measure and tune the hit ratio across levels — the number
that decides whether any of this is actually working.
