# Remotes and Collaboration

## Why this matters

Everything so far has been fully local — one repository on your machine.
Collaboration (and backup, and the CI/CD and GitOps tracks later) needs a
**remote**: another copy of the repository that people push to and pull from,
usually hosted on GitHub, GitLab, or Azure DevOps. The concepts that trip
people up here — the difference between `fetch` and `pull`, what a
"tracking branch" is, why a push gets rejected, and the two fundamentally
different collaboration models (forking vs. shared-repo) — are exactly the
ones the rest of the curriculum assumes you have solid. This module makes
them concrete using two clones on your own machine, so you can *see* both
sides of a collaboration without needing a second person.

## Concepts

### A remote is a named bookmark for another repository

A **remote** is just a name (conventionally `origin`) mapped to a URL of
another copy of the repo. It doesn't hold your files — it's a bookmark Git
uses when you `fetch`, `pull`, or `push`. `git remote -v` lists them. A clone
automatically gets one remote named `origin` pointing at wherever you cloned
from. You can have several (e.g. `origin` = your fork, `upstream` = the
original project) — that's the whole basis of the forking workflow below.

### Clone copies the entire repository

`git clone <url>` creates a local repository that is a *complete* copy: all
commits, all history, all branches — not just the latest files (module 00:
every clone is a full, standalone repo). It also sets up the `origin` remote,
creates a local `main` branch tracking `origin/main`, and checks out the
default branch. From that moment your clone works fully offline; it only
talks to the remote when you explicitly `fetch`/`pull`/`push`.

### Remote-tracking branches: your local memory of the remote

After a clone or fetch, Git keeps **remote-tracking branches** like
`origin/main` — read-only local pointers recording "where `main` was on the
remote the last time I checked." They are *not* live; they only update when
you `fetch` (or `pull`, which fetches first). So there are three relevant
pointers for a typical branch: your local `main` (what you're working on),
`origin/main` (your last-known snapshot of the remote's `main`), and the
*actual* `main` on the server (which you can't see without fetching). Keeping
these three straight explains almost every "but I thought I was up to date"
confusion.

### fetch vs. pull: the single most important distinction here

- **`git fetch`** downloads new commits and objects from the remote and
  updates your remote-tracking branches (`origin/main` moves) — but it does
  **not** touch your local branches or working tree. It's the *safe*, "show
  me what's new without changing my work" command. After a fetch you can
  inspect `origin/main` before deciding what to do.
- **`git pull`** is `git fetch` *followed by* an integration of the fetched
  commits into your current branch — by default a **merge** (creating a merge
  commit if histories diverged), or a **rebase** if you configure/ask for
  `--rebase`. It changes your local branch and working tree.

So `pull = fetch + merge (or rebase)`. Beginners reach for `pull` reflexively
and are then surprised by merge commits or conflicts appearing "out of
nowhere." Preferring `fetch`, looking at what arrived, then integrating
deliberately, is a mark of someone who actually understands their repo.

### push: sending your commits up, and why it gets rejected

`git push` uploads your local branch's new commits to the remote and moves
the remote's branch pointer to match. It succeeds only if it can **fast-
forward** the remote branch — i.e. the remote hasn't gained commits you don't
have. If someone else pushed in the meantime, your push is **rejected**
(`! [rejected] ... (fetch first)`) because accepting it would silently drop
their commits. The correct fix is to `git pull` (integrate their work), then
push again — *not* to `--force`. Force-pushing overwrites the remote's
history and is the shared-history golden-rule violation from module 03; it
has legitimate narrow uses (updating your *own* feature branch's PR after a
rebase) but is dangerous on shared branches.

### Upstream / tracking branches: link local to remote

A local branch can have an **upstream** (a.k.a. tracking) branch — the remote
branch it's associated with. When set, `git push`/`git pull` with no
arguments know where to go, and `git status` helpfully says "Your branch is
ahead of 'origin/main' by 2 commits." Clone sets this up for `main`
automatically. For a *new* local branch you created, the first push needs
`git push -u origin <branch>` to both create the remote branch and set the
upstream link; after that, plain `git push` works.

### Two collaboration models: shared-repo vs. forking

There are two dominant ways teams use remotes:

- **Shared-repo (a.k.a. "everyone pushes to one repo").** Everyone has write
  access to a single central repository. You clone it, create a feature
  branch, push that branch to the *same* repo, and open a pull request from
  it. Common inside a single company/team. One remote: `origin`.
- **Forking.** You don't have write access to the original ("upstream")
  repo. You **fork** it — the host makes your own server-side copy — clone
  *your fork*, push branches to your fork, and open a pull request *from your
  fork to upstream*. You keep two remotes: `origin` (your fork, you can push)
  and `upstream` (the original, you fetch from it to stay current but can't
  push). Standard for open-source contribution.

Both models funnel changes through a pull request (module 05); the only
difference is *where the branch lives* and *who can push where*. Recognizing
which model you're in tells you what your remotes should be.

## Command reference

| Command | What it does | Example |
|---|---|---|
| `git clone <url>` | Copies a remote repo locally, sets up `origin`, checks out default branch | `git clone https://github.com/me/app.git` |
| `git clone <url> <dir>` | Clones into a named directory | `git clone ../server.git clone-b` |
| `git remote -v` | Lists configured remotes and their URLs | `git remote -v` |
| `git remote add <name> <url>` | Adds a new remote under a name | `git remote add upstream https://github.com/org/app.git` |
| `git fetch <remote>` | Downloads new commits; updates remote-tracking branches only | `git fetch origin` |
| `git pull` | Fetches, then merges (or rebases) into the current branch | `git pull` |
| `git pull --rebase` | Fetches, then rebases your commits on top instead of merging | `git pull --rebase` |
| `git push` | Uploads current branch's commits to its upstream | `git push` |
| `git push -u <remote> <branch>` | Pushes a branch and sets it as upstream | `git push -u origin feature-x` |
| `git push --force-with-lease` | Force-push that refuses if the remote moved unexpectedly (safer force) | `git push --force-with-lease` |
| `git branch -vv` | Lists local branches with their upstream and ahead/behind counts | `git branch -vv` |
| `git remote show <name>` | Detailed status of a remote and its branches | `git remote show origin` |

Flag breakdown for `git push -u origin feature-x`:

- `push` — upload local commits to a remote.
- `-u` (`--set-upstream`) — additionally record `origin/feature-x` as this
  local branch's upstream, so future `git push`/`git pull` need no arguments.
- `origin` — the remote to push to.
- `feature-x` — the branch to push (and create on the remote if absent).

Flag breakdown for `git pull --rebase`:

- `pull` — fetch then integrate.
- `--rebase` — integrate by *rebasing* your local commits on top of the
  fetched commits (linear history) instead of the default merge (which would
  create a merge commit when histories diverged). Popular for keeping feature
  branches clean.

Flag breakdown for `git push --force-with-lease`:

- `--force-with-lease` — overwrite the remote branch, but *only* if it still
  points where your remote-tracking branch says it does; if someone else
  pushed since your last fetch, it refuses. This is the safe form of
  `--force` — it won't silently clobber a teammate's new work.

## Hands-on exercises

You'll simulate a full collaboration using *local* repositories only — no
GitHub account required. The trick: create a **bare** repo to act as the
"server," then two clones to act as two developers. Run all of this in your
WSL2 Ubuntu terminal.

1. **Create a "server" (bare) repo and a first clone with content.**
   ```bash
   mkdir -p ~/learn-git/remotes && cd ~/learn-git/remotes
   git init --bare server.git
   git clone server.git dev-a
   cd dev-a
   echo "# Shared Project" > README.md
   git add README.md && git commit -m "Initial commit"
   git push -u origin main
   ```
   A **bare** repo (`--bare`) has no working tree — it's just the `.git`
   database, exactly what a hosting service stores. Expect the push to
   succeed and set the upstream. `git remote -v` shows `origin` pointing at
   `server.git`.

2. **Clone a second developer's copy and confirm it's a full repo:**
   ```bash
   cd ~/learn-git/remotes
   git clone server.git dev-b
   cd dev-b
   git log --oneline
   git remote -v
   ```
   Expect `dev-b` to already contain the "Initial commit" (clone copied all
   history) and to have its own `origin` remote. Two independent full clones
   now exist.

3. **See remote-tracking branches and the three pointers:**
   ```bash
   git branch -vv
   git branch -a
   ```
   Expect `main` tracking `origin/main`, and `git branch -a` to list both the
   local `main` and the remote-tracking `remotes/origin/main` (Concept 3).

4. **Developer A makes and pushes a change:**
   ```bash
   cd ~/learn-git/remotes/dev-a
   echo "A's first feature" >> README.md
   git commit -am "Add A's feature"
   git push
   ```
   Expect a successful push — the server's `main` now has A's commit.

5. **Developer B fetches (not pulls) and inspects before integrating:**
   ```bash
   cd ~/learn-git/remotes/dev-b
   git fetch origin
   git log --oneline main
   git log --oneline origin/main
   ```
   Expect B's local `main` to *still* show only the initial commit, while
   `origin/main` now shows A's new commit — proof that `fetch` updated the
   remote-tracking branch **without** touching B's local branch or files
   (Concept 4). Look at the difference explicitly:
   ```bash
   git log --oneline main..origin/main
   ```
   Expect it to list exactly A's commit — "what's on the remote that I don't
   have locally yet."

6. **Now integrate with pull and see the result:**
   ```bash
   git pull
   git log --oneline
   cat README.md
   ```
   Expect B's local `main` to fast-forward to include A's commit, and the
   README to now contain A's line. This `pull` was `fetch` (already done,
   repeated harmlessly) + a fast-forward merge (Concept 4).

7. **Create a divergence to trigger a rejected push.** Have both developers
   commit without syncing:
   ```bash
   # Developer B commits and pushes
   echo "B's feature" >> README.md
   git commit -am "Add B's feature"
   git push
   # Now Developer A commits WITHOUT pulling B's push
   cd ~/learn-git/remotes/dev-a
   echo "A's second feature" >> README.md
   git commit -am "Add A's second feature"
   git push
   ```
   Expect A's push to be **rejected** with `! [rejected]` and a hint to
   "fetch first" / "Updates were rejected because the remote contains work
   that you do not have locally" (Concept 5). This is the single most common
   real-world push error.

8. **Diagnose and fix the rejected push the correct way.** *Do not* force.
   Integrate first, resolving the conflict (both edited the README's end):
   ```bash
   git pull --rebase
   ```
   Expect a conflict in `README.md` (both added a line at the end). Resolve
   it so *both* features survive — edit the file to contain A's second
   feature *and* B's feature, remove any conflict markers, then:
   ```bash
   git add README.md
   git rebase --continue
   git push
   ```
   Expect the push to now succeed. You reconciled the histories instead of
   clobbering B's work — the right response to a rejection every time
   (Concept 5). Confirm from B's side:
   ```bash
   cd ~/learn-git/remotes/dev-b
   git pull
   cat README.md
   ```
   Expect both features present in B's copy too.

9. **Push a new feature branch and set its upstream:**
   ```bash
   cd ~/learn-git/remotes/dev-a
   git switch -c feature-login
   echo "login page" > login.txt
   git add login.txt && git commit -m "Add login page"
   git push -u origin feature-login
   git branch -vv
   ```
   Expect the branch created on the server and `feature-login` now tracking
   `origin/feature-login` (Concept 6). A plain `git push` works from now on.

10. **Set up the forking model with a second remote (`upstream`).** Simulate
    a fork by adding the "server" as an `upstream` on a fresh clone that
    treats a *different* location as its `origin` fork. For simplicity here,
    add an `upstream` remote pointing at the same server and observe the
    two-remote shape:
    ```bash
    cd ~/learn-git/remotes/dev-b
    git remote add upstream ~/learn-git/remotes/server.git
    git remote -v
    git fetch upstream
    git branch -a
    ```
    Expect `git remote -v` to now list *both* `origin` and `upstream`, and
    `git branch -a` to show `remotes/upstream/*` tracking branches. In a real
    fork, `origin` would be your writable fork and `upstream` the original
    read-only project — you'd `fetch upstream` to stay current and push
    branches to `origin` (Concept 7).

11. **Read the whole collaboration state:**
    ```bash
    git remote show origin
    git log --oneline --all --graph
    ```
    Expect a summary of tracked branches and their sync status, and a graph
    showing the merged/rebased collaboration you just simulated.

## Independent challenge

No commands given — combine remotes (this module) with branching (module 02)
and the reflog safety net (module 03).

**Task:** Using the bare-repo-plus-two-clones technique, stage a realistic
race condition and resolve it *without ever force-pushing*. Have both
simulated developers start from the same commit, each create a commit that
edits the same file, and have one of them push first so the other's push is
rejected. The second developer must then bring in the first developer's work,
reconcile the conflict so neither change is lost, and successfully push — and
you should be able to explain afterward exactly why the push was rejected in
terms of fast-forwarding, and why the fix you used (integrate-then-push) is
correct where `--force` would have been wrong. As a final step, from a
*third* fresh clone of the server, verify that both developers' changes are
present — proving the server is the shared source of truth.

<details>
<summary>Stuck? One hint</summary>

The rejection happens because the remote's branch gained a commit yours
doesn't descend from, so your push can't fast-forward it; the fix is `git
pull` (or `git pull --rebase`) to integrate that commit into your history —
resolving the conflict so both edits survive — and *then* push, which now
fast-forwards cleanly.

</details>

## Common mistakes & troubleshooting

- **Reaching for `git pull` when you meant "just show me what's new."**
  `pull` changes your working branch (merge/rebase, possible conflicts).
  `git fetch` + inspecting `origin/main` first is safer and clearer; pull
  only when you're ready to integrate.
- **`--force`-ing a rejected push on a shared branch.** A rejection means the
  remote has commits you'd overwrite. Force-pushing deletes a teammate's
  work. `git pull` to integrate, then push. Reserve force (ideally `--force-
  with-lease`) for *your own* feature branch after a deliberate rebase.
- **Forgetting `-u` on the first push of a new branch.** Without it Git
  complains "no upstream branch." Use `git push -u origin <branch>` the first
  time; plain `git push` works thereafter.
- **Thinking `origin/main` updates by itself.** It only moves when you
  `fetch` (or `pull`). A stale `origin/main` isn't a bug — you just haven't
  fetched. `git status` reports ahead/behind relative to your *last fetch*,
  not live.
- **Confusing "I committed" with "I pushed."** Committing is local only.
  Until you `push`, nothing is on the server and no teammate (and no CI) can
  see it. Conversely, `git fetch` downloads without merging — downloaded
  isn't the same as integrated.
- **Being in the wrong collaboration model.** If you can't push to a repo,
  you're in the forking model — fork it, set `origin` to your fork and
  `upstream` to the original, and open the PR from your fork. Trying to push
  branches directly to a repo you lack write access to just fails.

## Checkpoint quiz

Write down your answer to each question before expanding it — checking without attempting first is the single easiest way to fool yourself into thinking you've learned this.

<details>
<summary>Show questions</summary>

1. What is a remote, and what does `git clone` set up automatically beyond
   copying files?
2. What exactly is a remote-tracking branch like `origin/main`, and when does
   it update?
3. Spell out the difference between `git fetch` and `git pull`, including
   what `pull` does that `fetch` doesn't.
4. Your `git push` is rejected with "Updates were rejected... fetch first."
   What happened, what's the correct fix, and what's the *wrong* fix that
   would lose someone's work?
5. What does the `-u` in `git push -u origin feature-x` accomplish, and why
   do you only need it once per branch?
6. Describe the shared-repo model and the forking model, and how the set of
   remotes on your clone differs between them.
7. What's the difference between `git push --force` and `git push
   --force-with-lease`, and when is *either* legitimately used?
8. You committed locally an hour ago but a teammate says they can't see your
   change. What did you most likely forget, and how is that different from
   having merely fetched?

</details>

<details>
<summary>Show answers</summary>

1. A remote is a named bookmark (e.g. `origin`) for the URL of another copy
   of the repo. `git clone` copies all history, adds the `origin` remote,
   creates a local `main` tracking `origin/main`, and checks out the default
   branch.
2. It's a read-only local pointer recording where a branch was on the remote
   the last time you contacted it. It updates only when you `git fetch` (or
   `git pull`, which fetches first) — never on its own.
3. `git fetch` downloads new commits and moves your remote-tracking branches,
   but leaves your local branches and working tree untouched. `git pull` does
   that fetch *and then* integrates the fetched commits into your current
   branch (merge by default, or rebase with `--rebase`), changing your branch
   and files. `pull = fetch + merge/rebase`.
4. The remote gained commits your branch doesn't contain, so your push can't
   fast-forward it. Correct fix: `git pull` (or `git pull --rebase`) to
   integrate those commits, resolve any conflict, then push. Wrong fix: `git
   push --force`, which overwrites the remote and discards the teammate's
   commits.
5. `-u` sets the pushed branch as the local branch's upstream (tracking)
   branch, so future `git push`/`git pull` need no arguments. You need it only
   once because the link is stored persistently after the first push.
6. Shared-repo: everyone has write access to one central repo; you push
   feature branches to it (`origin` only) and PR within it. Forking: you lack
   write access, so you fork the repo, push to your fork (`origin`) and keep
   the original as `upstream` (read-only, fetched to stay current), opening
   PRs from fork to upstream. Forking uses two remotes; shared-repo uses one.
7. `--force` overwrites the remote branch unconditionally. `--force-with-
   lease` overwrites only if the remote still matches your last-fetched view
   (refuses if someone else pushed meanwhile), making it safe. Either is
   legitimate mainly for updating *your own* feature branch after a rebase —
   never routine on shared branches.
8. You most likely forgot to `git push` — committing is purely local, so
   nothing reached the server. That's different from fetching, which
   *downloads* others' work without integrating; both "committed but not
   pushed" and "fetched but not merged" are states where data exists but
   hasn't propagated where you assumed.

</details>

## Next

Continue to
[05-pull-requests-and-code-review](../05-pull-requests-and-code-review/README.md)
to turn "push a branch" into the full propose-review-merge workflow real
teams (and the later CI/CD track) run on.
