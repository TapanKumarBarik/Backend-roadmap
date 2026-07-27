# Module 06: Health Checks, Readiness, and Scaling Signals

## Why this matters

An orchestrator can only manage your service as well as your service *tells it how
to*. Kubernetes doesn't know whether your app is alive, whether it's ready for
traffic, or whether it's overloaded — unless you expose that information. The
health probes and metrics your app publishes are the **contract** through which the
platform decides when to send you traffic, when to restart you, when to hold a
rollout, and when to add or remove replicas. Get the contract right and the platform
keeps your service healthy automatically; get it wrong and it makes things *worse* —
restarting a slow-but-healthy app in a loop, routing traffic to a replica that
isn't ready, or scaling on the wrong signal.

This is where several threads from earlier modules converge. Graceful shutdown
(track 08 module 09, module 01 here) depends on the readiness probe to drain
correctly. Zero-downtime rolling deploys (module 03) depend on the readiness probe
to avoid sending traffic to not-yet-ready replicas. The metrics you instrumented in
track 08 module 06 (RED: rate, errors, duration) become the *scaling signals* an
autoscaler consumes. This module is the app-side of all of it: what endpoints and
signals a backend service must expose so a scheduler and an autoscaler can manage
it well.

The probe and autoscaler *mechanics* — how Kubernetes configures `livenessProbe`/
`readinessProbe`/`startupProbe`, how the Horizontal Pod Autoscaler or KEDA consumes
metrics, how Container Apps scales on concurrency — are `learn/03-kubernetes`,
`learn/06-azure-container-apps`, and `learn/23-performance-and-load-testing`. What
you own as the backend engineer is *what to expose and what each probe must
actually check*, which is deceptively subtle and where most mistakes live.

## Concepts

### Liveness vs readiness: two different questions

The single most important distinction in this module, and the one most often
gotten wrong: **liveness and readiness answer different questions and trigger
different platform actions.**

- **Liveness — "is this process broken beyond recovery?"** If the liveness probe
  fails, the platform **restarts (kills and recreates) the container.** So liveness
  should fail *only* for unrecoverable, in-process problems — a deadlock, an
  exhausted event loop, a wedged state a restart would actually fix. A liveness
  probe should be **cheap and dependency-free**: it must *not* check the database
  or Redis, because if it does and the database has a hiccup, the probe fails, the
  platform restarts every replica, and restarting doesn't fix a database problem —
  you've turned a transient dependency blip into a cluster-wide restart storm.
- **Readiness — "can this replica serve traffic *right now*?"** If the readiness
  probe fails, the platform **stops routing new traffic to this replica** (removes
  it from the load-balancer pool) but **does not restart it.** Readiness is allowed
  to depend on things that can recover: if the database connection is temporarily
  down, or the app is still warming up, or it's draining during shutdown, readiness
  fails and traffic is withheld until it recovers — then traffic resumes, no
  restart needed.

The rule that falls out: **liveness = "am I fundamentally broken (restart me)";
readiness = "can I serve right now (route around me)."** A slow dependency should
fail *readiness*, never liveness. Confusing the two is the classic outage: putting
a DB check in the liveness probe means a brief DB blip restarts your whole fleet.

### Startup probes and slow starts

A third probe handles the startup edge case: an app that legitimately takes a while
to become ready (loading a model, warming a cache, establishing pools) can trip a
*liveness* probe that starts checking too early — the platform thinks it's broken
and restarts it before it ever finishes starting, forever. The **startup probe**
solves this: it runs *first*, gives the app a generous window to come up, and only
once it passes do the liveness and readiness probes begin. This lets you keep
liveness's timeout tight (fast detection of a real hang) without punishing slow-but-
legitimate startup.

That said, factor IX (disposability) still says *keep startup fast* — a startup
probe is for genuinely unavoidable warmup, not an excuse for a 90-second boot that
makes every scale-up and rollout sluggish. Fast startup + a startup probe for the
irreducible warmup is the combination.

### What each probe should actually check

The endpoints your FastAPI app exposes, and what belongs in each:

- **`/livez` (liveness)** — returns `200` if the process is running and its event
  loop is responsive. Check *nothing external*. Often literally
  `return {"status": "ok"}`. The mere fact that the ASGI server answered the HTTP
  request proves the event loop isn't wedged, which is all liveness should assert.
- **`/readyz` (readiness)** — returns `200` only if the app can *actually serve a
  request*: its critical dependencies are reachable (a fast `SELECT 1` against the
  DB, a Redis `PING`), pools are initialized, and it is *not* currently draining
  (module 01's shutdown flips this to `503`). It returns `503` when a dependency is
  down or during shutdown, so traffic is routed away until it can serve again.
- **`/startupz` (startup, if used)** — passes once one-time initialization is done.

Two subtleties that matter: **readiness checks should be shallow and fast** (a `1`-
second-budget `SELECT 1`, not a full health sweep of every downstream) so the probe
itself doesn't become a load or a false-negative under latency; and **readiness
should reflect *this replica's* ability to serve**, not a global system health —
one replica failing readiness routes around *it*, which is exactly right, whereas a
readiness check that fails whenever *any* shared dependency is degraded can take the
whole fleet out of rotation at once.

### Readiness is the linchpin of graceful deploys and shutdown

Readiness isn't just a startup gate — it's the mechanism that makes the whole
deploy story (module 03) and graceful shutdown (module 01 / track 08 module 09)
work, so it's worth seeing the full loop:

1. **Startup:** new replica boots, readiness fails until pools are up, so the LB
   doesn't send it traffic prematurely — no requests hit a half-initialized app.
2. **Steady state:** readiness passes; the replica is in the LB pool serving
   traffic.
3. **Dependency blip:** readiness fails briefly, traffic routes to healthy
   replicas, the replica recovers and rejoins — no restart, no dropped traffic.
4. **Shutdown (SIGTERM):** the `lifespan` handler flips readiness to `503`
   *first*, so the LB stops sending new requests, *then* the app drains in-flight
   requests and exits (module 01). Failing readiness *before* draining is what
   closes the window where new requests would hit a shutting-down replica.

There's one notorious race worth knowing: for a beat after SIGTERM, the LB may not
yet have observed the readiness failure and can still route a request or two. The
common mitigation is a short **pre-stop delay** (sleep a couple seconds after
SIGTERM before actually draining/exiting) so the readiness failure propagates
before you stop accepting work. The exact wiring (`preStop` hook,
`terminationGracePeriodSeconds`) is `learn/03-kubernetes`; the app-side point is
that readiness must fail *early* in shutdown.

### Metrics as scaling signals

The last thing the platform needs from your app is a signal for *how many replicas
to run*. Autoscalers (Kubernetes HPA, KEDA, Container Apps) add replicas when a
signal exceeds a target and remove them when it drops. Your job is to expose a
signal that actually reflects load:

- **The default signals** are CPU and memory — the platform reads these without app
  cooperation. They're fine for CPU-bound work but often a *poor* proxy for a web
  service's real load: an app waiting on I/O (DB, downstream APIs) can be at 20% CPU
  while its request latency and queue depth are terrible. Scaling on CPU alone can
  under-scale exactly when you're overloaded.
- **Custom / application metrics** are better signals, and they're the RED metrics
  from track 08 module 06: **request rate** (requests/sec — scale out as traffic
  grows), **in-flight/concurrent requests or queue depth** (the most direct
  "am I saturated" signal), and **latency** (p95 duration crossing a threshold means
  you're struggling). For queue workers, **queue length** (pending jobs) is the
  natural scaling signal — this is what KEDA excels at.
- **Expose them in a form the autoscaler can read:** the Prometheus `/metrics`
  endpoint you built in track 08 module 06 is exactly the interface — the
  autoscaler (via an adapter/KEDA) scrapes it and scales on your chosen metric.

The backend engineer's decision is *which* signal represents your service's load
(concurrency and queue depth usually beat CPU for I/O-bound backends), and to
*expose* it. Choosing targets, configuring the HPA/KEDA, tuning scale-up/down
behavior, and load-testing to validate it are `learn/23-performance-and-load-
testing` and `learn/03`/`learn/06`. And scaling only works because the app is
**stateless** (module 01, factor VI) — an autoscaler can only add interchangeable
replicas.

## Command reference

| Probe / signal | Question | Platform action on failure | May check dependencies? |
|---|---|---|---|
| Liveness (`/livez`) | Is the process broken? | **Restart** the container | **No** — cheap, in-process only |
| Readiness (`/readyz`) | Can it serve *now*? | **Remove from LB** (no restart) | **Yes** — shallow, fast |
| Startup (`/startupz`) | Has it finished starting? | Delay liveness/readiness | Init state only |
| CPU/memory | Resource pressure | Autoscale | Platform-read, no app work |
| Custom metric (`/metrics`) | Real load (rate/concurrency/latency/queue) | Autoscale | App-exposed (track 08 mod 06) |

Liveness and readiness done correctly in FastAPI — note liveness touches nothing
external, readiness is shallow and reflects draining:

```python
from fastapi import FastAPI, Response
from sqlalchemy import text

app = FastAPI()
_draining = False   # flipped True by the lifespan shutdown (module 01)

@app.get("/livez")
async def livez():
    # Liveness: the fact that we answered proves the event loop is alive.
    # Check NOTHING external — a DB check here would restart the fleet on a DB blip.
    return {"status": "alive"}

@app.get("/readyz")
async def readyz(response: Response):
    # Readiness: can THIS replica serve a request right now?
    if _draining:                          # shutting down → take out of rotation first
        response.status_code = 503
        return {"status": "draining"}
    try:
        async with app.state.pool.acquire() as conn:
            await conn.execute(text("SELECT 1"))   # shallow, fast dependency check
    except Exception:
        response.status_code = 503         # dep down → route around me, but DON'T restart me
        return {"status": "not-ready"}
    return {"status": "ready"}
```

Failing readiness first on shutdown (the module 01 drain, from the probe's angle):

```python
@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.pool = await open_pool(settings.database_url)
    yield
    global _draining
    _draining = True                 # /readyz now 503 → LB stops sending new requests
    await asyncio.sleep(2)            # let the readiness failure propagate (the SIGTERM race)
    await drain_in_flight()           # finish in-flight requests
    await app.state.pool.close()
```

Probe + autoscaler wiring (mechanics are `learn/03`; this is the app contract):

```yaml
livenessProbe:  { httpGet: { path: /livez,  port: 8000 }, periodSeconds: 10, failureThreshold: 3 }
readinessProbe: { httpGet: { path: /readyz, port: 8000 }, periodSeconds: 5 }
startupProbe:   { httpGet: { path: /livez,  port: 8000 }, failureThreshold: 30, periodSeconds: 2 }
# HPA scales on a custom metric your /metrics endpoint exposes (track 08 module 06):
# targetAverageValue on in-flight requests / p95 latency, not just CPU — better load signal.
```

## Hands-on exercises

Run the service (multi-replica if you can) with Postgres/Redis in Docker.

### 1. Split liveness and readiness

Add `/livez` (checks nothing external) and `/readyz` (shallow `SELECT 1` + Redis
`PING`). Confirm both return `200` when healthy. Write one sentence each stating
what platform action a failure of each triggers.

### 2. Prove the liveness-checks-DB anti-pattern

Temporarily make `/livez` check the database. Stop Postgres. Observe (or reason
precisely about) what a platform would do: restart every replica on a loop, none of
which fixes the DB. Restore `/livez` to dependency-free and stop Postgres again —
now only *readiness* fails and replicas are merely routed-around, recovering when
the DB returns.

### 3. Readiness reflects draining

Wire `/readyz` to return `503` while `_draining` is `True`, flipped by the
`lifespan` shutdown (module 01). Send SIGTERM (`docker stop`), and confirm `/readyz`
starts returning `503` *before* the app finishes draining. Explain why this
ordering prevents dropped requests during a deploy.

### 4. Add a startup probe for slow warmup

Add an artificial 15-second warmup to startup. First run with liveness starting
immediately and watch it (would) restart-loop before startup finishes. Add a
startup probe that gates liveness until warmup completes, and confirm the app comes
up cleanly. Then note why factor IX still wants startup fast.

### 5. Zero-downtime rollout driven by readiness

Run a rolling deploy (module 03) under steady load, with correct readiness probes.
Confirm new replicas only receive traffic after `/readyz` passes and old ones stop
receiving it when they start draining — zero dropped requests. Remove the readiness
probe and repeat; observe requests hit not-ready replicas.

### 6. Expose a scaling signal

Add (or reuse from track 08 module 06) a `/metrics` endpoint exposing request rate
and in-flight request count. Load-test the service and watch in-flight requests
climb. Argue why in-flight/concurrency is a better scale signal than CPU for an
I/O-bound endpoint that waits on the database.

### 7. Choose the right signal for a worker

For a queue worker (background-processing track), identify what the autoscaler
should scale on (queue length / pending jobs) rather than CPU. Sketch how KEDA would
consume that signal. State the app-side responsibility (expose the pending-job
count) vs the platform side (`learn/03`/`learn/23`).

### 8. Diagnose and fix

A service on Kubernetes has three symptoms: (1) every time the database has a
2-second blip, *all* replicas restart simultaneously and the outage gets worse; (2)
during deploys, a burst of requests 502 right as new replicas come up; (3) under
heavy load the service is clearly overwhelmed (p95 latency 8s) but the autoscaler
never adds replicas. Its probes and scaling look like this:

```yaml
livenessProbe:  { httpGet: { path: /health, port: 8000 } }   # /health does SELECT 1 + Redis PING
# no readinessProbe, no startupProbe
# HPA: scale on CPU > 80%     (the app is I/O-bound, sits at ~30% CPU under load)
```

<details>
<summary>Solution</summary>

- **(1) Liveness checks the DB** → a DB blip fails liveness on every replica, so the
  platform restarts the whole fleet, which doesn't fix the DB — a transient blip
  becomes a restart storm. Fix: liveness must be dependency-free (`/livez` checks
  nothing external); move the `SELECT 1` + Redis `PING` to a **readiness** probe,
  which routes traffic around a struggling replica *without* restarting it.
- **(2) No readiness probe** → new replicas receive traffic before they're
  initialized (502s during rollout), and draining replicas keep receiving traffic
  during shutdown. Fix: add a `/readyz` readiness probe; new replicas only get
  traffic after it passes, and the `lifespan` drain flips it to `503` first on
  shutdown (module 01/03).
- **(3) Scaling on CPU for an I/O-bound app** → it's saturated at 30% CPU (waiting
  on the DB), so the CPU target is never hit and it never scales despite 8s latency.
  Fix: scale on a real load signal — in-flight/concurrent requests, p95 latency, or
  queue depth — exposed via `/metrics` (track 08 module 06) and consumed by the HPA
  (via an adapter) or KEDA.
- **Missing startup probe** (if warmup is slow) → add one so liveness doesn't
  restart a legitimately-slow-starting replica.

Root theme: the app wasn't giving the platform the right signals. Liveness only for
"restart me," readiness for "route around me" (and for draining), and a scaling
signal that reflects *actual* load rather than a CPU proxy that lies for I/O-bound
work.

</details>

## Independent challenge

No code given. Take the containerized, gracefully-shutting-down service from
**module 01 (The 12-factor app in a container)** and make it fully *manageable by an
orchestrator*, proving each property. (1) **Correct probes:** expose a
dependency-free `/livez` (liveness → restart) and a shallow, fast `/readyz`
(readiness → route-around, checks critical deps and reflects draining), and *prove*
the distinction by causing a dependency blip and showing only readiness fails —
contrasting it with the restart-storm you'd get if liveness checked the DB. (2)
**Graceful deploy loop:** run a rolling deploy under load and show readiness gating
means new replicas get traffic only when ready and draining replicas stop getting
it — connecting back to **track 08's module 09 (Graceful shutdown)** and this
track's **module 03 (Deployment strategies)** — including the SIGTERM/LB race and
its short pre-stop delay mitigation. (3) **Scaling signal:** expose the RED metrics
from **track 08's module 06 (Monitoring and metrics)** on `/metrics`, load-test the
service, and make the case for scaling on in-flight requests / latency / queue depth
rather than CPU for your (I/O-bound) workload — noting this only works because the
app is stateless (factor VI). Point to `learn/03-kubernetes` for probe/HPA
mechanics and `learn/23-performance-and-load-testing` for validating the autoscaling
under real load.

<details>
<summary>Hint</summary>

The whole module reduces to matching a *signal* to a *platform action*: liveness
triggers a restart, so it must fail only for things a restart fixes (never an
external dependency); readiness triggers route-around, so it's exactly where
dependency checks and the draining flag belong. The most convincing proof is the
DB-blip contrast: with the DB check in liveness, a 2-second blip restarts the fleet
and makes things worse; moved to readiness, the same blip just routes traffic to
healthy replicas and recovers on its own. For the scaling argument, the killer
detail is that an I/O-bound endpoint sits at low CPU while saturated, so a CPU
target never fires — measure in-flight requests during a load test and watch them
climb while CPU stays flat; *that* divergence is your argument for a concurrency-
based signal.

</details>

## Common mistakes & troubleshooting

- **Liveness probe checks a dependency.** A DB/Redis blip fails liveness on every
  replica → the platform restarts the fleet, which doesn't fix the dependency.
  Liveness must be cheap and in-process only.
- **No readiness probe.** New replicas get traffic before they're ready (502s on
  rollout) and draining replicas keep getting it. Add readiness; it gates traffic
  without restarting.
- **Readiness not failing on shutdown.** New requests hit a draining replica.
  Flip readiness to `503` *first* in the `lifespan` shutdown, before draining.
- **Deep/slow readiness checks.** A full health sweep of every downstream makes the
  probe itself a load and a false-negative source. Keep it shallow and fast
  (`SELECT 1`, `PING`), reflecting *this* replica.
- **No startup probe for a slow-starting app.** Liveness restarts it before it
  finishes booting. Add a startup probe (and still keep startup fast — factor IX).
- **Scaling on CPU for I/O-bound work.** The app is saturated at low CPU, so it
  never scales when overloaded. Scale on concurrency/latency/queue depth via
  `/metrics`.
- **Forgetting scaling needs statelessness.** An autoscaler can only add
  interchangeable replicas — local state breaks that (module 01, factor VI).

## Checkpoint quiz

Write down your answer to each question before expanding it — checking without attempting first is the single easiest way to fool yourself into thinking you've learned this.

1. State the different question each of liveness and readiness answers and the
   different platform action each failure triggers. Why must a slow dependency fail
   readiness, never liveness?
2. Exactly what should `/livez` check, and what should `/readyz` check? Why is
   putting a DB check in the liveness probe a classic outage?
3. What problem does a startup probe solve, and why is it not a license to have a
   slow startup?
4. Walk the readiness probe through the full deploy/shutdown loop: startup, steady
   state, a dependency blip, and SIGTERM shutdown. Where does the pre-stop delay fit
   and what race does it address?
5. Why is CPU often a poor scaling signal for a backend web service, and what are
   two better application-level signals (and where do they come from)?
6. Why does autoscaling depend on the app being stateless, and which earlier
   module/factor established that?

<details>
<summary>Answers</summary>

1. **Liveness** answers "is this process broken beyond recovery?" — failure →
   the platform **restarts** the container. **Readiness** answers "can this replica
   serve traffic right now?" — failure → the platform **removes it from the LB
   pool** (no restart). A slow/temporarily-down dependency must fail *readiness*
   because the correct response is to route traffic away until it recovers; failing
   *liveness* would restart the replica, which doesn't fix an external dependency
   and just causes a restart storm.
2. `/livez` should check *nothing external* — the fact that it answered proves the
   event loop is alive; often just `return {"status": "ok"}`. `/readyz` should
   shallowly and quickly check that the replica can actually serve: critical deps
   reachable (`SELECT 1`, Redis `PING`), pools up, and not draining. A DB check in
   liveness is a classic outage because a brief DB blip then fails liveness on
   every replica, so the platform restarts the whole fleet — turning a transient
   dependency hiccup into a self-inflicted outage.
3. It gives a legitimately slow-to-start app a generous window to come up before
   liveness/readiness begin, so liveness doesn't restart-loop an app that just
   hasn't finished warming up — letting you keep liveness's timeout tight for real
   hangs. It's not a license for slow startup because factor IX (disposability)
   still wants fast startup so scale-ups and rollouts are responsive; the startup
   probe is for irreducible warmup only.
4. **Startup:** readiness fails until pools are up, so the LB doesn't send traffic
   to a half-initialized replica. **Steady state:** readiness passes; it's in the
   pool. **Dependency blip:** readiness fails briefly, traffic routes to healthy
   replicas, then it rejoins on recovery — no restart. **SIGTERM:** the `lifespan`
   shutdown flips readiness to `503` *first* so the LB stops sending new requests,
   then drains and exits. The **pre-stop delay** (a short sleep after SIGTERM before
   draining/exiting) sits right after flipping readiness, to let the LB observe the
   readiness failure before you stop accepting work — addressing the race where the
   LB might still route a request in the instant after SIGTERM.
5. A web service is often I/O-bound (waiting on DB/downstreams), so it can be
   saturated — terrible latency, deep queues — while CPU stays low, meaning a CPU
   target never fires and the app never scales when it's actually overloaded. Better
   signals: request rate, in-flight/concurrent requests or queue depth, and p95
   latency — the RED metrics exposed on `/metrics` from track 08 module 06 (queue
   length for workers).
6. Autoscaling adds replicas that must immediately serve traffic identically to the
   others; that's only possible if any replica can serve any request, i.e. if the
   app holds no local state. Statelessness was established in module 01 (and track
   08 module 10) as **factor VI** — the enabling condition for horizontal scaling.

</details>

## Next

[07-choosing-your-deployment-target](../07-choosing-your-deployment-target/README.md)
— your service is containerized, CI-built, safely deployable, well-configured, and
manageable by an orchestrator. The last decision is *where to run it*: a PaaS, a
container scheduler, or serverless functions — a decision framework that maps each
choice to the `learn/` track where you'd go deep operationally. This module also
carries the track's second cumulative review.
