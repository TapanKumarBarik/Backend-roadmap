# Module 07: Choosing Your Deployment Target

## Why this matters

You've done all the app-side work: a clean image (module 00), a stateless
disposable container (module 01), a CI pipeline that produces a trustworthy
artifact (module 02), safe deployment and migration patterns (modules 03-04),
externalized config (module 05), and probes plus scaling signals (module 06). The
last decision is *where that container actually runs* — and it's a genuine
decision, not a default. A backend service can run on a plain VM, on a container
orchestrator (self-managed Kubernetes or managed AKS), on a PaaS/container platform
(Azure Container Apps), or as serverless functions. Each choice trades **operational
control** against **operational burden**, and picking wrong means either drowning a
small team in Kubernetes it doesn't need or hitting a serverless wall a real
workload can't fit.

This is a *decision-framework* module, not a hands-on-with-each-platform module. The
point isn't to teach you AKS or Container Apps — the `learn/` curriculum does that
in depth, and this module's whole job is to tell you *which* `learn/` track to go
deep in for the target you choose. What you own as the backend engineer is the
reasoning: understanding what each target demands of your app, what it does for you,
and how to match the target to your team's size, the workload's shape, and how much
operational surface you can afford to own. Because you built the app to be
12-factor-clean (stateless, config-in-env, disposable, port-binding), it can run on
*any* of these targets — that portability is exactly what makes the choice a free
one rather than a forced one.

## Concepts

### The control-vs-burden spectrum

Every deployment target sits on one axis: **how much of the operational stack you
control, versus how much the platform manages for you.** More control means more
flexibility and fewer constraints — and more that you must operate, patch, secure,
and get paged for. Less control means less to operate — and more constraints on
what your app can do and how it behaves. From most-control/most-burden to
least:

- **VM (IaaS):** you get a machine; you own everything above the hypervisor — OS
  patching, the container runtime (or running the process directly), the
  load balancer, scaling, health-checking, deploys. Maximum control, maximum toil.
- **Self-managed Kubernetes:** you run the orchestrator yourself. You get
  Kubernetes' full power (any workload, fine-grained control) but you also operate
  the control plane, nodes, upgrades, networking, and add-ons. Enormous burden.
- **Managed Kubernetes (AKS):** the cloud runs the control plane; you run your
  workloads and (to varying degrees) the node pools. Full Kubernetes API, much less
  of the cluster to babysit — but still real Kubernetes complexity to understand.
- **PaaS / managed container platform (Azure Container Apps):** you hand the
  platform a container and a bit of config; it runs, scales (including to zero),
  load-balances, and does rolling deploys for you. Much of Kubernetes' benefit,
  little of its operational surface — at the cost of some flexibility.
- **Serverless functions (Azure Functions, Lambda):** you hand the platform *code*
  (or a small container) and it runs it per-request/per-event, scaling
  automatically, billing per execution. Minimum burden, maximum constraint — the
  platform dictates the execution model.

```
  MORE control / MORE burden ◄───────────────────────► MORE managed / LESS burden
  ┌────────┬────────────────┬─────────────┬───────────────┬──────────────┐
  │  VM    │ self-managed   │ managed k8s │  PaaS         │  serverless  │
  │ (IaaS) │  Kubernetes    │  (AKS)      │ (Container    │  functions   │
  │        │                │             │  Apps)        │              │
  └────────┴────────────────┴─────────────┴───────────────┴──────────────┘
   you patch OS,             you run       you hand it     you hand it code;
   run everything            workloads     a container     it runs per-event
                                           + config
      ◄── flexibility, fewer constraints        constraints, near-zero ops ──►
              default bias: start here ─────────────────────┘ (move left only if forced)
```

The core judgment: **push as far toward "managed" as your workload's constraints
allow, because operational burden is a real, ongoing cost that a small team pays in
attention it could spend on the product.** You move *back* toward control only when
a specific constraint forces you to. Kubernetes is not the default; it's what you
choose when you've outgrown the simpler options or genuinely need its power.

### What each target demands of your app (and gives back)

The 12-factor work you did makes your app portable, but each target still has a
distinct contract:

- **VM:** you must supply the process manager (systemd), reverse proxy, and deploy
  scripting yourself, or run your own Docker. Nothing enforces statelessness or
  disposability — which is a trap: it's the easiest place to accidentally rely on
  local state. Suits legacy workloads, things needing unusual OS access, or a
  single simple service where a scheduler is overkill.
- **Orchestrator (AKS / self-managed k8s):** consumes exactly the contract this
  track built — a container image, liveness/readiness probes (module 06), a
  `SIGTERM` drain (module 01), config via env/Secrets (module 05), and metrics for
  the HPA (module 06). In return: rolling deploys, self-healing, horizontal
  autoscaling, service discovery, and the ecosystem (Istio, ArgoCD, etc.). Best fit
  when you have *many* services, need fine control over networking/scheduling, or
  are standardizing a platform for multiple teams — and can afford the complexity.
- **Container Apps (PaaS):** wants the same clean container but hides Kubernetes;
  you get scale-to-zero, revisions with built-in blue/green/canary traffic
  splitting, managed ingress, and Dapr/KEDA integration without writing YAML for a
  cluster. Best fit for most *individual* backend services and small teams that want
  container flexibility without operating a cluster.
- **Serverless functions:** demands your work fit an event/request-triggered
  handler with a short execution limit and (classically) no long-lived
  connections or in-memory state between invocations — and imposes **cold starts**
  (latency when scaling from zero). In return: true scale-to-zero, per-execution
  billing, and near-zero ops. Best fit for spiky/event-driven/low-baseline
  workloads, glue, and webhooks — a *bad* fit for steady high-throughput services,
  long-running work, or anything latency-sensitive that can't absorb cold starts.

### The decision framework

Rather than "which is best" (there is no best), work through the constraints in
order — the first one that bites narrows your choice:

1. **Workload shape.** Is it a long-running HTTP service, or short event/request-
   triggered bursts with a low baseline? Bursty/event-driven with idle periods →
   serverless or scale-to-zero PaaS is compelling. Steady, latency-sensitive,
   high-throughput → containers on a PaaS or orchestrator; serverless cold starts
   and execution limits fight you.
2. **Team size & operational capacity.** Can you afford to *operate* a Kubernetes
   cluster (upgrades, networking, on-call for the platform itself)? A small team
   almost always should not run self-managed k8s, and often shouldn't run AKS
   either if a PaaS fits — the burden buys nothing they need.
3. **Scale & number of services.** One or a few services → PaaS/serverless. Many
   interdependent services needing shared networking, policy, service mesh, and a
   standardized deploy platform across teams → an orchestrator starts earning its
   complexity.
4. **Control & special needs.** Do you need specific networking, GPUs, custom
   schedulers, particular OS access, or ecosystem tools (a service mesh, custom
   operators)? That pulls toward AKS/k8s. Do you have legacy/unusual-OS needs a
   container can't express? That may pull to a VM.
5. **Cost model.** Spiky low-baseline traffic → per-execution/scale-to-zero billing
   (serverless/Container Apps) can be dramatically cheaper than always-on replicas.
   Steady high traffic → always-on containers are usually cheaper than
   per-execution.

The framework's spirit: **start from the most-managed option that fits and move
toward control only when a constraint forces it.** Most individual backend services
are best on a PaaS like Container Apps; you graduate to an orchestrator when scale,
service count, or control needs justify the burden — not by default or by résumé.

### Mapping each choice to where you go deep

This module deliberately does *not* teach you to operate these platforms — it tells
you which `learn/` track to work through once you've chosen:

- **Containers themselves** (building/running images, registries, the fundamentals
  under every option) → **`learn/02-docker`**. Foundational to all the container
  targets; do this regardless.
- **Kubernetes concepts** (Pods, Deployments, Services, probes, rolling updates —
  the model behind AKS *and* Container Apps) → **`learn/03-kubernetes`**. Even if
  you deploy to a PaaS, this explains what it's doing for you.
- **Managed Kubernetes on Azure** (standing up, securing, and operating a real
  cluster) → **`learn/07-aks`**.
- **The PaaS / managed-container option** (deploy, scale, network, and operate
  workloads on the managed alternative to AKS) → **`learn/06-azure-container-apps`**.
- **The full path to production** (CI/CD pipelines, GitOps, promotion) →
  **`learn/10-cicd-and-gitops`**; and the **broader platform** that ties targets,
  IaC, and self-service together → **`learn/24-platform-engineering`**.
- **Provisioning any of it declaratively** (VNets, clusters, registries as code) →
  **`learn/09-terraform-on-azure`**.

The division of labor for this whole track, restated: *you* make the app deployable
and choose the target; *`learn/`* is where you learn to operate that target. Both
curricula are meant to be worked roughly in parallel — this module is the map that
connects your app-side decision to the operational deep-dive.

### Portability is the payoff — and its limits

Because you built a 12-factor container, the *same artifact* can move between these
targets: a service that runs on Container Apps today can move to AKS when you
outgrow the PaaS, with no code change — the deployment target is (mostly) a
release-time concern, not an app-design one. That's the dividend of everything this
track insisted on: statelessness, config-in-env, disposability, port-binding, and
health probes are the common contract *every* target consumes.

The limits are worth naming honestly, so portability doesn't become a fantasy of
"never commit": serverless's execution model (short-lived, stateless-per-invocation,
cold starts) is a genuinely different shape that a steady HTTP service can't always
be poured into without rework; and deep coupling to one platform's proprietary
features (a specific managed queue, a platform-specific autoscaler trigger, a
vendor identity model) creates real lock-in even with a portable container. The
pragmatic stance is **avoid gratuitous lock-in** (keep the app 12-factor and the
config externalized so a move is *possible*) while **using the managed features
that genuinely save you operational burden** (don't self-host a queue to stay
"portable" if the managed one is right) — a judgment call, exactly like module 04's
"normalize first, denormalize with a measured reason." Portability is insurance, not
a mandate to run everything yourself.

## Command reference

| Target | You operate | Platform gives you | Go deep in |
|---|---|---|---|
| VM (IaaS) | OS, runtime, proxy, deploys, scaling | Just the machine | `learn/01-linux`, `learn/02-docker` |
| Self-managed k8s | Control plane, nodes, everything | Orchestration (if you run it) | `learn/03-kubernetes` |
| Managed k8s (AKS) | Workloads, node pools | Managed control plane + k8s API | `learn/07-aks` (+ `learn/03`) |
| PaaS (Container Apps) | The container + config | Scaling (to zero), ingress, revisions, deploys | `learn/06-azure-container-apps` |
| Serverless functions | The handler code | Per-event execution, autoscale, per-use billing | (Azure Functions; concepts in `learn/06`) |

The decision, as a checklist you run top-down (first constraint that bites wins):

```text
1. Workload shape?     bursty/event-driven + low baseline → serverless / scale-to-zero PaaS
                       steady/latency-sensitive/high-throughput → PaaS or orchestrator
2. Team capacity?      small team / no platform on-call → PaaS (avoid self-managed k8s)
3. Scale & # services? one/few → PaaS; many interdependent + shared platform → orchestrator
4. Control/special?    mesh/GPU/custom networking/OS access → AKS or VM
5. Cost model?         spiky low-baseline → per-execution/scale-to-zero; steady → always-on

Default bias: start most-managed that fits (usually Container Apps for a single
service); move toward control only when a constraint above forces it.
```

The same 12-factor container across two targets (the artifact doesn't change — only
the release wrapper does; mechanics live in the `learn/` tracks named):

```yaml
# ---- Container Apps (PaaS): hand it the image + config; it scales/ingresses/deploys ----
# properties: image, env (incl. secretRef), targetPort, minReplicas: 0, scaleRule (concurrency)
#   → learn/06-azure-container-apps

# ---- AKS (orchestrator): the same image, but you declare the k8s objects ----
# Deployment(image, envFrom, readinessProbe /readyz, livenessProbe /livez) + Service + HPA
#   → learn/03-kubernetes, learn/07-aks
```

## Hands-on exercises

These are decision and mapping exercises — the operating-the-platform practice is
in the `learn/` tracks. Use a real service you've carried through this track.

### 1. Place five services on the spectrum

For each, pick a target and justify it in one sentence: (a) a steady internal REST
API, ~200 req/s all day; (b) a webhook receiver that fires a few times an hour; (c)
a nightly batch job; (d) a platform of 15 interdependent microservices for 4 teams;
(e) a legacy app needing a specific kernel module. Name which `learn/` track you'd
go deep in for each.

### 2. Run the framework on your own service

Take the service you built across this track and walk it top-down through the
5-question framework. Write your answer to each question and the target the first
binding constraint points to. Note whether the "most-managed that fits" default
lands you somewhere different from where you'd have guessed.

### 3. Cost-model a spiky workload

For a workload that's idle 20 hours a day and busy 4, sketch (roughly) the cost of
always-on replicas vs scale-to-zero/per-execution. Identify the crossover: at what
baseline utilization does always-on become cheaper than per-execution? State which
target each side of the crossover favors.

### 4. Map the app-side contract to the target

List the artifacts this track produced (image, `/livez` + `/readyz`, SIGTERM drain,
env/Secret config, `/metrics`). For AKS and for Container Apps, say which of these
each platform consumes and how — and confirm the *image itself* is identical for
both. This is the portability payoff made concrete.

### 5. Find the serverless wall

Take a steady, latency-sensitive HTTP service and list the specific reasons it's a
poor serverless-functions fit (cold starts, execution limits, connection
management, cost at steady load). Then take a bursty event handler and list why it's
an *excellent* fit. Articulate the shape difference in one sentence.

### 6. Justify graduating from PaaS to orchestrator

Describe a concrete point at which a service/team should move from Container Apps to
AKS — what specific constraint (from the framework) triggers it — and, just as
important, describe a case where reaching for Kubernetes would be over-engineering.
Point to `learn/06` and `learn/07`/`learn/03` respectively.

### 7. Diagnose and fix: the target mismatch

A four-person startup runs its single moderate-traffic FastAPI API on a
self-managed Kubernetes cluster they stood up themselves. They spend most of their
week on cluster upgrades, node issues, and platform on-call; feature work has
stalled; the service itself is a plain stateless web app with no special needs.
Separately, they moved a latency-critical, steady-throughput synchronous API onto
serverless functions "to save money" and now users complain about intermittent
1-second delays. Diagnose both mismatches and prescribe the right target for each,
with the `learn/` track to go deep in.

<details>
<summary>Solution</summary>

**Self-managed k8s for a single simple service (four-person team):** a textbook
control-vs-burden mismatch — they're paying the *maximum* operational burden
(running the control plane, nodes, upgrades, platform on-call) for a workload that
has none of the needs (many services, special networking, mesh) that justify it.
The framework's questions 2 (team capacity) and 3 (scale/# services) both point the
other way. Fix: move to a **PaaS — Azure Container Apps** — which gives them
scaling, ingress, and rolling deploys for their clean container with almost no
platform to operate, freeing the week for product. Go deep in
`learn/06-azure-container-apps`. (If they later grow to many interdependent
services, *then* AKS — `learn/07-aks` — earns its complexity.)

**Serverless for a latency-critical steady API:** a workload-shape mismatch
(framework question 1). Serverless scales to zero and bills per-execution, but its
**cold starts** cause the intermittent 1-second delays, and for *steady* throughput
it's neither cheaper nor lower-latency than always-on containers. Fix: run it as an
always-on container on a **PaaS (Container Apps)** or an orchestrator, where a warm
replica pool serves steady traffic with predictable latency. Serverless was the
right *instinct* for cost only if the traffic were spiky/low-baseline — it isn't.

Root theme: match the target to the workload shape and the team's operational
capacity, biasing toward the most-managed option that fits — not toward Kubernetes
by default, and not toward serverless for a shape it doesn't suit.

</details>

## Independent challenge

No code given. Write a **deployment-target decision document** for the service
you've carried through this entire track. Run it top-down through the five-question
framework (workload shape, team capacity, scale/number of services, control/special
needs, cost model), state which target the first binding constraint selects, and
justify why you did *not* pick each of the other four — explicitly naming the
operational burden or constraint that ruled each out. Then demonstrate the
portability payoff: show that the artifact from **module 00 (Containerizing a
backend app)** and the app-side contract from **module 06 (Health checks,
readiness, and scaling signals)** and **module 01 (The 12-factor app in a
container)** would be consumed by *both* your chosen target and one alternative with
no change to the image — and name the specific `learn/` track you'd work through to
operate each (`learn/06-azure-container-apps`, `learn/07-aks`, `learn/03-kubernetes`,
or `learn/02-docker`). Close with an honest paragraph on lock-in: which managed
features you'd adopt for the operational savings even though they create some
coupling, and which you'd keep at arm's length to preserve the ability to move —
framing it as the same measured-tradeoff judgment, not a dogmatic "never commit."

<details>
<summary>Hint</summary>

The document is most honest if you run the framework *in order* and stop at the
first constraint that actually binds, rather than reasoning toward a target you
already wanted. For most single backend services the first binding constraint is
team capacity or scale (questions 2-3), which points at a PaaS — and the discipline
is to justify *away* from Kubernetes unless a later question (control/special needs)
genuinely pulls you back. The portability demonstration is the payoff of the whole
track: the same image, `/livez`/`/readyz`, SIGTERM drain, and env-based config are
the common contract every container target consumes, so "no change to the image"
should be literally true — that's your evidence. For the lock-in paragraph, apply
module 04's framing: use the managed feature when it clearly saves burden, avoid it
when the coupling costs more than the saving, and be able to say which is which.

</details>

## Common mistakes & troubleshooting

- **Kubernetes by default (or by résumé).** Running a cluster for a single simple
  service buries a small team in operational burden that buys nothing. Start
  most-managed; graduate to an orchestrator only when a constraint forces it.
- **Serverless for a steady, latency-sensitive service.** Cold starts and execution
  limits fight a workload that needs warm, predictable, long-running handlers, and
  it's not even cheaper at steady load. Serverless is for spiky/event-driven work.
- **Choosing a target before knowing the workload shape.** The shape (bursty vs
  steady, short vs long) is the first question; picking the platform first
  backwards-rationalizes the fit.
- **Ignoring operational capacity.** A powerful target you can't operate is a
  liability. Weigh the ongoing burden (upgrades, on-call for the platform) against
  team size honestly.
- **Cost-modeling only one dimension.** Per-execution looks cheap until steady load
  makes always-on cheaper (and vice versa). Model your *actual* traffic profile.
- **Confusing "portable" with "must self-host."** Refusing every managed feature to
  stay portable costs more burden than the lock-in it avoids. Use managed features
  that save real toil; avoid gratuitous coupling.
- **Trying to learn to *operate* the platform here.** This module is the decision;
  the operational depth is the named `learn/` track. Go there for hands-on.

## Checkpoint quiz

Write down your answer to each question before expanding it — checking without attempting first is the single easiest way to fool yourself into thinking you've learned this.

1. What single axis organizes all the deployment targets, and what's the default
   bias the framework recommends along it?
2. Give the five questions of the decision framework in order, and explain why you
   run them top-down and stop at the first constraint that binds.
3. Why is serverless a great fit for a bursty webhook receiver and a poor fit for a
   steady, latency-sensitive API? Name the two serverless properties that drive
   each verdict.
4. A four-person team is running its single stateless service on self-managed
   Kubernetes. What's the mismatch, and what target (and `learn/` track) would you
   move them to?
5. Name the `learn/` track you'd go deep in for each: containers/images; the
   Kubernetes model itself; managed Kubernetes on Azure; the managed-container PaaS.
6. What makes the same container portable across VM, PaaS, and orchestrator, and
   what are the two honest limits on that portability?

<details>
<summary>Answers</summary>

1. The **control-vs-operational-burden** axis: more control (VM → self-managed k8s
   → AKS → PaaS → serverless) means more flexibility but more to operate; more
   managed means less to operate but more constraints. The default bias: **start
   from the most-managed option that fits your workload, and move toward control
   only when a specific constraint forces it** — Kubernetes is not the default.
2. (1) Workload shape, (2) team/operational capacity, (3) scale & number of
   services, (4) control/special needs, (5) cost model. You run them top-down and
   stop at the first binding constraint because the earliest constraint that
   actually bites narrows the choice decisively — e.g. a small team with no platform
   on-call (question 2) rules out self-managed k8s regardless of the later answers,
   so there's no need to over-analyze the rest.
3. A bursty webhook receiver has a low baseline and idle periods, so serverless's
   **scale-to-zero and per-execution billing** make it cheap and effortless. A
   steady, latency-sensitive API is hurt by the same model's **cold starts** (the
   intermittent latency when scaling from zero) and **short execution limits /
   per-invocation model**, and at steady load per-execution isn't even cheaper than
   always-on — so it wants warm, long-running container replicas instead.
4. They're paying the maximum operational burden (running and on-call for the whole
   cluster) for a workload with none of the needs that justify it — a control-vs-
   burden mismatch (framework questions 2 and 3). Move them to a **PaaS — Azure
   Container Apps** (`learn/06-azure-container-apps`), which runs their clean
   container with scaling, ingress, and rolling deploys and almost no platform to
   operate.
5. Containers/images → `learn/02-docker`; the Kubernetes model itself →
   `learn/03-kubernetes`; managed Kubernetes on Azure → `learn/07-aks`; the
   managed-container PaaS → `learn/06-azure-container-apps`.
6. The 12-factor contract every target consumes: a stateless, disposable,
   port-binding container image with config in the environment and health probes —
   so the *same artifact* runs anywhere with only the release wrapper changing. The
   two honest limits: (i) serverless's execution model is a genuinely different
   shape a steady HTTP service can't always be poured into without rework; and (ii)
   deep coupling to a platform's proprietary features (a specific managed
   queue/autoscaler/identity model) creates real lock-in even with a portable
   container — so avoid *gratuitous* lock-in while still using managed features that
   save genuine operational burden.

</details>

## Cumulative review

Closed-book. Don't reopen modules 00-07 while attempting these — the point is to
find out what actually stuck.

1. A one-line code change triggers a four-minute Docker build that reinstalls every
   dependency and produces a 1.1 GB image that runs as root and is unreachable when
   published. Name every fault and the fix (module 00), and state the build-cache
   rule in one sentence.
2. "Works on one replica, breaks on three": inconsistent counts and lost uploads.
   Name the factor (module 01), the two sub-causes and their fixes, and explain why
   this same property is what makes both the rolling deploys of module 03 and the
   autoscaling of module 06 possible.
3. Design the two-lane CI pipeline for a backend service (module 02): what each lane
   runs, what gates vs informs, why the image is tagged by commit SHA, and which
   later capability that tagging enables.
4. You must rename a DB column used by both the API and still-running old replicas,
   with zero downtime. Give the full expand/contract sequence of deploys and
   migrations (modules 03-04), the ordering rule for the additive vs the destructive
   migration, and the single invariant that must hold at every step.
5. Walk a single replica from a rolling-deploy SIGTERM to a clean exit, naming: what
   makes uvicorn receive the signal (module 00), the readiness/drain sequence
   (modules 01, 06), the pre-stop-delay race it addresses, and why readiness must
   fail *before* draining.
6. For each probe, state its question, the platform action on failure, and whether
   it may check a dependency (module 06): liveness, readiness, startup. Then explain
   why a DB check in the liveness probe causes a fleet-wide restart storm.
7. A service is misconfigured in three ways (module 05): staging wiped prod's DB, a
   live key was printed in logs, and turning off a broken feature needed a 40-minute
   redeploy. Give the fix for each and the general principle ("fail early and loud,
   not late and quiet").
8. Run the deployment-target framework (module 07) for: (a) a spiky event handler
   idle most of the day; (b) a steady latency-sensitive API for a four-person team;
   (c) a 15-service platform for multiple teams. Give the target and the `learn/`
   track for each.

<details>
<summary>Answers</summary>

1. Faults: `COPY . .` before `pip install` (busts the dep cache — the four-minute
   reinstall); full/unpinned base image (`python:latest` → ~1 GB and
   non-reproducible); no multi-stage (ships build tooling); runs as root (no
   `USER`); binds `127.0.0.1` (unreachable); shell-form `CMD` (no SIGTERM). Fixes:
   copy the manifest and install before the source; pin `python:3.12-slim` +
   multi-stage; add a non-root `appuser`; bind `0.0.0.0`; exec-form `CMD`. Cache
   rule: a layer is reused only if its instruction and every layer before it are
   unchanged — once one busts, all later layers rebuild.
2. Factor VI (stateless processes). Sub-causes: in-memory state (per-replica dict/
   counter → inconsistent) → move to Redis; local-disk writes (uploads on one
   ephemeral replica → lost) → object storage + DB pointer. It's the precondition
   for rolling deploys (which kill/replace any replica) and autoscaling (which adds
   interchangeable replicas) because both require that any replica can serve any
   request identically — only true if the app holds no local state.
3. A **gating lane** on every PR (cheap first: lint → mypy → secret scan → unit →
   integration vs a service-container Postgres, marker-scoped to exclude e2e),
   required green by branch protection; and an **image lane** on main only (build the
   module 00 image, scan for critical CVEs, push tagged `git-<sha>`). The gating
   lane gates the merge; e2e/nightly informs. Tagging by SHA gives a permanent,
   addressable handle on exactly one commit's code — which is what makes module 03's
   **rollback** (redeploy a previous known-good image) possible; `:latest` is a
   moving target you can't roll back to.
4. **Deploy 1:** migration adds the new column (nullable, additive — runs before/with
   the new code); code dual-writes both and reads the old; batched idempotent
   backfill. **Deploy 2:** code switches reads to the new column (still writing
   both). **Deploy 3:** code stops writing the old column. **Deploy 4 (contract):**
   migration drops the old column — only after the last version that used it is gone.
   Additive migrations run *before* the code that needs them; destructive ones run
   *after* every version that used the thing is gone. Invariant: the schema is valid
   for *both* the old and new running versions at every instant.
5. The platform sends SIGTERM to PID 1 — uvicorn receives it because `CMD` is exec
   form (module 00). The `lifespan` shutdown flips readiness to `503` first
   (module 06) so the LB stops routing new requests, waits a short pre-stop delay so
   that readiness failure propagates before it stops accepting work (the race where
   the LB might route one more request right after SIGTERM), then drains in-flight
   requests, closes pools, and exits before the grace period (module 01). Readiness
   must fail *before* draining so no new request is admitted to a replica that's
   about to stop.
6. **Liveness:** "is the process broken?" → platform **restarts** the container →
   must **not** check dependencies (in-process only). **Readiness:** "can it serve
   now?" → platform **removes it from the LB** (no restart) → **may** check
   dependencies (shallow/fast) and reflect draining. **Startup:** "has it finished
   starting?" → delays liveness/readiness → checks init state only. A DB check in
   liveness causes a restart storm because a brief DB blip then fails liveness on
   *every* replica, so the platform restarts the whole fleet — and restarting fixes
   nothing about the DB, making the outage worse.
7. Staging wiped prod's DB → per-environment config *and* separate secret scopes so
   staging simply doesn't have prod's credentials (isolation by absence). Live key
   in logs → `SecretStr` (redacts in logs/errors) and source it from a secret store,
   never in repo/image. Feature-off needed a redeploy → make it a config-driven
   **feature flag**, flippable without deploying (instant kill switch). Principle:
   config errors should fail **early and loud** (typed, validated config crashing at
   startup and failing the rollout) rather than **late and quiet** (subtly broken in
   prod).
8. (a) Spiky, idle-most-of-the-day event handler → **serverless functions** (or a
   scale-to-zero PaaS) for per-execution billing; concepts in
   `learn/06-azure-container-apps`. (b) Steady latency-sensitive API, four-person
   team → **PaaS, Azure Container Apps** (avoid self-managed k8s the team can't
   afford to operate) → `learn/06-azure-container-apps`. (c) 15-service multi-team
   platform → **managed orchestrator, AKS** (scale and service count justify the
   complexity) → `learn/07-aks` (and `learn/03-kubernetes`).

</details>

## Further reading & sources

- [AWS: Types of cloud computing (IaaS / PaaS / serverless)](https://aws.amazon.com/types-of-cloud-computing/) - A vendor-neutral framing of the control-vs-managed spectrum this module organizes targets along.
- [Azure Container Apps: Overview](https://learn.microsoft.com/en-us/azure/container-apps/overview) - The managed-container PaaS: scale-to-zero, revisions, and built-in traffic splitting without operating a cluster.
- [Azure Kubernetes Service (AKS) documentation](https://learn.microsoft.com/en-us/azure/aks/) - Managed Kubernetes for when service count and control needs justify the orchestrator's complexity.
- [Google Cloud: Serverless vs containers](https://cloud.google.com/discover/serverless-vs-containers) - The workload-shape trade-offs (cold starts, execution limits) that decide serverless fit.
- [AWS Lambda: Cold starts and execution model](https://docs.aws.amazon.com/lambda/latest/dg/lambda-runtime-environment.html) - Why serverless suits bursty/event-driven work and fights steady latency-sensitive services.

## Next

[08-capstone-project](../08-capstone-project/README.md) — you can now containerize a
backend service well, build it in CI, deploy it without downtime, migrate its
database safely, configure it across environments, expose the signals a platform
needs, and choose where to run it. The capstone integrates all of it: take a real
FastAPI service from code to a documented, deployable, operable whole — a proper
image, a CI pipeline, and a deployment runbook covering migration ordering, health
checks, and rollback for a rolling deploy.
