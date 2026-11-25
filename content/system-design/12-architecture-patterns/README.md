# Track: Architecture Patterns

Monolith vs microservices, modular monolith, event-driven design, CQRS, BFF, cells, and when not to split.

Part of **Phase 5** on the [YouTube playlist](https://www.youtube.com/playlist?list=PLNdzHik9GD0I). Every lecture pairs a spoken walkthrough with a full 16-section written deep dive: architecture diagrams, mathematical models, 4-language production code tabs (`Go`, `TypeScript`, `Python`, `C#`), CLI verification workflows, 12 interview Q&As, and a one-page cheat sheet.

## How this track works

- Watch on YouTube (or from the site Videos page) first if you want the spoken version.
- Related deep modules elsewhere on the site (Backend, Learn, GenAI) may already host the same video beside a longer lesson. This track is the System Design short-lecture home for the same ideas.
- Compare architectural tradeoffs with the [System Design Capacity Estimator](/tools/system-design-estimator/) and [Low-Level Design (LLD) & Schema Studio](/tools/lld-studio/).

## Lectures

| # | Lecture | What you'll be able to do | Status |
|---|---------|---------------------------|--------|
| 01 | [Monolith vs Microservices: When NOT to Split (Distributed Monolith Trap)](01-monolith-vs-microservices/README.md) | Weigh team topology, latency, and deployment independence to avoid premature splitting | **Live** |
| 02 | [Modular Monolith: Why Startups Should Start Here (Not Microservices)](02-modular-monolith/README.md) | Enforce module boundaries and in-process events inside a single deployable unit | **Live** |
| 03 | [Domain-Driven Design Basics: Aggregates, Entities & Value Objects](03-domain-driven-design-basics/README.md) | Model Entities, immutable Value Objects, and transactional Aggregate Root boundaries | **Live** |
| 04 | [Bounded Contexts: How to Find Microservice Boundaries (DDD)](04-bounded-contexts/README.md) | Map ubiquitous language boundaries and design Context Maps with Published Languages | **Live** |
| 05 | [Database per Service: Why Microservices Shouldn't Share a Database](05-database-per-service/README.md) | Eliminate shared-table coupling using private schemas, API composition, and CQRS views | **Live** |
| 06 | [Sync vs Async Communication in Microservices (REST, gRPC, Events)](06-sync-vs-async-communication-in-microservices/README.md) | Choose between REST/gRPC request-reply and asynchronous event-driven messaging | **Live** |
| 07 | [API Gateway Pattern: Routing, Aggregation & What Never Goes There](07-api-gateway-pattern/README.md) | Centralize auth, rate limiting, and routing while keeping domain logic out of the gateway | **Live** |
| 08 | [Backend-for-Frontend (BFF): Why One Gateway Isn't Enough](08-backend-for-frontend/README.md) | Tailor payload shaping and aggregation per client surface (Web, iOS/Android, TV) | **Live** |
| 09 | [Service Mesh Explained: mTLS, Retries & Telemetry (Istio, Linkerd)](09-service-mesh-explained/README.md) | Offload zero-trust mTLS, L7 retries, and telemetry to Envoy sidecars and control planes | **Live** |
| 10 | [Sidecar, Ambassador & Adapter Patterns (with a Log-Shipping Example)](10-sidecar-ambassador-adapter-patterns/README.md) | Compose cross-cutting infra capabilities in co-located containers without touching app code | **Live** |
| 11 | [Strangler Fig Pattern: Migrate a Monolith with Zero Downtime](11-strangler-fig-pattern/README.md) | Incrementally route traffic from legacy monoliths to new services with shadow/canary checks | **Live** |
| 12 | [Anti-Corruption Layer: Keep Legacy Models Out of Your Domain](12-anti-corruption-layer/README.md) | Isolate clean domain models from legacy schemas using translation adapters and facades | **Live** |
| 13 | [Hexagonal Architecture (Ports & Adapters): Swap Infra, Test Fast](13-hexagonal-architecture/README.md) | Decouple core business logic from databases, HTTP frameworks, and brokers via Ports & Adapters | **Live** |
| 14 | [Clean Architecture: The Dependency Rule (and When It's Overkill)](14-clean-architecture/README.md) | Apply concentric dependency inversion without drowning simple CRUD services in boilerplate | **Live** |
| 15 | [Serverless Architecture: Cold Starts, Limits & When NOT to Use It](15-serverless-architecture/README.md) | Model cold-start tail latency, concurrency limits, and serverless vs container cost curves | **Live** |
| 16 | [Saga Orchestration with Workflow Engines: Temporal & Step Functions](16-saga-orchestration-with-workflow-engines/README.md) | Coordinate durable multi-step transactions and compensating rollbacks with workflow engines | **Live** |
| 17 | [CQRS & Event Sourcing in Microservices: Queries Across Services](17-cqrs-event-sourcing-in-microservices/README.md) | Solve cross-service joins using materialized read projections and outbox-fed streams | **Live** |
| 18 | [Distributed Tracing Across Microservices: traceparent, Spans & Kafka](18-distributed-tracing-across-microservices/README.md) | Propagate W3C `traceparent` headers across HTTP, gRPC, and Kafka to debug tail latency | **Live** |
| 19 | [Microservice Anti-Patterns: Signs You Built a Distributed Monolith](19-microservice-anti-patterns/README.md) | Diagnose and remediate distributed monoliths, shared DBs, chatty RPCs, and lock-step deploys | **Live** |
| 20 | [Configuration Management: Change Config Without Redeploying](20-configuration-management/README.md) | Manage dynamic feature flags, secret rotation, and schema-validated config rollouts | **Live** |

Start here → [Monolith vs Microservices: When NOT to Split (Distributed Monolith …](01-monolith-vs-microservices/README.md)

Back to the course index: [../README.md](../README.md)
