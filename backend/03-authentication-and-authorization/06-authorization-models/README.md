# Module 06: Authorization Models

## Why this matters

Every module until now answered *who is this caller* (authentication). This
module answers the other half of "auth": now that you know who they are, *what
are they allowed to do*? That's **authorization** (module 00's `403` half), and
it's where a huge share of real-world security bugs live — not in the crypto,
but in a missing or wrong permission check. "Broken Access Control" sits at the
top of the OWASP Top 10 for a reason: it's easy to authenticate a user
correctly and then let them read someone else's data because nobody checked
ownership. The IDOR bug — `GET /orders/99` returns order 99 *even though it
belongs to another user* — is an authorization failure, and it's everywhere.

There isn't one authorization model; there are several, each fitting different
needs, and picking the wrong one leads either to a rigid system that can't
express real rules or a tangle of ad-hoc `if` statements nobody can audit. This
module gives you the three that matter — **RBAC** (roles), **ABAC**
(attributes), and **ReBAC** (relationships, Zanzibar-style) — when each fits,
and how to build a clean, centralized permission-check layer in FastAPI so the
enforcement lives in one auditable place instead of scattered across handlers.
Your capstone requires RBAC across three permission tiers; this is where you
learn to build it right.

## Concepts

### Authorization is a decision: (subject, action, resource) → allow/deny

Strip away the models and every authorization check is the same function:
*given a **subject** (the authenticated user/client), an **action** (read,
delete, transfer), and a **resource** (this order, that document), do we allow
it?* The models differ only in **what information the decision is based on** —
the user's roles, arbitrary attributes, or relationships between subject and
resource. Keep that frame and the three models below are just three answers to
"what does `allow?` look at."

Two more framing rules that prevent whole bug classes:

- **Deny by default.** The absence of an explicit "allow" is a deny. Never
  structure code so that forgetting a check means access is granted.
- **Enforce on the server, at the resource.** The client's UI hiding a button is
  not authorization — the API must check on every request. And check
  *ownership/scope*, not just "is logged in": returning `GET /orders/99` to any
  authenticated user is the classic IDOR/broken-access-control bug.

### RBAC — Role-Based Access Control

The most common model. Permissions are grouped into **roles**, and users are
assigned roles. You don't grant "can delete orders" to Alice directly; you make
Alice an `admin`, and `admin` has that permission.

```
User ──has──► Role ──grants──► Permission
alice          admin            orders:delete, orders:read, users:manage
bob            editor           orders:read, orders:write
carol          viewer           orders:read
```

The decision `allow?(subject, action, resource)` becomes: does any role the
subject holds include the permission for this action? RBAC's virtues: simple,
auditable ("what can editors do?" is a single lookup), and it matches how
organizations actually think (job functions). Its limits: it's **coarse** —
roles describe *categories* of user, not *this specific resource*. Pure RBAC
struggles to express "a user can edit **their own** posts but not others'"
because that depends on the *relationship* between the user and the resource,
not the user's role alone. In practice most RBAC systems bolt on an ownership
check for exactly this — which is the seed of ReBAC.

RBAC is often modeled with a small hierarchy (roles inherit lesser roles:
`admin ⊃ editor ⊃ viewer`) and **permissions as strings** like `orders:delete`
so checks are data-driven, not a pile of `if role == ...`.

### ABAC — Attribute-Based Access Control

ABAC makes the decision from **attributes** of the subject, the resource, the
action, and the environment — evaluated by a policy. Instead of "admins can do
X," you write rules like:

```
allow if subject.department == resource.department
        and subject.clearance >= resource.classification
        and environment.time is business_hours
        and action in {read}
```

ABAC is far more **expressive** and **fine-grained** than RBAC: it can encode
context (time, location, IP), resource properties (a document's owner,
sensitivity, region), and subject properties (department, clearance) in one
rule, without exploding the number of roles. It's what you reach for when RBAC
would need hundreds of narrow roles to capture the real policy ("role
explosion"). The cost is **complexity**: policies can become hard to reason
about and audit ("why *exactly* was this allowed?"), and you need a policy
engine to evaluate them (e.g. OPA/Rego, Cedar, or Casbin). ABAC and RBAC aren't
exclusive — a common design is RBAC for the coarse tier plus attribute
conditions for the fine-grained rules ("admins, *and* only within their own
region").

### ReBAC — Relationship-Based Access Control (Zanzibar-style)

ReBAC decides based on the **relationships** between subject and resource,
expressed as a graph. This is the model behind Google's **Zanzibar** (the system
that authorizes Google Docs, Drive, YouTube, etc.) and its open-source
descendants (SpiceDB, OpenFGA, Ory Keto). The core data is a set of **relation
tuples**:

```
document:readme#owner@user:alice          alice owns readme
document:readme#editor@group:eng#member    every member of eng can edit readme
folder:specs#parent@document:readme        readme lives in the specs folder
group:eng#member@user:bob                   bob is a member of eng
```

A check like `can bob edit document:readme?` becomes a **graph traversal**: bob
→ member of eng → eng is editor of readme → allowed. ReBAC naturally expresses
exactly what RBAC struggles with — *ownership, sharing, hierarchy, and
inheritance* ("editors of the parent folder can edit the docs inside it",
"anyone I shared this doc with can view it"). It shines for
**document/resource-sharing** products (drives, repos, project tools) where
permissions are per-object and relationship-driven at massive scale. The cost is
running a dedicated authorization service and modeling your relations carefully;
it's overkill for a simple app but the right answer for fine-grained sharing at
scale.

### Choosing between them

| Model | Decision based on | Best for | Weakness |
|---|---|---|---|
| RBAC | the subject's roles | most apps; clear job-function tiers | coarse; can't easily do "own resources"; role explosion |
| ABAC | attributes of subject/resource/env + policy | context-heavy, fine-grained rules; compliance | policy complexity; harder to audit |
| ReBAC | relationships (graph) between subject & resource | per-object sharing/ownership at scale (Docs/Drive) | needs a dedicated service; modeling effort |

Practical guidance: **start with RBAC** — it covers most needs and is easy to
audit. Add **ownership checks** (the ReBAC seed) the moment you have
"users act on their own resources." Reach for **ABAC** when policy depends on
context/attributes that would explode your roles. Adopt full **ReBAC** (a
Zanzibar-style service) when fine-grained sharing between users and objects
becomes central to the product. Many mature systems are hybrids: RBAC for
coarse tiers, ownership/ReBAC for per-object access, ABAC conditions layered on
top.

### Building a permission-check layer in FastAPI

The engineering goal is the same regardless of model: **centralize enforcement**
so it's consistent and auditable, not sprinkled across handlers as raw `if`s
(the module-06-of-track-02 lesson: push rules out of handlers). In FastAPI the
natural tool is a **dependency** that performs the check and raises `403` on
deny — composed *after* the `get_current_user` dependency (authentication) that
you built in earlier modules.

```python
from fastapi import Depends, HTTPException, status

# --- RBAC data (would come from your DB) ---
ROLE_PERMS = {
    "admin":  {"orders:read", "orders:write", "orders:delete", "users:manage"},
    "editor": {"orders:read", "orders:write"},
    "viewer": {"orders:read"},
}

def permissions_for(user) -> set[str]:
    perms = set()
    for role in user.roles:
        perms |= ROLE_PERMS.get(role, set())
    return perms

# --- a reusable, centralized permission dependency (deny by default) ---
def require_permission(perm: str):
    def checker(user = Depends(get_current_user)):   # AuthN runs first
        if perm not in permissions_for(user):
            raise HTTPException(status.HTTP_403_FORBIDDEN, f"missing permission: {perm}")
        return user                                   # AuthZ passed
    return checker

@app.delete("/orders/{oid}")
def delete_order(oid: int, user = Depends(require_permission("orders:delete"))):
    ...   # only reached if the user has orders:delete

# --- resource-level (ownership) check: the RBAC→ReBAC seed ---
def require_owner_or_perm(oid: int, perm: str, user = Depends(get_current_user)):
    order = orders.get(oid)
    if order is None:
        raise HTTPException(404)                      # (note: 404 vs 403 — see mistakes)
    if order.owner_id != user.id and perm not in permissions_for(user):
        raise HTTPException(403, "not allowed")       # not owner AND lacks override perm
    return order
```

Notice the layering: authentication (`get_current_user`) resolves *who*;
`require_permission` / `require_owner_or_perm` resolve *what they may do* and
raise `403`. The permission strings and role map are **data**, so adding a role
or permission is a data change, not scattered code edits — and there's *one*
place to audit "what enforces this." That single centralized layer is what
makes an authorization system reviewable, which for `403`-class bugs is most of
the battle.

## Command reference

| Pattern | Purpose | Snippet |
|---|---|---|
| `Depends(get_current_user)` | run authentication first | resolves the subject |
| `require_permission("orders:delete")` | RBAC permission gate as a dependency | `Depends(require_permission("orders:delete"))` |
| `HTTPException(403, ...)` | deny (authenticated but not allowed) | vs `401` for unauthenticated |
| role → permission set map | data-driven RBAC | `ROLE_PERMS[role]` |
| ownership check `resource.owner_id == user.id` | per-resource (ReBAC seed) | prevents IDOR |
| Casbin `enforcer.enforce(sub, obj, act)` | policy engine for RBAC/ABAC | `pip install casbin` |
| OPA / Rego, Cedar | external policy engines (ABAC) | policy as code |
| OpenFGA / SpiceDB `Check(user, relation, object)` | Zanzibar-style ReBAC service | relationship graph |

A quick Casbin taste for when you outgrow hand-rolled RBAC (policy and model
become external, auditable files rather than Python):

```python
import casbin
e = casbin.Enforcer("model.conf", "policy.csv")
if not e.enforce("alice", "orders", "delete"):     # (sub, obj, act)
    raise HTTPException(403)
```

## Hands-on exercises

Continue in `auth-track`. Users now have `roles` (from module 05's login).

### 1. Build data-driven RBAC

Add the `ROLE_PERMS` map, `permissions_for`, and `require_permission` from
Concepts. Create three users — an `admin`, an `editor`, a `viewer` — and protect
`GET /orders` with `orders:read`, `POST /orders` with `orders:write`, and
`DELETE /orders/{id}` with `orders:delete`. Test all three users against all
three endpoints and build the 3x3 allow/deny matrix. Expected: viewer reads
only, editor reads/writes, admin does everything — and every denial is `403`,
not `401`.

### 2. Prove `401` vs `403` are distinct

Call `DELETE /orders/1` (a) with no credentials and (b) as the `viewer`.
Expected: (a) `401` (unauthenticated — we don't know who you are) and (b) `403`
(authenticated but lacks `orders:delete`). Confirm the two failures are
different codes and explain to yourself why a client must treat them
differently.

### 3. Hit the wall of pure RBAC (ownership)

Give each order an `owner_id`. Now try to express, with roles *alone*, "an
editor may edit **their own** orders but not other editors' orders." Discover
you can't do it with the role map — every editor has the same role. This is the
coarseness limit of RBAC, felt firsthand. Write one sentence naming what
information the decision actually needs (the *relationship* owner↔resource).

### 4. Add an ownership (ReBAC-seed) check

Implement `require_owner_or_perm` so a user may modify an order if they're the
owner *or* they hold an override permission (e.g. `orders:write:any` for
admins). Confirm: editor Bob can edit his own order, gets `403` on Carol's
order, and admin can edit anyone's. Expected: you've combined RBAC (roles) with
a per-resource relationship check — the hybrid most real apps use.

### 5. Model the same rule as ReBAC tuples (on paper)

Express exercise 4's rules as Zanzibar-style relation tuples: `order:1#owner@
user:bob`, `order:1#editor@...`, plus an "admins can edit any order" relation.
Then trace the check `can bob edit order:1?` and `can carol edit order:1?` as
graph traversals. Expected: you can see how ReBAC represents ownership natively
as a relationship instead of a bolted-on `if`.

### 6. Write one ABAC rule

Add an attribute-based rule that RBAC can't cleanly express: "orders over
$10,000 may only be deleted by an admin *and* only during business hours."
Implement it as a small policy function taking subject + resource + environment
attributes. Expected: a rule combining subject role, resource attribute
(amount), and environment (time) in one place — the ABAC style. Note how adding
more such rules could get hard to audit (ABAC's tradeoff).

### 7. Centralize with Casbin (optional but recommended)

`pip install casbin`. Move your RBAC into a Casbin `model.conf` + `policy.csv`
and replace `require_permission`'s body with `enforcer.enforce(user, obj,
act)`. Confirm the same 3x3 matrix from exercise 1 still holds. Expected: policy
now lives in an auditable external file, decoupled from handler code — the
payoff of a real policy engine.

### 8. Diagnose and fix: the IDOR bug

This endpoint authenticates fine but has a critical authorization hole. Find it
and fix it.

```python
@app.get("/orders/{oid}")
def get_order(oid: int, user = Depends(get_current_user)):   # AuthN present
    return orders[oid]        # returns ANY order to ANY logged-in user
```

<details>
<summary>Solution</summary>

This is **IDOR / broken access control**: the endpoint checks that the caller is
*authenticated* but never that they're *authorized to see this specific order*.
Any logged-in user can read every order by changing `oid` — `GET /orders/99`
returns order 99 even though it's someone else's. The fix is a resource-level
authorization check: the order must belong to the user (or the user must hold an
override permission like `orders:read:any`):

```python
@app.get("/orders/{oid}")
def get_order(oid: int, user = Depends(get_current_user)):
    order = orders.get(oid)
    if order is None:
        raise HTTPException(404)
    if order.owner_id != user.id and "orders:read:any" not in permissions_for(user):
        raise HTTPException(404)   # 404 (not 403) to avoid confirming the order exists
    return order
```

The lesson: authentication is not authorization. "Is logged in" must never be
mistaken for "is allowed to touch *this* resource" — always check ownership/
scope at the resource, deny by default. (Note the `404`-instead-of-`403` choice
to avoid leaking existence — see Common mistakes.)

</details>

## Independent challenge

No code given. Build a full three-tier authorization system for `auth-track`
matching what the capstone needs: roles `viewer`, `editor`, `admin` with
data-driven permissions, enforced through a single centralized
`require_permission` dependency composed after your `get_current_user` (reach
back to **modules 01/02** — it must work whether the caller authenticated via
session or JWT). Then add the ReBAC-seed ownership layer so editors act only on
their *own* resources while admins override, and one ABAC-style contextual rule
(e.g. a destructive action allowed only within business hours). Prove the whole
thing with a permission matrix test across all three roles plus an
owner-vs-non-owner case, and include an explicit IDOR regression test showing a
non-owner gets denied. Finally, write a design note: classify each rule you
wrote as RBAC, ABAC, or ReBAC, and justify why you didn't just use one model for
everything.

<details>
<summary>Hint</summary>

The centralized dependency is what makes this auditable *and* auth-mechanism-
agnostic: `require_permission` depends on `get_current_user`, and
`get_current_user` is the same abstraction whether the underlying credential was
a session cookie (module 01) or a Bearer JWT (module 02) — so your authorization
layer doesn't care how the user authenticated, it only consumes the resolved
`User`. Keep permissions as *data* (a role→permission map or a Casbin policy)
so adding the third tier is a data change, and remember the ownership check is a
*per-request, per-resource* decision that no static role map can make for you —
that's precisely why pure RBAC needed the ReBAC seed.

</details>

## Common mistakes & troubleshooting

- **Authentication mistaken for authorization (IDOR).** "Is logged in" is not
  "is allowed to touch this resource." Always check ownership/scope at the
  resource; deny by default.
- **Authorization only in the UI.** Hiding a button is not enforcement. The
  server must check on every request — clients can call the API directly.
- **Scattered `if role == "admin"` checks.** Unauditable and easy to forget one.
  Centralize enforcement in a dependency/policy engine; keep permissions as
  data.
- **Returning `403` when `404` is safer.** For resources the user shouldn't even
  know exist, returning `403` confirms the resource *is* there. Returning `404`
  for both "missing" and "not yours" avoids leaking existence (module 07).
- **Using `401` for a permission denial (or `403` for missing auth).** `401` =
  unauthenticated; `403` = authenticated but forbidden. Mixing them misleads
  clients and breaks retry logic.
- **Role explosion.** Inventing a new narrow role for every edge case leads to
  hundreds of unmanageable roles. That's the signal to add attribute (ABAC) or
  relationship (ReBAC) conditions instead.
- **Choosing ReBAC/ABAC prematurely.** A simple app doesn't need a Zanzibar
  service or a policy engine on day one. Start with RBAC + ownership; adopt the
  heavier models when the product actually needs fine-grained sharing or
  context.

## Checkpoint quiz

Write down your answer to each question before expanding it — checking without attempting first is the single easiest way to fool yourself into thinking you've learned this.

1. Every authorization check is the same function of three inputs — name them,
   and say what varies between RBAC, ABAC, and ReBAC.
2. What is RBAC's core structure, and what kind of rule can pure RBAC *not*
   easily express?
3. When would you choose ABAC over RBAC, and what's the cost?
4. What is a Zanzibar-style relation tuple, and what kind of product is ReBAC
   especially good for?
5. What is IDOR / broken access control, and what check prevents it?
6. Why should authorization enforcement be centralized, and how does a FastAPI
   dependency achieve that?
7. When is returning `404` instead of `403` the better choice, and why?

<details>
<summary>Answers</summary>

1. Subject, action, resource → allow/deny. RBAC bases the decision on the
   subject's *roles*; ABAC on *attributes* of subject/resource/action/
   environment evaluated by a policy; ReBAC on *relationships* between subject
   and resource (a graph).
2. Users are assigned roles, and roles grant permissions (user→role→
   permission). Pure RBAC can't easily express per-resource rules like "edit
   your *own* posts," because that depends on the relationship between the user
   and the specific resource, not the user's role alone.
3. Choose ABAC when the policy depends on context/attributes (time, region,
   clearance, resource sensitivity) that RBAC could only capture by exploding
   into hundreds of roles. The cost is policy complexity and harder auditing —
   "why exactly was this allowed?" gets hard, and you need a policy engine.
4. A relation tuple states a relationship like `document:readme#owner@user:alice`
   ("alice owns readme"); checks become graph traversals over these tuples.
   ReBAC excels for per-object sharing/ownership products (Docs/Drive/repos)
   with inheritance and sharing at scale.
5. Insecure Direct Object Reference / broken access control: an authenticated
   user accesses a resource that isn't theirs by supplying its id (e.g.
   `GET /orders/99`). Prevented by a resource-level ownership/scope check — the
   resource must belong to the user or the user must hold an override
   permission — not just an "is authenticated" check.
6. Centralization makes enforcement consistent and auditable (one place to
   review, impossible to forget), versus scattered `if`s. A FastAPI dependency
   composed after `get_current_user` runs the check and raises `403`, with
   permissions kept as data so changes don't touch handler code.
7. When the user shouldn't even learn the resource exists: `403` confirms it's
   there, so returning `404` for both "missing" and "not yours" avoids leaking
   existence (an information-disclosure concern, module 07).

</details>

## Next

[07-securing-auth-in-practice](../07-securing-auth-in-practice/README.md) — you
now have the full auth toolkit: authentication (sessions, JWT, OAuth2, keys,
MFA) and authorization (RBAC/ABAC/ReBAC). The final module before the capstone
hardens all of it against real attacks: CSRF/XSS/MITM, timing attacks and
constant-time comparison, information leakage through error messages, rate
limiting and account lockout, and audit logging of auth events.
