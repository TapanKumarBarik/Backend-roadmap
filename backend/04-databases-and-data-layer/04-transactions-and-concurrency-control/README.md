# Module 04: Transactions and Concurrency Control

## Why this matters

In module 01 you reproduced a lost update and were told "isolation is the letter
that makes concurrency safe, and you choose how strong it is." This is the
module that cashes that promise. It's the single most under-understood topic in
backend engineering, and the source of the nastiest production bugs — the kind
that pass every test (tests run one thing at a time) and only appear under real
concurrent load, corrupt data silently, and are nearly impossible to reproduce
after the fact.

The reason this is hard is that correctness under concurrency is *invisible* in
normal development. A query that reads a balance, adds to it, and writes it back
looks obviously correct — and it is, until two copies run at the same
millisecond. The database's **isolation level** is the dial that decides what
concurrent transactions can see of each other's half-finished work, and every
setting is a trade between safety and throughput. Get it wrong toward "too weak"
and you silently corrupt data; wrong toward "too strong" and you serialize
everything and throttle your app. On top of that sit **locking** (optimistic vs
pessimistic) and **deadlocks** — the situation where two transactions each wait
forever for a lock the other holds. Being able to *reason about* concurrency,
*reproduce* an anomaly deliberately, and *diagnose* a deadlock from the logs is
what separates engineers who ship correct systems from those who ship
race-condition generators.

## Concepts

### The three (four) classic read anomalies

The SQL standard defines isolation levels by which of these anomalies they
*permit*. You must be able to picture each concretely.

- **Dirty read:** transaction T1 reads a row that T2 has modified *but not yet
  committed*. If T2 rolls back, T1 acted on data that never officially existed.
  Example: T1 reads a balance of 0 (that T2 was mid-way through crediting, then
  aborted) and wrongly declines a purchase.
- **Non-repeatable read:** T1 reads a row, T2 commits an *update* to that row,
  T1 reads the *same row again* and gets a different value — within one
  transaction, the same query gave two answers. Example: T1 checks stock = 5,
  does some work, re-checks and now it's 3, and its logic assumed a stable read.
- **Phantom read:** T1 runs a query returning a *set* of rows (`WHERE status =
  'open'`), T2 *inserts* a new row matching that predicate and commits, T1
  re-runs the same query and a new "phantom" row appears. The difference from
  non-repeatable read: it's about rows *appearing/disappearing from a set*, not
  an existing row's value changing.
- **Lost update** (the one from module 01): two transactions read the same
  value, both compute a new value from it, both write — the second write
  clobbers the first. Not always listed among the "big three" but the most
  common one in web apps.

### The four isolation levels

Each level forbids more anomalies (and costs more concurrency). SQL-standard
definitions:

| Level | Dirty read | Non-repeatable read | Phantom read |
|---|---|---|---|
| Read Uncommitted | possible* | possible | possible |
| Read Committed | prevented | possible | possible |
| Repeatable Read | prevented | prevented | possible* |
| Serializable | prevented | prevented | prevented |

**The crucial Postgres-specific facts** (this is where the standard and reality
diverge, and it's a common interview and production trap):

- **`READ COMMITTED` is Postgres's default.** Each *statement* sees a fresh
  snapshot of data committed before that statement began. It prevents dirty
  reads but allows non-repeatable and phantom reads — and does *not* by itself
  prevent lost updates in a read-modify-write done in application code.
- **Postgres has no true Read Uncommitted** — requesting it behaves as Read
  Committed (Postgres never shows uncommitted data; the `*` above).
- **Postgres's `REPEATABLE READ` is snapshot isolation** and is *stronger* than
  the standard requires: it actually prevents phantom reads too (the `*` in the
  table). The whole transaction sees one consistent snapshot taken at its start.
  Its distinctive behaviour: if two transactions modify the same row, the second
  to commit gets a **serialization failure** (`ERROR: could not serialize
  access`) and must retry.
- **`SERIALIZABLE`** in Postgres uses Serializable Snapshot Isolation (SSI): it
  guarantees the result is as if transactions ran one-at-a-time, detecting
  dangerous read/write patterns and aborting one with a serialization error.
  Strongest and safest; costs the most and forces you to write retry loops.

The practical takeaway: on Postgres you mostly live in **Read Committed** and
handle lost updates explicitly (locking or atomic SQL), and you reach for
**Repeatable Read / Serializable** when a transaction's correctness depends on a
stable view of multiple rows — accepting that you must catch serialization
failures and retry.

### Pessimistic locking: `SELECT ... FOR UPDATE`

**Pessimistic** locking assumes conflict is likely and prevents it by *locking
rows up front*. `SELECT ... FOR UPDATE` reads rows and takes a row-level write
lock; any other transaction that tries to `FOR UPDATE` or modify those rows
*blocks* until you commit or roll back. This is the direct fix for lost updates
when you must read-modify-write in application code:

```sql
BEGIN;
SELECT balance FROM accounts WHERE id = 'A' FOR UPDATE;  -- locks the row
-- ... compute new balance in app code ...
UPDATE accounts SET balance = 120 WHERE id = 'A';
COMMIT;                                                   -- releases the lock
```

A second transaction doing the same `SELECT ... FOR UPDATE` waits at that line
until the first commits, then reads the *updated* value — no lost update.
Variants: `FOR UPDATE SKIP LOCKED` (skip rows already locked — the classic
job-queue pattern, so N workers each grab different rows), and `FOR UPDATE
NOWAIT` (error immediately instead of waiting).

### Optimistic locking: version columns

**Optimistic** locking assumes conflict is *rare* and doesn't lock at all.
Instead you add a `version` (or `updated_at`) column, read it, and on write
require it to be unchanged — failing the write if someone else got there first:

```sql
-- read: balance=100, version=7
UPDATE accounts
SET    balance = 120, version = version + 1
WHERE  id = 'A' AND version = 7;     -- only succeeds if still version 7
-- if 0 rows were affected, someone else updated it → retry from a fresh read
```

If another transaction bumped the version to 8 first, your `UPDATE` matches 0
rows; your application detects "0 rows affected," re-reads, and retries. No locks
are held, so no blocking and no deadlocks — but you must write the
detect-and-retry logic, and it's only a good fit when conflicts are genuinely
rare (retries are cheap only if they're infrequent).

**Choosing:** pessimistic when contention is high or the critical section is
short and you can't afford retries (inventory decrement in a flash sale);
optimistic when contention is low and holding locks would hurt throughput
(editing a user profile — two people rarely edit the same profile at once).

### Deadlocks: what they are, how to avoid them

A **deadlock** is a cycle of waiting: T1 holds lock on row A and wants row B;
T2 holds lock on row B and wants row A. Neither can proceed. Postgres detects
the cycle automatically (after `deadlock_timeout`, default 1s), **kills one
transaction** with `ERROR: deadlock detected`, and lets the other proceed. Your
app must catch that error and retry the victim.

The single most effective prevention: **always acquire locks in a consistent
order.** If every transaction that touches accounts A and B locks them in id
order (lowest id first), the cycle can't form — whoever gets the lower id first
wins, and the other simply waits. Most real deadlocks come from two code paths
that lock the same rows in *different* orders. Other mitigations: keep
transactions short (hold locks briefly), and touch rows in a deterministic
order (e.g. `ORDER BY id` before locking multiple).

### Keep transactions short — the throughput lens

Everything above interacts with a simple operational truth: a transaction holds
its locks until it commits or rolls back, and while it holds them, other
transactions that need those rows wait. So a transaction that does slow work
while holding locks — calling an external API, waiting on user input, running a
huge unindexed query — throttles everyone contending for the same rows and makes
deadlocks more likely. Rules of thumb: open the transaction as late as possible,
do all slow/non-DB work *outside* it, lock rows in a consistent order, commit
promptly. This is the concurrency payoff of module 03's indexing too: a
well-indexed query inside a transaction holds locks for milliseconds instead of
seconds.

## Command reference

| Statement / setting | Purpose | Example |
|---|---|---|
| `BEGIN; ... COMMIT;` | Transaction boundary | see module 01 |
| `SET TRANSACTION ISOLATION LEVEL ...` | Set level for current txn | `SET TRANSACTION ISOLATION LEVEL SERIALIZABLE;` |
| `BEGIN ISOLATION LEVEL REPEATABLE READ;` | Start txn at a level | (per-transaction) |
| `SELECT ... FOR UPDATE` | Pessimistic row lock | `SELECT * FROM accounts WHERE id='A' FOR UPDATE;` |
| `... FOR UPDATE SKIP LOCKED` | Skip already-locked rows (queues) | job-queue pattern |
| `... FOR UPDATE NOWAIT` | Error instead of waiting | fail-fast lock |
| `... FOR SHARE` | Shared (read) lock | block writers, allow readers |
| `SET lock_timeout = '2s';` | Cap how long to wait for a lock | avoid indefinite blocking |
| `SHOW deadlock_timeout;` | How long before deadlock detection runs | default 1s |
| `pg_locks` / `pg_stat_activity` | Inspect held/awaited locks & blocking | diagnose contention |
| `pg_blocking_pids(pid)` | Which PIDs block a given PID | `SELECT pg_blocking_pids(12345);` |

Concurrency control in SQLAlchemy:

```python
from sqlalchemy import select, update
from sqlalchemy.orm import Session
from sqlalchemy.exc import OperationalError  # serialization / deadlock failures surface here

# Pessimistic: with_for_update() emits SELECT ... FOR UPDATE
def debit(session: Session, account_id: str, amount: int) -> None:
    acct = session.execute(
        select(Account).where(Account.id == account_id).with_for_update()
    ).scalar_one()
    if acct.balance < amount:
        raise InsufficientFunds()
    acct.balance -= amount
    session.commit()

# Serializable + retry loop: the correct shape for high-isolation code
def run_serializable(engine, work) -> None:
    for attempt in range(3):
        try:
            with Session(engine) as s:
                s.connection(execution_options={"isolation_level": "SERIALIZABLE"})
                work(s)
                s.commit()
                return
        except OperationalError:   # serialization_failure / deadlock_detected
            continue               # retry from scratch on a fresh snapshot
    raise RuntimeError("gave up after retries")
```

Optimistic locking is built into SQLAlchemy's ORM via `version_id_col`:

```python
class Account(Base):
    __tablename__ = "accounts"
    id:      Mapped[str] = mapped_column(primary_key=True)
    balance: Mapped[int]
    version: Mapped[int] = mapped_column(nullable=False)
    __mapper_args__ = {"version_id_col": version}
    # SQLAlchemy auto-adds "AND version = :old" to UPDATEs and raises
    # StaleDataError if 0 rows matched (someone else won the race).
```

## Hands-on exercises

You need **two** psql sessions side by side for most of these — the whole point
is concurrency. Open two terminals, each running `docker exec -it pg-data psql
-U postgres -d shop`. Label them S1 and S2. Reset the accounts table:

```sql
DROP TABLE IF EXISTS accounts;
CREATE TABLE accounts (id TEXT PRIMARY KEY, balance INTEGER NOT NULL, version INT NOT NULL DEFAULT 0);
INSERT INTO accounts VALUES ('A', 100, 0), ('B', 100, 0);
```

### 1. Reproduce a non-repeatable read under Read Committed

**S1:**
```sql
BEGIN;  -- default READ COMMITTED
SELECT balance FROM accounts WHERE id = 'A';   -- 100
```
**S2:**
```sql
UPDATE accounts SET balance = 175 WHERE id = 'A';   -- autocommits
```
**S1 again (same open transaction):**
```sql
SELECT balance FROM accounts WHERE id = 'A';   -- now 175!
COMMIT;
```

Expected: within S1's single transaction, the same query returned 100 then 175 —
a non-repeatable read, which Read Committed permits.

### 2. Watch Repeatable Read give a stable snapshot

**S1:**
```sql
BEGIN ISOLATION LEVEL REPEATABLE READ;
SELECT balance FROM accounts WHERE id = 'A';   -- 175
```
**S2:**
```sql
UPDATE accounts SET balance = 200 WHERE id = 'A';
```
**S1 again:**
```sql
SELECT balance FROM accounts WHERE id = 'A';   -- STILL 175 (snapshot from txn start)
COMMIT;
SELECT balance FROM accounts WHERE id = 'A';   -- now sees 200 (new txn)
```

Expected: under Repeatable Read, S1 keeps seeing 175 for its whole transaction —
one consistent snapshot — even though S2 committed a change. The repeat is now
repeatable.

### 3. Trigger a serialization failure

Reset A to 100. **S1** and **S2** both under Repeatable Read update the same row:

**S1:** `BEGIN ISOLATION LEVEL REPEATABLE READ; UPDATE accounts SET balance = balance + 10 WHERE id = 'A';`
**S2:** `BEGIN ISOLATION LEVEL REPEATABLE READ; UPDATE accounts SET balance = balance + 20 WHERE id = 'A';`  (this blocks)
**S1:** `COMMIT;`
**S2:** now unblocks — expect `ERROR: could not serialize access due to concurrent update`.

Expected: S2 is aborted with a serialization failure. This is the signal your
app must catch and retry. `ROLLBACK` S2 and retry it — it now succeeds on a
fresh snapshot.

### 4. Reproduce the lost update (module 01 redux), then fix it

Reset A to 100. Do a read-modify-write in *application style* across two
sessions:

**S1:** `BEGIN; SELECT balance FROM accounts WHERE id='A';` → reads 100
**S2:** `BEGIN; SELECT balance FROM accounts WHERE id='A';` → reads 100
**S1:** `UPDATE accounts SET balance = 100 + 10 WHERE id='A'; COMMIT;` → 110
**S2:** `UPDATE accounts SET balance = 100 + 25 WHERE id='A'; COMMIT;` → 125

Expected: A = 125, and S1's +10 is lost (should have been 135). Now fix it with
pessimistic locking — redo with `SELECT ... FOR UPDATE`:

**S1:** `BEGIN; SELECT balance FROM accounts WHERE id='A' FOR UPDATE;` → 100 (locks row)
**S2:** `BEGIN; SELECT balance FROM accounts WHERE id='A' FOR UPDATE;` → **blocks**
**S1:** `UPDATE accounts SET balance = 100 + 10 WHERE id='A'; COMMIT;` → 110
**S2:** now unblocks and reads **110** → `UPDATE accounts SET balance = 110 + 25 WHERE id='A'; COMMIT;` → 135

Expected: A = 135. No update lost, because S2 was forced to wait and re-read the
committed value.

### 5. The simplest fix of all: atomic SQL

Reset A to 100. Note that the entire lost-update problem in exercise 4 came from
reading the value into the app and computing there. If you compute *in SQL*, no
read-modify-write race exists:

```sql
-- run this concurrently from both sessions; no locking ceremony needed
UPDATE accounts SET balance = balance + 10 WHERE id = 'A';
```

Expected: run from both sessions, A ends at 120 — both increments applied,
nothing lost. `balance = balance + 10` is atomic at the row level. Lesson: reach
for locking only when you genuinely must compute in application code; often the
best fix is to let the database do the arithmetic.

### 6. Optimistic locking with a version column

Reset. Simulate two clients that both read version 0 and try to write:

```sql
-- both clients read: balance=100, version=0
-- client 1 commits first:
UPDATE accounts SET balance = 110, version = 1 WHERE id='A' AND version = 0;  -- 1 row
-- client 2, still thinking version is 0:
UPDATE accounts SET balance = 125, version = 1 WHERE id='A' AND version = 0;  -- 0 rows!
```

Expected: client 1's update affects 1 row; client 2's affects **0 rows** (the
`version = 0` no longer matches). Client 2's application sees "0 rows affected,"
re-reads (balance 110, version 1), and retries. No locks were held.

### 7. Deadlock: create one on purpose

Reset. Two sessions lock the two rows in *opposite* orders:

**S1:** `BEGIN; UPDATE accounts SET balance = balance - 1 WHERE id = 'A';`  (locks A)
**S2:** `BEGIN; UPDATE accounts SET balance = balance - 1 WHERE id = 'B';`  (locks B)
**S1:** `UPDATE accounts SET balance = balance + 1 WHERE id = 'B';`  (wants B — blocks on S2)
**S2:** `UPDATE accounts SET balance = balance + 1 WHERE id = 'A';`  (wants A — cycle!)

Expected: after ~1 second Postgres detects the cycle and one session gets
`ERROR: deadlock detected`, while the other proceeds. `ROLLBACK` the survivor.
Now redo it with **both** sessions locking A *before* B (consistent order) — the
deadlock cannot form; the second session simply waits and then proceeds.

### 8. Inspect who's blocking whom

Recreate a simple block (S1 holds a `FOR UPDATE` on A and doesn't commit; S2
tries `FOR UPDATE` on A and hangs). In a *third* session:

```sql
SELECT pid, wait_event_type, state, query
FROM   pg_stat_activity
WHERE  state <> 'idle';

SELECT pid, pg_blocking_pids(pid) AS blocked_by
FROM   pg_stat_activity
WHERE  cardinality(pg_blocking_pids(pid)) > 0;
```

Expected: you can see S2's PID blocked, and `pg_blocking_pids` names S1's PID as
the blocker. This is exactly how you diagnose a "the app is hanging" incident in
production. `COMMIT`/`ROLLBACK` S1 to release.

### 9. Diagnose and fix: intermittent deadlocks in a transfer service

A money-transfer endpoint occasionally logs `deadlock detected` under load and
customers see 500s. The code, per request, does: `BEGIN;` then `UPDATE accounts
... WHERE id = :from;` then `UPDATE accounts ... WHERE id = :to;` `COMMIT;`.
Transfers go both directions between the same popular accounts. Explain the root
cause and give the two-part fix.

<details>
<summary>Answer</summary>

Root cause: the transaction locks the `from` account first, then the `to`
account. When two simultaneous transfers go in opposite directions — one A→B,
one B→A — the first locks A then wants B, the second locks B then wants A: a
classic lock-ordering cycle, i.e. a deadlock. The fix has two parts: (1)
**acquire locks in a consistent order regardless of transfer direction** — sort
the two account ids and always lock the lower id first (e.g. `SELECT ... WHERE
id IN (:a,:b) ORDER BY id FOR UPDATE`), so no cycle can form; and (2) since
deadlocks (and serialization failures) can never be 100% designed away under
enough concurrency, **wrap the transaction in a retry loop** that catches the
deadlock error and retries a bounded number of times. Consistent lock ordering
removes almost all of them; the retry loop handles the residue safely. Also keep
the transaction short so locks are held briefly.

</details>

## Independent challenge

No code given. Build a correct **"claim a job from a queue"** mechanism: a
`jobs` table where many worker processes concurrently try to grab the next
available job, run it, and mark it done — and *no two workers may ever grab the
same job*. Implement the claim as a single correct SQL statement (hint lives in
the command reference), then reason explicitly about: which isolation level you
rely on; whether you chose pessimistic or optimistic and why; what happens if a
worker crashes mid-job (does the job get stuck "claimed" forever, and how would
you recover it); and why a naive `SELECT the oldest pending job; UPDATE it to
claimed` in two steps is *wrong* under concurrency. Reach back to module 03: what
index makes "find the next available job" fast, and to module 01: name the exact
anomaly that the naive two-step version would suffer.

<details>
<summary>Hint</summary>

The naive two-step (`SELECT` then `UPDATE`) lets two workers both read the same
"oldest pending" row before either updates it — a lost update / race that hands
the same job to two workers. The correct primitive is `SELECT ... FOR UPDATE
SKIP LOCKED LIMIT 1` inside a transaction: it atomically locks *and skips*
rows other workers have already locked, so each worker gets a different job. For
crash recovery, a `claimed_at` timestamp plus a reaper that resets jobs claimed
longer than some timeout back to pending handles stuck jobs. The fast lookup
wants a partial index like `(created_at) WHERE status = 'pending'`.

</details>

## Common mistakes & troubleshooting

- **Assuming a transaction alone prevents lost updates.** It doesn't — under the
  default Read Committed, two read-modify-write transactions can still clobber
  each other. Use atomic SQL (`col = col + n`), `SELECT ... FOR UPDATE`, or a
  higher isolation level.
- **Read-modify-write in application code without a lock.** The textbook lost
  update. If you must compute in the app, take a `FOR UPDATE` lock or use an
  optimistic version column; otherwise push the computation into SQL.
- **Forgetting to catch serialization/deadlock errors.** Repeatable Read and
  Serializable *will* raise `could not serialize access`, and any concurrent
  workload *will* occasionally deadlock. Code that doesn't retry these turns
  normal, expected contention into user-visible 500s.
- **Locking rows in inconsistent order across code paths.** The number-one cause
  of real deadlocks. Always lock multiple rows in a deterministic order (e.g.
  by primary key).
- **Long transactions holding locks.** Calling an external API or waiting on
  user input inside a transaction holds locks the whole time, throttling
  everyone and inviting deadlocks. Do slow work outside the transaction; open
  late, commit promptly.
- **Reaching for `SERIALIZABLE` everywhere "to be safe."** It's the strongest
  and the most expensive, and it forces retry loops everywhere. Use the weakest
  level that's actually correct for the specific transaction.
- **Confusing optimistic and pessimistic use cases.** Pessimistic locking under
  low contention needlessly serializes; optimistic locking under high contention
  causes a storm of retries. Match the strategy to the contention level.

## Checkpoint quiz

Write down your answer to each question before expanding it — checking without attempting first is the single easiest way to fool yourself into thinking you've learned this.

1. Define dirty read, non-repeatable read, and phantom read, and say what
   distinguishes a phantom from a non-repeatable read.
2. What is Postgres's default isolation level, which anomalies does it prevent,
   and which does it still allow?
3. In what two ways is Postgres's `REPEATABLE READ` different from the bare SQL
   standard, and what error must your code be ready to handle at that level?
4. Explain the difference between optimistic and pessimistic locking, and give
   one scenario where each is the right choice.
5. You must read a balance, compute a new value in Python, and write it back,
   with concurrent callers. Give three distinct correct approaches.
6. What exactly is a deadlock, what does Postgres do when it detects one, and
   what is the single most effective way to prevent them?
7. Why does keeping transactions short improve both throughput and deadlock
   rates?

<details>
<summary>Answers</summary>

1. Dirty read: reading another transaction's *uncommitted* change (which may be
   rolled back). Non-repeatable read: re-reading the *same row* in one
   transaction and getting a different value because another transaction
   committed an update. Phantom read: re-running a *set* query and finding new
   rows that another transaction inserted. The distinction: non-repeatable is an
   existing row's value changing; phantom is rows appearing/disappearing from a
   result set.
2. Default is **Read Committed**. It prevents dirty reads (each statement sees
   only committed data) but still allows non-repeatable reads, phantom reads,
   and application-level lost updates.
3. (a) It's snapshot isolation covering the whole transaction, and it *also*
   prevents phantom reads (stronger than the standard requires); (b) if two
   transactions update the same row, the later committer gets a **serialization
   failure** rather than silently proceeding. Your code must catch `could not
   serialize access` and retry.
4. Pessimistic locks rows up front (`FOR UPDATE`) so conflicting transactions
   block — good under high contention / short critical sections (inventory
   decrement). Optimistic doesn't lock; it uses a version check and retries on
   conflict — good under low contention (profile edits) where locking would
   needlessly block.
5. (a) Push the computation into atomic SQL (`balance = balance + n`); (b)
   pessimistic lock with `SELECT ... FOR UPDATE` before computing; (c) optimistic
   locking with a `version` column and a detect-0-rows-and-retry loop (or a
   higher isolation level with a retry loop).
6. A deadlock is a cycle of transactions each waiting on a lock the other holds,
   so none can proceed. Postgres detects the cycle (after `deadlock_timeout`)
   and aborts one transaction with `deadlock detected`, letting the others run.
   The most effective prevention is acquiring locks in a consistent order across
   all code paths.
7. A transaction holds its locks until commit/rollback; shorter transactions
   release locks sooner, so contending transactions wait less (higher
   throughput) and there's a smaller window in which the lock cycles that cause
   deadlocks can form.

</details>

## Next

[05-orms-and-migrations](../05-orms-and-migrations/README.md) — you've been
writing raw SQL by hand; now you'll use SQLAlchemy to map Python objects to
rows, understand what an ORM buys and costs you, and manage schema change over
time with Alembic migrations — including how to alter a live production table
without taking an outage.
</content>
</invoke>
