# Module 03: GraphQL Fundamentals

## Why this matters

Modules 01–02 covered the RPC-style edge — fast, typed, internal. This module
turns to the other major alternative to REST, and the one that most directly
targets REST's over-/under-fetching pain from module 00: **GraphQL**. Where REST
exposes many endpoints each returning a fixed shape, GraphQL exposes *one*
endpoint and a *typed schema*, and lets the **client** ask for exactly the
fields and relationships it wants — no more, no less — in a single request. The
mobile home screen that needed four REST round trips becomes one query. The
`/screens/*` aggregation-endpoint sprawl from module 00's diagnose-and-fix
collapses into resolvers over a shared schema.

The trade you're making is worth naming up front. GraphQL moves power to the
client (great for frontend teams with varied, evolving needs) and gives you a
strongly typed, introspectable, self-documenting schema. In exchange, you give
up a lot of what made REST operationally cheap: HTTP caching mostly stops
working (everything is a `POST` to one URL), and you inherit a brand-new failure
mode — the **N+1 query problem** — that will quietly melt your database if you
don't defend against it with a **DataLoader**. Understanding N+1 and DataLoader
isn't advanced trivia; it's the price of admission for running GraphQL without
an outage.

You'll build this in Python with **Strawberry**, a modern, type-hint-based
GraphQL library that pairs naturally with FastAPI (Ariadne is a fine schema-first
alternative; the concepts transfer). This is fundamentals: schema, types,
queries, mutations, resolvers, and the N+1/DataLoader defense. Subscriptions,
pagination, authorization, and federation are module 04. This module also closes
with the track's first **cumulative review** across modules 00–03.

## Concepts

### The schema and the type system

GraphQL is **schema-first in spirit**: the schema is a typed contract describing
every type, field, and operation the API offers. It's written in the **Schema
Definition Language (SDL)** — a compact, language-neutral notation:

```graphql
type Author {
  id: ID!
  name: String!
  books: [Book!]!        # a non-null list of non-null Books
}

type Book {
  id: ID!
  title: String!
  author: Author!        # the graph: Book points back to Author
}

type Query {             # the read entry points
  book(id: ID!): Book
  books: [Book!]!
}
```

Key pieces of the type system:

- **Object types** (`Author`, `Book`) — the nouns, each with typed fields.
- **Scalars** — `Int`, `Float`, `String`, `Boolean`, `ID` (plus custom scalars
  like `DateTime`).
- **Non-null (`!`) and lists (`[]`).** `String!` is required; `[Book!]!` is a
  required list of required Books. Nullability is part of the contract — unlike
  REST/JSON where everything is implicitly nullable.
- **`Query`, `Mutation`, `Subscription`** — three special "root" types that are
  the entry points for reads, writes, and streams respectively.

Because the schema is fully typed and *introspectable*, tools (GraphiQL, Apollo
Studio) give you auto-complete, in-browser docs, and validation for free — the
GraphQL analog of the OpenAPI payoff from track 02, module 09.

### Queries: the client picks the shape

A **query** is the client declaring exactly what it wants. The response mirrors
the query's shape, field for field:

```graphql
query {
  book(id: "1") {
    title
    author {
      name          # follow the graph edge in the SAME request
    }
  }
}
```

```json
{ "data": { "book": { "title": "Dune", "author": { "name": "Herbert" } } } }
```

This is the whole value proposition: the client got the book's title and its
author's name — and *nothing else* — in one round trip, without the server
defining a bespoke `/books/1?include=author` endpoint. Ask for three fields, get
three fields; traverse a relationship, get the related object inline. No
over-fetch, no under-fetch. Queries can also take **arguments** (`book(id:
"1")`) and use **variables** (`book(id: $id)`) so clients don't string-build
queries.

### Mutations: writes

Reads go through `Query`; every write — create, update, delete — goes through
**`Mutation`**. A mutation looks like a query with arguments, and, importantly,
*it too selects what to return*, so the client can fetch the updated object's
new state in the same call:

```graphql
mutation {
  addBook(title: "Dune", authorId: "1") {
    id
    title
    author { name }     # get back exactly the fields you need post-write
  }
}
```

The convention: `Query` fields are side-effect-free reads; `Mutation` fields
change state. (There's no HTTP-verb enforcement — GraphQL is one `POST` — so the
Query/Mutation split *is* your read/write discipline. Putting a write behind a
`Query` field is a real and common design bug.)

### Resolvers: where fields get their data

A **resolver** is a function that produces the value for a single field. This is
the core execution idea and it trips people up coming from REST: GraphQL doesn't
resolve a whole response in one handler — it resolves the query **field by
field**, calling the resolver for each requested field, walking down the tree.
`book` resolves to a Book; then for that Book the engine calls the `author`
resolver to get its Author; then the `name` resolver on that Author.

In Strawberry, types are Python classes with type hints, and resolvers are
methods/functions:

```python
import strawberry

@strawberry.type
class Author:
    id: strawberry.ID
    name: str

@strawberry.type
class Book:
    id: strawberry.ID
    title: str
    author_id: strawberry.Private[str]   # not exposed in the schema

    @strawberry.field
    def author(self) -> Author:           # a resolver for the 'author' field
        return get_author(self.author_id) # called only if the client asks for it

@strawberry.type
class Query:
    @strawberry.field
    def book(self, id: strawberry.ID) -> Book | None:
        return get_book(id)

    @strawberry.field
    def books(self) -> list[Book]:
        return get_all_books()

schema = strawberry.Schema(query=Query)
```

The crucial mechanical fact: **the `author` resolver runs once per Book that the
query actually reaches.** For a single book, fine. For a list of 100 books each
selecting `author`, that's 100 separate `author` resolver calls — which is
exactly how N+1 is born.

### The N+1 problem

Consider this innocent-looking query:

```graphql
query { books { title author { name } } }
```

The `books` resolver runs **1** query to fetch 100 books. Then, because the
client selected `author` on each, the `author` resolver fires **N = 100** more
times — one DB lookup per book. That's **1 + N = 101 queries** for one request,
most of them fetching authors you'll fetch again and again (many books share an
author). This is the **N+1 query problem**, and it's GraphQL's signature
performance trap: the client-driven, field-by-field execution model makes it
absurdly easy to trigger, and it scales with result-set size, so it passes tests
with 3 rows and falls over in production with 3,000.

REST rarely hits this because a `/books?include=author` endpoint is written *by
a human* who naturally writes one JOIN. GraphQL's resolver-per-field model has
no such human in the loop — the framework calls `author` 100 times unless you
intervene.

### DataLoader: the fix

A **DataLoader** solves N+1 by **batching and caching** resolver calls within a
single request. Instead of each `author` resolver hitting the DB immediately, it
registers "I need author X" with a loader; the loader collects all the requested
keys during that tick, then issues **one** batched query (`SELECT * FROM authors
WHERE id IN (...)`) and hands each resolver its result. It also caches per key
within the request, so asking for author `5` twice hits the DB once.

```python
from strawberry.dataloader import DataLoader

async def load_authors(keys: list[str]) -> list[Author]:
    # ONE query for all requested author ids, returned in key order
    rows = await db.fetch_authors_by_ids(keys)
    by_id = {r.id: r for r in rows}
    return [by_id.get(k) for k in keys]      # must return one item per key, in order

author_loader = DataLoader(load_fn=load_authors)

@strawberry.type
class Book:
    id: strawberry.ID
    title: str
    author_id: strawberry.Private[str]

    @strawberry.field
    async def author(self) -> Author:
        return await author_loader.load(self.author_id)   # batched, not immediate
```

```text
  { books { title author { name } } }  over 100 books
  WITHOUT DataLoader (N+1)              WITH DataLoader (batched)
    books ─► 1 query -> 100 books        books ─► 1 query -> 100 books
    author(b1) ─► SELECT author 1        author(b1) ─► loader.load(1) ┐
    author(b2) ─► SELECT author 2        author(b2) ─► loader.load(2) ├─ collected
      ... 100 separate lookups ...         ...       loader.load(k)  ┘  this tick
    author(b100) ─► SELECT author 100    one batch ─► WHERE id IN (1,2,..) 
    = 1 + 100 = 101 queries              = 1 + 1 = 2 queries
```

Now the 100-book query runs **2** queries — one for books, one batched query for
all their authors — instead of 101. Two rules that matter: the `load_fn` must
return **exactly one result per input key, in the same order** (or `None`), and
the loader must be **scoped to one request** (a fresh loader per request, held in
the GraphQL context) so its cache doesn't leak stale data between users. Getting
those wrong is the subject of this module's diagnose-and-fix.

### Serving GraphQL from FastAPI

Strawberry mounts as a single route on your existing FastAPI app — one endpoint,
all operations:

```python
from fastapi import FastAPI
from strawberry.fastapi import GraphQLRouter

async def get_context():
    # fresh per-request loaders live here (see module 04 for auth in context)
    return {"author_loader": DataLoader(load_fn=load_authors)}

graphql_app = GraphQLRouter(schema, context_getter=get_context)
app = FastAPI()
app.include_router(graphql_app, prefix="/graphql")
```

Visit `/graphql` for the in-browser GraphiQL explorer (schema docs +
auto-complete, the OpenAPI-`/docs` analog). Note the shape: GraphQL doesn't
replace FastAPI here — it's *one route on it*. That's exactly the BFF pattern
module 06 formalizes.

## Command reference

| Item | Purpose | Example |
|---|---|---|
| SDL `type X { field: T }` | Define an object type | `type Book { title: String! }` |
| `!` / `[T!]!` | Non-null / list-of-non-null | `books: [Book!]!` |
| `type Query` | Read entry points | `book(id: ID!): Book` |
| `type Mutation` | Write entry points | `addBook(...): Book` |
| `@strawberry.type` | Python class → GraphQL type | on a class |
| `@strawberry.field` | Mark a resolver | method/function |
| `strawberry.ID` / `strawberry.Private[T]` | ID scalar / hidden field | not in schema |
| `strawberry.Schema(query=, mutation=)` | Build the schema | root wiring |
| `DataLoader(load_fn=...)` | Batch+cache resolver loads | fixes N+1 |
| `.load(key)` | Enqueue a key for batched load | `await loader.load(id)` |
| `GraphQLRouter(schema, context_getter=)` | Mount on FastAPI | one `/graphql` route |
| GraphiQL (`/graphql` in browser) | Interactive explorer + docs | `/docs` analog |

A mutation with variables (how clients really send writes — never string-built):

```graphql
mutation AddBook($title: String!, $authorId: ID!) {
  addBook(title: $title, authorId: $authorId) { id title }
}
# variables: { "title": "Dune", "authorId": "1" }
```

The Strawberry mutation resolver:

```python
@strawberry.type
class Mutation:
    @strawberry.mutation
    def add_book(self, title: str, author_id: strawberry.ID) -> Book:
        return create_book(title=title, author_id=author_id)

schema = strawberry.Schema(query=Query, mutation=Mutation)
```

## Hands-on exercises

Create a `graphql-books/` project. `pip install "strawberry-graphql[fastapi]"
uvicorn`. Back it with an in-memory dict of authors and books to start (you can
swap in a real DB later). Run with `uvicorn app:app --reload` and open
`/graphql`.

### 1. Define the schema

Model `Author` (`id`, `name`) and `Book` (`id`, `title`, `author`), plus a
`Query` with `book(id)` and `books`. Run the app and open `/graphql`. Expected:
the GraphiQL explorer shows your types and the two query fields, with docs and
auto-complete — no hand-written documentation.

### 2. Your first client-shaped query

In GraphiQL, run `{ books { title } }`, then `{ book(id: "1") { title author {
name } } }`. Expected: the first returns only titles; the second returns a
title and the nested author name — the response shape mirrors your query
exactly.

### 3. Prove over-/under-fetching is gone

Write one query that returns, for `book(id: "1")`: just the title. Then one that
returns title + author name. Note that you changed the response shape with zero
backend changes. Expected: two different response shapes from the same schema
and endpoint — the module-00 pain, solved.

### 4. Add a mutation

Add a `Mutation` with `add_book(title, author_id) -> Book`. Call it from
GraphiQL using variables, selecting `id` and `title` back. Expected: the book is
created and the mutation returns exactly the fields you selected; `{ books }`
now includes it.

### 5. Trigger N+1 and see it

Make the `author` resolver log a line (`print("author query", self.author_id)`)
every time it hits your data source. Seed 10 books across 2 authors. Run `{
books { title author { name } } }`. Count the log lines. Expected: 10 author
lookups for 10 books (plus the 1 books query) — 11 operations, N+1 in the flesh,
even though there are only 2 distinct authors.

### 6. Fix it with a DataLoader

Add a `DataLoader` whose `load_fn` fetches all requested authors in one batched
call, wire it into the GraphQL context (`context_getter`), and have the `author`
resolver `await loader.load(self.author_id)`. Re-run the query and re-count.
Expected: exactly **1** batched author load regardless of book count — 2
operations total. The `load_fn` returns one author per key, in key order.

### 7. Per-request loader scoping

Confirm your loader is created fresh in `get_context` per request (not a module
global). Then reason about what would break if it were a global: run a query,
mutate an author's name, run again. Expected (with correct scoping): the second
query reflects the change; you can articulate that a global loader's cache would
serve stale data across requests/users.

### 8. Read/write discipline check

Deliberately add a field to `Query` that creates a book (a write behind a read).
Explain in a comment why this is a design bug even though it "works," then move
it to `Mutation`. Expected: you can state that `Query` must be side-effect-free
and that GraphQL's one-`POST` model makes the Query/Mutation split your only
read/write signal.

### 9. Diagnose and fix

This DataLoader was added to fix N+1 but makes the results *wrong* and still
leaks across requests. Find every bug.

```python
# module-level, created once at import time
author_loader = DataLoader(load_fn=load_authors)          # (A)

async def load_authors(keys: list[str]) -> list[Author]:
    rows = await db.fetch_authors_by_ids(keys)            # returns only FOUND authors
    return [Author(id=r.id, name=r.name) for r in rows]   # (B)

async def get_context():
    return {}                                             # (C) loader not in context
```

<details>
<summary>Solution</summary>

1. **(B) wrong length / wrong order.** A DataLoader's `load_fn` **must return
   exactly one item per input key, in the same order** (using `None` for
   misses). Returning "only the rows the DB found" means the output list is
   shorter and misaligned — resolver for key `k1` may receive key `k3`'s author,
   or an index error. Build a `{id: author}` map and return `[by_id.get(k) for k
   in keys]`.
2. **(A)/(C) module-global loader, not per request.** A loader created once at
   import time shares its per-request cache across *all* requests and users
   forever — so an author's name updated by one request is served stale to
   everyone, and unrelated users' data can bleed together. Create a **fresh
   loader per request** inside `get_context` and read it from
   `info.context["author_loader"]` in the resolver.

```python
async def load_authors(keys: list[str]) -> list[Author]:
    rows = await db.fetch_authors_by_ids(keys)
    by_id = {r.id: Author(id=r.id, name=r.name) for r in rows}
    return [by_id.get(k) for k in keys]          # one per key, in order, None on miss

async def get_context():
    return {"author_loader": DataLoader(load_fn=load_authors)}   # fresh each request
```

Lesson: DataLoader's two invariants — *one result per key in order* and *scoped
to a single request* — are exactly what make it correct; violating either turns
an optimization into a correctness bug.

</details>

## Independent challenge

No code given. In **module 00** you diagnosed a team drowning in `/screens/*`
REST aggregation endpoints and prescribed GraphQL. Build the core of that fix:
model a small blog domain — `User`, `Post`, `Comment` (a `Post` has an author
`User` and a list of `Comment`s; each `Comment` has an author `User`) — as a
Strawberry schema over an in-memory store. Expose a `Query` with
`post(id)`/`posts`, and a `Mutation` `addComment(postId, authorId, body)`.
Then satisfy a "post detail screen" with **one** query returning the post, its
author's name, and each comment with its author's name — and make sure that
query triggers **no N+1**: the users referenced by the post and all its comments
must load in a single batched call. Verify by logging your data-source hits.

<details>
<summary>Hint</summary>

There are two edges that both point at `User` (a post's author, and each
comment's author), so both the `Post.author` resolver and the `Comment.author`
resolver should go through the **same per-request `user_loader`** — that shared
loader is what collapses "post author + all comment authors" into one batched
`WHERE id IN (...)`. Put the loader in `get_context` (fresh per request, per this
module's scoping rule) and read it from the resolver's `info.context`. Keep
`addComment` on `Mutation`, and remember the `load_fn` must return one user per
key, in order.

</details>

## Common mistakes & troubleshooting

- **Ignoring N+1 until production.** It passes tests with a handful of rows and
  collapses at scale. Assume any resolver that fetches a related object per
  parent is N+1 and needs a DataLoader.
- **A DataLoader `load_fn` that doesn't return one-result-per-key-in-order.**
  This misaligns results silently. Build a key→value map and index it by the
  input keys, using `None` for misses.
- **A module-global (not per-request) DataLoader.** Its cache leaks stale and
  cross-user data. Create it fresh in `context_getter` for every request.
- **Writes behind `Query` fields.** `Query` must be side-effect-free; put every
  create/update/delete under `Mutation`. GraphQL won't stop you — the discipline
  is yours.
- **Expecting HTTP caching to work.** GraphQL is one `POST` to one URL, so
  URL/verb-based HTTP caching and CDNs mostly don't apply — a real cost versus
  REST you should weigh (and mitigate with persisted queries / response caching).
- **Over-nesting / unbounded queries.** A client can request deeply nested,
  expensive graphs. Fundamentals here; module 04 covers depth/complexity limits
  and pagination as the real defense.
- **Leaking internal fields into the schema.** Only fields you declare on the
  type are exposed; use `strawberry.Private[...]` for internal-only data (like a
  foreign key) so it never appears in the schema — the GraphQL analog of `*Out`
  redaction from track 02.
- **Forgetting nullability is part of the contract.** `String` vs `String!` is a
  real API decision; sloppy nullability makes clients defensive. Be deliberate.

## Checkpoint quiz

Write down your answer to each question before expanding it — checking without attempting first is the single easiest way to fool yourself into thinking you've learned this.

1. In GraphQL, who decides the response shape, and how is that different from
   REST?
2. What are the three root types, and what does each govern?
3. What is a resolver, and why does "resolvers run field by field, once per
   parent object reached" set up the N+1 problem?
4. Walk through exactly how the query `{ books { author { name } } }` produces
   1 + N queries against 100 books.
5. How does a DataLoader eliminate N+1, and what are its two hard invariants?
6. Why must a DataLoader be created fresh per request rather than once at
   import?
7. Name one major operational thing you *lose* moving from REST to GraphQL, and
   why.

<details>
<summary>Answers</summary>

1. The **client** decides — it sends a query naming exactly the fields and
   nested relations it wants, and the response mirrors that shape. In REST the
   **server** decides each endpoint's fixed representation, so clients over- or
   under-fetch.
2. `Query` (side-effect-free reads / entry points), `Mutation` (writes: create/
   update/delete), and `Subscription` (server-pushed streams of updates —
   module 04). Since GraphQL is one `POST`, the Query/Mutation split *is* the
   read/write contract.
3. A resolver is a function that produces the value for a single field. Because
   the engine resolves the query tree field by field, a resolver for a related
   field (e.g. `author`) runs **once for every parent object reached** (once per
   book). Fetching the related object inside that resolver therefore fires one
   query per parent — the setup for N+1.
4. The `books` resolver runs **1** query returning 100 books. The client
   selected `author` on each, so the `author` resolver fires **100** times, each
   doing its own author lookup → **1 + 100 = 101** queries, many redundant since
   authors repeat.
5. It **batches** all the keys requested during a tick into one query (`WHERE id
   IN (...)`) and **caches** per key within the request, so the 100-book query
   does 2 queries instead of 101. Invariants: the `load_fn` must return **one
   result per input key in the same order** (None for misses), and the loader
   must be **scoped to a single request**.
6. Its per-request cache is meant to dedupe within one request only. A global
   loader would keep that cache across all requests and users, serving stale
   data after a mutation and bleeding one user's cached data into another's
   request.
7. HTTP caching / CDN cacheability (and simple `curl`-style debugging).
   Everything is a `POST` to one URL, so URL+verb-based caching no longer
   applies; you must add response caching / persisted queries to recover any of
   it. (Also acceptable: you take on the N+1 failure mode.)

</details>

## Cumulative review

Closed-book. Don't reopen modules 00–03 while attempting these — the point is to
find out what actually stuck across "when to leave REST," gRPC, and GraphQL.

1. A new requirement lands: an internal `fraud-service` will be called
   synchronously by `payments-service` ~8,000×/sec, and a customer-facing web +
   mobile app needs a "my account" screen aggregating profile, recent
   transactions, and saved cards. Assign a paradigm to each edge and justify
   each against the module-00 decision framework.
2. Explain why renumbering a Protobuf field (module 01) and changing a resolver
   to a write-behind-`Query` (module 03) are *both* silent contract bugs — the
   thing that makes each dangerous is the same category of problem. Name it.
3. Give the gRPC status code and the reason for each: unknown order id; a
   non-positive quantity; the server is mid-restart. Then say which of the three
   is safe to retry and why (modules 01–02).
4. Compare how REST, gRPC unary, and a GraphQL query each handle "get a book and
   its author's name." Which needs the most round trips in the naive case, which
   is the most typed on the wire, and which is most prone to N+1?
5. You have a server-streaming gRPC `WatchStock` and a GraphQL query over 500
   products each selecting `supplier`. Name the specific failure each is prone to
   (streaming vs N+1) and the specific defense for each (modules 02–03).
6. Interceptors (module 02) and DataLoaders (module 03) both "wrap" resolver/
   handler execution but solve different problems. State what each is for, and
   why a DataLoader must be per-request while a logging interceptor can be a
   singleton.
7. A team exposes a public partner API in gRPC and a GraphQL endpoint for
   third-party integrators, and puts their two internal services behind REST.
   Critique each of the three choices against module 00's guidance and propose
   the corrected assignment.
8. Trace what happens end to end when a GraphQL client sends `{ books { title
   author { name } } }` against a Strawberry server *with* a correctly scoped
   `author` DataLoader: which resolvers run how many times, how many data-source
   round trips occur, and why (modules 03).

<details>
<summary>Answers</summary>

1. `payments → fraud`: **gRPC** — internal, extreme throughput, low latency,
   typed stubs (framework Q1 internal + Q4 performance). The "my account"
   screen: a **GraphQL BFF** — own frontend(s), rich/variable relational data,
   collapses multi-source aggregation into one query and serves web + mobile
   with different shapes (Q1 own frontend + Q3 variable data shape). No public
   third party here, so no REST edge is forced.
2. Both are changes that keep the code *compiling and running* while silently
   breaking the **contract**. Renumbering a Protobuf field changes the wire tag,
   so peers misread data with no error; moving/allowing a write behind `Query`
   violates the read-only contract clients rely on (caching, safety) with no
   enforcement. The category: an unenforced-contract change that fails silently
   rather than loudly.
3. Unknown order id → `NOT_FOUND` (the resource doesn't exist). Non-positive
   quantity → `INVALID_ARGUMENT` (caller sent bad input). Server mid-restart →
   `UNAVAILABLE` (transient). Only `UNAVAILABLE` is safe to retry — it's
   transient and the same request may succeed shortly; the other two are
   permanent (the request itself is wrong / the thing isn't there), so retrying
   changes nothing.
4. Naive round trips: **REST** needs the most (book, then a second call for the
   author, unless you built an `?include`). **gRPC unary** is the most typed on
   the wire (binary Protobuf with a compiled schema; a wrong-typed field can't be
   sent). **GraphQL** does it in one round trip but is the most prone to
   **N+1** (the `author` resolver fires per book unless batched).
5. `WatchStock` risks a **leaked stream** — the server keeps producing after the
   client disconnects; defense: check `context.is_active()` and bound/exit the
   loop. The 500-product query risks **N+1** — 500 `supplier` lookups; defense:
   a per-request **DataLoader** batching all supplier ids into one query.
6. An **interceptor** handles cross-cutting concerns (auth, logging, metrics)
   around every RPC — it's stateless with respect to a given request's data, so
   one shared instance is fine. A **DataLoader** batches/caches data loads
   *within one request*; its cache is request-scoped by design, so a singleton
   would leak stale/cross-user data — it must be created per request.
7. All three are backwards. Public partners should get **REST** (universal,
   cacheable, low integration cost), not gRPC (steep external toolchain) and not
   an open GraphQL endpoint to untrusted integrators (complexity/abuse surface).
   The two internal services should talk **gRPC** (typed, fast), not REST.
   Corrected: partner-facing → REST; internal service-to-service → gRPC; (and if
   a rich first-party frontend exists, a GraphQL BFF for *it*, not for arbitrary
   third parties).
8. `books` resolver runs **once** (1 data-source call → 100 books). The `author`
   field resolver runs **once per book** (100 times) — but each call only
   `.load(author_id)`s into the DataLoader rather than hitting the source; the
   loader batches all requested author ids into **one** query and caches
   duplicates. Total data-source round trips: **2** (books + one batched
   authors), because the DataLoader collapses the 100 loads into a single keyed
   fetch.

</details>

## Further reading & sources

- [GraphQL — Learn (official docs)](https://graphql.org/learn/) - the canonical introduction to the schema, type system, queries, and mutations this module builds on.
- [Strawberry GraphQL — documentation](https://strawberry.rocks/docs) - the reference for the type-hint-based schema, resolvers, and FastAPI integration used in the exercises.
- [Strawberry — DataLoaders guide](https://strawberry.rocks/docs/guides/dataloaders) - shows the exact per-request DataLoader wiring that defends against N+1.
- [graphql/dataloader (GitHub)](https://github.com/graphql/dataloader) - the original DataLoader project and README that defines the batch-and-cache pattern and its one-result-per-key invariant.
- [Apollo — Understanding the N+1 problem](https://www.apollographql.com/docs/technotes/TN0021-graph-fundamentals/) - a clear writeup of why resolver-per-field execution causes N+1 and how batching fixes it.
- [GraphQL — Best practices: caching](https://graphql.org/learn/caching/) - explains why URL-based HTTP caching stops working and what to do instead, the operational cost this module flags.

## Next

[04-graphql-advanced-patterns](../04-graphql-advanced-patterns/README.md) — with
the schema/resolver/N+1 fundamentals solid, next you'll handle what production
GraphQL actually needs: subscriptions for live updates, cursor-based
(Relay-style) pagination, authorization inside resolvers, and the concept of
schema stitching and federation for composing schemas across teams.
