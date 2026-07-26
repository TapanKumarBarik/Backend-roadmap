# Track 14: Databases and Stateful Workloads

Every track so far has quietly leaned on stateless thinking. Deployments,
HPAs, rolling updates, "just delete the Pod and let a new one come up" —
all of that works because the workloads didn't *care* which Pod they were
or what disk they landed on. This track is about the workloads that care:
databases, queues, anything that owns durable data and a stable identity.

You already know the pieces this builds on. From
[03-kubernetes](../03-kubernetes/README.md) you can bind a PVC to a
PersistentVolume and you've met StorageClasses and dynamic provisioning
(module 06). From [07-aks](../07-aks/README.md) you can run a real,
billable cluster on Azure. From
[09-terraform-on-azure](../09-terraform-on-azure/README.md) you can
provision Azure resources declaratively — VNets, AKS, ACR, role
assignments — with one `terraform apply`. This track takes all three and
points them at the hardest problem in cluster operations: running state
correctly, and knowing when *not* to run it yourself.

The through-line is a genuine two-sided question, not a sales pitch for
either answer. Half of this track teaches you to run a production-grade
Postgres on Kubernetes properly — StatefulSets, an operator, tested
backups, failover. The other half teaches you to provision an Azure
managed database instead and connect an app to it with a managed identity
and no password. The capstone makes you build *both* and write down which
one you'd actually choose and why.

> **Cost warning — two separate ways this track bills you.** First, the
> obvious one: managed Azure database tiers (Azure Database for PostgreSQL
> Flexible Server, Azure SQL, Cosmos DB) bill *continuously* for as long
> as the server exists, whether or not any app is connected — and it's
> easy to provision a tier far larger than a learning lab needs. Second,
> the sneaky one: **dynamically-provisioned Azure Disks are real, billable
> managed disks**, and depending on a StorageClass's reclaim policy they
> can *survive* the PVC — and even the whole cluster — being deleted,
> quietly billing as orphaned disks nobody is looking at. Delete resource
> groups when done, and after any lab that provisioned storage, confirm
> with `az disk list -o table` that no stray disks are left behind.

## How this track works

- Go in order — module 01's StatefulSets assume module 00's framing of
  *why* they exist, module 03's operator assumes the StatefulSet and
  StorageClass mechanics from modules 01-02, and so on.
- Every module (except this index and the capstone) follows the same
  shape: **Why this matters → Concepts → Command reference → Hands-on
  exercises → Independent challenge → Common mistakes & troubleshooting →
  Checkpoint quiz → Next**. Two modules also carry a closed-book
  **Cumulative review** (modules 02 and 05).
- Exercises run against a real local **kind** cluster and/or **real,
  billable Azure resources**. Azure-touching exercises always end with an
  explicit cleanup step — do not skip it; this is the track where skipping
  cleanup costs money.
- Module 08 is the capstone: no quiz, no challenge — it asks you to build
  the self-hosted path *and* the managed path for the same app and compare
  them in writing.

## Modules

| # | Module | What it covers | Rough time |
|---|--------|-----------------|------------|
| 00 | [why-stateful-is-hard](00-why-stateful-is-hard/README.md) | The core tension: Kubernetes wants to reschedule Pods freely; state needs stable identity and storage. Why a database in a Deployment breaks | 45-60 min |
| 01 | [statefulsets-in-depth](01-statefulsets-in-depth/README.md) | Stable network identity, ordered deployment/scaling, `volumeClaimTemplates`, headless Services — deeper than track 03's PVC module | 75-90 min |
| 02 | [storageclasses-and-dynamic-provisioning-on-azure](02-storageclasses-and-dynamic-provisioning-on-azure/README.md) | Azure Disk vs. Azure Files, access modes, reclaim policies, provisioning the class via the Terraform patterns from track 09 | 75-90 min |
| 03 | [running-a-database-with-an-operator](03-running-a-database-with-an-operator/README.md) | CloudNativePG: CRDs, why "Postgres in a Deployment" breaks down, primary/replica, automated failover | 90 min |
| 04 | [backup-and-restore-strategies](04-backup-and-restore-strategies/README.md) | Volume snapshots vs. logical backups, PITR, and actually *testing a restore* — a backup you can't restore isn't one | 90 min |
| 05 | [azure-managed-database-services](05-azure-managed-database-services/README.md) | PostgreSQL Flexible Server, Azure SQL, Cosmos DB at survey level; connecting an app via Terraform + managed identity, no password | 75-90 min |
| 06 | [the-decision-framework](06-the-decision-framework/README.md) | Self-hosted-on-Kubernetes vs. managed-Azure: operational burden, cost, control, compliance — a genuine two-sided comparison | 60 min |
| 07 | [data-migration-and-connection-resilience](07-data-migration-and-connection-resilience/README.md) | Moving data between the two models, retry/backoff, connection pooling with PgBouncer | 90 min |
| 08 | [capstone-project](08-capstone-project/README.md) | Build both paths for one app — operator-run DB with tested backup/restore, and a Terraform-provisioned managed DB — and compare them in writing | 4-8 hours |

## Prerequisites

- Everything from [03-kubernetes](../03-kubernetes/README.md), especially
  [module 06 (PV/PVC)](../03-kubernetes/06-storage-pv-and-pvc/README.md)
  and Helm — this track goes *past* that PVC baseline, so be comfortable
  with it first.
- A working local **kind** cluster (as used from track 03 onward).
- Everything from [07-aks](../07-aks/README.md): you can create and
  operate a real AKS cluster.
- Everything from
  [09-terraform-on-azure](../09-terraform-on-azure/README.md), especially
  [module 06](../09-terraform-on-azure/06-provisioning-azure-infrastructure/README.md):
  you can provision Azure resources, role assignments, and managed
  identities declaratively.
- An active Azure subscription (already confirmed for this curriculum).

Start here → [00-why-stateful-is-hard/README.md](00-why-stateful-is-hard/README.md)

[Back to main curriculum](../README.md)
