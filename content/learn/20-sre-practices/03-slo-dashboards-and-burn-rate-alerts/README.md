# Building SLO Dashboards and Burn-Rate Alerts

## Why this matters

This is the payoff of [track 12](../../12-observability-deep-dive/README.md): you
built Prometheus, Grafana, and Alertmanager to make a system observable, and now
they become the machinery that watches an SLO and pages a human *only when the
error budget is draining fast enough to matter*. Burn-rate alerting fixes the
central weakness of the static-threshold alerts from
[track 12 module 06](../../12-observability-deep-dive/06-alerting-and-on-call-basics/README.md)
— it pages proportionally to *how fast you're consuming your budget*, so a slow
drift becomes a ticket and a catastrophic burn becomes an immediate page, with far
less alert fatigue. It reuses the exact Alertmanager routing you already wrote,
now with burn-rate math driving the threshold instead of a hand-picked number.

## Concepts

### Burn rate — how fast you're spending the budget

**Burn rate** is the multiplier on how fast you're consuming your error budget
relative to the rate that would exactly exhaust it over the SLO window. A burn
rate of **1** means you're spending the budget at the steady pace that uses
*exactly* all of it by the end of the window — sustainable, on target. A burn rate
of **10** means you're burning ten times that fast: the entire 30-day budget would
be gone in three days. Concretely, `burn rate = observed error ratio / (1 − SLO)`
— your current error fraction divided by the budgeted error fraction. This single
number is what module 02 said "total budget remaining" couldn't give you: it
distinguishes a slow drift (burn rate ~1-2, will age out, ticket) from a
five-alarm fire (burn rate 14+, budget gone in hours, page now). Alerting on burn
rate instead of a static error threshold is the whole idea.

### Why a single window is wrong — the speed/precision trade-off

Suppose you alert when the burn rate over the last **5 minutes** exceeds some
threshold. It reacts *fast* to a sudden spike — good — but it's twitchy: a
30-second blip can trip it, and it *resets* the instant the blip passes, so you
get a flappy page that self-heals before anyone looks. Now suppose you use a
**1-hour** window instead: it's stable and won't flap, but it reacts *slowly* — a
genuine hard-down outage takes many minutes to build up enough average to fire,
burning budget the whole time. This is a fundamental trade-off: **short windows
are fast but noisy; long windows are stable but slow.** No single window gives you
both fast detection *and* low false-positive rate. The fix is to use *two windows
at once*.

### Multi-window alerting — a short window to confirm, a long window for signal

The standard resolution (from the Google SRE workbook) is **multi-window**
alerting: fire only when the burn rate is high over a **long** window *and* still
high over a **short** window. The long window (say 1 hour) provides the real
signal — a sustained high burn worth paging on. The short window (say 5 minutes,
typically 1/12 of the long one) acts as a **"is it still happening right now?"
gate**: it makes the alert *reset quickly* once the problem stops, so you don't
keep getting paged for an outage that already recovered. So the condition is
`burn_rate[1h] > threshold AND burn_rate[5m] > threshold` — the long window
decides *whether* it's page-worthy, the short window decides *when to stop*. This
directly reuses the `and` operator and rate windows from
[track 12 module 02](../../12-observability-deep-dive/02-promql-in-depth/README.md).

### Multi-burn-rate — a fast-burn page and a slow-burn ticket

The other half is **multi-burn-rate**: you run *several* alerts at different
burn-rate thresholds and window pairs, each consuming a different fraction of the
budget before it fires, routed to different severities. The canonical pair:

- **Fast burn** — a high burn rate (e.g. **14.4×**) over a *short* window pair
  (1h / 5m). At 14.4×, you'd exhaust a 30-day budget in ~2 days; this fires when
  ~2% of the monthly budget is gone and **pages** (`severity: critical`) —
  something is badly wrong *now*.
- **Slow burn** — a lower burn rate (e.g. **3×**) over a *long* window pair (6h /
  30m or 24h / 2h). This catches a persistent low-grade drain that would quietly
  eat the whole budget over days; it doesn't warrant a 3am page, so it's a
  **ticket** (`severity: warning`) to look at during business hours.

The magic numbers (14.4, 6, 3, 1) come from choosing *what fraction of the budget
you're willing to burn before being alerted* and how fast — 14.4× × 1h = burning
budget that fast for an hour spends ~2%. You don't have to derive them from
scratch; the SRE workbook tabulates standard values. The point is the *shape*: a
loud fast-burn page and a quiet slow-burn ticket, both keyed off burn rate, both
routed through the Alertmanager severity tree you already built.

### The SLO dashboard — budget remaining, burn rate, and error-budget-time

The visual companion to the alerts. A good SLO dashboard shows, at minimum:
the **SLI vs. its SLO target** over the window (are we meeting it?); the
**error budget remaining** as a percentage (the module 02 gauge); the **current
burn rate** (the multiplier — is the account draining fast?); and often a
**"time to exhaustion"** projection (at the current burn, budget runs out in N
days). This is a purpose-built Grafana dashboard using the panel and template-
variable skills from
[track 12 module 03](../../12-observability-deep-dive/03-grafana-dashboards/README.md),
driven by the SLI and budget recording rules you wrote in modules 01-02 (so the
expensive `[30d]` queries don't run on every refresh). Unlike a RED dashboard,
which shows raw request health, an SLO dashboard shows *reliability relative to a
commitment* — it's the view a team and its stakeholders actually make ship-vs-
freeze decisions from.

## Command reference

Burn-rate alerts are `PrometheusRule` objects (track 12 module 02) whose
expressions divide short-window error rate by the budgeted error fraction, routed
by the Alertmanager severity tree (track 12 module 06).

| PromQL / config | What it does | Notes |
|---|---|---|
| `sum(rate(sli_valid{code=~"5.."}[1h])) / sum(rate(sli_valid[1h]))` | Error ratio over 1h (numerator of burn rate) | reuse recorded series from module 01 |
| `... / (1 - 0.999)` | Divide error ratio by budget → **burn rate** | 0.001 for a 99.9% SLO |
| `expr_1h > 14.4 and expr_5m > 14.4` | Multi-window fast-burn condition | `and` from track 12 module 02 |
| `for: 2m` | Debounce so a single scrape blip doesn't page | shorter than static alerts — burn rate already averages |
| `labels: {severity: critical}` | Routes fast-burn to the pager | Alertmanager tree, track 12 module 06 |
| `labels: {severity: warning}` | Routes slow-burn to a ticket/Slack | same tree |
| `amtool alert query` | List currently firing alerts from the CLI | inspect without the UI |
| `amtool config routes test` | Show which receiver a labelset routes to | verify burn-rate routing |

A fast-burn multi-window rule, annotated:

```yaml
- alert: ErrorBudgetFastBurn
  expr: |
    (
      sum(rate(http_requests_total{code=~"5..",job="demo"}[1h]))
        / sum(rate(http_requests_total{job="demo"}[1h]))
    ) > (14.4 * 0.001)
    and
    (
      sum(rate(http_requests_total{code=~"5..",job="demo"}[5m]))
        / sum(rate(http_requests_total{job="demo"}[5m]))
    ) > (14.4 * 0.001)
  for: 2m
  labels: {severity: critical}
  annotations:
    summary: "Burning error budget 14.4x — ~2% of budget gone, budget exhausted in ~2 days at this rate"
    runbook: "https://runbooks/error-budget-fast-burn"
```
- **long window `[1h]`** — the *signal*: is the burn genuinely high over a
  meaningful span? Prevents paging on a momentary blip.
- **short window `[5m]`** — the *reset gate*: `and`-ed so the alert clears quickly
  once the burn stops, avoiding paging for an outage that already recovered.
- `> (14.4 * 0.001)` — the burn-rate threshold: error ratio exceeding 14.4× the
  budgeted `1 − SLO`. `14.4` is the standard fast-burn multiplier (~2% of a 30-day
  budget in 1h).
- `for: 2m` — a *short* debounce; burn rate already averages over the window, so
  you don't need the long `for:` a raw static alert would use.
- `labels.severity: critical` — routes to the pager via the exact Alertmanager
  tree from track 12 module 06. The slow-burn twin is identical with `[6h]`/`[30m]`
  windows, a `3` multiplier, and `severity: warning`.

`amtool` — inspect and test routing from the CLI:

```bash
amtool --alertmanager.url=http://localhost:9093 alert query
amtool --alertmanager.url=http://localhost:9093 config routes test severity=critical
```
- `alert query` — lists alerts Alertmanager currently holds (firing/suppressed),
  the CLI equivalent of the UI alert list.
- `config routes test severity=critical` — shows which **receiver** a given
  labelset resolves to in the routing tree — the fast way to prove your fast-burn
  alert actually reaches the pager and not a dead receiver (track 12 module 06's
  "firing ≠ paged" trap).

## Hands-on exercises

Continue on the **kind** cluster with `kube-prometheus-stack`, the demo app, and
the SLI/budget recording rules from modules 01-02. Install `amtool` if you want
the CLI exercises (`go install`/package, or `kubectl exec` into the Alertmanager
pod which ships it).

1. **(WSL2) Compute burn rate by hand, then in PromQL.** Take the error ratio you
   drove in module 02 exercise 3 and divide it by `(1 − SLO)` to get the burn rate
   as a number. Then write the PromQL that computes it live over `[1h]` and
   `[5m]`. Confirm the two windows agree when the error rate is steady and
   *diverge* when you inject a sudden spike (short window jumps first).

2. **(WSL2) Build the SLO dashboard.** In Grafana, build a dashboard (skills from
   track 12 module 03) with four panels for the demo app's availability SLO:
   SLI-vs-target, error-budget-remaining %, current burn rate, and a
   time-to-exhaustion projection. Drive it from the recording rules so the `[30d]`
   query isn't recomputed on every refresh. Add a `$job` template variable.

3. **(WSL2) Write the fast-burn multi-window alert.** Create a `PrometheusRule`
   with the annotated fast-burn rule from the command reference (14.4×, 1h/5m,
   `severity: critical`). Remember the `release` label so the Operator loads it
   (modules 01/02 trap). Confirm it appears in the Prometheus **Alerts** tab as
   `Inactive`.

4. **(WSL2) Force the fast-burn page under a simulated bad deploy.** Simulate a
   bad rollout: make the app return a high 5xx ratio (well above 14.4× your
   budget). Watch the fast-burn alert go `Inactive → Pending → Firing` and — via
   the Alertmanager routing from track 12 module 06 — land on your `critical`
   receiver (the webhook sink from that module works). This is the whole track's
   payoff firing on the stack track 12 built.

5. **(WSL2) Add the slow-burn ticket and prove it discriminates.** Add the
   slow-burn twin (3×, 6h/30m, `severity: warning`). Now inject a *low* error
   ratio — above 3× budget but below 14.4× — and confirm the **slow-burn warning**
   eventually fires to the ticket receiver while the **fast-burn critical stays
   silent**. You've demonstrated multi-burn-rate: same signal, two severities,
   two destinations.

6. **(WSL2) Prove the short window resets the alert quickly.** With the fast-burn
   alert firing, *stop* injecting errors. Watch the alert clear far faster than a
   single 1h-window alert would (because the `[5m]` leg drops below threshold in
   minutes). Contrast: temporarily rewrite the rule to use *only* the `[1h]` leg,
   re-fire, stop errors, and observe how much longer it stays firing. This is why
   the short window is `and`-ed in.

7. **(WSL2) Verify routing with `amtool`.** Use `amtool config routes test
   severity=critical` and `severity=warning` to confirm each burn-rate severity
   resolves to the receiver you intended, and `amtool alert query` to list what's
   firing — the CLI proof that "firing in Prometheus" actually reaches the right
   pager/ticket (track 12 module 06's core lesson, now for burn-rate alerts).

8. **Diagnose and fix: the burn-rate alert that never fires because the window is
   wrong.** The signature diagnose-and-fix of this module. Reproduce it: write a
   fast-burn rule whose long window is *shorter than or equal to* the short window
   (e.g. both `[5m]`, or long `[5m]` / short `[1h]` swapped), or a rule using
   `rate(...[15s])` with a 30s scrape interval (track 12 module 02's too-short-
   window trap). Inject a real, severe error spike. The alert **never fires** even
   though the SLO is clearly being blown, because the window can't accumulate the
   samples it needs (too-short rate window returns nothing) or the two-window
   logic is inverted so the confirm-gate never agrees with the signal. **Diagnose**
   in the Prometheus **Alerts** tab and by graphing each leg of the `and`
   separately — you'll see one leg is always empty/never crosses. **Fix** by
   setting the long window well above ~4× the scrape interval and larger than the
   short window (standard 1h/5m). Lesson: **a burn-rate alert with a mis-sized
   window is track 12's never-fires trap wearing an SRE costume — always graph
   each leg alone and confirm both can actually cross before trusting the alert.**

9. **(WSL2) Clean up test bits, keep the stack.** Remove the webhook sink and any
   temporary error injection; revert experimental thresholds. Keep the SLO
   dashboard and the two burn-rate rules — the capstone reuses them.

## Independent challenge

Using this module, the SLO and error budget from
[modules 01-02](../01-slis-and-slos/README.md), and the Alertmanager routing +
`group_by` from
[track 12 module 06](../../12-observability-deep-dive/06-alerting-and-on-call-basics/README.md),
build a *complete multi-window multi-burn-rate alerting setup* for the demo app's
SLO — no rules given. Author at least a fast-burn (page) and a slow-burn (ticket)
alert with correctly sized window pairs and burn multipliers, route each to the
right severity, and then *prove the whole thing discriminates*: force a
catastrophic burn and watch only the critical fire and page; force a low-grade
persistent burn and watch only the warning fire to a ticket; then stop the errors
and confirm the short window clears the page promptly. Finally, write one
paragraph explaining *why you chose those specific window sizes and multipliers* —
what fraction of the budget each alert lets you burn before it fires, and why the
fast-burn pages but the slow-burn doesn't. That written justification is the
deliverable, because the numbers are only defensible if you can say what budget
they protect.

<details>
<summary>Stuck? One hint</summary>

Don't invent the magic numbers — the Google SRE workbook's standard table is
fast-burn 14.4× over 1h/5m (pages, ~2% budget) and slow-burn 3× over 6h/30m
(tickets, ~10% budget over 3 days); a common third tier is 6× over 24h/2h. The
short window in each pair is ~1/12 of the long one and exists only to reset the
alert fast — always `and` it with the long window. Test each severity path the way
track 12 module 06 taught: force the condition, trace it through the routing tree
(or `amtool config routes test`), confirm it lands on the intended receiver. And
before trusting any alert, graph each leg of the `and` alone to prove both can
cross — that's the exercise-8 window trap.

</details>

## Common mistakes & troubleshooting

- **Single-window burn alerts.** One window forces you to choose fast-but-noisy or
  stable-but-slow. Use a long window for signal `and` a short window to reset —
  multi-window is the fix.
- **Long window ≤ short window.** Inverting or equalizing the pair makes the
  confirm-gate meaningless and often means the alert never fires (exercise 8).
  Long window must be larger, and well above ~4× the scrape interval.
- **Rate window too short for the scrape interval.** `rate(...[15s])` at a 30s
  scrape returns nothing, so the alert silently never fires — track 12 module 02's
  trap, fatal here.
- **Only a fast-burn alert.** Without a slow-burn ticket, a low-grade drain quietly
  eats the whole budget over days without ever tripping the page. You need both
  tiers.
- **Everything pages.** Slow-burn is a *ticket*, not a 3am page. Route it to
  `warning`; reserve `critical`/page for fast burn (track 12 module 06's
  everything-is-critical failure).
- **Burn-rate label matches no route.** The alert fires in Prometheus but pages
  nobody because its `severity` label matches no Alertmanager route — verify with
  `amtool config routes test` (track 12 module 06's "firing ≠ paged").
- **Dashboard recomputes `[30d]` every refresh.** Slow and heavy. Drive SLO
  panels from the recording rules from modules 01-02.

## Checkpoint quiz

Write down your answer to each question before expanding it — checking without attempting first is the single easiest way to fool yourself into thinking you've learned this.

<details>
<summary>Show questions</summary>

1. Define burn rate. What does a burn rate of 1 mean, and what does 14.4 mean for
   a 30-day budget?
2. Why can't a single-window burn alert be both fast to detect and non-flappy?
3. In a multi-window alert, what job does the long window do and what job does the
   short window do?
4. What's the difference between multi-*window* and multi-*burn-rate*, and why do
   you want a fast-burn *and* a slow-burn alert?
5. Which severity does fast-burn get vs. slow-burn, and why?
6. A burn-rate alert never fires despite an obvious SLO breach. Give two window-
   related causes and how you'd diagnose them.
7. What four things should an SLO dashboard show, and why drive it from recording
   rules?

</details>

<details>
<summary>Show answers</summary>

1. Burn rate = observed error ratio ÷ budgeted error fraction (`1 − SLO`) — the
   multiplier on how fast you're spending the budget. **1** = spending it at
   exactly the pace that uses all of it over the window (on target). **14.4** =
   burning 14.4× that fast — the whole 30-day budget gone in ~2 days.
2. A short window reacts fast but flaps on brief blips (and resets before anyone
   looks); a long window is stable but reacts slowly, burning budget while it
   ramps. One window can't give both — it's an inherent speed/precision
   trade-off.
3. The **long** window provides the signal — is the burn genuinely high over a
   meaningful span (worth paging)? The **short** window is the reset gate —
   `and`-ed in so the alert clears quickly once the burn stops, avoiding pages for
   an outage that already recovered.
4. Multi-*window* = combining a long and short window in *one* alert for
   fast-detect + fast-reset. Multi-*burn-rate* = running *several* alerts at
   different burn thresholds/severities. You want fast-burn (page: something badly
   wrong now) and slow-burn (ticket: a low-grade drain that would quietly eat the
   budget over days).
5. Fast-burn → `critical`/page (budget draining dangerously fast, act now).
   Slow-burn → `warning`/ticket (real but not urgent; look at it in business
   hours). Paging on the slow burn would be alert fatigue.
6. (a) Long window ≤ short window (or the pair inverted) so the two-window `and`
   never agrees; (b) a rate window too short for the scrape interval (e.g.
   `[15s]` at 30s scrape) returning nothing. Diagnose by graphing each leg of the
   `and` alone — one will be always-empty or never cross.
7. SLI-vs-target, error-budget-remaining %, current burn rate, and time-to-
   exhaustion. Drive it from recording rules so the expensive `[30d]` SLI/budget
   queries aren't recomputed on every dashboard refresh (fast, consistent).

</details>

## Next

[04-on-call-in-depth](../04-on-call-in-depth/README.md) — your alerts now page the
right person at the right urgency. The next question is *who* that person is and
what they do at 3am: rotation design, escalation policies, and writing a runbook
that actually helps (the `runbook:` annotation you just added) instead of one
nobody can use — plus a formal fix for the alert fatigue track 12 only named.
