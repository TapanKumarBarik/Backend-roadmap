# Correlating the Three Pillars

## Why this matters

This is the module the whole track was building toward. Collecting metrics,
logs, and traces separately is table stakes; the *payoff* is **navigating
between them** during an incident — a metric alert fires, you jump to the exact
logs behind the spike, and from a log line you jump to the specific trace that
shows which service was at fault. Three tools become one debugging flow. The
connective tissue is a shared identifier (the **trace ID**) threaded through
all three pillars, plus Grafana features (**exemplars**, **data links**,
**derived fields**) that turn "correlation in principle" into a literal click.
Teams that collect all three pillars but never wire them together do ten times
the work during an incident; this module is how you avoid that.

## Concepts

### The trace ID is the join key

Everything here rests on one idea: **the same `trace_id` appears in all three
pillars for a given request.** You set this up deliberately in
[module 05's challenge](../05-distributed-tracing-and-opentelemetry/README.md) —
each service logs the `trace_id` of the request it's handling, and that ID is
of course the identity of the trace itself. So a `trace_id` found in a *log
line* is a direct pointer to the *trace*; a `trace_id` attached to a *metric
sample* (an exemplar, below) points to a representative trace behind that data
point. The trace ID is the primary key that joins the three otherwise-separate
datastores — which is *why* module 00 insisted it live in log content and
trace attributes (queryable, join-able) and never in an index label (it's
per-request, unbounded). Correlation is the reward for having respected
cardinality all along.

### Exemplars — a trace ID attached to a metric

A **metric** is aggregate — `histogram_quantile` tells you p99 latency is 2s
but not *which* request was slow. An **exemplar** fixes exactly this: it's a
`trace_id` (plus timestamp) attached to a specific histogram observation, so a
single data point on your latency graph carries a pointer to *one real trace*
that contributed to it. In Grafana, exemplars render as little diamonds on the
graph; click one and you jump straight to that trace in Tempo. This is the
metric → trace bridge — the direct answer to "the p99 spiked, show me a slow
request." Exemplars require the app's instrumentation to emit them and
Prometheus to be configured to store them, but conceptually they're just "the
metric point remembers one example request."

### Grafana's glue: data links and derived fields

Grafana makes the jumps clickable with two features:

- **Derived fields** (Loki data source config) — a regex that extracts a
  `trace_id` from log lines and turns it into a *link* to the Tempo data
  source. Result: every log line in Grafana showing a `trace_id` becomes a
  one-click jump to that trace. This is the **log → trace** bridge.
- **Data links / trace-to-logs** (Tempo data source config) — the reverse: from
  a span in a Tempo trace, a link back to Loki filtered by the trace's ID (and
  time window), so you go **trace → logs** to read what that service logged
  while handling the request.

Wired together, these two closures plus exemplars give you a full loop:
metric → (exemplar) → trace → (trace-to-logs) → logs, and log → (derived field)
→ trace. That loop *is* observability paying off.

### The incident workflow, concretely

The canonical flow this all enables, in order:

1. **Metric alert fires** (module 06): "checkout error ratio > 5%." You know
   *that* something's wrong and roughly *where* (the checkout service) and
   *when*.
2. **Pivot to logs** (module 04): in Grafana, filter Loki to the checkout
   service and the alert's time window, read the *actual* error messages, and
   grab a `trace_id` from a failing line.
3. **Pivot to the trace** (module 05): click the trace ID, open the waterfall,
   and see *which downstream hop* (payments? the DB?) actually failed or was
   slow — the root cause.

Each pillar hands to the next: metric = *that* it's happening, log = *what* the
error is, trace = *where* in the call graph. Doing this by copy-pasting IDs
between three separate tools works but is slow; wiring the links (above) makes
it clicks. Either way, the *thinking* — narrow with metrics, read with logs,
locate with traces — is the durable skill.

### Why "one pane of glass" matters here

You deliberately used **Grafana** for all three pillars (Prometheus + Loki +
Tempo as three data sources) instead of three separate UIs. This module is why:
correlation across pillars is dramatically easier when they share one tool that
can link between them and show them side by side (a split view with the metric
graph, the logs, and the trace all open). Container Insights gave you
metrics+logs in one Azure portal but weak tracing; this open-source stack gives
you all three, correlatable, in one Grafana — the capability the whole track
assembled.

## Command reference

Mostly Grafana data-source configuration (where the correlation glue lives) and
the queries that walk the pillars.

| Feature / query | What it does | Where |
|---|---|---|
| Loki **Derived fields** | Regex-extract `trace_id` from logs → link to Tempo | Loki data source settings |
| Tempo **Trace to logs** | From a span, link to Loki filtered by trace ID + time | Tempo data source settings |
| Prometheus **exemplars** | Store/show a `trace_id` on histogram samples | Prometheus data source + app instrumentation |
| Grafana **Explore split view** | Two panes side by side (e.g. logs + trace) | Explore, "Split" button |
| `{service="checkout"} \| json \| level="error"` | The log pivot from a metric alert | Loki (Explore) |
| `{service="checkout"} \| json \| trace_id="<id>"` | All logs for one specific trace | Loki (Explore) |

Derived-field config (Loki data source → Derived fields):
- **Name**: `trace_id` — the field label shown on the log line.
- **Regex**: `"trace_id":"(\w+)"` — captures the ID out of your JSON log line
  (adjust to your log format). The capture group is the extracted value.
- **Query**: `${__value.raw}` — feeds the captured ID into…
- **Data source**: Tempo — …a link that opens that trace ID in Tempo. Result:
  a clickable trace link on every log line.

Trace-to-logs config (Tempo data source → Trace to logs):
- **Data source**: Loki — where to send you.
- **Tags / filter**: map the span's service to a Loki label and use the trace's
  time range, so the link lands on the right logs, narrowed to the request's
  window.

## Hands-on exercises

This module needs all three pillars from earlier modules installed on your
**kind** cluster: `kube-prometheus-stack` (metrics, modules 01-03), **Loki**
(logs, module 04), and **Tempo** + **OTel Collector** (traces, module 05), plus
ideally the two-service, trace-ID-logging app from module 05's challenge. If you
uninstalled any, reinstall before starting.

1. **(WSL2) Confirm all three data sources in one Grafana.** In Grafana
   **Connections → Data sources**, confirm **Prometheus**, **Loki**, and
   **Tempo** all exist and test green. This one-Grafana-three-sources setup is
   the precondition for everything below.

2. **(WSL2) Do the correlation manually first (the thinking, before the glue).**
   Drive traffic (including some errors) through your instrumented app. Then,
   by hand: (a) in a Prometheus/Grafana panel, spot an error-rate or latency
   bump; (b) switch to Loki in Explore, query `{namespace="demo"} | json |
   level="error"` for that window, and copy a `trace_id` from a failing line;
   (c) switch to Tempo, paste the `trace_id`, and open the waterfall to find the
   slow/failed span. You just walked metric → log → trace by copy-paste. Feel
   how the trace ID is the join key.

3. **(WSL2) Wire the log → trace link (derived field).** In the **Loki** data
   source settings, add a **Derived field** named `trace_id` with a regex that
   captures your log's trace ID (e.g. `"trace_id":"(\w+)"`), query
   `${__value.raw}`, data source **Tempo**. Save. Re-run the Loki query from
   exercise 2 — now each log line shows a `trace_id` with a clickable button
   that jumps straight to that trace in Tempo. The copy-paste from exercise 2 is
   now one click.

4. **(WSL2) Wire the trace → logs link.** In the **Tempo** data source
   settings, enable **Trace to logs**, point it at **Loki**, and configure it to
   filter by the trace's time range (and, if you set service labels, the
   service). Open a trace, click a span, and use the "Logs for this span" link
   to land in Loki showing what that service logged during the request. You now
   have the loop closed in both directions.

5. **(WSL2) Use the Explore split view.** In **Explore**, click **Split**: put
   Loki on the left and Tempo on the right. Click a trace link from a log line
   and watch the trace open beside the logs — metric spike context, the log
   detail, and the trace, visible together. This side-by-side is the "one pane
   of glass" payoff in action.

6. **(WSL2) Exemplars: metric → trace (if your app emits them).** If your
   instrumentation emits exemplars and Prometheus is configured to store them,
   enable **exemplars** on the Prometheus data source and graph your latency
   histogram query — look for diamond markers on the graph. Click one to jump to
   a representative trace behind that data point. (If your app doesn't emit
   exemplars, note conceptually that this is the *metric → trace* bridge and
   move on — it requires app-side support.)

7. **Diagnose and fix: correlation breaks because the trace ID isn't in the
   logs.** The whole loop depends on the `trace_id` being present *and*
   consistently formatted in log lines. Reproduce a break: use a service that
   logs errors but *doesn't* include the `trace_id` field (or logs it under a
   different key like `traceID` your derived-field regex doesn't match). Try to
   pivot from its logs to a trace — there's no link, or the regex captures
   nothing. Diagnose: inspect a raw log line and compare its actual field name/
   format against your derived-field regex. **Fix** either the app (log the
   `trace_id` in the expected field) or the regex (match the field the app
   actually uses). Lesson: **correlation is only as good as the weakest pillar's
   instrumentation — a missing or mis-keyed trace ID silently breaks the loop**,
   the same silent-mismatch family as every other diagnose-and-fix in this
   track (scrape selector, LogQL selector, trace propagation, alert routing).

8. **(WSL2) Write the incident narrative.** Pick one real error you can
   reproduce and write out the full path you took: the metric that flagged it,
   the log query and the error text you found, the trace ID you followed, and
   the exact span that was the root cause. This written "how I'd debug this"
   narrative is the capstone deliverable in miniature — practice it here.

## Independent challenge

No steps given — run the whole loop yourself using every prior module. Starting
from *only* an alert (reuse module 06's firing `critical` alert on the demo
app), reconstruct a complete incident investigation end to end **without
looking back at exercise 2's steps**: from the alert, narrow the time and
service with **metrics** (modules 02-03); pivot to **Loki** logs to read the
actual failure and extract a `trace_id` (module 04); follow that ID into
**Tempo** to identify the exact failing/slow span across your two services
(module 05); and write a short root-cause note naming *which pillar told you
what*. Then improve the setup: identify the one place your correlation is still
manual (a missing derived field, a service not logging `trace_id`, no
trace-to-logs link, or no exemplars) and wire it so the same investigation next
time is one click shorter. The deliverable is both the investigation *and* the
one correlation improvement — because in real incident response, the follow-up
"make this faster next time" is as valuable as the fix itself (a thread
[track 20](../../20-sre-practices/README.md) picks up as SLOs and error
budgets).

<details>
<summary>Stuck? One hint</summary>

The loop only works if a single `trace_id` genuinely threads all three
datastores, so start by proving that: take one `trace_id` from a Tempo
waterfall and confirm the *exact same string* appears in Loki
(`{namespace="demo"} | json | trace_id="<id>"`) returning lines from both
services, and — if exemplars are on — as a diamond on the metric graph. Wherever
that identity chain is broken is exactly where your correlation is manual: fix
the broken link (app not logging the ID, a derived-field regex that doesn't
match the log's actual field name, or a missing trace-to-logs config) and the
click-through appears. Narrow with metrics, read with logs, locate with traces —
in that order, every time.

</details>

## Common mistakes & troubleshooting

- **No shared trace ID across pillars.** If the app doesn't log its `trace_id`
  (or logs it under a key your derived-field regex doesn't match), the log→trace
  jump is impossible. The join key must be present and consistently formatted in
  every pillar.
- **trace_id promoted to an index label to "make it searchable."** Don't — it's
  unbounded (module 00) and explodes the index. Keep it in log *content*/span
  attributes and extract at query time; that's already searchable.
- **Three separate UIs.** Correlating across three disconnected tools is slow.
  Put Prometheus, Loki, and Tempo in *one* Grafana so the links and split view
  work.
- **Expecting a trace for every logged request.** Sampling (module 05) means the
  trace behind a given log line may not have been retained — a normal gap, not a
  broken link. Keep 100% of errors via tail sampling if this hurts.
- **Derived-field regex mismatch.** The most common reason the log→trace button
  doesn't appear: the regex doesn't match the log's actual `trace_id` field.
  Test it against a real raw line.
- **Correlating by timestamp alone.** Lining up three tools by clock is fragile
  (clock skew, busy windows). The trace ID is an exact join; use it, and use
  time only to narrow.

## Checkpoint quiz

Write down your answer to each question before expanding it — checking without attempting first is the single easiest way to fool yourself into thinking you've learned this.

<details>
<summary>Show questions</summary>

1. What single identifier joins all three pillars, and why did module 00 insist
   it stay out of index labels?
2. What is an exemplar, and which pillar-to-pillar jump does it enable?
3. What do Grafana's Loki "derived fields" and Tempo "trace to logs" each do?
4. Describe the canonical metric → log → trace incident workflow and what each
   step tells you.
5. Why put all three data sources in one Grafana instead of three tools?
6. Correlation from a service's logs to its trace suddenly stops working. Give
   the two most likely causes.
7. You follow a log line's trace ID and Tempo has no such trace. Give a normal,
   non-bug explanation.

</details>

<details>
<summary>Show answers</summary>

1. The **`trace_id`**. Module 00 insisted it stay out of metric/index labels
   because it's per-request and unbounded (a cardinality explosion) — but in log
   *content* and span attributes it's queryable and becomes the join key that
   makes correlation possible. Respecting cardinality is what enables
   correlation.
2. An exemplar is a `trace_id` (plus timestamp) attached to a specific metric
   sample (e.g. a histogram observation). It enables the **metric → trace** jump
   — from an aggregate data point to one real example request behind it.
3. Loki **derived fields** regex-extract a `trace_id` from log lines and turn it
   into a clickable link to Tempo (**log → trace**). Tempo **trace to logs**
   does the reverse — from a span, link to Loki filtered by the trace's ID/time
   (**trace → logs**).
4. A **metric** alert fires (that something's wrong, where, when) → pivot to
   **logs** for the actual error text and a trace ID (what the error is) →
   follow the trace ID to the **trace** waterfall to see which downstream hop
   caused it (where in the call graph). Narrow, read, locate.
5. Because correlation across pillars is far easier when one tool can link
   between them and show them side by side (split view, clickable jumps);
   three separate UIs force slow manual copy-paste and timestamp-matching.
6. (a) The app stopped including `trace_id` in its logs (or changed the field
   name/format); (b) the Loki derived-field regex no longer matches the log's
   actual `trace_id` field. Either breaks the extraction and the link.
7. **Sampling** — the trace for that request was not retained (head/tail
   sampling keeps only a fraction). It's expected behavior, not a broken link;
   tail-sample to keep 100% of errors if it matters.

</details>

## Next

[08-capstone-project](../08-capstone-project/README.md) — assemble everything:
a scraped app, a Grafana dashboard, Loki logs, cross-service tracing, an alert
that actually fires, and a written plan for correlating all three pillars
during a real incident.
