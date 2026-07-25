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
  common mistakes, and a checkpoint quiz.
- Don't rush. "Practice a lot" was the ask — repeat exercises until the
  commands feel automatic, not just recognizable.

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
