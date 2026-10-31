# Grafana: Dashboards and Visualization

## Why this matters

PromQL in the Prometheus UI is fine for one-off queries, but nobody watches a
query box during an incident — they watch a **dashboard**. In
[track 07](../../07-aks/06-monitoring-aks-azure-monitor-container-insights/README.md)
the Container Insights workbooks were built and styled for you; here you build
the dashboards yourself in **Grafana**, the open-source visualization layer
that sits on top of Prometheus (and, later, Loki and Tempo — one pane of glass
for all three pillars). Learning to build a *good* dashboard — the right panels
on real PromQL, variables that make one dashboard serve many services, and
knowing when to just import a community board — is the difference between a
wall of pretty graphs and something that actually answers questions fast.

## Concepts

### Data sources — Grafana queries, it doesn't store

Grafana stores *no metrics of its own*. It's a query-and-visualize front end
that connects to **data sources**: Prometheus for metrics, Loki for logs
(module 04), Tempo for traces (module 05). The `kube-prometheus-stack` you
installed already wired Grafana to its Prometheus as the default data source,
so you can build panels immediately. The key mental model: **a Grafana panel
is a saved PromQL (or LogQL, or TraceQL) query plus a choice of how to draw
it.** Everything you learned in module 02 is what goes in the query box; this
module is about the *drawing* and the *organizing*.

### Panels and visualization types — match the viz to the question

A **panel** is one visualization of one or more queries. The type you pick
should match the *shape* of the question:

- **Time series** (line graph) — the default for anything trending over time:
  request rate, latency, CPU. 90% of panels.
- **Stat / gauge** — a single current number (or number vs. threshold): "error
  rate right now", "pods ready". Good for at-a-glance status tiles.
- **Bar gauge / table** — comparing a value *across* a label dimension (top-10
  slowest endpoints, per-namespace request counts).
- **Heatmap** — histogram buckets over time, the natural way to *see* a latency
  distribution shift (the visual counterpart to `histogram_quantile`).

Choosing a stat panel for a trend, or a giant table where a graph would do, is
the most common "technically correct but useless" dashboard mistake. Match the
viz to whether the question is "what's the trend", "what's the value now", or
"how do parts compare".

### Variables and templating — one dashboard, many targets

A dashboard hard-coded to `namespace="demo"` is useless for your other 20
namespaces. **Template variables** fix this: you define a variable like
`$namespace` whose values are populated by a query
(`label_values(kube_pod_info, namespace)`), Grafana renders a dropdown at the
top of the dashboard, and your panels use `namespace="$namespace"` instead of a
literal. Now *one* dashboard serves every namespace, switchable from a dropdown.
This is the single biggest force-multiplier in Grafana — the same "parameterize
the reusable thing" idea as a Gatekeeper ConstraintTemplate's parameters
(track 11) or a Terraform variable (track 09), applied to dashboards. Variables
can also be **multi-value** and **`All`**, and chain (a `$pod` variable filtered
by the chosen `$namespace`).

### Importing community dashboards — don't build what exists

For common systems (Kubernetes cluster health, node-exporter, NGINX, Postgres)
excellent dashboards already exist on **grafana.com/dashboards**, each with a
numeric ID you paste into Grafana's import screen. `kube-prometheus-stack` even
ships a set pre-loaded. The discipline: **import a community dashboard for
standard/off-the-shelf systems, build your own only for *your* app's custom
metrics.** Reinventing the Kubernetes-cluster dashboard by hand is wasted
effort; a dashboard for *your* business metrics (`orders_total`,
`checkout_duration`) is something only you can build. Imported dashboards also
teach you PromQL — open their panels and read the queries.

### Dashboards as code (a forward glance to GitOps)

Clicking a dashboard together in the UI is how you *learn*, but a
click-built dashboard lives only in Grafana's database and vanishes if the pod
is recreated. Grafana dashboards are ultimately **JSON**, which means they can
be version-controlled and provisioned declaratively — exactly the
config-as-code discipline from [track 10](../../10-cicd-and-gitops/README.md).
`kube-prometheus-stack` provisions its dashboards from ConfigMaps this way. You
won't do a full GitOps dashboard pipeline here, but internalize now that the
*real* home for a dashboard you care about is a JSON file in Git, not a
hand-clicked artifact in one Grafana instance — a click-built board is a draft,
not a deliverable.

## Command reference

Grafana is mostly a web UI, so this is a mix of access commands and
UI-navigation "where do I click" reference.

| Command / UI path | What it does | Example |
|---|---|---|
| `kubectl get secret ... grafana` | Retrieves the auto-generated admin password | see exercise 1 |
| `kubectl port-forward -n monitoring svc/kps-grafana 3000:80` | Opens Grafana locally | see exercise 1 |
| UI: **Connections → Data sources** | Lists/adds data sources (Prometheus is pre-wired) | — |
| UI: **Dashboards → New → New dashboard → Add visualization** | Starts a panel; pick data source, enter PromQL | exercise 3 |
| UI: **Dashboard settings → Variables** | Define template variables (`$namespace`, `$pod`) | exercise 5 |
| UI: **Dashboards → New → Import** | Import by grafana.com ID or JSON | exercise 6 |
| `label_values(metric, label)` | Grafana variable query: list a label's values | `label_values(kube_pod_info, namespace)` |

Flag-by-flag breakdown of the two commands worth dissecting:

`kubectl get secret -n monitoring kps-grafana -o jsonpath='{.data.admin-password}' | base64 -d`
- `kps-grafana` — the Secret the chart created for Grafana's admin creds.
- `-o jsonpath='{.data.admin-password}'` — extract just the password field
  (Secret data is base64).
- `| base64 -d` — decode it. The default username is `admin`.

Variable query `label_values(kube_pod_info, namespace)`
- `label_values(<metric>, <label>)` — a Grafana-specific templating function
  (not PromQL) that returns the distinct values of `<label>` across series of
  `<metric>`. Here: every namespace that has pods — the dropdown's options.
- Use `label_values(kube_pod_info{namespace="$namespace"}, pod)` for a *chained*
  `$pod` variable that only lists pods in the selected namespace.

## Hands-on exercises

Continue on the **kind** cluster with `kube-prometheus-stack`, the demo app,
and the recording rule from
[module 02](../02-promql-in-depth/README.md). Generate some traffic first so
panels have data (`for i in $(seq 500); do curl -s localhost:8080/ >/dev/null;
done` against the port-forwarded `metrics-app`).

1. **(WSL2) Log into Grafana.**
   ```bash
   kubectl get secret -n monitoring kps-grafana -o jsonpath='{.data.admin-password}' | base64 -d; echo
   kubectl port-forward -n monitoring svc/kps-grafana 3000:80
   ```
   Browse to `http://localhost:3000`, log in as `admin` with that password.

2. **(WSL2) Confirm the data source.** Go to **Connections → Data sources** and
   confirm a **Prometheus** data source exists and its **Test** button passes.
   This is the pre-wired connection; note Grafana stores nothing itself — it's
   querying the Prometheus you installed in module 01.

3. **(WSL2) Build your first panel on real PromQL.** **Dashboards → New → New
   dashboard → Add visualization**, pick the Prometheus data source, and in the
   query box enter
   `sum by (code) (rate(http_requests_total{namespace="demo"}[5m]))`. Set the
   visualization to **Time series**. You should see request rate split by
   status code — the module 02 query, now drawn. Give the panel a title
   ("Demo app request rate by status").

4. **(WSL2) Add a stat panel and a latency panel.** Add two more panels to the
   same dashboard:
   - A **Stat** panel showing current total rate:
     `sum(rate(http_requests_total{namespace="demo"}[5m]))`.
   - A **Time series** panel for p95 latency:
     `histogram_quantile(0.95, sum by (le) (rate(http_request_duration_seconds_bucket{namespace="demo"}[5m])))`.
   Save the dashboard ("Demo app"). You now have a multi-panel board on your
   own app's real metrics — a capstone requirement.

5. **(WSL2) Add a `$namespace` variable and templatize.** **Dashboard settings
   → Variables → New variable**: name `namespace`, type *Query*, data source
   Prometheus, query `label_values(kube_pod_info, namespace)`. Save. A dropdown
   appears at the top. Now edit each panel's query, replacing
   `namespace="demo"` with `namespace="$namespace"`. Switch the dropdown to
   `monitoring` and watch the panels re-target a different namespace with no
   query rewriting. This is the reusability payoff.

6. **(WSL2) Import a community dashboard.** **Dashboards → New → Import**, enter
   ID **1860** (the popular "Node Exporter Full" board), select your Prometheus
   data source, and import. Explore it — CPU, memory, disk, network per node,
   all pre-built. Open one panel's edit view and read its PromQL: you're
   learning query patterns from a board you didn't have to write. Note the
   discipline: you'd *never* hand-build this; you *would* hand-build panel 3/4's
   app-specific board.

7. **Diagnose and fix: a panel showing "No data" because of a label that
   doesn't exist.** Add a panel with a subtly wrong query:
   `sum by (code) (rate(http_requests_total{namespace="demo",status="200"}[5m]))`.
   It shows **No data**. The bug: this app labels status as **`code`**, not
   `status`, so `status="200"` matches no series. Diagnose it the real way —
   in the Prometheus UI (or Grafana's Explore), run
   `http_requests_total{namespace="demo"}` and *read the actual label names* on
   the returned series. **Fix** the query to use `code="200"`. Lesson (straight
   from module 02's "binary op returns nothing"): **"No data" is almost always
   a label name/value mismatch, not a broken data source** — verify labels
   against real series, don't guess.

8. **(WSL2) Use Explore to prototype before building panels.** Open **Explore**
   (compass icon), pick Prometheus, and iterate on a query live before
   committing it to a panel. This is the fastest debug loop — build the query in
   Explore, confirm it returns data, *then* paste it into a panel. Adopt this
   habit; it prevents the exercise-7 confusion.

9. **(WSL2) Export your dashboard as JSON.** **Dashboard settings → JSON
   Model** (or the share/export menu). Copy the JSON. This is what "dashboards
   as code" means — this file could live in Git and be provisioned
   automatically (track 10's config-as-code idea). Note it's a plain,
   version-controllable artifact, not locked inside Grafana.

## Independent challenge

No panel specs given — design the board yourself using this module plus
[module 02](../02-promql-in-depth/README.md) (the queries) and
[module 01](../01-prometheus-fundamentals/README.md) (which metrics exist).
Build a single, reusable **"service health" dashboard** for the demo app (or
any workload you scrape) with at least four panels that together answer the
questions an on-call engineer actually asks: *is it up, how much traffic, how
many errors, how slow.* Requirements: at least one panel must use a **rate**,
one must use a **ratio** (error fraction), one must show a **quantile**
(p95/p99 latency), and the whole dashboard must be driven by a **`$namespace`
template variable** so switching the dropdown re-targets every panel. Then find
and import one relevant **community dashboard** for a system you *didn't* write
(node-exporter, kube-state, or the cluster), and in a sentence justify why you
built the first board by hand but imported the second. The skill is composing a
dashboard that answers questions in the order an incident unfolds, not just
displaying whatever metrics happen to exist.

<details>
<summary>Stuck? One hint</summary>

Lay the four panels out in the order you'd read them during a page: a top
**Stat** row for "is it up / current error rate" (single numbers with
threshold coloring), then **Time series** rows below for the trends (request
rate by `code`, error ratio, p95 latency) — same layout every good RED-method
(Rate/Errors/Duration) dashboard uses. Build every query in **Explore** first
to confirm it returns data, and use `namespace="$namespace"` everywhere from
the start rather than hard-coding then retrofitting. For the variable's option
list, `label_values(kube_pod_info, namespace)` is the reusable query.

</details>

## Common mistakes & troubleshooting

- **"No data" panic.** Almost always a label name/value mismatch or a time
  range with no samples — not a broken Grafana. Verify the exact query returns
  data in **Explore**/the Prometheus UI and read the *real* label names on the
  series before assuming anything is broken.
- **Wrong visualization for the question.** A trend in a Stat panel, or a giant
  table where a graph belongs. Match the viz to "trend vs. current value vs.
  comparison across a dimension".
- **Hard-coded namespaces/labels.** A dashboard pinned to one namespace serves
  one namespace. Templatize with variables from the start — retrofitting later
  means editing every panel.
- **Rebuilding what exists.** Hand-building a Kubernetes/node-exporter
  dashboard that's a free community import is wasted effort. Import standard
  boards; hand-build only *your* app's custom metrics.
- **Treating a click-built dashboard as durable.** It lives only in Grafana's
  DB and can be lost. Export the JSON and keep the ones you care about in Git
  (dashboards as code).
- **Ignoring the data source when importing.** Community dashboards prompt for
  which Prometheus data source to bind to — pick yours, or every panel shows
  No data despite the queries being correct.

## Checkpoint quiz

Write down your answer to each question before expanding it — checking without attempting first is the single easiest way to fool yourself into thinking you've learned this.

<details>
<summary>Show questions</summary>

1. Where do Grafana's metrics actually live? What is a Grafana panel, reduced
   to its essentials?
2. Give the right visualization type for: (a) request rate over time, (b) "pods
   ready right now", (c) comparing latency across the top 10 endpoints.
3. What problem do template variables solve, and what's the Grafana function
   that populates a variable's dropdown from a label?
4. When should you import a community dashboard vs. build your own?
5. A panel shows "No data" but the data source tests fine. What's the most
   likely cause and how do you confirm it?
6. Why is a click-built dashboard considered a draft rather than a deliverable,
   and what's the durable form?
7. Why build queries in **Explore** before putting them in a panel?

</details>

<details>
<summary>Show answers</summary>

1. In the **data source** (Prometheus/Loki/Tempo) — Grafana stores no metrics
   itself; it queries and visualizes. A panel is a saved query (PromQL/LogQL/
   TraceQL) plus a choice of how to draw it.
2. (a) Time series (line graph); (b) Stat or gauge (single current number);
   (c) Bar gauge or table (comparison across a label dimension).
3. They let one dashboard serve many targets (namespaces, pods, services) via a
   dropdown instead of hard-coded labels. `label_values(<metric>, <label>)`
   populates the dropdown with that label's distinct values.
4. Import for standard/off-the-shelf systems (Kubernetes, node-exporter,
   Postgres) where a good board already exists; build your own only for *your*
   application's custom/business metrics that no community board could know
   about.
5. A label name/value mismatch in the query (or a time range with no data) —
   the query matches no series. Confirm by running the bare metric in Explore/
   the Prometheus UI and reading the *actual* label names, then fixing the
   query.
6. Because it lives only in that one Grafana instance's database and is lost if
   the pod is recreated; the durable form is the dashboard's **JSON**,
   version-controlled in Git and provisioned as code (track 10 discipline).
7. Explore is a fast live query loop — you confirm the query returns the right
   data before committing it to a panel, avoiding the "No data" confusion of
   pasting an untested query straight into a dashboard.

</details>

## Next

[04-logging-and-log-aggregation-loki](../04-logging-and-log-aggregation-loki/README.md)
— you've built out the metrics pillar end to end (collect → query → visualize).
Now add the second pillar: centralized logs with Loki, viewable in this same
Grafana, and the labels-vs-full-text tradeoff that makes Loki cheap.
