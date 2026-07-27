# Module 03: Middleware Fundamentals

## Why this matters

So far every piece of logic you've written lived *inside* a specific handler:
validate this body, normalize that email. But some concerns aren't about one
endpoint — they're about **every** request. You want to log every request
that comes in. You want to attach a request ID to every response. You want to
reject unauthenticated requests before they reach *any* protected handler.
You want to add security headers to every response leaving the building. If
you copy that logic into all forty of your route handlers, you have a
maintenance nightmare and, worse, a *security* nightmare — the one endpoint
where you forgot to paste the auth check is the one that gets breached.

**Middleware** is the answer. It's code that wraps the request/response
cycle: it runs *before* your handler sees the request, and again *after* your
handler produces the response, on the way back out. Think of it as a series
of airport checkpoints every passenger passes through — security screening,
passport control, boarding-pass scan — regardless of which gate they're
ultimately headed to. Each checkpoint can inspect you, stamp your documents,
send you back (short-circuit), or wave you through to the next one. Your
handler is the gate at the end; middleware is everything you pass through
before and after.

The mental model that unlocks middleware is the **onion** (or the nesting
doll). The request travels *inward* through each layer to reach the handler
at the core; the response travels *outward* through the same layers in
reverse. A single middleware sees the request on the way in *and* the
response on the way out — it's wrapped around everything deeper than it. This
is why **order matters enormously**: the middleware you register first is the
outermost layer, the first to touch the request and the last to touch the
response. Get the order wrong and you'll authenticate *after* you've already
logged the request as anonymous, or compress a response *before* adding the
header that says it's compressed.

## Concepts

### What middleware is and where it sits

Middleware is a function that receives the incoming request and a reference to
"the next thing in the chain," does some work, calls the next thing, and then
gets a chance to work on the response before returning it. In
Starlette/FastAPI, the HTTP-middleware signature is:

```python
from fastapi import FastAPI, Request

app = FastAPI()

@app.middleware("http")
async def my_middleware(request: Request, call_next):
    # --- pre-request phase: runs BEFORE the handler ---
    response = await call_next(request)   # hands off to the next layer / handler
    # --- post-response phase: runs AFTER the handler ---
    return response                       # response travels back outward
```

`call_next` is the crucial piece. It represents "everything deeper in the
onion" — the remaining middleware and, eventually, your route handler.
Calling `await call_next(request)` passes control inward and returns the
response that bubbles back out. Everything *before* that line is pre-request;
everything *after* is post-response.

### The two phases: pre-request and post-response

A single middleware straddles two moments in time:

- **Pre-request** (before `call_next`): inspect/modify the incoming request,
  start a timer, extract an auth token, generate a request ID, reject early.
- **Post-response** (after `call_next`): inspect/modify the outgoing
  response, add headers, log the status code and elapsed time, record
  metrics.

```python
import time

@app.middleware("http")
async def timing(request: Request, call_next):
    start = time.perf_counter()                    # pre-request
    response = await call_next(request)            # run everything inside
    elapsed_ms = (time.perf_counter() - start) * 1000
    response.headers["X-Process-Time-ms"] = f"{elapsed_ms:.1f}"   # post-response
    return response
```

One function, both sides of the handler. That's the defining feature.

### The chain and execution order (the onion)

Register three middlewares and you get three nested layers. With FastAPI's
`@app.middleware("http")` (and `app.add_middleware`), **the last one added is
the outermost** wrapper — but the mental model to hold is simply "each
middleware wraps everything registered *before* it becomes inner." Rather
than memorize the registration-direction rule, reason about the *onion*: on
the way *in*, requests pass outer → inner; on the way *out*, responses pass
inner → outer.

```
request  ─►  [ Logging ]  ─►  [ Auth ]  ─►  [ Validate ]  ─►  Handler
response ◄─  [ Logging ]  ◄─  [ Auth ]  ◄─  [ Validate ]  ◄─  Handler
```

Here Logging is outermost: it sees the request first (so it can log the
*true* arrival time and the eventual final status) and the response last.
Auth runs after logging but before the handler — so an unauthorized request
is logged, then rejected, and never reaches Validate or the Handler. This
ordering is deliberate and you design it; it's the whole subject of module
04.

### `call_next`, short-circuiting, and never reaching the handler

A middleware doesn't *have* to call `call_next`. If it returns a response
*without* calling it, it **short-circuits** the pipeline — the handler and
every inner layer never run. This is how you cheaply reject bad requests at
the edge:

```python
from fastapi.responses import JSONResponse

@app.middleware("http")
async def block_legacy_paths(request: Request, call_next):
    if request.url.path.startswith("/v0/"):
        # Return immediately; the handler is never invoked.
        return JSONResponse(status_code=410, content={"error": "API v0 is retired"})
    return await call_next(request)   # only reached for non-/v0 paths
```

Short-circuiting is a feature, not an escape hatch: auth middleware
short-circuits with a `401`, rate limiters with a `429`, a maintenance-mode
gate with a `503`. The pattern is always "decide in the pre-request phase;
either return early or call `call_next`."

### Handling 404s and cross-cutting concerns early

Some decisions are best made before routing even resolves. A request for a
path that matches no route will, by default, fall through to FastAPI's `404`
handler at the core of the onion — but middleware still wraps it, so your
logging middleware *does* see and log that `404`, and your security-headers
middleware *does* still add headers to it. That's exactly what you want:
cross-cutting concerns apply uniformly, including to error responses. You
generally don't short-circuit 404s in middleware yourself (let the router
produce them), but you rely on middleware wrapping them so logging and headers
are consistent even for not-found and error responses.

### Middleware vs. dependencies (a FastAPI-specific distinction)

FastAPI has a *second* mechanism that overlaps with middleware:
**dependencies** (`Depends(...)`, covered in module 05). Rough rule of thumb:
use **middleware** for concerns that apply to *every* request uniformly and
operate on the raw request/response (logging, headers, compression, request
IDs, global timing). Use **dependencies** for concerns scoped to *specific*
endpoints and that need FastAPI's parsing/validation/injection (auth for a
group of routes, loading the current user, enforcing per-route permissions).
They're complementary; module 05 shows where each shines. For now, know that
"runs for everything, wraps request+response" ⇒ middleware.

## Command reference

| Pattern | What it does | Example |
|---|---|---|
| `@app.middleware("http")` | Registers an HTTP middleware function | `async def m(request, call_next):` |
| `await call_next(request)` | Passes control inward; returns the response | `response = await call_next(request)` |
| return before `call_next` | Short-circuits — handler never runs | `return JSONResponse(...)` |
| `response.headers["X"] = "y"` | Post-response header mutation | `response.headers["X-Request-ID"] = rid` |
| `request.state.x = y` | Stash per-request data for inner layers/handlers | `request.state.request_id = rid` |
| `app.add_middleware(Cls, **opts)` | Registers a class-based / built-in middleware | `app.add_middleware(GZipMiddleware)` |
| `request.url.path` | The path being requested (for routing decisions) | `if path.startswith("/admin")` |
| `request.method` | The HTTP method | `if request.method == "OPTIONS"` |

**Two ways to register middleware.** `@app.middleware("http")` decorates a
function — convenient for custom logic. `app.add_middleware(SomeMiddleware,
option=...)` registers a class-based middleware — used for built-ins
(`GZipMiddleware`, `CORSMiddleware`, `TrustedHostMiddleware`) and reusable
components. Both participate in the same onion. **Ordering caveat:** with
`add_middleware`, the middleware added *last* ends up *outermost*. When you
mix the decorator and `add_middleware`, keep them straight by testing the
observed order (exercise 3), not by guessing.

**`request.state` is the hand-off channel.** A middleware computes something
in the pre-request phase (a request ID, the authenticated user) and stashes
it on `request.state` so inner layers and the handler can read it. This is
the seed of "request context," the entire subject of module 05.

**Middleware runs for *every* route, including unmatched ones.** Because
middleware wraps routing itself, it also wraps the `404` for unknown paths
and the `500` for handler errors — which is why it's the right place for
logging and headers that must be truly universal.

## Hands-on exercises

Continue in the `api-layer` project.

### 1. Your first middleware: timing header

```python
import time
from fastapi import FastAPI, Request

app = FastAPI()

@app.middleware("http")
async def add_timing(request: Request, call_next):
    start = time.perf_counter()
    response = await call_next(request)
    elapsed = (time.perf_counter() - start) * 1000
    response.headers["X-Process-Time-ms"] = f"{elapsed:.2f}"
    return response

@app.get("/hello")
async def hello():
    return {"msg": "hi"}
```

Call `GET /hello` and inspect the response headers (`curl -i`). Expected: an
`X-Process-Time-ms` header on the response, even though `hello` knows nothing
about timing. That's a cross-cutting concern applied without touching the
handler.

### 2. Prove both phases run around the handler

Add print statements to *see* the onion:

```python
@app.middleware("http")
async def trace(request: Request, call_next):
    print(f"[trace] BEFORE handler: {request.method} {request.url.path}")
    response = await call_next(request)
    print(f"[trace] AFTER handler: status {response.status_code}")
    return response
```

Call any endpoint and watch the server console. Expected: `BEFORE` prints,
then your handler runs, then `AFTER` prints with the status — one function
straddling both sides.

### 3. Observe execution order with two middlewares

```python
@app.middleware("http")
async def outer(request: Request, call_next):
    print("[outer] in")
    resp = await call_next(request)
    print("[outer] out")
    return resp

@app.middleware("http")
async def inner(request: Request, call_next):
    print("[inner] in")
    resp = await call_next(request)
    print("[inner] out")
    return resp
```

Call an endpoint. Expected order in the console (note the *symmetry* — the
onion unwinds in reverse):

```
[inner] in      (registered last -> outermost -> touches request first)
[outer] in
...handler...
[outer] out
[inner] out     (outermost -> touches response last)
```

Write down which registration ends up outermost. This surprises everyone
once; verify it empirically rather than trusting your memory.

### 4. Short-circuit: retire an old API version

```python
from fastapi.responses import JSONResponse

@app.middleware("http")
async def block_v0(request: Request, call_next):
    if request.url.path.startswith("/v0/"):
        return JSONResponse(status_code=410, content={"error": "API v0 is retired"})
    return await call_next(request)

@app.get("/v0/legacy")
async def legacy():
    return {"msg": "you should never see this"}
```

Call `GET /v0/legacy`. Expected: `410`, and the `legacy` handler's body never
appears — confirm by adding a print inside `legacy` that does *not* fire. The
pipeline was short-circuited before reaching the handler.

### 5. Attach a request ID and hand it inward

```python
import uuid

@app.middleware("http")
async def request_id(request: Request, call_next):
    rid = request.headers.get("X-Request-ID") or str(uuid.uuid4())
    request.state.request_id = rid          # stash for inner layers/handler
    response = await call_next(request)
    response.headers["X-Request-ID"] = rid  # echo it back to the client
    return response

@app.get("/whoami")
async def whoami(request: Request):
    return {"request_id": request.state.request_id}
```

Call `GET /whoami`. Expected: the JSON body and the `X-Request-ID` response
header carry the *same* id. Send your own `X-Request-ID` header and confirm
it's respected. This is the first taste of request context (module 05).

### 6. Confirm middleware wraps 404s

With the `trace` middleware from exercise 2 still active, call a nonexistent
path like `GET /does-not-exist`. Expected: the `trace` middleware's `BEFORE`
and `AFTER` prints *still fire*, and `AFTER` reports `status 404`. Middleware
wraps routing itself, so even unmatched paths pass through your cross-cutting
logic.

### 7. A short-circuit maintenance gate

```python
MAINTENANCE = True

@app.middleware("http")
async def maintenance_gate(request: Request, call_next):
    if MAINTENANCE and request.url.path != "/health":
        return JSONResponse(status_code=503, content={"error": "under maintenance"})
    return await call_next(request)

@app.get("/health")
async def health():
    return {"status": "ok"}
```

Call `/health` (allowed through) and any other path (`503`). Expected:
`/health` returns `200` even during maintenance; everything else is
short-circuited with `503`. Flip `MAINTENANCE = False` and confirm normal
service resumes.

### 8. Diagnose and fix

This middleware is supposed to add an `X-App-Version` header to every
response and log timing. Instead, every request hangs forever (or errors),
and no header appears. Find and fix two bugs.

```python
import time
from fastapi import FastAPI, Request

app = FastAPI()

@app.middleware("http")
async def broken(request: Request, call_next):
    start = time.perf_counter()
    response = call_next(request)                     # (A)
    elapsed = (time.perf_counter() - start) * 1000
    response.headers["X-App-Version"] = "1.0"
    print(f"took {elapsed:.2f}ms")
    # (B) no return

@app.get("/ping")
async def ping():
    return {"pong": True}
```

<details>
<summary>Solution</summary>

1. **`response = call_next(request)` is missing `await`.** `call_next` is a
   coroutine; without `await` you get a coroutine object, not a response, and
   `response.headers[...]` fails (or you never actually run the handler).
   Must be `response = await call_next(request)`.
2. **The middleware never returns the response.** Falling off the end returns
   `None`, so the framework has nothing to send — the request hangs/errors.
   Add `return response` at the end.

```python
@app.middleware("http")
async def fixed(request: Request, call_next):
    start = time.perf_counter()
    response = await call_next(request)
    elapsed = (time.perf_counter() - start) * 1000
    response.headers["X-App-Version"] = "1.0"
    print(f"took {elapsed:.2f}ms")
    return response
```

The two mistakes — forgetting `await` and forgetting `return` — are the most
common middleware bugs there are. Burn them in now.

</details>

## Independent challenge

No code given. Add a middleware that enforces a global maximum request body
size: any request whose `Content-Length` header exceeds 1 MB is rejected
immediately with a `413 Payload Too Large`, *before* the body is read or any
handler runs — using the **short-circuit** technique from this module. Then
add a second middleware that logs, for every request, the method, path, final
status code, and elapsed time. Order the two deliberately so that a rejected
oversized request is *still logged* with its `413` status, and explain (in a
comment) why the logging middleware has to be the outer layer for that to
work. Reach back to module 00's **fail-fast** principle and note how
rejecting at the middleware edge is the earliest possible fail-fast point.

<details>
<summary>Hint</summary>

Read `request.headers.get("content-length")`, parse it to an int (guard
against it being missing), and `return JSONResponse(status_code=413, ...)`
without calling `call_next`. For the logging middleware to see the `413`, it
must run *around* the size gate — i.e. it must be the outer layer, so the
size gate's short-circuit response still travels back out through it. Recall
from exercise 3 that the middleware registered *last* becomes outermost.

</details>

## Common mistakes & troubleshooting

- **Forgetting `await` before `call_next`.** You get a coroutine, not a
  response, and everything downstream breaks. Always `await call_next(...)`.
- **Forgetting to `return response`.** A middleware that doesn't return the
  response leaves the framework with nothing to send — hangs or errors.
- **Guessing the execution order.** Registration direction is easy to get
  backwards. Verify empirically (print `in`/`out`) and design order
  deliberately (module 04).
- **Doing heavy work in middleware that only some routes need.** Middleware
  runs for *every* request. Route-specific concerns belong in dependencies
  (module 05), not global middleware.
- **Mutating the request body in middleware.** Reading/replacing the body
  stream in Starlette middleware is fragile (the stream can only be consumed
  once). Prefer dependencies or careful body-parsing middleware (module 04)
  for body work.
- **Assuming short-circuit responses skip other middleware.** A short-circuit
  return still travels *outward* through every outer middleware — that's why
  logging (if outer) still sees a rejected request.
- **Putting business logic in middleware.** Middleware is for cross-cutting
  concerns. Endpoint-specific logic belongs in handlers/services (module 06).

## Checkpoint quiz

Write down your answer to each question before expanding it — checking without attempting first is the single easiest way to fool yourself into thinking you've learned this.

1. What single line inside a middleware separates the pre-request phase from
   the post-response phase, and what does it represent?
2. Draw (in words) the onion for three middlewares Logging → Auth → Validate
   wrapping a handler, and say which sees the request first and which sees
   the response last.
3. How does a middleware short-circuit the pipeline, and name two real cases
   where you'd want to?
4. If a request hits a path that matches no route, does your logging
   middleware still run? Why or why not?
5. What are the two most common bugs in a hand-written middleware, and what
   symptom does each produce?
6. When would you reach for middleware versus a FastAPI dependency for a
   cross-cutting concern?

<details>
<summary>Answers</summary>

1. `response = await call_next(request)`. It represents handing control to
   everything deeper in the onion (inner middleware + the handler);
   everything before it is pre-request, everything after is post-response.
2. Logging is outermost, then Auth, then Validate, then the handler at the
   core. On the way in, the request passes Logging → Auth → Validate →
   handler; on the way out the response passes handler → Validate → Auth →
   Logging. Logging sees the request first and the response last.
3. By returning a response *without* calling `call_next`, so the handler and
   inner layers never run. Cases: auth failure (`401`), rate limit (`429`),
   maintenance mode (`503`), oversized payload (`413`), retired API version
   (`410`).
4. Yes — middleware wraps routing itself, so it also wraps the `404` produced
   for an unmatched path. The logging middleware's post-response phase sees
   and logs that `404`.
5. Forgetting `await` before `call_next` (you get a coroutine instead of a
   response; downstream access fails), and forgetting `return response` (the
   framework has nothing to send; the request hangs or errors).
6. Middleware for concerns that apply to *every* request and work on the raw
   request/response (logging, headers, compression, request IDs). Dependencies
   for concerns scoped to specific endpoints that need FastAPI's parsing and
   injection (per-route auth, loading the current user, permission checks).

</details>

## Next

[04-common-middleware-patterns](../04-common-middleware-patterns/README.md) —
now that you understand the pipeline, you'll assemble the standard cast of
production middleware (security headers, CORS, rate limiting, auth, logging,
error handling, compression) and, crucially, order them correctly.
