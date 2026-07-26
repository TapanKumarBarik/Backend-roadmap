# Git Hooks and Automation

## Why this matters

A lot of "quality gates" you'd otherwise enforce by nagging people — no
committing broken formatting, no committing a debug print, every commit
message following a convention, running the tests before you push — can be
made automatic with **Git hooks**: scripts Git runs at defined moments in
its workflow. Understanding hooks also demystifies the whole CI/CD track
ahead: continuous integration is fundamentally "a server runs your checks
automatically when you push or tag," which is the *server-side* cousin of the
*client-side* hooks you'll write here. This module gives you working hooks
plus a clear mental map of where local automation ends and CI begins — the
bridge into track 10.

## Concepts

### Hooks are scripts Git runs at lifecycle moments

A **hook** is just an executable script in a repo's `.git/hooks/` directory
with a specific name (`pre-commit`, `commit-msg`, `pre-push`, ...). At the
matching moment in a Git operation, Git runs it. If a hook that runs *before*
an action exits with a **non-zero** status, Git **aborts** the action —
that's the entire enforcement mechanism. Hooks are ordinary scripts (bash,
Python, anything with a shebang), so they can run linters, tests, formatters,
or custom checks. Git ships disabled `.sample` versions of each in
`.git/hooks/` to show you the available names; you activate one by creating a
file with the real name (no `.sample`) and making it executable.

### Client-side vs. server-side hooks

- **Client-side hooks** run on *your* machine during *your* Git operations —
  `pre-commit`, `prepare-commit-msg`, `commit-msg`, `pre-push`, and more.
  They give fast feedback but are advisory: they live in *your* `.git/hooks/`,
  aren't cloned with the repo, and a determined user can bypass them (`git
  commit --no-verify`). Great for catching your own mistakes early; not a
  security boundary.
- **Server-side hooks** run on the *remote* when it receives a push —
  `pre-receive`, `update`, `post-receive`. Because they run on the server no
  one can skip them, so they *can* enforce policy (reject a push that breaks
  a rule, trigger a deploy). On hosted platforms like GitHub you don't write
  raw server hooks; the platform exposes the same idea as **branch protection
  rules and CI checks** — the enforced gate from module 05.

The key distinction: client-side hooks *help* you; server-side enforcement
*binds* everyone. Real teams use both — local hooks for speed, CI for the
authoritative gate.

### The commit-time hooks: pre-commit and commit-msg

Two client-side hooks cover most local automation:

- **`pre-commit`** runs *after* you `git commit` but *before* the commit is
  created and before the message editor opens. It gets no arguments; it
  typically inspects the staged changes (lint, format-check, run fast tests)
  and exits non-zero to block a bad commit. This is where "don't let me commit
  code with a syntax error or a leftover `TODO: remove`" lives.
- **`commit-msg`** runs after you write the message; Git passes it the path
  to a temp file containing the message. It validates or rewrites the message
  — e.g. enforce a `type: summary` convention, require a ticket number, or
  reject an empty/`wip` message. Exiting non-zero aborts the commit.

Between them you enforce *both* what goes into a commit and how it's
described — the two things module 01 said make history useful.

### pre-push and the bridge to CI

**`pre-push`** runs before `git push` sends anything, receiving the remote
and the refs being pushed on stdin. It's the natural place for slower checks
you don't want on every commit but *do* want before code leaves your machine
— running the full test suite, for instance. Conceptually `pre-push` is the
*local rehearsal* of what CI does *authoritatively* on the server: both say
"run the checks before this code is allowed to proceed." The difference is
only *where* and *whether it can be skipped*. Understanding `pre-push` makes
the jump to "CI runs on every push" feel like the same idea moved to a place
nobody can bypass.

### Tags: marking commits, and why CI cares about them

A **tag** is a named pointer to a specific commit (module 00's fourth object
type), used to mark meaningful points — almost always releases (`v1.4.0`).
Two kinds: a **lightweight tag** is just a name pointing at a commit; an
**annotated tag** (`git tag -a`) is a full tag *object* with a message,
tagger, and date — preferred for releases because it records who tagged what
and when. Tags don't move as you commit (unlike branches). They matter here
because **CI systems very commonly trigger off tags**: pushing `v1.4.0` is
the conventional signal "build and publish this as a release." You push tags
explicitly (`git push origin v1.4.0` or `git push --tags`) — a normal `git
push` does *not* send tags.

### How CI systems trigger off Git events

Continuous-integration platforms (GitHub Actions, GitLab CI, Azure Pipelines)
watch a repository and run a defined pipeline when a Git event happens. The
common triggers, all things you now understand as Git operations:

- **on push** to a branch — run tests/lint/build for every commit that lands.
- **on pull request** — run checks against the proposed merge (the module 05
  gate).
- **on tag push** (often `v*`) — build and publish a release.

The pipeline is defined *in the repo* (e.g. a YAML file under
`.github/workflows/`), so the automation is versioned alongside the code. You
don't build a pipeline in this track — that's track 10 — but you should leave
this module able to say precisely *which Git action* fires *which kind of CI
job*, because that mapping is the entire premise of CI/CD.

### Sharing hooks with a team (core.hooksPath)

Because `.git/hooks/` isn't cloned, a hook you write only protects *you*.
Teams share hooks by committing them into a tracked directory and pointing
Git at it with `git config core.hooksPath <dir>`, or by using a hook manager
(like the popular `pre-commit` framework) configured via a committed file
everyone installs. The principle: to make a client-side check *reliable*
across a team you must both distribute it (in the repo) and back it with
server-side/CI enforcement, since any individual can still `--no-verify`
locally.

## Command reference

| Command | What it does | Example |
|---|---|---|
| `ls .git/hooks` | Lists available hook sample scripts and any active hooks | `ls .git/hooks` |
| `chmod +x .git/hooks/<hook>` | Makes a hook script executable so Git will run it | `chmod +x .git/hooks/pre-commit` |
| `git commit --no-verify` | Commits while *skipping* `pre-commit` and `commit-msg` hooks | `git commit --no-verify -m "wip"` |
| `git push --no-verify` | Pushes while skipping the `pre-push` hook | `git push --no-verify` |
| `git config core.hooksPath <dir>` | Points Git at a shared, tracked hooks directory | `git config core.hooksPath .githooks` |
| `git tag <name>` | Creates a lightweight tag at HEAD | `git tag v1.0.0` |
| `git tag -a <name> -m "msg"` | Creates an annotated tag (object with message/date) | `git tag -a v1.0.0 -m "First release"` |
| `git tag` | Lists tags | `git tag` |
| `git show <tag>` | Shows a tag's target commit (and annotation, if any) | `git show v1.0.0` |
| `git push origin <tag>` | Pushes one tag to the remote | `git push origin v1.0.0` |
| `git push --tags` | Pushes all local tags to the remote | `git push --tags` |

Flag breakdown for `git tag -a v1.0.0 -m "First release"`:

- `tag` — create/list/manage tags.
- `-a v1.0.0` — create an **a**nnotated tag named `v1.0.0` (a real tag
  object with tagger, date, and message), as opposed to a lightweight tag
  (just a name). Annotated is preferred for releases.
- `-m "First release"` — the annotation message stored in the tag object
  (analogous to a commit message).

Flag breakdown for `git commit --no-verify`:

- `commit` — record the staged snapshot.
- `--no-verify` — skip the `pre-commit` and `commit-msg` hooks entirely. It
  exists for emergencies, and its existence is exactly *why* client-side
  hooks can't be a security boundary — anyone can bypass them, which is why
  authoritative enforcement lives server-side/CI.

Flag breakdown for `git config core.hooksPath .githooks`:

- `config` — set a configuration value.
- `core.hooksPath` — the key that tells Git to look for hooks in a directory
  *other than* `.git/hooks/`.
- `.githooks` — a tracked, committed directory so the whole team gets the
  same hooks on clone (once they set this config, often via a setup script).

## Hands-on exercises

Run these in your WSL2 Ubuntu terminal on a fresh repo.

1. **Create a repo and look at the sample hooks Git ships:**
   ```bash
   mkdir -p ~/learn-git/hooks && cd ~/learn-git/hooks
   git init
   ls .git/hooks
   ```
   Expect a list of `*.sample` files — `pre-commit.sample`,
   `commit-msg.sample`, `pre-push.sample`, etc. These are inert templates;
   Git only runs a hook whose filename has *no* `.sample` suffix and is
   executable (Concept 1).

2. **Write a `pre-commit` hook that blocks a debug marker.** This rejects any
   commit whose staged changes contain the string `DEBUG_PRINT`:
   ```bash
   cat > .git/hooks/pre-commit <<'EOF'
   #!/bin/bash
   if git diff --cached | grep -q 'DEBUG_PRINT'; then
     echo "pre-commit: refusing to commit DEBUG_PRINT — remove it first." >&2
     exit 1
   fi
   exit 0
   EOF
   chmod +x .git/hooks/pre-commit
   ```
   The `git diff --cached` inspects the *staged* changes (module 01); a
   non-zero `exit 1` aborts the commit (Concept 1).

3. **Watch the hook block a bad commit, then allow a good one:**
   ```bash
   echo "x = 1  # DEBUG_PRINT" > app.py
   git add app.py
   git commit -m "Add app"
   ```
   Expect the commit to be **rejected** with your message and *no* commit
   created (`git log` shows nothing). Now fix and retry:
   ```bash
   echo "x = 1" > app.py
   git add app.py
   git commit -m "Add app"
   git log --oneline
   ```
   Expect the commit to succeed this time. The `pre-commit` hook enforced a
   rule automatically (Concept 3).

4. **Prove `--no-verify` bypasses it (and reflect on why that matters):**
   ```bash
   echo "y = 2  # DEBUG_PRINT" >> app.py
   git add app.py
   git commit --no-verify -m "Sneak past the hook"
   git log --oneline
   ```
   Expect the commit to go through *despite* the marker — `--no-verify` skips
   client-side hooks (Concept 2). This is exactly why local hooks help but
   can't *enforce*: anyone can bypass them, which is what CI/server-side gates
   are for. Undo that so your history is clean:
   ```bash
   git reset --hard HEAD~1
   echo "y = 2" >> app.py && git add app.py && git commit -m "Add y"
   ```

5. **Write a `commit-msg` hook enforcing a message convention.** Require the
   summary to start with a `type:` prefix (`feat:`, `fix:`, `docs:`, etc.):
   ```bash
   cat > .git/hooks/commit-msg <<'EOF'
   #!/bin/bash
   msg_file="$1"
   first_line=$(head -n1 "$msg_file")
   if ! echo "$first_line" | grep -qE '^(feat|fix|docs|refactor|test|chore): .+'; then
     echo "commit-msg: message must start with 'type: ' (feat|fix|docs|refactor|test|chore)." >&2
     exit 1
   fi
   exit 0
   EOF
   chmod +x .git/hooks/commit-msg
   ```
   Git passes the message file path as `$1` (Concept 3).

6. **See the message hook reject then accept:**
   ```bash
   echo "z = 3" >> app.py && git add app.py
   git commit -m "added a thing"
   ```
   Expect rejection (no `type:` prefix). Now with a conforming message:
   ```bash
   git commit -m "feat: add z variable"
   git log --oneline
   ```
   Expect success. You now enforce *what* is committed (`pre-commit`) and
   *how it's described* (`commit-msg`) automatically.

7. **Write a `pre-push` hook that runs a "test":**
   ```bash
   cat > .git/hooks/pre-push <<'EOF'
   #!/bin/bash
   echo "pre-push: running tests..."
   if [ -f FAIL_TESTS ]; then
     echo "pre-push: tests failed — aborting push." >&2
     exit 1
   fi
   echo "pre-push: tests passed."
   exit 0
   EOF
   chmod +x .git/hooks/pre-push
   ```
   Set up a bare remote to push to, then push (tests "pass" because no
   `FAIL_TESTS` file exists):
   ```bash
   git init --bare ../hooks-server.git
   git remote add origin ../hooks-server.git
   git push -u origin main
   ```
   Expect the "running tests / tests passed" lines from your hook before the
   push completes (Concept 4). Now simulate a failing suite:
   ```bash
   touch FAIL_TESTS
   echo "w = 4" >> app.py && git add app.py && git commit -m "feat: add w"
   git push
   ```
   Expect the push **aborted** by the hook. This is the local rehearsal of a
   CI gate (Concept 4). Clean up: `rm FAIL_TESTS`, then `git push` succeeds.

8. **Create and push tags — the CI release signal:**
   ```bash
   git tag -a v1.0.0 -m "First release"
   git tag
   git show v1.0.0 | head
   git push origin v1.0.0
   ```
   Expect an annotated tag created (note `git show` reveals a *tag object*
   with your message and the target commit — Concept 5) and pushed. Confirm a
   plain push wouldn't have sent it: create a lightweight tag and see it's
   *not* pushed by a normal push:
   ```bash
   git tag v1.0.1-lite
   git push origin main
   ```
   The `v1.0.1-lite` tag stays local — tags need `git push <tag>` or `git
   push --tags` (Concept 5). This is exactly the mechanism a CI pipeline
   watches for to build a release.

9. **Share hooks the team way with `core.hooksPath`:**
   ```bash
   mkdir .githooks
   cp .git/hooks/pre-commit .githooks/pre-commit
   chmod +x .githooks/pre-commit
   git config core.hooksPath .githooks
   git add .githooks && git commit -m "chore: add shared pre-commit hook"
   ```
   Now the hook lives in a *tracked* directory that clones with the repo, and
   `core.hooksPath` tells Git to use it (Concept 6). Verify it still fires:
   ```bash
   echo "q = 5  # DEBUG_PRINT" >> app.py && git add app.py
   git commit -m "feat: add q"
   ```
   Expect the shared hook to block it just like the `.git/hooks/` copy did —
   but now it's committed for everyone.

10. **Diagnose and fix: "my hook isn't running."** This is the classic hook
    gotcha. Reproduce it — a hook that isn't executable:
    ```bash
    cat > .git/hooks/pre-commit <<'EOF'
    #!/bin/bash
    echo "this hook should block everything" >&2
    exit 1
    EOF
    # Note: NOT running chmod +x
    git config --unset core.hooksPath   # go back to default hooks dir for this test
    echo "r = 6" >> app.py && git add app.py
    git commit -m "feat: add r"
    ```
    Expect the commit to **succeed** even though the hook should block
    everything — because the file isn't executable, Git silently skips it.
    That silent skip is the number-one reason "my hook does nothing." Fix and
    confirm:
    ```bash
    chmod +x .git/hooks/pre-commit
    echo "s = 7" >> app.py && git add app.py
    git commit -m "feat: add s"
    ```
    Expect the commit now blocked by the hook. Restore your working state:
    `rm .git/hooks/pre-commit` and `git config core.hooksPath .githooks`.

## Independent challenge

No commands given — combine hooks (this module) with the commit hygiene from
module 01 and the tag/CI concepts here.

**Task:** Set up a repository whose *local* automation enforces a small but
real policy end to end, then reason about its limits. Write a `pre-commit`
hook that blocks commits containing an obvious secret pattern (e.g. a line
matching something like `API_KEY=` with a value) *and* a `commit-msg` hook
that requires a conventional-commit-style prefix, and demonstrate each
blocking a bad attempt and allowing a good one. Then create an annotated
release tag and push it, and write down — in your own words, as if explaining
to a teammate — the exact chain of what a CI system *would* do when it sees
that tag versus what it does on an ordinary branch push, and why your local
hooks, however good, are not a substitute for that server-side enforcement.
Finally, move your hooks into a tracked, shared location so a fresh clone
could pick them up.

<details>
<summary>Stuck? One hint</summary>

Your `pre-commit` hook should `grep` the staged diff (`git diff --cached`)
for the secret pattern and `exit 1` on a match; to make the hooks shareable,
put them in a committed directory (e.g. `.githooks/`) and point Git at it with
`git config core.hooksPath .githooks`. Remember the punchline for the write-up:
`git commit --no-verify` can skip any client-side hook, which is precisely why
CI's server-side check is the one that actually binds everyone.

</details>

## Common mistakes & troubleshooting

- **Hook doesn't run because it isn't executable.** The most common hook
  bug — Git silently ignores a non-executable hook. `chmod +x
  .git/hooks/<name>` and confirm with `ls -l`.
- **Hook doesn't run because of the filename.** It must be exactly
  `pre-commit` (etc.) with *no* `.sample` extension, in `.git/hooks/` (or
  your `core.hooksPath` directory). `pre-commit.sample` never runs.
- **Assuming client-side hooks enforce anything.** They don't — `--no-verify`
  bypasses them and they aren't cloned. They're for fast local feedback;
  real enforcement is server-side/CI (module 05's branch protection).
- **Expecting `.git/hooks/` to be shared by cloning.** It isn't — hooks in
  `.git/` never travel with the repo. Use `core.hooksPath` pointing at a
  tracked directory, or a hook-manager framework, to distribute them.
- **Forgetting tags aren't pushed by default.** `git push` sends commits, not
  tags. Push tags explicitly with `git push origin <tag>` or `git push
  --tags` — otherwise your release tag (and the CI job that watches for it)
  never sees it.
- **Using a lightweight tag for a release.** Prefer annotated tags (`git tag
  -a`) for releases so there's a recorded tagger, date, and message; some
  tooling and `git describe` behavior also expects annotated tags.

## Checkpoint quiz

Write down your answer to each question before expanding it — checking without attempting first is the single easiest way to fool yourself into thinking you've learned this.

<details>
<summary>Show questions</summary>

1. What is a Git hook, where do client-side hooks live, and what does a
   pre-action hook's exit code determine?
2. What's the difference between a `pre-commit` hook and a `commit-msg` hook —
   when does each run and what does each typically check?
3. Why are client-side hooks described as "advisory" rather than
   "enforcing," and what actually makes a check enforceable across a team?
4. How is `pre-push` conceptually the same idea as CI, and what's the key
   difference?
5. Name the three common Git events CI systems trigger off, and what kind of
   job each typically runs.
6. What's the difference between a lightweight tag and an annotated tag, and
   why do release/CI workflows care about tags at all?
7. You wrote `.git/hooks/pre-commit` but it never runs. Give the two most
   likely reasons.
8. Your teammate clones the repo and your carefully-written hooks don't run
   for them. Why, and what's the mechanism to fix it?

</details>

<details>
<summary>Show answers</summary>

1. A hook is a script Git runs at a defined lifecycle moment. Client-side
   hooks live in the repo's `.git/hooks/` directory (or a `core.hooksPath`
   directory). If a hook that runs *before* an action exits non-zero, Git
   aborts that action.
2. `pre-commit` runs after `git commit` but before the commit is created and
   before the message editor; it inspects staged changes (lint/format/tests)
   and blocks bad content. `commit-msg` runs after you write the message
   (receiving the message file path) and validates/rewrites the message (e.g.
   enforce a prefix). Both abort on non-zero exit.
3. Because they run only on the individual's machine, aren't cloned with the
   repo, and can be skipped with `--no-verify` — so they help the willing but
   bind no one. Enforceability requires server-side/CI checks (e.g. branch
   protection with required status checks) that run where users can't bypass
   them.
4. Both run your checks before code is allowed to proceed — `pre-push` locally
   before the push leaves your machine, CI authoritatively on the server after
   it arrives. The key difference is *where* it runs and that CI can't be
   skipped, whereas `pre-push` can (`--no-verify`).
5. Push to a branch (run tests/lint/build per commit), pull request (run
   checks against the proposed merge), and tag push (build/publish a release).
6. A lightweight tag is just a name pointing at a commit; an annotated tag is
   a full tag object with tagger, date, and message (preferred for releases).
   Workflows care because pushing a tag like `v1.4.0` is the conventional
   signal for CI to build and publish a release.
7. Most likely: (a) the file isn't executable (`chmod +x` needed), or (b) the
   filename is wrong — e.g. it still has the `.sample` suffix or isn't exactly
   `pre-commit`.
8. Because `.git/hooks/` is never cloned — hooks don't travel with the repo.
   Fix it by committing the hooks into a tracked directory and pointing Git at
   it with `git config core.hooksPath <dir>` (or use a hook-manager framework),
   so a fresh clone can adopt them.

</details>

## Cumulative review

Closed-book. Don't reopen modules 00-06 while attempting these — mix
everything from the object model through hooks and CI triggers.

1. Trace what physically happens in `.git` from the moment you `git commit`
   through `git push`: which objects are created, which ref moves locally,
   and what `push` actually transfers and updates on the remote (modules 00,
   01, 04).
2. You have a messy local feature branch nobody else has pulled, a `main`
   that's moved on the remote, and a `pre-commit` hook that blocks a debug
   marker. Describe, in order, how you'd get from "messy local work" to a
   clean, reviewable, up-to-date PR branch — naming the module each step comes
   from — and where the hook does and doesn't help you.
3. A `git push` is rejected. Explain the fast-forward reason it's rejected
   (module 04), why `git commit --amend`-ing or rebasing to "fix" it could
   make things *worse* if the branch were shared (module 03), and the correct
   non-destructive resolution.
4. Compare and contrast a `pre-push` hook and a CI "run tests on push" job on
   four axes: where they run, whether they can be bypassed, whether they're
   shared automatically, and which one you'd trust as the gate before
   production (modules 05, 06).
5. Someone force-pushed a rebased `main`, and a teammate's `git pull` now
   shows a mess of conflicts and "divergent branches." Explain, using the
   golden rule (module 03) and remote-tracking branches (module 04), exactly
   what went wrong and why the golden rule exists.
6. You need to ship a hotfix that exists as a single commit on a `develop`
   branch, onto a `release` branch, without bringing anything else from
   `develop`. Which command from module 03 do you use, what does it do to the
   commit's identity, and how does that relate to why a merge would have been
   the wrong tool?
7. Design the *local + server* automation to guarantee that (a) no commit
   with a `TODO: remove` reaches `main`, and (b) every commit message follows
   a convention — and be explicit about which half is advisory and which is
   enforcing, and why you need both (modules 05, 06).
8. Explain how a single annotated tag ties together three modules: what a tag
   *is* in the object model (00), how you create and *push* one (06), and why
   pushing it — rather than pushing a branch — is the thing that triggers a
   release pipeline (06). Include why a normal `git push` wouldn't start that
   pipeline.
9. Your `pre-commit` hook "isn't working" for a teammate but works for you.
   Walk through every reason this could happen (executable bit, filename,
   `.git/hooks/` not cloned, `--no-verify`) and which single mechanism
   addresses the "not cloned" part for the whole team.
10. Put these in the order they occur in a real "feature to release" flow, and
    name the module each belongs to: CI runs tests on the PR; interactive
    rebase to clean commits; `git push -u origin feature`; annotated tag
    pushed to trigger a release build; `commit-msg` hook validates each
    message; branch merged to `main`.

<details>
<summary>Show answers</summary>

1. `git commit` writes new **blob** objects for changed files, **tree**
   objects for changed directories, and one **commit** object, then moves the
   current branch's ref (a file under `.git/refs/heads/`) to the new commit;
   HEAD follows because it points at the branch. `git push` transfers the new
   objects the remote lacks and fast-forwards the remote's branch ref to your
   commit (and updates your local `origin/<branch>` remote-tracking ref).
2. Clean the messy commits with `git rebase -i` (03) — safe because the branch
   is unshared; `git fetch` and `git rebase origin/main` to get current (04),
   resolving conflicts (02); push with `-u` then open the PR (04, 05). The
   `pre-commit` hook (06) blocks the debug marker on each *new* commit you make
   but does nothing about commits already made (you'd catch those in review or
   by re-editing) and can be bypassed with `--no-verify`.
3. Rejected because the remote branch has commits your push doesn't descend
   from, so it can't fast-forward. Amending/rebasing to force it past the
   rejection rewrites history; on a *shared* branch that orphans commits others
   have, violating the golden rule and creating divergence for everyone. The
   correct fix is `git pull` (merge or `--rebase`) to integrate the remote
   commits, resolve conflicts, then push — non-destructive.
4. `pre-push` runs locally, can be bypassed (`--no-verify`), isn't shared
   automatically (lives in `.git/hooks/`), and is only a convenience gate. CI
   runs on the server, can't be bypassed by the pusher, is defined in the repo
   so it's shared to everyone, and is the one you trust before production. Same
   idea, different trust level.
5. Force-pushing rewrote `main`'s commits into new hashes and orphaned the
   old ones; the teammate's clone still has the old commits and a stale
   `origin/main`, so after fetching, their `main` and the new `origin/main`
   share no recent ancestry and everything conflicts. The golden rule (don't
   rewrite shared history) exists precisely to prevent this painful,
   error-prone reconciliation.
6. `git cherry-pick <hash>` — it re-applies that one commit's change as a
   *new* commit on `release` (new hash, new parent), leaving the rest of
   `develop` behind. A merge would have been wrong because it would bring in
   `develop`'s *entire* history up to that commit, not just the single hotfix.
7. Local (advisory): a `pre-commit` hook that greps the staged diff for `TODO:
   remove` and a `commit-msg` hook enforcing the convention — fast feedback but
   bypassable. Server (enforcing): CI checks / branch protection that reject a
   PR whose diff contains the marker or whose commits violate the convention.
   You need both because the hooks help developers catch issues early but can
   be skipped, while the server-side gate is the one that actually guarantees
   nothing bad reaches `main`.
8. A tag is a named pointer to a specific commit (object model, 00) — annotated
   ones are full objects with a message/date. You create it with `git tag -a`
   and must push it explicitly with `git push origin <tag>` (06). Pushing the
   tag triggers the release pipeline because CI is configured to watch for tag
   pushes (often `v*`) as the release signal; a normal `git push` sends only
   commits, not tags, so it wouldn't start that pipeline.
9. Reasons: the hook file isn't executable (needs `chmod +x`); the filename is
   wrong (`.sample` suffix or misspelled); `.git/hooks/` isn't cloned so the
   teammate simply doesn't have the hook; or they ran `git commit --no-verify`.
   The "not cloned" part is solved for the whole team by committing the hooks
   into a tracked directory and setting `git config core.hooksPath <dir>`.
10. `git push -u origin feature` (04) → `commit-msg` hook validates each
    message [as commits are made, 06] → interactive rebase to clean commits
    before review (03) → CI runs tests on the PR (05/06) → branch merged to
    `main` (05) → annotated tag pushed to trigger a release build (06). (The
    `commit-msg` validation actually fires earliest, at each commit; the rest
    proceed in the listed order.)

</details>

## Next

Continue to
[07-troubleshooting-and-recovery](../07-troubleshooting-and-recovery/README.md)
to build the confidence that nothing you do in Git is truly unrecoverable —
the reflog, undoing bad merges and rebases, fixing a bad push, and escaping
detached HEAD.
