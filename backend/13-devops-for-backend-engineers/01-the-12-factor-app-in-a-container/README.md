# Module 01: The 12-Factor App in a Container

## Why this matters

Track 08's module 10 taught the twelve factors as principles: config in the
environment, stateless processes, disposability, logs as streams. Module 00 here
gave you a good image. This module is where the two meet: **what do those factors
actually look like once your app is running inside a container that an
orchestrator schedules, scales, and kills at will?**

The factors stop being abstract the moment there's more than one replica and the
platform can terminate any of them at any time. Config-in-the-environment
(factor III) becomes "how does the value get *into* the container" — env vars,
env-files, and eventually orchestrator secrets. Stateless processes (factor VI)
becomes "if the load balancer sends the next request to a different replica, does
anything break?" Disposability (factor IX) becomes "when Kubernetes sends SIGTERM
and gives me 30 seconds, does my container drain cleanly or drop requests and
corrupt data?" These aren't new principles — they're the same ones you already
know, now with a container runtime and a scheduler making them non-negotiable.

This module is the bridge between the *methodology* (track 08 module 10) and the
*deployment mechanics* (the rest of this track). It assumes you know the twelve
factors already; it does not re-teach them. It focuses on the three that a
container makes or breaks — **config injection, statelessness, and signal
handling** — and shows you how to feel each one fail and then fix it. The full
orchestration machinery (how Kubernetes actually delivers env vars, mounts
secrets, and sequences a pod's termination) is `learn/03-kubernetes`; here we stay
on the app's side of the contract.

## Concepts

### Config crosses the container boundary as environment variables

Factor III says config lives in the environment. In a container, "the
environment" is literally the process's environment variables, and the whole
point is that **the same image gets different config at run time** — build once
(factor V's build), inject config at run (factor V's release/run). Nothing
environment-specific is baked into the image.

The mechanisms, from local to production:

- **`-e KEY=value`** on `docker run` — one-off, fine for a quick test.
- **`--env-file .env`** — a file of `KEY=value` lines, the common local pattern.
- **Compose `environment:` / `env_file:`** — the same, declared in
  `docker-compose.yml`.
- **Orchestrator config** — Kubernetes `env`, `envFrom`, ConfigMaps and Secrets;
  Container Apps env vars and secret refs. This is where production config comes
  from, and it's `learn/03-kubernetes` / `learn/06-azure-container-apps` territory.

On the app side, none of this changes your code: `pydantic-settings` reads from
the environment exactly as in track 08 modules 02-03. The `Settings()` object
doesn't know or care whether the value came from `-e`, an env-file, or a
Kubernetes Secret — that indifference is the feature. It's what lets one image run
unchanged across dev, staging, and prod (module 05 develops the
multi-environment story).

The container-specific rule: **never bake environment-specific config into the
image.** No prod database URL in the `Dockerfile`, no `.env` copied in (that's why
`.env` is in `.dockerignore`). If a value differs between environments, it's
injected at run time, full stop.

### Stateless processes, because the container is one of many and is ephemeral

Factor VI (stateless, share-nothing processes) is the factor a container most
ruthlessly enforces, for two reasons that are *always* true under an
orchestrator:

1. **There is more than one replica.** The load balancer spreads requests across
   them. Anything one replica holds in memory — a session dict, a counter, an
   in-process cache, a job list — is invisible to the others. "Works with one
   replica, breaks with two" is the signature failure.
2. **The container's filesystem is ephemeral.** When a container is rescheduled,
   killed, or a new image is rolled out, its local disk is *gone*. A file written
   to local disk (an upload, a SQLite database) lands on whichever replica served
   the request and vanishes when that container dies.

So every piece of state that must persist across requests or replicas goes to a
**backing service** (factor IV): sessions/cache in Redis, uploads in object
storage, data in Postgres. This is exactly the discipline from track 08 module 10
— the container just removes any doubt about whether you got away with cheating.
You didn't; you just hadn't scaled past one replica yet.

A subtlety worth internalizing: statelessness is what makes *every other
deployment concern in this track* work. Rolling deploys (module 03) work because
you can kill any replica. Autoscaling (module 06) works because you can add
replicas that immediately serve traffic. Both assume any replica can serve any
request identically — which is only true if the app holds no local state.

### Disposability: SIGTERM, the grace period, and draining

Factor IX (disposability: fast startup, graceful shutdown) is where the container
runtime's *termination protocol* meets your app's shutdown code. The protocol is
universal across Docker, Kubernetes, and Container Apps:

1. The platform decides to stop the container (deploy, scale-down, node drain).
2. It sends **SIGTERM** to PID 1 and starts a **grace-period timer** (Docker
   default 10s; Kubernetes `terminationGracePeriodSeconds`, default 30s).
3. Your app is expected to **stop accepting new work and finish in-flight work**,
   then exit.
4. If it hasn't exited when the timer expires, the platform sends **SIGKILL** —
   an unstoppable kill that drops whatever was in flight.

Your job as the backend engineer is to make step 3 real. In FastAPI that's the
`lifespan` shutdown handler (track 08 module 09): on shutdown, fail readiness so
the load balancer stops sending new requests, let in-flight requests complete,
close DB pools and Redis connections, and cancel/await background tasks. Two
container-specific prerequisites make this even *possible*:

- **uvicorn must be PID 1 and receive the signal** — which is why module 00
  insisted on **exec-form `CMD`**. Shell-form `CMD` wraps it in `/bin/sh`, which
  often doesn't forward SIGTERM, so your shutdown code never runs and every deploy
  SIGKILLs mid-request.
- **Startup must be fast** (seconds), so scale-ups and rollouts are responsive and
  the grace period is enough. Don't do slow work (large migrations, warming a huge
  cache) synchronously in startup.

Get this right and a deploy is invisible to users; get it wrong and every rollout
drops a fraction of requests. Module 06 returns to this from the probe side
(readiness vs liveness); here the point is that **the container makes SIGTERM
handling mandatory, not optional.**

### Logs to stdout, and one process per container

Two smaller factors that the container reframes:

- **Logs as streams (XI):** the app writes structured JSON to **stdout/stderr** and
  does nothing else — no files, no rotation. The container runtime captures the
  stream (`docker logs`, and in Kubernetes the node's logging agent) and ships it.
  This is why module 00 set `PYTHONUNBUFFERED=1`: buffered stdout means your logs
  don't appear until the process flushes, which under a crash may be never. The
  app's *ignorance* of where logs go is the feature — the same image logs
  correctly under Docker, Kubernetes, or a PaaS.
- **One concern per container (adjacent to VI/VIII):** a container should run one
  primary process. Don't cram uvicorn *and* a Celery worker *and* cron into one
  container with a shell script; run them as separate containers/deployments so
  each scales, restarts, and is observed independently. Concurrency (factor VIII)
  is achieved by running *more containers*, not more processes stuffed into one.

### Putting it together: the container is the unit of build/release/run

Zoom out and the factors describe one clean lifecycle, now concrete:

- **Build** (V, II): `docker build` turns pinned dependencies + code into the
  immutable image (module 00). The image has *no* config and *no* state.
- **Release** (V, III): the image is combined with this environment's config
  (env vars/secrets injected at run) to produce a running configuration.
- **Run** (VI, VII, IX): the platform runs N stateless replicas, each binding a
  port, each disposable — freely started, scaled, and killed.

Everything in the rest of this track builds on this: CI produces the build
(module 02), deployment strategies orchestrate the run (module 03), migrations are
one-off admin processes on the same image (module 04, factor XII), config and
secrets are the release inputs (module 05), and health probes are how the platform
knows a replica is ready to be in the run set (module 06).

## Command reference

| Mechanism | Injects config as | Where it lives |
|---|---|---|
| `docker run -e KEY=val` | Single env var | Ad-hoc, local |
| `docker run --env-file .env` | Env vars from a file | Local dev |
| Compose `environment:` / `env_file:` | Env vars | `docker-compose.yml` |
| K8s `env` / `envFrom` + ConfigMap | Env vars | Cluster (`learn/03`) |
| K8s Secret via `envFrom`/`valueFrom` | Env vars (secret) | Cluster (`learn/03`, module 05) |
| `docker stop` / `docker kill --signal` | Sends SIGTERM / signal | Tests disposability |
| `terminationGracePeriodSeconds` | Grace window before SIGKILL | K8s pod spec |

Reading injected config unchanged (same code, any source) — this is track 08
modules 02-03, restated for the container:

```python
from pydantic import SecretStr
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    database_url: str            # from env — could be -e, env-file, or a K8s Secret
    redis_url: str
    app_env: str = "dev"
    log_level: str = "INFO"
    secret_key: SecretStr        # secret, never baked into the image

settings = Settings()            # reads os.environ; indifferent to the source
```

Handling SIGTERM so the container is disposable (FastAPI `lifespan`, track 08
module 09) — the shutdown side is what the grace period is *for*:

```python
from contextlib import asynccontextmanager
from fastapi import FastAPI

ready = True

@asynccontextmanager
async def lifespan(app: FastAPI):
    # --- startup: fast; open pools, warm minimal caches ---
    pool = await open_db_pool(settings.database_url)
    app.state.pool = pool
    yield
    # --- shutdown: runs on SIGTERM (exec-form CMD makes uvicorn PID 1) ---
    global ready
    ready = False                 # readiness now fails → LB stops sending new work
    await drain_in_flight()       # let current requests finish
    await pool.close()            # close backing-service connections

app = FastAPI(lifespan=lifespan)

@app.get("/readyz")
async def readyz():
    return ({"status": "ready"}, 200) if ready else ({"status": "draining"}, 503)
```

Proving disposability locally — the same test as track 08 module 09, now as a
deploy rehearsal:

```bash
docker run --rm -p 8000:8000 --env-file .env myapp:dev
# in another shell, start a slow request, then:
docker stop <container>     # sends SIGTERM, waits up to the grace period, then SIGKILL
# confirm: in-flight request completed, logs show clean shutdown, no dropped connection
```

## Hands-on exercises

Reuse the containerized service from module 00 and its backing services (Postgres,
Redis) in Docker.

### 1. One image, three configs

Build the image once. Run it three times with three different env-files
(`dev`, `staging`, `prod`-like — different `APP_ENV`, `LOG_LEVEL`, `DATABASE_URL`).
Add a small `/info` endpoint that returns `APP_ENV` and confirm each container
reports its own config with **no rebuild**. Name the factors you just exercised.

### 2. Verify no config is baked in

Grep your `Dockerfile` and image for environment-specific values
(`grep -riE "postgres://|localhost|sk_|password"` over the build context, and
inspect `docker history`). Confirm nothing environment-specific is in the image and
`.env` is in `.dockerignore`. This is the container form of factor III's
"open-source test."

### 3. Break statelessness with two replicas

Add an in-memory `hits: dict = {}` counter that a route increments and returns.
Run **two** containers of the image behind a tiny round-robin (or
`docker compose up --scale app=2` + a proxy). Hit the endpoint repeatedly and
watch the count come back inconsistent — each replica has its own dict.

### 4. Fix it with a backing service

Move the counter to Redis (`INCR`). Rerun the two replicas and confirm the count
is now consistent regardless of which replica serves the request. Write one
sentence connecting factor VI to factor VIII (why statelessness is what *lets* you
run two replicas at all).

### 5. Lose an upload on the local filesystem

Add an endpoint that writes an uploaded file to `/app/uploads` (local disk). With
two replicas, upload a file, then request it repeatedly — sometimes it's missing
(served by the replica that doesn't have it). Then restart the container that has
it and confirm the file is gone entirely. Fix by writing to object storage
(MinIO) and storing only a pointer.

### 6. Confirm logs stream to stdout

Ensure your app has *no* file log handler and writes JSON to stdout with
`PYTHONUNBUFFERED=1`. Run the container and `docker logs -f` it while hitting
endpoints; confirm logs appear immediately. Remove `PYTHONUNBUFFERED` and observe
them lag/buffer. Restore it.

### 7. Drain on SIGTERM (deploy rehearsal)

Start a deliberately slow request (a route that `await asyncio.sleep(5)`), then
`docker stop` the container. Confirm with logs that the in-flight request
*completed* and shutdown ran cleanly. Now switch `CMD` to **shell form** and
repeat — observe the request get cut off because uvicorn never sees SIGTERM.
Restore exec form.

### 8. Diagnose and fix

This service "runs great locally" but in staging (3 replicas, frequent deploys)
loses uploads, returns inconsistent counts, drops requests on every deploy, and
its logs never show up in the platform's log viewer. The `Dockerfile` ends with
`CMD python -m uvicorn app.main:app --host 127.0.0.1 --port 8000` and the app has
`cache = {}` at module scope, writes uploads to `./uploads`, and configures a
`RotatingFileHandler` to `/var/log/app.log`. Identify each factor violated and the
fix.

<details>
<summary>Solution</summary>

- **`cache = {}` module-level state** → violates VI. Each replica has its own, so
  reads are inconsistent across replicas and lost on restart. Fix: Redis.
- **Uploads to `./uploads` (local disk)** → violates VI (filesystem as state).
  Lands on one replica, vanishes on reschedule/deploy — hence lost uploads. Fix:
  object storage (S3/MinIO), pointer in the DB.
- **`--host 127.0.0.1`** → not reachable through the platform (module 00's rule).
  Fix: `0.0.0.0`.
- **Shell-form `CMD`** (`CMD python -m uvicorn ...` as a string) → uvicorn isn't
  PID 1 / doesn't get SIGTERM, so `lifespan` shutdown never runs and every deploy
  SIGKILLs in-flight requests — "drops requests on every deploy." Fix: exec form
  `CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]` and
  implement the drain in `lifespan`.
- **`RotatingFileHandler` to `/var/log/app.log`** → violates XI. The platform
  captures stdout, not a file inside the ephemeral container — so nothing shows in
  the log viewer and the file dies with the container. Fix: structured JSON to
  stdout, `PYTHONUNBUFFERED=1`.

Root theme: the app conflates itself with its environment and holds its own state.
Externalize config (III) and state (VI→IV), log to stdout (XI), and make the
container disposable (IX, exec-form CMD + `lifespan` drain) — then it survives 3
replicas and frequent deploys.

</details>

## Independent challenge

No code given. Take the containerized service from **module 00
(Containerizing a backend app)** and put it through a *container-specific*
12-factor hardening focused on the three factors a container makes or breaks.
(1) **Config (III/V):** prove one image runs in three environments by config
injection alone — no rebuild — and verify nothing environment-specific is baked
into the image. (2) **Statelessness (VI):** find every piece of in-memory or
local-disk state, move it to a backing service, and *prove* correctness by running
**3 replicas behind a load balancer** and showing behavior is identical regardless
of which replica serves a request (use a value that must be shared — a counter, a
session, an uploaded file — so the before/after contrast is visible). (3)
**Disposability (IX):** implement or verify the `lifespan` SIGTERM drain, ensure
exec-form `CMD`, and prove a slow in-flight request survives a `docker stop`.
Write a short scorecard tying each demonstration back to the specific factor from
**track 08's module 10 (The 12-factor app)** and to **track 08's module 09
(Graceful shutdown)** for the drain, and note which delivery mechanics
(how Kubernetes actually injects the config and sequences termination) you'd go
learn in `learn/03-kubernetes`.

<details>
<summary>Hint</summary>

Reach for the *violations* first, because they're where the proof lives. The
statelessness proof only convinces if the shared value is genuinely shared: pick a
counter or session, show it inconsistent across replicas with in-memory state,
then identical after moving to Redis — that contrast *is* the evidence that VI
enables VIII. For disposability, the make-or-break detail is exec-form `CMD`: with
shell form your `lifespan` shutdown never runs, so test both forms and watch the
slow request get cut off under shell form and survive under exec form. For config,
the cleanest demonstration is an `/info` endpoint echoing `APP_ENV` run once per
env-file — one image, three releases, zero rebuilds.

</details>

## Common mistakes & troubleshooting

- **Baking environment-specific config into the image.** A prod URL in the
  Dockerfile or a copied `.env` breaks one-image-many-environments and leaks
  secrets. Inject at run time; keep `.env` in `.dockerignore`.
- **In-memory state with >1 replica.** A dict cache/counter/session is invisible
  to other replicas and lost on restart. Externalize to Redis/DB.
- **Local-disk uploads.** Land on one ephemeral replica and vanish on
  reschedule/deploy. Use object storage, store a pointer.
- **Shell-form `CMD`.** uvicorn isn't PID 1, doesn't get SIGTERM, so graceful
  shutdown never runs and deploys drop requests. Use exec form.
- **Slow startup work.** Big synchronous work in `lifespan` startup makes scale-up
  and rollout sluggish and can blow the grace period. Keep startup fast.
- **File log handlers in a container.** The platform captures stdout, not a file in
  the ephemeral container. Log JSON to stdout; set `PYTHONUNBUFFERED=1`.
- **Multiple primary processes per container.** uvicorn + worker + cron in one
  container can't be scaled/observed independently. One concern per container.

## Checkpoint quiz

Write down your answer to each question before expanding it — checking without attempting first is the single easiest way to fool yourself into thinking you've learned this.

1. In a container, what *is* "the environment" that factor III's config lives in,
   and why does the same image running with two different env-files not need a
   rebuild?
2. Give the two reasons a container makes factor VI (statelessness) non-negotiable,
   and the signature symptom of violating it.
3. Walk through the container termination protocol from the platform's decision to
   SIGKILL. Where in that sequence does your app's drain logic run, and what makes
   running it *possible* at the container level?
4. Why did module 00 insist on exec-form `CMD`, stated now in terms of factor IX?
   What breaks with shell form?
5. Why must logs go to stdout rather than a file, and what does `PYTHONUNBUFFERED=1`
   have to do with it?
6. Explain how statelessness (VI) is the enabling condition for both rolling
   deploys and autoscaling, which later modules in this track cover.

<details>
<summary>Answers</summary>

1. "The environment" is the process's environment variables. `pydantic-settings`
   reads `os.environ` and is indifferent to whether a value came from `-e`, an
   env-file, or a Kubernetes Secret — so combining the *same immutable image* with
   different env vars at run time (release/run) yields different behavior with no
   rebuild. That's build/release/run (factor V) in action.
2. (i) There is always more than one replica behind a load balancer, so anything
   held in one replica's memory is invisible to the others; (ii) the container
   filesystem is ephemeral, so local-disk writes vanish on reschedule/deploy. The
   signature symptom is "works with one replica, breaks with two" — inconsistent
   counts/sessions, lost uploads.
3. Platform decides to stop → sends **SIGTERM** to PID 1 and starts the grace-period
   timer → app stops accepting new work, drains in-flight, closes pools, exits →
   if still alive at timeout, **SIGKILL** drops everything in flight. Your drain
   runs in the FastAPI `lifespan` shutdown, triggered by SIGTERM. It's only
   possible if uvicorn is PID 1 and actually *receives* the signal — which needs
   exec-form `CMD`.
4. Exec form makes uvicorn PID 1 so it receives SIGTERM directly and can run its
   `lifespan` shutdown (factor IX, disposability). Shell form wraps it in `/bin/sh`,
   which typically doesn't forward SIGTERM, so the drain never runs and the
   platform SIGKILLs mid-request every deploy — dropped requests.
5. The container runtime captures stdout/stderr and ships it (factor XI); a file
   inside the container is invisible to that pipeline and dies with the ephemeral
   container. `PYTHONUNBUFFERED=1` forces stdout to flush immediately so logs
   actually appear in real time (and aren't lost in a buffer if the process
   crashes) rather than being held until the process exits.
6. Both assume any replica can serve any request identically. A rolling deploy
   kills and replaces replicas one at a time — safe only if no replica holds
   unique local state. Autoscaling adds replicas that must immediately serve
   traffic correctly — again only if they're stateless. Statelessness (VI) is
   precisely what makes replicas interchangeable, which is the precondition for
   both.

</details>

## Next

[02-ci-pipelines-for-backend-code](../02-ci-pipelines-for-backend-code/README.md)
— your app is a clean, disposable, config-injected image. Now we automate the path
that *produces* that image on every change: a CI pipeline that lints, type-checks,
runs the unit and integration tests from track 12, and builds and pushes the image
— the "build" of build/release/run, enforced.
