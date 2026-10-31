# 02 - API Layer and Request Handling

This track picks up exactly where **track 01** left off. In
`01-request-response-fundamentals` you learned how a request travels from a
client to a server and back — HTTP methods, headers, status codes, routing,
and serialization. This track moves up the stack to what happens *inside* the
server once that request arrives: how you validate it, wrap it in middleware,
give it request-scoped context, route it through clean layers of business
logic, turn it into correct CRUD, and design the whole thing as a coherent,
documented, RESTful API.

Everything is built in **Python with FastAPI + Pydantic**, and every module
adds to *one* project you grow from an empty folder — by the capstone you'll
have a complete, validated, middleware-chained, RESTful API with an
auto-generated OpenAPI spec.

## How this track works

- It assumes you finished **track 01** — you're comfortable with HTTP methods,
  status codes, headers, routing, and JSON serialization. This track does not
  re-teach those; it builds on them.
- It assumes basic Python and basic FastAPI familiarity (you've stood up a
  FastAPI app before). You'll want `pip install "fastapi[standard]"
  "pydantic[email]"` to follow along.
- Every module builds only on concepts from earlier modules in this track (plus
  track 01) — no forward references. Go in order; the object model is layered
  (validation feeds middleware feeds context feeds layering feeds CRUD feeds
  REST feeds OpenAPI).
- Each standard module has the same shape: why it matters, concepts (with
  concrete analogies), a code-pattern reference table, hands-on exercises (do
  them — including a diagnose-and-fix each), an independent challenge with no
  code given, common mistakes, and a checkpoint quiz. Two **cumulative
  reviews** (in modules 02 and 07) mix questions from everything so far,
  closed-book.
- The last module is an open-ended **capstone** with no solution given — it's
  the integration test for the whole track.

## Modules

| # | Module | What you'll be able to do | Time |
|---|--------|---------------------------|------|
| 00 | [Validation fundamentals](00-validation-fundamentals/README.md) | Enforce type, syntactic, and semantic validation with Pydantic, and know why the server is the real security boundary | 45-60 min |
| 01 | [Transformation and normalization](01-transformation-and-normalization/README.md) | Cast, normalize, and sanitize input into canonical form — and know what actually stops injection | 45-60 min |
| 02 | [Complex validation logic](02-complex-validation-logic/README.md) | Validate across fields, handle conditional rules, aggregate errors, and obscure sensitive ones | 60-90 min |
| 03 | [Middleware fundamentals](03-middleware-fundamentals/README.md) | Explain the request pipeline, write middleware, and short-circuit it correctly | 45-60 min |
| 04 | [Common middleware patterns](04-common-middleware-patterns/README.md) | Assemble the production middleware stack (security, CORS, rate limiting, auth, logging, errors) in the correct order | 60-90 min |
| 05 | [Request context](05-request-context/README.md) | Carry request-scoped state cleanly with dependency injection, and handle timeouts/cancellation | 60-90 min |
| 06 | [Handlers, controllers, and services](06-handlers-controllers-and-services/README.md) | Layer an API into thin handlers, HTTP-agnostic services, and repositories with centralized errors | 60-90 min |
| 07 | [CRUD deep dive](07-crud-deep-dive/README.md) | Implement correct CRUD with pagination, search, sort, filter, and production safeguards | 75-100 min |
| 08 | [RESTful architecture and best practices](08-restful-architecture-and-best-practices/README.md) | Design around resources and HTTP semantics: versioning, content negotiation, ETag caching | 60-90 min |
| 09 | [OpenAPI standards](09-openapi-standards/README.md) | Understand and produce an accurate OpenAPI contract, and reason about spec-first development | 45-60 min |
| 10 | [Capstone project](10-capstone-project/README.md) | Build a complete validated, middleware-chained, RESTful API with an auto-generated OpenAPI spec | 4-6 hrs |

Start here → [00-validation-fundamentals/README.md](00-validation-fundamentals/README.md)

Back to the master index: [../README.md](../README.md)

---

Once you've completed this track, the next one is
**03-authentication-and-authorization** — every endpoint you learned to build
here gets a real identity and permission model behind it: sessions, JWTs,
OAuth2/OIDC, API keys, MFA, and RBAC, plus the common auth security holes to
avoid.
