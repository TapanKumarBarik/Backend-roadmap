# Schema Design and Indexing: B-Trees, Normalization & Covering Indexes

> [!TIP]
> **The Golden Rule:** Normalize for transactional integrity (3NF); index for query execution speed. In composite B-Tree indexes `(A, B, C)`, column order matters: **equality columns must come before range columns**. Once a range filter (`>`, `<`, `BETWEEN`) is applied to column B, the B-Tree engine cannot use subsequent index columns for filtering. Use **Partial Indexes** for skewed data and **Covering Indexes (`INCLUDE`)** to eliminate heap lookups.

---

## 1. Visual Mental Model: B-Tree Index Lookup vs Sequential Table Scan

A B-Tree index maintains a self-balancing tree of sorted keys pointing directly to physical 8 KB table pages (heap blocks).

```mermaid
flowchart TD
    subgraph SequentialScan ["Full Table Scan (Without Index) — O(N) IOPS"]
        Query1["SELECT * FROM orders WHERE customer_id = 42;"] --> ReadAll["Read ALL 10,000,000 Heap Pages from Disk (30+ GB I/O)"]
        ReadAll --> FilterAll["Filter row by row in CPU RAM -> High Latency (8.5s)"]
    end

    subgraph BTreeLookup ["B-Tree Index Scan — O(log N) IOPS"]
        Query2["SELECT * FROM orders WHERE customer_id = 42;"] --> Root["Root Node (In-Memory Page)"]
        Root --> Internal["Internal Branch Page: customer_id 1..100"]
        Internal --> Leaf["Leaf Page: Pointer to exact row (Block 402, Offset 14)"]
        Leaf --> HeapFetch["Direct Heap Fetch: Read 1 Page (0.001s, <2ms)"]
    end

    classDef slow fill:#ef4444,stroke:#991b1b,stroke-width:2px,color:#fff;
    classDef fast fill:#10b981,stroke:#047857,stroke-width:2px,color:#fff;

    class ReadAll,FilterAll slow;
    class Root,Internal,Leaf,HeapFetch fast;
```

---

## 2. Normalization Rules & Index Types Matrix

### Normalization Cheat Sheet

| Normal Form | Core Requirement | Common Violation | Fix |
| :--- | :--- | :--- | :--- |
| **1NF** (Atomic Values) | No repeating groups; one atomic value per cell | Storing CSV string `tags: "tech,news,gadgets"` | Move to a dedicated `post_tags` join table |
| **2NF** (Full Dependency) | No partial dependencies on composite primary keys | In `order_items (order_id, item_id, item_name)`, `item_name` depends only on `item_id` | Move item attributes to a separate `items` table |
| **3NF** (No Transitive) | Non-key columns depend *only* on primary key | In `orders (id, customer_id, customer_email)`, `customer_email` depends on `customer_id` | Move `customer_email` to `customers` table |

---

### Index Types & Use Cases

| Index Type | Underlying Data Structure | Optimal Query Pattern | Storage / Write Overhead |
| :--- | :--- | :--- | :--- |
| **B-Tree** (Default) | Balanced multi-way search tree | Equality (`=`), range (`<`, `>`), sorting (`ORDER BY`) | Moderate write penalty; high read versatility |
| **Partial Index** | B-Tree filtered by `WHERE` clause | Skewed data (e.g. `WHERE status = 'UNPROCESSED'`) | **Tiny footprint:** Only indexes matching rows |
| **Covering Index** | B-Tree + `INCLUDE (col1, col2)` | **Index-Only Scans:** Answers query without touching heap table | Slightly larger leaf nodes, eliminates heap I/O |
| **GIN** (Generalized Inverted) | Inverted key-to-row bitmap | JSONB attributes (`@>`), full-text search, array containment | High write cost, exceptional read performance on arrays/JSON |
| **Hash Index** | Hash table | Pure equality check (`=`) | No range queries, rarely preferred over B-Tree |

---

## 3. Production War Story: The Left-Prefix Range Query Trap

### The Incident
A high-volume logistics API tracked parcel shipment updates across 1,000 enterprise tenants. Customers frequently called the tracking endpoint:
```sql
SELECT id, status, updated_at 
FROM shipments 
WHERE tenant_id = 'tenant_fedex' 
  AND updated_at >= '2026-11-01 00:00:00' 
  AND status = 'IN_TRANSIT';
```

A backend engineer created an index with the following column ordering:
`CREATE INDEX idx_shipments ON shipments (updated_at, tenant_id, status);`

During peak morning delivery scans, query latency skyrocketed from 15ms to 12.8 seconds. CPU utilization on the primary database hit 100%, and the database ran out of buffer pool memory, causing widespread API timeouts.

```mermaid
sequenceDiagram
    autonumber
    actor Client as Courier Device App
    participant DB as PostgreSQL Engine
    participant Disk as NVMe Storage

    Client->>DB: Query shipments WHERE updated_at >= '2026-11-01' AND tenant_id = 'tenant_fedex' AND status = 'IN_TRANSIT'
    Note over DB: Index begins with RANGE column: (updated_at, tenant_id, status)!<br/>Because updated_at is a range (>=), B-Tree CANNOT use tenant_id or status!
    DB->>Disk: Index Scan must inspect ALL 14,000,000 rows matching updated_at >= Nov 1!
    DB->>Disk: Performs 14,000,000 Heap Fetches to check tenant_id & status manually!
    Note over DB: Buffer Pool completely evicted by massive scan!
    DB-->>Client: 504 Gateway Timeout (12.8s execution)
```

### The Root Cause
1. **The Left-Prefix Rule & The Range Boundary:** In composite B-Trees, rows are sorted hierarchically. Because `updated_at` was placed *first* and queried with a range operator (`>=`), the B-Tree engine could only navigate to the start of the date range. For the remaining millions of entries, the engine was forced to scan every single leaf node sequentially because `tenant_id` was not sorted across different dates.
2. **Column Order Rule Violation:** Equality filter columns must **always** precede range columns.

### The Verified Fix
- **Reorder Composite Index Columns (Equality First, Range Last):**
  `CREATE INDEX idx_shipments_opt ON shipments (tenant_id, status, updated_at);`
- **Execution:** The B-Tree jumps directly to the `tenant_fedex` subtree, then to the `IN_TRANSIT` bucket, and then performs a narrow range scan on `updated_at`. Disk reads dropped from 14,000,000 to 240 rows ($<2\text{ms}$).

---

## 4. Multi-Language Production Implementation

### Go: Covering Index Creation & Index-Only Scan Execution

```go
package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"time"

	_ "github.com/lib/pq"
)

type ShipmentSummary struct {
	ID        int64     `json:"id"`
	Status    string    `json:"status"`
	UpdatedAt time.Time `json:"updated_at"`
}

type ShipmentRepository struct {
	db *sql.DB
}

// EnsureOptimizedIndexes creates a Covering Index with Equality-First ordering
func (r *ShipmentRepository) EnsureOptimizedIndexes(ctx context.Context) error {
	// (tenant_id, status) for equality lookup; updated_at for range; INCLUDE (id) for Index-Only scan
	ddl := `
		CREATE INDEX IF NOT EXISTS idx_shipments_covering 
		ON shipments (tenant_id, status, updated_at) 
		INCLUDE (id);
	`
	_, err := r.db.ExecContext(ctx, ddl)
	return err
}

func (r *ShipmentRepository) QueryActiveShipments(ctx context.Context, tenantID string, since time.Time) ([]ShipmentSummary, error) {
	// Query matches the covering index perfectly -> Achieves Index-Only Scan (Zero Heap Fetches)
	query := `
		SELECT id, status, updated_at 
		FROM shipments 
		WHERE tenant_id = $1 
		  AND status = 'IN_TRANSIT' 
		  AND updated_at >= $2
		ORDER BY updated_at DESC
		LIMIT 100;
	`
	rows, err := r.db.QueryContext(ctx, query, tenantID, since)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var results []ShipmentSummary
	for rows.Next() {
		var s ShipmentSummary
		if err := rows.Scan(&s.ID, &s.Status, &s.UpdatedAt); err != nil {
			return nil, err
		}
		results = append(results, s)
	}

	return results, nil
}
```

---

### Node.js (TypeScript): Partial Indexing for High-Performance Queues

```typescript
import { Pool } from 'pg';

export interface PendingTask {
  id: string;
  taskType: string;
  payload: Record<string, any>;
  createdAt: string;
}

export class TaskQueueRepository {
  constructor(private pool: Pool) {}

  // Partial Index: Only indexes active tasks (ignoring millions of completed ones)
  async setupPartialIndex(): Promise<void> {
    const ddl = `
      CREATE INDEX IF NOT EXISTS idx_tasks_pending_only 
      ON background_tasks (created_at) 
      WHERE status = 'PENDING';
    `;
    await this.pool.query(ddl);
  }

  // Blazing-fast poll: Examines only the tiny partial index
  async pollNextPendingTask(): Promise<PendingTask | null> {
    const query = `
      SELECT id, task_type AS "taskType", payload, created_at AS "createdAt"
      FROM background_tasks
      WHERE status = 'PENDING'
      ORDER BY created_at ASC
      FOR UPDATE SKIP LOCKED
      LIMIT 1;
    `;
    const res = await this.pool.query(query);
    return res.rows[0] || null;
  }
}
```

---

### Python: FastAPI GIN Index for Polymorphic JSONB Queries

```python
import asyncpg
from typing import List
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

app = FastAPI(title="GIN Index Optimization API")
db_pool: asyncpg.Pool = None

@app.on_event("startup")
async def startup():
    global db_pool
    db_pool = await asyncpg.create_pool("postgresql://postgres:pass@localhost:5432/catalog_db")
    
    # Create GIN (Generalized Inverted Index) for fast JSONB containment queries
    async with db_pool.acquire() as conn:
        await conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_products_metadata_gin 
            ON products USING GIN (attributes jsonb_path_ops);
        """)

class ProductOut(BaseModel):
    id: int
    name: str
    attributes: dict

@app.get("/v1/products/by-attribute", response_model=List[ProductOut])
async def search_products_by_json_attribute(brand: str, color: str):
    # JSONB containment operator (@>) uses GIN index in O(log N)
    query = """
        SELECT id, name, attributes 
        FROM products 
        WHERE attributes @> $1::jsonb
        LIMIT 20;
    """
    filter_json = f'{{"brand": "{brand}", "color": "{color}"}}'
    
    async with db_pool.acquire() as conn:
        records = await conn.fetch(query, filter_json)
        return [dict(r) for r in records]
```

---

## 5. Practical Hands-On Verification Matrix

### Step 1: Query Execution Plan with EXPLAIN (ANALYZE, BUFFERS)
Execute inside `psql` to prove that the covering index executes an **Index-Only Scan**:
```sql
EXPLAIN (ANALYZE, BUFFERS)
SELECT id, status, updated_at 
FROM shipments 
WHERE tenant_id = 'tenant_fedex' 
  AND status = 'IN_TRANSIT' 
  AND updated_at >= '2026-11-01';
```
**Expected Output (Index Only Scan Verified):**
```text
Index Only Scan using idx_shipments_covering on shipments  (cost=0.42..8.45 rows=12 width=24) (actual time=0.031..0.045 rows=12 loops=1)
  Index Cond: ((tenant_id = 'tenant_fedex'::text) AND (status = 'IN_TRANSIT'::text) AND (updated_at >= '2026-11-01 00:00:00'::timestamp))
  Heap Fetches: 0
  Buffers: shared hit=4
Planning Time: 0.112 ms
Execution Time: 0.068 ms
```

---

## 6. Operational Verification Quizzes

<details>
<summary><b>Checkpoint 1: The Cost of Over-Indexing Tables</b></summary>

**Scenario:** A junior developer creates 14 separate single-column indexes on a high-throughput `event_logs` table that receives 5,000 writes/sec to make every possible filter combination fast. Write throughput degrades by 80% and disk usage triples. Why?

**Correct Analysis:** Write Amplification and Buffer Pool Contention. Every single `INSERT`, `UPDATE`, or `DELETE` statement must update not only the heap table pages, but also traverse and insert entries into all 14 individual B-Trees. Furthermore, B-Tree leaf node page splits trigger extensive disk I/O and flush cache pages. Indexes should be designed conservatively to serve composite query patterns, and unused indexes must be dropped via `pg_stat_user_indexes`.
</details>

<details>
<summary><b>Checkpoint 2: The Left-Prefix Missing Leading Column Pitfall</b></summary>

**Scenario:** A table has composite index `CREATE INDEX idx_users ON users (tenant_id, role, created_at)`. A query runs: `SELECT * FROM users WHERE role = 'admin' AND created_at > now() - interval '1 day'`. Why does PostgreSQL execute a Sequential Scan, ignoring the index?

**Correct Analysis:** Violation of the Leftmost Prefix Rule. A composite B-Tree is sorted lexicographically starting with the *first* column (`tenant_id`). Because the query does not provide `tenant_id`, the engine cannot enter the tree at any specific root or branch. It cannot jump directly to `role = 'admin'` because admins are scattered across thousands of different tenants. The query planner falls back to a sequential table scan.
</details>

<details>
<summary><b>Checkpoint 3: Partial Indexes on Skewed Status Columns</b></summary>

**Scenario:** A jobs table has 10,000,000 rows: 9,990,000 rows have `status = 'COMPLETED'` and 10,000 rows have `status = 'PENDING'`. A standard index on `status` consumes 250 MB of RAM. How do you reduce index size by 99% while speeding up worker polls?

**Correct Analysis:** Use a **Partial Index**: `CREATE INDEX idx_jobs_pending ON jobs (created_at) WHERE status = 'PENDING';`. The database engine only includes rows matching the predicate in the B-Tree. The partial index size shrinks from 250 MB to less than 1 MB, fits entirely in L3 CPU cache, and never incurs write penalties when completed jobs are archived.
</details>

---

## Download Printable Reference & Diagrams

Download the notes for each video on this page as a printable PDF, with every diagram and interview questions: [SD-E-002: Database Normalization](https://backendroadmap.com/notes/system-design/SD-E-002.pdf), [SD-E-003: Denormalization](https://backendroadmap.com/notes/system-design/SD-E-003.pdf), [SD-E-004: B-Tree Indexes Explained](https://backendroadmap.com/notes/system-design/SD-E-004.pdf), [SD-E-005: Composite, Covering & Partial Indexes](https://backendroadmap.com/notes/system-design/SD-E-005.pdf), [SD-E-006: LSM Trees & SSTables](https://backendroadmap.com/notes/system-design/SD-E-006.pdf). Each section in one file: [Phase 2, Databases (PDF)](https://backendroadmap.com/notes/system-design/Phase2_Databases_Notes.pdf).

---

## Further Reading & Sources

- [Use The Index, Luke: A Guide to Database Performance for Developers](https://use-the-index-luke.com/)
- [PostgreSQL Documentation: Chapter 11. Indexes](https://www.postgresql.org/docs/current/indexes.html)
- [PostgreSQL Documentation: EXPLAIN (ANALYZE, BUFFERS)](https://www.postgresql.org/docs/current/using-explain.html)

---

## Next Steps

Advance to the next module:
[../04-transactions-and-concurrency-control/README.md](../04-transactions-and-concurrency-control/README.md)
Explore transaction isolation levels (Read Committed, Repeatable Read, Serializable), dirty reads, non-repeatable reads, phantom reads, write skew, and MVCC internals.
