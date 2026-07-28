# Module 11: Capstone Project

## Why this matters

Every module in this track taught one dimension of operational readiness in
isolation: handle errors deliberately, manage config safely, log as a structured
stream, aggregate those logs centrally, emit metrics, trace requests across
services, alert on symptoms without fatigue, shut down gracefully, and structure
the whole thing as a 12-factor app. None of these is worth much alone. A service
with beautiful metrics but swallowed exceptions is blind to its own failures; one
with perfect logging but no graceful shutdown sheds errors on every deploy; one
that's observable but un-alertable tells you nothing until a user complains. The
gap between "my service works" and "my service is *operationally ready*" is
exactly the gap between having these capabilities *individually* and having them
work *together*, under real failure conditions.

This capstone makes you close that gap on a single real service. The point isn't
to build a large application — it's to take a *modest* FastAPI service and make it
genuinely production-ready across every dimension at once, then **prove each
property by breaking things**, not by demonstrating a happy path. Anyone can show
a dashboard when everything is green. Operational readiness is what you have when
a dependency dies, a deploy rolls out mid-request, an error rate climbs, and a
container gets SIGKILL'd — and your service handles each one visibly, safely, and
without waking anyone unnecessarily. If you can build this and defend every
choice, you've absorbed the track. If you get stuck, the module that taught the
piece is named throughout — go back and redo its exercises rather than guessing.

## The project

Build (or take an existing) FastAPI service — an "orders" or "documents" API is
plenty — and make it **operationally ready** end to end. The domain is
deliberately small so all your effort goes into the operational qualities, not
the features. It must depend on at least one **backing service** (a database) and
call at least one **flaky external dependency** (a real or simulated third-party
API — e.g. a payment or notification provider) so that failure, degradation,
retries, and tracing across a boundary all have something real to act on. Run it,
and its backing services, locally in Docker.

The deliverable is the service **plus a written "operational readiness report"**
that walks through each acceptance item with evidence (screenshots, log excerpts,
dashboard panels, PromQL, trace waterfalls) — and, crucially, evidence from the
**failure demonstrations**, not just the happy path.

### Acceptance checklist

Your build is done when all of these are true and you can *demonstrate* each —
most by deliberately causing a failure and showing the correct behaviour.

**Error handling (modules 00-01)**
- [ ] The flaky external dependency is called with **timeouts + retries with
      backoff** for transient failures, and either a **graceful fallback/degraded
      response** or a translated, propagated error when it truly fails — never a
      swallowed exception.
- [ ] A global exception handler returns **safe, correctly-shaped** error
      responses (right status code, no leaked internals/stack traces) that
      include a **correlation id** the client can quote.

**Config (modules 02-03)**
- [ ] All config comes from the **environment** via typed `Settings`; **secrets
      are `SecretStr`**; the repo passes the "could I open-source this right now?"
      test (no hardcoded credentials).
- [ ] Log level and environment are config-driven, and flipping the service to
      `DEBUG` requires **no code change or rebuild**.

**Logging (modules 04-05)**
- [ ] All logs are **structured JSON to stdout**, at deliberate levels (no crying
      wolf), with a **correlation id bound per request** and **propagated** to the
      external dependency; **no secret or PII** ever appears (a redaction
      processor proves it).
- [ ] Logs are shipped to a **central store** (Loki/ELK) and a single
      `request_id`/`trace_id` query reconstructs one request's full story.

**Metrics (module 06)**
- [ ] The service exposes `/metrics` with the full **RED** set (rate, errors,
      duration histogram) plus an **in-flight gauge**, all with **low-cardinality
      labels** (no `user_id`/`request_id` as labels), scraped by Prometheus.

**Tracing (module 07)**
- [ ] Requests are **traced with OpenTelemetry**, the trace **propagates across
      the call to the external dependency** (one distributed trace, viewable as a
      waterfall), and **log lines carry the `trace_id`** so you can pivot
      metric → trace → logs.

**Alerting (module 08)**
- [ ] There are **SLIs/SLOs** (availability + latency) with an **error budget**,
      and **multi-window burn-rate alerts** that **page only on a sustained fast
      burn** and **ticket on a slow burn** — and *nothing non-actionable pages*.
- [ ] At least three **cause** signals (CPU, restarts, pool saturation) are on a
      dashboard/ticket, explicitly **not** paging, with justification.

**Graceful shutdown (module 09)**
- [ ] On SIGTERM the service **drains in-flight requests**, flips **readiness to
      not-ready** (while **liveness keeps passing**), **cancels/awaits background
      tasks idempotently**, and **closes pools** — all within the grace period.
- [ ] Distinct **liveness** (intrinsic) and **readiness** probes exist; liveness
      does **not** check dependencies.

**12-factor (module 10)**
- [ ] The service is **stateless** (no in-memory/local-disk persistent state —
      it runs correctly as **multiple replicas** behind a load balancer), built
      **once** as an immutable image and released with per-environment config.

### Failure demonstrations (the heart of the capstone)

A green happy-path proves almost nothing this track cared about. Your report must
demonstrate the service behaving correctly *under each of these induced
failures*:

- [ ] **Kill the external dependency.** Show the request either degrades
      gracefully or fails with a safe `5xx` + correlation id; the failure is
      logged at the right level with a traceback; the error-budget burn rises but
      a brief outage does **not** page (only a sustained one does).
- [ ] **Spike the error rate deliberately.** Show the metric dashboard catch it
      (*that/when*), a trace of a failed request pinpoint the failing hop
      (*where*), and the logs for that `trace_id` explain it (*why*) — the full
      three-pillar loop on your own data.
- [ ] **Roll a deploy / `docker stop` under load.** With several requests and a
      background task in flight, show **zero dropped requests**, the in-flight
      gauge return to **zero**, work neither lost nor double-applied, and the SLO
      alert **not** fire on the routine deploy.
- [ ] **SIGKILL vs SIGTERM.** Contrast a hard kill (dropped requests, no cleanup)
      with a graceful SIGTERM (drained, cleaned up) to prove your shutdown path
      actually runs.
- [ ] **Run two/three replicas.** Show a stateful operation (a session, a
      counter, an upload) behaves identically regardless of which replica serves
      it — proving statelessness — and that it would have broken with in-memory
      state.
- [ ] **Try to leak a secret and PII.** Show a deliberate `log.info(**body)` gets
      **redacted** and that `SecretStr` renders masked.

### Hints (design, not code)

<details>
<summary>Let one correlation id be the spine of everything</summary>

The single `request_id`/`trace_id` — generated at the edge, bound to the log
context, propagated on the outbound call, stamped on every log line, and carried
as the trace id — is what ties all eight dimensions into one system. It's how a
metric spike leads to a trace leads to the exact logs; how a client's error
response leads back to the server-side traceback; how one request's story
survives across services and central storage. If you build nothing else first,
build the correlation-id backbone (module 05 + 07), because every other property
plugs into it. When a piece feels disconnected, the fix is almost always "make it
carry / read the shared id."

</details>

<details>
<summary>Where each property has to live</summary>

Map each capability to its natural home so they compose instead of tangle:
error handling and correlation-id binding in **middleware + a global handler**;
config in a **`Settings` object** injected at startup; logging setup + redaction
in **one `configure_logging` call**; metrics in **middleware** (RED) + a few
business counters; tracing via **auto-instrumentation** (FastAPI + the HTTP
client) so spans and propagation are mostly free; alerting as **PromQL rules +
Alertmanager routing** (config, not app code); graceful shutdown in the
**`lifespan`** block + probe endpoints; statelessness by pushing every piece of
state into a **backing service**. Notice most of this is cross-cutting
(middleware, lifespan, config) — operational readiness is largely built *around*
your handlers, not inside them, which is why a small domain suffices.

</details>

<details>
<summary>Design the alerts backward from the SLO</summary>

Don't start from "what can I measure?" — start from "what promise am I making to
users?" Pick an availability SLO (e.g. 99.9%) and a latency SLO (e.g. 99% under
300ms), derive the error budgets, and let *every* paging decision fall out of
"are we burning that budget too fast?" (the multi-window burn-rate rule). Then
the cause signals (CPU, restarts, pool saturation) obviously become
dashboard/ticket items, because none of them directly means "the promise to users
is breaking." If you find yourself wanting to page on a cause, ask the litmus
test — *user hurt? human must act now?* — and it'll almost always demote itself.

</details>

<details>
<summary>Prove it by breaking it — script the failures</summary>

The failure demonstrations *are* the capstone, so make them repeatable: a small
script or set of commands that kills the dependency, injects errors, `docker
stop`s under load, sends SIGKILL vs SIGTERM, and scales replicas — each paired
with the evidence it produces. Idempotency is what lets several of these be safe
(cancel a background task mid-flight; retry a failed external call) — the same
property from module 00 that made retries safe makes interruption and redelivery
safe. A demonstration that only ever shows green has skipped the entire subject:
readiness is defined by behaviour under failure.

</details>

## Further reading & sources

- [Google SRE Book](https://sre.google/sre-book/table-of-contents/) - the foundational text tying together SLOs, error budgets, alerting, and operational readiness across this whole track.
- [The Twelve-Factor App](https://12factor.net/) - the checklist to audit your capstone service against for portability, statelessness, and disposability.
- [OpenTelemetry documentation](https://opentelemetry.io/docs/) - the one instrumentation layer that produces the traces, metrics, and correlated logs the capstone integrates.
- [Prometheus documentation](https://prometheus.io/docs/) - metrics, PromQL, and the alerting rules behind the RED metrics and burn-rate alerts.
- [Grafana documentation](https://grafana.com/docs/grafana/latest/) - the single pane of glass over Loki logs, Prometheus metrics, and Tempo/Jaeger traces for the failure demonstrations.
- [FastAPI documentation](https://fastapi.tiangolo.com/) - the framework reference for the middleware, lifespan, and exception handlers the operational qualities are built around.

## Next

You've completed **08-observability-and-operational-readiness**. Your services can
now fail *visibly and safely*, be understood through logs, metrics, and traces,
alert their operators without crying wolf, survive routine deploys and restarts
without shedding work, and follow the 12-factor discipline that lets a platform
run and scale them freely — the difference between code that works and code that's
ready to operate.

Back to the track index: [../README.md](../README.md)

The next track in the curriculum is
[../../09-security-deep-dive/README.md](../../09-security-deep-dive/README.md) — a
shift from *operating* a service safely to *defending* it: OWASP-class attacks,
real rate limiting, and secure-by-design principles. Much of what you built here
(structured logs, correlation ids, alerting) becomes the detection layer for the
attacks that track teaches you to prevent.
