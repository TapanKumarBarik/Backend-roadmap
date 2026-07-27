# Module 07: Concurrency and Parallelism

## Why this matters

Module 06 kept reaching for "overlap the waits" and "do the work in a worker"
without saying how. This module says how — and confronts the single most
misunderstood pair of words in backend performance: **concurrency** and
**parallelism**. They are not synonyms, they solve *different* problems, and using
the wrong one gives you code that's more complex and no faster (or slower). The
canonical Python mistake — reaching for `multiprocessing` to speed up a web
handler that's waiting on a database, or `asyncio` to speed up a CPU-bound
computation — comes straight from conflating them.

You need this because a backend's two performance regimes need opposite tools.
Most backend work is **I/O-bound** — waiting on a database, a cache, another
service, a disk — and the right tool is *concurrency* (async/await, event loops):
one thread juggling thousands of waits. Some backend work is **CPU-bound** —
crunching numbers, parsing, compressing — and the right tool is *parallelism*
(multiple processes on multiple cores). Python's **GIL** is why that distinction
is sharper in Python than almost anywhere else, and getting it wrong is why an
`async def` endpoint can freeze your entire server. And concurrency of any kind
reintroduces **race conditions** — the same shape you already saw in the caching
races of modules 01 and 04, now as a first-class hazard.

## Concepts

### Concurrency is not parallelism

The crisp definitions (Rob Pike's framing is the standard):

- **Concurrency is *dealing with* many things at once** — a structure where
  multiple tasks are *in progress* and make progress by interleaving, but not
  necessarily *executing simultaneously*. One cook juggling five dishes: while
  the pasta boils, they chop vegetables; while the sauce simmers, they plate the
  starter. One cook (one core), but nothing sits idle waiting. Concurrency is
  about *not blocking on waits*.
- **Parallelism is *doing* many things at once** — multiple tasks literally
  executing at the same instant on multiple execution units (CPU cores). Five
  cooks each cooking one dish simultaneously. Parallelism is about *using more
  hardware to do more work per unit time*.

The relationship: parallelism *requires* multiple cores; concurrency does not. A
single core can be concurrent (interleaving tasks) but not parallel. You can have
concurrency without parallelism (one async event loop), parallelism without much
"concurrency structure" (a parallel `map` over independent data), or both (an
async server running on multiple processes). The reason it matters for
performance is *what each one speeds up*, which depends entirely on whether the
work is waiting or computing.

### I/O-bound vs CPU-bound: the distinction that picks your tool

Every workload is dominated by one of two things:

- **I/O-bound work** spends most of its time *waiting* for something external —
  a database query to return, a Redis `GET` to come back over the network, an
  HTTP call to another service, a file to read from disk. During that wait, the
  CPU is **idle** — there's literally nothing to compute, just waiting for bytes
  to arrive. Most backend request handling is I/O-bound.
- **CPU-bound work** spends most of its time *computing* — the CPU is pinned at
  100%, actively doing arithmetic/parsing/compression with no waiting. Image
  resizing, cryptographic hashing, parsing a huge document, a big in-memory
  aggregation.

This distinction *is* the tool-selection rule:

- For **I/O-bound** work, **concurrency** is the win. While one task waits on
  I/O (doing nothing), a single thread/event loop can switch to another task that
  has work to do. One thread handles thousands of simultaneous waits by
  interleaving them — because the bottleneck was *waiting*, not *computing*, and
  you don't need more cores to wait faster. This is why async servers handle huge
  connection counts on modest hardware.
- For **CPU-bound** work, **parallelism** is the win. The bottleneck is actual
  computation, so the only way to do more per unit time is *more cores working
  simultaneously* — multiple processes. Concurrency alone does nothing for
  CPU-bound work: interleaving tasks that all want the CPU on a single core just
  time-slices the same core, finishing no sooner (and adding overhead).

Getting this backward is the classic error: async/await gives *zero* speedup to a
CPU-bound computation (there are no waits to overlap), and spinning up processes
for I/O-bound work is wasteful overhead (you didn't need more cores to wait). The
first question of any concurrency decision is always: **is this work waiting or
computing?**

### async/await and the event loop (concurrency for I/O)

Python's `asyncio` implements concurrency via a single-threaded **event loop**.
The model:

- An `async def` function is a **coroutine**. When it hits an `await` on
  something that will take time (an async I/O operation), it **yields control
  back to the event loop** instead of blocking — signaling "I'm waiting; run
  something else." The loop switches to another ready coroutine. When the awaited
  I/O completes, the loop resumes the first coroutine where it left off.
- This is **cooperative** multitasking: a coroutine keeps the CPU until it
  chooses to `await`. Nothing preempts it. That's efficient (switch points are
  cheap and explicit, no locking needed for single-threaded code) — and it's the
  source of the footgun below.
- The payoff: one thread, one core, thousands of concurrent I/O operations *in
  flight* at once, because each spends its time awaiting (idle) and the loop keeps
  the one thread busy servicing whichever ones are ready. Perfect for I/O-bound
  request handling.

```python
import asyncio, httpx

async def fetch(client, url):
    r = await client.get(url)          # yields to the loop while waiting on the network
    return r.status_code

async def main(urls):
    async with httpx.AsyncClient() as client:
        # all requests are in flight concurrently on ONE thread; total time ≈ the slowest,
        # not the sum, because the waits overlap
        return await asyncio.gather(*(fetch(client, u) for u in urls))
```

**The event-loop footgun (critical for FastAPI).** Because the loop is *one
thread* and multitasking is *cooperative*, a coroutine that does **blocking**
work — a synchronous DB driver call, `time.sleep()`, a CPU-heavy loop, a
`requests.get()` — never yields, so it **freezes the entire event loop**: every
other request on that worker stalls until it finishes. In an `async def` FastAPI
handler you must `await` non-blocking I/O (use async drivers: `asyncpg`,
`redis.asyncio`, `httpx.AsyncClient`), and push any unavoidable blocking/CPU work
off the loop (`await asyncio.to_thread(...)` for blocking I/O, a process pool for
CPU work). This is the single most common async-Python performance bug, and it's
worse than not using async at all — one slow blocking call takes down *all*
concurrent requests on the worker, not just its own. (FastAPI's escape hatch: a
plain `def` handler is run in a threadpool automatically, so blocking code there
is safe — but a blocking call inside an `async def` is the trap.)

### Processes, threads, and the GIL (parallelism in Python)

Python has three concurrency primitives, and the **GIL** decides what each is good
for:

- **The Global Interpreter Lock (GIL)** is a mutex in CPython that allows **only
  one thread to execute Python bytecode at a time**, even on a multi-core
  machine. It exists to make CPython's memory management simpler and
  single-threaded code fast. Its consequence is stark: **Python threads cannot run
  Python bytecode in parallel** — multithreading does *not* give you CPU
  parallelism for pure-Python work.
- **Threads (`threading`)** are therefore useful in Python for **I/O-bound
  concurrency**, not CPU parallelism: a thread blocked on I/O *releases the GIL*
  while it waits (so other threads run), and many C-level I/O operations release
  it too. So threads let you overlap I/O waits (like async, but preemptive and
  heavier). But for CPU-bound pure-Python work, threads are pointless — the GIL
  serializes them onto one core, and you get no speedup (often a slight slowdown
  from contention).
- **Processes (`multiprocessing` / `ProcessPoolExecutor`)** are how you get real
  **CPU parallelism** in Python: each process has its *own* Python interpreter
  and its *own* GIL, so N processes genuinely run Python bytecode on N cores
  simultaneously. The cost is that processes don't share memory (data must be
  *serialized* and copied between them — real overhead) and are heavier to start.
  This is the tool for CPU-bound work.

So the Python-specific tool matrix:

| Work is... | Best tool | Why |
|---|---|---|
| I/O-bound, high concurrency | `asyncio` (async/await) | one thread, thousands of overlapping waits, cheap |
| I/O-bound, simpler / blocking libs | `threading` / threadpool | threads release the GIL on I/O; overlaps waits |
| CPU-bound | `multiprocessing` / process pool | each process has its own GIL → true multi-core parallelism |
| CPU-bound inside an async app | offload to a process pool | keeps the CPU work off the event-loop thread |

(A live caveat as of this curriculum's timeframe: recent CPython has an
experimental *free-threaded* build that can disable the GIL, and per-interpreter
GILs are emerging — but the mainstream, production-default assumption remains "the
GIL serializes Python bytecode, so use processes for CPU parallelism." Know the
default; know the exceptions are coming.)

### Race conditions and how to avoid them

The moment two things run concurrently *and* touch shared mutable state, you can
get a **race condition**: the result depends on the unpredictable *timing* of who
does what when, and can be wrong. You've already met this shape twice — the
concurrent-repopulation cache race (module 01) and the stampede (module 04). Now
name it directly.

The canonical example is a non-atomic **read-modify-write**:

```
# two workers both do: balance = read(); balance += 100; write(balance)
# interleaved badly:
worker A reads balance = 500
worker B reads balance = 500     # B read before A wrote
worker A writes 600
worker B writes 600              # B's write clobbers A's — one +100 is LOST
# final balance is 600, should be 700
```

Both increments "happened," but one was lost because read-modify-write wasn't
**atomic** (indivisible). This is the root of a huge class of concurrency bugs:
lost updates, double-processing, check-then-act races (check a seat is free, then
book it — two requests both check "free" before either books, double-booking).

Ways to avoid them, cheapest first:

- **Don't share mutable state.** The best defense: if tasks operate on
  independent data (no shared writeable state), there's no race. Immutable data
  and per-task-local state are race-free by construction. Async's single-threaded
  model helps here — between `await` points, a coroutine runs uninterrupted, so
  non-`await` critical sections are implicitly atomic (but an `await` in the
  middle is a yield point where another coroutine *can* interleave — so
  read-`await`-write is still racy even in async).
- **Make the operation atomic.** Push the read-modify-write down to something
  that does it indivisibly: a database `UPDATE balance = balance + 100`
  (atomic in the DB, and with proper isolation/locking — track 04 module 04),
  or Redis `INCRBY` (atomic on the server). This is usually the *right* backend
  answer — let the datastore's atomicity do the work rather than coordinating in
  app code.
- **Use a lock/mutex** to serialize access to a critical section so only one
  task is inside at a time (`threading.Lock`, `asyncio.Lock`, or a *distributed*
  lock in Redis for cross-process — module 04's stampede lock, track 10 for the
  hard version). Locks are correct but cost concurrency (they serialize) and add
  deadlock risk (two locks acquired in different orders) — reach for atomic
  operations first.
- **Use higher-level safe structures** — a `queue.Queue` (thread-safe) or
  `asyncio.Queue` to hand work between tasks without sharing raw state, so the
  synchronization is built in.

The rule: **shared mutable state + concurrency = races, unless every access is
atomic or serialized.** In backends, the highest-leverage move is usually to make
the datastore do the atomic operation (DB `UPDATE ... = ... + n`, Redis `INCR`)
rather than read-modify-write in your (concurrent) application code.

## Command reference

| API | Purpose | Example |
|---|---|---|
| `async def` / `await` | Define/await a coroutine (yields to loop on I/O) | `await client.get(url)` |
| `asyncio.gather(*coros)` | Run many coroutines concurrently, collect results | overlap N I/O calls |
| `asyncio.to_thread(fn, *a)` | Run a *blocking* call off the event loop | `await asyncio.to_thread(block_io)` |
| `asyncio.Lock()` | Serialize an async critical section | `async with lock:` |
| `asyncio.Queue()` | Hand work between coroutines safely | producer/consumer |
| `ThreadPoolExecutor` | I/O-bound concurrency with blocking libs | `executor.map(fetch, urls)` |
| `ProcessPoolExecutor` | **CPU** parallelism (own GIL per process) | `executor.map(hash_it, blobs)` |
| `multiprocessing.Pool` | Same, process-based parallel map | `pool.map(cpu_fn, data)` |
| `threading.Lock()` | Serialize a threaded critical section | `with lock:` |
| `r.incr(key)` / DB `UPDATE x = x + n` | **Atomic** read-modify-write (no app-side race) | avoid lost updates |

I/O-bound: async vs sequential (concurrency wins because waits overlap):

```python
import asyncio, time, httpx

async def fetch_all(urls):
    async with httpx.AsyncClient() as c:
        start = time.perf_counter()
        results = await asyncio.gather(*(c.get(u) for u in urls))  # concurrent
        print(f"{len(urls)} calls in {time.perf_counter()-start:.2f}s (≈ slowest one)")
        return results
# 20 URLs each taking ~0.5s finish in ~0.5s concurrently, vs ~10s done sequentially.
```

CPU-bound: threads (no help — GIL) vs processes (real parallelism):

```python
from concurrent.futures import ThreadPoolExecutor, ProcessPoolExecutor
import time

def cpu_heavy(n):                      # pure-Python CPU work
    return sum(i * i for i in range(n))

data = [10_000_000] * 8

def bench(Executor, label):
    start = time.perf_counter()
    with Executor(max_workers=8) as ex:
        list(ex.map(cpu_heavy, data))
    print(f"{label}: {time.perf_counter()-start:.2f}s")

bench(ThreadPoolExecutor, "threads")    # ~ same as serial: GIL serializes bytecode
bench(ProcessPoolExecutor, "processes") # ~ Ncores× faster: each process has its own GIL
```

Avoiding a race with an atomic operation instead of read-modify-write:

```python
# RACY: read-modify-write across concurrent requests loses updates
count = int(r.get("views") or 0); r.set("views", count + 1)   # DON'T
# SAFE: the increment is atomic on the Redis server — no interleaving possible
r.incr("views")                                                # DO
# Same idea in SQL: UPDATE posts SET views = views + 1 WHERE id = :id  (atomic in the DB)
```

## Hands-on exercises

`pip install httpx redis`. A multi-core machine shows the process speedup best.
Redis/Postgres running for the atomicity exercises.

### 1. Feel I/O-bound concurrency

Fetch 20 URLs (use `https://httpbin.org/delay/1` or a local slow endpoint)
sequentially with `requests` in a loop, then concurrently with `asyncio.gather` +
`httpx.AsyncClient`. Time both.

Expected: sequential ≈ 20 × 1s ≈ 20s; concurrent ≈ ~1s (≈ the slowest single
call) — the waits overlapped on one thread. This is concurrency winning for
I/O-bound work, and *why* async servers scale to huge connection counts.

### 2. Prove async does nothing for CPU-bound work

Run `cpu_heavy` (from Command reference) 8 times sequentially, then 8 times via
`asyncio.gather` wrapping it in coroutines (no `to_thread`). Time both.

Expected: **no speedup** — the async version is the same (or slightly slower).
There are no `await`-able waits in pure computation, so the event loop can't
overlap anything; it runs them one after another on one thread. Concurrency is
the wrong tool for CPU-bound work — the lesson made undeniable.

### 3. Prove processes beat threads for CPU-bound work

Run the `bench(ThreadPoolExecutor)` vs `bench(ProcessPoolExecutor)` comparison
from the Command reference on a multi-core machine.

Expected: threads ≈ serial time (the GIL serialized the pure-Python work onto one
core); processes ≈ several times faster (up to ~core-count), because each process
has its own interpreter and GIL and truly ran on a separate core. You've seen the
GIL's effect and *why* CPU parallelism needs processes in Python.

### 4. Show threads *do* help I/O-bound work (GIL released on I/O)

Repeat exercise 1's I/O fetches but with `ThreadPoolExecutor` and blocking
`requests`. Time it.

Expected: nearly as fast as the async version — threads overlap the I/O waits
because a thread blocked on I/O *releases the GIL*, letting others run. Conclude:
the GIL blocks CPU parallelism, not I/O concurrency — so both async and threads
work for I/O; async just does it cheaper at high connection counts.

### 5. Freeze an event loop with a blocking call (the FastAPI footgun)

Build a FastAPI app with two `async def` endpoints: `/fast` (returns instantly)
and `/block` (calls `time.sleep(5)` — a *blocking* sleep, not `await
asyncio.sleep`). Hit `/block`, and *while it runs*, hit `/fast` from another
terminal.

Expected: `/fast` **hangs** until `/block` finishes — the blocking `time.sleep`
froze the single event-loop thread, stalling every other request on that worker.
Now fix `/block` to `await asyncio.sleep(5)` (or `await
asyncio.to_thread(time.sleep, 5)`) and repeat: `/fast` responds instantly while
`/block` runs. You've reproduced and fixed the single most common async bug.

### 6. Reproduce a lost-update race

Have 50 threads (or 50 concurrent async tasks with an `await` between read and
write) each do a read-modify-write increment of a shared counter in Redis via
`get` then `set` (the racy version), 100 times each. Expected final value: 5,000.
Print the actual.

Expected: the final value is **less than 5,000** — interleaved read-modify-writes
lost updates (two tasks read the same value, both write value+1, one increment
vanishes). You've produced a race condition on demand.

### 7. Fix the race with an atomic operation

Replace the `get`/`set` with `r.incr(key)`. Re-run exercise 6.

Expected: the final value is **exactly 5,000** every time — `INCR` performs the
read-modify-write atomically on the Redis server, so no interleaving is possible.
Note you fixed it not with a lock but by pushing the operation down to something
atomic — the preferred backend answer. (Then, for practice, also fix the original
with an `asyncio.Lock`/`threading.Lock` and note it works but serializes access.)

### 8. Diagnose and fix: the async endpoint that tanks under load

A FastAPI service has an `async def /report` endpoint that (a) `await`s a couple
of `asyncpg` queries (fast), then (b) runs a synchronous, CPU-heavy pandas
aggregation on the results (2 seconds of pure computation), then returns.
Single-request latency is a fine ~2s, but under even modest concurrency (10
simultaneous requests) *every* request's latency balloons to ~20s and unrelated
endpoints on the same worker also slow to a crawl. Diagnose and give the fix.

<details>
<summary>Answer</summary>

The CPU-heavy pandas aggregation is a **blocking, CPU-bound operation running
directly on the event-loop thread inside an `async def`**. Because the event loop
is single-threaded and cooperative, that 2-second computation never yields, so it
**freezes the entire loop**: the 10 concurrent requests can't interleave (there's
nothing to overlap — it's CPU work, not I/O) and instead run effectively
*serially* on the one thread, so the 10th waits behind the other 9 (~20s), and
every unrelated request on that worker stalls too. Two things are wrong: CPU-bound
work doesn't belong in async (concurrency can't speed up computation), and it
*definitely* doesn't belong *on the loop thread*. Fix: offload the CPU work to a
**process pool** so it runs on other cores without blocking the loop —
`result = await loop.run_in_executor(process_pool, heavy_aggregation, data)`
(with a module-level `ProcessPoolExecutor`). Now the loop stays free to service
other requests while the aggregation runs in parallel on separate cores. (If it
were merely *blocking I/O* rather than CPU, `asyncio.to_thread` would suffice; for
CPU-bound, you need processes to get past the GIL *and* off the loop.)

</details>

## Independent challenge

No code given. Take two operations in your app — one clearly I/O-bound (a handler
that makes several independent external/DB/cache calls) and one clearly CPU-bound
(an image resize, a big hash, a heavy in-memory aggregation) — and make each fast
with the *correct* tool, proving you know which is which. For the I/O-bound one,
convert sequential awaits/calls into concurrent execution (`asyncio.gather` or a
threadpool) and measure the drop from ~sum-of-waits to ~slowest-wait. For the
CPU-bound one, parallelize it across cores with a process pool and measure the
~core-count speedup, then deliberately try a *thread* pool instead and show it
gives ~no speedup, explaining why in one sentence naming the GIL. Then take an
`async def` endpoint and reproduce the event-loop-freeze footgun (a blocking or
CPU call on the loop) under concurrency, and fix it correctly (`to_thread` for
blocking I/O, a process pool for CPU). Finally, find or create a
read-modify-write **race** on shared state in your app, reproduce a wrong result
under concurrency, and fix it with an **atomic** datastore operation (DB `UPDATE
... = ... + n` or Redis `INCR`) rather than a lock — connecting back to the
caching races you saw in **01-caching-strategies** and **04-caching-for-web-apps-
and-databases**.

<details>
<summary>Hint</summary>

The tool follows the workload: I/O-bound (waiting) → concurrency (`asyncio` /
threads, because the waits overlap and a blocked thread releases the GIL);
CPU-bound (computing) → parallelism (processes, because each has its own GIL and
runs on a separate core, while threads/async give zero CPU speedup). The footgun
is any blocking (`time.sleep`, sync driver, `requests`) or CPU-heavy call inside
an `async def` — it freezes the single loop thread for *all* requests; offload
blocking I/O with `asyncio.to_thread` and CPU work with a `ProcessPoolExecutor`
via `loop.run_in_executor`. For the race, the concurrent-repopulation cache bug
(module 01) and any `get`-then-`set`/check-then-act on shared state is racy under
concurrency — reproduce the lost update, then fix it by making the operation
atomic in the datastore (`INCR`, `UPDATE ... = ... + n`) rather than coordinating
in app code, which is the preferred backend answer.

</details>

## Common mistakes & troubleshooting

- **Using async for CPU-bound work.** There are no waits to overlap;
  `asyncio.gather` over pure computation gives zero speedup and can freeze the
  loop. CPU-bound → processes.
- **Using threads for CPU parallelism in Python.** The GIL serializes Python
  bytecode onto one core; `ThreadPoolExecutor` on CPU work gives ~no speedup. Use
  a process pool.
- **Blocking the event loop.** A synchronous DB call, `time.sleep`,
  `requests.get`, or a CPU loop inside an `async def` freezes the single loop
  thread and stalls *every* concurrent request on the worker. Use async drivers;
  offload blocking I/O with `to_thread`, CPU work with a process pool.
- **Mixing sync drivers into async handlers.** `psycopg` (sync), `requests`,
  blocking `redis` clients block the loop. Use `asyncpg`/`redis.asyncio`/
  `httpx.AsyncClient` in `async def`, or run a plain `def` handler (FastAPI
  threadpools it).
- **Read-modify-write on shared state under concurrency.** `get` then `set`,
  check-then-act — loses updates / double-processes. Make it atomic in the
  datastore (`INCR`, `UPDATE ... = ... + n`) or serialize with a lock.
- **Reaching for a lock when an atomic operation exists.** Locks serialize (kill
  concurrency) and risk deadlock. Prefer the datastore's atomic op; use locks only
  when there's no atomic primitive for what you need.
- **Ignoring process-pool serialization cost.** Data crossing process boundaries
  is copied/pickled — for tiny tasks the overhead can exceed the parallelism
  gain. Batch work into chunks large enough to be worth a process hop.
- **Assuming "the GIL is gone."** Experimental free-threaded builds exist, but
  the production default still serializes Python bytecode — design for processes
  on CPU-bound work unless you've explicitly opted into and validated a
  no-GIL/parallel setup.

## Checkpoint quiz

Write down your answer to each question before expanding it — checking without attempting first is the single easiest way to fool yourself into thinking you've learned this.

1. Define concurrency and parallelism, and state the relationship between them
   (which requires multiple cores, and can you have one without the other?).
2. What's the difference between I/O-bound and CPU-bound work, and what's the
   right tool for each — and why does the *opposite* tool not help?
3. What is the GIL, and what does it mean concretely for using threads vs
   processes for CPU-bound Python work?
4. Explain the event-loop footgun: why does a blocking or CPU-heavy call inside an
   `async def` handler hurt *all* concurrent requests, and how do you fix each of
   the two cases (blocking I/O vs CPU)?
5. Give the canonical read-modify-write race and explain precisely why an update
   is lost.
6. List the ways to avoid a race, cheapest/best first, and say why "make the
   datastore operation atomic" is usually the preferred backend answer over a
   lock.

<details>
<summary>Answers</summary>

1. **Concurrency** is *dealing with* many tasks at once by interleaving their
   progress (they're all in flight, not necessarily executing simultaneously);
   **parallelism** is *doing* many tasks at literally the same instant on multiple
   cores. Parallelism *requires* multiple cores; concurrency does not. You can
   have concurrency without parallelism (one async event loop on one core) and
   parallelism without elaborate concurrency structure (a parallel map over
   independent data) — they're independent axes.
2. I/O-bound work spends most time *waiting* on something external (CPU idle);
   CPU-bound work spends most time *computing* (CPU pinned). I/O-bound →
   **concurrency** (async/threads): overlap the idle waits on one thread, no extra
   cores needed. CPU-bound → **parallelism** (processes): the only way to compute
   more per unit time is more cores. The opposite tool fails because async can't
   overlap non-existent waits in CPU work (zero speedup), and processes are
   wasteful overhead for work that was only ever waiting.
3. The Global Interpreter Lock lets only one thread execute Python bytecode at a
   time in CPython. Concretely: **threads give no CPU parallelism** for
   pure-Python work (the GIL serializes them onto one core), so CPU-bound work
   needs **processes** — each has its own interpreter and GIL and runs on a
   separate core. (Threads *do* help I/O-bound work, because a thread releases the
   GIL while blocked on I/O.)
4. The event loop is a single thread using cooperative multitasking, so a
   coroutine keeps the CPU until it `await`s. A blocking/CPU call never yields, so
   it freezes the one loop thread — every other concurrent request on that worker
   stalls until it finishes (and CPU work can't be overlapped anyway). Fix
   blocking I/O with `await asyncio.to_thread(...)` (runs it off the loop in a
   thread); fix CPU-bound work by offloading to a **process pool** via
   `loop.run_in_executor(process_pool, ...)` (parallel, off the loop).
5. Two workers each do `balance = read(); balance += 100; write(balance)`. Both
   read 500 before either writes; A writes 600; B writes 600 (clobbering A). Final
   is 600, should be 700 — one +100 is lost because the read-modify-write wasn't
   **atomic**: B's read happened before A's write, so B computed from a stale value
   and overwrote A's result.
6. (1) Don't share mutable state (independent/immutable data is race-free). (2)
   Make the operation **atomic** in the datastore (DB `UPDATE x = x + n`, Redis
   `INCR`). (3) Serialize with a lock/mutex. (4) Use safe structures (queues).
   Atomic-in-the-datastore is preferred over a lock because the datastore performs
   the read-modify-write indivisibly with no app-side coordination, avoiding the
   concurrency loss and deadlock risk that locks bring — you let the store's
   atomicity do the work instead of orchestrating it yourself.

</details>

## Next

[08-profiling-and-performance-testing](../08-profiling-and-performance-testing/README.md)
— you now have the concurrency tools *and* the caching tools, and module 05's
procedure for knowing which bottleneck to aim them at. The final concept module
gives you the instruments: a real Python profiler (cProfile / py-spy), how to read
a flame graph, a light intro to load testing, and how to interpret the results to
find the *actual* bottleneck instead of the assumed one — the measurement
discipline the whole back half of the track depends on.
