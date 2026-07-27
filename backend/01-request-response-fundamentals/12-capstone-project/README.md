# Module 12: Capstone Project

## Why this matters

Every module in this track taught one facet of the request/response cycle
in isolation — the journey (00), raw messages (01), headers (02), methods
(03), CORS (04), status codes (05), caching (06), versions (07),
negotiation and compression (08), TLS (09), routing (10), and versioning
plus serialization (11). Real backend work never uses these one at a time.
A single endpoint returns the right status code *and* honest headers *and*
a cache strategy *and* the negotiated format *and* a versioned route — all
at once, correctly, or it's broken.

This capstone forces the synthesis. You'll build a small service *close to
the metal* — using Python's `http.server` (or raw `socket`) rather than a
full framework — precisely so you can't hide behind a framework's magic.
FastAPI would set `Content-Type`, `Content-Length`, and status lines for
you; here you write them yourself, which is the whole point. When you can
hand-assemble a correct HTTP response with the right status line, honest
representation headers, a working `ETag`/`Cache-Control` strategy, a
content-negotiated body, and a versioned route that can emit *both* JSON
and protobuf, you have genuinely internalized this track rather than
memorized it.

There is no solution code here. That's deliberate: the struggle to
assemble the pieces yourself, hitting the exact bugs the modules warned
about (a wrong `Content-Length` that hangs the connection, a missing
`Vary` that poisons a cache, a `200` where a `304` belonged), is where the
learning consolidates.

## The project

Build **a raw-HTTP-aware "catalog" service in Python** using `http.server`
(subclass `BaseHTTPRequestHandler`) or the `socket` module directly — *not*
FastAPI/Flask/Starlette. It serves a small catalog of products and must
demonstrate correct, hand-written behavior across the whole track.

### Functional requirements

1. **Versioned routing (modules 10, 11).**
   - `GET /v1/products` and `GET /v1/products/{id}` — a v1 shape.
   - `GET /v2/products/{id}` — a v2 shape with at least one *breaking*
     change from v1 (rename/restructure a field, change a type), and a
     64-bit id serialized *safely* (module 11's string-id lesson).
   - Route dispatch is yours to implement: parse the method and path, match
     static vs. dynamic (`{id}`) segments, and get the specificity/order
     right (module 10) — a request to a static route must not be swallowed
     by the dynamic one.

2. **Correct status codes (module 05), hand-written.**
   - `200` for a found product; `404` for a missing one; `405` (with an
     `Allow` header) when the path matches but the method doesn't; `400`
     for a malformed request body on writes; `422`-style rejection for a
     well-formed-but-invalid body; `406` when the client demands a format
     you can't produce.
   - Write the status line yourself (`HTTP/1.1 200 OK`) — no framework
     doing it for you.

3. **Honest headers, including a real caching strategy (modules 02, 06).**
   - Every response has an accurate `Content-Type` and a correct
     `Content-Length` (compute it from the actual body bytes — a mismatch
     will hang or truncate, module 01).
   - Product responses carry a `Cache-Control` (a sensible `max-age`) and
     an `ETag` derived from the product's content.
   - Support **conditional requests**: if the client sends
     `If-None-Match` matching the current `ETag`, return **`304 Not
     Modified`** with no body (module 06). Per-user or non-cacheable
     responses (if you add any) must use `private`/`no-store`.

4. **Content negotiation + compression (module 08).**
   - Honor `Accept`: serve JSON by default; if the client accepts your
     binary type, serve protobuf (see requirement 5). If it demands
     something you can't produce, `406`.
   - Honor `Accept-Encoding: gzip` by gzip-compressing text responses and
     setting `Content-Encoding: gzip` (only when the client accepts it).
   - Set **`Vary`** on every negotiated response listing every request
     header you varied on (`Accept`, `Accept-Encoding`) — or a shared cache
     will serve the wrong representation (module 06/08).

5. **JSON *and* binary (protobuf) serialization (module 11).**
   - Define a `.proto` schema for a product, compile it (`protoc
     --python_out=...`), and serve a protobuf-encoded body when the client
     sends `Accept: application/x-protobuf` (or your chosen media type),
     with the correct `Content-Type`.
   - Serve JSON otherwise. The *same* product resource, two serializations,
     chosen by negotiation — and observe/compare the byte sizes of each.
   - Validate incoming write payloads before trusting them (module 11's
     "validate before you deserialize").

6. **Security headers (module 02).**
   - Set at least three appropriate response security headers
     (`X-Content-Type-Options: nosniff`, etc.). If you serve over TLS
     (optional stretch, module 09), add HSTS.

### Stretch goals (optional)

- Serve it over **HTTPS** with a self-signed cert (module 09) and add
  `Strict-Transport-Security`; observe the handshake with `openssl
  s_client`.
- Add a **deprecation** signal to `/v1` (`Deprecation`/`Sunset` headers,
  module 11).
- Add proper **CORS** handling (module 04): answer a preflight `OPTIONS`
  with the right `Access-Control-*` headers, and reject a disallowed
  origin.
- Add **`Transfer-Encoding: chunked`** streaming for a large listing
  instead of buffering (module 08), and contrast it with `Content-Length`.

### Acceptance checklist

Verify each with `curl` (and `openssl`/`protoc` where relevant). You should
be able to demonstrate *all* of these:

- [ ] `curl -s http://localhost:PORT/v1/products/1` returns the v1 shape
      with `200`, correct `Content-Type: application/json`, a
      `Content-Length` that matches the body's byte count, a
      `Cache-Control`, and an `ETag`.
- [ ] `curl -s http://localhost:PORT/v2/products/1` returns the v2
      (breaking-change) shape, with the 64-bit id as a string.
- [ ] Re-requesting with `If-None-Match: "<the etag>"` returns `304` and
      an empty body.
- [ ] Changing a product (or a different product) yields a *different*
      `ETag`, and the conditional request then returns `200` with the new
      body.
- [ ] `curl -s -w '%{http_code}' http://localhost:PORT/v1/products/999`
      returns `404`.
- [ ] `curl -X DELETE http://localhost:PORT/v1/products/1` returns `405`
      with an `Allow` header (assuming you didn't implement delete).
- [ ] A request to a static route that overlaps the dynamic one resolves to
      the correct handler (specificity/order correct — module 10).
- [ ] `curl -H 'Accept: application/x-protobuf' .../v2/products/1` returns
      a protobuf body with the matching `Content-Type`; the default returns
      JSON. Both carry `Vary: Accept`.
- [ ] `curl -H 'Accept-Encoding: gzip' -sD - -o /dev/null .../v1/products`
      shows `Content-Encoding: gzip` and `Vary` includes `Accept-Encoding`;
      the gzipped `size_download` is smaller than the plain one.
- [ ] `curl -H 'Accept: text/csv' ...` (a format you don't produce)
      returns `406`.
- [ ] A malformed JSON write returns a parse-level `400`; a
      well-formed-but-invalid write returns a `422`-style rejection.
- [ ] At least three security headers appear on responses.
- [ ] (If attempted) HTTPS handshake succeeds and HSTS is present;
      preflight `OPTIONS` returns correct `Access-Control-*` headers.

### Hints

- **Start with the raw response writer.** Write one function that, given a
  status code, headers dict, and body bytes, emits a correct HTTP response:
  status line, headers (including a `Content-Length` computed from
  `len(body)`), the blank line, then the body. Get *this* right first
  (module 01) — everything else is building on it. Test it with a raw
  `socket` or `BaseHTTPRequestHandler.wfile.write`.
- **Dispatch is a small matcher.** Split the path on `/`, match the version
  prefix, then match `products` and an optional `{id}`. Check static routes
  before treating a segment as a dynamic id (module 10's order lesson).
- **ETag = hash of the serialized content.** `'"' +
  hashlib.sha256(body_bytes).hexdigest()[:16] + '"'`. Compare the client's
  `If-None-Match` against it; equal ⇒ `304` (module 06).
- **Negotiation is just reading headers and branching.** Parse `Accept` and
  `Accept-Encoding`; pick a body format and encoding; set the matching
  `Content-Type`/`Content-Encoding` and the `Vary` header (module 08). Do
  the gzip with the stdlib `gzip` module.
- **protobuf:** write a tiny `product.proto` (`message Product { int64 id =
  1; string name = 2; ... }`), run `protoc --python_out=.
  product.proto`, import the generated module, populate a `Product`, and
  `SerializeToString()` for the body. `Content-Type:
  application/x-protobuf`.
- **Content-Length is load-bearing.** Compute it from the *final* body
  bytes — *after* gzip/protobuf encoding, not before. A mismatch is the
  module 01 hang-or-truncate bug; if a response hangs, suspect this first.
- **Test the failure modes deliberately.** Send the wrong `Accept`, a stale
  `If-None-Match`, a `DELETE` on a read-only route, a malformed body — the
  acceptance checklist *is* your test suite.
- **Compare sizes.** Use `curl -w '%{size_download}'` to see JSON vs.
  protobuf vs. gzipped-JSON byte counts — the module 08/11 tradeoff, made
  concrete on your own data.

When every box on the acceptance checklist is checked and you can *explain*
which module each behavior came from, you've completed track 01. You can
now read a raw HTTP exchange, reason about every header, choose correct
status codes, design a cache strategy, negotiate formats, and version an
evolving API — the vocabulary every remaining backend track assumes.

## Further reading & sources

- [Python docs: http.server](https://docs.python.org/3/library/http.server.html) - `BaseHTTPRequestHandler`, the raw handler you subclass for this project.
- [Python docs: socket](https://docs.python.org/3/library/socket.html) and [gzip](https://docs.python.org/3/library/gzip.html) - the lower-level transport and the compression you set by hand.
- [RFC 9110: HTTP Semantics](https://www.rfc-editor.org/rfc/rfc9110) and [RFC 9111: HTTP Caching](https://www.rfc-editor.org/rfc/rfc9111) - the specs to check your hand-written status codes, headers, and `ETag`/`304` behavior against.
- [Protocol Buffers: Python tutorial](https://protobuf.dev/getting-started/pythontutorial/) - compiling a `.proto` and using `SerializeToString()` for the binary body.
- [MDN: HTTP messages](https://developer.mozilla.org/en-US/docs/Web/HTTP/Messages) - the message anatomy your raw response writer must reproduce exactly, including `Content-Length`.

## Next

Track 02 builds directly on this: [../../02-api-layer-and-request-handling/README.md](../../02-api-layer-and-request-handling/README.md)
— you'll take everything here and design a properly validated,
middleware-chained, OpenAPI-documented RESTful API on top of a real
framework, now that you understand exactly what that framework is doing for
you underneath.
