# Capstone: High-Throughput Resilient Performance & Caching Engine

> [!TIP]
> **The Golden Rule:** High-scale backend performance is an engineering discipline, not an accident. Diagnose bottlenecks using sampling profilers (**Flame Graphs**) and percentiles (**p95/p99**), eliminate N+1 database roundtrips using eager joins, protect databases with **Two-Tier Caching (L1 + L2)** and **Singleflight Stampede Protection**, and never execute blocking CPU work inside an asynchronous event loop.

---

## 1. System Architecture: The Optimized High-Throughput Performance Engine

This capstone integrates every performance pattern mastered across Track 5 into an ultra-low-latency backend service:

```mermaid
flowchart TD
    Client["Client / k6 Load Tester"] --> ALB["1. Reverse Proxy / Ingress Load Balancer"]
    
    subgraph AppWorker ["Application Worker Tier (Multi-Core Cluster)"]
        ALB --> Router["2. Fast Non-Blocking Router"]
        Router --> L1_Memory{"3. In-Process L1 LRU Cache\n(< 100ns, TTL: 15s)"}
        
        L1_Memory -- L1 Hit (0.01ms) --> Respond["Fast 200 OK Response"]
        
        L1_Memory -- L1 Miss --> L2_Redis{"4. Distributed L2 Redis Cluster\n(< 1ms, Jittered TTL)"}
        L2_Redis -- L2 Hit (1.2ms) --> PopulateL1["Populate L1"]
        PopulateL1 --> Respond
        
        L2_Redis -- L2 Miss --> StampedeGuard{"5. Singleflight / Mutex Lock\n(Only ONE query hits DB!)"}
    end

    subgraph DataTier ["Data & Persistence Tier"]
        StampedeGuard --> PgBouncer["6. PgBouncer Connection Pooler\n(Hardware Cores x 2 Sizing)"]
        PgBouncer --> Postgres[("7. PostgreSQL Primary DB\n(Covering Indexes, Parallel Scans)")]
        Postgres --> PopulateL2["Populate L2 Redis"]
        PopulateL2 --> PopulateL1
    end

    classDef fast fill:#10b981,stroke:#047857,stroke-width:2px,color:#fff;
    classDef l2 fill:#3b82f6,stroke:#1d4ed8,stroke-width:2px,color:#fff;
    classDef db fill:#f59e0b,stroke:#b45309,stroke-width:2px,color:#fff;

    class Client,ALB,Router,Respond,PopulateL1 fast;
    class L1_Memory,L2_Redis,PopulateL2 l2;
    class StampedeGuard,PgBouncer,Postgres db;
```

---

## 2. Before vs After Optimization Benchmark Matrix

Applying this track's systematic performance engineering converts a fragile, timeout-ridden prototype into a production-grade high-throughput engine:

| Metric | Before Optimization (Uncached, N+1, Unpooled) | After Optimization (L1+L2, Singleflight, Eager SQL) | Net Improvement |
| :--- | :--- | :--- | :--- |
| **Throughput (RPS)** | 85 requests / second | **6,400 requests / second** | **$75\times$ Throughput Increase** |
| **Median Latency (p50)** | 145 ms | **0.8 ms** | **$180\times$ Latency Reduction** |
| **Tail Latency (p99)** | 4,200 ms (Timeouts) | **14.2 ms** | **Zero 504 Gateway Timeouts** |
| **Database Queries / Req** | 52 queries (N+1 loop) | **0 queries (Cache Hit)** / 1 query (Miss) | **98% Database Load Reduction** |
| **Database Connections** | Unbounded (Process fork crash) | 25 fixed connections (PgBouncer) | **Stable 12% DB CPU Utilization** |

---

## 3. Production War Story: The Triple Bottleneck Flash Sale Outage

### The Incident
An online ticketing platform launched ticket sales for an international stadium tour. Within 2 minutes, 100,000 users hit `GET /v1/events/{id}/dashboard`.

The endpoint contained three classic un-profiled performance bugs:
1. **The N+1 Query Trap:** It loaded the event, then in a loop loaded 20 ticket tiers, then in a nested loop loaded available seat counts one by one (41 queries per request).
2. **Blocking Hashing on Event Loop:** An un-cached authentication token verification called synchronous `bcrypt.compareSync` directly on the Node.js/Python event loop, locking the main thread for 300ms on every request.
3. **No Caching & No Connection Pooling:** Every incoming request opened a fresh TCP connection to PostgreSQL with zero caching.

Within 45 seconds:
- All 1,200 database connections were exhausted.
- Main event loops froze, causing `/healthz` liveness probes to fail.
- Kubernetes killed and restarted all backend pods simultaneously.
- The entire ticketing infrastructure suffered an unrecoverable cascading collapse for 2.5 hours.

```mermaid
sequenceDiagram
    autonumber
    actor Shoppers as 100,000 Fans
    participant Ingress as Load Balancer
    participant Pod as Backend API Pod
    participant DB as Postgres Database

    Shoppers->>Ingress: 10,000 req/sec to /events/101/dashboard
    Ingress->>Pod: Forward traffic
    Note over Pod: Bug 1: bcrypt.compareSync freezes main thread for 300ms!<br/>Bug 2: Opens 41 sequential SQL queries per user!<br/>Bug 3: Zero connection pooling!
    Pod->>DB: Spawns 10,000 raw DB connections!
    Note over DB: All 1,200 connection slots exhausted! DB CPU 100%!
    DB-->>Pod: Connection Refused!
    Note over Ingress: Pods stop responding to health probes!
    Ingress-->>Shoppers: 502 Bad Gateway / 504 Timeout (Total Outage)
```

### The Root Cause
The application lacked an architectural defense-in-depth pipeline: un-cached heavy queries slammed the database, un-pooled connections starved the socket layer, and synchronous CPU operations blocked asynchronous event loops.

### The Verified Fix
1. **Eager Single-Query SQL (`JOIN`):** Replaced the 41-query loop with a single CTE SQL join ($41\text{ queries} \rightarrow 1\text{ query}$).
2. **Offload Cryptography to Worker Pool:** Moved password hashing to a background thread pool, keeping the main event loop 100% non-blocking.
3. **Two-Tier Caching + Singleflight:** Added an in-memory L1 cache (15s TTL) backed by Redis (1h TTL) with singleflight request coalescing.
4. **PgBouncer Pooling:** Capped physical database connections to 32 connections.

---

## 4. Multi-Language Production Implementation

### Go: High-Throughput Production Performance Subsystem

```go
package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"math/rand"
	"net/http"
	"sync"
	"time"

	"github.com/redis/go-redis/v9"
	"golang.org/x/sync/singleflight"
	_ "github.com/lib/pq"
)

type EventDashboard struct {
	EventID        int64  `json:"event_id"`
	EventName      string `json:"event_name"`
	AvailableSeats int    `json:"available_seats"`
}

type HighPerformanceEngine struct {
	db          *sql.DB
	redisClient *redis.Client
	group       singleflight.Group
	mu          sync.RWMutex
	l1Cache     map[string]cacheItem
}

type cacheItem struct {
	data      EventDashboard
	expiresAt time.Time
}

func NewHighPerformanceEngine(db *sql.DB, rdb *redis.Client) *HighPerformanceEngine {
	return &HighPerformanceEngine{
		db:          db,
		redisClient: rdb,
		l1Cache:     make(map[string]cacheItem),
	}
}

func (e *HighPerformanceEngine) GetDashboard(ctx context.Context, eventID int64) (*EventDashboard, error) {
	cacheKey := fmt.Sprintf("event:dash:%d", eventID)

	// 1. Tier 1: Check In-Process L1 Memory (<100ns)
	e.mu.RLock()
	item, found := e.l1Cache[cacheKey]
	e.mu.RUnlock()
	if found && time.Now().Before(item.expiresAt) {
		return &item.data, nil // L1 Hit!
	}

	// 2. Tier 2: Check Distributed L2 Redis (<1ms)
	val, err := e.redisClient.Get(ctx, cacheKey).Result()
	if err == nil {
		var dash EventDashboard
		if json.Unmarshal([]byte(val), &dash) == nil {
			e.storeL1(cacheKey, dash)
			return &dash, nil // L2 Hit!
		}
	}

	// 3. Tier 3: Singleflight Mutex Guard on Database
	v, err, _ := e.group.Do(cacheKey, func() (any, error) {
		// Single SQL JOIN: Eliminates the N+1 problem completely!
		query := `
			SELECT e.id, e.name, COALESCE(SUM(s.is_available::int), 0) AS available_seats
			FROM events e
			LEFT JOIN seats s ON s.event_id = e.id
			WHERE e.id = $1
			GROUP BY e.id, e.name;
		`
		var dash EventDashboard
		scanErr := e.db.QueryRowContext(ctx, query, eventID).Scan(&dash.EventID, &dash.EventName, &dash.AvailableSeats)
		if scanErr != nil {
			return nil, scanErr
		}

		// Store in L2 Redis with Jittered TTL (3600s +/- 300s)
		jitter := rand.Intn(600) - 300
		ttl := time.Duration(3600+jitter) * time.Second
		data, _ := json.Marshal(dash)
		_ = e.redisClient.Set(ctx, cacheKey, data, ttl).Err()

		// Populate L1 Memory
		e.storeL1(cacheKey, dash)

		return &dash, nil
	})

	if err != nil {
		return nil, err
	}
	return v.(*EventDashboard), nil
}

func (e *HighPerformanceEngine) storeL1(key string, data EventDashboard) {
	e.mu.Lock()
	e.l1Cache[key] = cacheItem{data: data, expiresAt: time.Now().Add(15 * time.Second)}
	e.mu.Unlock()
}
```

---

### Node.js (TypeScript): Complete Resilient Performance Pipeline

```typescript
import express, { Request, Response } from 'express';
import { Pool } from 'pg';
import { createClient } from 'redis';
import { LRUCache } from 'lru-cache';

const app = express();
app.use(express.json());

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 25, // PgBouncer aligned
  idleTimeoutMillis: 30000,
});

const redis = createClient({ url: process.env.REDIS_URL });
redis.connect();

// L1: In-Memory LRU Cache (<100ns)
const l1Cache = new LRUCache<string, any>({ max: 5000, ttl: 15000 });
const inFlightRequests = new Map<string, Promise<any>>();

app.get('/v1/events/:id/dashboard', async (req: Request, res: Response) => {
  const eventId = req.params.id;
  const key = `event:dash:${eventId}`;

  // 1. L1 Memory Check
  const l1Hit = l1Cache.get(key);
  if (l1Hit) {
    res.setHeader('X-Cache-Tier', 'L1_RAM');
    return res.json(l1Hit);
  }

  // 2. L2 Redis Check
  const l2Hit = await redis.get(key);
  if (l2Hit) {
    const data = JSON.parse(l2Hit);
    l1Cache.set(key, data);
    res.setHeader('X-Cache-Tier', 'L2_REDIS');
    return res.json(data);
  }

  // 3. Singleflight Coalescing
  if (inFlightRequests.has(key)) {
    const result = await inFlightRequests.get(key);
    return res.json(result);
  }

  const queryPromise = (async () => {
    try {
      // Optimized Single SQL Query (Eliminates N+1)
      const sql = `
        SELECT e.id, e.name, COUNT(t.id)::int AS "ticketTiers"
        FROM events e
        LEFT JOIN ticket_tiers t ON t.event_id = e.id
        WHERE e.id = $1
        GROUP BY e.id, e.name
      `;
      const result = await pool.query(sql, [eventId]);
      if (result.rows.length === 0) return null;

      const data = result.rows[0];
      const jitter = Math.floor(Math.random() * 200) - 100;
      await redis.setEx(key, 1800 + jitter, JSON.stringify(data));
      l1Cache.set(key, data);

      return data;
    } finally {
      inFlightRequests.delete(key);
    }
  })();

  inFlightRequests.set(key, queryPromise);
  const finalData = await queryPromise;

  if (!finalData) return res.status(404).json({ error: 'Event not found' });
  res.setHeader('X-Cache-Tier', 'DB_MISS');
  return res.json(finalData);
});

app.listen(3000, () => console.log('Performance engine running on port 3000'));
```

---

### Python: FastAPI High-Concurrency Service with Asyncpg & Redis

```python
import json
import random
from typing import Optional
from fastapi import FastAPI, HTTPException, Response
from pydantic import BaseModel
import asyncpg
import redis.asyncio as aioredis

app = FastAPI(title="Capstone Performance Gateway")
db_pool: asyncpg.Pool = None
redis_client: aioredis.Redis = None

@app.on_event("startup")
async def startup():
    global db_pool, redis_client
    db_pool = await asyncpg.create_pool(
        "postgresql://postgres:pass@localhost:5432/events_db",
        min_size=10,
        max_size=30,
        command_timeout=3.0,
    )
    redis_client = aioredis.from_url("redis://localhost:6379", decode_responses=True)

class DashboardResponse(BaseModel):
    event_id: int
    name: str
    available_seats: int

@app.get("/v1/events/{event_id}/dashboard", response_model=DashboardResponse)
async def get_dashboard(event_id: int, response: Response):
    cache_key = f"event:dash:{event_id}"

    # 1. Fast L2 Redis Lookup
    cached = await redis_client.get(cache_key)
    if cached:
        response.headers["X-Cache-Status"] = "HIT"
        return json.loads(cached)

    # 2. Database Fallback: Optimized Single SQL Query
    query = """
        SELECT e.id AS event_id, e.name, COUNT(s.id)::int AS available_seats
        FROM events e
        LEFT JOIN seats s ON s.event_id = e.id AND s.status = 'AVAILABLE'
        WHERE e.id = $1
        GROUP BY e.id, e.name;
    """
    async with db_pool.acquire() as conn:
        row = await conn.fetchrow(query, event_id)
        if not row:
            raise HTTPException(status_code=404, detail="Event not found")

        data = dict(row)
        jitter = random.randint(-120, 120)
        await redis_client.setex(cache_key, 1800 + jitter, json.dumps(data))
        response.headers["X-Cache-Status"] = "MISS"
        return data
```

---

## 5. Practical Hands-On Verification Matrix

### Step 1: Initial Cold Fetch (Database Query Executed)
```bash
curl.exe -i http://localhost:8000/v1/events/101/dashboard
```
**Expected Response:**
```http
HTTP/1.1 200 OK
Content-Type: application/json
X-Cache-Status: MISS

{
  "event_id": 101,
  "name": "Summer Stadium Concert",
  "available_seats": 14200
}
```

### Step 2: Warm Repeat Query (<1ms Redis Cache Hit)
```bash
curl.exe -i http://localhost:8000/v1/events/101/dashboard
```
**Expected Response:**
```http
HTTP/1.1 200 OK
Content-Type: application/json
X-Cache-Status: HIT

{
  "event_id": 101,
  "name": "Summer Stadium Concert",
  "available_seats": 14200
}
```

---

## 6. Operational Verification Quizzes

<details>
<summary><b>Checkpoint 1: The Cascading Death Spiral of Expired Hot Keys</b></summary>

**Scenario:** An application caches the homepage banner under key `home:data` with a 1-hour TTL. It receives 10,000 requests per second. At 14:00:00, the key expires. Average query time to recompute the banner from PostgreSQL is 200ms. What happens?

**Correct Analysis:** A Classic Cache Stampede. Within the 200ms window before the first worker finishes the query and sets the key in Redis, $10,000 \times 0.2\text{s} = \mathbf{2,000 \text{ concurrent queries}}$ hit the database simultaneously. All 2,000 threads attempt to acquire database connection slots, saturating the connection pool and locking database CPU at 100%. To prevent this, implement **Singleflight / Mutex Locking (only 1 thread queries the DB)** or **Probabilistic Early Expiration (XFetch)** to refresh the key before it hits zero.
</details>

<details>
<summary><b>Checkpoint 2: The Fallacy of Async Web Frameworks with Synchronous Drivers</b></summary>

**Scenario:** A developer uses FastAPI or Node.js but installs a synchronous PostgreSQL library (`psycopg2` or synchronous ORM calls) inside an `async def` endpoint. Under 100 concurrent requests, response latency degrades to seconds. Why?

**Correct Analysis:** Event Loop Thread Blocking. Asynchronous frameworks achieve high concurrency on a single thread by yielding control whenever waiting on non-blocking I/O. If a handler calls a synchronous, blocking driver (`cursor.execute()`), the driver blocks the OS thread. The event loop cannot interleave other tasks, transforming the entire asynchronous server into a sequential, single-threaded bottleneck. Asynchronous endpoints must use native non-blocking async drivers (`asyncpg`, `pg`, `motor`).
</details>

<details>
<summary><b>Checkpoint 3: The Danger of Misconfigured PgBouncer Pool Modes</b></summary>

**Scenario:** An application switches PgBouncer to `transaction` pooling mode. The application uses PostgreSQL session-level advisory locks (`pg_advisory_lock()`). Strange locking conflicts appear in production. Why?

**Correct Analysis:** Advisory Lock Disassociation. In `transaction` pooling mode, PgBouncer reclaims the physical database connection as soon as a transaction commits. Because `pg_advisory_lock()` is bound to the *session* (the physical connection) rather than the transaction, the lock remains held on a connection that has now been reassigned to a completely different tenant or request! In `transaction` pooling mode, applications must use transaction-level locks (`pg_advisory_xact_lock()`) or switch PgBouncer to `session` pooling mode.
</details>

---

## Further Reading & Sources

- [Brendan Gregg: Systems Performance: Enterprise and the Cloud](http://www.brendangregg.com/systems-performance-2nd-edition-book.html)
- [PostgreSQL High Performance: Query Optimization & Pool Tuning](https://www.postgresql.org/docs/current/performance-tips.html)
- [Redis Official Best Practices Guide: Production Deployments](https://redis.io/docs/management/optimization/)

---

## Next Steps

Congratulations! You have completed **Track 1: Production Core** (all 5 steps, 56 modules). Advance to **Track 2: High-Scale & Distributed Systems**:
[../../10-distributed-systems-patterns/README.md](../../10-distributed-systems-patterns/README.md)
Master gRPC and Protocol Buffers, Kafka event streaming, distributed consensus (Raft/Paxos), distributed locking (Redlock), and database sharding architectures.
