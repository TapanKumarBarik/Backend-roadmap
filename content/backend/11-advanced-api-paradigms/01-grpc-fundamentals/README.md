# Module 01: gRPC Fundamentals

## Why this matters

In module 00 you decided that some traffic — especially the chatty, internal,
high-frequency calls between your own services — wants an RPC-style API rather
than REST. This module makes that concrete. gRPC is the most widely used
production RPC framework: it's what powers the internal service meshes at
Google, Netflix, and most large microservice shops, and it's the default answer
when someone says "our services should talk over something faster and more
typed than JSON."

The thing to internalize first is that gRPC is **contract-first**. Before you
write a line of server or client code, you write a `.proto` file — a formal,
language-neutral definition of your service's methods and the message shapes
they exchange. From that single file, a code generator produces typed client
*stubs* and server *base classes* in Python (or Go, Java, C++, TypeScript,
whatever). The contract isn't documentation that can drift from the code the way
a hand-maintained OpenAPI file might; the contract *generates* the code, so
both ends are provably speaking the same schema. This is the inverse of the
code-first REST workflow you know from track 02, and it's a big part of why gRPC
feels safe between services owned by different teams.

The payoff is threefold: **speed** (Protocol Buffers serialize to a compact
binary form, and gRPC rides HTTP/2 with header compression and multiplexing),
**typing** (a client literally cannot call a method that doesn't exist or pass a
field of the wrong type — it won't compile / the stub won't have it), and
**polyglot reach** (a Python service and a Go service generated from the same
`.proto` interoperate with zero hand-written glue). This module gets you to a
working unary call — one request, one response, the RPC analog of a plain HTTP
`GET`/`POST`. Streaming and the advanced patterns come in module 02.

## Concepts

### What gRPC is: Protobuf + HTTP/2 + generated stubs

gRPC is three technologies working together:

- **Protocol Buffers (Protobuf)** — the *interface definition language* (IDL)
  and *serialization format*. You describe messages and services in a `.proto`
  file; Protobuf encodes those messages into a compact binary wire format
  (dramatically smaller and faster to parse than JSON, because field names
  aren't sent — only numbered field tags).
- **HTTP/2** — the transport. It gives gRPC multiplexed streams over one
  connection (many concurrent calls, no head-of-line blocking at the HTTP
  level), binary framing, and header compression. This is also what makes
  streaming (module 02) natural.
- **Generated code** — a compiler (`protoc`, invoked here via `grpcio-tools`)
  reads your `.proto` and emits language-specific **stubs** (client-side: an
  object whose methods *are* your RPCs) and **servicer base classes**
  (server-side: a class you subclass and fill in). You write neither the
  serialization nor the HTTP handling by hand.

The mental model: the `.proto` is the source of truth; both client and server
are downstream artifacts of it.

### Protocol Buffers: messages, fields, and field numbers

A `.proto` file (proto3 syntax — the current default) defines **messages**
(the data structures) and **services** (the callable methods). A message is a
set of typed, *numbered* fields:

```protobuf
syntax = "proto3";

package orders.v1;              // namespace, versioned

message Order {
  int64 id = 1;                 // the =1, =2 are FIELD NUMBERS, not values
  string customer = 2;
  int32 quantity = 3;
  OrderStatus status = 4;
  repeated string tags = 5;     // 'repeated' = a list/array
}

enum OrderStatus {
  ORDER_STATUS_UNSPECIFIED = 0; // proto3 enums MUST have a 0 default
  ORDER_STATUS_PENDING = 1;
  ORDER_STATUS_SHIPPED = 2;
}
```

The **field numbers** (`= 1`, `= 2`, …) are the heart of Protobuf's wire
format and its evolution story. The binary encoding sends the *number*, not the
field name, so:

- Field numbers must be **unique within a message** and, once shipped, are
  **permanent** — you never reuse or renumber a field, or old clients will
  misread data.
- Renaming a field is safe on the wire (the number is unchanged); *changing its
  number is a breaking change*.
- Numbers 1–15 encode in a single byte, so give your most frequent fields the
  low numbers.

Scalar types include `int32`/`int64`, `bool`, `string`, `bytes`, `double`,
`float`; `repeated` makes a field a list; `enum` defines an enumeration whose
zero value is the default. This numbering discipline is why Protobuf handles
schema evolution gracefully — the versioning payoff shows up in module 02 and
track-wide in module 07.

### Defining a service

A **service** is a named collection of **RPC methods**, each with exactly one
request message type and one response message type:

```protobuf
service OrderService {
  // unary: one request in, one response out (this module)
  rpc GetOrder(GetOrderRequest) returns (Order);
  rpc CreateOrder(CreateOrderRequest) returns (Order);
}

message GetOrderRequest { int64 id = 1; }
message CreateOrderRequest {
  string customer = 1;
  int32 quantity = 2;
}
```

A strong convention (Google's API design guide, and just good hygiene): give
**every** method its own dedicated request and response message —
`GetOrderRequest`, `CreateOrderRequest` — even when a method needs only one
field today. It lets you add fields later without changing the method
signature, which keeps the contract backward-compatible. Note there's no notion
of HTTP verbs or status codes here; a method is just a typed function. The four
kinds of method — unary, server-streaming, client-streaming, bidirectional —
are distinguished by where you put the `stream` keyword; this module covers
**unary** (no `stream`), and module 02 covers the rest.

### Generating Python stubs with grpcio-tools

You compile the `.proto` into Python with the `protoc` compiler wrapped in the
`grpcio-tools` package. It emits **two** files per proto:

- `<name>_pb2.py` — the **message** classes (your `Order`, `GetOrderRequest`,
  etc., as Python objects).
- `<name>_pb2_grpc.py` — the **service** code: a client `Stub` class and a
  server `Servicer` base class.

```bash
pip install grpcio grpcio-tools
python -m grpc_tools.protoc \
  -I./protos \                       # where .proto files live (import root)
  --python_out=./gen \               # message classes -> here
  --grpc_python_out=./gen \          # service stubs -> here
  ./protos/orders.proto
```

A common footgun lives right here: the generated `orders_pb2_grpc.py` imports
its messages as `import orders_pb2`, which only resolves if `./gen` is on the
Python path (or you pass `--python_out`/`--grpc_python_out` to the same package
and import accordingly). Getting the `-I` import root and output package aligned
with how you'll import them is the single most common setup mistake — we drill
it in the exercises and the troubleshooting section.

### Implementing a server and calling it

On the **server**, you subclass the generated `OrderServiceServicer`, implement
each RPC as a method taking `(request, context)`, and register it on a
`grpc.server` bound to a port:

```python
# server.py
from concurrent import futures
import grpc
import orders_pb2, orders_pb2_grpc

class OrderService(orders_pb2_grpc.OrderServiceServicer):
    def __init__(self):
        self._orders, self._next_id = {}, 1

    def GetOrder(self, request, context):
        order = self._orders.get(request.id)
        if order is None:
            context.abort(grpc.StatusCode.NOT_FOUND, f"order {request.id} not found")
        return order

    def CreateOrder(self, request, context):
        order = orders_pb2.Order(
            id=self._next_id, customer=request.customer,
            quantity=request.quantity, status=orders_pb2.ORDER_STATUS_PENDING,
        )
        self._orders[self._next_id] = order
        self._next_id += 1
        return order

def serve():
    server = grpc.server(futures.ThreadPoolExecutor(max_workers=10))
    orders_pb2_grpc.add_OrderServiceServicer_to_server(OrderService(), server)
    server.add_insecure_port("[::]:50051")   # insecure = no TLS; local only
    server.start()
    server.wait_for_termination()

if __name__ == "__main__":
    serve()
```

On the **client**, you open a *channel* to the server, wrap it in the generated
`Stub`, and call methods as if they were local functions — the stub handles
serialization and the network:

```python
# client.py
import grpc
import orders_pb2, orders_pb2_grpc

with grpc.insecure_channel("localhost:50051") as channel:
    stub = orders_pb2_grpc.OrderServiceStub(channel)
    created = stub.CreateOrder(orders_pb2.CreateOrderRequest(customer="ada", quantity=3))
    print(created.id, created.status)          # 1 ORDER_STATUS_PENDING
    fetched = stub.GetOrder(orders_pb2.GetOrderRequest(id=created.id))
    print(fetched.customer)                     # ada
```

`stub.GetOrder(...)` looks like a plain function call, but it's a network round
trip: the request message is serialized to Protobuf binary, sent over HTTP/2,
the server's `GetOrder` runs, and the `Order` response is serialized back. That
"remote call that looks local" is the entire point of RPC.

```text
                 orders.proto  (the one contract)
                 rpc GetOrder(GetOrderRequest) returns (Order)
                        │ protoc / grpcio-tools
             ┌──────────┴──────────┐
             ▼                     ▼
  CLIENT: OrderServiceStub   SERVER: OrderServiceServicer
     stub.GetOrder(req) ──── GetOrderRequest {id:1} ────►  GetOrder(request, context)
                       (Protobuf binary over HTTP/2)
     Order {id:1,...}  ◄──────── Order response ─────────  return order
     one request  ────────────►  one response   (UNARY)
```

### Status codes and errors: `context.abort`

gRPC has its own set of **status codes** (its analog to HTTP status codes) —
`OK`, `NOT_FOUND`, `INVALID_ARGUMENT`, `ALREADY_EXISTS`, `PERMISSION_DENIED`,
`UNAUTHENTICATED`, `DEADLINE_EXCEEDED`, `UNAVAILABLE`, `INTERNAL`, and more. A
handler signals an error by calling `context.abort(code, details)`, which raises
on the client as a `grpc.RpcError` carrying that code and message:

```python
def GetOrder(self, request, context):
    order = self._orders.get(request.id)
    if order is None:
        context.abort(grpc.StatusCode.NOT_FOUND, f"order {request.id} not found")
    return order
```

The rough mapping to REST you already know: `NOT_FOUND` ≈ 404,
`INVALID_ARGUMENT` ≈ 400/422, `ALREADY_EXISTS` ≈ 409, `PERMISSION_DENIED` ≈ 403,
`UNAUTHENTICATED` ≈ 401, `UNAVAILABLE` ≈ 503. Note gRPC does *not* have separate
"client vs server error" number ranges — the code name carries the meaning.
Rich error handling (error details, interceptors) is a module-02 topic; here,
learn the reflex: **don't return a sentinel/empty message for "not found" —
`abort` with the right code** so the client sees a real error.

## Command reference

| Item | Purpose | Example |
|---|---|---|
| `syntax = "proto3";` | Declare proto3 (current default) | top of `.proto` |
| `message Foo { ... }` | Define a data structure | `message Order { int64 id = 1; }` |
| `= N` (field number) | Permanent wire tag for a field | `string customer = 2;` |
| `repeated T field = N;` | A list/array field | `repeated string tags = 5;` |
| `enum` (0 = default) | Enumeration; zero value required | `ORDER_STATUS_UNSPECIFIED = 0;` |
| `service S { rpc M(Req) returns (Resp); }` | Define an RPC service | `rpc GetOrder(GetOrderRequest) returns (Order);` |
| `python -m grpc_tools.protoc` | Generate Python code | see below |
| `*_pb2.py` | Generated **message** classes | `orders_pb2.Order(...)` |
| `*_pb2_grpc.py` | Generated **stub + servicer** | `orders_pb2_grpc.OrderServiceStub` |
| `grpc.server(ThreadPoolExecutor(...))` | Create a server | `max_workers=10` |
| `add_<Svc>Servicer_to_server(impl, server)` | Register your servicer | generated helper |
| `server.add_insecure_port("[::]:50051")` | Bind a port (no TLS) | local/dev only |
| `grpc.insecure_channel("host:port")` | Client connection | wrap in a `Stub` |
| `context.abort(code, details)` | Return a gRPC error | `grpc.StatusCode.NOT_FOUND` |
| `grpcurl` | `curl` for gRPC (needs reflection) | debugging tool |

The generation command you'll run constantly:

```bash
python -m grpc_tools.protoc -I./protos \
  --python_out=./gen --grpc_python_out=./gen \
  ./protos/orders.proto
```

Debugging without a client (gRPC isn't `curl`-able directly because it's binary
over HTTP/2): enable **server reflection** and use `grpcurl`:

```python
# server-side, to allow grpcurl to introspect the schema
from grpc_reflection.v1alpha import reflection
SERVICE_NAMES = (orders_pb2.DESCRIPTOR.services_by_name["OrderService"].full_name,
                 reflection.SERVICE_NAME)
reflection.enable_server_reflection(SERVICE_NAMES, server)
```

```bash
grpcurl -plaintext localhost:50051 list                       # list services
grpcurl -plaintext -d '{"id": 1}' localhost:50051 orders.v1.OrderService/GetOrder
```

## Hands-on exercises

Create a fresh `grpc-orders/` project. Recommended layout: `protos/` for
`.proto` files, `gen/` for generated code (add `gen/` to `.gitignore` — it's a
build artifact), and `server.py` / `client.py` at the root. `pip install grpcio
grpcio-tools`.

### 1. Write your first `.proto`

Create `protos/orders.proto` with `syntax = "proto3";`, a `package orders.v1;`,
an `Order` message (`id`, `customer`, `quantity`, an `OrderStatus` enum), and an
`OrderService` with a unary `GetOrder(GetOrderRequest) returns (Order)`.
Expected: a valid proto3 file that names field numbers starting at 1 and gives
the enum a `..._UNSPECIFIED = 0` member.

### 2. Generate the stubs

Run the `grpc_tools.protoc` command from the reference, outputting to `gen/`.
Expected: `gen/orders_pb2.py` and `gen/orders_pb2_grpc.py` appear. Open both:
confirm `orders_pb2` has an `Order` class and `orders_pb2_grpc` has both an
`OrderServiceStub` and an `OrderServiceServicer`.

### 3. Fix the import path

Try `python -c "import gen.orders_pb2_grpc"` from the project root. If it fails
with `ModuleNotFoundError: No module named 'orders_pb2'`, you've hit the classic
import-root problem. Fix it (add `gen/` to `sys.path`, or generate into a proper
package and adjust imports). Expected: the import succeeds. Note *why* it broke
— the generated `_pb2_grpc` file imports `orders_pb2` as a top-level module.

### 4. Implement the server

Write `server.py`: subclass `OrderServiceServicer`, back it with an in-memory
dict, implement `CreateOrder` and `GetOrder`, register it, and serve on
`50051`. Add `CreateOrder(CreateOrderRequest) returns (Order)` to the proto and
regenerate first. Expected: the server starts and blocks on
`wait_for_termination()`.

### 5. Call it from a client

Write `client.py` that opens an insecure channel, creates an order, then fetches
it back by the returned id, printing both. Run the server, then the client.
Expected: the client prints the created id and status, then the fetched
customer name — a full round trip.

### 6. Return a real error

In `GetOrder`, `context.abort(grpc.StatusCode.NOT_FOUND, ...)` when the id is
absent. In the client, request a nonexistent id inside a `try/except
grpc.RpcError` and print `e.code()` and `e.details()`. Expected: the client
catches `StatusCode.NOT_FOUND` with your message — not an empty `Order`.

### 7. Introspect with grpcurl

Enable server reflection (reference snippet), restart the server, and run
`grpcurl -plaintext localhost:50051 list` and a `GetOrder` call. Expected:
`grpcurl` lists `orders.v1.OrderService` and returns your order as JSON — proof
the binary service is introspectable and debuggable.

### 8. Break the contract on purpose

Change `customer`'s field number from `2` to `7` in the proto, regenerate the
*server* only, and call it with the *old* generated client (still using `= 2`).
Observe the result. Then explain, in a comment, why the data is garbled/dropped.
Expected: `customer` comes back empty or wrong — a concrete demonstration that
field numbers, not names, are the wire contract, and renumbering is a breaking
change.

### 9. Diagnose and fix

This server "works" until a client asks for a missing order, then behaves
badly. Identify every problem and fix it.

```python
class OrderService(orders_pb2_grpc.OrderServiceServicer):
    def __init__(self):
        self.orders = {}

    def GetOrder(self, request, context):
        return self.orders[request.id]        # (A)

    def CreateOrder(self, request, context):
        o = orders_pb2.Order(customer=request.customer)   # (B)
        self.orders[o.id] = o                             # (C)
        return o
```

<details>
<summary>Solution</summary>

1. **(A) `self.orders[request.id]` raises `KeyError`** when the id is missing.
   An unhandled Python exception in a handler surfaces to the client as a
   generic `StatusCode.UNKNOWN` with a leaked traceback in the details — the
   gRPC equivalent of leaking a stack trace in a 500. Look up with `.get()` and
   `context.abort(grpc.StatusCode.NOT_FOUND, ...)` instead.
2. **(B) never sets `id`.** `orders_pb2.Order(customer=...)` leaves `id` at its
   proto3 default of `0`. Every created order has id `0`.
3. **(C) `self.orders[o.id] = o` therefore always writes to key `0`**, so every
   `CreateOrder` overwrites the same slot and you only ever have one order.
   Maintain a `self._next_id` counter and assign `id=self._next_id` on create.

```python
class OrderService(orders_pb2_grpc.OrderServiceServicer):
    def __init__(self):
        self.orders, self._next_id = {}, 1

    def GetOrder(self, request, context):
        o = self.orders.get(request.id)
        if o is None:
            context.abort(grpc.StatusCode.NOT_FOUND, f"order {request.id} not found")
        return o

    def CreateOrder(self, request, context):
        o = orders_pb2.Order(id=self._next_id, customer=request.customer,
                             quantity=request.quantity,
                             status=orders_pb2.ORDER_STATUS_PENDING)
        self.orders[self._next_id] = o
        self._next_id += 1
        return o
```

Lesson: proto3 has no "unset" for scalars — missing fields are zero/empty, so
never assume a field was populated, and always turn "not found" into an explicit
`abort`, never an unhandled exception.

</details>

## Independent challenge

No code given. Back in **module 00** you classified an internal
`inventory-service` called by a `checkout-service` as a gRPC-shaped problem.
Build that service for real: define an `InventoryService` in a `.proto` with two
unary RPCs — `CheckStock(sku, quantity) -> {available: bool, on_hand: int}` and
`ReserveStock(sku, quantity) -> Reservation` — each with its own dedicated
request/response messages and sensible field numbering. Generate the stubs,
implement an in-memory server that returns `INVALID_ARGUMENT` for a non-positive
quantity and `NOT_FOUND` for an unknown SKU, and write a client that exercises
the happy path and both error paths, catching `grpc.RpcError` and printing the
code. No REST anywhere — this is the internal edge from your module-00 topology.

<details>
<summary>Hint</summary>

Give every method its own request/response message even where one field would
do (`CheckStockRequest`, `CheckStockResponse`, `ReserveStockRequest`,
`Reservation`) so you can add fields later without breaking callers — the
dedicated-message convention from Concepts. Map your two validation failures to
the right codes deliberately: a bad quantity is `INVALID_ARGUMENT` (the caller
sent something wrong, ≈ 400/422), an unknown SKU is `NOT_FOUND` (≈ 404). Both go
through `context.abort`, and both surface on the client as a catchable
`grpc.RpcError` whose `.code()` you can assert on.

</details>

## Common mistakes & troubleshooting

- **`ModuleNotFoundError: No module named 'orders_pb2'`.** The generated
  `_pb2_grpc.py` imports its messages as a *top-level* module. Ensure the output
  directory is on `sys.path`, or generate into a package and fix the import.
  This is the number-one gRPC setup error.
- **Reusing or renumbering field numbers.** Field numbers are the permanent wire
  contract. Renaming a field is safe; changing its number silently corrupts data
  for clients built against the old number. Never reuse a retired number either —
  mark it `reserved`.
- **Forgetting the enum zero value.** proto3 enums must have a member with value
  `0`, and it's the default. Model it as an explicit `..._UNSPECIFIED = 0` so
  "not set" is distinguishable from a real value.
- **Assuming a missing scalar is "null."** proto3 scalars have no unset state —
  an absent `int32` is `0`, an absent `string` is `""`. Don't treat zero/empty as
  "the client definitely sent this."
- **Returning an empty message for "not found."** That looks like a valid,
  zero-filled result to the client. Use `context.abort(NOT_FOUND, ...)` so the
  error is unambiguous.
- **Letting handler exceptions escape.** An unhandled Python exception becomes a
  generic `UNKNOWN` status with a leaked traceback. Catch and `abort` with a
  meaningful code, exactly as you'd map a domain error to a clean HTTP status in
  track 02.
- **Trying to `curl` a gRPC endpoint.** It's binary over HTTP/2; plain `curl`
  won't work. Enable server reflection and use `grpcurl`.
- **Editing generated `*_pb2*.py` files.** They're build artifacts — regenerate
  from the `.proto`, don't hand-edit, and keep them out of version control (or
  regenerate in CI).

## Checkpoint quiz

Write down your answer to each question before expanding it — checking without attempting first is the single easiest way to fool yourself into thinking you've learned this.

1. Name the three technologies gRPC combines and what each contributes.
2. What are Protobuf *field numbers*, and why is renaming a field safe but
   *renumbering* it a breaking change?
3. What two files does `grpc_tools.protoc` generate per `.proto`, and what's in
   each?
4. On the server you subclass a generated `...Servicer`; on the client you use a
   generated `...Stub`. In one sentence each, what is each responsible for?
5. A handler can't find the requested record. What's the *correct* gRPC reflex,
   and what happens on the client if you instead let a `KeyError` escape?
6. Why can't you debug a gRPC service with plain `curl`, and what do you use
   instead (and what must the server enable)?
7. In proto3, what is the value of an `int32` field the client never set, and
   what's the practical hazard of that rule?

<details>
<summary>Answers</summary>

1. **Protocol Buffers** (the IDL + compact binary serialization format),
   **HTTP/2** (the transport — multiplexed streams, binary framing, header
   compression, and the basis for streaming), and **generated code**
   (`protoc`/`grpcio-tools` emits typed client stubs and server servicer base
   classes so you write neither serialization nor HTTP handling).
2. Field numbers are the permanent per-field tags actually sent on the wire
   (the field *name* is not transmitted). Renaming a field keeps its number, so
   the wire encoding is unchanged and it's safe; changing the number means old
   and new peers disagree about which field a tag refers to, silently corrupting
   or dropping data — a breaking change.
3. `<name>_pb2.py` holds the **message** classes (the data structures); 
   `<name>_pb2_grpc.py` holds the **service** code — the client `Stub` class and
   the server `Servicer` base class.
4. The **Servicer** base class is what you subclass on the server to implement
   each RPC method `(request, context)`. The **Stub** is the client-side object
   whose methods *are* the RPCs — calling `stub.GetOrder(...)` serializes,
   sends over HTTP/2, and returns the response.
5. Correct reflex: look the record up safely and `context.abort(
   grpc.StatusCode.NOT_FOUND, details)`. If a `KeyError` escapes instead, gRPC
   turns it into a generic `StatusCode.UNKNOWN` and leaks the traceback in the
   error details — the RPC equivalent of a 500 with a stack trace in the body.
6. gRPC is a compact binary protocol over HTTP/2, which plain `curl` can't
   speak/decode. Use `grpcurl`, and the server must enable **server reflection**
   so `grpcurl` can discover the service and message schemas.
7. It's `0` (proto3 scalars have no unset state — string defaults to `""`, bool
   to `false`, etc.). The hazard: you can't distinguish "client sent 0" from
   "client sent nothing," so treating zero/empty as "definitely provided" leads
   to bugs (like the id-`0` overwrite in the diagnose-and-fix).

</details>

## Further reading & sources

- [gRPC Python — Basics tutorial](https://grpc.io/docs/languages/python/basics/) - the official walkthrough of defining a service, generating stubs, and implementing a server/client, mirroring this module's flow.
- [gRPC Python — Quick start](https://grpc.io/docs/languages/python/quickstart/) - the fastest path to installing `grpcio`/`grpcio-tools` and running your first RPC.
- [Protocol Buffers — Proto3 language guide](https://protobuf.dev/programming-guides/proto3/) - the authoritative reference for messages, field numbers, enums, and the wire-format rules behind schema evolution.
- [gRPC — Core concepts and status codes](https://grpc.io/docs/what-is-grpc/core-concepts/) - explains RPC types and the canonical status-code set behind `context.abort`.
- [Google API Improvement Proposals (AIP)](https://google.aip.dev/) - the source of the "dedicated request/response message per method" convention and other gRPC API-design hygiene.
- [grpcurl (GitHub)](https://github.com/fullstorydev/grpcurl) - the `curl`-for-gRPC tool used with server reflection to introspect and call a binary service.

## Next

[02-grpc-streaming-and-advanced-patterns](../02-grpc-streaming-and-advanced-patterns/README.md)
— unary calls are the RPC analog of a plain request/response. Next you'll use
HTTP/2's real superpower: server-streaming, client-streaming, and bidirectional
streaming RPCs, plus deadlines, interceptors (the gRPC analog of the middleware
you built in track 02), and richer error handling.
