# Module 11: API Versioning and Serialization

## Why this matters

This module covers the two things that turn "a bunch of routes" into "an
API other people can depend on over time." **Versioning** is how you change
your API without breaking every client that already uses it — because the
moment someone integrates with your API, you can no longer freely rename a
field or change a response shape; their code will break on your next
deploy. **Serialization** is the machinery underneath every request and
response body you've handled since module 01: turning in-memory objects
(a Python dict, a database row) into bytes on the wire (JSON, XML,
protobuf) and back. Every `{"name": "Ada"}` you've sent was serialized;
every body your handler received was deserialized.

These belong together because they're the two axes of API *contracts*.
Versioning governs how the contract evolves; serialization governs the
contract's concrete data format. Get versioning wrong and a routine change
becomes an outage for your consumers. Get serialization wrong and you get
the entire zoo of real bugs: a mobile app crashing on a `null` it didn't
expect, a date arriving in the wrong timezone, a field silently dropped, an
integer overflowing, or — worst — a malicious payload deserialized into a
structure that lets an attacker in.

We also fold in the practical route-organization tools that versioning
depends on: **route grouping** (for versioning, shared middleware, and
permissions), **securing routes**, and **route-matching performance** —
directly extending module 10.

## Concepts

### Why APIs need versions

Once a client integrates with `GET /users` and depends on the response
having a `name` field, you're locked in. Renaming `name` to `full_name`,
removing a field, changing a type (string → object), or altering status
codes are **breaking changes** — they break existing clients. Additive
changes (adding a new optional field, a new endpoint) are usually
**non-breaking**, because well-written clients ignore unknown fields (the
"tolerant reader" principle). Versioning lets you make breaking changes on
a *new* version while old clients keep using the old one until they migrate.

### Versioning techniques

Four common strategies, with real trade-offs:

- **URL path versioning** — `/v1/users`, `/v2/users`. Most common, most
  visible, easiest to route (it's just a path prefix — module 10) and
  cache/debug. Downside: the version is in every URL, and strictly
  speaking the "same resource" now has two URLs. This is what most public
  APIs use and what we'll use here.
- **Query parameter versioning** — `/users?version=2`. Simple but mixes
  versioning with filtering (module 10's query params) and is easy to
  forget.
- **Header versioning** — a custom header like
  `Accept-Version: 2` or a vendor media type via content negotiation
  (module 08): `Accept: application/vnd.example.v2+json`. Keeps URLs
  clean and is "purer" REST, but is invisible in the URL, harder to test
  in a browser, and needs `Vary` for caching (module 06/08).
- **No explicit version (continuous/additive)** — never break; only add.
  Elegant when achievable but hard to sustain for real breaking changes.

The pragmatic default for most APIs: **URL path versioning** (`/v1`,
`/v2`), because it's explicit, cache-friendly, and trivially routable.

### Deprecation: how to retire a version gracefully

You can't run old versions forever. Best practices for retiring one:

- **Announce early and clearly**, with a timeline (a sunset date).
- Signal it *in the responses*: the **`Deprecation`** header (e.g.
  `Deprecation: true` or a date) and the **`Sunset`** header (an
  HTTP-date after which the endpoint stops working) tell clients
  programmatically that they must migrate.
- **Keep the old version working through the deprecation window** — don't
  break it the day you announce; give consumers time.
- **Monitor usage** so you know when it's safe to remove (traffic dropped
  to near zero).
- Document the migration path (what changed, field mappings) explicitly.

### Route grouping and why it pays off

**Route grouping** (FastAPI's `APIRouter`, Flask blueprints, Express
routers) collects related routes under a common prefix and shared
configuration. Its benefits map exactly onto real needs:

- **Versioning:** mount an entire router under `/v1` and another under
  `/v2` — the version is one prefix, not repeated on every route
  (extending module 10's static prefix idea).
- **Shared middleware:** attach logging, auth, or rate-limiting to a whole
  group at once (e.g. all `/admin/*` routes require auth) instead of
  decorating each handler.
- **Permissions:** apply an authorization dependency to a group so every
  route under `/private` is protected uniformly.
- **Matching performance:** grouping by prefix aligns with the trie/radix
  structure from module 10 — the router can dispatch on the prefix first,
  narrowing the search.

### Securing routes (a preview of the auth track)

Routing decides *which* handler runs; security decides *whether it may*.
The pattern: attach an authentication/authorization check to a route or
group (a **dependency** in FastAPI) that runs *before* the handler and
returns `401` (unauthenticated) or `403` (unauthorized) — module 05 — if
the caller isn't allowed. Grouping makes this uniform: protect `/v2/admin`
once at the router level. The deep treatment (sessions, JWT, OAuth, RBAC)
is track 03; here you just wire a check onto a route to see the mechanism.

### Serialization and deserialization: what and why

- **Serialization** = converting an in-memory object into a
  transmittable/storable byte sequence (a Python dict → a JSON string →
  bytes).
- **Deserialization** = the reverse (incoming JSON bytes → a Python dict
  or a typed object).

Why it exists: **interoperability**. Your server holds a Python dict; the
client is JavaScript, or Go, or a mobile app in Swift. None of them can
share raw memory. A *neutral, agreed format* (JSON, protobuf) lets a Python
server and a Swift client exchange data because both know how to
read/write that format. Serialization is the lingua franca between
languages and across the network.

### Text formats vs binary formats

- **Text formats — JSON, XML:** human-readable, easy to debug (you can
  eyeball the body in `curl`), universally supported, self-describing.
  Downsides: larger on the wire and slower to parse than binary.
  **JSON** dominates web APIs; **XML** is older, more verbose (tags,
  attributes, namespaces), still common in enterprise/SOAP and some
  document formats.
- **Binary formats — Protocol Buffers (protobuf), MessagePack, Avro:**
  compact and fast to encode/parse, with a *schema* defining the fields
  and types. Downsides: not human-readable (you can't eyeball the bytes),
  require the schema to decode, and are less convenient to debug.
  **protobuf** (used by gRPC, a later track) is the prominent one:
  significantly smaller and faster than JSON, at the cost of needing a
  compiled `.proto` schema on both ends.

The tradeoff in one line: **text = debuggable and universal; binary =
smaller and faster.** Choose JSON for public/web APIs and human-facing
data; choose protobuf/binary for high-throughput internal service-to-
service traffic where payload size and CPU matter (module 08's compression
lesson compounds here — but binary is often already compact).

### How different languages implement it

Every language has serialization built in or in its ecosystem:

- **Python:** `json` (stdlib), `pydantic` (validation + serialization,
  what FastAPI uses), `pickle` (Python-only, *unsafe* for untrusted data).
- **Go:** `encoding/json` with struct tags; deserializes JSON into a typed
  `struct`.
- **JavaScript:** `JSON.parse` / `JSON.stringify`, deserializing into
  plain objects.
- **Java:** Jackson/Gson.

The key mental model: JSON deserializes into each language's *native*
structure — a Python **dict**, a Go **struct**, a JS **object**, a Java
**Map/POJO**. Serialization is the same idea in reverse.

### JSON structure and data types

JSON has a deliberately small type system:

- **Objects** `{ "key": value }` — unordered key/value maps (keys are
  strings).
- **Arrays** `[ ... ]` — ordered lists.
- **Strings** `"text"` — always double-quoted, Unicode.
- **Numbers** `42`, `3.14`, `-1e5` — no distinction between int and float
  in the spec (a source of bugs; see below), no `NaN`/`Infinity`.
- **Booleans** `true` / `false`.
- **null** — the explicit "no value."

Notably *absent*: dates (there is no JSON date type — dates are encoded as
strings, e.g. ISO 8601 `"2026-07-27T10:00:00Z"`), integers vs floats
(everything is "number"), and comments. These gaps are where many bugs
live.

### Common serialization errors (the real bug zoo)

- **Missing required fields:** the payload lacks a field your code needs
  → deserialization/validation must reject it (`422`, module 05) rather
  than proceed with a hole.
- **Extra/unknown fields:** the payload has fields you didn't expect.
  Tolerant readers ignore them; strict schemas can reject them. Deciding
  which is a security and compatibility choice (see below).
- **Null values:** a field is present but `null`. Is `null` valid for this
  field? Confusing "missing" with "null" (present-but-empty) causes
  crashes — `user.name.upper()` on a `null` name.
- **Date/timezone issues:** `"2026-07-27"` vs
  `"2026-07-27T10:00:00+05:30"` vs a Unix timestamp — mixing formats, or
  dropping the timezone, silently shifts times. Always use explicit,
  timezone-aware ISO 8601 (`...Z` for UTC).
- **Number precision:** JSON numbers as doubles lose precision for large
  integers (JavaScript's `Number` can't hold integers above 2^53 exactly)
  — a 64-bit ID like `9007199254740993` can be corrupted. Fix: send large
  IDs as *strings*.
- **Type coercion surprises:** `"42"` (string) vs `42` (number); some
  parsers coerce, some don't.

### Custom serialization and error handling

- **Custom serialization:** when a type has no natural JSON form (a
  `datetime`, a `Decimal`, an enum, a binary blob), you define how it's
  represented (e.g. datetime → ISO 8601 string, Decimal → string to
  preserve precision, bytes → base64). FastAPI/pydantic let you declare
  these encoders.
- **Error handling on deserialize:** never assume incoming data is
  well-formed. Catch parse errors (malformed JSON → `400`) and validation
  errors (well-formed but invalid → `422`) distinctly (module 05). Decide
  policy for unknown fields (ignore vs. reject).

### Security: validate *before* you trust

The cardinal serialization-security rule: **deserialize into a validated,
typed structure, and never act on raw input.**

- **Validate before use:** define a schema (pydantic model, JSON Schema)
  and reject anything that doesn't conform *before* your business logic
  runs. This stops injection, type confusion, and malformed-data crashes.
- **JSON Schema validation:** a formal way to declare required fields,
  types, ranges, and formats; validators reject non-conforming payloads.
  pydantic is effectively this for Python.
- **Never deserialize untrusted data with unsafe deserializers.** Python's
  `pickle`, Java's native serialization, PyYAML's unsafe loader, etc. can
  *execute code* embedded in the payload — a critical remote-code-execution
  class of vulnerability. For untrusted input use data-only formats (JSON)
  and validate.
- **Guard resource limits:** enormously nested or huge payloads can DoS a
  parser ("billion laughs" for XML, deep JSON nesting). Cap sizes and
  depth.

### Performance considerations

- **Reduce payload size:** send only needed fields; paginate large
  collections (module 10's query params); use shorter representations where
  sensible.
- **Compression:** gzip/br (module 08) on text formats — a big win for
  JSON/XML.
- **Text vs binary tradeoff:** for internal high-volume paths, binary
  (protobuf) cuts both size and CPU; for public/debuggable APIs, JSON's
  convenience usually wins. Measure before optimizing.
- **Streaming/chunked** (module 08) for very large responses so you don't
  buffer everything in memory.

## Command reference

| Pattern | What it does |
|---|---|
| `APIRouter(prefix="/v1")` (FastAPI) | Group routes under a version prefix |
| `app.include_router(v1)` | Mount a router group onto the app |
| `Depends(auth)` on a router | Apply a shared security check to a whole group |
| `pydantic.BaseModel` | Declare a validated (de)serialization schema |
| `model.model_dump_json()` | Serialize a model to JSON |
| `Model.model_validate_json(bytes)` | Deserialize + validate JSON into a model |
| `json.dumps(obj, default=...)` | Custom serialization for non-JSON types |
| `curl -H 'Accept: application/vnd.example.v2+json'` | Header/media-type versioning |

FastAPI app showing versioned groups + serialization (used in exercises):

```python
from fastapi import FastAPI, APIRouter, Header, HTTPException, Response, Depends
from pydantic import BaseModel, Field
from datetime import datetime, timezone

app = FastAPI()

# --- v1 schema and router ---
class UserV1(BaseModel):
    id: int
    name: str                       # v1 has a single "name"

v1 = APIRouter(prefix="/v1", tags=["v1"])

@v1.get("/users/{uid}", response_model=UserV1)
def get_user_v1(uid: int):
    return UserV1(id=uid, name="Ada Lovelace")

# --- v2 schema (breaking change: name -> first/last) + deprecation of v1 ---
class UserV2(BaseModel):
    id: int
    first_name: str
    last_name: str
    created_at: datetime            # serialized as ISO 8601 automatically
    big_id: str = Field(..., description="64-bit id sent as string for JS safety")

v2 = APIRouter(prefix="/v2", tags=["v2"])

@v2.get("/users/{uid}", response_model=UserV2)
def get_user_v2(uid: int):
    return UserV2(
        id=uid, first_name="Ada", last_name="Lovelace",
        created_at=datetime.now(timezone.utc),
        big_id="9007199254740993",
    )

# v1 is deprecated: signal it in every v1 response via middleware-ish header
@v1.get("/status")
def v1_status(response: Response):
    response.headers["Deprecation"] = "true"
    response.headers["Sunset"] = "Wed, 31 Dec 2026 23:59:59 GMT"
    return {"version": "v1", "note": "please migrate to v2"}

# --- a secured group ---
def require_key(x_api_key: str | None = Header(default=None)):
    if x_api_key != "secret123":
        raise HTTPException(status_code=401, detail="missing/invalid API key")

admin = APIRouter(prefix="/v2/admin", dependencies=[Depends(require_key)])

@admin.get("/stats")
def stats():
    return {"users": 42}

# --- strict deserialization endpoint ---
class NewOrder(BaseModel):
    model_config = {"extra": "forbid"}      # reject unknown fields
    item: str
    quantity: int = Field(gt=0)

@app.post("/v2/orders")
def create_order(order: NewOrder):
    return {"received": order.model_dump()}

app.include_router(v1)
app.include_router(v2)
app.include_router(admin)
```

## Hands-on exercises

Run with `uvicorn app:app --reload`.

### 1. Two versions, side by side

```bash
curl -s http://127.0.0.1:8000/v1/users/42
curl -s http://127.0.0.1:8000/v2/users/42 | python -m json.tool
```

Expected: v1 returns `{"id":42,"name":"Ada Lovelace"}`; v2 returns the
`first_name`/`last_name` shape plus `created_at` and `big_id`. Same
conceptual resource, two contracts — the whole point of versioning. The
`/v1` and `/v2` prefixes are just route groups (module 10).

### 2. See the serialized date and the string big-id

```bash
curl -s http://127.0.0.1:8000/v2/users/42 | python -m json.tool
```

Expected: `created_at` is an ISO 8601 string like
`"2026-07-27T10:00:00.123456+00:00"` (JSON has no date type — it's a
string), and `big_id` is `"9007199254740993"` **as a string**. Reason
about why: as a JSON number, that 64-bit id would lose precision in
JavaScript (`> 2^53`). Sending it as a string preserves it exactly.

### 3. Deprecation signaling

```bash
curl -s -D - -o /dev/null http://127.0.0.1:8000/v1/status | grep -iE 'deprecation|sunset'
```

Expected: `deprecation: true` and a `sunset:` date. A well-behaved client
sees these and knows to migrate before the sunset date — programmatic
deprecation, not just a blog post.

### 4. Strict deserialization rejects unknown fields

```bash
# valid
curl -s -X POST -H 'Content-Type: application/json' \
  -d '{"item":"book","quantity":2}' http://127.0.0.1:8000/v2/orders
# unknown field -> rejected (extra="forbid")
curl -s -w '\n%{http_code}\n' -X POST -H 'Content-Type: application/json' \
  -d '{"item":"book","quantity":2,"sneaky":"payload"}' http://127.0.0.1:8000/v2/orders
```

Expected: the first succeeds; the second returns `422` complaining about
the extra `sneaky` field. This is "reject unknown fields" as a security/
contract choice — the alternative (ignore) is the tolerant-reader default.

### 5. Validation catches bad values

```bash
curl -s -w '\n%{http_code}\n' -X POST -H 'Content-Type: application/json' \
  -d '{"item":"book","quantity":-3}' http://127.0.0.1:8000/v2/orders
curl -s -w '\n%{http_code}\n' -X POST -H 'Content-Type: application/json' \
  -d '{"item":"book"}' http://127.0.0.1:8000/v2/orders
```

Expected: `422` for `quantity: -3` (violates `gt=0`) and `422` for the
missing `quantity` (required field absent). This is *validate before you
trust* in action — the handler never runs on bad data (module 05's `422`).

### 6. Missing vs null are different

```bash
curl -s -w '\n%{http_code}\n' -X POST -H 'Content-Type: application/json' \
  -d '{"item":null,"quantity":2}' http://127.0.0.1:8000/v2/orders
```

Expected: `422` — `item` is present but `null`, and the schema requires a
string. Note this is a *different* failure from `item` being *absent*.
Confusing "missing" with "present-but-null" is a classic bug; the schema
distinguishes them.

### 7. Secured route group

```bash
curl -s -w '\n%{http_code}\n' http://127.0.0.1:8000/v2/admin/stats
curl -s -w '\n%{http_code}\n' -H 'X-API-Key: secret123' http://127.0.0.1:8000/v2/admin/stats
curl -s -w '\n%{http_code}\n' -H 'X-API-Key: wrong' http://127.0.0.1:8000/v2/admin/stats
```

Expected: `401` with no key, `200` with the correct key, `401` with a
wrong key. The check was applied *once* at the router group level and
protects every route under `/v2/admin` — grouping for permissions
(routing decides which handler; the dependency decides whether it may run).

### 8. Malformed JSON vs invalid data

```bash
# malformed JSON (can't parse)
curl -s -w '\n%{http_code}\n' -X POST -H 'Content-Type: application/json' \
  -d '{"item":"book", "quantity":' http://127.0.0.1:8000/v2/orders
```

Expected: a parse-level failure (distinct from the `422` validation
failures above). Internalize the split from module 05: unparseable → the
`400`/parse family; parseable-but-invalid → `422`. Different stages of
deserialization, different codes.

### 9. Header/media-type versioning (alternative technique)

Add this endpoint that versions via content negotiation (module 08):

```python
@app.get("/products/1")
def get_product(accept: str = Header(default="application/json")):
    if "vnd.example.v2" in accept:
        return {"id": 1, "title": "Widget", "price_cents": 1999}   # v2 shape
    return {"id": 1, "name": "Widget", "price": 19.99}             # v1 shape
```

```bash
curl -s http://127.0.0.1:8000/products/1
curl -s -H 'Accept: application/vnd.example.v2+json' http://127.0.0.1:8000/products/1
```

Expected: different shapes based on the `Accept` header — header
versioning. Note this would need `Vary: Accept` for correct caching
(modules 06/08). Compare its pros/cons to the URL-path approach from
exercises 1-2.

### 10. Diagnose and fix: the lossy big integer

Add this broken endpoint that returns a huge id as a JSON *number*:

```python
@app.get("/v2/accounts/1")
def account():
    # BUG: 64-bit id as a JSON number loses precision in JS clients
    return {"id": 9007199254740993, "balance": 100}
```

```bash
curl -s http://127.0.0.1:8000/v2/accounts/1
node -e 'console.log(JSON.parse("{\"id\": 9007199254740993}").id)' 2>/dev/null || \
python3 -c "print(int(9007199254740993.0))   # simulate double rounding"
```

Expected: the raw JSON shows `9007199254740993`, but a JavaScript client
parsing it reads `9007199254740992` — the value silently changed because
JS numbers are IEEE-754 doubles that can't represent integers above 2^53
exactly. **Diagnose:** a large 64-bit integer was serialized as a JSON
number; any double-based parser (JS especially) corrupts it. **Fix:**
serialize large ids as **strings** (`"id": "9007199254740993"`), as the
`big_id` field in the main app does. Re-check that a string round-trips
exactly. Lesson: JSON's single "number" type is a precision trap — send
large integers as strings.

## Independent challenge

No code given.

**Task:** Evolve a `/products` API across a breaking change while keeping
existing clients working, using everything in this module. Requirements:
(1) ship `/v1/products/{id}` with an original shape and `/v2/products/{id}`
with a *breaking* change (rename or restructure at least one field, and
change at least one field's type in a way that would break a v1 client);
(2) implement both as **route groups** (module 10) mounted under version
prefixes, not repeated per-route; (3) mark v1 **deprecated** with the
appropriate response headers and a sunset date; (4) make the v2 create
endpoint **validate before trusting** — reject missing required fields,
bad types, and (your choice) unknown fields, returning the semantically
correct status codes from module 05; (5) handle at least one **custom
serialization** case (a datetime and/or a large 64-bit id) correctly so no
precision or timezone bug occurs; and (6) protect a `/v2/admin/*` group
with a shared authorization check applied at the group level. Prove each
requirement with curl, and write one paragraph justifying your choice of
URL-path versioning over header versioning (module 08) for this API,
referencing caching (module 06).

<details>
<summary>Hint</summary>

Use two `APIRouter(prefix="/v1")` / `prefix="/v2"` groups and
`app.include_router(...)`. For deprecation, set `Deprecation` and `Sunset`
response headers on the v1 routes (a small dependency or middleware can add
them to the whole group). For validation, a pydantic model with
`model_config = {"extra": "forbid"}` and `Field(...)` constraints gives you
`422`s for free. For the big-id/datetime, send the id as a string and let
pydantic serialize the timezone-aware `datetime` as ISO 8601. The
versioning justification: path versioning is explicit, trivially cacheable
(distinct URLs = distinct cache keys, no `Vary` gymnastics from module 06),
and easy to route via prefix groups (module 10).

</details>

## Common mistakes & troubleshooting

- **Making breaking changes without a new version.** Renaming/removing
  fields or changing types breaks live clients. Add a new version;
  deprecate the old one on a timeline.
- **Deleting an old version the day you deprecate it.** Give consumers a
  window; signal with `Deprecation`/`Sunset` headers and monitor usage
  before removal.
- **Repeating the version on every route.** Use route groups
  (`APIRouter(prefix="/v1")`) — that's what grouping is for (also enables
  shared middleware/permissions).
- **Trusting deserialized input.** Always validate against a schema
  *before* business logic; reject malformed (`400`) and invalid (`422`)
  distinctly (module 05).
- **Using unsafe deserializers on untrusted data.** `pickle`, native Java
  serialization, unsafe YAML can execute code — a critical RCE risk. Use
  JSON + validation for untrusted input.
- **Large integers as JSON numbers.** Precision loss in double-based
  parsers (JS > 2^53). Send big ids as strings.
- **Dates without timezones / mixed formats.** Use explicit ISO 8601 with
  an offset/`Z`. Never send an ambiguous local date and hope.
- **Confusing missing vs null fields.** They're different states; your
  schema should handle each deliberately.
- **Choosing binary (protobuf) for a public, debuggable API.** Binary wins
  for internal high-volume traffic; JSON's readability/universality
  usually wins for public APIs. Match format to use case.

## Checkpoint quiz

Write down your answer to each question before expanding it — checking without attempting first is the single easiest way to fool yourself into thinking you've learned this.

1. Give an example of a breaking change and a non-breaking change to a JSON
   API response, and explain why one requires a new version and the other
   doesn't.
2. Name three versioning techniques and one pro/con of each. Which is the
   pragmatic default, and why?
3. What two response headers signal deprecation, and what does each tell a
   client?
4. Define serialization and deserialization, and state the one-word reason
   the concept exists at all.
5. State the core tradeoff between text formats (JSON/XML) and binary
   formats (protobuf), and when you'd pick each.
6. JSON has no date type and one number type. Name a concrete bug that
   arises from each gap and the fix.
7. What is the cardinal security rule for deserializing untrusted input,
   and why is using `pickle` (or native Java serialization) on untrusted
   data especially dangerous?
8. How does route grouping serve versioning, permissions, and matching
   performance simultaneously?

<details>
<summary>Answers</summary>

1. Breaking: renaming `name` to `full_name`, removing a field, or changing
   a field's type — existing clients that read the old shape break.
   Non-breaking: adding a new optional field or a new endpoint — tolerant
   clients ignore unknown fields, so nothing breaks. Breaking changes need
   a new version to avoid disrupting current consumers.
2. Any three: URL path (`/v1/...`) — explicit, cache-friendly, easy to
   route / but version in every URL; query param (`?version=2`) — simple /
   mixes with filtering, easy to forget; header/media-type
   (`Accept: ...v2+json`) — clean URLs, RESTful / invisible, harder to
   test, needs `Vary`. Pragmatic default: URL path versioning, because it's
   explicit, cacheable (distinct URLs), and trivially routable as a prefix
   group.
3. `Deprecation` (this endpoint/version is deprecated) and `Sunset` (the
   date after which it will stop working) — together they let clients
   detect and schedule migration programmatically.
4. Serialization = converting an in-memory object to a byte sequence for
   transmission/storage (e.g. dict → JSON); deserialization = the reverse.
   It exists for **interoperability** — a neutral format lets different
   languages/systems exchange data.
5. Text (JSON/XML) is human-readable, debuggable, and universal but larger
   and slower to parse; binary (protobuf) is compact and fast but needs a
   schema and isn't human-readable. Pick text for public/debuggable/web
   APIs; pick binary for high-throughput internal service-to-service
   traffic.
6. No date type → dates encoded as strings; mixing formats or dropping the
   timezone shifts times silently. Fix: always use explicit timezone-aware
   ISO 8601. One number type → large 64-bit integers lose precision in
   double-based parsers (JS > 2^53). Fix: send large ids as strings.
7. Validate against a schema *before* trusting/using the data (reject
   non-conforming input first). `pickle`/native Java serialization can
   execute arbitrary code embedded in the payload, so deserializing
   untrusted data with them is a remote-code-execution vulnerability — use
   data-only formats (JSON) plus validation instead.
8. A group (e.g. `APIRouter(prefix="/v1")`) puts the version in one prefix
   (versioning), lets you attach shared middleware/auth dependencies to the
   whole group at once (permissions/middleware), and aligns routes by
   common prefix so the router's trie/radix matching can dispatch on the
   prefix first (performance).

</details>

## Next

[12-capstone-project](../12-capstone-project/README.md) — time to put the
entire track together: build a raw-HTTP-aware Python service that
demonstrates correct status codes, headers, caching, content negotiation,
and versioned JSON + protobuf responses.
