# SLIs and SLOs

## Why this matters

An SLI is the bridge between "the mindset" from
[module 00](../00-sre-concepts-and-the-reliability-mindset/README.md) and
anything you can actually put on a dashboard or alert on — it's a *number* that
says how well users are being served, and it's built from the exact
request-count and latency-histogram metrics you learned to query in
[track 12 module 02](../../12-observability-deep-dive/02-promql-in-depth/README.md).
An SLO is the target you hold that number to. Pick a bad SLI and you'll measure
something users don't feel; pick a bad SLO target and you'll either page
constantly or never notice real pain. This module is where reliability stops
being a vibe and becomes a ratio with a threshold.

## Concepts

### SLI — a good-events-over-valid-events ratio

A **Service Level Indicator (SLI)** is a carefully chosen measure of the service
level users experience, almost always expressed as a **ratio of good events to
valid events**, in the range 0-100%. "Good" and "valid" are decisions *you*
make: for availability, a good event is a request that returned a non-5xx status,
and valid events are all requests you're responsible for; for latency, a good
event is a request served faster than some threshold. Framing every SLI as
`good / valid` (rather than raw counts) makes it scale-independent — 99% good is
99% good whether you served a thousand requests or a billion — which is the same
reason a *ratio* beat a raw 5xx count for alerting back in
[track 12 module 02](../../12-observability-deep-dive/02-promql-in-depth/README.md).
The three SLIs you'll use constantly are **availability** (fraction of requests
that succeeded), **latency** (fraction served under a threshold), and
**error rate** (its complement).

### Choosing a *good* SLI — measure what the user feels

Not every measurable thing is a good SLI. The test is: **does this number move
when, and only when, users are actually hurt?** CPU utilization is measurable and
a terrible SLI — it can be at 90% with every user perfectly happy, or at 20%
while the service is throwing 500s. Good SLIs are the same **symptoms** track 12
module 06 told you to alert on: request success ratio, request latency,
correctness, freshness of data, throughput where users notice it. A good SLI is
also measured **as close to the user as you can get** — at the load balancer or
gateway (the Application Gateway/ingress from
[track 05](../../05-azure-networking/README.md) and
[track 07](../../07-aks/04-aks-networking-loadbalancer-and-ingress/README.md)) is
better than deep inside one microservice, because that's closer to what the user
actually experienced. And it should be a **small set** — one or two SLIs per
service that genuinely capture user happiness beat a dashboard of twenty.

### The latency SLI is a threshold, not an average

Latency deserves special care because the naive version is wrong. "Average
latency < 300ms" is a bad SLI: an average hides the tail, and the tail is exactly
where users suffer — a handful of 10-second requests vanish into a good-looking
mean. The correct latency SLI is a **threshold ratio**: *the fraction of requests
served faster than X*. You compute it straight from the histogram buckets you met
in track 12 — the count of requests in buckets `≤ X` divided by the total count.
This reuses `histogram_quantile`'s cousin: instead of "what latency is the 95th
percentile" you ask "what percentile is 300ms," which is a good/valid ratio. So
a latency SLO reads "95% of requests complete under 300ms," never "average
latency under 300ms."

### SLO — your internal target, and the window it's measured over

A **Service Level Objective (SLO)** is the *target value* you set for an SLI over
a *time window* — for example, "availability SLI ≥ 99.9% over a rolling 30 days."
Two parts matter equally. The **target** (99.9%) sets how good is good enough.
The **window** (rolling 30 days) sets over what span you judge it — a rolling
window means you're always looking at the last 30 days, so a bad hour ages out
gradually rather than resetting at a calendar boundary. The SLO is **internal**:
it's the number your team commits to and drives alerting and the error budget
(module 02) from. It is deliberately set *tighter* than any promise you make to
customers, so you get warned and can react before you break an external
commitment.

### SLA vs. SLO — the promise vs. the target

These are constantly confused. An **SLA (Service Level Agreement)** is a
*contract with a customer* that includes consequences — refunds, credits,
penalties — if you miss it. An **SLO (Service Level Objective)** is your
*internal target* with no contractual penalty, just an error-budget policy
(module 02). The rule is: **your SLO should be stricter than your SLA**, with
margin between them. If your SLA promises 99.9% and your internal SLO is *also*
99.9%, then the moment you breach your SLO you've *already* breached the contract
— no warning, no room to react. Set the SLO to, say, 99.95% so that burning
through your internal budget alarms you well before the customer-facing promise
is at risk. Many services have an SLO and *no* SLA at all (internal services,
free tiers); fewer have an SLA without a stricter SLO behind it — and that's a
mistake.

### Picking a target that's neither too loose nor too tight

The hardest part is choosing the number. Too **tight** (99.99% on a service that
realistically does 99.5%) and you'll blow the budget constantly, page people
endlessly, and the SLO becomes a joke everyone ignores — the alert-fatigue
failure from track 12 module 06, now at the objective level. Too **loose** (99%
on a payments API) and you'll be "meeting SLO" while users are genuinely
suffering, because the target permits pain they feel. Three practical anchors:
(1) **measure your current performance first** — an SLO should be *achievable*
with your current architecture, usually set at or just below where you already
are, then tightened over time; (2) **let user tolerance set the floor** — how bad
can it get before users leave or complain?; (3) **remember every nine costs
exponentially** (module 00's table) — don't buy a nine users can't perceive.
A good SLO is one you *mostly* meet but that *occasionally bites*, because an SLO
that never triggers a conversation isn't constraining anything.

## Command reference

These build directly on the PromQL from track 12 module 02. The pattern for every
SLI is `sum(rate(good[w])) / sum(rate(valid[w]))`.

| PromQL / concept | What it does | Notes |
|---|---|---|
| `sum(rate(http_requests_total[5m]))` | Total request rate (the *valid* events denominator) | from track 12 module 02 |
| `http_requests_total{code=~"5.."}` | Selects 5xx responses (the failures) | `=~` is a regex matcher |
| `sum(rate(http_requests_total{code!~"5.."}[5m]))` | Good (non-5xx) request rate — availability numerator | `!~` = negated regex |
| `http_request_duration_seconds_bucket{le="0.3"}` | Cumulative count of requests ≤ 300ms | histogram bucket from track 12 |
| Availability SLI | `sum(rate(good[w])) / sum(rate(valid[w]))` | good = non-5xx |
| Latency SLI | `sum(rate(dur_bucket{le="0.3"}[w])) / sum(rate(dur_count[w]))` | fraction under 300ms |

Availability SLI — the canonical expression, flag by flag:

```promql
sum(rate(http_requests_total{code!~"5.."}[30d]))
  /
sum(rate(http_requests_total[30d]))
```
- `http_requests_total{code!~"5.."}` — the **good** events: every request whose
  status code does *not* match the regex `5..` (i.e. not a 5xx). `!~` is the
  negated-regex matcher; `5..` matches any three-digit code starting with 5.
- `rate(...[30d])` — per-second rate over the SLO window. Over a long window this
  is effectively "average success rate over 30 days."
- outer `sum(...)` — collapses all label dimensions to one number (the
  service-wide ratio). Add `by (service)` if you want it per service.
- the division — **good / valid**; the result is the SLI, a number between 0 and
  1 you compare against your SLO target (e.g. `≥ 0.999`).

Latency SLI — fraction of requests under a 300ms threshold:

```promql
sum(rate(http_request_duration_seconds_bucket{le="0.3"}[30d]))
  /
sum(rate(http_request_duration_seconds_count[30d]))
```
- `..._bucket{le="0.3"}` — the histogram's **cumulative** count of requests that
  completed in ≤ 0.3s (Prometheus histogram buckets are cumulative — reuse of the
  `le` label from track 12 module 02).
- `..._count` — the total number of observed requests (the denominator).
- ratio — the fraction served under 300ms; that *is* the latency SLI. Note it's a
  threshold ratio, **not** an average or a single `histogram_quantile` value.

## Hands-on exercises

Reconnect to the **kind** cluster running `kube-prometheus-stack` from
[track 12](../../12-observability-deep-dive/01-prometheus-fundamentals/README.md).
You'll write PromQL SLIs against real scraped metrics from the demo app. If the
demo app is gone, redeploy any workload that exposes request-count and
duration-histogram metrics (the track 12 module 01/02 app).

1. **(WSL2) Write an availability SLI against real metrics.** Port-forward
   Prometheus (`svc/kps-kube-prometheus-stack-prometheus 9090`) and, in the
   graph UI, write the `good/valid` availability expression for the demo app over
   `[5m]`. Confirm it returns a value near 1.0. Now break something (scale the
   app to return some 500s, or hit an error endpoint) and watch the SLI drop.
   You just measured availability as a ratio, not a guess.

2. **(WSL2) Write a latency SLI as a threshold ratio.** Using the app's
   `*_duration_seconds_bucket`, write the fraction-under-300ms expression. Then
   write the *wrong* version — `histogram_quantile(0.95, ...)` compared to a
   number, and an *average* (`..._sum / ..._count`) — and write one sentence on
   why the threshold-ratio is the correct SLI and the average is misleading (the
   tail).

3. **(WSL2) Pick good vs. bad SLIs for the demo app.** List five metrics the app
   exposes. For each, decide: is this a good SLI (moves when and only when users
   are hurt) or a bad one (a cause/resource metric)? You should end with request
   success ratio and latency as *good*, and CPU/memory/goroutine-count as *bad*.
   Write the one-line justification per item — this is the module 00 symptom-vs-
   cause test applied to SLI selection.

4. **(paper) Translate three services into SLI + SLO targets.** For (a) a
   payments API, (b) an internal batch-report generator, (c) a marketing website,
   write a sensible SLI and an SLO *target + window* for each, and justify the
   number. You should end up with very different targets (payments tight,
   marketing loose, batch measured on freshness/completion not latency) — the
   point is that the *right* SLO is service-specific, not a universal 99.9%.

5. **(WSL2) Measure current performance, then set the SLO from it.** Compute the
   demo app's actual availability SLI over the longest window you have data for.
   *Then* set an SLO target — at or just below what you measured — and write why
   setting it *above* your measured performance (aspirationally) would just blow
   the budget from day one. This is the "achievable first, tighten later"
   anchor.

6. **(paper) SLA vs. SLO with margin.** A customer contract (SLA) promises 99.9%
   monthly availability with service credits if missed. Choose an internal SLO
   target that gives you warning margin, and explain in two sentences what
   happens on the day you breach the SLO vs. the day you breach the SLA. Then
   describe the failure mode of setting SLO = SLA (no warning, contract already
   broken when your own alarm fires).

7. **Diagnose and fix: the vanity SLI that's always green.** Someone set the
   service's "reliability SLI" to `up` (the Prometheus target-health metric from
   track 12 module 01) — so the dashboard shows 100% and the SLO is "never
   breached," yet users have been complaining about 500s all week. Reproduce it:
   graph `avg_over_time(up{job="<app>"}[1h])` and see a flat 1.0 while your real
   availability SLI from exercise 1 is visibly dropping under injected errors.
   **Diagnose** why `up` is the wrong SLI (it only says "Prometheus could scrape
   the target," i.e. the process is alive — it says *nothing* about whether
   requests are succeeding). **Fix** by replacing the SLI with the good/valid
   request-success ratio. Lesson: **an SLI that's always green while users suffer
   is worse than none — it manufactures false confidence.** This is the
   objective-level version of track 12 module 06's "firing ≠ paged" trap: green
   ≠ users happy unless the SLI measures what users feel.

8. **(WSL2) Turn your SLI into a recording rule.** SLI expressions over `[30d]`
   are expensive to evaluate on every dashboard refresh. Using the recording-rule
   technique from track 12 module 02, write a `PrometheusRule` that records the
   short-window good and valid rates (e.g. `job:sli_good:rate5m`,
   `job:sli_valid:rate5m`) so module 03 can build burn-rate alerts on cheap
   precomputed series. Confirm the recorded series appear in Prometheus (remember
   the `release` label so the Operator loads the rule — the module 01/02 trap).

## Independent challenge

Using this module plus the RED-shaped dashboard from
[track 12 module 03](../../12-observability-deep-dive/03-grafana-dashboards/README.md)
and the symptom-vs-cause judgment from
[module 00](../00-sre-concepts-and-the-reliability-mindset/README.md), define a
*complete SLI/SLO specification* for the track 12 demo app — no expressions
given. Choose exactly **two** SLIs (you'll almost certainly land on availability
and latency), write the precise good/valid definition for each in words *and* as
PromQL against the app's real metrics, pick an SLO target and window for each that
you can justify from the app's *measured* current performance (not an aspiration),
and state one SLA you *could* offer a customer that sits looser than your SLO with
margin to spare. The written justification — why these two SLIs, why these
targets, why this margin — is the deliverable, because choosing *what to hold
yourself to* is the actual SRE skill; the PromQL is the easy part.

<details>
<summary>Stuck? One hint</summary>

Availability and latency are almost always the right two SLIs for a request-driven
web service, and both come straight out of the metrics track 12's demo app
already exposes: `http_requests_total` (with a `code`/`status` label) for
availability, and `http_request_duration_seconds_bucket` for latency. For the
targets, run the SLIs over your longest window *first* and set the SLO at or just
below what you observe — an SLO you already meet 99.7% of the time should be 99.5%,
not an aspirational 99.99% you'll blow on day one. For the SLA margin, put the
customer promise a nine (or half a nine) looser than the SLO so your internal
alarm always fires before the contract is at risk.

</details>

## Common mistakes & troubleshooting

- **Averaging latency.** "Average latency < 300ms" hides the tail where users
  actually suffer. Use a threshold ratio — *fraction of requests under 300ms* —
  built from histogram buckets.
- **Resource metrics as SLIs.** CPU/memory/queue-depth are *causes*, not what
  users feel. An SLI must move when and only when users are hurt. (`up` as an
  SLI — exercise 7 — is the classic version of this.)
- **SLO = SLA.** If your internal target equals your contractual promise, you get
  no warning — the day your own alarm fires, the contract is already broken. Keep
  the SLO stricter, with margin.
- **Aspirational SLOs.** Setting the target above your measured performance blows
  the budget from day one and trains everyone to ignore it. Set it achievable,
  then tighten.
- **Too many SLIs.** Twenty SLIs is a dashboard, not a target. One or two that
  genuinely capture user happiness are what you defend and alert on.
- **Measuring far from the user.** An SLI deep inside one service can be green
  while the edge the user hit is red. Measure as close to the user (LB/ingress)
  as you can.
- **Forgetting the window.** "99.9% availability" is meaningless without "over
  what" — a rolling 30 days behaves very differently from a calendar month.

## Checkpoint quiz

Write down your answer to each question before expanding it — checking without attempting first is the single easiest way to fool yourself into thinking you've learned this.

<details>
<summary>Show questions</summary>

1. Give the general shape of *every* SLI in one short formula, and say why it's
   expressed that way rather than as a raw count.
2. What's the test for whether a metric is a *good* SLI? Apply it to CPU
   utilization.
3. Why is "average latency < 300ms" a bad SLI, and what's the correct latency SLI
   phrased precisely?
4. Distinguish SLA from SLO. Which should be stricter, and what breaks if they're
   equal?
5. Name two independent things that go wrong if you set an SLO target *too tight*,
   and one thing that goes wrong if it's *too loose*.
6. What should you measure *before* choosing an SLO target, and why?
7. Someone sets the reliability SLI to Prometheus's `up` metric and the dashboard
   is always green while users report errors. What's wrong and what's the fix?

</details>

<details>
<summary>Show answers</summary>

1. `good events / valid events` (a ratio in 0-100%). As a ratio it's
   scale-independent — 99% good means the same at a thousand or a billion
   requests — whereas a raw count needs a different threshold at every traffic
   level.
2. Does the number move *when and only when users are actually hurt*? CPU fails
   the test: it can be 90% with happy users or 20% while the service 500s, so
   it's a cause, not a user-felt symptom — a bad SLI.
3. An average hides the tail — a few very slow requests disappear into the mean,
   yet those are exactly the users suffering. The correct SLI: *the fraction of
   requests completed faster than the threshold* (e.g. "95% of requests under
   300ms"), computed from histogram buckets.
4. An **SLA** is a contract with a customer carrying penalties; an **SLO** is your
   internal target with no external penalty. The SLO should be **stricter**. If
   they're equal, breaching your own SLO means you've *already* breached the
   contract — no warning, no room to react.
5. Too tight: (1) you blow the error budget constantly and page endlessly
   (alert fatigue); (2) the SLO loses credibility and everyone ignores it. Too
   loose: you're "meeting SLO" while users genuinely suffer, because the target
   permits pain they feel.
6. Your **current measured performance**. The SLO must be achievable with today's
   architecture — set at or just below where you already are — or it blows the
   budget from day one; you tighten it over time.
7. `up` only means Prometheus could scrape the target (the process is alive); it
   says nothing about whether requests *succeed*. It's a liveness metric, not a
   user-facing SLI. Fix: use the good/valid request-success ratio so the SLI
   drops when users actually get errors.

</details>

## Next

[02-error-budgets](../02-error-budgets/README.md) — you have an SLI and an SLO
target; the gap between that target and 100% is a *budget you get to spend*.
You'll compute it, learn to spend it, and use it to make a real "ship vs. slow
down" decision instead of arguing about one.
