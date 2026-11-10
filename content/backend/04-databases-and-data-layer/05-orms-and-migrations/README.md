# ORMs and Migrations: Zero-Downtime Schema Evolution & The N+1 Trap

> [!TIP]
> **The Golden Rule:** Never run non-concurrent DDL on production tables with live traffic. Always create indexes with **`CREATE INDEX CONCURRENTLY`**, and evolve schemas using the **Expand-and-Contract (Parallel Run)** pattern. Inside application code, treat ORM lazy loading as an anti-pattern: always specify eager loading (`selectinload` / `joinedload`) to prevent catastrophic **N+1 query cascades**.

---

## 1. Visual Mental Model: The Expand-and-Contract Migration Pipeline

In high-availability backend engineering, an application cannot stop the world to rename a column or restructure a table. The database schema must remain backwards-compatible with older versions of the running service across canary deployments.

```mermaid
flowchart TD
    Phase1["Phase 1: Expand (Additive Migration)\n• Add new column/table as NULLABLE\n• Create index with CONCURRENTLY\n• Old app version still functions normally"] --> Phase2["Phase 2: Dual-Writing Application Deployment\n• Deploy App v2: Reads from old column\n• Writes simultaneously to BOTH old and new columns"]
    Phase2 --> Phase3["Phase 3: Backfill Background Job\n• Background worker copies historical data\n• Batches of 5,000 rows (avoids long locks)"]
    Phase3 --> Phase4["Phase 4: Switch Reads Deployment\n• Deploy App v3: Reads from NEW column\n• Validates data consistency in production"]
    Phase4 --> Phase5["Phase 5: Contract (Cleanup Migration)\n• Stop writing to old column\n• Drop deprecated column/index safely"]

    classDef stage fill:#3b82f6,stroke:#1d4ed8,stroke-width:2px,color:#fff;
    classDef final fill:#10b981,stroke:#047857,stroke-width:2px,color:#fff;

    class Phase1,Phase2,Phase3,Phase4 stage;
    class Phase5 final;
```

---

## 2. ORM Tradeoffs & Dangerous DDL Operations Matrix

| Operation | Why It Kills Production | Safe Production Alternative |
| :--- | :--- | :--- |
| `CREATE INDEX idx_name ON table (col)` | Acquires `ACCESS EXCLUSIVE` lock; blocks all incoming writes/reads for minutes | **`CREATE INDEX CONCURRENTLY idx_name ON table (col)`** (Zero blocking locks) |
| `ALTER TABLE t ADD COLUMN c TEXT NOT NULL DEFAULT 'x'` | In older Postgres/MySQL, rewrites every page on disk under exclusive table lock | Add column as `NULLABLE`, backfill in batches, then `ALTER ... SET NOT NULL` |
| `ALTER TABLE t RENAME COLUMN a TO b` | Instantly breaks running application instances that still execute queries naming `a` | **Expand-and-Contract:** Add `b`, dual-write, migrate, drop `a` |
| ORM Lazy Loading in a Loop | Generates 1 query for parent + $N$ queries for children (The N+1 Trap) | **Eager Loading:** Use `joinedload`, `selectinload`, or single SQL `JOIN` |

---

## 3. Production War Story: The 25-Minute Exclusive Table Lock Outage

### The Incident
A fast-growing fintech platform had 65,000,000 rows in its `payments` table. During an afternoon deployment, a developer merged a standard database migration script:

```sql
-- Migration script 0042_add_fraud_score.sql
ALTER TABLE payments ADD COLUMN fraud_score INTEGER NOT NULL DEFAULT 0;
CREATE INDEX idx_payments_fraud ON payments (fraud_score);
```

As soon as CI/CD ran the migration against the primary database:
1. `CREATE INDEX` without `CONCURRENTLY` acquired an **`ACCESS EXCLUSIVE`** lock on the `payments` table.
2. The index build took **24 minutes and 18 seconds** to traverse and sort 65 million records.
3. Every single incoming customer payment request (`INSERT INTO payments`) was forced into a lock queue behind the migration.
4. Within 45 seconds, the application's 1,200 database connection pool slots were completely exhausted.
5. All backend pods began failing Kubernetes liveness probes and restarting, bringing down payment processing worldwide for 25 minutes.

```mermaid
sequenceDiagram
    autonumber
    actor CI as CI/CD Migration Runner
    participant DB as Postgres Primary DB
    actor Users as Active Customer API Traffic

    CI->>DB: CREATE INDEX idx_payments_fraud ON payments (fraud_score);
    Note over DB: Locks table with ACCESS EXCLUSIVE!<br/>Sorting 65,000,000 rows on disk (24 mins)...
    loop 2,000 payment requests per second
        Users->>DB: INSERT INTO payments (...)
        Note over DB: Requests BLOCKED in lock queue!
    end
    Note over DB: Connection pool (1,200 connections) 100% EXHAUSTED!
    Note over Users: Gateway 504 Timeout: Complete Platform Outage!
```

### The Root Cause
1. **Blocking DDL on Live Table:** Running `CREATE INDEX` without `CONCURRENTLY` locks out all writes.
2. **Missing Statement Timeout on Migrations:** The migration runner lacked a strict `SET statement_timeout = '5s'`, allowing the blocking migration to hang indefinitely instead of aborting harmlessly.

### The Verified Fix
- **Always Use `CONCURRENTLY`:**
  `CREATE INDEX CONCURRENTLY idx_payments_fraud ON payments (fraud_score);`
- **Strict Migration Lock Timeouts:** Set `SET lock_timeout = '3s'` before executing any schema alteration. If the lock cannot be acquired immediately, abort and retry rather than queueing up live traffic.

---

## 4. Multi-Language Production Implementation

### Go: Safe Concurrency-Aware Migration Script with Lock Timeouts

```go
package main

import (
	"context"
	"database/sql"
	"fmt"
	"log/slog"
	"time"

	_ "github.com/lib/pq"
)

type MigrationManager struct {
	db *sql.DB
}

// RunSafeMigration executes DDL with strict lock timeouts to protect production traffic
func (m *MigrationManager) RunSafeMigration(ctx context.Context) error {
	// Step 1: Set strict lock timeout so we never queue live queries
	setupDDL := `
		SET lock_timeout = '3s';
		SET statement_timeout = '60s';
	`
	if _, err := m.db.ExecContext(ctx, setupDDL); err != nil {
		return fmt.Errorf("failed to set safety timeouts: %w", err)
	}

	// Step 2: Add column as NULLABLE (instant operation in modern Postgres)
	addColumnDDL := `
		ALTER TABLE orders 
		ADD COLUMN IF NOT EXISTS tracking_number VARCHAR(128);
	`
	if _, err := m.db.ExecContext(ctx, addColumnDDL); err != nil {
		return fmt.Errorf("failed to add column: %w", err)
	}
	slog.Info("Column added successfully with zero table locks")

	// Step 3: Create index CONCURRENTLY (Must run outside a transaction block!)
	indexDDL := `
		CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_orders_tracking 
		ON orders (tracking_number);
	`
	if _, err := m.db.ExecContext(ctx, indexDDL); err != nil {
		return fmt.Errorf("concurrent index creation failed: %w", err)
	}
	slog.Info("Concurrent index created with zero read/write downtime")

	return nil
}
```

---

### Node.js (TypeScript): Solving the N+1 Problem with Prisma & SQL

```typescript
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export class CustomerReportService {
  // ANTI-PATTERN: The Catastrophic N+1 Query Trap
  async getReportsBad(): Promise<any[]> {
    // 1 query for customers
    const customers = await prisma.customer.findMany({ take: 100 });

    const results = [];
    for (const customer of customers) {
      // 100 separate queries fired sequentially! (1 + 100 = 101 queries)
      const orders = await prisma.order.findMany({
        where: { customerId: customer.id },
      });
      results.push({ customer, orders });
    }
    return results;
  }

  // PRODUCTION STANDARD: Eager Loading via Include / Join
  async getReportsOptimized(): Promise<any[]> {
    // Fires EXACTLY 2 optimized queries (1 for customers, 1 for orders with WHERE id IN (...))
    return await prisma.customer.findMany({
      take: 100,
      include: {
        orders: {
          select: { id: true, totalCents: true, status: true },
        },
      },
    });
  }
}
```

---

### Python: FastAPI SQLAlchemy Eager Loading (`selectinload`)

```python
from typing import List
from fastapi import FastAPI, Depends
from pydantic import BaseModel
from sqlalchemy import ForeignKey, select
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship, selectinload
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker

app = FastAPI(title="ORM Optimization Engine")

class Base(DeclarativeBase):
    pass

class Customer(Base):
    __tablename__ = "customers"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str]
    orders: Mapped[List["Order"]] = relationship(back_populates="customer")

class Order(Base):
    __tablename__ = "orders"
    id: Mapped[int] = mapped_column(primary_key=True)
    customer_id: Mapped[int] = mapped_column(ForeignKey("customers.id"))
    total_cents: Mapped[int]
    customer: Mapped["Customer"] = relationship(back_populates="orders")

engine = create_async_engine("postgresql+asyncpg://postgres:pass@localhost:5432/shop_db")
AsyncSessionLocal = async_sessionmaker(engine, expire_on_commit=False)

async def get_db():
    async with AsyncSessionLocal() as session:
        yield session

class OrderOut(BaseModel):
    id: int
    total_cents: int

class CustomerOut(BaseModel):
    id: int
    name: str
    orders: List[OrderOut]

@app.get("/v1/customers", response_model=List[CustomerOut])
async def list_customers(db: AsyncSession = Depends(get_db)):
    # selectinload prevents N+1 queries by executing exactly TWO SQL statements
    stmt = (
        select(Customer)
        .options(selectinload(Customer.orders))
        .limit(50)
    )
    result = await db.scalars(stmt)
    customers = result.all()
    
    return [
        CustomerOut(
            id=c.id,
            name=c.name,
            orders=[OrderOut(id=o.id, total_cents=o.total_cents) for o in c.orders]
        )
        for c in customers
    ]
```

---

## 5. Practical Hands-On Verification Matrix

### Step 1: Query API with Eager-Loaded Relational Payload
```bash
curl.exe -i http://localhost:8000/v1/customers
```
**Expected Response (Fetched in 2 Queries via selectinload):**
```http
HTTP/1.1 200 OK
Content-Type: application/json

[
  {
    "id": 1,
    "name": "Acme Corp",
    "orders": [
      {"id": 101, "total_cents": 4500},
      {"id": 102, "total_cents": 12000}
    ]
  }
]
```

---

## 6. Operational Verification Quizzes

<details>
<summary><b>Checkpoint 1: The N+1 Query Trap in GraphQL and REST Serializers</b></summary>

**Scenario:** A REST serializer loops through 50 user records: `[{"user": u.name, "teams": [t.name for t in u.teams]} for u in users]`. The ORM model defines `teams` as a standard relationship without eager loading. How many SQL queries hit the database?

**Correct Analysis:** 51 queries (1 initial query to fetch the 50 users, plus 50 individual queries to fetch the teams for each user). Under 200 concurrent requests, this generates $51 \times 200 = 10,200$ queries per second, choking the database connection pool. The solution is explicit eager loading (`selectinload` or `joinedload`), which resolves the entire dataset in exactly 2 optimized SQL queries.
</details>

<details>
<summary><b>Checkpoint 2: Why CREATE INDEX CONCURRENTLY Cannot Run Inside a Transaction Block</b></summary>

**Scenario:** A developer writes an Alembic or Prisma migration that wraps everything in `BEGIN ... COMMIT` and adds `CREATE INDEX CONCURRENTLY`. The migration immediately crashes with: `ERROR: CREATE INDEX CONCURRENTLY cannot run inside a transaction block`. Why?

**Correct Analysis:** Two-Phase Scanning. To build an index without locking table writes, PostgreSQL performs two separate table scans and waits for all concurrent transactions that could modify the table to commit. This two-phase coordination requires committing its own internal state across phases and cannot occur inside a single isolated transaction block. Migrations running `CREATE INDEX CONCURRENTLY` must run with autocommit enabled / outside transaction envelopes.
</details>

<details>
<summary><b>Checkpoint 3: The Danger of Adding NOT NULL with Default Values on Large Legacy Tables</b></summary>

**Scenario:** In an older database engine, a migration executes: `ALTER TABLE users ADD COLUMN phone VARCHAR(20) NOT NULL DEFAULT '000-000-0000';` on an 80,000,000-row table. Why does this command lock the table for 15 minutes?

**Correct Analysis:** Full Table Rewrite. On older database versions (pre-PostgreSQL 11), adding a `NOT NULL` column with a default value required the storage engine to read every 8 KB page, rewrite every physical row to allocate space for the new default string, and flush pages back to disk under an `ACCESS EXCLUSIVE` lock. Modern practice adds the column as nullable first, backfills existing rows in background chunks, and then alters the column to `NOT NULL`.
</details>

---

## Further Reading & Sources

- [PostgreSQL Documentation: Building Indexes Concurrently](https://www.postgresql.org/docs/current/sql-createindex.html#SQL-CREATEINDEX-CONCURRENTLY)
- [SQLAlchemy 2.0: Relationship Loading Techniques](https://docs.sqlalchemy.org/en/20/orm/queryguide/relationships.html)
- [Braintree: Safe Database Migrations in High-Traffic Production Environments](https://medium.com/braintree-product-technology/safe-database-migrations-in-rails-449e3cf75837)

---

## Next Steps

Advance to the next module:
[../06-business-logic-layer-and-separation-of-concerns/README.md](../06-business-logic-layer-and-separation-of-concerns/README.md)
Explore Clean Architecture, Repository vs Service patterns, domain exceptions, and keeping database entities decoupled from API transports.
