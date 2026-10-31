# Module 10: Routing Fundamentals

## Why this matters

By now the request has traveled the network (module 00), been decrypted
(module 09), parsed as HTTP (module 01), and its method (module 03) and
headers (module 02) are understood. Now the server faces the question every
backend must answer thousands of times a second: **which piece of my code
should handle *this* URL and method?** That decision is **routing**, and
it's the spine of every web framework you'll ever use — Flask, FastAPI,
Express, Rails, Spring — all of them are, at their core, a routing table
mapping `(method, path)` to a handler function.

Getting routing right is what makes an API feel coherent instead of
accidental. A well-designed route structure reads like a description of
your domain (`GET /users/{id}/orders/{order_id}`), makes the
method-semantics from module 03 obvious, and matches requests fast even
with thousands of routes. A poor one has ambiguous overlaps (does
`/users/new` hit the "create form" route or the "get user named 'new'"
route?), leaks path parameters into the wrong handler, and slows to a crawl
as it linear-scans every route on every request.

This module is the bridge from "HTTP the protocol" to "HTTP the
application." It leans directly on module 03 (the same path routes to
different handlers per method) and sets up track 02's deeper API design. By
the end you'll know every route *shape* — static, dynamic, nested,
catch-all, wildcard, regex — and, crucially, the *matching order* rules
that decide which one wins when several could match.

## Concepts

### Routing = mapping (method, path) → handler

A **route** is a rule pairing a request's method and URL path with a
handler. The **router** holds a table of these rules and, for each incoming
request, finds the matching rule and invokes its handler. In FastAPI:

```python
@app.get("/users")          # (GET, /users)  -> list_users
def list_users(): ...

@app.post("/users")         # (POST, /users) -> create_user
def create_user(): ...
```

The path `/users` alone is *not* the whole key — the **method** is part of
it (module 03). `GET /users` and `POST /users` are two different routes to
two different handlers, which is exactly why REST works: the same resource
URL, different verbs, different behavior. When no route matches the path at
all → `404`; when the path matches but not the method → `405` with an
`Allow` header (module 05).

```
   incoming: GET /users/42
        │
        ▼          route table (checked in order)
   ┌─────────────────────────────────────────────┐
   │ (GET,  /health)          ─ path no match     │
   │ (GET,  /users)           ─ path no match     │
   │ (GET,  /users/{id})   ◄── MATCH → get_user(id=42)
   │ (POST, /users/{id})      ─ (not reached)     │
   └─────────────────────────────────────────────┘
     no path matches → 404      path but wrong method → 405 + Allow
```

### The URL, dissected

Routing operates on the **path** portion of the URL, but you should know
the whole anatomy:

```
https://api.example.com:443/users/42/orders?status=open&limit=10#section
\___/   \_______________/\_/\________________/\________________/\______/
scheme        host      port       path            query       fragment
```

- **Path** (`/users/42/orders`) — the hierarchical resource locator; this
  is what routing matches on.
- **Query string** (`?status=open&limit=10`) — key/value pairs *after* the
  `?`, used for filtering/sorting/pagination, not for routing.
- **Fragment** (`#section`) — client-side only; **never sent to the
  server** (the browser strips it). Backends never see fragments.

### Path parameters vs query parameters

This distinction trips up nearly everyone:

- **Path parameters** identify *which resource*. They're part of the path
  and usually required. `GET /users/42` — `42` is a path parameter naming a
  specific user. In FastAPI: `@app.get("/users/{user_id}")`.
- **Query parameters** *modify or filter* a request; they're optional
  refinements. `GET /users?role=admin&limit=10` — `role` and `limit` shape
  *which/how many* users, not *which specific one*. In FastAPI, they're
  just function arguments not in the path.

Rule of thumb: if removing it changes *which resource* you're addressing,
it's a path param; if it only *filters/sorts/paginates* a collection, it's
a query param. `GET /orders/99` (path param — that order) vs.
`GET /orders?status=open` (query param — filter the collection). Getting
this wrong produces URLs like `/getUser?id=42` (RPC-flavored) instead of
the resource-oriented `/users/42`.

### The route shapes

Routers support several kinds of path patterns, from most to least
specific:

- **Static routes** — a fixed literal path. `/health`, `/users`,
  `/about`. Matches exactly that string. Most specific, fastest, least
  ambiguous.
- **Dynamic routes (path parameters)** — a segment is a variable.
  `/users/{user_id}` matches `/users/42`, `/users/abc`, capturing the
  segment. The workhorse of resource APIs.
- **Nested / hierarchical routes** — parameters and segments composed to
  mirror resource containment. `/users/{user_id}/orders/{order_id}` reads
  as "order X belonging to user Y." Nesting expresses relationships in the
  URL structure itself.
- **Typed/constrained dynamic routes** — a path param restricted to a type
  or pattern. FastAPI's `/{user_id:int}`-style (via type hints) rejects
  non-integers with a `422` before your handler runs.
- **Regex-based routes** — the pattern is an explicit regular expression,
  for when a segment must match a precise shape (e.g. a date
  `\d{4}-\d{2}-\d{2}` or a slug). Powerful but harder to read and slower;
  use sparingly.
- **Wildcard / catch-all routes** — match one-or-more remaining segments,
  including slashes. FastAPI: `/files/{file_path:path}` matches
  `/files/a/b/c.txt`, capturing `a/b/c.txt`. Used for file servers,
  proxies, or a final "serve the SPA for anything else" fallback.

### Matching order and specificity — the part that causes bugs

When *multiple* routes could match a request, which wins? This is where
routers differ and bugs breed. The general principle: **more specific
routes should win over more general ones**, but the *mechanism* varies:

- Some routers (including Starlette/FastAPI) match routes **in
  declaration order** — the *first* registered route that matches wins.
  This means if you declare `/users/{user_id}` *before* `/users/me`, a
  request to `/users/me` matches the *dynamic* route first (`user_id =
  "me"`) and your intended `/users/me` handler is never reached. **Fix:
  declare the more specific static route first.**
- Catch-all/wildcard routes must generally be declared **last**, or they
  swallow everything after them.

```
  WRONG order (static shadowed):        RIGHT order (specific first):
   1. /users/{user_id}  ◄─ /users/me     1. /users/me       ◄─ /users/me wins
      captured as id="me"                2. /users/{user_id} ◄─ /users/42 falls here
   2. /users/me         ✗ unreachable
```

The classic ambiguity: `/users/new` (a static "new user form") vs.
`/users/{user_id}` (dynamic). If the dynamic one is declared first,
`/users/new` is captured as `user_id = "new"`. Order and specificity
awareness prevents this. This is a direct application of thinking about
*which of several matching rules applies* — the same discipline you'll want
for middleware ordering and permissions in track 02.

### Route-matching performance

With a handful of routes, a linear scan is fine. With hundreds or thousands
(large APIs, gateways), naive linear matching — trying every route in order
on every request — becomes a measurable cost (module 00's latency lesson).
Real routers optimize with structures like a **trie / radix tree** (sharing
common path prefixes so `/users/...`, `/users/{id}/orders` etc. share a
branch), reducing matching from O(number-of-routes) toward
O(path-length). You don't implement this yet, but know that (a) route order
still matters for *correctness* even when a fast structure is used, and (b)
extremely broad regex/catch-all routes defeat these optimizations and slow
matching. Route *grouping* (next module) also helps organize and speed
matching.

## Command reference

| Pattern (FastAPI) | Shape | Matches |
|---|---|---|
| `@app.get("/health")` | Static | exactly `/health` |
| `@app.get("/users/{user_id}")` | Dynamic | `/users/42`, `/users/abc` |
| `@app.get("/users/{user_id}/orders/{order_id}")` | Nested | `/users/7/orders/99` |
| `@app.get("/items/{item_id}")` + `item_id: int` | Typed | `/items/5` (rejects `/items/abc` → 422) |
| `@app.get("/files/{path:path}")` | Catch-all | `/files/a/b/c.txt` (path = `a/b/c.txt`) |
| query params as function args | Query | `?status=open&limit=10` |

Notes:

- **Path params** are written `{name}` in the path and appear as handler
  arguments. Adding a type hint (`user_id: int`) makes it a **typed** route
  that validates and coerces, returning `422` on mismatch — this is how
  FastAPI does constrained dynamic routes without raw regex.
- **`{path:path}`** is the catch-all converter: the `:path` part tells the
  router this segment may contain slashes and captures the rest.
- **Query params** are *not* in the path; declare them as handler args with
  defaults (`limit: int = 10`) to make them optional.
- **Declaration order matters** in Starlette/FastAPI — register specific
  static routes *before* overlapping dynamic ones.

Example app (used in exercises):

```python
from fastapi import FastAPI, HTTPException

app = FastAPI()
USERS = {42: {"id": 42, "name": "Ada"}}
ORDERS = {99: {"id": 99, "user_id": 42, "status": "open"}}

@app.get("/health")                       # static
def health():
    return {"status": "ok"}

@app.get("/users/me")                     # static — MUST be before the dynamic one
def current_user():
    return {"id": 42, "name": "Ada (you)"}

@app.get("/users/{user_id}")              # dynamic
def get_user(user_id: int):               # typed: non-int -> 422
    if user_id not in USERS:
        raise HTTPException(status_code=404, detail="no such user")
    return USERS[user_id]

@app.get("/users/{user_id}/orders/{order_id}")   # nested
def get_user_order(user_id: int, order_id: int):
    o = ORDERS.get(order_id)
    if not o or o["user_id"] != user_id:
        raise HTTPException(status_code=404, detail="no such order for user")
    return o

@app.get("/orders")                       # query params for filtering
def list_orders(status: str | None = None, limit: int = 10):
    items = list(ORDERS.values())
    if status:
        items = [o for o in items if o["status"] == status]
    return items[:limit]

@app.get("/files/{file_path:path}")       # catch-all — declared LAST
def serve_file(file_path: str):
    return {"requested_path": file_path}
```

## Hands-on exercises

Run with `uvicorn app:app --reload`.

### 1. Static route

```bash
curl -s http://127.0.0.1:8000/health
```

Expected: `{"status":"ok"}`. An exact literal match — the simplest route.

### 2. Dynamic route captures a path parameter

```bash
curl -s http://127.0.0.1:8000/users/42
curl -s -w '\n%{http_code}\n' http://127.0.0.1:8000/users/999
```

Expected: user 42's record, then `404` for 999. The `{user_id}` segment
was captured and passed to the handler.

### 3. Typed route rejects the wrong type

```bash
curl -s -w '\n%{http_code}\n' http://127.0.0.1:8000/users/abc
```

Expected: `422` — `user_id: int` rejects `abc` *before* your handler runs.
This is a constrained dynamic route doing validation for free (compare
module 05's `422`).

### 4. Nested route expresses a relationship

```bash
curl -s http://127.0.0.1:8000/users/42/orders/99
curl -s -w '\n%{http_code}\n' http://127.0.0.1:8000/users/7/orders/99
```

Expected: order 99 for the first (it belongs to user 42), `404` for the
second (order 99 doesn't belong to user 7). The nesting encodes the
"order belongs to user" relationship in the URL and in the check.

### 5. Path params vs query params

```bash
curl -s http://127.0.0.1:8000/orders/                 # note: /orders collection
curl -s 'http://127.0.0.1:8000/orders?status=open&limit=5'
curl -s 'http://127.0.0.1:8000/orders?status=closed'
```

Expected: the full (truncated) list, then only open orders (limited to 5),
then an empty list (no closed orders). `status`/`limit` *filter* the
collection — they're query params, not part of routing. Contrast with
`/users/42` where `42` *is* the routing key.

### 6. Catch-all route

```bash
curl -s http://127.0.0.1:8000/files/docs/report.pdf
curl -s http://127.0.0.1:8000/files/a/b/c/deep.txt
```

Expected: `{"requested_path":"docs/report.pdf"}` and
`{"requested_path":"a/b/c/deep.txt"}` — the `:path` converter captured the
*entire* remaining path including slashes. This is how file servers and
SPA fallbacks work.

### 7. The specificity/order rule, demonstrated

```bash
curl -s http://127.0.0.1:8000/users/me
```

Expected: `{"id":42,"name":"Ada (you)"}` — the *static* `/users/me` route,
because it was declared **before** the dynamic `/users/{user_id}`. Now
mentally move `/users/me` to *after* `/users/{user_id}` and predict the
result. (You'll test that broken order in exercise 8.)

### 8. Diagnose and fix: the shadowed route

Reorder the routes so the dynamic one comes first (simulate the bug):

```python
# BUG: dynamic route declared BEFORE the specific static one
@app.get("/users/{user_id}")
def get_user(user_id: int):
    ...

@app.get("/users/me")            # now unreachable
def current_user():
    ...
```

Restart and:

```bash
curl -s -w '\n%{http_code}\n' http://127.0.0.1:8000/users/me
```

Expected: a `422` (because `/users/{user_id}` matched first and tried to
coerce `"me"` to an int) — or, if `user_id` were a `str`, it would wrongly
return "user me". Either way, `/users/me`'s handler is **never reached**.
**Diagnose:** Starlette/FastAPI matches in declaration order; the dynamic
route *shadows* the more specific static one. **Fix:** declare `/users/me`
*before* `/users/{user_id}` (as the original app does). Restart and
confirm `/users/me` returns the current-user record. Lesson: with
order-based routers, **register specific routes before overlapping dynamic
ones.**

### 9. 404 vs 405 through the router

```bash
curl -s -w '\n%{http_code}\n' http://127.0.0.1:8000/nonexistent
curl -s -i -X DELETE http://127.0.0.1:8000/health | head -3
```

Expected: `404` for a path no route matches; `405 Method Not Allowed` for
`DELETE /health` (the path matches a route, but not for `DELETE`) — with an
`Allow` header. This is routing producing the module 05 codes: no path
match → `404`, path-but-not-method → `405`.

## Independent challenge

No code given.

**Task:** Design and implement the route table for a small blog API that
exercises every route shape from this module *and* gets the matching order
right. It must include: a static health/status route; a collection route
with query-parameter filtering and pagination (not path params); a dynamic
route for a single post by ID that is *type-constrained* so a non-numeric
ID is rejected before the handler; a nested route for a comment belonging
to a post; a *static* special route that would be shadowed by the dynamic
post route if ordered wrong (choose a path that collides, e.g. a
"drafts" or "featured" endpoint under the same prefix), placed so it
actually works; and a catch-all fallback that serves a "not found" page for
anything unmatched, correctly placed so it doesn't swallow real routes.
Prove with curl that the potentially-shadowed static route resolves
correctly, that the type constraint returns the right status code (module
05), and that the catch-all only fires for genuinely unmatched paths. Then
explain, referencing module 03, why the same post URL should map to
*different* handlers for `GET` vs `DELETE`.

<details>
<summary>Hint</summary>

The collision to watch: `/posts/featured` (static) vs `/posts/{post_id}`
(dynamic). Declare `/posts/featured` first, then `/posts/{post_id:int}`,
and put `/{full_path:path}` dead last. The type constraint (`post_id: int`)
makes `/posts/abc` a `422`, which coincidentally also stops it from
shadowing — but don't rely on that; order the static route first anyway.
For the GET-vs-DELETE point, remember (method, path) is the routing key, so
`GET /posts/5` and `DELETE /posts/5` are two distinct routes with
different, semantically-appropriate handlers (module 03: safe read vs.
idempotent delete).

</details>

## Common mistakes & troubleshooting

- **Dynamic route shadowing a specific one.** In order-based routers,
  declaring `/users/{id}` before `/users/me` makes `/users/me` unreachable.
  Register specific static routes first.
- **Catch-all declared too early.** A `/{path:path}` route registered
  before your real routes swallows everything. Put catch-alls last.
- **Confusing path and query parameters.** Use path params to identify
  *which* resource, query params to *filter/sort/paginate* a collection.
  `/getUser?id=42` is an RPC smell; prefer `/users/42`.
- **Expecting the server to see the URL fragment.** `#section` is
  client-only and never sent to the server. Don't route on it.
- **Overusing regex/catch-all routes.** They're hard to read, can conflict
  subtly, and defeat fast route-matching structures. Prefer typed dynamic
  routes.
- **Forgetting method is part of the route key.** `GET /x` and `POST /x`
  are different routes (module 03). A path match with the wrong method is
  `405`, not `404`.
- **Assuming route order never affects performance.** Extremely broad
  patterns and huge unordered tables slow matching; group and structure
  routes (next module).

## Checkpoint quiz

Write down your answer to each question before expanding it — checking without attempting first is the single easiest way to fool yourself into thinking you've learned this.

1. What are the two components of a route's key, and what does the router
   return when the path matches but the method doesn't?
2. Given `/users/42/orders?status=open#top`, identify the path, the query
   parameters, and the fragment — and say which of these the server never
   receives.
3. When should a value be a path parameter versus a query parameter? Give a
   one-line rule and an example of each.
4. Name all six route shapes from this module, from most specific to least.
5. In an order-based router, why does declaring `/users/{user_id}` before
   `/users/me` break the `/users/me` endpoint, and what's the fix?
6. Where must a catch-all (`/{path:path}`) route be declared relative to
   your other routes, and why?
7. How does a router avoid getting slow with thousands of routes, and what
   kinds of routes work against that optimization?

<details>
<summary>Answers</summary>

1. The HTTP method and the URL path together form the route key. If the
   path matches a route but not for that method, the router returns
   `405 Method Not Allowed` (with an `Allow` header); if no path matches at
   all, `404`.
2. Path: `/users/42/orders`. Query parameters: `status=open`. Fragment:
   `top`. The server never receives the fragment (`#top`) — the browser
   strips it and never sends it.
3. Rule: it's a path param if it identifies *which resource* (removing it
   changes what you're addressing); it's a query param if it only
   filters/sorts/paginates a collection. Path: `/orders/99` (that specific
   order). Query: `/orders?status=open` (filter the collection).
4. Static, dynamic (path parameter), typed/constrained dynamic, nested/
   hierarchical, regex-based, catch-all/wildcard. (Most specific → least:
   static, then typed dynamic, then dynamic, nested being a composition,
   then regex, then catch-all.)
5. Because such routers match in declaration order and pick the first
   route that matches; `/users/{user_id}` matches `/users/me` first
   (capturing `user_id="me"`), so `/users/me`'s handler is never reached.
   Fix: declare the specific static `/users/me` route *before* the dynamic
   one.
6. Last (after all more specific routes), because it matches essentially
   any remaining path and would otherwise swallow requests meant for your
   real routes.
7. It uses a prefix-sharing structure like a trie/radix tree so matching
   scales with path length rather than the number of routes. Broad
   regex-based and catch-all routes work against this (they can't be
   indexed by prefix cleanly) and slow matching.

</details>

## Further reading & sources

- [FastAPI: Path Parameters](https://fastapi.tiangolo.com/tutorial/path-params/) and [Query Parameters](https://fastapi.tiangolo.com/tutorial/query-params/) - the path-vs-query distinction with the type-constraint behavior used here.
- [FastAPI: Path Parameters and Numeric Validations](https://fastapi.tiangolo.com/tutorial/path-params-numeric-validations/) - constrained/typed dynamic routes in depth.
- [Starlette: Routing](https://www.starlette.io/routing/) - the declaration-order matching that underlies FastAPI and the shadowing bug.
- [MDN: What is a URL?](https://developer.mozilla.org/en-US/docs/Learn/Common_questions/Web_mechanics/What_is_a_URL) - the scheme/host/path/query/fragment anatomy routing operates on.
- [MDN: 404 Not Found](https://developer.mozilla.org/en-US/docs/Web/HTTP/Status/404) and [405 Method Not Allowed](https://developer.mozilla.org/en-US/docs/Web/HTTP/Status/405) - what the router returns when a path or method fails to match.

## Next

[11-api-versioning-and-serialization](../11-api-versioning-and-serialization/README.md)
— with routing understood, we group and version routes, secure them, and
tackle the other half of request handling: turning objects into bytes and
back (serialization).
