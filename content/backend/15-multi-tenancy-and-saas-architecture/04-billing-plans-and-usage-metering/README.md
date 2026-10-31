# Module 04: Billing, Plans, and Usage Metering

## Why this matters

A provisioned tenant (module 03) with isolated data (module 04-10) and
tenant-scoped auth (module 02) is a working product — but not yet a
business. Almost every real SaaS charges by **plan tier** (Free/Pro/
Enterprise) with **quotas** (seats, API calls, storage) attached, and
needs to **meter** actual usage against those quotas in real time, not
just at invoice time. Get metering wrong and you either under-charge
(a Free-tier tenant quietly using Enterprise-tier resources forever) or
over-block (a paying customer hitting a phantom limit because a counter
never reset). This module builds plan/quota data structures, a metering
mechanism that's accurate under concurrent requests, and the shape of a
real billing-provider integration (Stripe-style) without requiring an
actual Stripe account to complete the exercises.

## Concepts

### Plans and quotas as data, not code

Hard-coding "Free tier gets 3 projects" as an `if` statement scattered
across handlers means every new plan requires a code change and a
deploy. Model plans and their limits as data instead:

```sql
CREATE TABLE plans (
    id TEXT PRIMARY KEY,           -- 'free', 'pro', 'enterprise'
    max_projects INT,              -- NULL = unlimited
    max_api_calls_per_month INT,
    max_seats INT
);

INSERT INTO plans VALUES
    ('free', 3, 1000, 2),
    ('pro', 50, 100000, 20),
    ('enterprise', NULL, NULL, NULL);

ALTER TABLE tenants ADD COLUMN plan_id TEXT NOT NULL REFERENCES plans(id) DEFAULT 'free';
```

A handler checking a quota reads the tenant's plan row, not a hard-coded
constant — changing what "Free" includes becomes a data update, not a
deploy.

### Metering: counting usage accurately, per tenant, per period

A usage counter needs a period boundary (usually monthly, resetting on
the billing cycle) and must be safe under concurrent requests — two
simultaneous requests from the same tenant must not both read "9 of 10
used" and both proceed, ending up at 11.

```sql
CREATE TABLE usage_counters (
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    metric TEXT NOT NULL,         -- 'api_calls', 'projects_created'
    period_start DATE NOT NULL,   -- first day of the billing month
    count BIGINT NOT NULL DEFAULT 0,
    PRIMARY KEY (tenant_id, metric, period_start)
);
```

The atomic, concurrency-safe increment-and-check, using Postgres's
`INSERT ... ON CONFLICT` to avoid a separate SELECT-then-UPDATE race
(the same read-then-write race track `05-caching-and-performance` and
module 04-10's transaction module both warn about):

```python
async def check_and_increment(db, tenant_id: str, metric: str, limit: int | None) -> bool:
    period_start = date.today().replace(day=1)
    row = await db.fetch_one(
        """
        INSERT INTO usage_counters (tenant_id, metric, period_start, count)
        VALUES (:tid, :metric, :period, 1)
        ON CONFLICT (tenant_id, metric, period_start)
        DO UPDATE SET count = usage_counters.count + 1
        RETURNING count
        """,
        {"tid": tenant_id, "metric": metric, "period": period_start},
    )
    if limit is not None and row["count"] > limit:
        return False  # over quota — caller should reject/degrade, and may want to decrement back
    return True
```

`INSERT ... ON CONFLICT ... DO UPDATE` performs the increment atomically
at the database level — there's no window between "read the current
count" and "write the incremented count" for a second concurrent request
to land in, unlike a naive `SELECT count; if count < limit: UPDATE count = count + 1`.

### Enforcing a quota mid-request

```python
from fastapi import Depends, HTTPException

def enforce_quota(metric: str):
    async def dependency(tenant = Depends(get_current_tenant)):
        plan = await get_plan(tenant.plan_id)
        limit = getattr(plan, f"max_{metric}", None)
        ok = await check_and_increment(db, tenant.id, metric, limit)
        if not ok:
            raise HTTPException(
                status_code=402,  # Payment Required — deliberately distinct from 403
                detail=f"{metric} quota exceeded for the {plan.id} plan",
            )
    return dependency

@app.post("/projects")
async def create_project(
    tenant = Depends(get_current_tenant),
    _quota = Depends(enforce_quota("projects")),
):
    ...
```

`402 Payment Required` (rather than 403) is a deliberate signal to API
clients and your own frontend: this isn't "you're not allowed," it's
"you're allowed, but you've used up what your plan includes" — a
distinction that changes what the client should show the user (an
upgrade prompt, not an access-denied page).

### Wiring metering into a real billing provider

You don't need a live Stripe account to learn the shape of this
integration — the pattern is what matters:

- **Subscription objects** — each tenant maps to one Stripe (or similar)
  `Customer` + `Subscription`, storing the provider's IDs on your
  `tenants` row (`stripe_customer_id`, `stripe_subscription_id`).
- **Usage-based billing via metered events** — for pay-per-use metrics
  (API calls beyond a plan's included amount), your app reports usage
  events to the provider (`stripe.SubscriptionItem.create_usage_record(...)`)
  instead of computing the bill yourself — the provider aggregates and
  invoices.
- **Webhooks drive plan changes, not your own UI directly** — when a
  customer upgrades/downgrades/cancels through Stripe's hosted billing
  portal, Stripe sends your app a webhook (`customer.subscription.updated`)
  that updates `tenants.plan_id` — your app's plan is a *reflection* of
  the billing provider's state, not the other way around, so it can never
  drift out of sync with what's actually being charged.

```python
@app.post("/webhooks/stripe")
async def stripe_webhook(request: Request):
    event = verify_and_parse(request)  # signature verification is mandatory — never trust an unverified webhook body
    if event["type"] == "customer.subscription.updated":
        stripe_sub_id = event["data"]["object"]["id"]
        new_plan_id = map_stripe_price_to_plan(event["data"]["object"]["items"])
        await db.execute(
            "UPDATE tenants SET plan_id = :plan WHERE stripe_subscription_id = :sub",
            {"plan": new_plan_id, "sub": stripe_sub_id},
        )
    return {"received": True}
```

## Command reference

| Concern | Snippet / detail |
|---|---|
| Plans as data | `plans` table, `tenants.plan_id` foreign key |
| Atomic usage increment | `INSERT ... ON CONFLICT ... DO UPDATE SET count = count + 1` |
| Quota-exceeded status code | `402 Payment Required` (not 403) |
| Billing provider linkage | `tenants.stripe_customer_id`, `tenants.stripe_subscription_id` |
| Provider is source of truth for plan | webhook-driven `plan_id` updates, never set directly by app UI |
| Webhook trust | always verify signature before trusting payload |

## Hands-on exercises

Build on module 03's app and database.

### 1. Build plans/quotas and enforce a limit

Create the `plans` and `usage_counters` tables, seed `free`/`pro`/
`enterprise` as above, and add `enforce_quota("projects")` to a
`POST /projects` route. Create 3 projects on a `free`-plan tenant (limit
3) and confirm the 4th returns `402`.

### 2. Prove the atomic increment is race-safe

Fire 20 concurrent `POST /projects` requests (e.g. with `asyncio.gather`
or a small load script) against a *fresh* free-tier tenant (limit 3).
Confirm **exactly 3** succeed and the rest all return `402` — not 4 or 5
succeeding, which is what a naive SELECT-then-UPDATE implementation would
allow under concurrency. This exercise is the actual proof the atomic
`ON CONFLICT` approach matters, not just a claim.

### 3. Confirm period reset behavior

Manually insert a `usage_counters` row for `period_start` = last month
with `count = 3` (at the free-tier limit). Confirm a new request this
month is **not** blocked — the quota check reads/writes the *current*
month's `period_start`, so last month's usage doesn't carry over.

### 4. Simulate a plan upgrade via "webhook"

Without a real Stripe account, simulate the webhook: call your
`/webhooks/stripe`-equivalent handler directly with a hand-built payload
that maps to `plan_id = 'pro'`. Confirm the tenant's `plan_id` updates and
that project creation, previously blocked at 3, now succeeds past that
count (up to `pro`'s limit of 50).

### 5. Diagnose and fix: the double-charge race

A team implemented quota checking as:

```python
usage = await db.fetch_one("SELECT count FROM usage_counters WHERE ...")
if usage["count"] >= limit:
    raise HTTPException(402)
await db.execute("UPDATE usage_counters SET count = count + 1 WHERE ...")
```

Under load testing, they found tenants exceeding their plan's project
limit by 2-4 projects. Explain the bug and connect it to exercise 2.

<details>
<summary>Solution</summary>

This is a classic read-then-write race: two (or more) concurrent requests
can each run the `SELECT` and see `count = 2` (below a limit of 3) before
either has run its `UPDATE` — both then pass the check and both create a
project, and both then run their `UPDATE`, leaving `count = 4` instead of
correctly rejecting the second one at the boundary. The number of
over-limit creations scales with how many concurrent requests land inside
that read-write gap, which is exactly what exercise 2's 20-concurrent-
request test is designed to expose. The fix is the atomic
`INSERT ... ON CONFLICT ... DO UPDATE ... RETURNING count` pattern, which
makes the increment and the read of the *new* count a single, indivisible
database operation — no other request's increment can land between them.

</details>

## Independent challenge

No code given. Design metering and quota enforcement for a metric that
can't be atomically pre-checked the way project count can: **storage
used**, measured in bytes, where a single file upload might be 500MB and
a tenant is 50MB under a 1GB limit. Should the upload be rejected before
it starts, allowed to complete and then rejected retroactively, or
something else? Write out your design and justify it against the two
failure modes: rejecting a valid, under-limit upload unnecessarily vs.
letting a tenant significantly exceed their quota.

<details>
<summary>Stuck? One hint</summary>

A common real answer: check `current_usage + declared_upload_size >
limit` **before** accepting the upload (using the file's declared
`Content-Length`, not its actual bytes yet), rejecting up front rather
than after transferring 500MB just to discard it — this avoids wasting
bandwidth/storage on a doomed upload. Accept that this check has a
small race window (two large concurrent uploads could both pass the
pre-check and jointly exceed the limit) and treat *storage* quotas as
"soft, checked-at-write-time with periodic reconciliation" rather than
demanding the same hard atomicity as a simple counter like project count
— the actual bytes-on-disk total, computed periodically by a background
job, is the real source of truth, and the pre-check is a best-effort
guard against the common case, not an absolute guarantee. Explicitly
naming which metrics need hard atomic enforcement (project/seat counts —
this module's exercises) versus which are acceptable as soft/
best-effort (storage, bandwidth) is the actual design skill this
challenge is testing.

</details>

## Common mistakes & troubleshooting

- **Hard-coding plan limits as `if` statements in handlers.** Every plan
  change becomes a code change and deploy — model plans/limits as data
  (the `plans` table) instead.
- **Read-then-write quota checks.** Exercise 5's bug — always use an
  atomic increment-and-check (`INSERT ... ON CONFLICT ... DO UPDATE
  ... RETURNING`), never a separate `SELECT` followed by an `UPDATE`.
- **Returning 403 instead of 402 for quota-exceeded.** They mean different
  things to a client — 403 says "you may never do this," 402 says "you
  could if you upgraded," and UI/UX built on the wrong code shows the
  wrong message to the user.
- **Letting your own app's UI set `plan_id` directly** instead of treating
  the billing provider's webhook as the source of truth. This lets your
  app's idea of a tenant's plan drift out of sync with what's actually
  being billed — always let the provider drive plan changes.
- **Not verifying webhook signatures.** An unverified webhook endpoint is
  an open door for anyone to POST a fake "plan upgraded" event and get
  Enterprise-tier access for free — signature verification is mandatory,
  not optional, on every billing webhook.
- **Treating every metric as needing the same enforcement strength.** The
  independent challenge's point — hard atomic counters fit small, cheap-
  to-check metrics; storage/bandwidth-style metrics are usually better as
  soft, periodically-reconciled checks.

## Checkpoint quiz

<details>
<summary>Show questions</summary>

1. Why should plan limits be modeled as data (a `plans` table) rather than
   hard-coded in handler logic?
2. What SQL pattern makes a usage-counter increment safe under concurrent
   requests, and what race does it avoid?
3. Why does this module use `402 Payment Required` instead of `403
   Forbidden` for a quota-exceeded response?
4. Why should a tenant's `plan_id` be updated by a billing-provider
   webhook rather than directly by your own application's upgrade UI?
5. Why might a "storage used" quota reasonably be enforced more loosely
   (soft, periodically reconciled) than a "projects created" quota (hard,
   atomically enforced)?

</summary>
</details>

<details>
<summary>Show answers</summary>

1. Because plan limits change over time (new tiers, adjusted limits,
   promotional overrides) — modeling them as rows in a `plans` table
   means those changes are data updates, not code changes requiring a
   deploy, and lets you introspect/report on plan configuration without
   reading source code.
2. `INSERT ... ON CONFLICT (...) DO UPDATE SET count = count + 1
   RETURNING count` — an atomic, single-statement increment. It avoids
   the read-then-write race where two concurrent requests both read the
   same "below limit" count before either writes back the increment,
   letting both proceed and pushing the true count above the limit
   (exercise 5's bug).
3. `402` communicates "this action is allowed in principle, you've simply
   used up what your current plan includes" (i.e., upgrading would fix
   it), whereas `403` communicates "you are not permitted to do this at
   all" (e.g., a role/permission failure) — client and frontend code can
   use the distinction to show an upgrade prompt for 402 versus an
   access-denied message for 403.
4. Because the billing provider (e.g. Stripe) is the actual system of
   record for what a tenant is being charged for — if your app's UI could
   set `plan_id` directly, it could drift out of sync with what's
   genuinely billed (e.g. showing Enterprise features to a tenant whose
   payment actually failed and whose Stripe subscription was downgraded).
   Webhook-driven updates keep your app's plan state a strict reflection
   of the provider's actual billing state.
5. Because storage/bandwidth-style metrics are expensive or impossible to
   check with the same atomic-counter precision as a simple integer count
   (a large upload's exact size may only be known after most of it has
   transferred), and a small, brief overage is generally an acceptable
   cost — enforcing a best-effort pre-check plus periodic reconciliation
   avoids either wasting resources rejecting valid uploads over a race
   window or over-engineering hard atomicity for a metric where it isn't
   worth the cost.

</details>

## Further reading & sources

- [Stripe docs: Usage-based billing](https://stripe.com/docs/billing/subscriptions/usage-based) - the metered-billing pattern this module's provider-integration section is modeled on.
- [Stripe docs: Webhooks](https://stripe.com/docs/webhooks) - signature verification and event handling for the plan-sync pattern.
- [Track 05, backend: caching and performance](../../05-caching-and-performance/README.md) - the same read-then-write race class discussed there for caches applies to naive quota counters here.

## Next

[05-scaling-and-noisy-neighbor-at-the-app-layer](../05-scaling-and-noisy-neighbor-at-the-app-layer/README.md) —
now that usage is measured per tenant, module 05 uses that same per-tenant
signal to prevent one tenant's load from degrading everyone else's.
