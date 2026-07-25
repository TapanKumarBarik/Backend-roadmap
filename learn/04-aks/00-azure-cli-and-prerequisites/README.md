# Azure CLI and Prerequisites

## Why this matters

Every module after this one assumes `az` is installed, authenticated, and
pointed at the right subscription, and that `kubectl` is available in your
shell. Get this plumbing right once, here, so you're not debugging
authentication instead of Kubernetes later. This module also sets your
mental model for AKS pricing before you create anything billable.

## Concepts

**Azure CLI (`az`)** is the command-line tool you use to create and manage
Azure resources — resource groups, AKS clusters, ACR registries, and so
on. You already used it in the Docker track to push images to ACR and
deploy to ACI/App Service. In this track it's how you provision the
cluster itself; `kubectl` takes over once the cluster exists.

**Resource groups** are Azure's container for related resources — a
logical folder, not a network boundary. Every AKS cluster lives in a
resource group, along with the VMs, disks, and load balancers it creates
behind the scenes (those actually land in a second, AKS-managed resource
group named `MC_<resourcegroup>_<clustername>_<region>` — more on that in
module 01). Deleting a resource group deletes everything inside it, which
is why `az group delete` is your main cleanup tool throughout this track.

**Subscriptions** are the billing/permission boundary above resource
groups. If your Azure account has access to more than one subscription,
you must explicitly select which one `az` operates against, or you can
accidentally create (and get billed for) resources in the wrong place.

**AKS pricing model, in plain terms:**
- The Kubernetes **control plane** (API server, scheduler, etcd, etc.) is
  free on the AKS **Free tier**. Azure runs and manages it for you; you
  don't pay for it directly.
- You **do** pay for the **worker node VMs** in your node pools — these
  are ordinary Azure VMs billed at normal VM rates, for as long as they
  exist, whether or not you're running workloads on them.
- You pay for the **managed disks** attached to those VMs (OS disks, and
  any PersistentVolume disks you provision).
- You pay for any **Load Balancer** and **public IP address** resources
  AKS creates for you (e.g. when you expose a Service of type
  `LoadBalancer`, or use certain Ingress setups).
- You pay for **egress bandwidth** out of Azure, and for anything else you
  attach — Log Analytics workspaces (module 06), Key Vault (module 07),
  etc., each billed under its own service.
- There is also a paid **Standard tier** for the control plane, aimed at
  production workloads that need an SLA; you won't need it for this
  learning track, but you'll see it mentioned in module 01.

The upshot: **the moment you have running node VMs, you're spending
money**, regardless of whether you've deployed anything to them. That's
why every module that creates a cluster ends with cleanup instructions —
follow them.

**What AKS manages for you vs. what you still own**, compared to local
kind/minikube: locally, kind/minikube gave you a disposable, single-host
fake cluster with no real cloud resources behind it. AKS gives you a real
multi-node cluster where Azure manages the control plane's availability
and upgrades, but **you** still own: node pool sizing and scaling, node OS
patching cadence (unless you enable auto-upgrade), what runs on the
nodes, networking configuration, RBAC, and cost. You'll see this
"managed vs. your responsibility" split called out again in every module.

## Command reference

| Command | What it does | Example |
|---|---|---|
| `az --version` | Prints installed Azure CLI and extension versions | `az --version` |
| `az upgrade` | Upgrades the Azure CLI to the latest version | `az upgrade` |
| `az login` | Opens a browser to authenticate you and caches a token locally | `az login` |
| `az account list` | Lists all subscriptions your account can see | `az account list --output table` |
| `az account show` | Shows the currently active subscription | `az account show --output table` |
| `az account set` | Switches the active subscription for all subsequent `az` commands | `az account set --subscription "My Subscription"` |
| `az aks install-cli` | Downloads and installs `kubectl` (and `kubelogin` if needed) via the CLI | `az aks install-cli` |
| `kubectl version --client` | Confirms `kubectl` is installed and shows its version | `kubectl version --client` |
| `az group create` | Creates a resource group in a given Azure region | `az group create --name rg-aks-learn --location eastus` |
| `az group list` | Lists resource groups in the current subscription | `az group list --output table` |
| `az group delete` | Deletes a resource group and everything inside it | `az group delete --name rg-aks-learn --yes --no-wait` |
| `az provider register` | Registers an Azure resource provider (namespace) for your subscription, required before first use of some services | `az provider register --namespace Microsoft.ContainerService` |
| `az provider show` | Checks registration state of a provider | `az provider show --namespace Microsoft.ContainerService --query registrationState` |

## Hands-on exercises

1. **Check/install the Azure CLI.** Run `az --version`. If it's missing or
   old, install/upgrade it (on Windows: `winget install Microsoft.AzureCLI`,
   or inside WSL2/Linux: follow the official install script for your
   distro). Verify with `az --version` again — confirm you're on a
   reasonably current version (2.60+ is a safe baseline; anything from the
   last year or so is fine).

2. **Log in.** Run `az login`. A browser window opens — sign in with the
   account tied to your Azure subscription. Verify: the terminal prints a
   JSON list of subscriptions you have access to.

3. **Confirm and select your subscription.** Run
   `az account list --output table` and note the `SubscriptionId` and
   `Name` of the one you want to use. If you have more than one and the
   wrong one is marked `IsDefault True`, run
   `az account set --subscription "<name-or-id>"`. Verify with
   `az account show --output table` — confirm the `name` field matches
   what you intended.

4. **Install `kubectl`.** Run `az aks install-cli`. This installs
   `kubectl` (and `kubelogin`, used later for Azure AD auth) to a
   location it prints out, and may ask you to add that location to your
   `PATH`. Verify with `kubectl version --client` — you should see a
   client version printed with no connection error (you have no cluster
   yet, so a "couldn't get server version" message is expected and fine).

5. **Register the AKS resource provider.** Run
   `az provider register --namespace Microsoft.ContainerService`. This is
   often already registered on subscriptions that have used AKS before,
   but new subscriptions need it explicitly. Check status with
   `az provider show --namespace Microsoft.ContainerService --query registrationState -o tsv`
   — wait until it prints `Registered` (can take a minute or two; poll
   with `az provider show ...` again if it says `Registering`).

6. **Create your first resource group.** Pick a region close to you (e.g.
   `eastus`, `westeurope`) and run:
   `az group create --name rg-aks-learn --location eastus`.
   Verify: the command prints JSON with `"provisioningState": "Succeeded"`.
   Also check `az group list --output table` — confirm `rg-aks-learn`
   appears with the region you chose.

7. **Diagnose and fix: wrong subscription.** Deliberately run
   `az account set --subscription "<some-subscription-id-that-does-not-exist>"`
   and observe the error. Then simulate a subtler version of the same
   mistake: if you have access to more than one subscription, switch to
   a different valid one and run `az group list --output table` — notice
   the resource group you just created is *not* listed, because resource
   groups are scoped to a subscription. Practice diagnosing "where did my
   resource go?" by running `az account show` first whenever a resource
   you expect seems missing. Switch back to the correct subscription
   before continuing (`az account set --subscription "<correct-name-or-id>"`).

8. **Clean up (or defer).** The resource group `rg-aks-learn` created in
   exercise 6 contains no billable resources yet (an empty resource group
   costs nothing), so you may leave it in place — you'll use it in module
   01 to create your first cluster. If you'd rather start clean next
   module, delete it now with
   `az group delete --name rg-aks-learn --yes --no-wait` and recreate it
   when module 01 asks you to.

## Common mistakes & troubleshooting

- **Running commands against the wrong subscription.** If you have a
  personal subscription and a work/trial subscription, it's easy to
  create resources in the wrong one. Always sanity-check with
  `az account show` before creating anything, especially early in a
  session.
- **`az aks install-cli` installs `kubectl` somewhere not on your `PATH`.**
  Read its output carefully — it tells you the install path and whether
  you need to update your shell profile. Restart your terminal after
  editing `PATH`.
- **Forgetting `--yes --no-wait` shape on `az group delete`.** Without
  `--yes` it prompts for confirmation (fine interactively, but breaks
  scripts); without `--no-wait` the command blocks in your terminal until
  deletion finishes (can take several minutes). Both are optional but
  used throughout this track for convenience.
- **Provider not registered.** If a later `az aks create` fails with an
  error mentioning `Microsoft.ContainerService` not being registered,
  come back to exercise 5.
- **Cost pitfall: forgetting resource groups don't self-delete.** An
  empty resource group is free, but a resource group is easy to forget
  about once it has a cluster in it. Get in the habit of listing your
  resource groups (`az group list --output table`) at the start and end
  of every study session so nothing billable is left running unnoticed.

## Checkpoint quiz

1. What's the difference between an Azure subscription and a resource
   group?
2. Why is `az account show` a useful command to run before creating any
   resource?
3. On the AKS Free tier, what part of the cluster is free, and what do
   you still pay for?
4. What does `az group delete --name X --yes --no-wait` do, and why might
   you want `--no-wait`?
5. Why does an idle AKS cluster still cost money even with zero pods
   deployed to it?
6. What command installs `kubectl` via the Azure CLI, and what related
   tool does it also install for later Azure AD authentication?

<details>
<summary>Show answers</summary>

1. A subscription is the billing and access boundary — everything is
   billed to and permissioned under a subscription. A resource group is a
   logical container *within* a subscription that groups related
   resources together for management and bulk deletion; it has no
   billing identity of its own.
2. Because `az` commands operate against whatever subscription is
   currently "active." If you have access to multiple subscriptions, the
   active one might not be the one you intend to use, and resources
   would be created in (and billed to) the wrong place.
3. The managed control plane (API server, etcd, scheduler) is free on the
   Free tier. You still pay for the worker node VMs, their disks, any
   load balancers/public IPs, and egress bandwidth.
4. It deletes the resource group `X` and everything inside it without an
   interactive confirmation prompt (`--yes`) and without blocking the
   terminal until deletion completes (`--no-wait`, returns immediately
   while deletion happens in the background).
5. Because the worker nodes are ordinary Azure VMs billed at normal
   hourly rates for as long as they exist — billing is tied to the VM
   running, not to whether it's doing useful work.
6. `az aks install-cli`; it also installs `kubelogin`, used for Azure
   AD-integrated cluster authentication (covered in module 07).

</details>

## Next

[01-creating-an-aks-cluster](../01-creating-an-aks-cluster/README.md) —
create your first real AKS cluster and wire up `kubectl` to talk to it.
