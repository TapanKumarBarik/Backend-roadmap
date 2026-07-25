# Track 6: Azure Container Apps

This is track 6 of 7. It assumes you already know Docker deeply and
Kubernetes reasonably well on a local cluster (Deployments, Services,
Ingress, HPA, Helm) from tracks 02-03, and that you've been through, or are
working through,
[track 4: networking-fundamentals](../04-networking-fundamentals/README.md)
and
[track 5: azure-networking](../05-azure-networking/README.md).
Module 04 in particular leans directly on the VNet, subnet, NSG, DNS, and
load-balancer concepts from track 5 — if that material is fuzzy, do its
networking modules first. This track does **not** assume AKS — that's
track 7, right after this one, and part of the point of learning Container
Apps first is seeing what a managed cluster abstracts away before you
learn to operate one by hand.

Azure Container Apps (ACA) is a serverless container platform built on a
managed Kubernetes foundation (Kubernetes + KEDA + Dapr + Envoy) that you do
**not** operate directly. This track teaches it by relating every piece back
to the raw Kubernetes objects you already know from track 03: an Environment
is like a namespace plus a shared Envoy ingress layer, scaling is KEDA (the
same KEDA you could install on any Kubernetes cluster yourself), and
revisions behave like managed Deployment rollouts. You get most of what a
hand-run cluster gives you, without running the cluster — at the cost of
some low-level control. Track 7 (AKS) is where you'll see what running that
cluster yourself actually involves.

Everything here runs against a **real Azure subscription** and creates real
resources.

> **Cost warning.** A Container Apps Environment on the **Consumption** plan
> scales its apps to zero and costs almost nothing when idle — you pay per
> request and per vCPU-second/GiB-second only while replicas run. But
> **Dedicated / workload-profile plans bill for reserved compute whether or
> not anything is running**, and the **Log Analytics workspace** that an
> Environment sends logs to bills per GiB ingested and retained. An idle
> Consumption environment is cheap; a forgotten workload-profile environment
> or a chatty Log Analytics workspace is not. Every module that creates
> billable resources ends with an explicit cleanup step (`az group delete`).
> Do not skip it.

## Modules

| # | Module | What you'll learn | Rough time |
|---|--------|-------------------|-----------|
| 00 | [Container Apps concepts & prerequisites](00-container-apps-concepts-and-prerequisites/README.md) | What ACA is, how it compares to AKS and ACI, and getting the CLI extension, providers, and login ready | 1 hr |
| 01 | [Container Apps Environment deep dive](01-container-apps-environment-deep-dive/README.md) | The Environment as the boundary: shared Log Analytics, shared VNet, and how billing and scaling attach to it | 1.5 hr |
| 02 | [Deploying your first container app](02-deploying-your-first-container-app/README.md) | Create, update, inspect, and roll back a container app; ingress basics and container config | 1.5 hr |
| 03 | [Scaling with KEDA](03-scaling-with-keda/README.md) | Scale-to-zero, HTTP and custom KEDA scale rules, min/max replicas, and diagnosing rules that never fire | 2 hr |
| 04 | [Networking, ingress & VNet integration](04-networking-ingress-and-vnet-integration/README.md) | Internal vs external ingress, custom VNet/subnet integration, private environments, and DNS | 2 hr |
| 05 | [Revisions, traffic splitting & Dapr](05-revisions-traffic-splitting-and-dapr/README.md) | Revision modes, blue/green and canary traffic splits, and Dapr service invocation between apps | 2 hr |
| 06 | [Secrets, managed identity & config](06-secrets-managed-identity-and-config/README.md) | Secrets, Key Vault references, system/user-assigned managed identity, and role assignments | 1.5 hr |
| 07 | [Monitoring & Log Analytics](07-monitoring-and-log-analytics/README.md) | Console vs system logs, log streaming, KQL queries, metrics, and alerts | 1.5 hr |
| 08 | [Capstone project](08-capstone-project/README.md) | Build a VNet-integrated, multi-revision, Dapr-connected, autoscaling app end to end, then tear it down | 3 hr |

## How to work through this

Go in order — each module builds strictly on the previous ones and on the
Docker/Kubernetes knowledge you already have. Attempt every quiz question in
writing before revealing the answer, do the independent challenges without
peeking at the solved exercises, and take the two cumulative reviews (in
modules 03 and 07) closed-book. Keep the Azure Portal's **Cost Management**
blade open as you go; a forgotten Log Analytics workspace or workload-profile
environment is the easiest way to run up a surprise bill here.

Finishing the capstone in module 08 completes the whole curriculum.

[Back to main curriculum](../README.md)

Start here → [00-container-apps-concepts-and-prerequisites/README.md](00-container-apps-concepts-and-prerequisites/README.md)
</content>
</invoke>
