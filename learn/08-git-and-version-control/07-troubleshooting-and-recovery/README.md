# Troubleshooting and Recovery

## Why this matters

The single biggest difference between someone who's *nervous* about Git and
someone who's *fluent* is this: the fluent person knows that almost nothing
in Git is truly unrecoverable, and knows the handful of commands that get
them out of trouble. A "lost" commit after a bad `reset --hard`, a merge or
rebase that went sideways, a bad commit pushed to a shared branch, a secret
committed by accident, the alarming "detached HEAD" message — every one of
these has a calm, standard fix. This module turns the fear off. Because the
CI/CD and GitOps tracks make Git the source of truth for real infrastructure,
being able to recover confidently isn't optional polish — it's an operational
skill.

## Concepts

### The reflog is the master key

Recall from module 03: every time HEAD (or any branch) moves, Git appends to
the **reflog** — a local journal of every position your refs have held,
kept ~90 days. Because commits Git "removed" from a branch are still in the
object database and still named in the reflog, `git reflog` is the first
thing to reach for whenever something seems lost. The recovery pattern is
almost always the same two steps: run `git reflog` to find the hash of the
good state, then point a branch back at it (`git reset --hard <hash>`, or
`git branch rescue <hash>` to be extra safe). Internalize this and most "I
destroyed my work" moments become 30-second fixes.

### Undoing changes: reset vs. revert vs. restore

Three commands "undo," and confusing them causes half of all Git accidents:

- **`git restore`** operates on *files* in the working tree/index — discard
  unstaged edits (`git restore file`) or unstage (`git restore --staged
  file`). It doesn't touch commits.
- **`git reset`** moves the *current branch pointer* to another commit
  (`--soft` keeps changes staged, `--mixed`/default unstages them, `--hard`
  also discards working-tree changes). It **rewrites** where the branch
  points — great locally, dangerous on shared history.
- **`git revert`** creates a *new* commit that undoes a previous commit's
  changes, leaving history intact. Because it *adds* rather than rewrites, it
  is the **safe** way to undo something that's already been pushed/shared —
  no golden-rule violation.

The rule of thumb: to undo *unshared* local work, `reset`; to undo *shared*
(pushed) work, `revert`.

### Undoing a bad merge or rebase

- A **bad merge** you haven't pushed: `git reset --hard <pre-merge-commit>`
  (find it in the reflog, or use `ORIG_HEAD`, which Git sets to the pre-merge
  position). A merge you *have* pushed: `git revert -m 1 <merge-commit>` — the
  `-m 1` tells revert which parent is the "mainline" to keep.
- A **bad rebase**: because a rebase moved your branch, the pre-rebase tip is
  in the reflog (and `ORIG_HEAD`). `git reset --hard ORIG_HEAD` (or the reflog
  hash) puts the branch back exactly as it was before the rebase started. If
  you're still mid-rebase, `git rebase --abort` is even simpler.

The theme: reset-to-a-reflog-hash for unshared mistakes, revert for shared
ones. `ORIG_HEAD` is a convenient shortcut Git sets before any "dangerous"
operation (merge, rebase, reset) so you can jump back one step.

### Fixing a bad push

You pushed something wrong to a remote. Two very different situations:

- **The branch is yours alone** (a feature/PR branch): fix locally (reset,
  amend, rebase) and `git push --force-with-lease`. Safe, because no one else
  builds on it.
- **The branch is shared** (`main`, `develop`): do **not** force-push and
  rewrite it — that's the golden-rule violation that wrecks everyone's clone
  (modules 03, 06). Instead, `git revert` the bad commit(s) and push the
  revert as a *new* commit. History stays intact and everyone just pulls a
  normal new commit that undoes the mistake.

Choosing correctly here is the mark of someone who understands shared vs.
unshared history; the wrong choice on a shared branch turns a small mistake
into a team-wide incident.

### Un-committing a file (including a committed secret)

Two sub-cases, both common:

- **Wrong file in the *last* commit, not yet pushed:** `git restore --staged`
  it and `git commit --amend`, or `git reset --soft HEAD~1` to redo the
  commit without it.
- **A secret committed and pushed:** removing it in a *new* commit stops it
  going forward but it *remains in history* — anyone can check out the old
  commit and read it. For a real leaked credential the first, non-negotiable
  step is to **rotate the secret** (assume it's compromised). To actually
  scrub it from *all* history you must rewrite every commit that contained it
  (`git filter-repo`, or the older BFG tool) and force-push — a heavy,
  coordinate-with-everyone operation. The lesson from module 01 stands:
  prevention (`.gitignore` before the first commit) beats cure enormously.

### Detached HEAD: not broken, just unusual

When you `git checkout <commit-hash>` (or a tag), HEAD points **directly at a
commit** instead of at a branch — "detached HEAD." This isn't an error;
you're just viewing/working at a specific commit with no branch tracking your
new commits. The danger is only this: any commits you make in detached HEAD
are reachable *only* by the (moving) HEAD, so when you switch away, they
become unreferenced and eventually garbage-collected. The fixes are simple:

- If you only wanted to *look*: `git switch main` (or any branch) to
  re-attach. Nothing lost, since you made no commits.
- If you *made* commits you want to keep: create a branch to anchor them
  *before* switching — `git switch -c my-work` (or `git branch my-work`) —
  which turns the detached commits into a normal branch.

And if you already switched away and lost detached commits — reflog, as
always, has them.

### Cleaning up: untracked files, stash, and a general recovery order

Two more everyday tools: `git clean` removes untracked files (use `-n` to
preview first — it's destructive to files Git isn't tracking, and those
*aren't* in any commit, so they're genuinely gone). `git stash` shelves your
uncommitted changes so you can switch context, restoring them later with `git
stash pop`. When something's wrong, a good general order is: **stop and read
the error and `git status`** (Git usually tells you the fix), **`git reflog`**
if commits seem lost, **`git reset`/`git revert`/`git restore`** as
appropriate to the shared/unshared distinction, and `--abort` if you're
mid-merge/rebase. Panic-typing more commands is what turns a recoverable
mess into a worse one.

## Command reference

| Command | What it does | Example |
|---|---|---|
| `git reflog` | Shows every recent position of HEAD — the recovery starting point | `git reflog` |
| `git reset --hard <hash>` | Moves current branch to `<hash>`, resets working tree (destructive locally) | `git reset --hard ORIG_HEAD` |
| `git reset --soft HEAD~1` | Un-commits the last commit, keeping its changes staged | `git reset --soft HEAD~1` |
| `git revert <commit>` | Creates a new commit that undoes `<commit>` (safe on shared history) | `git revert 9a1b2c3` |
| `git revert -m 1 <merge>` | Reverts a merge commit, keeping parent 1 as mainline | `git revert -m 1 abc1234` |
| `git restore <file>` | Discards unstaged working-tree changes to a file | `git restore app.py` |
| `git restore --staged <file>` | Unstages a file (keeps working-tree changes) | `git restore --staged app.py` |
| `git switch -c <name>` | Creates a branch — used to rescue detached-HEAD commits | `git switch -c rescue` |
| `git branch <name> <hash>` | Creates a branch pointing at a specific (e.g. recovered) commit | `git branch rescue 9a1b2c3` |
| `git stash` | Shelves uncommitted changes; restore with `git stash pop` | `git stash` |
| `git clean -n` / `git clean -fd` | Preview / remove untracked files (and dirs with `-d`) | `git clean -n` |
| `git fsck --lost-found` | Finds dangling commits not in any reflog (last resort) | `git fsck --lost-found` |

Flag breakdown for `git revert -m 1 abc1234`:

- `revert` — create a new commit that reverses a prior commit's changes,
  without rewriting history.
- `-m 1` — for a *merge* commit (which has two parents), specify which parent
  is the "mainline" to keep. `-m 1` means "keep the first parent's line
  (usually `main`) and undo what the merge brought in from the second." Merge
  commits *require* `-m` because Git can't otherwise know which side to
  revert to.
- `abc1234` — the merge commit to revert.

Flag breakdown for `git reset --soft HEAD~1`:

- `reset` — move the current branch pointer.
- `--soft` — move *only* the pointer; leave the index and working tree
  untouched, so the undone commit's changes stay staged, ready to recommit.
- `HEAD~1` — one commit back; so this "un-commits" the latest commit while
  preserving its content.

Flag breakdown for `git clean -fd` (and why `-n` first):

- `clean` — remove untracked files (files Git isn't tracking, hence *not* in
  any commit — deletion is permanent).
- `-n` (`--dry-run`) — *preview* what would be deleted without deleting.
  Always run this first.
- `-f` (`--force`) — actually delete (Git requires `-f` as a safety
  confirmation).
- `-d` — also remove untracked *directories*, not just files.

## Hands-on exercises

Run these in your WSL2 Ubuntu terminal. Each is a self-contained recovery
drill — do them slowly and read the output.

1. **Set up a repo with a few commits to break and fix:**
   ```bash
   mkdir -p ~/learn-git/recovery && cd ~/learn-git/recovery
   git init
   for n in 1 2 3 4; do echo "line $n" >> file.txt; git add file.txt; git commit -m "Add line $n"; done
   git log --oneline
   ```
   Expect four commits.

2. **Recover from a bad `reset --hard` (the core drill).** Destroy two
   commits, then bring them back:
   ```bash
   git reset --hard HEAD~2
   git log --oneline
   ```
   Expect only two commits left — the last two look gone. Recover:
   ```bash
   git reflog
   git reset --hard HEAD@{1}
   git log --oneline
   cat file.txt
   ```
   Expect all four commits back and `file.txt` whole. `HEAD@{1}` was the
   position just before the reset (Concept 1). This is the pattern you'll
   reuse for almost every "lost work" situation.

3. **Undo the *last commit* but keep its changes (redo it differently):**
   ```bash
   git reset --soft HEAD~1
   git status
   ```
   Expect the fourth commit undone but its change still *staged* (Concept 2).
   Recommit it with a better message and confirm:
   ```bash
   git commit -m "Add line 4 (reworded)"
   git log --oneline
   ```

4. **Undo a pushed commit the *safe* way with `revert`.** Simulate a bad
   commit that's "already shared," then revert instead of resetting:
   ```bash
   echo "OOPS bad change" >> file.txt
   git commit -am "Bad change that shipped"
   git revert HEAD --no-edit
   git log --oneline
   cat file.txt
   ```
   Expect *two* new entries in the log — the bad commit *and* a "Revert..."
   commit — and `file.txt` no longer containing the OOPS line. History was
   preserved, not rewritten (Concept 2), which is exactly why this is safe on
   shared branches.

5. **Undo a bad merge you haven't pushed, using `ORIG_HEAD`:**
   ```bash
   git switch -c sidebranch
   echo "side work" > side.txt && git add side.txt && git commit -m "Side work"
   git switch main
   git merge sidebranch --no-ff -m "Merge sidebranch"
   git log --oneline
   ```
   Now pretend the merge was a mistake and rewind it:
   ```bash
   git reset --hard ORIG_HEAD
   git log --oneline
   ls
   ```
   Expect the merge undone and `side.txt` gone from `main` (Concept 3). Git
   set `ORIG_HEAD` to the pre-merge tip automatically.

6. **Undo a bad rebase with the reflog.** Create commits, rebase them, then
   restore the pre-rebase state:
   ```bash
   git switch -c rebase-victim
   echo "r1" >> r.txt && git add r.txt && git commit -m "r1"
   echo "r2" >> r.txt && git commit -am "r2"
   git rebase -i HEAD~2   # in the editor, squash the second into the first, save
   git log --oneline
   git reset --hard ORIG_HEAD
   git log --oneline
   ```
   Expect the squashed history after the rebase, then the *original two
   commits* restored after `reset --hard ORIG_HEAD` (Concept 3). The reflog
   would show the same pre-rebase hash if you preferred `HEAD@{n}`.

7. **Diagnose and fix: detached HEAD.** Enter it deliberately, make a commit,
   and rescue it:
   ```bash
   git switch main
   git checkout HEAD~2
   ```
   Expect Git's "You are in 'detached HEAD' state" message (Concept 5). Make a
   commit here:
   ```bash
   echo "work done while detached" > detached.txt
   git add detached.txt && git commit -m "Detached work"
   git log --oneline
   ```
   This commit is anchored only by HEAD. *Before* switching away, rescue it
   into a branch:
   ```bash
   git switch -c rescued-work
   git log --oneline
   ```
   Expect `rescued-work` now containing the detached commit — safe. Confirm
   re-attaching to a branch is what "fixes" detached HEAD:
   ```bash
   git switch main
   git status
   ```
   Expect a normal "On branch main" — no longer detached.

8. **Recover a detached commit you *forgot* to rescue (reflog to the
   rescue).** Re-enter detached HEAD, commit, then switch away *without*
   making a branch:
   ```bash
   git checkout HEAD~1
   echo "orphan" > orphan.txt && git add orphan.txt && git commit -m "Orphaned commit"
   git switch main    # Git warns you're leaving a commit behind
   git log --oneline   # the orphan is not here
   ```
   The orphaned commit isn't on any branch. Find and rescue it:
   ```bash
   git reflog
   git branch recovered-orphan HEAD@{1}
   git log --oneline recovered-orphan
   ```
   Expect the orphaned commit recovered onto a branch (Concept 1). Even
   "leaving behind" a detached commit is recoverable while it's in the reflog.

9. **Un-commit a file that shouldn't have been committed.** Commit a stray
   file, then remove it from the last commit without losing the others:
   ```bash
   git switch main
   echo "temp junk" > junk.tmp
   echo "real change" >> file.txt
   git add junk.tmp file.txt
   git commit -m "Add real change (and junk by mistake)"
   ```
   Now surgically drop `junk.tmp` from that commit:
   ```bash
   git rm --cached junk.tmp
   git commit --amend --no-edit
   git show --stat HEAD
   git status
   ```
   Expect the amended commit to include *only* `file.txt`, `junk.tmp` still on
   disk but untracked (Concept 4). (If it were a real secret and already
   pushed, you'd additionally rotate it and consider history scrubbing.)

10. **Preview-then-clean untracked files safely:**
    ```bash
    echo "junk1" > a.tmp && echo "junk2" > b.tmp && mkdir tmpdir && echo x > tmpdir/c.tmp
    git clean -n -d
    ```
    Expect a *preview* list of what *would* be removed — nothing deleted yet
    (Concept 6). Now actually remove them:
    ```bash
    git clean -fd
    git status
    ls
    ```
    Expect the `.tmp` files and `tmpdir` gone. Note these were never
    committed, so unlike everything else in this module they're *not*
    recoverable — which is exactly why you preview with `-n` first.

11. **Use stash to escape "I need to switch branches but have uncommitted
    work":**
    ```bash
    echo "half-done edit" >> file.txt
    git stash
    git status
    git switch rescued-work
    git switch main
    git stash pop
    git status
    ```
    Expect `git stash` to give you a clean tree (letting you switch freely),
    and `git stash pop` to restore your half-done edit afterward (Concept 6).

## Independent challenge

No commands given — this challenge deliberately draws on the reflog and reset
from module 03, the shared-vs-unshared golden rule from modules 03/04/06, and
the recovery tools here.

**Task:** Stage and then fully recover from a realistic "bad day" without
losing any wanted work. On a repo with several commits, do all of the
following and recover cleanly from each: (1) blow away several commits with a
`reset --hard` to the wrong place and restore them via the reflog; (2) create
a commit in detached HEAD, switch away so it looks lost, and rescue it onto a
branch; (3) simulate a bad commit that has "already been pushed to a shared
`main`" and undo it *without rewriting history*, then explain why you chose
that method over `reset` and what would have gone wrong for teammates if you'd
reset-and-force-pushed instead. Finish by producing a clean `git log` and
being able to state, for each of the three recoveries, which command class
(reflog+reset vs. revert vs. branch-from-hash) you used and *why it was the
right one for that situation*.

<details>
<summary>Stuck? One hint</summary>

The deciding question for every recovery is "has this been shared with anyone
else?" If no (local reset mistake, detached commit), reflog + `reset --hard
<hash>` or `git branch <name> <hash>` restores it by rewriting/repointing. If
yes (the pushed `main` commit), you must *add* an undo with `git revert`
rather than rewrite, because rewriting shared history is the golden-rule
violation that breaks everyone else's clone.

</details>

## Common mistakes & troubleshooting

- **Force-pushing to "fix" a bad commit on a shared branch.** This rewrites
  history everyone else has and turns a small mistake into a team incident.
  On shared branches, `git revert` (add an undo commit) instead of resetting
  and force-pushing.
- **Panicking and typing more commands after a scary message.** Stop. Read
  the error and `git status` — Git usually names the exact fix. Then `git
  reflog` if commits seem lost. Frantic extra commands are what actually
  cause data loss.
- **Assuming `reset --hard` destroyed committed work.** It almost never
  does — the old commits sit in the object database and the reflog. Look in
  `git reflog` before assuming anything is gone.
- **Treating a committed secret as "removed" once you delete/`.gitignore`
  it.** It's still in history. Rotate the credential immediately; scrubbing
  history (`git filter-repo`) is a heavy, coordinate-with-everyone operation
  and still doesn't un-leak what may already be cloned.
- **Fearing detached HEAD as "broken."** It's just HEAD pointing at a commit
  instead of a branch. To keep commits made there, `git switch -c <name>`
  *before* switching away; to just look around, `git switch <branch>` to
  re-attach.
- **Running `git clean -f` without `-n` first.** Untracked files aren't in
  any commit, so `clean` deletes them for good. Always `git clean -n` (or
  `-nd`) to preview, then commit to the real removal.
- **Confusing `reset`, `revert`, and `restore`.** `restore` = files, no
  commit change. `reset` = move the branch pointer (rewrites, local). `revert`
  = new undo commit (safe, shared). Pick by whether the target is a file vs. a
  commit, and shared vs. unshared.

## Checkpoint quiz

Write down your answer to each question before expanding it — checking without attempting first is the single easiest way to fool yourself into thinking you've learned this.

<details>
<summary>Show questions</summary>

1. You ran `git reset --hard` to the wrong commit and your recent commits
   appear gone. What's the two-step recovery pattern, and why does it work?
2. Explain the difference between `git reset`, `git revert`, and `git
   restore`, and give the one-line rule for which to use to undo *shared* work
   vs. *unshared* work.
3. A bad commit is already on the shared `main` and teammates have pulled it.
   Why is `git revert` the right tool and `reset --hard` + force-push the
   wrong one?
4. You made a merge locally and immediately regret it (not pushed). Give two
   ways to undo it, and what `ORIG_HEAD` refers to.
5. To revert a *merge* commit, why must you pass `-m 1`, and what does that
   `1` mean?
6. What is detached HEAD, why isn't it an error, and what's the specific risk
   — plus the command that neutralizes that risk before you switch away?
7. You committed a `.env` with a real password and pushed it. List, in order,
   what you must actually do — and why simply deleting it in a new commit is
   insufficient.
8. Why must you run `git clean -n` before `git clean -f`, when the rest of
   this module insists almost nothing in Git is unrecoverable?

</details>

<details>
<summary>Show answers</summary>

1. Run `git reflog` to find the hash (or `HEAD@{n}`) of the state just before
   the bad reset, then `git reset --hard <that-hash>`. It works because
   `reset --hard` only moved the branch pointer — the old commits remain in
   the object database and the reflog still records where HEAD was.
2. `git restore` operates on files (discard/unstage) without changing
   commits. `git reset` moves the current branch pointer (rewrites history —
   local/unshared). `git revert` adds a *new* commit that undoes a prior one
   (history preserved). Rule: undo unshared work with `reset`; undo shared
   (pushed) work with `revert`.
3. `revert` adds a new commit undoing the change, leaving all existing
   commits intact, so teammates just pull a normal new commit. `reset --hard`
   + force-push rewrites `main`'s history, orphaning commits others already
   have and forcing painful reconciliation on everyone — the golden-rule
   violation.
4. `git reset --hard ORIG_HEAD` (or the pre-merge hash from `git reflog`), or
   if still mid-merge, `git merge --abort`. `ORIG_HEAD` is the position HEAD
   held just before the last "dangerous" operation (merge/rebase/reset) — a
   convenient one-step-back reference.
5. A merge commit has two parents, so Git can't know which side represents
   "the state to return to." `-m 1` names parent 1 (typically the branch you
   merged *into*, e.g. `main`) as the mainline to keep, undoing what the merge
   brought in from the other parent.
6. Detached HEAD is HEAD pointing directly at a commit instead of at a branch
   — normal when you check out a specific commit/tag, not an error. The risk:
   commits you make there are reachable only via HEAD and become orphaned when
   you switch away. `git switch -c <name>` (or `git branch <name>`) before
   switching anchors them on a branch.
7. Rotate the credential immediately (assume it's compromised); remove the
   file from tracking going forward (`git rm --cached` + commit); and if you
   truly need it gone from history, rewrite all affected commits with `git
   filter-repo`/BFG and force-push in coordination with the team. Deleting it
   in a new commit is insufficient because the secret still exists in the
   earlier commit and anyone can check that commit out.
8. Because `git clean` deletes *untracked* files — files that were never
   committed and therefore are *not* in the object database or reflog, so they
   truly can't be recovered. `-n` previews the deletion so you don't
   accidentally remove something you wanted; it's the one operation here that's
   genuinely irreversible.

</details>

## Next

Continue to [08-capstone-project](../08-capstone-project/README.md) to put
the entire track together — simulate a realistic multi-week collaboration
with branches, a real conflict, an interactive-rebase cleanup, and a reflog
recovery, ending in a clean, readable history.
