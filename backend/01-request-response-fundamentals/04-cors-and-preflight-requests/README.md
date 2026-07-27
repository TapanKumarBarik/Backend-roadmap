# Module 04: CORS and Preflight Requests

## Why this matters

CORS is the single most misunderstood topic in web backend work, and the
error message everyone eventually hits: *"Access to fetch at
'https://api.example.com' from origin 'https://app.example.com' has been
blocked by CORS policy."* People react to that message by frantically
adding `Access-Control-Allow-Origin: *` until it goes away, with no idea
what they just did or why it was blocked in the first place. That's how
you end up either with an API that doesn't work or one that's wide open to
every website on the internet.

Here's the mental unlock: **CORS is enforced by the browser, not your
server, and it protects the *user*, not the *server*.** Your API is
perfectly reachable — `curl` hits it fine, your mobile app hits it fine.
It's specifically the *browser*, running JavaScript from one origin, that
refuses to let that script *read* a response from a *different* origin
unless the other origin's server explicitly says "I allow this." Once you
see that CORS is a browser safety mechanism layered on top of ordinary
HTTP — using the `Origin` request header (module 02) and a family of
`Access-Control-*` response headers — the whole thing becomes mechanical.

And the mysterious extra request: for certain cross-origin calls the
browser sends an `OPTIONS` request *first* — the **preflight** — to ask
permission before sending the real one. Understanding exactly when that
happens and what it looks like on the wire is the payoff of this module.

## Concepts

### Same-origin policy: the thing CORS relaxes

Browsers enforce the **same-origin policy**: JavaScript running on a page
from origin A may freely read responses from origin A, but is blocked from
*reading* responses from origin B. An **origin** is the triple
**scheme + host + port**. `https://app.example.com` and
`https://api.example.com` are *different* origins (different host).
`http://x.com` and `https://x.com` differ (scheme). `x.com:80` and
`x.com:8080` differ (port).

Why does this policy exist? Without it, a malicious page you visit could
use *your* browser (carrying *your* cookies) to read your bank's API and
steal the data. Same-origin policy stops that page's script from reading
the response. CORS is the *controlled, opt-in* way for a server to say
"actually, this specific other origin is allowed to read my responses."

Critically: same-origin policy blocks the *script from reading the
response* — the request often still reaches your server and executes. That
surprises people: a blocked CORS request may have already created a
resource; the browser just won't let the JavaScript see the answer. (This
is exactly why "simple" unsafe requests are dangerous and why preflight
exists — see below.)

### CORS is browser-enforced — a fact you can prove

Your server sends the same response no matter who asks. `curl`, Postman,
a mobile app, another server — none of them enforce CORS; they read the
response freely. Only browsers implement the same-origin policy and honor
(or reject based on) the `Access-Control-*` headers. So:

- If `curl` works but the browser shows a CORS error, your API is fine —
  you just haven't told the *browser* it's allowed.
- Adding CORS headers doesn't make your API "more open" to `curl`/servers;
  they already had full access. It only affects browsers.

### The `Origin` header and the permission grant

When a browser makes a cross-origin request, it automatically adds an
**`Origin`** request header naming the page's origin:

```
GET /data HTTP/1.1
Host: api.example.com
Origin: https://app.example.com
```

The server decides whether to allow it and answers with an
**`Access-Control-Allow-Origin`** response header:

```
HTTP/1.1 200 OK
Access-Control-Allow-Origin: https://app.example.com
Content-Type: application/json
```

The browser compares the request's `Origin` against
`Access-Control-Allow-Origin`. If they match (or the header is `*`), the
browser lets the script read the response. If they don't match, or the
header is absent, the browser *blocks the script from reading it* and
raises the CORS error — even though a `200` came back.

### Simple requests vs. preflighted requests

Not every cross-origin request triggers a preflight. The browser
distinguishes two cases:

**A "simple" request** (the browser sends it directly, then checks CORS on
the *response*) meets *all* of these:

- Method is `GET`, `HEAD`, or `POST`.
- Only "CORS-safelisted" request headers are set (`Accept`,
  `Accept-Language`, `Content-Language`, and `Content-Type` — but *only*
  if `Content-Type` is `application/x-www-form-urlencoded`,
  `multipart/form-data`, or `text/plain`).
- No custom headers (no `Authorization`, no `X-*`, no
  `Content-Type: application/json`).

**A "preflighted" request** — anything *not* simple — triggers a
preliminary `OPTIONS` request first. In practice, almost every real API
call is preflighted, because:

- It uses `PUT`, `PATCH`, or `DELETE` (not in the simple method list), OR
- It sends `Content-Type: application/json` (not a safelisted content
  type), OR
- It sends an `Authorization` header or any custom `X-*` header.

So: your typical `fetch('/api', {method: 'POST', headers: {'Content-Type':
'application/json', 'Authorization': 'Bearer ...'}})` is **always
preflighted**.

### What a preflight actually looks like on the wire

The browser sends this **before** the real request, automatically — your
JavaScript never issues it:

```
OPTIONS /users HTTP/1.1
Host: api.example.com
Origin: https://app.example.com
Access-Control-Request-Method: PUT
Access-Control-Request-Headers: content-type, authorization
```

Read it: "I'm from `https://app.example.com`, and I *intend* to send a
`PUT` with `content-type` and `authorization` headers — is that allowed?"

The server answers the preflight (with an empty body, typically `204`):

```
HTTP/1.1 204 No Content
Access-Control-Allow-Origin: https://app.example.com
Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE
Access-Control-Allow-Headers: content-type, authorization
Access-Control-Max-Age: 600
```

Read it: "Yes — that origin may use those methods and send those headers,
and you may cache this permission for 600 seconds." Only *after* this
approval does the browser send the actual `PUT`. If the preflight is
denied (missing/mismatched headers), the browser never sends the real
request at all, and your JavaScript gets a CORS error.

`Access-Control-Max-Age` matters for performance: it lets the browser
skip the preflight for subsequent identical requests within that window,
so you don't pay an extra round trip on every call (module 00's latency
lesson — an extra round trip is expensive).

### Credentials make it stricter

If the browser request includes credentials (cookies or HTTP auth) — e.g.
`fetch(url, {credentials: 'include'})` — two extra rules kick in:

- The server *must* respond with
  `Access-Control-Allow-Credentials: true`.
- `Access-Control-Allow-Origin` **may not be `*`** — it must name the
  exact origin. (A wildcard plus credentials is forbidden precisely
  because it would let any site make authenticated requests.)

This is why "just set `*`" breaks the moment you add cookies.

### The headers, summarized

| Header | Direction | Meaning |
|---|---|---|
| `Origin` | request | The calling page's scheme+host+port |
| `Access-Control-Request-Method` | request (preflight) | Method the real request will use |
| `Access-Control-Request-Headers` | request (preflight) | Headers the real request will send |
| `Access-Control-Allow-Origin` | response | Which origin may read the response |
| `Access-Control-Allow-Methods` | response (preflight) | Allowed methods |
| `Access-Control-Allow-Headers` | response (preflight) | Allowed request headers |
| `Access-Control-Allow-Credentials` | response | Whether cookies/auth are allowed |
| `Access-Control-Max-Age` | response (preflight) | How long to cache the preflight result |
| `Access-Control-Expose-Headers` | response | Which response headers JS may read |

## Command reference

| Command | What it does |
|---|---|
| `curl -H 'Origin: https://app.example.com' -i URL` | Simulate a cross-origin request; see `Access-Control-Allow-Origin` |
| `curl -X OPTIONS -H 'Origin: ...' -H 'Access-Control-Request-Method: PUT' -H 'Access-Control-Request-Headers: content-type' -i URL` | Simulate a preflight |
| `curl -i URL` (no `Origin`) | A same-origin-style request; note CORS headers are usually absent |

Notes:

- `curl` never *enforces* CORS — it always shows you the body. What you're
  inspecting is whether the *server sent the right headers* for a browser
  to allow it. That's the whole game.
- To simulate a preflight you must send `-X OPTIONS` plus the two
  `Access-Control-Request-*` headers the browser would send.

FastAPI with CORS configured properly (used in exercises):

```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://app.example.com"],   # exact origin, not "*"
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
    allow_headers=["Content-Type", "Authorization"],
    allow_credentials=True,
    max_age=600,
)

@app.get("/data")
def data():
    return {"value": 42}

@app.put("/users/{uid}")
def replace(uid: int, body: dict):
    return {"id": uid, **body}
```

## Hands-on exercises

Run the app with `uvicorn app:app --reload`.

### 1. See that your API works fine without CORS (from curl)

Temporarily comment out the `add_middleware` block, restart, then:

```bash
curl -s -i http://127.0.0.1:8000/data
```

Expected: `200 OK` and `{"value": 42}` — no CORS headers, no problem.
`curl` doesn't care about CORS. This proves your API is reachable; CORS is
purely a *browser* concern.

### 2. A cross-origin GET without permission

With CORS still disabled, simulate a browser's cross-origin request:

```bash
curl -s -i -H 'Origin: https://app.example.com' http://127.0.0.1:8000/data
```

Expected: `200 OK` with the body, but **no** `Access-Control-Allow-Origin`
header. A real browser seeing this would *block the script from reading
the response* and throw the CORS error — even though the request
succeeded and the body is right there. That gap (request succeeded, script
can't read it) is the essence of CORS.

### 3. Enable CORS and watch the grant appear

Re-enable the `add_middleware` block, restart, then repeat:

```bash
curl -s -i -H 'Origin: https://app.example.com' http://127.0.0.1:8000/data
```

Expected: now the response includes
`access-control-allow-origin: https://app.example.com`. A browser would
now let the script read it. You changed nothing about the *data* — only
the *permission headers*.

### 4. Trigger and read a real preflight

```bash
curl -s -i -X OPTIONS \
  -H 'Origin: https://app.example.com' \
  -H 'Access-Control-Request-Method: PUT' \
  -H 'Access-Control-Request-Headers: content-type' \
  http://127.0.0.1:8000/users/1
```

Expected: a `200`/`204` with `access-control-allow-origin`,
`access-control-allow-methods` (including `PUT`),
`access-control-allow-headers` (including `content-type`), and
`access-control-max-age: 600`. This is the exact exchange a browser does
*silently* before your `fetch` PUT. No `PUT` was executed — this only
asked permission.

### 5. See what triggers a preflight vs. not

Reason about each `fetch` and confirm with curl simulation:

- `GET /data` with no custom headers → **simple**, no preflight (exercise
  3 was the direct request).
- `POST /data` with `Content-Type: application/json` → **preflighted**
  (JSON content type isn't safelisted).
- `PUT /users/1` → **preflighted** (PUT isn't a simple method).

Simulate the JSON POST preflight:

```bash
curl -s -i -X OPTIONS \
  -H 'Origin: https://app.example.com' \
  -H 'Access-Control-Request-Method: POST' \
  -H 'Access-Control-Request-Headers: content-type' \
  http://127.0.0.1:8000/data
```

Expected: an allow response. Confirm to yourself *why* a plain
form-encoded POST would skip this but a JSON POST doesn't.

### 6. Origin mismatch is rejected

```bash
curl -s -i -H 'Origin: https://evil.example.com' http://127.0.0.1:8000/data
```

Expected: **no** `access-control-allow-origin` for
`https://evil.example.com` (the middleware only allows
`app.example.com`). A browser would block `evil.example.com`'s script from
reading the response. Your allowlist did its job. Note the body is still
returned in curl — again, enforcement is the browser's.

### 7. Credentials + wildcard is forbidden

Change the middleware to `allow_origins=["*"]` *and*
`allow_credentials=True`, restart, and simulate a credentialed request:

```bash
curl -s -i -H 'Origin: https://app.example.com' http://127.0.0.1:8000/data
```

Expected: FastAPI's CORS middleware will *not* emit `*` together with
credentials — it echoes the specific origin instead (or you'll see the
combination refused). The rule: **`Access-Control-Allow-Origin: *` and
`Access-Control-Allow-Credentials: true` cannot coexist.** Set the origin
back to the explicit value.

### 8. Diagnose and fix: the classic CORS failure

Here's a broken config. Set it and reproduce the failure:

```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://app.example.com"],
    allow_methods=["GET", "POST"],          # BUG: no PUT/PATCH/DELETE
    allow_headers=["Content-Type"],         # BUG: no Authorization
    allow_credentials=True,
)
```

A front-end does `fetch('/users/1', {method: 'PUT', headers:
{'Content-Type': 'application/json', 'Authorization': 'Bearer x'}})`.
Simulate its preflight:

```bash
curl -s -i -X OPTIONS \
  -H 'Origin: https://app.example.com' \
  -H 'Access-Control-Request-Method: PUT' \
  -H 'Access-Control-Request-Headers: content-type, authorization' \
  http://127.0.0.1:8000/users/1
```

Expected: the preflight response's `access-control-allow-methods` lacks
`PUT` and `access-control-allow-headers` lacks `authorization`, so a
browser would **deny the preflight** and never send the real PUT — the
developer sees "blocked by CORS policy" and, misdiagnosing, often
concludes "the PUT endpoint is broken." **Diagnose:** the endpoint is
fine; the *preflight* was denied because `PUT` and `Authorization` aren't
allowed. **Fix:** add `"PUT"`, `"PATCH"`, `"DELETE"` to `allow_methods`
and `"Authorization"` to `allow_headers`, restart, and re-run the
preflight — now it approves. Lesson: a CORS error is usually a
*preflight* configuration problem, not a broken endpoint.

## Independent challenge

No code given.

**Task:** You have a public read API and a private write API on the same
FastAPI server. Configure CORS so that: (a) *anyone's* browser JavaScript
may read `GET /public/*` responses (this data is meant to be embeddable
anywhere); but (b) only your own front-end at `https://app.example.com`
may perform authenticated writes (`POST`/`PUT`/`DELETE` to `/private/*`
with cookies), and no other origin may. Prove with curl-simulated
requests and preflights that a random origin can read `/public` but is
denied a `/private` write, and that your origin can do both. You'll need
to reason about why the credentialed private routes can't use a wildcard
origin (from this module) and how a `405`/preflight denial differs from a
`403` (module 03 + a preview of module 05).

<details>
<summary>Hint</summary>

You can't express "wildcard for public, specific origin for private" with
one global `CORSMiddleware` if credentials are involved. Consider mounting
two sub-applications (or two routers) with different CORS configs, or
handling CORS per-route: `/public` gets `allow_origins=["*"]` with
`allow_credentials=False`; `/private` gets
`allow_origins=["https://app.example.com"]` with
`allow_credentials=True`. Remember the wildcard+credentials prohibition.

</details>

## Common mistakes & troubleshooting

- **Thinking CORS protects your server.** It protects the *user's* browser
  session from malicious cross-origin scripts. Your server is reachable by
  non-browser clients regardless.
- **"Fixing" CORS with `allow_origins=["*"]` in production.** It makes
  your API readable by every website's JavaScript and is incompatible with
  credentials. Use an explicit allowlist.
- **Wildcard origin + credentials.** Forbidden by spec; the browser
  rejects it. Name the exact origin when cookies/auth are involved.
- **Forgetting the preflight is a separate request.** The browser sends an
  `OPTIONS` you never wrote. If it's denied, your real request never
  fires — and it's the preflight config (methods/headers), not the
  endpoint, that's wrong.
- **Not allowing the headers you actually send.** `Content-Type:
  application/json` and `Authorization` must appear in
  `Access-Control-Allow-Headers`, or the preflight fails.
- **Confusing a CORS block with a server error.** curl/Postman working but
  the browser failing is the telltale sign it's CORS, not your logic.
- **Omitting `Access-Control-Max-Age`.** Without it, the browser
  preflights *every* call, adding a round trip each time (module 00's
  latency cost).

## Checkpoint quiz

Write down your answer to each question before expanding it — checking without attempting first is the single easiest way to fool yourself into thinking you've learned this.

1. Who enforces CORS, and who/what does it protect? Why does `curl` never
   hit a CORS error?
2. Define "origin." Are `https://x.com` and `https://x.com:8443` the same
   origin? What about `http://x.com` and `https://x.com`?
3. List three things that make a cross-origin request "not simple" and
   therefore trigger a preflight.
4. Write the two `Access-Control-Request-*` headers a browser sends in a
   preflight for a `PATCH` with a JSON body and an `Authorization` header.
5. Your `fetch` PUT fails with a CORS error but your PUT endpoint works
   fine in curl. Where is the actual problem, and which two response
   headers on the preflight would you check first?
6. Why can't you combine `Access-Control-Allow-Origin: *` with
   `Access-Control-Allow-Credentials: true`?
7. What does `Access-Control-Max-Age` buy you, and which module's core
   lesson explains why that matters?

<details>
<summary>Answers</summary>

1. The *browser* enforces CORS; it protects the *user* (their session/
   cookies) from malicious cross-origin JavaScript reading responses.
   `curl` isn't a browser and doesn't implement the same-origin policy, so
   it always reads the response.
2. Origin = scheme + host + port. `https://x.com` (implicit 443) vs.
   `https://x.com:8443` — different (port). `http://x.com` vs.
   `https://x.com` — different (scheme).
3. Any three: method is not GET/HEAD/POST (e.g. PUT/PATCH/DELETE);
   `Content-Type: application/json` (not a safelisted type); an
   `Authorization` or any custom `X-*` header is present.
4. `Access-Control-Request-Method: PATCH` and
   `Access-Control-Request-Headers: content-type, authorization`.
5. The problem is the *preflight*, not the endpoint. Check
   `Access-Control-Allow-Methods` (does it include `PUT`?) and
   `Access-Control-Allow-Headers` (does it include the headers you send,
   e.g. `content-type`, `authorization`?).
6. Because a wildcard would let *any* site make authenticated (cookie-
   carrying) requests and read the responses — a serious security hole —
   so the spec forbids the combination; the browser rejects it.
7. It lets the browser cache the preflight approval, skipping the extra
   `OPTIONS` round trip on subsequent identical requests. Module 00's
   lesson — round trips are a major latency cost — is why avoiding a
   per-request preflight matters.

</details>

## Next

[05-http-responses-and-status-codes](../05-http-responses-and-status-codes/README.md)
— you've seen `200`, `201`, `204`, `404`, `405` in passing; now we map the
full status-code landscape and when to return which.
