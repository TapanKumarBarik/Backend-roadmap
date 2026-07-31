# Module 05: Performance and Benchmarking

## Why this matters

"gRPC is faster than REST" is the most repeated and least examined claim in
this whole area. It is sometimes true, sometimes irrelevant, and occasionally
backwards — and which one applies to *your* service is an empirical question
you can answer in an afternoon. Teams migrate to gRPC expecting a large win,
measure nothing, and end up with a harder-to-debug system that's the same
speed, because the bottleneck was always the database.

This module is about measuring honestly: where gRPC's advantages actually
come from, how to benchmark without fooling yourself, and how to read the
result. The skill being built is scepticism backed by numbers.

## Concepts

### Where gRPC's advantage actually comes from

Four distinct mechanisms, which matter in very different amounts:

1. **Binary serialization.** Protobuf encodes smaller and parses faster than
   JSON. Real, but the gap narrows with small payloads and fast JSON parsers.
   For a 200-byte message this is measured in microseconds.
2. **HTTP/2 multiplexing.** Many concurrent RPCs share one connection with no
   head-of-line blocking at the HTTP layer. This is the biggest win under
   concurrency, and it's invisible in a single-threaded benchmark.
3. **Persistent connections.** No TCP handshake, no TLS handshake per call.
   Enormous relative to a naive HTTP client that opens a connection per
   request — and roughly zero against a REST client using connection pooling
   and keep-alive, which any competent one does.
4. **Header compression (HPACK).** Repeated metadata is sent once and
   referenced thereafter. Matters when headers are large relative to payload.

Notice how much of this is about *connection reuse and concurrency*, not
serialization. That's the single most useful thing to understand here: most
"gRPC vs REST" benchmarks that show a 10× win are actually measuring
connection setup, and comparing gRPC against a deliberately handicapped HTTP
client.

### Where gRPC is not faster

- **Single, infrequent, large-payload calls.** Serialization is a rounding
  error next to transfer time.
- **When the bottleneck is downstream.** If the handler spends 40 ms in
  Postgres, the 0.3 ms you saved on encoding is noise. Measure before
  migrating.
- **Through a proxy that re-encodes.** A JSON transcoding gateway (module 04)
  gives back the serialization win entirely, and adds a hop.
- **In Python, under CPU-bound load.** `grpcio`'s core is C, but your handler
  is Python; the GIL and the thread pool usually dominate.

### Benchmark methodology that isn't self-deception

The rules, in order of how often they're violated:

1. **Warm up.** Discard the first several seconds. JIT, connection
   establishment, lazy imports and cache population all distort early
   samples.
2. **Report percentiles, not the mean.** The mean hides the tail, and the
   tail is what users experience. p50/p95/p99 minimum.
3. **Hold the comparison fair.** If you benchmark gRPC with a persistent
   channel, benchmark REST with a pooled session
   (`requests.Session`/`httpx.Client`), not a fresh connection per call.
4. **Isolate the variable.** Same machine, same payload, same handler logic,
   same concurrency. If the REST handler touches a database and the gRPC one
   returns a constant, you've measured nothing.
5. **Separate client cost from server cost.** A Python load generator often
   saturates before the server does — you then measure your benchmark tool.
   Watch client CPU.
6. **Run long enough.** Short runs miss GC pauses, connection recycling
   (module 02's `max_connection_age_ms`) and periodic effects.
7. **Measure the closed-loop trap.** With fixed concurrency, a slow server
   throttles the offered load, so latency looks stable while throughput
   collapses. Report both, always.

### `ghz`: the load generator for gRPC

```bash
ghz --insecure \
    --proto ./proto/shop/v1/order.proto \
    --import-paths ./proto \
    --call shop.v1.OrderService/GetOrder \
    -d '{"id":"A-1"}' \
    -c 50 -n 20000 \
    --connections 5 \
    localhost:50051
```

Key flags:

- `-c` concurrency (in-flight RPCs), `-n` total requests
- `--connections` number of TCP connections — **this is the one people
  miss.** Default is 1; with `-c 50` you're multiplexing 50 concurrent RPCs
  over a single connection, which is a legitimate scenario but not the same
  as 5 clients.
- `-z 30s` run for a duration instead of a count
- `--rps` fixed rate (open-loop), essential for honest latency measurement
- `-O html -o report.html` for a shareable report

If your service uses reflection (module 02), you can drop `--proto` entirely.

### Reading the output

```
Summary:
  Count:        20000
  Total:        4.31 s
  Slowest:      48.11 ms
  Fastest:      0.71 ms
  Average:      10.62 ms
  Requests/sec: 4640.37

Latency distribution:
  10 % in 3.21 ms
  50 % in 8.90 ms
  95 % in 24.67 ms
  99 % in 39.02 ms

Status code distribution:
  [OK]   20000 responses
```

Read it in this order:

1. **Status distribution first.** A fast benchmark full of `Unavailable` is
   measuring your error path. This is the most common way to report a
   fantastic number that means nothing.
2. **p99 vs p50.** A p99 five times p50 means queueing or contention — with
   `-c 50` against a Python thread pool of 10, that's the pool, not the
   network.
3. **Requests/sec against concurrency.** Little's Law: `concurrency ≈
   throughput × latency`. With `-c 50` and 8.9 ms average you'd expect
   ~5600 rps; getting 4640 means real concurrency is lower than requested.

### Server-side tuning that actually moves numbers

```python
server = grpc.server(
    futures.ThreadPoolExecutor(max_workers=32),        # match handler blocking profile
    options=[
        ("grpc.max_concurrent_streams", 1000),
        ("grpc.so_reuseport", 1),                      # multiple processes, one port
    ],
)
```

For CPU-bound Python handlers the honest answer is **run multiple
processes**. `grpc.so_reuseport` lets several server processes bind the same
port and have the kernel distribute connections — the gRPC equivalent of
running several `uvicorn` workers.

For I/O-bound handlers, consider `grpc.aio` (asyncio) instead of the thread
pool: it removes the "one thread per in-flight RPC" ceiling entirely.

Compression is a lever worth knowing but not a default:

```python
server = grpc.server(..., compression=grpc.Compression.Gzip)
stub.GetOrder(req, compression=grpc.Compression.Gzip)
```

It trades CPU for bytes. A win on large, repetitive payloads over a slow
link; a loss on small messages on a fast network, where you pay compression
cost to save nothing.

### The comparison to actually run

Before migrating anything, measure three configurations, not two:

| Config | What it isolates |
|---|---|
| REST, new connection per request | The strawman most blog posts benchmark |
| REST, pooled keep-alive connections | The honest REST baseline |
| gRPC, persistent channel | The gRPC number |

The gap between rows 1 and 2 is connection overhead. The gap between 2 and 3
is gRPC's genuine protocol advantage. If someone quotes you a speedup, ask
which gap they measured.

## Command reference

| Concern | Command |
|---|---|
| Install ghz | `go install github.com/bojand/ghz/cmd/ghz@latest` or `brew install ghz` |
| Fixed request count | `ghz -c 50 -n 20000 ...` |
| Fixed duration | `ghz -c 50 -z 30s ...` |
| Open-loop, fixed rate | `ghz --rps 2000 -z 30s ...` |
| Multiple connections | `ghz --connections 5 ...` |
| Use reflection (no proto) | omit `--proto`/`--import-paths` |
| HTML report | `ghz -O html -o report.html ...` |
| mTLS | `ghz --cacert ca.crt --cert client.crt --key client.key ...` |
| REST baseline | `hey -c 50 -n 20000 http://localhost:8000/v1/orders/A-1` |
| Message size on the wire | `len(msg.SerializeToString())` vs `len(json.dumps(d))` |
| Python profile a handler | `python -m cProfile -s cumtime server.py` |
| Multi-process serving | `("grpc.so_reuseport", 1)` + N processes |

## Hands-on exercises

```bash
pip install grpcio grpcio-tools fastapi uvicorn httpx
# ghz + hey installed separately
```

### 1. Measure serialization in isolation

```python
import json, timeit
from shop.v1 import order_pb2

o = order_pb2.Order(id="A-1", quantity=3, total_cents=1999)
d = {"id": "A-1", "quantity": 3, "total_cents": 1999}

print("proto bytes:", len(o.SerializeToString()))
print("json  bytes:", len(json.dumps(d).encode()))
print("proto ser:", timeit.timeit(lambda: o.SerializeToString(), number=200_000))
print("json  ser:", timeit.timeit(lambda: json.dumps(d).encode(), number=200_000))
```

Record both size and time. Then repeat with a message containing a 200-item
repeated field.

Expected: protobuf is meaningfully smaller, and the *ratio* grows with
payload size. Note the absolute numbers — for the small message, both are
microseconds, which is the point.

### 2. Establish the three-way baseline

Build a REST endpoint and a gRPC method that return **identical data with
identical logic** (a dict lookup, no I/O). Benchmark all three configs from
the table above at `-c 50`.

Expected: the unpooled REST config is dramatically slower; pooled REST is far
closer to gRPC than most claims suggest. Write down both gaps separately.

### 3. Make the bottleneck the database and re-measure

Add a 20 ms `time.sleep` to both handlers (standing in for a query) and
re-run.

Expected: the two converge to near-identical throughput and latency. This is
the single most useful result in the module — it's the situation most real
services are in, and it's why "we'll switch to gRPC for speed" is usually the
wrong reason to switch.

### 4. Find your thread pool ceiling

With a 20 ms sleeping handler and `max_workers=10`, run `ghz -c 10`, `-c 50`,
`-c 200`.

Expected: throughput plateaus near `workers / latency` ≈ 500 rps regardless
of offered concurrency, while p99 climbs steeply. Raise `max_workers` to 100
and re-run `-c 200`.

Expected: throughput rises roughly proportionally. You've just located the
real limit — and it was your configuration, not the protocol.

### 5. Prove `--connections` changes the answer

Run `ghz -c 100 --connections 1` and `ghz -c 100 --connections 10` against
the same server.

Expected: results differ, often substantially. Explain which one models your
actual production client topology — and note this is the same multiplexing
property that broke L4 load balancing in module 02, now visible as a
performance characteristic.

### 6. Compare closed-loop and open-loop

Run `ghz -c 50 -z 20s` (closed-loop) and `ghz --rps 3000 -z 20s`
(open-loop) against a server you've deliberately slowed.

Expected: the closed-loop run reports comfortable latency because it
self-throttles; the open-loop run reveals the queue building and latency
exploding. Write one sentence on which one models real user traffic.

### 7. Test whether compression helps you

Benchmark with and without gzip for (a) a 200-byte message and (b) a 500 KB
message with repetitive content.

Expected: a loss on the small message, a clear win on the large one. Record
the crossover — that's your policy, and it's service-specific.

### 8. Diagnose and fix: the benchmark that proved too much

A team reports gRPC is "14× faster than our REST API" and proposes migrating
27 services. Their benchmark:

```python
# REST
for _ in range(1000):
    r = requests.get("http://localhost:8000/v1/orders/A-1")   # new connection each time

# gRPC
channel = grpc.insecure_channel("localhost:50051")            # created once
stub = shop_pb2_grpc.OrderServiceStub(channel)
for _ in range(1000):
    stub.GetOrder(shop_pb2.GetOrderRequest(id="A-1"))
```

Both loops are timed with `time.time()` around them. The REST handler queries
Postgres; the gRPC handler returns a hardcoded response.

<details>
<summary>Solution</summary>

Four independent flaws, any one of which invalidates the result:

1. **Unfair connection handling.** `requests.get` opens a new TCP (and
   possibly TLS) connection per call, while the gRPC channel is created once
   and reused. This alone accounts for most of the 14×. The fair comparison
   uses `requests.Session()` or `httpx.Client()`.
2. **Different workloads.** The REST handler hits Postgres; the gRPC handler
   returns a constant. They are not measuring the same thing at all — this
   is comparing a database query to a dictionary lookup.
3. **No warm-up.** The first calls include connection setup, lazy imports and
   cold caches, and with only 1000 iterations that skews the total materially.
4. **Mean only, no percentiles, no concurrency.** A sequential loop measures
   round-trip latency at concurrency 1, which is precisely the scenario where
   gRPC's main advantage — multiplexing — doesn't apply. Nothing here
   predicts behavior under production load.

The fix is exercise 2's three-way baseline with identical handler logic,
warm-up discarded, percentiles reported, and a real load generator at
realistic concurrency. The likely honest outcome: a modest win, mostly under
concurrency, and near-zero for any handler that touches a database — which
is a much weaker basis for migrating 27 services.

</details>

## Independent challenge

No solution given. Your team wants to migrate a REST service to gRPC, citing
performance. The service handles 1200 rps at p99 180 ms; each request makes
two database queries (~35 ms total) and one call to a third-party HTTP API
(~60 ms).

Build the case *against* migration on performance grounds using a
back-of-envelope latency budget: account for where the 180 ms goes and
estimate the maximum possible saving from switching protocols. Then identify
the non-performance reasons that might still justify gRPC for this service,
and design the smallest experiment that would settle the question — what
you'd build, what you'd measure, and what result would change your
recommendation either way.

<details>
<summary>Stuck? One hint</summary>

Start by subtracting the parts protocol choice cannot affect: ~95 ms is
downstream I/O that is identical either way, so at most ~85 ms is in your
control, and most of *that* is application code and queueing rather than
serialization. Serialization of a typical payload is sub-millisecond — so
the theoretical ceiling on the win is a small percentage of p99, not a
multiple. The genuinely good reasons to adopt gRPC here are contract
enforcement (module 00's schema evolution), generated clients, streaming, and
deadline propagation — none of which are performance. The smallest decisive
experiment is usually a single representative endpoint implemented both ways
against the *same* dependencies, benchmarked per exercise 2.

</details>

## Common mistakes & troubleshooting

- **Comparing a pooled gRPC channel against unpooled HTTP.** The most common
  benchmarking error; it measures connection setup, not protocol.
- **Different handler logic on each side.** If one queries a database and the
  other returns a constant, the result is meaningless.
- **Reporting the mean.** It hides the tail that users actually experience.
- **Ignoring the status distribution.** A benchmark full of errors is fast
  and worthless.
- **Benchmarking at concurrency 1.** That's the one regime where gRPC's
  multiplexing advantage is entirely absent.
- **Closed-loop only.** Fixed concurrency self-throttles and hides queue
  growth; use `--rps` to see real overload behavior.
- **Forgetting `--connections`.** Default 1 means all concurrency is
  multiplexed over one connection, which may not model your clients.
- **Saturating the load generator.** Check client CPU; a Python client often
  gives out before the server does.
- **Assuming compression is free.** It costs CPU and loses on small payloads.
- **Leaving `max_workers` at its default** and concluding the protocol is
  slow, when the thread pool was the ceiling.

## Checkpoint quiz

<details>
<summary>Show questions</summary>

1. Name the four sources of gRPC's performance advantage, and say which
   contributes most under high concurrency.
2. Why do many published "gRPC is 10× faster" benchmarks overstate the case?
3. Why should you benchmark three configurations rather than two, and what
   does each gap tell you?
4. What does a p99 that is 5× p50 usually indicate in a Python gRPC service?
5. What's the difference between closed-loop and open-loop load generation,
   and which reveals overload behavior?
6. What does `--connections` control in `ghz`, and why does it change the
   result?
7. When is enabling gzip compression a net loss?
8. Your handler sleeps 20 ms and `max_workers=10`. Roughly what throughput
   ceiling do you expect, and why?

</summary>
</details>

<details>
<summary>Show answers</summary>

1. Binary protobuf serialization, HTTP/2 multiplexing, persistent
   connections, and HPACK header compression. Multiplexing contributes most
   under high concurrency, because it lets many in-flight RPCs share one
   connection without head-of-line blocking — an effect entirely invisible at
   concurrency 1.
2. Because they typically compare a persistent gRPC channel against an HTTP
   client that opens a new connection per request, so most of the measured
   gap is TCP/TLS handshake cost rather than protocol efficiency. They also
   often use different handler logic, no warm-up, mean-only reporting, and
   sequential (concurrency-1) loops.
3. Three configurations — unpooled REST, pooled REST, and gRPC — separate two
   different effects. The gap between unpooled and pooled REST is pure
   connection-reuse overhead; the gap between pooled REST and gRPC is gRPC's
   genuine protocol advantage. With only two configurations you can't tell
   which one you measured.
4. Queueing rather than network latency — most often the thread pool: with
   more in-flight RPCs than `max_workers`, requests wait for a free thread,
   which inflates the tail while p50 stays reasonable.
5. Closed-loop holds concurrency fixed, so a slower server automatically
   receives less offered load and latency appears stable. Open-loop sends at
   a fixed rate regardless of server speed, so queues build and latency
   grows — which is what real user traffic does, and therefore what reveals
   overload behavior.
6. The number of TCP connections the load generator opens (default 1). It
   matters because gRPC multiplexes concurrent RPCs over each connection, so
   50 concurrent RPCs on 1 connection stresses different limits (stream
   concurrency, single-connection throughput) than on 10 connections — and
   only one of those models your actual client topology.
7. On small payloads over a fast network: you pay CPU to compress and
   decompress while saving a negligible number of bytes, so both latency and
   CPU get worse. It wins on large, repetitive payloads, especially over
   constrained links.
8. About 500 rps (`workers / latency` = 10 / 0.02 s). Each worker thread is
   occupied for the full 20 ms, so only 10 requests can be in flight at once
   regardless of how much concurrency is offered — additional load simply
   queues and inflates the tail.

</details>

## Further reading & sources

- [ghz documentation](https://ghz.sh/docs/options) - every flag used here, including `--rps`, `--connections`, and report formats.
- [gRPC performance best practices](https://grpc.io/docs/guides/performance/) - official guidance on channel reuse, streaming, and concurrency.
- [gRPC Python: asyncio API](https://grpc.github.io/grpc/python/grpc_asyncio.html) - the `grpc.aio` alternative to the thread-pool server.
- [Brendan Gregg: Benchmarking checklist](https://www.brendangregg.com/blog/2018-06-30/benchmarking-checklist.html) - the general methodology this module's rules follow.
- [Track 23: Performance and load testing](../../../learn/23-performance-and-load-testing/README.md) - broader load-testing practice, including open vs closed models.

## Next

[06-project-build-a-grpc-microservice-system](../06-project-build-a-grpc-microservice-system/README.md) —
everything from modules 00-05 assembled into one real, working multi-service
system, built step by step.
