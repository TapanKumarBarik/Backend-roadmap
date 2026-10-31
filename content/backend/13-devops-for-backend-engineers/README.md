# 13 - DevOps for Backend Engineers

This track is about the distance between "my service passes its tests" and "my
service is running in production" — the path that CI/CD, containers, and deployment
strategies lay down, seen from the backend engineer's chair. It is deliberately
*not* a Docker/Kubernetes/Terraform course: the sibling
[`../../learn/`](../../learn/README.md) curriculum already teaches infrastructure
operations in depth. This track teaches the *other* half — what a backend developer
needs to know and decide so their code containerizes well, survives a rolling
deploy, migrates its database without downtime, and exposes what a platform needs
to manage it — and then points you at the exact `learn/` track to go deep in for
each operational concern (e.g. `learn/02-docker`, `learn/03-kubernetes`,
`learn/06-azure-container-apps`, `learn/07-aks`, `learn/10-cicd-and-gitops`).

## How this track works

- It **depends on two earlier tracks and builds directly on them**, rather than
  re-teaching them. From **track 08 (Observability and Operational Readiness)** it
  takes the 12-factor methodology (module 10), graceful shutdown (module 09),
  config and secrets (modules 02-03), and metrics (module 06) — this track puts all
  of them to work in a container and a deploy. From **track 12 (Testing and Code
  Quality)** it picks up exactly where module 07's brief CI section stopped, taking
  your test pyramid and quality gates and wiring them into a full pipeline.
- Every module answers the same question from the backend side: *what does my code
  and my app need to do to work well here*, and then *which `learn/` track do I go
  to for the operational deep-dive*. The examples are real Python/FastAPI, Docker,
  and YAML — but the deep operational mechanics are always cross-referenced, not
  duplicated.
- Every standard module (00-07) has the same shape: why it matters, concepts, a
  command reference with real code, progressive hands-on exercises (do them —
  including a "diagnose and fix" scenario each), an independent challenge with no
  code, common mistakes, and a checkpoint quiz. **Two closed-book cumulative
  reviews** sit in **module 03** (covering 00-03) and **module 07** (covering
  00-07). Go in order — each module assumes the ones before it, and the capstone
  integrates all of them.
- Everything runs locally: Docker for images and backing services (Postgres,
  Redis), a CI definition you can reason about or run with `act`, and multi-replica
  runs to feel statelessness and zero-downtime deploys — no cloud account required
  to learn the concepts (the cloud specifics are the named `learn/` tracks).

## Modules

| # | Module | What you'll be able to do | Time |
|---|--------|---------------------------|------|
| 00 | [Containerizing a backend app](00-containerizing-a-backend-app/README.md) | Write a production-grade multi-stage Dockerfile for a FastAPI app: slim base, cache-friendly layers, non-root, small image | 60-90 min |
| 01 | [The 12-factor app in a container](01-the-12-factor-app-in-a-container/README.md) | Make the container config-injected, stateless, and SIGTERM-disposable — the factors a container makes or breaks | 60-90 min |
| 02 | [CI pipelines for backend code](02-ci-pipelines-for-backend-code/README.md) | Build a two-lane CI pipeline that lints, type-checks, tests against a service container, and builds/scans/pushes a SHA-tagged image | 75-100 min |
| 03 | [Deployment strategies](03-deployment-strategies/README.md) | Deploy with rolling/blue-green/canary without dropping traffic — in-flight handling, backward-compatible APIs, migration ordering | 75-100 min |
| 04 | [Database migrations in deployment pipelines](04-database-migrations-in-deployment-pipelines/README.md) | Run zero-downtime migrations with expand/contract, batched backfills, lock-safe DDL, and correct ordering vs the rollout | 75-100 min |
| 05 | [Service configuration and environments](05-service-configuration-and-environments/README.md) | Manage config across dev/staging/prod, inject secrets safely at deploy time, and decouple release from deploy with feature flags | 60-90 min |
| 06 | [Health checks, readiness, and scaling signals](06-health-checks-readiness-and-scaling-signals/README.md) | Expose correct liveness/readiness probes and the metrics a scheduler and autoscaler need to manage your app well | 60-90 min |
| 07 | [Choosing your deployment target](07-choosing-your-deployment-target/README.md) | Choose deliberately between VM, orchestrator, PaaS, and serverless — and map each choice to the `learn/` track to go deep in | 60-90 min |
| 08 | [Capstone project](08-capstone-project/README.md) | Take a FastAPI service to a production-grade image, a CI pipeline, and a deployment runbook covering migrations, health checks, and rollback | 4-6 hrs |

## How to work through this

- **Go in order.** The track has an arc: it starts with the *artifact* (a good
  image, a 12-factor container), moves to the *pipeline* that produces it (CI), then
  to *getting it into production safely* (deployment strategies, migrations,
  config), then to *being managed by a platform* (health/scaling signals and
  choosing a target), and closes with a capstone that integrates all of it. Each
  module builds on the ones before it.
- **Take the two cumulative reviews closed-book.** They're in **module 03** (over
  modules 00-03) and **module 07** (over modules 00-07). If you can't answer
  something from three modules back, that's a signal to redo that module's
  exercises, not to reread the prose.
- **Attempt every quiz question and the independent challenge before peeking.** The
  "diagnose and fix" exercise in each module is where the real learning is — sit
  with the broken Dockerfile/pipeline/migration before opening the solution.
- **Work it alongside `learn/`.** Every module tells you which `learn/` track owns
  the operational depth for its topic. This track makes you a backend engineer who
  can *decide* and *hand off* well; the `learn/` tracks make you able to *operate*
  what you chose. They're meant to be done roughly in parallel.

Start here → [00-containerizing-a-backend-app/README.md](00-containerizing-a-backend-app/README.md)

Back to the master index: [../README.md](../README.md)

---

Once you've completed this track, the next one is
**14-system-design-interview-practice** — the final track, which steps up from
operating a single service to designing whole systems: capacity estimation, the
structured whiteboard session, and classic system-design problems end to end,
drawing on everything you've built across tracks 01-13.
