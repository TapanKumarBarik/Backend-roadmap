# Module 08: Alerting Without Fatigue

## Why this matters

Observability (modules 04-07) lets you *investigate* a problem once you know to
look. Alerting is the other half: being *told* to look, at the right moment, for
the right reasons — without being told so often, or so pointlessly, that you stop
listening. That last clause is the whole module. The failure mode of alerting
isn't "too few alerts"; it's **alert fatigue** — so many alerts, so many of them
noise, that the on-call engineer mutes the channel, and the one alert that
mattered scrolls by unread at 3am next to forty that didn't. Alert fatigue is not
a minor annoyance; it is *the* way good monitoring produces bad outcomes, and
it's how real outages get missed by teams who "had an alert for that."

So this module is less about the mechanics of firing an alert (that part is a few
lines of PromQL and a routing config) and more about the **philosophy**: what
deserves to wake a human, what doesn't, and how to tell the difference reliably.
The central shift is from **cause-based** alerting ("CPU is at 90%," "a disk is
filling," "this service restarted") — which produces mountains of alerts that may
or may not matter to anyone — to **symptom-based, SLO-driven** alerting ("users
are experiencing errors," "requests are too slow"), which alerts on the thing you
actually care about: whether the *service is meeting its promise to users*. The
metrics you built in module 06 (RED, the golden signals) are exactly the raw
material for this.

You'll learn to define **SLIs and SLOs**, derive an **error budget**, and alert
on **burn rate** rather than raw thresholds — the modern SRE approach that fires
*urgently* only when the budget is being consumed fast enough to matter, and
stays quiet otherwise. You'll learn the hard rule that **every page must be
actionable** (a human, woken up, can and must do something), the difference
between things that page and things that can wait for a ticket or a dashboard,
and the practices — runbooks, severity levels, grouping, silencing — that keep
the signal-to-noise ratio high enough that people still trust the alerts. This is
where all the observability plumbing turns into *operational readiness*, and it's
the discipline that decides whether your on-call rotation is sustainable or
burns people out.

## Concepts

### The real enemy: alert fatigue

Start with the problem, because every practice in this module is a response to
it. **Alert fatigue** is the desensitization that happens when people receive too
many alerts, especially non-actionable or false ones. Its progression is
predictable and lethal:

1. Alerts are added generously — every metric that *might* indicate a problem
   gets a threshold ("alert if CPU > 80%," "alert if any 500 occurs").
2. Most of them fire routinely without corresponding to a real, actionable
   problem (CPU spikes are normal; a single 500 is often harmless).
3. On-call learns that alerts are *usually noise*, so they start ignoring,
   muting, or auto-acknowledging them.
4. A real, serious alert fires — and is treated exactly like the noise: ignored.
   The outage the alert was supposed to catch happens anyway.

The costs compound: missed real incidents, burned-out engineers who dread being
on-call, and an erosion of trust that makes the whole monitoring investment
worthless. The core realization: **an alert's value is not in existing — it's in
being trusted and acted on.** A noisy alert is worse than no alert, because it
actively trains people to ignore the channel where the real alert will appear.
Every decision in this module optimizes for one thing: **keep the signal-to-noise
ratio high enough that every alert is trusted.**

### Symptom-based vs cause-based alerting

This is the single most important conceptual shift. There are two philosophies
for *what* to alert on:

- **Cause-based (avoid as pages):** alert on internal conditions that *might*
  cause a problem — high CPU, low disk, high memory, a restarted pod, a full
  queue, a slow query. The trouble: most of these are either self-correcting,
  normal under load, or don't actually affect users — so they generate huge
  volumes of alerts, many meaningless. High CPU with happy users and fast
  responses is *not a problem*. Alerting on it pages someone for nothing.
- **Symptom-based (prefer as pages):** alert on what the *user actually
  experiences* — requests are failing, requests are too slow, the service is
  unavailable. These are, by definition, things that matter, because they're
  defined in terms of user pain. "The error rate users see exceeds 1%" is worth
  waking someone for; "a CPU is at 85%" usually isn't.

The guiding principle (from Google's SRE practice): **page on symptoms, not
causes.** You want a *small number* of symptom alerts that mean "users are being
hurt," not a *large number* of cause alerts that mean "something you might care
about changed." Causes still have value — but as *diagnostic signals on
dashboards* you consult *after* a symptom alert fires (module 07's investigation),
not as things that page a human. The USE-method resource metrics (module 06) are
mostly causes: great for the dashboard you open during an incident, wrong as
pages. The RED/golden-signal metrics are mostly symptoms: exactly what should
page.

The litmus test for every proposed alert: *"If this fires, is a **user** being
hurt (or about to be), and is there something a human must do about it?"* If no
to either, it shouldn't page.

### SLIs, SLOs, and error budgets

Symptom-based alerting needs a precise definition of "the service is doing its
job." That's what the SLI/SLO framework provides — the vocabulary of modern
reliability.

- **SLI (Service Level Indicator):** a *measurement* of some aspect of service
  health, expressed as a ratio of good events to total. Examples: *availability*
  = successful requests / total requests; *latency* = requests faster than 300ms
  / total requests. SLIs come straight from your RED metrics (module 06).
- **SLO (Service Level Objective):** a *target* for an SLI over a window — the
  promise. "99.9% of requests succeed over 30 days." "99% of requests complete
  under 300ms over 30 days." The SLO is a deliberate choice: *not* 100% (that's
  impossible and infinitely expensive), but a realistic, agreed level of
  reliability that keeps users happy while leaving room to ship.
- **SLA (Service Level Agreement):** the *contractual* version of an SLO with
  consequences (refunds, penalties) if breached. SLAs are usually looser than
  your internal SLOs — you alert on the tighter SLO so you react before the
  contractual SLA is at risk. (SLA is a business/legal artifact; SLO is what you
  operate to.)
- **Error budget:** the mathematical complement of the SLO, and the key insight.
  If your SLO is 99.9% success, then `100% − 99.9% = 0.1%` of requests are
  *allowed* to fail over the window. That 0.1% is your **error budget** — a
  concrete, spendable quantity of unreliability. Over 30 days at a given traffic
  level it's a specific number of failed requests you can "afford."

The error budget reframes reliability from "never fail" (impossible, paralysing)
to "stay within budget" (finite, manageable), and it directly powers good
alerting: you don't alert on *every* error (you have a budget for some), you alert
when you're **spending the budget too fast** to last the window. It also settles
the eternal dev-vs-ops tension: budget remaining → ship features; budget
exhausted → freeze features and fix reliability. Reliability becomes a number
everyone agrees on, not an argument.

### Burn rate: alerting on the budget, not raw thresholds

Naive threshold alerting ("page if error rate > 1% for 5 minutes") is both too
noisy (a brief blip pages you) and too crude (it treats a tiny sustained leak
and a catastrophic spike the same). The modern approach is **error-budget burn
rate**.

**Burn rate** is *how fast you're consuming the error budget relative to the rate
that would exactly exhaust it over the window.* Burn rate 1 means you'll spend
exactly your whole budget by the end of the window (fine — that's the plan). Burn
rate 14.4 means you're spending it 14.4× too fast — at that rate the entire 30-day
budget is gone in ~2 days. High burn rate = urgent; low burn rate = it can wait.

The power of burn-rate alerting:

- It **scales urgency to severity.** A massive outage (burn rate 100+) pages
  *immediately*; a slow simmer (burn rate 2) creates a ticket for business hours.
  One SLO, graded responses.
- **Multi-window, multi-burn-rate alerts** are the SRE-recommended pattern: fire
  a *fast, paging* alert only when a *high* burn rate is sustained over *both* a
  short and a longer window (e.g. burn rate ≥ 14.4 over 5m *and* 1h) — the two
  windows together kill false positives (a 30-second blip won't satisfy the 1h
  window) while still catching real fast burns quickly. A *lower* burn rate
  (e.g. ≥ 3 over 6h) fires a non-paging ticket. This is precisely the
  noise-suppression the whole module is about, expressed as math.

```promql
# error-budget burn rate for a 99.9% availability SLO (budget = 0.001)
# ratio of the observed error rate to the budget:
(
  sum(rate(http_requests_total{status=~"5.."}[5m]))
  / sum(rate(http_requests_total[5m]))
) / 0.001
# a paging alert fires when this is >= 14.4 over BOTH 5m and 1h windows
```

The takeaway: alert on **how fast you're burning the promise to users**, not on
raw metric values crossing arbitrary lines. It's the technical expression of
symptom-based alerting plus the error budget.

### Actionable alerts, severity, and routing

Beyond *what* to alert on, *how* an alert is shaped decides whether it helps or
hurts. Rules that keep alerts trustworthy:

- **Every page must be actionable.** If an alert fires and the right response is
  "watch it" or "it'll clear up," it should not have paged. A page means: a
  human, possibly asleep, must *do something now*. If there's nothing to do,
  it's not a page — at most a ticket or a dashboard annotation. This single rule
  eliminates most fatigue.
- **Grade severity, route accordingly.** Not everything is a 3am page:
  - **Page / critical** — user-facing, urgent, actionable *now* → wake someone
    (PagerDuty/Opsgenie/phone).
  - **Ticket / warning** — real but not urgent → a ticket or Slack for business
    hours (e.g. disk will fill in 5 days, a slow budget burn).
  - **Info / dashboard** — awareness only → a dashboard or a log; never a
    notification.
  The severity determines the *channel* and the *urgency*, and keeps the paging
  channel sacred for things that truly need a human now.
- **Every alert needs a runbook.** A good alert links to a **runbook**: what it
  means, how to confirm it's real, and the first diagnostic/remediation steps.
  An alert with no runbook wakes someone who then doesn't know what to do — the
  page was half-useless. The runbook is where module 07's investigation loop
  lives (which trace, which dashboard, which logs).
- **Group and deduplicate.** One root cause often trips many alerts (a DB down
  fails ten services). Alerting tools (**Alertmanager**) **group** related alerts
  into one notification and **deduplicate** repeats, so you get *one* "DB is
  down" page, not ten. Grouping is a primary anti-fatigue mechanism.
- **Silences and maintenance windows.** During a known deploy or maintenance,
  **silence** the alerts you expect to fire so they don't cry wolf — deliberately,
  time-boxed, not by muting the channel permanently.
- **Tune continuously.** Alerting is never "done." Review fired alerts: which
  were actionable? which were noise? Delete or re-tune the noisy ones. A
  regular "alert review" is how you keep the ratio high as the system changes.

The through-line from module 04's log levels to here: *don't cry wolf.* An
`ERROR` log that isn't really an error, and a page that isn't really actionable,
are the same sin — they erode trust in the signal until the real one is ignored.

## Command reference

| Concept / tool | Purpose |
|---|---|
| SLI | A measured ratio of good events to total (from RED metrics) |
| SLO | The target for an SLI over a window (the promise, e.g. 99.9%) |
| SLA | The contractual version of an SLO, with penalties (looser than SLO) |
| Error budget | `1 − SLO` — the allowed amount of failure; a spendable quantity |
| Burn rate | How fast the budget is being consumed vs the sustainable rate |
| Multi-window multi-burn-rate | Fire only when a high burn rate holds over two windows |
| Prometheus alerting rule | PromQL expression + `for:` duration → fires an alert |
| Alertmanager | Routes, groups, deduplicates, and silences alerts |
| Runbook | Doc linked from an alert: meaning + how to confirm + first steps |
| Severity (page/ticket/info) | Grades urgency → chooses channel |

**A symptom-based, multi-window burn-rate alert (Prometheus rules):**

```yaml
groups:
- name: slo-availability
  rules:
  # fast burn: page immediately — budget gone in ~2 days at this rate
  - alert: HighErrorBudgetBurnFast
    expr: |
      (sum(rate(http_requests_total{status=~"5.."}[5m])) / sum(rate(http_requests_total[5m]))) / 0.001 >= 14.4
      and
      (sum(rate(http_requests_total{status=~"5.."}[1h])) / sum(rate(http_requests_total[1h]))) / 0.001 >= 14.4
    for: 2m
    labels: {severity: page}
    annotations:
      summary: "Fast error-budget burn on API availability SLO"
      runbook: "https://runbooks.internal/api-availability"
  # slow burn: ticket, not a page — real but not urgent
  - alert: ErrorBudgetBurnSlow
    expr: |
      (sum(rate(http_requests_total{status=~"5.."}[6h])) / sum(rate(http_requests_total[6h]))) / 0.001 >= 3
    for: 15m
    labels: {severity: ticket}
    annotations:
      summary: "Slow error-budget burn — investigate during business hours"
      runbook: "https://runbooks.internal/api-availability"
```

**Alertmanager routing/grouping (sketch):**

```yaml
route:
  group_by: ['alertname', 'service']       # collapse related alerts into one notification
  group_wait: 30s
  group_interval: 5m
  receiver: slack-tickets
  routes:
    - matchers: [severity="page"]
      receiver: pagerduty                   # only pages go to the wake-someone channel
    - matchers: [severity="ticket"]
      receiver: slack-tickets
```

**A page must be actionable and runbook-linked.** Before adding any alert, ask
the litmus test: *user hurt? human must act now?* If not both, downgrade it to a
ticket or a dashboard panel — never a page.

## Hands-on exercises

Reuse your module 06 metrics + Prometheus setup, and add Alertmanager:

```yaml
# add to prometheus.yml
rule_files: ["alerts.yml"]
alerting:
  alertmanagers:
    - static_configs: [{ targets: ["alertmanager:9093"] }]
```

### 1. Define an SLI, SLO, and error budget on paper

For your `/orders` service, write down: one availability SLI (as a ratio) and one
latency SLI; a realistic SLO for each over 30 days; and the resulting error
budget as both a percentage and — assuming 1,000,000 requests/30 days — an
absolute number of allowed failures.

<details>
<summary>Worked example</summary>

Availability SLI = successful (non-5xx) requests / total requests. SLO = 99.9%
over 30 days → error budget = 0.1% → at 1M requests, **1,000 failed requests
allowed** in the window. Latency SLI = requests < 300ms / total. SLO = 99% under
300ms over 30 days → budget = 1% may be slower than 300ms. The point: the budget
is a *concrete, countable quantity* of allowed unreliability, which is what makes
"are we burning it too fast?" a well-defined question.

</details>

### 2. Write a naive threshold alert and feel why it's bad

Write `alert: AnyError` firing when `rate(http_requests_total{status=~"5.."}[1m])
> 0`. Generate a single 500. Watch it fire.

Expected: it pages on *one* error — pure noise, since a single transient 500 is
within budget and needs no human. Write down why this exact alert is the seed of
alert fatigue, then delete it. (This is the "alert on any error" trap.)

### 3. Convert it to a burn-rate alert

Replace the naive alert with the fast-burn rule from the command reference
(burn rate ≥ 14.4 over 5m and 1h). Generate a *sustained* high error rate (e.g.
a route that 500s 30% of the time under load).

Expected: the alert does *not* fire for a brief blip, but *does* fire once the
high error rate is sustained across both windows — urgency matched to a genuine
fast burn. You've turned a noisy threshold into a symptom-based, budget-aware
alert.

### 4. Prove the two windows kill false positives

With the burn-rate alert active, generate a 20-second spike of errors and stop.
Then generate a sustained one.

Expected: the 20-second spike does *not* page (it can't satisfy the 1h window);
the sustained burn does. Write down how the two-window requirement is doing the
noise suppression — the short window makes it fast, the long window makes it
trustworthy.

### 5. Grade and route by severity

Add the slow-burn `ticket` rule and Alertmanager routing so `severity=page` goes
to one receiver and `severity=ticket` to another (use a webhook/log receiver
locally). Trigger both a fast and a slow burn.

Expected: the fast burn routes to the "page" receiver; the slow burn to the
"ticket" receiver — the same SLO producing graded responses. This is
severity-based routing keeping the paging channel sacred.

### 6. Group related alerts into one notification

Configure `group_by: ['service']`. Make three alerts fire for the same service at
once (e.g. availability, latency, and a dependency alert from one DB outage).

Expected: Alertmanager sends *one grouped notification* instead of three separate
pages — the anti-fatigue behaviour when one root cause trips many alerts. Remove
grouping and observe the three-page spam you just prevented.

### 7. Write a runbook and link it

Pick your fast-burn alert and write a short runbook: what it means, how to
confirm it's real (which dashboard/metric), how to investigate (module 07's
metric → trace → logs loop), and first remediation steps. Link it in the alert's
`annotations.runbook`.

Expected: the alert now carries a link that turns "woken up, confused" into
"woken up, here's step 1." Note how much of the runbook is just module 07's
investigation loop written down.

### 8. Diagnose and fix: the on-call rotation everyone quit

A team's `#alerts` channel gets ~400 alerts/day and three engineers have quit
on-call in two months. Here's a sample of their alert rules. Diagnose the fatigue
sources and rewrite the alerting strategy.

```yaml
- alert: HighCPU
  expr: cpu_usage > 80
  labels: {severity: page}
- alert: PodRestarted
  expr: increase(pod_restarts[5m]) > 0
  labels: {severity: page}
- alert: AnyServerError
  expr: rate(http_requests_total{status=~"5.."}[1m]) > 0
  labels: {severity: page}
- alert: SlowQuery
  expr: db_query_seconds > 1
  labels: {severity: page}
- alert: DiskWillFillEventually
  expr: disk_used_percent > 70
  labels: {severity: page}
```

<details>
<summary>Solution</summary>

Every rule here is a fatigue generator, and all page. The two root diseases:
**they alert on causes, not symptoms**, and **everything is a page regardless of
urgency or actionability.**

- **HighCPU (> 80%)** — a *cause*, and normal under load. High CPU with fast,
  successful responses is not a user problem. Fix: don't page on CPU at all; keep
  it as a dashboard/USE signal to consult during an incident. (At most a
  *ticket* if sustained saturation correlates with latency.)
- **PodRestarted (any restart)** — a *cause*, and restarts are routine (deploys,
  scaling, health-check recycles). Paging on every one is pure noise. Fix:
  dashboard signal; alert only on *crash-looping* (many restarts fast) as a
  ticket, and even then only if it hurts the SLO.
- **AnyServerError (any 5xx)** — the classic trap: a single transient error is
  within budget. Fix: replace with a **burn-rate** alert on the availability SLO
  (pages only on sustained fast burn over two windows).
- **SlowQuery (> 1s)** — a *cause*, and one slow query rarely equals user pain.
  Fix: it belongs on a dashboard; page instead on the *latency SLO* burn rate
  (the symptom: users are experiencing slowness).
- **DiskWillFillEventually (> 70%)** — real but *not urgent* and mis-severitied
  as a page. 70% full is days away from a problem. Fix: a **ticket** for business
  hours (predictive/slow-burn), paging only if it will fill within, say, an hour.

The rewrite: define availability and latency **SLOs**, page only on **multi-window
burn-rate** breaches of those (symptoms), demote every cause to dashboard/ticket,
route by **severity** so only true pages wake someone, **group** by service so one
outage is one page, attach **runbooks**, and hold a weekly alert review to prune
the rest. The 400/day collapses to a handful of trustworthy, actionable pages —
and people stop quitting. The lesson is module 04's "don't cry wolf" at the
alerting layer: an alert that isn't actionable is a false alarm, and false alarms
train people to ignore the real one.

</details>

## Independent challenge

No code given. Take the fully instrumented service from **module 06/07** (RED
metrics + traces + correlated logs) and design its *complete alerting strategy*
from scratch, defending every choice against the fatigue test. Specifically: (1)
define availability and latency **SLIs/SLOs** for the service and compute the
error budget; (2) write **multi-window, multi-burn-rate** Prometheus alerts that
page on a fast burn and ticket on a slow burn of each SLO — and *nothing else*
pages; (3) enumerate at least three **cause** signals (CPU, restarts, pool
saturation, slow queries) and justify, for each, why it is a *dashboard/ticket*
and not a page; (4) configure Alertmanager to **route by severity** and **group by
service**; and (5) write a **runbook** for your fast-burn page that reuses module
07's metric → trace → logs investigation loop. Then *prove it*: drive a sustained
outage and show exactly one grouped, actionable page fires with a working runbook
link; drive a brief blip and a high-CPU-but-healthy period and show **neither**
pages. Reach back to **module 00**: explain how a service that *degrades
gracefully* (fallbacks, circuit breakers) spends its error budget more slowly and
therefore pages less — reliability engineering and error-handling are the same
discipline viewed from two ends.

<details>
<summary>Hint</summary>

The SLO is the spine: pick 99.9% availability (budget 0.1%) and 99% under 300ms,
then *every* paging decision derives from "are we burning that budget too fast?"
— which is the burn-rate PromQL from the command reference. The trick that makes
it non-noisy is the *two windows*: a page requires the high burn rate to hold
over both a short window (so it's fast) and a longer one (so a blip can't trigger
it). For part (3), the litmus test does the work: high CPU with a healthy SLO
hurts no user → dashboard; a restart during a deploy hurts no user → dashboard;
these become *pages* only transitively, when they cause an SLO burn — so you page
on the burn, not the cause. For the module-00 tie-in: a fallback that serves
stale-but-correct data on a dependency failure turns what *would* have been a 5xx
(budget spent) into a degraded-but-successful response (budget preserved) — so
good error handling literally buys reliability budget and reduces pages, which is
why the track put error handling first.

</details>

## Common mistakes & troubleshooting

- **Alerting on causes instead of symptoms.** CPU, memory, restarts, slow
  queries page constantly and mostly don't matter to users. Page on symptoms
  (errors, latency, availability — the SLOs); keep causes as dashboard/diagnostic
  signals.
- **"Alert on any error."** A single transient error is within budget and needs
  no human. Alert on *sustained budget burn*, not on any single failure.
- **Everything is a page.** Not every real problem is urgent. Grade severity
  (page/ticket/info) and route accordingly; keep the paging channel for
  wake-someone-now, actionable events only.
- **Non-actionable pages.** If the response is "watch it" or "it self-heals," it
  should never have paged. Every page must have a concrete action (and a
  runbook). This one rule removes most fatigue.
- **Raw thresholds instead of burn rate.** `> 1% for 5m` is both noisy (blips)
  and crude (ignores severity). Multi-window burn-rate alerts scale urgency and
  suppress false positives.
- **No grouping/dedup.** One outage tripping ten alerts sends ten pages. Group by
  service/root cause so one incident is one notification.
- **No runbooks.** An alert with no runbook wakes someone who then doesn't know
  what to do. Link the meaning + confirmation + first steps.
- **Set-and-forget.** Alerting rots as the system changes. Review fired alerts
  regularly and prune/tune the noisy ones — keeping the signal-to-noise ratio
  high is ongoing work.
- **SLO of 100%.** Impossible and infinitely costly, and it means *zero* error
  budget so *everything* pages. Pick a realistic SLO that leaves budget to ship.

## Checkpoint quiz

Write down your answer to each question before expanding it — checking without attempting first is the single easiest way to fool yourself into thinking you've learned this.

1. What is alert fatigue, why is a noisy alert *worse* than no alert, and what
   single ratio is every practice in this module trying to protect?
2. Distinguish symptom-based from cause-based alerting with an example of each,
   and state the rule for which should page. Where do cause signals still belong?
3. Define SLI, SLO, and error budget, and show how the error budget follows from
   the SLO with a number.
4. What is burn rate, and why is a multi-window multi-burn-rate alert better than
   a raw "error rate > 1% for 5m" threshold — on *both* the false-positive and
   the severity axes?
5. State the "every page must be actionable" rule and give the litmus-test
   question you apply to any proposed alert before it's allowed to page.
6. Name three anti-fatigue mechanisms beyond choosing the right metric (think:
   what Alertmanager does, what a runbook is for, and what severity grading
   buys you).

<details>
<summary>Answers</summary>

1. Alert fatigue is the desensitization from receiving too many alerts —
   especially non-actionable/false ones — until people ignore or mute them and
   miss the real one. A noisy alert is worse than none because it *actively
   trains* on-call to distrust the channel, so the genuine alert arrives to an
   audience that's stopped listening. Every practice here protects the
   **signal-to-noise ratio** — keeping alerts trusted and acted on.
2. **Symptom-based** alerts on what users experience — errors, slowness,
   unavailability (e.g. "error rate users see > 1%"). **Cause-based** alerts on
   internal conditions that *might* cause problems — high CPU, a pod restart,
   low disk (e.g. "CPU > 80%"). **Page on symptoms, not causes**, because
   symptoms mean users are hurt and causes are often normal/self-correcting.
   Cause signals still belong on **dashboards** as diagnostics you consult *after*
   a symptom alert fires (module 07's investigation).
3. **SLI** = a measured ratio of good to total events (e.g. successful requests /
   total). **SLO** = a target for that SLI over a window (e.g. 99.9% success over
   30 days) — the promise. **Error budget** = `1 − SLO` = the allowed failure
   (0.1%); at 1,000,000 requests that's 1,000 failures you can "afford" in the
   window. It reframes reliability from "never fail" to "stay within a spendable
   budget."
4. Burn rate is how fast you're consuming the error budget relative to the rate
   that would exactly exhaust it over the window (burn rate 14.4 → the whole
   budget gone in ~2 days). It beats a raw threshold on **false positives** —
   requiring a high burn over *both* a short and a long window means a brief blip
   (which can't satisfy the long window) won't page — and on **severity** — a
   huge burn pages immediately while a slow burn only tickets, so urgency scales
   to actual impact instead of a single crude line.
5. Every page must correspond to something a woken human can and must *do now*; if
   the right response is "watch it" or "it self-heals," it should not page (at
   most a ticket/dashboard). The litmus test for any proposed alert: **"If this
   fires, is a *user* being hurt (or imminently), and is there something a human
   must do about it *now*?"** — both must be yes to page.
6. (a) **Grouping/deduplication (Alertmanager):** collapse the many alerts one
   root cause trips into a single notification, so an outage is one page not ten.
   (b) **Runbooks:** a doc linked from the alert with its meaning, how to confirm,
   and first steps — so the page is actionable, not just a wake-up. (c) **Severity
   grading + routing:** page/ticket/info sent to different channels, keeping the
   paging channel sacred for urgent actionable events and demoting the rest.

</details>

## Cumulative review

Closed-book. This covers modules 00-08 — the whole track so far. Write each
answer before expanding, and if one exposes a gap, go redo that module's
exercises rather than just reading the answer.

1. (00+01) A downstream payment provider is timing out. Walk the *entire* correct
   handling path: what the code does (fail-fast vs fail-safe vs propagate,
   fallback/degrade), what the client sees (status + shape), what's logged and at
   what level, and how the error budget (08) is affected differently depending on
   whether you degrade gracefully or return a 5xx.
2. (02+03) You're adding a `PAYMENT_API_KEY` and a `PAYMENT_TIMEOUT_SECONDS`.
   Classify each (static/dynamic/sensitive), say where each comes from and its
   `Settings` type, and name every mechanism across the track (03, 05) that keeps
   the key out of logs, traces, and error responses.
3. (04+05+06) The same failing payment call should leave evidence in all three
   pillars. State precisely what each pillar records for it — the log (level +
   key fields), the metric (type + name + labels), the trace (span + attributes +
   status) — and the one shared id that lets you pivot between them.
4. (06) For the payment integration, give the correct metric type for: total
   charge attempts; charges currently in flight; charge latency distribution;
   and explain why `payment_provider_id` is a fine metric label but
   `payment_intent_id` is not.
5. (07) A user reports "checkout was slow at 2:04pm." You have all three pillars
   correlated. Give the exact sequence of pivots — which pillar you start in,
   what it tells you, what you open next, and how the shared id carries you
   through to the root cause.
6. (08) Your availability SLO is 99.9% and last night a 40-minute partial outage
   burned 60% of the monthly error budget in one go. State: whether a *page*
   should have fired and why (burn rate), what severity a *separate* "disk 75%
   full" condition should have been that same night, and — using the budget —
   what the team's dev-vs-reliability priority should be for the rest of the
   month.
7. (00+04+08) Explain the single thread connecting module 00's "don't swallow
   exceptions," module 04's "don't log normal events at ERROR," and module 08's
   "don't page on non-actionable alerts." What is the one discipline all three
   are instances of, and what does violating it cost you?

<details>
<summary>Answers</summary>

1. **Code:** the provider timeout is an *expected* failure of an unreliable
   dependency (module 00), so wrap the call with a timeout + retries-with-backoff
   for transient failures, and a **fallback/graceful degradation** if one exists
   (queue the charge for later, or return a "payment pending" state) — never
   swallow it silently. If no safe fallback, **propagate** a translated error.
   **Client:** if degraded, a successful/`202`-style response describing the
   pending state; if not recoverable, a `503`/`502` (retryable) with a generic
   safe message + `request_id` (module 01) — never the raw exception. **Logging:**
   a retried-then-succeeded attempt is `WARNING`; an exhausted/failed charge is
   `ERROR` with `log.exception` and fields (`provider`, `order_id`, `request_id`)
   (module 04). **Error budget (08):** returning a 5xx *spends* budget; degrading
   gracefully to a successful-but-degraded response *preserves* it — so good
   error handling directly reduces burn rate and pages.
2. `PAYMENT_API_KEY` = **sensitive**, from a secret store/env, typed as
   **`SecretStr`** in `Settings`. `PAYMENT_TIMEOUT_SECONDS` = **static** (set at
   deploy; or dynamic if you hot-reload it), from env/config, typed as a
   validated `int`/`float`. Keeping the key safe: `SecretStr` renders
   `**********` (03); a **redaction processor** scrubs sensitive keys from logs
   (05); never interpolate it into messages or **span attributes** (05/07); never
   echo config into **error responses** (01). Defense in depth across config,
   logging, and tracing layers.
3. **Log (04/05):** at `ERROR`, `event=payment_failed` with fields `order_id`,
   `provider`, `error_type`, `duration_ms`, `request_id`/`trace_id`, plus the
   traceback via `log.exception`. **Metric (06):** a **counter**
   `payment_attempts_total{provider, outcome="error"}` (and a **histogram**
   `payment_duration_seconds` for latency). **Trace (07):** a span
   `charge_card` with `status=error`, attributes `provider`, `http.status_code`
   (no secrets/PII), nested under the request's root span. The shared **`trace_id`**
   (== the propagated `request_id`) is on all three, so you pivot metric →
   trace → logs.
4. Total charge attempts → **Counter** (`.inc()`, graph `rate()`). Charges in
   flight → **Gauge** (`.inc()/.dec()`). Charge latency → **Histogram**
   (`.observe(seconds)`, for p95/p99). `payment_provider_id` is fine because it's
   **low-cardinality** (a handful of providers); `payment_intent_id` is
   **unbounded** (a new value per charge) and would explode the series count — it
   belongs in logs/traces, queried by id there.
5. Start in **metrics**: the latency histogram / p99 for `/checkout` shows a
   spike around 2:04pm — *that* and *when*. Open a **trace** from that window
   (found via the metric's exemplar or by time+endpoint): the waterfall shows the
   time was in, say, the `billing`/`charge` span — *where*. Take that span's
   **`trace_id`** and filter the **logs** to it: read the `payment_failed`
   `log.exception` with the pool-timeout detail — *why*. The one shared `trace_id`
   (propagated at every hop, stamped on logs, exemplar'd on metrics) is what
   carries you losslessly through all three.
6. **Page:** yes — burning 60% of the *monthly* budget in 40 minutes is an
   extreme burn rate (budget would be exhausted in ~an hour at that pace), which
   is exactly the fast-burn, multi-window condition that should page immediately.
   **Disk 75% full:** a **ticket** (not a page) — real but not urgent, days away,
   a cause not a user-facing symptom; paging on it that night would be noise. 
   **Budget priority:** with 60% of the month's budget spent in one night, the
   remaining budget is thin — the team should **shift from shipping features to
   reliability work** (fix the outage's root cause, add safeguards) until the
   budget recovers, per the error-budget policy.
7. All three are the discipline of **keeping a signal meaningful by not diluting
   it — matching the loudness of a signal to its real importance.** Swallowing an
   exception destroys the signal entirely (a real failure looks like success);
   logging normal events at `ERROR` dilutes the `ERROR` signal until real errors
   are lost in noise; paging on non-actionable alerts dilutes the *page* signal
   until real pages are ignored. Violating it costs you **trust in the signal**:
   in every case the eventual price is a real, serious problem that goes
   unnoticed because the channel that should have surfaced it was trained to be
   ignored (or was never populated). Observability and reliability are built on
   trustworthy signals; noise and silence both break them.

</details>

## Next

[09-graceful-shutdown](../09-graceful-shutdown/README.md) — you can now observe
*and* be alerted about a running system. The next module turns to a specific
operational moment that quietly breaks reliability if mishandled: **shutdown**.
When a container is told to stop (every deploy, every scale-down), a naive
process drops in-flight requests, corrupts work, and fails health checks — burning
error budget on *routine* operations. You'll learn signal handling (SIGTERM),
draining in-flight requests, cleaning up connection pools and background tasks,
and how readiness vs liveness probes should behave during shutdown.
