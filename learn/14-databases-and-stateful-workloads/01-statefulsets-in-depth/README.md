# 01 - StatefulSets in Depth

## Why this matters

Module 00 showed you *why* a Deployment can't safely run a database and
previewed the object that can: a StatefulSet. This module makes that object
concrete — stable network names, ordered start/stop, and one private
PersistentVolumeClaim per replica. Almost every "real database on
Kubernetes" thing you do later (operators, backups, failover) is built on
top of a StatefulSet, so the mechanics here are load-bearing for the rest
of the track.

## Concepts

### What a StatefulSet guarantees that a Deployment doesn't

A StatefulSet manages Pods from a template just like a Deployment, but adds
three guarantees the Deployment deliberately withholds:

1. **Stable, predictable identity.** Pods are named
   `<statefulset-name>-<ordinal>`: `db-0`, `db-1`, `db-2` — not random
   hashes. A deleted `db-1` comes back *as* `db-1`, not as a new name.
2. **Stable, private storage.** Each Pod gets its own PVC from a
   `volumeClaimTemplate`, named `<template>-<pod>` (e.g. `data-db-0`), and
   that PVC re-binds to the same Pod ordinal across restarts — it is *not*
   shared, and it is *not* deleted when the Pod is deleted.
3. **Ordered, one-at-a-time operations.** By default Pods are created in
   order `0 → 1 → 2` (each waiting for the previous to be Ready), deleted
   in reverse `2 → 1 → 0`, and updated one at a time. Contrast module 00's
   Deployment, which starts and replaces Pods all at once.

These are exactly the three properties module 00 said stateful workloads
need. A StatefulSet is, functionally, "a Deployment with the scheduler's
conveniences removed where state requires it."

### The headless Service and stable DNS names

Stable Pod *names* only help if other Pods can *resolve* them. That's the
job of a **headless Service** — a Service with `clusterIP: None`. A normal
Service (the kind you used in
[03-kubernetes](../../03-kubernetes/README.md)) gives you one virtual IP
that load-balances across all backends — great for stateless, useless when
you need to reach a *specific* replica. A headless Service instead creates
a **per-Pod DNS record**:

```
<pod-name>.<service-name>.<namespace>.svc.cluster.local
```

So `db-0.db.stateful.svc.cluster.local` always resolves to the `db-0` Pod,
`db-1.db...` to `db-1`, and so on — stable, individual addresses. This is
how a replica finds "the primary at `db-0`" reliably, which module 00
showed a Deployment can't offer. The StatefulSet's `spec.serviceName` must
name this headless Service, and it's what wires the two together.

You often run **both** Services for one StatefulSet: the headless one for
stable per-Pod addressing (replica-to-replica traffic), *and* a normal
`ClusterIP` Service for clients that just want "any/the read-write
endpoint" — the operator in module 03 does exactly this.

### `volumeClaimTemplates`: per-Pod storage, done right

This is the piece that fixes module 00's shared-PVC trap. Instead of
referencing an existing PVC in the Pod spec, a StatefulSet declares a
`volumeClaimTemplate`, and the controller **creates one PVC per replica**
from it:

```yaml
volumeClaimTemplates:
  - metadata:
      name: data
    spec:
      accessModes: ["ReadWriteOnce"]
      storageClassName: standard    # module 02 swaps this for an Azure Disk class
      resources:
        requests:
          storage: 1Gi
```

For a 3-replica StatefulSet this produces `data-db-0`, `data-db-1`,
`data-db-2` — three independent RWO volumes, each dynamically provisioned
through the StorageClass exactly as in
[03-kubernetes module 06](../../03-kubernetes/06-storage-pv-and-pvc/README.md),
just now *one per Pod*. Key consequences:

- Delete `db-1` and its replacement re-binds `data-db-1` — same data.
- Delete the whole StatefulSet and the PVCs **stay** (a safety choice, and
  a cost trap on Azure — module 02).
- Scaling *down* from 3 to 2 deletes the `db-2` Pod but **leaves
  `data-db-2`** behind, so scaling back up re-attaches the old data.

### Ordering, readiness, and why it matters for databases

StatefulSet operations respect ordinal order, gated on **readiness**:

- **Scale up / create:** `db-0` is created and must become Ready before
  `db-1` starts, and so on. This lets a clustered database bootstrap the
  primary (`db-0`) first, then have each replica join in turn.
- **Scale down / delete:** highest ordinal first (`db-2`, then `db-1`),
  each fully terminated before the next — so you never yank the primary
  out from under replicas.
- **Rolling update** (`updateStrategy: RollingUpdate`, the default):
  updates one Pod at a time from the highest ordinal down, waiting for
  each to be Ready. `partition` lets you update only ordinals `>= N` — a
  built-in canary for stateful upgrades.

Because ordering is *readiness-gated*, your Pod's readiness probe is
suddenly critical: if `db-0` never reports Ready, `db-1` never starts. A
misconfigured probe can stall an entire StatefulSet rollout — a real
diagnose-and-fix you'll do below.

### `OrderedReady` vs `Parallel`, and `Retain` PVC policy

Two knobs worth knowing:

- **`podManagementPolicy`**: `OrderedReady` (default — the ordered
  behavior above) or `Parallel` (create/delete all Pods at once, but still
  with stable names and per-Pod PVCs). `Parallel` suits things that don't
  need bootstrap ordering (e.g. independent shards) and want faster
  scaling; it does *not* relax identity or storage guarantees.
- **`persistentVolumeClaimRetentionPolicy`** (a newer field): controls
  whether the per-Pod PVCs are deleted `whenScaled` and/or `whenDeleted`.
  The default is `Retain` for both — PVCs survive, which is safe but is the
  source of orphaned-disk cost on Azure. Setting `whenDeleted: Delete`
  makes deleting the StatefulSet also delete its PVCs.

## Command reference

| Command | What it does | Example |
|---|---|---|
| `kubectl get statefulset` | Lists StatefulSets and ready-replica counts | `kubectl get sts` |
| `kubectl describe sts <name>` | Shows update strategy, pod-management policy, events | `kubectl describe sts db` |
| `kubectl get pods -l app=db` | Shows the ordinal-named Pods (`db-0`, `db-1`, …) | `kubectl get pods -l app=db -o wide` |
| `kubectl get pvc` | Shows the per-Pod PVCs from `volumeClaimTemplates` | `kubectl get pvc` |
| `kubectl exec <pod> -- nslookup <fqdn>` | Resolves a headless Service's per-Pod DNS record | `kubectl exec db-0 -- nslookup db-1.db` |
| `kubectl scale sts <name> --replicas=N` | Scales ordered up/down (watch PVCs stay on scale-down) | `kubectl scale sts db --replicas=2` |
| `kubectl rollout status sts/<name>` | Watches an ordered rolling update progress | `kubectl rollout status sts/db` |
| `kubectl delete sts <name> --cascade=orphan` | Deletes the StatefulSet but leaves its Pods running | `kubectl delete sts db --cascade=orphan` |

Field breakdown — a minimal StatefulSet + headless Service:
- `spec.serviceName` — the name of the headless Service that governs the
  per-Pod DNS records; **required** and must match the Service.
- `spec.selector` / `template.metadata.labels` — must match (same rule as
  a Deployment).
- `spec.replicas` — ordinal count; Pods `0 … replicas-1`.
- `volumeClaimTemplates[].metadata.name` — the PVC name *prefix*; final
  PVCs are `<name>-<statefulset>-<ordinal>`.
- Service `clusterIP: None` — what makes it *headless* (per-Pod DNS
  instead of one load-balanced VIP).

## Hands-on exercises

Local **kind** cluster, namespace `stateful` (create it if you cleaned up
module 00: `kubectl create namespace stateful && kubectl config
set-context --current --namespace=stateful`).

### 1. Create a headless Service and a StatefulSet

```yaml
# db.yaml
apiVersion: v1
kind: Service
metadata:
  name: db
spec:
  clusterIP: None          # headless
  selector:
    app: db
  ports:
    - port: 80
      name: web
---
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: db
spec:
  serviceName: db
  replicas: 3
  selector:
    matchLabels: { app: db }
  template:
    metadata:
      labels: { app: db }
    spec:
      containers:
        - name: web
          image: nginx:1.27
          ports:
            - containerPort: 80
          volumeMounts:
            - name: data
              mountPath: /usr/share/nginx/html
  volumeClaimTemplates:
    - metadata:
        name: data
      spec:
        accessModes: ["ReadWriteOnce"]
        resources:
          requests:
            storage: 100Mi
```

```bash
kubectl apply -f db.yaml
kubectl get pods -w
```

Expected: `db-0` appears and goes Ready *first*, then `db-1`, then `db-2` —
one at a time, in order. This is `OrderedReady` in action.

### 2. Observe stable identity and per-Pod PVCs

```bash
kubectl get pods -l app=db
kubectl get pvc
```

Expected: Pods `db-0`, `db-1`, `db-2`; PVCs `data-db-0`, `data-db-1`,
`data-db-2` — one per Pod, independently bound. Contrast module 00's single
shared PVC.

### 3. Prove per-Pod storage is genuinely private

Write a *different* file into each Pod's volume, then read it back:

```bash
for i in 0 1 2; do
  kubectl exec db-$i -- sh -c "echo 'I am db-$i' > /usr/share/nginx/html/id.txt"
done
for i in 0 1 2; do
  echo -n "db-$i says: "; kubectl exec db-$i -- cat /usr/share/nginx/html/id.txt
done
```

Expected: each Pod reports its own line — the volumes are not shared. If
they *were* shared (the Deployment failure), all three would show the last
value written.

### 4. Prove identity + storage survive Pod deletion

```bash
kubectl delete pod db-1
kubectl get pods -l app=db -w      # ctrl-c once db-1 is Running again
kubectl exec db-1 -- cat /usr/share/nginx/html/id.txt
```

Expected: the replacement is again named `db-1`, re-binds `data-db-1`, and
still shows `I am db-1` — same name, same disk, same data. This is the
guarantee module 00's Deployment could not make.

### 5. Resolve per-Pod DNS through the headless Service

```bash
kubectl exec db-0 -- sh -c "apk add --no-cache bind-tools >/dev/null 2>&1; \
  nslookup db-2.db.stateful.svc.cluster.local" 2>/dev/null \
  || kubectl run dns-test --rm -it --image=busybox:1.36 --restart=Never -- \
     nslookup db-2.db.stateful.svc.cluster.local
```

Expected: the FQDN resolves to `db-2`'s Pod IP. Each Pod has its own stable
DNS name via the headless Service — the mechanism a replica uses to find a
specific peer (e.g. "connect to the primary at `db-0.db`").

### 6. Watch ordered scale-down keep data

```bash
kubectl scale sts db --replicas=2
kubectl get pods -l app=db
kubectl get pvc
```

Expected: `db-2` is terminated (highest ordinal first) but **`data-db-2`
remains** in the PVC list. Scale back up and confirm the old data returns:

```bash
kubectl scale sts db --replicas=3
kubectl get pods -l app=db -w      # ctrl-c when db-2 is Ready
kubectl exec db-2 -- cat /usr/share/nginx/html/id.txt
```

Expected: `db-2` re-attaches `data-db-2` and still shows `I am db-2` — the
retained PVC was reused, not re-provisioned blank.

### 7. Watch an ordered rolling update

```bash
kubectl set image sts/db web=nginx:1.27-alpine
kubectl rollout status sts/db
kubectl get pods -l app=db
```

Expected: Pods update one at a time from the highest ordinal down
(`db-2`, then `db-1`, then `db-0`), each becoming Ready before the next —
not all-at-once like a Deployment. Confirm the new image:

```bash
kubectl get pod db-0 -o jsonpath='{.spec.containers[0].image}{"\n"}'
```

### 8. Diagnose-and-fix: a stuck rollout from a bad readiness probe

Ordering is readiness-gated, so a broken probe stalls everything. Add a
probe that can never pass:

```yaml
# patch the container in db.yaml, under the container spec:
          readinessProbe:
            httpGet:
              path: /nonexistent
              port: 80
            periodSeconds: 3
            failureThreshold: 2
```

```bash
kubectl apply -f db.yaml
kubectl rollout status sts/db --timeout=30s || true
kubectl get pods -l app=db
```

Expected: the rollout hangs. Because updates go highest-ordinal-first,
`db-2` gets the bad probe, never reports Ready, and the update **never
proceeds to `db-1`/`db-0`** — `kubectl get pods` shows `db-2` as
`0/1 Running` (not Ready) and the others still on the old spec. Diagnose:

```bash
kubectl describe pod db-2 | grep -A5 -i readiness
```

Expected: `Readiness probe failed: HTTP probe failed with statuscode:
404`. Fix by pointing the probe at a path that exists:

```yaml
          readinessProbe:
            httpGet:
              path: /
              port: 80
            periodSeconds: 3
            failureThreshold: 2
```

```bash
kubectl apply -f db.yaml
kubectl rollout status sts/db
```

Expected: `db-2` becomes Ready, and *now* the rollout continues to `db-1`
and `db-0`. Lesson: for a StatefulSet, a wrong readiness probe doesn't just
mark one Pod unhealthy — it can freeze the entire ordered rollout.

### 9. Diagnose-and-fix: a StatefulSet Pod stuck `Pending` on a PVC

Point the `volumeClaimTemplate` at a StorageClass that doesn't exist (this
is the exact class-binding failure you'll hit for real on Azure in
module 02). Delete and recreate the StatefulSet with a bad class:

```bash
kubectl delete sts db
```

Edit `db.yaml`'s `volumeClaimTemplate` to add
`storageClassName: does-not-exist`, then:

```bash
kubectl apply -f db.yaml
kubectl get pods -l app=db
kubectl get pvc
```

Expected: `db-0` sits `Pending`, and because ordering is gated on it,
`db-1`/`db-2` never even get created. Diagnose:

```bash
kubectl describe pvc data-db-0 | grep -A5 -i events
kubectl describe pod db-0 | grep -A5 -i events
```

Expected: the PVC event is `storageclass.storage.k8s.io "does-not-exist"
not found` and the Pod is unschedulable pending the volume. Fix — delete
the StatefulSet *and* the bad PVC (a `Pending` PVC won't fix itself just
from editing the class), restore `storageClassName: standard` (or remove
the line to use the default), and re-apply:

```bash
kubectl delete sts db
kubectl delete pvc data-db-0
# fix storageClassName in db.yaml
kubectl apply -f db.yaml
kubectl get pods -l app=db -w
```

Expected: `db-0` binds and goes Ready, then `db-1`, `db-2` follow. This is
the single most common StatefulSet incident and you'll recognize it
instantly on Azure next module.

### 10. Clean up (and see PVC retention one more time)

```bash
kubectl delete -f db.yaml
kubectl get pvc                 # PVCs are still here!
kubectl delete pvc -l app=db    # you must delete them explicitly
```

Expected: deleting the StatefulSet leaves `data-db-0/1/2` behind — you
delete them by hand. Remember this the moment those PVCs are billable Azure
Disks (module 02).

## Independent challenge

No manifests given. Build a 3-replica StatefulSet that models a
primary/replica topology *by convention*: replica `-0` is "the primary,"
and `-1` and `-2` are "replicas." Give each Pod its own PVC via a
`volumeClaimTemplate`, front it with a headless Service, and *also* add a
second, normal `ClusterIP` Service that selects only the primary (hint:
you'll need a label the StatefulSet controller sets automatically to pin a
Service to one ordinal). From a throwaway client Pod, demonstrate two
things: (a) you can reach a *specific* replica by its stable per-Pod DNS
name through the headless Service, and (b) the "primary" ClusterIP Service
always lands on `-0` even after you delete and let Kubernetes recreate that
Pod. This draws on Services from
[03-kubernetes](../../03-kubernetes/README.md) module 04 and this module's
headless-Service and stable-identity mechanics.

<details>
<summary>Stuck? One hint</summary>

The StatefulSet controller automatically labels each Pod with
`statefulset.kubernetes.io/pod-name: <name>` (e.g.
`statefulset.kubernetes.io/pod-name: db-0`). A normal Service whose
`selector` includes that label will only ever select that one Pod —
that's how you pin a "primary" Service to ordinal `-0` without hardcoding
an IP. The headless Service, by contrast, has `clusterIP: None` and gives
every Pod its own DNS record.

</details>

## Common mistakes & troubleshooting

- **Forgetting `serviceName` / the headless Service.** A StatefulSet's
  `spec.serviceName` must reference a Service, and for stable per-Pod DNS
  that Service must be headless (`clusterIP: None`). Omit it or point it at
  a normal Service and you lose the per-Pod DNS records that make stable
  identity useful.
- **Expecting `volumeClaimTemplate` PVCs to be cleaned up.** They aren't,
  by default — deleting the StatefulSet (or scaling down) leaves them.
  That's a data-safety feature and an Azure-cost trap; use
  `persistentVolumeClaimRetentionPolicy` deliberately if you want
  auto-deletion.
- **A readiness probe that stalls the whole rollout.** Because ordered
  operations are gated on readiness, one Pod that never goes Ready freezes
  every subsequent Pod's update — the failure in exercise 8. Always verify
  your probe passes against a real, existing endpoint.
- **Editing a bound-but-`Pending` PVC's StorageClass and expecting a
  fix.** A PVC's StorageClass is immutable once set; you must delete the
  bad PVC (and usually the StatefulSet) and recreate — exactly exercise 9.
- **Assuming scale-down deletes data.** Scaling from 3→2 removes the `-2`
  *Pod* but keeps `data-...-2`; scaling back up re-attaches old data. Great
  when intended, surprising (and costly, on Azure) when not.
- **Using a StatefulSet when you didn't need one.** StatefulSets are
  slower to scale and roll out (ordered, one-at-a-time). If a workload
  doesn't actually need stable identity or per-Pod storage, a Deployment is
  simpler and faster — don't cargo-cult StatefulSets onto stateless apps.

## Checkpoint quiz

Write down your answer to each question before expanding it — checking without attempting first is the single easiest way to fool yourself into thinking you've learned this.

1. Name the three guarantees a StatefulSet adds over a Deployment.
2. What makes a Service "headless," and what does a headless Service give
   you that a normal ClusterIP Service can't?
3. For a StatefulSet named `db` with a `volumeClaimTemplate` named `data`
   and 3 replicas, what are the exact PVC names created?
4. In what order are Pods created, deleted, and rolling-updated by
   default, and what gates each step?
5. You scale a StatefulSet down by one replica. What happens to that
   replica's PVC, and why might that surprise you on a cloud cluster?
6. In exercise 8, why did the whole rollout freeze instead of just marking
   one Pod unhealthy?
7. What is `persistentVolumeClaimRetentionPolicy` for, and what is its
   default?

<details>
<summary>Show answers</summary>

1. Stable/predictable network identity (ordinal Pod names + per-Pod DNS);
   stable, private per-Pod storage (`volumeClaimTemplates`); and ordered,
   one-at-a-time create/update/delete operations.
2. Setting `clusterIP: None`. It publishes a DNS record per Pod so you can
   resolve and reach a *specific* replica, instead of a single virtual IP
   that load-balances across all backends (which can't target one
   instance).
3. `data-db-0`, `data-db-1`, `data-db-2` — pattern
   `<template>-<statefulset>-<ordinal>`.
4. Created `0 → 1 → 2` (each Ready before the next); deleted in reverse
   `2 → 1 → 0`; rolling-updated highest-ordinal-first, one at a time. Each
   step is gated on the affected Pod becoming Ready.
5. The PVC is retained (default `Retain`), not deleted — the data stays.
   On a cloud cluster that PVC is a real billable managed disk, so a
   scaled-down (or deleted) StatefulSet can leave orphaned disks quietly
   costing money.
6. Ordered updates are readiness-gated and proceed highest-ordinal-first;
   the top Pod (`db-2`) never became Ready, so the controller never
   advanced to update the lower ordinals — the entire rollout stalled.
7. It controls whether the per-Pod PVCs are auto-deleted `whenScaled`
   and/or `whenDeleted`. The default is `Retain` for both (PVCs survive
   scale-down and StatefulSet deletion).

</details>

## Next

[02-storageclasses-and-dynamic-provisioning-on-azure](../02-storageclasses-and-dynamic-provisioning-on-azure/README.md) —
your `volumeClaimTemplates` have been backed by kind's local-path
provisioner. Now put real Azure Disks and Azure Files behind them, choose
access modes and reclaim policies deliberately, and provision the
StorageClass with the Terraform patterns from track 09.
