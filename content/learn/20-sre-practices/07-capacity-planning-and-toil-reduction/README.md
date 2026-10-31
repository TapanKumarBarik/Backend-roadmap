# Capacity Planning and Toil Reduction

## Why this matters

Everything so far has been *reactive* — detect, respond, learn. This module is the
*proactive* half: staying ahead of failure so the pager stays quiet. Capacity
planning uses the historical metrics you've been collecting since
[track 12](../../12-observability-deep-dive/README.md) to forecast when you'll run
out of headroom *before* an incident, and toil reduction attacks the manual work
(defined back in [module 00](../00-sre-concepts-and-the-reliability-mindset/README.md))
that eats the engineering time you'd rather spend making the system more reliable.
Together they're how an SRE team keeps a growing system healthy instead of being
consumed by it — the difference between running the system and the system running
you.

## Concepts

### Capacity planning — forecasting headroom from historical metrics

**Capacity planning** is deciding, ahead of time, that you'll have enough
resources (compute, memory, connections, storage, quota) to serve future demand at
your SLO. The inputs are exactly the metrics track 12 taught you to collect and
query: historical **demand** (request rate, active users, data volume over weeks
and months) and historical **resource usage** (CPU, memory, storage growth) — read
over long windows in PromQL. You look at the **trend**, project it forward
(`predict_linear` in PromQL does exactly this for a resource heading toward a
limit), add headroom for **spikes and known events** (a launch, a sale, seasonal
peaks), and provision *before* the projected demand meets your ceiling. The Cluster
Autoscaler and HPA you configured in
[track 07 module 05](../../07-aks/05-scaling-aks-cluster-autoscaler-and-hpa/README.md)
handle *short-term, automatic* scaling within provisioned limits; capacity planning
is the *longer-horizon, human* decision about what those limits and quotas should
be next quarter, and whether your architecture can even scale that far. Track 23
(performance & load testing) later *validates* these forecasts under real load.

### Organic vs. inorganic growth, and the danger of surprise

Two kinds of demand growth need different planning. **Organic growth** is the
gradual, trend-following increase from more users and more usage — visible in your
historical metrics and *projectable* with something like `predict_linear`.
**Inorganic growth** is the step change from a specific event: a product launch, a
marketing campaign, onboarding a huge customer, a feature that suddenly 10×'s a
workload. Organic growth you forecast from the trend; inorganic growth you can't
see in the trend at all, so you plan for it by **knowing about it in advance** —
which requires SRE to be in the room for launch planning, not surprised by it. The
classic capacity failure is an inorganic event nobody told the SRE team about,
hitting a system provisioned only for its organic trend. The `predict_linear`
forecast protects you from the slow surprise; a launch calendar and SRE
involvement protect you from the fast one.

### Toil, revisited and measured — the toil budget

[Module 00](../00-sre-concepts-and-the-reliability-mindset/README.md) defined
**toil**: manual, repetitive, automatable, tactical, no-lasting-value work that
scales with the service. This module makes it a *managed quantity*. The key insight
is that toil is **dangerous because it scales linearly with the system** — twice
the servers, twice the manual restarts — so an untended service eventually consumes
all of an SRE's time in toil, leaving zero for the engineering that would reduce it,
and the team spirals. The structural defense is the **toil budget / toil cap**: a
ceiling (Google's well-known figure is **50%**) on how much of an SRE's time may go
to toil, with the rest *protected* for engineering that pays the toil down. You
**measure** toil the same way you measure reliability — track it (surveys, ticket
categorization, time tracking), watch the percentage, and treat "toil is over 50%"
as a problem to fix, exactly as you'd treat an exhausted error budget. The toil
budget is the reliability-loop's answer to the module 00 question "how do we keep
the system from consuming the team."

### Identifying and automating away toil

To reduce toil you first have to *see* it, which is why postmortem action items
(module 06) and the on-call review (module 04) are such rich sources — the manual
step you did during three incidents *is* the toil to automate. The prioritization
is simple economics: automate the toil with the **highest frequency × time-per-
occurrence × people-affected**, and where the automation cost is less than the toil
it eliminates over a reasonable horizon. Concretely, toil reduction looks like the
skills from earlier tracks pointed at operations: a manual multi-cluster config
copy becomes a GitOps sync (track 10); a nightly manual pod restart becomes a
liveness probe or an operator; a hand-run remediation becomes a script, then a
scheduled job, then a self-healing controller. Not all toil is worth automating —
a five-minute task done once a year isn't — so the discipline is *measuring* toil
and attacking the biggest sources, not reflexively automating everything. The goal
isn't zero toil (impossible); it's keeping toil *below the cap* so engineering
capacity survives as the system grows.

### Closing the loop — how capacity and toil feed back into the whole track

These two disciplines are where the SRE loop from module 00 becomes
self-sustaining. Capacity planning uses the **metrics** (track 12) to prevent the
incidents that would otherwise trigger the response/postmortem machinery. Toil
reduction turns **postmortem action items** (module 06) and **on-call review
findings** (module 04) into automation that shrinks future operational load,
protecting the engineering time that makes *everything else* — better SLOs, better
alerts, better runbooks — possible. And both are governed the same way reliability
is: by a **budget** (error budget for reliability, toil budget for operational
load) that turns a fuzzy goal into a tracked number that forces a decision when
breached. That symmetry — reliability and toil each capped, measured, and acted on
— is the mature end state this whole track has been building toward, and it's
exactly what the capstone asks you to demonstrate end to end.

## Command reference

Capacity planning is PromQL over long windows (track 12); toil reduction is the
automation skills from tracks 07/10 pointed at operational work.

| PromQL / concept | What it does | Notes |
|---|---|---|
| `predict_linear(metric[6h], 3600*24*4)` | Projects a metric forward using linear regression over the range | forecast time-to-limit |
| `deriv(metric[1h])` | Per-second derivative — growth *rate* of a resource | trend slope |
| `avg_over_time(metric[30d])` | Long-window baseline for demand/usage | capacity baseline |
| `max_over_time(metric[30d])` | Historical peak — size for spikes, not averages | headroom for peaks |
| HPA / Cluster Autoscaler | Short-term *automatic* scaling within limits | track 07 module 05 |
| Toil cap (~50%) | Ceiling on SRE time spent on toil | this module |
| Toil measurement | Surveys / ticket categorization / time tracking | quantify before cutting |

`predict_linear` — the core capacity-forecasting function, flag by flag:

```promql
predict_linear(node_filesystem_avail_bytes{mountpoint="/data"}[6h], 3600 * 24 * 4) < 0
```
- `node_filesystem_avail_bytes{...}` — the resource you're worried about running
  out of (here, free disk on the data volume).
- `[6h]` — the historical range the linear regression is fit over; longer smooths
  noise but reacts slower to a recent change in slope.
- `3600 * 24 * 4` — how many **seconds into the future** to project (here 4 days).
  `predict_linear` returns the metric's *predicted value* at that future time.
- `< 0` — the alertable condition: "will free space be projected to hit zero within
  4 days?" This turns capacity into an *early-warning alert* (route it `warning`,
  it's a slow-burn-style ticket, not a 3am page — module 03/04) so you provision
  *before* the wall, not during an outage.

## Hands-on exercises

Continue on the **kind** cluster with `kube-prometheus-stack` from track 12. You'll
forecast with real historical metrics and reason about toil from your own earlier
modules' artifacts. Some exercises are analysis/writing — capacity and toil are
judgment disciplines, not one-liners.

1. **(WSL2) Forecast a resource to its limit.** Pick a growing metric on your
   cluster (node disk, a PVC's used bytes, memory of a pod under steady load). Use
   `predict_linear` to project when it hits its limit at the current trend. Then
   deliberately change the load and re-run — watch the projection move. This is
   organic-growth forecasting on real data.

2. **(WSL2) Turn the forecast into an early-warning alert.** Write a
   `PrometheusRule` using the `predict_linear(...) < 0` (or `< limit`) pattern from
   the command reference, routed `severity: warning` (a ticket, not a page — it's a
   slow, plannable problem). Confirm it loads (`release` label) and reason about
   what window and horizon are appropriate — too short a horizon warns too late,
   too long over-reacts to noise.

3. **(WSL2) Baseline demand and size for the *peak*, not the average.** For the
   demo app's request rate, compute `avg_over_time` and `max_over_time` over your
   longest window. Write one sentence on why you provision for the peak (plus
   headroom) rather than the average, and connect it to the HPA/Cluster Autoscaler
   limits from track 07 module 05 (autoscaling handles *within* limits; you set the
   limits from this analysis).

4. **(paper) Plan for an inorganic event.** A product launch is expected to 5× a
   workload's traffic on a known date. Your `predict_linear` trend shows nothing
   (it's not organic). Write the capacity plan: how you size for it, what headroom,
   what you'd pre-scale, and — the real lesson — how the SRE team *finds out* about
   such events in time. Contrast with the failure of learning about it from the
   outage.

5. **(paper) Inventory and measure your toil.** From your own module 04 on-call
   review log and module 06 postmortem action items, list every manual operational
   task. For each, estimate frequency × time-per-occurrence × people-affected to get
   a rough toil score. Rank them. You've just done the measurement that must precede
   any automation.

6. **(paper) Pick what to automate — and what not to.** From your ranked list,
   choose the top 2-3 to automate and name the *specific* earlier-track mechanism
   that eliminates each (GitOps sync from track 10, a liveness probe/operator from
   track 03/07, a scheduled job, a self-healing controller). Then pick one toil
   item you would *deliberately not* automate and justify why (rare, cheap,
   automation costs more than it saves). This is the economics of toil reduction.

7. **(paper) Set and defend a toil budget.** Propose a toil cap for your team,
   describe how you'd *measure* actual toil against it, and write what happens when
   toil exceeds the cap (the parallel to an exhausted error-budget policy from
   module 02: protect engineering time, redirect effort to automation). Explain why
   an uncapped toil load is guaranteed to grow until it consumes the team.

8. **Diagnose and fix: the team drowning in toil while "too busy to automate."**
   A recognizable death spiral. Scenario: an SRE team spends ~80% of its time on
   manual toil (nightly restarts, hand-copied configs, re-running failed jobs), the
   service keeps growing so the toil grows with it, and every proposal to automate
   is deferred because "we're too busy firefighting to build automation." Pages per
   shift are climbing (module 04) and postmortem action items never ship (module
   06) because nobody has time. **Diagnose** the spiral: toil scales with the
   system, so without a *protected* engineering fraction it only ever increases,
   and "too busy to automate" guarantees it never decreases — the team is
   trending toward 100% toil and burnout. **Fix** with the toil-budget mechanism:
   *cap* toil (protect, say, the bottom 50% of time for engineering *no matter
   what*), measure it, and treat exceeding the cap as a first-class problem —
   pull people *off* firefighting onto the highest-value automation from exercise
   6, accept slightly more short-term pain to buy the durable reduction. Lesson:
   **toil that scales with the system and is never capped always wins; the toil
   budget is the only thing that forces the team to spend engineering time paying
   it down — exactly as the error budget forces the reliability conversation
   (module 02).**

## Independent challenge

Drawing on this module, the historical metrics and PromQL from
[track 12](../../12-observability-deep-dive/02-promql-in-depth/README.md), the
autoscaling from
[track 07 module 05](../../07-aks/05-scaling-aks-cluster-autoscaler-and-hpa/README.md),
the postmortem action items from [module 06](../06-blameless-postmortems/README.md),
and the automation skills from
[track 10](../../10-cicd-and-gitops/README.md), produce a *combined capacity-and-toil
plan* for a service — no queries or thresholds given. On the capacity side:
baseline the service's demand and resource usage from real historical metrics,
forecast the first resource that will hit a limit under organic growth (with a
`predict_linear`-based early-warning alert routed as a ticket), and state how you'd
plan for one known inorganic event. On the toil side: inventory the service's toil
from your own earlier artifacts, score and rank it, propose a toil budget with a
measurement method, and pick the top automation to build (naming the earlier-track
mechanism that implements it). The deliverable is the *plan plus the two budgets* —
a capacity forecast and a toil cap — because the mature SRE end state is
reliability and operational load *both* measured, budgeted, and acted on, which is
exactly what the capstone integrates.

<details>
<summary>Stuck? One hint</summary>

For capacity, the highest-value single artifact is a `predict_linear` alert on
whichever resource is on the steepest slope toward a hard limit (disk and memory
are the usual suspects) — fit it over a window long enough to smooth noise, project
far enough ahead that a human can act (days, not minutes), and route it `warning`
because it's a plannable ticket, never a page. For toil, don't automate by gut:
score each item by frequency × time × people-affected (your module 04 review log
and module 06 action items are the source data), then automate only where the
build cost is less than the toil saved over a sensible horizon — and cap the total
so engineering time is *protected*, treating "over the cap" exactly like an
exhausted error budget in module 02.

</details>

## Common mistakes & troubleshooting

- **Provisioning for the average.** Averages hide peaks; you fall over at the peak.
  Size for `max_over_time` plus headroom, and let autoscaling handle the rest
  *within* those limits.
- **Forecasting only organic growth.** `predict_linear` can't see a launch that
  isn't in the trend. Plan inorganic events explicitly, which means SRE must know
  about them in advance.
- **Capacity alerts as pages.** A projected disk-full in 4 days is a *ticket* to
  plan around, not a 3am page. Route it `warning` (module 03/04).
- **`predict_linear` horizon/window wrong.** Too short a projection warns too
  late; too long a fit window reacts too slowly to a changed slope. Tune both to
  give a human time to act.
- **Automating toil you never measured.** Reflexively automating a rare, cheap task
  can cost more than the toil it saves. Measure (frequency × time × people) and
  attack the biggest sources.
- **No toil cap.** Toil scales with the system, so uncapped it grows until it
  consumes the team. Cap it, measure against the cap, protect engineering time.
- **"Too busy to automate."** The death spiral — the busier you are with toil, the
  more you need the automation you're refusing to build. The toil budget exists
  precisely to force the time.

## Checkpoint quiz

Write down your answer to each question before expanding it — checking without attempting first is the single easiest way to fool yourself into thinking you've learned this.

<details>
<summary>Show questions</summary>

1. What inputs does capacity planning use, and what PromQL function forecasts a
   resource toward a limit?
2. Distinguish organic from inorganic growth. How do you plan for each, and which
   one `predict_linear` cannot help with?
3. Why is a capacity-forecast alert a ticket rather than a page?
4. Why is toil specifically dangerous *as a system grows*, and what's the
   structural defense?
5. How do you decide *which* toil to automate, and give an example of toil you'd
   deliberately *not* automate.
6. What is the toil budget, and how does it parallel the error budget from
   module 02?
7. Explain the "too busy to automate" death spiral and how the toil budget breaks
   it.

</details>

<details>
<summary>Show answers</summary>

1. Historical **demand** (request rate, users, data volume) and **resource usage**
   (CPU/memory/storage) read over long windows in PromQL (track 12). The
   forecasting function is `predict_linear`, which projects a metric forward by
   linear regression to estimate when it hits a limit.
2. **Organic** = gradual trend-following growth from more usage — forecast it from
   the trend with `predict_linear`. **Inorganic** = a step change from a specific
   event (launch, campaign, big customer) — plan for it by knowing in advance,
   since it isn't in the trend. `predict_linear` cannot help with inorganic growth.
3. Because it's a slow, *plannable* problem days out, not an active user-facing
   outage — you provision ahead of the wall during business hours. Route it
   `warning` (module 03/04); paging on it is alert fatigue.
4. Because toil scales linearly with the system — more servers, more manual work —
   so an untended service eventually consumes all of an SRE's time in toil, leaving
   none to reduce it. The defense is the **toil cap** (~50%), protecting an
   engineering fraction that pays toil down.
5. Measure it first (frequency × time-per-occurrence × people-affected) and
   automate the biggest sources where automation cost < toil saved over a sensible
   horizon. You'd *not* automate a rare, cheap task (e.g. a 5-minute action done
   once a year) where the automation costs more than it saves.
6. A ceiling (~50%) on how much SRE time may be toil, measured and enforced. It
   parallels the error budget: both turn a fuzzy goal into a tracked number and
   force a specific response when breached (error budget → freeze/invest; toil
   budget → pull people onto automation, protect engineering time).
7. The busier a team is with toil, the less time it has to build the automation
   that would reduce it, and since toil grows with the system it only gets worse —
   trending to 100% toil and burnout. The toil budget breaks it by *protecting*
   engineering time no matter how busy things are, forcing the team to spend it
   paying toil down.

</details>

## Next

[08-capstone-project](../08-capstone-project/README.md) — you now have the full SRE
discipline: mindset, SLIs/SLOs, error budgets, burn-rate alerting, on-call,
incident response, blameless postmortems, and capacity/toil management. The
capstone runs the *entire loop* once, end to end, on the real track 12 stack — a
defined SLO, a burn-rate alert that fires under a simulated bad deploy, a runbook,
a full incident response, and a blameless postmortem with real action items.
