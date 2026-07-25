# Linux Track

This track takes you from never having opened a terminal to being able to
navigate, manage, script, and troubleshoot a Linux system confidently — all
practiced hands-on inside WSL2 (Ubuntu) on your Windows 11 machine. It's
track 1 of 4: Linux → Docker → Kubernetes → AKS.

## How this track works

- Go through the modules **in numeric order** — each one builds directly on
  commands and concepts taught in the ones before it. Module 8 assumes you
  already know module 3's permissions model; module 14 assumes you already
  know module 11's systemd basics; and so on.
- Every module (except this index and the capstone) follows the same
  shape: **Why this matters**, **Concepts**, a **Command reference** table,
  **Hands-on exercises** you actually run in your terminal, **Common
  mistakes & troubleshooting**, and a **Checkpoint quiz** with answers
  hidden in a collapsible block so you can self-test honestly.
- Do the exercises for real. Reading a command is not the same as typing
  it, watching it fail, and fixing it. Budget more time for exercises than
  for reading.
- The last module, the capstone, has no quiz — it's a single project that
  makes you combine everything, and it's deliberately the bridge into the
  Docker track.

## Modules

| # | Module | What it covers | Rough time |
|---|--------|-----------------|------------|
| 00 | [Setup: WSL2 & Ubuntu](00-setup-wsl2/README.md) | Installing WSL2 + Ubuntu, first-time setup, updating packages, Windows Terminal | 30-45 min |
| 01 | [Shell Basics & Philosophy](01-shell-basics-and-philosophy/README.md) | What a shell is, the Unix philosophy, prompt anatomy, getting help | 45-60 min |
| 02 | [Filesystem Navigation](02-filesystem-navigation/README.md) | The Linux filesystem hierarchy, paths, cd/ls/mkdir/cp/mv/rm/find | 60-90 min |
| 03 | [File Permissions & Ownership](03-file-permissions-ownership/README.md) | rwx, owner/group/other, chmod, chown, umask | 60-90 min |
| 04 | [Users and Groups](04-users-and-groups/README.md) | whoami/id, sudo, su, creating and managing users and groups | 45-60 min |
| 05 | [Package Management (APT)](05-package-management-apt/README.md) | Installing, updating, and removing software with apt and dpkg | 45-60 min |
| 06 | [Process Management](06-process-management/README.md) | ps/top/htop, foreground vs background, signals, kill | 60-90 min |
| 07 | [I/O Redirection and Pipes](07-io-redirection-and-pipes/README.md) | stdin/stdout/stderr, >, >>, <, pipes, tee | 45-60 min |
| 08 | [Text Processing: grep, sed, awk](08-text-processing-grep-sed-awk/README.md) | Searching and transforming text: grep, sed, awk, sort, uniq, cut | 90-120 min |
| 09 | [Bash Scripting](09-bash-scripting/README.md) | Variables, conditionals, loops, functions, exit codes, writing real scripts | 120-150 min |
| 10 | [Networking Basics](10-networking-basics/README.md) | IP/ports, ip, ping, curl, ss, dig, WSL2 networking quirks | 60-90 min |
| 11 | [systemd Services](11-systemd-services/README.md) | Units, systemctl, writing and enabling your own service | 60-90 min |
| 12 | [Disk, Storage, and Mounts](12-disk-storage-and-mounts/README.md) | df/du, mounts, /mnt in WSL2, links, finding what's eating space | 45-60 min |
| 13 | [SSH & Remote Access](13-ssh-remote-access/README.md) | Key pairs, ssh/scp, authorized_keys, SSH permission requirements | 60-90 min |
| 14 | [Logging and journald](14-logging-and-journald/README.md) | /var/log, journalctl in depth, log rotation | 45-60 min |
| 15 | [Security Basics: sudo & Firewall](15-security-basics-sudo-firewall/README.md) | sudoers, ufw, hardening basics, checking exposure | 60-90 min |
| 16 | [Capstone: Log Watchdog](16-capstone-project/README.md) | One project combining everything — script, schedule, lock it down | 3-5 hours |

Start here → [00-setup-wsl2/README.md](00-setup-wsl2/README.md)

Back to main curriculum → [../README.md](../README.md)
