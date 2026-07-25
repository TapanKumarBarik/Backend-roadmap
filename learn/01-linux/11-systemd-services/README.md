# systemd and Services

## Why this matters

Every long-running background process on a modern Linux server - web servers, databases, container runtimes, your future Kubernetes node agents - is managed by systemd. Knowing how to start, stop, enable, and inspect a service (and how to write a minimal one yourself) is a baseline skill you'll lean on constantly, including later when Docker's engine itself runs as a systemd service. WSL2 also has a specific quirk here: systemd support had to be explicitly added and isn't always on by default, so you need to know how to check for it and turn it on.

## Concepts

**An init system is the first process that starts everything else.** When Linux boots, the kernel starts exactly one process (PID 1), and that process is responsible for starting and supervising every other background service on the machine. Nearly all modern Linux distributions, including Ubuntu, use systemd as this init system.

**systemd manages "units."** A unit is systemd's basic concept of "a thing to manage" - most commonly a `.service` unit (a background program), but there are other unit types too (timers, mount points, sockets). In this module we focus entirely on `.service` units, since that's what you'll interact with constantly.

**Services can be running, stopped, enabled, or disabled - these are independent.** "Running" means the process is active right now. "Enabled" means systemd will automatically start it at boot. A service can be running but not enabled (it'll start now but not survive a reboot), or enabled but not currently running (it'll start at the next boot but isn't active right now). Understanding this distinction prevents a lot of confusion.

**A service file describes how to run and supervise a program.** It's a plain text file with sections in square brackets. `[Unit]` holds metadata and ordering info (like "start after the network is up"). `[Service]` describes how to actually run it - the command to execute (`ExecStart`), and what to do if it crashes (`Restart=`). `[Install]` describes how the service hooks into the boot process, primarily via `WantedBy=`, which says which "target" (a grouping of units, roughly analogous to a traditional runlevel) should pull this service in when enabled.

**Custom unit files live in a specific, well-known location.** System-defined services shipped by packages typically live in `/lib/systemd/system/` or `/usr/lib/systemd/system/`. Your own custom unit files belong in `/etc/systemd/system/` - this is the standard, expected place for administrator-created services, and it takes precedence over the package-provided locations if names collide.

**systemd needs to be told when unit files change.** Because systemd reads unit files once and keeps them in memory, editing or adding a `.service` file doesn't take effect until you tell systemd to reload its configuration from disk.

**Logs are systemd's business too, briefly.** Every service managed by systemd has its output captured by journald, systemd's logging component, and you can view a specific service's log with `journalctl -u <service-name>`. Full coverage of journald and logging in general is module 14 - for now, just know this command exists as your window into "why did my service just fail."

**WSL2 does not run systemd by default in all configurations, and older WSL2 didn't support it at all.** Historically, WSL2 used a stripped-down, non-systemd init process, meaning `systemctl` and unit files simply didn't work. Modern WSL2 (recent Ubuntu images, current Windows 11 builds) *can* run real systemd as PID 1, but it must be explicitly turned on via a setting in `/etc/wsl.conf`, followed by a full WSL restart (not just closing the terminal window) for it to take effect.

## Command reference

| Command | What it does | Example |
|---|---|---|
| `systemctl status` | Shows overall system state, or a specific unit's state if given a name. | `systemctl status ssh` - shows whether the `ssh` service is active/running, its recent log lines, and its process ID. |
| `systemctl start name` | Starts a service right now (does not affect boot behavior). | `sudo systemctl start myscript.service` - starts the service immediately. |
| `systemctl stop name` | Stops a running service right now. | `sudo systemctl stop myscript.service` - stops it immediately. |
| `systemctl restart name` | Stops then starts a service in one step - useful after changing its configuration or the program it runs. | `sudo systemctl restart myscript.service`. |
| `systemctl enable name` | Configures the service to start automatically at boot (does not start it now unless combined with `--now`). | `sudo systemctl enable myscript.service` - it will now start on the next boot. |
| `systemctl disable name` | Removes the service from automatic boot startup (does not stop it if it's currently running). | `sudo systemctl disable myscript.service`. |
| `systemctl enable --now name` | Enables the service for boot AND starts it immediately, in one command. | `sudo systemctl enable --now myscript.service`. |
| `systemctl daemon-reload` | Tells systemd to re-read unit files from disk after you've added or edited one. | `sudo systemctl daemon-reload` - run this after creating/editing a file in `/etc/systemd/system/`. |
| `journalctl -u name` | Shows the log output captured for a specific unit. | `journalctl -u myscript.service` - shows everything the service has printed to stdout/stderr since it started being tracked. Full journalctl usage is covered in module 14. |
| `ps -p 1` | Shows the process running as PID 1 - the init system. | `ps -p 1` - if the `CMD` column shows `/sbin/init` or `systemd`, systemd is running as PID 1; if it shows something else (e.g. an entrypoint script), systemd is not active. |

## Hands-on exercises

1. Open your WSL2 Ubuntu terminal. Check whether systemd is currently running as PID 1: run `ps -p 1`. Look at the `CMD` column in the output.

2. Cross-check with `systemctl status`. Run `systemctl status`. If systemd is active, you'll see a system overview (state "running", a tree of units). If systemd is not active, you'll get an error like "System has not been booted with systemd as init system."

3. If systemd is NOT active (either check in steps 1-2 indicated it's off), enable it. Check whether `/etc/wsl.conf` exists and what it contains: run `cat /etc/wsl.conf` (it's fine if the file doesn't exist or is empty/missing the `[boot]` section).

4. Add the systemd boot setting. Open the file with a text editor (e.g. `sudo nano /etc/wsl.conf`) and ensure it contains:
   ```
   [boot]
   systemd=true
   ```
   If the file already has other sections, add `[boot]` and `systemd=true` as a new section rather than replacing existing content. Save and exit.

5. Apply the change. This setting only takes effect on a fresh WSL2 VM boot, not just a new terminal - so from a Windows PowerShell or Command Prompt window (not inside WSL2), run `wsl --shutdown`. Wait a few seconds, then reopen your Ubuntu terminal (this starts a fresh WSL2 instance). Re-run `ps -p 1` and confirm the `CMD` column now shows systemd (or `/sbin/init` pointing to it).

6. Confirm systemd is fully operational: run `systemctl status`. Expect to see `State: running` and a tree of active units, rather than the earlier error.

7. Write a small script for a custom service to manage, reusing skills from module 09. Create the script:
   ```
   mkdir -p ~/scripts
   cat > ~/scripts/heartbeat.sh << 'EOF'
   #!/bin/bash
   while true; do
     echo "$(date +%T) heartbeat alive"
     sleep 5
   done
   EOF
   chmod +x ~/scripts/heartbeat.sh
   ```
   Test it briefly by running `~/scripts/heartbeat.sh` directly and watching a few lines print every 5 seconds, then stop it with Ctrl+C.

8. Create a custom systemd service file for it. Custom unit files belong in `/etc/systemd/system/`, so run `sudo nano /etc/systemd/system/heartbeat.service` and enter:
   ```
   [Unit]
   Description=Heartbeat test service

   [Service]
   ExecStart=/home/YOUR_USERNAME/scripts/heartbeat.sh
   Restart=on-failure

   [Install]
   WantedBy=multi-user.target
   ```
   Replace `YOUR_USERNAME` with your actual Linux username (check with `whoami` if unsure) - `ExecStart` needs an absolute path, not `~`. Save and exit.

9. Load and start the new service. Run:
   ```
   sudo systemctl daemon-reload
   sudo systemctl start heartbeat.service
   systemctl status heartbeat.service
   ```
   Confirm the status shows `Active: active (running)`. Then check its captured output: `journalctl -u heartbeat.service` and confirm you see the "heartbeat alive" lines with timestamps.

10. Test enabling at boot versus running now - these are independent, as covered in the concepts section. Run `systemctl is-enabled heartbeat.service` (expect `disabled`, since you only started it, not enabled it, in step 9). Then run `sudo systemctl enable heartbeat.service` and run `systemctl is-enabled heartbeat.service` again (expect `enabled`). Note that the service was already running before you enabled it - these two properties are independent.

11. Stop the service and confirm state changes correctly: `sudo systemctl stop heartbeat.service`, then `systemctl status heartbeat.service` and confirm it now shows `Active: inactive (dead)`, while `systemctl is-enabled heartbeat.service` still reports `enabled` - proving stop/start and enable/disable are separate axes.

12. Break something on purpose to practice reading systemd errors. Edit `/etc/systemd/system/heartbeat.service` and intentionally introduce a typo in the path, e.g. change `ExecStart` to point at `/home/YOUR_USERNAME/scripts/heartbeatXYZ.sh` (a file that doesn't exist). Run `sudo systemctl daemon-reload` then `sudo systemctl restart heartbeat.service`. Run `systemctl status heartbeat.service` and read the error - it should indicate the service failed to start, often mentioning "status=203/EXEC" or similar, meaning the executable couldn't be found/run. Check `journalctl -u heartbeat.service` for more detail. Fix the typo, run `sudo systemctl daemon-reload` and `sudo systemctl restart heartbeat.service` again, and confirm it returns to `active (running)`.

13. Clean up (optional but good practice): `sudo systemctl stop heartbeat.service`, `sudo systemctl disable heartbeat.service`, then remove the file with `sudo rm /etc/systemd/system/heartbeat.service` and run `sudo systemctl daemon-reload` once more so systemd forgets about it.

## Common mistakes & troubleshooting

- **Forgetting `wsl --shutdown` after editing `/etc/wsl.conf`.** Closing the terminal window is not enough - the WSL2 virtual machine keeps running in the background until you explicitly shut it down from Windows (`wsl --shutdown`) or reboot Windows. The systemd setting only applies on the VM's next cold boot.
- **Editing `/etc/wsl.conf` from inside Windows with the wrong line endings.** If you edit this file with a Windows editor that saves Windows-style line endings (CRLF) instead of Unix-style (LF), WSL may fail to parse it correctly. Editing it directly inside WSL2 (e.g. with `nano`) avoids this.
- **Confusing "enabled" with "running."** A freshly enabled service does not start immediately unless you use `--now` or start it separately - and a running service that isn't enabled will vanish on the next reboot. Always check both `systemctl status` (running?) and `systemctl is-enabled` (boots automatically?).
- **Forgetting `daemon-reload` after editing a unit file.** systemd caches unit file contents in memory; edits to a `.service` file in `/etc/systemd/system/` are invisible to systemd until you run `sudo systemctl daemon-reload`, followed by a `restart` if the service was already running.
- **Using a relative path or `~` in `ExecStart`.** systemd services don't run with your interactive shell's environment, so `~` won't expand to your home directory the way it does at your prompt. Always use the full absolute path (e.g. `/home/username/scripts/heartbeat.sh`).
- **Forgetting the script itself needs execute permission.** Even with a correct `ExecStart` path, if the script file doesn't have its execute bit set (module 03), the service will fail to start with a permission-related error.
- **Putting custom services in the wrong directory.** Unit files belong in `/etc/systemd/system/` for anything you create yourself. Package-managed units live elsewhere and can get overwritten by package updates - don't edit those directly for custom work.
- **Not checking `journalctl -u <service>` when a service fails.** `systemctl status` gives a summary and a few recent log lines, but `journalctl -u <service>` shows the fuller output and is usually where the real error message (a missing file, a permission error, a script bug) becomes visible.

## Checkpoint quiz

1. What's the difference between a service being "enabled" and a service being "running," and why are they tracked independently?
2. Why doesn't editing `/etc/wsl.conf` take effect immediately after you save the file?
3. Why must `ExecStart` use an absolute path instead of something like `~/scripts/heartbeat.sh`?
4. After creating a new file in `/etc/systemd/system/`, what command must you run before `systemctl start` will even recognize it, and why?
5. If `systemctl status myservice` shows `inactive (dead)` but `systemctl is-enabled myservice` shows `enabled`, what does that combination tell you about what will happen on the next reboot versus right now?
6. What's the quickest way to determine whether systemd is currently acting as PID 1 on your WSL2 instance?
7. When a service fails to start, why would you check `journalctl -u <service>` instead of just `systemctl status <service>`?
8. Why does `/etc/systemd/system/` take precedence over the package-provided unit directories for a same-named service?

<details>
<summary>Show answers</summary>

1. "Enabled" controls whether systemd will automatically start the service at boot time; "running" (active) describes whether the process is executing right now. They're tracked independently because you might want a service running now without surviving a reboot (not enabled), or configured to start at every boot without currently being active (enabled but stopped) - useful for testing changes without committing to permanent auto-start, or vice versa.
2. `/etc/wsl.conf` settings, including the systemd boot option, are only read when the WSL2 virtual machine itself boots up. Just closing a terminal window doesn't shut down the underlying VM - it keeps running in the background - so the setting isn't applied until you fully shut it down with `wsl --shutdown` (or reboot Windows) and start a fresh session.
3. systemd services run in their own process context, not inside your interactive login shell, so shell shortcuts like `~` (which your shell expands to your home directory) are never expanded - systemd would try to execute a literal path called `~/scripts/heartbeat.sh`, which doesn't exist, and fail.
4. You must run `sudo systemctl daemon-reload`, because systemd loads and caches unit file definitions in memory; it doesn't watch the filesystem for changes, so it has no way of knowing a new or edited file exists until explicitly told to re-read them.
5. It tells you the service is not currently running (inactive/dead right now), but the next time the machine boots, systemd will automatically start it (because it's enabled). Enabled/disabled and running/stopped are independent states.
6. Run `ps -p 1` and check the `CMD` column - if it shows `systemd` (or `/sbin/init` symlinked to it), systemd is PID 1; alternatively, `systemctl status` succeeding (rather than erroring that the system wasn't booted with systemd) confirms the same thing.
7. `systemctl status` only shows a short summary plus a handful of the most recent log lines, which may truncate or omit the actual underlying error. `journalctl -u <service>` shows the fuller captured log output for that unit, which usually contains the specific error (missing file, permission denied, script exception) that explains why it failed.
8. `/etc/systemd/system/` is specifically designated as the administrator/local-configuration location and is intentionally given higher precedence in systemd's unit file search order than the package-provided directories (like `/lib/systemd/system/`), so that local customizations always win over defaults without needing to modify package-managed files (which could be overwritten on the next package update anyway).

</details>

## Next

You've completed the Linux fundamentals track modules on text processing, scripting, networking, and services - these skills carry directly into the Docker track, where you'll use exactly this foundation (permissions, scripting, networking, and process/service management) to understand how containers are built, run, and networked.
