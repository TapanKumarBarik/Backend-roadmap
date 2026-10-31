# Error Budgets

## Why this matters

The error budget is the single most important idea in this whole track: it's the
number that turns the dev-velocity-vs-reliability tension from
[module 00](../00-sre-concepts-and-the-reliability-mindset/README.md) from a
political argument into arithmetic. It falls straight out of the SLO you set in
[module 01](../01-slis-and-slos/README.md) — if your SLO is 99.9%, you have
explicitly *budgeted* 0.1% failure, and that budget is a resource you get to
spend on risk. This module teaches you to compute it, watch it drain, decide what
happens when it's gone, and use it to make an actual "ship or freeze" call.

## Concepts

### The error budget is `1 − SLO`

If your SLO says 99.9% of requests should succeed over 30 days, you are saying the
remaining **0.1% are *allowed* to fail** — that 0.1% is your **error budget**.
It's the maximum unreliability you've decided is acceptable, expressed as a
fraction, a request count, or an amount of downtime. The reframe is everything:
those failures aren't a moral failing to drive to zero, they're a **budget you're
*expected* to spend**. A month where you used none of your error budget doesn't
mean you're winning — it may mean your SLO is too loose, or that you're being far
more conservative with releases than you need to be and leaving velocity on the
table. The budget exists to be spent, deliberately, on shipping and on
maintenance risk.

### Computing the budget three ways

The same budget can be expressed in whichever unit makes the decision clearest.
Start from `error budget fraction = 1 − SLO`. Then:

- **As downtime** (for a time-based/availability SLO): `budget = (1 − SLO) ×
  window`. For 99.9% over 30 days: `0.001 × 43,200 min ≈ 43.2 minutes` of allowed
  downtime this window — the same figure from module 00's table, now understood
  as a budget.
- **As a request count** (for a request-ratio SLO): `budget = (1 − SLO) × total
  valid requests`. At 99.9% and 10 million requests/month you may fail up to
  `0.001 × 10,000,000 = 10,000` requests before you've breached.
- **As budget *remaining*:** `remaining = budget − consumed so far`. This is the
  live number you watch — "we have 12 of our 43 minutes left with 8 days to go."

Which unit you use depends on the SLO type, but they're the same idea: a finite
allowance of failure per window.

### Spending the budget — every source of unreliability draws it down

*Anything* that makes requests fail or the service unavailable spends the budget,
and it doesn't care whether the cause was "good" or "bad": a risky feature deploy
that 500s for ten minutes, a bad config push, an infra outage, a failed
migration, *and* a planned maintenance window all draw from the same account.
This is the crucial mental shift — the error budget doesn't distinguish
"legitimate" downtime from "our fault" downtime, because from the user's side
there's no difference. It means every release is a *withdrawal* against the
budget, which is exactly why the budget can govern release decisions: if you're
flush, you can afford risky withdrawals (ship fast, experiment); if you're nearly
overdrawn, you can't. The burn-rate alerting in
[module 03](../03-slo-dashboards-and-burn-rate-alerts/README.md) is literally
"how fast is this account draining right now."

### The error-budget policy — what happens when it's gone

A budget with no consequence for overspending is just a number. An **error-budget
policy** is the *agreed-in-advance* rule for what the team does as the budget
depletes and when it's exhausted — written down and signed off by both engineering
*and* product *before* an incident, so it's not negotiated in the heat of one. A
typical policy has tiers: while budget remains, ship freely; when it drops below
some threshold (say 25% left), slow down and require extra review; when it's
**exhausted**, a **feature freeze** kicks in — no new feature launches, all
engineering effort redirects to reliability work until you're back within SLO.
The freeze isn't a punishment; it's the mechanism that makes the budget *mean*
something. The power of writing it down beforehand is that it removes the argument:
when the budget's gone, the freeze is policy, not a debate about whether this
particular feature is important enough.

### Using the budget to make a real ship-vs-slow-down decision

Here's the whole point in action. A team wants to ship a risky feature. Instead of
arguing about it, they look at the budget: *"We're at 60% of our error budget
remaining with 10 days left in the window — we can afford to ship this and absorb
a bad rollout."* Or: *"We're at 5% remaining with 12 days to go and burning fast —
freeze; the next incident breaches SLO and possibly the SLA."* The budget converts
"should we ship?" (opinion) into "do we have the budget to ship?" (arithmetic).
It also cuts *both* ways, which is what makes it credible: a team consistently
*under*-spending its budget is being too conservative and should ship faster or
tighten the SLO — the error budget gives developers ammunition to *increase*
velocity, not just a stick to slow them down. That symmetry is why both dev and
product accept it.

### Budget windows and how failure "ages out"

Because the SLO window is a **rolling** window (module 01), so is the budget. A
bad incident that spent 20 minutes of your 43-minute budget doesn't stay charged
forever — as the incident passes out the back of the 30-day rolling window, that
consumption *ages out* and the budget replenishes. This has real operational
consequences: a big outage early in the window depresses your remaining budget
for the next 30 days, then recovers; you can sometimes "wait out" a depleted
budget as an old incident rolls off. It also means the budget is a *lagging*
measure of the whole window, which is precisely why you don't alert on "budget
below X" alone — a slow, steady burn and a sudden catastrophic burn deplete the
same total but demand very different responses. Distinguishing them is the
**burn rate**, and building alerts on it is the entire next module.

## Command reference

Budget math is arithmetic first; you compute it in PromQL once you've internalized
it. The recorded SLI series from module 01 exercise 8 feed these.

| Formula / PromQL | What it computes | Notes |
|---|---|---|
| `1 − SLO` | Error budget as a fraction | 99.9% → 0.001 |
| `(1 − SLO) × window` | Allowed downtime this window | 0.001 × 43,200 min ≈ 43.2 min |
| `(1 − SLO) × total_requests` | Allowed failed requests | 0.001 × 10M = 10,000 |
| `1 − (good / valid)` | Current error *ratio* (budget spend rate) | complement of the SLI |
| `(1 − SLO − (1 − SLI)) / (1 − SLO)` | Fraction of budget *remaining* | see below |

Error-budget-remaining as a PromQL expression (build on module 01's recorded
SLI):

```promql
1 - (
  (1 - (sum(rate(sli_good[30d])) / sum(rate(sli_valid[30d]))))
  /
  (1 - 0.999)
)
```
- inner `sum(rate(sli_good[30d])) / sum(rate(sli_valid[30d]))` — the **SLI** over
  the full window (module 01).
- `1 - (SLI)` — the **error ratio actually observed** (fraction of requests that
  failed).
- `/ (1 - 0.999)` — divide observed errors by the **budgeted** error fraction
  (`1 − SLO`). This gives *fraction of budget consumed*; `= 1.0` means exactly
  spent, `> 1.0` means overspent (SLO breached).
- outer `1 - (...)` — flips consumed into **remaining**; `1.0` = full budget,
  `0.0` = exhausted, negative = over budget. This is the single number an SLO
  dashboard shows as "budget remaining."

## Hands-on exercises

Continue on the **kind** cluster with `kube-prometheus-stack` and the demo app's
SLI recording rules from [module 01](../01-slis-and-slos/README.md) exercise 8.

1. **(paper) Compute the budget three ways.** For an SLO of 99.9% over 30 days
   with 20 million requests/month, compute the error budget as (a) a fraction,
   (b) allowed downtime in minutes, (c) allowed failed requests. Then redo all
   three for 99.99% and note how much smaller each becomes — this is module 00's
   "every nine costs 10×" made concrete as a spendable budget.

2. **(WSL2) Compute *budget remaining* live.** Using the SLI recording rules,
   write the budget-remaining PromQL from the command reference for the demo
   app's availability SLO. It should read near 1.0 (full) when healthy. Inject
   errors (as in module 01 exercise 1) and watch the number fall. You are now
   watching an account drain in real time.

3. **(WSL2) Spend the budget on purpose and measure it.** Cause a controlled
   "incident": drive 5xx traffic for a fixed number of minutes, then compute how
   much of the budget that incident consumed (as a fraction and as minutes). Then
   answer: at that spend rate, how many more such incidents until the budget is
   exhausted this window? This is the core intuition burn-rate alerting
   formalizes next module.

4. **(paper) Make a real ship-vs-slow-down call — flush budget.** Scenario: 65%
   of the error budget remains, 8 days left in the window, and the team wants to
   ship a risky migration. Write the decision *and the one-sentence justification
   in budget terms*. Then flip it: 4% remaining, 15 days left, burning steadily —
   write that decision. The deliverable is that both decisions are made in *budget
   arithmetic*, not opinions.

5. **(paper) Write an error-budget policy.** Draft a three-tier policy for the
   demo service: what the team does while budget is healthy, at a warning
   threshold, and when exhausted (the feature-freeze tier). Include *who* signs
   off (engineering + product) and *when* it's agreed (before incidents). Keep it
   short enough to actually be followed — a page nobody reads is no policy.

6. **(paper) Argue the *under*-spend case.** A team has spent only 3% of its error
   budget every month for six months and is proud of it. Write the SRE critique:
   why is chronic under-spending a *problem*, what two things could it mean, and
   what would you change (ship faster, or tighten the SLO)? This proves you
   understand the budget cuts both ways.

7. **Diagnose and fix: the budget that's already exhausted — and the conversation
   that should follow.** Reproduce a service that has *already* breached: set (or
   simulate via injected errors over a long window) an SLO of 99.9% while the
   measured SLI is 99.5% — the budget-remaining expression from exercise 2 goes
   **negative**. The technical "fix" is trivial and the *wrong* instinct is to
   just loosen the SLO to 99% so the dashboard goes green again. **Diagnose** the
   real situation: the budget is overspent, which under the policy from exercise 5
   means a *feature freeze and reliability work*, not moving the goalposts.
   Write the conversation that should actually happen: is the SLO wrong (was it
   ever achievable — module 01's "measure first"?), or is the *service* genuinely
   too unreliable and owed engineering investment? **Fix** by either
   re-justifying the SLO with data *or* triggering the policy — never by silently
   relaxing the target to hide the breach. Lesson: **an exhausted budget is a
   signal to change behavior (freeze, invest) or to honestly re-derive the SLO
   with data — never to quietly move the target so the red goes away.**

8. **(WSL2) Turn budget-remaining into a recording rule.** So module 03 can alert
   on it cheaply, record the budget-remaining and the short-window burn as named
   series (e.g. `job:error_budget_remaining:ratio`). Confirm they load
   (remember the `release` label). You now have the substrate module 03 builds
   burn-rate alerts on.

## Independent challenge

Drawing on this module, the SLO you defined in
[module 01](../01-slis-and-slos/README.md), and the CI/CD pipeline you built in
[track 10](../../10-cicd-and-gitops/README.md), design a *complete error-budget
regime* for one service and connect it to release decisions — no formulas or
policy text given. Compute the service's budget in all three units for its SLO;
write a tiered error-budget policy naming the exact thresholds at which behavior
changes and who agreed to it; and then describe, concretely, *how the policy
touches your actual pipeline* — e.g. what a CI check that reads budget-remaining
and blocks a feature deploy when the budget is exhausted would look like
conceptually (which metric it queries, what it does at each tier). The deliverable
is the *linkage*: an error budget that lives only on a dashboard changes no
behavior; one wired into the decision to ship is the real thing. State honestly
where a human still has to make the call and where you'd automate it.

<details>
<summary>Stuck? One hint</summary>

The budget-remaining PromQL from this module's command reference is the single
number your policy keys off. Your CI gate (track 10) is conceptually just: query
`job:error_budget_remaining:ratio` before a *feature* deploy; if it's above the
warning tier, proceed; if between warning and zero, proceed only with extra
sign-off; if at or below zero, fail the deploy with a message pointing at the
freeze policy — *but* always allow reliability/rollback deploys through, since
those *restore* budget. The subtlety to write about: you never want the gate to
block the fix for the very outage that drained the budget, so the freeze is on
*features*, not on all deploys.

</details>

## Common mistakes & troubleshooting

- **Treating the budget as "errors to eliminate."** It's a budget to *spend*.
  Zero spend usually means an SLO that's too loose or a team leaving velocity on
  the table, not a triumph.
- **Loosening the SLO to hide a breach.** When the budget's exhausted, relaxing
  the target so the dashboard goes green is moving the goalposts. Either re-derive
  the SLO honestly with data, or trigger the policy (freeze + invest).
- **A policy negotiated during the incident.** If you decide what to do about an
  exhausted budget *while* it's exhausted, the loudest voice wins. Agree the
  policy — thresholds and consequences — in advance, with product's sign-off.
- **Freezing *all* deploys.** The freeze is on new *features*, never on the
  reliability fixes and rollbacks that restore the budget. Blocking the fix for
  the outage that drained the budget is self-defeating.
- **Alerting on total budget alone.** "Budget below 25%" doesn't distinguish a
  slow drain from a catastrophic burn. That's what burn rate (module 03) is for.
- **Ignoring the rolling window.** Budget replenishes as old incidents age out;
  a currently-red budget from a two-week-old outage may recover on its own.
  Charge decisions to the *current* window, not to a calendar month.
- **Distinguishing "planned" from "unplanned" downtime in the budget.** The
  budget doesn't care — users don't either. Planned maintenance spends the budget
  exactly like an outage does.

## Checkpoint quiz

Write down your answer to each question before expanding it — checking without attempting first is the single easiest way to fool yourself into thinking you've learned this.

<details>
<summary>Show questions</summary>

1. Give the error-budget formula and compute the allowed monthly downtime for a
   99.95% SLO over 30 days.
2. Why is spending *none* of your error budget potentially a problem, not a
   success?
3. Name three different things that all draw from the same error budget, and
   explain why the budget doesn't distinguish them.
4. What is an error-budget policy, when must it be agreed, and what's the typical
   consequence when the budget is exhausted?
5. Translate this into a decision using budget language: "team wants to ship a
   risky feature; 60% budget remains, 9 days left." And the opposite: "5%
   remains, 14 days left, burning fast."
6. When the budget's exhausted, why is loosening the SLO the *wrong* fix, and what
   are the two legitimate responses?
7. Why do you *not* freeze all deploys during a feature freeze?
8. Why isn't "total budget remaining below 25%" a sufficient alerting condition on
   its own?

</details>

<details>
<summary>Show answers</summary>

1. `error budget = 1 − SLO`. For 99.95%: `1 − 0.9995 = 0.0005`;
   `0.0005 × 43,200 min ≈ 21.6 minutes` of allowed downtime over 30 days.
2. Because the budget exists to be *spent* on shipping and maintenance risk.
   Chronic zero spend means either the SLO is too loose (not constraining
   anything) or the team is being needlessly conservative and leaving release
   velocity unused.
3. Any three of: a risky feature deploy, a bad config push, an infra outage, a
   failed migration, planned maintenance. The budget doesn't distinguish them
   because from the *user's* side there's no difference between "our fault" and
   "planned" downtime — a failed request is a failed request.
4. A pre-agreed, written rule for what the team does as the budget depletes and
   when it's exhausted. It must be agreed *before* incidents, signed off by
   engineering and product. Typical exhausted-budget consequence: a feature
   freeze — all effort redirects to reliability until back within SLO.
5. First: "We have budget to spend — ship it and absorb a bad rollout." Second:
   "We're nearly overdrawn and burning; freeze — the next incident breaches SLO."
   The decision is arithmetic on remaining budget, not opinion.
6. Loosening the SLO just moves the goalposts to hide the breach without changing
   reality — users are still hurt. The legitimate responses: (a) re-derive the
   SLO honestly with data if it was never achievable (module 01's "measure
   first"), or (b) trigger the policy — freeze features and invest in reliability.
7. Because reliability fixes and rollbacks *restore* the budget; freezing them
   would block the fix for the very outage that drained it. The freeze targets
   new features only.
8. Because it can't tell a slow steady drain (fine, will age out) from a sudden
   catastrophic burn (page now). The same total depletion demands very different
   responses — you need the *rate* of burn, which is module 03.

</details>

## Cumulative review

Closed book. Cover the answers and write each out before checking. These mix
everything so far — the reliability mindset (module 00), SLIs/SLOs (module 01),
and error budgets (this module) — plus the track 12 metrics foundation they all
sit on.

1. A PM demands a 100% availability SLO. Give the two-part rebuttal (cost and
   user perception) and say what you'd propose instead and how you'd pick the
   number. (modules 00-01)
2. Write, in PromQL against `http_requests_total`, an availability SLI, and say
   why it's expressed as a ratio rather than a raw failure count. (module 01 +
   track 12 module 02)
3. Why is "average latency < 300ms" a bad SLI, and what's the correct latency SLI?
   (module 01)
4. Your SLA promises customers 99.9%. What internal SLO would you set and why must
   it differ, and what happens on the day you breach each? (module 01)
5. Compute the error budget (fraction and 30-day minutes) for a 99.9% SLO, then
   say what "spending" it means and give two distinct things that spend it.
   (module 02)
6. A service has used 0% of its error budget for six months. Is that good? What
   does it signal and what would you change? (modules 00, 02)
7. The budget-remaining number just went negative. Walk through the *correct*
   response and name the wrong instinct you must resist. (module 02)
8. Classify each as a good SLI or not, and why: (a) request success ratio, (b)
   node CPU %, (c) fraction of requests under 300ms, (d) Prometheus `up`.
   (modules 00-01)
9. Explain why the error budget makes the "ship vs. freeze" decision *symmetric*
   — how it can both slow developers down and give them license to go faster.
   (modules 00, 02)
10. Why is "total budget below 25%" not enough to alert on, and what property of
    the burn distinguishes a slow drain from a catastrophe? (module 02, forward
    to 03)

<details>
<summary>Show answers</summary>

1. **Cost:** each nine is ~10× the effort for ~10× less downtime, and 100% is
   unachievable. **Perception:** the user's own network drops more than the
   marginal nine would save, so they can't tell. Propose a measured SLO set from
   current performance and user tolerance, tightened over time — not 100%, not
   nothing.
2. `sum(rate(http_requests_total{code!~"5.."}[30d])) /
   sum(rate(http_requests_total[30d]))`. A ratio is scale-independent — 99% means
   the same at any traffic volume — while a raw 5xx count needs a different
   threshold at every load level.
3. An average hides the tail where users actually suffer (a few 10s requests
   vanish into the mean). Correct SLI: the *fraction of requests faster than the
   threshold*, e.g. "95% under 300ms," from histogram buckets.
4. Set the SLO stricter — e.g. 99.95% — with margin. It must differ so your own
   alarm fires *before* the contract breaks. Breach the SLO: internal warning,
   error-budget policy kicks in. Breach the SLA: contractual penalty/credits owed
   to the customer.
5. `1 − 0.999 = 0.001`; `0.001 × 43,200 ≈ 43.2 min`. Spending it = consuming that
   allowance through any unreliability. Two spenders: a risky feature deploy that
   errors; an infra outage (or planned maintenance).
6. Not necessarily good — it signals the SLO is too loose or the team is
   over-conservative. Change: ship faster (spend the budget on velocity) or
   tighten the SLO so it actually constrains.
7. Correct response: recognize the budget is overspent → trigger the policy
   (feature freeze + reliability investment) *or* honestly re-derive the SLO with
   data if it was never achievable. Wrong instinct to resist: quietly loosening
   the SLO to make the dashboard green (moving the goalposts).
8. (a) Good — user-felt success symptom. (b) Not — a cause/resource metric,
   green or red independent of user pain. (c) Good — the correct latency SLI. (d)
   Not — `up` only means the process is scrapable/alive, not that requests
   succeed.
9. It's the same number read two ways: below the freeze threshold it *forbids*
   risky feature work; well above it, it *licenses* faster shipping and more
   experimentation. Because it can increase velocity as well as restrain it,
   developers accept it as fair rather than as a pure brake.
10. Total budget can't distinguish a slow drain that will age out from a sudden
    catastrophic burn needing an immediate page. The distinguishing property is
    the **burn rate** — how fast the budget is draining right now relative to the
    steady-state rate (module 03).

</details>

## Next

[03-slo-dashboards-and-burn-rate-alerts](../03-slo-dashboards-and-burn-rate-alerts/README.md)
— you can compute and spend a budget; now watch it *live* and get paged only when
it's draining fast enough to matter. This is the payoff of track 12: multi-window,
multi-burn-rate alerting on the exact Prometheus/Grafana/Alertmanager stack you
built there, with burn-rate math driving the threshold instead of a static one.
