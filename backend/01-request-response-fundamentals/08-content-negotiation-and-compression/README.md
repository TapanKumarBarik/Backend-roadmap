# Module 08: Content Negotiation and Compression

## Why this matters

The same resource can be served in different *forms* — JSON or XML,
English or French, gzipped or plain, minified or pretty — and the client
and server need a way to agree on which form, per request, without a
separate URL for each. That agreement is **content negotiation**, and it's
built entirely from the `Accept*` request headers and `Content-*` response
headers you catalogued in module 02. It's how one endpoint, `/report`, can
answer a browser with HTML, a mobile app with JSON, and an old integration
with XML — all from the same URL.

Compression rides on the same negotiation machinery and is the single
cheapest bandwidth win available: telling the client "I'll accept gzip"
and the server "here it is, gzipped" can shrink a JSON payload by 70-90%.
For an API returning large text responses, enabling compression is often
the biggest performance improvement you can make in one line of config —
and it interacts directly with caching (module 06's `Vary`) and with
connection reuse (module 07's persistent connections), so it's the natural
place to tie those threads together.

The subtle bug this module inoculates you against: negotiate content or
compression *without* the `Vary` header, and a shared cache (module 06)
will serve a French XML response to someone who asked for English JSON. By
the end you'll set up negotiation and compression correctly, `Vary` and
all.

## Concepts

### The negotiation conversation

Content negotiation is a two-sided conversation using paired headers
(module 02):

| Client says (request) | Server answers (response) | Dimension |
|---|---|---|
| `Accept: application/json` | `Content-Type: application/json` | Media type / format |
| `Accept-Language: fr-FR, en;q=0.8` | `Content-Language: fr-FR` | Natural language |
| `Accept-Encoding: gzip, br` | `Content-Encoding: br` | Compression |
| `Accept-Charset: utf-8` | (charset in `Content-Type`) | Character set |

The client lists what it *can accept*, ranked; the server picks one it can
produce and states its choice in the matching `Content-*` header. This is
"server-driven negotiation" — the common case. The client proposes, the
server disposes.

```
   CLIENT proposes (ranked)                 SERVER disposes (picks one)
   Accept: application/json, xml;q=0.5 ─►    Content-Type: application/json
   Accept-Language: fr-FR, en;q=0.8    ─►    Content-Language: fr-FR
   Accept-Encoding: br, gzip           ─►    Content-Encoding: br
                                             Vary: Accept, Accept-Language,
                                                   Accept-Encoding
   one URL /report ─────────────────────────► many possible representations
```

### Quality values (`q`): ranking preferences

Accept headers can carry **quality values** (`q`, from 0 to 1, default 1)
to express *preference order*:

```
Accept: application/json;q=1.0, application/xml;q=0.5, */*;q=0.1
Accept-Language: fr-FR, fr;q=0.9, en;q=0.5
```

Read the language example: "I most want `fr-FR`; `fr` (any French) is
nearly as good; English is a fallback." The server should serve the
highest-`q` option it can produce. `q=0` means "explicitly *not*
acceptable." `*/*` means "anything," and `*/*;q=0.1` means "anything, but
only as a last resort." This ranking is why a browser sending
`Accept: text/html,application/xhtml+xml,...,*/*;q=0.8` reliably gets HTML
from servers that can produce it.

### What the server does when it can't comply

If the client demands a representation the server *cannot* produce (e.g.
`Accept: application/xml` from a JSON-only API), the correct response is
**`406 Not Acceptable`** (module 05) — "I can't give you any form you'll
accept." In practice many APIs are pragmatic and just return JSON anyway,
but `406` is the semantically correct signal. For encoding, if the client
sends `Accept-Encoding: identity;q=0` (refusing uncompressed) and the
server can't compress, that's also a `406`.

### Compression: gzip, deflate, br

Compression shrinks the response *body* before sending it; the client
decompresses on receipt. It's negotiated via `Accept-Encoding` (request)
and declared via `Content-Encoding` (response). The three you'll meet:

- **`gzip`** — the workhorse. Universally supported, fast, good ratio.
  When in doubt, gzip. Decades of ubiquity; every client understands it.
- **`deflate`** — technically the same DEFLATE algorithm as gzip but with
  a different (raw/zlib) wrapper. Historically buggy across
  implementations, so it's **rarely used** despite being listed. Prefer
  gzip over deflate.
- **`br` (Brotli)** — newer (Google), typically **better compression
  ratios than gzip** especially for text, and now widely supported in
  modern browsers over HTTPS. Increasingly the default for static assets.
  Slightly more CPU to compress at high levels, so often used with
  precompressed static files.

**Which is most common?** `gzip` is still the most widely deployed and the
safe default for dynamic responses; `br` is preferred where supported
(modern browsers, HTTPS) and especially for static assets you can compress
ahead of time. `deflate` is effectively legacy — you'll see it offered but
rarely chosen.

Compression only helps *compressible* content: text (JSON, HTML, CSS, JS,
XML) shrinks dramatically; already-compressed binaries (JPEG, PNG, MP4,
zip) don't shrink and shouldn't be re-compressed (wasted CPU, sometimes
slightly larger). Servers typically compress only text-ish media types.

### `Content-Encoding` vs `Transfer-Encoding`

A classic point of confusion:

- **`Content-Encoding: gzip`** is an end-to-end property of the *content*:
  the body *is* gzip-compressed and stays that way until the client
  decompresses it. It affects the resource representation and interacts
  with caching (a cache stores the gzipped bytes).
- **`Transfer-Encoding: chunked`** is a hop-by-hop property of the
  *framing*: it lets the server stream a body of unknown length in chunks
  instead of setting `Content-Length` up front. It's about *how the
  message is delimited on this connection*, not about compressing content.

They're orthogonal: you can stream a chunked response that is also
gzip-encoded content. Don't conflate "chunked" (framing) with
"compressed" (content).

### `Vary`: negotiation's mandatory caching partner

This is the bug-prevention concept. If a response's *content depends on a
request header* (you served JSON because of `Accept`, or gzip because of
`Accept-Encoding`, or French because of `Accept-Language`), a shared cache
(module 06) must key its stored copies on those headers — otherwise it'll
serve the wrong form to the next client. You tell it with **`Vary`**:

```
Content-Type: application/json
Content-Encoding: gzip
Content-Language: en-US
Vary: Accept, Accept-Encoding, Accept-Language
```

"Cache a separate copy per distinct combination of these request
headers." **Whenever you negotiate, you must `Vary`.** Forgetting `Vary:
Accept-Encoding` is the single most common negotiation-caching bug — a CDN
caches the gzipped body and hands it to a client that said it can't
decompress, which then displays garbage.

```
  WITHOUT Vary (broken):              WITH Vary: Accept-Encoding (correct):
   cache key = /report                 cache key = /report + Accept-Encoding
      │                                    ├─ /report | gzip   ─► [gzipped body]
      ▼ stores whatever it saw first       └─ /report | (none) ─► [plain body]
   gzipped body served to a client
   that can't decode it → garbage      each client gets a form it can read
```

### Persistent connections revisited

Content negotiation and compression happen *per request*, but those
requests usually ride a reused connection. Recall from modules 01 and 07:
HTTP/1.1 keeps the TCP connection open (`Connection: keep-alive`) for
multiple request/response pairs, and HTTP/2/3 multiplex many over one
connection. Compression reduces the *bytes per response*; persistent
connections reduce the *setup cost per request*. Together they're why a
modern API interaction — dozens of small, gzipped JSON responses over one
kept-alive HTTP/2 connection — is so much faster than the HTTP/1.0 model
of "one uncompressed response per fresh connection." `Connection: close`
in a response signals the server will close the connection after this
response (no reuse).

## Command reference

| Command | What it does |
|---|---|
| `curl -H 'Accept: application/xml' URL` | Request a specific media type |
| `curl -H 'Accept-Language: fr-FR' URL` | Request a language |
| `curl --compressed URL` | Send `Accept-Encoding: gzip, ...` and auto-decompress |
| `curl -H 'Accept-Encoding: gzip' -sD - -o /dev/null URL` | See if the server gzips (inspect `Content-Encoding`) |
| `curl -H 'Accept-Encoding: gzip' -s URL --output -` | Get the raw (still-compressed) bytes |
| `curl -w '%{size_download}\n' -o /dev/null -s URL` | Measure downloaded size (compare with/without compression) |

Notes:

- **`--compressed`** is the convenient one: curl advertises the encodings
  it supports *and* transparently decompresses the response, so you see
  plain text but the *transfer* was compressed. Use
  `-sD -` alongside to confirm `content-encoding: gzip` was actually used.
- Without `--compressed`, and with `-H 'Accept-Encoding: gzip'`, curl will
  *not* auto-decompress — you'll see raw compressed bytes, which proves the
  server really compressed (useful for `size_download` comparisons).
- To see the negotiated *media type*, inspect `Content-Type` in `-sD -`.

FastAPI app with negotiation and compression (used in exercises):

```python
from fastapi import FastAPI, Request, Response, HTTPException
from fastapi.middleware.gzip import GZipMiddleware
import json

app = FastAPI()
# Compress responses over 500 bytes when the client accepts gzip.
app.add_middleware(GZipMiddleware, minimum_size=500)

DATA = {"id": 1, "title": "Report", "items": list(range(200))}
GREETINGS = {"en": "Hello", "fr": "Bonjour", "es": "Hola"}

@app.get("/report")
def report(request: Request):
    accept = request.headers.get("accept", "application/json")
    if "application/xml" in accept:
        body = "<report><id>1</id><title>Report</title></report>"
        return Response(content=body, media_type="application/xml",
                        headers={"Vary": "Accept"})
    if "application/json" in accept or "*/*" in accept:
        return Response(content=json.dumps(DATA), media_type="application/json",
                        headers={"Vary": "Accept"})
    # Client demanded something we can't produce.
    raise HTTPException(status_code=406, detail="only json or xml available")

@app.get("/greeting")
def greeting(request: Request):
    langs = request.headers.get("accept-language", "en")
    # naive parse: first two-letter code we support
    chosen = "en"
    for part in langs.split(","):
        code = part.split(";")[0].strip()[:2]
        if code in GREETINGS:
            chosen = code
            break
    return Response(content=json.dumps({"message": GREETINGS[chosen]}),
                    media_type="application/json",
                    headers={"Content-Language": chosen, "Vary": "Accept-Language"})
```

## Hands-on exercises

Run with `uvicorn app:app --reload`.

### 1. Negotiate media type

```bash
curl -s -H 'Accept: application/json' http://127.0.0.1:8000/report | head -c 80; echo
curl -s -H 'Accept: application/xml'  http://127.0.0.1:8000/report
```

Expected: JSON for the first, XML for the second — *same URL*, different
representation, chosen by your `Accept` header. That's server-driven
negotiation.

### 2. See the 406 path

```bash
curl -s -i -H 'Accept: text/csv' http://127.0.0.1:8000/report | head -3
```

Expected: `406 Not Acceptable` — the client demanded CSV, which the server
can't produce. This is the honest signal (vs. silently returning JSON).

### 3. Negotiate language with q-values

```bash
curl -s -H 'Accept-Language: fr-FR, en;q=0.8' http://127.0.0.1:8000/greeting
curl -s -H 'Accept-Language: es' http://127.0.0.1:8000/greeting
curl -s -i -H 'Accept-Language: de' http://127.0.0.1:8000/greeting | grep -i content-language
```

Expected: `Bonjour` (French preferred), `Hola` (Spanish), and for `de`
(unsupported) a fallback to `en` with `content-language: en`. The `q`
value ranked French above English.

### 4. Turn on compression and measure the win

```bash
# Uncompressed size
curl -s -o /dev/null -w 'plain: %{size_download} bytes\n' http://127.0.0.1:8000/report
# Compressed size (raw bytes, not decompressed)
curl -s -H 'Accept-Encoding: gzip' -o /dev/null \
     -w 'gzip:  %{size_download} bytes\n' http://127.0.0.1:8000/report
```

Expected: the gzip download is noticeably smaller (the `/report` body has
200 repetitive numbers — highly compressible). Confirm the server actually
compressed:

```bash
curl -s -H 'Accept-Encoding: gzip' -D - -o /dev/null http://127.0.0.1:8000/report | grep -i content-encoding
```

Expected: `content-encoding: gzip`.

### 5. `--compressed` decompresses transparently

```bash
curl -s --compressed http://127.0.0.1:8000/report | head -c 80; echo
```

Expected: readable JSON — curl advertised gzip, the server compressed, and
curl decompressed for you. The *transfer* was small; the *display* is
plain. This is exactly what a browser does automatically.

### 6. Confirm `Vary` is present

```bash
curl -s -D - -o /dev/null -H 'Accept: application/xml' http://127.0.0.1:8000/report | grep -i vary
curl -s -D - -o /dev/null -H 'Accept-Language: fr' http://127.0.0.1:8000/greeting | grep -i vary
```

Expected: `vary: Accept` on `/report` and `vary: Accept-Language` on
`/greeting`. These tell shared caches to store separate copies per header
value (module 06). Note GZipMiddleware also adds `Accept-Encoding` to
`Vary` — inspect the full header.

### 7. Compression does nothing for already-compressed data

Reason about it, then confirm the principle: gzipping a JPEG or a PNG
yields ~no size reduction (and wastes CPU). This is why servers restrict
compression to text-ish media types and skip images/video/zip. Check your
middleware only kicks in for the text response and imagine adding an image
route — you'd exclude it.

### 8. Diagnose and fix: negotiation without `Vary`

Add this broken endpoint (note: **no** `Vary`):

```python
@app.get("/broken-report")
def broken_report(request: Request):
    accept = request.headers.get("accept", "application/json")
    if "application/xml" in accept:
        # BUG: no Vary header, so a shared cache can't tell copies apart
        return Response(content="<r/>", media_type="application/xml")
    return Response(content=json.dumps(DATA), media_type="application/json")
```

```bash
curl -s -D - -o /dev/null -H 'Accept: application/xml' http://127.0.0.1:8000/broken-report | grep -i vary || echo "NO VARY HEADER"
```

Expected: `NO VARY HEADER`. **Diagnose:** this endpoint returns different
representations based on `Accept`, but tells no cache about it. A shared
cache (module 06) will store whichever form it saw first and serve it to
*everyone* — an XML client gets JSON, or vice versa. The same bug with
`Accept-Encoding` hands gzipped bytes to a client that can't decode them
(garbage on screen). **Fix:** add `headers={"Vary": "Accept"}` to both
branches (as the correct `/report` does). Re-run and confirm `vary:
Accept` appears. Lesson: **negotiate ⇒ Vary, always.**

## Independent challenge

No code given.

**Task:** Build a `/articles/{id}` endpoint that correctly negotiates on
*two* dimensions simultaneously — media type (JSON or XML) and language
(at least English and one other) — driven by the client's `Accept` and
`Accept-Language` headers with proper `q`-value handling, returns a
`406 Not Acceptable` (module 05) when it can't satisfy the demand, and
sets the correct `Content-Type`, `Content-Language`, and — critically —
the correct `Vary` header so a shared cache (module 06) never serves the
wrong representation. Then enable gzip compression and prove, by comparing
`size_download` with and without `Accept-Encoding: gzip`, that a large
article body is compressed — and that your `Vary` now also accounts for
`Accept-Encoding`. Reference the `Accept`/`Content-Type` pairing from
module 02 and the shared-cache safety rule from module 06 by name.

<details>
<summary>Hint</summary>

Your `Vary` must list *every* request header your response varied on:
`Vary: Accept, Accept-Language, Accept-Encoding`. Parse `q`-values by
splitting on commas then on `;q=`, sorting descending, and picking the
first form you can produce; if none is producible, `raise
HTTPException(status_code=406, ...)`. Let GZipMiddleware handle the actual
compression and it will contribute `Accept-Encoding` to `Vary` — make sure
you don't clobber that when you set your own `Vary`.

</details>

## Common mistakes & troubleshooting

- **Negotiating without `Vary`.** The top bug: shared caches serve the
  wrong representation (wrong format, language, or a gzipped body to a
  client that can't decode it). Always `Vary` on every header you
  negotiated.
- **Ignoring `q`-values.** Treating `Accept` as a single value instead of
  a ranked list gives clients the wrong preference (e.g. serving XML when
  the client clearly preferred JSON).
- **Compressing already-compressed content.** Gzipping JPEG/PNG/MP4/zip
  wastes CPU for ~zero gain. Restrict compression to text-ish types.
- **Confusing `Content-Encoding` and `Transfer-Encoding`.**
  `Content-Encoding: gzip` = the body is compressed (end-to-end);
  `Transfer-Encoding: chunked` = the body is streamed in chunks (framing).
  Different concerns.
- **Preferring `deflate`.** It's historically buggy across
  implementations; prefer `gzip` (universal) or `br` (better ratio, modern
  clients).
- **Returning `200` when you can't satisfy `Accept`.** The semantically
  correct code is `406 Not Acceptable`.
- **Forgetting compression needs the client to opt in.** The server must
  see `Accept-Encoding: gzip` (or `br`) before compressing; otherwise it
  must send plain.

## Checkpoint quiz

Write down your answer to each question before expanding it — checking without attempting first is the single easiest way to fool yourself into thinking you've learned this.

1. Name the request/response header pair for each negotiation dimension:
   media type, language, and compression.
2. In `Accept: application/json;q=0.9, application/xml;q=0.3`, which does
   the client prefer, and what does `q` express?
3. What status code should a server return when it cannot produce any
   representation the client will accept?
4. Which compression encoding is the safe universal default, which offers
   better ratios on modern clients, and which is effectively legacy?
5. Explain the difference between `Content-Encoding: gzip` and
   `Transfer-Encoding: chunked`.
6. You serve JSON or XML from `/report` based on `Accept`, but a CDN keeps
   giving XML clients the JSON copy. What header did you forget, and what
   does it do?
7. Why is it pointless (or harmful) to gzip a JPEG response?

<details>
<summary>Answers</summary>

1. Media type: `Accept` ↔ `Content-Type`. Language: `Accept-Language` ↔
   `Content-Language`. Compression: `Accept-Encoding` ↔ `Content-Encoding`.
2. It prefers `application/json` (`q=0.9` > `q=0.3`). `q` is a quality/
   preference value from 0 to 1 that ranks the client's acceptable options
   (`q=0` = not acceptable).
3. `406 Not Acceptable`.
4. `gzip` is the safe universal default; `br` (Brotli) offers better ratios
   on modern clients (especially over HTTPS); `deflate` is effectively
   legacy (historically buggy, rarely chosen).
5. `Content-Encoding: gzip` means the body content is compressed
   end-to-end (the client must decompress it); `Transfer-Encoding: chunked`
   means the body is framed/streamed in chunks on this connection (about
   message delimiting, not content). They're orthogonal.
6. You forgot `Vary: Accept`. It tells shared caches to key stored copies
   on the `Accept` request header so each representation is cached and
   served separately.
7. JPEG is already compressed, so gzip achieves ~no size reduction while
   burning CPU (and can even slightly enlarge it). Compression only helps
   compressible text-like content.

</details>

## Cumulative review

Closed-book. Pulls from modules 00-08. Write each answer before expanding.

1. (00 + 07) A user on mobile Wi-Fi loads your site. Explain, using the
   journey model and HTTP versions, why HTTP/3 might load the page faster
   than HTTP/2 on that specific network.
2. (02 + 06 + 08) Which single response header connects content
   negotiation and caching, and what disaster does omitting it cause?
3. (01 + 08) On the wire, what is the difference between how a body is
   *framed* (chunked) and how its content is *encoded* (gzip)? Which
   module concept does each relate to?
4. (03 + 05) A `POST /orders` succeeds and creates a resource. What status
   code and header should come back, and why would returning `200` with an
   error body for a *failed* create be harmful?
5. (04 + 05) A browser `fetch` PUT fails with a CORS error while curl
   succeeds. Which request does the browser send first, and what does its
   failure have to do with status codes vs. CORS headers?
6. (06 + 08) You compress responses based on `Accept-Encoding` but a CDN
   serves gzipped bytes to a client that sent no `Accept-Encoding`. Name
   the bug and the fix.
7. (00 + 06) State the shared idea behind DNS TTL and HTTP `max-age` in one
   sentence, then name the *validation* mechanism HTTP adds that DNS
   doesn't have.

<details>
<summary>Answers</summary>

1. On a lossy network, HTTP/2 over TCP suffers TCP-level head-of-line
   blocking — one lost packet stalls all multiplexed streams. HTTP/3 over
   QUIC has independent streams, so a lost packet only stalls its own
   stream; plus QUIC's combined handshake means fewer setup round trips
   (module 00's latency cost) and it can migrate across network changes.
2. `Vary`. Omitting it lets a shared cache serve the wrong representation
   (wrong format/language, or a gzipped body to a client that can't decode
   it) to other clients.
3. Framing (chunked / `Transfer-Encoding`) is about how the message body
   is delimited on the connection (relates to module 01's message
   structure and module 07's connection framing); encoding (gzip /
   `Content-Encoding`) is about compressing the content end-to-end
   (module 08's compression). Orthogonal concerns.
4. `201 Created` with a `Location` header pointing at the new resource.
   Returning `200` with an error body for a failure lies to every consumer
   of the status code — caches, monitoring, and retry logic all
   misbehave (module 05).
5. The browser sends a preflight `OPTIONS` request first. Its failure is a
   *CORS* configuration problem (the preflight's `Access-Control-Allow-
   Methods`/`-Headers` didn't permit the PUT/headers), not a status-code
   or endpoint problem — which is why curl (no CORS enforcement) succeeds.
6. The bug: negotiating compression without `Vary: Accept-Encoding`, so
   the cache serves compressed bytes to a client that didn't ask for them.
   Fix: add `Accept-Encoding` to the `Vary` header.
7. Both define how long a previously fetched answer may be reused before
   re-asking (a time-to-live). HTTP adds *validation* (conditional
   requests with `ETag`/`Last-Modified` yielding `304`), letting a client
   cheaply confirm a stale copy is still current instead of blindly
   refetching — which DNS has no equivalent of.

</details>

## Further reading & sources

- [MDN: Content negotiation](https://developer.mozilla.org/en-US/docs/Web/HTTP/Content_negotiation) - the full explanation of server-driven negotiation and the `Accept*` headers.
- [RFC 9110 §12: Content Negotiation](https://www.rfc-editor.org/rfc/rfc9110#name-content-negotiation) - the authoritative rules, including quality (`q`) values.
- [MDN: Accept-Encoding](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Accept-Encoding) and [Content-Encoding](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Content-Encoding) - the compression negotiation pair.
- [web.dev: Reduce network payloads with text compression](https://web.dev/articles/reduce-network-payloads-using-text-compression) - practical gzip/Brotli guidance and measured wins.
- [FastAPI: GZip middleware](https://fastapi.tiangolo.com/advanced/middleware/#gzipmiddleware) - the middleware used in the exercises and how it sets `Vary`.
- [MDN: 406 Not Acceptable](https://developer.mozilla.org/en-US/docs/Web/HTTP/Status/406) - the correct signal when no acceptable representation exists.

## Next

[09-tls-ssl-and-https](../09-tls-ssl-and-https/README.md) — you've kept
seeing `https` and TLS handshakes since module 00; now we open up the
security layer that wraps everything: SSL/TLS and HTTPS.
