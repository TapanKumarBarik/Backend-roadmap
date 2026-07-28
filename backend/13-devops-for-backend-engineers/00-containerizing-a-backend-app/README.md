# Module 00: Containerizing a Backend App

## Why this matters

Your FastAPI app runs on your laptop. To run anywhere else — a colleague's
machine, CI, staging, production behind a load balancer — it needs to become a
**container image**: a self-contained, immutable artifact that bundles your code,
its pinned dependencies, and just enough OS to run, so it behaves identically
everywhere. This is factor II (declare and isolate dependencies) and factor V
(the build stage produces an immutable artifact) from track 08 module 10 made
concrete. The image *is* the "build" in build/release/run.

The catch is that the *quality* of that image is your job as the backend
engineer, not the platform team's. A careless `Dockerfile` produces a
1.2 GB image that takes eight minutes to build, ships a compiler and your test
suite to production, runs as root, and rebuilds every layer whenever you change
one line of code. A good one produces a ~150 MB image that builds in seconds on a
cache hit, contains only your runtime dependencies, runs as an unprivileged user,
and starts in under a second. The difference is entirely in how you write ~20
lines of `Dockerfile`, and it directly affects deploy speed, your CI bill, your
attack surface, and how fast an orchestrator can pull and start a new replica
during a scale-up.

This module teaches the backend engineer's slice of Docker: how to containerize
*your app* well. It is **not** a Docker course — image internals, registries,
networking, volumes, Compose, and BuildKit deep-dives all live in
**`learn/02-docker`**, and you should work through that track for the full
operational picture. Here we answer one question: given a Python/FastAPI service,
what does a production-grade `Dockerfile` look like and why?

## Concepts

### Images, layers, and the build cache

A Docker **image** is built from a `Dockerfile` — a sequence of instructions,
each of which produces a **layer** (a filesystem diff) stacked on top of the
previous one. Layers are content-addressed and cached: when you rebuild, Docker
reuses a cached layer as long as that instruction *and everything before it* are
unchanged. The moment one instruction's inputs change, that layer and **every
layer after it** are rebuilt from scratch.

This single rule drives almost every `Dockerfile` decision. The practical
consequence: **order instructions from least-frequently-changed to
most-frequently-changed.** Your dependencies (`requirements.txt` /
`pyproject.toml`) change rarely; your source code changes on every commit. So you
copy and install dependencies *first*, in their own layer, and copy your source
*last*:

```dockerfile
COPY requirements.txt .
RUN pip install -r requirements.txt   # cached until requirements.txt changes
COPY . .                              # changes every commit — but deps layer is reused
```

Invert this (copy all source, then install) and every one-character code change
busts the dependency layer, reinstalling every package on every build. Getting
the ordering right is the difference between a 4-second and a 4-minute rebuild.

### Multi-stage builds: build-time vs runtime

Your app needs different things to be *built* than to be *run*. Compiling C
extensions for packages like `psycopg`, `asyncpg`, or `pydantic-core` may need
`gcc`, build headers, and `pip`'s full toolchain — none of which the running app
uses. Shipping them bloats the image and enlarges the attack surface.

A **multi-stage build** solves this: use one stage (the *builder*) to install and
compile everything, then a second, clean *runtime* stage that copies only the
finished artifacts (the installed packages and your code) out of the builder. The
build tools stay behind in the discarded builder stage and never reach the final
image.

```
   builder stage (discarded)          runtime stage (shipped)
 ┌───────────────────────────┐      ┌───────────────────────────┐
 │ python:3.12-slim          │      │ python:3.12-slim          │
 │  + gcc, build headers     │      │  (no gcc, no build deps)  │
 │  + pip wheel cache        │      │                           │
 │  RUN pip install → /venv ─┼──┐   │  COPY --from=builder /venv│
 │  (compiles psycopg, etc.) │  └──►│  COPY app source          │
 └───────────────────────────┘      │  USER appuser  ~150 MB    │
        left behind ✗               └───────────────────────────┘
```

```dockerfile
FROM python:3.12-slim AS builder
# install compilers, build wheels here...

FROM python:3.12-slim AS runtime
COPY --from=builder /opt/venv /opt/venv   # only the built venv crosses over
```

The final image contains your virtualenv and your source — not `gcc`, not the
`.git` directory, not your test dependencies. This is the single biggest lever on
image size for a Python service.

### Base image choice: slim vs full vs alpine vs distroless

The `FROM` line sets your floor for size and security. The common choices for
Python:

- **`python:3.12`** (full Debian) — ~1 GB, includes a full toolchain. Convenient,
  wasteful. Rarely the right production choice.
- **`python:3.12-slim`** — ~120 MB, Debian minus the build tooling and extras.
  **The sensible default for a FastAPI app.** `glibc`-based, so binary wheels
  (the manylinux wheels PyPI serves) just work.
- **`python:3.12-alpine`** — ~50 MB, `musl`-based. Tempting for size, but `musl`
  means many packages have *no* prebuilt wheel and must compile from source —
  slower builds, occasional runtime surprises. Usually **not** worth it for a
  Python web service; the slim savings aren't there and the pain is real.
- **`distroless`** (e.g. `gcr.io/distroless/python3`) — no shell, no package
  manager, minimal attack surface. Excellent for hardened production, but harder
  to debug (no shell to `exec` into). A step to take deliberately, not by default.

Pin a specific tag (`python:3.12-slim`, ideally down to a digest for
reproducibility), never `python:latest` — "latest" silently changes under you and
destroys build reproducibility (factor X, dev/prod parity).

### Running as non-root

By default a container runs as `root`. If an attacker exploits your app, root in
the container is a much better foothold than an unprivileged user — and if
container isolation is ever weak or misconfigured, root inside can threaten the
host. There is almost never a reason for a Python web app to run as root.

Create an unprivileged user in the `Dockerfile` and switch to it before the app
runs:

```dockerfile
RUN useradd --create-home --uid 1001 appuser
USER appuser
```

Kubernetes can *enforce* this with `runAsNonRoot: true` in a SecurityContext (see
`learn/03-kubernetes`), but the image should be non-root on its own so it's safe
by default everywhere. Note the ordering: do root-requiring steps (installing
system packages) *before* `USER appuser`, and make sure the app doesn't need to
write anywhere it doesn't own.

### The runtime contract: EXPOSE, CMD, and binding

The final pieces tell the platform how to run and reach your app:

- **`EXPOSE 8000`** documents the port the app listens on (it's metadata, not a
  firewall rule — it doesn't publish anything by itself).
- **`CMD`** is the process the container runs. For FastAPI in production you run
  an ASGI server — `uvicorn` (optionally managed by `gunicorn` with uvicorn
  workers). Use the **exec form** (`CMD ["uvicorn", ...]`, a JSON array) not the
  shell form (`CMD uvicorn ...`), so your app runs as PID 1 directly and receives
  signals — critical for graceful shutdown (track 08 module 09, and module 01
  here).
- **Bind to `0.0.0.0`, not `127.0.0.1`.** Inside a container, `127.0.0.1` is only
  reachable from *within the container* — the platform can't route traffic to it.
  Binding `0.0.0.0` (factor VII, port binding) is what makes the app reachable.
  This is the single most common "works locally, unreachable in a container" bug.

`.dockerignore` (a sibling of `.gitignore`) keeps `.git`, `__pycache__`, `.venv`,
tests, and secrets *out* of the build context — smaller, faster, safer builds.

## Command reference

| Instruction / command | Purpose |
|---|---|
| `FROM python:3.12-slim AS builder` | Base image + named build stage |
| `WORKDIR /app` | Set (and create) the working directory |
| `COPY requirements.txt .` | Copy deps manifest first (cache-friendly) |
| `RUN pip install --no-cache-dir -r requirements.txt` | Install deps in a cached layer |
| `COPY --from=builder /opt/venv /opt/venv` | Pull artifacts from an earlier stage |
| `RUN useradd --uid 1001 appuser` / `USER appuser` | Create and switch to a non-root user |
| `EXPOSE 8000` | Document the listening port (metadata) |
| `CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]` | Runtime process, exec form, bind all interfaces |
| `docker build -t myapp:dev .` | Build an image from the current directory |
| `docker run --rm -p 8000:8000 --env-file .env myapp:dev` | Run it, publish the port, inject config |
| `docker images myapp` | Inspect image size |
| `docker history myapp:dev` | See per-layer sizes (find the bloat) |

A production-grade multi-stage Dockerfile for a FastAPI app:

```dockerfile
# ---- builder: has the toolchain, builds the virtualenv ----
FROM python:3.12-slim AS builder

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

# System build deps only needed to compile wheels (kept out of runtime image)
RUN apt-get update && apt-get install -y --no-install-recommends gcc \
    && rm -rf /var/lib/apt/lists/*

# Create an isolated venv we can copy wholesale into the runtime stage
RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

# Deps first — this layer is cached until requirements.txt changes
COPY requirements.txt .
RUN pip install -r requirements.txt

# ---- runtime: clean, minimal, non-root ----
FROM python:3.12-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PATH="/opt/venv/bin:$PATH"

WORKDIR /app

# Copy just the finished virtualenv from the builder — no gcc, no pip cache
COPY --from=builder /opt/venv /opt/venv

# Non-root user, created before we copy code so ownership is clean
RUN useradd --create-home --uid 1001 appuser
COPY --chown=appuser:appuser . .
USER appuser

EXPOSE 8000
# Exec form → uvicorn is PID 1 and receives SIGTERM; bind 0.0.0.0 to be reachable
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

A matching `.dockerignore`:

```gitignore
.git
.venv
__pycache__/
*.pyc
.pytest_cache/
tests/
.env
*.md
```

`PYTHONUNBUFFERED=1` is worth calling out: it forces stdout/stderr to be
unbuffered so your logs (factor XI) stream out immediately instead of being held
in a buffer until the process exits — essential for `docker logs` and log
shipping to show anything in real time.

## Hands-on exercises

Work in a small FastAPI project (reuse any service from an earlier track). You'll
grow one `Dockerfile` across these exercises.

### 1. A naive first image, measured

Write the simplest possible `Dockerfile`: `FROM python:3.12`, `COPY . .`,
`RUN pip install -r requirements.txt`, `CMD` to run uvicorn. Build it and record
the size with `docker images` and the build time. This is your baseline to beat.

### 2. Switch to slim and add `.dockerignore`

Change the base to `python:3.12-slim` and add a `.dockerignore`. Rebuild and
compare size. Note how much came from the base image alone, and how much the
build *context* shrank (watch the "Sending build context" size).

### 3. Fix the layer ordering for cache hits

Reorder so `requirements.txt` is copied and installed *before* `COPY . .`. Build
once. Now change one line of source and rebuild. Confirm the dependency install
layer is served from cache (`CACHED` in the output) and the rebuild takes seconds,
not minutes. Then change `requirements.txt` and confirm the install layer
correctly busts.

### 4. Go multi-stage

Split into a `builder` stage (venv + any compilers) and a clean `runtime` stage
that `COPY --from=builder` pulls the venv into. Rebuild and compare size to
exercise 2. Run `docker history` on both to see where the savings came from.

### 5. Run as non-root and verify

Add a non-root `appuser` and `USER appuser`. Rebuild, run the container, and
`docker exec` in with `whoami` (or check `id`) to confirm the app process is not
root. Confirm the app still starts and serves a request.

### 6. Prove the `0.0.0.0` rule

Deliberately set `CMD` to bind `--host 127.0.0.1`. Run with `-p 8000:8000` and
`curl localhost:8000` from the host — it fails/hangs. Change to `--host 0.0.0.0`,
rerun, and confirm it works. Write one sentence explaining why.

### 7. Inject config, don't bake it

Run the same image twice with two different `--env-file` files (e.g. different
`LOG_LEVEL` or `APP_ENV`) and confirm behavior differs with no rebuild. This is
build/release/run (factor V) — one image, many releases — which module 01
develops fully.

### 8. Diagnose and fix

This `Dockerfile` builds a 1.1 GB image, rebuilds everything on every code change,
runs as root, and the app is unreachable when published with `-p 8000:8000`. Find
and fix every problem.

```dockerfile
FROM python:latest
WORKDIR /app
COPY . .
RUN pip install -r requirements.txt
CMD uvicorn app.main:app --host 127.0.0.1 --port 8000
```

<details>
<summary>Solution</summary>

- **`FROM python:latest`** → full ~1 GB base *and* non-reproducible (the tag moves
  under you). Fix: pin `python:3.12-slim` (ideally by digest). Multi-stage to
  drop build tooling from the final image.
- **`COPY . .` before `pip install`** → every code change busts the dependency
  layer, reinstalling all packages. Fix: `COPY requirements.txt .` and
  `RUN pip install` *before* `COPY . .`.
- **Runs as root** (no `USER`) → unnecessary privilege. Fix: create `appuser` and
  `USER appuser` before `CMD`.
- **`--host 127.0.0.1`** → only reachable inside the container, so `-p 8000:8000`
  can't route to it. Fix: `--host 0.0.0.0`.
- **Shell-form `CMD`** → uvicorn isn't PID 1, won't cleanly receive SIGTERM (hurts
  graceful shutdown, module 01 / track 08 module 09). Fix: exec form
  `CMD ["uvicorn", ...]`.
- Missing `.dockerignore` → `.git`, caches, `.env` bloat the context and can leak
  secrets. Fix: add one.

The corrected image is the multi-stage one in the command reference: ~150 MB,
cache-friendly, non-root, reachable, signal-correct.

</details>

## Independent challenge

No code given. Take a FastAPI service you built in an earlier track and produce a
genuinely production-grade image *from scratch*, then prove each property. Build a
multi-stage `Dockerfile` (builder + runtime), pin a slim base, order layers for
cache hits, run as a non-root user, bind `0.0.0.0`, use exec-form `CMD`, and add a
`.dockerignore`. Then demonstrate, with measurements: (1) final image size under
~200 MB and where the savings came from (`docker history`); (2) a one-line code
change rebuilds in seconds because the dependency layer is cached; (3) the running
process is non-root (`id` inside the container); (4) the same image runs with two
different env-files producing different behavior with no rebuild — connecting this
to the 12-factor build/release/run separation from **track 08's module 10 (The
12-factor app)**. Write a short paragraph mapping each choice to the factor it
serves, and note which parts you'd hand off to `learn/02-docker` to go deeper on
(BuildKit cache mounts, registries, image scanning).

<details>
<summary>Hint</summary>

The four levers, in order of impact on size: multi-stage (drops the entire build
toolchain), slim base (drops ~900 MB vs full), `.dockerignore` (drops `.git` and
caches from the context), and `--no-cache-dir` on pip (drops the wheel cache). For
the cache-hit proof, the whole trick is that `COPY requirements.txt` +
`RUN pip install` must appear *before* `COPY . .` — put them the other way and
nothing you do fixes it. For the "same image, different config" proof, the
cleanest demonstration is a value the app *reads and echoes* (an `/info` endpoint
returning `APP_ENV`), run once per env-file so the contrast is visible.

</details>

## Common mistakes & troubleshooting

- **Copying source before installing deps.** Busts the dependency cache on every
  commit — the single most common slow-build cause. Copy the manifest and install
  first.
- **`FROM python:latest` (or any unpinned tag).** Non-reproducible builds and a
  huge base. Pin `python:3.12-slim`, ideally by digest.
- **Not using multi-stage.** Ships `gcc`, build headers, and pip caches to prod.
  Build in one stage, copy only artifacts into a clean runtime stage.
- **Binding `127.0.0.1`.** App is unreachable from outside the container. Bind
  `0.0.0.0`.
- **Shell-form `CMD`.** uvicorn runs under a shell, isn't PID 1, and swallows
  SIGTERM — graceful shutdown breaks. Use exec form (JSON array).
- **Running as root.** Unnecessary privilege and attack surface. Create and switch
  to a non-root user; do root-needing steps before `USER`.
- **No `.dockerignore`.** `.git`, `__pycache__`, `.venv`, and worst of all `.env`
  get baked into the image — bloat and secret leakage.
- **Alpine by reflex.** `musl` forces source builds of many wheels — slower builds,
  odd runtime bugs, little real savings over slim for a Python web app.

## Checkpoint quiz

Write down your answer to each question before expanding it — checking without attempting first is the single easiest way to fool yourself into thinking you've learned this.

1. Explain the build-cache rule in one sentence, and use it to justify why
   `requirements.txt` is copied and installed before your source code.
2. What does a multi-stage build get you that a single-stage build can't, and what
   specifically stays behind in the discarded builder stage for a Python app?
3. Why bind `0.0.0.0` instead of `127.0.0.1` inside a container, and what's the
   symptom when you get it wrong?
4. Give two concrete reasons to run the app as a non-root user, and one ordering
   rule you must respect when adding `USER` to a Dockerfile.
5. Why does exec-form `CMD` matter for graceful shutdown, and which later
   concern (from which track/module) does that connect to?
6. Someone proposes `python:3.12-alpine` "to save space." When is that a bad
   trade for a FastAPI service, and what's the sensible default instead?

<details>
<summary>Answers</summary>

1. A layer is reused from cache only if its instruction and every layer before it
   are unchanged; once one busts, all later layers rebuild. Dependencies change
   rarely and source changes every commit, so installing deps *first* keeps that
   expensive layer cached across code changes — put source first and every commit
   reinstalls everything.
2. Multi-stage separates the *build* environment from the *runtime* environment:
   you compile/install in a builder and copy only the finished artifacts (the
   virtualenv and your code) into a clean runtime image. For Python, `gcc`, build
   headers, apt lists, and the pip/wheel cache stay behind in the builder and
   never ship to production — smaller image, smaller attack surface.
3. `127.0.0.1` is only reachable from inside the container, so the platform (and
   your `-p` publish) can't route traffic to it; `0.0.0.0` binds all interfaces so
   it's reachable. The symptom is "app runs fine in `docker logs` but `curl`
   to the published port hangs or connection-refused."
4. Reasons (any two): a compromised app has only unprivileged access, not root;
   smaller blast radius if container isolation is weak/misconfigured; and it
   satisfies orchestrator policy like `runAsNonRoot`. Ordering rule: perform all
   root-requiring steps (installing system packages, chowning files) *before* the
   `USER` switch, since after it you no longer have root.
5. Exec form makes uvicorn PID 1, so it receives SIGTERM directly from the
   platform and can run its shutdown/drain logic; shell form wraps it in `/bin/sh`
   which may not forward the signal, so the app is killed abruptly. This connects
   to graceful shutdown — **track 08, module 09** — and is developed in this
   track's module 01 (disposability in a container).
6. Alpine uses `musl`, so many Python packages have no prebuilt wheel and must
   compile from source (slower builds, occasional runtime bugs), and the size win
   over slim is modest for a real web service. The sensible default is
   `python:3.12-slim` (glibc, binary wheels just work); reach for distroless, not
   alpine, when you want to go further on hardening.

</details>

## Further reading & sources

- [Docker: Multi-stage builds](https://docs.docker.com/build/building/multi-stage/) - Docker's official guide to the builder/runtime split that keeps `gcc` and pip caches out of your final FastAPI image.
- [Dockerfile best practices](https://docs.docker.com/develop/develop-images/dockerfile_best-practices/) - Layer-ordering, cache, and `.dockerignore` guidance underpinning the cache-hit and slim-base rules in this module.
- [Docker: Dockerfile reference](https://docs.docker.com/reference/dockerfile/) - Authoritative semantics for `FROM`, `COPY --from`, `EXPOSE`, `USER`, and exec-form vs shell-form `CMD`.
- [The Twelve-Factor App: Build, release, run (factor V)](https://12factor.net/build-release-run) - Why the image is an immutable build artifact injected with config at run time — the principle this module makes concrete.
- [Python on Docker Hub: official images and tags](https://hub.docker.com/_/python) - The slim/alpine/full tag matrix behind the base-image choice discussion and why to pin rather than use `latest`.

## Next

[01-the-12-factor-app-in-a-container](../01-the-12-factor-app-in-a-container/README.md)
— you can now build a good image. Next we connect the 12-factor principles you
learned in track 08 to how they actually manifest *inside* that container: config
injected as env vars at run time, the process kept stateless so replicas are
interchangeable, and SIGTERM handled so the container is genuinely disposable
during a deploy.
