# Module 02: HTTP Headers Deep Dive

## Why this matters

In modules 00 and 01 you kept seeing headers scroll past — `Host`,
`Content-Type`, `User-Agent`, `Accept`, `Date` — and we waved at them as
"metadata." That hand-wave ends here. Headers are where almost all of
HTTP's real intelligence lives. The request line and status line are
tiny; the *headers* are how a client says "I accept JSON, in English,
compressed with gzip, and here's my auth token and the cache validator I
already have," and how a server replies "here's JSON, it's 1523 bytes,
cache it for an hour, and don't let other sites read it."

Almost every topic in the rest of this track is really "which header (or
pair of headers) controls this?" Caching (module 06) is `Cache-Control`,
`ETag`, `Last-Modified`. Content negotiation (module 08) is `Accept*` vs.
`Content-*`. CORS (module 04) is `Origin` and a family of
`Access-Control-*` headers. Security is a whole class of response headers
most APIs get wrong. If headers are a blur to you, all of that is a blur.
Spend the time here to make them legible.

The trap to avoid: memorizing a flat list of 80 header names. Instead
learn the **categories** — general, request, response, representation,
and security — because the category tells you *what a header is for* and
*which side sets it*, which is 90% of what you need in practice.

## Concepts

### The five categories, and why categories beat lists

Headers are `Name: value` lines. Names are case-insensitive
(`Content-Type` == `content-type`; HTTP/2 and /3 actually lowercase them
all). What matters is grouping them by *purpose*:

- **General headers** — apply to the message as a whole, present on both
  requests and responses, and are about the *connection/message*, not the
  content. E.g. `Date`, `Connection`, `Cache-Control`, `Via`.
- **Request headers** — only sent by the *client*, describing the client
  or shaping what it wants back. E.g. `Host`, `User-Agent`, `Accept`,
  `Authorization`, `Cookie`, `Referer`, `Origin`.
- **Response headers** — only sent by the *server*, describing the server
  or the response beyond the body itself. E.g. `Server`, `Set-Cookie`,
  `Location`, `WWW-Authenticate`, `Access-Control-Allow-Origin`.
- **Representation (a.k.a. entity) headers** — describe the *body* (the
  "representation" of the resource): its type, length, encoding,
  language. E.g. `Content-Type`, `Content-Length`, `Content-Encoding`,
  `Content-Language`, `ETag`, `Last-Modified`. These can appear on
  requests *or* responses whenever there's a body.
- **Security headers** — a practical grouping (not a formal spec
  category) of response headers that harden the browser's handling of
  your site. E.g. `Strict-Transport-Security`, `Content-Security-Policy`,
  `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`.

When you meet an unfamiliar header, ask: *who sets it, and is it about the
message, the client's wishes, the server, the body, or browser security?*
That places it instantly.

### Request headers: what the client tells the server

These flow client → server and either identify the client or shape the
response:

- **`Host: api.example.com`** — mandatory in HTTP/1.1; which virtual host
  you meant (module 01).
- **`User-Agent: curl/8.5.0`** — a self-description of the client
  software. Servers sometimes branch on it (rarely wise) or just log it.
- **`Accept: application/json`** — "I'd prefer the response in this media
  type." The negotiation trigger (module 08). Siblings:
  `Accept-Language: en-US` (preferred language),
  `Accept-Encoding: gzip, br` (compression I can decode, module 08).
- **`Authorization: Bearer eyJ...`** — credentials. `Bearer <token>` for
  JWTs/OAuth, `Basic <base64>` for basic auth. (Auth is a whole later
  track; here just know *where* credentials live.)
- **`Cookie: session=abc123`** — sends cookies the server previously set;
  the mechanism that fakes state onto stateless HTTP (module 01).
- **`Referer: https://example.com/page`** — the page that linked here
  (yes, misspelled in the spec, permanently).
- **`Origin: https://app.example.com`** — the scheme+host+port the request
  came from; the heart of CORS (module 04).
- **`If-None-Match` / `If-Modified-Since`** — conditional request headers
  carrying a cache validator; the client half of caching (module 06).

### Response headers: what the server tells the client (beyond the body)

These flow server → client and describe the server or the response as an
interaction:

- **`Server: nginx/1.25`** — the server software (often trimmed/hidden for
  security-by-obscurity).
- **`Set-Cookie: session=abc123; HttpOnly; Secure; SameSite=Lax`** — asks
  the client to store a cookie and send it back on future requests. The
  attributes matter enormously for security (a later track).
- **`Location: /users/42`** — where to go next; paired with `3xx`
  redirects and `201 Created` (module 05).
- **`WWW-Authenticate: Bearer`** — accompanies `401 Unauthorized` to say
  *how* to authenticate.
- **`Access-Control-Allow-Origin: https://app.example.com`** — the CORS
  permission grant (module 04).
- **`Retry-After: 120`** — with `429`/`503`, how long to wait before
  retrying.

### Representation headers: everything about the body

These describe the bytes in the body, on either request or response:

- **`Content-Type: application/json; charset=utf-8`** — the media type of
  the body *and* its charset. This is how the receiver knows to parse the
  bytes as JSON text vs. an image vs. HTML. Getting it wrong is a top
  bug: send JSON with `Content-Type: text/html` and clients may mishandle
  it.
- **`Content-Length: 1523`** — exact body size in bytes (module 01).
- **`Content-Encoding: gzip`** — the body has been compressed with gzip
  and must be decompressed before use (module 08). Distinct from
  `Transfer-Encoding: chunked`, which is about *framing*, not content.
- **`Content-Language: en-US`** — the natural language of the body.
- **`ETag: "a1b2c3"`** — an opaque version tag for the body, used to
  validate caches (module 06).
- **`Last-Modified: Sat, 26 Jul 2026 09:00:00 GMT`** — when the resource
  last changed; the other cache validator (module 06).

The `Accept*` request headers and the `Content-*` representation headers
are two halves of a conversation: the client says what it *accepts*, the
server states what it *sent*. That pairing is the whole of content
negotiation (module 08).

### General headers: about the message and connection

- **`Date: Sat, 26 Jul 2026 10:00:00 GMT`** — when the message was
  generated. Always in GMT/UTC, in that specific RFC format.
- **`Connection: keep-alive`** / `close` — whether to reuse the TCP
  connection for more requests (module 01's persistent connections;
  module 08 goes deeper).
- **`Cache-Control: max-age=3600`** — caching directives; general because
  both requests and responses use it (module 06).
- **`Via` / `X-Forwarded-For`** — added by proxies/load balancers to
  record the path a request took and the original client IP (module 00).

### Security headers: hardening the browser

These are response headers that instruct the *browser* to be stricter.
APIs and sites that omit them are the ones that show up in security
audits:

- **`Strict-Transport-Security: max-age=31536000; includeSubDomains`**
  (HSTS) — "only ever reach me over HTTPS, for the next year." Prevents
  downgrade/stripping attacks (module 09).
- **`Content-Security-Policy: default-src 'self'`** (CSP) — restricts
  where scripts/styles/images may load from; the strongest defense
  against cross-site scripting.
- **`X-Content-Type-Options: nosniff`** — "don't guess the content type;
  trust my `Content-Type`." Stops MIME-sniffing attacks.
- **`X-Frame-Options: DENY`** (or CSP `frame-ancestors`) — "don't let
  other sites embed me in an iframe." Stops clickjacking.
- **`Referrer-Policy: no-referrer`** — controls how much of the `Referer`
  header leaks to other sites.

You don't implement the attacks here; you learn that these headers exist,
what each defends against, and that *absence* is the common default you
must fix.

### Custom and `X-` headers

Anyone can invent a header. Historically custom headers were prefixed
`X-` (`X-Request-Id`, `X-RateLimit-Remaining`), but that convention is
now discouraged (RFC 6648) — new custom headers usually drop the `X-`.
Still, you'll see `X-` everywhere in the wild. The rule: unknown headers
are ignored by receivers that don't understand them, which is why adding
custom headers is safe.

## Command reference

| Command / snippet | What it does |
|---|---|
| `curl -s -D - -o /dev/null URL` | Print only the response's status line + headers |
| `curl -H 'Accept: application/json' URL` | Send a request header |
| `curl -H 'Authorization: Bearer TOKEN' URL` | Send credentials |
| `curl -A 'my-agent/1.0' URL` | Set the `User-Agent` request header |
| `curl -e 'https://ref.example' URL` | Set the `Referer` header |
| `curl -b 'session=abc' URL` | Send a `Cookie` header |
| `curl -c cookies.txt URL` | Save `Set-Cookie` cookies to a file |
| `curl -I URL` | Send a HEAD request — headers only, no body |
| `resp.headers` (FastAPI/Starlette) | Set response headers in code |

Option notes:

- **`-D -`** dumps response headers; `-` = stdout. Pair with
  `-o /dev/null` to suppress the body and see *only* headers.
- **`-H 'Name: value'`** adds any request header; repeatable. This is how
  you test `Accept`, `Authorization`, `Origin` (module 04), conditional
  headers (module 06), etc.
- **`-A`, `-e`, `-b`** are shortcuts for `User-Agent`, `Referer`, and
  `Cookie` respectively — sugar over `-H`.
- **`-I`** issues a `HEAD` request: the server returns the same headers it
  would for `GET` but with no body — perfect for inspecting headers
  cheaply.

To set headers from a FastAPI app (used in exercises):

```python
from fastapi import FastAPI
from fastapi.responses import JSONResponse

app = FastAPI()

@app.get("/users")
def list_users():
    return JSONResponse(
        content=[{"id": 1, "name": "Ada"}],
        headers={
            "Cache-Control": "max-age=60",
            "X-Request-Id": "req-123",
            "X-Content-Type-Options": "nosniff",
        },
    )
```

## Hands-on exercises

You'll need curl and a FastAPI app (`pip install fastapi uvicorn`). Save
the app snippets and run with `uvicorn app:app --reload`.

### 1. Read a real response's headers and categorize them

```bash
curl -s -D - -o /dev/null https://example.com/
```

Expected: a status line and a dozen headers. For each, write down its
category (general/response/representation/security). E.g. `Date` =
general, `Content-Type` = representation, `Server` = response,
`Cache-Control` = general.

### 2. Send request headers and watch them arrive

Create `app.py`:

```python
from fastapi import FastAPI, Request

app = FastAPI()

@app.get("/echo")
def echo(request: Request):
    return {"you_sent": dict(request.headers)}
```

```bash
uvicorn app:app --reload
```

Then:

```bash
curl -s -H 'Accept: application/json' -H 'Authorization: Bearer secret123' \
     -A 'learning-agent/1.0' http://127.0.0.1:8000/echo | python -m json.tool
```

Expected: JSON echoing back your `accept`, `authorization`, and
`user-agent` headers (note they arrive lowercased). You're seeing the
exact request headers the server received.

### 3. HEAD request: headers without the body

```bash
curl -I https://example.com/
```

Expected: only the status line and headers — no HTML body. Compare byte
cost to a full `GET`. `HEAD` is how monitoring tools check a resource
cheaply.

### 4. Set representation headers correctly

Add to `app.py`:

```python
from fastapi.responses import Response

@app.get("/download")
def download():
    body = b'{"msg": "hello"}'
    return Response(
        content=body,
        media_type="application/json",
        headers={"Content-Language": "en-US"},
    )
```

```bash
curl -s -D - -o /dev/null http://127.0.0.1:8000/download
```

Expected: `content-type: application/json`, a `content-length` matching
the body's byte count, and `content-language: en-US`. These three all
*describe the body* — the representation category.

### 5. Set and receive a cookie

Add:

```python
from fastapi.responses import JSONResponse

@app.get("/login")
def login():
    resp = JSONResponse({"ok": True})
    resp.set_cookie("session", "abc123", httponly=True, samesite="lax")
    return resp
```

```bash
curl -s -D - -o /dev/null -c cookies.txt http://127.0.0.1:8000/login
cat cookies.txt
curl -s -b cookies.txt http://127.0.0.1:8000/echo | python -m json.tool
```

Expected: the first call's headers include
`set-cookie: session=abc123; HttpOnly; ...` (a **response** header); the
saved cookie is then sent back as a `cookie` **request** header on the
third call. This round trip is exactly how sessions patch state onto
stateless HTTP (module 01).

### 6. Add security headers

Add:

```python
@app.get("/secure")
def secure():
    return JSONResponse(
        {"data": "sensitive"},
        headers={
            "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
            "X-Content-Type-Options": "nosniff",
            "X-Frame-Options": "DENY",
            "Content-Security-Policy": "default-src 'self'",
            "Referrer-Policy": "no-referrer",
        },
    )
```

```bash
curl -s -D - -o /dev/null http://127.0.0.1:8000/secure
```

Expected: all five security headers present. Look up what each defends
against (HSTS = force HTTPS, `nosniff` = no MIME guessing, `DENY` = no
framing, CSP = XSS defense, `Referrer-Policy` = leak control). Notice
your API had *none* of these by default — that's the point.

### 7. Custom headers pass through untouched

```bash
curl -s -D - -o /dev/null -H 'X-Request-Id: my-trace-42' \
     http://127.0.0.1:8000/echo
curl -s -H 'X-Request-Id: my-trace-42' \
     http://127.0.0.1:8000/echo | python -m json.tool | grep -i request-id
```

Expected: the server received `x-request-id: my-trace-42` even though it
never asked for it. Unknown headers are simply carried and ignored by
those who don't understand them — which is why custom headers are safe.

### 8. Diagnose and fix: the wrong `Content-Type`

Add this deliberately broken endpoint:

```python
@app.get("/broken")
def broken():
    import json
    body = json.dumps({"name": "Ada"})
    # BUG: JSON body labeled as plain text
    return Response(content=body, media_type="text/plain")
```

```bash
curl -s -D - http://127.0.0.1:8000/broken
```

Expected: the body *looks* like JSON, but the header says
`content-type: text/plain`. A browser `fetch().then(r => r.json())` on
this may still parse it, but strict clients, proxies, and content-type
checks will treat it as plain text — and browsers with `nosniff` set will
refuse to reinterpret it. **Diagnose:** the representation header
misdescribes the body. **Fix:** change `media_type` to
`application/json` (or just `return {"name": "Ada"}` and let FastAPI set
it). Re-run and confirm `content-type: application/json`. Lesson:
`Content-Type` is a promise about the body — keep it honest.

### 9. Inspect proxy-added headers

If you have any proxy in front (or use a public echo service), look for
`Via`, `X-Forwarded-For`, `X-Forwarded-Proto`. Otherwise, reason about
them: given `X-Forwarded-For: 203.0.113.5, 10.0.0.1`, which is the
original client and which is an intermediary?

Expected understanding: the *leftmost* is the original client
(`203.0.113.5`); entries are appended as the request passes through each
proxy (module 00). Trusting the wrong one is a real security bug.

## Independent challenge

No code given.

**Task:** Build a single FastAPI endpoint `/profile` that behaves like a
real, well-behaved API response. It must: (a) return a JSON body with a
correct, honest `Content-Type`; (b) set at least three of the security
headers from this module; (c) set a caching directive header (you'll
formalize this in module 06, but set *something* sensible now); (d) set a
custom request-tracing header echoing back an `X-Request-Id` the client
sent (or generating one if absent); and (e) set a cookie with `HttpOnly`
and `SameSite`. Then, with a *single* `curl` command, capture the full
response headers and verify every one of the five requirements is met.
This pulls together representation, response, general, and security
categories — the same header discipline every module after this assumes.

<details>
<summary>Hint</summary>

Read the incoming `X-Request-Id` from `request.headers.get("x-request-id")`
and fall back to `str(uuid.uuid4())`. Build one `JSONResponse`, then set
everything on its `.headers` dict and call `.set_cookie(...)`. Verify with
`curl -s -D - -o /dev/null -H 'X-Request-Id: abc' http://127.0.0.1:8000/profile`.

</details>

## Common mistakes & troubleshooting

- **Mislabeling `Content-Type`.** The single most common header bug: JSON
  sent as `text/plain` or `text/html`, or a UTF-8 body without
  `charset=utf-8`. Clients mis-parse or (with `nosniff`) refuse it.
- **Treating header names as case-sensitive.** They aren't in HTTP/1.x,
  and are always lowercase in HTTP/2/3. Compare case-insensitively.
- **Confusing request vs. response direction.** `Accept` is what the
  client *wants*; `Content-Type` is what was *sent*. `Cookie` (request) vs.
  `Set-Cookie` (response). Mixing these up breaks negotiation and auth.
- **Shipping an API with no security headers.** The default is *none*.
  HSTS, CSP, `nosniff`, and frame protection must be added deliberately.
- **Trusting `X-Forwarded-For` blindly.** Clients can forge it; only the
  entry added by *your own trusted proxy* is reliable. Configure which
  proxies you trust.
- **Setting `Content-Length` by hand and getting it wrong.** Let the
  framework compute it. A mismatch truncates or hangs the response
  (module 01).

## Checkpoint quiz

Write down your answer to each question before expanding it — checking without attempting first is the single easiest way to fool yourself into thinking you've learned this.

1. Name the five header categories from this module and, for each, say who
   sets it and what it's about.
2. Which header does the client use to say what media type it wants back,
   and which does the server use to say what it actually sent? What module
   are those two the foundation of?
3. Give three security headers and, in one phrase each, what attack they
   defend against.
4. What's the difference between `Cookie` and `Set-Cookie`, and which
   direction does each travel?
5. You send JSON but set `Content-Type: text/plain`. Describe two concrete
   ways this can bite you.
6. A response has `X-Forwarded-For: 203.0.113.5, 10.0.0.1`. Which is the
   original client, and why can't you always trust it?
7. Why is it safe to add a made-up custom header like `X-Trace-Id` to a
   request?

<details>
<summary>Answers</summary>

1. General (both sides; about the message/connection, e.g. `Date`,
   `Connection`), Request (client-set; describes client or shapes the
   response, e.g. `Accept`, `Authorization`), Response (server-set;
   about the server/interaction, e.g. `Server`, `Set-Cookie`, `Location`),
   Representation (either side; describes the body, e.g. `Content-Type`,
   `ETag`), Security (server-set response headers that harden the browser,
   e.g. HSTS, CSP).
2. `Accept` (client's wish) and `Content-Type` (what was sent). They're
   the foundation of content negotiation (module 08).
3. HSTS — forces HTTPS (defeats downgrade/stripping); CSP — restricts
   resource origins (defeats XSS); `X-Content-Type-Options: nosniff` —
   stops MIME sniffing; `X-Frame-Options: DENY` — stops clickjacking.
   (Any three.)
4. `Set-Cookie` is a response header (server → client, "store this");
   `Cookie` is a request header (client → server, "here's what you stored").
5. E.g. a proxy/client caches or displays it as text; a browser with
   `nosniff` refuses to treat it as JSON; strict content-type checks
   reject it; the charset may be guessed wrong.
6. The leftmost (`203.0.113.5`) is the original client; entries are
   appended by each proxy. You can't trust it because clients can forge
   the header — only the portion added by a proxy you control is reliable.
7. Receivers ignore headers they don't understand, so an unknown custom
   header causes no error — it's simply carried along and dropped by
   anyone who doesn't use it.

</details>

## Next

[03-http-methods-and-semantics](../03-http-methods-and-semantics/README.md)
— headers describe the message; the *method* says what you want done with
the resource. Next we make GET/POST/PUT/PATCH/DELETE precise.
