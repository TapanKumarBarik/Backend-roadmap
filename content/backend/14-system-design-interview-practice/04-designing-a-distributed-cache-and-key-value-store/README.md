# Module 04: Designing a Distributed Cache and Key-Value Store

## Why this matters

The last two problems leaned on a cache and a partitioned store as *black boxes*
— "put a Redis in front," "hash-partition the KV store." This module opens the
box. Designing the distributed key-value store itself is where the deepest
distributed-systems ideas become concrete and unavoidable: **how do you spread
data across many nodes so that adding or losing a node doesn't reshuffle
everything** (consistent hashing), **how do you keep copies so a node failure
doesn't lose data** (replication), **what happens to consistency when those
copies disagree** (the CAP theorem made real), and **how do you decide what to
throw away when memory fills** (eviction policies).

It's a favorite senior-level interview problem precisely because it can't be
answered with buzzwords — every choice forces an explicit CAP tradeoff you have
to defend. It's also the conceptual backbone under Redis, Memcached, DynamoDB,
Cassandra, and every system you'll cache or shard with for the rest of your
career. Once you can design the store, you understand *why* the tools you use
behave the way they do under partition, failover, and load — which is exactly the
understanding **10-distributed-systems-patterns** builds toward, applied here to
the single most illustrative system.

## Concepts

### Requirements and scope

**Functional:**
- `get(key)`, `put(key, value)`, `delete(key)` — a simple key-value interface.
- (Cache variant) values expire via **TTL**; (store variant) values are durable.
- Configurable **eviction** when memory is full (cache) or **persistence** to
  disk (store).

**Non-functional (these define the problem):**
- **Scale horizontally.** Data and load exceed one machine, so the store spans
  many nodes and must grow by *adding* nodes, not resizing one.
- **Low latency.** In-memory get/put in <1 ms; the whole point of a cache is
  speed.
- **High availability.** A node failing must not take the store down or lose all
  its data — implying replication and failover.
- **Tunable consistency.** Depending on use, you accept eventual consistency (a
  read might see slightly stale data) for higher availability, or pay for stronger
  consistency. This is the CAP fork, and it's the crux.

### Partitioning: consistent hashing

To spread keys across N nodes you need a mapping from key → node. The naive
approach, `node = hash(key) % N`, has a fatal flaw: when N changes (a node is
added or dies), **almost every key remaps** to a different node, invalidating the
whole cache and triggering a massive data reshuffle. **Consistent hashing** fixes
this:

- Hash both **nodes** and **keys** onto the same circular space (a "ring", e.g.
  0…2³²). A key is owned by the first node encountered walking clockwise from the
  key's position.
- When a node is **added**, it only takes over the keys between it and the
  previous node — roughly `1/N` of the keys move, not all of them. When a node is
  **removed**, only its keys move (to the next node clockwise). Everything else
  stays put.
- **Virtual nodes** solve uneven distribution: give each physical node many points
  on the ring (e.g. 100–200 "vnodes") so keys spread evenly and, when a node
  dies, its load is redistributed across *many* successors instead of dumped
  entirely on one neighbor.

Consistent hashing is *the* answer to "how do you shard so scaling is cheap," and
you should be able to draw the ring and explain the add/remove behavior. On the
ring, a key walks clockwise to the first node it meets; virtual nodes (A1, A2…)
interleave each physical node's positions so load spreads evenly:

```
              0/2^32
                │
        C2 ─────┼───── A1
       /        │        \
     B1     key●─┘         A2      key ● walks clockwise ──► lands on B1
      │      (owner: B1)    │
     A3                     C1
       \                   /
        B2 ─────┬───── C3
                │
               (ring)      add node D → only the arc before each Dn moves (~1/N)
```

### Replication and consistency (the CAP tradeoff)

A single copy of each key means a node failure loses data and blocks reads.
**Replication** stores each key on **R** nodes (commonly the node that owns it
plus the next R−1 nodes clockwise on the ring). Now the hard question: when do you
consider a write "done," and can two replicas disagree?

- **CAP theorem** (from **10-distributed-systems-patterns**): under a network
  **P**artition you must choose **C**onsistency or **A**vailability. A CP store
  refuses reads/writes it can't make consistent (favor correctness, sacrifice
  availability); an AP store keeps serving from whatever replicas it can reach
  (favor availability, accept staleness/conflicts).
- **Quorum reads/writes** tune where you sit on that line. With N replicas, a
  write to **W** of them and a read from **R** of them guarantees strong
  consistency when **W + R > N** (the read set and write set always overlap on at
  least one up-to-date replica). Common: N=3, W=2, R=2. Lower W/R → faster, more
  available, weaker consistency; higher → slower, stronger.
- **Eventual consistency & conflict resolution.** In an AP design, replicas
  reconcile asynchronously; concurrent writes to the same key can conflict,
  resolved by **last-write-wins** (using timestamps — simple, can lose data) or
  **version vectors** (detect concurrent writes and let the app merge). This is
  the machinery behind Dynamo-style stores.

State the CAP position explicitly: "This is an AP cache — under partition we serve
possibly-stale reads rather than error, because a slightly stale cached value is
fine and availability matters more." That single sentence is worth more than any
diagram.

### Eviction and expiration

A cache has finite memory, so when it fills you must evict. The policy is a real
tradeoff tied to the access pattern:

- **LRU (Least Recently Used)** — evict the entry unused for the longest. The
  default; matches the common "recently used is likely to be used again" pattern
  (temporal locality). Recall the 80/20 hot-set idea from module 00 — LRU keeps
  the hot set resident.
- **LFU (Least Frequently Used)** — evict the least-often-accessed. Better when
  popularity is stable over time and you don't want a one-off scan to evict truly
  hot keys.
- **FIFO / random** — simpler, cheaper, less accurate. Random eviction is
  surprisingly decent and avoids LRU's bookkeeping cost.
- **TTL expiration** — orthogonal to eviction: entries carry an expiry and are
  removed when stale, either **lazily** (checked on access) or by a **background
  sweeper**. Real systems combine TTL (correctness — don't serve ancient data)
  with an eviction policy (capacity — make room).

There's also the classic caching-failure trio to defend against (recall
**05-caching-and-performance**): **cache stampede/thundering herd** (many
concurrent misses on the same hot key all hit the DB — mitigate with a lock or
"request coalescing"), **cache penetration** (requests for keys that don't exist
bypass the cache to the DB — mitigate with negative caching or a Bloom filter),
and **hot keys** (one key so popular it overloads its single node — mitigate by
replicating that key across nodes or adding a local in-process cache).

### Cache vs. durable store, and write policies

The same architecture serves two related jobs; the difference is durability and
write policy:

- **Distributed cache** (Memcached/Redis style): in-memory, TTL'd, eviction under
  pressure, tolerant of data loss (it's a copy of the source of truth). Used as
  **cache-aside** (app reads cache, on miss reads DB and populates) or behind a
  write policy.
- **Distributed KV store** (Dynamo/Cassandra style): the source of truth, durable
  (persisted to disk / replicated), no eviction — data stays until deleted.

**Write policies** (when the cache and the backing store are both in play):
- **Write-through** — write to cache and DB synchronously; cache always fresh, at
  higher write latency.
- **Write-back / write-behind** — write to cache now, flush to DB
  asynchronously; fast writes, but a crash before flush loses data.
- **Write-around** — write straight to the DB, skip the cache; avoids polluting
  the cache with write-once data, at the cost of a guaranteed miss on first read.

Each is a latency-vs-durability-vs-freshness tradeoff; name the one you pick and
why. These are the same policies you met in **05-caching-and-performance**, now in
a distributed setting where replication and partition interact with them.

### Reference architecture

The whole store is a client (or coordinator) that hashes a key onto a ring of
nodes, then talks to that node and its replicas under a quorum, while the nodes
gossip membership among themselves:

```
   ┌──────────┐   node_for(key) via
   │  Client  │   consistent-hash ring          ┌──────── gossip / membership ────────┐
   └────┬─────┘                                  │  (nodes exchange up/down + ring map) │
        │                                        ▼                                      ▼
        ▼                            ┌──────────────────┐                    ┌──────────────────┐
  ┌───────────────────────┐         │   Node B (owner) │  replicate to      │   Node C         │
  │  Coordinator /         │────────►│  vnodes: B1 B2 B3│───N-1 successors──►│  vnodes: C1 C2 C3│
  │  client-side hash ring │  put/   │  key range arc   │◄──── gossip ──────►│  (replica of B)  │
  │  ● key walks clockwise │  get    └────────┬─────────┘                    └────────┬─────────┘
  │    → first node = B    │                  │ replicate                             │
  └───────────────────────┘                   ▼                                       ▼
        │  W + R > N                  ┌──────────────────┐                    ┌──────────────────┐
        │  (quorum read/write)        │   Node D         │◄──── gossip ──────►│   Node A         │
        └────────────────────────────►│  (replica of B)  │                    │  vnodes: A1 A2 A3│
                                       └──────────────────┘                    └──────────────────┘
   Write: send to N replicas, wait for W acks.  Read: query R replicas, take newest.  W+R>N ⇒ strong.
```

**Component walkthrough:**

- **Client / Coordinator with the hash ring** — computes `node_for(key)` by
  hashing the key onto the ring and walking clockwise to the first node. This is
  **consistent hashing**: adding or removing a node only moves ~1/N of keys
  instead of reshuffling everything. It can live in a smart client or a
  coordinator tier.
- **Cache/KV nodes with virtual nodes** — each physical node claims many ring
  positions (B1, B2, B3…). **Virtual nodes** even out key distribution and, when a
  node dies, spread its load across many successors instead of dumping it on one
  neighbor. Each node owns the key arc that lands on its vnodes.
- **Replication to N−1 successors** — the owning node copies each key to the next
  N−1 nodes clockwise, giving a **replication factor** of N so a node failure
  neither loses data nor blocks its keys (C and D here hold replicas of B).
- **Gossip / membership protocol** — nodes periodically exchange which peers are
  up/down and the current ring map, so the cluster reaches agreement on membership
  and reroutes around failures without a central coordinator.
- **Quorum read/write path** — a write waits for **W** replica acks and a read
  queries **R** replicas; when **W + R > N** the read set overlaps the write set
  on an up-to-date replica, giving **strong consistency** (N=3, W=2, R=2 is the
  balanced default). Lowering W/R trades consistency for latency/availability —
  the CAP fork made concrete.

## Command reference

The concept cheat sheet for this module.

Consistent hashing behavior:

| Event | Naive `hash % N` | Consistent hashing |
|---|---|---|
| Add a node | ~all keys remap | ~1/N keys move |
| Remove a node | ~all keys remap | only that node's keys move |
| Even distribution | ok if N stable | use **virtual nodes** |
| Hot-spot on node loss | n/a | vnodes spread load to many successors |

Quorum consistency (N replicas, W write acks, R read acks):

```
W + R > N   → strong consistency (read set overlaps write set)
N=3, W=2, R=2  → strong, balanced (common default)
N=3, W=1, R=1  → fast + available, eventually consistent
W = N          → strongest writes, worst write availability
```

Eviction and caching-failure defenses:

| Concern | Policy / defense |
|---|---|
| Capacity full | LRU (default), LFU, FIFO, random |
| Staleness | TTL (lazy or sweeper), orthogonal to eviction |
| Cache stampede | per-key lock / request coalescing / early recompute |
| Cache penetration (missing keys) | negative caching / Bloom filter |
| Hot key | replicate the key / local in-process cache |

Write policies:

| Policy | Freshness | Write latency | Durability risk |
|---|---|---|---|
| Write-through | always fresh | higher (sync DB) | low |
| Write-back | fresh in cache | low | loses unflushed on crash |
| Write-around | stale until refill | low | low (DB is source) |

A minimal client interface (what the app sees; the distribution is hidden inside):

```python
class KVClient:
    def get(self, key: str) -> bytes | None: ...
    def put(self, key: str, value: bytes, ttl: int | None = None) -> None: ...
    def delete(self, key: str) -> None: ...

# Cache-aside read (the app's job, module 05 pattern):
def read_user(user_id: str):
    key = f"user:{user_id}"
    cached = kv.get(key)
    if cached is not None:
        return deserialize(cached)          # hit
    row = db.fetch_user(user_id)            # miss → source of truth
    kv.put(key, serialize(row), ttl=300)    # populate, 5-min TTL
    return row
```

Consistent-hash placement (sketch of the ring lookup):

```python
import bisect, hashlib

class HashRing:
    def __init__(self, nodes, vnodes=150):
        self.ring = {}                       # hash → node
        for node in nodes:
            for v in range(vnodes):          # virtual nodes for even spread
                self.ring[self._h(f"{node}#{v}")] = node
        self.sorted = sorted(self.ring)

    def _h(self, s): return int(hashlib.md5(s.encode()).hexdigest(), 16)

    def node_for(self, key):
        h = self._h(key)
        i = bisect.bisect(self.sorted, h) % len(self.sorted)   # walk clockwise
        return self.ring[self.sorted[i]]
```

## Hands-on exercises

Written/pseudocode design exercises — draw rings, reason about consistency.

### 1. Expose the `hash % N` flaw

You have 4 cache nodes using `node = hash(key) % 4`. A 5th node is added. Estimate
what fraction of keys now map to a different node, and explain the operational
consequence (hint: cache hit rate). Then state what consistent hashing changes.

### 2. Draw the ring

Place 3 physical nodes on a consistent-hash ring and show which node owns 5
example keys. Now add a 4th node and mark exactly which keys move and which stay.
Confirm that roughly 1/N moved. Then explain in one sentence what virtual nodes
would change about this picture.

### 3. Tune a quorum

With N=3 replicas, give the (W, R) settings for: (a) strong consistency with
balanced latency; (b) fastest possible writes accepting stale reads; (c) reads
that must always see the latest write even if writes are slow. For each, state
whether W+R>N holds and what you traded.

### 4. Make the CAP call

For each system, state whether you'd design it CP or AP under partition and
justify in one sentence: (a) a session/token cache; (b) a shopping-cart store;
(c) a bank-account balance store; (d) a "number of likes" counter. Notice how the
*consequence of staleness* drives the choice.

### 5. Choose an eviction policy

For each workload pick LRU, LFU, or TTL-only and justify: (a) a feed cache with
strong temporal locality; (b) a cache of country→currency lookups where
popularity is stable for years; (c) short-lived auth codes that must vanish after
10 minutes regardless of use. Then explain why eviction and TTL can coexist.

### 6. Defend against the caching-failure trio

A hot news article's cache entry expires at the moment it's trending, and 50,000
requests miss simultaneously. Name this failure, describe what happens to the DB,
and give two mitigations. Then design a defense for requests hammering keys that
*don't exist* (recall **05-caching-and-performance**).

### 7. Pick a write policy

For each, choose write-through, write-back, or write-around and justify: (a) a
user-profile edit that must be immediately reflected on next read; (b) a
high-volume metrics ingestion where losing a few points on crash is acceptable and
write latency must be minimal; (c) a bulk import of data that won't be read soon.

### 8. Diagnose and fix a flawed design

Critique and fix this distributed-cache design.

> "We shard 10 cache nodes with `hash(key) % 10`. Each key lives on exactly one
> node, no replication, because replication wastes memory. We never set TTLs —
> entries stay until evicted by LRU. When a node dies we just add a replacement
> and the ring rebalances. Under a network partition we always return the value
> from whichever node responds, and we use last-write-wins on the rare conflict.
> We chose this for maximum memory efficiency."

<details>
<summary>Solution</summary>

Flaws and fixes:

1. **`hash % 10` remaps almost everything when node count changes.** Adding or
   removing a node reshuffles ~all keys, collapsing the hit rate and stampeding
   the DB. Replace with **consistent hashing + virtual nodes** so only ~1/N keys
   move.
2. **"The ring rebalances" contradicts using `hash % N`.** There *is* no ring in
   a modulo scheme — the claim reveals a conceptual mix-up. You only get cheap
   rebalancing *if* you actually use consistent hashing.
3. **No replication → a node death loses all its data and blocks its keys.** Even
   for a cache this can stampede the DB and, for a durable store, loses data
   permanently. Replicate each key to R nodes (e.g. next R−1 clockwise).
4. **No TTL at all.** LRU handles *capacity* but not *staleness* — without TTL you
   can serve arbitrarily old data as long as it's frequently accessed. Add TTLs
   for correctness alongside LRU for capacity.
5. **Conflict handling is under-specified for the stated AP behavior.**
   "Always return whoever responds" + last-write-wins is a *legitimate* AP choice,
   but only if stale reads and silent write-loss are acceptable for this data — it
   must be justified against the use case, not chosen for "memory efficiency." For
   anything where losing a concurrent write matters, use version vectors or a
   quorum (W+R>N).
6. **"Maximum memory efficiency" is the wrong optimization target.** Skipping
   replication and TTL trades availability, durability, and correctness for a
   little RAM — almost always a bad trade for a shared cache.

Corrected: consistent hashing with vnodes; replication factor R (e.g. 3) with a
stated CAP position and quorum or LWW/version-vector conflict policy justified by
the data; TTL for staleness plus LRU for capacity; documented failover behavior.

</details>

## Independent challenge

No solution given. Design a **distributed session store** for a global web app:
billions of small session objects (~1 KB), read on nearly every authenticated
request, written on login/logout and periodically refreshed, must survive single-
node failure, and must feel instant worldwide. Decide the partitioning scheme,
replication factor and CAP position, eviction/TTL strategy, and write policy — and
justify each against the session use case. Draw on **10-distributed-systems-
patterns** for the CAP reasoning and on **03-authentication-and-authorization**
for what a session actually contains and how stale-session tolerance works.

<details>
<summary>Hint</summary>

Sessions are the textbook case for a *specific* set of choices, and the interview
signal is justifying them: consistent hashing on `session_id` (point lookups, no
cross-key queries); an **AP** posture with a short **TTL** equal to session
lifetime (a session read that's a few hundred ms stale across regions is
harmless, but availability on every request is critical — you never want auth to
error because one replica is partitioned); replication R≥2 so a node loss doesn't
log everyone out. The subtle part is *write* handling on login/logout: logout
must reliably *invalidate*, so a delete that doesn't propagate is worse than a
stale read — think about whether last-write-wins is safe for the delete, and
whether you need a short absolute TTL as a backstop so a missed invalidation can't
leave a session alive forever.

</details>

## Common mistakes & troubleshooting

- **Using `hash % N` for partitioning.** Any change in N remaps nearly all keys.
  Use consistent hashing (with virtual nodes for even spread).
- **Forgetting virtual nodes.** Plain consistent hashing distributes unevenly and
  dumps a dead node's whole load on one neighbor. Vnodes fix both.
- **No replication.** A single copy means node failure loses data and blocks its
  keys. Replicate to R nodes and decide failover behavior.
- **Not stating the CAP position.** Hand-waving consistency. Say explicitly CP or
  AP under partition, and tune with quorum (W+R>N for strong).
- **Confusing eviction with expiration.** LRU/LFU manage *capacity*; TTL manages
  *staleness*. Real systems need both.
- **Ignoring the caching-failure trio.** Stampede, penetration, and hot keys each
  need a specific defense; a design that ignores them falls over exactly when
  traffic spikes.
- **Optimizing for memory over availability/correctness.** Dropping replication or
  TTL to save RAM usually trades the wrong thing. Justify choices against the data
  and its staleness tolerance, not raw efficiency.
- **Picking last-write-wins blindly.** LWW silently discards concurrent writes;
  fine for a cache, dangerous where every write must survive — then use version
  vectors or quorums.

## Checkpoint quiz

Write down your answer to each question before expanding it — checking without attempting first is the single easiest way to fool yourself into thinking you've learned this.

1. Why does `node = hash(key) % N` behave badly when a node is added or removed,
   and how does consistent hashing reduce the damage?
2. What problem do virtual nodes solve, and what specifically goes wrong when a
   node dies in a ring *without* them?
3. State the quorum condition for strong consistency with N replicas, and give a
   balanced (W, R) for N=3. What do you trade by lowering both to 1?
4. Explain the CAP tradeoff for a distributed cache under a network partition, and
   describe when you'd choose AP versus CP with a concrete example of each.
5. Distinguish eviction from expiration. Which one is LRU, which one is TTL, and
   why do production caches use both?
6. Name the three classic caching failures (stampede, penetration, hot key) and
   one mitigation for each.
7. Compare write-through, write-back, and write-around on freshness, write
   latency, and durability risk. Which would you pick for high-volume metrics
   ingestion, and why?

<details>
<summary>Answers</summary>

1. Because the modulo depends on N, changing N changes the mapping for almost
   every key, so nearly all data must move / all cache entries invalidate.
   Consistent hashing maps keys and nodes onto a ring; adding/removing a node only
   moves the keys in that node's arc — roughly **1/N** of keys — leaving the rest
   in place.
2. Virtual nodes give each physical node many ring positions, which (a) evens out
   key distribution and (b) spreads a dead node's load across many successors.
   Without them, distribution is lumpy and when a node dies its *entire* load
   lands on the single next node, which can then overload and cascade.
3. **W + R > N** guarantees the read and write sets overlap on an up-to-date
   replica. For N=3, **W=2, R=2** is balanced. Lowering to W=1, R=1 makes reads
   and writes fast and highly available but only **eventually consistent** — a
   read can miss the latest write.
4. Under a partition you can't have both consistency and availability. **AP**:
   keep serving from reachable replicas, accept possibly-stale reads — e.g. a
   session or feed cache (staleness is harmless, uptime matters). **CP**: refuse
   to serve rather than return/accept inconsistent data — e.g. a bank balance
   (a wrong value is worse than an error).
5. **Eviction** frees space when memory is full (LRU/LFU/FIFO/random);
   **expiration** removes data that's too old (TTL), independent of memory
   pressure. LRU = eviction; TTL = expiration. Production caches use both: TTL for
   correctness (never serve ancient data) and eviction for capacity (make room for
   hot data).
6. **Stampede** — many concurrent misses on one hot key hammer the DB; mitigate
   with a per-key lock / request coalescing / early recompute. **Penetration** —
   requests for nonexistent keys bypass the cache to the DB; mitigate with
   negative caching or a Bloom filter. **Hot key** — one key overloads its node;
   mitigate by replicating the key or adding a local in-process cache.
7. Write-through: always fresh, higher write latency, low durability risk.
   Write-back: fresh in cache, low latency, loses unflushed data on crash.
   Write-around: stale until refill, low latency, low risk (DB is source). For
   high-volume metrics where a few lost points on crash are acceptable and latency
   must be minimal, pick **write-back** — fastest writes, and the durability risk
   is tolerable for that data.

</details>

## Further reading & sources

- [Dynamo: Amazon's Highly Available Key-value Store (paper)](https://www.allthingsdistributed.com/files/amazon-dynamo-sosp2007.pdf) - the foundational paper introducing consistent hashing, quorums, and version-vector conflict resolution that this module is built on.
- [Consistent Hashing and Random Trees (Karger et al., original paper)](https://www.akamai.com/site/en/documents/research-paper/consistent-hashing-and-random-trees-distributed-caching-protocols-for-relieving-hot-spots-on-the-world-wide-web-technical-publication.pdf) - the 1997 paper that introduced consistent hashing for distributed caching.
- [Redis Cluster specification](https://redis.io/docs/latest/operate/oss_and_stack/reference/cluster-spec/) - how a production in-memory store partitions keys across nodes and handles resharding and failover.
- [Memcached — how it works](https://github.com/memcached/memcached/wiki/Overview) - the classic distributed cache, its client-side hashing model, and LRU eviction.
- [CAP theorem (and the "PACELC" refinement)](https://en.wikipedia.org/wiki/CAP_theorem) - reference for the consistency-vs-availability fork you must state explicitly for any replicated store.
- [Amazon builds DynamoDB on these ideas (DynamoDB paper, ATC 2022)](https://www.usenix.org/system/files/atc22-elhemali.pdf) - how the Dynamo concepts evolved into a managed, production key-value service at scale.

## Next

[05-designing-a-news-feed-or-social-timeline](../05-designing-a-news-feed-or-social-timeline/README.md)
— you can now design the storage and caching substrate; next you'll design a
system *on top* of it where the hard problem is data flow, not storage: the news
feed, where fan-out on write vs. read and the celebrity problem force you to
combine everything so far — estimation, caching, partitioning, and consistency —
into one coherent read path.
