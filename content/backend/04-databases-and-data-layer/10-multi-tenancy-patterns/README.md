# Multi-Tenancy Patterns: Database-per-Tenant, Schemas & Postgres RLS

> [!TIP]
> **The Golden Rule:** Never rely solely on application developers remembering to append `WHERE tenant_id = :id` to every query. In shared-table multi-tenancy, enforce **PostgreSQL Row-Level Security (RLS)** with `FORCE ROW LEVEL SECURITY`. This pushes tenant isolation into the database engine kernel itself, guaranteeing that an accidental missing filter returns only the active tenant's rows.

---

## 1. Visual Mental Model: Multi-Tenancy Architectures

B2B SaaS architectures trade off operational complexity against physical isolation:

```mermaid
flowchart TD
    subgraph SharedTable ["1. Shared Table (Discriminator Column) + RLS"]
        ST["Table: orders\n(tenant_id, id, amount)\n• Lowest infrastructure cost\n• Enforced via Postgres RLS kernel\n• Highest scalability"]
    end

    subgraph SchemaPerTenant ["2. Schema-per-Tenant (Namespaces)"]
        S1["Schema: tenant_a.orders"]
        S2["Schema: tenant_b.orders"]
        NoteSchema["• Strong namespace boundary\n• Migrations must run N times\n• Degrades past ~1,000 schemas"]
    end

    subgraph DatabasePerTenant ["3. Database-per-Tenant (Physical Isolation)"]
        DB1[("Database: tenant_a_db")]
        DB2[("Database: tenant_b_db")]
        NoteDB["• Maximum security & zero noisy neighbors\n• Contractual compliance (HIPAA / FinTech)\n• Multiplies backup and pooling costs by N"]
    end

    classDef shared fill:#10b981,stroke:#047857,stroke-width:2px,color:#fff;
    classDef schema fill:#f59e0b,stroke:#b45309,stroke-width:2px,color:#fff;
    classDef db fill:#3b82f6,stroke:#1d4ed8,stroke-width:2px,color:#fff;

    class ST shared;
    class S1,S2,NoteSchema schema;
    class DB1,DB2,NoteDB db;
```

---

## 2. Multi-Tenancy Architecture Comparison Matrix

| Pattern | Isolation Strength | Operational Overhead | Max Scale (Tenants) | Blast Radius of Code Bug |
| :--- | :--- | :--- | :--- | :--- |
| **Shared Table + RLS** | High (Engine kernel enforced) | **Lowest** (1 schema, 1 migration, 1 pool) | 100,000+ tenants | Minimal (RLS blocks cross-tenant reads even if `WHERE` is omitted) |
| **Schema-per-Tenant** | High (Namespace separation) | Moderate (Migrations run across all schemas) | ~1,000 schemas per DB | Contained to schema unless cross-schema join is made |
| **Database-per-Tenant** | **Absolute** (Physical separation) | **Highest** (N databases, N connection pools) | 50 to 500 enterprise tenants | Zero cross-tenant data access possible |

---

## 3. Production War Story: The Missing WHERE Clause Enterprise Leak

### The Incident
A healthcare compliance SaaS managed incident reporting across 250 enterprise hospitals using a shared PostgreSQL database. A developer shipped a new analytics feature with the following query:

```sql
-- Intended: SELECT * FROM incidents WHERE tenant_id = 'hosp_nyc' AND status = 'OPEN';
-- Shipped Bug:
SELECT * FROM incidents WHERE status = 'OPEN' ORDER BY created_at DESC;
```

The developer forgot to append `AND tenant_id = :current_tenant`. When the Chief Compliance Officer of Hospital A logged into their dashboard, the UI rendered **open malpractice investigations and patient data from 250 competing hospital networks**.

The incident triggered mandatory HIPAA breach notifications, a \$3,500,000 regulatory investigation, and an immediate halt to all new customer onboarding.

```mermaid
sequenceDiagram
    autonumber
    actor AdminA as Compliance Officer (Hospital A)
    participant API as SaaS API Handler
    participant DB as Shared PostgreSQL DB

    AdminA->>API: GET /v1/incidents?status=OPEN
    Note over API: Developer forgot "AND tenant_id = :tenant_id"!<br/>Query runs: SELECT * FROM incidents WHERE status = 'OPEN';
    API->>DB: Executes unscoped query across shared table
    DB-->>API: Returns rows belonging to Hospitals A, B, C, D...
    API-->>AdminA: Displays 4,200 confidential malpractice records from competitor hospitals!
    Note over AdminA: Catastrophic HIPAA Breach & Regulatory Investigation!
```

### The Root Cause
1. **Developer-Dependent Security:** Tenant isolation was enforced solely through manual application-level SQL filtering (`WHERE tenant_id = ?`).
2. **Missing Defense-in-Depth:** The database engine was not configured with kernel-level boundaries to prevent human coding error.

### The Verified Fix
- **PostgreSQL Row-Level Security (RLS):**
  ```sql
  ALTER TABLE incidents ENABLE ROW LEVEL SECURITY;
  ALTER TABLE incidents FORCE ROW LEVEL SECURITY;

  CREATE POLICY tenant_isolation_policy ON incidents
    FOR ALL
    USING (tenant_id = current_setting('app.current_tenant', true))
    WITH CHECK (tenant_id = current_setting('app.current_tenant', true));
  ```
- **Session Context Injection:** On every checkout from the connection pool, execute `SET LOCAL app.current_tenant = :tenant_id;`. Even if a developer writes `SELECT * FROM incidents;`, PostgreSQL automatically injects the tenant filter at the storage engine level.

---

## 4. Multi-Language Production Implementation: Postgres RLS Integration

### Go: PostgreSQL Row-Level Security Transaction Wrapper

```go
package main

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"log/slog"
	"net/http"

	_ "github.com/lib/pq"
)

type TenantRepository struct {
	db *sql.DB
}

// WithTenantTransaction sets the session context variable for Postgres RLS
func (r *TenantRepository) WithTenantTransaction(ctx context.Context, tenantID string, fn func(tx *sql.Tx) error) error {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	// Inject tenant context into PostgreSQL session (SET LOCAL restricts to current tx)
	setTenantQuery := fmt.Sprintf("SET LOCAL app.current_tenant = %s", pqQuoteLiteral(tenantID))
	if _, err := tx.ExecContext(ctx, setTenantQuery); err != nil {
		return fmt.Errorf("failed to set tenant RLS context: %w", err)
	}

	if err := fn(tx); err != nil {
		return err
	}

	return tx.Commit()
}

func pqQuoteLiteral(s string) string {
	return "'" + strings.ReplaceAll(s, "'", "''") + "'"
}
```

---

### Node.js (TypeScript): Tenant-Isolated Middleware with Row-Level Security

```typescript
import { Pool, PoolClient } from 'pg';
import { Request, Response, NextFunction } from 'express';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export async function withTenantContext<T>(
  tenantId: string,
  operation: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    
    // Set RLS session variable for current transaction
    await client.query('SET LOCAL app.current_tenant = $1', [tenantId]);

    const result = await operation(client);
    
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// Handler execution
export async function listIncidentsHandler(req: Request, res: Response) {
  const tenantId = (req as any).tenantId; // Resolved from JWT/session

  const incidents = await withTenantContext(tenantId, async (client) => {
    // NOTICE: Query omits "WHERE tenant_id = ..."!
    // Postgres RLS automatically filters rows to ONLY this tenant!
    const query = 'SELECT id, title, status FROM incidents WHERE status = $1';
    const result = await client.query(query, ['OPEN']);
    return result.rows;
  });

  res.json({ incidents });
}
```

---

### Python: FastAPI Dependency-Injected Postgres RLS Session

```python
import asyncpg
from typing import Annotated
from fastapi import FastAPI, Depends, Header, HTTPException
from pydantic import BaseModel

app = FastAPI(title="RLS Multi-Tenancy API")
db_pool: asyncpg.Pool = None

@app.on_event("startup")
async def startup():
    global db_pool
    db_pool = await asyncpg.create_pool("postgresql://postgres:pass@localhost:5432/saas_db")

def get_tenant_id(x_tenant_id: Annotated[str, Header()]) -> str:
    if not x_tenant_id:
        raise HTTPException(status_code=400, detail="Missing X-Tenant-ID header")
    return x_tenant_id

@app.get("/v1/incidents")
async def get_incidents(tenant_id: Annotated[str, Depends(get_tenant_id)]):
    async with db_pool.acquire() as conn:
        async with conn.transaction():
            # Inject tenant context into PostgreSQL RLS engine
            await conn.execute("SET LOCAL app.current_tenant = $1", tenant_id)

            # RLS ensures zero cross-tenant row leakage
            rows = await conn.fetch("SELECT id, title, status FROM incidents")
            return [dict(r) for r in rows]
```

---

## 5. Practical Hands-On Verification Matrix

### Step 1: Query Incidents as Tenant Alpha
```bash
curl.exe -i http://localhost:8000/v1/incidents \
  -H "X-Tenant-ID: tenant_alpha"
```
**Expected Response (Only Tenant Alpha records returned by RLS):**
```http
HTTP/1.1 200 OK
Content-Type: application/json

[
  {"id": 1, "title": "Alpha Server Crash", "status": "OPEN"}
]
```

### Step 2: Query Incidents as Tenant Beta
```bash
curl.exe -i http://localhost:8000/v1/incidents \
  -H "X-Tenant-ID: tenant_beta"
```
**Expected Response (Only Tenant Beta records returned by RLS):**
```http
HTTP/1.1 200 OK
Content-Type: application/json

[
  {"id": 2, "title": "Beta Network Degraded", "status": "OPEN"}
]
```

---

## 6. Operational Verification Quizzes

<details>
<summary><b>Checkpoint 1: Why FORCE ROW LEVEL SECURITY is Mandatory</b></summary>

**Scenario:** A DBA enables RLS on a table: `ALTER TABLE orders ENABLE ROW LEVEL SECURITY;`. The backend application connects to PostgreSQL as the database owner/superuser `postgres`. When a query runs without a tenant ID, all tenant records are returned. Why did RLS fail to apply?

**Correct Analysis:** Superuser / Table Owner Bypass. By default in PostgreSQL, table owners and superusers bypass all Row-Level Security policies. To enforce that RLS applies even to the table owner, you must explicitly execute: **`ALTER TABLE orders FORCE ROW LEVEL SECURITY;`**. Additionally, production applications should connect using a dedicated non-superuser role (e.g. `app_user`) that has zero bypass privileges.
</details>

<details>
<summary><b>Checkpoint 2: The Schema-per-Tenant Migration Scalability Wall</b></summary>

**Scenario:** A B2B startup chooses Schema-per-Tenant. At 3,000 customers, running a database migration takes 4 hours and PostgreSQL starts throwing memory allocation warnings on connection startup. Why?

**Correct Analysis:** PostgreSQL Catalog Bloat and Cache Contention. In PostgreSQL, each table in each schema consumes entries in internal system catalogs (`pg_class`, `pg_attribute`). With 3,000 schemas each having 50 tables, the database manages 150,000 distinct tables! System catalog queries degrade, connection startup RAM explodes, and running schema migrations sequentially across 3,000 schemas requires hours of DDL locks. For large tenant counts ($>1,000$), shared tables with RLS scale vastly better.
</details>

<details>
<summary><b>Checkpoint 3: Noisy Neighbor Protection in Multi-Tenant Databases</b></summary>

**Scenario:** In a shared multi-tenant database, Tenant A runs an un-indexed reporting query that consumes 95% of database CPU for 10 minutes. Tenants B through Z experience severe query timeouts. How do you prevent one tenant from degrading others?

**Correct Analysis:** Resource Isolation & Hybrid Tiering. First, enforce strict statement timeouts on application connections (`SET statement_timeout = '3000'`). Second, implement query concurrency limits per tenant in the application or API gateway. Third, for large enterprise "whale" customers with high volume, migrate them to an isolated **dedicated database instance (Database-per-Tenant)** while keeping smaller standard tier customers on the shared RLS database.
</details>

---

## Further Reading & Sources

- [PostgreSQL Documentation: Row Security Policies](https://www.postgresql.org/docs/current/ddl-rowsecurity.html)
- [AWS Architecture: SaaS Storage Strategies](https://docs.aws.amazon.com/wellarchitected/latest/saas-lens/storage-layer.html)
- [Multi-Tenant Data Architecture Guide](https://martinfowler.com/articles/patterns-of-distributed-systems/)

---

## Next Steps

Advance to the Step 4 Capstone:
[../11-capstone-project/README.md](../11-capstone-project/README.md)
Build the complete production Data Layer Subsystem integrating ACID transactions, row locking, connection pooling, and multi-tenant RLS.
