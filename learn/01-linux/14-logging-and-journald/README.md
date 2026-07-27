# Logging and journald

## Why this matters

When something breaks - a service won't start, a login fails, a container crashes - the logs are almost always where the answer lives. You already started services with systemd in module 11; this module is the deep dive into actually reading what those services (and the system as a whole) are telling you, both through traditional `/var/log` files and through `journalctl`, systemd's structured logging query tool. Being fast and precise with logs is one of the most transferable troubleshooting skills in all of Linux, Docker, and Kubernetes work.

## Concepts

**Two logging worlds that coexist.** Modern Ubuntu has two overlapping ways logs get stored: traditional flat text files under `/var/log` (a long-standing Unix convention), and `journald`, systemd's own logging service, which stores log data in a structured, indexed binary format and is queried with `journalctl`. Some things log to both, some log mainly to one. You already met systemd services in module 11 - `journald` is what's capturing the console output of everything systemd starts and manages.

```
   systemd-managed services (module 11)        traditional programs
              │                                        │
              ▼                                        ▼
        journald (structured,               /var/log/*.log (plain text,
        indexed, binary)                    rotated by logrotate)
              │                                        │
              ▼                                        ▼
         journalctl                          cat / tail / grep / awk
    (filter by unit, time,                    (module 07/08 tools,
     priority, boot)                           same as any text file)
```

Some things land in both worlds, some in only one — that's why this module teaches both query paths instead of picking one.

**A tour of `/var/log`.** This directory is where most traditional log files live. `/var/log/syslog` is the general-purpose system log, historically the first place to look for broad system activity. `/var/log/auth.log` records authentication-related events - logins, `sudo` usage, SSH connection attempts - which becomes directly relevant after module 13's SSH work and ties into this module's security angle. `/var/log/dpkg.log` records package installation/removal history from `apt`/`dpkg` (module 05), so if a package suddenly appears broken, this log can tell you when and how it was installed or changed. There are others (`/var/log/kern.log` for kernel messages, per-application logs in their own subdirectories, etc.) but these three are the ones you'll reach for constantly.

**Why `journald` exists alongside plain text files.** Plain text log files are simple but have real limitations: no built-in way to filter by exact time range, no built-in severity filtering, and every application picks its own format, making them awkward to search consistently. `journald` solves this by capturing log entries as structured records (with fields like timestamp, originating service/unit, priority level, and the message itself) and giving you one consistent tool, `journalctl`, to query all of it regardless of which service produced it.

**Priority/severity levels.** Log messages carry a priority level indicating how serious they are, following the traditional syslog scale from most to least severe: `emerg`, `alert`, `crit`, `err`, `warning`, `notice`, `info`, `debug`. When you filter `journalctl` by priority, you're asking "show me this severity and everything more severe," which is how you cut through noise to find real problems.

```
  emerg    ▲  most severe
  alert    │
  crit     │  journalctl -p err  shows THIS and everything
  err      │◄─ above it (err, crit, alert, emerg) — not below
  warning  │
  notice   │
  info     │
  debug    ▼  least severe, routine noise
```

**Boots.** Because `journald` is aware of system boots (start-up to shutdown cycles), it can show you logs scoped to "this boot," "the previous boot," etc. This is invaluable when troubleshooting something that happens "since the last restart" without having to guess at timestamps.

**Log rotation.** Logs grow forever if left unchecked, eventually filling a disk (tying directly back to module 12's disk usage concepts). "Log rotation" is the practice of periodically archiving/compressing the current log file, starting a fresh one, and deleting sufficiently old archives, so log storage stays bounded. On Ubuntu, the traditional text-file logs under `/var/log` are rotated by a tool called `logrotate`, configured via files under `/etc/logrotate.d/` (one config file per application/log, specifying how often to rotate, how many old copies to keep, and whether to compress them). `journald` has its own separate, built-in equivalent of rotation, controlled by disk usage or time limits rather than a `logrotate` config file (see the vacuum commands below).

**Tying back to text processing (module 08).** Log files are just text, so everything you learned about `grep`, `awk`, `cut`, `sort`, `uniq`, `wc`, `head`, and `tail` applies directly - you'll frequently pipe `journalctl` output or `/var/log` files into these tools, for example `grep`-ing for an error string, or `awk`-ing out a specific column from a syslog line.

## Command reference

| Command | What it does | Example |
|---|---|---|
| `journalctl` | Shows all journal log entries, oldest first, opened in a pager | `journalctl` |
| `journalctl -u <unit>` | Filters to entries from a specific systemd unit/service (`-u` = unit) | `journalctl -u ssh` |
| `journalctl -f` | Follows the journal live, printing new entries as they arrive (`-f` = follow), like `tail -f` | `journalctl -u ssh -f` |
| `journalctl -b` | Shows entries from the current boot only (`-b` = boot); `journalctl -b -1` shows the previous boot | `journalctl -b` |
| `journalctl --since "<time>"` | Shows entries from a given time onward; accepts natural phrases like `"1 hour ago"` or exact timestamps | `journalctl --since "1 hour ago"` |
| `journalctl --until "<time>"` | Shows entries up to a given time; combine with `--since` to bound a range | `journalctl --since "09:00" --until "10:00"` |
| `journalctl -p <priority>` | Filters to entries at or above a given severity (`-p` = priority), e.g. `err` shows err and worse | `journalctl -p err` |
| `journalctl -n <N>` | Shows only the last N entries (`-n` = number), like `tail -n` | `journalctl -n 50` |
| `journalctl -r` | Reverses the order, newest entries first (`-r` = reverse) | `journalctl -r -n 20` |
| `journalctl --disk-usage` | Reports how much disk space the journal itself is currently consuming | `journalctl --disk-usage` |
| `sudo journalctl --vacuum-time=<time>` | Deletes journal entries older than the given time (e.g. `2weeks`), reclaiming disk space | `sudo journalctl --vacuum-time=2weeks` |
| `sudo journalctl --vacuum-size=<size>` | Shrinks the journal down to at most the given total size (e.g. `500M`) | `sudo journalctl --vacuum-size=500M` |
| `tail -f /var/log/syslog` | Follows a traditional text log file live (module 07/08 recap) | `sudo tail -f /var/log/auth.log` |

## Hands-on exercises

1. Open your WSL2 Ubuntu terminal. Run `ls -lh /var/log`. Note the mix of plain files (`syslog`, `auth.log`, `dpkg.log`) and rotated/compressed ones (files ending in `.1`, `.gz`) - this is `logrotate` at work, which you'll examine directly in a later step.

2. Look at recent authentication activity: run `sudo tail -n 20 /var/log/auth.log`. Since you practiced `sudo` and SSH in module 13, you should be able to spot entries related to your own logins or `sudo` invocations.

3. Search for package install history: run `grep " install " /var/log/dpkg.log | tail -5`. This applies module 08's `grep` directly to a real log file. Note the timestamp format at the start of each line.

4. Now switch to `journalctl`. Run `journalctl -n 20` to see the last 20 entries system-wide. Then run `journalctl -u ssh -n 20` (or `sshd` if `ssh` shows nothing) to scope it to just the SSH service you installed in module 13.

5. Filter by severity: run `journalctl -p warning -n 30`. This shows only entries at `warning` level or more severe (i.e., `warning`, `err`, `crit`, `alert`, `emerg`), filtering out routine `info`/`debug` noise.

6. Practice time-bounded queries: run `journalctl --since "1 hour ago"` and then `journalctl --since today`. Compare how many entries each returns. If you know roughly when you started this WSL2 session, try `journalctl --since "30 minutes ago" --until "10 minutes ago"` and check the timestamps in the output fall within that window.

7. Practice reverse order and following live output together. First run `journalctl -r -n 10` to see the 10 most recent entries newest-first. Then, in the same terminal, start following live logs for the SSH service: `sudo journalctl -u ssh -f`. While that's running, open a **second** WSL2 terminal window/tab and run `ssh localhost` (from module 13) to generate a fresh login event. Watch the new lines appear in the first terminal in real time. Press `Ctrl+C` in the first terminal to stop following.

8. Check journal disk usage: run `journalctl --disk-usage`. Note the reported size - this ties back to module 12's disk-usage concepts, since an unbounded journal can itself become a space problem.

9. Intentionally cause and then read an error. Run `journalctl -u a-service-that-does-not-exist`. Read the output/error carefully - `journalctl` should tell you clearly that no entries were found or the unit doesn't exist, rather than silently returning nothing. This is good practice for recognizing "empty result" vs. "genuine error" in tool output.

10. Look at a `logrotate` config to see rotation policy in practice: run `cat /etc/logrotate.d/rsyslog` (or `ls /etc/logrotate.d/` first if that file isn't present, and pick any file that exists there). Identify the `rotate` (how many old copies to keep), `weekly`/`daily` (how often), and `compress` directives if present.

11. Practice a safe vacuum. Run `sudo journalctl --vacuum-time=2weeks`. Even if nothing is old enough to delete, confirm the command reports how much space (if any) it reclaimed, and that it completes without error - this is the command you'd reach for on a real machine that's running low on space due to journal growth.

## Independent challenge

No commands given here — figure it out yourself using what you know from this module and earlier ones.

**Task:** Using the journal rather than raw files, produce a list of every failed or unsuccessful SSH authentication attempt from the last day against the SSH service you set up in module 13 — you'll need to scope to the right unit, bound the time window, and filter the text down to just the failure lines (reach for module 08's filtering on top of `journalctl`). Separately, find out how much disk the journal itself is currently consuming, and determine what command you would run to cap the journal at a fixed maximum size if it were growing out of control — tying back to the WSL2 virtual-disk concern from module 12.

<details>
<summary>Stuck? One hint</summary>

`journalctl -u ssh --since "1 day ago"` piped into `grep -i` for words like "fail" or "invalid" isolates the attempts; `--disk-usage` reports current journal size, and the size-capping tool is one of the `--vacuum-*` options.

</details>

## Common mistakes & troubleshooting

- **Running `journalctl -u <name>` with the wrong unit name and assuming logging is broken.** systemd unit names must match exactly (e.g., `ssh` vs `sshd` can differ by distro/package); run `systemctl list-units --type=service` (from module 11) to confirm the exact unit name first if you get no results.
- **Forgetting `sudo` when reading `/var/log/auth.log` or similar restricted files.** Some log files are only readable by root or specific groups, since they can contain sensitive security-relevant information; a plain permission-denied error here is expected, not a bug.
- **Treating an empty `journalctl` result as an error.** No matching entries for a tight time range or unfamiliar unit name is a valid, non-error outcome - always sanity-check your filters (especially `--since`/`--until` and unit names) before assuming something is wrong with the tool.
- **Not realizing `--since`/`--until` accept both natural language and exact timestamps.** `"yesterday"`, `"1 hour ago"`, and `"2026-07-20 09:00:00"` are all valid; malformed strings will produce a parse error naming the problem, worth reading closely.
- **Confusing journal rotation with `logrotate`.** `logrotate` only manages traditional flat-text logs under `/var/log` via configs in `/etc/logrotate.d/`; `journald`'s own storage is governed separately by its own size/time limits and the `--vacuum-*` commands, not by `logrotate` configs.
- **Piping `journalctl` output into `grep`/`awk` without disabling the pager first.** By default `journalctl` opens a pager (`less`); when scripting or piping, this is usually handled automatically once you pipe to another command, but if output looks stuck or empty, try adding `--no-pager` explicitly.
- **Assuming the journal is unbounded and never checking its size.** Especially on constrained disks (including your WSL2 virtual disk from module 12), an ever-growing journal can quietly consume significant space; check periodically with `--disk-usage` and vacuum when needed.

## Checkpoint quiz

Write down your answer to each question before expanding it — checking without attempting first is the single easiest way to fool yourself into thinking you've learned this.

1. What's the practical difference between looking at `/var/log/syslog` directly and querying the same information through `journalctl`?
2. If you wanted to see only serious problems and ignore routine informational messages, which `journalctl` flag would you reach for, and why?
3. What does `journalctl -b -1` show you, and when would that be useful?
4. What is the relationship (or lack of one) between `logrotate` and `journald`'s own log management?
5. Why might `journalctl --disk-usage` matter on a WSL2 machine specifically, tying back to a concept from the previous module?
6. You ran `journalctl -u myapp` and got zero results. List two different reasons that could legitimately explain this (not bugs).
7. What's the difference between `--since "1 hour ago"` and `-n 50`, and when would you prefer one over the other?

<details>
<summary>Show answers</summary>

1. `/var/log/syslog` is a plain text file you'd search with tools like `grep`/`tail` directly; `journalctl` queries the same kind of system-wide activity (and more) through a structured, indexed store that supports precise filtering by unit, time range, priority, and boot, without you having to parse text formats yourself.
2. `-p <priority>`, e.g. `journalctl -p err`, because it filters to only entries at that severity level or worse, cutting out routine `info`/`debug` noise and surfacing actual problems.
3. It shows journal entries from the boot before the current one. This is useful when troubleshooting a crash or unexpected reboot - you need to see what happened right up until the system went down, which isn't in the current boot's logs.
4. They're independent systems: `logrotate` (configured via `/etc/logrotate.d/`) manages rotation/compression/deletion of traditional flat-text log files in `/var/log`; `journald` manages its own structured log storage separately, governed by its own size/time retention settings and the `--vacuum-time`/`--vacuum-size` commands.
5. Because the entire journal lives inside the WSL2 virtual disk (`ext4.vhdx` from module 12), and that virtual disk grows but doesn't automatically shrink - so an unchecked, growing journal contributes to that virtual disk's size, making periodic `--disk-usage` checks and vacuuming a real, practical concern.
6. Any two of: the unit name is spelled/cased differently than the actual systemd unit name; the service has never actually run or logged anything yet; the current `--since`/`--until`/boot filters (if any were set previously in the session, or defaults) are excluding the time range where the entries exist; the service logs to a plain file instead of the journal and was never captured by journald at all.
7. `--since "1 hour ago"` filters by an actual time boundary regardless of how many entries fall in that window; `-n 50` returns a fixed count of the most recent entries regardless of how much time they span. Prefer `--since` when you care about a specific time window (e.g., "since I restarted the service"); prefer `-n` when you just want a quick recent sample regardless of timing.

</details>

## Further reading & sources

- [`man7.org`: journalctl(1)](https://man7.org/linux/man-pages/man1/journalctl.1.html) - full option reference, including output formats (`-o json`) not covered here.
- [freedesktop.org: systemd-journald docs](https://www.freedesktop.org/software/systemd/man/latest/systemd-journald.service.html) - how the journal itself is structured and configured (`/etc/systemd/journald.conf`).
- [`man7.org`: logrotate(8)](https://man7.org/linux/man-pages/man8/logrotate.8.html) - full config directive reference for the traditional text-log rotation this module introduced.
- [DigitalOcean: How To Use Journalctl to View and Manipulate Systemd Logs](https://www.digitalocean.com/community/tutorials/how-to-use-journalctl-to-view-and-manipulate-systemd-logs) - another worked walkthrough with additional filtering examples.

## Next

Continue to [15-security-basics-sudo-firewall](../15-security-basics-sudo-firewall/README.md) to go deeper on sudo, lock down your machine with a firewall, and wrap up the Linux track with practical security fundamentals.
