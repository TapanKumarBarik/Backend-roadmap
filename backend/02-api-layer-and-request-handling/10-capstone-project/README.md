# Module 10: Capstone Project

## Why this matters

Every module so far handed you scaffolding — a code block to paste, an
expected output to check against, a hint when you got stuck. This one doesn't.
The capstone is the integration test for the whole track, and the only way to
find out whether the knowledge actually transferred is to build something
substantial from an empty folder with no solution to peek at. The guided
exercises built *recognition*: you could follow along and it made sense. Real
competence is *recall plus synthesis* — sitting in front of a blank `main.py`
and knowing, without prompting, that the create endpoint returns `201` with a
`Location` header, that the rate limiter goes outside auth, that the service
raises a domain exception instead of an `HTTPException`, that the sort
parameter must be whitelisted, and that all of it should produce a truthful
OpenAPI spec.

Everything in this track was deliberately building one project up module over
module: validation (00–02), middleware (03–04), request context (05),
layering (06), CRUD (07), REST design (08), and OpenAPI (09). The capstone
asks you to assemble a *coherent* API where those pieces fit together the way
they do in a real service — not eight disconnected demos, but one system whose
layers reinforce each other. If a piece feels shaky when you try to place it,
that's the signal to go back to that module's exercises and redo one from
memory. Struggling here, before you look anything up, is the entire point.

## The project

Build a complete REST API for a small resource of your choice — a **task
list** or an **order** API are the intended targets, but any single primary
resource with a couple of related sub-resources works (a bookmarks API, a
notes API, a simple inventory). Use **FastAPI + Pydantic**. Start from an
empty folder; do not copy a previous module's `main.py` wholesale — rebuild it
so the recall is real. No solution code is given.

Your API must bring together the whole track:

**Resource & REST design (module 08)**
- Model the primary resource and at least one nested/related sub-resource
  (e.g. `tasks` and `tasks/{id}/comments`, or `orders` and
  `orders/{id}/items`).
- Use correct HTTP methods and status codes throughout (`201`+`Location` on
  create, `200`/`404` on read, `204` on delete, `409` on conflict).
- Version the API under a `/v1` prefix from the start.
- Express at least one non-CRUD operation as a state change, not a verb URL
  (e.g. "complete a task" / "cancel an order" via `PATCH`).
- Add ETag-based revalidation (`304`) to the single-resource GET.

**Validation & transformation (modules 00–02)**
- Strict Pydantic validation on every write: type, syntactic, and semantic
  rules, with at least one custom `@field_validator` and one cross-field
  `@model_validator`.
- Normalize at least one field (trim/lowercase) before storage.
- Aggregate validation errors and return them in a consistent envelope.
- Never leak internals or enable enumeration in error messages.

**Middleware chain (modules 03–04)**
- At least **3 custom middlewares** in a **deliberately ordered chain**.
  Recommended: structured request logging (outermost), a request-ID
  middleware, rate limiting, and security headers — plus a catch-all error
  handler. Order must be defensible: logging outside auth, rate limiting
  outside auth, error handling outermost.
- Document (in a comment or README) *why* your order is correct.

**Request context & layering (modules 05–06)**
- Inject the current user and a per-request "DB session" (a `yield`
  dependency) via `Depends`; no module-level globals for per-request data.
- Clean handler → service → repository layering. Services raise **domain
  exceptions** and import no FastAPI. Centralized exception handlers map every
  domain error to the shared error envelope.
- Require auth via a router-level dependency so no endpoint is exposed by
  accident.

**CRUD features (module 07)**
- Full CRUD on the primary resource.
- Pagination with a **capped** page size (offset is fine; cursor earns extra
  credit on the collection you expect to grow).
- Filtering, sorting (with a **whitelist**), and a search (`q`) parameter on
  the collection.
- Redact sensitive/internal fields via dedicated `*Out` models.

**OpenAPI (module 09)**
- A rich, accurate auto-generated spec: `info` metadata, tag groups, per-route
  summaries, documented non-default status codes, described schemas with
  examples, and a documented bearer-auth security scheme.
- `/docs`, `/redoc`, and `/openapi.json` all reflect the real behavior.

### Acceptance checklist

Tick every box. If you can't, you've found a module to revisit.

- [ ] `POST /v1/<resource>` returns `201` with a `Location` header and the
      created body; invalid input returns an aggregated `422`; a duplicate/
      conflict returns `409`.
- [ ] `GET /v1/<resource>/{id}` returns `200` with an ETag; a repeat request
      with `If-None-Match` returns `304`; a missing id returns `404`.
- [ ] `GET /v1/<resource>` paginates with a capped limit, supports filtering,
      whitelisted sorting, and a `q` search; an unknown sort field returns
      `400`; an oversized limit returns `422`.
- [ ] `PATCH` applies only the fields sent (no clobbering); `DELETE` returns
      `204`; a state-change operation is modeled as a resource update, not a
      verb URL.
- [ ] A nested sub-resource endpoint works and is scoped to its parent.
- [ ] At least 3 custom middlewares run in a defensible order; a rate-limited
      request is still logged and still gets security headers; an unhandled
      exception becomes a clean `500` with no stack trace in the body.
- [ ] Every request carries a request ID that appears in logs and in the
      response headers and error envelope.
- [ ] The current user is injected via DI, comes from `request.state`/a
      dependency (never a global), and every endpoint requires auth via a
      router-level dependency.
- [ ] Services contain the business rules, import no FastAPI, and raise domain
      exceptions; one central place maps them to HTTP; validation and domain
      errors share one envelope.
- [ ] No response leaks an internal/sensitive field (verified against your
      `*Out` models).
- [ ] `/docs` shows grouped, documented endpoints with an Authorize button;
      `/openapi.json` accurately describes every request schema, response
      schema, and status code you actually return.
- [ ] You can unit-test at least one service method with plain Python, no web
      server.

### Suggested build order

1. Sketch the **contract first** (module 09 mindset): resources, URLs,
   methods, status codes, schemas — on paper or as a draft spec — before
   writing handlers.
2. Build the layers bottom-up: repository (in-memory is fine), then service
   with domain exceptions and rules, then thin handlers.
3. Add the Pydantic schemas (`*Create`, `*Update`, `*Out`) with validators and
   normalization.
4. Wire the middleware chain and prove the order with a trace.
5. Add pagination/filter/sort/search and ETags.
6. Enrich the OpenAPI metadata and verify `/docs` tells the truth.
7. Run the acceptance checklist as an adversary trying to break each item.

### Hints (design nudges, not solutions)

<details>
<summary>Hint: getting the middleware order right</summary>

Reason outer→inner: error handling (outermost, catches everything) → logging
(sees every request including rejected ones) → request ID → rate limiting
(drops abuse before auth spends CPU) → auth → handler; security headers/
compression apply on the way out. Remember that with `add_middleware` the
last-registered is the outermost, and that short-circuit responses (a `429`, a
`401`) still travel outward through every outer middleware — which is exactly
why logging and security headers still apply to them.

</details>

<details>
<summary>Hint: keeping services testable</summary>

If your service module imports anything from `fastapi`, a rule leaked into the
wrong layer. Services take plain arguments (including `user_id`, passed down by
the handler after it resolves the user via `Depends`) and raise domain
exceptions. Then a plain-Python test can construct the service with a fake
repository and assert on behavior with no server, no routing, no HTTP.

</details>

<details>
<summary>Hint: making the OpenAPI spec truthful</summary>

The spec is a mirror of your declarations. Every `response_model`, every
`status_code`, every `responses={404: ...}`, every `Field(description=,
examples=)`, and every security utility you attach shows up in `/openapi.json`
automatically. Define one `ErrorResponse` model for your envelope and `$ref`
it everywhere via `responses=` so the error shape is documented once in
`components.schemas`.

</details>

## Next

You've finished the API layer. Next is track 03, where every endpoint you
just learned to build gets a real identity and permission model behind it:
[../../03-authentication-and-authorization/README.md](../../03-authentication-and-authorization/README.md)
— sessions, JWTs, OAuth2/OIDC, API keys, MFA, and RBAC, plus the common auth
security holes to avoid.
