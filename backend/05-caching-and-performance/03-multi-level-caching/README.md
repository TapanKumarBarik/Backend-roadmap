# Module 03: Multi-Level Caching

## Why this matters

Module 00 laid out the latency ladder: an in-process dictionary lookup is
~100ns, a Redis round-trip is ~0.5–1ms, a Postgres query is milliseconds to
hundreds of milliseconds. So far the track has treated "the cache" as a single
thing — Redis. But there's a rung *above* Redis you're leaving on the table: the
memory of your own application process. A value you can serve from a local `dict`
never even pays the network hop to Redis.

Multi-level caching stacks these: a small, ultra-fast **L1** cache inside each
process in front of a larger, shared **L2** cache (Redis) in front of the
database. Done right, it turns your hottest keys into ~100ns hits while keeping
the sharing and capacity of Redis for everything else. Done wrong, it becomes the
single hardest caching bug to debug — because now you have *N+1* copies of each
value (one per process's L1, plus L2) that can all disagree, and invalidating L2
does nothing to the stale copy sitting in some replica's L1.

This module is also where you learn to *measure* caching honestly. The hit ratio
— and specifically the hit ratio *at each level* — is the number that tells you
whether a cache is earning its complexity. An engineer who adds an L1 without
measuring its hit ratio has just added a distributed-consistency bug in exchange
for a speedup they can't prove.

## Concepts

### L1 vs L2: two caches with opposite tradeoffs

- **L1 — in-process / in-memory cache.** A data structure (a bounded dict, an
  `functools.lru_cache`, a small LRU library like `cachetools`) living inside a
  single application process's own heap. **Fastest possible hit** (~100ns, no
  serialization, no network) and free of any external dependency. But: it is
  **per-process** — every worker/replica has its own separate L1, none of them
  see each other's entries; it is **small** (bounded by that one process's
  memory, and you don't want a runaway cache OOM-killing your app); and it is
  **ephemeral** — a deploy, restart, or crash wipes it. Its capacity is measured
  in thousands of entries, not millions.
- **L2 — distributed cache (Redis).** A separate service every process shares
  over the network. **Shared** (a value written by one process is visible to all —
  one source of cached truth), **large** (gigabytes, tunable via `maxmemory`),
  and **durable across app restarts** (a redeploy doesn't cold-start it). But
  every hit costs a network round-trip (~1ms) and serialization/deserialization.

They are complementary because their strengths and weaknesses are mirror images.
L1 is fast-but-unshared-and-tiny; L2 is shared-and-big-but-slower. A hierarchy
uses L1 for the *hottest* handful of keys (where the ~100ns vs ~1ms difference,
multiplied by huge request volume, matters) and L2 for the long tail and for
sharing.

### The hierarchical read path

A two-level read is the module 01 lookup, nested:

```
request
  -> check L1 (in-process dict)         hit? return (~100ns)      [L1 hit]
  -> miss: check L2 (Redis)             hit? populate L1, return  [L2 hit]
  -> miss: query the database           populate L2 and L1, return [full miss]
```

Each level populates the levels *above* it on the way back, so a value fetched
from the DB warms both L2 (for other processes) and L1 (for this process's next
request). Code:

```python
import json, time, redis
from cachetools import TTLCache

r = redis.Redis(decode_responses=True)
l1 = TTLCache(maxsize=1_000, ttl=5)          # tiny, short-lived, per-process

def get_product(pid: int) -> dict:
    key = f"product:{pid}"

    if key in l1:                             # L1: in-process, ~100ns
        return l1[key]

    if (raw := r.get(key)) is not None:       # L2: Redis, ~1ms
        value = json.loads(raw)
        l1[key] = value                       # warm L1 on the way back
        return value

    value = load_product_from_db(pid)         # full miss: the DB, ~ms
    r.set(key, json.dumps(value), ex=300)     # warm L2 (shared)
    l1[key] = value                           # warm L1 (this process)
    return value
```

The **L1 TTL is deliberately short** (seconds), much shorter than L2's. That's
the central design tension of the next section.

### The consistency cost: N stale L1 copies

Here is the danger that makes multi-level caching a genuine skill and not just a
speedup. With single-level Redis, an invalidation (`DEL product:42`) removes
*the* cached copy — the next read anywhere misses and reloads. With an L1 in
front, that same `DEL` removes only the L2 copy. **Every process that has
`product:42` in its L1 still serves the stale value** until its L1 entry expires
or is evicted — and you cannot easily reach into 20 replicas' heaps to delete a
key.

So multi-level caching reintroduces the stale-cache problem *per process*, and
the usual explicit-invalidation fix doesn't cover it. The standard responses:

1. **Short L1 TTLs (the default answer).** Keep L1 entries alive for only a few
   seconds. Then the worst-case staleness from a stale L1 copy is bounded to that
   few seconds — usually acceptable for the very hot, read-heavy data that
   belongs in L1 in the first place. This is why the code above uses `ttl=5` for
   L1 but `ex=300` for L2: L1 trades away freshness for its ~100ns speed, and the
   short TTL bounds the trade.
2. **Pub/sub invalidation of L1 (when seconds isn't good enough).** On a write,
   publish an invalidation message on a Redis Pub/Sub channel; every process
   subscribes and deletes the key from its *own* L1 on receipt. This is the
   event-based invalidation from module 02, aimed specifically at the distributed
   L1 problem. It's more infrastructure (a subscriber thread/task per process,
   and messages can be missed on a disconnect) so you still keep the short L1 TTL
   as a backstop. Redis's client-side caching feature (RESP3 "tracking") is a
   productized version of this idea.
3. **Only L1-cache things that tolerate seconds of staleness.** The cleanest
   response: don't put correctness-sensitive data in L1 at all. Reference data
   (product names, config flags, feature toggles) is ideal; anything where a few
   seconds stale is a bug stays in L2-only (or uncached).

The rule of thumb: **L1 is for data that is extremely hot and tolerant of a few
seconds of staleness.** If it's not hot, L1's tiny capacity is wasted; if it's
not staleness-tolerant, L1's per-process copies are a bug.

### Hit ratio: the number that decides everything

The **hit ratio** is `hits / (hits + misses)` — the fraction of lookups served
from the cache instead of the source. It is *the* metric for caching, because it
directly determines the load reduction on the source and (with the latency
ladder) the average latency.

Make the payoff concrete. Suppose a DB query is 50ms and a cache hit is 1ms.
Average latency ≈ `hit_ratio × 1ms + (1 − hit_ratio) × 50ms`:

| Hit ratio | Avg latency | Load on DB (relative) |
|---|---|---|
| 0% (no cache) | 50 ms | 100% |
| 50% | 25.5 ms | 50% |
| 90% | 5.9 ms | 10% |
| 95% | 3.45 ms | 5% |
| 99% | 1.49 ms | 1% |

Two lessons jump out. First, the curve is **nonlinear at the top**: going from
90% to 99% hit ratio cuts DB load *tenfold* (10% → 1%) even though the ratio only
moved 9 points. The last few percent of hit ratio are where the big wins are —
which is exactly what an L1 in front of a good L2 buys you. Second, a **low hit
ratio means the cache is barely helping** — at 50% you've halved load but every
other request still pays full price, and you should ask whether the value was a
good candidate (module 00) or your keys/TTLs are wrong.

**Combined multi-level hit ratio.** With two levels, a request is a full miss
only if it misses *both*. If L1 hits 60% of lookups and L2 hits 80% of the
*remaining* ones, the overall hit ratio is `0.60 + 0.40 × 0.80 = 0.92`, and only
`0.40 × 0.20 = 8%` of lookups reach the database. Crucially, measure each level
*separately*: a high overall ratio with a near-zero *L1* ratio means L1 is adding
consistency risk for no speed benefit and should be removed. Always be able to
answer "what is my L1 hit ratio and my L2 hit ratio, separately?"

### Measuring hit ratio in practice

Three complementary sources:

- **Redis server-side** (`INFO stats`): `keyspace_hits` and `keyspace_misses`
  give L2's hit ratio *across all keys and clients* — coarse but zero-effort. A
  low server-wide ratio is a red flag; a high one doesn't prove *your* keys are
  hitting (someone else's might be).
- **Per-cache instrumentation (application-side):** wrap your lookup to count
  hits and misses per logical cache (and per level), exported as metrics. This is
  the honest number — it's *your* cache's ratio, split L1 vs L2. Track 08
  (observability) formalizes exporting these; for now a couple of counters is
  enough.
- **`redis-cli --stat` / `MONITOR`** for live coarse observation while
  developing (never `MONITOR` in production — it firehoses every command and
  slows the server).

You optimize the ratio by: choosing genuinely reusable values (module 00),
stable keys (module 00, exercise 7), TTLs long enough to get reuse but short
enough to bound staleness (module 02), enough L2 memory that eviction isn't
churning your working set (module 02), and an L1 sized/scoped to your actual hot
set. If the ratio stays low after all that, the honest conclusion is often *this
value shouldn't be cached* — not "add another cache layer."

## Command reference

| API / command | Purpose | Example |
|---|---|---|
| `cachetools.TTLCache(maxsize, ttl)` | Bounded, TTL'd in-process L1 | `TTLCache(1000, 5)` |
| `cachetools.LRUCache(maxsize)` | In-process L1 with LRU eviction, no TTL | `LRUCache(1000)` |
| `functools.lru_cache(maxsize=)` | Simplest L1 for pure functions (no TTL, no invalidation) | `@lru_cache(maxsize=512)` |
| `INFO stats` → `keyspace_hits`/`keyspace_misses` | Server-wide L2 hit/miss counts | `redis-cli INFO stats \| grep keyspace` |
| `redis-cli --stat` | Live throughput/hit stats, 1/sec | `redis-cli --stat` |
| `r.pubsub()` / `p.subscribe(ch)` | Subscribe to L1-invalidation events | see below |
| `r.publish(ch, msg)` | Broadcast an L1 invalidation on write | `r.publish("inval", "product:42")` |
| `INFO memory` → `used_memory` | L2 memory pressure (is eviction churning?) | `redis-cli INFO memory` |

A minimal **instrumented two-level cache** with pub/sub L1 invalidation:

```python
import json, threading, redis
from cachetools import TTLCache

r = redis.Redis(decode_responses=True)
l1 = TTLCache(maxsize=1000, ttl=5)
stats = {"l1_hit": 0, "l2_hit": 0, "miss": 0}

def get(key: str, loader):
    if key in l1:
        stats["l1_hit"] += 1
        return l1[key]
    if (raw := r.get(key)) is not None:
        stats["l2_hit"] += 1
        val = json.loads(raw); l1[key] = val
        return val
    stats["miss"] += 1
    val = loader()
    r.set(key, json.dumps(val), ex=300); l1[key] = val
    return val

def invalidate(key: str):
    r.delete(key)                       # bust shared L2
    l1.pop(key, None)                   # bust this process's L1
    r.publish("cache:inval", key)       # tell every other process to bust its L1

def _listen():                          # run once per process, in a background thread
    p = r.pubsub(); p.subscribe("cache:inval")
    for msg in p.listen():
        if msg["type"] == "message":
            l1.pop(msg["data"], None)   # drop the key from THIS process's L1

threading.Thread(target=_listen, daemon=True).start()

def hit_ratio():
    total = sum(stats.values())
    hits = stats["l1_hit"] + stats["l2_hit"]
    return {"overall": hits / total if total else 0,
            "l1": stats["l1_hit"] / total if total else 0, **stats}
```

## Hands-on exercises

Redis running. `pip install cachetools redis`. For the multi-process exercises,
run two Python processes (two terminals) pointed at the same Redis.

### 1. Measure the L1 vs L2 vs DB latency gap

Time 10,000 lookups each of: a `TTLCache` hit, a Redis `GET` hit, and a fake
50ms DB call (fewer iterations). Print µs/op for each.

Expected: L1 ~sub-microsecond to low-µs, L2 ~hundreds of µs, DB ~50,000 µs. This
is the ladder from module 00, now with the L1 rung you're adding — and it's *why*
serving the hottest keys from L1 is worth the consistency risk.

### 2. Build the two-level read path

Implement `get_product` from Concepts against a fake 50ms DB. Call
`get_product(1)` three times and log which level served each.

Expected: call 1 = full miss (DB, warms L2 and L1), call 2 = **L1 hit** (this
process already has it — not even L2 is touched), call 3 = L1 hit. Now clear L1
only (`l1.clear()`) and call again: an **L2 hit** (repopulates L1 without the
DB). You've watched each level warm the ones above it.

### 3. Reproduce the stale-L1 bug across two processes

Run the instrumented cache in **two** processes, A and B, but *without* the
pub/sub listener. In both, `get("product:1", loader)` to populate each process's
L1. In A, call `invalidate("product:1")` (which only busts A's L1 and L2). Then
`get("product:1")` in **B**.

Expected: B still returns the **stale** value from its own L1 — A's invalidation
never reached B's process memory. This is *the* multi-level caching bug: `DEL` on
shared L2 does nothing to other processes' L1 copies. Confirm B keeps serving
stale until B's L1 TTL (5s) expires.

### 4. Fix it with pub/sub L1 invalidation

Enable the `_listen()` thread in both processes. Repeat exercise 3.

Expected: after A's `invalidate`, B's next `get` is a **miss/L2 reload** of the
fresh value — because A published `product:1` on `cache:inval` and B's listener
popped it from B's L1. Then also confirm the short L1 TTL still matters: kill B's
listener, invalidate again, and watch B self-heal after 5s anyway (the TTL
backstop).

### 5. Instrument and compute per-level hit ratio

Using the `stats`/`hit_ratio()` helpers, generate a realistic mix: a few very
hot keys read constantly plus a long tail of one-off keys. Print `hit_ratio()`.

Expected: a high overall ratio, with a meaningful **L1** contribution from the
hot keys and **L2** carrying the tail. Now shrink `TTLCache(maxsize=2)` so L1 can
barely hold the hot set and re-measure: the L1 ratio drops and load shifts to L2.
You've seen L1 sizing directly move the number that matters.

### 6. Prove the nonlinear top of the hit-ratio curve

Simulate 100,000 requests at hit ratios 0.5, 0.9, 0.95, 0.99 using the
`hit_ratio × 1ms + (1−ratio) × 50ms` model (just arithmetic, or a tiny loop).
Tabulate average latency and implied DB load.

Expected: your table matches Concepts — 90%→99% cuts DB load 10×. Internalize
that chasing the last few points of hit ratio (what L1 does for hot keys) is
where the disproportionate wins live, and that below ~80–90% you should question
the whole cache.

### 7. Read the server-side hit ratio and reconcile it

While exercise 5 runs, in another terminal watch `redis-cli --stat` and grab
`INFO stats | grep keyspace`. Compare the *server-wide* L2 ratio to your
application's *L2* ratio from `hit_ratio()`.

Expected: they're related but not identical — the server-wide number includes
every key and client (and every full miss that then does a `SET`), while your
app-side counter is your specific cache. Conclude why the app-side, per-level
instrumentation is the number you actually tune against, and the server-wide one
is a coarse health check.

### 8. Diagnose and fix: the L1 that adds risk for no benefit

A service added an L1 (`TTLCache(maxsize=10000, ttl=30)`) in front of Redis.
After deploy, occasional stale-data complaints appeared, but the p99 latency
barely improved. Instrumentation shows: `l1_hit` ≈ 2% of lookups, `l2_hit` ≈
88%, `miss` ≈ 10%. The cached objects are per-user dashboards, keyed
`dash:{user_id}`, and there are millions of users. Diagnose and recommend.

<details>
<summary>Answer</summary>

The L1 hit ratio is **~2%** — L1 is doing almost nothing useful, because the
keyspace (`dash:{user_id}`, millions of users) has *no small hot set*: any given
process rarely sees the same user twice before the 30s TTL, so L1 entries almost
never get a second hit within one process. Meanwhile the L1 is *adding*
consistency risk: with a 30s TTL and per-process copies, a dashboard update is
stale for up to 30s in every process that cached it (the source of the
complaints), and there's no pub/sub invalidation. So this L1 is pure downside:
negligible speedup (2%), real staleness bug. Recommendation: **remove the L1**
(or restrict it to genuinely hot, shared, staleness-tolerant reference data —
not per-user dashboards) and rely on the well-performing L2 (88% hit). If some
truly hot, shared keys exist (e.g. global config), L1-cache *those* with a short
TTL. The general lesson: an L1 only earns its consistency cost when it has a real
hot set and the data tolerates seconds of staleness — measure the *L1* ratio
before keeping it.

</details>

## Independent challenge

No code given. Extend the storefront app from **02-cache-eviction-and-
invalidation** with a two-level cache for the single hottest, most-shared,
staleness-tolerant read you can identify (e.g. product reference data), keeping
per-user or correctness-sensitive reads out of L1. Instrument both levels so you
can report the **L1 hit ratio and L2 hit ratio separately**, and demonstrate — by
tuning the L1 `maxsize` and TTL — that your L1 actually earns its keep (a
non-trivial L1 hit ratio on your access pattern). Then reproduce the stale-L1-
across-processes bug from exercise 3 using two processes, and fix it with Redis
Pub/Sub L1 invalidation from module 02's event-based approach — proving both the
bug and the fix. Finally, state the max staleness a user could see for your
L1-cached value and argue why it's acceptable for *that* value specifically and
would not be for one correctness-sensitive read you name.

<details>
<summary>Hint</summary>

The right L1 candidate is data that's read by *many* requests (so a small L1
holds the whole hot set and gets repeated hits — a high L1 ratio) and where a few
seconds stale is harmless (product name/description, a category tree, feature
flags) — not `dash:{user_id}` or anything per-user, which has no hot set and
gives the ~2% L1 ratio of exercise 8. Use `cachetools.TTLCache` for L1 with a
short TTL (a few seconds) and Redis for L2 with a longer one. For the cross-
process fix, publish the busted key on a Redis Pub/Sub channel on every
`invalidate`, and run a subscriber thread per process that pops the key from that
process's L1 — keep the short L1 TTL as a backstop for missed messages. Your
staleness argument mirrors module 00: reference data tolerates seconds; a balance
or inventory count does not.

</details>

## Common mistakes & troubleshooting

- **Adding an L1 without measuring its hit ratio.** If the L1 ratio is near zero
  (no hot set, or per-user keys), you've added distributed-consistency risk for
  no speedup. Measure L1 *separately* and remove it if it's not earning its keep.
- **Invalidating only L2.** A `DEL` on Redis leaves every process's L1 copy
  stale. Use short L1 TTLs, and pub/sub L1 invalidation when seconds isn't good
  enough.
- **Long L1 TTLs.** L1 copies are per-process and unreachable; a long L1 TTL
  means long, widespread staleness. Keep L1 TTLs to seconds.
- **L1-caching correctness-sensitive data.** Per-process stale copies of
  balances/inventory/auth are bugs. Keep those in L2-only or uncached.
- **Oversized L1.** A huge in-process cache competes with your app for heap and
  can OOM the process; L1 is meant to be small (the hot set), with L2 for the
  tail.
- **Trusting the server-wide Redis hit ratio as your app's ratio.** `INFO stats`
  is coarse and shared across all keys/clients. Instrument per-cache, per-level.
- **Chasing more cache layers instead of a better candidate.** If the ratio
  stays low after stable keys, sane TTLs, and enough memory, the value probably
  shouldn't be cached — another layer won't fix a fundamentally low-reuse value.
- **`functools.lru_cache` on impure or invalidatable data.** It has no TTL and no
  way to invalidate a single entry (only `cache_clear()`), so it's only safe for
  pure, effectively-immutable computations — not data that changes.

## Checkpoint quiz

Write down your answer to each question before expanding it — checking without attempting first is the single easiest way to fool yourself into thinking you've learned this.

1. Contrast L1 and L2 caches on four axes: latency, sharing across processes,
   capacity, and survival across restarts.
2. Walk through the read path of a two-level cache on a full miss, and explain
   what gets populated on the way back and why.
3. Why does adding an L1 reintroduce the stale-cache problem that a single Redis
   `DEL` normally solves, and what are the two standard mitigations?
4. Given a 50ms DB and 1ms cache hit, why is improving hit ratio from 90% to 99%
   a bigger deal than it sounds, in terms of DB load?
5. If L1 hits 60% of lookups and L2 hits 80% of the remainder, what fraction of
   lookups reach the database, and why must you also look at the L1 and L2
   ratios *separately*?
6. What kind of data belongs in L1, and give one concrete example of data that
   must *not* go in L1 and why.

<details>
<summary>Answers</summary>

1. **Latency:** L1 ~100ns (in-heap, no network/serialization) vs L2 ~1ms
   (network + serialization). **Sharing:** L1 is per-process (each replica has
   its own, invisible to others); L2 is shared by all processes. **Capacity:** L1
   is small (bounded by one process's memory, thousands of entries); L2 is large
   (gigabytes). **Restart survival:** L1 is wiped on any restart/deploy; L2
   persists across app restarts.
2. Check L1 (miss) → check L2 (miss) → query the DB → populate **L2** (so other
   processes benefit and it survives this process's restart) → populate **L1** (so
   this process's next read is a ~100ns hit) → return. Each level warms the levels
   above it so subsequent reads stop at the highest possible rung.
3. A single-level `DEL product:42` removes the only cached copy, so the next read
   anywhere misses and reloads. With an L1, that `DEL` only clears L2; every
   process still holding the key in its own L1 keeps serving the stale value,
   unreachable by the `DEL`. Mitigations: short L1 TTLs (bound the staleness to a
   few seconds) and Pub/Sub L1 invalidation (broadcast the busted key so each
   process drops it from its own L1) — usually both.
4. Average latency drops modestly (5.9ms → 1.49ms), but the DB *load* drops from
   10% of requests to 1% — a **tenfold** reduction — because load is proportional
   to the *miss* rate (1 − hit ratio), and 10%→1% is 10×. The top of the hit-ratio
   curve is nonlinear: the last few points remove most of the remaining source
   load, which is exactly what an L1 over a good L2 delivers.
5. Full misses = miss both = `0.40 × 0.20 = 0.08`, so **8%** reach the DB
   (overall hit ratio 92%). You must look at each level separately because a high
   overall ratio can hide a near-zero L1 ratio — meaning L1 is adding consistency
   risk with no speed benefit and should be removed or re-scoped; the split tells
   you *which* level is doing the work.
6. Data that is **extremely hot** (a small set read very frequently, so a tiny L1
   gets repeated hits — a high L1 ratio) **and tolerant of a few seconds of
   staleness** (reference data: product names, config/feature flags). Must *not*
   go in L1: correctness-sensitive per-entity data like an account balance,
   sellable inventory count, or an authorization decision — per-process stale
   copies would be a correctness bug, not a cosmetic one.

</details>

## Next

[04-caching-for-web-apps-and-databases](../04-caching-for-web-apps-and-databases/README.md)
— you can now build and measure a multi-level cache. Next is applying caching to
the two places web backends need it most: HTTP/CDN/browser caching for static
assets and API responses (the headers from track 01, seen as a caching strategy),
and query-result caching for expensive joins/aggregates — plus the cache
stampede/thundering-herd problem and the standard defenses (locking, jittered
TTLs, request coalescing).
