# ACID Guarantees & The CAP Theorem: Transactional Invariants

> [!TIP]
> **The Golden Rule:** **ACID** governs transactional integrity on a single database engine; the **CAP Theorem** governs trade-offs when data is distributed across multiple network nodes. Never conflate the **ACID "C"** (preserving schema invariants, foreign keys, and business constraints) with the **CAP "C"** (linearizability—every read seeing the latest write across distributed replicas).

---

## 1. Visual Mental Model: The ACID Framework & Distributed CAP Trade-off

Every transactional database guarantees four distinct properties to prevent data corruption under concurrent load or server crashes.

```mermaid
flowchart TD
    subgraph ACID ["ACID Transaction Engine (Single Engine Guarantee)"]
        A["Atomicity\n(All-or-Nothing)\nWAL Undo Logging"]
        C["Consistency\n(Valid State Invariants)\nConstraints, Foreign Keys, CHECKs"]
        I["Isolation\n(Concurrent Independence)\nMVCC & Row Locks"]
        D["Durability\n(Committed Data Survives)\nWrite-Ahead Log (WAL) + fsync()"]
    end

    subgraph CAP ["CAP Theorem (Distributed Multi-Node Guarantee)"]
        P["Network Partition (P)\n(Network cables cut / packet drops)"]
        P --> Choice{"Network Partition Inevitable:\nChoose ONE"}
        Choice -- "Consistency (CP)" --> CP["CP (e.g., Spanner, CockroachDB, Raft)\n• Reject stale reads\n• Block until consensus confirmed\n• Decreased availability during partitions"]
        Choice -- "Availability (AP)" --> AP["AP (e.g., Cassandra, DynamoDB)\n• Accept writes on local node\n• Return stale reads if necessary\n• Eventual consistency"]
    end

    classDef acid fill:#10b981,stroke:#047857,stroke-width:2px,color:#fff;
    classDef cap fill:#3b82f6,stroke:#1d4ed8,stroke-width:2px,color:#fff;
    classDef check fill:#f59e0b,stroke:#b45309,stroke-width:2px,color:#fff;

    class A,C,I,D acid;
    class CP,AP,P cap;
    class Choice check;
```

---

## 2. Technical Comparison: ACID "C" vs CAP "C" vs BASE

A major source of confusion in system design interviews is the meaning of "Consistency":

| Property | Paradigm | Exact Technical Meaning | Failure Consequence |
| :--- | :--- | :--- | :--- |
| **ACID "C"** (Consistency) | Single-Node RDBMS | Schema constraints, `NOT NULL`, foreign keys, and `CHECK` rules are strictly upheld | A transaction attempting to create an orphaned order without a valid customer is rolled back |
| **CAP "C"** (Linearizability) | Distributed Systems | Every read operation receives the most recent write or an error | Node B returns stale data written to Node A 5ms ago because replication hasn't arrived |
| **BASE** (Eventual) | Distributed NoSQL | **B**asically **A**vailable, **S**oft state, **E**ventual consistency | High availability prioritized; temporary read inconsistencies tolerated across replicas |
| **PACELC Theorem** | Advanced Distributed | If **P**artition: choose **A**vailability or **C**onsistency; **E**lse: choose **L**atency or **C**onsistency | Dictates whether normal unpartitioned state trades read latency for synchronous replication |

---

## 3. Production War Story: The Phantom Overdraft & Missing Isolation Outage

### The Incident
A fintech app managed digital wallet balances for 1.2 million users. The transfer service allowed users to transfer money between their wallet and bank account.

The backend implemented the transfer as two sequential SQL queries:
1. `SELECT balance FROM accounts WHERE user_id = 'usr_42';` (Application checks if `balance >= 100`)
2. `UPDATE accounts SET balance = balance - 100 WHERE user_id = 'usr_42';`

An attacker automated concurrent requests using a bash script that fired 20 simultaneous withdrawal requests within a 3-millisecond window. Because the application executed the `SELECT` statements before any `UPDATE` committed—and ran at the default `READ COMMITTED` isolation level without row locks—all 20 threads read a starting balance of \$100.

All 20 threads passed the application-level balance check and executed their updates. The user successfully withdrew \$2,000 from an account that only contained \$100, leaving the account with an unauthorized negative balance of -\$1,900.

```mermaid
sequenceDiagram
    autonumber
    actor User as Attacker Script
    participant T1 as Worker Thread 1
    participant T2 as Worker Thread 2
    participant DB as PostgreSQL Database

    Note over DB: Starting Balance for User 42 = $100
    User->>T1: POST /withdraw { amount: 100 }
    User->>T2: POST /withdraw { amount: 100 } (Concurrent)

    T1->>DB: SELECT balance FROM accounts WHERE id = 42; -> $100
    T2->>DB: SELECT balance FROM accounts WHERE id = 42; -> $100
    Note over T1,T2: Both threads verify: 100 >= 100 -> Check Passed!

    T1->>DB: UPDATE accounts SET balance = 100 - 100 WHERE id = 42; (Balance = $0)
    T2->>DB: UPDATE accounts SET balance = 0 - 100 WHERE id = 42; (Balance = -$100!)
    Note over DB: User withdrew $200 from a $100 account!
```

### The Root Cause
1. **Time-Of-Check to Time-Of-Use (TOCTOU) Race Condition:** The state verified in step 1 was invalidated before step 2 executed.
2. **Missing Transactional Row Lock:** The query read the balance without acquiring an exclusive write lock (`FOR UPDATE`), allowing concurrent transactions to interleave read operations.

### The Verified Fix
- **Pessimistic Locking (`SELECT ... FOR UPDATE`):** Lock the specific account row within an atomic transaction. Concurrent transactions trying to read the same account will block until the first transaction commits or rolls back.
- **Atomic Balance Decrement with Database Constraints:**
  `UPDATE accounts SET balance = balance - 100 WHERE id = 42 AND balance >= 100;`
  Paired with a database check constraint: `ALTER TABLE accounts ADD CONSTRAINT positive_balance CHECK (balance >= 0);`

---

## 4. Multi-Language Production Implementation

### Go: Atomic Money Transfer with Row Locking (`FOR UPDATE`)

```go
package main

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"log/slog"
	"time"

	_ "github.com/lib/pq"
)

var (
	ErrInsufficientFunds = errors.New("insufficient funds for transfer")
	ErrAccountNotFound   = errors.New("one or both accounts not found")
)

type AccountService struct {
	db *sql.DB
}

// TransferFunds demonstrates ACID Atomicity and Isolation via SELECT FOR UPDATE
func (s *AccountService) TransferFunds(ctx context.Context, fromID, toID int64, amountCents int64) error {
	if amountCents <= 0 {
		return errors.New("transfer amount must be strictly positive")
	}

	// 1. Begin Atomic Transaction
	tx, err := s.db.BeginTx(ctx, &sql.TxOptions{Isolation: sql.LevelReadCommitted})
	if err != nil {
		return err
	}
	defer tx.Rollback() // Safe rollback if commit is not reached

	// Deterministic Lock Ordering: Prevent Deadlocks by ordering IDs
	firstLockID, secondLockID := fromID, toID
	if fromID > toID {
		firstLockID, secondLockID = toID, fromID
	}

	// 2. Acquire Exclusive Row Locks (Isolation guarantee)
	lockQuery := `SELECT id, balance_cents FROM accounts WHERE id IN ($1, $2) FOR UPDATE`
	rows, err := tx.QueryContext(ctx, lockQuery, firstLockID, secondLockID)
	if err != nil {
		return err
	}
	defer rows.Close()

	balances := make(map[int64]int64)
	for rows.Next() {
		var id, bal int64
		if err := rows.Scan(&id, &bal); err != nil {
			return err
		}
		balances[id] = bal
	}

	if len(balances) != 2 {
		return ErrAccountNotFound
	}

	// 3. Verify Business Invariants (ACID Consistency)
	if balances[fromID] < amountCents {
		return ErrInsufficientFunds
	}

	// 4. Execute atomic balance mutation
	debitQuery := `UPDATE accounts SET balance_cents = balance_cents - $1 WHERE id = $2`
	if _, err := tx.ExecContext(ctx, debitQuery, amountCents, fromID); err != nil {
		return err
	}

	creditQuery := `UPDATE accounts SET balance_cents = balance_cents + $1 WHERE id = $2`
	if _, err := tx.ExecContext(ctx, creditQuery, amountCents, toID); err != nil {
		return err
	}

	// 5. Commit Transaction (Durability guarantee via WAL flush)
	if err := tx.Commit(); err != nil {
		return fmt.Errorf("transaction commit failed: %w", err)
	}

	slog.Info("Transfer committed successfully", "from", fromID, "to", toID, "amount", amountCents)
	return nil
}
```

---

### Node.js (TypeScript): Safe Transaction Wrapper with Rollback Protection

```typescript
import { Pool, PoolClient } from 'pg';

export class BankingService {
  constructor(private pool: Pool) {}

  async transfer(fromAccountId: number, toAccountId: number, amountCents: number): Promise<void> {
    if (amountCents <= 0) throw new Error('Invalid transfer amount');

    const client: PoolClient = await this.pool.connect();

    try {
      // 1. Begin Transaction
      await client.query('BEGIN');

      // 2. Lock Sender Account with FOR UPDATE
      const senderRes = await client.query(
        'SELECT balance_cents FROM accounts WHERE id = $1 FOR UPDATE',
        [fromAccountId]
      );

      if (senderRes.rows.length === 0) throw new Error('Sender account not found');
      const senderBalance = senderRes.rows[0].balance_cents;

      // 3. Enforce Invariant Check
      if (senderBalance < amountCents) {
        throw new Error('INSUFFICIENT_FUNDS');
      }

      // 4. Lock Receiver Account
      const receiverRes = await client.query(
        'SELECT id FROM accounts WHERE id = $1 FOR UPDATE',
        [toAccountId]
      );
      if (receiverRes.rows.length === 0) throw new Error('Receiver account not found');

      // 5. Apply Updates
      await client.query(
        'UPDATE accounts SET balance_cents = balance_cents - $1 WHERE id = $2',
        [amountCents, fromAccountId]
      );
      await client.query(
        'UPDATE accounts SET balance_cents = balance_cents + $1 WHERE id = $2',
        [amountCents, toAccountId]
      );

      // 6. Commit
      await client.query('COMMIT');
    } catch (error) {
      // Automatic Rollback on any failure (Atomicity guarantee)
      await client.query('ROLLBACK');
      throw error;
    } finally {
      // Always return connection to the pool
      client.release();
    }
  }
}
```

---

### Python: FastAPI Async Transaction with Context Manager & Rollback

```python
import asyncpg
from fastapi import FastAPI, HTTPException, status
from pydantic import BaseModel, Field

app = FastAPI(title="ACID Transaction Engine")
db_pool: asyncpg.Pool = None

@app.on_event("startup")
async def startup():
    global db_pool
    db_pool = await asyncpg.create_pool("postgresql://postgres:pass@localhost:5432/bank_db")

class TransferRequest(BaseModel):
    from_account: int
    to_account: int
    amount_cents: int = Field(..., gt=0)

@app.post("/v1/transfers")
async def execute_transfer(req: TransferRequest):
    async with db_pool.acquire() as conn:
        # asyncpg conn.transaction() automatically issues BEGIN, COMMIT, or ROLLBACK on exception
        async with conn.transaction():
            # 1. Pessimistic Row Lock on sender
            sender_row = await conn.fetchrow(
                "SELECT balance_cents FROM accounts WHERE id = $1 FOR UPDATE",
                req.from_account
            )
            if not sender_row:
                raise HTTPException(status_code=404, detail="Sender account not found")

            if sender_row["balance_cents"] < req.amount_cents:
                raise HTTPException(status_code=400, detail="Insufficient funds")

            # 2. Lock receiver
            receiver_exists = await conn.fetchval(
                "SELECT 1 FROM accounts WHERE id = $1 FOR UPDATE",
                req.to_account
            )
            if not receiver_exists:
                raise HTTPException(status_code=404, detail="Receiver account not found")

            # 3. Debit and Credit
            await conn.execute(
                "UPDATE accounts SET balance_cents = balance_cents - $1 WHERE id = $2",
                req.amount_cents, req.from_account
            )
            await conn.execute(
                "UPDATE accounts SET balance_cents = balance_cents + $1 WHERE id = $2",
                req.amount_cents, req.to_account
            )

    return {"status": "success", "transferred_cents": req.amount_cents}
```

---

## 5. Practical Hands-On Verification Matrix

### Step 1: Execute Valid Transfer Transaction
```bash
curl.exe -i -X POST http://localhost:8000/v1/transfers \
  -H "Content-Type: application/json" \
  -d '{"from_account": 1, "to_account": 2, "amount_cents": 5000}'
```
**Expected Response:**
```http
HTTP/1.1 200 OK
Content-Type: application/json

{"status":"success","transferred_cents":5000}
```

### Step 2: Trigger Insufficient Funds Rollback
```bash
curl.exe -i -X POST http://localhost:8000/v1/transfers \
  -H "Content-Type: application/json" \
  -d '{"from_account": 1, "to_account": 2, "amount_cents": 99999999}'
```
**Expected Response:**
```http
HTTP/1.1 400 Bad Request
Content-Type: application/json

{"detail":"Insufficient funds"}
```

---

## 6. Operational Verification Quizzes

<details>
<summary><b>Checkpoint 1: The fsync() Bottleneck in ACID Durability</b></summary>

**Scenario:** A database server processes 1,000 commits per second. The DBA turns off `fsync` (`fsync = off` in `postgresql.conf`). Performance jumps from 1,000 to 45,000 writes/sec. That evening, the data center experiences a 2-second power flicker. What happens to the database?

**Correct Analysis:** Catastrophic Data Corruption and Transaction Loss. When `fsync` is disabled, the OS buffers disk writes in volatile RAM cache without flushing them to physical non-volatile storage. An abrupt power cut or kernel panic causes the data in memory to vanish forever. The database Write-Ahead Log (WAL) becomes corrupt, rendering recent transactions irrecoverable. In production, never disable `fsync` for durable transactional data; use battery-backed write caches or group commits instead.
</details>

<details>
<summary><b>Checkpoint 2: The CAP Theorem Fallacy: "I Picked CA"</b></summary>

**Scenario:** A software architect claims: "Our distributed microservices architecture chose Consistency (C) and Availability (A) from the CAP theorem, so we don't need to worry about Network Partitions (P)." Why is this statement impossible in physics?

**Correct Analysis:** Network partitions are not an optional choice—they are an inevitable physical reality of distributed systems. Routers fail, switches reboot, cables get cut, and garbage collection pauses drop packets. When a partition occurs, a distributed system *must* choose either: (1) Accept writes locally and risk inconsistency (AP), or (2) Reject writes to protect linearizability (CP). A "CA" system can only exist if the network has zero possibility of packet loss or failure, which is physically impossible.
</details>

<details>
<summary><b>Checkpoint 3: Deadlock Creation via Unordered Locks</b></summary>

**Scenario:** Transaction A executes `UPDATE accounts WHERE id = 1` then `UPDATE accounts WHERE id = 2`. Simultaneously, Transaction B executes `UPDATE accounts WHERE id = 2` then `UPDATE accounts WHERE id = 1`. Under high traffic, why do both transactions freeze and abort?

**Correct Analysis:** A Classic Deadlock. Transaction A acquires the lock on row 1 and waits for row 2. Transaction B acquires the lock on row 2 and waits for row 1. Neither can proceed, forming a circular wait graph. The database engine must intervene, detect the deadlock cycle, and forcibly terminate one of the transactions with a `40P01 deadlock_detected` error. Deadlocks are prevented by enforcing a **strict global lock order** (e.g. always acquiring locks in ascending ID order).
</details>

---

## Download Printable Reference & Diagrams

Download these notes as a printable PDF, with every diagram and interview questions: [SD-E-008: ACID Explained](https://backendroadmap.com/notes/system-design/SD-E-008.pdf). Each section in one file: [Phase 2, Databases (PDF)](https://backendroadmap.com/notes/system-design/Phase2_Databases_Notes.pdf).

---

## Further Reading & Sources

- [PostgreSQL Documentation: Chapter 13. Concurrency Control](https://www.postgresql.org/docs/current/mvcc.html)
- [Eric Brewer: CAP Twelve Years Later: How the "Rules" Have Changed](https://www.infoq.com/articles/cap-twelve-years-later-how-the-rules-have-changed/)
- [Martin Kleppmann: Designing Data-Intensive Applications (Chapter 7: Transactions)](https://dataintensive.net/)

---

## Next Steps

Advance to the next module:
[../02-querying-and-joins/README.md](../02-querying-and-joins/README.md)
Master relational querying: SQL execution order, Inner vs Outer joins, Index scans, Aggregations, and Window functions.
