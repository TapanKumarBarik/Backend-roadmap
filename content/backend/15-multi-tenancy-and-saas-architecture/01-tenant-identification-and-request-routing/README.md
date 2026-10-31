# Module 01: Tenant Identification and Request Routing

## Why this matters

Every module after this one assumes a single fact is already known before
any handler code runs: **which tenant is this request for.** Auth (module
02) can't check "does this user belong to this tenant" without a resolved
tenant to check against. Data access (module 04-10's RLS) can't set
`app.current_tenant` without knowing what to set it to. Billing (module 04)
can't meter usage against the right account. Get tenant resolution wrong —
or skip it and let each handler figure it out independently — and you get
exactly the kind of leak module 04-10's exercise 6 described: one endpoint
that forgot the check. This module makes tenant resolution a single,
mandatory, front-door mechanism: middleware that runs before every handler,
resolves the tenant once, and fails closed if it can't.

## Concepts

### Three ways to identify a tenant from a request

- **Subdomain-based** — `acme.yourapp.com`, `globex.yourapp.com`. The
  tenant slug lives in the `Host` header. Most common for B2B SaaS —
  looks professional, tenant-branded, and the tenant is visible before
  any request body is even read. Requires wildcard DNS (`*.yourapp.com`)
  and a wildcard TLS cert.
- **Path-based** — `yourapp.com/acme/...`, `yourapp.com/globex/...`. No
  DNS/cert complexity, works identically in every environment (including
  `localhost` during development). Slightly less "branded" feeling, and
  every route in your API gains a leading `/{tenant_slug}` segment.
- **Header-based** — a custom header like `X-Tenant-ID` on every request.
  Common for API-only products (no browser UI to carry a subdomain/path
  naturally) or internal service-to-service calls. Requires every client
  to know to send it — not suitable for a product where a human types a
  URL into a browser.

Most consumer-facing SaaS products use subdomain; most pure API products
use header-based, often *alongside* a subdomain for the human-facing part
of the same product. Path-based is the easiest to prototype with and a
completely legitimate permanent choice for internal tools.

### Resolve once, in middleware, before any handler runs

The mistake module 04-10 warned about (isolation enforced by convention,
in each handler, individually) applies just as much here. The fix is the
same shape: a single piece of middleware that runs for **every** request,
resolves the tenant, and either attaches it to the request or rejects the
request outright — no handler is ever given the chance to "forget."

```python
from fastapi import FastAPI, Request, HTTPException
from starlette.middleware.base import BaseHTTPMiddleware
import re

SUBDOMAIN_RE = re.compile(r"^([a-z0-9-]+)\.yourapp\.com$")

class TenantResolutionMiddleware(BaseHTTPMiddleware):
    def __init__(self, app, tenant_lookup):
        super().__init__(app)
        self.tenant_lookup = tenant_lookup  # slug -> Tenant | None

    async def dispatch(self, request: Request, call_next):
        host = request.headers.get("host", "")
        match = SUBDOMAIN_RE.match(host)
        if not match:
            raise HTTPException(status_code=400, detail="Unresolvable tenant from host")

        slug = match.group(1)
        tenant = await self.tenant_lookup(slug)
        if tenant is None:
            # Fail closed: an unknown slug is a 404, never "fall through" to some default tenant.
            raise HTTPException(status_code=404, detail="Unknown tenant")
        if tenant.status != "active":
            raise HTTPException(status_code=403, detail="Tenant suspended")

        request.state.tenant = tenant
        return await call_next(request)
```

The two failure-closed decisions in that snippet matter more than the
happy path: an unresolvable host is rejected, not routed to a default
tenant; an unknown slug is rejected, not silently treated as tenant 1.
Both are "fail closed" choices — the alternative (fail open) is exactly
how a missing-filter bug becomes a cross-tenant leak.

### Carrying the resolved tenant through the request

Once middleware resolves the tenant, every downstream piece — handlers,
the repository layer, module 04-10's `tenant_session` — needs access to it
without re-resolving it. Two common mechanisms:

- **Request state** (the `request.state.tenant` above) — simplest, works
  naturally with FastAPI's dependency injection (`Depends(get_current_tenant)`
  reads `request.state.tenant`).
- **`contextvars`** — needed when tenant context must be visible *outside*
  the request/response cycle proper — e.g. inside a background task
  spawned from the request (module 06, `backend/`) where you don't have a
  `Request` object to read `.state` from.

```python
from contextvars import ContextVar

current_tenant: ContextVar[str | None] = ContextVar("current_tenant", default=None)

# set once, in middleware, after resolution:
token = current_tenant.set(tenant.id)
try:
    response = await call_next(request)
finally:
    current_tenant.reset(token)  # always clear it — never leak into the next request
```

The `reset()` in a `finally` block is not optional — `contextvars` values
can otherwise leak across requests reusing the same worker/task under some
async runtimes, which would be a tenant-isolation bug in the resolution
mechanism itself.

### Routing tenant-scoped vs. tenant-agnostic paths

Not every route belongs to a tenant. `/health`, `/signup`, and the
marketing site's routes have no tenant yet (signup is *how* a tenant gets
created — module 03). The middleware needs an explicit allowlist of
tenant-agnostic paths, checked *before* attempting resolution — this is
also a fail-closed design: paths default to "tenant required," and only
an explicit, reviewed list opts out.

```python
TENANT_AGNOSTIC_PATHS = {"/health", "/signup", "/login"}

async def dispatch(self, request, call_next):
    if request.url.path in TENANT_AGNOSTIC_PATHS:
        return await call_next(request)
    # ... resolution logic as above
```

## Command reference

| Concern | Snippet |
|---|---|
| Subdomain match | `re.compile(r"^([a-z0-9-]+)\.yourapp\.com$")` |
| Attach resolved tenant to request | `request.state.tenant = tenant` |
| Read resolved tenant in a handler | `Depends(lambda r: r.state.tenant)` or a small `get_current_tenant` dependency |
| Cross-request-boundary tenant context | `ContextVar("current_tenant")`, set/reset per request |
| Fail-closed on unresolvable host | `raise HTTPException(400, ...)` — never fall through |
| Fail-closed on unknown slug | `raise HTTPException(404, ...)` — never default to a tenant |
| Tenant-agnostic path allowlist | explicit `set` checked first, before resolution logic |

A `get_current_tenant` FastAPI dependency, used by every tenant-scoped
handler from here forward:

```python
from fastapi import Depends, Request, HTTPException

def get_current_tenant(request: Request):
    tenant = getattr(request.state, "tenant", None)
    if tenant is None:
        # Should be unreachable if middleware is correctly registered on every route —
        # this is a defense-in-depth check, not the primary enforcement mechanism.
        raise HTTPException(status_code=500, detail="Tenant middleware did not run")
    return tenant

@app.get("/projects")
async def list_projects(tenant = Depends(get_current_tenant)):
    ...
```

## Hands-on exercises

`pip install fastapi uvicorn`. No database needed yet — this module is
pure request-routing, module 03 adds real provisioning.

### 1. Build subdomain resolution and prove fail-closed behavior

Build a minimal app with the `TenantResolutionMiddleware` above, backed by
an in-memory `{"acme": Tenant(...), "globex": Tenant(...)}` lookup. Add one
route, `GET /whoami`, returning the resolved tenant's slug.

```python
import uvicorn
from dataclasses import dataclass

@dataclass
class Tenant:
    id: str
    slug: str
    status: str = "active"

TENANTS = {
    "acme": Tenant(id="t1", slug="acme"),
    "globex": Tenant(id="t2", slug="globex"),
}

async def lookup(slug: str) -> Tenant | None:
    return TENANTS.get(slug)

app = FastAPI()
app.add_middleware(TenantResolutionMiddleware, tenant_lookup=lookup)

@app.get("/whoami")
async def whoami(tenant = Depends(get_current_tenant)):
    return {"tenant": tenant.slug}
```

Since `*.yourapp.com` doesn't resolve on your machine, test by sending an
explicit `Host` header instead of relying on real DNS:

```bash
curl -H "Host: acme.yourapp.com" http://localhost:8000/whoami
curl -H "Host: globex.yourapp.com" http://localhost:8000/whoami
curl -H "Host: nosuchtenant.yourapp.com" http://localhost:8000/whoami
curl -H "Host: totallywrong.example.com" http://localhost:8000/whoami
```

Expected: the first two return the right slug each; the third returns
`404 Unknown tenant`; the fourth returns `400 Unresolvable tenant from
host` (the regex doesn't match at all). Confirm you get **exactly** those
codes, not a default tenant or a 200 for any of the failure cases.

### 2. Add a suspended tenant and confirm it's blocked

Add a third tenant with `status="suspended"`. Confirm the middleware
returns `403`, not `200` and not `404` — a suspended tenant is a distinct
failure mode from an unknown one (billing/support flows need to tell them
apart: "you don't exist" vs. "you exist but are paused").

### 3. Switch to path-based routing and compare

Rewrite the middleware to resolve from `request.url.path.split("/")[1]`
instead of the `Host` header (`GET /acme/whoami`). Keep the same
fail-closed behavior for unknown/suspended tenants. Note in your own
words: what changes about how your route table looks (every route now
needs a `/{tenant_slug}` prefix) versus what stays identical (the
fail-closed resolution logic itself is unchanged) — the identification
*mechanism* changes, the *guarantee* it provides doesn't.

### 4. Add the tenant-agnostic allowlist

Add `/health` and `/signup` routes and confirm they work with **no** Host
header tenant match at all (e.g. `Host: localhost`) once added to
`TENANT_AGNOSTIC_PATHS`, while `/whoami` still correctly requires
resolution.

### 5. Diagnose and fix: the default-tenant bug

A junior engineer's first draft of tenant resolution looked like this:

```python
tenant = TENANTS.get(slug, TENANTS["acme"])  # "just use acme as a fallback for now"
```

Explain, concretely, what this bug causes in production the first time a
real customer's subdomain has a typo in a marketing email or a DNS
misconfiguration routes an unexpected `Host` header to your app.

<details>
<summary>Solution</summary>

Any request with an unresolvable or unrecognized slug silently becomes a
request *as Acme* — reading Acme's data, and depending on how far this bug
reaches, potentially writing to Acme's data too. This is a cross-tenant
leak caused by a "helpful" fallback exactly like module 04-10's leaked
CSV-export endpoint, except at the routing layer instead of the query
layer: fail-open masquerading as a convenience default. The fix is
exercise 1's behavior: an unresolvable/unknown tenant is always a hard
error (400/404), never a fallback to any real tenant, defaulted or
otherwise.

</details>

## Independent challenge

No code given. Design (in a short written plan, then implement it) tenant
resolution for a product that must support **both** subdomain-based
routing for its browser-facing dashboard *and* header-based routing for
its public API (the same backend serves both). Decide: does the
middleware try subdomain first and fall back to header, or are they two
separate middleware stacks mounted on different route groups? Justify
which failure-closed behavior applies when *neither* signal is present,
and when *both* are present but disagree (subdomain says `acme`, header
says `globex`).

<details>
<summary>Stuck? One hint</summary>

A common real answer: mount two separate route groups (e.g. `/api/*` for
the header-based public API, everything else for the subdomain-based
dashboard) rather than one middleware trying both signals on every
request — simpler to reason about, and avoids the ambiguous-signal case
almost entirely by construction. For the case where both are somehow
present and disagree on the API route group: treat it as fail-closed too
(reject with 400) rather than picking one arbitrarily — an API client
sending conflicting tenant signals is either a bug in that client or a
security probe, and neither should be quietly resolved by pick-one logic.

</details>

## Common mistakes & troubleshooting

- **Falling back to a default tenant on resolution failure.** Exercise 5's
  bug, and the single most dangerous mistake in this module — always fail
  closed (4xx), never fall through to any real tenant.
- **Resolving the tenant separately in every handler instead of once in
  middleware.** The exact per-endpoint-convention failure mode module
  04-10 warned about at the database layer, recurring at the routing
  layer — one handler that's added later and forgets the check is a leak.
- **Forgetting to reset a `ContextVar` after the request.** Async runtimes
  can reuse workers/tasks; a `set()` without a matching `reset()` in a
  `finally` block can leak one request's tenant context into the next.
- **Treating "unknown tenant" and "suspended tenant" as the same error.**
  They're operationally different (a typo/attack vs. a real, billing-
  paused customer) and downstream support/billing flows need to
  distinguish them — exercise 2.
- **No explicit allowlist for tenant-agnostic routes**, leading to either
  overly broad exceptions (regex hacks in the resolution logic itself) or
  signup/health-check endpoints breaking because they got treated as
  tenant-scoped by accident.

## Checkpoint quiz

<details>
<summary>Show questions</summary>

1. Name the three ways to identify a tenant from a request and one product
   type that typically fits each.
2. Why must tenant resolution happen in middleware, once, rather than in
   each handler individually?
3. What does "fail closed" mean in the context of tenant resolution, and
   give the two specific failure cases this module fails closed on.
4. Why is a `ContextVar` used instead of (or alongside) `request.state` in
   some designs, and what's the one thing you must never forget to do
   with it?
5. Why should "unknown tenant" and "suspended tenant" return different
   status codes instead of both just being "denied"?

</summary>
</details>

<details>
<summary>Show answers</summary>

1. Subdomain-based (typical consumer-facing/branded B2B SaaS with a
   browser UI); path-based (simple to prototype, works identically in
   every environment, no DNS/cert setup); header-based (API-only products
   or service-to-service calls with no natural place to carry a
   subdomain/path).
2. Because resolving it per-handler recreates the exact "convention every
   developer must remember" failure mode module 04-10 warned about at the
   database layer — one new handler added under deadline pressure that
   forgets the check becomes a cross-tenant leak. A single middleware
   guarantees every request is resolved (or rejected) before any handler
   code runs at all.
3. "Fail closed" means an inability to identify or validate the tenant
   results in the request being rejected, never silently allowed through
   with some default/fallback. This module fails closed on: an
   unresolvable host/signal (400) and an unrecognized tenant slug (404) —
   neither ever falls through to a real, existing tenant.
4. A `ContextVar` is needed when tenant context must be visible outside
   the request/response object itself — e.g. inside a background task
   spawned from the request, which has no `Request` to read `.state`
   from. You must always `reset()` it (typically in a `finally` block),
   or its value can leak into a later request/task reusing the same
   worker.
5. They're operationally different situations needing different
   responses: an unknown slug is likely a typo, misconfiguration, or
   probing attempt (404 — "this doesn't exist"), while a suspended tenant
   is a real, existing customer who's been paused, typically for billing
   reasons (403 — "this exists but access is denied") — support and
   billing tooling need to tell these apart, and collapsing them into one
   generic "denied" response hides that distinction from anyone
   debugging a customer's access issue.

</details>

## Further reading & sources

- [Starlette: Middleware](https://www.starlette.io/middleware/) - the base class this module's middleware extends.
- [AWS: SaaS tenant isolation strategies](https://docs.aws.amazon.com/wellarchitected/latest/saas-lens/tenant-isolation.html) - covers routing-layer isolation alongside the data-layer strategies from module 04-10.
- [Python docs: `contextvars`](https://docs.python.org/3/library/contextvars.html) - the mechanism used for cross-async-boundary tenant context.

## Next

[02-auth-and-authorization-across-tenants](../02-auth-and-authorization-across-tenants/README.md) —
now that every request has a resolved, trusted tenant attached to it,
module 02 uses that resolved tenant to make auth itself tenant-aware.
