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

### Layer caching keys on the instruction and its inputs

Docker caches each layer keyed on the instruction plus its inputs. If an
earlier layer's cache is invalidated (its instruction or the files it
copies changed), every layer *after* it must rebuild too. This is why
**instruction order matters**: put things that change rarely (installing
dependencies) before things that change often (copying application code),
so a code edit doesn't force a dependency reinstall.

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

## Next

Continue to
[04-volumes-and-bind-mounts](../04-volumes-and-bind-mounts/README.md) to
learn how to persist data beyond a container's writable layer.
