# Module 01: ACID and the CAP Theorem

## Why this matters

In module 00 you kept saying the relational database "guarantees integrity."
This module makes that word precise. **ACID** is the set of four guarantees a
transactional database makes, and every one of them exists because a specific,
nasty class of bug happens when it's absent. If you can't state what each
letter means *and* describe the exact corruption you get when it breaks, you
don't actually understand why you're using a transaction — you're just wrapping
things in `BEGIN`/`COMMIT` as a ritual.

The second half is a short look ahead. Once your data lives on more than one
machine (a read replica in module 08, or a distributed database), a different
set of promises applies, described by the **CAP theorem**. ACID is about a
single node keeping its promises; CAP is about which promises are even
*possible* once there are several nodes. This module only places CAP next to
ACID; the full treatment lives in the System Design lessons linked below.

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

### Beyond one node: where CAP fits

ACID describes one database. Once the same data is copied to several nodes,
the **CAP theorem** applies: *when the network between the nodes breaks, the
system must either refuse requests (stay consistent) or answer with possibly
stale data (stay available).* "Pick two of three" is a myth, because network
partitions are not optional. Watch the two meanings of "consistency": ACID's C
is "this database honours its declared constraints"; CAP's C is
**linearizability**, "every read on every node sees the latest write". A
single-node database is ACID-consistent with no replicas at all, and a read
replica can serve a row that is perfectly valid and still stale. That staleness
(replication lag, and the read-your-writes bugs it causes) is what you meet in
module 08.

The distributed side is taught in its own lessons, each with a video:
[CAP Theorem](../../../system-design/01-core-fundamentals/13-cap-theorem/README.md) (what it really says, CP vs AP),
[PACELC Theorem](../../../system-design/01-core-fundamentals/14-pacelc-theorem/README.md) (the latency-vs-consistency trade-off when nothing is
broken) and [Consistency Models](../../../system-design/01-core-fundamentals/15-consistency-models/README.md) (strong, causal, eventual and
read-your-writes).

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

For CP-vs-AP practice, including diagnosing a Postgres primary whose writes
hang during a network blip, see the exercises in [CAP Theorem](../../../system-design/01-core-fundamentals/13-cap-theorem/README.md#practice).

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

</details>

## Further reading & sources

- [PostgreSQL: Transactions (tutorial)](https://www.postgresql.org/docs/current/tutorial-transactions.html) - how BEGIN/COMMIT/ROLLBACK give you atomicity in practice.
- [PostgreSQL: Reliability and the Write-Ahead Log](https://www.postgresql.org/docs/current/wal-intro.html) - exactly how the WAL delivers durability across crashes.
- [Designing Data-Intensive Applications (Kleppmann), Ch. 7-9](https://dataintensive.net/) - the definitive treatment of transactions, isolation, and distributed consistency.

## Free PDF notes

Download these notes as a printable PDF, with every diagram and interview questions: [SD-E-008: ACID Explained](https://backendroadmap.com/notes/system-design/SD-E-008.pdf). Each section in one file: [Phase 2, Databases (PDF)](https://backendroadmap.com/notes/system-design/Phase2_Databases_Notes.pdf).

## Next

[02-querying-and-joins](../02-querying-and-joins/README.md) — you now know the
guarantees a relational database makes; time to actually *ask it questions*.
You'll learn SQL querying and the join types in depth, including exactly which
join is silently wrong for a given question.
