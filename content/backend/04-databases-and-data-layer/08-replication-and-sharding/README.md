# Replication and Sharding: Read Replicas & Horizontal Partitioning

> [!TIP]
> **The Golden Rule:** Replicas scale **reads**; sharding scales **writes and storage**. In asynchronous leader-follower replication, replicas always experience replication lag. To guarantee a user never sees stale data after an update, enforce **Read-Your-Own-Writes (RYOW)** consistency: route reads to the primary database for 5–10 seconds after any write operation.

---

## 1. Visual Mental Model: Read/Write Split & Read-Your-Own-Writes (RYOW)

In read-heavy architectures, writes route to the primary while read queries load-balance across replicas. The RYOW router pins the specific mutating user to the primary briefly to eliminate stale read anomalies.

```mermaid
flowchart TD
    Client["Client Request"] --> Router{"Read / Write Router"}
    
    Router -- "Write (POST, PUT, DELETE)" --> Primary[("PostgreSQL Primary (Leader)\n• Accepts all writes\n• Emits WAL Stream")]
    
    Primary -->|"Async WAL Stream\n(Replication Lag: ~50ms)"| Replica1[("Read Replica 1")]
    Primary -->|"Async WAL Stream"| Replica2[("Read Replica 2")]
    
    Router -- "Read (GET)" --> CheckPin{"User recently wrote?\n(Cookie/Header: last_write_ts < 5s)"}
    
    CheckPin -- "Yes (Pin to Primary)" --> Primary
    CheckPin -- "No (Safe for Stale Read)" --> ReplicaPool{"Load Balancer\n(Round Robin)"}
    
    ReplicaPool --> Replica1
    ReplicaPool --> Replica2

    classDef primary fill:#10b981,stroke:#047857,stroke-width:2px,color:#fff;
    classDef replica fill:#3b82f6,stroke:#1d4ed8,stroke-width:2px,color:#fff;
    classDef check fill:#f59e0b,stroke:#b45309,stroke-width:2px,color:#fff;

    class Primary primary;
    class Replica1,Replica2 replica;
    class Router,CheckPin,ReplicaPool check;
```

---

## 2. Horizontal Scaling Architecture Comparison: Replication vs Sharding

| Dimension | Read Replication | Horizontal Database Sharding |
| :--- | :--- | :--- |
| **Problem Solved** | Read query volume exceeds primary CPU capacity | Total data size exceeds disk space, or write volume exceeds 1 node I/O |
| **Write Scalability** | **Zero:** All writes must funnel through the single primary | **Linear:** Writes split across $N$ independent primary shards |
| **Data Distribution** | Every node holds 100% of the entire dataset | Each shard holds a disjoint subset ($1/N$) of the data |
| **Query Complexity** | Normal SQL joins, transactions, and foreign keys work unchanged | Cross-shard joins are disabled; distributed transactions require 2PC or Sagas |
| **Failover / HA** | Promote a replica to become new primary in $<30\text{s}$ | Each shard requires its own replica set for high availability |
| **Operational Overhead** | Low to moderate | High: Requires consistent hashing, rebalancing, and shard routing proxy |

---

## 3. Production War Story: The Replication Lag Stale Profile Bug

### The Incident
A social networking platform with 5,000,000 daily active users enabled read replicas to offload 90% of database traffic. 

A user updated their account bio and avatar image:
1. `POST /v1/profile` executed an `UPDATE users SET bio = ...` on the primary database $\rightarrow$ Committed successfully.
2. The user's browser immediately redirected to `GET /v1/profile` to render the updated page.
3. The load balancer routed the `GET` request to `replica-03`.
4. Because the primary was under a burst of batch analytics writes, `replica-03` had a **1.4-second replication lag**.
5. The replica returned the *old* bio and old avatar image.
6. Believing their save had failed, the user frantically re-typed their changes and submitted the form four more times, filing a critical bug report: *"Profile updates are completely broken."*

```mermaid
sequenceDiagram
    autonumber
    actor User as User Browser
    participant API as API Server (Router)
    participant Primary as PostgreSQL Primary
    participant Replica as Read Replica (Lag: 1.4s)

    User->>API: 1. POST /v1/profile {"bio": "Senior Backend Engineer"}
    API->>Primary: UPDATE users SET bio = 'Senior Backend Engineer'
    Primary-->>API: 200 OK (Committed to Primary WAL)
    API-->>User: 200 OK (Redirecting to profile page...)
    
    User->>API: 2. GET /v1/profile (Immediately within 50ms)
    Note over API: Router routes GET to read replica pool!
    API->>Replica: SELECT bio FROM users WHERE id = 42;
    Note over Replica: Replica WAL stream is 1,400ms BEHIND Primary!<br/>Replica still has old row: bio = "Junior Developer"!
    Replica-->>API: bio = "Junior Developer"
    API-->>User: 200 OK (Renders old stale bio!)
    Note over User: User assumes application is broken!
```

### The Root Cause
1. **Unconditional Read Routing:** The API router routed all `GET` requests to replicas without tracking whether the current user had just performed a write.
2. **Replication Lag Invisibility:** The application lacked Read-Your-Own-Writes (RYOW) session stickiness.

### The Verified Fix
- **Read-Your-Own-Writes Session Pinning:** When a user executes a write operation, set an `HttpOnly` cookie or Redis timestamp: `last_write_at = now()`.
- **Router Logic:** For any read request arriving from that user within the next **5 seconds**, route the query directly to the **Primary** database. All other unmutated reads continue hitting the read replicas.

---

## 4. Multi-Language Production Implementation

### Go: Context-Aware Dual Database Router (Primary vs Replica)

```go
package main

import (
	"context"
	"database/sql"
	"errors"
	"log/slog"
	"net/http"
	"time"

	_ "github.com/lib/pq"
)

type DBCluster struct {
	Primary  *sql.DB
	Replicas []*sql.DB
	nextIdx  uint64
}

type RouterContextKey struct{}

func (c *DBCluster) GetReader(ctx context.Context) *sql.DB {
	// If context has ForcePrimary flag (from recent write), return Primary
	if force, ok := ctx.Value(RouterContextKey{}).(bool); ok && force {
		return c.Primary
	}

	// Otherwise, round-robin load balance across replicas
	if len(c.Replicas) == 0 {
		return c.Primary
	}
	idx := c.nextIdx % uint64(len(c.Replicas))
	c.nextIdx++
	return c.Replicas[idx]
}

func (c *DBCluster) GetWriter() *sql.DB {
	return c.Primary
}

// RYOWMiddleware detects recent writes via cookie and pins reader to Primary
func RYOWMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		forcePrimary := false

		if cookie, err := r.Cookie("last_write_ts"); err == nil {
			var writeTime int64
			_, _ = fmt.Sscanf(cookie.Value, "%d", &writeTime)
			// Pin to primary for 5 seconds after write
			if time.Now().Unix()-writeTime < 5 {
				forcePrimary = true
			}
		}

		ctx := context.WithValue(r.Context(), RouterContextKey{}, forcePrimary)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}
```

---

### Node.js (TypeScript): Primary/Replica Query Routing with RYOW Cookie

```typescript
import { Pool } from 'pg';
import { Request, Response, NextFunction } from 'express';

const primaryPool = new Pool({ connectionString: process.env.PRIMARY_DB_URL });
const replicaPool = new Pool({ connectionString: process.env.REPLICA_DB_URL });

export class ClusteredDB {
  static getClient(req: Request) {
    const lastWrite = req.cookies?.['last_write'];
    const now = Date.now();

    // If client wrote within the last 5,000ms, read from PRIMARY to prevent stale reads
    if (lastWrite && now - parseInt(lastWrite, 10) < 5000) {
      return primaryPool;
    }

    // Otherwise, route to Read Replica
    return req.method === 'GET' ? replicaPool : primaryPool;
  }
}

// Write Handler: Updates Primary and sets RYOW cookie
export async function updateProfileHandler(req: Request, res: Response) {
  const { userId, bio } = req.body;

  await primaryPool.query('UPDATE users SET bio = $1 WHERE id = $2', [bio, userId]);

  // Set 5-second RYOW cookie
  res.cookie('last_write', Date.now().toString(), {
    maxAge: 5000,
    httpOnly: true,
    sameSite: 'lax',
  });

  res.json({ status: 'updated' });
}
```

---

### Python: FastAPI Native Postgres Declarative Table Partitioning

```python
import asyncpg
from fastapi import FastAPI
from pydantic import BaseModel

app = FastAPI(title="Partitioned Storage API")
db_pool: asyncpg.Pool = None

@app.on_event("startup")
async def startup():
    global db_pool
    db_pool = await asyncpg.create_pool("postgresql://postgres:pass@localhost:5432/events_db")
    
    # Declarative Range Partitioning by Year
    async with db_pool.acquire() as conn:
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS audit_logs (
                id BIGSERIAL,
                created_at TIMESTAMPTZ NOT NULL,
                tenant_id TEXT NOT NULL,
                action TEXT NOT NULL,
                PRIMARY KEY (id, created_at)
            ) PARTITION BY RANGE (created_at);

            -- Sub-partition for 2026
            CREATE TABLE IF NOT EXISTS audit_logs_2026 PARTITION OF audit_logs
                FOR VALUES FROM ('2026-01-01 00:00:00') TO ('2027-01-01 00:00:00');
        """)

@app.get("/v1/audit-logs")
async def get_logs(start_date: str, end_date: str):
    # PostgreSQL performs Partition Pruning: Scans ONLY audit_logs_2026!
    query = """
        SELECT id, tenant_id, action, created_at 
        FROM audit_logs 
        WHERE created_at >= $1::timestamptz AND created_at < $2::timestamptz
        LIMIT 50;
    """
    async with db_pool.acquire() as conn:
        rows = await conn.fetch(query, start_date, end_date)
        return [dict(r) for r in rows]
```

---

## 5. Practical Hands-On Verification Matrix

### Step 1: Query Partitioned Table with Pruning Verification
Execute inside `psql` to verify partition pruning:
```sql
EXPLAIN SELECT * FROM audit_logs WHERE created_at >= '2026-06-01' AND created_at < '2026-07-01';
```
**Expected Output:**
```text
Append  (cost=0.00..25.88 rows=12 width=48)
  ->  Seq Scan on audit_logs_2026 audit_logs_1  (cost=0.00..25.88 rows=12 width=48)
        Filter: ((created_at >= '2026-06-01 00:00:00+00'::timestamptz) AND (created_at < '2026-07-01 00:00:00+00'::timestamptz))
```
*(Notice that other year partitions are completely excluded from the query plan!)*

---

## 6. Operational Verification Quizzes

<details>
<summary><b>Checkpoint 1: The Cascading Failure of Read Replica Lag</b></summary>

**Scenario:** A company's primary database processes 2,000 writes/sec. A read replica falls 45 seconds behind due to a long-running reporting query on the replica. The application load balancer continues sending user read traffic to that lagging replica. What happens?

**Correct Analysis:** Users experience severe state desynchronization (e.g. balance transfers, comments, and profile edits appear to have disappeared). More dangerously, if the replica is placed in an automatic health check group, health checkers monitoring replication delay (`EXTRACT(EPOCH FROM now() - pg_last_xact_replay_timestamp())`) must remove the lagging replica from the active pool. If the replica is evicted, all read load slams into remaining replicas, potentially triggering a cascading replica collapse.
</details>

<details>
<summary><b>Checkpoint 2: The Choice of Shard Key in High-Scale Architectures</b></summary>

**Scenario:** An architect shards an e-commerce database on `created_at` (Range Sharding by month). Within 3 weeks, Shard 1 (current month) is operating at 100% CPU and disk utilization while older shards are 99% idle. What design flaw caused this?

**Correct Analysis:** Hotspotting / Uneven Shard Distribution. Range sharding on monotonically increasing timestamps causes 100% of current writes and reads to target the single shard handling the current date. Shard keys should have high cardinality and even distribution—such as **Hash Sharding on `customer_id` or `tenant_id` (`hash(tenant_id) % num_shards`)**—so write traffic is uniformly spread across all physical shards.
</details>

<details>
<summary><b>Checkpoint 3: The Danger of Asynchronous Failover (Data Loss)</b></summary>

**Scenario:** A primary database server experiences a sudden hardware power failure. Automated orchestrator promotes the closest read replica to become the new primary. After promotion, it is discovered that 1.2 seconds of committed payments are missing. Why?

**Correct Analysis:** Asynchronous Replication Lag. In asynchronous replication, the primary commits transactions locally to its own Write-Ahead Log (WAL) and sends a success confirmation to the client *before* the WAL records are confirmed received by the replicas. If the primary crashes before WAL segments are transmitted over the network, those transactions are lost forever upon replica promotion. Zero-data-loss failover requires **Synchronous Replication (`synchronous_commit = on`)** with at least one standby replica.
</details>

---

## Download Printable Reference & Diagrams

Download the notes for each video on this page as a printable PDF, with every diagram and interview questions: [SD-E-019: Leader-Follower Replication](https://backendroadmap.com/notes/system-design/SD-E-019.pdf), [SD-E-020: Read Replicas & Replication Lag](https://backendroadmap.com/notes/system-design/SD-E-020.pdf), [SD-E-021: Multi-Leader & Leaderless Replication](https://backendroadmap.com/notes/system-design/SD-E-021.pdf), [SD-E-022: Database Sharding Fundamentals](https://backendroadmap.com/notes/system-design/SD-E-022.pdf), [SD-E-023: Range vs Hash Partitioning](https://backendroadmap.com/notes/system-design/SD-E-023.pdf), [SD-E-024: Rebalancing & Hot Partitions](https://backendroadmap.com/notes/system-design/SD-E-024.pdf), [SD-E-025: Secondary Indexes in Partitioned Data](https://backendroadmap.com/notes/system-design/SD-E-025.pdf), [SD-E-026: Postgres Table Partitioning](https://backendroadmap.com/notes/system-design/SD-E-026.pdf), [SD-E-027: Distributed ID Generation](https://backendroadmap.com/notes/system-design/SD-E-027.pdf), [SD-E-032: Distributed SQL Explained](https://backendroadmap.com/notes/system-design/SD-E-032.pdf). Each section in one file: [Phase 2, Databases (PDF)](https://backendroadmap.com/notes/system-design/Phase2_Databases_Notes.pdf).

---

## Further Reading & Sources

- [PostgreSQL Documentation: Chapter 27. High Availability, Load Balancing, and Replication](https://www.postgresql.org/docs/current/high-availability.html)
- [PostgreSQL Documentation: Table Partitioning](https://www.postgresql.org/docs/current/ddl-partitioning.html)
- [Martin Kleppmann: Designing Data-Intensive Applications (Chapter 5: Replication & Chapter 6: Partitioning)](https://dataintensive.net/)

---

## Next Steps

Advance to the next module:
[../09-olap-and-data-warehousing/README.md](../09-olap-and-data-warehousing/README.md)
Explore transactional vs analytical systems: OLTP vs OLAP, Columnar storage (Parquet, ClickHouse, BigQuery), and Change Data Capture (CDC with Debezium).
