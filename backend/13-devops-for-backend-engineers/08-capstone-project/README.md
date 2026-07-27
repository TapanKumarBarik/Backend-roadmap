# Module 08: Capstone Project

## Why this matters

Every module in this track taught one slice of the path from backend code to
production: a good container image, the 12-factor container, a CI pipeline, safe
deployment strategies, zero-downtime migrations, cross-environment configuration,
health probes and scaling signals, and choosing where to run it. Individually
they're techniques. Together they're the thing that separates "it runs on my
machine" from "it ships to production ten times a day without anyone noticing" —
the actual daily reality of operating a backend service.

This capstone integrates all of it into one deliverable, the way a real handoff-to-
production works: you take a FastAPI service and produce the three artifacts a team
needs to run it safely — a **production-grade container image**, a **CI pipeline
definition** that gates and builds it, and a **deployment runbook** that a
teammate could follow at 2am to deploy, migrate, verify, and roll back. There's no
solution given, because there's no single right answer — the point is that you can
now make and defend every one of these decisions yourself, and connect each back to
the `learn/` track where you'd go deeper operationally. This is the bridge between
the backend curriculum and real deployment; do it properly and you've closed the
gap this whole track exists to close.

## The project

Take a real FastAPI service — ideally one you built and tested in an earlier track
(the track 12 testing capstone service is a strong choice, since it already has a
test suite) — and bring it from code to a documented, deployable, operable whole.
Produce three things: a container image, a CI pipeline, and a deployment runbook.

Run everything locally: Docker for the image and backing services (Postgres,
Redis), a CI definition you can reason about (and run via `act` or push to a repo
if you have one), and the runbook as a written document you could actually execute.

### Acceptance checklist

**1. A production-grade container image (module 00)**
- [ ] Multi-stage `Dockerfile` (builder + clean runtime stage).
- [ ] Pinned slim base image; no build toolchain in the final image.
- [ ] Layer ordering that keeps the dependency install cached across code changes.
- [ ] Runs as a non-root user; binds `0.0.0.0`; exec-form `CMD`.
- [ ] A `.dockerignore` that keeps `.git`, caches, tests, and `.env` out.
- [ ] Final image is reasonably small (target well under ~200 MB) — and you can say
      where the savings came from.

**2. A 12-factor, disposable container (modules 01, 05)**
- [ ] All config injected via environment at run time; nothing environment-specific
      baked into the image; secrets sourced from outside the image and typed as
      `SecretStr`.
- [ ] No in-memory or local-disk state — sessions/cache in Redis, files in object
      storage, data in Postgres. Proven by running ≥2 replicas and showing
      consistent behavior regardless of which serves a request.
- [ ] Config is validated on startup and fails fast (a missing required var crashes
      the container rather than booting misconfigured).
- [ ] The same image runs as at least two environments (e.g. dev + staging)
      differing only by injected config, no rebuild.

**3. A CI pipeline definition (module 02)**
- [ ] A gating lane on every PR: cheap checks first (lint, type-check, secret scan),
      then unit tests, then integration tests against a service-container Postgres —
      marker-scoped to exclude e2e.
- [ ] An image lane on main only: build the image, scan it for critical
      vulnerabilities, and push it tagged by commit SHA.
- [ ] Fail-fast ordering is demonstrable (a lint error fails in seconds, not after
      the test run).
- [ ] You can state where CI ends and CD begins for this service.

**4. Health, readiness, and scaling signals (module 06)**
- [ ] A dependency-free `/livez` (liveness) and a shallow, fast `/readyz`
      (readiness) that checks critical dependencies and reflects draining.
- [ ] A `lifespan` SIGTERM handler that fails readiness first, then drains in-flight
      requests, then closes pools/connections.
- [ ] A `/metrics` endpoint exposing a real load signal (request rate / in-flight /
      latency), and a stated choice of *which* signal an autoscaler should use for
      this workload and why.

**5. A deployment runbook (modules 03, 04, 07)**
- [ ] The chosen deployment strategy (rolling / blue-green / canary) and why it fits
      this service.
- [ ] **Migration ordering:** for a concrete schema change to this service, the exact
      order of migration steps relative to the app rollout (additive-before-code,
      destructive-after), run as a one-off admin process — including an
      expand/contract sequence for one non-trivial change.
- [ ] **Health-check behavior during deploy:** how readiness gates traffic to new
      replicas and drains old ones so the rollout drops zero requests.
- [ ] **Rollback procedure:** the exact steps to roll back the code (redeploy the
      previous SHA-tagged image) and why every change you ship is independently
      rollbackable (no destructive migration coupled to its code change).
- [ ] **Deployment target:** the target you'd run this on, justified via the
      module 07 framework, with the specific `learn/` track to go deep in.

**6. Prove it (a short demonstration)**
- [ ] A rolling-deploy rehearsal under steady load showing zero dropped requests
      (and a before/after with the drain removed, showing the requests you'd
      otherwise drop).
- [ ] The correctly-ordered migration applied while an old-version client keeps
      working throughout.
- [ ] A rollback executed cleanly.

### Hints

<details>
<summary>Where to start and how to sequence it</summary>

Build inside-out, artifact by artifact, so each rests on the last:

1. **Image first.** Get the multi-stage, non-root, cache-friendly `Dockerfile` and
   `.dockerignore` right (module 00), then make the container 12-factor-clean:
   config injected, state externalized, fails fast, disposable on SIGTERM
   (modules 01, 05). Prove statelessness with two replicas before moving on — every
   later artifact assumes it.
2. **Health contract next.** Add `/livez`, `/readyz`, the `lifespan` drain, and
   `/metrics` (module 06). These are what make the deploy and rollback in the
   runbook actually work, so build them before you write the runbook.
3. **CI pipeline.** You already have the test suite from track 12; the new work is
   the two-lane structure, the secret/vuln scans, and SHA-tagging the image
   (module 02). Get fail-fast ordering visible.
4. **Runbook last.** Now that the image, health contract, and CI exist, write the
   runbook (modules 03, 04, 07) as something a teammate could *execute* — concrete
   commands and orderings, not prose. The migration-ordering and rollback sections
   are where the track's hardest ideas live; make them specific to one real change
   in your service.
5. **Then prove it.** The demonstrations (zero-drop rolling deploy, ordered
   migration with a live old client, clean rollback) are how you verify the whole
   thing holds together — treat a failure here as a signal to fix the artifact, not
   to hand-wave the runbook.

</details>

<details>
<summary>What "good" looks like, and the traps to avoid</summary>

- The whole thing hangs on one fact from module 03: **two versions run against one
  database during a deploy.** If your runbook's migration ordering and API-change
  rules don't respect that, they're wrong. Apply the test "is the schema valid for
  *every* running version at this instant?" to every migration step.
- The most common capstone failures are the module-level traps: source copied
  before deps (slow builds), shell-form `CMD` (no graceful drain), a DB check in the
  *liveness* probe (restart storm), a destructive migration shipped with its code
  change (breaks the old replicas / blocks rollback), and a secret baked into the
  image or logged as a plain `str`. Walk each artifact against its module's "Common
  mistakes" section.
- The runbook is the real deliverable, not the code. Judge it by: could a teammate
  who didn't build the service follow it to deploy, verify, and roll back without
  asking you anything? If a step says "then migrate the database," it's not done —
  say *which* migration, in *what order relative to the rollout*, run *how* (one-off
  admin process, same image/config), and how to verify it before proceeding.
- Don't re-teach yourself the platform in the runbook. Where operational depth is
  needed (how AKS sequences a rolling update, how Container Apps revisions split
  traffic, how the HPA reads your metric), *point to the `learn/` track* — that
  cross-reference is itself part of doing this track correctly.

</details>

## Next

That's the track. You can now take backend code the whole distance to production:
containerize it well, make it 12-factor-clean and disposable, gate and build it in
CI, deploy it without downtime, migrate its database safely under a live rollout,
configure it across environments with secrets handled correctly, expose the health
and scaling signals a platform needs, and choose — and justify — where to run it.

Two directions from here. **Operationally**, this track has been pointing you at the
`learn/` curriculum throughout — now go work through the targets you chose:
`learn/02-docker` and `learn/03-kubernetes` for the fundamentals under every option,
`learn/06-azure-container-apps` or `learn/07-aks` for where you'll run, and
`learn/10-cicd-and-gitops` for the full delivery pipeline. **In this curriculum**,
the next and final track is
[14-system-design-interview-practice](../../14-system-design-interview-practice/README.md)
— which steps up from operating one service to designing whole systems: capacity
estimation, the structured whiteboard session, and classic system-design problems
end to end, drawing on everything from tracks 01-13.

Back to the track index: [../README.md](README.md)
