# Module 07: Query Optimization and Connection Pooling

## Why this matters

Everything so far has been about *correctness* — right schema, right guarantees,
right architecture. This module is about *speed*, and it's where a lot of
backends quietly fall over in production. The two most common database
performance disasters in web apps are both here: queries the database executes
inefficiently (because you can't read the plan to see why), and the **N+1 query
problem** — an ORM convenience that turns one page load into 500 tiny queries.
Both are invisible in development with ten rows of test data and catastrophic in
production with ten million.

The single most valuable skill in the module is reading an **`EXPLAIN
ANALYZE`** plan. It's the database telling you *exactly* how it ran your query —
which scans, which joins, where the time went, whether it used your indexes. An
engineer who can read a plan fixes slow queries in minutes; one who can't
guesses, adds random indexes, and prays. The second half — **connection
pooling** — is the thing nobody thinks about until the site falls over: opening
a fresh database connection per request is shockingly expensive, and a
mis-sized pool either starves your app or overwhelms your database. Finally,
**caching query results at the data layer** is the first, closest place to apply
the caching discipline that track 05 covers in full. Get these three right and
the difference between a snappy app and a timeout-riddled one is often exactly
this module.

## Concepts

### Reading EXPLAIN and EXPLAIN ANALYZE

`EXPLAIN` shows the planner's *chosen* plan and its *estimates*, without running
the query. `EXPLAIN ANALYZE` actually *runs* it and shows *real* row counts and
timings alongside the estimates. Read plans **inside-out and bottom-up**: the
most indented nodes run first, feeding their parents.

```
EXPLAIN ANALYZE SELECT * FROM events WHERE user_id = 4242;

                             QUERY PLAN
--------------------------------------------------------------------------
 Index Scan using idx_events_user on events
        (cost=0.43..8.45 rows=2 width=41)
        (actual time=0.021..0.024 rows=3 loops=1)
   Index Cond: (user_id = 4242)
 Planning Time: 0.10 ms
 Execution Time: 0.05 ms
```

What each part tells you:

- **The node type** — `Seq Scan` (read the whole table), `Index Scan` (walk an
  index, fetch matching rows), `Index Only Scan` (answer entirely from the
  index, no table visit — fastest), `Bitmap Heap Scan` (index finds many rows,
  then fetch them in physical order), `Hash Join` / `Nested Loop` / `Merge Join`
  (the three join strategies).
- **`cost=start..total`** — the planner's *estimated* cost in arbitrary units.
  Only meaningful for comparison; not milliseconds.
- **`rows=N` (in the cost part)** — the planner's *estimate* of rows out.
- **`actual time=start..end ... rows=N loops=M`** — from `ANALYZE`: the *real*
  time (ms) and *real* rows. **The single most important diagnostic: compare
  estimated `rows` to actual `rows`.** A huge mismatch (planner thought 2, got
  2,000,000) means stale statistics or a mis-modelled predicate, and it's why
  the planner picked a bad plan — the fix is often just `ANALYZE` or a better
  index, not what you'd guess.
- **`loops=M`** — a node run M times (the smoking gun of N+1 / nested loops):
  `actual time` is *per loop*, so multiply by `loops` for the real total.

Practical add-ons: `EXPLAIN (ANALYZE, BUFFERS)` also shows how much data came
from cache (`shared hit`) vs disk (`read`) — a query doing huge disk reads is a
different problem than one that's CPU-bound. And **always `ANALYZE` a table
after bulk-loading it** so the planner's statistics reflect reality.

### The mechanical fixes a plan points you to

A plan doesn't just describe the problem; it tells you the fix:

- **`Seq Scan` on a big table with a selective `WHERE`** → you're missing an
  index on the filtered column (module 03). Add it and re-check the plan shows
  `Index Scan`.
- **`Seq Scan` where you *have* an index** → either the predicate isn't
  sargable (e.g. `WHERE lower(email) = ...` can't use a plain index on `email` —
  needs a functional index `ON (lower(email))`; or `WHERE date_col::text LIKE
  ...` defeats the index), or the value is low-selectivity so the scan is
  genuinely cheaper (module 03), or statistics are stale.
- **Estimated rows wildly off actual** → run `ANALYZE`; consider increasing the
  statistics target on skewed columns.
- **`Sort` spilling to disk / huge sort** → an index on the `ORDER BY` columns
  can let the DB read pre-sorted and skip the sort.
- **Filter applied *after* a scan reading millions of rows** → the index isn't
  covering the filter; a composite or partial index can push the filter into the
  index scan.

### The N+1 query problem, and how eager loading fixes it

You saw this in module 05: iterating a list of parents and touching each one's
child relationship fires **1 query for the parents + N queries for the
children** — N+1 total. With 500 customers, that's 501 queries for one page.
Each is fast alone; together they're a latency and load disaster, and they're
invisible because the ORM makes `customer.orders` look like a free attribute.

```python
# N+1: 1 + N queries
customers = s.scalars(select(Customer)).all()      # 1 query
for c in customers:
    print(len(c.orders))                             # N queries (one per customer)
```

The fix is **eager loading**: tell the ORM to fetch the children up front, in
*one or two* queries instead of N. SQLAlchemy's main strategies:

```python
from sqlalchemy.orm import selectinload, joinedload

# selectinload: 2 queries total — parents, then all children in one IN (...) query.
# Best default for collections (one-to-many).
customers = s.scalars(select(Customer).options(selectinload(Customer.orders))).all()

# joinedload: 1 query with a JOIN. Good for many-to-one / single related row;
# for collections it multiplies rows (join grain, module 02) and can be wasteful.
customers = s.scalars(select(Customer).options(joinedload(Customer.orders))).unique().all()
```

The rule: **`selectinload` for collections, `joinedload` for a single related
object.** As module 06 established, the *repository* is the right place to
choose the loading strategy, because it knows the ORM and its callers' needs —
so N+1 doesn't leak out behind the interface. When you truly need only a scalar
across relations (a count), don't load objects at all — do a single aggregate
query.

### Connection pooling: why per-request connections are expensive

Opening a PostgreSQL connection is *not* cheap: a TCP handshake, TLS
negotiation, authentication, and — crucially — Postgres **forks a whole backend
OS process** for each connection, allocating memory for it. That's on the order
of *milliseconds* per connect, versus *microseconds* to run a simple query — so a
connect-per-request app spends most of its database time just connecting, and
Postgres falls over well before you'd expect because each connection is a
process with real memory cost (a few MB each; hundreds of connections is
gigabytes and heavy scheduler contention).

A **connection pool** solves this by opening a fixed set of connections once and
*reusing* them: a request borrows a connection, runs its queries, and returns it
to the pool instead of closing it. SQLAlchemy pools by default:

```python
engine = create_engine(
    "postgresql+psycopg://postgres:devpass@localhost:5432/shop",
    pool_size=10,        # persistent connections kept open
    max_overflow=5,      # extra temporary connections allowed under burst
    pool_timeout=30,     # seconds to wait for a free connection before erroring
    pool_recycle=1800,   # recycle a connection after 30 min (avoid stale ones)
    pool_pre_ping=True,  # check a connection is alive before handing it out
)
```

### Sizing the pool — the counter-intuitive part

More connections is *not* faster. Postgres runs queries on a limited number of
CPU cores and disks; beyond that, extra concurrent connections just fight over
the same resources, adding context-switching and lock contention while getting
*less* total work done. A widely-cited starting formula is roughly
`connections ≈ (core_count × 2) + effective_spindle_count` — for many workloads
the sweet spot is surprisingly small (single or low double digits *per database
node*), not hundreds.

The multiplication trap that bites everyone: your pool size is *per application
instance*. Run 20 app replicas each with `pool_size=20` and you've aimed **400**
connections at one Postgres — which likely exceeds its `max_connections` and
melts it. This is exactly why an external pooler like **PgBouncer** exists: it
sits between many app instances and Postgres, multiplexing thousands of client
connections onto a small number of real Postgres connections (transaction-level
pooling). At scale you point apps at PgBouncer, not directly at Postgres. Size
the *total* connections across all instances (plus poolers) to what the database
can actually handle, not what each app would like.

### Caching query results at the data layer

The cheapest query is the one you don't run. When the same expensive read
happens repeatedly and the underlying data changes rarely, cache the *result*
close to the data layer — typically in Redis (module 00) — keyed by the query's
parameters:

```python
import json, redis
r = redis.Redis()

def top_products(limit: int) -> list:
    key = f"top_products:{limit}"
    if (cached := r.get(key)) is not None:
        return json.loads(cached)                 # cache hit — no DB query
    rows = run_the_expensive_query(limit)          # cache miss — hit the DB
    r.set(key, json.dumps(rows), ex=60)            # cache for 60s (TTL)
    return rows
```

The two hard parts (which track 05 covers in depth) are **invalidation** —
knowing when the cached value is stale and evicting it — and **avoiding
inconsistency** — a cache that serves data older than a user's own recent write
(the read-your-writes issue from module 01). For now: cache read-heavy,
change-rarely, expensive queries; use a TTL so staleness is bounded; and never
cache something whose staleness would be *incorrect* (a bank balance) rather
than merely *slightly old* (a "top products" list). This is a deliberate,
measured dose of the denormalization trade from module 03, applied at runtime.

## Command reference

| Command / API | Purpose | Example |
|---|---|---|
| `EXPLAIN <query>` | Show planned plan + estimates (no run) | `EXPLAIN SELECT ...` |
| `EXPLAIN ANALYZE <query>` | Run it; show real times & rows | `EXPLAIN ANALYZE SELECT ...` |
| `EXPLAIN (ANALYZE, BUFFERS)` | Also show cache hits vs disk reads | diagnose I/O |
| `ANALYZE <table>` | Refresh planner statistics | after bulk load |
| `VACUUM (ANALYZE) <table>` | Reclaim space + refresh stats | maintenance |
| `pg_stat_statements` | Aggregate slowest/most-frequent queries | find the real hotspots |
| `selectinload(Model.rel)` | Eager-load a collection in 2 queries | fix N+1 (one-to-many) |
| `joinedload(Model.rel)` | Eager-load via JOIN in 1 query | many-to-one |
| `pool_size` / `max_overflow` | Persistent + burst pool connections | engine config |
| `pool_pre_ping=True` | Validate connection before use | avoid stale-conn errors |
| `pool_timeout` | Wait time for a free connection | backpressure under load |
| PgBouncer | External connection multiplexer | many app instances → few DB conns |

Finding the real hotspots with `pg_stat_statements` (enable via
`shared_preload_libraries`):

```sql
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
SELECT substring(query, 1, 60) AS query,
       calls,
       round(total_exec_time::numeric, 1) AS total_ms,
       round(mean_exec_time::numeric, 2)  AS mean_ms
FROM   pg_stat_statements
ORDER  BY total_exec_time DESC
LIMIT  10;   -- the queries costing you the most wall-clock time overall
```

## Hands-on exercises

Reuse `pg-data` and the 2-million-row `events` table from module 03 (recreate it
if needed). Have the SQLAlchemy project from module 05/06 handy for the N+1 and
pooling exercises.

### 1. Read a Seq Scan vs Index Scan plan

```sql
DROP INDEX IF EXISTS idx_events_user;
EXPLAIN ANALYZE SELECT * FROM events WHERE user_id = 4242;   -- Seq Scan
CREATE INDEX idx_events_user ON events (user_id);
EXPLAIN ANALYZE SELECT * FROM events WHERE user_id = 4242;   -- Index Scan
```

Expected: first plan shows `Seq Scan on events` with an `actual time` in the
tens/hundreds of ms; second shows `Index Scan using idx_events_user` with time
under a millisecond. Practice pointing at the exact line that names the scan
type and the exact `actual time`.

### 2. Catch a stale-statistics mismatch

```sql
INSERT INTO events (user_id, kind, created_at)
SELECT 999999, 'buy', now() FROM generate_series(1, 50000);   -- skew one user hard
EXPLAIN ANALYZE SELECT * FROM events WHERE user_id = 999999;   -- estimate likely wrong
ANALYZE events;
EXPLAIN ANALYZE SELECT * FROM events WHERE user_id = 999999;   -- estimate now realistic
```

Expected: before `ANALYZE`, the planner's estimated `rows` is far off the actual
50,000 (it may even pick the wrong scan); after `ANALYZE`, estimate ≈ actual and
the plan choice improves. This is the estimate-vs-actual diagnostic in action.

### 3. See a non-sargable predicate defeat an index

```sql
CREATE INDEX idx_events_kind ON events (kind);
EXPLAIN ANALYZE SELECT * FROM events WHERE kind = 'buy';              -- may or may not use it
EXPLAIN ANALYZE SELECT * FROM events WHERE upper(kind) = 'BUY';       -- can't use idx_events_kind
CREATE INDEX idx_events_kind_upper ON events (upper(kind));           -- functional index
EXPLAIN ANALYZE SELECT * FROM events WHERE upper(kind) = 'BUY';       -- now usable
```

Expected: wrapping the column in `upper(...)` prevents the plain index from
being used (a full scan/filter); a matching *functional* index restores index
usage. Lesson: an index only helps if the query's predicate matches its shape.

### 4. Reproduce and fix the N+1 problem (with query counts)

Using the SQLAlchemy project, run the N+1 loop from module 05 with `echo=True`
and count the emitted `SELECT`s. Then add `selectinload`:

```python
from sqlalchemy.orm import selectinload
customers = s.scalars(select(Customer).options(selectinload(Customer.orders))).all()
for c in customers:
    _ = len(c.orders)
```

Expected: the naive version emits 1 + N `SELECT`s (count them in the echo); the
`selectinload` version emits exactly **2** regardless of how many customers
there are. Same result, orders-of-magnitude fewer round-trips.

### 5. Compare selectinload vs joinedload

Run the same fetch with `joinedload(Customer.orders)` and `.unique()`. Inspect
the SQL. Expected: `joinedload` emits one query with a `LEFT OUTER JOIN` that
returns a *row per order* (parents duplicated — the join-grain effect from
module 02, why `.unique()` is needed), while `selectinload` emits two clean
queries. Note why `selectinload` is the better default for collections and
`joinedload` for a single related object.

### 6. Measure connection cost, then pool

Write a script that runs a trivial `SELECT 1` 500 times, once opening a brand
new `create_engine`/connection each iteration (simulating connect-per-request by
disposing the engine each time) and once reusing a single pooled engine. Time
both.

Expected: the pooled version is dramatically faster — the connect-every-time
version spends almost all its time on connection setup (process fork, auth), not
on the query. This is *why* pooling exists, felt directly.

### 7. Exhaust a pool on purpose

Create an engine with `pool_size=2, max_overflow=0, pool_timeout=3`. Open 3
connections and hold them (don't return them), then try a 4th query.

Expected: the 4th blocks for `pool_timeout` seconds then raises `QueuePool limit
... connection timed out`. This is what pool exhaustion looks like in
production — usually caused by connections not being returned (a session that
isn't closed, exactly module 05/06's "scope the session per request" rule). The
fix is releasing connections promptly, not blindly enlarging the pool.

### 8. Cache an expensive query in Redis

Stand up Redis (`docker run --name redis -p 6379:6379 -d redis:7`) and wrap the
module 02 "customers ranked by spend" report with the caching function from
Concepts (60s TTL). Call it twice and observe.

Expected: first call is a cache miss (runs the SQL, populates Redis); second
call within 60s is a cache hit (no SQL — confirm with `echo=True` that no query
fires). Then think through: what would a customer see immediately after placing
a new order, and why is a 60s TTL acceptable *here* but unacceptable for their
account balance?

### 9. Diagnose and fix: the endpoint that got slow in production

An `/api/dashboard` endpoint returns each of a user's projects with its task
count. It was fast in dev, times out in production. The code:

```python
projects = s.scalars(select(Project).where(Project.owner_id == user_id)).all()
return [{"name": p.name, "tasks": len(p.tasks)} for p in projects]
```

`pg_stat_statements` shows one tiny query — `SELECT * FROM tasks WHERE
project_id = $1` — with **calls = 1,240,000** and a small mean time but a huge
*total* time. Diagnose and fix, and explain why dev didn't catch it.

<details>
<summary>Answer</summary>

It's the **N+1 problem**. `len(p.tasks)` lazy-loads each project's tasks, firing
one `SELECT * FROM tasks WHERE project_id = $1` per project — which is exactly
the query `pg_stat_statements` shows with a million+ `calls` and a large total
time despite a tiny mean (each call is fast; there are just enormous numbers of
them). Dev didn't catch it because a test user with 3 projects fires only 4
queries — fast — while a real power user with hundreds of projects fires
hundreds of round-trips, and across all users it's millions. Fixes, best first:
(1) don't load task *objects* at all to count them — do a single grouped
aggregate: `select(Project.id, func.count(Task.id)).join(Task, isouter=True).
where(Project.owner_id == user_id).group_by(Project.id)` — one query, no
per-project round-trips; or (2) if you need the task objects, eager-load with
`selectinload(Project.tasks)` (2 queries total). And per module 06, put whichever
fix you choose in the repository so the N+1 can't leak back in behind the
interface.

</details>

## Independent challenge

No code given. Take the library-lending app from module 05/06 and make it fast
under load. First, build a "member dashboard" query that returns, for a member,
every one of their loans with the book title and whether it's overdue —
implemented naively so it exhibits N+1 — then fix it with the right eager-loading
strategy and *prove* the query-count drop by counting statements. Second, use
`EXPLAIN ANALYZE` on your "is any copy of book X available" query, read the plan,
and decide from the plan (not from guessing) whether it needs an index you don't
yet have; add it only if the plan justifies it, and show the before/after plans.
Third, configure the engine's connection pool with justified numbers and explain
what the total connection count would be if you ran 8 app replicas — and whether
that's safe against a default Postgres `max_connections` of 100. Fourth, pick the
*one* read in the app that's the best caching candidate, cache it in Redis with a
TTL, and justify why staleness is acceptable for that specific read and would be
unacceptable for one other read you name. Reach back to module 06: every one of
these fixes belongs in the repository layer — explain why.

<details>
<summary>Hint</summary>

For the dashboard N+1, `selectinload` the loans and the book relationship
(`selectinload(Loan.copy).selectinload(Copy.book)` or a joined path) so you get
a constant handful of queries instead of one-per-loan; count statements with
`echo=True` before and after. For the availability plan, look specifically at
whether it's a `Seq Scan` on `loans` filtering `copy_id` — an unindexed foreign
key (module 03) is the usual culprit, and the plan's estimate-vs-actual and scan
type tell you if the index is warranted. For pooling, 8 replicas ×
`pool_size + max_overflow` is your worst-case total; compare it to 100 and
decide whether you need smaller pools or a PgBouncer in front. The caching
candidate is a read that's expensive, frequent, and tolerant of being a little
stale (e.g. "most-borrowed books this month"), not one where staleness is a
correctness bug (e.g. "is this exact copy available right now" — caching that
would double-lend).

</details>

## Common mistakes & troubleshooting

- **Guessing instead of reading the plan.** Adding random indexes and hoping.
  `EXPLAIN ANALYZE` tells you the actual scan types, timings, and the
  estimate-vs-actual mismatch that reveals the real problem. Read it first.
- **Ignoring estimate-vs-actual row mismatches.** A planner estimate wildly off
  the actual count is the root cause of many bad plans — usually stale stats
  (run `ANALYZE`) or a predicate the planner can't estimate well.
- **Non-sargable predicates.** Wrapping an indexed column in a function
  (`upper(col)`, `col::text`) or doing arithmetic on it prevents index use. Use
  a functional index or restructure the predicate.
- **The N+1 problem.** Lazy-loading relationships in a loop. Fast in dev with
  little data, catastrophic in production. Eager-load (`selectinload` for
  collections, `joinedload` for single relations), or aggregate in one query,
  and put the fix in the repository.
- **Connecting per request / not pooling.** Connection setup dwarfs simple query
  time and Postgres forks a process per connection. Use a pool; reuse
  connections.
- **Over-sizing the pool.** More connections isn't faster past the DB's core/IO
  limits — it adds contention. Start small; the sweet spot is often surprisingly
  low.
- **Forgetting the pool is per-instance.** N replicas × pool_size can blow past
  `max_connections`. Size the *total*; put PgBouncer in front at scale.
- **Leaking connections.** A session that isn't closed holds its pooled
  connection, eventually exhausting the pool (timeouts). Scope sessions per
  request and close them — don't enlarge the pool to hide the leak.
- **Caching things that must not be stale.** A TTL cache on a value where
  staleness is a correctness bug (a balance) causes real errors. Cache
  read-heavy, change-rarely, staleness-tolerant reads only.

## Checkpoint quiz

Write down your answer to each question before expanding it — checking without attempting first is the single easiest way to fool yourself into thinking you've learned this.

1. What's the difference between `EXPLAIN` and `EXPLAIN ANALYZE`, and what is the
   single most useful thing to compare in an `ANALYZE` plan?
2. You see a `Seq Scan` on a large table with a highly selective `WHERE`. Give
   two distinct reasons this could happen and the fix for each.
3. Define the N+1 query problem, why it's invisible in development, and the two
   ways to fix it in SQLAlchemy.
4. When would you use `selectinload` versus `joinedload`, and what problem does
   `joinedload` cause for collections?
5. Why is opening a database connection per request expensive, and what does a
   connection pool do about it?
6. Why can *increasing* the pool size make throughput worse, and what's the
   "per-instance" trap that melts a database?
7. What are the two hardest problems in caching query results, and what kind of
   read should you never put behind a TTL cache?

<details>
<summary>Answers</summary>

1. `EXPLAIN` shows the chosen plan and the planner's *estimates* without running
   the query; `EXPLAIN ANALYZE` actually runs it and shows *real* timings and
   row counts. The most useful comparison is estimated `rows` vs actual `rows` —
   a large mismatch explains most bad plan choices (usually stale statistics).
2. (a) Missing index on the filtered column → add the index. (b) A non-sargable
   predicate (function/cast on the column) preventing index use → add a
   functional index or rewrite the predicate. (Also possible: stale stats → run
   `ANALYZE`.)
3. Iterating N parent rows and accessing a lazy-loaded relationship on each
   fires 1 query for the parents + N for the children (N+1 total). It's
   invisible in dev because test data has few parents, so N is tiny. Fix with
   eager loading (`selectinload`/`joinedload`) or by doing a single aggregate
   query instead of loading objects.
4. `selectinload` for collections (one-to-many) — it fetches parents then all
   children in one extra `IN (...)` query (2 total). `joinedload` for a single
   related object (many-to-one). `joinedload` on a collection multiplies parent
   rows by children (join grain), wasting bandwidth and needing `.unique()`.
5. It requires a TCP/TLS/auth handshake and Postgres forks a whole backend OS
   process (with memory) per connection — milliseconds of setup versus
   microseconds to run a simple query. A pool opens a fixed set once and reuses
   them across requests instead of connecting each time.
6. Past the database's CPU-core and I/O limits, extra concurrent connections
   just contend for the same resources, adding context-switching and lock
   contention and reducing total throughput. The per-instance trap: pool size is
   per app replica, so N replicas × pool_size can exceed the DB's
   `max_connections` and overwhelm it — hence external poolers like PgBouncer.
7. Invalidation (knowing when cached data is stale and evicting it) and
   inconsistency (serving data older than a user's own recent write). Never
   TTL-cache a read where staleness is a correctness bug (e.g. an account
   balance) rather than merely slightly-old data.

</details>

## Next

[08-replication-and-sharding](../08-replication-and-sharding/README.md) — you've
made a single database node fast; the final concept module is about what happens
when one node isn't enough: read replicas and replication lag, synchronous vs
asynchronous replication, sharding strategies, and — importantly — how to tell
when you actually need any of it versus when a bigger single box is simpler.
</content>
</invoke>
