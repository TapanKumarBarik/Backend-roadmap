# 06 - Storage: PersistentVolumes and PersistentVolumeClaims

## Why this matters

You've used `emptyDir` volumes already (module 02's sidecar exercise) to
share files between containers *within* a Pod — but that storage dies
with the Pod. Databases, uploaded files, and anything that must survive
a Pod being deleted and recreated need storage that outlives any single
Pod. Kubernetes' PV/PVC system is how you request and bind that durable
storage without hardcoding *where* it physically lives into your
application manifests.

## Concepts

**`emptyDir`, recap and its limit**: an `emptyDir` volume is created
fresh when a Pod starts and is deleted permanently when that Pod is
removed from a node — great for scratch space or sharing files between
sidecars, useless for anything that needs to survive a Pod restart or
rescheduling.

**A PersistentVolume (PV)** is a piece of actual storage in the cluster —
a chunk of disk, a network share, whatever the underlying platform
provides — represented as a Kubernetes object independent of any Pod.
Think of it as a physical hard drive that exists whether or not anything
is currently using it.

**A PersistentVolumeClaim (PVC)** is a *request* for storage made by a
user/Pod: "I need 5Gi, with these access characteristics." It's not the
storage itself — it's a claim ticket that gets matched ("bound") to an
actual PV that satisfies it. This split exists so application authors
write PVCs (portable, describing *needs*) without knowing or caring
which specific disk/backend actually provides it (cluster operators or
StorageClasses handle that).

**A StorageClass** describes *how* to dynamically provision a PV on
demand, instead of a cluster operator manually pre-creating PVs for every
possible request. When a PVC references a StorageClass, a
**provisioner** creates a matching PV automatically the moment the PVC is
created — this is "dynamic provisioning," and it's the normal mode on
every real cloud cluster (AKS's default StorageClass provisions real
Azure Disks this way). Local kind clusters ship a default StorageClass
(usually named `standard`, backed by the `rancher.local-path-provisioner`
project) that provisions storage as a directory on the kind node
container's filesystem — functionally durable across Pod restarts, but
tied to that one node and gone if you delete the whole kind cluster.

```
   dynamic provisioning chain (bottom drives the one above it):

   Pod  ──references──► PVC  ──bound to──► PV  ──backed by──► real disk
   spec.volumes         "I need           "here is           (local dir,
   .persistentVolume     5Gi RWO"          5Gi RWO"           Azure Disk…)
   Claim.claimName          │                 ▲
                            │   StorageClass  │
                            └──► provisioner ─┘  creates the PV on demand
```

**Access modes** describe how many nodes can mount a volume at once and
how:
- `ReadWriteOnce` (RWO): read-write by a single node at a time (most
  common — a typical database volume).
- `ReadOnlyMany` (ROX): read-only by many nodes simultaneously.
- `ReadWriteMany` (RWX): read-write by many nodes simultaneously
  (requires a backend that supports it — local-path-provisioner on kind
  does not, so RWX PVCs will stay `Pending` locally).

**Reclaim policy** decides what happens to the underlying storage once
its PVC is deleted: `Delete` (the PV and its underlying storage are
destroyed — the default for dynamically-provisioned volumes) or
`Retain` (the PV and its data survive the PVC's deletion, for manual
recovery/inspection — a safety choice for data you can't afford to lose
by accident).

**How a PVC actually gets used**: you don't attach a PV directly to a
Pod. You reference a PVC by name in the Pod's `spec.volumes`, and mount
it into a container like any other volume. StatefulSets (not covered in
depth in this track, but worth knowing the name) automate creating a
distinct PVC *per replica* for stateful apps like databases run with
multiple replicas — out of scope here, but a natural next topic once
you're comfortable with the plain PVC pattern below.

## Command reference

| Command | What it does | Example |
|---|---|---|
| `kubectl get storageclass` | Lists available StorageClasses and which is default | `kubectl get sc` |
| `kubectl get pv` | Lists PersistentVolumes cluster-wide (not namespaced) | `kubectl get pv` |
| `kubectl get pvc` | Lists PersistentVolumeClaims in the current namespace | `kubectl get pvc` |
| `kubectl describe pvc <name>` | Shows binding status, capacity, and events | `kubectl describe pvc data-claim` |
| `kubectl describe pv <name>` | Shows a PV's backing details, capacity, reclaim policy | `kubectl describe pv <pv-name>` |
| `kubectl delete pvc <name>` | Deletes a claim (may trigger PV deletion depending on reclaim policy) | `kubectl delete pvc data-claim` |
| `spec.accessModes` | Access pattern requested/provided: `ReadWriteOnce`, `ReadOnlyMany`, `ReadWriteMany` | `accessModes: ["ReadWriteOnce"]` |
| `spec.resources.requests.storage` | Amount of storage requested by a PVC | `storage: 1Gi` |
| `spec.storageClassName` | Which StorageClass should provision the volume | `storageClassName: standard` |
| `spec.persistentVolumeReclaimPolicy` | What happens to storage after the PVC is deleted | `persistentVolumeReclaimPolicy: Retain` |
| `volumes[].persistentVolumeClaim.claimName` | References a PVC from a Pod spec | see exercises |

## Hands-on exercises

Continue in namespace `demo`.

### 1. Check what your cluster provides by default

```bash
kubectl get storageclass
```

Expected: a StorageClass (commonly `standard`, marked
`(default)`) — this is what kind installs out of the box so dynamic
provisioning works with zero extra setup.

### 2. Request storage with a PVC (dynamic provisioning)

```yaml
# pvc-data.yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: data-claim
spec:
  accessModes:
    - ReadWriteOnce
  resources:
    requests:
      storage: 1Gi
```

```bash
kubectl apply -f pvc-data.yaml
kubectl get pvc data-claim
```

Expected: `STATUS` becomes `Bound` (may briefly show `Pending` first).
Note you never specified `storageClassName` — it used the cluster's
default StorageClass.

### 3. See the PV that got created for you

```bash
kubectl get pv
kubectl describe pv $(kubectl get pvc data-claim -o jsonpath='{.spec.volumeName}')
```

Expected: a PV whose `Claim` field references `demo/data-claim`, capacity
`1Gi`, and `Reclaim Policy: Delete`. Notice the PV was created
automatically — you never wrote a PV manifest.

### 4. Mount the PVC in a Pod and write data

```yaml
# pod-writer.yaml
apiVersion: v1
kind: Pod
metadata:
  name: writer
spec:
  containers:
    - name: app
      image: busybox:1.36
      command: ["sh", "-c", "echo \"written at $(date)\" >> /data/log.txt; sleep 3600"]
      volumeMounts:
        - name: storage
          mountPath: /data
  volumes:
    - name: storage
      persistentVolumeClaim:
        claimName: data-claim
```

```bash
kubectl apply -f pod-writer.yaml
kubectl exec writer -- cat /data/log.txt
```

Expected: one line with a timestamp.

### 5. Prove the data survives the Pod being deleted and recreated

```bash
kubectl delete pod writer
kubectl apply -f pod-writer.yaml
kubectl exec writer -- cat /data/log.txt
```

Expected: **two** lines now — the original from step 4 plus a new one
from this recreation's startup command, proving the PVC's data outlived
the deleted Pod (unlike `emptyDir`, which would have started empty).

### 6. Share the same PVC from a second Pod (read)

```yaml
# pod-reader.yaml
apiVersion: v1
kind: Pod
metadata:
  name: reader
spec:
  containers:
    - name: app
      image: busybox:1.36
      command: ["sh", "-c", "sleep 3600"]
      volumeMounts:
        - name: storage
          mountPath: /data
          readOnly: true
  volumes:
    - name: storage
      persistentVolumeClaim:
        claimName: data-claim
```

```bash
kubectl apply -f pod-reader.yaml
kubectl exec reader -- cat /data/log.txt
```

Expected: since this PVC's access mode is `ReadWriteOnce`, this works
only as long as both Pods land on the same node — on this single-node
kind cluster that's guaranteed, but it's worth noting RWO's real
constraint: on a multi-node cluster, a second Pod scheduled to a
*different* node would fail to mount it simultaneously.

### 7. Explicit StorageClass and reclaim policy on a PVC

```yaml
# pvc-explicit.yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: data-claim-explicit
spec:
  storageClassName: standard
  accessModes:
    - ReadWriteOnce
  resources:
    requests:
      storage: 2Gi
```

```bash
kubectl apply -f pvc-explicit.yaml
kubectl get pvc data-claim-explicit
kubectl get pv
```

Expected: bound the same way, this time with the StorageClass named
explicitly instead of relying on the default.

### 8. Delete a PVC and observe reclaim policy in action

```bash
kubectl delete pod writer reader
kubectl get pv
kubectl delete pvc data-claim
kubectl get pv
```

Expected: after deleting the PVC, the PV that was bound to it also
disappears (or moves to `Released`/is cleaned up shortly after) — because
the default reclaim policy for dynamically-provisioned volumes here is
`Delete`. The underlying data on the node's local-path directory is gone.

### 9. Diagnose and fix: PVC stuck Pending (unsatisfiable request)

```yaml
# pvc-toobig.yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: too-big-claim
spec:
  accessModes:
    - ReadWriteMany
  resources:
    requests:
      storage: 10Gi
```

```bash
kubectl apply -f pvc-toobig.yaml
kubectl get pvc too-big-claim
```

Expected: `STATUS: Pending`, staying that way. Diagnose:

```bash
kubectl describe pvc too-big-claim
```

Expected: an event like `waiting for a volume to be created, either by
external provisioner "rancher.io/local-path" or manually created by
system administrator` combined with the access mode being the real
blocker — local-path-provisioner only supports `ReadWriteOnce`, not
`ReadWriteMany`. Fix by changing the access mode:

```yaml
spec:
  accessModes:
    - ReadWriteOnce
  resources:
    requests:
      storage: 10Gi
```

```bash
kubectl delete pvc too-big-claim
kubectl apply -f pvc-toobig.yaml    # after fixing accessModes
kubectl get pvc too-big-claim
```

Expected: `Bound`. This is a good example of a limitation specific to
the local storage provisioner — the same manifest with `ReadWriteMany`
might work fine against a cloud backend that supports it (e.g. Azure
Files on AKS).

### 10. Diagnose and fix: Pod stuck Pending because of an unbound PVC

```yaml
# pod-stuck.yaml
apiVersion: v1
kind: Pod
metadata:
  name: stuck-pod
spec:
  containers:
    - name: app
      image: busybox:1.36
      command: ["sh", "-c", "sleep 3600"]
      volumeMounts:
        - name: storage
          mountPath: /data
  volumes:
    - name: storage
      persistentVolumeClaim:
        claimName: does-not-exist-claim
```

```bash
kubectl apply -f pod-stuck.yaml
kubectl get pod stuck-pod
```

Expected: `STATUS: Pending`, indefinitely. Diagnose:

```bash
kubectl describe pod stuck-pod
```

Expected: an event like `persistentvolumeclaim "does-not-exist-claim"
not found`. Fix by creating the referenced PVC (or correcting the name
to `data-claim-explicit`, which you created in exercise 7):

```bash
kubectl delete pod stuck-pod
```

Edit `claimName` to `data-claim-explicit`, then:

```bash
kubectl apply -f pod-stuck.yaml
kubectl get pod stuck-pod
```

Expected: `Running`. Clean up everything from this module:

```bash
kubectl delete pod stuck-pod
kubectl delete pvc data-claim-explicit too-big-claim
```

## Independent challenge

No YAML or commands given here — figure it out yourself using what you
know from this module and earlier ones.

**Task:** Stand up a tiny "notes" service backed by durable storage:
a Deployment whose container appends a startup timestamp to a file on a
mounted PersistentVolumeClaim every time it starts, fronted by a Service.
Write at least one line, then prove the data is genuinely persistent by
forcing the Pod to be replaced (not just restarted in place) and reading
the file back to confirm the earlier line is still there alongside the new
one. Finally, explain — before you test it — what you'd expect to happen
to that data if you deleted the PVC given the default reclaim policy your
kind cluster uses. This combines this module's PVC mechanics with
Deployments (module 03) and Services (module 04).

<details>
<summary>Stuck? One hint</summary>

Deleting the Pod (or `kubectl rollout restart` on the Deployment) forces a
brand-new Pod that re-mounts the same claim by `claimName`; check the
bound PV's reclaim policy with `kubectl get pv` — on kind it defaults to
`Delete`.

</details>

## Common mistakes & troubleshooting

- **Confusing a PVC with the storage itself**: a PVC is a request/claim;
  the PV is the actual storage. A `Pending` PVC means no PV has been
  bound yet — usually because dynamic provisioning is still running, or
  because the request (size, access mode) can't be satisfied.
- **Requesting `ReadWriteMany` against a backend that doesn't support
  it**: local-path-provisioner (kind's default) only supports
  `ReadWriteOnce` — a PVC requesting RWX will sit `Pending` forever
  locally, which is exactly what you reproduced in exercise 9.
  Cloud-backed StorageClasses (Azure Files, NFS-backed classes) do
  support RWX.
- **Forgetting the reclaim policy before deleting a PVC**: with the
  default `Delete` policy, deleting a PVC destroys its data
  permanently and immediately — there's no recycle bin. For anything you
  can't afford to lose, use/patch a StorageClass or PV with
  `persistentVolumeReclaimPolicy: Retain`.
- **Referencing a PVC name that doesn't exist (or is in another
  namespace)**: identical failure mode to module 05's ConfigMap
  namespace mistake — PVCs are namespaced, and a typo or wrong namespace
  leaves the Pod `Pending` with an event pointing at the missing claim.
- **Assuming storage follows the Pod across nodes automatically**: an
  `RWO` volume is only mountable by one node at a time; on a multi-node
  cluster a Pod using it can get stuck `Pending` if the scheduler can't
  place it on the node currently holding the volume (or if that node is
  down) — a real operational constraint you'll meet again with
  StatefulSets.

## Checkpoint quiz

Write down your answer to each question before expanding it — checking without attempting first is the single easiest way to fool yourself into thinking you've learned this.

1. What is the difference between a PersistentVolume and a
   PersistentVolumeClaim?
2. What does a StorageClass actually do, and why does dynamic
   provisioning matter compared to manually pre-creating PVs?
3. What happened to your first PVC's data when you deleted the Pod
   using it in exercise 5? What would have happened if it had used
   `emptyDir` instead?
4. What does `ReadWriteOnce` actually restrict, precisely?
5. What's the practical difference between reclaim policies `Delete` and
   `Retain`, and when would you prefer `Retain`?
6. In exercise 9, why did the PVC stay `Pending` even though there was
   plenty of disk space free on the node?

<details>
<summary>Show answers</summary>

1. A PersistentVolume represents actual storage in the cluster; a
   PersistentVolumeClaim is a request for storage (size, access mode)
   that gets matched/bound to a PV satisfying it.
2. A StorageClass defines how to automatically provision a new PV the
   moment a matching PVC is created, instead of requiring a human to
   pre-create PVs for every possible future request — this is what makes
   storage self-service instead of a manual, ticket-driven process.
3. The data persisted — the second Pod using the same PVC saw both the
   original and new log lines. With `emptyDir` instead, the data would
   have been deleted along with the first Pod, and the recreated Pod
   would start empty.
4. It restricts the volume to being mounted read-write by only one node
   at a time — not one Pod; multiple Pods on the *same* node can still
   share it.
5. `Delete` destroys the underlying storage as soon as the bound PVC is
   deleted; `Retain` keeps the storage (and PV object, marked
   `Released`) around for manual recovery/inspection. Prefer `Retain`
   for data where accidental deletion would be costly.
6. The PVC requested `ReadWriteMany`, which the cluster's default
   provisioner (local-path-provisioner) doesn't support at all — no
   amount of free disk space fixes an access mode the provisioner can't
   offer.

</details>

## Further reading & sources

- [Persistent Volumes](https://kubernetes.io/docs/concepts/storage/persistent-volumes/) - the authoritative reference for PVs, PVCs, access modes, and reclaim policies.
- [Storage Classes](https://kubernetes.io/docs/concepts/storage/storage-classes/) - how dynamic provisioning is configured and defaulted.
- [Configure a Pod to Use a PersistentVolume for Storage](https://kubernetes.io/docs/tasks/configure-pod-container/configure-persistent-volume-storage/) - a hands-on task mirroring this module's exercises.
- [local-path-provisioner (Rancher)](https://github.com/rancher/local-path-provisioner) - the default provisioner kind ships, including its RWO-only limitation.
- [StatefulSets](https://kubernetes.io/docs/concepts/workloads/controllers/statefulset/) - the natural next topic for per-replica PVCs with stateful workloads.

## Next

[07-helm-package-manager](../07-helm-package-manager/README.md) — you've
now hand-written a lot of YAML across five object types; Helm lets you
template and package all of it into a single reusable, versioned unit.
