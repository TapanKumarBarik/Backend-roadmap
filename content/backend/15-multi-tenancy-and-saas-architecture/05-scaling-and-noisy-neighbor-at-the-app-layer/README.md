# Module 05: Scaling and the Noisy-Neighbor Problem at the App Layer

## Why this matters

Module 04-10 introduced the noisy-neighbor problem at the **database**
layer — one tenant's heavy query degrading another tenant's response time
on the same shared Postgres instance — and gave you `statement_timeout`
and connection-pool partitioning as mitigations. That's half the problem.
Above the database, your **application servers** are also shared
infrastructure: one tenant hammering your API, running an expensive
report endpoint in a tight loop, or triggering a burst of background jobs
can exhaust worker threads, connection pool slots, or CPU that every other
tenant's requests are also waiting on — with the database itself
completely healthy the whole time. This module closes that gap: per-tenant
rate limiting, tiered infrastructure for especially heavy tenants, and
feature flags that scale what a tenant can *do* (not just how much) by
plan.

## Concepts

### Per-tenant rate limiting, not just per-user

Track `09-security-deep-dive` covers rate limiting per user/IP. Multi-
tenancy needs the same mechanism keyed one level up — per **tenant** —
because a tenant with 50 seats sending legitimate traffic from 50
different users would otherwise blow past a per-user limit's aggregate
intent, or conversely, a single malicious/misconfigured user within a
tenant could be rate-limited individually while 49 other users in the
same tenant keep piling on load the per-user limit never sees in
aggregate.

```python
import time
from collections import defaultdict

class TenantRateLimiter:
    """Token bucket per tenant_id. Same algorithm as track 09/14's rate
    limiter, keyed by tenant instead of user — the mechanism doesn't
    change, only what identifies the bucket."""

    def __init__(self, capacity: int, refill_per_sec: float):
        self.capacity = capacity
        self.refill_per_sec = refill_per_sec
        self.buckets: dict[str, tuple[float, float]] = {}  # tenant_id -> (tokens, last_refill)

    def allow(self, tenant_id: str) -> bool:
        now = time.monotonic()
        tokens, last = self.buckets.get(tenant_id, (self.capacity, now))
        tokens = min(self.capacity, tokens + (now - last) * self.refill_per_sec)
        if tokens < 1:
            self.buckets[tenant_id] = (tokens, now)
            return False
        self.buckets[tenant_id] = (tokens - 1, now)
        return True
```

In production this bucket state lives in Redis (shared across app server
instances, same as track 09's distributed rate limiter), not local
process memory — a per-process-only limiter lets a tenant get
`capacity * number_of_app_servers` effective throughput, which defeats
the point once you're running more than one instance.

### Per-plan rate limits, not one global limit

Combine module 04's plan data with this module's limiter: the bucket
capacity itself comes from the tenant's plan, so "Enterprise gets a
10x higher rate limit than Free" is a data-driven config, not a special
code path.

```python
async def enforce_rate_limit(tenant = Depends(get_current_tenant)):
    plan = await get_plan(tenant.plan_id)
    limiter = get_limiter_for_capacity(plan.rate_limit_per_min)  # one limiter instance per distinct capacity tier
    if not limiter.allow(tenant.id):
        raise HTTPException(status_code=429, detail="Rate limit exceeded — retry after a moment")
```

`429 Too Many Requests` is the correct status here — distinct from module
04's `402` (quota exhausted for the billing period) and track 03's `403`
(not permitted at all). All three are "request rejected," but each tells
the client a different thing to do next: 429 says "slow down and retry
shortly," 402 says "upgrade your plan," 403 says "this will never
succeed no matter what you do."

### Tiered infrastructure: routing heavy tenants away from everyone else

Rate limiting caps how much load *any single tenant* can generate, but
even within their limit, one Enterprise tenant's legitimately heavy,
sustained usage can still crowd out a large number of small Free-tier
tenants sharing the same worker pool. The escalation, mirroring module
04-10's "move the noisy tenant to its own schema/database":

- **Dedicated worker pools by tier** — route Enterprise-tier traffic to a
  separate set of application server instances (behind the same API, via
  a header/tenant lookup at the load balancer or an API gateway layer)
  so a burst from one tier can't starve another tier's shared pool.
- **Dedicated queues for background jobs** — module 03's provisioning
  jobs, and any other per-tenant background work, go through per-tier
  (or, for the largest tenants, per-tenant) queues rather than one global
  FIFO queue a single heavy tenant could fill up.
- **Per-tenant circuit breakers** — if one tenant's requests are
  consistently slow/erroring (e.g. they're hitting a pathological query
  pattern), a circuit breaker that degrades or sheds *that tenant's*
  traffic specifically protects the shared pool for everyone else, rather
  than letting one tenant's bad pattern cascade into a general outage.

### Feature flags by plan: scaling capability, not just volume

Not every noisy-neighbor mitigation is about request *volume* — some
features are inherently expensive per-invocation (a bulk CSV export, a
cross-project analytics report) and belong behind a plan-gated feature
flag regardless of how well-behaved the tenant's overall traffic is:

```python
FEATURE_GATES = {
    "bulk_export": {"pro", "enterprise"},
    "advanced_analytics": {"enterprise"},
}

def require_feature(feature: str):
    async def dependency(tenant = Depends(get_current_tenant)):
        plan = await get_plan(tenant.plan_id)
        if plan.id not in FEATURE_GATES.get(feature, set()):
            raise HTTPException(status_code=402, detail=f"{feature} requires a higher plan")
    return dependency

@app.post("/reports/bulk-export")
async def bulk_export(_ = Depends(require_feature("bulk_export"))):
    ...
```

This reuses module 04's `402` convention deliberately — a feature gate is
conceptually the same "you could, if you upgraded" signal as a quota
limit, just gating a capability instead of a count.

## Command reference

| Concern | Snippet / detail |
|---|---|
| Per-tenant token bucket | keyed by `tenant_id`, capacity from `plan.rate_limit_per_min` |
| Shared limiter state across instances | Redis-backed bucket, not local process memory |
| Rate-limit status code | `429 Too Many Requests` |
| Quota-exceeded status code (module 04) | `402 Payment Required` |
| No-permission status code (track 03) | `403 Forbidden` |
| Feature gating by plan | `FEATURE_GATES` lookup, `402` on denial |
| Tiered worker routing | separate app-server pools/queues by plan tier, routed at the gateway/LB |

## Hands-on exercises

Build on module 04's app. `pip install redis` if testing the distributed
variant (a local in-memory dict is fine for exercises 1-3; exercise 4
requires Redis).

### 1. Build and prove the per-tenant limiter

Implement `TenantRateLimiter` with capacity=5, refill_per_sec=0. Send 6
rapid requests from the same tenant to any endpoint gated with
`enforce_rate_limit`. Confirm the first 5 succeed and the 6th returns
`429`. Send 5 requests from a *different* tenant immediately after —
confirm they all succeed, proving the limiter is keyed per-tenant, not
global.

### 2. Prove plan-based capacity differences

Give `free` a `rate_limit_per_min` of 5 and `pro` a `rate_limit_per_min`
of 50 (module 04's `plans` table). Confirm a free-tier tenant is limited
at 5 rapid requests while a pro-tier tenant with identical request
timing sustains 50 before hitting 429.

### 3. Add a feature gate and confirm plan-based denial

Add `require_feature("bulk_export")` to a route, restricted to `pro`/
`enterprise`. Confirm a `free`-tier tenant gets `402` and a `pro`-tier
tenant succeeds — with **no rate-limit check even relevant** to this
denial (the free tenant is blocked regardless of how few requests
they've sent).

### 4. (Optional, needs Redis) Prove the multi-instance leak with a local-only limiter

Run two instances of your app (two processes, e.g. two `uvicorn` workers
on different ports) both using the **local, in-memory** `TenantRateLimiter`
from exercise 1, capacity=5. Send 5 requests to instance A, then 5 more to
instance B, all from the same tenant, all within the same second. Confirm
**10** requests succeed total — proving a per-process limiter gives a
tenant `capacity * instance_count` effective throughput. Then swap the
limiter's storage to a Redis-backed implementation (`INCR` + `EXPIRE`, or
a Lua script for atomicity) and repeat: confirm only 5 succeed total
across both instances.

### 5. Diagnose and fix: the fair-limit-that-wasn't

A team rate-limits per **user**, not per tenant, reasoning "each user gets
a fair slice." An Enterprise customer with 200 seats complains their
whole organization is being throttled far more aggressively in aggregate
than a Free-tier tenant with 2 users, even though the Enterprise tenant
is paying far more and has an explicitly higher-tier plan. Explain the
mismatch and the fix.

<details>
<summary>Solution</summary>

A per-user limit doesn't scale with organization size the way a
per-tenant limit (with plan-based capacity) does — 200 users each capped
at a small per-user rate individually adds up to a much smaller *effective
tenant-wide* ceiling than intended, while a 2-user Free tenant's users
individually hit the same per-user cap but the tenant's aggregate usage
never approaches anything meaningful. The fix is this module's actual
mechanism: rate-limit at the tenant level, with capacity driven by the
tenant's plan (exercise 2), so a 200-seat Enterprise tenant's *aggregate*
throughput reflects what they're paying for, independent of how many
individual users happen to be active — per-user limiting is still useful
as a secondary, tighter safeguard against one abusive user *within* a
tenant, but it shouldn't be the only or primary limit for a multi-user
tenant's overall capacity.

</details>

## Independent challenge

No code given. A single Enterprise tenant, well within their generous
rate limit and well within their storage/API quotas (module 04), runs a
legitimate but expensive nightly analytics job that measurably slows down
API response times for every other tenant sharing the same application
server pool — this is the noisy-neighbor problem at the app layer, not a
quota or rate-limit violation at all (they're not over any limit). Design
a mitigation. Should this tenant be rate-limited harder (even though
they're not abusing anything)? Moved to dedicated infrastructure? Should
the nightly job itself be redesigned? Justify your choice, and explain
why this scenario proves rate limiting and quotas alone are not
sufficient noisy-neighbor protection.

<details>
<summary>Stuck? One hint</summary>

A common real answer: this specific tenant is a candidate for the
dedicated-worker-pool escalation from the Concepts section — not because
they've violated any limit (they haven't), but because their legitimate,
sustained resource profile doesn't fit the shared pool's assumptions. A
tighter rate limit would be the wrong tool (it would throttle behavior
that's genuinely within their paid-for allowance) and redesigning "their"
job assumes you control it, which you may not for a customer-run
analytics workload. This scenario is exactly why the Concepts section
treats tiered infrastructure as a separate mitigation from rate
limiting/quotas: rate limits cap *abuse or runaway* usage, quotas cap
*volume* against a plan, but neither protects against a *legitimate*,
*within-limit* tenant whose usage pattern simply doesn't belong on shared
infrastructure with everyone else.

</details>

## Common mistakes & troubleshooting

- **Rate-limiting per user instead of (or without also) per tenant.**
  Exercise 5's bug — a multi-seat tenant's aggregate load isn't capped
  correctly by a purely per-user limit.
- **A local, in-process rate limiter behind multiple app server
  instances.** Exercise 4's leak — a tenant gets `capacity * instance
  count` effective throughput, since each process tracks its own,
  unsynchronized bucket state.
- **Conflating 429 (rate limit), 402 (quota/plan), and 403 (permission)
  into one generic error response.** Each tells the client a genuinely
  different next action (retry shortly / upgrade / never going to work),
  and collapsing them removes information the client needs.
- **Assuming rate limits and quotas are sufficient noisy-neighbor
  protection.** The independent challenge's point — a tenant can be
  fully within every limit and still degrade shared infrastructure by
  its resource *pattern*, not its *volume*, which is exactly what tiered
  infrastructure exists to address.
- **Feature-gating only in the frontend UI, not the backend.** A hidden
  button is not access control — `require_feature` (or equivalent) must
  be enforced server-side on the actual endpoint, since a client can
  always call the API directly regardless of what the UI shows.

## Checkpoint quiz

<details>
<summary>Show questions</summary>

1. Why does rate limiting need to be keyed per tenant rather than (or in
   addition to) per user?
2. Why must a per-tenant rate limiter's state be shared (e.g. via Redis)
   across application server instances rather than kept in local process
   memory?
3. What do the status codes 429, 402, and 403 each communicate to a
   client, and why does using the wrong one matter?
4. Give an example of a noisy-neighbor scenario where a tenant is fully
   within their rate limit and quota, yet still degrades shared
   infrastructure — and name the mitigation category that actually
   addresses it.
5. Why is a feature flag like `require_feature("bulk_export")` still
   necessary on the backend even if the frontend already hides the
   button for lower-tier plans?

</summary>
</details>

<details>
<summary>Show answers</summary>

1. Because a per-user limit doesn't reflect a multi-seat tenant's true
   aggregate load — many users each individually under a per-user cap can
   still sum to load far beyond what a tenant's plan is meant to allow
   (or, conversely, a large tenant's per-user cap can throttle them far
   more aggressively in aggregate than intended relative to a small
   tenant), so tenant-level limiting, sized by plan, is needed to reflect
   what's actually being paid for and intended.
2. Because each application server instance would otherwise track its
   own, independent bucket state — a tenant hitting different instances
   (normal under load balancing) would get `capacity * number of
   instances` effective throughput instead of the intended single shared
   limit, defeating the limiter's purpose once you run more than one
   instance.
3. `429` means "you're sending requests too fast right now — slow down
   and retry shortly." `402` means "this would work, but your plan's
   quota/feature access doesn't currently include it — upgrading would
   fix it." `403` means "you are not permitted to do this at all,
   regardless of timing or plan." Using the wrong code tells the client
   (and its UI) the wrong thing to do next — e.g. showing a "try again in
   a moment" message for what's actually a permanent permission denial.
4. A tenant running a legitimate, sustained, resource-heavy workload
   (e.g. a nightly analytics job) that's fully within their rate limit
   and quota but still measurably slows shared infrastructure for other
   tenants sharing the same worker pool. Rate limiting and quotas don't
   address this because no limit is actually being violated — the fix is
   tiered infrastructure (dedicated worker pools/queues for that tenant
   or tier), not a tighter limit.
5. Because a client can always call the backend API directly, bypassing
   whatever the frontend UI shows or hides — a hidden button is a UX
   convenience, not an access-control mechanism. The actual enforcement
   has to happen server-side, on the endpoint itself, or a user with
   access to the API (not just the UI) could invoke a feature their plan
   doesn't include.

</details>

## Further reading & sources

- [Track 09, backend: security deep dive](../../09-security-deep-dive/README.md) - the per-user rate-limiting foundation this module extends to per-tenant.
- [Module 10, 04-databases-and-data-layer](../../04-databases-and-data-layer/10-multi-tenancy-patterns/README.md) - the database-layer half of the noisy-neighbor problem this module addresses at the application layer.
- [AWS: SaaS tenant isolation strategies](https://docs.aws.amazon.com/wellarchitected/latest/saas-lens/tenant-isolation.html) - covers tiered/siloed infrastructure patterns for noisy-neighbor mitigation.

## Next

[06-capstone-build-a-small-saas](../06-capstone-build-a-small-saas/README.md) —
every mechanism from modules 00-05 (tenancy model choice, routing, auth,
provisioning, billing, scaling) gets wired together into one small,
working multi-tenant SaaS app, built step by step.
