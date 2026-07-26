# The Basic Local Workflow

## Why this matters

The everyday Git loop — edit files, stage the changes you want, commit them
with a message, inspect what happened — is the thing you'll do dozens of
times a day for the rest of your career. Doing it *well* (small, focused
commits with clear messages, a clean `git status`, a `.gitignore` that keeps
junk out of history) is the difference between a history you can read a year
later and an unreadable mess. Because you already know the object model from
module 00, every command here is just "which of the three trees am I moving
content between," which makes the whole loop click instead of feeling like
ritual.

## Concepts

### The core loop: edit, stage, commit

The daily cycle has exactly three moves, mapping onto the three trees from
module 00:

1. **Edit** files in the working tree with your editor.
2. **Stage** the changes you want in the *next* commit with `git add`, which
   copies their current content into the index.
3. **Commit** with `git commit`, which snapshots the index into a new commit
   object and advances the current branch.

The staging step is what lets you commit a *subset* of your changes: you can
edit five files but stage and commit only two, leaving the rest for a
separate, logically-distinct commit. Beginners often skip understanding this
and treat `add` as a nuisance step; it's actually the feature that makes
clean history possible.

### `git status` is your constant compass

`git status` reports the difference between the three trees, in three
buckets: **staged** changes (in the index, ready to commit — "Changes to be
committed"), **unstaged** changes (modified in the working tree but not yet
`add`ed — "Changes not staged for commit"), and **untracked** files (present
on disk but Git has never been told about them). Run it constantly — before
staging, after staging, before committing. It also tells you which branch
you're on and whether you have anything to commit at all. `git status -s`
gives a compact two-column version once the long form gets tedious.

### `git add` stages a *snapshot*, not a file

A subtle but crucial point: `git add file` stages the content of that file
*as it is right now*. If you `add` a file, then edit it again before
committing, the *later* edit is unstaged — the commit will contain the
version you added, not the newer one on disk. `git status` will helpfully
show the file in *both* the staged and unstaged sections when this happens.
This follows directly from module 00: `add` copied a specific set of bytes
into the index; editing the working tree afterward doesn't retroactively
change what's in the index. `git add -p` (patch mode) takes this further,
letting you stage individual *hunks* within a file.

### A commit needs a message, and the message matters

Every commit carries a message. The widely-followed convention is a short
**summary line** (roughly 50 characters, written in the imperative — "Add
login form," not "Added" or "Adds"), then a blank line, then an optional
longer body explaining *why* the change was made (the *what* is visible in
the diff; the *why* is not). `git commit -m "..."` sets just the summary;
running `git commit` with no `-m` opens your editor for a full message. Good
messages are not busywork — they're what makes `git log` and `git blame`
useful to future-you and your teammates, and later they feed straight into
release notes and CI.

### `git diff` shows you exactly what changed, and where

Because Git stores snapshots, `diff` *computes* the change between two of
them on demand:

- `git diff` (no args) — working tree vs. index: "what have I changed but
  not yet staged?"
- `git diff --staged` (a.k.a. `--cached`) — index vs. the last commit:
  "what will this commit actually contain?"
- `git diff HEAD` — working tree vs. the last commit: "everything I've
  changed since the last commit, staged or not."

Getting in the habit of running `git diff --staged` right before every
commit — reading exactly what you're about to record — catches an enormous
share of "oops, I committed a debug print / a secret / a whole unrelated
change" mistakes.

### `git log` reads history, and formatting it is a superpower

`git log` walks the parent chain backward from HEAD, printing each commit.
The raw form is verbose; the forms you'll actually use compress it:
`git log --oneline` gives one line per commit (short hash + summary),
`--graph` draws the branch/merge structure as ASCII art, and `--stat` adds a
per-commit list of files changed. You'll combine these constantly, e.g.
`git log --oneline --graph --all` to see the whole repo's shape at a glance.

### `.gitignore` keeps generated and secret files out of history

Not everything in your working directory belongs in Git: build outputs,
dependency folders (`node_modules/`), logs, editor swap files, and — very
importantly — secrets like `.env` files. A `.gitignore` file lists patterns
of paths Git should treat as if they weren't there: they won't show up as
untracked in `git status` and won't be accidentally `add`ed. Patterns are
globs (`*.log`), can be anchored to a directory (`/dist`), and a trailing
slash means "directory" (`node_modules/`). One critical caveat covered in
the exercises: `.gitignore` only stops Git from tracking files it *isn't
already tracking* — a file already committed keeps being tracked until you
explicitly remove it from the index.

## Command reference

| Command | What it does | Example |
|---|---|---|
| `git init` | Creates a new repository in the current directory | `git init` |
| `git status` | Shows staged, unstaged, and untracked changes and current branch | `git status` |
| `git status -s` | Compact two-column status | `git status -s` |
| `git add <path>` | Stages a file's current content into the index | `git add app.py` |
| `git add -A` | Stages all changes (new, modified, deleted) in the whole tree | `git add -A` |
| `git add -p` | Interactively stage individual hunks within files | `git add -p` |
| `git restore --staged <path>` | Unstages a file (index → back to matching HEAD), keeping working-tree edits | `git restore --staged app.py` |
| `git restore <path>` | Discards unstaged working-tree changes to a file | `git restore app.py` |
| `git commit -m "msg"` | Commits the index with a one-line message | `git commit -m "Add health endpoint"` |
| `git commit` | Commits, opening your editor for a full message | `git commit` |
| `git commit -am "msg"` | Stages all *tracked* modified files, then commits | `git commit -am "Fix typo"` |
| `git diff` | Working tree vs. index (unstaged changes) | `git diff` |
| `git diff --staged` | Index vs. last commit (what the commit will contain) | `git diff --staged` |
| `git log --oneline` | One line per commit, newest first | `git log --oneline` |
| `git log --oneline --graph --all` | Compact history with branch/merge shape, all refs | `git log --oneline --graph --all` |
| `git show <commit>` | Shows a commit's message and full diff | `git show HEAD` |
| `git rm --cached <path>` | Stops tracking a file (removes from index) without deleting it on disk | `git rm --cached .env` |

Flag breakdown for `git add -A`:

- `add` — stage content into the index.
- `-A` (`--all`) — stage *every* change across the whole working tree: new
  files, modifications, *and* deletions. (Plain `git add .` stages the
  current directory and below; `-A` is repo-wide and also records removals.)

Flag breakdown for `git commit -am "Fix typo"`:

- `-a` — automatically stage all **tracked** files that were modified or
  deleted before committing. It does **not** pick up brand-new untracked
  files — those still need an explicit `git add`.
- `-m "Fix typo"` — supply the commit summary inline instead of opening an
  editor.

Flag breakdown for `git rm --cached .env`:

- `rm` — remove a path from Git's tracking.
- `--cached` — remove it from the **index only**, leaving the actual file on
  disk untouched. (Without `--cached`, `git rm` deletes the working-tree file
  too.) This is exactly how you un-track a file you shouldn't have committed.

Flag breakdown for `git log --oneline --graph --all`:

- `--oneline` — one compact line per commit (short hash + summary).
- `--graph` — draw the commit DAG as ASCII art down the left, showing
  branches and merges.
- `--all` — show history reachable from *all* refs (every branch/tag), not
  just the current HEAD.

## Hands-on exercises

Run these in your WSL2 Ubuntu terminal. They build one small project across
the whole module.

1. **Start a clean project:**
   ```bash
   mkdir -p ~/learn-git/workflow && cd ~/learn-git/workflow
   git init
   git status
   ```
   Expect "On branch main" and "No commits yet" with nothing to commit.

2. **Create a file and watch it appear as untracked:**
   ```bash
   echo "# My Project" > README.md
   git status
   ```
   Expect `README.md` listed under "Untracked files" — Git sees it but isn't
   tracking it yet.

3. **Stage it, and watch it move buckets:**
   ```bash
   git add README.md
   git status
   ```
   Expect `README.md` now under "Changes to be committed." It moved from the
   working tree into the index (module 00's middle tree).

4. **Commit, then confirm a clean tree:**
   ```bash
   git commit -m "Add project README"
   git status
   git log --oneline
   ```
   Expect "nothing to commit, working tree clean" and one commit in the log.

5. **See staging select a subset.** Create two files, change the README too,
   but commit only one of the new files:
   ```bash
   echo "print('app')" > app.py
   echo "TODO: notes" > notes.txt
   echo "More detail." >> README.md
   git add app.py
   git status
   ```
   Expect `app.py` staged, but `notes.txt` untracked *and* `README.md`
   modified-but-unstaged. Now commit just what's staged and confirm:
   ```bash
   git commit -m "Add app.py"
   git status
   ```
   Expect the commit to contain only `app.py`; `notes.txt` and the README
   change are still pending. That selectivity is the staging area's whole
   point.

6. **Prove `add` stages a snapshot, not a live link.** Stage the README,
   then edit it *again* before committing:
   ```bash
   git add README.md
   echo "Edited AFTER staging." >> README.md
   git status -s
   ```
   Expect the compact status to show `README.md` in *both* columns — staged
   (the version you added) and modified (the newer edit on disk). Read the
   two diffs to see the split precisely:
   ```bash
   git diff --staged
   git diff
   ```
   `--staged` shows the "More detail." line (what you added), plain `diff`
   shows the "Edited AFTER staging." line (what you haven't). This is Concept
   3 made concrete.

7. **Commit everything and read the resulting commit:**
   ```bash
   git add -A
   git commit -m "Finish README and add notes"
   git show HEAD
   ```
   Expect `git show` to print the message plus the full diff of that commit
   (both the README line and the new `notes.txt`).

8. **Write a proper multi-line commit message.** Make a change and commit
   without `-m` so your editor opens:
   ```bash
   echo "def health(): return 'ok'" >> app.py
   git add app.py
   git commit
   ```
   In the editor, write a summary line, a blank line, then a body — e.g.:
   ```
   Add health check function

   Downstream monitoring needs a cheap endpoint to poll, so add a
   trivial health() that always returns 'ok'.
   ```
   Save and close. Verify with `git log --oneline` and then `git show HEAD`
   that the summary and body are both recorded. (If your editor is unfamiliar,
   `git config --global core.editor nano` switches Git to `nano`.)

9. **Add a `.gitignore` and confirm it silences noise:**
   ```bash
   echo "secret-token-123" > .env
   mkdir dist && echo "built output" > dist/bundle.js
   git status
   ```
   Expect `.env` and `dist/` shown as untracked — exactly the junk/secrets
   you don't want committed. Now ignore them:
   ```bash
   cat > .gitignore <<'EOF'
   # Secrets
   .env
   # Build output
   /dist/
   EOF
   git status
   ```
   Expect `.env` and `dist/` to vanish from the untracked list, replaced by
   just `.gitignore` itself (which you *do* want to commit). Commit it:
   ```bash
   git add .gitignore && git commit -m "Add .gitignore for secrets and build output"
   ```

10. **Diagnose and fix: "I committed a secret before adding it to
    `.gitignore`."** This is one of the most common real mistakes, and
    `.gitignore` alone does *not* fix it. Reproduce it deliberately:
    ```bash
    echo "API_KEY=supersecret" > config.env
    git add config.env
    git commit -m "Add config"
    echo "config.env" >> .gitignore
    git status
    ```
    Expect `git status` to show nothing about `config.env` — but it's still
    tracked and still in history, because `.gitignore` only affects files Git
    *isn't already tracking* (Concept 6). Prove it's tracked:
    ```bash
    git ls-files | grep config.env
    ```
    Expect it to print `config.env`. Now untrack it (keeping the local file)
    and commit the removal:
    ```bash
    git rm --cached config.env
    git commit -m "Stop tracking config.env (moved to .gitignore)"
    git ls-files | grep config.env || echo "no longer tracked"
    ```
    Expect "no longer tracked," and the file still present on disk (`ls
    config.env`). Note the real-world caveat: the secret still exists in the
    *earlier* commit's history — for a genuinely leaked credential you'd also
    rotate the secret and, if needed, scrub history (module 07). Untracking
    only stops it going forward.

11. **Read your history like a pro:**
    ```bash
    git log --oneline --graph --all
    git log --stat -1
    ```
    Expect a compact list of every commit you've made, and a per-file change
    summary for the most recent one. This is the view you'll live in.

## Independent challenge

No commands given — use what you built above plus the object model from
module 00.

**Task:** Starting a brand-new repository, make a single working session in
which you touch three different files but produce *two* separate, logically
clean commits — one commit containing only the changes to two of the files,
and a second commit containing only the third file's changes — without ever
undoing or re-editing anything. Then, using only `git diff` in its various
forms, demonstrate *before* each commit that exactly the intended content is
staged and nothing else. Finally, write the second commit's message with a
real body explaining *why* the change exists, and confirm with `git show`
that the body was recorded. This exercises the staging area (this module) and
the snapshot-not-diff nature of commits (module 00) together.

<details>
<summary>Stuck? One hint</summary>

The key is to stage selectively — `git add` only the two files for the first
commit, run `git diff --staged` to confirm just those are in the index,
commit, and only *then* `git add` the third file for the second commit.
`git add -p` lets you go even finer if two changes live in one file.

</details>

## Common mistakes & troubleshooting

- **`git add`-ing then editing again, and committing the stale version.**
  If `git status` shows a file as *both* staged and modified, `git add` it
  once more (or `git commit -a`) so the newer edit is included. Always glance
  at `git diff --staged` before committing.
- **Using `git commit -am` and wondering why a new file wasn't included.**
  `-a` only stages *already-tracked* files. Brand-new (untracked) files need
  an explicit `git add` first — `-a` will never pick them up.
- **Adding a file to `.gitignore` after it's already committed and expecting
  it to disappear.** `.gitignore` only ignores untracked files. Use `git rm
  --cached <file>` to stop tracking something already in history.
- **Committing secrets.** A `.env` or key committed once lives in history
  even after you delete or `.gitignore` it. Add secret patterns to
  `.gitignore` *before* the first commit, and if one leaks, rotate it — don't
  assume removal is enough (module 07 covers history scrubbing).
- **Vague commit messages ("update", "fix", "wip").** They make history
  useless. Write an imperative summary that says what the commit does; add a
  body for the *why* when it isn't obvious.
- **One giant commit for a whole day's work.** Prefer small, focused commits
  — they're easier to review, revert, and understand later. The staging area
  exists precisely to let you split work into clean commits.

## Checkpoint quiz

Write down your answer to each question before expanding it — checking without attempting first is the single easiest way to fool yourself into thinking you've learned this.

<details>
<summary>Show questions</summary>

1. Name the three moves of the daily loop and which of module 00's three
   trees each one touches.
2. In `git status`, what's the difference between "Changes to be committed,"
   "Changes not staged for commit," and "Untracked files"?
3. You run `git add report.txt`, then edit `report.txt` again, then `git
   commit`. Which version of the file ends up in the commit, and how would
   `git status` have warned you?
4. What's the difference between `git diff`, `git diff --staged`, and `git
   diff HEAD`?
5. What does `git commit -am "..."` do, and what class of file does it
   silently *not* include?
6. You committed `secrets.env` yesterday and just added it to `.gitignore`.
   Is it now out of your repository? What command actually stops it being
   tracked, and what does that command leave alone?
7. What makes a good commit message, structurally, and why does the body
   matter more than the summary for future readers?

</details>

<details>
<summary>Show answers</summary>

1. **Edit** the working tree, **stage** into the index with `git add`,
   **commit** the index into the repository with `git commit`. Working tree
   → index → repository.
2. "Changes to be committed" = staged (in the index, will be in the next
   commit). "Changes not staged for commit" = tracked files modified in the
   working tree but not yet `add`ed. "Untracked files" = files on disk Git
   has never tracked.
3. The version you `add`ed (the earlier one) ends up committed — `add`
   snapshots content at that moment; the later edit stays unstaged. `git
   status` warns by listing the file in *both* the staged and the unstaged
   sections.
4. `git diff` = working tree vs. index (unstaged changes). `git diff
   --staged` = index vs. last commit (what the commit will contain). `git
   diff HEAD` = working tree vs. last commit (all changes, staged or not).
5. It stages all modified/deleted **tracked** files and then commits with
   the given message. It does **not** include untracked (brand-new) files —
   those need an explicit `git add`.
6. No — it's still tracked and still in history; `.gitignore` only affects
   untracked files. `git rm --cached secrets.env` stops tracking it (removes
   it from the index) while leaving the actual file on disk. The old commit
   still contains it, so a real secret must also be rotated.
7. A short imperative summary (~50 chars), a blank line, then an optional
   body. The body matters more long-term because the diff already shows
   *what* changed — the body is the only place that records *why*, which is
   what future readers actually need.

</details>

## Next

Continue to [02-branching-and-merging](../02-branching-and-merging/README.md)
to stop working on one line of history and start juggling several — then tie
them back together, conflicts and all.
