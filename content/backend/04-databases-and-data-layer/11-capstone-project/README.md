# Capstone: Production-Grade Transactional Order & Inventory Engine

> [!TIP]
> **The Golden Rule:** High-concurrency inventory reservation must be enforced at the database transaction layer, never in application memory. Combine **Pessimistic Row Locking (`SELECT ... FOR UPDATE`)** with strict database check constraints (`CHECK (stock >= 0)`) and deterministic lock ordering to guarantee zero overselling, zero race conditions, and zero deadlocks under flash-sale traffic surges.

---

## 1. System Architecture: The High-Concurrency Data Access Engine

This capstone synthesizes every architectural pattern mastered across Track 4 into an enterprise transactional engine:

```mermaid
flowchart TD
    Client["Client / API Gateway"] --> Pooler["1. Connection Pooler (PgBouncer)\n(Transaction Pooling Mode)"]
    
    subgraph AppService ["Application Layer (Domain & Clean Architecture)"]
        Pooler --> Router["2. Handler / Controller"]
        Router --> Service["3. Order Checkout Domain Service\n(Enforces Business Rules, Pure Logic)"]
        Service --> UoW["4. Unit of Work (UoW)\n(Manages BEGIN, COMMIT, ROLLBACK)"]
        UoW --> Repo["5. Scoped Repositories\n(OrderRepo, InventoryRepo)"]
    end
    
    subgraph DataEngine ["PostgreSQL Storage Engine (Kernel Invariants)"]
        Repo --> RLS["6. Row-Level Security (RLS)\nSET LOCAL app.current_tenant = :tenant_id"]
        RLS --> LockMgr["7. Row Lock Manager\nSELECT ... FOR UPDATE (Deterministic ID Order)"]
        LockMgr --> Storage["8. B-Tree Indexes & Table Heap Pages"]
        Storage --> WAL["9. Write-Ahead Log (WAL) + fsync\n(Guarantees ACID Durability)"]
    end

    classDef client fill:#f59e0b,stroke:#b45309,stroke-width:2px,color:#fff;
    classDef app fill:#3b82f6,stroke:#1d4ed8,stroke-width:2px,color:#fff;
    classDef db fill:#10b981,stroke:#047857,stroke-width:2px,color:#fff;

    class Client,Pooler client;
    class Router,Service,UoW,Repo app;
    class RLS,LockMgr,Storage,WAL db;
```

---

## 2. Invariant Specifications & Architectural Contracts

| Dimension | Architectural Implementation | Threat / Failure Mitigated |
| :--- | :--- | :--- |
| **Concurrency Control** | Pessimistic Locking (`SELECT stock FROM inventory WHERE id = :id FOR UPDATE`) | Race conditions & inventory overselling during simultaneous clicks |
| **Deadlock Prevention** | Sort target item IDs in ascending order prior to lock acquisition | Circular lock wait graphs aborting transactions with error `40P01` |
| **Schema Integrity** | 3NF normalized schema + Database `CHECK (stock >= 0)` constraint | Application logic bugs silently creating negative inventory |
| **Multi-Tenancy** | PostgreSQL Row-Level Security (`FORCE ROW LEVEL SECURITY`) | Accidental omission of `tenant_id` leaking cross-tenant records |
| **Connection Pooling** | Sized to hardware core formula ($(\text{cores} \times 2) + \text{spindles}$) via PgBouncer | Kernel process fork death spiral and OOM crashes under autoscaling |

---

## 3. Production War Story: The Flash Sale Overselling & Deadlock Meltdown

### The Incident
An online sneaker retailer launched a limited drop of 50 pairs of rare shoes. Over 80,000 users hit the checkout endpoint within 10 seconds.

The checkout service fetched the item's current stock:
`SELECT stock FROM products WHERE id = 101;`
The application evaluated: `if stock >= requested_qty: proceed_to_payment()`.

Under 80,000 concurrent requests:
1. Hundreds of worker threads read `stock = 50` at the exact same millisecond before any single purchase committed.
2. 420 orders were processed, confirmed, and charged to customer credit cards before the inventory counter registered zero.
3. 370 customers were charged for shoes that physically did not exist in the warehouse.
4. When engineers attempted to run a quick script to deduct remaining inventory across multi-item baskets, different threads locked items in opposite order (`Item A` then `Item B` vs `Item B` then `Item A`), creating thousands of deadlocks that froze the primary database entirely.
5. The business incurred \$65,000 in customer chargeback penalties and widespread social media damage.

```mermaid
sequenceDiagram
    autonumber
    actor User1 as Customer 1 (Tx 1)
    actor User2 as Customer 2 (Tx 2)
    participant Svc as Checkout Service
    participant DB as Postgres Primary DB

    Note over DB: Physical Warehouse Stock: 1 Unit Remaining!
    User1->>Svc: Buy Shoe (Qty: 1)
    User2->>Svc: Buy Shoe (Qty: 1) (Concurrent)

    Svc->>DB: Tx 1: SELECT stock WHERE id = 101 -> 1
    Svc->>DB: Tx 2: SELECT stock WHERE id = 101 -> 1
    Note over Svc: Both threads observe: 1 >= 1 -> Approved!
    
    Svc->>DB: Tx 1: UPDATE stock = 1 - 1 WHERE id = 101#59; COMMIT#59;
    Svc->>DB: Tx 2: UPDATE stock = 0 - 1 WHERE id = 101#59; COMMIT#59;
    Note over DB: DISASTER: Stock = -1! Two customers charged for 1 item! (Overselling)
```

### The Root Cause
1. **Unprotected Read-Modify-Write (Lost Update):** Reading stock without exclusive row locks permitted concurrent transactions to interleave checks.
2. **Missing Database Integrity Constraints:** The database lacked an invariant `CHECK (stock >= 0)`.
3. **Random Lock Ordering:** Multi-item orders locked items in arbitrary cart order, causing deadlocks.

### The Verified Fix
- **Atomic Lock & Decrement:** Lock rows in ascending order: `SELECT * FROM inventory WHERE id = ANY($1) ORDER BY id FOR UPDATE`.
- **Database CHECK Constraint:**
  `ALTER TABLE inventory ADD CONSTRAINT non_negative_stock CHECK (stock >= 0);`
- **Unit of Work Isolation:** Commit stock reservation and order creation within a single atomic ACID transaction.

---

## 4. Multi-Language Production Implementation

### Go: Resilient Checkout Engine with Sorted Row Locking & UoW

```go
package main

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"sort"
	"time"

	_ "github.com/lib/pq"
)

var (
	ErrInsufficientStock = errors.New("insufficient inventory stock")
	ErrProductNotFound   = errors.New("product item not found")
)

type CartItem struct {
	ProductID int64 `json:"product_id"`
	Quantity  int   `json:"quantity"`
}

type CheckoutService struct {
	db *sql.DB
}

// ProcessCheckout demonstrates atomic stock deduction with sorted row locks to eliminate deadlocks
func (s *CheckoutService) ProcessCheckout(ctx context.Context, tenantID string, customerID int64, items []CartItem) (int64, error) {
	if len(items) == 0 {
		return 0, errors.New("cart cannot be empty")
	}

	// 1. Mandatory Deadlock Defense: Sort item IDs in ascending order!
	sortedItems := make([]CartItem, len(items))
	copy(sortedItems, items)
	sort.Slice(sortedItems, func(i, j int) bool {
		return sortedItems[i].ProductID < sortedItems[j].ProductID
	})

	// 2. Begin Atomic Transaction
	tx, err := s.db.BeginTx(ctx, &sql.TxOptions{Isolation: sql.LevelReadCommitted})
	if err != nil {
		return 0, err
	}
	defer tx.Rollback()

	// 3. Inject Tenant Context for Postgres Row-Level Security
	if _, err := tx.ExecContext(ctx, fmt.Sprintf("SET LOCAL app.current_tenant = '%s'", tenantID)); err != nil {
		return 0, err
	}

	// 4. Acquire Pessimistic Row Locks in strict ID order
	var totalCents int64
	for _, item := range sortedItems {
		var currentStock int
		var priceCents int64

		// SELECT FOR UPDATE locks this specific row until COMMIT/ROLLBACK
		query := `SELECT stock, price_cents FROM inventory WHERE product_id = $1 FOR UPDATE`
		err := tx.QueryRowContext(ctx, query, item.ProductID).Scan(&currentStock, &priceCents)
		if errors.Is(err, sql.ErrNoRows) {
			return 0, ErrProductNotFound
		}
		if err != nil {
			return 0, err
		}

		if currentStock < item.Quantity {
			return 0, fmt.Errorf("%w: product %d has %d remaining", ErrInsufficientStock, item.ProductID, currentStock)
		}

		// Atomic Decrement
		updateQuery := `UPDATE inventory SET stock = stock - $1 WHERE product_id = $2`
		if _, err := tx.ExecContext(ctx, updateQuery, item.Quantity, item.ProductID); err != nil {
			return 0, err
		}

		totalCents += priceCents * int64(item.Quantity)
	}

	// 5. Create Order Header & Items within same transaction
	var orderID int64
	orderQuery := `INSERT INTO orders (tenant_id, customer_id, total_cents, status) VALUES ($1, $2, $3, 'PAID') RETURNING id`
	if err := tx.QueryRowContext(ctx, orderQuery, tenantID, customerID, totalCents).Scan(&orderID); err != nil {
		return 0, err
	}

	for _, item := range sortedItems {
		itemQuery := `INSERT INTO order_items (order_id, product_id, quantity) VALUES ($1, $2, $3)`
		if _, err := tx.ExecContext(ctx, itemQuery, orderID, item.ProductID, item.Quantity); err != nil {
			return 0, err
		}
	}

	// 6. Commit Transaction (All-or-Nothing Durability)
	if err := tx.Commit(); err != nil {
		return 0, err
	}

	slog.Info("Checkout completed successfully", "order_id", orderID, "total_cents", totalCents)
	return orderID, nil
}
```

---

### Node.js (TypeScript): Complete Transactional Reservation with PgBouncer Pool

```typescript
import { Pool, PoolClient } from 'pg';

export interface OrderLine {
  productId: number;
  quantity: number;
}

export class OrderEngine {
  constructor(private pool: Pool) {}

  async checkout(tenantId: string, customerId: number, lines: OrderLine[]): Promise<number> {
    // 1. Sort IDs to prevent circular deadlocks
    const sortedLines = [...lines].sort((a, b) => a.productId - b.productId);

    const client: PoolClient = await this.pool.connect();

    try {
      await client.query('BEGIN');
      await client.query('SET LOCAL app.current_tenant = $1', [tenantId]);

      let totalCents = 0;

      // 2. Acquire Pessimistic Locks sequentially
      for (const line of sortedLines) {
        const res = await client.query(
          'SELECT stock, price_cents FROM inventory WHERE product_id = $1 FOR UPDATE',
          [line.productId]
        );

        if (res.rows.length === 0) throw new Error('PRODUCT_NOT_FOUND');
        const { stock, price_cents } = res.rows[0];

        if (stock < line.quantity) {
          throw new Error(`INSUFFICIENT_STOCK: Product ${line.productId} only has ${stock} units`);
        }

        await client.query(
          'UPDATE inventory SET stock = stock - $1 WHERE product_id = $2',
          [line.quantity, line.productId]
        );

        totalCents += price_cents * line.quantity;
      }

      // 3. Create Order
      const orderRes = await client.query(
        'INSERT INTO orders (tenant_id, customer_id, total_cents, status) VALUES ($1, $2, $3, $4) RETURNING id',
        [tenantId, customerId, totalCents, 'PAID']
      );
      const orderId = orderRes.rows[0].id;

      await client.query('COMMIT');
      return orderId;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }
}
```

---

### Python: FastAPI Asyncpg Clean Inventory Reservation Engine

```python
import asyncpg
from typing import List
from fastapi import FastAPI, HTTPException, status
from pydantic import BaseModel, Field

app = FastAPI(title="Capstone Inventory Engine")
db_pool: asyncpg.Pool = None

@app.on_event("startup")
async def startup():
    global db_pool
    db_pool = await asyncpg.create_pool("postgresql://postgres:pass@localhost:5432/store_db")

class OrderItemDTO(BaseModel):
    product_id: int
    quantity: int = Field(..., gt=0)

class CheckoutRequest(BaseModel):
    tenant_id: str
    customer_id: int
    items: List[OrderItemDTO]

@app.post("/v1/orders/checkout", status_code=status.HTTP_201_CREATED)
async def checkout_endpoint(req: CheckoutRequest):
    # Sort IDs to guarantee deadlock immunity
    sorted_items = sorted(req.items, key=lambda x: x.product_id)

    async with db_pool.acquire() as conn:
        async with conn.transaction():
            # Inject RLS context
            await conn.execute("SET LOCAL app.current_tenant = $1", req.tenant_id)

            total_cents = 0

            # Acquire row locks in sorted order
            for item in sorted_items:
                row = await conn.fetchrow(
                    "SELECT stock, price_cents FROM inventory WHERE product_id = $1 FOR UPDATE",
                    item.product_id
                )
                if not row:
                    raise HTTPException(status_code=404, detail=f"Product {item.product_id} not found")

                if row["stock"] < item.quantity:
                    raise HTTPException(
                        status_code=400,
                        detail=f"Product {item.product_id} is out of stock (available: {row['stock']})"
                    )

                # Deduct stock
                await conn.execute(
                    "UPDATE inventory SET stock = stock - $1 WHERE product_id = $2",
                    item.quantity, item.product_id
                )
                total_cents += row["price_cents"] * item.quantity

            # Create Order
            order_id = await conn.fetchval(
                "INSERT INTO orders (tenant_id, customer_id, total_cents, status) VALUES ($1, $2, $3, 'PAID') RETURNING id",
                req.tenant_id, req.customer_id, total_cents
            )

            return {"status": "created", "order_id": order_id, "total_cents": total_cents}
```

---

## 5. Practical Hands-On Verification Matrix

Execute these terminal verification tests to validate transaction atomicity, stock locking, and out-of-stock rollbacks.

### Step 1: Execute Successful Checkout Transaction
```bash
curl.exe -i -X POST http://localhost:8000/v1/orders/checkout \
  -H "Content-Type: application/json" \
  -d '{
    "tenant_id": "tenant_acme",
    "customer_id": 1,
    "items": [
      {"product_id": 101, "quantity": 2},
      {"product_id": 102, "quantity": 1}
    ]
  }'
```
**Expected Response:**
```http
HTTP/1.1 201 Created
Content-Type: application/json

{
  "status": "created",
  "order_id": 10492,
  "total_cents": 12500
}
```

### Step 2: Trigger Out-Of-Stock Invariant Rollback
```bash
curl.exe -i -X POST http://localhost:8000/v1/orders/checkout \
  -H "Content-Type: application/json" \
  -d '{
    "tenant_id": "tenant_acme",
    "customer_id": 1,
    "items": [
      {"product_id": 101, "quantity": 999999}
    ]
  }'
```
**Expected Response:**
```http
HTTP/1.1 400 Bad Request
Content-Type: application/json

{"detail":"Product 101 is out of stock (available: 18)"}
```

---

## 6. Operational Verification Quizzes

<details>
<summary><b>Checkpoint 1: Why Sorting Lock IDs Eliminates Deadlocks</b></summary>

**Scenario:** Transaction 1 needs to reserve Item 10 and Item 20. Transaction 2 needs to reserve Item 20 and Item 10. If both run simultaneously without sorting, a deadlock occurs. Why does sorting item IDs (`[10, 20]`) mathematically guarantee that deadlocks cannot happen?

**Correct Analysis:** Breaking Circular Wait Conditions. For a deadlock to occur, there must be a circular dependency graph: $T_1$ holds Resource A and requests Resource B, while $T_2$ holds Resource B and requests Resource A. If all transactions strictly acquire locks in identical global order ($10 \rightarrow 20$), Transaction 2 cannot acquire Resource 20 until it has successfully acquired Resource 10. This creates a directed acyclic graph (DAG), making circular wait mathematically impossible.
</details>

<details>
<summary><b>Checkpoint 2: The Role of Database Constraints as the Last Line of Defense</b></summary>

**Scenario:** An application has a bug in its checkout code where an unhandled exception causes `stock - quantity` to bypass the application validation check and compute `-5`. Why does a database check constraint (`CHECK (stock >= 0)`) protect the business?

**Correct Analysis:** Defense in Depth. Code bugs, rogue developer scripts, and direct database updates can always bypass application validation layers. The database engine is the single point of truth. A database-level check constraint rejects any statement that would result in negative inventory with an immediate error (`23514 check_violation`), automatically aborting the transaction and preventing corrupted physical state.
</details>

<details>
<summary><b>Checkpoint 3: The Danger of Executing External Stripe API Calls Inside Database Transactions</b></summary>

**Scenario:** A developer wraps checkout in a database transaction: `BEGIN; Lock stock; Call Stripe Charge API; Record Order; COMMIT;`. Under a flash sale, database connection slots exhaust and the database freezes. Why?

**Correct Analysis:** Connection Hold Time and Row Lock Contention. Stripe API calls take 500–1,500ms of external network latency. Holding a database connection and pessimistic row locks open for 1.5 seconds while waiting on internet traffic locks out other shoppers and exhausts all available connection pool slots within seconds. Financial patterns require a two-phase reservation: (1) Reserve inventory in a fast 5ms database transaction, (2) Commit reservation, (3) Execute external payment outside transaction, (4) If payment fails, release inventory.
</details>

---

## Further Reading & Sources

- [PostgreSQL Documentation: Explicit Locking & Deadlocks](https://www.postgresql.org/docs/current/explicit-locking.html)
- [HikariCP: High-Performance Connection Pool Sizing](https://github.com/brettwooldridge/HikariCP/wiki/About-Pool-Sizing)
- [Martin Fowler: Patterns of Enterprise Application Architecture (Unit of Work)](https://martinfowler.com/eaaCatalog/unitOfWork.html)

---

## Next Steps

Congratulations! You have completed **Step 4: Databases and Data Layer**. Next, advance to **Step 5: Caching and Performance**:
[../../05-caching-and-performance/00-caching-fundamentals/README.md](../../05-caching-and-performance/00-caching-fundamentals/README.md)
Master in-memory caching with Redis: Cache-aside vs Write-through patterns, Cache stampedes (Thundering Herd), Singleflight locking, Redis data structures, and TTL eviction policies.
