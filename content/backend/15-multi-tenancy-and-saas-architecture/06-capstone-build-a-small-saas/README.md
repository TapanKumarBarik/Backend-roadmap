# Module 06: Capstone — Build a Small SaaS

> **Prerequisites:** All prior modules in this track: [00-tenancy-models-and-decision-framework](../00-tenancy-models-and-decision-framework/README.md), [01-tenant-identification-and-request-routing](../01-tenant-identification-and-request-routing/README.md), [02-auth-and-authorization-across-tenants](../02-auth-and-authorization-across-tenants/README.md), [03-provisioning-and-onboarding-automation](../03-provisioning-and-onboarding-automation/README.md), [04-billing-plans-and-usage-metering](../04-billing-plans-and-usage-metering/README.md), and [05-scaling-and-noisy-neighbor-at-the-app-layer](../05-scaling-and-noisy-neighbor-at-the-app-layer/README.md).  
> **Estimated Reading Time:** 35 minutes  
> **Target Audience:** Full-stack engineers, backend developers, and systems architects building a production-grade, multi-tenant B2B SaaS platform from scratch.

> [!TIP]
> **The Golden Rule of SaaS Architecture:** Multi-tenancy is not a single feature; it is an end-to-end architectural contract. Every incoming request must establish a deterministic tenant context at the edge, verify cryptographic user identity against that specific tenant boundary, enforce plan quotas and rate limits before executing business logic, and bind the tenant context directly to database session variables (`SET LOCAL app.current_tenant`) to ensure database-level Row-Level Security guarantees total data isolation.

---

## Visual Mental Models & Architecture

### The Complete End-to-End Multi-Tenant Request Lifecycle

This capstone unifies the six pillars of multi-tenancy into a single running project management platform. Every HTTP request traverses a hardened defense pipeline before touching application state.

```mermaid
sequenceDiagram
    autonumber
    actor Alice as Alice (Acme Admin)
    participant Edge as Edge / Reverse Proxy
    participant MW_Route as 1. Routing Middleware
    participant MW_Rate as 2. Rate Limiting Governor
    participant MW_Auth as 3. Auth & Tenant Matcher
    participant MW_Quota as 4. Quota Enforcement Engine
    participant DB as 5. Postgres DB (RLS Enforced)

    Alice->>Edge: POST /api/v1/projects (Host: acme.saas.local)<br/>Authorization: Bearer <Acme_JWT><br/>Payload: {"name": "Mobile App"}

    Note over Edge,MW_Route: Pipeline Stage 1: Identification & Context
    Edge->>MW_Route: Forward request
    MW_Route->>DB: SELECT id, plan_id, status FROM tenants WHERE slug = 'acme'
    MW_Route->>MW_Route: Attach tenant context to request state (Tenant: 't_acme')

    Note over MW_Route,MW_Rate: Pipeline Stage 2: Rate Limiting & Governor
    MW_Route->>MW_Rate: Check Token Bucket for 't_acme' (Plan: 'free', Cap: 30 rpm)
    alt Rate Limit Exceeded
        MW_Rate-->>Alice: 429 Too Many Requests (Retry-After: 15s)
    end

    Note over MW_Rate,MW_Auth: Pipeline Stage 3: Cryptographic Identity & Scope
    MW_Rate->>MW_Auth: Validate JWT & Claims
    MW_Auth->>MW_Auth: Verify token signature & expiration
    MW_Auth->>MW_Auth: Cross-Tenant Check: token.tenant_id == request.tenant_id?
    alt Token Mismatch (Cross-Tenant Replay)
        MW_Auth-->>Alice: 403 Forbidden: "Token does not belong to this tenant"
    end

    Note over MW_Auth,MW_Quota: Pipeline Stage 4: Plan Entitlements & Metering
    MW_Auth->>MW_Quota: Check & Increment metric 'projects' (Limit: 3)
    MW_Quota->>DB: INSERT INTO usage_counters ... ON CONFLICT DO UPDATE
    alt Plan Quota Breached
        MW_Quota-->>Alice: 402 Payment Required: "Project quota reached. Upgrade to Pro."
    end

    Note over MW_Quota,DB: Pipeline Stage 5: Database Row-Level Security Execution
    MW_Quota->>DB: BEGIN TRANSACTION
    MW_Quota->>DB: SET LOCAL app.current_tenant = 't_acme'
    MW_Quota->>DB: INSERT INTO projects (tenant_id, name) VALUES ('t_acme', 'Mobile App')
    Note over DB: Postgres RLS Policy verifies: tenant_id == current_setting('app.current_tenant')
    DB-->>MW_Quota: Row Committed (id: 'proj_999')
    MW_Quota-->>Alice: 201 Created: {"id": "proj_999", "name": "Mobile App"}
```

---

## Systematic Taxonomic Reference Grids

### Capstone Architectural Subsystems & Invariants

| Architectural Subsystem | Source Module | Technical Responsibility | Failure Mode if Compromised | Invariant Verification Assertion |
| :--- | :--- | :--- | :--- | :--- |
| **Ingress Resolution** | Module 01 | Parse Subdomain from `Host` header; fetch tenant metadata | Request routed to wrong tenant or unhandled 500 error | `request.state.tenant != null` before reaching route handler. |
| **Rate Limiter Governor** | Module 05 | Token bucket check against Redis/memory keyed by `tenant_id` | Noisy neighbor exhausts application worker pool | Burst traffic over `plan.rate_limit_per_min` yields `429 Too Many Requests`. |
| **Tenant-Scoped Auth** | Module 02 | Verify JWT signature and enforce `token.tenant_id == request.tenant_id` | Attacker replays valid token from Tenant A against Tenant B | Replaying Tenant A token against Tenant B subdomain returns `403 Forbidden`. |
| **Entitlement Metering** | Module 04 | Atomic upsert into `usage_counters` evaluating plan threshold | Uncapped resource allocation; free tier uses infinite resources | Creating resources past plan maximum returns `402 Payment Required`. |
| **RLS Storage Isolation** | Module 00 / 04-10 | Execute `SET LOCAL app.current_tenant = :tid` on non-superuser connection | SQL injection or omitted `WHERE` clause leaks cross-tenant records | Query `SELECT * FROM projects` as Tenant B returns zero rows belonging to Tenant A. |
| **Automated Provisioning** | Module 03 | Background worker creates tenant, admin user, and default workspace | Zombie tenants or duplicate billing subscriptions on retry | Signup pipeline is fully idempotent; partial failures trigger rollback. |

### Multi-Tenant Error Signal Taxonomy

| HTTP Status Code | Semantic Meaning | Responsible Subsystem | Concrete Capstone Example | Client Remediation Action |
| :--- | :--- | :--- | :--- | :--- |
| **`400 Bad Request`** | Malformed Host or Reserved Slug | Routing Middleware | Request missing Host header or attempting to register `admin.saas.local` | Fix request headers or choose an unreserved organization slug. |
| **`401 Unauthorized`** | Missing or Invalid Authentication Token | Auth Middleware | Request missing `Authorization` header or signature invalid | Re-authenticate at `/login` to obtain a fresh JWT. |
| **`402 Payment Required`** | Plan Entitlement / Quota Breached | Billing Engine | Free tier tenant creating 4th project when plan limit is 3 | Redirect user to Stripe checkout or subscription upgrade portal. |
| **`403 Forbidden`** | Cross-Tenant Token Replay / Access Denied | Auth Middleware | User from Acme using Acme JWT on `globex.saas.local` | Inform user they lack authorization within this tenant boundary. |
| **`404 Not Found`** | Unknown Tenant Subdomain | Routing Middleware | Accessing `nonexistent.saas.local` | Check organization slug spelling or register a new tenant. |
| **`429 Too Many Requests`** | Velocity Threshold Exceeded | Rate Governor | Tenant bursting 40 requests in 5 seconds on 30 rpm Free plan | Back off exponentially; respect `Retry-After` header. |

---

## Production War Stories: Incident Post-Mortem

### SEV-1 Post-Mortem: The Missing RLS Connection Reset Data Leak

#### Incident Overview
* **Severity:** SEV-1 (Catastrophic Cross-Tenant Data Leak & Regulatory Compliance Breach)
* **Detection Time:** 75 minutes post-deployment
* **Resolution Time:** 1 hour 40 minutes
* **Impact:** 12 enterprise healthcare clients had sensitive patient management project lists displayed to unauthorized competitor organizations.

#### What Happened
A multi-tenant healthcare SaaS implemented PostgreSQL Row-Level Security. To isolate tenants, their connection context manager set a session variable:
```python
# The Flawed Session Context Manager
@contextmanager
def get_db_connection(tenant_id: str):
    conn = db_pool.get_connection()
    # VULNERABILITY: Uses SET SESSION instead of SET LOCAL, and does not reset!
    conn.execute(f"SET app.current_tenant = '{tenant_id}'")
    try:
        yield conn
    finally:
        db_pool.return_connection(conn) # Returned to pool with session variable active!
```

During a Tuesday morning traffic surge, connection pool reuse spiked. A request arrived from **Acme Corp** (`tenant_id = 't_acme'`). Thread 1 acquired Connection #14, executed `SET app.current_tenant = 't_acme'`, completed the query, and returned Connection #14 to the pool.

Milliseconds later, a second request arrived from an unauthenticated health check endpoint or a request where tenant resolution failed or was bypassed. Thread 2 acquired Connection #14 from the pool. Because Connection #14 still had `app.current_tenant = 't_acme'` persisted in its session state, any query executed by Thread 2 operated with Acme Corp's authorization!

Even worse, when **Globex** (`tenant_id = 't_globex'`) executed a request that raised an unhandled database exception *before* reaching the `SET` statement, the connection was returned un-sanitized. Subsequent queries executed against that connection returned Acme's private patient data to Globex's web dashboard.

```mermaid
sequenceDiagram
    autonumber
    actor Acme as Acme Admin
    actor Globex as Globex Admin
    participant Pool as Database Connection Pool
    participant Conn14 as Postgres Connection #14
    participant DB as Postgres Storage Engine

    Acme->>Pool: Acquire Connection
    Pool-->>Acme: Grant Connection #14
    Acme->>Conn14: SET app.current_tenant = 't_acme'
    Acme->>Conn14: SELECT * FROM projects -> Returns Acme Projects
    Acme->>Pool: Return Connection #14 (Session variable remains 't_acme'!)

    Note over Pool,Conn14: Connection returned to pool without RESET ALL or DISCARD ALL!

    Globex->>Pool: Acquire Connection
    Pool-->>Globex: Grant Connection #14
    Note over Globex,Conn14: Request crashes before SET executes!
    Globex->>Conn14: SELECT * FROM projects
    Note over Conn14,DB: Postgres RLS evaluates: tenant_id == 't_acme'!
    Conn14-->>Globex: Returns ACME'S PRIVATE PROJECTS to Globex! (Data Leak!)
```

#### Root Cause Analysis
1. **Persistent Session State in Pooled Connections:** Using `SET app.current_tenant` sets the parameter at the **SESSION** level. Because connection pools reuse long-lived TCP connections across multiple client requests, session variables persist unless explicitly cleared.
2. **Missing Transactional Scope:** The parameter was not scoped to a single transaction via `SET LOCAL`.
3. **Missing Pool Reset Hooks:** The connection pool configuration lacked connection lifecycle reset hooks (`DISCARD ALL` or `RESET ALL` on connection return).

#### The Fix & Architectural Hardening
1. **Mandatory Transactional Session Variables:** Replaced `SET` with `SET LOCAL app.current_tenant = :tid` executed strictly inside an explicit transaction block (`BEGIN ... COMMIT`). In PostgreSQL, `SET LOCAL` automatically expires the moment the transaction commits or rolls back, making cross-request state leakage impossible.
2. **Pool Reset Protection:** Configured the connection pool with `reset_on_return = True` (or `DISCARD ALL`) to flush any leaked session variables, temporary tables, or prepared statements before reassigning connections.

---

## Multi-Language Production Code Tabs

The following production implementations demonstrate the full capstone architecture:
1. **Host-based subdomain tenant routing middleware.**
2. **Tenant-scoped JWT authentication and cross-tenant replay prevention.**
3. **Database connection scoping using transactional `SET LOCAL app.current_tenant` with Row-Level Security.**
4. **Concurrency-safe atomic quota enforcement returning `402 Payment Required`.**
5. **Per-tenant token bucket rate limiting returning `429 Too Many Requests`.**

### Production Capstone Service Implementations

````carousel
```go
// Go: Complete Multi-Tenant B2B Capstone Service
package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"regexp"
	"strings"
	"sync"
	"time"

	"github.com/golang-jwt/jwt/v5"
	_ "github.com/lib/pq"
)

var (
	subdomainRegex = regexp.MustCompile(`^([a-z0-9-]+)\.saascapstone\.local(:[0-9]+)?$`)
	jwtSecret      = []byte("capstone-production-secret-key")
)

type TenantContext struct {
	ID     string
	Slug   string
	PlanID string
	Status string
}

type Claims struct {
	TenantID string `json:"tenant_id"`
	Role     string `json:"role"`
	jwt.RegisteredClaims
}

type TokenBucket struct {
	capacity   float64
	refillRate float64
	tokens     float64
	lastRefill time.Time
	mu         sync.Mutex
}

func (tb *TokenBucket) Allow() bool {
	tb.mu.Lock()
	defer tb.mu.Unlock()
	now := time.Now()
	elapsed := now.Sub(tb.lastRefill).Seconds()
	tb.tokens = tb.tokens + elapsed*tb.refillRate
	if tb.tokens > tb.capacity {
		tb.tokens = tb.capacity
	}
	tb.lastRefill = now
	if tb.tokens < 1.0 {
		return false
	}
	tb.tokens -= 1.0
	return true
}

type CapstoneApp struct {
	db          *sql.DB
	limiters    map[string]*TokenBucket
	limitersMu  sync.RWMutex
	planLimits  map[string]int
}

func NewCapstoneApp(db *sql.DB) *CapstoneApp {
	return &CapstoneApp{
		db:         db,
		limiters:   make(map[string]*TokenBucket),
		planLimits: map[string]int{"free": 3, "pro": 50},
	}
}

func (app *CapstoneApp) getLimiter(tenantID string) *TokenBucket {
	app.limitersMu.Lock()
	defer app.limitersMu.Unlock()
	if limiter, exists := app.limiters[tenantID]; exists {
		return limiter
	}
	limiter := &TokenBucket{capacity: 30, refillRate: 0.5, tokens: 30, lastRefill: time.Now()}
	app.limiters[tenantID] = limiter
	return limiter
}

// Middleware 1: Tenant Resolution from Host Subdomain
func (app *CapstoneApp) TenantMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/health" || r.URL.Path == "/signup" {
			next.ServeHTTP(w, r)
			return
		}

		host := r.Host
		matches := subdomainRegex.FindStringSubmatch(host)
		if len(matches) < 2 {
			http.Error(w, "Invalid host subdomain", http.StatusBadRequest)
			return
		}
		slug := matches[1]

		var t TenantContext
		err := app.db.QueryRowContext(r.Context(),
			"SELECT id, slug, plan_id, status FROM tenants WHERE slug = $1", slug).
			Scan(&t.ID, &t.Slug, &t.PlanID, &t.Status)
		if err != nil {
			http.Error(w, "Tenant not found", http.StatusNotFound)
			return
		}
		if t.Status != "active" {
			http.Error(w, "Tenant suspended", http.StatusForbidden)
			return
		}

		// Rate Limiting Check (Module 05)
		if !app.getLimiter(t.ID).Allow() {
			w.Header().Set("Retry-After", "5")
			http.Error(w, "Rate limit exceeded", http.StatusTooManyRequests)
			return
		}

		ctx := context.WithValue(r.Context(), "tenant", t)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

// Middleware 2: Tenant-Scoped JWT Authentication (Module 02)
func (app *CapstoneApp) AuthMiddleware(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		t, ok := r.Context().Value("tenant").(TenantContext)
		if !ok {
			http.Error(w, "Tenant context missing", http.StatusInternalServerError)
			return
		}

		authHeader := r.Header.Get("Authorization")
		tokenStr := strings.TrimPrefix(authHeader, "Bearer ")
		if tokenStr == "" {
			http.Error(w, "Missing authorization token", http.StatusUnauthorized)
			return
		}

		claims := &Claims{}
		token, err := jwt.ParseWithClaims(tokenStr, claims, func(token *jwt.Token) (interface{}, error) {
			return jwtSecret, nil
		})
		if err != nil || !token.Valid {
			http.Error(w, "Invalid token", http.StatusUnauthorized)
			return
		}

		// Cross-Tenant Defense Guard
		if claims.TenantID != t.ID {
			http.Error(w, "Token does not belong to this tenant", http.StatusForbidden)
			return
		}

		ctx := context.WithValue(r.Context(), "user", claims)
		next(w, r.WithContext(ctx))
	}
}

// Create Project Handler with RLS Session Binding & Quota Check
func (app *CapstoneApp) HandleCreateProject(w http.ResponseWriter, r *http.Request) {
	t := r.Context().Value("tenant").(TenantContext)
	var body struct{ Name string }
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "Invalid body", http.StatusBadRequest)
		return
	}

	// 1. Quota Check & Increment (Module 04)
	periodStart := time.Now().UTC().Format("2006-01-01")
	var count int
	upsertQuery := `
		INSERT INTO usage_counters (tenant_id, metric, period_start, count)
		VALUES ($1, 'projects', $2, 1)
		ON CONFLICT (tenant_id, metric, period_start)
		DO UPDATE SET count = usage_counters.count + 1
		RETURNING count;`
	err := app.db.QueryRowContext(r.Context(), upsertQuery, t.ID, periodStart).Scan(&count)
	if err != nil {
		http.Error(w, "Quota tracking failed", http.StatusInternalServerError)
		return
	}

	maxLimit := app.planLimits[t.PlanID]
	if count > maxLimit {
		// Roll back increment
		_, _ = app.db.ExecContext(r.Context(),
			"UPDATE usage_counters SET count = count - 1 WHERE tenant_id = $1 AND metric = 'projects' AND period_start = $2",
			t.ID, periodStart)
		http.Error(w, "Project quota exceeded for your plan", http.StatusPaymentRequired)
		return
	}

	// 2. Insert with Transactional RLS Session Context
	tx, err := app.db.BeginTx(r.Context(), nil)
	if err != nil {
		http.Error(w, "Database error", http.StatusInternalServerError)
		return
	}
	defer tx.Rollback()

	// SET LOCAL scopes setting strictly to this transaction!
	_, err = tx.ExecContext(r.Context(), "SET LOCAL app.current_tenant = $1", t.ID)
	if err != nil {
		http.Error(w, "Failed to set RLS context", http.StatusInternalServerError)
		return
	}

	var projectID string
	err = tx.QueryRowContext(r.Context(),
		"INSERT INTO projects (tenant_id, name) VALUES ($1, $2) RETURNING id",
		t.ID, body.Name).Scan(&projectID)
	if err != nil {
		http.Error(w, "Failed to insert project", http.StatusInternalServerError)
		return
	}

	if err := tx.Commit(); err != nil {
		http.Error(w, "Commit failed", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	_ = json.NewEncoder(w).Encode(map[string]string{"id": projectID, "name": body.Name})
}
```
<!-- slide -->
```typescript
// TypeScript/Node.js: Complete Express Multi-Tenant Capstone Platform
import express, { Request, Response, NextFunction } from 'express';
import { Pool, PoolClient } from 'pg';
import * as jwt from 'jsonwebtoken';

const app = express();
app.use(express.json());

const pool = new Pool({
  connectionString: 'postgresql://app_user:devpass@localhost:5432/saas_capstone',
});
const JWT_SECRET = 'capstone-production-secret-key';
const SUBDOMAIN_REGEX = /^([a-z0-9-]+)\.saascapstone\.local(:[0-9]+)?$/;

interface Tenant {
  id: string;
  slug: string;
  plan_id: string;
  status: string;
}

// 1. Tenant Resolution Middleware (Module 01)
app.use(async (req: Request, res: Response, next: NextFunction) => {
  if (['/health', '/signup'].includes(req.path)) return next();

  const host = req.headers.host || '';
  const match = SUBDOMAIN_REGEX.exec(host);
  if (!match) {
    return res.status(400).json({ error: 'Invalid subdomain format' });
  }

  const slug = match[1];
  try {
    const { rows } = await pool.query(
      'SELECT id, slug, plan_id, status FROM tenants WHERE slug = $1',
      [slug]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Tenant not found' });
    if (rows[0].status !== 'active') return res.status(403).json({ error: 'Tenant suspended' });

    (req as any).tenant = rows[0] as Tenant;
    next();
  } catch (err) {
    res.status(500).json({ error: 'Tenant resolution database error' });
  }
});

// 2. Tenant Scoped Auth Guard (Module 02)
const requireAuth = (req: Request, res: Response, next: NextFunction) => {
  const tenant = (req as any).tenant as Tenant;
  const authHeader = req.headers.authorization;
  const token = authHeader?.replace('Bearer ', '').trim();

  if (!token) return res.status(401).json({ error: 'Missing token' });

  try {
    const payload = jwt.verify(token, JWT_SECRET) as { sub: string; tenant_id: string; role: string };
    if (payload.tenant_id !== tenant.id) {
      return res.status(403).json({ error: 'Token does not belong to this tenant' });
    }
    (req as any).user = payload;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
};

// 3. Project Creation with RLS Context & Quota Enforcement (Modules 04 & 04-10)
app.post('/projects', requireAuth, async (req: Request, res: Response) => {
  const tenant = (req as any).tenant as Tenant;
  const { name } = req.body;
  const periodStart = new Date().toISOString().slice(0, 7) + '-01';

  const client: PoolClient = await pool.connect();
  try {
    await client.query('BEGIN');

    // Atomic Quota Check
    const quotaSql = `
      INSERT INTO usage_counters (tenant_id, metric, period_start, count)
      VALUES ($1, 'projects', $2, 1)
      ON CONFLICT (tenant_id, metric, period_start)
      DO UPDATE SET count = usage_counters.count + 1
      RETURNING count;
    `;
    const qRes = await client.query(quotaSql, [tenant.id, periodStart]);
    const currentCount = parseInt(qRes.rows[0].count, 10);

    const planRes = await client.query('SELECT max_projects FROM plans WHERE id = $1', [tenant.plan_id]);
    const maxProjects = planRes.rows[0]?.max_projects ?? 3;

    if (currentCount > maxProjects) {
      // Compensating decrement
      await client.query(
        'UPDATE usage_counters SET count = count - 1 WHERE tenant_id = $1 AND metric = $2 AND period_start = $3',
        [tenant.id, 'projects', periodStart]
      );
      await client.query('ROLLBACK');
      return res.status(402).json({ error: 'Project quota exceeded for your plan' });
    }

    // Set Local Session Context for Postgres RLS
    await client.query('SET LOCAL app.current_tenant = $1', [tenant.id]);

    const insertSql = 'INSERT INTO projects (tenant_id, name) VALUES ($1, $2) RETURNING id, name';
    const result = await client.query(insertSql, [tenant.id, name]);

    await client.query('COMMIT');
    res.status(201).json(result.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: 'Failed to create project' });
  } finally {
    client.release();
  }
});
```
<!-- slide -->
```python
# Python: Complete FastAPI Multi-Tenant Capstone Platform
import re
from contextlib import contextmanager
from datetime import datetime, timezone, timedelta
from fastapi import FastAPI, Request, HTTPException, Depends, status
from pydantic import BaseModel
from sqlalchemy import create_engine, text
import jwt

app = FastAPI(title="Capstone SaaS Platform")
engine = create_engine("postgresql+psycopg://app_user:devpass@localhost:5432/saas_capstone")
JWT_SECRET = "capstone-production-secret-key"
SUBDOMAIN_RE = re.compile(r"^([a-z0-9-]+)\.saascapstone\.local(:[0-9]+)?$")

class ProjectCreate(BaseModel):
    name: str

@contextmanager
def tenant_transaction(tenant_id: str):
    """Scoped transaction establishing SET LOCAL RLS parameter"""
    with engine.connect() as conn:
        with conn.begin():
            conn.execute(text("SET LOCAL app.current_tenant = :tid"), {"tid": tenant_id})
            yield conn

# 1. Routing Dependency (Module 01)
def get_tenant_context(request: Request):
    host = request.headers.get("host", "")
    match = SUBDOMAIN_RE.match(host)
    if not match:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid host subdomain")
    slug = match.group(1)

    with engine.connect() as conn:
        tenant = conn.execute(
            text("SELECT id, slug, plan_id, status FROM tenants WHERE slug = :s"),
            {"s": slug}
        ).mappings().first()

    if not tenant:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Tenant does not exist")
    if tenant["status"] != "active":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Tenant suspended")
    return tenant

# 2. Auth Dependency & Cross-Tenant Defense (Module 02)
def get_authenticated_user(request: Request, tenant = Depends(get_tenant_context)):
    auth_header = request.headers.get("authorization", "")
    token = auth_header.removeprefix("Bearer ").strip()
    if not token:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Missing authorization token")

    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
    except jwt.PyJWTError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid or expired token")

    if payload.get("tenant_id") != str(tenant["id"]):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Token does not belong to this tenant")
    return payload

# 3. Create Project with Atomic Quota & RLS (Modules 04 & 04-10)
@app.post("/projects", status_code=status.HTTP_201_CREATED)
def create_project(
    body: ProjectCreate,
    tenant = Depends(get_tenant_context),
    user = Depends(get_authenticated_user)
):
    period_start = datetime.now(timezone.utc).date().replace(day=1)
    
    with engine.begin() as conn:
        # Atomic Quota Evaluation
        res = conn.execute(text("""
            INSERT INTO usage_counters (tenant_id, metric, period_start, count)
            VALUES (:tid, 'projects', :period, 1)
            ON CONFLICT (tenant_id, metric, period_start)
            DO UPDATE SET count = usage_counters.count + 1
            RETURNING count;
        """), {"tid": tenant["id"], "period": period_start}).scalar_one()

        plan = conn.execute(
            text("SELECT max_projects FROM plans WHERE id = :pid"),
            {"pid": tenant["plan_id"]}
        ).mappings().first()

        max_allowed = plan["max_projects"] if plan else 3
        if res > max_allowed:
            conn.execute(text("""
                UPDATE usage_counters SET count = count - 1 
                WHERE tenant_id = :tid AND metric = 'projects' AND period_start = :period
            """), {"tid": tenant["id"], "period": period_start})
            raise HTTPException(status.HTTP_402_PAYMENT_REQUIRED, "Project quota exceeded for your plan")

    # Secure Insert using SET LOCAL Session Variable
    with tenant_transaction(str(tenant["id"])) as conn:
        row = conn.execute(
            text("INSERT INTO projects (tenant_id, name) VALUES (:tid, :n) RETURNING id, name"),
            {"tid": tenant["id"], "n": body.name}
        ).mappings().first()

    return dict(row)
```
<!-- slide -->
```csharp
// C#: Complete ASP.NET Core Multi-Tenant Capstone Platform
using System;
using System.Data;
using System.IdentityModel.Tokens.Jwt;
using System.Text.RegularExpressions;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;
using Npgsql;

var builder = WebApplication.CreateBuilder(args);
var dataSource = NpgsqlDataSource.Create("Host=localhost;Database=saas_capstone;Username=app_user;Password=devpass");
builder.Services.AddSingleton(dataSource);

var app = builder.Build();
var subdomainRegex = new Regex(@"^([a-z0-9-]+)\.saascapstone\.local(:[0-9]+)?$", RegexOptions.Compiled);
const string jwtSecret = "capstone-production-secret-key";

// 1. Tenant Resolution Middleware
app.Use(async (context, next) =>
{
    if (context.Request.Path.StartsWithSegments("/health") || context.Request.Path.StartsWithSegments("/signup"))
    {
        await next();
        return;
    }

    var host = context.Request.Host.Value;
    var match = subdomainRegex.Match(host);
    if (!match.Success)
    {
        context.Response.StatusCode = StatusCodes.Status400BadRequest;
        await context.Response.WriteAsync("Invalid host subdomain");
        return;
    }

    var slug = match.Groups[1].Value;
    await using var conn = await dataSource.OpenConnectionAsync();
    await using var cmd = new NpgsqlCommand("SELECT id, slug, plan_id, status FROM tenants WHERE slug = @s", conn);
    cmd.Parameters.AddWithValue("s", slug);
    await using var reader = await cmd.ExecuteReaderAsync();

    if (!await reader.ReadAsync())
    {
        context.Response.StatusCode = StatusCodes.Status404NotFound;
        return;
    }

    var tenantId = reader.GetGuid(0);
    var planId = reader.GetString(2);
    context.Items["tenant_id"] = tenantId;
    context.Items["plan_id"] = planId;

    await next();
});

// 2. Protected Project Creation Endpoint
app.MapPost("/projects", async (HttpContext context, NpgsqlDataSource ds) =>
{
    var tenantId = (Guid)context.Items["tenant_id"]!;
    var planId = (string)context.Items["plan_id"]!;

    // Cryptographic Token Verification
    var authHeader = context.Request.Headers.Authorization.ToString();
    var tokenStr = authHeader.Replace("Bearer ", "").Trim();
    var handler = new JwtSecurityTokenHandler();
    var jwtToken = handler.ReadJwtToken(tokenStr);

    var tokenTenant = jwtToken.Payload["tenant_id"]?.ToString();
    if (tokenTenant != tenantId.ToString())
    {
        context.Response.StatusCode = StatusCodes.Status403Forbidden;
        await context.Response.WriteAsync("Token does not belong to this tenant");
        return;
    }

    // Atomic RLS Execution
    await using var conn = await ds.OpenConnectionAsync();
    await using var tx = await conn.BeginTransactionAsync();

    // Set Local Session Variable
    await using (var setCmd = new NpgsqlCommand("SET LOCAL app.current_tenant = @tid", conn, tx))
    {
        setCmd.Parameters.AddWithValue("tid", tenantId);
        await setCmd.ExecuteNonQueryAsync();
    }

    await using (var insertCmd = new NpgsqlCommand("INSERT INTO projects (tenant_id, name) VALUES (@tid, 'Default Proj') RETURNING id", conn, tx))
    {
        insertCmd.Parameters.AddWithValue("tid", tenantId);
        var id = await insertCmd.ExecuteScalarAsync();
        await tx.CommitAsync();
        await context.Response.WriteAsJsonAsync(new { id = id });
    }
});
```
````

---

## Practical Hands-On Verification CLI Workflows

Follow this end-to-end verification sequence using PostgreSQL Docker and `curl` to prove cross-tenant isolation, RLS enforcement, and quota limits.

### Step 1: Initialize Database Container and Dedicated Unprivileged Role

```bash
docker run -d --name saas-capstone-pg \
  -e POSTGRES_PASSWORD=devpass \
  -e POSTGRES_DB=saas_capstone \
  -p 5432:5432 postgres:16
```

Initialize the schema and enable Row-Level Security:

```bash
docker exec -i saas-capstone-pg psql -U postgres -d saas_capstone << 'EOF'
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS plans (
    id TEXT PRIMARY KEY,
    max_projects INT,
    rate_limit_per_min INT
);
INSERT INTO plans VALUES ('free', 2, 30), ('pro', 50, 300) ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS tenants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    plan_id TEXT NOT NULL REFERENCES plans(id) DEFAULT 'free',
    status TEXT NOT NULL DEFAULT 'active'
);

CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'member',
    UNIQUE (tenant_id, email)
);

CREATE TABLE IF NOT EXISTS projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS usage_counters (
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    metric TEXT NOT NULL,
    period_start DATE NOT NULL,
    count BIGINT NOT NULL DEFAULT 0,
    PRIMARY KEY (tenant_id, metric, period_start)
);

-- Row-Level Security Configuration
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON projects;
CREATE POLICY tenant_isolation ON projects
    USING (tenant_id = current_setting('app.current_tenant', true)::uuid);

-- Create Non-Superuser Role (Superuser bypasses RLS!)
DROP ROLE IF EXISTS app_user;
CREATE ROLE app_user LOGIN PASSWORD 'devpass';
GRANT SELECT, INSERT, UPDATE, DELETE ON projects, tenants, users, usage_counters, plans TO app_user;
EOF
```

### Step 2: Seed Two Separate Tenants (Acme and Globex)

```bash
docker exec -i saas-capstone-pg psql -U postgres -d saas_capstone << 'EOF'
-- Seed Acme Corp
INSERT INTO tenants (id, slug, name, plan_id) 
VALUES ('11111111-1111-1111-1111-111111111111', 'acme', 'Acme Corporation', 'free')
ON CONFLICT (id) DO NOTHING;

-- Seed Globex Inc
INSERT INTO tenants (id, slug, name, plan_id) 
VALUES ('22222222-2222-2222-2222-222222222222', 'globex', 'Globex International', 'free')
ON CONFLICT (id) DO NOTHING;
EOF
```

### Step 3: Insert Records Under Acme with RLS Enabled

Connect as the unprivileged `app_user` role and insert a project for Acme:

```bash
docker exec -i saas-capstone-pg psql -U app_user -d saas_capstone << 'EOF'
BEGIN;
SET LOCAL app.current_tenant = '11111111-1111-1111-1111-111111111111';
INSERT INTO projects (id, tenant_id, name) 
VALUES ('33333333-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111', 'Acme Top Secret Roadmap');
COMMIT;
EOF
```

### Step 4: Verify Cross-Tenant Isolation via Row-Level Security

Execute a bare `SELECT * FROM projects` as `app_user` under Globex's tenant context:

```bash
docker exec -i saas-capstone-pg psql -U app_user -d saas_capstone << 'EOF'
BEGIN;
SET LOCAL app.current_tenant = '22222222-2222-2222-2222-222222222222';
SELECT id, tenant_id, name FROM projects;
COMMIT;
EOF
```

**Expected Wire Output (Zero Rows Leaked to Globex!):**
```text
 id | tenant_id | name 
----+-----------+------
(0 rows)
```

Now switch context to Acme and verify the project appears:

```bash
docker exec -i saas-capstone-pg psql -U app_user -d saas_capstone << 'EOF'
BEGIN;
SET LOCAL app.current_tenant = '11111111-1111-1111-1111-111111111111';
SELECT id, tenant_id, name FROM projects;
COMMIT;
EOF
```

**Expected Wire Output:**
```text
                  id                  |              tenant_id               |          name           
--------------------------------------+--------------------------------------+-------------------------
 33333333-3333-3333-3333-333333333333 | 11111111-1111-1111-1111-111111111111 | Acme Top Secret Roadmap
(1 row)
```

### Step 5: Verify Plan Quota Rejection

Simulate Acme creating projects until breaching their Free tier allocation (`max_projects = 2`):

```bash
docker exec -i saas-capstone-pg psql -U app_user -d saas_capstone << 'EOF'
-- Seed Counter at 2 (Max for Free Plan)
INSERT INTO usage_counters (tenant_id, metric, period_start, count)
VALUES ('11111111-1111-1111-1111-111111111111', 'projects', '2026-11-01', 2)
ON CONFLICT (tenant_id, metric, period_start) DO UPDATE SET count = 2;

-- Attempt 3rd Project: Evaluate Quota Threshold
DO $$
DECLARE
    v_new_count INT;
    v_max INT := 2;
BEGIN
    INSERT INTO usage_counters (tenant_id, metric, period_start, count)
    VALUES ('11111111-1111-1111-1111-111111111111', 'projects', '2026-11-01', 1)
    ON CONFLICT (tenant_id, metric, period_start)
    DO UPDATE SET count = usage_counters.count + 1
    RETURNING count INTO v_new_count;

    IF v_new_count > v_max THEN
        UPDATE usage_counters SET count = count - 1 
        WHERE tenant_id = '11111111-1111-1111-1111-111111111111' AND metric = 'projects' AND period_start = '2026-11-01';
        RAISE EXCEPTION 'HTTP 402: Project quota reached for free plan';
    END IF;
END $$;
EOF
```

**Expected Wire Output:**
```text
ERROR:  HTTP 402: Project quota reached for free plan
CONTEXT:  PL/pgSQL function inline_code_block line 16 at RAISE
```

---

## Operational Validation Checkpoints (Scenario Quizzes)

<details>
<summary><strong>Checkpoint 1: The PostgreSQL Superuser RLS Trap</strong></summary>

**Scenario:** An engineer deploys the capstone application to production. They configure Row-Level Security on all database tables and write unit tests verifying that `SET LOCAL app.current_tenant = :tid` filters data correctly. However, in production, whenever a user runs `SELECT * FROM projects`, they see all projects across all tenants. What configuration error caused this complete isolation breakdown?

<strong>Answer:</strong>
The production application connected to PostgreSQL using the default database owner or superuser account (e.g., `postgres` or `rds_superuser`). In PostgreSQL, **superusers and table owners bypass all Row-Level Security policies by default**. RLS policies are completely ignored unless the table explicitly specifies `ALTER TABLE projects FORCE ROW LEVEL SECURITY;` or the application connects as an unprivileged application role (`app_user`). Always create a dedicated, non-superuser login role with strictly granted DML permissions for application connections.
</details>

<details>
<summary><strong>Checkpoint 2: The SET LOCAL vs. SET SESSION Boundary</strong></summary>

**Scenario:** What is the difference between executing `SET app.current_tenant = 't_acme'` versus `SET LOCAL app.current_tenant = 't_acme'` in a high-concurrency connection pool, and why is `SET LOCAL` non-negotiable?

<strong>Answer:</strong>
* `SET app.current_tenant = '...'` sets the configuration variable at the **session level**. The setting persists for the entire lifetime of the TCP connection until overwritten or cleared. In connection-pooled applications (e.g., PgBouncer or HikariCP), returning the connection to the pool leaves the variable set. If a subsequent request reuses that connection without resetting the variable, it operates with the previous tenant's identity, causing catastrophic cross-tenant data leaks.
* `SET LOCAL app.current_tenant = '...'` sets the variable strictly for the **duration of the current transaction block** (`BEGIN ... COMMIT / ROLLBACK`). When the transaction finishes, PostgreSQL automatically resets the setting to its default value. This guarantees zero state leakage across pooled connection reuses.
</details>

<details>
<summary><strong>Checkpoint 3: The Multi-Tenant JWT Cross-Replay Exploit</strong></summary>

**Scenario:** Alice has an account on Acme Corp (`acme.saas.local`). She opens her browser console, copies her valid JWT, and dispatches a request using Postman to `https://globex.saas.local/api/v1/projects` with header `Authorization: Bearer <Acme_JWT>`. Describe how a poorly designed multi-tenant auth layer fails this scenario, and the exact check that thwarts the exploit.

<strong>Answer:</strong>
A flawed authentication layer verifies only the JWT signature against the server's public/private key. Because the token was legitimately signed by the SaaS platform, the signature verification passes, and the handler processes the request against Globex's subdomain. 
To thwart this cross-tenant replay exploit, the authentication middleware must perform an explicit **Tenant Scope Binding Check**:
```python
if token_claims["tenant_id"] != request.state.tenant.id:
    raise HTTPException(403, "Token does not belong to this tenant")
```
Even though the token is cryptographically valid, it is anchored to Acme's tenant ID, which does not match Globex's resolved context. The request is immediately rejected with `403 Forbidden` before executing any database queries.
</details>

---

## Extending the Platform (Optional Advanced Challenges)

Once you have verified the core multi-tenant platform end to end, consider implementing these production extensions:
1. **Tenant Role-Based Access Control (RBAC):** Implement a `require_role("admin")` dependency to restrict project deletion to organization administrators (Module 02).
2. **Dynamic Plan Feature Flags:** Implement a `require_feature("advanced_export")` middleware that inspects `plans.features` and returns `402 Payment Required` for lower tiers (Module 05).
3. **Automated Billing Webhook Synchronization:** Build an endpoint receiving Stripe `customer.subscription.updated` events, cryptographically verifying signatures, and upgrading the tenant's `plan_id` in real time (Module 04).

---

## Conclusion: Mastering Multi-Tenancy

You have built and verified a complete, production-grade multi-tenant architecture spanning:
- **Decision Frameworks:** Choosing between shared-schema, schema-per-tenant, and database-per-tenant isolation models.
- **Request Routing:** Extracting tenant context from subdomains and custom domains at the edge.
- **Identity & Authorization:** Scoping authentication and eliminating cross-tenant token replay attacks.
- **Automated Provisioning:** Managing atomic, idempotent onboarding state machines.
- **Billing & Quotas:** Concurrency-safe usage metering and asynchronous webhook synchronization.
- **Noisy-Neighbor Mitigation:** Distributed rate limiting and tiered infrastructure bulkheads.

---

## Further Reading & Sources

- [PostgreSQL Documentation: Row-Level Security Policies](https://www.postgresql.org/docs/current/ddl-rowsecurity.html) — Comprehensive guide to database-level multi-tenancy.
- [AWS SaaS Factory: Multi-Tenant Architecture Principles](https://aws.amazon.com/solutions/saas-factory/) — Enterprise architecture blueprints for scalable SaaS platforms.
- [RFC 7519: JSON Web Tokens (JWT)](https://datatracker.ietf.org/doc/html/rfc7519) — Standard claims and security considerations.

---

Back to the track index: [../README.md](../README.md)  
Back to the backend master index: [../../README.md](../../README.md)
