# Branching and Merging

## Why this matters

Branches are how real work gets done in Git: you keep `main` stable while
developing a feature, a fix, or an experiment on a separate line, then fold
it back in when it's ready. Because a branch is just a movable pointer
(module 00), branching is cheap and safe — but merging is where the two ideas
you've been developing separately finally meet, and sometimes disagree. This
module makes fast-forward vs. merge-commit merges concrete and, crucially,
walks you through resolving a *real* merge conflict by hand, which is the
single most common thing that makes beginners panic and freeze. After this
you'll branch and merge without thinking about it.

## Concepts

### A branch is a movable pointer, and switching moves HEAD

From module 00: a branch is a ref holding one commit hash, and HEAD normally
points at a branch. Creating a branch (`git branch feature` or `git switch
-c feature`) just writes a new pointer at the current commit — nothing is
copied. **Switching** branches (`git switch feature`) repoints HEAD at the
other branch and updates your working tree to match that branch's snapshot.
So "which branch am I on" is literally "what does HEAD point at," and
switching is nearly instant because it's re-pointing a pointer plus swapping
file contents, not moving history around.

### Diverging histories: two branches, one common ancestor

When you branch off `main` and commit on both `main` and your `feature`
branch, history **diverges**: both branches share a common ancestor commit,
then each has its own commits after it. Drawn out:

```
        A---B---C   feature
       /
  ...-o---D---E     main
```

Here `o` is the common ancestor; `feature` added A,B,C and `main` added D,E
independently. Merging is the act of combining these back into one line. Git
finds the common ancestor (`o`) automatically — you never compute it
yourself.

### Fast-forward merge: no divergence, just move the pointer

If the branch you're merging *into* has no new commits since you branched —
i.e. its pointer is a direct ancestor of the branch you're merging in — Git
can **fast-forward**: it just slides the pointer forward to the tip of the
other branch. No merge commit is created because none is needed; the history
stays perfectly linear. This is the common case for a short-lived feature
branch when `main` didn't move underneath you. You can force a merge commit
anyway with `--no-ff` (some teams do, to keep an explicit record of every
feature merge).

### Three-way merge: divergence needs a merge commit

If *both* branches moved (the diverging picture above), a fast-forward is
impossible — Git can't just slide a pointer because history genuinely forked.
Instead it performs a **three-way merge**: it looks at the two branch tips
plus their common ancestor, combines the changes from each side, and records
the result as a new **merge commit** — the special commit with *two* parents
from module 00. That merge commit is what ties the forked history back
together, and its two parent links are why `git log --graph` can draw the
fork-and-rejoin shape.

### Merge conflicts: when the two sides edit the same lines

Git merges automatically when the two branches changed *different* regions.
A **conflict** happens only when both branches changed *the same lines* of
the same file (or one deleted a file the other edited) — Git can't know which
version you want, so it stops and asks you. It marks the conflicting region
inside the file with conflict markers:

```
<<<<<<< HEAD
the version on your current branch
=======
the version from the branch you're merging in
>>>>>>> feature
```

Everything between `<<<<<<<` and `=======` is *your* side (HEAD); everything
between `=======` and `>>>>>>>` is *their* side. Resolving a conflict means
editing the file to the final content you want, **deleting all three marker
lines**, then staging the file — that's how you tell Git "this one's
settled." A conflict is not an error or a broken repo; it's Git correctly
refusing to guess.

### Resolving a conflict, step by step

The full loop when a merge stops with conflicts: `git status` lists the
conflicted files under "Unmerged paths." For each, open it, find the marker
blocks, edit to the correct final content (which might be one side, the
other, both, or something new), and remove the markers. Then `git add` each
resolved file to mark it done. When all conflicts are staged, `git commit`
finalizes the merge (Git pre-fills a merge message). If you get lost
mid-conflict, `git merge --abort` returns you cleanly to the pre-merge
state — nothing is lost.

### Deleting and listing branches

Once a feature branch is merged, its commits live on in `main`'s history, so
the branch pointer itself is disposable — `git branch -d feature` deletes the
now-redundant pointer (Git refuses with `-d` if the branch has unmerged
commits, protecting you; `-D` forces it). `git branch` lists local branches
and stars the current one; `git branch --merged` shows which are safe to
delete. Keeping stale branches around is just clutter — the history isn't in
the branch, it's in the commits.

## Command reference

| Command | What it does | Example |
|---|---|---|
| `git branch` | Lists local branches, marking the current one | `git branch` |
| `git branch <name>` | Creates a branch at the current commit (doesn't switch) | `git branch feature` |
| `git switch <name>` | Switches to an existing branch (moves HEAD + working tree) | `git switch feature` |
| `git switch -c <name>` | Creates a new branch and switches to it in one step | `git switch -c feature` |
| `git checkout <name>` | Older combined command that also switches branches | `git checkout feature` |
| `git merge <name>` | Merges the named branch into the current branch | `git merge feature` |
| `git merge --no-ff <name>` | Merges but always creates a merge commit, even if fast-forward was possible | `git merge --no-ff feature` |
| `git merge --abort` | Aborts an in-progress conflicted merge, restoring pre-merge state | `git merge --abort` |
| `git branch -d <name>` | Deletes a branch pointer (only if merged) | `git branch -d feature` |
| `git branch -D <name>` | Force-deletes a branch pointer even if unmerged | `git branch -D experiment` |
| `git branch --merged` | Lists branches already merged into the current one | `git branch --merged` |
| `git log --oneline --graph --all` | Visualizes branch/merge structure | `git log --oneline --graph --all` |

Flag breakdown for `git switch -c feature`:

- `switch` — change which branch HEAD points at (the modern, purpose-built
  command for this; `checkout` also does it but does many other things too).
- `-c feature` — **c**reate a new branch named `feature` at the current
  commit *and* switch to it. Without `-c`, `switch` requires the branch to
  already exist.

Flag breakdown for `git merge --no-ff feature`:

- `merge` — combine another branch's history into the current branch.
- `--no-ff` — **no** **f**ast-**f**orward: even when Git *could* just slide
  the pointer, force it to create an explicit merge commit instead, so the
  feature's integration is visible as a distinct node in history.
- `feature` — the branch whose commits are being merged into the current one.

Flag breakdown for `git branch -d feature`:

- `branch` — manage branch pointers.
- `-d` — **d**elete the pointer, but *safely*: Git refuses if the branch has
  commits not yet merged into your current branch, preventing accidental
  loss. Use `-D` to override that safety.

## Hands-on exercises

Run these in your WSL2 Ubuntu terminal. Start fresh so the history is clean.

1. **Set up a base repo with one commit on `main`:**
   ```bash
   mkdir -p ~/learn-git/branching && cd ~/learn-git/branching
   git init
   echo "line 1" > file.txt
   git add file.txt && git commit -m "Initial commit"
   git log --oneline
   ```

2. **Create a branch and see it's just a pointer at the same commit:**
   ```bash
   git switch -c feature
   git branch
   git log --oneline --all
   ```
   Expect `feature` and `main` both listed, with `feature` starred, and both
   pointing at the *same* single commit — branching copied nothing.

3. **Commit on the feature branch and watch only `feature` move:**
   ```bash
   echo "feature work" >> file.txt
   git commit -am "Add feature work"
   git log --oneline --all --graph
   ```
   Expect two commits, with `feature` now ahead of `main` by one. Switch back
   and confirm the working tree changes:
   ```bash
   git switch main
   cat file.txt
   ```
   Expect `file.txt` to show *only* "line 1" — the feature commit isn't on
   `main`, and switching restored `main`'s snapshot.

4. **Do a fast-forward merge.** Since `main` didn't move, merging `feature`
   just slides the pointer:
   ```bash
   git merge feature
   git log --oneline --all --graph
   ```
   Expect Git to say "Fast-forward," and the graph to be a straight line —
   no merge commit, because none was needed (Concept 3).

5. **Now force divergence to get a real merge commit.** Branch again, then
   commit on *both* branches so neither is an ancestor of the other:
   ```bash
   git switch -c feature2
   echo "feature2 line" >> file.txt
   git commit -am "Feature2 change"
   git switch main
   echo "main-side line" > other.txt
   git add other.txt && git commit -m "Main-side change"
   git log --oneline --all --graph
   ```
   Expect the graph to show the two branches forking after "Add feature
   work." Because they touched *different* files, the next merge won't
   conflict.

6. **Merge with a merge commit (three-way):**
   ```bash
   git merge feature2
   ```
   Git opens an editor with a prefilled merge message (e.g. "Merge branch
   'feature2'"); save and close it. Then:
   ```bash
   git log --oneline --all --graph
   git show HEAD
   ```
   Expect a **merge commit** at the tip, and `git show HEAD` to reveal it has
   *two* parents (Concept 4). The graph shows the fork rejoining.

7. **Create a real merge conflict on purpose.** This is the important one.
   Set up two branches that edit the *same line*:
   ```bash
   git switch -c red
   echo "the color is red" > color.txt
   git add color.txt && git commit -m "Set color to red"
   git switch main
   git switch -c blue
   echo "the color is blue" > color.txt
   git add color.txt && git commit -m "Set color to blue"
   ```
   Now try to merge `red` into `blue`:
   ```bash
   git merge red
   ```
   Expect `CONFLICT (add/add): Merge conflict in color.txt` and Git stopping
   mid-merge. This is Concept 5 — both branches created the same file with
   different content on the same line.

8. **Inspect and resolve the conflict by hand:**
   ```bash
   git status
   cat color.txt
   ```
   Expect "Unmerged paths: color.txt" and the file showing conflict markers:
   ```
   <<<<<<< HEAD
   the color is blue
   =======
   the color is red
   >>>>>>> red
   ```
   Resolve it by editing `color.txt` to the final content you want and
   deleting all three marker lines. For example, decide the answer is
   "purple":
   ```bash
   echo "the color is purple" > color.txt
   git status
   ```
   Verify the file now has *no* `<<<<<<<`, `=======`, or `>>>>>>>` lines
   (`grep -n '<<<<<<<\|=======\|>>>>>>>' color.txt` should print nothing).

9. **Finalize the merge:**
   ```bash
   git add color.txt
   git commit
   ```
   Save the prefilled merge message. Then:
   ```bash
   git log --oneline --all --graph
   cat color.txt
   ```
   Expect a merge commit tying `blue` and `red` together, and `color.txt`
   containing "the color is purple." You just resolved a real conflict — the
   thing most people fear about Git.

10. **Practice the escape hatch: `--abort`.** Deliberately start another
    conflict and bail out instead of resolving:
    ```bash
    git switch main
    git switch -c green
    echo "the color is green" > color.txt
    git add color.txt && git commit -m "Set color to green"
    git switch blue
    git merge green
    ```
    Expect another conflict. Now abort:
    ```bash
    git merge --abort
    git status
    cat color.txt
    ```
    Expect a clean working tree back on `blue` with the pre-merge content —
    `--abort` rewound the whole thing. Knowing this exists is what lets you
    experiment with merges fearlessly.

11. **Clean up merged branches:**
    ```bash
    git switch main
    git merge blue
    git branch --merged
    git branch -d feature feature2 red blue green
    git branch
    ```
    Expect the merged branch pointers to delete cleanly (their commits live
    on in `main`), leaving just `main`. `git branch -d` protected you from
    deleting anything unmerged.

## Independent challenge

No commands given — combine branching (this module) with the clean-commit
habits from module 01.

**Task:** Model a realistic "two features at once" situation. On a fresh
repo with a small starting file, create two separate feature branches off
`main`. On the first, change one part of the file; on the second, change a
*different* part of the same file. Merge the first into `main` (it should
merge cleanly), then merge the second — and here's the point: engineer it so
the second merge *conflicts* by having both branches also edit one shared
line, and resolve that conflict so the final file sensibly contains *both*
features' intended changes rather than discarding either. Afterward, produce
a single `git log --oneline --graph --all` view and be able to explain, out
loud, which commit is the common ancestor, which merge fast-forwarded (if
any), and which created a merge commit and why.

<details>
<summary>Stuck? One hint</summary>

To guarantee the second merge conflicts, make sure both `main` (after the
first merge) and your second feature branch modify the *same line*; when you
hit the conflict markers, the correct resolution here is usually to keep the
substance of *both* sides on that line, not to pick one and delete the other.

</details>

## Common mistakes & troubleshooting

- **Panicking at a conflict and force-deleting the branch or the repo.** A
  conflict is normal and recoverable. `git status` names the files; edit
  them, remove the markers, `git add`, `git commit`. If overwhelmed, `git
  merge --abort` cleanly rewinds.
- **Committing the conflict markers.** Leaving `<<<<<<<`/`=======`/`>>>>>>>`
  lines in a file and committing them produces broken, non-compiling code.
  Always `grep` for markers (or let your editor highlight them) before
  staging a resolved file.
- **Forgetting to `git add` after resolving.** Editing the file isn't
  enough — Git only considers a conflict resolved once you *stage* the file.
  `git status` will keep listing it under "Unmerged paths" until you do.
- **Expecting a fast-forward when `main` moved.** If both branches have new
  commits, Git *must* make a merge commit — that's not Git being difficult,
  it's genuine divergence. Use `git log --graph` to see the fork.
- **Deleting a branch before it's merged and losing the work.** `git branch
  -d` protects you (it refuses); `git branch -D` does not. If you `-D` an
  unmerged branch, the commits become unreachable — recoverable via reflog
  (module 07), but don't rely on that.
- **Thinking switching branches loses your uncommitted edits.** Git actually
  refuses to switch if uncommitted changes would be overwritten. Commit or
  stash them first (stashing is covered later); the refusal is protecting
  you, not malfunctioning.

## Checkpoint quiz

Write down your answer to each question before expanding it — checking without attempting first is the single easiest way to fool yourself into thinking you've learned this.

<details>
<summary>Show questions</summary>

1. What actually happens, at the pointer level, when you run `git switch -c
   feature` — and why is it so cheap?
2. Under what exact condition can Git do a fast-forward merge instead of
   creating a merge commit?
3. What is a merge commit, in terms of the object model from module 00, and
   what makes it different from a normal commit?
4. When does Git produce a merge conflict, and when does it merge two
   branches' changes automatically without asking?
5. You're staring at `<<<<<<< HEAD` ... `=======` ... `>>>>>>> feature` in a
   file. Which side is which, and what are the three things you must do to
   resolve it?
6. You started a merge, it conflicted, and you want to back out entirely and
   pretend it never happened. What command does that safely?
7. Why is it safe to delete a feature branch pointer right after merging it,
   and why does `git branch -d` sometimes refuse?

</details>

<details>
<summary>Show answers</summary>

1. It writes a new branch pointer at the current commit and repoints HEAD at
   it (updating the working tree to match). It's cheap because nothing is
   copied — a branch is just a ~41-byte pointer file.
2. When the branch you're merging *into* has no commits of its own since the
   branch point — i.e. its tip is a direct ancestor of the branch being
   merged in. Git can then just slide the pointer forward; no merge commit is
   needed.
3. A merge commit is a commit with *two* (or more) parent links instead of
   one, pointing back at both branch tips it combined. Otherwise it's an
   ordinary commit (one tree snapshot, message, etc.); the extra parent is
   what records the join.
4. A conflict happens only when both branches changed the *same lines* of the
   same file (or edit-vs-delete). When the two sides changed different
   regions/files, Git combines them automatically with no conflict.
5. Everything from `<<<<<<< HEAD` to `=======` is your current branch's
   version; everything from `=======` to `>>>>>>> feature` is the incoming
   branch's version. To resolve: (1) edit the file to the correct final
   content, (2) delete all three marker lines, (3) `git add` the file (then
   commit to finish the merge).
6. `git merge --abort` — it restores the exact pre-merge state, discarding
   the half-done merge.
7. Because merging copied the branch's commits into the target branch's
   history — the commits survive; only the redundant pointer is removed.
   `git branch -d` refuses when the branch has commits *not* reachable from
   your current branch (unmerged work), to stop you losing it.

</details>

## Next

Continue to
[03-rebasing-and-history-rewriting](../03-rebasing-and-history-rewriting/README.md)
to learn the other way of combining and cleaning up history — and the reflog
safety net that makes rewriting history safe to practice.
