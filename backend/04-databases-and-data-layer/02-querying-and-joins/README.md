# Module 02: Querying and Joins

## Why this matters

The single feature that justifies a relational database over a pile of
key-value lookups is the **join**: the ability to combine rows from multiple
tables on the fly, at query time, without pre-stitching them. In module 00 you
saw one line — `JOIN customers ON ...` — do work that a document or key-value
store makes you do by hand in application code. This module is where joins stop
being magic.

Joins are also where correctness quietly goes wrong. Every join type produces a
*different* result set, and picking the wrong one doesn't throw an error — it
returns a plausible-looking answer that's subtly incorrect. Use an `INNER JOIN`
where you needed a `LEFT JOIN` and customers with zero orders silently vanish
from your "customers and their order counts" report. Nobody notices until
finance asks why the numbers don't add up. Beyond join *type*, there's the
question of join *versus* the alternatives — subqueries and CTEs often express
the same intent, sometimes more clearly and sometimes much faster. Getting
fluent here is the difference between fighting your data and asking it precise
questions. This is the module you'll lean on hardest in day-to-day backend
work.

## Concepts

### The shape of a SELECT, and the order it really runs

A query is written in one order and *executed* in another. Knowing the
execution order explains a lot of confusing behaviour:

```sql
SELECT   c.name, count(o.id) AS orders        -- 5. SELECT (compute output columns)
FROM     customers c                           -- 1. FROM  (choose/join tables)
JOIN     orders o ON o.customer_id = c.id      -- 1. (join is part of FROM)
WHERE    c.created_at > '2026-01-01'           -- 2. WHERE (filter rows, pre-grouping)
GROUP BY c.name                                -- 3. GROUP BY (collapse into groups)
HAVING   count(o.id) > 2                        -- 4. HAVING (filter groups)
ORDER BY orders DESC                            -- 6. ORDER BY
LIMIT    10;                                     -- 7. LIMIT
```

The practical payoffs of the execution order: (1) `WHERE` filters individual
rows *before* grouping and cannot reference aggregate functions — that's what
`HAVING` is for (it filters *after* grouping). (2) You can't use a `SELECT`
alias like `orders` in `WHERE` (the alias doesn't exist yet at step 2) but you
*can* in `ORDER BY` (step 6, after `SELECT`). (3) An aggregate like `count()`
only makes sense once rows are grouped.

### What a join actually is: a filtered cross product

Under the hood, a join conceptually pairs every row of the left table with
every row of the right table (the **cross product**), then keeps only the pairs
where the `ON` condition is true. That mental model explains both the results
and the classic bug of **row multiplication**: if one customer matches three
orders, that customer's row appears three times in the output — once per
matching order. If you then `sum(order_total)` you get the right answer, but if
you `sum(customer.credit_limit)` you've triple-counted the credit limit. Joins
change the *grain* (the "one row means one what?") of your result, and you must
track that grain.

### The five join types, and when each is wrong

Given `customers` (some have orders, some don't) and `orders` (all reference a
real customer here, but imagine some pointed at deleted customers):

**`INNER JOIN`** — keep only rows that match on *both* sides. Customers with no
orders disappear; orders with no matching customer disappear.

```sql
SELECT c.name, o.id
FROM   customers c
INNER JOIN orders o ON o.customer_id = c.id;
-- A customer who never ordered is simply absent from this result.
```
*Wrong when:* you asked "list every customer and how many orders they have" —
inner join drops the zero-order customers and understates your customer count.

**`LEFT [OUTER] JOIN`** — keep *all* rows from the left table; for left rows
with no right match, the right-side columns come back `NULL`.

```sql
SELECT c.name, count(o.id) AS order_count
FROM   customers c
LEFT JOIN orders o ON o.customer_id = c.id
GROUP BY c.name;
-- Zero-order customers appear with order_count = 0. This is the correct
-- query for "every customer and their order count".
```
*Wrong when:* you actually only wanted customers who *have* ordered — then the
`NULL` rows are noise and you wanted an inner join. Also a classic trap: putting
a condition on the right table in `WHERE` instead of `ON` silently turns a left
join back into an inner join (see exercise 8).

**`RIGHT [OUTER] JOIN`** — the mirror image: keep all rows from the *right*
table. Rarely used in practice, because you can always rewrite it as a `LEFT
JOIN` by swapping the table order, and left joins read more naturally. Seeing a
`RIGHT JOIN` in real code is usually a smell that the query grew awkwardly.

**`FULL [OUTER] JOIN`** — keep all rows from *both* sides; unmatched rows on
either side get `NULL`s for the other side's columns. Useful for reconciliation:
"show me everything in A, everything in B, and where they line up." E.g.
comparing two snapshots to find rows present in one but not the other.

**`CROSS JOIN`** — the raw cross product with no `ON` condition: every left row
paired with every right row. Deliberately used to generate combinations (every
product × every warehouse, to build an inventory grid). *Accidentally* produced
when you forget a join condition — which is how a query that should return
1,000 rows returns 1,000,000 and hangs. If a join result is suspiciously huge,
suspect an accidental cross join (a missing or wrong `ON`).

### Subqueries vs joins vs CTEs — three ways to say similar things

Often you can express the same question three ways. They're not always
interchangeable in performance, but they're a vocabulary you must have.

**Subquery** (a query nested inside another). Handy for "filter by a set" or
"compute a scalar":

```sql
-- customers who have at least one order over 1000 cents
SELECT * FROM customers
WHERE id IN (SELECT customer_id FROM orders WHERE total_cents > 1000);
```

A **correlated** subquery references the outer row and runs (conceptually) once
per outer row — powerful but a common performance trap when it hides an N+1
pattern inside SQL:

```sql
SELECT c.name,
       (SELECT count(*) FROM orders o WHERE o.customer_id = c.id) AS order_count
FROM   customers c;
```

**Join** — usually the right tool when you need *columns* from both tables, and
often the planner's most optimizable form:

```sql
SELECT c.name, count(o.id) AS order_count
FROM   customers c LEFT JOIN orders o ON o.customer_id = c.id
GROUP  BY c.name;
```

**CTE (Common Table Expression)** — a `WITH` clause naming a subquery, so you
can reference it by name and build a query in readable stages:

```sql
WITH big_orders AS (
    SELECT customer_id, count(*) AS n
    FROM   orders
    WHERE  total_cents > 1000
    GROUP  BY customer_id
)
SELECT c.name, b.n
FROM   customers c
JOIN   big_orders b ON b.customer_id = c.id;
```

CTEs shine for readability and for **recursive** queries (walking a tree/graph,
e.g. an org chart or category hierarchy — `WITH RECURSIVE`). A historical note
worth knowing: in older Postgres (before 12) CTEs were an **optimization fence**
— the planner always materialized them, which could be slower than an
equivalent subquery. Postgres 12+ can inline non-recursive CTEs, so the gap
mostly closed, but you may still see `MATERIALIZED` / `NOT MATERIALIZED` hints
used to control it.

### Aggregation and NULL — the two things that trip everyone

Two behaviours cause more wrong query results than anything else:

- **`NULL` is not a value; it's "unknown."** `NULL = NULL` is *not* true — it's
  `NULL`. So `WHERE x = NULL` never matches anything; you must write `WHERE x IS
  NULL`. And `count(column)` skips `NULL`s while `count(*)` counts rows
  regardless — which is exactly why `LEFT JOIN ... count(o.id)` correctly gives
  0 for a customer with no orders (the `NULL` order id isn't counted) rather
  than 1.
- **`GROUP BY` requires discipline.** Every column in `SELECT` that isn't inside
  an aggregate must appear in `GROUP BY` (Postgres enforces this and errors
  otherwise — a good thing; some databases silently pick a random value). Filter
  rows with `WHERE` (before grouping) and filter groups with `HAVING` (after).

## Command reference

| Clause / operator | Purpose | Example |
|---|---|---|
| `INNER JOIN ... ON` | Rows matching on both sides | `FROM a JOIN b ON b.a_id = a.id` |
| `LEFT JOIN ... ON` | All left rows; NULLs for unmatched right | `FROM a LEFT JOIN b ON ...` |
| `RIGHT JOIN ... ON` | All right rows (prefer rewriting as LEFT) | `FROM a RIGHT JOIN b ON ...` |
| `FULL JOIN ... ON` | All rows from both; NULLs for unmatched | reconciliation |
| `CROSS JOIN` | Cartesian product (all combinations) | `FROM products CROSS JOIN warehouses` |
| `WHERE` | Filter individual rows before grouping | `WHERE total_cents > 100` |
| `GROUP BY` | Collapse rows into groups | `GROUP BY customer_id` |
| `HAVING` | Filter groups after aggregation | `HAVING count(*) > 2` |
| `count(*)` / `count(col)` | Count rows / count non-NULL values | see NULL note above |
| `sum/avg/min/max` | Aggregate over a group | `sum(total_cents)` |
| `x IS NULL` / `IS NOT NULL` | Correct NULL test (never `= NULL`) | `WHERE deleted_at IS NULL` |
| `WITH name AS (...)` | Common table expression | see CTE example |
| `EXISTS (subquery)` | True if subquery returns any row | `WHERE EXISTS (SELECT 1 FROM ...)` |
| `IN (subquery)` | Membership test against a set | `WHERE id IN (SELECT ...)` |
| `COALESCE(a, b)` | First non-NULL (great after LEFT JOIN) | `COALESCE(order_count, 0)` |

Running a query from Python with SQLAlchemy Core (results as rows):

```python
from sqlalchemy import create_engine, text
engine = create_engine("postgresql+psycopg://postgres:devpass@localhost:5432/shop")

with engine.connect() as conn:
    rows = conn.execute(text("""
        SELECT c.name, count(o.id) AS order_count
        FROM   customers c
        LEFT JOIN orders o ON o.customer_id = c.id
        GROUP  BY c.name
        ORDER  BY order_count DESC
    """)).all()
    for name, order_count in rows:
        print(name, order_count)
```

## Hands-on exercises

Reuse the `pg-data` container. Start from a clean, richer dataset so the join
differences are visible.

### 1. Seed a dataset with deliberate gaps

```sql
DROP TABLE IF EXISTS orders, customers CASCADE;
CREATE TABLE customers (id BIGSERIAL PRIMARY KEY, name TEXT NOT NULL);
CREATE TABLE orders (
    id BIGSERIAL PRIMARY KEY,
    customer_id BIGINT REFERENCES customers(id),
    total_cents INTEGER NOT NULL
);
INSERT INTO customers (name) VALUES ('Ada'), ('Grace'), ('Linus'), ('Zoe');
-- Ada (1) has 3 orders, Grace (2) has 1, Linus (3) and Zoe (4) have NONE
INSERT INTO orders (customer_id, total_cents) VALUES
  (1, 500), (1, 1500), (1, 300), (2, 2000);
```

Expected: 4 customers, 4 orders, and importantly two customers with zero
orders. That gap is what makes inner vs left visible.

### 2. INNER JOIN — see who disappears

```sql
SELECT c.name, o.total_cents
FROM   customers c
INNER JOIN orders o ON o.customer_id = c.id
ORDER BY c.name;
```

Expected: rows for Ada (3 of them) and Grace (1). **Linus and Zoe are absent** —
they have no orders, so the inner join drops them. Note Ada appears 3 times:
the grain is now "one row per order," not "per customer."

### 3. LEFT JOIN — keep everyone

```sql
SELECT c.name, o.total_cents
FROM   customers c
LEFT JOIN orders o ON o.customer_id = c.id
ORDER BY c.name;
```

Expected: Ada (3 rows), Grace (1), and now **Linus and Zoe each appear once
with `total_cents` = NULL**. The left join preserved the zero-order customers.

### 4. The correct "customers and their order counts" report

```sql
SELECT c.name,
       count(o.id)              AS order_count,
       COALESCE(sum(o.total_cents), 0) AS total_spent
FROM   customers c
LEFT JOIN orders o ON o.customer_id = c.id
GROUP  BY c.name
ORDER  BY total_spent DESC;
```

Expected: Ada 3 / 2300, Grace 1 / 2000, Linus 0 / 0, Zoe 0 / 0. Notice
`count(o.id)` correctly yields 0 (not 1) for Linus/Zoe because it ignores the
NULL, and `COALESCE` turns the NULL sum into 0. Re-run it with `INNER JOIN` and
watch Linus and Zoe vanish — the exact bug this module warns about.

### 5. HAVING vs WHERE

```sql
-- WHERE filters rows (pre-group); HAVING filters groups (post-aggregate)
SELECT c.name, count(o.id) AS n
FROM   customers c
LEFT JOIN orders o ON o.customer_id = c.id
WHERE  o.total_cents >= 500 OR o.total_cents IS NULL  -- keep the NULL (no-order) rows
GROUP  BY c.name
HAVING count(o.id) >= 2;
```

Expected: only Ada (she has ≥2 orders of ≥500). Try moving the `HAVING`
condition into `WHERE` — Postgres errors, because `count()` can't be used in
`WHERE`. That error *is* the execution-order lesson.

### 6. Three ways to answer one question

Write "customers who have at least one order over 1000 cents" as (a) a subquery
with `IN`, (b) a join with `DISTINCT`, and (c) an `EXISTS` subquery. Confirm all
three return the same customers (Ada and Grace).

<details>
<summary>One solution set</summary>

```sql
-- (a) IN subquery
SELECT * FROM customers
WHERE id IN (SELECT customer_id FROM orders WHERE total_cents > 1000);

-- (b) join + DISTINCT
SELECT DISTINCT c.* FROM customers c
JOIN orders o ON o.customer_id = c.id AND o.total_cents > 1000;

-- (c) EXISTS (often the planner's favourite for "does any match exist")
SELECT * FROM customers c
WHERE EXISTS (SELECT 1 FROM orders o WHERE o.customer_id = c.id AND o.total_cents > 1000);
```

</details>

### 7. A CTE that reads in stages

```sql
WITH per_customer AS (
    SELECT customer_id, count(*) AS n, sum(total_cents) AS spent
    FROM   orders
    GROUP  BY customer_id
)
SELECT c.name, pc.n, pc.spent
FROM   customers c
JOIN   per_customer pc ON pc.customer_id = c.id
ORDER  BY pc.spent DESC;
```

Expected: Ada and Grace with their counts/totals (Linus/Zoe absent because the
CTE only contains customers who appear in `orders`, and we used an inner join).
Note how the CTE names the "orders rolled up per customer" idea so the final
query reads cleanly.

### 8. Diagnose and fix: the LEFT JOIN that isn't

A colleague wants "every customer, plus their orders over 1000 cents (customers
with none should still show, with NULLs)." They wrote:

```sql
SELECT c.name, o.total_cents
FROM   customers c
LEFT JOIN orders o ON o.customer_id = c.id
WHERE  o.total_cents > 1000;
```

They're confused: Linus and Zoe (zero orders) have disappeared, and so has one
of Ada's rows. Explain what went wrong and fix it.

<details>
<summary>Answer</summary>

The `WHERE o.total_cents > 1000` runs *after* the left join and filters out
every row where `o.total_cents` is NULL — which is exactly the "no matching
order" rows the left join was supposed to preserve. So the left join silently
collapses back into an inner join, and Ada's sub-1000 order is dropped too. The
rule: **conditions on the right (optional) table of a left join belong in the
`ON` clause, not `WHERE`.** Fix:

```sql
SELECT c.name, o.total_cents
FROM   customers c
LEFT JOIN orders o
       ON o.customer_id = c.id AND o.total_cents > 1000;
```

Now the extra condition restricts *which orders match* during the join, but
non-matching customers are still kept with NULLs. This is one of the most
common real SQL bugs.

</details>

### 9. Diagnose and fix: the accidental cross join

```sql
-- intended: each order with its customer's name
SELECT c.name, o.id, o.total_cents
FROM   customers c, orders o;      -- old-style comma join, no condition!
```

Run it and count the rows.

<details>
<summary>Answer</summary>

The comma-style `FROM customers, orders` with no `WHERE`/`ON` condition is a
**cross join**: every customer paired with every order (4 × 4 = 16 rows here,
but millions on real tables — a query that hangs). The fix is to add the join
condition, and prefer explicit `JOIN ... ON` syntax which makes a forgotten
condition a visible mistake:

```sql
SELECT c.name, o.id, o.total_cents
FROM   customers c
JOIN   orders o ON o.customer_id = c.id;
```

Whenever a result set is astronomically larger than expected, suspect a missing
join condition producing a cross product.

</details>

## Independent challenge

No SQL given. Add a third table `products (id, name, price_cents)` and a
join table `order_items (order_id, product_id, quantity)` linking orders to
products (a many-to-many). Seed a handful of rows, then write queries answering:
(1) every product and the total quantity ever sold of it, *including products
that have never sold* (they must appear with 0); (2) the single highest-spending
customer and how much they spent, computed across `order_items` (watch the join
grain — you're now joining three tables and it's easy to multiply rows); and (3)
using a CTE, revenue per customer, then only the customers whose revenue is
above the average customer revenue.

Reach back to module 00: `order_items` is the classic relational answer to a
many-to-many relationship that a document store would model by embedding — note
which integrity guarantee the two foreign keys on `order_items` give you.

<details>
<summary>Hint</summary>

For (1), the "must appear with 0" requirement means the *products* table is the
one you can't drop rows from — `LEFT JOIN` from `products` to `order_items` and
`count`/`sum` the quantity, wrapping the sum in `COALESCE(..., 0)`. For (2),
because you join `customers → orders → order_items`, each order row multiplies
by its number of items — so aggregate `sum(oi.quantity * p.price_cents)` at the
right grain and `GROUP BY` the customer. For (3) compute per-customer revenue in
a CTE, then in the outer query compare each to `(SELECT avg(revenue) FROM
the_cte)` — a subquery over your own CTE.

</details>

## Common mistakes & troubleshooting

- **Using `INNER JOIN` when the question includes "all X even with no Y."** The
  zero-match rows silently disappear and your counts are wrong. "Every customer
  and their order count" needs a `LEFT JOIN`.
- **Filtering the outer table of a LEFT JOIN in `WHERE`.** It turns the left
  join back into an inner join by dropping the NULL rows. Put conditions on the
  optional table in the `ON` clause.
- **Forgetting the join condition.** A comma join or a missing `ON` produces a
  cross product — a result exploding to rows_left × rows_right. Suspect this
  whenever a result set is impossibly large.
- **Ignoring join grain when aggregating.** After a join, one entity may occupy
  many rows; `sum`ming a per-entity value (like a credit limit) then
  double/triple counts. Know what "one row" means at each stage.
- **`WHERE x = NULL`.** Never matches. Use `IS NULL` / `IS NOT NULL`. NULL is
  "unknown," not a comparable value.
- **`count(column)` vs `count(*)` confusion.** `count(col)` skips NULLs (usually
  what you want after a LEFT JOIN); `count(*)` counts rows regardless.
- **Putting an aggregate in `WHERE`.** Aggregates don't exist until after
  grouping — use `HAVING`. The error message is the execution-order lesson.

## Checkpoint quiz

Write down your answer to each question before expanding it — checking without attempting first is the single easiest way to fool yourself into thinking you've learned this.

1. Give the logical execution order of `SELECT, FROM, WHERE, GROUP BY, HAVING,
   ORDER BY, LIMIT`, and use it to explain why you can't reference a `SELECT`
   alias in `WHERE` but can in `ORDER BY`.
2. You want "every customer and how many orders they have, including customers
   with zero." Which join, and what happens with the wrong one?
3. What's the difference between `WHERE` and `HAVING`?
4. Explain "join grain" and how a join can make a `sum()` double-count.
5. Why does `LEFT JOIN ... count(o.id)` correctly give 0 for a customer with no
   orders, rather than 1? (Two concepts combine here.)
6. Name a case where a `CROSS JOIN` is intentional and a case where it's an
   accident, and how you'd notice the accident.
7. When would you reach for a CTE over a subquery, and what changed about CTE
   performance in modern Postgres?

<details>
<summary>Answers</summary>

1. Order: `FROM`(+joins) → `WHERE` → `GROUP BY` → `HAVING` → `SELECT` →
   `ORDER BY` → `LIMIT`. A `SELECT` alias is created at the `SELECT` step, which
   runs *after* `WHERE`, so the alias doesn't exist yet in `WHERE`; `ORDER BY`
   runs *after* `SELECT`, so the alias does exist there.
2. `LEFT JOIN` (customers on the left). With an `INNER JOIN`, customers who have
   no orders are dropped entirely, understating your customer list and counts.
3. `WHERE` filters individual rows before grouping and can't use aggregates;
   `HAVING` filters whole groups after aggregation and can use aggregates like
   `count(*)`.
4. Join grain is "what does one output row represent." After joining customers
   to orders, one customer occupies as many rows as they have orders; summing a
   per-customer value (e.g. credit limit) then counts it once per order,
   multiplying it.
5. Two things combine: a `LEFT JOIN` keeps the no-order customer with NULL
   order columns, and `count(o.id)` ignores NULLs — so it counts zero real order
   ids. `count(*)` would wrongly return 1 by counting the placeholder row.
6. Intentional: generating all combinations, e.g. every product × every
   warehouse to build an inventory grid. Accidental: a forgotten `ON`/`WHERE`
   condition. You notice it because the row count is roughly rows_left ×
   rows_right — vastly larger than expected.
7. Reach for a CTE for readability (naming intermediate stages) or for recursive
   queries (`WITH RECURSIVE`). In older Postgres (<12) CTEs were an optimization
   fence (always materialized, sometimes slower); Postgres 12+ can inline
   non-recursive CTEs, so the performance gap with subqueries largely closed.

</details>

## Next

[03-schema-design-and-indexing](../03-schema-design-and-indexing/README.md) —
you can now ask precise questions of your data; next you'll learn to *design*
the tables those questions run against (normalization, keys) and how indexes
make the right queries fast — and the wrong indexes make writes slow.
