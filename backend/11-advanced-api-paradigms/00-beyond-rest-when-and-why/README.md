# Module 00: Beyond REST — When and Why

## Why this matters

By the end of track 02 you could design a clean, validated, versioned,
OpenAPI-documented REST API — and for a huge fraction of real systems that is
exactly the right tool and you should stop there. REST over HTTP/JSON is the
lingua franca of the web: cacheable, debuggable with `curl`, universally
understood, and backed by every proxy, gateway, and browser on earth. The goal
of this track is *not* to talk you out of REST. It's to make you fluent in the
handful of situations where REST's defaults actively fight you, and to give you
a vocabulary for the alternatives so you choose deliberately instead of
reaching for the only tool you know.

Three forces expose REST's limits. The first is **shape mismatch**: a mobile
screen needs a user, their last three orders, and each order's line items — one
logical thing — but REST models resources, so the client makes five round trips
or you bolt on a bespoke `?include=orders,orders.items` param that reinvents a
query language badly. The second is **performance and typing between your own
services**: when service A calls service B ten thousand times a second inside
your datacenter, JSON parsing and untyped payloads are pure tax, and a
schema-first binary protocol pays for itself. The third is **interaction
style**: REST is request/response and client-initiated; a stock ticker, a
collaborative document, or a "your export is ready" notification is
server-initiated and continuous, which request/response models awkwardly at
best.

This module builds the map. It won't teach you gRPC or GraphQL in depth — the
next chapters do that — but it will let you look at a requirement and say "this
is a GraphQL-shaped problem" or "this is internal RPC, use gRPC" or "REST is
fine, don't gold-plate it" *before* you've sunk a week into the wrong
architecture. That judgment is the actual skill; the syntax is downstream of
it.

## Concepts

### Where REST genuinely strains

REST's constraints are also its strengths, so "strain" means a place where a
strength becomes a liability for a *specific* workload. Be precise about which:

- **Over-fetching and under-fetching.** A REST endpoint returns a fixed
  representation. A client that needs three of a resource's forty fields still
  downloads forty (over-fetch); a client that needs a resource *and* its
  relations makes N follow-up calls (under-fetch, the classic "chatty" mobile
  problem). You can paper over this with sparse-fieldset params and `?include=`,
  but you're now maintaining a half-built query language.
- **Many round trips for one screen.** Aggregating five resources into one view
  means five requests (latency stacks up, especially on mobile networks) or a
  custom aggregation endpoint per screen (which couples the backend to UI and
  multiplies as screens do).
- **Weak typing and runtime-only contracts.** JSON has no schema by default;
  OpenAPI documents the contract but doesn't *enforce* it at the wire level, and
  a client can send `"age": "forty"` and only fail deep in your validator.
- **Request/response only.** The client asks; the server answers. The server
  cannot *initiate*. Real-time and push are bolted on (polling, webhooks,
  WebSockets — track 06) rather than native.
- **Per-call overhead at high volume.** HTTP/1.1 headers, JSON encode/decode,
  and a new logical request per call are negligible for a browser but real when
  two internal services chat millions of times a day.

None of these matter for a CRUD admin panel. All of them can dominate for a
mobile BFF, a high-traffic service mesh, or a live dashboard. **The workload
decides.**

### The paradigm map

There are four broad families. They are not mutually exclusive — mature systems
mix them — but each has a natural center of gravity:

- **Resource-oriented (REST).** Model the domain as resources with URLs and
  uniform HTTP verbs. Best for: public APIs, CRUD, anything that benefits from
  HTTP caching and universal tooling. Track 02.
- **RPC-style (gRPC, and JSON-RPC).** Model the domain as *functions you call
  remotely* — `CreateOrder(request) -> response` — over a fast, schema-first,
  often binary protocol. Best for: internal service-to-service traffic,
  low-latency high-throughput calls, polyglot backends that want generated
  typed clients. Modules 01–02.
- **Query-language / graph (GraphQL).** Expose one endpoint and a typed schema;
  the *client* specifies exactly which fields and relations it wants in a single
  request. Best for: rich frontends (web/mobile) with varied, evolving data
  needs; aggregating multiple backends. Modules 03–04.
- **Event-driven / streaming (webhooks, WebSockets, SSE, message queues).**
  Communication is asynchronous and often server-initiated; something *happens*
  and interested parties are notified. Best for: real-time updates, decoupling,
  fan-out, "tell me when X changes." Track 06 owns this in depth; module 05
  here places it in the decision framework.

### RPC vs resources vs graph — the mental model

The clearest way to feel the difference is to ask *what the API's nouns and
verbs are*:

- **REST** thinks in **nouns (resources)** and a **fixed set of verbs** (the
  HTTP methods). "Create an order" is `POST /orders`. The uniformity is the
  point: any client understands `GET`/`POST`/`DELETE` semantics without reading
  your docs.
- **RPC** thinks in **verbs (procedures)**. "Create an order" is a call to a
  named method `CreateOrder`. There's no pretense of resources; you're invoking
  functions across the network. This maps naturally to how code already thinks
  ("call this function") and, with a schema like Protobuf, gives you generated,
  type-checked stubs in every language.
- **GraphQL** thinks in a **typed graph of data**, queried declaratively. The
  client writes a query describing the exact shape it wants (`user { name
  orders { total } }`) and gets precisely that back — no more, no less, in one
  round trip. It collapses over-/under-fetching by moving field selection to
  the client.

A useful one-liner: **REST exposes resources, RPC exposes actions, GraphQL
exposes a queryable schema, events expose things that happened.**

### A decision framework

Don't pick by fashion. Walk these questions, roughly in order — the first
strong signal usually decides it:

1. **Who is the consumer?** A *public* third-party API → almost always REST
   (universal tooling, cacheability, low barrier to entry; GraphQL and gRPC
   raise the integration cost for outsiders). An *internal* service → gRPC is on
   the table. *Your own frontend(s)* with rich data needs → GraphQL earns its
   keep.
2. **What's the interaction style?** Request/response → REST or gRPC or GraphQL.
   Server-initiated / continuous / "notify me" → event-driven (webhooks,
   WebSockets, SSE; track 06).
3. **What's the data shape?** Fixed, resource-shaped, cache-friendly → REST.
   Highly variable per client, deeply relational, aggregating many sources →
   GraphQL.
4. **What are the performance constraints?** Very high throughput / low latency
   / strict typing between services → gRPC (HTTP/2, binary Protobuf). Human-scale
   traffic → REST/GraphQL are fine.
5. **Who operates and consumes it, and how mature is the team?** gRPC and
   GraphQL each carry real operational and learning cost (tooling, gateways,
   schema governance, N+1 traps). REST is the low-cost default; the alternatives
   must *earn* their complexity against a concrete pain, not a hypothetical one.

If no question produces a strong signal, **the answer is REST.** That's not a
cop-out — it's the correct default, and this whole track is about recognizing
the minority of cases where it isn't.

### Paradigms coexist — the realistic end state

Real systems are rarely "a GraphQL company" or "a gRPC shop." A common,
healthy topology looks like: a **public REST API** for third parties and
partners (stable, versioned, cacheable); **gRPC** for the chatty internal calls
between microservices (fast, typed); a **GraphQL BFF** (Backend-for-Frontend,
module 06) in front of those services for the web and mobile apps (one flexible
endpoint per client); and **webhooks/WebSockets** (track 06) for outbound events
and live updates. Each paradigm sits where its strengths line up with that
edge's needs. The capstone (module 08) has you build exactly this shape in
miniature: an internal gRPC service with a GraphQL BFF in front of it. Keep that
picture in mind — the rest of the track is filling it in.

## Command reference

There's little to *run* in this framing module; the "commands" here are the
diagnostic questions and the shape of each paradigm's "create an order." Study
the contrast:

| Signal | Leans toward | Why |
|---|---|---|
| Public / third-party consumer | REST | Universal tooling, cacheable, low integration cost |
| Internal service-to-service | gRPC | Typed stubs, HTTP/2, binary, low overhead |
| Rich/varied frontend data needs | GraphQL | Client picks fields; one round trip; no over/under-fetch |
| Server-initiated / continuous | Events (webhooks/WS/SSE) | Push, not poll; native async (track 06) |
| Fixed, cache-friendly resources | REST | HTTP caching, ETags, CDN-friendly |
| Aggregating many backends for a UI | GraphQL BFF | Single schema fronts many services |
| Extreme throughput / low latency | gRPC | Binary framing, multiplexed streams |
| No strong signal | REST | Correct low-cost default |

The same operation, "create an order," across paradigms — read these side by
side to internalize nouns-vs-verbs-vs-query:

```http
# REST — a resource and a uniform verb
POST /v1/orders
Content-Type: application/json

{"item_id": 42, "qty": 2}
# -> 201 Created, Location: /v1/orders/1001
```

```protobuf
// gRPC — a named procedure with a typed request/response (module 01)
service OrderService {
  rpc CreateOrder(CreateOrderRequest) returns (Order);
}
message CreateOrderRequest { int64 item_id = 1; int32 qty = 2; }
```

```graphql
# GraphQL — a mutation; the client also declares exactly what it wants back
mutation {
  createOrder(itemId: 42, qty: 2) {
    id
    total
    item { name }
  }
}
```

```text
# Event-driven — nobody "called"; something happened and subscribers are told
order.created  ->  { "id": 1001, "item_id": 42, "qty": 2 }   (track 06)
```

Notice: REST names a *resource*, gRPC names a *procedure*, GraphQL sends a
*query describing the exact response shape*, and the event names a *fact*. That
difference in what you name is the whole conceptual story of this track.

## Hands-on exercises

These are analysis and design exercises — no code to run yet. Write your
answers down; you'll reuse this reasoning in module 05 and the capstone.

### 1. Classify five real APIs

For each, name the paradigm you'd expect and one sentence why: (a) the Stripe
public payments API, (b) an internal `inventory-service` called by a
`checkout-service` 5,000×/sec, (c) GitHub's API that lets a client fetch a repo,
its last 10 issues, and each issue's author in one request, (d) a "your video
finished encoding" notification to a third party, (e) a live collaborative
cursor in a document editor. Expected: (a) REST, (b) gRPC, (c) GraphQL, (d)
webhook, (e) WebSocket.

### 2. Spot the over-fetch and under-fetch

A mobile home screen needs, for the logged-in user: their display name, avatar
URL, unread notification count, and the titles of their three most recent
orders. Sketch the REST calls a naive client makes. Count the round trips.
Then describe in one line how GraphQL collapses it. Expected: 2–4 REST round
trips (user, notifications, orders, maybe per-order detail) vs one GraphQL
query selecting exactly those fields.

### 3. Apply the decision framework end to end

You're adding a `pricing-service` that the `checkout-service` calls
synchronously on every cart update, plus an admin dashboard that shows pricing
rules. Walk the five framework questions for *each consumer* and land on a
paradigm per consumer. Expected: gRPC for checkout→pricing (internal,
high-frequency, typed); REST (or GraphQL if the dashboard is field-hungry) for
the admin UI.

### 4. Write the "why not REST" justification

Pick the checkout→pricing call from exercise 3. In 3–4 sentences, justify
choosing gRPC over REST *specifically*, citing throughput, typing, and internal
consumer. Then write the honest counter-argument for staying REST (operational
simplicity, tooling). Expected: a balanced case, not a fanboy pitch — this is
the judgment the track is building.

### 5. Design the coexistence topology

For a mid-size product (web app, iOS app, three internal services, one partner
integration), draw the topology: which edge speaks which paradigm and why.
Label each arrow. Expected: partner → REST; apps → GraphQL BFF; BFF →
services via gRPC; services → each other via gRPC; outbound partner events →
webhooks.

### 6. The premature-abstraction trap

A three-person startup with one web client and a Postgres-backed CRUD app
proposes: gRPC between their two services, a GraphQL BFF, and an API gateway.
Argue what they should build *now* and what's premature, tying each deferral to
a concrete cost they'd pay today for a benefit they don't yet need. Expected:
ship REST; defer gRPC/GraphQL/gateway until a real pain (throughput,
over-fetch, multi-team) shows up.

### 7. Nouns, verbs, or query?

For each requirement, say whether it's most naturally modeled as a resource
(REST), a procedure (RPC), or a query (GraphQL): (a) "transfer $50 from account
A to B" (b) "give me this product and its reviews and each reviewer's name" (c)
"list all products" (d) "recompute the search index now." Expected: (a) RPC-ish
action (REST can model it as a `transfer` resource but it's verb-shaped), (b)
GraphQL, (c) REST, (d) RPC-ish action/job trigger.

### 8. Diagnose and fix

A team has this situation and is unhappy. Read it, name the paradigm mismatch,
and prescribe the fix:

> "Our React app calls our REST API. Every screen needs data from 4–6
> endpoints, so we built 30 custom `/screens/home`, `/screens/profile`,
> `/screens/order-detail` aggregation endpoints. Every time the design team
> tweaks a screen, a backend engineer has to change or add an endpoint, and
> our controllers are now full of UI-specific shaping logic. Mobile is coming
> next and will need *different* shapes for the same data."

<details>
<summary>Solution</summary>

**The mismatch:** they're hand-building a per-screen query language on top of
REST — the classic under-fetch workaround (`/screens/*` aggregation endpoints)
scaled past its breaking point. The backend is now coupled to UI layout
(controllers shaping data per screen), and the coupling multiplies per client
(mobile will double it with different shapes for the same underlying data).
This is a textbook **GraphQL-shaped problem**: highly variable, per-client,
relational data needs where the *client* should decide the response shape.

**The fix:** introduce a **GraphQL BFF** (modules 03, 06) in front of the
existing services. Define the domain types once (`User`, `Order`, `Item`); let
web and mobile each send the exact query their screen needs in one round trip.
The `/screens/*` endpoints and their UI-shaping logic collapse into resolvers
over a shared schema, and a design tweak becomes a client-side query change with
zero backend deploy. Keep REST for the public/partner surface if there is one —
this is coexistence, not a rip-and-replace. (Watch for the N+1 problem the
graph introduces — module 03 — but that's a known, solvable cost, unlike the
unbounded endpoint sprawl they have now.)

Note the discipline: the fix is justified by a *concrete, present* pain (30
endpoints, UI coupling, imminent second client), not by GraphQL being
fashionable — exactly the bar exercise 6 set.

</details>

## Independent challenge

No code. You're the tech lead for a new **event-ticketing platform**. It has:
a public developer API (partners resell tickets), a web app and a native mobile
app (both show event lists, seat maps, and a personalized "my tickets" view), a
set of internal services (`inventory`, `pricing`, `payments`, `notifications`)
that call each other heavily during the checkout flow, and a requirement that
buyers see seat availability update *live* as others buy. Produce a one-page
**API strategy**: for each consumer/edge, name the paradigm, justify it against
the five-question framework, and explicitly note anything you're deliberately
*not* doing yet (and why). Call out at least one place where you'd resist adding
a paradigm because it would be premature.

<details>
<summary>Hint</summary>

Do it edge by edge and let the *consumer* drive each choice, exactly as in
exercises 3 and 5: partners are outsiders → REST (versioned, cacheable, low
integration cost); the two apps have rich, per-client, relational needs → one
GraphQL BFF fronting the services; the internal checkout chatter is
high-frequency and typed → gRPC; live seat availability is server-initiated and
continuous → WebSockets/SSE (track 06). The "premature" call is the interesting
one: e.g. don't federate the GraphQL schema across teams (module 04) until you
actually have multiple teams owning distinct subgraphs — a single BFF is simpler
until then.

</details>

## Common mistakes & troubleshooting

- **Treating this as "REST is obsolete."** It isn't. REST is the default and the
  majority case; the alternatives are for specific, justified pains. The failure
  mode of this track is over-correcting into paradigm tourism.
- **Choosing by resume/hype instead of consumer.** "We use GraphQL" or "we're a
  gRPC shop" as an identity leads to forcing every problem into one tool. Let the
  *consumer and workload* decide per edge.
- **Building a query language on top of REST.** Sprawling `?include=`,
  `?fields=`, and `/screens/*` endpoints are a signal you actually want GraphQL —
  stop reinventing it badly.
- **Reaching for gRPC on a public API.** External consumers pay a steep
  integration cost (Protobuf toolchain, HTTP/2, no `curl`-and-go). gRPC's home is
  *internal* traffic.
- **Adding paradigms before the pain exists.** gRPC, GraphQL, and gateways each
  carry ongoing operational and cognitive cost. Ship REST; add complexity when a
  concrete metric (round trips, throughput, endpoint sprawl, multi-team
  ownership) demands it.
- **Forgetting events are an option.** Not every "keep the client updated"
  problem is a polling problem. If the interaction is server-initiated, that's an
  event/streaming shape (track 06), not a cleverer REST endpoint.
- **Thinking the choice is global.** It's per edge. The right answer is usually
  "REST *and* gRPC *and* GraphQL *and* webhooks, each where it fits."

## Checkpoint quiz

Write down your answer to each question before expanding it — checking without attempting first is the single easiest way to fool yourself into thinking you've learned this.

1. In one line each, what does REST name, what does RPC name, what does GraphQL
   send, and what does an event name?
2. Define over-fetching and under-fetching, and name the REST workaround that,
   taken too far, signals you actually want GraphQL.
3. Walk the five decision-framework questions from memory. Which one usually
   fires first, and what's the default when none give a strong signal?
4. Give a concrete workload where gRPC clearly beats REST, and explain *why*
   REST would be the wrong call there.
5. Why is gRPC a poor choice for a *public* third-party API even though it's
   great internally?
6. Sketch the four-paradigm coexistence topology for a product with partners,
   a web + mobile app, several internal services, and a live-updating view.

<details>
<summary>Answers</summary>

1. REST names a **resource** (a noun with a URL, acted on by uniform HTTP
   verbs); RPC names a **procedure** (a remote function/action); GraphQL sends
   a **query describing the exact response shape** the client wants; an event
   names a **fact — something that happened**.
2. Over-fetching: the endpoint returns more fields than the client needs (fixed
   representation). Under-fetching: the client must make N follow-up calls to
   assemble one view (chatty). The workaround that signals you want GraphQL is
   piling on `?include=`/`?fields=`/per-screen aggregation endpoints — a
   hand-rolled query language.
3. (1) Who's the consumer? (2) Interaction style — request/response vs
   server-initiated? (3) Data shape — fixed/resource vs variable/relational?
   (4) Performance constraints — throughput/latency/typing? (5) Operational and
   team maturity/cost. "Who's the consumer" usually fires first (public→REST,
   internal→gRPC candidate, own rich frontend→GraphQL candidate). When nothing
   gives a strong signal, the default is **REST**.
4. High-frequency internal service-to-service calls (e.g. checkout→pricing at
   thousands/sec). REST would be wrong because per-call HTTP/1.1 + JSON overhead
   and untyped payloads become real tax at that volume, and you lose the
   generated, type-checked stubs and multiplexed HTTP/2 streams gRPC gives you
   between your own services.
5. Public consumers would have to adopt the Protobuf toolchain, speak HTTP/2,
   and can't just `curl` it or use ubiquitous REST tooling — the integration
   cost and barrier to entry are high. REST's universality is exactly what a
   public API needs; gRPC's strengths (typed stubs, binary framing) matter most
   where you control both ends, i.e. internally.
6. Partners → **REST** (versioned, cacheable, universal). Web + mobile apps →
   a **GraphQL BFF** (each client queries the exact shape it needs). BFF →
   internal services, and services → each other → **gRPC** (typed,
   high-throughput). The live-updating view → **WebSockets/SSE** (server-
   initiated push, track 06). Four paradigms, each at the edge where its
   strengths fit.

</details>

## Next

[01-grpc-fundamentals](../01-grpc-fundamentals/README.md) — you've decided
*when* to reach past REST; now build the first alternative. You'll define a
service in a `.proto` file, learn how Protocol Buffers give you a fast,
schema-first, binary contract, generate Python stubs with `grpcio-tools`, and
make your first unary RPC call.
