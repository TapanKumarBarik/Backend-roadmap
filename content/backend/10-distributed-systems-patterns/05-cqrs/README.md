# Module 05: CQRS

## Why this matters

Every module so far has been circling one observation without naming it: reads and
writes are different animals. Module 00 said many reads happily tolerate staleness
while a few writes demand strong consistency. Module 01 made writes safe to retry.
Module 04's sagas were entirely about coordinating *writes*, while noting that the
read side just wants to be fast and can lag. **CQRS** — Command Query Responsibility
Segregation — is the architectural pattern that takes that observation seriously and
*splits the model in two*: one model you send *commands* through to change state, and
a separate model (or several) you send *queries* to for reading. The two no longer
have to be the same shape, the same database, or even consistent with each other at
the same instant.

This is powerful and it is *frequently misused*, so the single most valuable thing
this module teaches is judgment: when the split earns its considerable extra
complexity, and when it's cargo-cult overkill that doubles your surface area for no
benefit. The honest default is that most systems should *not* use CQRS — a plain CRUD
model where you read and write the same tables is simpler, consistent by default, and
correct for the overwhelming majority of features. CQRS starts paying off only under
specific pressures: a read workload that dwarfs and differs from the write workload,
a domain rich enough that the ideal write shape and the ideal read shape genuinely
conflict, or a need to serve the same data in many differently-optimized read shapes.
Learn to recognize those pressures, because reaching for CQRS without them is one of
the most common ways teams manufacture accidental complexity. Getting this judgment
right — and understanding the read-your-writes and eventual-consistency consequences
of splitting the models (modules 00, 04) — is what this module is about.

## Concepts

### The core split: commands change state, queries read it

Underneath CQRS is a distinction from software design called
**command-query separation** (CQS): a method should either *do* something (a
**command** — changes state, returns nothing meaningful) or *answer* something (a
**query** — returns data, changes nothing), never both. CQRS lifts that principle
from the method level to the *architecture* level. Instead of one model that both
accepts changes and serves reads, you have:

- A **write model** (the command side): receives commands like `PlaceOrder`,
  `CancelOrder`, `AddItem`. It enforces all the business rules and invariants,
  validates, and produces state changes. It is optimized for *correctness and
  consistency* — normalized, constraint-enforcing, transactional.
- A **read model** (the query side): receives queries like "get the order summary for
  this customer," "list the top-selling products." It is optimized for *fast reads in
  the exact shape the UI needs* — often denormalized, pre-joined, pre-aggregated, and
  possibly stored in a different engine (a search index, a document store, a cache)
  entirely.

The key move is that these are now *two separate models*, free to differ. The write
model can be a carefully normalized relational schema that makes invariants easy to
enforce; the read model can be a fat denormalized "order summary" document that a
single key lookup returns with zero joins. Neither compromises for the other. In its
lightest form CQRS is just this conceptual separation within one database (separate
command handlers and query handlers, maybe separate read-optimized views); in its
fuller form the read model is a *physically separate datastore* kept up to date from
the write side.

```
  Command (PlaceOrder) ──► [ Write model ]   normalized, invariants,
                                 │           strongly consistent
                                 │ event (via outbox)
                                 ▼
                            Projector        async — this lag is your
                                 │           staleness budget
                                 ▼
                           [ Read model ]    denormalized, fast,
                                 ▲           eventually consistent
  Query (GetOrderSummary) ───────┘
```

### The two flavors: same database vs separate read store

CQRS is a spectrum, not a binary, and most of the complexity — and most of the
misuse — comes from jumping to the far end unnecessarily.

- **Logical CQRS (same database).** Commands and queries are separated in *code* —
  distinct command handlers and query handlers, distinct request/response models —
  but both hit the same database, often with the read side using read-optimized
  **materialized views** or denormalized tables maintained by the same transactions.
  This is cheap, keeps you strongly consistent (reads see writes immediately, same
  DB), and buys you cleaner code and the ability to optimize read queries
  independently. It is a reasonable, low-risk step many codebases benefit from.
- **Physical CQRS (separate read store).** The read model lives in a *different*
  datastore — Elasticsearch for search-shaped reads, Redis for hot lookups, a
  denormalized Postgres replica, a document DB — and is kept in sync with the write
  side *asynchronously*, typically by publishing events on every write that a
  **projector** consumes to update the read store. This is where CQRS earns its
  reputation for both power and pain: you can scale and shape reads with total
  freedom, but you have inherited **eventual consistency** between the write and read
  models, plus the operational burden of a second store and the sync pipeline.

The trap is teams reading a blog post and jumping straight to physical CQRS with an
event bus and three read stores for a CRUD app that a single Postgres table served
fine. Start at the logical end; move toward the physical end *only* when a specific
pressure (below) forces it.

### Eventual consistency between write and read models

The moment your read model is a separate store updated asynchronously, the read side
**lags** the write side — this is exactly the eventual consistency from module 00,
now baked into your architecture on purpose. A command commits to the write model,
an event is published, a projector eventually applies it to the read model; in
between, a query to the read model returns the *old* state. This is the same
"read-your-writes" hazard from module 00: a user places an order (command → write
model) and is redirected to "my orders" (query → read model), which hasn't been
updated yet and shows *no order* — the confusing "I just did it and it's not there"
bug.

You must plan for this explicitly, using the tools you already have:

- **Read-your-writes for the acting user** (module 00): after a command, either read
  that user's own affected data from the *write* model briefly, or have the command
  return the new state directly so the UI can render optimistically without waiting
  for the projection to catch up.
- **Make the projection fast and monitored.** The lag *is* your staleness budget;
  measure it, alarm on it, and keep it small.
- **Design the UI for the lag.** "Your order is being processed" instead of
  immediately promising it appears in a list. Most reads (someone *else's* view of
  the data) tolerate the lag invisibly; it's only the actor's immediate re-read that
  needs care.

If you cannot tolerate *any* lag on a given read, that read belongs on the write
model (logical CQRS) — don't force everything through the async read store.

### When CQRS earns its complexity — and when it's overkill

This is the judgment the module exists to build. CQRS roughly *doubles* your models,
adds a sync pipeline, and introduces eventual consistency. That cost is justified
only under real pressure:

**Reach for CQRS when:**

- **Read and write workloads are wildly asymmetric.** A system read thousands of
  times for every write (a product catalog, a social feed, analytics) can scale the
  read side independently — many cheap read replicas / caches / search indexes — while
  the write side stays small and consistent. Trying to serve both from one model
  forces a compromise that suits neither.
- **The ideal read shape and write shape genuinely conflict.** The write side needs a
  normalized model to enforce invariants cleanly; the read side needs a fat
  denormalized shape to answer a complex screen in one hit. When reconciling these in
  one schema means either slow multi-join reads or invariant-threatening
  denormalization on the write path, splitting them lets each be ideal.
- **You need many different read shapes of the same data.** The same orders serve a
  customer's history, an ops dashboard, a search index, and an analytics warehouse —
  each wants a different shape. CQRS lets you maintain several purpose-built read
  models from one write model.
- **It pairs naturally with event sourcing** (next module). If your write model is
  already a log of events, building read models by projecting those events is the
  obvious, clean fit — CQRS and event sourcing are frequently deployed together for
  this reason.

**It's overkill when:**

- **Your reads and writes are symmetric and simple** — plain CRUD, modest scale,
  reads and writes of roughly the same shape and volume. A single model is simpler,
  strongly consistent, and correct. The complexity of two models and a sync pipeline
  buys you nothing.
- **You can't tolerate eventual consistency and won't invest in handling it.** If
  every read must be immediately consistent and you're not going to build
  read-your-writes handling, physical CQRS will just generate "where's my data" bugs.
- **You're doing it "to be scalable someday."** Premature CQRS is a classic
  over-engineering trap: you pay the full complexity cost now for a scale you may
  never reach. Start with CRUD (or logical CQRS at most); evolve to physical CQRS
  when a measured pressure demands it — the split is much easier to justify and to
  tune against a real workload than a hypothetical one.

The senior instinct mirrors module 03's on 2PC: when you feel the pull toward full
CQRS, first ask "does a single model with a good index or a materialized view solve
this?" Usually it does.

### Commands, queries, and how they meet the rest of the track

CQRS is not an island; it's where the track's threads converge on the write/read
boundary:

- **Commands are where idempotency lives** (module 01). A command like `PlaceOrder`
  is a non-idempotent state change arriving over an unreliable network — give it an
  idempotency key so a retried command doesn't place two orders. The read side, being
  pure queries, is idempotent for free.
- **The write→read sync is a mini-saga / outbox problem** (modules 04, 06). Getting
  the event from a committed write to the projector reliably is the transactional
  outbox: commit the state change and the event in one local transaction, deliver
  at-least-once, project idempotently. A dropped event means a read model that's
  permanently wrong, so this pipeline must be as reliable as any saga step.
- **Consistency is chosen per read** (module 00). Reads that tolerate lag go to the
  read model; the rare read that needs the latest write goes to the write model. CQRS
  doesn't force *all* reads to be eventually consistent — it gives you the *choice*
  per query.

## Command reference

| Concept | Mechanism | Notes |
|---|---|---|
| Command | a state-changing request (`PlaceOrder`) handled by a command handler | validated, enforces invariants, idempotent (module 01) |
| Query | a read request (`GetOrderSummary`) handled by a query handler | no side effects; hits the read model |
| Write model | normalized, transactional store of record | optimized for correctness/invariants |
| Read model | denormalized/pre-aggregated, possibly a different engine | optimized for fast reads in the UI's shape |
| Logical CQRS | separate handlers, same database (+ materialized views) | strongly consistent; cheap; a safe first step |
| Physical CQRS | read store synced async via events + projector | eventually consistent; scalable; heavier |
| Projector | consumes write-side events, updates the read model | must be idempotent; its lag is your staleness budget |
| Read-your-writes | serve the actor's own recent data from the write model | hides projection lag for the user who just acted |

A **logical CQRS** slice in FastAPI — separate command and query paths against one
Postgres, with a read-optimized denormalized `order_summaries` table kept current in
the *same* transaction as the write (so reads are strongly consistent):

```python
from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel
from sqlalchemy import create_engine, text

api = FastAPI()
db = create_engine("postgresql+psycopg://app@primary:5432/shop")

# ---- COMMAND side: change state, enforce invariants, idempotent ----
class PlaceOrder(BaseModel):
    order_id: str          # client-supplied UUID -> natural idempotency (module 01)
    customer_id: str
    items: list[dict]

@api.post("/commands/place-order", status_code=201)
def place_order(cmd: PlaceOrder):
    total = sum(i["price"] * i["qty"] for i in cmd.items)
    with db.begin() as c:
        # Idempotent create: a retried command doesn't place a second order.
        created = c.execute(
            text("INSERT INTO orders (id, customer_id, total, status) "
                 "VALUES (:id, :cid, :t, 'placed') ON CONFLICT (id) DO NOTHING "
                 "RETURNING id"),
            {"id": cmd.order_id, "cid": cmd.customer_id, "t": total}).first()
        if created is None:
            return {"order_id": cmd.order_id, "status": "already placed"}
        for it in cmd.items:
            c.execute(text("INSERT INTO order_items (order_id, sku, qty, price) "
                           "VALUES (:o, :s, :q, :p)"),
                      {"o": cmd.order_id, "s": it["sku"], "q": it["qty"],
                       "p": it["price"]})
        # Maintain the DENORMALIZED read model in the SAME transaction ->
        # strongly consistent (logical CQRS): reads see this write immediately.
        c.execute(text("INSERT INTO order_summaries "
                       "(order_id, customer_id, item_count, total, status) "
                       "VALUES (:o, :c, :n, :t, 'placed')"),
                  {"o": cmd.order_id, "c": cmd.customer_id,
                   "n": len(cmd.items), "t": total})
    return {"order_id": cmd.order_id, "status": "placed"}

# ---- QUERY side: no side effects, hits the read-optimized model ----
@api.get("/queries/order-summary/{order_id}")
def order_summary(order_id: str):
    with db.connect() as c:
        row = c.execute(text("SELECT order_id, item_count, total, status "
                             "FROM order_summaries WHERE order_id = :o"),
                        {"o": order_id}).first()   # single-row read, zero joins
    if row is None:
        raise HTTPException(404, "not found")
    return dict(row._mapping)
```

Moving to **physical CQRS**: the write side emits an event (transactional outbox),
and a separate **projector** builds the read model asynchronously — now eventually
consistent, and the projector must be idempotent:

```python
# Projector: consumes OrderPlaced events, updates a SEPARATE read store.
# Runs at-least-once, so applying the same event twice must be a no-op.
def project_order_placed(event):
    with read_db.begin() as c:
        c.execute(
            text("INSERT INTO order_summaries "
                 "(order_id, customer_id, item_count, total, status) "
                 "VALUES (:o, :c, :n, :t, 'placed') "
                 "ON CONFLICT (order_id) DO NOTHING"),   # idempotent projection
            {"o": event["order_id"], "c": event["customer_id"],
             "n": event["item_count"], "t": event["total"]})
    # The lag between the command committing and this running is the read model's
    # staleness budget: measure it, alarm on it, and serve the acting user's own
    # just-placed order from the WRITE model to hide it (read-your-writes, mod 00).
```

## Hands-on exercises

One Postgres is enough for logical CQRS; add a second database (or a second schema,
or Redis) to stand in for a separate read store in the physical exercises. `docker
run -d --name pg -p 5432:5432 -e POSTGRES_PASSWORD=pg postgres:16`; `pip install
fastapi uvicorn "sqlalchemy>=2" psycopg[binary] httpx`. Create the write tables
(`orders`, `order_items`) and the read table (`order_summaries`) from the command
reference.

### 1. Feel the pain CQRS solves: one model, two bad options

Build a plain CRUD `orders` + `order_items` schema and write a "customer order
history" screen query that needs order count, total spent, and last-order date per
customer. Implement it two ways: (a) live multi-join/aggregate over the normalized
tables; (b) denormalized columns on `orders` you must keep updated on every write.

Expected: (a) is correct but slow and gets slower with data; (b) is fast but smears
read concerns into every write and risks drift. You've just felt the tension CQRS
resolves by giving reads their *own* model — neither compromise is forced.

### 2. Build logical CQRS (same DB, strongly consistent)

Implement the `place_order` command and `order_summary` query from the command
reference, maintaining `order_summaries` *in the same transaction* as the write.
Place an order, then immediately query the summary.

Expected: the summary is present *immediately* — same transaction, same DB, strongly
consistent. You separated command and query code paths and gave reads a denormalized
model, with zero eventual-consistency risk. Note this is the cheap, safe end of the
CQRS spectrum.

### 3. Add a second read shape from the same write model

Add a *different* read model — e.g. a `customer_totals(customer_id, order_count,
lifetime_value)` table — maintained by the same command. Query it.

Expected: two purpose-built read shapes (`order_summaries` and `customer_totals`)
served from one write model, each a single-row lookup. This is the "many read shapes"
pressure that justifies CQRS, demonstrated in miniature.

### 4. Move to physical CQRS and introduce eventual consistency

Split the read model into a *separate* store (second schema/DB/Redis). Have the
command emit an `OrderPlaced` event (write it to an `outbox` table in the same
transaction); run a `project_order_placed` projector in a loop that reads the outbox
and updates the read store. Place an order and *immediately* query the read store.

Expected: for a brief moment the query returns 404 / stale — the projector hasn't run
yet. This is eventual consistency between write and read models, now part of your
architecture. Measure the lag. Then let the projector catch up and re-query — now
present.

### 5. Reproduce and fix the read-your-writes bug

With physical CQRS from exercise 4, simulate the UX flow: `POST place-order` then
immediately `GET order-summary` for that user's new order. Show it can 404.

Expected: the "I just placed it and it's not there" bug. Fix it two ways per module
00: (a) serve the acting user's just-placed order from the *write* model for a short
window; (b) have the command *return* the new order state so the UI renders
optimistically without querying the read store. Confirm other users' views still come
from the (lagging, cheap) read store.

### 6. Make the projector idempotent and prove double-apply is safe

Deliberately deliver the same `OrderPlaced` event to `project_order_placed` twice.
First with a plain `INSERT` (no conflict handling), then with `ON CONFLICT DO
NOTHING`.

Expected: the plain insert errors or duplicates on the second delivery; the
idempotent version is a clean no-op. Since the write→read pipeline is at-least-once
(module 06), a non-idempotent projector corrupts the read model on redelivery — the
projector must be idempotent just like a saga step.

### 7. Choose the consistency per query

Add a `GET /queries/order-status/{id}` that a *payment webhook* calls to decide
whether to proceed — it must see the very latest status. Route it to the *write*
model, while the customer-facing `order-summary` stays on the read model.

Expected: two queries of the same entity, deliberately routed to different models by
their consistency need — the webhook gets strong consistency from the write model,
the customer view gets cheap eventual consistency from the read model. This is module
00's per-operation consistency choice, made concrete inside CQRS.

### 8. Judge three systems: CQRS or overkill?

For each, decide logical CQRS, physical CQRS, or plain CRUD, and justify in two
sentences: (a) an internal admin tool with 20 users doing simple record edits; (b) a
product catalog read millions of times/day, updated a few hundred times/day, needing
search + faceted browse + a detail page; (c) a small SaaS app's settings page.

Expected: (a) plain CRUD — no asymmetry, no scale, CQRS is pure overhead; (b)
physical CQRS — huge read/write asymmetry and several distinct read shapes (search
index, facets, detail) justify separate scalable read models; (c) plain CRUD — tiny,
symmetric, strongly-consistent needs. The exercise *is* the judgment the module
teaches: match the pattern to the pressure, don't apply it reflexively.

### 9. Diagnose and fix: the dashboard that's permanently wrong

A team runs physical CQRS: orders write to Postgres and emit events over RabbitMQ; a
projector builds an Elasticsearch read model powering the ops dashboard. Some orders
never appear on the dashboard at all, and a few show a status that's *weeks* out of
date, even though the write DB is correct. The projector "never errors." Explain the
likely root causes and give the fix.

<details>
<summary>Answer</summary>

Root causes cluster around an **unreliable and non-idempotent write→read pipeline**.
(1) **Lost events**: if the event is published *after* the DB commit as a separate
step (not via a transactional outbox), a crash between commit and publish drops the
event forever — that order writes correctly but *never* reaches the read model, so it
never appears on the dashboard. This is the exact gap the transactional outbox
(module 06) exists to close: commit the state change and the outbox event in one
local transaction, then relay at-least-once. (2) **Silently swallowed projection
failures**: "never errors" is a red flag — a projector that catches and drops
exceptions (bad mapping, ES rejection) skips updates, leaving a read model frozen at
an old status while the write DB moves on ("weeks out of date"). (3) **Out-of-order
or dropped updates** with no reconciliation: if events can be reordered or lost and
nothing ever rebuilds the read model, drift is permanent.

Fix: (a) publish via a **transactional outbox** so no event is lost between commit
and publish; (b) make the projector **idempotent and order-tolerant** (upsert keyed
on order id, apply only if the event's version/timestamp is newer than what's stored)
and let it *fail loudly* with retries/dead-letter instead of swallowing errors; (c)
because the read model is a *derived* projection, add the ability to **rebuild it
from the source of truth** (replay events / re-project from the write DB) so drift is
recoverable — a huge advantage of CQRS is that the read model is disposable and
reconstructable. Monitor projector lag and alarm when it grows. The underlying lesson
from module 04: the sync pipeline must be as reliable as any saga step, because a
dropped event means a permanently wrong read model.

</details>

## Independent challenge

No code given. Recall **00-cap-theorem-and-consistency-models**' per-operation
consistency framing and **04-the-saga-pattern**'s outbox-based event delivery — you'll
use both. Design the read/write architecture for a **social feed**: users post
updates (writes) and scroll a personalized timeline (reads), with reads outnumbering
writes by orders of magnitude and the timeline needing to be assembled fast from many
followees' posts. Decide: (1) plain CRUD, logical CQRS, or physical CQRS — and defend
it against the "is this overkill?" test with the specific pressures present; (2) what
the write model and the read model(s) each look like (shape and store), and how a
post propagates from write to read; (3) exactly which reads tolerate eventual
consistency and which (if any) don't, and how you give the *posting user* read-your-
writes so they see their own post instantly; (4) how you keep the projector reliable
and idempotent, and how you'd rebuild a read model if it drifted. Be explicit about
the consistency the user experiences on each path.

<details>
<summary>Hint</summary>

The pressures scream physical CQRS: read/write asymmetry of many orders of magnitude,
and a read shape (a pre-assembled per-user timeline) radically different from the
write shape (an append of one post) — that's exactly the "asymmetric workload + read
shape conflicts with write shape" case, so it passes the overkill test. Write model:
a normalized, strongly-consistent `posts` store (source of truth). Read model: a
denormalized per-user **timeline** (fan-out-on-write — when a user posts, a projector
pushes the post id into each follower's precomputed timeline list, e.g. in Redis), so
a scroll is one cheap range read instead of a giant multi-followee join. A post
propagates via the transactional outbox (module 04/06): commit the post + an outbox
event in one transaction, relay at-least-once, projector fans it out idempotently
(dedupe on `(post_id, follower_id)`). Timelines tolerate eventual consistency — a post
showing up a second late in followers' feeds is invisible — but the **posting user
must see their own post immediately**, so give them read-your-writes (module 00):
render their post optimistically from the write model / the command response rather
than waiting for fan-out. Keep the projector idempotent and monitored, and because
the timeline is a *derived* read model, you can always **rebuild** a user's timeline
by re-reading their followees' posts from the source of truth if it drifts — the read
model is disposable, which is one of CQRS's biggest operational wins.

</details>

## Common mistakes & troubleshooting

- **Applying CQRS to plain, symmetric CRUD.** If reads and writes are similar in
  shape and volume and modest in scale, one model is simpler, strongly consistent,
  and correct. CQRS's two models plus sync pipeline are pure overhead here — the most
  common way teams manufacture accidental complexity.
- **Jumping straight to physical CQRS.** The read-in-a-separate-store, event-synced
  version brings eventual consistency and a second system to operate. Start at the
  *logical* end (separate handlers, same DB, materialized views) and move physical
  only when a measured pressure demands it.
- **Ignoring read-your-writes.** A separate async read model lags, so the user who
  just issued a command and re-reads sees stale/absent data. Serve the actor's own
  recent data from the write model (or return it from the command) — module 00's
  fix, now mandatory.
- **A non-idempotent projector.** The write→read pipeline is at-least-once, so the
  projector will see events twice. Upsert / dedupe so re-applying an event is a
  no-op; a plain insert corrupts the read model on redelivery.
- **Publishing events outside the write transaction.** Emitting the event as a
  separate step after commit drops it on a crash, permanently desyncing the read
  model. Use a transactional outbox: commit state change + event together (modules
  04, 06).
- **Swallowing projection errors.** A projector that catches and drops exceptions
  leaves the read model silently frozen. Fail loudly, retry, dead-letter — and
  monitor projection lag as your staleness budget.
- **No way to rebuild the read model.** The read model is *derived* and should be
  disposable — if you can't re-project it from the source of truth, drift becomes
  permanent and unrecoverable. Always keep the ability to rebuild.
- **Forcing every read through the eventually-consistent store.** CQRS gives you a
  *choice* per query; a read that genuinely needs the latest write should hit the
  write model. Don't dogmatically route strongly-consistent reads through the lagging
  read model.

## Checkpoint quiz

Write down your answer to each question before expanding it — checking without attempting first is the single easiest way to fool yourself into thinking you've learned this.

1. State the core CQRS split in one sentence, and how it relates to command-query
   separation (CQS).
2. Distinguish logical CQRS from physical CQRS. Which is strongly consistent, which
   is eventually consistent, and why?
3. Give two concrete pressures that justify CQRS and two situations where it's
   overkill.
4. Physical CQRS introduces eventual consistency between the write and read models.
   What specific user-facing bug does this cause, and how do you fix it?
5. Why must the projector be idempotent, and why must the write→read event be
   delivered via a transactional outbox rather than a post-commit publish?
6. The read model is described as "derived" and "disposable." What operational
   capability does that give you, and why does it matter when the read model drifts?

<details>
<summary>Answers</summary>

1. CQRS separates the model you send state-changing *commands* through (the write
   model, optimized for correctness/invariants) from the model(s) you send *queries*
   to (the read model, optimized for fast reads in the UI's shape). It's
   command-query separation (a method either changes state or returns data, never
   both) lifted from the method level up to the architecture level.
2. Logical CQRS separates command and query code paths but both hit the *same*
   database (often with read-optimized views maintained in the same transaction) —
   strongly consistent, because reads see writes immediately. Physical CQRS puts the
   read model in a *separate* store kept in sync *asynchronously* via events + a
   projector — eventually consistent, because there's a lag between the write
   committing and the projection applying.
3. Justified when: read and write workloads are wildly asymmetric (reads dwarf
   writes, so the read side needs independent scaling), and/or the ideal read shape
   genuinely conflicts with the ideal write shape (or you need many different read
   shapes of the same data). Overkill when: reads/writes are symmetric and simple
   (plain CRUD at modest scale), or you can't tolerate/won't handle eventual
   consistency, or you're doing it speculatively "to scale someday."
4. A read-your-writes violation: the user issues a command (write model), immediately
   re-reads (lagging read model), and sees stale or absent data — "I just did it and
   it's not there." Fix by serving the acting user's own recent data from the write
   model for a short window, or by returning the new state from the command so the UI
   renders optimistically without waiting for the projection.
5. The projector must be idempotent because the pipeline is at-least-once — it will
   see the same event twice and a non-idempotent apply (plain insert) corrupts the
   read model; upsert/dedupe makes re-apply a no-op. The event must go via a
   transactional outbox (commit state change + event in one local transaction) so a
   crash between commit and publish can't drop the event — a post-commit publish
   loses events on crash, permanently desyncing the read model.
6. Because the read model is built entirely from the write model (the source of
   truth), you can always **rebuild/re-project** it from scratch. That matters when
   the read model drifts (lost events, a projector bug, a bad deploy): rather than the
   drift being permanent, you replay/re-project from the source of truth to restore
   correctness — the read model is disposable, which turns a class of catastrophic
   "our read data is wrong" incidents into a recoverable rebuild.

</details>

## Further reading & sources

- [CQRS (Martin Fowler)](https://martinfowler.com/bliki/CQRS.html) - the canonical definition, and its explicit warning that CQRS is easy to misuse.
- [CommandQuerySeparation (Martin Fowler)](https://martinfowler.com/bliki/CommandQuerySeparation.html) - the CQS principle that CQRS lifts from the method level to the architecture level.
- [CQRS pattern (Microsoft Azure)](https://learn.microsoft.com/en-us/azure/architecture/patterns/cqrs) - practical guidance on when the read/write split earns its complexity and when it's overkill.
- [Materialized View pattern (Microsoft Azure)](https://learn.microsoft.com/en-us/azure/architecture/patterns/materialized-view) - the read-optimized projection technique used for the logical-CQRS read model here.
- [Clarified CQRS (Udi Dahan)](https://udidahan.com/2009/12/09/clarified-cqrs/) - a widely-cited clarification of what CQRS actually is and the problems it does and doesn't solve.

## Next

[06-event-sourcing](../06-event-sourcing/README.md) — CQRS split the write model from
the read model, and a recurring note has been that the write side is really a
*sequence of state changes* (`PlaceOrder`, `CancelOrder`) and that read models are
*derived* by applying those changes. Event sourcing takes that to its logical
conclusion: instead of storing the *current state* and mutating it in place, store
the **full, immutable sequence of events** that produced it, and reconstruct state by
replaying them. The next module shows how that gives you a perfect audit log,
time-travel, and trivially-rebuildable CQRS read models — and what it costs in
complexity, event versioning, and snapshotting.
