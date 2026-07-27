# Module 04: GraphQL Advanced Patterns

## Why this matters

Module 03 got you a working, N+1-safe GraphQL API — enough to replace a pile of
REST aggregation endpoints for a single app. But four things stand between "works
in GraphiQL" and "runs as the front door for a real product," and each is a place
teams get burned. You need **subscriptions** when the client shouldn't have to
re-ask — live scores, a notification badge, a collaborative view. You need
**pagination** the moment any list can grow, because `books: [Book!]!` returning
everything is a latent outage. You need **authorization inside resolvers**,
because GraphQL's single endpoint and field-by-field execution mean auth can't
live at "the route" the way it did in REST — a query can reach any field in the
graph, so every sensitive field needs its own guard. And once more than one team
owns parts of the graph, you need a strategy for **composing schemas** —
stitching or federation — instead of one monolith everyone fights over.

These are the patterns that also make GraphQL viable specifically as a
**Backend-for-Frontend** (the role module 06 formalizes and the capstone builds).
A BFF fronting several services has to page through large result sets, enforce
who-can-see-what per field, push live updates, and potentially compose types
owned by different backends. That's this entire module. Pagination and authz in
particular are not optional niceties — shipping a GraphQL API without bounded
lists and per-field authorization is how you get a data-exfiltration incident or
a database melted by one unbounded query.

You'll keep building in Strawberry on FastAPI. Everything here layers onto the
module-03 schema/resolver/DataLoader model — subscriptions are a new root type,
connections are a new field shape, authz is logic *inside* resolvers, and
federation is a way of splitting the schema you already know how to write.

## Concepts

### Subscriptions: server-pushed updates

A **subscription** is GraphQL's third root type (alongside `Query` and
`Mutation`) and its answer to "notify me when something changes." Instead of
returning a value once, a subscription resolver is an **async generator** that
`yield`s values over time; the transport is typically a WebSocket, so updates
flow to the client as they happen — no polling.

```python
import asyncio
import strawberry

@strawberry.type
class Subscription:
    @strawberry.subscription
    async def price_updates(self, symbol: str) -> AsyncGenerator[Price, None]:
        async for tick in price_feed(symbol):     # some async source
            yield Price(symbol=symbol, value=tick)

schema = strawberry.Schema(query=Query, mutation=Mutation, subscription=Subscription)
```

The client "subscribes" and receives a stream:

```graphql
subscription { priceUpdates(symbol: "ACME") { value } }
```

Two things to keep straight. First, this overlaps conceptually with gRPC
server-streaming (module 02) and with WebSockets/SSE (track 06) — same "server
pushes over a long-lived connection" idea, different ecosystem. GraphQL
subscriptions are the right tool when your clients *already* speak GraphQL and
want live updates in the same typed schema. Second, subscriptions inherit every
long-lived-connection concern from track 06: connection lifecycle, cleanup on
disconnect, and the fact that they don't scale across processes without a shared
pub/sub backend (Redis) behind them. Don't reach for subscriptions when a
simpler poll or a webhook would do — module 05 is the decision framework.

### Pagination and the connection pattern

`books: [Book!]!` that returns the whole table is a bug waiting for the table to
grow. GraphQL's community-standard answer is **cursor-based pagination**, and its
formalization is the **Relay Connection** specification — a consistent shape for
paginated fields that most tooling understands:

```graphql
type BookConnection {
  edges: [BookEdge!]!
  pageInfo: PageInfo!
}
type BookEdge {
  node: Book!          # the actual item
  cursor: String!      # opaque pointer to THIS item's position
}
type PageInfo {
  hasNextPage: Boolean!
  endCursor: String    # feed this back as `after` to get the next page
}

type Query {
  books(first: Int!, after: String): BookConnection!
}
```

A client fetches `books(first: 20)`, reads `pageInfo.endCursor`, then requests
`books(first: 20, after: "<endCursor>")` for the next page. This is the same
**cursor vs. offset** distinction from track 02's CRUD module: a **cursor**
points *after a specific item* (stable under inserts/deletes — no skipped or
duplicated rows when the list changes between pages), whereas offset/`skip`
shifts when rows are inserted. The connection pattern is just the standardized,
graph-friendly packaging of cursor pagination, with `edges`/`node`/`cursor`/
`pageInfo` as the agreed field names. Always paginate any list that can grow —
and always **cap `first`** (module-07/track-02 discipline: an unbounded page size
is a denial-of-service vector).

### Authorization in resolvers

In REST you could put auth on the route (a router-level dependency, track 02).
GraphQL has **one route**, and a single query can traverse from a public field
down into a sensitive one, so **authorization has to live at the field/resolver
level**. The current user arrives via the GraphQL **context** (populated in
`context_getter`, exactly where the per-request DataLoader lives), and each
protected resolver checks it:

```python
@strawberry.type
class User:
    id: strawberry.ID
    name: str                      # public

    @strawberry.field
    def email(self, info: strawberry.Info) -> str | None:
        current = info.context["user"]
        # only the user themselves (or an admin) can read the email field
        if current and (current.is_admin or current.id == self.id):
            return self._email
        return None                # or raise a GraphQLError for a hard denial
```

Key principles:

- **Authorize per field, not per query.** A query can reach any field in the
  graph; a public `user(id)` lookup must not expose that user's `email` or
  `phone` to everyone. Guard the sensitive *fields*.
- **Context carries identity**, resolved once per request (from a JWT/session in
  `context_getter`), just like the request-context dependency injection from
  track 02.
- **Decide deny semantics deliberately:** return `null` for "you may see the
  object but not this field," or raise a `GraphQLError` for "you may not access
  this at all." Strawberry offers **field permission extensions** to make this
  declarative and reusable rather than hand-rolled in every resolver.
- **Watch introspection and error messages** — don't leak existence or internal
  detail through them (the enumeration concern from track 02, and track 03's
  security-deep-dive spirit).

### Query cost: depth and complexity limits

GraphQL's flexibility is also an attack surface: because the client composes the
query, a malicious or careless one can nest deeply (`author { books { author {
books { ... } } } }`) or select enormous fan-outs, turning one request into a
crushing amount of work. Production GraphQL therefore adds **query-cost
controls**: a **max depth limit**, a **complexity/cost analysis** (assign each
field a cost, reject queries over a budget), and pagination caps so no single
field returns unbounded data. Strawberry ships extensions for query depth
limiting; Apollo-style complexity plugins exist too. This is the GraphQL analog
of rate limiting and payload caps from track 02's middleware module — the
threat is just shaped like an expensive query instead of a flood of requests.

### Schema composition: stitching and federation

One schema owned by one team is simple. But at scale, `users`, `orders`, and
`products` are owned by different teams/services, and you don't want one giant
schema everyone edits (merge conflicts, coupling, a single deploy bottleneck).
Two approaches compose a unified graph from parts:

- **Schema stitching** — a gateway takes multiple independent schemas and merges
  them into one, wiring up links between types at the gateway. Older approach;
  the gateway holds the integration logic and can get brittle.
- **Federation** (Apollo Federation is the dominant standard) — each service
  owns a **subgraph** and *declares* how its types connect to others using
  directives (e.g. an `Order` subgraph says its `Order.user` field references a
  `User` entity owned by the users subgraph, keyed by `id`). A **gateway/router**
  composes the subgraphs into one **supergraph** and resolves cross-subgraph
  references by calling the owning subgraph. Federation pushes ownership to the
  teams and is the modern default for multi-team GraphQL at scale.

The reference model: a federated `User` type can be *extended* by the orders
subgraph so an `Order` can expose `order.user.name` even though users live in a
different service — the router fetches the `User` fields from the users subgraph
behind the scenes. You don't need to implement federation to work here; you need
to recognize *when* it applies (multiple teams owning distinct parts of one
graph) versus when a single BFF schema (module 06) is simpler and sufficient.
Don't federate a graph one team owns — that's premature, per the module-00
discipline.

## Command reference

| Item | Purpose | Example |
|---|---|---|
| `@strawberry.subscription` | Server-pushed stream (async generator) | `async def price_updates(...)` |
| `AsyncGenerator[T, None]` | Subscription return type | `yield` values over time |
| `Subscription` root type | Third root alongside Query/Mutation | `Schema(..., subscription=...)` |
| Connection / `edges`/`node`/`cursor` | Relay-style cursor pagination | `BookConnection` |
| `first` / `after` args | Page size + cursor position | `books(first: 20, after: $c)` |
| `pageInfo { hasNextPage endCursor }` | How to fetch the next page | in every connection |
| `info.context["user"]` | Current identity in a resolver | authz check |
| `strawberry.GraphQLError` | Hard authorization/error denial | `raise GraphQLError("forbidden")` |
| Field permission extension | Declarative per-field authz | `strawberry.field(permission_classes=[...])` |
| Query depth / complexity extension | Reject expensive queries | schema extensions |
| Federation directives (`@key`, `@external`) | Declare cross-subgraph entities | `@key(fields: "id")` |
| Gateway / router | Compose subgraphs into a supergraph | Apollo Router |

Capping and paging a connection resolver (note the enforced `first` cap):

```python
MAX_PAGE = 100

@strawberry.field
def books(self, first: int = 20, after: str | None = None) -> BookConnection:
    first = min(first, MAX_PAGE)                 # cap page size (never trust the client)
    rows = fetch_books_after(cursor=after, limit=first + 1)  # fetch one extra to peek
    has_next = len(rows) > first
    rows = rows[:first]
    edges = [BookEdge(node=b, cursor=encode_cursor(b.id)) for b in rows]
    end = edges[-1].cursor if edges else None
    return BookConnection(edges=edges,
                          page_info=PageInfo(has_next_page=has_next, end_cursor=end))
```

A declarative field-permission class (reusable authz, not hand-rolled per field):

```python
from strawberry.permission import BasePermission

class IsSelfOrAdmin(BasePermission):
    message = "Not authorized to read this field"
    def has_permission(self, source, info, **kwargs) -> bool:
        current = info.context["user"]
        return bool(current and (current.is_admin or current.id == source.id))

@strawberry.type
class User:
    id: strawberry.ID
    name: str
    email: str = strawberry.field(permission_classes=[IsSelfOrAdmin])
```

## Hands-on exercises

Continue the `graphql-books`/blog project from module 03 (Strawberry + FastAPI).
Keep your per-request DataLoader wiring — it's assumed here.

### 1. Add a subscription

Add a `Subscription` with `count_up() -> AsyncGenerator[int, None]` that yields
1..10, one per second. Wire `subscription=` into the schema. Subscribe from
GraphiQL. Expected: values arrive live, one per second, over a WebSocket — not
all at once.

### 2. A domain subscription

Replace the counter with `comment_added(post_id)` that yields each new `Comment`
as it's created (drive it from your `addComment` mutation via an in-process
async queue/broker). Expected: a subscriber to a post sees new comments appear
in real time as another client mutates.

### 3. Convert a list field to a connection

Turn `books` (or `posts`) into a Relay-style `BookConnection` with
`edges`/`node`/`cursor` and `pageInfo`. Support `first` and `after`. Expected:
`books(first: 2)` returns 2 edges plus `pageInfo.endCursor`; feeding that cursor
as `after` returns the next 2.

### 4. Cap the page size

Enforce `first = min(first, MAX_PAGE)` in the connection resolver. Request
`books(first: 100000)`. Expected: you get at most `MAX_PAGE` items, not the whole
table — an unbounded page size is a DoS vector, exactly like the uncapped
`limit` from track 02's CRUD module.

### 5. Prove cursor stability

Fetch page 1 (`first: 2`), then insert a new book that sorts before the current
window, then fetch page 2 with the saved `after` cursor. Expected: no row is
skipped or duplicated across the page boundary — the cursor points *after a
specific item*, so an insert elsewhere doesn't shift your window (contrast with
offset pagination).

### 6. Per-field authorization

Add a private `email` to `User`, exposed only to the user themselves or an
admin. Populate `context["user"]` in `context_getter` (fake a user id via a
header for now). Query `user(id) { name email }` as the same user, a different
user, and an admin. Expected: `name` always returns; `email` returns the value
only for self/admin and `null` (or an error) otherwise.

### 7. Make authz declarative

Refactor exercise 6's inline check into a reusable `IsSelfOrAdmin`
`BasePermission` and attach it via `permission_classes`. Expected: identical
behavior, but the rule is defined once and reused — and adding it to another
sensitive field (`phone`) is one line.

### 8. Add a depth limit

Install/enable a query depth-limiting extension and set a low max depth. Send a
deeply nested query (`post { author { posts { author { posts { ... } } } } }`)
that exceeds it. Expected: the query is rejected before execution with a
depth-limit error — the query-cost defense in action.

### 9. Diagnose and fix

This "my orders" GraphQL API leaks data and can be trivially DoS'd. Find every
problem.

```python
@strawberry.type
class User:
    id: strawberry.ID
    name: str
    email: str                                    # (A) always returned
    def _orders(self): return db.orders_for(self.id)

@strawberry.type
class Query:
    @strawberry.field
    def users(self) -> list[User]:                # (B) every user, unbounded
        return db.all_users()

    @strawberry.field
    def user(self, id: strawberry.ID) -> User:    # (C) no authz at all
        return db.get_user(id)
```

<details>
<summary>Solution</summary>

1. **(A) `email` is a plain field, always returned.** Anyone who can resolve a
   `User` — including via the public `user(id)` lookup — reads everyone's email.
   Sensitive fields need **per-field authorization**: gate `email` with a
   permission class (`IsSelfOrAdmin`) that reads `info.context["user"]`, returning
   `null`/error otherwise. GraphQL has one endpoint, so auth lives on the field,
   not the route.
2. **(B) `users` returns every user with no pagination or cap.** Unbounded list
   = DoS + mass data exposure. Convert to a capped **connection**
   (`first`/`after`, `first = min(first, MAX_PAGE)`), and it should almost
   certainly require admin authorization to list users at all.
3. **(C) `user(id)` has no authorization** and returns the full object. Even if
   fields are individually gated, decide whether arbitrary user lookup should be
   allowed; at minimum the sensitive fields must be guarded, and object-level
   existence shouldn't leak (enumeration).
4. **Missing query-cost controls (implicit).** With relationships in the graph,
   add a depth/complexity limit so a nested `users { orders { ... } }` can't be
   weaponized.

```python
class IsSelfOrAdmin(BasePermission):
    message = "forbidden"
    def has_permission(self, source, info, **kwargs):
        u = info.context["user"]
        return bool(u and (u.is_admin or u.id == source.id))

@strawberry.type
class User:
    id: strawberry.ID
    name: str
    email: str = strawberry.field(permission_classes=[IsSelfOrAdmin])

@strawberry.type
class Query:
    @strawberry.field(permission_classes=[IsAdmin])
    def users(self, first: int = 20, after: str | None = None) -> UserConnection:
        first = min(first, MAX_PAGE)
        ...
```

Lesson: on a single-endpoint, client-composed API, **authorization is per field
and unbounded lists are a vulnerability** — both must be designed in, not bolted
on.

</details>

## Independent challenge

No code given. Take the blog GraphQL BFF you started in **module 03** and make it
production-shaped. Add: (1) cursor-based `posts` and per-post `comments`
**connections**, both with capped page sizes; (2) a `commentAdded(postId)`
**subscription** driven by your `addComment` mutation; (3) **per-field
authorization** so a `Post`'s `author.email` and a private `draft` body are
visible only to the author or an admin, using a reusable permission class; and
(4) a **query depth limit**. Then write a short note on whether this blog graph
should be **federated** or stay a single schema, justified against the module-00
"don't add complexity before the pain" rule.

<details>
<summary>Hint</summary>

Reuse the per-request context you already built for DataLoaders (module 03) —
it's the same place the current `user` and your loaders live, so authz checks and
batched loads share one context object. For the federation note, the honest
answer is almost certainly **stay single-schema**: one team owns the whole blog
domain, so there are no distinct subgraph owners to decouple — federation would
add a router, subgraph directives, and composition overhead to solve a
multi-team problem you don't have (the exact premature-abstraction trap from
module 00). Reach for federation only when `users`/`posts`/`billing` are owned by
*different* teams that need to deploy independently.

</details>

## Common mistakes & troubleshooting

- **Unbounded list fields.** `things: [Thing!]!` returning everything is a
  latent outage and data-exposure risk. Paginate anything that can grow, and cap
  the page size server-side.
- **Route-level auth thinking.** GraphQL has one endpoint; you can't guard "the
  route." Authorize per field/resolver using the current user from context.
- **Leaking sensitive fields by default.** A field is exposed to anyone who can
  resolve its parent type. Gate `email`/`phone`/`draft`/internal fields
  explicitly; prefer a reusable permission class over copy-pasted checks.
- **No query-cost controls.** A client-composed query can nest deeply or fan out
  hugely. Add depth and complexity limits — the GraphQL analog of rate limiting.
- **Offset pagination in a connection.** Defeats the point; use real cursors so
  pages are stable under concurrent inserts/deletes.
- **Subscriptions that don't scale or clean up.** They're long-lived
  connections: they leak without disconnect cleanup and don't fan out across
  processes without a shared pub/sub backend (track 06). Don't use them where a
  poll/webhook is simpler (module 05).
- **Federating prematurely.** Federation solves multi-team schema ownership. One
  team, one schema → a single BFF is simpler; adding a router/subgraphs first is
  premature complexity (module 00).
- **Leaking existence via errors/introspection.** Don't let error messages or
  schema introspection confirm records or expose internals (enumeration/OWASP
  concerns).

## Checkpoint quiz

Write down your answer to each question before expanding it — checking without attempting first is the single easiest way to fool yourself into thinking you've learned this.

1. What is a subscription, how is its resolver written in Python, and which two
   other technologies in this curriculum does it overlap with conceptually?
2. Describe the Relay connection shape (`edges`/`node`/`cursor`/`pageInfo`) and
   how a client uses it to fetch the next page.
3. Why does GraphQL authorization have to live at the field/resolver level
   rather than at the route, and where does the current user come from?
4. Give the two sensible "deny" semantics for a protected field and when you'd
   use each.
5. What query-cost controls does production GraphQL need, and which track-02
   defense are they analogous to?
6. Contrast schema stitching and federation, and state the signal that tells you
   you actually need either (vs a single BFF schema).
7. Why must you cap `first` on a connection, and which earlier module's
   principle is that?

<details>
<summary>Answers</summary>

1. A subscription is GraphQL's third root type for server-pushed updates over a
   long-lived connection (usually a WebSocket); the resolver is an **async
   generator** that `yield`s values over time. It overlaps conceptually with
   **gRPC server-streaming** (module 02) and **WebSockets/SSE** (track 06) — same
   push-over-persistent-connection idea, different ecosystem.
2. A connection returns `edges` (each an object with a `node` — the item — and a
   `cursor` — an opaque pointer to that item's position) plus `pageInfo`
   (`hasNextPage`, `endCursor`). The client requests `first: N`, reads
   `pageInfo.endCursor`, then requests `first: N, after: <endCursor>` to get the
   next page.
3. GraphQL exposes a **single endpoint**, and one query can traverse from a
   public field into a sensitive one, so you can't guard "the route" — each
   sensitive field needs its own check. The current user comes from the
   per-request **context** (`info.context["user"]`), resolved once from a JWT/
   session in `context_getter`.
4. Return **`null`** when the user may see the object but not that particular
   field (partial visibility); raise a **`GraphQLError`** when the user may not
   access the thing at all (hard denial). Choose based on whether partial
   results make sense.
5. A **max depth limit**, **query complexity/cost analysis** (budget per query),
   and **pagination caps**. They're the analog of **rate limiting and payload
   caps** from track 02's middleware/CRUD modules — same goal (bound the work one
   request can cause), threat shaped as an expensive query.
6. **Stitching** merges independent schemas at a gateway that holds the linking
   logic (older, can be brittle). **Federation** has each team own a *subgraph*
   that declares how its types connect via directives, with a router composing
   them into a supergraph (modern default). You need either only when **multiple
   teams own distinct parts of one graph** and must deploy independently — one
   team/one schema should stay a single BFF.
7. Because an uncapped page size lets a client request unbounded data — a
   denial-of-service and mass-exposure vector. That's the same "cap the page
   size / never trust client-supplied limits" principle from track 02's CRUD
   deep dive.

</details>

## Next

[05-webhooks-vs-polling-vs-websockets-tradeoffs](../05-webhooks-vs-polling-vs-websockets-tradeoffs/README.md)
— you now know gRPC and GraphQL in depth. The next module is deliberately short:
a decision framework for choosing between gRPC, GraphQL, REST, and the
event/real-time options (webhooks, WebSockets, polling) for a given consumer —
cross-referencing track 06 rather than re-teaching the real-time mechanics.
