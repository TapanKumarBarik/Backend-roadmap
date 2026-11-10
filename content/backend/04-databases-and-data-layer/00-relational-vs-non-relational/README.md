# Relational vs Non-Relational Databases: Storage Engine Architecture

> [!TIP]
> **The Golden Rule:** Default to **relational databases (PostgreSQL)** for transactional business data requiring strict invariants, foreign keys, and multi-entity integrity. Choose non-relational engines only when specific access patterns demand them: **Key-Value (Redis)** for sub-millisecond ephemeral caching, **Document (MongoDB)** for polymorphic un-joined payloads, and **Wide-Column (Cassandra)** for high-throughput write-heavy time-series data. Modern high-scale architectures practice **polyglot persistence**.

---

## 1. Visual Mental Model: Database Paradigm Taxonomy

Selecting the correct storage paradigm depends on your query access patterns, data relationships, and consistency requirements:

```mermaid
flowchart TD
    DataReq["Storage & Query Requirement"] --> RelQ{"Requires Strict Foreign Keys,\nACID Transactions, & Joins?"}
    
    RelQ -- Yes --> Relational["Relational RDBMS (PostgreSQL, MySQL)\n• Schema-on-write\n• Strong ACID guarantees\n• Rich SQL joins"]
    
    RelQ -- No --> AccessPattern{"What is the Primary Access Pattern?"}
    
    AccessPattern -- "Key-Value / Cache\n(< 1ms latency)" --> KV["Key-Value (Redis, Memcached)\n• In-memory RAM\n• Sub-millisecond reads\n• Ephemeral sessions & rate limits"]
    AccessPattern -- "Hierarchical / Unstructured\n(Polymorphic schema)" --> Doc["Document Store (MongoDB, Couchbase)\n• Schema-on-read\n• JSON/BSON embedded trees\n• High write flexibility"]
    AccessPattern -- "High-Throughput Append\n(Logs, Metrics, IoT)" --> Column["Wide-Column / Time-Series (Cassandra, ClickHouse)\n• Distributed log-structured (LSM)\n• Linear write scalability\n• Partition-keyed queries"]
    AccessPattern -- "Deep Connected Graph\n(Social, Fraud, Knowledge)" --> Graph["Graph Database (Neo4j, AWS Neptune)\n• Index-free adjacency\n• Multi-hop traversals\n• Relationship-first storage"]

    classDef rdbms fill:#10b981,stroke:#047857,stroke-width:2px,color:#fff;
    classDef nosql fill:#3b82f6,stroke:#1d4ed8,stroke-width:2px,color:#fff;
    classDef check fill:#f59e0b,stroke:#b45309,stroke-width:2px,color:#fff;

    class Relational rdbms;
    class KV,Doc,Column,Graph nosql;
    class RelQ,AccessPattern check;
```

---

## 2. Technical Comparison & Architecture Matrix

| Dimension | Relational (PostgreSQL) | Document (MongoDB) | Key-Value (Redis) | Wide-Column (Cassandra) |
| :--- | :--- | :--- | :--- | :--- |
| **Primary Data Unit** | Table Rows with typed Columns | BSON / JSON Documents | String / Hashes / Sorted Sets | Partition Rows with Dynamic Columns |
| **Schema Model** | **Schema-on-write** (Strictly validated by DB engine) | **Schema-on-read** (Flexible, validated by application) | Schemaless raw bytes / data structures | Typed schema per column family |
| **Relationships & Joins** | First-class SQL `JOIN` across foreign keys | Embedded sub-documents or application-side joins | None (Client joins or separate lookups) | No cross-partition joins |
| **ACID Guarantees** | Multi-table atomic transactions | Single-document atomic; multi-document available | Multi-command atomic (`MULTI`/`EXEC`), in-memory | Eventual consistency (tunable quorum) |
| **Storage Engine** | B-Tree pages with WAL (Write-Ahead Logging) | WiredTiger (B-Tree + cache) | In-memory RAM with append-only file (AOF) | Log-Structured Merge Tree (LSM) + SSTables |
| **Scaling Axis** | Vertical + Read Replicas (or Citus / Spanner) | Horizontal sharding across replica sets | In-memory clustering + Redis Cluster | Decentralized peer-to-peer ring (Dynamo style) |

---

## 3. Production War Story: The Document Store Join Cascade Outage

### The Incident
An e-commerce marketplace decided to migrate from PostgreSQL to a document database (MongoDB) under the marketing promise of "schemaless speed and horizontal auto-sharding". 

In their new document model, `orders`, `customers`, `products`, `discounts`, and `inventory` were stored in separate collections. However, rendering the checkout review page required calculating applicable coupons, checking warehouse inventory levels, verifying customer loyalty status, and retrieving product tax categories.

Because the document database lacked server-side foreign keys and efficient multi-collection relational joins, the backend application executed **54 sequential roundtrips** to fetch each related document for a single cart. During a holiday flash sale, 10,000 concurrent shoppers triggered 540,000 network roundtrips per second. The application connection pool collapsed, and p99 checkout response times spiked from 85ms to 18.4 seconds (`504 Gateway Timeout`), halting transactions for 2.5 hours.

```mermaid
sequenceDiagram
    autonumber
    actor User as Shopper at Checkout
    participant API as E-Commerce API Node
    participant DocDB as Document Database (MongoDB)

    User->>API: GET /v1/checkout/review (10 items in cart)
    Note over API: Relational DB would execute 1 SQL query with 4 JOINs (~12ms).<br/>Document DB requires application-level join cascade!
    API->>DocDB: 1. Fetch User Record
    DocDB-->>API: User Data
    loop For each of the 10 Cart Items
        API->>DocDB: Fetch Product Metadata
        API->>DocDB: Fetch Warehouse Inventory
        API->>DocDB: Fetch Applied Discount Tier
        API->>DocDB: Fetch Regional Tax Rules
    end
    Note over API,DocDB: 1 + (10 * 4) = 41 sequential network roundtrips!
    Note over API: High concurrency triggers thread pool starvation & socket exhaustion!
    API-->>User: 504 Gateway Timeout (Crash)
```

### The Root Cause
1. **Model-Access Pattern Mismatch:** Highly relational, interdependent transactional entities were forced into a non-relational document store that does not optimize for cross-entity relational queries.
2. **Network Roundtrip Explosion (N+1 Problem):** Shifting join logic from an optimized in-database relational query engine to application code generated massive network amplification.

### The Verified Fix
- **Polyglot Architecture:** Re-anchor core transactional entities (`orders`, `inventory`, `discounts`) in PostgreSQL with normalized foreign keys and single-query SQL `JOIN`s ($O(1)$ query roundtrip, $<15\text{ms}$).
- **Redis for Cache Acceleration:** Use Redis to cache static product catalog metadata and pre-computed session state.
- **Rule of Thumb:** If entities require multi-row relational consistency and frequent cross-table joins, always use a relational database.

---

## 4. Multi-Language Production Implementation: Polyglot Persistence

The production standard for modern backends is **polyglot persistence**: using PostgreSQL for strict transactional operations and Redis for sub-millisecond cache lookups.

### Go: Polyglot Engine (PostgreSQL + Redis Cache-Aside)

```go
package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"time"

	"github.com/redis/go-redis/v9"
	_ "github.com/lib/pq"
)

type Product struct {
	ID        int64     `json:"id"`
	SKU       string    `json:"sku"`
	Name      string    `json:"name"`
	Price     int64     `json:"price_cents"`
	UpdatedAt time.Time `json:"updated_at"`
}

type ProductRepository struct {
	db    *sql.DB
	cache *redis.Client
}

func NewProductRepository(db *sql.DB, cache *redis.Client) *ProductRepository {
	return &ProductRepository{db: db, cache: cache}
}

// GetProductByID demonstrates Cache-Aside: Redis check first, fallback to PostgreSQL
func (r *ProductRepository) GetProductByID(ctx context.Context, id int64) (*Product, error) {
	cacheKey := fmt.Sprintf("prod:%d", id)

	// 1. Try fast in-memory cache (<1ms)
	cachedVal, err := r.cache.Get(ctx, cacheKey).Result()
	if err == nil {
		var p Product
		if json.Unmarshal([]byte(cachedVal), &p) == nil {
			return &p, nil
		}
	}

	// 2. Fallback to Relational SQL (<10ms)
	query := `SELECT id, sku, name, price_cents, updated_at FROM products WHERE id = $1`
	row := r.db.QueryRowContext(ctx, query, id)

	var p Product
	if err := row.Scan(&p.ID, &p.SKU, &p.Name, &p.Price, &p.UpdatedAt); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, errors.New("product not found")
		}
		return nil, err
	}

	// 3. Populate Cache with TTL (Cache-Aside pattern)
	if data, err := json.Marshal(p); err == nil {
		_ = r.cache.Set(ctx, cacheKey, data, 10*time.Minute).Err()
	}

	return &p, nil
}
```

---

### Node.js (TypeScript): Relational Query with Typed SQL & Redis Fallback

```typescript
import { Pool } from 'pg';
import { createClient } from 'redis';

export interface CustomerOrder {
  orderId: number;
  customerName: string;
  totalCents: number;
  itemCount: number;
}

export class OrderService {
  constructor(private pgPool: Pool, private redisClient: ReturnType<typeof createClient>) {}

  // Relational Join: Gathers customer, order, and item count in ONE single query
  async getOrderSummary(orderId: number): Promise<CustomerOrder | null> {
    const cacheKey = `order:summary:${orderId}`;

    // 1. In-memory Cache check
    const cached = await this.redisClient.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    // 2. Relational SQL Join across 3 tables (Relational Superpower)
    const query = `
      SELECT 
        o.id AS "orderId",
        c.name AS "customerName",
        o.total_cents AS "totalCents",
        COUNT(oi.id)::int AS "itemCount"
      FROM orders o
      JOIN customers c ON o.customer_id = c.id
      JOIN order_items oi ON oi.order_id = o.id
      WHERE o.id = $1
      GROUP BY o.id, c.name, o.total_cents
    `;

    const result = await this.pgPool.query(query, [orderId]);
    if (result.rows.length === 0) return null;

    const orderData: CustomerOrder = result.rows[0];

    // 3. Cache for 60 seconds
    await this.redisClient.setEx(cacheKey, 60, JSON.stringify(orderData));
    return orderData;
  }
}
```

---

### Python: FastAPI Relational vs Document Paradigm Adapter

```python
import json
from typing import Optional
from fastapi import FastAPI, HTTPException, status
from pydantic import BaseModel
import asyncpg
import redis.asyncio as aioredis

app = FastAPI(title="Polyglot Storage API")

# Global clients
db_pool: Optional[asyncpg.Pool] = None
redis_client: Optional[aioredis.Redis] = None

class OrderSummary(BaseModel):
    order_id: int
    customer_name: str
    total_cents: int
    item_count: int

@app.on_event("startup")
async def startup():
    global db_pool, redis_client
    # Relational Primary
    db_pool = await asyncpg.create_pool("postgresql://postgres:pass@localhost:5432/orders_db")
    # Cache / Key-Value
    redis_client = aioredis.from_url("redis://localhost:6379", decode_responses=True)

@app.get("/v1/orders/{order_id}", response_model=OrderSummary)
async def get_order(order_id: int):
    cache_key = f"order:{order_id}"
    
    # 1. Fast Key-Value Cache Check
    cached = await redis_client.get(cache_key)
    if cached:
        return json.loads(cached)

    # 2. Relational SQL Join (Schema-on-write integrity)
    query = """
        SELECT 
            o.id AS order_id,
            c.name AS customer_name,
            o.total_cents AS total_cents,
            COUNT(oi.id) AS item_count
        FROM orders o
        JOIN customers c ON o.customer_id = c.id
        JOIN order_items oi ON oi.order_id = o.id
        WHERE o.id = $1
        GROUP BY o.id, c.name, o.total_cents
    """
    async with db_pool.acquire() as conn:
        row = await conn.fetchrow(query, order_id)
        if not row:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Order not found")
        
        data = dict(row)
        # 3. Store in cache
        await redis_client.setex(cache_key, 60, json.dumps(data))
        return data
```

---

## 5. Practical Hands-On Verification Matrix

Test relational query execution, transactional integrity, and cache-aside hydration via terminal commands.

### Step 1: Query API for Order Summary (Cache Miss -> DB Relational Join)
```bash
curl.exe -i http://localhost:8000/v1/orders/101
```
**Expected Response:**
```http
HTTP/1.1 200 OK
Content-Type: application/json
X-Cache-Lookup: MISS

{
  "order_id": 101,
  "customer_name": "Acme Industrial",
  "total_cents": 12450,
  "item_count": 4
}
```

### Step 2: Repeat Query Immediately (Cache Hit from Redis)
```bash
curl.exe -i http://localhost:8000/v1/orders/101
```
**Expected Response:**
```http
HTTP/1.1 200 OK
Content-Type: application/json
X-Cache-Lookup: HIT

{
  "order_id": 101,
  "customer_name": "Acme Industrial",
  "total_cents": 12450,
  "item_count": 4
}
```

---

## 6. Operational Verification Quizzes

<details>
<summary><b>Checkpoint 1: Schema-on-Write vs Schema-on-Read at Scale</b></summary>

**Scenario:** A startup builds an application with MongoDB without schema validation. After 18 months, three versions of the mobile client have written user profiles with fields named `phone`, `phoneNumber`, and `telephone_number`. What software crisis emerges?

**Correct Analysis:** Application Code Rot and Silent Corrupted State. In "Schema-on-read", the burden of data validation shifts from the database engine to every application handler and background worker. Developers must litter the entire codebase with defensive boilerplate (`doc.get('phone') or doc.get('phoneNumber') or doc.get('telephone_number')`). When building core business models, relational schema-on-write guarantees that invalid or misspelled attributes are rejected before touching disk.
</details>

<details>
<summary><b>Checkpoint 2: When Wide-Column (Cassandra) Outperforms Relational B-Trees</b></summary>

**Scenario:** An IoT telematics system receives 250,000 sensor telemetry metrics per second ($250\text{k}$ writes/sec). Why does a standard PostgreSQL relational database struggle with this workload while Cassandra excels?

**Correct Analysis:** B-Tree random write I/O vs LSM sequential disk writes. Relational databases update B-Trees in place on 8 KB disk pages. Random inserts across millions of sensor keys require extensive random I/O and Write-Ahead Log (WAL) locks. Apache Cassandra uses **Log-Structured Merge Trees (LSM)**: all incoming writes are appended sequentially to an in-memory `MemTable` and commit log, achieving massive write throughput before flushing sequentially to immutable `SSTables` on disk without read-before-write overhead.
</details>

<details>
<summary><b>Checkpoint 3: The Danger of Treating Redis as a Primary Transactional Database</b></summary>

**Scenario:** A company stores all account balances and financial ledger entries purely in Redis to achieve 0.2ms latency, relying on Redis AOF (Append-Only File) for persistence. What risk do they face during an abrupt server power loss?

**Correct Analysis:** Data Loss and Inconsistent Financial Transactions. Even with `appendfsync everysec`, Redis can lose up to 1 second of transactions during a sudden crash or OS freeze. Furthermore, Redis lacks multi-entity relational integrity constraints, foreign keys, and point-in-time recovery tooling standard in relational engines. High-security financial transactions must commit to a true relational ACID storage engine (PostgreSQL).
</details>

---

## Download Printable Reference & Diagrams

Download the notes for each video on this page as a printable PDF, with every diagram and interview questions: [SD-E-001: Relational Model & SQL Basics](https://backendroadmap.com/notes/system-design/SD-E-001.pdf), [SD-E-013: NoSQL Explained](https://backendroadmap.com/notes/system-design/SD-E-013.pdf), [SD-E-014: Key-Value Stores Explained](https://backendroadmap.com/notes/system-design/SD-E-014.pdf), [SD-E-015: Document Databases Explained](https://backendroadmap.com/notes/system-design/SD-E-015.pdf), [SD-E-016: Wide-Column Stores](https://backendroadmap.com/notes/system-design/SD-E-016.pdf), [SD-E-017: Graph Databases Explained](https://backendroadmap.com/notes/system-design/SD-E-017.pdf), [SD-E-018: Time-Series Databases](https://backendroadmap.com/notes/system-design/SD-E-018.pdf), [SD-E-033: How to Choose a Database](https://backendroadmap.com/notes/system-design/SD-E-033.pdf). Each section in one file: [Phase 2, Databases (PDF)](https://backendroadmap.com/notes/system-design/Phase2_Databases_Notes.pdf).

---

## Further Reading & Sources

- [PostgreSQL Official Documentation: The Relational Data Model](https://www.postgresql.org/docs/current/)
- [Martin Kleppmann: Designing Data-Intensive Applications (Chapter 2: Data Models)](https://dataintensive.net/)
- [Redis Official Architecture & Persistence Guide](https://redis.io/docs/management/persistence/)

---

## Next Steps

Advance to the next module:
[../01-acid-and-cap-theorem/README.md](../01-acid-and-cap-theorem/README.md)
Deconstruct ACID transaction guarantees (Atomicity, Consistency, Isolation, Durability) and navigate distributed trade-offs via the CAP Theorem and PACELC.
