# GitHub Actions Deep Dive

## Why this matters

Track 07's module 08 showed you exactly one workflow: a single job with a
handful of steps that built an image and deployed it. That's enough to
ship, but it's the "hello world" of GitHub Actions — it uses almost none
of the machinery that makes Actions worth learning as a real tool. This
module takes the whole model apart: the workflow/job/step hierarchy,
runners, expressions and contexts, matrix builds that fan one job into
many, reusable workflows and composite actions that kill copy-paste across
repos, and the secrets/environments system that later modules lean on for
security. Everything else in this track is written in this language;
this module is where you actually learn to read and write it fluently.

## Concepts

### The hierarchy: workflow → job → step, and where each runs

A **workflow** is a single YAML file in `.github/workflows/`. It declares
*when* it runs (`on:`) and *what* it runs (`jobs:`). A **job** is a named
unit of work that runs on a fresh **runner** — a clean VM (or container)
that GitHub spins up, hands to your job, and destroys afterward. A **step**
is one action inside a job: either a shell command (`run:`) or a reusable
action (`uses:`).

The critical mental model, sharper than track 07's single-job example
implied:

- **Steps in one job share a filesystem and run in order** on the same
  runner. A file one step writes, the next step can read.
- **Jobs run on separate runners and are isolated by default** — they run
  in parallel unless you declare a dependency with `needs:`, and they do
  *not* share a filesystem. To pass data between jobs you must explicitly
  upload/download **artifacts** (the `actions/upload-artifact` /
  `download-artifact` actions) or use **job outputs**.

This is why a naive multi-job workflow that "builds in job A and deploys
in job B" fails if you forget that job B starts on a blank machine — job A's
built files aren't there unless you carried them over.

### Runners: GitHub-hosted vs. self-hosted

`runs-on:` picks the runner. **GitHub-hosted runners** (`ubuntu-latest`,
`windows-latest`, `macos-latest`) are ephemeral VMs GitHub provisions,
pre-loaded with common tools (Docker, `az`, `kubectl`, language runtimes),
billed per-minute on private repos and free on public ones. **Self-hosted
runners** are machines *you* register and run the agent on — used when you
need private-network access (e.g. a runner inside your Azure VNet that can
reach a private AKS API server from track 07), specialized hardware, or to
avoid per-minute billing at scale. GitHub-hosted is the default and what
this track uses; know self-hosted exists because "the runner can't reach
the private cluster" is a real production reason to switch.

### Expressions, contexts, and `${{ }}`

GitHub Actions has a small expression language evaluated inside `${{ }}`.
It reads from **contexts** — structured objects describing the run:

- `github` — the event and repo: `github.sha` (commit SHA — the tag from
  track 07's module 08), `github.ref` (`refs/heads/main`),
  `github.event_name` (`push`, `pull_request`), `github.actor`.
- `secrets` — repository/environment secrets: `secrets.AZURE_CLIENT_ID`.
- `env` — variables you defined with `env:`.
- `matrix` — the current matrix combination (below).
- `needs` — outputs of jobs this job depends on.
- `steps` — outputs of earlier steps in the same job (via `id:`).

Expressions drive **conditionals** with `if:` — e.g.
`if: github.ref == 'refs/heads/main'` runs a deploy step only on `main`,
the clean way to keep PR builds from deploying (the trigger-scoping concern
from module 00 and track 07's module 08, now done inside the workflow
instead of only at the trigger).

### Matrix builds: one job definition, many parallel runs

A **matrix** expands a single job into multiple parallel runs, one per
combination of the variables you list. Instead of copy-pasting a "test on
Node 18 / test on Node 20 / test on Node 22" job three times:

```yaml
strategy:
  matrix:
    node: [18, 20, 22]
    os: [ubuntu-latest, windows-latest]
```

That produces **6 jobs** (3 × 2), each with `matrix.node` and `matrix.os`
set, all running in parallel. `fail-fast: true` (the default) cancels the
rest the moment one fails — the fail-fast idea from module 00, at the job
level. Matrix is how you test across versions/platforms without
duplication, and it ties directly to module 02's test stage.

### Reusable workflows and composite actions: DRY across pipelines

Two mechanisms remove duplication, and they're often confused:

- A **reusable workflow** is an entire workflow file callable from another
  workflow via `uses: owner/repo/.github/workflows/build.yml@main` with
  `on: workflow_call`. It's a whole *job graph* you invoke — good for
  "every repo's deploy pipeline is the same 4 jobs." Inputs and secrets are
  passed explicitly.
- A **composite action** bundles several *steps* into one reusable
  `uses:` step (an `action.yml` with `runs: using: composite`). It's a
  reusable *step sequence*, not a whole workflow — good for "the 3 steps to
  log in to Azure and set AKS context" that you'd otherwise paste into
  every job.

Rule of thumb: repeating a *set of steps* → composite action; repeating a
*whole pipeline shape* across repos → reusable workflow. Both are how a
platform team gives every app repo a consistent pipeline (a theme that
returns in track 24, platform engineering).

### Secrets and environments: scoped, masked, gated

**Secrets** are encrypted values (`secrets.FOO`) injected at runtime and
**masked** in logs (GitHub redacts them if they appear in output). They
live at three scopes: organization, repository, and **environment**.
An **environment** (module 00's concept, now concrete) is a repo-level
named target (`staging`, `production`) that can carry its own secrets *and*
**protection rules** — required reviewers (a human must approve before a
job targeting that environment runs), wait timers, and branch
restrictions. A job opts into an environment with `environment: production`;
GitHub then pauses that job for approval if the environment requires it.
This is the exact machinery that turns continuous deployment into
continuous *delivery* for production — module 07 uses it in depth, and
module 07 also replaces long-lived secrets with OIDC (the pattern from
track 07's module 08, generalized).

### Permissions and the `GITHUB_TOKEN`

Every workflow run gets an automatically-provisioned `GITHUB_TOKEN` with
permissions scoped by the `permissions:` block. Track 07's module 08
already showed one required permission — `id-token: write` for OIDC. The
principle is **least privilege**: grant only what the job needs
(`contents: read` to check out code, `packages: write` to push to GHCR,
`id-token: write` for OIDC). An over-permissive token is a real blast-radius
risk if a step runs untrusted code — a security theme module 07 develops.

## Command reference

Workflow YAML explained key-by-key, plus the `gh` CLI you'll use to drive
runs from the terminal.

| Key / command | What it does | Notes |
|---|---|---|
| `on:` | Declares triggers | `push`, `pull_request`, `workflow_dispatch`, `workflow_call`, `schedule` (module 00) |
| `on.push.branches: [main]` | Filter: only pushes to `main` | Scopes the trigger to avoid deploying from every branch |
| `on.pull_request.paths:` | Filter: only when matching files change | e.g. only run when `src/**` changes, saving CI minutes |
| `jobs.<id>.runs-on:` | Picks the runner | `ubuntu-latest` (hosted) or `self-hosted` (your machine) |
| `jobs.<id>.needs: [build]` | Declares job dependency (ordering) | Without it, jobs run in parallel and don't share a filesystem |
| `jobs.<id>.strategy.matrix:` | Fans one job into N parallel runs | Combinations of the listed variables |
| `strategy.fail-fast: false` | Don't cancel siblings when one matrix leg fails | Default is `true` |
| `jobs.<id>.environment:` | Targets a protected environment | Triggers required-reviewer gate if configured (module 07) |
| `jobs.<id>.permissions:` | Scopes the `GITHUB_TOKEN` | Least privilege; `id-token: write` needed for OIDC |
| `steps[].uses:` | Runs a reusable action | `actions/checkout@v4`, `azure/login@v2`, or a composite action |
| `steps[].run:` | Runs shell commands on the runner | Multi-line with `\|` |
| `steps[].id:` + `steps[].outputs` | Names a step so later steps read its outputs | `${{ steps.<id>.outputs.<name> }}` |
| `${{ github.sha }}` | Expression: the commit SHA | The image tag from track 07 module 08 |
| `${{ github.ref == 'refs/heads/main' }}` | Expression used in `if:` | Gate a step/job to `main` only |
| `uses: owner/repo/.github/workflows/x.yml@ref` | Calls a reusable workflow | The called file needs `on: workflow_call` |
| `gh workflow list` | Lists workflows in the repo | Requires `gh auth login` first |
| `gh workflow run <file> -f key=val` | Manually triggers a `workflow_dispatch` run with inputs | The CLI equivalent of the "Run workflow" button |
| `gh run list --workflow=<file>` | Lists recent runs of a workflow | Add `--branch main` to filter |
| `gh run watch <run-id>` | Streams a run's live status in the terminal | Good for watching a deploy without the browser |
| `gh run view <run-id> --log-failed` | Shows logs for only the failed steps | Fastest way to triage a red run |

## Hands-on exercises

You'll need a GitHub repo you control and `gh` CLI installed
(`gh auth login`). Any small app repo works; if you have the demo app from
track 07, reuse it.

1. **A two-job workflow and the isolation gotcha.** Create
   `.github/workflows/two-jobs.yml` with a job `build` that runs
   `echo hello > out.txt && cat out.txt`, and a second job `check` (no
   `needs:`) that runs `cat out.txt`. Push it, watch it in the Actions tab
   (or `gh run watch`), and observe that `check` **fails** — `out.txt`
   doesn't exist on its runner. Now add `needs: [build]` and an
   `actions/upload-artifact` step in `build` plus `download-artifact` in
   `check`. Re-run and confirm `check` passes. This is the job-isolation
   concept made real.

2. **Contexts and conditionals.** Add a workflow triggered on both
   `push` and `pull_request` that has one step printing
   `echo "event=${{ github.event_name }} ref=${{ github.ref }}"` and a
   second step guarded by `if: github.ref == 'refs/heads/main'` that prints
   `echo "this only runs on main"`. Open a PR from a branch and confirm the
   guarded step is *skipped* on the PR run but *runs* after you merge to
   `main`.

3. **A matrix build.** Write a job with
   `strategy: { matrix: { version: [1, 2, 3] } }` whose single step runs
   `echo "building version ${{ matrix.version }}"`. Push and confirm the
   Actions tab shows **three** parallel jobs. Then add a second matrix
   dimension (`os: [ubuntu-latest, windows-latest]`) and confirm it becomes
   **six** jobs.

4. **Fail-fast behavior.** In that matrix, make the step
   `exit 1` only when `matrix.version == 2`
   (`if [ "${{ matrix.version }}" = "2" ]; then exit 1; fi`). Run with the
   default and observe siblings get cancelled. Add
   `strategy: { fail-fast: false }` and confirm the other legs now run to
   completion despite version 2 failing. Note which behavior you'd want for
   a test matrix (module 02) and why.

5. **Step outputs and `needs`.** Make job `build` produce an output: a step
   with `id: meta` running
   `echo "tag=${GITHUB_SHA::7}" >> "$GITHUB_OUTPUT"`, and expose it via
   `outputs: { tag: ${{ steps.meta.outputs.tag }} }` on the job. In a
   downstream job with `needs: [build]`, print
   `echo "${{ needs.build.outputs.tag }}"`. Confirm the short SHA flows
   from one job to the next — the mechanism module 03 uses to pass an image
   tag from a build job to a deploy job.

6. **A composite action.** Create `.github/actions/greet/action.yml` with
   `runs: { using: composite, steps: [...] }` that takes an input `name`
   and runs `echo "hello ${{ inputs.name }}"`. Use it from a workflow with
   `uses: ./.github/actions/greet` and `with: { name: world }`. Confirm it
   works, then reflect: which of the repeated steps in track 07's module-08
   workflow (Azure login + ACR login + set AKS context) would be a natural
   composite action?

7. **A reusable workflow.** Create `.github/workflows/reusable-build.yml`
   with `on: workflow_call` taking an input `image-name`, and a caller
   workflow that invokes it via
   `uses: ./.github/workflows/reusable-build.yml` with
   `with: { image-name: demo }`. Confirm the caller's run shows the reusable
   workflow's job nested inside it. Note the difference from exercise 6: a
   composite action is a *step*, a reusable workflow is a whole *job*.

8. **Drive it from the CLI.** Add `workflow_dispatch` with an input
   `message` to any workflow. Trigger it from the terminal with
   `gh workflow run <file> -f message="from the cli"`, then
   `gh run watch` the resulting run and `gh run view <id> --log` to read
   the output. This is how you operate pipelines without leaving the
   terminal.

9. **Diagnose and fix: the artifact-not-found failure.** You'll deliberately
   reproduce and fix the single most common multi-job mistake. Take a
   workflow where job `deploy` (with `needs: [build]`) runs
   `cat dist/app.txt`, and job `build` creates `dist/app.txt` but does *not*
   upload it as an artifact. Run it, watch `deploy` fail with "No such file
   or directory". Diagnose why (jobs don't share a filesystem — the concept
   from this module), then fix it by uploading the artifact in `build` and
   downloading it in `deploy`. Confirm the green run. Write one sentence on
   why `needs:` alone (ordering) was not enough — it guarantees *order*,
   not *shared files*.

## Independent challenge

No YAML given — build this from the concepts, drawing on this module and
track 07's module 08. Refactor a single monolithic workflow into a clean,
reusable shape. Start from a workflow that does build-then-deploy as one
long job (like track 07's module 08). Split it so that: a **matrix** runs
the app's build/test across at least two variants (e.g. two language
versions) in parallel; the actual build-and-push logic lives in a
**reusable workflow** invoked with `workflow_call` so a second app repo
could call the identical pipeline; the repeated "authenticate and set
context" steps become a **composite action** used by the deploy job; the
deploy job only runs on `push` to `main` (guarded by an `if:` expression on
`github.ref`, not just the trigger) and targets a **`production`
environment**; and each job declares a minimal `permissions:` block rather
than inheriting broad defaults. You won't be able to fully wire the deploy
without the Azure pieces from later modules — stub those steps with
`echo` placeholders — but the *structure* (matrix, reusable workflow,
composite action, environment, scoped permissions, `if`-guarded deploy)
should all be real and runnable. This is the skeleton every later module
fills in.

<details>
<summary>Stuck? One hint</summary>

Build it in layers and get each layer green before adding the next, rather
than writing the whole thing and debugging a wall of YAML. Order: (1) get
a plain single job green; (2) add the matrix and confirm the fan-out; (3)
extract the build steps into a `workflow_call` file and call it; (4) pull
the auth steps into `.github/actions/<name>/action.yml` and reference it
with `uses: ./...`; (5) add the `environment:` and `if: github.ref ==
'refs/heads/main'` guard last. The two easiest mistakes are forgetting
`on: workflow_call` in the reusable file (the caller errors that it can't
find a callable workflow) and forgetting that a composite action lives in
`action.yml`, not a workflow file.

</details>

## Common mistakes & troubleshooting

- **Expecting jobs to share a filesystem.** Steps in a job share a disk;
  separate jobs do not. Passing files between jobs needs
  upload/download-artifact or job outputs — `needs:` only orders them.
- **Forgetting `on: workflow_call` in a reusable workflow.** The caller
  fails to find a callable workflow. A reusable workflow *must* declare
  `workflow_call`; a composite action *must* be an `action.yml` with
  `using: composite` — mixing the two is a frequent first-time error.
- **Confusing composite actions with reusable workflows.** One packages
  *steps* (a single `uses:` step); the other packages *jobs* (a whole
  invoked workflow). Reaching for the wrong one leads to awkward YAML.
- **Trigger vs. `if` guard confusion.** `on: push: branches: [main]` stops
  the *whole workflow* from running off `main`. An `if:` on a job/step lets
  the workflow run (e.g. on a PR) but skips just the deploy. Use the trigger
  to scope the workflow, `if:` to scope individual steps within it.
- **Assuming secrets are available everywhere.** Environment-scoped secrets
  only exist in jobs that declare that `environment:`. A job without the
  environment can't read them and gets an empty value.
- **Over-broad `permissions:`.** Inheriting default write-all permissions
  is a blast-radius risk. Set `permissions:` explicitly per job; add only
  what's needed (`id-token: write` for OIDC, `contents: read` for checkout).
- **`fail-fast: true` masking flaky matrix legs.** With the default, one
  failing matrix leg cancels the others, so you might not see that *three*
  versions are broken, only the first. For a diagnostic test matrix,
  `fail-fast: false` shows you the full picture.

## Checkpoint quiz

Write down your answer to each question before expanding it — checking without attempting first is the single easiest way to fool yourself into thinking you've learned this.

1. What is the difference in filesystem and execution between two *steps*
   in the same job versus two *jobs* in the same workflow?
2. What does `needs:` guarantee, and what does it *not* guarantee?
3. A matrix has `node: [18, 20]` and `os: [ubuntu-latest, windows-latest]`.
   How many jobs run, and what does `fail-fast: true` do when one fails?
4. When would you reach for a composite action versus a reusable workflow?
5. What's the difference between scoping a deploy with `on: push:
   branches: [main]` and scoping it with `if: github.ref ==
   'refs/heads/main'`? When would you use each?
6. What does a GitHub *environment* add on top of plain repository secrets,
   and how does that relate to continuous delivery vs. deployment (module 00)?
7. Why might a team switch from GitHub-hosted to self-hosted runners for an
   AKS deploy, given what you know about private clusters from track 07?
8. What is the `permissions:` block for, and what's the risk of leaving it
   at the default?

<details>
<summary>Show answers</summary>

1. Two steps in the same job run in order on the *same* runner and share
   its filesystem — one step's file is visible to the next. Two jobs run on
   *separate* runners, in parallel by default, and share nothing — files
   must be passed via artifacts or job outputs.
2. `needs:` guarantees ordering — the dependent job starts only after its
   dependency succeeds. It does *not* share files or state; the downstream
   job still starts on a blank runner.
3. 2 × 2 = 4 jobs. `fail-fast: true` (the default) cancels the still-running
   sibling jobs as soon as any one leg fails.
4. Composite action when you're repeating a *set of steps* (e.g. the login
   sequence) within jobs; reusable workflow when you're repeating a *whole
   pipeline shape* (a job graph) across workflows or repos.
5. `on: push: branches: [main]` prevents the workflow from running at all
   except on pushes to `main`. `if: github.ref == 'refs/heads/main'` lets
   the workflow run (e.g. on PRs, to run tests) but skips the specific
   guarded step/job unless on `main`. Use the trigger to scope the whole
   workflow; use `if:` to run some steps everywhere and gate the deploy
   step to `main`.
6. An environment adds environment-scoped secrets and *protection rules* —
   notably required reviewers, which pause a job until a human approves.
   That approval gate is exactly what turns automated (continuous
   deployment) into human-gated (continuous delivery) for production.
7. A self-hosted runner can live inside your Azure VNet and reach a
   private AKS API server that a GitHub-hosted runner (on the public
   internet) cannot. Private-cluster access, specialized hardware, or
   avoiding per-minute billing are the usual reasons.
8. `permissions:` scopes the automatically-provisioned `GITHUB_TOKEN` to
   least privilege. Left at the default (broad write access), a compromised
   or misbehaving step has a large blast radius — it could push code,
   packages, or releases it never needed to.

</details>

## Next

[02-building-and-testing-in-ci](../02-building-and-testing-in-ci/README.md)
— use this machinery to run real tests, cache dependencies, and make a
green test run a *required* gate before a PR can merge.
