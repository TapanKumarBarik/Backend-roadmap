# Module 01: Global Error Handlers and User-Facing Errors

## Why this matters

Module 00 gave you a strategy and a custom exception hierarchy. This module
answers the question that strategy immediately raises in a web service: *where
does the buck stop?* When a request handler raises a `NotFoundError`, or when
some line 12 layers deep raises a `KeyError` nobody anticipated, *something* at
the edge of your application has to turn that Python exception into an HTTP
response. If you don't build that something deliberately, the framework builds
a bad one for you — or worse, in the wrong configuration, hands the client a
full stack trace including your file paths, your SQL, and sometimes your
secrets.

There are two failures this module prevents, and they pull in opposite
directions. The first is **leaking internals**: a `500` response that includes
`Traceback (most recent call last)... File "/app/services/payments.py"...
psycopg.errors.UndefinedColumn` tells an attacker your stack, your directory
layout, your database schema, and hands your users something scary and useless.
The second is the opposite over-correction: **swallowing everything into a
uniform `{"error": "something went wrong"}`** so that a client (which might be
*your own frontend*, or a partner's integration) can't tell a "you sent a bad
field" from "our database is on fire" from "that thing doesn't exist" — three
situations that demand completely different reactions from the caller.

The resolution is a single **centralized error handler** with a **consistent
error response shape** across the whole API, that draws the line from module 00
in exactly one place: *expected domain errors* become specific, actionable,
safe messages with the right status code; *unexpected exceptions* become a
generic `500` — with the real cause logged in full server-side, and nothing
sensitive sent to the client. One place. Every error. No leaks. This is the
piece that makes an API feel *trustworthy* to the people integrating with it.

## Concepts

### Why centralized, not per-route

You could wrap every route handler in try/except. Please don't. Per-route error
handling means the *shape* of your error responses drifts — this route returns
`{"error": "..."}`, that one `{"message": "..."}`, another a bare string — and
the day you need to add a request ID to every error response (you will, module
05), you're editing 200 handlers. Worse, it's the pattern most likely to leak,
because the one route someone forgot to wrap is the one that leaks the stack
trace.

A **centralized handler** registered once on the app catches everything that
propagates out of *any* route, applies one consistent policy, and is the single
place you change error behaviour. It's the direct application of module 04
(common middleware patterns, track 02): the error boundary belongs at the edge,
outermost, wrapping everything. FastAPI gives you a purpose-built mechanism for
this so you don't even need raw middleware.

### FastAPI's exception handler mechanism

FastAPI lets you register handlers keyed by *exception type*. When a request
raises, FastAPI walks up looking for the most specific registered handler for
that exception's type (or a base class of it) and calls it to produce the
response.

```python
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

app = FastAPI()

class AppError(Exception):
    """Base for expected, domain-level errors (from module 00)."""
    status_code = 500
    code = "internal_error"
    def __init__(self, message: str):
        self.message = message
        super().__init__(message)

class NotFoundError(AppError):
    status_code = 404
    code = "not_found"

class ConflictError(AppError):
    status_code = 409
    code = "conflict"

class PermissionDeniedError(AppError):
    status_code = 403
    code = "permission_denied"


@app.exception_handler(AppError)
async def handle_app_error(request: Request, exc: AppError):
    # ONE handler for the whole domain hierarchy — each subclass carries
    # its own status_code and code, so this stays generic.
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "error": {
                "code": exc.code,
                "message": exc.message,           # safe: we authored these strings
                "request_id": getattr(request.state, "request_id", None),
            }
        },
    )
```

Because `NotFoundError` and friends subclass `AppError`, this **one** handler
covers the whole family — each subclass just declares its `status_code` and
`code`. Registering `@app.exception_handler(AppError)` catches every subclass;
you don't write one handler per type unless a specific type needs bespoke logic.

### The catch-all for the unexpected

The handler above deliberately covers only `AppError` — errors *you* raised on
purpose, whose messages you *authored* and know are safe. Everything else — a
`KeyError`, a driver error, an `AttributeError` from a bug — is *unexpected*,
and its message is **not** safe to show (it may contain SQL, paths, or data).
Those get a separate, deliberately paranoid catch-all:

```python
import structlog
log = structlog.get_logger()

@app.exception_handler(Exception)
async def handle_unexpected(request: Request, exc: Exception):
    # This is the safety net for BUGS. Log everything; reveal nothing.
    log.exception(
        "unhandled exception",
        path=request.url.path,
        method=request.method,
        request_id=getattr(request.state, "request_id", None),
    )
    return JSONResponse(
        status_code=500,
        content={
            "error": {
                "code": "internal_error",
                "message": "An unexpected error occurred. Please try again later.",
                "request_id": getattr(request.state, "request_id", None),
            }
        },
    )
```

The asymmetry is the whole point and worth stating plainly:

- **Expected (`AppError`)**: status from the exception, real message shown
  (you wrote it), typically logged at `warning` or not at all (it's normal
  operation — a `404` isn't a server problem).
- **Unexpected (`Exception`)**: always `500`, generic message, **full
  traceback logged** server-side, `request_id` returned so a user can quote it
  in a support ticket and you can find the exact log line.

That `request_id` in *both* the log and the response is the thread that ties a
user's "I got an error, here's the ID" to the exact traceback in your logs —
the payoff of request-context (track 02, module 05) meeting error handling.

```
  raise in ANY route
        │
        ▼  FastAPI routes by exception type (most-specific-wins)
  ┌─────────────────────────┬────────────────────────────┐
  │ subclass of AppError?   │ anything else (KeyError,    │
  │ (you raised on purpose) │  driver error, a bug)       │
  └───────────┬─────────────┴──────────────┬─────────────┘
              ▼                             ▼
   handle_app_error              handle_unexpected (catch-all)
   status = exc.status_code      status = 500
   message = exc.message  ✓      message = generic string ✓
   (authored, safe)              log.exception(full traceback)
              │                             │
              └──────────────┬──────────────┘
                             ▼
              ONE envelope: {error:{code, message, request_id, details?}}
              client always sees the same shape — internals never leak
```

### A consistent error response shape

Pick one envelope and use it for *every* error the API emits — your handlers,
validation errors, `404`s, `500`s, all of it. A widely-used, sane shape:

```json
{
  "error": {
    "code": "not_found",
    "message": "Order 'A-4417' was not found.",
    "request_id": "3f9a2c1e-...",
    "details": [
      {"field": "quantity", "issue": "must be greater than 0"}
    ]
  }
}
```

- **`code`** — a stable, machine-readable string (`not_found`, `conflict`,
  `validation_error`). Clients branch on *this*, never on the human message
  (which you'll want to reword or translate freely). This is the field that
  makes the API programmable.
- **`message`** — human-readable, safe, and *actionable* where possible.
- **`request_id`** — for support/correlation.
- **`details`** — optional, structured, for field-level validation errors so a
  frontend can highlight the exact input that's wrong.

Consistency is a *contract*. If every error looks the same, a client writes
error-handling code *once*. If it varies per endpoint, every integrator writes
special cases and files bugs against you. Nail the shape early — changing it
later is a breaking API change.

### Friendly, actionable messages — and the security line

A good user-facing error tells the caller *what to do next*, without revealing
anything about your internals. Contrast:

| Bad (leaky or useless) | Good (safe and actionable) |
|---|---|
| `KeyError: 'user_id'` | `The field 'user_id' is required.` |
| `psycopg.errors.UniqueViolation: duplicate key value violates constraint "users_email_key"` | `An account with that email already exists.` |
| `Traceback ... /app/svc/pay.py line 88 ...` | `Payment could not be processed. Please try again.` |
| `something went wrong` | `The requested order was not found. Check the order ID and try again.` |

The security rule is absolute: **never let an unexpected exception's message,
type, or traceback reach the client.** The catch-all's generic message exists
precisely so that a bug you *didn't* anticipate can't leak. The only messages
that reach clients verbatim are ones *you* wrote for `AppError` subclasses —
because those you've vetted. This also quietly closes an information-disclosure
vulnerability class the security track (09) treats in depth: error messages
that reveal whether a username exists, what columns a table has, or which
internal service failed.

Two subtleties:
- **Don't over-share even in expected errors.** "No account with email
  ada@x.com" confirms to an attacker that address *isn't* registered (or, on
  login, that it *is*). Sometimes the *right* friendly message is deliberately
  vague ("invalid email or password") for security reasons — friendliness and
  security occasionally trade off, and security wins on auth paths.
- **`4xx` vs `5xx` is a real signal, not decoration.** `4xx` = the *client*
  did something wrong (bad input, not found, not allowed) — retrying unchanged
  won't help. `5xx` = *we* failed — retrying might help. Getting this right
  drives client retry logic and your own alerting (a spike in `5xx` pages you;
  a spike in `404s` usually doesn't).

### Don't forget FastAPI's built-in errors

Two error sources come from FastAPI/Starlette itself, and you want them in
*your* envelope too, or your "consistent shape" has holes:

- **`RequestValidationError`** — raised automatically when a request body/query
  fails Pydantic validation. By default FastAPI returns a `422` with its own
  shape (`{"detail": [...]}`). Override it to match your envelope and map the
  Pydantic errors into your `details` array.
- **`StarletteHTTPException`** — what `raise HTTPException(404)` and unmatched
  routes produce. Override it so a plain `404` (no route matched) looks like
  every other error you emit.

```python
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException as StarletteHTTPException

@app.exception_handler(RequestValidationError)
async def handle_validation(request: Request, exc: RequestValidationError):
    details = [
        {"field": ".".join(str(p) for p in e["loc"][1:]), "issue": e["msg"]}
        for e in exc.errors()
    ]
    return JSONResponse(
        status_code=422,
        content={"error": {
            "code": "validation_error",
            "message": "One or more fields are invalid.",
            "request_id": getattr(request.state, "request_id", None),
            "details": details,
        }},
    )
```

Now *every* error your API can emit — domain, validation, not-found, and
unexpected — comes out in the same envelope. That's the goal: no matter how a
request fails, the client sees one predictable shape.

## Command reference

| Mechanism | Purpose | Signature |
|---|---|---|
| `@app.exception_handler(ExcType)` | Register a handler for an exception type (and subclasses) | `async def h(request, exc): -> Response` |
| `@app.exception_handler(AppError)` | One handler for your whole domain hierarchy | catches all `AppError` subclasses |
| `@app.exception_handler(Exception)` | Catch-all safety net for bugs → generic `500` | must not leak `exc` details |
| `@app.exception_handler(RequestValidationError)` | Reshape Pydantic validation errors into your envelope | `422` |
| `@app.exception_handler(StarletteHTTPException)` | Reshape framework `404`/`HTTPException` into your envelope | any status |
| `raise HTTPException(status, detail)` | Framework way to signal an HTTP error from a handler | prefer custom `AppError` for domain logic |
| `JSONResponse(status_code, content)` | Build the actual error response | returned from handlers |

**Handler resolution is most-specific-wins.** If both `AppError` and
`Exception` handlers are registered, a `NotFoundError` (an `AppError`) goes to
the `AppError` handler; a `KeyError` (only an `Exception`) goes to the
catch-all. That specificity is exactly how the expected/unexpected split works
— register both, let FastAPI route by type.

**Prefer custom `AppError`s over `HTTPException` in business logic.** Raising
`HTTPException(404)` from deep in a service layer couples your domain code to
HTTP. Raise a `NotFoundError` (pure domain) and let the *handler* map it to
`404`. Your service layer shouldn't know it's behind HTTP — that's what makes
it testable and reusable behind, say, a gRPC interface later (track 11).

**Register handlers before the app takes traffic** — at module import /
app-construction time, not inside a request. They're part of the app's static
configuration.

## Hands-on exercises

Continue from your `error-handling` project, or start `global-errors/`:

```bash
python -m venv .venv && source .venv/bin/activate
pip install "fastapi[standard]" structlog
```

Build up a single `main.py` across these exercises. Run with
`fastapi dev main.py` and hit it with `curl -i` so you see status codes and
bodies.

### 1. Register the domain handler

Add the `AppError` hierarchy and the `handle_app_error` handler from Concepts,
plus a route that raises one:

```python
@app.get("/orders/{order_id}")
async def get_order(order_id: str):
    if order_id != "A-1":
        raise NotFoundError(f"Order {order_id!r} was not found.")
    return {"id": order_id, "status": "shipped"}
```

`curl -i localhost:8000/orders/A-9`. Expected: `404` with
`{"error": {"code": "not_found", "message": "Order 'A-9' was not found.", ...}}`.
`curl -i localhost:8000/orders/A-1` returns the order. Note you never wrote a
try/except in the route — the handler caught the raise.

### 2. Prove the catch-all hides bug details

Add the `handle_unexpected` catch-all, then a deliberately buggy route:

```python
@app.get("/buggy")
async def buggy():
    data = {"a": 1}
    return {"value": data["b"]}         # KeyError — a bug we did NOT anticipate
```

`curl -i localhost:8000/buggy`. Expected: `500` with the *generic* message
`"An unexpected error occurred..."` and a `request_id` — and in your **server
console**, the full `KeyError` traceback via `log.exception`. Confirm the
`KeyError` and your file paths appear *only* in the server log, never in the
HTTP response.

### 3. See the danger you're preventing

Temporarily comment out the `handle_unexpected` handler and set
`fastapi dev` (debug mode). Hit `/buggy` again. Expected: depending on config,
you get either a bare `500` with a traceback in the body or a debug error page
— either way, internals you'd never want a client to see. Re-enable the
handler. This contrast is the entire point of the module.

### 4. Reshape validation errors

Add a `POST` route with a Pydantic body and the `handle_validation` handler:

```python
from pydantic import BaseModel, Field

class OrderIn(BaseModel):
    quantity: int = Field(gt=0)
    sku: str

@app.post("/orders")
async def create_order(order: OrderIn):
    return {"created": order.model_dump()}
```

Send bad input: `curl -i -X POST localhost:8000/orders -H "content-type:
application/json" -d '{"quantity": 0}'`. Expected: `422` in *your* envelope
with a `details` array flagging `quantity` (must be > 0) and `sku` (required) —
not FastAPI's default `{"detail": [...]}` shape.

### 5. Make an unmatched route match your shape

Add the `StarletteHTTPException` handler. `curl -i localhost:8000/nope`.
Expected: the framework's `404` for an unmatched path now comes back in your
`{"error": {...}}` envelope with `code: "not_found"`, consistent with every
other error.

### 6. Add request IDs and correlate

Add a small middleware that stamps a `request_id` on `request.state` (recap
from track 02, module 05):

```python
import uuid
@app.middleware("http")
async def request_id_mw(request: Request, call_next):
    request.state.request_id = request.headers.get("X-Request-ID", str(uuid.uuid4()))
    response = await call_next(request)
    response.headers["X-Request-ID"] = request.state.request_id
    return response
```

Hit `/buggy` again. Expected: the *same* `request_id` appears in the response
body, the `X-Request-ID` response header, *and* the server log line for the
traceback. Practise the real workflow: copy the ID from the response, grep your
console for it, land on the exact traceback. This is what makes production
errors debuggable.

### 7. Actionable vs leaky messages

Add a route that simulates a duplicate-email conflict:

```python
@app.post("/signup")
async def signup(email: str):
    if email == "taken@x.com":
        raise ConflictError("An account with that email already exists.")
    return {"created": email}
```

Confirm the response is a clean `409` with the friendly message — *not* a
database `UniqueViolation`. Discuss with yourself: is "An account with that
email already exists" itself an information leak? (On a public signup form,
arguably yes — it confirms which emails are registered. Note the tension; the
security track resolves it.)

### 8. Diagnose and fix: the handler that swallows the real cause

You're given this handler. Ops reports that "`500`s are impossible to debug —
the logs just say `internal error` with no traceback, and occasionally a `404`
comes back as a `500`." Find both bugs.

```python
@app.exception_handler(Exception)
async def handler(request: Request, exc: Exception):
    log.error("internal error")                       # bug A
    return JSONResponse(status_code=500,
                        content={"error": "internal error"})

@app.get("/thing/{id}")
async def thing(id: str):
    try:
        return lookup(id)                             # raises NotFoundError when missing
    except Exception:
        raise Exception("lookup failed")              # bug B
```

<details>
<summary>Solution</summary>

**Bug A — no traceback logged.** `log.error("internal error")` records a bare
message with no exception info, so every `500` is undebuggable exactly as
reported. Fix: `log.exception("unhandled exception", request_id=...,
path=request.url.path)` inside the handler, which attaches the active
exception's full traceback and type. (Also add the `request_id` so responses
and logs correlate.)

**Bug B — the route re-wraps a specific domain error as a generic
`Exception`, defeating the whole design.** `lookup(id)` raises a
`NotFoundError` (an `AppError`) that *should* be routed to the `AppError`
handler and become a clean `404`. But the route catches it and re-raises a bare
`Exception("lookup failed")` — which (a) matches only the catch-all, so it
comes back as a `500` instead of a `404` (the "404 comes back as 500" symptom),
(b) discards the original `NotFoundError` and its message, and (c) if it *had*
used `from exc`, at least the cause would survive — it doesn't. Fix: **delete
the try/except entirely.** Let `NotFoundError` propagate to the `AppError`
handler. The route shouldn't catch what it can't improve on (module 00's "don't
catch early" rule) — the whole reason you built a centralized handler is so
routes *don't* do this.

```python
@app.get("/thing/{id}")
async def thing(id: str):
    return lookup(id)          # let NotFoundError propagate to the AppError handler
```

The lesson: a centralized handler only works if routes *trust* it and stop
hand-wrapping errors. The two bugs are two halves of the same mistake — the
handler threw away diagnostics, and the route threw away the error's type.

</details>

## Independent challenge

No code given. Take the `create_order`/`get_order` API from the exercises and
give it a *complete, consistent* error surface, reusing the `AppError`
hierarchy you designed in **module 00's independent challenge**. Requirements:
(1) every possible error — domain, validation, unmatched-route, and an
unexpected bug — comes back in one identical envelope with a `code`,
`message`, `request_id`, and (for validation) `details`; (2) no unexpected
exception ever leaks its message, type, or traceback to the client, verified by
deliberately planting a bug and confirming only the generic `500` is returned;
(3) `4xx` vs `5xx` is correct for each case; and (4) a user-supplied
`X-Request-ID` is honoured and echoed, appearing in both the response and the
server-side traceback for correlation. Prove all four with `curl` transcripts.

<details>
<summary>Hint</summary>

You need exactly four registered handlers: `AppError` (your domain hierarchy,
each subclass carrying `status_code`+`code`), `RequestValidationError` (→ your
envelope with `details`), `StarletteHTTPException` (unmatched routes/framework
`HTTPException`), and `Exception` (the paranoid catch-all — generic message,
full server-side log, nothing leaked). The correlation requirement is just the
request-ID middleware from track 02 module 05 feeding `request.state.request_id`
into every handler's output *and* every log line. If you find yourself writing
a try/except inside a route, you've taken a wrong turn — the whole design is
that routes raise and the handlers translate.

</details>

## Common mistakes & troubleshooting

- **Only registering `AppError`, forgetting the `Exception` catch-all.** An
  unanticipated `KeyError` then falls through to FastAPI's default, which in
  the wrong config leaks a traceback. Always register both.
- **Letting the catch-all show `str(exc)`.** That *is* leaking internals — the
  message may contain SQL, paths, or data. The catch-all's message must be a
  fixed, generic string you control.
- **Inconsistent envelope across endpoints.** If one route returns
  `{"error": ...}` and another `{"detail": ...}`, clients need special cases.
  Override the framework's validation/HTTP handlers so *everything* matches.
- **`log.error` instead of `log.exception` in the catch-all.** Recurring theme:
  you lose the traceback, and `500`s become undebuggable.
- **Raising `HTTPException` from deep service code.** Couples business logic to
  HTTP. Raise domain `AppError`s; map to HTTP only in the handler.
- **Wrong status class.** Returning `500` for a not-found (client's fault) or
  `200` for a failure. `4xx` = client error (don't retry unchanged); `5xx` =
  server error (retry may help) — this drives client and alert behaviour.
- **Routes catching errors the central handler should own.** Re-wrapping a
  typed error into a generic one downgrades a clean `404` to a `500` and loses
  the cause. Trust the handler; delete the try/except.

## Checkpoint quiz

Write down your answer to each question before expanding it — checking without attempting first is the single easiest way to fool yourself into thinking you've learned this.

1. Why register a *centralized* exception handler rather than try/except in
   each route? Give two concrete downsides of the per-route approach.
2. Describe the asymmetry between how you treat an expected `AppError` and an
   unexpected `Exception` in the handlers — status code, message, and logging.
3. Why must the catch-all handler's message be a fixed string you control,
   rather than `str(exc)`?
4. What is the `code` field in the error envelope for, and why should clients
   branch on it rather than on the human-readable `message`?
5. Why is it better for deep service code to raise a custom `NotFoundError`
   than to `raise HTTPException(404)`?
6. How does a `request_id` in both the error response and the server log make a
   production `500` debuggable, and which earlier module provides it?

<details>
<summary>Answers</summary>

1. Centralizing gives one consistent policy and one place to change error
   behaviour. Two downsides of per-route: (a) the error *shape* drifts across
   endpoints so clients need special cases, and (b) the one route someone
   forgets to wrap is the one that leaks a stack trace — coverage becomes a
   matter of discipline instead of structure. (Also: adding a field like
   `request_id` to every error means editing every route.)
2. **Expected `AppError`:** status comes from the exception (e.g. `404`,
   `409`), the real message is shown because *you authored it*, and it's logged
   lightly or not at all (normal operation). **Unexpected `Exception`:** always
   `500`, a fixed generic message, and the *full traceback logged server-side*
   — reveal nothing, record everything.
3. Because an unexpected exception's message may contain SQL, file paths,
   internal data, or the exception type — all information disclosure. You
   haven't vetted it, so it can't be trusted to reach a client; only messages
   you wrote for `AppError` subclasses are safe verbatim.
4. `code` is a stable machine-readable identifier (`not_found`, `conflict`) that
   clients can safely branch on; the `message` is human-facing and you'll want
   to reword/translate it freely, so coupling client logic to it would break
   every time you improve wording. `code` is the programmable contract.
5. Raising a domain `NotFoundError` keeps the service layer ignorant of HTTP,
   so it's testable and reusable behind a non-HTTP interface (gRPC, a CLI, a
   queue consumer); the *handler* maps the domain error to `404`. Raising
   `HTTPException` couples business logic to the web layer.
6. The same `request_id` appears in the client's response and in the log line
   carrying the traceback, so a user can quote the ID and you grep straight to
   the exact failure. It comes from the request-context / request-ID middleware
   built in track 02 (02-api-layer, module 05).

</details>

## Further reading & sources

- [FastAPI — Handling Errors](https://fastapi.tiangolo.com/tutorial/handling-errors/) - the official guide to `@app.exception_handler`, `HTTPException`, and overriding validation errors.
- [Starlette — Exceptions and handlers](https://www.starlette.io/exceptions/) - the underlying framework mechanism FastAPI builds its exception handling on.
- [RFC 9457 — Problem Details for HTTP APIs](https://www.rfc-editor.org/rfc/rfc9457.html) - the IETF standard error envelope, a reference point when designing your own consistent shape.
- [MDN — HTTP response status codes](https://developer.mozilla.org/en-US/docs/Web/HTTP/Status) - the authority on `4xx` (client) vs `5xx` (server) semantics that drive retry and alerting behaviour.
- [OWASP — Improper Error Handling](https://owasp.org/www-community/Improper_Error_Handling) - why leaking stack traces and internal details in error responses is a real security weakness.

## Next

[02-config-management-fundamentals](../02-config-management-fundamentals/README.md)
— your errors are now handled and safe. Next: the settings that drive your app
across dev, staging, and prod. Getting config wrong is itself a top cause of
production incidents (and of the leaked-secret errors this module worked to
prevent), so we'll treat configuration as a first-class operational concern.
