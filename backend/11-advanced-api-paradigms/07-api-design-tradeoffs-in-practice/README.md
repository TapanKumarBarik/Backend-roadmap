# Module 07: API Design Tradeoffs in Practice

## Why this matters

Every prior module gave you a piece: when to leave REST (00), gRPC (01–02),
GraphQL (03–04), how to keep consumers updated (05), and the edge components that
sit in front — gateways and BFFs (06). Real systems don't use these one at a
time. A mature product is almost always **multi-paradigm**: a public REST API for
partners, internal gRPC between services, a GraphQL BFF for the apps, webhooks
for outbound events. Module 00 sketched that end state; this module is about
*living in it* — the practical decisions that only show up once several paradigms
coexist in one system and have to evolve together over years.

Three of those decisions are where teams get burned. **Mixing** paradigms
coherently (not letting the same domain logic fork three ways behind three
protocols). **Versioning across paradigms**, because REST, gRPC, and GraphQL each
evolve their contracts differently — a URL version, a Protobuf field number, an
additive-only graph — and a change that's safe in one is a silent break in
another (a theme the cumulative review will press on). And **documentation
strategy**, because a system with three contract styles needs three kinds of docs
that stay honest, or integrators drown. None of this is new *technology* — it's
the judgment that ties the whole track together into a system you could actually
run and grow.

This is the last standard module, so it's also where the track's design
philosophy has to become a habit: every paradigm, update mechanism, and edge
component is a cost that must earn its keep against a concrete pain (module 00),
and every contract is a promise you have to evolve without breaking. Get this
module right and you can walk into a real system, read its API surface, and reason
about where each paradigm belongs and how to change it safely.

## Concepts

### Mixing paradigms in one system without forking your domain

The realistic topology from module 00 — public REST + internal gRPC + GraphQL
BFF + webhooks — only works if the paradigms are **edges onto one domain**, not
three reimplementations of it. The failure mode is letting "create an order" grow
three subtly different implementations behind the REST controller, the gRPC
handler, and the GraphQL mutation. The discipline:

- **Domain logic lives in one place; paradigms are adapters.** A single
  `create_order(...)` service function is called by the REST route, the gRPC
  method, *and* the GraphQL resolver. Each paradigm handles only its own
  translation (parsing, shaping, status mapping); none owns business rules. This
  is the hexagonal/ports-and-adapters instinct, and it's what keeps a
  multi-paradigm system from drifting into three inconsistent products.
- **Each edge does what it's best at.** Partners get **REST** (versioned,
  cacheable, universal). Internal service-to-service calls are **gRPC** (typed,
  fast). The apps get a **GraphQL BFF** (client picks fields, aggregates
  services). Outbound events are **webhooks** (server-to-server push). The
  assignment is module 00's consumer-first framework applied per edge — not a
  house style imposed everywhere.
- **The BFF is the seam between worlds.** It speaks the client's paradigm on the
  outside (GraphQL) and calls the internal one (gRPC) inside — the translation
  layer from module 06. That seam is where over-/under-fetch gets resolved and
  where you avoid exposing internal service shapes to clients.

The one-liner: **one domain, many edges.** Mixing paradigms is a feature of a
mature system; forking your domain behind them is the bug.

```text
  partners   ──► REST route     ─┐
  own apps   ──► GraphQL resolver├─►  create_order()      ──► orders_repo
  internal   ──► gRPC handler   ─┘    ONE domain function      (one DB)
  outbound   ──► webhook emitter ┘    (qty<=0 rule lives here)
      each edge only TRANSLATES (parse/shape/status-map); none owns business rules
```

### Versioning across paradigms: same goal, three mechanisms

Every contract will change; the skill is changing it **without silently breaking
consumers**, and each paradigm evolves differently. The unifying principle is
**additive, backward-compatible change** — but its shape differs:

- **REST** versions explicitly and coarsely: a URL prefix (`/v1/`, `/v2/`) or a
  version header, plus additive changes within a version (add fields, never
  remove/rename/repurpose; never change a field's meaning). Public REST APIs lean
  on this because outside integrators need a stable, obvious contract and a long
  deprecation window (track 02's versioning discipline).
- **gRPC / Protobuf** versions at the **field-number** level: you add new fields
  with new tags and *never reuse or renumber a tag* — renumbering silently
  corrupts data on the wire (the exact silent-contract bug the cumulative reviews
  hammer). Removing a field means `reserved`-ing its number so it's never reused.
  Compatibility is per-message, fine-grained, and enforced by the tag discipline,
  not by a URL.
- **GraphQL** versions by **evolving one schema additively** — the community norm
  is *no versioned endpoints at all*. You add types/fields freely; you **deprecate**
  fields with `@deprecated(reason: ...)` rather than removing them, and you watch
  which fields clients actually select before retiring anything. Removing or
  changing a field's type is the breaking change to avoid.

The through-line: **additive is safe; removing/renaming/repurposing is a break in
every paradigm** — they just detect and manage it differently (a URL bump, a
reserved tag, a deprecation directive). A change that looks harmless in one (bump
the version) is catastrophic in another (renumber a tag) if you don't respect each
mechanism.

### The public/internal contract boundary

A recurring practical tension: your **internal** contracts (gRPC between your
services) can evolve fast because you own both ends and deploy them together; your
**public** contracts (REST/GraphQL for partners and apps) must evolve slowly and
compatibly because you don't control the consumers. This asymmetry drives real
decisions:

- **Never leak internal shapes to the outside.** Don't expose a gRPC-generated
  message straight to a partner — you'd couple their integration to your internal
  refactors. The BFF/gateway (module 06) is where you map internal shapes to
  stable external ones, so an internal rename doesn't break a client.
- **Different change velocities, different processes.** Internal gRPC can add a
  field and redeploy caller + callee together this afternoon. A public REST field
  change ships behind a version and a deprecation window measured in months.
  Treat the boundary as a firewall between "fast, coordinated change" and "slow,
  compatible change."
- **The gateway owns the external-stability guarantees.** Routing at the edge
  (module 06) means you can split, move, or rewrite an internal service without
  the external URL changing — the stable external surface over a changing internal
  topology.

### Documentation strategy for a multi-paradigm system

Three contract styles need three kinds of docs, and the win is that each paradigm
has a **schema-first, generated** option so docs don't rot into fiction:

- **REST → OpenAPI.** FastAPI generates it from your types; it drives Swagger UI,
  client SDKs, and contract tests. The doc *is* the schema (track 02).
- **gRPC → the `.proto` files** are the contract and the doc; tooling generates
  reference docs and, crucially, **typed client stubs** in every language, so the
  "documentation" is machine-checked and can't drift from the wire format.
- **GraphQL → introspection + the SDL.** The schema is self-documenting;
  GraphiQL/Playground and tools like SpectaQL render it, and field
  **descriptions** live in the schema. Clients discover the graph directly.
- **Above all three: a human-written map.** Generated reference docs tell you
  *what* each endpoint is; they don't tell an integrator *which paradigm to use
  for what*, the auth model, rate limits, versioning policy, and the deprecation
  calendar. A short "how our API surface is organized" guide — the module-00
  topology, written down — is the doc that prevents a partner from trying to speak
  gRPC to your public edge.

The principle: **prefer generated, schema-derived docs** (they stay honest) and
add one **hand-written orientation doc** that explains the multi-paradigm *shape*
no generator can infer. That's the same "the schema is the contract" instinct
running through gRPC's `.proto`, REST's OpenAPI, and GraphQL's SDL.

### Choosing and evolving the mix over time

Systems aren't born multi-paradigm; they grow into it, and module 00's discipline
governs the sequence. A healthy evolution, each step justified by a concrete pain:

1. **Start REST, one service.** It serves everyone until a real limit bites.
2. **Add gRPC** when internal service-to-service traffic gets hot enough that
   JSON/HTTP overhead and untyped payloads are a measured tax (modules 01–02).
3. **Add a GraphQL BFF** when a rich client (or a second client) is suffering
   over-/under-fetch against the general API (modules 03–04, 06).
4. **Add webhooks/streaming** when a consumer genuinely needs server-initiated
   updates (module 05, track 06).
5. **Add a gateway** when edge policy (auth, rate limit, routing) is duplicated
   across enough services or a partner program needs central key management
   (module 06).

Each step is reversible reasoning: if the pain isn't concrete and present, you
don't take it. The end state looks impressive, but it's the *accumulation* of
justified decisions, never a big-bang "let's be a gRPC + GraphQL + gateway
company." That accumulation-by-justification is the entire track's thesis.

## Command reference

| Decision | REST | gRPC | GraphQL |
|---|---|---|---|
| Primary consumer | Public / partners | Internal services | Own apps (BFF) |
| Contract artifact | OpenAPI (generated) | `.proto` files | SDL / introspection |
| Versioning unit | URL prefix `/v1` | Field number (tag) | One evolving schema |
| Safe change | Add fields | Add new tag | Add type/field |
| Breaking change | Remove/rename/repurpose | Reuse/renumber a tag | Remove/retype a field |
| Retire a field | New version + deprecation | `reserved` the tag | `@deprecated(reason:)` |
| Docs tooling | Swagger UI | proto docs + stubs | GraphiQL / SpectaQL |

One domain function, three paradigm adapters (no forked business logic):

```python
# domain/orders.py — the ONE place business rules live
def create_order(user_id: int, item_id: int, qty: int) -> Order:
    if qty <= 0:
        raise InvalidQuantity()          # one rule, enforced everywhere
    return orders_repo.create(user_id, item_id, qty)

# REST adapter (public) — translate HTTP <-> domain, map errors to status codes
@app.post("/v1/orders", status_code=201)
def rest_create_order(body: CreateOrderIn):
    try:
        return create_order(body.user_id, body.item_id, body.qty)
    except InvalidQuantity:
        raise HTTPException(422, "qty must be positive")

# gRPC adapter (internal) — translate proto <-> domain, map errors to gRPC status
class OrderService(orders_pb2_grpc.OrderServiceServicer):
    def CreateOrder(self, request, context):
        try:
            o = create_order(request.user_id, request.item_id, request.qty)
            return orders_pb2.Order(id=o.id, total=o.total)
        except InvalidQuantity:
            context.abort(grpc.StatusCode.INVALID_ARGUMENT, "qty must be positive")

# GraphQL adapter (BFF) — translate query <-> domain
@strawberry.mutation
def create_order(self, user_id: int, item_id: int, qty: int) -> OrderType:
    try:
        o = create_order(user_id, item_id, qty)
        return OrderType(id=o.id, total=o.total)
    except InvalidQuantity:
        raise GraphQLError("qty must be positive")
```

Backward-compatible evolution, per paradigm (the *safe* move in each):

```python
# REST: add a field within /v1 (additive, non-breaking); breaking changes go to /v2
class OrderOut(BaseModel):
    id: int
    total: float
    currency: str = "USD"     # NEW optional field — old clients ignore it, safe
```

```protobuf
// gRPC: add a NEW tag; never renumber 1/2; reserve a retired tag's number
message Order {
  int64 id = 1;
  double total = 2;
  string currency = 3;        // NEW field, NEW tag — old peers skip it, safe
  reserved 4;                 // a removed field's tag is reserved, never reused
}
```

```graphql
# GraphQL: add a field freely; deprecate rather than remove
type Order {
  id: ID!
  total: Float!
  currency: String!
  legacyTotalCents: Int @deprecated(reason: "Use total (major units)")   # keep, don't delete
}
```

## Hands-on exercises

Assemble a small multi-paradigm system from the earlier modules' pieces: a
domain service, a public REST edge, an internal gRPC service, and a GraphQL BFF.
The point is the *system-level* decisions, not new syntax.

### 1. Extract the shared domain

Take "create an order" and put its business rules in one `create_order()` domain
function. Have a REST route, a gRPC method, and a GraphQL mutation all call it,
each only translating in/out. Expected: the `qty <= 0` rule exists in exactly one
place; all three paradigms reject a bad qty identically without duplicating the
check.

### 2. Map errors per paradigm

For the single `InvalidQuantity` domain error, map it to the right thing in each
edge: REST `422`, gRPC `INVALID_ARGUMENT`, GraphQL error. Expected: one domain
error surfaces idiomatically in three protocols — same rule, three faithful
translations (modules 01/02 status codes, track 02 HTTP codes).

### 3. Assign paradigms to four consumers

For one product, assign a paradigm to each: a partner reselling your product, an
internal `pricing-service` called on every checkout, the web app's account
screen, and a "shipment.delivered" notification to a partner. Justify each with
module 00's framework. Expected: REST, gRPC, GraphQL BFF, webhook respectively.

### 4. Evolve a REST contract safely

Add a `currency` field to your `/v1/orders` response. Show that an old client
(expecting only `id`/`total`) still works. Then propose a change that would
*force* a `/v2` and explain why it can't be additive. Expected: adding an optional
field is non-breaking within `/v1`; renaming/removing/retyping `total` forces a
new version + deprecation window.

### 5. Evolve a Protobuf contract safely

Add a `currency` field to your `Order` message with a new tag. Then show what
breaks if you instead *renumber* `total` from tag 2 to tag 3. Expected: the new
tag is backward-compatible (old peers skip it); renumbering silently misreads data
because the wire tag no longer matches — the classic silent gRPC contract bug.

### 6. Evolve a GraphQL schema safely

Add `currency` to your `Order` type, and deprecate an old `legacyTotalCents`
field with `@deprecated` instead of deleting it. Query it and confirm it still
resolves but is flagged deprecated in introspection. Expected: additive + deprecate
keeps every existing client working while steering new ones off the old field — no
versioned endpoint needed.

### 7. Write the orientation doc

Write the one-page "how our API surface is organized" guide: which paradigm each
consumer uses, the auth model, rate limits, and the versioning/deprecation policy
per paradigm. Expected: a human-readable map that a new integrator could read and
immediately know to use REST (not gRPC) for the public API — the doc no generator
produces.

### 8. Protect the public/internal boundary

You refactor an internal gRPC `Order` message (rename a field). Show that,
because the GraphQL BFF maps internal → external shapes, no client breaks. Then
show what *would* break if the BFF passed the gRPC message straight through.
Expected: with mapping, the internal rename is invisible to clients; without it,
the client contract breaks on an internal refactor — why you never leak internal
shapes.

### 9. Diagnose and fix

A team describes their system and is in pain. Name every problem and prescribe
fixes:

> "'Create order' has three implementations — one in the REST controller, one in
> the gRPC handler, one in the GraphQL mutation — and they've drifted: REST
> allows qty 0, gRPC doesn't. We version our public GraphQL API with `/v1/graphql`
> and `/v2/graphql` endpoints and maintain both. When we renamed an internal field
> we `reserved`-ed nothing and just changed the tag number, and a downstream
> service started reading garbage. Our public REST docs are a hand-maintained wiki
> that's months out of date. And we expose our internal gRPC `User` message
> directly to the mobile app."

<details>
<summary>Solution</summary>

1. **Forked domain logic.** Three "create order" implementations that drifted
   (REST allows qty 0, gRPC doesn't) is the core anti-pattern. **Extract one
   `create_order()` domain function** and make all three paradigms thin adapters
   that call it — business rules live in one place, translated per protocol.
2. **Versioning GraphQL with endpoints.** `/v1/graphql` + `/v2/graphql` fights
   GraphQL's model. **Evolve one schema additively** and use `@deprecated` to
   retire fields; drop the versioned endpoints. (URL versioning is the REST
   mechanism, not GraphQL's.)
3. **Renumbering a Protobuf tag.** Changing a tag number silently corrupts the
   wire format — exactly why a downstream service reads garbage. **Add new fields
   with new tags, never renumber, and `reserved` any retired tag.** This is a
   silent-contract bug, the most dangerous kind (cumulative-review theme).
4. **Rotting hand-written REST docs.** A stale wiki lies. **Generate docs from
   OpenAPI** (FastAPI does this from your types) so the doc *is* the schema and
   can't drift.
5. **Leaking an internal gRPC shape to a public client.** Exposing the internal
   `User` message to mobile couples the client to internal refactors. **Map
   internal → external shapes at the BFF/gateway** so internal changes don't break
   clients (the public/internal boundary).

Lesson: a multi-paradigm system stays healthy only with **one domain behind many
adapters**, **paradigm-appropriate versioning** (URL vs tag vs additive schema),
**generated docs**, and a **guarded public/internal boundary**. Every failure here
is one of those four disciplines skipped.

</details>

## Independent challenge

No code given. Take the **event-ticketing platform** you've now designed the API
strategy (module 00), update mechanisms (module 05), and edge (module 06) for.
Produce its **complete practical API design document**: (1) the paradigm assigned
to every consumer edge and the one shared domain layer they all call; (2) the
versioning and deprecation policy for *each* paradigm in use (REST URL versions,
Protobuf tag discipline, GraphQL additive-with-`@deprecated`); (3) the
documentation strategy (which generated docs plus the hand-written orientation
guide); and (4) the growth sequence — which paradigm/edge you'd add first, second,
third as the platform scales, each gated on a concrete pain. Explicitly mark one
thing you're *not* building yet and the cost you avoid by waiting.

<details>
<summary>Hint</summary>

Anchor everything on **one domain, many edges** (this module) and the module-00
consumer-first assignment: partners → public **REST** (`/v1`, additive, long
deprecation window); internal service-to-service → **gRPC** (evolve by adding
tags, `reserved` retired ones, never renumber); web + mobile → a **GraphQL BFF**
(one additive schema, `@deprecated` to retire fields), calling the gRPC services
and mapping internal shapes to external ones so refactors don't leak; outbound
partner events → **webhooks** (module 05). Docs: **OpenAPI** for REST, **`.proto`**
for gRPC, **SDL/introspection** for GraphQL, plus one hand-written map of the whole
surface. The growth sequence is the module-00 discipline made concrete — REST
first, then gRPC when internal traffic is a measured tax, then the BFF when a
client suffers over-/under-fetch, then a gateway when edge policy duplicates. The
deliberate "not yet" is almost certainly **GraphQL federation** (module 04): don't
split the BFF into subgraphs until distinct teams own distinct parts — a single
schema is simpler until that multi-team pain is real.

</details>

## Common mistakes & troubleshooting

- **Forking domain logic behind each paradigm.** Three implementations of "create
  order" drift into three inconsistent products. Keep business rules in one domain
  function; make REST/gRPC/GraphQL thin adapters that only translate.
- **Applying one paradigm's versioning to another.** URL versions are REST's;
  Protobuf versions by tag; GraphQL evolves one additive schema. Versioning
  GraphQL with `/v2/graphql` or renumbering a Protobuf tag are both category
  errors — one is redundant, one is a silent data-corruption bug.
- **Renumbering or reusing a Protobuf tag.** The single most dangerous change in
  the track — it silently corrupts the wire format with no error. Add new tags,
  never renumber, `reserved` retired ones.
- **Removing/renaming/retyping a public field.** Breaking in every paradigm.
  Additive changes are safe; retire fields via a new REST version, a `reserved`
  gRPC tag, or a GraphQL `@deprecated` directive with a window.
- **Leaking internal shapes to public clients.** Exposing a gRPC-generated
  message straight to a partner/app couples their contract to your internal
  refactors. Map internal → external at the BFF/gateway.
- **Hand-maintained docs that rot.** A stale wiki is worse than no docs.
  Generate from OpenAPI/`.proto`/SDL so the doc is the schema; add only the
  hand-written *orientation* guide a generator can't produce.
- **Going multi-paradigm as an identity, not a response to pain.** "Let's be a
  gRPC + GraphQL + gateway company" up front is the premature-abstraction trap.
  The impressive end state is an accumulation of individually justified steps
  (module 00).

## Checkpoint quiz

Write down your answer to each question before expanding it — checking without attempting first is the single easiest way to fool yourself into thinking you've learned this.

1. State the "one domain, many edges" principle and the specific failure it
   prevents.
2. How does each of REST, gRPC, and GraphQL version its contract, and what is the
   *breaking* change in each?
3. Why is renumbering a Protobuf field tag categorically more dangerous than
   removing a field from a REST response?
4. Why can internal (gRPC) contracts evolve faster than public (REST/GraphQL)
   ones, and what component guards the boundary between them?
5. Describe the documentation strategy for a multi-paradigm system, including the
   one doc no generator can produce.
6. Give the justified growth sequence from a single REST service to a full
   multi-paradigm system, with the pain that triggers each step.

<details>
<summary>Answers</summary>

1. **One domain, many edges:** business logic lives in one place (a shared domain
   function) and each paradigm (REST/gRPC/GraphQL) is a thin adapter that only
   translates in/out. It prevents **forking your domain** — three drifting
   implementations of the same operation behind three protocols (e.g. REST
   allowing a qty the gRPC handler rejects).
2. **REST** versions by **URL prefix** (`/v1` → `/v2`) with additive changes
   within a version; breaking = remove/rename/repurpose a field. **gRPC** versions
   by **field number/tag** (add new tags, never renumber, `reserved` retired
   ones); breaking = reuse/renumber a tag. **GraphQL** evolves **one additive
   schema** (add freely, `@deprecated` to retire); breaking = remove/retype a
   field. Additive is safe in all three.
3. Because renumbering a tag is a **silent** wire-format corruption — the code
   compiles, no error is raised, and peers misread data — whereas removing a REST
   field produces a *visible* absence a client can detect and a version/deprecation
   process manages. Silent breaks are the worst kind: nothing tells you until data
   is wrong downstream.
4. Internal gRPC contracts have **both ends owned and deployed together**, so you
   can add a field and redeploy caller + callee the same afternoon; public
   contracts have **consumers you don't control**, so they must change slowly and
   compatibly behind versions and deprecation windows. The **BFF/gateway** guards
   the boundary by mapping internal shapes to stable external ones so internal
   refactors don't leak.
5. **Generate** docs from each schema — **OpenAPI** for REST, **`.proto`** (+ typed
   stubs) for gRPC, **SDL/introspection** for GraphQL — so docs can't drift from
   the contract. Then add the one **hand-written orientation guide** explaining the
   multi-paradigm *shape* (which consumer uses which paradigm, auth, rate limits,
   versioning policy) that no generator can infer.
6. **REST first** (one service serves everyone). Add **gRPC** when internal
   service-to-service traffic is a *measured* JSON/HTTP tax (modules 01–02). Add a
   **GraphQL BFF** when a rich or second client suffers over-/under-fetch (modules
   03–04, 06). Add **webhooks/streaming** when a consumer needs server-initiated
   updates (module 05). Add a **gateway** when edge policy duplicates across
   services or a partner program needs central key management (module 06). Each
   step gated on a concrete, present pain (module 00).

</details>

## Cumulative review

Closed-book. Don't reopen modules 00–07 while attempting these — this is the
track's second cumulative review (the first covered 00–03), and the point is to
find out what stuck across the *whole* arc: choosing paradigms, gRPC, GraphQL,
update mechanisms, the edge, and putting it all together.

1. A new product has: partners reselling your inventory, a web + mobile app
   showing a data-rich "my account" screen, an internal `pricing-service` called
   ~10,000×/sec during checkout, and a requirement that buyers see inventory
   counts update live. Assign a paradigm *and* (where relevant) an update
   mechanism to each edge, and justify each against the module-00 framework.
2. Three changes ship on the same day: a REST field is renamed in `/v1`, a
   Protobuf field is renumbered from tag 2 to tag 3, and a GraphQL field's type
   is changed from `Int` to `String`. Rank them by danger, say which are silent
   vs loud, and give the compatible way to achieve each intended change.
3. Explain why **authorization** lives on the route in REST (track 02) but on the
   field/resolver in GraphQL (module 04), and how an **API gateway** (module 06)
   changes where authentication happens for both.
4. A browser dashboard needs order status "within a minute"; a partner backend
   needs to know the instant an order ships; a trading UI needs live ticks. Name
   the update mechanism for each (module 05) and the one framework question that
   decides the partner-vs-browser difference.
5. Contrast the N+1 problem (module 03) and a leaked gRPC stream (module 02):
   what each is, the interaction paradigm each occurs in, and the specific defense
   for each. Then name the one discipline both defenses share.
6. A team runs six services, each re-validating JWTs and each with its own
   drifted rate limiter, and exposes a GraphQL endpoint to untrusted third
   parties. Diagnose against modules 00, 04, and 06, and prescribe the corrected
   edge.
7. Trace a mobile app fetching an "order summary" through the full mature
   topology: name every hop (client → … → data), the paradigm/protocol on each
   hop, and what each layer is responsible for — and say which layer resolves the
   over-/under-fetch and which enforces the rate limit.
8. Justify, as a growth sequence, why a two-person startup with one web client
   and a CRUD app should *not* start with gRPC + GraphQL + a gateway, and name the
   concrete pain that would later justify adding each of those three.

<details>
<summary>Answers</summary>

1. Partners → **REST** (public/third-party: universal, cacheable, low integration
   cost — framework Q1). The account screen for web + mobile → a **GraphQL BFF**
   (own frontends, rich/variable relational data, collapses aggregation, serves two
   clients with different shapes — Q1 + Q3). `pricing-service` at 10,000×/sec →
   **gRPC** (internal, extreme throughput, low latency, typed stubs — Q1 internal +
   Q4 performance). Live inventory counts to buyers (browsers) → a **push**
   mechanism, **SSE** or a **GraphQL subscription** if they already talk to the BFF
   (server-initiated, browser can't be called inbound — module 05).
2. Danger: **renumbering the Protobuf tag is worst** (silent wire corruption, no
   error), then the **GraphQL `Int`→`String` retype** (breaks clients but surfaces
   as errors — loud-ish), then the **REST rename** (visibly absent field, managed
   by versioning — loud). Compatible versions: Protobuf — add a *new* field with a
   *new* tag and `reserved` the old, never renumber; GraphQL — add a new
   correctly-typed field and `@deprecate` the old, don't retype in place; REST —
   add the new field and retire the old across a `/v2` + deprecation window, don't
   rename in `/v1`.
3. REST has a **route per resource/operation**, so auth can guard the route (a
   router dependency, track 02). GraphQL has **one endpoint** and one query can
   traverse from a public field into a sensitive one, so authorization must live
   **per field/resolver** using the current user from context (module 04). An **API
   gateway** hoists *authentication* to the edge — it validates the credential once
   and forwards verified identity — so services/BFF trust it instead of each
   re-validating; authorization (who-can-do-what) still lives in the service/field
   logic.
4. Browser dashboard, ~1 min tolerance → **polling** (cheap, REST-native, bounded
   freshness is fine). Partner backend, "instant" on ship → **webhook**
   (server-to-server push). Trading UI, live ticks → **SSE/WebSocket** (persistent
   push to a browser). The deciding framework question for partner-vs-browser:
   **can the consumer receive an inbound HTTP call?** — the partner server can (so
   a webhook works), the browser can't (so it polls or holds a socket open).
5. **N+1** (module 03, **GraphQL**): a per-item field resolver fires one
   data-source query per parent (100 books → 100 author lookups); defense = a
   **per-request DataLoader** that batches the keyed loads into one query. **Leaked
   stream** (module 02, **gRPC server-streaming**): the server keeps producing
   after the client has disconnected; defense = check `context.is_active()` and
   bound/exit the loop. Shared discipline: **bound the work one request/connection
   can cause** — batch it or stop it — rather than trusting the naive path to
   scale.
6. Against **module 06**: six copies of JWT validation and six drifted rate
   limiters are duplicated edge policy → introduce **one API gateway** that
   terminates auth once and enforces one rate-limit/quota policy, routing to
   services that trust forwarded identity. Against **module 00 / 04**: exposing a
   GraphQL endpoint to *untrusted third parties* is the wrong consumer for GraphQL
   — public/partner integrators should get **REST** (cacheable, low integration
   cost, smaller abuse surface); reserve GraphQL for your own apps as a **BFF**.
   Corrected edge: gateway (authN, rate limit, routing) → REST for partners, a
   GraphQL BFF for first-party apps → gRPC to internal services.
7. **Client (mobile) → API gateway → BFF → services → data.** Client → gateway:
   over the public edge (HTTPS); the **gateway** terminates auth, enforces the
   **rate limit**, and routes. Gateway → **BFF** (GraphQL): the BFF aggregates and
   **resolves the over-/under-fetch**, shaping one screen response. BFF → **services**
   over **gRPC** (typed, fast, same datacenter); services own domain logic. Services
   → **data** (DB/cache). The **BFF** resolves over-/under-fetch; the **gateway**
   enforces the rate limit; the **services** own the domain.
8. With one client and a CRUD app there's **no concrete pain** any of the three
   solves: gRPC's typing/throughput matters between *chatty internal services* they
   don't have; a GraphQL BFF's field-picking matters for *rich/multiple clients*
   they don't have; a gateway's centralized edge policy matters across *many
   services/partners* they don't have — each would add ops burden, a hop/SPOF, or a
   learning curve for a benefit that isn't yet needed (module 00). Later triggers:
   add **gRPC** when internal service-to-service traffic becomes a measured JSON/HTTP
   tax; add a **GraphQL BFF** when a rich or second client suffers over-/under-fetch;
   add a **gateway** when edge policy is duplicated across enough services or a
   partner program needs central key/quota management.

</details>

## Further reading & sources

- [Google — API design guide](https://cloud.google.com/apis/design) - a comprehensive reference for designing coherent, evolvable APIs across a system, including versioning and compatibility.
- [Google AIP-180 — Backwards compatibility](https://google.aip.dev/180) - the concrete rules for what counts as a breaking vs additive change, applicable across paradigms.
- [Protocol Buffers — Proto3: updating message types](https://protobuf.dev/programming-guides/proto3/#updating) - the authoritative rules on adding, reserving, and never renumbering field tags.
- [GraphQL — Best practices: versioning & deprecation](https://graphql.org/learn/best-practices/#versioning) - why GraphQL evolves one additive schema with `@deprecated` instead of versioned endpoints.
- [Apollo — Introduction to Apollo Federation](https://www.apollographql.com/docs/federation/) - the multi-team composition option to reach for only once distinct teams own distinct subgraphs.
- [Martin Fowler — Ports and Adapters (Hexagonal Architecture)](https://martinfowler.com/bliki/HexagonalArchitecture.html) - the "one domain, many adapters" pattern behind keeping business logic out of each paradigm edge.

## Next

[08-edge-computing-and-webassembly](../08-edge-computing-and-webassembly/README.md)
— one more edge to add to module 00's map: logic that runs neither in your
origin server nor in the browser, but on infrastructure physically close to
the request, in a WebAssembly sandbox instead of a traditional server process.
