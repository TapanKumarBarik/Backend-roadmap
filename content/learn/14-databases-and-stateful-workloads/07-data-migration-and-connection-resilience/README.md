# 07 - Data Migration and Connection Resilience

> **Prerequisites:** Completed Modules 03–06 (CloudNativePG cluster `pg` in namespace `db`, Azure Database for PostgreSQL Flexible Server from Module 05, `kubectl` and `psql` client tooling).  
> **Estimated Reading Time:** 40 minutes  
> **Target Audience:** Backend Engineers, SREs, Database Engineers, Kubernetes Developers.

> [!TIP]
> **The Golden Rule of Migrations & Connection Resilience:** Copying data is only half the migration—never cut over traffic until source writes are frozen (or drained via logical replication) and target row counts plus deterministic checksums match 100%, keep the source read-only until a rollback window passes, and never point an AKS Pod fleet straight at Postgres without PgBouncer and bounded exponential backoff with jitter.

---

## Why This Matters

Modules 03–06 gave you two homes for a database and a framework for choosing between them—but a decision on paper is worthless if you can't actually *move* the data from one to the other, and an app that can't survive the failover windows you measured in Module 03 will page you every time a primary moves. This module closes both gaps: migrating data between self-hosted and managed Postgres, and the client-side resilience—retry/backoff and connection pooling—that turns a database blip into a sub-second hiccup instead of an outage. This is the difference between "the database is highly available" and "the *application* is highly available," which are not the same thing.

---

## 1. Architectural Mental Model: Connection Multiplexing & Zero-Loss Cutover

Resilient database architecture separates **application concurrency** from **Postgres backend processes** via PgBouncer while pairing **logical replication** with a **checksum-gated cutover**:

```mermaid
flowchart LR
    subgraph Fleet["AKS Application Fleet (100+ Pods)"]
        AppA["Pod 1 (Retry + Exp Backoff + Jitter)"]
        AppB["Pod N (Retry + Exp Backoff + Jitter)"]
    end

    subgraph Pool["Connection Multiplexing Layer"]
        PgB["PgBouncer (pool_mode=transaction, max_client_conn=1000)"]
    end

    subgraph Source["Source DB: CNPG Cluster (pg-rw)"]
        SrcPrimary["Source Primary (default_pool_size=20)"]
        Pub["Logical Publication (mig)"]
        SrcPrimary --> Pub
    end

    subgraph Target["Target DB: Azure Flexible Server"]
        Sub["Logical Subscription (Azure DMS / Native)"]
        TgtPrimary["Target Primary (Built-In PgBouncer Port 6432)"]
        Sub --> TgtPrimary
    end

    AppA -->|Short-Lived Client Sockets| PgB
    AppB -->|Short-Lived Client Sockets| PgB
    PgB -->|20 Persistent Server Conns| SrcPrimary
    Pub -->|Continuous WAL Change Stream| Sub
    SrcPrimary -.->|Shadow Checksum Parity Gate| TgtPrimary
```

### Core Concepts

#### Migrating Data Between the Two Models

Moving between self-hosted-on-Kubernetes (Modules 03–04) and Azure Flexible Server (Module 05) is, mechanically, the logical-backup workflow from Module 04 pointed at a different target—this is *why* Module 04 stressed that logical dumps are **portable** across versions and clusters:

- **Small / one-shot: dump and restore.** `pg_dump -Fc` from the source, `pg_restore` into the target. Simple, works in both directions (self-hosted → managed and back), and the same `.dump` artifact you already made in Module 04. The cost is **downtime**: the app is stopped (or read-only) from the moment you dump until the restore is verified, because anything written to the source after the dump is lost.
- **Large / low-downtime: logical replication.** Postgres publishes changes from the source and the target *subscribes*, continuously replaying them until the two are caught up; you then cut over during a tiny window. This is how you migrate a live, busy database with seconds of downtime instead of hours. **Azure Database Migration Service (DMS)** wraps this continuous logical-replication workflow for managed Azure targets.

The direction matters less than you'd think—the same tools move data *to* managed (adopting Flexible Server) and *from* managed (repatriating to self-hosted, e.g. after a Module-06 decision flips at scale). The portability of a logical dump is exactly what keeps you from being locked in.

#### The Cutover Is the Risky Part, Not the Copy

Copying data is the easy 90%. The dangerous 10% is the **cutover**: the moment you repoint the app from the old database to the new one. Get it wrong and you either lose writes (app still writing to the old DB after you migrated) or get split data (both DBs taking writes). The discipline, same spirit as Module 04's tested-restore:

1. Freeze writes to the source (read-only, or stop the app).
2. Let replication drain / take a final dump.
3. **Verify row counts and a checksum on the target** before trusting it.
4. Repoint the app's connection (a config/Secret change, or a DNS/Service change) to the new database.
5. Keep the old database intact but read-only for a rollback window before deleting it.

Never delete the source until the target has served real traffic successfully. A migration isn't done at "data copied"—it's done at "app verified on the new database and rollback window elapsed."

#### Connection Resilience: Retry with Exponential Backoff and Jitter

In Module 03 you *measured* the failover window—the seconds where `pg-rw` briefly has no primary. During that window, an app's connections fail. A resilient client doesn't crash or surface an error to the user; it **retries with exponential backoff and jitter**:

- **Retry** the failed connection/query rather than failing the request immediately—most failover windows are seconds.
- **Exponential backoff** — wait 1s, 2s, 4s, 8s… between attempts, so you don't hammer a recovering database with a thundering herd.
- **Jitter** — add randomness to each wait (`0` to `delay`, full jitter) so thousands of clients don't retry in lockstep and synchronize into repeated spikes (the thundering herd again, at scale).
- **A cap and a deadline** — max backoff (e.g. 30s) and a total timeout, so a genuinely-down database eventually surfaces an error instead of retrying forever.
- **Distinguish retryable from fatal** — a failover/timeout/serialization SQLSTATE (`57P01`, `57P03`, `08006`, `08001`, `40001`) is retryable; a syntax error (`42601`), constraint violation (`23505`), or auth failure (`28P01`) is not, and retrying it just wastes time.

This is the same resilience pattern used for any remote dependency, applied to the database connection specifically—and it's what makes Module 03's "few-second failover" invisible to users.

#### Connection Pooling: Why Raw Connections Don't Scale

Every Postgres connection is a real server-side OS process with real memory overhead (~5–10 MiB per backend plus shared state tracking). Postgres handles a *few hundred* connections well, not thousands. But a fleet of app Pods, each opening many connections (and each Pod's framework often keeping its own pool), easily blows past that—and when the limit is hit, *new connections are refused* (`FATAL: sorry, too many clients already`) and the app falls over under load even though the queries themselves are cheap. A **connection pool** sits between the app and Postgres and multiplexes many short-lived client connections onto a small number of long-lived server connections.

#### PgBouncer and Pool Modes

**PgBouncer** is the standard lightweight Postgres connection pooler. You point your apps at PgBouncer instead of at Postgres directly; PgBouncer maintains a small pool of real connections to the database and hands them out. Its pool *modes* trade efficiency against feature support:

- **Session pooling** — a server connection is tied to a client for the whole session. Safest (all features work), least efficient.
- **Transaction pooling** — a server connection is returned to the pool after each *transaction*. Far more efficient (the common production choice) but breaks session-level features (prepared statements across transactions, `SET`, advisory locks) unless the app is written for it.
- **Statement pooling** — returned after each statement; most aggressive, most restrictive (breaks multi-statement transactions).

On the managed side, Azure Flexible Server offers **built-in PgBouncer** as a toggle (port `6432`)—the same tool, run for you, consistent with Module 05's "managed does the operational work" theme. Self-hosted, you run PgBouncer as its own Deployment (often as a sidecar or a shared service) in front of your CNPG cluster. Either way, the app connects to the pooler, and the pooler protects the database from connection exhaustion—the failure you'll reproduce and fix below.

---

## 2. Taxonomic Comparison: Migration Paths, PgBouncer Modes & Error Taxonomy

### Data Migration Methods

| Strategy | Downtime Window | Cross-Version / Cross-Cloud | Operational Complexity | Rollback Safety | Ideal Use Case |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **`pg_dump -Fc` + `pg_restore`** | Minutes to hours (app frozen during copy) | High (engine-level logical archive) | Low (single CLI artifact) | High (source untouched until repoint) | Small DBs (< 50 GB), dev/lab cutovers |
| **Native Logical Replication** | Seconds (final WAL drain + verify) | High (PG 10+ across CNPG & Flexible Server) | Medium (manage slots, sequences, DDL freeze) | High (source remains read-only after cutover) | Live OLTP DBs needing near-zero downtime |
| **Azure DMS (Online Migration)** | Seconds (managed orchestration) | Targeted into Azure Flexible Server | Low-Medium (Azure portal/CLI orchestrates copy) | High (managed lag metrics & cutover step) | Large enterprise migrations into Azure |

### PgBouncer Pool Modes & Postgres SQLSTATE Retryability

| Pool Mode / Error Class | Multiplexing Behavior / SQLSTATE | Feature Impact / Retry Action |
| :--- | :--- | :--- |
| **Session Mode** | Server conn held until client disconnects | Full PG compatibility; minimal fan-out savings |
| **Transaction Mode** | Server conn returned on `COMMIT`/`ROLLBACK` | High multiplexing (1000 clients to 20 conns); breaks session `SET`, `LISTEN/NOTIFY`, cross-tx prepared statements |
| **Statement Mode** | Server conn returned after each statement | Breaks multi-statement transactions (`BEGIN ... COMMIT`) |
| **Retryable Failures** | `57P01` (admin shutdown), `57P03` (cannot connect now), `08006` (conn failure), `40001` (serialization) | **Retry** with exponential backoff + full jitter + deadline |
| **Non-Retryable (Fatal)** | `42601` (syntax error), `28P01` (invalid auth), `23505` (unique violation) | **Fail fast** immediately; retrying amplifies load without recovery |

---

## 3. Production War Story Post-Mortem: Thundering Herd Connection Storm & Split-Brain Cutover

### Incident Metadata

- **Severity:** SEV-1 (22-minute cascading API crash loop + 143 un-reconciled orders)
- **Detection Time:** 2 minutes (502 Bad Gateway spike across ingress load balancer)
- **Resolution Time:** 22 minutes (database restart + PgBouncer bypass cleanup + manual write reconciliation)
- **Impact:** Complete checkout unavailability for 22 minutes; 143 orders written to retired primary during un-frozen migration cutover

### What Happened

A 120-Pod order service connected directly to a CloudNativePG primary (`max_connections = 300`) with each Pod maintaining a 20-connection local pool (`2,400` potential sockets) and fixed `1s` retry intervals without jitter. When a routine CNPG minor-version switchover triggered an 8-second primary move, all 120 Pods simultaneously hit `57P01` and bombarded the newly promoted primary every second in lockstep, immediately exhausting `max_connections`. Panicked, the on-call engineer triggered an ad-hoc dump/restore cutover to a standby Flexible Server without putting the old CNPG primary into read-only mode first:

```mermaid
sequenceDiagram
    participant Fleet as 120 API Pods (No Jitter, No PgBouncer)
    participant CNPG as Old CNPG Primary (max_connections 300)
    participant Flex as Target Flexible Server

    Note over Fleet,CNPG: 8s CNPG failover interrupts active transactions
    Fleet->>CNPG: All 120 Pods retry 20 conns every 1.0s in lockstep
    CNPG-->>Fleet: FATAL sorry, too many clients already
    Note over CNPG,Flex: On-call runs pg_dump and pg_restore without freezing writes
    Fleet->>CNPG: 143 new orders written to Old CNPG during dump window
    Fleet->>Flex: App Deployment patched to Flex DSN without parity check
    Note over Fleet,Flex: 143 orders missing on Flex while old CNPG deleted too early
```

### Root Cause Analysis

1. **Missing Connection Multiplexer:** Allowing 120 Pods direct access to Postgres exceeded `max_connections` the moment Pods re-established idle pools simultaneously.
2. **Synchronized Retry Storm:** Fixed `1s` polling with zero jitter created a self-inflicted DDoS against the recovering primary immediately after promotion.
3. **Unfrozen Cutover & Skipped Checksum Gate:** Executing `pg_dump` while writes were still hitting the source caused 143 post-snapshot orders to vanish upon repointing.

### The Fix & Architectural Hardening

1. **Mandatory PgBouncer Layer:** Deployed PgBouncer in `transaction` mode (`max_client_conn = 2000`, `default_pool_size = 25`) in front of CNPG and enabled built-in PgBouncer (`port 6432`) on Flexible Server.
2. **Full-Jitter Bounded Exponential Backoff:** Replaced fixed retries with SQLSTATE-aware retries (`57P01`/`08006`/`40001` only), exponential backoff + full jitter, and a strict 20s deadline.
3. **Immutable Cutover Runbook:** Automated a pre-cutover gate that switches the source to `default_transaction_read_only = on`, drains logical replication lag to `0 bytes`, verifies row counts + MD5 checksum parity, and enforces a 72-hour read-only source retention window.

---

## 4. Multi-Language Production Implementation: Resilient Retry Pool + Migration Shadow Verifier

Each implementation below combines **bounded exponential backoff with full jitter**, **SQLSTATE retryability classification**, **PgBouncer transaction-mode compatibility**, and **pre-cutover shadow checksum verification**:

````carousel
```go
package resilience

import (
	"context"
	"errors"
	"fmt"
	"math/rand/v2"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

func isRetryablePgError(err error) bool {
	if err == nil || errors.Is(err, context.Canceled) {
		return false
	}
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) {
		switch pgErr.Code {
		case "57P01", "57P02", "57P03", "08001", "08006", "40001":
			return true // Admin shutdown, failover, conn failure, serialization
		default:
			return false // Syntax (42601), auth (28P01), unique violation (23505)
		}
	}
	return true // Network / EOF / dial reset during failover window
}

// NewTransactionModePool enforces stateless queries safe for PgBouncer transaction pooling.
func NewTransactionModePool(ctx context.Context, dsn string) (*pgxpool.Pool, error) {
	cfg, err := pgxpool.ParseConfig(dsn)
	if err != nil {
		return nil, err
	}
	cfg.ConnConfig.DefaultQueryExecMode = pgx.QueryExecModeSimpleProtocol // PgBouncer transaction-safe
	cfg.MaxConns = 15
	return pgxpool.NewWithConfig(ctx, cfg)
}

func ExecWithJitterRetry(ctx context.Context, maxAttempts int, fn func(context.Context) error) error {
	baseDelay := 200 * time.Millisecond
	maxDelay := 10 * time.Second
	for attempt := 0; attempt < maxAttempts; attempt++ {
		err := fn(ctx)
		if err == nil {
			return nil
		}
		if !isRetryablePgError(err) || attempt == maxAttempts-1 {
			return err
		}
		capWait := baseDelay << attempt
		if capWait > maxDelay {
			capWait = maxDelay
		}
		jittered := time.Duration(rand.Int64N(int64(capWait))) // Full jitter avoids thundering herd
		select {
		case <-time.After(jittered):
		case <-ctx.Done():
			return ctx.Err()
		}
	}
	return fmt.Errorf("exhausted %d retry attempts", maxAttempts)
}

type TableParity struct {
	RowCount int64
	QtySum   int64
	Checksum string
}

func VerifyCutoverParity(ctx context.Context, src, dst *pgxpool.Pool) error {
	const q = `SELECT count(*), coalesce(sum(qty), 0), coalesce(md5(string_agg(item, ',' ORDER BY id)), '') FROM orders`
	var s, d TableParity
	if err := src.QueryRow(ctx, q).Scan(&s.RowCount, &s.QtySum, &s.Checksum); err != nil {
		return fmt.Errorf("source parity query: %w", err)
	}
	if err := dst.QueryRow(ctx, q).Scan(&d.RowCount, &d.QtySum, &d.Checksum); err != nil {
		return fmt.Errorf("target parity query: %w", err)
	}
	if s != d {
		return fmt.Errorf("cutover parity mismatch: source=%+v target=%+v", s, d)
	}
	return nil
}
```
<!-- slide -->
```typescript
import { Pool } from "pg";

const RETRYABLE_SQLSTATES = new Set([
  "57P01", // admin_shutdown (CNPG/Flex failover)
  "57P02", // crash_shutdown
  "57P03", // cannot_connect_now
  "08001", // sqlclient_unable_to_establish_sqlconnection
  "08006", // connection_failure
  "40001", // serialization_failure
]);

function isRetryable(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const code = (err as { code?: string }).code;
  if (code && /^\d{2}[A-Z0-9]{3}$/.test(code)) {
    return RETRYABLE_SQLSTATES.has(code);
  }
  return true; // Transient socket drop / ECONNRESET during primary swap
}

export async function withJitterBackoff<T>(
  op: () => Promise<T>,
  maxAttempts = 6,
  baseMs = 200,
  capMs = 10000
): Promise<T> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await op();
    } catch (err) {
      if (!isRetryable(err) || attempt === maxAttempts - 1) throw err;
      const ceiling = Math.min(capMs, baseMs * 2 ** attempt);
      const jitterMs = Math.floor(Math.random() * ceiling); // Full jitter
      await new Promise((r) => setTimeout(r, jitterMs));
    }
  }
  throw new Error("Retry budget exhausted");
}

export interface ParityDigest {
  row_count: string;
  qty_sum: string;
  digest: string;
}

export async function verifyMigrationParity(src: Pool, dst: Pool): Promise<void> {
  const sql = `
    SELECT count(*)::text AS row_count,
           coalesce(sum(qty), 0)::text AS qty_sum,
           coalesce(md5(string_agg(item, ',' ORDER BY id)), '') AS digest
    FROM orders;`;
  const [srcRes, dstRes] = await Promise.all([
    src.query<ParityDigest>(sql),
    dst.query<ParityDigest>(sql),
  ]);
  const a = srcRes.rows[0];
  const b = dstRes.rows[0];
  if (a.row_count !== b.row_count || a.qty_sum !== b.qty_sum || a.digest !== b.digest) {
    throw new Error(`Cutover blocked: source=${JSON.stringify(a)} target=${JSON.stringify(b)}`);
  }
}
```
<!-- slide -->
```python
import random
import time
from typing import Callable, TypeVar
import psycopg

T = TypeVar("T")
RETRYABLE_SQLSTATES = {"57P01", "57P02", "57P03", "08001", "08006", "40001"}


def is_retryable_pg_error(exc: Exception) -> bool:
    sqlstate = getattr(exc, "sqlstate", None)
    if sqlstate:
        return sqlstate in RETRYABLE_SQLSTATES
    return isinstance(exc, psycopg.OperationalError)


def run_with_jitter_retry(
    operation: Callable[[], T],
    max_attempts: int = 7,
    base_delay: float = 0.25,
    max_delay: float = 15.0,
) -> T:
    for attempt in range(max_attempts):
        try:
            return operation()
        except Exception as exc:
            if not is_retryable_pg_error(exc) or attempt == max_attempts - 1:
                raise
            ceiling = min(max_delay, base_delay * (2 ** attempt))
            wait_s = random.uniform(0, ceiling)  # Full jitter prevents synchronized spikes
            time.sleep(wait_s)
    raise RuntimeError("Unreachable retry fallthrough")


def verify_cutover_parity(src_dsn: str, dst_dsn: str) -> tuple[int, int, str]:
    parity_sql = """
        SELECT count(*), coalesce(sum(qty), 0),
               coalesce(md5(string_agg(item, ',' ORDER BY id)), '')
        FROM orders;
    """
    # prepare_threshold=None ensures PgBouncer transaction-mode compatibility
    with psycopg.connect(src_dsn, prepare_threshold=None) as src, \
         psycopg.connect(dst_dsn, prepare_threshold=None) as dst:
        src_row = src.execute(parity_sql).fetchone()
        dst_row = dst.execute(parity_sql).fetchone()
    if src_row != dst_row:
        raise RuntimeError(f"Cutover aborted! Source={src_row} Target={dst_row}")
    return src_row
```
<!-- slide -->
```csharp
using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using Npgsql;

public static class ResilientMigrationClient
{
    private static readonly HashSet<string> RetryableStates =
        ["57P01", "57P02", "57P03", "08001", "08006", "40001"];

    private static bool IsRetryable(Exception ex)
    {
        if (ex is PostgresException pgEx)
            return RetryableStates.Contains(pgEx.SqlState);
        return ex is NpgsqlException; // Network / socket reset during failover
    }

    public static async Task<T> ExecuteWithJitterAsync<T>(
        Func<CancellationToken, Task<T>> operation,
        int maxAttempts = 6,
        CancellationToken ct = default)
    {
        var baseMs = 200.0;
        var capMs = 10000.0;
        for (int attempt = 0; attempt < maxAttempts; attempt++)
        {
            try
            {
                return await operation(ct);
            }
            catch (Exception ex) when (IsRetryable(ex) && attempt < maxAttempts - 1)
            {
                double ceiling = Math.Min(capMs, baseMs * Math.Pow(2, attempt));
                int jitterMs = Random.Shared.Next(0, (int)ceiling);
                await Task.Delay(jitterMs, ct);
            }
        }
        throw new TimeoutException("Database retry deadline reached.");
    }

    public static async Task VerifyCutoverParityAsync(
        NpgsqlDataSource src, NpgsqlDataSource dst, CancellationToken ct)
    {
        const string sql = """
            SELECT count(*)::bigint, coalesce(sum(qty), 0)::bigint,
                   coalesce(md5(string_agg(item, ',' ORDER BY id)), '')
            FROM orders;
            """;
        await using var sCmd = src.CreateCommand(sql);
        await using var dCmd = dst.CreateCommand(sql);
        await using var sRdr = await sCmd.ExecuteReaderAsync(ct);
        await using var dRdr = await dCmd.ExecuteReaderAsync(ct);
        await sRdr.ReadAsync(ct);
        await dRdr.ReadAsync(ct);

        var sTuple = (sRdr.GetInt64(0), sRdr.GetInt64(1), sRdr.GetString(2));
        var dTuple = (dRdr.GetInt64(0), dRdr.GetInt64(1), dRdr.GetString(2));
        if (sTuple != dTuple)
            throw new InvalidOperationException($"Cutover parity mismatch: {sTuple} vs {dTuple}");
    }
}
```
````

---

## 5. Practical Hands-On Verification CLI Workflows

### Command Reference

| Command | What it does | Example |
|---|---|---|
| `pg_dump -Fc` | Logical dump for migration (portable, Module 04) | `pg_dump -Fc "$SRC" > db.dump` |
| `pg_restore --clean --if-exists -d` | Restores a dump into the target DB | `pg_restore --clean --if-exists -d "$DST" db.dump` |
| `psql -c "CREATE PUBLICATION ..."` | Sets up logical replication on the source | `psql "$SRC" -c "CREATE PUBLICATION mig FOR ALL TABLES;"` |
| `psql -c "CREATE SUBSCRIPTION ..."` | Subscribes the target to the source (low-downtime) | `psql "$DST" -c "CREATE SUBSCRIPTION mig CONNECTION '...' PUBLICATION mig;"` |
| `SHOW max_connections;` | Postgres's hard connection ceiling | `psql -c "SHOW max_connections;"` |
| `SELECT count(*) FROM pg_stat_activity;` | Current open connections (watch it approach the ceiling) | `psql -c "SELECT count(*) FROM pg_stat_activity;"` |
| `az postgres flexible-server parameter set` | Enables built-in PgBouncer on Flexible Server | `az postgres flexible-server parameter set -g rg -s pg-flex --name pgbouncer.enabled --value true` |
| `kubectl apply -f pgbouncer.yaml` | Deploys a self-hosted PgBouncer pooler | `kubectl apply -f pgbouncer.yaml` |

#### Flag Breakdown — `pg_restore --clean --if-exists -d "$DST" db.dump`

- `--clean` — drop existing objects before recreating them (so a re-run is idempotent), rather than erroring on conflicts.
- `--if-exists` — don't error when a `--clean` drop targets something that isn't there (safe on a fresh target).
- `-d "$DST"` — the target connection string (the *new* database you're migrating into).

#### Flag Breakdown — PgBouncer Transaction-Mode Config

- `pool_mode = transaction` — return the server connection to the pool after each transaction (efficient; the common production choice).
- `max_client_conn` — how many *client* connections PgBouncer accepts (large—this is what the app fleet sees).
- `default_pool_size` — how many *server* connections PgBouncer opens to Postgres per user/db (small—this is what protects Postgres).

### Hands-On Exercises

Build on the Module 03 CNPG cluster (self-hosted) and, where marked, the Module 05 Flexible Server (managed). Namespace `db`.

```bash
kubectl config set-context --current --namespace=db
PW=$(kubectl get secret pg-app -o jsonpath='{.data.password}' | base64 -d)
SRC="postgresql://app:$PW@pg-rw.db.svc.cluster.local/app"
```

#### 1. Seed a Migration Source

```bash
kubectl run seed --rm -it --image=postgres:16 --restart=Never -- \
  psql "$SRC" -c "CREATE TABLE orders(id serial primary key, item text, qty int); \
  INSERT INTO orders(item,qty) SELECT 'item-'||g, g FROM generate_series(1,1000) g;"
kubectl run seed --rm -it --image=postgres:16 --restart=Never -- \
  psql "$SRC" -c "SELECT count(*) FROM orders;"
```

**Expected Output:**

```text
 count
-------
  1000
(1 row)
```

1000 rows—a known dataset you'll verify after migrating.

#### 2. Migrate Self-Hosted → Managed with Dump/Restore (Azure)

Dump from the CNPG cluster, restore into Flexible Server (Module 05's `$DST`). Get a managed connection string/token as in Module 05:

```bash
# from a client pod that can reach both:
kubectl run mig --image=postgres:16 --restart=Never -- sleep 600
kubectl exec mig -- sh -c "pg_dump -Fc '$SRC' > /tmp/orders.dump"
# DST built from the Flexible Server FQDN + Entra token (module 05 ex 4)
kubectl exec mig -- sh -c "pg_restore --clean --if-exists -d '<DST>' /tmp/orders.dump"
kubectl exec mig -- psql "<DST>" -c "SELECT count(*) FROM orders;"
kubectl delete pod mig
```

**Expected Output:**

```text
 count
-------
  1000
(1 row)
```

1000 rows on the managed target—the same portable `.dump` workflow from Module 04, now used to *migrate* rather than restore. On kind (no managed target), migrate between two CNPG clusters instead to practice the mechanics.

#### 3. Verify the Migration Before Trusting It

Never cut over on "it restored." Compare both sides:

```bash
echo "source:"; kubectl run v --rm -it --image=postgres:16 --restart=Never -- \
  psql "$SRC" -c "SELECT count(*), sum(qty), md5(string_agg(item,',' ORDER BY id)) FROM orders;"
echo "target:"; kubectl run v --rm -it --image=postgres:16 --restart=Never -- \
  psql "<DST>" -c "SELECT count(*), sum(qty), md5(string_agg(item,',' ORDER BY id)) FROM orders;"
```

**Expected Output:**

```text
source:
 count |  sum   |               md5
-------+--------+----------------------------------
  1000 | 500500 | 8a4f2d19c8b44c99e71e9b00f1b1a5d2
target:
 count |  sum   |               md5
-------+--------+----------------------------------
  1000 | 500500 | 8a4f2d19c8b44c99e71e9b00f1b1a5d2
```

Identical count, sum, and checksum on both. If they differ, the migration is *not* done—this verification step is the Module-04 tested-restore discipline applied to cutover.

#### 4. Low-Downtime Migration with Logical Replication (Shape)

Set up a publication on the source and a subscription on the target so new writes flow continuously:

```bash
kubectl run pub --rm -it --image=postgres:16 --restart=Never -- \
  psql "$SRC" -c "CREATE PUBLICATION mig FOR ALL TABLES;"
# On the target:
#   CREATE SUBSCRIPTION mig CONNECTION '<SRC-reachable-from-target>' PUBLICATION mig;
```

**Expected Output:**

```text
CREATE PUBLICATION
CREATE SUBSCRIPTION
```

Writes to the source `orders` table replicate to the target automatically. Insert a new row on the source and confirm it appears on the target—proving you could cut over with only a brief final-drain window instead of a long dump/restore outage. (Flexible Server supports being a logical-replication subscriber; on kind, use two CNPG clusters.)

#### 5. Add Retry/Backoff to an App Connection

Deploy a tiny app that connects in a loop *without* resilience, then break it with a failover:

```python
# resilient.py — mount into a python pod, or inline via a ConfigMap
import os, time, random, sys
import psycopg  # pip install psycopg[binary]

def connect_with_retry(dsn, attempts=8):
    delay = 1.0
    for i in range(attempts):
        try:
            return psycopg.connect(dsn, connect_timeout=3)
        except psycopg.OperationalError as e:   # retryable: failover/timeout
            wait = min(delay, 30) + random.uniform(0, 0.5)   # backoff + jitter
            print(f"attempt {i+1} failed ({e}); retrying in {wait:.1f}s", flush=True)
            time.sleep(wait)
            delay *= 2
    raise SystemExit("database unreachable after retries")

dsn = os.environ["DSN"]
while True:
    conn = connect_with_retry(dsn)
    with conn.cursor() as cur:
        cur.execute("SELECT count(*) FROM orders;")
        print("rows:", cur.fetchone()[0], flush=True)
    conn.close()
    time.sleep(2)
```

Run it against `pg-rw`, then trigger a failover (Module 03 Exercise 5) by deleting the primary Pod and watch the output.

**Expected Output:**

```text
rows: 1000
attempt 1 failed (connection failed: connection refused); retrying in 1.3s
attempt 2 failed (FATAL: the database system is starting up); retrying in 2.4s
rows: 1000
```

During the failover window the app prints `attempt N failed … retrying`, then resumes printing `rows: 1000` once `pg-rw` repoints—**the failover is invisible except for a brief pause.** That's application HA, built on top of the database HA from Module 03.

#### 6. Diagnose-and-Fix: Connection Pool Exhaustion Under Load

Reproduce the failure a pool prevents. Lower the DB's connection ceiling to make it easy to hit, then hammer it:

```bash
# See the ceiling and current usage
kubectl run c --rm -it --image=postgres:16 --restart=Never -- \
  psql "$SRC" -c "SHOW max_connections;"
# Generate many concurrent connections (each sleeps holding a connection)
for i in $(seq 1 200); do
  kubectl run load-$i --image=postgres:16 --restart=Never -- \
    psql "$SRC" -c "SELECT pg_sleep(60);" >/dev/null 2>&1 &
done
```

Now try one more connection:

```bash
kubectl run probe --rm -it --image=postgres:16 --restart=Never -- \
  psql "$SRC" -c "SELECT 1;"
```

**Expected Failure:** `FATAL: sorry, too many clients already` (or `remaining connection slots are reserved`)—the database refused a new connection because the pool of server processes is exhausted, *not* because queries were slow. Diagnose:

```bash
kubectl run c --rm -it --image=postgres:16 --restart=Never -- \
  psql "$SRC" -c "SELECT count(*), state FROM pg_stat_activity GROUP BY state;"
```

**Expected Output:**

```text
 count | state
-------+--------
   195 | idle
     5 | active
```

Connection count is pinned at `max_connections`, mostly idle/sleeping—proof it's a *connection* limit, not a compute limit. **Fix: put a pooler in front.** Deploy PgBouncer in transaction mode so hundreds of clients share a handful of server connections:

```yaml
# pgbouncer-config (essentials)
# pool_mode = transaction
# max_client_conn = 1000
# default_pool_size = 20
```

Point the app (and the load) at PgBouncer instead of `pg-rw`, repeat the load, and confirm the probe now succeeds—200 clients multiplex onto ~20 server connections, so Postgres never sees the flood. (On Flexible Server, instead just enable built-in PgBouncer: `az postgres flexible-server parameter set --name pgbouncer.enabled --value true` and point the app at the PgBouncer port `6432`.) Clean up the load Pods:

```bash
kubectl delete pod -l run --field-selector=status.phase!=Running 2>/dev/null
for i in $(seq 1 200); do kubectl delete pod load-$i --ignore-not-found >/dev/null 2>&1 & done
```

Lesson: connection exhaustion looks like a database outage but is a client-architecture problem—pooling, not a bigger database, is the fix.

#### 7. Prove the Pool Protects the Database Under a Fleet

With PgBouncer in place, re-run the 200-client load and watch `pg_stat_activity` on the *database*:

```bash
kubectl run c --rm -it --image=postgres:16 --restart=Never -- \
  psql "$SRC" -c "SELECT count(*) FROM pg_stat_activity WHERE datname='app';"
```

**Expected Output:**

```text
 count
-------
    20
(1 row)
```

Server-side connections stay small (≈ `default_pool_size`) even under hundreds of clients—the pooler absorbed the fan-out. This is why a pooler is standard in front of any Postgres serving a Pod fleet.

#### 8. Diagnose-and-Fix: A Migration Cutover That Lost Writes

Reproduce the classic cutover mistake. Migrate `orders` (dump/restore), but *don't* freeze writes on the source first—insert a new row on the source *after* the dump, then cut the app over to the target:

```bash
# after dump/restore of 1000 rows, before cutover, a write sneaks into the source:
kubectl run late --rm -it --image=postgres:16 --restart=Never -- \
  psql "$SRC" -c "INSERT INTO orders(item,qty) VALUES('LATE-ORDER',999);"
# now the app is pointed at the target, which never got this row
kubectl run chk --rm -it --image=postgres:16 --restart=Never -- \
  psql "<DST>" -c "SELECT * FROM orders WHERE item='LATE-ORDER';"
```

**Expected Output:**

```text
 id | item | qty
----+------+-----
(0 rows)
```

The `LATE-ORDER` row is **missing** on the target—a lost write, because the source kept taking writes after the point-in-time the dump captured. Diagnose with the verification from Exercise 3 (counts now differ). **Fix:** the migration procedure must freeze writes (read-only or stop the app) *before* the final dump, or use logical replication (Exercise 4) to drain in-flight writes, then verify counts match *before* repointing the app. Redo the cutover correctly and confirm counts match. Lesson: the copy is easy; the *cutover discipline* is what prevents data loss—exactly the Module-04 lesson that "it copied" isn't "it's correct."

#### 9. Clean Up

```bash
kubectl delete pod -l run --ignore-not-found 2>/dev/null || true
# remove PgBouncer, publications/subscriptions, and any load pods
kubectl delete cluster pg --ignore-not-found       # if done with self-hosted
kubectl delete pvc -l cnpg.io/cluster=pg --ignore-not-found
# az postgres flexible-server delete -g rg-mgdb-lab -n <name> --yes   # stop managed bill
# az disk list -g <node-rg> -o table                                  # confirm no orphans
```

**Expected Output:**

```text
No lingering load Pods, clusters, Flexible Servers, or orphaned Azure Disks.
```

Both a migration *source* and *target* running at once is double the bill—delete the one you're no longer using once the cutover is verified and your rollback window has elapsed.

### Independent Challenge

No full app or config given. Perform a complete, verified, low-downtime migration of a *live* database from one model to the other and prove the application survived it. Start the Module-03 CNPG cluster serving the retry/backoff app from Exercise 5 under a trickle of continuous writes. Migrate that database to a Terraform-provisioned Flexible Server (Module 05) using logical replication so writes keep flowing during the copy, verify the target matches the source with a row-count *and* checksum comparison, then cut the running app over to the managed database—repointing its connection with the app still up—and demonstrate, from the app's own output, that no writes were lost and the user-visible interruption was seconds, not minutes. Keep the old database read-only as a rollback path until you've confirmed the app is healthy on the target. This integrates Module 04's logical-dump portability, Module 05's managed target and passwordless connection, Module 03's failover-window reality, and this module's cutover discipline and retry logic—it is a rehearsal for the capstone's two-path requirement.

<details>
<summary>Stuck? One hint</summary>

The low-downtime shape is: (1) set up logical replication (publication on source, subscription on target) so the target continuously catches up while the app keeps writing to the source; (2) when replication lag is ~zero, briefly set the source read-only, let the last changes drain, and run the count+checksum verification from Exercise 3; (3) only then repoint the app's `DSN` (a Secret/ConfigMap change and Pod restart, or a Service swap) at the managed target—the retry/backoff loop from Exercise 5 absorbs the reconnect so the user sees a pause, not an error. Do *not* delete or write to the source until the app has served real traffic on the target; that read-only source is your rollback.

</details>

---

## 6. Common Mistakes & Troubleshooting

- **Treating "data copied" as "migration done."** The copy is the easy part; the cutover is where writes get lost or split (Exercise 8). Freeze writes or drain via replication, verify counts+checksum, *then* repoint—and keep the source as a rollback until the target is proven.
- **Deleting the source too early.** Until the app has served real traffic on the target and a rollback window has elapsed, the old database is your safety net. Deleting it at "copied" turns a recoverable hiccup into an unrecoverable one.
- **No retry/backoff in the app.** Without it, every Module-03 failover window surfaces as user-facing errors. With exponential backoff + jitter + a cap, the same failover is an invisible pause—but retrying *non-retryable* errors (syntax, auth) just wastes time; distinguish them.
- **Retrying in lockstep (thundering herd).** Fixed-interval retries across a fleet synchronize into repeated spikes that keep knocking a recovering database over. Jitter is not optional at scale.
- **Connecting a Pod fleet straight to Postgres.** Hundreds of Pods × per-Pod pools blow past `max_connections`, and Postgres *refuses* new connections (`too many clients already`)—an outage that looks like a DB failure but is a client-architecture problem. Put PgBouncer in front.
- **Wrong PgBouncer pool mode.** Transaction mode is efficient but breaks session-level features (cross-transaction prepared statements, `SET`, advisory locks) unless the app expects it. Match the mode to what the app actually uses, or you'll get subtle, intermittent breakage.
- **Cost pitfall — running both databases indefinitely.** During a migration you pay for *both* the source and the target. That's fine briefly; forgetting to delete the retired one after cutover is a doubled bill—and if the retired one is self-hosted, its `Retain`ed Azure Disks orphan just like Module 02 warned (`az disk list`).

---

## 7. Operational Validation Checkpoints

<details>
<summary><strong>Checkpoint 1: After enabling built-in PgBouncer (transaction mode, port 6432) on Flexible Server, your Go/Python ORM intermittently throws ERROR: prepared statement "stmt_1" does not exist. What caused this and how do you fix it?</strong></summary>

In PgBouncer `transaction` mode, consecutive queries in the same client session can be routed to different Postgres backend connections after each transaction commits. Named server-side prepared statements created on Backend A do not exist on Backend B. Fix it by disabling protocol-level named prepared statements in your client driver (e.g., `QueryExecModeSimpleProtocol` in Go `pgx`, `prepare_threshold=None` in Python `psycopg`, or `pgbouncer=true` / disabling prepared caches in ORMs) or configuring `max_prepared_statements` in PgBouncer 1.21+.

</details>

<details>
<summary><strong>Checkpoint 2: During a logical replication cutover from CNPG to Flexible Server, row counts match, yet an order inserted immediately after cutover gets duplicate key value violates unique constraint "orders_pkey". Why?</strong></summary>

PostgreSQL logical replication streams table row changes (`INSERT`/`UPDATE`/`DELETE`) but does **not** synchronize `SEQUENCE` objects (`orders_id_seq`). Consequently, the target's sequence still sits at `1` (or its initial restore value) and collides with existing primary keys when new writes begin. Fix it by explicitly advancing every sequence on the target (`SELECT setval('orders_id_seq', COALESCE((SELECT max(id) FROM orders), 1));`) during the read-only drain window before repointing traffic.

</details>

<details>
<summary><strong>Checkpoint 3: Your client wrapper catches all exceptions and retries up to 10 times with exponential backoff + jitter. During an incident, a bad migration pushes an invalid SQL syntax query that saturates worker threads for 45 seconds per request. What safeguard is missing?</strong></summary>

Error classification (distinguishing retryable transient errors from fatal errors). Retrying SQLSTATE `42601` (syntax error), `28P01` (auth failure), or `23505` (unique constraint violation) can never succeed and turns a fast client error into thread/connection exhaustion. Restrict retries strictly to transient SQLSTATEs (`57P01`, `57P02`, `57P03`, `08001`, `08006`, `40001`) and transient network dial/EOF errors.

</details>

---

## Checkpoint Quiz

Write down your answer to each question before expanding it—checking without attempting first is the single easiest way to fool yourself into thinking you've learned this.

1. Which Module-04 property of logical dumps is what makes them the tool for migrating *between* self-hosted and managed, and why?
2. What's the trade-off between dump/restore migration and logical-replication migration?
3. Walk through the safe cutover procedure. Why can't you delete the source the moment the data is copied?
4. Name the three ingredients of a resilient connection-retry strategy and what each one prevents.
5. Why does retrying a query without jitter make a recovering database's life *worse* at scale?
6. In Exercise 6, the database refused new connections even though queries were cheap. What was actually exhausted, and what's the fix—a bigger database or something else?
7. What does PgBouncer's transaction pool mode buy you, and what does it break?
8. In Exercise 8, a write was lost during cutover. What in the procedure was skipped, and what are the two ways to prevent it?

<details>
<summary>Show answers</summary>

1. Portability—a logical dump is engine-level SQL/archive output that restores across versions and clusters, so it moves data both *to* and *from* managed Postgres. A physical/volume backup (Module 04) is tied to the specific storage and can't cross into a managed service you don't control the disks of.
2. Dump/restore is simple but requires downtime (writes after the dump are lost, so the app is stopped/read-only for the whole copy+verify). Logical replication continuously streams changes so the app stays up, cutting downtime to a brief final-drain window—at the cost of more setup complexity.
3. Freeze writes on the source (read-only or stop the app) or drain via replication; take the final dump / let replication catch up; verify count+checksum on the target; repoint the app; keep the source read-only as rollback; delete it only after the app is proven on the target. You can't delete the source at "copied" because it's your only rollback if the target turns out wrong.
4. Retry (survive transient failover windows), exponential backoff (avoid hammering a recovering DB), and jitter (avoid a synchronized thundering herd)—plus a cap/deadline so a truly-down DB eventually errors instead of retrying forever.
5. Without jitter, thousands of clients retry at the same intervals and synchronize into repeated simultaneous spikes that keep overwhelming the database just as it recovers—the thundering-herd effect; randomized waits spread the load out.
6. The pool of server-side connections (`max_connections`) was exhausted—a connection limit, not compute. The fix is a connection pooler (PgBouncer) multiplexing many clients onto few server connections, not a bigger database.
7. Transaction mode returns a server connection to the pool after each transaction, so a few server connections serve many clients (high efficiency). It breaks session-level features that span transactions—cross-transaction prepared statements, `SET`, advisory locks—unless the app is written for it.
8. Writes weren't frozen on the source before the final dump, so a write after the dump's point-in-time was lost. Prevent it by (a) making the source read-only / stopping the app before the final dump, or (b) using logical replication to drain in-flight writes—and in both cases verify counts match before repointing.

</details>

---

## Next

[08-capstone-project](../08-capstone-project/README.md) — you now have every piece: run a database on Kubernetes with an operator, give it real Azure storage, back it up and *test the restore*, provision a managed alternative, choose between them deliberately, and migrate and connect resiliently. The capstone makes you build both paths for one app and write the comparison that only building both can earn you.
