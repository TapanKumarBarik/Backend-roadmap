# Module 06: Event Sourcing

## Why this matters

Every database you've used works the same way: it stores the *current state* and
mutates it in place. An order row says `status = 'shipped'`; when it was `placed`
and who changed it and why are gone — overwritten. That's fine until the day someone
asks "how did this order get into this state?", or "what did the balance look like
last Tuesday at 3pm?", or "a bug corrupted these records three weeks ago — can we
reconstruct what they *should* be?" With state-in-place storage, the honest answer is
usually "we can't; that history was never kept." You bolt on an audit-log table, it
drifts out of sync with the real data, and you've built a worse version of the thing
this module is about.

**Event sourcing** inverts the model: instead of storing current state and losing
history, you store the *complete, immutable, ordered sequence of events* that
happened — `OrderPlaced`, `ItemAdded`, `PaymentCaptured`, `OrderShipped` — and you
derive current state by *replaying* those events. The event log becomes the single
source of truth; current state is just a *fold* over it. This is the same idea you've
already relied on without naming it: a database's write-ahead log, a git repository
(commits are events; the working tree is a projection), your bank statement (you
never see "current balance" stored — you see the ordered transactions and sum them).
Event sourcing brings that discipline into your application's own domain model, and
it pairs so naturally with the CQRS read models from the previous module that the two
are almost always discussed together. It is *not* a default — it's heavier than CRUD
and has sharp edges (versioning, eventual consistency, a genuinely different mental
model) — but where history, auditability, and temporal queries are first-class
requirements, nothing else comes close. This module teaches the mechanics and, as
always, the judgment about when the power is worth the cost.

## Concepts

### State as a fold over an immutable event log

The foundational shift: **current state is not stored; it is computed.** You persist
an append-only, ordered log of **events** — immutable facts about things that have
already happened, named in the past tense (`OrderPlaced`, not `PlaceOrder`; the
command was the *request*, the event is the *recorded outcome*). To know the current
state of an entity — an "aggregate," in the vocabulary — you load its events in order
and *apply* each one to a starting state, folding them into the present. State is
`reduce(apply, events, initial)`.

Two properties make this powerful. First, **events are immutable and append-only** —
you never update or delete an event; a mistake is corrected by appending a
*new, correcting event*, exactly like a git revert adds a commit rather than editing
history. This gives you an audit log that *cannot* drift from reality because it *is*
reality — there's no separate state to fall out of sync with. Second, because state
is derived, you can **rebuild it any time, and rebuild it *differently***: replay the
same events into a different fold to get a different view (this is exactly how CQRS
read models are built). Losing your current-state tables is a non-event — you
re-project them from the log.

Contrast with state-in-place: `UPDATE orders SET status='shipped'` throws away the
fact that a transition happened, when, and from what. Event sourcing keeps the
*transitions* as the primary data and treats state as a disposable, recomputable
consequence. The order's state is the *answer*; the event log is the *source*.

```
  Event log (append-only, immutable — the source of truth):
   ┌──────┬──────┬──────┬─ ─ ─┬───────┬───────┬─ ─ ─┐
   │  e1  │  e2  │  e3  │ ... │ e950  │ e951  │ ... │  ◄── new events appended
   └──────┴──────┴──────┴─ ─ ─┴───┬───┴───────┴─ ─ ─┘
                          snapshot @ v950 (cached fold, NOT truth)
                                   └──► replay e951..now ──► CURRENT STATE
   Lose the state tables? Re-fold the log. Fix apply()? Recompute snapshots.
```

### Commands, events, and rebuilding an aggregate

The write path in an event-sourced system has a precise shape, and keeping the roles
straight is most of the battle:

- A **command** (`PlaceOrder`, `ShipOrder`) is a *request* to change state. It can be
  rejected.
- To handle a command, you **load the aggregate's current state** by replaying its
  past events, then run the command against that state to *validate business rules*
  (can't ship an already-cancelled order; can't withdraw more than the balance).
- If valid, the command produces one or more **events** (`OrderShipped`) that you
  **append** to the log. The events are the *decisions*; appending them is the only
  way state ever changes.
- Applying an event to state is a pure function `apply(state, event) -> new_state`
  with **no side effects and no validation** — validation already happened at command
  time; `apply` is just the fold used both to rebuild state and to advance it.

So a write is: *replay to get state → validate command against state → append new
events*. Reconstructing an aggregate is just the "replay to get state" part run on
demand:

```
state = initial
for event in load_events(aggregate_id):     # in order
    state = apply(state, event)
# `state` is now the current state, derived, never stored as the source of truth
```

The append is where **concurrency and idempotency** live. Two commands loading the
same state and both appending would conflict, so the append is guarded by an
**expected version** (optimistic concurrency: "append these events only if the
stream is still at version N") — the event-sourcing equivalent of the fencing and
conditional-write ideas from module 02. And because commands arrive over unreliable
networks, each command carries an idempotency key (module 01) so a retried command
doesn't append its events twice.

### Snapshots: replaying millions of events is too slow

The obvious objection: if current state means replaying *every* event, an aggregate
with a million events takes forever to load. The answer is **snapshots**. Periodically
(every N events, or on a schedule) you compute the aggregate's current state and store
it as a snapshot tagged with the version it represents. To load the aggregate, you
read the latest snapshot and then replay only the events *after* it:

```
snapshot = load_latest_snapshot(aggregate_id)      # state @ version 950
state = snapshot.state
for event in load_events_after(aggregate_id, snapshot.version):  # 951..now
    state = apply(state, event)
```

The crucial discipline: **a snapshot is a performance optimization, never a source of
truth.** The event log remains authoritative; the snapshot is a cache you can delete
and recompute at any time. This means you must be able to *rebuild snapshots from the
log* — if you change how `apply` folds events (a bug fix in the domain logic), you
throw away and recompute snapshots from the immutable events, and get corrected state
for free. Snapshots make loading O(events since last snapshot) instead of O(all
events), turning event sourcing from theoretically-clean-but-slow into practical.

### Event sourcing + CQRS: the natural pairing

Event sourcing produces a stream of events; CQRS (module 05) needs a stream of events
to build read models. They fit together like two halves of one design, which is why
they're so often deployed together:

- The **write side** is pure event sourcing: commands validated against replayed
  state, producing events appended to the log. The log *is* the write model.
- The **read side** is CQRS read models built by **projecting** the event stream. A
  projector consumes events and maintains denormalized, query-optimized views — an
  `order_summaries` table, an Elasticsearch index, a per-customer dashboard — each a
  *fold of the same events into a different shape*. These are eventually consistent
  with the write side (the projector lags), exactly module 05's read-model story.

This pairing makes CQRS's "rebuildable read model" claim literal and powerful:
because you have the *entire* event history, you can build a *brand-new* read model
at any time — including one you didn't know you needed when the events were first
written — by replaying history into a new projection. Want a report that requires
data you weren't aggregating six months ago? Replay the events into a new projector;
the data was there all along, captured as events. This is the superpower that pure
state-in-place systems can never have: **the past is queryable in shapes you hadn't
imagined yet.** Temporal queries ("state as of last Tuesday") fall out the same way —
replay events up to a timestamp.

### The costs and when it's worth it

Event sourcing is genuinely harder than CRUD, and using it reflexively is as much a
mistake as reflexive CQRS. The real costs:

- **Event versioning / schema evolution.** Events are immutable and live *forever*,
  so an event you wrote two years ago in an old shape must still be replayable today.
  As your event schemas evolve, you need **upcasting** (transforming old event
  versions into new ones on read) or careful additive-only changes. This is the
  single biggest long-term burden — you can never "just change the schema."
- **Eventual consistency on reads.** The write log is strongly consistent, but read
  models (projections) lag — the same read-your-writes hazards as CQRS (modules 00,
  05), to be handled the same way.
- **A genuinely different mental model.** "State is a fold over events" is unfamiliar;
  everyone on the team must internalize it, and tooling/debugging looks different
  (you inspect event streams, not rows).
- **Deletes and privacy are hard.** "Append-only, never delete" collides with GDPR
  "right to be forgotten." You need deliberate strategies (crypto-shredding: store
  personal data encrypted and delete the key; or tombstone events) — you can't just
  `DELETE`.

**Worth it when:** auditability and history are first-class requirements (finance,
healthcare, anything regulated or where "how did we get here?" is asked constantly);
you need temporal queries or to derive new views from history; the domain is
naturally event-shaped (an order's lifecycle, a shipment's journey, an account's
transactions). **Overkill when:** simple CRUD suffices, the domain has no meaningful
history requirement, or the team can't absorb the versioning and mental-model cost.
Like CQRS, a sound approach is to apply it *selectively* — event-source the few
aggregates where history truly matters (orders, payments, ledgers) and leave the rest
as plain CRUD, rather than betting the whole system on it.

## Command reference

| Concept | Mechanism | Notes |
|---|---|---|
| Event | immutable past-tense fact, appended to the log | never updated/deleted; correct via a new event |
| Event store | append-only ordered log per aggregate (stream) | source of truth; current state is derived |
| Aggregate | an entity whose state = fold of its events | loaded by replaying its stream |
| `apply(state, event)` | pure fold function, no side effects/validation | used to rebuild *and* to advance state |
| Command handler | replay → validate → append new events | validation happens here, not in `apply` |
| Optimistic concurrency | append with `expected_version` | rejects conflicting concurrent appends (module 02) |
| Snapshot | cached state @ version N, replay only events after | perf optimization, NOT a source of truth |
| Projection / read model | fold events into a query-optimized view (CQRS) | eventually consistent; rebuildable from the log |
| Upcasting | transform old event versions to current on read | how you evolve immutable event schemas |

A minimal event-sourced `Order` aggregate over Postgres — append-only events,
replay-to-state, command validation, optimistic-concurrency append, and a snapshot:

```python
import json
from dataclasses import dataclass, field
from sqlalchemy import create_engine, text

db = create_engine("postgresql+psycopg://app@primary:5432/es")

# CREATE TABLE events (
#   aggregate_id TEXT NOT NULL,
#   version      INT  NOT NULL,          -- 1,2,3,... per aggregate
#   type         TEXT NOT NULL,
#   data         JSONB NOT NULL,
#   created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
#   PRIMARY KEY (aggregate_id, version)  -- makes concurrent-append conflict a PK violation
# );
# CREATE TABLE snapshots (
#   aggregate_id TEXT PRIMARY KEY, version INT NOT NULL, state JSONB NOT NULL
# );

# ---- The aggregate: state is a FOLD of events; apply() is pure ----
@dataclass
class Order:
    id: str | None = None
    status: str = "new"
    items: list = field(default_factory=list)
    total: int = 0

def apply(state: Order, ev: dict) -> Order:
    """Pure fold. No validation, no side effects — just advance state."""
    t, d = ev["type"], ev["data"]
    if t == "OrderPlaced":
        return Order(id=d["order_id"], status="placed", items=d["items"],
                     total=d["total"])
    if t == "ItemAdded":
        return Order(state.id, state.status, state.items + [d["item"]],
                     state.total + d["item"]["price"])
    if t == "OrderShipped":
        return Order(state.id, "shipped", state.items, state.total)
    if t == "OrderCancelled":
        return Order(state.id, "cancelled", state.items, state.total)
    return state

def load(aggregate_id: str) -> tuple[Order, int]:
    """Rebuild current state: latest snapshot + replay events after it."""
    with db.connect() as c:
        snap = c.execute(text("SELECT version, state FROM snapshots "
                              "WHERE aggregate_id = :a"), {"a": aggregate_id}).first()
        state = Order(**snap.state) if snap else Order()
        from_version = snap.version if snap else 0
        rows = c.execute(
            text("SELECT version, type, data FROM events "
                 "WHERE aggregate_id = :a AND version > :v ORDER BY version"),
            {"a": aggregate_id, "v": from_version}).all()
    version = from_version
    for r in rows:
        state = apply(state, {"type": r.type, "data": r.data})
        version = r.version
    return state, version

def append(aggregate_id: str, expected_version: int, events: list[dict]) -> None:
    """Append new events with optimistic concurrency: the PK (aggregate_id,
    version) makes a concurrent append at the same version fail — the ES
    equivalent of a fenced conditional write (module 02)."""
    with db.begin() as c:
        v = expected_version
        for ev in events:
            v += 1
            c.execute(text("INSERT INTO events (aggregate_id, version, type, data) "
                           "VALUES (:a, :v, :t, :d)"),
                      {"a": aggregate_id, "v": v, "t": ev["type"],
                       "d": json.dumps(ev["data"])})

# ---- Command handler: replay -> validate -> append ----
def ship_order(order_id: str) -> None:
    state, version = load(order_id)                    # replay to current state
    if state.status == "cancelled":                    # VALIDATE against state
        raise ValueError("cannot ship a cancelled order")
    if state.status == "shipped":
        return                                         # idempotent no-op
    append(order_id, version, [{"type": "OrderShipped", "data": {}}])

def snapshot(order_id: str) -> None:
    """Snapshot = cached fold, NOT source of truth. Deletable/recomputable."""
    state, version = load(order_id)
    with db.begin() as c:
        c.execute(text("INSERT INTO snapshots (aggregate_id, version, state) "
                       "VALUES (:a, :v, :s) ON CONFLICT (aggregate_id) DO UPDATE "
                       "SET version = EXCLUDED.version, state = EXCLUDED.state"),
                  {"a": order_id, "v": version, "s": json.dumps(state.__dict__)})
```

Building a **CQRS read model by projecting** the same event stream (event sourcing +
CQRS together) — and, because you have the full history, rebuilding it from scratch:

```python
def project(event: dict) -> None:
    """Fold events into a denormalized read model (module 05). Idempotent."""
    with read_db.begin() as c:
        if event["type"] == "OrderPlaced":
            c.execute(text("INSERT INTO order_summaries (order_id, status, total) "
                           "VALUES (:o, 'placed', :t) ON CONFLICT (order_id) "
                           "DO NOTHING"),
                      {"o": event["data"]["order_id"], "t": event["data"]["total"]})
        elif event["type"] == "OrderShipped":
            c.execute(text("UPDATE order_summaries SET status='shipped' "
                           "WHERE order_id = :o"), {"o": event["aggregate_id"]})

def rebuild_read_model() -> None:
    """The superpower: a NEW read model built by replaying ALL history.
    The data was captured as events all along — replay it into a new shape."""
    with db.connect() as c:
        for r in c.execute(text("SELECT aggregate_id, type, data FROM events "
                                "ORDER BY aggregate_id, version")):
            project({"type": r.type, "aggregate_id": r.aggregate_id, "data": r.data})
```

## Hands-on exercises

One Postgres is enough (a real system might use a purpose-built event store like
EventStoreDB, but Postgres append-only tables teach the mechanics). `docker run -d
--name pg -p 5432:5432 -e POSTGRES_PASSWORD=pg postgres:16`; `pip install
"sqlalchemy>=2" psycopg[binary]`. Create the `events`, `snapshots`, and
`order_summaries` tables from the command reference.

### 1. Model an order's life as events and rebuild state

Implement `Order`, `apply`, `load`, and `append`. Append `OrderPlaced`, two
`ItemAdded`, and `OrderShipped` for one order, then call `load` and print the state.

Expected: the derived state reflects all four events (status `shipped`, two items,
correct total) — yet you never stored "current state"; you *computed* it by folding
the log. Inspect the `events` table: an immutable, ordered, human-readable history of
exactly what happened.

### 2. Correct a mistake with a new event, not an update

A wrong item was added. Instead of editing or deleting the `ItemAdded` event, append a
new `ItemRemoved` (add its case to `apply`). Reload.

Expected: state reflects the removal, and the *full history* — the erroneous add *and*
its correction — is preserved, exactly like a git revert. Confirm you never mutated
an existing event row. This is the append-only, audit-preserving discipline that
makes the log incapable of drifting from reality.

### 3. Validate commands against replayed state

Implement `ship_order` and `cancel_order`. Try to `ship_order` an order you've already
cancelled.

Expected: rejected — the command handler replayed the events, saw `cancelled`, and
refused. Note where validation lives (the command handler, against replayed state)
versus `apply` (pure, no validation). Getting this separation right is the crux of the
write model.

### 4. Enforce optimistic concurrency on append

Load an order at version N in two "sessions." Have both try to `append` a new event at
`expected_version = N`.

Expected: one append succeeds (version N+1); the other violates the `(aggregate_id,
version)` primary key and fails — you caught a concurrent modification instead of
silently losing one. This is the event-sourcing form of the conditional-write/fencing
guard from module 02. Discuss how you'd surface this to the caller (retry after
reloading).

### 5. Add snapshots and measure the speedup

Append 10,000 events to one aggregate (a loop of `ItemAdded`). Time `load`. Then take
a `snapshot` and time `load` again.

Expected: the first load replays all 10,000 events (slow); after the snapshot, `load`
reads the snapshot and replays only events *after* it (fast). Then **delete the
snapshot row** and confirm `load` still returns the correct state by replaying from
the log — proving the snapshot was an optimization, not the source of truth.

### 6. Build a CQRS read model by projecting events

Implement `project` and run it over the events as they're appended (or in a loop) to
maintain `order_summaries`. Query the read model.

Expected: a denormalized, single-row-lookup read model derived from the event stream
— event sourcing feeding CQRS (module 05). Note the projector lags the write log
(eventual consistency) and must be idempotent (`ON CONFLICT`), exactly as in module
05.

### 7. Rebuild a brand-new read model from full history

Invent a *new* query need you didn't plan for — e.g. "total number of items ever
shipped per day." Write a new projector for it and run `rebuild_read_model` over the
*existing* events to populate it from scratch.

Expected: a read model you didn't know you needed, built entirely from history that
was captured as events all along — no migration, no backfill script against
lossy state. This is the event-sourcing superpower: the past is queryable in shapes
you hadn't imagined when the events were written. Articulate why a state-in-place
CRUD system could *not* have done this.

### 8. Time-travel / temporal query

Write a `state_as_of(order_id, timestamp)` that replays events only up to a given
`created_at`. Query an order's state at three different points in its life.

Expected: you reconstruct historical states exactly — "what did this order look like
before it shipped?" — by folding a *prefix* of the log. Temporal queries fall out of
event sourcing for free; they're impossible once state is overwritten in place.

### 9. Diagnose and fix: the snapshot that froze the truth

A team event-sourced their accounts. To speed things up they made loading read the
`snapshots` table *only* and stopped replaying events after the snapshot; separately,
a projector writes balances into a `balances` read table that the app reads for
"current balance." After a domain bug fix in `apply` (an interest calculation), old
balances stay wrong even after redeploy, and recent transactions don't show up in
loaded state at all. Explain both bugs and the fix.

<details>
<summary>Answer</summary>

Two distinct violations of "the event log is the only source of truth." (1) **Loading
from the snapshot alone** treats the snapshot as authoritative instead of as a cache
— so events appended *after* the snapshot (recent transactions) are invisible in
loaded state, and the snapshot version is silently frozen. The load path must be
"latest snapshot **plus replay of events after it**"; the snapshot is only a starting
point, never the whole answer. (2) **Stale derived state after an `apply` fix**: both
the snapshots and the `balances` read model were computed by the *old, buggy* `apply`
/ projector, and nothing recomputes them from the immutable events after the fix — so
the bug is "baked into" the derived caches even though the underlying events are
correct. Because state is *derived*, the fix is to **rebuild the derived data from the
log**: discard and recompute snapshots with the corrected `apply`, and re-project the
`balances` read model from scratch (`rebuild_read_model`) using the fixed projector.
The events themselves never needed changing — they're the source of truth and were
right all along; only the disposable, recomputable projections and snapshots were
wrong. The lesson: snapshots and read models are *caches of a fold over the log*;
never read them as truth, and always be able to rebuild them when the fold changes.

</details>

## Independent challenge

No code given. Recall **05-cqrs**' projector/read-model machinery and
**01-idempotency-in-practice**' command idempotency — you'll use both on the write and
read sides. Design an event-sourced **bank account ledger** supporting: deposits,
withdrawals (rejected if they'd overdraw), transfers, a real-time "current balance,"
a printable statement for any past month, and an auditor's requirement that history be
tamper-evident and never rewritten. Specify: (1) the events (past-tense) and the
commands, and where balance validation happens (replay → validate → append); (2) how
you keep the balance fast to read despite a long history (snapshots) and why the
snapshot is not the source of truth; (3) how the "any past month's statement" and
"current balance" reads are served (projections / temporal replay), and which are
eventually consistent; (4) how you handle a *correction* to a wrongly-recorded
transaction without violating append-only; and (5) one hard problem — a customer
invokes "right to be forgotten" on an append-only log — and your strategy for it.

<details>
<summary>Hint</summary>

Events: `Deposited`, `Withdrawn`, `TransferSent`, `TransferReceived`,
`TransactionCorrected` (past tense, immutable). Commands: `Deposit`, `Withdraw`,
`Transfer` — and the overdraw check happens in the **command handler**: replay the
account's events to get the current balance, validate `balance >= amount`, and only
then append `Withdrawn`; `apply` stays pure. Balance stays fast via **snapshots**
(balance @ version N + replay events after), and the snapshot is a deletable cache —
if you change how interest folds, you recompute snapshots from the immutable events.
"Current balance" is a projection/read model (eventually consistent — give the acting
customer read-your-writes per module 00), while "past month's statement" is a
**temporal replay**: fold the events whose timestamps fall in that month, which is
exact and reproducible forever because the events are immutable (that's also what
makes it *tamper-evident* — any change would be a new, visible correcting event, and
you can hash-chain events to detect tampering). A wrongly-recorded transaction is
fixed by appending a `TransactionCorrected`/reversing event, **never** by editing the
original — the error and its correction both stay in the audit trail. The hard one,
right-to-be-forgotten on an append-only log: don't delete events; use
**crypto-shredding** — store the customer's personal data encrypted with a per-
customer key and, on a forget request, destroy the key so the personal data becomes
unrecoverable while the financial events (amounts, timestamps) that must be retained
for audit remain intact and foldable. That reconciles "never rewrite history" with
"erase personal data."

</details>

## Common mistakes & troubleshooting

- **Treating the snapshot (or a read model) as the source of truth.** The event log
  is authoritative; snapshots and projections are disposable caches of a fold over it.
  Loading from a snapshot *without replaying events after it* silently freezes state;
  reading a projection as truth means a projector bug corrupts your data with no
  recovery. Always: log is truth, everything else is rebuildable.
- **Putting validation in `apply`.** `apply(state, event)` is a *pure fold* with no
  validation or side effects — the event already happened, so it can't be rejected.
  Validation belongs in the *command handler*, run against replayed state before
  appending. Mixing them makes replay (which must be deterministic and side-effect-
  free) unsafe.
- **Mutating or deleting events.** Events are immutable and append-only. Correct a
  mistake with a *new* compensating/correcting event, never by editing history —
  editing destroys the audit trail that is the whole point and breaks any snapshot or
  projection derived from the old version.
- **No optimistic concurrency on append.** Two commands loading the same version and
  both appending will silently lose one unless the append is guarded by an expected
  version (a `(aggregate_id, version)` uniqueness). This is module 02's conditional
  write in event-sourcing clothing.
- **Ignoring event versioning.** Events live forever, so an event written years ago
  must still replay today. Plan for schema evolution with upcasting or additive-only
  changes from day one — "just change the event shape" corrupts your ability to
  replay history.
- **Forgetting reads are eventually consistent.** Projections lag the write log, so
  the read-your-writes hazards from modules 00 and 05 apply — serve the acting user's
  own recent state from replayed write state or the command response.
- **No plan for deletes/privacy.** Append-only collides with "right to be forgotten."
  Decide up front (crypto-shredding, tombstones) — you can't just `DELETE` from an
  immutable log.
- **Event-sourcing everything reflexively.** It's heavier than CRUD and adds real
  cost (versioning, mental model). Apply it selectively to aggregates where history
  and audit truly matter (orders, ledgers, payments) and leave the rest CRUD.

## Checkpoint quiz

Write down your answer to each question before expanding it — checking without attempting first is the single easiest way to fool yourself into thinking you've learned this.

1. In one sentence, how does event sourcing store state differently from a normal
   CRUD system, and what becomes the source of truth?
2. Walk through handling a command in an event-sourced aggregate. Where does
   validation happen, and why must `apply` be a pure fold with no validation?
3. What problem do snapshots solve, and why is it critical that a snapshot is *not*
   the source of truth?
4. Explain how event sourcing and CQRS fit together, and describe the concrete
   superpower their combination gives you that CRUD cannot.
5. Events are immutable and live forever. Name two consequences of that (one about
   correcting mistakes, one about schema change) and how you handle each.
6. Give two situations where event sourcing is worth its cost and two where it's
   overkill.

<details>
<summary>Answers</summary>

1. A CRUD system stores *current state* and mutates it in place, losing history;
   event sourcing stores the *complete, immutable, ordered log of events* that
   happened and *derives* current state by folding (replaying) them — the event log
   is the source of truth, and current state is a disposable, recomputable
   consequence.
2. Handling a command: load the aggregate by *replaying its past events* to current
   state, *validate the command against that state* (business rules — can't ship a
   cancelled order), and if valid *append* the resulting event(s) to the log.
   Validation happens in the command handler; `apply` must be pure (no validation, no
   side effects) because it's used to *rebuild* state by replaying already-happened
   events — an event can't be rejected after the fact, and replay must be
   deterministic and side-effect-free to be correct and repeatable.
3. Snapshots solve slow loads: replaying an aggregate's entire history is O(all
   events), so you periodically store the folded state @ version N and, on load, read
   the snapshot and replay only events after it (O(events since snapshot)). It's
   critical the snapshot is *not* the source of truth because it's a cache of a fold —
   if the fold logic changes or the snapshot is lost, you must be able to discard and
   recompute it from the authoritative event log; treating it as truth freezes state
   and makes bugs unrecoverable.
4. Event sourcing produces the event stream; CQRS builds read models by *projecting*
   that stream — the write side is the event log, the read side is denormalized views
   folded from the same events (eventually consistent). The superpower: because the
   full history is retained as events, you can build a *brand-new* read model at any
   time — including one you didn't know you needed — by replaying history into a new
   projection, and answer temporal queries ("state as of last Tuesday"). CRUD can't,
   because overwriting state in place destroyed the history the new view would need.
5. (a) Correcting mistakes: you never edit or delete an event; you append a *new
   correcting/compensating event* (like a git revert), preserving both the error and
   its fix in the audit trail. (b) Schema change: an old event must still be
   replayable forever, so you evolve schemas with *upcasting* (transform old versions
   to current on read) or additive-only changes — you can never just rewrite the
   event shape.
6. Worth it: auditability/history is a first-class requirement (finance, healthcare,
   regulated domains, "how did we get here?" asked constantly), and you need temporal
   queries or to derive new views from history / the domain is naturally event-shaped
   (order lifecycle, ledger). Overkill: simple CRUD with no meaningful history
   requirement, or a team that can't absorb the versioning burden and different
   mental model — applying it reflexively adds cost for no benefit.

</details>

## Further reading & sources

- [Event Sourcing (Martin Fowler)](https://martinfowler.com/eaaDev/EventSourcing.html) - the foundational article on storing state as an immutable log and deriving current state by replay.
- [Event Sourcing pattern (Microsoft Azure)](https://learn.microsoft.com/en-us/azure/architecture/patterns/event-sourcing) - practical guidance covering snapshots, projections, and the CQRS pairing.
- [EventStoreDB Documentation](https://developers.eventstore.com/) - docs for a purpose-built event store with streams, optimistic concurrency, and snapshots.
- [Versioning in an Event Sourced System (Greg Young)](https://leanpub.com/esversioning/read) - the definitive treatment of event schema evolution and upcasting, the biggest long-term burden this module flags.
- [CQRS Documents (Greg Young, PDF)](https://cqrs.wordpress.com/wp-content/uploads/2010/11/cqrs_documents.pdf) - foundational writing pairing event sourcing with CQRS read models.

## Next

[07-consensus-and-coordination](../07-consensus-and-coordination/README.md) — event
sourcing's `append` needed exactly one thing to be correct under concurrency: agreement
on the *order* and *version* of events, so two writers can't both claim version N.
Scale that need up — many nodes agreeing on a single value, a single leader, a single
ordered log — and you arrive at **consensus**, the deepest coordination problem in
distributed systems. The next module gives a practical, concept-level tour of consensus
(Raft), leader election, and — the punchline of the whole track — why you almost always
reach for a battle-tested tool (etcd, ZooKeeper, Postgres) that already solved it
rather than building your own.
