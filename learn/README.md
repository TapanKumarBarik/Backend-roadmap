# Learn: Linux → Docker → Kubernetes → AKS

A hands-on curriculum to take you from "never touched a terminal" to
comfortable running production workloads on Azure Kubernetes Service (AKS).
You're on Windows 11 — everything here assumes you practice inside **WSL2**
(a real Linux kernel running alongside Windows).

## How to use this

- Go in order: `01-linux` → `02-docker` → `03-kubernetes` → `04-aks`. Each
  track builds on the last — Docker assumes you can use a Linux shell,
  Kubernetes assumes you're comfortable with containers, AKS assumes you
  know Kubernetes.
- Inside each track, folders are numbered — do them in order.
- Every module README has: concepts explained plainly, a command
  reference table, **hands-on exercises** (do these — don't just read),
  an **independent challenge** with no commands given, common mistakes,
  and a checkpoint quiz. Every 3-4 modules there's also a **cumulative
  review** mixing questions from everything so far in that track.
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
| 3 | [03-kubernetes](03-kubernetes/README.md) | Understand and operate a Kubernetes cluster and its core objects |
| 4 | [04-aks](04-aks/README.md) | Stand up, deploy to, secure, and operate a real AKS cluster on Azure |

## Prerequisites already confirmed

- Total beginner with the command line — content starts from zero.
- Practicing in WSL2 on this machine.
- You have an active Azure subscription — the Docker and AKS tracks use it
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
