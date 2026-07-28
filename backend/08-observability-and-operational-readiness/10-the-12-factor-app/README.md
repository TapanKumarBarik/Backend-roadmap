# Module 10: The 12-Factor App

## Why this matters

Every module in this track taught one operational discipline: handle errors,
manage config, log as a stream, emit metrics, trace requests, alert on symptoms,
shut down gracefully. This module steps back and shows they were never separate
lessons — they're facets of a single, well-known methodology for building
services that survive contact with production: the **12-factor app**. Written by
engineers at Heroku who had watched thousands of apps deploy and fail, it is a
set of twelve principles that answer one question: *what makes an application
portable, scalable, and operable in a modern cloud/container environment* — as
opposed to one that "works on my machine" and falls over the moment it meets a
load balancer, a second replica, or a deploy pipeline.

The reason this belongs at the *end* of the track is that you've now built most
of it from the ground up without knowing the names. Config from the environment
(factor III) was modules 02-03. Logs as event streams to stdout (factor XI) was
modules 04-05. Fast startup and graceful shutdown / disposability (factor IX) was
module 09. This module gives you the *complete framework* those pieces slot into,
plus the factors you haven't met yet — treating **backing services** as
attachable resources, strict **dev/prod parity**, running as **stateless
processes**, the **build/release/run** separation — so you have a single
checklist to evaluate *any* service against and a shared vocabulary the whole
industry uses.

It matters practically because the 12 factors are the difference between an app
that an orchestrator (Kubernetes, module `learn/03`) can schedule, scale, and
redeploy freely and one that fights the platform at every turn. A stateless app
scales horizontally by just adding replicas; a stateful one can't. An app that
reads config from the environment runs unchanged across dev, staging, and prod;
one with hardcoded settings needs a rebuild per environment. This is the
methodology that makes "operational readiness" — the name of the whole track —
concrete and checkable, and it's the direct on-ramp to the deployment and DevOps
work in track 13.

## Concepts

### The methodology and its through-line

The twelve factors, grouped so you can hold them:

**Codebase & dependencies**
- **I. Codebase** — one codebase tracked in version control, many deploys. The
  *same* code runs in dev, staging, and prod; environments differ only by config,
  not by code. One repo → many running instances of it.
- **II. Dependencies** — explicitly declare and isolate dependencies. Never rely
  on system-wide packages being present; declare them (a `pyproject.toml` /
  `requirements.txt`) and isolate them (a virtualenv, a container image) so a
  build is reproducible and nothing "works because that box happened to have it."

**Config & backing services**
- **III. Config** — store config in the *environment*, not in code. (Modules
  02-03, in full.) Anything that varies between deploys — credentials, hostnames,
  toggles — comes from env vars/secret stores, never hardcoded, so one build runs
  everywhere.
- **IV. Backing services** — treat backing services (databases, caches, queues,
  SMTP, third-party APIs) as **attached resources** reached via a URL/handle in
  config. A local Postgres and a managed cloud Postgres should be swappable by
  changing a connection string — no code change. This is what makes your app
  portable across environments.

**Build, release, run**
- **V. Build, release, run** — strictly separate the three stages. *Build*
  compiles code + deps into an artifact (an image); *release* combines that
  artifact with the environment's config; *run* executes the release. Releases
  are immutable and versioned, so you can roll back to a previous one and you can
  never change code at runtime without a new build. (This is why config is
  injected at release, not baked into the build.)

**Processes & concurrency**
- **VI. Processes** — execute the app as one or more **stateless,
  share-nothing processes**. Any state that must persist goes in a backing
  service (DB, Redis), *never* in process memory or the local filesystem, because
  the process is ephemeral (module 09) and there are many of them. This is the
  factor that makes everything else scale.
- **VII. Port binding** — the app is self-contained and **exports its service by
  binding to a port**; it doesn't rely on a runtime-injected web server. Your
  FastAPI app (via Uvicorn) *is* the server, listening on a port — which is how
  it becomes a backing service for something else, too.
- **VIII. Concurrency** — scale *out* by running **more processes** (the process
  model), not just up by making one process bigger. Because processes are
  stateless (VI), you scale by adding replicas behind a load balancer — horizontal
  scaling is a direct payoff of statelessness.

**Operations & robustness**
- **IX. Disposability** — maximize robustness with **fast startup and graceful
  shutdown**. (Module 09, exactly.) Processes should start in seconds (so scaling
  and deploys are quick) and shut down cleanly on SIGTERM (drain, clean up) so
  they can be started and stopped freely and often.
- **X. Dev/prod parity** — keep dev, staging, and prod **as similar as
  possible** — same backing services, same dependencies, small time-gap between
  writing and deploying code. (Module 02's parity argument.) Parity is what makes
  a bug reproducible and a deploy predictable.
- **XI. Logs** — treat logs as **event streams** written to stdout; the app never
  manages log files, rotation, or shipping — the environment captures the stream
  and routes it. (Modules 04-05, exactly.)
- **XII. Admin processes** — run **admin/management tasks as one-off processes**
  in the *same* environment and codebase as the app (a migration, a data
  backfill), not by SSHing in and running ad-hoc commands against prod.

The single through-line: **strict separation of the app from its environment,
and of code from state.** Config, backing services, and logs are all *externalized*
to the environment; state is externalized to backing services; the process
itself is a stateless, disposable, environment-agnostic unit. That separation is
exactly what lets a platform run, scale, move, and redeploy your app freely — and
it's why the factors you built earlier in this track (config, logs, disposability)
kept insisting on that separation.

### Config in the environment (III), and why it ties the track together

You built factor III across modules 02-03, but seeing it *as a factor* sharpens
the rule: **strict separation of config from code**, where config is *everything
that varies between deploys*. The litmus test the methodology gives: *could you
open-source your codebase this instant without leaking any credentials?* If yes,
config is properly externalized; if a `sk_live_...` key or a prod DB password is
in the repo, it isn't. Config lives in the environment (env vars, a secret store)
and is injected at the *release* stage (factor V), so the *same build artifact*
runs in every environment with different config — which is what makes factors I
(one codebase, many deploys) and X (dev/prod parity) actually work.

This is why modules 02-03 mattered so much: `pydantic-settings` reading from the
environment with `SecretStr` for secrets *is* factor III implemented correctly,
and it's the linchpin the portability factors depend on.

### Stateless processes (VI) — the factor that makes scaling possible

Factor VI is the one that most often separates a toy from a production service,
and it's worth its own treatment: **the app's processes must be stateless and
share-nothing.** Concretely, a process must *not* rely on:

- **In-memory state surviving between requests** — a Python dict caching sessions,
  a counter, an in-process job list. Replica B doesn't have replica A's dict, and
  either replica can vanish (module 09), taking its memory with it.
- **The local filesystem persisting** — uploaded files written to local disk, a
  local SQLite file. The next request may hit a different replica, and the disk
  is ephemeral.
- **Sticky sessions as a crutch** — routing a user always to the same process to
  make in-memory state "work" is fighting the model.

Instead, *every* piece of state that must persist across requests or processes
goes into a **backing service** (factor IV): sessions in Redis, uploaded files in
object storage (S3/MinIO — module 06 background-processing track), data in
Postgres. Then any replica can serve any request identically, which is precisely
what lets you (VIII) scale out by adding replicas and (IX) kill any replica at
any time. Statelessness is the enabling condition for horizontal scaling,
disposability, and load balancing all at once — and its violation is why "it
works with one replica but breaks with two" happens.

### Logs as streams (XI) and disposability (IX) — the track, restated

Two factors you implemented directly, now framed as principles:

- **Factor XI (logs as streams):** the app writes a stream of structured events
  to **stdout** and does nothing else — no files, no rotation, no shipping. The
  *execution environment* captures that stream and routes it to aggregation
  (modules 04-05's whole pipeline). The app's ignorance of where logs go is a
  *feature*: it's what lets the same code run under Docker, Kubernetes, or a PaaS,
  each capturing stdout differently, with zero app changes.
- **Factor IX (disposability):** processes are **disposable** — startable and
  stoppable at a moment's notice. Fast startup (seconds, not minutes) makes
  scaling and deploys responsive; graceful shutdown on SIGTERM (module 09's drain)
  makes stopping safe. Together they let the platform treat your process as a
  freely-schedulable unit — exactly what an orchestrator needs.

Seeing these as factors explains *why* the earlier modules were so insistent on
"stdout, not files" and "drain, don't just die": they weren't arbitrary style
choices, they were two of the twelve conditions for being cloud-native.

### Applying it to a FastAPI backend, and its limits

Concretely, a 12-factor FastAPI service looks like:

- **Config** via `pydantic-settings` from env/secret store, `SecretStr` for
  secrets, injected at release (III).
- **Dependencies** pinned in `pyproject.toml`, isolated in a container image
  (II); the image is the immutable **build** artifact (V).
- **Backing services** — DB, Redis, object storage, SMTP — reached by
  URLs/handles from config, swappable per environment (IV).
- **Stateless** app: sessions/cache in Redis, files in object storage, data in
  Postgres — nothing in process memory or local disk (VI); scaled by running N
  Uvicorn replicas behind a load balancer (VIII), each **binding a port** (VII).
- **Disposable**: fast startup, graceful shutdown via `lifespan` (IX, module 09).
- **Logs** as structured JSON to stdout (XI, modules 04-05).
- **Migrations/backfills** as one-off jobs (`alembic upgrade`) run in the same
  image against the same config (XII).
- **Parity** by running the same backing services locally in Docker as in prod
  (X).

```
   the twelve factors mapped onto one FastAPI service
   ┌─ CODE (the immutable build image) ─────────────────────────────┐
   │  pyproject.toml (II)   app code, one repo (I)   Uvicorn :8000 (VII)
   └────────────────────────────────────────────────────────────────┘
                  │ release = image + config (V)
   ┌─ ENVIRONMENT (injected, never in the image) ───────────────────┐
   │  env vars / SecretStr (III)     ENV=dev|staging|prod, parity (X)
   └────────────────────────────────────────────────────────────────┘
   ┌─ STATE (externalized to backing services) ─────────────────────┐
   │  Postgres · Redis · S3/MinIO · SMTP  ── attached by URL (IV)
   └────────────────────────────────────────────────────────────────┘
   ┌─ PROCESSES (stateless, disposable) ────────────────────────────┐
   │  N replicas behind LB (VI, VIII)   lifespan drain (IX)
   │  JSON → stdout (XI)   alembic one-off job (XII)
   └────────────────────────────────────────────────────────────────┘
```

A note on judgment: 12-factor is a strong *default*, not dogma. Some modern
patterns extend or bend it — stateful services (databases themselves, stateful
stream processors) deliberately break factor VI; some argue config-in-env doesn't
scale to hundreds of settings (hence config services/files for non-secret config).
The value is the *framework and the reasoning* — separate app from environment,
code from state — not rigid rule-following. Know the twelve, apply them as the
default, and break one only with a clear reason, the same way module 04's schema
track said "normalize first, denormalize with a measured reason."

## Command reference

| Factor | Principle | In a FastAPI backend |
|---|---|---|
| I. Codebase | One repo, many deploys | Same image to dev/staging/prod; differ by config only |
| II. Dependencies | Declare & isolate | `pyproject.toml` pinned; container image |
| III. Config | Config in the environment | `pydantic-settings` from env; `SecretStr` |
| IV. Backing services | Attached resources via config | DB/Redis/S3/SMTP by URL; swappable |
| V. Build, release, run | Separate & immutable stages | Build image → release with config → run |
| VI. Processes | Stateless, share-nothing | State in Redis/DB/object storage, not memory/disk |
| VII. Port binding | Self-contained, binds a port | Uvicorn binds `:8000`; the app *is* the server |
| VIII. Concurrency | Scale out via processes | N replicas behind a load balancer |
| IX. Disposability | Fast start, graceful stop | `lifespan` startup/shutdown; SIGTERM drain (mod 09) |
| X. Dev/prod parity | Keep environments similar | Same backing services in Docker locally |
| XI. Logs | Event streams to stdout | Structured JSON to stdout; env ships it (mod 04-05) |
| XII. Admin processes | One-off jobs in same env | `alembic upgrade` in the same image/config |

**The "could you open-source it right now?" config test:**

```python
# 12-factor config: everything env-driven, secrets typed, nothing hardcoded
from pydantic import SecretStr
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    database_url: str                 # IV: backing service as a config handle
    redis_url: str                    # IV
    stripe_key: SecretStr             # III: secret, from env, never in the repo
    log_level: str = "INFO"           # III: varies per deploy
    environment: str = "dev"          # I/X: same code, config says which env

settings = Settings()   # reads from environment — no secrets in source
# If this file leaked to a public repo, NO credential would leak. That's factor III.
```

**Stateless vs stateful — the factor VI smell test:**

```python
# ❌ VIOLATES VI: in-memory state — breaks with >1 replica and on restart
sessions: dict[str, User] = {}          # replica B can't see this; lost on restart
@app.post("/login")
async def login(...): sessions[token] = user

# ✅ 12-factor: state in a backing service — any replica serves any request
@app.post("/login")
async def login(...): await redis.set(f"session:{token}", user.json(), ex=3600)
```

**Run admin tasks as one-off processes, not ad-hoc SSH.** A migration is
`docker run <same-image> alembic upgrade head` with the same config as the app —
never `ssh prod && python fix_data.py`, which bypasses the codebase, parity, and
review.

## Hands-on exercises

Take (or build) a small FastAPI service and evaluate/refactor it against the
factors. Run its backing services locally in Docker.

### 1. Audit a service against the twelve factors

Take any service you've built in this curriculum and score it 0-12: for each
factor, is it satisfied, partially, or violated? Write one line of evidence per
factor.

Expected: most services score well on the factors this track drilled (III, IX,
XI) and reveal gaps on the ones it didn't (often VI statelessness, IV
attachable backing services, or V build/release separation). The audit itself is
the skill — you now have a checklist.

### 2. The open-source config test (III)

Grep your codebase for anything that looks like a secret or an environment-
specific value (`grep -rEi "sk_live|password|localhost|127.0.0.1|api[_-]?key"`).

Expected: every hit is either (a) already read from the environment via
`Settings`, or (b) a violation to fix. Move any hardcoded config to env-driven
`Settings` until you could open-source the repo without leaking anything —
that's factor III passing.

### 3. Break statelessness on purpose, then fix it (VI)

Add an in-memory dict cache (`counts: dict = {}`) that a route increments. Run
**two** replicas behind a load balancer (`uvicorn` on two ports + a tiny
round-robin, or `docker compose --scale`). Hit the endpoint repeatedly.

Expected: the count is *wrong/inconsistent* because each replica has its own
dict — the "works with one replica, breaks with two" failure. Move the counter to
Redis and repeat: now it's consistent across replicas. You've felt why factor VI
is the enabler of factor VIII.

### 4. Backing services as attachable resources (IV)

Point your app's `DATABASE_URL` at a local Docker Postgres. Then, changing *only*
the env var, point it at a second Postgres (different container/port) with no
code change.

Expected: the app runs against either database purely by config. This is factor
IV — backing services are attached by config, so local vs cloud is a
connection-string swap, not a code branch.

### 5. Build/release/run separation (V)

Build a container image (the *build*). Run it twice with two different env files
(two *releases* → two *runs*), e.g. `dev` and `staging` config.

Expected: one immutable image produces two differently-configured running
services with no rebuild. Note you *cannot* (and shouldn't be able to) change the
code without a new build — config changes are releases, code changes are builds.

### 6. Logs and disposability as factors (XI, IX)

Confirm your app writes JSON to stdout only (no file handlers) and drains on
SIGTERM (reuse module 09's `docker stop` test). Map each behaviour to its factor.

Expected: `docker logs` shows your JSON stream (XI — the platform captured
stdout), and a SIGTERM drains in-flight requests before exit (IX). You
implemented two factors in earlier modules; now you can name them.

### 7. Run a migration as a one-off admin process (XII)

Run `alembic upgrade head` (or any management command) *inside the same image*
with the *same config* as the app — e.g.
`docker run --env-file .env <image> alembic upgrade head`.

Expected: the admin task runs in an identical environment to the app, using the
same codebase and config — not via SSH or a separate script. That's factor XII,
and it's why migrations are reproducible and reviewable.

### 8. Diagnose and fix: the app that won't scale

A service "works perfectly" on the developer's laptop but corrupts data and
loses uploads the moment it's run as three replicas in staging, and every deploy
needs a rebuild for each environment. Identify which factors it violates and how
to fix each.

```python
sessions = {}                                   # (a)
UPLOAD_DIR = "/app/uploads"                      # (b)
DATABASE_URL = "postgresql://localhost/prod"     # (c)
API_KEY = "sk_live_51H..."                       # (d)

@app.post("/upload")
async def upload(f: UploadFile):
    open(f"{UPLOAD_DIR}/{f.filename}", "wb").write(await f.read())  # (b)
    jobs.append(f.filename)                       # (a) in-memory job list
    return {"ok": True}

# logs written to /var/log/app.log with rotation                    # (e)
# deploy: edit DATABASE_URL/API_KEY in source, rebuild per env       # (c),(d),(f)
```

<details>
<summary>Solution</summary>

**(a) — violates VI (stateless processes).** `sessions` and `jobs` are in-memory,
so with three replicas each has its own copy — a session created on replica A is
invisible to B, and the job list is fragmented and lost on restart. This is the
"corrupts data with >1 replica" bug. Fix: sessions in **Redis**, the job queue in
a real broker (Redis/RabbitMQ — background-processing track).

**(b) — violates VI (local filesystem as state).** Uploads written to local disk
land on whichever replica served the request and vanish when it's rescheduled
(module 09) — hence "loses uploads." Fix: write to **object storage** (S3/MinIO),
store only a pointer in the DB (the background-processing capstone's discipline).

**(c) + (d) — violate III (config in code) and V (config baked into build).** The
DB URL and a **live secret** are hardcoded, so you leak credentials and must edit
source + rebuild per environment. Fix: read both from the environment via
`Settings`, `SecretStr` for the key; inject at release, so one image runs
everywhere.

**(e) — violates XI (logs).** Writing/rotating a local log file fights the
platform and dies with the ephemeral container. Fix: structured JSON to
**stdout**; let the environment ship it (modules 04-05).

**(f) — violates I and V (one codebase/build, many deploys).** Rebuilding per
environment means the artifact isn't immutable and dev≠prod (also breaks X
parity). Fix: build **once**, release with per-environment config.

Root cause, one theme: the app **conflates itself with its environment and holds
its own state.** Externalize config (III) and state (VI → IV) to the environment
and backing services, log to stdout (XI), and build once/release many (I/V), and
it scales to N replicas, deploys without a per-env rebuild, and stops losing
data. Every fix is the same move: separate the app from its environment and its
code from its state — the through-line of all twelve factors.

</details>

## Independent challenge

No code given. Take the fully-built, observable, gracefully-shutting-down service
from **modules 05-09** and put it through a rigorous **12-factor audit and
refactor**, producing a written scorecard (factor → satisfied/partial/violated →
evidence → fix). Then *demonstrate* the three factors most services get wrong:
(1) **statelessness (VI)** — find any in-memory or local-disk state and move it to
a backing service, then prove correctness by running the service as **3 replicas
behind a load balancer** and showing behaviour is identical regardless of which
replica serves a request; (2) **config (III)** — pass the "open-source it right
now" test by grepping for any hardcoded secret/environment value and externalizing
it, secrets as `SecretStr`; and (3) **build/release/run (V)** — build one image
and run it in two environments (different config, no rebuild). Tie it back
explicitly: point to where in **modules 02-03** you already implemented factor
III, where **modules 04-05** implemented factor XI, and where **module 09**
implemented factor IX — and identify the one or two factors this track *didn't*
teach that your service still needs work on. Conclude with a paragraph on where
you would *deliberately* break a factor and why (e.g. a stateful component), to
show you understand it as a framework, not dogma.

<details>
<summary>Hint</summary>

The audit is most honest if you look for the *violations* first: grep for
module-level mutable state (`= {}`, `= []`, module-level counters), local file
paths (`open(...)`, `/tmp`, `/app/...`), and hardcoded config
(`grep -rEi "sk_|password|localhost|:5432"`). Each hit maps to a factor: mutable
state → VI, file paths → VI, hardcoded config → III/V. For the 3-replica proof,
the cleanest demonstration is a value that *must* be shared (a session, a counter,
an uploaded file): with in-memory state it's inconsistent across replicas; moved
to Redis/object storage it's identical — that contrast *is* the proof that VI
enables VIII. For the "already implemented" ties, you're not re-doing work — you're
*recognizing* that `pydantic-settings` + `SecretStr` was III, JSON-to-stdout was
XI, and `lifespan` + SIGTERM drain was IX. The deliberate-break paragraph is the
maturity check: a database or a stateful stream processor *is* stateful by
nature, so factor VI doesn't apply to it — the factors describe *your app*, and
the state it externalizes lives in things that are allowed to be stateful.

</details>

## Common mistakes & troubleshooting

- **In-memory or local-disk state (violates VI).** A dict cache, a local file, a
  counter — breaks with >1 replica and is lost on restart. Put persistent state
  in a backing service (Redis/DB/object storage); keep processes stateless.
- **Hardcoded config or secrets (violates III/V).** Requires a rebuild per
  environment and leaks credentials. Read config from the environment, inject at
  release; use `SecretStr`. Pass the "could I open-source this now?" test.
- **Rebuilding per environment (violates I/V).** The artifact isn't immutable and
  dev≠prod. Build once, release many with different config.
- **Writing/rotating local log files (violates XI).** Fights the platform, dies
  with the container. Emit structured JSON to stdout; let the environment ship
  it.
- **Backing services wired in code, not config (violates IV).** Can't swap local
  vs cloud without a code change. Reach every backing service by a URL/handle
  from config.
- **Slow startup or no graceful shutdown (violates IX).** Makes scaling and
  deploys slow/lossy. Start fast; drain on SIGTERM (module 09).
- **Ad-hoc admin work via SSH (violates XII).** Bypasses codebase, parity, and
  review. Run management tasks as one-off processes in the same image/config.
- **Treating the factors as dogma.** They're a strong default, not law — stateful
  components legitimately break VI. Understand the reasoning (separate app from
  environment, code from state) and break a factor only with a clear reason.

## Checkpoint quiz

Write down your answer to each question before expanding it — checking without attempting first is the single easiest way to fool yourself into thinking you've learned this.

1. What single question does the 12-factor methodology answer, and what is the
   one through-line connecting all twelve factors?
2. Name the three factors you already implemented earlier in this track, and
   which modules implemented each.
3. Explain factor VI (stateless processes) and why it is the enabling condition
   for factors VIII (concurrency) and IX (disposability). Give a concrete
   "works with one replica, breaks with two" example and its fix.
4. State factor III's "open-source test" and explain how factors III and V
   together let one build artifact run in every environment.
5. What is a "backing service" (IV), and what does treating it as an *attached
   resource* let you do that hardcoding a connection wouldn't?
6. Is 12-factor meant to be followed dogmatically? Give one factor you might
   deliberately break and the reasoning that justifies it.

<details>
<summary>Answers</summary>

1. It answers: *what makes an application portable, scalable, and operable in a
   modern cloud/container environment* (rather than "works on my machine"). The
   through-line is **strict separation of the app from its environment, and of
   code from state** — config, backing services, and logs are externalized to the
   environment; persistent state is externalized to backing services; the process
   is a stateless, disposable, environment-agnostic unit. That separation is what
   lets a platform run, scale, and redeploy the app freely.
2. **III (config in the environment)** — modules 02-03 (`pydantic-settings`,
   `SecretStr`). **XI (logs as event streams to stdout)** — modules 04-05
   (structured JSON to stdout, environment ships it). **IX (disposability: fast
   startup, graceful shutdown)** — module 09 (`lifespan`, SIGTERM drain).
3. Factor VI says processes must be **stateless and share-nothing** — persistent
   state goes in a backing service, never process memory or local disk. It
   enables VIII (concurrency) because if any replica can serve any request
   identically, you can scale out by adding replicas behind a load balancer; and
   it enables IX (disposability) because a stateless process can be killed/
   restarted freely without losing state. Example: an in-memory `sessions = {}`
   works with one replica but with two, a session created on replica A is
   invisible on B (and lost on restart) — fix by storing sessions in Redis so any
   replica sees them.
4. The open-source test: *could you make the codebase public right now without
   leaking any credentials?* If a secret or env-specific value is in the repo,
   config isn't properly externalized. Factors III + V together: config lives in
   the environment (III) and is injected at the **release** stage (V), separate
   from the immutable **build** artifact — so the *same build* combines with
   different config to run in dev, staging, and prod without a rebuild (which is
   also what makes factor I "one codebase, many deploys" and factor X parity
   work).
5. A backing service is any external resource the app consumes — database, cache,
   queue, SMTP, third-party API — reached via a URL/handle from config. Treating
   it as an *attached resource* means you can swap one for another (local Postgres
   ↔ managed cloud Postgres) by changing only the connection string, with no code
   change — giving you portability across environments and easy dev/prod parity,
   which hardcoding a connection would prevent.
6. No — it's a strong *default*, not dogma. You'd deliberately break **VI
   (statelessness)** for a component that is inherently stateful — a database, a
   stateful stream processor — because the factors describe *your application*,
   and the state it externalizes has to live *somewhere* that is allowed to be
   stateful. The maturity is understanding the reasoning (separate app from
   environment, code from state) and breaking a factor only with a clear,
   specific reason.

</details>

## Further reading & sources

- [The Twelve-Factor App](https://12factor.net/) - the original methodology by Adam Wiggins and Heroku engineers; read all twelve factors in full.
- [The Twelve-Factor App — VI. Processes](https://12factor.net/processes) - the statelessness factor that enables horizontal scaling and disposability.
- [The Twelve-Factor App — IV. Backing services](https://12factor.net/backing-services) - treating databases, caches, and queues as attached, swappable resources.
- [Beyond the Twelve-Factor App (VMware/O'Reilly)](https://www.vmware.com/docs/beyond-the-12-factor-app) - Kevin Hoffman's updated take that extends and revises the factors for modern cloud-native apps.
- [pydantic-settings documentation](https://docs.pydantic.dev/latest/concepts/pydantic_settings/) - the concrete implementation of factor III (config in the environment) for a FastAPI service.

## Next

[11-capstone-project](../11-capstone-project/README.md) — you now have every
piece: correct error handling, environment-driven config, structured centralized
logging, metrics, tracing, symptom-based alerting, graceful shutdown, and the
12-factor framework that ties them together. The capstone puts them to work at
once: take a real FastAPI service from "it runs" to genuinely **operationally
ready** — observable through all three pillars, alertable without fatigue,
gracefully disposable, and 12-factor-clean — and prove each property under
failure, not just on the happy path.
