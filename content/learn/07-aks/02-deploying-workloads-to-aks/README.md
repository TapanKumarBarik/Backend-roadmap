# Deploying Workloads to AKS

## Why this matters

You already know Deployments, Services, and ConfigMaps/Secrets from local
Kubernetes. The API objects don't change on AKS — but the environment
around them does: real DNS, real cloud load balancers, real resource
limits tied to real VM sizes, and real cost if you oversize something.
This module is about confirming your existing Kubernetes muscle memory
transfers, and learning the handful of things that are genuinely
different on a managed cloud cluster.

## Concepts

**Same API, different substrate.** A Deployment YAML you wrote for
kind/minikube will `kubectl apply` unchanged against AKS — the Kubernetes
API is the Kubernetes API. What changes is what's underneath: `kubectl get
pods -o wide` on AKS shows pods scheduled onto real Azure VM nodes with
real (limited) CPU/memory, not a laptop's whole resource pool shared
across a fake multi-node setup.

**Resource requests/limits matter more here.** On a local cluster, a Pod
with no resource requests just uses whatever your laptop has free. On a
small 2-node AKS cluster of `Standard_B2s` VMs, each node has a hard,
small CPU/memory ceiling (some of which is already reserved by
system/kubelet overhead). Pods without requests can starve each other or,
worse, get stuck `Pending` because nothing fits. This is the most common
new failure mode you'll meet in this module.

**Default storage class.** AKS ships a default `StorageClass` backed by
Azure Disks (and one backed by Azure Files) out of the box — `kubectl get
storageclass` shows them immediately, unlike a bare-bones kind cluster
where you may have had to install a provisioner yourself. A PVC with no
`storageClassName` binds to whatever the cluster marks as default.

**Namespaces work identically.** `kubectl create namespace`, per-namespace
ConfigMaps/Secrets, `kubectl config set-context --current --namespace=...`
— all unchanged from local Kubernetes.

**What AKS manages vs. what you own here:** Azure manages node
provisioning, the container runtime, and kubelet health-reporting to the
control plane. You still own: what resource requests/limits your
workloads declare, how many replicas you run relative to node capacity,
your ConfigMap/Secret content, and reading `kubectl describe` output when
something won't schedule — none of that is automated away by AKS.

## Command reference

| Command | What it does | Example |
|---|---|---|
| `kubectl create namespace` | Creates a namespace | `kubectl create namespace demo` |
| `kubectl config set-context --current --namespace` | Sets the default namespace for your current context | `kubectl config set-context --current --namespace=demo` |
| `kubectl apply -f` | Creates/updates objects from a manifest | `kubectl apply -f deployment.yaml` |
| `kubectl get pods -o wide` | Lists pods with node/IP columns | `kubectl get pods -o wide` |
| `kubectl describe pod` | Shows detailed status/events for a pod | `kubectl describe pod <name>` |
| `kubectl get events --sort-by=.lastTimestamp` | Shows recent cluster events, oldest first | `kubectl get events --sort-by=.lastTimestamp` |
| `kubectl top nodes` | Shows current CPU/memory usage per node (requires metrics-server, included by default in AKS) | `kubectl top nodes` |
| `kubectl top pods` | Shows current CPU/memory usage per pod | `kubectl top pods` |
| `kubectl get storageclass` | Lists available storage classes | `kubectl get storageclass` |
| `kubectl create configmap` | Creates a ConfigMap from literals or files | `kubectl create configmap app-config --from-literal=ENV=demo` |
| `kubectl create secret generic` | Creates a Secret | `kubectl create secret generic app-secret --from-literal=API_KEY=xyz` |
| `kubectl rollout status` | Watches a Deployment rollout to completion | `kubectl rollout status deployment/demo-app` |
| `kubectl logs` | Shows container logs | `kubectl logs <pod-name>` |

## Hands-on exercises

1. **Confirm your cluster context.** Run `kubectl config current-context`
   — confirm it says `aks-learn` (recreate the cluster per module 01 if
   you deleted it). Create a working namespace:
   `kubectl create namespace demo` then
   `kubectl config set-context --current --namespace=demo`.

2. **Deploy something you already know.** Write a small Deployment
   manifest for any simple image (e.g. `nginx` or an app image you built
   in the Docker track) with 2 replicas, and `kubectl apply -f` it.
   Verify: `kubectl get deployment` shows `2/2` ready, and
   `kubectl get pods -o wide` shows both pods `Running` with a `NODE`
   column populated (this is new versus a single-node local cluster —
   confirm the two pods can land on different nodes: check the `NODE`
   column across both pods).

3. **Expose it with a ClusterIP Service** (not LoadBalancer yet — that's
   module 04). Write a Service manifest selecting your Deployment's
   labels, `kubectl apply -f` it, then verify connectivity from inside
   the cluster: `kubectl run tmp-curl --rm -it --image=curlimages/curl --restart=Never -- curl -s <service-name>.<namespace>.svc.cluster.local`.
   Verify: you get a response body back.

4. **Add a ConfigMap and Secret, wire them into the Deployment.** Create
   a ConfigMap and Secret with `kubectl create configmap`/`kubectl create
   secret generic`, mount or inject them as env vars in your Deployment
   spec, re-apply, and verify with
   `kubectl exec -it <pod-name> -- env | grep <YOUR_VAR>` that the value
   is present in the running container.

5. **Check the default storage class.** Run `kubectl get storageclass`.
   Verify: at least one StorageClass exists and is marked
   `(default)` next to its name — note its `PROVISIONER` (an Azure Disks
   or Azure Files CSI driver), confirming AKS wires this up without you
   installing anything, unlike a bare kind cluster.

6. **Check real resource usage.** Run `kubectl top nodes` and
   `kubectl top pods`. Verify: both commands return numbers (metrics-server
   is preinstalled on AKS). Compare the `CPU(cores)`/`MEMORY(bytes)`
   columns against the total capacity of a `Standard_B2s` node (2 vCPU) —
   note how little headroom two of these small nodes actually have once
   system pods (`kube-system` namespace) are accounted for: run
   `kubectl get pods -n kube-system` to see what's already running there.

7. **Diagnose and fix: pods stuck Pending from insufficient resources.**
   Deliberately request more CPU than the cluster can give: edit your
   Deployment to request `resources.requests.cpu: "4"` per replica (more
   than a whole `Standard_B2s` node has) and `kubectl apply -f` it. Watch
   `kubectl get pods` — the new pods will sit `Pending`. Run
   `kubectl describe pod <pending-pod-name>` and read the `Events`
   section — you should see a message like
   `0/2 nodes are available: 2 Insufficient cpu`. Fix it by editing the
   request back down to something realistic (e.g. `"250m"`), re-apply,
   and verify the pods become `Running`.

8. **Clean up.** Delete the namespace to remove everything you created in
   it: `kubectl delete namespace demo`. This does not touch the cluster
   itself (still billing per module 01's note) — if you're done for the
   day, also run `az aks stop --resource-group rg-aks-learn --name aks-learn`
   or `az group delete --name rg-aks-learn --yes --no-wait` if you don't
   need the cluster again soon.

## Independent challenge

No commands given here — figure it out yourself using what you know from this module and earlier ones.

**Task:** Given a fixed two-node `Standard_B2s` cluster (from module 01 — conceptually building on that module's node sizing), figure out empirically how many replicas of a modest workload it can actually run before the scheduler runs out of room, and prove the failure is a resource problem rather than anything else. Pick any simple image, give each replica a deliberate, realistic CPU/memory request, and scale the replica count up until new pods stop being placed. Confirm from the pods' own status why the last ones won't schedule, then bring the workload back down to a count that fully fits. Do all of this in a throwaway namespace and delete that namespace when you're done, and decide whether the cluster itself should keep running afterward — the nodes bill whether or not anything is scheduled on them.

<details>
<summary>Stuck? One hint</summary>

The scheduler compares each pod's `resources.requests` against each node's allocatable capacity; when a pod can't fit, `kubectl describe pod` on the stuck pod spells out the reason in its Events, using a phrase like "Insufficient cpu."

</details>

## Common mistakes & troubleshooting

- **No resource requests/limits on a small cluster.** Locally this was
  often harmless; on a 2-node `Standard_B2s` AKS cluster it's the single
  most common cause of surprising scheduling behavior. Set requests
  deliberately.
- **Assuming `kubectl top` "just works" like on a local cluster without
  checking.** It does on AKS (metrics-server ships by default), but if
  you ever see it fail, that's a real signal something about the cluster
  add-ons is broken, not just "expected on this platform."
- **Forgetting which namespace you're in.** `kubectl config set-context
  --current --namespace=demo` persists in your kubeconfig — if objects
  seem to have vanished, run `kubectl config view --minify | grep
  namespace` or add `--all-namespaces` to your `get` command before
  assuming something is broken.
- **Confusing `Pending` (can't schedule) with `CrashLoopBackOff`
  (scheduled but the container keeps failing) or `ImagePullBackOff`
  (scheduled but the image can't be pulled — covered in module 03).**
  `kubectl describe pod` always tells you which one you're looking at in
  the `Events` section; read it before guessing.
- **Cost pitfall: leaving a Deployment scaled up "to test scheduling."**
  Deployment replica count doesn't add nodes and isn't separately
  billed beyond the node VMs you already have running, but combined with
  the next module's LoadBalancer Services, forgotten test Services can
  quietly rack up their own IP/LB charges — clean up namespaces you're
  done with instead of leaving them "for later."

## Checkpoint quiz

Write down your answer to each question before expanding it — checking without attempting first is the single easiest way to fool yourself into thinking you've learned this.

1. Why can a Deployment manifest that worked on kind/minikube fail to
   fully schedule on a small AKS cluster with no changes to the YAML
   itself?
2. What command shows current CPU/memory usage per node, and what
   component makes it work?
3. What does AKS provide out of the box, storage-wise, that a bare kind
   cluster typically does not?
4. If `kubectl get pods` shows a pod `Pending`, what's the first command
   you run to find out why, and what section of its output matters most?
5. What's the difference between a pod stuck `Pending` and one in
   `CrashLoopBackOff`?
6. Why doesn't scaling a Deployment's replica count by itself change your
   Azure bill?

<details>
<summary>Show answers</summary>

1. Because scheduling now competes for real, limited node CPU/memory
   (each node is a small VM with its own hard ceiling, plus
   kube-system/kubelet overhead), whereas a local cluster often had a
   whole laptop's resources effectively available.
2. `kubectl top nodes` (and `kubectl top pods` for pod-level); both rely
   on `metrics-server`, which ships preinstalled on AKS.
3. A default `StorageClass` (or two — Azure Disk and Azure Files backed)
   already registered and ready to satisfy PVCs with no
   `storageClassName` specified, without installing a provisioner
   yourself.
4. `kubectl describe pod <name>`; the `Events` section at the bottom,
   which shows scheduler messages like "Insufficient cpu" or "Insufficient
   memory."
5. `Pending` means the pod hasn't been scheduled to any node yet (usually
   a resource or constraint problem); `CrashLoopBackOff` means it *was*
   scheduled and started, but the container keeps exiting and Kubernetes
   is backing off restart attempts.
6. Because you're billed for the node VMs that exist, not for how many
   pods/replicas run on them — scaling replicas up (until you run out of
   node capacity) doesn't add or remove billable infrastructure by
   itself.

</details>

## Next

[03-acr-integration-with-aks](../03-acr-integration-with-aks/README.md) —
pull your own images from Azure Container Registry into AKS securely.
