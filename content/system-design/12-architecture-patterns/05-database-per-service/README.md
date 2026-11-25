# Database per Service: Why Microservices Shouldn't Share a Database

> **Prerequisites:** [Bounded Contexts](../04-bounded-contexts/README.md).  
> **Estimated Reading Time:** 25–28 minutes  
> **Target Audience:** Backend engineers designing microservice data layers, and system design candidates asked "How do you query across services if each microservice has its own database?"  
> **Free PDF Notes:** [Download SD-L-005.pdf](https://backendroadmap.com/notes/system-design/SD-L-005.pdf)

> [!NOTE]
> **In one line:** **Database per Service** mandates that each microservice's persistent data is **private to that service**—other services may never read or write its tables directly, and must instead go through its **API or domain events**. Sharing a database turns independent microservices into a **schema-coupled distributed monolith** with a single point of contention and failure.

> [!TIP]
> **The Golden Rule:** **Private data, public contracts.** A service's database schema is an internal implementation detail—not an integration API. When you need data from multiple services in one view, use **API Composition** (for simple low-fan-out reads) or **CQRS Event-Driven Projections** (for high-throughput or complex joins), and use **Sagas** (not 2PC) for cross-service writes.

---

## 1. What Database per Service Is, and What It Isn't

A team splits a monolith into `OrdersService` and `BillingService`, but keeps both pointing at the same `prod-postgres` database and lets `BillingService` run `SELECT * FROM orders JOIN order_items ...` directly. Three months later, `OrdersService` renames `total_cents` to `net_amount_cents`—and `BillingService` crashes in production. Worse, a heavy analytics query in `BillingService` locks the `orders` table and takes down checkout. **Database per Service** prevents this by making every service's data store strictly private.

| Term | Precise Meaning | Example |
| :--- | :--- | :--- |
| **Database per Service** | Each microservice owns private storage; zero direct DB access by others | `Orders` owns Postgres; `Catalog` owns Elasticsearch |
| **Shared Database Anti-Pattern** | Multiple services reading/writing the same tables directly | `Billing` running SQL `JOIN`s on `orders` tables |
| **Private Schema / Logical Isolation** | Separate schema + separate DB credentials per service on a shared cluster | `orders_user` can only access `orders.*` (cheaper stepping stone) |
| **Dedicated Instance / Polyglot Persistence** | Separate DB server/engine tailored to each service's workload | `Orders` on Postgres, `Cart` on Redis, `Search` on OpenSearch |
| **API Composition** | Aggregator calls multiple services' APIs and joins results in memory | BFF calls `OrdersAPI` + `CustomerAPI` for Order Detail page |
| **CQRS Read Projection** | Service maintains a local read-only copy updated via domain events | `OrderHistory` subscribes to `OrderPlaced` & `ShipmentDispatched` |
| **Saga Pattern** | Sequence of local transactions coordinated via events/compensations | `ReserveStock` $\rightarrow$ `ChargeCard` (compensate on failure) |
| **Not** | "Every microservice MUST have a separate expensive RDS cluster on day one" | Private tables/schemas with strict RBAC achieve logical isolation first |

### Why It Matters
1. **True Independent Deployment:** A team can migrate schemas, add indexes, or switch from SQL to DynamoDB without notifying other teams.
2. **Fault & Contention Isolation:** A runaway query or connection-pool leak in `Reporting` cannot lock `Orders` tables or exhaust `Orders`'s DB connections.
3. **Polyglot Persistence:** Each service chooses the optimal engine (ACID SQL for ledger, Redis for sessions, Elastic for full-text search).

---

## 2. Anatomy: Shared DB Anti-Pattern vs Database per Service (with CQRS & API Composition)

```mermaid
flowchart LR
    subgraph bad["Shared Database Anti-Pattern"]
        S_ORD["Orders Service"] --> S_DB[("Shared Orders + Billing DB")]
        S_BIL["Billing Service"] --> S_DB
        S_REP["Reporting Service"] -->|"locks tables!"| S_DB
    end
    subgraph good["Database per Service (Private Storage + Event Sync)"]
        G_ORD["Orders Service"] --> O_DB[("Orders Postgres")]
        G_CAT["Catalog Service"] --> C_DB[("Catalog Mongo/Elastic")]
        G_ORD -->|"OrderPlaced Event"| K[("Kafka / Broker")]
        G_CAT -->|"PriceUpdated Event"| K
        K --> G_CQRS["OrderHistory Read Service"]
        G_CQRS --> Q_DB[("Denormalized Read DB")]
    end
```

| Pattern | Consistency | Read Latency | Write Complexity | When to Use |
| :--- | :--- | :---: | :--- | :--- |
| **Shared Database** | Strong (local ACID) | Fast (`JOIN`) | Simple (single tx) | **Only** inside a Modular Monolith, never across microservices |
| **DB per Service + API Composition** | Strong per service | Medium (max of RPCs) | N/A (read-only) | Simple 2–3 service lookups by ID |
| **DB per Service + CQRS Projection** | Eventual (ms–sec lag) | **Very Fast** (1 local read) | Needs Outbox + idempotent consumer | Complex joins, search, high-RPS dashboards |
| **DB per Service + Saga** | Eventual (compensable) | N/A (write path) | High (compensating actions) | Multi-service workflows (`Order` + `Payment` + `Inventory`) |

> [!WARNING]
> **The Two-Phase Commit (2PC / XA) Trap:** Never use distributed 2PC locks across microservices to simulate a shared-database ACID transaction. 2PC holds locks across network round-trips, slashes throughput, and blocks completely if the coordinator crashes. Use **Transactional Outbox + Sagas** instead.

---

## 3. Mathematical Model: Connection Pool Exhaustion, Cross-Service Join Cost & Replication Lag

**1. Connection Pool Contention in a Shared Database.** Suppose a PostgreSQL primary supports $C_{\max} = 200$ active connections safely.
- **Shared DB:** 8 services $\times$ 4 replicas $\times$ 10 pool connections $= 320 > 200$ connections! A spike in `Reporting` saturates all connections and starves `Checkout`.
- **Database per Service:** `Checkout` owns a dedicated DB with $C_{\max} = 200$ exclusively for its 4 replicas ($4 \times 25 = 100$ connections, $50\%$ headroom). Blast radius of `Reporting` spiking = **0%**.

**2. API Composition vs CQRS Read Latency.** Suppose an Order History page needs data from $k = 3$ services (`Orders`, `Customers`, `Shipping`), each with $p_{50} = 6\text{ ms}$, $p_{99} = 45\text{ ms}$:
- **API Composition (Parallel):**

$$T_{\text{comp}, p_{99}} \approx t_{\text{merge}} + \max_{i=1..k} T_{i, p_{99}} \approx 2\text{ ms} + 45\text{ ms} \text{ (and } 1 - 0.99^3 = 2.97\% \text{ tail hit)}$$

And if it requires **paginated filtering across two services** (e.g., *"Orders over $100 shipped to Berlin"*), API Composition degrades to fetching $O(N)$ rows over the network and joining in RAM—completely unscalable.
- **CQRS Denormalized Projection:** All fields are pre-joined into one local table/index. Read latency is a **single local query**:

$$T_{\text{cqrs}, p_{50}} \approx 4\text{ ms}, \qquad T_{\text{cqrs}, p_{99}} \approx 12\text{ ms}$$

with **zero** runtime dependency on `Orders`, `Customers`, or `Shipping` availability!

---

## 4. Metrics & Percentiles

| Metric | Meaning | Alert / Target |
| :--- | :--- | :--- |
| **Cross-Service DB Access Violations** | Service A authenticating to Service B's DB/schema | **Must be 0** (enforced by DB RBAC & network ACLs) |
| **CQRS Projection Lag ($p_{99}$)** | Time from upstream DB commit to read-model update | Alert if $> 2\text{ s}$ (or UX freshness SLO) |
| **Outbox Relay Backlog** | Unpublished events sitting in service's `outbox` table | Alert if $> 1{,}000$ rows or age $> 5\text{ s}$ |
| **API Composition Fan-Out** | Number of downstream RPCs per read endpoint | Keep $\le 3$; switch to CQRS if $> 3$ or paginated |
| **DB Connection Pool Utilization** | Active / max connections per service DB | Alert at $> 75\%$ |

### Worked Example (Replacing a Cross-Service SQL `JOIN`)
In a monolith, `GET /users/42/orders?status=SHIPPED` ran:
`SELECT o.id, o.total, s.tracking_no FROM orders o JOIN shipments s ON o.id = s.order_id WHERE o.user_id = 42 AND s.status = 'SHIPPED'`.
When `Orders` and `Shipping` become separate services with private databases:
1. `Orders` commits `OrderPlaced` + outbox row locally and publishes to Kafka.
2. `Shipping` commits `ShipmentUpdated(orderId, trackingNo, status)` + outbox row locally and publishes to Kafka.
3. A lightweight `OrderHistory` read service consumes both events idempotently and upserts a single denormalized `order_history_view(order_id, user_id, total, tracking_no, shipping_status)` table.
4. `GET /users/42/orders?status=SHIPPED` hits **one indexed table** in **5 ms**—even if `Orders` or `Shipping` is temporarily down.

---

## 5. Compounding & Failure Modes: Shared DB vs Private DB Under Load

| Scenario | Shared Database | Database per Service (with CQRS/Outbox) |
| :--- | :--- | :--- |
| **Reporting runs unindexed `LIKE '%foo%'` query** | Saturates shared CPU/IOPS $\rightarrow$ **Checkout times out** | Only Reporting's read DB slows down; **Checkout unaffected** |
| **`Orders` renames `price` $\rightarrow$ `unit_price_cents`** | **Breaks `Billing` & `Analytics` in prod** | `Orders` migrates internal table; Published Language event unchanged |
| **Need full-text fuzzy product search** | Forced into slow Postgres `ILIKE` | `Catalog` uses OpenSearch while `Billing` stays on Postgres |
| **Outbox relay crashes for 3 minutes** | N/A | Orders still succeed; CQRS read view lags 3 min then catches up |

---

## 6. Numbers Every Engineer Must Know

| Item | Typical | Implication |
| :--- | :---: | :--- |
| DB RBAC isolation cost | $0 (built into Postgres/MySQL) | Start with separate schemas + separate DB users immediately |
| Outbox + Kafka projection lag ($p_{50}$ / $p_{99}$) | 20–100 ms / 500 ms | Fast enough for 95% of UIs; design UX for brief eventual consistency |
| API Composition practical limit | 2–3 services, < 50 rows | Beyond this, cross-service pagination/filtering breaks down |
| 2PC / XA distributed lock overhead | 5–10x latency, blocks on failure | Avoid in microservices; use Sagas + Outbox |
| Dedicated managed DB floor cost | ~$15–$100+/mo per instance | Use logical schema-per-service on 1 cluster until scale requires separate servers |

---

## 7. Mechanism Deep Dive: Outbox + CQRS Projection Flow

```mermaid
sequenceDiagram
    participant C as Client
    participant O as Orders Service
    participant ODB as Orders DB (Private)
    participant Relay as Outbox Relay / CDC
    participant B as Kafka Broker
    participant H as OrderHistory Read Service
    participant HDB as Read View DB (Private)

    C->>O: POST /orders
    O->>ODB: BEGIN TX -> INSERT orders + INSERT outbox(OrderPlaced) -> COMMIT
    O-->>C: 201 Created (12 ms)
    Relay->>ODB: Poll/CDC outbox table
    Relay->>B: Publish OrderPlaced (event_id=evt-99)
    B->>H: Deliver OrderPlaced
    H->>HDB: Upsert view WHERE event_id not processed (Idempotent)
```

| Question | Answer |
| :--- | :--- |
| **Do I need separate physical RDS/Postgres servers for every service on day one?** | **No.** You can host 5 private **schemas** (`orders.*`, `billing.*`, `shipping.*`) on **one** PostgreSQL cluster, provided each service has its own DB credentials (`GRANT` only to its own schema) and zero cross-schema `JOIN`s. Split to separate physical servers when IOPS, connections, or engine needs diverge. |
| **How do you enforce foreign-key integrity if tables are in different databases?** | You **cannot** use SQL `FOREIGN KEY` constraints across separate databases. Instead, enforce **eventual referential integrity** via validation at the API/Saga layer and compensating actions (e.g., if `ProductID` is deleted, emit `ProductDiscontinued` so `Cart` removes it). |
| **How do you handle read-your-own-writes with CQRS eventual consistency?** | Return the newly created resource in the `POST` response (`201 Created` with full JSON), or optimistically update the client UI while the 50 ms projection catches up. |
| **What if a service needs to update data in two services atomically?** | Use the **Saga Pattern** (Choreography via events or Orchestration via a state machine like Temporal) with idempotent steps and compensating transactions (`RefundPayment` if `ReserveInventory` fails). |

**When NOT to use Physical Database per Service:**
- Inside a **Modular Monolith** (use logical schema-per-module on one DB until you extract the service).
- For **BI / Data Warehouse analytics**—never query microservice operational DBs directly; stream CDC/events into a dedicated Data Warehouse (BigQuery, Snowflake, ClickHouse).

---

## 8. Hierarchical Budgets & Design Rules

| Slice | Rule | Control |
| :--- | :--- | :--- |
| **Access Control** | 1 service = 1 DB user/role with access ONLY to its own schema/DB | Terraform/IAM + Postgres `REVOKE ALL` |
| **Integration** | Zero direct SQL queries, views, or DB links across service boundaries | Network security groups + CI SQL checks |
| **Dual Writes** | Never write to DB and publish to Kafka without an Outbox/CDC | Transactional Outbox pattern |
| **Read Joins** | Use API Composition ($\le 3$ services) or CQRS Read Models | Ban cross-service pagination via RPCs |
| **Write Consistency** | Use Sagas (local ACID + compensating actions), never 2PC | Idempotency keys on every Saga step |
| **Analytics** | Stream events/CDC to Data Warehouse; never hit prod OLTP DBs | Debezium / Kafka Connect to warehouse |

---

## 9. Top Mitigations (Making Database per Service Work in Production)

1. **Enforce private DB credentials**—never give two services the same `DATABASE_URL` or superuser role.
2. **Start with Schema-per-Service on one cluster** to save cost/ops, then move hot services to dedicated DB instances when IOPS/connections demand it.
3. **Always pair Database per Service with the Transactional Outbox** so DB writes and domain events never drift out of sync.
4. **Make every CQRS projection consumer idempotent** (deduplicate by `event_id` or `version` timestamp) to handle at-least-once delivery and out-of-order events.
5. **Use API Composition only for simple ID lookups**, and switch to **CQRS projections** the moment you need cross-service filtering, sorting, or pagination.
6. **Design Sagas with compensating actions** for multi-service writes instead of distributed 2PC locks.
7. **Feed BI/analytics via CDC/events** into a warehouse—never let data teams run `SELECT *` against microservice OLTP databases.

---

## 10. Production Reference / War Story: The "Shared DB Schema Migration" Outage

A SaaS platform had 6 microservices sharing a single MySQL instance with cross-service `JOIN`s. During a routine deploy, the `Auth` team ran `ALTER TABLE users MODIFY COLUMN phone VARCHAR(32)` to support international extensions.

```mermaid
flowchart LR
    Auth["Auth Deploy"] -->|"ALTER TABLE users (Metadata Lock)"| MySQL[("Shared MySQL")]
    Billing["Billing Service"] -->|"JOIN users (blocked on lock)"| MySQL
    Orders["Orders Service"] -->|"JOIN users (blocked on lock)"| MySQL
    MySQL -->|"Connection Pool Exhausted across ALL 6 services"| Down["Site-Wide SEV-1 Outage"]
```

- **What Happened (Root Cause):** The `ALTER TABLE` acquired a metadata lock on `users`. Because `Orders`, `Billing`, and `Notifications` all ran `JOIN users` queries directly against the shared DB, every thread pool in all 6 services piled up waiting on the lock, exhausting DB connections and causing a **42-minute site-wide outage**.
- **The Fix:** The team isolated `Auth` into its own private PostgreSQL database, exposed a cached `UserProfile` gRPC endpoint + `UserUpdated` Kafka event, and migrated `Orders` and `Billing` to store local read-only snapshots of `user_email` and `user_name`. Subsequent `Auth` migrations had **zero** blast radius on checkout.
- **Lesson:** A shared database couples not just your schemas, but your **locks, migrations, and failure domains**.

---

## 11. Multi-Language Production Code Tabs

An **Idempotent CQRS Read-Model Projection** receiving events from two separate services (`Orders` and `Shipping`)—using `Version` / `ProcessedEvents` deduplication so cross-service joins work cleanly without a shared database.

````carousel
```go
// Go: Idempotent CQRS Read-Model Projector joining Orders + Shipping events into a private read view.
package main

import (
	"fmt"
	"sync"
)

type OrderPlaced struct {
	EventID    string
	OrderID    string
	CustomerID string
	TotalCents int64
}

type ShipmentUpdated struct {
	EventID    string
	OrderID    string
	TrackingNo string
	Status     string
}

type OrderHistoryRow struct {
	OrderID        string
	CustomerID     string
	TotalCents     int64
	TrackingNo     string
	ShippingStatus string
}

type OrderHistoryProjector struct {
	mu        sync.Mutex
	processed map[string]bool
	view      map[string]*OrderHistoryRow
}

func NewProjector() *OrderHistoryProjector {
	return &OrderHistoryProjector{
		processed: make(map[string]bool),
		view:      make(map[string]*OrderHistoryRow),
	}
}

func (p *OrderHistoryProjector) OnOrderPlaced(e OrderPlaced) {
	p.mu.Lock()
	defer p.mu.Unlock()
	if p.processed[e.EventID] {
		return // Idempotent: ignore duplicate delivery
	}
	row := p.getOrCreate(e.OrderID)
	row.CustomerID = e.CustomerID
	row.TotalCents = e.TotalCents
	if row.ShippingStatus == "" {
		row.ShippingStatus = "PENDING"
	}
	p.processed[e.EventID] = true
}

func (p *OrderHistoryProjector) OnShipmentUpdated(e ShipmentUpdated) {
	p.mu.Lock()
	defer p.mu.Unlock()
	if p.processed[e.EventID] {
		return
	}
	row := p.getOrCreate(e.OrderID)
	row.TrackingNo = e.TrackingNo
	row.ShippingStatus = e.Status
	p.processed[e.EventID] = true
}

func (p *OrderHistoryProjector) getOrCreate(orderID string) *OrderHistoryRow {
	if _, ok := p.view[orderID]; !ok {
		p.view[orderID] = &OrderHistoryRow{OrderID: orderID}
	}
	return p.view[orderID]
}

func main() {
	proj := NewProjector()
	proj.OnOrderPlaced(OrderPlaced{"evt-1", "ORD-55", "CUST-9", 4999})
	proj.OnShipmentUpdated(ShipmentUpdated{"evt-2", "ORD-55", "TRK-991", "SHIPPED"})
	proj.OnShipmentUpdated(ShipmentUpdated{"evt-2", "ORD-55", "TRK-991", "SHIPPED"}) // duplicate ignored
	fmt.Printf("Read View: %+v\n", *proj.view["ORD-55"])
}
```
<!-- slide -->
```typescript
// TypeScript: Idempotent CQRS Read-Model Projector combining Orders & Shipping events.
export interface OrderHistoryView {
  orderId: string;
  customerId?: string;
  totalCents?: number;
  trackingNo?: string;
  shippingStatus: string;
}

export class OrderHistoryProjector {
  private processedEvents = new Set<string>();
  private views = new Map<string, OrderHistoryView>();

  onOrderPlaced(evt: { eventId: string; orderId: string; customerId: string; totalCents: number }): void {
    if (this.processedEvents.has(evt.eventId)) return; // idempotent
    const row = this.views.get(evt.orderId) ?? { orderId: evt.orderId, shippingStatus: "PENDING" };
    row.customerId = evt.customerId;
    row.totalCents = evt.totalCents;
    this.views.set(evt.orderId, row);
    this.processedEvents.add(evt.eventId);
  }

  onShipmentUpdated(evt: { eventId: string; orderId: string; trackingNo: string; status: string }): void {
    if (this.processedEvents.has(evt.eventId)) return;
    const row = this.views.get(evt.orderId) ?? { orderId: evt.orderId, shippingStatus: "PENDING" };
    row.trackingNo = evt.trackingNo;
    row.shippingStatus = evt.status;
    this.views.set(evt.orderId, row);
    this.processedEvents.add(evt.eventId);
  }

  getOrder(orderId: string): OrderHistoryView | undefined {
    return this.views.get(orderId);
  }
}
```
<!-- slide -->
```python
# Python: Idempotent CQRS Read-Model Projector joining Orders & Shipping events.
from dataclasses import dataclass


@dataclass
class OrderHistoryView:
    order_id: str
    customer_id: str = ""
    total_cents: int = 0
    tracking_no: str = ""
    shipping_status: str = "PENDING"


class OrderHistoryProjector:
    def __init__(self) -> None:
        self._processed: set[str] = set()
        self._views: dict[str, OrderHistoryView] = {}

    def on_order_placed(self, event_id: str, order_id: str, customer_id: str, total_cents: int) -> None:
        if event_id in self._processed:
            return
        row = self._views.setdefault(order_id, OrderHistoryView(order_id=order_id))
        row.customer_id = customer_id
        row.total_cents = total_cents
        self._processed.add(event_id)

    def on_shipment_updated(self, event_id: str, order_id: str, tracking_no: str, status: str) -> None:
        if event_id in self._processed:
            return
        row = self._views.setdefault(order_id, OrderHistoryView(order_id=order_id))
        row.tracking_no = tracking_no
        row.shipping_status = status
        self._processed.add(event_id)

    def get_view(self, order_id: str) -> OrderHistoryView | None:
        return self._views.get(order_id)
```
<!-- slide -->
```csharp
// C#: Idempotent CQRS Read-Model Projector joining Orders & Shipping events.
using System.Collections.Generic;

public sealed class OrderHistoryView
{
    public required string OrderId { get; init; }
    public string CustomerId { get; set; } = "";
    public long TotalCents { get; set; }
    public string TrackingNo { get; set; } = "";
    public string ShippingStatus { get; set; } = "PENDING";
}

public sealed class OrderHistoryProjector
{
    private readonly HashSet<string> _processed = new();
    private readonly Dictionary<string, OrderHistoryView> _views = new();

    public void OnOrderPlaced(string eventId, string orderId, string customerId, long totalCents)
    {
        if (!_processed.Add(eventId)) return; // already processed
        var row = GetOrCreate(orderId);
        row.CustomerId = customerId;
        row.TotalCents = totalCents;
    }

    public void OnShipmentUpdated(string eventId, string orderId, string trackingNo, string status)
    {
        if (!_processed.Add(eventId)) return;
        var row = GetOrCreate(orderId);
        row.TrackingNo = trackingNo;
        row.ShippingStatus = status;
    }

    private OrderHistoryView GetOrCreate(string orderId)
    {
        if (!_views.TryGetValue(orderId, out var row))
        {
            row = new OrderHistoryView { OrderId = orderId };
            _views[orderId] = row;
        }
        return row;
    }
}
```
````

---

## 12. Hands-On CLI Verification Workflows

Verify PostgreSQL schema-level RBAC isolation (so `billing_svc` cannot `SELECT` from `orders.*`) and check Kafka consumer lag on a CQRS projector:

```bash
# 1. PostgreSQL: enforce Database-per-Service isolation via schemas & roles
psql "$ADMIN_DB_URL" -c "
CREATE SCHEMA IF NOT EXISTS orders;
CREATE SCHEMA IF NOT EXISTS billing;
CREATE ROLE orders_svc WITH LOGIN PASSWORD 'secret_o';
CREATE ROLE billing_svc WITH LOGIN PASSWORD 'secret_b';
REVOKE ALL ON SCHEMA orders, billing FROM PUBLIC;
GRANT USAGE, CREATE ON SCHEMA orders TO orders_svc;
GRANT USAGE, CREATE ON SCHEMA billing TO billing_svc;
"

# 2. Verify billing_svc is DENIED access to orders.orders
psql "postgres://billing_svc:secret_b@localhost:5432/app" -c "SELECT * FROM orders.orders;"
# Expected: ERROR: permission denied for schema orders

# 3. Monitor CQRS projection lag in Kafka
kafka-consumer-groups.sh --bootstrap-server localhost:9092 --describe --group order-history-projector
```

---

## 13. Common Mistakes to Avoid

1. **Sharing a database across microservices** for "convenience" (`JOIN`s), creating a distributed monolith.
2. **Giving all services the same DB superuser credentials**, making accidental cross-schema queries invisible.
3. **Using distributed Two-Phase Commit (2PC / XA)** across microservices instead of Sagas + Outbox.
4. **Using API Composition for paginated, filtered cross-service lists**, causing $O(N)$ memory joins.
5. **Publishing domain events without a Transactional Outbox**, leading to lost events and stale CQRS views.
6. **Forgetting idempotency in CQRS projectors**—duplicate or out-of-order events corrupt read models.
7. **Spinning up 20 separate RDS instances for a 5-person startup** when logical schema-per-service with strict RBAC gives isolation at 1/10th the cost.

---

## 14. Key Terms Glossary

| Key Term | Definition |
| :--- | :--- |
| **Database per Service** | Pattern where each microservice owns private persistent storage inaccessible directly to other services. |
| **Shared Database Anti-Pattern** | Multiple microservices reading/writing the same tables, causing schema, lock, and deployment coupling. |
| **Schema-per-Service** | Logical isolation using separate DB schemas and RBAC roles on a shared database server. |
| **Polyglot Persistence** | Choosing different database engines (SQL, Redis, Elasticsearch) per service based on workload needs. |
| **API Composition** | Read-time pattern that calls multiple service APIs and joins results in memory. |
| **CQRS Projection** | Materialized read-only view maintained asynchronously by consuming domain events from multiple services. |
| **Saga Pattern** | Managing multi-service write workflows as a sequence of local ACID transactions with compensating actions. |
| **Two-Phase Commit (2PC)** | Blocking distributed transaction protocol that holds locks across nodes; generally avoided in microservices. |
| **Transactional Outbox** | Writing domain state and an outgoing event row in the same local DB transaction for reliable publishing. |
| **Eventual Referential Integrity** | Maintaining cross-service references by ID without SQL `FOREIGN KEY` constraints. |

---

## 15. System Design Interview Questions & Answers

### Basic Conceptual Questions

<details>
<summary><strong>Q1: Why shouldn't microservices share a database? [BASIC]</strong></summary>

**Answer:**
Sharing a database creates **runtime coupling** (one service's slow query or `ALTER TABLE` lock starves or crashes other services), **development coupling** (schema changes require coordinating across multiple teams), and prevents **polyglot persistence** (each service picking the best storage engine for its workload).
</details>

<details>
<summary><strong>Q2: What does "private database" mean—do we need a separate RDS server for every service? [BASIC]</strong></summary>

**Answer:**
No. "Database per Service" means **ownership and access isolation**, not necessarily separate physical hardware on day one. You can use separate logical databases or **separate schemas with strict per-service DB credentials** on one cluster, and split to dedicated servers only when IOPS, connections, or engine types diverge.
</details>

<details>
<summary><strong>Q3: How do you query data that spans multiple microservices if you can't use SQL `JOIN`? [BASIC]</strong></summary>

**Answer:**
Two primary patterns: (1) **API Composition**—an aggregator/BFF calls the owning services' APIs in parallel and joins the DTOs in memory; (2) **CQRS Read Projections**—a read service subscribes to domain events (`OrderPlaced`, `ShipmentUpdated`) and maintains a pre-joined local read database.
</details>

<details>
<summary><strong>Q4: Why avoid Two-Phase Commit (2PC) across microservices? [BASIC]</strong></summary>

**Answer:**
2PC is a synchronous, blocking protocol that holds database locks across network round-trips. If the coordinator or any participant crashes mid-commit, resources remain locked, slashing availability and throughput. Microservices use **Sagas** + **Transactional Outbox** instead.
</details>

### Scenario-Based Architecture Questions

<details>
<summary><strong>Q5: Your frontend needs a paginated, searchable table of "Orders over $100 with Customer Email and Shipping Status." API Composition or CQRS? [SCENARIO]</strong></summary>

**Answer:**
**CQRS Read Projection.** Filtering, sorting, and paginating across 3 different services via API Composition forces you to fetch huge unpaginated datasets from each service and join them in RAM. Instead, have an `OrderSearch` service consume `OrderPlaced`, `CustomerUpdated`, and `ShipmentUpdated` events into a single Elasticsearch/Postgres read index for fast, single-query pagination.
</details>

<details>
<summary><strong>Q6: When is API Composition better than CQRS? [SCENARIO]</strong></summary>

**Answer:**
When the query fetches a **small, bounded dataset by ID** (e.g., `GET /orders/123` fetching 1 order + 1 customer + 1 shipment) across 2–3 services, and you want **simpler architecture** without maintaining an extra event-driven read database and eventual consistency lag.
</details>

<details>
<summary><strong>Q7: How do you maintain data consistency when `PlaceOrder` must reserve inventory and charge a credit card across 3 services? [SCENARIO]</strong></summary>

**Answer:**
Use the **Saga Pattern**. `Orders` creates the order in `PENDING` state, then coordinates `Inventory.Reserve()` and `Payment.Charge()` via events (choreography) or an orchestrator. If `Payment.Charge()` fails, the Saga triggers a **compensating transaction** (`Inventory.Release()`) and marks the order `CANCELLED`.
</details>

<details>
<summary><strong>Q8: Your Data Science team wants to run heavy analytical `JOIN`s across `Orders`, `Users`, and `Payments`. How do you support them without breaking Database per Service? [SCENARIO]</strong></summary>

**Answer:**
Stream domain events or Change Data Capture (Debezium/Kafka) from each service into a dedicated **Data Warehouse** (Snowflake, BigQuery, ClickHouse). Never allow BI tools or ad-hoc SQL queries to hit microservice operational OLTP databases directly.
</details>

### Advanced & Tricky Interview Questions

<details>
<summary><strong>Q9: In a CQRS projection, what happens if `ShipmentUpdated` arrives BEFORE `OrderPlaced` due to network reordering? [TRICKY]</strong></summary>

**Answer:**
Your projector must handle **out-of-order events** gracefully: either use **upsert / partial-row creation** (as shown in our code tab's `getOrCreate(orderId)` so `ShipmentUpdated` creates a partial row that `OrderPlaced` later fills in), or buffer/retry events with a missing parent until `OrderPlaced` arrives.
</details>

<details>
<summary><strong>Q10: How do you safely migrate a monolith's shared database into Database per Service? [TRICKY]</strong></summary>

**Answer:**
Follow a 4-step sequence: (1) Stop cross-module `JOIN`s in code (replace with internal facade calls); (2) Separate tables into distinct schemas with separate DB users to prove zero cross-schema queries remain; (3) Replicate the extracted service's tables to a new DB via CDC (Debezium) and shadow-read; (4) Cut over writes and drop the old tables.
</details>

<details>
<summary><strong>Q11: How do you handle "read-your-own-writes" when a user creates an order and immediately refreshes the CQRS Order History page? [TRICKY]</strong></summary>

**Answer:**
Because CQRS projections have 20–500 ms of replication lag, the user might not see the new order if the UI immediately queries the read DB. Mitigate by: (1) returning the created DTO in the `POST` response so the client renders it immediately; (2) passing a `min_version` / `event_id` token to the read API so it waits briefly or falls back to the write service if lag exceeds a threshold.
</details>

<details>
<summary><strong>Q12: What if a service owns a reference table (like `Countries` or `Currencies`) that 10 other services need? [TRICKY]</strong></summary>

**Answer:**
Static or slowly changing reference data is a prime candidate for **in-memory caching + event-driven local replication** (e.g., every service caches `currencies` in RAM with a 1-hour TTL or refreshes on a `CurrencyUpdated` event), rather than making 10 synchronous RPCs or sharing a database table.
</details>

---

## 16. One-Page Master Cheat Sheet

```
+---------------------------------------------------------------------------------------------------------+
|                   DATABASE PER SERVICE — MASTER CHEAT SHEET                                             |
+---------------------------------------------------------------------------------------------------------+
| 1. RULE: Each service's DB is PRIVATE. Other services access data ONLY via API or Domain Events.        |
|    Start with separate schemas + strict DB RBAC roles; split to dedicated servers when scale demands.   |
+---------------------------------------------------------------------------------------------------------+
| 2. CROSS-SERVICE READS:                                                                                 |
|    - API Composition: call 2-3 APIs in parallel & join in RAM (good for ID lookups; bad for pagination).|
|    - CQRS Projection: consume events into a pre-joined local read DB (fast, resilient, eventual).       |
+---------------------------------------------------------------------------------------------------------+
| 3. CROSS-SERVICE WRITES:                                                                                |
|    - NEVER use 2PC/XA locks. Use Transactional Outbox + Sagas (local ACID + compensating actions).      |
+---------------------------------------------------------------------------------------------------------+
| 4. ANALYTICS / BI: Stream events/CDC to a Data Warehouse (BigQuery/Snowflake); never query OLTP DBs.    |
+---------------------------------------------------------------------------------------------------------+
```

---

## Further Reading & Sources

- Chris Richardson, *Microservices Patterns*, Chapter 2 & 7 ("Database per Service", "API Composition", "CQRS").
- Sam Newman, *Building Microservices* (2nd ed.), Chapter 4 ("Microservice Communication Styles") & Chapter 6 ("Workflows / Sagas").
- Martin Kleppmann, *Designing Data-Intensive Applications*, Chapter 9 ("Consensus & 2PC") and Chapter 11 ("Stream Processing / CDC").
- Microsoft Azure Architecture Center, [CQRS Pattern](https://learn.microsoft.com/en-us/azure/architecture/patterns/cqrs).

---

## Free PDF Notes

[SD-L-005.pdf](https://backendroadmap.com/notes/system-design/SD-L-005.pdf)

---

## Next

Continue with [Sync vs Async Communication in Microservices (REST, gRPC, Events)](../06-sync-vs-async-communication-in-microservices/README.md).
