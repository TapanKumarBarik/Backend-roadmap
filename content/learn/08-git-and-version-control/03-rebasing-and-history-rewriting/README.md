# Rebasing and History Rewriting

## Why this matters

Merging preserves history exactly as it happened, warts and all. Rebasing
lets you *rewrite* history to be cleaner before anyone else sees it —
replaying your commits onto a new base for a linear story, squashing five
"wip" commits into one coherent one, fixing the last commit's message or
contents, or lifting a single commit from one branch to another. This is
what turns a messy real working session into the tidy, reviewable history a
pull request wants (module 05). Rewriting history *sounds* dangerous, and it
can be — so this module also teaches the **reflog**, Git's undo-of-last-
resort, which makes every rewrite here fully recoverable and lets you
practice fearlessly.

## Concepts

### Rebase: replay commits onto a new base

A **rebase** takes a series of commits and re-applies them, one by one, on
top of a different base commit. Where merge *joins* two lines of history with
a merge commit, rebase *moves* one line to start from the tip of another,
producing a straight, linear history with no merge commit. Given the
diverging picture from module 02:

```
        A---B---C   feature
       /
  ...-o---D---E     main
```

`git rebase main` (while on `feature`) replays A, B, C on top of E, giving:

```
  ...-o---D---E---A'---B'---C'   feature
```

The commits are labeled A', B', C' — **new commits with new hashes**, because
each has a different parent and possibly different content now, and (module
00) changing a commit's parent changes its hash. The originals A, B, C become
unreferenced. This "new hashes" fact is the root of both rebase's power and
its one hard rule (below).

### Rebase vs. merge: same result, different history

Both `git merge main` and `git rebase main` can get `feature` caught up with
`main`'s latest work, and both can produce the same final *files*. The
difference is the *shape of history* they leave:

- **Merge** keeps a truthful record: the fork happened, and here's the merge
  commit that rejoined it. History is a graph with visible branches.
- **Rebase** produces a clean, linear fiction: it looks as though you did all
  your work starting from `main`'s current tip, in a straight line, with no
  merge commit.

Neither is "correct" universally. Linear history is easier to read and
`git log` and `git bisect` love it; merge history is more honest about what
actually happened. Many teams rebase *local, unpublished* work to tidy it,
then merge to integrate. Which brings us to the rule.

### The golden rule: don't rebase shared history

Because rebase creates new commits with new hashes and orphans the old ones,
rewriting commits that **other people have already pulled** is destructive:
their history still references the old hashes, yours references new ones, and
reconciling the two is painful for everyone. The rule is simple and
non-negotiable: **only rewrite history that hasn't left your machine** (or a
branch only you use). Rebasing your own local feature branch before pushing:
great. Rebasing `main` after teammates have based work on it: don't. Module
04 and 05 revisit this when pushing enters the picture.

### Interactive rebase: edit history surgically

`git rebase -i <base>` (interactive) opens an editor listing the commits
about to be replayed, oldest at top, each with an action you can change:

- `pick` — keep the commit as-is (the default).
- `reword` — keep the commit but edit its message.
- `squash` — combine this commit into the previous one, merging their
  messages.
- `fixup` — like squash but *discard* this commit's message (keep the
  previous one's) — perfect for "oops, fix" commits.
- `edit` — pause at this commit so you can amend its contents.
- `drop` (or deleting the line) — remove the commit entirely.
- reordering the lines reorders the commits.

Save and close, and Git replays the commits applying your instructions. This
is how you turn `wip`, `wip2`, `actually fix it`, `typo` into a single clean
"Add feature X" commit before opening a PR. It's the workhorse of history
cleanup.

### `commit --amend`: fix the very last commit

`git commit --amend` replaces the *most recent* commit with a new one that
includes whatever's currently staged, and optionally a new message. It's
really the simplest special case of a rewrite (just the tip). Use it to fix a
typo in the last commit message (`git commit --amend -m "..."`), or to add a
file you forgot (`git add forgotten.txt && git commit --amend --no-edit`).
Like all rewrites it makes a *new* commit with a new hash, so the same golden
rule applies: only amend commits you haven't shared.

### `cherry-pick`: copy one commit somewhere else

`git cherry-pick <hash>` takes a single existing commit and re-applies its
*change* as a new commit on your current branch. It's the surgical "I want
just that one fix over here" tool — e.g. pulling a hotfix from `main` onto a
release branch without bringing the rest. Like rebase, it creates a new
commit with a new hash (same change, new parent). It can conflict, and you
resolve those exactly like a merge conflict, then `git cherry-pick
--continue`.

### The reflog: your safety net for everything above

Every time HEAD moves — commit, switch, merge, rebase, reset, amend — Git
records the previous position in the **reflog**, a per-repo log of where your
refs have been. `git reflog` shows entries like `abc1234 HEAD@{2}: commit:
...` and `def5678 HEAD@{3}: rebase (start): ...`. Crucially, the commits a
rebase or reset "orphaned" are *still in the object database* and still named
in the reflog — so if a rebase goes wrong, you can find the pre-rebase HEAD
in the reflog and `git reset --hard <that-hash>` to jump straight back to it.
The reflog is why history rewriting is safe to practice: as long as you can
read the reflog, almost nothing is truly lost (it's kept ~90 days by
default). Module 07 leans on this heavily for recovery; you meet it here so
you can rewrite without fear.

## Command reference

| Command | What it does | Example |
|---|---|---|
| `git rebase <base>` | Replays current branch's commits on top of `<base>` | `git rebase main` |
| `git rebase -i <base>` | Interactive rebase: edit/squash/reorder/drop commits | `git rebase -i HEAD~4` |
| `git rebase --continue` | Continues a rebase after resolving a conflict | `git rebase --continue` |
| `git rebase --abort` | Aborts a rebase, restoring the pre-rebase state | `git rebase --abort` |
| `git commit --amend` | Replaces the last commit (add staged changes / edit message) | `git commit --amend` |
| `git commit --amend --no-edit` | Amends the last commit *without* changing its message | `git commit --amend --no-edit` |
| `git cherry-pick <hash>` | Re-applies one commit's change onto the current branch | `git cherry-pick 9a1b2c3` |
| `git cherry-pick --continue` | Continues a cherry-pick after resolving a conflict | `git cherry-pick --continue` |
| `git reflog` | Shows the history of where HEAD (and refs) have pointed | `git reflog` |
| `git reset --hard <hash>` | Moves the current branch to `<hash>` and resets the working tree to match | `git reset --hard HEAD@{5}` |
| `git reset --soft <hash>` | Moves the branch pointer only; keeps index and working tree | `git reset --soft HEAD~1` |

Flag breakdown for `git rebase -i HEAD~4`:

- `rebase` — replay commits onto a base.
- `-i` (`--interactive`) — open the editable to-do list of commits instead
  of replaying blindly, letting you pick/reword/squash/fixup/edit/drop and
  reorder.
- `HEAD~4` — the base: the commit *four before* HEAD. The rebase will act on
  the last 4 commits (everything *after* `HEAD~4`, up to HEAD). `HEAD~n`
  means "n commits back along the first-parent chain."

Flag breakdown for `git commit --amend --no-edit`:

- `--amend` — replace the most recent commit with a new one incorporating
  the current index, rather than adding a new commit on top.
- `--no-edit` — keep the existing commit message unchanged (skip opening the
  editor). Handy when you're only adding a forgotten file, not changing the
  message.

Flag breakdown for `git reset --hard HEAD@{5}` vs. `git reset --soft HEAD~1`:

- `reset` — move the current branch pointer to a given commit.
- `--hard` — also force the index *and* the working tree to match that
  commit, **discarding** any uncommitted changes and any commits after it.
  Powerful and destructive — but recoverable via reflog if you reset onto the
  wrong place.
- `--soft` — move *only* the branch pointer; leave the index and working tree
  exactly as they are. `git reset --soft HEAD~1` "uncommits" the last commit
  while keeping all its changes staged — useful for redoing a commit.
- `HEAD@{5}` — a reflog reference meaning "where HEAD was 5 moves ago."

## Hands-on exercises

Run these in your WSL2 Ubuntu terminal on a fresh repo.

1. **Build a diverging history to rebase.**
   ```bash
   mkdir -p ~/learn-git/rebasing && cd ~/learn-git/rebasing
   git init
   echo "base" > file.txt
   git add file.txt && git commit -m "Base commit"
   git switch -c feature
   echo "feature 1" >> file.txt && git commit -am "Feature commit 1"
   echo "feature 2" >> file.txt && git commit -am "Feature commit 2"
   git switch main
   echo "main work" > main.txt && git add main.txt && git commit -m "Main progress"
   git log --oneline --all --graph
   ```
   Expect a fork: `feature` has two commits, `main` has one, after a shared
   base.

2. **Rebase the feature branch onto main and watch history go linear:**
   ```bash
   git switch feature
   git rebase main
   git log --oneline --all --graph
   ```
   Expect Git to replay the two feature commits on top of `main`'s tip, and
   the graph to be a straight line — no merge commit (Concept 1). Note the
   feature commits now have *different* short hashes than in exercise 1: they
   were rewritten.

3. **Prove the old commits still exist in the reflog:**
   ```bash
   git reflog | head
   ```
   Expect to see the `rebase (start)` / `rebase (finish)` entries and the
   pre-rebase HEAD position — the originals aren't gone, just unreferenced
   (Concept 7). Leave this here; you'll use it to recover in exercise 9.

4. **Make a messy branch to clean up with interactive rebase.**
   ```bash
   git switch main
   git switch -c messy
   echo "a" >> notes.txt && git add notes.txt && git commit -m "wip"
   echo "b" >> notes.txt && git commit -am "wip2"
   echo "c" >> notes.txt && git commit -am "actually add notes"
   echo "d" >> notes.txt && git commit -am "typo fix"
   git log --oneline
   ```
   Expect four scrappy commits. This is exactly what a real working session
   looks like before cleanup.

5. **Squash the four into one clean commit with interactive rebase:**
   ```bash
   git rebase -i HEAD~4
   ```
   Your editor opens a to-do list, oldest first. Leave the *first* line as
   `pick`, and change the action on the other three lines from `pick` to
   `squash` (or `s`). Save and close. Git then opens a second editor to
   compose the combined message — replace it with a single clean summary like
   `Add notes file`, save, and close. Verify:
   ```bash
   git log --oneline
   cat notes.txt
   ```
   Expect **one** commit "Add notes file" instead of four, with `notes.txt`
   still containing all four lines a,b,c,d. You've rewritten four commits into
   one coherent one (Concept 4).

6. **Reword a commit message without changing its content.** Reword the tip:
   ```bash
   git commit --amend -m "Add notes file with four lines"
   git log --oneline
   ```
   Expect the top commit's message updated (Concept 5). This amended the last
   commit into a new one — check `git reflog | head` and you'll see the amend
   recorded.

7. **Amend to add a forgotten file.** Simulate forgetting to include a file:
   ```bash
   echo "readme for notes" > notes-readme.md
   git commit --amend --no-edit
   ```
   Wait — that did nothing useful because you didn't stage the file first.
   That's the common mistake; do it correctly:
   ```bash
   git add notes-readme.md
   git commit --amend --no-edit
   git show --stat HEAD
   ```
   Expect the last commit to now include *both* `notes.txt` and
   `notes-readme.md`, with the message unchanged (`--no-edit`). This is the
   canonical "oops, forgot a file" fix (Concept 5).

8. **Cherry-pick a single commit onto another branch.** Grab just the
   `messy` branch's notes commit onto `main`:
   ```bash
   git log --oneline messy
   ```
   Copy the hash of the "Add notes file with four lines" commit, then:
   ```bash
   git switch main
   git cherry-pick <that-hash>
   git log --oneline
   cat notes.txt
   ```
   Expect a *new* commit on `main` applying that same change (new hash, same
   content — Concept 6), and `notes.txt` now present on `main` too.

9. **Diagnose and fix: recover from a bad `reset --hard` using the reflog.**
   This is the marquee recovery drill. First, deliberately destroy work:
   ```bash
   git switch feature
   git log --oneline
   git reset --hard HEAD~2
   git log --oneline
   ```
   Expect the two feature commits to *vanish* — `feature` now points two
   commits back and the working tree matches. It looks like you lost your
   work. You didn't. Find where HEAD was before the reset:
   ```bash
   git reflog
   ```
   Expect an entry like `<hash> HEAD@{1}: ... ` recording the tip *before*
   the reset (the line just above the `reset: moving to HEAD~2` entry).
   Recover by resetting back to it (use the actual hash or the `HEAD@{n}`
   reference you see):
   ```bash
   git reset --hard HEAD@{1}
   git log --oneline
   cat file.txt
   ```
   Expect the two feature commits to *reappear* and `file.txt` to be whole
   again. This is the single most valuable Git recovery skill: `reset --hard`
   never truly deletes the old commits — the reflog remembers them
   (Concept 7), and module 07 builds on exactly this.

10. **Practice the rebase escape hatch.** Start an interactive rebase and
    bail out mid-flight:
    ```bash
    git rebase -i HEAD~2
    ```
    In the editor, change one line to `edit`, save, and close — Git pauses.
    Now change your mind entirely:
    ```bash
    git rebase --abort
    git log --oneline
    ```
    Expect the branch restored to exactly its pre-rebase state. Between
    `--abort` and the reflog, no rewrite you start is ever a point of no
    return.

11. **Rebase with a conflict, and resolve it.** Create one:
    ```bash
    git switch main
    echo "shared line - main version" > shared.txt
    git add shared.txt && git commit -m "Add shared.txt on main"
    git switch -c conflicting
    echo "shared line - branch version" > shared.txt
    git commit -am "Change shared.txt on branch"
    git switch main
    echo "shared line - main updated" > shared.txt
    git commit -am "Update shared.txt on main"
    git switch conflicting
    git rebase main
    ```
    Expect the rebase to stop on a conflict in `shared.txt` (same resolution
    skill as a merge conflict from module 02). Fix it:
    ```bash
    echo "shared line - reconciled" > shared.txt
    git add shared.txt
    git rebase --continue
    git log --oneline --all --graph
    ```
    Expect the rebase to finish onto `main` with your reconciled line. Note
    you used `git rebase --continue` (not `git commit`) to resume — that's the
    rebase-specific step.

## Independent challenge

No commands given — combine interactive rebase (this module) with the
clean-commit discipline from module 01 and branching from module 02.

**Task:** Simulate the real "clean up before review" workflow end to end. On
a fresh branch, deliberately make a *deliberately messy* series of at least
five commits — including two that should really be squashed together, one
with a bad/embarrassing message that needs rewording, and one committed
entirely by mistake that should be dropped. Then, in a *single* interactive
rebase, transform that mess into exactly three clean, logically-distinct
commits with good imperative messages, in a sensible order — squashing,
rewording, dropping, and if needed reordering — without changing the final
files. Verify the end state two ways: the final `git log --oneline` should
read like a deliberate story, and the final working-tree contents should be
identical to before the rebase (minus whatever the dropped commit had added).
As a safety demonstration, first note the pre-rebase commit hash from the
reflog so you could restore it if the rebase went wrong.

<details>
<summary>Stuck? One hint</summary>

In the interactive to-do list, remember the commits are listed oldest-first
and you can freely reorder the lines; put the two to-be-combined commits
adjacent with the second marked `squash` (or `fixup` to discard its message),
mark the bad-message one `reword`, and delete the mistaken commit's line
entirely to drop it.

</details>

## Common mistakes & troubleshooting

- **Rebasing or amending commits you've already pushed/shared.** This
  rewrites shared history and forces everyone else into a painful
  reconciliation. The golden rule: only rewrite history that hasn't left your
  machine. If you *must* rewrite pushed work, coordinate with your team
  (module 04/05).
- **`git commit --amend` without staging the change first.** `--amend`
  incorporates whatever is *currently staged*; if you forgot `git add`, it
  amends nothing (or only the message). Stage, then amend.
- **Panicking after a `reset --hard` "destroyed" work.** It almost never
  truly destroys committed work — `git reflog` shows where HEAD was, and `git
  reset --hard HEAD@{n}` jumps back. Look before you despair.
- **Getting lost in a conflict-heavy rebase.** You can always `git rebase
  --abort` to return to the exact pre-rebase state. Resolve conflicts one
  commit at a time, `git add` each, and `git rebase --continue` — don't `git
  commit` mid-rebase.
- **Squashing everything into one commit reflexively.** Clean history isn't
  the same as *one* commit — it's a few *logically distinct* commits. Squash
  the noise (wip/typo), keep meaningfully separate changes separate.
- **Confusing `reset --soft`, `--mixed`, and `--hard`.** `--soft` moves the
  branch only (changes stay staged); `--mixed` (the default) also unstages;
  `--hard` also discards working-tree changes. Only `--hard` can lose
  uncommitted work — reach for it deliberately.

## Checkpoint quiz

Write down your answer to each question before expanding it — checking without attempting first is the single easiest way to fool yourself into thinking you've learned this.

<details>
<summary>Show questions</summary>

1. In your own words, what does `git rebase main` do to a feature branch,
   and why do the replayed commits get *new* hashes?
2. Merge and rebase can leave the same final files. What's the difference in
   the *history* they produce, and when might you prefer each?
3. State the golden rule of rebasing, and explain concretely why breaking it
   hurts other people.
4. In an interactive rebase, what's the difference between `squash` and
   `fixup`, and between `reword` and `drop`?
5. What does `git commit --amend --no-edit` do, and what's the one thing you
   must remember to do before running it if you're adding a forgotten file?
6. What does `cherry-pick` do, and how does the resulting commit relate to
   the original?
7. You ran `git reset --hard HEAD~3` and your last three commits appear
   gone. Are they actually destroyed? What command shows you where to get
   back to, and what command takes you there?
8. Which of `reset --soft` and `reset --hard` can lose uncommitted
   working-tree changes, and which just moves the branch pointer?

</details>

<details>
<summary>Show answers</summary>

1. It replays the feature branch's commits, one at a time, on top of
   `main`'s current tip, producing a linear history. They get new hashes
   because each commit now has a different parent (and possibly different
   content), and a commit's hash is derived from its content including its
   parent (module 00).
2. Merge keeps a truthful branched graph with a merge commit recording the
   join; rebase produces a clean linear history as if the work were done
   straight off the tip. Prefer rebase for tidying *local, unshared* work
   before review; prefer merge to integrate and to preserve an honest record
   of what happened.
3. Don't rewrite history that others have already pulled. Breaking it hurts
   others because rebase creates new commit hashes and orphans the old ones —
   collaborators' clones still reference the old hashes, and reconciling the
   divergence is painful and error-prone.
4. `squash` combines a commit into the previous one and lets you merge their
   messages; `fixup` does the same but discards the squashed commit's
   message. `reword` keeps the commit but lets you edit its message; `drop`
   removes the commit entirely.
5. It replaces the most recent commit with a new one that includes the
   currently-staged changes, keeping the original message unchanged. Before
   running it to add a forgotten file, you must `git add` that file first —
   otherwise there's nothing new staged to amend in.
6. `cherry-pick <hash>` re-applies that one commit's change as a *new* commit
   on your current branch. It's the same change (diff) but a brand-new commit
   with a new hash and a new parent — the original stays where it is.
7. No — they're not destroyed; `reset --hard` only moved the branch pointer,
   and the old commits remain in the object database. `git reflog` shows
   where HEAD was before the reset; `git reset --hard HEAD@{1}` (or the
   actual pre-reset hash) takes you back.
8. `reset --hard` can discard uncommitted working-tree (and index) changes.
   `reset --soft` only moves the branch pointer, leaving the index and
   working tree untouched.

</details>

## Cumulative review

Closed-book. Don't reopen modules 00-03 while attempting these — the point is
to find out what actually stuck across the object model, the basic workflow,
branching/merging, and rewriting.

1. Walk the full chain of pointers from the name `HEAD`, on a normal branch,
   all the way down to the raw bytes of one file — naming every object type
   and ref in between (module 00), then explain why committing changes one
   small file inside `.git` and nothing else structurally.
2. You edit `app.py`, run `git add app.py`, edit `app.py` again, and run `git
   commit -m "fix"`. Which version of the file is in the commit, how would
   `git status` have shown you the situation beforehand, and which single
   command right before committing would have revealed exactly what was about
   to be recorded?
3. Explain, using the object model, why creating a branch is instant and
   free but a `reset --hard` onto the wrong commit *feels* catastrophic yet
   usually isn't — and name the mechanism that makes the second one
   recoverable.
4. You have two branches that both edited the same line of the same file.
   Describe what happens if you `merge` them versus if you `rebase` one onto
   the other, in terms of both the conflict you'll hit *and* the shape of the
   history you end up with.
5. Give the precise sequence to resolve a merge conflict from the moment Git
   stops, and then give the equivalent sequence for a conflict during a
   *rebase* — calling out the one command that differs between the two.
6. A colleague committed a `.env` file with a real password three commits
   ago and has since added it to `.gitignore`, puzzled that it "keeps showing
   up in the repo." Explain why `.gitignore` didn't help, what command stops
   it being tracked going forward, and why even that isn't enough for a
   genuine leaked secret.
7. You made five scrappy commits (`wip`, `wip2`, `fix`, `fix2`, `done`) on a
   local branch nobody else has. Describe how you'd turn them into two clean
   commits before review, and state why doing this same operation would be
   forbidden if the branch had already been pushed and pulled by teammates.
8. Distinguish `git commit --amend`, `git cherry-pick`, and `git rebase -i`
   by what each one is *for* — give a one-sentence "reach for this when..."
   for each.
9. Someone force-deletes an unmerged branch with `git branch -D
   experiment` and immediately regrets it. Are the commits gone? Outline how
   you'd get them back, and which module's core mechanism you're relying on.
10. Put these operations in order of how *destructive to shared history* they
    are, from "totally safe to do anytime" to "never do this to pushed
    commits," and justify the ranking: `git merge`, `git commit --amend` on
    the last local commit, `git switch -c`, `git rebase` of already-pushed
    commits.

<details>
<summary>Show answers</summary>

1. `HEAD` (a symbolic ref) → the current branch ref (e.g. `refs/heads/main`,
   holding one commit hash) → the **commit** object → its **tree** object →
   the **blob** for that file (the raw bytes). Committing creates new
   tree/commit objects and then rewrites just the branch's ref file to point
   at the new commit — HEAD follows the branch automatically, so only that one
   ref file changes structurally.
2. The version from the *first* `git add` (the earlier edit) is committed;
   `add` snapshots content at that instant and the later edit stayed unstaged.
   `git status` would have listed `app.py` under *both* "Changes to be
   committed" and "Changes not staged for commit." `git diff --staged` right
   before committing would have shown exactly the (stale) content about to be
   recorded.
3. A branch is a ~41-byte pointer, so creating one copies nothing — instant.
   `reset --hard` moves your branch pointer and matches the working tree,
   which *looks* like it deleted commits, but the old commits remain in the
   object database and the reflog still names the previous HEAD — so `git
   reset --hard HEAD@{1}` restores it. The reflog is the recovering mechanism.
4. Both hit a conflict on the shared line (same lines changed on both sides).
   `merge` stops, you resolve, and it records a *merge commit* with two
   parents, leaving a branched graph. `rebase` stops per-replayed-commit, you
   resolve and `--continue`, and it produces a *linear* history with new
   commit hashes and no merge commit.
5. Merge: `git status` to see unmerged paths → edit each file to final
   content and remove all conflict markers → `git add` each → `git commit` to
   finish. Rebase: same up through `git add` each resolved file, but then
   `git rebase --continue` (not `git commit`) resumes it — that's the
   differing command.
6. `.gitignore` only affects files Git *isn't already tracking*; the `.env`
   was committed, so it stays tracked. `git rm --cached .env` stops tracking
   it going forward (leaving the file on disk). Even that isn't enough for a
   real secret because the password still exists in the earlier commit's
   history — it must be rotated (and possibly scrubbed from history, module
   07).
7. Run `git rebase -i HEAD~5`, keep two `pick`s as the anchors, and `squash`
   or `fixup` the rest into them (rewording to clean messages), producing two
   commits. This is forbidden on already-pushed-and-pulled branches because
   rebasing rewrites commit hashes and orphans the ones teammates already
   have — the golden rule against rewriting shared history.
8. `--amend`: reach for it when you need to fix the *very last* commit
   (message or forgotten file). `cherry-pick`: reach for it when you want just
   *one specific commit's change* copied onto your current branch.
   `rebase -i`: reach for it when you need to reshape a *range* of recent
   commits (squash/reword/reorder/drop) before sharing.
9. Not gone — the commits are still in the object database. Find the branch's
   old tip in `git reflog` (or `git fsck --lost-found`) and recreate the
   branch with `git branch experiment <hash>` (or `git switch -c`). You're
   relying on the reflog / object-persistence mechanism from module 03 (and
   deepened in 07).
10. Safe anytime: `git switch -c` (just makes a pointer) and `git merge`
    (adds a commit, rewrites nothing) — both non-destructive. `git commit
    --amend` on the *last local* commit is safe *because it's unshared* (it
    does rewrite, but only history that never left your machine). `git rebase`
    of already-pushed commits is the dangerous one — it rewrites hashes others
    already have, violating the golden rule. Ranking reflects whether the
    operation rewrites history *and* whether that history is shared.

</details>

## Next

Continue to
[04-remotes-and-collaboration](../04-remotes-and-collaboration/README.md) to
take your local repository online — cloning, fetching, pushing, and the two
main ways teams actually collaborate.
