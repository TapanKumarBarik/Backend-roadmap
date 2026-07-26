# Building and Testing in CI

## Why this matters

The whole promise of continuous integration (module 00) is that a broken
change gets caught automatically, within minutes, *before* it merges — not
by a teammate three days later. That promise only holds if your pipeline
actually runs your tests and if a red test run actually *blocks* the merge.
This module wires both halves: running unit and integration tests inside a
GitHub Actions workflow (module 01), making them fast with dependency
caching, failing fast when they break, and — the part that makes it real —
configuring GitHub branch protection so a failing check is a hard gate on
the pull-request workflow you learned in track 08. Without the gate, CI is
just a status light nobody has to obey.

## Concepts

### Unit vs. integration tests in the pipeline

Two tiers of test show up in CI, and they have different runner needs:

- **Unit tests** exercise a single function/module in isolation, with no
  external dependencies. They're fast and run on the bare runner — just
  install deps and run the test command.
- **Integration tests** exercise your code against real collaborators — a
  database, a cache, a message broker. In CI you stand these dependencies
  up as **service containers**: GitHub Actions can run a Postgres or Redis
  container alongside your job (the `services:` key), and your tests
  connect to it over `localhost`. This is the same Docker knowledge from
  track 02, applied inside the pipeline.

The pipeline usually runs unit tests first (fast, cheap) and integration
tests after (slower, needs services) — a **fail-fast** ordering so a broken
unit test kills the run before you pay for spinning up a database.

### Dependency caching: don't re-download the internet every run

Every fresh runner (module 01) starts blank, so a naive job re-downloads
all your dependencies (npm packages, pip wheels, NuGet, Go modules) on
every single run — often the slowest part of the whole pipeline. **Caching**
saves a directory (e.g. `~/.npm`, `~/.cache/pip`) keyed by a hash of your
lockfile, and restores it on the next run. The key is the crux: key on the
lockfile hash (`hashFiles('**/package-lock.json')`) so the cache is reused
while dependencies are unchanged and *automatically invalidated* the moment
the lockfile changes. Many `setup-*` actions (`actions/setup-node`,
`setup-python`) have caching built in via a `cache:` input; `actions/cache`
is the general-purpose primitive. A cache is an optimization, never a
correctness dependency — the pipeline must still work (just slower) on a
cold cache.

### Fail-fast and the ordering of a test pipeline

**Fail-fast** means stop as early as possible when something breaks, so you
don't waste minutes running steps that can't matter. Concretely: order
cheap/likely-to-fail checks before expensive ones — lint and unit tests
before integration tests before a build. Within a matrix (module 01),
`fail-fast: true` cancels sibling legs on the first failure. The payoff is
a fast red signal: a developer who broke the build learns in 90 seconds,
not 12 minutes. The tension (module 01's exercise) is that for a
*diagnostic* run you sometimes want `fail-fast: false` to see every failure
at once — fail-fast is the default, disable it deliberately when you want
the full picture.

### Status checks: the link between CI and the PR

When a workflow runs on a `pull_request` (module 00's trigger), each job
reports a **status check** back to GitHub — the green/red marks you see on
a PR. By default these are *informational*: a red check doesn't stop anyone
from clicking merge. This is the gap this module closes. A status check
becomes meaningful only when you tell GitHub it's **required** — and that's
branch protection, next.

### Required status checks and branch protection (the PR gate)

**Branch protection** on `main` (a GitHub repo setting, or a *ruleset*)
lets you mark specific status checks as **required**: GitHub then physically
disables the merge button on any PR until those checks pass. This is the
enforcement layer on top of track 08's pull-request workflow — track 08
taught you to *open* a PR and get it reviewed; this makes "tests pass" a
non-negotiable, machine-enforced condition of merging, alongside human
review. You can also require the branch be **up to date** before merging
(forcing a rebase/merge of `main` first, so the tests ran against the
final combined code — the "my change passed alone but breaks combined"
problem CI exists to catch). Protecting `main` this way is the difference
between "we have tests" and "you cannot merge broken code."

### Making tests trustworthy: determinism and required-to-be-green

A required check is only as good as the tests behind it. Two failure modes
undermine the gate: **flaky tests** (pass/fail randomly — from timing,
ordering, or shared state) train the team to hit "re-run" until green,
which defeats the gate entirely; and **tests that don't fail the build**
(a test runner that exits 0 even when assertions fail, or output nobody
checks) make the check permanently, uselessly green. Part of building CI is
verifying the check actually goes *red* when code is broken — the
diagnose-and-fix exercise below makes you prove it. A gate you've never
seen turn red is a gate you can't trust.

## Command reference

Workflow keys for testing/caching, plus the `gh` commands to inspect PR
checks and branch protection.

| Key / command | What it does | Notes |
|---|---|---|
| `on: pull_request` | Runs the workflow on PR open/update | The trigger that produces the gating status check (module 00) |
| `jobs.<id>.services:` | Runs sidecar containers (DB/cache) for the job | Integration-test dependencies, reachable on `localhost` |
| `services.<name>.image:` | The container image for a service | e.g. `postgres:16`, `redis:7` |
| `services.<name>.ports:` | Maps the service container's port to the runner | e.g. `5432:5432` |
| `services.<name>.options:` | Health-check/other Docker options | `--health-cmd` so the job waits until the DB is ready |
| `actions/setup-node@v4` with `cache: npm` | Sets up a runtime *and* caches its package dir | Built-in caching keyed on the lockfile |
| `actions/cache@v4` | General-purpose cache save/restore | `path:` + `key:` (below) |
| `key: deps-${{ hashFiles('**/package-lock.json') }}` | Cache key tied to lockfile contents | Auto-invalidates when deps change |
| `restore-keys:` | Fallback prefixes for a partial cache hit | Reuse an older cache if the exact key misses |
| `strategy.fail-fast: true` | Cancel matrix siblings on first failure (default) | Fast red signal; set `false` for full-picture diagnostics |
| `if: always()` | Run a step even if a prior step failed | e.g. always upload the test report |
| `actions/upload-artifact@v4` | Save test reports/coverage as artifacts | Inspectable after the run (module 01) |
| `gh pr checks <pr>` | Lists a PR's status checks and their state | Fast terminal view of what's blocking a merge |
| `gh pr merge <pr>` | Merges a PR (blocked if required checks fail) | Confirms the gate is enforced |
| `gh api repos/:owner/:repo/branches/main/protection` | Reads the branch-protection config | Inspect which checks are required |
| `gh browse --settings` | Opens repo settings (to configure branch protection in UI) | Branch protection is usually set in the UI/ruleset editor |

## Hands-on exercises

Use a repo with a real, small test suite (any language). The examples show
Node, but adapt the commands to your stack — the CI structure is identical.

1. **Run unit tests in CI.** Create `.github/workflows/ci.yml` triggered on
   `pull_request` and `push` to `main`, with a job that checks out code,
   sets up your runtime, installs dependencies, and runs your unit test
   command (`npm test`, `pytest`, `go test ./...`, etc.). Open a PR and
   confirm the check appears on it, green.

2. **Prove the check can go red.** On a branch, deliberately break a test
   (change an assertion so it fails) and push. Confirm the PR's check turns
   **red** and the failing test name appears in the logs
   (`gh pr checks <pr>` or the Actions tab). This is the single most
   important verification in the module — a check you've never seen fail is
   worthless. Revert the break; confirm green again.

3. **Add dependency caching and measure it.** Add caching (via the
   `setup-*` action's `cache:` input, or `actions/cache` keyed on your
   lockfile hash). Push twice without changing dependencies and compare the
   "install" step's duration on run 1 (cold cache) vs. run 2 (warm cache).
   Then bump a dependency in the lockfile, push, and confirm the cache key
   changed (a cold install again) — proving the key correctly invalidates.

4. **Add an integration test with a service container.** Add a job that
   declares a `services:` block for a database (e.g. `postgres:16` with a
   health-check option), and an integration test that connects to it on
   `localhost` and does one real query. Confirm the job waits for the
   service to be healthy and the test passes. Note how this reuses your
   track 02 Docker knowledge inside the pipeline.

5. **Order for fail-fast.** Restructure so lint/unit tests run *before* the
   integration job (`needs:`), so a broken unit test kills the run before
   the slower database job even starts. Break a unit test and confirm the
   integration job is skipped/never runs — you didn't pay for the database.

6. **Make the check required (the gate).** In repo settings → Branches (or
   Rules), add branch protection on `main` requiring your CI check to pass
   before merging, and require the branch be up to date. Open a PR with a
   failing test and confirm the **merge button is disabled** and
   `gh pr merge` refuses. This is the CI-meets-track-08 moment: broken code
   *cannot* merge.

7. **Prove "up to date before merging" catches a combination bug.** With
   two branches: branch A changes a function's signature; branch B (opened
   from an older `main`) calls that function the old way — each passes CI
   *alone*. Merge A to `main`. Now B's required check, re-run against the
   updated `main` (because you required up-to-date), should fail — catching
   the integration break that neither branch's isolated run saw. This is
   the exact class of bug CI exists to prevent (module 00).

8. **Diagnose and fix: a required check blocks a legitimate merge.** You
   have a PR whose code is correct, but the required check is red and the
   merge is blocked. The workflow log shows the *test step* passed but a
   later step failed: the job runs a coverage-threshold check that fails
   because a new file has no tests, OR the test runner is exiting 0 on
   failure so a *different* required lint check is the real blocker.
   Investigate with `gh pr checks <pr>` to see *which* check is red, open
   its log with `gh run view <id> --log-failed`, and identify the actual
   failing step. Fix the real cause (add the missing test / fix the lint
   error), push, and confirm the check goes green and the merge unblocks.
   Write one sentence distinguishing "the merge is blocked" (correct — the
   gate is doing its job) from "the gate is broken" (it isn't; your code
   was).

## Independent challenge

No YAML given — assemble this from module 01's Actions machinery, this
module's testing/gating concepts, and track 08's PR workflow. Set up a
repo so that broken code is *structurally* unable to reach `main`. Wire a
`pull_request`-triggered workflow that runs, in fail-fast order, a lint
step, a unit-test matrix across at least two runtime versions (module 01),
and an integration-test job that stands up a real database as a service
container; cache dependencies keyed on the lockfile so warm runs are fast;
have every one of those checks report status back to the PR; and then
configure branch protection on `main` so that all of them are *required*
and the branch must be up to date before merge. Prove the gate two ways:
first, that a PR with a failing test genuinely cannot be merged (the button
is disabled); second, that two independently-green branches which conflict
when combined get caught by the up-to-date requirement rather than both
merging and breaking `main`. Do not weaken the gate to get your own PR in —
if it's blocked, that's the system working; fix the code.

<details>
<summary>Stuck? One hint</summary>

The two pieces people forget are separate. Getting the workflow to *run*
tests is module 01 mechanics; getting a red result to *block a merge* is a
**repository setting**, not anything in the YAML — no amount of workflow
config makes a check "required." Go to Settings → Branches (or Rules),
create a protection rule on `main`, and explicitly tick your check's job
name in "Require status checks to pass". The check must have run *at least
once* on a PR before GitHub will offer it in that list, so push a PR first,
then configure protection. For the combination-bug proof, the magic setting
is "Require branches to be up to date before merging".

</details>

## Common mistakes & troubleshooting

- **A red check that doesn't block merging.** The workflow ran and failed,
  but nobody made the check *required*. Informational checks are advisory
  only — branch protection is what turns them into a gate. This is the
  number-one "we have CI but broken code still merges" cause.
- **A test runner that exits 0 on failure.** If the test command returns
  success even when assertions fail (misconfigured runner, `|| true`
  swallowing the exit code, tests not actually discovered), the check is
  permanently green and useless. Always verify the check can go *red*
  (exercise 2).
- **Caching as a correctness crutch.** If your build only works because a
  cache has some artifact in it, a cache miss (they expire and can be
  evicted) breaks the build mysteriously. Caches are for speed only; the
  cold-cache path must work.
- **Cache key that never invalidates (or always misses).** Keying on
  something static means stale dependencies are reused after a lockfile
  change; keying on something too volatile (the commit SHA) means every run
  misses. Key on the lockfile hash.
- **Flaky tests trained around.** Randomly-failing tests teach the team to
  spam "re-run" until green, silently disabling the gate. Fix or quarantine
  flaky tests; don't let "just re-run it" become the culture.
- **Integration job races the service container.** Tests connect before the
  database is ready and fail intermittently. Use the service's health-check
  option so the job waits for readiness before running tests.
- **Not requiring "up to date before merge".** Two PRs that each pass alone
  can still break `main` when combined; without the up-to-date requirement,
  CI never re-ran against the merged result. This is the exact bug CI is
  supposed to prevent.

## Checkpoint quiz

Write down your answer to each question before expanding it — checking without attempting first is the single easiest way to fool yourself into thinking you've learned this.

1. What is the difference between a status check being *reported* on a PR
   and being *required*, and which one actually blocks a merge?
2. Why cache on a hash of the lockfile rather than on a fixed key or on the
   commit SHA?
3. Why must the pipeline still work (just slower) when the cache misses?
4. What does "require branches to be up to date before merging" protect
   against that per-branch CI alone does not?
5. How do you run an integration test that needs a real database inside a
   GitHub Actions job, and how do you keep the test from racing the
   database's startup?
6. Why is verifying that a check can turn *red* just as important as seeing
   it turn green?
7. A developer says "the merge is blocked, the gate is broken." Under what
   circumstance is that statement wrong, and how would you tell?
8. What's the fail-fast argument for running lint and unit tests before
   integration tests?

<details>
<summary>Show answers</summary>

1. A *reported* check shows a green/red mark on the PR but is advisory —
   anyone can still merge. A *required* check (set via branch protection)
   physically disables the merge button until it passes. Only "required"
   blocks a merge.
2. The lockfile hash changes exactly when your dependencies change, so the
   cache is reused while deps are stable and automatically invalidated when
   they change. A fixed key never invalidates (serves stale deps); the
   commit SHA changes every commit (never hits).
3. Caches expire and can be evicted, so a cold cache will happen. If
   correctness depends on cache contents, a normal cache miss breaks the
   build. Caching is a speed optimization only.
4. It catches bugs that appear only when two independently-green changes are
   *combined* — by forcing the PR to include the latest `main` and re-run
   CI against the merged code, rather than trusting each branch's isolated
   pass.
5. Declare a `services:` block with the database image and port mapping;
   the tests connect over `localhost`. Use the service's health-check
   option (`--health-cmd`) so the job waits until the database is ready
   before running tests, avoiding a startup race.
6. A check that has only ever been green might be green because it never
   actually fails (runner exits 0 on failure, tests not discovered). Seeing
   it go red on broken code proves the gate genuinely detects failure — an
   always-green gate is no gate.
7. It's wrong when the code is actually broken — the gate blocking a PR
   with failing tests is the gate doing its job, not a malfunction. Tell by
   opening the failing check's logs (`gh run view --log-failed`): if a real
   test/lint step failed, the block is correct and the fix is to the code.
8. Lint and unit tests are fast and cheap; integration tests are slow and
   need spun-up services. Running the cheap checks first means a common
   break kills the run in seconds without paying to start a database —
   faster feedback and less wasted CI time.

</details>

## Cumulative review

Closed-book. Don't reopen modules 00-01 while attempting these — the point
is to find out what actually stuck before you go further.

1. Classify, on both axes (CI vs. delivery vs. deployment, and push vs.
   pull), a pipeline that on a PR runs tests, on merge to `main` deploys
   automatically to staging, and requires a human click to reach
   production. Which flavor of "CD" is it?
2. A workflow builds an image in job `build` and a separate job `deploy`
   (with `needs: [build]`) runs `docker run` on that image, but `deploy`
   fails with "image not found." Give the module-01 reason and the fix.
3. Why does tagging every build `latest` (a) break `kubectl set image`
   rollouts (track 07 module 08) *and* (b) violate the "build once, deploy
   many" rule (module 00)? Are these the same problem or two problems?
4. You want a deploy step to run only on `main` but the test steps to run on
   every PR, all in one workflow. What module-01 mechanism do you use, and
   why not just scope the whole workflow's trigger to `main`?
5. Explain how a GitHub *environment* (module 01) relates to the continuous
   delivery vs. continuous deployment distinction (module 00).
6. Your CI is green on every PR but broken code still occasionally lands on
   `main`. Give two distinct causes from modules 00-02 and how you'd
   confirm each.
7. What's the difference between `needs:` (module 01) and a *required
   status check* (module 02)? One orders; the other gates — map each to its
   role.
8. A matrix test job across three language versions shows only version 18
   failed and the run stopped. A teammate insists all three are broken. What
   setting would you change to find out, and what is it called (module 01)?
9. In "build once, deploy many," what exactly is the immutable artifact for
   a containerized app, what tag makes it traceable, and which two later
   modules of this track produce and consume it?

<details>
<summary>Show answers</summary>

1. It's **push-based** if the pipeline itself runs `kubectl`/`helm` against
   the cluster (pull-based only if an in-cluster controller reconciles from
   Git — not the case here). On the CI/CD axis it's **continuous delivery**:
   automated all the way to staging, but a human gate before production.
2. Jobs run on separate runners with no shared filesystem or Docker image
   store; `needs:` only orders them. The built image doesn't exist on
   `deploy`'s runner. Fix: push the image to a registry in `build` and pull
   it in `deploy` (or save/load it as an artifact) — the "build once,
   promote the artifact" pattern.
3. Two related problems. (a) `kubectl set image` only rolls out when the
   image *reference string* changes; reusing `latest` leaves the pod spec
   textually identical, so no rollout. (b) `latest` is a moving pointer, not
   a stable identity, so you can't guarantee or roll back to "the exact
   thing you tested" — violating build-once-deploy-many. The root cause is
   shared (a non-unique tag), but the symptoms are distinct: no rollout vs.
   no traceability.
4. Use an `if:` expression (e.g. `if: github.ref == 'refs/heads/main'`) on
   the deploy job/step. Scoping the whole workflow trigger to `main` would
   stop the workflow from running on PRs at all, so the tests wouldn't gate
   the PR — you need the workflow to run on PRs (for tests) but the deploy
   to run only on `main`.
5. An environment can carry protection rules, notably required reviewers —
   a human approval gate. With no such gate, a deploy to production is
   continuous *deployment*; adding a required reviewer on the `production`
   environment turns it into continuous *delivery* (human approves the
   final promotion).
6. For example: (a) the failing check isn't *required* — branch protection
   isn't enforcing it; confirm by checking the branch-protection settings /
   `gh api .../protection`. (b) "up to date before merge" isn't required, so
   a combination bug from two separately-green branches lands; confirm by
   checking whether CI re-ran against merged code. (Also acceptable: a test
   runner exiting 0 on failure — confirm by seeing whether the check ever
   goes red.)
7. `needs:` sequences jobs *within a single workflow run* (ordering/data
   flow). A required status check is a *repository policy* that blocks a PR
   merge until a named check passes. `needs:` doesn't gate merges; a
   required check doesn't order jobs.
8. Set `strategy.fail-fast: false` so the other matrix legs run to
   completion instead of being cancelled when version 18 fails, revealing
   whether all three are broken. The setting is **fail-fast** (default
   `true`).
9. The immutable artifact is the built container image; the commit SHA tag
   makes it traceable to an exact commit; module 03 builds and pushes it,
   and modules 04-06 (and the capstone) deploy/promote it.

</details>

## Next

[03-container-image-pipelines](../03-container-image-pipelines/README.md) —
turn a passing build into an immutable, well-tagged container image and
push it to your Terraform-provisioned ACR.
