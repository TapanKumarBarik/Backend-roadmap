# Creating an AKS Cluster

## Why this matters

Everything else in this track happens on top of a real cluster. This
module is where you turn `az` commands into an actual running set of VMs
in Azure, and where the "this costs real money while it's running" reality
of the AKS track starts. Getting the initial `az aks create` right — small
node pool, right tier, right identity — saves you from surprises later.

## Concepts

**Node pools.** In kind/minikube, "nodes" were containers or a single VM
faking a cluster. In AKS, a node pool is a group of real Azure VMs (of a
size/SKU you choose) that all run the same OS image and join the cluster
as Kubernetes nodes. Every AKS cluster has at least one **system node
pool**, which runs critical cluster add-ons (CoreDNS, metrics-server,
etc.) alongside your workloads. You can add additional **user node pools**
later for workload isolation (e.g. a pool with GPU VMs) — not needed yet.

**VM size (SKU).** Each node pool picks one VM size for all its nodes,
e.g. `Standard_B2s` (burstable, cheap, fine for learning) or
`Standard_D2s_v5` (steadier general-purpose). Bigger/faster VMs cost more
per hour whether or not you use the capacity — for this track, pick the
smallest size that can actually run the exercises (2 vCPU / a few GB RAM
class is enough).

**Node count.** How many VMs are in the pool. AKS needs a minimum of one,
but a single-node cluster can't demonstrate rescheduling behavior when a
node fails, so this track uses two nodes for its learning cluster.

**Cluster tiers: Free vs. Standard.** This controls the **control plane's**
SLA and scale limits, not the nodes. **Free tier** has no uptime SLA
(fine for learning — Azure's control plane is still reliable in practice,
just not contractually guaranteed) and is what this track uses throughout.
**Standard tier** adds an availability SLA and is meant for production
clusters; it has an hourly cost for the control plane itself, on top of
node costs. Don't pick Standard for a learning cluster you plan to delete
the same day.

**What AKS manages vs. what you own, concretely, at cluster-creation
time:** Azure manages the control plane's placement, availability, and
patching. You are responsible for: the node pool's VM size and count
(and therefore its cost), the Kubernetes version you run (Azure offers
supported versions; you choose and later upgrade), and the resource group
and network the cluster lives in. Unlike kind/minikube, tearing a cluster
down here is not "stop a local process" — it's deleting real
infrastructure, hence `az group delete`.

**`az aks get-credentials`** downloads a kubeconfig context for the
cluster and merges it into your local `~/.kube/config`, the same file
`kubectl` already reads for your kind/minikube contexts. After this,
`kubectl config get-contexts` shows your AKS cluster alongside any local
ones, and `kubectl config use-context` (or `--context`) switches between
them — a real risk if you have both a local and AKS context and run a
command assuming the wrong one is active.

## Command reference

| Command | What it does | Example |
|---|---|---|
| `az aks create` | Creates a new AKS cluster in a resource group | `az aks create --resource-group rg-aks-learn --name aks-learn --node-count 2 --node-vm-size Standard_B2s --tier free --generate-ssh-keys` |
| `--node-count` | Number of nodes in the initial (system) node pool | `--node-count 2` |
| `--node-vm-size` | VM size/SKU for the node pool | `--node-vm-size Standard_B2s` |
| `--tier` | Control plane tier: `free` or `standard` | `--tier free` |
| `--generate-ssh-keys` | Auto-generates an SSH key pair if you don't already have one, required for node VM provisioning | `--generate-ssh-keys` |
| `--kubernetes-version` | Pins a specific supported Kubernetes version instead of the current default | `--kubernetes-version 1.29.7` |
| `az aks get-credentials` | Downloads/merges kubeconfig for a cluster into `~/.kube/config` | `az aks get-credentials --resource-group rg-aks-learn --name aks-learn` |
| `az aks list` | Lists AKS clusters in the current subscription | `az aks list --output table` |
| `az aks show` | Shows details of one cluster | `az aks show --resource-group rg-aks-learn --name aks-learn --output table` |
| `az aks nodepool list` | Lists node pools in a cluster | `az aks nodepool list --resource-group rg-aks-learn --cluster-name aks-learn --output table` |
| `az aks scale` | Changes the node count of a node pool | `az aks scale --resource-group rg-aks-learn --name aks-learn --node-count 1 --nodepool-name nodepool1` |
| `az aks stop` | Stops the cluster's control plane and nodes (billing pauses for nodes, not for some other resources like disks/IPs) | `az aks stop --resource-group rg-aks-learn --name aks-learn` |
| `az aks start` | Restarts a stopped cluster | `az aks start --resource-group rg-aks-learn --name aks-learn` |
| `kubectl config get-contexts` | Lists kubeconfig contexts (local + AKS) | `kubectl config get-contexts` |
| `kubectl config use-context` | Switches the active kubeconfig context | `kubectl config use-context aks-learn` |
| `kubectl get nodes` | Lists nodes the cluster's API server sees | `kubectl get nodes -o wide` |
| `az group delete` | Deletes the resource group (and cluster) entirely | `az group delete --name rg-aks-learn --yes --no-wait` |

## Hands-on exercises

1. **Recreate the resource group if needed.** If you deleted
   `rg-aks-learn` at the end of module 00, recreate it:
   `az group create --name rg-aks-learn --location eastus`.

2. **Create a small learning cluster.** Run:
   ```
   az aks create \
     --resource-group rg-aks-learn \
     --name aks-learn \
     --node-count 2 \
     --node-vm-size Standard_B2s \
     --tier free \
     --generate-ssh-keys
   ```
   This takes several minutes. Verify: the command eventually prints JSON
   with `"provisioningState": "Succeeded"` and `"powerState": {"code": "Running"}`.

3. **Look at what got created.** Run
   `az aks show --resource-group rg-aks-learn --name aks-learn --output table`
   and note the Kubernetes version and tier. Then run
   `az group list --output table` — notice a *second*, AKS-managed
   resource group now exists named something like
   `MC_rg-aks-learn_aks-learn_eastus`. This is where the actual node
   VMs, disks, NICs, and (later) load balancers live — don't delete it
   directly; it's tied to the cluster's lifecycle and gets cleaned up
   when the cluster is deleted.

4. **Wire up `kubectl`.** Run
   `az aks get-credentials --resource-group rg-aks-learn --name aks-learn`.
   Verify with `kubectl config get-contexts` — you should see an entry
   for `aks-learn` (marked `*` as current if it just got set active
   alongside any existing kind/minikube contexts).

5. **Verify the nodes.** Run `kubectl get nodes -o wide`. Verify: two
   nodes listed, `STATUS` = `Ready`, and the `KUBELET-VERSION` matching
   what `az aks show` reported. Also try
   `kubectl get nodes -o wide --context aks-learn` explicitly, and
   compare against a local context if you still have one
   (`kubectl config get-contexts`) to build the habit of checking which
   cluster you're pointed at.

6. **Inspect a node pool.** Run
   `az aks nodepool list --resource-group rg-aks-learn --cluster-name aks-learn --output table`.
   Verify: one pool (commonly named `nodepool1`), `COUNT` = 2, `VMSIZE`
   matching what you requested.

7. **Diagnose and fix: nodes not ready.** Simulate/observe a "nodes not
   ready" investigation even without breaking anything: run
   `kubectl describe node <one-of-your-node-names>` and read the
   `Conditions` section (`Ready`, `MemoryPressure`, `DiskPressure`,
   `PIDPressure`, `NetworkUnavailable` should all be healthy/`False`
   except `Ready=True`). Now deliberately scale to a size that could
   strain a `Standard_B2s` node: skip actually deploying anything huge,
   but note down what you'd check if a node showed `Ready=False` — run
   `kubectl get events --sort-by=.lastTimestamp` and
   `kubectl describe node <name>` and look at the `Events` section for
   causes like disk pressure, kubelet not posting status, or a failed VM
   extension. (You'll cause an actual resource-pressure failure on
   purpose in module 02's diagnose exercise.)

8. **Try stop/start (optional, cost-saving).** If you want to pause
   billing on node VMs without deleting the cluster between study
   sessions, run
   `az aks stop --resource-group rg-aks-learn --name aks-learn`, wait for
   it to complete, then `az aks start --resource-group rg-aks-learn --name aks-learn`
   before your next session. Verify stop worked with
   `az aks show --resource-group rg-aks-learn --name aks-learn --query powerState`
   (should show `Stopped`, then `Running` again after start). Note: stop
   pauses node VM billing but some resources (disks, reserved public IPs)
   may still bill while stopped — check the portal if you're unsure.

9. **Clean up.** If you're done with this cluster for the day and don't
   need it for module 02 immediately, delete everything:
   `az group delete --name rg-aks-learn --yes --no-wait`. If you're
   continuing straight into module 02, you may leave the cluster running
   — just don't forget it's billing while it exists.

## Common mistakes & troubleshooting

- **Picking too large a VM size "to be safe."** `Standard_D4s_v5` or
  bigger for a 2-node learning cluster is unnecessary cost for no benefit
  in this track — `Standard_B2s` (or similar burstable 2 vCPU size) is
  enough for every exercise here.
- **Choosing `--tier standard` out of habit.** Standard tier adds a
  control-plane SLA cost meant for production; use `free` for learning
  clusters you plan to tear down.
- **Forgetting the `MC_*` resource group exists.** It's not a mistake to
  see it, but people sometimes try to manually delete resources inside
  it, which fights the cluster's own reconciliation. Manage it through
  the AKS cluster/node pool, not by hand.
- **Running `kubectl` against the wrong context after adding AKS.** Once
  you have both local and AKS contexts, always check
  `kubectl config current-context` before running anything you don't
  want to accidentally point at production-shaped infrastructure.
- **Cost pitfall: leaving a "just for testing" cluster running for days.**
  A 2-node `Standard_B2s` cluster left running unattended for a week adds
  up. Get in the habit of running `az aks stop` between sessions, or
  `az group delete` if you're done with a module, rather than leaving
  clusters idle "just in case."

## Checkpoint quiz

1. What's the difference between the system node pool and a user node
   pool?
2. What does the `--tier` flag control, and why is `free` the right
   choice for this track?
3. Where do the actual node VMs, disks, and NICs for your cluster live,
   resource-group-wise, and why shouldn't you manage that resource group
   by hand?
4. What does `az aks get-credentials` actually do to your local machine?
5. What's the practical billing difference between `az aks stop` and
   `az group delete`?
6. If `kubectl get nodes` shows a node as `NotReady`, what two commands
   would you reach for first to investigate?

<details>
<summary>Show answers</summary>

1. The system node pool runs critical cluster add-ons (CoreDNS,
   metrics-server, etc.) and can also run your workloads; a user node
   pool is an additional pool you add later, typically to isolate
   specific workloads (different VM size, GPU, taints, etc.) from the
   system pool.
2. `--tier` controls the control plane's SLA/scale tier. `free` has no
   uptime SLA but no extra control-plane cost, which is appropriate for a
   learning cluster you don't need contractual uptime guarantees for.
3. In a separate, AKS-managed resource group (named like
   `MC_<rg>_<cluster>_<region>`). You shouldn't manage it by hand because
   AKS reconciles its contents to match the cluster/node pool state —
   manual changes there can be overwritten or cause drift; manage node
   pools through `az aks`/`kubectl` instead.
4. It fetches the cluster's kubeconfig (API server address, cluster CA,
   auth info) and merges it as a new context into your local
   `~/.kube/config`, the same file used for local kind/minikube contexts.
5. `az aks stop` pauses billing on the node VMs (and the cluster is fully
   deleted-and-recreatable via `start`), but some attached resources may
   still bill. `az group delete` deletes the cluster and its resource
   group entirely — no way to "start" it back; you'd recreate from
   scratch.
6. `kubectl describe node <name>` (check the `Conditions` and `Events`
   sections) and `kubectl get events --sort-by=.lastTimestamp` (see
   cluster-wide recent events for context).

</details>

## Next

[02-deploying-workloads-to-aks](../02-deploying-workloads-to-aks/README.md)
— deploy real workloads to your AKS cluster and see what's different from
kind/minikube.
