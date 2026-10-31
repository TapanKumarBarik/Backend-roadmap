# Git's Object Model and Mental Model

## Why this matters

Almost everyone who finds Git confusing is confused because they learned
the commands (`add`, `commit`, `push`) as magic incantations without ever
seeing the tiny, simple data model underneath them. That model is genuinely
small — four object types and some pointers — and once you can see it,
every later command stops being memorized and starts being obvious. This
module deliberately front-loads that model so the rest of the track (and
the CI/CD and GitOps tracks later, which live and die on Git) feels like
common sense instead of guesswork.

## Concepts

### Git is a content-addressed key-value store

Underneath everything, Git is a database that stores **objects** and looks
them up by the SHA-1 hash of their content. Give Git some bytes and it
hands you back a 40-character hex ID (a hash); give it that ID later and it
hands the exact bytes back. Because the ID *is* the hash of the content,
identical content always gets the same ID, and any change to the content
produces a completely different ID. This is why Git can tell instantly
whether two files are the same, and why history can't be silently altered:
change one byte anywhere in the past and every ID from that point forward
changes too. Everything else in Git is a thin layer of convenience over
this "store bytes, get a hash back" core.

### There are exactly four object types

That's the whole vocabulary of the Git database:

- A **blob** is the raw contents of a file — just the bytes, no filename,
  no permissions, no history. Two files with identical content anywhere in
  your project are stored as a single blob.
- A **tree** represents a directory. It's a list of entries, each pairing a
  name and mode (like `100644 file` or `40000 subdir`) with the hash of a
  blob (a file) or another tree (a subdirectory). A tree is how filenames
  and directory structure get attached to otherwise-nameless blobs.
- A **commit** is a snapshot plus context. It points at exactly one tree
  (the complete state of your project at that moment), lists zero or more
  **parent** commits (the commit[s] that came before), and records an
  author, a committer, timestamps, and your commit message.
- A **tag** object is a named, annotated pointer to another object (usually
  a commit), used for marking releases. You'll meet these properly in
  module 06.

Notice what a commit does *not* contain: diffs. Git stores whole snapshots
(deduplicated via shared blobs and trees), not "the change since last
time." The diffs you see in `git diff` and `git log -p` are computed on the
fly by comparing two snapshots.

### Commits form a chain (actually, a graph) through parent links

Because each commit records its parent(s), commits link backward into a
chain. Follow the parent pointers and you walk history from newest to
oldest. Most commits have exactly one parent. A **merge commit** has two
(or more) parents — that's literally what "merge" means at the data level:
a commit that ties two lines of history back together. The very first
commit in a repo has zero parents (a "root commit"). This backward-linked
structure is a **directed acyclic graph** (a DAG) — "directed" because
parent links point one way, "acyclic" because you can never loop back to a
commit that descends from you.

### Refs and HEAD: branches are just pointers

Forty-character hashes are unusable by humans, so Git keeps **refs** —
human-named pointers to commits, stored as tiny files under `.git/refs/`.
**A branch is nothing more than a ref: a movable pointer holding one commit
hash.** `main` is a file whose entire content is the hash of the latest
commit on that branch. When you commit, Git creates the new commit object
and then just rewrites that one file to point at it. This is why creating a
branch in Git is instant and cheap — it's writing 41 bytes to a file, not
copying anything.

**HEAD** is a special ref that answers "where am I right now?" Almost always
HEAD is a *symbolic* ref — it doesn't hold a commit hash, it holds the name
of a branch (e.g. "I am `main`"). So the chain is: `HEAD → main → <commit
hash> → tree → blobs`. When HEAD points at a branch and you commit, the
branch moves and HEAD follows it for free. (When HEAD points *directly* at a
commit instead of at a branch, you're in "detached HEAD" state — a source of
much confusion that module 07 defuses completely.)

### The three trees: working tree, index, and repository

Day-to-day Git shuffles content between three areas, and every basic command
is really "move content from one of these to another":

- The **working tree** (or working directory) is the actual files on disk
  you edit with your editor — an ordinary checkout of one commit's snapshot
  that you're free to modify.
- The **index** (also called the **staging area**) is a middle zone: a
  proposed *next* snapshot. `git add` copies the current content of a file
  from the working tree into the index. Nothing is committed yet — you're
  building up what the next commit *will* contain.
- The **repository** (the `.git` directory) is the permanent object
  database — all the blobs, trees, and commits, plus the refs. `git commit`
  takes whatever is currently in the index, writes it as a new tree +
  commit into the repository, and advances the current branch.

The staging area is the piece beginners most often resent and later rely on
most: it's what lets you commit *some* of your changes and not others, and
review exactly what you're about to record before you record it. `git
status` is, at heart, a report on the differences between these three trees.

### Everything lives in `.git`

All of this — the object database, the refs, HEAD, the index — sits inside
one hidden `.git/` directory at the root of your project. Delete that
directory and you have plain files again with no history; copy it and you've
copied the entire history. There's no central server required for any of
this to work: your clone is a complete, standalone repository. Remotes
(module 04) are an optional convenience layered on top, not the source of
truth.

## Command reference

The commands here are mostly *inspection* commands — plumbing that reveals
the model. You won't type most of these daily, but seeing them once makes
the everyday commands make sense.

| Command | What it does | Example |
|---|---|---|
| `git --version` | Prints the installed Git version | `git --version` |
| `git config --global <key> <value>` | Sets a global config value (identity, defaults) | `git config --global user.name "Ada"` |
| `git init` | Creates a new empty repository (a `.git` directory) | `git init` |
| `git hash-object -w <file>` | Stores a file's content as a blob and prints its hash | `git hash-object -w app.txt` |
| `git cat-file -t <hash>` | Prints an object's *type* (blob/tree/commit/tag) | `git cat-file -t 3b18e5` |
| `git cat-file -p <hash>` | Pretty-prints an object's *content* | `git cat-file -p HEAD` |
| `git log --oneline` | Lists commits, one per line, newest first | `git log --oneline` |
| `git cat-file -p HEAD^{tree}` | Shows the tree a commit points at | `git cat-file -p HEAD^{tree}` |

Flag breakdown for `git config --global user.name "Ada"`:

- `config` — read or write configuration.
- `--global` — write to your per-user config file (`~/.gitconfig`) so it
  applies to every repo for your user, instead of only the current repo
  (`--local`, the default) or the whole machine (`--system`).
- `user.name "Ada"` — the key and value; here, the name that will be
  stamped on every commit you author.

Flag breakdown for `git hash-object -w app.txt`:

- `hash-object` — compute the object ID (hash) Git would give this content.
- `-w` — actually *write* the object into the database, not just compute and
  print the hash. Without `-w` it's a dry run.
- `app.txt` — the file whose bytes become a blob.

Flag breakdown for `git cat-file -p HEAD`:

- `cat-file` — inspect an object in the database.
- `-p` — "pretty-print": format the object according to its type instead of
  dumping raw bytes. (`-t` instead prints just the type; `-s` prints its
  size.)
- `HEAD` — the object to inspect; Git resolves the name `HEAD` to a commit
  hash for you.

## Hands-on exercises

These exercises deliberately poke at the raw object database so you *see*
the model before you start using the friendly commands in module 01. Run
them all in your WSL2 Ubuntu terminal.

1. **Confirm Git is installed (and install it if not).**
   ```bash
   git --version
   ```
   If it prints a version (e.g. `git version 2.43.0`), you're set. If you
   get "command not found," install it and re-check:
   ```bash
   sudo apt update && sudo apt install -y git
   git --version
   ```

2. **Set your identity.** Git stamps every commit with a name and email;
   set them once, globally, so you're never nagged:
   ```bash
   git config --global user.name "Your Name"
   git config --global user.email "you@example.com"
   git config --global init.defaultBranch main
   git config --list | grep -E 'user\.|init\.'
   ```
   The `init.defaultBranch main` line makes new repos start on a branch
   named `main` (not the older default `master`). Expect the last command
   to echo the three values back.

3. **Create a fresh repo and look at what `git init` actually made:**
   ```bash
   mkdir -p ~/learn-git/model && cd ~/learn-git/model
   git init
   ls -A
   ls .git
   ```
   Expect a single hidden `.git` directory, and inside it `HEAD`, `config`,
   `refs/`, `objects/`, and more. This `.git` directory *is* the repository.

4. **Read HEAD directly — see that it's just a pointer to a branch:**
   ```bash
   cat .git/HEAD
   ```
   Expect exactly `ref: refs/heads/main`. HEAD isn't a commit; it's a note
   saying "I am currently the `main` branch." (There's no `main` file under
   `refs/heads/` yet — it appears the moment you make your first commit.)

5. **Store a blob by hand and read it back.** This is the raw key-value
   store from Concept 1, with nothing else involved:
   ```bash
   echo "hello object model" > note.txt
   git hash-object -w note.txt
   ```
   Copy the 40-character hash it prints, then ask the database what type and
   content that hash holds (replace `<hash>` with yours):
   ```bash
   git cat-file -t <hash>
   git cat-file -p <hash>
   ```
   Expect `blob` and then `hello object model`. You just wrote to and read
   from Git's object database with no commit anywhere in sight — proof that
   blobs are just content, addressed by hash.

6. **Prove content-addressing.** Make a *second* file with identical content
   and hash it:
   ```bash
   echo "hello object model" > copy.txt
   git hash-object copy.txt
   ```
   Expect the **exact same hash** as exercise 5 — same bytes, same ID, and
   Git would store only one blob for both. Now change one character and hash
   again:
   ```bash
   echo "hello object modeL" > copy.txt
   git hash-object copy.txt
   ```
   Expect a completely different hash. One byte changed everything — that's
   the tamper-evidence property from Concept 1.

7. **Make a real commit and walk the object chain.** Now use the friendly
   commands (previewing module 01) to create an actual commit, then dissect
   it:
   ```bash
   git add note.txt
   git commit -m "First commit"
   git log --oneline
   ```
   Note the short commit hash `git log` prints. Now peel the layers apart:
   ```bash
   git cat-file -t HEAD
   git cat-file -p HEAD
   ```
   Expect `commit`, then a printout showing a `tree <hash>`, an `author`,
   a `committer`, and your message `First commit`. Note there is **no
   `parent` line** — this is the root commit (Concept 3).

8. **Follow the pointer from commit → tree → blob.** Take the tree hash from
   the commit you just printed and expand it:
   ```bash
   git cat-file -p HEAD^{tree}
   ```
   Expect one line naming `note.txt` and its blob hash — and that blob hash
   should match the one you got in exercise 5. You've now traced the full
   chain `HEAD → commit → tree → blob` by hand, exactly as Concept 4
   describes.

9. **Watch a branch move on commit.** See where `main` points, add a second
   commit, and see it move:
   ```bash
   cat .git/refs/heads/main
   echo "a second line" >> note.txt
   git add note.txt
   git commit -m "Second commit"
   cat .git/refs/heads/main
   git log --oneline
   ```
   Expect the hash in `refs/heads/main` to *change* between the two `cat`s —
   the branch is a pointer, and committing rewrote that one small file to
   aim at the new commit (Concept 4). `git log` now shows two commits, and
   the second one has a `parent` line if you inspect it with `git cat-file
   -p HEAD`.

10. **Diagnose and fix: "I broke HEAD." (a controlled scare)** Someone hands
    you a repo where `git status` prints
    `fatal: not a git repository (or any of the parent directories): .git`.
    Reproduce and reason about it:
    ```bash
    mv .git .git-backup
    git status
    ```
    Expect the `fatal: not a git repository` error — because *all* of Git's
    data lives in `.git` (Concept 6), moving it away leaves ordinary files
    with no repo behind them. Your working-tree files are untouched, though.
    Fix it by restoring the directory:
    ```bash
    mv .git-backup .git
    git status
    git log --oneline
    ```
    Expect `git status` to work again and both commits to reappear —
    nothing was lost, because the history was never in the files, it was in
    `.git`.

## Independent challenge

No commands given here — reason it out from this module's concepts.

**Task:** Starting from an empty new repository, create two files with
*identical* content but different names, commit them together in one commit,
and then, using only the object-inspection commands from this module, prove
three things about what Git actually stored: (a) that the commit points at a
single tree, (b) that that tree lists both filenames, and (c) that despite
being two files, they resolve to the *same single blob* in the object
database — i.e. Git deduplicated the content. Explain in a sentence why that
deduplication is a direct consequence of content-addressing rather than a
special optimization Git had to be told to do.

<details>
<summary>Stuck? One hint</summary>

`git cat-file -p HEAD^{tree}` lists the tree's entries with a blob hash next
to each filename — compare the two hashes in that listing to each other, and
remember from exercise 6 that identical bytes always hash to the same ID.

</details>

## Common mistakes & troubleshooting

- **Thinking commits store diffs.** They store full snapshots (trees of
  blobs), deduplicated by hash. Diffs are computed when you ask for them,
  not stored. This trips people up when reasoning about rebases and cherry-
  picks later — keep "snapshot, not patch" in mind.
- **Believing a branch is a container of commits.** A branch is a single
  movable pointer to *one* commit; the "commits on the branch" are just
  whatever you reach by following parent links backward from it. Two
  branches can share all their history and differ by one commit.
- **Confusing HEAD with a branch.** HEAD is usually a pointer *to* a branch
  ("I am on `main`"), not a branch itself. Later, "detached HEAD" means HEAD
  points straight at a commit with no branch in between — unusual, not
  broken (module 07).
- **Deleting `.git` to "start over," then being surprised the history is
  gone.** All history lives in `.git`. Removing it doesn't reset your repo —
  it destroys the repository entirely, leaving only the current files.
- **Assuming Git needs a server.** Every clone is a full, independent
  repository with all history. Remotes are optional collaboration plumbing,
  covered in module 04 — Git works completely offline until then.

## Checkpoint quiz

Write down your answer to each question before expanding it — checking without attempting first is the single easiest way to fool yourself into thinking you've learned this.

<details>
<summary>Show questions</summary>

1. What are Git's four object types, and what does each one represent?
2. Why do two files with identical content anywhere in a repository share a
   single blob, and what does that tell you about how Git addresses objects?
3. A commit points at what, exactly — a diff or a full snapshot? What links
   it to the history before it?
4. What is a branch, at the level of the actual data stored in `.git`?
5. What is HEAD normally pointing at, and what does the chain from HEAD down
   to a file's bytes look like?
6. Name the three "trees" content moves between, and say which command moves
   content into the middle one.
7. If you `mv .git /tmp/somewhere` and then run `git status`, what happens
   and why — and are your files lost?

</details>

<details>
<summary>Show answers</summary>

1. **Blob** = a file's raw content (bytes only, no name). **Tree** = a
   directory: a list of names+modes mapped to blob or tree hashes.
   **Commit** = a snapshot (one tree) plus parent link(s), author,
   committer, timestamps, and message. **Tag** = a named annotated pointer
   to another object (usually a commit).
2. Because Git addresses objects by the hash of their content — identical
   bytes produce an identical hash, so they're literally the same object in
   the database. It tells you Git is a content-addressed store; dedup is a
   free consequence, not a feature bolted on.
3. A commit points at a full snapshot — one tree representing the entire
   project state at that moment (not a diff). It's linked to history by its
   **parent** commit hash(es); a merge commit has two or more parents, a
   root commit has none.
4. A branch is a single movable ref — a small file under `.git/refs/heads/`
   whose entire content is one commit hash. Committing rewrites that file to
   point at the new commit.
5. HEAD normally points at a branch (a symbolic ref like `ref:
   refs/heads/main`). The full chain is `HEAD → branch → commit → tree →
   blob(s)`.
6. The **working tree** (files on disk), the **index/staging area**
   (proposed next snapshot), and the **repository** (`.git` object
   database). `git add` moves content from the working tree into the index
   (the middle one).
7. `git status` fails with `fatal: not a git repository`, because all of
   Git's data lives in `.git` and you moved it away. Your working-tree files
   are untouched; moving `.git` back restores the full repository and
   history.

</details>

## Next

Continue to [01-basic-local-workflow](../01-basic-local-workflow/README.md)
to turn the model you just dissected into the everyday
edit → stage → commit loop you'll use constantly.
