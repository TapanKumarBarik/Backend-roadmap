# 03 - Kubernetes

This track teaches Kubernetes on a **local cluster** (kind or minikube,
running on top of the Docker Desktop / WSL2 setup you already have from
track 2). Nothing here talks to Azure or costs a cent — the goal is to
build a solid, correct mental model and real muscle memory with `kubectl`
before you touch a managed cloud cluster.

## How this track works

- It assumes you finished `02-docker`: you're comfortable with images,
  containers, Dockerfiles, `docker-compose`, and pushing images to a
  registry (including Azure Container Registry).
- Every module builds only on concepts from earlier modules in this track
  plus the Docker knowledge you already have — no forward references.
- Each module README has the same shape: why it matters, concepts (with
  concrete analogies), a command reference table, hands-on exercises
  (do these, don't just read them), common mistakes, and a checkpoint
  quiz.
- Go in order. Kubernetes' object model is layered — Deployments sit on
  ReplicaSets sit on Pods, Services depend on label selectors, Ingress
  depends on Services — and each module assumes the ones before it.
- All exercises run against a local kind or minikube cluster in your
  WSL2 Ubuntu terminal. No Azure subscription is needed for this track.

## Modules

| # | Module | What you'll be able to do | Time |
|---|--------|---------------------------|------|
| 00 | [Setup: local cluster (kind/minikube)](00-setup-local-cluster-kind-minikube/README.md) | Install `kubectl` and stand up a local Kubernetes cluster with kind | 45-60 min |
| 01 | [Kubernetes architecture and concepts](01-kubernetes-architecture-and-concepts/README.md) | Explain control plane vs. nodes, the API server, etcd, kubelet, and the declarative/reconciliation model | 45-60 min |
| 02 | [Pods and workloads](02-pods-and-workloads/README.md) | Write and debug Pod manifests, understand containers-in-a-pod, probes, and restarts | 60-90 min |
| 03 | [Deployments and ReplicaSets](03-deployments-and-replicasets/README.md) | Run self-healing, rolling-updateable workloads with Deployments | 60-90 min |
| 04 | [Services and networking](04-services-and-networking/README.md) | Expose Pods with ClusterIP/NodePort/LoadBalancer Services and understand cluster DNS | 60-90 min |
| 05 | [ConfigMaps and Secrets](05-configmaps-and-secrets/README.md) | Externalize configuration and sensitive values from container images | 45-60 min |
| 06 | [Storage: PV and PVC](06-storage-pv-and-pvc/README.md) | Give Pods durable storage with PersistentVolumes, PersistentVolumeClaims, and StorageClasses | 45-60 min |
| 07 | [Helm package manager](07-helm-package-manager/README.md) | Template, package, and release Kubernetes manifests as reusable Helm charts | 60-90 min |
| 08 | [Ingress controllers](08-ingress-controllers/README.md) | Route HTTP(S) traffic to multiple Services through a single entry point | 45-75 min |
| 09 | [Scaling: HPA and VPA](09-scaling-hpa-and-vpa/README.md) | Autoscale workloads horizontally and vertically based on metrics | 45-60 min |
| 10 | [Observability: logging and metrics](10-observability-logging-and-metrics/README.md) | Read logs and metrics cluster-wide and reason about resource usage | 45-60 min |
| 11 | [Security: RBAC and network policies](11-security-rbac-and-network-policies/README.md) | Restrict who can do what (RBAC) and which Pods can talk to which (NetworkPolicy) | 60-90 min |
| 12 | [Capstone project](12-capstone-project/README.md) | Design, deploy, and package a full multi-component app as a Helm chart | 3-5 hrs |

Start here → [00-setup-local-cluster-kind-minikube/README.md](00-setup-local-cluster-kind-minikube/README.md)

Back to main curriculum: [../README.md](../README.md)

---

Once you've completed this track, the next one — **04-aks** — takes the
exact same objects and Helm charts you built here and runs them on a real,
managed Kubernetes cluster in Azure (AKS).
