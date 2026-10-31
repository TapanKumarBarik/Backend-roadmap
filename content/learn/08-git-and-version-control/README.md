# Track 8: Git and Version Control

Every track after this one treats Git as a given: the CI/CD track builds
pipelines that trigger off pushes and tags, the Terraform track makes a
Git repo the single source of truth for your infrastructure, and the
GitOps track literally makes "what's committed to `main`" the definition
of what's running in production. So before any of that, you need Git to
be *automatic* — not "I can add, commit, push if I look up the commands,"
but "I can branch, rebase, resolve a conflict, and recover a commit I
thought I'd destroyed, without breaking a sweat."

This track takes you from zero knowledge of Git specifically to genuine
fluency. It starts with Git's object model — the thing almost nobody
teaches first and the reason almost everybody stays confused about Git
for years — and builds up through the everyday workflow, branching,
history rewriting, collaboration, code review, hooks, and finally
disaster recovery. It ends with a capstone where you simulate a realistic
multi-week collaboration on a small repo, conflicts and mistakes and all.

## How this track works

- Go in order. Module 01 assumes the mental model from module 00, module
  03 assumes you can branch and merge from module 02, and so on.
- Every module (except this index and the capstone) follows the same
  shape: **Why this matters → Concepts → Command reference → Hands-on
  exercises → Independent challenge → Common mistakes & troubleshooting →
  Checkpoint quiz → Next**. Two modules also carry a **Cumulative review**.
- All exercises run in your **WSL2 Ubuntu terminal** — the same shell you
  got comfortable with in track 01. Git is almost entirely local, so
  unlike the Azure tracks there's nothing billable here and nothing to
  clean up in the cloud. Practice as much as you want.
- Module 08 is a capstone project with no quiz — it asks you to combine
  everything from modules 00-07 into one realistic collaboration history
  on a repo you build from scratch.

## Modules

| # | Module | What it covers | Rough time |
|---|--------|-----------------|------------|
| 00 | [git-object-model-and-mental-model](00-git-object-model-and-mental-model/README.md) | Blobs, trees, commits, refs; the working tree / staging area / repository three-tree model; why HEAD and branches are just pointers | 60-75 min |
| 01 | [basic-local-workflow](01-basic-local-workflow/README.md) | `init`, `status`, `add`, `commit`, `diff`, `log`, `.gitignore` — the everyday loop, grounded in the object model | 60-90 min |
| 02 | [branching-and-merging](02-branching-and-merging/README.md) | Creating/switching branches, fast-forward vs. merge commits, resolving a real merge conflict | 75-90 min |
| 03 | [rebasing-and-history-rewriting](03-rebasing-and-history-rewriting/README.md) | `rebase`, interactive rebase (squash/reword/drop), `commit --amend`, `cherry-pick`, and the reflog as your safety net | 90 min |
| 04 | [remotes-and-collaboration](04-remotes-and-collaboration/README.md) | `clone`, `remote`, `fetch` vs. `pull`, `push`, tracking branches, forking vs. shared-repo workflows | 75-90 min |
| 05 | [pull-requests-and-code-review](05-pull-requests-and-code-review/README.md) | The PR/code-review workflow as a practice: feature branches, review rounds, keeping a branch current, merge vs. squash vs. rebase merges | 60-75 min |
| 06 | [git-hooks-and-automation](06-git-hooks-and-automation/README.md) | Client-side hooks (`pre-commit`, `commit-msg`), how CI triggers off pushes/tags, a light bridge toward CI/CD | 60-75 min |
| 07 | [troubleshooting-and-recovery](07-troubleshooting-and-recovery/README.md) | Recovering "lost" commits via reflog, undoing a bad merge/rebase, fixing a bad push, un-committing a file, detached HEAD | 90 min |
| 08 | [capstone-project](08-capstone-project/README.md) | Simulate a multi-week, multi-branch collaboration with a real conflict, an interactive-rebase cleanup, and a reflog recovery — ending in a clean log | 2-4 hours |

## Prerequisites

- Comfort in a Linux/WSL2 shell from [01-linux](../01-linux/README.md):
  creating files with heredocs, `cat`/`ls`/`cd`, editing with `nano` or
  `vim`, reading and setting environment variables. That's genuinely all
  this track assumes — no Docker, no Kubernetes, no Azure.
- Git installed in your WSL2 Ubuntu (module 00's first exercise checks
  this and installs it if it's missing).

Nothing else. If you skipped straight here from track 01, you'll be fine.

[Back to main curriculum](../README.md)

Start here → [00-git-object-model-and-mental-model/README.md](00-git-object-model-and-mental-model/README.md)
