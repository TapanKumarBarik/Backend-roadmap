# Module 05: HTTP Responses and Status Codes

## Why this matters

The status code is the server's three-digit executive summary of what
happened. It's the first thing every client — browser, library, proxy,
cache, monitoring tool — looks at, and it drives *automatic behavior*: a
`301` makes a browser remember a new URL forever, a `304` makes it reuse a
cached copy, a `429` makes a well-written client back off and retry, a
`503` makes a load balancer mark the backend unhealthy. Return the wrong
code and every one of those automatic behaviors does the wrong thing.

The most common failure in real APIs is returning `200 OK` for everything
and stuffing `{"error": "not found"}` in the body. Now every client has to
parse your body to discover something the status line was designed to tell
them at a glance — caches cache your errors, retry logic can't tell a
retryable failure from a permanent one, and monitoring can't distinguish
"my API is healthy" from "my API is returning errors with a smile." Codes
are a contract; this module is about honoring it.

You've already met `200`, `201`, `204`, `404`, and `405` in modules 03-04.
Here we complete the map — all five classes, the codes you'll actually use
weekly, and the precise "when do I return which" judgment that makes an API
feel correct.

## Concepts

### The five classes

The first digit classifies the response:

- **`1xx` Informational** — interim, rarely seen directly (`100 Continue`,
  `101 Switching Protocols` for WebSocket upgrades). You mostly don't
  return these by hand.
- **`2xx` Success** — the request succeeded. `200`, `201`, `202`, `204`.
- **`3xx` Redirection** — more action needed, usually "go look
  elsewhere." `301`, `302`, `304`, `307`, `308`.
- **`4xx` Client error** — *the caller* did something wrong; don't retry
  unchanged. `400`, `401`, `403`, `404`, `405`, `409`, `422`, `429`.
- **`5xx` Server error** — *the server* failed; the request may be fine
  and worth retrying. `500`, `502`, `503`, `504`.

The `4xx`/`5xx` split is the most consequential distinction in all of
HTTP: `4xx` means "you broke it, fixing your request might help"; `5xx`
means "I broke it, your request might be fine — retry may succeed." Retry
logic, alerting, and blame all hinge on this line.

### The 2xx codes worth knowing

- **`200 OK`** — generic success with a body. `GET` that found something,
  `PUT`/`PATCH` that returns the updated resource.
- **`201 Created`** — a new resource was created. Pair with a `Location`
  header pointing at it (module 03). The canonical `POST` success.
- **`202 Accepted`** — the request was accepted for *asynchronous*
  processing; it isn't done yet. Used when work is queued (a later track's
  background jobs). The response often includes a status URL to poll.
- **`204 No Content`** — success, and there is deliberately *no body*.
  The canonical `DELETE` success, and a valid `PUT`/`PATCH` result when
  you don't echo the resource back. A `204` must not have a body.

### The 3xx codes worth knowing

- **`301 Moved Permanently`** — this resource lives at a new URL forever;
  update your bookmarks/links. Browsers and search engines cache this
  aggressively — a `301` is hard to take back, so be sure. Include
  `Location` with the new URL.
- **`302 Found` / `307 Temporary Redirect`** — go here *for now*, but keep
  using the original URL next time. `307` is the modern, method-preserving
  version (a `307` on a POST re-POSTs; historically `302` sometimes got
  turned into a GET, which `307` fixes).
- **`308 Permanent Redirect`** — like `301` but method-preserving.
- **`304 Not Modified`** — a *conditional* response: "your cached copy is
  still current; reuse it, I'm sending no body." This is the beating heart
  of HTTP caching (module 06) and saves enormous bandwidth. It's a `3xx`
  because it tells the client to take action (use its cache).

`Location` is the header that says *where* for the redirect family (module
02).

### The 4xx codes worth knowing

- **`400 Bad Request`** — the request is malformed or nonsensical (bad
  JSON syntax, missing required field the server can't even parse). "I
  can't understand this."
- **`401 Unauthorized`** — you're not authenticated (no/invalid
  credentials). Misnamed: it means *unauthenticated*. Pair with
  `WWW-Authenticate` (module 02).
- **`403 Forbidden`** — you're authenticated but *not allowed* to do this.
  "I know who you are; you can't." (401 = who are you; 403 = you can't.)
- **`404 Not Found`** — no such resource. Also used to *hide* existence
  ("I won't confirm this exists to you").
- **`405 Method Not Allowed`** — the resource exists but not for this
  method; include an `Allow` header (module 03).
- **`409 Conflict`** — the request conflicts with current state (e.g.
  creating a user whose email already exists; an edit based on a stale
  version). "This clashes with reality."
- **`422 Unprocessable Entity`** — the syntax is fine but the *semantics*
  are invalid (well-formed JSON, but `age: -5` fails validation). This is
  what FastAPI returns for validation errors. The distinction from `400`:
  `400` = "I can't parse this"; `422` = "I parsed it, but the values are
  invalid."
- **`429 Too Many Requests`** — rate limited. Pair with `Retry-After`
  telling the client when to try again (module 02).

### The 5xx codes worth knowing

- **`500 Internal Server Error`** — an unhandled exception / bug in your
  code. The generic "something blew up on my side." Never leak the stack
  trace to clients in production.
- **`502 Bad Gateway`** — a proxy/load balancer got an invalid response
  from the upstream server it forwarded to (module 00's proxy layer). Often
  means your app crashed or isn't speaking HTTP correctly behind the proxy.
- **`503 Service Unavailable`** — the server is temporarily unable to
  handle the request (overloaded, in maintenance, no healthy backends).
  Pair with `Retry-After`. A load balancer with zero healthy backends
  returns this.
- **`504 Gateway Timeout`** — a proxy waited for the upstream and it never
  answered in time (module 00: the upstream was too slow or hung).

`502`, `503`, `504` are the trio you'll debug when "the API is down" —
they tell you *which layer* failed: `502` = upstream gave garbage, `503` =
no capacity, `504` = upstream too slow.

### Choosing the right code: the decision path

When writing a handler, walk this:

1. Did the client's request make sense syntactically? No → `400`.
2. Are they authenticated (if required)? No → `401`.
3. Are they allowed to do this? No → `403`.
4. Does the target resource exist? No → `404`.
5. Is the method supported here? No → `405`.
6. Is the body valid per your rules? No → `422`.
7. Does it conflict with current state? Yes → `409`.
8. Are they over their rate limit? Yes → `429`.
9. Otherwise do the work. Created something new? → `201` + `Location`.
   Nothing to return? → `204`. Otherwise → `200`.
10. If *your* code fails doing the work → `500` (or `502/503/504` at the
    infra layer).

### The response body for errors

A `4xx`/`5xx` should still carry a *machine-readable* body explaining the
problem — but the *status code* must independently convey the class. A
common good shape is RFC 9457 "problem details":

```json
{
  "type": "https://api.example.com/errors/validation",
  "title": "Validation failed",
  "status": 422,
  "detail": "age must be >= 0",
  "errors": [{"field": "age", "message": "must be >= 0"}]
}
```

The rule: the body *elaborates*; the status code *classifies*. Never make
the client parse the body to learn success vs. failure.

## Command reference

| Command | What it does |
|---|---|
| `curl -o /dev/null -s -w '%{http_code}\n' URL` | Print just the status code |
| `curl -i URL` | Show status line + headers + body |
| `curl -s -D - -o /dev/null URL` | Show status line + headers only |
| `curl -L URL` | Follow `3xx` redirects (uses `Location`) |
| `curl -i -X DELETE URL` | See a `204`/`404` for a delete |
| `raise HTTPException(status_code=..., detail=...)` (FastAPI) | Return an error code from code |

Notes:

- **`-w '%{http_code}'`** writes out just the numeric code — great for
  scripting/monitoring ("is this endpoint returning 2xx?").
- **`-L`** makes curl *follow* redirects by issuing a new request to the
  `Location` URL. Without it, you *see* the `301`/`302` itself.
- In FastAPI, returning a value → `200` (or the route's declared
  `status_code`); `raise HTTPException(status_code=404, detail="...")`
  produces a `4xx`/`5xx` with a JSON body; validation failures
  auto-produce `422`.

Example app used below:

```python
from fastapi import FastAPI, HTTPException, Response, status
from pydantic import BaseModel, Field

app = FastAPI()
USERS = {1: {"id": 1, "name": "Ada", "email": "ada@x.com"}}

class NewUser(BaseModel):
    name: str
    email: str
    age: int = Field(ge=0)          # age must be >= 0

@app.get("/users/{uid}")
def get_user(uid: int):
    if uid not in USERS:
        raise HTTPException(status_code=404, detail="user not found")
    return USERS[uid]

@app.post("/users", status_code=status.HTTP_201_CREATED)
def create(user: NewUser, response: Response):
    for u in USERS.values():
        if u["email"] == user.email:
            raise HTTPException(status_code=409, detail="email already exists")
    uid = max(USERS) + 1
    USERS[uid] = {"id": uid, **user.model_dump()}
    response.headers["Location"] = f"/users/{uid}"
    return USERS[uid]

@app.delete("/users/{uid}", status_code=status.HTTP_204_NO_CONTENT)
def delete(uid: int):
    USERS.pop(uid, None)
    return Response(status_code=status.HTTP_204_NO_CONTENT)

@app.get("/boom")
def boom():
    raise RuntimeError("simulated bug")     # becomes a 500
```

## Hands-on exercises

Run with `uvicorn app:app --reload`.

### 1. Read just the code

```bash
curl -o /dev/null -s -w 'GET /users/1 -> %{http_code}\n' http://127.0.0.1:8000/users/1
curl -o /dev/null -s -w 'GET /users/99 -> %{http_code}\n' http://127.0.0.1:8000/users/99
```

Expected: `200` then `404`. The code alone tells you success vs.
not-found — no body parsing needed.

### 2. 201 + Location on create

```bash
curl -s -i -X POST -H 'Content-Type: application/json' \
  -d '{"name":"Lin","email":"lin@x.com","age":30}' http://127.0.0.1:8000/users
```

Expected: `HTTP/1.1 201 Created` and a `location: /users/2` header. That's
the canonical create response (module 03).

### 3. 204 on delete — and no body

```bash
curl -s -i -X DELETE http://127.0.0.1:8000/users/2
```

Expected: `HTTP/1.1 204 No Content` and *no* response body. Confirm the
body is empty — a `204` must not send one.

### 4. 422 vs 400 — validation vs. unparseable

```bash
# Well-formed JSON, invalid value (age negative) -> 422
curl -s -i -X POST -H 'Content-Type: application/json' \
  -d '{"name":"X","email":"x@x.com","age":-5}' http://127.0.0.1:8000/users
# Malformed JSON -> 422/400 depending; note the difference
curl -s -i -X POST -H 'Content-Type: application/json' \
  -d '{"name":"X", "email":' http://127.0.0.1:8000/users
```

Expected: the first returns `422 Unprocessable Entity` with a body
pointing at the `age` field (parsed fine, value invalid). The second is a
parse failure. Internalize the distinction: `422` = valid syntax, invalid
semantics; `400` = can't even parse.

### 5. 409 conflict

```bash
curl -s -i -X POST -H 'Content-Type: application/json' \
  -d '{"name":"Ada2","email":"ada@x.com","age":40}' http://127.0.0.1:8000/users
```

Expected: `409 Conflict` — `ada@x.com` already exists. The request was
well-formed and valid, but conflicts with current state.

### 6. 500 — and what leaks

```bash
curl -s -i http://127.0.0.1:8000/boom
```

Expected: `500 Internal Server Error`. In `--reload`/debug mode you may
see a traceback; in production you must *not* leak it. Note this is a
`5xx` (server's fault) — a client would be right to retry, though here it
will fail again because it's a real bug.

### 7. Follow a redirect

FastAPI adds a redirect for trailing-slash mismatches by default. Try:

```bash
curl -s -i http://127.0.0.1:8000/users/         # note trailing slash
curl -s -i -L http://127.0.0.1:8000/users/
```

Expected: without `-L` you see a `307`/`308` with a `location` header;
with `-L`, curl follows it to the final response. Seeing the redirect
itself vs. following it is the difference `-L` makes.

### 8. Map the decision path

For each scenario, write the code you'd return *before* checking, then
verify your reasoning against the decision path in Concepts:

- Request body isn't valid JSON at all. → ?
- Valid JSON, but missing a required field / bad value. → ?
- No auth token on a protected route. → ?
- Valid token, but this user can't access this resource. → ?
- Resource genuinely doesn't exist. → ?
- Creating something whose unique key already exists. → ?
- Client has made 10,000 requests this minute. → ?

Expected: `400`, `422`, `401`, `403`, `404`, `409`, `429`. If any were
wrong, reread that code's paragraph.

### 9. Diagnose and fix: 200-for-everything

Here's a broken handler. Add it and see why it's bad:

```python
@app.get("/legacy/users/{uid}")
def legacy_get(uid: int):
    if uid not in USERS:
        # BUG: signals "not found" with a 200 and an error body
        return {"error": "user not found"}
    return USERS[uid]
```

```bash
curl -o /dev/null -s -w '%{http_code}\n' http://127.0.0.1:8000/legacy/users/99
curl -s http://127.0.0.1:8000/legacy/users/99
```

Expected: status `200` even though the user doesn't exist, with an
`{"error": ...}` body. **Diagnose:** every client, cache, and monitor now
believes this succeeded. A cache may store the "error" as a valid
response; a retry-on-5xx client won't retry; a dashboard counting non-2xx
sees zero errors. **Fix:** `raise HTTPException(status_code=404,
detail="user not found")` so the *status line* carries the truth and the
body merely elaborates. Re-run: the code is now `404`. Lesson: classify
with the status code; elaborate in the body.

## Independent challenge

No code given.

**Task:** Build a `/orders` endpoint set that returns the *semantically
correct* status code for every one of these situations, and prove each
with a curl command that prints just `%{http_code}`: (1) successfully
fetching an existing order; (2) creating a new order; (3) fetching an
order that doesn't exist; (4) creating an order with a negative quantity;
(5) creating a duplicate order (same idempotency key/unique field as an
existing one); (6) deleting an order; (7) an internal failure while
processing. For the create-success case, also verify the correct header
that points at the new resource is present (from module 03). Do not use
`200` for any error case. This exercises the full decision path and the
method/code pairings from module 03.

<details>
<summary>Hint</summary>

The seven expected codes are `200`, `201`, `404`, `422`, `409`, `204`,
`500`. For (2), remember `201` needs a `Location` header. For (7), let an
exception propagate (or raise `HTTPException(status_code=500)`) — but in a
real app you'd catch it and return a clean problem-details body without
leaking internals.

</details>

## Common mistakes & troubleshooting

- **`200` for errors.** The cardinal sin. Clients, caches, and monitoring
  all key off the status code; hiding failures behind `200` breaks them
  all.
- **Confusing `401` and `403`.** `401` = not authenticated (who are you?);
  `403` = authenticated but not permitted (you can't). Wrong choice
  confuses clients about whether to re-login.
- **Confusing `400` and `422`.** `400` = unparseable/malformed; `422` =
  parsed fine but failed validation rules.
- **`301` used casually.** It's permanent and cached hard by browsers/
  search engines — painful to reverse. Use `302`/`307` for temporary.
- **`204` with a body.** A `204` must have no body; sending one is
  malformed and confuses clients.
- **Not distinguishing `502`/`503`/`504`.** They pinpoint *which layer*
  failed (upstream garbage / no capacity / upstream too slow) — key for
  ops debugging.
- **Leaking stack traces on `500`.** Never expose internal errors to
  clients; log them server-side, return a clean generic message.
- **Missing `Retry-After` on `429`/`503`.** Well-behaved clients honor it
  to back off; without it they hammer you.

## Checkpoint quiz

Write down your answer to each question before expanding it — checking without attempting first is the single easiest way to fool yourself into thinking you've learned this.

1. What is the single most important distinction between a `4xx` and a
   `5xx` code, and how does it affect retry logic?
2. A client sends syntactically valid JSON, but `age` is `-5` and your
   rules require `age >= 0`. What code, and how does it differ from the
   code for genuinely malformed JSON?
3. Distinguish `401` and `403` in one sentence each.
4. What status code and what header should a successful resource-creating
   `POST` return?
5. What does `304 Not Modified` tell the client to do, and which upcoming
   module is it central to?
6. You're debugging "the site is down." You see `502` from the load
   balancer for some requests and `504` for others. What does each tell
   you about where the failure is?
7. Why is returning `200` with `{"error": "..."}` for a missing resource
   harmful? Name two concrete things it breaks.

<details>
<summary>Answers</summary>

1. `4xx` = the client's request was wrong (retrying it unchanged won't
   help); `5xx` = the server failed (the request may be fine, so a retry
   might succeed). Retry logic should generally retry `5xx` (and `429`
   with backoff) but not blindly retry `4xx`.
2. `422 Unprocessable Entity` — the JSON parsed fine but a value failed
   validation. Malformed/unparseable JSON is `400 Bad Request` ("I can't
   even parse this"), versus `422` ("I parsed it; the values are invalid").
3. `401` = you are not authenticated (no/invalid credentials — "who are
   you?"). `403` = you are authenticated but not permitted to do this
   ("you can't").
4. `201 Created`, with a `Location` header pointing at the new resource's
   URL.
5. It tells the client its cached copy is still valid, so it should reuse
   the cache; the server sends no body. It's central to module 06 (HTTP
   caching).
6. `502 Bad Gateway` = the proxy got an invalid/garbage response from the
   upstream app (likely crashed or misbehaving). `504 Gateway Timeout` =
   the proxy waited and the upstream never responded in time (upstream
   hung or too slow).
7. It lies to every consumer of the status code. E.g.: caches may store
   the "error" as a successful response; monitoring counting non-2xx sees
   no errors; retry-on-5xx logic won't retry a genuine failure; clients
   must parse the body to learn success vs. failure. (Any two.)

</details>

## Next

[06-http-caching](../06-http-caching/README.md) — you just met `304`;
now we build the whole caching system around it: `Cache-Control`, `ETag`,
`Last-Modified`, and conditional requests.
