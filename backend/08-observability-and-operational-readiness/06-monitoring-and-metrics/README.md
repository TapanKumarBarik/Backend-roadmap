# Module 06: Monitoring and Metrics

## Why this matters

Logs (modules 04-05) are the detailed story of individual events — perfect for
answering "what exactly happened to request `3f9a`?" but terrible for answering
"is the system healthy *right now*?" To learn your error rate from logs you'd
have to count error lines over a window; to learn p99 latency you'd have to
extract and sort every `duration_ms`; and you'd have to do it continuously, over
millions of lines, which is expensive and slow. That's the wrong tool. The
question "how much, how many, how fast, right now" is what **metrics** answer,
and they're the second pillar of observability precisely because they're built
for exactly the aggregate, always-on, cheap-to-query view that logs are bad at.

A metric is a **numeric measurement sampled over time** — a time series. "Requests
per second," "in-flight connections," "request latency distribution," "memory
used," "queue depth." Where a log line costs bytes-per-event (and gets expensive
at high volume), a metric costs almost nothing regardless of traffic: it's just
a few numbers updated in memory and scraped periodically. That's what makes
metrics the backbone of **dashboards** (is the system healthy at a glance?) and
**alerts** (module 08 — page me when the error rate crosses a threshold). You
cannot build a sane alert on "grep the logs every 10 seconds"; you build it on a
metric.

This module teaches the metrics model that has become the industry standard:
**Prometheus**. You'll learn its four metric types (counter, gauge, histogram,
summary) and — crucially — *which* to use for *what*, because picking the wrong
type is the single most common metrics mistake. Then you'll instrument a real
FastAPI app with `prometheus-client`: expose a `/metrics` endpoint, count
requests, time latencies into a histogram, track in-flight requests with a
gauge, and reason about the **RED** method for what to measure on a service.
This is the direct input to module 07 (metrics as one of the three pillars) and
module 08 (every good alert is built on a metric).

## Concepts

### Metrics vs logs: aggregate numbers vs individual events

The clearest way to hold the distinction:

- A **log** is one *event*, recorded in full detail: timestamp, message, all the
  fields. Rich, high-cardinality, expensive at volume, great for *drilling into a
  specific occurrence*.
- A **metric** is one *number over time*, aggregated: a count, a current value, a
  distribution. Cheap, low-cardinality, constant cost regardless of traffic,
  great for *the overall shape and trend*.

They answer different questions and you need both:

| Question | Tool |
|---|---|
| "What's our request error rate over the last hour?" | metric |
| "Is p99 latency climbing this week?" | metric |
| "How many requests are in flight right now?" | metric |
| "Why did request `3f9a` for user 8123 fail?" | log (drill in) |
| "What was the exact exception and stack trace?" | log |

The workflow they enable together: a **metric** tells you *that* something is
wrong and *when* (error rate spiked at 14:03), a **log** tells you *why* (query
`request_id`/timeframe to read the actual failures). Metrics are the smoke
alarm; logs are the investigation. Module 07 adds traces as the third view.

Why metrics are cheap: a counter is a single integer in memory incremented on
each event; a histogram is a handful of bucket counters. No matter if you serve
100 or 100,000 requests a second, the *metric* is the same few numbers, scraped
every 15 seconds. Logs scale with events; metrics scale with *distinct series*,
which you keep bounded (see cardinality below). That's why you can afford metrics
on every request but must sample logs (module 05).

### The Prometheus model: pull, time series, and labels

**Prometheus** is the de-facto open-source metrics system, and its model is
worth understanding because most modern tooling copies it.

- **Pull-based scraping.** Your app *exposes* its current metric values at an
  HTTP endpoint (conventionally `/metrics`), in a simple text format. Prometheus
  **scrapes** (GETs) that endpoint every N seconds and stores the values as time
  series. Your app doesn't push anywhere — it just exposes a snapshot, and the
  server pulls. (This is why a scaled-down/dead instance simply stops being
  scraped, and why service discovery matters at scale.)
- **Time series.** Each metric is stored as a series of `(timestamp, value)`
  samples. Prometheus keeps the history so you can graph and compute rates over
  it.
- **Labels** turn one metric name into many series. A metric
  `http_requests_total` with labels `method` and `status` becomes separate
  series: `http_requests_total{method="GET", status="200"}`,
  `http_requests_total{method="POST", status="500"}`, etc. Labels are the
  dimensions you slice by ("error rate *by endpoint*"). This is powerful and
  dangerous — see cardinality below.
- **PromQL** is the query language you use in dashboards and alerts. The one
  expression you'll use constantly is `rate(...)` over a counter — because a raw
  counter only ever goes up, and what you actually want is its *per-second rate*:
  `rate(http_requests_total[5m])` is "requests per second, averaged over 5
  minutes." Alerts (module 08) are PromQL expressions with a threshold.

The exposition format is plain text, one series per line:

```
# HELP http_requests_total Total HTTP requests
# TYPE http_requests_total counter
http_requests_total{method="GET",path="/health",status="200"} 4821
http_requests_total{method="POST",path="/orders",status="201"} 312
http_requests_total{method="POST",path="/orders",status="500"} 4
```

### The four metric types — and choosing the right one

This is the section to internalize; the wrong type produces meaningless
dashboards. Prometheus has four types:

**Counter — a value that only ever goes up (or resets to 0 on restart).** Use
for *cumulative counts of events*: requests served, errors, bytes sent, tasks
completed. You never set a counter; you only `.inc()`. Because it's monotonic,
you *never graph its raw value* — you graph `rate()` of it (events per second).
Examples: `http_requests_total`, `orders_created_total`, `errors_total`. (The
`_total` suffix is the convention.)

**Gauge — a value that goes up and down.** Use for a *current measurement* that
can rise or fall: in-flight requests, queue depth, memory usage, active DB
connections, temperature, cache size. You `.inc()`, `.dec()`, or `.set()` it,
and you graph its raw value directly. Examples: `http_requests_in_flight`,
`queue_depth`, `db_connections_active`.

**Histogram — the distribution of a measured value, via buckets.** Use for
*things you measure and want percentiles of*, above all **latency** and
**request/response sizes**. A histogram counts observations into configurable
**buckets** (e.g. "≤ 0.1s", "≤ 0.5s", "≤ 1s", "≤ 2.5s", …) plus a total sum and
count. From those buckets, Prometheus computes **quantiles** with
`histogram_quantile()`: p50, p95, p99 latency. This is *the* tool for latency,
because an *average* latency hides the tail — the 1% of slow requests that ruin
user experience live in p99, and only a histogram exposes them. Example:
`http_request_duration_seconds`.

**Summary — like a histogram, but quantiles are computed client-side.** It also
tracks a distribution but calculates configured quantiles *in the process* and
exposes them directly. The critical trade-off: summary quantiles **cannot be
aggregated across instances** (you can't average two instances' p99s to get the
fleet p99 — that's mathematically wrong), whereas histogram buckets *can* be
summed across instances and then quantiled. **Default to histograms** for
anything you'll aggregate across replicas (almost always). Reach for a summary
only when you need a precise quantile from a single instance and can't pre-choose
buckets.

The decision, in one table:

| You want to measure… | Type |
|---|---|
| How many times X happened (cumulative) | **Counter** (`.inc()`, graph `rate()`) |
| A current level that goes up and down | **Gauge** (`.set()`/`.inc()`/`.dec()`) |
| The distribution / percentiles of a value (esp. latency) | **Histogram** |
| Precise single-instance quantiles, no cross-instance aggregation | **Summary** (rarely) |

The two most common mistakes: using a **gauge for a count** (you lose the ability
to compute rates correctly, and a `.set()` race loses increments), and using an
**average instead of a histogram for latency** (the average is a lie that hides
the tail — always want percentiles).

### What to measure: the RED and USE methods

Instrumenting everything is as useless as logging everything. Two well-known
frameworks tell you *what* matters:

**RED — for request-driven services** (your FastAPI app). For every endpoint/
service, measure:

- **R**ate — requests per second (a **counter** → `rate()`).
- **E**rrors — failed requests per second, or error *ratio* (a **counter** with a
  `status`/`outcome` label).
- **D**uration — the latency distribution (a **histogram**).

Rate, Errors, Duration is the minimum viable instrumentation for any web service
and maps directly onto the "golden signals" of SLO-based alerting (module 08).
If you measure nothing else, measure RED.

```
                    ┌──────── one FastAPI service ────────┐
                    │                                     │
   RATE     ──lens─▶│ how many requests/sec?   Counter    │──▶ rate(...)
   ERRORS   ──lens─▶│ what fraction failing?   Counter    │──▶ {status=~"5.."}
   DURATION ──lens─▶│ how slow (p50/p95/p99)?  Histogram  │──▶ histogram_quantile()
                    │                                     │
                    └─────────────────────────────────────┘
   three views of the SAME traffic — the user-facing health of the service
```

**USE — for resources** (CPU, memory, disk, connection pools, queues):

- **U**tilization — how busy (% CPU, pool-in-use / pool-size).
- **S**aturation — how much extra work is queued/waiting (queue depth, run
  queue).
- **E**rrors — resource error counts.

USE is for the infrastructure and finite resources your service depends on
(module 09's connection pools, module 06's own process memory). Together: RED
tells you how your *service* is doing from the user's side; USE tells you whether
its *resources* are the reason.

The "**four golden signals**" (from Google's SRE book) are essentially RED plus
**saturation** — latency, traffic, errors, saturation — and they're what a
health dashboard and the alerts in module 08 are built on.

### Cardinality: the one way metrics blow up

Metrics are cheap *because* the number of distinct time series stays bounded.
Each unique combination of metric name + label values is **one series**, and each
series costs memory and storage in Prometheus. **Cardinality** is the total count
of series, and it's the thing that kills metrics systems.

The rule: **labels must be low-cardinality — a small, bounded set of values.**
Good labels: `method` (a handful), `status` (a few dozen), `endpoint`
*template* (`/orders/{id}`, bounded by your route count). Catastrophic labels:
`user_id` (millions of series), `request_id` (unbounded — a new series *per
request*, which will OOM your Prometheus), raw `path` with ids in it
(`/orders/8123`, `/orders/8124`, … unbounded), email, full URL with query
strings.

```
   http_requests_total{...}

   GOOD (bounded)                         CATASTROPHIC (unbounded)
   method:  GET POST ...     ~5           user_id:     millions of values
   status:  200 404 500 ...  ~30          request_id:  NEW series every request
   route:   /orders/{id} ... ~50          path:        /orders/8123, /8124, ...
   ───────────────────────────            ────────────────────────────────────
   ~5 × 30 × 50 = 7,500 series            → series count → ∞ → Prometheus OOM
```

The mental split, and it's the same one from module 05's logs: **high-cardinality
identifying data belongs in *logs* (as fields) and *traces* (module 07); low-
cardinality dimensions belong in *metrics* (as labels).** If you catch yourself
wanting `user_id` as a metric label, you actually want to query *logs* filtered
by `user_id`, or a trace. Use the route *template* (`/orders/{id}`), never the
filled-in path, as the endpoint label — FastAPI's `request.scope["route"]` gives
you the template.

## Command reference

| `prometheus-client` API | Type | Purpose |
|---|---|---|
| `Counter(name, doc, labelnames)` | counter | Cumulative event count; `.inc()` only |
| `Gauge(name, doc, labelnames)` | gauge | Up/down current value; `.inc()/.dec()/.set()` |
| `Histogram(name, doc, labelnames, buckets=…)` | histogram | Distribution → percentiles (latency!) |
| `Summary(name, doc)` | summary | Client-side quantiles (rarely) |
| `.labels(method="GET", …)` | — | Select the series for these label values |
| `.inc(n=1)` / `.dec()` / `.set(v)` | — | Update a counter/gauge |
| `.observe(v)` | histogram/summary | Record one observation (e.g. a duration) |
| `.time()` / context manager | histogram/summary | Time a block and observe its duration |
| `generate_latest()` | — | Render all metrics in exposition format |
| `make_asgi_app()` | — | A ready ASGI app to mount at `/metrics` |

**A hand-instrumented FastAPI app with RED metrics:**

```python
import time
from fastapi import FastAPI, Request
from prometheus_client import Counter, Gauge, Histogram, make_asgi_app

app = FastAPI()

# Rate + Errors: one counter, sliced by method / endpoint template / status
REQUESTS = Counter(
    "http_requests_total", "Total HTTP requests",
    ["method", "endpoint", "status"],
)
# Duration: a histogram with latency-appropriate buckets (seconds)
LATENCY = Histogram(
    "http_request_duration_seconds", "Request latency",
    ["method", "endpoint"],
    buckets=(0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10),
)
# A gauge for in-flight requests (Saturation)
IN_FLIGHT = Gauge("http_requests_in_flight", "Requests currently being served")

@app.middleware("http")
async def metrics_mw(request: Request, call_next):
    # endpoint TEMPLATE, not the filled path — keeps cardinality bounded
    endpoint = request.scope.get("route").path if request.scope.get("route") else "unknown"
    IN_FLIGHT.inc()
    start = time.perf_counter()
    try:
        response = await call_next(request)
        status = response.status_code
        return response
    finally:
        elapsed = time.perf_counter() - start
        IN_FLIGHT.dec()
        REQUESTS.labels(request.method, endpoint, status).inc()
        LATENCY.labels(request.method, endpoint).observe(elapsed)

# expose the scrape endpoint
app.mount("/metrics", make_asgi_app())
```

**Timing a block with the histogram context manager (business metric):**

```python
ORDER_TOTAL = Histogram("order_amount_dollars", "Order amounts",
                        buckets=(5, 10, 25, 50, 100, 250, 500))
ORDERS = Counter("orders_created_total", "Orders created", ["tier"])

@app.post("/orders")
async def create_order(order: Order):
    with LATENCY.labels("POST", "/orders").time():   # times this block
        result = await save(order)
    ORDERS.labels(order.tier).inc()
    ORDER_TOTAL.observe(order.amount)
    return result
```

**Prefer the maintained middleware in real projects.** `prometheus-fastapi-
instrumentator` gives you RED metrics with correct route-template labels in two
lines — instrument by hand once (above) to understand it, then use the library:

```python
from prometheus_fastapi_instrumentator import Instrumentator
Instrumentator().instrument(app).expose(app)   # adds /metrics with RED metrics
```

**Never put unbounded values in labels.** `.labels(user_id=...)`,
`.labels(request_id=...)`, or a raw path with ids will explode Prometheus'
memory. Labels are bounded dimensions; identifiers go in logs/traces.

## Hands-on exercises

Start a `metrics/` project alongside your logging one:

```bash
python -m venv .venv && source .venv/bin/activate
pip install "fastapi[standard]" prometheus-client prometheus-fastapi-instrumentator
```

### 1. Expose your first metric

Create a counter, increment it in a route, and mount `/metrics`:

```python
from prometheus_client import Counter, make_asgi_app
hits = Counter("hello_hits_total", "Hits to /hello")

@app.get("/hello")
async def hello():
    hits.inc()
    return {"hi": True}
app.mount("/metrics", make_asgi_app())
```

Hit `/hello` a few times, then GET `/metrics`. Expected: you see
`hello_hits_total 3.0` (or however many hits) in the text exposition format,
plus the `# HELP`/`# TYPE` lines. You've exposed a scrapeable metric.

### 2. Counter vs gauge — feel the difference

Add a gauge for in-flight requests and a slow route:

```python
import asyncio
from prometheus_client import Gauge
in_flight = Gauge("in_flight", "requests being served")

@app.get("/slow")
async def slow():
    in_flight.inc()
    try:
        await asyncio.sleep(3)
        return {"done": True}
    finally:
        in_flight.dec()
```

Fire several concurrent requests to `/slow` and GET `/metrics` mid-flight.
Expected: `in_flight` shows the number of *currently running* requests (goes up
and back to 0), while a counter would only ever climb. This is the gauge vs
counter distinction made tangible: a gauge is a *level*, a counter is a *total*.

### 3. A histogram and its percentiles

Add the RED middleware from the command reference. Generate mixed-latency
traffic (add a route that sleeps a random 0-1s). Then GET `/metrics` and find
`http_request_duration_seconds_bucket{...le="..."}` lines.

Expected: you see cumulative bucket counts (`le="0.1"`, `le="0.5"`, `le="1"`,
…), plus `_sum` and `_count`. Note you get the *distribution*, not one number —
this is what lets Prometheus compute p50/p95/p99 later. Compute p95 by hand from
the buckets to convince yourself it's derivable.

### 4. Wire up Prometheus and query with PromQL

Run Prometheus in Docker scraping your app:

```yaml
# prometheus.yml
scrape_configs:
  - job_name: app
    scrape_interval: 5s
    static_configs:
      - targets: ["host.docker.internal:8000"]
```

Generate traffic, open Prometheus (:9090), and run:

- `rate(http_requests_total[1m])` — requests/second (why `rate`, not the raw
  counter?).
- `histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m]))` —
  p95 latency.
- `sum by (status) (rate(http_requests_total[1m]))` — request rate by status.

Expected: graphs of rate and p95 latency. Note that graphing the raw
`http_requests_total` gives an ever-climbing line (useless); `rate()` gives the
meaningful per-second view.

### 5. Compute an error rate (the RED "E")

With the `status` label present, write the PromQL for **error ratio**:

```promql
sum(rate(http_requests_total{status=~"5.."}[5m]))
/
sum(rate(http_requests_total[5m]))
```

Generate some traffic with a route that returns `500` sometimes. Expected: a
ratio between 0 and 1 — the fraction of requests failing. This exact expression
is what an SLO-based alert (module 08) fires on. You just built the "E" of RED as
a query.

### 6. Add a business metric

Add `orders_created_total{tier=...}` (counter) and `order_amount_dollars`
(histogram) to an `/orders` route. Create some orders across tiers with varying
amounts. Query `sum by (tier) (rate(orders_created_total[5m]))` and
`histogram_quantile(0.5, rate(order_amount_dollars_bucket[5m]))`.

Expected: orders/sec by tier and median order value. This shows metrics aren't
just infra — business KPIs are metrics too, and the same tools graph them.

### 7. Swap hand-rolled for the instrumentator library

Delete your hand-written RED middleware and replace it with
`Instrumentator().instrument(app).expose(app)`. Compare `/metrics` before and
after.

Expected: you get equivalent (richer) RED metrics with correct route-template
labels for free. The point: instrument by hand *once* to understand it, then
lean on the maintained library so you get edge cases (route templates, exception
handling) right.

### 8. Diagnose and fix: the metrics that took down Prometheus

A team added metrics and a week later Prometheus OOM-killed itself and
dashboards became unusably slow. Here's their instrumentation. Find every
problem.

```python
REQS = Gauge("requests", "requests")                              # (1)
LAT  = Gauge("latency_ms", "latency")                             # (2)
ERRS = Counter("errors", "errors", ["user_id", "request_id", "url"])  # (3)

@app.middleware("http")
async def mw(request, call_next):
    REQS.set(REQS._value.get() + 1)                               # (4)
    start = time.time()
    resp = await call_next(request)
    LAT.set((time.time() - start) * 1000)                         # (2)
    if resp.status_code >= 500:
        ERRS.labels(request.headers.get("x-user"),
                    str(uuid.uuid4()),
                    str(request.url)).inc()                        # (3)
    return resp
```

<details>
<summary>Solution</summary>

**(1)+(4) — a gauge used as a request counter, with a racy manual increment.**
Total requests served is a *cumulative count* → it must be a **Counter** you
`.inc()`. Using a gauge and `set(get()+1)` loses increments under concurrency (a
classic read-modify-write race) and makes `rate()` meaningless. Fix:
`Counter("http_requests_total", ...)` and `.inc()`.

**(2) — a gauge for latency, so you only ever see the *last* request's latency
and can't get percentiles.** Latency is a distribution → **Histogram** with
`.observe(seconds)`. The gauge throws away every value but the most recent; you
can never compute p95/p99 (and the tail is the whole point). Fix: a `Histogram`
with sane buckets.

**(3) — catastrophic label cardinality.** `user_id`, `request_id` (a brand-new
UUID *every* error!), and full `url` (with ids/query strings) as labels create an
unbounded number of time series — `request_id` alone means one new series per
error, which is exactly what OOM-killed Prometheus and slowed every query. Fix:
drop `user_id`/`request_id`/raw-`url` from labels entirely; use low-cardinality
labels like `status` and the route *template*. The identifying data belongs in
**logs/traces**, queried by `request_id` there — not in metric labels.

**Bonus — units and naming.** `latency_ms` mixes units into the name; the
convention is base units (`_seconds`) and a `_total` suffix on counters. Use
`http_request_duration_seconds` and `http_requests_total`.

Root causes: **wrong metric types** (gauge-as-counter, gauge-as-latency) and
**unbounded label cardinality**. These are *the* two metrics mistakes; get the
type right and keep labels low-cardinality and metrics stay cheap and correct.

</details>

## Independent challenge

No code given. Take the FastAPI service you've been logging (**module 04/05**)
and give it a complete, correct metrics layer. Implement the full **RED** set
for every endpoint (rate + errors as a counter sliced by method/route-template/
status; duration as a histogram with latency-appropriate buckets), plus a
**gauge** for in-flight requests and at least one **business metric** (e.g.
orders created by tier). Expose `/metrics`, scrape it with a local Prometheus,
and build three PromQL expressions on a dashboard: request rate, error *ratio*,
and p95 latency — all *by endpoint*. Then deliberately introduce a
high-cardinality label (e.g. `user_id`), watch the series count explode in
Prometheus (`count({__name__=~"http_.*"})`), and remove it — proving to yourself
why identifiers go in logs, not labels. Finally, reach back to **module 05**:
ensure the *same* request that increments a metric also emits a correlated log
line, so a spike on the metric dashboard can be pivoted to the exact failing
requests by `request_id` — the metric says *when*, the log says *why*.

<details>
<summary>Hint</summary>

The route *template* is the key to bounded cardinality: read it from
`request.scope["route"].path` (`/orders/{id}`), never `request.url.path`
(`/orders/8123`). For error *ratio* rather than error count, the PromQL is
`sum(rate(http_requests_total{status=~"5.."}[5m])) /
sum(rate(http_requests_total[5m]))`. For the metric→log pivot, your metrics
middleware and your logging middleware (module 05) both run per request and both
see the same bound `request_id` — so when the error-rate graph spikes at 14:03,
you switch to your log store, filter to that window and `status=500`, and read
the `request_id`s and tracebacks. That "dashboard shows *when*, logs show *why*"
loop is the whole point of running both pillars; module 07 formalizes it with
the third.

</details>

## Common mistakes & troubleshooting

- **Gauge for a count.** A cumulative total must be a **Counter** (`.inc()`),
  graphed with `rate()`. A gauge loses increments under concurrency and can't
  produce a meaningful rate.
- **Average latency instead of a histogram.** The mean hides the tail — the slow
  p99 that actually hurts users. Use a **Histogram** and `histogram_quantile()`.
- **High-cardinality labels** (`user_id`, `request_id`, raw path with ids,
  email, full URL). Each unique combination is a series; unbounded labels OOM
  Prometheus and slow every query. Labels are bounded dimensions; identifiers go
  in logs/traces.
- **Graphing a raw counter.** A counter only climbs; the raw line is
  meaningless. Always wrap it in `rate()`/`increase()`.
- **Filled-in path as the endpoint label** (`/orders/8123`). Unbounded. Use the
  route *template* (`/orders/{id}`).
- **Summary when you need cross-instance aggregation.** Summary quantiles can't
  be averaged across replicas. Default to **histograms** for anything fleet-wide.
- **Instrumenting everything / nothing.** Measure RED for services and USE for
  resources — not every function, not zero. Start with the golden signals.
- **Wrong units / naming.** Use base units (`_seconds`, not `_ms`) and the
  `_total` suffix on counters; it's a convention tools and humans rely on.

## Checkpoint quiz

Write down your answer to each question before expanding it — checking without attempting first is the single easiest way to fool yourself into thinking you've learned this.

1. Give a question metrics answer well that logs answer badly, and vice versa —
   and explain *why* each tool is suited to its question in cost terms.
2. Name the four Prometheus metric types and give the one-line rule for when to
   use each. Which one is right for request latency, and why not an average?
3. Why do you graph `rate(http_requests_total[5m])` rather than
   `http_requests_total` directly?
4. What does RED stand for, what metric type does each letter map to, and why is
   RED the minimum viable instrumentation for a web service?
5. What is cardinality, why does putting `user_id` or `request_id` in a metric
   label blow it up, and where does that identifying data belong instead?
6. You see a p99 latency spike on your dashboard at 14:03. Walk through how you'd
   use metrics *and* logs (module 05) together to find the root cause.

<details>
<summary>Answers</summary>

1. Metrics answer aggregate/trend questions well — "error rate over the last
   hour," "p99 latency this week," "requests in flight" — because a metric is a
   few numbers updated in memory at constant cost regardless of traffic. Logs
   answer specific-occurrence questions well — "why did request `3f9a` fail, what
   was the exception" — because a log carries full per-event detail; but that
   detail makes logs expensive to aggregate at volume, so they're the wrong tool
   for "what's the rate right now."
2. **Counter** — cumulative count of events, only goes up, `.inc()`, graph
   `rate()` (requests, errors). **Gauge** — a current level that goes up and
   down, `.set/.inc/.dec` (in-flight, queue depth, memory). **Histogram** —
   distribution/percentiles of a measured value via buckets (latency, sizes).
   **Summary** — client-side quantiles, rarely (can't aggregate across
   instances). Latency → **Histogram**, because an average hides the tail; you
   need p95/p99 to see the slow requests that hurt users, and only a
   distribution gives you percentiles.
3. A counter is monotonic — its raw value only ever climbs, so graphing it is a
   meaningless ever-rising line. `rate()` computes its per-second change over a
   window, which is the actually-useful "requests per second" view (and it
   correctly handles counter resets on restart).
4. **R**ate (requests/sec, **counter**), **E**rrors (failed requests/sec or
   ratio, **counter** with a status label), **D**uration (latency distribution,
   **histogram**). It's the minimum viable instrumentation because those three
   answer "how much traffic, how much is failing, how slow" — the user-facing
   health of a service — and they map straight onto the golden signals that
   alerts (module 08) fire on.
5. Cardinality is the number of distinct time series (metric name × each unique
   label-value combination); each series costs memory/storage. `user_id` (millions
   of values) or `request_id` (a new value *per request*) make the series count
   effectively unbounded, which OOMs Prometheus and slows queries. That
   high-cardinality identifying data belongs in **logs** (as fields) and
   **traces** (module 07), queried there; metric labels stay low-cardinality
   (method, status, route template).
6. The metric tells you *when* and *that*: the p99 histogram spiked at 14:03, and
   you can slice by endpoint label to see *which* endpoint. Then you pivot to
   **logs** (module 05): filter the log store to that endpoint and the 14:03
   window with `status>=500`, read the `request_id`s and `log.exception`
   tracebacks to learn *why*. Metrics are the smoke alarm and point at the
   region; logs are the investigation that finds the fire — and they line up
   because the same request incremented the metric and emitted the correlated
   log.

</details>

## Further reading & sources

- [Prometheus — Metric types](https://prometheus.io/docs/concepts/metric_types/) - the authoritative description of counter, gauge, histogram, and summary and when to use each.
- [Prometheus — Querying basics (PromQL)](https://prometheus.io/docs/prometheus/latest/querying/basics/) - the query language behind `rate()`, `histogram_quantile()`, and the alert expressions of module 08.
- [prometheus-client (Python) documentation](https://prometheus.github.io/client_python/) - the library used to instrument the FastAPI app and expose `/metrics`.
- [Google SRE Book — Monitoring Distributed Systems (Golden Signals)](https://sre.google/sre-book/monitoring-distributed-systems/) - the four golden signals that RED extends and that health dashboards are built on.
- [The RED Method — Grafana/Weaveworks](https://grafana.com/blog/2018/08/02/the-red-method-how-to-instrument-your-services/) - the request-centric Rate/Errors/Duration framing applied in this module.
- [Prometheus — Naming and labels best practices](https://prometheus.io/docs/practices/naming/) - conventions for base units, the `_total` suffix, and keeping label cardinality bounded.

## Next

[07-the-three-pillars-of-observability](../07-the-three-pillars-of-observability/README.md)
— you now have two of the three pillars: logs (what happened, in detail) and
metrics (how much/how fast, in aggregate). The next module adds the third —
**traces** — which follow one request across every service and show *where* the
time went, then ties all three together: how logs, metrics, and traces
complement each other, and the OpenTelemetry standard that unifies them behind
one correlation id.
