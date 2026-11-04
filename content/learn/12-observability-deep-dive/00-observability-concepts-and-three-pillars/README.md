# Observability Concepts and the Three Pillars

## Why this matters

Before you install a single tool, you need a mental model of *what* you're
collecting and *why*, or you'll drown in dashboards that don't answer
questions and alerts that don't mean anything. This module recaps the three
signals every observability stack collects — **metrics, logs, and traces** —
and maps each one onto the open-source stack this track builds
(**Prometheus, Grafana, Loki, OpenTelemetry**), then covers the two ideas that
shape how that stack behaves: **cardinality**, which quietly decides whether
Prometheus stays cheap or falls over, and the **pull** model it scrapes with.
Everything in the rest of the track is an implementation of the ideas here.

## Concepts

### The concepts, in brief

The generic ideas — **monitoring vs. observability**, the **three pillars**
(metrics, logs, traces) and the question each one owns, and the
metric → trace → log debugging loop — are taught in full in
[The Three Pillars of Observability](../../../backend/08-observability-and-operational-readiness/07-the-three-pillars-of-observability/README.md).
Read that first if any of them is new. The short version you need for this
track:

- **Monitoring** watches predefined signals for failure modes you anticipated
  (questions you asked in advance). **Observability** is the property that lets
  you ask *new* questions of a running system without shipping new code. You
  already *monitored* with Container Insights dashboards and Azure Monitor
  alerts in
  [track 07](../../07-aks/06-monitoring-aks-azure-monitor-container-insights/README.md);
  this track builds the observable foundation that monitoring sits on.
- **Metrics** answer "is it happening, how much, what's the trend?";
  **logs** answer "what exactly happened in this one event?"; **traces**
  answer "where did this one request spend its time across services?". A metric
  alert tells you *that*, a trace tells you *where*, logs tell you *why* — and
  each pillar has a different cost shape (metrics: cardinality; logs: volume;
  traces: sampled).

### Which tool owns which pillar in this track

This track replaces the managed Azure tooling with the open-source stack.
Here's the map you'll fill in module by module:

| Pillar | Open-source tool here | Managed cousin you already used |
|---|---|---|
| **Metrics** | **Prometheus** stores and queries them (modules 01-02); **Grafana** graphs them (module 03) | Azure Monitor **metrics** (tracks 06/07) |
| **Logs** | **Loki** aggregates and queries them, viewed in Grafana (module 04) | **Container Insights / Log Analytics** — the `ContainerLogV2` and `ContainerAppConsoleLogs_CL` tables |
| **Traces** | **OpenTelemetry** instruments and exports them; **Tempo/Jaeger** stores them (module 05) | Barely covered — the pillar the managed tracks *didn't* teach you, and often the most revealing one for microservices |
| **Alerting** | Prometheus rules + **Alertmanager** (module 06) | Azure Monitor alerts and action groups |
| **Correlation** | Trace IDs joining all three in Grafana (module 07) | — |

Module 07 is the payoff: a **metric** alert fires, you pivot to **logs** in
Loki to read the actual errors, and a **trace** in Tempo shows which
downstream service caused them. Collecting all three but never *connecting*
them is why teams still can't debug.

### Cardinality — why Prometheus cares so much

[Cardinality](../../../backend/08-observability-and-operational-readiness/06-monitoring-and-metrics/README.md)
is covered as a general metrics concept elsewhere; here's why it matters for
the Prometheus server you're about to run. A **time series** is its metric
name *plus the full set of its label key-value pairs*:
`http_requests_total{method="GET", status="200", pod="web-abc"}` is one series,
and changing any label value (`status="500"`) creates another. **Cardinality**
is the number of distinct series a metric produces — the product of each
label's distinct values.

Prometheus stores and indexes *each series separately*, so bounded labels
(`method`, `status`) are fine, while **unbounded** ones — `user_id`, `email`,
`request_id`, `session_token`, a raw `url` with query parameters — can generate
millions of series from one metric and take the whole server down (a
"cardinality explosion"). The rule: **metric labels must be low-cardinality and
bounded**; high-cardinality data belongs in **logs and traces**. This single
idea is behind more Prometheus outages than any other, and it's why module 01
keeps hammering it.

### Push vs. pull, and why it's coming up

There are two ways telemetry gets from your app to the collector: the app
**pushes** it out (Azure Monitor's agents worked this way — they shipped data
*to* Log Analytics), or the collector **pulls** it by scraping an endpoint the
app exposes. Prometheus is famously a **pull** system: your app exposes a
`/metrics` HTTP endpoint, and Prometheus periodically scrapes it. This is a
deliberate design choice with real consequences (the collector controls the
rate, a failed scrape is itself a signal that the target is down, no app needs
to know the collector's address) — and it's the first big *difference* from
the push-based managed monitoring you already used. Module 01 is entirely
about internalizing the pull model.

## Command reference

This is a concepts module — the "commands" here are about *observing what
signals already exist* on a cluster you already know how to run, so the
abstract pillars become concrete. (Full tool installs start in module 01.)

| Command | What it does | Example |
|---|---|---|
| `kubectl top nodes` | Shows live node CPU/memory — a *metric*, sampled now with no history | `kubectl top nodes` |
| `kubectl top pods -A` | Live per-pod resource *metrics* across all namespaces | `kubectl top pods -A` |
| `kubectl logs <pod>` | Prints a pod's *logs* (stdout/stderr) — the raw log pillar, unaggregated | `kubectl logs deploy/web` |
| `kubectl logs <pod> --timestamps` | Same, with per-line timestamps — makes the "discrete timestamped event" shape obvious | `kubectl logs deploy/web --timestamps` |
| `kubectl get --raw /metrics` | Dumps the API server's own Prometheus-format `/metrics` endpoint — a real pull target | `kubectl get --raw /metrics \| head -40` |
| `curl <pod-ip>:<port>/metrics` | Scrapes an app's metrics endpoint the way Prometheus will (module 01) | `curl 10.244.0.5:8080/metrics` |

Flag-by-flag breakdown for the two worth dissecting:

`kubectl get --raw /metrics | head -40`
- `--raw <path>` — hit an arbitrary API-server path and print the raw
  response body instead of a parsed object. `/metrics` is the API server's
  own Prometheus-exposition endpoint.
- `| head -40` — cap the output; a real `/metrics` endpoint is thousands of
  lines. You're looking at the *format*: `name{label="value"} number`.

`kubectl logs deploy/web --timestamps`
- `deploy/web` — target a Deployment (kubectl picks a pod); works with
  `pod/`, `deploy/`, `sts/` prefixes.
- `--timestamps` — prefix each line with the time it was emitted, so you can
  see that a log is a *stream of discrete, individually-timestamped events* —
  structurally different from a metric's regular-interval samples.

## Hands-on exercises

You need your local **kind** cluster from
[03-kubernetes](../../03-kubernetes/README.md) running. No new tools yet —
this module makes the three pillars concrete using what's already there, and
builds the cardinality intuition you'll rely on in every later module.

1. **(WSL2) Look at a real metric with no history.** Run `kubectl top nodes`
   and `kubectl top pods -A`. Note that you get a *single current number* per
   resource — no trend, no yesterday, no alert. This is the raw material of
   the metrics pillar *before* a metrics database gives it history and query.
   Write one sentence on what question this can and can't answer.

2. **(WSL2) Look at a real log stream.** Deploy something chatty and read its
   logs with timestamps:
   ```bash
   kubectl create deployment loggen --image=busybox -- /bin/sh -c 'i=0; while true; do echo "$(date -Iseconds) event id=$i user=user-$((RANDOM%1000)) path=/checkout status=200"; i=$((i+1)); sleep 1; done'
   kubectl logs deploy/loggen --timestamps --tail=10
   ```
   Notice each line is a discrete, timestamped, *text* event carrying rich
   detail (a user id, a path, a status). Contrast its shape with exercise 1's
   single numbers.

3. **(WSL2) Find a real pull target.** Dump the API server's own metrics
   endpoint:
   ```bash
   kubectl get --raw /metrics | head -40
   ```
   Every line is `metric_name{label="value",...} value`. This is *exactly* the
   Prometheus exposition format module 01 teaches Prometheus to scrape. You're
   looking at a live pull target right now.

4. **Reason about cardinality (paper exercise, then verify your instinct).**
   For the log line in exercise 2, imagine turning each field into a
   *metric label*. For a metric `requests_total{path=..., status=..., user=...}`,
   estimate the number of series if `path` has 20 values, `status` has 15
   values, and `user` has 100,000 values. Now redo it *without* the `user`
   label. Write both numbers down before reading on. (Answer: 20 × 15 ×
   100,000 = 30,000,000 series with `user`; 20 × 15 = 300 series without it —
   a 100,000× difference from one bad label. This is the cardinality explosion
   from the Concepts section, made numeric.)

5. **(WSL2) See where high-cardinality data *should* live.** The `user=` and
   `id=` fields from exercise 2 are exactly what you must *not* put in a metric
   label — but they're perfect in a log. Confirm you can still answer a
   per-user question from the *logs*:
   ```bash
   kubectl logs deploy/loggen --tail=200 | grep "user=user-42" || echo "none in this window"
   ```
   The point: the pillar you pick depends on the *cardinality* of the question.
   "How many requests total?" → metric. "What did user-42 do?" → log/trace.

6. **Map the three pillars to a real question each.** Write down, for your
   `loggen` app, one concrete question best answered by a **metric**, one by a
   **log**, and one by a **trace** (even though loggen has no tracing yet).
   Example shape: metric = "requests per second, trending up?"; log = "what was
   the error text on the failed request at 14:03?"; trace = "for the one slow
   checkout, which downstream call was slow?". This mapping is the muscle
   memory the whole track builds.

7. **Diagnose the mismatch: right data, wrong pillar.** Suppose someone asks
   you to "alert when *any specific user* sees an error" and proposes a metric
   `errors_total{user_id="..."}`. Explain in two sentences why this is a
   cardinality trap and which pillar(s) *should* answer "which users saw
   errors" instead. (This is the reasoning error that takes real Prometheus
   servers down — recognizing it on paper now saves you an outage in module
   01/02.)

8. **(WSL2) Clean up.**
   ```bash
   kubectl delete deployment loggen
   ```

## Independent challenge

No commands given — reason this through in writing using this module plus
what you remember from
[track 07 module 06](../../07-aks/06-monitoring-aks-azure-monitor-container-insights/README.md)
and [track 06 module 07](../../06-azure-container-apps/07-monitoring-and-log-analytics/README.md).
Pick a real-ish scenario — say, an e-commerce checkout that's "sometimes
slow" — and write a one-page **observability plan** for it *before* you know
any of the open-source tools deeply. Decide: which of the three pillars would
you reach for first and why; which specific signals you'd want from each
pillar (name at least two metrics, two log fields, and what a trace would span
across); and crucially, which fields in that scenario are **high-cardinality**
and therefore belong in logs/traces rather than metric labels. Then, drawing
on the Azure-native tracks, note one thing Container Insights/Log Analytics
already gave you "for free" that you'll now have to configure yourself, and
one thing (tracing) it barely offered at all. The goal is to leave this module
able to *design* an observability approach, not just list tools.

<details>
<summary>Stuck? One hint</summary>

Anchor the plan on the **debugging workflow**: a *metric* tells you the
checkout p95 latency spiked (alertable, low-cardinality — good labels are
`endpoint` and `status`, never `order_id`); you pivot to *logs* filtered to
the slow window to read the actual errors and the specific `order_id`/`user_id`
(high-cardinality, perfect in a log); and a *trace* for one of those order IDs
shows *which* downstream service (payments? inventory?) ate the time. If a
field would create a new time series for every distinct value it can take, it
is high-cardinality — keep it out of metric labels.

</details>

## Common mistakes & troubleshooting

- **Treating "we have dashboards" as "we're observable."** Dashboards are
  monitoring — answers to questions you already thought of. Observability is
  being able to answer the *new* question during an incident. A wall of
  pre-built graphs can coexist with a system you still can't debug.
- **Putting high-cardinality data in metric labels.** `user_id`,
  `request_id`, `email`, full `url` with query strings — each unique value is
  a new time series. This is the single most common way to take a metrics
  system down. That data belongs in logs and traces.
- **Reaching for logs to answer aggregate questions.** "How many requests per
  second?" from logs means scanning and counting millions of lines — slow and
  expensive. That's a metric. Use logs for detail, metrics for rates.
- **Reaching for metrics to answer detail questions.** A number can't tell
  you the error message or which user was affected. When you need *why*, you
  need logs or traces, not another gauge.
- **Assuming the three pillars are interchangeable.** They answer different
  questions and cost differently. Collecting only one leaves whole classes of
  questions unanswerable — and collecting all three but never correlating them
  (module 07) wastes most of the value.
- **Forgetting traces exist because the Azure tracks under-taught them.**
  Container Insights leaned on logs+metrics; distributed tracing is the pillar
  you likely have the least intuition for and often the most useful for
  microservice latency. Don't skip module 05.

## Checkpoint quiz

Write down your answer to each question before expanding it — checking without attempting first is the single easiest way to fool yourself into thinking you've learned this.

<details>
<summary>Show questions</summary>

1. In one sentence each, distinguish monitoring from observability.
2. Name the three pillars and the single kind of question each is best at.
3. What is cardinality, and why does a `user_id` metric label endanger a
   Prometheus server?
4. Give one question that a metric answers well but a log answers badly, and
   one where it's the reverse.
5. What does a trace show that neither a metric nor a single log line can?
6. Prometheus is a *pull* system. What does that mean, and name one advantage
   over push.
7. You need to answer "which specific users hit errors in the last hour."
   Which pillar(s) is that, and which one must it *not* be?

</details>

<details>
<summary>Show answers</summary>

1. Monitoring watches a predefined set of signals for known failure modes
   (questions you asked in advance); observability is the property that lets
   you ask *new*, unanticipated questions about the system's internals from
   the outside without shipping new code.
2. **Metrics** — "is it happening / how much / what's the trend" (aggregate,
   alertable). **Logs** — "what exactly happened in this one event" (detail).
   **Traces** — "where did this one request spend its time across services".
3. Cardinality is the number of distinct time series a metric produces (the
   product of its labels' distinct value counts). `user_id` is unbounded, so it
   multiplies the series count by the number of users — potentially millions of
   series from one metric, exhausting the server's memory/index (a cardinality
   explosion).
4. Metric-good/log-bad: "requests per second across the fleet" (aggregation).
   Log-good/metric-bad: "what was the exact error message and which user hit it
   on that one failed request" (detail a number can't carry).
5. The end-to-end path of a *single* request across multiple services, and how
   much time it spent in each — a metric is aggregate (not one request) and a
   single log line is one point in that journey, not the whole path.
6. Pull means the collector scrapes an endpoint the app exposes (Prometheus
   fetches `/metrics`) rather than the app pushing data to the collector.
   Advantages: the collector controls scrape rate, a failed scrape is itself an
   "target down" signal, and apps don't need to know the collector's address.
7. That's **logs and/or traces** (high-cardinality, per-user detail). It must
   *not* be a metric label — `user_id` in a label is the cardinality trap from
   Q3.

</details>

## Next

[01-prometheus-fundamentals](../01-prometheus-fundamentals/README.md) — stand
up real Prometheus on your cluster with `kube-prometheus-stack`, watch it pull
metrics from live targets, and write your first PromQL. This is the metrics
pillar made real.
