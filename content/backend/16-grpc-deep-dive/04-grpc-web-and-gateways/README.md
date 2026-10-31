# Module 04: gRPC-Web, Gateways and Interop

## Why this matters

A browser cannot call your gRPC service. Not "it's awkward" — it is
genuinely impossible with the standard API. gRPC requires control over
HTTP/2 framing: trailers, individual frames, and the ability to leave a
request stream open. The browser `fetch` and `XMLHttpRequest` APIs expose
none of that, by design. So every gRPC service that a web front-end needs to
reach requires a translation layer, and the same is true for the REST client
some other team insists on.

This module covers the three ways out — gRPC-Web, a JSON/HTTP transcoding
gateway, and serving both protocols from one process — and, just as
importantly, what each one costs you. Choosing badly here is how teams end
up maintaining two API surfaces that drift apart.

## Concepts

### Why the browser can't speak gRPC

| gRPC needs | Browser provides |
|---|---|
| HTTP/2 trailers (status is sent in trailers) | No API exposes trailers |
| Frame-level control of the request body | `fetch` sends a body; you don't control framing |
| Long-lived bidirectional request streams | Request bodies aren't incrementally writable in practice |

The status-in-trailers detail is the crux: gRPC sends `grpc-status` *after*
the response body, and no browser API can read it. gRPC-Web's core trick is
moving trailers into the body as a specially-framed final chunk.

### Option 1: gRPC-Web

gRPC-Web is a distinct wire protocol — close to gRPC, but expressible over
HTTP/1.1 and readable by browsers. It needs a proxy to translate to real
gRPC (Envoy is the reference implementation):

```
Browser ──gRPC-Web (HTTP/1.1)──▶ Envoy ──gRPC (HTTP/2)──▶ your service
```

```yaml
# envoy.yaml — the essential parts
http_filters:
  - name: envoy.filters.http.grpc_web        # translates gRPC-Web <-> gRPC
  - name: envoy.filters.http.cors
  - name: envoy.filters.http.router
```

CORS is not optional here and is the most common source of "it works in
Postman but not the browser". gRPC-Web needs custom headers exposed:

```yaml
cors:
  allow_origin_string_match: [{ prefix: "*" }]
  allow_headers: "keep-alive,user-agent,cache-control,content-type,content-transfer-encoding,x-grpc-web,grpc-timeout,authorization"
  expose_headers: "grpc-status,grpc-message"     # without this the client can't read the status
```

**What gRPC-Web does not support: client streaming and bidirectional
streaming.** Server streaming works; the other two do not, because the
browser cannot incrementally write a request body. If your design needs
bidi from a browser, you want WebSockets
(`learn/04-networking-fundamentals/11-websocket-and-grpc`), not gRPC-Web.

### Option 2: JSON/HTTP transcoding gateway

Instead of a new protocol, expose a conventional REST+JSON API generated
from the same `.proto`, using `google.api.http` annotations:

```proto
import "google/api/annotations.proto";

service OrderService {
  rpc GetOrder(GetOrderRequest) returns (GetOrderResponse) {
    option (google.api.http) = { get: "/v1/orders/{id}" };
  }
  rpc CreateOrder(CreateOrderRequest) returns (CreateOrderResponse) {
    option (google.api.http) = { post: "/v1/orders" body: "*" };
  }
}
```

`{id}` binds the URL path segment to the request field of that name; `body:
"*"` maps the whole JSON body onto the request message. Implementations:
**grpc-gateway** (Go, generates a reverse proxy), **Envoy's
`grpc_json_transcoder`** filter (no codegen, needs a descriptor set), or
**Google Cloud Endpoints / ESPv2**.

Envoy's transcoder needs the compiled descriptor set from module 00:

```bash
python -m grpc_tools.protoc -I proto -I third_party \
  --descriptor_set_out=descriptor.pb --include_imports \
  proto/shop/v1/order.proto
```

```yaml
- name: envoy.filters.http.grpc_json_transcoder
  typed_config:
    proto_descriptor: "/etc/envoy/descriptor.pb"
    services: ["shop.v1.OrderService"]
    print_options: { always_print_primitive_fields: true }
```

That `always_print_primitive_fields` option deserves attention. By default,
protobuf-JSON **omits fields set to their default value** — so `{"count": 0}`
serializes as `{}`. REST clients that expect the key to exist will break in a
way that looks random (it only happens when the value happens to be zero).
This is module 00's implicit-presence rule resurfacing at the JSON boundary.

### The protobuf ↔ JSON mapping rules worth knowing

| Protobuf | JSON |
|---|---|
| `snake_case` field | `lowerCamelCase` by default (both accepted on input) |
| `int64`, `uint64`, `fixed64` | **string**, not number (JSON can't hold 64-bit ints safely) |
| `bytes` | base64 string |
| `Timestamp` | RFC 3339 string, e.g. `"2026-07-31T10:00:00Z"` |
| `Duration` | string with `s` suffix, e.g. `"3.5s"` |
| enum | the value's name as a string |
| unset scalar | omitted entirely (unless you force emission) |

The `int64`-as-string rule surprises everyone: a JavaScript client receiving
`{"orderId": "9007199254740993"}` is being protected from silent precision
loss, not given a typo.

### Option 3: one process, both protocols

You don't always need a proxy. Serving gRPC and REST from the same process
is often the pragmatic choice for a small service — for example, running a
gRPC server and a FastAPI app side by side, sharing the same service layer:

```python
# shared business logic, two transports
class OrderLogic:
    def get_order(self, order_id: str) -> dict: ...

class OrderServicer(shop_pb2_grpc.OrderServiceServicer):
    def GetOrder(self, request, context):
        data = self.logic.get_order(request.id)
        if data is None:
            context.abort(grpc.StatusCode.NOT_FOUND, f"order {request.id} not found")
        return shop_pb2.GetOrderResponse(order=_to_proto(data))

@app.get("/v1/orders/{order_id}")
def get_order_http(order_id: str):
    data = logic.get_order(order_id)
    if data is None:
        raise HTTPException(404, "order not found")
    return data
```

The discipline that makes this work: **both transports call the same logic
layer, and neither contains business rules.** The moment a validation rule
exists only in the REST handler, your two APIs have diverged and one of them
is wrong.

### Status code mapping

Whatever layer you choose, gRPC status codes must become HTTP ones. The
standard mapping (which gateways implement for you, but you should be able
to reason about):

| gRPC | HTTP |
|---|---|
| `OK` | 200 |
| `INVALID_ARGUMENT` | 400 |
| `UNAUTHENTICATED` | 401 |
| `PERMISSION_DENIED` | 403 |
| `NOT_FOUND` | 404 |
| `ALREADY_EXISTS`, `ABORTED` | 409 |
| `RESOURCE_EXHAUSTED` | 429 |
| `FAILED_PRECONDITION` | 400 |
| `UNIMPLEMENTED` | 501 |
| `UNAVAILABLE` | 503 |
| `DEADLINE_EXCEEDED` | 504 |
| `INTERNAL`, `UNKNOWN`, `DATA_LOSS` | 500 |

### Choosing

| | gRPC-Web | JSON gateway | Both in-process |
|---|---|---|---|
| Client experience | Generated typed stubs | Ordinary REST | Ordinary REST |
| Extra infrastructure | Proxy required | Proxy or codegen | None |
| Streaming | Server only | Server-sent only, awkward | Whatever you build |
| Schema is source of truth | Yes | Yes | Only by discipline |
| Best for | Internal web apps wanting type safety | Public/partner APIs | Small services, few endpoints |

The honest default: if the consumer is your own front-end team and you want
generated types, gRPC-Web. If the consumer is external or "just wants REST",
a JSON gateway. If you have four endpoints and no proxy in your stack, serve
both in-process and keep the logic layer shared.

## Command reference

| Concern | Command |
|---|---|
| Generate descriptor set for transcoding | `python -m grpc_tools.protoc -I proto --descriptor_set_out=descriptor.pb --include_imports proto/**/*.proto` |
| Generate gRPC-Web JS stubs | `protoc -I proto --js_out=import_style=commonjs:out --grpc-web_out=import_style=typescript,mode=grpcwebtext:out proto/shop/v1/order.proto` |
| Run Envoy | `docker run -p 8080:8080 -v $PWD/envoy.yaml:/etc/envoy/envoy.yaml envoyproxy/envoy:v1.31-latest` |
| Call through a JSON gateway | `curl -s localhost:8080/v1/orders/A-1` |
| Call gRPC directly for comparison | `grpcurl -plaintext -d '{"id":"A-1"}' localhost:50051 shop.v1.OrderService/GetOrder` |
| Force emission of default fields | `always_print_primitive_fields: true` (Envoy) |
| Python protobuf → JSON | `google.protobuf.json_format.MessageToJson(msg)` |
| Python JSON → protobuf | `google.protobuf.json_format.Parse(text, Msg())` |

## Hands-on exercises

```bash
pip install grpcio grpcio-tools protobuf fastapi uvicorn
# Envoy via Docker; grpcurl from https://github.com/fullstorydev/grpcurl
```

### 1. See the JSON mapping for yourself

```python
from google.protobuf.json_format import MessageToJson, MessageToDict
from shop.v1 import order_pb2

o = order_pb2.Order(id="A-1", quantity=0, total_cents=9007199254740993)
print(MessageToJson(o))
print(MessageToJson(o, always_print_fields_with_no_presence=True))
```

Expected: in the first output `quantity` is **absent** (it's zero), and
`totalCents` is a **string**, not a number. In the second, `quantity`
appears. Write down both surprises — they are the two things that break REST
clients built against a gRPC-derived API.

(The keyword argument was named `including_default_value_fields` in older
protobuf releases; check your version if it errors.)

### 2. Confirm the field-name casing rule

Parse `{"totalCents": "5"}` and `{"total_cents": "5"}` into the same message.

Expected: both succeed — protobuf-JSON accepts either on input but emits
`lowerCamelCase` by default. Then use
`MessageToJson(o, preserving_proto_field_name=True)` and confirm the output
switches to `snake_case`.

### 3. Stand up Envoy as a gRPC-Web proxy

Write the `envoy.yaml` with the `grpc_web` and `cors` filters, route to your
gRPC service, and confirm a plain HTTP/1.1 request reaches it.

Expected: the call succeeds through port 8080 while your service only speaks
HTTP/2 on 50051. Then remove `expose_headers: "grpc-status,grpc-message"`
and observe the browser-side failure mode — the call completes but the
client cannot determine the status.

### 4. Prove gRPC-Web can't do client streaming

Attempt a client-streaming RPC through the gRPC-Web proxy.

Expected: it fails. Write one sentence on the underlying reason (browser
request bodies aren't incrementally writable), and name what you'd use
instead.

### 5. Add HTTP annotations and transcode

Annotate `GetOrder` with `get: "/v1/orders/{id}"`, generate the descriptor
set, configure `grpc_json_transcoder`, and call:

```bash
curl -s localhost:8080/v1/orders/A-1
grpcurl -plaintext -d '{"id":"A-1"}' localhost:50051 shop.v1.OrderService/GetOrder
```

Expected: equivalent data from both. Confirm that `curl -i` on a missing
order returns **404**, not 200 with an error body — the status mapping is
working.

### 6. Serve both protocols from one process

Run the gRPC server and a FastAPI app sharing one `OrderLogic` instance.
Confirm both `curl localhost:8000/v1/orders/A-1` and the grpcurl call return
the same result.

Then introduce a bug on purpose: add a validation rule (reject IDs not
starting with `A-`) to *only* the REST handler. Confirm gRPC still accepts
the invalid ID.

Expected: the two APIs now disagree. This is the failure mode the shared
logic layer exists to prevent — you just produced it in ten seconds.

### 7. Map the status codes

For each of `NOT_FOUND`, `INVALID_ARGUMENT`, `UNAUTHENTICATED`,
`RESOURCE_EXHAUSTED` and `DEADLINE_EXCEEDED`, make your service return it and
record the HTTP status your gateway produced.

Expected: 404, 400, 401, 429, 504. Any mismatch means your gateway is
misconfigured or you're translating by hand and got it wrong.

### 8. Diagnose and fix: the field that disappears

A web team reports that their order dashboard shows `undefined` for the
"items remaining" counter — but *only* for orders that are fully shipped.
Everything else renders. The backend team confirms the gRPC service returns
the field correctly, and `grpcurl` shows it. The gateway is Envoy's
`grpc_json_transcoder`.

<details>
<summary>Solution</summary>

"Fully shipped" means `items_remaining` is **0**, and protobuf-JSON omits
fields set to their default value. So the JSON is `{}` rather than
`{"itemsRemaining": 0}`, and the front-end reads `undefined`. `grpcurl`
showed it because gRPC's binary encoding and grpcurl's own output don't
apply the same omission rules the JSON transcoder does.

Two layers of fix, and you want both:

1. **Gateway:** set `always_print_primitive_fields: true` so zero-valued
   fields are emitted, making the JSON shape stable.
2. **Client:** treat absent as zero (`res.itemsRemaining ?? 0`), because
   protobuf-JSON's omission behavior is the documented default and any other
   gateway will do the same thing.

Note this is module 00's implicit-presence rule with a different symptom: if
the field genuinely needed to distinguish "zero" from "unknown", it should
have been declared `optional` in the `.proto`, and then it would carry
explicit presence all the way through to JSON.

</details>

## Independent challenge

No solution given. You own a gRPC service consumed by three clients: an
internal React dashboard (wants type safety, does one server-streaming
"live orders" view), an external partner (contractually promised "a REST
API with an OpenAPI spec"), and an internal Python batch job (already uses
gRPC directly, high throughput).

Design the API surface. Decide what each client talks to, what
infrastructure you're adding, and how you keep the REST contract and the
`.proto` from drifting. Then answer the hard part: the partner asks for a
field that makes no sense in the gRPC API, and your React team asks for a
streaming endpoint the partner must never see. How does your design express
"this method is public" versus "this method is internal", and where is that
enforced?

<details>
<summary>Stuck? One hint</summary>

The two-audiences problem is usually solved by *two proto packages*, not one
with conditional exposure: an internal `shop.v1` and a deliberately smaller
public `shop.public.v1` whose messages are hand-mapped from the internal
ones. That mapping layer feels like duplication, and it is — but it's the
thing that lets the internal API change without breaking a contractual
external one, and it gives you an obvious place to enforce which methods are
reachable from outside. Enforcing exposure purely by gateway configuration
(only routing some paths) is weaker: one misconfiguration exposes everything,
and there's no compile-time record of what's public.

</details>

## Common mistakes & troubleshooting

- **Expecting client or bidirectional streaming to work over gRPC-Web.**
  Only server streaming is supported; the browser can't incrementally write
  a request body.
- **Missing `expose_headers: grpc-status, grpc-message` in CORS.** The call
  succeeds but the client can't read the status, producing confusing
  "successful" failures.
- **Assuming JSON emits zero/empty/false fields.** protobuf-JSON omits
  defaults; enable `always_print_primitive_fields` and have clients tolerate
  absence.
- **Expecting `int64` as a JSON number.** It's serialized as a string to
  avoid precision loss beyond 2^53.
- **Forgetting `--include_imports` on the descriptor set.** Transcoding fails
  to resolve `google.api.http` and other imported types.
- **Business logic in the transport handler.** With two transports it will
  exist in one and not the other, and the APIs silently diverge.
- **Hand-rolling status-code translation.** Use the standard mapping;
  inventing your own means clients can't rely on documented behavior.
- **Exposing the internal proto directly to external partners.** Every
  internal refactor then becomes a breaking change to a contract you can't
  unilaterally alter.

## Checkpoint quiz

<details>
<summary>Show questions</summary>

1. Why can't a browser call a standard gRPC service? Give the specific
   protocol-level reason.
2. Which of the four RPC types does gRPC-Web support, and why are the others
   impossible?
3. What does `always_print_primitive_fields` fix, and which module-00
   concept is it a downstream symptom of?
4. Why is `int64` serialized as a JSON string rather than a number?
5. What does `body: "*"` mean in a `google.api.http` annotation?
6. When serving both gRPC and REST from one process, what's the single most
   important structural rule?
7. Which HTTP status codes correspond to `RESOURCE_EXHAUSTED`,
   `DEADLINE_EXCEEDED` and `FAILED_PRECONDITION`?

</summary>
</details>

<details>
<summary>Show answers</summary>

1. Because gRPC transmits its final status (`grpc-status`) in HTTP/2
   *trailers*, and no browser API exposes trailers. gRPC also requires
   frame-level control over the request body, which `fetch`/`XHR` don't
   provide. gRPC-Web works around this by moving trailers into the response
   body as a specially framed final chunk.
2. Unary and server streaming. Client streaming and bidirectional streaming
   are impossible because the browser cannot incrementally write to a request
   body — once the request is sent, the client can't keep feeding it
   messages.
3. It forces protobuf-JSON to emit fields that are set to their type's
   default (0, "", false) instead of omitting them, so the JSON shape stays
   stable for REST clients. It's a downstream symptom of proto3 *implicit
   presence*: a default-valued scalar is indistinguishable from an unset one,
   so the JSON encoder has no reason to emit it.
4. Because JSON numbers are IEEE-754 doubles, which lose precision above
   2^53 — a 64-bit integer can't round-trip safely as a number, so the
   canonical mapping uses a string to preserve the exact value.
5. It maps the entire JSON request body onto the request message (rather
   than binding only a named sub-field), so a POST body's fields populate the
   request message directly. Path parameters like `{id}` bind separately to
   the field of that name.
6. Both transports must delegate to one shared business-logic layer, and
   neither transport handler may contain business rules. Otherwise a rule
   added to one handler doesn't exist in the other and the two APIs silently
   diverge.
7. `RESOURCE_EXHAUSTED` → 429, `DEADLINE_EXCEEDED` → 504,
   `FAILED_PRECONDITION` → 400.

</details>

## Further reading & sources

- [gRPC-Web: overview and limitations](https://github.com/grpc/grpc-web) - the reference client, supported RPC types, and the trailers workaround.
- [Envoy: gRPC-Web filter](https://www.envoyproxy.io/docs/envoy/latest/configuration/http/http_filters/grpc_web_filter) and [gRPC-JSON transcoder](https://www.envoyproxy.io/docs/envoy/latest/configuration/http/http_filters/grpc_json_transcoder_filter) - configuration for both translation layers.
- [grpc-gateway](https://grpc-ecosystem.github.io/grpc-gateway/) - the codegen-based alternative, including OpenAPI spec generation.
- [Protocol Buffers: JSON mapping](https://protobuf.dev/programming-guides/json/) - the authoritative table for casing, int64-as-string, and default omission.
- [Google AIP-127: HTTP and gRPC transcoding](https://google.aip.dev/127) - the `google.api.http` annotation conventions.

## Next

[05-performance-and-benchmarking](../05-performance-and-benchmarking/README.md) —
you've now added one or two hops between clients and your service. Module 05
is about measuring what any of this actually costs, instead of assuming.
