# Module 08: Capstone Project

## Why this matters

Every module in this track has been building toward one picture. Module 00 drew
it: a mature system is multi-paradigm, and the recurring miniature of that end
state is **an internal gRPC service with a GraphQL BFF in front of it for a web
client**. You learned to define and call gRPC services (modules 01–02), to build
an N+1-safe, paginated, authorized GraphQL API (modules 03–04), to choose update
mechanisms (module 05) and edge components (module 06), and to make several
paradigms coexist and evolve without forking your domain (module 07). This
capstone is where you assemble that knowledge into something that runs.

The point isn't to build something large — it's to feel the **seam** where two
paradigms meet. The BFF speaks GraphQL to the web client on the outside and gRPC
to your service on the inside; it's the translation layer from module 06, the
place over-/under-fetch gets resolved (module 00) and where internal shapes are
mapped to stable external ones (module 07). Building this end to end forces every
concept to become concrete: a `.proto` contract, generated stubs, a resolver that
calls a gRPC stub, a DataLoader that batches those calls, a schema the client
queries by picking fields. If you can build this, you can reason about — and
build — the real thing.

Keep the whole track's discipline as you go: don't gold-plate. This is
deliberately *one* service and *one* BFF. No federation, no gateway, no
subscriptions unless a requirement genuinely calls for one — add complexity only
where a concrete requirement below demands it (module 00).

## The project

Build a small **catalog** system in the multi-paradigm shape: an internal gRPC
`catalog-service` that owns the data, and a **GraphQL BFF** in front of it that a
web client queries. Pick any simple domain you like (books, products, movies —
the examples throughout the track used books/orders); the shape matters, not the
subject.

The system has two related types so the BFF has something to aggregate and a real
N+1 risk to defend against — e.g. **`Product`** and its **`Supplier`** (each
product has one supplier; a supplier has many products).

```text
  web client                GraphQL BFF (owns NO data)          internal service
  ──────────                ──────────────────────────         ─────────────────
  query {                   product/products resolvers  ── gRPC GetProduct/ListProducts ─►
    products(first:20){ ──► maps gRPC msgs -> GraphQL types                       catalog-
      node{ name             per-request DataLoader                               service
            supplier{name}}} batches supplier ids  ────── gRPC BatchGetSuppliers ─►  (data)
  }                         (one query, TWO RPCs, no N+1)  ◄──────────────────────
      GraphQL over HTTP  │  the SEAM: GraphQL outside, gRPC inside  │  Protobuf/HTTP2
```

Work in this order (it mirrors the track): define the gRPC contract, implement
the service, then build the GraphQL BFF that calls it, then harden the BFF. Use
Strawberry + FastAPI for the BFF and `grpcio`/`grpcio-tools` for the service, all
running locally (Docker or two processes).

### Acceptance checklist

Your system is done when all of these hold:

**The internal gRPC service**

- [ ] A `.proto` file defines a `CatalogService` with at least: `GetProduct`,
      `ListProducts` (with pagination — a page size and a cursor/token), and
      `GetSupplier` / `BatchGetSuppliers` (a method that takes *many* supplier
      ids and returns them — this is what makes BFF-side batching possible).
- [ ] Python stubs are generated from the `.proto` with `grpcio-tools`, and the
      service implements every method.
- [ ] `ListProducts` enforces a **server-side page-size cap** (never trust a
      client-supplied limit).
- [ ] Domain errors map to correct **gRPC status codes** (unknown id →
      `NOT_FOUND`, bad argument → `INVALID_ARGUMENT`).
- [ ] Business rules (validation) live in the service, not smeared into the
      transport handler.

**The GraphQL BFF**

- [ ] A Strawberry schema exposes `product(id)`, a paginated `products(...)`
      **connection** (Relay-style `edges`/`node`/`cursor`/`pageInfo`), and lets a
      client select a product *and* its `supplier` in one query.
- [ ] Every resolver calls the gRPC service via a stub — the BFF owns **no**
      database; it aggregates and shapes what the service returns.
- [ ] The BFF maps internal gRPC message shapes to **client-facing GraphQL
      types** (don't expose raw generated messages — the module-07 boundary).
- [ ] A query selecting `supplier` across a page of products does **not** trigger
      N+1: a **per-request DataLoader** batches the supplier ids into one
      `BatchGetSuppliers` gRPC call.
- [ ] The `products` connection **caps `first`** server-side, and the cap is
      honored end to end (BFF cap and service cap both hold).
- [ ] A gRPC `NOT_FOUND` from the service surfaces to the client as a sensible
      GraphQL error (not a 500 / raw stack trace).

**System-level**

- [ ] The gRPC contract and the GraphQL schema are **separate contracts** — you
      can rename an internal gRPC field and, because the BFF maps shapes, the
      GraphQL client contract is unaffected (demonstrate this).
- [ ] A short `README` documents which paradigm serves which consumer and why
      (the module-07 orientation doc, in miniature).
- [ ] The web client (or a GraphiQL session standing in for it) fetches a
      products page *and* each product's supplier name in **one** query with **two**
      data-source round trips total (one products call + one batched suppliers
      call), proving the BFF collapsed the fan-out.

### Hints

- **Start at the contract.** Write the `.proto` first and generate stubs before
  writing any resolver — the schema-first discipline from modules 01–02. The
  `BatchGetSuppliers` method exists *specifically* so the DataLoader has a batch
  endpoint to call; design it in from the start.
- **The DataLoader batches gRPC calls, not SQL.** This is module 03's N+1 defense
  pointed at a different data source: the loader's batch function takes a list of
  supplier ids and issues one `BatchGetSuppliers` RPC. Keep it **per-request** (in
  `context_getter`), or you'll leak data across requests (module 03).
- **The BFF is a translation layer, not a database.** Every resolver ends in a
  gRPC call. If you find yourself adding a DB to the BFF, step back — the service
  owns the data; the BFF shapes it (module 06).
- **Map errors at the seam.** Catch gRPC errors in resolvers and translate status
  codes to GraphQL errors (`NOT_FOUND` → a clean "not found" error), exactly as
  module 07's adapter pattern showed — one domain error, faithfully translated per
  paradigm.
- **Prove the wins, don't assume them.** Log the gRPC calls. A products-page query
  selecting supplier should show exactly two RPCs — if you see one-per-product,
  your DataLoader isn't wired into the resolver. Request `first: 100000` and
  confirm the cap holds.
- **Resist scope creep.** No gateway (one service, one client), no federation (one
  team owns the whole graph), no subscriptions unless you *add* a live requirement
  — each would be premature complexity here (module 00). If you want a stretch
  goal, add a `productAdded` subscription (module 04) *and* justify it, or add a
  second gRPC service and aggregate both in the BFF.

## Further reading & sources

- [gRPC Python — Basics tutorial](https://grpc.io/docs/languages/python/basics/) - the end-to-end reference for the `.proto` contract, generated stubs, and service implementation the capstone's internal service is built on.
- [Strawberry — GraphQL over FastAPI](https://strawberry.rocks/docs/integrations/fastapi) - mounting the GraphQL BFF as a FastAPI route with a per-request context for loaders.
- [Strawberry — DataLoaders guide](https://strawberry.rocks/docs/guides/dataloaders) - the per-request batching pattern that turns the products-plus-supplier query into two RPCs instead of N+1.
- [Relay — GraphQL Cursor Connections specification](https://relay.dev/graphql/connections.htm) - the `edges`/`node`/`cursor`/`pageInfo` shape required by the paginated `products` connection.
- [Sam Newman — Backends For Frontends pattern](https://samnewman.io/patterns/architectural/bff/) - the BFF role the GraphQL layer plays as the translation seam in front of the gRPC service.
- [Martin Fowler — Ports and Adapters (Hexagonal Architecture)](https://martinfowler.com/bliki/HexagonalArchitecture.html) - the "one domain, many adapters" discipline that keeps business rules in the service, not the BFF.

## Next

You've reached the end of **track 11 — Advanced API Paradigms**. You can now look
at any consumer and choose a paradigm deliberately (REST, gRPC, GraphQL, or
events), build each one, choose how to keep consumers updated, place the right
edge components in front, make them coexist and evolve without breaking, and — as
of this capstone — assemble the canonical internal-gRPC-plus-GraphQL-BFF shape
end to end.

From here, the natural next step is **track 12 — Testing and Code Quality**, a
shift from *designing and exposing* APIs to *proving they work*: unit,
integration, and end-to-end tests with real TDD discipline, CI automation, and
objective code-quality measurement. The multi-paradigm system you just built — a
gRPC service behind a GraphQL BFF, with contracts that must evolve without
breaking — is exactly the kind of surface that testing discipline exists to keep
honest as it grows.

[12-testing-and-code-quality](../../12-testing-and-code-quality/README.md) — start the next track.

Back to the track index: [../README.md](../README.md) · Master index:
[../../README.md](../../README.md)
