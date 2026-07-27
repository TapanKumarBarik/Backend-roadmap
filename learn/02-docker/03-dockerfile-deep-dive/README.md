# Dockerfile Deep Dive

## Why this matters

The Dockerfile is the source of truth for how your image is built — every
instruction in it becomes a layer, and the order and content of those
instructions determines build speed, image size, and reproducibility.
Writing a bad Dockerfile still "works" but rebuilds slowly, produces
bloated images, and sometimes silently bakes in the wrong files. This is
the module that turns Docker from "commands I copy-paste" into something
you actually author.

## Concepts

### A Dockerfile is a script that produces layers

A Dockerfile is read top to bottom, and most instructions produce a new
filesystem layer (module 02). The final image is the stack of those
layers. Reading a Dockerfile is like reading a build script — except each
step's result is cached and reusable.

```
  Dockerfile                          docker build
  ┌────────────────────────┐          produces layers, bottom-up
  │ FROM python:3.12-slim  │ ───────►  [ base layers ]
  │ WORKDIR /code          │ ───────►  [ + metadata  ]
  │ COPY requirements.txt .│ ───────►  [ layer       ]
  │ RUN pip install ...    │ ───────►  [ layer       ]
  │ COPY app.py .          │ ───────►  [ layer       ]
  │ CMD ["python","app.py"]│ ───────►  [ + metadata  ]
  └────────────────────────┘                  │
                                               ▼
                                        tagged image  (lab:v1)
```

### Layer caching keys on the instruction and its inputs

Docker caches each layer keyed on the instruction plus its inputs. If an
earlier layer's cache is invalidated (its instruction or the files it
copies changed), every layer *after* it must rebuild too. This is why
**instruction order matters**: put things that change rarely (installing
dependencies) before things that change often (copying application code),
so a code edit doesn't force a dependency reinstall.

```
  edit app.py  ─►  which layers rebuild?

  FROM python:3.12-slim     CACHED  ┐
  COPY requirements.txt .   CACHED  │ unchanged inputs → cache hit
  RUN pip install ...       CACHED  ┘
  COPY app.py .             REBUILD ◄── first invalidated layer
  CMD ["python","app.py"]   REBUILD ◄── everything AFTER also rebuilds
```

### The build context is uploaded before the build starts

The **build context** is the set of files sent to the Docker daemon when
you run `docker build <path>` — everything under that path (respecting
`.dockerignore`) is uploaded before the build even begins. A huge context
(accidentally including `node_modules` or `.git`) slows every build
regardless of what your Dockerfile does with it.

### .dockerignore trims the context

`.dockerignore` works exactly like `.gitignore`: patterns of files to
exclude from the context upload. Keeping it tight is the simplest way to
keep builds fast and avoid baking unwanted files into `COPY .` steps.

### Instructions, in terms you already know

- **`FROM`** — picks the base image (starting layers). Every Dockerfile
  needs one (or `FROM scratch` for a truly empty base, module 07).
- **`WORKDIR`** — like `cd`, but also creates the directory and persists
  as the working directory for every later instruction and at runtime.
- **`COPY`** — copies files from the build context into the image. Plain
  file copy, nothing clever.
- **`ADD`** — like `COPY`, but also auto-extracts local `.tar` archives
  and can fetch URLs. Prefer `COPY` unless you specifically need that
  "magic" — `ADD`'s implicit behavior is a common surprise.
- **`RUN`** — executes a command *during the build* and commits the
  result as a layer (e.g. installing packages). Different from
  `CMD`/`ENTRYPOINT`, which define what happens *at container start*.
- **`ENV`** — sets an environment variable baked into the image, visible
  to later `RUN` steps and to the running container (like `export
  VAR=value`, but persisted in image metadata).
- **`ARG`** — a build-time-only variable, available during `docker build`
  (e.g. via `--build-arg`) but **not** in the final running container
  unless you also assign it into an `ENV`.
- **`EXPOSE`** — documentation/metadata declaring which port the app
  listens on; it does **not** publish the port (that's `-p` on `docker
  run`, module 05).
- **`USER`** — switches which user later `RUN` steps and the final process
  run as (default `root`). Same Linux user model as always; covered in
  depth in module 09.
- **`CMD`** — the default command at container start, overridable by args
  passed to `docker run <image> <other-cmd>` (exactly what happened
  accidentally in module 02's exercise 9).
- **`ENTRYPOINT`** — also defines the startup command, but `docker run`
  args are *appended* to it rather than replacing it. `ENTRYPOINT` +
  `CMD` together is common: `ENTRYPOINT` fixes the program, `CMD` supplies
  default arguments that are easy to override.
- **`HEALTHCHECK`** — a command Docker runs periodically *inside* the
  container to decide if it's "healthy," surfaced in `docker ps` and
  usable by orchestrators.

> In Docker Desktop: after you build, the **Images** tab lists your tagged
> image; click it to see its layers with per-layer sizes — a visual
> version of `docker history` that makes "each instruction is a layer"
> concrete. A container's `(healthy)` state from a `HEALTHCHECK` also
> shows in the **Containers** tab status column.

## Command reference

| Command / Instruction | What it does | Example |
|---|---|---|
| `docker build -t <tag> <context>` | Builds an image from a Dockerfile in `<context>`, tagging it | `docker build -t lab:v1 .` |
| `docker build --no-cache -t <tag> .` | Rebuilds ignoring all layer cache | `docker build --no-cache -t lab:v1 .` |
| `docker build --build-arg K=V -t <tag> .` | Passes a build-time `ARG` value | `docker build --build-arg APP_VERSION=1.2.3 -t lab:arg .` |
| `FROM <image>` | Sets the base image | `FROM python:3.12-slim` |
| `WORKDIR <path>` | Sets/creates the working directory | `WORKDIR /code` |
| `COPY <src> <dest>` | Copies files from build context into the image | `COPY requirements.txt .` |
| `ADD <src> <dest>` | Like `COPY`, plus auto-extracts archives / fetches URLs | `ADD app.tar.gz /code/` |
| `RUN <cmd>` | Executes a command at build time, commits result as a layer | `RUN pip install --no-cache-dir -r requirements.txt` |
| `ENV <K>=<V>` | Sets an environment variable baked into the image | `ENV PYTHONUNBUFFERED=1` |
| `ARG <name>[=<default>]` | Declares a build-time-only variable | `ARG APP_VERSION=dev` |
| `EXPOSE <port>` | Documents the port the app listens on (no publishing) | `EXPOSE 8000` |
| `USER <name>` | Sets the user for later `RUN` steps and the runtime process | `USER appuser` |
| `CMD ["exe", "arg", ...]` | Default startup command, overridable by `docker run` args | `CMD ["python", "app.py"]` |
| `ENTRYPOINT ["exe", "arg", ...]` | Fixed startup command; `docker run` args are appended | `ENTRYPOINT ["python"]` |
| `HEALTHCHECK --interval=<t> CMD <cmd>` | Periodic in-container check for health status | `HEALTHCHECK --interval=30s CMD python -c "..." \|\| exit 1` |
| `.dockerignore` (file, not instruction) | Excludes paths from the build context upload | `.git` / `__pycache__/` / `*.pyc` |

Flag breakdown for the multi-flag build commands:

- `docker build -t lab:v1 .`:
  - `-t lab:v1` tags the built image `lab` with tag `v1`.
  - `.` is the build context — the current directory, uploaded to the
    daemon (minus `.dockerignore` entries).
- `docker build --no-cache -t lab:v1 .`:
  - `--no-cache` ignores every cached layer and rebuilds all of them —
    useful to prove a clean build or bust a stale cache.
- `docker build --build-arg APP_VERSION=1.2.3 -t lab:arg .`:
  - `--build-arg APP_VERSION=1.2.3` supplies a value for an `ARG`
    declared in the Dockerfile; it exists only during the build unless
    copied into an `ENV`.

## Hands-on exercises

You'll create a small, self-contained lab app once, then modify its
Dockerfile throughout. Nothing is downloaded.

1. **(WSL2 Ubuntu terminal)** Create the lab app and build it, twice, to
   see caching:
   ```bash
   mkdir -p ~/learn-docker/dockerfile-lab && cd ~/learn-docker/dockerfile-lab

   cat > app.py <<'EOF'
   from flask import Flask

   app = Flask(__name__)

   @app.get("/health")
   def health():
       return {"status": "ok"}

   if __name__ == "__main__":
       app.run(host="0.0.0.0", port=8000)
   EOF

   cat > requirements.txt <<'EOF'
   flask==3.0.3
   EOF

   cat > Dockerfile <<'EOF'
   FROM python:3.12-slim
   WORKDIR /code
   COPY requirements.txt .
   RUN pip install --no-cache-dir -r requirements.txt
   COPY app.py .
   EXPOSE 8000
   CMD ["python", "app.py"]
   EOF

   cat > .dockerignore <<'EOF'
   __pycache__/
   *.pyc
   .git
   EOF

   time docker build -t lab:v1 .
   time docker build -t lab:v1 .
   ```
   Expect the second build to be dramatically faster and show `CACHED`
   next to most steps — nothing changed, so every layer's cache is
   reused.

2. **(WSL2 Ubuntu terminal)** Prove instruction order matters. Add a
   harmless comment line to `app.py`, then rebuild:
   ```bash
   echo "# harmless change" >> app.py
   docker build -t lab:v2 .
   ```
   Expect `COPY requirements.txt .` and `RUN pip install ...` to stay
   `CACHED`, but `COPY app.py .` and everything after it to re-run —
   because the Dockerfile copies `requirements.txt` (rarely changes)
   before `app.py` (changes constantly), only layers from the changed
   point onward are invalidated.

3. **(WSL2 Ubuntu terminal)** Now prove the opposite ordering hurts. Make
   a scratch Dockerfile that copies the code *before* installing
   dependencies:
   ```bash
   cat > Dockerfile.bad <<'EOF'
   FROM python:3.12-slim
   WORKDIR /code
   COPY app.py .
   COPY requirements.txt .
   RUN pip install --no-cache-dir -r requirements.txt
   EXPOSE 8000
   CMD ["python", "app.py"]
   EOF

   echo "# another change" >> app.py
   docker build -f Dockerfile.bad -t lab:bad .
   ```
   Flag note: `-f Dockerfile.bad` picks a non-default Dockerfile name.
   Expect the `pip install` step to now re-run just because you touched
   application code — confirming why dependency installation should always
   come before copying application code.

4. **(WSL2 Ubuntu terminal)** Explore `.dockerignore`. Create a large
   irrelevant file, confirm it's excluded, then compare:
   ```bash
   cat .dockerignore
   mkdir -p .venv && dd if=/dev/zero of=.venv/bigfile bs=1M count=20
   echo ".venv/" >> .dockerignore
   docker build -t lab:v3 . 2>&1 | head -n 5
   ```
   Then temporarily comment out the `.venv/` line, rebuild, and compare
   how much data is transferred to the daemon at the start of the build
   (with BuildKit, watch the "transferring context" size/time near the
   top) — expect it noticeably larger without the ignore rule.

5. **(WSL2 Ubuntu terminal)** Use `ARG` vs `ENV` concretely. Make a
   scratch Dockerfile that promotes a build arg into a runtime env var:
   ```bash
   cat > Dockerfile.arg <<'EOF'
   FROM python:3.12-slim
   ARG APP_VERSION=dev
   ENV APP_VERSION=${APP_VERSION}
   WORKDIR /code
   COPY requirements.txt .
   RUN pip install --no-cache-dir -r requirements.txt
   COPY app.py .
   CMD ["python", "app.py"]
   EOF

   docker build -f Dockerfile.arg --build-arg APP_VERSION=1.2.3 -t lab:arg .
   docker run --rm lab:arg env | grep APP_VERSION
   ```
   Expect `APP_VERSION=1.2.3`. Now delete the `ENV APP_VERSION=...` line,
   rebuild, and re-run the `env | grep` — it disappears, proving `ARG`
   alone is not visible at runtime.

6. **(WSL2 Ubuntu terminal)** Confirm `EXPOSE` doesn't publish anything.
   Run without `-p`:
   ```bash
   docker run -d --name noport lab:v1
   curl -m 3 http://localhost:8000/health
   ```
   Expect the `curl` to fail (connection refused/timeout) even though the
   Dockerfile has `EXPOSE 8000` — it's metadata, not a publish rule. Clean
   up: `docker rm -f noport`.

7. **(Docker Desktop GUI, then CLI)** Add a `HEALTHCHECK` and watch the
   status turn healthy in the GUI. Build a scratch image with one:
   ```bash
   cat > Dockerfile.health <<'EOF'
   FROM python:3.12-slim
   WORKDIR /code
   COPY requirements.txt .
   RUN pip install --no-cache-dir -r requirements.txt
   COPY app.py .
   EXPOSE 8000
   HEALTHCHECK --interval=10s --timeout=3s --retries=3 \
     CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/health')" || exit 1
   CMD ["python", "app.py"]
   EOF

   docker build -f Dockerfile.health -t lab:health .
   docker run -d --name healthtest -p 8003:8000 lab:health
   ```
   Flag breakdown for the `HEALTHCHECK`: `--interval=10s` runs the check
   every 10 seconds; `--timeout=3s` fails a check that takes longer than 3
   seconds; `--retries=3` waits for 3 consecutive failures before marking
   `unhealthy`. Now open Docker Desktop's **Containers** tab: after the
   first couple of intervals, `healthtest`'s status shows `(healthy)`.
   Cross-check from the CLI:
   ```bash
   docker ps --filter name=healthtest
   ```
   Expect the same `Up ... (healthy)`. Clean up: `docker rm -f healthtest`.

8. **(WSL2 Ubuntu terminal)** Understand `CMD` override vs `ENTRYPOINT`
   append. Build an image that fixes the program but lets you swap the
   port argument:
   ```bash
   cat > Dockerfile.entry <<'EOF'
   FROM python:3.12-slim
   WORKDIR /code
   COPY requirements.txt .
   RUN pip install --no-cache-dir -r requirements.txt
   COPY app.py .
   ENTRYPOINT ["flask", "--app", "app", "run", "--host", "0.0.0.0"]
   CMD ["--port", "8000"]
   EOF

   docker build -f Dockerfile.entry -t lab:entry .
   docker run -d --name e1 -p 8004:8000 lab:entry
   docker run -d --name e2 -p 8005:8080 lab:entry --port 8080
   ```
   Expect `e1` to listen on 8000 (default `CMD` args used) and `e2` on
   8080 (your `docker run` args replaced the `CMD` portion, but the fixed
   `ENTRYPOINT` stayed). Confirm:
   ```bash
   curl -s http://localhost:8004/health
   curl -s http://localhost:8005/health
   ```
   Clean up: `docker rm -f e1 e2`.

9. **Diagnose and fix: image won't build.** Introduce a realistic typo.
   Make a scratch Dockerfile that copies `requirement.txt` (missing the
   `s`), then build:
   ```bash
   cat > Dockerfile.typo <<'EOF'
   FROM python:3.12-slim
   WORKDIR /code
   COPY requirement.txt .
   RUN pip install --no-cache-dir -r requirement.txt
   COPY app.py .
   CMD ["python", "app.py"]
   EOF

   docker build -f Dockerfile.typo -t lab:broken .
   ```
   Expect a build failure like `"/requirement.txt": not found` (exact
   wording varies by Docker version). Read the error, fix the two
   `requirement.txt` references back to `requirements.txt`, and confirm
   the build succeeds.

10. **(WSL2 Ubuntu terminal)** Clean up everything from this module:
    ```bash
    docker rm -f $(docker ps -aq --filter ancestor=lab:v1) 2>/dev/null
    docker rmi lab:v1 lab:v2 lab:v3 lab:arg lab:health lab:entry lab:bad 2>/dev/null
    docker images | grep lab
    ```
    Expect no `lab:*` images remaining. You can also delete these from the
    **Images** tab in Docker Desktop and confirm `docker images` agrees.

## Independent challenge

No commands given here — figure it out yourself using what you know from this module and earlier ones.

**Task:** Author a Dockerfile from scratch for a tiny app of your own (a two-file script plus a dependency manifest is plenty) that satisfies three constraints at once: editing the application code must *not* invalidate the dependency-install layer's cache; the container must have a fixed program it always runs, with a default argument that a `docker run` argument can override without replacing the whole command; and a value you pass only at build time must end up readable as an environment variable inside the running container. Then prove each of the three properties actually holds. Build on module 02: use the same "each instruction is a layer" inspection you did with `docker history` there to confirm which layers rebuilt and which stayed cached after a code-only change.

<details>
<summary>Stuck? One hint</summary>

Think about instruction ordering for the caching property, `ENTRYPOINT` paired with `CMD` for the fixed-program-with-overridable-argument property, and an `ARG` promoted into an `ENV` for the build-time-to-runtime property — then verify with a rebuild, a `docker run` with an extra argument, and `docker run ... env`.

</details>

## Common mistakes & troubleshooting

- **Copying the whole project before installing dependencies.** Kills
  layer caching for the dependency-install step on every code change —
  always `COPY` dependency manifests (`requirements.txt`, `package.json`)
  and install first, then `COPY` the rest.
- **No `.dockerignore`, so `.git`, virtual envs, or `node_modules` get
  sent as build context.** Slows every build and can leak files you
  didn't intend to ship.
- **Using `ADD` out of habit for plain file copies.** Its implicit
  archive-extraction and URL-fetch can silently do more than you expect;
  use `COPY` unless you specifically need `ADD`.
- **Expecting an `ARG` to be visible in the running container.** It's
  build-time only unless explicitly re-assigned into an `ENV`.
- **Assuming `EXPOSE` opens a port to the host.** It's documentation only
  — you still need `-p` on `docker run` (or `ports:` in Compose).
- **Setting `HEALTHCHECK` with too-aggressive an interval for a
  slow-starting app**, marking it `unhealthy` before it finishes booting
  — add `--start-period` to give the app time to come up.
- **Not pinning the base image tag** (e.g. `FROM python:latest`).
  `latest` moves over time; a build that worked last month can produce a
  different, broken image today. Pin specific versions
  (`python:3.12-slim`).

## Checkpoint quiz

Write down your answer to each question before expanding it — checking without attempting first is the single easiest way to fool yourself into thinking you've learned this.

<details>
<summary>Show questions</summary>

1. Why should `COPY requirements.txt .` and the dependency install step
   come before `COPY app.py .` in a Dockerfile?
2. What's the difference between `ARG` and `ENV`, and what do you need
   to do to make a build-time `ARG` value visible inside the running
   container?
3. Does `EXPOSE 8000` in a Dockerfile let you reach the container on
   port 8000 from your host without any other flags? Why or why not?
4. What's the practical difference between `CMD` and `ENTRYPOINT` when
   you pass extra arguments to `docker run`?
5. Why is `COPY` generally preferred over `ADD` for simple file copies?
6. What does `.dockerignore` do, and why does a bloated build context
   slow down builds even if your Dockerfile only copies a few files?
7. What determines whether a Dockerfile layer is rebuilt or pulled from
   cache, and where can you see the resulting layers in Docker Desktop?

</details>

<details>
<summary>Show answers</summary>

1. Docker caches layers in order and invalidates everything from the
   first changed layer onward; dependency manifests change far less often
   than application code, so installing dependencies first means code-only
   changes don't force a dependency reinstall.
2. `ARG` is only available during the build (inside `RUN` steps or via
   `--build-arg`) and is not present in the final image's runtime
   environment by default; `ENV` is baked into the image and visible both
   to later build steps and to the running container. To expose an `ARG`
   at runtime, assign it to an `ENV` (e.g. `ENV FOO=${FOO}`).
3. No — `EXPOSE` is metadata/documentation only. Reaching the container
   requires publishing the port at runtime with `-p host:container` on
   `docker run` (or `ports:` in Compose).
4. With `CMD` alone, arguments passed to `docker run <image> <args>`
   replace the entire default command. With `ENTRYPOINT` set, those
   arguments are appended to the fixed `ENTRYPOINT` instead (and a `CMD`
   alongside `ENTRYPOINT` supplies default arguments that get replaced
   when you pass your own).
5. `COPY` does a plain, predictable file copy; `ADD` additionally
   auto-extracts local tar archives and can fetch remote URLs — implicit
   behavior that can surprise you.
6. `.dockerignore` excludes matching paths from the build context
   uploaded to the daemon before the build starts; a large context
   (`.git`, `node_modules`, virtual envs) takes longer to transfer
   regardless of what the Dockerfile references.
7. Docker keys the cache on the instruction and its inputs (for
   `COPY`/`ADD`, the copied files' content); if an earlier layer is
   invalidated, every later layer rebuilds too. In Docker Desktop, click
   the image in the **Images** tab to see its layers and sizes.

</details>

## Cumulative review

Closed-book. Don't reopen earlier modules while attempting these — the
point is to find out what actually stuck.

1. You run `docker run hello-world` from your Ubuntu WSL2 terminal and it
   works, but a teammate reports the same command fails on their machine
   with only a `Client:` block and a daemon-connection error. Walk through
   where the engine actually runs on Windows and what single per-distro
   setting most likely differs between the two machines.
2. A container's main process shows as PID 1 inside the container, its
   image is only tens of MB on disk, and it shares your host's exact
   kernel version. Explain how all three facts trace back to the same
   underlying reason a container is not a VM.
3. You build an image, run a container from it, write a file into that
   container, then `docker rm` the container and `docker run` a fresh one
   from the same image. The file is gone. Which layer held the file, why
   didn't it survive, and what would you have changed in the Dockerfile if
   you wanted that file present in *every* container from the start?
4. A Dockerfile copies `app.py` before `COPY requirements.txt` and the
   `pip install` step. Describe concretely what happens to build time on
   the tenth code-only edit, and connect your answer to what `docker
   history` would show about the image's layers.
5. Explain why `EXPOSE 8000` in a Dockerfile, a container showing `Up` in
   `docker ps`, and a failed `curl http://localhost:8000` can all be true
   at the same time — and what you'd actually need to change to make the
   curl succeed.
6. You override a container's command with `docker run <image> python -c
   "print('hi')"` and it exits immediately with status 0. Explain why,
   referencing both what `docker run` does to the image's default `CMD`
   and what "the container's life is tied to its PID 1" means.
7. Two images both start `FROM python:3.12-slim`. You already have the
   first pulled; pulling the second is much faster than the first was.
   Explain the mechanism, and say where in Docker Desktop you could
   visually confirm the shared layers.
8. You want a build-time version string (`--build-arg APP_VERSION=1.4.0`)
   to be visible as an environment variable inside the running container.
   A colleague used only `ARG APP_VERSION` and it isn't showing up at
   runtime. What's missing, and why does `ARG` alone behave that way?
9. Give two independent reasons a project directory living under
   `/mnt/c/...` and lacking a `.dockerignore` would make `docker build`
   slower than the same project in your Linux home directory with a tight
   `.dockerignore` — one reason rooted in the WSL2 filesystem boundary,
   one in the build context upload.

<details>
<summary>Show answers</summary>

1. The engine (`dockerd`) runs inside the lightweight Linux VM Docker
   Desktop manages via WSL2, not natively in Ubuntu; the `docker` CLI in
   Ubuntu is a client pointed at that shared engine. The most likely
   difference is that the teammate hasn't enabled WSL Integration for
   their distro (Settings → Resources → WSL Integration), so their CLI has
   no engine to reach.
2. All three follow from a container being an ordinary host process with a
   restricted view rather than a separate machine: PID 1 is a PID-namespace
   illusion over a real host PID; the small image size is because it ships
   no kernel/boot infrastructure; and the identical kernel version is
   because there is only one kernel (the host's / the WSL2 VM's), shared by
   every container.
3. The file lived in the container's thin writable layer, which is created
   fresh per container and deleted with `docker rm` — a new `docker run`
   starts a brand-new empty writable layer. To have it present in every
   container from the start, bake it into the image with a `COPY` (or
   generate it in a `RUN`) so it becomes a read-only image layer.
4. Because the code is copied before dependencies are installed, every
   code edit invalidates the `COPY app.py` layer and therefore every layer
   after it — including `pip install` — so each of the ten edits re-runs a
   full dependency install. `docker history` would show those later layers
   rebuilt (new sizes/timestamps) rather than reused.
5. `EXPOSE` is only metadata/documentation; `Up` only means PID 1 is
   running inside the container's own network namespace; and `localhost`
   from the host doesn't reach the container's namespace without a
   published port. Making the curl succeed requires publishing the port
   with `-p 8000:8000` (or a Compose `ports:` entry) at run time.
6. Passing a command after the image name replaces the image's default
   `CMD` entirely, so the long-running server never starts; the `python -c`
   one-liner finishes instantly, and because a container exits when its
   PID 1 exits, the container is immediately `Exited (0)`.
7. `docker pull` only downloads layers not already present locally; the
   shared `python:3.12-slim` base layers are reused, so only the second
   image's unique layers are fetched. Clicking an image in Docker Desktop's
   Images tab shows its layers, letting you see the common base.
8. An `ARG` is build-time only and isn't part of the running container's
   environment; you must assign it into an `ENV` (`ENV
   APP_VERSION=${APP_VERSION}`) for it to persist into image metadata and
   be visible at runtime.
9. First, paths under `/mnt/c/...` cross the WSL2 Windows/Linux filesystem
   translation boundary, adding per-file overhead the native Linux home
   directory avoids. Second, with no `.dockerignore`, the entire directory
   (including things like `.git` or virtual envs) is uploaded as build
   context to the daemon before the build starts, which is slower
   regardless of what the Dockerfile actually copies.

</details>

## Further reading & sources

- [Dockerfile reference](https://docs.docker.com/reference/dockerfile/) - the complete, authoritative reference for every instruction covered in this module.
- [Docker: Building best practices](https://docs.docker.com/build/building/best-practices/) - official guidance on instruction ordering, cache efficiency, and small images.
- [Docker: Optimize cache usage in builds](https://docs.docker.com/build/cache/) - deep dive on how the layer cache is keyed and invalidated.
- [Docker: .dockerignore file](https://docs.docker.com/build/concepts/context/#dockerignore-files) - how to trim the build context, the file this module has you author.
- [Docker: CMD vs ENTRYPOINT interaction](https://docs.docker.com/reference/dockerfile/#understand-how-cmd-and-entrypoint-interact) - the exact table describing how run arguments combine with the two instructions.

## Next

Continue to
[04-volumes-and-bind-mounts](../04-volumes-and-bind-mounts/README.md) to
learn how to persist data beyond a container's writable layer.
