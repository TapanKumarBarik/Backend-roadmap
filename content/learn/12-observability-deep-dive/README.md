# Track 12: Observability Deep Dive

You've already met monitoring twice in this curriculum, and both times it
was **Azure-native and largely managed for you**. In
[07-aks](../07-aks/README.md) module 06 you enabled **Container Insights**
with one `az aks enable-addons` command and queried the collected data with
**KQL** in a **Log Analytics** workspace. In
[06-azure-container-apps](../06-azure-container-apps/README.md) module 07 you
did the same thing for Container Apps — console/system logs and Azure Monitor
metrics flowing into a workspace, with alerts wired through action groups.
In both cases Azure ran the agents, owned the pipeline, and handed you a
query box. This track is the **other half of that story**: the open-source,
vendor-neutral tooling those managed services are built on top of, that you
install and configure yourself, and that transfers to *any* platform — not
just Azure.

The point isn't to throw away Container Insights. It's to understand what a
metrics database, a log aggregator, and a tracing pipeline actually *are*, so
that when you hit a platform without a managed monitoring add-on (a
non-Azure cloud, an on-prem cluster, a customer's environment), or when the
managed product's opinions don't fit, you can stand up **Prometheus,
Grafana, Loki, and OpenTelemetry** yourself and get the same three signals —
metrics, logs, and traces — flowing.

This is a genuine deep dive across the **three pillars of observability**:
**metrics** (Prometheus and PromQL — what's measurable and countable),
**logs** (Loki — what happened, in text), and **traces** (OpenTelemetry and
Tempo/Jaeger — how a single request moved across services). It ends where
the real payoff is: **correlating all three** so a metric spike leads you to
the exact logs and the exact trace behind it.

> **Cost note:** unlike tracks 05-07, most of this track runs on your **local
> kind cluster** from [03-kubernetes](../03-kubernetes/README.md) — Prometheus,
> Grafana, Loki, Tempo, and an OpenTelemetry Collector all install via Helm
> and cost nothing. A couple of exercises optionally point the same tooling at
> an **AKS** cluster to contrast the open-source stack with Container Insights;
> if you spin up AKS for those, clean it up with `az group delete` when you're
> done, exactly as track 07 drilled into you.

## How this track works

- Go in order — module 00 frames the three pillars, 01-02 build the metrics
  pillar (Prometheus + PromQL), 03 visualizes it (Grafana), 04 adds logs, 05
  adds traces, 06 adds alerting, and 07 ties all three together. The capstone
  integrates everything.
- Every module (except this index and the capstone) follows the same shape:
  **Why this matters → Concepts → Command reference → Hands-on exercises →
  Independent challenge → Common mistakes & troubleshooting → Checkpoint quiz
  → Next**. Two modules (02 and 05) also carry a **Cumulative review**.
- Exercises use real tools on a real cluster: `kube-prometheus-stack` via
  Helm, real PromQL against real scraped targets, Loki collecting real pod
  logs, a real OpenTelemetry-instrumented app emitting real spans, and an
  Alertmanager rule that actually fires under a simulated condition. Several
  modules include a deliberate **diagnose-and-fix** (a target that isn't
  scraping, a query returning no data, a missing span, an alert that never
  fires).
- Module 08 is a capstone with no quiz or challenge — it asks you to combine
  a scraped app, a Grafana dashboard, Loki logs, cross-service tracing, a
  firing alert, and a written correlation plan into one coherent observable
  system.

## Modules

| # | Module | What it covers | Rough time |
|---|--------|-----------------|------------|
| 00 | [observability-concepts-and-three-pillars](00-observability-concepts-and-three-pillars/README.md) | Metrics vs. logs vs. traces, monitoring vs. observability, cardinality, what each pillar is good and bad at | 45-60 min |
| 01 | [prometheus-fundamentals](01-prometheus-fundamentals/README.md) | The pull model, exporters, `kube-prometheus-stack` via Helm, ServiceMonitors, first PromQL, the target-scraping mental model | 75-90 min |
| 02 | [promql-in-depth](02-promql-in-depth/README.md) | `rate`/`irate`, aggregation and `by`/`without`, histograms and quantiles, recording rules, alerting rules | 90 min |
| 03 | [grafana-dashboards](03-grafana-dashboards/README.md) | Data sources, building panels on real PromQL, variables/templating, importing community dashboards | 75-90 min |
| 04 | [logging-and-log-aggregation-loki](04-logging-and-log-aggregation-loki/README.md) | Structured logging, Loki + Promtail/Alloy, labels vs. full-text indexing, LogQL, the ELK alternative | 90 min |
| 05 | [distributed-tracing-and-opentelemetry](05-distributed-tracing-and-opentelemetry/README.md) | Spans, trace context propagation, instrumenting an app, the OTel Collector, viewing traces in Tempo/Jaeger | 90-120 min |
| 06 | [alerting-and-on-call-basics](06-alerting-and-on-call-basics/README.md) | Alertmanager routing/grouping/silencing, good vs. noisy alerts, alert fatigue, on-call hygiene | 75-90 min |
| 07 | [correlating-the-three-pillars](07-correlating-the-three-pillars/README.md) | Trace IDs in logs, exemplars, metric → log → trace navigation in Grafana, the actual payoff | 75-90 min |
| 08 | [capstone-project](08-capstone-project/README.md) | End-to-end: scraped app, Grafana dashboard, Loki logs, cross-service tracing, a firing alert, a written correlation plan | 4-6 hours |

## Prerequisites

- Everything from [03-kubernetes](../03-kubernetes/README.md): comfortable
  with `kubectl`, Deployments, Services, namespaces, port-forwarding, and
  Helm on a local kind cluster. This track installs everything with Helm and
  inspects it with `kubectl`.
- Familiarity from [07-aks](../07-aks/README.md) module 06 and
  [06-azure-container-apps](../06-azure-container-apps/README.md) module 07
  with the *managed* side of monitoring — Container Insights, Log Analytics,
  KQL, Azure Monitor metrics and alerts. This track is the open-source
  counterpart and repeatedly contrasts itself with what those already did for
  you, so it helps to remember them.
- Useful but not required: [10-cicd-and-gitops](../10-cicd-and-gitops/README.md)
  (you'll think about where alerting fits in a pipeline) and
  [11-security-deep-dive](../11-security-deep-dive/README.md) module 07
  (incident response — this track is where the detection signals it leaned on
  actually get collected).
- An Azure subscription is optional here — only the two AKS-contrast
  exercises use it.

[Back to main curriculum](../README.md)

Start here → [00-observability-concepts-and-three-pillars/README.md](00-observability-concepts-and-three-pillars/README.md)
