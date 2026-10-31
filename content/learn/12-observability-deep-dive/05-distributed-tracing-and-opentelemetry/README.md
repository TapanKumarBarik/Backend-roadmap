# Distributed Tracing and OpenTelemetry

## Why this matters

This is the pillar the Azure-native tracks barely touched. Metrics told you
*request latency spiked*; logs told you *what one service logged* — but when a
single checkout request fans out across an API gateway, an orders service, and
a database, neither tells you **where the time actually went**. Distributed
**tracing** does: it follows one request across every service and shows you the
exact hop that was slow or failed. **OpenTelemetry (OTel)** is the
vendor-neutral standard for producing that data — the CNCF project that
replaced a pile of competing formats — and it's the least-familiar and often
most-revealing pillar for anyone running microservices. This module gets a
real trace flowing across two services and into Grafana.

## Concepts

### Spans and traces — the anatomy

A **span** is a single timed operation: "handle HTTP GET /checkout", "query
the orders DB", "call the payments service". Each span has a name, a start and
end time (so a duration), and key-value **attributes** (http.method,
db.statement, http.status_code). A **trace** is a tree of spans representing
*one request's* full journey: a **root span** (the initial request) with
**child spans** for each downstream operation it triggered, nested by
parent-child relationships. Rendered on a timeline (a "waterfall"), a trace
shows you visually that the request spent 5ms in the gateway, then 800ms
blocked on the database — the "where did the time go" answer metrics and logs
can't give. This is the high-cardinality pillar from module 00 made concrete:
each trace is tied to a specific `trace_id`, exactly the kind of per-request
identifier you keep *out* of metric labels.

### Trace context propagation — the thing that actually makes it work

The magic and the fragility of tracing both live here. For spans from
different services to join into *one* trace, each service must pass a **trace
context** — a `trace_id` (shared by every span in the trace) and the current
`span_id` (the parent for the next hop) — to the next service, almost always as
an HTTP header. The standard is **W3C Trace Context**, a header named
`traceparent`. When service A calls service B, A injects `traceparent` into the
outgoing request; B extracts it and makes its spans children of A's. **If any
service fails to propagate that header, the trace breaks into two disconnected
traces** — B starts a brand-new root instead of continuing A's. This is the
single most common tracing bug and the diagnose-and-fix below: a missing span
because context wasn't propagated. Auto-instrumentation usually handles
propagation for you; manual or mixed setups are where it breaks.

### Instrumentation — auto, manual, and where spans come from

Spans have to be *created* somewhere. Two ways:

- **Auto-instrumentation** — an OTel library/agent for your language hooks
  into common frameworks (HTTP servers, clients, DB drivers) and emits spans
  *and propagates context* automatically, with little or no code change. This
  is how you get value fast.
- **Manual instrumentation** — you call the OTel SDK in your own code to start
  and end spans around business logic the auto-instrumentation can't see
  ("scored the fraud model"), and add custom attributes.

Real systems use both: auto for the plumbing (HTTP/DB), manual for the
domain-specific spans that make a trace actually explain your business logic.

### The OpenTelemetry Collector — the pipeline in the middle

Apps *could* send traces straight to a tracing backend, but the standard
architecture puts an **OpenTelemetry Collector** in between: a vendor-neutral
service that **receives** telemetry (via OTLP, the OTel protocol), **processes**
it (batching, sampling, dropping, adding attributes), and **exports** it to one
or more backends (Tempo, Jaeger, or a cloud vendor). Its config is three
pipelines of `receivers → processors → exporters`. Why bother? It decouples
your apps from the backend (switch Tempo→Jaeger by editing the Collector, not
every app), centralizes **sampling** (below) and cost control, and can process
all three signals — traces, metrics, *and* logs — through one component. It's
the same "put a configurable pipeline between producers and storage" role that
Promtail/Alloy played for logs, generalized.

### Sampling — you can't afford to keep every trace

Traces are the heaviest pillar (module 00): one per request, each with many
spans. At scale you can't store them all, so you **sample** — keep a fraction.
**Head sampling** decides at the start of the trace (e.g. keep 10% at random) —
cheap but might drop the interesting slow/errored traces. **Tail sampling**
decides *after* the trace completes, so you can keep 100% of errors and slow
traces and 1% of the boring fast ones — smarter, done in the Collector,
costlier to run. The tradeoff to remember: **sampling is why a specific request
you're hunting might have no trace** — a normal, expected consequence, not a
bug, and a real gotcha when correlating in module 07.

### Tempo vs. Jaeger — the backend

Something has to store and let you *view* traces. **Grafana Tempo** is the
Loki-of-traces: cheap object-storage backend, and it renders traces *inside the
same Grafana* you use for metrics and logs (ideal for this track's one-pane
goal). **Jaeger** is the older, standalone, CNCF tracing UI — excellent and
common, but a separate UI. This module uses Tempo as primary (to keep one
Grafana) and notes Jaeger as the well-known alternative, the same "pick one,
know the other exists" split as Loki-vs-ELK in module 04.

## Command reference

| Command / config key | What it does | Example |
|---|---|---|
| `helm install tempo grafana/tempo` | Installs the Tempo tracing backend | see exercise 1 |
| `helm install otel-collector open-telemetry/opentelemetry-collector` | Installs the OTel Collector | see exercise 2 |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | Env var telling an app where to send OTLP telemetry | `http://otel-collector:4317` |
| `OTEL_SERVICE_NAME` | Env var naming the service in its spans | `orders` |
| `traceparent` header | W3C Trace Context — carries `trace_id`/`span_id` between services | (HTTP header) |
| UI: Grafana **Explore → Tempo → Search** | Find and view traces (waterfall) | exercise 4 |

Collector config anatomy (the three sections you'll edit in exercise 2):

```yaml
receivers:            # how telemetry gets IN
  otlp:
    protocols:
      grpc: {}        # listen for OTLP/gRPC on :4317
      http: {}        # and OTLP/HTTP on :4318
processors:           # what happens in the MIDDLE
  batch: {}           # group spans before export (efficiency)
exporters:            # where telemetry goes OUT
  otlp/tempo:
    endpoint: tempo:4317
    tls: {insecure: true}
service:
  pipelines:
    traces:           # wire receivers -> processors -> exporters
      receivers: [otlp]
      processors: [batch]
      exporters: [otlp/tempo]
```
- `receivers.otlp.protocols.grpc/http` — the Collector accepts OTLP on 4317
  (gRPC) and 4318 (HTTP); your apps point `OTEL_EXPORTER_OTLP_ENDPOINT` here.
- `processors.batch` — batches spans to reduce export overhead; add
  `tail_sampling` here for smart sampling.
- `exporters.otlp/tempo.endpoint` — where processed traces are shipped
  (Tempo). Swap this one line to send to Jaeger instead — the decoupling
  payoff.
- `service.pipelines.traces` — nothing is active until it's wired into a
  pipeline; a receiver/exporter defined but not referenced here does nothing
  (the ServiceMonitor-style "declared but not selected" trap, again).

## Hands-on exercises

Continue on the **kind** cluster with `kube-prometheus-stack`, Grafana, and
Loki from modules 01-04.

1. **(WSL2) Install Tempo.**
   ```bash
   helm repo add grafana https://grafana.github.io/helm-charts   # (already added in module 04)
   helm repo update
   helm install tempo grafana/tempo --namespace monitoring
   kubectl get pods -n monitoring | grep tempo
   ```
   Expect a `tempo` pod `Running`. This is your trace store — the Loki-of-traces.

2. **(WSL2) Install the OpenTelemetry Collector.**
   ```bash
   helm repo add open-telemetry https://open-telemetry.github.io/opentelemetry-helm-charts
   helm repo update
   helm install otel-collector open-telemetry/opentelemetry-collector \
     --namespace monitoring \
     --set mode=deployment \
     --set image.repository=otel/opentelemetry-collector-contrib \
     --set-string 'config.exporters.otlp/tempo.endpoint=tempo:4317' \
     --set-string 'config.exporters.otlp/tempo.tls.insecure=true' \
     --set 'config.service.pipelines.traces.exporters={otlp/tempo}'
   kubectl get pods -n monitoring | grep otel-collector
   ```
   (If the `--set` overrides are fiddly on your Helm version, install with a
   `-f values.yaml` file containing the Collector config from the Command
   reference — the point is a Collector receiving OTLP on 4317 and exporting to
   Tempo.) Verify the pod is `Running` and check its logs for
   "Everything is ready".

3. **(WSL2) Deploy two services that call each other, auto-instrumented.** Use
   the OpenTelemetry demo's simplest pair, or this minimal two-hop setup where a
   `frontend` calls a `backend`, both auto-instrumented to emit OTLP to the
   Collector. The essential wiring on *each* Deployment is the env:
   ```bash
   #   OTEL_EXPORTER_OTLP_ENDPOINT=http://otel-collector-opentelemetry-collector:4317
   #   OTEL_SERVICE_NAME=frontend   (and =backend on the other)
   ```
   Deploy both into the `demo` namespace, expose the `frontend`, and drive
   traffic through it so the frontend calls the backend on each request. (Any
   pre-instrumented sample two-service app works; the OpenTelemetry Community
   "astronomy shop" demo is the canonical one but heavy — a two-pod HTTP
   caller/callee is enough.)

4. **(WSL2) View your first trace.** Add Tempo as a Grafana data source
   (**Connections → Data sources → Tempo**, URL `http://tempo:3100`). In
   **Explore**, pick Tempo, click **Search**, and open a recent trace. You
   should see a **waterfall**: a root span from `frontend` with a *child* span
   from `backend` nested under it — one request, two services, joined. That
   join only happened because the trace context propagated.

5. **Diagnose and fix: a missing span because context wasn't propagated.** This
   is *the* tracing bug. Reproduce it: on the `frontend`, make it call the
   `backend` in a way that **doesn't** forward the `traceparent` header — e.g.
   set `OTEL_PROPAGATORS=none` on the frontend, or (if manually instrumented)
   have it build the outbound request without injecting context. Drive traffic,
   then search Tempo again. Now you see **two separate traces** — a `frontend`
   root with no child, and a `backend` root standing alone — instead of one
   joined trace. Diagnose: inspect the outbound request and confirm no
   `traceparent` header is present (the backend had nothing to continue, so it
   started a new root). **Fix** by restoring propagation (remove
   `OTEL_PROPAGATORS=none` / re-enable context injection); confirm the trace
   rejoins into one waterfall with the `backend` span nested under `frontend`.
   Lesson: **a broken trace is almost always a propagation problem — one hop
   didn't pass `traceparent`.**

6. **(WSL2) Inspect span attributes.** Open a joined trace and expand the spans.
   Note the attributes auto-instrumentation attached: `http.method`,
   `http.route`, `http.status_code`, durations. These are what let you filter
   traces ("show me traces where `http.status_code=500`") — the trace pillar's
   version of structured detail.

7. **(WSL2) Add a manual span (if your sample app is one you can edit).** Wrap
   a bit of "business logic" in a manual span with a custom attribute (e.g.
   `order.value`). Re-run and find it nested in the waterfall. This is the
   auto+manual combination — auto for the HTTP plumbing, manual for the
   domain-specific step that explains *your* system.

8. **(WSL2) Understand sampling.** In the Collector config, note there's no
   tail-sampling processor yet, so you're keeping everything (fine at this
   volume). Read the `processors` section and identify where a `tail_sampling`
   processor (keep 100% of errors, 10% of the rest) would go and why that
   belongs in the *Collector*, not each app. Write one sentence on why a
   specific request might have *no* trace once sampling is on (module 07 gotcha).

9. **(WSL2) Note the Jaeger alternative.** You used Tempo for the one-Grafana
   payoff. In a sentence, note when you'd pick Jaeger instead (you want its
   standalone, tracing-specialized UI, or you're in an ecosystem already
   standardized on it) — the same "know the alternative" discipline as ELK in
   module 04.

10. **(WSL2) Leave Tempo and the Collector installed** for module 07. To
    reclaim: `helm uninstall tempo otel-collector -n monitoring`.

## Independent challenge

No full app given — assemble it yourself using this module plus
[module 04](../04-logging-and-log-aggregation-loki/README.md) (structured
logging) and [module 00](../00-observability-concepts-and-three-pillars/README.md)
(why trace_id is high-cardinality). Stand up a **two-service** request path of
your choosing (frontend → backend, or api → worker) where a request to the
first triggers a call to the second, instrument both with OpenTelemetry
pointing at your Collector, and prove you get **one joined trace** spanning both
services with the child span nested correctly. Then do the hard part: make each
service *also* log (structured JSON) the `trace_id` of the request it's
handling, so the same identifier appears in both the trace *and* the logs. This
is the deliberate setup for module 07's correlation — verify by picking a
`trace_id` from a Tempo waterfall and finding that exact ID in the Loki logs of
*both* services. The skill is producing telemetry that's already correlatable
across pillars, which is 90% of what makes an incident debuggable.

<details>
<summary>Stuck? One hint</summary>

The join depends entirely on the `traceparent` header surviving the
frontend→backend hop — if you get two disconnected traces, propagation is off
(exercise 5). To get the `trace_id` into your logs, most OTel SDKs expose the
current span context to your logging code; pull `span.get_span_context().trace_id`
(or your language's equivalent) and add it as a `trace_id` field in the
structured log line. Then in Loki, `{namespace="demo"} | json |
trace_id="<the-id-from-tempo>"` should return lines from *both* services —
`trace_id` lives in log *content*, never a Loki label (module 04's cardinality
rule), because it's as high-cardinality as identifiers get.

</details>

## Common mistakes & troubleshooting

- **Broken trace = broken propagation.** Two disconnected traces where you
  expected one almost always means a hop didn't forward `traceparent`. Check the
  outbound request headers first; suspect `OTEL_PROPAGATORS`, a hand-built HTTP
  client that skips injection, or a proxy stripping the header.
- **Nothing in Tempo at all.** Check the chain end to end: app env
  `OTEL_EXPORTER_OTLP_ENDPOINT` points at the Collector's 4317; the Collector's
  `traces` pipeline actually references the OTLP receiver *and* the Tempo
  exporter (declared-but-not-wired does nothing); Tempo is reachable from the
  Collector.
- **trace_id in a metric or Loki label.** It's the highest-cardinality value
  there is — one per request. It belongs in trace data and in *log content*,
  never an indexed label (modules 00/04).
- **Expecting every request to have a trace.** Once sampling is on, a specific
  request may legitimately have no stored trace. That's sampling working, not a
  bug — but it's a real surprise when correlating (module 07).
- **Only auto-instrumenting.** Auto covers HTTP/DB plumbing but not your
  business logic; a trace with no domain spans can't explain *why* your specific
  operation was slow. Add manual spans for the steps that matter.
- **Sending traces straight to the backend, skipping the Collector.** Works for
  a demo, but you lose central sampling/cost control and couple every app to the
  backend. Route through the Collector.

## Checkpoint quiz

Write down your answer to each question before expanding it — checking without attempting first is the single easiest way to fool yourself into thinking you've learned this.

<details>
<summary>Show questions</summary>

1. Define span and trace, and describe what a trace waterfall shows you that
   metrics and logs can't.
2. What is trace context propagation, which header carries it, and what happens
   if one service fails to propagate it?
3. Auto- vs. manual instrumentation — what does each cover, and why do real
   systems use both?
4. What are the three sections of an OTel Collector pipeline, and what's the
   benefit of routing through a Collector instead of app→backend directly?
5. Head vs. tail sampling — the difference, and why tail sampling is smarter for
   catching problems?
6. Why might a specific request you're investigating have no stored trace, and
   is that a bug?
7. Where does a `trace_id` belong across the three pillars, and where must it
   *not* go?

</details>

<details>
<summary>Show answers</summary>

1. A span is one timed operation (name, start/end, attributes); a trace is the
   tree of spans for a single request across services. The waterfall shows
   *where the time went* — which service/hop of one request was slow or failed —
   which an aggregate metric (not one request) and a single log line (one point,
   not the path) can't show.
2. Propagation is passing the trace context (`trace_id` + current `span_id`)
   from one service to the next, carried in the W3C `traceparent` HTTP header.
   If a service fails to propagate it, the trace breaks in two — the downstream
   service starts a new root span instead of continuing the trace.
3. Auto-instrumentation covers common framework plumbing (HTTP servers/clients,
   DB drivers) and propagation with little code change; manual instrumentation
   adds spans around your own business logic with custom attributes. Both,
   because auto gives fast coverage of the plumbing while manual explains the
   domain-specific steps auto can't see.
4. `receivers` (how telemetry gets in — OTLP), `processors` (batching,
   sampling, attributes), `exporters` (where it goes — Tempo/Jaeger), wired
   together in a `service.pipelines` entry. Routing through the Collector
   decouples apps from the backend, centralizes sampling/cost control, and can
   handle all three signals in one place.
5. Head sampling decides at the start of the trace (cheap, random, may drop the
   interesting ones); tail sampling decides after the trace completes, so it can
   keep 100% of errored/slow traces and a small fraction of normal ones — better
   for catching problems, at higher cost, done in the Collector.
6. Because sampling deliberately keeps only a fraction of traces, so that
   particular request may not have been retained. It's expected behavior, not a
   bug — but a real gotcha when you try to correlate a specific request in
   module 07.
7. In the **trace** data and in **log content** (as a field). It must *not* be
   a metric label or a Loki index label — it's the highest-cardinality value
   there is (one per request) and would explode either index.

</details>

## Cumulative review

Closed book. Cover the answers and write each out before checking. These mix
everything so far across all three pillars — concepts (00), Prometheus/PromQL
(01-02), Grafana (03), Loki (04), and tracing (05).

1. For an e-commerce checkout, name one signal you'd collect from each pillar,
   and for each state whether `order_id` should appear in it and why.
2. A `histogram_quantile` p95 panel in Grafana shows "No data". Give two
   independent causes — one PromQL (module 02), one Grafana/label (module 03) —
   and how you'd tell them apart.
3. You put `user_id` as a label in three places by mistake: a Prometheus
   metric, a Loki stream label, and… where does it *actually* belong? Explain
   the single underlying rule that governs all three.
4. Write the LogQL to compute the per-service error-line rate over 5m from JSON
   logs, and say why this can sit on the same Grafana dashboard as a Prometheus
   panel.
5. A trace shows the `frontend` span with no `backend` child, and separately a
   lone `backend` trace. What's the cause and the fix?
6. Distinguish `up == 0` (module 01), a Loki empty-selector result (module 04),
   and a broken trace (module 05) — what do these three "nothing showed up"
   failures have in common conceptually?
7. Why do you wrap a counter in `rate()` but read a gauge directly, and give one
   example metric of each type from the stack you installed.
8. An on-call engineer sees a latency-spike metric alert. Describe the ideal
   metric → logs → trace path they'd follow and which tool serves each step.
9. You need to keep 100% of errored requests' traces but only 5% of normal
   ones, without your app code deciding. What feature, in which component,
   achieves this?
10. Name one thing Container Insights/Log Analytics (track 07) did for you
    automatically that you had to configure by hand in this track, and one
    capability this open-source stack has that the Azure-native monitoring
    barely offered.

<details>
<summary>Show answers</summary>

1. **Metric**: request rate / p95 latency for `/checkout` (labels `endpoint`,
   `status`) — `order_id` must **not** appear (unbounded → cardinality
   explosion). **Log**: a structured line per checkout with `order_id` in the
   content — `order_id` **belongs** here (queryable detail). **Trace**: the
   checkout's span tree, tied to a `trace_id`, with `order_id` as a span
   attribute — belongs here too. High-cardinality detail lives in logs/traces,
   never metric/index labels.
2. PromQL cause: the query aggregated away `le` (`sum` without `by (le)`), so
   `histogram_quantile` returns nothing. Grafana/label cause: a wrong label
   name/value (e.g. `status` vs `code`) so the selector matches no series. Tell
   apart by running the bare `..._bucket` metric in Explore — if it returns
   data, the bug is in your `by (le)`/aggregation; if the bare metric also
   returns nothing, it's the label/selector.
3. It belongs in **log content and trace attributes**, not any index label. The
   one rule: **only low-cardinality, bounded values may be indexed labels**
   (metric labels *or* Loki stream labels); unbounded per-entity identifiers go
   in content, extracted at query time. Same rule, three surfaces.
4. `sum by (service) (rate({namespace="demo"} | json | level="error" [5m]))`.
   It can share a Grafana dashboard because LogQL can produce a metric (a rate)
   from logs, and Grafana panels each choose their own data source, so a
   Loki-derived rate panel sits next to a Prometheus panel.
5. The `frontend` didn't propagate the `traceparent` header to the `backend`,
   so the backend started a new root trace instead of a child span. Fix: restore
   context propagation (re-enable the propagator / inject context into the
   outbound request) so the trace rejoins.
6. `up == 0` = scrape reached but failed; Loki empty selector = labels matched
   no stream; broken trace = context not propagated. Conceptually all three are
   **"the thing you expected to match didn't match"** — a selector/label/context
   mismatch that fails *silently* with no error, requiring you to verify against
   what actually exists.
7. A counter only increases and resets on restart, so its raw value is
   meaningless — `rate()` gives the useful per-second change; a gauge already
   represents a current level you read directly. Counter example:
   `http_requests_total`; gauge: `node_memory_MemAvailable_bytes` (or
   `kube_pod_status_phase`).
8. See the spike in a **Prometheus/Grafana** metric panel → pivot to **Loki**
   logs filtered to the same service/time window to read the actual errors and
   grab a `trace_id` → open that `trace_id` in **Tempo** to see which downstream
   hop caused it. Metric = *that* it happened, log = *what*, trace = *where*.
9. **Tail sampling**, configured as a processor in the **OpenTelemetry
   Collector** — it decides after the trace completes, so it can keep all errors
   and a small fraction of normal traces without any app-code involvement.
10. Automatic-for-you in track 07: the log-shipping agent and pipeline
    (Container Insights deployed it with one command; here you install Promtail/
    Alloy + Loki and wire ServiceMonitors yourself). Under-offered by Azure-
    native monitoring: **distributed tracing** across services (OpenTelemetry +
    Tempo), which Container Insights barely provided.

</details>

## Next

[06-alerting-and-on-call-basics](../06-alerting-and-on-call-basics/README.md)
— all three pillars are collecting now. Time to make them *page you*: how
Alertmanager routes and groups alerts, what separates a good alert from a
noisy one, and how to avoid the alert fatigue that makes teams ignore the
pager.
