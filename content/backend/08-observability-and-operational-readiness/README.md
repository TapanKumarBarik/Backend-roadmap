# 08 - Observability and Operational Readiness

This track is about the gap between "my service works" and "my service is ready
to *operate* in production." A backend that runs on your machine and passes its
tests is only half-built; the other half is everything that decides whether it
survives contact with real traffic, real failures, and real deploys — how it
handles errors, where its config and secrets come from, whether you can *see*
what it's doing when it misbehaves at 3am, whether it tells you about problems
without drowning you in noise, and whether it stops cleanly when the platform
tells it to. These are the disciplines that separate code that works from code
that's genuinely production-ready, and they're the daily bread of backend
engineering once something you built is actually being used.

## How this track works

- It assumes you've finished **track 02 (API Layer and Request Handling)** —
  you're comfortable with FastAPI, request handlers, middleware, and dependency
  injection — since every module instruments, configures, or hardens a FastAPI
  app. Later modules lean lightly on the reliability disciplines from **track 06
  (Background Processing)** (idempotency, retries, connection cleanup).
- The track has an arc: it opens with **error handling and config** (the
  foundations of a service that fails safely and is configured cleanly), moves
  through the **three pillars of observability** — logging, metrics, tracing —
  then **alerting** on top of them, and closes with the **operational lifecycle**:
  graceful shutdown and the 12-factor methodology that ties it all together. Go
  in order; each module builds on the ones before it and the capstone integrates
  all of them.
- Each standard module README has the same shape: why it matters, concepts, a
  command reference with real Python/FastAPI code, progressive hands-on exercises
  (do them — including a "diagnose and fix" scenario each), an independent
  challenge with no code, common mistakes, and a checkpoint quiz. Modules 05 and
  08 also carry a closed-book **cumulative review** spanning everything so far.
- All exercises run locally against Postgres, Redis, and the observability stack
  (Prometheus, Grafana, Loki, Jaeger/Tempo, an OpenTelemetry Collector) in
  Docker — no cloud account required.

## Modules

| # | Module | What you'll be able to do | Time |
|---|--------|---------------------------|------|
| 00 | [Error handling strategies](00-error-handling-strategies/README.md) | Choose deliberately between fail-fast, fail-safe, and propagate; retry transient failures; and stop swallowing exceptions | 60-90 min |
| 01 | [Global error handlers and user-facing errors](01-global-error-handlers-and-user-facing-errors/README.md) | Centralize error handling into safe, correctly-shaped responses that never leak internals and always carry a correlation id | 60-90 min |
| 02 | [Config management fundamentals](02-config-management-fundamentals/README.md) | Separate config from code, type and validate it with pydantic-settings, and reason about dev/prod parity | 60-90 min |
| 03 | [Config sources and secrets](03-config-sources-and-secrets/README.md) | Layer config from env/files/secret stores and keep secrets out of code, logs, and error responses with SecretStr | 60-90 min |
| 04 | [Logging fundamentals](04-logging-fundamentals/README.md) | Produce clean, structured, correctly-leveled logs with structlog, bound per-request context, and zero leaked secrets | 75-100 min |
| 05 | [Centralized logging and best practices](05-centralized-logging-and-best-practices/README.md) | Ship logs to a central store, correlate a request across services, control volume with sampling, and enforce the sensitive-data rules | 75-100 min |
| 06 | [Monitoring and metrics](06-monitoring-and-metrics/README.md) | Instrument a FastAPI app with Prometheus counters/gauges/histograms, apply RED, and avoid the cardinality explosion | 75-100 min |
| 07 | [The three pillars of observability](07-the-three-pillars-of-observability/README.md) | Add distributed tracing with OpenTelemetry and pivot metric → trace → logs by one correlation id to debug a real problem | 75-100 min |
| 08 | [Alerting without fatigue](08-alerting-without-fatigue/README.md) | Define SLIs/SLOs and error budgets, write multi-window burn-rate alerts, and page only on actionable symptoms | 75-100 min |
| 09 | [Graceful shutdown](09-graceful-shutdown/README.md) | Handle SIGTERM, drain in-flight requests, clean up pools/tasks, and get readiness vs liveness probes right during shutdown | 60-90 min |
| 10 | [The 12-factor app](10-the-12-factor-app/README.md) | Audit and refactor a FastAPI service against the twelve factors — stateless, config-in-env, logs-as-streams, disposable | 60-90 min |
| 11 | [Capstone project](11-capstone-project/README.md) | Take one service from "it runs" to operationally ready across all eight dimensions and prove each property under induced failure | 4-6 hrs |

Start here → [00-error-handling-strategies/README.md](00-error-handling-strategies/README.md)

Back to the master index: [../README.md](../README.md)

---

Once you've completed this track, the next one is
**09-security-deep-dive** — a shift from *operating* a service safely to
*defending* it: OWASP-class attacks, real rate limiting, and secure-by-design
principles, where the structured logs, correlation ids, and alerting you built
here become the detection layer.
