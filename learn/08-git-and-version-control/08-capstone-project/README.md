# Capstone Project: A Realistic Collaboration History

## Why this matters

Every other module drilled one skill in isolation. Real Git work never
arrives one skill at a time — a normal week is branches spawning off
branches, a merge conflict at the worst moment, a history too messy to review
until you clean it, and at least one "oh no" that the reflog quietly saves you
from. This capstone asks you to *manufacture* a realistic multi-week
collaboration on a small repo, mistakes and all, and then bring it to the
clean, readable state a real project needs. If you can do this end to end from
memory, you have the Git fluency the rest of the curriculum — starting with
Terraform next door — assumes.

## The project

Build a single small repository (the *content* barely matters — a handful of
text/markdown/script files is plenty; a tiny "notes app" or a "team wiki" is
a fine framing) and drive it through a simulated multi-week history. You'll
play multiple developers by using the bare-repo-plus-clones technique from
module 04, or by wearing different "hats" on branches in one repo — your call.
The goal is not the app; it's producing a history that *looks like real
collaboration* and then *reads like it was planned*.

Work toward all of the acceptance criteria below. There is no solution
provided — that's the point. If you get stuck, the hints under each cluster
nudge you toward the right module without handing you commands.

### Acceptance criteria

Setup and everyday workflow
- [ ] A repository initialized from scratch with your identity configured,
      a meaningful first commit, and a `.gitignore` that excludes at least
      one kind of generated file and one kind of secret **from the very first
      commit** (nothing ignored is ever committed).
- [ ] At least 12 commits total across the project, each with a clear
      imperative summary; at least one commit has a real multi-line body
      explaining *why*.
- [ ] Evidence you used the staging area deliberately: at least one working
      session where you made changes to multiple files but split them into
      two or more logically separate commits.

Branching, collaboration, and a real conflict
- [ ] At least three branches beyond the default, representing parallel lines
      of work (e.g. two features and a fix), each developed over several
      commits before integration.
- [ ] A "shared server" (bare repo) with at least two clones, and at least
      one push that gets **rejected** because the other clone pushed first —
      resolved by integrating rather than force-pushing.
- [ ] At least one **genuine merge conflict** — two branches editing the same
      lines — resolved by hand so that *both* sides' intent survives (not just
      picking one side), with the conflict markers fully removed.
- [ ] At least one feature integrated via a **merge commit** and at least one
      integrated via **rebase** (linear), so your history shows you can do
      both and can explain why you'd choose each.

History rewriting before review
- [ ] At least one branch that was *deliberately messy* (several `wip`/typo/
      "fix the fix" commits) and was then cleaned with an **interactive
      rebase** into a small number of coherent commits — squashing noise,
      rewording at least one bad message, and dropping at least one commit
      that shouldn't exist — before being "opened for review."
- [ ] At least one use of `commit --amend` and at least one `cherry-pick` of a
      single commit from one branch onto another, each for a sensible reason
      you can articulate.

A recovered "oops" moment
- [ ] A deliberately induced disaster and a clean recovery: destroy real
      commits with a `reset --hard` to the wrong place (or orphan a commit via
      detached HEAD), then recover the lost work using the **reflog** — and
      keep notes of the exact reflog entry you recovered from.
- [ ] Somewhere in the history, a bad change that was "already shared" is
      undone the *safe* way (a `revert` commit), not by rewriting shared
      history — and you can explain why that was the correct choice there.

Automation touch
- [ ] At least one working client-side hook (e.g. a `pre-commit` that blocks a
      debug marker or secret pattern, or a `commit-msg` enforcing a message
      convention) that you demonstrate both blocking a bad attempt and
      allowing a good one.
- [ ] At least one **annotated tag** marking a "release" point, pushed to the
      shared repo.

The finish line
- [ ] A final `git log --oneline --graph --all` that a stranger could read and
      follow — clean messages, sensible branch/merge structure, no leftover
      conflict markers, no `wip` noise on the mainline, and the release tag
      visible.
- [ ] You can give a short spoken walkthrough of the history: where each
      branch came from, which integration was a merge vs. a rebase and why,
      where the conflict was and how you resolved it, and where the reflog
      saved you.

### Hints (per cluster, no full commands)

<details>
<summary>Setup & everyday workflow</summary>

Write the `.gitignore` *before* your first `git add`, so ignored files never
enter history (module 01's committed-secret trap). To split one working
session into separate commits, stage selectively — add only the files (or,
with patch mode, only the hunks) that belong to the first logical commit,
verify with a staged diff, commit, then stage the rest.

</details>

<details>
<summary>Branching, collaboration & the conflict</summary>

Use the bare-repo-plus-two-clones setup from module 04 to make a push
*legitimately* get rejected: have both clones commit from the same starting
point and push in sequence. Engineer the conflict by having two branches edit
the *same line*; resolving "so both sides survive" usually means writing a new
line that combines them, then removing all three marker lines before staging.
For the merge-vs-rebase criterion, integrate one feature with a merge (keep
the merge commit) and rebase another onto the updated mainline for a linear
result.

</details>

<details>
<summary>History rewriting</summary>

Make the messy branch genuinely messy first (it's more convincing, and better
practice), *then* fix it in a single interactive rebase — the to-do list is
oldest-first and you can reorder, `squash`/`fixup`, `reword`, and delete lines
to drop commits (module 03). Before you start the rebase, note the branch's
current tip from the reflog so you could restore it if you mangle the rebase.

</details>

<details>
<summary>The recovery</summary>

The recovery pattern is always the same: `git reflog` to find the good hash,
then repoint a branch at it (reset to it, or branch from it). For the "already
shared" bad change, remember the deciding question — has anyone else got this
commit? If yes, *add* an undo with `revert` rather than rewriting history
(modules 04, 07).

</details>

<details>
<summary>Automation & the tag</summary>

A hook is just an executable script with the right name in `.git/hooks/`
(module 06); make sure it's `chmod +x` or it silently won't run. Use an
*annotated* tag for the release so it records a message and date, and remember
a normal push doesn't send tags — you push the tag explicitly.

</details>

## Before you move on

You've now taken Git from "add, commit, push" to genuine fluency: the object
model that makes every command make sense, clean local history, branching and
merging, rewriting history safely, real collaboration over remotes, the
pull-request and review workflow, automation with hooks, and — maybe most
importantly — the calm certainty that almost nothing you do is unrecoverable.

Two things worth doing to make this stick, per how this curriculum says to
actually retain skills:

- **A week or two from now, redo the reflog-recovery scenario from memory**,
  with no notes — deliberately `reset --hard` away some commits and bring them
  back, and orphan a detached-HEAD commit and rescue it. The recovery drills
  are the ones that fade fastest if unpracticed and matter most when you
  actually need them, under stress, on a real repo.
- **Do one small real thing on a real host.** If you skipped the optional
  GitHub exercises in module 05, go back and push a repo, open a PR, and merge
  it — because the very next tracks assume that muscle memory.

This bridges directly into the next track. In
**[09-terraform-on-azure](../../09-terraform-on-azure/README.md)**, Git stops
being a place to store *application* code and becomes the **source of truth
for your infrastructure**: every change to your Azure networking, AKS
clusters, and registries will live as version-controlled Terraform in a Git
repo, reviewed through exactly the PR workflow you just practiced, before it's
allowed to change anything real. The clean-history, review, and recovery
skills you built here are precisely why infrastructure-as-code is safe to do
at all — a bad infra change you can `revert` and re-review is a very different
thing from one typed live into a console.

## Next

[Back to the track index](../README.md) ·
Continue to
[09-terraform-on-azure](../../09-terraform-on-azure/README.md) when you're
ready to make Git the source of truth for real infrastructure.
