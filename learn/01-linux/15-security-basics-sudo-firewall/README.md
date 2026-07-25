# Security Basics: sudo, Firewall, and Hardening

## Why this matters

Everything you've learned so far - users and permissions, package management, networking, SSH, logging - comes together here into the practical question every operator eventually faces: is this machine reasonably safe to expose, and can I prove it? You don't need to become a security specialist to avoid the most common, avoidable mistakes: overly broad `sudo` access, an open port nobody remembers enabling, or a root account reachable over SSH. This module closes out the Linux track with the fundamentals that matter before you start running Docker containers and Kubernetes clusters that expose services to networks.

## Concepts

**Recap: sudo from module 04, and why it exists.** You already know `sudo` lets a permitted user run a command as another user (usually root) without logging in as that user directly. The deeper reason this matters is the principle of least privilege: give an account only the access it needs to do its job, no more. A user who can run *any* command as root via `sudo` is, for practical purposes, root - so the real security question isn't "does this user have sudo" but "exactly what can this user do with sudo, and is that the minimum necessary."

**`/etc/sudoers` and why you don't edit it directly.** The file controlling who can run what via `sudo` is `/etc/sudoers`. It's deliberately edited only through the `visudo` command, never with a regular text editor. The reason is safety: a syntax error in `/etc/sudoers` can lock every non-root user out of using `sudo` at all, which is exactly the kind of self-inflicted lockout you want to avoid. `visudo` opens the file in your editor but validates the syntax before saving, refusing to save (and warning you) if you've introduced an error, so you get a chance to fix it before it takes effect.

**`/etc/sudoers.d/` for modular configuration.** Rather than editing the main `/etc/sudoers` file directly (even via `visudo`), the common practice is to drop small, focused configuration snippets into `/etc/sudoers.d/`, one file per purpose (for example, granting one specific user permission to run one specific command without a password). This keeps changes isolated, easier to review, and easier to remove cleanly later, instead of hunting through one large shared file. Files here are also edited via `visudo -f <path>` for the same syntax-safety reason.

**Least privilege in sudo rules, concretely.** A sudoers rule can be as broad as "this user can run any command as any user" or as narrow as "this user can run exactly this one command, with exactly these arguments, as root, without even needing to type a password." The narrower version is almost always safer: if that account is ever compromised, the damage is capped at exactly what the rule allows, not "anything root can do."

**Firewalls, conceptually.** A firewall is a set of rules that decides which network traffic is allowed in or out of a machine, based on things like port number and protocol. You already used `ss` in module 10 to see which ports are actually listening on your machine - a firewall is the layer that decides whether traffic reaching those listening ports from outside is allowed to arrive at all. The security logic is simple: if nothing needs to reach a port from the outside, block it; if only a specific service needs to be reachable, allow only that.

**`ufw` (Uncomplicated Firewall).** `ufw` is a simplified, human-friendly front end for Ubuntu's underlying firewall system. Instead of writing low-level rules, you express intent directly: allow this port, deny that one, check overall status. It has a single on/off state (enabled or disabled) and a list of rules evaluated for traffic that isn't otherwise already permitted (e.g., you don't need a rule for traffic your own machine initiated and is waiting on a reply for).

**Checking exposure with `ss` (recap + new angle).** Module 10 introduced `ss` for inspecting sockets. In a security context, the key question becomes: "what is actually listening for incoming connections on this machine, and did I intend for that?" A service listening on `0.0.0.0` (all network interfaces) is reachable from outside if the firewall allows it; a service listening only on `127.0.0.1` (localhost) is not reachable from other machines regardless of firewall rules, because it never accepts connections from outside in the first place. Reviewing listening ports regularly is a simple, high-value habit: unexpected listeners are one of the most common signs of misconfiguration or compromise.

**Disabling root SSH login (ties to module 13).** By default, some SSH server configurations permit logging in directly as `root` over SSH, given the right password or key. This is widely considered poor practice: it removes the audit trail benefit of forcing administrators to `sudo` from a named personal account, and it means a single compromised credential (root's) grants total access with no username to even guess. The fix is a setting in the SSH server's configuration file (`/etc/ssh/sshd_config`), `PermitRootLogin`, set to `no`, followed by restarting the `ssh` service (module 11) for the change to take effect.

**Keeping packages updated (ties to module 05).** Many real-world compromises exploit known, already-patched vulnerabilities in outdated software. `sudo apt update && sudo apt upgrade` (module 05) pulling in security patches promptly is one of the single highest-value, lowest-effort security practices that exists - far more impactful than most exotic hardening steps.

**`fail2ban`, conceptually.** `fail2ban` is a service that watches log files (tying back to module 14's `/var/log/auth.log` and `journalctl`) for patterns of repeated failed login attempts, and automatically, temporarily bans the offending IP address (usually via firewall rules) after a threshold is crossed. It's a practical defense against automated password-guessing ("brute force") attempts against services like SSH. It's mentioned here conceptually with an optional install exercise - a full configuration deep dive is beyond this beginner module's scope.

## Command reference

| Command | What it does | Example |
|---|---|---|
| `sudo visudo` | Safely opens `/etc/sudoers` for editing, validating syntax before saving | `sudo visudo` |
| `sudo visudo -f <path>` | Safely opens a specific file (e.g., in `/etc/sudoers.d/`) for editing with the same syntax validation | `sudo visudo -f /etc/sudoers.d/alice-docker` |
| `sudo ufw status` | Shows whether `ufw` is active and lists current rules | `sudo ufw status verbose` |
| `sudo ufw enable` | Turns the firewall on, applying its rule set to future traffic | `sudo ufw enable` |
| `sudo ufw disable` | Turns the firewall off entirely | `sudo ufw disable` |
| `sudo ufw allow <port>` | Adds a rule permitting incoming traffic on a specific port | `sudo ufw allow 22` |
| `sudo ufw allow <service>` | Adds a rule permitting incoming traffic for a named service (from `/etc/services`) instead of a raw port number | `sudo ufw allow OpenSSH` |
| `sudo ufw deny <port>` | Adds a rule blocking incoming traffic on a specific port | `sudo ufw deny 8080` |
| `sudo ufw delete <rule>` | Removes a previously added rule, referenced either by number (from `status numbered`) or by repeating the original rule | `sudo ufw delete allow 8080` |
| `sudo ufw status numbered` | Lists current rules with index numbers, useful for deleting a specific one precisely | `sudo ufw status numbered` |
| `ss -tuln` | Lists listening TCP/UDP sockets (`-t` TCP, `-u` UDP, `-l` listening only, `-n` numeric ports) - recap from module 10, used here to audit exposure | `ss -tuln` |
| `sudo apt update && sudo apt upgrade` | Refreshes package lists and installs available upgrades, including security patches (module 05 recap) | `sudo apt update && sudo apt upgrade -y` |
| `sudo systemctl restart ssh` | Restarts the SSH server so a configuration change (e.g., `sshd_config`) takes effect (module 11 recap) | `sudo systemctl restart ssh` |
| `sudo apt install fail2ban` | Installs `fail2ban` for automated banning of repeated failed login attempts (optional) | `sudo apt install fail2ban` |

## Hands-on exercises

1. Open your WSL2 Ubuntu terminal. Recap your own sudo access: run `sudo -l`. Read the output - it lists exactly what commands your user is permitted to run via `sudo` (commonly `(ALL : ALL) ALL` for a default WSL2 user, meaning "any command, as any user"). Note whether a password is required.

2. Practice `visudo` safely. Run `sudo visudo`. Without changing anything, look at the structure of the file (comments, the default rule granting the `sudo` group broad access). Exit without saving (in `nano`, this is `Ctrl+X` then answering "no" to save changes, or `:q!` if your default editor is `vim`).

3. Create a least-privilege rule using `/etc/sudoers.d/`. Run `sudo visudo -f /etc/sudoers.d/practice-uptime` and add this single line (replacing `yourusername` with your actual Linux username):
   ```
   yourusername ALL=(ALL) NOPASSWD: /usr/bin/uptime
   ```
   Save and exit. Then test it: run `sudo uptime` and confirm it runs without prompting for a password, while `sudo whoami` still prompts normally (proving the narrow rule only covers the one command you specified).

4. Clean up the practice rule: run `sudo rm /etc/sudoers.d/practice-uptime` to remove it, since granting passwordless `sudo` for anything, even something as harmless as `uptime`, isn't something you want lingering.

5. Audit your currently listening ports: run `ss -tuln`. For each line, note the `Local Address:Port` column - identify which entries are bound to `127.0.0.1` (localhost only) versus `0.0.0.0` or `*` (all interfaces). If you completed module 13's exercises, you should see SSH's port 22 listed.

6. Check `ufw`'s current status: run `sudo ufw status verbose`. On a fresh WSL2 install this is usually `inactive`. Enable it: run `sudo ufw allow OpenSSH` first (so you don't lock out your own SSH access), then `sudo ufw enable`, confirming the prompt about possibly disrupting existing connections, then re-run `sudo ufw status verbose` to confirm it's now `active` and lists your allow rule.

7. Add and then remove a rule deliberately. Run `sudo ufw allow 8080`, then `sudo ufw status numbered` and note the number assigned to that rule. Remove it precisely by number: `sudo ufw delete <number>` (replace with the actual number you saw), then confirm with `sudo ufw status numbered` that it's gone.

8. Cause a deliberate, recognizable error: run `sudo ufw allow notaport`. Read the error message closely - `ufw` should reject this clearly rather than silently accepting garbage input, since `notaport` isn't a valid port number or known service name. This is good practice for reading validation errors from tools that check their input.

9. Check and harden root SSH login. Run `sudo grep -i permitrootlogin /etc/ssh/sshd_config`. Note the current setting (it may be commented out with a default value, or explicitly set). Edit the file with `sudo nano /etc/ssh/sshd_config` (or your preferred editor), ensure the line reads `PermitRootLogin no` (uncommenting/changing it if needed), save, then run `sudo systemctl restart ssh` to apply it. Re-run the `grep` command to confirm the change stuck.

10. Confirm your packages are current: run `sudo apt update` followed by `sudo apt list --upgradable`. If anything is listed, this is a live example of exactly the patching gap discussed in the concepts section - you don't have to install the upgrades right now to have made the point, but note what's listed.

11. (Optional) Install `fail2ban` to see it conceptually in action: run `sudo apt install -y fail2ban`, then `sudo systemctl status fail2ban` to confirm it's running, and `sudo fail2ban-client status` to see its currently active protection "jails" (likely just the default SSH jail). You are not expected to fully configure it here - the goal is just to see it installed and running.

12. Tie it all together: run `sudo journalctl -u ssh --since "1 hour ago" | grep -i "fail\|invalid"` (module 14 recap) to look for any failed or invalid login attempts against your own practice SSH server from earlier exercises. Explain in your own words, out loud or in a note, why this single command connects modules 08, 11, 13, and 14 together.

## Common mistakes & troubleshooting

- **Editing `/etc/sudoers` directly with a plain text editor instead of `visudo`.** A syntax error saved this way can break `sudo` for everyone on the machine, including yourself, with no safety net. Always use `visudo` (or `visudo -f` for files in `/etc/sudoers.d/`).
- **Enabling `ufw` before allowing SSH access, when connecting over SSH.** If you `sudo ufw enable` without first running `sudo ufw allow OpenSSH` (or the equivalent port), and you were connected over SSH, you can immediately lock yourself out with no way back in except at the physical/console level. Always allow your own access method before enabling.
- **Granting broad `sudo` rules "just to make something work."** A rule like `ALL=(ALL) NOPASSWD: ALL` for a service account defeats the purpose of having sudoers rules at all; take the extra minute to scope the rule to the specific command(s) actually needed.
- **Assuming a service bound to `127.0.0.1` needs a firewall rule.** It doesn't - if nothing outside the machine can even reach that socket in the first place, a firewall rule for it is redundant (though not harmful). Check `ss -tuln`'s address column before assuming you need a `ufw` rule.
- **Forgetting to restart `sshd`/`ssh` after editing `sshd_config`.** Configuration file changes (like `PermitRootLogin no`) don't take effect until the service is restarted; test the *new* behavior only after `sudo systemctl restart ssh`.
- **Confusing "firewall blocks it" with "service isn't listening."** `ufw deny` on a port that nothing is even listening on accomplishes nothing meaningful; conversely, a service happily listening with no firewall rule at all may be fully exposed. Check both `ss -tuln` (is it listening) and `ufw status` (is it reachable) together.
- **Treating `fail2ban` as a replacement for good SSH hygiene.** It reduces the effectiveness of brute-force password guessing but doesn't replace disabling root login, keeping software patched, or using key-based auth - it's one layer among several, not a silver bullet.

## Checkpoint quiz

1. Why is `visudo` used instead of editing `/etc/sudoers` with a normal text editor?
2. What does the principle of least privilege mean in the context of a sudoers rule, with a concrete example?
3. What's the difference in risk between a service listening on `127.0.0.1` versus `0.0.0.0`?
4. Why must you be careful about the order of operations when enabling `ufw` on a machine you're connected to over SSH?
5. Why is disabling root login over SSH considered good practice, given that key-based or password authentication is already required?
6. What does `fail2ban` actually do, and what earlier module's tooling does it conceptually rely on to work?
7. Why is `sudo apt update && sudo apt upgrade` considered one of the highest-value security practices, compared to more exotic hardening steps?

<details>
<summary>Show answers</summary>

1. Because `visudo` validates the syntax of the file before allowing you to save, preventing a malformed `/etc/sudoers` file from locking every user out of using `sudo` on the machine - a mistake that's very hard to recover from if made with a plain editor.
2. It means granting only the exact access needed and no more - for example, giving a user permission to run only `sudo systemctl restart myapp` rather than blanket `sudo` access to run any command as root, so that even if that account is misused or compromised, the damage is capped to that one narrow capability.
3. A service listening on `127.0.0.1` only accepts connections originating from the same machine, so it's unreachable from the network regardless of firewall settings; a service listening on `0.0.0.0` accepts connections from any reachable network interface, meaning it can be reached externally unless a firewall or other control blocks it - making it a much larger exposure if unintended.
4. Because enabling `ufw` immediately starts enforcing its rules, and if a rule permitting your current connection method (e.g., SSH/port 22) hasn't been added first, the firewall can cut off the very connection you're using, locking you out with no way back in except through direct/console access.
5. Because it removes the ability to authenticate directly as the all-powerful root account over the network at all - forcing administrators to log in as a named personal account and use `sudo` for privileged actions, which preserves an audit trail and means a single leaked root credential can't be used for direct SSH access.
6. `fail2ban` watches authentication-related logs (like `/var/log/auth.log`, tied to module 14's logging concepts) for patterns of repeated failed login attempts and automatically, temporarily blocks the offending source (typically via firewall rules) once a threshold is exceeded, mitigating automated brute-force login attempts.
7. Because a large share of real-world compromises exploit already-known vulnerabilities in outdated software for which patches already exist; regularly applying updates closes those specific, already-solved holes with comparatively minimal effort, delivering more practical risk reduction than many more elaborate, narrowly-scoped hardening measures.

</details>

## Next

This completes the Linux track. Continue to the Docker track to start containerizing applications, building on the process management, networking, and permissions foundations you've built here.
