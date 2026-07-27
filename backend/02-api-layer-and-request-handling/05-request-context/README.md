# Module 05: Request Context

## Why this matters

In module 04 your auth middleware did something quietly important: it verified
a token and wrote `request.state.user = user` so that *later* code — the
handler, a service, a logger — could find out who's making the request without
re-verifying the token. That little stash is **request-scoped state**, and
this module is about doing it deliberately and well. Every request is a
short-lived world of its own: it has *its* authenticated user, *its* trace ID,
*its* deadline, *its* set of permission checks. That per-request world needs to
be reachable from many layers without every function taking twelve parameters
or, worse, reaching into a global variable that gets clobbered by the next
concurrent request.

The naive alternatives are both bad. **Threading everything through
parameters** (`def create_order(body, current_user, request_id, db, trace_id,
...)`) couples every function to every piece of context and makes signatures
unbearable. **Global variables** are catastrophic under concurrency: your
server handles many requests at once, and a module-level `current_user`
written by request A gets overwritten by request B a millisecond later —
request A now acts as the wrong person. Request context is the disciplined
middle path: a per-request container that the framework scopes correctly and
that layers can read from without tight coupling.

FastAPI's answer is **dependency injection** via `Depends(...)`, and it's one
of the framework's best features. Instead of a handler reaching *out* to grab
context, the context is *injected into* the handler (and into services)
declaratively. `current_user: User = Depends(get_current_user)` says "before
you run me, resolve the current user and hand it to me." This inverts the
coupling: your handler declares *what it needs*, and FastAPI wires it up. This
module teaches the request lifecycle, what belongs in context (and what
absolutely doesn't), timeouts and cancellation, and the DI patterns that make
it all clean.

## Concepts

### The lifecycle of a request, and what "request-scoped" means

A request is born when bytes arrive, and it dies when the response is sent.
"Request-scoped" state lives exactly that long: created during this request,
readable by anything handling this request, and gone when it ends —
critically, *not* shared with any other concurrent request. The lifecycle,
layer by layer:

```
arrive → [middleware pre-request] → [dependencies resolve] → [handler] →
         [dependencies clean up]  → [middleware post-response] → sent
```

Middleware (module 03/04) can seed context early (request ID, user).
Dependencies resolve just before the handler and can also *produce* context
(load the user, open a DB session). The handler and any services it calls read
that context. Then cleanup runs (close the DB session) and the response goes
out. Everything in that window is one isolated request-world.

```
  GLOBAL (app-scoped)            REQUEST-SCOPED (isolated)
  ┌─────────────────┐            req A ─► [ user=A, id=A1, db=A ] ─► sent
  │ CURRENT_USER = ?│  ◄─ A & B   req B ─► [ user=B, id=B7, db=B ] ─► sent
  └─────────────────┘    clobber        each request its own world;
   B overwrites A's value               B can never see A's user
```

### What belongs in request context

Keep it **lightweight** and request-specific:

- **Request metadata**: method, path, client IP, user agent — mostly already
  on `request`.
- **Identity**: the authenticated user / session, injected by auth
  (middleware or a dependency).
- **Trace / request IDs**: a correlation id threaded through logs and
  downstream calls so you can reconstruct one request's whole journey.
- **Derived request-scoped data**: the result of a permission check, a
  resolved tenant/organization, a per-request DB session or transaction.

What does **not** belong: application-wide config (that's app-scoped, set
once at startup), caches meant to outlive the request, or anything you're
tempted to use as a general "pass data between unrelated functions" bag.
Context is not a global dumping ground; over-relying on it to smuggle data
around hides real dependencies and makes code hard to follow.

### `request.state` vs. dependency injection

Two ways to carry context, and they compose:

- **`request.state`** — an arbitrary attribute bag on the request object.
  Middleware writes to it (`request.state.request_id = rid`); anything with
  access to `request` reads it. Good for values middleware produces before
  routing. Downside: it's untyped and only reachable where you have the raw
  `request`.
- **Dependency injection (`Depends`)** — a function whose return value is
  injected into handlers (and other dependencies) by declaring it as a
  parameter. Typed, testable, reusable, and it shows up in your OpenAPI docs.
  This is the idiomatic FastAPI way to *derive and inject* context.

```python
from fastapi import Depends, Request, HTTPException

def get_current_user(request: Request):
    user = getattr(request.state, "user", None)   # seeded by auth middleware
    if user is None:
        raise HTTPException(status_code=401, detail="unauthorized")
    return user

@app.get("/me")
async def me(current_user=Depends(get_current_user)):
    return {"user": current_user}
```

The handler never reaches for the user; it *declares* it needs one, and
`get_current_user` provides it. That's dependency injection: the coupling is
inverted, and `get_current_user` is reusable across every route.

### Dependencies that produce and clean up context (`yield`)

Some context needs setup *and* teardown — a database session must be opened
before the handler and closed after, even if the handler raises. FastAPI
dependencies support this with `yield`:

```python
def get_db():
    db = SessionLocal()           # setup: runs before the handler
    try:
        yield db                  # the handler runs with `db` injected here
    finally:
        db.close()                # teardown: always runs after, even on error

@app.post("/orders")
async def create_order(body: OrderIn, db=Depends(get_db)):
    ...   # uses db; it's closed for you when the request ends
```

This is the clean answer to "acquire a resource for the duration of a request
and release it no matter what." The `finally` guarantees cleanup — the "clean
up after the request" best practice, enforced by the framework.

### Sharing context across layers without tight coupling

The power move: dependencies can depend on *other* dependencies. A permission
check depends on the current user; a service depends on the DB session and the
user. You compose them, and FastAPI resolves the whole graph per request:

```python
def require_admin(user=Depends(get_current_user)):
    if not user.get("is_admin"):
        raise HTTPException(status_code=403, detail="admin only")
    return user

@app.delete("/users/{user_id}")
async def delete_user(user_id: int, admin=Depends(require_admin), db=Depends(get_db)):
    ...
```

```
                       ┌─ Depends(require_admin) ─► Depends(get_current_user)
   delete_user handler ┤                                    │
                       └─ Depends(get_db)                   ▼
                                              reads request.state.user
   FastAPI resolves this graph per request (get_current_user cached, runs once)
```

`delete_user` doesn't know *how* the admin check works or *where* the user
came from — it declares "I need an admin and a db." The layers are decoupled:
you can change how users are loaded or how admin is determined without
touching a single handler. That's sharing context without coupling.

### Timeouts and cancellation

A request shouldn't run forever. If a client disconnects, or a downstream call
hangs, you want to *cancel* the work rather than tie up a worker. In async
Python this rides on `asyncio` cancellation and `asyncio.timeout`:

```python
import asyncio
from fastapi import HTTPException

@app.get("/slow")
async def slow():
    try:
        async with asyncio.timeout(2.0):     # cancel if it takes > 2s
            await do_expensive_thing()
    except asyncio.TimeoutError:
        raise HTTPException(status_code=504, detail="upstream timed out")
    return {"ok": True}
```

FastAPI/Starlette also propagate client-disconnect as cancellation to your
`await` points — an awaited call gets cancelled if the client goes away. The
concept to internalize: context isn't only *data*, it's also the request's
*deadline and cancellation signal*. Long-running handlers should be
cancellable and bounded, not open-ended.

### Best practices

- **Keep context lightweight.** Small, request-specific values. Not a cache,
  not app config, not a junk drawer.
- **Clean up after the request.** Use `yield` dependencies with `finally` (or
  middleware post-response) to release anything you acquired.
- **Don't over-rely on context to pass data.** If function B needs a value
  function A computed, prefer passing it explicitly or via a dependency, not
  stuffing it into a shared bag to smuggle across unrelated code. Hidden
  data-flow through context is a maintenance trap.
- **Never use module-level globals for per-request data.** They're shared
  across concurrent requests and will leak one user's data into another's.
  Use `request.state`, `Depends`, or `contextvars` (advanced) — all of which
  are correctly request-scoped.

## Command reference

| Pattern | What it does | Example |
|---|---|---|
| `request.state.x = v` | Middleware writes request-scoped data | `request.state.request_id = rid` |
| `getattr(request.state, "x", None)` | Safely read possibly-unset state | in a dependency |
| `param=Depends(fn)` | Inject `fn`'s return value into a handler | `user=Depends(get_current_user)` |
| dependency with `yield` | Setup + guaranteed teardown per request | `get_db` above |
| dependency-on-dependency | Compose context without coupling | `require_admin` depends on `get_current_user` |
| `dependencies=[Depends(fn)]` | Run a dependency for its side effect (no injection) | `@app.get("/x", dependencies=[Depends(rate_check)])` |
| `asyncio.timeout(seconds)` | Bound a block; cancel on overrun | `async with asyncio.timeout(2.0):` |
| `contextvars.ContextVar` | Request-safe implicit context (advanced) | for logging correlation |

**`Depends` at three levels.** You can attach a dependency to a single
*parameter* (inject its value), to a *path operation* via
`dependencies=[...]` (run it for validation/side effects without using the
return), or to an entire *router/app* via `APIRouter(dependencies=[...])` /
`FastAPI(dependencies=[...])` (apply to every route beneath it). Router-level
dependencies are how you protect a whole group of endpoints with one line —
the DI counterpart to auth middleware, but scoped to specific routes.

**Dependencies are cached per request.** If two dependencies both depend on
`get_current_user`, FastAPI calls it *once* per request and reuses the result
— so composing dependencies doesn't multiply work. (Disable with
`Depends(fn, use_cache=False)` when you truly need a fresh call.)

**`request.state` is not typed or autocompleted.** It's a plain attribute bag,
so a typo (`request.state.reqest_id`) fails silently as `AttributeError` or a
wrong `None`. Prefer deriving typed values through dependencies where it
matters; use `state` mainly as the middleware→dependency hand-off.

## Hands-on exercises

Continue in the `api-layer` project.

### 1. Read middleware-seeded state in a dependency

Keep the request-ID middleware from module 03. Add:

```python
from fastapi import Depends, Request

def get_request_id(request: Request) -> str:
    return getattr(request.state, "request_id", "unknown")

@app.get("/ctx")
async def ctx(request_id: str = Depends(get_request_id)):
    return {"request_id": request_id}
```

Call `GET /ctx`. Expected: the injected `request_id` matches the
`X-Request-ID` response header. The handler got the value without touching
`request` directly — decoupled.

### 2. Inject the current user

```python
from fastapi import Depends, Request, HTTPException

def get_current_user(request: Request):
    user = getattr(request.state, "user", None)
    if user is None:
        raise HTTPException(status_code=401, detail="unauthorized")
    return user

@app.get("/me")
async def me(current_user=Depends(get_current_user)):
    return {"user": current_user}
```

With the auth middleware from module 04 active, call `/me` with
`Authorization: Bearer secret` (returns the user) and without (`401`). The
dependency turns middleware-seeded state into a clean, reusable injection.

### 3. A `yield` dependency with guaranteed cleanup

Simulate a DB session so you can *see* setup and teardown:

```python
class FakeSession:
    def __init__(self): print("[db] open")
    def close(self): print("[db] close")

def get_db():
    db = FakeSession()
    try:
        yield db
    finally:
        db.close()

@app.get("/with-db")
async def with_db(db=Depends(get_db)):
    print("[handler] using db")
    return {"ok": True}
```

Call `/with-db` and watch the console. Expected order: `[db] open` →
`[handler] using db` → `[db] close`. Now make the handler `raise
RuntimeError("boom")` and confirm `[db] close` *still* prints — teardown runs
even on error.

### 4. Compose dependencies (permission check)

```python
def require_admin(user=Depends(get_current_user)):
    if not user.get("is_admin"):
        raise HTTPException(status_code=403, detail="admin only")
    return user

@app.delete("/admin/things/{thing_id}")
async def delete_thing(thing_id: int, admin=Depends(require_admin)):
    return {"deleted": thing_id, "by": admin["name"]}
```

Make `verify_token` (module 04) return a user *without* `is_admin` for one
token and *with* it for another. Call the endpoint with each. Expected:
non-admin → `403`, admin → `200`. `delete_thing` never checks admin-ness
itself — it declared the requirement.

### 5. Protect a whole router with one dependency

```python
from fastapi import APIRouter, Depends

admin_router = APIRouter(prefix="/admin", dependencies=[Depends(require_admin)])

@admin_router.get("/stats")
async def stats():
    return {"secret": "numbers"}

@admin_router.get("/audit")
async def audit():
    return {"secret": "log"}

app.include_router(admin_router)
```

Call `/admin/stats` and `/admin/audit` as non-admin (both `403`) and admin
(both `200`). Expected: one line protected two endpoints — router-level DI is
the per-route counterpart to global auth middleware.

### 6. Prove dependency caching

```python
def noisy_user(request: Request):
    print("[dep] resolving user")
    return getattr(request.state, "user", {"name": "anon"})

def a(u=Depends(noisy_user)): return u
def b(u=Depends(noisy_user)): return u

@app.get("/cache-test")
async def cache_test(x=Depends(a), y=Depends(b)):
    return {"x": x, "y": y}
```

Call `/cache-test`. Expected: `[dep] resolving user` prints **once**, not
twice, even though two dependencies both need it — FastAPI caches per request.

### 7. Bound a slow handler with a timeout

```python
import asyncio
from fastapi import HTTPException

async def do_expensive_thing(seconds: float):
    await asyncio.sleep(seconds)

@app.get("/timeout-demo")
async def timeout_demo(seconds: float = 1.0):
    try:
        async with asyncio.timeout(2.0):
            await do_expensive_thing(seconds)
    except asyncio.TimeoutError:
        raise HTTPException(status_code=504, detail="operation timed out")
    return {"slept": seconds}
```

Call `?seconds=1` (completes, `200`) and `?seconds=5` (`504` after ~2s).
Expected: the second is cancelled at the 2-second deadline rather than running
the full 5 seconds. The request's deadline is part of its context.

### 8. Diagnose and fix: a concurrency-unsafe global

This code "works" in local testing with one request at a time but corrupts
data under concurrent load — user A sometimes sees user B's name. Find the
root cause and fix it using request context properly.

```python
from fastapi import FastAPI, Request

app = FastAPI()
CURRENT_USER = {}      # (!) module-level global

@app.middleware("http")
async def load_user(request: Request, call_next):
    global CURRENT_USER
    token = request.headers.get("Authorization", "").removeprefix("Bearer ")
    CURRENT_USER = {"name": token or "anon"}   # (!) writes to shared global
    return await call_next(request)

@app.get("/name")
async def name():
    return {"name": CURRENT_USER["name"]}      # (!) reads the shared global
```

<details>
<summary>Solution</summary>

The bug is the **module-level `CURRENT_USER` global**. The server handles many
requests concurrently; request B overwrites `CURRENT_USER` between the moment
request A's middleware set it and the moment A's handler reads it. A then
returns B's name. Globals are app-scoped, not request-scoped — exactly the
wrong lifetime for per-request data.

Fix: put the value on `request.state` (request-scoped, isolated per request)
and read it via injection, never a global:

```python
@app.middleware("http")
async def load_user(request: Request, call_next):
    token = request.headers.get("Authorization", "").removeprefix("Bearer ")
    request.state.user = {"name": token or "anon"}   # per-request, isolated
    return await call_next(request)

def get_user(request: Request):
    return getattr(request.state, "user", {"name": "anon"})

@app.get("/name")
async def name(user=Depends(get_user)):
    return {"name": user["name"]}
```

Lesson: per-request data must live in per-request storage (`request.state`,
`Depends`, or `contextvars`) — never a module global, which is shared across
all concurrent requests and will leak one user's data into another's.

</details>

## Independent challenge

No code given. Build a small "current organization" context system for a
multi-tenant API. Every request carries an `X-Org-ID` header; a dependency
must resolve it into an org object (rejecting unknown orgs with `404`), and a
second dependency must verify the **authenticated user** (from module 04's
auth) actually belongs to that org (rejecting with `403` otherwise). Then
write two protected endpoints that both need the org *and* a per-request "DB
session" (a `yield` dependency), and confirm the session is opened once and
closed once per request even when a permission check rejects the request
early. Reuse the **dependency-caching** behavior from this module so the org
is resolved only once no matter how many dependencies need it, and reuse
module 04's idea that this is the **per-route** counterpart to auth
middleware.

<details>
<summary>Hint</summary>

Compose: `get_org` depends on nothing but the header; `require_org_member`
depends on both `get_current_user` and `get_org`. Attach
`require_org_member` at the *router* level so both endpoints are protected by
one line. For the "closed even on early rejection" guarantee, make sure the
`get_db` `yield`/`finally` teardown runs — dependencies with `yield` clean up
even when a *later* dependency or the handler raises, but a dependency that
raises *before* `get_db` resolves means `get_db` never opened, which is also
fine. Order your `dependencies=[...]` so the cheap checks fail first.

</details>

## Common mistakes & troubleshooting

- **Module-level globals for per-request data.** Shared across concurrent
  requests; leaks one user's data into another's. Use `request.state` /
  `Depends` / `contextvars`.
- **Threading context through every function parameter.** Couples everything
  and bloats signatures. Inject via `Depends` instead.
- **Forgetting cleanup.** Resources acquired per request (DB sessions, files)
  must be released. Use a `yield` dependency with `finally`.
- **Using context as a junk drawer.** Stuffing unrelated data into
  `request.state` to smuggle it between functions hides real dependencies.
  Keep context lightweight and pass data explicitly where you can.
- **Typos in `request.state`.** It's untyped; `request.state.reqest_id` fails
  silently. Prefer typed dependencies for values that matter.
- **Unbounded handlers.** A handler with no timeout on a downstream call can
  tie up a worker forever. Bound long operations with `asyncio.timeout` and
  make them cancellable.
- **Assuming a dependency runs multiple times.** It's cached per request by
  default; if you truly need a fresh call, pass `use_cache=False`.

## Checkpoint quiz

Write down your answer to each question before expanding it — checking without attempting first is the single easiest way to fool yourself into thinking you've learned this.

1. What does "request-scoped" mean, and why is a module-level global the wrong
   place to store the current user?
2. Name three things that belong in request context and one thing that does
   not.
3. What's the difference between `request.state` and a `Depends` dependency
   for carrying context, and when do you use each?
4. Why does a dependency written with `yield` guarantee cleanup even when the
   handler raises?
5. How does dependency composition let a handler require an admin user
   *without* the handler knowing how admin-ness is determined?
6. If two dependencies both depend on `get_current_user`, how many times does
   it run per request, and why does that matter?
7. What are the two things "request context" includes besides data — i.e.,
   what does a request's deadline/cancellation have to do with context?

<details>
<summary>Answers</summary>

1. It means the data lives only for the duration of one request and is
   isolated from other concurrent requests. A module-level global is
   app-scoped and shared across all requests running at once, so a concurrent
   request overwrites it — one user ends up seeing another's data.
2. Belongs: authenticated user/session, trace/request ID, per-request DB
   session, resolved tenant, request metadata, a permission-check result.
   Does not: application-wide config, long-lived caches, or arbitrary data
   used to smuggle values between unrelated functions.
3. `request.state` is an untyped attribute bag written by middleware and read
   wherever you have the raw `request` — good for the middleware→handler
   hand-off. `Depends` injects a typed, testable, reusable value and appears
   in OpenAPI — the idiomatic way to derive and inject context. Use state for
   middleware-produced values, DI for derived/typed context.
4. The code after `yield` runs in a `finally`, and FastAPI ensures the
   generator is resumed (cleanup executed) after the response is produced,
   whether the handler returned normally or raised — so teardown always runs.
5. The handler declares `admin=Depends(require_admin)`. `require_admin`
   depends on `get_current_user` and does the check, raising `403` on
   failure. The handler only expresses the requirement; the how lives in the
   dependency, so it's decoupled and reusable.
6. Once — dependencies are cached per request, so a shared dependency is
   resolved a single time and reused. It matters because composing many
   dependencies that share a common one doesn't multiply work (e.g. no
   repeated token verification or DB lookups).
7. Its identity/data *and* its deadline and cancellation signal. A request
   has a bounded lifetime; long operations should be cancellable and
   time-bounded (`asyncio.timeout`, client-disconnect propagation), so
   context includes "how long may this run / has it been cancelled," not just
   "who is it."

</details>

## Further reading & sources

- [FastAPI — Dependencies](https://fastapi.tiangolo.com/tutorial/dependencies/) - the core `Depends(...)` model for injecting request-scoped context declaratively.
- [FastAPI — Dependencies with yield](https://fastapi.tiangolo.com/tutorial/dependencies/dependencies-with-yield/) - setup/teardown dependencies that guarantee cleanup (e.g. DB sessions) even when a handler raises.
- [FastAPI — Global Dependencies](https://fastapi.tiangolo.com/tutorial/dependencies/global-dependencies/) - attaching dependencies at the router/app level to protect whole groups of routes.
- [Starlette — Requests (`request.state`)](https://www.starlette.io/requests/#other-state) - the per-request attribute bag used for the middleware-to-handler hand-off.
- [Python docs — `contextvars`](https://docs.python.org/3/library/contextvars.html) - request-safe implicit context that avoids the concurrency hazards of module-level globals.
- [Python docs — `asyncio.timeout`](https://docs.python.org/3/library/asyncio-task.html#asyncio.timeout) - bounding and cancelling long-running work, the deadline side of request context.

## Next

[06-handlers-controllers-and-services](../06-handlers-controllers-and-services/README.md)
— you can validate, wrap, and inject context; now you'll organize the actual
business logic into clean layers (handler → controller → service) so it stays
testable and DRY as the app grows.
