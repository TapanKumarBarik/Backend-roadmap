# Prometheus Fundamentals

## Why this matters

In [track 07 module 06](../../07-aks/06-monitoring-aks-azure-monitor-container-insights/README.md)
you got cluster metrics by running one `az aks enable-addons` command — Azure
deployed the agent, ran the pipeline, and stored the data for you. This module
is where you do that yourself with **Prometheus**, the open-source metrics
engine that the rest of the world (and, under the hood, much of Azure Monitor)
runs on. Understanding Prometheus's **pull model**, how it discovers and
scrapes targets, and how to write basic **PromQL** is the foundation for every
metrics-based dashboard and alert you'll ever build — on any platform, not
just Azure.

## Concepts

### The pull model and the `/metrics` endpoint

Prometheus does not receive metrics; it **fetches** them. Each thing you want
to monitor exposes an HTTP endpoint (conventionally `/metrics`) that returns
its current metrics in a simple text format — you saw the API server's own
endpoint in module 00. Prometheus is configured with a list of **targets**
and, on a fixed **scrape interval** (commonly 15s or 30s), makes an HTTP GET
to each target's `/metrics`, parses the numbers, timestamps them with the
scrape time, and stores them in its local time-series database (TSDB).

This is the opposite of the push-based Azure Monitor agents. The consequences
are worth internalizing: Prometheus (the collector) controls the scrape rate,
so a misbehaving app can't flood it; a **failed scrape is itself a signal** —
Prometheus records `up == 0` for a target it couldn't reach, which is often
your first sign an app is down; and apps never need to know Prometheus's
address, they just expose an endpoint and wait to be scraped. The cost is that
Prometheus must *discover* what to scrape — which on Kubernetes it does
automatically (below).

### Exporters — metrics for things that don't speak Prometheus

Your own app can expose `/metrics` using a Prometheus client library. But the
node's kernel, a Postgres database, or a Redis instance don't. An **exporter**
is a small adapter process that reads some system's stats and re-exposes them
in Prometheus format on a `/metrics` endpoint. The essential ones you'll meet
immediately:

- **node-exporter** — runs as a DaemonSet (one per node) and exposes
  node-level CPU, memory, disk, and network metrics. This is the open-source
  equivalent of the node metrics Container Insights collected for you.
- **kube-state-metrics** — exposes the *state of Kubernetes objects
  themselves* as metrics: how many Deployments, how many Pods `Ready`, how
  many restarts, Pod phase. (Distinct from node-exporter: node-exporter is
  about the *machine*, kube-state-metrics is about the *Kubernetes API's
  view*.)
- **cAdvisor** (built into the kubelet) — per-container CPU/memory, the
  open-source counterpart to Container Insights' per-container view.

You rarely install these by hand — the Helm chart below bundles them.

### kube-prometheus-stack: the batteries-included install

Installing Prometheus, Alertmanager, Grafana, node-exporter,
kube-state-metrics, and all the wiring by hand is tedious and error-prone. The
community **`kube-prometheus-stack`** Helm chart (maintained under the
Prometheus Community project) installs the whole lot preconfigured, using the
**Prometheus Operator** — a controller that manages Prometheus via Kubernetes
custom resources instead of hand-edited config files. This is the standard way
to run Prometheus on Kubernetes and what you'll use for the entire track. One
`helm install` gives you roughly what Container Insights gave you with one
`az` command — except now *you* own the config, the retention, and the cost.

### ServiceMonitor: how the Operator learns what to scrape

With the Prometheus Operator, you don't edit Prometheus's config file to add a
scrape target. Instead you create a **ServiceMonitor** (or **PodMonitor**)
custom resource that *declaratively* says "scrape any Service matching these
labels, on this port, at this path." The Operator watches for ServiceMonitors
and regenerates Prometheus's scrape config automatically. This is the same
"declare desired state, a controller reconciles it" pattern you know from
Deployments and from Gatekeeper Constraints in
[track 11](../../11-security-deep-dive/04-policy-as-code-opa-gatekeeper/README.md)
— applied to scrape configuration. A very common beginner failure (the
diagnose-and-fix below) is a ServiceMonitor whose label selector or port name
doesn't match the Service, so the target is silently never scraped.

### PromQL, just enough to look around

**PromQL** is Prometheus's query language. This module keeps it minimal (module
02 goes deep). The three things to grasp now:

- An **instant vector selector** like `up` or
  `up{job="node-exporter"}` returns the *current* value of every matching
  series. The `{label="value"}` filter is how you narrow to specific series —
  and *exact label matching is where "my query returns nothing" bugs come
  from*.
- **`up`** is the single most useful starter query: it's `1` for every target
  Prometheus successfully scraped and `0` for every one it couldn't — an
  instant health map of your whole scrape config.
- Metrics have **types**: a **counter** only ever goes up (total requests
  ever) and is almost always wrapped in `rate()` before use (module 02); a
  **gauge** goes up and down (current memory, current temperature) and you read
  directly; a **histogram** buckets observations (request durations) for
  quantiles (module 02). Reading a raw counter's giant ever-increasing number
  is almost never what you want — recognizing counter vs. gauge now prevents
  confusion later.

## Command reference

| Command | What it does | Example |
|---|---|---|
| `helm repo add prometheus-community ...` | Adds the chart repo hosting `kube-prometheus-stack` | `helm repo add prometheus-community https://prometheus-community.github.io/helm-charts` |
| `helm repo update` | Refreshes local chart metadata | `helm repo update` |
| `helm install <name> prometheus-community/kube-prometheus-stack -n <ns>` | Installs the full stack | see exercise 1 |
| `kubectl get servicemonitors -A` | Lists all ServiceMonitors (the scrape declarations) | `kubectl get servicemonitors -A` |
| `kubectl get pods -n monitoring` | Confirms Prometheus/Grafana/exporters are running | `kubectl get pods -n monitoring` |
| `kubectl port-forward -n monitoring svc/<prom-svc> 9090` | Opens the Prometheus UI locally | see exercise 3 |
| `kubectl apply -f servicemonitor.yaml` | Adds a scrape target declaratively | see exercise 6 |

Flag-by-flag breakdown of the install command (exercise 1):

`helm install kps prometheus-community/kube-prometheus-stack --namespace monitoring --create-namespace --set prometheus.prometheusSpec.serviceMonitorSelectorNilUsesHelmValues=false`
- `kps` — the release name; every resource gets it as a prefix, so you'll see
  `kps-grafana`, `kps-kube-prometheus-stack-prometheus`, etc.
- `prometheus-community/kube-prometheus-stack` — `<repo>/<chart>`.
- `--namespace monitoring --create-namespace` — install into (and create) a
  dedicated `monitoring` namespace, the convention for this stack.
- `--set prometheus.prometheusSpec.serviceMonitorSelectorNilUsesHelmValues=false`
  — **important for this track:** by default the chart only scrapes
  ServiceMonitors carrying its own release label. Setting this to `false` tells
  Prometheus to consider *every* ServiceMonitor in the cluster, so the ones you
  write yourself in exercise 6 actually get picked up. (Without it, your custom
  ServiceMonitor is silently ignored — a classic first-time trap.)

Key PromQL forms (used in exercises, expanded in module 02):

- `up` — 1/0 health of every scrape target.
- `up{job="node-exporter"}` — narrow by the `job` label (exact match).
- `up{job=~"node.*"}` — `=~` is a **regex** match; `!=` and `!~` are the
  negations.
- `kube_pod_status_phase{phase="Running"}` — a kube-state-metrics gauge.
- `node_memory_MemAvailable_bytes` — a node-exporter gauge, bytes of available
  RAM per node.

## Hands-on exercises

All on your local **kind** cluster from
[track 03](../../03-kubernetes/README.md). Everything installs via Helm and
costs nothing. Ensure `helm` is installed (track 03 used it).

1. **(WSL2) Install `kube-prometheus-stack`.**
   ```bash
   helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
   helm repo update
   helm install kps prometheus-community/kube-prometheus-stack \
     --namespace monitoring --create-namespace \
     --set prometheus.prometheusSpec.serviceMonitorSelectorNilUsesHelmValues=false
   ```
   Wait a minute, then `kubectl get pods -n monitoring`. Expect Prometheus,
   Alertmanager, Grafana, `node-exporter` (a DaemonSet — one per node), and
   `kube-state-metrics` all reaching `Running`. You just reproduced, by hand,
   what Container Insights did with one Azure command.

2. **(WSL2) See the exporters that got installed.**
   ```bash
   kubectl get daemonset -n monitoring       # node-exporter, one pod per node
   kubectl get deploy -n monitoring          # kube-state-metrics, grafana, operator
   kubectl get servicemonitors -n monitoring # the pre-wired scrape declarations
   ```
   Note the stack shipped a dozen-plus ServiceMonitors already — it's scraping
   itself, the kubelet, the API server, etc., out of the box.

3. **(WSL2) Open the Prometheus UI.**
   ```bash
   kubectl port-forward -n monitoring svc/kps-kube-prometheus-stack-prometheus 9090:9090
   ```
   Browse to `http://localhost:9090`. Open **Status → Targets**: this is the
   live map of everything Prometheus is scraping and whether each is `UP`. This
   is the pull model made visible — every green target is one it successfully
   fetched `/metrics` from.

4. **(WSL2) Run your first PromQL.** In the Prometheus UI's **Graph** tab (or
   run these against the port-forward), evaluate:
   - `up` — every target's 1/0 health. Confirm the values match the Targets
     page.
   - `node_memory_MemAvailable_bytes` — available RAM per node (a gauge from
     node-exporter).
   - `kube_pod_status_phase{phase="Running"}` — one series per pod, `1` if in
     that phase (kube-state-metrics). Switch the filter to
     `phase="Pending"` and note most series read `0`.

5. **(WSL2) Deploy an app that exposes its own `/metrics`.** Use a sample app
   with built-in Prometheus instrumentation:
   ```bash
   kubectl create namespace demo
   kubectl create deployment metrics-app -n demo --image=quay.io/brancz/prometheus-example-app:v0.5.0
   kubectl expose deployment metrics-app -n demo --port=8080 --name=metrics-app
   kubectl port-forward -n demo svc/metrics-app 8080:8080
   ```
   In another terminal: `curl -s localhost:8080/metrics | head -30`. You'll see
   `http_requests_total{...}` and friends — a real app pull target, exactly the
   format from module 00. Generate some traffic: `for i in $(seq 20); do curl -s
   localhost:8080/ >/dev/null; done`.

6. **(WSL2) Tell Prometheus to scrape it with a ServiceMonitor.** Prometheus
   isn't scraping `metrics-app` yet — you must declare it:
   ```bash
   kubectl apply -f - <<'EOF'
   apiVersion: monitoring.coreos.com/v1
   kind: ServiceMonitor
   metadata:
     name: metrics-app
     namespace: demo
   spec:
     selector:
       matchLabels:
         app: metrics-app
     endpoints:
       - port: "8080"
         path: /metrics
         interval: 15s
   EOF
   ```
   Wait ~30s, refresh **Status → Targets** in the Prometheus UI, and look for a
   `demo/metrics-app` target turning `UP`. Then query
   `http_requests_total{namespace="demo"}` — your app's own metric, now in
   Prometheus.

7. **Diagnose and fix: a target that never scrapes because of a label
   mismatch.** This is the single most common Prometheus-on-Kubernetes bug.
   Break it deliberately:
   ```bash
   kubectl apply -f - <<'EOF'
   apiVersion: monitoring.coreos.com/v1
   kind: ServiceMonitor
   metadata:
     name: metrics-app-broken
     namespace: demo
   spec:
     selector:
       matchLabels:
         app: wrong-name        # <-- does not match the Service's label
     endpoints:
       - port: "8080"
         path: /metrics
   EOF
   ```
   Refresh **Status → Targets** — `metrics-app-broken` produces *no target at
   all* (not a red one — no entry), because its `selector.matchLabels` matches
   no Service. Diagnose it the real way:
   ```bash
   kubectl get svc metrics-app -n demo --show-labels   # what labels does the Service actually have?
   ```
   You'll see the Service's label is `app=metrics-app`, not `wrong-name`.
   **Fix** by correcting the selector to `app: metrics-app` and re-applying;
   confirm the target now appears and goes `UP`. Lesson: **a ServiceMonitor
   selector that matches nothing fails silently — no target, no error.** Always
   verify against `--show-labels`.

8. **(WSL2) Prove counter vs. gauge.** Query `http_requests_total{namespace=
   "demo"}` (a **counter**) a few times over a minute while generating traffic
   — the raw number only ever climbs, and its absolute value is meaningless on
   its own. Then query `node_memory_MemAvailable_bytes` (a **gauge**) — it goes
   up and down. Write one sentence on why you'd wrap the counter in `rate()`
   (module 02) but read the gauge directly.

9. **(WSL2) Optional AKS contrast.** If you still have an AKS cluster from
   track 07, note that you could `helm install` this exact same stack there and
   get identical PromQL — the open-source path is *cluster-portable* in a way
   Container Insights (Azure-only) is not. Don't leave an AKS cluster running;
   `az group delete` when done.

10. **(WSL2) Leave the stack installed** — modules 02-07 all build on it. If
    you must reclaim resources: `helm uninstall kps -n monitoring` and
    `kubectl delete namespace monitoring demo`.

## Independent challenge

No YAML given for the target — build it yourself using this module plus
[track 03](../../03-kubernetes/README.md) (Services, labels, selectors).
Deploy a *second* instrumented workload of your choice into a new namespace —
either another copy of the example app on a different port, or a real exporter
like the Redis exporter in front of a Redis pod — and get Prometheus scraping
it end to end by writing your own ServiceMonitor from scratch. Prove it worked
three ways: the target shows `UP` on the Targets page, `up{...}` for it returns
`1` in PromQL, and at least one of *its* application/exporter metrics returns
data. Then deliberately reproduce the module's silent-failure mode once more —
change one thing (a wrong port name, or a selector label that doesn't match) —
confirm the target *vanishes* rather than erroring, and fix it by reading the
Service's actual labels/ports. The skill being built is diagnosing "why isn't
this being scraped?" without a single error message to guide you.

<details>
<summary>Stuck? One hint</summary>

A ServiceMonitor connects to a *Service*, not directly to Pods, and everything
must line up: `spec.selector.matchLabels` must equal a label the **Service**
carries (check `kubectl get svc <name> --show-labels`), and
`spec.endpoints[].port` must equal the Service's **port name** (a string) or be
the numeric port as a string exactly as the Service declares it (`kubectl get
svc <name> -o yaml` under `spec.ports`). If either doesn't match, no target is
generated — no error is ever printed. The `serviceMonitorSelectorNilUsesHelmValues=false`
flag from exercise 1 must also be set, or Prometheus ignores ServiceMonitors
that lack its release label.

</details>

## Common mistakes & troubleshooting

- **Custom ServiceMonitor ignored entirely.** By default the chart only picks
  up ServiceMonitors with its release label. Set
  `prometheus.prometheusSpec.serviceMonitorSelectorNilUsesHelmValues=false`
  (exercise 1) or add the release label to your ServiceMonitor. Symptom: your
  target never appears, with no error.
- **Selector/port mismatch — the silent failure.** A ServiceMonitor whose
  `matchLabels` or `endpoints.port` don't match the target Service produces
  *no target at all* — not a red/down one, just nothing. Always cross-check
  with `kubectl get svc <name> --show-labels` and its `spec.ports`.
- **Confusing a down target with a missing target.** `up == 0` (red on the
  Targets page) means Prometheus *found* the target but the scrape *failed*
  (wrong port, app not listening) — a network/app problem. *No entry at all*
  means the ServiceMonitor didn't match anything — a config problem. Different
  fixes.
- **Reading a raw counter as if it were meaningful.** `http_requests_total`'s
  absolute value is "requests since the process started" and resets to 0 on
  restart. You almost always want `rate(...)` (module 02), not the raw number.
- **Expecting instant scrape.** After creating a ServiceMonitor there's a short
  delay while the Operator regenerates config and the next scrape interval
  elapses — give it 30-60s before concluding it's broken.
- **Putting high-cardinality labels on your own app's metrics.** The module 00
  warning applies to *your* instrumentation too: don't label
  `http_requests_total` with `user_id` or `request_id`. You control this in
  your app's client-library code.

## Checkpoint quiz

Write down your answer to each question before expanding it — checking without attempting first is the single easiest way to fool yourself into thinking you've learned this.

<details>
<summary>Show questions</summary>

1. Describe the pull model in one sentence. What does a *failed* scrape tell
   you that a push system wouldn't as cleanly?
2. What is an exporter, and what's the difference between node-exporter and
   kube-state-metrics?
3. What does the Prometheus Operator use a ServiceMonitor for, and why is that
   nicer than editing Prometheus's config file?
4. A ServiceMonitor you wrote produces *no target at all* — not even a down
   one. Name the two most likely causes.
5. What's the difference between `up == 0` and no target entry existing?
6. Counter vs. gauge: give an example of each and say which you'd wrap in
   `rate()`.
7. Why does the module set
   `serviceMonitorSelectorNilUsesHelmValues=false`, and what breaks without it?

</details>

<details>
<summary>Show answers</summary>

1. Prometheus periodically makes an HTTP GET to each target's `/metrics`
   endpoint and stores what it reads, rather than receiving pushed data. A
   failed scrape is recorded as `up == 0`, so "the target is unreachable/down"
   is itself a first-class metric you can alert on — a push system just sees
   *absence* of data, which is ambiguous.
2. An exporter is an adapter that reads some system's stats and re-exposes them
   in Prometheus format on a `/metrics` endpoint. node-exporter reports
   *machine/node* stats (CPU, RAM, disk of the host); kube-state-metrics
   reports the *Kubernetes API's view* of object state (Pod phases, Deployment
   replica counts, restarts).
3. A ServiceMonitor declaratively says "scrape Services matching these
   labels, on this port/path"; the Operator watches for them and regenerates
   Prometheus's scrape config automatically. It's the declarative
   controller-reconciled pattern — you add targets with `kubectl apply`, never
   by hand-editing and reloading a config file.
4. (a) The `selector.matchLabels` doesn't match any Service's labels, or the
   `endpoints.port` doesn't match the Service's port; (b) the chart is ignoring
   your ServiceMonitor because `serviceMonitorSelectorNilUsesHelmValues` wasn't
   set to false and your ServiceMonitor lacks the release label.
5. `up == 0` means Prometheus *knows about* the target but the scrape failed
   (app not listening, wrong port) — an app/network issue. No entry means the
   ServiceMonitor matched nothing — a config/selector issue. They need different
   fixes.
6. Counter: `http_requests_total` (monotonically increasing, resets on
   restart). Gauge: `node_memory_MemAvailable_bytes` (goes up and down). You
   wrap the *counter* in `rate()` to get a per-second rate; you read the gauge
   directly.
7. Because by default the chart's Prometheus only selects ServiceMonitors
   carrying its own Helm release label. Setting it false makes Prometheus
   consider every ServiceMonitor in the cluster. Without it, ServiceMonitors
   you author yourself are silently ignored and their targets never appear.

</details>

## Next

[02-promql-in-depth](../02-promql-in-depth/README.md) — now that metrics are
flowing, learn to actually query them: `rate`/`irate`, aggregation across
series, histograms and quantiles, and turning queries into recording and
alerting rules.
