# 06 - Profiling and Application-Level Performance

## Why this matters

[Module 05](../05-identifying-bottlenecks/README.md) taught you to find *which
resource* saturates — CPU, a pool, a dependency. But when the answer is "the
app pods are CPU-bound," you still don't know *why*: which function, which
query, which line is burning the CPU. Autoscaling and bigger limits paper over
inefficient code by throwing money at it — a request that does 100 database
queries when it needs 2 will scale, but you'll pay for four idle-but-billed
replicas to serve traffic one efficient replica could handle. Profiling is how
you find the hot code path so you can fix the *cause* instead of renting around
it. This module is a survey, not a deep course in any one language's profiler —
the goal is to know what profiling answers, recognize the classic application-
level performance bugs, and decide when to scale infra versus fix code.

## Concepts

### Load testing finds *that* it's slow; profiling finds *why*

These are complementary tools at different altitudes. A **load test** (k6,
modules 01-04) is a *black-box* view from outside: it tells you the system's
p95 is 800ms at 400 RPS and that pods are CPU-bound — symptoms, from the
user's side. A **profiler** is a *white-box* view from inside the running
process: it tells you that 60% of that CPU time is spent in
`serializeResponse()`, or that one endpoint issues 340 SQL queries per request.
You need both, in order: the load test tells you *where to point the profiler*
(which endpoint, at what load), and the profiler tells you *what to change*.
Profiling without a load test to reproduce the pressure often shows you a
process at rest — you must profile *under representative load*, which is exactly
what your k6 scripts now give you.

### CPU profiles and flame graphs — where the time goes

A **CPU profiler** samples the call stack many times per second while the
program runs; aggregating those samples shows which functions were on-CPU most
often. The standard visualization is a **flame graph**: each box is a function,
its *width* is the share of total CPU time spent in it (and its children), and
the stack goes bottom-up (callers below, callees above). You read it by
scanning for **wide boxes near the top** — a wide box high in the stack is a
leaf function eating CPU directly; a wide box that's wide because of one child
points you down into that child. The skill is resisting the urge to optimize a
function just because it *looks* important; the flame graph's width is the only
thing that says where the time *actually* is. Most languages have a sampling
profiler (Go's `pprof`, Python's `py-spy`, Java's async-profiler, Node's
`--prof`/clinic) that can emit a flame graph.

### The N+1 query problem — the most common app-level performance bug

If there's one code-level bug this module wants you to recognize on sight, it's
**N+1 queries**. You fetch a list of N items with one query, then loop over
them and issue *one more query per item* to fetch a related record — N+1 total
queries where 2 would do (one for the list, one to fetch all the related
records at once). It's insidious because it works *perfectly* in development
with 3 rows and falls over in production with 3,000: the endpoint's latency
grows *linearly with the data*, and — critically — it's the exact bug that
produces the connection-pool exhaustion from
[module 05](../05-identifying-bottlenecks/README.md) and
[track 14](../../14-databases-and-stateful-workloads/README.md), because each
request holds a connection far longer while it runs its hundreds of little
queries. The tell in a profile or a query log: the same query shape executed
hundreds of times per request, with different IDs. The fix is a code change —
eager loading / a JOIN / a batched `WHERE id IN (...)` — not more replicas and
not a bigger pool.

### Memory profiles, allocation, and leaks

The soak test (module 00) finds *that* memory grows unbounded over hours; a
**memory profiler** (heap profile) finds *what* is retained. Two distinct
things to separate: **allocation rate** (how much garbage you create — high
allocation means the garbage collector runs constantly, and GC pauses show up
as latency spikes and stolen CPU) versus a true **leak** (memory that's
allocated and never released because something still references it — a growing
cache with no eviction, event listeners never removed, a growing global map).
A heap profile taken at two points in a soak test, diffed, shows what *grew*
between them — that diff is your leak suspect. This is why module 00 insisted
soak tests are a separate question: a ten-minute load test never runs long
enough for a slow leak or GC pressure to show.

### Latency profiling: where a *single request* spends its time

CPU profiles aggregate across many requests; sometimes you need to know where
*one* slow request's time went — and much of a web request's wall-clock time is
spent **not** on CPU but *waiting* (on the database, a downstream API, a lock).
This is where **distributed tracing** from
[track 12 module 05](../../12-observability-deep-dive/05-distributed-tracing-and-opentelemetry/README.md)
becomes a performance tool: a trace breaks one request into spans — 5ms in the
handler, 400ms waiting on a DB query, 200ms calling a downstream — showing you
the wait *between* services that a CPU profile (which only sees on-CPU time)
completely misses. The rule: use a **CPU profiler** for compute-bound hot paths
(the app is burning CPU), and **tracing** for I/O-bound latency (the app is
*waiting*) — which maps precisely onto the module-04 distinction between a
CPU-HPA that fires and one that never does.

### Infra scaling vs. code-level fixes — when to do which

The central judgment of this module. Scaling infrastructure (more replicas,
bigger limits, a faster DB tier) and fixing code (killing an N+1, caching a hot
computation, fixing a leak) both improve performance, but they trade
differently. **Scale infra when:** the code is reasonably efficient and you
genuinely have more *work* to do (real traffic growth) — throwing hardware at
linear, honest load is correct and fast. **Fix the code when:** the work itself
is wasteful — an N+1 doing 100× the queries it needs, an O(n²) loop, a missing
cache recomputing the same thing per request, a leak. The tell that you have a
*code* problem: efficiency-per-request is bad and gets *worse* with data size,
so scaling only delays the wall and multiplies the cost. A useful frame from
[track 21 (FinOps)](../../21-cost-management-and-finops/README.md): scaling infra
to serve inefficient code is a recurring bill; the code fix is a one-time cost
that lowers that bill permanently. You often do both — scale to survive *now*,
fix the code so you can scale *down* later.

### Profiling in production: continuous profiling and overhead

You can't always reproduce a production hot path in a test. **Continuous
profiling** (Pyroscope, Parca, Grafana Phlare, or a cloud APM) runs a
low-overhead sampling profiler *in production* all the time, so when an
endpoint gets slow you have a flame graph from the moment it happened rather
than trying to reproduce it. The key property is **low overhead** — sampling a
few hundred times a second costs single-digit-percent CPU, cheap enough to
leave on. This pairs naturally with track 12's observability stack (same
Grafana pane): metrics tell you *when* it got slow, traces tell you *which
request path*, and a continuous profile tells you *which function* — the three
altitudes of "why is it slow" in one place.

## Command reference

Profiling tools are language-specific; this is a survey of the common ones and
what each produces. You don't need all of them — recognize the category.

| Tool | Language / scope | Produces | Notes |
|---|---|---|---|
| `go tool pprof` | Go | CPU/heap/goroutine profiles, flame graphs | Built into the stdlib (`net/http/pprof`) |
| `py-spy record -o out.svg --pid <pid>` | Python | Sampling flame graph of a *running* process | No code changes, attaches to a live PID |
| async-profiler | Java/JVM | CPU/alloc/lock flame graphs, low overhead | The de-facto JVM profiler |
| `node --prof` / `clinic flame` | Node.js | CPU profile / flame graph | `clinic` gives friendlier output |
| `perf record` / `perf report` | Any (Linux) | System-wide CPU sampling | Kernel-level, language-agnostic |
| Pyroscope / Parca / Grafana Phlare | Any (continuous) | Always-on flame graphs in Grafana | Production continuous profiling |
| OpenTelemetry traces (track 12) | Any (distributed) | Per-request span breakdown | For *waiting* time, not CPU |
| DB slow-query log / `pg_stat_statements` | Postgres | Which queries are slow / most frequent | Where N+1 shows up as a repeated shape |
| `EXPLAIN ANALYZE <query>` | SQL | A single query's plan and real timing | Missing index vs. genuinely big scan |

Reading a flame graph — the rules:

| What you see | What it means |
|---|---|
| A **wide** box | That function (+ its callees) used a large share of CPU time |
| A wide box **at the top** (a leaf) | That function itself is the hot spot — optimize it directly |
| A wide box wide because of **one child** | The cost is in the child — follow it up the stack |
| Many **narrow** boxes, no wide one | No single hot spot — cost is spread; scaling may be the honest answer |
| The **same stack** appearing repeatedly across a trace | A repeated operation (classic N+1 signature in a query trace) |

## Hands-on exercises

You need an app you can profile. Any of your earlier real apps works; where a
specific bug is needed, the exercises describe how to induce it. Profiling is
language-specific, so adapt the tool to your app's language — the *method* is
what transfers.

### 1. Point the profiler where the load test told you

Run a k6 load test (module 03) against one endpoint of a real app until it's
CPU-bound (`kubectl top pods` shows CPU near the limit). *While the load runs*,
capture a CPU profile of one pod (e.g. `kubectl exec` + `py-spy`/`pprof`
appropriate to your app). Expected: a profile taken *under load*, not at rest —
confirm the process is actually busy. This is the module's core discipline:
profile under representative load, aimed by the load test.

### 2. Read a flame graph and find the widest box

Render the profile as a flame graph (`py-spy record -o flame.svg`, `go tool
pprof -http`, etc.). Expected: identify the single widest box near the top and
name the function. Write down: is it a leaf (optimize directly) or wide because
of one child (follow the child)? Practice resisting the box that *looks*
important but is narrow.

### 3. Induce and detect an N+1 query

Take (or write) an endpoint that lists items and fetches a related record per
item in a loop, backed by a Postgres (track 14). Enable query logging or
`pg_stat_statements`, then hit the endpoint once:

```sql
-- in the DB
SELECT query, calls FROM pg_stat_statements ORDER BY calls DESC LIMIT 5;
```

Expected: one query shape with a `calls` count in the *hundreds* for a single
request — the same `SELECT ... WHERE id = $1` executed once per row. That
repeated shape *is* the N+1. Note how latency for this endpoint grows as you add
rows to the table.

### 4. Fix the N+1 and re-measure

Change the code to eager-load / JOIN / batch (`WHERE id IN (...)`), so the
endpoint issues ~2 queries instead of N+1. Re-run the same k6 test and the same
`pg_stat_statements` check. Expected: `calls` drops to a small constant,
endpoint p95 falls sharply, and — connecting to module 05 — each request now
holds a DB connection far *briefly*, relieving pool pressure. You fixed the
*cause*; contrast with the alternative of scaling replicas, which would have
kept all N+1 queries and multiplied the connection load.

### 5. Compare the two fixes head to head

For the pre-fix N+1 endpoint, measure the RPS you can serve within SLO with 1
replica. Then, *without* the code fix, scale to enough replicas to hit the same
RPS within SLO and note the replica count. Then apply the code fix and re-measure
the single-replica RPS. Expected: the code fix serves far more RPS per replica —
quantify it (e.g. "the fix let 1 replica do what 4 replicas did before").
That ratio is the recurring bill (track 21) you avoid by fixing code instead of
scaling around it.

### 6. Use a trace for a *waiting* bottleneck

For an I/O-bound endpoint (one that waits on a DB or downstream), a CPU profile
will look nearly *idle* — the time is spent waiting, not computing. Capture an
OpenTelemetry trace (track 12 module 05) of one slow request instead. Expected:
the trace's spans show most of the wall-clock time in a *waiting* span (DB
query, downstream call), which the CPU profile missed entirely. Lesson: CPU
profiler for compute-bound, tracing for wait-bound — the same split as module
04's HPA-fires-or-not.

### 7. Catch a leak with a soak + heap diff

Run a *soak* test (module 00) — a long, moderate hold — against an app with a
deliberately unbounded cache (or any app you suspect). Capture a heap profile
early and again near the end, and diff them. Expected: the diff highlights a
structure that *grew* over the run (the unbounded cache) — the leak, invisible
in a short test. Note that memory climbing steadily over hours, not load, is the
signature.

### 8. Diagnose and fix: "scaling didn't help" was a code problem all along

Take the N+1 endpoint from exercise 3, attach an HPA (module 04), and load it.
Expected: it scales replicas, cost rises, and latency improves only modestly
because *every replica still does N+1 queries* and they collectively pressure
the DB/pool (module 05). **Diagnose:** the profile/query log shows the wasteful
work is *per request*, so more replicas multiply the waste rather than removing
it. **Fix:** apply the exercise-4 code fix, then re-run — latency recovers at a
*fraction* of the replicas. Lesson: when efficiency-per-request is the problem,
infra scaling delays and multiplies the cost; the code fix removes it.

### 9. Clean up

```bash
# remove any profiling sidecars/exec sessions; delete induced test tables;
# scale test deployments back to 1 and delete scratch HPAs
kubectl delete hpa <app> -n demo 2>/dev/null
```

Expected: profiling artifacts and scratch scaling removed; keep long-lived apps
if later work reuses them.

## Independent challenge

Take a real endpoint on one of your apps (track 07 capstone, a track-14
DB-backed service) and run the full "why is it slow" loop with no recipe given:
use a k6 load test (modules 01/03) to reproduce the pressure and confirm it's
compute-bound or wait-bound; point the *right* tool at it accordingly (a CPU
profiler + flame graph for compute-bound, an OpenTelemetry trace from track 12
for wait-bound); identify one concrete application-level cause (a hot function,
an N+1, a leak); make the code-level fix; and prove with a re-run that you
serve materially more RPS-per-replica than before. Then argue explicitly, for
*this* case, whether the right production response was to scale infra, fix the
code, or both — grounding the argument in the recurring-cost framing from
[track 21](../../21-cost-management-and-finops/README.md). This pulls on modules
00-05 here plus track 12's tracing and track 14's databases.

<details>
<summary>Stuck? One hint</summary>

First decide compute-bound vs. wait-bound by looking at `kubectl top pods`
under load: high pod CPU → CPU profiler + flame graph (find the widest top box);
low pod CPU but high latency → the time is spent *waiting*, so use a trace to
see which downstream/DB span dominates. If it's a DB-backed list endpoint whose
latency grows with row count, suspect N+1 first — check `pg_stat_statements` for
one query shape with a huge `calls` count per request, and fix with eager
loading / a JOIN / `WHERE id IN (...)`. To make the scale-vs-fix argument
concrete, measure RPS-within-SLO per single replica before and after the fix;
the ratio is exactly the ongoing cost you'd otherwise pay forever.

</details>

## Common mistakes & troubleshooting

- **Profiling at rest.** A profile of an idle process shows nothing useful.
  Always profile *under representative load* driven by your k6 test.
- **Optimizing the box that looks important instead of the wide one.** Flame-
  graph *width* is the only signal for where time actually goes; a scary-named
  narrow box is a distraction.
- **Using a CPU profiler on a wait-bound problem.** If the app is *waiting* on
  I/O, the CPU profile looks idle and misleads you — use tracing for wait time.
- **Missing an N+1 because dev data is tiny.** N+1 is invisible with 3 rows and
  fatal with 3,000; check query *counts per request* (`pg_stat_statements`), not
  just dev-time feel.
- **Scaling around wasteful code.** Adding replicas to an N+1 endpoint
  multiplies the wasted queries and the cost; it delays the wall instead of
  removing it.
- **Confusing high allocation with a leak.** High GC churn (allocation rate)
  and a true leak (unreleased retained memory) need different fixes; a heap
  *diff* over a soak test distinguishes them.
- **Trying to reproduce a prod-only hot path locally.** Sometimes you can't —
  that's what low-overhead continuous profiling in production is for.

## Checkpoint quiz

Write down your answer to each question before expanding it — checking without attempting first is the single easiest way to fool yourself into thinking you've learned this.

1. In one sentence each, what does a load test tell you versus what a profiler
   tells you, and why do you need them in that order?
2. How do you read a flame graph — what does the *width* of a box mean, and what
   mistake does focusing on a scary-named narrow box represent?
3. Describe the N+1 query problem, how you'd confirm it in Postgres, and why it's
   invisible in development but fatal in production.
4. Why won't adding replicas fix an N+1 endpoint, and how does N+1 connect to the
   connection-pool bottleneck from module 05?
5. When is a CPU profiler the wrong tool, and what do you use instead — and how
   does that map onto whether a CPU-based HPA fires?
6. Distinguish high allocation rate from a true memory leak, and what test plus
   technique separates them.
7. Give the tell that a performance problem is a *code* problem (fix the code)
   rather than an honest capacity problem (scale the infra), with the cost
   framing from track 21.

<details>
<summary>Show answers</summary>

1. A **load test** is a black-box view from outside — it tells you *that* the
   system is slow (p95, which endpoint, which resource saturates). A **profiler**
   is a white-box view from inside the process — it tells you *why* (which
   function/query). You need the load test first because it reproduces the
   pressure and tells you where to point the profiler; profiling without load
   often shows a process at rest.
2. Width = the share of total CPU time spent in that function (and its callees);
   you scan for **wide boxes near the top**. Focusing on a narrow but
   important-*looking* box is optimizing something that isn't actually where the
   time goes — width is the only signal that matters.
3. You fetch N items with one query, then loop and issue one more query per item
   — N+1 queries where 2 would do. Confirm via `pg_stat_statements` / query log
   showing one query *shape* with a `calls` count in the hundreds per request.
   It's invisible in dev (3 rows) and fatal in prod (thousands) because latency
   grows linearly with the data.
4. Every replica still runs the full N+1 per request, so more replicas multiply
   the wasted queries and the cost rather than removing the waste. It connects to
   the pool bottleneck because each N+1 request holds a DB connection far longer
   (running its hundreds of little queries), exhausting the pool (module 05)
   against the DB's `max_connections` (track 14).
5. A CPU profiler is wrong for a **wait-bound** problem — if the app is *waiting*
   on I/O, the CPU profile looks idle. Use **distributed tracing** (track 12) to
   see the waiting spans. This maps onto module 04: a CPU-HPA fires for
   compute-bound work (CPU crosses target) but stays calm for wait-bound work
   (waiting burns no CPU).
6. **High allocation rate** = creating lots of garbage, causing constant GC
   (latency spikes, stolen CPU) but memory that *does* get reclaimed. A **leak** =
   memory allocated and never released because something still references it, so
   it grows unbounded. Separate them with a **soak test** plus a **heap-profile
   diff** between two points — the diff shows what *grew* (the leak), whereas pure
   allocation churn doesn't accumulate.
7. The tell: efficiency *per request* is bad and gets *worse* as data grows
   (an N+1, an O(n²) loop, a missing cache) — scaling only delays the wall and
   multiplies cost. Track 21 framing: scaling infra around inefficient code is a
   **recurring bill** every hour forever; the code fix is a **one-time cost** that
   permanently lowers the run rate.

</details>

## Cumulative review

Closed book. Cover the answers and write each out before checking. These mix
concepts from modules 00-06.

1. Put the tools in order for a "the app is slow under load" investigation:
   load test, profiler/trace, autoscaler config, bottleneck signatures. What
   does each contribute and why that order?
2. An endpoint's latency is fine with test data but terrible in production, and
   it grows with the number of rows returned. Name the most likely bug, how
   you'd confirm it, and why more replicas won't fix it.
3. You have a CPU-bound hot path and an I/O-bound slow path. Which diagnostic
   tool for each, and how does this map onto whether a CPU-based HPA will fire?
4. Translate this SLO-plus-finding into a decision: "SLO is p95<300ms; at peak
   we're at 900ms; the pods are CPU-bound; the profile shows 70% of CPU in a
   function that recomputes the same result every request." Scale, fix, or both,
   and why?
5. A load test shows a clean throughput knee at 500 RPS with all server-side
   metrics calm and the k6 host CPU pinned. What's your diagnosis and next step?
6. Why does an N+1 query bug connect the code-level material of *this* module to
   the connection-pool bottleneck of module 05 and the databases of track 14?
7. You need to prove an autoscaler handles peak load *and* that the app isn't
   wasting resources per request. Sketch the two-part test plan, naming the
   executor type and the profiling step.
8. Distinguish, with the signature of each, three ways a service can be
   "unhealthy" while a naive latency threshold stays green (drawing on modules
   01, 03, and 05).
9. For a queue-driven worker (track 06 KEDA), you observe it scales but the
   queue still grows. Is this a scaling failure, a code-efficiency problem, or a
   downstream limit — and how would you tell which?
10. Give the FinOps framing (track 21) for choosing a one-time code fix over
    permanently scaled infrastructure, and one case where scaling infra is
    nonetheless the right call.

<details>
<summary>Show answers</summary>

1. **Load test** first (reproduce the pressure, get the symptom: p95 and which
   endpoint) → **bottleneck signatures** (module 05: which *resource* is the
   wall — CPU, pool, dependency, or the generator) → **profiler/trace** (why:
   which function or which waiting span) → **autoscaler config** (module 04:
   whether scaling on the right signal even helps). Order: you can't profile
   without pressure, can't aim the profiler without knowing the resource, and
   can't judge scaling until you know if the problem is even scalable.
2. **N+1 queries.** Confirm via `pg_stat_statements` / query log showing one
   query shape with hundreds of `calls` per request. More replicas won't fix it
   because each replica still runs the N+1 — you multiply the wasted queries and
   the DB/pool pressure (module 05); the fix is a code change (eager load / JOIN
   / batched IN).
3. CPU-bound → **CPU profiler + flame graph**; I/O/wait-bound → **distributed
   trace** (track 12). This maps onto HPA: a CPU-HPA fires for the compute-bound
   path (CPU crosses target) but stays *calm* for the wait-bound path (waiting
   burns no CPU) — module 04's trap.
4. **Fix the code (and scale to survive now).** The profile shows *wasteful*
   work — recomputing the same result every request — so scaling would rent
   four replicas to do redundant work forever. Cache/memoize the computation
   (one-time cost), which likely brings p95 under SLO on far fewer replicas;
   scale temporarily only if you need to hold SLO before the fix ships.
5. A **false bottleneck** — the *generator* is the limit, not the system (all
   server metrics calm, k6 host pinned). Next step: free/enlarge the generator
   (kill client-side load, or move to Azure Load Testing with more engines) and
   re-run; the real ceiling is higher.
6. N+1 makes each request issue many small queries, so it holds a DB
   *connection* far longer per request — which exhausts the app's connection
   pool (module 05) against the database's `max_connections` (track 14). The
   code-level bug (this module) is the *cause* of the infra-level pool
   bottleneck.
7. Part 1: an **open/arrival-rate** load test (module 03/04) that ramps to peak
   while you watch replica count and p95 on Grafana — proves scaling triggers
   and holds SLO. Part 2: while at peak, capture a **CPU profile / flame graph**
   (or trace) of a pod to confirm no single wasteful hot path / N+1 — proves the
   app isn't burning resources per request.
8. (a) **Fast error pages** — a latency-only threshold blesses instant 500s
   (module 01 ex 9); catch with an error-rate threshold. (b) **Uniform-cache
   test** — reports the cache's latency, not the backend's (module 03 ex 8). (c)
   **A downstream limit / one endpoint failing** — errors concentrated on one
   path while the aggregate looks okay (module 05); catch with per-endpoint tags
   and modeling the traffic mix.
9. Could be any of the three — tell them apart: if replicas are climbing but
   *below* max and the queue still grows, the **workers are too slow per
   message** (code efficiency — profile one worker) or a **downstream limit**
   caps each worker (check for 429s/timeouts); if replicas are pinned at max and
   the queue still grows, it's a genuine **capacity/scaling** limit (raise max /
   fix per-message cost). Reading whether it's at max, and whether each worker
   is CPU-bound vs. waiting, distinguishes them.
10. Scaling infra to serve inefficient code is a **recurring bill** — you pay
    for the extra replicas every hour forever; the code fix is a **one-time
    cost** that permanently lowers the run rate (track 21). Scaling infra is
    nonetheless right when the code is already efficient and you simply have
    more honest *work* to do (real traffic growth) — hardware is the correct,
    fast answer to linear, legitimate load.

</details>

## Next

[07-performance-testing-in-cicd](../07-performance-testing-in-cicd/README.md) —
everything so far has been run by hand; now automate a lightweight load test as
a pipeline gate so a performance regression is caught before it ships.
