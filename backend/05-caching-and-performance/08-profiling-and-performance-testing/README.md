# Module 08: Profiling and Performance Testing

## Why this matters

Module 05 gave you the *procedure* for finding a bottleneck — measure the top-
level symptom, decompose the request, follow the biggest number. This module
gives you the *instruments* that make the decomposition real: a profiler that
tells you exactly where CPU time goes, a flame graph that shows it at a glance,
and a load test that reveals how the system behaves under concurrent traffic
rather than in a single hand-timed request. Without these, "follow the biggest
number" is aspirational — you're back to guessing which function is slow.

The payoff is the recurring promise of the whole back half of the track: **the
actual bottleneck is very often not the assumed one.** Engineers routinely spend
days optimizing the function they *think* is slow, ship it, and see no
improvement — because a profiler would have shown the time was somewhere else
entirely (a surprise `json.dumps`, an accidental N+1 hidden behind an ORM
attribute, a regex compiled on every call). A profiler replaces a day of confident
wrong work with five minutes of correct diagnosis. This module is deliberately a
*light* intro to load testing — deep load/stress/soak testing is a large topic
that earns fuller treatment later in the curriculum — but you'll finish able to
profile a real FastAPI service, read its flame graph, drive load at it, and
interpret the two together to name the real bottleneck.

## Concepts

### Two kinds of profiler: deterministic vs sampling

A **profiler** answers "where does the time go?" There are two mechanisms, with
opposite tradeoffs:

- **Deterministic (tracing) profilers** — e.g. Python's built-in **`cProfile`** —
  instrument *every* function call and return, recording exact call counts and
  time spent. **Pros:** exact call counts (a function called 1,240,000 times is
  the N+1 smoking gun, unmissable), precise per-function timing, deterministic
  results. **Cons:** the instrumentation *itself* adds overhead (often 2–5×
  slowdown), which distorts timings and makes it unsuitable for production (you
  can't afford to 3× your prod latency) and can mislead on very fast functions
  where the measurement cost rivals the work. Best for: profiling a specific slow
  function or endpoint in development.
- **Sampling profilers** — e.g. **`py-spy`** — periodically (say 100×/second)
  interrupt the program and record the current call stack. Over enough samples,
  the fraction of samples a function appears in ≈ the fraction of time spent
  there (statistically). **Pros:** very *low overhead* (a few percent), so it runs
  against **production** and **live processes** without instrumenting them —
  `py-spy` can even attach to an already-running PID *without modifying or
  restarting it*. **Cons:** statistical, not exact (rare/fast events may be
  under-sampled; no exact call counts), and needs enough runtime to gather
  samples. Best for: "this production service is slow right now, what's it doing?"
  and any profiling where you can't afford tracing overhead.

The rule: **`cProfile` when you can reproduce it in dev and want exact numbers;
`py-spy` when it's in production or you need to attach to a live process cheaply.**
They're complementary, not competitors.

### Reading cProfile output

`cProfile` produces a table. The columns that matter:

```
   ncalls  tottime  percall  cumtime  percall filename:lineno(function)
        1    0.001    0.001    2.104    2.104 handler.py:10(get_report)
      500    0.004    0.000    1.980    0.004 repo.py:22(load_orders)
      500    1.850    0.004    1.850    0.004 {method 'execute' of ...}   <- 500 queries!
        1    0.100    0.100    0.120    0.120 render.py:5(serialize)
```

- **`ncalls`** — how many times the function was called. **The N+1 detector**: a
  function you expected to call once showing up 500× is the whole diagnosis in one
  column.
- **`tottime`** — total time spent *in this function itself*, **excluding**
  time in functions it called. High `tottime` = the work is *here*.
- **`cumtime`** — *cumulative* time in this function *including* everything it
  called. High `cumtime` but low `tottime` = this function is slow because of
  what it *calls*, not itself (follow the call chain down).
- **`percall`** — `tottime`/`ncalls` (per-call self time) and
  `cumtime`/`ncalls`.

Reading strategy: **sort by `cumtime` to find the slow *path* from the top; sort
by `tottime` to find the slow *function* doing the actual work; and scan `ncalls`
for anything called a surprising number of times.** The example above screams
N+1: `execute` called 500× with 1.85s total `tottime` — the bottleneck is the
*number* of queries, not any one being slow (exactly module 05's N+1 shape, now
visible in the profiler).

### Flame graphs: the whole profile at a glance

A **flame graph** visualizes a (usually sampling) profile as stacked bars:

- **The x-axis is *proportion of samples* (≈ proportion of time), NOT time
  order.** Width = how much total time was spent in that function and its
  children. A wide box is where the time went; a narrow box is cheap. (Do not read
  left-to-right as chronological — the ordering is typically alphabetical or by
  merge, meaningless as a timeline.)
- **The y-axis is stack depth** — each box sits on top of its caller. The box at
  the bottom is the entry point; boxes above are what it called, and what those
  called, up the stack.
- **You read it top-down for width.** Scan across the top for **wide plateaus** —
  a wide box high up in the stack is a function where the program spends a lot of
  time *at the leaf* (doing actual work, not just calling down). That plateau is
  your bottleneck. Following its tower *down* shows the call path that led there.

The skill is one glance: **the widest towers/plateaus are where the time is.** A
flame graph makes "80% of the time is in this one call path" visually obvious in a
way a 500-row cProfile table doesn't. `py-spy record -o out.svg` produces one
directly from a live process; `speedscope` renders them interactively.

A related view, `py-spy top`, is a live, `htop`-style rolling display of which
functions are consuming CPU *right now* in a running process — perfect for a quick
"what is this stuck server doing?" without generating a full graph.

### async and multi-process caveats

Two things trip people up profiling real backends:

- **Profiling async code:** a coroutine spends most of its time `await`ing
  (idle), and a CPU-sampling profiler samples the *stack*, so an I/O-bound async
  handler shows lots of time in the event loop / awaiting — which is *correct*
  (it *is* waiting) but not a "hot" CPU function to optimize. When profiling
  async, distinguish *CPU time* (what a sampler catches at the leaves — real
  computation to optimize) from *wall-clock wait* (the awaits — an I/O bottleneck
  to attack with concurrency/caching/query fixes, module 05's utilization check).
  `py-spy`'s `--idle` flag controls whether idle/waiting threads are included.
- **Profiling multiple processes/workers:** a production FastAPI runs several
  `uvicorn`/`gunicorn` worker processes. `cProfile` sees only the process it's in;
  `py-spy` can target a specific PID, and with `--subprocesses` follow children.
  Profile a representative worker, and remember load must actually reach the one
  you're watching.

### Load testing: measuring behavior under concurrency

A profiler tells you where time goes in *one* execution; a **load test** tells you
how the system behaves under *many concurrent* requests — which is a different and
essential question, because module 05's throughput problems (queuing, pool
exhaustion, the stampede) only appear under concurrency. A single hand-timed
request can look perfect while the system falls over at 50 RPS.

The vocabulary (kept light — the deep version comes later in the curriculum):

- **Load test:** apply a realistic, sustained request rate/concurrency and
  measure the response. The outputs you care about are module 05's metrics:
  **throughput** (RPS achieved), **latency distribution** (p50/p95/p99, *not*
  average), and **error rate** (requests failing/timing out).
- **The core relationship (Little's Law, informally):** as offered load rises,
  throughput rises *until* a resource saturates; past that point throughput
  plateaus (or drops) and **latency climbs steeply** as requests queue. Finding
  that knee — the max sustainable throughput before latency explodes — is the main
  goal of a basic load test.
- **Types (named for orientation, not covered deeply here):** a *load* test at
  expected traffic; a *stress* test past the limit to see how it fails; a *soak*/
  endurance test at sustained load for hours to catch leaks (module 06's slow
  strangulation) and memory growth. This module does the first; the curriculum's
  later dedicated treatment does the rest.

The essential discipline, same as module 05: **report percentiles and error
rate, drive realistic concurrency, and change one thing at a time.** A load test
whose result is "average latency was 30ms" told you almost nothing.

### Closing the loop: profile + load test → the *real* bottleneck

The two instruments combine into the payoff. The workflow:

1. **Load test** to reproduce the problem under realistic concurrency and get the
   top-level numbers (p99, RPS, errors) — confirming there's a real problem and
   whether it's latency- or throughput-shaped (module 05, step 1).
2. **Profile** a representative worker *while the load runs* (attach `py-spy` to
   its PID, or `cProfile` a reproduced single slow path) to see where the time
   actually goes (step 2 — decompose).
3. **Read the flame graph / cProfile table** for the widest plateau / highest
   `cumtime`/`tottime` / surprising `ncalls` — the *measured* bottleneck, which is
   frequently *not* what you assumed.
4. **Fix that one thing** with the right tool from the track (a cache, an
   eager-load/batch, a concurrency fix, a leak fix, an atomic op) and **re-load-
   test** to prove the top-level metric moved (steps 4–5).

The whole point, restated: you do not optimize what you *believe* is slow; you
optimize what the profiler *shows* is slow. The gap between those two is where
most wasted performance work lives.

## Command reference

| Tool / command | Purpose | Example |
|---|---|---|
| `python -m cProfile -s cumtime script.py` | Deterministic profile, sorted by cumulative time | one-shot script profiling |
| `cProfile.Profile()` + `pstats` | Programmatic profiling of a code block | wrap a slow function |
| `pstats.Stats(p).sort_stats('tottime').print_stats(15)` | Top 15 by self-time | find the hot function |
| `py-spy top --pid <PID>` | Live top-style view of a running process | "what's it doing now?" |
| `py-spy record -o prof.svg --pid <PID> --duration 30` | Record a flame graph from a live process | production profiling |
| `py-spy record -o prof.svg -- python app.py` | Launch + record a flame graph | dev profiling |
| `py-spy dump --pid <PID>` | One-shot stack dump of every thread | a hung/stuck process |
| `--idle` / `--subprocesses` (py-spy) | Include waiting threads / follow workers | async / multi-worker |
| `hey -z 30s -c 50 <url>` | Load test: 50 concurrent for 30s, prints latency dist | throughput + p99 |
| `wrk -t4 -c100 -d30s <url>` | Higher-throughput load test | many connections |
| `locust` (`locustfile.py`) | Scriptable, scenario-based load testing in Python | realistic user flows |

Profiling a code block programmatically and printing the useful sorts:

```python
import cProfile, pstats, io

def profile(fn, *args, **kwargs):
    pr = cProfile.Profile()
    pr.enable()
    result = fn(*args, **kwargs)
    pr.disable()
    s = io.StringIO()
    stats = pstats.Stats(pr, stream=s).sort_stats("cumtime")
    stats.print_stats(15)          # slow *paths* (top-down)
    stats.sort_stats("tottime").print_stats(15)  # slow *functions* (actual work)
    print(s.getvalue())
    return result

profile(generate_report, report_id=42)   # -> scan ncalls for surprises, cumtime for the path
```

A minimal `locust` scenario (scriptable load with realistic behavior):

```python
# locustfile.py  — run: locust -f locustfile.py --headless -u 50 -r 10 -t 30s --host http://localhost:8000
from locust import HttpUser, task, between

class ApiUser(HttpUser):
    wait_time = between(0.1, 0.5)     # think-time between requests

    @task(3)                          # weight 3: hit the report 3x as often
    def report(self):
        self.client.get("/report?quarter=Q3&region=EU")

    @task(1)
    def health(self):
        self.client.get("/health")
```

## Hands-on exercises

`pip install py-spy locust` and a load tool (`hey`/`wrk`). Reuse a FastAPI +
Postgres + Redis app from earlier modules; a deliberately slow endpoint is ideal
(you'll build the fully-slow one in the capstone). On Linux, `py-spy` attaching to
a PID may need `sudo` or `--cap-add SYS_PTRACE` in Docker.

### 1. cProfile a slow script and read the table

Write a script that calls a function doing an N+1-style loop (500 tiny queries or
500 tiny function calls). Run `python -m cProfile -s cumtime script.py` and also
`-s tottime`.

Expected: sorted by `cumtime`, the top is your entry function (it *contains*
everything); sorted by `tottime`, the real work surfaces; and `ncalls` shows the
inner call happening 500×. Practice pointing at the exact line and column that
proves it's an N+1 (the 500 in `ncalls`), not a single slow call.

### 2. Distinguish `tottime` from `cumtime`

Profile a function `outer()` that spends 0.01s itself but calls `inner()` which
takes 2s. Read both columns for `outer`.

Expected: `outer` has low `tottime` (0.01s — it barely works itself) but high
`cumtime` (2.01s — because of `inner`). Conclude the rule: high `cumtime` + low
`tottime` means "follow the call chain down"; high `tottime` means "the work is
right here." This is how you navigate a deep profile without getting lost.

### 3. Generate and read a flame graph with py-spy

Start a small program with a known hot function (a wide plateau) plus some cheap
ones. Run `py-spy record -o prof.svg -- python app.py` (or attach to its PID).
Open the SVG in a browser.

Expected: the hot function is a **wide box/plateau**; the cheap ones are narrow
slivers. Confirm the x-axis is *proportion*, not time order (the boxes aren't
chronological), and that following the wide box *downward* shows its call path.
You've read a flame graph the correct way: widest = where the time is.

### 4. Attach py-spy to a live server without restarting it

Start your FastAPI app (`uvicorn app:app`), note its PID (`ps`/`docker top`),
drive some load at a slow endpoint, and in another terminal run `py-spy top --pid
<PID>`.

Expected: a live, rolling view of which functions are eating CPU *right now* —
without you having added any instrumentation or restarted the process. This is the
production superpower: diagnosing a running, un-cooperative service in place. Note
how little it slows the server (sampling overhead is a few percent), unlike
cProfile.

### 5. Load test and read the distribution, not the average

Point `hey -z 30s -c 50 http://localhost:8000/<slow-endpoint>` at your service.
Read the full output: RPS, and the latency histogram/percentiles.

Expected: a throughput number and a latency *distribution* — note the gap between
p50 and p99 (the tail from module 05). Deliberately compute the average from the
histogram and confirm it hides the p99 pain. Then raise `-c` (concurrency) and
watch RPS plateau while p99 climbs — the saturation knee.

### 6. Find the saturation knee

Run the load test at `-c 1, 5, 10, 25, 50, 100` (or a `locust` ramp). Tabulate
RPS and p99 at each.

Expected: RPS rises with concurrency until a resource saturates, then plateaus
while p99 climbs steeply — the knee. Identify (with `docker stats` / a py-spy on
the worker) *which* resource saturated (app CPU? DB CPU? pool exhausted?). You've
measured the system's real capacity, not just its best-case single-request speed.

### 7. Profile under load to find the *real* bottleneck

While exercise 5's load runs, attach `py-spy record` to the worker for 30s and
open the flame graph. Compare what the graph says is the widest plateau to what
you *assumed* was slow before looking.

Expected: often a surprise — the widest plateau is something you didn't expect
(serialization, an accidental N+1 behind an ORM attribute, a per-request regex
compile, connection setup). Write down the assumed bottleneck vs the measured one.
This gap *is* the module's thesis.

### 8. Diagnose and fix: the flame graph that contradicts the assumption

A `/search` endpoint is slow under load. The team is sure it's the database and
has spent a day tuning indexes with no improvement. You attach `py-spy` under load
and the flame graph shows: ~8% of samples in `asyncpg` (the DB), ~15% in
`json.dumps`, and a **~70%-wide plateau** in a function `highlight_matches` that,
you find, compiles a regular expression with `re.compile(...)` *inside a loop over
every result on every request*. Diagnose, prescribe the fix, and explain the
team's process error.

<details>
<summary>Answer</summary>

The flame graph flatly contradicts the assumption: the database is only ~8% of
the time, so no amount of index tuning could meaningfully help (Amdahl's Law,
module 05 — you can't win more than ~8% by optimizing an 8% component, which is
exactly why the day of index work did nothing). The **real bottleneck is the
~70% plateau in `highlight_matches`**, caused by **compiling the same regex on
every iteration of a per-result loop on every request** — pure CPU waste repeated
N×M times. Fix: compile the regex **once** (module-level, or once per request
before the loop) and reuse the compiled pattern — turning thousands of
`re.compile` calls into one. Secondary: the 15% in `json.dumps` suggests an
oversized payload (module 06 — field-selection/compression) worth a follow-up
once the plateau is gone. Process error: they **assumed** the bottleneck (the DB)
and optimized it for a day *without ever profiling* — a five-minute `py-spy`
flame graph would have shown the DB was 8% and the regex compile was 70% before
they touched a single index. Profile first; optimize what the profiler shows, not
what you believe.

</details>

## Independent challenge

No code given. Take the slowest endpoint in your app (or build a deliberately
slow one — you'll need exactly this for the capstone). First, **load test** it
with `hey`/`wrk`/`locust` and record the honest top-level numbers: RPS, p50/p95/
p99, and error rate at a realistic concurrency, and find the saturation knee by
ramping concurrency. Second, *before profiling*, write down your **guess** at the
bottleneck. Third, **profile** it — `cProfile` for a reproduced single slow path
to get exact `ncalls`/`tottime`/`cumtime`, and `py-spy` attached to the live
worker *under load* to get a flame graph — and identify the widest plateau /
highest self-time / most surprising call count. Fourth, compare the measured
bottleneck to your guess and note the gap. Fifth, apply the single right fix from
the track (caching, eager-load/batch, a concurrency/async fix, a leak fix, an
atomic op, a compile-once) and **re-load-test** to prove the top-level p99 and RPS
actually moved. Keep every before/after number and the flame graphs. Reach back to
**05-performance-bottlenecks-and-identifying-them**: this is that module's
procedure, now executed with real instruments instead of hand-timing.

<details>
<summary>Hint</summary>

Use the two profilers for what each is good at: `cProfile` when you can reproduce
the slow path in dev and want *exact* call counts (the `ncalls` column is the N+1
smoking gun) and precise self-vs-cumulative time; `py-spy` when you want to attach
to the *live* server under load with negligible overhead and get a flame graph
whose *widest plateau* is the bottleneck (remember the x-axis is proportion of
time, not chronological order). Profile *while the load test runs* so you catch
behavior under concurrency, not a cold single request. The likely surprises — the
places the measured bottleneck diverges from the guess — are serialization
(`json.dumps` on a fat payload), an accidental N+1 hidden behind a lazy ORM
attribute (a function with a huge `ncalls`), per-request work that should be done
once (a compiled regex, a re-created client), or an event-loop-blocking call
(module 07). Whatever it is, fix only that, then re-load-test to prove the
top-level metric moved — an improvement in a profiler percentage that doesn't show
up in p99/RPS wasn't the real bottleneck.

</details>

## Common mistakes & troubleshooting

- **Optimizing without profiling.** The cardinal sin — a day tuning the assumed
  bottleneck that a five-minute profile shows is 8% of the time (exercise 8).
  Profile first, always.
- **Using cProfile in production.** Its tracing overhead (2–5×) is unacceptable
  on a live service and distorts timings. Use `py-spy` (sampling, low overhead) in
  production; cProfile in dev.
- **Reading a flame graph left-to-right as a timeline.** The x-axis is proportion
  of time, not chronological order. Read it for *width* (widest = hottest), not
  sequence.
- **Confusing `tottime` and `cumtime`.** High `cumtime`/low `tottime` means the
  function is slow because of what it *calls* (go down); high `tottime` means the
  work is *in* it. Sort by both.
- **Ignoring `ncalls`.** A function called a shocking number of times is an N+1
  or repeated-work bug — often the whole diagnosis, and easy to miss if you only
  look at time columns.
- **Reporting average latency from a load test.** The average hides the tail;
  report p50/p95/p99 and error rate. An "average was fine" load test is nearly
  worthless.
- **Load testing at unrealistic concurrency (or just `-c 1`).** Single-request
  timing misses queuing, pool exhaustion, and stampedes — the throughput problems
  only appear under concurrency. Drive realistic load and find the knee.
- **Profiling the wrong worker / no load reaching it.** In a multi-worker server,
  attach to the worker actually handling traffic (or use `--subprocesses`), and
  make sure load reaches the process you're sampling.
- **Treating a profiler improvement as done without re-load-testing.** A better
  profile percentage that doesn't move the top-level p99/RPS wasn't the real
  bottleneck — always close the loop by re-measuring the user-facing metric.

## Checkpoint quiz

Write down your answer to each question before expanding it — checking without attempting first is the single easiest way to fool yourself into thinking you've learned this.

1. What's the difference between a deterministic (tracing) profiler like cProfile
   and a sampling profiler like py-spy, and when do you use each?
2. In cProfile output, what do `ncalls`, `tottime`, and `cumtime` each tell you,
   and how do you use `tottime` vs `cumtime` to navigate a deep profile?
3. On a flame graph, what do the x-axis and y-axis represent, and how do you find
   the bottleneck at a glance? What must you NOT infer from the x-axis?
4. Why can py-spy profile a production service when cProfile can't, and what can
   py-spy do to a *running* process that's especially useful for a stuck server?
5. Why is a load test necessary in addition to a profiler — what class of problem
   only appears under concurrency, and what happens to throughput and latency as
   offered load passes the saturation point?
6. Describe the combined workflow (load test + profile) for finding the *real*
   bottleneck, and state the module's thesis about assumed vs measured
   bottlenecks.

<details>
<summary>Answers</summary>

1. A **deterministic/tracing** profiler (cProfile) instruments every call/return
   for *exact* counts and timings but adds heavy overhead (2–5×), so it's for
   *dev* profiling of a reproducible slow path. A **sampling** profiler (py-spy)
   periodically records the stack for *statistical* results with *low* overhead
   (a few %), so it can run in *production* and attach to live processes. Use
   cProfile when you can reproduce it and want exact numbers; py-spy in production
   or to attach cheaply to a live/stuck process.
2. `ncalls` = how many times the function was called (a surprising count is the
   N+1 detector); `tottime` = time in the function *itself* excluding callees
   (the work is here); `cumtime` = cumulative time *including* callees. Navigate
   by sorting on `cumtime` to find the slow *path* from the top and following high
   cumtime/low tottime functions *down* to their expensive callees, and sorting on
   `tottime` to find the function doing the actual work.
3. X-axis = *proportion of samples/time* spent in a function and its children
   (width = how hot); y-axis = *stack depth* (each box sits on its caller). Find
   the bottleneck by scanning for the **widest boxes/plateaus** (that's where the
   time is) and following that tower down for the call path. You must NOT read the
   x-axis as a *timeline* — the horizontal order is not chronological.
4. cProfile's tracing overhead (2–5×) would cripple a live service and distort its
   timings; py-spy samples with only a few percent overhead, so it's safe in prod.
   Especially useful: py-spy can **attach to an already-running PID without
   restarting or modifying it** (`py-spy top`/`dump`) — so you can see what a
   stuck/slow production process is doing *right now* in place.
5. A profiler measures one execution; throughput problems — queuing, connection-
   pool exhaustion, cache stampedes, lock contention — only manifest under
   *concurrent* load, and a fine single-request timing can hide a system that
   collapses at 50 RPS. Past the saturation point, throughput **plateaus (or
   drops)** while latency **climbs steeply** as requests queue behind the saturated
   resource — the knee a load test is designed to find.
6. (1) Load-test to reproduce the problem under realistic concurrency and get
   top-level p99/RPS/error numbers; (2) profile a representative worker *while the
   load runs* (py-spy attach, or cProfile a reproduced path); (3) read the flame
   graph / table for the widest plateau / highest tottime-cumtime / surprising
   ncalls — the *measured* bottleneck; (4) fix that one thing and re-load-test to
   prove the top-level metric moved. Thesis: **the real bottleneck is frequently
   not the assumed one — optimize what the profiler shows is slow, not what you
   believe is slow.**

</details>

## Next

[09-capstone-project](../09-capstone-project/README.md) — you now have every tool
the track teaches: caching at every layer and strategy, eviction and
invalidation, the bottleneck-hunting procedure, batching and leak-avoidance and
offloading, concurrency vs parallelism, and the profilers and load tests to find
the truth. The capstone hands you a deliberately, realistically *slow* FastAPI +
Postgres + Redis service and asks you to profile it, find the top three
bottlenecks, and fix each with the right technique — with before/after numbers
required.
