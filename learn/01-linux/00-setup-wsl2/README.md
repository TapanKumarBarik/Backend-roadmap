# Setting Up WSL2 and Ubuntu

## Why this matters

Before learning Linux commands, you need a Linux environment. If you're on Windows, **WSL2 + Ubuntu** gives you a real Linux development environment on your own machine, without dual-booting or babysitting a traditional VM. But this module is not just `wsl --install` followed by "congratulations, you're done." You should understand *what* you installed, *why* it exists, *where* your files actually live, *how* Windows and Linux talk to each other, and *how* to verify all of that for yourself — because that mental model is exactly what saves you from confusion later, when this same roadmap reaches processes, permissions, networking, SSH, systemd, Docker, and Kubernetes. Every one of those topics assumes you already know what's actually running underneath your terminal.

## Concepts

**Why not dual-boot or a full VM?** Before WSL, Windows developers wanting Linux had two main options. Dual-boot installs both operating systems and makes you choose one at startup — great isolation, but rebooting your whole computer just to run one shell command is a poor way to work. A traditional virtual machine runs Linux alongside Windows without rebooting, but you're now also responsible for managing its virtual disk, RAM/CPU allocation, and networking as a separate machine. WSL's goal is simpler: a real Linux environment, running directly alongside Windows, without either of those costs.

**WSL1 vs. WSL2 — the difference that matters.** WSL1 did not use a real Linux kernel. It translated Linux system calls into Windows kernel calls on the fly:

```
 WSL1
 ─────────────────────────────
 Linux application
        │
        ▼
 Linux system calls
        │
        ▼
 Translation/compatibility layer
        │
        ▼
 Windows kernel
```

This worked for a lot of software, but Windows and Linux don't behave identically at the kernel level, so some Linux behavior was difficult or impossible to reproduce exactly. WSL2 changes the architecture: it runs a real Linux kernel inside a small, managed virtual machine, with Ubuntu's actual userspace running on top of that real kernel:

```
 WSL2
 ─────────────────────────────
 Linux application
        │
        ▼
 Linux userspace (Ubuntu)
        │
        ▼
 Real Linux kernel
        │
        ▼
 WSL2 managed VM
        │
        ▼
 Windows
```

Because it's a genuine Linux kernel rather than a translation layer, WSL2 gets full system-call compatibility — the same behavior a real Linux server would give you. This is why the rest of this track assumes WSL2, not WSL1.

**The full stack, one command at a time.** Every command you type flows through all of these layers:

```
 Windows
   │
   ▼
 WSL  (the Windows feature/platform)
   │
   ▼
 WSL2  (the architecture: real kernel in a managed VM)
   │
   ▼
 Linux kernel
   │
   ▼
 Ubuntu  (a Linux distribution running on that kernel)
   │
   ▼
 Bash  (the shell you type into)
   │
   ▼
 Your command
```

**WSL2 is not Ubuntu.** This is one of the most common beginner mix-ups. WSL is the Windows platform that hosts Linux environments. WSL2 is its modern architecture (real kernel, managed VM). Linux is the kernel itself. Ubuntu is a *distribution* — a specific packaging of the Linux kernel plus a userspace, package manager, and default tools. Bash is just the shell you use to talk to all of it. Keeping these apart matters in practice: a Linux kernel problem, an Ubuntu package problem, a Bash problem, and a WSL configuration problem are four different kinds of failure with four different fixes, and conflating them is how beginners end up randomly changing unrelated settings.

**Command context: PowerShell vs. Ubuntu.** After setup you have two shells, and *which one* a command runs in matters:

```
 PowerShell (Windows side)          Ubuntu (Linux side)
 ──────────────────────────         ──────────────────────────
 wsl --list --verbose               pwd
 wsl --shutdown                     whoami
 wsl --update                       sudo apt update
 wsl -d Ubuntu                      cat /etc/os-release
```

`wsl ...` commands manage the WSL platform itself and are run from PowerShell. Everything else — `pwd`, `whoami`, `sudo apt update`, and every other Linux command this whole track teaches — is run *inside* Ubuntu, after you've entered it.

**Windows and Linux as two integrated but separate environments.** Once WSL2 is running, you have two environments talking to each other, not one merged system:

```
 ┌────────────────────────┐        ┌────────────────────────┐
 │        Windows         │        │        WSL2 / Ubuntu   │
 │  PowerShell             │◄──────►│  Bash                  │
 │  Windows apps           │        │  Linux filesystem      │
 │  C:\                    │        │  Linux applications    │
 └────────────────────────┘        └────────────────────────┘
```

**Filesystem integration — and where your projects should actually live.** Your Windows drives are exposed inside WSL: `C:\` is generally reachable as `/mnt/c`, so `C:\Users\you\Projects` becomes `/mnt/c/Users/you/Projects` from inside Ubuntu. That link is genuinely useful, but don't treat it as performance-neutral. WSL2 performs best when Linux tools operate on files that live in the *Linux* filesystem, not on files mounted in from Windows through `/mnt/c`. In practice: keep Linux-heavy project work under your Linux home directory —

```bash
mkdir -p ~/projects
cd ~/projects
```

— i.e. under `/home/<you>/projects`, rather than under `/mnt/c/Users/...`. You can still open a Linux directory in Windows Explorer any time with `explorer.exe .`, and Windows can browse into your Linux files through the filesystem integration Windows exposes — the two sides can see each other either way; the `/mnt/c` guidance is specifically about where compilers, build tools, and package managers should be *running against* files for good performance.

**First launch: your Linux user is not your Windows user.** The first time you open Ubuntu, it finishes initializing and asks you to create a Linux user (e.g. `Enter new UNIX username:`) and a password. This is a completely separate identity from your Windows account — your own home directory, permissions, groups, and shell, unrelated to whatever your Windows username is. Modules 03 and 04 cover what that identity actually controls.

One gotcha worth knowing before you hit it: when you type your password at that prompt, *nothing appears on screen* — no characters, no dots, no asterisks. That's normal Linux terminal behavior for password entry, not a frozen terminal. Type the password and press Enter.

**`apt update` vs. `apt upgrade`.** Inside Ubuntu, keeping packages current is two separate steps:

```
 sudo apt update
      │
      ▼
 refreshes the LOCAL CATALOG of what's available in the repositories
 (downloads no software, upgrades nothing by itself)

 sudo apt upgrade
      │
      ▼
 actually installs available upgrades for packages you have installed
```

Run `update` before `upgrade` — upgrading against a stale catalog is a common source of confusing "why didn't that update?" moments.

## Command reference

| Command | What it does |
|---|---|
| `wsl --status` | Shows whether WSL is installed and its default settings. |
| `wsl --list --verbose` (or `wsl -l -v`) | Lists installed distributions, whether each is running/stopped, and its WSL version (1 or 2). |
| `wsl --list --online` | Lists distributions available to install (e.g. Ubuntu, Debian). |
| `wsl --install` | Installs WSL, enables required Windows features, and installs the default distribution (Ubuntu) in one step. |
| `wsl --install -d Ubuntu` | Installs a specific named distribution explicitly. |
| `wsl --install --web-download -d Ubuntu` | Same, but downloads via the web — useful if a plain install hangs at `0.0%`. |
| `wsl` / `wsl -d Ubuntu` | Starts the default distribution, or a named one. |
| `wsl --list --running` | Lists only the distributions currently running. |
| `wsl --terminate <name>` | Stops one specific distribution (e.g. `wsl --terminate Ubuntu`). |
| `wsl --shutdown` | Shuts down the entire WSL2 VM (all distributions). Does not uninstall or delete anything. |
| `wsl --update` | Updates the WSL platform itself. |
| `wsl --set-version <name> <1\|2>` | Converts a distribution between WSL1 and WSL2. |
| `wsl --version` / `wsl --help` | Shows version info / command help. |
| `sudo apt update` | Refreshes the local package catalog (Ubuntu). |
| `sudo apt upgrade` | Installs available upgrades for already-installed packages (Ubuntu). |
| `explorer.exe .` | Opens the current Linux directory in Windows File Explorer (Ubuntu). |
| `whoami` / `pwd` | Prints your Linux username / current directory (Ubuntu). |
| `cat /etc/os-release` | Prints which Linux distribution and version you're running (Ubuntu). |
| `uname -r` | Prints the running Linux kernel version (Ubuntu). |

## Hands-on exercises

1. **Check what already exists before installing anything.** From **PowerShell as Administrator**, run `wsl --status` and `wsl --list --verbose`. If Ubuntu already shows up as `VERSION 2`, you likely don't need to install anything — skip to exercise 3.

2. **Install WSL2 + Ubuntu.** Run `wsl --install`. If Windows asks you to restart, restart. If running `wsl --install` just prints the help screen instead of installing, WSL is likely already present — run `wsl --list --online` then `wsl --install -d Ubuntu` explicitly instead. If installation hangs at `0.0%`, try `wsl --install --web-download -d Ubuntu`.

3. **Complete first launch.** Open Ubuntu (Start menu, or `wsl` / `wsl -d Ubuntu` from PowerShell). Create your Linux username and password when prompted — remember, nothing will appear on screen as you type the password, and that's expected.

4. **Verify your Linux identity from inside Ubuntu.** Run `whoami` (expect your chosen username), `pwd` (expect `/home/<username>`), `cat /etc/os-release` (expect Ubuntu identifying information), and `uname -r` (expect a kernel version string).

5. **Verify from the Windows side.** Run `exit` to leave Ubuntu, then from PowerShell run `wsl --list --verbose` again and confirm your distribution now shows `VERSION 2` and a running/stopped state that matches what you did.

6. **Prove the filesystem integration.** Inside Ubuntu: `mkdir -p ~/projects/wsl-demo && cd ~/projects/wsl-demo && echo "Hello from Linux" > index.html`. Then run `explorer.exe .` and confirm `index.html` is visible and openable from Windows File Explorer.

7. **Run a real web server across both environments.** Still in `~/projects/wsl-demo`, run `python3 -m http.server 8000`. From a Windows browser, visit `http://localhost:8000` and confirm you see your file. Stop the server with `Ctrl+C`. You've just had a Linux process serve HTTP to a Windows client — the same shape as a real backend, in miniature.

8. **Update your packages and explain the difference.** Run `sudo apt update` followed by `sudo apt upgrade`. In your own words (not copied from this module), explain what each one actually did.

9. **Break something on purpose.** Run a deliberately misspelled command, e.g. `sduo apt update`. Confirm it errors, then immediately run `echo $?` and confirm you get a non-zero exit status. You don't need to know what the exact number means yet — module 09 covers exit codes properly — just confirm that commands report success/failure this way.

## Independent challenge

A teammate says their project at `/mnt/c/Users/them/project` "feels slow" — builds and Linux tool invocations take noticeably longer than they expect. No commands are given here. Using only what this module covered about `/mnt/c` and Linux filesystem integration, diagnose *why* that's happening, describe how you'd move the project to fix it, and say how you'd personally verify — using commands of your own choosing — that the move actually worked and that Linux tools are now operating on the Linux filesystem rather than the Windows-mounted one.

<details>
<summary>Stuck? One hint</summary>

You don't need a new command to prove this — `pwd` after `cd`-ing into the new location, compared against the old `/mnt/c/...` path, is enough to verify where a tool is actually running.

</details>

## Common mistakes & troubleshooting

- **`wsl` is not recognized.** Usually means WSL isn't installed yet, or Windows needs updating. Run `wsl --help`; if that fails outright, check your Windows version before anything else.
- **Installation asks for a restart.** Restart — WSL2 depends on Windows virtualization features that only fully activate after a reboot. Then confirm with `wsl --status`.
- **`wsl --install` just prints help text.** WSL is likely already partially installed. Use `wsl --list --online` to see available distributions, then `wsl --install -d Ubuntu` explicitly.
- **A distribution shows WSL version `1` instead of `2`.** Convert it: `wsl --set-version Ubuntu 2`, then re-check with `wsl --list --verbose`.
- **Installation hangs at `0.0%`.** Try `wsl --install --web-download -d Ubuntu`.
- **Virtualization error / WSL2 won't start.** WSL2 requires hardware virtualization enabled in UEFI/BIOS (shows up as something like "Intel VT-x," "Intel Virtualization Technology," "AMD-V," or "SVM Mode" depending on manufacturer). Don't change unrelated BIOS settings while you're in there.
- **WSL behaves strangely after working fine before.** Try `wsl --update`, then `wsl --shutdown`, then start Ubuntu again fresh.
- **Password doesn't appear while typing at first launch.** Expected behavior, not a frozen terminal — type it blind and press Enter.
- **Confusing `wsl --terminate <name>` with `wsl --shutdown`.** `--terminate` stops one distribution; `--shutdown` stops the entire WSL2 VM (all distributions at once). Neither one deletes anything.
- **`sudo apt update` fails.** Inspect the actual error first — is it DNS, network connectivity, repository availability, or permissions? Don't start changing DNS settings or deleting files before you've identified which of those it actually is; module 10 covers networking properly.
- **Treating WSL2 as identical to a production Linux server.** It isn't — WSL2 has Windows integration (`/mnt/c`, `localhost` sharing, a Windows-managed lifecycle) that a real cloud Linux server won't have. WSL is your development laboratory; later modules cover how a real server differs.

**A useful recovery sequence, in general:** stop → read the actual error message → identify which layer it's in (WSL platform? Linux kernel/virtualization? Ubuntu packages? your own command?) → check current state with `wsl --list --verbose` or the equivalent → make one change → test again. This beats guessing and running unrelated fixes from a search result.

## Checkpoint quiz

1. What is the core architectural difference between WSL1 and WSL2, and why does it matter?
2. Which single command shows every installed distribution along with its WSL version?
3. What's the difference between `wsl --terminate Ubuntu` and `wsl --shutdown`? Does either one delete your distribution or files?
4. Where does `/mnt/c` point to, and why is it generally *not* the preferred place to keep files for Linux-heavy development?
5. You create your Linux user at first launch, type your password, and see absolutely nothing appear on screen. Is something broken? What should you do?

<details>
<summary>Show answers</summary>

1. WSL1 translates Linux system calls to Windows kernel calls through a compatibility layer; WSL2 runs a real Linux kernel inside a lightweight managed VM. This matters because Windows and Linux don't behave identically at the kernel level, so WSL1 couldn't perfectly reproduce every bit of Linux behavior — WSL2's real kernel gives genuine system-call compatibility instead.
2. `wsl --list --verbose` (equivalently `wsl -l -v`).
3. `wsl --terminate <name>` stops one specific distribution; `wsl --shutdown` stops the entire WSL2 VM, affecting every distribution at once. Neither deletes anything — your distribution and files persist and simply aren't running until you start them again.
4. `/mnt/c` points to your Windows `C:\` drive, exposed inside the Linux filesystem. It's not preferred for Linux-heavy project files because WSL2 performs best when Linux tools operate on files that actually live in the Linux filesystem (e.g. under `/home/<user>/...`) rather than on files mounted in from Windows.
5. Nothing is broken. Linux terminals intentionally show no characters, dots, or asterisks while you type a password — this is standard behavior, not a frozen session. Type the password blind and press Enter.

</details>

## Further reading & sources

- [Install WSL — Microsoft Learn](https://learn.microsoft.com/en-us/windows/wsl/install) - the official, current installation instructions this module's install steps are based on; the authoritative source if a command's exact behavior changes in a future Windows update.
- [Basic commands for WSL — Microsoft Learn](https://learn.microsoft.com/en-us/windows/wsl/basic-commands) - the full reference for every `wsl ...` flag this module's command table only summarizes.
- [Comparing WSL 1 and WSL 2 — Microsoft Learn](https://learn.microsoft.com/en-us/windows/wsl/compare-versions) - Microsoft's own explanation of the real-kernel-vs-translation-layer architecture difference this module's diagrams are based on.
- [File systems: Windows and Linux working together — Microsoft Learn](https://learn.microsoft.com/en-us/windows/wsl/filesystems) - the official source for the `/mnt/c` performance guidance and where to keep project files.
- [Troubleshooting Windows Subsystem for Linux — Microsoft Learn](https://learn.microsoft.com/en-us/windows/wsl/troubleshooting) - covers virtualization/BIOS issues, stuck installs, and other failures beyond this module's own troubleshooting list.
- [Ubuntu on WSL documentation](https://documentation.ubuntu.com/wsl/) - Ubuntu's own guide to running and maintaining Ubuntu specifically inside WSL.

## Next

Continue to [01-shell-basics-and-philosophy](../01-shell-basics-and-philosophy/README.md) to learn what the shell actually is, how a command is structured, and the Unix philosophy behind the tools you'll use for the rest of this track.
