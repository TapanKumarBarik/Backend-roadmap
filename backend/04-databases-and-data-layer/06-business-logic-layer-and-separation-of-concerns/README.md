# Module 06: Business Logic Layer and Separation of Concerns

## Why this matters

In track 02 you built handlers, services, and a repository — but that
repository was a fake in-memory `dict`, and the whole layered structure was
about *HTTP* concerns: keeping business rules out of route functions. Now you
have a real database, an ORM, transactions, and migrations. This module is where
the two threads meet: it puts the data layer in its correct architectural
place, and it answers the questions track 02 deliberately postponed. *Where
exactly does a SQLAlchemy session live? Should a service know it's talking to
Postgres? Is a SQLAlchemy model the same thing as your business's "Order," or
something you should hide?*

Get this wrong and you get the two most common architectural rots in real
backends. Rot #1: the ORM leaks everywhere — SQLAlchemy models and query
objects show up in handlers, in business logic, in the response serialization,
so the database's shape dictates your entire application's shape and you can
never change either without touching everything. Rot #2: business rules smear
across layers — some validation in the handler, some in the service, some
enforced only by a database constraint, some nowhere — so nobody can say where
"the rules" live. This module gives you the principles (SRP, open-closed,
dependency inversion) and the concrete patterns (three-layer architecture, the
repository pattern, domain-vs-database models, disciplined error propagation)
that keep a growing codebase from collapsing under its own weight. It's the
least "database-y" module in the track and the most important for building
systems that survive contact with change.

## Concepts

### The three-layer architecture, with the data layer in its place

Track 02 introduced handler → service → repository. Restated as the classic
**three layers** with the data layer now real:

- **Presentation layer** (handlers/controllers): speaks the outside world's
  protocol — HTTP, JSON, status codes. Knows *nothing* about SQL or the
  database.
- **Business logic layer** (services / domain): the rules and workflows —
  "placing an order reserves stock, charges the customer, and can't happen for
  a suspended account." Knows nothing about HTTP *or* SQL. This is the heart of
  your application and the part worth protecting most.
- **Data access layer** (repositories): the *only* code that talks to the
  database (SQLAlchemy sessions, queries, transactions). Everything about
  "we use Postgres via SQLAlchemy" is confined here.

Dependencies point **downward only**: presentation depends on business, business
depends on data. Nothing points up. The payoff, concretely: you can swap
Postgres for another store, or the ORM for raw SQL, and only the data layer
changes; you can test business rules with a fake repository and no database; you
can change your JSON response shape without touching a single business rule.

### The design principles that make it hold (SRP, OCP, DIP)

Three of the "SOLID" principles do most of the work here:

- **Single Responsibility Principle (SRP):** each module/class has one reason to
  change. A handler changes when the HTTP contract changes; a service when a
  business rule changes; a repository when the storage changes. When one class
  does two of these, a storage change forces you to re-test business logic, and
  vice versa. SRP is *why* the layers exist.
- **Open-Closed Principle (OCP):** code should be open to extension but closed
  to modification — you add new behaviour without editing (and risking) working
  code. In practice this means programming to interfaces/abstractions so a new
  implementation slots in without rewriting callers (e.g. a new
  `PostgresOrderRepository` alongside the fake, both satisfying one repository
  interface).
- **Dependency Inversion Principle (DIP):** high-level modules (business logic)
  should not depend on low-level modules (the database); both should depend on
  an *abstraction*. The service shouldn't import SQLAlchemy — it should depend
  on a `OrderRepository` *interface* and receive a concrete implementation from
  outside (dependency injection, track 02 module 05). This is the single most
  important idea in the module: **the business logic defines what it needs
  (an interface); the data layer provides it.** Dependencies are "inverted" —
  the low-level detail depends on the high-level contract, not the reverse.

### Domain models vs database models

A **database model** is a SQLAlchemy class: it mirrors table structure, carries
ORM machinery (relationships, lazy loading, session state), and exists to
persist and query rows. A **domain model** represents a business concept and its
rules — an `Order` that knows it can't be more than some total, that a
cancellation is only allowed before shipping. These are *not automatically the
same thing*, and conflating them is the most common source of the "ORM leaks
everywhere" rot.

The honest, pragmatic spectrum:

- **Small/CRUD apps:** using the SQLAlchemy model directly as your domain object
  is fine and common — don't build ceremony you don't need. The cost is that
  your business objects carry ORM state and your persistence shape and business
  shape are coupled.
- **Complex domains:** keep them separate — plain Python domain objects (often
  `@dataclass` or Pydantic) holding the rules, and separate SQLAlchemy models
  the repository maps to/from. The service works only with domain objects and
  never sees a SQLAlchemy class. This costs mapping code but buys a business
  layer that's pure, testable, and independent of how (or whether) you persist.

The key discipline regardless of which you choose: **don't let SQLAlchemy model
instances travel all the way out to your HTTP responses.** Convert to a
response schema (Pydantic) at the boundary. A raw ORM object serialized to JSON
leaks your table structure to clients and can trigger surprise lazy-load queries
during serialization.

### The repository pattern

A **repository** is an object that mediates between the business layer and the
data store, exposing a *collection-like, domain-oriented* interface —
`get(id)`, `add(order)`, `find_outstanding_for(member)` — while hiding *all* the
SQL/ORM/session details inside. The business layer calls
`repo.find_outstanding_for(member)`; it does not know or care that this runs a
`SELECT ... WHERE returned_at IS NULL` with a specific index.

```python
from typing import Protocol

# The abstraction the business layer depends on (DIP): an interface, not SQLAlchemy.
class OrderRepository(Protocol):
    def get(self, order_id: int) -> "Order | None": ...
    def add(self, order: "Order") -> None: ...
    def list_for_customer(self, customer_id: int) -> list["Order"]: ...

# Concrete implementation, the ONLY place SQLAlchemy appears:
class SqlAlchemyOrderRepository:
    def __init__(self, session: "Session"):
        self._session = session
    def get(self, order_id: int) -> "Order | None":
        return self._session.get(OrderModel, order_id)
    def add(self, order) -> None:
        self._session.add(order)
    def list_for_customer(self, customer_id: int) -> list:
        return self._session.scalars(
            select(OrderModel).where(OrderModel.customer_id == customer_id)
        ).all()

# A fake for tests — same interface, no database:
class FakeOrderRepository:
    def __init__(self): self._orders = {}
    def get(self, order_id): return self._orders.get(order_id)
    def add(self, order): self._orders[order.id] = order
    def list_for_customer(self, customer_id):
        return [o for o in self._orders.values() if o.customer_id == customer_id]
```

Now the service depends only on the `OrderRepository` *interface*, gets a
concrete one injected, and is trivially testable with the fake — exactly what
track 02 module 06 promised, now backed by a real database instead of a dict.
Repositories also become the natural home for the transaction boundary (a
service method does a unit of work; the repository/session commits it) and for
concentrating the concurrency controls from module 04 (`with_for_update`) in one
reviewed place.

### Service-layer error propagation up to the presentation layer

Errors must travel up the layers *changing form appropriately* at each boundary —
this is the through-line that ties this module to track 02's centralized error
handling:

1. **Data layer** surfaces low-level failures — a `NoResultFound`, an
   `IntegrityError` (a unique/foreign-key violation), a serialization failure.
   The repository catches the *database-specific* ones and either handles them
   or translates them into something the business layer understands (e.g. a
   unique-violation on email → a `DuplicateEmail` domain concept). It does *not*
   let a raw `psycopg` exception leak upward — that would couple the business
   layer to the driver.
2. **Business layer** raises **domain exceptions** (`OrderNotFound`,
   `InsufficientStock`, `AccountSuspended`) — HTTP-ignorant, storage-ignorant,
   expressing *what went wrong in business terms*. This is exactly track 02
   module 06's rule, now with a real data layer beneath it.
3. **Presentation layer** maps each domain exception to an HTTP status and the
   standard error envelope in *one central place* (the exception handlers from
   track 02). The handler itself stays free of `try/except`.

The litmus tests, updated for a real data layer: a *service* that imports
`fastapi` has HTTP leaking down; a *service* that imports `sqlalchemy` (or
catches `IntegrityError`) has the database leaking up; a *handler* that runs a
query has the data layer leaking up. Each of those is a specific, nameable rot.

## Command reference

This module is about structure, so the "reference" is a placement table:
*what belongs in which layer, and what must never appear there.*

| Concern | Belongs in | Must NOT appear in |
|---|---|---|
| Parse/validate request, status codes, JSON | Presentation (handler) | anywhere else |
| Business rules & invariants | Business (service/domain) | handler, repository |
| Domain exceptions (`OrderNotFound`) | raised by Business | — |
| SQL / SQLAlchemy session / queries | Data (repository) | handler, service |
| Transaction boundary & locking (`FOR UPDATE`) | Data (repository), driven by a service unit-of-work | handler |
| Translating `IntegrityError` → domain concept | Data (repository) | service, handler |
| Mapping domain exception → HTTP envelope | Presentation (central handler) | service |
| Converting ORM object → response schema | Presentation boundary | — |

Wiring it together with dependency injection (FastAPI, tying track 02's
`Depends` to this track's session):

```python
from fastapi import Depends
from sqlalchemy.orm import Session

def get_db() -> Session:                       # one session per request
    with SessionLocal() as s:
        yield s

def get_order_repo(db: Session = Depends(get_db)) -> OrderRepository:
    return SqlAlchemyOrderRepository(db)       # concrete impl chosen HERE, once

def get_order_service(repo: OrderRepository = Depends(get_order_repo)) -> OrderService:
    return OrderService(repo)                  # service gets the interface, not SQLAlchemy

# handler: thin, HTTP-only, delegates to the service, returns a response schema
@router.post("/orders", status_code=201, response_model=OrderOut)
def create_order(body: OrderCreate, svc: OrderService = Depends(get_order_service)):
    order = svc.place_order(customer_id=body.customer_id, items=body.items)
    return OrderOut.model_validate(order)      # convert at the boundary — no ORM object out

# service: pure business rules, depends on the interface, no fastapi, no sqlalchemy
class OrderService:
    def __init__(self, repo: OrderRepository):
        self._repo = repo
    def place_order(self, customer_id: int, items: list) -> "Order":
        if not items:
            raise EmptyOrderError()            # domain exception
        # ... business rules ...
        order = Order(customer_id=customer_id, items=items)
        self._repo.add(order)
        return order
```

## Hands-on exercises

Build on the SQLAlchemy project from module 05. The goal is to physically
separate the layers into modules — `presentation.py` (or `handlers.py`),
`services.py`, `repository.py`, `domain.py`/`models.py`, `errors.py` — and prove
the separation holds.

### 1. Define the repository interface and two implementations

Create `repository.py` with an `OrderRepository` `Protocol`, a
`SqlAlchemyOrderRepository`, and a `FakeOrderRepository` (all three from
Concepts). Confirm by import that `errors.py`/`services.py` never import
SQLAlchemy and `repository.py` is the only file that does.

Expected: `grep -l "import sqlalchemy" *.py` (or the Grep tool) lists only
`repository.py` and `models.py` — never `services.py` or the handler module.

### 2. Write a service that depends only on the interface

```python
# services.py — no sqlalchemy, no fastapi imports
from errors import EmptyOrderError, OrderNotFound

class OrderService:
    def __init__(self, repo):            # repo: OrderRepository interface
        self._repo = repo
    def place_order(self, customer_id, items):
        if not items:
            raise EmptyOrderError()
        order = self._repo.add_order(customer_id, items)
        return order
    def get_order(self, order_id):
        order = self._repo.get(order_id)
        if order is None:
            raise OrderNotFound()
        return order
```

Expected: the file imports only from `errors` (and stdlib). That import list is
the proof of separation.

### 3. Unit-test business rules with the fake repo — no database

```python
from repository import FakeOrderRepository
from services import OrderService
from errors import EmptyOrderError

svc = OrderService(FakeOrderRepository())
order = svc.place_order(1, [{"sku": "x", "qty": 1}])
assert order is not None
try:
    svc.place_order(1, [])
    assert False
except EmptyOrderError:
    pass
print("business rules pass — no Postgres required")
```

Expected: passes instantly with no database running. That speed and isolation is
the entire payoff of dependency inversion.

### 4. Run the same service against real Postgres via the SQLAlchemy repo

Wire `OrderService(SqlAlchemyOrderRepository(session))` against `pg-data` and
place a real order. Expected: identical service code, now persisting rows —
because the service only ever saw the interface, swapping fake→real changed
nothing in the business layer. This *is* the open-closed / dependency-inversion
principle demonstrated.

### 5. Translate a database error into a domain concept

Make `customers.email` unique, then have the repository catch SQLAlchemy's
`IntegrityError` on a duplicate insert and raise a domain `DuplicateEmail`
instead:

```python
from sqlalchemy.exc import IntegrityError
from errors import DuplicateEmail

def add_customer(self, email):
    try:
        c = CustomerModel(email=email)
        self._session.add(c); self._session.flush()
        return c
    except IntegrityError:
        self._session.rollback()
        raise DuplicateEmail(email)      # domain concept, storage detail hidden
```

Expected: the service/handler above never sees `IntegrityError` — only
`DuplicateEmail`. The database-specific exception was translated at the data
boundary, so the business layer stays driver-agnostic.

### 6. Convert ORM objects to response schemas at the boundary

Define a Pydantic `OrderOut` and have the handler return
`OrderOut.model_validate(order)` rather than the SQLAlchemy object. Then
deliberately return the raw ORM object instead and observe the difference (extra
lazy-load queries, table-shaped JSON, or a serialization error).

Expected: the response schema gives a stable, intentional JSON shape and no
surprise queries; returning the ORM object leaks structure and can fire lazy
loads during serialization. This is the presentation-boundary discipline.

### 7. Trace an error all the way up

Cause `GET /orders/99999` (nonexistent). Confirm: repository returns `None` →
service raises `OrderNotFound` → central exception handler maps it to `404` +
the standard envelope → handler contained no `try/except`. Then cause a
duplicate email and confirm `DuplicateEmail` → `409` through the same path.

Expected: two different failures, each surfacing as the right status in one
consistent envelope, with zero error-handling code in the handlers — the full
propagation chain working.

### 8. Diagnose and fix: a layer-violating "service"

This "service" is riddled with violations. Name each violation by the principle
it breaks and refactor into clean layers.

```python
# services.py  (as found)
from fastapi import HTTPException
from sqlalchemy import select
from models import OrderModel

class OrderService:
    def __init__(self, session):
        self.session = session
    def place_order(self, request, customer_id, items):
        if not items:
            raise HTTPException(422, "empty order")
        rows = self.session.scalars(
            select(OrderModel).where(OrderModel.customer_id == customer_id)).all()
        if len(rows) > 100:
            raise HTTPException(429, "too many orders")
        o = OrderModel(customer_id=customer_id, items=items)
        self.session.add(o); self.session.commit()
        return {"id": o.id, "raw": o}    # leaks the ORM object outward too
```

<details>
<summary>Answer</summary>

Violations: (1) **imports `fastapi` and raises `HTTPException`** — HTTP leaking
into business logic (breaks SRP and the DIP boundary); the empty-order and
too-many-orders rules should raise *domain* exceptions. (2) **imports
`sqlalchemy`/`OrderModel` and runs queries + `commit()`** — the data layer
leaking up into business logic; this belongs in a repository behind an
interface (DIP/SRP). (3) takes a raw `request` — presentation concern in the
service. (4) **returns the ORM object** (`"raw": o`) — leaks table structure past
the boundary. Refactor: a repository owns the query and the commit and is passed
as an interface; the service holds only the two business rules and raises
`EmptyOrderError`/`TooManyOrders` domain exceptions; the handler maps those to
422/429 centrally and returns an `OrderOut` schema. After refactor, `services.py`
imports neither `fastapi` nor `sqlalchemy` — the litmus test passes.

</details>

## Independent challenge

No code given. Take the library-lending SQLAlchemy implementation from the
module 05 challenge and restructure it into clean three-layer architecture: a
`LoanRepository` interface with a SQLAlchemy implementation *and* a fake; a
`LendingService` holding every business rule (a member with an unpaid late fee
can't borrow; a copy already on loan can't be lent again; a member can hold at
most five loans) that depends only on the repository interface and raises domain
exceptions; and thin handlers that map those exceptions to HTTP centrally and
return Pydantic response schemas, never ORM objects. Prove the separation two
ways: (1) a plain-Python test suite that exercises *every* business rule using
only the fake repository, with no database running; and (2) a grep showing
`sqlalchemy` is imported only by the repository/models modules. Then decide,
and justify in a sentence, whether this domain is simple enough to use the
SQLAlchemy models directly as domain objects or complex enough to warrant
separate domain models. Reach back to module 04: the "lend a copy" operation's
locking belongs in the repository, driven by a service unit-of-work — explain
why putting the `FOR UPDATE` in the handler would be a layering violation.

<details>
<summary>Hint</summary>

The tell for "which business rules go where": every sentence that starts with a
business condition ("a member with an unpaid fee can't...") is a service rule
and should raise a domain exception; every sentence about *how data is fetched
or locked* is a repository concern. The `FOR UPDATE` belongs in the repository
because it's a storage-mechanism detail — a handler doing it means the
presentation layer knows about row locks, which is exactly the "data layer
leaking up" rot. For the simple-vs-complex decision, count the real invariants:
a handful of rules that mostly map to columns → models-as-domain is fine; rich
behaviour and state transitions → separate domain models earn their keep.

</details>

## Common mistakes & troubleshooting

- **ORM models leaking to the edges.** SQLAlchemy objects in handlers, in
  responses, in business logic. The database's shape then dictates your whole
  app. Confine ORM types to the data layer; convert to response schemas at the
  boundary.
- **Business rules smeared across layers.** Some validation in the handler, some
  in a service, some only in a DB constraint. Nobody can point to "the rules."
  Put business rules in the service/domain layer; use DB constraints as a
  *backstop*, not the only enforcement.
- **Services importing `sqlalchemy` or `fastapi`.** The two canonical leaks:
  database leaking up, HTTP leaking down. The service depends on a repository
  *interface* and raises *domain* exceptions.
- **Handlers running queries.** Presentation touching the data layer directly —
  you lose the ability to test, swap, or centralize data access. Only
  repositories touch the database.
- **Letting raw driver/ORM exceptions propagate upward.** An `IntegrityError`
  reaching the handler couples everything to SQLAlchemy. Translate it to a
  domain concept at the repository boundary.
- **Over-engineering a simple CRUD app.** Separate domain models, mappers, and
  ports/adapters for a five-field to-do app is ceremony that slows you down. Add
  separation as complexity demands it; using the ORM model as the domain object
  is a legitimate choice for simple domains.
- **Putting the transaction/locking in the wrong layer.** The unit-of-work is
  driven by a service method but the transaction/commit and `FOR UPDATE` live in
  the data layer. A handler managing transactions is a leak.

## Checkpoint quiz

Write down your answer to each question before expanding it — checking without attempting first is the single easiest way to fool yourself into thinking you've learned this.

1. Name the three layers, the one thing each is responsible for, and the
   direction dependencies are allowed to point.
2. State the Dependency Inversion Principle in your own words and explain how
   the repository pattern implements it.
3. What's the difference between a domain model and a database model, and when
   is it fine to use one class for both?
4. Give the two litmus tests (updated for a real data layer) for detecting a
   layering leak in a service.
5. How should an error change form as it travels from the data layer up to the
   presentation layer, and what must the repository do with an `IntegrityError`?
6. Why should you convert an ORM object to a response schema at the boundary
   rather than returning it directly?
7. Where does the transaction boundary / row locking belong, and why is putting
   it in the handler a violation?

<details>
<summary>Answers</summary>

1. Presentation (speak HTTP/JSON, no SQL), Business (rules and workflows, no
   HTTP or SQL), Data (the only code that touches the database). Dependencies
   point downward only: presentation → business → data; nothing points up.
2. High-level business logic shouldn't depend on low-level storage details; both
   depend on an abstraction. The repository pattern defines an interface the
   service depends on, and the concrete SQLAlchemy implementation is injected
   from outside — so the low-level detail depends on the high-level contract, not
   the reverse.
3. A database model mirrors table structure and carries ORM machinery to
   persist/query rows; a domain model represents a business concept and its
   rules. Using one class for both is fine for simple/CRUD apps where the
   ceremony of mapping wouldn't pay off; separate them for complex domains to
   keep the business layer pure and persistence-independent.
4. If the service imports `fastapi`/raises `HTTPException`, HTTP has leaked down;
   if the service imports `sqlalchemy` or catches `IntegrityError`, the database
   has leaked up.
5. The data layer's low-level/driver errors are translated by the repository
   into domain terms; the business layer raises HTTP- and storage-ignorant
   domain exceptions; the presentation layer maps those to HTTP status +
   envelope centrally. The repository must catch `IntegrityError` and translate
   it (e.g. to `DuplicateEmail`) rather than let it propagate.
6. Because a response schema gives a stable, intentional JSON shape decoupled
   from your table structure, and returning the ORM object leaks the schema to
   clients and can trigger surprise lazy-load queries during serialization.
7. It belongs in the data layer (repository/session), driven by a service
   unit-of-work. Putting it in the handler means the presentation layer knows
   about row locks and transactions — the data layer leaking upward, which
   defeats testability and the ability to swap the store.

</details>

## Cumulative review

Closed-book. Pulls together modules 00-06 — the whole first two-thirds of the
track. Write each answer before expanding.

1. (00+06) You're asked to "swap our user store from Postgres to a document DB
   for a spike, without touching business logic." Which architectural pattern
   makes that a small change, and which single layer should be the only one you
   modify?
2. (01+04) A service reads an account balance, applies a business rule in
   Python, and writes it back. Name the ACID letter and the specific anomaly at
   risk under concurrency, and give the data-layer fix — then say why that fix
   belongs in the repository, not the service.
3. (02+03) Write (in words) the query for "every member and their number of
   currently-outstanding loans, including members with zero," name the join
   type, and name the index that makes it fast.
4. (03+05) You must add a `NOT NULL` column with an index to a 30M-row live
   table. Give the ordered sequence of safe migration steps and say which single
   step from a naive one-shot migration would have caused an outage.
5. (04+06) Where does `SELECT ... FOR UPDATE` belong in a layered app, what
   error must the surrounding code be ready to retry, and which layer owns that
   retry loop?
6. (05+06) Explain how the ORM's N+1 problem can hide *behind* a clean
   repository interface, and whose responsibility it is to prevent it.

<details>
<summary>Answers</summary>

1. The repository pattern (with dependency inversion) — the business layer
   depends on a repository interface, so you only write a new document-DB
   implementation of that interface. The single layer you modify is the data
   access layer; business logic and presentation are untouched.
2. It's an **isolation** problem — the **lost update** anomaly. The data-layer
   fix is a pessimistic lock (`SELECT ... FOR UPDATE`) or atomic SQL / optimistic
   version check. It belongs in the repository because locking is a
   storage-mechanism detail; the service just expresses the unit-of-work, and
   putting `FOR UPDATE` in the service would leak the database into business
   logic.
3. A `LEFT JOIN` from `members` to `loans` (filtered to outstanding, i.e.
   `returned_at IS NULL` in the `ON` clause) with `count()` — members with zero
   still appear with 0. The fast index is a partial composite index on the loan
   side like `(member_id) WHERE returned_at IS NULL`.
4. (a) add the column nullable with a constant `server_default`; (b) deploy code
   that writes the new column; (c) backfill existing rows in batches; (d)
   `alter column ... set not null`; (e) `create index concurrently`. The naive
   one-shot's outage step is either the `add_column NOT NULL` with no default
   (fails/locks) or the non-concurrent `CREATE INDEX` locking writes for the
   whole build.
5. It belongs in the data access layer (repository), driven by a service
   unit-of-work. The surrounding code must be ready to retry a serialization
   failure and/or a deadlock. The retry loop typically lives at the service/
   unit-of-work boundary (wrapping the transaction), so a whole business
   operation is retried atomically.
6. The interface method (e.g. `list_orders_for_customer`) can return objects
   whose relationships lazy-load one query at a time when the caller iterates
   them — the N+1 fires inside/after the repository call, invisible at the
   interface. Preventing it is the repository's responsibility: it should eager-
   load (`selectinload`) what its callers will need, since only it knows the ORM
   loading strategy (module 07).

</details>

## Next

[07-query-optimization-and-connection-pooling](../07-query-optimization-and-connection-pooling/README.md)
— your architecture is clean; now make it fast. You'll read `EXPLAIN ANALYZE`
plans properly, hunt down and fix the N+1 problem you saw in module 05, size a
connection pool, and cache query results at the data layer.
