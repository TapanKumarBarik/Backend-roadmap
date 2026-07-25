# Learn: Linux → Docker → Kubernetes → Networking → Azure → AKS

A hands-on curriculum to take you from "never touched a terminal" to
comfortable running production workloads on Azure Kubernetes Service (AKS),
with a full networking and Azure Container Apps detour along the way.
You're on Windows 11 — everything here assumes you practice inside **WSL2**
(a real Linux kernel running alongside Windows).

## Naming convention

- **Tracks** are top-level folders directly under `learn/`, named
  `NN-track-name` — a zero-padded two-digit sequence number (the order you
  do them in) plus a lowercase kebab-case slug. `NN` is globally sequential
  across the whole curriculum (01 through 07), not restarted per topic.
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
  grouping — each track assumes everything before it, and nothing after it:

  | Order | Track | Depends on |
  |---|---|---|
  | 1 | `01-linux` | nothing |
  | 2 | `02-docker` | Linux shell comfort |
  | 3 | `03-kubernetes` | Docker |
  | 4 | `04-networking-fundamentals` | Linux (shell tools only — otherwise standalone) |
  | 5 | `05-azure-networking` | networking-fundamentals |
  | 6 | `06-azure-container-apps` | Docker, Kubernetes (local), azure-networking |
  | 7 | `07-aks` | Kubernetes (local), and benefits from having seen Container Apps first |

  Networking comes before Container Apps because Container Apps' own
  networking model (VNet integration, ingress) is Azure networking with a
  thinner wrapper. Container Apps comes before AKS deliberately: it's the
  managed, cluster-abstracted way to run containers on Azure, so you feel
  what it automates for you *before* you learn to run all of that by hand
  on a real cluster in `07-aks`.
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

| # | Track | What you'll be able to do after |
|---|-------|-----------------------------------|
| 1 | [01-linux](01-linux/README.md) | Navigate, manage, script, and troubleshoot a Linux system confidently from the shell |
| 2 | [02-docker](02-docker/README.md) | Build, ship, and run containers, and deploy them to Azure |
| 3 | [03-kubernetes](03-kubernetes/README.md) | Understand and operate a Kubernetes cluster and its core objects, on a local cluster |
| 4 | [04-networking-fundamentals](04-networking-fundamentals/README.md) | Explain and troubleshoot IP, DNS, TCP/UDP, HTTP/TLS, routing, and load balancing from first principles |
| 5 | [05-azure-networking](05-azure-networking/README.md) | Design and operate VNets, NSGs, DNS, load balancers, Application Gateway, and Azure Firewall |
| 6 | [06-azure-container-apps](06-azure-container-apps/README.md) | Deploy, scale, network, and operate real workloads on Azure Container Apps — the managed alternative to AKS |
| 7 | [07-aks](07-aks/README.md) | Stand up, deploy to, secure, and operate a real, hand-run AKS cluster on Azure |

## Prerequisites already confirmed

- Total beginner with the command line — content starts from zero.
- Practicing in WSL2 on this machine.
- You have an active Azure subscription — tracks 2 and 5-7 use it for real
  deployments, not just theory.

## Setup you need before starting `01-linux`

Install WSL2 with Ubuntu (run in **PowerShell as Administrator**):

```powershell
wsl --install -d Ubuntu
```

Restart if prompted, then open the "Ubuntu" app from the Start menu and
finish creating your Linux username/password. That terminal is where
almost every exercise in this curriculum happens.

Start here → [01-linux/README.md](01-linux/README.md)
