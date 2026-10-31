# Module 03: Schema Design and Indexing

## Why this matters

A schema is the one decision that's expensive to change later. You can rewrite
a query in five minutes; restructuring a table that forty features and a
terabyte of production data depend on is a multi-week migration project
(module 05 shows how carefully). So the shape of your tables — how you split
entities, where the keys go, what's normalized and what's deliberately not — is
worth getting right early, and it's a skill you can actually learn rather than
guess at. **Normalization** is that skill's backbone: a small set of rules that
systematically eliminate the redundancy which otherwise leads to data drifting
out of sync (the same customer name spelled three ways in three rows).

The second half is **indexing**, which is where "correct schema" meets "fast
enough to use." An index is the difference between a query scanning ten million
rows and jumping straight to the four you asked for — often the difference
between 3 milliseconds and 3 seconds. But indexes aren't free magic: each one
you add speeds up reads that match it and slows down *every* write to that
table, and the wrong index is just dead weight the planner ignores. Knowing
*which* columns to index, *why* a composite index's column order matters, and
*when* an index actively hurts is core backend competence — and it's the direct
setup for the query-optimization work in module 07.

## Concepts

### Normalization: 1NF, 2NF, 3NF, plainly

Normalization is the process of organizing columns and tables to minimize
redundancy. The "normal forms" are cumulative levels; for backend work you need
the first three, and honestly 3NF covers ~95% of real designs.

Start with a badly-designed single table and fix it step by step:

```
orders_bad
| order_id | customer_name | customer_email  | product1 | product2 | warehouse_city |
```

**First Normal Form (1NF): no repeating groups; one value per cell.** The
`product1`/`product2` columns are a repeating group — what about a third
product? 1NF says each row/column holds a single atomic value, and repeating
data becomes its own rows in a related table.

```sql
-- 1NF: line items are rows, not columns
order_items (order_id, product_name, quantity)
```

**Second Normal Form (2NF): no partial dependency on part of a composite key.**
Applies when a table's primary key is composite. Every non-key column must
depend on the *whole* key, not just part of it. If `order_items` had key
`(order_id, product_id)` and also stored `product_name`, that name depends only
on `product_id` (half the key) — a partial dependency. Move product attributes
to a `products` table keyed by `product_id`.

**Third Normal Form (3NF): no transitive dependency; non-key columns depend on
the key, nothing but the key.** In `orders_bad`, `customer_email` depends on
`customer_name`/the customer — not on the order. Storing customer data on the
order row means every order for Ada re-stores her email; change her email and
you must update every order or they drift. 3NF pulls the customer into its own
table and leaves a `customer_id` foreign key:

```sql
customers (id PK, name, email UNIQUE)
orders    (id PK, customer_id FK → customers.id, warehouse_id FK, created_at)
products  (id PK, name, price_cents)
order_items (order_id FK, product_id FK, quantity, PRIMARY KEY(order_id, product_id))
```

The informal one-liner that captures 2NF+3NF: **every non-key column depends on
the key, the whole key, and nothing but the key.** The payoff of a normalized
design: each fact lives in exactly one place, so there's no way for copies to
disagree, and updates touch one row.

```
  orders_bad (everything in one row)
  | order | cust_name | cust_email | product1 | product2 | city |
        │
   1NF  │ split the repeating group (product1, product2) into rows
        ▼
  order_items (order, product_name, quantity)
        │
   2NF  │ product_name depends on product_id, not the whole key → own table
        ▼
  products (id, name, price)     order_items (order_id, product_id, qty)
        │
   3NF  │ cust_email depends on the customer, not the order → own table
        ▼
  customers (id, name, email)    orders (id, customer_id, city)
```

### When to deliberately denormalize

Normalization optimizes for *write integrity* (no redundancy, no drift).
Sometimes you deliberately trade that away for *read performance* — this is
**denormalization**, and it's a legitimate, considered choice, not a failure.
Examples: storing a cached `order_count` on the `customers` row so a dashboard
doesn't re-aggregate millions of orders on every page load; keeping a
`total_cents` column on `orders` instead of re-summing `order_items` every time.

The rule is **normalize first, denormalize only with a measured reason.** When
you denormalize you take on the burden the database used to carry: you must now
keep the redundant copy in sync yourself (a trigger, application code in your
service layer, or a scheduled job), and you accept the risk it drifts. Do it
when a real, measured read pattern demands it — not preemptively. Track 05
(caching) is largely about doing this deliberately and safely at other layers.

### Primary keys and foreign keys

A **primary key** uniquely identifies each row and is how other tables refer to
it. Two common choices:

- **Surrogate key** — a synthetic id with no business meaning: `BIGSERIAL`
  (auto-incrementing integer) or a UUID. The default recommendation for most
  tables. Integers are compact and fast to index/join; UUIDs are useful when
  you must generate ids client-side or across shards (module 08) without
  coordination, at the cost of size and (for random UUIDs) index fragmentation.
- **Natural key** — an existing unique business attribute (an ISBN, a country
  code). Fine when it's truly immutable and unique, but business "unique"
  values have a habit of changing or being reused, which is why surrogate keys
  are the safer default.

A **foreign key** declares that a column's values must match a primary key in
another table — the integrity guarantee from module 00. It also lets you define
what happens when the referenced row is deleted: `ON DELETE RESTRICT` (default —
block the delete), `ON DELETE CASCADE` (delete the children too), or `ON DELETE
SET NULL`. Choosing this deliberately prevents both orphaned rows and
accidental mass deletes.

```sql
CREATE TABLE orders (
    id          BIGSERIAL PRIMARY KEY,           -- surrogate key
    customer_id BIGINT NOT NULL
                REFERENCES customers(id) ON DELETE RESTRICT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### How an index actually works (B-tree), and why it speeds reads

By default Postgres indexes are **B-trees** — a balanced sorted tree. Picture a
book's index: instead of reading every page to find "photosynthesis," you jump
to the alphabetical entry and it tells you the exact pages. A B-tree index on
`orders(customer_id)` keeps `customer_id` values sorted with pointers to the
matching rows, so "find all orders for customer 17" becomes a quick tree
descent (a few page reads) instead of a **sequential scan** of the whole table.
The speedup grows with table size: on a 10-million-row table an index turns a
full scan into a handful of reads.

```
  B-tree on orders(customer_id) — sorted, a few reads to reach any value:

                     [ 40 | 80 ]           ← root
                    /     |     \
             [10|25]   [55|70]   [90|99]   ← branch (still sorted)
              / | \      ...       ...
        →  ...leaf: 17 → row-ptr, 17 → row-ptr, 18 → row-ptr...
                    (sorted leaves = equality AND range AND ORDER BY for free)

  Write cost: every INSERT/UPDATE/DELETE must also thread the row into the tree.
```

Because a B-tree is *sorted*, one index accelerates several access patterns:
equality (`= 17`), range (`created_at > '2026-01-01'`), sorting (`ORDER BY
created_at`), and min/max. That's why B-tree is the default and the one you'll
reach for 90% of the time. (Postgres also has GIN indexes for JSONB/array/
full-text containment, GiST for geometric/range types, BRIN for huge
naturally-ordered tables, and hash indexes for equality-only — worth knowing by
name; B-tree is your default.)

### Choosing what to index — and composite index column order

You don't index everything (see the next section on cost). Index the columns
your queries actually filter, join, and sort on:

- **Foreign key columns** — you join on them constantly; Postgres does *not*
  auto-index FKs (only primary keys and unique constraints get automatic
  indexes), so an unindexed FK is a classic hidden slow-join.
- **Columns in `WHERE`, `JOIN ... ON`, and `ORDER BY`** of your hot queries.
- **Columns with high selectivity** — where a lookup narrows to a small
  fraction of rows. Indexing a boolean `is_active` where 99% are true is nearly
  useless; the index doesn't narrow anything, so the planner ignores it.

A **composite index** covers multiple columns in a specific order, and the
order is everything. An index on `(customer_id, created_at)` is sorted by
`customer_id` first, then `created_at` within each customer. The
**leftmost-prefix rule**: this index can serve `WHERE customer_id = 17`, and
`WHERE customer_id = 17 AND created_at > '...'`, and `WHERE customer_id = 17
ORDER BY created_at` — but it is *useless* for `WHERE created_at > '...'` alone,
because you can't use the second column without constraining the first (like a
phone book sorted by last-then-first name is useless for finding everyone named
"Grace"). Order composite index columns: equality-filtered columns first, then
the range/sort column.

```sql
CREATE INDEX idx_orders_customer_created ON orders (customer_id, created_at);
-- serves: WHERE customer_id = 17
--         WHERE customer_id = 17 AND created_at >= '2026-01-01'
--         WHERE customer_id = 17 ORDER BY created_at
-- does NOT help: WHERE created_at >= '2026-01-01'   (no customer_id filter)
```

A related concept: a **covering index** (`INCLUDE`) or an index the query can be
answered entirely from, without visiting the table — an *index-only scan*.
Module 07 reads plans that show this.

### When an index slows you down

Indexes are not free, and adding them reflexively is its own bug:

- **Every write pays.** Each `INSERT`/`UPDATE`/`DELETE` must update *every*
  index on the table. A table with eight indexes does roughly eight times the
  index maintenance per write. On a write-heavy table, redundant indexes
  silently tax throughput.
- **They consume storage and memory.** Indexes can collectively exceed the
  table's own size and compete for cache.
- **Redundant / unused indexes are pure cost.** An index on `(a)` is redundant
  if you also have `(a, b)` (the composite's leftmost prefix already covers
  `a`). Unused indexes just slow writes for no read benefit — Postgres tracks
  usage in `pg_stat_user_indexes` so you can find and drop them.
- **Low-selectivity indexes get ignored** by the planner (which correctly
  prefers a sequential scan when an index wouldn't narrow the result), so
  they're cost with no benefit.

The discipline: index for your *measured* query patterns, verify the planner
actually uses each index (module 07's `EXPLAIN`), and periodically drop the
dead ones.

## Command reference

| Statement | Purpose | Example |
|---|---|---|
| `PRIMARY KEY` | Unique row identifier (auto-indexed) | `id BIGSERIAL PRIMARY KEY` |
| `REFERENCES t(col)` | Foreign key (integrity + join target) | `customer_id BIGINT REFERENCES customers(id)` |
| `ON DELETE RESTRICT/CASCADE/SET NULL` | What happens to children on parent delete | `REFERENCES customers(id) ON DELETE CASCADE` |
| `UNIQUE (col)` | Enforce uniqueness (auto-indexed) | `email TEXT UNIQUE` |
| `CREATE INDEX` | Add a B-tree index | `CREATE INDEX idx_o_cust ON orders(customer_id)` |
| `CREATE INDEX ... (a, b)` | Composite index (order matters!) | `CREATE INDEX idx_o_cc ON orders(customer_id, created_at)` |
| `CREATE UNIQUE INDEX` | Unique + index in one | `CREATE UNIQUE INDEX ... ON users(lower(email))` |
| `CREATE INDEX ... WHERE` | Partial index (only some rows) | `... ON orders(created_at) WHERE status='open'` |
| `CREATE INDEX CONCURRENTLY` | Build without locking writes (module 05) | `CREATE INDEX CONCURRENTLY ...` |
| `DROP INDEX` | Remove an index | `DROP INDEX idx_o_cust` |
| `\d orders` | Show a table's indexes and constraints | psql meta-command |
| `pg_stat_user_indexes` | Index usage stats (find unused) | `SELECT * FROM pg_stat_user_indexes` |

Declaring keys, constraints and indexes with SQLAlchemy:

```python
from sqlalchemy import ForeignKey, UniqueConstraint, Index
from sqlalchemy.orm import Mapped, mapped_column, DeclarativeBase
import datetime

class Base(DeclarativeBase): ...

class Order(Base):
    __tablename__ = "orders"
    id:          Mapped[int] = mapped_column(primary_key=True)
    customer_id: Mapped[int] = mapped_column(
        ForeignKey("customers.id", ondelete="RESTRICT"), index=True)  # index the FK!
    created_at:  Mapped[datetime.datetime] = mapped_column(server_default="now()")

    __table_args__ = (
        # composite index: equality column first, range/sort column second
        Index("idx_orders_customer_created", "customer_id", "created_at"),
    )
```

## Hands-on exercises

Reuse `pg-data`. For the indexing exercises you'll want enough rows for a scan
to be visibly slow, so you'll generate data.

### 1. Design a normalized schema from a messy one

Given this denormalized spreadsheet-style table, write the 3NF version (you did
the reasoning in Concepts — now produce the actual DDL):

```
signups(email, full_name, plan_name, plan_price_cents, signed_up_at)
```

<details>
<summary>One correct 3NF design</summary>

`plan_name`→`plan_price_cents` is a transitive dependency (price depends on the
plan, not the signup), so plans get their own table:

```sql
CREATE TABLE plans (
    id          BIGSERIAL PRIMARY KEY,
    name        TEXT NOT NULL UNIQUE,
    price_cents INTEGER NOT NULL CHECK (price_cents >= 0)
);
CREATE TABLE users (
    id           BIGSERIAL PRIMARY KEY,
    email        TEXT NOT NULL UNIQUE,
    full_name    TEXT NOT NULL,
    plan_id      BIGINT NOT NULL REFERENCES plans(id),
    signed_up_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

Change a plan's price once, in one row, and every user on that plan reflects it —
no drift.

</details>

### 2. Generate a big table to make scans slow

```sql
DROP TABLE IF EXISTS events;
CREATE TABLE events (
    id          BIGSERIAL PRIMARY KEY,
    user_id     BIGINT NOT NULL,
    kind        TEXT NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL
);
INSERT INTO events (user_id, kind, created_at)
SELECT (random()*10000)::bigint,
       (ARRAY['click','view','buy'])[1 + (random()*2)::int],
       now() - (random()*365) * interval '1 day'
FROM   generate_series(1, 2000000);   -- 2 million rows
ANALYZE events;                         -- update planner statistics
```

Expected: 2,000,000 rows. `ANALYZE` refreshes the statistics the planner uses
to choose scans vs indexes.

### 3. Feel a sequential scan, then fix it with an index

```sql
EXPLAIN ANALYZE SELECT * FROM events WHERE user_id = 4242;
```

Expected: a `Seq Scan on events` reading all ~2M rows, with an execution time
in the tens to hundreds of milliseconds. Now add the index:

```sql
CREATE INDEX idx_events_user ON events (user_id);
EXPLAIN ANALYZE SELECT * FROM events WHERE user_id = 4242;
```

Expected: now an `Index Scan using idx_events_user`, execution time dropping to
well under a millisecond. Same query, same data — the index changed a full scan
into a targeted lookup. (You'll learn to read these plans thoroughly in module
07; here just note the `Seq Scan` → `Index Scan` change and the timing.)

### 4. Composite index and the leftmost-prefix rule

```sql
CREATE INDEX idx_events_user_time ON events (user_id, created_at);

-- Uses the composite index (constrains the leftmost column):
EXPLAIN ANALYZE
SELECT * FROM events WHERE user_id = 4242 AND created_at > now() - interval '30 days';

-- Does NOT use it well (no user_id filter — can't skip to the right part):
EXPLAIN ANALYZE
SELECT * FROM events WHERE created_at > now() - interval '30 days';
```

Expected: the first uses `idx_events_user_time` (fast). The second falls back to
a sequential scan (or a bitmap scan on a different index) because the composite
index is sorted by `user_id` first, and without a `user_id` filter it can't
exploit the `created_at` ordering — the leftmost-prefix rule in action.

### 5. Prove indexes tax writes

```sql
-- time a batch of inserts with the two indexes present
EXPLAIN ANALYZE INSERT INTO events (user_id, kind, created_at)
SELECT (random()*10000)::bigint, 'click', now() FROM generate_series(1, 100000);

-- drop the indexes and repeat
DROP INDEX idx_events_user, idx_events_user_time;
EXPLAIN ANALYZE INSERT INTO events (user_id, kind, created_at)
SELECT (random()*10000)::bigint, 'click', now() FROM generate_series(1, 100000);
```

Expected: the insert with indexes present is measurably slower — every inserted
row had to be threaded into both B-trees. This is the cost side of indexing made
concrete. (Recreate the `idx_events_user` index afterward for later exercises.)

### 6. Find unused indexes

```sql
SELECT relname AS table, indexrelname AS index, idx_scan AS times_used
FROM   pg_stat_user_indexes
ORDER  BY idx_scan ASC;
```

Expected: `idx_scan` shows how often each index was actually used since stats
were last reset. An index with `idx_scan = 0` that's been around a while is a
candidate to drop — it's taxing writes for zero read benefit.

### 7. A partial index for a hot subset

```sql
-- Suppose 95% of events are old and you almost always query recent 'buy' events
CREATE INDEX idx_recent_buys ON events (created_at)
WHERE kind = 'buy';
EXPLAIN ANALYZE
SELECT * FROM events WHERE kind = 'buy' AND created_at > now() - interval '7 days';
```

Expected: a much smaller index (only `buy` rows) that the planner uses for this
query — a partial index gives you index benefit on a hot slice while staying
tiny and cheap to maintain.

### 8. Diagnose and fix: the index that isn't being used

A team added `CREATE INDEX idx_events_kind ON events (kind);` to speed up
`SELECT * FROM events WHERE kind = 'click';`, but `EXPLAIN` still shows a
sequential scan and they're baffled. Diagnose why, and describe when this index
*would* help.

<details>
<summary>Answer</summary>

`kind` has only three distinct values (`click`, `view`, `buy`) roughly evenly
distributed, so `WHERE kind = 'click'` matches ~1/3 of all rows. The index is
**low-selectivity**: reading a third of the table via an index (jumping back and
forth between index and table pages, "random I/O") is *slower* than just
scanning the table sequentially, so the planner correctly ignores the index and
chooses a `Seq Scan`. That's not a bug — it's the planner being smart. The index
would help only for a value that's *rare* (high selectivity): if 0.1% of events
were `kind = 'refund'`, then `WHERE kind = 'refund'` would use it. A partial
index (`WHERE kind='refund'`) or a composite index that also constrains a
selective column would be the right tools; a bare index on a three-value column
is dead weight. Verify with `EXPLAIN` — never assume an index is used just
because it exists.

</details>

## Independent challenge

No DDL given. Design and build the schema for a **library lending system**: books
(a title may have multiple physical copies), members, and loans (which member
has which copy, checked-out and due dates, returned-or-not). Normalize to 3NF —
be explicit about why a "book" and a "copy" are different tables and what would
go wrong if you merged them. Add the foreign keys with deliberate `ON DELETE`
behaviour (should deleting a member who has an outstanding loan be allowed?).
Then, given these two hot queries — "all currently-outstanding loans for a given
member" and "is any copy of book X available right now" — decide exactly which
indexes to create, justify each in one sentence, and name one column you were
tempted to index but shouldn't. Reach back to module 02: write the "is any copy
available" query as a `LEFT JOIN` / `NOT EXISTS` and note which index it relies
on.

<details>
<summary>Hint</summary>

"Book" holds title/author/ISBN (one row per work); "copy" holds one row per
physical item with a FK to book — merging them would force you to repeat the
title/author on every physical copy (a 3NF violation that drifts). The loans
table FKs to both `member` and `copy`. For "outstanding loans for a member," a
composite/partial index on `(member_id) WHERE returned_at IS NULL` is ideal
(you only ever query un-returned loans). For "is a copy available," you need to
find copies of the book with no outstanding loan — index the loan's `copy_id`
(a foreign key Postgres won't auto-index). The column you probably shouldn't
index: a low-selectivity status/boolean, unless as a partial-index predicate.

</details>

## Common mistakes & troubleshooting

- **Storing the same fact in many rows (unnormalized).** Customer email on every
  order row means an email change must touch every order or they drift. Pull the
  repeated entity into its own table with a foreign key.
- **Denormalizing preemptively "for speed."** You take on sync burden and drift
  risk before you've measured a need. Normalize first; denormalize with a
  specific, measured read pattern in mind (and keep the copy in sync in one
  place).
- **Not indexing foreign key columns.** Postgres auto-indexes primary keys and
  unique constraints but *not* foreign keys. An unindexed FK makes every join
  and every `ON DELETE CASCADE` check slow.
- **Wrong composite index column order.** `(created_at, customer_id)` won't
  serve `WHERE customer_id = 17` efficiently. Put equality-filtered columns
  first, range/sort columns last (leftmost-prefix rule).
- **Indexing everything.** Every index taxes writes and consumes space.
  Redundant (`(a)` alongside `(a,b)`), unused, and low-selectivity indexes are
  pure cost. Index for measured query patterns and drop the dead ones.
- **Assuming an index is used because it exists.** The planner ignores indexes
  that wouldn't help (low selectivity) or that don't match the query's leftmost
  prefix. Always confirm with `EXPLAIN` (module 07).
- **Choosing a mutable natural key as the primary key.** Business "unique"
  values change and get reused. Prefer a surrogate key and put a `UNIQUE`
  constraint on the natural attribute.

## Checkpoint quiz

Write down your answer to each question before expanding it — checking without attempting first is the single easiest way to fool yourself into thinking you've learned this.

1. State 1NF, 2NF, and 3NF in your own words, and give the one-line mnemonic
   that captures 2NF+3NF.
2. What problem does normalization prevent, and what do you trade away when you
   deliberately denormalize?
3. Why prefer a surrogate primary key over a natural one in most tables?
4. Explain, using the book-index analogy, how a B-tree index turns a query from
   slow to fast — and name one query shape besides equality that a B-tree also
   accelerates.
5. You have an index on `(customer_id, created_at)`. Which of these does it help
   and which not: `WHERE customer_id = 5`; `WHERE created_at > X`; `WHERE
   customer_id = 5 AND created_at > X`? Why?
6. Give two distinct reasons an index can *hurt* rather than help.
7. An index exists on a column but `EXPLAIN` shows a sequential scan. Give a
   plausible correct reason the planner is right to ignore it.

<details>
<summary>Answers</summary>

1. 1NF: one atomic value per cell, no repeating groups (no `product1/product2`
   columns). 2NF: with a composite key, no non-key column depends on only part
   of the key. 3NF: no non-key column depends on another non-key column
   (transitive dependency). Mnemonic: every non-key column depends on the key,
   the whole key, and nothing but the key.
2. It prevents redundancy and the resulting data drift/inconsistency (each fact
   in one place). Denormalizing trades that write-integrity for read
   performance, and you take on the burden of keeping the redundant copy in sync
   plus the risk it drifts.
3. Surrogate keys are stable (never change), compact, and fast to index/join;
   natural business values tend to change or be reused, which would ripple
   through every foreign key referencing them.
4. Instead of reading every page (sequential scan), the sorted B-tree lets you
   jump straight to the matching entries and their row pointers (a few page
   reads), like a book index pointing to exact pages. Besides equality it also
   accelerates range queries, `ORDER BY` on the indexed column, and min/max —
   because the index is kept sorted.
5. It helps `WHERE customer_id = 5` (leftmost column) and `WHERE customer_id = 5
   AND created_at > X` (both, in order). It does *not* efficiently help `WHERE
   created_at > X` alone, because the index is sorted by `customer_id` first —
   without constraining it you can't exploit the `created_at` ordering
   (leftmost-prefix rule).
6. (a) Every write must update every index, so indexes slow `INSERT`/`UPDATE`/
   `DELETE`; (b) redundant/unused/low-selectivity indexes consume storage and
   cache and provide no read benefit (and low-selectivity ones the planner just
   ignores).
7. The column is low-selectivity — the value matches a large fraction of rows
   (e.g. a 3-value column, or a boolean that's 99% true) — so using the index
   would mean lots of random I/O to fetch most of the table anyway; a sequential
   scan is genuinely faster, and the planner correctly chooses it.

</details>

## Cumulative review

Closed-book. These pull together modules 00-03. Write each answer out before
expanding — no peeking at earlier modules.

1. (00) You're told to store shopping-cart contents that must survive for
   exactly one hour then vanish, and separately the completed-order records that
   must never be lost or corrupted. Name the database family for each and the
   single deciding factor.
2. (01) A junior says "we wrapped the two `UPDATE`s in a transaction, so it's
   ACID — we're safe from the lost-update bug." Are they right? Which ACID
   letter actually governs the lost-update bug, and what else must they do?
3. (01) Distinguish ACID's "C" from CAP's "C" in one sentence each, then say
   which one a `CHECK (balance >= 0)` constraint is about.
4. (02) Write (in words or SQL) the correct query for "every product and its
   total units sold, including never-sold products showing 0," and name the two
   separate mistakes that would each drop the never-sold products.
5. (03) You normalized to 3NF and now a dashboard that re-aggregates 5M
   `order_items` on every page load is too slow. Give two different, legitimate
   fixes — one an index, one a denormalization — and state the cost of each.
6. (02+03) A three-table join `customers → orders → order_items` is slow and the
   FK columns aren't indexed. Explain both *why it's slow* (indexing) and *how
   the join grain* could also be making a downstream `sum()` wrong.

<details>
<summary>Answers</summary>

1. Cart → **key-value (Redis)**; deciding factor is the native TTL/auto-expiry
   (and speed) for ephemeral data. Orders → **relational (Postgres)**; deciding
   factor is integrity/durability for the system of record.
2. Not necessarily. A transaction gives atomicity, but the lost update is an
   **isolation** problem — under the default Read Committed level two
   concurrent read-modify-write transactions can still clobber each other. They
   must additionally either compute the update atomically in SQL (`balance =
   balance + N`), lock the row (`SELECT ... FOR UPDATE`), or raise the isolation
   level (module 04).
3. ACID "C": a transaction only commits states satisfying declared constraints.
   CAP "C": all nodes agree on the most recent value (linearizability). A
   `CHECK` constraint is ACID's "C".
4. `SELECT p.name, COALESCE(sum(oi.quantity),0) FROM products p LEFT JOIN
   order_items oi ON oi.product_id = p.id GROUP BY p.name`. The two mistakes
   that drop never-sold products: (a) using `INNER JOIN` instead of `LEFT
   JOIN`, and (b) putting a condition on `order_items` in `WHERE` instead of
   `ON`, which collapses the left join into an inner join.
5. Index: add a composite/covering index supporting the aggregation's filter —
   cost is slower writes and storage. Denormalization: maintain a cached
   `units_sold` (or per-day rollup) updated on write — cost is you must keep the
   cache in sync (trigger/service/job) and risk drift.
6. Slow: the FK columns (`orders.customer_id`, `order_items.order_id`,
   `order_items.product_id`) aren't indexed, so each join does sequential scans
   / hash joins over full tables instead of index lookups. Wrong sum: joining
   through `order_items` multiplies each order row by its number of items, so
   summing a per-*order* value (like an order-level shipping fee) counts it once
   per item — a join-grain error.

</details>

## Further reading & sources

- [PostgreSQL: Indexes](https://www.postgresql.org/docs/current/indexes.html) - the full chapter on index types, multicolumn indexes, partial indexes, and index-only scans.
- [PostgreSQL: Constraints](https://www.postgresql.org/docs/current/ddl-constraints.html) - primary keys, foreign keys, and the ON DELETE actions that protect integrity.
- [Use The Index, Luke!](https://use-the-index-luke.com/) - the definitive, vendor-neutral guide to B-tree indexing and why composite-column order matters.
- [Use The Index, Luke: The Where Clause](https://use-the-index-luke.com/sql/where-clause) - deep dive on selectivity and the leftmost-prefix rule.
- [Database Normalization (overview)](https://en.wikipedia.org/wiki/Database_normalization) - a concise reference for 1NF through higher normal forms.

## Next

[04-transactions-and-concurrency-control](../04-transactions-and-concurrency-control/README.md)
— your schema is designed and indexed; now the hard part of "I" in ACID gets
its own module. You'll learn isolation levels, the exact anomalies each allows,
optimistic vs pessimistic locking, and how to diagnose and prevent deadlocks.
