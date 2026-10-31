# Module 02: Filesystem Navigation

## Why this matters

Every backend developer eventually meets the same little monster:

> "The application is running, but where the hell is the file?"

Maybe it's a configuration file under `/etc`. Maybe the logs are under `/var/log`. Maybe a deployment script created something under `/opt`. Maybe you're inside a container and suddenly `/home` looks nothing like your laptop.

Linux becomes much less mysterious once you understand one simple idea:

**The filesystem is a tree, and every path is an address inside that tree.**

Docker images, Kubernetes containers, Linux servers, CI runners, SSH sessions, and WSL all build on this model.

In this module you'll learn how to:

* understand the Linux filesystem hierarchy
* navigate using absolute and relative paths
* understand `.`, `..`, and `~`
* inspect files and directories
* create files and directory trees
* copy and move data
* remove files safely
* use shell wildcards
* search directory trees with `find`
* reason about paths instead of blindly trying commands

By the end, you should be able to land on an unfamiliar Linux machine and start figuring out where you are without needing a map, a tour guide, or a small ceremonial sacrifice to the terminal.

## Concepts

### 🌳 1. Linux has one filesystem tree

Linux presents files and directories through a single hierarchical namespace beginning at `/`, called the **root directory**.

Think of `/` as the trunk of a giant tree.

```text
/
├── bin/        ← essential commands
├── dev/        ← device interfaces
├── etc/        ← system configuration
├── home/       ← users' home directories
├── opt/        ← optional/add-on software
├── proc/       ← process/kernel information
├── root/       ← root user's home directory
├── run/        ← runtime state
├── sbin/       ← essential system administration commands
├── srv/        ← data served by system services
├── sys/        ← kernel/device information
├── tmp/        ← temporary files
├── usr/        ← most user-space programs and libraries
└── var/        ← changing data such as logs and caches
```

The exact contents and layout of a modern Linux installation can vary, and not every directory will be equally important on every machine. The **Filesystem Hierarchy Standard (FHS)** provides conventions for where major categories of files and directories belong.

You do not need to memorize this tree.

You need to develop the instinct:

> "If I need configuration, logs, a user's files, runtime state, or installed software, I know roughly where to look."

### 🏠 2. The directories you'll repeatedly encounter

| Directory  | What you'll commonly find there                                | Backend relevance                      |
| ---------- | -------------------------------------------------------------- | -------------------------------------- |
| `/`        | Root of the entire hierarchy                                   | Starting point for understanding paths |
| `/home`    | Normal users' home directories                                 | SSH sessions, development files        |
| `/root`    | Root user's home directory                                     | Administration                         |
| `/etc`     | System and service configuration                               | Extremely important for servers        |
| `/var`     | Changing application/system data                               | Logs, caches, queues, databases        |
| `/var/log` | System/application logs                                        | Troubleshooting                        |
| `/tmp`     | Temporary data                                                 | Scripts, temporary processing          |
| `/usr`     | Programs, libraries, shared data                               | Installed software                     |
| `/opt`     | Optional/add-on software                                       | Third-party applications               |
| `/srv`     | Data served by system services                                 | Web/service deployments                |
| `/run`     | Runtime state created since boot                               | Services and process-related state     |
| `/proc`    | Kernel/process information exposed as a virtual filesystem     | Process inspection                     |
| `/sys`     | Kernel/device information exposed through a virtual filesystem | Hardware/kernel inspection             |
| `/dev`     | Device interfaces                                              | Disks, terminals, pseudo-devices       |

Some of these directories are intentionally only introduced here. For example, `/proc` and `/sys` will become much more useful when you learn process management and system administration.

Likewise, **mounts and physical storage are deliberately covered later in Module 12**. For now, concentrate on navigating the namespace.

### 🧠 3. "Where the data physically lives" is a different question

A common beginner assumption is:

> `/var/log` must mean there is physically a disk called "var".

No.

A Linux path is part of the **filesystem namespace**. The underlying data may live on different storage devices or filesystems, but the user sees a unified directory tree.

That distinction becomes important later when you learn mounts, disks, filesystems, containers, and storage.

For now:

**Path = logical location.**

**Storage device = where the bytes are actually backed.**

Do not mix the two.

### 📍 4. Absolute paths

An **absolute path** starts from `/`.

For example:

`/home/tapan/projects/api/server.js`

It describes the complete route from the filesystem root.

Therefore, it does not depend on your current directory.

If you are in `/tmp`, this still points to the same location.

If you are in `/home/tapan`, it still points to the same location.

If you are somewhere inside a Kubernetes container, the same principle applies to that container's filesystem.

### 🧭 5. Relative paths

A **relative path** starts from your current working directory.

Suppose:

`pwd` gives:

`/home/tapan/projects`

Then:

* `api` means `/home/tapan/projects/api`
* `api/server.js` means `/home/tapan/projects/api/server.js`
* `../notes.txt` means `/home/tapan/notes.txt`

The same relative path can therefore refer to different locations depending on where you currently are.

This is one of the most important ideas in the module.

### 🪜 6. `.`, `..`, and `~`

Three shortcuts appear everywhere.

| Symbol | Meaning                       |
| ------ | ----------------------------- |
| `.`    | Current directory             |
| `..`   | Parent directory              |
| `~`    | Current user's home directory |

Examples:

* `cd .` stays where you are.
* `cd ..` moves one level upward.
* `cd ../..` moves two levels upward.
* `cd ~` moves to your home directory.
* `./script.sh` refers to a script in the current directory.

Suppose you are here:

`/home/tapan/projects/backend`

Then:

```text
.       → /home/tapan/projects/backend
..      → /home/tapan/projects
../..   → /home/tapan
~/      → /home/tapan/
```

Once this clicks, Linux paths stop looking like punctuation soup.

### 🏡 7. `~` is convenient, but it isn't `/home`

If your username is `tapan`:

`~` expands to `/home/tapan`.

But `/` means the filesystem root.

These are completely different:

* `~/projects`
* `/projects`

The first means a directory called `projects` inside your home directory.

The second means a directory called `projects` directly under the filesystem root.

That difference matters.

### 👻 8. Hidden files are usually just names beginning with `.`

Linux does not require a special "hidden file" mechanism for the common Unix convention.

A filename beginning with `.` is normally omitted from ordinary `ls` output.

Examples:

* `.bashrc`
* `.profile`
* `.git`
* `.env`

Use:

`ls -a`

to include them.

This becomes especially important when working with Git repositories and application configuration.

> ⚠️ A hidden file is not necessarily a secret file. `.env` may contain secrets, but the leading `.` itself provides no security.

### 🃏 9. Wildcards are expanded by the shell

The shell supports **pathname expansion**, commonly called **globbing**.

The most useful patterns here are:

| Pattern | Meaning                    | Examples            |
| ------- | -------------------------- | ------------------- |
| `*`     | Zero or more characters    | `*.log`, `report-*` |
| `?`     | Exactly one character      | `file?.txt`         |
| `[abc]` | One character from the set | `file[123].txt`     |
| `[0-9]` | One character in the range | `file[0-9].txt`     |

For example:

`ls *.log`

might become conceptually:

`ls app.log error.log access.log`

before `ls` receives the arguments.

This is important because **the shell performs the expansion**.

The command itself doesn't necessarily understand `*`.

That distinction becomes extremely useful when debugging shell commands.

### ⚠️ 10. Globbing can also surprise you

Suppose a directory contains:

```text
report-1.txt
report-2.txt
report-3.txt
```

Then:

`rm report-*.txt`

can remove all three.

That's convenient.

It's also why you should inspect a pattern before using it with destructive commands.

A good habit is:

```bash
printf '%s\n' report-*.txt
```

If the expansion is what you intended, then perform the operation.

This tiny habit becomes surprisingly valuable on production systems.

### 🗺️ 11. Your filesystem workflow

When working with files, use this mental loop:

```text
┌─────────────────────────────┐
│  1. WHERE AM I?             │
│       ↓                     │
│      pwd                    │
├─────────────────────────────┤
│  2. WHAT IS HERE?           │
│       ↓                     │
│      ls                     │
├─────────────────────────────┤
│  3. WHERE IS THE TARGET?    │
│       ↓                     │
│   absolute / relative path  │
├─────────────────────────────┤
│  4. WHAT WILL HAPPEN?       │
│       ↓                     │
│   inspect → execute → verify│
└─────────────────────────────┘
```

This is much more useful than memorizing isolated commands.

When something goes wrong, go back to step 1.

### 🧱 12. Filesystem operations form a small vocabulary

Most everyday navigation tasks fall into a handful of categories:

```text
NAVIGATE
  cd

INSPECT
  pwd, ls

CREATE
  mkdir, touch

COPY
  cp

MOVE / RENAME
  mv

REMOVE
  rm, rmdir

SEARCH
  find

MATCH GROUPS OF NAMES
  globbing: *, ?, [...]
```

Learn this vocabulary and new commands become easier to place into the bigger picture.

## Command reference

| Command    | Purpose                                                         | Example                      |
| ---------- | --------------------------------------------------------------- | ---------------------------- |
| `pwd`      | Print current working directory                                 | `pwd`                        |
| `cd`       | Change directory                                                | `cd ~/projects`              |
| `cd ..`    | Move to parent                                                  | `cd ..`                      |
| `cd ~`     | Move to home directory                                          | `cd ~`                       |
| `ls`       | List directory contents                                         | `ls`                         |
| `ls -l`    | Long listing                                                    | `ls -l`                      |
| `ls -a`    | Include hidden entries                                          | `ls -a`                      |
| `ls -h`    | Human-readable sizes                                            | `ls -lh`                     |
| `mkdir`    | Create directory                                                | `mkdir logs`                 |
| `mkdir -p` | Create missing parents                                          | `mkdir -p app/config/prod`   |
| `rmdir`    | Remove an empty directory                                       | `rmdir old`                  |
| `touch`    | Create file or update timestamp                                 | `touch app.log`              |
| `cp`       | Copy files                                                      | `cp app.conf app.conf.bak`   |
| `cp -r`    | Recursively copy directories                                    | `cp -r config config.backup` |
| `mv`       | Move or rename                                                  | `mv old.conf new.conf`       |
| `rm`       | Remove files                                                    | `rm old.log`                 |
| `rm -r`    | Recursively remove directories                                  | `rm -r old-build`            |
| `rm -f`    | Force removal of files without prompting for certain conditions | `rm -f old.log`              |
| `rm -rf`   | Recursive + force removal                                       | `rm -rf old-build`           |
| `find`     | Search directory trees                                          | `find . -name "*.log"`       |
| `tree`     | Display a tree-style directory listing                          | `tree`                       |

The GNU Coreutils documentation provides the detailed behavior and options for commands such as `ls`, `cp`, `mv`, `mkdir`, and `rm`.

> 🚨 **Production rule:** `rm -rf` is not a "delete button". It is a chainsaw. Verify the path first.

## Hands-on exercises

### 1. 📍 Establish your position

Run:

```bash
pwd
whoami
ls
```

Answer these questions without looking anything up:

1. What directory are you in?
2. Which user are you?
3. What entries are immediately visible?

<details>
<summary>Answer</summary>

`pwd` tells you your current working directory.

`whoami` tells you the current username.

`ls` lists the visible contents of the current directory.

The important lesson is that before manipulating a filesystem, you should know **who you are and where you are**.

</details>

### 2. 👻 Reveal the invisible

Run:

```bash
ls
ls -a
ls -la
```

Compare the outputs.

Find:

* `.`
* `..`
* at least one hidden file or directory

<details>
<summary>Answer</summary>

`ls` shows ordinary visible entries.

`ls -a` includes hidden entries.

`ls -la` combines `-l` and `-a`, giving a detailed listing including hidden entries.

`.` means the current directory.

`..` means the parent directory.

</details>

### 3. 🏗️ Build a directory tree

Create this structure:

```text
~/filesystem-lab/
├── app/
│   ├── config/
│   └── logs/
├── backups/
└── tmp/
```

Do it with as few commands as reasonably possible.

<details>
<summary>Answer</summary>

One solution is:

```bash
mkdir -p ~/filesystem-lab/app/config ~/filesystem-lab/app/logs ~/filesystem-lab/backups ~/filesystem-lab/tmp
```

The important concept is not the exact command. It is understanding that `mkdir -p` can create missing parent directories.

</details>

### 4. 🧭 Navigate without guessing

Starting from wherever you currently are:

1. Go to `~/filesystem-lab/app`.
2. Move into `config`.
3. Move back to `app` using `..`.
4. Move to `logs` using a relative path.
5. Return directly home using `~`.

Use `pwd` after every move.

<details>
<summary>Answer</summary>

One possible sequence:

```bash
cd ~/filesystem-lab/app
pwd
cd config
pwd
cd ..
pwd
cd logs
pwd
cd ~
pwd
```

Notice how both absolute and relative navigation can be mixed.

</details>

### 5. 📝 Create a fake backend project

Inside `~/filesystem-lab/app`, create:

```text
app/
├── config/
│   ├── development.conf
│   └── production.conf
├── logs/
│   ├── app.log
│   └── error.log
├── src/
│   └── server.js
└── README.md
```

You are allowed to use `mkdir -p` and `touch`.

Then use `find` to verify the structure.

<details>
<summary>Answer</summary>

One solution:

```bash
cd ~/filesystem-lab/app
mkdir -p config logs src
touch config/development.conf config/production.conf
touch logs/app.log logs/error.log
touch src/server.js README.md
find .
```

The exercise is really testing whether you can translate a tree diagram into paths.

</details>

### 6. 🔬 Understand absolute vs relative paths

Assume your current directory is:

`~/filesystem-lab/app`

What does each path refer to?

| Path                       | Your answer |
| -------------------------- | ----------- |
| `config`                   | ?           |
| `./config`                 | ?           |
| `../backups`               | ?           |
| `~/filesystem-lab/backups` | ?           |
| `/tmp`                     | ?           |

<details>
<summary>Answer</summary>

* `config` → `~/filesystem-lab/app/config`
* `./config` → `~/filesystem-lab/app/config`
* `../backups` → `~/filesystem-lab/backups`
* `~/filesystem-lab/backups` → the same backup directory, using your home shortcut
* `/tmp` → the system `/tmp` directory

The important distinction is whether the path starts from your current directory or from a known root/home location.

</details>

### 7. 📦 Copy before changing

Copy `production.conf` into the backup directory and rename the copy:

`production.conf.backup`

Then verify that both files exist.

<details>
<summary>Answer</summary>

From `~/filesystem-lab/app`:

```bash
cp config/production.conf ~/filesystem-lab/backups/production.conf.backup
ls -l config/production.conf ~/filesystem-lab/backups/production.conf.backup
```

`cp` leaves the original untouched.

</details>

### 8. ✏️ Rename without copying

Rename:

`development.conf`

to:

`development.local.conf`

Do not create a duplicate.

<details>
<summary>Answer</summary>

```bash
mv config/development.conf config/development.local.conf
```

`mv` changes the directory entry. When source and destination are on the same filesystem, a rename can often be performed without copying the file's contents.

For this beginner exercise, the important idea is simply:

**`mv` can move or rename.**

</details>

### 9. 🃏 Predict a glob before executing it

Inside `~/filesystem-lab/app`, what should this match?

`logs/*.log`

What about:

`logs/app?.log`

And:

`logs/*.txt`

Write your predictions first.

Then run:

```bash
printf '%s\n' logs/*.log
printf '%s\n' logs/app?.log
printf '%s\n' logs/*.txt
```

<details>
<summary>Answer</summary>

Given the files created earlier:

`logs/*.log` should match:

* `logs/app.log`
* `logs/error.log`

`logs/app?.log` should match nothing because `app.log` has no extra character between `app` and `.log`.

`logs/*.txt` should match nothing because there are no `.txt` files in `logs`.

This is a useful habit: **predict the expansion before using the glob in a real command.**

</details>

### 10. 🔎 Search like a backend developer

Pretend you joined a server and need to find all configuration files under your project.

Search for:

* all `.conf` files
* all `.log` files
* a file specifically named `server.js`

<details>
<summary>Answer</summary>

From `~/filesystem-lab`:

```bash
find . -name "*.conf"
find . -name "*.log"
find . -name "server.js"
```

`find` searches recursively through the directory tree.

This becomes much more useful later when you combine it with conditions such as file type, size, timestamps, and actions.

</details>

### 11. 🧨 Test the safe delete boundary

Try:

`rmdir ~/filesystem-lab/app`

What happens?

<details>
<summary>Answer</summary>

It should fail because `app` is not empty.

`rmdir` only removes empty directories.

That limitation is useful: it gives you a deliberately conservative operation for deleting directories.

</details>

### 12. 🧹 Delete only what you intend

Remove only the temporary directory:

`~/filesystem-lab/tmp`

Then prove that:

* `tmp` is gone
* `app` still exists
* `backups` still exists

<details>
<summary>Answer</summary>

```bash
rm -r ~/filesystem-lab/tmp
ls ~/filesystem-lab
```

You should still see `app` and `backups`.

Notice that the exercise deliberately asks you to verify the surrounding structure. A destructive command should be followed by verification.

</details>

### 13. 🧪 Practice the "inspect first" workflow

Create three files:

```bash
touch ~/filesystem-lab/remove-me-1.txt \
      ~/filesystem-lab/remove-me-2.txt \
      ~/filesystem-lab/keep-me.txt
```

Now you want to remove only the files beginning with `remove-me-`.

Before deleting anything, inspect the expansion.

<details>
<summary>Answer</summary>

First:

```bash
printf '%s\n' ~/filesystem-lab/remove-me-*.txt
```

You should see only:

* `remove-me-1.txt`
* `remove-me-2.txt`

Then:

```bash
rm ~/filesystem-lab/remove-me-*.txt
```

Finally:

```bash
ls ~/filesystem-lab
```

`keep-me.txt` should still exist.

This is the habit we want:

**expand → inspect → execute → verify**

</details>

### 14. 🐳 Think ahead to Docker

Imagine a container contains:

```text
/
├── app/
│   ├── config/
│   ├── logs/
│   └── server.js
├── etc/
└── tmp/
```

You are currently inside `/app/logs`.

Without executing anything, determine:

1. The absolute path to `server.js`.
2. The relative path to `server.js`.
3. The relative path to `/etc`.
4. The command that would take you directly to `/app`.

<details>
<summary>Answer</summary>

1. Absolute path: `/app/server.js`
2. Relative path: `../server.js`
3. Relative path: `../../etc`
4. `cd /app`

This is exactly the sort of path reasoning you'll use inside containers.

</details>

## Independent challenge

### 🚀 The deployment-artifact challenge

You're preparing a fake backend deployment directory.

Build this structure without being given the exact command sequence:

```text
~/backend-deploy/
├── current/
│   ├── app/
│   │   ├── config/
│   │   └── logs/
│   └── release.txt
├── releases/
└── backup/
```

Inside `current/app`, create:

```text
config/
├── app.conf
├── database.conf
└── redis.conf

logs/
├── app.log
├── error.log
└── access.log
```

Then complete all of the following:

1. Create a backup of `app.conf` under `backup/`.
2. Copy every `.log` file into `backup/`.
3. Rename `release.txt` to `release-current.txt`.
4. Use `find` to locate every `.conf` file beneath `backend-deploy`.
5. Use a wildcard to list all log files before copying them.
6. Verify that the backup contains the expected files.
7. Delete one deliberately-created temporary directory using the safest appropriate command.
8. Finish in your home directory.

### Rules

* Do not use absolute paths for every operation. Practice relative paths.
* Do not manually type every `.log` filename when a glob can express the pattern.
* Before every destructive operation, inspect what will be affected.
* If you forget a command option, use `--help` or `man` from Module 01 rather than searching the internet immediately.

<details>
<summary>One hint</summary>

Think in this order:

**create → populate → inspect → copy → rename → search → verify → clean up**

The challenge is deliberately less prescriptive than the exercises. The goal is to see whether you can construct the solution yourself.

</details>

## Common mistakes & troubleshooting

### ❌ "No such file or directory"

First ask:

**Where am I?**

Run:

`pwd`

Then ask:

**Does the path actually exist from here?**

Run:

`ls`

If necessary, use an absolute path to remove ambiguity.

### ❌ `cd` appears to do nothing

That's normal.

`cd` normally prints nothing after a successful directory change.

Use:

`pwd`

to confirm where you ended up.

### ❌ `cd..` doesn't work

The command and its argument need to be separated:

`cd ..`

not:

`cd..`

Whitespace matters in shell syntax.

### ❌ `rmdir` says "Directory not empty"

That's exactly what `rmdir` is designed to do.

It only removes empty directories.

If you genuinely intend to remove the contents as well, recursive deletion is required. Verify the target before doing so.

### ❌ `cp` says "omitting directory"

You're trying to copy a directory without requesting recursive behavior.

For example:

`cp project project-backup`

does not mean "copy the entire directory tree."

For a simple recursive copy:

`cp -r project project-backup`

### ❌ `rm` says "Is a directory"

You attempted to remove a directory with the non-recursive form of `rm`.

Stop and decide whether you actually intend to remove the directory and everything inside it.

Do not reflexively add `-r`.

### ❌ Your wildcard matched more files than expected

Stop.

Do not immediately run the destructive command.

Preview the expansion:

```bash
printf '%s\n' *.log
```

Then reconsider the pattern.

### ❌ Your wildcard matched nothing

If no names match a glob, Bash may pass the pattern itself to the command.

For example:

`ls *.does-not-exist`

may result in an error referring to the literal `*.does-not-exist`.

Check the directory first:

`ls`

### ❌ `~` isn't working inside quotes

The shell performs tilde expansion in specific contexts, and quoting can prevent that expansion.

For example:

`echo ~/projects`

and:

`echo '~/projects'`

do not behave the same way.

You do not need to master shell expansion rules yet, but remember that **quoting changes how the shell interprets characters**. This becomes important in later Bash modules.

### ❌ You accidentally deleted something

Do not keep typing commands and hope it fixes itself.

Stop.

If the data matters, recovery becomes a filesystem/storage problem rather than a shell-navigation problem.

This is why backups, version control, snapshots, and careful destructive-command habits matter in real systems.

## Checkpoint quiz

Try answering without running the commands.

### 1. Path reasoning

You are currently in:

`/home/dev/projects/api`

Where does `../config/app.conf` point?

<details>
<summary>Answer</summary>

`/home/dev/projects/config/app.conf`

`..` moves from `api` to its parent, `projects`.

</details>

### 2. Absolute or relative?

Which of these is an absolute path?

* `./config`
* `../config`
* `/etc/nginx`
* `~/config`

<details>
<summary>Answer</summary>

`/etc/nginx` is the absolute path.

`./config` and `../config` are relative paths.

`~/config` uses the home-directory shortcut and is not an absolute path syntactically because it does not begin with `/`.

</details>

### 3. What does `.` mean?

If you run:

`ls .`

what directory are you listing?

<details>
<summary>Answer</summary>

The current working directory.

</details>

### 4. What does `..` mean?

If you are in:

`/var/log/nginx`

and run:

`cd ..`

where do you end up?

<details>
<summary>Answer</summary>

`/var/log`

</details>

### 5. Predict the glob

Suppose a directory contains:

```text
app.log
error.log
app.txt
application.log
```

Which files does `app?.log` match?

<details>
<summary>Answer</summary>

`app?.log` matches `app.log` only if the `?` can match the required character structure.

Here, it does **not** match `app.log` because `app.log` contains zero characters between `app` and `.log`.

So it matches nothing.

This is a good example of why you should understand the pattern rather than eyeballing it.

</details>

### 6. What does `*.log` match?

Using the same files, what does `*.log` match?

<details>
<summary>Answer</summary>

It matches:

* `app.log`
* `error.log`
* `application.log`

It does not match `app.txt`.

</details>

### 7. Why is this dangerous?

What could happen if you run:

`rm -rf *`

in a directory containing important files?

<details>
<summary>Answer</summary>

The shell expands `*` to the entries in the current directory, and `rm -rf` can recursively delete those entries without the normal safeguards you would want for an accidental operation.

It can destroy a large amount of data quickly.

The important lesson is:

**A wildcard isn't dangerous by itself. A wildcard combined with a destructive command can be.**

</details>

### 8. `rmdir` vs `rm -r`

Why might you prefer `rmdir` when removing an empty directory?

<details>
<summary>Answer</summary>

Because `rmdir` refuses to remove non-empty directories.

That makes it a more conservative operation when you only intend to remove an empty directory.

</details>

### 9. Find the configuration

You are inside:

`~/backend`

How would you search recursively for all `.conf` files?

<details>
<summary>Answer</summary>

`find . -name "*.conf"`

</details>

### 10. Production thinking

You need to remove a directory called `old-release`.

What should you verify before running a recursive delete?

<details>
<summary>Answer</summary>

At minimum:

1. Your current location with `pwd`.
2. That the intended directory exists.
3. The exact target path.
4. What the directory contains with `ls`.
5. That the target is actually safe to remove.

A strong habit is:

**inspect first, delete second.**

</details>

## Further reading & sources

* [Filesystem Hierarchy Standard 3.0](https://refspecs.linuxfoundation.org/FHS_3.0/fhs-3.0.pdf) - the Linux Foundation specification describing the conventional organization of major filesystem directories.
* [GNU Coreutils Manual](https://www.gnu.org/software/coreutils/manual/html_node/index.html) - authoritative documentation for commands such as `ls`, `mkdir`, `cp`, `mv`, and `rm`.
* [GNU Findutils Manual](https://www.gnu.org/software/findutils/manual/) - detailed documentation for `find` and related filesystem-search tools.
* [`hier(7)` Linux manual page](https://man7.org/linux/man-pages/man7/hier.7.html) - a practical reference for the Linux filesystem hierarchy.
* [`find(1)` Linux manual page](https://man7.org/linux/man-pages/man1/find.1.html) - detailed reference for `find` options and search expressions.

## Next

Continue to [03-file-permissions-ownership](../03-file-permissions-ownership/README.md) to learn how Linux decides **who can read, write, or execute a file** and how permissions become one of the most important security boundaries on a server.
