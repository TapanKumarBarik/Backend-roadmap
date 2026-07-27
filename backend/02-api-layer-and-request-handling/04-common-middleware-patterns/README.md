# Module 04: Common Middleware Patterns

## Why this matters

Module 03 gave you the mechanism — how a middleware wraps the request/response
cycle and how the onion nests. This module gives you the *cast of characters*:
the specific middlewares that show up in essentially every production API, and
— the part beginners always underestimate — **the order you have to put them
in**. There's a standard lineup: log the request, authenticate it, validate
it, route it, and handle any errors that fall out. Security headers get
stamped on the way out. Compression happens last. CORS has to be near the
outside so it can answer preflight requests before anything else runs.

The reason order isn't arbitrary is that ordering bugs are *silent* and
*dangerous*. Put your rate limiter *after* your auth middleware, and an
attacker can hammer your expensive password-checking logic without ever being
rate-limited — you've spent CPU authenticating requests you should have
dropped at the door. Put your logging *after* auth, and rejected requests
never get logged, so you're blind to exactly the traffic you most want to
see. Put your error handler on the *inside*, and an exception in an *outer*
middleware sails past it and reaches the client as a raw `500` with a stack
trace. Every one of these is a real incident that has happened to real teams.
The correct order is a security and observability decision, not a style
preference.

The other theme here is that most of these are *built-in* or standard — you
rarely hand-write CORS or compression. You configure a battle-tested
component. The skill is knowing which one, what it protects against, and where
it goes in the stack. This module is the reference you'll come back to every
time you stand up a new service.

## Concepts

### Security-headers middleware

A handful of response headers instruct the browser to behave more safely.
They cost nothing and prevent whole classes of attack, so you add them to
*every* response via middleware:

```python
from fastapi import FastAPI, Request

app = FastAPI()

@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"          # don't MIME-sniff
    response.headers["X-Frame-Options"] = "DENY"                    # no clickjacking via <iframe>
    response.headers["Strict-Transport-Security"] = "max-age=63072000; includeSubDomains"
    response.headers["Content-Security-Policy"] = "default-src 'self'"
    response.headers["Referrer-Policy"] = "no-referrer"
    return response
```

- **`X-Content-Type-Options: nosniff`** stops the browser from guessing a
  response's content type (a vector for tricking it into executing data as
  script).
- **`Strict-Transport-Security` (HSTS)** tells the browser "only ever talk to
  me over HTTPS," defeating downgrade/stripping attacks. Only send it over
  HTTPS.
- **`Content-Security-Policy` (CSP)** restricts where scripts/styles/images
  may load from — the single most powerful anti-XSS header, and the fiddliest
  to tune.
- **`X-Frame-Options: DENY`** prevents your pages being embedded in an iframe
  (clickjacking).

### CORS middleware

By default, browsers block a web page on `https://app.example.com` from
calling an API on `https://api.other.com` — the **same-origin policy**.
**CORS** (Cross-Origin Resource Sharing) is how your API *opts in* to being
called from specific other origins, by sending `Access-Control-Allow-*`
headers. FastAPI ships a built-in:

```python
from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://app.example.com"],   # NOT ["*"] in production with credentials
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
    allow_headers=["Authorization", "Content-Type"],
)
```

CORS must sit **near the outside** of the onion because the browser sends a
**preflight** `OPTIONS` request before the real one, and CORS middleware
answers it directly — you don't want auth or rate limiting rejecting a
preflight the browser needs to succeed. Critical footgun: `allow_origins=["*"]`
together with `allow_credentials=True` is insecure and disallowed by the spec
— never pair a wildcard origin with credentials.

### CSRF-protection middleware

**CSRF** (Cross-Site Request Forgery) tricks a logged-in user's browser into
making a state-changing request they didn't intend, riding on their existing
cookie session. The classic defense is a per-session **CSRF token** that the
server issues and the client must echo back in a header on unsafe methods
(`POST`/`PUT`/`PATCH`/`DELETE`). CSRF is primarily a concern for **cookie**-
based auth; APIs authenticated purely by an `Authorization: Bearer` header
that the browser doesn't attach automatically are much less exposed. Know the
distinction: if you use cookies for auth, you need CSRF protection; if you use
bearer tokens in a header, the CSRF surface is largely gone (but you then lean
harder on CORS and correct token handling).

### Rate-limiting middleware

Rate limiting caps how many requests a client may make in a window, protecting
against brute-force, scraping, and accidental floods. It returns `429 Too Many
Requests` (usually with a `Retry-After` header) when the limit is exceeded.
Position it **early** — before auth and before your expensive logic — so
abusive traffic is dropped before it costs you anything:

```python
import time
from collections import defaultdict
from fastapi.responses import JSONResponse

WINDOW_SECONDS = 60
MAX_REQUESTS = 100
_hits: dict[str, list[float]] = defaultdict(list)

@app.middleware("http")
async def rate_limit(request: Request, call_next):
    client = request.client.host if request.client else "unknown"
    now = time.time()
    _hits[client] = [t for t in _hits[client] if now - t < WINDOW_SECONDS]  # drop old
    if len(_hits[client]) >= MAX_REQUESTS:
        return JSONResponse(status_code=429, content={"error": "rate limit exceeded"},
                            headers={"Retry-After": str(WINDOW_SECONDS)})
    _hits[client].append(now)
    return await call_next(request)
```

(In-memory like this only works for a single process. Real deployments use a
shared store like Redis so the limit holds across many workers — track 09
goes deep. The *shape* and *placement* are what matter here.)

### Authentication middleware

Auth middleware extracts and verifies a credential (a bearer token, an API
key) and either rejects unauthenticated requests or attaches the identity to
`request.state` for inner layers to use. It short-circuits with `401` on
failure. In FastAPI you'll often do per-route auth with **dependencies**
(module 05) instead, because that lets you protect some routes and leave
others public cleanly; global auth middleware is right when *everything*
behind it is protected. Either way, auth runs **after** logging and rate
limiting but **before** the handler.

```python
@app.middleware("http")
async def authenticate(request: Request, call_next):
    if request.url.path in PUBLIC_PATHS:
        return await call_next(request)
    token = request.headers.get("Authorization", "").removeprefix("Bearer ")
    user = verify_token(token)              # returns None if invalid
    if user is None:
        return JSONResponse(status_code=401, content={"error": "unauthorized"})
    request.state.user = user               # hand identity to inner layers
    return await call_next(request)
```

### Logging / monitoring middleware

Structured request logging records one line per request — method, path,
status, duration, request ID, client — as **structured data** (key/value or
JSON), not a free-text sentence, so it's queryable in a log system. It sits
**outermost** so it captures *every* request including those rejected by
inner middleware (rate-limited, unauthorized) with their real final status.

```python
import time, logging
logger = logging.getLogger("requests")

@app.middleware("http")
async def access_log(request: Request, call_next):
    start = time.perf_counter()
    response = await call_next(request)
    logger.info("request", extra={
        "method": request.method, "path": request.url.path,
        "status": response.status_code,
        "duration_ms": round((time.perf_counter() - start) * 1000, 2),
        "request_id": getattr(request.state, "request_id", None),
    })
    return response
```

### Error-handling middleware

If a handler (or inner middleware) raises an unexpected exception, you don't
want a raw stack trace reaching the client. Error-handling middleware wraps
everything, catches exceptions, logs the detail server-side, and returns a
clean, consistent error envelope. It must be **outer** enough to wrap the
layers it protects (an exception in an *inner* layer is caught; an exception
in a layer *outside* the error handler is not). FastAPI also offers
`@app.exception_handler(...)` for typed exceptions — often cleaner than raw
try/except middleware — but the principle is the same: no stack traces to
clients, ever.

```python
@app.middleware("http")
async def catch_errors(request: Request, call_next):
    try:
        return await call_next(request)
    except Exception:
        logger.exception("unhandled error")      # full detail to server logs
        return JSONResponse(status_code=500, content={"error": "internal server error"})
```

### Compression and body-parsing middleware

**Compression** (`GZipMiddleware`) shrinks large responses so they transfer
faster; it's essentially last in line so it compresses the *final* body after
all other middleware has added headers. **Body parsing** — turning a raw
request body into usable data — is handled by FastAPI/Pydantic for JSON and
form data automatically; you configure limits and handle multipart
file uploads (`UploadFile`) rather than writing a parser. Know that JSON,
URL-encoded forms, and multipart (`multipart/form-data`, used for file
uploads) are three distinct body encodings the framework parses for you when
you declare the right parameter types.

```python
from fastapi.middleware.gzip import GZipMiddleware
app.add_middleware(GZipMiddleware, minimum_size=1000)   # only compress bodies > 1KB
```

### Ordering: the canonical stack

Put it together. Reasoning outer → inner (the request enters top, exits
bottom in reverse):

```
1. Error handling      (outermost: catches everything below it)
2. Logging             (records every request, even rejected ones)
3. CORS                (answers preflight before deeper layers run)
4. Rate limiting       (drop abusive traffic before spending CPU)
5. Authentication      (verify identity before the handler)
6. Validation          (Pydantic, per-route — inside the handler boundary)
7. Routing + Handler   (the core)
8. Security headers / compression   (applied on the way OUT)
```

Why this order, concretely:

- **Rate limiting before auth**: so brute-force login attempts are throttled
  *before* they reach (and exhaust) your password-verification logic. Auth
  after rate limiting means an attacker can't force expensive work by spamming.
- **Logging outside auth**: so unauthorized/rate-limited requests are still
  logged — otherwise you're blind to attacks.
- **Error handling outermost**: so an exception *anywhere* below turns into a
  clean response, never a leaked stack trace.
- **CORS near the top**: so the browser's preflight `OPTIONS` is answered
  before auth/rate-limit logic could wrongly reject it.

Order is both a **performance** lever (drop cheap-to-reject traffic early) and
a **security** boundary (never do sensitive work before you've authenticated
and throttled).

## Command reference

| Middleware | Purpose | Registration |
|---|---|---|
| Security headers | Anti-XSS/clickjacking/downgrade headers | custom `@app.middleware("http")` |
| `CORSMiddleware` | Allow specific cross-origin browsers | `app.add_middleware(CORSMiddleware, ...)` |
| CSRF token check | Block forged state-changing requests (cookie auth) | custom / library |
| Rate limiting | Cap requests per client → `429` | custom or `slowapi` |
| Authentication | Verify credential → `401`, attach identity | custom or per-route `Depends` |
| Access logging | One structured line per request | custom `@app.middleware("http")` |
| Error handling | Catch exceptions → clean `500` | `@app.middleware` or `@app.exception_handler` |
| `GZipMiddleware` | Compress large responses | `app.add_middleware(GZipMiddleware, minimum_size=)` |
| `TrustedHostMiddleware` | Reject requests with unexpected `Host` | `app.add_middleware(TrustedHostMiddleware, allowed_hosts=)` |

**`add_middleware` order = reverse of onion.** The middleware you
`add_middleware` *last* becomes the *outermost* layer. So to make error
handling outermost, add it *last* (or, with the decorator form, register it
last). Always verify with a trace (module 03, exercise 3) — this is the single
most error-prone thing in this module.

**Prefer built-ins and vetted libraries.** Don't hand-roll CORS, HSTS logic,
or production rate limiting. Use `CORSMiddleware`, set headers explicitly, and
reach for `slowapi`/Redis for real rate limiting. Hand-written versions here
are for *understanding the shape*, not for production.

**`@app.exception_handler` vs. try/except middleware.** For turning specific
exception *types* into specific responses (e.g. a `NotFoundError` → `404`),
`@app.exception_handler(NotFoundError)` is cleaner and composes with
FastAPI's own handling. Use catch-all try/except middleware only as the final
safety net for truly unexpected exceptions.

## Hands-on exercises

Continue in the `api-layer` project. Build these up and test the *ordering*
explicitly.

### 1. Add security headers to every response

Add the `security_headers` middleware from Concepts. Call any endpoint with
`curl -i` and confirm `X-Content-Type-Options`, `X-Frame-Options`,
`Strict-Transport-Security`, and `Content-Security-Policy` all appear.
Expected: every response, including a `404`, carries the headers.

### 2. Configure CORS and see a preflight

```python
from fastapi.middleware.cors import CORSMiddleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://app.example.com"],
    allow_methods=["*"], allow_headers=["*"],
)
```

Simulate a preflight:

```bash
curl -i -X OPTIONS localhost:8000/hello \
  -H "Origin: https://app.example.com" \
  -H "Access-Control-Request-Method: POST"
```

Expected: a `200`/`204` with `Access-Control-Allow-Origin:
https://app.example.com`. Change the `Origin` to something not in the list and
confirm the allow header is absent — the browser would then block the call.

### 3. Rate limit and get a 429

Add the in-memory `rate_limit` middleware from Concepts, but drop
`MAX_REQUESTS` to `5` for testing. Fire ten quick requests:

```bash
for i in $(seq 1 10); do curl -s -o /dev/null -w "%{http_code}\n" localhost:8000/hello; done
```

Expected: the first five return `200`, the rest `429`. Confirm the `429`
response carries a `Retry-After` header.

### 4. Authentication middleware with public paths

```python
from fastapi.responses import JSONResponse
PUBLIC_PATHS = {"/health", "/docs", "/openapi.json"}

def verify_token(token: str):
    return {"id": 1, "name": "ada"} if token == "secret" else None

@app.middleware("http")
async def authenticate(request: Request, call_next):
    if request.url.path in PUBLIC_PATHS:
        return await call_next(request)
    token = request.headers.get("Authorization", "").removeprefix("Bearer ")
    user = verify_token(token)
    if user is None:
        return JSONResponse(status_code=401, content={"error": "unauthorized"})
    request.state.user = user
    return await call_next(request)
```

Call `/hello` with no token (`401`), with `Authorization: Bearer wrong`
(`401`), and with `Authorization: Bearer secret` (`200`). Then call `/health`
with no token and confirm it's allowed through.

### 5. Structured access logging outermost

Add the `access_log` middleware and register it so it's outermost. Make a
request that gets rate-limited (`429`) and one that's unauthorized (`401`).
Expected: *both* appear in your logs with their true status. This is the
payoff of putting logging on the outside — you see rejected traffic.

### 6. Error-handling middleware catches a crash

```python
@app.get("/boom")
async def boom():
    raise RuntimeError("kaboom")   # simulate an unexpected bug
```

Add the `catch_errors` middleware and make it outer. Call `/boom`. Expected:
a clean `{"error": "internal server error"}` with `500`, and the full
traceback in your *server* logs (via `logger.exception`) — never in the
response. Remove the middleware and confirm the difference (raw error
surfaces).

### 7. Compression on a large response

```python
from fastapi.middleware.gzip import GZipMiddleware
app.add_middleware(GZipMiddleware, minimum_size=500)

@app.get("/big")
async def big():
    return {"data": "x" * 5000}
```

Request it with and without gzip support:

```bash
curl -s -o /dev/null -w "%{size_download}\n" -H "Accept-Encoding: gzip" localhost:8000/big
curl -s -o /dev/null -w "%{size_download}\n" localhost:8000/big
```

Expected: the gzip request downloads far fewer bytes, and its response carries
`Content-Encoding: gzip`. Small responses (under 500 bytes) stay uncompressed.

### 8. Handle a multipart file upload

```python
from fastapi import UploadFile

@app.post("/upload")
async def upload(file: UploadFile):
    contents = await file.read()
    return {"filename": file.filename, "size_bytes": len(contents),
            "content_type": file.content_type}
```

Upload a file: `curl -F "file=@README.md" localhost:8000/upload`. Expected:
the JSON reports the filename, byte size, and content type. Note you declared
`UploadFile` and FastAPI parsed the `multipart/form-data` body for you — a
different encoding than JSON, handled by the framework.

### 9. Diagnose and fix: an ordering security bug

This stack throttles login attempts and authenticates, but a penetration test
reveals an attacker can make unlimited password-guessing attempts against
`/login` without ever being rate-limited, and rejected requests never appear
in the logs. The middleware *functions* are correct — the **order** is wrong.
Fix the registration so (a) rate limiting happens before auth, and (b) logging
captures every request.

```python
app = FastAPI()

# registered in this order:
app.add_middleware(GZipMiddleware)                 # (1)
# ... authenticate registered here (2) ...
# ... rate_limit registered here (3) ...
# ... access_log registered here (4) ...
```

<details>
<summary>Solution</summary>

Recall: with `add_middleware`, the **last registered is outermost**. So the
onion above (outer → inner) is: `access_log` (4, outermost) → `rate_limit`
(3) → `authenticate` (2) → `GZip` (1, innermost). Reading that carefully, the
*intended* order is actually almost right — but the described symptom
("unlimited attempts, no logs") means in the buggy version rate_limit was
registered *inside* authenticate (so auth ran first) and access_log was
*inside* both. The fix is to register in the order that yields this onion,
outer → inner:

```
access_log (outermost)  ->  rate_limit  ->  authenticate  ->  handler  ->  GZip
```

Since last-registered is outermost, register them in this sequence:

```python
app.add_middleware(GZipMiddleware, minimum_size=500)   # innermost-ish (response side)
# authenticate         (register 3rd from the end)
# rate_limit           (register 2nd from the end)
# access_log           (register LAST -> outermost)
```

With `@app.middleware("http")` decorators, the *last-defined* function is
outermost, so define `authenticate`, then `rate_limit`, then `access_log`
last. Verify with a trace: a rate-limited request should now (a) be logged and
(b) never reach `authenticate`. Lesson: identical middleware *functions*
produce completely different security properties depending purely on order —
rate limiting must be outside auth, and logging must be outside both.

</details>

## Independent challenge

No code given. Assemble the full canonical stack on your `api-layer` app:
error handling, structured logging, CORS, rate limiting, authentication,
security headers, and compression — in the correct order. Then *prove* the
order is right by constructing three requests: one that is rate-limited, one
that is unauthorized, and one that triggers an unhandled exception in a
handler; and demonstrate that all three still (a) appear in your logs with the
correct final status and (b) carry your security headers on the way out.
Reuse the **short-circuit** concept from module 03 to reason about why a
rate-limited request never reaches auth, and reuse module 03's request-ID
middleware so every log line and every error response carries the same id.

<details>
<summary>Hint</summary>

Register from innermost to outermost bearing in mind last-registered wins:
security headers/GZip relate to the *response* and can be inner; error
handling and logging must be *outer* to see everything. Put the request-ID
middleware outermost (or just inside logging) so the id exists before any log
line is written. To prove headers apply to rejected requests, remember
short-circuit responses still travel outward through every outer middleware —
so if security headers are added on the way out by an outer layer, even a
`429` gets them.

</details>

## Common mistakes & troubleshooting

- **Rate limiting after auth.** Lets attackers exhaust expensive
  authentication logic. Rate limiting must be *outside* (before) auth.
- **Logging inside auth.** Rejected requests never get logged — you're blind
  to attacks. Logging goes outermost.
- **Error handling on the inside.** An exception in an outer middleware escapes
  it and leaks a stack trace. Put the catch-all error handler outermost.
- **`allow_origins=["*"]` with `allow_credentials=True`.** Insecure and
  spec-forbidden. Name explicit origins when using credentials.
- **CORS too deep in the stack.** The browser's preflight `OPTIONS` can get
  rejected by auth/rate-limit before CORS answers it. Keep CORS near the top.
- **Hand-rolling production security middleware.** Use `CORSMiddleware`,
  vetted rate-limit libraries with a shared store, and explicit standard
  headers — don't invent your own.
- **In-memory rate limiting across multiple workers.** Each process has its
  own counter, so the real limit is `N × workers`. Use a shared store (Redis)
  in production.
- **Sending HSTS over plain HTTP.** `Strict-Transport-Security` should only be
  emitted over HTTPS; sending it over HTTP is meaningless/harmful in some
  proxy setups.

## Checkpoint quiz

Write down your answer to each question before expanding it — checking without attempting first is the single easiest way to fool yourself into thinking you've learned this.

1. Why must rate limiting sit *before* authentication in the middleware
   order? Give the concrete attack that the wrong order enables.
2. Why does logging middleware belong on the outermost layer, and what do you
   lose if it's inside auth?
3. What does `X-Content-Type-Options: nosniff` do, and what does
   `Strict-Transport-Security` do?
4. Why is `allow_origins=["*"]` combined with `allow_credentials=True`
   forbidden, and why must CORS sit near the outside of the stack?
5. Where must error-handling middleware sit to guarantee no stack trace ever
   reaches a client, and why?
6. Name the three body encodings the framework parses for you, and which one
   is used for file uploads.
7. Your in-memory rate limiter allows 100 req/min but you run 4 worker
   processes. What's the *actual* limit a single client experiences, and how
   do you fix it?

<details>
<summary>Answers</summary>

1. So abusive traffic (e.g. brute-force login guesses) is throttled before it
   reaches the CPU-expensive authentication/password-verification logic. If
   auth runs first, an attacker can force unlimited expensive verification
   work by spamming — a resource-exhaustion and brute-force vector.
2. So it records *every* request, including those rejected by inner middleware
   (`429` rate-limited, `401` unauthorized). Inside auth, rejected requests
   are never logged and you're blind to exactly the attack traffic you most
   need to see.
3. `nosniff` stops the browser from guessing (MIME-sniffing) a response's
   content type, closing a vector where data gets executed as script. HSTS
   tells the browser to only ever connect over HTTPS, defeating downgrade/
   SSL-stripping attacks.
4. The CORS spec forbids wildcard origin with credentials because it would let
   *any* site make authenticated cross-origin requests — you must name
   explicit origins. CORS sits near the outside so the browser's preflight
   `OPTIONS` is answered before auth/rate-limiting could wrongly reject it.
5. Outermost (outer enough to wrap every layer that might throw). An exception
   in a layer *outside* the error handler isn't caught, so the handler must
   wrap everything below it; then any exception becomes a clean response
   instead of a leaked trace.
6. JSON, URL-encoded form data, and multipart (`multipart/form-data`).
   Multipart is used for file uploads (declared with `UploadFile`).
7. About 400 req/min (100 per process × 4 processes), because each worker has
   its own in-memory counter. Fix by using a shared store like Redis so the
   count is global across workers.

</details>

## Next

[05-request-context](../05-request-context/README.md) — auth middleware
stashed the user on `request.state`; now you'll formalize request-scoped
state: what belongs in it, how to share it across layers without tight
coupling, and how FastAPI's dependency injection makes it clean.
