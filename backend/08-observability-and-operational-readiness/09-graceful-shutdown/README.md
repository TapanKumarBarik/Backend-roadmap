# Module 09: Graceful Shutdown

## Why this matters

Your service does not run forever. It is stopped and started constantly — every
deploy replaces it, every autoscale-down removes replicas, every node failure or
Kubernetes rescheduling kills and recreates it. Stopping a process is not a rare
edge case; it is a **routine, high-frequency operation**, and how your app
behaves in the few seconds between "you are being told to stop" and "you are
gone" decides whether those routine operations are invisible to users or
whether every single deploy sheds a handful of errors. A naive process that just
dies when told to stop will, on *every* deploy: drop the requests it was
mid-way through serving (users get connection-reset errors), abandon
half-finished background work (a payment charged but the order never marked
paid), and leave connections and resources dangling. Multiply that by dozens of
deploys a week and you're burning error budget (module 08) on nothing but the act
of shipping.

**Graceful shutdown** is the discipline of stopping *cleanly*: when the process
receives the "please stop" signal, it stops accepting *new* work, finishes the
work already **in flight**, cleans up its resources (connection pools,
background tasks, open files), and only then exits — all within a bounded time
budget. Done right, a deploy is invisible: in-flight requests complete, the load
balancer has already stopped sending new ones, and the old process exits with
zero dropped requests. Done wrong, every deploy is a small, self-inflicted
outage that your own alerting (module 08) will dutifully report.

This module ties together threads from across the track. The **signal handling**
is the OS-level counterpart to the lifecycle you've been building. The
**readiness vs liveness probe** behaviour during shutdown is what makes the load
balancer cooperate. The **connection-pool and background-task cleanup** is where
module 04-07's resources get released and module 06's in-flight gauge returns to
zero. And the whole thing is a pillar of the **12-factor** "disposability" factor
you'll formalize in module 10. Getting shutdown right is the difference between a
service that's genuinely *operationally ready* and one that merely *works when
nobody touches it*.

## Concepts

### Signals: how the OS asks (and tells) a process to stop

Stopping a process starts with a **signal** — an OS-level message sent to the
process. Two matter enormously and you must know the difference:

- **SIGTERM (terminate) — the polite request.** "Please shut down." This is what
  orchestrators (Docker, Kubernetes) send *first* when stopping a container
  (`docker stop`, a pod deletion, a rolling deploy). It is **catchable**: your
  process can install a handler, run cleanup, and exit on its own terms. This is
  the signal graceful shutdown is built around — SIGTERM is your cue to begin
  draining.
- **SIGKILL (kill) — the non-negotiable.** "You are being terminated now." It is
  **uncatchable and uncleanable** — the kernel destroys the process immediately,
  no handler runs, no cleanup happens. Orchestrators send SIGKILL as the *second
  step*: after SIGTERM, they wait a **grace period** (Kubernetes default 30s),
  and if the process hasn't exited by then, SIGKILL forces it. A process that
  ignores SIGTERM or takes too long gets killed hard, losing all the cleanup it
  was supposed to do.

(A third, **SIGINT**, is what Ctrl-C sends in a terminal — treat it like
SIGTERM for local dev.)

The lifecycle to internalize:

```
orchestrator wants to stop the pod
        │
        ├─► sends SIGTERM ──► your handler runs: stop accepting new work,
        │                     drain in-flight, clean up, exit cleanly
        │
        └─► waits grace period (e.g. 30s) ...
                │
                └─► if still alive: SIGKILL ──► instant death, no cleanup (BAD)
```

Your entire job in graceful shutdown is to **do all your cleanup inside the
grace period after SIGTERM, so SIGKILL never has to fire.** That means cleanup
must be *bounded* — you cannot wait forever for a stuck request, or you'll get
killed mid-cleanup anyway.

### The drain sequence: stop new work, finish old work

The heart of graceful shutdown is **draining**: the ordered sequence that lets
in-flight work finish while refusing new work. Order matters, and getting it
wrong causes exactly the errors you're trying to prevent.

1. **Receive SIGTERM.** The signal handler (or framework lifecycle hook) fires.
2. **Stop accepting new requests — but keep serving existing ones.** The server
   stops pulling new connections off the socket. Critically, it does *not*
   immediately close active connections; requests already being processed
   continue.
3. **Signal "not ready" to the load balancer.** The readiness probe (below)
   starts failing so the load balancer/service stops routing *new* traffic to
   this instance — ideally this happens slightly *before* or as new-request
   acceptance stops, so there's no window where traffic is routed to a
   no-longer-accepting server.
4. **Wait for in-flight requests to complete (with a timeout).** Give the
   currently-executing requests a bounded window to finish and respond normally.
   This is the actual "drain." A well-behaved request finishes in milliseconds;
   the timeout is a safety cap for stuck ones.
5. **Clean up resources.** Close database/Redis connection pools, cancel or
   await background tasks, flush buffers, close files. (Below.)
6. **Exit.** Process ends with status 0, ideally well within the grace period.

The subtle ordering bug: if you close active connections *before* draining (or
signal ready-too-late), you cut off requests mid-response → the client gets a
reset → an error that graceful shutdown was supposed to prevent. Stop *new*
work first; finish *old* work; then tear down.

### Readiness vs liveness probes — and why they must differ at shutdown

Orchestrators use two kinds of health check, and confusing them is a classic
cause of both dropped-traffic-at-shutdown *and* death spirals. They answer
different questions:

- **Liveness probe — "is this process alive and not wedged?"** If it fails, the
  orchestrator concludes the process is broken and **restarts (kills) it.** Use
  it to detect a hung/deadlocked process that needs recycling. It should check
  something cheap and intrinsic (the event loop responds) — *not* dependencies.
- **Readiness probe — "is this process ready to receive traffic right now?"** If
  it fails, the orchestrator **stops routing traffic** to it (removes it from the
  load-balancer pool) but does **not** kill it. Use it to say "not yet" during
  startup (still warming caches, connecting to the DB) and "no more, please"
  during shutdown.

The shutdown behaviour that makes draining work:

- **On SIGTERM, immediately fail the *readiness* probe** (return not-ready) while
  keeping the process alive and finishing in-flight work. This tells the load
  balancer "stop sending me new requests" *without* the orchestrator killing the
  process — giving you the window to drain. The **liveness probe must keep
  passing** during this time, or the orchestrator will kill you mid-drain
  (defeating the point).
- This is why readiness must reflect "should I get traffic" and liveness must
  reflect "am I fundamentally broken." If your liveness probe checks the database
  and the database blips, the orchestrator *restarts your healthy app* — turning a
  dependency hiccup into a restart storm. Keep liveness intrinsic; put
  dependency/readiness concerns in readiness.

```
SIGTERM received:
  readiness probe  → START FAILING  (LB stops new traffic; NOT killed)
  liveness probe   → KEEP PASSING   (so orchestrator doesn't kill mid-drain)
  ...drain in-flight, clean up, exit within grace period...
```

A practical wrinkle: load balancers notice readiness changes with a small delay,
so robust setups add a brief **pre-stop delay/sleep** (or a `preStop` hook)
between failing readiness and closing the socket, so in-flight-and-just-arriving
requests during the propagation window still land on a serving process. The
principle: give the routing layer time to stop routing before you stop serving.

### Cleaning up resources: pools, background tasks, and buffers

Draining requests is only half of cleanup. A process holds resources that must
be released deliberately, or you leak connections and lose work:

- **Connection pools (DB, Redis, HTTP clients).** Your app holds pools of open
  connections (module 04's DB, module 06's dependencies). On shutdown, **close
  the pools** so connections are returned cleanly rather than abruptly severed —
  abruptly-dropped DB connections can leave server-side sessions lingering and,
  at scale across many replicas redeploying, exhaust connection limits. Await the
  pool's `close()`/`dispose()`.
- **Background tasks.** Any long-running background work — a
  `BackgroundTask`, an `asyncio` task, a consumer loop, a scheduler — must be
  **cancelled or awaited** on shutdown, not orphaned. The right choice depends on
  the work: a task that's safe to interrupt gets **cancelled**; a task doing
  something that must complete (finishing a critical write) should be **awaited**
  within the budget, or its work made resumable/idempotent (module 06 background-
  processing track's discipline) so an interrupted run is safe to retry. Never
  just let the loop die mid-iteration having done half its side effects.
- **Consumers of queues** (Celery-style workers) need the same care: stop
  fetching new messages, finish (or requeue) the in-flight message, ack/nack
  correctly, then disconnect — otherwise a killed worker mid-task either loses
  the message or double-processes it (why idempotency matters).
- **Buffers and flushes.** Anything buffered — batched log/metric exports (the
  OTel Collector exporter, module 07), a write buffer — should be **flushed** on
  shutdown so the last events aren't lost. This is why the observability
  exporters have their own shutdown hooks; a hard kill loses the final,
  often-most-interesting, telemetry.

All of this must fit inside the grace period. If cleanup itself can hang (a pool
close waiting on a dead DB), wrap it in a timeout so you exit cleanly rather than
getting SIGKILL'd mid-cleanup.

### FastAPI/ASGI lifespan and the shutdown hook

In a Python ASGI app, you rarely install a raw `signal.signal` handler yourself —
the ASGI server (**Uvicorn/Gunicorn**) already catches SIGTERM and drives a
graceful shutdown, and it exposes a **lifespan** mechanism where *you* put your
setup and teardown. FastAPI's `lifespan` context manager is the idiomatic place:
code before `yield` runs at startup (open pools, start background tasks); code
after `yield` runs at shutdown (drain, close pools, cancel tasks).

```python
import contextlib, asyncio
from fastapi import FastAPI

@contextlib.asynccontextmanager
async def lifespan(app: FastAPI):
    # --- startup ---
    app.state.db = await create_db_pool()
    app.state.redis = await create_redis_pool()
    worker = asyncio.create_task(background_consumer())
    app.state.ready = True
    yield
    # --- shutdown (runs on SIGTERM, before the process exits) ---
    app.state.ready = False              # readiness probe now reports not-ready
    worker.cancel()                      # stop the background task...
    with contextlib.suppress(asyncio.CancelledError):
        await worker                     # ...and let it unwind cleanly
    await app.state.redis.aclose()       # close pools deliberately
    await app.state.db.close()

app = FastAPI(lifespan=lifespan)

@app.get("/healthz")     # LIVENESS: intrinsic, cheap, no dependencies
async def liveness():
    return {"status": "alive"}

@app.get("/readyz")      # READINESS: reflects "should I get traffic?"
async def readiness(response):
    if not app.state.ready:
        response.status_code = 503       # fails immediately on shutdown → LB drains us
    return {"ready": app.state.ready}
```

Uvicorn handles steps 1-2 and 4 of the drain sequence (catch SIGTERM, stop
accepting connections, wait for in-flight requests up to
`--timeout-graceful-shutdown`); your **lifespan shutdown block** handles the
resource cleanup (step 5) and flipping readiness (step 3). Tune the server's
graceful-shutdown timeout to sit *comfortably inside* the orchestrator's grace
period (e.g. Uvicorn 25s inside Kubernetes' 30s) so your cleanup finishes before
SIGKILL.

## Command reference

| Signal / mechanism | Meaning / use |
|---|---|
| **SIGTERM** | Polite "please stop" — catchable; the cue to begin graceful shutdown |
| **SIGKILL** | Uncatchable instant kill; sent after the grace period if you didn't exit |
| **SIGINT** | Ctrl-C in a terminal; treat like SIGTERM in dev |
| Grace period | Time between SIGTERM and SIGKILL (K8s `terminationGracePeriodSeconds`, default 30s) |
| Liveness probe | "Am I broken?" → fail = **restart**. Keep intrinsic; keep passing during drain |
| Readiness probe | "Should I get traffic?" → fail = **stop routing**, don't kill. Fail on SIGTERM |
| `preStop` hook / pre-stop sleep | Brief delay so the LB stops routing before you stop serving |
| FastAPI `lifespan` | Idiomatic startup/shutdown hooks (before/after `yield`) |
| `--timeout-graceful-shutdown` | Uvicorn's in-flight drain cap; set inside the grace period |
| `asyncio.Task.cancel()` / `await` | Cancel interruptible tasks; await must-finish ones |
| pool `.close()` / `.dispose()` / `.aclose()` | Deliberately release connection pools on shutdown |

**Raw signal handling (when you're *not* behind an ASGI server, e.g. a worker):**

```python
import asyncio, signal

async def main():
    stop = asyncio.Event()
    loop = asyncio.get_running_loop()
    for sig in (signal.SIGTERM, signal.SIGINT):
        loop.add_signal_handler(sig, stop.set)   # SIGTERM/INT → set the event

    async with resources() as res:               # opens pools/consumers
        worker = asyncio.create_task(run_worker(res, stop))
        await stop.wait()                         # block until a stop signal
        # --- graceful shutdown ---
        await drain_and_cleanup(worker, res, timeout=25)

asyncio.run(main())
```

**Kubernetes probe + grace-period config (the orchestrator half):**

```yaml
spec:
  terminationGracePeriodSeconds: 30      # SIGTERM → 30s → SIGKILL
  containers:
    - name: api
      lifecycle:
        preStop:
          exec: { command: ["sleep", "5"] }   # let LB notice readiness change first
      readinessProbe:                    # controls traffic routing
        httpGet: { path: /readyz, port: 8000 }
        periodSeconds: 5
      livenessProbe:                     # controls restarts — intrinsic only!
        httpGet: { path: /healthz, port: 8000 }
        periodSeconds: 10
```

**Cleanup must be bounded.** Every await in your shutdown path (draining, pool
close, task await) needs a timeout, so a stuck dependency can't hang you past the
grace period into a SIGKILL that skips the *rest* of your cleanup.

## Hands-on exercises

Use a small FastAPI app run under Uvicorn. You'll need a way to send signals
(`kill -TERM <pid>`, `docker stop`) and a slow endpoint to create in-flight work.

### 1. Observe an ungraceful death

Run a plain Uvicorn app with a `/slow` route that `await asyncio.sleep(10)`.
Start a request to `/slow`, and while it's in flight, `kill -9 <pid>` (SIGKILL).

Expected: the client's request dies with a connection reset — no response. This
is the baseline pain: a hard kill drops in-flight work. Note SIGKILL gave you no
chance to do anything.

### 2. SIGTERM vs SIGKILL

Repeat, but this time send `kill -TERM <pid>` (SIGTERM) while `/slow` is in
flight.

Expected: Uvicorn catches SIGTERM, stops accepting new connections, and **waits
for the in-flight `/slow` request to finish and respond** before exiting — the
client gets its `200`. Same app, different signal, opposite outcome. This is
graceful shutdown already partly working for free, because Uvicorn handles the
request-drain.

### 3. Add lifespan cleanup and prove it runs on SIGTERM

Add a `lifespan` with startup/shutdown prints (open/close a fake pool). Send
SIGTERM.

Expected: the shutdown block runs (you see "closing pool") *before* the process
exits — but if you send SIGKILL instead, it does *not*. Confirms: cleanup only
happens on the catchable SIGTERM, within the grace window.

### 4. Wire readiness to shutdown state

Implement `/readyz` backed by `app.state.ready`, flip it to `False` at the top
of the lifespan shutdown block, and add a small `sleep` there before closing
things. Send SIGTERM and poll `/readyz` during shutdown.

Expected: `/readyz` returns `503` immediately once shutdown begins, while the
process keeps serving in-flight requests. This is the "tell the LB to stop
routing, then drain" behaviour. Confirm `/healthz` (liveness) still returns
`200` throughout.

### 5. Prove the liveness/readiness distinction with a dependency

Make a *wrong* liveness probe that checks a database connection. Kill the
database (not the app) and watch what a real orchestrator *would* do (simulate:
liveness now fails).

Expected realization: because liveness failing means *restart*, a DB blip would
cause the orchestrator to kill your perfectly healthy app — a restart storm.
Move the DB check to *readiness* instead: now a DB blip pulls you from the LB
pool (correct) without killing you. This is the classic probe mistake.

### 6. Drain in-flight work under a deploy simulation

Start 5 concurrent `/slow` (3s) requests, then immediately `docker stop` the
container (SIGTERM + 30s grace). Count how many of the 5 get a proper response.

Expected: all 5 complete and respond, because Uvicorn drains in-flight requests
within the grace period before exiting. Now set the grace period to 1s
(`docker stop -t 1`) and repeat: some requests are cut off by the follow-up
SIGKILL. Lesson: the grace period must exceed your real request drain time.

### 7. Cancel a background task cleanly

Add a background `asyncio` task (a loop that prints and sleeps). In the lifespan
shutdown, `cancel()` it and `await` it under `suppress(CancelledError)`. Send
SIGTERM.

Expected: the task stops cleanly at shutdown rather than being orphaned or
dying mid-iteration; you see it unwind. Then remove the cancel/await and observe
the warning about a task destroyed while pending — the leak you're preventing.

### 8. Diagnose and fix: the deploy that sheds errors

Every deploy of this service produces a burst of 502s and a Prometheus alert
(module 08), and occasionally an order is charged but never marked paid. Here's
the relevant setup. Find every cause.

```python
@contextlib.asynccontextmanager
async def lifespan(app):
    app.state.db = await create_db_pool()
    task = asyncio.create_task(process_orders_forever())   # (3)
    yield
    # (no shutdown cleanup at all)                          # (1),(2),(3)

app = FastAPI(lifespan=lifespan)

@app.get("/healthz")
async def health():
    await app.state.db.execute("SELECT 1")   # (4) liveness checks the DB
    return {"ok": True}

# readiness probe: none defined; k8s uses /healthz for both  # (2)
# k8s: terminationGracePeriodSeconds: 2                        # (5)
```

<details>
<summary>Solution</summary>

**(1) — no draining / no readiness signal, so new traffic keeps arriving during
shutdown.** With no readiness probe distinct from liveness (see 2), nothing tells
the load balancer to stop routing when SIGTERM hits, so requests are sent to a
shutting-down process → 502s. Fix: add a `/readyz` backed by an `app.state.ready`
flag flipped to `False` at the start of the shutdown block (after `yield`), plus
a short pre-stop delay so the LB notices.

**(2) — one probe used for both liveness and readiness.** They need opposite
shutdown behaviour (readiness fails to drain traffic; liveness keeps passing so
you're not killed). Using one endpoint for both makes correct draining
impossible. Fix: separate `/healthz` (liveness) and `/readyz` (readiness).

**(3) — background task orphaned, causing the charged-but-not-marked-paid bug.**
`process_orders_forever()` is never cancelled/awaited on shutdown, so a hard exit
kills it mid-iteration — right after charging but before the DB update. Fix:
`task.cancel()` + `await` it in the shutdown block, *and* make the work
idempotent/transactional so an interrupted iteration is safe to retry (the
background-processing discipline). Also close `app.state.db` on shutdown.

**(4) — liveness probe checks the database.** A DB blip fails liveness →
orchestrator *restarts the healthy app* → restart storm, and during a deploy it
can kill the app mid-drain. Fix: liveness must be intrinsic (`return alive`); the
DB check belongs in *readiness*.

**(5) — grace period of 2 seconds** is shorter than real requests/cleanup take,
so SIGKILL fires mid-drain and cuts off in-flight requests (more 502s) and skips
cleanup. Fix: set `terminationGracePeriodSeconds` (and Uvicorn's graceful
timeout inside it) to comfortably exceed the real drain time (e.g. 30s / 25s).

Root causes, one theme: the app treats shutdown as *instant death* rather than an
*ordered drain*. Add the drain sequence — fail readiness, keep liveness, finish
in-flight work, cancel/await background tasks (idempotently), close pools, all
inside a sufficient grace period — and both the 502-per-deploy and the
lost-work bugs disappear. The deploy becomes invisible, and the module-08 alert
stops firing on routine operations.

</details>

## Independent challenge

No code given. Take the fully instrumented service from **module 06-08** (RED
metrics, traces, correlated logs, SLO alerts) and make it *shut down gracefully*,
then prove it under a simulated rolling deploy. Implement: (1) a FastAPI
`lifespan` that opens a DB and Redis pool and starts a background consumer at
startup, and on shutdown flips readiness to not-ready, cancels/awaits the
consumer *idempotently*, and closes both pools — all bounded by timeouts; (2)
distinct `/healthz` (intrinsic liveness) and `/readyz` (readiness) endpoints with
the correct shutdown behaviour; and (3) a grace period and Uvicorn graceful
timeout tuned so cleanup always finishes before SIGKILL. Then demonstrate, with
evidence, that during a `docker stop`/SIGTERM while several requests and a
background task are in flight: every in-flight request gets a proper response,
the background task's work is not lost or double-applied, the pools close
cleanly, and — crucially — your **module 06 in-flight gauge returns to zero and
your module 08 SLO alert does *not* fire**. Reach back to **module 00**: explain
why making the background task **idempotent** is what lets you safely *cancel* it
mid-flight instead of having to always await it, and how that connects shutdown
safety to the error-handling discipline the track opened with.

<details>
<summary>Hint</summary>

The drain order is the whole thing: on SIGTERM, (a) flip `app.state.ready` so
`/readyz` 503s and the LB stops routing, (b) let Uvicorn finish in-flight
requests (its `--timeout-graceful-shutdown`), (c) in the lifespan shutdown block
cancel/await the consumer and close pools — each wrapped in `asyncio.wait_for(...)`
so a stuck dependency can't blow the grace period. The "no lost/double work"
proof rests on idempotency: because the consumer's unit of work is
transactional/idempotent (module 00 + the background-processing track), a
`cancel()` mid-iteration either rolls back cleanly or is safely retried on the
*new* replica — so you can afford to interrupt it rather than block shutdown
awaiting it. For the "alert doesn't fire" proof, watch your own dashboards
(module 06/08) across the deploy: a graceful shutdown produces zero 5xx, so the
error-budget burn rate stays flat and no page fires — which is exactly the point
that graceful shutdown stops routine deploys from burning budget. The
module-00 connection: idempotency means "safe to happen more than once / to be
interrupted and retried," which is the same property that made retries safe back
in module 00 — shutdown is just another place an operation can be interrupted.

</details>

## Common mistakes & troubleshooting

- **Treating shutdown as instant death.** Just exiting on SIGTERM drops in-flight
  requests and abandons work. Implement the ordered drain: stop new, finish old,
  clean up, exit.
- **No distinct readiness probe (or using one probe for both).** Without failing
  *readiness* on SIGTERM, the LB keeps routing new traffic to a shutting-down
  process → 502s. Readiness drains traffic; liveness must keep passing so you're
  not killed mid-drain.
- **Liveness probe that checks dependencies.** A DB/Redis blip fails liveness →
  the orchestrator *restarts a healthy app* → restart storm. Keep liveness
  intrinsic; put dependency checks in readiness.
- **Grace period shorter than real drain/cleanup time.** SIGKILL fires
  mid-shutdown, cutting off requests and skipping cleanup. Set the grace period
  (and the server's graceful timeout inside it) to exceed real drain time.
- **Orphaned background tasks.** A task not cancelled/awaited on shutdown dies
  mid-iteration, losing or duplicating work. Cancel interruptible tasks, await
  must-finish ones, and make the work idempotent.
- **Not closing connection pools.** Abruptly severed DB/Redis connections linger
  server-side and, across many redeploying replicas, exhaust connection limits.
  Close pools deliberately in the shutdown hook.
- **Unbounded cleanup.** A pool close waiting on a dead dependency can hang you
  into a SIGKILL. Wrap every shutdown await in a timeout.
- **No pre-stop delay.** Load balancers notice readiness changes with a lag;
  without a brief pre-stop delay, requests routed during that lag hit a
  no-longer-serving process. Give routing time to stop before you stop serving.

## Checkpoint quiz

Write down your answer to each question before expanding it — checking without attempting first is the single easiest way to fool yourself into thinking you've learned this.

1. Distinguish SIGTERM from SIGKILL. Which one is graceful shutdown built around,
   why, and what does an orchestrator do with each (and in what order)?
2. Give the ordered drain sequence from "SIGTERM received" to "process exits,"
   and name the ordering bug that reintroduces the very errors you're trying to
   prevent.
3. Contrast liveness and readiness probes: what does each answer, what does the
   orchestrator do when each fails, and how must each behave when SIGTERM
   arrives?
4. Why is a liveness probe that checks the database a bug, and what failure does
   it cause?
5. Name three kinds of resource cleanup that must happen on shutdown, and for a
   background task, when do you *cancel* it versus *await* it?
6. Why must the orchestrator's grace period exceed your real drain + cleanup
   time, and why must every await in your shutdown path be bounded by a timeout?

<details>
<summary>Answers</summary>

1. **SIGTERM** is the polite, *catchable* "please stop" — your process can install
   a handler, drain, clean up, and exit on its own terms; graceful shutdown is
   built around it precisely because it's catchable. **SIGKILL** is *uncatchable*
   and instant — the kernel destroys the process, no cleanup. An orchestrator
   sends **SIGTERM first**, waits a **grace period**, and only then sends
   **SIGKILL** to force a process that hasn't exited. Your goal is to finish all
   cleanup after SIGTERM so SIGKILL never fires.
2. (1) Receive SIGTERM → (2) stop accepting *new* requests but keep serving
   in-flight ones → (3) fail the *readiness* probe so the LB stops routing new
   traffic → (4) wait for in-flight requests to finish, with a timeout → (5) clean
   up resources (close pools, cancel/await tasks, flush buffers) → (6) exit. The
   ordering bug: closing active connections / tearing down *before* draining (or
   failing readiness too late), which cuts requests off mid-response → connection
   resets → the exact errors graceful shutdown exists to prevent. Stop new work
   first, finish old work, then tear down.
3. **Liveness** = "is the process fundamentally broken/wedged?"; failing it makes
   the orchestrator **restart (kill)** the process. **Readiness** = "should this
   process receive traffic now?"; failing it makes the orchestrator **stop
   routing** traffic (remove from the LB pool) *without* killing. On SIGTERM,
   **readiness must start failing** (to drain traffic) while **liveness must keep
   passing** (so you're not killed mid-drain).
4. Because failing liveness triggers a **restart**, so a transient DB blip (the app
   itself being fine) makes the orchestrator kill and restart a healthy process —
   a restart storm that turns a dependency hiccup into an app outage, and can kill
   the app mid-drain during a deploy. The DB check belongs in *readiness* (pull
   from LB, don't kill); liveness should be intrinsic.
5. (a) **Connection pools** (DB/Redis/HTTP) — close them so connections release
   cleanly rather than lingering/exhausting limits. (b) **Background tasks** —
   cancel or await them so they don't die orphaned mid-work. (c) **Buffers/
   exporters** — flush batched logs/metrics/traces so the last telemetry isn't
   lost. For a task: **cancel** it if the work is safe to interrupt (and
   idempotent/resumable); **await** it (within the budget) if it's doing something
   that must complete — or make it idempotent so interruption is safe.
6. If the grace period is shorter than real drain + cleanup time, SIGKILL fires
   mid-shutdown — cutting off in-flight requests and skipping the rest of cleanup —
   which defeats the whole exercise; so the grace period (and the server's
   graceful timeout inside it) must comfortably exceed real drain time. Every
   shutdown await must be bounded because a cleanup step waiting on a dead/slow
   dependency (e.g. closing a pool to a downed DB) could otherwise hang past the
   grace period into a SIGKILL — a timeout lets you give up on that step and still
   finish exiting cleanly.

</details>

## Next

[10-the-12-factor-app](../10-the-12-factor-app/README.md) — graceful shutdown is
one factor ("disposability") of a broader methodology for building services that
are portable, scalable, and operationally sane. The final concepts module steps
back to the **12-factor app**: the twelve principles for cloud-native backends,
tying together config (modules 02-03), logs-as-streams (04-05), and the process
disposability you just built — the checklist that separates a service that
*works on your machine* from one that's genuinely production-ready.
