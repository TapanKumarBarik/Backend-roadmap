# Module 06: Handlers, Controllers, and Services

## Why this matters

Up to now your endpoint functions have done everything: parse the request,
validate it, apply business rules, touch the data, and format the response —
all crammed into one function. That's fine for a toy. It falls apart fast in a
real app. The moment two endpoints need the same business rule ("only the
owner can edit this order"), you either duplicate it or you refactor. The
moment you want to *unit-test* that rule without spinning up a web server, you
can't — it's welded to an HTTP handler. The moment the response format needs
to change across forty endpoints, you're editing forty functions. **Layering**
is the discipline that prevents all of this: separate the code that speaks HTTP
from the code that enforces business rules from the code that touches data.

The classic split (borrowed from MVC and adapted for APIs) is **handler →
controller → service → (repository/data)**. The *handler* is the thin HTTP
adapter: it knows about requests, status codes, and response shapes, and
nothing else. The *service* holds business logic: "what does it *mean* to
place an order" — the rules, the invariants — expressed in plain Python that
knows nothing about HTTP. The *controller* (in FastAPI, often folded into the
handler or a small orchestration layer) coordinates: it takes validated input,
calls the right services, and hands their result back to the handler to
format. The data/repository layer is the only place that talks to the
database. Each layer depends only *downward* and can be tested in isolation.

Why does this matter beyond tidiness? Because it's what makes **centralized
error handling** and **consistent response formats** possible. If services
raise domain exceptions (`OrderNotFound`, `InsufficientStock`) instead of
HTTP errors, one place — an exception handler — maps every domain error to the
right status code and response envelope. If handlers are thin and uniform,
every success response has the same shape. The layering *is* the thing that
lets the whole API behave consistently, and it's the direct payoff of the
middleware (module 04) and context (module 05) work you've already done —
middleware removes cross-cutting concerns from controllers, and DI injects the
services they need.

## Concepts

### The layers and their single responsibilities

Think of a restaurant. The **waiter** (handler) talks to the customer: takes
the order, brings the food, handles "we're out of that." The **kitchen
manager** (controller/orchestration) coordinates who cooks what. The **chef**
(service) knows how to actually make the dish — the recipe, the rules — and
doesn't care whether the order came by phone, app, or walk-in. The **pantry**
(repository) is the only one who touches the ingredients storage. A waiter who
also cooks and manages inventory is how small kitchens collapse.

- **Handler (a.k.a. route/controller-endpoint)** — the HTTP boundary. Binds &
  validates input (Pydantic), calls a service, maps the result (or a raised
  domain error) to an HTTP response. Contains *no* business rules. Thin.
- **Service** — business logic and invariants, in framework-agnostic Python.
  Knows nothing about `Request`, status codes, or JSON. Raises *domain*
  exceptions, not `HTTPException`. This is where "the rule" lives, and it's
  reusable across handlers, background jobs, and CLI scripts.
- **Repository / data layer** — the only code that reads/writes the database.
  Services call it; handlers never do. Swapping Postgres for something else
  touches only here.

### Why the handler must stay thin

A fat handler — validation + rules + DB + formatting in one function — can't
be reused (another entry point like a background worker can't call an HTTP
handler), can't be unit-tested without HTTP machinery, and duplicates rules
across endpoints. A thin handler delegates:

```python
# handler: thin HTTP adapter
from fastapi import APIRouter, Depends, status

router = APIRouter(prefix="/orders")

@router.post("", status_code=status.HTTP_201_CREATED)
async def create_order(body: OrderCreate, svc: OrderService = Depends(get_order_service),
                       user=Depends(get_current_user)):
    order = svc.place_order(user_id=user["id"], items=body.items)   # delegate
    return OrderOut.model_validate(order)                            # format
```

The handler validates (`OrderCreate`), delegates to the service, and shapes
the response (`OrderOut`). The *rule* — can this user place this order, is
there stock — lives in `svc.place_order`, not here.

### The service: business logic, HTTP-ignorant

```python
# service: pure business logic, no FastAPI imports
class OrderService:
    def __init__(self, repo: "OrderRepository"):
        self.repo = repo

    def place_order(self, user_id: int, items: list["ItemIn"]) -> "Order":
        if not items:
            raise EmptyOrderError()                 # domain exception, not HTTP
        for item in items:
            stock = self.repo.get_stock(item.sku)
            if stock < item.quantity:
                raise InsufficientStockError(item.sku)
        return self.repo.create_order(user_id, items)
```

Notice: no `HTTPException`, no status codes, no `Request`. This class is
testable with a fake repo and a plain assertion — no web server needed. It can
be called from an HTTP handler *or* a background job *or* a script, unchanged.
That reusability is the entire point of the split.

### Domain exceptions → HTTP, in one place

Services raise domain exceptions. A *centralized* exception handler maps each
to a status code and the standard error envelope — so the mapping lives once,
not scattered across handlers:

```python
from fastapi import Request
from fastapi.responses import JSONResponse

class DomainError(Exception): ...
class EmptyOrderError(DomainError): ...
class InsufficientStockError(DomainError):
    def __init__(self, sku): self.sku = sku
class OrderNotFound(DomainError): ...

@app.exception_handler(OrderNotFound)
async def _not_found(request: Request, exc: OrderNotFound):
    return JSONResponse(status_code=404, content=error_body("order_not_found",
                        "order does not exist", request))

@app.exception_handler(InsufficientStockError)
async def _stock(request: Request, exc: InsufficientStockError):
    return JSONResponse(status_code=409, content=error_body("insufficient_stock",
                        f"not enough stock for {exc.sku}", request))
```

Now every handler that calls a service is freed from `try/except` around
domain errors — the framework routes the exception to the right handler. Add a
new domain error, register one mapping, and every endpoint benefits.

### Consistent success and error envelopes

Clients hate APIs where every endpoint returns a different shape. Pick one
success envelope and one error envelope and apply them everywhere. A common
pair:

```python
# success
{"data": {...}, "meta": {"request_id": "..."}}
# error
{"error": {"code": "insufficient_stock", "message": "...", "request_id": "..."}}
```

Layering makes this trivial: thin handlers return `data` through a shared
response model; the centralized exception handlers produce every `error`. You
already override `RequestValidationError` (module 02) — that's the *validation*
error funneling into the *same* envelope. One shape in, one shape out, no
matter which endpoint or which error.

### How middleware and DI reduce controller duplication

This is where earlier modules pay off. Cross-cutting concerns that would
otherwise clutter every controller — auth, request IDs, logging, rate limiting
— live in **middleware** (module 04), so handlers don't repeat them. Shared
dependencies — the current user, the DB session, the service instances — are
**injected** via `Depends` (module 05), so handlers don't construct them. A
handler ends up as: *declare what I need (via DI), delegate to a service,
shape the result*. Everything else was hoisted into a layer that does it once.

```python
def get_order_service(db=Depends(get_db)) -> OrderService:
    return OrderService(OrderRepository(db))     # wiring in one place, injected
```

### Where "controller" fits in FastAPI specifically

In strict MVC there's a distinct controller class. FastAPI blurs it: the
route function is often called the "path operation" and plays the
handler-*and*-controller role for simple cases. As complexity grows you
extract a real service layer (always) and sometimes a thin controller/
use-case object that orchestrates *multiple* services for one endpoint. The
rule of thumb: **push logic down** — if a route function contains an `if` that
encodes a business rule, that `if` belongs in a service. Keep routing,
validation, and formatting up top; keep rules and data access below.

## Command reference

| Pattern | Layer | Purpose |
|---|---|---|
| `@router.post(..., status_code=201)` | handler | HTTP binding + status |
| `body: OrderCreate` | handler | validated input (Pydantic) |
| `OrderOut.model_validate(obj)` | handler | shape the response |
| `class OrderService: def place_order(...)` | service | business rules, HTTP-agnostic |
| `raise InsufficientStockError(sku)` | service | domain exception (not HTTP) |
| `class OrderRepository: def create_order(...)` | repository | the only DB access |
| `@app.exception_handler(DomainError)` | wiring | map domain error → HTTP envelope |
| `def get_order_service(db=Depends(get_db))` | wiring | construct + inject a service |
| `APIRouter(prefix=..., tags=...)` | handler | group related endpoints |

**Services must not import FastAPI.** A quick litmus test for correct
layering: if your service module imports `fastapi` (or `HTTPException`,
`Request`, `status`), a rule has leaked into the wrong layer. Services raise
domain exceptions; the *wiring* layer (exception handlers) translates them.

**Inject services; don't instantiate them in handlers.** `svc =
OrderService(OrderRepository(db))` inside a handler re-wires dependencies in
every endpoint and makes testing harder. Provide it through
`Depends(get_order_service)` so tests can override it with a fake
(`app.dependency_overrides[get_order_service] = lambda: FakeService()`).

**One envelope, enforced by response models.** Define `SuccessResponse[T]` /
error envelope models and return them consistently. FastAPI's
`response_model=` on the route enforces the success shape and documents it in
OpenAPI (module 09), so drift is caught automatically.

## Hands-on exercises

Continue in the `api-layer` project. Create a small package structure to make
the layers physical: `handlers.py`, `services.py`, `repository.py`,
`errors.py`, `schemas.py`.

### 1. Define domain exceptions (no HTTP)

```python
# errors.py
class DomainError(Exception): ...
class EmptyOrderError(DomainError): ...
class InsufficientStockError(DomainError):
    def __init__(self, sku: str): self.sku = sku; super().__init__(sku)
class OrderNotFound(DomainError): ...
```

Confirm this module imports nothing from FastAPI. That's the point — domain
errors are framework-agnostic.

### 2. A repository (the only DB access — faked in memory)

```python
# repository.py
class OrderRepository:
    def __init__(self):
        self._orders = {}
        self._next = 1
        self._stock = {"sku-1": 10, "sku-2": 0}

    def get_stock(self, sku: str) -> int:
        return self._stock.get(sku, 0)

    def create_order(self, user_id: int, items: list) -> dict:
        oid = self._next; self._next += 1
        order = {"id": oid, "user_id": user_id, "items": [i.model_dump() for i in items]}
        self._orders[oid] = order
        return order

    def get(self, oid: int):
        return self._orders.get(oid)
```

### 3. The service (business rules, HTTP-ignorant)

```python
# services.py
from errors import EmptyOrderError, InsufficientStockError, OrderNotFound

class OrderService:
    def __init__(self, repo):
        self.repo = repo

    def place_order(self, user_id: int, items: list):
        if not items:
            raise EmptyOrderError()
        for item in items:
            if self.repo.get_stock(item.sku) < item.quantity:
                raise InsufficientStockError(item.sku)
        return self.repo.create_order(user_id, items)

    def get_order(self, oid: int):
        order = self.repo.get(oid)
        if order is None:
            raise OrderNotFound()
        return order
```

Confirm `services.py` imports no FastAPI. Litmus test passed.

### 4. Unit-test the service with NO web server

```python
# test by hand in a python REPL or a quick script
from repository import OrderRepository
from services import OrderService
from schemas import ItemIn   # a Pydantic model: sku: str; quantity: int
from errors import InsufficientStockError

svc = OrderService(OrderRepository())
order = svc.place_order(1, [ItemIn(sku="sku-1", quantity=2)])
assert order["id"] == 1
try:
    svc.place_order(1, [ItemIn(sku="sku-2", quantity=1)])   # sku-2 has 0 stock
    assert False, "should have raised"
except InsufficientStockError as e:
    assert e.sku == "sku-2"
print("service tests pass")
```

Expected: it passes with no FastAPI, no HTTP, no server. *That* is why the
service is HTTP-ignorant.

### 5. Thin handlers that delegate

```python
# handlers.py
from fastapi import APIRouter, Depends, status
from schemas import OrderCreate, OrderOut
from services import OrderService

router = APIRouter(prefix="/orders", tags=["orders"])

def get_order_service() -> OrderService:
    from repository import OrderRepository
    return OrderService(OrderRepository())     # (single shared instance in real apps)

@router.post("", status_code=status.HTTP_201_CREATED, response_model=OrderOut)
async def create_order(body: OrderCreate, svc: OrderService = Depends(get_order_service)):
    return svc.place_order(user_id=1, items=body.items)

@router.get("/{oid}", response_model=OrderOut)
async def get_order(oid: int, svc: OrderService = Depends(get_order_service)):
    return svc.get_order(oid)
```

Note the handlers contain *zero* business rules — just delegate and shape.
(Use a module-level singleton repo so orders persist across requests in this
demo.)

### 6. Centralized domain-error → HTTP mapping

```python
# main.py
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from errors import EmptyOrderError, InsufficientStockError, OrderNotFound
from handlers import router

app = FastAPI()
app.include_router(router)

def error_body(code, message, request):
    return {"error": {"code": code, "message": message,
                      "request_id": getattr(request.state, "request_id", None)}}

@app.exception_handler(OrderNotFound)
async def _nf(request: Request, exc): 
    return JSONResponse(404, error_body("order_not_found", "order does not exist", request))

@app.exception_handler(EmptyOrderError)
async def _empty(request: Request, exc):
    return JSONResponse(422, error_body("empty_order", "order must have items", request))

@app.exception_handler(InsufficientStockError)
async def _stock(request: Request, exc):
    return JSONResponse(409, error_body("insufficient_stock", f"not enough stock for {exc.sku}", request))
```

Call `POST /orders` with an empty item list (`422`), with `sku-2` (`409`), and
with `sku-1` (`201`). Then `GET /orders/999` (`404`). Expected: every error
comes back in the *same* envelope, and no handler contains a single
`try/except`.

### 7. Enforce a consistent success envelope

Wrap successful responses uniformly. Add a response model and confirm every
success looks the same (a `data` object). Change the envelope in one place and
confirm all endpoints follow. Expected: consistency is a property of the
layer, not of each handler's discipline.

### 8. Diagnose and fix: a leaky handler

This handler "works" but violates the layering badly: it contains business
rules, talks to the repository directly, raises `HTTPException` from what
should be a service, and duplicates a rule that another endpoint also needs.
Refactor it into thin-handler + service, and move the error to a domain
exception.

```python
from fastapi import APIRouter, HTTPException, Depends
router = APIRouter()

@router.post("/orders")
async def create_order(body: OrderCreate, db=Depends(get_db)):
    if len(body.items) == 0:
        raise HTTPException(status_code=422, detail="empty order")
    for item in body.items:
        stock = db.query_stock(item.sku)              # handler touching the DB
        if stock < item.quantity:
            raise HTTPException(status_code=409, detail=f"no stock for {item.sku}")
    order = db.insert_order(1, body.items)            # handler touching the DB
    return {"id": order["id"]}
```

<details>
<summary>Solution</summary>

Three layering violations: the handler (1) encodes business rules
(empty-check, stock-check), (2) talks to the DB directly, and (3) raises
`HTTPException` for domain conditions — which also means the rules can't be
reused by another entry point or unit-tested without HTTP.

Fix — push rules into a service that raises domain exceptions, keep the
handler thin, and map errors centrally:

```python
# services.py
def place_order(self, user_id, items):
    if not items:
        raise EmptyOrderError()
    for item in items:
        if self.repo.get_stock(item.sku) < item.quantity:
            raise InsufficientStockError(item.sku)
    return self.repo.create_order(user_id, items)

# handlers.py  -- thin
@router.post("/orders", status_code=201, response_model=OrderOut)
async def create_order(body: OrderCreate, svc=Depends(get_order_service)):
    return svc.place_order(user_id=1, items=body.items)
```

The `EmptyOrderError`/`InsufficientStockError` → status mapping lives in the
centralized exception handlers (exercise 6). Now the rules are reusable,
unit-testable without a server, and the handler is a pure adapter.

</details>

## Independent challenge

No code given. Add a full "task" resource to your app with proper layering:
handlers, a `TaskService` holding all rules, and a repository as the only DB
access. Enforce these business rules *in the service* (not the handler): a
task's title is required and unique per user; a task can't be marked done if
it's already archived; only the task's owner may modify it. Raise **domain
exceptions** for each and map them to HTTP status codes in one central place,
reusing the **consistent error envelope** from this module. Prove the layering
is correct by writing a plain-Python test of `TaskService` that never imports
FastAPI, exercising every rule. Reach back to module 05 and inject the service
(and the current user) via `Depends` rather than constructing them in the
handler, and reach back to module 02 to make sure a validation failure and a
domain failure both come back in the *same* envelope.

<details>
<summary>Hint</summary>

The "only the owner may modify it" rule needs the current user, which the
service receives as a plain argument (`user_id`) — the *handler* gets the user
via `Depends(get_current_user)` and passes the id down, so the service stays
HTTP-ignorant. Map `RequestValidationError` (module 02) and each domain
exception through handlers that all call the same `error_body(...)` builder so
validation and domain errors share one shape.

</details>

## Common mistakes & troubleshooting

- **Fat handlers.** Business rules, DB access, and formatting crammed into the
  route function. Push rules into services; keep handlers thin adapters.
- **Services importing FastAPI.** A dead giveaway that HTTP concerns leaked
  into business logic. Services raise domain exceptions; the wiring layer maps
  them to HTTP.
- **`try/except` around domain errors in every handler.** Redundant. Register
  a centralized `@app.exception_handler` per domain error once.
- **Instantiating services/repos inside handlers.** Wires dependencies
  everywhere and blocks test overrides. Inject via `Depends`.
- **Inconsistent response shapes.** Each endpoint inventing its own envelope.
  Define one success and one error shape and enforce with response models +
  central handlers.
- **Handlers touching the database.** Only the repository layer does. A
  handler (or even a service) running raw queries breaks the ability to swap
  or test the data layer.
- **Business rules duplicated across endpoints.** The signal you needed a
  service. Extract the rule once; call it from every handler that needs it.

## Checkpoint quiz

Write down your answer to each question before expanding it — checking without attempting first is the single easiest way to fool yourself into thinking you've learned this.

1. State the single responsibility of each layer: handler, service,
   repository.
2. Why must a service raise a *domain* exception rather than `HTTPException`,
   and what breaks if it doesn't?
3. What's the litmus test for whether business logic has leaked into the wrong
   layer?
4. How does centralized exception handling remove `try/except` from your
   handlers, and what do you gain when you add a new domain error?
5. How do middleware (module 04) and dependency injection (module 05) each
   reduce duplication in your controllers/handlers?
6. Why can you unit-test a service without a running web server, and why is
   that valuable?
7. You have the same "only the owner may edit" rule in three endpoints. Where
   does it belong, and how do the three handlers use it?

<details>
<summary>Answers</summary>

1. Handler: the HTTP adapter — validate input, delegate to a service, shape
   the response/status; no business rules. Service: business logic and
   invariants in HTTP-agnostic Python; raises domain exceptions. Repository:
   the only code that reads/writes the database.
2. Because a service is meant to be reusable (from HTTP handlers, background
   jobs, scripts) and HTTP-ignorant. Raising `HTTPException` couples it to
   FastAPI, so non-HTTP callers get an inappropriate error and you can't
   unit-test it without HTTP machinery. Domain exceptions keep it portable;
   the wiring layer maps them to status codes.
3. If the service module imports FastAPI (`HTTPException`, `Request`,
   `status`), or if a route function contains an `if` encoding a business
   rule, logic is in the wrong layer.
4. Services raise domain exceptions and a registered
   `@app.exception_handler` maps each to a status/envelope, so handlers don't
   catch them. Adding a new domain error means registering one mapping — every
   endpoint that can raise it is handled consistently, no per-handler changes.
5. Middleware hoists cross-cutting concerns (auth, logging, request IDs, rate
   limiting) out of every controller into one place. DI injects shared
   dependencies (current user, DB session, service instances) so handlers
   declare needs instead of constructing them — no repeated wiring.
6. Because the service imports no HTTP framework and takes plain arguments, so
   you construct it with a fake repository and call its methods directly with
   assertions. Valuable: fast, isolated tests of the actual business rules
   without server startup, routing, or serialization.
7. In a service method (or a shared authorization helper the services use).
   Each of the three handlers gets the current user via `Depends`, passes the
   user id to the service, and the service enforces the ownership rule once —
   no duplication, one place to change it.

</details>

## Next

[07-crud-deep-dive](../07-crud-deep-dive/README.md) — with clean layers in
place, you'll implement full CRUD correctly: the right status codes,
pagination (offset and cursor), search, filtering, sorting, and the
production best practices that separate a toy endpoint from a real one.
