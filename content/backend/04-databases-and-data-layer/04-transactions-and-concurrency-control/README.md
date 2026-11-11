# Transactions & Concurrency Control: Isolation Levels, MVCC & Locking

> [!TIP]
> **The Golden Rule:** Default `READ COMMITTED` isolation does not prevent lost updates or write skew. Use **Pessimistic Locking (`SELECT ... FOR UPDATE`)** for high-contention, low-latency updates (inventory counters); use **Optimistic Concurrency Control (`WHERE version = :current_version`)** for user-facing editing flows; use **Serializable Isolation (SSI)** when business invariants cross multiple rows.

---

## 1. Visual Mental Model: SQL Isolation Levels & Concurrency Anomalies

The SQL-92 standard defines isolation levels by which concurrency anomalies they forbid. Underneath, PostgreSQL achieves isolation using **Multi-Version Concurrency Control (MVCC)** rather than read locks.

```mermaid
flowchart TD
    subgraph IsolationLevels ["SQL Transaction Isolation Hierarchy"]
        L1["1. READ UNCOMMITTED\n(Allows Dirty Reads — Treated as Read Committed in Postgres)"] --> L2["2. READ COMMITTED (PostgreSQL Default)\n• Prevents Dirty Reads\n• Reads freshly committed snapshot on EVERY statement"]
        L2 --> L3["3. REPEATABLE READ (Snapshot Isolation)\n• Prevents Non-Repeatable & Phantom Reads\n• Freezes snapshot at transaction start\n• Fails on concurrent update conflict"]
        L3 --> L4["4. SERIALIZABLE (Serializable Snapshot Isolation - SSI)\n• Mathematically equivalent to sequential execution\n• Detects and aborts Write Skew cycles\n• Requires retry loop on 40001 serialization_failure"]
    end

    classDef basic fill:#f59e0b,stroke:#b45309,stroke-width:2px,color:#fff;
    classDef strong fill:#3b82f6,stroke:#1d4ed8,stroke-width:2px,color:#fff;
    classDef max fill:#10b981,stroke:#047857,stroke-width:2px,color:#fff;

    class L1,L2 basic;
    class L3 strong;
    class L4 max;
```

---

## 2. Concurrency Anomalies & Isolation Matrix

| Isolation Level | Dirty Read | Non-Repeatable Read | Phantom Read | Write Skew | Implementation Mechanism |
| :--- | :---: | :---: | :---: | :---: | :--- |
| **Read Uncommitted** | Possible* | Possible | Possible | Possible | Read uncommitted memory (Postgres treats as Read Committed) |
| **Read Committed** (Default) | **Prevented** | Possible | Possible | Possible | Statement-level MVCC snapshot |
| **Repeatable Read** | **Prevented** | **Prevented** | **Prevented** (in Postgres) | **Possible** | Transaction-level MVCC snapshot (`xmin`, `xmax`) |
| **Serializable** | **Prevented** | **Prevented** | **Prevented** | **Prevented** | SIREAD predicate locks / Dependency graph analysis |

### MVCC Internals: How Readers Never Block Writers
PostgreSQL tuples carry two hidden system columns:
- `xmin`: The transaction ID ($XID$) that inserted the row.
- `xmax`: The transaction ID that deleted or replaced the row.

When Transaction B updates a row, it does not overwrite disk bytes in place: it writes a *new version* of the tuple and sets `xmax` on the old version. Readers continue reading the old tuple version using their snapshot without blocking on writers!

---

## 3. Production War Story: The Hospital On-Call Write Skew Outage

### The Incident
A medical emergency dispatch platform maintained an on-call physician schedule. Hospital policy strictly mandated: **"At least one emergency physician must remain actively on call at all times."**

The platform executed at the `REPEATABLE READ` isolation level. Doctors Alice and Bob were both currently on call. Both doctors felt unwell and opened their mobile app to request off-call leave at 20:00.

1. **Transaction A (Alice):** Queries `SELECT COUNT(*) FROM on_call_doctors WHERE active = true;` $\rightarrow$ Result: **2**. (Invariant holds: $2 > 1$, so Alice can leave).
2. **Transaction B (Bob):** Queries `SELECT COUNT(*) FROM on_call_doctors WHERE active = true;` $\rightarrow$ Result: **2**. (Invariant holds: $2 > 1$, so Bob can leave).
3. Alice's app executes: `UPDATE on_call_doctors SET active = false WHERE id = 'alice';` $\rightarrow$ **Commits OK**.
4. Bob's app executes: `UPDATE on_call_doctors SET active = false WHERE id = 'bob';` $\rightarrow$ **Commits OK**.
5. Neither transaction modified the same row, so `REPEATABLE READ` detected **zero row conflicts**. 
6. Both committed successfully. The emergency department was left with **0 doctors on call**, and incoming trauma calls were unanswered for 45 minutes before an automated pager alert triggered.

```mermaid
sequenceDiagram
    autonumber
    actor Alice as Dr. Alice (Tx 1)
    actor Bob as Dr. Bob (Tx 2)
    participant DB as Postgres (REPEATABLE READ)

    Note over DB: On Call: [Alice, Bob] (Count = 2)
    Alice->>DB: BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ#59;
    Bob->>DB: BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ#59;
    
    Alice->>DB: SELECT COUNT(*) WHERE active = true#59; -> Returns 2
    Bob->>DB: SELECT COUNT(*) WHERE active = true#59; -> Returns 2
    Note over Alice,Bob: Invariant: Count >= 2. Both proceed to go off call!

    Alice->>DB: UPDATE on_call SET active = false WHERE id = 'alice'#59;
    Alice->>DB: COMMIT#59; (Succeeds!)

    Bob->>DB: UPDATE on_call SET active = false WHERE id = 'bob'#59;
    Bob->>DB: COMMIT#59; (Succeeds! Different row, so no conflict detected!)
    Note over DB: DISASTER: Count = 0! Zero physicians on call! (Write Skew)
```

### The Root Cause
**Write Skew:** An anomaly where concurrent transactions read overlapping datasets, make decisions based on an invariant, and modify *disjoint* rows that together violate the invariant. `REPEATABLE READ` cannot prevent write skew because each transaction only locks its own modified row.

### The Verified Fix
- **Option 1: Serializable Isolation:** Run transactions with `SERIALIZABLE`. PostgreSQL's Serializable Snapshot Isolation (SSI) detects the overlapping read-write dependencies (SIREAD locks) and automatically aborts Transaction B with `40001 serialization_failure`, prompting an automatic application retry.
- **Option 2: Materialized Conflict Locking:** Lock the parent entity or schedule table: `SELECT * FROM on_call_schedule WHERE id = 'today' FOR UPDATE;`.

---

## 4. Multi-Language Production Implementation

### Go: Serializable Transaction with Automatic Exponential Backoff Retry Loop

```go
package main

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"log/slog"
	"math/rand"
	"time"

	"github.com/lib/pq"
)

// ExecuteWithRetry wraps serializable transactions with automatic conflict retry
func ExecuteWithRetry(ctx context.Context, db *sql.DB, maxRetries int, fn func(tx *sql.Tx) error) error {
	var err error
	for attempt := 0; attempt < maxRetries; attempt++ {
		// Set isolation level to Serializable
		tx, txErr := db.BeginTx(ctx, &sql.TxOptions{Isolation: sql.LevelSerializable})
		if txErr != nil {
			return txErr
		}

		err = fn(tx)
		if err == nil {
			if commitErr := tx.Commit(); commitErr == nil {
				return nil // Success!
			} else {
				err = commitErr
			}
		}

		_ = tx.Rollback()

		// Check for PostgreSQL 40001: serialization_failure or 40P01: deadlock_detected
		var pqErr *pq.Error
		if errors.As(err, &pqErr) && (pqErr.Code == "40001" || pqErr.Code == "40P01") {
			slog.Warn("Serialization conflict detected, retrying transaction", "attempt", attempt+1, "code", pqErr.Code)
			// Exponential backoff with jitter
			sleepMs := time.Duration(10*(1<<attempt)+rand.Intn(20)) * time.Millisecond
			select {
			case <-time.After(sleepMs):
				continue
			case <-ctx.Done():
				return ctx.Err()
			}
		}

		return err // Non-retryable error
	}

	return fmt.Errorf("transaction aborted after %d retries: %w", maxRetries, err)
}

func GoOffCall(ctx context.Context, db *sql.DB, doctorID string) error {
	return ExecuteWithRetry(ctx, db, 5, func(tx *sql.Tx) error {
		// Check invariant: At least 2 active physicians must exist before leaving
		var count int
		if err := tx.QueryRowContext(ctx, "SELECT COUNT(*) FROM on_call_doctors WHERE active = true").Scan(&count); err != nil {
			return err
		}

		if count <= 1 {
			return errors.New("cannot go off call: minimum of 1 doctor required")
		}

		_, err := tx.ExecContext(ctx, "UPDATE on_call_doctors SET active = false WHERE id = $1", doctorID)
		return err
	})
}
```

---

### Node.js (TypeScript): Optimistic Concurrency Control (OCC) with Versioning

```typescript
import { Pool } from 'pg';

export class InventoryService {
  constructor(private pool: Pool) {}

  // Optimistic Concurrency Control: Zero row locks during read
  async reserveItem(itemId: string, requestedQty: number): Promise<boolean> {
    const maxAttempts = 3;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      // 1. Read current state and version without locking (Fast!)
      const selectRes = await this.pool.query(
        'SELECT id, stock, version FROM inventory WHERE id = $1',
        [itemId]
      );
      if (selectRes.rows.length === 0) throw new Error('Item not found');

      const { stock, version } = selectRes.rows[0];

      if (stock < requestedQty) {
        throw new Error('OUT_OF_STOCK');
      }

      // 2. Atomic Compare-And-Swap (CAS) write using version
      const updateRes = await this.pool.query(
        `UPDATE inventory 
         SET stock = stock - $1, version = version + 1 
         WHERE id = $2 AND version = $3`,
        [requestedQty, itemId, version]
      );

      // If rowsAffected === 1, we won the race!
      if (updateRes.rowCount === 1) {
        return true;
      }

      // If rowCount === 0, someone else committed first. Retry!
      await new Promise((r) => setTimeout(r, Math.random() * 50 + 10));
    }

    throw new Error('CONCURRENCY_CONFLICT_EXCEEDED');
  }
}
```

---

### Python: FastAPI Skip Locked Queue Worker Processing

```python
import asyncpg
from typing import Optional
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

app = FastAPI(title="Concurrency Control Queue API")
db_pool: asyncpg.Pool = None

@app.on_event("startup")
async def startup():
    global db_pool
    db_pool = await asyncpg.create_pool("postgresql://postgres:pass@localhost:5432/app_db")

@app.post("/v1/tasks/claim-next")
async def claim_next_job():
    async with db_pool.acquire() as conn:
        async with conn.transaction():
            # FOR UPDATE SKIP LOCKED guarantees workers never block each other!
            query = """
                SELECT id, payload 
                FROM task_queue 
                WHERE status = 'QUEUED' 
                ORDER BY created_at ASC 
                FOR UPDATE SKIP LOCKED 
                LIMIT 1;
            """
            row = await conn.fetchrow(query)
            if not row:
                return {"status": "empty", "message": "No pending jobs"}

            # Mark as in progress within same atomic transaction
            await conn.execute(
                "UPDATE task_queue SET status = 'PROCESSING', started_at = now() WHERE id = $1",
                row["id"]
            )

            return {"status": "claimed", "job_id": row["id"], "payload": row["payload"]}
```

---

## 5. Practical Hands-On Verification Matrix

### Step 1: Claim Job Using SKIP LOCKED
```bash
curl.exe -i -X POST http://localhost:8000/v1/tasks/claim-next
```
**Expected Response:**
```http
HTTP/1.1 200 OK
Content-Type: application/json

{"status":"claimed","job_id":"job_10492","payload":{"action":"send_invoice"}}
```

---

## 6. Operational Verification Quizzes

<details>
<summary><b>Checkpoint 1: Why SKIP LOCKED is Essential for Distributed Queues</b></summary>

**Scenario:** Five worker instances poll a database table for jobs using:
`SELECT * FROM jobs WHERE status = 'QUEUED' ORDER BY id LIMIT 1 FOR UPDATE;`
Under heavy job volume, why do worker threads freeze and experience high CPU latency?

**Correct Analysis:** Lock Convoy / Serialization Bottleneck. Because every worker executes `ORDER BY id LIMIT 1 FOR UPDATE`, all workers attempt to lock the *exact same first row*. Worker 1 acquires the lock, while Workers 2 through 5 are forcibly blocked waiting for Worker 1's transaction to commit. Adding **`SKIP LOCKED`** instructs the database engine to automatically skip any rows currently locked by other workers and jump directly to the next unlocked row, enabling 100% concurrent lock-free throughput across all workers.
</details>

<details>
<summary><b>Checkpoint 2: The Danger of Long-Running Transactions</b></summary>

**Scenario:** A backend handler opens a transaction with `BEGIN`, makes a 3-second HTTP network call to a third-party payment gateway, and then calls `COMMIT`. What disaster happens to database MVCC performance?

**Correct Analysis:** Database Connection Exhaustion and Table Bloat (Unvacuumable Dead Tuples). Holding an open transaction while waiting on external network I/O locks a connection pool slot for seconds. More critically, PostgreSQL's `VACUUM` process cannot clean up old dead row versions (`xmax`) across the *entire database* that are younger than the oldest active transaction's `xmin`. The database experiences massive table bloat, disk usage explodes, and B-Tree indexes degrade. Never make network calls inside a database transaction.
</details>

<details>
<summary><b>Checkpoint 3: Optimistic vs Pessimistic Locking Tradeoffs</b></summary>

**Scenario:** A high-traffic concert ticketing sale sells 50 tickets to 100,000 competing buyers. An engineer chooses Optimistic Concurrency Control (OCC: `WHERE version = :ver`). Why is this choice catastrophically inefficient compared to Pessimistic Locking?

**Correct Analysis:** The Retry Storm / Livelock. Under extreme contention ($100,000$ concurrent updates on 50 rows), 99.9% of optimistic updates fail their version check and retry, burning massive server CPU and database I/O on wasted rollback cycles. OCC is ideal for *low-contention* workloads (e.g. users editing documents). Under *high contention*, **Pessimistic Locking (`SELECT ... FOR UPDATE` or atomic decrements `stock = stock - 1 WHERE stock >= 1`)** is vastly superior because it queues requests deterministically without wasteful retry loops.
</details>

---

## Download Printable Reference & Diagrams

Download the notes for each video on this page as a printable PDF, with every diagram and interview questions: [SD-E-009: Isolation Levels & Write Skew](https://backendroadmap.com/notes/system-design/SD-E-009.pdf), [SD-E-010: MVCC Explained](https://backendroadmap.com/notes/system-design/SD-E-010.pdf), [SD-E-011: Database Locks & Deadlocks](https://backendroadmap.com/notes/system-design/SD-E-011.pdf), [SD-E-012: Optimistic vs Pessimistic Locking](https://backendroadmap.com/notes/system-design/SD-E-012.pdf). Each section in one file: [Phase 2, Databases (PDF)](https://backendroadmap.com/notes/system-design/Phase2_Databases_Notes.pdf).

---

## Further Reading & Sources

- [PostgreSQL Documentation: Chapter 13. Concurrency Control](https://www.postgresql.org/docs/current/mvcc.html)
- [PostgreSQL Documentation: Explicit Locking (FOR UPDATE, SKIP LOCKED)](https://www.postgresql.org/docs/current/explicit-locking.html)
- [Martin Kleppmann: Designing Data-Intensive Applications (Transactions & Weak Isolation)](https://dataintensive.net/)

---

## Next Steps

Advance to the next module:
[../05-orms-and-migrations/README.md](../05-orms-and-migrations/README.md)
Explore Object-Relational Mappers (ORMs), the N+1 query trap, and Zero-Downtime database schema migrations with expand-and-contract patterns.
