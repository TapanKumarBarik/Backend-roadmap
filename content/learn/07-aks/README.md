# Track 7: Azure Kubernetes Service (AKS)

This is the capstone track of the whole curriculum. You've done Linux,
Docker (including pushing to ACR and deploying to ACI/App Service), and
Kubernetes on a local cluster (kind/minikube) — then took a deliberate
detour through general networking, Azure networking, and Azure Container
Apps. This track takes everything you know about `kubectl`, Deployments,
Services, ConfigMaps/Secrets, Ingress, HPA, and Helm, and points it at a
**real, managed, billable Kubernetes cluster in Azure** — the hand-operated
alternative to the Container Apps platform that was quietly managing all of
this for you last track. Where Container Apps abstracted away the cluster,
the node pools, and the Environment's networking, AKS hands all of that back
to you — which is exactly the trade-off the previous track's capstone left
you asking about.

> **Cost warning:** every module that creates an AKS cluster should be
> cleaned up with `az group delete` when you're done for the day. An idle
> AKS cluster still bills for its worker node VMs (and their disks, and any
> load balancers you created) even if you aren't running any workloads on
> it. Nothing here is prohibitively expensive if you clean up promptly, but
> leaving a cluster running over a weekend by accident is a real way to
> get a real bill. When in doubt: `az group delete --name <rg> --yes --no-wait`.

## How this track works

- Go in order — module 01 assumes module 00 is done, module 03 assumes you
  can already deploy a Pod from module 02, and so on.
- Every module (except this index and the capstone) follows the same
  shape: **Why this matters → Concepts → Command reference → Hands-on
  exercises → Common mistakes & troubleshooting → Checkpoint quiz → Next**.
- All exercises use real `az` and `kubectl` commands against your actual
  Azure subscription. There is no local-only AKS simulator — this is the
  point of the track.
- Each module's exercises end with an explicit cleanup step, or explicitly
  tell you the cleanup is deferred to a later exercise in the same module.
  Don't skip these.
- Module 09 is a capstone project with no quiz — it asks you to combine
  everything from modules 00-08 (and the Helm chart from the Kubernetes
  track capstone) into one real, working, monitored, autoscaling,
  CI/CD-deployed application on AKS.

## Modules

| # | Module | What it covers | Rough time |
|---|--------|-----------------|------------|
| 00 | [azure-cli-and-prerequisites](00-azure-cli-and-prerequisites/README.md) | Installing/updating the Azure CLI, `az login`, subscriptions, `kubectl` install, resource groups, AKS pricing model | 45-60 min |
| 01 | [creating-an-aks-cluster](01-creating-an-aks-cluster/README.md) | `az aks create`, node pools, cluster tiers, `get-credentials`, verifying nodes, cleanup | 60-90 min |
| 02 | [deploying-workloads-to-aks](02-deploying-workloads-to-aks/README.md) | Deployments, Services, ConfigMaps/Secrets on a real cluster; what's different from kind/minikube | 60-90 min |
| 03 | [acr-integration-with-aks](03-acr-integration-with-aks/README.md) | `az aks update --attach-acr`, managed identity image pulls, image pull secrets as a fallback | 45-60 min |
| 04 | [aks-networking-loadbalancer-and-ingress](04-aks-networking-loadbalancer-and-ingress/README.md) | LoadBalancer Services, public IPs, ingress-nginx / App Routing add-on, DNS | 60-90 min |
| 05 | [scaling-aks-cluster-autoscaler-and-hpa](05-scaling-aks-cluster-autoscaler-and-hpa/README.md) | Cluster Autoscaler, node pools scaling, combining with HPA from the Kubernetes track | 60-90 min |
| 06 | [monitoring-aks-azure-monitor-container-insights](06-monitoring-aks-azure-monitor-container-insights/README.md) | Container Insights, Log Analytics, Azure Monitor metrics and alerts | 60 min |
| 07 | [security-aks-aad-rbac-and-keyvault](07-security-aks-aad-rbac-and-keyvault/README.md) | Azure AD-integrated Kubernetes RBAC, managed identities, Key Vault secrets via CSI driver | 75-90 min |
| 08 | [cicd-github-actions-to-aks](08-cicd-github-actions-to-aks/README.md) | GitHub Actions building images, pushing to ACR, rolling out to AKS | 60-90 min |
| 09 | [capstone-project](09-capstone-project/README.md) | End-to-end project: cluster, ACR, Helm deploy, Ingress, monitoring, HPA under load, CI/CD | 3-6 hours |

## Prerequisites

- An active Azure subscription (already confirmed for this curriculum).
- Everything from [03-kubernetes](../03-kubernetes/README.md): comfortable
  with `kubectl`, Deployments, Services, ConfigMaps/Secrets, Ingress, HPA,
  and Helm on a local cluster.
- Everything from [02-docker](../02-docker/README.md): building images,
  pushing to Azure Container Registry, and basic ACI/App Service deploys.

[Back to main curriculum](../README.md)
