# Capstone Project

This is the last module of the track. There's no new concept section, no
command reference, no quiz, no independent challenge, and no cumulative
review — the goal is to combine everything from modules 00-07 into one real
piece of work that only *building it* can teach. The deliverable is not a
running database; it's a running database **on both paths** plus an honest
written comparison you could only write having done both.

Treat this as a project, not a checklist of isolated exercises. The two
paths depend on the skills you built in order — StatefulSets and storage
(00-02), the operator (03), tested backup/restore (04), managed
provisioning and passwordless auth (05), the decision framework (06), and
migration/connection resilience (07) — and the whole point is that the
comparison at the end is grounded in what you actually experienced, not
what a blog post told you.

## Why this matters

Every prior module taught one side of a skill; this is where you find out
whether you can hold the *whole* thing in your head at once — run a
stateful database properly on Kubernetes, protect it with a restore you've
actually tested, stand up the managed alternative the modern passwordless
way, and then say, with evidence, which one you'd choose and why. That last
part is the real professional skill: not "I can run Postgres on Kubernetes"
and not "I can click a Flexible Server into existence," but "I have run the
same application both ways and I can defend the trade-off to a senior
engineer." Teams get this decision wrong constantly because almost nobody
has honestly done both. After this capstone, you will have.

## The project

Take one small application that needs exactly one Postgres database (a
simple REST API over an `orders` or `notes` table is plenty — reuse
something from an earlier track's capstone if you like) and run it **two
ways against the same schema and app code**, changing only how it reaches
its database.

**Path A — self-hosted on Kubernetes.** Run the database as a
StatefulSet-based cluster via the CloudNativePG operator (module 03) on a
real AKS cluster, with its per-instance volumes dynamically provisioned on
**Azure Disk** through a StorageClass you chose deliberately (module 02),
and a **tested backup/restore cycle** (module 04) — a backup that you prove
restorable by actually restoring it into a new cluster and querying the
data, not just a backup that reports success.

**Path B — managed on Azure.** Run the *same* application against an Azure
Database for PostgreSQL Flexible Server, **provisioned with Terraform**
(module 05, using the track 09 patterns), connected with a **managed
identity and no password** (Workload Identity + Entra token, module 05) —
no connection-string secret anywhere in the manifests.

Then write the comparison that this whole track was building toward.

Build it roughly in this order — each step leans on the previous one
actually working:

1. **Stand up the app and its schema** so it's identical across both paths
   (same migrations, same queries). The app must connect through the
   resilient patterns from module 07 (retry/backoff with jitter), because
   Path A *will* fail over and you want that to be a non-event.
2. **Path A: provision the storage layer** — an AKS cluster (reuse track
   09's Terraform), and an Azure Disk StorageClass sized and reclaim-policy'd
   on purpose (module 02).
3. **Path A: deploy the operator and the database cluster** (module 03), a
   multi-instance CNPG `Cluster` on your Azure Disk class, and point the
   app at the operator's `-rw` endpoint.
4. **Path A: prove failover is invisible** — kill the primary (module 03)
   and show, from the app's own output, that the retry logic (module 07)
   absorbed the window.
5. **Path A: take and *test* a backup** — configure continuous backup to
   Blob storage, then restore into a *new* cluster and verify the data
   (module 04). A backup you haven't restored does not count.
6. **Path B: provision the managed database with Terraform** — a Flexible
   Server + database, Entra auth on and password auth off (module 05).
7. **Path B: connect the same app passwordlessly** — a managed identity
   federated to the app's ServiceAccount, a Postgres role for it, and the
   app reaching the server with an Entra token and no stored secret
   (module 05).
8. **Optionally migrate real data between the paths** (module 07) — move
   your seeded `orders` data from Path A into Path B with a verified
   cutover (count + checksum), to prove the two paths hold the same data.
9. **Write the comparison** (below) — the actual deliverable.
10. **Tear both paths down** and confirm nothing is left billing.

### Acceptance criteria

Work through these in order; each depends on the previous ones genuinely
working, not just existing.

- [ ] The same application code and schema run against both databases,
      changing only the connection configuration — you can point it at
      Path A or Path B without touching app logic.
- [ ] **Path A:** a real AKS cluster runs a CloudNativePG `Cluster` of at
      least 3 instances, each with its own PVC dynamically provisioned on
      an **Azure Disk** StorageClass you defined (not the default) —
      `kubectl get pvc` shows one disk per instance and `az disk list`
      shows the real managed disks.
- [ ] **Path A:** the app connects to the operator's `-rw` Service (never a
      specific Pod), and you have first-hand evidence — the app's own log
      output — that killing the primary triggers a failover the app rides
      out via retry/backoff, with no lost writes.
- [ ] **Path A:** continuous backup to Azure Blob is configured, and you
      have **restored a backup into a new cluster and queried the recovered
      data** — a transcript or screenshot proving the restore worked, not
      just that a `Backup` reported `completed`.
- [ ] **Path B:** an Azure Database for PostgreSQL Flexible Server and its
      database are provisioned by **Terraform** (`terraform apply` /
      `destroy` manage them), with Entra ID auth enabled and password auth
      disabled.
- [ ] **Path B:** the app connects with **no password** — a managed
      identity (Workload Identity) federated to the app's ServiceAccount, a
      Postgres role for that identity, and an Entra token used at connect
      time. Grep your manifests and confirm there is no database password
      or connection-string secret anywhere.
- [ ] Both paths serve the same application behavior — the same endpoint
      returns the same data whichever database backs it.
- [ ] **The written comparison exists** (see below) and is grounded in what
      you actually observed, with real numbers, not generic pros/cons.
- [ ] Everything is torn down at the end and you have confirmed
      `az disk list`, `az postgres flexible-server list`, and `az aks list`
      show nothing of yours still running — no orphaned disks, no idle
      managed server, no forgotten cluster.

### The written comparison (the real deliverable)

One to two pages, structured on the module 06 framework and filled in with
what you *lived*, not what you'd guess:

- [ ] **Operational burden** — concretely, what did Path A make you do that
      Path B did not (operator install/upgrade, storage choices, backup
      configuration, verifying the restore, handling the failover)? How
      long did each take you, honestly?
- [ ] **Cost** — the fully-loaded picture from module 06: Path A's disks +
      node capacity **+ your own time**, versus Path B's tier price. Which
      was cheaper in dollars, and which was cheaper once your time is
      counted?
- [ ] **Control** — what could you do on Path A that Path B wouldn't let
      you, and — being honest — did this specific app *need* any of it?
- [ ] **Compliance / residency / lock-in** — which path would you pick if
      this data were regulated, or had to also run on-prem, and why?
- [ ] **Your recommendation** — for *this* workload, which path, on which
      dominant axis, and what single fact would flip your choice. Include
      the strongest honest argument for the path you *didn't* pick and why
      it loses here (the module 06 discipline).

If you can write that comparison from real observation, you've achieved the
thing this track exists to teach — the judgement, not just the mechanics.

### Hints

- **Do Path A first, completely, including the tested restore, before you
  start Path B.** Debugging operator storage and passwordless managed auth
  at the same time is two unfamiliar layers at once — don't. Get one path
  green, then build the other.
- **Start smaller than the acceptance criteria.** Get the app talking to a
  single-instance CNPG cluster on the *default* storage class first, prove
  the app works, then swap in your Azure Disk StorageClass and scale to 3
  instances. Get the managed server connecting with *your* Entra token
  (module 05 exercise 4) before wiring the app's Workload Identity.
- **The tested-restore is the step people fake — don't.** It's the whole
  point of module 04. Actually create the new cluster from the backup and
  run a `SELECT`. If it fails, that's the most valuable thing this capstone
  will teach you, exactly as module 04's exercise 6 warned.
- **Reuse, don't reinvent.** The AKS + Terraform provisioning is track 09
  module 06; the passwordless chain is module 05's independent challenge;
  the retry loop is module 07 exercise 5. This capstone is *integration*,
  not new discovery — lean on what you already validated.
- **Keep a resource inventory as you go** (cluster name, node RG, disk
  names, storage account, Flexible Server name, identity name) so the final
  teardown is a checklist, not an archaeology dig — and so no `Retain`ed
  Azure Disk or idle Flexible Server survives to bill you (modules 02 and
  05).
- **If the app can authenticate to the managed DB but queries fail,**
  revisit module 05's diagnose-and-fix: it's almost always network
  reachability (firewall/VNet) first, then a stale/missing token or a
  missing Postgres role for the identity.
- **If a StatefulSet/CNPG Pod is stuck `Pending`,** it's the module 01/02
  storage story: a bad StorageClass, a zone-affinity conflict from
  `Immediate` binding, or an unbound PVC. `kubectl describe pvc` and
  `describe pod` tell you which.

### Final cleanup

This is the end of the track's real-Azure-spend, and this track has *two*
independent ways to keep billing after you think you're done — handle both.

1. Confirm what you're about to delete:
   `az resource list -g <your-capstone-rg> -o table`.
2. Delete the resource group(s) holding the AKS cluster and the Flexible
   Server: `az group delete --name <rg> --yes --no-wait`.
3. **Hunt orphaned Azure Disks** (module 02's trap): any `Retain`-policy
   PVC from Path A can leave a disk billing after the cluster is gone —
   `az disk list -o table` across the node resource group and delete any
   stragglers with `az disk delete --ids <id> --yes`.
4. **Confirm the managed server is gone** (module 05's trap): `az postgres
   flexible-server list -o table` — a Flexible Server bills continuously
   and does not stop on its own.
5. Delete any Blob storage account you used for backups, and any Azure Disk
   *snapshots* from the restore test (`az snapshot list -o table`).
6. Final sweep: `az aks list -o table`, `az disk list -o table`,
   `az postgres flexible-server list -o table` all show nothing of yours.
   Three empty lists is your signal you're no longer paying for any of
   this.

## Before you move on

Once both paths are torn down, don't call this finished. Wait a few days,
then — with no notes and none of the earlier modules open — rebuild the
*harder* half from memory: an operator-run CloudNativePG cluster on a real
Azure Disk StorageClass, and a backup you restore into a fresh cluster and
verify. Rebuilding Path A cold, and noticing exactly where you stall
(configuring the StorageClass? the backup object store? the restore
bootstrap?), is the truest retention check there is — those stalls are
precisely the modules to redo. Then tear it down again and confirm the
three lists are empty.

And carry the real lesson forward: the deepest thing this track taught
isn't a `kubectl` incantation or a Terraform block — it's that "run it
yourself" and "let the platform run it" are both legitimate, and choosing
between them with evidence is the job.

This bridges directly into
[15-messaging-and-event-driven-architecture](../../15-messaging-and-event-driven-architecture/README.md).
There you'll meet stateful infrastructure of a different shape — message
brokers and event streams (Service Bus, Event Grid) — where many of the
same tensions return: durability, ordering, at-least-once delivery, and the
same self-hosted-vs-managed decision you just learned to make for
databases, now for the messaging layer that ties services together.
