# Pull Requests and Code Review

## Why this matters

A **pull request** (PR) — GitLab calls it a merge request — is how proposed
changes get reviewed, discussed, and integrated on essentially every real
team and open-source project. It's less a Git feature than a *workflow*
built on the Git primitives you already have: a feature branch, a comparison
against a base branch, some conversation, and a merge. The later CI/CD track
hangs automated checks off exactly this flow (tests run on every PR, deploys
run on merge to `main`), so understanding the PR lifecycle — including how to
keep your branch current and which *type* of merge to use — is a direct
prerequisite. This module teaches the practice host-agnostically, using
GitHub as the concrete example because the CI/CD track uses GitHub Actions.

## Concepts

### A PR is a request to merge one branch into another

At its core a PR says: "please merge my `feature-x` branch into `main`."
The host shows the **diff** between the two branches (computed exactly like
`git diff main..feature-x`), the list of commits, and a space for reviewers
to comment. Nothing about your local Git changes — the PR is a
*collaboration layer* the host wraps around the same branch-and-merge
mechanics from modules 02 and 04. When approved, the host performs the merge
on the server; you then `git pull` on `main` to get the result locally.

### The feature-branch lifecycle

The standard flow, end to end:

1. Create a feature branch off an up-to-date `main` (`git switch -c
   feature-x`).
2. Do the work in small, clean commits (modules 01, 03).
3. Push the branch (`git push -u origin feature-x`).
4. Open a PR from `feature-x` into `main` on the host, with a clear title and
   a description of *what* and *why*.
5. Reviewers comment; you push follow-up commits addressing feedback (each
   push updates the PR automatically).
6. Once approved and any required checks pass, the branch is merged.
7. Delete the feature branch (locally and on the remote) — its commits live
   on in `main`.

Keeping branches **short-lived and small** is the single biggest factor in
smooth reviews: a 50-line PR gets a careful review in minutes; a 2,000-line
PR gets a rubber-stamp or sits for a week.

### Writing a reviewable PR (and a reviewable branch)

A good PR is a *communication* artifact. The title states the change
imperatively ("Add rate limiting to the login endpoint"); the description
explains the motivation, the approach, and anything reviewers should focus on
or that's out of scope. Just as important is the *branch* behind it: a history
of clean, logically-separate commits (courtesy of module 03's interactive
rebase) is far easier to review commit-by-commit than one giant blob or a
pile of "wip / fix / oops" commits. Reviewing *before* you request review —
reading your own diff — catches an embarrassing amount.

### Responding to review feedback

When a reviewer asks for changes, you make them and push more commits to the
*same* branch — the PR updates in place, and reviewers can see exactly what
changed since their last look. Two schools of thought on the follow-up
commits: leave them as honest "address review feedback" commits (simplest,
preserves the review conversation's context), or, once approved, tidy them
into the logical commits via an interactive rebase before the final merge
(cleaner history). Because a PR branch is *yours*, rebasing/force-pushing it
(with `--force-with-lease`) after review is one of the legitimate uses of
force from module 04 — you're only rewriting your own unshared-elsewhere
branch.

### Keeping your branch current with a moving `main`

While your PR is open, `main` keeps moving as other PRs merge. Before merging
(and sometimes to resolve conflicts the host flags), you update your branch
against the latest `main`. Two ways, mirroring module 03:

- **Merge `main` into your branch** (`git merge main` / the host's "update
  branch" button) — safe, preserves history, but adds merge commits into your
  feature branch.
- **Rebase your branch onto `main`** (`git rebase main`) — replays your
  commits on top of the latest `main` for a clean linear PR, at the cost of
  rewriting your branch's commits (so you force-push after). Preferred by
  teams that like linear history.

Either way, resolving conflicts here is the same skill from module 02 — the
PR just surfaces *that there is* a conflict; you fix it with plain Git.

### How a PR gets merged: merge commit vs. squash vs. rebase

Hosts offer three merge strategies, and picking the right one matters:

- **Merge commit** ("Create a merge commit") — adds a merge commit tying the
  branch into `main`; every individual commit from the branch appears in
  `main`'s history. Honest and complete, but noisy if the branch had messy
  commits.
- **Squash and merge** — collapses *all* the branch's commits into a single
  new commit on `main`. Keeps `main` tidy (one commit per PR) regardless of
  how messy the branch was; loses the intermediate commit granularity. Very
  popular default.
- **Rebase and merge** — replays the branch's commits onto `main` with no
  merge commit, keeping each commit but linearizing. Clean linear history
  *and* per-commit granularity, but requires the branch commits to be clean
  to be worth it.

The right choice depends on team convention; the key is to *understand* what
each does to `main`'s history so you're not surprised by the result.

### Draft PRs, checks, and approvals gate the merge

Real teams protect `main`: the PR can require passing **status checks** (CI:
tests, linting, builds — the CI/CD track wires these up), one or more
**approvals**, and a **branch protection rule** preventing direct pushes to
`main` so *all* changes flow through reviewed PRs. A **draft PR** signals
"work in progress, not ready for review yet." These gates are why the PR flow
scales to large teams: nothing reaches `main` unreviewed or broken.

## Command reference

The PR itself lives on the host (created in the web UI or with the `gh` CLI),
but the branch work around it is plain Git. This table covers both.

| Command | What it does | Example |
|---|---|---|
| `git switch -c <branch>` | Creates the feature branch for the PR | `git switch -c feature-rate-limit` |
| `git push -u origin <branch>` | Pushes the branch and sets upstream (first push) | `git push -u origin feature-rate-limit` |
| `git fetch origin` | Updates remote-tracking branches before syncing | `git fetch origin` |
| `git rebase origin/main` | Rebases your branch onto the latest `main` for a clean PR | `git rebase origin/main` |
| `git merge origin/main` | Alternative: merges latest `main` into your branch | `git merge origin/main` |
| `git push --force-with-lease` | Updates your PR branch after a rebase, safely | `git push --force-with-lease` |
| `git diff main..HEAD` | Shows exactly what your branch changes vs. `main` (the PR's diff) | `git diff main..HEAD` |
| `git log main..HEAD --oneline` | Lists the commits your PR will introduce | `git log main..HEAD --oneline` |
| `gh pr create` | Opens a PR from the current branch (GitHub CLI) | `gh pr create --fill` |
| `gh pr status` | Shows the state of your PRs | `gh pr status` |
| `gh pr checks` | Shows CI check results for the PR | `gh pr checks` |

Flag breakdown for `git diff main..HEAD`:

- `diff` — compute a difference.
- `main..HEAD` — the two-dot range: "changes on HEAD (your branch) that are
  not on `main`." This is exactly what a PR displays as its diff. (`git log
  main..HEAD` lists the *commits* in that same range.)

Flag breakdown for `gh pr create --fill`:

- `gh pr create` — create a pull request from the current branch against the
  default base branch, using the GitHub CLI.
- `--fill` — auto-populate the PR title and body from your branch's commit
  messages instead of prompting — which is why clean commit messages
  (modules 01, 03) pay off directly here.

Flag breakdown for `git push --force-with-lease` (recap from module 04):

- `--force-with-lease` — overwrite your PR branch on the remote after a
  rebase, but only if it still matches your last-fetched view (so you don't
  clobber anything you didn't expect). The safe force for updating your own
  PR branch.

## Hands-on exercises

Exercises 1-6 use the local bare-repo technique from module 04 so you can
practice the *branch* mechanics of a PR without a host. Exercises 7-9 use a
real GitHub repo (optional but recommended, since the CI/CD track needs your
GitHub setup working). Run in your WSL2 Ubuntu terminal.

1. **Set up a shared "server" and a working clone:**
   ```bash
   mkdir -p ~/learn-git/pr && cd ~/learn-git/pr
   git init --bare server.git
   git clone server.git work && cd work
   echo "# App" > README.md
   git add README.md && git commit -m "Initial commit"
   git push -u origin main
   ```

2. **Create a feature branch and do clean, small commits:**
   ```bash
   git switch -c feature-greeting
   echo "def greet(): return 'hello'" > app.py
   git add app.py && git commit -m "Add greet() function"
   echo "def farewell(): return 'bye'" >> app.py
   git commit -am "Add farewell() function"
   git push -u origin feature-greeting
   ```
   Expect two clean commits pushed on a branch. On a real host, you'd now
   click "Compare & pull request." Preview the PR's contents locally:
   ```bash
   git log main..feature-greeting --oneline
   git diff main..feature-greeting
   ```
   Expect the two commits and the full diff a reviewer would see (Concept 1).

3. **Simulate `main` moving while your PR is open.** In another clone, land
   an unrelated change to `main`:
   ```bash
   cd ~/learn-git/pr
   git clone server.git other && cd other
   echo "LICENSE text" > LICENSE
   git add LICENSE && git commit -m "Add LICENSE"
   git push
   ```
   Now `main` on the server is ahead of where your feature branch started.

4. **Bring your branch up to date by rebasing onto the latest `main`:**
   ```bash
   cd ~/learn-git/pr/work
   git fetch origin
   git switch feature-greeting
   git rebase origin/main
   git log --oneline --all --graph
   ```
   Expect your two commits replayed on top of the commit that added
   `LICENSE` — a clean, linear branch ready to merge (Concept 5). Update the
   PR branch on the remote:
   ```bash
   git push --force-with-lease
   ```
   Expect the force-with-lease push to succeed (legitimate: it's *your* PR
   branch — Concept 4).

5. **Respond to "review feedback" with a follow-up commit:**
   ```bash
   echo "def shout(): return 'HELLO'" >> app.py
   git commit -am "Add shout() per review feedback"
   git push
   git log main..feature-greeting --oneline
   ```
   Expect the new commit added to the branch; on a host, the open PR would
   update automatically and reviewers would see just this new commit
   (Concept 4).

6. **Simulate the three merge strategies and compare the resulting `main`
   history.** You'll do each into a throwaway branch off `main` so you can see
   the difference. First a **merge commit**:
   ```bash
   git switch main && git pull
   git switch -c try-merge-commit
   git merge --no-ff feature-greeting -m "Merge PR: greeting functions"
   git log --oneline --graph
   ```
   Expect all three feature commits *plus* a merge commit. Now a **squash**:
   ```bash
   git switch main
   git switch -c try-squash
   git merge --squash feature-greeting
   git commit -m "Add greeting functions (squashed)"
   git log --oneline --graph
   ```
   Expect a *single* new commit on `try-squash` containing all the changes,
   with no trace of the three individual commits (Concept 6). Now a **rebase
   merge**:
   ```bash
   git switch main
   git switch -c try-rebase-merge
   git rebase feature-greeting   # brings feature commits onto this branch linearly
   git log --oneline --graph
   ```
   Compare all three `git log` outputs and articulate to yourself what each
   did to history — this is the core insight of Concept 6.

7. **(Optional, real GitHub — recommended for the CI/CD track later.)**
   Authenticate the GitHub CLI and create a real repo:
   ```bash
   gh auth login          # follow the browser prompts once
   gh repo create learn-git-pr --private --clone
   cd learn-git-pr
   echo "# Learn PR" > README.md
   git add README.md && git commit -m "Initial commit"
   git push -u origin main
   ```
   If you don't have `gh`, install it with `sudo apt install gh` (or skip
   exercises 7-9). Expect a private repo created and cloned.

8. **Open a real PR with the CLI:**
   ```bash
   git switch -c feature-docs
   echo "## Usage" >> README.md
   git commit -am "Document usage section"
   git push -u origin feature-docs
   gh pr create --fill
   gh pr status
   ```
   Expect `gh pr create --fill` to open a PR titled from your commit message
   (Concept 3 — clean messages pay off), and `gh pr status` to list it as
   open.

9. **Merge the PR (squash) and clean up:**
   ```bash
   gh pr merge --squash --delete-branch
   git switch main && git pull
   git log --oneline
   git branch
   ```
   Expect the PR merged as a single squashed commit on `main`, the remote
   feature branch deleted, and your local `main` updated. `git branch` should
   no longer show the merged feature branch after cleanup (Concept 2, step 7).

## Independent challenge

No commands given — combine the PR flow (this module) with clean commits
(modules 01, 03) and remotes (module 04).

**Task:** Run a complete, realistic PR lifecycle against a repo (a local
bare-repo simulation is fine, a real GitHub repo is better). Start a feature
branch with a *deliberately messy* set of commits, then — before you'd
request review — clean them into a tidy, reviewable history with an
interactive rebase. Open the PR (or produce the equivalent `git diff
main..HEAD` a reviewer would read). While the PR is "open," land an unrelated
change on `main`, then bring your branch current by rebasing onto the updated
`main`, resolving any conflict so nothing is lost, and update the branch
safely. Add one more commit as if responding to a reviewer, then merge using
whichever of the three strategies keeps `main` cleanest for a small
single-purpose change — and be able to justify that choice out loud. Finish
with `main` merged, your branch deleted, and a `git log` on `main` that a
stranger could read.

<details>
<summary>Stuck? One hint</summary>

To bring your branch current, `git fetch` then `git rebase origin/main` (not
merge) keeps the PR linear; after the rebase your branch's commits have new
hashes, so update the remote with `git push --force-with-lease` — the
legitimate use of force because the branch is yours. For a small
single-purpose change, "squash and merge" is usually the tidiest choice.

</details>

## Common mistakes & troubleshooting

- **Giant, long-lived PRs.** A huge diff can't be reviewed carefully and
  invites bugs and merge conflicts. Keep branches small and short-lived —
  split big work into a sequence of small PRs.
- **Requesting review before reading your own diff.** Half of review
  comments are things you'd have caught yourself by reading `git diff
  main..HEAD` first. Self-review before requesting.
- **Force-pushing a branch someone else is also working on.** Force is safe
  on a branch that's *yours alone*; if a teammate has also committed to the
  PR branch, `--force-with-lease` will (correctly) refuse — coordinate
  instead of overriding.
- **Not keeping the branch current, then merging a stale branch.** If `main`
  moved a lot, merge/rebase it into your branch and re-test before merging —
  a green PR against an old `main` can still break the new `main`.
- **Choosing a merge strategy by habit without understanding it.** "Squash"
  erases per-commit granularity; "merge commit" preserves everything
  including mess; "rebase merge" needs clean commits to be worthwhile. Pick
  deliberately based on the branch's commit quality and team convention.
- **Committing straight to `main` and skipping the PR.** On a protected repo
  this just gets rejected; where it's allowed, it bypasses review and CI —
  the whole point of the workflow. Always branch, always PR.

## Checkpoint quiz

Write down your answer to each question before expanding it — checking without attempting first is the single easiest way to fool yourself into thinking you've learned this.

<details>
<summary>Show questions</summary>

1. What *is* a pull request, in terms of the Git primitives from earlier
   modules — and what does opening one actually change about your local
   repository?
2. Walk the feature-branch lifecycle from creating the branch to deleting it
   after merge.
3. Why do small, short-lived branches produce better reviews than one large
   one?
4. Your PR has been open a while and `main` has moved. What are your two
   options for bringing the branch current, and what's the tradeoff between
   them?
5. Compare "merge commit," "squash and merge," and "rebase and merge" by what
   each leaves in `main`'s history.
6. After you rebase your PR branch onto the latest `main`, why do you have to
   force-push, and why is that force *legitimate* here when force-pushing is
   normally discouraged?
7. What do branch protection rules and required status checks accomplish, and
   how does this connect to the CI/CD track that comes later?
8. Why does writing clean commit messages (module 01) pay off specifically at
   PR time?

</details>

<details>
<summary>Show answers</summary>

1. A PR is a request to merge one branch into another (e.g. `feature-x` into
   `main`), wrapped in a review/discussion layer the host provides over plain
   branch-and-merge mechanics. Opening one changes *nothing* locally — it just
   points the host at your pushed branch and shows the diff against the base.
2. Branch off an up-to-date `main` → make small clean commits → push the
   branch → open a PR with a clear title/description → address review feedback
   with follow-up commits → merge once approved and checks pass → delete the
   feature branch (its commits remain in `main`).
3. Small branches produce a small diff a reviewer can actually read carefully
   and reason about, merge faster (less chance `main` drifts and conflicts),
   and isolate one logical change so problems are easy to spot; huge diffs get
   rubber-stamped or stall.
4. Merge `main` into your branch (safe, preserves history, adds merge commits
   to the branch) or rebase your branch onto `main` (clean linear history but
   rewrites your commits, so you force-push after). Merge is simpler and
   non-destructive; rebase is cleaner but requires a force-push.
5. Merge commit: keeps every branch commit plus a merge commit in `main`.
   Squash: collapses the whole branch into one new commit on `main` (no
   intermediate commits). Rebase and merge: replays each branch commit onto
   `main` linearly with no merge commit.
6. The rebase gave your branch's commits new hashes, so the remote branch and
   your local branch have diverged; a normal push would be rejected, so you
   force-push to replace it. It's legitimate because the PR branch is yours
   alone — you're rewriting only your own unshared branch, not shared history
   like `main`. `--force-with-lease` keeps it safe.
7. They ensure nothing reaches `main` unless it went through a reviewed PR
   and passed required automated checks (tests, lint, build), preventing
   unreviewed or broken code from landing. The CI/CD track wires those
   automated checks to run on every PR and deploys on merge, building directly
   on this gate.
8. Because the PR title/body can be auto-generated from commit messages
   (`gh pr create --fill`), reviewers read your history commit-by-commit, and
   squash-merge often uses the commit message as `main`'s commit — so clean
   messages become the PR's and the project's permanent record.

</details>

## Next

Continue to
[06-git-hooks-and-automation](../06-git-hooks-and-automation/README.md) to
make Git run your checks automatically before commits and pushes — and see
how CI systems hook off the very pushes and tags you've been making.
