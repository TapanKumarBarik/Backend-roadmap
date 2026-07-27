# Module 09: OpenAPI Standards

## Why this matters

Every design decision from module 08 — resource URLs, status codes,
request/response schemas, versioning — is a **contract** between your API and
its clients. Right now that contract lives in your head and, implicitly, in
your code. OpenAPI is what makes it *explicit, machine-readable, and shared*.
An OpenAPI document is a standardized description of your entire API: every
path, every method, every parameter, every request and response schema, every
status code, every security requirement — written in a format (JSON or YAML)
that both humans and tools understand. Once that document exists, an enormous
amount becomes automatic: interactive documentation, client SDK generation in
a dozen languages, request mocking, contract testing, and API gateways that
can validate traffic against the spec.

Here's the part that makes this module easy to underestimate and then love:
**FastAPI generates the OpenAPI document for you, from the code you've already
written.** Every Pydantic model, every `Query(...)` constraint, every
`response_model`, every status code you declared across modules 00–08 has been
quietly feeding a spec this whole time. Visit `/docs` and there's a complete,
interactive Swagger UI you didn't write a line of documentation for. That's
not a gimmick — it's the direct payoff of being *precise* with your types and
declarations. Sloppy code produces a sloppy spec; the discipline this track
taught produces a spec that's genuinely useful as a client contract.

The deeper idea is **API-first (or spec-first) development**: write the
OpenAPI contract *before* implementing, agree on it with the client teams, and
then implement to satisfy it. This flips the usual order — instead of the
code accidentally defining the contract, the contract deliberately defines the
code. Even when you generate the spec from code (as FastAPI does), thinking
spec-first is what keeps an API coherent as it grows across many endpoints and
many engineers.

## Concepts

### What OpenAPI is (and the Swagger history)

OpenAPI is a **specification** — a formal, language-agnostic standard for
describing HTTP APIs. A concrete API description written to that standard is
an **OpenAPI document** (often one `openapi.json` or `openapi.yaml` file). Some
history that clears up the confusing name soup: the project began as
**Swagger**, created around 2011. In 2015 the specification was donated to the
Linux Foundation and renamed the **OpenAPI Specification (OAS)**; "Swagger"
now refers to the *tooling* built around it (Swagger UI, Swagger Editor,
Swagger Codegen), while "OpenAPI" is the *specification* itself. So: OpenAPI =
the standard; Swagger = a family of tools. People still say "Swagger docs"
loosely to mean the interactive UI.

### Why a machine-readable contract is powerful

Because the document is structured data, tools can *consume* it:

- **Interactive documentation** (Swagger UI, Redoc) — a live, browsable,
  try-it-out UI generated from the spec. No hand-written, drift-prone docs.
- **Client SDK generation** — generate a typed client library in Python,
  TypeScript, Go, Java, etc., directly from the spec, so clients don't
  hand-code HTTP calls.
- **Server stubs / mocking** — generate a mock server that returns
  spec-conformant fake responses, so a frontend team can build against the
  API before the backend exists.
- **Contract testing & validation** — assert that your running API still
  matches the agreed spec; API gateways can reject requests that violate it.
- **Postman/Insomnia import** — load the spec into an API client and get every
  endpoint preconfigured.

The single artifact drives the whole ecosystem. That's why precision pays off.

### The structure of an OpenAPI document

An OpenAPI 3.x document has a handful of top-level sections:

```yaml
openapi: 3.1.0                    # spec version
info:                             # metadata: title, version, description
  title: Task API
  version: 1.0.0
servers:                          # base URLs the API is served from
  - url: https://api.example.com/v1
paths:                            # THE endpoints: /tasks, /tasks/{id}, ...
  /tasks:
    get:
      summary: List tasks
      parameters: [...]           # query/path/header params
      responses:                  # status code -> response schema
        "200": {...}
    post:
      requestBody: {...}          # the input schema
      responses:
        "201": {...}
components:                       # reusable pieces
  schemas:                        # your Pydantic models land here
    Task: {...}
  securitySchemes:                # how auth works (bearer, apiKey, oauth2)
    bearerAuth: {...}
security:                         # which schemes apply globally
  - bearerAuth: []
```

- **`info`** — metadata (title, version, description). The version here is
  *your API's* version, distinct from the OpenAPI spec version.
- **`paths`** — the heart: every URL, its methods, parameters, request bodies,
  and per-status-code responses.
- **`components`** — reusable definitions, especially `schemas` (your data
  models, referenced with `$ref` so they're defined once) and
  `securitySchemes`.
- **`security`** — which security schemes are required, globally or per
  operation.
- **`responses`** — the possible responses per operation, keyed by status
  code, each with a schema and description.

### OpenAPI 3.0 vs 3.1

3.1 (2021) is the current line. The headline change: **3.1 is fully aligned
with JSON Schema** (the standard Pydantic itself speaks), which removes
long-standing quirks — e.g. proper `null` handling via type arrays
(`type: ["string", "null"]`), and `examples` as a list. 3.0 used a slightly
divergent schema dialect and a single `nullable: true` flag. FastAPI emits
3.1 by default in current versions. Practically: prefer 3.1 unless a specific
downstream tool only understands 3.0, and know that `Optional[str]` /
`str | None` in Pydantic serializes cleanly to the 3.1 nullable form.

### How FastAPI generates the spec — and how to enrich it

```
  YOUR CODE                 GENERATED SPEC          TOOLS CONSUME IT
  Pydantic models  ─┐       ┌──────────────┐   ┌─► /docs  (Swagger UI)
  Field(...) rules ─┼─FastAPI►│ openapi.json │──┼─► /redoc (reference)
  response_model   ─┤ builds │ (OpenAPI 3.1)│   ├─► client SDK generators
  status_code      ─┤        └──────────────┘   ├─► mock servers
  security utils   ─┘         one artifact      └─► Postman / contract tests
```

FastAPI builds the OpenAPI document from your route declarations and Pydantic
models automatically, and serves:

- **`/openapi.json`** — the raw generated OpenAPI document.
- **`/docs`** — Swagger UI (interactive, try-it-out).
- **`/redoc`** — Redoc (clean, reference-style documentation).

Everything you declared feeds it: path/query params become `parameters`,
`Field(...)` constraints become schema validations, `response_model` becomes
the response schema, `status_code` and additional `responses=` become the
documented statuses. You enrich it with metadata:

```python
from fastapi import FastAPI, Query
from pydantic import BaseModel, Field

app = FastAPI(
    title="Task API",
    version="1.0.0",
    description="A task management API for the api-layer track.",
)

class TaskOut(BaseModel):
    id: int = Field(..., description="Unique task identifier", examples=[42])
    title: str = Field(..., description="Human-readable task title")

@app.get("/tasks", tags=["tasks"], summary="List tasks",
         response_model=list[TaskOut],
         responses={404: {"description": "No tasks found"}})
async def list_tasks(limit: int = Query(20, ge=1, le=100, description="Page size")):
    ...
```

`tags` group endpoints in the UI; `summary`/`description` document them;
`description`/`examples` on `Field` document each property; `responses=`
documents non-default status codes. Docstrings on the function also become the
operation description. The lesson from earlier modules pays off directly:
because you used `response_model`, capped `limit` with `le=`, and defined
separate `*Out` models, the generated spec is *accurate* — it tells clients
exactly what they'll get.

### Declaring security in the spec

Auth (modules 04–05) shows up in the spec via **security schemes**, so the
docs know an endpoint needs a token and Swagger UI shows an "Authorize"
button. FastAPI's security utilities (`HTTPBearer`, `OAuth2PasswordBearer`,
`APIKeyHeader`) both enforce the auth *and* register the scheme in OpenAPI:

```python
from fastapi.security import HTTPBearer
from fastapi import Depends
bearer = HTTPBearer()

@app.get("/me", dependencies=[Depends(bearer)])
async def me(): ...
# -> OpenAPI now lists bearerAuth as required for /me, and /docs shows Authorize
```

(Track 03 implements real auth; here the point is that the scheme becomes part
of the contract automatically.)

### API-first / spec-first development

Two workflows:

```
  CODE-FIRST (FastAPI default)      SPEC-FIRST (API-first)
  write code ─► generate spec       write spec ─► review with teams
       │                                 │              │
       ▼                                 ▼              ▼
  spec = side effect              implement to it   mock in parallel
  (can't drift, but agreed late)  (agreed up front, before code exists)
```

- **Code-first** (FastAPI's default): write code, generate the spec. Fast,
  and the spec can't drift from the code because it *is* the code. Risk: the
  contract is a side effect, so cross-team agreement happens late.
- **Spec-first / API-first**: write the OpenAPI document *first*, review it
  with client teams and stakeholders, then implement to satisfy it (and/or
  generate server stubs and models from it). The contract is agreed *before*
  code exists, so frontend/mobile/partner teams can build against a mock in
  parallel, and breaking changes are caught in review, not production.

Neither is universally right. FastAPI makes code-first excellent *if* you're
disciplined (precise types, explicit responses, consistent envelopes — this
whole track). Spec-first shines for public APIs and multi-team products where
the contract must be negotiated up front. Even in code-first, adopt the
spec-first *mindset*: decide the contract deliberately, then make the code
express it.

## Command reference

| Item | Purpose | Example |
|---|---|---|
| `FastAPI(title=, version=, description=)` | Spec `info` metadata | app constructor |
| `/openapi.json` | The generated OpenAPI document | `GET /openapi.json` |
| `/docs` | Swagger UI (interactive) | browser |
| `/redoc` | Redoc reference docs | browser |
| `tags=["..."]` | Group operations in the UI | on route or `APIRouter(tags=)` |
| `summary=` / `description=` / docstring | Document an operation | on the route |
| `response_model=` | Documented + enforced response schema | module 06/07 |
| `responses={404: {...}}` | Document non-default status codes | on the route |
| `Field(..., description=, examples=)` | Document a schema property | in a Pydantic model |
| `openapi_tags=[{...}]` | Describe tag groups | `FastAPI(openapi_tags=...)` |
| security utilities | Register auth schemes in the spec | `HTTPBearer()`, `OAuth2PasswordBearer(...)` |

**The spec is only as good as your declarations.** If you return a raw dict
instead of a `response_model`, the spec can't describe the response — clients
see an empty/opaque schema. Everything this track drilled (typed models,
explicit statuses, `Field` constraints) is what makes the auto-generated spec
trustworthy. Garbage in, garbage spec.

**Export the spec for tooling.** You can grab the document programmatically
(`app.openapi()` returns the dict) or fetch `/openapi.json`, then feed it to
`openapi-generator` / `swagger-codegen` for client SDKs, or to Redoc/Postman.
Commit a snapshot to catch accidental breaking changes in code review
(contract testing).

**Customize, don't fight, the generator.** Prefer enriching via `tags`,
`summary`, `description`, `responses=`, and `Field` metadata. Only override
`app.openapi()` wholesale for genuinely custom needs — the auto-generated
document is correct by construction if your declarations are.

**Version metadata vs. URL versioning.** `info.version` (module 09) documents
*your API's* release version; the `/v1` URL prefix (module 08) is the routing
version clients call. They're related but distinct — set both deliberately.

## Hands-on exercises

Continue in the `api-layer` project. You've already got endpoints; now make
the spec first-class.

### 1. Find the spec you already have

With the app running, open `http://127.0.0.1:8000/docs`,
`http://127.0.0.1:8000/redoc`, and `http://127.0.0.1:8000/openapi.json`.
Expected: a complete interactive UI and a JSON document describing every
endpoint you built across modules 00–08 — without writing any docs. Skim the
JSON and locate `paths`, `components.schemas`, and `info`.

### 2. Add rich `info` metadata

```python
app = FastAPI(
    title="API Layer Track — Task & Order API",
    version="1.0.0",
    description="Reference API built across the api-layer-and-request-handling track.",
    contact={"name": "You", "email": "you@example.com"},
)
```

Reload `/docs`. Expected: the title, version, and description now head the
documentation page. Re-fetch `/openapi.json` and confirm the `info` block
reflects them.

### 3. Group endpoints with tags

Add `tags=["tasks"]` / `tags=["orders"]` to your routers (or routes). Add
descriptions for the tag groups:

```python
app = FastAPI(openapi_tags=[
    {"name": "tasks", "description": "Create, list, and manage tasks."},
    {"name": "orders", "description": "Order placement and lifecycle."},
])
```

Reload `/docs`. Expected: endpoints are grouped under labeled, described
sections instead of one flat list.

### 4. Document schemas with descriptions and examples

Enrich a Pydantic model:

```python
class TaskOut(BaseModel):
    id: int = Field(..., description="Unique task id", examples=[42])
    title: str = Field(..., description="Task title", examples=["Write the report"])
    done: bool = Field(False, description="Whether the task is complete")
```

Reload `/docs` and expand the schema. Expected: each field shows its
description and example; the "Example Value" for the endpoint uses them. This
is documentation that *can't* drift from the code, because it's in the code.

### 5. Document non-default responses

```python
@router.get("/tasks/{task_id}", response_model=TaskOut,
            responses={404: {"description": "Task not found"},
                       304: {"description": "Not modified (ETag matched)"}})
async def get_task(task_id: int): ...
```

Reload `/docs`. Expected: the operation now lists `200`, `404`, and `304` with
descriptions, so clients see every outcome — matching the real behavior you
built in modules 07–08.

### 6. Show auth in the spec

Add `HTTPBearer` to a protected route (exercise from module 09 Concepts).
Reload `/docs`. Expected: an "Authorize" button appears, the protected
endpoint shows a padlock, and `/openapi.json` gains a
`components.securitySchemes.HTTPBearer` entry plus a `security` requirement on
that operation. The auth contract is now documented automatically.

### 7. Export the spec and generate a client (or inspect it)

```bash
curl -s localhost:8000/openapi.json -o openapi.json
# If you have it: generate a typed Python client
# npx @openapitools/openapi-generator-cli generate -i openapi.json -g python -o ./client
```

Even without the generator installed, open `openapi.json` and trace one
endpoint from `paths` → its `requestBody`/`responses` → the `$ref` into
`components.schemas`. Expected: you can see how a tool would turn this into a
typed client. Commit `openapi.json` so a future diff reveals breaking changes.

### 8. Diagnose and fix

This endpoint produces a useless, misleading spec: `/docs` shows an opaque
response schema, no status codes besides `200`, and a required field the code
doesn't actually require. Fix the code so the *generated spec* becomes
accurate.

```python
@router.post("/tasks")                       # (A) no response_model, returns raw dict
async def create_task(body: dict):           # (B) untyped body -> opaque request schema
    if "title" not in body:
        return {"error": "title required"}   # (C) 200 for an error; not documented
    return {"id": 1, "title": body["title"], "secret_internal_flag": True}  # (D) leaks + undocumented
```

<details>
<summary>Solution</summary>

Every problem is a *declaration* problem — fix the code and the spec fixes
itself:

1. **(B) Untyped `body: dict`.** OpenAPI can't describe the request; clients
   see a free-form object. Declare a Pydantic `TaskCreate` model so the
   request schema is precise (and validation is real — modules 00–02).
2. **(A) No `response_model`.** The response schema is opaque. Add
   `response_model=TaskOut` so the spec (and clients) know the exact shape.
3. **(C) `200` for a missing field.** Both wrong behavior and undocumented.
   With a `TaskCreate` model, a missing `title` is an automatic `422` (which
   FastAPI documents). Remove the hand-rolled error.
4. **(D) Leaking `secret_internal_flag` + wrong status.** `TaskOut` omits
   internal fields (module 07 redaction), so it can't leak, and the spec shows
   only public fields. Set `status_code=201` so the documented success status
   is correct.

```python
class TaskCreate(BaseModel):
    title: str = Field(..., min_length=1, description="Task title")

class TaskOut(BaseModel):
    id: int
    title: str            # no internal flag

@router.post("/tasks", status_code=201, response_model=TaskOut,
             responses={422: {"description": "Validation error"}})
async def create_task(body: TaskCreate):
    return {"id": 1, "title": body.title, "secret_internal_flag": True}  # flag dropped by TaskOut
```

The lesson of the whole track in one exercise: **precise declarations produce
a truthful, useful OpenAPI contract; sloppy ones produce a lying spec.**

</details>

## Independent challenge

No code given. Take the `/v1/projects` sub-API you designed in module 08 and
make its OpenAPI document production-quality: rich `info` metadata, tag groups
with descriptions, every endpoint with a `summary` and documented status codes
(including the `404`, `409`, `412`, and `422` you actually return), fully
described request/response schemas with examples, and a documented bearer-auth
security scheme so `/docs` shows an Authorize button and padlocks. Then export
`/openapi.json`, and write a short note on whether you'd keep this project
**code-first** or move it **spec-first**, justified against the tradeoffs in
this module. Reach back to module 06's consistent error envelope and make sure
your error responses are *documented as a shared schema* (defined once in
`components.schemas`, referenced everywhere), not re-described per endpoint.

<details>
<summary>Hint</summary>

Define one `ErrorResponse` Pydantic model matching your envelope and reference
it in every operation's `responses={...}` — FastAPI will place it once in
`components.schemas` and `$ref` it, exactly the reuse OpenAPI's `components`
section exists for. Use the `HTTPBearer` security utility so the scheme is
registered automatically rather than hand-editing the spec.

</details>

## Common mistakes & troubleshooting

- **Returning raw dicts instead of `response_model`.** The spec can't describe
  the response; clients get an opaque schema. Always declare the output model.
- **Untyped request bodies (`body: dict`).** No request schema, no real
  validation. Use a Pydantic model.
- **Confusing OpenAPI (the spec) with Swagger (the tools).** OpenAPI is the
  standard; Swagger UI/Editor/Codegen are tooling built on it.
- **Confusing `info.version` with the URL version.** One documents your API
  release; the other (`/v1`) is the routing version. Set both deliberately.
- **Undocumented status codes.** If you return `404`/`409`/`412`, add them to
  `responses=` so the contract matches reality.
- **Fighting the generator by hand-editing the spec.** Enrich via `tags`,
  `summary`, `Field` metadata, and `responses=`; override `app.openapi()` only
  for truly custom needs.
- **Never exporting/snapshotting the spec.** Without a committed
  `openapi.json`, breaking changes slip through code review. Snapshot it for
  contract testing.
- **Assuming 3.0 when you're on 3.1.** Nullable handling and `examples` differ;
  know which version FastAPI emits and which your downstream tools accept.

## Checkpoint quiz

Write down your answer to each question before expanding it — checking without attempting first is the single easiest way to fool yourself into thinking you've learned this.

1. What's the difference between "OpenAPI" and "Swagger," and how did the
   naming come about?
2. Name the top-level sections of an OpenAPI document and what each holds.
3. FastAPI generates the spec automatically — so what did *you* do across this
   track that determines whether that generated spec is accurate or
   misleading?
4. What three URLs does FastAPI serve for the spec and its UIs, and what's at
   each?
5. Give two concrete things a machine-readable OpenAPI document lets tools do
   that you'd otherwise do by hand.
6. Contrast code-first and spec-first development: what does each optimize
   for, and when would you choose spec-first?
7. How does declaring auth with a FastAPI security utility (e.g. `HTTPBearer`)
   affect the generated spec, and why is that useful to clients?

<details>
<summary>Answers</summary>

1. OpenAPI is the *specification* (standard for describing HTTP APIs); Swagger
   is the *tooling* (Swagger UI, Editor, Codegen). The project started as
   Swagger in 2011; in 2015 the spec was donated to the Linux Foundation and
   renamed the OpenAPI Specification, while the Swagger name stayed on the
   tools.
2. `openapi` (version), `info` (metadata: title/version/description), `servers`
   (base URLs), `paths` (endpoints with methods, params, request bodies,
   responses), `components` (reusable `schemas`, `securitySchemes`),
   `security` (which schemes apply), and per-operation `responses` keyed by
   status code.
3. Being precise: declaring Pydantic request/response models
   (`response_model`), `Field` constraints, explicit status codes and
   `responses=`, separate `*Out` models for redaction. Those declarations *are*
   the spec — sloppy/untyped code yields an opaque or lying spec.
4. `/openapi.json` (the raw OpenAPI document), `/docs` (interactive Swagger
   UI, try-it-out), `/redoc` (clean reference documentation).
5. Any two of: generate interactive docs; generate typed client SDKs in many
   languages; generate a mock server for parallel frontend development; import
   into Postman/Insomnia; run contract tests / gateway validation against the
   spec.
6. Code-first optimizes for speed and no code/spec drift (the code *is* the
   contract), but the contract is a late side effect. Spec-first optimizes for
   up-front, cross-team agreement — the contract is reviewed and mockable
   before code exists. Choose spec-first for public/multi-team APIs where the
   contract must be negotiated before implementation.
7. It both enforces the auth *and* registers a security scheme in
   `components.securitySchemes` with a `security` requirement on protected
   operations, so `/docs` shows an Authorize button and padlocks. Clients (and
   generated SDKs) then know exactly which endpoints need a token and how to
   supply it.

</details>

## Further reading & sources

- [OpenAPI Specification (spec.openapis.org)](https://spec.openapis.org/oas/latest.html) - the authoritative current specification (OAS 3.1) describing every document section.
- [FastAPI — First Steps / interactive docs](https://fastapi.tiangolo.com/tutorial/first-steps/) - how FastAPI serves `/docs`, `/redoc`, and `/openapi.json` out of your code.
- [FastAPI — Metadata and Docs URLs](https://fastapi.tiangolo.com/tutorial/metadata/) - enriching the spec with `title`, `version`, `tags`, and operation metadata.
- [FastAPI — Path Operation Configuration](https://fastapi.tiangolo.com/tutorial/path-operation-configuration/) - documenting `summary`, `description`, `responses`, and status codes.
- [swagger.io — What is OpenAPI?](https://swagger.io/docs/specification/about/) - the OpenAPI-vs-Swagger history and the tooling ecosystem around the spec.
- [JSON Schema](https://json-schema.org/) - the schema standard OpenAPI 3.1 aligns with and that Pydantic emits.

## Next

[10-capstone-project](../10-capstone-project/README.md) — time to synthesize
everything: build a complete, validated, middleware-chained, RESTful API with
pagination/search/sort/filter, consistent errors, and an auto-generated
OpenAPI spec, from an empty folder.
