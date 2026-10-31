# 00 - Why Stateful Workloads Are Hard on Kubernetes

## Why this matters

Everything you've deployed to Kubernetes so far worked *because* it was
stateless — a Deployment can delete any Pod and start an identical one
anywhere, and nothing notices. Databases break that assumption completely:
they own durable data and expect a stable identity, and the moment you run
one the way you'd run a web frontend, you get silent data corruption or
data loss. This module is the framing for the whole track — understand the
tension here and every later design decision (StatefulSets, operators,
managed databases) becomes obvious rather than arbitrary.

## Concepts

### Stateless vs. stateful, precisely

A workload is **stateless** when any two of its instances are
interchangeable: a request can hit any replica and get the same answer,
and killing a replica loses nothing that isn't stored elsewhere. That's
the web app you deployed as a Deployment in
[03-kubernetes](../../03-kubernetes/README.md) — three replicas behind a
Service, and the Service load-balances across them freely because they're
clones.

A workload is **stateful** when instances are *not* interchangeable
because each one owns data that lives on disk and an identity other things
depend on. A Postgres primary is not the same as its replica; the shard
holding user IDs 0-1M is not the same as the shard holding 1M-2M. You
cannot round-robin traffic across them, and you cannot replace one with a
fresh blank copy without losing what it held.

### What a Deployment actually promises (and doesn't)

A Deployment's contract is: *keep N Pods matching this template running,
and I am free to achieve that however I like.* Concretely, that freedom
means:

- Pods get **random names** (`web-7d9f8-xk2p9`) — a new one each time.
- On a rolling update, it **creates new Pods before deleting old ones**,
  so two "versions" of the same Pod briefly run at once.
- It will happily **reschedule a Pod to a different node**, and start
  Pods in **any order**, all at once.
- Every Pod from the same Deployment template that mounts a PVC mounts
  **the same PVC** — they share one volume.

Each of those is a *feature* for a stateless web app and a *bug* for a
database. Two Postgres primaries writing to the same data directory at
once (which a rolling update invites) is exactly how you corrupt a
database. Random, changing Pod names mean a replica can't reliably find
"the primary." One shared PVC across replicas means you can't give each
database instance its own independent disk.

### The core tension

Here's the whole track in one sentence: **Kubernetes' scheduler is
designed to treat Pods as disposable and interchangeable, and stateful
workloads need exactly the opposite — stable identity and stable, private
storage that follows a specific instance.**

Kubernetes doesn't refuse to run state — it gives you purpose-built
objects that *constrain* the scheduler's freedom where state needs it:

- **Stable identity** instead of random names — so a replica can always
  find `db-0` as the primary (StatefulSets, module 01).
- **Private per-instance storage** instead of one shared volume — so
  each replica gets its own disk that stays with it across restarts
  (`volumeClaimTemplates`, module 01).
- **Ordered, one-at-a-time** creation, update, and deletion instead of
  all-at-once churn — so you never have two primaries live at once
  (StatefulSet ordering, module 01).

That's what a StatefulSet *is*: a Deployment with the scheduler's
convenient freedoms deliberately removed.

### Why "just run Postgres in a Deployment" is worse than it looks

You *can* write a Deployment with `replicas: 1`, a PVC, and a Postgres
image, and it will appear to work. It fails in the ways that matter most
and least visibly:

- **Rolling updates risk two primaries.** The default Deployment strategy
  starts the new Pod before terminating the old one. For a moment two
  Postgres processes can hold the same PVC (on the same node) or fight
  over it — a classic split-brain / corruption window. (You'd have to
  switch to the `Recreate` strategy to even make it safe-ish, and you've
  now given up rolling updates entirely.)
- **You can't scale it.** Bump `replicas` to 3 and all three Pods mount
  the *same* RWO PVC — the pattern you saw in
  [03-kubernetes module 06](../../03-kubernetes/06-storage-pv-and-pvc/README.md),
  where a second Pod on another node can't even mount it. There's no
  per-replica disk and no notion of "one is the primary."
- **No stable address.** Replicas and clients can't reliably name a
  specific instance, because Deployment Pod names are random and change.
- **No coordination.** Nothing promotes a replica when the primary dies,
  streams WAL between instances, or refuses to start a second writer.

None of these are Kubernetes bugs — they're the Deployment doing exactly
what it promises. The fix isn't to fight the Deployment; it's to use the
object built for the job (StatefulSet), and for a real database, an
**operator** on top of that to handle the coordination a StatefulSet
alone still doesn't do (module 03).

### The escape hatch: don't run it at all

There's a second, equally valid answer that this track takes seriously:
**a managed database service.** Azure runs the Postgres/SQL/Cosmos
process, the storage, the backups, the failover, and the patching; you
get a connection string. All the hardness above becomes *someone else's*
operational problem. That's not cheating — for many teams it's the correct
engineering decision, and half this track (modules 05-07) is about doing
it well and knowing when to choose it. The point of learning the
self-hosted path first is so that when you pick "managed," you're choosing
it with your eyes open, not out of fear of StatefulSets.

## Command reference

This module is mostly conceptual, but you'll observe the failure modes
directly. The relevant commands:

| Command | What it does | Example |
|---|---|---|
| `kubectl get pods -o wide` | Shows Pod names, nodes, and status — note how Deployment names churn | `kubectl get pods -o wide -w` |
| `kubectl get deploy` | Lists Deployments and their replica readiness | `kubectl get deploy` |
| `kubectl rollout restart deploy/<name>` | Forces a rolling replacement — watch two Pods coexist | `kubectl rollout restart deploy/pg-bad` |
| `kubectl get pvc` | Shows which PVCs exist and their bind status | `kubectl get pvc` |
| `kubectl scale deploy/<name> --replicas=N` | Changes replica count — the source of the shared-PVC failure | `kubectl scale deploy/pg-bad --replicas=3` |
| `kubectl describe pod <name>` | Shows scheduling/mount events when a Pod is stuck | `kubectl describe pod pg-bad-xxxx` |
| `kubectl logs <pod>` | Reads container logs — where Postgres reports a corrupt/locked data dir | `kubectl logs pg-bad-xxxx` |

Flag breakdown — `kubectl scale deploy/pg-bad --replicas=3`:
- `deploy/pg-bad` — the target Deployment (the `kind/name` shorthand).
- `--replicas=3` — desired Pod count; with one shared RWO PVC this is
  exactly what breaks, which is the point of the exercise.

## Hands-on exercises

Use a local **kind** cluster. Create and work in a namespace `stateful`:

```bash
kubectl create namespace stateful
kubectl config set-context --current --namespace=stateful
```

### 1. Establish the stateless baseline

Deploy a plain stateless web app and watch how freely Kubernetes churns
its Pods.

```yaml
# web.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: web
spec:
  replicas: 3
  selector:
    matchLabels: { app: web }
  template:
    metadata:
      labels: { app: web }
    spec:
      containers:
        - name: web
          image: nginx:1.27
```

```bash
kubectl apply -f web.yaml
kubectl get pods -o wide
```

Expected: three Pods with random suffixes. Note the names — you'll never
type them from memory because they change.

### 2. Watch random, changing identity

```bash
kubectl delete pod -l app=web
kubectl get pods -o wide
```

Expected: three *new* Pods with *different* random names appear
immediately. For a stateless app this is fine — clients reach them through
the Service, never by name. Sit with why this exact behavior would be a
disaster if these were database replicas that had to find "the primary."

### 3. Deploy Postgres the wrong way (in a Deployment)

```yaml
# pg-bad.yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: pg-bad-data
spec:
  accessModes: ["ReadWriteOnce"]
  resources:
    requests:
      storage: 1Gi
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: pg-bad
spec:
  replicas: 1
  selector:
    matchLabels: { app: pg-bad }
  template:
    metadata:
      labels: { app: pg-bad }
    spec:
      containers:
        - name: postgres
          image: postgres:16
          env:
            - name: POSTGRES_PASSWORD
              value: devpass
            - name: PGDATA
              value: /var/lib/postgresql/data/pgdata
          volumeMounts:
            - name: data
              mountPath: /var/lib/postgresql/data
      volumes:
        - name: data
          persistentVolumeClaim:
            claimName: pg-bad-data
```

```bash
kubectl apply -f pg-bad.yaml
kubectl get pods -w
```

Expected: one `pg-bad-...` Pod reaches `Running`. It *works* — a single
replica with its own PVC is fine until you try to do anything real with
it. Write a row so you have state to lose later:

```bash
POD=$(kubectl get pod -l app=pg-bad -o jsonpath='{.items[0].metadata.name}')
kubectl exec "$POD" -- psql -U postgres -c "CREATE TABLE t(x int); INSERT INTO t VALUES (1);"
kubectl exec "$POD" -- psql -U postgres -c "SELECT * FROM t;"
```

Expected: one row, `x = 1`.

### 4. Break it by scaling — the shared-PVC trap

```bash
kubectl scale deploy/pg-bad --replicas=3
kubectl get pods -o wide
```

Expected on kind (single node): the extra Pods schedule but all reference
the *same* RWO PVC. On a multi-node cluster the extra Pods would sit
`Pending` (a second node can't mount the RWO volume — the exact constraint
from
[03-kubernetes module 06](../../03-kubernetes/06-storage-pv-and-pvc/README.md)).
Even where they start, you now have multiple Postgres processes pointed at
one data directory — undefined behavior, not a 3-node database. Inspect:

```bash
kubectl describe pod -l app=pg-bad | grep -A3 -i "events\|multi-attach" || true
```

Scale back down before it does damage:

```bash
kubectl scale deploy/pg-bad --replicas=1
```

### 5. Break it by "updating" — the two-primaries window

```bash
kubectl rollout restart deploy/pg-bad
kubectl get pods -l app=pg-bad -o wide -w
```

Expected: because the default strategy is `RollingUpdate`, Kubernetes
tries to start the new Postgres Pod *before* killing the old one. Both
want the same PVC. On kind you'll typically see the new Pod stuck
`ContainerCreating` / the old one `Terminating` while they contend for the
volume; the logs of whichever loses the race show a data-dir lock error:

```bash
kubectl logs -l app=pg-bad --tail=20
```

Expected: a message about the data directory being locked / already in use
(e.g. `lock file "postmaster.pid" already exists`). That contention window
is exactly the split-brain risk a Deployment can't avoid for a database.

### 6. Diagnose-and-fix: make the Deployment at least *safe* (and see the cost)

The minimum fix for a single-replica DB-in-a-Deployment is the `Recreate`
strategy — kill the old Pod fully *before* starting the new one:

```yaml
# add under spec: in pg-bad.yaml
  strategy:
    type: Recreate
```

```bash
kubectl apply -f pg-bad.yaml
kubectl rollout restart deploy/pg-bad
kubectl get pods -l app=pg-bad -w
```

Expected: now the old Pod goes fully `Terminating` → gone, *then* the new
one starts — no two-primaries window. Verify your row survived:

```bash
POD=$(kubectl get pod -l app=pg-bad -o jsonpath='{.items[0].metadata.name}')
kubectl exec "$POD" -- psql -U postgres -c "SELECT * FROM t;"
```

Expected: `x = 1` is still there. **But notice what you gave up:** every
update now has a hard downtime gap (no old Pod while the new one boots),
you still can't have more than one replica, and there's still nothing
doing failover or replication. `Recreate` makes a single-instance DB
*safe*, not *available* — which is precisely why the next modules exist.

### 7. Contrast: what you actually want (preview)

You don't need to understand this manifest yet — apply it and observe the
difference in *identity*, which module 01 is all about.

```yaml
# ss-preview.yaml
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
        - name: c
          image: busybox:1.36
          command: ["sh","-c","sleep 3600"]
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
kubectl apply -f ss-preview.yaml
kubectl get pods -l app=db -o wide
kubectl get pvc
```

Expected: Pods named `db-0`, `db-1`, `db-2` — **stable, ordered,
predictable** names, not random hashes — and **three separate PVCs**
(`data-db-0`, `data-db-1`, `data-db-2`), one per Pod, not one shared
volume. That's the whole fix in miniature. Delete a Pod and watch it come
back with the *same* name and *same* PVC:

```bash
kubectl delete pod db-1
kubectl get pods -l app=db
```

Expected: `db-1` returns as `db-1`, re-bound to `data-db-1`.

### 8. Clean up

```bash
kubectl delete -f ss-preview.yaml
kubectl delete pvc -l app=db      # volumeClaimTemplate PVCs are NOT auto-deleted
kubectl delete -f pg-bad.yaml
kubectl delete pvc pg-bad-data
kubectl delete -f web.yaml
```

Note that deleting the StatefulSet did **not** delete its PVCs — you had
to do it explicitly. That deliberate stickiness (keeping data even when
the workload is gone) is a preview of module 01, and a cost pitfall this
whole track keeps flagging.

## Independent challenge

No manifests given — reason it through and then prove it. Take the "wrong
way" Postgres Deployment from exercise 3 and design a short written
argument, backed by commands you actually run, for a colleague who insists
"a Deployment with one replica and a PVC is a perfectly fine database."
Demonstrate at least two distinct failure modes from first principles: one
that shows up when you try to *update* the workload, and one that shows up
when you try to *scale* it. For each, capture the exact `kubectl` output
or log line that proves the problem, and then state precisely which
property of a Deployment (drawing on Deployments and PVCs from
[03-kubernetes](../../03-kubernetes/README.md) modules 03 and 06) causes
it. Finish by naming which single property of a StatefulSet would remove
each failure — you don't have to fix it yet, just name the mechanism.

<details>
<summary>Stuck? One hint</summary>

The update failure is about the default `RollingUpdate` strategy briefly
running two Pods that contend for one PVC (exercise 5); the scaling failure
is about every Deployment Pod mounting the *same* PVC rather than getting
its own (exercise 4). The StatefulSet properties that fix them are,
respectively, **ordered one-at-a-time replacement** and
**`volumeClaimTemplates`** (per-Pod storage) — both previewed in
exercise 7.

</details>

## Common mistakes & troubleshooting

- **Assuming "it started, so it's fine."** A single-replica Postgres
  Deployment runs happily right up until your first rolling update or
  scale event — the failure is latent, not immediate. "It works on my
  cluster" is not evidence it's safe.
- **Scaling a DB Deployment to get HA.** More replicas on one shared RWO
  PVC is not high availability — it's multiple processes fighting over one
  disk (or Pods stuck `Pending`). Real replication needs per-instance
  storage and coordination, which a bare Deployment has neither of.
- **Leaving the default `RollingUpdate` strategy on a stateful
  Deployment.** It invites the two-primaries window from exercise 5. If
  you're going to run state in a Deployment at all (you shouldn't, past a
  throwaway dev DB), `Recreate` is the *minimum* — and it costs you
  zero-downtime updates.
- **Forgetting that StatefulSet PVCs outlive the StatefulSet.** Deleting
  the StatefulSet leaves its `volumeClaimTemplate` PVCs behind on purpose
  (so you don't lose data). On Azure those become real, billing Azure
  Disks — a cost pitfall you'll meet for real in module 02.
- **Confusing "stateful" with "important."** Statefulness is a technical
  property (owns durable data + identity), not a measure of business
  value. A stateless app can be mission-critical; the point is only that
  the *scheduling rules* it needs are different.

## Checkpoint quiz

Write down your answer to each question before expanding it — checking without attempting first is the single easiest way to fool yourself into thinking you've learned this.

1. In one sentence, what is the core tension between Kubernetes' scheduler
   and stateful workloads?
2. Name two specific behaviors a Deployment promises that are features for
   a stateless web app but bugs for a database.
3. Why does scaling a single-replica Postgres Deployment to 3 replicas
   fail to give you a 3-node database?
4. What exactly goes wrong during a `RollingUpdate` of a Postgres
   Deployment, and why?
5. The `Recreate` strategy makes a single-instance DB-in-a-Deployment
   *safe*. What does it *not* give you, and what did you trade away to get
   the safety?
6. In the exercise 7 preview, what two things about the StatefulSet were
   visibly different from the Deployment, and which failure mode does each
   address?
7. Is choosing a managed database instead of running your own "cheating"?
   Justify your answer in terms of what the hardness actually is.

<details>
<summary>Show answers</summary>

1. Kubernetes' scheduler is built to treat Pods as disposable and
   interchangeable (reschedule/replace them freely), while stateful
   workloads need the opposite: stable identity and stable, private
   storage that stays bound to a specific instance.
2. Any two of: random/changing Pod names; rolling updates that run two
   Pods at once; rescheduling Pods to any node in any order; every Pod
   from the template mounting the *same* PVC.
3. All three replicas reference the same RWO PVC — there's no per-replica
   disk and no primary/replica coordination, so you get multiple processes
   contending for one data directory (or Pods stuck `Pending` on a
   multi-node cluster), not three independent database nodes.
4. The default `RollingUpdate` starts the new Pod before terminating the
   old one, so two Postgres processes briefly contend for the same data
   directory/PVC — a split-brain/corruption window and a data-dir lock
   error in the logs.
5. It doesn't give you high availability, replication, failover, or
   more than one replica — and you traded away zero-downtime updates,
   because `Recreate` fully stops the old Pod before starting the new one,
   creating a downtime gap on every update.
6. The Pods had stable, ordered names (`db-0/1/2`) instead of random
   hashes — fixing the "can't find a specific instance" identity problem —
   and each Pod got its own PVC via `volumeClaimTemplates` — fixing the
   shared-storage/scaling problem.
7. No. The hardness is real operational work (stable identity, private
   storage, coordination, failover, backups, patching). A managed service
   doesn't make that work vanish — it moves it to the cloud provider,
   which for many teams is the correct engineering trade. Choosing it
   knowingly (as this track teaches) is engineering, not avoidance.

</details>

## Next

[01-statefulsets-in-depth](../01-statefulsets-in-depth/README.md) — you've
seen the tension and the shape of the fix; now go deep on the object that
implements it: stable identity, headless Services, ordered operations, and
per-Pod storage.
