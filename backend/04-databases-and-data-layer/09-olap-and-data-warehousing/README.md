# Module 09: OLAP and Data Warehousing

## Why this matters

Every module in this track so far has one workload in mind: an application
serving individual users — look up this order, update that account, insert
one row, read a handful back. That's **OLTP** (Online Transaction
Processing): many small, concurrent, row-oriented operations, and Postgres
(a row store) is built for exactly this. But eventually someone asks a very
different kind of question: "total revenue by region, by month, for the
last two years, broken down by product category." That's **OLAP** (Online
Analytical Processing): one huge query, scanning millions of rows, touching
only a few columns, run rarely, by one person, with no urgency measured in
milliseconds. Running that query against your production OLTP database
doesn't just run slowly — it can lock tables and starve the connection pool
(module 07) that real customers are trying to use *right now*. The fix
isn't a bigger Postgres; it's a fundamentally different storage engine for a
fundamentally different access pattern. This module builds that mental
model and lets you feel the difference yourself, on the same data, in both
kinds of engine.

## Concepts

### OLTP vs OLAP: different questions, different engines

| | OLTP (this track, so far) | OLAP (this module) |
|---|---|---|
| Typical query | "Get order #4821" | "Sum revenue by month for 2 years" |
| Rows touched | A handful | Millions |
| Columns touched | Most/all of the row | A few columns out of many |
| Concurrency | Thousands of small concurrent transactions | A few large queries, run less often |
| Storage layout | **Row-oriented** (module 03's page layout) | **Column-oriented** |
| Example engines | PostgreSQL, MySQL | ClickHouse, Snowflake, BigQuery, DuckDB |

Neither is "better" — they're optimized for opposite things, and that's the
whole reason they're separate systems, not features of one database.

### Row storage vs. column storage: the actual mechanical difference

Postgres (module 03) stores a table **row by row** on disk: all of a single
row's columns sit next to each other, because OLTP mostly needs "give me
this whole row" (or a few rows) fast. A columnar engine stores the *same
logical table* **column by column** instead — every value of one column
sits contiguously, across all rows.

```
  Row storage (Postgres):                 Column storage (OLAP engine):
  disk: [id1,region1,amt1,date1]          disk: [id1,id2,id3,...]
        [id2,region2,amt2,date2]                [region1,region2,region3,...]
        [id3,region3,amt3,date3]                [amt1,amt2,amt3,...]
                                                 [date1,date2,date3,...]

  "get order #4821" → one seek,           "sum(amt)" → read ONLY the amt
  one row read, fast                      column, skip id/region/date
                                           entirely — far less I/O
```

If your query only needs `amt` and `date` out of a ten-column table, a
columnar engine reads *only those two columns* off disk — a row store has
to read every row in full even if it only needs two fields out of ten,
because rows are stored whole. This single difference is why the same
aggregation query can be orders of magnitude faster in a columnar engine:
it isn't a smarter query planner, it's fundamentally less data physically
read off disk.

### Why the two workloads fight over the same box

Put both workloads on one Postgres and they actively hurt each other:

- A multi-million-row analytical scan holds row/page locks and burns
  through the buffer cache (module 07's connection-pool/cache reasoning),
  evicting the hot pages your OLTP traffic actually needs.
- It competes for the same limited connection pool your live application
  depends on — one long-running analytics query can starve real user
  requests.
- Postgres's row-oriented storage is *mechanically* the wrong shape for the
  scan pattern analytics needs, so even with locks and pool contention
  aside, it's simply slower at that job than a purpose-built columnar
  engine would be.

The standard fix from module 08 already gave you half the answer without
naming it: run analytics against a **read replica**, never the primary, so
a runaway analytical query can't block real traffic. A **data warehouse**
takes this further: a *separate, columnar* store, fed from your OLTP
database (and often other sources), purpose-built for the "few huge
queries" access pattern instead of merely isolating it on a replica of the
same row-store engine.

### ETL/ELT: how data gets from OLTP into the warehouse

Data doesn't appear in a warehouse by magic — it's **extracted** from
source systems (your OLTP Postgres, and often other services), optionally
**transformed** (reshaped, cleaned, aggregated), and **loaded** into the
warehouse. Two orderings of those same three steps:

- **ETL** (Extract, Transform, Load) — transform *before* loading, using a
  separate processing step. Traditional; the warehouse only ever receives
  already-shaped data.
- **ELT** (Extract, Load, Transform) — load the raw data in first, then
  transform it *inside* the warehouse using the warehouse's own compute.
  More common with modern columnar warehouses, since they're often
  powerful and cheap enough to do the transformation themselves rather
  than needing a separate processing cluster.

Either way, this is a **batch or scheduled** pipeline (nightly, hourly),
not a live path a user request ever touches — a different concern from
this track's live OLTP path entirely, and the subject of the next new
module in the background-processing track (batch pipeline orchestration).

### Star schemas: modeling for OLAP instead of 3NF

Module 03 taught you to normalize to 3NF specifically to make OLTP writes
safe and non-redundant. A warehouse optimizes for the opposite: **fast,
simple aggregation queries**, and the classic shape for that is a **star
schema** — one central **fact table** (the many rows: one row per order
line, per event, per transaction) surrounded by several **dimension
tables** (the "who/what/when/where" — customers, products, dates, regions)
that the fact table references by foreign key.

```
                    dim_customer
                         │
  dim_date ── fact_order_lines ── dim_product
                         │
                    dim_region

  fact_order_lines: order_id, customer_id, product_id, date_id,
                     region_id, quantity, amount   ← one row per line item,
                                                       millions of rows

  dim_product: product_id, name, category, brand   ← thousands of rows,
                                                        rarely changes
```

This is *intentionally* less normalized than module 03's 3NF: a dimension
table like `dim_date` might duplicate "is this a weekend," "is this a
holiday," "fiscal quarter" for every calendar date, rather than deriving it
at query time — trading storage (cheap, especially column-compressed) for
query simplicity and speed (a plain join and `GROUP BY`, no derived
computation per row at query time). Contrast this with the OLTP schema
feeding it, which stays normalized because it optimizes for correct,
non-redundant writes, not for reporting queries.

### Denormalization on purpose vs. denormalization by accident

Module 03 warned against denormalizing an OLTP schema without a measured
reason — redundant data there risks update anomalies you're not prepared
to handle. A star schema's denormalization is different in kind: it's a
**deliberate design for a read-only, batch-loaded destination** with no
concurrent user-facing writes to keep in sync, so the update-anomaly risk
that made denormalization dangerous in OLTP simply doesn't apply the same
way here — the warehouse is rebuilt/refreshed by the ETL/ELT pipeline, not
edited row-by-row by application code.

## Command reference

This module uses **DuckDB** — a real embedded columnar OLAP engine (no
server to run, just a Python library) — to make the row-vs-column
difference tangible without standing up a cluster. Production warehouses
(ClickHouse, Snowflake, BigQuery) are the same columnar idea at a much
larger, distributed scale.

| Concern | DuckDB (Python) |
|---|---|
| In-memory connection | `duckdb.connect()` |
| Load a Postgres table's export | `con.execute("CREATE TABLE t AS SELECT * FROM read_csv('t.csv')")` |
| Query | `con.execute("SELECT ...").fetchall()` |
| Query straight into pandas | `con.execute("SELECT ...").df()` |
| Inspect column storage stats | `con.execute("PRAGMA database_size")` |
| Time a query | wrap in `time.perf_counter()` (DuckDB has no built-in `EXPLAIN ANALYZE` timing output by default in the CLI, but `EXPLAIN ANALYZE <query>` shows the physical plan and timings) |

A star-schema load and aggregation query:

```python
import duckdb

con = duckdb.connect()

con.execute("""
    CREATE TABLE dim_product (product_id INTEGER, name TEXT, category TEXT);
    CREATE TABLE dim_region  (region_id INTEGER, name TEXT);
    CREATE TABLE fact_order_lines (
        order_id INTEGER, product_id INTEGER, region_id INTEGER,
        quantity INTEGER, amount DECIMAL(10,2), order_date DATE
    );
""")

con.execute("INSERT INTO dim_product VALUES (1,'Widget','Hardware'), (2,'Gadget','Hardware'), (3,'Widget Pro','Hardware')")
con.execute("INSERT INTO dim_region VALUES (1,'US'), (2,'EU')")
con.executemany(
    "INSERT INTO fact_order_lines VALUES (?,?,?,?,?,?)",
    [(i, (i % 3) + 1, (i % 2) + 1, 1, 19.99, "2025-01-01") for i in range(1, 100001)],
)

result = con.execute("""
    SELECT p.category, r.name AS region, SUM(f.amount) AS revenue
    FROM fact_order_lines f
    JOIN dim_product p ON f.product_id = p.product_id
    JOIN dim_region  r ON f.region_id  = r.region_id
    GROUP BY p.category, r.name
    ORDER BY revenue DESC
""").fetchall()
print(result)
```

## Hands-on exercises

`pip install duckdb`. No Docker needed for this module — DuckDB runs
in-process.

### 1. Feel the difference: same aggregation, row store vs. columnar

Reuse (or recreate) a `notes`-style table with ~500,000 rows in your
Postgres container from earlier modules (or any wide table you already
have), and run:

```sql
-- On Postgres
EXPLAIN ANALYZE SELECT date_trunc('month', at) AS month, count(*) FROM notes GROUP BY 1;
```

Then load the same data into DuckDB and run the equivalent query:

```python
import duckdb, time

con = duckdb.connect()
con.execute("CREATE TABLE notes AS SELECT * FROM read_csv('notes_export.csv')")

start = time.perf_counter()
con.execute("SELECT date_trunc('month', at) AS month, count(*) FROM notes GROUP BY 1").fetchall()
print(f"DuckDB: {time.perf_counter() - start:.4f}s")
```

Expected: for a table with many columns where this query only touches
`at`, DuckDB's columnar scan reads only that one column and is
noticeably faster than Postgres's row-store scan, which reads full rows
off disk even though most columns are irrelevant to this query. The gap
widens as you add more unrelated columns to the table — read that as the
row-vs-column difference made concrete, not "DuckDB is just faster."

### 2. Build a star schema and query it

Using the star-schema code from the Command reference, run the
category/region revenue rollup. Then add a `dim_date` table (`date_id,
full_date, month, quarter, is_weekend`) and rewrite the query to group by
`month` and `quarter` using `dim_date` instead of computing them from a
raw date column at query time. Expected: the query reads as a plain join
+ `GROUP BY` with no per-row date-math function calls — this is the
payoff of pre-computing "weekend," "quarter," etc. into the dimension
table once at load time instead of recomputing it on every query.

### 3. Prove a normalized OLTP schema and a star schema optimize for
opposite things

Take the star schema's `fact_order_lines`/`dim_product` design and try to
model it the module-03 (3NF) way instead: split `dim_product`'s
`category` out into its own `categories` table referenced by
`dim_product`, the way you would for an OLTP products table. Rewrite the
category/region revenue query against this more-normalized version.
Expected: the query now needs one more join (`fact_order_lines` →
`dim_product` → `categories`) for a query pattern that runs constantly in
a reporting context — a concrete example of why a warehouse deliberately
denormalizes into a small, fixed number of dimension tables rather than
normalizing every attribute the way an OLTP schema would.

### 4. Simulate an ELT load from your OLTP database

Export a real table from a Postgres container you've used earlier in this
track (`\copy orders TO 'orders.csv' CSV HEADER` in `psql`, or
`pg_dump --table=orders --data-only`), then load the raw CSV straight
into DuckDB with no transformation:

```python
con.execute("CREATE TABLE raw_orders AS SELECT * FROM read_csv('orders.csv', header=true)")
```

Now run a transformation *inside* DuckDB (the "T" happening after the
load, i.e. ELT) that builds a summary table from the raw data:

```python
con.execute("""
    CREATE TABLE order_summary AS
    SELECT customer_id, count(*) AS order_count, sum(total) AS lifetime_value
    FROM raw_orders
    GROUP BY customer_id
""")
```

Expected: the raw export loaded as-is, then transformed using the
warehouse engine's own SQL — the ELT pattern, in miniature, versus
transforming the data before it ever reached the warehouse (ETL).

### 5. Diagnose and fix: an analytics query is slowing down checkout

A team runs a monthly revenue-by-region report as a raw SQL query against
their production Postgres — the same database serving checkout. Every
time finance runs it, customer-facing checkout requests start timing out
for a few minutes.

<details>
<summary>Solution</summary>

Root cause: the analytics query is a large, column-scanning,
few-times-a-month operation running against a row-store OLTP database
optimized for the opposite pattern (many small concurrent transactions).
It holds locks and consumes buffer-cache pages and connection-pool slots
(module 07) that checkout's live traffic depends on, and Postgres has to
read full rows even though the report only needs a few columns —
mechanically the wrong storage shape for this query.

Fix, in order of effort: at minimum, point the report at a **read
replica** (module 08), never the primary, so it can't lock or starve
checkout's connections. Better: build a small **data warehouse** (even a
DuckDB or ClickHouse instance loaded via a nightly ELT job from Postgres)
specifically for this and future reporting, so analytical queries run
against a columnar store built for exactly this scan pattern instead of
competing with live traffic on the OLTP box at all.

</details>

## Independent challenge

No code given. You run the library-lending app used elsewhere in this
track. The library's board now wants a monthly report: total books
checked out per branch, per month, broken down by genre, plus average
loan duration per genre. Design a star schema for this: name the fact
table and its grain (what one row represents), name at least three
dimension tables and what each contains, and specify which columns in the
fact table are foreign keys into which dimensions. Then write the ELT
pipeline in words: what gets extracted from the OLTP database, what
(if anything) gets transformed before loading vs. after, and how often it
runs. Finally, argue explicitly why this report should never run as a
live query against the same Postgres database serving checkouts/returns,
tying back to module 07's connection-pool reasoning and module 08's
replica-routing rule.

<details>
<summary>Stuck? One hint</summary>

Fact table: `fact_loans`, one row per loan, with foreign keys
`branch_id`, `genre_id`, `date_id` (for the checkout date), and a
computed `loan_duration_days` column. Dimensions: `dim_branch`,
`dim_genre`, `dim_date` (with pre-computed month/quarter fields, per
exercise 2). The pipeline extracts from the loans/books/branches OLTP
tables nightly, loads raw, then transforms inside the warehouse (ELT) to
compute `loan_duration_days` and roll up into the fact table — no
per-report computation needed at query time.

</details>

## Common mistakes & troubleshooting

- **Running analytics directly against the production OLTP primary.** As
  the diagnose-and-fix exercise showed, a large analytical scan competes
  for locks, buffer cache, and connection-pool slots with live traffic.
  At minimum route it to a replica (module 08); ideally give it its own
  columnar warehouse.
- **Normalizing a star schema the way you'd normalize an OLTP schema.**
  Exercise 3 showed the cost directly: every extra normalized dimension
  table is one more join in a query pattern that runs constantly in
  reporting. A warehouse's controlled denormalization is a deliberate
  trade for read speed, not a mistake to "fix" with more 3NF.
- **Assuming "columnar" just means "a faster Postgres."** The speedup
  comes from reading only the columns a query actually needs off disk —
  a mechanical property of column storage, not a tuning setting you can
  turn on in a row store. A query touching most columns of a table won't
  see the same advantage a narrow aggregation query does.
- **Confusing a data warehouse with a bigger/replicated OLTP database.**
  A read replica (module 08) is still row-oriented Postgres, just a
  second copy — it isolates analytics from production traffic but
  doesn't change the underlying storage shape. A warehouse is a
  different storage engine entirely, built for scan-heavy aggregation.
- **Picking ETL/ELT based on habit rather than where the transform
  compute should live.** ELT pushes transformation cost onto the
  warehouse's own compute (common when that compute is cheap/scalable);
  ETL does it in a separate step beforehand (useful when the warehouse
  shouldn't see raw/unshaped data at all, e.g. for compliance reasons).
  Pick deliberately, not by default.

## Checkpoint quiz

Write down your answer to each question before expanding it — checking
without attempting first is the single easiest way to fool yourself into
thinking you've learned this.

<details>
<summary>Show questions</summary>

1. What's the core difference between an OLTP and an OLAP workload, in
   terms of the queries each runs?
2. Mechanically, why does a columnar engine answer "sum this one column
   across a million rows" faster than a row store, independent of any
   query-planner cleverness?
3. Why is running a large analytics query directly against a production
   OLTP primary a problem, even if the query itself is correct SQL?
4. What is a star schema, and what are the fact table and dimension
   tables each responsible for?
5. Why is a star schema's denormalization considered safe/deliberate,
   when module 03 warned against denormalizing an OLTP schema casually?
6. What's the difference between ETL and ELT?

</summary>
</details>

<details>
<summary>Show answers</summary>

1. OLTP workloads are many small, concurrent operations touching a
   handful of rows (and most/all columns of those rows) at a time — the
   pattern behind serving individual user requests. OLAP workloads are
   large, infrequent aggregation queries scanning millions of rows but
   touching only a few columns — the pattern behind reporting/analytics.
2. Because a columnar engine stores each column's values contiguously on
   disk, an aggregation over one column reads *only that column's data*.
   A row store keeps each row's columns together, so it must read every
   full row off disk even when a query only needs a couple of fields out
   of many — more physical I/O for the same logical question, regardless
   of how smart the query planner is.
3. Because it competes with live traffic for the same locks, buffer
   cache, and connection-pool slots (module 07) that user-facing
   requests depend on — a large scan can starve or block real
   transactions even though the analytical SQL is itself correct.
4. A star schema is a data-warehouse modeling pattern with one central
   fact table (the many rows — one per event/transaction/order line,
   referencing dimensions by foreign key) surrounded by several dimension
   tables (the "who/what/when/where" context — customers, products,
   dates, regions) that change far less often and are joined in to give
   the fact rows meaning.
5. Because a warehouse's dimension tables are rebuilt/refreshed by a
   batch ETL/ELT pipeline, not edited row-by-row by concurrent
   application writes — the update-anomaly risk that makes casual OLTP
   denormalization dangerous (multiple copies of the same fact going out
   of sync under concurrent edits) doesn't apply the same way to a
   read-only, pipeline-refreshed destination.
6. ETL transforms the data in a separate processing step *before*
   loading it into the warehouse. ELT loads the raw data in first, then
   performs the transformation using the warehouse's own compute,
   afterward. ELT is common with modern warehouses powerful/cheap enough
   to do that transformation work themselves.

</details>

## Further reading & sources

- [DuckDB documentation](https://duckdb.org/docs/) - the embedded columnar engine used throughout this module's exercises.
- [Designing Data-Intensive Applications (Kleppmann), Ch. 3](https://dataintensive.net/) - the definitive treatment of row-oriented vs. column-oriented storage engines.
- [Kimball Group: The Data Warehouse Toolkit — star schema basics](https://www.kimballgroup.com/data-warehouse-business-intelligence-resources/kimball-techniques/dimensional-modeling-techniques/) - the canonical reference for fact/dimension modeling used in this module.
- [ClickHouse: Why ClickHouse is fast](https://clickhouse.com/docs/en/concepts/why-clickhouse-is-so-fast) - a production columnar engine's own explanation of the same row-vs-column mechanics taught here.
- [Snowflake: OLAP vs OLTP](https://www.snowflake.com/guides/olap-vs-oltp/) - a vendor's side-by-side comparison consistent with this module's framing.

## Next

[10-multi-tenancy-patterns](../10-multi-tenancy-patterns/README.md) —
another data-layer architecture decision this track hasn't covered yet:
when your application serves many separate customers from one codebase,
how do you decide whether their data lives in one shared schema, separate
schemas, or entirely separate databases?
</content>
