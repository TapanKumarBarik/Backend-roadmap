# Capstone Project: A Fully Observable System, End to End

## Why this matters

Every module in this track added one capability in isolation — Prometheus
scraping, PromQL, a Grafana dashboard, Loki logs, OpenTelemetry traces,
Alertmanager, and finally correlation. Real observability is none of those
alone; it's **all three pillars flowing from one real application, wired
together so that when something breaks you can move from *that it broke* to
*what broke* to *where it broke* in minutes.** This capstone is where you prove
you can stand up that whole stack yourself — the vendor-neutral counterpart to
the one-command Container Insights you enabled in
[track 07](../../07-aks/06-monitoring-aks-azure-monitor-container-insights/README.md),
except now you own every piece: the scrape config, the dashboards, the log
pipeline, the tracing, the alert routing, and the correlation glue. There's no
solution given and no quiz. Finishing this is what "you can make a system
observable" means: you instrument it, you watch it, and you can debug it across
all three pillars when it misbehaves.

## The project

Take a **two-service** application (reuse the frontend→backend pair from
[module 05](../05-distributed-tracing-and-opentelemetry/README.md), an app from
the Docker/Kubernetes tracks, or write a trivial pair where a request to the
first triggers a call to the second) and make it **fully observable** on your
**kind** cluster: scraped for metrics, dashboarded, logging to Loki, traced
across both services with OpenTelemetry, alerting through Alertmanager, and
correlatable by trace ID across all three pillars. Everything installs via Helm
and costs nothing; you may optionally reproduce it on an **AKS** cluster from
track 07 to contrast with Container Insights, but clean that up with
`az group delete` when done.

The six required pillars, each drawing on a specific module:

1. **Prometheus scraping a real app** (modules 01-02) — both services expose a
   `/metrics` endpoint, and a **ServiceMonitor you wrote** gets them scraped so
   their targets show `UP` and their own application metrics (request count,
   duration histogram) return data in PromQL. No metric may carry a
   high-cardinality label (`user_id`, `request_id`, `trace_id`).
2. **A Grafana dashboard with at least two panels on real PromQL** (module 03)
   — built by hand on *your app's* metrics (not just an imported community
   board), driven by a `$namespace` (or `$service`) **template variable**, and
   including at minimum a **rate** panel and a **quantile** (p95/p99 latency)
   panel. At least one panel must use an aggregation with `by`.
3. **Loki collecting that app's logs** (module 04) — both services emit
   **structured (JSON)** logs shipped to Loki by the agent, queryable in
   Grafana with LogQL, and — critically — each log line includes the request's
   **`trace_id`** in its content (never as a Loki label).
4. **OpenTelemetry tracing across at least two services** (module 05) — a
   request through the frontend produces **one joined trace** whose backend span
   is correctly nested under the frontend span (proving trace context
   propagated), visible as a waterfall in Tempo (or Jaeger), routed through an
   OTel Collector.
5. **An Alertmanager rule that actually fires under a simulated condition**
   (modules 02, 06) — a **symptom-based** alerting rule (e.g. error ratio or
   latency) with a `severity` label, a `for:` duration, and Alertmanager
   **routing + grouping**, which you **force to fire** by simulating the
   condition and watch travel `Inactive → Pending → Firing → routed → delivered`
   to a receiver you can observe.
6. **A written correlation note** (module 07) for a specific incident scenario —
   use: *"the checkout error-ratio alert just fired — walk me from the alert to
   the root-cause span."* The note must give the ordered path (metric → logs →
   trace), the exact query at each step, which pillar answers *that / what /
   where*, and how the **`trace_id`** joins them.

### Acceptance checklist

Work isn't done until you can demonstrate every one of these:

- [ ] Both services expose `/metrics`; a **ServiceMonitor you authored** makes
      each target show `UP` on the Prometheus **Status → Targets** page (not
      missing, not `up == 0`).
- [ ] Your app's own metrics return data in PromQL (a counter wrapped in
      `rate()` and a `*_bucket` histogram usable by `histogram_quantile`), and
      **no metric carries a high-cardinality label** — you can point at your
      metrics and justify every label as bounded.
- [ ] A hand-built Grafana dashboard has **≥ 2 panels on your app's real
      PromQL**, including a rate panel and a p95/p99 quantile panel (with
      `sum by (le)`), and a working **`$namespace`/`$service` variable** that
      re-targets every panel from a dropdown.
- [ ] Both services log **structured JSON** to Loki; a LogQL query
      (`{...} | json | level="error"`) returns their error lines, and each line
      contains the **`trace_id`** in its content (confirmed with
      `| json | trace_id="<id>"`).
- [ ] A request through the frontend produces **one joined trace** in Tempo/
      Jaeger with the backend span nested under the frontend span; you can show
      that breaking propagation splits it into two traces and fixing it rejoins
      them.
- [ ] An **alerting rule** (symptom-based, with `severity` + `for:`) is loaded
      by the Operator, and you **forced it to fire** — demonstrated the full
      transition and its **delivery to a receiver** via Alertmanager, with
      `group_by` set so a multi-pod incident is **one** notification.
- [ ] You can take **one `trace_id`** and find the *same string* in all
      available pillars — the Tempo trace, the Loki logs of **both** services,
      and (if exemplars are wired) as a marker on the metric graph — proving the
      three pillars are genuinely joined, not just co-installed.
- [ ] The written **correlation note** exists, is scenario-specific, lists the
      metric → log → trace steps **in order** with the exact query per step, and
      names which pillar tells you *that / what / where*.
- [ ] At least one **diagnose-and-fix** from the track is reproducible on your
      system: you can deliberately break one link (a ServiceMonitor selector, a
      LogQL label, trace propagation, an alert-routing label, or a derived-field
      regex) and show it fails *silently*, then fix it.
- [ ] If you built on AKS, all billable resources are cleaned up with
      `az group delete`.

### Hints (not a solution)

- **Sequence it the way the track was ordered.** Get metrics flowing and
  scraped first (you can't dashboard or alert on data you don't have), then
  build the dashboard, then add Loki logs, then tracing, then the alert, then
  write the correlation note **last** — by then you understand the system well
  enough to write a good one.
- **Reuse what you already installed.** `kube-prometheus-stack` (modules 01-03),
  Loki + agent (module 04), Tempo + OTel Collector (module 05) are all still on
  your kind cluster if you didn't uninstall them. This capstone is mostly
  *wiring your app into* that existing stack, not reinstalling it.
- **Respect cardinality everywhere — it's what makes correlation work.** The
  `trace_id` and `user_id` go in log content and span attributes, *never* in a
  metric label or a Loki index label (modules 00/04/05). The payoff is module
  07's clickable metric → log → trace loop; you only get it if you kept the
  identifiers out of the indexes.
- **Test the bad path, not just the good one.** For every pillar, the real proof
  is a *silent failure fixed*: a ServiceMonitor that matches nothing (no
  target), a LogQL selector that returns nothing, a trace that splits in two, an
  alert that fires into the void because its label matches no route, a
  derived-field regex that captures nothing. "It worked first try" usually means
  you didn't test the failure mode the track kept warning you about.
- **Force the alert; don't wait for it.** Simulate the condition (drive 5xx
  traffic, or temporarily lower the threshold to what current traffic exceeds)
  so you *watch* it fire and route — an alert you've never seen fire is a guess
  (module 06's never-fires trap, and module 02's).
- **Make the correlation note real, not aspirational.** Actually walk one
  reproducible error from alert to root-cause span, copy the real queries and
  the real `trace_id` you followed, and write down which pillar gave you which
  fact. That lived investigation is the deliverable — it's exactly what you'd
  paste into an incident review.
- **Don't gold-plate.** Six pillars that genuinely connect beat a dozen
  half-wired dashboards. Depth on each acceptance item — especially the
  end-to-end trace-ID join — is the goal, not breadth.

## Next

**Before you move on:** if any acceptance item is checked only because "it
installed without error," go back and prove it the hard way — show the target
actually `UP`, the panel actually drawing your app's PromQL, the trace actually
joined across both services, the alert actually delivered to a receiver, and
one `trace_id` actually found in all three pillars. A pillar you haven't seen
*hand off to the next one* is a pillar you haven't verified. When every box is
genuinely ticked — and you can start from a firing alert and reach the
root-cause span by following one trace ID — you've finished the track: you can
stand up metrics, logs, and traces on any platform, wire them together, and
debug across all three, no managed monitoring add-on required.

This track built the *visibility*. Two later tracks build directly on it:

- [13-service-mesh](../../13-service-mesh/README.md) adds **mesh-level
  observability** on top of everything here — a service mesh (Istio/Linkerd)
  auto-generates the golden request metrics and distributed traces for
  service-to-service traffic *without* you instrumenting each app, and ships
  them straight into the same Prometheus/Grafana/Tempo you just stood up. The
  three-pillar foundation you built is exactly what the mesh plugs into.
- [20-sre-practices](../../20-sre-practices/README.md) formalizes **SLOs and
  error budgets** on top of these same metrics — the p95/p99 latency and error
  ratios you graphed and alerted on here become the SLIs behind formal service
  objectives, and the "alert on symptoms, not causes" discipline from module 06
  becomes the basis of SLO-based alerting and error-budget policy.

You now have the foundation both of those build on.

[Back to the track index](../README.md) · [Back to main curriculum](../../README.md)
