# Module 08: RESTful Architecture and Best Practices

## Why this matters

You can now build individual endpoints that work. This module is about the
*system* they form. REST isn't a framework or a library — it's a set of
architectural constraints for designing APIs around **resources** and the
**uniform semantics of HTTP** so that any competent client can predict how
your API behaves without reading your source. When an API is genuinely
RESTful, a developer who's used *any* REST API already knows that `GET
/orders/42` fetches order 42, that `DELETE` on it removes it, that a `404`
means it's gone, and that the operation is safe to retry if it's idempotent.
That predictability is the entire value proposition. An API that invents its
own verbs (`POST /getOrderById`, `POST /deleteOrderNow`) throws that away and
forces every client to learn your idiosyncrasies.

The design decisions here are the ones you live with for *years*, because
changing them breaks clients. How do you model a nested relationship —
`/users/42/orders` or `/orders?user=42`? How do you version the API so you can
evolve it without breaking the mobile app that shipped last year? How does a
client that wants XML instead of JSON ask for it? How do you let clients cache
responses safely so they don't re-fetch unchanged data — and revalidate
cheaply when it might have changed, using ETags? These aren't
micro-optimizations; they're the difference between an API that ages
gracefully and one that becomes a liability. And critically, this module sets
up module 09: the best way to make these decisions *consistent* is to design
against an **OpenAPI spec** — to think in terms of a formal contract before
you write handlers.

## Concepts

### Resources, not actions: modeling around nouns

The core REST idea: your API exposes **resources** (nouns) — `users`,
`orders`, `tasks` — and you act on them with the **standard HTTP methods**
(the verbs), not with custom action names baked into the URL. The URL
identifies *what*; the method says *what to do*.

```
GET    /orders           list orders
POST   /orders           create an order
GET    /orders/42        fetch order 42
PUT    /orders/42        replace order 42
PATCH  /orders/42        modify order 42
DELETE /orders/42        delete order 42
```

```
  RPC-STYLE (verb in URL)          RESOURCE-ORIENTED (verb in method)
  POST /createOrder            ►   POST   /orders
  POST /getOrderById           ►   GET    /orders/42
  POST /updateOrderTotal       ►   PATCH  /orders/42
  POST /deleteOrderNow         ►   DELETE /orders/42
  one endpoint per action          one URL per resource, methods = verbs
  client must learn each           any REST client already knows it
```

Not `POST /createOrder`, `POST /getOrder`, `POST /updateOrder`. The verb is
already in the HTTP method. Collections are plural nouns (`/orders`), a single
item is `/orders/{id}`. When an operation genuinely isn't CRUD — "cancel this
order" — you model the *state change* as a sub-resource or a controlled field
update (`POST /orders/42/cancellation`, or `PATCH /orders/42 {"status":
"cancelled"}`) rather than a `POST /cancelOrder`. Getting comfortable
expressing verbs-as-resource-changes is the main REST modeling skill.

### Relationships and nesting

When resources relate, you can express it two ways, and both are valid for
different needs:

- **Nested path** for "belongs to" containment:
  `GET /users/42/orders` — orders *of* user 42. Reads naturally, scopes
  clearly. Don't nest more than one level deep (`/users/42/orders/7/items/3`
  becomes unwieldy — link to `/items/3` instead).
- **Filtering on the flat collection**: `GET /orders?user_id=42` — same
  result, and more flexible when you need to combine filters
  (`?user_id=42&status=open`). This ties back to module 07's filtering.

Rule of thumb: use nesting for a clear ownership hierarchy the client
navigates; use query filters for cross-cutting queries. Many APIs offer both.

### API versioning

Your API *will* change in backward-incompatible ways. Versioning lets old
clients keep working while new ones use the new shape. Four common approaches,
with real tradeoffs:

- **URI path versioning**: `GET /v1/orders`, `GET /v2/orders`. Most explicit,
  most visible, easiest to route and cache. Downside: it technically violates
  the "one URI per resource" purist ideal (the same order has two URLs). By
  far the most common in practice.
- **Header versioning**: `Accept-Version: 2` (a custom header). Keeps URLs
  clean, but versioning is invisible in the URL and harder to test in a
  browser.
- **Query-string versioning**: `GET /orders?version=2`. Simple, but mixes
  versioning with filtering params and can complicate caching.
- **Media-type (content negotiation) versioning**: `Accept:
  application/vnd.myapi.v2+json`. The most "RESTfully pure" (version is part
  of the representation), but the most obscure and hardest for casual clients.

There's no universally right answer; **URI path versioning is the pragmatic
default** for most public APIs because it's obvious and toolable. Pick one, be
consistent, and document it.

```python
from fastapi import APIRouter
v1 = APIRouter(prefix="/v1")
v2 = APIRouter(prefix="/v2")
# mount both; v1 stays stable while v2 evolves
app.include_router(v1); app.include_router(v2)
```

### Content negotiation

A client tells the server what representation it wants via the `Accept`
header, and the server responds with `Content-Type` describing what it sent.
`Accept: application/json` → JSON; `Accept: application/xml` → XML (if you
support it). This is **content negotiation**: one resource, multiple possible
representations, chosen per request. Most JSON APIs support only JSON and
that's fine — but you should return `406 Not Acceptable` if a client demands a
representation you can't produce, rather than silently sending JSON anyway.
The same mechanism underlies media-type versioning above and compression
(`Accept-Encoding: gzip`, module 04).

### Client-side caching with ETags

Re-sending data the client already has is waste. HTTP has a built-in
revalidation mechanism: the server sends an **ETag** (an opaque version
identifier, often a hash of the content) with a response; the client stores it
and, on the next request, sends `If-None-Match: <etag>`. If the resource
hasn't changed, the server replies `304 Not Modified` **with no body** — the
client reuses its cached copy. Huge bandwidth savings for frequently-fetched,
rarely-changed resources.

```
  1st request:  client ──GET /orders/42──► server
                client ◄─200 + ETag:abc123─ server   (stores body + etag)

  2nd request:  client ──GET /orders/42, If-None-Match: abc123──► server
                                                              compares etag
      unchanged ◄─304 Not Modified (no body)─────────────────────┤ same
        changed ◄─200 + body + ETag:def456────────────────────── ┘ differs
```



```python
import hashlib
from fastapi import Request, Response

@router.get("/orders/{oid}")
async def get_order(oid: int, request: Request, response: Response, svc=Depends(...)):
    order = svc.get_order(oid)
    etag = hashlib.sha256(repr(order).encode()).hexdigest()[:16]
    if request.headers.get("if-none-match") == etag:
        return Response(status_code=304)          # client's copy is current
    response.headers["ETag"] = etag
    return order
```

ETags also power **optimistic concurrency**: a client sends `If-Match:
<etag>` on an update, and the server rejects with `412 Precondition Failed`
if the resource changed since — preventing a lost-update race. `Cache-Control`
headers (`max-age`, `no-cache`, `private`) complement ETags by telling the
client/proxies *how long* a response may be reused before revalidating.

### Meaningful exceptions and error semantics

RESTful error handling means using the *right* status code and a *useful,
consistent* body (module 06's envelope). The status code is machine-readable
semantics; the body is human/debugging detail. Don't return `200` with
`{"error": ...}` — that lies to every HTTP-aware client, proxy, and cache.
Capture exceptions with meaningful messages that help the caller fix the
problem, while never leaking internals (module 02). The status-code families
matter: `4xx` = client's fault (they can fix it), `5xx` = server's fault
(they can't). This distinction drives client retry logic and your own alerting.

### Optimizing large payloads

Big requests and responses cost bandwidth, memory, and latency. Techniques:

- **Compression** (module 04): gzip/brotli responses over a size threshold.
- **Pagination** (module 07): never return an unbounded collection.
- **Field selection / sparse fieldsets**: let clients request only the fields
  they need — `GET /orders?fields=id,total` — so mobile clients don't download
  everything.
- **Avoid over-nesting/over-fetching**: don't embed entire related objects by
  default; link to them and let the client fetch on demand (or offer an
  `?expand=` opt-in).
- **Streaming** for genuinely huge responses, so you don't hold the whole
  body in memory.

### Designing with an OpenAPI spec in mind

The through-line of good REST design: decide the **contract** first. What are
the resources, their URLs, their methods, their request/response schemas,
their status codes, their errors? FastAPI *generates* an OpenAPI spec from
your code (module 09), but the discipline is to think spec-first even when
coding — because that's what forces the consistency (uniform envelopes,
predictable status codes, versioning strategy) this module is about. When you
design against the contract, every endpoint in your API feels like it was
designed by one person, because it was designed to one spec.

## Command reference

| Concept | Pattern | Example |
|---|---|---|
| Resource URLs | plural nouns + HTTP methods | `GET /orders`, `DELETE /orders/42` |
| Nested relationship | one level of containment | `GET /users/42/orders` |
| Flat + filter | cross-cutting queries | `GET /orders?user_id=42&status=open` |
| URI versioning | prefix routers | `APIRouter(prefix="/v1")` |
| Content negotiation | `Accept` / `Content-Type` | `Accept: application/json` |
| Unacceptable representation | `406 Not Acceptable` | when you can't satisfy `Accept` |
| ETag revalidation | `ETag` + `If-None-Match` → `304` | see above |
| Optimistic concurrency | `If-Match` → `412 Precondition Failed` | conditional update |
| Cache directives | `Cache-Control` | `Cache-Control: private, max-age=60` |
| Field selection | `?fields=` sparse fieldsets | `GET /orders?fields=id,total` |

**`304 Not Modified` must have no body.** The whole point is to *not* resend
the payload. Return an empty `Response(status_code=304)`; sending a body
defeats the optimization and confuses clients.

**`4xx` vs `5xx` is a contract, not a mood.** `4xx` tells the client "you can
fix this and it's worth retrying only after changing the request"; `5xx` tells
it "server problem, safe to retry with backoff." Misclassifying (e.g.
returning `500` for bad input) breaks client retry logic and pollutes your
alerting — a `5xx` spike should mean *you* broke something.

**Version from day one, even if it's just `/v1`.** Adding versioning *after*
clients depend on unversioned URLs is painful. Start at `/v1` so `/v2` has
somewhere to go. It costs nothing up front.

**ETags need a stable computation.** Hash the *canonical* content
(sorted keys, stable serialization). If your ETag changes when nothing
meaningful did (e.g. dict ordering, a timestamp field that always updates),
clients never get `304`s and you've added overhead for no benefit.

## Hands-on exercises

Continue in the `api-layer` project.

### 1. Refactor action-URLs into resource semantics

Suppose you have (or imagine) `POST /createTask`, `POST /getTask`, `POST
/deleteTaskNow`. Rewrite them as `POST /tasks`, `GET /tasks/{id}`, `DELETE
/tasks/{id}`. Confirm each uses the correct method and status (module 07).
Expected: the URLs now name resources, the methods carry the verbs, and any
REST-literate client can predict the behavior.

### 2. Model a "cancel" without a verb URL

Add order cancellation *without* a `POST /cancelOrder`. Implement it as
`PATCH /orders/{id}` with `{"status": "cancelled"}`, validating the state
transition in the service (can't cancel an already-shipped order → domain
error → `409`). Expected: the state change is expressed as a resource
modification, not a custom verb.

### 3. Nested vs. flat relationships

Expose user orders two ways: `GET /users/{id}/orders` (nested) and `GET
/orders?user_id={id}` (flat filter). Implement both against the same service
method. Expected: identical results; note in a comment when you'd prefer each
(nesting for clear ownership navigation, filter for combining criteria).

### 4. URI path versioning

```python
from fastapi import APIRouter
v1 = APIRouter(prefix="/v1", tags=["v1"])
v2 = APIRouter(prefix="/v2", tags=["v2"])

@v1.get("/orders/{oid}")
async def get_order_v1(oid: int): return {"id": oid, "total": 100}

@v2.get("/orders/{oid}")
async def get_order_v2(oid: int): return {"id": oid, "amount": {"value": 100, "currency": "USD"}}

app.include_router(v1); app.include_router(v2)
```

Call `/v1/orders/42` and `/v2/orders/42`. Expected: different response shapes
at different versions, both live simultaneously — old clients unaffected by
the v2 redesign.

### 5. Content negotiation with 406

```python
from fastapi import Request, HTTPException

@router.get("/orders/{oid}/report")
async def report(oid: int, request: Request):
    accept = request.headers.get("accept", "application/json")
    if "application/json" not in accept and "*/*" not in accept:
        raise HTTPException(status_code=406, detail="only application/json is available")
    return {"order": oid, "report": "..."}
```

Call with `Accept: application/json` (works) and `Accept: application/xml`
(`406`). Expected: the server refuses to pretend it can produce XML rather
than silently sending JSON with the wrong `Content-Type`.

### 6. ETags and 304

Implement the ETag pattern from Concepts on `GET /orders/{id}`. First request:
note the `ETag` header. Second request with `-H "If-None-Match: <that etag>"`:

```bash
curl -i localhost:8000/orders/1                       # 200 + ETag: abc123
curl -i localhost:8000/orders/1 -H "If-None-Match: abc123"   # 304, empty body
```

Expected: the second returns `304` with no body. Now modify the order and
re-request with the old ETag — expected `200` with a *new* ETag (the content
changed, so the cache is stale).

### 7. Optimistic concurrency with If-Match

Extend the update endpoint to require `If-Match: <etag>` and return `412
Precondition Failed` if the current ETag differs. Simulate two clients:
client A reads (gets etag), client B updates (etag changes), client A tries to
update with its *stale* etag. Expected: A's update is rejected `412` — the
lost-update race is prevented. Write down why this is safer than
last-write-wins.

### 8. Sparse fieldsets

Add `?fields=id,total` support to `GET /orders`: parse the comma-separated
list, whitelist it against allowed fields (module 07 discipline), and return
only those keys. Call `?fields=id` and `?fields=id,total`. Expected: responses
contain only the requested (allowed) fields; an unknown field name → `400`.

### 9. Diagnose and fix

This API "works" but violates REST in four ways that will bite clients: it
uses action-verb URLs, returns `200` for errors, has no versioning so a shape
change will break clients, and its ETag changes on every request so `304`
never happens. Identify and fix each.

```python
@router.post("/getOrder")                              # (A)
async def get_order(oid: int):
    order = ORDERS.get(oid)
    if not order:
        return {"status": "error", "message": "not found"}   # (B) 200 for error
    import time
    etag = str(time.time())                            # (D) changes every call
    return {"data": order, "etag": etag}

@router.post("/updateOrderTotal")                      # (A) again; no /v1 (C)
async def update_total(oid: int, total: float):
    ORDERS[oid]["total"] = total
    return {"status": "ok"}
```

<details>
<summary>Solution</summary>

Four REST violations:

1. **(A) Action-verb URLs.** `POST /getOrder` and `POST /updateOrderTotal`
   bury the verb in the path. Use `GET /orders/{oid}` and `PATCH
   /orders/{oid}` — method carries the verb, URL names the resource.
2. **(B) `200` for a not-found error.** Returning `200 {"status": "error"}`
   lies to HTTP-aware clients/caches. A missing resource is `404`; use the
   centralized envelope (module 06).
3. **(C) No versioning.** There's no `/v1`, so the first backward-incompatible
   change breaks every client. Mount routers under a version prefix from the
   start.
4. **(D) Unstable ETag.** `str(time.time())` changes every call, so
   `If-None-Match` never matches and `304` never happens — pure overhead.
   Hash the canonical content instead.

```python
v1 = APIRouter(prefix="/v1", tags=["orders"])

@v1.get("/orders/{oid}")
async def get_order(oid: int, request: Request, response: Response):
    order = ORDERS.get(oid)
    if order is None:
        raise OrderNotFound()                     # -> 404 envelope
    etag = hashlib.sha256(repr(sorted(order.items())).encode()).hexdigest()[:16]
    if request.headers.get("if-none-match") == etag:
        return Response(status_code=304)
    response.headers["ETag"] = etag
    return order

@v1.patch("/orders/{oid}")
async def update_total(oid: int, body: OrderUpdate):
    ...
```

</details>

## Independent challenge

No code given. Design and implement `/v1/projects` and its nested
`/v1/projects/{id}/tasks` as a small, fully RESTful sub-API. Model every
operation with the correct method and status code, express "archive a project"
as a **state change** rather than a verb URL, support both nested access and a
flat filtered `/v1/tasks?project_id=` view, add ETag-based revalidation to the
single-project GET, and return `406` for any `Accept` you can't satisfy.
Reuse module 07's pagination/filtering/sorting on the collection endpoints and
module 06's consistent error envelope for every failure. Then write a short
paragraph justifying your versioning choice against the four approaches in
this module, and describe what would have to change if you needed a breaking
`/v2` of the project schema while keeping `/v1` alive.

<details>
<summary>Hint</summary>

For "archive," add `status` to the project with an allowed transition set and
expose it via `PATCH /v1/projects/{id} {"status": "archived"}`, rejecting
illegal transitions with a domain error → `409`. For the `/v2` question, the
answer is that URI versioning lets you mount a second router with new schemas
while the `/v1` router and its models stay frozen — no shared response model
between versions, so v1 clients never see v2's changes.

</details>

## Common mistakes & troubleshooting

- **Action-verb URLs.** `POST /doThing` throws away REST predictability. Name
  resources; let HTTP methods be the verbs.
- **`200` for errors.** Returning `200` with an error body lies to clients,
  proxies, and caches. Use the correct `4xx`/`5xx` status.
- **Over-nesting.** `/a/1/b/2/c/3` is unwieldy. Nest one level; link deeper
  resources or use flat filters.
- **No versioning until it's too late.** Start at `/v1` so breaking changes
  have somewhere to go. Retrofitting versioning onto unversioned clients is
  painful.
- **Unstable ETags.** An ETag that changes when content didn't (timestamps,
  dict ordering) means `304` never fires — overhead with no benefit. Hash
  canonical content.
- **Sending a body with `304`.** Defeats the purpose; `304` is empty by
  definition.
- **Silently ignoring `Accept`.** Returning JSON to a client that demanded XML
  is wrong; return `406` if you can't satisfy the request.
- **Misclassifying `4xx`/`5xx`.** `500` for bad input breaks client retries
  and your alerting. Client errors are `4xx`; only real server faults are
  `5xx`.

## Checkpoint quiz

Write down your answer to each question before expanding it — checking without attempting first is the single easiest way to fool yourself into thinking you've learned this.

1. Why is `GET /orders/42` more "RESTful" than `POST /getOrder` with a body,
   and what concrete benefit does a client get from the former?
2. When would you model a relationship as a nested path versus a flat query
   filter?
3. Name the four API versioning approaches and give the main tradeoff of URI
   path versioning (the pragmatic default).
4. Walk through an ETag revalidation: what does the server send first, what
   does the client send back, and what does a `304` response contain?
5. What's the difference between `If-None-Match` (caching) and `If-Match`
   (concurrency), and what status does each failure/miss produce?
6. Why is returning `200` with `{"error": ...}` for a failure a real problem,
   not just a style issue?
7. Give three techniques for reducing the size of a large collection response,
   and which module each comes from.

<details>
<summary>Answers</summary>

1. `GET /orders/42` uses the resource URL + standard method, so any
   REST-literate client already knows it fetches order 42, that it's safe and
   idempotent (cacheable, retryable), and how errors will look — no need to
   read your docs. `POST /getOrder` hides the verb in the body and loses
   caching/idempotency/predictability.
2. Nested path for a clear ownership/containment hierarchy the client
   navigates (`/users/42/orders`); flat query filter for cross-cutting queries
   that combine criteria (`/orders?user_id=42&status=open`). Many APIs offer
   both; avoid nesting more than one level.
3. URI path (`/v1/...`), header (`Accept-Version`), query string
   (`?version=`), media-type (`Accept: application/vnd.api.v2+json`). URI
   path is most explicit/toolable/cacheable but technically gives one resource
   multiple URLs (violates purist "one URI per resource").
4. The server sends the resource with an `ETag` header. On the next request
   the client sends `If-None-Match: <etag>`. If unchanged, the server replies
   `304 Not Modified` with *no body*, and the client reuses its cached copy.
5. `If-None-Match` is for caching: "only send the body if the ETag changed,"
   miss → `304`. `If-Match` is for optimistic concurrency: "only apply this
   update if the ETag still matches," failure → `412 Precondition Failed`
   (someone else changed it first).
6. HTTP-aware clients, proxies, and caches key off the status code. A `200`
   error body makes them treat a failure as success — retry logic won't fire,
   caches may store the error, monitoring won't flag it. The status code is
   machine-readable semantics and must be truthful.
7. Compression (module 04), pagination with a capped page size (module 07),
   and sparse fieldsets / field selection (module 08). Also avoiding
   over-nesting/over-fetching and streaming for huge bodies (module 08).

</details>

## Further reading & sources

- [MDN — HTTP conditional requests](https://developer.mozilla.org/en-US/docs/Web/HTTP/Conditional_requests) - how `ETag`/`If-None-Match` (caching) and `If-Match` (concurrency) work end to end.
- [MDN — ETag](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/ETag) - the validator header, strong vs weak ETags, and stable computation.
- [MDN — Content negotiation](https://developer.mozilla.org/en-US/docs/Web/HTTP/Content_negotiation) - the `Accept`/`Content-Type` mechanism and when to return `406`.
- [Microsoft REST API Guidelines](https://github.com/microsoft/api-guidelines/blob/vNext/Guidelines.md) - an industry reference for resource modeling, versioning, and error conventions.
- [Google API Design Guide — Resource-oriented design](https://cloud.google.com/apis/design/resources) - modeling APIs around resources and standard methods rather than RPC verbs.
- [FastAPI — Bigger Applications (routers)](https://fastapi.tiangolo.com/tutorial/bigger-applications/) - mounting versioned routers (`/v1`, `/v2`) side by side.

## Next

[09-openapi-standards](../09-openapi-standards/README.md) — you've been
designing against a contract in your head; now you'll make it explicit with
OpenAPI: what the spec is, how FastAPI generates it, the tooling ecosystem,
and API-first development.
