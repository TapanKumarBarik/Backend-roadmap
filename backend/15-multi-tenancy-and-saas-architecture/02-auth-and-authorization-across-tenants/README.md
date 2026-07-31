# Module 02: Auth and Authorization Across Tenants

## Why this matters

Track 03 (`03-authentication-and-authorization`) taught you sessions,
JWTs, OAuth2/OIDC, and RBAC — but for a world with one flat pool of users.
Multi-tenancy breaks a quiet assumption baked into that world: "a user" is
no longer globally unique or globally scoped. The same email address can
legitimately belong to two different tenants (a consultant working with
two client companies on the same product) as two entirely separate
identities. A valid, unexpired, correctly-signed JWT from tenant A's user
must still be rejected on tenant B's data — signature validity alone is
not authorization. This module makes the tenant resolved in module 01 a
first-class part of every auth decision, not an afterthought bolted onto
track 03's mechanisms.

## Concepts

### The user is scoped to a tenant, not global

```sql
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    email TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'member',  -- 'member' | 'admin'
    UNIQUE (tenant_id, email)  -- NOT a global UNIQUE on email alone
);
```

The uniqueness constraint is the load-bearing detail: `UNIQUE(tenant_id,
email)`, not `UNIQUE(email)`. A global unique-email constraint is the most
common way this module's design accidentally gets broken — it silently
forbids the consultant-with-two-clients case, and forces an awkward
workaround (email aliasing) that a `tenant_id`-scoped constraint avoids
entirely.

### Put the tenant inside the token

Track 03's JWT had claims like `sub` (user ID) and `exp`. A tenant-aware
JWT adds `tenant_id` as a claim, signed as part of the token — not passed
alongside it as a separate, independently-forgeable header:

```python
import jwt
from datetime import datetime, timedelta, timezone

def issue_token(user_id: str, tenant_id: str, role: str, secret: str) -> str:
    payload = {
        "sub": user_id,
        "tenant_id": tenant_id,
        "role": role,
        "exp": datetime.now(timezone.utc) + timedelta(hours=8),
    }
    return jwt.encode(payload, secret, algorithm="HS256")
```

Putting `tenant_id` inside the *signed* payload (not a separate header the
client also sends) means a client cannot forge which tenant their token
claims to belong to without also forging a valid signature — the same
guarantee track 03 already relies on for `sub` and `exp`.

### The check that actually enforces isolation: token tenant vs. resolved tenant

Module 01's middleware resolves a tenant from the *request* (subdomain/
path/header). This module's token carries a tenant claim from *login
time*. Authorization requires both to exist **and match**:

```python
from fastapi import Depends, HTTPException, Request
import jwt

def get_current_user(request: Request, tenant = Depends(get_current_tenant)):
    token = request.headers.get("authorization", "").removeprefix("Bearer ").strip()
    if not token:
        raise HTTPException(status_code=401, detail="Missing token")
    try:
        payload = jwt.decode(token, SECRET, algorithms=["HS256"])
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    # This check is the entire point of this module. A valid signature alone
    # is not enough — the token's tenant must match the request's resolved tenant.
    if payload["tenant_id"] != tenant.id:
        raise HTTPException(status_code=403, detail="Token does not belong to this tenant")

    return {"id": payload["sub"], "role": payload["role"], "tenant_id": payload["tenant_id"]}
```

A user logs in against `acme.yourapp.com`, gets a token with
`tenant_id: acme`. If that exact token is replayed against
`globex.yourapp.com`, module 01 resolves `tenant = globex`, this check
compares `payload["tenant_id"] ("acme") != tenant.id ("globex")`, and the
request is rejected with 403 — even though the JWT signature itself is
perfectly valid and unexpired. This is the mechanism that turns "which
tenant" from a routing convenience (module 01) into an actual security
boundary.

### Tenant admins vs. members: authorization, not just authentication

Once a request has an authenticated, tenant-verified user, track 03's RBAC
applies *within* the tenant boundary:

```python
def require_role(*allowed_roles: str):
    def dependency(user = Depends(get_current_user)):
        if user["role"] not in allowed_roles:
            raise HTTPException(status_code=403, detail="Insufficient role")
        return user
    return dependency

@app.post("/team/invite")
async def invite_member(user = Depends(require_role("admin"))):
    # user is guaranteed: authenticated, belongs to the resolved tenant, AND an admin of it
    ...
```

Note the layering: `require_role` depends on `get_current_user`, which
depends on `get_current_tenant` (module 01). Each dependency adds one more
guarantee, and FastAPI's dependency graph makes the ordering explicit and
impossible to skip a step of — you cannot reach `require_role` without
having already passed tenant resolution and tenant-token verification.

### Password reset and invite flows must stay tenant-scoped too

A password-reset token or an invite link is itself a kind of
short-lived credential — it needs the same `tenant_id` binding as the
login JWT, or a reset link generated for a user in tenant A could
plausibly be replayed against tenant B if the two ever shared a user
lookup by email alone (the exact global-uniqueness mistake from the first
Concepts section, resurfacing in a different flow).

## Command reference

| Concern | Snippet / detail |
|---|---|
| Tenant-scoped uniqueness | `UNIQUE (tenant_id, email)`, never `UNIQUE(email)` alone |
| Put tenant in the signed token | `jwt.encode({"sub":..., "tenant_id":..., ...}, secret)` |
| The core enforcement check | `payload["tenant_id"] != tenant.id` -> 403 |
| Dependency layering | `get_current_tenant` -> `get_current_user` -> `require_role(...)` |
| Tenant-scoped password reset | reset token also carries/binds `tenant_id`, checked the same way |

## Hands-on exercises

Build on module 01's app. Add `pip install pyjwt`.

### 1. Issue a tenant-scoped token and prove it works normally

Add an in-memory `USERS` dict keyed by `(tenant_id, email)`, a `/login`
route (tenant-agnostic path, per module 01's allowlist) that checks
credentials and calls `issue_token`, and protect `/whoami` with
`get_current_user` instead of just `get_current_tenant`.

```bash
curl -H "Host: acme.yourapp.com" -X POST http://localhost:8000/login \
  -d '{"email":"alice@acme.com","password":"devpass"}'
# -> {"token": "..."}

curl -H "Host: acme.yourapp.com" -H "Authorization: Bearer <token>" http://localhost:8000/whoami
```

Expected: `whoami` returns Alice's user info while called against
`acme.yourapp.com` with her token.

### 2. Prove the cross-tenant replay is blocked

Take the exact token from exercise 1 (issued for `acme`) and call
`globex.yourapp.com/whoami` with it:

```bash
curl -H "Host: globex.yourapp.com" -H "Authorization: Bearer <acme's token>" http://localhost:8000/whoami
```

Expected: `403 Token does not belong to this tenant`, **not** 401 (the
token itself is valid — signature checks out, not expired) and not 200.
This is the exercise that proves the module's core mechanism actually
works, not just that it compiles.

### 3. Add a second tenant with a colliding email and prove isolation holds

Add `bob@acme.com` under `acme` and a *different* `bob@acme.com` under
`globex` (same email string, different tenant — the consultant scenario).
Log in as each, and confirm each token only ever authenticates against its
own tenant, never the other, even though the email string is identical.

### 4. Add role-based invite gating

Add `POST /team/invite`, gated with `require_role("admin")`. Create one
`admin` and one `member` user in the same tenant. Confirm the member gets
`403 Insufficient role` and the admin succeeds — and confirm a *different
tenant's* admin still gets `403 Token does not belong to this tenant`
before role is ever checked (tenant match is checked first, in the
dependency chain, before role).

### 5. Diagnose and fix: the "just check tenant_id in the query" almost-bug

A teammate proposes skipping the middleware-tenant-vs-token-tenant check
in `get_current_user` entirely, arguing: "every handler already filters
its query by `tenant_id` from the token, so cross-tenant access is
impossible anyway." Explain, using module 01's resolved tenant, exactly
what this reasoning misses.

<details>
<summary>Solution</summary>

If handlers trust the token's `tenant_id` claim *without* comparing it to
module 01's independently-resolved tenant, then a token issued for tenant
A, replayed against tenant B's subdomain, would have every query scoped
to tenant A's data anyway — the handler would silently serve Acme's data
back on a request that arrived at `globex.yourapp.com`, which is exactly
backwards from what the requester (and any observer of the URL) would
expect, and defeats module 01's entire purpose. The check in
`get_current_user` isn't redundant with per-query filtering — it's
verifying that the *credential* and the *routing destination* agree
before either is trusted for anything downstream. This is the same
"defense in depth, not one single point of truth" lesson as module
04-10's RLS-plus-`WHERE`-clause guidance: two independent mechanisms
checking the same fact catch bugs the other one would miss.

</details>

## Independent challenge

No code given. Design tenant-scoped password reset for this system: a user
clicks "forgot password" on `acme.yourapp.com`, submits their email, and
gets an emailed link. Decide what the reset token needs to encode, what
must be checked when the link is clicked (mirror this module's core
`payload["tenant_id"] != tenant.id` check for the reset flow), and what
should happen if the *same* email exists as a user under a different
tenant too (does the reset email reveal that, and should it?).

<details>
<summary>Stuck? One hint</summary>

A common real answer: the reset token is itself a short-lived signed JWT
(or an opaque token looked up in a `password_resets` table with a
`tenant_id` column) carrying `user_id` and `tenant_id`, generated only
after resolving the tenant from the request the same way module 01 does.
When the link is clicked, re-resolve the tenant from *that* request's
host/path and compare it against the token's `tenant_id`, identically to
`get_current_user`. On whether to reveal cross-tenant existence: no — the
response to "forgot password" should be identical ("if an account exists,
an email was sent") regardless of whether the email exists under this
tenant, a different tenant, or not at all, to avoid leaking which tenants
a given email address has accounts under.

</details>

## Common mistakes & troubleshooting

- **A global `UNIQUE(email)` constraint on the users table.** Silently
  forbids the same email existing under two tenants — a real, legitimate
  case (contractors, consultants) — forcing awkward workarounds. Scope
  the constraint to `(tenant_id, email)`.
- **Trusting the token's `tenant_id` claim without comparing it to the
  independently-resolved tenant from module 01.** Exercise 5's almost-bug
  — the comparison is the entire security boundary, not a redundant
  formality.
- **Passing `tenant_id` as a separate, unsigned header or query param
  alongside the token**, instead of inside the signed JWT payload. An
  unsigned tenant hint can be forged by the client; only a claim inside
  the *signed* payload is trustworthy.
- **Checking role before checking tenant match.** If role is checked
  first, a valid-but-wrong-tenant admin token could pass a role gate
  before the tenant mismatch is ever caught, depending on how the checks
  are ordered — always resolve tenant, then verify token-tenant match,
  then check role, in that order (module 01 -> this module's core check ->
  RBAC).
- **Reset/invite tokens that don't carry the same tenant binding as login
  tokens.** Any secondary credential flow needs the identical isolation
  guarantee as the primary login flow, or it becomes the weaker link an
  attacker targets instead.

## Checkpoint quiz

<details>
<summary>Show questions</summary>

1. Why should `users.email` be uniquely constrained per-tenant
   (`UNIQUE(tenant_id, email)`) rather than globally?
2. What's the specific check that prevents a valid, unexpired JWT issued
   for tenant A from being used against tenant B, and why is signature
   validity alone not sufficient?
3. Why must `tenant_id` live inside the *signed* JWT payload rather than
   as a separate header?
4. In the dependency chain `get_current_tenant -> get_current_user ->
   require_role`, what does each layer guarantee that the next one relies
   on?
5. Why should a "forgot password" response be identical whether or not
   the submitted email exists under the current tenant?

</summary>
</details>

<details>
<summary>Show answers</summary>

1. Because the same email address can legitimately belong to two separate
   tenants (e.g. a consultant working with two client companies) — a
   global unique constraint would forbid that entirely and force an
   artificial workaround, when the actual requirement is only that an
   email be unique *within* one tenant's user base.
2. Comparing the JWT's `tenant_id` claim against the tenant independently
   resolved from the request (module 01's middleware) and rejecting on
   mismatch (403). Signature validity alone only proves the token wasn't
   tampered with and was issued by your server — it says nothing about
   whether the token's *origin tenant* matches the *destination tenant*
   of the current request, which is exactly what a cross-tenant replay
   exploits.
3. Because anything outside the signed payload (a separate header, a
   query parameter) can be set to any value by the client without
   invalidating the request — only data inside the signed payload is
   guaranteed to be exactly what the server issued at login time.
4. `get_current_tenant` guarantees a valid, resolved, active tenant exists
   for this request (module 01). `get_current_user` builds on that to
   guarantee an authenticated user whose token's tenant matches that
   resolved tenant. `require_role` builds on both to guarantee that
   authenticated, tenant-verified user also holds a specific role. Each
   layer can assume everything the layers before it already checked.
5. To avoid leaking, to whoever submitted the form, whether a given email
   address has an account under the current tenant, under a different
   tenant, or under no tenant at all — revealing that distinction would
   let an attacker enumerate which companies/tenants a given email is
   associated with, independent of whether they can actually access any
   account.

</details>

## Further reading & sources

- [Auth0: Multi-tenant SaaS applications](https://auth0.com/docs/get-started/architecture-scenarios/multi-tenant) - a vendor account of tenant-aware token design, including tenant claims.
- [Module 03, backend](../../03-authentication-and-authorization/README.md) - the JWT/RBAC foundation this module extends with tenant-awareness.
- [OWASP: Broken Access Control](https://owasp.org/Top10/A01_2021-Broken_Access_Control/) - cross-tenant access is a specific, common instance of this OWASP Top 10 category.

## Next

[03-provisioning-and-onboarding-automation](../03-provisioning-and-onboarding-automation/README.md) —
now that a tenant can have real, isolated users, module 03 automates how a
*brand-new* tenant and its first admin user get created in the first
place.
