# Module 06: API Gateways and Backend-for-Frontend

## Why this matters

By now you can pick a paradigm per consumer (module 00), build it (modules
01–04), and choose how to keep consumers updated (module 05). But once you have
*more than one* service and *more than one* kind of client, a new question
appears: **who sits at the edge?** Every client shouldn't be talking directly to
every internal service — that means auth logic copied into every service, rate
limiting reinvented per service, clients coupled to your internal topology, and
CORS/TLS/logging concerns smeared across the whole backend. Two patterns answer
"what goes at the edge," and this module is about both — and, in the spirit of
module 00, about *when each one earns its complexity versus when it's premature*.

The first is the **API gateway**: a single entry point in front of your services
that handles the cross-cutting, edge-level concerns — authentication
termination, rate limiting, routing, TLS, request logging — so your services
don't each re-implement them. It's the operational front door. The second is the
**Backend-for-Frontend (BFF)**: a client-specific API layer that shapes and
aggregates backend data for *one particular frontend*, so the web app and the
mobile app each get exactly what their screens need instead of fighting over one
general-purpose API. You've already met the BFF idea repeatedly — a GraphQL BFF
is the recurring example from modules 00, 03, and 04, and the capstone builds
one. This module formalizes it and contrasts it with the gateway, because teams
constantly conflate the two.

Getting these right is what turns "a pile of services" into a coherent system
with a clean edge. Getting them wrong goes two ways: skipping the gateway and
duplicating auth/rate-limiting into a security-inconsistent mess, or bolting on a
gateway and per-client BFFs for a three-service app that a single FastAPI would
have served — the premature-abstraction trap module 00 keeps warning about.

## Concepts

### The API gateway: one front door for cross-cutting concerns

An **API gateway** is a reverse proxy that sits between clients and your
services and owns the concerns that are the same for *every* request regardless
of which service ultimately handles it. Instead of each service implementing
authentication, rate limiting, and TLS, the gateway does it once at the edge and
forwards a clean, already-authenticated request inward:

- **Authentication termination.** The gateway validates the caller's credential
  (a JWT, an API key) once, rejects anonymous/invalid traffic at the edge, and
  passes trusted identity (e.g. a `X-User-Id` header, or a verified token) to the
  services behind it — which can then trust it without re-validating. This is the
  auth-at-the-boundary idea from track 02, hoisted to the network edge.
- **Rate limiting and quotas.** One place to enforce "100 requests/minute per API
  key," protecting *all* downstream services from a flood or an abusive client —
  the token-bucket discipline from track 06 / track 02, applied centrally.
- **Routing.** Map external paths to internal services (`/orders/*` →
  `order-service`, `/users/*` → `user-service`), so clients address one host and
  are decoupled from your internal topology — you can split or move a service
  without clients noticing.
- **TLS termination, request logging, CORS, request-id injection.** The
  boilerplate every edge needs, done once. The gateway is also the natural place
  to add observability (a request id threaded to every service) and to enforce
  payload-size limits.

The mental model: the gateway is the **operational** front door — it doesn't know
or care about your domain, it enforces edge policy and routes. Managed options
(Kong, AWS API Gateway, Apigee, Envoy) exist precisely so you don't hand-roll
this; but you can also express the pattern in FastAPI to understand it.

### Backend-for-Frontend: a client-specific API layer

A **BFF** is a different thing at a different layer. Where a gateway is generic
and domain-agnostic, a BFF is **specific to one frontend** and *knows the
domain*: it aggregates and reshapes data from several backend services into
exactly what *that client's screens* need. The web app has a BFF; the mobile app
has its own BFF; each is owned (often) by the frontend team that consumes it.

- **It solves over-/under-fetching per client.** Rather than every client
  hitting five services and stitching results, the BFF makes those calls
  server-side (fast, same datacenter) and returns one screen-shaped response.
  This is precisely the problem module 00 diagnosed and modules 03–04 solved with
  GraphQL — **a GraphQL BFF is the most common concrete form of this pattern**.
- **It decouples client evolution from backend evolution.** The web team can
  reshape its BFF response as its UI changes without touching backend services or
  disturbing the mobile client, because each client's BFF is its own.
- **It can be REST or GraphQL.** A BFF is a *role*, not a technology. A GraphQL
  BFF lets the client pick fields (great when one client has many varied screens);
  a REST BFF with a few screen-shaped endpoints is fine when the shapes are few
  and stable. Choose by module 00's data-shape question.

Crucially, a BFF calls backend services — and in a healthy topology those
internal calls are often **gRPC** (modules 01–02): the BFF is the translation
layer between the client's world (GraphQL/REST over the public edge) and the
internal world (fast typed gRPC). That exact shape — GraphQL BFF in front of a
gRPC service — is the capstone.

### Gateway vs BFF: different jobs, often both present

These get conflated constantly, so pin the distinction:

| | API Gateway | BFF |
|---|---|---|
| Purpose | Edge policy: auth, rate limit, routing | Shape/aggregate data for one client |
| Knows the domain? | No — generic, per-request policy | Yes — knows the client's screens |
| How many? | Usually **one** for the whole system | **One per frontend** (web, mobile, …) |
| Owned by | Platform/infra team | Often the frontend team |
| Typical tech | Kong, Envoy, AWS API GW, nginx | FastAPI / GraphQL (Strawberry) |

```text
   web app ─┐                          ┌─► order-service ─┐
  mobile app├─►  API GATEWAY  ─► BFF ──┼─► user-service   ├─► data
   partner ─┘   authN / rate-limit     │   (aggregate +   └─► pricing-service
                routing / TLS          │    shape per        (gRPC internal)
                (one, domain-agnostic) │    client screen)
                                       └─ one BFF per frontend, domain-aware
    edge policy  ──────────────────►  client shaping  ─────────►  domain logic
```

They compose rather than compete. A common layered edge: **client → API gateway
(authN, rate limit, routing) → BFF (aggregate/shape for this client) → services
(gRPC) → data**. The gateway handles "is this caller allowed and not abusive, and
where does this path go"; the BFF handles "assemble the profile screen for the
mobile app." You can have a gateway without BFFs (one general API behind it),
BFFs without a formal gateway (small system), or both (mature multi-client
system).

### When a gateway earns its complexity — and when it's premature

A gateway is another network hop, another deployable, another thing to operate,
monitor, and keep highly available — it can become a single point of failure and
a latency tax if bolted on thoughtlessly. Module 00's discipline applies with
full force: it must earn its keep against a *concrete* pain.

- **It earns its keep when:** you have **multiple services** and need auth / rate
  limiting / routing to be consistent across all of them; you have **multiple
  clients or partners** needing centralized API-key management and quotas; you
  want a **stable external surface** decoupled from a changing internal topology;
  or you need edge concerns (TLS, WAF, request logging) in one governed place for
  compliance.
- **It's premature when:** you have **one or two services and one client**.
  A single FastAPI app can do its own auth (a dependency) and rate limiting
  (middleware, track 02) with no extra hop. Adding a gateway there buys you a
  single point of failure, an ops burden, and latency to solve a
  cross-service-consistency problem you don't have yet.

The honest rule: **start with auth-and-rate-limit as middleware inside your
service** (track 02). Introduce a gateway when the *third* service copies that
middleware for the third time, or when a partner program demands centralized keys
and quotas — i.e. when the duplication or the multi-client governance is a real,
present cost.

### When a BFF earns its complexity — and when it's premature

The BFF trades a general-purpose API for a per-client one: more surfaces to
build and maintain, and logic that can drift or duplicate across BFFs. It earns
its keep exactly where module 00 said GraphQL does:

- **It earns its keep when:** you have **multiple distinct clients** (web +
  mobile + partner) whose screens need **different shapes** of the same data;
  clients are suffering **over-/under-fetching** against a general API; or the
  frontend team needs to **evolve its API independently** of backend services.
- **It's premature when:** you have **one client** and a general REST API serves
  it fine. A BFF for a single web app is often just an extra layer with no second
  consumer to justify per-client shaping — the aggregation it would do can live in
  the service or the client until a second, differently-shaped client appears.

And a specific premature trap you already met: don't **federate** a GraphQL BFF
(module 04) across teams until multiple teams actually own distinct subgraphs. A
single BFF schema is simpler until then. The through-line for both patterns is
module 00's: **add the edge component when a concrete pain — duplicated edge
policy, multi-client shape divergence — makes its cost worth paying, not before.**

## Command reference

| Concern | Where it lives | Mechanism / example |
|---|---|---|
| Auth termination | Gateway (or service middleware) | Validate JWT once at edge, forward `X-User-Id` |
| Rate limiting | Gateway (or middleware) | Token bucket per API key (Redis; track 06) |
| Routing | Gateway | Path prefix → upstream service |
| TLS / CORS / request-id | Gateway | Terminate TLS, inject `X-Request-Id` |
| Data aggregation | BFF | Fan out to services, return screen-shaped response |
| Per-client shaping | BFF | GraphQL schema (client picks fields) or REST screen endpoints |
| Internal calls | BFF → services | gRPC (typed, fast; modules 01–02) |
| Managed gateways | Infra | Kong, Envoy, AWS API Gateway, Apigee, nginx |

A minimal gateway-shaped FastAPI: auth termination + per-key rate limit +
routing (illustrative — in production you'd use Kong/Envoy, but the pattern is
this):

```python
import time, httpx
from fastapi import FastAPI, Request, HTTPException
from collections import defaultdict

gateway = FastAPI()
UPSTREAMS = {"orders": "http://order-service:8000", "users": "http://user-service:8000"}
_buckets: dict[str, list[float]] = defaultdict(list)          # per-key request timestamps

def rate_limit(api_key: str, limit=100, window=60):
    now = time.time()
    hits = [t for t in _buckets[api_key] if t > now - window]  # keep only in-window
    if len(hits) >= limit:
        raise HTTPException(429, "rate limit exceeded")
    hits.append(now); _buckets[api_key] = hits

@gateway.api_route("/{service}/{path:path}", methods=["GET", "POST"])
async def route(service: str, path: str, request: Request):
    api_key = request.headers.get("x-api-key")
    if not api_key or not valid_key(api_key):                 # (1) auth termination
        raise HTTPException(401, "invalid API key")
    rate_limit(api_key)                                       # (2) rate limiting
    upstream = UPSTREAMS.get(service)                         # (3) routing
    if not upstream:
        raise HTTPException(404, "no such service")
    async with httpx.AsyncClient() as client:                # forward a trusted request inward
        resp = await client.request(
            request.method, f"{upstream}/{path}",
            content=await request.body(),
            headers={"x-user-id": user_for(api_key)},         # pass verified identity downstream
        )
    return resp.json()
```

A GraphQL BFF aggregating two gRPC services into one client-shaped query (the
capstone shape). The resolvers call internal gRPC; the client sees one graph:

```python
import strawberry

@strawberry.type
class OrderView:                      # a screen-shaped type, not a raw service DTO
    id: strawberry.ID
    total: float
    customer_name: str                # aggregated from a DIFFERENT service

@strawberry.type
class Query:
    @strawberry.field
    async def order(self, info: strawberry.Info, id: strawberry.ID) -> OrderView:
        order = await info.context["orders_stub"].GetOrder(OrderRequest(id=id))    # gRPC call
        user  = await info.context["users_stub"].GetUser(UserRequest(id=order.user_id))  # gRPC call
        return OrderView(id=order.id, total=order.total, customer_name=user.name)   # shaped for the client
```

## Hands-on exercises

Build a tiny two-service system to make the patterns concrete: an
`order-service` and a `user-service` (each a small FastAPI or gRPC service from
earlier modules), then put an edge in front of them.

### 1. Two bare services, called directly

Stand up `order-service` (`GET /orders/{id}` → `{id, user_id, total}`) and
`user-service` (`GET /users/{id}` → `{id, name}`). Have a client fetch an order
and then the user to display "Order 1 for Ada — $42." Note that the client is now
coupled to two hosts and makes two round trips. Expected: it works, but the
client knows your internal topology and stitches data itself.

### 2. Put a gateway in front

Add the gateway from the command reference. Route `/orders/*` and `/users/*` to
the two services. Point the client at the gateway only. Expected: the client
addresses one host; the gateway forwards to the right service; internal topology
is hidden behind the edge.

### 3. Terminate auth at the gateway

Require `X-API-Key` at the gateway; reject missing/invalid keys with `401` before
any upstream call. Forward a verified `X-User-Id` header downstream and have a
service *trust* it. Expected: unauthenticated traffic never reaches a service;
services no longer each validate the credential.

### 4. Rate-limit at the edge

Enforce 100 requests/minute per API key at the gateway (the token-bucket sketch).
Blow past it with a loop. Expected: the 101st request in the window gets `429`
from the gateway, protecting *both* downstream services at once — one control
point, not two.

### 5. Build a REST BFF for one screen

Add a BFF endpoint `GET /bff/order-summary/{id}` that calls both services
server-side and returns one screen-shaped object `{id, total, customer_name}`.
Point the client at it. Expected: one client round trip, one screen-shaped
payload; the two-service fan-out moved server-side (same datacenter), fixing the
under-fetch from exercise 1.

### 6. Make it a GraphQL BFF

Replace the REST BFF with a GraphQL `order(id) { total customerName }` resolver
that aggregates the two services (the command-reference shape). Add a second
"screen" — `orderWithItems` — without adding a backend endpoint. Expected: the
client picks fields; a new screen is a new query, not a new backend route — the
module-00/04 GraphQL-BFF payoff.

### 7. Draw the layered edge

Diagram the full request path for the mobile app fetching an order summary:
client → gateway (authN, rate limit, route) → BFF (aggregate) → services (gRPC) →
data. Label what each layer is responsible for and what it is *not*. Expected: a
clean separation — gateway = edge policy (domain-agnostic), BFF = client shaping
(domain-aware), services = domain logic.

### 8. The premature-edge argument

A three-person team with one web client and two services proposes: an API
gateway, a web BFF, and a mobile BFF (no mobile app exists yet). Argue what they
should build now and what's premature, tying each deferral to a concrete cost
paid today for a benefit not yet needed. Expected: do auth + rate-limit as
middleware in the services (or one shared lib); skip the gateway until a third
service or a partner program; skip BFFs until a second, differently-shaped client
exists — the module-00 discipline.

### 9. Diagnose and fix

A team describes this and is unhappy. Name the problems and prescribe fixes:

> "We have six microservices. Each one validates the JWT itself, and each has its
> own copy of a rate-limiting middleware we keep tweaking — they've drifted, so
> `payments` allows 1000/min but `orders` allows 100/min and nobody remembers
> why. Clients call all six services directly, so when we split `catalog` into
> `catalog` + `inventory`, every client broke. We also just gave a partner an API
> key, and now six services each need to know about partner keys and quotas."

<details>
<summary>Solution</summary>

**The problems, all symptoms of missing an edge:**
1. **Duplicated, drifted auth.** Six copies of JWT validation is six places to
   get it wrong and one drift away from an inconsistency (a service that trusts a
   stale key format). Auth should be **terminated once at a gateway**, which
   forwards verified identity inward.
2. **Duplicated, drifted rate limiting.** The `payments` 1000 vs `orders` 100
   discrepancy is exactly the "we keep tweaking six copies" failure. Rate limiting
   belongs at **one control point** (the gateway) with per-key policy, so quotas
   are consistent and governed centrally.
3. **Clients coupled to internal topology.** Direct-to-service means splitting
   `catalog` breaks every client. A **gateway routing** external paths to internal
   services decouples clients — you can split/move services behind a stable edge.
4. **Partner keys smeared across services.** Six services each learning about
   partner keys/quotas is the multi-client governance signal for a gateway:
   **centralize API-key management and quotas** at the edge; services just trust
   forwarded identity.

**The fix:** introduce an **API gateway** as the single front door — terminate
auth, enforce one rate-limiting/quota policy per key, and route external paths to
services. Optionally add a **BFF** if clients are also over-/under-fetching, but
the acute pain here is *edge policy duplication and topology coupling*, which is
squarely the gateway's job. This is the case where a gateway clearly earns its
complexity (module 00): six services, multiple clients, a partner program —
concrete, present costs, not hypotheticals.

</details>

## Independent challenge

No code given. Return to the **coexistence topology** you sketched in the
**module 00** independent challenge (or its exercises 5–6): a mid-size product
with partners, a web app, a mobile app, and several internal services. Now design
its **edge** in detail. Specify: (1) whether there's an API gateway and exactly
which concerns it owns; (2) how many BFFs there are and which client each serves,
and whether each BFF is REST or GraphQL and why; (3) what protocol the BFFs use to
call internal services; and (4) at least one edge component you are *deliberately
not* adding yet, with the concrete cost you'd avoid by deferring it. Keep every
choice tied to a present pain, not a hypothetical.

<details>
<summary>Hint</summary>

Layer it: **one** gateway owns the domain-agnostic edge policy (authN
termination, per-key rate limiting/quotas for partners, routing, TLS, request-id)
— justified because you have multiple services *and* multiple clients/partners,
so consistency and centralized key management are real present costs. Then **one
BFF per client shape**: a GraphQL BFF for the web + mobile apps (varied,
per-client screens → the client-picks-fields payoff from module 04), calling
internal services over **gRPC** (typed, fast, same datacenter — modules 01–02).
Partners get **REST** through the gateway directly (no BFF — their integration is
resource-shaped and they're outsiders, module 00). The deliberate deferral is the
interesting part: don't **federate** the GraphQL BFF (module 04) until distinct
teams own distinct subgraphs, and don't add a second gateway/mesh until a
concrete scaling or governance pain appears — otherwise you're paying operational
cost for a multi-team problem you don't yet have (module 00).

</details>

## Common mistakes & troubleshooting

- **Conflating gateway and BFF.** The gateway is generic edge *policy* (auth,
  rate limit, routing), one per system, domain-agnostic. A BFF *shapes domain
  data* for one client, one per frontend. They're different layers that often
  coexist — don't make your gateway aggregate data or your BFF do generic auth.
- **Adding a gateway for one service and one client.** That's a single point of
  failure, an extra hop, and ops burden to solve a cross-service-consistency
  problem you don't have. Use in-service middleware (track 02) until a concrete
  duplication/governance pain appears.
- **Building a BFF with only one client.** A per-client layer with one consumer
  is just an extra layer. Wait for a second, differently-shaped client (mobile)
  or real over-/under-fetch pain before splitting a general API into BFFs.
- **Re-validating auth in every service.** If the gateway terminates auth and
  forwards verified identity, services should *trust* it (over a trusted network),
  not each re-parse the JWT — that's the duplication the gateway removes.
- **Letting the gateway become a domain-logic dumping ground.** Business rules in
  the gateway couple edge policy to your domain and turn a generic proxy into a
  bottleneck everyone edits. Keep domain logic in services/BFFs.
- **Forgetting the gateway is a single point of failure.** One front door for
  everything must be highly available, monitored, and horizontally scaled — plan
  for it, or you've centralized your outages too.
- **Federating a BFF prematurely.** Federation (module 04) solves multi-team
  subgraph ownership. One team, one schema → a single BFF is simpler; a router +
  subgraphs first is premature complexity (module 00).

## Checkpoint quiz

Write down your answer to each question before expanding it — checking without attempting first is the single easiest way to fool yourself into thinking you've learned this.

1. In one sentence each, what is an API gateway *for* and what is a BFF *for*,
   and how do they differ in what they know?
2. Name four cross-cutting concerns an API gateway typically owns, and where
   those same concerns live if you *don't* have a gateway.
3. How many gateways and how many BFFs does a typical multi-client system have,
   and why the difference?
4. Give the concrete signal that a gateway has earned its complexity, and the
   situation where it's premature.
5. Why is a GraphQL BFF calling internal gRPC services "the translation layer,"
   and which modules does each side come from?
6. Give one premature-abstraction trap specific to BFFs and how you'd avoid it.

<details>
<summary>Answers</summary>

1. An **API gateway** is for **generic edge policy** — auth termination, rate
   limiting, routing, TLS — for every request regardless of domain; a **BFF** is
   for **shaping and aggregating domain data for one specific client's screens**.
   The gateway *doesn't* know the domain (per-request policy only); the BFF *does*
   (it knows the client's screens and the services it aggregates).
2. Any four of: authentication termination, rate limiting/quotas, routing
   (external path → internal service), TLS termination, CORS, request logging /
   request-id injection, payload-size limits. Without a gateway, these live as
   **middleware/dependencies inside each service** (track 02) — which is fine for
   one or two services but duplicates and drifts as services multiply.
3. Usually **one gateway** for the whole system (a single governed front door for
   edge policy) but **one BFF per frontend** (web, mobile, …), because edge policy
   is the same for everyone whereas each client needs data shaped differently for
   *its* screens.
4. Earned when you have **multiple services** needing consistent auth/rate-limit/
   routing, and/or **multiple clients/partners** needing centralized API-key
   management and quotas, and/or a stable external surface over a changing
   topology. Premature when you have **one or two services and one client** — a
   single FastAPI with auth-as-dependency and rate-limit middleware does the job
   without an extra hop and SPOF.
5. Because it translates between the **client's world** (GraphQL/REST over the
   public edge — modules 03–04) and the **internal world** (fast, typed gRPC
   between services — modules 01–02): the client sends one graph query, the BFF
   fans out to gRPC services and returns a client-shaped response. It's the
   capstone shape.
6. **Federating the BFF** (module 04) before multiple teams own distinct
   subgraphs — you'd add a router, subgraph directives, and composition overhead
   to solve a multi-team problem you don't have. Avoid it by keeping a single BFF
   schema until distinct teams genuinely need to own and deploy parts
   independently (module 00's discipline). (Also acceptable: building a BFF with
   only one client.)

</details>

## Further reading & sources

- [Sam Newman — Backends For Frontends pattern](https://samnewman.io/patterns/architectural/bff/) - the canonical writeup that named and defined the BFF pattern this module formalizes.
- [microservices.io — API Gateway pattern](https://microservices.io/patterns/apigateway.html) - Chris Richardson's reference on the gateway's role at the edge and its tradeoffs.
- [AWS — What is an API Gateway](https://aws.amazon.com/what-is/api-gateway/) - a managed-gateway vendor's overview of auth, throttling, and routing at the edge.
- [Kong — API gateway concepts](https://docs.konghq.com/gateway/latest/) - documentation for a widely used gateway, grounding the auth/rate-limit/routing concerns in a real product.
- [Strawberry — GraphQL over FastAPI](https://strawberry.rocks/docs/integrations/fastapi) - mounting a GraphQL BFF as one route, as in the aggregation exercises.
- [microservices.io — Backends for frontends pattern](https://microservices.io/patterns/apigateway.html#variation-backends-for-frontends) - the BFF as a per-client variation of the gateway, tying both patterns together.

## Next

[10-api-design-tradeoffs-in-practice](../10-api-design-tradeoffs-in-practice/README.md)
— you now have every piece: the paradigms, the update mechanisms, and the edge
components. Next you'll put them together into a coherent whole-system strategy —
mixing REST, gRPC, and a GraphQL BFF in one product, versioning across paradigms,
and documenting a multi-paradigm system — and then close the loop with the
track's second cumulative review over everything from module 00 onward.
