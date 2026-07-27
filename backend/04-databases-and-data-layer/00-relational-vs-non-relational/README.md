# Module 00: Relational vs Non-Relational Databases

## Why this matters

In track 02 you built handlers, services, and a repository layer — but the
repository was faked in memory (a Python `dict`). That was deliberate: it let
you learn layering without database noise. Now the fake goes away. Every real
backend eventually persists state, and the very first decision — before a
single table or collection exists — is *what kind of database*. Get this wrong
and you spend the next two years fighting your storage engine: modelling graph
traversals in a key-value store, running analytical scans against a document
DB, or bolting a cache on top of a relational database to paper over a schema
that never should have been relational.

The industry default answer for a transactional backend is "a relational
database, specifically Postgres" — and that's usually correct. But "usually
correct" is not "always correct", and the point of this module is that you can
*justify* the choice instead of cargo-culting it. You'll learn the four broad
families (relational, document, key-value, wide-column), what each is actually
good at, what "schema" means in each, and why serious systems almost always end
up using *more than one* (polyglot persistence). Everything after this module —
ACID, joins, indexing, transactions, replication — is relational-database deep, so
this module is where you earn the right to say "yes, relational is the right
tool here, and here's why."

## Concepts

### The relational model: rows, tables, and relationships

A **relational database** (Postgres, MySQL, SQL Server, Oracle) stores data as
**rows** in **tables**, where every row in a table has the same fixed set of
**columns**, each with a declared type. Tables reference each other through
**keys**: a row in `orders` carries a `customer_id` that points at a row in
`customers`. The database enforces that relationship — you physically cannot
insert an order for a customer that doesn't exist if you've declared the
foreign key. That enforcement, plus a rich query language (SQL) that can
combine tables on the fly with **joins**, is the whole value proposition.

```sql
CREATE TABLE customers (
    id    BIGSERIAL PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    name  TEXT NOT NULL
);

CREATE TABLE orders (
    id          BIGSERIAL PRIMARY KEY,
    customer_id BIGINT NOT NULL REFERENCES customers(id),
    total_cents INTEGER NOT NULL CHECK (total_cents >= 0),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

The schema is **structured and enforced up front**: `email` must be unique,
`total_cents` can't be negative, an order's `customer_id` *must* match a real
customer. The database rejects data that violates these rules regardless of
which application, script, or intern wrote the `INSERT`. This is the relational
model's superpower — the data's integrity rules live in *one* place (the
database), not scattered across every service that writes to it.

### Non-relational family 1: document databases (MongoDB)

A **document database** stores self-contained documents, usually JSON-shaped,
keyed by an id. Instead of splitting an order across `orders` and
`order_items` tables, you store the whole thing as one nested document:

```json
{
  "_id": "order_8842",
  "customer": { "id": "cust_17", "name": "Ada Lovelace" },
  "items": [
    { "sku": "sku-1", "qty": 2, "price_cents": 500 },
    { "sku": "sku-9", "qty": 1, "price_cents": 1200 }
  ],
  "total_cents": 2200,
  "created_at": "2026-07-24T10:00:00Z"
}
```

The schema is **flexible**: different documents in the same collection can have
different fields. Add a `gift_message` field to some orders and not others — no
migration, no `ALTER TABLE`. That flexibility is genuinely useful when the
shape of your data is variable or evolving fast, or when you read a whole
aggregate at once (one query gets the entire order, no join). The cost:
*nothing* enforces that `customer.id` points at a real customer, or that
`total_cents` equals the sum of the items. The application becomes solely
responsible for integrity — the guarantees the relational database gave you for
free are now your code's job, on every write path, forever.

### Non-relational family 2: key-value stores (Redis)

A **key-value store** is the simplest model: a giant dictionary mapping a key
to an opaque value. Redis is the canonical example. You `SET session:abc123
{...}` and `GET session:abc123`. There are no tables, no joins, no query
language to speak of — you look things up *by key* and that's the fast path.
What you get in return is extreme speed (Redis lives in memory) and simple
horizontal scaling. What you give up is any ability to query by value ("find
all sessions for user 17" is not a thing you do cheaply). Key-value stores
shine as **caches**, **session stores**, **rate-limiter counters**, and
**queues** — supporting roles, not usually the system of record. (Track 05 is
entirely about caching, and Redis is the star there.)

### Non-relational family 3: wide-column stores (Cassandra)

A **wide-column store** (Cassandra, ScyllaDB, HBase, and conceptually Google
Bigtable / DynamoDB) looks table-ish but is built for a different goal: massive
write throughput and horizontal scale across many machines, with no single
point of failure. The critical mental shift is **you design the table around
the query, not around the data**. In Cassandra you decide your access pattern
first ("read all events for a device, most recent first"), then build a table
whose partition key and clustering columns make exactly that query a single,
fast, single-node lookup. Joins don't exist. Ad-hoc queries don't exist. If you
later need a *different* access pattern, you build a *second* table holding the
same data arranged differently, and keep both in sync yourself. This is a
deliberate trade: you sacrifice query flexibility and normalization to get
linear write scaling and availability across a globally distributed cluster.
Wide-column is right for things like time-series/event data, activity feeds,
and IoT telemetry at a scale where a single Postgres box genuinely can't keep
up on writes.

### Structured vs flexible schemas — the real trade

The "SQL vs NoSQL" debate is mostly a **schema** debate. It's tempting to hear
"flexible schema" and think "flexible = better, rigid = legacy." That's
backwards. A schema is a *contract*. A relational database enforces the
contract at write time: bad data is rejected at the door. A schemaless store
enforces nothing, which means the contract still exists — it's just now
implicit, undocumented, and re-implemented (inconsistently) in every piece of
code that reads the data. "Schemaless" doesn't remove the schema; it moves it
out of the database and into your application's assumptions, where it rots.

The honest framing: rigid schemas cost you up front (you must decide the shape,
and changing it means a migration) and pay you back forever (the DB guarantees
integrity, and any tool can understand the data). Flexible schemas pay you up
front (move fast, store anything) and bill you later (every reader must defend
against every possible shape, and inconsistency creeps in). For most
transactional backend data — orders, users, payments, inventory — the
integrity guarantee is worth far more than the up-front flexibility, which is
why relational is the default.

### When to use which — and polyglot persistence

There is no universally best database; there's a best database *for a given
access pattern*. A rough decision guide:

- **Relational (Postgres):** the default for structured data with
  relationships and integrity requirements — users, orders, payments,
  anything transactional. Choose this unless you have a specific reason not to.
- **Document (MongoDB):** variable-shaped aggregates you read whole and rarely
  need to join — product catalogs with wildly different attributes per
  category, CMS content, event payloads you store and rarely query across.
- **Key-value (Redis):** caching, sessions, ephemeral counters, rate limiting,
  simple queues — a fast supporting store, not usually the source of truth.
- **Wide-column (Cassandra):** write-heavy, massive-scale, known-access-pattern
  data — telemetry, event logs, feeds — where a single relational node can't
  keep up.

Real systems rarely pick one. A single product might keep users and orders in
**Postgres** (integrity matters), sessions and a hot-item cache in **Redis**
(speed matters), a product catalog with per-category attributes in
**MongoDB** (shape varies), and clickstream events in **Cassandra** (volume is
enormous). Using several stores, each for what it's best at, is called
**polyglot persistence**. The skill isn't memorizing which database is
"best" — it's decomposing a system into access patterns and matching each to
the store whose trade-offs fit. The cost of polyglot persistence is real
(more operational surface, no cross-store joins, more ways for data to drift
out of sync), so the sane default is "start with Postgres for everything, and
peel off a specialized store only when a specific access pattern demands it."

## Command reference

The rest of this track is Postgres-centric, so most of your commands are SQL.
This table pairs the *concept* in each database family with how you'd express
or interact with it.

| Concept | Relational (Postgres/SQL) | Non-relational equivalent |
|---|---|---|
| Create a container for records | `CREATE TABLE orders (...)` | Mongo: `db.createCollection("orders")` (implicit on first insert) |
| Insert a record | `INSERT INTO orders (...) VALUES (...)` | Mongo: `db.orders.insertOne({...})` |
| Read by primary key | `SELECT * FROM orders WHERE id = 8842` | Redis: `GET order:8842` / Mongo: `db.orders.findOne({_id: "order_8842"})` |
| Combine two entities | `SELECT ... FROM orders JOIN customers ...` | No native join — embed the data or join in app code |
| Enforce a relationship | `REFERENCES customers(id)` (foreign key) | Application code only |
| Enforce uniqueness | `UNIQUE (email)` | Mongo: `db.customers.createIndex({email:1},{unique:true})` |
| Enforce a value rule | `CHECK (total_cents >= 0)` | Application code / Mongo JSON Schema validator |

Real SQL you'll run against Postgres in the exercises:

```sql
-- Postgres meta-commands (in the psql shell)
\dt                 -- list tables
\d orders           -- describe the orders table (columns, types, constraints)
\d+ orders          -- same, with more detail (storage, description)

-- Ask the catalog what constraints exist on a table
SELECT conname, contype
FROM   pg_constraint
WHERE  conrelid = 'orders'::regclass;
-- contype: 'p'=primary key, 'f'=foreign key, 'u'=unique, 'c'=check
```

And the equivalent modelled with SQLAlchemy (which you'll use heavily from
module 05 on — shown here just so the mapping is visible early):

```python
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column
from sqlalchemy import ForeignKey, CheckConstraint, text

class Base(DeclarativeBase): ...

class Customer(Base):
    __tablename__ = "customers"
    id:    Mapped[int]  = mapped_column(primary_key=True)
    email: Mapped[str]  = mapped_column(unique=True)
    name:  Mapped[str]

class Order(Base):
    __tablename__ = "orders"
    id:          Mapped[int] = mapped_column(primary_key=True)
    customer_id: Mapped[int] = mapped_column(ForeignKey("customers.id"))
    total_cents: Mapped[int] = mapped_column(CheckConstraint("total_cents >= 0"))
```

## Hands-on exercises

You'll stand up a real Postgres using the Docker knowledge from the `learn/`
curriculum. Everything runs locally, costs nothing, and throws away cleanly.

### 1. Stand up Postgres in Docker

```bash
docker run --name pg-data -e POSTGRES_PASSWORD=devpass \
  -e POSTGRES_DB=shop -p 5432:5432 -d postgres:16
```

Confirm it's up and get a shell inside it:

```bash
docker exec -it pg-data psql -U postgres -d shop
```

Expected: a `shop=#` prompt. Type `SELECT version();` — you should see
`PostgreSQL 16.x`. Leave this psql session open; you'll use it throughout.

### 2. Create a structured, enforced schema

Paste the `customers` and `orders` `CREATE TABLE` statements from the Concepts
section into psql. Then confirm the structure:

```sql
\dt
\d orders
```

Expected: `\dt` lists both tables; `\d orders` shows the columns, the primary
key, the `customer_id` foreign key referencing `customers`, and the
`total_cents >= 0` check constraint.

### 3. Watch the schema enforce integrity (this is the whole point)

```sql
-- succeeds
INSERT INTO customers (email, name) VALUES ('ada@example.com', 'Ada');
INSERT INTO orders (customer_id, total_cents) VALUES (1, 2200);

-- now try to break the rules:
INSERT INTO customers (email, name) VALUES ('ada@example.com', 'Ada Again'); -- duplicate email
INSERT INTO orders (customer_id, total_cents) VALUES (999, 100);             -- no such customer
INSERT INTO orders (customer_id, total_cents) VALUES (1, -50);               -- negative total
```

Expected: the first two succeed; the last three are each **rejected** with a
distinct error — `duplicate key value violates unique constraint`, `violates
foreign key constraint`, and `violates check constraint`. Sit with this: you
did not write a line of application code, and yet three classes of bad data are
impossible. That guarantee is what you're comparing everything else against.

### 4. Model the same order as a document (conceptually)

You don't need MongoDB installed — reason on paper (or in a `.json` file). Take
the order from exercise 3 and write it as a single self-contained JSON document
that embeds the customer name and a list of line items. Then answer, in a
comment: which two integrity rules from exercise 3 would *no longer be
enforced* by the store, and whose job would enforcing them become?

Expected answer: the foreign-key rule (customer must exist) and the check rule
(total non-negative) are no longer enforced by the database — both become the
application's responsibility on every write.

### 5. Use Postgres as a key-value store (and feel why it's the wrong tool)

```sql
CREATE TABLE kv (k TEXT PRIMARY KEY, v JSONB NOT NULL);
INSERT INTO kv VALUES ('session:abc123', '{"user_id": 1, "expires": "2026-07-25"}');
SELECT v FROM kv WHERE k = 'session:abc123';
```

Expected: the JSON comes back. This *works*, but note what you gave up to make
Postgres act like Redis: no in-memory speed, no automatic key expiry (Redis
does `SET key val EX 3600` — Postgres has no built-in TTL, you'd need a cron
job or a `expires` column and a cleanup query). This is why sessions usually
live in Redis, not in your relational DB.

### 6. Query across entities — the thing key-value can't do

```sql
INSERT INTO customers (email, name) VALUES ('grace@example.com', 'Grace');
INSERT INTO orders (customer_id, total_cents) VALUES (2, 500), (2, 700);

SELECT c.name, count(o.id) AS order_count, sum(o.total_cents) AS spent
FROM   customers c
JOIN   orders o ON o.customer_id = c.id
GROUP  BY c.name;
```

Expected: one row per customer with their order count and total spent. This
ad-hoc cross-entity query — trivial in SQL — is exactly what document,
key-value, and wide-column stores make hard or impossible. You'll go deep on
joins in module 02.

### 7. Decide the store for five access patterns

For each, name the database family you'd choose and one sentence of
justification. Write your answers before checking anything:

1. A user's account: email, password hash, profile. Read and updated often;
   integrity critical.
2. A login session token that should auto-expire after 24 hours.
3. A product catalog where a "book" has an ISBN and page count but a "t-shirt"
   has sizes and colors — attributes differ wildly by category.
4. 50,000 IoT sensor readings per second, queried only as "last hour for
   device X."
5. The counter behind "you may make 100 requests per minute."

<details>
<summary>Reasonable answers</summary>

1. **Relational** — structured, relationships to orders etc., integrity is the
   priority.
2. **Key-value (Redis)** — pure lookup by token, and native TTL gives you the
   auto-expiry for free.
3. **Document (MongoDB)** — variable shape per category is exactly the flexible
   schema use case; you read a product whole.
4. **Wide-column (Cassandra)** — write volume is enormous and the access
   pattern is fixed and partition-friendly (by device, by time).
5. **Key-value (Redis)** — atomic in-memory counters with expiry; this is a
   textbook Redis job (revisited in track 05).

</details>

### 8. Diagnose and fix: the wrong tool was chosen

A team built their user/order system in MongoDB. They now report: (a) some
orders reference `customerId`s that don't exist because a customer was deleted;
(b) a bug once wrote `total` as a string `"2200"` in a few thousand documents;
(c) their nightly "revenue per customer" report is slow and complex because it
has to stitch orders to customers in application code. Explain the root cause
common to all three, and what a relational database would have done
differently.

<details>
<summary>Answer</summary>

The root cause is that this is **structured, relational, integrity-critical
data with cross-entity query needs** — the textbook relational use case — stored
in a schemaless document DB that enforces none of it. A relational DB would
have: (a) prevented the dangling reference with a foreign key (or forced an
explicit `ON DELETE` decision), (b) rejected the string `"2200"` at write time
because `total_cents` is typed `INTEGER`, and (c) made the revenue report a
single `JOIN ... GROUP BY` instead of application-side stitching. This isn't
"MongoDB is bad" — it's the wrong tool for *this* data. The fix is to move the
system of record to Postgres; Mongo may still be the right home for their
variable-shape product catalog (polyglot persistence).

</details>

## Independent challenge

No schema or commands given. Design the storage strategy for a small
ride-sharing app and write it up as a short design note. The app has: user
accounts and their payment methods; individual trips (rider, driver, route,
fare, status); the *live* location of each active driver, updated every few
seconds and read constantly by the matching service; and a firehose of app
analytics events (screen views, taps) used only for later aggregate reporting.

Decide which database family owns each of those four data sets, and justify
each choice in terms of the trade-offs from this module (schema rigidity,
integrity needs, access pattern, write volume, query flexibility). Then state
explicitly whether your design is polyglot or single-store, and what the main
*cost* of your chosen split is. There is no single right answer — there is a
right *way to justify* an answer, and that's what you're practising. Reach back
to track 02's layering: which layer of your application should be the only one
that knows *which* store each data set lives in?

<details>
<summary>Hint</summary>

Four data sets, and at least three of them have genuinely different access
patterns — that's a strong signal for polyglot. Payment methods and trips
scream relational (money, integrity, "all trips for this rider" queries). Live
driver location is a small, constantly-overwritten, expiring value read by key —
think Redis. The analytics firehose is write-heavy and only ever read in
aggregate — think wide-column or a purpose-built analytics store. And the
repository layer from track 02 module 06 is exactly the place that should hide
"which store" from your services.

</details>

## Common mistakes & troubleshooting

- **Choosing NoSQL for "flexibility" when the data is actually relational.**
  The most common and most expensive mistake. If your data has clear entities
  with relationships and integrity rules, "flexible schema" means "no schema
  enforcement," and you'll re-implement everything the relational DB gave you —
  worse and buggier — in application code.
- **Treating "schemaless" as "no schema."** The schema still exists; it just
  moved into your code's assumptions and stopped being enforced or documented.
  New readers guess the shape, guess wrong, and inconsistency spreads.
- **Using your primary relational DB as a cache or session store.** It works,
  but you lose in-memory speed and native expiry, and you put load on your
  system of record. That's Redis's job.
- **Reaching for polyglot persistence too early.** Every extra store is
  operational cost, another thing to back up and monitor, and a place data can
  drift out of sync (no cross-store foreign keys). Start with Postgres for
  everything; split off a specialized store only when a specific access pattern
  demands it.
- **`docker run` port already in use.** If `-p 5432:5432` fails with "port is
  already allocated," you have another Postgres running. Map a different host
  port (`-p 5433:5432`) and connect with `-p 5433`, or stop the other
  container.
- **Losing your data on `docker rm`.** This container has no volume, so
  removing it wipes the data — fine for exercises. For anything you want to
  keep, add `-v pgdata:/var/lib/postgresql/data`. You'll do this properly in
  later modules.

## Checkpoint quiz

Write down your answer to each question before expanding it — checking without attempting first is the single easiest way to fool yourself into thinking you've learned this.

1. What is the single biggest thing a relational database gives you that a
   schemaless document store does not, and where does that responsibility go
   when you drop it?
2. "Schemaless means there's no schema." Why is that statement wrong?
3. Name the four database families from this module and one canonical use case
   for each.
4. Why is a key-value store like Redis a poor choice for your system of record
   but an excellent choice for sessions?
5. What is the defining design principle of a wide-column store like Cassandra,
   and what do you give up for its benefits?
6. What is polyglot persistence, and what is its main cost?

<details>
<summary>Answers</summary>

1. Enforced integrity — typed columns, uniqueness, foreign keys, and check
   constraints applied at write time in one central place. Drop it and that
   responsibility moves into your application code, on every write path, where
   it's re-implemented inconsistently and rots.
2. Because the schema (the expected shape and rules of the data) still exists —
   it has just moved out of the database and into the implicit assumptions of
   every piece of code that reads the data, where it's undocumented and
   unenforced.
3. Relational (Postgres) — transactional structured data like users/orders;
   document (MongoDB) — variable-shape aggregates like a product catalog;
   key-value (Redis) — caching/sessions/counters; wide-column (Cassandra) —
   massive write-heavy known-access-pattern data like telemetry.
4. As a system of record it can't enforce integrity or answer ad-hoc queries by
   value, and it's typically in-memory (durability/capacity trade-offs). For
   sessions those weaknesses don't matter — you look up by key, want extreme
   speed, and native TTL gives you auto-expiry for free.
5. You design the table around the query/access pattern, not around the data
   (partition + clustering keys make one specific query a fast single-node
   lookup). You give up joins, ad-hoc queries, and normalization, and you
   maintain multiple copies of data for multiple access patterns yourself — in
   exchange for linear write scaling and high availability.
6. Using multiple database types, each for the access pattern it's best at
   (e.g. Postgres for orders, Redis for sessions, Mongo for a catalog). Its
   main cost is operational and correctness overhead: more systems to run and
   monitor, and no cross-store integrity, so data can drift out of sync.

</details>

## Next

[01-acid-and-cap-theorem](../01-acid-and-cap-theorem/README.md) — you've
decided *when* relational is the right tool; next you'll learn the precise
guarantees it makes (ACID) and the fundamental limits every distributed data
system runs into (CAP), so "integrity" and "consistency" become exact terms
instead of hand-waving.
</content>
</invoke>
