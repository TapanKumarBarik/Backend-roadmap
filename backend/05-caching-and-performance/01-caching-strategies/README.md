# Module 01: Caching Strategies

## Why this matters

Module 00 gave you the cache-aside lookup — check the cache, on a miss do the
work and store it. That's *one* strategy, and it's the right default, but it's
not the only way your application and cache can coordinate. The real question a
caching design answers is: **who is responsible for keeping the cache and the
database in agreement on reads, and who is responsible on writes?** Different
answers give you different strategies, each buying a different mix of
*consistency*, *latency*, and *complexity* — and each with a characteristic
failure mode.

Getting this choice wrong is how you end up with the two classic caching bugs:
serving data that's stale forever (a write path that never touches the cache) or
losing writes entirely (a cache-first write path that dies before the data
reaches the database). This module names the four canonical strategies —
cache-aside, read-through, write-through, write-behind — draws exactly what
happens on a read and a write in each, and gives you a decision procedure for
picking one. Everything downstream (invalidation in module 02, the stampede
defenses in module 04, the capstone's caching layer) assumes you can reason in
these terms.

## Concepts

### The two axes: read path and write path

Every caching strategy is really a pair of decisions:

- **On a read**, does the *application* manage the cache (look, miss, load,
  store — cache-aside), or does the *cache itself* transparently load from the
  source on a miss (read-through)?
- **On a write**, does the write go to the database and the cache
  simultaneously/synchronously (write-through), to the cache first and the
  database later asynchronously (write-behind), or to the database with the
  cache merely *invalidated* (the cache-aside companion)?

Read strategies and write strategies compose. In practice you'll almost always
run one of these combinations:

- **Cache-aside + invalidate-on-write** (the pragmatic backend default).
- **Read-through + write-through** (when a caching library/layer manages both).
- **Read-through + write-behind** (write-heavy, latency-critical, can tolerate
  a durability window).

Keep the read path and the write path separate in your head; most confusion
comes from conflating them.

### Cache-aside (lazy loading)

The application treats the cache as a thing on the *side* that it consults and
maintains itself. This is the module 00 pattern, stated fully.

**Read:** look in the cache. On a hit, return it. On a miss, read from the
database, **write the result into the cache**, and return it. The cache is
populated *lazily* — only keys that have actually been requested ever get
cached.

**Write:** write to the database, then **invalidate** (delete) the cache key —
or update it. The next read misses and repopulates from the fresh database
value.

```python
def get_user(uid: int) -> dict:
    key = f"user:{uid}"
    if (cached := r.get(key)) is not None:
        return json.loads(cached)                 # HIT
    user = db_load_user(uid)                        # MISS -> source
    r.set(key, json.dumps(user), ex=300)            # populate lazily
    return user

def update_user(uid: int, changes: dict) -> None:
    db_update_user(uid, changes)                    # source is authoritative
    r.delete(f"user:{uid}")                         # invalidate; next read repopulates
```

```
  cache-aside READ                    cache-aside WRITE
  app ─►cache  hit? ─► return         app ─► DB (write, authoritative)
       └► miss                             └► cache: DEL key
          app ─► DB (load)                    (next read misses, repopulates)
          app ─► cache (store)
   the APP is the one talking to both the cache and the DB
```

- **Pros:** simplest to reason about; the cache only ever holds data that's
  actually been asked for (no wasted memory on cold keys); the database stays
  the source of truth; resilient — if Redis is down, reads just always "miss"
  and hit the database (degraded, not broken).
- **Cons:** every *first* read of a key pays the full miss cost (the "cold
  cache" penalty); there's a **race window** on writes (a reader can repopulate
  the cache with a stale value in between your DB write and your delete — the
  read-your-writes and concurrent-update problems below); and the caching logic
  is scattered wherever reads and writes happen unless you centralize it (the
  repository, per track 04 module 06).
- **Delete vs update on write:** *deleting* the key (invalidate) is usually
  safer than *updating* it with the new value. Updating re-introduces a race
  (two concurrent writers can leave the older value cached) and duplicates the
  DB's write logic in the cache; deleting just guarantees the next reader
  reloads from the authoritative source. Prefer **invalidate over update** in
  cache-aside unless you've thought the race through.

### Read-through

Same read *outcome* as cache-aside, but the responsibility moves: the
application talks *only* to the cache (or a caching layer/library in front of the
source), and **the cache itself is responsible for loading from the source on a
miss.** The app never sees the database on the read path; it just asks the cache,
and a miss is handled transparently underneath.

```python
# Conceptually: a caching layer with a loader function registered.
cache = ReadThroughCache(loader=db_load_user, ttl=300)

def get_user(uid: int) -> dict:
    return cache.get(f"user:{uid}")   # miss handled inside; app never touches DB here
```

- **Pros:** read logic is centralized in one place (the caching layer), so it
  can't be implemented inconsistently across call sites; the application code is
  simpler (it just "gets"); easy to add cross-cutting behavior (metrics,
  stampede protection) in one spot.
- **Cons:** needs a caching layer/library that supports it (plain redis-py is
  cache-aside; read-through is a pattern you build or adopt); same cold-cache
  first-read penalty as cache-aside; the loader coupling means the cache has to
  know how to fetch from the source.

The distinction from cache-aside is *organizational*, not behavioral: both
lazy-load on a miss. Cache-aside puts the miss logic in your application;
read-through puts it behind the cache interface. In a Python backend without a
dedicated caching library, you get read-through by *building* it — wrapping the
cache-aside logic in a reusable class/decorator so call sites just say "get."

### Write-through

The write path counterpart to read-through: **every write goes to the cache and
the database synchronously, as one logical operation**, before the write is
acknowledged. The cache is always populated with the latest value the instant a
write completes.

```python
def update_user(uid: int, changes: dict) -> None:
    user = db_update_user(uid, changes)             # 1. write to source (authoritative)
    r.set(f"user:{uid}", json.dumps(user), ex=300)  # 2. write to cache, synchronously
    # only now is the write considered done
```

```
  write-through:  caller ─► DB write ─► cache write ─► ACK
                          (both finish before the write is acknowledged)
  write-behind:   caller ─► cache write ─► ACK          (fast!)
                                  └┄┄► background flush ┄┄► DB  (later, batched)
                                        ▲ crash here = those writes LOST
```

- **Pros:** the cache is never stale relative to writes it processed — a read
  right after a write always hits the fresh value (good read-your-writes
  behavior); combined with read-through, reads are almost always hits because
  writes keep the cache warm.
- **Cons:** every write pays *two* writes (DB + cache) synchronously, so writes
  are slower; you cache values that may never be read again (write-heavy
  workloads waste cache space and write time on cold data — the opposite of
  cache-aside's lazy virtue); and you must handle **partial failure** — if the DB
  write succeeds but the cache write fails (or vice versa), the two diverge, so
  order matters (write the source first, then the cache; a failed cache write
  can be recovered by a later read, a lost DB write cannot).

### Write-behind (write-back)

The performance-aggressive write strategy: **write to the cache immediately and
acknowledge the write right away; propagate to the database asynchronously**,
later, in the background (often batched). The cache becomes the front line for
writes, and the database catches up.

```python
def record_view(post_id: int) -> None:
    r.incr(f"views:{post_id}")        # instant: just bump the counter in Redis
    # a background job periodically flushes accumulated counts to Postgres:
    #   for key in dirty_keys: db_add_views(post_id, r.getdel(key))
```

- **Pros:** the fastest possible write latency (the caller waits only for a
  Redis write, not the database); can **coalesce** many writes into few (1000
  increments become one `UPDATE ... SET views = views + 1000` — a massive load
  reduction, hugely relevant to the batch-processing ideas in module 06); great
  for high-volume, low-value-per-write data like counters, metrics, and view
  tallies.
- **Cons:** **durability risk** — if the cache dies before the background flush,
  those writes are *lost* (they never reached the durable store); the database is
  now *eventually* consistent with the cache, not immediately; and the machinery
  (a reliable background flusher, tracking which keys are "dirty," handling flush
  failures) is real complexity. Never write-behind data whose loss is
  unacceptable (payments, orders) — reserve it for data where losing a few
  seconds of writes on a crash is survivable (analytics counters).

### The consistency problems these strategies are fighting

Two concrete races explain most caching bugs and why "invalidate, don't update"
and TTLs matter. (Track 04 module 04's isolation concepts are the same theme,
now spanning two systems.)

- **Stale-cache-on-write (the classic).** A write updates the database but
  something fails to update/invalidate the cache — a forgotten write path, a
  crashed process between the DB write and the `DEL`, a code path that writes to
  the DB directly bypassing your caching layer. The cache now serves the old
  value **until its TTL expires** (or forever, with no TTL). This is why a TTL is
  a *safety net* even when you also invalidate explicitly: it bounds the damage
  of a missed invalidation.
- **Read-your-writes / concurrent-repopulation race.** With cache-aside: writer
  updates the DB and deletes the key; meanwhile a reader that missed *just
  before* the DB write finishes its slow DB read (which returned the *old* value)
  and writes that stale value back into the cache *after* the delete. Now the
  cache holds a stale value with a fresh TTL — stale until it expires, caused by
  a race, not a missed code path. Mitigations: short TTLs (bounds it), delete
  *after* the DB commit (not before), and for strict cases, techniques like
  versioned keys or delete-again-after-a-delay. Module 02 goes deeper; for now,
  know the race *exists* and that a TTL is your backstop.

### Choosing a strategy: a decision procedure

Ask, in order:

1. **Is this data read-heavy and staleness-tolerant?** (The module 00 checklist.)
   If not, don't cache it — no strategy saves you.
2. **Default to cache-aside + invalidate-on-write.** It's the simplest, most
   resilient, most common backend choice. Reach for something else only with a
   reason.
3. **Centralize into read-through** when the same read is cached at many call
   sites and you want the logic (and metrics, and stampede protection) in one
   place. It's cache-aside, organized.
4. **Use write-through** when reads-right-after-writes must be fresh and the
   write volume is modest (writes you'll actually read back soon). Pair it with
   read-through so writes keep the cache warm.
5. **Use write-behind only** for high-volume, low-durability-requirement writes
   where write latency and database load are the binding constraints (counters,
   metrics) — and you can tolerate losing a few seconds of writes on a crash.

Consistency vs latency vs complexity, at a glance:

| Strategy | Read freshness | Write latency | Durability | Complexity | Best for |
|---|---|---|---|---|---|
| Cache-aside | eventual (TTL/invalidate) | normal | full (DB is source) | low | general read-heavy reads (default) |
| Read-through | eventual (TTL/invalidate) | normal | full | low–medium | centralizing many cached reads |
| Write-through | fresh after write | slower (2 writes) | full | medium | read-after-write freshness, modest writes |
| Write-behind | fresh after write (in cache) | fastest | **at risk until flush** | high | high-volume counters/metrics |

## Command reference

| API / command | Purpose | Example |
|---|---|---|
| `r.get(key)` / `r.set(key, v, ex=)` | Cache-aside read/populate | `r.set("user:1", data, ex=300)` |
| `r.delete(key)` | Invalidate on write (preferred over update) | `r.delete("user:1")` |
| `r.mget(keys)` | Batch read many keys (fewer round-trips) | `r.mget(["user:1","user:2"])` |
| `r.incr(key)` / `r.incrby(key, n)` | Write-behind counter increment | `r.incr("views:42")` |
| `r.getdel(key)` | Atomically read and delete (flush a dirty counter) | `r.getdel("views:42")` |
| `r.setnx(key, v)` | Set only if absent (building blocks for locks, module 04) | `r.setnx("lock:x", "1")` |
| `SET key v XX` | Update only if key already exists | `r.set(k, v, xx=True)` |
| `SET key v NX EX n` | Set if absent, with TTL, atomically | `r.set(k, v, nx=True, ex=10)` |

A minimal reusable **read-through + write-through** wrapper you might actually
build in a FastAPI backend (this is how you get "read-through" without a
dedicated library):

```python
import json
from typing import Callable
import redis

r = redis.Redis(decode_responses=True)

class Cached:
    """Read-through get; write-through set. Loader knows how to hit the source."""
    def __init__(self, prefix: str, loader: Callable[[int], dict], ttl: int = 300):
        self.prefix, self.loader, self.ttl = prefix, loader, ttl

    def _key(self, id_: int) -> str:
        return f"{self.prefix}:{id_}"

    def get(self, id_: int) -> dict:
        key = self._key(id_)
        if (hit := r.get(key)) is not None:
            return json.loads(hit)
        value = self.loader(id_)                       # read-through: layer loads on miss
        r.set(key, json.dumps(value), ex=self.ttl)
        return value

    def write_through(self, id_: int, value: dict) -> None:
        r.set(self._key(id_), json.dumps(value), ex=self.ttl)  # after the DB write

    def invalidate(self, id_: int) -> None:
        r.delete(self._key(id_))                        # cache-aside write companion

users = Cached("user", loader=db_load_user, ttl=300)
```

## Hands-on exercises

Redis running (`docker run --name redis -p 6379:6379 -d redis:7`). Use
`decode_responses=True` on the client throughout. Where a "DB" is needed, a dict
plus a `time.sleep(0.1)` and a `print("DB!")` stands in for Postgres so you can
*see and hear* every source hit.

### 1. Implement cache-aside with invalidate-on-write

Build `get_user`/`update_user` exactly as in Concepts against the fake DB. Read
user 1 twice (one "DB!", then silence), update user 1, read again.

Expected: read 1 = miss ("DB!"), read 2 = hit (silent), after `update_user` the
key is deleted so the next read is a miss ("DB!") returning the new value. You've
seen lazy population and invalidate-on-write.

### 2. Prove "delete" beats "update" on write under a race

Modify `update_user` to *update* the cache with the new value instead of
deleting. Then simulate two near-simultaneous writers (call the DB update for
writer A, then writer B, but write B's value into the cache *before* A's — as a
reordered race would). Compare with the delete-based version.

Expected: with cache *update*, you can end with the cache holding A's (older)
value while the DB holds B's — a durable stale entry born from reordering. With
cache *delete*, whoever reads next simply reloads the current DB value, so no
stale value can get pinned. This is why cache-aside prefers invalidate over
update.

### 3. Build and use the read-through/write-through wrapper

Use the `Cached` class from the Command reference. `users.get(1)` twice, then
`db_update_user(1, {...}); users.write_through(1, new_value)`, then `get(1)`.

Expected: first get = miss (loader/"DB!"), second = hit, and after the
write-through the very next get is a *hit* on the fresh value with **no loader
call** — because write-through kept the cache warm. Contrast this with exercise
1, where the invalidate forced a reload.

### 4. Write-behind a counter and flush it

Model a view counter: a `record_view(post_id)` that only does `r.incr`, and a
`flush()` that `getdel`s all `views:*` keys and applies them to the fake DB in
one batched update. Record 1,000 views across a few posts, then flush.

```python
def flush():
    for key in r.scan_iter(match="views:*"):
        count = int(r.getdel(key))
        db_add_views(int(key.split(":")[1]), count)   # one DB write per post, not per view
        print(f"flushed {count} views for {key}")
```

Expected: 1,000 `record_view` calls do **zero** database writes; the single
`flush()` collapses them into one write per post. You've felt write-behind's
coalescing win — and can now see exactly what would be lost if Redis died before
`flush()` ran.

### 5. Reproduce the durability risk of write-behind

Record 500 views, then *don't* flush — instead `docker restart redis`
(assuming default no-persistence config) and check the counters.

Expected: the counters are gone; those 500 writes never reached the database and
are permanently lost. This is the write-behind tradeoff made concrete: never use
it for data whose loss is unacceptable. (Note: Redis *can* be configured with
AOF/RDB persistence to narrow this window, but it never fully closes it for
in-flight, un-flushed writes.)

### 6. Show a TTL rescuing a missed invalidation

Cache a value with `ex=5` via cache-aside, then update the fake DB *directly*
(bypassing `update_user`, simulating a code path that forgot to invalidate).
Read repeatedly.

Expected: reads serve the *stale* cached value for up to 5 seconds, then miss and
reload the fresh value once the TTL expires. The bug (a missed invalidation)
caused staleness, but the TTL *bounded* it to 5s instead of forever. This is why
you set a TTL even when you also invalidate explicitly.

### 7. FastAPI: cache-aside on an endpoint

Wrap a `GET /users/{uid}` endpoint (backed by the fake slow DB) with cache-aside,
and a `PUT /users/{uid}` that updates the DB and invalidates. Hit the endpoints
with `curl` and watch the server logs for "DB!".

Expected: the first GET logs "DB!", subsequent GETs don't; a PUT is followed by
one GET that logs "DB!" again (repopulation). This is the shape you'll deploy for
real, and the exact target the capstone's caching fix builds on.

### 8. Diagnose and fix: the write path that leaves the cache stale

An endpoint serves a product via cache-aside. A separate admin script updates
prices by writing straight to Postgres (`UPDATE products SET price = ... WHERE
id = ...`) and does nothing else. Users report the storefront shows old prices
"for a while after a price change, then it fixes itself." Diagnose and give two
fixes.

<details>
<summary>Answer</summary>

This is the **stale-cache-on-write** problem: the admin script updates the
authoritative source but never invalidates the cache, so the cache-aside read
keeps serving the old price **until the TTL expires** — which is exactly why it
"fixes itself after a while." The cache and the write path are out of sync
because a write path exists that bypasses the invalidation. Fixes: (1) route
*all* writes through a single place (the repository, per track 04 module 06) that
invalidates `product:{id}` after every DB write, so no write path can skip it —
the structural fix; (2) as a backstop, ensure a bounded TTL so even a missed
invalidation self-heals quickly (it already does, which is why it's "for a while,
then fixes itself"). Best practice is both: structural invalidation to be correct
promptly, plus a TTL to bound any invalidation you miss. If price freshness must
be immediate, consider event-based invalidation (module 02) so the admin write
publishes a change that busts the cache.

</details>

## Independent challenge

No code given. Take the FastAPI + Postgres app from **04-databases-and-data-
layer** (any entity with a read endpoint and an update endpoint — a `Customer`
or `Product`). Implement **cache-aside with invalidate-on-write** for the read
endpoint, centralizing the caching logic in the *repository* (module 06 of track
04's lesson) so no write path can bypass invalidation. Then convert *one*
suitable field into a **write-behind counter** (e.g. a per-entity view or access
count) with a background flush, and be able to state exactly what data you'd lose
if the process crashed between flushes and why that's acceptable *for that field
specifically*. Finally, deliberately introduce and then fix the stale-cache-on-
write bug from exercise 8 by adding a second write path that bypasses the
repository — prove the staleness with a hit on the old value, then fix it and
prove the fix.

<details>
<summary>Hint</summary>

Put `get`, `update` (DB write + `r.delete`), and the read-through population in
the repository so call sites can't forget to invalidate — this is the same
"don't let N+1 leak behind the interface" discipline from track 04 module 06,
applied to invalidation. For the write-behind counter, `r.incr` on access and a
periodic job that `getdel`s and does one `UPDATE ... SET count = count + N`; the
acceptable-loss argument is that a view/access tally is low-value, high-volume
data where losing a few seconds on a crash doesn't corrupt anything a user
depends on (unlike, say, an order). For the stale-cache bug, a raw
`UPDATE products SET price=...` in a script that skips the repository will pin
the old price in the cache until the TTL — the fix is to make that write go
through the repository's invalidating update too.

</details>

## Common mistakes & troubleshooting

- **Updating the cache instead of invalidating it (cache-aside).** Re-introduces
  a write-write race that can pin a stale value durably. Prefer `DEL`; let the
  next read reload from the source.
- **Invalidating before the DB commit, not after.** Delete the key *after* the
  authoritative write commits, or a concurrent reader repopulates the cache from
  pre-commit state.
- **No TTL because "we always invalidate explicitly."** You will eventually miss
  an invalidation path (a script, a migration, a bug); a TTL bounds the damage.
  Always have one as a backstop.
- **Write-through on write-heavy, read-rarely data.** You pay two synchronous
  writes and fill the cache with values nobody reads back — worse than not
  caching.
- **Write-behind on data you can't afford to lose.** A crash before the flush
  loses those writes permanently. Counters/metrics only.
- **Scattering cache-aside logic across call sites.** Different endpoints
  implement it slightly differently, one forgets to invalidate — and you get the
  exercise-8 bug. Centralize (read-through / repository).
- **Ignoring the Redis-is-down case.** Cache-aside degrades gracefully (all
  reads miss to the DB); a design that *requires* the cache to serve writes
  (naive write-behind) fails hard. Decide what happens when the cache is
  unavailable.

## Checkpoint quiz

Write down your answer to each question before expanding it — checking without attempting first is the single easiest way to fool yourself into thinking you've learned this.

1. What are the two independent axes (read path, write path) that every caching
   strategy is a choice along?
2. Describe the read and write behavior of cache-aside, and explain why deleting
   the key on write is usually safer than updating it.
3. How does read-through differ from cache-aside — behaviorally and
   organizationally?
4. What does write-through buy you, what does it cost, and why does write order
   (DB first, then cache) matter on partial failure?
5. When is write-behind the right choice, and what is the specific risk you
   accept by using it?
6. Explain the stale-cache-on-write bug and the concurrent-repopulation race, and
   name the one mechanism that bounds the damage of *both*.

<details>
<summary>Answers</summary>

1. The **read path** — does the application manage the miss (cache-aside) or does
   the cache load transparently (read-through) — and the **write path** — write
   DB + invalidate cache (cache-aside companion), write DB + cache synchronously
   (write-through), or write cache now + DB later async (write-behind).
2. Read: check cache, hit returns it, miss reads the DB, populates the cache, and
   returns. Write: write the DB, then invalidate (delete) the key. Deleting beats
   updating because updating re-introduces a write-write race (concurrent writers
   can leave the older value cached) and duplicates DB write logic in the cache;
   deleting guarantees the next read reloads the authoritative value.
3. Behaviorally they're the same — both lazy-load on a miss. The difference is
   organizational: cache-aside puts the miss logic in the application at each
   call site; read-through puts it *behind the cache interface* (a layer/library)
   so the app just "gets" and the miss is handled transparently in one central
   place.
4. It keeps the cache fresh immediately after every write it processes (good
   read-after-write), at the cost of two synchronous writes per write and caching
   values that may never be read. Order matters because the DB is the source of
   truth: write it first so a subsequent cache-write failure is recoverable by a
   later read; a lost DB write cannot be recovered from the cache.
5. When writes are high-volume, low-value-per-write, and latency/DB-load are the
   binding constraints (counters, metrics), and you can coalesce many writes into
   few. The risk: writes acknowledged from the cache but not yet flushed are
   **lost** if the cache dies before the background flush — reduced durability /
   eventual consistency with the DB.
6. Stale-cache-on-write: a write updates the DB but fails to invalidate the cache
   (forgotten/ bypassing path, crash mid-write), so the cache serves the old value
   until its TTL. Concurrent-repopulation race: a reader that missed just before a
   write finishes its slow DB read of the *old* value and writes it back *after*
   the writer's delete, pinning a stale value with a fresh TTL. A bounded **TTL**
   is the one mechanism that limits the damage of both — it forces the stale entry
   to expire and reload.

</details>

## Further reading & sources

- [AWS: Caching patterns (lazy loading, write-through, TTL)](https://docs.aws.amazon.com/AmazonElastiCache/latest/red-ug/Strategies.html) - a clear side-by-side of cache-aside vs write-through and their tradeoffs.
- [Redis: client-side caching](https://redis.io/docs/latest/develop/reference/client-side-caching/) - how Redis itself thinks about keeping application and cache in agreement.
- [redis-py commands](https://redis-py.readthedocs.io/en/stable/commands.html) - reference for `set`, `delete`, `incr`, `getdel`, and the `nx`/`xx`/`ex` flags used here.
- [Martin Fowler: TwoHardThings](https://martinfowler.com/bliki/TwoHardThings.html) - the invalidation problem the write strategies are ultimately fighting.
- [Microsoft: Cache-Aside pattern](https://learn.microsoft.com/en-us/azure/architecture/patterns/cache-aside) - a formal write-up of the default strategy, including the invalidate-on-write races.

## Next

[02-cache-eviction-and-invalidation](../02-cache-eviction-and-invalidation/README.md)
— you can now choose how reads and writes coordinate with the cache. Next is the
other side of the same coin: how entries *leave* the cache — eviction policies
(LRU, LFU, TTL, FIFO) when memory fills, and the invalidation strategies (manual,
TTL-based, event-based) that fight the hard problem named in module 00.
