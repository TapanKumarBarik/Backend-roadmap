# Module 10: Multi-Tenancy Patterns

## Why this matters

Almost every real B2B application eventually asks the same question: your
one codebase now serves *many separate customers* (tenants) — company A,
company B, company C — and none of them may ever see another's data. That
requirement sounds simple ("just filter by customer") but the *how* has
three genuinely different answers with very different costs, and picking
the wrong one is expensive to undo later: a shared table with a forgotten
`WHERE tenant_id = ?` is a real, repeated cause of cross-customer data
leaks in production systems, while going the other extreme (a database
per customer) multiplies every operational cost from module 08 by your
tenant count. This module gives you the three standard architectures, the
concrete mechanism (Postgres row-level security) that makes the cheapest
one actually safe to trust, and the judgment for which to pick and when.

## Concepts

### The three standard models

- **Shared schema, shared tables** — every tenant's rows live in the same
  tables, distinguished by a `tenant_id` column. Cheapest to run and
  operate (one schema, one set of migrations, one connection pool); the
  isolation is entirely enforced *in code and/or policy*, not by physical
  separation.
- **Schema-per-tenant** — one Postgres database, but each tenant gets
  their own schema (namespace) with identical table structure
  (`tenant_a.orders`, `tenant_b.orders`, ...). Stronger isolation than a
  shared table (a bug in one tenant's schema-scoped query literally can't
  reach another schema), but migrations must now run once *per schema*
  and the schema count becomes an operational variable.
- **Database-per-tenant** — each tenant gets a fully separate database
  (potentially on separate infrastructure entirely). Strongest isolation
  (a noisy or compromised tenant can't even contend for the same
  connection pool or buffer cache as another), but now every operational
  cost from module 08 — backups, migrations, monitoring, connection
  pooling, failover — multiplies by tenant count.

```
  Shared schema              Schema-per-tenant           Database-per-tenant
  ┌──────────────┐           ┌───────────────────┐       ┌─────┐ ┌─────┐ ┌─────┐
  │ orders       │           │ tenant_a.orders    │       │ db_a│ │ db_b│ │ db_c│
  │ tenant_id=A  │           │ tenant_b.orders    │       │     │ │     │ │     │
  │ tenant_id=B  │           │ tenant_c.orders    │       └─────┘ └─────┘ └─────┘
  │ tenant_id=C  │           └───────────────────┘
  └──────────────┘
  cheapest, weakest          middle ground              most expensive,
  physical isolation                                    strongest isolation
```

The decision is a direct trade between **operational cost** (one thing to
run vs. N things to run) and **isolation strength** (a bug/breach's blast
radius). There is no universally correct answer — it depends on tenant
count, tenant size variance, and how catastrophic a cross-tenant leak
would be for your specific business (a leak between two consumer
accounts is bad; a leak between two competing enterprise customers who
each demanded contractual data isolation can be existential).

### Shared-schema is the default until you have a reason not to

Most systems start (and often stay) shared-schema: it's the cheapest to
operate, and every module 03-08 technique — indexing, connection pooling,
replication — applies once, not once per tenant. The two things you must
get right to make it *safe*, not just cheap:

1. **Every tenant-scoped table has a `tenant_id` column, indexed.**
   (Module 03: this is a normal composite/foreign-key index decision —
   `tenant_id` typically leads every index on a multi-tenant table, since
   nearly every query filters by it.)
2. **No query against a tenant-scoped table can ever run without a
   tenant filter** — not "the application code remembers to add
   `WHERE tenant_id = ?`," which is exactly the kind of thing one missed
   line in one endpoint breaks, but a mechanism the *database itself*
   enforces regardless of what the application code does or forgets.
   That mechanism is row-level security, next.

### Row-level security: the database enforces isolation, not just your code

Postgres **row-level security (RLS)** attaches a policy to a table that
silently filters every query against it — even a query the application
forgot to filter itself, even one written by a bug, even raw SQL from a
future engineer who's never heard of your tenant convention — down to
rows matching the policy. You set which tenant is "current" for a
connection with a session variable, and the policy checks it:

```sql
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON orders
    USING (tenant_id = current_setting('app.current_tenant')::uuid);
```

```python
# At the start of every request, after resolving which tenant is calling:
session.execute(text("SET app.current_tenant = :tid"), {"tid": str(tenant_id)})
# From here on, ANY query against `orders` on this connection — even one
# that forgot a WHERE clause entirely — only ever sees this tenant's rows.
```

This is the difference between "isolation as a convention every developer
must remember" and "isolation as a database-enforced guarantee that holds
even when someone forgets." RLS doesn't replace `tenant_id` in your
`WHERE` clauses (you still want it, for index usage and query planning) —
it's the safety net for the query that didn't include one.

A single `USING` clause like the one above already protects **both reads
and writes**: Postgres's default behavior, when a policy gives no
separate `WITH CHECK` clause, is to reuse the `USING` expression as the
write-side check too — so a session can neither read nor insert/update a
row belonging to another tenant. You only need to write an *explicit*
`WITH CHECK` when you want write access to be **narrower or different**
from read access — e.g. a support-tooling role that can *view* every
tenant's rows for troubleshooting (`USING (true)`) but may only *write*
rows for its own tenant (`WITH CHECK (tenant_id = current_setting(...)::uuid)`).
For the common case — one tenant, same rule for reads and writes — a bare
`USING` clause is already sufficient, as the next exercise proves
directly rather than asserting it.

### The noisy-neighbor problem

Shared schema and schema-per-tenant both still share the *same physical
machine's* CPU, disk I/O, and connection pool (module 07) across all
tenants. One tenant running a huge batch import or an expensive report
can degrade response times for every other tenant on that box — the
**noisy neighbor** problem, the multi-tenant cousin of the OLAP-on-OLTP
contention from the previous module. Standard mitigations, escalating:

- **Per-tenant rate limiting / query timeouts** (`statement_timeout` per
  session, module 09's rate-limiting techniques applied per-tenant
  instead of per-user) — cap how much of the shared resource any one
  tenant can consume.
- **Connection pool partitioning** — reserve a minimum slice of the pool
  per tenant tier, so one tenant's connection storm can't starve
  everyone else's slots entirely.
- **Moving a large/noisy tenant to its own schema or database** — the
  escalation path from shared-schema toward the stronger-isolation
  models, applied selectively to the one tenant that needs it rather
  than to everyone.

### Migrations across the multi-tenant models

Module 05's Alembic migrations get meaningfully harder as isolation
increases:

- **Shared schema**: one migration, run once — the easy case, unchanged
  from earlier modules.
- **Schema-per-tenant**: the same migration must run once **per schema**.
  A migration that partially fails on schema 47 out of 200 tenants
  leaves you with *some* tenants on the old shape and some on the new —
  your deployment tooling must track per-schema migration state, not
  assume "ran once, done everywhere."
- **Database-per-tenant**: the same problem, worse — now it's once per
  *database*, potentially on separate infrastructure with separate
  scheduling, and a rollout can be mid-flight across tenants for hours.

This operational multiplication is the concrete cost behind "isolation
strength" in the earlier trade-off table — it isn't abstract, it's
migrations, backups, and monitoring dashboards each multiplied by however
many schemas or databases you chose to run.

### Choosing a model: the questions that actually decide it

1. **How many tenants, and how large is each?** Thousands of small
   tenants favor shared schema (schema/database-per-tenant's operational
   cost doesn't scale to thousands of instances). A handful of large
   enterprise tenants can easily justify database-per-tenant.
2. **What's the contractual/regulatory isolation requirement?** Some
   enterprise or regulated customers contractually require physically
   separate storage — that requirement alone can force
   database-per-tenant regardless of what's operationally cheapest.
3. **How catastrophic is a leak?** The worse a cross-tenant data leak
   would be for your business, the more that argues for RLS (even in
   shared schema, as a mandatory safety net) or stronger physical
   isolation.
4. **Do you need per-tenant customization of schema itself** (a tenant
   wants extra custom fields)? That pushes toward schema-per-tenant or a
   flexible shared-schema design (e.g. a JSONB "custom fields" column,
   module 00's document-store reasoning applied inside a relational
   table) rather than forcing every tenant into one rigid shared shape.

## Command reference

| Concern | SQL / Postgres feature |
|---|---|
| Enable RLS on a table | `ALTER TABLE orders ENABLE ROW LEVEL SECURITY;` |
| Create an isolation policy | `CREATE POLICY tenant_isolation ON orders USING (tenant_id = current_setting('app.current_tenant')::uuid);` |
| Set the current tenant for a session | `SET app.current_tenant = '...';` |
| Read the current tenant back | `SELECT current_setting('app.current_tenant');` |
| Force RLS even for the table owner | `ALTER TABLE orders FORCE ROW LEVEL SECURITY;` |
| Create a tenant's schema | `CREATE SCHEMA tenant_acme;` |
| Set search path to a tenant's schema | `SET search_path TO tenant_acme;` |
| Per-session statement timeout (noisy-neighbor cap) | `SET statement_timeout = '5s';` |

A tenant-aware repository, extending module 06's pattern:

```python
from sqlalchemy import text
from contextlib import contextmanager

@contextmanager
def tenant_session(engine, tenant_id: str):
    with engine.connect() as conn:
        conn.execute(text("SET app.current_tenant = :tid"), {"tid": tenant_id})
        yield conn

class OrderRepository:
    def __init__(self, conn):
        self.conn = conn  # already scoped to one tenant via tenant_session

    def list_orders(self):
        # No WHERE tenant_id needed here — RLS enforces it even if we forgot.
        # We still SHOULD add it for index usage; RLS is the safety net, not a replacement.
        return self.conn.execute(text(
            "SELECT * FROM orders WHERE tenant_id = current_setting('app.current_tenant')::uuid"
        )).fetchall()
```

## Hands-on exercises

Run Postgres in Docker as in earlier modules:

```bash
docker run -d --name multitenant-pg -e POSTGRES_PASSWORD=devpass -e POSTGRES_DB=shop -p 5432:5432 postgres:16
```

`pip install "sqlalchemy>=2" psycopg[binary]`.

### 1. Build a shared-schema table and prove RLS blocks a forgotten filter

```sql
CREATE TABLE orders (
    id BIGSERIAL PRIMARY KEY,
    tenant_id UUID NOT NULL,
    customer_name TEXT,
    total NUMERIC(10,2)
);

INSERT INTO orders (tenant_id, customer_name, total) VALUES
    ('11111111-1111-1111-1111-111111111111', 'Alice', 100.00),
    ('22222222-2222-2222-2222-222222222222', 'Bob',   50.00);

ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON orders
    USING (tenant_id = current_setting('app.current_tenant')::uuid);
```

Connect as a **non-superuser** role (RLS is bypassed by superusers and
table owners by default — create a plain role to see the policy actually
apply):

```sql
CREATE ROLE app_user LOGIN PASSWORD 'devpass';
GRANT SELECT, INSERT ON orders TO app_user;
GRANT USAGE, SELECT ON SEQUENCE orders_id_seq TO app_user;
```

As `app_user`, deliberately run a query with **no tenant filter at all**:

```sql
SET app.current_tenant = '11111111-1111-1111-1111-111111111111';
SELECT * FROM orders;  -- no WHERE clause
```

Expected: only Alice's row comes back, even though the query itself never
mentioned `tenant_id` — RLS silently applied the policy. Switch tenants
and re-run:

```sql
SET app.current_tenant = '22222222-2222-2222-2222-222222222222';
SELECT * FROM orders;
```

Expected: only Bob's row. This is the concrete proof that isolation here
doesn't depend on the query author remembering anything.

### 2. Prove a bare `USING` clause already blocks cross-tenant writes

As `app_user`, with `app.current_tenant` still set to tenant 1, try to
insert a row explicitly tagged for tenant 2 — using the *same* policy
from exercise 1, which has no explicit `WITH CHECK`:

```sql
SET app.current_tenant = '11111111-1111-1111-1111-111111111111';
INSERT INTO orders (tenant_id, customer_name, total)
VALUES ('22222222-2222-2222-2222-222222222222', 'Eve', 999.00);
```

Expected: `ERROR: new row violates row-level security policy for table
"orders"` — even though the policy only wrote a `USING` clause, Postgres
defaults the write-side check to that same expression when no explicit
`WITH CHECK` is given, so cross-tenant writes are already blocked.

Now see the actual reason `WITH CHECK` exists: a role that should be able
to *read across* tenants but *write only* to its own (e.g. an internal
support-tooling role), which needs read and write rules to genuinely
differ:

```sql
DROP POLICY tenant_isolation ON orders;
CREATE POLICY tenant_isolation ON orders
    USING (true)  -- can read every tenant's rows (e.g. a support role)
    WITH CHECK (tenant_id = current_setting('app.current_tenant')::uuid);
```

```sql
SET app.current_tenant = '11111111-1111-1111-1111-111111111111';
SELECT * FROM orders;  -- expect: BOTH tenants' rows now, per USING (true)
INSERT INTO orders (tenant_id, customer_name, total)
VALUES ('22222222-2222-2222-2222-222222222222', 'Eve', 999.00);  -- expect: still blocked, per WITH CHECK
```

Restore the strict single-tenant policy before continuing:

```sql
DROP POLICY tenant_isolation ON orders;
CREATE POLICY tenant_isolation ON orders
    USING (tenant_id = current_setting('app.current_tenant')::uuid);
```

### 3. Confirm RLS is bypassed for superusers/owners (and why that matters)

Reconnect as the Postgres superuser (the default connection from the
Docker container) and repeat exercise 1's no-filter query:

```sql
SELECT * FROM orders;
```

Expected: **both** tenants' rows come back — RLS does not apply to
superusers or the table owner by default. This is exactly why your
*application's* database connection should use a restricted role like
`app_user`, never the superuser — a design decision that makes RLS
actually protective rather than a policy your own app silently bypasses.
Confirm the fix: `ALTER TABLE orders FORCE ROW LEVEL SECURITY;` makes the
policy apply even to the table owner (though superusers still bypass it
regardless) — check the Postgres docs link in Further reading for the
exact scope of `FORCE ROW LEVEL SECURITY`.

### 4. Build schema-per-tenant and observe the migration multiplication

```sql
CREATE SCHEMA tenant_acme;
CREATE SCHEMA tenant_globex;

CREATE TABLE tenant_acme.orders   (id BIGSERIAL PRIMARY KEY, customer_name TEXT, total NUMERIC(10,2));
CREATE TABLE tenant_globex.orders (id BIGSERIAL PRIMARY KEY, customer_name TEXT, total NUMERIC(10,2));
```

Now "migrate" both — add a `status` column, the module-05 way, but by
hand once per schema to feel the multiplication:

```sql
ALTER TABLE tenant_acme.orders   ADD COLUMN status TEXT DEFAULT 'pending';
ALTER TABLE tenant_globex.orders ADD COLUMN status TEXT DEFAULT 'pending';
```

Expected: the exact same `ALTER TABLE` had to be issued twice for two
tenants. Write one sentence for your own notes: what does this become at
200 tenants, and what tooling problem does that create that a
shared-schema migration never has (module 05's Alembic migration,
by contrast, ran exactly once regardless of tenant count).

### 5. Simulate the noisy-neighbor problem with a per-session timeout

Simulate one tenant's runaway query (standing in for a real expensive
report/scan — `pg_sleep` here just makes the "too slow" case
deterministic to test) and cap it:

```sql
SET statement_timeout = '2s';
SELECT pg_sleep(5);
```

Expected: `ERROR: canceling statement due to statement timeout` after
~2 seconds, instead of the query running the full 5 seconds and holding
its connection-pool slot the whole time. Contrast with no timeout set
(the default): `SELECT pg_sleep(5);` alone would run the full 5 seconds,
occupying a connection other tenants' queries needed for that entire
window — in a real system this is a large report or unindexed scan, not
a literal sleep, but the resource-holding effect is the same.

### 6. Diagnose and fix: a cross-tenant data leak

A team runs shared-schema multi-tenancy. Every endpoint's repository
method includes `WHERE tenant_id = ?`, added by convention, reviewed in
every PR. One day a customer reports seeing another company's invoice in
their dashboard. The team finds the bug: a new "export all invoices to
CSV" endpoint, added quickly under deadline pressure, called a raw SQL
query that a developer copy-pasted from an internal admin tool — one that
(correctly, for its original *internal, single-tenant-admin* use case)
had no tenant filter at all.

<details>
<summary>Solution</summary>

Root cause: isolation was enforced entirely by *convention* — a
`WHERE tenant_id = ?` every developer was expected to remember to write
and every reviewer was expected to catch — and conventions don't survive
deadline pressure, copy-pasted code from a different context, or a
reviewer who didn't know to look for it. This is precisely the failure
mode row-level security exists to close.

Fix: enable RLS on every tenant-scoped table with a policy like this
module's, and make the application's database role a non-superuser,
non-owner role so the policy actually applies to it. After the fix, the
exact same copy-pasted, filter-less query from the leaked endpoint would
have silently returned only the current tenant's rows — the missing
`WHERE` clause becomes a performance/index-usage concern, not a data leak,
because the database enforces the boundary regardless of what the
application code does or forgets. This doesn't mean removing
`WHERE tenant_id = ?` from application code (module 03's index-usage
reasoning still wants it there) — it means the database is no longer the
single point of failure for correctness.

</details>

### 7. Clean up

```bash
docker rm -f multitenant-pg
```

## Independent challenge

No code given. You run the library-lending app used elsewhere in this
track, and it's being sold as software to multiple library networks
(each network is a tenant, and networks never share member/loan data).
One network is a large national consortium with thousands of members and
heavy nightly batch reporting (tying back to the previous module's OLAP
concerns); most other networks are small, single-branch libraries.
Decide: do all tenants get the same multi-tenancy model, or does the
large consortium warrant different treatment than the small libraries?
Justify your choice using this module's four decision questions
(tenant count/size, contractual/regulatory requirement, leak severity,
per-tenant customization need). Design the RLS policy (or schema/database
split) for whichever model(s) you choose, and explain specifically how
you'd prevent the large consortium's nightly batch report from degrading
response times for every other tenant sharing its infrastructure.

<details>
<summary>Stuck? One hint</summary>

A common real answer: most small libraries share one schema with RLS as
the enforced boundary (cheap to run, safe by database enforcement, not
by convention); the one large, heavy-batch consortium gets migrated to
its own schema or database specifically because its resource usage
pattern (large nightly reports) would otherwise degrade every other
tenant sharing the same connection pool and buffer cache — the
noisy-neighbor mitigation from the Concepts section, applied selectively
to the one tenant that actually needs it, not to everyone.

</details>

## Common mistakes & troubleshooting

- **Enforcing tenant isolation only in application code.** As exercise 6
  showed, a convention every developer must remember eventually gets
  bypassed by one copy-pasted query, one new endpoint, one deadline. Use
  row-level security so the database enforces it regardless.
- **Connecting to Postgres as a superuser or table owner from your
  application.** RLS silently does nothing for those roles by default
  (exercise 3) — the isolation you think you configured isn't actually
  active. Use a restricted role for all application traffic.
- **Assuming you always need an explicit `WITH CHECK` for writes to be
  protected.** Postgres reuses the `USING` expression for writes when no
  `WITH CHECK` is given (exercise 2) — a bare `USING` clause already
  covers the common case. You only need an explicit, *different*
  `WITH CHECK` when read and write rules genuinely diverge (e.g. a
  broader-read, narrower-write support role).
- **Choosing database-per-tenant "to be safe" for a product with
  thousands of small tenants.** The operational cost (migrations,
  backups, monitoring, connection pools — module 08's concerns,
  multiplied) doesn't scale to that tenant count. Match isolation
  strength to actual tenant count/size/risk, not to "the strongest option
  sounds safest."
- **Forgetting migrations must run per-schema/per-database in those
  models.** Exercise 4 showed the multiplication directly; a migration
  tool that assumes "run once, done everywhere" (true for shared schema)
  silently under-migrates schema-per-tenant or database-per-tenant setups.
- **No per-tenant resource limits in a shared-schema/shared-infrastructure
  model.** Without something like `statement_timeout` or connection-pool
  partitioning, one tenant's expensive query or import can degrade
  response times for every other tenant on the same box.

## Checkpoint quiz

Write down your answer to each question before expanding it — checking
without attempting first is the single easiest way to fool yourself into
thinking you've learned this.

<details>
<summary>Show questions</summary>

1. Name the three standard multi-tenancy models and, for each, state
   whether it's cheaper to operate or stronger at isolation relative to
   the others.
2. What does Postgres row-level security actually enforce, and why is it
   safer than relying on every query including `WHERE tenant_id = ?`?
3. Why does RLS not protect you if your application connects to Postgres
   as a superuser or table owner?
4. What's the difference between a policy's `USING` clause and its
   `WITH CHECK` clause, and what does Postgres do if you only specify
   `USING`?
5. What is the noisy-neighbor problem in a multi-tenant system, and name
   two mitigations for it.
6. Why does choosing schema-per-tenant or database-per-tenant multiply
   your migration burden, compared to shared schema?

</summary>
</details>

<details>
<summary>Show answers</summary>

1. Shared schema (cheapest to operate, weakest physical isolation —
   isolation is code/policy-enforced, not physical); schema-per-tenant
   (middle ground — stronger isolation than shared tables, but
   migrations and schema management now scale with tenant count);
   database-per-tenant (most expensive to operate — every operational
   concern from module 08 multiplies by tenant count — but strongest
   isolation, since tenants don't even share a connection pool or buffer
   cache).
2. It enforces that a database session can only see (and, with
   `WITH CHECK`, only write) rows matching a policy condition —
   regardless of whether the specific query that ran included a matching
   `WHERE` clause. It's safer than convention-based filtering because it
   doesn't depend on every developer remembering to add the filter in
   every query, in every endpoint, forever.
3. Because RLS policies do not apply to superusers or (by default) to
   the table's owner — if your application's database connection uses
   either of those roles, the policy is silently inert for that
   connection, and you get none of the protection you configured.
4. `USING` determines which existing rows a session can see (governs
   `SELECT`, and the visible-row check for `UPDATE`/`DELETE`);
   `WITH CHECK` determines whether a row being written (via `INSERT` or
   the new value of an `UPDATE`) is allowed at all. If a policy specifies
   only `USING`, Postgres reuses that same expression as the `WITH CHECK`
   condition too — so a bare `USING` clause already blocks cross-tenant
   writes in the common case; an explicit, different `WITH CHECK` is only
   needed when read and write rules should genuinely diverge.
5. One tenant's heavy resource usage (a large query, a batch import)
   degrades performance for other tenants sharing the same physical
   infrastructure (connection pool, buffer cache, disk I/O). Mitigations
   include per-tenant statement timeouts/rate limiting, connection pool
   partitioning by tenant, and moving an especially heavy tenant to its
   own schema or database.
6. Because the same migration must be issued once per schema (or once
   per database) instead of once total — a 200-tenant schema-per-tenant
   system needs the same `ALTER TABLE` run 200 times, and your
   deployment tooling must track per-schema/per-database migration state
   rather than assuming a single migration run covers every tenant, the
   way it does in shared schema.

</details>

## Further reading & sources

- [PostgreSQL: Row Security Policies](https://www.postgresql.org/docs/current/ddl-rowsecurity.html) - the official RLS reference, including the superuser/owner bypass behavior and `FORCE ROW LEVEL SECURITY`.
- [Citus: Multi-tenant database patterns](https://docs.citusdata.com/en/stable/use_cases/multi_tenant.html) - a deeper look at scaling shared-schema multi-tenancy with sharding by tenant.
- [AWS: SaaS tenant isolation strategies](https://docs.aws.amazon.com/wellarchitected/latest/saas-lens/tenant-isolation.html) - a vendor-neutral framework for the same shared/silo/pool decision covered in this module.
- [Salesforce Engineering: Multi-tenant architecture](https://engineering.salesforce.com/) - a large-scale production account of shared-schema multi-tenancy at extreme scale.
- [PostgreSQL: Schemas](https://www.postgresql.org/docs/current/ddl-schemas.html) - the schema-per-tenant mechanism used in exercise 4.

## Next

[11-capstone-project](../11-capstone-project/README.md) — the concepts
are complete. The capstone puts everything in this track together,
including a scaling and multi-tenancy design note for a real domain.
</content>
