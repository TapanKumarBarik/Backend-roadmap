# Module 09: Capstone Project

## Why this matters

Every module in this track taught a tool in isolation — a caching strategy, an
eviction policy, the bottleneck-hunting procedure, a concurrency fix, a profiler.
Real performance work is never one tool; it's the *discipline* of measuring a
slow system, finding where the time actually goes, choosing the right tool for
each distinct problem, and *proving* with numbers that you moved the metric that
matters. This capstone is that discipline, end to end.

You will be given (you build it yourself, deliberately) a FastAPI + Postgres +
Redis service that is *realistically* slow — not slow in one obvious way, but in
three independent ways that mirror exactly how real services degrade: an N+1
query pattern, a synchronous blocking call inside an async handler, and no caching
or connection pooling. Then you will do what a senior engineer does on their first
week owning a slow service: profile it, load-test it, find the top three
bottlenecks *from the data* (not from guessing), fix each with the correct
technique from this track, and produce a before/after report that proves it. If
you can do this, you can do the job.

## The project

Build a small "analytics dashboard" API, deliberately slow, then make it fast.

### Part A — build the deliberately slow service

Stand up Postgres and Redis via Docker, and seed a realistic dataset (enough that
inefficiency *hurts* — this is the whole point, per module 05: bottlenecks are
invisible at 10 rows). Then build a FastAPI service with the flaws below baked in.
You must build the slow version yourself — feeling each anti-pattern is part of
the learning.

**Data (seed with realistic volume):**
- `users` — at least ~1,000 rows.
- `orders` — at least ~200,000 rows, each belonging to a user (a foreign key),
  with an amount, a status, and a created-at timestamp.
- `order_items` — several per order (so `order_items` is ~1M+ rows), each with a
  product reference and a price.

**The service must contain all three of these baked-in flaws:**

1. **An N+1 query pattern.** A `GET /users/{id}/dashboard` endpoint that loads
   the user, then loads their orders, then — in a Python loop over the orders —
   lazy-loads each order's `order_items` (and/or each order's user) one query at a
   time. With a user who has many orders, this fires hundreds to thousands of
   tiny queries per request. (This is the track 04 / module 05 N+1 shape.)

2. **A synchronous blocking call inside an `async` handler.** At least one
   `async def` endpoint that performs a *blocking* operation directly on the event
   loop — e.g. a synchronous (non-async) database driver call, a
   `time.sleep(...)` standing in for a slow synchronous third-party call, a
   `requests.get(...)`, or a CPU-heavy synchronous computation (a big pandas/loop
   aggregation) — so that under concurrency it freezes the loop and stalls
   unrelated requests (the module 07 footgun).

3. **No caching and no connection pooling.** An expensive aggregate endpoint —
   e.g. `GET /stats/revenue?period=...` running a heavy multi-table
   join/aggregate over `orders`/`order_items` — with **no** result caching, so
   every request re-runs the full query; and a database engine configured to open
   a **new connection per request** (or an effectively unpooled/mis-sized setup),
   so connection setup cost and exhaustion compound under load (track 04 module 07
   / module 06's leak-shaped failure).

Confirm the service is genuinely, measurably slow before proceeding — you should
be able to *feel* it and, more importantly, *measure* it.

### Part B — measure, diagnose, fix, and prove

Now play the incident. Do it in the disciplined order the track taught, not by
guessing.

1. **Establish the baseline.** Load-test each of the three endpoints (module 08)
   with `hey`/`wrk`/`locust` at a realistic concurrency, and record the honest
   numbers: throughput (RPS), latency **p50/p95/p99** (not average), and error
   rate. Also record resource utilization (`docker stats`: app CPU, Postgres CPU,
   connection counts). These baseline numbers are non-negotiable — you cannot
   prove a fix without them.

2. **Profile and identify the top 3 bottlenecks — from the data.** Use `cProfile`
   for reproducible single-path profiling and `py-spy` (a flame graph / `top`)
   attached to the live worker *under load* (module 08). Identify the top three
   bottlenecks from what the profiler and query counts *show* — the surprising
   `ncalls`, the widest flame-graph plateau, the event-loop-blocking stack, the
   connection-setup time. Write down, for each, the evidence that it *is* a
   bottleneck (its share of the time), not your assumption.

3. **Fix each bottleneck with the right technique from this track**, one at a
   time, re-measuring after each:
   - The **N+1** → eager loading / batching / a single aggregate query (modules
     05, 06; track 04 module 07) — turn N+1 queries into 1–2.
   - The **blocking-in-async** → make the I/O actually async (async driver /
     `httpx.AsyncClient`), or offload it off the event loop (`asyncio.to_thread`
     for blocking I/O, a process pool for CPU-bound work) (module 07).
   - The **uncached expensive aggregate + no pooling** → add a Redis
     cache-aside/read-through layer with a justified TTL and a stampede defense
     (modules 01, 02, 04), *and* configure a properly-sized connection pool
     (track 04 module 07 / module 06).

4. **Prove it.** Re-run the identical load tests and produce a **before/after
   report** with the numbers side by side for each endpoint. The improvement must
   be visible in the *top-level, user-facing* metrics (p99 and RPS), not merely in
   a profiler percentage or a query count — closing module 05's and module 08's
   loop.

### Acceptance checklist

You are done when all of the following are true and demonstrable:

- [ ] Postgres + Redis run via Docker; the dataset is seeded at realistic volume
      (orders in the hundreds of thousands, order_items in the millions).
- [ ] The slow service exists and demonstrably contains **all three** baked-in
      flaws (N+1, blocking-in-async, no-cache/no-pooling), each independently
      identifiable.
- [ ] **Baseline** numbers are recorded for all three endpoints: RPS, p50/p95/p99
      latency (percentiles, not average), and error rate, at a stated realistic
      concurrency, plus resource utilization.
- [ ] The top **three bottlenecks were identified from profiler/load-test
      evidence** (cProfile `ncalls`/`tottime`/`cumtime` and/or a py-spy flame
      graph), and for each you can state the *evidence* (its share of time), not a
      guess.
- [ ] The **N+1** is fixed (query count per request drops from hundreds/thousands
      to a small constant — prove it with a query count).
- [ ] The **blocking-in-async** is fixed (under concurrency, one slow request no
      longer stalls unrelated requests — prove it by showing `/fast` stays fast
      while the slow endpoint runs, per module 07's exercise).
- [ ] The **expensive aggregate is cached** with a justified TTL *and* a stampede
      defense (single-flight lock and/or jittered TTL), **and** a properly-sized
      **connection pool** is configured (state the numbers and why).
- [ ] A **before/after report** shows, for each endpoint, the improvement in the
      **top-level metrics** (p99 and RPS) from the identical load test — this is
      required, not optional.
- [ ] You can explain, for at least one fix, why an *alternative* tool would have
      been the wrong choice (e.g. why async wouldn't fix the CPU-bound aggregate,
      why caching wouldn't fix the N+1's correctness/scaling shape, why a bigger
      box wouldn't fix the blocking loop).
- [ ] You can name at least one bottleneck that *moved* — i.e. after fixing the
      top three, what is now the *new* limiting factor (there is always a next
      one, per module 05).

### Hints

<details>
<summary>Hint: measuring and profiling</summary>

Do not fix anything before you have baseline numbers — the whole exercise is
proving fixes with data (modules 05, 08). Load-test with `hey -z 30s -c 50 <url>`
and read the *distribution*; ramp concurrency to find the saturation knee. Profile
*under load*: attach `py-spy record --pid <worker-pid>` for a flame graph and read
its *widest plateau*; use `cProfile`/SQLAlchemy `echo=True` on a single request to
get exact query *counts* (the N+1 is unmissable as a huge `ncalls` or a flood of
identical `SELECT`s). Expect at least one surprise where the measured bottleneck
isn't what you'd have guessed — that's module 08's thesis.

</details>

<details>
<summary>Hint: matching each flaw to the right fix</summary>

Each flaw has a *specific* right tool, and using the wrong one is the instructive
failure: the **N+1** is a per-item-round-trip problem → batch it (eager
load/`selectinload`/`IN`/one aggregate), *not* caching (caching a per-user
dashboard has a poor hit ratio, module 03, and doesn't fix the scaling shape); the
**blocking-in-async** is a "wrong thing on the event loop" problem → make it async
or offload it (`to_thread` for blocking I/O, a *process* pool for CPU work,
module 07), *not* a bigger machine; the **uncached aggregate** is a
repeated-expensive-read problem → cache-aside/read-through in Redis with a TTL and
a stampede defense (modules 01/02/04), *plus* a real connection pool (track 04
module 07) since connection-per-request is its own compounding cost. Fix one at a
time and re-measure so you can attribute each improvement.

</details>

<details>
<summary>Hint: the stampede and the report</summary>

Once the aggregate is cached, remember the hot-key expiry can herd the DB under
load (module 04) — add a single-flight lock (`SET lock:key 1 NX EX 10`, only the
winner recomputes) and/or a jittered TTL, and prove under load that a cache expiry
no longer produces a burst of DB queries. For the report, put the before/after
p50/p95/p99 and RPS side by side per endpoint (a small table), and make sure the
*top-level* numbers moved — a query-count drop or a nicer flame graph that doesn't
show up in p99/RPS means you optimized something that wasn't the real user-facing
bottleneck (module 05's Amdahl lesson). State which resource is the *next*
bottleneck after your fixes.

</details>

## Further reading & sources

- [py-spy](https://github.com/benfred/py-spy) - attach to the live FastAPI worker under load and record the flame graph that finds each bottleneck.
- [Locust documentation](https://docs.locust.io/en/stable/) - scripting the realistic load test that establishes the baseline and proves the fixes.
- [SQLAlchemy: relationship loading (eager/selectinload)](https://docs.sqlalchemy.org/en/20/orm/queryguide/relationships.html) - the eager-loading techniques that collapse the N+1 into one or two queries.
- [SQLAlchemy: connection pooling](https://docs.sqlalchemy.org/en/20/core/pooling.html) - sizing a real pool instead of a connection per request.
- [Redis: SET (NX/EX)](https://redis.io/docs/latest/commands/set/) - the single-flight lock primitive that defends the newly-cached aggregate against a stampede.
- [FastAPI: async and await](https://fastapi.tiangolo.com/async/) - deciding `async def` vs `def` and keeping blocking work off the event loop.

## Next

[../../06-background-processing-and-realtime/README.md](../../06-background-processing-and-realtime/README.md)
— you can now make a synchronous service fast: cache the expensive reads, batch
the chatty queries, keep blocking work off the event loop, and prove every fix
with numbers. The recurring move you kept reaching for — "this work doesn't need
to finish before I respond; offload it" (write-behind in module 01, request-path
offloading in module 06, the blocking-call fix in module 07) — is the entire
premise of the next track. Track 06 turns that instinct into real infrastructure:
durable task queues, scheduled jobs, retries and idempotency, webhooks, and
realtime websocket/SSE features — how to run work reliably *off* the request path.
