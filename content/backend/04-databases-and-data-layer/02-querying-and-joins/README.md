# Querying and Joins: Relational Algebra & Query Execution Order

> [!TIP]
> **The Golden Rule:** SQL is written declaratively, but executed procedurally. Always understand the **Logical Query Processing Order** (`FROM` $\rightarrow$ `JOIN` $\rightarrow$ `WHERE` $\rightarrow$ `GROUP BY` $\rightarrow$ `HAVING` $\rightarrow$ `SELECT` $\rightarrow$ `ORDER BY` $\rightarrow$ `LIMIT`). Never put right-table filters in the `WHERE` clause of a `LEFT JOIN` unless you intend to convert it into an `INNER JOIN`, and always watch for **row multiplication** distorting aggregates.

---

## 1. Visual Mental Model: The Logical SQL Execution Pipeline

The database engine processes SQL clauses in a strict mathematical sequence that differs fundamentally from how the query is written:

```mermaid
flowchart TD
    Step1["1. FROM & JOIN\nIdentify source tables & apply ON conditions\n(Computes Cartesian product filtered by ON)"] --> Step2["2. WHERE\nFilter rows prior to aggregation\n(Aliases from SELECT not visible yet)"]
    Step2 --> Step3["3. GROUP BY\nCollapse individual rows into summary buckets"]
    Step3 --> Step4["4. HAVING\nFilter groups using aggregate functions (e.g. COUNT > 5)"]
    Step4 --> Step5["5. SELECT & Window Functions\nEvaluate expressions, column projections, and aliases"]
    Step5 --> Step6["6. DISTINCT\nEliminate duplicate row sets"]
    Step6 --> Step7["7. ORDER BY\nSort resulting rows (SELECT aliases ARE visible here)"]
    Step7 --> Step8["8. LIMIT / OFFSET\nSlice final pagination window"]

    classDef stage fill:#3b82f6,stroke:#1d4ed8,stroke-width:2px,color:#fff;
    classDef final fill:#10b981,stroke:#047857,stroke-width:2px,color:#fff;

    class Step1,Step2,Step3,Step4,Step5,Step6,Step7 stage;
    class Step8 final;
```

---

## 2. Relational Join Taxonomy & Behavior

```
┌────────────────────────────────────────────────────────────────────────┐
│                        Relational Join Types                           │
├─────────────────────┬──────────────────────────────────────────────────┤
│ Join Type           │ Behavior & Result Grain                          │
├─────────────────────┼──────────────────────────────────────────────────┤
│ INNER JOIN          │ Returns only rows with a match in BOTH tables    │
│ LEFT (OUTER) JOIN   │ Returns ALL rows from left, nulls for missing    │
│ RIGHT (OUTER) JOIN  │ Returns ALL rows from right, nulls for missing   │
│ FULL (OUTER) JOIN   │ Returns all rows from both tables, with nulls    │
│ CROSS JOIN          │ Unconditional Cartesian product (L * R rows)     │
│ LATERAL JOIN        │ Subquery evaluated per left row (correlated loop)│
└─────────────────────┴──────────────────────────────────────────────────┘
```

### The Critical Trap: `ON` vs `WHERE` in a `LEFT JOIN`

```sql
-- TRAP: Moving right-table condition into WHERE converts LEFT JOIN into INNER JOIN!
SELECT c.name, o.id, o.status
FROM customers c
LEFT JOIN orders o ON o.customer_id = c.id
WHERE o.status = 'COMPLETED';  -- BUG: Eliminates customers with ZERO orders!

-- CORRECT: Keep filter in the ON clause to preserve customers without completed orders
SELECT c.name, o.id, o.status
FROM customers c
LEFT JOIN orders o ON o.customer_id = c.id AND o.status = 'COMPLETED';
```

---

## 3. Production War Story: The Row Multiplication Billing Disaster

### The Incident
A SaaS accounting platform generated end-of-month invoice summaries for corporate clients. A backend developer wrote a query to compute total billable subscription revenue and total hours of customer support usage:

```sql
SELECT 
    c.id, 
    c.name, 
    SUM(s.monthly_price_cents) AS total_subscription_revenue,
    SUM(t.logged_hours) AS total_support_hours
FROM customers c
LEFT JOIN subscriptions s ON s.customer_id = c.id
LEFT JOIN support_tickets t ON t.customer_id = c.id
GROUP BY c.id, c.name;
```

A customer had 3 active subscriptions and 4 support tickets. 
1. Joining `subscriptions` produced 3 rows.
2. Joining `support_tickets` multiplied those 3 rows by 4 tickets, resulting in **12 rows** for that single customer!
3. `SUM(monthly_price_cents)` summed the subscription prices 4 times instead of once.
4. `SUM(logged_hours)` summed the ticket hours 3 times instead of once.
5. Invoices were sent to 1,400 customers overbilling them by \$1,200,000, triggering an emergency weekend billing freeze.

```mermaid
sequenceDiagram
    autonumber
    actor Dev as Backend Reporting Query
    participant DB as Postgres Engine

    Note over DB: Customer 1 has 3 Subscriptions ($100 each) and 4 Tickets (2h each)
    Dev->>DB: Execute naive double LEFT JOIN query
    Note over DB: Join 1: 1 Customer x 3 Subscriptions = 3 intermediate rows<br/>Join 2: 3 rows x 4 Tickets = 12 Cartesian rows!
    Note over DB: SUM(monthly_price) evaluates over 12 rows -> $1,200!<br/>Actual subscription cost was $300!
    DB-->>Dev: Overbilled by 400%!
```

### The Root Cause
**Row Multiplication across Independent One-to-Many Relationships:** Joining multiple child tables (`1:N` subscriptions and `1:N` tickets) creates a Cartesian product between the children, corrupting sum aggregates.

### The Verified Fix
- **Aggregate in Separate Common Table Expressions (CTEs):** Pre-aggregate each child table before joining:
```sql
WITH sub_totals AS (
    SELECT customer_id, SUM(monthly_price_cents) AS total_subscription_revenue
    FROM subscriptions
    GROUP BY customer_id
),
ticket_totals AS (
    SELECT customer_id, SUM(logged_hours) AS total_support_hours
    FROM support_tickets
    GROUP BY customer_id
)
SELECT 
    c.id, 
    c.name, 
    COALESCE(s.total_subscription_revenue, 0) AS total_revenue,
    COALESCE(t.total_support_hours, 0) AS total_hours
FROM customers c
LEFT JOIN sub_totals s ON s.customer_id = c.id
LEFT JOIN ticket_totals t ON t.customer_id = c.id;
```

---

## 4. Multi-Language Production Implementation

### Go: Advanced Query with CTE Pre-Aggregation

```go
package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"log/slog"
	"net/http"
	"time"

	_ "github.com/lib/pq"
)

type CustomerBillingSummary struct {
	CustomerID      int64  `json:"customer_id"`
	CustomerName    string `json:"customer_name"`
	RevenueCents    int64  `json:"revenue_cents"`
	SupportHours    int64  `json:"support_hours"`
}

type BillingRepository struct {
	db *sql.DB
}

// GetBillingSummaries uses CTEs to prevent row multiplication bugs
func (r *BillingRepository) GetBillingSummaries(ctx context.Context, tenantID string) ([]CustomerBillingSummary, error) {
	query := `
		WITH sub_totals AS (
			SELECT customer_id, SUM(monthly_price_cents) AS total_revenue
			FROM subscriptions
			WHERE tenant_id = $1
			GROUP BY customer_id
		),
		ticket_totals AS (
			SELECT customer_id, SUM(logged_hours) AS total_hours
			FROM support_tickets
			WHERE tenant_id = $1
			GROUP BY customer_id
		)
		SELECT 
			c.id, 
			c.name, 
			COALESCE(s.total_revenue, 0) AS revenue_cents,
			COALESCE(t.total_hours, 0) AS support_hours
		FROM customers c
		LEFT JOIN sub_totals s ON s.customer_id = c.id
		LEFT JOIN ticket_totals t ON t.customer_id = c.id
		WHERE c.tenant_id = $1
		ORDER BY revenue_cents DESC
		LIMIT 50;
	`

	rows, err := r.db.QueryContext(ctx, query, tenantID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var summaries []CustomerBillingSummary
	for rows.Next() {
		var s CustomerBillingSummary
		if err := rows.Scan(&s.CustomerID, &s.CustomerName, &s.RevenueCents, &s.SupportHours); err != nil {
			return nil, err
		}
		summaries = append(summaries, s)
	}

	return summaries, nil
}
```

---

### Node.js (TypeScript): Window Functions & Subquery Joins

```typescript
import { Pool } from 'pg';

export interface TopSpender {
  customerId: number;
  customerName: string;
  orderTotalCents: number;
  rank: number;
}

export class AnalyticsService {
  constructor(private pool: Pool) {}

  // Demonstrates Window Function: DENSE_RANK() OVER (ORDER BY ...)
  async getTopSpendersByQuarter(tenantId: string): Promise<TopSpender[]> {
    const query = `
      SELECT 
        c.id AS "customerId",
        c.name AS "customerName",
        SUM(o.total_cents) AS "orderTotalCents",
        DENSE_RANK() OVER (ORDER BY SUM(o.total_cents) DESC) AS "rank"
      FROM customers c
      JOIN orders o ON o.customer_id = c.id
      WHERE c.tenant_id = $1 AND o.status = 'COMPLETED'
      GROUP BY c.id, c.name
      LIMIT 10;
    `;

    const result = await this.pool.query(query, [tenantId]);
    return result.rows;
  }
}
```

---

### Python: FastAPI Correlated Lateral Join

```python
import asyncpg
from typing import List
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

app = FastAPI(title="Relational Query Engine")
db_pool: asyncpg.Pool = None

@app.on_event("startup")
async def startup():
    global db_pool
    db_pool = await asyncpg.create_pool("postgresql://postgres:pass@localhost:5432/app_db")

class CustomerRecentOrder(BaseModel):
    customer_id: int
    customer_name: str
    latest_order_id: int
    latest_order_cents: int

@app.get("/v1/customers/latest-orders", response_model=List[CustomerRecentOrder])
async def get_latest_orders_per_customer():
    # LATERAL JOIN allows subquery to reference outer table row (c.id) for Top-N per group
    query = """
        SELECT 
            c.id AS customer_id,
            c.name AS customer_name,
            latest.id AS latest_order_id,
            latest.total_cents AS latest_order_cents
        FROM customers c
        LEFT JOIN LATERAL (
            SELECT id, total_cents 
            FROM orders o 
            WHERE o.customer_id = c.id 
            ORDER BY created_at DESC 
            LIMIT 1
        ) latest ON true
        LIMIT 20;
    """
    async with db_pool.acquire() as conn:
        records = await conn.fetch(query)
        return [dict(r) for r in records]
```

---

## 5. Practical Hands-On Verification Matrix

### Step 1: Run Correlated Aggregation Query
```bash
curl.exe -i http://localhost:8000/v1/customers/latest-orders
```
**Expected Response:**
```http
HTTP/1.1 200 OK
Content-Type: application/json

[
  {
    "customer_id": 1,
    "customer_name": "Globex Corp",
    "latest_order_id": 9812,
    "latest_order_cents": 45000
  }
]
```

---

## 6. Operational Verification Quizzes

<details>
<summary><b>Checkpoint 1: The WHERE vs HAVING Filter Execution Trap</b></summary>

**Scenario:** A developer writes:
`SELECT category, COUNT(*) FROM products WHERE COUNT(*) > 10 GROUP BY category;`
PostgreSQL rejects the query with: `ERROR: aggregate functions are not allowed in WHERE`. Why?

**Correct Analysis:** Under the Logical Query Execution Order, `WHERE` executes in Step 2, *before* rows are collapsed into groups in Step 3. At Step 2, `COUNT(*)` does not exist because grouping has not yet occurred. The aggregate filter must be placed in the `HAVING` clause (`HAVING COUNT(*) > 10`), which executes in Step 4 *after* grouping.
</details>

<details>
<summary><b>Checkpoint 2: The Cartesian Product Memory Exhaustion</b></summary>

**Scenario:** A developer executes: `SELECT * FROM users, orders;` omitting the `ON users.id = orders.user_id` join condition. If `users` has 50,000 rows and `orders` has 200,000 rows, what happens to the database?

**Correct Analysis:** An accidental `CROSS JOIN` (Cartesian Product) produces:
$$50,000 \times 200,000 = 10,000,000,000 \text{ rows}$$
Evaluating 10 billion rows causes massive disk spilling to `pgsql_tmp`, saturating disk I/O, exhausting temporary tablespace storage, and locking worker processes until the query times out or the server crashes from out-of-memory.
</details>

<details>
<summary><b>Checkpoint 3: The NULL Comparison Trap in NOT IN Subqueries</b></summary>

**Scenario:** An application queries: `SELECT * FROM customers WHERE id NOT IN (SELECT customer_id FROM blacklisted_users)`. If a single row in `blacklisted_users` has `customer_id IS NULL`, the entire query returns 0 rows, even though valid customers exist. Why?

**Correct Analysis:** Three-Valued Logic in SQL (TRUE, FALSE, UNKNOWN). In SQL, `id NOT IN (1, 2, NULL)` is mathematically equivalent to:
$$\text{id} \ne 1 \text{ AND } \text{id} \ne 2 \text{ AND } \text{id} \ne \text{NULL}$$
Because any equality comparison with `NULL` yields `UNKNOWN`, the boolean `AND` chain evaluates to `UNKNOWN` or `FALSE` for every single row. To prevent this bug, either filter out nulls (`WHERE customer_id IS NOT NULL`) or use `NOT EXISTS (SELECT 1 FROM blacklisted_users b WHERE b.customer_id = customers.id)`.
</details>

---

## Further Reading & Sources

- [PostgreSQL Documentation: Chapter 7. Queries (Table Expressions & Joins)](https://www.postgresql.org/docs/current/queries-table-expressions.html)
- [Use The Index, Luke: SQL Joins and Performance](https://use-the-index-luke.com/)
- [Modern SQL: LATERAL Joins & Window Functions](https://modern-sql.com/)

---

## Next Steps

Advance to the next module:
[../03-schema-design-and-indexing/README.md](../03-schema-design-and-indexing/README.md)
Explore database normalization (1NF through 3NF), B-Tree vs Hash vs GIN indexes, composite index column ordering rules, and covering indexes.
