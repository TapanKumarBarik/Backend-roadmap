# Module 06: Capstone — Build a Small SaaS

## What this module is

Every other capstone in this curriculum is open-ended, no solution given —
you're handed requirements and left to design. This one is different, by
explicit request: a **guided, step-by-step build** of a real, small,
working multi-tenant SaaS product, wiring together every mechanism from
modules 00-05 into one running app instead of five separate exercises. By
the end you'll have a minimal **project-tracker SaaS** (think a tiny
Trello/Linear) where: a company signs up and gets its own isolated tenant,
their users log in with tenant-scoped auth, they create projects and tasks
that no other tenant can ever see, their usage is metered against a plan,
and their traffic is rate-limited per tenant.

This module gives you the steps and the code. Type it in and run it
yourself rather than copy-pasting blindly — the point is watching each
module's mechanism actually operate together, not just reading that it
would.

## Stack and setup

Same as the rest of `backend/`: Python, FastAPI, PostgreSQL, SQLAlchemy.

```bash
mkdir saas-capstone && cd saas-capstone
python -m venv venv && source venv/bin/activate   # Windows: venv\Scripts\activate
pip install fastapi uvicorn "sqlalchemy>=2" psycopg[binary] pyjwt pydantic

docker run -d --name saas-capstone-pg \
  -e POSTGRES_PASSWORD=devpass -e POSTGRES_DB=saas_capstone -p 5432:5432 postgres:16
```

This capstone uses **shared schema + `tenant_id` columns** (module 04-10's
cheapest, default model — module 00's framework says this is correct for
a self-serve small-team product with no regulatory driver). Row-level
security is included as the real enforcement mechanism, not skipped for
simplicity — skipping it would defeat the point of the capstone.

## Step 1 — Schema: tenants, users, projects, tasks, usage, plans

```sql
-- schema.sql
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE plans (
    id TEXT PRIMARY KEY,
    max_projects INT,
    rate_limit_per_min INT
);
INSERT INTO plans VALUES ('free', 3, 30), ('pro', 50, 300);

CREATE TABLE tenants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    plan_id TEXT NOT NULL REFERENCES plans(id) DEFAULT 'free',
    status TEXT NOT NULL DEFAULT 'active'   -- 'provisioning' | 'active' | 'suspended'
);

CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    email TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'member',
    UNIQUE (tenant_id, email)              -- module 02: per-tenant, not global
);

CREATE TABLE projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    name TEXT NOT NULL
);

CREATE TABLE tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    project_id UUID NOT NULL REFERENCES projects(id),
    title TEXT NOT NULL,
    done BOOLEAN NOT NULL DEFAULT false
);

CREATE TABLE usage_counters (
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    metric TEXT NOT NULL,
    period_start DATE NOT NULL,
    count BIGINT NOT NULL DEFAULT 0,
    PRIMARY KEY (tenant_id, metric, period_start)
);

CREATE TABLE provisioning_jobs (
    id UUID PRIMARY KEY,
    tenant_id UUID REFERENCES tenants(id),
    completed_at TIMESTAMPTZ
);

-- module 04-10: row-level security as the real, database-enforced boundary
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON projects
    USING (tenant_id = current_setting('app.current_tenant')::uuid);

ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON tasks
    USING (tenant_id = current_setting('app.current_tenant')::uuid);

CREATE ROLE app_user LOGIN PASSWORD 'devpass';
GRANT SELECT, INSERT, UPDATE ON projects, tasks, tenants, users, usage_counters, provisioning_jobs TO app_user;
GRANT SELECT ON plans TO app_user;
```

```bash
docker exec -i saas-capstone-pg psql -U postgres -d saas_capstone < schema.sql
```

Note this deliberately runs the app as `app_user` (module 04-10's exercise
3 lesson) — never the superuser — or RLS silently does nothing.

## Step 2 — Tenant resolution middleware (module 01)

```python
# main.py
import re, uuid
from datetime import datetime, timedelta, timezone
from contextvars import ContextVar
from fastapi import FastAPI, Request, HTTPException, Depends, BackgroundTasks
from starlette.middleware.base import BaseHTTPMiddleware
from sqlalchemy import create_engine, text
import jwt

engine = create_engine("postgresql+psycopg://app_user:devpass@localhost/saas_capstone")
SECRET = "capstone-dev-secret"
SUBDOMAIN_RE = re.compile(r"^([a-z0-9-]+)\.saascapstone\.local$")
TENANT_AGNOSTIC_PATHS = {"/health", "/signup", "/login"}
current_tenant_id: ContextVar[str | None] = ContextVar("current_tenant_id", default=None)

app = FastAPI()

class TenantResolutionMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        if request.url.path in TENANT_AGNOSTIC_PATHS:
            return await call_next(request)

        host = request.headers.get("host", "")
        match = SUBDOMAIN_RE.match(host)
        if not match:
            raise HTTPException(400, "Unresolvable tenant from host")

        with engine.connect() as conn:
            row = conn.execute(
                text("SELECT id, slug, plan_id, status FROM tenants WHERE slug = :slug"),
                {"slug": match.group(1)},
            ).mappings().first()
        if row is None:
            raise HTTPException(404, "Unknown tenant")
        if row["status"] != "active":
            raise HTTPException(403, "Tenant suspended")

        request.state.tenant = row
        token = current_tenant_id.set(str(row["id"]))
        try:
            return await call_next(request)
        finally:
            current_tenant_id.reset(token)

app.add_middleware(TenantResolutionMiddleware)

def get_current_tenant(request: Request):
    tenant = getattr(request.state, "tenant", None)
    if tenant is None:
        raise HTTPException(500, "Tenant middleware did not run")
    return tenant
```

`saascapstone.local` won't resolve on your machine — as in module 01,
test by sending an explicit `Host` header rather than setting up real DNS.

## Step 3 — Provisioning (module 03) and login/auth (module 02)

```python
from pydantic import BaseModel

class SignupRequest(BaseModel):
    company_name: str
    slug: str
    admin_email: str
    admin_password: str

RESERVED_SLUGS = {"www", "api", "admin", "app"}

def provision_tenant(provisioning_id: str, payload: SignupRequest):
    with engine.begin() as conn:  # one transaction: the atomic core (module 03)
        existing_job = conn.execute(
            text("SELECT tenant_id FROM provisioning_jobs WHERE id = :id"),
            {"id": provisioning_id},
        ).first()
        if existing_job:
            return  # idempotent no-op on retry

        tenant_id = conn.execute(
            text("INSERT INTO tenants (slug, name) VALUES (:slug, :name) RETURNING id"),
            {"slug": payload.slug, "name": payload.company_name},
        ).scalar_one()

        import hashlib
        password_hash = hashlib.sha256(payload.admin_password.encode()).hexdigest()  # demo only — use bcrypt/argon2 for real auth (track 03)
        conn.execute(
            text("""INSERT INTO users (tenant_id, email, password_hash, role)
                     VALUES (:tid, :email, :ph, 'admin')"""),
            {"tid": tenant_id, "email": payload.admin_email, "ph": password_hash},
        )
        conn.execute(
            text("INSERT INTO projects (tenant_id, name) VALUES (:tid, 'Getting Started')"),
            {"tid": tenant_id},
        )
        conn.execute(
            text("INSERT INTO provisioning_jobs (id, tenant_id, completed_at) VALUES (:id, :tid, now())"),
            {"id": provisioning_id, "tid": tenant_id},
        )

@app.post("/signup")
def signup(payload: SignupRequest, background_tasks: BackgroundTasks):
    if payload.slug in RESERVED_SLUGS:
        raise HTTPException(400, "Slug is reserved")
    provisioning_id = str(uuid.uuid4())
    background_tasks.add_task(provision_tenant, provisioning_id, payload)
    return {"status": "provisioning"}

@app.post("/login")
def login(request: Request, email: str, password: str):
    host = request.headers.get("host", "")
    slug = SUBDOMAIN_RE.match(host).group(1)
    import hashlib
    password_hash = hashlib.sha256(password.encode()).hexdigest()
    with engine.connect() as conn:
        row = conn.execute(
            text("""SELECT u.id, u.role, t.id AS tenant_id FROM users u
                     JOIN tenants t ON t.id = u.tenant_id
                     WHERE t.slug = :slug AND u.email = :email AND u.password_hash = :ph"""),
            {"slug": slug, "email": email, "ph": password_hash},
        ).mappings().first()
    if row is None:
        raise HTTPException(401, "Invalid credentials")
    payload = {
        "sub": str(row["id"]),
        "tenant_id": str(row["tenant_id"]),
        "role": row["role"],
        "exp": datetime.now(timezone.utc) + timedelta(hours=8),
    }
    return {"token": jwt.encode(payload, SECRET, algorithm="HS256")}

def get_current_user(request: Request, tenant = Depends(get_current_tenant)):
    token = request.headers.get("authorization", "").removeprefix("Bearer ").strip()
    if not token:
        raise HTTPException(401, "Missing token")
    try:
        payload = jwt.decode(token, SECRET, algorithms=["HS256"])
    except jwt.PyJWTError:
        raise HTTPException(401, "Invalid or expired token")
    if payload["tenant_id"] != str(tenant["id"]):
        raise HTTPException(403, "Token does not belong to this tenant")  # module 02's core check
    return payload
```

## Step 4 — Tenant-scoped data access with RLS session binding

```python
from contextlib import contextmanager

@contextmanager
def tenant_conn(tenant_id: str):
    with engine.connect() as conn:
        conn.execute(text("SET app.current_tenant = :tid"), {"tid": tenant_id})
        with conn.begin():
            yield conn

class CreateProject(BaseModel):
    name: str

def enforce_project_quota(tenant = Depends(get_current_tenant)):
    with engine.begin() as conn:
        plan = conn.execute(
            text("SELECT max_projects FROM plans WHERE id = :pid"), {"pid": tenant["plan_id"]}
        ).mappings().first()
        period = datetime.now(timezone.utc).date().replace(day=1)
        row = conn.execute(
            text("""INSERT INTO usage_counters (tenant_id, metric, period_start, count)
                     VALUES (:tid, 'projects', :period, 1)
                     ON CONFLICT (tenant_id, metric, period_start)
                     DO UPDATE SET count = usage_counters.count + 1
                     RETURNING count"""),
            {"tid": tenant["id"], "period": period},
        ).mappings().first()
        if plan["max_projects"] is not None and row["count"] > plan["max_projects"]:
            raise HTTPException(402, "Project quota exceeded for your plan")  # module 04

@app.post("/projects")
def create_project(
    body: CreateProject,
    user = Depends(get_current_user),
    tenant = Depends(get_current_tenant),
    _quota = Depends(enforce_project_quota),
):
    with tenant_conn(str(tenant["id"])) as conn:
        row = conn.execute(
            text("INSERT INTO projects (tenant_id, name) VALUES (:tid, :name) RETURNING id, name"),
            {"tid": tenant["id"], "name": body.name},
        ).mappings().first()
    return dict(row)

@app.get("/projects")
def list_projects(user = Depends(get_current_user), tenant = Depends(get_current_tenant)):
    with tenant_conn(str(tenant["id"])) as conn:
        # No WHERE tenant_id needed — RLS enforces it (module 04-10). Still fine to add for index usage.
        rows = conn.execute(text("SELECT id, name FROM projects")).mappings().all()
    return [dict(r) for r in rows]
```

## Step 5 — Per-tenant rate limiting (module 05)

```python
import time

class TenantRateLimiter:
    def __init__(self, refill_per_sec: float = 0.5):
        self.refill_per_sec = refill_per_sec
        self.buckets: dict[str, tuple[float, float]] = {}

    def allow(self, tenant_id: str, capacity: int) -> bool:
        now = time.monotonic()
        tokens, last = self.buckets.get(tenant_id, (capacity, now))
        tokens = min(capacity, tokens + (now - last) * self.refill_per_sec)
        if tokens < 1:
            self.buckets[tenant_id] = (tokens, now)
            return False
        self.buckets[tenant_id] = (tokens - 1, now)
        return True

rate_limiter = TenantRateLimiter()

def enforce_rate_limit(tenant = Depends(get_current_tenant)):
    with engine.connect() as conn:
        plan = conn.execute(
            text("SELECT rate_limit_per_min FROM plans WHERE id = :pid"), {"pid": tenant["plan_id"]}
        ).mappings().first()
    if not rate_limiter.allow(str(tenant["id"]), plan["rate_limit_per_min"]):
        raise HTTPException(429, "Rate limit exceeded")

# Add `_rl = Depends(enforce_rate_limit)` to any route you want tenant-rate-limited.
```

(A production version keys this in Redis, not a local dict — module 05's
exercise 4 exists specifically to prove why.)

## Step 6 — Run it end to end

```bash
uvicorn main:app --reload
```

```bash
# 1. Sign up Acme (provisioning runs in the background — poll or just wait a beat)
curl -X POST http://localhost:8000/signup -H "Content-Type: application/json" \
  -d '{"company_name":"Acme","slug":"acme","admin_email":"admin@acme.com","admin_password":"devpass"}'

# 2. Sign up Globex too
curl -X POST http://localhost:8000/signup -H "Content-Type: application/json" \
  -d '{"company_name":"Globex","slug":"globex","admin_email":"admin@globex.com","admin_password":"devpass"}'

# 3. Log in as Acme's admin
curl -X POST "http://localhost:8000/login?email=admin@acme.com&password=devpass" \
  -H "Host: acme.saascapstone.local"
# -> {"token": "<acme_token>"}

# 4. Create a project as Acme
curl -X POST http://localhost:8000/projects -H "Host: acme.saascapstone.local" \
  -H "Authorization: Bearer <acme_token>" -H "Content-Type: application/json" \
  -d '{"name":"Website Redesign"}'

# 5. List projects as Acme — expect "Getting Started" (seeded) + "Website Redesign"
curl http://localhost:8000/projects -H "Host: acme.saascapstone.local" -H "Authorization: Bearer <acme_token>"

# 6. Try Acme's token against Globex — expect 403 (module 02's core check)
curl http://localhost:8000/projects -H "Host: globex.saascapstone.local" -H "Authorization: Bearer <acme_token>"

# 7. Log in as Globex's admin and list projects — expect ONLY Globex's seeded project, never Acme's
curl -X POST "http://localhost:8000/login?email=admin@globex.com&password=devpass" -H "Host: globex.saascapstone.local"
curl http://localhost:8000/projects -H "Host: globex.saascapstone.local" -H "Authorization: Bearer <globex_token>"

# 8. Exceed Acme's free-plan project quota (limit 3, already at 2) — create 2 more, then a 3rd should 402
curl -X POST http://localhost:8000/projects -H "Host: acme.saascapstone.local" -H "Authorization: Bearer <acme_token>" -H "Content-Type: application/json" -d '{"name":"P2"}'
curl -X POST http://localhost:8000/projects -H "Host: acme.saascapstone.local" -H "Authorization: Bearer <acme_token>" -H "Content-Type: application/json" -d '{"name":"P3"}'
# -> 402 Project quota exceeded for your plan
```

If step 6 does not return 403, or step 7 ever shows Acme's project name,
stop and re-check the middleware/auth wiring — that's the one guarantee
this entire track exists to build, and every earlier module's exercises
were designed to catch exactly this failure mode.

## What this capstone deliberately leaves out

Kept out to stay small and finishable, each pointing back at where it's
covered in full:

- Real password hashing (bcrypt/argon2, not the demo `sha256`) — track
  `03-authentication-and-authorization`.
- A real durable task queue instead of `BackgroundTasks` — track
  `06-background-processing-and-realtime`.
- Redis-backed rate limiting and RLS's `FORCE ROW LEVEL SECURITY` /
  non-superuser-connection hardening at production scale — module 05 and
  module 04-10 respectively.
- A real Stripe integration and webhook — module 04's "Further reading."
- Schema-per-tenant or database-per-tenant variants — module 04-10 covers
  building those; this capstone deliberately uses the cheapest model per
  module 00's own decision framework for this product profile.

## Extending it yourself (optional, no solution given)

Once the guided build above runs end to end, try extending it without
further guidance, using only what modules 00-05 already taught:

- Add a tenant admin-only `DELETE /projects/{id}` route (module 02's
  `require_role`).
- Add `advanced_analytics` as a `pro`-only feature gate on a new endpoint
  (module 05's `require_feature`).
- Simulate a Stripe webhook that upgrades Acme to `pro` and confirm their
  project quota and rate limit both change immediately (module 04).

## This is the end of the track

Modules 00-06 are complete. You've built tenancy-model judgment (00),
tenant-aware routing (01), tenant-scoped auth (02), automated provisioning
(03), billing/metering (04), app-layer noisy-neighbor mitigation (05), and
wired all five into one real running app (06). Everything from here is
applying this same shape to a different product — the mechanisms don't
change.

Back to the track index: [../README.md](../README.md)
Back to the backend master index: [../../README.md](../../README.md)
