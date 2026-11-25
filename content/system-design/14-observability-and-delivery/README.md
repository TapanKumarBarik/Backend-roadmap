# Track: Observability and Delivery

Logs, metrics, traces, structured logging, alerting, canaries, feature flags and shipping safely.

Part of **Phase 5** on the [YouTube playlist](https://www.youtube.com/playlist?list=PLNdzHik9GD0I). Every lecture pairs a spoken walkthrough with a full 16-section written deep dive: architecture diagrams, mathematical models, 4-language production code tabs (`Go`, `TypeScript`, `Python`, `C#`), CLI verification workflows, 12 interview Q&As, and a one-page cheat sheet.

## How this track works

- Watch on YouTube (or from the site Videos page) first if you want the spoken version.
- Related deep modules elsewhere on the site (Backend, Learn, GenAI) may already host the same video beside a longer lesson. This track is the System Design short-lecture home for the same ideas.
- Practise live outage diagnosis in the [Production Incident Troubleshooting & RCA Simulator](/tools/incident-debugger/).

## Lectures

| # | Lecture | What you'll be able to do | Status |
|---|---------|---------------------------|--------|
| 01 | [Observability vs Monitoring: Logs, Metrics, Traces & Cardinality](01-observability-vs-monitoring/README.md) | Distinguish known-unknown monitoring from high-cardinality unknown-unknown observability | **Live** |
| 02 | [Structured Logging: JSON Logs, Levels, Context & What Never to Log](02-structured-logging/README.md) | Emit machine-parseable JSON logs with correlation context while redacting PII and secrets | **Live** |
| 03 | [Metrics Design: Counters, Gauges, Histograms, RED/USE & Cardinality](03-metrics-design/README.md) | Pick the right Prometheus metric types, apply RED/USE, and prevent cardinality explosions | **Live** |
| 04 | [Prometheus & Grafana: Scraping, PromQL, Alertmanager & p99 Panels](04-prometheus-grafana/README.md) | Write accurate `rate()` and `histogram_quantile()` PromQL queries and build p99 dashboards | **Live** |
| 05 | [Distributed Tracing Deep Dive: Spans, Head vs Tail Sampling, Backends](05-distributed-tracing-deep-dive/README.md) | Instrument spans and choose between head-based and error-preserving tail-based sampling | **Live** |
| 06 | [OpenTelemetry Explained: SDKs, Collector and OTLP (No Vendor Lock-In)](06-opentelemetry-explained/README.md) | Deploy vendor-neutral OTel SDKs and Collectors with OTLP pipelines | **Live** |
| 07 | [Correlation and Trace IDs: Follow One Request Through Every Log](07-correlation-and-trace-ids/README.md) | Propagate `traceparent` across HTTP, gRPC, and queues to link logs, metrics, and traces | **Live** |
| 08 | [Log Aggregation at Scale: Fluent Bit, Loki vs ELK and Controlling Costs](08-log-aggregation-at-scale/README.md) | Architect high-volume log pipelines comparing Loki label indexing vs Elasticsearch | **Live** |
| 09 | [What Makes a Good Alert? Symptoms, SLO Burn Rates and Runbooks](09-what-makes-a-good-alert-symptoms-slo-burn-rates-and-runbooks/README.md) | Replace noisy threshold pages with symptom-based SLO burn-rate alerts and runbooks | **Live** |
| 10 | [Health Endpoints Done Right: /live vs /ready vs /health](10-health-endpoints-done-right/README.md) | Separate `/live` from `/ready` so transient dependency blips never cause crash loops | **Live** |
| 11 | [Root-Cause Analysis: Debug Incidents You've Never Seen (5 Whys)](11-root-cause-analysis/README.md) | Run structured hypothesis-driven debugging and blameless 5-Whys RCA | **Live** |
| 12 | [Incident Management: SEV Levels, Incident Commander & Postmortems](12-incident-management/README.md) | Coordinate SEV-1/SEV-2 response roles (IC, Comms, Ops) and blameless postmortems | **Live** |
| 13 | [Capacity Planning: Saturation, Quotas, Forecasting & Headroom](13-capacity-planning/README.md) | Forecast saturation cliffs, size N+2 headroom, and run load tests before peak events | **Live** |
| 14 | [CI/CD Pipelines: Build Once, Test, Scan, Promote & Roll Back](14-ci-cd-pipelines/README.md) | Build immutable digest-pinned artifacts once and promote safely across environments | **Live** |
| 15 | [Rolling Deployments: maxSurge, maxUnavailable & Version Skew](15-rolling-deployments/README.md) | Configure Kubernetes `maxSurge`/`maxUnavailable` and handle N / N-1 schema version skew | **Live** |
| 16 | [Blue-Green Deployments: Instant Cutover, Instant Rollback, Safe DB](16-blue-green-deployments/README.md) | Execute zero-downtime blue-green cutovers with expand-contract database migrations | **Live** |
| 17 | [Canary Deployments: Ship to 1% First, Roll Back Automatically](17-canary-deployments/README.md) | Progressively shift traffic (1% → 10% → 50% → 100%) with automated SLO rollback gates | **Live** |
| 18 | [Feature Flags: Kill Switches, Targeting and Flag Debt](18-feature-flags/README.md) | Decouple deployment from release using kill switches, percentage rollouts, and flag hygiene | **Live** |

Start here → [Observability vs Monitoring: Logs, Metrics, Traces & Cardinality](01-observability-vs-monitoring/README.md)

Back to the course index: [../README.md](../README.md)
