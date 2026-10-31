# Module 01: ACID and the CAP Theorem

## Why this matters

In module 00 you kept saying the relational database "guarantees integrity."
This module makes that word precise. **ACID** is the set of four guarantees a
transactional database makes, and every one of them exists because a specific,
nasty class of bug happens when it's absent. If you can't state what each
letter means *and* describe the exact corruption you get when it breaks, you
don't actually understand why you're using a transaction — you're just wrapping
things in `BEGIN`/`COMMIT` as a ritual.

The second half is **CAP**, and it matters the moment your data lives on more
than one machine — which, once you add a read replica (module 08) or reach for
a distributed database, is *always*. CAP is the most misquoted theorem in
backend engineering ("pick two of three" is a lie you'll hear constantly). The
real content is narrow and sharp: *when the network between your nodes breaks,
you must choose between refusing requests and serving possibly-stale data.*
Understanding that choice is what lets you read a database's marketing page and
know what it will actually do to your data at 3am during a network partition.
ACID is about a single node keeping its promises; CAP is about what promises
are even *possible* once there are several nodes. You need both.

## Concepts

### A — Atomicity: all or nothing

A **transaction** is a group of statements that must succeed or fail as a unit.
**Atomicity** guarantees that if any statement in the group fails (or the
connection dies mid-way, or the server crashes), *none* of the group's changes
are applied — the database rolls back to exactly where it was before `BEGIN`.
There is no "half-done."

The canonical example is a money transfer: debit account A, credit account B.

```sql
BEGIN;
UPDATE accounts SET balance = balance - 100 WHERE id = 'A';
UPDATE accounts SET balance = balance + 100 WHERE id = 'B';
COMMIT;
```

**What breaks without it:** imagine the server crashes between the two
`UPDATE`s. Without atomicity, A has lost 100 and B never received it — money
has evaporated. With atomicity, the crash means the transaction never committed,
so *both* updates are discarded and the transfer simply didn't happen. You
retry the whole thing. Money is conserved. The guarantee is not "it always
succeeds" — it's "it never partially succeeds."

### C — Consistency: the database never violates its own rules

**Consistency** (the ACID "C", which is *not* the same "C" as in CAP — a
notorious source of confusion) means a transaction moves the database from one
valid state to another *valid* state, where "valid" is defined by the
constraints you declared: types, `NOT NULL`, `UNIQUE`, foreign keys, `CHECK`s.
If a transaction would leave the database violating any of these, the whole
transaction is rejected.

```sql
BEGIN;
UPDATE accounts SET balance = balance - 100 WHERE id = 'A';  -- A only has 50
-- suppose there is: CHECK (balance >= 0)
-- this UPDATE violates the check → the statement errors
COMMIT;  -- ...and because the statement failed, the transaction rolls back
```

**What breaks without it:** account A goes to -50, violating a rule your
business depends on. Consistency ties atomicity to your *declared invariants*:
the DB won't let a transaction commit a state that breaks the constraints. Note
the division of labour — the database enforces the constraints you *declared*;
it can't enforce a business rule you never told it about. Consistency is only
as strong as your schema.

### I — Isolation: concurrent transactions don't corrupt each other

**Isolation** governs what concurrent transactions can see of each other's
in-progress work. The ideal (called *serializable*) is that transactions
running at the same time produce the same result as if they'd run one after
another in *some* order — as though there were no concurrency at all. Real
databases offer weaker levels too, trading isolation for performance, and each
weaker level permits specific anomalies.

**What breaks without it — the lost update:**

```sql
-- Two requests both do "add an item to the cart total", concurrently:
-- T1 reads total = 100
-- T2 reads total = 100
-- T1 writes total = 100 + 20 = 120
-- T2 writes total = 100 + 5  = 105   ← T1's +20 is silently gone
```

Both read the same starting value and one overwrites the other. That's a **lost
update**, and it's just one of a family of concurrency anomalies (dirty reads,
non-repeatable reads, phantoms) that isolation levels are defined to prevent.
Isolation is subtle and central enough that module 04 is devoted entirely to
it — for now, know that "I" is the letter that makes concurrency safe, and that
you *choose* how strong it is.

### D — Durability: once committed, it survives a crash

**Durability** guarantees that once `COMMIT` returns success, the change is
permanent — it will survive a process crash, an OS crash, or a power loss the
millisecond after. Databases achieve this with a **write-ahead log (WAL)**:
before changes are applied to the main data files, they're first appended to an
on-disk log and flushed (`fsync`) to durable storage. If the server dies, on
restart it replays the WAL to recover every committed transaction.

**What breaks without it:** a user sees "order placed," the server crashes a
moment later, and on restart the order is gone — but you already charged their
card and emailed a confirmation. Durability is the guarantee that "the database
said yes" and "it's really saved" are the same thing. Beware the common
foot-gun: durability can be *silently weakened*. If you run Postgres with
`synchronous_commit = off`, `COMMIT` returns before the WAL is flushed — faster,
but a crash can lose the last fraction of a second of "committed" transactions.
That's a real, deliberate trade some systems make; just know when you've made
it.

Each guarantee earns its keep by the exact corruption it prevents:

```
  Guarantee      Prevents (what breaks without it)
  ---------------------------------------------------------
  Atomicity   →  half-done txn: A debited, B never credited
  Consistency →  invalid state committed: balance goes to -50
  Isolation   →  concurrent corruption: lost update (+5 vanishes)
  Durability  →  "saved" then gone: crash eats an acked commit
```

### The CAP theorem — what it actually says

Now data lives on multiple nodes (replicas, a distributed cluster). The **CAP
theorem** concerns three properties:

- **Consistency (CAP's C):** every read sees the most recent write (or an
  error). Every node agrees on the current value. *This is a different, stronger
  "C" than ACID's — it's specifically about all nodes agreeing.* This property
  is more precisely called **linearizability**.
- **Availability:** every request to a non-failing node gets a
  non-error response (though possibly stale).
- **Partition tolerance:** the system keeps working even when the network
  between nodes drops or delays messages (a **network partition**).

The theorem: **when a network partition occurs, you cannot have both
consistency and availability — you must sacrifice one.** That's it. The popular
"pick two of three" phrasing is misleading, because **partition tolerance is
not optional** — networks *do* fail, and a distributed system that can't
tolerate a partition just breaks. So the real choice is not "which two" but
"**when a partition happens, do I sacrifice C or A?**" — making every practical
distributed store either **CP** or **AP**.

### CP vs AP — the choice, made concrete

Picture two nodes holding a copy of a value, and the link between them dies.
A write arrives at node 1. Node 1 can't reach node 2 to replicate it.

- A **CP** system (consistency over availability) refuses to serve reads that
  might be stale, or refuses the write, until the partition heals and nodes
  agree again. You get **errors/timeouts, never wrong answers.** Choose this
  when correctness beats uptime: a bank ledger, an inventory count that must
  never oversell, anything where a stale read causes real damage.
- An **AP** system (availability over consistency) keeps serving on both
  nodes — node 2 answers reads with the old value, node 1 accepts the write —
  and **reconciles later** when the partition heals (last-write-wins, version
  vectors, etc.). You get **answers always, but possibly stale ones.** Choose
  this when uptime beats momentary correctness: a social feed, a "likes"
  counter, a shopping cart that can merge conflicting versions.

```
  During a partition, the link between nodes is cut — you must pick a side:

                          C  (all nodes agree)
                         / \
                        /   \      Partition tolerance (P) is not optional:
                       /  P  \     networks DO fail. So the real axis is C vs A.
                      /       \
                     A ─── ✂ ─── (other node)
                (always answers)

     CP: refuse / error until nodes agree   → never wrong, sometimes down
     AP: answer on both nodes, reconcile     → always up, sometimes stale
```

Postgres with a single primary is a CP-flavoured system: if the primary is
unreachable, writes stop rather than diverge. Classic AP systems include
Cassandra and DynamoDB (tunable, but availability-leaning by design).

### The nuance CAP hides: it's a spectrum, and it only bites during a partition

Two honest caveats professionals carry:

1. **CAP only forces the choice *during a partition*.** When the network is
   healthy (the overwhelming majority of the time), a system can be both
   consistent *and* available. CAP describes behaviour in the failure case, not
   the normal case. The extended model **PACELC** captures the rest: *if
   Partition, choose A or C; **E**lse (normal operation), choose between
   **L**atency and **C**onsistency.* Even with no partition, keeping all nodes
   perfectly consistent costs latency (you wait for replicas to acknowledge), so
   there's a second trade-off happening all the time.
2. **"Consistency" is a spectrum, not a boolean.** Between CAP's strict
   linearizability and "anything goes" sit useful middle grounds like **eventual
   consistency** (replicas converge given no new writes) and **read-your-writes
   consistency** (you always see your *own* recent writes, even if others' are
   delayed). Real systems pick a point on this spectrum, often tunably per query.
   This directly sets up **replication lag** in module 08 — a read replica that's
   a few hundred milliseconds behind the primary is a small, deliberate dose of
   inconsistency traded for read scaling.

## Command reference

| Concept | SQL / setting | Meaning |
|---|---|---|
| Start a transaction | `BEGIN;` (or `START TRANSACTION;`) | Open an atomic unit |
| Commit | `COMMIT;` | Make all changes durable and visible |
| Roll back | `ROLLBACK;` | Discard all changes since `BEGIN` |
| Partial rollback | `SAVEPOINT sp; ... ROLLBACK TO sp;` | Undo part of a transaction |
| Enforce a value invariant | `CHECK (balance >= 0)` | The "C" (consistency) rules the DB enforces |
| Durability tuning | `SET synchronous_commit = off;` | Trade durability for speed (per session) |
| Inspect WAL activity | `SELECT pg_current_wal_lsn();` | Current write-ahead-log position |
| See open transactions | `SELECT * FROM pg_stat_activity WHERE state <> 'idle';` | Diagnose long-running/stuck transactions |

Atomicity in application code with SQLAlchemy (module 05 goes deep; shown here
so the ACID concept has a Python face):

```python
from sqlalchemy import create_engine, text

engine = create_engine("postgresql+psycopg://postgres:devpass@localhost:5432/shop")

# The context manager makes the transaction atomic: it COMMITs on clean exit,
# and ROLLBACKs automatically if the block raises — all-or-nothing.
def transfer(src: str, dst: str, cents: int) -> None:
    with engine.begin() as conn:                       # BEGIN
        conn.execute(text("UPDATE accounts SET balance = balance - :c WHERE id = :a"),
                     {"c": cents, "a": src})
        conn.execute(text("UPDATE accounts SET balance = balance + :c WHERE id = :b"),
                     {"c": cents, "b": dst})
    # if the block raised anywhere above, neither UPDATE persists (atomicity)
    # if it exited cleanly, both are committed together and durable
```

## Hands-on exercises

Reuse the `pg-data` container from module 00 (or start it again). All exercises
run in `psql` unless noted; several need **two** psql sessions to demonstrate
concurrency — open a second terminal and run `docker exec -it pg-data psql -U
postgres -d shop` again.

### 1. Set up an accounts table with a real invariant

```sql
CREATE TABLE accounts (
    id      TEXT PRIMARY KEY,
    balance INTEGER NOT NULL CHECK (balance >= 0)
);
INSERT INTO accounts VALUES ('A', 100), ('B', 0);
```

Expected: two accounts, and a check constraint that will *prove* the "C" in
ACID later.

### 2. Atomicity: prove a failed transaction leaves no trace

```sql
BEGIN;
UPDATE accounts SET balance = balance - 30 WHERE id = 'A';
SELECT balance FROM accounts WHERE id = 'A';   -- shows 70 inside the txn
ROLLBACK;
SELECT balance FROM accounts WHERE id = 'A';   -- back to 100
```

Expected: inside the transaction A is 70; after `ROLLBACK` it's 100 again. The
change was real *to you* mid-transaction but vanished entirely on rollback —
all-or-nothing.

### 3. Consistency: the constraint rejects an invalid transfer

```sql
BEGIN;
UPDATE accounts SET balance = balance - 500 WHERE id = 'A';  -- A has only 100
COMMIT;
```

Expected: the `UPDATE` errors with `violates check constraint`, the transaction
is aborted, and `SELECT balance FROM accounts WHERE id='A';` still shows 100.
The database refused to enter an invalid state.

### 4. A correct, complete transfer

```sql
BEGIN;
UPDATE accounts SET balance = balance - 40 WHERE id = 'A';
UPDATE accounts SET balance = balance + 40 WHERE id = 'B';
COMMIT;
SELECT * FROM accounts;
```

Expected: A=60, B=40, total conserved at 100. Both updates applied together.

### 5. Isolation: reproduce a lost update

In **session 1**:

```sql
BEGIN;
SELECT balance FROM accounts WHERE id = 'B';   -- reads 40
```

In **session 2** (while session 1 is still open):

```sql
BEGIN;
SELECT balance FROM accounts WHERE id = 'B';   -- also reads 40
UPDATE accounts SET balance = 40 + 5 WHERE id = 'B';
COMMIT;                                          -- B is now 45
```

Back in **session 1**:

```sql
UPDATE accounts SET balance = 40 + 20 WHERE id = 'B';  -- based on its stale read of 40
COMMIT;                                                  -- B is now 60
SELECT balance FROM accounts WHERE id = 'B';
```

Expected: B ends at 60, and session 2's +5 has been silently lost — the +5 and
+20 should have summed to 65. This is the lost update anomaly caused by
computing the new value in the application from a stale read. Module 04 shows
the correct fixes (atomic `balance = balance + 20`, or `SELECT ... FOR UPDATE`,
or a higher isolation level). For now, just *see* the corruption.

### 6. Durability: commit, kill, recover

```sql
BEGIN;
INSERT INTO accounts VALUES ('C', 999);
COMMIT;                          -- returns success
```

Now hard-kill and restart the container to simulate a crash:

```bash
docker kill pg-data && docker start pg-data
```

Reconnect and check:

```bash
docker exec -it pg-data psql -U postgres -d shop -c "SELECT * FROM accounts WHERE id='C';"
```

Expected: account C is still there. `COMMIT` returned before the kill, so
durability (via the WAL replayed on restart) guarantees it survived a hard
crash.

### 7. Classify five real systems as CP or AP

For each, decide CP or AP and give one sentence why. Answer before expanding.

1. A bank's core ledger.
2. Amazon's shopping cart (famously designed to always accept "add to cart").
3. An airline seat-reservation system that must never double-book a seat.
4. Instagram's like counter.
5. A distributed inventory count for a flash sale that must never oversell.

<details>
<summary>Answers</summary>

1. **CP** — a stale or conflicting balance is unacceptable; refuse rather than
   risk a wrong answer.
2. **AP** — always let the customer add to cart; reconcile conflicting cart
   versions later (the classic Dynamo design).
3. **CP** — double-booking is real damage; better to error than to sell the same
   seat twice.
4. **AP** — a like count that's briefly stale by a few hurts nobody; uptime
   wins.
5. **CP** — overselling is real damage; the count must be authoritative even if
   that means some requests wait or fail during a partition.

</details>

### 8. Diagnose and fix: "our writes just stopped during a network blip"

A team runs Postgres with one primary and one synchronous standby, configured
so a `COMMIT` only returns after the standby acknowledges it (this is a real
Postgres mode: `synchronous_commit = on` with a `synchronous_standby_names`
set). During a brief network partition between primary and standby, *all writes
hung* and users got timeouts, even though the primary itself was perfectly
healthy. The team wants to "make it never hang again." Explain what CAP choice
this configuration encodes, what the *only* two real options are, and why "have
both" is not one of them.

<details>
<summary>Answer</summary>

Synchronous replication means the primary won't confirm a commit until the
standby has it — this is a deliberate **CP** choice: the system refuses to
proceed (loses availability) rather than let the two nodes diverge (lose
consistency). During the partition the primary can't reach the standby, so by
design commits block. That's not a bug; it's the guarantee working. Per CAP,
during a partition you can have C or A, not both, so the only two real options
are: (1) **stay CP** — accept that writes pause during a partition, which is
correct if losing an acknowledged transaction is unacceptable; or (2) **move
toward AP** — switch that standby to *asynchronous* replication so the primary
commits without waiting, keeping writes available during a partition at the
cost that the standby can fall behind and a failover could lose the last
un-replicated transactions (replication lag / possible data loss — module 08).
"Never hang and never lose data during a partition" is exactly what CAP proves
is impossible. The team must choose which failure they can live with.

</details>

## Independent challenge

No code given. You're designing the persistence for a **movie-ticket booking**
feature. Two guarantees are in tension: (1) a specific seat must never be sold
to two people, and (2) the "browse showtimes and available seats" page must
stay fast and available even under heavy load and occasional infrastructure
hiccups.

Write a short design note that: (a) identifies which operations need strong
ACID guarantees and *which specific letters* matter most for each (be precise —
e.g. "the seat-reservation write needs Atomicity because... and Isolation
because..."); (b) states where you'd accept weaker/eventual consistency and
why that's safe there; and (c) frames the seat-booking write as a CP-vs-AP
decision and commits to one, justifying it. Reach back to module 00: is a
single relational store the right system of record here, and why? Name the ACID
anomaly from this module that would directly cause a double-booking if
isolation were too weak.

<details>
<summary>Hint</summary>

The seat-availability *browse* page can be AP / eventually consistent — a
seat showing as "available" that was grabbed a half-second ago is annoying but
recoverable (you just fail at the confirm step). The seat-*reservation* write
is the CP-critical path: it needs Atomicity (reserve seat + create booking +
take payment hold as one unit) and strong Isolation (two concurrent bookings of
the same seat must not both succeed). The specific anomaly that produces a
double-booking is the **lost update** (or a phantom, if you're checking
"is this seat free?" and inserting) — exactly what you reproduced in exercise 5,
and exactly what module 04's `SELECT ... FOR UPDATE` and serializable isolation
exist to prevent.

</details>

## Common mistakes & troubleshooting

- **Confusing ACID's "C" with CAP's "C".** They are different guarantees with
  the same first letter. ACID consistency = "the transaction respects the
  database's declared constraints." CAP consistency = "all nodes agree on the
  latest value (linearizability)." Mixing them up makes every CAP conversation
  incoherent.
- **Reciting "CAP: pick two of three."** Partition tolerance isn't a free
  choice — networks fail whether you like it or not. The real content is: *when
  a partition happens, sacrifice C or A.* A "CA" system is just "a single node,"
  which stops being distributed.
- **Thinking CAP applies all the time.** It only forces the C-vs-A trade-off
  *during a partition*. Normal operation lets you have both — the everyday
  trade-off is latency vs consistency (PACELC's "else" branch).
- **Assuming a transaction guarantees success.** Atomicity guarantees
  all-or-nothing, not all. A transaction can legitimately fail and roll back;
  your code must handle that and retry or report it.
- **Silently weakening durability.** `synchronous_commit = off` or async
  replication trade durability for speed. Sometimes correct — but know you've
  made the trade, or a crash will "lose" transactions your users saw succeed.
- **Wrapping unrelated statements in one transaction "to be safe."** A
  transaction is a *correctness* boundary (these things must succeed or fail
  together), not a performance wrapper. Overly long transactions hold locks and
  hurt concurrency (module 04).

## Checkpoint quiz

Write down your answer to each question before expanding it — checking without attempting first is the single easiest way to fool yourself into thinking you've learned this.

1. State each ACID letter in one line, and for atomicity and durability name
   the concrete corruption you get without it.
2. ACID "C" and CAP "C" are both called "consistency." Define each precisely
   and say how they differ.
3. What is the write-ahead log (WAL) and which ACID property does it implement?
4. Restate the CAP theorem correctly, and explain why "pick two of three" is a
   misleading phrasing.
5. During a network partition, describe the concrete behaviour of a CP system
   versus an AP system for a write that arrives at a node that can't reach its
   peers.
6. What does PACELC add to CAP, and why does it matter even when the network is
   perfectly healthy?

<details>
<summary>Answers</summary>

1. **Atomicity** — all-or-nothing; without it a crash mid-transaction leaves a
   half-done state (money debited but never credited). **Consistency** — a
   transaction only commits states that satisfy declared constraints.
   **Isolation** — concurrent transactions don't corrupt each other. **Durability**
   — once `COMMIT` succeeds the change survives a crash; without it a user sees
   "saved" and a crash loses it.
2. ACID "C": a transaction moves the DB from one valid state to another, where
   validity = your declared constraints (types, uniqueness, FKs, checks). CAP
   "C" (linearizability): every read across all nodes reflects the most recent
   write. ACID's is about a single transaction respecting rules; CAP's is about
   multiple nodes agreeing on the current value.
3. An append-only on-disk log of changes, flushed to durable storage *before*
   the changes hit the main data files; on restart after a crash it's replayed
   to recover committed transactions. It implements durability (and underpins
   atomicity by allowing rollback/redo).
4. When a network partition occurs, a distributed system must sacrifice either
   consistency or availability — it cannot keep both. "Pick two of three" is
   misleading because partition tolerance isn't optional (networks fail
   regardless), so the real choice is only C-vs-A *when a partition happens*; a
   "CA" system is just a single non-distributed node.
5. A CP system refuses to serve the write (or would-be-stale reads) — returning
   errors/timeouts until the nodes can agree again — so it never gives a wrong
   answer. An AP system accepts the write locally and keeps serving reads
   (possibly stale) on all reachable nodes, reconciling the divergence after the
   partition heals.
6. PACELC adds: *else* (when there's no partition) you still trade **L**atency
   vs **C**onsistency. It matters because even in normal operation, keeping
   replicas strongly consistent costs latency (waiting for acknowledgements), so
   there's a consistency trade-off happening continuously, not only during
   failures.

</details>

## Further reading & sources

- [PostgreSQL: Transactions (tutorial)](https://www.postgresql.org/docs/current/tutorial-transactions.html) - how BEGIN/COMMIT/ROLLBACK give you atomicity in practice.
- [PostgreSQL: Reliability and the Write-Ahead Log](https://www.postgresql.org/docs/current/wal-intro.html) - exactly how the WAL delivers durability across crashes.
- [Julia Evans: The CAP theorem](https://jvns.ca/blog/2016/10/23/cap-theorem/) - a short, honest explainer that dismantles the "pick two of three" myth.
- [Martin Kleppmann: Please stop calling databases CP or AP](https://martin.kleppmann.com/2015/05/11/please-stop-calling-databases-cp-or-ap.html) - why CAP is narrower and subtler than the marketing suggests.
- [PACELC theorem (overview)](https://en.wikipedia.org/wiki/PACELC_theorem) - the extension that captures the latency-vs-consistency trade-off even without a partition.
- [Designing Data-Intensive Applications (Kleppmann), Ch. 7-9](https://dataintensive.net/) - the definitive treatment of transactions, isolation, and distributed consistency.

## Next

[02-querying-and-joins](../02-querying-and-joins/README.md) — you now know the
guarantees a relational database makes; time to actually *ask it questions*.
You'll learn SQL querying and the join types in depth, including exactly which
join is silently wrong for a given question.
