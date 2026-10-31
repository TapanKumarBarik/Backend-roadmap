# Module 05: Performance Bottlenecks and Identifying Them

## Why this matters

The first half of the track gave you caching — a powerful tool for one specific
problem (repeated expensive reads). But caching is an *answer*, and the far more
valuable skill is *asking the right question*: **where is the time actually
going, and what is the one thing that, if fixed, makes this faster?** Most
engineers, faced with a slow system, guess — they add an index they assume is
missing, cache something that wasn't the problem, rewrite a loop that took 1% of
the time — and are surprised when nothing improves. They optimized their *mental
model* of the bottleneck, not the real one.

This module is about replacing guessing with measuring. It defines the three
metrics that actually describe performance (response time, throughput, resource
utilization), gives you a systematic procedure for locating a bottleneck rather
than pattern-matching to your last one, revisits the N+1 problem from track 04 as
a *general* bottleneck-hunting example, and confronts the discipline that
separates senior engineers from the rest: knowing the difference between
**premature optimization** (making unmeasured guesses complicated) and **fixing a
real, measured bottleneck**. Module 08 gives you the profiler tools; this module
gives you the *thinking* those tools serve.

## Concepts

### The three metrics: response time, throughput, resource utilization

You cannot reason about performance without agreeing on what "performance" means.
Three distinct numbers, often confused:

- **Response time (latency).** How long *one* request takes, end to end. Always
  report it as a **distribution, never an average** — averages hide the pain.
  Use percentiles: **p50** (median — the typical experience), **p95**/**p99**
  (the slow tail — the experience of 1-in-20 / 1-in-100 requests), and
  **p99.9**/max (the worst cases). A system with a 20ms *average* can have a
  2-second p99 that's ruining things for thousands of users; the average lied.
  Tail latency matters disproportionately because a single page often makes many
  backend calls, so the *slowest* of them sets the page's speed (the "tail at
  scale" effect).
- **Throughput.** How *many* requests the system handles per unit time
  (requests/second, or "RPS"). This is a *capacity* measure, distinct from
  latency: a system can have great p50 latency at low load and still fall over at
  100 RPS. The two interact — as throughput approaches the system's limit,
  latency climbs sharply (queuing), which is why load matters (module 08's load
  testing).
- **Resource utilization.** How busy each *resource* is — CPU %, memory,
  disk I/O, network, database connections, thread/worker pool occupancy. This is
  how you find *why* latency or throughput is bad: a resource pinned at 100% is a
  bottleneck; a resource at 10% while latency is terrible tells you the problem is
  *elsewhere* (waiting, not working).

A crisp way to hold them together: **latency is the user's experience,
throughput is the system's capacity, and utilization is the explanation.** You
watch latency and throughput to know you *have* a problem; you watch utilization
to find *where* it is.

```
  three lenses on ONE slow system:
  ┌───────────────┬──────────────────────┬──────────────────────────┐
  │ response time │ how long ONE request │ the USER's experience    │
  │  (p50/p95/p99)│ takes                │  → do we HAVE a problem? │
  ├───────────────┼──────────────────────┼──────────────────────────┤
  │ throughput    │ how MANY req/sec the │ the system's CAPACITY    │
  │  (RPS)        │ system handles       │  → does it hold up?      │
  ├───────────────┼──────────────────────┼──────────────────────────┤
  │ utilization   │ how BUSY each        │ the EXPLANATION          │
  │  (CPU/IO/pool)│ resource is          │  → WHERE is the problem? │
  └───────────────┴──────────────────────┴──────────────────────────┘
```

### What a bottleneck actually is

A **bottleneck** is the single resource that limits the whole system's
performance — the narrowest point through which all the work must pass, like the
neck of a bottle. Its defining properties:

- **There is (almost always) exactly one dominant bottleneck at a time.** Fix it
  and the system speeds up until a *different* resource becomes the new limiting
  one. Performance work is iterative: find the bottleneck, fix it, re-measure,
  find the *next* one. You are never "done optimizing"; you are done when it's
  fast enough.
- **Optimizing anything that is not the bottleneck yields ~zero improvement.**
  This is the single most important and most violated principle. If the database
  is 90% of your request time, making your JSON serialization twice as fast
  (which was 2% of the time) improves total latency by 1%. This is **Amdahl's
  Law** in plain terms: the maximum speedup from optimizing a component is capped
  by how much of the total time that component was. Speeding up the 2% part can
  never help more than 2%, no matter how brilliant the optimization.
- **A bottleneck is usually where work *waits*, not where it *works*.** The
  slowest part of a backend request is rarely CPU crunching numbers; it's waiting
  — on a database query, on a network call to another service, on a lock, on a
  full connection pool. Utilization tells you which: a resource at 100% is the
  worker; a request spending 90% of its time *blocked* while everything sits idle
  points at a waiting bottleneck (a serial dependency, a lock, an undersized
  pool).

```
  one request's wall-clock time, broken down:
  |<-- queue -->|<-- wait ------------------->|<-service->|
   waiting for a  blocked on DB / network /     actually
   worker/conn    lock (idle CPU, not working)  computing
   ▲ throughput   ▲ the usual backend           ▲ rarely the
     problem        bottleneck lives HERE         bottleneck
```

### The systematic bottleneck-hunting procedure

Replace guessing with this loop. It's the whole method, and it's deliberately
top-down:

1. **Measure the symptom first, at the top.** Get real numbers for the
   user-facing metric: p50/p95/p99 latency and throughput of the slow endpoint,
   under a realistic load. "It feels slow" is not a starting point; "p99 is 1.8s
   at 50 RPS, p50 is 40ms" is. This also tells you whether you have a *latency*
   problem (even one request is slow) or a *throughput/scaling* problem (fast
   alone, slow under load) — very different hunts.
2. **Decompose the time — go down one level.** Break the request into its major
   phases and measure how long each takes: time in the database, time in external
   calls, time in your own CPU-bound code, time waiting for a worker/connection.
   A little timing instrumentation (or a request-level trace, track 08) or a
   profiler (module 08) turns "the request is slow" into "80% of the request is in
   this one query." **Follow the biggest number.** Do not descend into a phase
   that's 5% of the time.
3. **Confirm with utilization.** Cross-check against resource metrics. Is the DB
   CPU pinned? Is the app CPU idle while latency is high (→ waiting/blocking, not
   computing)? Is the connection pool exhausted (track 04 module 07)? This
   distinguishes a resource that's *saturated* from one that's *waited on*.
4. **Form one hypothesis and test it by changing one thing.** "This aggregate
   query is the bottleneck → if I add the index the plan wants (or cache the
   result), p99 drops." Change *only* that, re-measure, and see if the top-level
   metric actually moved. If it didn't, your hypothesis was wrong — go back to
   step 2. This is the scientific method, and the discipline of *one change at a
   time* is what lets you attribute the improvement (or its absence).
5. **Re-measure and repeat.** After a real fix, the bottleneck moves. Re-run from
   step 1. Stop when the system meets its performance goal — not before (there's
   always a next bottleneck), and not after (diminishing returns).

The two failure modes this procedure prevents: (a) *fixing the wrong thing*
(optimizing a non-bottleneck, per Amdahl), and (b) *changing many things at once*
so you can't tell what helped. Both are forms of guessing.

### The N+1 problem as a general bottleneck

Track 04 module 07 introduced N+1 as a database/ORM issue. Seen through this
module's lens, it's the *archetypal* bottleneck-hunting case, and the pattern
generalizes far beyond ORMs:

- **The symptom:** an endpoint that's fine in dev and slow in production, with
  latency that grows with *data size* (more rows → linearly more time) rather
  than being constant.
- **The decomposition finding:** almost all the time is in the *database phase*,
  and specifically in a huge *number* of tiny, individually-fast queries
  (`calls = 1,240,000`, tiny `mean_ms`, huge `total_ms` — the exact
  `pg_stat_statements` shape from track 04). The bottleneck isn't any one query
  being slow; it's the *round-trip overhead* multiplied by N.
- **The generalization:** N+1 is a specific case of a broader anti-pattern —
  **doing per-item work in a loop that should be done in one batch.** The same
  shape appears as N HTTP calls to a microservice in a loop (should be one batch
  call), N cache `GET`s (should be one `MGET`), N file reads, N lock
  acquisitions. Whenever your time scales with the number of items and it's spent
  on *per-item overhead* (a round-trip, a syscall, a handshake), you have an
  "N+1-shaped" bottleneck, and the fix is always the same idea: **batch the N
  into 1 or 2** (eager loading, `MGET`, a bulk endpoint, chunked reads — module
  06's batch processing).

This is why N+1 is worth revisiting here: it teaches the *general* skill of
recognizing "time scales with item count because of per-item overhead," which the
profiler in module 08 will make visible as one function called an absurd number
of times.

### Premature optimization vs fixing a measured bottleneck

Knuth's famous line — *"premature optimization is the root of all evil"* — is
one of the most quoted and most misunderstood sentences in software. The full
quote matters: *"We should forget about small efficiencies, say about 97% of the
time: premature optimization is the root of all evil. **Yet we should not pass up
our opportunities in that critical 3%.**"* The point is not "never optimize"; it's
**"don't optimize before you've measured which 3% actually matters."**

- **Premature optimization** is making code faster (and usually more complex,
  harder to read, more bug-prone) based on a *guess* about what's slow, without
  measuring. Micro-optimizing a loop that runs once, caching a value that's
  cheap, hand-rolling a "fast" version of something that was never the
  bottleneck. It costs you readability and correctness and buys you nothing,
  because — Amdahl — you optimized a non-bottleneck. It's also a *distraction*
  that delays finding the real problem.
- **Fixing a measured bottleneck** is the opposite: you measured (the procedure
  above), the data pointed at a specific dominant cost, and you fixed *that*. The
  complexity you add is justified by a real, quantified improvement in a
  user-facing metric.

The tell for premature optimization is the absence of a *number*. If you can't
say "this is X% of the time, and my change is projected to remove most of it,"
you're guessing. The professional stance: **write clear, correct, reasonably
sensible code first; measure under realistic load; optimize only the measured
bottleneck; keep the numbers.** ("Reasonably sensible" carries weight — this is
not license to write an accidental N+1 or an O(n²) loop over a large collection
and call profiling later; *known* anti-patterns and appropriate data structures
are baseline correctness, not premature optimization. The rule targets
*speculative micro-tuning*, not basic competence.)

## Command reference

More measuring than API here. The tools that turn guessing into data (module 08
goes deep on the profilers):

| Tool / technique | What it measures | Example |
|---|---|---|
| `time.perf_counter()` around phases | Coarse per-phase timing (DB vs CPU vs external) | manual decomposition |
| `%` percentiles (p50/p95/p99), not mean | Latency distribution / tail | `numpy.percentile(samples, [50,95,99])` |
| `hey` / `wrk` / `ab` | Throughput + latency distribution under load | `hey -z 30s -c 50 http://localhost:8000/x` |
| `pg_stat_statements` | Slowest / most-frequent / most-total-time queries | track 04 module 07 |
| `EXPLAIN (ANALYZE, BUFFERS)` | Where a single query spends time / does I/O | track 04 module 07 |
| `cProfile` / `py-spy` | Where CPU time goes in Python (module 08) | `py-spy top --pid <pid>` |
| `htop` / `docker stats` | CPU / memory utilization per process/container | `docker stats` |
| SQLAlchemy `echo=True` / query counter | *Number* of queries per request (N+1 detector) | count `SELECT`s |
| structured request timing logs | Per-request phase breakdown in prod | track 08 |

A minimal per-phase timing decorator you can drop into a FastAPI handler to
*decompose* a slow request (step 2 of the procedure) before reaching for a
profiler:

```python
import time
from contextlib import contextmanager

_phase_times: dict[str, float] = {}

@contextmanager
def phase(name: str):
    start = time.perf_counter()
    try:
        yield
    finally:
        _phase_times[name] = _phase_times.get(name, 0) + (time.perf_counter() - start)

# usage inside a handler:
def handle_request(...):
    _phase_times.clear()
    with phase("db"):
        rows = run_queries(...)
    with phase("transform"):
        data = expensive_transform(rows)
    with phase("external"):
        enrich = call_other_service(...)
    print(_phase_times)  # e.g. {'db': 0.812, 'transform': 0.004, 'external': 0.190}
    # -> the DB phase is 80% of the time; that's where to look. Don't touch 'transform'.
```

Computing honest percentiles from a batch of samples:

```python
import numpy as np
samples_ms = [ ... ]   # per-request latencies collected under load
p50, p95, p99 = np.percentile(samples_ms, [50, 95, 99])
print(f"p50={p50:.1f}ms  p95={p95:.1f}ms  p99={p99:.1f}ms  max={max(samples_ms):.1f}ms")
# a small p50 with a large p99 = a tail problem hidden by the average
```

## Hands-on exercises

You'll need a FastAPI app with a Postgres behind it (reuse track 04's) and a load
tool (`hey`/`wrk`/`ab`, or an `asyncio`+`httpx` script). Redis optional (for the
fix in exercise 6).

### 1. Average vs percentiles — watch the average lie

Collect 1,000 latency samples where 950 are ~10ms and 50 are ~1,000ms (simulate,
or hit an endpoint with an occasional slow path). Compute the mean and the
p50/p95/p99.

Expected: the mean (~59ms) describes *no actual request* — it's between the fast
and slow clusters; p50 is ~10ms (the typical experience) and p99 is ~1,000ms (the
tail that's actually hurting users). Internalize why you *always* report
percentiles, not the mean.

### 2. Latency problem vs throughput problem

Hit a moderately slow endpoint (a) with one request at a time and record latency,
then (b) under increasing concurrency (`hey -c 1`, `-c 10`, `-c 50`) and record
latency and RPS at each.

Expected: for a pure *latency* problem, single-request latency is already bad; for
a *throughput/scaling* problem, single-request latency is fine but latency climbs
steeply as concurrency rises (queuing) and RPS plateaus. You've learned to
classify the problem before hunting — they need different fixes.

### 3. Decompose a slow request with per-phase timing

Instrument a deliberately slow endpoint (one slow query + a trivial transform +
one external call) with the `phase()` context manager. Hit it and read the
breakdown.

Expected: the printed dict shows one phase dominating (e.g. `db: 0.8s` vs
`transform: 0.004s`). Practice the discipline: name the phase that's 80% of the
time as *the* thing to investigate, and explicitly decide *not* to touch the 0.4%
transform — even if it's the ugliest code.

### 4. Confirm the bottleneck with utilization

While hammering the exercise-3 endpoint, watch `docker stats` (or `htop`) for the
app *and* the Postgres container.

Expected: the Postgres container's CPU is high while the app's CPU is low —
confirming the app is *waiting* on the database, not computing. Contrast with a
CPU-bound endpoint (a tight Python loop) where the *app* CPU pins and Postgres is
idle. Utilization told you which resource is the bottleneck and whether it's
working or being waited on.

### 5. Reproduce an N+1 bottleneck and see it scale with data

Build a `/dashboard` endpoint that lazy-loads a collection in a loop (the track
04 shape). Run it with 3 test rows, then 300, timing each and counting queries
(`echo=True`).

Expected: with 3 rows it's fast (4 queries); with 300 it's slow (301 queries) —
latency grows *linearly with data size*, the N+1 signature, and the query count
is the smoking gun. This is why dev (little data) missed it and prod (lots) didn't
— the exact track 04 lesson, now framed as bottleneck-hunting.

### 6. Fix the measured bottleneck and prove the top-level metric moved

Fix exercise 5's N+1 with eager loading (or an aggregate query) — the module 06
"batch the N into 1" idea. Re-measure latency *and* query count at 300 rows.

Expected: query count drops to ~2, and endpoint latency drops proportionally.
Critically, verify the *top-level* metric (endpoint p99) moved, not just the
query count — closing the procedure's loop (step 5). Then re-profile: has the
bottleneck moved somewhere new (e.g. now it's the JSON serialization or the
external call)? Name the *new* bottleneck.

### 7. Catch yourself optimizing a non-bottleneck (Amdahl in action)

Take the exercise-3 endpoint (DB = 80% of time, transform = 0.4%). Make the
*transform* 10× faster (a real optimization of the wrong thing). Measure
end-to-end latency before and after.

Expected: end-to-end latency barely changes (you removed ~0.36% of the total) —
a visceral demonstration of Amdahl's Law and why optimizing a non-bottleneck is
wasted effort. Now optimize the *DB* phase (add the index the plan wants, or
cache it) and watch the real improvement. Same effort, wildly different payoff,
decided entirely by *which* part you picked.

### 8. Diagnose and fix: "we added Redis and it's still slow"

A team reports: "Our product-detail endpoint was slow, so we cached the product
row in Redis. Hit ratio is 98%, but p99 is *still* 1.5s." You instrument phases
and find: `cache/db lookup for product: 4ms`, `render related-items section:
1,480ms`. The related-items section loops over the product's categories and, for
each, calls an internal recommendations service. Diagnose and give the fix, and
say what the team did wrong in their *process*.

<details>
<summary>Answer</summary>

The team optimized a **non-bottleneck**. The product-row fetch was only ~4ms of a
1.5s request; caching it (even to a 98% hit ratio) removed almost nothing —
Amdahl's Law: you can't get more than ~0.3% by speeding up the 0.3% part. The
*actual* bottleneck is the related-items section (1,480ms ≈ 99% of the time),
which is an **N+1-shaped** problem: one call to the recommendations service *per
category* in a loop (per-item network round-trips scaling with category count).
The fix is to batch those N calls into one — a single bulk recommendations call
for all categories at once (module 06's batching), and/or cache *that* expensive
result rather than the cheap product row. Process error: they **guessed** the
bottleneck (the DB read) instead of **measuring** it first — had they decomposed
the request (step 2) before optimizing, the 1,480ms phase would have been obvious
and they'd never have cached the 4ms one. Measure first, then optimize the
measured dominant cost.

</details>

## Independent challenge

No code given. Take an endpoint from your storefront/dashboard app that you
*suspect* is slow, and resist fixing anything until you've run the full
procedure. First, measure the top-level symptom: p50/p95/p99 latency and RPS
under a realistic load with a load tool, and classify it as a latency problem or a
throughput problem. Second, decompose the request into phases (DB, transform,
external, waiting) with timing instrumentation and identify the single dominant
phase. Third, confirm with resource utilization which resource is saturated or
waited-on. Fourth, form one hypothesis, apply exactly one fix (which may be a
caching technique from **04-caching-for-web-apps-and-databases**, an eager-loading
fix, or a batch), and re-measure to prove the top-level p99 actually moved.
Finally — and this is the point — deliberately also apply an optimization to a
phase you measured as *trivial* (a non-bottleneck) and show that end-to-end
latency barely changes, writing one sentence invoking Amdahl's Law to explain
why. Keep every before/after number.

<details>
<summary>Hint</summary>

Do not skip the measurement step even if you're "sure" you know the bottleneck —
the whole exercise is proving you can find it with data. Use the `phase()` context
manager to decompose and *follow the biggest number* (a phase that's 5% of the
time is off-limits no matter how tempting). Classify the problem first: if a
single request is already slow it's latency (look at what that one request does);
if it's only slow under concurrency it's throughput/queuing (look at pool sizes,
worker counts, a saturated resource). The N+1-shaped bottleneck (time scaling
with item count due to per-item round-trips) is the most likely culprit and its
fix is "batch the N into 1" — the same idea whether the N is DB queries, HTTP
calls, or cache gets. For the Amdahl demonstration, pick the *smallest* phase,
make it dramatically faster, and watch the end-to-end number refuse to move — that
refusal is the whole lesson about premature optimization.

</details>

## Common mistakes & troubleshooting

- **Reporting the average latency.** The mean hides the tail; a fine average can
  coexist with a terrible p99. Always report p50/p95/p99.
- **Guessing the bottleneck instead of measuring.** The single most common and
  most expensive error. Decompose the request and follow the biggest number
  before changing anything.
- **Optimizing a non-bottleneck (Amdahl's Law).** Speeding up a component that's
  a small fraction of the total time yields a small fraction of improvement, no
  matter how much faster you make it. Confirm the part is dominant first.
- **Changing several things at once.** You can't attribute the improvement (or
  its absence). Change one thing, re-measure, repeat.
- **Confusing a latency problem with a throughput problem.** Fine alone but slow
  under load is queuing/capacity (pools, workers, a saturated resource); slow even
  alone is a latency/algorithmic issue. Different hunts.
- **Not confirming with utilization.** High latency with idle CPU means
  *waiting* (a serial dependency, a lock, an exhausted pool), not computing —
  the fix is completely different from a CPU-bound one.
- **Measuring in dev with tiny data.** N+1 and O(n²) bottlenecks are invisible at
  10 rows and catastrophic at 10 million. Measure under production-like data and
  load.
- **Treating "premature optimization is evil" as "never optimize."** The rule is
  *don't optimize before measuring which part matters*; it is not license to
  write a known N+1 or O(n²) over a large collection — that's a correctness/
  competence issue, not premature optimization.

## Checkpoint quiz

Write down your answer to each question before expanding it — checking without attempting first is the single easiest way to fool yourself into thinking you've learned this.

1. Define response time, throughput, and resource utilization, and give the
   one-line summary of what each tells you about a performance problem.
2. Why do you report latency as p50/p95/p99 rather than as an average, and what
   does a small p50 with a large p99 indicate?
3. What is a bottleneck, why is there usually only one dominant one at a time,
   and what does Amdahl's Law say about optimizing something that *isn't* it?
4. List the steps of the systematic bottleneck-hunting procedure, and name the
   two failure modes it's designed to prevent.
5. Explain why N+1 is an "N+1-shaped" bottleneck in the general sense, and give
   two non-database examples of the same shape and their fix.
6. State Knuth's premature-optimization principle *accurately* (including the
   part people omit), and give the tell that distinguishes premature optimization
   from fixing a measured bottleneck.

<details>
<summary>Answers</summary>

1. **Response time (latency)** — how long one request takes end to end; it's the
   user's experience and tells you *that* there's a problem. **Throughput** —
   requests handled per unit time; it's the system's capacity and tells you
   whether the problem is under load. **Resource utilization** — how busy each
   resource (CPU/memory/IO/DB/pool) is; it's the *explanation* and tells you
   *where* the problem is.
2. Because the average is dominated by the bulk and hides the slow tail, while
   users experience individual requests — and the slow ones (and pages that fan
   out to many calls) are set by the tail. A small p50 with a large p99 means most
   requests are fast but a meaningful minority (1-in-100) are very slow — a tail
   problem the average would conceal.
3. A bottleneck is the single resource limiting the whole system's performance —
   the narrowest point all work passes through. There's usually one dominant one
   because fixing it just shifts the limit to the *next* resource (iterative:
   fix, re-measure, repeat). Amdahl's Law: the maximum speedup from optimizing a
   component is capped by that component's fraction of total time — optimize a 2%
   part and you can gain at most ~2%, so non-bottleneck optimization is ~wasted.
4. (1) Measure the top-level symptom (p50/p95/p99, throughput) under realistic
   load; (2) decompose the request into phases and follow the biggest number; (3)
   confirm with resource utilization (saturated vs waited-on); (4) form one
   hypothesis and change exactly one thing, then re-measure; (5) re-measure and
   repeat until fast enough. It prevents (a) fixing the wrong thing (optimizing a
   non-bottleneck) and (b) changing many things at once so you can't attribute
   the result.
5. N+1 is time that scales with the *number of items* because of per-item
   *overhead* (a round-trip) rather than any single operation being slow — the
   fix is to batch the N into 1 or 2. Non-DB examples: N HTTP calls to a service
   in a loop → one bulk/batch call; N individual cache `GET`s → one `MGET`; (also
   N file reads/syscalls → one chunked read). Same shape, same "batch it" fix.
6. "We should forget about small efficiencies, say about 97% of the time:
   premature optimization is the root of all evil. **Yet we should not pass up our
   opportunities in that critical 3%.**" It means *measure first to find the 3%
   that matters*, not "never optimize." The tell: premature optimization has **no
   number** behind it (a guess about what's slow); fixing a measured bottleneck
   can state the component's percentage of total time and the quantified
   improvement the change produced.

</details>

## Further reading & sources

- [Wikipedia: Amdahl's Law](https://en.wikipedia.org/wiki/Amdahl%27s_law) - why the speedup from optimizing a component is capped by its fraction of total time.
- [Google SRE Book: Monitoring distributed systems](https://sre.google/sre-book/monitoring-distributed-systems/) - latency, traffic, errors, and saturation as the metrics that describe performance.
- [The Tail at Scale (Dean & Barroso)](https://research.google/pubs/the-tail-at-scale/) - the classic paper on why p99 tail latency dominates fan-out requests.
- [brendangregg.com: the USE method](https://www.brendangregg.com/usemethod.html) - a systematic utilization/saturation/errors procedure for finding the bottleneck resource.
- [PostgreSQL: pg_stat_statements](https://www.postgresql.org/docs/current/pgstatstatements.html) - surfacing the N+1 "huge call count, tiny per-call time" signature in the database.

## Next

[06-scaling-strategies-and-batch-processing](../06-scaling-strategies-and-batch-processing/README.md)
— you can now find the bottleneck. Several of the fixes you'll reach for share a
theme — doing less work, less often, in bigger chunks: batch processing to cut
per-item overhead (the N+1 fix generalized), avoiding resource leaks that slowly
strangle a process, reducing network/payload overhead, and offloading non-critical
work off the request path — which sets up track 06's background processing.
