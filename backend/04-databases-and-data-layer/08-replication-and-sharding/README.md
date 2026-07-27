# Module 08: Replication and Sharding

## Why this matters

Every module so far assumed one database. One box, one source of truth, all your
data. That's the right default and it scales much further than people think — a
single well-tuned Postgres on modern hardware handles enormous workloads. But
eventually one node isn't enough, for one of two distinct reasons: you can't
serve enough *reads* (traffic outgrows one machine's capacity), or you can't
*fit or write* enough data (one machine's disk/write-throughput is the ceiling).
**Replication** solves the first; **sharding** solves the second. They're
different tools for different problems, and confusing them — or reaching for
either before you need it — is a classic way to add enormous complexity for no
benefit.

This is where the CAP theorem from module 01 stops being abstract. The moment
you add a read replica, you've introduced a *second copy* of the data that can
be *behind* the primary — **replication lag** — which is a small, deliberate dose
of the inconsistency CAP warned you about, and it produces real bugs ("I just
saved it, why isn't it there?"). Sharding is heavier still: it breaks the single
things you've relied on for eight modules — joins, transactions, unique keys —
across machine boundaries, and those losses are the whole reason "just shard it"
is rarely the right first answer. The senior skill this module builds is
knowing *which* problem you actually have, choosing the lightest tool that
solves it, and being honest about the guarantees you give up. Much of this
directly feeds the distributed-systems track (10) later.

## Concepts

### Replication: read replicas and why they exist

**Replication** keeps one or more copies (**replicas** / **standbys**) of your
database in sync with the **primary** (a.k.a. leader/master). The primary takes
all writes and streams its changes (via the WAL from module 01) to the replicas,
which apply them to stay current. The classic use is **read scaling**: point
writes at the primary and spread read-only queries across replicas, so a
read-heavy app (most are) can serve far more read traffic than one node could.
Replicas also provide **high availability** — if the primary dies, a replica can
be *promoted* to become the new primary (**failover**) — and a place to run heavy
analytics without hurting production traffic.

```
                 writes            reads
   app ──────────▶ PRIMARY ◀ ─ ─ ─ ─ ─ ─ ─ ┐
                     │  streams WAL          │ (read-only)
          ┌──────────┼──────────┐            │
          ▼          ▼          ▼            │
       replica    replica    replica ◀───────┘
```

Crucially, replication does **not** help write scaling — every write still goes
through the single primary. If your bottleneck is writes, replicas don't help;
that's what sharding is for.

### Replication lag — the inconsistency you just bought

Because replicas apply the primary's changes *after* the primary commits them,
a replica is always at least slightly behind — usually milliseconds, but seconds
or more under load or slow networks. This gap is **replication lag**, and it
creates a specific, common, confusing bug:

```
1. user POSTs a new comment  → written to PRIMARY, committed
2. app immediately redirects to the comments page
3. that read is served by a REPLICA that hasn't received the write yet
4. user sees their own comment MISSING → "the save didn't work!" (it did)
```

This is a **read-your-own-writes** violation (module 01's consistency spectrum,
now concrete). Standard mitigations: **route reads that must reflect a user's
own recent write to the primary** (e.g. right after a write, or for that user
for a few seconds); accept eventual consistency where it's harmless (a public
feed being 200ms stale hurts nobody); or use tooling that waits for a replica to
catch up to a known WAL position before reading. The design rule: **decide, per
read, whether it can tolerate lag** — most can, a few can't, and mixing that up
is the bug.

### Synchronous vs asynchronous replication

*How* the primary waits for replicas defines a direct CAP/durability trade
(module 01):

- **Asynchronous (the common default):** the primary commits and acknowledges
  the client *without* waiting for any replica to confirm. Fast writes, no write
  latency penalty — but if the primary dies before a replica received the last
  transactions, those acknowledged writes are **lost** on failover (the new
  primary never had them). This is an availability/latency-favouring (AP-leaning)
  choice.
- **Synchronous:** the primary waits for at least one replica to confirm it has
  the transaction before acknowledging the client. **No acknowledged write is
  lost** on failover — but every write now pays the round-trip latency to a
  replica, and (as you diagnosed in module 01's exercise) if the required
  replica is unreachable, **writes block**. This is a consistency/durability-
  favouring (CP-leaning) choice.

Real systems tune this per need — e.g. synchronous to one nearby replica for
durability, asynchronous to distant ones for read scaling. The point is it's a
*dial*, and where you set it is a deliberate trade between write latency,
durability, and availability during failures.

### Sharding: horizontal partitioning across machines

When a single primary can't hold the data or absorb the write rate, you
**shard**: split the data *horizontally* across multiple independent databases
(**shards**), each holding a *subset of the rows* and taking its own writes. This
is the only approach here that scales *writes*, because writes now spread across
many primaries. (Contrast **vertical partitioning** — splitting *columns* or
*tables* across databases — and note "shard" always means splitting rows.)

The core decision is the **shard key**: the column whose value decides which
shard a row lives on. Every row's home is a function of its shard key, and every
query ideally includes it so you know which shard to hit. Three common
strategies:

- **Range-based:** shard by ranges of the key (users A–H on shard 1, I–P on
  shard 2, …; or by date). Simple, and range queries on the key stay on one
  shard — but prone to **hot spots** (if today's date is one shard, all current
  writes hammer it; if names cluster, one shard is overloaded).
- **Hash-based:** shard by `hash(key) % N`. Spreads load evenly (no hot spots),
  which is its big win — but range queries scatter across all shards, and
  changing `N` (adding a shard) reshuffles almost everything unless you use
  **consistent hashing** to minimize movement.
- **Directory-based:** a lookup table/service maps each key to its shard.
  Maximum flexibility (rebalance by editing the map, put a whale tenant on its
  own shard) — but the directory is an extra hop and a potential single point of
  failure that must itself be highly available.

A closely related pattern is **partitioning within a single Postgres**
(declarative partitioning: one logical table split into partitions by range/
hash/list on one node) — it helps manageability and some query performance, but
it is *not* sharding: it's still one machine, so it doesn't scale writes or
capacity beyond that box. Don't conflate the two.

### The problems sharding introduces

Sharding breaks the guarantees you've leaned on all track. This is why it's a
last resort, not a first move:

- **Cross-shard joins die.** A join between two tables works only if both rows
  live on the same shard. Join across shards and the database can't do it — you
  gather partial results from each shard and stitch them in application code
  (slow, complex), or you deliberately **co-locate** related data on the same
  shard by sharding both on the same key (e.g. shard orders *and* their line
  items by `customer_id` so a customer's whole graph is on one shard).
- **Cross-shard transactions die.** ACID is per-shard; a transaction spanning
  shards needs distributed-transaction machinery (two-phase commit — slow and
  fragile) or a **saga** (a sequence of local transactions with compensating
  undo steps — track 10). Atomicity across shards is no longer free.
- **Global uniqueness and auto-increment break.** A `BIGSERIAL` per shard
  collides across shards. You need shard-aware id generation — UUIDs, or schemes
  like Snowflake ids that embed a shard/worker id (module 00's note on UUIDs for
  distributed id generation pays off here).
- **Rebalancing is hard.** Adding a shard means moving data while live, and
  choosing a shard key you *can't easily change* later is a long-term commitment
  (pick a bad one and every query becomes a scatter-gather).
- **Operational surface explodes.** N databases to back up, monitor, migrate
  (every Alembic migration now runs N times), and fail over.

### When you actually need it — and when a bigger box is simpler

The honest guidance, in order:

1. **First, optimize the single node** — the indexing (module 03), query tuning
   and pooling (module 07) you already learned. Most "we need to scale the
   database" situations are actually "we have an unindexed query / an N+1 / no
   pool."
2. **Then scale vertically** — a bigger machine (more CPU, RAM, faster disk).
   Boring, cheap relative to engineer-months, and buys a lot of headroom. Never
   underestimate how far one big Postgres goes.
3. **Then add read replicas** — if the bottleneck is *reads*. Cheap, low-risk,
   keeps one source of truth for writes.
4. **Then consider caching** (track 05) — offload repeated reads entirely.
5. **Only then shard** — and only if the bottleneck is genuinely *write
   throughput or data volume* that a single primary can't hold, accepting the
   lost joins/transactions/uniqueness. Sharding is the tool you reach for when
   you've exhausted the cheaper options and have measured evidence that a single
   write node is the wall.

The trap to avoid: sharding *pre-emptively* ("we might be huge someday") buys
you all of sharding's costs immediately for a scale you don't have and may never
reach. Build for the scale you have plus a reasonable margin, and keep the shard
key decision in mind so a future shard is *possible*, without paying for it now.

## Command reference

Setting up streaming replication is an operational task (mostly config, not
SQL); this reference is oriented to *observing* replication and *reasoning* about
the concepts, which is what a backend engineer touches.

| Command / setting | Purpose |
|---|---|
| `SELECT pg_is_in_recovery();` | `t` on a replica, `f` on the primary — "am I a replica?" |
| `SELECT * FROM pg_stat_replication;` | On primary: connected replicas and their lag positions |
| `SELECT pg_current_wal_lsn();` | Primary's current WAL position |
| `SELECT pg_last_wal_replay_lsn();` | Replica's replayed WAL position (compare for lag) |
| `SELECT now() - pg_last_xact_replay_timestamp();` | Replica's lag as a time interval |
| `wal_level = replica` | Primary config enabling replication |
| `synchronous_standby_names = '...'` | Which standbys must confirm (sync replication) |
| `synchronous_commit = on/off/remote_apply` | Durability/sync trade dial |
| `primary_conninfo` | Replica config: how to reach the primary |
| `pg_promote()` | Promote a replica to primary (failover) |

Routing reads to a replica in application code (the primary/replica split your
data layer owns — module 06):

```python
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

primary = create_engine("postgresql+psycopg://.../shop")            # writes + read-your-writes
replica = create_engine("postgresql+psycopg://.../shop?target_session_attrs=read-only")

WriteSession = sessionmaker(primary)
ReadSession  = sessionmaker(replica)

# The repository chooses the source per operation:
def place_order(...):            # a WRITE → primary
    with WriteSession() as s: ...

def list_public_feed(...):       # a lag-tolerant READ → replica
    with ReadSession() as s: ...

def get_my_just_saved_order(...):# read-your-writes → must go to PRIMARY
    with WriteSession() as s: ...  # deliberately the primary to avoid lag
```

Conceptually choosing a shard from a key (what a directory/hash router does):

```python
# hash-based routing across 4 shards
SHARDS = {0: engine0, 1: engine1, 2: engine2, 3: engine3}

def shard_for(customer_id: int):
    return SHARDS[hash(customer_id) % len(SHARDS)]

# a query MUST carry the shard key to be routed; a query without it
# (e.g. "find order by order_id" when sharded by customer_id) has to
# scatter-gather across ALL shards — the cost of a bad shard-key/query fit.
```

## Hands-on exercises

You'll run a **real primary + replica** pair with Docker Compose to see
replication and lag first-hand, then reason through sharding on paper (standing
up a true sharded cluster is out of scope, but the routing logic is testable).

### 1. Stand up a primary + streaming replica with Docker Compose

Create `docker-compose.yml`:

```yaml
services:
  primary:
    image: postgres:16
    environment:
      POSTGRES_PASSWORD: devpass
      POSTGRES_DB: shop
    command: >
      postgres -c wal_level=replica -c max_wal_senders=5
               -c hot_standby=on
    ports: ["5432:5432"]

  replica:
    image: postgres:16
    environment:
      PGPASSWORD: devpass
    ports: ["5433:5432"]
    depends_on: [primary]
    # On first start, base-backup from the primary, then stream.
    entrypoint: >
      bash -c '
      until pg_isready -h primary -U postgres; do sleep 1; done;
      rm -rf /var/lib/postgresql/data/*;
      pg_basebackup -h primary -U postgres -D /var/lib/postgresql/data -R -X stream -c fast;
      chmod 0700 /var/lib/postgresql/data;
      exec gosu postgres postgres'
```

```bash
docker compose up -d
```

Expected: two containers. (This is a teaching setup — the replica bootstraps
itself from the primary; give it a few seconds. If the replica errors on auth,
add a trust/`pg_hba` entry or a replication user; the exact hardening is
operational detail beyond the concept.)

### 2. Confirm who is primary and who is replica

```bash
docker compose exec primary psql -U postgres -d shop -c "SELECT pg_is_in_recovery();"  # f
docker compose exec replica psql -U postgres -d shop -c "SELECT pg_is_in_recovery();"  # t
```

Expected: primary returns `f` (false — not in recovery), replica returns `t`. The
replica is permanently in "recovery" mode, continuously replaying the primary's
WAL.

### 3. Watch a write propagate

On the **primary**:

```sql
CREATE TABLE notes (id BIGSERIAL PRIMARY KEY, body TEXT, at TIMESTAMPTZ DEFAULT now());
INSERT INTO notes (body) VALUES ('hello from primary');
```

On the **replica** (a second later):

```bash
docker compose exec replica psql -U postgres -d shop -c "SELECT * FROM notes;"
```

Expected: the row appears on the replica — replication is working. Now try to
*write* to the replica:

```bash
docker compose exec replica psql -U postgres -d shop -c "INSERT INTO notes (body) VALUES ('nope');"
```

Expected: `ERROR: cannot execute INSERT in a read-only transaction`. Replicas
are read-only by design — all writes must go through the primary.

### 4. Measure replication lag

On the **replica**:

```sql
SELECT now() - pg_last_xact_replay_timestamp() AS lag;
```

On the **primary**, inspect replicas:

```sql
SELECT client_addr, state, sent_lsn, replay_lsn,
       sent_lsn - replay_lsn AS bytes_behind
FROM   pg_stat_replication;
```

Expected: a tiny lag (milliseconds) when idle. Now generate write load on the
primary (a big `INSERT ... generate_series(...)`) and re-check — watch
`bytes_behind` grow and shrink as the replica catches up. This *is* replication
lag, the thing that causes read-your-writes bugs.

### 5. Reproduce a read-your-writes anomaly (conceptually + timing)

While a heavy write load runs on the primary (keeping the replica lagging),
insert a distinctive row on the primary and *immediately* query for it on the
replica in a tight loop:

```bash
docker compose exec primary psql -U postgres -d shop -c "INSERT INTO notes (body) VALUES ('find-me-now');"
docker compose exec replica psql -U postgres -d shop -c "SELECT count(*) FROM notes WHERE body='find-me-now';"
```

Expected: under lag, the replica may return `0` for a moment before the row
arrives — the exact "I saved it but can't see it" bug. Re-run against the
*primary* and it's always there. This is why read-your-writes reads must be
routed to the primary.

### 6. Route reads deliberately in application code

Using the primary/replica SQLAlchemy setup from the command reference (primary
on 5432, replica on 5433), write two functions: `recent_public_notes()` reading
from the replica, and `my_note_just_created(id)` reading from the primary.
Justify in a comment why each chose its source.

Expected: both work; the design decision (lag-tolerant → replica, read-your-
writes → primary) is explicit in code. This is the data-layer responsibility
from module 06 extended to replica routing.

### 7. Implement and test a shard router

No cluster needed — test the routing logic. Implement `shard_for(customer_id)`
(hash-based, 4 shards) and a `range_shard_for(customer_id)` (ranges). Feed 10,000
sequential ids through each and print how many land on each shard.

Expected: hash-based spreads them ~evenly (~2,500 each); a naive range scheme on
sequential ids piles recent ids onto the last shard (hot spot). You've just
demonstrated *why* hash beats range for even load and *why* range risks hot
spots — the core shard-strategy trade-off, measured.

### 8. Diagnose and fix: "we added replicas and it didn't help"

A team's app is slow. Writes (order placement) are timing out under load. They
added three read replicas and split reads to them, but write latency didn't
improve at all, and now users occasionally report seeing stale data right after
saving. Diagnose both problems and prescribe the right fixes.

<details>
<summary>Answer</summary>

Problem 1 — replicas didn't help writes: **replication scales reads, not
writes.** Every write still goes through the single primary, so adding read
replicas does nothing for a write-throughput bottleneck. The right diagnosis
path is first to check whether the write path is actually primary-bound
(unindexed writes, lock contention from module 04, an undersized pool from
module 07, or slow synchronous replication) — cheap fixes first. If, after
tuning, the *single primary's write capacity* is genuinely the wall (data volume
or raw write rate exceeds one machine), the tool is **sharding** to spread writes
across multiple primaries — accepting the loss of cross-shard joins/transactions
and choosing a shard key like `customer_id`.

Problem 2 — stale-after-save: that's **replication lag** causing a read-your-
writes violation, introduced the moment they started serving reads from
replicas. Fix by routing reads that must reflect a user's own recent write
(e.g. the confirmation page right after saving) to the **primary**, while
lag-tolerant reads stay on replicas. Both problems trace to the same root:
replication was applied as if it were a general "scale the database" button, when
it specifically scales lag-tolerant reads and nothing else.

</details>

## Independent challenge

No code given. You run the library-lending app from earlier modules, and it's
grown to serve a national network of libraries. Write a scaling design note that
proceeds *in the correct order of escalation* from this module: for a stated
bottleneck, name the lightest tool that solves it and why you'd try it before
the heavier ones. Cover: (1) the catalogue-browse and "my loans" pages are
read-heavy and slow — propose replicas and specify exactly which reads may go to
a replica and which must hit the primary (read-your-writes), justifying each;
(2) the loans table has grown so large that a single primary can no longer
absorb the checkout *write* rate during back-to-school season — decide whether to
shard, pick a shard key, and state which two things you rely on today (name them)
that would break once sharded and how you'd cope; (3) explicitly argue the case
for *not* sharding yet — what cheaper steps (from modules 03, 07, and this one)
you'd exhaust first, and what measured signal would finally justify sharding.
Reach back to module 01: name the exact consistency property you trade away by
introducing replicas, and to module 06: which layer owns the primary/replica and
shard routing, and why it must not leak upward.

<details>
<summary>Hint</summary>

The escalation ladder is the spine of the answer: optimize the single node
(indexes/EXPLAIN/N+1/pool) → bigger box → read replicas → caching → shard, in
that order, each justified by a measured signal. For (1), catalogue browse is
lag-tolerant (replica); the "did my checkout succeed / here are my current
loans right after borrowing" read is read-your-writes and must hit the primary.
For (2), shard on something that co-locates a query's data — sharding loans by
`library_id` (or `member_id`) keeps a library's/member's loans together and
avoids scatter-gather, and the things that break are cross-shard joins (loans↔
members across shards) and cross-shard transactions plus global `BIGSERIAL` ids.
For (3), the honest signal for sharding is specifically *write* throughput or
data volume that a single tuned, vertically-scaled primary genuinely cannot
hold — not read latency (replicas/caching) and not slow queries (indexing). The
routing lives in the data-access/repository layer (module 06) so services never
know which physical node answered.

</details>

## Common mistakes & troubleshooting

- **Using replication to scale writes.** Replicas scale *reads* only; every
  write still goes through the single primary. A write bottleneck needs tuning
  first, then sharding — not replicas.
- **Ignoring replication lag.** The moment you read from a replica you can serve
  stale data. Route read-your-writes reads to the primary; only send
  lag-tolerant reads to replicas.
- **Assuming asynchronous replication is lossless.** On failover, transactions
  the primary acknowledged but hadn't yet streamed are lost. Use synchronous
  replication (accepting write latency / possible write-blocking) where losing
  acknowledged writes is unacceptable.
- **Confusing partitioning with sharding.** Declarative partitioning within one
  Postgres helps manageability but is still one machine — it doesn't scale writes
  or capacity beyond that box. Sharding means multiple independent databases.
- **Sharding pre-emptively.** You pay all of sharding's costs (lost joins,
  transactions, uniqueness; N× operations) immediately for scale you don't have.
  Exhaust single-node tuning, vertical scaling, replicas, and caching first.
- **Choosing a bad shard key.** A key that doesn't appear in your common queries
  forces scatter-gather across all shards; one that clusters load creates hot
  spots. Pick a key that co-locates related data and spreads load evenly, and
  remember it's very hard to change later.
- **Forgetting id generation breaks under sharding.** Per-shard `BIGSERIAL`
  collides across shards. Plan for UUIDs or shard-aware ids *before* sharding.

## Checkpoint quiz

Write down your answer to each question before expanding it — checking without attempting first is the single easiest way to fool yourself into thinking you've learned this.

1. What problem does replication solve, what problem does it *not* solve, and
   what solves that other problem?
2. What is replication lag, what specific user-visible bug does it cause, and
   what's the standard fix?
3. Contrast synchronous and asynchronous replication in terms of write latency,
   durability on failover, and behaviour during a partition (tie it to CAP).
4. What is a shard key, and compare range-based vs hash-based sharding
   (one advantage and one drawback each).
5. Name three guarantees you've relied on this whole track that sharding breaks,
   and one coping strategy for each.
6. Give the correct order of escalation for "the database can't keep up," and
   state the specific signal that finally justifies sharding.
7. Which layer of your application owns primary/replica and shard routing, and
   why must that decision not leak into the business or presentation layers?

<details>
<summary>Answers</summary>

1. Replication solves read scaling (and high availability): spread read-only
   queries across replicas of the primary. It does *not* solve write scaling —
   every write still goes through the single primary. Sharding solves write
   scaling / data-volume by splitting rows across multiple independent primaries.
2. Replication lag is the delay before a replica has applied a change the
   primary already committed. It causes read-your-writes violations — a user
   sees their just-saved data missing because the read hit a not-yet-caught-up
   replica. Fix: route read-your-writes reads to the primary; only lag-tolerant
   reads go to replicas.
3. Async: primary acknowledges without waiting for a replica — low write latency,
   but acknowledged writes can be lost on failover; availability/latency-favouring
   (AP-leaning). Sync: primary waits for a replica to confirm — no acknowledged
   write lost on failover, but higher write latency and writes block if the
   required replica is unreachable during a partition; consistency/durability-
   favouring (CP-leaning).
4. The shard key is the column whose value decides which shard a row lives on.
   Range-based: keeps range queries on one shard and is simple, but risks hot
   spots. Hash-based: spreads load evenly (no hot spots), but scatters range
   queries across all shards and makes adding shards disruptive (mitigated by
   consistent hashing).
5. Cross-shard joins (cope: co-locate related data on the same shard by sharding
   on the same key, or stitch in app code); cross-shard transactions/atomicity
   (cope: sagas or two-phase commit); global uniqueness / auto-increment ids
   (cope: UUIDs or shard-aware id schemes like Snowflake).
6. Optimize the single node (indexing, query tuning, pooling) → scale vertically
   (bigger box) → add read replicas (if reads are the bottleneck) → add caching →
   shard (last). The signal that justifies sharding specifically: measured *write*
   throughput or data volume that a single tuned, vertically-scaled primary
   cannot hold — not read latency and not slow individual queries.
7. The data-access (repository) layer owns it. If it leaked upward, business and
   presentation code would depend on physical topology (which node/shard answered),
   destroying testability and the freedom to change replication/sharding without
   touching business logic — the separation-of-concerns rule from module 06.

</details>

## Next

[09-capstone-project](../09-capstone-project/README.md) — the concepts are
complete. The capstone puts them together: design and build a properly
normalized, indexed, transactionally-correct data layer for a real domain with
SQLAlchemy and Alembic, and write the scaling design note that decides where
replicas and shards would go if it had to grow 100×.
</content>
</invoke>
