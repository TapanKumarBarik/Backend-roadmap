# Users and Groups

## Why this matters

Every file you touch, every process you run, and every permission check you saw in module 03 is enforced against a user and a group. You cannot reason about `chmod`/`chown` without knowing who "the owner" or "the group" actually is, and you cannot administer a real server (or a Docker container running as a specific UID) without knowing how to create, inspect, and manage users. In WSL2 this also explains why your terminal can run `sudo` without a password prompt sometimes, and what "root" actually means on your machine.

## Concepts

**A user is an identity.** Every process on Linux runs "as" some user, and every file is owned by some user (this is exactly the "owner" from module 03's permission bits). Users have a username (like `paresh`) and, under the hood, a numeric user ID (UID). UID 0 is always `root`, the superuser who bypasses normal permission checks.

**A group is a named set of users.** Groups let you grant a permission to several people at once instead of one at a time. Every user belongs to at least one group (their "primary group," usually created just for them), and can additionally belong to any number of "supplementary" groups. This is exactly the "group" column from module 03's `rwx` permission bits — when a file's group is `sudo` and has group-read permission, every member of the `sudo` group can read it.

**`/etc/passwd`** is a plain text file listing every user account on the system, one per line, fields separated by colons: username, an `x` placeholder (the real password hash lives elsewhere, in `/etc/shadow`), UID, primary GID, a comment field, home directory, and login shell. You don't need to memorize every field, but knowing "this is just a text file you can read" demystifies user accounts entirely.

**`/etc/group`** is the group equivalent: one line per group, with group name, a placeholder, GID (group ID), and a comma-separated list of member usernames.

**`sudo` and the principle of least privilege.** Running everything as `root` all the time is dangerous — one typo in a root shell can wipe a filesystem or misconfigure the whole system. Instead, ordinary users run as themselves day to day, and prefix a single command with `sudo` ("superuser do") when they need root privileges just for that one command. Linux then logs the action and asks (usually) for your own password to confirm. This "escalate only when needed, only for what's needed" approach is the principle of least privilege: you don't hand out more power than a task requires.

**`su`** ("substitute user" or "switch user") starts a new shell as a different user (root by default), and you stay in that shell until you `exit`. `sudo` is generally preferred today because it runs one command at a time and keeps a clear audit trail, rather than dropping you into an open-ended root shell.

**WSL specifics.** When you installed Ubuntu on WSL2, the setup wizard created one Linux user for you and made that user a member of the `sudo` group automatically — this is why `sudo` usually works for you without needing anyone else to configure it. WSL also has a real `root` account (UID 0), just like any Linux system; you can reach it with `sudo` or `su`, and some WSL configurations even let a distro default to logging in as `root` (checked via `/etc/wsl.conf`), though that isn't the normal beginner setup. Being in the `sudo` group is what makes your everyday WSL user "an administrator" of the Linux distro — it is a group membership, not some special WSL-only magic.

## Command reference

| Command | What it does | Example |
|---|---|---|
| `whoami` | Prints the username you're currently logged in as. | `whoami` |
| `id` | Shows your UID, primary GID, and every supplementary group you belong to. | `id` prints something like `uid=1000(paresh) gid=1000(paresh) groups=1000(paresh),27(sudo)` |
| `id <user>` | Shows UID/GID info for another user instead of yourself. | `id root` shows root's UID (0) and groups |
| `groups` | Lists just the group names you belong to. | `groups` |
| `groups <user>` | Lists the groups a specific user belongs to. | `groups paresh` |
| `sudo <command>` | Runs a single command as root (or another user with `-u`), after confirming your password. | `sudo apt update` runs `apt update` with root privileges |
| `sudo -i` | Starts an interactive root login shell (use sparingly, and `exit` when done). | `sudo -i` |
| `su <user>` | Switches to another user's shell (prompts for that user's password); with no argument, switches to root. | `su - paresh` switches to user `paresh`, `-` loads their full login environment |
| `sudo adduser <name>` | Interactively creates a new user: prompts for password and optional details (full name, etc.), and creates a home directory. Friendlier, higher-level than `useradd`. | `sudo adduser dev1` |
| `sudo useradd -m <name>` | Lower-level command to create a user; `-m` creates a home directory (without it, none is made). Doesn't set a password or ask questions. | `sudo useradd -m dev2` |
| `passwd` | Changes your own password. | `passwd` |
| `sudo passwd <user>` | Sets or changes another user's password (root privilege required). | `sudo passwd dev2` |
| `sudo groupadd <name>` | Creates a new group. | `sudo groupadd developers` |
| `sudo usermod -aG <group> <user>` | Adds a user to a supplementary group without removing them from existing groups. `-a` means "append," `-G` names the group(s); always use `-a` together with `-G` or you'll wipe out the user's other group memberships. | `sudo usermod -aG developers dev1` |
| `sudo deluser <user>` | Removes a user account (Debian/Ubuntu-friendly wrapper); add `--remove-home` to also delete their home directory. | `sudo deluser --remove-home dev2` |
| `sudo userdel <user>` | Lower-level command to remove a user account; add `-r` to also remove their home directory and mail spool. | `sudo userdel -r dev2` |
| `sudo deluser <user> <group>` | Removes a user from a specific group without deleting the account. | `sudo deluser dev1 developers` |

## Hands-on exercises

1. Open your WSL2 Ubuntu terminal. Run `whoami` and then `id`. Note your username, UID, primary group, and every group listed after `groups=`. You should see `sudo` in that list — that's why you can run administrative commands.

2. Run `cat /etc/passwd | grep "$(whoami)"` (this pipes the file through a filter for your username — you'll learn pipes properly in module 07, but this is a taste). Identify which colon-separated field is your UID, and which is your home directory.

3. Run `cat /etc/group | grep sudo`. Confirm your username appears in the comma-separated member list at the end of that line.

4. Try to read another user's password hash by running `cat /etc/shadow`. Expect a `Permission denied` error — this file is root-only for a good reason (it holds password hashes). Now run `sudo cat /etc/shadow` and confirm it works. Read the error message carefully before you use `sudo` — this is the "read the error" habit you'll need constantly.

5. Create a new group called `learners`: `sudo groupadd learners`. Then confirm it exists: `cat /etc/group | grep learners`.

6. Create a new user called `student1` with a home directory: `sudo adduser student1`. Follow the prompts to set a password (anything you'll remember) and press Enter through the optional details. Afterward, confirm the home directory was created: `ls -la /home`.

7. Add `student1` to the `learners` group you created: `sudo usermod -aG learners student1`. Verify it worked: `groups student1` should now list both `student1` and `learners`.

8. Switch into that user's shell: `su - student1` (enter the password you set). Run `whoami` and `id` to confirm you're now `student1`. Then `exit` to return to your own shell — run `whoami` again to confirm you're back.

9. Break something on purpose: as `student1` (use `su - student1` again), try running `sudo apt update`. Expect it to fail or ask for a password `student1` doesn't have sudo rights for, producing something like "is not in the sudoers file. This incident will be reported." This is expected — `student1` was never added to the `sudo` group. Exit back to your own user, then fix it: `sudo usermod -aG sudo student1`. Switch to `student1` again and confirm `sudo apt update` now works (it will ask for `student1`'s own password).

10. Clean up: exit back to your original user, then delete the practice account entirely: `sudo deluser --remove-home student1`. Confirm it's gone: `cat /etc/passwd | grep student1` should print nothing.

## Common mistakes & troubleshooting

- **Forgetting `-a` with `usermod -G`:** running `sudo usermod -G newgroup user` (without `-a`) *replaces* all of the user's supplementary groups with just `newgroup`, silently kicking them out of `sudo` and everything else. Always use `-aG`.
- **Confusing `sudo <command>` with `su`:** `sudo` runs one command with elevated rights and returns you to your normal shell; `su` drops you into a whole new shell as another user until you `exit`. Forgetting you're still inside an `su` shell is a common source of "why isn't my file owned by me" confusion later.
- **Group membership not taking effect immediately:** if you add yourself to a new group with `usermod -aG`, your *current* shell session won't see the new group until you log out and back in (or start a fresh shell/run `newgrp <group>`). `id` in the same old session will still show the old group list.
- **Expecting a password prompt every time `sudo` is used:** `sudo` caches your successful authentication for a few minutes, so back-to-back `sudo` commands won't always re-prompt. This is normal, not a bug.
- **Typing your password and seeing nothing happen:** `sudo`/`passwd` prompts don't echo any characters (not even asterisks) while you type the password. This is intentional, not a frozen terminal.
- **Deleting a user without `--remove-home`/`-r`:** the account disappears from `/etc/passwd`, but their home directory and files remain on disk, silently owned by a now-nonexistent UID.

## Checkpoint quiz

1. What is the difference between a user's primary group and a supplementary group?
2. Why does `sudo` exist instead of everyone just working as `root` all the time?
3. You run `sudo usermod -G video alice` and later discover Alice can no longer run `sudo` commands. What went wrong, and what command would have avoided it?
4. What's the practical difference between `sudo some-command` and `su - someuser`?
5. Where would you look to see the list of groups a user belongs to, without running any command that requires typing a password?
6. Why is `/etc/shadow` not readable by ordinary users, while `/etc/passwd` is?
7. On a fresh WSL2 Ubuntu install, why can your default user typically run `sudo apt update` right away with no extra setup?
8. If you add yourself to a new group with `usermod -aG`, why might `id` still not show that group immediately?

<details>
<summary>Show answers</summary>

1. The primary group is the default group assigned to a user's files/processes and is recorded in `/etc/passwd`; it's usually a group created just for that user. Supplementary groups are additional group memberships (listed in `/etc/group`) that grant access to extra resources without changing the user's default group.
2. Running everything as root removes all permission safety nets — one mistaken command can damage the whole system. `sudo` lets ordinary users escalate privileges only for the specific command that needs it (principle of least privilege), keeping day-to-day work unprivileged and safer, while still logging what was run.
3. Using `usermod -G video alice` without `-a` replaced all of Alice's supplementary groups with just `video`, removing her from `sudo`. The fix is `sudo usermod -aG video alice`, where `-a` appends the group instead of replacing the list.
4. `sudo some-command` runs a single command with root privileges and immediately returns you to your own shell as your own user. `su - someuser` starts a whole new login shell as that other user, and you remain in that shell (as them) until you explicitly `exit`.
5. Read `/etc/group` directly (e.g. `cat /etc/group`) — it lists group names and their members without requiring `sudo` or a password.
6. `/etc/passwd` needs to be readable by everyone because many ordinary programs look up usernames/UIDs from it, but it no longer stores password hashes. `/etc/shadow` holds the actual password hashes and is restricted to root so other users can't attempt to crack them offline.
7. Because the WSL setup wizard automatically added the first Linux user it created to the `sudo` group, so that user has administrative rights on the distro from the start, without any manual configuration.
8. Because `id` reflects the group memberships of your *current login session*, which were computed when that shell/session started. A group added afterward only takes effect in new sessions/shells (or after `newgrp`), not the already-running one.

</details>

## Next

Continue to [05 - Package Management with APT](../05-package-management-apt/README.md) to learn how to install and manage the real software (like `htop` and `tree`) you'll use in the process-management module right after it.
