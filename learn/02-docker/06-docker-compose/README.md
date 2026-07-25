# Docker Compose

## Why this matters

You just wired up a two-container app by hand: create a network, build
an image, run each container with the right flags, remember the exact
`docker run` invocations for next time. That doesn't scale past a couple
of containers, and it's not reproducible for a teammate (or future you).
Compose lets you describe your whole multi-container app — services,
networks, volumes — in one YAML file and bring it all up or down with a
single command.

## Concepts

### One file describes one project

A `compose.yaml` file (the current standard filename; you'll also see the
older `docker-compose.yml`, both work) describes one **project**: a set of
services, the networks connecting them, and the volumes they use. Running
`docker compose up` reads that file and does, in one step, everything you
did by hand in module 05.

### A service is one component of the app

A **service** is a named entry under `services:` describing how to run one
component: which image or `build:` context, its ports, environment,
volumes, and dependencies. Compose creates one or more containers per
service.

### build vs image

A service either builds from a local Dockerfile (`build: ./web`) or pulls
a pre-built image (`image: redis:7-alpine`). You can specify both to build
locally and tag the result. `build:` is the Compose equivalent of `docker
build`; `image:` is the equivalent of `docker pull`.

### depends_on controls order, not readiness

**`depends_on`** controls *startup order* — Compose starts the depended-on
service's container first — but by default does **not** wait for it to be
actually ready to accept connections. A database's container process
starting and the database accepting connections are different moments.
Adding `condition: service_healthy` (paired with a `healthcheck:` on the
dependency) makes Compose actually wait for health, the reliable way to
sequence "app waits for database."

### Networks and volumes come for free

Compose creates a project-scoped user-defined bridge network and attaches
every service to it — so services reach each other by service name via
DNS, exactly like module 05's user-defined network, now automatic. Named
volumes are declared once under a top-level `volumes:` key and referenced
by service, the same concept as module 04's named volumes but written as
code.

### Project name and variable substitution

By default Compose derives the **project name** from the directory
containing `compose.yaml`, and prefixes resource names (network, volume)
with it, so multiple projects don't collide. Compose also reads a `.env`
file in the project directory and substitutes `${VARNAME}` references in
the YAML, letting you parameterize image tags or ports without editing the
file. Compose adds no new runtime concept beyond modules 02-05 — it's
declarative automation over `build`, `network create`, `volume create`,
and `run`.

> In Docker Desktop: a Compose project appears in the **Containers** tab
> as a single collapsible group named after the project, with its services
> nested under it. You can start/stop the whole project from that group,
> click into any service's container for its Logs/Inspect/Terminal
> sub-tabs, and see health status per service — the GUI view of `docker
> compose ps`.

## Command reference

| Command | What it does | Example |
|---|---|---|
| `docker compose up` | Builds (if needed) and starts all services in the foreground | `docker compose up` |
| `docker compose up -d` | Same, but detached (background) | `docker compose up -d` |
| `docker compose up --build` | Forces a rebuild of images before starting | `docker compose up --build` |
| `docker compose down` | Stops and removes containers and the project's default network | `docker compose down` |
| `docker compose down -v` | Also removes named volumes declared in the file | `docker compose down -v` |
| `docker compose ps` | Lists this project's containers and status | `docker compose ps` |
| `docker compose logs [-f] [service]` | Shows logs for all or one service | `docker compose logs -f web` |
| `docker compose exec <service> <cmd>` | Runs a command inside a running service's container | `docker compose exec web bash` |
| `docker compose build` | Builds images for services with a `build:` key, without starting | `docker compose build` |
| `docker compose config` | Renders the fully resolved config (after substitution) | `docker compose config` |
| `docker compose stop` | Stops containers without removing them | `docker compose stop` |

Flag breakdown for the multi-flag Compose commands:

- `docker compose up -d`:
  - `up` builds any images that don't exist yet, creates the network, and
    starts every service.
  - `-d` (detached) runs them in the background and returns your prompt,
    instead of streaming interleaved logs in the foreground.
- `docker compose up --build`:
  - `--build` forces images to be rebuilt first, even if one already
    exists — needed after Dockerfile or dependency changes.
- `docker compose down -v`:
  - `down` stops and removes the project's containers and default
    network.
  - `-v` additionally deletes the named volumes declared in the file —
    destroys persisted data, so use it deliberately.
- `docker compose logs -f web`:
  - `-f` (follow) streams new log lines instead of printing and exiting.
  - `web` limits output to that one service (omit it for all services).

## Hands-on exercises

You'll create everything inline — the app, its Dockerfile, and the
Compose file. Nothing is downloaded.

1. **(WSL2 Ubuntu terminal)** Create the project directory, the web app
   under `./web`, and a minimal `compose.yaml`:
   ```bash
   mkdir -p ~/learn-docker/compose-lab/web && cd ~/learn-docker/compose-lab

   cat > web/app.py <<'EOF'
   from flask import Flask

   app = Flask(__name__)

   @app.get("/health")
   def health():
       return {"status": "ok"}

   if __name__ == "__main__":
       app.run(host="0.0.0.0", port=8000)
   EOF

   cat > web/requirements.txt <<'EOF'
   flask==3.0.3
   EOF

   cat > web/Dockerfile <<'EOF'
   FROM python:3.12-slim
   WORKDIR /code
   COPY requirements.txt .
   RUN pip install --no-cache-dir -r requirements.txt
   COPY app.py .
   EXPOSE 8000
   CMD ["python", "app.py"]
   EOF

   cat > compose.yaml <<'EOF'
   services:
     web:
       build: ./web
       ports:
         - "8000:8000"
   EOF

   docker compose up -d
   docker compose ps
   curl -s http://localhost:8000/health
   ```
   Expect `docker compose ps` to show `web` running and the `curl` to
   return `{"status":"ok"}`.

2. **(Docker Desktop GUI, then CLI)** See the project in the GUI. Open the
   **Containers** tab: there's now a group named `compose-lab` with `web`
   nested under it. Expand it, click `web`, and open its **Logs** sub-tab
   to see Flask's startup output. Cross-check what Compose created behind
   the scenes from the CLI:
   ```bash
   docker network ls | grep compose-lab
   docker compose config
   ```
   Expect a network named `compose-lab_default` (the project prefix you
   saw as the group name in the GUI), and `docker compose config` to print
   the fully resolved YAML.

3. **(WSL2 Ubuntu terminal)** Add a second service (Redis) and a named
   volume:
   ```bash
   cat > compose.yaml <<'EOF'
   services:
     web:
       build: ./web
       ports:
         - "8000:8000"
       environment:
         - REDIS_URL=redis://cache:6379
       depends_on:
         - cache
     cache:
       image: redis:7-alpine
       volumes:
         - cachedata:/data

   volumes:
     cachedata:
   EOF

   docker compose up -d
   docker compose ps
   ```
   Expect two services, `web` and `cache`, both running. In the GUI, the
   `compose-lab` group now nests both.

4. **(WSL2 Ubuntu terminal)** Confirm service-name DNS resolution works
   between them (same mechanism as module 05, now automatic):
   ```bash
   docker compose exec web sh -c "apt-get update -qq && apt-get install -y -qq iputils-ping >/dev/null; ping -c 2 cache"
   ```
   Expect `ping` to succeed, resolving `cache` to its container IP.

5. **(WSL2 Ubuntu terminal)** Observe the `depends_on` ordering
   limitation. Stop everything, then bring it up in the foreground:
   ```bash
   docker compose down
   docker compose up
   ```
   Watch the interleaved logs, then Ctrl+C after a few seconds. Notice
   `cache` starts before `web`, but Compose doesn't verify Redis is
   actually *accepting connections* before starting `web` — only that its
   container process began. For a small, fast image like `redis` this is
   rarely a problem, but it's why `condition: service_healthy` exists.

6. **(WSL2 Ubuntu terminal)** Add a healthcheck-gated dependency:
   ```bash
   cat > compose.yaml <<'EOF'
   services:
     web:
       build: ./web
       ports:
         - "8000:8000"
       environment:
         - REDIS_URL=redis://cache:6379
       depends_on:
         cache:
           condition: service_healthy
     cache:
       image: redis:7-alpine
       volumes:
         - cachedata:/data
       healthcheck:
         test: ["CMD", "redis-cli", "ping"]
         interval: 5s
         timeout: 3s
         retries: 5

   volumes:
     cachedata:
   EOF

   docker compose up -d
   docker compose ps
   ```
   Expect `cache` to show `(healthy)` and `web` to have started only after
   that health check passed. Docker Desktop shows the same `(healthy)`
   marker on `cache` in the project group.

7. **(WSL2 Ubuntu terminal)** Confirm the named volume persists across a
   `down` (without `-v`) and a fresh `up`:
   ```bash
   docker compose exec cache redis-cli set marker "still-here"
   docker compose down
   docker compose up -d
   docker compose exec cache redis-cli get marker
   ```
   Expect `"still-here"` to print — the named volume `cachedata` outlived
   the `down`, same principle as module 04.

8. **(WSL2 Ubuntu terminal)** Now use `-v` to wipe volumes and confirm the
   data is gone:
   ```bash
   docker compose down -v
   docker compose up -d
   docker compose exec cache redis-cli get marker
   ```
   Expect the last command to print `(nil)` — `-v` removed `cachedata`, so
   a fresh, empty volume was created on `up`.

9. **Diagnose and fix: a service that exits immediately in Compose.** Add
   a deliberately one-shot third service:
   ```bash
   cat >> compose.yaml <<'EOF'

     oneshot:
       image: alpine
       command: echo "done"
   EOF

   docker compose up -d
   docker compose ps -a
   docker compose logs oneshot
   ```
   Expect `oneshot` to show `Exited (0)` almost immediately — same root
   cause as module 02's exercise 9 (the process finished, so the container
   has nothing left to run), visible in the GUI project group too. Fix it
   (if you actually wanted a long-running service) with a command that
   doesn't exit, e.g. `command: sh -c "while true; do sleep 3600; done"` —
   or recognize this is expected for genuinely one-shot tasks and not a
   bug. Remove the `oneshot` block afterward to keep the file clean.

10. **(WSL2 Ubuntu terminal)** Full cleanup:
    ```bash
    docker compose down -v
    docker compose ps -a
    docker volume ls
    ```
    Expect no containers or volumes left over from this project. In Docker
    Desktop, the `compose-lab` group disappears from the Containers tab.

## Independent challenge

No commands given here — figure it out yourself using what you know from this module and earlier ones.

**Task:** Take the two-container setup you wired up by hand in module 05 (the app plus a second service on a shared network) and reproduce the *entire* thing as a single `compose.yaml`, with no manual `docker network create`, `docker volume create`, or individual `docker run` commands. Your file must give the app a published port, attach a second service (a database or Redis from an official image), give that second service a named volume for its data, and make the app wait for the second service to be genuinely ready — not merely started — before it comes up. Then prove two things: that the two services resolve each other by service name (module 05's DNS, now automatic), and that the second service's data survives a teardown that keeps volumes but is wiped by the teardown that removes them.

<details>
<summary>Stuck? One hint</summary>

You need a top-level `volumes:` key referenced by the second service, a `healthcheck:` on that service using a tool the image actually ships, and `depends_on:` with `condition: service_healthy` on the app — then contrast `docker compose down` with `docker compose down -v`.

</details>

## Common mistakes & troubleshooting

- **Editing a running service's `build:` context and expecting `docker
  compose up` alone to pick it up.** `up` without `--build` reuses an
  existing image; use `docker compose up --build` (or `docker compose
  build` first) after Dockerfile or dependency changes.
- **Assuming `depends_on` means "wait until ready."** Without `condition:
  service_healthy` (and a `healthcheck:` on the dependency), it only
  guarantees start order — a frequent cause of "my app crashed on startup
  because the database wasn't accepting connections yet."
- **Running `docker compose down` when you meant `down -v`, or vice
  versa.** Plain `down` keeps named volumes (data survives); `-v` deletes
  them. Know which you want before running it against real data.
- **Forgetting that Compose prefixes resource names with the project
  (directory) name**, then being confused why `docker network ls` or
  `docker volume ls` shows names you didn't type — expected, and it avoids
  collisions between projects.
- **Mixing up `docker compose exec` and `docker compose run`.** `exec`
  runs a command in an *already-running* service container; `run` starts a
  brand-new one-off container from that service's image (useful for a
  migration) — not interchangeable.
- **Not noticing a service failed its healthcheck and everything
  downstream is stuck waiting.** `docker compose ps` (and the health
  marker in Docker Desktop's project group) shows health directly — check
  it before assuming a "stuck" `up` is a networking problem.

## Checkpoint quiz

Write down your answer to each question before expanding it — checking without attempting first is the single easiest way to fool yourself into thinking you've learned this.

<details>
<summary>Show questions</summary>

1. What single command tears down all of a Compose project's containers
   and its default network, and what extra flag also removes named
   volumes?
2. Why doesn't `depends_on` alone guarantee that a dependency service is
   actually ready to accept connections before a dependent service
   starts?
3. What mechanism fixes the limitation in question 2, and what two things
   does it require you to configure?
4. If you edit a service's Dockerfile and just run `docker compose up -d`
   again without `--build`, will your changes take effect? Why or why
   not?
5. How does DNS-based service discovery in Compose relate to what you
   learned about user-defined bridge networks in module 05?
6. What's the difference between `docker compose exec` and `docker compose
   run`?
7. How does a Compose project appear in Docker Desktop's Containers tab,
   and what can you do to it from there?

</details>

<details>
<summary>Show answers</summary>

1. `docker compose down` tears down containers and the default network;
   adding `-v` also removes named volumes declared in the file.
2. `depends_on` only sequences container *start order* — it confirms the
   dependency's container process has begun, not that the application
   inside it has finished initializing and is accepting connections.
3. `depends_on: <service>: condition: service_healthy`, which requires the
   dependency to define a `healthcheck:` block Compose can poll to
   determine actual readiness.
4. No — `docker compose up` without `--build` reuses an existing image;
   you need `docker compose up --build` or a prior `docker compose build`
   to pick up Dockerfile or source changes.
5. Compose automatically creates a project-scoped user-defined bridge
   network and attaches every service to it, giving free DNS resolution by
   service name — the exact mechanism module 05 set up manually with
   `docker network create` and `--network`.
6. `exec` runs an additional command inside an already-running service
   container; `run` starts a brand-new, separate one-off container from
   that service's image/config, useful for tasks like a migration.
7. As a single collapsible group named after the project, with its
   services nested inside — you can start/stop the whole project, and
   click any service for its Logs/Inspect/Terminal sub-tabs and health
   status.

</details>

## Next

Continue to
[07-multi-stage-builds-and-optimization](../07-multi-stage-builds-and-optimization/README.md)
to shrink and speed up the images you've been building all along.
