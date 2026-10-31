# Container Apps Environment Deep Dive

## Why this matters

Every container app you ever deploy lives inside an **Environment**, and most
of the decisions that affect cost, networking, and blast radius are made at the
Environment level, not the app level. Get the Environment wrong — wrong plan,
wrong region, wrong network, a Log Analytics workspace you forgot about — and
every app inside inherits the problem. This module dissects the Environment
before you put anything in it.

## Concepts

### The Environment as a boundary

A Container Apps **Environment** (resource type `managedEnvironments`) is the
secure boundary that holds one or more container apps. Apps in the same
Environment share three things: a **virtual network**, a **Log Analytics
workspace** (for logs), and the **Envoy ingress layer**. They can reach each
other by name over that internal network and, with Dapr enabled, invoke each
other through the Dapr sidecar. This is very close to a Kubernetes
**namespace** that also happens to bundle a shared ingress controller and a
shared logging pipeline — except you don't manage the cluster underneath it.
Apps in *different* Environments are isolated from each other; they can't use
internal service discovery across the boundary.

### The shared Log Analytics workspace

An Environment sends its container **system logs** and **console (stdout/stderr)
logs** to a logging destination — most commonly an Azure **Log Analytics
workspace**. You either let `az containerapp env create` auto-create one, or
pass an existing workspace's customer ID and shared key. This is a standard
Azure Log Analytics workspace — the same logging destination other Azure
services send to (you'll attach one to an AKS cluster in track 07 the same
way). It matters here for one reason above all:
**Log Analytics bills per GiB ingested and per GiB retained.** A chatty app
at high scale can push meaningful log volume. The Environment is free-ish to
exist; the workspace behind it is the line item you watch. (Module 07 covers
querying those logs; here you just need to know the wiring and the cost model.)

### Consumption vs. workload-profile (Dedicated) plans

An Environment runs one of two plan types. The **Consumption** plan is fully
serverless: apps scale to zero, and you pay only for the resources replicas
actually consume (per vCPU-second and GiB-second) plus per-request charges —
an idle Consumption environment is nearly free. The **workload-profiles**
environment adds **Dedicated** profiles: pools of reserved compute (including
larger CPU/memory sizes and GPU options) that you can pin apps to. Dedicated
profiles **bill for the reserved instances whether or not anything is
running** — you'll meet this same idle-billing shape again with AKS node pools
in track 07: reserved compute you pay for whether or not it's busy. A
workload-profiles environment can
still contain a Consumption profile, so you can mix. For learning and for
bursty workloads, Consumption is the default and the cheap choice.

### Where scaling and billing attach

This is the key distinction: **the Environment is the boundary and the shared
infrastructure, but scaling is per-app.** Each container app has its own scale
rules and its own min/max replica counts (module 03). The Environment doesn't
"scale"; it hosts apps that each scale independently. Billing likewise splits:
Consumption compute is billed per-app-replica actual usage; a workload-profile's
reserved capacity is billed at the Environment/profile level regardless of app
usage; and the Log Analytics workspace is billed by log volume across all apps
in the Environment. So "is my Environment expensive?" decomposes into: which
plan, how much log volume, and how much your apps actually run.

### Internal vs. external Environments (networking preview)

An Environment is created against a virtual network — either one Azure
generates for you, or one you supply (custom VNet integration, module 04). A
key Environment-level networking choice is whether the Environment's ingress
is reachable from the public internet or only from within the VNet. With an
**external** load-balancer configuration the Environment gets a public static
IP; with an **internal** one it gets only a private IP inside your VNet, so
apps with "external" ingress are still only reachable inside the network. This
is set at Environment creation and is hard to change later, so it's a design
decision, not a runtime toggle. Module 04 goes deep; here, just know it's an
Environment property.

## Command reference

| Command | What it does | Example |
|---------|--------------|---------|
| `az containerapp env create` | Create an Environment | `az containerapp env create --name env-learn --resource-group rg-aca-m01 --location eastus` |
| `az containerapp env show` | Show an Environment's config | `az containerapp env show --name env-learn --resource-group rg-aca-m01 -o jsonc` |
| `az containerapp env list` | List Environments | `az containerapp env list --resource-group rg-aca-m01 -o table` |
| `az containerapp env delete` | Delete an Environment | `az containerapp env delete --name env-learn --resource-group rg-aca-m01 --yes` |
| `az monitor log-analytics workspace create` | Create a Log Analytics workspace | `az monitor log-analytics workspace create --resource-group rg-aca-m01 --workspace-name law-learn` |
| `az monitor log-analytics workspace get-shared-keys` | Get a workspace's shared key | `az monitor log-analytics workspace get-shared-keys --resource-group rg-aca-m01 --workspace-name law-learn --query primarySharedKey -o tsv` |
| `az containerapp env workload-profile list-supported` | List workload profile types in a region | `az containerapp env workload-profile list-supported --location eastus -o table` |

Flag-by-flag breakdowns:

`az containerapp env create --name env-learn --resource-group rg-aca-m01 --location eastus`
- `--name` — the Environment name (unique within the resource group).
- `--resource-group` — where it lives.
- `--location` — region; must support Container Apps. If you omit `--logs-workspace-id`/`--logs-workspace-key`, the CLI auto-creates a Log Analytics workspace for you (which becomes a billable resource).

`az containerapp env create --name env-law --resource-group rg-aca-m01 --location eastus --logs-workspace-id <customerId> --logs-workspace-key <sharedKey>`
- `--logs-workspace-id` — the **customer ID** (GUID) of an existing Log Analytics workspace to send logs to.
- `--logs-workspace-key` — that workspace's shared key. Supplying both means the Environment reuses your workspace instead of auto-creating one — useful for controlling cost and consolidating logs.

`az monitor log-analytics workspace get-shared-keys --resource-group rg-aca-m01 --workspace-name law-learn --query primarySharedKey -o tsv`
- `--workspace-name` — the workspace to read keys from.
- `--query primarySharedKey` — pull just the primary key.
- `-o tsv` — raw text so you can pipe it into the env-create command.

`az containerapp env create --name env-wp --resource-group rg-aca-m01 --location eastus --enable-workload-profiles`
- `--enable-workload-profiles` — create a workload-profiles environment (supports Dedicated profiles) instead of a pure Consumption-only environment. Remember Dedicated profiles reserve billable compute.

## Hands-on exercises

1. **Create a resource group for this module.**
   ```powershell
   az group create --name rg-aca-m01 --location eastus
   ```

2. **Create a Consumption Environment (auto workspace).**
   ```powershell
   az containerapp env create `
     --name env-m01 --resource-group rg-aca-m01 --location eastus
   ```
   This takes a few minutes. When it returns, note that a Log Analytics
   workspace was created for you (you'll find it in the resource group).

3. **Inspect the Environment.**
   ```powershell
   az containerapp env show --name env-m01 --resource-group rg-aca-m01 -o jsonc
   ```
   Verify: `properties.provisioningState` is `Succeeded`, and look at
   `properties.appLogsConfiguration` (the logging wiring) and
   `properties.vnetConfiguration` (empty/default here — Azure-managed network).

4. **Find the auto-created workspace and see the cost surface.**
   ```powershell
   az monitor log-analytics workspace list --resource-group rg-aca-m01 -o table
   ```
   Confirm a workspace exists. This is the billable line item behind your
   Environment. Note its name.

5. **Create your own workspace and a second Environment that reuses it.**
   ```powershell
   az monitor log-analytics workspace create `
     --resource-group rg-aca-m01 --workspace-name law-m01
   $wsId  = az monitor log-analytics workspace show `
     --resource-group rg-aca-m01 --workspace-name law-m01 --query customerId -o tsv
   $wsKey = az monitor log-analytics workspace get-shared-keys `
     --resource-group rg-aca-m01 --workspace-name law-m01 --query primarySharedKey -o tsv
   az containerapp env create `
     --name env-m01-law --resource-group rg-aca-m01 --location eastus `
     --logs-workspace-id $wsId --logs-workspace-key $wsKey
   ```
   Verify with `az containerapp env show --name env-m01-law --resource-group rg-aca-m01 --query properties.appLogsConfiguration -o jsonc` that it points at *your* workspace's customer ID.

6. **List which workload profiles your region supports.**
   ```powershell
   az containerapp env workload-profile list-supported --location eastus -o table
   ```
   Read the output: `Consumption` plus various Dedicated sizes (D-series,
   E-series, possibly GPU). This is what you *could* reserve — and pay for
   even when idle.

7. **Create a workload-profiles Environment (then note the cost model).**
   ```powershell
   az containerapp env create `
     --name env-m01-wp --resource-group rg-aca-m01 --location eastus `
     --enable-workload-profiles
   ```
   A brand-new workload-profiles environment starts with only a Consumption
   profile, so it's still cheap until you add a Dedicated profile. Confirm
   with `az containerapp env show --name env-m01-wp --resource-group rg-aca-m01 --query properties.workloadProfiles -o jsonc`.

8. **Diagnose and fix: Environment stuck / failed to create.** Try to create
   an Environment in a region that doesn't support ACA:
   ```powershell
   az containerapp env create `
     --name env-bad --resource-group rg-aca-m01 --location brazilsoutheast
   ```
   (Use any region your exercise-6-style check shows as unsupported.) Observe
   the failure. **Fix it** by recreating in a supported region
   (`--location eastus`). Lesson: Environment region is fixed at creation —
   there's no "move region"; you recreate.

9. **Compare boundaries.** You now have multiple Environments in one resource
   group. Confirm they're isolated: `az containerapp env list --resource-group rg-aca-m01 -o table`.
   In your notes, write one sentence explaining why an app in `env-m01`
   cannot use internal name-based discovery to reach an app in `env-m01-wp`.

10. **Cleanup.** Environments and their Log Analytics workspaces are billable
    (the workspace especially). Delete everything:
    ```powershell
    az group delete --name rg-aca-m01 --yes --no-wait
    ```
    Deleting the resource group removes both Environments and both workspaces.

## Independent challenge

Design and build a single Environment that (a) uses a Log Analytics workspace
**you** created and named (not an auto-generated one), so you control its
retention/cost, and (b) is created in a region you first verified supports
Container Apps using the technique from **module 00** (the `locations` query).
Then produce evidence that the Environment's logging is wired to *your*
workspace by showing the customer ID matches. Combining module 00 (provider/
region verification) with this module's workspace-reuse pattern. Delete the
resource group when done — remember the workspace bills for retained data even
after the Environment is gone if it outlives the group.

<details><summary>Stuck? One hint</summary>

The link between them is the workspace's **customer ID** (a GUID). Get it from
`az monitor log-analytics workspace show ... --query customerId -o tsv`, feed
it to `--logs-workspace-id`, and later read it back from the Environment's
`properties.appLogsConfiguration.logAnalyticsConfiguration.customerId` to prove
they match.

</details>

## Common mistakes & troubleshooting

- **Forgetting the auto-created workspace.** If you don't pass a workspace,
  `env create` makes one silently. When you later delete "just the
  Environment" the workspace can linger and keep billing for retained logs.
  Deleting the whole resource group is the safe move.
- **Cost pitfall: workload profiles left with a Dedicated profile.** A
  workload-profiles environment is cheap only while it has just the
  Consumption profile. The moment you add a Dedicated profile you're paying
  for reserved instances 24/7 — the same idle-node billing you'll see with AKS
  node pools in track 07, one layer down the stack.
- **Expecting to change region or network later.** Region and VNet integration
  are set at creation and effectively immutable. Plan them; don't expect to
  edit them.
- **Cross-Environment service discovery.** Internal name-based calls and Dapr
  invocation only work *within* one Environment. Two apps that need to talk
  internally must share an Environment.
- **Log volume surprises.** High-scale apps writing verbose stdout can push
  real Log Analytics ingestion cost. Keep app logging sane and watch the
  workspace's usage in Cost Management.

## Checkpoint quiz

Write down your answer to each question before expanding it — checking without
attempting first is the single easiest way to fool yourself into thinking
you've learned this.

1. Name the three things all apps in one Environment share.
2. Which is billable independently of whether your apps are running: the
   Consumption compute, the Dedicated workload profile, or the Log Analytics
   workspace? (More than one may apply.)
3. Does an Environment "scale"? If not, what does?
4. What Kubernetes object is an Environment most like, and what does it bundle
   on top of that object?
5. Why might you pass `--logs-workspace-id`/`--logs-workspace-key` instead of
   letting `env create` auto-create a workspace?
6. Two apps in different Environments — can they reach each other by internal
   name or Dapr invocation? Why or why not?
7. You need a GPU-backed profile. Which Environment plan type do you need, and
   what's the cost consequence?

<details><summary>Show answers</summary>

1. A virtual network, a Log Analytics workspace (logging), and the Envoy
   ingress layer.
2. The **Dedicated workload profile** (reserved compute bills regardless) and
   the **Log Analytics workspace** (bills for ingested/retained data
   regardless of whether apps are actively serving). Consumption compute bills
   only while replicas run.
3. No. Individual container apps scale (each with its own KEDA scale rules and
   min/max replicas); the Environment is just the host boundary.
4. A Kubernetes **namespace**, plus a bundled shared ingress controller
   (Envoy) and shared logging pipeline — without you operating the cluster.
5. To reuse/consolidate logs into a workspace you control (retention, cost,
   shared with other resources) rather than accumulating auto-created
   workspaces.
6. No. Internal service discovery and Dapr invocation are scoped to a single
   Environment; different Environments are isolated boundaries.
7. A **workload-profiles** environment with a Dedicated (GPU) profile. It
   reserves billable compute continuously, whether or not the app is serving
   requests.

</details>

## Next

[02-deploying-your-first-container-app](../02-deploying-your-first-container-app/README.md)
— put an actual app in an Environment: create it from an image, expose ingress,
update it, and inspect what got deployed.
