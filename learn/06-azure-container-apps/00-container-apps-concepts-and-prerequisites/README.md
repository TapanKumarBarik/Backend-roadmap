# Container Apps Concepts & Prerequisites

## Why this matters

You already know how to run containers by hand (Docker) and how to orchestrate
them yourself on a Kubernetes cluster (track 03, on a local kind cluster).
Azure Container Apps sits one level higher: it runs your containers on a
Kubernetes/KEDA/Envoy/Dapr foundation that you never see or operate. Before
you deploy anything you need a clear mental model of what ACA takes off your
plate versus what it takes away from your control — and you need the CLI
extension, resource providers, and login that every later module assumes.

## Concepts

### What Azure Container Apps actually is

Azure Container Apps (ACA) is a **serverless container platform**. You give it
a container image and some configuration (CPU/memory, ingress, scale rules,
env vars, secrets) and it runs, scales, and load-balances that container for
you. Under the hood each ACA Environment is backed by a managed Kubernetes
cluster running **KEDA** for event-driven autoscaling, **Envoy** as the
ingress proxy and traffic-splitter, and optionally **Dapr** for
service-to-service calls, state, and pub/sub. You do not have access to the
nodes, the API server, or `kubectl` — Azure operates all of that. Think of it
as "the useful 80% of what you'd build by hand on Kubernetes yourself (as in
track 03), without the cluster."

### How it compares to AKS

You haven't reached the AKS track yet (that's track 07), but the contrast is
worth previewing now because it defines what ACA is. On AKS you'd own a lot:
node pools, upgrades, the control plane's networking, installing
KEDA/Dapr/an ingress controller yourself, writing Deployment and Service and
Ingress and HPA YAML (the same primitives you drove by hand in track 03), and
keeping Helm charts current. ACA removes
all of that — no nodes to patch, no control plane to size, no ingress
controller to install, no HPA to tune (KEDA is built in). The trade-off is
**less low-level control**: you can't set arbitrary pod securityContext, run
DaemonSets, use every possible CNI plugin, install cluster-wide operators, or
reach for raw Kubernetes primitives. If you need that control, AKS is still
the right tool. ACA is for teams that want to ship containers, not operate
Kubernetes.

### How it compares to Azure Container Instances (ACI)

From your Docker track you met **ACI**: the simplest way to run a single
container (or a small container group) in Azure, billed per second, with no
orchestration. ACI has **no built-in autoscaling, no revisions, no
load-balanced ingress, and no rolling updates** — it's essentially "one
container, running, until you stop it." Container Apps is the orchestrated
step up: it adds KEDA autoscaling (including scale-to-zero), revisions with
traffic splitting, Envoy-based HTTPS ingress, and Dapr — while still being
serverless and per-second-ish billed. Rule of thumb: reach for ACI for a
one-off task or sidecar-less job; reach for Container Apps when you want a
service that scales, versions, and receives traffic.

### The resource hierarchy

The core objects you'll work with, from outside in: a **Resource Group**
(standard Azure container for everything), a **Container Apps Environment**
(the secure boundary that holds one or more apps, shares a Log Analytics
workspace and a virtual network — conceptually a Kubernetes namespace plus a
shared Envoy ingress layer, minus you managing the cluster), a **Container
App** (your workload — roughly a Kubernetes Deployment + Service + Ingress +
HPA rolled into one resource), and **Revisions** (immutable versions of an app,
like a specific rollout of a Deployment). Module 01 dissects the Environment;
this module just gets you logged in and ready.

### Prerequisites: extension, providers, login

The `containerapp` commands live in an **Azure CLI extension**, not the core
CLI, so you install it once with `az extension add`. Azure also gates
resource types behind **resource providers** that must be registered on your
subscription — for ACA you need `Microsoft.App` (the Container Apps provider)
and `Microsoft.OperationalInsights` (Log Analytics, since Environments send
logs there). Registration is a one-time, per-subscription operation. And of
course you need to be logged in (`az login`) with the right subscription
selected. The exercises below do exactly this.

## Command reference

| Command | What it does | Example |
|---------|--------------|---------|
| `az login` | Authenticate the CLI to Azure | `az login` |
| `az account set` | Select the active subscription | `az account set --subscription "My Sub"` |
| `az account show` | Show the current subscription/tenant | `az account show --output table` |
| `az extension add` | Install the Container Apps CLI extension | `az extension add --name containerapp --upgrade` |
| `az extension list` | List installed CLI extensions | `az extension list --output table` |
| `az provider register` | Register a resource provider on the subscription | `az provider register --namespace Microsoft.App --wait` |
| `az provider show` | Check a provider's registration state | `az provider show --namespace Microsoft.App --query registrationState -o tsv` |
| `az group create` | Create a resource group | `az group create --name rg-aca-learn --location eastus` |
| `az containerapp --help` | Confirm the extension loaded | `az containerapp --help` |

Flag-by-flag breakdowns for the multi-flag examples:

`az account set --subscription "My Sub"`
- `--subscription` — name or ID of the subscription to make active; all later commands target it.

`az extension add --name containerapp --upgrade`
- `--name containerapp` — the extension that adds `az containerapp ...`.
- `--upgrade` — if it's already installed, update it to the latest version instead of erroring. ACA moves fast; keep it current.

`az provider register --namespace Microsoft.App --wait`
- `--namespace Microsoft.App` — the resource provider being registered (the Container Apps provider).
- `--wait` — block until registration finishes (it can take a couple of minutes) instead of returning immediately.

`az provider show --namespace Microsoft.App --query registrationState -o tsv`
- `--namespace Microsoft.App` — which provider to inspect.
- `--query registrationState` — JMESPath to pull just the state field.
- `-o tsv` — output raw text (`Registered`/`Registering`/`NotRegistered`) with no quotes, good for scripts.

`az group create --name rg-aca-learn --location eastus`
- `--name` — resource group name; you'll delete this at the end to clean up everything.
- `--location` — Azure region. Pick one that supports Container Apps and is close to you; keep it consistent across a module.

## Hands-on exercises

Set a region once and reuse it. These commands are for PowerShell; adjust
variable syntax if you use bash.

1. **Log in and confirm your subscription.**
   ```powershell
   az login
   az account show --output table
   ```
   Verify the `Name` column shows the subscription you intend to spend money
   in. If not, list them with `az account list --output table` and switch
   with `az account set --subscription "<name-or-id>"`.

2. **Install (or upgrade) the Container Apps extension.**
   ```powershell
   az extension add --name containerapp --upgrade
   az extension list --query "[?name=='containerapp'].version" -o tsv
   ```
   Verify a version number prints. Then run `az containerapp --help` and
   confirm you see subcommands like `create`, `update`, `revision`, and
   `ingress`.

3. **Register the required resource providers.**
   ```powershell
   az provider register --namespace Microsoft.App --wait
   az provider register --namespace Microsoft.OperationalInsights --wait
   ```
   Both `--wait` calls return only when registration completes.

4. **Verify provider registration state.**
   ```powershell
   az provider show --namespace Microsoft.App --query registrationState -o tsv
   az provider show --namespace Microsoft.OperationalInsights --query registrationState -o tsv
   ```
   Both must print `Registered`. Anything else means the previous step didn't
   finish — re-run it.

5. **Create a resource group for this module.**
   ```powershell
   az group create --name rg-aca-m00 --location eastus
   ```
   Verify with `az group show --name rg-aca-m00 --query properties.provisioningState -o tsv` — expect `Succeeded`. A resource group itself is free.

6. **List regions that support Container Apps.**
   ```powershell
   az provider show --namespace Microsoft.App `
     --query "resourceTypes[?resourceType=='managedEnvironments'].locations[]" -o table
   ```
   Confirm your chosen region appears. If it doesn't, pick one that does and
   use it consistently for the rest of the track.

7. **Contrast with ACI (reading, not deploying).** Run `az container --help`
   and skim it. Notice there is no `revision`, no `ingress` with traffic
   splitting, and no scale-rule subcommand — that absence is exactly the gap
   Container Apps fills. Write one sentence in your notes describing when
   you'd still choose ACI.

8. **Diagnose and fix: "extension not found."** Simulate the most common
   first-day failure. Remove the extension, then try to use it:
   ```powershell
   az extension remove --name containerapp
   az containerapp list --output table
   ```
   Observe the error (`'containerapp' is misspelled or not recognized`, or a
   prompt to install the extension). **Fix it** by reinstalling:
   `az extension add --name containerapp --upgrade`, then re-run
   `az containerapp list --output table` (an empty result `[]` is success —
   it means the command works, you just have no apps yet).

9. **Cleanup.** This module created only a resource group, which is free, but
   delete it to keep your subscription tidy and to practice the habit:
   ```powershell
   az group delete --name rg-aca-m00 --yes --no-wait
   ```

## Independent challenge

Starting from a machine where you have never run Azure CLI, get fully ready to
deploy Container Apps in a *different* region from the one you used above
(say `westeurope`): authenticate, select the correct subscription, ensure the
`containerapp` extension is present and current, confirm both required
resource providers are `Registered`, verify that `westeurope` supports the
`managedEnvironments` resource type, and create a fresh resource group there.
Produce a single short checklist of the exact commands you ran and the
one-line evidence each gave you that it succeeded. This combines only this
module's material (there is no earlier module yet). Delete the resource group
afterward.

<details><summary>Stuck? One hint</summary>

The verification for "does this region support Container Apps" is the same
`az provider show ... --query "resourceTypes[?resourceType=='managedEnvironments'].locations[]"`
query from exercise 6 — just check whether your target region string appears
in its output before you bother creating the group.

</details>

## Common mistakes & troubleshooting

- **Forgetting the extension.** `az containerapp` commands silently don't
  exist until you `az extension add --name containerapp`. The error looks like
  a typo; it isn't.
- **Skipping provider registration.** If `Microsoft.App` isn't `Registered`,
  environment creation later fails with a provider/authorization error that
  doesn't obviously say "register the provider." Do it once up front.
- **Wrong subscription selected.** `az login` picks a default subscription
  that may not be the one you want billed. Always `az account show` before
  creating resources.
- **Assuming every region works.** Container Apps isn't in every Azure region.
  Verify with the `locations` query rather than guessing, or environment
  creation fails.
- **Cost pitfall (habit-forming).** Nothing here is billable except (later)
  Environments and Log Analytics, but get in the habit *now* of naming each
  module's resource group `rg-aca-mNN` and deleting it at the end. The single
  biggest ACA cost mistake is a leftover Environment plus Log Analytics
  workspace from an early experiment.

## Checkpoint quiz

Write down your answer to each question before expanding it — checking without
attempting first is the single easiest way to fool yourself into thinking
you've learned this.

1. Name the four open-source technologies that back a Container Apps
   Environment, and what each one does for you.
2. Give two capabilities Container Apps has that ACI does not.
3. Give two things AKS lets you do that Container Apps does not.
4. Which two resource providers must be registered before you can create a
   Container Apps Environment, and why the second one?
5. What does `--upgrade` add to `az extension add --name containerapp`, and
   why does it matter for ACA specifically?
6. In the resource hierarchy, what plays the role of a Kubernetes namespace
   plus shared ingress, and what plays the role of a Deployment rollout?
7. You run `az containerapp list` and get "command not recognized." What are
   the two most likely causes, in order?

<details><summary>Show answers</summary>

1. **Kubernetes** (the managed cluster running your containers, which you
   don't operate), **KEDA** (event-driven autoscaling including scale-to-zero),
   **Envoy** (HTTPS ingress, load balancing, traffic splitting between
   revisions), and **Dapr** (optional service invocation, state, pub/sub
   between apps).
2. Any two of: built-in autoscaling (including scale-to-zero), revisions with
   traffic splitting, load-balanced HTTPS ingress, rolling/blue-green updates.
3. Any two of: manage node pools/OS, use `kubectl` and arbitrary Kubernetes
   objects (DaemonSets, custom operators, CRDs), full pod securityContext and
   CNI control, install cluster-wide software, fine-grained control-plane
   networking.
4. `Microsoft.App` (the Container Apps provider itself) and
   `Microsoft.OperationalInsights` — the latter because an Environment is
   wired to a Log Analytics workspace for logging.
5. It upgrades the extension to the latest version if already installed
   instead of erroring/keeping an old one. ACA's CLI and features change
   frequently, so an outdated extension can miss flags and behaviors.
6. The **Environment** is the namespace-plus-shared-ingress boundary; a
   **Revision** is the Deployment-rollout equivalent (an immutable version of
   the app).
7. First: the `containerapp` extension isn't installed (add it). Second (less
   likely): you're not logged in / no subscription selected, or an old CLI —
   check `az account show` and `az version`.

</details>

## Next

[01-container-apps-environment-deep-dive](../01-container-apps-environment-deep-dive/README.md)
— dissect the Environment: the shared Log Analytics workspace, the shared
virtual network, and how billing and scaling attach to it versus to individual
apps.
