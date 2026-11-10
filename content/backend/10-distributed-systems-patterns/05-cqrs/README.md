# Module 05: CQRS (Command Query Responsibility Segregation)

In traditional web architectures, applications rely on a unified CRUD (Create, Read, Update, Delete) model: the same database tables and entity classes that enforce write validation are used to serve user queries. At scale, this design creates conflicting architectural pressures. The **Write Path** requires normalized schemas, strict ACID constraints, and isolation to preserve business invariants. The **Read Path** demands denormalized views, pre-aggregated summaries, full-text search, and horizontal read scalability where millisecond latency is paramount. **CQRS (Command Query Responsibility Segregation)** resolves this tension by splitting the application into two distinct paths: a **Write Model** that processes state-changing commands and a **Read Model** optimized exclusively for queries.

> [!TIP]
> **The Golden Rule:** Start with simple CRUD or Logical CQRS within a single database; adopt Physical CQRS only when read and write workloads diverge significantly or demand specialized search indexing. Synchronize projections asynchronously via the Transactional Outbox Pattern and treat all read models as disposable, rebuildable projections.

---

## 1. Visual Mental Models

### Unified CRUD Contention vs. Physical CQRS Segregation

A single model forces compromises between transactional safety and query performance; CQRS optimizes both paths independently:

```mermaid
flowchart TD
    subgraph AntiPattern ["1. Unified CRUD Model (High Contention)"]
        UI1["Client UI"] --> CRUD["Monolithic API Handler"]
        CRUD -->|"Writes & Reads compete for locks"| DB1[("Single Normalized DB<br/>Heavy 6-table JOINs slow down writes")]
    end

    subgraph CQRS ["2. Physical CQRS Architecture (Optimized Paths)"]
        CLIENT["Client UI"]
        
        subgraph CommandSide ["Write Path (Commands: Focus on Invariants)"]
            CMD["POST /api/orders (PlaceOrder)"] --> WRITER["Command Handler"]
            WRITER --> DB_W[("PostgreSQL Write Store<br/>(3NF Normalized, Strict Constraints)")]
            DB_W --> OUTBOX[("webhook_outbox table")]
        end

        subgraph ProjectionTier ["Event Relay & Projection Engine"]
            OUTBOX -.->|"Debezium / Worker Relay"| PROJ["Projector Worker"]
            PROJ -->|"Idempotent UPSERT"| DB_R[("Read Store (Elasticsearch / Redis)<br/>Pre-joined, Denormalized JSON")]
        end

        subgraph QuerySide ["Read Path (Queries: Focus on Latency)"]
            CLIENT -.->|"GET /api/orders/1042/summary"| QUERY["Query Handler"]
            QUERY -.->|"O(1) Direct Document Lookup (0 JOINs)"| DB_R
        end

        CLIENT --> CMD
    end

    classDef uni fill:#ffebee,stroke:#c62828,stroke-width:2px;
    classDef w fill:#e1f5fe,stroke:#0288d1,stroke-width:2px;
    classDef p fill:#fff3e0,stroke:#f57c00,stroke-width:2px;
    classDef r fill:#e8f5e9,stroke:#388e3c,stroke-width:2px;

    class UI1,CRUD,DB1 uni;
    class CMD,WRITER,DB_W,OUTBOX w;
    class PROJ,DB_R p;
    class QUERY r;
```

### Read-Your-Writes Inconsistency & The Optimistic UI Mitigation

Because projections are asynchronous, a user who executes a write may read their own stale state unless the application handles the replication lag:

```mermaid
sequenceDiagram
    autonumber
    actor User as Shopper
    participant Client as Frontend SPA
    participant API as Command API
    participant DB as Postgres Write Model
    participant Proj as Projector Worker
    participant ReadDB as Elasticsearch Read Model

    User->>Client: Click "Place Order" ($150)
    Client->>API: POST /api/v1/orders (PlaceOrderCommand)
    API->>DB: INSERT INTO orders ... (Committed in 12ms)
    API-->>Client: 201 Created {"order_id": 1042, "status": "PENDING", "total": 150}
    
    rect rgb(255, 240, 245)
        Note over DB,ReadDB: Asynchronous Projection Lag (Takes 500ms)
        DB-.->Proj: CDC / Outbox Event: OrderCreated
        Proj-.->ReadDB: Index document orders_summary/1042
    end

    Note over Client: User immediately navigates to /orders/1042
    Client->>ReadDB: GET /api/v1/orders/1042 (Hits lagging read model at T=50ms!)
    Note over ReadDB: Document not indexed yet! Returns 404 Not Found!
    
    Note over Client: Mitigation: Optimistic UI or Sticky Routing
    Note over Client: Option A: Render state returned directly in 201 Created response!
    Note over Client: Option B: Query Write DB directly for the acting user's recent updates!
```

---

## 2. Structured Reference Grids

### The CQRS Implementation Spectrum

| Architectural Model | Write Store | Read Store | Sync Mechanism | Consistency Model | Operational Complexity |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Simple CRUD** | Shared Database | Shared Database | N/A (Same tables) | Strict Immediate | **Lowest** (Recommended default) |
| **Logical CQRS** | Normalized Tables | Materialized Views | DB Triggers / Same TX | **Strict Immediate** | **Low** (Clean code separation) |
| **Physical CQRS** | PostgreSQL | Elasticsearch / Mongo | Outbox + Projector | **Eventual Consistency** | **High** (Handles asymmetric scale) |
| **CQRS + Event Sourcing**| Append-Only Event Store| Read Projections | Stream Subscriptions | Eventual Consistency | **Highest** (Audit & time-travel) |

### Command vs. Query Responsibility Invariants

| Attribute | Command Path (Write Model) | Query Path (Read Model) |
| :--- | :--- | :--- |
| **Intent** | Change system state (`PlaceOrder`, `CancelSubscription`) | Fetch data for presentation (`GetCustomerOrders`) |
| **Side Effects** | **Mandatory** (Mutates state, emits domain events) | **Forbidden** (Strictly idempotent and read-only) |
| **Return Value** | Minimal (ID of created entity, success status, or errors) | Rich, nested, pre-aggregated View-Models |
| **Schema Normalization**| **3NF Normalized** (Enforces referential integrity) | **Denormalized** (Pre-joined, 0 SQL JOIN operations) |
| **Performance Focus** | Transaction throughput, consistency, lock isolation | Low read latency, massive horizontal read caching |

---

## 3. Production War Story

### The Black Friday Desync & The Disappearing Order Support Avalanche

#### The Incident
An international retailer adopted Physical CQRS ahead of Black Friday. Checkout commands wrote orders to PostgreSQL and published an `OrderCreated` message directly to Kafka. A fleet of Elasticsearch projectors consumed from Kafka to build denormalized search documents. When checkout volume spiked to 8,000 orders per minute, Kafka consumer lag surged to 45 seconds. Shoppers clicking "Place Order" were redirected to the `/order-confirmation` page. The page queried Elasticsearch and displayed: `"Error: Order Not Found"`. Convinced their transaction had failed, thousands of shoppers pressed checkout again, resulting in 18,000 duplicate orders and a customer support meltdown.

```mermaid
sequenceDiagram
    autonumber
    actor Shopper as 8,000 Shoppers / Minute
    participant Web as Checkout Frontend
    participant API as Order API (Command)
    participant PG as Postgres (Write Model)
    participant Kafka as Kafka Broker (Lag: 45s)
    participant ES as Elasticsearch (Read Model)

    Shopper->>Web: Click "Place Order"
    Web->>API: POST /api/orders
    API->>PG: INSERT order (Success!)
    API->>Kafka: Publish OrderCreated
    API-->>Web: Redirect to /orders/confirm?id=1042
    
    Note over Kafka: High traffic: Kafka partition queue delayed by 45 seconds!
    Web->>ES: GET /api/orders/1042 (Hits Read Model)
    ES-->>Web: 404 NOT FOUND!
    Web-->>Shopper: "Error: Order not found! Please try again."
    Shopper->>Web: Re-clicks "Place Order" (Duplicate orders created!)
```

#### The Root Cause
1. **Read-Your-Writes Failure:** The frontend redirected the customer to an eventually consistent read model immediately after a write without verifying projection completion.
2. **Missing Outbox Guarantee:** The post-commit Kafka publish dropped messages whenever a worker crashed between writing to Postgres and publishing to Kafka.

#### The Verified Production Fix
1. Modified the `PlaceOrder` command response to return the fully populated order snapshot directly in the `201 Created` HTTP response, allowing the frontend to render confirmation optimistically without hitting Elasticsearch.
2. Configured "Sticky Session" read routing: if a user queries an order within 60 seconds of modifying it, the API routes the query directly to the PostgreSQL primary write database.
3. Implemented a nightly reconciliation script that re-projects any drifted Elasticsearch documents from the authoritative PostgreSQL database.

---

## 4. Multi-Language Production Implementations

### Go (Command Handler + Outbox + Asynchronous Read Model Projector)

```go
package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"time"

	_ "github.com/lib/pq"
)

type OrderReadModel struct {
	OrderID     int       `json:"order_id"`
	Customer    string    `json:"customer"`
	TotalAmount float64   `json:"total_amount"`
	ItemCount   int       `json:"item_count"`
	Status      string    `json:"status"`
	UpdatedAt   time.Time `json:"updated_at"`
}

type CQRSManager struct {
	db *sql.DB
}

func NewCQRSManager(db *sql.DB) *CQRSManager {
	return &CQRSManager{db: db}
}

// 1. Command Side: Strict validation, normalized write, and transactional outbox
func (m *CQRSManager) HandlePlaceOrderCommand(ctx context.Context, customer string, amount float64, items int) (int, error) {
	tx, err := m.db.BeginTx(ctx, nil)
	if err != nil {
		return 0, err
	}
	defer tx.Rollback()

	// Write to normalized write table
	var orderID int
	err = tx.QueryRowContext(ctx, `
		INSERT INTO orders (customer_name, total_amount, item_count, status) 
		VALUES ($1, $2, $3, 'PENDING') RETURNING id;
	`, customer, amount, items).Scan(&orderID)
	if err != nil {
		return 0, fmt.Errorf("insert order: %w", err)
	}

	// Atomically write projection event to outbox
	payload, _ := json.Marshal(map[string]interface{}{
		"order_id": orderID, "customer": customer, "total": amount, "items": items, "status": "PENDING",
	})
	_, err = tx.ExecContext(ctx, `
		INSERT INTO outbox_events (event_type, payload) VALUES ('OrderCreated', $1);
	`, payload)
	if err != nil {
		return 0, fmt.Errorf("insert outbox: %w", err)
	}

	return orderID, tx.Commit()
}

// 2. Projector Engine: Consumes outbox events and updates denormalized read model
func (m *CQRSManager) ProjectOrderCreated(ctx context.Context, payload []byte) error {
	var data map[string]interface{}
	if err := json.Unmarshal(payload, &data); err != nil {
		return err
	}

	orderID := int(data["order_id"].(float64))
	customer := data["customer"].(string)
	total := data["total"].(float64)
	items := int(data["items"].(float64))
	status := data["status"].(string)

	// Idempotent UPSERT into denormalized read-model table
	_, err := m.db.ExecContext(ctx, `
		INSERT INTO order_views (order_id, customer, total_amount, item_count, status, updated_at)
		VALUES ($1, $2, $3, $4, $5, NOW())
		ON CONFLICT (order_id) DO UPDATE SET
			status = EXCLUDED.status,
			total_amount = EXCLUDED.total_amount,
			updated_at = NOW();
	`, orderID, customer, total, items, status)

	log.Printf("[Projector] Denormalized view updated for Order %d", orderID)
	return err
}

// 3. Query Side: Blazing fast single-key lookup with 0 SQL joins
func (m *CQRSManager) QueryOrderSummary(ctx context.Context, orderID int) (*OrderReadModel, error) {
	row := m.db.QueryRowContext(ctx, `
		SELECT order_id, customer, total_amount, item_count, status, updated_at 
		FROM order_views WHERE order_id = $1;
	`, orderID)

	var vm OrderReadModel
	if err := row.Scan(&vm.OrderID, &vm.Customer, &vm.TotalAmount, &vm.ItemCount, &vm.Status, &vm.UpdatedAt); err != nil {
		return nil, err
	}
	return &vm, nil
}
```

---

### Node.js / TypeScript (Express Command & Query Route Handlers)

```typescript
import { Router, Request, Response } from 'express';
import { Pool } from 'pg';

const router = Router();
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// ==============================================================================
// 1. Command Side: POST /api/orders (Processes Intent, Enforces Business Rules)
// ==============================================================================
router.post('/api/orders', async (req: Request, res: Response) => {
  const { customer, items, totalAmount } = req.body;

  // Validation
  if (!items || items.length === 0) {
    return res.status(400).json({ error: 'Order must contain at least one item' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Insert into normalized write model
    const insertRes = await client.query(
      `INSERT INTO orders_write_model (customer, total_amount, status) 
       VALUES ($1, $2, 'CONFIRMED') RETURNING id;`,
      [customer, totalAmount]
    );
    const orderId = insertRes.rows[0].id;

    // Insert into outbox for asynchronous projection
    await client.query(
      `INSERT INTO projection_outbox (event_type, payload) VALUES ('OrderPlaced', $1);`,
      [JSON.stringify({ orderId, customer, totalAmount, status: 'CONFIRMED' })]
    );

    await client.query('COMMIT');

    // Mitigate read-your-writes: Return the complete state snapshot directly!
    return res.status(201).json({
      orderId,
      customer,
      totalAmount,
      status: 'CONFIRMED',
      message: 'Order placed successfully',
    });
  } catch (err: any) {
    await client.query('ROLLBACK');
    return res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// ==============================================================================
// 2. Query Side: GET /api/orders/:id/summary (Reads from Denormalized Store)
// ==============================================================================
router.get('/api/orders/:id/summary', async (req: Request, res: Response) => {
  const orderId = parseInt(req.params.id, 10);

  // Fast single-key lookup on denormalized read table
  const result = await pool.query(
    `SELECT * FROM order_summaries_read_model WHERE order_id = $1;`,
    [orderId]
  );

  if (result.rows.length === 0) {
    return res.status(404).json({ error: 'Order summary not found or projection lagging' });
  }

  return res.status(200).json(result.rows[0]);
});

export default router;
```

---

### Python (`FastAPI` Write Model + Materialized View Projection)

```python
import json
from fastapi import FastAPI, HTTPException, status
from pydantic import BaseModel
import psycopg

app = FastAPI()
DB_URL = "postgresql://postgres:postgres@localhost:5432/cqrs_demo"

class PlaceOrderCommand(BaseModel):
    customer_id: int
    amount: float
    sku: str

# 1. Command Side (Write Model)
@app.post("/api/v1/orders", status_code=status.HTTP_201_CREATED)
def place_order(cmd: PlaceOrderCommand):
    with psycopg.connect(DB_URL) as conn:
        with conn.cursor() as cur:
            # Enforce validation and normalized insert
            cur.execute(
                "INSERT INTO orders (customer_id, amount, sku, status) VALUES (%s, %s, %s, 'NEW') RETURNING id;",
                (cmd.customer_id, cmd.amount, cmd.sku)
            )
            order_id = cur.fetchone()[0]

            # Emit to outbox
            event_payload = json.dumps({"order_id": order_id, "customer_id": cmd.customer_id, "amount": cmd.amount})
            cur.execute("INSERT INTO outbox (event, payload) VALUES ('OrderCreated', %s);", (event_payload,))
            conn.commit()

    return {"order_id": order_id, "status": "NEW"}

# 2. Query Side (Read Model)
@app.get("/api/v1/orders/{order_id}/view")
def get_order_view(order_id: int):
    with psycopg.connect(DB_URL) as conn:
        with conn.cursor() as cur:
            # Query fast pre-joined materialized view
            cur.execute("SELECT order_id, customer_name, amount, sku FROM order_views WHERE order_id = %s;", (order_id,))
            row = cur.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Order view not found or pending projection")
            return {"order_id": row[0], "customer": row[1], "amount": float(row[2]), "sku": row[3]}
```

---

## 5. Practical Hands-On Verification

### 1. Execute Command via Terminal

```bash
curl.exe -i -X POST http://localhost:8000/api/v1/orders \
  -H "Content-Type: application/json" \
  -d '{"customer_id": 42, "amount": 129.99, "sku": "KEYBOARD-RGB"}'
```

**Output:**
```http
HTTP/1.1 201 Created
Content-Type: application/json

{"order_id": 8901, "status": "NEW"}
```

### 2. Query Fast Read Model

Query the pre-joined read model view:

```bash
curl.exe -i -X GET http://localhost:8000/api/v1/orders/8901/view
```

**Output:**
```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "order_id": 8901,
  "customer": "Alice",
  "amount": 129.99,
  "sku": "KEYBOARD-RGB"
}
```

---

## 6. Operational Validation Checkpoints

<details>
<summary><strong>Checkpoint 1: The Read-Your-Writes Inconsistency Trap</strong></summary>

**Scenario:** A user updates their profile name from "Alice" to "Alicia". The API returns `200 OK`. The user refreshes the page, but the dashboard still displays "Alice" for 3 seconds before switching to "Alicia". What caused this, and how is it resolved?

*Explanation:*
In Physical CQRS, the read store updates asynchronously via an event stream. There is an unavoidable delay (**Projection Lag**) between the write model commit and the read model update.
**The Fixes:**
1. **Optimistic UI:** The frontend immediately renders the updated value returned in the command response without re-fetching from the read store.
2. **Read-Your-Writes Consistency Cookie:** The server sets a cookie with the write timestamp (`t=1794229200`). Subsequent queries compare this timestamp against the read store's `updated_at`. If the read store lags behind, the query handler routes the read directly to the primary write database.
</details>

<details>
<summary><strong>Checkpoint 2: The Disposable Read Model Rebuild Superpower</strong></summary>

**Scenario:** A bug in your projector script ran in production for 2 days, causing the `item_count` column in the read database to be miscalculated by 1 on every update. In a standard CRUD application, fixing this requires complex data patch scripts. How does CQRS handle this?

*Explanation:*
In CQRS, **the read model is derived and disposable**. The write database is the single immutable source of truth.
**The Solution:**
1. Deploy the bugfix to the projector code.
2. Drop the corrupted read table or create a new index (`order_views_v2`).
3. Run a replay script that iterates over all records in the write database and re-runs the projector from scratch.
4. Flip a zero-downtime database alias to point to the new read model.
</details>

<details>
<summary><strong>Checkpoint 3: Dogmatic CQRS for Simple CRUD Systems</strong></summary>

**Scenario:** A startup is building an internal employee directory (500 employees, 2 updates per week, 50 searches per day). The lead architect insists on deploying PostgreSQL for writes, Kafka for events, and Elasticsearch for reads. Why is this an anti-pattern?

*Explanation:*
This is **Cargo-Cult Over-Engineering**. CQRS introduces massive operational overhead: managing two database systems, eventual consistency lag, schema migration synchronization, and outbox relay infrastructure.
**The Rule:** If a single PostgreSQL instance running standard indexes and simple SQL queries handles your throughput with $< 20\text{ms}$ latency, **do not use Physical CQRS**. Use a standard CRUD model until clear scale bottlenecks emerge.
</details>

---

## Next

[06-event-sourcing](../06-event-sourcing/README.md) — CQRS split the write model from
the read model, and a recurring note has been that the write side is really a
*sequence of state changes* (`PlaceOrder`, `CancelOrder`) and that read models are
*derived* by applying those changes. Event sourcing takes that to its logical
conclusion: instead of storing the *current state* and mutating it in place, store
the **full, immutable sequence of events** that produced it, and reconstruct state by
replaying them. The next module shows how that gives you a perfect audit log,
time-travel, and trivially-rebuildable CQRS read models — and what it costs in
complexity, event versioning, and snapshotting.
