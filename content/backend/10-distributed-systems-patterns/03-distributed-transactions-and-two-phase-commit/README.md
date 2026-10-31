# Module 03: Distributed Transactions and Two-Phase Commit

## Why this matters

In track 04 you learned to trust database transactions: wrap your work in `BEGIN
... COMMIT`, and either every change lands or none does. Atomicity was a solved
problem — the database gave it to you for free. That guarantee quietly depended on
one fact: *all the data lived in one database*. The moment your operation must span
two databases, or a database and a payment provider, or three microservices that
each own their own store, that free atomicity evaporates. There is no `BEGIN` that
wraps "charge the card AND decrement inventory AND create the shipment" when those
three things live in three different systems. If the charge succeeds and the
inventory decrement fails, you've taken someone's money for stock you don't have.

**Two-phase commit (2PC)** is the classic, textbook answer to this: a protocol that
tries to give you the same all-or-nothing atomicity *across* multiple systems. You
need to understand it deeply — not because you'll reach for it often (you usually
shouldn't), but because understanding *why 2PC is the "obvious" answer and why it
scales so badly* is exactly what motivates the saga pattern in the next module. The
most valuable thing this module teaches isn't how to run a 2PC; it's the judgment to
recognize when you're staring at a genuine distributed-transaction problem, and to
know that the right move is almost always to *restructure the problem so you don't
need one* — because the honest reality is that most "we need a distributed
transaction" situations are better solved by not having one.

## Concepts

### The problem: atomicity across independent systems

A local transaction's atomicity comes from a single resource manager (the database)
controlling a single write-ahead log: it can flip every change to "committed" in one
durable act, or discard them all. A **distributed transaction** is any unit of work
whose changes span *multiple* independent resource managers that don't share that
log — two Postgres instances, a Postgres and a message broker, three services each
with their own DB. The question 2PC answers: *how do N independent systems agree to
either all commit or all abort, so no subset commits while the rest roll back?*

The naive approach — "commit to system A, then commit to system B" — is broken the
instant A commits and B fails: A is now committed and unrollbackable, B has nothing,
and your invariant is violated with no clean recovery. You need a protocol where no
participant *finalizes* its commit until *all* of them have promised they can. That
promise-then-commit structure is exactly two-phase commit.

### How two-phase commit works

2PC introduces a **coordinator** (a transaction manager) that orchestrates a set of
**participants** (the resource managers). It runs in two phases:

**Phase 1 — Prepare (voting).** The coordinator sends `PREPARE` to every
participant. Each participant does all the work needed to commit — writes the
changes to its log, takes the locks, validates constraints — *but does not commit*.
It then replies `YES` ("I am prepared; I promise I can commit this if you tell me
to, even if I crash and restart") or `NO` ("I can't"). Critically, a `YES` vote is a
*binding promise*: the participant must hold its locks and keep the prepared state
durably recoverable until it hears the final decision. It has given up its right to
unilaterally abort.

**Phase 2 — Commit/Abort (decision).** If *all* participants voted `YES`, the
coordinator durably records "COMMIT" and sends `COMMIT` to everyone; each finalizes
and releases locks. If *any* voted `NO` (or timed out), the coordinator records
"ABORT" and sends `ABORT`; everyone discards the prepared work. Either way, once the
coordinator has decided, that decision is final and it retries delivery until every
participant acknowledges.

```
                       ┌─────────────┐
                       │ Coordinator │
                       └──────┬──────┘
   Phase 1: PREPARE ─────────►│──►  P1   P2   P3      (do work, hold locks)
            vote YES/NO ◄─────│◄──  YES  YES  YES     (binding promise)
                              │
   Phase 2: COMMIT ──────────►│──►  P1   P2   P3      (finalize, release locks)
                              │
                    ✗ coordinator CRASHES here?
                      P1/P2/P3 BLOCK holding locks — can't commit, can't abort —
                      until it recovers and reveals the decision
```

The guarantee this buys: no participant commits unless *all* promised they could, so
you never get a partial commit — real atomicity across systems. Postgres implements
its side of this with `PREPARE TRANSACTION 'gid'` (phase 1) and `COMMIT PREPARED
'gid'` / `ROLLBACK PREPARED 'gid'` (phase 2); the XA standard is the cross-vendor
version. This works, and it's genuinely atomic. The trouble is everything it costs.

### Why 2PC doesn't scale: blocking, latency, and locks

2PC is correct but operationally heavy, for reasons that get worse as you add
participants and load:

- **Locks are held across the entire protocol.** A participant that voted `YES`
  holds its locks from `PREPARE` until it receives the final decision — across
  *multiple network round-trips* to the coordinator and back to every other
  participant. Compare this to a local transaction that holds locks for
  microseconds. Under contention, holding locks for the full 2PC duration
  murders throughput (recall from track 04 module 04: held locks are the enemy of
  concurrency), and it does so on *every* participating system at once.
- **Latency is the sum of the slowest paths, twice.** Two phases means at least two
  round-trips to every participant; the transaction is only as fast as its slowest
  participant, and it can't return until phase 2 completes. Every distributed
  transaction pays this.
- **It's synchronous and tightly coupled.** All participants must be *up and
  reachable for the whole protocol*. If one is slow or down, everyone else waits
  with locks held. This directly contradicts the reason you split into services in
  the first place (independent availability) — 2PC re-couples their availability.

The result: 2PC works fine for a handful of participants in a controlled
environment (some financial systems, XA across a couple of databases) but degrades
sharply as you scale out, and it fights against the whole point of a
service-oriented architecture. That's why high-scale systems overwhelmingly avoid
it.

### The coordinator problem: the fatal single point of failure

2PC's deepest flaw isn't performance — it's a correctness-under-failure gap called
the **blocking problem**, and it centers on the coordinator. Consider the worst
moment: participants have all voted `YES` (so they're holding locks, having given up
their right to abort), and *then the coordinator crashes* before sending the phase-2
decision. Now every participant is stuck: it can't commit (it wasn't told to), and
it can't abort (it promised not to). It must **block — holding its locks —
indefinitely, until the coordinator recovers** and tells it the decision. The
participants can't even ask each other, because in general they don't know whether
the coordinator had already told *someone else* to commit before it died.

This is why 2PC is called a **blocking protocol**: a coordinator failure at the wrong
moment freezes all participants with locks held. The coordinator is a **single point
of failure** whose crash can wedge every participant. Mitigations exist —
persist the coordinator's decision log so it can recover and resume, run the
coordinator as a replicated highly-available service, use 3PC (three-phase commit,
which adds a phase to reduce but not eliminate blocking) — but they add complexity
and none fully removes the fundamental coupling. The lesson: 2PC trades the
independent failure of services for a shared fate mediated by a fragile coordinator.

### When you actually need it — and the usual escape hatch

Given all that, when *is* 2PC the right tool? Rarely, and only when *all* of these
hold: you genuinely need strict, immediate atomicity across systems (no window of
inconsistency is tolerable); the participants support a prepare/commit protocol (XA,
`PREPARE TRANSACTION`); the number of participants is small; and they're within one
administrative/latency domain (not a chatty call across the public internet to a
third party). Classic fits: moving money between two accounts in two different
databases you own, where an intermediate inconsistent state is legally unacceptable.

Far more often, the right move is to **avoid the distributed transaction entirely**,
via one of:

- **Don't distribute the data.** The strongest option: keep the data that must
  change atomically *in one database*, so a single local transaction suffices. A
  huge fraction of "we need 2PC" is really "we split our data across services too
  eagerly." One transaction in one DB beats any distributed protocol.
- **Accept eventual consistency with a saga** (next module). Instead of one atomic
  cross-system commit, run a *sequence* of local transactions, each committing
  independently, with **compensating transactions** to undo earlier steps if a
  later one fails. You give up instantaneous atomicity (there's a window where the
  system is partially updated) in exchange for availability, loose coupling, and no
  blocking coordinator. This is what most microservice systems actually do.
- **Transactional outbox + idempotent consumers** (tracks 06 and 01). Commit your
  DB change and an "event to publish" row in *one local transaction*, then deliver
  the event asynchronously to the other system with at-least-once + idempotency.
  This gives atomicity between "my DB changed" and "the event will be sent" without
  a distributed transaction at all.

The senior instinct: when you feel the urge to reach for a distributed transaction,
first ask "can I make this one local transaction?" and if not, "can I tolerate a
brief window of inconsistency in exchange for a saga?" The answer is almost always
yes, and almost always better than 2PC.

## Command reference

| Concept | Mechanism | Notes |
|---|---|---|
| Phase 1 (prepare) | `PREPARE TRANSACTION 'gid'` (Postgres) | writes changes durably, holds locks, does *not* commit |
| Phase 2 (commit) | `COMMIT PREPARED 'gid'` | finalize a prepared transaction |
| Phase 2 (abort) | `ROLLBACK PREPARED 'gid'` | discard a prepared transaction |
| Inspect prepared txns | `SELECT * FROM pg_prepared_xacts;` | see stuck/dangling prepared transactions |
| Enable in Postgres | `max_prepared_transactions > 0` | off by default; must be set to use 2PC |
| Cross-vendor standard | XA (`XA START`/`XA PREPARE`/`XA COMMIT`) | the DTP standard 2PC implementation |
| Escape hatch (preferred) | saga / outbox + idempotency | eventual consistency instead of blocking atomicity |

Postgres speaks the participant side of 2PC directly. A minimal two-database
"prepare on both, then commit on both" driven from Python (this is what a
coordinator does, by hand, to make the shape concrete):

```python
import uuid
from sqlalchemy import create_engine, text

# Two INDEPENDENT databases. We want the debit and credit to be all-or-nothing.
db_a = create_engine("postgresql+psycopg://app@bank-a:5432/bank")  # needs max_prepared_transactions>0
db_b = create_engine("postgresql+psycopg://app@bank-b:5432/bank")

def transfer_2pc(amount: int, from_acct: str, to_acct: str) -> None:
    gid_a = f"xfer-{uuid.uuid4()}-a"
    gid_b = f"xfer-{uuid.uuid4()}-b"
    conn_a = db_a.connect()
    conn_b = db_b.connect()
    try:
        # --- PHASE 1: do the work on each, then PREPARE (vote yes) ---
        conn_a.execute(text("BEGIN"))
        conn_a.execute(text("UPDATE accounts SET balance = balance - :amt "
                            "WHERE id = :id AND balance >= :amt"),
                       {"amt": amount, "id": from_acct})
        conn_a.execute(text(f"PREPARE TRANSACTION '{gid_a}'"))   # locks held from here

        conn_b.execute(text("BEGIN"))
        conn_b.execute(text("UPDATE accounts SET balance = balance + :amt "
                            "WHERE id = :id"), {"amt": amount, "id": to_acct})
        conn_b.execute(text(f"PREPARE TRANSACTION '{gid_b}'"))

        # --- PHASE 2: everyone voted yes -> COMMIT everyone ---
        # If the process dies HERE, both are 'prepared' and stuck holding locks
        # until a recovery process commits or rolls them back. That is the
        # blocking / coordinator-failure problem, made physical.
        conn_a.execute(text(f"COMMIT PREPARED '{gid_a}'"))
        conn_b.execute(text(f"COMMIT PREPARED '{gid_b}'"))
    except Exception:
        # Any prepare failed -> abort BOTH prepared transactions.
        for conn, gid in ((conn_a, gid_a), (conn_b, gid_b)):
            try:
                conn.execute(text(f"ROLLBACK PREPARED '{gid}'"))
            except Exception:
                pass
        raise
    finally:
        conn_a.close(); conn_b.close()
```

The preferred alternative for the *same* transfer, when both accounts can live in
one database — no distributed transaction at all:

```python
def transfer_local(db, amount: int, from_acct: str, to_acct: str) -> None:
    # One database, one transaction -> atomicity for free, no coordinator,
    # no prepared-state blocking, locks held for microseconds.
    with db.begin() as c:
        moved = c.execute(
            text("UPDATE accounts SET balance = balance - :amt "
                 "WHERE id = :f AND balance >= :amt"),
            {"amt": amount, "f": from_acct}).rowcount
        if moved != 1:
            raise ValueError("insufficient funds")
        c.execute(text("UPDATE accounts SET balance = balance + :amt WHERE id = :t"),
                  {"amt": amount, "t": to_acct})
```

## Hands-on exercises

You need **two** Postgres instances with `max_prepared_transactions` enabled. Run:
`docker run -d --name bank-a -p 5432:5432 -e POSTGRES_PASSWORD=pg postgres:16 -c
max_prepared_transactions=10` and the same for `bank-b` on port 5433. In each:
`CREATE TABLE accounts (id TEXT PRIMARY KEY, balance INT NOT NULL);` and seed
`INSERT INTO accounts VALUES ('alice', 100), ('bob', 0);` (put alice in bank-a, bob
in bank-b for the cross-DB exercises).

### 1. Confirm the free lunch of a single-DB transaction

In one database with both accounts, run `transfer_local` and force the second
`UPDATE` to fail (e.g. violate a constraint). Verify the debit is rolled back too.

Expected: atomicity with zero ceremony — the failure rolls back everything because
it's one transaction in one resource manager. This is the baseline every
distributed approach is trying (and failing) to match cheaply.

### 2. Manually run phase 1 and inspect the prepared state

In bank-a's psql: `BEGIN; UPDATE accounts SET balance = balance - 10 WHERE
id='alice'; PREPARE TRANSACTION 'x1';`. Then in a *second* psql session on bank-a,
run `SELECT * FROM pg_prepared_xacts;` and `SELECT balance FROM accounts WHERE
id='alice';`.

Expected: `pg_prepared_xacts` shows `x1`; the balance still reads 100 (the change is
prepared but *not committed*). The transaction is in limbo, holding its locks,
waiting for a phase-2 decision. This is precisely the "voted yes, promised, holding
locks" state.

### 3. Feel the lock held across prepare

While `x1` is still prepared (not committed) from exercise 2, in a third session try
`UPDATE accounts SET balance = balance + 5 WHERE id='alice';`.

Expected: it **blocks** — the prepared transaction holds a row lock that won't
release until you `COMMIT PREPARED 'x1'` or `ROLLBACK PREPARED 'x1'`. Now imagine
this lock held for the *entire* multi-round-trip 2PC across several systems, under
production contention. Commit it (`COMMIT PREPARED 'x1';`) and watch the blocked
update proceed.

### 4. Run a full cross-DB 2PC successfully

Implement `transfer_2pc` and move 10 from alice (bank-a) to bob (bank-b). Verify
alice=90, bob=10 across the two databases.

Expected: atomic transfer across two independent databases. It works — savor it,
because the next exercises show what it costs.

### 5. Reproduce the coordinator-crash blocking problem

Add a `raise SystemExit("crash")` (or a `kill -9` via a `sleep`) *between* the two
`PREPARE`s and the two `COMMIT PREPARED`s in `transfer_2pc`. Run it. Then inspect
`pg_prepared_xacts` on *both* databases and check the balances.

Expected: both transactions are stuck in `prepared` state, locks held, money neither
moved nor released — the databases are frozen on this data waiting for a decision
that never came. This is the blocking problem: a coordinator failure at the wrong
instant wedges every participant. Recover manually by deciding and running `COMMIT
PREPARED`/`ROLLBACK PREPARED` on both — note that *you* just played the recovery
coordinator, and that until you did, that row was unusable.

### 6. Reproduce a vote-NO abort

Make bank-a's debit fail its `PREPARE` (e.g. alice has insufficient funds — change
the `WHERE balance >= :amt` to affect 0 rows and add a check that raises). Confirm
the code rolls back the prepared transaction on bank-b too.

Expected: neither balance changes; both prepared transactions are cleaned up. A
single `NO` aborts the whole distributed transaction — the atomicity guarantee
working correctly in the failure direction.

### 7. Rewrite it to avoid the distributed transaction

Take exercise 4's transfer and redesign it so no 2PC is needed: put both accounts in
one database and use `transfer_local`. Then, for the case where the accounts
genuinely must live in separate services, *sketch* (in comments/pseudocode) how a
saga would do it — debit locally, publish a "debited" event, credit locally on the
other side, and compensate (re-credit) if the credit fails.

Expected: the single-DB version is dramatically simpler and faster and has no
blocking failure mode. The saga sketch shows the shape you'll build in module 04:
independent local commits plus compensation, accepting a brief inconsistent window.
Articulate the trade-off in one sentence.

### 8. Diagnose and fix: the frozen checkout

A team built checkout as a 2PC across three services — Orders, Payments, Inventory —
each with its own database, coordinated by a home-grown coordinator service.
Under Black Friday load, checkouts intermittently *hang* for minutes and rows in all
three databases become unmodifiable until an engineer intervenes; the coordinator's
logs show it restarted during the incident. Explain what happened and give the
architectural fix.

<details>
<summary>Answer</summary>

What happened: this is the **coordinator-failure blocking problem** at scale. Under
load the coordinator restarted (OOM, deploy, crash) at a moment when the three
participants had already voted `YES` in phase 1 — so all three were holding locks on
the order/payment/inventory rows, having promised to commit, waiting for a phase-2
decision. With the coordinator down, none could commit or abort; they blocked with
locks held until a human recovered the coordinator's decision. Compounding it, 2PC
holds locks across multiple round-trips to three services, so even without the
crash, throughput collapses under contention (the frozen rows are the popular
Black-Friday SKUs everyone is buying). The coordinator is a single point of failure
that wedges all participants.

Architectural fix: stop using 2PC for checkout. Restructure as a **saga** (module
04): each service performs a *local* transaction and emits an event; a later step's
failure triggers **compensating transactions** (refund the payment, release the
inventory reservation) rather than a synchronous cross-service rollback. This
removes the blocking coordinator and the cross-service lock-holding entirely — each
service commits independently in microseconds and stays available even if another is
slow. Combine with **idempotency** (module 01) so retried steps don't double-charge
and a **transactional outbox** so events aren't lost. You trade instant atomicity
for a brief, well-defined window of inconsistency (the order exists as "pending"
until payment+inventory confirm), which is exactly the trade a high-throughput
checkout should make. If any two of the three datasets can share one database,
collapsing them into a single local transaction is even better.

</details>

## Independent challenge

No code given. Reach back to **00-cap-theorem-and-consistency-models**: you'll weigh
consistency against availability here explicitly. You're designing the "place a bet"
operation for a sports-betting platform. Placing a bet must, together: debit the
user's wallet, create a bet record, and reserve liability against the event's risk
pool — and these three pieces of data are (as the system is currently built) owned
by three separate services with three separate databases. Write a design memo that:
(1) states whether this genuinely needs strict cross-system atomicity or can
tolerate a short inconsistent window, and defends the answer in terms of what a user
or the business would actually experience in the bad window; (2) if it needs strict
atomicity, describes the 2PC setup and *names the specific failure mode* you're
accepting (blocking on coordinator failure) and how you'd mitigate it; (3) proposes
the alternative — collapsing data into fewer databases and/or a saga — and argues
which you'd actually ship and why. Be concrete about the consistency model each
option gives the user.

<details>
<summary>Hint</summary>

Start by asking what a user actually experiences in the bad window. If the wallet
is debited but the bet record isn't yet created, the user momentarily sees money
gone and no bet — alarming, and if the event starts before it heals, genuinely
wrong. That argues the *debit and the bet record* want to be strongly consistent
together, which is the tell that they probably belong in **one** database (the
"don't distribute the data" escape hatch): collapse wallet + bets into one service
and one local transaction, and the hardest part of the problem disappears. The
liability reservation against the risk pool can then be a **saga** step with a
compensating "release liability" transaction, because a brief window where the bet
exists but liability isn't yet reserved is tolerable to the *business* (it's an
internal risk metric, not something the user sees) as long as it converges and is
idempotent. Reserve genuine 2PC only if regulation forbids any window at all across
systems you cannot merge — and if you do, name blocking-on-coordinator-failure as
the failure you're buying and mitigate with a persisted decision log and an HA
coordinator. The senior answer is almost never "2PC across three services"; it's
"merge the two that must be atomic, saga the third."

</details>

## Common mistakes & troubleshooting

- **Reaching for 2PC before trying to un-distribute the data.** The overwhelming
  majority of "we need a distributed transaction" problems are self-inflicted by
  splitting data across services too eagerly. Before any cross-system protocol, ask
  "can the pieces that must change atomically live in one database?" One local
  transaction beats any distributed commit on every axis — latency, availability,
  simplicity, failure modes.
- **Underestimating how long locks are held.** A local transaction holds locks for
  microseconds; a 2PC participant holds them from `PREPARE` until the phase-2
  decision arrives — across multiple network round-trips, and on *every* participant
  at once. Under contention on hot rows (the popular flash-sale SKU, the busy
  account) this collapses throughput long before anything crashes.
- **Treating the coordinator as reliable.** The coordinator is a single point of
  failure whose crash *between* phase 1 and phase 2 wedges every participant with
  locks held, unable to commit or abort until it recovers. If you run 2PC you must
  persist its decision log and make it highly available — and even then you've only
  reduced, not removed, the blocking window.
- **Forgetting participants can't self-heal after voting YES.** Once a participant
  votes `YES` it has surrendered its right to abort; it *must* block until told the
  decision. It can't ask its peers, because it doesn't know whether the coordinator
  already told someone else to commit. "The participants will just time out and
  roll back" is wrong and will split-brain your data.
- **Leaking prepared transactions in Postgres.** Every `PREPARE TRANSACTION` that is
  never resolved holds locks and pins the WAL forever, silently degrading the
  database. Monitor `pg_prepared_xacts`, alarm on dangling ones, and have a recovery
  procedure — an orphaned prepared transaction is an outage waiting to happen.
- **Using 2PC to talk to a third party over the internet.** 2PC needs all
  participants up, reachable, and speaking a prepare/commit protocol for the whole
  exchange. A chatty, high-latency, independently-owned external API (a payment
  provider) fits none of these. Use an idempotent call plus a saga/outbox, not XA.
- **Confusing "strict atomicity" the business *stated* with what it *needs*.**
  Stakeholders will say "these must be atomic" reflexively. Push on it: what does a
  user or the business actually experience during a one-second inconsistent window?
  Usually the honest answer makes a saga's eventual consistency perfectly
  acceptable, and 2PC's cost unjustified.

## Checkpoint quiz

Write down your answer to each question before expanding it — checking without attempting first is the single easiest way to fool yourself into thinking you've learned this.

1. Why does the "free" atomicity of a database transaction disappear the moment an
   operation spans two databases or a database and an external service?
2. Walk through the two phases of 2PC. What exactly does a `YES` vote in phase 1
   commit a participant to, and what has it given up?
3. Explain the coordinator-failure blocking problem: what state are participants in,
   why can't they resolve it themselves, and what does "blocking protocol" mean?
4. Give three distinct reasons 2PC scales poorly as you add participants and load.
5. Name the conditions under which 2PC is actually the right tool, and the three
   common alternatives you'd reach for instead in the far more usual case.
6. When would you accept a saga's brief window of inconsistency over 2PC's strict
   atomicity, and how do you decide? Give the concrete question you ask.

<details>
<summary>Answers</summary>

1. A local transaction's atomicity comes from a single resource manager controlling
   a single write-ahead log: it can flip every change to committed in one durable
   act or discard them all. When the work spans two independent systems that don't
   share that log, there is no single act that commits both — "commit A, then commit
   B" leaves you exposed the instant A commits and B fails, with A already durable
   and unrollbackable. Atomicity across independent resource managers is exactly the
   hard problem 2PC exists to solve.
2. Phase 1 (prepare/voting): the coordinator sends `PREPARE`; each participant does
   all the work — writes to its log, takes locks, checks constraints — but does
   *not* commit, then votes `YES` or `NO`. Phase 2 (decision): if all voted `YES`
   the coordinator durably records COMMIT and tells everyone to finalize; if any
   voted `NO` (or timed out) it records ABORT and everyone discards. A `YES` vote is
   a *binding promise* — the participant must keep the prepared state durably
   recoverable and hold its locks until it hears the decision, even across a crash
   and restart. It has given up its right to unilaterally abort.
3. Worst moment: all participants have voted `YES` (holding locks, having given up
   the right to abort) and then the coordinator crashes before sending the phase-2
   decision. Each participant can't commit (it wasn't told to) and can't abort (it
   promised not to), so it must block — holding its locks — until the coordinator
   recovers and reveals the decision. They can't resolve it among themselves because
   no participant knows whether the coordinator already told some *other* participant
   to commit before dying. "Blocking protocol" means a single failure at the wrong
   instant can freeze all participants indefinitely with locks held.
4. (Any three) Locks are held for the full protocol duration — across multiple
   round-trips, on every participant simultaneously — crushing throughput under
   contention. Latency is at least two round-trips to the slowest participant, paid
   on every transaction. It's synchronous and tightly coupled: all participants must
   be up and reachable for the whole exchange, so one slow/down participant stalls
   everyone, re-coupling the independent availability that services were split to
   gain. And the coordinator is a single point of failure that can wedge everyone.
5. 2PC is right only when *all* hold: you genuinely need strict immediate atomicity
   (no inconsistent window is tolerable), participants support prepare/commit (XA,
   `PREPARE TRANSACTION`), the participant count is small, and they're in one
   administrative/latency domain (not a chatty call to a third party over the
   internet). Otherwise: (a) don't distribute the data — keep atomically-changing
   data in one DB and use one local transaction; (b) a saga — a sequence of local
   transactions with compensating transactions, accepting eventual consistency; (c)
   transactional outbox + idempotent consumers — commit the DB change and an outbox
   event in one local transaction, deliver asynchronously with at-least-once +
   idempotency.
6. You accept a saga's window whenever a brief, well-defined period of partial
   update causes no unacceptable real-world harm — which is most of the time. The
   concrete question is: *"What does a user or the business actually experience
   during the inconsistent window, and is that experience tolerable and
   self-correcting?"* If the answer is "an order sits as 'pending' for a second
   until payment confirms" — tolerable, ship the saga. If it's "money can be
   withdrawn from one legal account and never appear in the other, and that's
   forbidden" — that's the rare case for strict atomicity (and even then, prefer
   merging those two datasets into one database over running 2PC).

</details>

## Further reading & sources

- [PostgreSQL: PREPARE TRANSACTION](https://www.postgresql.org/docs/current/sql-prepare-transaction.html) - the participant side of 2PC (`PREPARE`/`COMMIT PREPARED`/`ROLLBACK PREPARED`) driven directly in the exercises.
- [Two-phase commit protocol (Wikipedia)](https://en.wikipedia.org/wiki/Two-phase_commit_protocol) - a clear statement of the protocol and the coordinator-failure blocking problem this module centers on.
- [Distributed Transaction Processing: The XA Specification (The Open Group)](https://pubs.opengroup.org/onlinepubs/009680699/toc.pdf) - the cross-vendor DTP/XA standard that 2PC implements across heterogeneous resource managers.
- [Life beyond Distributed Transactions: an Apostate's Opinion (Pat Helland)](https://queue.acm.org/detail.cfm?id=3025012) - the classic argument for avoiding distributed transactions, motivating the saga/outbox escape hatches.
- [Transactional outbox pattern (microservices.io)](https://microservices.io/patterns/data/transactional-outbox.html) - the "commit state change + event in one local transaction" alternative preferred over 2PC here.
- [Saga pattern (microservices.io)](https://microservices.io/patterns/data/saga.html) - the eventual-consistency-with-compensations alternative this module points you toward next.

## Next

[04-the-saga-pattern](../04-the-saga-pattern/README.md) — you now understand why
strict cross-system atomicity is expensive, fragile, and usually the wrong tool.
The saga pattern is what high-throughput systems reach for instead: model the
distributed operation as a *sequence of local transactions*, each committing
independently, and when a later step fails, run **compensating transactions** to
semantically undo the earlier ones. The next module builds real choreographed and
orchestrated sagas — the order/payment/inventory checkout you just diagnosed as a
2PC failure — and shows how idempotency (module 01) and locking (module 02) combine
to make them correct.