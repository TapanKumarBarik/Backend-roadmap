# 03 - Running a Real Database with an Operator

## Why this matters

A StatefulSet gives a database stable identity and private storage — but it
still has no idea what a "primary," a "replica," or a "failover" is. It
won't stream WAL between Postgres instances, promote a standby when the
primary dies, or take a base backup. Someone has to encode that operational
knowledge, and doing it yourself in shell scripts and init containers is how
teams end up with a fragile, bespoke, un-upgradable mess. An **operator**
packages that knowledge as software that runs *in* your cluster. This is the
module where "Postgres on Kubernetes" stops being a science project and
becomes a defensible production choice.

## Concepts

### What an operator actually is

An **operator** is a controller plus one or more **Custom Resource
Definitions (CRDs)**. Recall the pattern from all of Kubernetes: a
controller watches objects and drives reality toward their declared spec
(a Deployment controller keeps N Pods running). An operator extends that
same loop to a *new* object type you define. Instead of `kind: Deployment`,
you write `kind: Cluster` (a Postgres cluster), and the operator's
controller — which understands Postgres — creates the StatefulSet-like
Pods, the Services, the config, the replication, and the failover logic to
make that declared cluster real. You describe *what* ("a 3-instance
Postgres 16 cluster with 20Gi Premium disks and daily backups"); the
operator handles *how*.

CRDs are the mechanism: a CRD registers a new API type
(`clusters.postgresql.cnpg.io`) so `kubectl get clusters` works just like
`kubectl get pods`. This is the same "declare desired state, a controller
reconciles" model you've used since track 03 — just extended to a
domain-specific object.

### Why not "just a StatefulSet"?

A hand-rolled Postgres StatefulSet (module 01 + 02) gets you identity and
storage, but you'd still have to build, by hand:

- **Bootstrap:** initialize the primary's data dir, create users, set up
  `pg_hba.conf` and replication slots.
- **Replication:** configure each replica to stream WAL from the current
  primary — and reconfigure them when the primary *changes*.
- **Failover:** detect a dead primary, pick the most up-to-date replica,
  promote it, and repoint everything else — without ever ending up with two
  primaries (the split-brain that corrupts data).
- **Connection routing:** give apps a stable "read-write" endpoint that
  always points at the *current* primary and a "read-only" endpoint across
  replicas.
- **Backups, restore, PITR, minor-version upgrades, certificate rotation.**

An operator ships all of that as tested, versioned code that thousands of
clusters run. Writing it yourself means owning a distributed-systems
failover algorithm as a side project — the exact thing module 00 warned
"just run Postgres in a Deployment" hand-waves away.

### CloudNativePG: the Cluster CRD

This track uses **CloudNativePG (CNPG)** — a widely used, CNCF, Postgres
operator that models a database as a single `Cluster` resource:

```yaml
apiVersion: postgresql.cnpg.io/v1
kind: Cluster
metadata:
  name: pg
spec:
  instances: 3                       # 1 primary + 2 replicas
  storage:
    size: 5Gi
    storageClass: managed-csi        # module 02's Azure Disk class
  primaryUpdateStrategy: unsupervised
```

From that one object CNPG creates: three Postgres Pods with per-instance
PVCs (the module 01/02 pattern, managed for you), streaming replication
between them, and — crucially — a set of **Services** for connecting:

- `pg-rw` — always routes to the **current primary** (read-write).
- `pg-ro` — load-balances across **replicas** (read-only).
- `pg-r` — any instance.

Your app connects to `pg-rw` and never has to know *which* Pod is primary —
CNPG repoints that Service on failover. This is the "stable endpoint for a
moving primary" problem from module 01, solved by the operator.

### Failover, promotion, and split-brain avoidance

When CNPG detects the primary is unhealthy, it runs a controlled failover:
it selects the replica with the most WAL applied, **promotes** it to
primary, updates the `pg-rw` Service to point at it, and reconfigures the
remaining replicas to stream from the new primary. The old primary, when it
comes back, rejoins as a *replica* (after re-syncing) — it is never allowed
to resume as a second primary. That last guarantee is the whole point:
avoiding two primaries is what prevents the corruption module 00 showed a
Deployment inviting on every rolling update.

`primaryUpdateStrategy: unsupervised` lets CNPG do minor-version upgrades
and node-drain failovers automatically (switch the primary, update, done);
`supervised` makes you approve the primary switch. Understanding this knob
matters for the diagnose-and-fix below, where a replica *doesn't* get
promoted the way you expect.

### The operator is itself a workload you install

The operator's controller runs as a Deployment in its own namespace
(`cnpg-system`), installed once per cluster via a manifest or Helm chart —
you met Helm in
[03-kubernetes](../../03-kubernetes/README.md). It watches all namespaces
for `Cluster` resources. So there are two layers: install the *operator*
once (cluster-wide capability), then create as many `Cluster` resources as
you want (each an actual database). Upgrading Postgres operational behavior
becomes "upgrade the operator," not "rewrite everyone's StatefulSets."

## Command reference

| Command | What it does | Example |
|---|---|---|
| `kubectl apply --server-side -f <cnpg-manifest>` | Installs the CNPG operator (CRDs + controller) | see exercises |
| `kubectl get clusters` | Lists CNPG `Cluster` CRs (a new type from the CRD) | `kubectl get clusters` |
| `kubectl describe cluster <name>` | Shows instances, primary, phase, and events | `kubectl describe cluster pg` |
| `kubectl cnpg status <name>` | (CNPG kubectl plugin) rich cluster/primary/replica status | `kubectl cnpg status pg` |
| `kubectl get pods -l cnpg.io/cluster=<name>` | The Postgres instance Pods the operator created | `kubectl get pods -l cnpg.io/cluster=pg` |
| `kubectl cnpg promote <cluster> <pod>` | Manually promote a specific replica to primary | `kubectl cnpg promote pg pg-2` |
| `kubectl get svc -l cnpg.io/cluster=<name>` | The `-rw`/`-ro`/`-r` Services CNPG manages | `kubectl get svc -l cnpg.io/cluster=pg` |
| `kubectl delete pod <primary-pod>` | Kills the primary to trigger a failover (test) | `kubectl delete pod pg-1` |

Field breakdown — the CNPG `Cluster` spec:
- `spec.instances` — total Postgres instances (1 primary + N-1 replicas);
  the operator manages their per-Pod storage and identity for you.
- `spec.storage.size` / `storage.storageClass` — feeds a
  `volumeClaimTemplate`-style per-instance PVC on your chosen class (module
  02's `managed-csi`/`db-premium`).
- `spec.primaryUpdateStrategy` — `unsupervised` (auto primary switchover on
  updates/failover) or `supervised` (you approve).
- `spec.bootstrap` — how to initialize (fresh `initdb`, or restore from a
  backup — used in module 04).

## Hands-on exercises

You can do most of this on **kind** (the operator and replication work
locally; storage falls back to kind's default class). Where a step is
Azure-specific it's marked. Use a namespace `db`:

```bash
kubectl create namespace db
kubectl config set-context --current --namespace=db
```

### 1. Install the CloudNativePG operator

```bash
# Install the operator (CRDs + controller in cnpg-system). Pin a real release tag.
kubectl apply --server-side -f \
  https://raw.githubusercontent.com/cloudnative-pg/cloudnative-pg/release-1.24/releases/cnpg-1.24.0.yaml
kubectl get pods -n cnpg-system
kubectl get crds | grep cnpg
```

Expected: a `cnpg-controller-manager` Pod `Running` in `cnpg-system`, and
CRDs like `clusters.postgresql.cnpg.io` registered. The `kubectl get
clusters` command now exists because the CRD created that API type.
(Optionally install the `kubectl cnpg` plugin via `krew` for the richer
`status` output; the exercises work without it.)

### 2. Create a 3-instance Postgres Cluster

```yaml
# pg.yaml
apiVersion: postgresql.cnpg.io/v1
kind: Cluster
metadata:
  name: pg
spec:
  instances: 3
  storage:
    size: 1Gi
    # storageClass: managed-csi     # uncomment on AKS to use an Azure Disk (module 02)
  primaryUpdateStrategy: unsupervised
```

```bash
kubectl apply -f pg.yaml
kubectl get pods -l cnpg.io/cluster=pg -w      # ctrl-c when 3/3 Running
```

Expected: the operator creates `pg-1` (bootstrapped as primary) first, then
`pg-2` and `pg-3` join as streaming replicas — the ordered bootstrap you'd
have had to script by hand. Each gets its own PVC:

```bash
kubectl get pvc
```

Expected: one PVC per instance — the module 01/02 per-Pod storage pattern,
created and managed by the operator, not by you.

### 3. See the connection Services and which Pod is primary

```bash
kubectl get svc -l cnpg.io/cluster=pg
kubectl describe cluster pg | grep -iE "primary|instances|phase"
```

Expected: `pg-rw`, `pg-ro`, `pg-r` Services, and the cluster reports a
`Primary` (e.g. `pg-1`) with 3 healthy instances. Your app would use
`pg-rw` for writes and never track the primary itself.

### 4. Write through the RW service, read through the RO service

```bash
# Get the app password the operator generated
kubectl get secret pg-app -o jsonpath='{.data.password}' | base64 -d; echo
```

```bash
# Write via the primary (pg-rw), from a throwaway psql client:
kubectl run psql --rm -it --image=postgres:16 --restart=Never -- \
  psql "postgresql://app:$(kubectl get secret pg-app -o jsonpath='{.data.password}' | base64 -d)@pg-rw.db.svc.cluster.local/app" \
  -c "CREATE TABLE t(x int); INSERT INTO t VALUES (42);"
```

```bash
# Read via a replica (pg-ro) — proves replication is streaming
kubectl run psql --rm -it --image=postgres:16 --restart=Never -- \
  psql "postgresql://app:$(kubectl get secret pg-app -o jsonpath='{.data.password}' | base64 -d)@pg-ro.db.svc.cluster.local/app" \
  -c "SELECT * FROM t;"
```

Expected: the write goes to the primary; the read from a *replica* returns
`42` — meaning the operator wired up streaming replication with zero manual
`pg_hba.conf`/replication-slot work from you.

### 5. Trigger an automatic failover and watch the primary move

```bash
PRIMARY=$(kubectl get cluster pg -o jsonpath='{.status.currentPrimary}')
echo "current primary: $PRIMARY"
kubectl delete pod "$PRIMARY"          # simulate the primary dying
kubectl get pods -l cnpg.io/cluster=pg -w   # watch, ctrl-c after failover settles
```

Then check the new primary and that writes still work:

```bash
kubectl get cluster pg -o jsonpath='{.status.currentPrimary}{"\n"}'
kubectl run psql --rm -it --image=postgres:16 --restart=Never -- \
  psql "postgresql://app:$(kubectl get secret pg-app -o jsonpath='{.data.password}' | base64 -d)@pg-rw.db.svc.cluster.local/app" \
  -c "INSERT INTO t VALUES (43); SELECT * FROM t;"
```

Expected: `status.currentPrimary` is now a *different* Pod, the `pg-rw`
Service was automatically repointed to it, and writes succeed against the
new primary — a real automated failover that a StatefulSet alone would
never perform. The old primary rejoins as a replica once it's back.

### 6. Confirm the old primary rejoined as a replica (no split-brain)

```bash
kubectl get pods -l cnpg.io/cluster=pg
kubectl describe cluster pg | grep -iE "primary|replica|instances ready"
```

Expected: 3/3 instances healthy again, exactly **one** primary, and the
formerly-dead Pod is now a streaming replica — the operator never allowed
two primaries. This is the corruption-avoidance guarantee from the
Concepts section, in action.

### 7. Scale the cluster and watch replicas join in order

```bash
kubectl patch cluster pg --type merge -p '{"spec":{"instances":4}}'
kubectl get pods -l cnpg.io/cluster=pg -w      # ctrl-c when 4/4
```

Expected: a fourth instance is created, base-backed from the primary, and
joins as another replica — declaratively, by editing one field. Scale back:
`kubectl patch cluster pg --type merge -p '{"spec":{"instances":3}}'`.

### 8. Diagnose-and-fix: a failed-over replica that won't get promoted

Set the cluster to **supervised** promotion, which changes failover
behavior in a way that surprises people who expect it to be automatic:

```bash
kubectl patch cluster pg --type merge -p '{"spec":{"primaryUpdateStrategy":"supervised"}}'
```

Now cordon/kill the primary and observe:

```bash
PRIMARY=$(kubectl get cluster pg -o jsonpath='{.status.currentPrimary}')
kubectl delete pod "$PRIMARY"
kubectl get cluster pg -o jsonpath='{.status.currentPrimary} phase={.status.phase}{"\n"}'
kubectl describe cluster pg | grep -A4 -i "switchover\|promotion\|waiting"
```

Expected symptom: for a planned primary *switchover* under `supervised`,
the operator **waits for you to approve** the promotion rather than doing
it automatically — the `-rw` endpoint can stall and a healthy replica sits
un-promoted, looking like a "stuck failover." (For an outright *crash*, an
up-to-date replica is still promoted for availability, but a replica that
is *lagging* or that hit a WAL/replication error won't be chosen — CNPG
won't promote a replica that would lose committed data.) Diagnose which
case you're in:

```bash
kubectl cnpg status pg 2>/dev/null || kubectl describe cluster pg
kubectl logs -l cnpg.io/cluster=pg --tail=30 | grep -i "promot\|lag\|wal\|switchover"
```

Fix, depending on the cause:
- If it's the `supervised` strategy waiting for approval, either promote
  the chosen replica explicitly or switch back to automatic:
  ```bash
  kubectl cnpg promote pg <replica-pod>          # explicit approval
  # or:
  kubectl patch cluster pg --type merge -p '{"spec":{"primaryUpdateStrategy":"unsupervised"}}'
  ```
- If a replica was *too far behind* to be safely promoted, the fix is not
  to force it (that loses data) — it's to let it catch up (or let the
  original primary recover). Confirm recovery:

```bash
kubectl get cluster pg -o jsonpath='{.status.currentPrimary}{"\n"}'
```

Expected: a single healthy primary again. Lesson: "the replica didn't get
promoted" is usually the operator *correctly refusing* to promote a stale
replica or *correctly waiting* for supervised approval — not a bug. Knowing
which is the whole skill.

### 9. Clean up

```bash
kubectl delete cluster pg          # deletes the DB instances
kubectl get pvc                    # per-instance PVCs may remain — check
kubectl delete pvc -l cnpg.io/cluster=pg --ignore-not-found
# On AKS, confirm no Retain-ed disks lingered (module 02):
# az disk list -g <node-rg> -o table
kubectl delete namespace db
# Optionally remove the operator:
# kubectl delete -f https://.../cnpg-1.24.0.yaml
```

Expected: the cluster and its Pods are gone. On AKS, re-check `az disk
list` per module 02's cost discipline — an operator-managed DB still leaves
real disks behind.

## Independent challenge

No CRD YAML given beyond field *names*. Install CloudNativePG on a cluster
and stand up a **two-database** setup that proves you understand the
operator/CR split: one `Cluster` named `orders` and one named `catalog`, in
separate namespaces, both served by the *single* operator you installed
once. For `orders`, use a 3-instance cluster on an Azure Disk StorageClass
from module 02 (on AKS) or the default class (on kind); for `catalog`, use
a single-instance cluster. Then run a realistic drill: identify the
`orders` primary, kill it, and *measure* — using `kubectl get cluster -w`
and timestamps — how long the `-rw` endpoint takes to point at a new
primary and accept writes again, and confirm the old primary rejoins as a
replica with no second primary ever appearing. Write down the failover
duration and one sentence on what an application connecting to `orders-rw`
would have experienced during that window (this connects to the retry/
backoff material coming in module 07). Draws on Helm/operator installation
from [03-kubernetes](../../03-kubernetes/README.md), module 02's Azure
storage, and this module's failover model.

<details>
<summary>Stuck? One hint</summary>

The operator is installed once, cluster-wide, in `cnpg-system` — you do
*not* reinstall it per database; you just create two `Cluster` CRs in two
namespaces and the one controller reconciles both (`kubectl get clusters
-A`). To measure failover time, note the timestamp when you
`kubectl delete pod <primary>` and the timestamp when
`kubectl get cluster orders -o jsonpath='{.status.currentPrimary}'` first
returns a *different* Pod and a write to `orders-rw` succeeds. The window
between is exactly what module 07's connection-retry logic exists to
absorb.

</details>

## Common mistakes & troubleshooting

- **Thinking a StatefulSet alone is "running Postgres."** A StatefulSet
  gives identity and storage; it does not stream replication, promote a
  standby, or route clients to the current primary. The operator's
  controller is what supplies that — without it you're back to scripting a
  failover algorithm yourself.
- **Connecting your app to a specific Pod instead of the `-rw` Service.**
  Hardcoding `pg-1` means the moment a failover moves the primary to
  `pg-2`, your writes break. Always use the operator's `-rw` endpoint,
  which follows the primary automatically.
- **Expecting `supervised` to fail over automatically.** Under
  `supervised`, the operator waits for you to approve a primary
  switchover — a healthy replica sitting un-promoted is the *configured*
  behavior, not a stuck cluster (exercise 8). Use `unsupervised` if you
  want hands-off failover.
- **Forcing promotion of a lagging replica.** CNPG refuses to promote a
  replica that would lose committed writes; overriding that to "unstick"
  a failover is how you lose data. Let it catch up or recover the original
  primary instead.
- **Ignoring the operator's own upgrades.** The operator is where
  failover/backup logic lives; running a long-outdated operator means
  running outdated operational behavior. Treat operator upgrades as real
  maintenance, not an afterthought.
- **Cost pitfall — an operator doesn't free you from the disk bill.** Each
  instance still gets a real Azure Disk (module 02). A 3-instance cluster
  is 3 disks; `Retain`ed, they orphan just the same. `az disk list` after
  teardown still applies.

## Checkpoint quiz

Write down your answer to each question before expanding it — checking without attempting first is the single easiest way to fool yourself into thinking you've learned this.

1. In one sentence, what is an operator, in terms of controllers and CRDs?
2. Name three specific things CloudNativePG does that a hand-written
   StatefulSet does not.
3. What are the `-rw`, `-ro`, and `-r` Services for, and which one should
   an application that writes use?
4. Walk through what CNPG does, step by step, when the primary dies under
   `unsupervised` strategy.
5. In exercise 8, you killed the primary and no replica got promoted. Give
   two distinct legitimate reasons that can happen (not a bug), and how you
   tell them apart.
6. Why is "the old primary comes back as a replica, never a second
   primary" the single most important guarantee here?
7. You installed the operator once but run five databases. How many
   operator controllers are running, and how many `Cluster` resources?

<details>
<summary>Show answers</summary>

1. An operator is a controller plus CRDs: it registers a new API type
   (e.g. `Cluster`) and runs a reconcile loop that drives real resources
   (Pods, Services, storage, replication) to match that custom object's
   declared spec — the same declare/reconcile model as built-in
   controllers, extended to a domain object.
2. Any three: bootstrap/initialize Postgres; configure streaming
   replication between instances; detect a dead primary and promote a
   replica (failover); repoint a stable RW endpoint to the current
   primary; take backups / PITR; do minor-version upgrades.
3. `-rw` routes to the current primary (writes), `-ro` load-balances
   read-only across replicas, `-r` hits any instance. An app that writes
   uses `-rw`, so it always reaches the primary even after failover moves
   it.
4. It detects the primary is unhealthy, selects the most up-to-date
   replica, promotes it to primary, repoints the `-rw` Service to it, and
   reconfigures the remaining replicas to stream from the new primary; the
   old primary later rejoins as a replica after re-syncing.
5. (a) Under `supervised` strategy it's waiting for your manual approval of
   the switchover; (b) the available replica is too far behind (lagging /
   WAL error) and CNPG refuses to promote it to avoid data loss. Tell them
   apart via `kubectl cnpg status` / describe / logs — one shows "waiting
   for approval," the other shows replication lag/WAL errors.
6. Two primaries writing to their own data would irreconcilably diverge
   (split-brain) and corrupt/lose data — exactly the failure module 00
   showed a Deployment inviting; preventing a second primary is what makes
   failover safe rather than destructive.
7. One operator controller (installed once, cluster-wide in `cnpg-system`),
   and five `Cluster` resources — one per database — all reconciled by
   that single controller.

</details>

## Next

[04-backup-and-restore-strategies](../04-backup-and-restore-strategies/README.md) —
your operator-run cluster survives a Pod dying. It does not survive a
dropped table, a bad migration, or a deleted namespace. Failover is not
backup. Next you'll take real backups — volume snapshots and logical
dumps — and, more importantly, *test restoring them*, because a backup you
haven't restored is only a hope.
