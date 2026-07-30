# Observability for APIs

## Why this matters

You can't run an API product you can't see. APIM answers questions raw ingress
never could: which consumer is calling how often, what's the p95 latency per
operation, which API is throwing 5xx, and — crucially — is a failure *the
gateway's* fault or the *backend's*? This module wires APIM into the same
observability world you built in track 12 (Application Insights / Azure Monitor)
so an APIM request and its backend's trace are two ends of **one** correlated
story. And the analytics you light up here are exactly what the next track (SRE)
turns into SLOs.

## Concepts

### Three layers of APIM observability

APIM gives you telemetry at three levels, from coarse to fine:

- **Built-in analytics** — dashboards in the Azure Portal (and via the API)
  showing calls, data, latency, top APIs/products/operations, and per-consumer
  usage over time. Zero setup; great for "who's using what, how much."
- **Azure Monitor metrics** — numeric time series (Requests, Capacity, backend
  duration, etc.) you can chart and **alert** on — the same Azure Monitor metrics/
  alerts model from track 06 (Container Apps monitoring) and track 07 (Container
  Insights).
- **Diagnostic logs + Application Insights** — per-request **traces** (one record
  per call, with policy timing, backend time, status, and the ability to
  correlate to the backend's own telemetry). This is the rich layer and the one
  that ties into track 12's distributed tracing.

You choose the layer by the question: usage → analytics; alerting on a trend →
metrics; debugging a single request end to end → App Insights.

### Gateway time vs. backend time: whose fault is the latency?

The most valuable thing APIM logging tells you that a backend log can't: it
splits total latency into **gateway/policy time** and **backend time**. Every
APIM request record carries the **total duration** and the **backend duration**;
subtract and you get the time spent *inside APIM* (policy evaluation, including a
slow `validate-jwt` JWKS fetch or an expensive transformation). So when p95 spikes
you can immediately say "the backend got slow" vs. "our policy pipeline got slow"
— a distinction you'd otherwise argue about. This is the API-edge version of the
"where did the time go" question distributed tracing answers in track 12.

### Correlating APIM with the backend (track 12 tie-in)

Integrate APIM with **Application Insights** and each gateway request becomes a
telemetry item with an **operation/correlation id**. If your backend Container App
is *also* instrumented with App Insights / OpenTelemetry (track 12), APIM
**propagates the correlation headers** (e.g. `Request-Id`/`traceparent`) to the
backend, so the gateway span and the backend spans join into **one distributed
trace**. You click a slow APIM request and follow it straight into the backend's
work — the exact end-to-end trace track 12 taught you to read, now starting one
hop earlier at the gateway. Without this, APIM logs and backend logs are two
disconnected islands and you correlate by eyeballing timestamps.

### Sampling, verbosity, and cost

App Insights ingestion is billed by data volume, and a busy gateway generates a
lot. Two levers keep it sane: **sampling** (log a percentage of requests — e.g.
100% while debugging, a few percent in steady state) and **verbosity** (how much
of each request/response — headers, body bytes — you capture). Logging full
request/response bodies at 100% is both a **cost** and a **privacy** problem
(you'll capture tokens, PII). The default posture: modest sampling, headers not
bodies, raise verbosity temporarily when investigating. This is the same
"observability isn't free — sample deliberately" lesson from track 12, applied to
the gateway.

### Metrics worth alerting on

A few APIM signals are worth wiring to alerts (Azure Monitor, as in tracks 06/07):
the **5xx rate** (backend or gateway failures), **overall latency** (p95/p99),
**unauthorized/failed-auth rate** (a spike can mean a broken `validate-jwt` config
*or* an attack), and **capacity** on classic tiers (approaching the tier's limit —
also a cost/scale signal). These are the raw materials the SRE track (20) turns
into SLIs and error budgets — "99.9% of requests succeed under 300ms" is defined
directly on these metrics. Building the alerts here is you pre-assembling the
inputs to that.

## Command reference

| Command | What it does | Example |
|---------|--------------|---------|
| `az monitor app-insights component create` | Create an App Insights resource | `az monitor app-insights component create --app apim-ai --location eastus --resource-group rg --application-type web` |
| `az monitor diagnostic-settings create` | Send APIM logs/metrics to a workspace/AI | see below |
| `az apim api update` (App Insights logger) | Attach App Insights logging to an API | via `az apim api diagnostic` / portal (see below) |
| `az monitor metrics list` | Read APIM metrics from the CLI | `az monitor metrics list --resource <apim-id> --metric Requests --interval PT1M` |
| `az monitor metrics alert create` | Alert on an APIM metric | `az monitor metrics alert create --name apim-5xx --resource-group rg --scopes <apim-id> --condition "count Requests where ..." ...` |

Flag-by-flag breakdowns:

`az monitor diagnostic-settings create --name apim-diag --resource <apim-id> --workspace <law-id> --logs '[{"category":"GatewayLogs","enabled":true}]' --metrics '[{"category":"AllMetrics","enabled":true}]'`
- `--resource <apim-id>` — the APIM instance to emit telemetry from.
- `--workspace <law-id>` — the **Log Analytics workspace** (same construct from
  tracks 06/07/12) that receives the logs for KQL querying.
- `--logs '[{"category":"GatewayLogs",...}]'` — `GatewayLogs` is the per-request
  log category; this is what carries total vs. backend duration and status.
- `--metrics '[{"category":"AllMetrics",...}]'` — ship the numeric metrics too.

`az monitor app-insights component create --app apim-ai --location eastus --resource-group rg-apim-m07 --application-type web`
- `--application-type web` — the AI resource kind. Grab its **instrumentation
  key/connection string** to wire into the APIM App Insights logger (done in the
  portal or via `az apim api diagnostic`), which is what enables per-request
  traces and correlation.

APIM API diagnostic (sampling/verbosity) — set on the API's App Insights
diagnostic:
- **sampling percentage** — fraction of requests logged to AI (e.g. 100 while
  debugging, 5 in steady state).
- **verbosity / headers-and-body** — whether to capture request/response headers
  and how many body bytes (keep bodies off by default — cost + PII).

## Hands-on exercises

> **Time note:** analytics and Azure Monitor metrics work on **Consumption** (fast
> and free-idling) — use it for exercises 1-7. Only reach for a classic tier if
> you specifically want a feature it gates; nothing here requires one.

1. **Instance + backend + API with real traffic to observe.** Stand up a
   Consumption instance, a Container App backend, and an `orders` API. Generate
   traffic so there's something to see:
   ```powershell
   $key = az apim subscription show --resource-group rg-apim-m07 --service-name $apim --sid master --query primaryKey -o tsv
   $gw = az apim show --name $apim --resource-group rg-apim-m07 --query gatewayUrl -o tsv
   1..50 | ForEach-Object { curl -s -o /dev/null -H "Ocp-Apim-Subscription-Key: $key" "$gw/orders/" }
   ```

2. **Read built-in analytics.** In the Azure Portal, open the APIM instance →
   **Analytics** (or **Insights**). Confirm you see your ~50 calls, the Orders
   API/operation, and per-time-window counts. This is the zero-setup usage view.

3. **Wire diagnostic settings to Log Analytics.**
   ```powershell
   az monitor log-analytics workspace create --resource-group rg-apim-m07 --workspace-name law-apim-m07
   $law = az monitor log-analytics workspace show --resource-group rg-apim-m07 --workspace-name law-apim-m07 --query id -o tsv
   $apimId = az apim show --name $apim --resource-group rg-apim-m07 --query id -o tsv
   az monitor diagnostic-settings create --name apim-diag --resource $apimId --workspace $law `
     --logs '[{\"category\":\"GatewayLogs\",\"enabled\":true}]' `
     --metrics '[{\"category\":\"AllMetrics\",\"enabled\":true}]'
   ```
   Generate more traffic, wait a few minutes for ingestion, then run a KQL query
   in the workspace (Logs blade): `ApiManagementGatewayLogs | take 50`. Confirm
   per-request rows with status and durations appear.

4. **Split gateway time vs. backend time.** In KQL, project the durations:
   ```kusto
   ApiManagementGatewayLogs
   | project TimeGenerated, ApiId, ResponseCode, TotalTime = DurationMs, BackendTime = BackendTime
   | extend GatewayTime = TotalTime - BackendTime
   | order by TimeGenerated desc
   ```
   Confirm you can see, per request, how much time was spent *in the backend* vs.
   *in APIM's pipeline*. This is the "whose fault is the latency" answer.

5. **Create an App Insights resource and enable per-request tracing.**
   ```powershell
   az monitor app-insights component create --app apim-ai-m07 --location eastus `
     --resource-group rg-apim-m07 --application-type web
   ```
   In the Azure Portal, attach it to the API's diagnostics (APIM → your API →
   Settings → Application Insights) with **sampling 100%**, headers on, bodies
   off. Generate traffic and confirm requests appear in App Insights →
   **Transaction search**.

6. **Correlate to the backend (track 12 tie-in).** If your backend is App
   Insights/OTel-instrumented (track 12), open one APIM request in App Insights
   and follow its **end-to-end transaction** into the backend spans — one trace
   spanning gateway + backend via the propagated correlation id. If the backend
   isn't instrumented, reason through where the trace would continue and which
   header (`Request-Id`/`traceparent`) carries the correlation.

7. **Alert on the 5xx rate.** Create a metric alert so a spike in failures pages
   you:
   ```powershell
   az monitor metrics alert create --name apim-5xx-m07 --resource-group rg-apim-m07 `
     --scopes $apimId --description "APIM 5xx spike" `
     --condition "total Requests where ResponseCode >= 500 > 5" --window-size 5m --evaluation-frequency 1m
   ```
   (Exact dimension syntax varies by CLI version; adjust with
   `az monitor metrics alert create --help`.) This is a raw SLI for track 20.

8. **Diagnose with the split: gateway-caused latency.** Add an intentionally
   expensive inbound policy (e.g. a `validate-jwt` pointing at a slow/wrong
   `openid-config` URL, or a heavy transformation), generate traffic, and look at
   the KQL split from exercise 4. Confirm **GatewayTime** rises while
   **BackendTime** stays flat — proving the slowdown is *in APIM*, not the
   backend. **Fix** by removing/correcting the policy and watch GatewayTime drop.
   Lesson: the duration split turns "the API is slow" arguments into a decisive
   answer.

9. **Cleanup.**
   ```powershell
   az group delete --name rg-apim-m07 --yes --no-wait
   ```
   (Deletes the workspace and App Insights too. Note App Insights/Log Analytics
   ingestion is billable by volume — another reason to sample and to delete.)

## Independent challenge

Instrument an APIM API end to end: ship `GatewayLogs` to a Log Analytics
workspace, enable App Insights per-request tracing with *deliberate* sampling and
bodies-off, and build one KQL query that reports, per operation, request count,
p95 total latency, and the **gateway-vs-backend split**. Then create a metric
alert on the 5xx rate. Finally, drawing on **track 12**, write a short note on how
you'd follow a single slow request from the APIM trace into the backend's spans,
naming the correlation mechanism — and how these signals become the SLIs the SRE
track (20) will define SLOs on. Keep sampling modest to control ingestion cost,
and delete the resource group (including the workspace and App Insights) when
done.

<details><summary>Stuck? One hint</summary>

The whole game is the **duration split**. `ApiManagementGatewayLogs` carries both
total and backend time per request; `GatewayTime = TotalTime - BackendTime` tells
you whether a latency problem lives in your policy pipeline or the backend. For
correlation, the gateway propagates a correlation header (`Request-Id`/
`traceparent`) so App Insights joins the APIM request and the backend spans into
one end-to-end transaction — exactly track 12's distributed trace, one hop
earlier.

</details>

## Common mistakes & troubleshooting

- **Logging everything at 100% with bodies on.** Great for a demo, expensive and a
  privacy risk in reality (you capture tokens/PII). Sample modestly; headers not
  bodies; raise verbosity only while investigating.
- **Confusing analytics, metrics, and logs.** Analytics = built-in usage
  dashboards; metrics = numeric series you alert on; logs/App Insights =
  per-request traces for debugging. Reach for the layer that matches the question.
- **Blaming the backend for gateway latency (or vice versa).** Without the
  duration split you'll guess wrong. Always subtract BackendTime from TotalTime.
- **No correlation because the backend isn't instrumented.** APIM propagates the
  correlation id, but the trace only *continues* if the backend also emits
  telemetry (track 12). One-sided instrumentation gives you a truncated trace.
- **Diagnostic settings never wired.** Built-in analytics exist with zero setup,
  but KQL/per-request logs require a **diagnostic setting** to a workspace and an
  App Insights logger — forgetting these leaves you with only the coarse view.
- **Cost pitfall.** App Insights and Log Analytics bill by **ingestion volume**;
  a chatty gateway at high verbosity runs up cost independent of the APIM tier.
  Sample deliberately, keep bodies off, and delete the workspace/AI resources
  with the group — they don't disappear just because the APIM instance is gone.

## Checkpoint quiz

Write down your answer to each question before expanding it — checking without
attempting first is the single easiest way to fool yourself into thinking
you've learned this.

1. Name APIM's three observability layers and the question each best answers.
2. What can APIM's per-request log tell you about latency that a backend log
   alone cannot, and how do you compute it?
3. What makes an APIM request and its backend's trace join into a single
   distributed trace, and which prior track does that build on?
4. What two levers control App Insights logging cost/volume, and what's the
   sensible default posture?
5. Which APIM metrics are worth alerting on, and how do they relate to the next
   track (20 SRE)?
6. p95 latency spikes but BackendTime is flat. Where's the problem and what might
   cause it?
7. Why is logging full request/response bodies at 100% sampling a bad default on
   two counts?
8. You wired an App Insights logger but see no per-request traces in KQL. What
   did you likely skip?

<details><summary>Show answers</summary>

1. **Built-in analytics** (usage: who calls what, how much); **Azure Monitor
   metrics** (numeric series to chart/alert on trends); **diagnostic logs / App
   Insights** (per-request traces for end-to-end debugging).
2. It splits **total** vs. **backend** duration; `GatewayTime = TotalTime -
   BackendTime` reveals whether latency is in APIM's policy pipeline or the
   backend.
3. APIM's App Insights integration propagates a **correlation id**
   (`Request-Id`/`traceparent`) to an instrumented backend, joining gateway and
   backend spans — building on track 12's distributed tracing.
4. **Sampling** (percentage of requests logged) and **verbosity** (headers/body
   captured). Default: modest sampling, headers not bodies, raise temporarily when
   investigating.
5. 5xx rate, overall latency (p95/p99), failed-auth rate, and (classic)
   capacity. They're the raw **SLIs** the SRE track turns into SLOs and error
   budgets.
6. The problem is **inside APIM** (policy pipeline) — e.g. a slow/misconfigured
   `validate-jwt` JWKS fetch or an expensive transformation. Backend is fine.
7. **Cost** (App Insights bills by ingestion volume) and **privacy/security** (you
   capture tokens and PII in the bodies).
8. Likely the **diagnostic setting / App Insights logger** wasn't attached to the
   API (or you're querying `ApiManagementGatewayLogs` without a diagnostic setting
   to the workspace). Built-in analytics work with no setup, but per-request logs
   require the logger/diagnostic wiring.

</details>

## Next

[08-kong-and-traefik-oss-gateways](../08-kong-and-traefik-oss-gateways/README.md)
— everything so far has been Azure APIM specifically. This module runs the
same API-gateway concepts (auth, rate limiting) on an open-source gateway
you operate yourself, so you can tell the concept from the vendor.
