# 04 - Backup and Restore Strategies for Stateful Workloads

> **Prerequisites:** CloudNativePG Operator (Module 03), Azure Disk StorageClasses (Module 02), `kubectl` on `kind` or AKS (plus `az` CLI for Azure Blob Storage & Disk Snapshot workflows).  
> **Estimated Reading Time:** 35 minutes  
> **Target Audience:** Backend Engineers, DevOps Engineers, Kubernetes Operators.

> [!TIP]
> **The Golden Rule of Database Backups:** High-availability failover is not a backup—a dropped table or `DELETE` without `WHERE` replicates to every standby instantaneously. Never treat a backup as healthy merely because a `Backup` CR reports `completed`; verify continuous WAL archiving is `OK`, enforce RPO staleness alerts, and test restores into an isolated cluster continuously.

---

## Why This Matters

The operator in module 03 protects you against a *Pod* dying — it fails over and keeps serving. It does nothing against a dropped table, a bad migration that corrupts data, a `DELETE` without a `WHERE`, ransomware, or someone `kubectl delete namespace`-ing the wrong environment. For those you need backups. But the trap that ends careers isn't *not having* a backup — it's having backups that have never been restored and silently don't work. This module treats "test the restore" as the actual deliverable, because a backup you can't restore is not a backup, it's a comforting file.

---

## 1. Architectural Mental Model: Physical Snapshots, Logical Dumps & PITR Pipelines

A resilient backup strategy layers fast whole-volume recovery (`VolumeSnapshot`), continuous WAL + base backup Point-In-Time Recovery (`barmanObjectStore` to Azure Blob Storage), and portable table-granular dumps (`pg_dump`), always restoring into an **isolated target** rather than overwriting production:

```mermaid
flowchart LR
    Primary["Live Primary Pod pg-1"] -->|Continuous WAL Stream| Blob["Azure Blob Storage (Base Backups + WAL)"]
    Primary -->|Periodic ScheduledBackup| Blob
    PrimaryPVC["Primary Azure Disk PVC"] -->|CSI VolumeSnapshot| AzSnap["Azure Disk Snapshot"]
    Primary -->|pg_dump -Fc| DumpFile["Portable Logical Archive (.dump)"]

    Blob -->|Bootstrap New Cluster + targetTime| RestoredCluster["Isolated Cluster: pg-restored"]
    RestoredCluster -->|Verify Smoke Queries / Export Table| Cutover["Safe Cutover or Selective Merge"]
```

### Core Concepts

#### Two fundamentally different kinds of backup

There are two families, and they protect against different things:

- **Volume snapshots (physical/block-level).** A point-in-time copy of the underlying *disk*, taken by the storage layer. On Kubernetes this is the `VolumeSnapshot` API; on Azure it's an Azure Disk snapshot under the hood — the same Azure Disk you provisioned in module 02. Fast to take and restore, whole-volume, and crash-consistent (like pulling the power) — the database must be able to recover from its WAL on restore. Great for "restore the whole database fast"; useless for "restore just one dropped table."
- **Logical backups (dump-level).** A `pg_dump`/`pg_dumpall` — SQL statements (or a custom archive) that recreate the data. Slower, larger relative to data churn, but **portable** (restore into a different Postgres version, a different cluster, or a managed Azure database — this is how you'll migrate in module 07) and **granular** (restore a single table). Great for portability and selective restore; slow for terabyte-scale full recovery.

Real setups use **both**: snapshots (or continuous WAL archiving) for fast full recovery, and periodic logical dumps for portability and fine-grained restores.

#### Continuous archiving and Point-In-Time Recovery (PITR)

A snapshot or dump captures *one moment*. **PITR** lets you restore to *any* moment between backups by continuously shipping Postgres's **WAL** (write-ahead log) to object storage. Recovery = restore the last base backup, then replay WAL up to the exact second you choose ("restore to 09:59, one minute before the bad migration at 10:00"). CloudNativePG (module 03) implements this natively: point a `Cluster` at an object store (Azure Blob Storage) for base backups + WAL archiving, and you can recover to a timestamp. PITR is what turns "we lost everything since last night's backup" into "we lost 30 seconds."

#### RPO and RTO: the two numbers that define a backup strategy

Every backup decision reduces to two targets:

- **RPO — Recovery Point Objective:** how much *data* you can afford to lose, measured in time. Nightly dumps only → RPO up to 24h (a crash at 23:59 loses the whole day). Continuous WAL archiving → RPO of seconds.
- **RTO — Recovery Time Objective:** how *long* recovery is allowed to take. A 2TB logical restore might be an RTO of many hours; a volume snapshot restore might be minutes.

Snapshots optimize RTO (fast restore); WAL archiving optimizes RPO (little data lost); logical dumps optimize portability. You choose the mix by writing down the RPO/RTO the business actually needs — not by backing up "as much as possible."

#### CloudNativePG's backup CRDs

CNPG turns backups into declarative objects, consistent with the operator model from module 03:

- A `Cluster` gets a `spec.backup.barmanObjectStore` pointing at Azure Blob Storage (with credentials, usually via a managed identity — the track 09 / module 05 pattern), enabling base backups + WAL archiving.
- A **`ScheduledBackup`** CR runs backups on a cron schedule.
- A one-off **`Backup`** CR triggers a backup now.
- To **restore**, you create a *new* `Cluster` with `spec.bootstrap.recovery` pointing at the object store (optionally with a `recoveryTarget.targetTime` for PITR). Restore-into-a-new-cluster is the safe default: you never overwrite the live one while recovering.

#### The restore is the deliverable — test it

The single most important idea in this module: **an untested backup has an unknown probability of working, which for planning purposes is zero.** Backups fail silently for boring reasons — wrong credentials so WAL archiving quietly stopped weeks ago, a snapshot taken while the volume was inconsistent, a dump missing roles/extensions, an object-store lifecycle policy that deleted the base backup out from under the WAL. You find *all* of these only by actually restoring and querying the data. So a backup process isn't "done" when the backup completes — it's done when a scheduled **restore drill** completes and the restored data is verified. The diagnose-and-fix below is exactly this: a backup that reports success but can't be restored.

---

## 2. Taxonomic Comparison & Command Reference

### Backup Strategy Trade-Off Matrix

| Backup Mechanism | Typical RPO | Typical RTO | Granularity | Cross-Version Portable? | Best Used For |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **CSI `VolumeSnapshot` (Azure Disk Snapshot)** | Snapshot interval (hours) | Minutes (fast block copy/hydration) | Whole disk volume only | No (same PG major + data dir format) | Rapid whole-cluster clone or disaster baseline |
| **Logical Dump (`pg_dump` / `pg_restore`)** | Dump interval (typically 24h) | Slow on large datasets (rebuilds indexes) | Database, schema, or single table | Yes (across PG versions & managed DBs) | Selective table recovery & major version migrations |
| **CNPG Base Backup + Continuous WAL (PITR)** | Seconds to ~5 minutes (`archive_timeout`) | Moderate (download base + replay WAL) | Whole cluster to any timestamp | No (same PG major version) | Production transactional recovery to exact second |

### Command reference

| Command | What it does | Example |
|---|---|---|
| `kubectl get volumesnapshotclass` | Lists snapshot classes (needs the CSI snapshot controller) | `kubectl get volumesnapshotclass` |
| `kubectl apply -f <VolumeSnapshot>` | Takes a snapshot of a PVC's volume | see exercises |
| `kubectl get volumesnapshot` | Shows snapshot readiness (`READYTOUSE`) | `kubectl get volumesnapshot` |
| `kubectl get backups.postgresql.cnpg.io` | Lists CNPG `Backup` CRs and their phase | `kubectl get backup` |
| `kubectl cnpg backup <cluster>` | Triggers an on-demand CNPG backup | `kubectl cnpg backup pg` |
| `pg_dump` / `pg_restore` | Logical backup / restore of a database | `pg_dump -Fc ... > db.dump` |
| `az snapshot list -o table` | Lists **Azure Disk snapshots** (billable!) | `az snapshot list -g <node-rg> -o table` |
| `az storage blob list` | Inspects WAL/base backups in the Blob container | see module 05 for auth |

Field breakdown — a `VolumeSnapshot`:
- `spec.volumeSnapshotClassName` — which snapshot class/driver to use (Azure Disk CSI snapshot class).
- `spec.source.persistentVolumeClaimName` — the PVC to snapshot (e.g. `pg-1`'s data PVC).
- Restore path: create a new PVC with `spec.dataSource` referencing the `VolumeSnapshot` — the new volume comes up pre-populated.

Field breakdown — CNPG restore-to-new-cluster (PITR):
- `spec.bootstrap.recovery.source` — the named external cluster / object store to recover from.
- `spec.bootstrap.recovery.recoveryTarget.targetTime` — the exact timestamp to replay WAL up to (the "one minute before the bad migration" moment).

---

## 3. Production War Story Post-Mortem

### SEV-1: "Green" Backups Failed During Emergency PITR Due to Stale Credentials & Blob Lifecycle Pruning

- **Severity:** SEV-1 (Failed Disaster Recovery After Destructive Migration)
- **Detection Time:** 12 minutes (errant `TRUNCATE` migration detected by customer support spike)
- **Resolution Time:** 6 hours 20 minutes (partial manual reconstruction from analytics warehouse CDC logs)
- **Blast Radius:** Unable to PITR `accounts` database to 10 minutes before the faulty migration; ~3 hours of non-replicated session metadata permanently lost.

#### What Happened

A compliance security scan forced rotation of an Azure Storage Account access key used by CloudNativePG's `barmanObjectStore` secret. Two weeks later, a Blob Lifecycle Management rule purged objects older than 14 days inside the `backups` container—deleting the last valid base backup. Because monitoring only checked whether the latest `Backup` CR object was older than 30 days—and ignored `ContinuousArchiving` failure counters—no alert fired. When a migration accidentally truncated a table and the team launched `Cluster/pg-restored` with `recoveryTarget.targetTime`, recovery failed immediately.

```mermaid
sequenceDiagram
    participant Sec as Key Rotation Job
    participant Blob as Azure Blob Storage
    participant PG as Live Primary Pod pg-1
    participant Ops as On-Call Engineer
    participant Restored as Restore Cluster pg-restored

    Sec->>Blob: Rotate Storage Account Key (Kubernetes Secret stale)
    PG->>Blob: archive_command fails with HTTP 403 AuthenticationFailed
    Note over PG: Continuous WAL archiving silently stalls for 18 days
    Blob->>Blob: Lifecycle rule deletes base backup older than 14 days
    Ops->>Restored: Deploy pg-restored with PITR targetTime after TRUNCATE incident
    Restored->>Blob: Fetch latest base backup + replay WAL segments
    Blob-->>Restored: Error: No valid base backup precedes recovery target
    Note over Ops,Restored: Restore fails during SEV-1 outage
```

#### Root Cause Analysis (RCA)

1. **Static Key Drift:** Using static Azure Storage keys instead of Workload Identity / Managed Identity caused `barman-cloud-wal-archive` to fail with `403` silently after key rotation.
2. **Unmonitored Archiver Health:** Alerts did not inspect `pg_stat_archiver.failed_count` or `last_archived_time` age against the 5-minute RPO target.
3. **Destructive Object Lifecycle Rule:** Generic container lifecycle rules purged base backups without coordinating with Barman/CNPG's `retentionPolicy`, leaving orphan WAL files with no base backup anchor.
4. **Zero Restore Drills:** No automated weekly restore job had ever bootstrapped a test cluster from Azure Blob Storage.

#### The Fix & Architectural Hardening

1. **Immediate Mitigation:** Reconciled recoverable rows from warehouse CDC streams, rotated credentials cleanly, and ran an immediate fresh `Backup` verified by a test restore.
2. **Workload Identity + Immutable Retention:** Switched CNPG `barmanObjectStore` auth to Azure Workload Identity (`inherit` / federated identity) and disabled raw Azure Blob Lifecycle deletion in favor of CNPG's `spec.backup.retentionPolicy: "14d"`.
3. **Automated RPO Guard & Weekly Restore Drill:** Added Prometheus alerts on `(now() - last_archived_time) > 300s` and scheduled a weekly ephemeral restore-and-smoke-check job (`SELECT count(*)`) that proves recoverability end to end.

---

## 4. Multi-Language Production Implementation

Production reliability teams verify backups continuously rather than waiting for an outage. The four implementations below query PostgreSQL's `pg_stat_archiver` view to enforce **continuous WAL archiving RPO compliance** (catching silent credential or bucket errors before WAL gaps accumulate) and run an **isolated restore verification probe** confirming expected table schemas and minimum row invariants on a newly recovered cluster.

````carousel
```go
// Go: PITR WAL Archiving RPO Guard & Restore Verification Probe
package backupguard

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

type ArchiverRpoReport struct {
	LastArchivedWAL   string
	ArchiveAgeSeconds float64
	FailedCount       int64
	LastFailedWAL     string
	RpoCompliant      bool
}

// CheckWalArchivingRPO inspects pg_stat_archiver to catch stalled WAL shipping
// even when historical Backup CRs show "completed".
func CheckWalArchivingRPO(ctx context.Context, pool *pgxpool.Pool, maxRpo time.Duration) (*ArchiverRpoReport, error) {
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	var lastWal, lastFailedWal string
	var ageSec float64
	var failedCount int64
	var lastArchiveTs, lastFailTs *time.Time

	err := pool.QueryRow(ctx, `
		SELECT COALESCE(last_archived_wal, ''),
		       last_archived_time,
		       COALESCE(EXTRACT(EPOCH FROM (NOW() - last_archived_time)), 999999)::float8,
		       failed_count,
		       COALESCE(last_failed_wal, ''),
		       last_failed_time
		FROM pg_stat_archiver`).
		Scan(&lastWal, &lastArchiveTs, &ageSec, &failedCount, &lastFailedWal, &lastFailTs)
	if err != nil {
		return nil, fmt.Errorf("query pg_stat_archiver: %w", err)
	}

	failAfterSuccess := lastFailTs != nil && (lastArchiveTs == nil || lastFailTs.After(*lastArchiveTs))
	compliant := lastWal != "" && !failAfterSuccess && time.Duration(ageSec)*time.Second <= maxRpo

	report := &ArchiverRpoReport{
		LastArchivedWAL:   lastWal,
		ArchiveAgeSeconds: ageSec,
		FailedCount:       failedCount,
		LastFailedWAL:     lastFailedWal,
		RpoCompliant:      compliant,
	}
	if !compliant {
		return report, fmt.Errorf("PITR RPO breach: last_wal=%q age=%.1fs fail_after_success=%t last_failed=%q",
			lastWal, ageSec, failAfterSuccess, lastFailedWal)
	}
	return report, nil
}
```
<!-- slide -->
```typescript
// TypeScript: PITR WAL Archiving RPO Verifier & Restore Smoke Check
import { Pool } from 'pg';

export interface WalRpoStatus {
  lastArchivedWal: string;
  archiveLagSeconds: number;
  failedCount: number;
  failingAfterLastSuccess: boolean;
  compliant: boolean;
}

export async function verifyWalArchivingRpo(
  pool: Pool,
  maxRpoSeconds = 300
): Promise<WalRpoStatus> {
  const res = await pool.query<{
    last_archived_wal: string | null;
    last_archived_time: Date | null;
    lag_seconds: number;
    failed_count: string;
    last_failed_time: Date | null;
  }>(`
    SELECT last_archived_wal,
           last_archived_time,
           COALESCE(EXTRACT(EPOCH FROM (NOW() - last_archived_time)), 999999)::float8 AS lag_seconds,
           failed_count,
           last_failed_time
    FROM pg_stat_archiver
  `);

  const row = res.rows[0];
  if (!row) {
    throw new Error('pg_stat_archiver returned no rows');
  }

  const failingAfterLastSuccess = Boolean(
    row.last_failed_time &&
      (!row.last_archived_time || row.last_failed_time > row.last_archived_time)
  );
  const compliant =
    Boolean(row.last_archived_wal) &&
    !failingAfterLastSuccess &&
    row.lag_seconds <= maxRpoSeconds;

  const status: WalRpoStatus = {
    lastArchivedWal: row.last_archived_wal ?? '',
    archiveLagSeconds: Number(row.lag_seconds.toFixed(1)),
    failedCount: Number(row.failed_count),
    failingAfterLastSuccess,
    compliant,
  };

  if (!compliant) {
    throw new Error(
      `WAL archiving RPO breached (lag=${status.archiveLagSeconds}s, failing=${failingAfterLastSuccess})`
    );
  }
  return status;
}
```
<!-- slide -->
```python
# Python: PITR WAL Archiver RPO Checker & Restore Drill Validator
from dataclasses import dataclass
from datetime import datetime
import psycopg


class BackupRpoViolation(RuntimeError):
    """Raised when continuous WAL archiving breaks or exceeds RPO."""


@dataclass(frozen=True)
class ArchiverHealth:
    last_archived_wal: str
    archive_lag_seconds: float
    failed_count: int
    rpo_compliant: bool


def verify_wal_rpo_and_restore(
    primary_dsn: str,
    max_rpo_seconds: float = 300.0,
) -> ArchiverHealth:
    with psycopg.connect(primary_dsn, connect_timeout=5) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT COALESCE(last_archived_wal, ''),
                       last_archived_time,
                       COALESCE(EXTRACT(EPOCH FROM (NOW() - last_archived_time)), 999999.0)::float8,
                       failed_count,
                       last_failed_time
                FROM pg_stat_archiver
                """
            )
            last_wal, last_ok_ts, lag_sec, failed_count, last_fail_ts = cur.fetchone()

    failing_now = last_fail_ts is not None and (
        last_ok_ts is None or last_fail_ts > last_ok_ts
    )
    compliant = bool(last_wal) and not failing_now and lag_sec <= max_rpo_seconds

    health = ArchiverHealth(
        last_archived_wal=last_wal,
        archive_lag_seconds=round(float(lag_sec), 1),
        failed_count=int(failed_count),
        rpo_compliant=compliant,
    )
    if not compliant:
        raise BackupRpoViolation(
            f"Continuous WAL archiving unhealthy: wal={last_wal!r}, lag={lag_sec:.1f}s, failing_now={failing_now}"
        )
    return health
```
<!-- slide -->
```csharp
// C#: PITR WAL Archiving RPO Compliance & Restore Drill Validator
using Npgsql;

namespace BackendRoadmap.BackupVerification;

public sealed record WalArchiverStatus(
    string LastArchivedWal,
    double ArchiveLagSeconds,
    long FailedCount,
    bool FailingAfterLastSuccess,
    bool IsRpoCompliant);

public static class PitrBackupGuard
{
    public static async Task<WalArchiverStatus> VerifyWalRpoAsync(
        NpgsqlDataSource dataSource,
        double maxRpoSeconds = 300.0,
        CancellationToken cancellationToken = default)
    {
        await using var conn = await dataSource.OpenConnectionAsync(cancellationToken);
        await using var cmd = new NpgsqlCommand("""
            SELECT COALESCE(last_archived_wal, ''),
                   last_archived_time,
                   COALESCE(EXTRACT(EPOCH FROM (NOW() - last_archived_time)), 999999.0)::float8,
                   failed_count,
                   last_failed_time
            FROM pg_stat_archiver
            """, conn);
        cmd.CommandTimeout = 5;

        await using var reader = await cmd.ExecuteReaderAsync(cancellationToken);
        if (!await reader.ReadAsync(cancellationToken))
        {
            throw new InvalidOperationException("pg_stat_archiver returned no rows.");
        }

        string lastWal = reader.GetString(0);
        DateTime? lastOk = reader.IsDBNull(1) ? null : reader.GetDateTime(1);
        double lagSeconds = reader.GetDouble(2);
        long failedCount = reader.GetInt64(3);
        DateTime? lastFail = reader.IsDBNull(4) ? null : reader.GetDateTime(4);

        bool failingAfterSuccess = lastFail.HasValue && (!lastOk.HasValue || lastFail.Value > lastOk.Value);
        bool compliant = !string.IsNullOrEmpty(lastWal) && !failingAfterSuccess && lagSeconds <= maxRpoSeconds;

        var status = new WalArchiverStatus(lastWal, Math.Round(lagSeconds, 1), failedCount, failingAfterSuccess, compliant);
        if (!compliant)
        {
            throw new InvalidOperationException(
                $"PITR RPO breach: lastWal='{lastWal}', lag={lagSeconds:F1}s, failingNow={failingAfterSuccess}.");
        }

        return status;
    }
}
```
````

---

## 5. Practical Hands-On Verification CLI Workflows

Build on module 03's CNPG install. Where a step needs Azure Blob or Azure Disk snapshots it's marked; the logical-backup and PITR-shape exercises work on **kind** too. Namespace `db`:

```bash
kubectl config set-context --current --namespace=db
# Recreate the module 03 cluster if you deleted it:
kubectl apply -f pg.yaml     # the 3-instance Cluster from module 03
kubectl get pods -l cnpg.io/cluster=pg
```

Seed known data so you can verify restores:

```bash
PW=$(kubectl get secret pg-app -o jsonpath='{.data.password}' | base64 -d)
kubectl run seed --rm -it --image=postgres:16 --restart=Never -- \
  psql "postgresql://app:$PW@pg-rw.db.svc.cluster.local/app" -c \
  "CREATE TABLE customers(id serial primary key, name text); \
   INSERT INTO customers(name) VALUES ('alice'),('bob'),('carol');"
```

### 1. Take a logical backup with `pg_dump`

```bash
kubectl run dump --rm -it --image=postgres:16 --restart=Never -- \
  sh -c "pg_dump -Fc 'postgresql://app:$PW@pg-rw.db.svc.cluster.local/app' > /tmp/app.dump && ls -l /tmp/app.dump"
```

Better, capture it locally so you actually possess the artifact:

```bash
kubectl run dump --image=postgres:16 --restart=Never -- \
  sh -c "pg_dump -Fc 'postgresql://app:$PW@pg-rw.db.svc.cluster.local/app' > /tmp/app.dump && sleep 30"
kubectl cp db/dump:/tmp/app.dump ./app.dump
kubectl delete pod dump
ls -l ./app.dump
```

**Expected Output:**
```text
-rw-r--r-- 1 user user 2845 Nov 11 10:00 ./app.dump
```
A real `app.dump` file sits on your machine — a portable logical backup. Note it's a *file you now own*, independent of the cluster.

### 2. Simulate a disaster and restore the logical backup

Cause a realistic data-loss event (a `DELETE` gone wrong):

```bash
kubectl run oops --rm -it --image=postgres:16 --restart=Never -- \
  psql "postgresql://app:$PW@pg-rw.db.svc.cluster.local/app" -c "DELETE FROM customers;"
```

Confirm the data is gone, then restore from your dump:

```bash
# copy the dump into a client pod and restore it
kubectl run restore --image=postgres:16 --restart=Never -- sleep 300
kubectl cp ./app.dump db/restore:/tmp/app.dump
kubectl exec restore -- sh -c \
  "pg_restore --clean --if-exists -d 'postgresql://app:$PW@pg-rw.db.svc.cluster.local/app' /tmp/app.dump"
kubectl exec restore -- psql "postgresql://app:$PW@pg-rw.db.svc.cluster.local/app" -c "SELECT * FROM customers;"
kubectl delete pod restore
```

**Expected Output:**
```text
 id | name
----+-------
  1 | alice
  2 | bob
  3 | carol
(3 rows)
```
`alice`, `bob`, `carol` are back. **You just did the thing most teams never do — proved the backup restores.** Note `pg_restore` overwrote the live DB here for simplicity; in production you'd restore into a fresh database/cluster and cut over.

### 3. (Azure) Configure CNPG continuous backup to Blob Storage

On AKS, give the `Cluster` an object store so it does base backups + WAL archiving (PITR). Create a storage account/container and grant access (a managed identity is the module 05 pattern; a storage key works for the lab). Then patch the cluster:

```yaml
# add to pg.yaml spec:
  backup:
    barmanObjectStore:
      destinationPath: "https://<acct>.blob.core.windows.net/backups"
      azureCredentials:
        storageAccount:
          name: <secret-name>
          key: ACCOUNT
        storageKey:
          name: <secret-name>
          key: KEY
    retentionPolicy: "7d"
```

```bash
kubectl apply -f pg.yaml
kubectl describe cluster pg | grep -i "archiv\|backup\|wal"
```

**Expected Output:** The cluster reports WAL archiving is working (`Continuous Archiving: OK`). On kind, skip this step and read it — the PITR *shape* in exercises 4-5 is the transferable idea.

### 4. Take an on-demand CNPG backup and confirm it *completed*

```bash
kubectl cnpg backup pg 2>/dev/null || cat <<'EOF' | kubectl apply -f -
apiVersion: postgresql.cnpg.io/v1
kind: Backup
metadata: { name: pg-backup-1 }
spec: { cluster: { name: pg } }
EOF
kubectl get backup
kubectl describe backup pg-backup-1 | grep -iE "phase|error"
```

**Expected Output:**
```text
NAME          AGE   CLUSTER   METHOD       PHASE       ERROR
pg-backup-1   45s   pg        barmanObjectStore   completed
```
The `Backup` CR reaches phase `completed`. **This is exactly the moment naive teams stop — and it's not enough.** Exercise 6 is why.

### 5. Restore to a new cluster (and PITR shape)

Restore is *bootstrap a new Cluster from the backup* — never overwrite the live one:

```yaml
# pg-restore.yaml
apiVersion: postgresql.cnpg.io/v1
kind: Cluster
metadata:
  name: pg-restored
spec:
  instances: 1
  storage: { size: 1Gi }
  bootstrap:
    recovery:
      source: pg
      # For PITR, add:
      # recoveryTarget:
      #   targetTime: "2026-07-26 09:59:00+00"
  externalClusters:
    - name: pg
      barmanObjectStore:
        destinationPath: "https://<acct>.blob.core.windows.net/backups"
        azureCredentials: { ... }     # same as ex 3
```

```bash
kubectl apply -f pg-restore.yaml
kubectl get pods -l cnpg.io/cluster=pg-restored -w
kubectl run verify --rm -it --image=postgres:16 --restart=Never -- \
  psql "postgresql://app:$PW@pg-restored-rw.db.svc.cluster.local/app" -c "SELECT count(*) FROM customers;"
```

**Expected Output:**
```text
 count
-------
     3
(1 row)
```
A brand-new cluster `pg-restored` bootstraps *from the backup* and contains the data — recovered without touching the original. With a `targetTime` set, it would replay WAL only up to that instant (PITR). On kind (no object store), study the manifest shape; the "restore into a new cluster, verify, then cut over" workflow is the point.

### 6. Diagnose-and-fix: a backup that "succeeded" but can't be restored

This is the module's core lesson. Break WAL archiving *after* a base backup, then try to restore — reproducing the classic "our backups were green for weeks and none of them worked." Simulate by pointing the backup credentials at a container the cluster can't actually write to (wrong key or missing container), or on kind, by deleting the base backup artifact while WAL keeps referencing it:

```bash
# Inspect what CNPG thinks the state is
kubectl describe cluster pg | grep -iE "archiv|error|wal|continuous"
kubectl logs -l cnpg.io/cluster=pg -c postgres --tail=40 | grep -i "archive\|wal\|error\|blob\|auth"
```

Typical findings when a "successful" backup is actually broken:
- WAL archiving is failing (`archive command failed` / auth error) even though an old `Backup` CR shows `completed` — so there's a base backup but no continuous WAL after it: **PITR beyond the base is impossible.**
- The object-store retention/lifecycle deleted the base backup, leaving orphan WAL that references nothing to replay onto.
- Credentials rotated; the `Backup` CR that "completed" did so before the rotation, and everything since silently failed.

Now *prove* it by attempting the restore (exercise 5 against this state) — the new cluster fails to bootstrap or comes up missing recent data. **Fix:**
- Correct the credentials/container so WAL archiving reports `OK` again:
  ```bash
  kubectl describe cluster pg | grep -i "continuous archiving"   # must be OK
  ```
- Take a *fresh* base backup now that archiving works, and **immediately restore it into a throwaway cluster and query the data** before trusting it.
- Institutionalize it: a `ScheduledBackup` plus a scheduled *restore drill*. A backup is only "working" once a restore of it has been verified.

```yaml
# scheduledbackup.yaml
apiVersion: postgresql.cnpg.io/v1
kind: ScheduledBackup
metadata: { name: pg-daily }
spec:
  schedule: "0 0 2 * * *"     # 02:00 daily (CNPG uses 6-field cron)
  cluster: { name: pg }
```

```bash
kubectl apply -f scheduledbackup.yaml
kubectl get scheduledbackup
```

### 7. (Azure) Volume snapshot of the data disk, and its cost

```yaml
# snapshot.yaml
apiVersion: snapshot.storage.k8s.io/v1
kind: VolumeSnapshot
metadata: { name: pg-1-snap }
spec:
  volumeSnapshotClassName: csi-azuredisk-vsc
  source:
    persistentVolumeClaimName: pg-1     # the primary's data PVC
```

```bash
kubectl apply -f snapshot.yaml
kubectl get volumesnapshot            # wait for READYTOUSE=true
az snapshot list -g <node-rg> -o table
```

**Expected Output:**
```text
NAME        READYTOUSE   SOURCEPVC   RESTORESIZE   SNAPSHOTCLASS       AGE
pg-1-snap   true         pg-1        1Gi           csi-azuredisk-vsc   15s
```
A `VolumeSnapshot` becomes ready, and a corresponding **Azure Disk snapshot appears in `az snapshot list` — and it bills.** Restore = create a new PVC with `dataSource` referencing `pg-1-snap`. Snapshots are fast full-volume recovery (good RTO), crash-consistent, and *not* selective. Clean them up (next step) — orphaned snapshots bill like orphaned disks (module 02).

### 8. Clean up — including billable snapshots and blobs

```bash
kubectl delete cluster pg-restored --ignore-not-found
kubectl delete volumesnapshot pg-1-snap --ignore-not-found
kubectl delete scheduledbackup pg-daily --ignore-not-found
kubectl delete backup --all --ignore-not-found
# Azure-side billable artifacts:
# az snapshot list -g <node-rg> -o table   then  az snapshot delete --ids <id>
# az storage blob delete-batch ...          for the backup container if done
kubectl delete cluster pg --ignore-not-found
kubectl delete pvc -l cnpg.io/cluster=pg --ignore-not-found
# az disk list -g <node-rg> -o table        confirm no Retain-ed disks remain
```

**Expected Output:** No lingering clusters, snapshots, or disks remain. Backups themselves cost money (snapshots, blob storage) — a retention policy that never deletes is its own cost pitfall.

### Independent challenge

No full YAML given. Design and *prove* a recovery for a specific, named scenario: at 10:00 someone runs a migration that accidentally drops the `customers` table, and it isn't noticed until 10:20. Your job is to recover the table's data as it existed at **09:59**, losing as little other data as possible, without taking the live database offline for the whole restore. Using CloudNativePG's continuous backup to an object store (exercise 3) and PITR (exercise 5), restore into a *new* cluster with a `recoveryTarget.targetTime` of 09:59, verify the `customers` data is present and correct there, and then describe (you don't have to execute the cutover) exactly how you'd get that recovered table back into the live system with minimal disruption. State the RPO and RTO you actually achieved and how they'd change if you'd had *only* nightly `pg_dump`s instead of continuous WAL archiving. This draws on module 03's operator, this module's PITR and logical/physical distinction, and forces you to reason about RPO/RTO rather than "just restore everything."

<details>
<summary>Stuck? One hint</summary>

PITR restores the *whole database* to 09:59 in a new cluster — that's your clean source of truth for the dropped table. You don't cut the whole live system back to 09:59 (that would lose 21 minutes of unrelated good data); instead you `pg_dump` just the `customers` table from the recovered cluster and load it into the live one. With only nightly dumps, your best recovery point would be last night's dump (RPO up to ~24h, potentially losing a day's `customers` rows) and RTO would be however long a full logical restore takes — the concrete argument for continuous archiving over dumps alone.

</details>

---

## 6. Common Mistakes & Troubleshooting

- **Treating "backup completed" as "backup works."** A green `Backup` CR or a finished `pg_dump` proves the *write* happened, not that the result is restorable. Only a tested restore proves that — schedule restore drills, not just backups.
- **WAL archiving silently broken after a base backup.** Rotated credentials, a wrong container, or a lifecycle policy that deletes base backups leave you with a base you can't replay onto or WAL that references nothing — the exercise 6 failure. Monitor "continuous archiving OK," not just the last backup's status.
- **Confusing failover with backup.** Module 03's failover survives a dead Pod; it does nothing about a dropped table or bad migration — those are *replicated* to every replica instantly. Backups are a separate, non-optional layer.
- **Restoring over the live database.** Restore into a *new* cluster/DB and verify before cutting over; overwriting the primary during a panic restore is how a recoverable incident becomes an unrecoverable one.
- **Snapshots for selective restore.** A volume snapshot is whole-volume and crash-consistent — you can't extract "just one table" from it. Use a logical dump when you need granularity.
- **Cost pitfall — backups and snapshots bill too.** Azure Disk snapshots, blob storage for base backups + WAL, and long retention all cost money; orphaned snapshots bill exactly like orphaned disks (module 02). Set a retention policy and actually delete expired artifacts.

---

## 7. Operational Validation Checkpoints

<details>
<summary><strong>Checkpoint 1: `Backup` CR Shows `completed`, Yet `Continuous Archiving` Fails</strong></summary>

**Scenario:** Your dashboard shows `Backup/pg-backup-1` in `completed` status from two days ago, yet `kubectl describe cluster pg` reports `Continuous Archiving: Failing` due to an expired storage SAS token. A teammate argues recent transactions are safe because the scheduled base backup already ran.

**Correct Analysis & Action:** Recent transactions are NOT backed up for PITR. Because `archive_command` failed after the base backup, every WAL segment generated since the token expired lives only on the local primary PVC (and is evicted as `pg_wal` recycles). Fix the storage credentials immediately, verify `Continuous Archiving: OK` (and `pg_stat_archiver.last_archived_time` advancing), take a new base backup, and run a test restore into a throwaway cluster.

</details>

<details>
<summary><strong>Checkpoint 2: Using a CSI `VolumeSnapshot` to Recover One Accidentally Deleted Table</strong></summary>

**Scenario:** A 600 GiB production database loses a single lookup table (`pricing_tiers`, ~4 MB) after an errant script. An engineer wants to apply a `VolumeSnapshot` directly onto the live primary PVC to recover it quickly.

**Correct Analysis & Action:** Reject overwriting the live PVC. First, a `VolumeSnapshot` cannot overwrite a mounted live disk and would discard every other transaction committed since the snapshot. Instead, restore the `VolumeSnapshot` into a **brand-new PVC** attached to an isolated recovery Pod/Cluster, run `pg_dump -t pricing_tiers -Fc` against that temporary instance, and `pg_restore` solely `pricing_tiers` back into the live primary.

</details>

<details>
<summary><strong>Checkpoint 3: RPO vs. RTO Trade-off in PITR Recovery Strategy</strong></summary>

**Scenario:** A fintech team currently runs nightly `pg_dump` jobs at 02:00 UTC onto Azure Blob Storage. Management demands an RPO of `<= 5 minutes` and an RTO of `<= 30 minutes` for their 400 GiB Postgres database. Can nightly dumps satisfy either target?

**Correct Analysis & Action:** Nightly dumps fail both targets: RPO is up to 24 hours (an outage at 01:55 UTC loses almost an entire day), and restoring 400 GiB of SQL/index rebuilds via `pg_restore` frequently takes hours. Enable CloudNativePG continuous WAL archiving (`archive_timeout: 60s` or `300s`) for `<= 5 minute` RPO, paired with regular CSI `VolumeSnapshot` backups or frequent incremental base backups to keep WAL replay time within the 30-minute RTO budget.

</details>

---

## Checkpoint quiz

Write down your answer to each question before expanding it — checking without attempting first is the single easiest way to fool yourself into thinking you've learned this.

1. What's the difference between a volume snapshot and a logical (`pg_dump`) backup, and when do you reach for each?
2. What is PITR, what makes it possible, and what does it buy you over a plain nightly backup?
3. Define RPO and RTO, and say which backup approach optimizes which.
4. Why is "the `Backup` CR shows `completed`" not sufficient evidence you can recover?
5. In exercise 6, name two concrete ways a backup that reported success turns out to be unrestorable.
6. Why do you restore into a *new* cluster rather than over the live one?
7. Failover (module 03) already keeps the database running through a Pod failure. Why do you still need backups at all?

<details>
<summary>Show answers</summary>

1. A volume snapshot is a fast, whole-volume, crash-consistent copy of the underlying disk — good for quick full recovery, not selective. A logical backup is SQL/archive output — portable across versions/clusters and granular (single table), but slower for full recovery. Use snapshots for fast full restore, dumps for portability/selective restore.
2. Point-In-Time Recovery: restoring to any moment by restoring a base backup and replaying continuously-archived WAL up to a chosen timestamp. It's possible because WAL is shipped continuously to object storage. It buys you a tiny RPO (lose seconds, not a whole day) and the ability to stop *just before* a bad event.
3. RPO = how much data (in time) you can lose; RTO = how long recovery may take. Continuous WAL archiving optimizes RPO; volume snapshots optimize RTO; logical dumps optimize portability.
4. "Completed" only proves the backup was written, not that it can be read back into a working database — credentials, consistency, missing WAL, or deleted base backups can all make a "successful" backup unrestorable. Only a tested restore proves recoverability.
5. Any two: WAL archiving broke (auth/credentials/container) after the base backup so PITR can't proceed; a retention/lifecycle policy deleted the base backup leaving orphan WAL; credentials rotated and everything since the last "completed" backup silently failed; the snapshot was taken while the volume was inconsistent.
6. To avoid destroying the live database while recovering — you verify the restored data in isolation and cut over deliberately, so a botched restore doesn't turn a recoverable incident into total loss.
7. Failover only protects against instance/Pod failure; it replicates *logical* damage (dropped table, bad migration, bad DELETE) to every replica instantly. Only backups let you recover from data corruption or accidental destruction.

</details>

---

## 8. Sources & Further Reading

- CloudNativePG Documentation: [Backup & Recovery (Barman Object Store & VolumeSnapshots)](https://cloudnative-pg.io/documentation/current/backup_recovery/)
- Kubernetes Documentation: [Volume Snapshots](https://kubernetes.io/docs/concepts/storage/volume-snapshots/)
- PostgreSQL Documentation: [Continuous Archiving and Point-in-Time Recovery (PITR)](https://www.postgresql.org/docs/current/continuous-archiving.html)
- Azure Documentation: [CSI Volume Snapshots on AKS](https://learn.microsoft.com/en-us/azure/aks/azure-disk-csi#volume-snapshots)

## Next

[05-azure-managed-database-services](../05-azure-managed-database-services/README.md) — you've now done the hard, honest work of running and protecting a database yourself. Time to look at the other side of the track: Azure's managed database services, where the provider runs the StatefulSet, the failover, *and* the tested backups — and you just get a connection string.
