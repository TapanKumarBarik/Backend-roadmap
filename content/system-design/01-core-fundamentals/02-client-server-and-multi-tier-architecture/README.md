# Lesson 02: Client-Server and Multi-Tier Architecture

> **Prerequisites:** [Lesson 01: What Is System Design? HLD vs LLD](../01-what-is-system-design/README.md).  
> **Estimated Reading Time:** 25 minutes  
> **Target Audience:** Backend engineers, system designers, and architects structuring scalable Presentation, Application, and Data tiers.  
> **Free PDF Notes:** [Download SD-A-002.pdf](https://backendroadmap.com/notes/system-design/SD-A-002.pdf) · [Phase 1, Core Fundamentals (PDF)](https://backendroadmap.com/notes/system-design/Phase1_Core_Fundamentals_Notes.pdf)

> [!TIP]
> **The Golden Rule of Multi-Tier Architecture:** Isolate presentation, stateless business logic, and stateful storage behind strict network boundaries so each tier can scale, deploy, and harden independently. Never autoscale a stateless application tier to compensate for an overloaded data tier—doubling application workers multiplies database connection contention and accelerates cascading collapse.

---

## Visual Mental Models & Architecture

### The Evolution of Tiers: Moving Trust and State Outward

When software matures from a single desktop script to an internet-scale web service, business rules migrate off untrusted client machines and the database is pushed behind private network firewalls.

![As tiers are added, business logic moves out of the client and the database stops being exposed to every user.](images/figure-1.svg)

*Figure 1. As tiers are added, business logic moves out of the client and the database stops being exposed to every user.*

### Production Three-Tier Request Traversal & Security Isolation

In a hardened three-tier topology, the public internet terminates exclusively at the edge reverse proxy / presentation layer. Only the stateless application tier possesses network firewall rules permitting connections to the internal data tier.

![A typical three-tier web stack. Only the application tier can reach the database.](images/figure-2.svg)

*Figure 2. A typical three-tier web stack. Only the application tier can reach the database.*

```mermaid
flowchart LR
    subgraph Public["Public Zone (Untrusted Edge)"]
        Browser["Client Browser / Mobile App"]
    end

    subgraph DMZ["Presentation & Ingress Tier (DMZ)"]
        Proxy["NGINX / API Gateway<br/>(TLS Termination, Rate Limit, Static Files)"]
    end

    subgraph AppTier["Application Tier (Private Subnet - Stateless)"]
        App1["Worker Node 1<br/>(Business Logic)"]
        App2["Worker Node 2<br/>(Business Logic)"]
        App3["Worker Node 3<br/>(Business Logic)"]
    end

    subgraph DataTier["Data Tier (Isolated Subnet - Stateful)"]
        Cache[("Redis Cache<br/>(Hot Reads)")]
        Pool["PgBouncer<br/>(Connection Pooler)"]
        DB[("PostgreSQL Primary<br/>(Authoritative State)")]
    end

    Browser -->|"HTTPS (TLS 1.3)"| Proxy
    Proxy -->|"HTTP / gRPC (0.5ms hop)"| App1
    Proxy --> App2
    Proxy --> App3
    
    App1 --> Cache
    App2 --> Cache
    App3 --> Cache
    
    App1 --> Pool
    App2 --> Pool
    App3 --> Pool
    Pool --> DB
```

---

## Systematic Taxonomic Reference Grids

### Multi-Tier Architecture Taxonomy

| Architecture Pattern | Where Logic Lives | Primary Advantage | Critical Architectural Risk | Typical Production Usage |
| :--- | :--- | :--- | :--- | :--- |
| **Single-Tier** | Monolithic binary on client machine | Zero network latency; simple deployment | Impossible to share state or push server-side patches | CLI utilities, desktop applications, SQLite local scripts. |
| **Two-Tier (Client-Server)** | Embedded directly in every client | Rapid prototyping for small internal tools | **Security Risk:** Database credentials/ports exposed to clients; logic duplicated across platforms | Legacy desktop POS apps, internal BI dashboards hitting DB directly. |
| **Three-Tier** | Dedicated stateless Application Tier | Independent horizontal scaling; strict DB firewall isolation | Adds network serialization hop (0.5–2 ms) between app and DB | Standard web apps, REST/GraphQL backends, mobile APIs. |
| **N-Tier (Microservices / Event)** | Distributed across Gateway, BFFs, Services, Queues, Workers | Extreme blast-radius isolation; independent team deployability | Distributed tracing complexity; tail latency amplification across hops | High-scale distributed systems, streaming platforms, fintech gateways. |

### Network Latency Cost per Tier Boundary

| Traversal Hop | Physical Distance / Medium | Typical Latency Added | Architectural Consequence |
| :--- | :--- | :--- | :--- |
| **In-Process Memory Call** | CPU L1/L3 / RAM | $\sim 0.0001\text{ ms}$ ($100\text{ ns}$) | Fast, but breaks horizontal scaling when mutable state lives here. |
| **Loopback / Sidecar Proxy** | Kernel TCP/Unix Socket | $0.05 - 0.2\text{ ms}$ | Negligible overhead for Service Mesh proxies (Envoy) or local poolers. |
| **Intra-AZ Data Center Hop** | Top-of-Rack fiber switch | $0.5 - 1.5\text{ ms}$ | Typical cost between Presentation (NGINX) $\to$ App $\to$ Data Tier. |
| **Cross-AZ Hop** | Metro fiber ($10-50\text{ km}$) | $1.5 - 3.0\text{ ms}$ | Adds predictable delay for Multi-AZ high availability failover. |
| **Public Internet $\to$ Origin** | Global WAN routing + TLS | $30 - 300\text{ ms}$ | Justifies collapsing client round-trips via API Gateways or BFFs. |

---

## Production War Stories: Incident Post-Mortem

### SEV-1 Post-Mortem: The App-Tier Autoscaling Connection Stampede

#### Incident Overview
* **Severity:** SEV-1 (Total Database Connection Exhaustion & Site Outage)
* **Detection Time:** 8 minutes after flash-sale traffic began
* **Resolution Time:** 1 hour 50 minutes
* **Impact:** Complete checkout unavailability for 110 minutes during peak holiday traffic.

#### What Happened
An e-commerce platform ran a standard three-tier architecture on Kubernetes:
- **Presentation Tier:** NGINX Ingress Controller
- **Application Tier:** Stateless Python FastAPI pods configured with Kubernetes Horizontal Pod Autoscaler (HPA) scaling on CPU/Latency, each initializing a SQLAlchemy pool of `20` persistent PostgreSQL connections.
- **Data Tier:** Single Amazon RDS PostgreSQL instance configured with `max_connections = 500`.

During a flash sale, an unindexed analytics query caused PostgreSQL CPU to hit 95%. Queries stalled for 1.8 seconds instead of 5ms. Because incoming API requests piled up waiting on the slow database:
1. API request latency surged past 2,000ms.
2. The Kubernetes HPA detected degraded latency/CPU across the Application Tier and aggressively autoscaled API replicas from **12 pods to 45 pods**.
3. The 45 API pods opened $45 \times 20 = 900$ concurrent database connections.
4. PostgreSQL crossed `max_connections = 500`, violently rejecting all new connections with `FATAL: sorry, too many clients already`. Existing checkout transactions collapsed globally.

```mermaid
sequenceDiagram
    autonumber
    actor Users as Flash Sale Traffic
    participant HPA as Kubernetes Autoscaler
    participant App as App Tier (12 -> 45 Pods)
    participant DB as PostgreSQL (max_connections=500)

    Users->>App: Heavy Checkout Traffic Burst
    App->>DB: Unindexed Queries -> DB CPU hits 95% (Slow!)
    Note over App,DB: Queries stall for 2 seconds!<br/>App Tier threads stack up!

    HPA->>App: Detects Slow App Tier -> Autoscales 12 Pods to 45 Pods!
    App->>DB: 45 Pods * 20 Connections = 900 Connection Attempts!
    DB-->>App: FATAL: too many clients already (> 500 limit!)
    Note over DB,Users: Total Database Lockout! Scaling the WRONG tier caused self-DDoS!
```

#### Root Cause Analysis
1. **Scaling the Wrong Tier:** The database was the constrained bottleneck. Autoscaling the stateless Application Tier directly amplified connection pressure on the dying Data Tier.
2. **Missing Connection Pool Multiplexer:** Application workers opened raw TCP PostgreSQL connections directly rather than funneling through a lightweight connection pooler (PgBouncer).
3. **Lack of Circuit Breaking / Shedding:** Slow queries had no timeout bounds (`statement_timeout`), allowing hung connections to lock pool slots indefinitely.

#### The Fix & Architectural Hardening
1. **Deployed PgBouncer in Transaction Pooling Mode:** Decoupled 1,000+ client app connections into a controlled pool of 80 active PostgreSQL server connections.
2. **Implemented Redis Caching & Read Replicas:** Shifted read-heavy product queries to a Data-Tier Read Replica and Redis cache, dropping primary DB load by 85%.
3. **Added Database Timeout & Cap Guards:** Enforced `statement_timeout = 1500ms` and capped HPA maximum pod replicas strictly within database connection budgets.

---

## Multi-Language Production Code Tabs

The implementations below demonstrate two vital multi-tier patterns:
1. **Strict Tier Separation:** Reverse-proxy/controller ingress terminating client requests and forwarding cleanly to stateless domain services backed by an isolated connection-pooled Data Tier.
2. **Backend-for-Frontend (BFF) Fan-Out Aggregation:** Collapsing three internal intra-AZ microservice calls into one HTTP response to eliminate slow mobile WAN round trips.

### Production Three-Tier & BFF Aggregation Implementations

````carousel
```go
// Go: Three-Tier Separation with BFF Fan-Out & Pooled Data Access
package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"log"
	"net/http"
	"sync"
	"time"

	_ "github.com/lib/pq"
)

// Data Tier Adapter: Enforces Strict Connection Pool Caps
type OrderRepository struct {
	db *sql.DB
}

func NewOrderRepository(dsn string) (*OrderRepository, error) {
	db, err := sql.Open("postgres", dsn)
	if err != nil {
		return nil, err
	}
	// Crucial Three-Tier Guard: Never overwhelm the Data Tier
	db.SetMaxOpenConns(25)
	db.SetMaxIdleConns(10)
	db.SetConnMaxLifetime(5 * time.Minute)
	return &OrderRepository{db: db}, nil
}

func (r *OrderRepository) FetchOrderSummary(ctx context.Context, userID string) (int, error) {
	ctx, cancel := context.WithTimeout(ctx, 500*time.Millisecond)
	defer cancel()

	var count int
	err := r.db.QueryRowContext(ctx, "SELECT count(*) FROM orders WHERE user_id = $1", userID).Scan(&count)
	return count, err
}

// Application Tier / BFF: Collapses multiple internal tier calls in parallel
type DashboardBFF struct {
	repo *OrderRepository
}

func (b *DashboardBFF) HandleDashboard(w http.ResponseWriter, r *http.Request) {
	userID := r.URL.Query().Get("user_id")
	if userID == "" {
		http.Error(w, "missing user_id", http.StatusBadRequest)
		return
	}

	var wg sync.WaitGroup
	var orderCount int
	var profileTier string
	var repoErr error

	wg.Add(2)
	// Call 1: Data Tier Query
	go func() {
		defer wg.Done()
		orderCount, repoErr = b.repo.FetchOrderSummary(r.Context(), userID)
	}()

	// Call 2: Simulated Internal Cache / Profile Tier
	go func() {
		defer wg.Done()
		time.Sleep(2 * time.Millisecond) // Intra-AZ hop simulation
		profileTier = "Enterprise"
	}()

	wg.Wait()

	if repoErr != nil {
		http.Error(w, "data tier unavailable", http.StatusServiceUnavailable)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"user_id":      userID,
		"order_count":  orderCount,
		"account_tier": profileTier,
	})
}

func main() {
	log.Println("Three-Tier BFF pattern initialized.")
}
```
<!-- slide -->
```typescript
// TypeScript/Node.js: Three-Tier API with Connection Pool Bounds & Parallel BFF
import express, { Request, Response } from 'express';
import { Pool } from 'pg';

// Data Tier: Strictly bounded connection pool
const dataTierPool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://app:pass@localhost:5432/appdb',
  max: 20, // Protect PostgreSQL Data Tier from Connection Exhaustion
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Application Tier Service
class DashboardService {
  async fetchOrderCount(userId: string): Promise<number> {
    const res = await dataTierPool.query(
      'SELECT count(*)::int AS cnt FROM orders WHERE user_id = $1',
      [userId]
    );
    return res.rows[0]?.cnt ?? 0;
  }

  async fetchCacheStatus(userId: string): Promise<string> {
    // Simulated sub-millisecond Redis Cache tier hop
    return 'online';
  }
}

const app = express();
const service = new DashboardService();

// Presentation / BFF Aggregation Endpoint
app.get('/api/v1/dashboard/:userId', async (req: Request, res: Response) => {
  const { userId } = req.params;

  try {
    // Parallelize internal tier calls inside Data Center (saves 2 WAN hops)
    const [orderCount, presence] = await Promise.all([
      service.fetchOrderCount(userId),
      service.fetchCacheStatus(userId),
    ]);

    res.json({
      userId,
      orderCount,
      presence,
      servedBy: process.env.HOSTNAME || 'app-replica-1',
    });
  } catch (err) {
    res.status(503).json({ error: 'Data tier timeout or unavailable' });
  }
});
```
<!-- slide -->
```python
# Python: Three-Tier FastAPI Application with Bounded Pool & BFF Aggregation
import asyncio
from fastapi import FastAPI, HTTPException
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text

# Data Tier Connection Pool Configuration (Never Unbounded!)
engine = create_async_engine(
    "postgresql+asyncpg://app:pass@localhost:5432/appdb",
    pool_size=15,          # Max persistent connections per worker
    max_overflow=5,        # Burst buffer
    pool_timeout=2.0,      # Fail fast before stacking threads
)

app = FastAPI(title="Three-Tier BFF Service")

async def query_orders_from_db(user_id: str) -> int:
    async with engine.connect() as conn:
        res = await conn.execute(
            text("SELECT count(*) FROM orders WHERE user_id = :uid"),
            {"uid": user_id}
        )
        return res.scalar_one()

async def query_recommendations_from_cache(user_id: str) -> list[str]:
    await asyncio.sleep(0.002)  # Intra-AZ 2ms Redis hop
    return ["item_a", "item_b"]

@app.get("/dashboard/{user_id}")
async def get_dashboard_bff(user_id: str):
    """BFF aggregates Data Tier + Cache Tier concurrently in one HTTP response."""
    try:
        order_count, recommendations = await asyncio.gather(
            query_orders_from_db(user_id),
            query_recommendations_from_cache(user_id),
        )
        return {
            "user_id": user_id,
            "order_count": order_count,
            "recommendations": recommendations,
        }
    except Exception:
        raise HTTPException(status_code=503, detail="Downstream data tier overloaded")
```
<!-- slide -->
```csharp
// C#: ASP.NET Core Three-Tier Aggregation with Npgsql Connection Pooling
using System;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Npgsql;

var builder = WebApplication.CreateBuilder(args);

// Data Tier Pool Protection via MaxPoolSize
var connString = "Host=localhost;Database=appdb;Username=app;Password=pass;MaxPoolSize=25;Timeout=2;";
var dataSource = NpgsqlDataSource.Create(connString);
builder.Services.AddSingleton(dataSource);

var app = builder.Build();

app.MapGet("/api/v1/dashboard/{userId}", async (string userId, NpgsqlDataSource ds) =>
{
    try
    {
        var dbTask = FetchOrderCountAsync(ds, userId);
        var cacheTask = FetchCachePresenceAsync(userId);

        // Execute Data & Cache Tier calls in parallel inside the Data Center
        await Task.WhenAll(dbTask, cacheTask);

        return Results.Ok(new
        {
            userId,
            orderCount = await dbTask,
            presence = await cacheTask
        });
    }
    catch (NpgsqlException)
    {
        return Results.StatusCode(StatusCodes.Status503ServiceUnavailable);
    }
});

static async Task<long> FetchOrderCountAsync(NpgsqlDataSource ds, string userId)
{
    await using var cmd = ds.CreateCommand("SELECT count(*) FROM orders WHERE user_id = @uid");
    cmd.Parameters.AddWithValue("uid", userId);
    var res = await cmd.ExecuteScalarAsync();
    return Convert.ToInt64(res);
}

static async Task<string> FetchCachePresenceAsync(string userId)
{
    await Task.Delay(2); // Simulated Intra-AZ cache hop
    return "active";
}

app.Run();
```
````

---

## Practical Hands-On Verification CLI Workflows

Verify multi-tier request routing, upstream header injection, and database connection isolation using NGINX and PostgreSQL.

### Step 1: Validate Reverse Proxy Upstream Routing Configuration

Inspect a production three-tier NGINX proxy configuration forwarding traffic to an isolated stateless app pool while hiding direct database access:

```bash
cat << 'EOF' > nginx-three-tier.conf
upstream app_tier {
    server 127.0.0.1:8001;
    server 127.0.0.1:8002;
}

server {
    listen 8080;

    location /api/ {
        proxy_pass http://app_tier;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_connect_timeout 2s;
        proxy_read_timeout 5s;
    }
}
EOF
```

### Step 2: Inspect Round-Trip Hop Latency Breakdown

Measure exact TCP handshake vs Server Processing time across your reverse proxy using `curl`:

```bash
curl -s -w "\nDNS: %{time_namelookup}s\nTCP Connect: %{time_connect}s\nApp Processing (TTFB): %{time_starttransfer}s\nTotal Hop Time: %{time_total}s\n" \
  -o /dev/null https://httpbin.org/get
```

**Expected Wire Output:**
```text
DNS: 0.004120s
TCP Connect: 0.032410s
App Processing (TTFB): 0.145210s
Total Hop Time: 0.146050s
```

### Step 3: Monitor Active Connections in the Data Tier

Execute `pg_stat_activity` against PostgreSQL to ensure application pool limits are holding steady and not exhausting `max_connections`:

```bash
docker exec -i saas-onboarding-test psql -U postgres -c "
SELECT state, count(*) AS connection_count 
FROM pg_stat_activity 
GROUP BY state;
"
```

**Expected Wire Output:**
```text
 state  | connection_count 
--------+------------------
 active |                1
 idle   |                4
(2 rows)
```

---

## Operational Validation Checkpoints (Scenario Quizzes)

<details>
<summary><strong>Checkpoint 1: Scaling the Wrong Tier Under Bottleneck</strong></summary>

**Scenario:** Your telemetry shows p99 response latency spiking from 40ms to 3,500ms. Database CPU sits at 98%, while your stateless Application Tier servers sit at 15% CPU. An engineer proposes tripling the number of Application Tier Kubernetes pods to bring latency down. What actually happens when you triple the app servers, and what is the true remediation?

<strong>Answer:</strong>
Tripling the stateless application servers **makes the outage significantly worse**. Since the application tier is waiting synchronously on slow SQL queries, adding $3\times$ more app pods opens $3\times$ more persistent connections to the database and allows $3\times$ more concurrent requests to bombard the already CPU-starved PostgreSQL primary. Latency increases further until connection exhaustion triggers global `503` failures. The true fix belongs in the **Data Tier**: diagnose slow queries via `EXPLAIN ANALYZE`, add missing indexes, offload read queries to read replicas, insert a Redis cache in front of hot keys, or place PgBouncer in front of PostgreSQL to multiplex connections.
</details>

<details>
<summary><strong>Checkpoint 2: Mobile WAN Round-Trips vs. Backend-for-Frontend (BFF)</strong></summary>

**Scenario:** A mobile team builds a home screen that makes 4 sequential API calls directly from the user's phone (`GET /profile`, `GET /notifications`, `GET /feed`, `GET /ads`) over a slow 3G cellular connection. Total load time exceeds 4 seconds. How can an N-tier architectural adjustment reduce this to under 400ms without rewriting the underlying microservices?

<strong>Answer:</strong>
Introduce a **Backend-for-Frontend (BFF)** or **API Gateway Aggregation layer** at the Presentation Tier boundary. Instead of sending 4 separate requests across the high-latency public cellular WAN (paying $4 \times$ TLS/TCP handshakes and $4 \times$ cellular round-trips), the phone sends a single request (`GET /mobile/home-bundle`) to the BFF. Inside the cloud data center, the BFF fans out those 4 calls **in parallel** over ultra-fast intra-AZ fiber ($0.5 - 2\text{ ms}$ hops), merges the JSON payload, and streams one compressed response back to the mobile client.
</details>

<details>
<summary><strong>Checkpoint 3: The Exposed Two-Tier Reporting Anti-Pattern</strong></summary>

**Scenario:** An internal analytics startup initially built a mobile dashboard tool where the frontend React/Electron app queried the PostgreSQL database directly using a shared read-only SQL credential embedded in the client bundle. Why does migrating to a strict Three-Tier boundary become mandatory before onboarding external customers?

<strong>Answer:</strong>
A Two-Tier architecture breaks security, agility, and connection scalability:
1. **Security & Credential Exposure:** Any user can inspect the client bundle, extract the PostgreSQL hostname and credentials, and run unrestricted `SELECT *` queries bypassing UI filters (including leaking other tenants' records or launching resource-exhaustion `CROSS JOIN` queries).
2. **Protocol & Pool Limits:** Direct database wire protocols do not scale to tens of thousands of untrusted open client TCP sockets across the public internet; PostgreSQL crashes under thousands of idle sockets.
3. **Zero Schema Evolution:** Every schema migration requires simultaneously updating every distributed client binary because SQL statements are hardcoded inside the client. Inserting a stateless Application Tier behind TLS hides the database inside a private VPC, enforces authorization centrally, and isolates clients behind a stable versioned HTTP/REST contract.
</details>

---

## Further Reading & Sources

- [NGINX Documentation: HTTP Load Balancing & Reverse Proxy](https://nginx.org/en/docs/http/load_balancing.html) — Standard reverse proxy configuration for presentation tier ingress.
- [PostgreSQL & PgBouncer Pooling Architecture](https://www.pgbouncer.org/) — Protecting the data tier from application-tier connection storms.
- [Microsoft Cloud Architecture: Backend for Frontend (BFF) Pattern](https://learn.microsoft.com/en-us/azure/architecture/patterns/backends-for-frontends) — Collapsing client round-trips across tier boundaries.

---

## Free PDF notes

Download these notes as a printable PDF, with every diagram: [SD-A-002.pdf](https://backendroadmap.com/notes/system-design/SD-A-002.pdf). All Phase 1 notes in one file: [Phase 1, Core Fundamentals (PDF)](https://backendroadmap.com/notes/system-design/Phase1_Core_Fundamentals_Notes.pdf).

---

## Next

Continue with [Lesson 03: Functional Requirements](../03-functional-requirements/README.md) to learn how to scope complex prompts down to 3–5 concrete user actions before drawing any architectural boxes.
