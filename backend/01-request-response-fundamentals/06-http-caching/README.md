# Module 06: HTTP Caching

## Why this matters

Caching is the highest-leverage performance tool HTTP gives you, and it's
almost free — it's a handful of response headers. Done right, a browser or
CDN answers a request *without ever touching your server*, or with a tiny
"is this still current?" round trip that skips re-sending a megabyte of
data. Done wrong, users see stale content for hours (or you cache
something private and leak one user's data to another). The gap between
those two outcomes is entirely in how you set `Cache-Control`, `ETag`, and
`Last-Modified` — a couple of lines of code.

You already met the payoff code in module 05: `304 Not Modified`, the
"reuse your copy" response. And you met the underlying idea way back in
module 00: DNS TTL — "how long may I reuse this answer before asking
again?" HTTP caching is that same time-to-live concept, plus a second,
smarter mechanism (validation) for "my copy might be stale, but let me
cheaply check instead of blindly refetching." This module ties both
together.

The two questions every cache header answers are: **"May I reuse this, and
for how long?"** (freshness) and, once it's stale, **"Has it actually
changed, or can I keep using my copy?"** (validation). Get those two
straight and caching stops being mysterious.

## Concepts

### Where caches live

A "cache" isn't one thing. The same response can be cached at several
layers between your server and the user (module 00's journey in reverse):

- **The browser cache** (private) — stores responses for one user on their
  device.
- **A CDN / edge cache** (shared) — stores responses near users, serving
  many of them from a copy without hitting your origin.
- **A reverse proxy cache** (shared) — nginx/Varnish in front of your app.

Your response headers instruct *all* of them. The critical safety rule:
**`private` vs. `public`** — a `private` response may only be stored by
the browser (one user); a `public` one may be stored by shared caches
(CDN/proxy). Cache a user-specific response (their profile, their cart) as
`public` and a shared cache can hand *your* data to the *next* user. This
is a real, severe bug class.

### Freshness: `Cache-Control` and `max-age`

The primary caching header is **`Cache-Control`**, a general header
(module 02) carrying directives. The most important is **`max-age=<seconds>`**:
"this response is fresh for N seconds; during that window, reuse it
*without asking me at all*."

```
Cache-Control: max-age=3600
```

For 3600 seconds (1 hour) after fetching, the cache serves its stored copy
directly — zero requests to your server. This is exactly DNS TTL (module
00) applied to HTTP responses. Common companion directives:

- **`public`** — shared caches may store it.
- **`private`** — only the browser may store it (per-user data).
- **`no-cache`** — *may* store it, but must **revalidate** with the server
  before each reuse (a conditional request; see below). Misleadingly
  named: it does *not* mean "don't cache."
- **`no-store`** — do not store this *at all*, anywhere. For truly
  sensitive responses (bank balances, one-time tokens).
- **`must-revalidate`** — once stale, don't serve the stale copy; you must
  revalidate first.
- **`s-maxage=<seconds>`** — like `max-age` but *only* for shared caches
  (overrides `max-age` for CDNs/proxies).
- **`immutable`** — this will never change during its `max-age`; don't
  even revalidate on reload (great for versioned static assets like
  `app.abc123.js`).

The mental model: `max-age` = "reuse blindly for this long"; `no-cache` =
"reuse only after checking"; `no-store` = "never keep it."

### Validation: `ETag` and `Last-Modified`

Freshness answers "may I reuse without asking?" But when a response goes
*stale* (its `max-age` expired), the cache doesn't have to blindly
re-download everything. It can ask "has this actually changed?" cheaply,
using a **validator** the server previously gave it:

- **`ETag: "a1b2c3"`** — an opaque "version fingerprint" of the response
  body (often a hash). If the body changes, the ETag changes.
- **`Last-Modified: Sat, 26 Jul 2026 09:00:00 GMT`** — when the resource
  last changed (a coarser, second-resolution validator).

On the next request for a stale resource, the cache sends a **conditional
request** echoing the validator:

- **`If-None-Match: "a1b2c3"`** — "only send the body if the ETag is *not*
  still `a1b2c3`."
- **`If-Modified-Since: Sat, 26 Jul 2026 09:00:00 GMT`** — "only send the
  body if it changed after this time."

The server compares. Two outcomes:

- **Unchanged** → the server returns **`304 Not Modified`** with *no
  body*. The cache reuses its stored copy. You just saved re-sending the
  whole payload — only headers crossed the wire.
- **Changed** → the server returns **`200 OK`** with the new body and a
  new `ETag`/`Last-Modified`.

This is why `304` (module 05) is a `3xx`: it directs the client to use its
cache. Validation is the "cheap check" half of caching; freshness is the
"don't even check" half.

### Strong vs. weak ETags

An ETag can be **strong** (`"a1b2c3"` — byte-for-byte identical) or
**weak** (`W/"a1b2c3"` — semantically equivalent but maybe not
byte-identical, e.g. same content with a different compression). Strong
ETags are required for range requests (resuming partial downloads); weak
ETags are fine for ordinary "did this change?" validation. Most APIs use
strong ETags derived from a hash of the serialized body.

### `Vary`: caching under content negotiation

If a response differs based on a *request* header — say you return JSON or
XML depending on `Accept` (module 08), or gzip vs. plain based on
`Accept-Encoding` — a shared cache must not serve the JSON copy to a
client that asked for XML. The **`Vary`** response header tells caches
which request headers to include in the cache key:

```
Vary: Accept, Accept-Encoding
```

"Cache separate copies per distinct `Accept` and `Accept-Encoding`." Omit
`Vary` when you negotiate and a cache will serve the wrong representation
to someone. This header is the bridge between caching (this module) and
content negotiation (module 08).

### Putting freshness + validation together

A well-cached API response typically carries *both*: a `max-age` (so
during the fresh window there are zero requests) *and* an `ETag` (so once
stale, revalidation is a cheap `304` instead of a full refetch). Example:

```
HTTP/1.1 200 OK
Cache-Control: public, max-age=60
ETag: "v3-a1b2c3"
Vary: Accept-Encoding
Content-Type: application/json
```

For 60 seconds: reuse with no request. After 60 seconds: send
`If-None-Match: "v3-a1b2c3"`; get a `304` if nothing changed, a fresh
`200` if it did.

## Command reference

| Command | What it does |
|---|---|
| `curl -s -D - -o /dev/null URL` | Inspect caching response headers |
| `curl -s -H 'If-None-Match: "TAG"' -i URL` | Send a conditional request by ETag |
| `curl -s -H 'If-Modified-Since: <http-date>' -i URL` | Conditional request by date |
| `curl -s -w '%{http_code}\n' -H 'If-None-Match: "TAG"' -o /dev/null URL` | See `304` vs `200` |

Notes:

- To test validation manually: first `GET` and note the `ETag`, then re-GET
  with `If-None-Match: "<that etag>"` and confirm you get `304` with no
  body. Change the resource, repeat, and confirm you get `200` with a new
  ETag.

FastAPI app with real caching (used in exercises):

```python
import hashlib, json
from fastapi import FastAPI, Request, Response, status

app = FastAPI()
DOC = {"version": 1, "title": "Hello", "body": "world"}

def etag_for(obj) -> str:
    raw = json.dumps(obj, sort_keys=True).encode()
    return '"' + hashlib.sha256(raw).hexdigest()[:16] + '"'

@app.get("/doc")
def get_doc(request: Request, response: Response):
    etag = etag_for(DOC)
    # Validation: if the client's copy matches, short-circuit to 304
    if request.headers.get("if-none-match") == etag:
        return Response(status_code=status.HTTP_304_NOT_MODIFIED,
                        headers={"ETag": etag, "Cache-Control": "public, max-age=30"})
    response.headers["ETag"] = etag
    response.headers["Cache-Control"] = "public, max-age=30"
    response.headers["Vary"] = "Accept-Encoding"
    return DOC

@app.post("/doc")
def edit_doc(changes: dict):
    DOC.update(changes)
    DOC["version"] += 1
    return DOC

@app.get("/static/app.js")
def static_asset(response: Response):
    response.headers["Cache-Control"] = "public, max-age=31536000, immutable"
    return Response(content="console.log('v1')", media_type="application/javascript",
                    headers={"Cache-Control": "public, max-age=31536000, immutable"})

@app.get("/me")
def me(response: Response):
    # Per-user data: must NOT be shared-cached
    response.headers["Cache-Control"] = "private, no-store"
    return {"user": "ada", "balance": 4200}
```

## Hands-on exercises

Run with `uvicorn app:app --reload`.

### 1. See freshness headers

```bash
curl -s -D - -o /dev/null http://127.0.0.1:8000/doc
```

Expected: `cache-control: public, max-age=30`, an `etag: "..."`, and
`vary: Accept-Encoding`. Note the ETag value — you'll use it next.

### 2. Revalidate and get a 304

Copy the ETag from exercise 1, then:

```bash
curl -s -i -H 'If-None-Match: "PASTE_ETAG_HERE"' http://127.0.0.1:8000/doc
```

Expected: `HTTP/1.1 304 Not Modified` with **no body**. The server told
you "your copy is current — reuse it." Only headers crossed the wire; the
document body did not. That's the bandwidth win.

### 3. Change the resource, watch the ETag change

```bash
curl -s -X POST -H 'Content-Type: application/json' \
  -d '{"title":"Changed"}' http://127.0.0.1:8000/doc
curl -s -i -H 'If-None-Match: "PASTE_OLD_ETAG_HERE"' http://127.0.0.1:8000/doc
```

Expected: now you get `200 OK` with the *new* body and a *different*
ETag — the old validator no longer matches because the content changed.
Validation correctly detected the change.

### 4. Prove `no-store` on per-user data

```bash
curl -s -D - -o /dev/null http://127.0.0.1:8000/me
```

Expected: `cache-control: private, no-store`. No shared cache will store
this, and even the browser won't persist it. Reason about why serving
`/me` as `public, max-age=60` would be a data-leak bug (a CDN could hand
Ada's balance to the next user).

### 5. Immutable versioned asset

```bash
curl -s -D - -o /dev/null http://127.0.0.1:8000/static/app.js
```

Expected: `cache-control: public, max-age=31536000, immutable`. A browser
caches this for a year and won't even revalidate on reload. This is the
standard strategy for fingerprinted assets (`app.abc123.js`): the URL
changes when the content changes, so the cached copy is never wrong.

### 6. max-age vs no-cache, in your head then in curl

Change `/doc`'s `Cache-Control` to `no-cache` (keep the ETag logic),
restart, and re-run exercises 1-2.

Expected: with `no-cache`, a compliant cache stores the copy but
*revalidates every time* before reuse — so you'll always see the
conditional request happen (and get `304`s when unchanged). Contrast:
`max-age=30` skips the server entirely for 30s. Write down the difference
in one sentence.

### 7. Vary and negotiation interaction

```bash
curl -s -D - -o /dev/null -H 'Accept-Encoding: gzip' http://127.0.0.1:8000/doc
```

Expected: the `vary: Accept-Encoding` header is present. Explain what a
shared cache does with it: it keys its stored copies by `Accept-Encoding`,
so a client that sent `gzip` and one that sent nothing get the correct
respective representations — the cache won't hand a gzipped body to a
client that can't decode it (module 08).

### 8. Diagnose and fix: the private-data leak

Here's a broken endpoint. Add it:

```python
@app.get("/profile")
def profile(response: Response):
    # BUG: per-user data marked public and cacheable by shared caches
    response.headers["Cache-Control"] = "public, max-age=3600"
    return {"user": "ada", "email": "ada@x.com", "secret_prefs": [1, 2, 3]}
```

```bash
curl -s -D - -o /dev/null http://127.0.0.1:8000/profile
```

Expected: `cache-control: public, max-age=3600` on clearly per-user data.
**Diagnose:** a shared cache (CDN/proxy) may store Ada's profile and serve
it to the *next* user who requests `/profile` for an hour — a
cross-user data leak. **Fix:** mark it `private, no-store` (or at least
`private, max-age=0, must-revalidate` if some per-browser caching is
acceptable). Re-run and confirm it's no longer `public`. Lesson:
`public` vs. `private` is a *security* decision, not just performance.

### 9. Measure the win

```bash
# Full response (200) size vs. a revalidation (304) size
curl -s -o /dev/null -w 'full: %{size_download} bytes\n' http://127.0.0.1:8000/doc
ETAG=$(curl -s -D - -o /dev/null http://127.0.0.1:8000/doc | grep -i etag | tr -d '\r' | awk '{print $2}')
curl -s -o /dev/null -w '304:  %{size_download} bytes\n' -H "If-None-Match: $ETAG" http://127.0.0.1:8000/doc
```

Expected: the `304` downloads ~0 body bytes versus the full response's
payload. On a real API returning kilobytes or megabytes, that's the
concrete savings validation buys — repeated for every client, every
revalidation.

## Independent challenge

No code given.

**Task:** Implement caching for a `/report` endpoint that returns an
expensive-to-generate JSON report which changes at most once an hour.
Requirements: (a) during the freshness window, browsers and your CDN
should serve it *without contacting your server at all*; (b) once stale, a
client should be able to revalidate and receive a `304` (module 05) if the
report hasn't regenerated, saving the full payload; (c) the report is the
same for all users, so shared caching is desirable — but a *different*
endpoint `/report/mine` returns a per-user version that must **never** be
stored by a shared cache. Prove each behavior with curl: show the fresh
window serves without revalidation, show a `304` on revalidation, and show
`/report/mine` carries directives that forbid shared caching. Tie your
choices back to the DNS-TTL analogy from module 00 and the `304` mechanic
from module 05.

<details>
<summary>Hint</summary>

For `/report`: `Cache-Control: public, max-age=3600` plus an `ETag`
derived from a hash of the report content (or its generation timestamp),
and the same `If-None-Match` → `304` short-circuit as the `/doc` example.
For `/report/mine`: `Cache-Control: private, no-store` (or at least
`private`). The `public`/`private` split is the whole safety story.

</details>

## Common mistakes & troubleshooting

- **Caching per-user data as `public`.** A shared cache can then leak one
  user's response to another. Per-user data must be `private` (and often
  `no-store`).
- **Thinking `no-cache` means "don't cache."** It means "cache, but
  revalidate before every reuse." "Don't store at all" is `no-store`.
- **Negotiating content without `Vary`.** A shared cache will serve the
  wrong representation (JSON to an XML client, gzip to a client that can't
  decode it). Add `Vary` with the relevant request headers.
- **No validator on cacheable responses.** Without an `ETag`/
  `Last-Modified`, a stale cache must refetch the *entire* body instead of
  getting a cheap `304`. Always pair `max-age` with a validator for large
  responses.
- **`immutable` on things that actually change.** Only use it for
  content-addressed/versioned URLs whose content is fixed for that URL.
- **Very long `max-age` on non-versioned URLs.** Users get stuck with
  stale content and no easy way to bust it. Use short `max-age` +
  revalidation, or versioned URLs + long `max-age`.
- **Forgetting that `304` responses should carry the same cache headers.**
  A `304` should refresh freshness (`Cache-Control`) so the cached copy's
  clock resets.

## Checkpoint quiz

Write down your answer to each question before expanding it — checking without attempting first is the single easiest way to fool yourself into thinking you've learned this.

1. What two distinct questions do caching headers answer? Name the
   mechanism (and key header) for each.
2. What does `max-age=60` cause a cache to do for the first 60 seconds,
   and what changes after that?
3. Distinguish `no-cache`, `no-store`, and `private` — one clear sentence
   each.
4. Walk through a conditional request: what does the client send, what are
   the server's two possible responses, and which one saves bandwidth and
   how?
5. Why is serving a per-user response with `Cache-Control: public,
   max-age=3600` a security bug, not just a performance choice?
6. You return JSON or XML depending on the `Accept` header. What header
   must you add so shared caches don't serve the wrong one, and what does
   it do?
7. What's the standard caching strategy for a fingerprinted asset like
   `app.9f8a.js`, and why is it safe to cache it for a year?

<details>
<summary>Answers</summary>

1. (a) "May I reuse this, and for how long?" — *freshness*, via
   `Cache-Control: max-age`. (b) "Has it actually changed?" — *validation*,
   via `ETag`/`Last-Modified` and conditional requests.
2. For 60 seconds the cache serves its stored copy directly with *no
   request to the server* (fresh). After 60 seconds it's stale and the
   cache must revalidate (or refetch) before reuse.
3. `no-cache` = may store but must revalidate before each reuse.
   `no-store` = never store it anywhere. `private` = only the browser (one
   user) may store it, not shared caches.
4. The client sends `If-None-Match: "<etag>"` (or `If-Modified-Since`).
   The server returns `304 Not Modified` (no body) if unchanged, or
   `200 OK` with the new body + new validator if changed. The `304` saves
   bandwidth by not re-sending the body — only headers cross the wire.
5. Because `public` lets a *shared* cache (CDN/proxy) store it and serve
   the same stored response to *other* users — leaking one user's private
   data to another for up to an hour.
6. `Vary: Accept` — it tells shared caches to include the `Accept` request
   header in the cache key, so each representation is cached and served
   separately.
7. `Cache-Control: public, max-age=31536000, immutable`. It's safe because
   the filename (fingerprint/hash) changes whenever the content changes —
   a given URL's bytes never change, so a cached copy is never stale.

</details>

## Next

[07-http-1-1-vs-2-vs-3](../07-http-1-1-vs-2-vs-3/README.md) — you've
mastered HTTP's semantics on HTTP/1.1; now see how HTTP/2 and HTTP/3 keep
those exact semantics but radically change performance on the wire.
