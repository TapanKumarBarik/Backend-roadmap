# Backend Engineering: Fundamentals → Distributed Systems → System Design

A hands-on curriculum covering backend engineering as a discipline, independent
of any one framework — the underlying systems and principles that transfer
across languages (Node, Python, Go, Java, whatever your job throws at you next).
All hands-on exercises use **Python** (mostly FastAPI) as the working language,
but every module explains the *why* behind the concept first, so the knowledge
isn't tied to Python either.

This is a large curriculum, being built out in batches. Tracks are added in
dependency order; if a track's folder doesn't exist yet, it hasn't been built
out yet — check back.

This folder is a sibling to [`../learn/`](../learn/README.md), not a
replacement for it. `learn/` is about operating infrastructure (Linux, Docker,
Kubernetes, Azure). `backend/` is about designing and building the applications
that run on top of that infrastructure. Track 13 here (DevOps for Backend
Engineers) and parts of tracks 04 and 09 deliberately point back at specific
`learn/` tracks instead of re-teaching them.

## Naming convention

Same convention as `learn/`:

- **Tracks** are top-level folders directly under `backend/`, named
  `NN-track-name` — a zero-padded two-digit sequence number (the order you do
  them in) plus a lowercase kebab-case slug. `NN` is globally sequential
  across this whole curriculum.
- **Modules** are subfolders inside a track, named the same way —
  `NN-module-name` — but `NN` restarts at `00` inside each track and is local
  to that track.
- Every module folder contains exactly one `README.md`. No separate exercise
  files or scripts — everything a module needs is written inline as fenced
  code blocks you copy into your own project.
- The **last module in every track is always `NN-capstone-project`** — an
  open-ended, no-solution-given project. It skips the command reference,
  quiz, and independent-challenge scaffolding — it *is* the open-ended
  integration test.
- Every track folder's own `README.md` is that track's index. This file
  (`backend/README.md`) is the single master index for all tracks.

## How to use this

- Go in order. Track numbering reflects dependency order — each track
  assumes everything before it.
- Inside each track, module folders are numbered — do them in order.
- Every standard module README has: concepts explained plainly, a code/
  command reference table, **hands-on exercises** (do these — don't just
  read), an **independent challenge** with no code given, common mistakes,
  and a checkpoint quiz. Every 3-4 modules there's also a **cumulative
  review** mixing questions from everything so far in that track.

## How to actually retain this (read this once, seriously)

Guided exercises build recognition, not recall. Use the curriculum the way
it's structured to fight that:

- **Attempt every quiz question in writing before opening the answer.**
- **Do the independent challenge with zero peeking** at earlier solved
  exercises. Struggling for 10-15 minutes before checking a hint is the
  point.
- **Take the cumulative reviews closed-book.** If you can't answer something
  from three modules back, go redo that module's exercises.
- **Before starting a new module, redo one exercise from the previous
  module from memory**, no notes.
- **When you hit a real error the curriculum didn't script for you,** sit
  with it before searching — that's the actual skill being built.

## Tracks

| # | Track | What you'll be able to do after | Depends on |
|---|-------|-----------------------------------|------------|
| 1 | [01-request-response-fundamentals](01-request-response-fundamentals/README.md) | Explain how a request travels from browser to backend and back, and speak HTTP fluently — methods, headers, status codes, caching, versions, compression, routing, serialization | nothing |
| 2 | [02-api-layer-and-request-handling](02-api-layer-and-request-handling/README.md) | Design and build a properly validated, middleware-chained, RESTful API with an OpenAPI spec | request-response-fundamentals |
| 3 | [03-authentication-and-authorization](03-authentication-and-authorization/README.md) | Implement sessions, JWTs, OAuth2/OIDC, API keys, MFA, and RBAC — and avoid the common auth security holes | api-layer-and-request-handling |
| 4 | [04-databases-and-data-layer](04-databases-and-data-layer/README.md) | Design schemas, write correct concurrent transactions, use an ORM properly, and reason about replication and sharding | api-layer-and-request-handling |
| 5 | [05-caching-and-performance](05-caching-and-performance/README.md) | Apply the right caching strategy at the right layer, find and fix real performance bottlenecks, and reason about concurrency vs parallelism | databases-and-data-layer |
| 6 | [06-background-processing-and-realtime](06-background-processing-and-realtime/README.md) | Build task queues, scheduled jobs, webhooks, real-time websocket/SSE features, and handle large file uploads | api-layer-and-request-handling, caching-and-performance |
| 7 | [07-search-with-elasticsearch](07-search-with-elasticsearch/README.md) | Index data, write relevance-ranked full-text queries, and operate Elasticsearch/Kibana | databases-and-data-layer |
| 8 | [08-observability-and-operational-readiness](08-observability-and-operational-readiness/README.md) | Handle errors correctly, manage config safely, implement structured logging/metrics/tracing, and shut down gracefully | api-layer-and-request-handling |
| 9 | [09-security-deep-dive](09-security-deep-dive/README.md) | Defend against OWASP-class attacks, implement real rate limiting, and apply secure-by-design principles | authentication-and-authorization |
| 10 | [10-distributed-systems-patterns](10-distributed-systems-patterns/README.md) | Reason about CAP theorem tradeoffs, apply idempotency and distributed locking correctly, and use sagas/CQRS/event sourcing where they fit | databases-and-data-layer, background-processing-and-realtime |
| 11 | [11-advanced-api-paradigms](11-advanced-api-paradigms/README.md) | Design and build gRPC and GraphQL APIs, and know when an API gateway/BFF belongs in front of your services | api-layer-and-request-handling |
| 12 | [12-testing-and-code-quality](12-testing-and-code-quality/README.md) | Write unit/integration/e2e tests with real TDD discipline, automate them in CI, and measure code quality objectively | api-layer-and-request-handling |
| 13 | [13-devops-for-backend-engineers](13-devops-for-backend-engineers/README.md) | Connect backend code to CI/CD, containers, and deployment strategies — and know exactly which `learn/` track to go deep in for each | testing-and-code-quality, observability-and-operational-readiness |
| 14 | [14-system-design-interview-practice](14-system-design-interview-practice/README.md) | Estimate capacity, run a structured system-design whiteboard session, and solve classic system design problems end to end | everything above |
| 15 | [15-multi-tenancy-and-saas-architecture](15-multi-tenancy-and-saas-architecture/README.md) | Design and build a real multi-tenant SaaS: tenant routing, tenant-scoped auth, provisioning automation, billing/metering, and app-layer noisy-neighbor mitigation, ending in a guided small-SaaS build | databases-and-data-layer, authentication-and-authorization, background-processing-and-realtime |
| 16 | [16-grpc-deep-dive](16-grpc-deep-dive/README.md) | Take gRPC to production: protobuf schema evolution, mTLS, health/load-balancing/keepalive, observability and testing, gRPC-Web and gateways, honest benchmarking — ending in a guided three-service gRPC system build | advanced-api-paradigms (01, 02), authentication-and-authorization, observability-and-operational-readiness |

## Prerequisites already confirmed

- You've built a FastAPI app before (the `python-fastapi` project earlier in
  this workspace) — this curriculum assumes basic Python and basic REST
  familiarity, not zero-code-ever.
- Practicing in WSL2 on this machine, same as `learn/`.
- Cross-references to `learn/` assume you're working through both curricula
  roughly in parallel, but neither strictly blocks the other except where a
  module explicitly says so.

Start here → [01-request-response-fundamentals/README.md](01-request-response-fundamentals/README.md)
