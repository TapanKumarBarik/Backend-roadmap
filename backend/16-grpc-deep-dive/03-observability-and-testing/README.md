# Module 03: Observability and Testing

## Why this matters

gRPC is harder to observe than REST for one structural reason: there's no
URL. Your logs can't say `GET /orders/A-1`, your dashboards can't group by
path, and `curl` won't reproduce a failing call. Everything an HTTP-based
stack gets for free from the request line, you have to add deliberately.

Testing has the mirror-image problem. It's tempting to unit-test the
servicer class by calling `service.GetOrder(request, fake_context)`
directly — which tests your business logic while skipping serialization,
interceptors, status codes, deadlines and streaming semantics, i.e. exactly
the parts where gRPC bugs live. This module covers both: making a service
tell you what it's doing, and testing it in a way that would actually catch
a regression.

## Concepts

### Interceptors are the instrumentation point

Everything in this module hangs off interceptors, because they're the one
place every RPC provably passes through. Track 11 introduced them; module 01
used one for auth. The pattern for observability is the same, but it must
handle streaming and exceptions correctly — which the naive version doesn't.

```python
import time, logging, grpc

class LoggingInterceptor(grpc.ServerInterceptor):
    def intercept_service(self, continuation, handler_call_details):
        handler = continuation(handler_call_details)
        if handler is None:
            return None                      # unknown method; let gRPC 404 it

        method = handler_call_details.method

        # A servicer method can be unary or streaming on either side, and the
        # handler exposes exactly one of these four. Wrapping the wrong one
        # silently disables instrumentation for streaming RPCs.
        if handler.unary_unary:
            inner, kind = handler.unary_unary, "unary_unary"
        elif handler.unary_stream:
            inner, kind = handler.unary_stream, "unary_stream"
        elif handler.stream_unary:
            inner, kind = handler.stream_unary, "stream_unary"
        else:
            inner, kind = handler.stream_stream, "stream_stream"

        def wrapper(request_or_iterator, context):
            start = time.perf_counter()
            try:
                result = inner(request_or_iterator, context)
                # For streaming responses `result` is a generator: it hasn't run
                # yet. Consuming it here is what makes timing meaningful.
                if kind in ("unary_stream", "stream_stream"):
                    def counted():
                        n = 0
                        try:
                            for item in result:
                                n += 1
                                yield item
                        finally:
                            _log(method, start, context, extra={"messages": n})
                    return counted()
                _log(method, start, context)
                return result
            except Exception:
                _log(method, start, context, failed=True)
                raise

        return grpc.method_handlers_generic_handler  # placeholder; see note below
```

In practice you rebuild the handler with the matching factory:

```python
        new_handler = {
            "unary_unary": grpc.unary_unary_rpc_method_handler,
            "unary_stream": grpc.unary_stream_rpc_method_handler,
            "stream_unary": grpc.stream_unary_rpc_method_handler,
            "stream_stream": grpc.stream_stream_rpc_method_handler,
        }[kind]
        return new_handler(
            wrapper,
            request_deserializer=handler.request_deserializer,
            response_serializer=handler.response_serializer,
        )
```

Forgetting to pass through `request_deserializer` / `response_serializer` is
the classic bug here — the interceptor works, and then every message fails to
decode.

### What to log, and the one thing not to

Structured, one event per RPC:

```python
def _log(method, start, context, failed=False, extra=None):
    logging.info("rpc", extra={
        "grpc_method": method,                        # "/shop.v1.OrderService/GetOrder"
        "grpc_code": context.code().name if context.code() else "OK",
        "duration_ms": round((time.perf_counter() - start) * 1000, 2),
        "peer": context.peer(),
        **(extra or {}),
    })
```

`grpc_method` is your replacement for the URL — it's the field every
dashboard and alert will group by, so emit it consistently.

The thing not to log: **request and response bodies by default**. Protobuf
messages routinely carry tokens, PII and payment details, and unlike a URL
they're not self-limiting in size. If you need payload logging, make it
opt-in per method and redact explicitly.

### Metrics: the four that matter

```python
from prometheus_client import Counter, Histogram, start_http_server

RPC_STARTED = Counter("grpc_server_started_total", "RPCs started", ["method"])
RPC_HANDLED = Counter("grpc_server_handled_total", "RPCs completed", ["method", "code"])
RPC_LATENCY = Histogram("grpc_server_handling_seconds", "RPC latency", ["method"],
                        buckets=(.001, .005, .01, .025, .05, .1, .25, .5, 1, 2.5, 5, 10))
MSG_SENT    = Counter("grpc_server_msg_sent_total", "Stream messages sent", ["method"])
```

These names mirror the `go-grpc-prometheus` conventions deliberately — using
the community-standard names means existing Grafana dashboards work against
your service without modification.

The `code` label is what makes this useful: a rising `grpc_server_handled_total`
with `code="OK"` is throughput, the same rise with `code="UNAVAILABLE"` is an
incident. Always label by status code, never collapse to a single counter.

Beware cardinality: label by *method*, never by request ID, user ID, or
anything else unbounded — that's how you take down a Prometheus.

### Tracing and context propagation

Distributed tracing is where gRPC actually has an advantage: metadata is a
natural carrier for trace context, and the W3C `traceparent` header works
unchanged.

```python
from opentelemetry.instrumentation.grpc import GrpcInstrumentorServer, GrpcInstrumentorClient

GrpcInstrumentorServer().instrument()      # extracts traceparent from metadata
GrpcInstrumentorClient().instrument()      # injects it on outgoing calls
```

Doing it manually, to see the mechanism:

```python
# client: inject
from opentelemetry.propagate import inject
md = {}
inject(md)                                   # adds "traceparent"
stub.GetOrder(req, metadata=tuple(md.items()))

# server: extract
from opentelemetry.propagate import extract
ctx = extract(dict(context.invocation_metadata()))
```

The rule that makes traces useful across services: **propagate metadata on
outbound calls**. A service that receives a `traceparent` and then calls a
downstream service without forwarding it breaks the trace at that hop, and
you get two disconnected traces instead of one.

### Testing: use a real server

The single most important testing decision is to run an actual gRPC server
and dial it with an actual client. Everything else follows.

```python
import pytest, grpc
from concurrent import futures

@pytest.fixture
def grpc_channel():
    server = grpc.server(futures.ThreadPoolExecutor(max_workers=4))
    shop_pb2_grpc.add_OrderServiceServicer_to_server(OrderService(), server)
    port = server.add_insecure_port("localhost:0")     # 0 = OS picks a free port
    server.start()
    with grpc.insecure_channel(f"localhost:{port}") as channel:
        yield channel
    server.stop(grace=None)
```

`localhost:0` is the detail that makes this safe to run in parallel CI — no
hardcoded port, no collisions, no flaky "address already in use".

```python
def test_get_order_returns_order(grpc_channel):
    stub = shop_pb2_grpc.OrderServiceStub(grpc_channel)
    resp = stub.GetOrder(shop_pb2.GetOrderRequest(id="A-1"))
    assert resp.order.id == "A-1"
```

### Testing error paths properly

Asserting that an RPC "raises" is not enough — the status code *is* the API
contract, and it's what clients branch on.

```python
def test_missing_order_is_not_found(grpc_channel):
    stub = shop_pb2_grpc.OrderServiceStub(grpc_channel)
    with pytest.raises(grpc.RpcError) as exc:
        stub.GetOrder(shop_pb2.GetOrderRequest(id="nope"))
    assert exc.value.code() == grpc.StatusCode.NOT_FOUND      # the contract
    assert "nope" in exc.value.details()
```

### Testing streaming and deadlines

```python
def test_watch_streams_updates(grpc_channel):
    stub = shop_pb2_grpc.OrderServiceStub(grpc_channel)
    received = list(stub.WatchOrders(shop_pb2.WatchRequest(limit=3)))
    assert len(received) == 3

def test_slow_call_respects_deadline(grpc_channel):
    stub = shop_pb2_grpc.OrderServiceStub(grpc_channel)
    with pytest.raises(grpc.RpcError) as exc:
        stub.SlowOperation(shop_pb2.SlowRequest(), timeout=0.1)
    assert exc.value.code() == grpc.StatusCode.DEADLINE_EXCEEDED
```

Deadline tests are worth writing precisely because deadline bugs are
invisible in normal testing — everything is fast locally.

### Testing interceptors, and testing *with* them

Interceptors are ordinary objects; construct the test server with them to
verify enforcement end to end:

```python
def test_unauthenticated_call_is_rejected():
    server = grpc.server(futures.ThreadPoolExecutor(max_workers=2),
                         interceptors=[AuthInterceptor(verify=lambda t: t == "good")])
    ...
    with pytest.raises(grpc.RpcError) as exc:
        stub.GetOrder(req)                                  # no metadata
    assert exc.value.code() == grpc.StatusCode.UNAUTHENTICATED
```

Module 01's exercise 8 exists because a team shipped an interceptor that
authenticated nothing — a single negative test like this would have caught
it. Test the *denial*, not just the success.

### Fakes at the boundary, not of gRPC itself

Fake the database or the downstream client; never fake `grpc` itself. When a
service under test calls another gRPC service, run a fake **server** for the
dependency rather than monkey-patching the stub — you keep serialization and
status-code behavior in the test path.

## Command reference

| Concern | API / command |
|---|---|
| Wrap all four RPC kinds | check `handler.unary_unary` / `unary_stream` / `stream_unary` / `stream_stream` |
| Rebuild a handler | `grpc.unary_unary_rpc_method_handler(fn, request_deserializer=…, response_serializer=…)` |
| RPC name for logs/metrics | `handler_call_details.method` |
| Status code after the call | `context.code()` |
| Caller address | `context.peer()` |
| Read incoming metadata | `dict(context.invocation_metadata())` |
| Ephemeral test port | `server.add_insecure_port("localhost:0")` |
| Assert a status code | `exc.value.code() == grpc.StatusCode.NOT_FOUND` |
| Set a client deadline | `stub.Call(req, timeout=0.1)` |
| Auto-instrument tracing | `GrpcInstrumentorServer().instrument()` |
| Time a call from outside | `grpcurl -plaintext -d '{}' -v host:port pkg.Svc/Method` |

## Hands-on exercises

```bash
pip install grpcio grpcio-tools pytest prometheus-client \
            opentelemetry-sdk opentelemetry-instrumentation-grpc
```

### 1. Build a logging interceptor that handles all four RPC kinds

Implement `LoggingInterceptor` above. Then call a unary RPC and a
server-streaming RPC.

Expected: both produce exactly one log line. Now deliberately break it by
handling only `handler.unary_unary` and returning `continuation(...)`
otherwise — confirm the streaming RPC produces **no** log line at all. That
silent gap is the most common instrumentation bug in gRPC services.

### 2. Prove the serializer passthrough matters

In your rebuilt handler, omit `request_deserializer` and
`response_serializer`.

Expected: the RPC fails to decode. Restore them and confirm it works. Write
down the error text so you recognize it later.

### 3. Time a streaming RPC correctly

With the interceptor from exercise 1, log the duration of a server-streaming
RPC that yields 5 messages with a 200 ms sleep between each.

Expected: ~1 second, not ~0 ms. If you get ~0, you're timing how long it took
to *create* the generator rather than to consume it — which is exactly the
bug the `counted()` wrapper prevents.

### 4. Export Prometheus metrics and label by code

Add the counters and histogram, call `start_http_server(9090)`, then
generate a mix of successful and `NOT_FOUND` calls.

```bash
curl -s localhost:9090/metrics | grep grpc_server_handled_total
```

Expected: separate series for `code="OK"` and `code="NOT_FOUND"`. Then
compute the error rate you'd alert on:
`sum(rate(grpc_server_handled_total{code!="OK"}[5m])) / sum(rate(grpc_server_handled_total[5m]))`.

### 5. Propagate a trace across two services

Run service A that calls service B. Instrument both. Confirm a single trace
spans both hops. Then remove metadata forwarding from A's outbound call.

Expected: two disconnected traces. This is the concrete cost of not
propagating context.

### 6. Build the test fixture and test the happy path

Implement the `grpc_channel` fixture with `localhost:0` and write a passing
test. Then run `pytest -n 4` (with `pytest-xdist`) to confirm parallel runs
don't collide on ports.

### 7. Test the error contract, deadlines and streaming

Write three tests: `NOT_FOUND` with details, a `DEADLINE_EXCEEDED` via
`timeout=0.1`, and a streaming RPC asserting the exact message count.

Expected: all three pass. Then change the server to return a bare
`Exception` instead of `context.abort(NOT_FOUND, ...)` and confirm the test
fails with `UNKNOWN` — proving the test actually checks the contract rather
than just "something went wrong."

### 8. Diagnose and fix: the dashboard that shows zero errors

A service has a Prometheus interceptor, a Grafana dashboard, and an alert on
error rate. During a two-hour incident where clients saw constant
`UNAVAILABLE`, the dashboard showed 100% success and the alert never fired.
The interceptor records:

```python
def wrapper(request, context):
    RPC_STARTED.labels(method=method).inc()
    response = inner(request, context)
    RPC_HANDLED.labels(method=method, code="OK").inc()
    return response
```

<details>
<summary>Solution</summary>

**The code label is hardcoded to `"OK"`.** Every completed RPC is recorded as
a success regardless of what actually happened, so the error-rate query
divides by a numerator that is structurally always zero.

**Failures never reach the increment at all.** When the handler aborts or
raises, `inner(...)` propagates the exception and the `RPC_HANDLED` line is
skipped entirely — so failed RPCs are not merely mislabeled, they're absent.
`grpc_server_started_total` would have been visibly higher than
`grpc_server_handled_total`, which is the signal nobody was looking at.

The fix is to record in a `finally` and read the real code:

```python
def wrapper(request, context):
    RPC_STARTED.labels(method=method).inc()
    code = "OK"
    try:
        return inner(request, context)
    except Exception:
        code = "UNKNOWN"
        raise
    finally:
        c = context.code()
        RPC_HANDLED.labels(method=method, code=(c.name if c else code)).inc()
```

Worth noting the client's `UNAVAILABLE` may never have been recorded
server-side anyway — if the failure was connection-level (module 02's
keepalive or shutdown issues), the RPC never reached an interceptor. That's
why client-side metrics matter too: server-side data alone cannot see the
failures that never arrived.

</details>

## Independent challenge

No solution given. You're handed a gRPC service with no instrumentation and
an intermittent complaint: "sometimes it's slow, maybe once an hour, we
can't reproduce it." You may add anything you like but must not log request
payloads (they contain PII).

Design the minimum instrumentation that would let you characterize the
problem within one day: what metrics with what labels and what histogram
buckets, what log fields, what trace sampling strategy, and what single
dashboard panel you'd look at first. Justify each choice against a specific
hypothesis it would confirm or eliminate — a slow dependency, a lock, thread
pool exhaustion, GC pauses, one bad client, or a network-level issue.
Explain how you'd tell thread-pool queueing apart from a genuinely slow
handler, given the handler's own timing looks identical in both cases.

<details>
<summary>Stuck? One hint</summary>

The queueing-versus-slow-handler distinction is the crux, and interceptor
timing alone cannot resolve it: an interceptor measures the handler once it
is already running, so time spent waiting for a free thread is invisible to
it. You need a second measurement bracketing the wait — client-side latency
compared against server-side handler latency, with the *gap* between them
being queue time — or direct thread-pool saturation metrics. For the rare
event, tail-based or error-biased sampling beats a low uniform sample rate,
because a 1% uniform sample will almost certainly miss a once-an-hour spike.

</details>

## Common mistakes & troubleshooting

- **Instrumenting only `unary_unary`.** Streaming RPCs then produce no logs,
  metrics or spans, and the gap is silent.
- **Dropping `request_deserializer` / `response_serializer`** when rebuilding
  a handler — every message fails to decode.
- **Timing a streaming handler without consuming the generator.** You measure
  generator creation, which is always ~0 ms.
- **Hardcoding the status label**, or incrementing outside a `finally` — the
  failure case is exactly the one that gets skipped.
- **High-cardinality metric labels** (request ID, user ID, order ID). Label
  by method and code only.
- **Logging protobuf payloads by default.** They carry PII and secrets and
  have no natural size bound.
- **Not forwarding metadata on outbound calls**, which severs traces at every
  hop that does it.
- **Testing servicer methods by direct invocation.** Skips serialization,
  interceptors, deadlines and status mapping — the parts most likely to
  break.
- **Only testing success paths.** The status code is the contract; an
  interceptor that authenticates nothing passes every happy-path test.
- **Hardcoded test ports.** Use `localhost:0`.

## Checkpoint quiz

<details>
<summary>Show questions</summary>

1. Why is `handler_call_details.method` the most important field to emit in
   gRPC logs and metrics?
2. What are the four handler kinds an interceptor must handle, and what
   happens if you only handle the unary one?
3. Why does timing a server-streaming RPC require consuming the generator,
   and what do you measure if you don't?
4. Why must the metrics label include the status code, and what label values
   must you avoid entirely?
5. Why should the metric increment happen in a `finally` block?
6. What's wrong with testing a servicer by calling
   `service.GetOrder(request, fake_context)` directly?
7. Why use `localhost:0` in test fixtures?
8. A trace shows two disconnected traces instead of one spanning both
   services. What's the most likely cause?

</summary>
</details>

<details>
<summary>Show answers</summary>

1. Because gRPC has no URL — `method` (e.g. `/shop.v1.OrderService/GetOrder`)
   is the only stable, low-cardinality identifier of *what was called*, so
   it's the field every dashboard, alert and log query groups by. Without it
   you cannot distinguish one RPC from another.
2. `unary_unary`, `unary_stream`, `stream_unary`, `stream_stream` — the
   handler exposes exactly one of them. If you only wrap `unary_unary` and
   pass the rest through, all streaming RPCs are silently uninstrumented:
   no logs, no metrics, no spans, and no error to tell you.
3. Because a streaming handler returns a generator that hasn't executed yet;
   the work happens as the generator is consumed. Timing around the call
   itself measures only generator *creation*, which is effectively zero
   regardless of how long the stream actually takes.
4. Because the code is what separates throughput from an incident — the same
   rise in completed RPCs means success at `code="OK"` and an outage at
   `code="UNAVAILABLE"`. Avoid unbounded label values such as request IDs,
   user IDs or resource IDs, which cause a cardinality explosion that can
   take down your metrics backend.
5. Because when the handler aborts or raises, execution skips any increment
   placed after the call — so precisely the failed RPCs go unrecorded,
   producing a dashboard that shows perfect success during an incident.
6. It bypasses serialization/deserialization, interceptors (including auth),
   deadline handling, and the mapping from `context.abort` to real status
   codes — which is where most gRPC-specific bugs actually are. It tests the
   business logic while skipping the framework behavior that's under test.
7. It asks the OS for any free port, so tests never collide on a hardcoded
   port and can run in parallel in CI without flaky "address already in use"
   failures.
8. A service received the trace context but didn't forward it on its
   outbound call — trace propagation requires explicitly injecting the
   incoming `traceparent` into the metadata of downstream requests, and any
   hop that omits this starts a fresh, unlinked trace.

</details>

## Further reading & sources

- [gRPC Python: interceptors](https://grpc.github.io/grpc/python/grpc.html#service-side-interceptor) - the `ServerInterceptor` and handler-factory APIs used throughout this module.
- [OpenTelemetry gRPC instrumentation (Python)](https://opentelemetry-python-contrib.readthedocs.io/en/latest/instrumentation/grpc/grpc.html) - auto-instrumentation and manual context propagation.
- [go-grpc-prometheus metric conventions](https://github.com/grpc-ecosystem/go-grpc-prometheus#metrics) - the community-standard metric names this module mirrors so existing dashboards work.
- [W3C Trace Context](https://www.w3.org/TR/trace-context/) - the `traceparent` format carried in gRPC metadata.
- [Track 08: Observability and operational readiness](../../08-observability-and-operational-readiness/README.md) - the logging/metrics/tracing foundations this module applies to gRPC specifically.

## Next

[04-grpc-web-and-gateways](../04-grpc-web-and-gateways/README.md) — a
well-instrumented, well-tested service that browsers still cannot call at
all. Module 04 fixes that.
