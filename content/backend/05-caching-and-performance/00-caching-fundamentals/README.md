# Caching Fundamentals: The Latency Hierarchy & Failure Modes

> [!TIP]
> **The Golden Rule:** A cache is an accelerator, never the source of truth. It must be safe to evict or lose any cached key at any time without data loss. Always protect primary databases from **Cache Stampedes** using mutex locks / singleflight, protect against **Cache Penetration** using null-caching or Bloom filters, and prevent **Cache Avalanches** by adding random jitter to all TTLs.

---

## 1. Visual Mental Model: The Latency Hierarchy & Cache Tiers

Caching exists because hardware access latencies vary by orders of magnitude. Shifting reads from disk to RAM cuts latency by $1,000\times$:

```
┌────────────────────────────────────────────────────────────────────────┐
│             The Latency Numbers Every Engineer Should Know             │
├───────────────────────────────┬───────────────────┬────────────────────┤
│ Operation                     │ Real-World Latency│ Scaled to Human    │
├───────────────────────────────┼───────────────────┼────────────────────┤
│ L1 CPU Cache Reference        │ 1 nanosecond      │ 1 second           │
│ Main Memory (RAM) Access      │ 100 nanoseconds   │ 1.5 minutes        │
│ Redis In-Memory Lookup (LAN)  │ 0.5 milliseconds  │ 5.8 days           │
│ NVMe SSD Random Disk Read     │ 0.1 milliseconds  │ 1.2 days           │
│ PostgreSQL Relational Query   │ 10 milliseconds   │ 4 months           │
│ Cross-Continent Network Round │ 150 milliseconds  │ 5 years            │
└───────────────────────────────┴───────────────────┴────────────────────┘
```

```mermaid
flowchart TD
    Client["Client Request"] --> L1Cache{"1. In-Process L1 Cache\n(Local RAM, <100ns)"}
    
    L1Cache -- Hit (p99: 0.1ms) --> ReturnFast["Return Cached Response"]
    L1Cache -- Miss --> L2Cache{"2. Distributed L2 Cache\n(Redis Cluster, <1ms)"}
    
    L2Cache -- Hit (p99: 1.2ms) --> PopulateL1["Populate L1 Cache"]
    PopulateL1 --> ReturnFast
    
    L2Cache -- Miss --> SingleFlight{"3. Mutex / Singleflight Guard\n(Only ONE query touches DB)"}
    SingleFlight --> DB[("Primary Database (PostgreSQL)\n(Disk I/O, 15-50ms)")]
    
    DB --> PopulateL2["Populate L2 Redis with Jittered TTL"]
    PopulateL2 --> PopulateL1

    classDef fast fill:#10b981,stroke:#047857,stroke-width:2px,color:#fff;
    classDef dist fill:#3b82f6,stroke:#1d4ed8,stroke-width:2px,color:#fff;
    classDef db fill:#f59e0b,stroke:#b45309,stroke-width:2px,color:#fff;

    class ReturnFast fast;
    class L1Cache,L2Cache,PopulateL1,PopulateL2 dist;
    class DB,SingleFlight db;
```

---

## 2. The Three Classic Cache Disasters & Defenses

| Disaster | Root Cause | Failure Mechanics | Production Defense |
| :--- | :--- | :--- | :--- |
| **Cache Stampede** (Thundering Herd) | A popular hot key expires during peak traffic | 10,000 concurrent requests simultaneously observe a cache miss and slam the database at once | **Singleflight / Mutex Locking:** Only 1 thread executes DB query; others wait for result |
| **Cache Penetration** | Malicious traffic queries non-existent keys (`id = -9999`) | Keys never exist in DB, so cache is never populated; 100% of requests hit the database | **Null Object Caching:** Cache `(key, NULL, TTL=60s)` or check **Bloom Filter** upfront |
| **Cache Avalanche** | Millions of keys expire at the exact same second (e.g. at midnight) | The cache hit ratio drops from 98% to 0% in 1 millisecond, crushing the database | **TTL Jitter:** Set `TTL = base_ttl + rand(-60s, +60s)` to stagger expirations smoothly |

---

## 3. Production War Story: The Midnight Cache Avalanche Blackout

### The Incident
A media streaming service cached user home screen recommendations in Redis with a 24-hour expiration. An ETL script ran every night at 00:00:00 UTC and refreshed all 4,000,000 customer recommendation rows in Redis with:
`SET user:rec:<id> <payload> EX 86400`

At exactly 00:00:00 UTC the following night:
1. All 4,000,000 keys expired at the **exact same microsecond**.
2. Cache hit ratio dropped instantly from 99.4% to 0%.
3. Over 25,000 active app users clicked the home screen simultaneously. Every single incoming HTTP request experienced a cache miss.
4. 25,000 complex multi-table SQL joins hit the primary PostgreSQL cluster at once.
5. Database CPU spiked to 100%, query latency jumped from 4ms to 32 seconds, and the connection pool completely crashed.
6. The streaming platform suffered a 50-minute complete outage across North America until engineers restarted the database and manually seeded Redis.

```mermaid
sequenceDiagram
    autonumber
    actor Users as 25,000 Concurrent Mobile Users
    participant API as API Server Fleet
    participant Cache as Redis Cluster
    participant DB as Postgres Primary DB

    Note over Cache: 4,000,000 keys set with exact EX 86400!<br/>At 00:00:00 UTC: All 4,000,000 keys expire SIMULTANEOUSLY!
    Users->>API: 25,000 req/sec to GET /v1/home
    API->>Cache: GET user:rec:101..125000 -> 100% CACHE MISS!
    Note over API: Avalanche! Every worker thread falls back to PostgreSQL!
    API->>DB: 25,000 Heavy Analytical Multi-Join SQL Queries!
    Note over DB: CPU 100%! Disk IOPS Saturated! All 1,200 pool slots locked!
    DB-->>API: 504 Gateway Timeout
    API-->>Users: App Crash (Total Blackout)
```

### The Root Cause
1. **Uniform TTL Expiration (Zero Jitter):** Synchronized batch writes without expiration jitter created a temporal cliff.
2. **Missing Singleflight Protection:** Handlers failed to deduplicate concurrent requests for the same missing key.

### The Verified Fix
- **Staggered Expiration with Random Jitter:**
  ```python
  # Add +/- 15% random jitter to TTL
  jitter = random.randint(-1800, 1800)
  ttl = 86400 + jitter
  redis.setex(key, ttl, value)
  ```
- **Singleflight In-Flight Coalescing:** Group identical concurrent requests into a single execution.

---

## 4. Multi-Language Production Implementation

### Go: Cache-Aside with Singleflight & TTL Jitter

```go
package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"log/slog"
	"math/rand"
	"time"

	"github.com/redis/go-redis/v9"
	"golang.org/x/sync/singleflight"
)

type UserProfile struct {
	ID    int64  `json:"id"`
	Name  string `json:"name"`
	Tier  string `json:"tier"`
}

type CachedProfileRepository struct {
	db    *sql.DB
	cache *redis.Client
	group singleflight.Group // Eliminates Thundering Herd / Stampede
}

func NewCachedProfileRepository(db *sql.DB, cache *redis.Client) *CachedProfileRepository {
	return &CachedProfileRepository{db: db, cache: cache}
}

func (r *CachedProfileRepository) GetProfile(ctx context.Context, userID int64) (*UserProfile, error) {
	cacheKey := fmt.Sprintf("user:prof:%d", userID)

	// 1. Check Redis Cache First
	val, err := r.cache.Get(ctx, cacheKey).Result()
	if err == nil {
		if val == "NULL_OBJECT" {
			// Cache Penetration Defense: Key does not exist in DB
			return nil, errors.New("user not found")
		}
		var p UserProfile
		if json.Unmarshal([]byte(val), &p) == nil {
			return &p, nil // Cache Hit!
		}
	}

	// 2. Singleflight: Coalesce concurrent requests for the same user ID into 1 DB query
	v, err, _ := r.group.Do(cacheKey, func() (any, error) {
		// Only ONE goroutine executes this SQL query; all other waiting callers share the result!
		query := `SELECT id, name, tier FROM users WHERE id = $1`
		row := r.db.QueryRowContext(ctx, query, userID)

		var p UserProfile
		scanErr := row.Scan(&p.ID, &p.Name, &p.Tier)
		if errors.Is(scanErr, sql.ErrNoRows) {
			// Cache Penetration Defense: Cache the missing state for 60s
			_ = r.cache.Set(ctx, cacheKey, "NULL_OBJECT", 60*time.Second).Err()
			return nil, errors.New("user not found")
		}
		if scanErr != nil {
			return nil, scanErr
		}

		// Calculate Jittered TTL: 1 hour +/- 10 minutes to prevent Cache Avalanche
		jitterSeconds := rand.Intn(1200) - 600
		ttl := time.Duration(3600+jitterSeconds) * time.Second

		data, _ := json.Marshal(p)
		_ = r.cache.Set(ctx, cacheKey, data, ttl).Err()

		return &p, nil
	})

	if err != nil {
		return nil, err
	}
	return v.(*UserProfile), nil
}
```

---

### Node.js (TypeScript): Cache-Aside with In-Flight Request Deduplication

```typescript
import { createClient } from 'redis';
import { Pool } from 'pg';

export class CachedProductService {
  private inFlight = new Map<string, Promise<any>>();

  constructor(private redis: ReturnType<typeof createClient>, private pool: Pool) {}

  async getProduct(productId: number): Promise<any> {
    const key = `prod:${productId}`;

    // 1. Fast Cache Check
    const cached = await this.redis.get(key);
    if (cached) {
      if (cached === 'NULL_OBJECT') return null;
      return JSON.parse(cached);
    }

    // 2. Coalesce in-flight promises (Singleflight in JS)
    if (this.inFlight.has(key)) {
      return this.inFlight.get(key);
    }

    const promise = (async () => {
      try {
        const query = 'SELECT id, name, price_cents FROM products WHERE id = $1';
        const result = await this.pool.query(query, [productId]);

        if (result.rows.length === 0) {
          // Cache Penetration Defense: 60-second Null Object
          await this.redis.setEx(key, 60, 'NULL_OBJECT');
          return null;
        }

        const product = result.rows[0];

        // TTL Jitter: 1800s +/- 120s
        const jitter = Math.floor(Math.random() * 240) - 120;
        await this.redis.setEx(key, 1800 + jitter, JSON.stringify(product));

        return product;
      } finally {
        this.inFlight.delete(key);
      }
    })();

    this.inFlight.set(key, promise);
    return promise;
  }
}
```

---

### Python: FastAPI Cache-Aside with Null Caching & Random Jitter

```python
import json
import random
from typing import Optional
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import asyncpg
import redis.asyncio as aioredis

app = FastAPI(title="Resilient Caching Engine")
db_pool: asyncpg.Pool = None
redis_client: aioredis.Redis = None

@app.on_event("startup")
async def startup():
    global db_pool, redis_client
    db_pool = await asyncpg.create_pool("postgresql://postgres:pass@localhost:5432/app_db")
    redis_client = aioredis.from_url("redis://localhost:6379", decode_responses=True)

class ProductOut(BaseModel):
    id: int
    name: str
    price_cents: int

@app.get("/v1/products/{product_id}", response_model=ProductOut)
async def get_product(product_id: int):
    cache_key = f"prod:{product_id}"

    # 1. Read from Redis
    val = await redis_client.get(cache_key)
    if val:
        if val == "__NULL__":
            raise HTTPException(status_code=404, detail="Product not found")
        return json.loads(val)

    # 2. Database Fallback
    async with db_pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT id, name, price_cents FROM products WHERE id = $1",
            product_id
        )

        if not row:
            # Cache Penetration Defense: 60s TTL for missing objects
            await redis_client.setex(cache_key, 60, "__NULL__")
            raise HTTPException(status_code=404, detail="Product not found")

        data = dict(row)

        # Cache Avalanche Defense: Jittered TTL (3600s +/- 300s)
        jitter = random.randint(-300, 300)
        await redis_client.setex(cache_key, 3600 + jitter, json.dumps(data))

        return data
```

---

## 5. Practical Hands-On Verification Matrix

### Step 1: Initial Read (Cache Miss -> DB Lookup)
```bash
curl.exe -i http://localhost:8000/v1/products/101
```
**Expected Response:**
```http
HTTP/1.1 200 OK
Content-Type: application/json

{"id":101,"name":"Mechanical Keyboard","price_cents":14900}
```

### Step 2: Repeat Query (Sub-Millisecond Cache Hit)
```bash
curl.exe -i http://localhost:8000/v1/products/101
```
**Expected Response:**
```http
HTTP/1.1 200 OK
Content-Type: application/json
```

### Step 3: Query Missing Record (Null Object Caching Defense)
```bash
curl.exe -i http://localhost:8000/v1/products/9999999
```
**Expected Response:**
```http
HTTP/1.1 404 Not Found
```

---

## 6. Operational Verification Quizzes

<details>
<summary><b>Checkpoint 1: Why Singleflight is Crucial for High-Traffic Homepages</b></summary>

**Scenario:** The homepage recommendation banner key `home:banner` expires at 12:00:00. The site receives 10,000 requests per second. Without singleflight, what happens to the database?

**Correct Analysis:** A Classic Cache Stampede. Within the 50ms window before the first worker thread completes the database query and writes the result back to Redis, all 500 concurrent requests arriving during those 50ms see a cache miss. All 500 threads fire identical heavy SQL queries simultaneously, saturating database connections. **Singleflight (or mutex locking)** ensures only 1 thread executes the DB query; the other 499 threads wait and share the single result.
</details>

<details>
<summary><b>Checkpoint 2: Cache Penetration via Distributed Botnet Attacks</b></summary>

**Scenario:** A botnet scans an e-commerce API querying random UUIDs: `/v1/products/<random_uuid>`. The application checks Redis, misses, queries PostgreSQL, misses, and returns 404 without caching. The database crashes under 100% CPU. Why?

**Correct Analysis:** Cache Penetration. Because the queried keys never exist in the database, the cache is never populated. 100% of the botnet requests punch straight through the cache and hit the relational database. Mitigate this by: (1) **Caching Null Objects (`__NULL__`)** with a short TTL (e.g. 60 seconds), or (2) Checking a probabilistic **Bloom Filter** upfront; if the Bloom filter says the ID does not exist, reject immediately with 404 without querying Redis or the database.
</details>

<details>
<summary><b>Checkpoint 3: The Danger of Caching Sensitive User Data Under Shared Keys</b></summary>

**Scenario:** A developer caches the user profile endpoint with key `cache:profile`. When User Alice views her profile, the server sets `cache:profile = alice_json`. When User Bob loads his profile a second later, he sees Alice's full address and credit card number. What bug occurred?

**Correct Analysis:** Key Collision / Unscoped Cache Namespacing. Cache keys must always be explicitly scoped to the unique subject or tenant identifier: `user:profile:<user_id>`. Furthermore, public CDNs and shared reverse proxies must never cache HTTP responses containing private `Set-Cookie` or `Authorization` headers unless `Cache-Control: private` is strictly configured.
</details>

---

## Further Reading & Sources

- [Redis Official Documentation: Caching Patterns](https://redis.io/docs/manual/client-side-caching/)
- [Martin Fowler: Two Hard Things in Computer Science](https://martinfowler.com/bliki/TwoHardThings.html)
- [Singleflight Package in Go (Golang.org/x/sync/singleflight)](https://pkg.go.dev/golang.org/x/sync/singleflight)

---

## Next Steps

Advance to the next module:
[../01-caching-strategies/README.md](../01-caching-strategies/README.md)
Explore caching patterns: Cache-Aside (Lazy Loading), Read-Through, Write-Through, Write-Behind (Write-Back), and their consistency trade-offs.
