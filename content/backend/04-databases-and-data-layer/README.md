# 04 - Databases and the Data Layer

This track goes deep on the layer *beneath* the business logic you built in
track 02 — where your application's state actually lives. Track 02 gave you
validated handlers, middleware, and a clean service/repository split, but the
repository was a fake in-memory `dict` so you could learn layering without
database noise. Here the fake goes away: you design real schemas, write correct
concurrent transactions, use an ORM properly, and reason about how a data layer
scales — all against a real PostgreSQL instance you run yourself in Docker.

## How this track works

- It assumes you finished **[02-api-layer-and-request-handling](../02-api-layer-and-request-handling/README.md)**:
  you're comfortable with validation, middleware, and the handler → service →
  repository layering. This track slots a real database in behind that
  repository and revisits the layering in module 06 with the data layer made
  concrete.
- Everything uses **PostgreSQL + Python** (SQLAlchemy 2.x, Alembic, `psycopg`).
  Every module shows **real SQL alongside the Python/ORM code**, because you
  can't reason about what an ORM does until you know the SQL it generates.
- You run Postgres yourself with **Docker** — the skill you already have from
  the [`../../learn/`](../../learn/README.md) curriculum. Modules give you real
  `docker run` / `docker-compose` snippets to stand up (and throw away) a
  database for the exercises.
- Every module has the same shape: why it matters, concepts, a command/code
  reference, **hands-on exercises** (do them against a live Postgres — don't just
  read), an independent challenge with no code given, common mistakes, and a
  gated checkpoint quiz. Two **cumulative reviews** (after modules 03 and 06)
  mix everything so far.
- Go in order. The track is layered: ACID and CAP frame the guarantees; joins
  and schema/indexing give you the raw material; transactions, ORMs, and
  architecture make it correct and maintainable; optimization and
  replication/sharding make it fast and scalable — each module assumes the ones
  before it.

## Modules

| # | Module | What you'll be able to do | Time |
|---|--------|---------------------------|------|
| 00 | [Relational vs non-relational](00-relational-vs-non-relational/README.md) | Choose the right database family (relational, document, key-value, wide-column) for an access pattern, and justify polyglot persistence | 60-90 min |
| 01 | [ACID and the CAP theorem](01-acid-and-cap-theorem/README.md) | State each ACID guarantee and the corruption you get without it, and correctly reason about CP-vs-AP trade-offs | 60-90 min |
| 02 | [Querying and joins](02-querying-and-joins/README.md) | Write precise SQL, pick the correct join type every time, and choose between subqueries, joins, and CTEs | 75-120 min |
| 03 | [Schema design and indexing](03-schema-design-and-indexing/README.md) | Normalize to 3NF (and denormalize deliberately), design keys, and choose indexes that speed reads without crippling writes | 90-120 min |
| 04 | [Transactions and concurrency control](04-transactions-and-concurrency-control/README.md) | Pick the right isolation level, prevent lost updates with optimistic/pessimistic locking, and diagnose and avoid deadlocks | 90-120 min |
| 05 | [ORMs and migrations](05-orms-and-migrations/README.md) | Use SQLAlchemy well (and know when to drop to raw SQL), and write safe, reversible Alembic migrations for live production tables | 90-120 min |
| 06 | [Business logic layer and separation of concerns](06-business-logic-layer-and-separation-of-concerns/README.md) | Structure a clean three-layer architecture with the repository pattern, separate domain from database models, and propagate errors correctly | 75-100 min |
| 07 | [Query optimization and connection pooling](07-query-optimization-and-connection-pooling/README.md) | Read `EXPLAIN ANALYZE` plans, kill the N+1 problem, size a connection pool, and cache query results at the data layer | 90-120 min |
| 08 | [Replication and sharding](08-replication-and-sharding/README.md) | Use read replicas and reason about replication lag, choose sharding strategies, and know when you actually need either | 75-100 min |
| 09 | [OLAP and data warehousing](09-olap-and-data-warehousing/README.md) | Explain row vs. column storage, design a star schema, and know why analytics queries don't belong on your OLTP primary | 75-100 min |
| 10 | [Multi-tenancy patterns](10-multi-tenancy-patterns/README.md) | Choose between shared-schema, schema-per-tenant, and database-per-tenant, and enforce isolation with row-level security | 75-100 min |
| 11 | [Capstone project](11-capstone-project/README.md) | Design and build a normalized, indexed, transactionally-correct order/inventory data layer with a real scaling plan | 4-6 hrs |

Start here → [00-relational-vs-non-relational/README.md](00-relational-vs-non-relational/README.md)

Back to the master index: [../README.md](../README.md)

---

Once you've completed this track, the next one is
**[05-caching-and-performance](../05-caching-and-performance/README.md)**, which
builds directly on the data layer you've made correct here — applying the right
caching strategy at the right layer, finding and fixing real performance
bottlenecks, and reasoning about concurrency versus parallelism. Tracks 07
(Elasticsearch) and 10 (distributed systems patterns) also list this track as a
prerequisite.
