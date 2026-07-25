# Containers vs VMs: Concepts

## Why this matters

You're about to spend the rest of this track running containers without
a clear mental model of what one *is*, which leads to wrong intuitions
later (expecting a container to behave like a tiny VM, being surprised
when `kill 1` inside a container stops the whole thing). Fifteen minutes
of concepts now saves hours of confusion later.

## Concepts

### A container is a normal Linux process

There's no container-specific execution mode in the Linux kernel. When
Docker "starts a container," it starts an ordinary process — the same
kind of process you'd see in `ps` on any Linux box. What makes it a
"container" is that, before that process runs, the kernel is asked to
give it a restricted view of the system. Everything else in this module
builds on that one idea.

### Namespaces control what a process can see

A namespace limits what part of the system a process is allowed to
observe. Docker uses several:

- A **PID namespace** makes the container's first process appear as PID 1
  inside its own view, even though it has some large real PID on the
  host.
- A **mount namespace** gives it its own root filesystem view (built from
  image layers, module 02).
- A **network namespace** gives it its own loopback interface and routing
  table — which is why containers get their own IP, and why `localhost`
  inside a container does not mean "the host."

You already met this reasoning indirectly on the Linux track: a namespace
is just "this process sees a private version of X."

### Cgroups control what a process can use

Where namespaces limit what a process can *see*, **cgroups** (control
groups) limit what it can *use*: CPU shares, memory limits, and I/O
bandwidth. This is the same kind of resource-capping you did with
`ulimit`, `nice`, or `ionice` on the Linux track, except Docker applies
it per container on your behalf.

### A VM virtualizes hardware instead

A **virtual machine** works at a completely different layer: it
virtualizes hardware and boots a full, separate kernel on emulated (or
hardware-assisted virtual) CPU, memory, and disk. Two VMs on one host are
two fully independent operating systems that happen to share a physical
machine. Two containers on one host are two processes that happen to
share one kernel with different views of it.

### The apartment-building analogy

Think of a Linux host as an apartment building. VMs are like separate
buildings, each with its own foundation, plumbing, and electrical system
(own kernel) — completely isolated, but expensive and slow to construct.
Containers are like apartments in the *same* building, sharing the
foundation and utilities (one kernel), but each with its own locked door,
address, and utility meter (namespaces + cgroups) — much cheaper to
create, but fundamentally dependent on that one shared foundation being
sound.

### Consequences that follow directly

- Containers start in milliseconds (process creation + namespace setup)
  vs. seconds-to-minutes for a VM (full kernel boot).
- A container image is generally an order of magnitude smaller than a VM
  image, because it doesn't bundle a kernel.
- All containers on one Docker host share the *same kernel*. (Docker
  Desktop on Windows runs a real Linux kernel inside the WSL2 VM to make
  this work — which is why Windows containers are a wholly separate,
  rarer thing you won't touch here.)
- If a container's PID 1 exits, the container exits — there's no separate
  "OS" still running underneath it, unlike a VM.
- Isolation is real but shallower than a VM's: a shared kernel means a
  kernel-level vulnerability can potentially cross container boundaries in
  a way it can't cross VM boundaries. This is why module 09 (security)
  matters.

> In Docker Desktop: when you run the containers in this module's
> exercises, open the **Containers** tab to watch them appear and
> disappear. A short-lived container that exits immediately will flash in
> and out of the list; a `sleep 300` container stays `Running` until you
> stop it. That list is the GUI view of the same process states this
> module is describing.

## Command reference

| Command | What it does | Example |
|---|---|---|
| `docker run --rm -it <image> <cmd>` | Runs a container attached to your terminal, auto-removes it on exit | `docker run --rm -it ubuntu bash` |
| `ps aux` (inside container) | Lists processes as seen inside the container's PID namespace | `ps aux` |
| `hostname` (inside container) | Shows the container's hostname, which defaults to its container ID | `hostname` |
| `docker run --rm <image> sh -c "cmd1; cmd2"` | Runs multiple shell commands in one throwaway container | `docker run --rm alpine sh -c "cat /etc/os-release; uname -a"` |
| `uname -a` | Shows kernel version — identical between host and container, proving the shared kernel | `uname -a` |
| `docker stats` | Live view of each container's CPU/memory usage against its cgroup limits | `docker stats` |

Flag breakdown for `docker run --rm -it ubuntu bash`:

- `--rm` — automatically deletes the container when it exits, so you
  don't accumulate stopped containers for these throwaway experiments.
- `-i` — keeps STDIN open so you can type into the container.
- `-t` — allocates a pseudo-TTY so the shell behaves like a real
  terminal (prompt, line editing). `-it` is just those two combined, and
  it's the standard pair for "give me an interactive shell."
- `ubuntu` is the image; `bash` is the command to run instead of the
  image's default.

> In Docker Desktop: `docker stats` has a GUI equivalent — click a
> running container in the **Containers** tab and its detail view shows
> live CPU and memory usage against the cgroup limits, the same numbers
> `docker stats` streams in the terminal.

## Hands-on exercises

1. **(WSL2 Ubuntu terminal)** Compare kernels. Run on the host:
   ```bash
   uname -a
   ```
   Then run the same command inside a container:
   ```bash
   docker run --rm ubuntu uname -a
   ```
   Expect the kernel version (the `x.x.x-microsoft-standard-WSL2`
   part) to be **identical** in both outputs — proof the container isn't
   running its own kernel.

2. **(WSL2 Ubuntu terminal)** See the PID namespace in action. Start an
   interactive container:
   ```bash
   docker run --rm -it ubuntu bash
   ```
   Inside it, run:
   ```bash
   ps aux
   ```
   Expect to see only a couple of processes, with `bash` as **PID 1**.
   Type `exit` to leave.

3. **(WSL2 Ubuntu terminal)** Now look at the same container from the
   host's perspective. Start a long-running container:
   ```bash
   docker run --rm -d --name pidtest ubuntu sleep 300
   ```
   Flag breakdown: `-d` runs it detached (in the background) so your
   prompt returns; `--name pidtest` gives it a stable name to refer to;
   `sleep 300` is the command it runs. Now find its real PID on the host:
   ```bash
   docker inspect --format '{{.State.Pid}}' pidtest
   ```
   Expect a large PID number — nowhere near 1 — proving that "PID 1
   inside the container" is a namespace illusion, not a literal special
   process. Clean up: `docker rm -f pidtest`.

4. **(Docker Desktop GUI, then CLI)** Observe that PID 1 exiting kills
   the container, using the GUI to watch it happen. First start a
   container that exits on its own:
   ```bash
   docker run --name shortlived ubuntu bash -c "sleep 5 && exit 0"
   ```
   While it runs, open Docker Desktop's **Containers** tab and watch
   `shortlived`: it shows `Running` for about five seconds, then flips to
   `Exited (0)` on its own — no separate "OS" lingers once PID 1 (the
   `bash -c ...`) finishes. Cross-check from the CLI:
   ```bash
   docker ps -a --filter name=shortlived
   ```
   Expect the same `Exited (0)` status the GUI showed. Clean up:
   `docker rm shortlived`.

5. **(WSL2 Ubuntu terminal)** Explore network namespace isolation.
   Start two containers and check their IPs:
   ```bash
   docker run --rm alpine hostname -i
   docker run --rm alpine hostname -i
   ```
   Expect two **different** IP addresses (each container gets its own
   network namespace with its own interface), even though both ran the
   same image seconds apart.

6. **(WSL2 Ubuntu terminal)** Compare startup time to get a feel for
   "milliseconds vs. seconds/minutes." Time a container start:
   ```bash
   time docker run --rm alpine echo "hi"
   ```
   Expect the `real` time to be well under a second (after the image is
   already pulled — run it twice if the first run includes a pull).
   There is no equivalent "boot a VM in under a second" — that's the
   structural difference in practice, not just in theory.

7. **(WSL2 Ubuntu terminal)** See cgroup memory limits enforced. Run a
   memory-constrained container and read its limit from inside:
   ```bash
   docker run --rm -m 50m ubuntu bash -c "cat /sys/fs/cgroup/memory.max 2>/dev/null || cat /sys/fs/cgroup/memory/memory.limit_in_bytes"
   ```
   Flag breakdown: `-m 50m` sets a hard memory cap of 50 MB via a cgroup.
   Expect a number corresponding to roughly 50 MB (52428800 bytes) — the
   cgroup limit Docker set for you, readable from inside the container the
   same way you'd inspect any cgroup on a bare Linux box.

8. **(WSL2 Ubuntu terminal)** Watch live resource usage against limits.
   Start a container, then read its stats:
   ```bash
   docker run -d --name statstest -m 100m alpine sleep 300
   docker stats --no-stream statstest
   ```
   Flag breakdown: `--no-stream` prints a single snapshot and returns
   instead of continuously updating. Expect a `MEM USAGE / LIMIT` column
   showing usage against the `100MiB` limit you set. For the live version,
   click `statstest` in Docker Desktop's **Containers** tab and watch the
   same figures update in its detail view. Clean up:
   `docker rm -f statstest`.

9. **(WSL2 Ubuntu terminal)** Diagnose and fix: a "container that won't
   die." Start a container that ignores the normal stop signal:
   ```bash
   docker run -d --name stubborn ubuntu bash -c "trap '' TERM; sleep 600"
   docker stop -t 3 stubborn
   docker ps -a --filter name=stubborn
   ```
   Flag breakdown: `docker stop -t 3` sends `SIGTERM`, then waits 3
   seconds for a graceful exit before escalating to `SIGKILL`. Expect
   `docker stop` to wait ~3 seconds, fail to get a graceful exit (the
   trap ignores `SIGTERM`), and fall back to `SIGKILL` — the container
   ends up `Exited`. Notice the parallel to a Linux process ignoring
   `SIGTERM` and needing `SIGKILL` (`kill -9`) — same signal model,
   because a container process *is* a Linux process. Confirm cleanup:
   `docker rm stubborn`.

10. **(WSL2 Ubuntu terminal)** Contrast image size with VM-image size as
    a proxy for the structural difference. Compare:
    ```bash
    docker images ubuntu
    docker system df -v | head -n 20
    ```
    Note the `ubuntu` image size (tens of MB) — a comparable
    general-purpose VM image (an Ubuntu cloud `.vhd`/`.qcow2`) is
    typically several hundred MB to a few GB, because it must include a
    bootable kernel and full boot infrastructure a container image
    doesn't need. You can see the same image size in Docker Desktop's
    **Images** tab, in the `Size` column next to `ubuntu`.

## Common mistakes & troubleshooting

- **Expecting `docker exec` to "log into a machine."** It attaches a new
  process into an *existing* container's namespaces — closer to running
  a second command inside an already-running process's world than SSHing
  into a separate box.
- **Assuming a stopped container still uses CPU/memory.** It doesn't —
  once PID 1 exits, the container is fully stopped, same as any exited
  Linux process; only its filesystem layer and metadata remain on disk
  until removed.
- **Thinking containers are "lightweight VMs."** This mental model leads
  people to expect kernel-level isolation guarantees a container doesn't
  give — see module 09 for why running untrusted code in a container is
  not equivalent to running it in a VM.
- **Forgetting a container's `localhost` is its own**, not the host's.
  `curl localhost:8000` from inside a container will not reach a server
  running on your host at port 8000 — that requires networking (module
  05) or `host.docker.internal`.
- **Confusing image size with "how much RAM this will use."** Image size
  is disk footprint from layers (module 02); memory usage is runtime and
  controlled separately by cgroup limits.

## Checkpoint quiz

<details>
<summary>Show questions</summary>

1. What two Linux kernel features does Docker use to create the
   isolation a container has?
2. Why does a container's main process appear as PID 1 inside the
   container but have a completely different PID when viewed from the
   host?
3. What happens to a container when its PID 1 process exits, and why is
   this different from a VM?
4. Why do containers typically start in milliseconds while VMs take
   seconds or minutes?
5. Name one isolation guarantee a VM gives you that a container does
   not, and explain why (in terms of kernels).
6. If two containers run the exact same image, will they have the same
   IP address? Why or why not?
7. Where in Docker Desktop can you watch a container's live CPU/memory
   usage, and which CLI command shows the same thing?

</details>

<details>
<summary>Show answers</summary>

1. Namespaces (what the process can see: PID, mount, network, etc.) and
   cgroups (what the process can use: CPU, memory, I/O).
2. The PID namespace gives the container process its own numbering
   scheme starting from 1, but the kernel still tracks it with a real,
   host-wide PID underneath — the "PID 1" view is scoped to that
   namespace only.
3. The container stops entirely, because there's no separate kernel or
   OS still running underneath it — unlike a VM, where the guest OS and
   its other processes keep running even if one process inside it dies.
4. Starting a container is just creating a process with some namespace
   and cgroup setup (fast, kernel-native); starting a VM means booting
   an entire separate kernel and OS from scratch.
5. Kernel-level isolation: a VM has its own kernel, so a kernel exploit
   in the guest doesn't directly give access to the host kernel; all
   containers on a host share one kernel, so a severe enough kernel
   vulnerability can potentially be exploited across container
   boundaries.
6. No — each container gets its own network namespace and its own
   interface/IP assigned when it starts, regardless of which image it
   was created from.
7. Click the container in the **Containers** tab to open its detail view,
   which shows live CPU and memory; the CLI equivalent is `docker stats`
   (add `--no-stream` for a single snapshot).

</details>

## Next

Continue to
[02-images-and-containers](../02-images-and-containers/README.md) to
start actually working with images and the container lifecycle.
