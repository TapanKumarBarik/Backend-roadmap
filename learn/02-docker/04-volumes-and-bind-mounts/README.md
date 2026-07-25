# Volumes and Bind Mounts

## Why this matters

Module 02 showed that a container's writable layer disappears when you
`docker rm` it — fine for stateless apps, fatal for a database or any
app that needs to keep data, or for a dev workflow where you want to
edit code on your host and see it reflected instantly in a running
container. Volumes and bind mounts are how you attach storage that
outlives (or lives outside) any single container.

## Concepts

### Both mount something from outside the image

A bind mount and a named volume do the same fundamental thing: they mount
storage from *outside* the container's image layers to a path *inside*
it, exactly like `mount --bind` on a Linux host makes one directory
appear at another path. They differ in *what* is mounted and *who
manages it*.

### Bind mount: your host path, your responsibility

A **bind mount** mounts an existing path from your host filesystem
directly into the container. Docker doesn't manage this storage at all —
it's just your files, visible at a different path inside the container.
This is great for development: edit a file on the host and the container
sees the change immediately, because there's no copy step involved.

### Named volume: Docker's storage, Docker's responsibility

A **named volume** is a storage area Docker itself creates and manages.
On Docker Desktop's WSL2 backend it physically lives inside the Linux VM,
not somewhere you browse from Windows Explorer. Docker tracks it by name,
and it persists independently of any container's lifecycle — you can
`docker rm` every container that used it and the volume (and its data) is
still there. Best for data you want Docker to own and that you don't edit
from the host, like a database's data directory.

> In Docker Desktop: the **Volumes** tab lists every named volume, its
> size, and which containers use it — the GUI equivalent of `docker
> volume ls`. Click a volume to browse its contents and see the exact
> files inside, which is the easiest way to peek at managed storage you
> can't reach from your normal filesystem.

### Why not just use the writable layer?

Because the writable layer is deleted with the container (`docker rm`),
and it makes multiple containers unable to share state. A mounted volume
is what lets a database container's data survive a `docker rm` + fresh
`docker run`, or lets two containers share a directory.

### Permissions carry over from Linux

Files in a bind mount keep their host UID/GID, and the process inside the
container (running as some UID, often `root` unless a `USER` was set)
needs matching permission to read/write them — the same `ls -l` /
`chmod` / `chown` reasoning as on bare Linux. The twist: "the user inside
the container" and "the user on your host" are usually different UIDs
unless you deliberately align them.

### Anonymous volumes exist, but prefer named ones

An **anonymous volume** (a volume mount with no name) is Docker-managed
but hard to reference afterward — it shows up as a random hash. Useful in
some Dockerfile `VOLUME` declarations, but for anything you'll reuse,
prefer a named volume so you can find it later.

## Command reference

| Command | What it does | Example |
|---|---|---|
| `docker volume create <name>` | Creates a named volume | `docker volume create appdata` |
| `docker volume ls` | Lists volumes | `docker volume ls` |
| `docker volume inspect <name>` | Shows a volume's mountpoint and metadata | `docker volume inspect appdata` |
| `docker volume rm <name>` | Deletes a volume (fails if in use) | `docker volume rm appdata` |
| `docker volume prune` | Deletes all volumes not used by any container | `docker volume prune` |
| `docker run -v <name>:<path>` | Mounts a named volume at `<path>` | `docker run -v appdata:/data ...` |
| `docker run -v <hostpath>:<path>` | Bind-mounts a host path at `<path>` | `docker run -v "$(pwd)/app.py:/code/app.py" ...` |
| `docker run --mount type=volume,src=<name>,dst=<path>` | Same as `-v` for volumes, explicit syntax | `docker run --mount type=volume,src=appdata,dst=/data ...` |
| `docker run --mount type=bind,src=<hostpath>,dst=<path>,readonly` | Explicit bind mount, optionally read-only | `docker run --mount type=bind,src="$(pwd)",dst=/code,readonly ...` |
| `docker cp <container>:<path> <hostpath>` | Copies files between a container and the host without a mount | `docker cp web:/tmp/note.txt ./note.txt` |

Flag breakdown for the `--mount` forms:

- `--mount type=volume,src=appdata,dst=/data`:
  - `type=volume` — this is a Docker-managed named volume (not a host
    path).
  - `src=appdata` — the volume's name.
  - `dst=/data` — the path inside the container where it appears.
- `--mount type=bind,src="$(pwd)",dst=/code,readonly`:
  - `type=bind` — mount a host path directly.
  - `src="$(pwd)"` — the host path (here, the current directory).
  - `dst=/code` — where it appears in the container.
  - `readonly` — the container can read but never write the mount.

The `-v name:/path` shorthand does the same as the volume `--mount`;
`-v /host:/container` does the same as the bind `--mount`. `--mount` is
more verbose but clearer and required for some options `-v` can't express.

## Hands-on exercises

You'll create a tiny self-contained app in exercise 4; the earlier
exercises only need the `alpine` image. Nothing is downloaded.

1. **(WSL2 Ubuntu terminal)** Create and inspect a named volume:
   ```bash
   docker volume create appdata
   docker volume inspect appdata
   ```
   Expect JSON including a `Mountpoint` path inside the Docker Desktop VM
   — you can't browse it directly from `/mnt/c/...`; it's managed storage.

2. **(WSL2 Ubuntu terminal)** Prove data in a named volume outlives a
   container. Write a file into it via a throwaway container, then read it
   from a different one:
   ```bash
   docker run --rm -v appdata:/data alpine sh -c "echo 'persisted' > /data/note.txt"
   docker run --rm -v appdata:/data alpine cat /data/note.txt
   ```
   Expect `persisted` to print — a completely different container instance
   read what the first one wrote, because the volume (not the container)
   owns the data.

3. **(Docker Desktop GUI, then CLI)** Look at that volume in the GUI. Open
   the **Volumes** tab, click `appdata`, and browse its contents — you'll
   see `note.txt` with the text `persisted`. This is the GUI window into
   managed storage you otherwise can't reach. Cross-check from the CLI:
   ```bash
   docker run --rm -v appdata:/data alpine cat /data/note.txt
   ```
   Expect the same content the GUI showed — one volume, two views.

4. **(WSL2 Ubuntu terminal)** Set up a tiny app and bind-mount it for a
   live-edit dev loop. Create it inline:
   ```bash
   mkdir -p ~/learn-docker/volume-lab && cd ~/learn-docker/volume-lab

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

   docker build -t lab:v1 .
   docker run -d --name devmode -p 8010:8000 -v "$(pwd)/app.py:/code/app.py" lab:v1
   curl -s http://localhost:8010/health
   ```
   The `-v "$(pwd)/app.py:/code/app.py"` bind-mounts your host file over
   the one baked into the image. Now edit `app.py` on the host — change
   `"ok"` to `"ok-edited"` in the `/health` return — and, without
   rebuilding:
   ```bash
   docker restart devmode
   curl -s http://localhost:8010/health
   ```
   Expect `{"status":"ok-edited"}` — the bind mount made your host edit
   visible inside the container immediately; you only restarted the
   process, not rebuilt the image, because the code is live-mounted, not
   baked into a layer.

5. **(WSL2 Ubuntu terminal)** Revert your edit to `app.py` back to `"ok"`
   so any later reuse behaves normally, then clean up:
   `docker rm -f devmode`.

6. **(WSL2 Ubuntu terminal)** Compare `-v` shorthand and `--mount`
   explicit syntax doing the same thing:
   ```bash
   docker run --rm -v appdata:/data alpine ls /data
   docker run --rm --mount type=volume,src=appdata,dst=/data alpine ls /data
   ```
   Expect identical output (`note.txt` from exercise 2) from both.

7. **(WSL2 Ubuntu terminal)** Read-only bind mounts. Mount the lab
   directory read-only and try to write from inside:
   ```bash
   cd ~/learn-docker/volume-lab
   docker run --rm --mount type=bind,src="$(pwd)",dst=/code,readonly alpine sh -c "touch /code/newfile.txt"
   ```
   Expect a permission error (`Read-only file system`) — the container
   cannot write back to a mount you marked `readonly`, even though the
   underlying host directory is writable by you.

8. **Diagnose and fix: volume permission mismatch.** Simulate a common
   failure — a non-root container user writing into a root-owned volume:
   ```bash
   docker volume create permtest
   docker run --rm -v permtest:/data alpine chown 0:0 /data
   docker run --rm -v permtest:/data -u 1000:1000 alpine sh -c "touch /data/fail.txt"
   ```
   Flag note: `-u 1000:1000` runs the container process as UID 1000, GID
   1000 instead of root. Expect a `Permission denied` error — UID 1000
   can't write into a directory owned by UID 0 (root). Fix it by aligning
   ownership with the UID the container runs as:
   ```bash
   docker run --rm -v permtest:/data alpine chown 1000:1000 /data
   docker run --rm -v permtest:/data -u 1000:1000 alpine sh -c "touch /data/ok.txt && echo success"
   ```
   Expect `success` to print — same reasoning as fixing a bare-Linux
   "permission denied" with `chown`.

9. **(WSL2 Ubuntu terminal)** List and prune unused volumes:
   ```bash
   docker volume ls
   docker volume rm permtest
   docker volume prune -f
   docker volume ls
   ```
   Flag note: `prune -f` skips the confirmation prompt. Expect `permtest`
   gone immediately, and `prune` to remove any other volumes not
   referenced by an existing container. You can also delete a volume from
   the **Volumes** tab in Docker Desktop and confirm `docker volume ls`
   agrees.

10. **(WSL2 Ubuntu terminal)** Full cleanup for this module:
    ```bash
    docker rm -f $(docker ps -aq) 2>/dev/null
    docker volume rm appdata 2>/dev/null
    docker volume ls
    ```
    Expect no leftover containers, and `appdata`/`permtest` gone from
    `docker volume ls`.

## Common mistakes & troubleshooting

- **Using a bind mount for a database's data directory.** Works, but
  host-side permission/ownership quirks (especially crossing the
  WSL2/Windows boundary) cause more grief than a named volume, which
  Docker manages consistently. Prefer named volumes for anything Docker
  fully owns; prefer bind mounts for things you edit from the host.
- **Forgetting that `-v hostpath:containerpath` will *create* an empty
  directory at `hostpath` if it doesn't exist**, silently masking a typo
  rather than erroring — always double-check the host path exists.
- **Expecting a rebuild to be necessary after a bind-mounted code
  change.** For interpreted languages served by a restartable process (or
  one that auto-reloads), a mount means you often only restart the
  process, not rebuild the image — but this doesn't apply to compiled
  languages or anything baked in at build time.
- **Permission-denied errors writing into a named volume from a non-root
  container user.** The volume's ownership doesn't automatically match
  your container's UID — fix with `chown` from a throwaway root container
  (exercise 8), or initialize ownership in your Dockerfile/entrypoint.
- **Trying to browse a named volume from Windows Explorer.** It lives
  inside the Docker Desktop WSL2 VM — use the **Volumes** tab in Docker
  Desktop, a throwaway container (`docker run --rm -v name:/data alpine ls
  /data`), or `docker cp` to inspect it.
- **Confusing `docker volume prune` with a general cleanup.** It only
  removes volumes with zero containers referencing them (including
  stopped ones).

## Checkpoint quiz

<details>
<summary>Show questions</summary>

1. What's the core difference between a bind mount and a named volume,
   in terms of who manages the storage?
2. Why would you choose a bind mount for application source code during
   development, but a named volume for a database's data files?
3. If you `docker rm` every container that references a named volume,
   is the volume's data gone? What if the data only ever lived in a
   container's writable layer?
4. Why did the permission-denied error happen in exercise 8, and how is
   it conceptually the same problem you'd hit with `chmod`/`chown` on
   plain Linux files?
5. Does `-v /host/path:/container/path` fail if `/host/path` doesn't
   exist yet, or does something else happen?
6. What does mounting with `readonly` (or `:ro` in the `-v` shorthand)
   change about a container's ability to modify the mounted path?
7. Where in Docker Desktop can you browse the actual files inside a named
   volume, and why is that useful?

</details>

<details>
<summary>Show answers</summary>

1. A bind mount points at an existing host path that you (not Docker)
   manage directly; a named volume is storage that Docker itself creates,
   names, and manages, independent of any host directory you browse.
2. Source code needs to be edited live from the host and seen instantly
   inside the container, which is exactly what a bind mount gives you with
   no copy step; a database's data directory doesn't need host editing and
   benefits from Docker managing ownership/location consistently, which a
   named volume provides.
3. The named volume's data survives — volumes are independent of container
   lifecycle. Data that only existed in a container's writable layer is
   permanently gone once that container is removed.
4. UID 1000 didn't have write permission on a directory owned by UID 0
   (root) — identical to a bare-Linux "permission denied" writing into a
   root-owned directory as a non-root user; the fix is the same
   `chown`/permission adjustment either way.
5. Docker silently creates an empty directory at the host path if it
   doesn't already exist, rather than failing — which can mask a typo'd
   path as an apparently-working but empty mount.
6. The container can still read the mounted path, but any write (create,
   modify, delete) fails with a read-only filesystem error, regardless of
   the underlying host files' permissions.
7. The **Volumes** tab — click a volume to browse its files. It's useful
   because managed volumes live inside the Docker Desktop VM and aren't
   reachable from your normal Windows/WSL2 filesystem.

</details>

## Next

Continue to [05-docker-networking](../05-docker-networking/README.md) to
connect containers to each other and to the outside world.
