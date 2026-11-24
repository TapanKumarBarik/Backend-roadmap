# Track: API Design

REST, GraphQL, gRPC, resource modeling, versioning, pagination, idempotency, rate limiting, authn/authz, gateways, retries, webhooks and contracts — the API surface every system design answer draws.

Part of **Phase 2** on the [YouTube playlist](https://www.youtube.com/playlist?list=PLEBaLYrJs0lI). Every lecture already has a video; all **23** written 16-point lectures in this track are live.

## How this track works

- Watch on YouTube (or from the site Videos page) first if you want the spoken version.
- Related deep modules elsewhere on the site (Backend, Learn, GenAI) may already host the same video beside a longer lesson. This track is the System Design short-lecture home for the same ideas.
- When a written lecture lands, the *Soon* marker clears and the notes appear under the video.

## Lectures

| # | Lecture | What you'll be able to do | Status |
|---|---------|---------------------------|--------|
| 01 | [REST Principles: Resources, Verbs, HATEOAS & "Cancel Order"](01-rest-principles/README.md) | REST Principles: Resources, Verbs, HATEOAS & "Cancel Order" | Live |
| 02 | [GraphQL for System Design: Resolvers, N+1, DataLoader & Limits](02-graphql-for-system-design/README.md) | GraphQL for System Design: Resolvers, N+1, DataLoader & Limits | Live |
| 03 | [gRPC & Protocol Buffers: .proto, HTTP/2, Deadlines & Evolution](03-grpc-protocol-buffers/README.md) | gRPC & Protocol Buffers: .proto, HTTP/2, Deadlines & Evolution | Live |
| 04 | [REST vs GraphQL vs gRPC: How to Choose an API Style](04-rest-vs-graphql-vs-grpc/README.md) | REST vs GraphQL vs gRPC: How to Choose an API Style | Live |
| 05 | [API Resource Modeling & URI Design: Nesting, Actions & Bulk](05-api-resource-modeling-uri-design/README.md) | API Resource Modeling & URI Design: Nesting, Actions & Bulk | Live |
| 06 | [API Versioning Without Breaking Clients: URL vs Header vs Date](06-api-versioning-without-breaking-clients/README.md) | API Versioning Without Breaking Clients: URL vs Header vs Date | Live |
| 07 | [API Pagination: Offset vs Cursor & Why Deep Pages Are Slow](07-api-pagination/README.md) | API Pagination: Offset vs Cursor & Why Deep Pages Are Slow | Live |
| 08 | [API Filtering, Sorting & Field Selection Without Table Scans](08-api-filtering-sorting-field-selection-without-table-scans/README.md) | API Filtering, Sorting & Field Selection Without Table Scans | Live |
| 09 | [Idempotency Keys: How Payment APIs Never Charge Twice on Retry](09-idempotency-keys/README.md) | Idempotency Keys: How Payment APIs Never Charge Twice on Retry | Live |
| 10 | [API Request Validation: Pydantic, 422, Unknown Fields & Size Limits](10-api-request-validation/README.md) | API Request Validation: Pydantic, 422, Unknown Fields & Size Limits | Live |
| 11 | [API Error Handling: 4xx vs 5xx, Problem Details & Retryable Errors](11-api-error-handling/README.md) | API Error Handling: 4xx vs 5xx, Problem Details & Retryable Errors | Live |
| 12 | [Rate Limiting Algorithms: Token Bucket vs Sliding Window vs Fixed W…](12-rate-limiting-algorithms/README.md) | Rate Limiting Algorithms: Token Bucket vs Sliding Window vs Fixed Window | Live |
| 13 | [Distributed Rate Limiting: Redis, Lua Scripts, 429 Headers & Redis …](13-distributed-rate-limiting/README.md) | Distributed Rate Limiting: Redis, Lua Scripts, 429 Headers & Redis Down? | Live |
| 14 | [Throttling vs Rate Limiting vs Quotas: Free & Paid Tiers, Monthly L…](14-throttling-vs-rate-limiting-vs-quotas/README.md) | Throttling vs Rate Limiting vs Quotas: Free & Paid Tiers, Monthly Limits | Live |
| 15 | [API Authentication: API Keys vs JWT vs HMAC Signatures vs mTLS](15-api-authentication/README.md) | API Authentication: API Keys vs JWT vs HMAC Signatures vs mTLS | Live |
| 16 | [API Authorization & BOLA: Scopes, Ownership Checks and Where They Live](16-api-authorization-bola/README.md) | API Authorization & BOLA: Scopes, Ownership Checks and Where They Live | Live |
| 17 | [API Gateway Explained: What Belongs in It, BFFs & Avoiding a SPOF](17-api-gateway-explained/README.md) | API Gateway Explained: What Belongs in It, BFFs & Avoiding a SPOF | Live |
| 18 | [Retries, Exponential Backoff & Jitter: How Retries Cause Outages](18-retries-exponential-backoff-jitter/README.md) | Retries, Exponential Backoff & Jitter: How Retries Cause Outages | Live |
| 19 | [API Timeouts & Deadline Propagation: Budgets, gRPC & Cancellation](19-api-timeouts-deadline-propagation/README.md) | API Timeouts & Deadline Propagation: Budgets, gRPC & Cancellation | Live |
| 20 | [Webhooks: Reliable Delivery, HMAC Signing, Retries & Duplicate Hand…](20-webhooks/README.md) | Webhooks: Reliable Delivery, HMAC Signing, Retries & Duplicate Handling | Live |
| 21 | [Async APIs for Long Jobs: 202 Accepted, Job Status, Polling vs Call…](21-async-apis-for-long-jobs/README.md) | Async APIs for Long Jobs: 202 Accepted, Job Status, Polling vs Callbacks | Live |
| 22 | [API Contracts & OpenAPI: Contract-First, Typed Clients & Pact](22-api-contracts-openapi/README.md) | API Contracts & OpenAPI: Contract-First, Typed Clients & Pact | Live |
| 23 | [API Backward Compatibility: Breaking Changes & Expand-Contract](23-api-backward-compatibility/README.md) | API Backward Compatibility: Breaking Changes & Expand-Contract | Live |

Start here → [REST Principles: Resources, Verbs, HATEOAS & "Cancel Order"](01-rest-principles/README.md)

Back to the course index: [../README.md](../README.md)
