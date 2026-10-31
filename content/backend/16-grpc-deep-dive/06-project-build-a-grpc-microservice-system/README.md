# Module 06: Project — Build a gRPC Microservice System

## What you're building

A working three-part order-processing system, built step by step. Unlike the
open-ended capstones elsewhere in `backend/`, this one gives you the code —
type it in, run it, and watch each of modules 00-05 do its job in a real
system rather than an isolated exercise.

```
                      JWT (end user)
   HTTP/JSON  ┌──────────────────┐
  ──────────▶ │  gateway         │   FastAPI — the only public surface
              │  (REST facade)   │
              └────────┬─────────┘
                       │ gRPC + mTLS + propagated user token
                       ▼
              ┌──────────────────┐        gRPC + mTLS
              │  orders          │ ─────────────────────┐
              │  - CreateOrder   │                      ▼
              │  - WatchOrders   │            ┌──────────────────┐
              │    (srv stream)  │            │  inventory       │
              └──────────────────┘            │  - CheckStock    │
                                              │  - BulkRestock   │
                                              │    (cli stream)  │
                                              └──────────────────┘
```

By the end you'll have exercised: versioned protobuf schemas with safe
evolution (00), mTLS between services plus per-user JWTs (01), health
checking, graceful shutdown and client-side load balancing (02), logging and
metrics interceptors plus a real test suite (03), a REST gateway (04), and a
`ghz` benchmark (05).

Budget 6-10 hours. Do it in order; each step runs before you move on.

## Setup

```bash
mkdir grpc-shop && cd grpc-shop
python -m venv venv && source venv/bin/activate    # Windows: venv\Scripts\activate
pip install grpcio grpcio-tools grpcio-health-checking grpcio-reflection \
            protobuf pyjwt prometheus-client fastapi uvicorn httpx pytest
```

Optional but used later: `grpcurl`, `ghz`, Docker.

## Step 1 — Repository layout and the schemas

```
grpc-shop/
  proto/shop/v1/{common.proto,inventory.proto,orders.proto}
  gen/                     # generated code (git-ignored)
  services/{inventory,orders,gateway}
  shared/{interceptors.py,serving.py,security.py}
  certs/
  tests/
```

`proto/shop/v1/common.proto`:

```proto
syntax = "proto3";
package shop.v1;

import "google/protobuf/timestamp.proto";

enum OrderStatus {
  ORDER_STATUS_UNSPECIFIED = 0;   // module 00: zero value is always "unset"
  ORDER_STATUS_PENDING     = 1;
  ORDER_STATUS_CONFIRMED   = 2;
  ORDER_STATUS_REJECTED    = 3;
}

message LineItem {
  string sku = 1;
  int32  quantity = 2;
}

message Order {
  reserved 4;                     // module 00: was `int64 total_cents`, replaced by 7
  reserved "total_cents";

  string id = 1;
  string customer_id = 2;
  repeated LineItem items = 3;
  OrderStatus status = 5;
  google.protobuf.Timestamp created_at = 6;
  double total = 7;
  optional string rejection_reason = 8;   // explicit presence: absent != ""
}
```

`proto/shop/v1/inventory.proto`:

```proto
syntax = "proto3";
package shop.v1;

import "shop/v1/common.proto";

service InventoryService {
  rpc CheckStock(CheckStockRequest) returns (CheckStockResponse);
  rpc BulkRestock(stream RestockItem) returns (BulkRestockSummary);   // client streaming
}

message CheckStockRequest  { repeated LineItem items = 1; }
message StockResult        { string sku = 1; int32 available = 2; bool sufficient = 3; double unit_price = 4; }
message CheckStockResponse { repeated StockResult results = 1; bool all_available = 2; }

message RestockItem        { string sku = 1; int32 quantity = 2; }
message BulkRestockSummary { int32 items_processed = 1; int32 skus_updated = 2; }
```

`proto/shop/v1/orders.proto`:

```proto
syntax = "proto3";
package shop.v1;

import "shop/v1/common.proto";

service OrderService {
  rpc CreateOrder(CreateOrderRequest) returns (CreateOrderResponse);
  rpc GetOrder(GetOrderRequest) returns (GetOrderResponse);
  rpc WatchOrders(WatchOrdersRequest) returns (stream Order);        // server streaming
}

message CreateOrderRequest  { string customer_id = 1; repeated LineItem items = 2; }
message CreateOrderResponse { Order order = 1; }
message GetOrderRequest     { string id = 1; }
message GetOrderResponse    { Order order = 1; }
message WatchOrdersRequest  { string customer_id = 1; int32 limit = 2; }
```

Note what's already in play: a versioned package (`shop.v1`), a `reserved`
field from a past migration, an `UNSPECIFIED` enum zero, `optional` for a
field where absent and empty differ, and both streaming directions.

## Step 2 — Code generation

`scripts/gen.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail
rm -rf gen && mkdir -p gen
python -m grpc_tools.protoc -I proto \
  --python_out=gen --grpc_python_out=gen --pyi_out=gen \
  proto/shop/v1/*.proto
find gen -type d -exec touch {}/__init__.py \;
echo "generated:"; find gen -name "*_pb2*.py" | sort
```

```bash
chmod +x scripts/gen.sh && ./scripts/gen.sh
```

Generated gRPC modules import each other as `from shop.v1 import ...`, so
`gen/` must be on `sys.path`. Create `conftest.py` at the repo root:

```python
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "gen"))
```

and for the services, a `shared/bootstrap.py` imported first:

```python
import sys, os
_GEN = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "gen")
if _GEN not in sys.path:
    sys.path.insert(0, _GEN)
```

## Step 3 — The inventory service

`services/inventory/service.py`:

```python
import shared.bootstrap  # noqa: F401  — must come first, puts gen/ on sys.path
import grpc
from shop.v1 import inventory_pb2, inventory_pb2_grpc

STOCK = {"SKU-1": (100, 9.99), "SKU-2": (5, 24.50), "SKU-3": (0, 5.00)}


class InventoryService(inventory_pb2_grpc.InventoryServiceServicer):
    def __init__(self):
        self._stock = dict(STOCK)

    def CheckStock(self, request, context):
        if not request.items:
            context.abort(grpc.StatusCode.INVALID_ARGUMENT, "items must not be empty")

        results, all_ok = [], True
        for item in request.items:
            if item.quantity <= 0:
                context.abort(grpc.StatusCode.INVALID_ARGUMENT,
                              f"quantity for {item.sku} must be positive")
            available, price = self._stock.get(item.sku, (0, 0.0))
            sufficient = available >= item.quantity
            all_ok &= sufficient
            results.append(inventory_pb2.StockResult(
                sku=item.sku, available=available,
                sufficient=sufficient, unit_price=price,
            ))
        return inventory_pb2.CheckStockResponse(results=results, all_available=all_ok)

    def BulkRestock(self, request_iterator, context):
        # client streaming: consume the whole stream, then return one summary
        processed, touched = 0, set()
        for item in request_iterator:
            if item.quantity <= 0:
                context.abort(grpc.StatusCode.INVALID_ARGUMENT, "quantity must be positive")
            available, price = self._stock.get(item.sku, (0, 0.0))
            self._stock[item.sku] = (available + item.quantity, price)
            processed += 1
            touched.add(item.sku)
        return inventory_pb2.BulkRestockSummary(
            items_processed=processed, skus_updated=len(touched))
```

## Step 4 — Shared serving helpers

This is where modules 02 and 03 become reusable infrastructure rather than
copy-paste. `shared/serving.py`:

```python
import time, signal, logging
from concurrent import futures
import grpc
from grpc_health.v1 import health, health_pb2, health_pb2_grpc
from grpc_reflection.v1alpha import reflection

log = logging.getLogger("serving")

SERVER_OPTIONS = [
    ("grpc.keepalive_time_ms", 30000),
    ("grpc.keepalive_timeout_ms", 10000),
    ("grpc.keepalive_permit_without_calls", 1),
    # must tolerate clients pinging as often as they're configured to (module 02)
    ("grpc.http2.min_ping_interval_without_data_ms", 10000),
    ("grpc.http2.max_ping_strikes", 0),
    ("grpc.max_receive_message_length", 16 * 1024 * 1024),
    ("grpc.max_connection_age_ms", 300000),
    ("grpc.max_connection_age_grace_ms", 30000),
]

CLIENT_OPTIONS = [
    ("grpc.keepalive_time_ms", 30000),
    ("grpc.keepalive_timeout_ms", 10000),
    ("grpc.keepalive_permit_without_calls", 1),
    # module 02: without this, gRPC uses pick_first and one backend takes everything
    ("grpc.service_config", '{"loadBalancingConfig": [{"round_robin": {}}]}'),
]


def build_server(register_fn, service_names, interceptors=(), max_workers=16, creds=None, port=50051):
    server = grpc.server(
        futures.ThreadPoolExecutor(max_workers=max_workers),
        interceptors=list(interceptors),
        options=SERVER_OPTIONS,
    )
    register_fn(server)

    health_servicer = health.HealthServicer()
    health_pb2_grpc.add_HealthServicer_to_server(health_servicer, server)

    reflection.enable_server_reflection(
        tuple(service_names) + (health_pb2.DESCRIPTOR.services_by_name["Health"].full_name,
                                reflection.SERVICE_NAME),
        server,
    )

    addr = f"[::]:{port}"
    if creds is not None:
        server.add_secure_port(addr, creds)
    else:
        server.add_insecure_port(addr)
    return server, health_servicer


def serve_forever(server, health_servicer, names):
    server.start()
    for n in ("",) + tuple(names):
        health_servicer.set(n, health_pb2.HealthCheckResponse.SERVING)
    log.info("serving %s", names)

    def shutdown(signum, frame):
        # module 02 ordering: fail readiness -> wait for the LB -> drain -> exit
        for n in ("",) + tuple(names):
            health_servicer.set(n, health_pb2.HealthCheckResponse.NOT_SERVING)
        log.info("draining…")
        time.sleep(3)
        server.stop(grace=30).wait()

    signal.signal(signal.SIGTERM, shutdown)
    signal.signal(signal.SIGINT, shutdown)
    server.wait_for_termination()
```

## Step 5 — Interceptors: auth, logging, metrics

`shared/interceptors.py`. The handler-kind dispatch from module 03 matters
here — this system has streaming RPCs in both directions, so a unary-only
interceptor would leave them uninstrumented and unauthenticated.

```python
import time, logging
import grpc
from prometheus_client import Counter, Histogram

log = logging.getLogger("rpc")

RPC_STARTED = Counter("grpc_server_started_total", "RPCs started", ["method"])
RPC_HANDLED = Counter("grpc_server_handled_total", "RPCs completed", ["method", "code"])
RPC_LATENCY = Histogram("grpc_server_handling_seconds", "RPC latency", ["method"],
                        buckets=(.001, .005, .01, .025, .05, .1, .25, .5, 1, 2.5, 5, 10))

_HANDLER_FACTORY = {
    "unary_unary": grpc.unary_unary_rpc_method_handler,
    "unary_stream": grpc.unary_stream_rpc_method_handler,
    "stream_unary": grpc.stream_unary_rpc_method_handler,
    "stream_stream": grpc.stream_stream_rpc_method_handler,
}


def _kind(handler):
    for k in _HANDLER_FACTORY:
        if getattr(handler, k) is not None:
            return k
    raise RuntimeError("unrecognised handler")


def _rewrap(handler, kind, fn):
    # module 03: dropping these serializers is the classic interceptor bug
    return _HANDLER_FACTORY[kind](
        fn,
        request_deserializer=handler.request_deserializer,
        response_serializer=handler.response_serializer,
    )


class ObservabilityInterceptor(grpc.ServerInterceptor):
    def intercept_service(self, continuation, details):
        handler = continuation(details)
        if handler is None:
            return None
        kind = _kind(handler)
        inner = getattr(handler, kind)
        method = details.method

        def wrapper(request, context):
            RPC_STARTED.labels(method=method).inc()
            start = time.perf_counter()

            def finish(streamed=None):
                code = context.code()
                RPC_LATENCY.labels(method=method).observe(time.perf_counter() - start)
                RPC_HANDLED.labels(method=method, code=(code.name if code else "OK")).inc()
                log.info("rpc %s code=%s dur_ms=%.2f%s", method,
                         code.name if code else "OK",
                         (time.perf_counter() - start) * 1000,
                         "" if streamed is None else f" msgs={streamed}")

            try:
                result = inner(request, context)
                if kind in ("unary_stream", "stream_stream"):
                    def counted():
                        n = 0
                        try:
                            for item in result:
                                n += 1
                                yield item
                        finally:
                            finish(n)      # module 03: time the *consumption*
                    return counted()
                finish()
                return result
            except Exception:
                finish()
                raise

        return _rewrap(handler, kind, wrapper)


class AuthInterceptor(grpc.ServerInterceptor):
    """Fails closed. Exempts health/reflection so probes and tooling work."""

    EXEMPT_PREFIXES = ("/grpc.health.v1.Health/", "/grpc.reflection.")

    def __init__(self, verify):
        self._verify = verify

    def intercept_service(self, continuation, details):
        if details.method.startswith(self.EXEMPT_PREFIXES):
            return continuation(details)

        md = dict(details.invocation_metadata or ())
        token = md.get("authorization", "")        # lowercase: gRPC normalises keys
        if not token.startswith("Bearer ") or not self._verify(token[7:]):
            handler = continuation(details)
            kind = _kind(handler) if handler else "unary_unary"

            def deny(request, context):
                context.abort(grpc.StatusCode.UNAUTHENTICATED, "invalid or missing token")

            # must match the real handler's kind, or the client sees a confusing
            # "unary response for streaming call" error instead of UNAUTHENTICATED
            return _rewrap(handler, kind, deny) if handler else \
                grpc.unary_unary_rpc_method_handler(deny)
        return continuation(details)
```

## Step 6 — Security: JWTs and mTLS

`shared/security.py`:

```python
import os
import datetime as dt
import jwt

# HS256 needs >= 32 bytes; newer PyJWT warns loudly below that.
# Load from the environment in anything real — this default is for local dev only.
SECRET = os.getenv("JWT_SECRET", "dev-only-secret-change-me-32-bytes-min")
ALGO = "HS256"


def issue(sub: str, minutes: int = 30) -> str:
    now = dt.datetime.now(dt.timezone.utc)
    return jwt.encode({"sub": sub, "iat": now,
                       "exp": now + dt.timedelta(minutes=minutes)}, SECRET, algorithm=ALGO)


def verify(token: str) -> bool:
    try:
        jwt.decode(token, SECRET, algorithms=[ALGO])
        return True
    except jwt.PyJWTError:
        return False


def subject(token: str) -> str | None:
    try:
        return jwt.decode(token, SECRET, algorithms=[ALGO]).get("sub")
    except jwt.PyJWTError:
        return None
```

Certificates (module 01) — `scripts/certs.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail
mkdir -p certs && cd certs

openssl req -x509 -newkey rsa:2048 -nodes -days 365 \
  -keyout ca.key -out ca.crt -subj "/CN=shop-dev-ca" 2>/dev/null

issue() {   # $1 = name, $2 = SAN
  openssl req -newkey rsa:2048 -nodes -keyout "$1.key" -out "$1.csr" \
    -subj "/CN=$1" 2>/dev/null
  openssl x509 -req -in "$1.csr" -CA ca.crt -CAkey ca.key -CAcreateserial \
    -out "$1.crt" -days 365 -extfile <(printf "subjectAltName=%s" "$2") 2>/dev/null
  rm "$1.csr"
}

issue inventory "DNS:localhost,DNS:inventory,IP:127.0.0.1"
issue orders    "DNS:localhost,DNS:orders,IP:127.0.0.1"
issue gateway   "DNS:localhost,DNS:gateway,IP:127.0.0.1"
echo "certs written to $(pwd)"
```

```python
# shared/security.py (continued)
import grpc, pathlib

CERTS = pathlib.Path(__file__).resolve().parent.parent / "certs"


def _read(name):
    return (CERTS / name).read_bytes()


def server_creds(name):
    return grpc.ssl_server_credentials(
        [(_read(f"{name}.key"), _read(f"{name}.crt"))],   # key FIRST (module 01)
        root_certificates=_read("ca.crt"),
        require_client_auth=True,                          # this is what makes it mTLS
    )


def client_creds(name):
    return grpc.ssl_channel_credentials(
        root_certificates=_read("ca.crt"),
        private_key=_read(f"{name}.key"),
        certificate_chain=_read(f"{name}.crt"),
    )
```

## Step 7 — Running the inventory server

`services/inventory/main.py`:

```python
import shared.bootstrap  # noqa: F401
import logging, os
from prometheus_client import start_http_server
from shop.v1 import inventory_pb2, inventory_pb2_grpc
from services.inventory.service import InventoryService
from shared.serving import build_server, serve_forever
from shared.interceptors import ObservabilityInterceptor, AuthInterceptor
from shared import security

NAME = inventory_pb2.DESCRIPTOR.services_by_name["InventoryService"].full_name

if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(message)s")
    start_http_server(9101)

    use_tls = os.getenv("TLS", "1") == "1"
    server, hs = build_server(
        register_fn=lambda s: inventory_pb2_grpc.add_InventoryServiceServicer_to_server(
            InventoryService(), s),
        service_names=[NAME],
        interceptors=[ObservabilityInterceptor(), AuthInterceptor(security.verify)],
        creds=security.server_creds("inventory") if use_tls else None,
        port=50052,
    )
    serve_forever(server, hs, [NAME])
```

```bash
./scripts/certs.sh
PYTHONPATH=. TLS=0 python services/inventory/main.py
```

Verify it (auth is on, so an unauthenticated call must fail):

```bash
grpcurl -plaintext localhost:50052 list
grpcurl -plaintext localhost:50052 grpc.health.v1.Health/Check
grpcurl -plaintext -d '{"items":[{"sku":"SKU-1","quantity":2}]}' \
        localhost:50052 shop.v1.InventoryService/CheckStock       # expect UNAUTHENTICATED
TOKEN=$(PYTHONPATH=. python -c "from shared import security; print(security.issue('u1'))")
grpcurl -plaintext -H "authorization: Bearer $TOKEN" \
        -d '{"items":[{"sku":"SKU-1","quantity":2}]}' \
        localhost:50052 shop.v1.InventoryService/CheckStock
```

Expected: `list` and `Health/Check` work without a token (they're exempt),
the unauthenticated `CheckStock` returns `UNAUTHENTICATED`, and the
authenticated one returns stock results.

## Step 8 — The orders service (a gRPC client *and* server)

`services/orders/service.py`:

```python
import shared.bootstrap  # noqa: F401
import uuid, datetime as dt, threading
import grpc
from google.protobuf.timestamp_pb2 import Timestamp
from shop.v1 import common_pb2, orders_pb2, orders_pb2_grpc, inventory_pb2, inventory_pb2_grpc


class OrderService(orders_pb2_grpc.OrderServiceServicer):
    def __init__(self, inventory_channel):
        self._inv = inventory_pb2_grpc.InventoryServiceStub(inventory_channel)
        self._orders = {}
        self._lock = threading.Lock()

    @staticmethod
    def _caller_token(context):
        return dict(context.invocation_metadata()).get("authorization")

    def CreateOrder(self, request, context):
        if not request.items:
            context.abort(grpc.StatusCode.INVALID_ARGUMENT, "order must contain items")

        # Propagate the caller's credentials downstream, and bound the call with a
        # deadline so a slow inventory service can't hang this one indefinitely.
        md = [("authorization", self._caller_token(context) or "")]
        try:
            stock = self._inv.CheckStock(
                inventory_pb2.CheckStockRequest(items=request.items),
                metadata=md, timeout=2.0,
            )
        except grpc.RpcError as e:
            if e.code() == grpc.StatusCode.DEADLINE_EXCEEDED:
                context.abort(grpc.StatusCode.UNAVAILABLE, "inventory timed out")
            if e.code() == grpc.StatusCode.INVALID_ARGUMENT:
                context.abort(grpc.StatusCode.INVALID_ARGUMENT, e.details())
            context.abort(grpc.StatusCode.UNAVAILABLE, f"inventory unavailable: {e.code().name}")

        ts = Timestamp(); ts.FromDatetime(dt.datetime.now(dt.timezone.utc))
        order = common_pb2.Order(
            id=f"ORD-{uuid.uuid4().hex[:8]}",
            customer_id=request.customer_id,
            items=list(request.items),
            created_at=ts,
        )

        if stock.all_available:
            order.status = common_pb2.ORDER_STATUS_CONFIRMED
            order.total = sum(r.unit_price * i.quantity
                              for r, i in zip(stock.results, request.items))
        else:
            order.status = common_pb2.ORDER_STATUS_REJECTED
            short = [r.sku for r in stock.results if not r.sufficient]
            order.rejection_reason = "insufficient stock: " + ", ".join(short)

        with self._lock:
            self._orders[order.id] = order
        return orders_pb2.CreateOrderResponse(order=order)

    def GetOrder(self, request, context):
        with self._lock:
            order = self._orders.get(request.id)
        if order is None:
            context.abort(grpc.StatusCode.NOT_FOUND, f"order {request.id} not found")
        return orders_pb2.GetOrderResponse(order=order)

    def WatchOrders(self, request, context):
        # server streaming: yield matching orders, stopping if the client goes away
        with self._lock:
            matching = [o for o in self._orders.values()
                        if o.customer_id == request.customer_id]
        limit = request.limit or len(matching)
        for order in matching[:limit]:
            if not context.is_active():      # client cancelled or deadline expired
                return
            yield order
```

`services/orders/main.py`:

```python
import shared.bootstrap  # noqa: F401
import logging, os
import grpc
from prometheus_client import start_http_server
from shop.v1 import orders_pb2, orders_pb2_grpc
from services.orders.service import OrderService
from shared.serving import build_server, serve_forever, CLIENT_OPTIONS
from shared.interceptors import ObservabilityInterceptor, AuthInterceptor
from shared import security

NAME = orders_pb2.DESCRIPTOR.services_by_name["OrderService"].full_name

if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(message)s")
    start_http_server(9102)

    use_tls = os.getenv("TLS", "1") == "1"
    target = os.getenv("INVENTORY_ADDR", "localhost:50052")

    if use_tls:
        inv_channel = grpc.secure_channel(target, security.client_creds("orders"),
                                          options=CLIENT_OPTIONS)
    else:
        inv_channel = grpc.insecure_channel(target, options=CLIENT_OPTIONS)

    server, hs = build_server(
        register_fn=lambda s: orders_pb2_grpc.add_OrderServiceServicer_to_server(
            OrderService(inv_channel), s),
        service_names=[NAME],
        interceptors=[ObservabilityInterceptor(), AuthInterceptor(security.verify)],
        creds=security.server_creds("orders") if use_tls else None,
        port=50051,
    )
    serve_forever(server, hs, [NAME])
```

```bash
PYTHONPATH=. TLS=0 python services/orders/main.py
grpcurl -plaintext -H "authorization: Bearer $TOKEN" \
  -d '{"customer_id":"C1","items":[{"sku":"SKU-1","quantity":2}]}' \
  localhost:50051 shop.v1.OrderService/CreateOrder
```

Expected: a confirmed order with a computed total. Now order `SKU-3`
(stock 0) and confirm you get `ORDER_STATUS_REJECTED` with a
`rejection_reason` — the `optional` field from step 1 doing its job.

## Step 9 — The REST gateway

`services/gateway/main.py` (module 04's "both protocols, shared logic"
pattern, with gRPC as the logic layer):

```python
import shared.bootstrap  # noqa: F401
import os
import grpc
from fastapi import FastAPI, HTTPException, Header
from google.protobuf.json_format import MessageToDict
from shop.v1 import orders_pb2, orders_pb2_grpc, common_pb2
from shared.serving import CLIENT_OPTIONS
from shared import security

app = FastAPI(title="Shop Gateway")

_target = os.getenv("ORDERS_ADDR", "localhost:50051")
_channel = (grpc.secure_channel(_target, security.client_creds("gateway"), options=CLIENT_OPTIONS)
            if os.getenv("TLS", "1") == "1"
            else grpc.insecure_channel(_target, options=CLIENT_OPTIONS))
_stub = orders_pb2_grpc.OrderServiceStub(_channel)

# module 04: the standard gRPC -> HTTP status mapping
STATUS = {
    grpc.StatusCode.INVALID_ARGUMENT: 400,
    grpc.StatusCode.UNAUTHENTICATED: 401,
    grpc.StatusCode.PERMISSION_DENIED: 403,
    grpc.StatusCode.NOT_FOUND: 404,
    grpc.StatusCode.ALREADY_EXISTS: 409,
    grpc.StatusCode.RESOURCE_EXHAUSTED: 429,
    grpc.StatusCode.UNIMPLEMENTED: 501,
    grpc.StatusCode.UNAVAILABLE: 503,
    grpc.StatusCode.DEADLINE_EXCEEDED: 504,
}


def _md(authorization: str | None):
    if not authorization:
        raise HTTPException(401, "missing Authorization header")
    return [("authorization", authorization)]


def _call(fn, *args, **kwargs):
    try:
        return fn(*args, **kwargs)
    except grpc.RpcError as e:
        raise HTTPException(STATUS.get(e.code(), 500), e.details() or e.code().name)


def _json(msg):
    # always_print_fields_with_no_presence: keep zero/empty fields in the JSON so
    # REST clients get a stable shape (module 04, exercise 8)
    return MessageToDict(msg, preserving_proto_field_name=True,
                         always_print_fields_with_no_presence=True)


@app.post("/v1/orders", status_code=201)
def create_order(body: dict, authorization: str | None = Header(default=None)):
    req = orders_pb2.CreateOrderRequest(
        customer_id=body.get("customer_id", ""),
        items=[common_pb2.LineItem(sku=i["sku"], quantity=i["quantity"])
               for i in body.get("items", [])],
    )
    return _json(_call(_stub.CreateOrder, req, metadata=_md(authorization), timeout=5).order)


@app.get("/v1/orders/{order_id}")
def get_order(order_id: str, authorization: str | None = Header(default=None)):
    req = orders_pb2.GetOrderRequest(id=order_id)
    return _json(_call(_stub.GetOrder, req, metadata=_md(authorization), timeout=5).order)


@app.get("/v1/customers/{customer_id}/orders")
def watch(customer_id: str, limit: int = 10, authorization: str | None = Header(default=None)):
    req = orders_pb2.WatchOrdersRequest(customer_id=customer_id, limit=limit)
    stream = _call(_stub.WatchOrders, req, metadata=_md(authorization), timeout=10)
    return [_json(o) for o in stream]


@app.get("/healthz")
def healthz():
    return {"status": "ok"}
```

```bash
PYTHONPATH=. TLS=0 uvicorn services.gateway.main:app --port 8000
curl -s -X POST localhost:8000/v1/orders -H "Authorization: Bearer $TOKEN" \
     -H 'content-type: application/json' \
     -d '{"customer_id":"C1","items":[{"sku":"SKU-1","quantity":2}]}' | python -m json.tool
curl -si localhost:8000/v1/orders/NOPE -H "Authorization: Bearer $TOKEN" | head -1
```

Expected: a JSON order on the first call, and **`HTTP/1.1 404`** on the
second — the status mapping working end to end from `NOT_FOUND`.

## Step 10 — Tests

`tests/conftest.py`:

```python
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "gen"))
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pytest, grpc
from concurrent import futures
from shop.v1 import inventory_pb2_grpc, orders_pb2_grpc
from services.inventory.service import InventoryService
from services.orders.service import OrderService
from shared.interceptors import AuthInterceptor
from shared import security


def _serve(register, interceptors=()):
    server = grpc.server(futures.ThreadPoolExecutor(max_workers=4),
                         interceptors=list(interceptors))
    register(server)
    port = server.add_insecure_port("localhost:0")   # module 03: ephemeral port
    server.start()
    return server, port


@pytest.fixture
def inventory_channel():
    server, port = _serve(
        lambda s: inventory_pb2_grpc.add_InventoryServiceServicer_to_server(InventoryService(), s))
    with grpc.insecure_channel(f"localhost:{port}") as ch:
        yield ch
    server.stop(grace=None)


@pytest.fixture
def orders_channel(inventory_channel):
    server, port = _serve(
        lambda s: orders_pb2_grpc.add_OrderServiceServicer_to_server(
            OrderService(inventory_channel), s))
    with grpc.insecure_channel(f"localhost:{port}") as ch:
        yield ch
    server.stop(grace=None)


@pytest.fixture
def token():
    return security.issue("test-user")
```

`tests/test_system.py`:

```python
import grpc, pytest
from shop.v1 import common_pb2, inventory_pb2, inventory_pb2_grpc, orders_pb2, orders_pb2_grpc
from shared.interceptors import AuthInterceptor


def _items(*pairs):
    return [common_pb2.LineItem(sku=s, quantity=q) for s, q in pairs]


def test_stock_sufficient(inventory_channel):
    stub = inventory_pb2_grpc.InventoryServiceStub(inventory_channel)
    r = stub.CheckStock(inventory_pb2.CheckStockRequest(items=_items(("SKU-1", 2))))
    assert r.all_available is True
    assert r.results[0].available == 100


def test_stock_insufficient(inventory_channel):
    stub = inventory_pb2_grpc.InventoryServiceStub(inventory_channel)
    r = stub.CheckStock(inventory_pb2.CheckStockRequest(items=_items(("SKU-3", 1))))
    assert r.all_available is False


def test_empty_items_is_invalid_argument(inventory_channel):
    stub = inventory_pb2_grpc.InventoryServiceStub(inventory_channel)
    with pytest.raises(grpc.RpcError) as e:
        stub.CheckStock(inventory_pb2.CheckStockRequest(items=[]))
    assert e.value.code() == grpc.StatusCode.INVALID_ARGUMENT      # the contract


def test_client_streaming_restock(inventory_channel):
    stub = inventory_pb2_grpc.InventoryServiceStub(inventory_channel)
    def gen():
        yield inventory_pb2.RestockItem(sku="SKU-3", quantity=10)
        yield inventory_pb2.RestockItem(sku="SKU-3", quantity=5)
        yield inventory_pb2.RestockItem(sku="SKU-2", quantity=1)
    summary = stub.BulkRestock(gen())
    assert summary.items_processed == 3
    assert summary.skus_updated == 2


def test_create_order_confirmed(orders_channel):
    stub = orders_pb2_grpc.OrderServiceStub(orders_channel)
    r = stub.CreateOrder(orders_pb2.CreateOrderRequest(
        customer_id="C1", items=_items(("SKU-1", 2))))
    assert r.order.status == common_pb2.ORDER_STATUS_CONFIRMED
    assert r.order.total == pytest.approx(19.98)
    assert not r.order.HasField("rejection_reason")      # optional field: absent


def test_create_order_rejected_sets_reason(orders_channel):
    stub = orders_pb2_grpc.OrderServiceStub(orders_channel)
    r = stub.CreateOrder(orders_pb2.CreateOrderRequest(
        customer_id="C1", items=_items(("SKU-3", 1))))
    assert r.order.status == common_pb2.ORDER_STATUS_REJECTED
    assert r.order.HasField("rejection_reason")
    assert "SKU-3" in r.order.rejection_reason


def test_get_missing_order_is_not_found(orders_channel):
    stub = orders_pb2_grpc.OrderServiceStub(orders_channel)
    with pytest.raises(grpc.RpcError) as e:
        stub.GetOrder(orders_pb2.GetOrderRequest(id="nope"))
    assert e.value.code() == grpc.StatusCode.NOT_FOUND


def test_watch_orders_streams(orders_channel):
    stub = orders_pb2_grpc.OrderServiceStub(orders_channel)
    for _ in range(3):
        stub.CreateOrder(orders_pb2.CreateOrderRequest(
            customer_id="C9", items=_items(("SKU-1", 1))))
    got = list(stub.WatchOrders(orders_pb2.WatchOrdersRequest(customer_id="C9", limit=2)))
    assert len(got) == 2
```

`tests/test_auth.py` — the negative tests module 01 insisted on:

```python
import grpc, pytest
from concurrent import futures
from shop.v1 import inventory_pb2, inventory_pb2_grpc, common_pb2
from services.inventory.service import InventoryService
from shared.interceptors import AuthInterceptor
from shared import security


@pytest.fixture
def secured():
    server = grpc.server(futures.ThreadPoolExecutor(max_workers=4),
                         interceptors=[AuthInterceptor(security.verify)])
    inventory_pb2_grpc.add_InventoryServiceServicer_to_server(InventoryService(), server)
    port = server.add_insecure_port("localhost:0")
    server.start()
    with grpc.insecure_channel(f"localhost:{port}") as ch:
        yield ch
    server.stop(grace=None)


def _req():
    return inventory_pb2.CheckStockRequest(
        items=[common_pb2.LineItem(sku="SKU-1", quantity=1)])


def test_no_token_rejected(secured):
    stub = inventory_pb2_grpc.InventoryServiceStub(secured)
    with pytest.raises(grpc.RpcError) as e:
        stub.CheckStock(_req())
    assert e.value.code() == grpc.StatusCode.UNAUTHENTICATED


def test_garbage_token_rejected(secured):
    stub = inventory_pb2_grpc.InventoryServiceStub(secured)
    with pytest.raises(grpc.RpcError) as e:
        stub.CheckStock(_req(), metadata=[("authorization", "Bearer nonsense")])
    assert e.value.code() == grpc.StatusCode.UNAUTHENTICATED


def test_valid_token_accepted(secured):
    stub = inventory_pb2_grpc.InventoryServiceStub(secured)
    md = [("authorization", f"Bearer {security.issue('u1')}")]
    assert stub.CheckStock(_req(), metadata=md).all_available is True
```

```bash
PYTHONPATH=. pytest -q
```

## Step 11 — Benchmark it

```bash
TOKEN=$(PYTHONPATH=. python -c "from shared import security; print(security.issue('bench', 600))")

ghz --insecure --proto proto/shop/v1/inventory.proto --import-paths proto \
    --call shop.v1.InventoryService/CheckStock \
    -m "{\"authorization\":\"Bearer $TOKEN\"}" \
    -d '{"items":[{"sku":"SKU-1","quantity":1}]}' \
    -c 50 -n 20000 --connections 5 localhost:50052

hey -n 20000 -c 50 -m POST \
    -H "Authorization: Bearer $TOKEN" -H 'content-type: application/json' \
    -d '{"customer_id":"C1","items":[{"sku":"SKU-1","quantity":1}]}' \
    http://localhost:8000/v1/orders
```

Read the status distribution first (module 05). Then compare: the REST path
traverses gateway → orders → inventory, so it is *not* a protocol comparison
— it's an architecture comparison, and the extra hops should dominate. Note
how much of the difference is hops rather than encoding.

## Step 12 — Run it all together

`docker-compose.yml`:

```yaml
services:
  inventory:
    build: .
    command: python services/inventory/main.py
    environment: { PYTHONPATH: /app, TLS: "1" }
    ports: ["50052:50052", "9101:9101"]
  orders:
    build: .
    command: python services/orders/main.py
    environment: { PYTHONPATH: /app, TLS: "1", INVENTORY_ADDR: "inventory:50052" }
    depends_on: [inventory]
    ports: ["50051:50051", "9102:9102"]
  gateway:
    build: .
    command: uvicorn services.gateway.main:app --host 0.0.0.0 --port 8000
    environment: { PYTHONPATH: /app, TLS: "1", ORDERS_ADDR: "orders:50051" }
    depends_on: [orders]
    ports: ["8000:8000"]
```

The certs from step 6 include `DNS:inventory` and `DNS:orders` precisely so
mTLS validates against Docker's service names. Run `TLS=1` and confirm the
whole chain still works — that's the payoff for issuing SANs carefully.

## Verify you've built it correctly

Work through this checklist; each item maps to a module:

- [ ] An unauthenticated `CreateOrder` returns `UNAUTHENTICATED`, and the handler never runs (01)
- [ ] `grpc.health.v1.Health/Check` works *without* a token (01, 02)
- [ ] Ordering out-of-stock `SKU-3` yields `REJECTED` with `rejection_reason` set, and `HasField` is False when in stock (00)
- [ ] `WatchOrders` streams and the interceptor logs a non-zero duration and message count (03)
- [ ] `localhost:9101/metrics` shows `grpc_server_handled_total` split by `code` (03)
- [ ] `curl` on a missing order returns HTTP 404, not 200 (04)
- [ ] `SIGTERM` drains in-flight RPCs instead of severing them (02)
- [ ] `pytest -q` passes, including all three auth negative tests (03)
- [ ] `TLS=1` works end to end under docker-compose (01)

## Extend it yourself

No solutions given — each maps to a module you've finished:

1. **Schema evolution under load.** Add `optional string coupon_code` to
   `CreateOrderRequest`, deploy the new inventory service while the *old*
   orders service is still running, and prove nothing breaks (00).
2. **Break it on purpose.** Change `LineItem.quantity` from `int32` to
   `sint32`, keep the field number, and observe what reaches the server (00).
3. **Real load balancing.** Run three inventory replicas on different ports,
   point orders at all three, and prove `round_robin` distributes while
   `pick_first` doesn't (02).
4. **Retries.** Add a gRPC retry policy via service config for `UNAVAILABLE`,
   and make sure `CreateOrder` is idempotent first — or you'll double-charge
   (02, and track 10).
5. **Tracing.** Add OpenTelemetry and get one trace spanning
   gateway → orders → inventory (03).
6. **gRPC-Web.** Put Envoy in front of orders and call it from a browser (04).
7. **Deadline propagation.** Make the gateway's 5 s budget shrink as it
   passes down, so inventory never outlives the client's patience (02, 03).

## This is the end of the track

Modules 00-06 are complete. You've taken gRPC from "I can define a service"
to schema evolution that survives production, mTLS, health and graceful
shutdown, load balancing that actually balances, real observability, a REST
gateway, honest benchmarks, and a working multi-service system that uses all
of it.

Back to the track index: [../README.md](../README.md)
Back to the backend master index: [../../README.md](../../README.md)
