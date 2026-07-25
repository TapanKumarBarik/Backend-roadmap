
# Track 2: Docker

You've got Linux fundamentals down — shell, permissions, processes, bash
scripting. This track builds on that directly: a container is just a Linux
process with restricted views of the filesystem, network, and process
table, and almost every Docker concept maps back to something you already
know (`chroot`, namespaces, cgroups, `ps`, file permissions).

By the end of this track you'll be able to build images, run and network
containers, persist data with volumes, write multi-container apps with
Compose, optimize and secure images, push images to a registry, and deploy
a containerized app to Azure two different ways (Azure Container
Instances and Azure App Service).

## How this track works

- Modules are numbered — go in order. Each one only uses Docker concepts
  introduced in an earlier module of this track, plus the Linux knowledge
  you already have.
- Every module (except this index and the capstone) follows the same
  shape: **Why this matters**, **Concepts**, **Command reference**,
  **Hands-on exercises**, **Common mistakes & troubleshooting**, and a
  **Checkpoint quiz**.
- Do the exercises in a real terminal as you go — don't just read them.
  Several exercises deliberately ask you to break something and then fix
  it, because that's how the errors stop being scary.
- Exercises say explicitly whether they expect a **WSL2 Ubuntu terminal**
  (with Docker Desktop's WSL integration enabled) or **PowerShell**
  (mainly for Azure CLI work, where it's the more natural shell on
  Windows). Either shell can run `docker` and `az` once configured, but
  the exercises pick whichever is more idiomatic for the task.
- Modules 10 and 11 use your Azure subscription for real. Every Azure
  exercise ends with cleanup commands — run them. Nothing here is
  expensive if torn down promptly, but Azure Container Instances and App
  Service both bill while resources exist.
- You don't need to download any sample project. Where a module needs a
  runnable app, the exercise has you create a tiny self-contained example
  (a minimal Flask app plus its `Dockerfile`) inline with a text editor
  or a `cat > file <<'EOF' ... EOF` here-doc, so every module stands on
  its own with nothing to clone or copy from elsewhere.
- Docker Desktop's GUI is treated as a first-class tool alongside the
  CLI. Most modules show you where the same information or action lives
  in Docker Desktop (the Containers, Images, and Volumes tabs, a
  container's Logs/Inspect/Terminal/Files sub-tabs, and Settings), so you
  can cross-check what the commands do against what the GUI shows.

## Prerequisites

- Comfortable with a Linux shell: navigating, permissions (`chmod`,
  `chown`), processes (`ps`, `kill`, signals), and basic bash scripting.
  If any of that is shaky, go back to `../01-linux/README.md` first.
- Windows 11 with Docker Desktop installed, WSL2 backend enabled (module
  00 walks through this from scratch if you haven't done it yet).
- An active Azure subscription (needed from module 10 onward).

## Modules

| # | Module | What it covers | Rough time |
|---|--------|-----------------|------------|
| 00 | [Setup: Docker Desktop + WSL2](00-setup-docker-desktop-wsl2/README.md) | Installing Docker Desktop, enabling WSL2 integration, verifying the install | 30-45 min |
| 01 | [Containers vs VMs: concepts](01-containers-vs-vms-concepts/README.md) | What a container actually is (namespaces, cgroups), how it differs from a VM | 30-45 min |
| 02 | [Images and containers](02-images-and-containers/README.md) | Image layers, the container lifecycle, `docker run`/`ps`/`logs`/`exec` | 45-60 min |
| 03 | [Dockerfile deep dive](03-dockerfile-deep-dive/README.md) | Every major Dockerfile instruction, build context, caching, `.dockerignore` | 60-90 min |
| 04 | [Volumes and bind mounts](04-volumes-and-bind-mounts/README.md) | Persisting and sharing data, named volumes vs bind mounts, permissions | 45-60 min |
| 05 | [Docker networking](05-docker-networking/README.md) | Bridge networks, port publishing, container-to-container DNS | 45-60 min |
| 06 | [Docker Compose](06-docker-compose/README.md) | Multi-container apps as code, `compose.yaml`, service dependencies | 60-90 min |
| 07 | [Multi-stage builds and optimization](07-multi-stage-builds-and-optimization/README.md) | Smaller, faster, more secure images | 45-60 min |
| 08 | [Container registries: Docker Hub and ACR](08-container-registries-dockerhub-and-acr/README.md) | Tagging, pushing, pulling, private registries, Azure Container Registry | 45-60 min |
| 09 | [Security best practices](09-security-best-practices/README.md) | Non-root users, minimal images, secrets, scanning | 45-60 min |
| 10 | [Deploy to Azure Container Instances](10-deploy-to-azure-container-instances/README.md) | Real deployment: ACR + ACI, logs, cleanup | 60-90 min |
| 11 | [Deploy to Azure App Service](11-deploy-to-azure-app-service/README.md) | Real deployment: containerized App Service, config, logs, cleanup | 60-90 min |
| 12 | [Capstone project](12-capstone-project/README.md) | Build, compose, push, and deploy a multi-service app end to end | 2-4 hrs |

Total: roughly 12-18 hours of focused work, depending on how much you
repeat exercises (you should repeat them).

Start here → [00-setup-docker-desktop-wsl2/README.md](00-setup-docker-desktop-wsl2/README.md)

[Back to main curriculum](../README.md)
