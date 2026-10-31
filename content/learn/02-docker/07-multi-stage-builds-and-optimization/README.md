# Multi-Stage Builds and Optimization

## Why this matters

The Dockerfiles you've written so far ship everything used to *build* the
app (compilers, build tools, package manager caches) inside the same image
that *runs* it in production. That's bigger than it needs to be, slower to
pull and start, and carries more attack surface (module 09) than
necessary. Multi-stage builds separate "what it takes to build this" from
"what it takes to run this," and a handful of other techniques shrink and
speed up images further.

## Concepts

### A multi-stage build has more than one FROM

A **multi-stage build** is a Dockerfile with more than one `FROM`
instruction, where each `FROM` starts a new, independent build stage. You
name stages with `AS <name>`. The point is to do messy build work in one
stage and carry only the finished result into a clean final stage.

### Copy only what you need forward

A later stage selectively copies specific files out of an earlier stage
with `COPY --from=<stage>`, discarding everything else that stage produced
(compilers, intermediate artifacts, caches). The final image is built from
whichever stage is *last* in the file — anything from earlier stages not
explicitly copied forward simply isn't in the final image at all.

```
  STAGE 1: builder                      STAGE 2: final (shipped image)
  ┌────────────────────────────┐        ┌───────────────────────────┐
  │ FROM ... AS builder        │        │ FROM python:3.12-slim     │
  │ compiler / build tools     │        │ COPY --from=builder ──┐   │
  │ pip install --prefix=/inst │        │   /install /usr/local │   │
  │ intermediate artifacts     │        │ COPY app.py .         │   │
  │  ┌──────────────┐          │        │ CMD ["python","app.py"]   │
  │  │ /install ────────────────────────┘                       │   │
  │  └──────────────┘          │        └──────────┬────────────┘   │
  │  toolchain, caches ✗       │                   │ only /install
  └────────────┬───────────────┘                   ▼ carried forward
               │ DISCARDED — never in final    slim runtime image
               ▼ image
        (whole stage thrown away)
```

### The workshop-and-showroom analogy

Think of a workshop and a showroom: the workshop stage has all the tools,
sawdust, and half-finished materials; you carry only the finished product
into the showroom. The customer (production image) never sees the workshop
mess, and the tools never ship.

### Compiled vs interpreted languages

This matters most for compiled languages (Go, Rust, Java, C/C++), where
the build stage needs an entire toolchain the running binary doesn't need
at all. For interpreted languages like this module's Python app,
multi-stage builds still help — e.g. a stage that compiles C-extension
dependencies, separate from the slim runtime — but the win is smaller.

### Smaller base images

- `python:3.12-slim` (Debian-based, minimal) is much smaller than
  `python:3.12` (full Debian).
- `python:3.12-alpine` (musl-libc based) is smaller still, at the cost of
  occasional friction with packages that expect glibc.
- `distroless` images (Google-maintained) go further, shipping no shell
  and no package manager — just your app and its runtime dependencies.

### Clean up in the same layer

Layers are additive: a later layer deleting a file doesn't shrink an
earlier layer that already shipped it. So `--no-cache-dir` for pip,
`--no-install-recommends` for apt, and deleting package caches must all
happen *in the same `RUN`* that created them. Install and clean up in one
`RUN`, or the cleanup does nothing for image size.

```
  TWO RUNs (wasteful)              ONE RUN (clean)
  RUN apt-get install curl        RUN apt-get install curl \
      → layer: +40 MB  ┐              && rm -rf /var/lib/apt/lists/*
  RUN rm -rf caches    │              → layer: +8 MB (net)
      → layer: -0 MB   ┘
  earlier layer STILL ships        nothing extra ever committed
  the 40 MB (layers are additive)
```

### Ordering, .dockerignore, and BuildKit

- **Ordering layers by change frequency** (module 03) keeps rebuilds fast
  but doesn't shrink the image.
- **`.dockerignore`** (module 03) reduces build context size and keeps
  junk out of `COPY .`, not final image size directly.
- **BuildKit** is the modern build engine (default in current Docker
  Desktop) — it parallelizes independent stages and supports cache mounts
  (`--mount=type=cache`) that persist *across* builds without being baked
  into any layer.

> In Docker Desktop: the **Images** tab's `Size` column is the fastest way
> to compare a baseline image against an optimized one — build both, and
> read the two sizes side by side instead of parsing `docker images`.
> Click an image to see its per-layer breakdown, the visual version of
> `docker history` you'll use to prove where the bloat is.

## Command reference

| Command / Instruction | What it does | Example |
|---|---|---|
| `FROM <image> AS <stage>` | Starts a named build stage | `FROM python:3.12-slim AS builder` |
| `COPY --from=<stage> <src> <dest>` | Copies files from an earlier stage | `COPY --from=builder /install /usr/local` |
| `docker build --target <stage> -t <tag> .` | Builds only up to a specific stage | `docker build --target builder -t debug-stage .` |
| `docker images` | Compare sizes between builds | `docker images` |
| `docker history <image>` | Shows per-layer size breakdown | `docker history app:clean` |
| `RUN --mount=type=cache,target=<path> <cmd>` | (BuildKit) Mounts a persistent cache during the build, not baked into any layer | `RUN --mount=type=cache,target=/root/.cache/pip pip install -r requirements.txt` |
| `docker build --progress=plain -t <tag> .` | Shows detailed, unbuffered build output | `docker build --progress=plain -t app .` |

Flag breakdown for the multi-part commands:

- `docker build --target builder -t debug-stage .`:
  - `--target builder` stops the build at the stage named `builder`
    instead of building the whole file — useful for inspecting an
    intermediate stage.
  - `-t debug-stage` tags the result; `.` is the build context.
- `COPY --from=builder /install /usr/local`:
  - `--from=builder` sources the files from the `builder` stage rather
    than the build context.
  - `/install` is the path in that stage; `/usr/local` is the destination
    in the current stage.
- `RUN --mount=type=cache,target=/root/.cache/pip ...`:
  - `--mount=type=cache` provides a directory that persists across builds
    but is never committed to a layer.
  - `target=/root/.cache/pip` is where it appears during this `RUN` (pip's
    download cache), so repeat builds skip re-downloading.

## Hands-on exercises

You'll create the app inline in exercise 1, then optimize its Dockerfile.
Nothing is downloaded.

1. **(WSL2 Ubuntu terminal)** Create the app and build a single-stage
   baseline:
   ```bash
   mkdir -p ~/learn-docker/optim-lab && cd ~/learn-docker/optim-lab

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

   docker build -t app:baseline .
   docker images app:baseline
   ```
   Record the `SIZE` column value — you'll compare against it. You can
   also read that size in Docker Desktop's **Images** tab.

2. **(WSL2 Ubuntu terminal)** Rewrite the Dockerfile as a multi-stage
   build that separates dependency installation from the runtime image:
   ```bash
   cat > Dockerfile <<'EOF'
   FROM python:3.12-slim AS builder
   WORKDIR /code
   COPY requirements.txt .
   RUN pip install --no-cache-dir --prefix=/install -r requirements.txt

   FROM python:3.12-slim
   WORKDIR /code
   COPY --from=builder /install /usr/local
   COPY app.py .
   EXPOSE 8000
   CMD ["python", "app.py"]
   EOF

   docker build -t app:multistage .
   docker images | grep -E "app:(baseline|multistage)"
   ```
   For this app (pure-Python dependencies, no compiler), expect the size
   difference to be modest — the real value of the pattern is much bigger
   when a build stage needs a compiler toolchain. Confirm it still works:
   ```bash
   docker run --rm -d --name mstest -p 8020:8000 app:multistage
   curl -s http://localhost:8020/health
   docker rm -f mstest
   ```

3. **(WSL2 Ubuntu terminal)** See a stage-only build with `--target`:
   ```bash
   docker build --target builder -t app:builder-only .
   docker run --rm app:builder-only sh -c "ls /install && pip --version"
   ```
   Expect the `builder` stage to have `pip` and the installed packages
   under `/install`; this stage is never shipped as-is — only specific
   paths from it get copied forward.

4. **(WSL2 Ubuntu terminal)** Compare base image variants directly:
   ```bash
   docker pull python:3.12
   docker pull python:3.12-slim
   docker pull python:3.12-alpine
   docker images python
   ```
   Expect `python:3.12` the largest, `python:3.12-slim` noticeably
   smaller, and `python:3.12-alpine` smaller still. The **Images** tab
   shows the same three sizes in one view.

5. **(WSL2 Ubuntu terminal)** Prove the "clean up in the same layer" rule
   with a deliberate contrast:
   ```bash
   cat > Dockerfile.wasteful <<'EOF'
   FROM python:3.12-slim
   RUN apt-get update && apt-get install -y --no-install-recommends curl
   RUN rm -rf /var/lib/apt/lists/*
   EOF

   cat > Dockerfile.clean <<'EOF'
   FROM python:3.12-slim
   RUN apt-get update && apt-get install -y --no-install-recommends curl \
       && rm -rf /var/lib/apt/lists/*
   EOF

   docker build -f Dockerfile.wasteful -t app:wasteful .
   docker build -f Dockerfile.clean -t app:clean .
   docker images | grep -E "app:(wasteful|clean)"
   ```
   Expect `app:wasteful` to be larger — the `rm -rf` in its own separate
   `RUN` only removes the files from *that* layer's view; the previous
   layer still ships them, because layers are additive and earlier layers
   can't be shrunk by a later one.

6. **(Docker Desktop GUI, then CLI)** Confirm exercise 5's explanation by
   inspecting layers. In Docker Desktop's **Images** tab, click
   `app:wasteful` and look at its layer list: the `apt-get install` layer
   is large, and the separate `rm -rf` layer reclaims nothing. Then click
   `app:clean` and see its single combined layer is smaller. Cross-check
   from the CLI:
   ```bash
   docker history app:wasteful
   docker history app:clean
   ```
   Expect the CLI per-layer breakdown to match what the GUI's layer view
   showed.

7. **(WSL2 Ubuntu terminal)** Use a BuildKit cache mount for pip so
   repeated builds don't re-download packages, without baking pip's cache
   into any layer. Build a variant whose `builder` stage uses a cache
   mount:
   ```bash
   cat > Dockerfile.cachemount <<'EOF'
   FROM python:3.12-slim AS builder
   WORKDIR /code
   COPY requirements.txt .
   RUN --mount=type=cache,target=/root/.cache/pip \
       pip install --prefix=/install -r requirements.txt

   FROM python:3.12-slim
   WORKDIR /code
   COPY --from=builder /install /usr/local
   COPY app.py .
   EXPOSE 8000
   CMD ["python", "app.py"]
   EOF

   docker build -f Dockerfile.cachemount -t app:cachemount .
   docker build -f Dockerfile.cachemount --no-cache -t app:cachemount .
   ```
   (Note there's no `--no-cache-dir` here — the cache mount is the whole
   point.) Even with `--no-cache` forcing every layer to rebuild, expect
   the `pip install` step to stay fast on the second run, since the
   downloaded wheels persisted in the cache mount, outside the layer
   system entirely.

8. **Diagnose and fix: a broken multi-stage copy.** Introduce a wrong
   `--from` stage name:
   ```bash
   cat > Dockerfile.brokenstage <<'EOF'
   FROM python:3.12-slim AS builder
   WORKDIR /code
   COPY requirements.txt .
   RUN pip install --no-cache-dir --prefix=/install -r requirements.txt

   FROM python:3.12-slim
   WORKDIR /code
   COPY --from=build /install /usr/local
   COPY app.py .
   EXPOSE 8000
   CMD ["python", "app.py"]
   EOF

   docker build -f Dockerfile.brokenstage -t app:brokenstage .
   ```
   Expect a build error referencing an undefined stage (`build` was
   typo'd — the stage is named `builder`). Fix `--from=build` back to
   `--from=builder` and confirm the build succeeds.

9. **(WSL2 Ubuntu terminal)** Compare total sizes across everything you
   built this module:
   ```bash
   docker images | grep -E "^app "
   ```
   Note which variant ended up smallest and connect it to the technique
   that produced it (multi-stage's small win here since it's pure Python;
   combined-layer cleanup's more meaningful win). The **Images** tab
   sorted by size shows the same ranking visually.

10. **(WSL2 Ubuntu terminal)** Clean up:
    ```bash
    docker rmi app:baseline app:multistage app:builder-only app:wasteful app:clean app:cachemount app:brokenstage 2>/dev/null
    docker images | grep -E "^app "
    ```
    Expect no `app:*` images left. You can also delete them from the
    **Images** tab and confirm `docker images` agrees.

## Independent challenge

No commands given here — figure it out yourself using what you know from this module and earlier ones.

**Task:** Author a Dockerfile where a multi-stage build produces a *meaningfully* smaller final image — not the marginal win you get with pure-Python dependencies. Pick something whose build genuinely needs a toolchain the runtime doesn't: for example, an app with a dependency that has to be compiled (pulling in a compiler/build headers during install) but needs none of that at run time. Build a naive single-stage version and your multi-stage version, and quantify the size difference between them. On top of the multi-stage split, apply at least one same-layer cleanup and one base-image choice from this module, and confirm each contributed. Reuse module 03's Dockerfile-authoring discipline (layer ordering) so your build stage still caches well across rebuilds.

<details>
<summary>Stuck? One hint</summary>

Do the heavy install (with build tooling) in a `builder` stage, then `COPY --from=builder` only the finished artifacts into a clean slim/distroless final stage — and compare the two images with `docker images` and their per-layer breakdown.

</details>

## Common mistakes & troubleshooting

- **Installing and cleaning up in separate `RUN` layers.** As shown in
  exercises 5-6, this does not shrink the image — combine install and
  cleanup into a single `RUN`.
- **Forgetting to name a build stage and then trying to `COPY --from=0`
  by index.** Unnamed stages are referenced by numeric index (`0`, `1`,
  ...) in build order, which is fragile if you reorder — always name
  stages with `AS <name>`.
- **Copying more than necessary from the builder stage** (e.g. `COPY
  --from=builder /code /code`), accidentally dragging build-time files
  back into the final image and defeating the split.
- **Assuming Alpine images are always a safe drop-in.** Alpine uses musl
  libc instead of glibc, which occasionally breaks Python packages with
  compiled C extensions — test before switching to `-alpine` beyond a toy
  example.
- **Using `--target` for a one-off debug build and forgetting to remove
  the resulting image**, cluttering `docker images` (and the Images tab)
  with a partial build.
- **Expecting `--mount=type=cache` contents to appear in the final
  image.** Cache mounts exist only during that `RUN` and are never
  committed to any layer — correct for speeding up builds, wrong if you
  need a file to persist into the shipped image.

## Checkpoint quiz

Write down your answer to each question before expanding it — checking without attempting first is the single easiest way to fool yourself into thinking you've learned this.

<details>
<summary>Show questions</summary>

1. In a multi-stage Dockerfile, what happens to files from an earlier
   stage that are never referenced by a `COPY --from=` in a later stage?
2. Why does combining a package install and its cache cleanup into one
   `RUN` produce a smaller image than doing them in two separate `RUN`
   instructions?
3. What's the main benefit of a multi-stage build for a compiled language
   (e.g. Go) compared to an interpreted one like Python?
4. What does `docker build --target <stage>` let you do, and why is it
   useful while debugging a Dockerfile?
5. What's the trade-off of switching a base image from `-slim` to
   `-alpine`?
6. What's the difference between a BuildKit cache mount
   (`--mount=type=cache`) and a normal Docker layer, in terms of what
   ends up in the final image?
7. Which Docker Desktop tab and view let you compare image sizes and
   inspect per-layer sizes, and which CLI commands match them?

</details>

<details>
<summary>Show answers</summary>

1. They simply aren't part of the final image at all — only the last stage
   (or the `--target` stage) becomes the resulting image, and anything not
   explicitly copied forward is discarded with the rest of that stage.
2. Layers are additive and immutable once created — a cache written in one
   `RUN` layer and deleted in a later, separate `RUN` layer still ships in
   the earlier layer; only install-and-cleanup within the same `RUN` keeps
   the cache out of the final image.
3. Compiled languages need an entire toolchain to produce the binary, none
   of which the running binary needs afterward — multi-stage discards that
   toolchain, shipping only the compiled artifact. Interpreted languages
   still run their source/interpreter in production, so the split saves
   less.
4. It builds only up through the named stage instead of the whole file,
   letting you inspect or debug an intermediate stage without completing
   the full build.
5. `-alpine` images are typically smaller, but use musl libc instead of
   glibc, which can break compiled dependencies that assume glibc — worth
   testing rather than assuming it's a safe swap.
6. A cache mount's contents persist across builds but are never committed
   into any image layer — useful for speeding up repeated
   downloads/compiles without bloating the image; a normal layer's
   contents become a permanent part of the image once committed.
7. The **Images** tab shows each image's `Size` (matching `docker
   images`), and clicking an image shows its per-layer breakdown (matching
   `docker history`).

</details>

## Cumulative review

Closed-book. Don't reopen earlier modules while attempting these — the
point is to find out what actually stuck.

1. A database container writes its data files into a path backed by a
   named volume. You `docker rm -f` the container and start a brand-new
   one from the same image with the same volume mounted, and the data is
   still there — but a colleague who instead relied on the container's
   writable layer lost everything. Explain both outcomes in terms of what
   a volume is versus what a writable layer is.
2. You mount your source directory into a container with a bind mount for
   live editing, and separately point a `compose.yaml` service at a named
   volume for its database. Explain why a bind mount is the right tool for
   the first and a named volume for the second, referencing who manages
   the storage in each case.
3. Two containers need to talk to each other. Describe why putting them on
   a user-defined bridge network (or letting Compose create one) gives you
   name-based addressing that the default bridge network does not, and
   what port number the calling container should use to reach the other.
4. A `compose.yaml` app service crashes on startup because its database
   "wasn't ready," even though `depends_on` lists the database. Explain
   the gap between "container started" and "service ready," and the two
   configuration pieces that close it.
5. You publish a container with `-p 8000:8000`, and from another container
   on the same network `curl http://<name>:8000` works while `curl
   http://localhost:8000` does not. Explain both results in one coherent
   picture of what `localhost` means inside a container and how the
   published port relates to container-to-container traffic.
6. A teammate's Dockerfile installs build tooling with apt in one `RUN`
   and deletes the apt cache in a separate later `RUN`, and is puzzled the
   image didn't shrink. Explain why, and how a multi-stage build attacks
   the same bloat problem from a different angle.
7. For a pure-Python Flask app, converting to a multi-stage build barely
   changes the image size, but for a Go program it can shrink the image
   dramatically. Explain the difference in terms of what each language
   needs at build time versus run time.
8. A Compose project you didn't name explicitly still produced a network
   called something like `myapp_default` and a volume prefixed the same
   way. Explain where that prefix comes from and why it's useful when you
   run several projects on one machine.
9. You want repeated image builds to stop re-downloading the same pip
   wheels, but you do *not* want those cached wheels shipped inside the
   final image. Name the BuildKit feature that fits, and contrast where
   its contents live versus a normal image layer's contents.
10. Give the sequence of concepts, in order, that lets a `docker compose
    up` recreate — in one command — everything you built by hand across
    modules 04 and 05 (storage that persists, a network with name
    resolution, and multiple containers started together).

<details>
<summary>Show answers</summary>

1. A named volume is storage Docker manages independently of any
   container's lifecycle, so it persists across `docker rm` and remounts
   into a fresh container intact. A container's writable layer is created
   per container and destroyed with `docker rm`, so data that only ever
   lived there is permanently gone once the container is removed.
2. A bind mount points directly at an existing host directory you manage,
   so host edits appear instantly inside the container with no copy step —
   ideal for live-editing source. A named volume is Docker-managed storage
   (living inside the Docker Desktop VM), consistent for ownership and
   location and not meant for host editing — ideal for a database's data
   files.
3. Docker provides built-in DNS-based service discovery only on
   user-defined networks (and Compose's project network), so containers
   resolve each other by `--name`/service name there but not on the default
   bridge. The caller should use the target's *container* port (the port
   the app listens on inside), not any host-published port.
4. `depends_on` alone only orders container *start* — it confirms the
   dependency's process began, not that the app inside is accepting
   connections. Closing the gap needs a `healthcheck:` on the dependency
   plus `depends_on: <svc>: condition: service_healthy` on the dependent
   service.
5. `localhost` inside a container is always that container's own loopback,
   so it never reaches another container — hence the failing `curl
   localhost`. Container-to-container traffic on a shared network goes
   directly to the other container by name and its internal port (8000),
   bypassing the host-side `-p` mapping entirely, so `curl http://<name>:8000`
   works.
6. Layers are additive and immutable: the earlier `RUN` layer that
   installed the tooling still ships it, and a later separate `RUN` that
   deletes files can't shrink that earlier layer — only install-and-clean
   within the *same* `RUN` avoids shipping it. A multi-stage build sidesteps
   this by doing the messy install in a builder stage and copying only the
   finished artifacts into a clean final stage, leaving the tooling behind
   entirely.
7. A compiled language needs a full toolchain (compiler, headers) to
   produce a binary that needs none of it at run time, so multi-stage
   discards the whole toolchain — a big win. An interpreted language still
   ships its interpreter and source to run in production, so separating
   build from runtime removes much less.
8. Compose derives the project name from the directory containing the
   Compose file by default and prefixes resource names (networks, volumes)
   with it. That prefixing keeps multiple projects' resources from
   colliding on one machine.
9. A BuildKit cache mount (`RUN --mount=type=cache,...`). Its contents
   persist across builds but are never committed into any image layer,
   whereas a normal layer's contents become a permanent part of the
   shipped image.
10. Named volumes (module 04) for storage that outlives containers; a
    user-defined bridge network with automatic name resolution (module 05);
    and multiple services started together and wired to both — all declared
    once in `compose.yaml` (module 06) and brought up in a single `docker
    compose up`, which internally does the `volume create`, `network
    create`, `build`, and `run` steps for you.

</details>

## Further reading & sources

- [Docker: Multi-stage builds](https://docs.docker.com/build/building/multi-stage/) - the authoritative guide to multiple `FROM` stages and `COPY --from`.
- [Docker: Building best practices (image size)](https://docs.docker.com/build/building/best-practices/) - official advice on minimizing layers and image size.
- [Docker: Cache mounts with RUN --mount=type=cache](https://docs.docker.com/build/cache/optimize/#use-cache-mounts) - how the BuildKit cache mount used in exercise 7 works.
- [GoogleContainerTools: distroless images](https://github.com/GoogleContainerTools/distroless) - the shell-free, package-manager-free base images referenced in the concepts.
- [Docker: BuildKit overview](https://docs.docker.com/build/buildkit/) - background on the modern build engine that parallelizes stages and enables cache mounts.

## Next

Continue to
[08-container-registries-dockerhub-and-acr](../08-container-registries-dockerhub-and-acr/README.md)
to learn how to share the (now leaner) images you build.
