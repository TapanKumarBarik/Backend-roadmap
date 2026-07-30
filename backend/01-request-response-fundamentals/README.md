# 01 - Request/Response Fundamentals

This is track 1 of the backend-engineering curriculum, and it has no
prerequisites — it's where the whole thing starts. The goal is simple to
state and deep to achieve: **make HTTP stop being a black box.** By the
end you'll be able to trace a request from a browser all the way to your
code and back, read raw HTTP messages by eye, and speak the protocol
fluently — methods, headers, status codes, caching, versions, compression,
routing, and serialization — well enough that every later track (APIs,
auth, databases, caching, distributed systems) rests on solid ground
instead of hand-waving.

## How this track works

- **No framework magic first.** Wherever the point is to *see the
  protocol*, we drop to raw `socket` / `http.client` / `http.server` so
  nothing is hidden. Where a framework is genuinely warranted (routing,
  validation, negotiation at scale), we use **FastAPI** — but only after
  you've seen what it's doing for you underneath.
- **Everything is hands-on.** Each module has 6-10 runnable exercises —
  real `curl` commands against a real endpoint you stand up, real Python
  to write and run — including at least one "diagnose and fix" scenario per
  module where you're handed something broken. Do them; don't just read
  them.
- **Go in order.** The modules are layered: raw messages (01) before
  headers (02) before methods (03) before status codes (05); caching (06)
  reuses the `304` from status codes; content negotiation (08) reuses the
  `Accept`/`Content-Type` pairing from headers; versioning (11) reuses
  routing (10). Skipping ahead means forward references you haven't met.
- **Attempt the quizzes and the independent challenge closed-book.** The
  checkpoint quizzes and the no-code-given independent challenges are where
  recognition turns into recall. Two **cumulative reviews** (in modules 03
  and 08) mix questions from everything so far — take them without notes.
- All exercises run locally (curl, Python 3, and a little `openssl`/
  `protoc`); no cloud account or paid service is needed.

## Modules

| # | Module | What you'll be able to do | Time |
|---|--------|---------------------------|------|
| 00 | [System overview and request flow](00-system-overview-and-request-flow/README.md) | Trace a request browser → DNS → network → cloud backend → response, and attribute latency to the right stage | 45-60 min |
| 01 | [HTTP protocol basics](01-http-protocol-basics/README.md) | Read and hand-type raw HTTP request/response messages; explain statelessness | 60-90 min |
| 02 | [HTTP headers deep dive](02-http-headers-deep-dive/README.md) | Categorize every header (general/request/response/representation/security) and set them correctly | 60-90 min |
| 03 | [HTTP methods and semantics](03-http-methods-and-semantics/README.md) | Choose GET/POST/PUT/PATCH/DELETE correctly and reason about safety and idempotency | 60-90 min |
| 04 | [CORS and preflight requests](04-cors-and-preflight-requests/README.md) | Explain and configure CORS, and read a real preflight exchange | 60-90 min |
| 05 | [HTTP responses and status codes](05-http-responses-and-status-codes/README.md) | Return the semantically correct status code for every situation | 60-90 min |
| 06 | [HTTP caching](06-http-caching/README.md) | Design a cache strategy with `Cache-Control`, `ETag`, and conditional `304`s | 60-90 min |
| 07 | [HTTP/1.1 vs 2 vs 3](07-http-1-1-vs-2-vs-3/README.md) | Explain the wire-level differences and why they matter for performance | 45-60 min |
| 08 | [Content negotiation and compression](08-content-negotiation-and-compression/README.md) | Negotiate format/language/encoding correctly (with `Vary`) and compress responses | 60-90 min |
| 09 | [TLS/SSL and HTTPS](09-tls-ssl-and-https/README.md) | Explain HTTPS = HTTP over TLS, inspect certificates, and debug TLS errors | 60-90 min |
| 10 | [Routing fundamentals](10-routing-fundamentals/README.md) | Map URLs+methods to handlers across every route shape, with correct matching order | 60-90 min |
| 11 | [API versioning and serialization](11-api-versioning-and-serialization/README.md) | Evolve an API safely with versions/deprecation, and serialize JSON vs. binary correctly and securely | 90-120 min |
| 12 | [CDN and edge caching](12-cdn-and-edge-caching/README.md) | Scale HTTP caching across a distributed CDN: cache keys, purge, origin shielding, and stale-while-revalidate | 60-90 min |
| 13 | [Capstone project](13-capstone-project/README.md) | Build a raw-HTTP service demonstrating status codes, caching, negotiation, and versioned JSON + protobuf | 3-5 hrs |

Start here → [00-system-overview-and-request-flow/README.md](00-system-overview-and-request-flow/README.md)

Back to the master index: [../README.md](../README.md)

---

Once you've completed this track, the next one is **02-api-layer-and-request-handling**,
which takes the raw HTTP fluency you built here and layers on the design
discipline of real API construction — validation, middleware chains,
RESTful resource modeling, and an OpenAPI spec — on top of a framework you
now understand from the inside out.
