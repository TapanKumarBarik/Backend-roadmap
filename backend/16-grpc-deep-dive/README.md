# 16 - gRPC Deep Dive & Project

Track 11 (`11-advanced-api-paradigms`) taught you what gRPC *is*: Protocol
Buffers, the four RPC types, generated stubs, deadlines, interceptors, and
retries. That's enough to build a working service on your laptop. It is not
enough to run one in production, and it's not enough to design a schema that
survives two years of change without breaking every client.

This track is the production half. It covers the things that only bite once
a gRPC service is real: how to evolve a `.proto` without breaking deployed
clients, how to secure a channel with TLS and mutual TLS, why a normal load
balancer silently sends all your traffic to one backend, how to make a
service observable and testable, how browsers talk to gRPC at all, and what
gRPC actually costs versus REST when you measure instead of guess. It ends
with a **large, guided, step-by-step project**: a real multi-service gRPC
system you build end to end.

## How this track works

- It assumes **[11-advanced-api-paradigms, modules 01 and 02](../11-advanced-api-paradigms/README.md)**
  — protobuf syntax, `grpcio-tools` stub generation, unary and streaming
  RPCs, interceptors, and deadlines. This track does **not** re-teach those;
  it starts where they stop. If `rpc GetUser(GetUserRequest) returns (User)`
  and `grpc_tools.protoc` aren't already familiar, do those two modules first.
- It also assumes **[03-authentication-and-authorization](../03-authentication-and-authorization/README.md)**
  (for the auth module), **[08-observability-and-operational-readiness](../08-observability-and-operational-readiness/README.md)**
  (tracing/metrics vocabulary), and **[12-testing-and-code-quality](../12-testing-and-code-quality/README.md)**
  (test structure).
- Everything is **Python** (`grpcio`, `grpcio-tools`, `grpcio-health-checking`,
  `grpcio-reflection`), with `grpcurl`, `ghz`, and Docker for the operational
  exercises. Concepts are language-neutral and called out as such where the
  Python detail is incidental.
- Modules 00-05 use the standard shape: concepts, command reference,
  hands-on exercises, an independent challenge, common mistakes, and a
  checkpoint quiz.
- **Module 06 is a guided project, not an open-ended capstone.** Like
  `15-multi-tenancy-and-saas-architecture`'s module 06, it walks the whole
  build step by step with real code, because you asked to actually build
  something rather than be handed requirements.

## Modules

| # | Module | What you'll be able to do | Time |
|---|--------|---------------------------|------|
| 00 | [Protobuf schema design and evolution](00-protobuf-schema-design-and-evolution/README.md) | Design `.proto` files that can change safely: field-number discipline, wire compatibility rules, `reserved`, optionality, oneof, well-known types, and package/versioning layout | 90-120 min |
| 01 | [Security: TLS, mTLS and auth](01-security-tls-mtls-and-auth/README.md) | Serve gRPC over TLS, require and verify client certificates (mTLS), and carry per-call identity in metadata with an auth interceptor | 90-120 min |
| 02 | [Production serving: health, load balancing and keepalive](02-production-serving-health-lb-and-keepalive/README.md) | Expose the standard health service, understand why L4 load balancing breaks HTTP/2 gRPC, and tune keepalive, connection limits and graceful shutdown | 90-120 min |
| 03 | [Observability and testing](03-observability-and-testing/README.md) | Instrument a service with logging/metrics/tracing interceptors, propagate context across hops, and test gRPC properly with real servers and fakes | 90-120 min |
| 04 | [gRPC-Web, gateways and interop](04-grpc-web-and-gateways/README.md) | Expose a gRPC service to browsers and REST clients via gRPC-Web and a JSON/HTTP gateway, and know what each layer costs you | 75-100 min |
| 05 | [Performance and benchmarking](05-performance-and-benchmarking/README.md) | Measure gRPC honestly with `ghz`, read the results, and know when gRPC's advantage over REST is real and when it's noise | 75-100 min |
| 06 | [Project: build a gRPC microservice system](06-project-build-a-grpc-microservice-system/README.md) | Build a complete three-service gRPC system end to end — schema, mTLS, streaming, health, interceptors, gateway, tests and benchmarks — wiring modules 00-05 together | 6-10 hrs |

Start here -> [00-protobuf-schema-design-and-evolution/README.md](00-protobuf-schema-design-and-evolution/README.md)

Back to the master index: [../README.md](../README.md)

---

Related tracks: **[11-advanced-api-paradigms](../11-advanced-api-paradigms/README.md)**
is the prerequisite (gRPC fundamentals and streaming);
**[10-distributed-systems-patterns](../10-distributed-systems-patterns/README.md)**
covers the retry/idempotency semantics this track applies at the RPC layer;
and **[learn/04-networking-fundamentals, module 11](../../learn/04-networking-fundamentals/11-websocket-and-grpc/README.md)**
covers the HTTP/2 framing underneath gRPC from the network side.
