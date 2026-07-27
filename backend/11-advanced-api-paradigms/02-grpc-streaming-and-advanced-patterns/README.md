# Module 02: gRPC Streaming and Advanced Patterns

## Why this matters

Module 01 got you a unary RPC — one request, one response, the RPC analog of a
single HTTP call. That covers most service-to-service traffic, but it leaves
gRPC's signature capability on the table. Because gRPC rides HTTP/2, a single
call can carry a *stream* of messages in either or both directions over one long-
lived connection. That unlocks whole categories of problem that are clumsy over
REST: pushing a live feed of price updates to a caller, uploading a large file
or a long log in chunks, or holding an interactive, back-and-forth session
between two services. You don't open a new connection per message and you don't
poll — the connection stays open and messages flow.

The other half of "production gRPC" is the operational discipline around every
call, streaming or not: **deadlines** (every RPC should have a time budget, or a
slow dependency can hang your whole request chain), **interceptors** (gRPC's
equivalent of the middleware you built in track 02 — one place for auth,
logging, metrics, and error mapping across every method), and **error handling
rich enough to be actionable** (structured error details, and knowing which
codes are safe to retry). These aren't optional polish; they're the difference
between a demo and a service you'd put in a checkout path.

This module builds directly on module 01's `.proto` and servicer/stub model.
The only new syntax is the `stream` keyword; everything else is patterns for
using the connection well. By the end you'll know which of the four RPC types
fits a given problem, and you'll wrap your calls in the deadline-and-interceptor
hygiene that module 07 assumes when it talks about running mixed paradigms in
production.

## Concepts

### The four RPC types

Where you place the `stream` keyword in the `rpc` line determines the call
shape. There are exactly four:

```protobuf
service PriceService {
  // 1. Unary: one request, one response (module 01)
  rpc GetPrice(PriceRequest) returns (Price);

  // 2. Server streaming: one request, a STREAM of responses
  rpc WatchPrice(PriceRequest) returns (stream Price);

  // 3. Client streaming: a STREAM of requests, one response
  rpc UploadTicks(stream Tick) returns (UploadSummary);

  // 4. Bidirectional streaming: both sides stream, independently
  rpc Trade(stream TradeMsg) returns (stream TradeMsg);
}
```

Match the shape to the interaction:

- **Server streaming** — the caller asks once, the server sends many responses
  over time and then completes. Live feeds, "tail these logs," progress updates,
  a large result set delivered in pages without re-requesting.
- **Client streaming** — the caller sends many messages, the server responds
  once at the end. Chunked upload, batch ingestion, streaming metrics where you
  only need an ack/summary.
- **Bidirectional** — both directions stream over the same call, on independent
  schedules (not lock-step ping-pong). Chat, interactive sessions, a live
  negotiation, syncing.

Critically, streaming is *not* the same as async concurrency and it's *not* the
same as pub/sub (track 06). It's still a single logical RPC on one connection
between one client and one server; it just carries multiple messages.

### Server streaming in Python

On the server, a streaming response method is a generator — you `yield`
messages, and each yielded message is flushed to the client immediately:

```python
import time
import prices_pb2, prices_pb2_grpc

class PriceService(prices_pb2_grpc.PriceServiceServicer):
    def WatchPrice(self, request, context):
        price = 100.0
        for _ in range(10):
            if not context.is_active():        # client hung up? stop working
                return
            price += 0.5
            yield prices_pb2.Price(symbol=request.symbol, value=price)
            time.sleep(1)
```

On the client, the call returns an *iterator*; you loop over it and the loop ends
when the server completes the stream:

```python
stub = prices_pb2_grpc.PriceServiceStub(channel)
for price in stub.WatchPrice(prices_pb2.PriceRequest(symbol="ACME")):
    print(price.value)          # arrives one per second, live
```

Note `context.is_active()` — on a stream, the client can disconnect while the
server is still producing. Checking liveness (and returning promptly) is how you
avoid doing work nobody's listening to, the streaming cousin of the WebSocket
connection-leak discipline in track 06.

### Client and bidirectional streaming in Python

For **client streaming**, the server method receives an *iterator of requests*
and returns a single response after consuming it:

```python
def UploadTicks(self, request_iterator, context):
    count = 0
    for tick in request_iterator:      # blocks until each client message arrives
        count += 1
    return prices_pb2.UploadSummary(received=count)
```

The client passes a generator (or any iterable) of request messages:

```python
def gen():
    for v in [1.0, 2.0, 3.0]:
        yield prices_pb2.Tick(value=v)
summary = stub.UploadTicks(gen())
print(summary.received)   # 3
```

For **bidirectional**, the method takes an iterator of requests *and* is a
generator of responses; the two run independently:

```python
def Trade(self, request_iterator, context):
    for msg in request_iterator:
        # react to each incoming message; respond on your own schedule
        yield prices_pb2.TradeMsg(text=f"ack: {msg.text}")
```

The mental model: unary = call a function; server-stream = subscribe to output;
client-stream = feed input then get a result; bidi = an open two-way pipe.

### Deadlines and cancellation

**Every RPC should carry a deadline.** A deadline is an absolute point in time by
which the call must complete; the client sets it as a `timeout`, and gRPC
propagates it to the server (and onward, if the server makes further gRPC calls).
When it expires, the call fails with `DEADLINE_EXCEEDED` on both ends and work
can be cancelled — no more silent hangs where a slow dependency stalls an entire
request chain.

```python
try:
    price = stub.GetPrice(prices_pb2.PriceRequest(symbol="ACME"), timeout=2.0)
except grpc.RpcError as e:
    if e.code() == grpc.StatusCode.DEADLINE_EXCEEDED:
        ...   # the call took longer than 2s
```

The distinction from a plain client-side timeout is that the deadline is
*propagated*: a well-behaved server checks `context.time_remaining()` and can
stop early, and any downstream gRPC calls it makes inherit the shrinking budget.
This is the mechanism that keeps a chain of internal services (module 07's
topology) from stacking latency without bound. A "no deadline" call defaults to
effectively infinite — that's the trap.

### Interceptors — gRPC's middleware

An **interceptor** wraps every RPC on its way in or out, exactly like the
middleware chain from track 02 (module 03–04) wrapped every HTTP request. Server
interceptors handle cross-cutting concerns — authentication, structured logging,
metrics, tracing, and turning exceptions into clean status codes — in one place
instead of in every handler. Client interceptors inject things like auth tokens
and retry logic onto every outbound call.

```python
class LoggingInterceptor(grpc.ServerInterceptor):
    def intercept_service(self, continuation, handler_call_details):
        method = handler_call_details.method
        # ... start timer / read metadata (headers) here ...
        return continuation(handler_call_details)   # proceed to the handler

server = grpc.server(
    futures.ThreadPoolExecutor(max_workers=10),
    interceptors=[LoggingInterceptor()],
)
```

Auth token flows in **metadata** — gRPC's key/value headers, the analog of HTTP
headers. The client attaches it per call; a server interceptor reads and
validates it:

```python
# client: attach a bearer token as metadata
stub.GetPrice(req, metadata=(("authorization", "Bearer <token>"),))
```

Ordering intuition carries over from track 02: put auth and rate limiting in
interceptors so a rejected call never reaches a handler, and keep logging
outermost so even rejected calls are recorded.

### Error handling that's actionable, and retries

Module 01 covered `context.abort(code, details)`. Production adds two things.
First, **rich error details**: beyond a code and a string, gRPC's richer error
model (`grpc_status` / `google.rpc.Status`) lets you attach structured payloads —
field-level validation errors, a `RetryInfo` telling the client how long to wait
— so the caller can react programmatically rather than parsing a message string.

Second, **know which codes are retryable**. Some failures are transient and safe
to retry (ideally with backoff); others are permanent and retrying just wastes
work or double-applies an effect:

- **Retryable (transient):** `UNAVAILABLE` (server down/restarting),
  `DEADLINE_EXCEEDED` (may succeed with a fresh budget), `RESOURCE_EXHAUSTED`
  (back off and retry).
- **Not retryable (permanent):** `INVALID_ARGUMENT`, `NOT_FOUND`,
  `PERMISSION_DENIED`, `UNAUTHENTICATED`, `ALREADY_EXISTS`,
  `FAILED_PRECONDITION` — the request itself is wrong; retrying changes nothing.

And the retry caveat you already know from track 06: **only retry
non-idempotent operations if they're made idempotent** (an idempotency key), or
you risk creating two orders. gRPC supports declarative retry policies via
service config, but the *decision* of what's safe to retry is yours.

## Command reference

| Item | Purpose | Example |
|---|---|---|
| `returns (stream T)` | Server-streaming RPC | `rpc WatchPrice(...) returns (stream Price);` |
| `rpc M(stream T) returns (R)` | Client-streaming RPC | one response after many requests |
| `rpc M(stream T) returns (stream R)` | Bidirectional RPC | independent two-way flow |
| `yield msg` (server) | Emit one stream message | server-stream handler is a generator |
| `for msg in request_iterator` | Consume client stream | server side |
| `for resp in stub.M(req)` | Consume server stream | client side |
| `timeout=<seconds>` | Set an RPC deadline | `stub.GetPrice(req, timeout=2.0)` |
| `context.time_remaining()` | Server checks deadline budget | stop early if near zero |
| `context.is_active()` | Client still connected? | break out of a stream loop |
| `metadata=((k, v), ...)` | Send headers (e.g. auth token) | client call kwarg |
| `context.abort(code, details)` | Return an error | `grpc.StatusCode.INVALID_ARGUMENT` |
| `grpc.ServerInterceptor` | Server-side middleware | auth/logging/metrics |
| `interceptors=[...]` | Register interceptors | `grpc.server(..., interceptors=[...])` |
| `StatusCode.UNAVAILABLE/DEADLINE_EXCEEDED` | Typically retryable | transient failures |
| `StatusCode.INVALID_ARGUMENT/NOT_FOUND` | Not retryable | permanent client errors |

Client-side retry via service config (declarative — the runtime applies backoff):

```python
service_config = json.dumps({
  "methodConfig": [{
    "name": [{"service": "prices.v1.PriceService"}],
    "retryPolicy": {
      "maxAttempts": 4,
      "initialBackoff": "0.2s", "maxBackoff": "2s", "backoffMultiplier": 2,
      "retryableStatusCodes": ["UNAVAILABLE"]   # only transient codes
    }
  }]
})
channel = grpc.insecure_channel("localhost:50051",
    options=[("grpc.service_config", service_config)])
```

## Hands-on exercises

Extend the `grpc-orders` / a new `grpc-prices` project. Add a `prices.proto`
with a `Price`, `Tick`, `TradeMsg`, `UploadSummary`, and a `PriceService`;
regenerate stubs as in module 01 after each proto change.

### 1. Server streaming: a live price feed

Define `WatchPrice(PriceRequest) returns (stream Price)`. Implement it to `yield`
10 prices one per second. Write a client that loops over the call and prints each
as it arrives. Expected: values print one per second, live — not all at once at
the end.

### 2. Client streaming: chunked upload

Define `UploadTicks(stream Tick) returns (UploadSummary)`. The server counts and
sums the ticks; the client sends a generator of ticks. Expected: the client
sends N ticks and gets back one summary with `received == N`.

### 3. Bidirectional: an echo/ack session

Define `Trade(stream TradeMsg) returns (stream TradeMsg)`. The server yields an
`ack:` message for each incoming message. Client sends a few messages and prints
each ack. Expected: one ack per sent message, interleaved over one open call.

### 4. Add a deadline and trip it

Make `GetPrice` sleep 3 seconds server-side. Call it with `timeout=1.0`. Catch
`grpc.RpcError` and assert `e.code() == DEADLINE_EXCEEDED`. Then raise the
timeout above 3s and confirm it succeeds. Expected: the short deadline fails
fast with `DEADLINE_EXCEEDED`; the generous one returns the price.

### 5. Respect the deadline on the server

In the sleepy `GetPrice`, check `context.time_remaining()` and `abort` early (or
return) if the budget is nearly gone instead of sleeping the full 3s. Expected:
the server stops promptly rather than doing work it knows will miss the deadline
— demonstrating deadline *propagation*, not just a client-side timeout.

### 6. Write a logging interceptor

Implement a `grpc.ServerInterceptor` that logs the method name and elapsed time
for every call, and register it. Hit both a unary and a streaming method.
Expected: every RPC is logged in one place, with no logging code inside the
handlers — the middleware lesson from track 02, in gRPC form.

### 7. Auth via metadata + interceptor

Have the client send `("authorization", "Bearer secret")` as metadata. Write a
server interceptor that rejects calls missing/with a wrong token by aborting
`UNAUTHENTICATED` before the handler runs. Expected: calls with the token
succeed; calls without it fail with `UNAUTHENTICATED` and never reach the
handler.

### 8. Classify and configure retries

For `GetPrice`, add a client `retryPolicy` that retries only `UNAVAILABLE` up to
4 times with backoff. Stop the server mid-test and restart it during the retry
window. Expected: the call rides out a brief outage; but confirm an
`INVALID_ARGUMENT` (bad input) is *not* retried — write down why retrying it
would be pointless.

### 9. Diagnose and fix

This streaming setup "works" in a quick test but leaks resources and misbehaves
under a disconnecting client and a non-idempotent retry. Find every problem.

```python
# proto: rpc WatchPrice(PriceRequest) returns (stream Price);
class PriceService(prices_pb2_grpc.PriceServiceServicer):
    def WatchPrice(self, request, context):
        price = 100.0
        while True:                                  # (A)
            price += 1.0
            yield prices_pb2.Price(value=price)
            time.sleep(1)

# client: retries EVERYTHING, and the RPC below is a create-order call
channel = grpc.insecure_channel("localhost:50051", options=[
    ("grpc.service_config", json.dumps({"methodConfig": [{
        "name": [{}],
        "retryPolicy": {"maxAttempts": 5, "initialBackoff": "0.1s",
            "maxBackoff": "1s", "backoffMultiplier": 2,
            "retryableStatusCodes": ["UNAVAILABLE", "INVALID_ARGUMENT",  # (B)
                                     "ALREADY_EXISTS", "DEADLINE_EXCEEDED"]}}]}))])
stub.CreateOrder(req)                                # (C) no deadline, retried
```

<details>
<summary>Solution</summary>

1. **(A) `while True` with no liveness check.** When the client disconnects, the
   server keeps producing prices forever — a leaked worker doing work nobody
   reads (the streaming version of a connection leak). Check
   `if not context.is_active(): return` each iteration, and/or bound the loop.
2. **(B) retrying `INVALID_ARGUMENT` and `ALREADY_EXISTS`.** These are permanent
   client errors — the request is wrong or the effect already happened.
   Retrying wastes attempts and can mask real bugs; retry only transient codes
   (`UNAVAILABLE`, and cautiously `DEADLINE_EXCEEDED`/`RESOURCE_EXHAUSTED`).
3. **(C) retrying a non-idempotent `CreateOrder` with no deadline.** Retrying a
   create can produce duplicate orders — the exact idempotency hazard from track
   06. Either make it idempotent (idempotency key so a retried create returns
   the original) before enabling retries, or exclude it from the retry policy.
   And give it a `timeout=` so a hung call fails fast instead of stalling the
   caller.

Corrected server loop:

```python
def WatchPrice(self, request, context):
    price = 100.0
    for _ in range(600):                 # bounded; or run until disconnect
        if not context.is_active():
            return
        price += 1.0
        yield prices_pb2.Price(value=price)
        time.sleep(1)
```

Lesson: streaming needs disconnect-awareness, deadlines need to be set
deliberately, and retry policies must be scoped to *transient* codes and to
operations that are *safe* (idempotent) to repeat.

</details>

## Independent challenge

No code given. In **module 01** you built an internal `InventoryService` with
unary `CheckStock`/`ReserveStock`. Extend it for the checkout flow's real needs:
add `WatchStock(sku) returns (stream StockLevel)` (server streaming — the
checkout UI wants live on-hand counts while a customer lingers on a product) and
`BulkReserve(stream ReserveRequest) returns (BulkReserveSummary)` (client
streaming — reserve a whole cart's worth of SKUs in one call). Then harden the
whole service: a server interceptor that logs every call and enforces an
`authorization` metadata token, a **deadline** on every client call, and a
retry policy that retries `UNAVAILABLE` only — and make `BulkReserve` safe to
retry. Justify, in comments, which reservations are safe to retry and how you
made them so.

<details>
<summary>Hint</summary>

For `WatchStock`, guard the yield loop with `context.is_active()` so a customer
navigating away doesn't leave the server streaming into the void. For
`BulkReserve`, the retry-safety problem is the module's crux: a naive
bulk-reserve retried after a partial failure double-reserves — attach an
idempotency key per reservation (module-07 / track-06 discipline) so a retried
`BulkReserve` recognizes already-applied reservations and returns the original
result instead of reserving again. Keep auth and logging in **interceptors**,
not in each method, exactly as the track-02 middleware chain kept them out of
each handler.

</details>

## Common mistakes & troubleshooting

- **Unbounded server-stream loops with no liveness check.** A disconnected
  client leaves the server producing forever. Check `context.is_active()` and
  return promptly.
- **No deadline on RPCs.** A call with no `timeout` waits effectively forever; a
  slow dependency then stalls the whole chain. Set a deadline on every call and,
  server-side, honor `time_remaining()`.
- **Treating a client-side timeout as the same thing as a deadline.** A deadline
  is *propagated* to the server and downstream calls; a bare local timeout isn't.
  Use gRPC deadlines so the whole chain shares one budget.
- **Retrying non-idempotent operations.** Retrying a create/charge can duplicate
  the effect. Make it idempotent first, or exclude it from the retry policy.
- **Retrying permanent errors.** `INVALID_ARGUMENT`, `NOT_FOUND`,
  `PERMISSION_DENIED`, etc. won't succeed on retry — scope `retryableStatusCodes`
  to transient failures only.
- **Cross-cutting logic duplicated in every handler.** Auth, logging, metrics,
  and error mapping belong in interceptors (gRPC's middleware), not copy-pasted
  into each RPC method.
- **Confusing streaming with pub/sub.** A streaming RPC is still one client to
  one server on one connection. For fan-out/decoupled broadcast you want a
  message bus (track 06), not a bidi stream.
- **Blocking the thread pool with long streams.** Long-lived streaming calls each
  hold a worker in the `ThreadPoolExecutor`; size the pool for your concurrent-
  stream count or use the async API, or new calls starve.

## Checkpoint quiz

Write down your answer to each question before expanding it — checking without attempting first is the single easiest way to fool yourself into thinking you've learned this.

1. Name the four RPC types and give a one-line real use case for each of the
   three streaming kinds.
2. On the server, how do you produce a server-streaming response, and how do you
   consume it on the client?
3. What is a gRPC *deadline*, and how does it differ from an ordinary
   client-side timeout?
4. What problem do interceptors solve, and which track-02 concept are they the
   direct analog of?
5. Where does an auth token travel in a gRPC call, and where should it be
   validated?
6. Which status codes are safe to retry and which aren't? Give two of each and
   the one-sentence reason.
7. Why is retrying a `CreateOrder` dangerous, and what makes it safe?

<details>
<summary>Answers</summary>

1. **Unary** (one/one), **server streaming** (one request → many responses;
   e.g. a live price/log feed), **client streaming** (many requests → one
   response; e.g. chunked upload / batch ingest), **bidirectional** (both stream
   independently; e.g. chat / an interactive session).
2. Server side: the handler is a **generator** — you `yield` each message and it
   flushes to the client immediately. Client side: the call **returns an
   iterator**, and you `for resp in stub.WatchPrice(req)`; the loop ends when the
   server completes the stream.
3. A deadline is an absolute time budget for the call that gRPC **propagates**
   to the server (via `time_remaining()`) and onward to any downstream gRPC calls
   it makes, so the whole chain shares one budget and can cancel early. A plain
   client-side timeout only aborts locally and isn't communicated to the server.
4. Interceptors put cross-cutting concerns (auth, logging, metrics, tracing,
   error mapping) in one place wrapping every RPC, instead of in each handler.
   They're the direct analog of the **middleware chain** from track 02.
5. In **metadata** (gRPC's key/value headers, e.g. `authorization: Bearer ...`),
   attached per call on the client. It should be validated in a **server
   interceptor**, before the handler runs — so a rejected call never reaches
   business logic.
6. Retryable/transient: `UNAVAILABLE` (server temporarily down) and
   `DEADLINE_EXCEEDED`/`RESOURCE_EXHAUSTED` (may succeed with a fresh
   budget/after backoff). Not retryable/permanent: `INVALID_ARGUMENT`,
   `NOT_FOUND`, `PERMISSION_DENIED`, `ALREADY_EXISTS` — the request itself is
   wrong, so a retry changes nothing.
7. `CreateOrder` is non-idempotent: a retry after a lost response can create a
   *second* order. It's made safe with an **idempotency key** so a retried
   create is recognized and returns the original result instead of creating
   again (the same discipline as retrying tasks/webhooks in track 06).

</details>

## Next

[03-graphql-fundamentals](../03-graphql-fundamentals/README.md) — you've now got
the internal, RPC-style edge covered. Next you pivot to the other major
alternative: GraphQL, where the *client* declares exactly which fields and
relations it wants. You'll write a schema, resolvers in Python, and meet the
N+1 problem and DataLoader — plus the first closed-book **cumulative review**
covering modules 00–03.
