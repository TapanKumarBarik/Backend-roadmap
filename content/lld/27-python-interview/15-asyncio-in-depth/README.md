# Lesson 15: `asyncio` in Depth

> **Prerequisites:** [Lesson 05: Generators](../05-iterators-generators-and-yield/README.md) · [Lesson 11: Context Managers](../11-context-managers/README.md) · [Lesson 14: The GIL, Threads, Processes and asyncio](../14-the-gil-threads-processes-and-asyncio/README.md)  
> **Reading time:** ~25 minutes  
> **Audience:** Candidates asked "how does `await` work?", "`gather` vs `TaskGroup`?", "why did my async code freeze?", or to fan out 100 calls with a timeout

> [!NOTE]
> **In one line:** `asyncio` runs many **coroutines** on **one thread** with an **event loop**; `await` is a *voluntary yield point* where the loop can run something else, so concurrency comes from overlapping **waits**, and a single blocking call freezes everything.

> [!TIP]
> **Golden rule:** Never block the loop. Use `await asyncio.sleep`, async libraries, or `await asyncio.to_thread(blocking_fn)`. Calling a coroutine function only creates a coroutine object — it **does nothing until awaited or scheduled** (`create_task`, `gather`, `TaskGroup`).

> [!TIP]
> **Try it:** Run the section 3 file. Then, in `fetch`, replace `await asyncio.sleep(delay)` with `time.sleep(delay)` and re-run: the `gather` line jumps from about 0.25 s to about 0.5 s (no overlap at all), **and the `timeout: url 3 …` line disappears** — a deadline cannot fire while the loop is blocked. Then run the [asyncio lab](#try-it--asyncio-lab-runnable) below. Draw the loop as a single lane with coroutines taking turns in [LLD Studio](/tools/lld-studio/).

---

## 1. The smell: how this gets asked

- *"What does `async`/`await` do under the hood?"*
- *"Coroutine vs Task vs Future?"*
- *"`asyncio.gather` vs `TaskGroup`?"* (error handling, cancellation)
- *"Add a timeout to this fan-out; limit concurrency to 20."*
- *"Why is my async endpoint slow / frozen?"* (blocking call)
- *"How do you call blocking or CPU code from async code?"*

```mermaid
sequenceDiagram
  participant Loop as Event loop (1 thread)
  participant A as task A
  participant B as task B
  Loop->>A: run until first await
  A-->>Loop: await sleep(0.1)  (yield)
  Loop->>B: run until first await
  B-->>Loop: await sleep(0.1)  (yield)
  Note over Loop: both timers pending... loop idle
  Loop->>A: timer done → resume
  A-->>Loop: finished
  Loop->>B: timer done → resume
  B-->>Loop: finished
```

A blocking call in A (`time.sleep`) never yields: B can't run, the timers can't fire, the whole server stalls.

---

## 2. Reference

| Concept | What it is |
| :--- | :--- |
| **Coroutine function** | `async def f()`; calling it returns a coroutine object (not run yet) |
| **Awaitable** | Coroutine, Task or Future — something you can `await` |
| **Task** | Coroutine scheduled on the loop (`asyncio.create_task(coro)`); runs concurrently |
| **Future** | Low-level placeholder for a result |
| **Event loop** | Scheduler: runs ready callbacks, waits on I/O/timers |
| `asyncio.run(main())` | Create the loop, run to completion, close |

| Tool | Behaviour | Use |
| :--- | :--- | :--- |
| `await coro()` | Run **sequentially** (no concurrency by itself) | Dependent steps |
| `asyncio.gather(*coros)` | Run concurrently; results in order; first exception propagates (others keep running unless cancelled); `return_exceptions=True` collects | Simple fan-out |
| `asyncio.TaskGroup` (3.11+) | Structured concurrency: if one task fails, siblings are **cancelled**, errors raised as `ExceptionGroup` | Preferred for fan-out |
| `asyncio.timeout(s)` (3.11+) / `wait_for` | Cancel on deadline → `TimeoutError` | Every network call |
| `asyncio.Semaphore(n)` | Limit concurrent entries | Rate/connection limits |
| `asyncio.Queue` | Producer/consumer | Pipelines, workers |
| `asyncio.to_thread(fn)` | Run blocking fn in a thread | Blocking I/O |
| `loop.run_in_executor(pool, fn)` | Thread or process pool | CPU work (process pool) |
| `task.cancel()` | Raises `CancelledError` at the next await | Shutdown/timeouts |

---

## 3. Walkthrough: bounded, time-limited fan-out

**Requirements:** fetch 10 "URLs" concurrently, at most 3 at a time, each with a deadline; one fails; show sequential vs concurrent timing, `gather` vs `TaskGroup` semantics, a blocking call hurting, and `to_thread` fixing it.

1. A semaphore limits concurrency to 3 → 10 tasks in batches of 3 = 4 rounds × 0.05 s ≈ 0.2 s (about 0.25 s measured, mostly timer granularity on Windows).
2. `asyncio.timeout` raises `TimeoutError` for the slow one.
3. `gather(return_exceptions=True)` returns failures *as values*; `TaskGroup` raises an `ExceptionGroup` and cancels siblings.
4. Keep a **reference** to background tasks or they may be garbage-collected mid-flight.
5. `to_thread` moves blocking work off the loop.

````carousel
```python
import asyncio
import time

background: set[asyncio.Task] = set()


async def fetch(i: int, sem: asyncio.Semaphore, delay: float = 0.05) -> str:
    async with sem:                                 # at most N inside at once
        await asyncio.sleep(delay)                  # pretend network I/O
        if i == 7:
            raise ConnectionError(f"url {i} failed")
        return f"page-{i}"


async def with_deadline(i: int, sem: asyncio.Semaphore) -> str:
    async with asyncio.timeout(0.1):                # 3.11+: cancels on deadline
        return await fetch(i, sem, delay=0.5 if i == 3 else 0.05)


def blocking_report() -> str:
    time.sleep(0.2)                                 # blocking: must NOT run on the loop
    return "report"


async def ticker(log: list[str], n: int = 4) -> None:
    for _ in range(n):
        await asyncio.sleep(0.05)
        log.append("tick")


async def main() -> None:
    sem = asyncio.Semaphore(3)

    # 1) concurrent + bounded; failures as values
    start = time.perf_counter()
    results = await asyncio.gather(*(fetch(i, sem) for i in range(10)), return_exceptions=True)
    ok = [r for r in results if isinstance(r, str)]
    bad = [r for r in results if isinstance(r, Exception)]
    print(f"gather: {len(ok)} ok, {len(bad)} failed ({bad[0]}) in {time.perf_counter() - start:.2f}s")

    # 2) per-call deadline
    try:
        await with_deadline(3, sem)
    except TimeoutError:
        print("timeout: url 3 exceeded 0.1s")

    # 3) structured concurrency: one failure cancels the siblings
    try:
        async with asyncio.TaskGroup() as tg:
            for i in (1, 7, 2):
                tg.create_task(fetch(i, sem))
    except* ConnectionError as eg:
        print("TaskGroup failed:", [str(e) for e in eg.exceptions])

    # 4) coroutine objects do nothing until awaited
    coro = fetch(1, sem)
    print("created coroutine, nothing ran:", type(coro).__name__)
    print("awaited:", await coro)

    # 5) fire-and-forget: keep a reference!
    task = asyncio.create_task(asyncio.sleep(0.01, result="bg"))
    background.add(task)
    task.add_done_callback(background.discard)
    print("background:", await task)

    # 6) blocking call: bad vs good
    log: list[str] = []
    t = asyncio.create_task(ticker(log))
    await asyncio.to_thread(blocking_report)        # loop stays free: ticks continue
    await t
    print("ticks while blocking work ran in a thread:", len(log))

    log2: list[str] = []
    t2 = asyncio.create_task(ticker(log2))
    await asyncio.sleep(0)                          # let the ticker start
    blocking_report()                               # BAD: freezes the loop for 0.2s
    await asyncio.sleep(0)
    print("ticks completed during the blocking call:", len(log2))   # 0

    # 7) cancellation
    t3 = asyncio.create_task(asyncio.sleep(10))
    await asyncio.sleep(0)
    t3.cancel()
    try:
        await t3
    except asyncio.CancelledError:
        print("cancelled:", t3.cancelled())
    await t2                                         # finish the ticker cleanly


if __name__ == "__main__":
    asyncio.run(main())
```
<!-- slide -->
```csharp
// C#: Task is both coroutine and Task; async/await compiles to a state machine, and continuations
// resume on the captured SynchronizationContext or the thread pool.
var gate = new SemaphoreSlim(3);                         // ~ asyncio.Semaphore

async Task<string> FetchAsync(int i, CancellationToken ct)
{
    await gate.WaitAsync(ct);
    try { await Task.Delay(50, ct); return $"page-{i}"; }
    finally { gate.Release(); }
}

using var cts = new CancellationTokenSource(TimeSpan.FromMilliseconds(500));   // ~ asyncio.timeout (one deadline for the whole batch here)
var pages = await Task.WhenAll(Enumerable.Range(0, 10).Select(i => FetchAsync(i, cts.Token)));
Console.WriteLine(pages.Length);

// Blocking work: await Task.Run(() => Blocking());          // ~ asyncio.to_thread
// Danger: .Result / .Wait() on a Task can deadlock under a synchronization context (see [C# lesson 10: async/await](../../26-csharp-and-dotnet-interview/10-async-await-and-tasks/README.md))
```
````

Expected output of the Python tab (needs Python 3.11+; timings are approximate):

```text
gather: 9 ok, 1 failed (url 7 failed) in 0.25s
timeout: url 3 exceeded 0.1s
TaskGroup failed: ['url 7 failed']
created coroutine, nothing ran: coroutine
awaited: page-1
background: bg
ticks while blocking work ran in a thread: 4
ticks completed during the blocking call: 0
cancelled: True
```

---

## 4. Edges

- **A timeout cannot interrupt blocking code.** `asyncio.timeout` works by cancelling the task at its next `await`; a `time.sleep` or CPU loop has none, so the deadline passes silently (lab probe 4).
- **Swallowed cancellation defeats timeouts** — the `except CancelledError` that does not re-raise (lab probe 3).
- **Forgotten `await`.** `result = fetch()` gives a coroutine object (and "coroutine was never awaited" warning) — a classic bug.
- **`gather` leaves siblings running** when one raises (unless you cancel); `TaskGroup` cancels them and raises `ExceptionGroup` — handle with `except*`.
- **Cancellation is cooperative.** `CancelledError` is raised at the next `await`; catching it and swallowing it breaks timeouts; re-raise after cleanup. Use `try/finally` for resources.
- **Unreferenced tasks can be garbage collected** mid-run: keep them in a set (as above) or use a `TaskGroup`.
- **Shared state is safer** than threads — switches happen only at `await` — but a read-modify-write that spans an `await` can still interleave. Use `asyncio.Lock` there.
- **CPU-bound work blocks the loop** exactly like `time.sleep`. Offload to a process pool.
- **Don't mix event loops/threads casually.** Use `asyncio.run_coroutine_threadsafe` to submit from another thread; `asyncio.run` can't be called inside a running loop (Jupyter!).
- **Unbounded fan-out** (100k `create_task`s) exhausts memory/sockets; use `Semaphore`, `Queue` workers, or batches.
- **Timeouts everywhere.** A network call without a timeout can hang forever and pin resources.
- **Async generators / `async for` / `async with`** exist; resources need `aclose()` (use `contextlib.aclosing`).
- **Debugging:** `asyncio.run(main(), debug=True)` or `PYTHONASYNCIODEBUG=1` reports slow callbacks and never-awaited coroutines.
- **Frameworks:** FastAPI/Starlette run `async def` handlers on the loop and plain `def` handlers in a thread pool — a blocking call in `async def` stalls all requests.

### Try it — asyncio lab (runnable)

The follow-ups interviewers use once you can explain ``await``. Save as ``asyncio_lab.py``; every probe is an ``assert`` (or a printed message), so a wrong claim fails loudly. Needs Python 3.11+.

```python
import asyncio, time, warnings, threading, contextlib

async def sleeper(name, delay, log, fail=False):
    try:
        await asyncio.sleep(delay)
        if fail:
            raise RuntimeError(name)
        log.append(f"{name} done")
    except asyncio.CancelledError:
        log.append(f"{name} cancelled")
        raise

# 1) Forgetting `await`: a coroutine object, a RuntimeWarning, and the work never happens
async def work(): return 42
async def probe1():
    with warnings.catch_warnings(record=True) as caught:
        warnings.simplefilter("always")
        coro = work()                    # forgot await
        assert asyncio.iscoroutine(coro)
        coro = None                      # dropped without running -> warning at finalisation
    assert any("never awaited" in str(w.message) for w in caught)
    return await work()
assert asyncio.run(probe1()) == 42

# 2) gather: first exception propagates but siblings KEEP running; TaskGroup cancels them
async def probe2():
    log = []
    try:
        await asyncio.gather(sleeper("fails", 0.01, log, fail=True), sleeper("sibling", 0.05, log))
    except RuntimeError:
        pass
    await asyncio.sleep(0.1)             # the sibling was never cancelled
    assert "sibling done" in log
    log2 = []
    try:
        async with asyncio.TaskGroup() as tg:
            tg.create_task(sleeper("fails", 0.01, log2, fail=True))
            tg.create_task(sleeper("sibling", 0.05, log2))
    except* RuntimeError:
        pass
    assert log2 == ["sibling cancelled"]
asyncio.run(probe2())

# 3) Swallowing CancelledError makes a timeout useless: the task ignores the deadline
async def stubborn(log):
    try:
        await asyncio.sleep(1)
    except asyncio.CancelledError:
        log.append("ignored cancel")     # BAD: swallowed, not re-raised
    await asyncio.sleep(0.05)
    log.append("kept working")
async def probe3():
    log = []
    t0 = time.perf_counter()
    try:
        async with asyncio.timeout(0.02):
            await stubborn(log)
    except TimeoutError:
        pass
    return log
log = asyncio.run(probe3())
assert log[0] == "ignored cancel"        # the cancel arrived and was eaten

# 4) A timeout cannot interrupt a BLOCKING call; it only fires at the next await
async def probe4():
    try:
        async with asyncio.timeout(0.05):
            time.sleep(0.2)              # blocks the loop; there is no await to interrupt
            return "finished late, no TimeoutError"
    except TimeoutError:
        return "timed out"
assert asyncio.run(probe4()) == "finished late, no TimeoutError"

# 5) A read-modify-write spanning an await interleaves; asyncio.Lock fixes it
async def probe5():
    counter = {"n": 0}
    async def bump_unsafe():
        v = counter["n"]
        await asyncio.sleep(0)           # yield point between read and write
        counter["n"] = v + 1
    await asyncio.gather(*(bump_unsafe() for _ in range(100)))
    unsafe = counter["n"]
    counter["n"] = 0
    lock = asyncio.Lock()
    async def bump_safe():
        async with lock:
            v = counter["n"]
            await asyncio.sleep(0)
            counter["n"] = v + 1
    await asyncio.gather(*(bump_safe() for _ in range(100)))
    return unsafe, counter["n"]
unsafe, safe = asyncio.run(probe5())
assert unsafe == 1 and safe == 100       # all 100 read 0 before any wrote
print("5: unsafe =", unsafe, "| with Lock =", safe)

# 6) Semaphore really caps concurrency (measure the peak)
async def probe6():
    sem, running, peak = asyncio.Semaphore(3), 0, 0
    async def job():
        nonlocal running, peak
        async with sem:
            running += 1; peak = max(peak, running)
            await asyncio.sleep(0.01)
            running -= 1
    await asyncio.gather(*(job() for _ in range(20)))
    return peak
assert asyncio.run(probe6()) == 3

# 7) asyncio.run inside a running loop is a RuntimeError (the Jupyter trap)
async def probe7():
    coro = asyncio.sleep(0)
    try:
        asyncio.run(coro)
    except RuntimeError as e:
        coro.close()
        return str(e)
assert "cannot be called from a running event loop" in asyncio.run(probe7())

# 8) Submit work to a loop running in another thread
loop = asyncio.new_event_loop()
runner = threading.Thread(target=loop.run_forever, daemon=True); runner.start()
fut = asyncio.run_coroutine_threadsafe(work(), loop)
assert fut.result(timeout=2) == 42
loop.call_soon_threadsafe(loop.stop); runner.join(); loop.close()

# 9) Queue + workers: bounded concurrency with backpressure
async def probe9():
    q, out = asyncio.Queue(maxsize=5), []
    async def producer():
        for i in range(20): await q.put(i)      # blocks when the queue is full
        for _ in range(3): await q.put(None)
    async def worker():
        while (item := await q.get()) is not None:
            await asyncio.sleep(0); out.append(item)
    await asyncio.gather(producer(), *(worker() for _ in range(3)))
    return sorted(out)
assert asyncio.run(probe9()) == list(range(20))

# 10) Sequential awaits vs gather: timing
async def probe10():
    t0 = time.perf_counter()
    for _ in range(5): await asyncio.sleep(0.05)
    seq = time.perf_counter() - t0
    t0 = time.perf_counter()
    await asyncio.gather(*(asyncio.sleep(0.05) for _ in range(5)))
    return seq, time.perf_counter() - t0
seq, con = asyncio.run(probe10())
assert seq > 3 * con

# 11) debug mode reports slow callbacks (blocking calls) on the log
import logging, io
buf = io.StringIO()
h = logging.StreamHandler(buf); logging.getLogger("asyncio").addHandler(h)
async def probe11():
    asyncio.get_running_loop().slow_callback_duration = 0.05
    time.sleep(0.1)
asyncio.run(probe11(), debug=True)
logging.getLogger("asyncio").removeHandler(h)
assert "took" in buf.getvalue() and "seconds" in buf.getvalue()
print("asyncio lab ok")
```

Expected output:

```text
5: unsafe = 1 | with Lock = 100
asyncio lab ok
```

---

## 5. What you'd say in two minutes

> "`asyncio` is cooperative concurrency on a single thread. An `async def` call returns a coroutine; nothing runs until it's awaited or wrapped in a Task. The event loop runs a task until it hits an `await` on something not ready, parks it, and runs another, so I get concurrency by overlapping waits — which is why 1,000 outbound calls are cheap, and why a single blocking call or CPU loop freezes everything. For fan-out I prefer `TaskGroup` over `gather` because it cancels siblings on failure and gives me an `ExceptionGroup`; I bound concurrency with a `Semaphore` and put a deadline on every network call with `asyncio.timeout`. Blocking libraries go through `asyncio.to_thread`, CPU work through a process pool via `run_in_executor`. I keep references to background tasks, never swallow `CancelledError`, and note FastAPI runs `async def` endpoints on the loop but sync ones in a thread pool."

---

## 6. Anti-patterns

| Anti-pattern | Why it fails | Fix |
| :--- | :--- | :--- |
| `time.sleep` / `requests.get` in `async def` | Freezes the loop | `asyncio.sleep` / `httpx.AsyncClient` / `to_thread` |
| `await` in a loop for independent calls | Sequential (no concurrency) | `gather` / `TaskGroup` |
| `asyncio.create_task(...)` without keeping a reference | Task may be GC'd | Store in a set / use `TaskGroup` |
| Swallowing `CancelledError` | Breaks shutdown/timeouts | Re-raise after cleanup |
| No timeout on network calls | Hangs forever | `asyncio.timeout` + retries with backoff |
| 100k concurrent tasks | Memory/socket exhaustion | Semaphore / worker queue |
| `asyncio.run()` inside a running loop | `RuntimeError` | `await` the coroutine |

---

## 7. Interview questions

<details>
<summary><strong>1. What does `await` do? [BASIC]</strong></summary>

It suspends the current coroutine until the awaited object completes and hands control back to the event loop so other tasks can run. Without anything else scheduled, awaiting a coroutine just runs it inline (sequentially).

</details>

<details>
<summary><strong>2. Coroutine vs Task? [BASIC]</strong></summary>

A coroutine object is a paused function body; it runs only when awaited. A Task wraps a coroutine and schedules it on the loop immediately so it runs concurrently with other tasks.

</details>

<details>
<summary><strong>3. `gather` vs `TaskGroup`? [TRICKY]</strong></summary>

`gather` runs awaitables concurrently and returns results in order; on the first exception it propagates but doesn't cancel the others (unless you do), or with `return_exceptions=True` it returns errors as values. `TaskGroup` (3.11) is structured: leaving the block waits for all tasks, a failure cancels the rest and raises an `ExceptionGroup`.

</details>

<details>
<summary><strong>4. Why did my async API freeze? [SCENARIO]</strong></summary>

A blocking call (sync HTTP/DB driver, `time.sleep`, big CPU loop) ran on the event loop thread, so no other coroutine could progress. Use async clients, `to_thread`, or a process pool; confirm with debug mode.

</details>

<details>
<summary><strong>5. Fan out 500 calls, ≤ 20 at a time, 2 s each. [SCENARIO]</strong></summary>

`Semaphore(20)` around each call, `asyncio.timeout(2)` inside, collect with `TaskGroup` or `gather(return_exceptions=True)` and handle failures per item; add retries with jittered backoff for transient errors.

</details>

<details>
<summary><strong>6. How do you run CPU-bound work from async code? [SCENARIO]</strong></summary>

`await loop.run_in_executor(ProcessPoolExecutor(), fn, arg)` — threads don't help pure-Python CPU work because of the GIL. Keep the pool long-lived.

</details>

<details>
<summary><strong>7. What happens on `task.cancel()`? [TRICKY]</strong></summary>

A `CancelledError` is thrown into the coroutine at its next `await`. `finally` blocks run; if you catch it you should clean up and re-raise. A task that never awaits can't be cancelled.

</details>

<details>
<summary><strong>8. How does this compare with C# `async/await`? [BASIC]</strong></summary>

A C# `async` method runs synchronously until its first incomplete `await`; afterwards its continuation resumes on the captured `SynchronizationContext` (UI/legacy ASP.NET) or a thread-pool thread, so different parts of one method can run on different threads (hence thread-safety and deadlock concerns). Python's coroutines are all on one thread and switch only at `await`. Both are cooperative at the `await` boundary and need cancellation tokens/`CancelledError` for shutdown.

</details>

---

## 8. One-page cheat sheet

```text
async def f()      returns a coroutine; runs only when awaited / scheduled
await x            yield to the loop until x completes
create_task(c)     schedule now (concurrent); KEEP a reference
gather(*c, return_exceptions=True)   fan-out, ordered results
TaskGroup (3.11)   structured: sibling cancel + ExceptionGroup  -> except*
timeout(s) / wait_for                  every network call
Semaphore(n)       bound concurrency        Queue  producer/consumer       Lock  across awaits
to_thread(fn)      blocking I/O             run_in_executor(process_pool, fn)  CPU
cancel()           CancelledError at next await -> cleanup, then re-raise
NEVER              time.sleep / requests / big loops on the loop; forgotten await; swallowed CancelledError
Debug              asyncio.run(main(), debug=True)
```

---

## Further reading

- [Python docs: `asyncio`](https://docs.python.org/3/library/asyncio.html) · [Coroutines and Tasks](https://docs.python.org/3/library/asyncio-task.html)
- [PEP 3156](https://peps.python.org/pep-3156/) · [PEP 492: `async`/`await`](https://peps.python.org/pep-0492/)
- [Structured concurrency with `TaskGroup`](https://docs.python.org/3/library/asyncio-task.html#task-groups)

Previous: [The GIL, Threads, Processes and asyncio](../14-the-gil-threads-processes-and-asyncio/README.md) · Next: [Metaclasses, Descriptors and @property](../16-metaclasses-descriptors-and-property/README.md)
