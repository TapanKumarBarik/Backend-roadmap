# Module 03: Provisioning and Onboarding Automation

## Why this matters

Modules 01 and 02 assumed a tenant and its users already exist. Somewhere,
the very first row in `tenants` and the very first row in `users` for that
tenant have to get created — and for a self-serve SaaS product, that has
to happen the moment someone submits a signup form, correctly, every time,
with no human running SQL by hand. "Provisioning" is everything that has
to happen atomically (or safely recoverably) between "someone submitted a
signup form" and "that someone can log in and see an empty, ready-to-use
account": creating the tenant row, creating their schema/RLS setup if your
isolation model needs one (module 04-10), seeding any default data, and
creating their first admin user. Doing this by hand does not survive past
your tenth signup; doing it wrong (partially) leaves broken, half-created
tenants that are worse than no tenant at all.

## Concepts

### Provisioning is a workflow, not a single INSERT

Even in the cheapest isolation model (shared schema, module 04-10),
provisioning a tenant is multiple steps that must all succeed together:

1. Create the `tenants` row (slug, name, plan, status).
2. Create the first admin `users` row, scoped to that tenant (module 02).
3. Seed any default data the product needs on day one (a default project,
   default settings/feature flags).
4. Send the welcome/verification email.

In schema-per-tenant or database-per-tenant models, step 1 additionally
requires running every existing migration against the *new* schema/
database before it's usable — module 04-10 already showed you this is the
operational cost that scales with tenant count; provisioning is where that
cost is actually paid, once per signup, automatically.

### Provisioning belongs in a background job, not the request handler

A signup request that synchronously runs schema creation, N migrations,
and an email send is slow, and — worse — if step 3 of 4 fails, the
customer got an HTTP error but step 1 and 2 already committed, leaving a
half-created tenant. Track `06-background-processing-and-realtime`
covered exactly this shape: the request handler does the minimum
synchronous work (validate input, return "check your email"), and a
background job does the actual provisioning:

```python
from fastapi import FastAPI, BackgroundTasks
import uuid

app = FastAPI()

@app.post("/signup")
async def signup(payload: SignupRequest, background_tasks: BackgroundTasks):
    provisioning_id = str(uuid.uuid4())
    background_tasks.add_task(provision_tenant, provisioning_id, payload)
    return {"status": "provisioning", "provisioning_id": provisioning_id}
```

For a real product this is a durable queue (Celery/RQ/Azure Service Bus —
track `06-background-processing-and-realtime`'s task-queue module), not
`BackgroundTasks` (which is in-process and lost on a crash) — `BackgroundTasks`
is used here only because this module doesn't want to re-teach queue setup;
swap in a real queue for anything beyond a learning exercise.

### Idempotency: a provisioning job must be safe to retry

Background jobs get retried — a worker crashes mid-job, a queue redelivers
a message, a user double-clicks submit. A provisioning job that isn't
idempotent creates duplicate tenants or duplicate admin users on retry.
The fix, same idempotency-key pattern as track `10-distributed-systems-
patterns`:

```python
async def provision_tenant(provisioning_id: str, payload: SignupRequest):
    # Idempotency check FIRST: has this exact provisioning_id already run?
    existing = await db.fetch_one(
        "SELECT tenant_id FROM provisioning_jobs WHERE id = :id",
        {"id": provisioning_id},
    )
    if existing:
        return  # already provisioned — safe no-op on retry

    async with db.transaction():
        tenant_id = await create_tenant_row(payload.company_name, payload.slug)
        await create_admin_user(tenant_id, payload.email, payload.password)
        await seed_default_data(tenant_id)
        await db.execute(
            "INSERT INTO provisioning_jobs (id, tenant_id, completed_at) VALUES (:id, :tid, now())",
            {"id": provisioning_id, "tid": tenant_id},
        )
    await send_welcome_email(payload.email)
```

The database transaction wraps steps that must succeed or fail together
(tenant + admin user + seed data + the idempotency marker); the email send
is deliberately *outside* the transaction — you cannot roll back an
already-sent email, so it's treated as a best-effort final step, not part
of the atomic core. If the email step fails, the tenant is still validly
provisioned; a separate retry/resend path handles the email specifically,
rather than re-running the whole job.

### Partial-failure recovery

Even with a transaction around the core steps, provisioning can fail
*before* the transaction (e.g. slug already taken — caught earlier by a
validation step) or in ways that need cleanup outside the DB (e.g. a
schema-per-tenant model where `CREATE SCHEMA` succeeded but the migration
run against it then failed). Design explicitly for this:

- **Validate everything you can before touching any state** (slug
  uniqueness, email format) so most failures never reach the transactional
  core at all.
- **For schema/database-per-tenant models, treat schema creation +
  migration as its own inner transaction/step with a clear rollback**
  (`DROP SCHEMA IF EXISTS ... CASCADE` on failure) rather than leaving an
  empty, half-migrated schema behind.
- **Track provisioning status explicitly** (`tenants.status = 'provisioning'
  | 'active' | 'failed'`) so a stuck or failed tenant is visible and
  operable (retry, or flag for manual cleanup) rather than silently
  invisible.

### Slug collisions and reserved words

The tenant slug (module 01's subdomain/path identifier) needs its own
validation pass: uniqueness (obviously), but also a reserved-word list
(`www`, `api`, `admin`, `app` must never be assignable as a tenant slug,
or a tenant could claim a subdomain that collides with your own
infrastructure) and a format check (matching module 01's
`[a-z0-9-]+` regex, so every provisioned slug is guaranteed routable by
the middleware that already exists).

## Command reference

| Concern | Snippet / detail |
|---|---|
| Idempotency marker table | `provisioning_jobs (id, tenant_id, completed_at)`, checked first |
| Atomic core steps | tenant row + admin user + seed data + idempotency marker, one transaction |
| Non-atomic final step | welcome email, outside the transaction, retried independently on failure |
| Reserved slugs | explicit denylist (`www`, `api`, `admin`, `app`, ...) checked before uniqueness |
| Provisioning status | `tenants.status`: `'provisioning' \| 'active' \| 'failed'` |
| Schema-per-tenant rollback | `DROP SCHEMA IF EXISTS tenant_x CASCADE` on migration failure |

## Hands-on exercises

Build on modules 01-02's app plus a real Postgres (as in module 04-10's
exercises).

```bash
docker run -d --name saas-onboarding-pg -e POSTGRES_PASSWORD=devpass -e POSTGRES_DB=saas -p 5432:5432 postgres:16
```

### 1. Build the atomic provisioning core and prove it's transactional

Create `tenants`, `users` (from module 02), and `provisioning_jobs`
tables. Implement `provision_tenant` as above. Deliberately raise an
exception *inside* `seed_default_data` (e.g. `raise RuntimeError("boom")`)
and confirm, by querying directly, that **neither** the tenant row nor the
admin user row exists afterward — the transaction rolled back all three
together, not just the step that failed.

### 2. Prove idempotency under retry

Call `provision_tenant` twice with the **same** `provisioning_id` and
signup payload (simulating a redelivered queue message). Confirm exactly
one tenant and one admin user exist afterward, not two, and that the
second call returned immediately via the idempotency check rather than
re-running the creation steps.

### 3. Add reserved-slug and uniqueness validation

Add a `RESERVED_SLUGS = {"www", "api", "admin", "app"}` check and a
uniqueness check, both running **before** the transaction even opens.
Confirm signing up with slug `api` is rejected with a clear error before
any database write happens, and confirm a second signup with an
already-taken slug is rejected the same way.

### 4. Simulate the async email failure and confirm the tenant still works

Make `send_welcome_email` raise an exception unconditionally. Confirm the
tenant and admin user were still created successfully (the transaction
already committed before the email step ran) and that the exception is
caught/logged rather than crashing the whole provisioning job — a failed
email should never un-provision an otherwise-successful signup.

### 5. Diagnose and fix: the duplicate-tenant bug

A team's first version of `/signup` did the provisioning work
synchronously, directly in the request handler, with no idempotency
check. Under load, a slow request caused a client's HTTP library to time
out and automatically retry the POST — and the team found two tenants
created for the same company, with two different admin passwords, a few
seconds apart.

<details>
<summary>Solution</summary>

The client-side retry sent a second, functionally-identical signup
request before the first one's response came back, and with no
idempotency key or check, the server had no way to recognize "this is the
same signup, already in progress/done" — it just ran the full creation
logic twice. The fix is exercise 2's mechanism: generate (or accept from
the client) a stable idempotency key for the signup attempt, check for a
completed job under that key *before* doing any creation work, and treat
a retry with the same key as a no-op returning the original result. This
is the same idempotency-key pattern track 10's distributed-systems module
teaches for payment/order APIs — signup is just another "must not
double-execute under retry" operation.

</details>

## Independent challenge

No code given. Extend the provisioning flow for a schema-per-tenant
product (module 04-10's middle isolation model). On signup, the job must:
create the tenant row, `CREATE SCHEMA tenant_<slug>`, run every existing
Alembic migration against that new schema, then proceed with admin-user
creation as before. Design what happens if migration step N of 12 fails
partway through — write out the exact recovery sequence (what gets
rolled back, what state the tenant is left in, and whether the job is
safe to simply retry from the top). Explicitly connect your answer to
module 04-10's "migrations must run once per schema" cost.

<details>
<summary>Stuck? One hint</summary>

A common real answer: wrap the schema creation + full migration run as
its own step with an explicit try/except; on any failure, `DROP SCHEMA
tenant_<slug> CASCADE` to remove the half-migrated schema entirely (rather
than leaving it in an ambiguous partial state), mark
`tenants.status = 'failed'`, and make the job safe to retry from the top
specifically *because* the failure path always returns to "no schema
exists" — so a retry's `CREATE SCHEMA` starts clean rather than colliding
with a half-built one. This mirrors module 04-10's point that migrations
multiply per schema: provisioning for this model must treat "run all N
migrations against one new schema" as a single atomic unit of work, not N
independent steps that could each partially succeed.

</details>

## Common mistakes & troubleshooting

- **Running provisioning synchronously in the request handler.** Slow
  under load, and a mid-request failure risks the exact half-created-
  tenant problem this module exists to prevent. Use a background job
  (a real durable queue in production, per track 06).
- **No idempotency key/check.** Exercise 5's bug — any retry (client-side
  timeout retry, queue redelivery) re-runs the full creation logic and
  produces duplicates.
- **Wrapping the welcome email inside the same transaction as tenant
  creation.** You cannot roll back a sent email — keep non-transactional,
  irreversible side effects outside the atomic core, and handle their
  failure independently (exercise 4).
- **No reserved-slug list.** Without one, a signup could claim `api` or
  `admin` as their tenant slug, colliding with your own infrastructure's
  routes under module 01's subdomain-based resolution.
- **Leaving a half-migrated schema behind on failure**, in
  schema/database-per-tenant models — the independent challenge's core
  concern. Always define an explicit rollback for the schema/migration
  step specifically, not just the row-level transaction.

## Checkpoint quiz

<details>
<summary>Show questions</summary>

1. List the steps a provisioning job typically has to perform, and which
   of them belong inside one atomic transaction versus outside it.
2. Why does provisioning belong in a background job rather than directly
   in the `/signup` request handler?
3. What does it mean for a provisioning job to be idempotent, and what
   real-world event makes idempotency necessary here (not just a
   theoretical concern)?
4. Why does a tenant slug need a reserved-word denylist in addition to a
   uniqueness check?
5. In a schema-per-tenant model, what's the recommended recovery when
   migration step N of 12 fails partway through provisioning?

</summary>
</details>

<details>
<summary>Show answers</summary>

1. Create the tenant row, create the first admin user, seed default data,
   send a welcome email (and, for schema/database-per-tenant models,
   create + migrate the tenant's schema/database). The tenant row, admin
   user, seed data, and idempotency marker belong inside one atomic
   transaction; the welcome email (and, in the independent challenge's
   model, the schema/migration step) is handled outside that transaction
   with its own explicit success/failure handling, since it can't simply
   be rolled back the way a database transaction can.
2. Because it's slow (schema creation, migrations, seeding) and, more
   importantly, because a request handler doing this synchronously risks
   leaving a half-created tenant behind if a later step fails after
   earlier steps already committed — a background job with its own
   transaction and idempotency handling can retry safely without that
   risk.
3. Idempotent means running the same provisioning job twice (with the
   same key/input) produces exactly one tenant, not two — the second run
   is a safe no-op. It's necessary because retries are a normal event in
   real systems: client-side HTTP timeouts triggering automatic retries,
   or a message queue redelivering a job after a worker crash, both
   genuinely happen and would otherwise double-provision a tenant
   (exercise 5's bug).
4. Because a tenant is free to choose almost any slug value, and without
   a denylist a tenant could claim a slug like `api`, `admin`, or `www`
   that collides with your own product's existing routes/subdomains
   under module 01's subdomain-based resolution, breaking your own
   infrastructure rather than just being a cosmetic problem.
5. Roll back the entire schema/migration step as one unit — drop the
   half-migrated schema entirely (`DROP SCHEMA ... CASCADE`) rather than
   leaving it in a partial, ambiguous state — mark the tenant as failed,
   and make the job safe to retry from the top specifically because the
   rollback always returns to a clean "no schema exists" starting state.

</details>

## Further reading & sources

- [Track 06, backend: background processing](../../06-background-processing-and-realtime/README.md) - the task-queue foundation this module's job runs on.
- [Track 10, backend: distributed systems patterns](../../10-distributed-systems-patterns/README.md) - the idempotency-key pattern this module reuses for provisioning.
- [Module 10, 04-databases-and-data-layer](../../04-databases-and-data-layer/10-multi-tenancy-patterns/README.md) - the migration-per-schema cost that provisioning has to pay for schema/database-per-tenant models.

## Next

[04-billing-plans-and-usage-metering](../04-billing-plans-and-usage-metering/README.md) —
now that a tenant can sign up and provision itself automatically, module
04 covers charging them for it: plan tiers, quotas, and usage metering.
