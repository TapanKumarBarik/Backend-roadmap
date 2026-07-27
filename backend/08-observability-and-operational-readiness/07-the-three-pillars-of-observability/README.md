# Module 07: The Three Pillars of Observability

## Why this matters

You now have two of the three pillars: **logs** (module 04-05 — the detailed
story of individual events) and **metrics** (module 06 — cheap aggregate numbers
over time). Each answers a question the other can't. But there's a third question
neither answers well, and it's the one that dominates debugging in a
microservice or even a moderately layered app: *"a request was slow — **where**
did the time go?"* A metric tells you p99 latency is 3 seconds; a log tells you a
specific request failed. Neither shows you that the request spent 50ms in your
API, 2.9 seconds waiting on the billing service, and 30ms in the database —
which is the single fact that tells you where to look. That's what the third
pillar, **tracing**, gives you: the end-to-end, hop-by-hop timing of one request
as it flows across services.

This module is the *synthesis* module for the whole first half of the track. It
introduces **distributed tracing** and the concepts behind it (traces, spans,
context propagation), then — more importantly — shows how the three pillars
**complement** each other rather than compete. The mistake people make is
treating logs, metrics, and traces as three separate tools you pick between; the
insight is that they're three *views of the same events*, most powerful when
*correlated by a shared id* so you can pivot fluidly between them: a metric
dashboard shows you *when and that* something is wrong, a trace shows you *where*
in the request flow, and logs show you *why* at that exact point.

The unifying technology is **OpenTelemetry (OTel)** — the vendor-neutral standard
that produces all three signals with one instrumentation layer and one
correlation id (the `trace_id`), which is why "observability" today largely means
"OpenTelemetry plus a backend to store it." You've already built the manual
ancestor of tracing in module 05 (propagating a `request_id` across services); this
module shows how tracing formalizes and automates exactly that. Getting the
three-pillar mental model right is what turns "we have logs and dashboards" into
"we can actually debug production," and it's the foundation the alerting module
(08) builds on.

## Concepts

### Observability vs monitoring: known vs unknown unknowns

First, a distinction that frames the whole module. **Monitoring** is watching for
the failure modes you *anticipated*: you knew error rate mattered, so you built a
dashboard and an alert for it. It answers *known questions* — "is the thing I
predicted might break, breaking?" **Observability** is the property of being able
to answer questions you *didn't* anticipate — to ask *new* questions of your
running system, after the fact, without shipping new code. It's about **unknown
unknowns**: a novel failure you never predicted, where you need to slice and
explore the data to understand what's happening.

Monitoring is a subset of observability. A system is *observable* when its
outputs — logs, metrics, traces — are rich and correlated enough that you can
start from a symptom ("checkout is slow for some users since 2pm") and
*interrogate your way* to the cause, even though nobody built a "checkout slow
for some users" dashboard in advance. The three pillars exist to make a system
observable: each contributes a kind of evidence, and their correlation is what
lets you follow a novel problem across all three.

### The three pillars, and the question each owns

Each pillar answers a distinct question. Learn which owns which, because the
skill is knowing *which to reach for* and *how to move between them*.

- **Logs — "what exactly happened?"** Discrete, timestamped, high-detail events.
  The record of individual occurrences with full context: the exact input, the
  exact error, the exact decision. High cardinality, expensive at volume, the
  place you land to read the actual failure. (Modules 04-05.)
- **Metrics — "how much / how many / how fast, over time?"** Aggregated numeric
  time series. Cheap, always-on, the basis of dashboards and alerts. They tell
  you *that* something is wrong and *when*, at a glance, across all traffic.
  (Module 06.)
- **Traces — "where did the time go, across the whole request?"** The end-to-end
  path of *one* request through every service and operation it touched, with
  timing for each step. They tell you *where* in a distributed flow the latency
  or error occurred — which service, which call, which DB query.

The canonical debugging loop uses all three in order:

1. A **metric** alert fires: "p99 latency > 2s" or "error rate > 1%." You know
   *that* something's wrong and *when*. (This is the smoke alarm — module 08.)
2. You open a **trace** of a slow/failed request from that window: it shows the
   request spent 2.8s in the `billing` service's `charge` call. You know *where*.
3. You read the **logs** for that service, filtered to that request's id, at that
   moment: they show a connection-pool timeout to the payment provider. You know
   *why*.

Metrics → traces → logs: *that/when* → *where* → *why*. No single pillar gets you
there; the *correlation between them* does.

### Traces and spans: the anatomy of a request's journey

A **trace** represents the entire journey of one request through your system. It's
made of **spans**, and understanding this structure is the core of the module.

- A **span** is a single named, timed operation: "handle GET /checkout," "query
  orders table," "POST to billing," "charge card." Each span records a **start
  time and duration**, a name, a status (ok/error), and **attributes**
  (key/value metadata — `http.method`, `db.statement`, `user_id`).
- Spans form a **tree**. The first span (the incoming request at the edge) is the
  **root span**; operations it triggers are **child spans**; their sub-operations
  are children of those. A **parent span's duration encloses its children's** —
  so the tree visually shows *nesting* and *sequence*.
- Every span in one request shares a single **`trace_id`**; each span also has its
  own **`span_id`** and a **`parent_span_id`** linking it to its parent. That's
  what stitches the tree together and, across services, keeps it one trace.

Visualized, a trace is a **waterfall** — horizontal bars, time on the x-axis,
nesting shown by indentation:

```
trace_id=abc  [ GET /checkout ...................................... 2900ms ]
                 [ validate 5ms ]
                 [ load cart (db) 30ms ]
                 [ POST billing/charge ....................... 2800ms ]   <- the culprit
                     [ billing: charge card ............... 2790ms ]
                 [ send confirmation (queue) 12ms ]
```

One glance at that waterfall and you know exactly where the 2.9 seconds went:
the billing charge. *That* is what a trace buys you and neither logs nor metrics
can: the **relative timing and structure** of one request's work. Without it,
you'd be guessing which of five services or fifteen calls was slow.

### Context propagation: how a trace crosses service boundaries

The hard part of *distributed* tracing is keeping it *one* trace when the request
crosses a process/network boundary. This is **context propagation**, and it's the
exact same mechanism as module 05's `request_id` propagation — now standardized.

When service A calls service B, A injects the current **trace context** into the
outgoing request's headers; B extracts it and continues the *same* trace as a
child span, instead of starting a new one. The standard header is **W3C Trace
Context** — the `traceparent` header, which encodes `trace_id`, the parent
`span_id`, and flags:

```
traceparent: 00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01
             ^ver ^-------- trace_id ---------- ^--- span_id --- ^flags
```

- **Inject** on the way out (in service A's HTTP client): serialize the current
  span's context into `traceparent`.
- **Extract** on the way in (in service B's server): read `traceparent`, and make
  B's root span a *child* of A's span in the *same* trace.

The payoff: a single `trace_id` now spans every service the request touched, so
the waterfall reassembles across process boundaries into one tree. This is
*exactly* module 05's "generate at the edge, propagate on every outbound call,"
except the id and format are standardized and a full span tree is built rather
than just a flat id — which is why manual `request_id` propagation is fairly
called "tracing's ancestor." (For async/queue work, you propagate the context in
the *message* rather than an HTTP header — same idea.)

### OpenTelemetry: one standard for all three pillars

**OpenTelemetry (OTel)** is the vendor-neutral, industry-standard framework
(a CNCF project, the merger of OpenTracing and OpenCensus) for generating and
shipping telemetry. Its importance is that it produces **all three signals** —
traces, metrics, and logs — through **one instrumentation layer** and one set of
concepts, so you're not wiring three separate systems that don't know about each
other. The pieces:

- **API + SDK.** You instrument your code against the OTel *API*; the *SDK*
  implements it. Auto-instrumentation libraries (e.g. for FastAPI, httpx,
  SQLAlchemy) create spans for you around framework operations, so you get a
  useful trace tree with almost no manual span code.
- **The Collector.** A separate process that *receives* telemetry from your apps
  (over the **OTLP** protocol), processes/batches it, and *exports* it to
  backends. Your app talks only to the Collector; the Collector decides where
  data goes — so switching backends (Jaeger → Tempo → a vendor) is a Collector
  config change, not a code change. (Same "app stays vendor-neutral" principle as
  logs to stdout in module 05.)
- **Backends.** Traces land in a tracing backend — **Jaeger**, **Grafana Tempo**,
  Zipkin, or a vendor (Datadog, Honeycomb). Metrics can go to Prometheus (module
  06); logs to Loki/Elasticsearch (module 05) — all visualizable together in
  Grafana.

The reason OTel is *the* answer to this module's question — how the pillars
complement each other — is that it **correlates them by shared identifiers**.
Because the same `trace_id` (and `span_id`) is attached to the trace *and*
injected into every log line (module 05's context, now carrying `trace_id`) *and*
available as an exemplar on metrics, you can pivot losslessly: click a spike on a
metric graph → jump to a slow trace in that window → click a span → see exactly
the log lines emitted during that span. Three pillars, one id, one investigation.

```python
# minimal OTel tracing on FastAPI (auto-instrumentation does the heavy lifting)
from opentelemetry import trace
from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
from opentelemetry.instrumentation.httpx import HTTPXClientInstrumentor

FastAPIInstrumentor.instrument_app(app)   # a span per request, extracts traceparent
HTTPXClientInstrumentor().instrument()     # child spans for outbound calls, injects traceparent

tracer = trace.get_tracer(__name__)

@app.post("/checkout")
async def checkout(order: Order):
    with tracer.start_as_current_span("validate_order") as span:  # a manual child span
        span.set_attribute("order.tier", order.tier)              # attributes, NOT the whole order
        validate(order)
    await charge(order)     # httpx span is auto-created AND traceparent auto-propagated
    return {"ok": True}
```

### Sampling traces: you can't keep them all

Like logs (module 05), traces have a volume/cost problem — a trace per request at
scale is enormous — so tracing systems **sample**: keep a representative subset.
Two strategies worth knowing by name:

- **Head-based sampling.** Decide at the *start* of the trace (at the root, the
  "head") whether to keep it, e.g. keep 1% of all traces at random. Simple and
  cheap, and the decision propagates down the `traceparent` flags so the whole
  trace is consistently kept or dropped. The downside: it's random, so it may
  drop the very error trace you needed.
- **Tail-based sampling.** Decide at the *end*, once the whole trace is complete,
  in the Collector — so you can keep *all* traces that erred or were slow and
  sample only the boring fast-and-successful ones. This is the tracing analogue
  of module 05's "sample the boring, keep every error," and it's usually what you
  want, at the cost of the Collector buffering complete traces before deciding.

The same discipline recurs across all three pillars: at scale you cannot keep
every signal, so you keep *all of the interesting* (errors, slow) and *a sample
of the boring* — whether it's log lines, or traces.

## Command reference

| Concept / API | Pillar | Purpose |
|---|---|---|
| Trace | tracing | The whole journey of one request (a tree of spans, one `trace_id`) |
| Span | tracing | One named, timed operation; has `span_id`, `parent_span_id`, attributes |
| Root span | tracing | The first/outermost span of a trace (the edge request) |
| `traceparent` (W3C) | tracing | Header that propagates trace context across services |
| Context propagation | tracing | Inject on outbound, extract on inbound → one trace across hops |
| OpenTelemetry API/SDK | all three | Vendor-neutral instrumentation for traces+metrics+logs |
| OTLP | transport | The protocol apps use to send telemetry to the Collector |
| OTel Collector | transport | Receives, processes, and exports telemetry to backends |
| Jaeger / Tempo | tracing backend | Store and visualize traces (waterfalls) |
| Head vs tail sampling | tracing | Decide-at-start (cheap, random) vs decide-at-end (keep errors) |

**Correlating logs with the active trace (the pillar glue):**

```python
import structlog
from opentelemetry import trace

def add_trace_context(logger, method_name, event_dict):
    span = trace.get_current_span()
    ctx = span.get_span_context()
    if ctx and ctx.is_valid:
        event_dict["trace_id"] = format(ctx.trace_id, "032x")
        event_dict["span_id"] = format(ctx.span_id, "016x")
    return event_dict
# add this processor to your structlog chain (module 04) so EVERY log line
# carries the trace_id — now a log and a trace are joinable by one id
```

**A local three-pillar stack (docker-compose sketch):** an **OTel Collector**
(receives OTLP from your app), **Tempo** or **Jaeger** for traces, **Prometheus**
for metrics (module 06), **Loki** for logs (module 05), and **Grafana** as the
single UI over all three. The app is instrumented once with OTel and points at
the Collector; everything downstream is infra config.

**Attributes, not payloads, on spans.** Set bounded, useful attributes
(`http.status_code`, `db.system`, `order.tier`) — never dump whole request
bodies, secrets, or PII onto a span. Same sensitive-data rules as logs (module
05); traces are stored and viewable too.

## Hands-on exercises

Create a `tracing/` project (or extend your metrics one):

```bash
pip install "fastapi[standard]" opentelemetry-distro opentelemetry-exporter-otlp \
    opentelemetry-instrumentation-fastapi opentelemetry-instrumentation-httpx structlog
```

For the backend, run Jaeger all-in-one: `docker run -p 16686:16686 -p 4317:4317
jaegertracing/all-in-one` (UI on :16686, OTLP on :4317).

### 1. Your first trace: one auto-instrumented service

Instrument a single FastAPI app with `FastAPIInstrumentor.instrument_app(app)`,
export to Jaeger's OTLP endpoint, and hit a route. Open Jaeger (:16686) and find
the trace.

Expected: a trace with a single root span for your request, showing its
duration. You've produced the first pillar's third member with almost no code —
auto-instrumentation created the span.

### 2. See a span tree from nested work

Add manual child spans around two operations in a route
(`tracer.start_as_current_span("step_a")`, then `"step_b"`), each with a small
`asyncio.sleep`. View the trace.

Expected: a waterfall with the root span enclosing two child bars in sequence,
each with its own duration. You can *see* which step took longer — the structure
tracing exists to show.

### 3. Distributed trace across two services

Run two instrumented services (`api` → `billing`), with
`HTTPXClientInstrumentor().instrument()` on the caller so the outbound call
propagates `traceparent`. Hit `api`; it calls `billing`.

Expected: **one** trace in Jaeger spanning *both* services — `api`'s span with
`billing`'s span nested inside it, sharing one `trace_id`. Now disable the httpx
instrumentation (or strip the header) and retry: you get **two** disconnected
traces. That broken state is what context propagation prevents — and it's
module 05's `request_id` propagation, now automatic and structured.

### 4. Read a waterfall to find the slow hop

Make `billing` sleep 2 seconds and `api` do a fast DB-ish operation. Look at the
trace waterfall.

Expected: the waterfall makes it obvious the time is in `billing`, not `api` —
one glance replaces guesswork. Write down: how would you have found this from
*metrics alone*? (You'd know the request was slow, but not *which* hop — that's
the gap traces fill.)

### 5. Correlate a log line with its trace

Add the `add_trace_context` processor to your structlog config. Emit a
`log.info(...)` inside a span. Check the log output and the span.

Expected: the log line now carries a `trace_id` (and `span_id`) matching the
active span. You've built the pillar glue: given a trace, you can find its logs;
given a log, you can find its trace — by one shared id. This is the correlation
that makes three pillars *one* investigation.

### 6. The full metrics → trace → logs loop

Combine module 06's metrics with this module's tracing on one service. Generate
mixed traffic including some slow/erroring requests. Then, playing incident
responder: (a) spot the latency spike on your Prometheus/Grafana metric; (b) find
a slow trace from that window in Jaeger and identify the slow span; (c) filter
your logs to that `trace_id` and read what happened.

Expected: you complete the *that/when → where → why* loop end to end on real
data. This exercise *is* the module — internalize the pivot between pillars.

### 7. Head vs tail sampling, conceptually

Configure head-based sampling to keep 10% of traces (`TraceIdRatioBased(0.1)`).
Generate 100 requests, 5 of which error. Count how many traces (and how many
*error* traces) land in Jaeger.

Expected: ~10 traces total, and — because head sampling is *random* — you likely
*lose most of the error traces*. Write down why tail-based sampling (decide at
the end, keep all errors) would fix this, and what it costs (the Collector must
buffer complete traces). This mirrors module 05's "never sample errors."

### 8. Diagnose and fix: three tools, no answers

An on-call engineer says: "We have great dashboards, we have tons of logs, we
even added tracing — but when checkout got slow for *some* users yesterday it
still took us three hours to find that one downstream service was the problem.
Why didn't the tooling help?" Here's their setup. Diagnose what's broken about
how the pillars are (not) connected.

```
- Metrics: RED metrics per service, but each service on its own dashboard.
- Logs:    structured JSON to Loki, but no trace_id/request_id field.
- Traces:  each service creates its own root span (no traceparent propagation).
- No shared correlation id across any of the three.
```

<details>
<summary>Solution</summary>

They have three pillars but **no correlation**, so they can't pivot between them
— which is the entire value. Each problem:

**Traces don't propagate context** — each service starts its own root span, so
there's no *distributed* trace; you can't see the request flow *across* services,
which is exactly the "which downstream service" question they couldn't answer.
Fix: instrument the HTTP clients so `traceparent` is injected/extracted (exercise
3) — then one waterfall shows the slow hop in seconds.

**Logs carry no `trace_id`/`request_id`** — so even when they suspect a service,
they can't jump from a trace (or a metric spike) to *that request's* logs; they're
grepping blind. Fix: add the `trace_id` processor (exercise 5) so every log joins
to a trace.

**Metrics are siloed per service with no link out** — a spike on one dashboard
can't be pivoted to an example trace or the logs. Fix: shared labels + exemplars/
`trace_id` so the metric points at real traces.

**No shared id across any pillar** is the root cause: the three pillars only
become *observability* when a single id (the `trace_id`, propagated everywhere and
stamped on logs and metrics) lets you move *that/when → where → why*. With it,
"checkout slow for some users" is: metric spike → open a slow trace → see the
downstream span → read that span's logs — minutes, not hours. The tools weren't
the problem; the *correlation between them* was missing. OpenTelemetry exists
precisely to give you that one id across all three.

</details>

## Independent challenge

No code given. Take the two-service setup from **module 05's independent
challenge** (where you propagated a `request_id` by hand) and *upgrade it to full
OpenTelemetry* — then prove the three pillars work as one. Concretely: (1)
auto-instrument both services and their HTTP client with OTel so a single
distributed trace spans both, viewable as a waterfall in Jaeger/Tempo; (2) keep
module 06's RED metrics on both services; (3) add the `trace_id` processor to
your structlog config (module 04/05) so every log line carries the trace's id;
and (4) run one deliberately-slow, deliberately-erroring request and demonstrate
the complete investigation loop *on your own data* — start from the metric that
shows it's slow, open the trace to find *which* service/span, and land in the
logs filtered by `trace_id` to read *why*. Write down, in one paragraph, how this
compares to the hand-rolled `request_id` propagation from module 05 — what OTel
automated, and what stayed the same.

<details>
<summary>Hint</summary>

The `request_id` you propagated by hand in module 05 *is* the `trace_id`
conceptually — OTel just standardizes the header (`traceparent`), builds a span
*tree* instead of a flat id, and does the inject/extract for you via the httpx +
FastAPI instrumentors (so you delete your manual header-copying code). The glue
that makes the loop work is one line of config in three places: the HTTP client
instrumentor (traces cross the hop), the `add_trace_context` structlog processor
(logs carry `trace_id`), and shared metric labels (the spike points somewhere).
For the "on your own data" proof, don't fabricate — actually make `billing` sleep
and sometimes 500, drive traffic, and screenshot the three views for the *same*
`trace_id`. The paragraph should conclude that the *model* (correlate everything
by one id generated at the edge and propagated on every hop) is identical to
module 05; OTel automates the plumbing and adds the span tree.

</details>

## Common mistakes & troubleshooting

- **Treating the pillars as alternatives.** They answer different questions
  (what/why vs how-much vs where) and are strongest *correlated*. Don't pick one;
  connect all three by a shared id.
- **No context propagation.** Without injecting/extracting `traceparent`, each
  service starts its own trace and you lose the distributed view — the exact
  thing tracing is for. Instrument your HTTP clients (and propagate in queue
  messages for async work).
- **No `trace_id` on log lines.** Then you can't pivot from a trace (or metric)
  to the relevant logs. Add a processor that stamps the active `trace_id` on
  every log line.
- **Dumping payloads/PII/secrets into span attributes.** Spans are stored and
  viewable like logs — same sensitive-data rules (module 05). Use bounded,
  meaningful attributes, not whole bodies.
- **Head-sampling and losing your error traces.** Random head sampling drops the
  interesting traces too. Prefer tail-based sampling (keep all errors/slow,
  sample the boring) for the same reason you never sample error logs.
- **Confusing monitoring with observability.** Monitoring watches predicted
  failures (known unknowns); observability is being able to ask *new* questions
  of a novel problem. Dashboards alone aren't observability without correlated,
  explorable signals.
- **Reinventing the wheel per vendor.** Instrument with OpenTelemetry against the
  Collector, not a vendor SDK, so backends are a config change — the same
  vendor-neutrality principle as emitting logs to stdout.

## Checkpoint quiz

Write down your answer to each question before expanding it — checking without attempting first is the single easiest way to fool yourself into thinking you've learned this.

1. Name the three pillars and the distinct question each one owns. Give the
   `that/when → where → why` debugging loop and which pillar plays each role.
2. What is a span, what is a trace, and how do `trace_id`, `span_id`, and
   `parent_span_id` combine to build the request tree?
3. What is context propagation, which header standardizes it, and how is it the
   same idea as module 05's `request_id` propagation?
4. What does OpenTelemetry unify, and why is "one shared id across all three
   pillars" the thing that turns three separate tools into observability?
5. Distinguish monitoring from observability using "known unknowns" vs "unknown
   unknowns," with an example of a question only observability can answer.
6. Why must traces be sampled at scale, and why is tail-based sampling usually
   preferable to head-based — tying it to a rule you already learned about logs?

<details>
<summary>Answers</summary>

1. **Logs** — "what exactly happened?" (detailed individual events). **Metrics**
   — "how much/how many/how fast, over time?" (cheap aggregates, dashboards/
   alerts). **Traces** — "where did the time/error occur across the request
   flow?" (one request's span tree). The loop: a **metric** alert tells you
   *that/when* something's wrong; a **trace** shows *where* (which service/span);
   the **logs** for that span/`trace_id` show *why*.
2. A **span** is one named, timed operation (start + duration + status +
   attributes). A **trace** is the whole journey of one request — a tree of
   spans. All spans in a request share one **`trace_id`**; each has its own
   **`span_id`**; and **`parent_span_id`** links a span to its parent, which is
   what assembles the spans into the nested tree/waterfall.
3. Context propagation is passing the current trace context across a service
   boundary — the caller **injects** it into the outbound request (the W3C
   **`traceparent`** header), the callee **extracts** it and continues the *same*
   trace as a child span. It's exactly module 05's "generate an id at the edge,
   propagate it on every outbound call so downstream shares it," now standardized
   in format and building a full span tree instead of a flat id.
4. OpenTelemetry unifies the generation and shipping of **all three signals
   (traces, metrics, logs)** behind one instrumentation layer, one protocol
   (OTLP), and one Collector — and, crucially, one correlation id (the
   `trace_id`) stamped on the trace, on every log line, and available on metrics.
   That shared id is what lets you *pivot* losslessly between pillars; without it
   you have three disconnected datasets and can't move from a symptom to a cause.
5. **Monitoring** watches for failures you anticipated (known unknowns) — you
   built the dashboard/alert because you predicted that metric mattered.
   **Observability** is being able to answer questions you *didn't* anticipate
   (unknown unknowns) by exploring rich, correlated signals after the fact. Only
   observability answers something like "checkout is slow for *some* users since
   2pm — which ones, and where?" when nobody built that specific view in advance.
6. A trace per request is enormous at scale, so you keep a subset. **Head-based**
   decides at the start (random, cheap) but may drop the error/slow trace you
   needed; **tail-based** decides at the end in the Collector, so it can keep
   *all* error/slow traces and sample only the boring fast-successful ones — the
   same rule as logs (module 05): keep everything interesting, sample the boring,
   never sample errors. Tail sampling costs the Collector buffering complete
   traces before deciding.

</details>

## Next

[08-alerting-without-fatigue](../08-alerting-without-fatigue/README.md) — you can
now observe a system through all three pillars and investigate a problem *once
you're looking*. The next module is about the other half: being *told* when to
look, without being drowned in noise. It covers alerting philosophy, SLO-based
alerting built on the metrics from module 06, and how to design actionable
alerts that avoid the fatigue that gets real incidents ignored. It also carries
this track's next cumulative review, spanning modules 00-08.
