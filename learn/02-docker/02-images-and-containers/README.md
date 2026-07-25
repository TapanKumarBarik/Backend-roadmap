# Images and Containers

## Why this matters

Every Docker workflow is "build (or pull) an image, then run one or more
containers from it." Understanding what an image actually is — layers,
not a monolithic blob — explains why builds are fast on the second try,
why disk usage doesn't multiply per container, and why "it works on my
machine" bugs shrink dramatically once you're always running from the
same image.

## Concepts

### An image is a read-only template

An **image** is a read-only template: a stack of filesystem layers plus
metadata (the default command to run, exposed ports, environment
variables). It doesn't run; it's the blueprint you run *from*. Nothing
you do to a running container changes the image it came from.

### A container is a running instance of an image

A **container** is a running (or stopped) instance created from an image,
with one thin **writable layer** added on top. Many containers can be
created from the same image at once — think of the image as a class and
each container as an instance of it. In Linux terms: the image is a
read-only base filesystem, and the container is that filesystem plus a
private overlay of changes (Docker's storage drivers implement this with
`overlayfs`, the same read-only-plus-read-write stacking you may have
seen with `mount -t overlay`).

### Layers come from Dockerfile instructions

Each instruction in a Dockerfile that changes the filesystem (`RUN`,
`COPY`, `ADD`) produces a new, cached, content-addressed **layer**. Layers
are shared across images: if two images both start `FROM python:3.12-slim`,
they share that base's layers on disk instead of duplicating them. This
is why `docker pull` for an image that shares a base with one you already
have is fast — it only downloads the layers you don't already have.

> In Docker Desktop: the **Images** tab lists every local image and its
> size, the GUI equivalent of `docker images`. Click an image to see its
> layers and the command that created each — the same information
> `docker history` prints.

### The container lifecycle maps to process states

The lifecycle states line up with process states you already know from
`ps`:

- `docker create` — makes a container (writable layer + config) without
  starting it. Rarely used directly.
- `docker run` — create, then start, then (by default) attach your
  terminal to its stdout/stderr. It's `create` + `start` + `attach`.
- **Running** — PID 1 inside the container is executing.
- **Exited** — PID 1 has terminated; the writable layer and metadata
  still exist on disk until you `docker rm` it.
- `docker stop` — sends `SIGTERM`, waits a grace period, then `SIGKILL`
  if needed (the same signal-then-timeout-then-kill pattern you'd script
  with `kill` and `sleep`).
- `docker rm` — deletes a stopped container's writable layer and metadata
  permanently.

> In Docker Desktop: the **Containers** tab shows each container's state
> (`Running`, `Exited`) live. The Start/Stop/Delete buttons on each row
> are the GUI equivalents of `docker start`, `docker stop`, and
> `docker rm`.

### exec and logs let you look inside

**`docker exec`** starts a *new* process inside an *already-running*
container's namespaces — useful for poking around a live container
(closer to `nsenter` than SSH). **`docker logs`** replays the
stdout/stderr that the container's PID 1 has produced, buffered by the
Docker daemon — which is why well-behaved containers log to
stdout/stderr rather than to a file, the same convention you'd follow for
a daemon on bare Linux.

> In Docker Desktop: click a running container and use its **Logs**
> sub-tab (equivalent to `docker logs`), its **Terminal** or **Exec**
> sub-tab (equivalent to `docker exec -it`), and its **Inspect** sub-tab
> (equivalent to `docker inspect`).

## Command reference

| Command | What it does | Example |
|---|---|---|
| `docker pull <image>[:tag]` | Downloads an image (and any missing layers) from a registry | `docker pull python:3.12-slim` |
| `docker images` | Lists locally stored images | `docker images` |
| `docker run [flags] <image> [cmd]` | Creates and starts a container from an image | `docker run -d --name web -p 8000:8000 webapp` |
| `docker ps` | Lists running containers | `docker ps` |
| `docker ps -a` | Lists all containers, running or stopped | `docker ps -a` |
| `docker logs [-f] <container>` | Shows a container's stdout/stderr; `-f` follows/streams it | `docker logs -f web` |
| `docker exec [-it] <container> <cmd>` | Runs an additional command inside a running container | `docker exec -it web bash` |
| `docker stop <container>` | Sends `SIGTERM`, waits, then `SIGKILL` if needed | `docker stop web` |
| `docker start <container>` | Restarts a previously stopped (not removed) container | `docker start web` |
| `docker rm [-f] <container>` | Removes a stopped container; `-f` force-stops first | `docker rm -f web` |
| `docker inspect <container\|image>` | Dumps full JSON metadata: config, mounts, network, state | `docker inspect web` |
| `docker image rm <image>` | Deletes a local image (fails if a container still references it) | `docker image rm webapp` |
| `docker history <image>` | Lists an image's layers with the command that created each | `docker history webapp` |
| `docker system df` | Shows disk usage for images, containers, volumes, build cache | `docker system df` |

Flag breakdown for `docker run -d --name web -p 8000:8000 webapp`:

- `-d` (detached) — run in the background and return your prompt,
  instead of attaching to the container's output.
- `--name web` — give the container a fixed, memorable name so you can
  refer to it as `web` in later commands instead of a random ID/name.
- `-p 8000:8000` — publish a port, in `host:container` order: traffic to
  port `8000` on your host is forwarded to port `8000` inside the
  container. (Ports get a full treatment in module 05.)
- `webapp` — the image to create the container from.

Two more that take flags:

- `docker logs -f web` — `-f` (follow) streams new log lines as they
  arrive instead of printing what exists and exiting.
- `docker exec -it web bash` — `-i` keeps STDIN open and `-t` allocates a
  TTY, together giving you an interactive shell inside `web`.

## Hands-on exercises

Several exercises use a tiny self-contained example app. You'll create it
inline in exercise 2 — there is nothing to download.

1. **(WSL2 Ubuntu terminal)** Pull a small base image and inspect its
   layers:
   ```bash
   docker pull python:3.12-slim
   docker history python:3.12-slim
   ```
   Expect a multi-row table, each row one layer, with a `CREATED BY`
   command and a size — this is the base image your example app will be
   built `FROM`.

2. **(WSL2 Ubuntu terminal)** Create the example app from scratch, then
   build its image. Everything here is written by you — no external
   folder needed:
   ```bash
   mkdir -p ~/learn-docker/webapp && cd ~/learn-docker/webapp

   cat > app.py <<'EOF'
   from flask import Flask

   app = Flask(__name__)

   @app.get("/health")
   def health():
       return {"status": "ok"}

   @app.get("/")
   def index():
       return "Hello from the example app\n"

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

   docker build -t webapp .
   ```
   Flag breakdown for `docker build -t webapp .`: `-t webapp` tags the
   resulting image with the name `webapp`; the `.` is the build
   context — the current directory, whose files are sent to the daemon.
   Expect several build steps ending in a line naming the image
   `webapp:latest`.

3. **(WSL2 Ubuntu terminal)** Run it detached and confirm it's live:
   ```bash
   docker run -d --name web -p 8000:8000 webapp
   docker ps
   curl -s http://localhost:8000/health
   ```
   Expect `docker ps` to show `web` as `Up`, and the `curl` to print
   `{"status":"ok"}`.

4. **(Docker Desktop GUI, then CLI)** Read logs and open a shell from the
   GUI. In Docker Desktop's **Containers** tab, click `web`. On its
   **Logs** sub-tab you'll see Flask's startup lines (including a line
   about serving on `0.0.0.0:8000`). Now open the container's **Terminal**
   (or **Exec**) sub-tab and run `cat /etc/os-release` — you're inside the
   Debian-based `python:3.12-slim` filesystem, not your Ubuntu host.
   Cross-check both from the CLI:
   ```bash
   docker logs web
   docker exec -it web bash -c "cat /etc/os-release"
   ```
   Expect the CLI logs and the GUI Logs sub-tab to match exactly — same
   engine, two views.

5. **(WSL2 Ubuntu terminal)** Run a second container from the same image
   to see "class vs. instance" directly:
   ```bash
   docker run -d --name web2 -p 8001:8000 webapp
   docker ps
   curl -s http://localhost:8001/health
   ```
   Flag note: `-p 8001:8000` maps host port `8001` to the same container
   port `8000`, so the two containers don't collide on the host. Expect
   both `web` and `web2` listed as separate running containers from one
   image, each serving on its own published port. You'll also see both in
   the **Containers** tab.

6. **(WSL2 Ubuntu terminal)** Stop, then restart (don't remove) a
   container and confirm state:
   ```bash
   docker stop web
   docker ps -a
   docker start web
   docker ps
   ```
   Expect `web` to show `Exited` after `stop` and `Up` again after
   `start` — `stop`/`start` doesn't destroy the container, just pauses
   its process.

7. **(WSL2 Ubuntu terminal)** Confirm an exited container's filesystem
   changes persist until removal. Write a file, stop, restart, re-read:
   ```bash
   docker exec web sh -c "echo hello > /tmp/note.txt"
   docker stop web && docker start web
   docker exec web cat /tmp/note.txt
   ```
   Expect `hello` to print — the writable layer survived stop/start. It
   would **not** survive `docker rm` + a fresh `docker run`, since that
   creates a brand-new writable layer.

8. **(WSL2 Ubuntu terminal)** Clean up the extra containers and check
   image disk usage:
   ```bash
   docker rm -f web web2
   docker system df
   ```
   Expect the containers gone from `docker ps -a`, and `docker system df`
   still showing the `webapp` and `python:3.12-slim` images taking disk
   space (images survive container removal). The **Images** tab confirms
   both are still present.

9. **Diagnose and fix: container exits immediately.** Try this
   deliberately broken run:
   ```bash
   docker run -d --name broken webapp python -c "print('hi')"
   docker ps -a
   docker logs broken
   ```
   Expect `broken` to show `Exited (0)` almost immediately — you overrode
   the image's `CMD` (which starts the long-running Flask server) with a
   one-shot `python -c` command that finishes instantly and exits, so the
   container has nothing left to run. This is one of the most common
   real-world "why did my container die" causes: the foreground process
   finished. You can watch it flash `Exited` in the **Containers** tab
   too. Fix it by running without the override so the image's original
   `CMD` takes over:
   ```bash
   docker rm broken
   docker run -d --name fixed -p 8002:8000 webapp
   docker ps
   ```
   Expect `fixed` to stay `Up`.

10. **(WSL2 Ubuntu terminal)** Clean up everything from this module:
    ```bash
    docker rm -f fixed
    docker image rm webapp
    docker ps -a
    docker images
    ```
    Expect no leftover containers from this exercise, and `webapp` gone
    from `docker images` (the pulled `python:3.12-slim` base may remain
    shared/cached — that's expected and fine). You can do the deletion in
    the GUI instead: delete `fixed` from the **Containers** tab, then
    delete the `webapp` image from the **Images** tab, and the CLI will
    reflect the same result.

## Independent challenge

No commands given here — figure it out yourself using what you know from this module and earlier ones.

**Task:** Build the small Flask example image this module uses, then design an experiment that proves the "one image, many independent writable layers" claim rather than just reading it. Run two containers from the same image, make a distinct change inside each one's filesystem (write a different file, or different contents to the same path), and demonstrate that neither container can see the other's change and that neither change is present in the image itself. Then show that one of those changes survives a stop/start but is destroyed by a remove-and-recreate. Connect this back to module 01: explain why the writable layer is per-container in the same way each container's PID and network namespace was per-container there.

<details>
<summary>Stuck? One hint</summary>

Use `docker exec` to write into each running container and to read back from the other, and remember that a fresh `docker run` after `docker rm` starts a brand-new writable layer while `docker stop`/`docker start` reuses the existing one.

</details>

## Common mistakes & troubleshooting

- **"My container exited immediately and I don't know why."** Almost
  always: the main process finished or crashed. Run `docker logs <name>`
  first, always — or open the container's **Logs** sub-tab in Docker
  Desktop. It's the single highest-value diagnostic in Docker. If logs
  are empty, check whether you accidentally overrode `CMD` with something
  that exits instantly (exercise 9).
- **Confusing `docker stop` (pauses, keeps container) with `docker rm`
  (permanently deletes it).** `stop` is reversible with `start`; `rm` is
  not — the writable layer is gone.
- **Trying to `docker image rm` an image still used by a container.**
  Docker refuses; you must `docker rm` the container(s) first, or use
  `docker image rm -f`.
- **Expecting `docker exec -it <name> bash` to work on every image.**
  Minimal base images (e.g. `scratch`, `distroless`) don't ship a shell
  at all — you'll get "exec: bash: not found." Try `sh`, or accept that
  some hardened images aren't meant to be shelled into (module 07).
- **Thinking edits inside a running container survive a rebuild.** They
  don't — a rebuilt image is a fresh set of layers; a container run from
  it starts with a brand-new writable layer with none of your live edits.
  Persistent data needs a volume (module 04).

## Checkpoint quiz

Write down your answer to each question before expanding it — checking without attempting first is the single easiest way to fool yourself into thinking you've learned this.

<details>
<summary>Show questions</summary>

1. What's the relationship between an image and a container — which one
   is read-only and which has a writable layer?
2. Why does pulling a second image that shares a base image with one you
   already have go faster than pulling both from scratch?
3. What's the first command you should run when a container has exited
   unexpectedly, and where's the GUI equivalent?
4. What's the difference between `docker stop` and `docker rm`, in terms
   of what's recoverable?
5. Why did the `broken` container in exercise 9 exit immediately even
   though the image itself runs a working web server by default?
6. What does `docker exec` actually do, in terms of namespaces, and how
   is that different from what `docker run` does?
7. If you write a file inside a running container's filesystem and then
   `docker stop` + `docker start` it, is the file still there? What if
   you instead `docker rm` it and `docker run` a new container?

</details>

<details>
<summary>Show answers</summary>

1. The image is the read-only template (stacked layers); the container
   is a running/stopped instance with one thin writable layer added on
   top of that image's layers.
2. Docker only downloads the layers it doesn't already have locally —
   shared base layers (a common `FROM` image) are reused, not
   re-downloaded.
3. `docker logs <container>` — it shows whatever the main process printed
   before exiting. In Docker Desktop, the same output is under the
   container's **Logs** sub-tab.
4. `docker stop` pauses the container's process but keeps its writable
   layer and metadata, so `docker start` resumes it; `docker rm`
   permanently deletes the writable layer and metadata.
5. Providing a command after the image name in `docker run` overrides the
   image's default `CMD` entirely — `python -c "print('hi')"` replaced the
   server command, finished instantly, so the container had nothing left
   running.
6. `docker exec` starts a brand-new process inside the namespaces of an
   *already-running* container; `docker run` creates a whole new container
   (new writable layer, new namespaces) from an image and starts its main
   process.
7. Yes, the file survives `stop`/`start` — the writable layer isn't
   touched. No, it does not survive `rm` + a fresh `run` — that creates an
   entirely new writable layer with none of the previous changes.

</details>

## Next

Continue to
[03-dockerfile-deep-dive](../03-dockerfile-deep-dive/README.md) to learn
how the layers you just poked at with `docker history` actually get
authored.
