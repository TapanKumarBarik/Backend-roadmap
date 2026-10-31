# 11 - Advanced API Paradigms

This track is about everything past "just build a REST API." By the end of track
02 you could design a clean, validated, versioned, OpenAPI-documented REST API —
and for most systems that is exactly the right tool. This track makes you fluent
in the handful of cases where REST's defaults fight you, and in the alternatives
that fit those cases: **gRPC** for fast, typed, internal service-to-service
calls; **GraphQL** for rich frontends that need to pick their own data shape; the
**event/real-time** options (webhooks, WebSockets, SSE) for server-initiated
updates; and the edge components — **API gateways** and **Backend-for-Frontend**
layers — that sit in front of it all. The recurring thesis: paradigms coexist,
the *consumer* decides which one belongs at each edge, and every paradigm past
REST must earn its complexity against a concrete pain.

## How this track works

- It assumes you've finished **track 02 (API Layer and Request Handling)** —
  you're comfortable with FastAPI, request handlers, middleware, validation,
  versioning, and OpenAPI. Everything here is framed as "here's where REST
  strains and what to reach for instead," so that REST fluency is the baseline.
- Every module builds on the ones before it. The judgment established early — let
  the consumer decide the paradigm, don't add complexity before the pain exists,
  keep one domain behind many adapters — recurs in every later module and
  converges in the capstone. Go in order.
- Each standard module README has the same shape: why it matters, concepts, a
  command reference with real Python (`.proto` files and gRPC stubs, Strawberry
  resolvers and DataLoaders, FastAPI edge code), progressive hands-on exercises
  (do them — including a "diagnose and fix" scenario each), an independent
  challenge with no code, common mistakes, and a checkpoint quiz. Modules 03 and
  07 also carry a closed-book cumulative review.
- Exercises build in Python with `grpcio`/`grpcio-tools` (gRPC) and Strawberry on
  FastAPI (GraphQL), runnable locally. The real-time mechanics (webhooks,
  WebSockets, SSE, pub/sub) are cross-referenced to **track 06**, which owns them
  in depth — this track focuses on *which* mechanism to expose to *which*
  consumer, not on re-teaching them.

## Modules

| # | Module | What you'll be able to do | Time |
|---|--------|---------------------------|------|
| 00 | [Beyond REST — when and why](00-beyond-rest-when-and-why/README.md) | Look at a requirement and name the paradigm — REST, gRPC, GraphQL, or events — using a consumer-first decision framework | 60-90 min |
| 01 | [gRPC fundamentals](01-grpc-fundamentals/README.md) | Define a service in a `.proto`, generate Python stubs, and make typed unary RPC calls with Protocol Buffers | 75-100 min |
| 02 | [gRPC streaming and advanced patterns](02-grpc-streaming-and-advanced-patterns/README.md) | Use server/client/bidi streaming, status codes, deadlines, and interceptors — and avoid the leaked stream | 75-100 min |
| 03 | [GraphQL fundamentals](03-graphql-fundamentals/README.md) | Build a schema/resolver GraphQL API on Strawberry, and kill the N+1 problem with DataLoaders | 90-120 min |
| 04 | [GraphQL advanced patterns](04-graphql-advanced-patterns/README.md) | Add subscriptions, cursor-based pagination, per-field authorization, query-cost limits, and know federation | 90-120 min |
| 05 | [GraphQL schema evolution and deprecation](05-graphql-schema-evolution-and-deprecation/README.md) | Evolve a schema with no version numbers: `@deprecated`, additive-only change rules, field lifecycle, and schema checks in CI | 75-100 min |
| 06 | [GraphQL errors, nullability and partial results](06-graphql-errors-nullability-and-partial-results/README.md) | Use the `errors[]` array and null-propagation deliberately, and model expected failures as schema types rather than exceptions | 75-100 min |
| 07 | [GraphQL security, caching and observability](07-graphql-security-caching-and-observability/README.md) | Defend against alias and batching attacks that complexity limits miss, cache a POST-based API with APQ and cache hints, and trace per-resolver | 90-120 min |
| 08 | [Webhooks vs polling vs websockets tradeoffs](08-webhooks-vs-polling-vs-websockets-tradeoffs/README.md) | Choose the right update mechanism for a given consumer — poll, webhook, SSE, or WebSocket — and know its cost | 45-60 min |
| 09 | [API gateways and BFF](09-api-gateways-and-bff/README.md) | Place an API gateway (auth, rate limit, routing) and a Backend-for-Frontend layer at the edge — and know when each is premature | 75-100 min |
| 10 | [API design tradeoffs in practice](10-api-design-tradeoffs-in-practice/README.md) | Mix REST + gRPC + a GraphQL BFF in one system, version across paradigms, and document a multi-paradigm surface | 75-100 min |
| 11 | [Edge computing and WebAssembly](11-edge-computing-and-webassembly/README.md) | Run request-shaping logic at the edge in a Wasm sandbox, and know what belongs there vs. at origin | 60-90 min |
| 12 | [Capstone project](12-capstone-project/README.md) | Build one small service exposed via an internal gRPC API and a GraphQL BFF in front of it for a web client | 3-5 hrs |

Start here → [00-beyond-rest-when-and-why/README.md](00-beyond-rest-when-and-why/README.md)

Back to the master index: [../README.md](../README.md)

---

Once you've completed this track, the next one is
**12-testing-and-code-quality** — a shift from *designing and exposing* APIs to
*proving they work*: unit/integration/e2e tests with real TDD discipline, CI
automation, and objective code-quality measurement.
