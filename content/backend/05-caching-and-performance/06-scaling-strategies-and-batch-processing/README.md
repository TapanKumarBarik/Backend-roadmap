# Scaling Strategies & Batch Processing: Bulk I/O, Queues & Backpressure

> [!TIP]
> **The Golden Rule:** Never scale hardware to compensate for inefficient algorithms. Before adding replicas, eliminate per-item roundtrip overhead using **batch operations** (chunked bulk inserts, Redis pipelines), remove non-critical work (emails, PDF rendering) from the synchronous HTTP request path using **background worker queues**, and protect worker memory using **bounded queue backpressure**.

---

## 1. Visual Mental Model: Synchronous Request Path vs Asynchronous Batch Worker

Offloading non-critical operations from the HTTP request cycle transforms high-latency endpoints into snappy, bounded operations:

```mermaid
flowchart TD
    subgraph SyncPath ["Synchronous HTTP Request Path (< 20ms)"]
        Client["Client / User Agent"] -->|POST /v1/checkout| API["API Handler"]
        API -->|1. Fast DB Insert: status='PENDING'| DB[("PostgreSQL")]
        API -->|2. Enqueue Job: {order_id, user_id}| Queue[("Background Queue\n(Redis / SQS / RabbitMQ)")]
        API -- 3. Immediate 202 Accepted --> Client
    end

    subgraph AsyncWorker ["Asynchronous Batch Processing Pipeline"]
        Queue --> Worker["Worker Pool (Backpressure Guarded)"]
        Worker --> Batcher["Chunk Buffer (Batches of 500 items)"]
        Batcher --> Charge["Charge Payment Gateway"]
        Batcher --> Email["Send Confirmation Email (SES)"]
        Batcher --> Analytics["Push to Warehouse (ClickHouse)"]
    end

    classDef sync fill:#10b981,stroke:#047857,stroke-width:2px,color:#fff;
    classDef async fill:#3b82f6,stroke:#1d4ed8,stroke-width:2px,color:#fff;
    classDef store fill:#f59e0b,stroke:#b45309,stroke-width:2px,color:#fff;

    class Client,API,SyncPath sync;
    class Worker,Batcher,Charge,Email,Analytics,AsyncWorker async;
    class DB,Queue store;
```

---

## 2. Single-Item Processing vs Chunked Batching

| Metric | Single-Item Loop ($N = 10,000$) | Chunked Batch Processing ($500 \times 20$) | Performance Difference |
| :--- | :--- | :--- | :--- |
| **Network Roundtrips** | 10,000 roundtrips | 20 roundtrips | **$500\times$ fewer network hops** |
| **Database Transactions** | 10,000 individual `COMMIT`s | 20 batch `COMMIT`s | Eliminates 9,980 disk fsync operations |
| **Connection Hold Time** | Minutes (Locks worker thread) | Sub-second | Prevents connection pool starvation |
| **Memory Footprint** | Bounded (1 item at a time) | Bounded (Chunk size = 500) | Zero OOM risk |
| **Total Wall-Clock Time** | ~14.8 seconds | ~0.12 seconds | **$123\times$ speedup** |

---

## 3. Production War Story: The 50,000 Single-Row Webhook Crash

### The Incident
A SaaS e-commerce integration platform ingested order webhooks from Shopify. During a flash sale event, Shopify dispatched a batch of 50,000 webhooks within 30 seconds.

The incoming webhook handler executed:
```python
# The Flawed Loop
for item in payload["orders"]:
    # 50,000 individual SQL inserts, each paying TCP/TLS + transaction overhead!
    cursor.execute("INSERT INTO orders (id, amount) VALUES (%s, %s)", (item.id, item.amount))
    conn.commit()
```

1. Each single `INSERT` and `COMMIT` took ~1.5ms of roundtrip latency and Write-Ahead Log (WAL) fsync time.
2. $50,000 \times 1.5\text{ms} = \mathbf{75 \text{ seconds}}$ of continuous blocking database operations per batch.
3. As Shopify retried delayed webhooks, 20 parallel webhook handler instances ran the same loop simultaneously.
4. The database connection pool was starved instantly, WAL disk write throughput saturated at 100%, and the webhook receiver began throwing `504 Gateway Timeout`.
5. Shopify marked the webhook endpoint as failed and suspended webhook delivery for 4 hours.

```mermaid
sequenceDiagram
    autonumber
    actor Shopify as Shopify Webhook Dispatcher
    participant API as Webhook Ingress Fleet
    participant DB as Postgres Primary DB

    Shopify->>API: 50,000 Incoming Orders Burst
    loop 50,000 times sequentially
        API->>DB: INSERT INTO orders VALUES (1); COMMIT; (1.5ms)
        API->>DB: INSERT INTO orders VALUES (2); COMMIT; (1.5ms)
    end
    Note over DB: 50,000 single fsync writes locks disk for 75 seconds!<br/>Incoming connections back up and time out!
    API-->>Shopify: 504 Gateway Timeout!
    Note over Shopify: Webhook delivery disabled due to failure rate!
```

### The Root Cause
1. **Unbatched Single-Item I/O:** Executing 50,000 distinct database transactions instead of a single bulk operation.
2. **Synchronous Execution:** Processing heavy ingestion synchronously on the HTTP request thread.

### The Verified Fix
- **Chunked Bulk Insert (`psycopg.extras.execute_values` / `UNNEST`):**
  Group incoming rows into chunks of 1,000 items and execute a single multi-row insert:
  `INSERT INTO orders (id, amount) VALUES (1, 10), (2, 20), ...;`
- **Result:** Total execution time for 50,000 rows dropped from 75 seconds to **1.1 seconds** ($68\times$ speedup), with zero connection pool contention.

---

## 4. Multi-Language Production Implementation

### Go: Chunked Batch Processor with Bounded Worker Pool & Backpressure

```go
package main

import (
	"context"
	"database/sql"
	"fmt"
	"log/slog"
	"sync"
	"time"

	_ "github.com/lib/pq"
)

type WebhookEvent struct {
	ID     string
	Amount int64
}

type BatchProcessor struct {
	db        *sql.DB
	eventChan chan WebhookEvent // Bounded channel enforces backpressure
	batchSize int
	flushWait time.Duration
}

func NewBatchProcessor(db *sql.DB, bufferSize, batchSize int, flushWait time.Duration) *BatchProcessor {
	bp := &BatchProcessor{
		db:        db,
		eventChan: make(chan WebhookEvent, bufferSize),
		batchSize: batchSize,
		flushWait: flushWait,
	}
	go bp.startWorker()
	return bp
}

func (bp *BatchProcessor) Enqueue(event WebhookEvent) bool {
	select {
	case bp.eventChan <- event:
		return true // Enqueued successfully
	default:
		// Backpressure Defense: Channel buffer is full! Reject/shed load gracefully
		slog.Warn("Buffer saturated, dropping or shedding event", "event_id", event.ID)
		return false
	}
}

func (bp *BatchProcessor) startWorker() {
	batch := make([]WebhookEvent, 0, bp.batchSize)
	ticker := time.NewTicker(bp.flushWait)
	defer ticker.Stop()

	for {
		select {
		case event := <-bp.eventChan:
			batch = append(batch, event)
			if len(batch) >= bp.batchSize {
				bp.flush(batch)
				batch = make([]WebhookEvent, 0, bp.batchSize)
			}
		case <-ticker.C:
			if len(batch) > 0 {
				bp.flush(batch)
				batch = make([]WebhookEvent, 0, bp.batchSize)
			}
		}
	}
}

func (bp *BatchProcessor) flush(events []WebhookEvent) {
	start := time.Now()
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	tx, err := bp.db.BeginTx(ctx, nil)
	if err != nil {
		slog.Error("Failed to begin batch tx", "error", err)
		return
	}
	defer tx.Rollback()

	stmt, err := tx.PrepareContext(ctx, "INSERT INTO orders (id, amount) VALUES ($1, $2)")
	if err != nil {
		slog.Error("Failed to prepare statement", "error", err)
		return
	}
	defer stmt.Close()

	for _, e := range events {
		if _, err := stmt.ExecContext(ctx, e.ID, e.Amount); err != nil {
			slog.Error("Failed inserting row in batch", "error", err)
			return
		}
	}

	if err := tx.Commit(); err != nil {
		slog.Error("Failed to commit batch", "error", err)
		return
	}

	slog.Info("Flushed batch successfully", "count", len(events), "duration_ms", time.Since(start).Milliseconds())
}
```

---

### Node.js (TypeScript): Redis Pipeline Batch Execution

```typescript
import { createClient } from 'redis';

export class BatchCacheWarmService {
  constructor(private redis: ReturnType<typeof createClient>) {}

  // Pipelining: Sends 1,000 commands in ONE single TCP packet
  async warmProducts(products: { id: number; name: string; price: number }[]): Promise<void> {
    const pipeline = this.redis.multi();

    for (const p of products) {
      pipeline.setEx(`prod:${p.id}`, 3600, JSON.stringify(p));
    }

    // Single network roundtrip execution
    await pipeline.exec();
  }
}
```

---

### Python: FastAPI Asynchronous Background Task Offloading

```python
import asyncio
from fastapi import FastAPI, BackgroundTasks, status
from pydantic import BaseModel

app = FastAPI(title="Batch & Async Processing Engine")

class OrderCreateDTO(BaseModel):
    customer_id: int
    amount_cents: int
    email: str

def send_receipt_email_job(email: str, order_id: int):
    # Simulated 2-second external SES email API call
    print(f"[Worker] Sending receipt to {email} for order {order_id}...")
    # httpx.post("https://api.resend.com/emails", ...)

@app.post("/v1/orders", status_code=status.HTTP_202_ACCEPTED)
async def create_order(dto: OrderCreateDTO, background_tasks: BackgroundTasks):
    # 1. Critical Path: Fast Database Insert (<10ms)
    order_id = 10492 # Simulated db commit

    # 2. Non-Critical Path: Offloaded to Background Task (Never blocks HTTP response!)
    background_tasks.add_task(send_receipt_email_job, dto.email, order_id)

    return {
        "status": "accepted",
        "order_id": order_id,
        "message": "Order created. Receipt dispatched asynchronously."
    }
```

---

## 5. Practical Hands-On Verification Matrix

### Step 1: Submit Order (Instant 202 Accepted without Waiting for Email)
```bash
curl.exe -i -X POST http://localhost:8000/v1/orders \
  -H "Content-Type: application/json" \
  -d '{"customer_id": 42, "amount_cents": 5000, "email": "customer@example.com"}'
```
**Expected Response (<15ms Latency):**
```http
HTTP/1.1 202 Accepted
Content-Type: application/json

{
  "status": "accepted",
  "order_id": 10492,
  "message": "Order created. Receipt dispatched asynchronously."
}
```

---

## 6. Operational Verification Quizzes

<details>
<summary><b>Checkpoint 1: Why Bounded Channels/Queues Prevent Out-of-Memory (OOM) Crashes</b></summary>

**Scenario:** An asynchronous worker pipeline buffers incoming jobs in an unbounded queue (`new Queue()`). A sudden spike sends 2,000,000 jobs. What happens to the worker node?

**Correct Analysis:** Out-of-Memory (OOM) Crash. An unbounded queue accepts memory allocations indefinitely. If the arrival rate ($\lambda$) exceeds the processing service rate ($\mu$), the queue grows continuously until the process exhausts available RAM and the OS kills the process. A **bounded queue (e.g. buffer size 10,000)** applies backpressure: once the buffer is full, the system either blocks the producer, rejects the request (`429 Too Many Requests`), or sheds load cleanly without crashing.
</details>

<details>
<summary><b>Checkpoint 2: The Optimal Chunk Size for Database Batch Inserts</b></summary>

**Scenario:** A developer needs to insert 1,000,000 records. They try inserting all 1,000,000 rows in a single massive `INSERT INTO ... VALUES (...)` query. Why does the database reject or choke on this query?

**Correct Analysis:** Query Size Limits and Lock Duration. A single 1,000,000-row SQL query generates a 100+ MB plaintext SQL string, exceeding query parser memory limits and database packet sizes (`max_allowed_packet`). Furthermore, holding an exclusive table/index lock for the duration of a million-row insert starves all other concurrent operations. The production standard is **Chunked Batching**: iterate in batches of **1,000 to 5,000 rows**, committing each chunk independently.
</details>

<details>
<summary><b>Checkpoint 3: Redis Pipelining vs MSET Efficiency</b></summary>

**Scenario:** A service needs to write 5,000 key-value pairs to Redis. Why is Redis Pipelining (`pipeline.set()`) superior to a loop of 5,000 `redis.set()` calls?

**Correct Analysis:** Network Roundtrip Elimination. A loop of 5,000 sequential `SET` commands incurs 5,000 roundtrips of network latency ($5000 \times 0.5\text{ms} = 2.5\text{ seconds}$). With **Redis Pipelining**, the client buffers all 5,000 commands in a single local socket buffer and transmits them in 1 or 2 TCP packets. Redis executes them in order and returns all results in a single response, completing the operation in **4 milliseconds** ($600\times$ speedup).
</details>

---

## Further Reading & Sources

- [Martin Fowler: LMAX Architecture and Disruptor (Backpressure Patterns)](https://martinfowler.com/articles/lmax.html)
- [PostgreSQL Documentation: Bulk Data Loading Best Practices](https://www.postgresql.org/docs/current/populate.html)
- [Redis Official Documentation: Pipelining](https://redis.io/docs/manual/pipelining/)

---

## Next Steps

Advance to the next module:
[../07-concurrency-and-parallelism/README.md](../07-concurrency-and-parallelism/README.md)
Explore thread pools vs event loops, asynchronous I/O (Node.js event loop, Python asyncio, Go goroutines), CPU-bound vs I/O-bound scaling, and thread safety.
