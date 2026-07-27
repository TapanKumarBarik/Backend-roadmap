# Module 05: ORMs and Migrations

## Why this matters

You've been writing raw SQL by hand for five modules. That was the right way to
learn — you can't reason about what an ORM does until you know the SQL it
generates. But no team runs a real application on hand-strung SQL strings
scattered through handlers; they use an **ORM** (Object-Relational Mapper) to
map database rows to language objects, and they use a **migration tool** to
evolve the schema over time in a versioned, repeatable, reviewable way. This
module is where the raw SQL you know gets a production-grade workflow around it.

The two halves are equally important and equally easy to get wrong. An ORM
(SQLAlchemy, here) removes a mountain of boilerplate and gives you type-safe,
composable queries — but it also hides the SQL it generates, and the number-one
performance disaster in web apps (the N+1 query problem, module 07) is an ORM
convenience feature firing off hundreds of hidden queries. Knowing what the ORM
buys you *and what it costs you*, and knowing when to drop to raw SQL, is a
senior skill. Migrations are where it gets genuinely dangerous: changing a
schema on an empty dev database is trivial; changing it on a live production
table with fifty million rows and live traffic can lock the table and take your
whole site down for ten minutes. Writing **safe, reversible** migrations — and
knowing which operations are silently catastrophic — is one of the highest-stakes
routine tasks a backend engineer does.

## Concepts

### What an ORM is, and what it buys you

An ORM maps **classes to tables**, **instances to rows**, and **attributes to
columns**, so you work with Python objects instead of SQL strings and result
tuples. In SQLAlchemy (the dominant Python ORM), you declare models, get a
`Session` to talk to the database, and navigate **relationships** as ordinary
attributes:

```python
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship
from sqlalchemy import ForeignKey, create_engine
from sqlalchemy.orm import Session

class Base(DeclarativeBase): ...

class Customer(Base):
    __tablename__ = "customers"
    id:     Mapped[int] = mapped_column(primary_key=True)
    email:  Mapped[str] = mapped_column(unique=True)
    orders: Mapped[list["Order"]] = relationship(back_populates="customer")

class Order(Base):
    __tablename__ = "orders"
    id:          Mapped[int] = mapped_column(primary_key=True)
    customer_id: Mapped[int] = mapped_column(ForeignKey("customers.id"))
    total_cents: Mapped[int]
    customer:    Mapped["Customer"] = relationship(back_populates="orders")

engine = create_engine("postgresql+psycopg://postgres:devpass@localhost:5432/shop")

with Session(engine) as s:
    c = Customer(email="ada@example.com")
    c.orders.append(Order(total_cents=500))   # relationship handles the FK
    s.add(c)
    s.commit()                                  # INSERTs both, wires up customer_id
    # navigate the relationship like a normal attribute:
    for o in c.orders:
        print(o.total_cents)
```

What you bought: no manual SQL for CRUD, no manual result-tuple unpacking,
type-checked models, relationship navigation, and — importantly — **portable,
composable query building** (`select(Order).where(...).order_by(...)`) plus
protection against SQL injection (values are always parameterized, never string
-concatenated).

### What an ORM costs you

The costs are real and you must respect them:

- **Hidden SQL, hidden cost.** `for o in customer.orders:` looks free; it may
  fire a query. Iterating a list of customers and touching each one's `.orders`
  fires *one query per customer* — the **N+1 problem** (module 07 fixes it with
  eager loading). The abstraction hides the thing you most need to see.
- **The leaky abstraction.** For complex analytical queries, window functions,
  recursive CTEs, or database-specific features, the ORM's query API gets
  awkward or can't express it — and you fight the tool. This is when you drop to
  raw SQL (below).
- **The session/identity map and "when does it hit the DB."** SQLAlchemy batches
  changes and flushes them at specific times; not understanding *when* a query
  actually executes leads to surprising ordering bugs and stale reads.
- **Object overhead.** Loading a million rows as fully-hydrated Python objects
  is far heavier than streaming raw rows. For bulk work, use Core / bulk
  operations, not the ORM object layer.

The mature stance: **use the ORM for the 95% of ordinary CRUD and relationship
work where it's a huge win, and drop to raw SQL deliberately for the 5% where
it isn't.** SQLAlchemy makes that easy — `session.execute(text("..."))` runs raw
SQL through the same connection/transaction.

### Sessions and the unit of work

A SQLAlchemy `Session` is a **unit of work**: it tracks the objects you've
added/changed and translates them into `INSERT`/`UPDATE`/`DELETE` at
`flush`/`commit` time, all within one transaction. The session is *not*
thread-safe and is meant to be short-lived — one per request/task, opened late
and closed promptly (exactly the transaction-hygiene lesson from module 04). In
a FastAPI app the session is provided per-request via dependency injection (the
`Depends(get_db)` pattern from track 02), and the repository layer (module 06)
is the only place that uses it.

### When to drop to raw SQL

Drop to raw SQL when the ORM fights you or hides cost you need to control:

```python
from sqlalchemy import text

with Session(engine) as s:
    # a reporting query with window functions the ORM API expresses awkwardly
    rows = s.execute(text("""
        SELECT customer_id,
               total_cents,
               rank() OVER (PARTITION BY customer_id ORDER BY total_cents DESC) AS r
        FROM   orders
    """)).all()
```

Good reasons: complex analytics/reporting, database-specific features, bulk
operations where object overhead matters, or a hot query you must hand-tune
after reading its `EXPLAIN` (module 07). Still parameterize — `text("... WHERE
id = :id"), {"id": x}` — never f-string user input into SQL.

### Migrations: versioned, reversible schema change

Your models define the *desired* schema; the *actual* database schema has to be
changed to match, over and over, as the app evolves — and it must change
identically across every developer's machine, staging, and production, in the
right order. That's what a **migration tool** does. **Alembic** (SQLAlchemy's
migration tool) represents each schema change as a versioned script with an
`upgrade()` and a `downgrade()`, chained in a linear (or branched) history, each
identified by a revision id and pointing at its parent (`down_revision`).

```python
# alembic/versions/a1b2_add_status_to_orders.py
revision = "a1b2"
down_revision = "9f8e"

def upgrade():
    op.add_column("orders", sa.Column("status", sa.Text(), nullable=False,
                                       server_default="pending"))

def downgrade():
    op.drop_column("orders", "status")
```

Alembic can **autogenerate** a migration by diffing your models against the live
database (`alembic revision --autogenerate`), but you must *read and edit* what
it produces — autogenerate misses things (server defaults, some constraint
changes, data migrations) and sometimes generates destructive operations you
didn't intend. Migrations are code: reviewed, committed, run in order
(`alembic upgrade head`), and reversible (`alembic downgrade -1`).

### Safe, reversible migrations on a live production table

This is the highest-stakes part. On an empty dev DB every migration is instant.
On a live table with millions of rows and concurrent traffic, some operations
take a lock that blocks all reads/writes for the duration — an outage. The rules:

- **Adding a column is usually safe** — *if* it's nullable or has a constant
  default. (Modern Postgres 11+ adds a column with a constant default without
  rewriting the table; a *volatile* default still rewrites it.) Adding `NOT
  NULL` without a default to a populated table fails or locks.
- **Creating an index locks writes** unless you use `CREATE INDEX
  CONCURRENTLY` (module 03), which builds without blocking writes but can't run
  inside a transaction — Alembic needs special handling for it.
- **Dropping or renaming a column/table is destructive and often not
  backward-compatible** with the currently-running app code. If old app
  instances are still running during a deploy and the column vanishes, they
  crash.
- **The expand/contract (a.k.a. parallel change) pattern** is the safe way to
  make breaking changes: (1) *expand* — add the new column/table alongside the
  old, deploy code that writes to both; (2) *migrate* — backfill data in
  batches; (3) *contract* — once all code uses the new shape, drop the old in a
  later migration. Never rename a column in one step on a live system; add-new,
  backfill, switch reads, drop-old.
- **Backfill in batches, not one giant `UPDATE`.** `UPDATE huge_table SET ...`
  in one statement locks every row it touches and can run for minutes; loop in
  chunks of a few thousand with commits between.
- **Always write a real `downgrade()`.** A migration you can't reverse is a
  migration you can't safely deploy — if it breaks in production you need the
  exit.

## Command reference

| Command / API | Purpose | Example |
|---|---|---|
| `alembic init alembic` | Scaffold Alembic in a project | run once |
| `alembic revision -m "msg"` | Create an empty migration | hand-write `upgrade`/`downgrade` |
| `alembic revision --autogenerate -m "msg"` | Diff models→DB into a migration | **review the output!** |
| `alembic upgrade head` | Apply all pending migrations | deploy step |
| `alembic upgrade +1` / `downgrade -1` | Move one step | testing reversibility |
| `alembic downgrade <rev>` | Roll back to a revision | recovery |
| `alembic history` / `current` | Show migration graph / current rev | audit |
| `op.add_column / drop_column` | Alembic schema ops | in `upgrade()` |
| `op.create_index(..., postgresql_concurrently=True)` | Non-blocking index build | live tables |
| `session.execute(text("..."))` | Run raw SQL through the ORM | drop-to-SQL |
| `select(Model).where(...)` | ORM query construction | `select(Order).where(Order.total_cents > 100)` |
| `relationship(back_populates=...)` | Declare a mapped relationship | see models above |

A minimal but complete SQLAlchemy query cheat set:

```python
from sqlalchemy import select, func

with Session(engine) as s:
    # get by primary key
    order = s.get(Order, 1)

    # filter + order + limit
    recent = s.scalars(
        select(Order).where(Order.total_cents > 1000).order_by(Order.id.desc()).limit(10)
    ).all()

    # aggregate (the module 02 report, ORM-style)
    rows = s.execute(
        select(Customer.email, func.count(Order.id))
        .join(Order, isouter=True)          # LEFT JOIN
        .group_by(Customer.email)
    ).all()

    # update + commit (unit of work)
    order.total_cents = 999
    s.commit()
```

## Hands-on exercises

You'll build a tiny project with SQLAlchemy models and a real Alembic migration
history against the `pg-data` Postgres. Set up a Python venv with the deps:

```bash
python -m venv .venv && source .venv/bin/activate   # (Windows: .venv\Scripts\activate)
pip install "sqlalchemy>=2" alembic "psycopg[binary]"
```

### 1. Define models and create the schema

Put the `Customer`/`Order` models from Concepts in `models.py`, then create the
tables directly (we'll switch to Alembic in exercise 3):

```python
from models import Base, engine
Base.metadata.create_all(engine)
```

Expected: `\dt` in psql shows `customers` and `orders` with the FK. (In real
projects you let Alembic own the schema and *don't* call `create_all` — this is
just to see it work once.)

### 2. CRUD and relationship navigation through the ORM

Write a script that inserts a customer with two orders, then queries and prints
each customer with their order count using the ORM aggregate from the cheat set.
Turn on SQL echo to *see the generated SQL*:

```python
engine = create_engine(URL, echo=True)   # echo=True prints every SQL statement
```

Expected: the console prints the actual `INSERT` and `SELECT ... GROUP BY`
statements SQLAlchemy generates. Read them — this is the habit that keeps the
ORM from hiding cost from you.

### 3. Initialize Alembic and take control of the schema

```bash
alembic init alembic
```

Edit `alembic.ini`'s `sqlalchemy.url` (or better, set it in `env.py` from an env
var) to your Postgres URL, and point `env.py`'s `target_metadata` at
`Base.metadata`. Then drop the hand-created tables and let Alembic autogenerate
the initial schema:

```bash
# in psql: DROP TABLE orders, customers;
alembic revision --autogenerate -m "initial schema"
```

Open the generated file in `alembic/versions/`. Expected: it contains
`op.create_table("customers", ...)` and `op.create_table("orders", ...)` with the
FK. **Read it before applying.** Then:

```bash
alembic upgrade head
alembic current
```

Expected: tables exist again and `alembic current` shows the revision as
applied.

### 4. A safe additive migration

Add a `status` column to the `Order` model (`status: Mapped[str] =
mapped_column(server_default="pending")`), then:

```bash
alembic revision --autogenerate -m "add status to orders"
```

Inspect the generated `upgrade()`/`downgrade()`. Expected: `op.add_column(...)`
with the server default (an additive, safe change). Apply it, confirm with `\d
orders`, then test reversibility:

```bash
alembic upgrade head
alembic downgrade -1     # column should disappear
alembic upgrade head     # and come back
```

Expected: the column appears, disappears, and reappears cleanly — a properly
reversible migration.

### 5. Write a data migration (backfill) by hand

Autogenerate only handles *schema*, not *data*. Suppose existing orders should
get `status = 'legacy'`. Hand-write a migration:

```python
def upgrade():
    op.execute("UPDATE orders SET status = 'legacy' WHERE status = 'pending'")
def downgrade():
    op.execute("UPDATE orders SET status = 'pending' WHERE status = 'legacy'")
```

Expected: after `alembic upgrade head`, pre-existing rows show `legacy`. This is
the pattern for any migration that must transform data, not just structure.

### 6. Drop to raw SQL inside the ORM

Write the module 02 "customers ranked by spend" report *twice*: once with the
ORM query API, once with `session.execute(text(...))` using a window function.
Confirm they return the same data.

Expected: both work; the raw-SQL version is cleaner for the window function.
This is the "use the ORM for CRUD, drop to SQL for analytics" principle made
concrete — and both run inside the same session/transaction.

### 7. Reproduce (and see) the N+1 problem the ORM hides

```python
with Session(engine) as s:
    customers = s.scalars(select(Customer)).all()   # 1 query
    for c in customers:
        print(len(c.orders))                          # one query PER customer!
```

Run with `echo=True`. Expected: you see **1** `SELECT customers` followed by
**one `SELECT orders WHERE customer_id = ?` per customer** — the N+1 pattern,
generated silently by innocent-looking attribute access. Note it now; module 07
fixes it with eager loading (`selectinload`). This exercise exists so you *feel*
the "hidden cost" the ORM abstraction introduces.

### 8. Diagnose and fix: a migration that would take production down

A teammate wrote this migration to add a required `country` column to a
`users` table that has 40 million rows and constant live traffic:

```python
def upgrade():
    op.add_column("users", sa.Column("country", sa.Text(), nullable=False))
    op.create_index("ix_users_country", "users", ["country"])
def downgrade():
    op.drop_index("ix_users_country"); op.drop_column("users", "country")
```

Explain every way this hurts in production, and rewrite it to be safe.

<details>
<summary>Answer</summary>

Problems: (1) `add_column ... nullable=False` **with no default** on a populated
table fails outright (existing 40M rows have no value) — and even a version that
took a lock to enforce NOT NULL would block traffic; (2) `create_index` without
`CONCURRENTLY` takes a lock that blocks all writes to `users` for the entire
(long) build — a multi-minute outage on 40M rows; (3) it's a breaking change
deployed in one step: if any old app instances are still running they don't know
about `country`.

Safe rewrite uses expand/contract and non-blocking operations, typically split
across more than one migration/deploy:

```python
# migration 1 (additive, safe): nullable column with a default
def upgrade():
    op.add_column("users", sa.Column("country", sa.Text(), nullable=True,
                                      server_default="unknown"))
# deploy app code that populates country on writes

# migration 2 (backfill in batches, not one giant UPDATE)
def upgrade():
    conn = op.get_bind()
    while True:
        r = conn.execute(sa.text("""
            UPDATE users SET country='unknown'
            WHERE id IN (SELECT id FROM users WHERE country IS NULL LIMIT 5000)
        """))
        if r.rowcount == 0: break

# migration 3 (now safe to tighten + index concurrently)
def upgrade():
    op.alter_column("users", "country", nullable=False)
    op.create_index("ix_users_country", "users", ["country"],
                    postgresql_concurrently=True)  # requires non-transactional migration
```

The principles: add nullable-with-default first (instant), backfill in batches
(no long lock), tighten to NOT NULL and build the index `CONCURRENTLY` only
after data is populated and code is deployed. Every step is individually safe
and the app keeps serving traffic throughout.

</details>

## Independent challenge

No code given. Take the normalized schema you designed for the module 03
independent challenge (the library lending system) and give it a real
SQLAlchemy + Alembic implementation: models with relationships, an
autogenerated initial migration you've read and cleaned up, and then a
*second*, deliberately tricky migration that adds a `late_fee_cents` column to
loans **and** backfills it for existing overdue loans — written safely as if the
loans table were huge and live (nullable-with-default, batched backfill,
reversible). Prove reversibility by upgrading and downgrading. Then write two
data-access functions: one pure-ORM (find all outstanding loans for a member)
and one that deliberately drops to raw SQL because the ORM makes it awkward (a
report using a window function, e.g. each member ranked by number of loans).
Reach back to module 04: wrap the "check out a copy" operation (which reads
availability then inserts a loan) in a transaction with the correct locking so
two librarians can't lend the same copy simultaneously.

<details>
<summary>Hint</summary>

The "check out a copy" write is exactly the module-04 concurrency problem: read
"is this copy available?" then insert a loan is a two-step race — two librarians
both see "available" and both insert. Lock the copy row (`with_for_update()`) or
the outstanding-loan check inside the transaction so the second librarian
blocks and then sees the copy as taken. For the safe migration, remember the
order: add `late_fee_cents` nullable with `server_default='0'` (instant),
backfill overdue loans in batches, and only then consider tightening — and write
the `downgrade()` for every step. Turn on `echo=True` while testing the ORM
function to confirm you're not accidentally triggering N+1 across the loan
relationships.

</details>

## Common mistakes & troubleshooting

- **Letting the ORM hide N+1 queries.** Innocent attribute access in a loop
  fires one query per iteration. Turn on `echo=True` during development to *see*
  the SQL; fix with eager loading (module 07).
- **Running `create_all()` in production instead of migrations.** It creates
  missing tables but never *alters* existing ones and has no history/rollback.
  Let Alembic own the schema; `create_all` is for throwaway/test setups only.
- **Trusting `--autogenerate` blindly.** It misses data migrations, some
  constraint and default changes, and can emit destructive ops. Always read and
  edit the generated script before committing it.
- **`add_column NOT NULL` with no default on a populated table.** Fails or locks.
  Add nullable-with-default, backfill, then tighten.
- **`CREATE INDEX` without `CONCURRENTLY` on a live table.** Blocks writes for
  the whole build. Use `postgresql_concurrently=True` (and the non-transactional
  migration setup it requires).
- **Renaming/dropping a column in one step on a live system.** Breaks
  still-running old app instances mid-deploy. Use expand/contract: add new,
  backfill, switch reads/writes, drop old later.
- **One giant backfill `UPDATE`.** Locks every affected row for the whole run.
  Batch it in chunks with commits between.
- **No `downgrade()`.** A migration you can't reverse is one you can't safely
  deploy. Write and test the downgrade.
- **Long-lived or shared sessions.** The `Session` isn't thread-safe and holds a
  transaction; scope it per request/task, open late, commit/close promptly.

## Checkpoint quiz

Write down your answer to each question before expanding it — checking without attempting first is the single easiest way to fool yourself into thinking you've learned this.

1. Name three concrete things an ORM buys you and three concrete things it costs
   you.
2. What is a SQLAlchemy `Session`, why should it be short-lived, and how does
   that connect to module 04's transaction hygiene?
3. Give two situations where dropping to raw SQL is the right call, and one rule
   you must still follow when you do.
4. What does an Alembic migration's `upgrade()`/`downgrade()` pair represent,
   and why must you read what `--autogenerate` produces rather than trusting it?
5. Why is adding a nullable column with a constant default usually safe on a
   huge live table, while adding a `NOT NULL` column without a default is not?
6. Describe the expand/contract pattern and why you'd never rename a column in
   one step on a live system.
7. Why must a big backfill be batched rather than done in a single `UPDATE`?

<details>
<summary>Answers</summary>

1. Buys: no hand-written CRUD SQL, relationship navigation as attributes,
   type-checked composable query building, and automatic parameterization
   (injection safety). Costs: hidden SQL/cost (N+1), a leaky abstraction that
   fights complex queries, needing to understand *when* it hits the DB
   (session/flush timing), and object-hydration overhead for bulk data.
2. A unit of work that tracks object changes and emits them as SQL within one
   transaction. It should be short-lived and per-request because it isn't
   thread-safe and it holds a transaction (and thus locks) — the same "open late,
   commit promptly" discipline that keeps module 04's transactions short.
3. E.g. complex analytics/window functions/recursive CTEs the ORM expresses
   poorly, database-specific features, bulk operations, or hand-tuning a hot
   query after reading its EXPLAIN. The rule that still applies: parameterize
   inputs (`text("... :id"), {...}`) — never string-concatenate user input.
4. It represents one reversible schema (or data) change: `upgrade()` applies it,
   `downgrade()` undoes it, chained by revision id. You must read autogenerate's
   output because it misses data migrations, some defaults/constraints, and can
   emit destructive operations you didn't intend.
5. Modern Postgres can add a nullable column with a *constant* default as a
   metadata-only change (no table rewrite, instant), so it doesn't block traffic.
   A `NOT NULL` column with no default has no valid value for existing rows, so
   it fails or forces a blocking rewrite/validation.
6. Expand/contract: add the new column/table alongside the old and write to both
   (expand), backfill data, switch reads to the new shape, then drop the old in
   a later migration (contract). A one-step rename breaks any old app instances
   still running during the deploy, since the column they expect vanishes
   instantly.
7. A single `UPDATE` over millions of rows locks all affected rows and runs for
   a long time, blocking concurrent traffic and holding a huge transaction.
   Batching in chunks with commits between releases locks frequently and keeps
   each transaction short.

</details>

## Next

[06-business-logic-layer-and-separation-of-concerns](../06-business-logic-layer-and-separation-of-concerns/README.md)
— you can now model data and evolve its schema safely; next you'll put the data
layer in its proper place within a layered architecture (revisiting track 02's
handlers/services), formalize the repository pattern, and get domain models and
database models cleanly separated.
</content>
</invoke>
