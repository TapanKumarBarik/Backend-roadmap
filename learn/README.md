# Learn: Linux → Docker → Kubernetes → Networking → Azure → AKS → Platform Engineering

A hands-on curriculum to take you from "never touched a terminal" to running,
securing, observing, and operating production platforms on Azure. Originally
four tracks (Linux/Docker/Kubernetes/AKS), then extended with a networking
and Container Apps detour, and now extended again into the full platform-
engineering stack: IaC, CI/CD, security, observability, data, and operations.
You're on Windows 11 — everything here assumes you practice inside **WSL2**
(a real Linux kernel running alongside Windows).

This is a large curriculum, being built out in batches. Tracks are added in
dependency order; if a track's folder doesn't exist yet, it hasn't been
built out yet — check back.

## Naming convention

- **Tracks** are top-level folders directly under `learn/`, named
  `NN-track-name` — a zero-padded two-digit sequence number (the order you
  do them in) plus a lowercase kebab-case slug. `NN` is globally sequential
  across the whole curriculum, not restarted per topic.
- **Modules** are subfolders inside a track, named the same way —
  `NN-module-name` — but `NN` restarts at `00` inside each track and is
  local to that track.
- Every module folder contains exactly one `README.md`. There are no other
  file types in this curriculum — no separate exercise files, no scripts —
  everything a module needs is written inline in its README as fenced code
  blocks the reader copies into their own terminal/files.
- The **last module in every track is always `NN-capstone-project`** — an
  open-ended, no-solution-given project. It's structurally different from
  every other module (no command reference, no quiz, no independent
  challenge — see below) and is what "finishing a track" means.
- Every track folder's own `README.md` is that track's index: a module
  table and a "Start here" link. The one file you're reading now
  (`learn/README.md`) is the single master index for all tracks.

## How to use this

- Go in order. Track numbering reflects dependency order, not just topic
  grouping — each track assumes everything before it, and nothing after it.
- Inside each track, module folders are numbered — do them in order.
- Every standard module README has: concepts explained plainly, a command
  reference table, **hands-on exercises** (do these — don't just read),
  an **independent challenge** with no commands given, common mistakes,
  and a checkpoint quiz. Every 3-4 modules there's also a **cumulative
  review** mixing questions from everything so far in that track. Capstone
  modules skip the quiz/challenge/review scaffolding — they're the
  open-ended integration test instead.
- Don't rush. "Practice a lot" was the ask — repeat exercises until the
  commands feel automatic, not just recognizable.

## How to actually retain this (read this once, seriously)

Guided exercises (the ones that hand you the exact command) build
recognition, not recall — they're the easiest tier of learning and, on
their own, will not make you fluent. Use the curriculum the way it's
structured to fight that:

- **Attempt every quiz question in writing before opening the answer.**
  Reading the answer without trying first feels like learning and isn't.
- **Do the independent challenge with zero peeking** at earlier solved
  exercises. Struggling for 10-15 minutes before checking a hint is the
  point, not a sign you're behind.
- **Take the cumulative reviews closed-book.** If you can't answer
  something from three modules back, that's a real signal to go redo
  that module's exercises, not just reread the prose.
- **Before starting a new module, redo one exercise from the previous
  module from memory**, no notes. Thirty seconds of friction here is
  what turns "I did this once" into "I know this."
- **When you hit a real error the curriculum didn't script for you,**
  sit with it before searching — that's the actual skill being built.

## Tracks

| # | Track | What you'll be able to do after | Depends on |
|---|-------|-----------------------------------|------------|
| 1 | [01-linux](01-linux/README.md) | Navigate, manage, script, and troubleshoot a Linux system confidently from the shell | nothing |
| 2 | [02-docker](02-docker/README.md) | Build, ship, and run containers, and deploy them to Azure | Linux |
| 3 | [03-kubernetes](03-kubernetes/README.md) | Understand and operate a Kubernetes cluster and its core objects, on a local cluster | Docker |
| 4 | [04-networking-fundamentals](04-networking-fundamentals/README.md) | Explain and troubleshoot IP, DNS, TCP/UDP, HTTP/TLS, routing, and load balancing from first principles | Linux |
| 5 | [05-azure-networking](05-azure-networking/README.md) | Design and operate VNets, NSGs, DNS, load balancers, Application Gateway, and Azure Firewall | networking-fundamentals |
| 6 | [06-azure-container-apps](06-azure-container-apps/README.md) | Deploy, scale, network, and operate real workloads on Azure Container Apps — the managed alternative to AKS | Docker, Kubernetes, azure-networking |
| 7 | [07-aks](07-aks/README.md) | Stand up, deploy to, secure, and operate a real, hand-run AKS cluster on Azure | Kubernetes, azure-container-apps |
| 8 | [08-git-and-version-control](08-git-and-version-control/README.md) | Use Git fluently: branching, rebasing, collaboration workflows, hooks, and recovering from mistakes | Linux |
| 9 | [09-terraform-on-azure](09-terraform-on-azure/README.md) | Provision and manage real Azure infrastructure (networking, AKS, ACR) declaratively instead of by hand | git, azure-networking, aks |
| 10 | [10-cicd-and-gitops](10-cicd-and-gitops/README.md) | Build real CI/CD pipelines and adopt GitOps (ArgoCD) for declarative, auditable deployments | git, docker, kubernetes, aks, terraform |
| 11 | [11-security-deep-dive](11-security-deep-dive/README.md) | Threat-model, scan, harden, and enforce policy across containers, clusters, and pipelines | docker, kubernetes, aks, cicd-and-gitops |
| 12 | [12-observability-deep-dive](12-observability-deep-dive/README.md) | Run Prometheus/Grafana, OpenTelemetry tracing, and centralized logging — the vendor-neutral side of monitoring | kubernetes, aks, security-deep-dive |
| 13 | [13-service-mesh](13-service-mesh/README.md) | Deploy and operate a service mesh (Istio/Linkerd) for traffic management, mTLS, and observability | kubernetes, aks, observability-deep-dive |
| 14 | [14-databases-and-stateful-workloads](14-databases-and-stateful-workloads/README.md) | Run stateful workloads on Kubernetes properly, and know when to use a managed Azure database instead | kubernetes, aks, terraform |
| 15 | [15-messaging-and-event-driven-architecture](15-messaging-and-event-driven-architecture/README.md) | Design event-driven systems with Service Bus, Event Grid, and Dapr pub/sub | azure-container-apps, terraform |
| 16 | [16-identity-deep-dive](16-identity-deep-dive/README.md) | Master Entra ID, service principals, managed identity, and workload identity federation across every resource type | azure-networking, terraform, aks |
| 17 | [17-governance-at-scale](17-governance-at-scale/README.md) | Structure multi-subscription environments with Azure Policy, management groups, and landing zones | identity-deep-dive, terraform |
| 18 | [18-supply-chain-security](18-supply-chain-security/README.md) | Sign images, generate SBOMs, and enforce admission control end to end | security-deep-dive, cicd-and-gitops |
| 19 | [19-api-management](19-api-management/README.md) | Front real APIs with Azure API Management: gateways, versioning, rate limiting, auth | azure-container-apps, identity-deep-dive |
| 20 | [20-sre-practices](20-sre-practices/README.md) | Define SLOs/SLIs, run incident response, and operate with an error budget | observability-deep-dive, aks |
| 21 | [21-cost-management-and-finops](21-cost-management-and-finops/README.md) | Right-size, tag, budget, and forecast cloud spend as an ongoing discipline | governance-at-scale, terraform |
| 22 | [22-disaster-recovery-and-chaos-engineering](22-disaster-recovery-and-chaos-engineering/README.md) | Design real backup/failover strategies and deliberately break your own systems to prove they recover | sre-practices, terraform |
| 23 | [23-performance-and-load-testing](23-performance-and-load-testing/README.md) | Load-test real systems and prove the autoscaling you configured earlier actually works | observability-deep-dive, azure-container-apps, aks |
| 24 | [24-platform-engineering](24-platform-engineering/README.md) | Build a self-service internal developer platform that ties every prior track together | everything above |

## Prerequisites already confirmed

- Total beginner with the command line — content starts from zero.
- Practicing in WSL2 on this machine.
- You have an active Azure subscription — most tracks from 2 onward use it
  for real deployments, not just theory.

## Setup you need before starting `01-linux`

Install WSL2 with Ubuntu (run in **PowerShell as Administrator**):

```powershell
wsl --install -d Ubuntu
```

Restart if prompted, then open the "Ubuntu" app from the Start menu and
finish creating your Linux username/password. That terminal is where
almost every exercise in this curriculum happens.

Start here → [01-linux/README.md](01-linux/README.md)
