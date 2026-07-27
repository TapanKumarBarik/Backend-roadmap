# Module 07: CRUD Deep Dive

## Why this matters

CRUD — Create, Read, Update, Delete — is the backbone of almost every API you
will ever write. It sounds trivial ("just save and fetch some rows"), and
that's exactly why it's done badly so often. The gap between a toy CRUD
endpoint and a production-grade one is enormous, and it lives entirely in the
details: *which* status code does a successful create return, and why does it
matter that it's `201` and not `200`? What happens when a client asks for a
resource that doesn't exist — `404`, or an empty `200`? When you have a
million rows, how does the client page through them without your database
melting? How does search differ from filtering, and why does naive offset
pagination silently break when data is being inserted underneath it?

Every one of these has a *correct* answer rooted in HTTP semantics (track 01)
and REST conventions (module 08, next). Get them right and clients can reason
about your API without reading your source: a `201` with a `Location` header
means "I made the thing, here's where it lives"; a `204` means "done, nothing
to say"; a `409` means "that conflicts with current state." Get them wrong and
every client integration becomes guesswork and special-casing.

The other half of this module is the stuff that turns a CRUD endpoint into
something safe to expose to the internet: **pagination** so a `GET` collection
can't return a million rows at once, **filtering/sorting/search** so clients
get what they need without over-fetching, and the production best practices —
payload size limits, redacting sensitive fields, auth on *every* endpoint,
consistent response formats — that you've been building toward across this
whole track. This is where validation (00–02), middleware (03–04), context
(05), and layering (06) all come together into real, complete endpoints.

## Concepts

### CRUD → HTTP methods → status codes

Each CRUD operation maps to an HTTP method and a small set of correct status
codes. Memorize this table; it's the contract clients rely on.

- **Create → `POST`** → `201 Created` on success (with a `Location` header
  pointing at the new resource), `400`/`422` on invalid input, `409` on a
  conflict (e.g. duplicate unique key).
- **Read one → `GET /things/{id}`** → `200 OK` with the resource, `404 Not
  Found` if it doesn't exist. Never return `200` with an empty body for a
  missing resource — that's a lie clients can't detect.
- **Read many → `GET /things`** → `200 OK` with a (paginated) collection.
  An empty collection is still `200` with `[]`, *not* `404` — the collection
  exists, it's just empty.
- **Update → `PUT` (full replace) / `PATCH` (partial)** → `200 OK` with the
  updated resource (or `204` if you return nothing), `404` if the target
  doesn't exist, `409` on a conflict.
- **Delete → `DELETE`** → `204 No Content` on success (nothing to return),
  `404` if it didn't exist (or `204` idempotently — a choice you document).

```python
from fastapi import APIRouter, Depends, status, Response

router = APIRouter(prefix="/tasks", tags=["tasks"])

@router.post("", status_code=status.HTTP_201_CREATED, response_model=TaskOut)
async def create_task(body: TaskCreate, response: Response, svc=Depends(get_task_service)):
    task = svc.create(body)
    response.headers["Location"] = f"/tasks/{task.id}"   # where the new thing lives
    return task

@router.delete("/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_task(task_id: int, svc=Depends(get_task_service)):
    svc.delete(task_id)          # raises TaskNotFound -> mapped to 404 centrally
    # 204: no body
```

### PUT vs. PATCH: replace vs. modify

`PUT` means "replace the entire resource with this representation" — omit a
field and it's set to its default/null. `PATCH` means "apply these partial
changes" — omit a field and it's left untouched. This distinction is real and
clients depend on it. In Pydantic you model them differently: `PUT` uses a
model where fields are required; `PATCH` uses a model where every field is
`Optional` and you apply only the ones actually sent.

```python
class TaskUpdate(BaseModel):          # PATCH: everything optional
    title: str | None = None
    done: bool | None = None

@router.patch("/{task_id}", response_model=TaskOut)
async def patch_task(task_id: int, body: TaskUpdate, svc=Depends(get_task_service)):
    changes = body.model_dump(exclude_unset=True)   # ONLY fields the client sent
    return svc.update(task_id, changes)
```

`exclude_unset=True` is the key: it distinguishes "field omitted" from "field
explicitly set to null," so a `PATCH` doesn't accidentally wipe fields the
client never mentioned.

### Offset pagination

The simplest scheme: `?limit=20&offset=40` returns rows 41–60. Easy to
implement, easy to jump to page N. Its weaknesses matter: deep offsets are
slow (the database still scans and discards `offset` rows), and it's unstable
under concurrent inserts/deletes — if a row is inserted before your current
page between requests, you'll see a duplicate or skip a row.

```python
from fastapi import Query

@router.get("", response_model=Page[TaskOut])
async def list_tasks(limit: int = Query(20, ge=1, le=100),
                     offset: int = Query(0, ge=0),
                     svc=Depends(get_task_service)):
    items, total = svc.list(limit=limit, offset=offset)
    return {"items": items, "limit": limit, "offset": offset, "total": total}
```

Note `le=100` — you **cap** the page size so a client can't request a million
rows in one call. That cap is a production must, not a nicety.

### Cursor pagination

For large or fast-changing datasets, cursor (a.k.a. keyset) pagination is
stable and fast. Instead of "skip N rows," the client passes an opaque
**cursor** pointing at the last item it saw, and you return the next page
after it. No offset scan, and inserts elsewhere don't shift the window.

```python
@router.get("", response_model=CursorPage[TaskOut])
async def list_tasks(limit: int = Query(20, ge=1, le=100),
                    cursor: str | None = None, svc=Depends(get_task_service)):
    # cursor encodes the last-seen sort key (e.g. the id or created_at of the last row)
    items = svc.list_after(cursor=cursor, limit=limit + 1)  # fetch one extra to detect "more"
    has_more = len(items) > limit
    items = items[:limit]
    next_cursor = encode_cursor(items[-1]) if has_more else None
    return {"items": items, "next_cursor": next_cursor}
```

The tradeoff: you can't jump to "page 50" directly, only walk forward
(sometimes backward). For infinite-scroll feeds and huge tables, that's a fine
price for stability and speed. Rule of thumb: offset for small admin lists
where page-jumping matters; cursor for large or real-time collections.

### Filtering, sorting, and search — three different things

Beginners conflate these; they're distinct:

- **Filtering** narrows by exact/range criteria on fields:
  `?status=open&priority=high&created_after=2026-01-01`. Each is a `WHERE`
  clause. Validate the allowed fields and operators — never interpolate them
  into SQL (module 01).
- **Sorting** orders results: `?sort=-created_at,title` (a common convention:
  leading `-` = descending). **Whitelist** sortable fields — accepting an
  arbitrary column name is an injection and information-disclosure risk.
- **Search** is fuzzy/full-text matching over one or more fields:
  `?q=quarterly+report`. It's ranked and approximate, not an exact filter.
  (Real full-text search is track 07 of the curriculum; here, a `LIKE`/`ILIKE`
  or simple contains is enough to understand the shape.)

```python
ALLOWED_SORT = {"created_at", "title", "priority"}   # whitelist!

@router.get("", response_model=Page[TaskOut])
async def list_tasks(
    status_: str | None = Query(None, alias="status"),
    q: str | None = None,
    sort: str = "-created_at",
    limit: int = Query(20, ge=1, le=100), offset: int = Query(0, ge=0),
    svc=Depends(get_task_service),
):
    field = sort.lstrip("-")
    if field not in ALLOWED_SORT:
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail=f"cannot sort by {field}")
    descending = sort.startswith("-")
    items, total = svc.query(status=status_, search=q, sort_field=field,
                            descending=descending, limit=limit, offset=offset)
    return {"items": items, "limit": limit, "offset": offset, "total": total}
```

### Production best practices for CRUD

The checklist that separates real endpoints from toys:

- **Strict validation on every write** (modules 00–02): never trust the body.
- **Consistent response formatting** (module 06): one success envelope, one
  error envelope, across every endpoint.
- **Limit payload size**: cap request bodies (module 04's `413`) and cap page
  sizes (`le=` on `limit`) so no single call can exhaust memory.
- **Redact sensitive fields**: the response model must *not* include password
  hashes, internal flags, other users' data. Use a separate `*Out` model that
  omits them — don't return the raw DB row.
- **Auth on every endpoint** (modules 04–05): even read endpoints. A public
  read is a *decision*, not a default. Apply auth via router dependencies so
  you can't forget one.
- **Idempotency where it matters**: `PUT` and `DELETE` should be idempotent
  (repeating them has the same effect); `POST` is not, so consider
  idempotency keys for critical creates (track 10 goes deep).

### Redacting fields with separate input/output models

Never serialize your database entity directly. Define what goes *in*
(`TaskCreate`) and what comes *out* (`TaskOut`) separately, so internal or
sensitive fields simply cannot leak:

```python
class UserOut(BaseModel):
    id: int
    email: str
    display_name: str
    # NOTE: no password_hash, no is_internal, no created_by_admin_id
    model_config = {"from_attributes": True}   # build from an ORM/attribute object
```

If a field isn't on `UserOut`, it can't be returned — leaking becomes
impossible by construction, not by remembering to strip it each time.

## Command reference

| Pattern | Purpose | Example |
|---|---|---|
| `status_code=status.HTTP_201_CREATED` | Correct create status | on `@router.post` |
| `response.headers["Location"]` | Point at the newly created resource | `f"/tasks/{id}"` |
| `status.HTTP_204_NO_CONTENT` | Successful delete, no body | on `@router.delete` |
| `body.model_dump(exclude_unset=True)` | PATCH: only fields the client sent | partial update |
| `Query(20, ge=1, le=100)` | Validated + capped page size | offset/limit |
| whitelist set for `sort` | Prevent arbitrary-column injection | `ALLOWED_SORT` |
| `Query(None, alias="status")` | Map a reserved/renamed query param | `status_` |
| separate `*Out` model | Redact sensitive fields by construction | `UserOut` |
| `response_model=Page[T]` | Consistent, documented collection shape | generic envelope |

**`Location` on 201 is part of the contract.** REST convention says a
successful `POST` that creates a resource returns `201` with a `Location`
header (and usually the created body). Clients use it to fetch or link the new
resource without guessing the URL.

**Cap `limit`, always.** `Query(20, ge=1, le=100)` rejects `?limit=100000`
with `422`. Without the cap, one client can request your entire table and
exhaust memory — an accidental (or deliberate) denial of service.

**Whitelist sort/filter fields.** Passing a raw `?sort=` value into an `ORDER
BY` (or a `?filter_field=` into a `WHERE`) lets a client reference columns
they shouldn't see or inject SQL. Validate against an allowed set and reject
anything else with `400`.

**`exclude_unset` vs. `exclude_none`.** For `PATCH`, use `exclude_unset=True`
(only fields the client actually included). `exclude_none=True` is different —
it drops fields that are `None`, which would prevent a client from
*explicitly* setting a field to null. Know which semantics you want.

## Hands-on exercises

Continue in the `api-layer` project, building on the layered task/order code
from module 06.

### 1. Correct create semantics (201 + Location)

```python
@router.post("", status_code=status.HTTP_201_CREATED, response_model=TaskOut)
async def create_task(body: TaskCreate, response: Response, svc=Depends(get_task_service)):
    task = svc.create(body)
    response.headers["Location"] = f"/tasks/{task['id']}"
    return task
```

Create a task with `curl -i`. Expected: `201`, a `Location: /tasks/1` header,
and the created body. Confirm you did *not* get `200`.

### 2. Read semantics: 404 vs. empty 200

Add `GET /tasks/{id}` (returns `404` for a missing id via the centralized
`TaskNotFound` handler from module 06) and `GET /tasks` (returns `200` with
`[]` when empty). Delete all tasks, then call both. Expected: `GET
/tasks/999` → `404`; `GET /tasks` → `200` with an empty list. Write down *why*
these differ (a missing single resource is an error; an empty collection is a
valid state).

### 3. PATCH that doesn't clobber omitted fields

```python
class TaskUpdate(BaseModel):
    title: str | None = None
    done: bool | None = None

@router.patch("/{task_id}", response_model=TaskOut)
async def patch_task(task_id: int, body: TaskUpdate, svc=Depends(get_task_service)):
    changes = body.model_dump(exclude_unset=True)
    return svc.update(task_id, changes)
```

Create a task `{"title": "write report", "done": false}`. Then `PATCH` with
just `{"done": true}`. Expected: `title` is unchanged and `done` is now
`true`. Remove `exclude_unset=True` and repeat — observe `title` gets wiped to
`None`. That single flag is the whole correctness of PATCH.

### 4. Offset pagination with a capped limit

```python
@router.get("", response_model=Page[TaskOut])
async def list_tasks(limit: int = Query(20, ge=1, le=100), offset: int = Query(0, ge=0),
                    svc=Depends(get_task_service)):
    items, total = svc.list(limit=limit, offset=offset)
    return {"items": items, "limit": limit, "offset": offset, "total": total}
```

Create 30 tasks. Call `?limit=10&offset=0`, `?limit=10&offset=10`,
`?limit=10&offset=20`. Expected: three disjoint pages of 10. Then try
`?limit=100000` → `422` (the cap rejects it). Then `?limit=0` → `422`
(`ge=1`).

### 5. See offset pagination drift under inserts

Page 1 with `?limit=5&offset=0`, note the ids. Insert a new task that sorts to
the front (e.g. newest-first ordering). Now request page 2 with
`?limit=5&offset=5`. Expected: you'll see an item you already saw on page 1
(everything shifted down by one). Write down why this happens and why cursor
pagination avoids it.

### 6. Cursor pagination

Implement `list_after(cursor, limit)` in your service (cursor = the id of the
last-seen row; return rows with id > cursor, ordered by id). Then:

```python
@router.get("/feed", response_model=CursorPage[TaskOut])
async def feed(limit: int = Query(5, ge=1, le=50), cursor: int | None = None,
              svc=Depends(get_task_service)):
    rows = svc.list_after(cursor=cursor, limit=limit + 1)
    has_more = len(rows) > limit
    rows = rows[:limit]
    return {"items": rows, "next_cursor": rows[-1]["id"] if has_more else None}
```

Walk the feed: call `/feed`, take `next_cursor`, call `/feed?cursor=<that>`,
repeat until `next_cursor` is `null`. Now insert a new front task mid-walk and
confirm your forward walk is *not* disrupted (no dupes/skips) — the stability
win.

### 7. Filtering, sorting, search with a whitelist

Add `?status=`, `?q=`, and `?sort=` (with the `ALLOWED_SORT` whitelist from
Concepts). Test `?status=open`, `?q=report`, `?sort=title`, `?sort=-created_at`.
Then try `?sort=password_hash` and `?sort=1; DROP TABLE tasks`. Expected: the
first four work; the last two return `400` because the field isn't in the
whitelist — proving arbitrary columns can't be referenced.

### 8. Redact sensitive fields by construction

Give your task a hidden `internal_notes` field in the stored record but define
`TaskOut` *without* it. Fetch a task. Expected: `internal_notes` never appears
in any response, because it's not on the output model — leaking is impossible
by construction, not by remembering to strip it.

### 9. Diagnose and fix

This "works" in a demo but has four production bugs: a create returns the
wrong status, a delete leaks whether the row existed via inconsistent codes, a
list endpoint has no page cap, and the response returns the raw record
including a `password_hash`. Find and fix all four.

```python
from fastapi import APIRouter, Query
router = APIRouter()

USERS = {1: {"id": 1, "email": "a@x.com", "password_hash": "$2b$..."}}

@router.post("/users")                                    # (A)
async def create_user(body: UserCreate):
    uid = max(USERS) + 1
    USERS[uid] = {"id": uid, "email": body.email, "password_hash": hash(body.password)}
    return USERS[uid]                                     # (D)

@router.get("/users")
async def list_users(limit: int = Query(20), offset: int = 0):   # (C)
    rows = list(USERS.values())[offset: offset + limit]
    return rows                                           # (D) again

@router.delete("/users/{uid}")
async def delete_user(uid: int):
    if uid in USERS:
        del USERS[uid]
        return {"deleted": True}                          # (B) 200 with body
    return {"deleted": False}                             # (B) 200 for missing
```

<details>
<summary>Solution</summary>

Four fixes:

1. **(A) Create returns `200`, should be `201` + `Location`.** Add
   `status_code=status.HTTP_201_CREATED` and set
   `response.headers["Location"] = f"/users/{uid}"`.
2. **(B) Delete uses `200` with a body and can't signal "not found."**
   Successful delete should be `204 No Content` (no body); a missing id should
   be `404` (raise `UserNotFound`, mapped centrally). Returning `200
   {"deleted": false}` hides the error from clients.
3. **(C) `limit` has no cap.** `Query(20)` allows `?limit=100000000`. Use
   `Query(20, ge=1, le=100)` and `offset: int = Query(0, ge=0)` so page size
   is bounded and non-negative.
4. **(D) Responses leak `password_hash`.** Both endpoints return the raw
   record. Define `UserOut` (id, email — no hash) and set
   `response_model=UserOut` / `response_model=Page[UserOut]`. Now the hash
   cannot be serialized.

```python
@router.post("/users", status_code=status.HTTP_201_CREATED, response_model=UserOut)
async def create_user(body: UserCreate, response: Response):
    ...
    response.headers["Location"] = f"/users/{uid}"
    return USERS[uid]

@router.get("/users", response_model=Page[UserOut])
async def list_users(limit: int = Query(20, ge=1, le=100), offset: int = Query(0, ge=0)):
    ...

@router.delete("/users/{uid}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_user(uid: int):
    if uid not in USERS:
        raise UserNotFound()
    del USERS[uid]
```

</details>

## Independent challenge

No code given. Build a complete, production-shaped `GET /orders` collection
endpoint for the order resource you layered in module 06. It must support
offset pagination with a capped page size, filtering by `status` and a
`min_total` range, sorting by a **whitelisted** set of fields with the
leading-`-` descending convention, and a `q` search over the order's notes.
Return results in the **consistent success envelope** from module 06, redact
any internal fields with a dedicated `*Out` model, and require authentication
via a **router-level dependency** (module 05) so no endpoint in the group can
be exposed by accident. Then add a `POST /orders` that returns the correct
create semantics (status + `Location`). Reach back to module 01 to make sure
none of the filter/sort parameters can be turned into an injection, and to
module 02 to make sure a bad filter value comes back as an aggregated,
enveloped validation error rather than a `500`.

<details>
<summary>Hint</summary>

Keep every query parameter validated at the edge: `limit: int = Query(20,
ge=1, le=100)`, `sort` checked against an `ALLOWED_SORT` set with a `400` on a
miss, and `status` as an `Enum` so only known values parse. The whitelist is
your injection defense for sort/filter *field names*; parameterized queries
(module 01) defend the *values*. Attach auth once with
`APIRouter(dependencies=[Depends(require_user)])`.

</details>

## Common mistakes & troubleshooting

- **Wrong create status.** Returning `200` for a create. Use `201` with a
  `Location` header.
- **`404` for an empty collection.** An empty list is `200` with `[]`; `404`
  is only for a missing *single* resource.
- **PATCH clobbering omitted fields.** Forgetting `exclude_unset=True` wipes
  fields the client never sent. Always apply only the sent fields.
- **No page-size cap.** `limit` without `le=` lets a client request the whole
  table — memory exhaustion / DoS. Always cap it.
- **Arbitrary sort/filter columns.** Passing `?sort=` straight into `ORDER BY`
  is injection and info disclosure. Whitelist allowed fields.
- **Returning raw DB rows.** Leaks password hashes, internal flags, and
  fields you forgot about. Use a dedicated `*Out` model that omits them.
- **Deep offset pagination on huge tables.** Slow and drift-prone. Use cursor
  pagination for large/real-time collections.
- **Forgetting auth on read endpoints.** "It's just a GET" still exposes data.
  Auth every endpoint; make public reads a deliberate exception.

## Checkpoint quiz

Write down your answer to each question before expanding it — checking without attempting first is the single easiest way to fool yourself into thinking you've learned this.

1. What status code and header should a successful create return, and why not
   just `200`?
2. Why is a missing single resource a `404` but an empty collection a `200`
   with `[]`?
3. What does `exclude_unset=True` do for a PATCH, and what bug appears without
   it?
4. Why must you cap the `limit` query parameter, and what happens if you
   don't?
5. Contrast offset and cursor pagination: which is stable under concurrent
   inserts, and why?
6. Why must sort/filter field names be whitelisted rather than passed through
   to the query?
7. How does using a dedicated `*Out` response model make leaking a
   password hash impossible rather than merely unlikely?

<details>
<summary>Answers</summary>

1. `201 Created` with a `Location` header pointing at the new resource (and
   usually the created body). `200` doesn't signal that a new resource was
   created or where it lives; `201`+`Location` is the contract clients rely on
   to fetch/link the new thing.
2. A request for a specific resource that doesn't exist is an error the client
   should know about (`404`). A collection always exists as a concept even
   when it currently holds nothing, so it returns `200` with `[]` — an empty
   result is a valid state, not an error.
3. It serializes only the fields the client actually sent, so a PATCH updates
   just those and leaves omitted fields untouched. Without it, omitted fields
   come through as their defaults (often `None`) and overwrite/wipe stored
   values the client never intended to change.
4. So one call can't request the entire table. Without a cap (`le=`), a client
   can set `?limit=100000000` and exhaust memory/CPU — an accidental or
   deliberate denial of service.
5. Cursor (keyset) is stable. Offset recomputes "skip N rows" each request, so
   an insert before the current window shifts everything and you see a
   duplicate or skip a row. Cursor asks for rows *after a specific key*, so
   inserts elsewhere don't move the window.
6. Passing a raw field name into `ORDER BY`/`WHERE` lets a client reference
   columns they shouldn't see (info disclosure) or inject SQL. A whitelist
   restricts sorting/filtering to known-safe fields and rejects anything else
   with `400`.
7. If a field isn't declared on the output model, it can't be serialized into
   the response — leaking becomes structurally impossible, rather than
   depending on someone remembering to strip it from a raw DB row on every
   endpoint.

</details>

## Cumulative review

Closed-book. Don't reopen modules 00–07 while attempting these — the point is
to find out what actually stuck.

1. Trace a `POST /orders` request end to end through everything you've built:
   which layer validates the body (00–02), which middleware runs and in what
   order (03–04), where the current user comes from (05), which layer holds
   the "is there stock" rule (06), and what status code a successful create
   returns (07).
2. A future birth date, a malformed-JSON body, a request for `/orders/999`
   that doesn't exist, and a `?limit=999999` all get rejected. Give the
   correct status code for each and say which module's principle dictates it.
3. Your rate limiter sits *inside* auth and your logging sits *inside* both.
   Describe the two concrete failures this ordering causes and the correct
   order (03–04).
4. Why must a service (06) not raise `HTTPException`, and how does that
   decision interact with the "consistent error envelope" you return for both
   validation errors (02) and domain errors (06)?
5. Explain why a module-level global for the current user (05) is
   catastrophic under concurrency, and how `PATCH` with `exclude_unset` (07)
   is a *different* kind of "only touch what was given" discipline than the
   one that fixes the global.
6. You need to expose a `users` collection. List every production safeguard
   from this track that applies before you'd call it safe to ship (validation,
   payload/page caps, redaction, auth, consistent envelope, injection
   defense) and name the module each comes from.
7. Offset pagination shows a client a duplicate row between page 1 and page 2.
   Explain the mechanism, and explain precisely why cursor pagination doesn't
   have this problem (07).
8. A colleague puts business rules, DB access, and `HTTPException`s all in the
   route function, and adds `@app.middleware` to strip whitespace from one
   specific endpoint's body. Name every layering/placement principle they
   violated and where each piece of logic actually belongs (01, 03, 06).

<details>
<summary>Answers</summary>

1. Pydantic validates the body at the handler boundary (00–02). Middleware
   runs outer→inner: error handling, logging, CORS, rate limiting, auth
   (03–04). The current user is injected via `Depends(get_current_user)`
   reading `request.state.user` seeded by auth (05). The stock rule lives in
   `OrderService.place_order` (06). A successful create returns `201` with a
   `Location` header (07).
2. Future birth date → `422` (semantic validation, module 00);
   malformed JSON → `400` (failed transformation is a client error, module
   02); missing `/orders/999` → `404` (read semantics, module 07);
   `?limit=999999` → `422` (capped/validated query param, modules 01 & 07).
3. Rate limiting inside auth means brute-force attempts hit expensive
   auth/password logic un-throttled (resource exhaustion). Logging inside both
   means rate-limited/unauthorized requests are never logged (blind to
   attacks). Correct order outer→inner: error handling → logging → CORS →
   rate limiting → auth → handler.
4. A service must stay HTTP-ignorant so it's reusable (jobs, scripts) and
   unit-testable without a server; raising `HTTPException` couples it to
   FastAPI. It raises domain exceptions, and centralized exception handlers
   map both those and `RequestValidationError` into one shared error envelope
   — so validation and domain errors look identical to clients.
5. A global is app-scoped and shared across concurrent requests, so request
   B overwrites the current user between A's write and A's read — A acts as B.
   `exclude_unset` is about not overwriting *stored fields the client didn't
   send* during a PATCH; both are "only touch what was explicitly provided,"
   but one is about request isolation (use `request.state`/DI) and the other
   about partial-update semantics (use `exclude_unset`).
6. Strict input validation (00–02), request body size cap → `413` (04),
   page-size cap via `le=` on limit (07), redaction via a dedicated `*Out`
   model (07), auth on every endpoint via router dependency (04–05),
   consistent success/error envelope (06), sort/filter field whitelisting +
   parameterized queries for injection defense (01, 07).
7. Offset "skip N rows" is computed fresh each request; if a row is inserted
   before your window between requests, everything shifts down by one, so an
   item from page 1 reappears at the top of page 2 (or one is skipped). Cursor
   pagination asks for rows *after a specific key* (the last-seen id), so
   inserts elsewhere don't move the window — you always continue after the
   exact row you left off at.
8. Fat handler doing rules + DB + HTTP violates layering (06): rules belong in
   a service (raising domain exceptions), DB access belongs in a repository,
   the handler should be a thin adapter. Using global middleware to trim one
   endpoint's body misuses middleware (03) — that's an endpoint-specific
   transform that belongs in a Pydantic validator/dependency (01), not a
   pipeline-wide middleware that runs for every request.

</details>

## Next

[08-restful-architecture-and-best-practices](../08-restful-architecture-and-best-practices/README.md)
— you can build correct CRUD endpoints; now you'll step up to designing the
whole API as a coherent, RESTful system: resource modeling, versioning,
content negotiation, caching with ETags, and designing spec-first.
