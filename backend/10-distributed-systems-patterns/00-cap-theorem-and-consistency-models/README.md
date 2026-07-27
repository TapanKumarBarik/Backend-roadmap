# Module 00: CAP Theorem and Consistency Models

## Why this matters

In track 04 you met the CAP theorem once, as a two-paragraph aside next to ACID:
you learned that a distributed database can't have all three of Consistency,
Availability, and Partition tolerance at once, and that you pick CP or AP. That
framing is true and it's where most engineers stop — which is exactly why most
engineers reason about it badly. They memorize the triangle, they say "we chose
AP," and then they build a system that silently returns stale data to a user
who was about to make a decision that depended on it being fresh, or that grinds
to a halt during a network blip that a smarter design would have shrugged off.

The moment you have more than one process holding state — a primary and a read
replica (track 04), a Redis cache in front of Postgres (track 05), a worker that
reads a row a producer wrote a millisecond ago (track 06) — you are running a
distributed system, and CAP is no longer academic. The real skill isn't reciting
the theorem; it's being able to look at a specific feature — "show the user their
account balance," "let two people edit the same doc," "decrement inventory in a
flash sale" — and say *which* consistency this operation actually needs, what it
costs, and what breaks if you get it wrong. That per-operation judgment, not a
system-wide label, is what this whole track is built on. Get the vocabulary and
the trade-offs precise here and every later module (idempotency, locking, sagas,
CQRS, event sourcing) is a concrete application of it.

## Concepts

### CAP is about one specific moment: the partition

The single most common misreading of CAP is treating C, A, and P as three dials
you trade off continuously. They aren't. **Partition tolerance is not
optional** — networks *will* drop packets, machines *will* become unreachable,
and if your system spans more than one machine you don't get to opt out of that
happening. So P is a given. CAP is really a forced choice that only bites *during
a partition*: when two of your nodes can't talk to each other, and a write
arrives, you have exactly two options.

- **Refuse to serve (choose C, sacrifice A):** the node that isn't sure it has
  the latest data returns an error or blocks rather than risk returning or
  accepting inconsistent data. The system stays *consistent* but becomes
  *unavailable* on the minority side of the partition. This is **CP**.
- **Serve anyway (choose A, sacrifice C):** every node keeps accepting reads and
  writes using whatever data it has locally, and you reconcile the divergence
  later. The system stays *available* but nodes can temporarily *disagree*. This
  is **AP**.

When there is *no* partition — the normal case, 99.9% of the time — a
well-designed system gives you *both* C and A. CAP does not force a trade-off in
the healthy state. This is why the crude label "we're an AP system" is
misleading: what you're really saying is "*during a partition*, we prefer to keep
serving over staying consistent." The rest of the time the distinction is
invisible.

### The C in CAP is not the C in ACID

This trips up everyone coming from track 04, so nail it now. **ACID's C**
(consistency) means "a transaction takes the database from one valid state to
another, respecting your constraints, triggers, and invariants" — it's about a
single database honoring its own rules. **CAP's C** (linearizability) means
"every read sees the most recent completed write, as if there were a single copy
of the data and all operations happened in a global order." They are different
guarantees about different things. A system can satisfy ACID's C on each node and
still violate CAP's C, because a read replica can serve you a *valid but stale*
row. When someone says "consistency" in a distributed context, always ask *which
consistency* — the answer determines everything.

### The consistency spectrum: strong, eventual, causal

"Consistency" isn't binary; it's a spectrum of guarantees about *what a read can
see relative to writes*. The three you must be able to distinguish:

- **Strong consistency (linearizability):** once a write completes, *every*
  subsequent read — from any client, any node — returns that write or something
  newer. There is a single logical timeline. This is what a single Postgres
  primary gives you. It's the easiest to reason about and the most expensive to
  provide across nodes, because nodes must coordinate on every write (which is
  what makes it CP under partition).
- **Eventual consistency:** if writes stop, all replicas *eventually* converge to
  the same value — but in the meantime, different reads can return different,
  stale values, and there's no guarantee about *how* stale or in what order you
  see updates. A read replica with replication lag, a DNS record, a CDN, and most
  "AP" datastores are eventually consistent. Cheap and highly available; requires
  your application to tolerate staleness.
- **Causal consistency:** a middle ground. It guarantees that operations which
  are *causally related* are seen by everyone in the same order, while unrelated
  operations can be seen in any order. The canonical example: if you post a
  comment and then someone replies to it, no one should ever see the reply before
  the comment (the reply *causally depends on* the comment existing). Causal
  consistency preserves "happens-before" relationships without paying the full
  cost of global ordering. It's strictly stronger than eventual, strictly weaker
  than strong.

A useful fourth to know by name: **read-your-writes consistency** (a form of
session guarantee) — *you* always see *your own* writes immediately, even if
other users see them later. It's what makes eventual consistency tolerable in
practice (you post a comment and it shows up for you instantly, even if it takes
a moment to reach everyone else).

### Choosing per operation, not per system

The design mistake CAP-as-a-slogan produces is picking one consistency model for
the *whole system*. Real systems mix them per operation, because different data
has different tolerance for staleness. The right question is always: **what is
the cost of this read being stale, or these two writes being seen out of order?**

- **Needs strong consistency:** anything where a stale read causes a wrong
  *decision* with real consequences. Account balance right before a withdrawal.
  Inventory count in a flash sale (oversell = angry customer + refund). "Is this
  username taken?" at signup. A permission check. These justify the coordination
  cost.
- **Fine with eventual consistency:** anything where a few seconds of staleness
  is invisible or harmless. A like count. A user's display name in an old
  comment. A product's review count. Search indexes. Analytics dashboards.
  Forcing strong consistency here just buys you latency and fragility for no
  benefit.
- **Wants causal consistency:** anything where *ordering* between related events
  matters but global freshness doesn't. Comment threads, chat messages, a
  document's edit history, a workflow's state transitions.

The senior move is to make this choice *explicitly and per feature*, write down
why, and revisit it when requirements change — not to inherit a system-wide
default and hope.

### PACELC: the trade-off CAP forgets

CAP only describes behavior *during a partition*. But you make a consistency
trade-off even when the network is perfectly healthy, and CAP is silent about it.
**PACELC** fills the gap: *if there's a Partition (P), choose between Availability
and Consistency (A/C); Else (E), when running normally, choose between Latency
and Consistency (L/C).*

The "else" clause is the one that matters day to day. To give strong consistency,
a write must be acknowledged by enough replicas before it returns — that's extra
network round-trips, i.e. **latency**. If you relax to eventual consistency, the
write returns as soon as one node has it and propagates in the background — lower
latency, temporary staleness. So even with zero partitions, *strong consistency
costs latency*. This is why "just make everything strongly consistent" is not
free even on a good day: you pay for it in every single request's response time.
PACELC (`PA/EL`, `PC/EC`, etc.) is the vocabulary for describing a datastore's
full behavior — e.g. classic Dynamo-style stores are `PA/EL` (available and
low-latency, sacrificing consistency in both cases), a single-primary SQL setup
is closer to `PC/EC`.

## Command reference

There's no single CLI for "consistency" — it's expressed through *how you
configure and query* your datastores. The reference below is the practical
surface: Postgres replication settings, per-request consistency choices, and how
to read/force staleness in code.

| Lever | Where | Effect |
|---|---|---|
| `synchronous_commit = on/off` | Postgres primary | `on` waits for WAL flush (durable); `remote_apply` waits for replicas (stronger) |
| `synchronous_standby_names` | Postgres primary | names replicas a commit must reach before returning → synchronous replication (CP-leaning, higher latency) |
| async streaming replication | Postgres default | primary returns immediately, replicas lag → eventual consistency on replicas |
| read routing to primary vs replica | your app / pooler | primary = strong; replica = eventual (may be stale by the replication lag) |
| `WAIT` / `pg_last_wal_replay_lsn()` | Postgres replica | measure/inspect how far behind a replica is |
| Redis replica reads | Redis | replicas are async → stale; `WAIT numreplicas timeout` forces waiting for propagation |
| write/read quorum (`W`, `R`, `N`) | Dynamo-style stores | `W + R > N` gives strong-ish consistency; lower = more available/faster |

Reading from a replica gives you eventual consistency; the app decides per query
whether staleness is acceptable. A minimal FastAPI pattern that routes reads by
their consistency requirement:

```python
from fastapi import FastAPI
from sqlalchemy import create_engine, text

api = FastAPI()

# Two engines: the primary (strongly consistent) and a read replica (eventually
# consistent, may lag behind the primary by the current replication delay).
primary = create_engine("postgresql+psycopg://app@primary:5432/shop")
replica = create_engine("postgresql+psycopg://app@replica:5432/shop")

def read_engine(*, needs_fresh: bool):
    """Route the read by its consistency requirement, not by habit."""
    return primary if needs_fresh else replica

@api.get("/products/{pid}/reviews")
def list_reviews(pid: int):
    # Review counts can lag a few seconds without harm -> replica is fine.
    with read_engine(needs_fresh=False).connect() as c:
        rows = c.execute(
            text("SELECT body FROM reviews WHERE product_id = :p"), {"p": pid}
        ).all()
    return {"reviews": [r.body for r in rows]}

@api.get("/accounts/{aid}/balance")
def balance(aid: int):
    # A balance read that precedes a withdrawal decision MUST be fresh.
    with read_engine(needs_fresh=True).connect() as c:
        bal = c.execute(
            text("SELECT balance FROM accounts WHERE id = :a"), {"a": aid}
        ).scalar_one()
    return {"balance": bal}
```

Measuring replication lag (so you can *decide* whether a replica is fresh enough)
on the replica:

```sql
-- How far behind is this replica, in bytes and in seconds?
SELECT
  pg_last_wal_receive_lsn() AS received,
  pg_last_wal_replay_lsn()  AS replayed,
  now() - pg_last_xact_replay_timestamp() AS replica_lag;
```

Read-your-writes on top of an eventually-consistent replica, without routing
everything to the primary — remember the primary's write position (LSN) and only
read from a replica that has caught up to it:

```python
# After a write on the primary, capture the log position it produced.
with primary.begin() as c:
    c.execute(text("UPDATE profiles SET bio = :b WHERE id = :i"),
              {"b": bio, "i": uid})
    write_lsn = c.execute(text("SELECT pg_current_wal_lsn()")).scalar_one()
# Stash write_lsn in the user's session. A later read picks a replica only if
# pg_last_wal_replay_lsn() >= write_lsn, else falls back to the primary. That
# gives this user read-your-writes while everyone else still reads the replica.
```

## Hands-on exercises

You need a Postgres **primary + one streaming replica**. The fastest way is
Docker; use the `bitnami/postgresql` images which wire up replication from
environment variables, or configure two plain `postgres:16` containers. A minimal
`docker-compose.yml`:

```yaml
services:
  primary:
    image: bitnami/postgresql:16
    environment:
      POSTGRESQL_REPLICATION_MODE: master
      POSTGRESQL_REPLICATION_USER: repl
      POSTGRESQL_REPLICATION_PASSWORD: replpass
      POSTGRESQL_PASSWORD: pgpass
      POSTGRESQL_DATABASE: shop
    ports: ["5432:5432"]
  replica:
    image: bitnami/postgresql:16
    depends_on: [primary]
    environment:
      POSTGRESQL_REPLICATION_MODE: slave
      POSTGRESQL_REPLICATION_USER: repl
      POSTGRESQL_REPLICATION_PASSWORD: replpass
      POSTGRESQL_MASTER_HOST: primary
      POSTGRESQL_PASSWORD: pgpass
    ports: ["5433:5432"]
```

`docker compose up -d`, then connect to the primary on 5432 and the replica on
5433. Create a table on the primary: `CREATE TABLE counters (id TEXT PRIMARY KEY,
n INT); INSERT INTO counters VALUES ('x', 0);`.

### 1. Observe eventual consistency directly

On the primary: `UPDATE counters SET n = 100 WHERE id = 'x';`. Immediately (fast
as you can) query the replica on 5433: `SELECT n FROM counters WHERE id = 'x';`.
Repeat the replica query a few times.

Expected: for a brief window the replica may still show `0` (or a lower value),
then it converges to `100`. You've watched eventual consistency: the replica is
*valid* but *stale* until replication catches up. On a fast local setup the window
is tiny — do the next exercise to make it visible.

### 2. Make replication lag visible and measurable

On the primary, generate write load in a loop (`\watch` or a quick script doing
`UPDATE counters SET n = n + 1 WHERE id = 'x';` thousands of times). While it runs,
on the replica repeatedly run the lag query from the command reference
(`now() - pg_last_xact_replay_timestamp()`).

Expected: a non-zero, fluctuating lag. This number *is* your staleness budget: any
read from this replica can be up to this far behind reality. Write down what lag
you observed — this is the concrete quantity the "is a replica fresh enough?"
decision is made against.

### 3. Force strong consistency and feel the latency cost (PACELC's E)

On the primary, set synchronous replication: add the replica to
`synchronous_standby_names` (or set `POSTGRESQL_SYNCHRONOUS_COMMIT_MODE` on
Bitnami) and reload. Now time a single `UPDATE` before and after.

Expected: with synchronous replication the `UPDATE` doesn't return until the
replica has acknowledged it — measurably slower than async, and now a stale read
from the replica is impossible. You just traded latency for consistency with *no
partition involved* — that's the "Else, Latency-or-Consistency" half of PACELC,
live.

### 4. Simulate a partition and watch CP vs AP

With synchronous replication still on, cut the replica off:
`docker network disconnect <network> <replica-container>` (or `docker pause` the
replica). Now try to write on the primary.

Expected: the write **hangs / refuses to commit** — the primary is configured to
wait for a replica that's now unreachable, so it sacrifices *availability* to
preserve *consistency*. That's CP behavior during a partition. Reconnect the
replica (or switch back to async, which is AP-leaning: the primary would have kept
accepting writes and let the replica catch up later). You've now produced both
sides of the CAP choice on purpose.

### 5. Classify five operations by consistency need

For a typical e-commerce app, write down, for each operation, whether it needs
**strong**, **causal**, or **eventual** consistency and one sentence of
justification: (a) checking whether a coupon code is still valid before applying
it; (b) rendering the "142 people bought this" badge; (c) showing a chat thread
between buyer and seller; (d) reserving the last unit of stock at checkout; (e)
displaying the seller's average star rating.

Expected: roughly (a) strong — a stale "valid" causes an over-redeemed coupon;
(b) eventual — nobody's harmed by 142 vs 143 for a few seconds; (c) causal —
messages must appear in reply order; (d) strong — stale stock oversells; (e)
eventual — an average lagging by one review is invisible. The point isn't the
exact labels; it's forcing the *per-operation* judgment.

### 6. Implement read-your-writes routing

Using the LSN pattern from the command reference, build a two-endpoint FastAPI
app against your primary+replica: `POST /profile` writes the user's bio to the
primary and stores the returned `pg_current_wal_lsn()` in a dict keyed by user id;
`GET /profile` reads from the *replica* **only if** the replica's
`pg_last_wal_replay_lsn()` has reached the stored LSN, otherwise falls back to the
primary. Test by writing then immediately reading.

Expected: the writer always sees their own fresh bio (either the replica had
caught up, or you fell back to the primary), while the replica still absorbs reads
for users who *haven't* just written. You've made eventual consistency feel strong
*for the one session that needs it* — the cheapest correct answer.

### 7. Reason about a multi-region "AP" cart

You're told a shopping cart is replicated across two regions with async
(eventual) replication, and the same user, on two devices, adds different items in
each region during a partition. When the partition heals, both writes must be
kept. Write down: what data structure/merge rule makes "union the carts" the
correct reconciliation, and why last-write-wins would be *wrong* here.

Expected: a cart is naturally a *set* (or a grow-only/observed-remove CRDT-style
structure) where concurrent adds *merge by union*, so both items survive.
Last-write-wins would silently discard one device's addition — data loss the user
notices. The lesson: eventual consistency forces you to define a *conflict
resolution rule*, and "the right rule" depends on the data's semantics.

### 8. Diagnose and fix: the vanishing signup

A user reports: "I created my account, got redirected to my dashboard, and it said
'user not found' — but when I refreshed, I was there." The code writes the new
user row on the primary, returns `201`, and the dashboard immediately does `GET
/me`, which the team recently "optimized" to read from a read replica. Explain the
root cause in CAP/consistency terms and give two distinct correct fixes.

<details>
<summary>Answer</summary>

Root cause: a **read-your-writes violation** caused by reading from an eventually
consistent replica right after a write to the primary. The signup wrote to the
primary; the immediate `GET /me` hit a replica that hadn't yet received the new
row (replication lag), so it correctly-but-uselessly returned "not found." The
refresh worked because by then the replica had caught up. Nothing is "broken" —
the replica is doing exactly what an eventually consistent replica does; the bug
is routing a read that *needs* the user's own just-written data to a store that
can't guarantee it yet.

Two correct fixes: (1) **route this particular read to the primary** — reads that
must reflect the current user's very recent write need strong consistency, so
`GET /me` right after signup should hit the primary (per-operation routing, not a
blanket "all reads go to replicas"). (2) **read-your-writes via LSN**: capture the
write's `pg_current_wal_lsn()` at signup, store it in the session, and only serve
`/me` from a replica that has replayed past it, else fall back to the primary —
this keeps the replica absorbing reads for everyone who *didn't* just sign up. A
weaker third option is a short sticky "read from primary for N seconds after a
write" window per session.

</details>

## Independent challenge

No code given. In the **02-distributed-locking** module you'll build on Redis; for
now, design (in a written design doc, with small pseudocode fragments only where
they clarify) the consistency strategy for a **"seat selection" feature** in a
concert-ticketing system: users browse a live seat map, pick seats, and check out.
Specify, per operation, the consistency model you'd use and why: browsing the seat
map, showing "12 seats left in this section," placing a temporary hold on specific
seats during checkout, and the final purchase that permanently claims them. State
explicitly which operations tolerate staleness (and how much), which demand strong
consistency, and what a user would *see go wrong* if you picked the weaker model
for the strong-consistency operations. Tie your reasoning back to the per-operation
framing from the "Choosing per operation" concept above.

<details>
<summary>Hint</summary>

Browsing the seat map and the "N seats left" counter tolerate eventual
consistency — a slightly stale map just means the user occasionally clicks a seat
that's already gone, which you handle at hold time. The **hold** and the **final
purchase** need strong consistency (or an equivalent serializing mechanism like a
distributed lock or an atomic conditional write), because two users must never
both successfully claim the same physical seat — that's an oversell, exactly the
flash-sale inventory case from "Choosing per operation." The tell that you got it
wrong: two buyers get confirmation emails for seat 14C. The strong-consistency
boundary is the *claim*, not the *browse*.

</details>

## Common mistakes & troubleshooting

- **Treating CAP as a permanent, system-wide setting.** The C-vs-A choice only
  applies *during a partition*; the healthy state gives you both. And the choice
  is best made per operation, not once for the whole system.
- **Conflating ACID consistency with CAP consistency.** ACID's C is "the DB
  honors its constraints"; CAP's C is "reads see the latest write across nodes." A
  system can have one without the other. Always ask *which* consistency.
- **Assuming replicas are strongly consistent.** A read replica lags. Any read you
  route to it can be stale by the current replication delay. Only route reads
  there that tolerate that staleness.
- **Forgetting read-your-writes.** Users find it deeply confusing to not see their
  own just-made change. Even in an eventually consistent system, give a user a
  strong view of *their own* recent writes.
- **"Just make it strongly consistent" as a default.** Strong consistency costs
  latency on *every* write even with no partition (PACELC's E). Pay it only where
  a stale read causes a real wrong decision.
- **No conflict-resolution rule for AP data.** If you choose availability, two
  nodes *will* diverge during a partition. You must define how conflicting writes
  merge (union, last-write-wins, CRDT, manual review) — the right rule depends on
  the data's meaning, and "we'll figure it out later" means silent data loss.
- **Ignoring the partition until it happens.** Networks partition in production,
  not in your tests. Decide your C-vs-A behavior deliberately and rehearse it
  (exercise 4) rather than discovering it during an incident.

## Checkpoint quiz

Write down your answer to each question before expanding it — checking without attempting first is the single easiest way to fool yourself into thinking you've learned this.

1. During normal operation with no network partition, does CAP force you to
   choose between consistency and availability? Explain.
2. Distinguish CAP's C from ACID's C in one sentence each.
3. Define strong, eventual, and causal consistency, and give one operation that
   each is the right fit for.
4. What does PACELC add that CAP leaves out, and why does it matter even when
   nothing is broken?
5. A read replica is "eventually consistent." Concretely, what can go wrong for a
   user, and what's the cheapest fix that doesn't force *all* reads to the primary?
6. You're designing a flash-sale inventory decrement and a like-counter. Which
   needs strong consistency, which tolerates eventual, and what's the cost of
   getting each one backwards?

<details>
<summary>Answers</summary>

1. No. CAP's forced C-vs-A trade-off only applies *during a partition*. With a
   healthy network a well-designed system provides both consistency and
   availability; the choice only bites when two nodes can't communicate and a
   write arrives.
2. CAP's C (linearizability): every read across all nodes returns the most recent
   completed write, as if there were one copy. ACID's C: a transaction moves a
   single database from one valid, constraint-respecting state to another.
3. Strong: every read sees the latest write immediately (fit: account balance
   before a withdrawal). Eventual: replicas converge eventually but reads can be
   stale meanwhile (fit: a like/review count). Causal: causally related operations
   are seen in the same order everywhere, unrelated ones in any order (fit: a
   comment and its replies / a chat thread).
4. PACELC adds the "Else" clause: even with no partition, you trade Latency vs
   Consistency. It matters because strong consistency requires extra replica
   round-trips on every write, so it costs response-time latency *always*, not
   just during failures — "make everything strongly consistent" isn't free on a
   good day.
5. A read routed to a lagging replica can return stale data — e.g. a user doesn't
   see their own just-made write ("read-your-writes" violation), producing
   confusing "not found right after I created it" bugs. Cheapest fix: capture the
   write's log position (LSN) and serve that user's subsequent read from a replica
   only if it has caught up to that LSN, else fall back to the primary — so only
   *that session* gets a strong view while replicas still absorb everyone else's
   reads.
6. Inventory decrement needs strong consistency: a stale read oversells the last
   unit, forcing a refund and an angry customer. The like counter tolerates
   eventual consistency: being off by one for a few seconds harms no one. Getting
   inventory wrong (eventual) causes real oversells; getting the counter wrong
   (strong) just wastes latency and availability for a benefit nobody needs.

</details>

## Next

[01-idempotency-in-practice](../01-idempotency-in-practice/README.md) — you now
know that distributed systems retry, replay, and duplicate operations as a matter
of course (an eventually consistent replica catching up, an at-least-once queue
redelivering a message from track 06, a client retrying a request it wasn't sure
succeeded). The next module makes your operations *safe under exactly those
conditions*: idempotency keys, safe retries, and designing APIs and background
jobs that do the right thing when the same request arrives twice.
