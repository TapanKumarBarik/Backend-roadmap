# Setup: Docker Desktop on Windows 11 with WSL2

## Why this matters

Everything in this track runs through Docker Desktop's WSL2 backend — if
it's not set up correctly, every later exercise fails in confusing ways
(wrong `docker` binary, containers that can't see your files, or
containers that only half-work). Get this right once and you won't think
about it again.

## Concepts

### Docker needs a Linux kernel

Docker on Linux runs containers directly against the host's Linux kernel.
Windows doesn't have a Linux kernel, so Docker can't run natively on it.
That single fact explains the whole setup you're about to do: something
has to provide a Linux kernel for Docker to talk to.

### Docker Desktop supplies that kernel through WSL2

Docker Desktop solves the missing-kernel problem by running a real,
lightweight Linux virtual machine (managed by WSL2) and running the
Docker engine (the `dockerd` daemon) inside it. That VM is where your
containers actually execute.

> In Docker Desktop: the small whale icon in your Windows system tray
> shows the engine's state. When it's steady (not animating), the engine
> inside that VM is running. The Docker Desktop dashboard window is just
> a GUI client talking to that same engine.

### Your Ubuntu terminal is a client, not the engine

The WSL2 Ubuntu distro you used in the Linux track is separate from that
Docker VM. When you type `docker` inside Ubuntu, you're running a client
that talks to the daemon in the neighboring VM over a socket. Nothing
Docker-related is actually installed *in* Ubuntu; the CLI is injected and
pointed at the shared engine.

### One engine, many clients

Docker Desktop's WSL2 backend shares one single Docker engine across
every WSL2 distro you enable integration for, and with Windows itself.
Containers you start from Ubuntu and containers you start from PowerShell
are the same containers, visible in the same `docker ps` and in the same
Docker Desktop window.

> In Docker Desktop: the Containers tab lists every container regardless
> of which shell started it. Start something from Ubuntu and it appears
> in that list immediately — proof there's one engine, not one per shell.

### The filesystem boundary matters for speed

Files inside your Ubuntu home directory (`/home/you/...`) live on the
Linux side and are fast to bind-mount into containers. Files under
`/mnt/c/...` (your Windows `C:` drive seen from WSL2) cross a translation
boundary and are noticeably slower for heavy I/O. Keep project files in
your Linux home directory for anything performance-sensitive.

### Integration is per-distro; resources are global

WSL2 integration is a per-distro toggle: enabling it for "Ubuntu" injects
the `docker` CLI into that distro and points it at the shared engine.
Resource limits (CPU, memory, disk) apply to the whole Docker Desktop VM
and are set once in Docker Desktop's Settings, not per distro.

## Command reference

| Command | What it does | Example |
|---|---|---|
| `docker version` | Shows client and server (engine) version info; confirms the CLI can reach the daemon | `docker version` |
| `docker info` | Shows engine-wide details: storage driver, number of containers/images, resource limits | `docker info` |
| `docker run hello-world` | Pulls and runs a minimal test image that prints a confirmation message, then exits | `docker run hello-world` |
| `docker system df` | Shows disk space used by images, containers, volumes, and build cache | `docker system df` |
| `docker ps -a` | Lists all containers, running or stopped | `docker ps -a` |
| `wsl --list --verbose` | (PowerShell) Lists installed WSL distros and their WSL version | `wsl --list --verbose` |
| `wsl --status` | (PowerShell) Shows the default WSL distro and default WSL version | `wsl --status` |

Flag breakdown for the multi-part commands above:

- `docker ps -a`:
  - `docker ps` on its own lists only *running* containers.
  - `-a` (short for `--all`) adds stopped/exited containers to the list,
    so you can see things that already finished.
- `wsl --list --verbose`:
  - `--list` asks WSL to enumerate installed distros.
  - `--verbose` adds columns for each distro's state (Running/Stopped)
    and WSL version (1 or 2) — you want version `2`.

> In Docker Desktop: `docker system df` has a visual equivalent under the
> whale menu — open the dashboard, and the disk-usage breakdown for
> images, containers, volumes, and build cache appears (some versions put
> it behind a "Disk usage" or "Clean up" view). The Images tab is the GUI
> equivalent of `docker images`, and the Containers tab is the GUI
> equivalent of `docker ps -a`.

## Hands-on exercises

1. **(PowerShell)** Confirm WSL2 and your Ubuntu distro are present:
   ```powershell
   wsl --list --verbose
   ```
   Expect to see `Ubuntu` listed with `VERSION` = `2`. If it's missing,
   go finish the setup step in the Linux track's prerequisites
   (`wsl --install -d Ubuntu`) before continuing here.

2. **(Windows)** Install Docker Desktop from
   `https://www.docker.com/products/docker-desktop/` if it isn't already
   installed. During setup, accept the default "Use WSL 2 instead of
   Hyper-V" option when prompted (this is the default on Windows 11 and
   is what this whole track assumes).

3. **(Docker Desktop GUI)** Open Docker Desktop. Go to **Settings →
   General** and confirm **"Use the WSL 2 based engine"** is checked. Go
   to **Settings → Resources → WSL Integration** and enable the toggle
   next to **Ubuntu** (or whatever you named your distro). Click **Apply
   & Restart**. This is the one setup step that has no CLI equivalent —
   the integration toggle is what makes the CLI work at all in the next
   step.

4. **(WSL2 Ubuntu terminal)** Open your Ubuntu terminal and confirm the
   CLI is wired up:
   ```bash
   docker version
   ```
   Expect a `Client:` block and a `Server:` block both printing version
   numbers with no connection errors. If you only see the `Client:`
   block followed by a "Cannot connect to the Docker daemon" error, the
   WSL integration toggle from step 3 isn't applied yet, or Docker
   Desktop isn't running.

5. **(WSL2 Ubuntu terminal)** Run the classic test container:
   ```bash
   docker run hello-world
   ```
   Expect output that includes `Hello from Docker!` and a short
   explanation of the steps Docker just took (pulled the image, created
   a container from it, ran it, streamed its output, then it exited).

6. **(Docker Desktop GUI, then CLI)** Now find that same container in the
   GUI. Open Docker Desktop and click the **Containers** tab. You'll see
   one entry created from `hello-world` with an `Exited` status. Click
   into it and open its **Logs** sub-tab — you'll see the exact same
   `Hello from Docker!` text the terminal printed. Then cross-check from
   the CLI:
   ```bash
   docker ps -a
   docker logs $(docker ps -aq --filter ancestor=hello-world | head -n1)
   ```
   Expect the CLI to show the same container and the same logs. This is
   the point of the whole module: the GUI and the CLI are two views of
   one engine's state, not two separate systems.

7. **(Docker Desktop GUI)** Go to **Settings → Resources → Advanced** (on
   some versions this is just **Settings → Resources**) and note the CPU
   limit, memory limit, and disk image size sliders. Set memory to at
   least 4 GB if it's lower (containers you build later in this track are
   small, but comfortable headroom avoids confusing OOM-kills). Click
   **Apply & Restart** if you change anything.

8. **(WSL2 Ubuntu terminal)** Check where Docker thinks your project
   files should live, performance-wise. Run:
   ```bash
   pwd
   ```
   If it prints something starting with `/mnt/c/...`, you're working on
   the Windows filesystem from inside Linux — slower for Docker builds
   with lots of small files. Create a project home on the Linux side
   instead:
   ```bash
   mkdir -p ~/learn-docker
   cd ~/learn-docker
   pwd
   ```
   Expect a path like `/home/<you>/learn-docker` — use this as your
   working directory for hands-on exercises in later modules that build
   images from local files.

9. **(WSL2 Ubuntu terminal)** Clean up the test container so `docker ps
   -a` stays tidy going forward:
   ```bash
   docker rm $(docker ps -aq --filter ancestor=hello-world)
   ```
   Flag breakdown:
   - `docker ps -aq` lists all containers (`-a`) as bare IDs only (`-q`,
     for "quiet").
   - `--filter ancestor=hello-world` narrows that list to containers
     created from the `hello-world` image.
   - The `$( ... )` wrapper feeds those IDs to `docker rm`, which deletes
     them. Confirm they're gone with `docker ps -a`, or refresh the
     **Containers** tab in Docker Desktop and watch the entry disappear.

10. **Diagnose and fix.** In Docker Desktop, go to **Settings → Resources
    → WSL Integration** and turn the **Ubuntu** toggle **off**, then
    **Apply & Restart**. Back in your Ubuntu terminal, run:
    ```bash
    docker version
    ```
    Read the exact error (you'll get the `Client:` block, then a "Cannot
    connect to the Docker daemon" message — the client is fine, the
    engine is unreachable from this distro). Then re-enable the toggle,
    apply, and confirm `docker version` works again. This is the single
    most common "Docker suddenly stopped working" cause on Windows —
    knowing what the broken state looks like saves you a confused half
    hour later.

## Independent challenge

No commands given here — figure it out yourself using what you know from this module and earlier ones.

**Task:** The module claims there is one single Docker engine shared across every WSL2 distro and Windows itself, not a separate engine per shell. Prove it to yourself empirically without trusting the claim. Start a long-running container from one shell (your PowerShell prompt), then, from a *different* shell (your WSL2 Ubuntu terminal), confirm you can see that exact container, read the same status, and stop it from there — and confirm the change is reflected back in Docker Desktop's Containers tab. Lean on the shell fluency from the Linux track (running a background process and referring to it later by a stable name) to keep the container alive long enough to inspect it from the other side.

<details>
<summary>Stuck? One hint</summary>

Give the container a fixed `--name` and a command that keeps it alive (something that sleeps) when you start it detached in one shell, then list and stop it by that name from the other shell.

</details>

## Common mistakes & troubleshooting

- **"Cannot connect to the Docker daemon" in WSL2 but Docker Desktop
  looks "Running."** The per-distro WSL integration toggle is off, or
  Docker Desktop was restarted and the integration hasn't re-attached
  yet — reopen Docker Desktop **Settings → Resources → WSL Integration**
  and check the toggle.
- **Docker Desktop won't start, complains about virtualization.**
  Hardware virtualization (Intel VT-x/AMD-V) must be enabled in the
  BIOS/UEFI, and Windows features "Virtual Machine Platform" and
  "Windows Subsystem for Linux" must be enabled — `wsl --install` on a
  fresh machine normally handles this, but a re-imaged or corporate
  laptop sometimes has virtualization disabled at the firmware level.
- **Builds and file operations feel slow.** You're almost certainly
  working out of `/mnt/c/...`. Move the project into your Linux home
  directory (`~/...`).
- **Using both PowerShell's `docker` and WSL2's `docker` and getting
  confused about what's running.** They're the same engine, so
  `docker ps` gives identical results in both — if it doesn't, you have
  Docker installed twice (e.g. a stray non-Desktop Docker CLI in
  PowerShell) and should remove the duplicate.
- **`docker run hello-world` hangs on "Pulling from library/hello-world."**
  Usually a network/proxy issue — check Docker Desktop's **Settings →
  Resources → Proxies** if you're on a corporate network, or check your
  internet connection.

## Checkpoint quiz

Write down your answer to each question before expanding it — checking without attempting first is the single easiest way to fool yourself into thinking you've learned this.

<details>
<summary>Show questions</summary>

1. Where does the actual Docker engine (`dockerd`) run when you use
   Docker Desktop's WSL2 backend on Windows?
2. What does enabling "WSL Integration" for a specific distro actually
   do?
3. Why is a project stored under `/home/you/...` in WSL2 generally
   faster for Docker builds than one under `/mnt/c/...`?
4. If `docker run hello-world` in PowerShell works but the same command
   in your Ubuntu WSL2 terminal fails with a daemon connection error,
   what's the first thing to check?
5. What command shows both the Docker client version and the engine
   (server) version at once?
6. True or false: each WSL2 distro with integration enabled gets its own
   separate Docker engine and separate set of images/containers.
7. Which Docker Desktop tab shows the same containers `docker ps -a`
   lists, and where in that tab do you read a container's logs?

</details>

<details>
<summary>Show answers</summary>

1. Inside a lightweight Linux VM that Docker Desktop manages via WSL2 —
   not directly inside your Ubuntu distro, and not as a native Windows
   process.
2. It exposes the `docker` CLI inside that distro and points it at the
   shared Docker engine socket, so commands run from that distro's shell
   reach the same engine Docker Desktop manages.
3. `/mnt/c/...` paths cross the WSL2 filesystem translation boundary
   between Windows and Linux, which adds overhead per file operation;
   `/home/you/...` is native to the Linux VM's filesystem, so it's much
   faster for workloads that touch many files (like `docker build`
   copying a large context).
4. Whether Docker Desktop's WSL Integration toggle is enabled for that
   specific distro (Settings → Resources → WSL Integration), and whether
   Docker Desktop itself is running.
5. `docker version`.
6. False — all distros with integration enabled, plus Windows itself,
   share the same single Docker engine and the same containers/images.
7. The **Containers** tab. Click a container to open its detail view,
   then select the **Logs** sub-tab to read the same output `docker logs`
   would print.

</details>

## Next

Continue to
[01-containers-vs-vms-concepts](../01-containers-vs-vms-concepts/README.md)
to understand what a container actually is under the hood before you
start running them in anger.
