# Module 02: CI Pipelines for Backend Code

## Why this matters

Track 12 module 07 gave you the *testing* view of CI: stage the pipeline around
the test pyramid, fail fast, quarantine flakes, gate the merge with branch
protection. It deliberately stopped there and handed the rest to this track. This
module picks it up: the **full CI pipeline for a backend service** — not just "run
the tests," but the complete sequence of gates a change must clear on its way to
becoming a deployable artifact, from lint to a pushed container image.

A CI pipeline is the enforcement mechanism for almost everything the earlier
tracks taught. Type safety (track 12 module 06) only holds if `mypy` runs on every
push. Structured config and no-leaked-secrets (track 08) only hold if a secret
scanner runs. The image being reproducible and non-root (module 00) only holds if
CI is the thing that builds it. Without CI, all of these are aspirations enforced
by whoever remembers; with it, they're invariants — code that fails any gate
cannot merge, and every merge to main produces a tested, scanned, tagged image
ready to deploy. That artifact is the "build" in build/release/run, and it's the
input to every deployment strategy in module 03.

This module teaches what a good backend CI pipeline *runs and in what order*, and
why — the backend engineer's view. It does **not** teach CI/CD tooling in depth:
runners, caching strategies, matrix builds, self-hosted agents, GitOps, ArgoCD,
and multi-environment promotion pipelines are `learn/10-cicd-and-gitops`. The
examples use GitHub Actions because you have to write *something*, but the *shape*
of the pipeline transfers to GitLab CI, Azure Pipelines, or any other runner.

## Concepts

### What a backend CI pipeline actually runs

A complete pipeline for a backend service is a staged sequence, cheapest and
most-likely-to-fail first (the fail-fast ordering from track 12 module 07):

1. **Checkout + setup + install** — clean checkout, pinned Python, dependencies
   from a lockfile (reproducibility — factor X and track 12's "pin your deps").
2. **Lint** (`ruff check`) — style and a large class of bug patterns, in seconds.
3. **Type-check** (`mypy`) — the type holes tests can't catch (track 12 module 06).
4. **Unit tests** (`pytest -m "not integration and not e2e"`) — the wide, fast base
   of the pyramid; gates every push.
5. **Integration tests** against a **service container** (a real Postgres/Redis
   the pipeline spins up) — the middle of the pyramid; gates if it fits the time
   budget.
6. **Build the container image** (module 00's Dockerfile) — proves the app builds
   and produces the deployable artifact.
7. **Scan the image** — for known-vulnerable OS/Python packages (Trivy/Grype) and
   for leaked secrets in the repo/history.
8. **Push the image** to a registry, tagged with the commit SHA — only on main,
   only if everything above passed.

Steps 2-5 gate every pull request. Steps 6-8 typically run on merge to main (you
don't need to push an image for every PR). The e2e tip of the pyramid runs on
main/nightly, non-gating, exactly as track 12 module 07 argued. The through-line:
**each stage is cheaper feedback than the one after it, so put it earlier.** A
lint error should fail in seconds, not after a ten-minute integration run.

### Integration tests need real backing services: service containers

Unit tests mock their dependencies, so they run anywhere. Integration tests
(track 12 module 03) hit a *real* Postgres, Redis, or other backing service — and
in CI there's no Postgres unless the pipeline provides one. Two ways to get it:

- **CI service containers** — the runner starts a sidecar container (e.g. a
  `postgres:16` service) for the duration of the job and exposes it on a hostname
  the tests connect to. Declarative, fast, and the pipeline manages the lifecycle.
- **testcontainers** (track 12 module 03) — your test code starts the container
  itself via the Docker API. More portable (identical locally and in CI) at the
  cost of needing Docker available in the job.

Either way, the tests reach the backing service by a **connection string from an
environment variable** — factor IV again. The same test code points at your local
Docker Postgres and at CI's service container by changing only `DATABASE_URL`.
This is why the app-side discipline from track 08 (config from env) pays off: the
tests inherit it.

### Building and pushing the image as a pipeline stage

Once the tests pass, CI builds the image from module 00's `Dockerfile`. Doing this
*in CI* rather than on a laptop matters: it proves the build is reproducible from a
clean checkout (no "works because my machine has X installed"), and it's the only
way the produced artifact is trustworthy — you know exactly what commit it came
from and that it passed every gate.

Two disciplines make the built image usable downstream:

- **Tag with the immutable commit SHA** (`myapp:git-<sha>`), not just `:latest`.
  `:latest` is a moving target — you can never say "roll back to the image that
  was running yesterday" if every build overwrites `:latest`. A SHA tag is a
  permanent, unambiguous handle on exactly this code, which is what makes
  rollback (module 03) possible. Add `:latest` as an *additional* convenience tag
  if you like, but the SHA is the source of truth.
- **Push only on main, only after everything passed.** A PR build can build the
  image to prove it compiles, but you don't push feature-branch images to your
  release registry. The push is the pipeline saying "this commit on main is a
  candidate for deployment."

Registry mechanics — authentication, retention/cleanup policies, multi-arch
builds, layer caching across CI runs, signing — are `learn/10-cicd-and-gitops` and
`learn/02-docker`. Here you just need: build from the pinned Dockerfile, tag by
SHA, push on main.

### Scanning: vulnerabilities and secrets as gates

CI is the natural place to enforce security invariants automatically, because it
runs on every change and can *block*:

- **Image/dependency vulnerability scanning** (Trivy, Grype) inspects the built
  image and your dependency tree for packages with known CVEs. A base image or a
  transitive dependency picks up a critical vulnerability over time even if your
  code never changes — the scan catches it. Gate on severity (e.g. fail on
  `CRITICAL`) so you're not drowned in low-priority noise.
- **Secret scanning** (gitleaks, trufflehog, or the platform's native scanner)
  greps the repo and its history for anything shaped like a credential —
  `sk_live_...`, private keys, connection strings with passwords. This is the
  automated, enforced version of track 08 module 10's "could you open-source this
  right now?" test. A secret should fail the build, loudly.

This is the backend engineer's on-ramp to supply-chain security; the deep version
(SBOMs, image signing, admission control, policy enforcement) is
`learn/11-security-deep-dive` and `learn/18-supply-chain-security`.

### CI vs CD, and where this module stops

**CI (continuous integration)** is everything above: on every change, verify and
build. **CD (continuous delivery/deployment)** is what happens *after* — taking
the artifact CI produced and releasing it to an environment, with the deployment
strategies (rolling, blue/green, canary) of module 03. Keeping them mentally
separate matters: CI's job ends when a tested, scanned, tagged image is in the
registry. What happens to that image next — promoted through staging to prod,
deployed by a GitOps controller watching the registry, rolled out with a canary —
is CD, and its full tooling story (ArgoCD, environment promotion, GitOps) is
`learn/10-cicd-and-gitops`. This module owns "produce a trustworthy artifact";
module 03 owns "release it safely."

## Command reference

| Stage | Command | Gates? |
|---|---|---|
| Install | `pip install -e ".[dev]"` (from lock) | — |
| Lint | `ruff check .` | Every PR |
| Type-check | `mypy app/` | Every PR |
| Unit | `pytest -m "not integration and not e2e" -n auto` | Every PR |
| Integration | `pytest -m integration` (vs a service container) | Every PR (if in budget) |
| Build image | `docker build -t myapp:git-$SHA .` | Main |
| Vuln scan | `trivy image --severity CRITICAL --exit-code 1 myapp:git-$SHA` | Main |
| Secret scan | `gitleaks detect --no-banner` | Every PR |
| Push | `docker push myapp:git-$SHA` | Main only |

A backend CI pipeline in GitHub Actions (the *shape* transfers to any runner;
`learn/10` goes deep on the tooling):

```yaml
# .github/workflows/ci.yml
name: ci
on: [push, pull_request]

jobs:
  # ---- fast gating lane: cheap checks first, run on every PR ----
  verify:
    runs-on: ubuntu-latest
    services:                          # CI service container: a real Postgres for integration tests
      postgres:
        image: postgres:16
        env: { POSTGRES_PASSWORD: test, POSTGRES_DB: test }
        ports: ["5432:5432"]
        options: >-
          --health-cmd pg_isready --health-interval 5s --health-retries 5
    env:
      DATABASE_URL: postgresql://postgres:test@localhost:5432/test   # factor IV: backing service via config
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with: { python-version: "3.12" }
      - run: pip install -e ".[dev]"           # pinned / from lockfile
      - run: ruff check .                       # lint — seconds
      - run: mypy app/                          # type-check
      - run: gitleaks detect --no-banner        # secret scan — fail loud
      - run: pytest -m "not integration and not e2e" -n auto --maxfail=1   # unit
      - run: pytest -m integration              # integration vs the postgres service

  # ---- build + scan + push: only on main, only after verify passes ----
  image:
    needs: verify
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: docker build -t myapp:git-${GITHUB_SHA} .        # module 00's Dockerfile
      - run: trivy image --severity CRITICAL --exit-code 1 myapp:git-${GITHUB_SHA}  # gate on CVEs
      - run: |                                                 # push the SHA-tagged artifact
          echo "$REGISTRY_TOKEN" | docker login -u ci --password-stdin registry.example.com
          docker push myapp:git-${GITHUB_SHA}
```

The local pre-push mirror — run the gating checks before you push, so CI rarely
tells you something you couldn't have known:

```bash
ruff check . && mypy app/ && pytest -m "not e2e" && docker build -t myapp:dev .
```

## Hands-on exercises

Use a FastAPI service with a test suite (bring one from track 12) and the module 00
Dockerfile.

### 1. Build the gating lane

Write `.github/workflows/ci.yml` with a `verify` job that checks out, sets up
Python, installs from a pinned manifest, and runs `ruff`, `mypy`, and the unit
tests — in that (cheap-first) order. Push it and confirm it runs.

### 2. Prove fail-fast ordering

In one commit, introduce both a lint error and a failing unit test. Confirm the
pipeline stops at `ruff` (the first gate) without wasting time on tests. Fix the
lint error and confirm it now fails at the unit test instead. Restore green.

### 3. Add a service container for integration tests

Add a `postgres:16` service to the job, wire `DATABASE_URL` to it, and run
`pytest -m integration`. Confirm the integration tests connect to the CI-provided
Postgres and pass. Note that the *only* thing you changed to point tests at CI's
DB vs your local DB was the env var (factor IV).

### 4. Build the image in CI

Add an `image` job (`needs: verify`, `if: main`) that builds the module 00
Dockerfile. Confirm a clean-checkout build succeeds in CI. Deliberately break the
Dockerfile (e.g. reference a missing file) and confirm CI catches it before it
could ever be deployed.

### 5. Tag by commit SHA, not latest

Tag the built image `myapp:git-<sha>`. Explain in one sentence why tagging only
`:latest` would make module 03's rollback impossible. Then push (to a local
registry or GHCR) on main only.

### 6. Add a secret scan and trip it

Add `gitleaks` (or equivalent) to the gating lane. Commit a fake `sk_live_...`
string and confirm the build fails on it. Remove it and confirm green. Connect
this to track 08 module 10's "could you open-source this now?" test.

### 7. Add vulnerability scanning with a severity gate

Add `trivy image --severity CRITICAL --exit-code 1` after the build. Observe what
it reports on your base image. Discuss why gating on `CRITICAL` (not every
severity) is the right default, and what you'd do if a critical CVE has no fix yet.

### 8. Diagnose and fix

This pipeline is green on every PR, yet the team ships bugs, occasionally leaks a
key, and can't roll back. Find every flaw and fix the pipeline.

```yaml
jobs:
  ci:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: pip install -r requirements.txt        # unpinned
      - run: pytest                                  # runs unit + integration + e2e, serially
      # no ruff, no mypy, no secret scan
      - run: docker build -t myapp:latest .          # only :latest, built on every PR
      - run: docker push myapp:latest                # pushed on every PR, including forks
```

<details>
<summary>Solution</summary>

- **Unpinned deps** → non-reproducible builds (green today, red tomorrow). Pin/lock.
- **No `ruff`/`mypy`** → the entire lint + type-hole class from track 12 module 06
  sails through. Add both as gating steps, before tests.
- **No secret scan** → keys can be committed and leaked (hence the occasional
  leak). Add `gitleaks` to the gating lane.
- **One serial `pytest`** mixing e2e into the gating path → slow PRs and flaky
  tip-tests block unrelated work (track 12 module 07). Split: unit+integration
  gate, e2e nightly/non-gating.
- **`docker build` on every PR with `:latest`** and **push on every PR** → wasteful,
  and `:latest` is a moving target so you can't roll back to a specific commit; and
  pushing on PRs (incl. forks) is a security hole. Fix: build only what's needed to
  gate, push only on main, tag `git-<sha>` so rollback has a permanent handle.
- **No vulnerability scan** → base-image/dependency CVEs go undetected. Add `trivy`
  on the built image, gate on `CRITICAL`.

The corrected pipeline is the two-job one in the command reference: a cheap-first
gating `verify` lane on every PR, and a `build → scan → push (SHA tag)` `image`
job on main only.

</details>

## Independent challenge

No code given. Design and build the complete CI pipeline for a backend service you
containerized in **module 00 (Containerizing a backend app)**, using the test
suite you built in **track 12**. Produce a two-lane pipeline: a **gating lane** on
every PR (cheap checks first — lint, type-check, secret scan — then unit tests,
then integration tests against a service-container Postgres, marker-scoped to
exclude e2e) that branch protection requires green before merge; and an
**image lane** on merge to main only (build the module 00 image, scan it for
critical CVEs, and push it tagged by commit SHA). Prove each property: fail-fast
ordering (a lint error fails in seconds), integration tests hitting a real
CI-provided database by connection-string alone, a committed fake secret failing
the build, and a SHA-tagged artifact in a registry. Write a short note explaining
where CI ends and CD begins for your service, and point to `learn/10-cicd-and-
gitops` for the tooling you'd use to promote that artifact through environments —
and to `learn/11-security-deep-dive` for going deeper on the scanning you added.

<details>
<summary>Hint</summary>

You already have all the *testing* machinery from track 12 module 07 — the markers
(`integration`, `e2e`) are the whole selection mechanism, so the gating lane is
just `pytest -m "not integration and not e2e"` then `-m integration`, and you need
no new test infrastructure. The genuinely new pieces here are the three
non-testing gates (secret scan, image build, vuln scan) and the artifact
discipline. For the "real DB by connection-string alone" proof, the point to make
visible is that your test code is *unchanged* between local and CI — only
`DATABASE_URL` differs (factor IV). For the rollback argument, the cleanest
demonstration is to build the same commit twice and show `:latest` gets
overwritten while `git-<sha>` remains a permanent, distinct handle — that
permanence is exactly what module 03's rollback depends on.

</details>

## Common mistakes & troubleshooting

- **Expensive checks first.** Waiting for a ten-minute integration run to learn
  about a lint error. Order cheap→expensive: lint → types → unit → integration.
- **No service container for integration tests.** Tests that need Postgres/Redis
  fail or get silently skipped in CI. Provide the backing service as a CI service
  container (or testcontainers) and wire it by env var.
- **Tagging only `:latest`.** A moving tag you can't roll back to. Tag every image
  by commit SHA; `:latest` is at most a convenience alias.
- **Pushing images on every PR (and from forks).** Wasteful and a security hole.
  Push only on main, after all gates pass.
- **No secret scanning.** Leaked credentials reach the repo undetected. Add a
  secret scanner as a gating step — the enforced "open-source test."
- **No vulnerability scanning.** Base-image/dependency CVEs accumulate silently.
  Scan the built image, gate on high/critical severity.
- **Unpinned dependencies.** Non-reproducible CI. Pin/lock, so a clean checkout
  builds identically today and next month.
- **Confusing CI with CD.** Trying to make the CI pipeline also do multi-environment
  promotion. Keep CI's job "produce a trustworthy artifact"; deployment is module
  03 / `learn/10`.

## Checkpoint quiz

Write down your answer to each question before expanding it — checking without attempting first is the single easiest way to fool yourself into thinking you've learned this.

1. List the stages of a complete backend CI pipeline in order, and state the single
   principle that dictates that ordering.
2. Integration tests need a real Postgres, but CI has none by default. What are the
   two ways to provide one, and what single app-side discipline lets the *same*
   test code hit your local DB and CI's DB unchanged?
3. Why tag a built image by commit SHA instead of only `:latest`, and which later
   capability does that enable?
4. Name the two kinds of scanning a backend CI pipeline should run, what each
   protects against, and which one is the automated form of track 08's
   "open-source test."
5. Draw the line between CI and CD for a backend service: where does CI's
   responsibility end, and which `learn/` track owns what comes next?
6. Why do the unit/integration stages gate every PR while building/pushing the
   image happens only on main?

<details>
<summary>Answers</summary>

1. Checkout+setup+install → lint (`ruff`) → type-check (`mypy`) → unit tests →
   integration tests (vs a service container) → build image → scan (vuln + secret)
   → push (SHA tag, main only). The principle is **fail fast, cheapest feedback
   first**: each stage is more expensive than the one before, so a failure that
   *can* be caught cheaply (a lint error in seconds) should be, not after a
   ten-minute run.
2. (i) A CI **service container** the runner starts as a sidecar (e.g. a
   `postgres:16` service), or (ii) **testcontainers**, where the test code starts
   the container via the Docker API. The enabling discipline is factor IV: the app
   and tests reach the DB by a **connection string from an env var**, so pointing
   at local vs CI is a `DATABASE_URL` change, not a code change.
3. A SHA tag is a permanent, unambiguous handle on exactly one commit's code;
   `:latest` is overwritten by every build, so you can never say "roll back to
   what ran yesterday." Tagging by SHA is what makes module 03's **rollback**
   (redeploy a previous, known-good image) possible.
4. **Vulnerability scanning** (Trivy/Grype) of the built image/dependencies —
   protects against known CVEs in base image and transitive deps, gated by
   severity. **Secret scanning** (gitleaks/trufflehog) of the repo/history —
   protects against committed credentials; it's the automated, enforced form of
   the "could you open-source this right now?" test.
5. CI's responsibility ends when a **tested, scanned, SHA-tagged image is in the
   registry** — a trustworthy artifact. CD (release/promotion to environments,
   deployment strategies) takes it from there; the deep tooling for that
   (pipelines, GitOps/ArgoCD, environment promotion) is `learn/10-cicd-and-gitops`,
   and the deployment strategies themselves are this track's module 03.
6. Unit/integration are the fast, wide base of the pyramid and catch most bugs
   cheaply, so they run on every PR and gate the merge. Building and pushing an
   image on every PR is wasteful and pushing feature-branch images to the release
   registry is pointless/risky — you only need an artifact for commits that reach
   main and are deployment candidates, so those steps run on main only.

</details>

## Next

[03-deployment-strategies](../03-deployment-strategies/README.md) — CI now produces
a tested, scanned, SHA-tagged image on every merge. The next question is how to get
that image into production *without dropping traffic*: rolling deploys, blue/green,
and canary, and what each demands of your backend code — in-flight request
handling, backward-compatible API changes, and migration ordering during a
rollout. This module also carries the track's first cumulative review.
