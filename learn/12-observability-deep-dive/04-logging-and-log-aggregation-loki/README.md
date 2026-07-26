# Structured Logging and Log Aggregation with Loki

## Why this matters

`kubectl logs` shows you one pod's logs, live, and loses them when the pod
dies — the same limitation `kubectl top` had for metrics. In
[track 07](../../07-aks/06-monitoring-aks-azure-monitor-container-insights/README.md)
Container Insights solved this by shipping every container's logs into Log
Analytics, queryable with KQL and durable across restarts. This module builds
that same capability yourself with **Loki**, the open-source log aggregator
that plugs into the *same Grafana* you already use for metrics. Along the way
you'll learn the two things that make centralized logging actually work:
**structured logging** (so logs are queryable, not just readable) and Loki's
signature design choice — **indexing labels, not full text** — which is why it
stays cheap where an ELK stack gets expensive.

## Concepts

### Structured logging — logs a machine can query

A log line like `Error processing order 4711 for user bob: timeout` is
readable but hard to *query* — extracting "all errors for user bob" means
fragile text parsing. **Structured logging** emits logs as key-value data
(usually JSON): `{"level":"error","msg":"processing failed","order_id":4711,
"user":"bob","reason":"timeout"}`. Now a log aggregator can filter on
`level="error"` and extract `user` reliably. This is the log-pillar counterpart
to module 00's cardinality lesson: **put the rich, high-cardinality detail
(order_id, user, request_id) in the structured log fields** — exactly where it
*doesn't* belong in a metric. Structuring your app's logs is the single highest
-leverage thing you can do to make them useful later, and it's a code change in
your app, not a tooling change.

### Loki's big idea — index labels, not the log text

Traditional log systems (Elasticsearch/ELK) build a **full-text index** over
every word in every log line — powerful (search any word instantly) but
expensive in storage and compute, and the reason ELK clusters are heavy to
run. **Loki** makes the opposite trade: it indexes only a small set of
**labels** (like Prometheus — `namespace`, `pod`, `app`, `level`) and stores
the raw log *content* unindexed in cheap object storage. You query by label to
narrow to a *stream*, then Loki brute-force greps the content of just that
narrowed set. The result: dramatically cheaper storage and operation, at the
cost of slower arbitrary-word search across everything. Loki is often described
as "Prometheus, but for logs" — deliberately, because it reuses the same
label model, so `{namespace="demo", app="metrics-app"}` selects a log stream
the same way a metric selector selects series.

### The cardinality trap comes back — this time in log labels

Because Loki indexes labels, **the same cardinality discipline from module 00
applies to Loki labels.** Putting a high-cardinality value (`request_id`,
`user_id`, a full URL) into a *Loki label* creates a separate stream per value
and blows up Loki's index — the exact mistake, in a new place. The rule:
**labels are for the low-cardinality dimensions you slice by (namespace, app,
level, pod); the high-cardinality detail stays in the log line content** and is
extracted at query time with a LogQL filter/parser, not indexed. If you
internalized "don't put user_id in a metric label," this is the same sentence
with "Loki" swapped in.

### The agent — Promtail / Grafana Alloy ships the logs

Loki stores and queries logs but doesn't collect them. A **collection agent**
runs on each node (a DaemonSet, like node-exporter), tails every pod's log
files, attaches Kubernetes labels (namespace, pod, container), and pushes the
streams to Loki. Historically this was **Promtail**; the current recommended
agent is **Grafana Alloy** (Promtail is being deprecated in favor of it), but
they play the same role. This is the open-source equivalent of the Container
Insights agent DaemonSet you saw ship logs to Log Analytics — except you can
see and configure exactly what it collects, relabels, and drops (dropping noisy
logs *before* ingestion is a real cost lever, just like trimming verbosity was
in track 07).

### LogQL — Loki's query language

**LogQL** deliberately mirrors PromQL. A query has two parts: a **stream
selector** in `{}` (label matchers, mandatory) and an optional **line filter /
pipeline** after it:

- `{namespace="demo"}` — every log line from that namespace (stream selector
  only).
- `{namespace="demo"} |= "error"` — lines containing the substring "error"
  (`|=` contains, `!=` doesn't contain, `|~` regex).
- `{namespace="demo"} | json | level="error"` — parse each line as JSON, then
  filter on the extracted `level` field (this is where structured logging pays
  off).
- `sum(rate({namespace="demo"} |= "error" [5m]))` — LogQL can even compute
  *metrics from logs*: the per-second rate of error lines. This is the bridge
  that lets you graph log-derived rates next to real metrics, and it previews
  module 07's correlation.

## Command reference

| Command / LogQL | What it does | Example |
|---|---|---|
| `helm install loki grafana/loki-stack` | Installs Loki + an agent (Promtail) in one chart | see exercise 1 |
| `kubectl get pods -n monitoring -l app=loki` | Confirms Loki is running | `kubectl get pods -n monitoring \| grep -E 'loki\|promtail'` |
| UI: Grafana **Connections → Data sources → Loki** | Adds Loki as a data source (chart may auto-wire) | exercise 2 |
| UI: Grafana **Explore**, Loki source | Run LogQL interactively | exercise 3 |
| `{label="value"}` | LogQL stream selector (mandatory) | `{namespace="demo"}` |
| `\|= "text"` / `\|~ "regex"` | Line filter: contains / regex-matches | `{app="x"} \|= "timeout"` |
| `\| json` / `\| logfmt` | Parse structured lines into queryable fields | `{app="x"} \| json \| level="error"` |
| `sum(rate({...} [5m]))` | Metric *from* logs — error-line rate | see exercise 6 |

Flag-by-flag breakdown of the install (exercise 1):

`helm install loki grafana/loki-stack --namespace monitoring --set promtail.enabled=true --set grafana.enabled=false --set loki.isDefault=false`
- `grafana/loki-stack` — the bundle chart: Loki + Promtail agent (+ optionally
  Grafana, which you already have).
- `--namespace monitoring` — install alongside the Prometheus stack so one
  Grafana can reach both.
- `--set promtail.enabled=true` — deploy the log-shipping agent DaemonSet.
- `--set grafana.enabled=false` — **don't** install a second Grafana; you have
  one from `kube-prometheus-stack`.
- `--set loki.isDefault=false` — keep Prometheus as Grafana's default data
  source; Loki is added but not the default.

LogQL pipeline `{namespace="demo"} | json | level="error" | line_format "{{.msg}}"`
- `{namespace="demo"}` — stream selector: the indexed labels, narrows the set.
- `| json` — parse each line as JSON, exposing its fields (`level`, `msg`,
  `user`) as queryable labels *for this query only* (not indexed).
- `| level="error"` — filter on an extracted field — only possible because the
  logs are structured.
- `| line_format "{{.msg}}"` — reformat the displayed line to just the `msg`
  field. Optional prettifying.

## Hands-on exercises

Continue on the **kind** cluster with `kube-prometheus-stack` and Grafana from
modules 01-03.

1. **(WSL2) Install Loki and its agent.**
   ```bash
   helm repo add grafana https://grafana.github.io/helm-charts
   helm repo update
   helm install loki grafana/loki-stack \
     --namespace monitoring \
     --set promtail.enabled=true --set grafana.enabled=false --set loki.isDefault=false
   kubectl get pods -n monitoring | grep -E 'loki|promtail'
   ```
   Expect a `loki-0` pod and a `promtail` DaemonSet (one per node) reaching
   `Running`. This is your open-source log pipeline: Promtail tails pod logs →
   Loki stores them.

2. **(WSL2) Add Loki as a Grafana data source.** In Grafana (port-forward
   `svc/kps-grafana 3000:80` from module 03) go to **Connections → Data sources
   → Add data source → Loki**, URL `http://loki:3100`, Save & test. (Depending
   on chart versions it may already be present.)

3. **(WSL2) Deploy a structured-logging app and view its logs.** Deploy
   something that logs JSON:
   ```bash
   kubectl create namespace demo 2>/dev/null; true
   kubectl create deployment jsonlog -n demo --image=busybox -- /bin/sh -c \
     'i=0; while true; do lvl=info; [ $((i % 5)) -eq 0 ] && lvl=error; echo "{\"level\":\"$lvl\",\"msg\":\"processed\",\"order_id\":$i,\"user\":\"user-$((RANDOM%50))\"}"; i=$((i+1)); sleep 1; done'
   ```
   Wait ~30s, then in Grafana **Explore** pick the **Loki** source and run
   `{namespace="demo"}`. You should see the JSON log lines flowing — durable and
   centralized, unlike `kubectl logs`.

4. **(WSL2) Filter with a line filter.** Run
   `{namespace="demo"} |= "error"` — only the error lines. Note this is a
   substring grep over the narrowed stream (Loki's brute-force-after-label-
   narrowing model in action).

5. **(WSL2) Parse structured fields — the payoff of JSON logs.** Run
   `{namespace="demo"} | json | level="error"`. Loki parses each line as JSON
   and filters on the extracted `level` field — reliable, not fragile text
   matching. Then extract a high-cardinality field the *right* way:
   `{namespace="demo"} | json | user="user-7"` — `user` was in the log
   *content* (queryable), never a Loki label (which would've exploded the
   index). This is module 00's cardinality rule, correctly applied.

6. **(WSL2) Compute a metric from logs.** Run
   `sum(rate({namespace="demo"} |= "error" [5m]))` in Explore. Loki returns a
   *rate* — a metric derived from log lines, graphable next to your Prometheus
   panels. Note how this bridges the logs and metrics pillars (module 07 leans
   on this).

7. **Diagnose and fix: logs missing because of a label mismatch.** Run a query
   with a wrong label value and get nothing:
   `{namespace="demo", app="wrong-name"}` → no results. The bug: the stream's
   real labels don't include `app="wrong-name"`. Diagnose the real way — click
   the **label browser** in Explore (or run `{namespace="demo"}` and inspect the
   labels on a returned line) to see the *actual* labels Promtail attached
   (`namespace`, `pod`, `container`, `app`/`job` depending on config). **Fix**
   the query to use a label that exists. Lesson (identical in spirit to module
   01's ServiceMonitor selector and module 03's "No data"): **a stream selector
   that matches no labels returns nothing silently — always confirm labels
   against real streams.**

8. **(WSL2) See the labels-vs-content tradeoff concretely.** Run
   `{namespace="demo"} | json | order_id="100"`. This works but Loki had to
   scan the *content* of the whole `demo` stream to find it (no index on
   `order_id`) — fine here, slow at scale. Contrast: `{namespace="demo"}`
   narrows by *indexed* label instantly. Write one sentence on why `order_id`
   must stay content, not become a label.

9. **(WSL2) Optional — the ELK alternative.** You won't install it, but note
   the contrast: an ELK/Elasticsearch stack would full-text-index every field
   of these JSON logs, making arbitrary-word search fast but costing far more
   storage/compute. Loki chose cheap+label-scoped over fast+everywhere. In a
   sentence, note which you'd pick for a high-volume, cost-sensitive cluster
   (Loki) vs. a security-forensics use case needing arbitrary historical search
   (ELK's full-text index earns its cost).

10. **(WSL2) Leave Loki installed** for module 07's correlation work. To
    reclaim resources: `helm uninstall loki -n monitoring`.

## Independent challenge

No queries given — build them yourself using this module plus
[module 00](../00-observability-concepts-and-three-pillars/README.md) (which
data is high vs. low cardinality) and
[module 03](../03-grafana-dashboards/README.md) (Explore, panels). Take a
workload that emits **structured** logs (the `jsonlog` app, or better, make a
small app of your own log JSON with `level`, a low-cardinality `component`
field, and a high-cardinality `request_id`). First, write LogQL that answers
three questions an on-call engineer asks: (1) show only `error`-level lines
for one component, (2) count the error rate per component over 5 minutes as a
graphable metric, and (3) find every log line for one specific `request_id`.
Crucially, for each field you use, state whether it should be a **Loki label**
or stay in the **log content**, and justify it with the cardinality rule.
Then add a Grafana panel that puts the log-derived error *rate* (question 2)
next to a real Prometheus metric panel for the same app — proving logs and
metrics can share one dashboard. The skill is knowing what to index vs. what to
extract at query time, which is the entire art of using Loki well.

<details>
<summary>Stuck? One hint</summary>

Only `level` and `component` are label-worthy (small, bounded sets you slice
by); `request_id` is unbounded and must live in the log *content*, extracted at
query time with `| json | request_id="..."` — never a Loki label, for the exact
reason `user_id` is never a metric label (module 00). Question 2's "metric from
logs" is `sum by (component) (rate({namespace="demo"} | json | level="error"
[5m]))`. For the shared dashboard, add a Loki-sourced panel and a
Prometheus-sourced panel to the same Grafana board — panels can each pick their
own data source.

</details>

## Common mistakes & troubleshooting

- **Unstructured logs you can't query.** Free-text logs force fragile substring
  matching. Emit JSON/logfmt so `| json`/`| logfmt` can extract fields — this
  is an app code change, do it early.
- **High-cardinality Loki labels.** `request_id`/`user_id`/full-URL as a *Loki
  label* explodes its index — the module-00 cardinality trap, relocated. Keep
  them in the log content and extract with LogQL at query time.
- **Empty stream selector results.** A `{}` selector matching no real labels
  returns nothing silently. Use Explore's label browser to see the *actual*
  labels Promtail/Alloy attached before guessing.
- **Expecting instant search over everything.** Loki isn't full-text-indexed;
  broad, label-less content searches over huge time ranges are slow by design.
  Always narrow by label first, then filter content.
- **Installing a second Grafana.** `loki-stack` bundles Grafana; set
  `grafana.enabled=false` so you keep one Grafana wired to both Prometheus and
  Loki, not two disconnected ones.
- **Not dropping noisy logs.** Every ingested line costs storage — the same
  verbosity/cost lesson as track 07's Log Analytics. Drop or relabel noisy
  streams at the agent (Promtail/Alloy) before they hit Loki.

## Checkpoint quiz

Write down your answer to each question before expanding it — checking without attempting first is the single easiest way to fool yourself into thinking you've learned this.

<details>
<summary>Show questions</summary>

1. What does structured logging give you that a free-text log line doesn't, and
   where does high-cardinality detail like `request_id` belong?
2. Explain Loki's core design tradeoff versus a full-text (ELK) system, in one
   sentence.
3. Loki indexes labels. What does that mean for what you're allowed to put in a
   Loki label, and why?
4. What role does Promtail/Grafana Alloy play, and what Kubernetes object type
   does it run as?
5. Write the LogQL for "error-level lines in namespace demo" assuming JSON
   logs, and explain each stage.
6. LogQL can produce a metric from logs. Give an example query and say why it's
   useful for module 07.
7. A LogQL query returns nothing. What's the most likely cause and how do you
   confirm it?

</details>

<details>
<summary>Show answers</summary>

1. Structured logging emits key-value/JSON fields a machine can filter and
   extract reliably (e.g. `level="error"`, `user="bob"`) instead of fragile
   substring parsing of free text. High-cardinality detail like `request_id`
   belongs in the **log content/fields**, extracted at query time — never as an
   indexed label.
2. Loki indexes only a small set of labels and stores raw content unindexed in
   cheap object storage (cheap, label-scoped), whereas ELK full-text-indexes
   every word (fast arbitrary search, far more expensive to store and run).
3. Only low-cardinality, bounded dimensions (namespace, app, level, pod) —
   because each distinct label value creates a separate indexed stream, so a
   high-cardinality label (`request_id`) explodes Loki's index exactly like it
   would a Prometheus metric.
4. It's the collection agent: a DaemonSet (one per node) that tails each pod's
   log files, attaches Kubernetes labels, and pushes the streams to Loki — the
   open-source equivalent of the Container Insights log agent.
5. `{namespace="demo"} | json | level="error"`. Stage 1 `{namespace="demo"}` is
   the indexed stream selector (narrows the set); `| json` parses each line's
   JSON into queryable fields; `| level="error"` filters on the extracted
   `level` field.
6. e.g. `sum(rate({namespace="demo"} |= "error" [5m]))` — the per-second rate
   of error lines. It's useful because it turns logs into a graphable metric you
   can put beside real Prometheus metrics and correlate (module 07).
7. The stream selector's labels don't match any real stream (wrong label
   name/value). Confirm by opening Explore's label browser or running a bare
   `{namespace="..."}` and inspecting the actual labels attached to returned
   lines.

</details>

## Next

[05-distributed-tracing-and-opentelemetry](../05-distributed-tracing-and-opentelemetry/README.md)
— you now have two of three pillars (metrics + logs) flowing into one Grafana.
Add the third and least-familiar one: distributed traces with OpenTelemetry,
showing how a single request moves across services.
