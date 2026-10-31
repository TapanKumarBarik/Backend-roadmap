# Alerting and On-Call Basics

## Why this matters

A dashboard nobody's looking at at 3am is worthless — the point of metrics is
that they can *page a human* when something's wrong, without anyone watching.
You already wrote an *alerting rule* in [module 02](../02-promql-in-depth/README.md)
(the PromQL condition that fires); this module is about everything *after* it
fires: **Alertmanager**, which routes, groups, deduplicates, and silences
alerts, and the human discipline of writing alerts that are *actionable* rather
than *noisy*. In [track 07](../../07-aks/06-monitoring-aks-azure-monitor-container-insights/README.md)
Azure Monitor did routing through action groups; here you own the routing tree
yourself. Getting this wrong causes **alert fatigue** — the failure mode where
so many alerts fire that people ignore all of them, including the real one — so
this module is as much judgment as configuration.

## Concepts

### Prometheus fires, Alertmanager decides what to do about it

A clean division of labor: **Prometheus** evaluates alerting rules and, when a
rule's condition holds for its `for:` duration, sends a firing alert to
**Alertmanager**. Alertmanager doesn't evaluate any PromQL — it takes the
already-firing alerts and handles **routing** (which team/receiver gets it),
**grouping** (bundle related alerts into one notification), **inhibition**
(suppress alerts made redundant by a bigger one), and **silencing** (mute known
issues). The `kube-prometheus-stack` you installed already includes
Alertmanager. This separation is why the same alert can go to different places
without touching the PromQL: you edit Alertmanager's routing, not the rule.

### Routing, grouping, and the notification you actually receive

Alertmanager's config is a **routing tree**. Every alert carries **labels**
(the `labels:` you set on the rule — `severity: warning`, `team: payments`);
the route tree matches on those labels to pick a **receiver** (email, Slack,
PagerDuty, a webhook). Two mechanisms make the difference between a useful page
and a storm:

- **Grouping** (`group_by`) — bundle alerts sharing given labels into a
  *single* notification. If 40 pods of one service all fire `HighErrorRate`,
  `group_by: [alertname, service]` sends *one* grouped alert ("HighErrorRate,
  service=checkout, 40 instances"), not 40 pages. This is the primary defense
  against a single incident becoming a pager flood.
- **Timing** (`group_wait`, `group_interval`, `repeat_interval`) — wait a few
  seconds to collect related alerts before sending (so the group is complete),
  how long before adding newly-firing members to an existing group, and how
  often to re-notify about a still-firing alert. Tuning these trades
  responsiveness against noise.

### Silencing and inhibition — muting on purpose

Not every firing alert should page. **Silencing** is a temporary, explicit mute
you create (via label matchers, with an expiry) for a *known* issue — you're
doing planned maintenance on `service=billing`, so you silence its alerts for
two hours so the real work doesn't drown in expected noise. **Inhibition** is
automatic: a rule that says "if this bigger alert is firing, suppress these
smaller ones" — e.g. if `ClusterDown` is firing, don't also page for every
individual `TargetDown` it obviously caused. Both exist to keep the signal
clean; a silence is manual and time-boxed, inhibition is a standing rule. The
discipline: **silence known noise explicitly rather than deleting the alert
that keeps crying wolf** (which loses it for the day it matters).

### What makes an alert good vs. noisy

This is the judgment half, and it matters more than the config. A good alert
is:

- **Actionable** — when it fires, there's something a human should *do*. If the
  only response is "acknowledge and move on," it shouldn't page. This is the
  single biggest filter.
- **Symptom-based, not cause-based** — alert on what users feel ("error ratio
  > 5%", "p99 latency > 1s"), not on every possible internal cause ("CPU >
  80%"). High CPU that isn't hurting anyone is not an incident; alerting on it
  trains people to ignore the pager. (This is the SLO-driven thinking track 20
  formalizes.)
- **Correctly thresholded and debounced** — a `for:` duration so a momentary
  blip doesn't page, a threshold that can actually be crossed (module 02's
  never-fires trap) but isn't so tight it fires constantly.
- **Routed by severity** — `critical` pages a human now; `warning` goes to a
  ticket/Slack channel to look at during business hours. Not everything
  deserves a phone call at 3am.

### Alert fatigue — the failure mode the whole module fights

**Alert fatigue** is what happens when alerts are noisy, non-actionable, or
duplicated: people become desensitized and start ignoring *all* of them,
including the one real page in the flood. It's the leading cause of missed
incidents on mature teams — not too few alerts, too many *bad* ones. Every
concept above (grouping, symptom-based alerting, severity routing, silencing
known issues) is a weapon against it. The mental test for any new alert:
**"when this fires at 3am, will the on-call engineer know exactly what to do,
and is it worth waking them?"** If not, make it a `warning` (ticket, not page)
or delete it. A page that can be ignored is worse than no page.

## Command reference

| Command / config key | What it does | Example |
|---|---|---|
| `kubectl port-forward -n monitoring svc/...alertmanager 9093` | Opens the Alertmanager UI | see exercise 2 |
| Prometheus UI **Alerts** tab | Shows rules and their state (Inactive/Pending/Firing) | exercise 1 |
| Alertmanager `route` | The routing tree: match labels → receiver | see below |
| Alertmanager `group_by` | Labels to bundle alerts by into one notification | `group_by: [alertname, namespace]` |
| Alertmanager `receivers` | Notification destinations (webhook/email/Slack) | see below |
| Alertmanager `inhibit_rules` | Suppress alerts when a bigger one fires | see below |
| UI: Alertmanager **Silences → New Silence** | Temporarily mute matching alerts | exercise 5 |

Alertmanager config anatomy (edited via the `AlertmanagerConfig` CR or the
chart's `alertmanager.config` values):

```yaml
route:
  receiver: default            # fallback receiver
  group_by: [alertname, namespace]
  group_wait: 30s              # collect related alerts before first send
  group_interval: 5m           # how often to add new members to a group
  repeat_interval: 4h          # how often to re-page a still-firing alert
  routes:                      # sub-routes matched top-down
    - matchers: [severity="critical"]
      receiver: pager
    - matchers: [severity="warning"]
      receiver: slack
receivers:
  - name: default
  - name: pager
    webhook_configs: [{url: "http://example/pager"}]
  - name: slack
    webhook_configs: [{url: "http://example/slack"}]
inhibit_rules:
  - source_matchers: [severity="critical"]
    target_matchers: [severity="warning"]
    equal: [namespace]         # mute warnings in a namespace when it has a critical
```
- `route.group_by` — the labels that define one notification group; the
  anti-flood control.
- `route.group_wait/group_interval/repeat_interval` — the timing knobs trading
  speed vs. noise.
- `route.routes[].matchers` — label-based sub-routing; `severity="critical"` →
  pager, `warning` → Slack. Matched top-to-bottom, first match wins (unless
  `continue: true`).
- `inhibit_rules` — when a `critical` fires, suppress the `warning`s it would
  obviously cause in the same `namespace` — dedup across severity.

## Hands-on exercises

Continue on the **kind** cluster with `kube-prometheus-stack`. You'll reuse the
`DemoHighErrorRatio` rule from [module 02](../02-promql-in-depth/README.md).

1. **(WSL2) See the alerting pipeline end to end.** Port-forward Prometheus
   (`svc/kps-kube-prometheus-stack-prometheus 9090`) and open its **Alerts**
   tab. Find `DemoHighErrorRatio` and note its state (`Inactive` if no errors).
   This is the *evaluation* side (Prometheus). Now port-forward Alertmanager:
   ```bash
   kubectl port-forward -n monitoring svc/kps-kube-prometheus-stack-alertmanager 9093:9093
   ```
   Open `http://localhost:9093` — the *routing* side. Nothing's firing yet;
   you'll change that.

2. **(WSL2) Force an alert to actually fire.** Drive real 5xx errors so
   `DemoHighErrorRatio` crosses its threshold. If the example app has an error
   endpoint, hammer it; otherwise deploy a workload that returns 500s, or
   temporarily lower the rule's threshold to something the current error rate
   exceeds. Drive traffic, wait past the `for:` duration, and watch the alert go
   `Inactive → Pending → Firing` in the Prometheus **Alerts** tab, then appear
   in the **Alertmanager** UI. You just watched the full pipeline fire — the
   opposite of module 02's never-fires trap.

3. **(WSL2) Configure grouping and severity routing.** Edit the chart's
   Alertmanager config (via `helm upgrade ... --set` or an
   `AlertmanagerConfig`/values file) to add `group_by: [alertname, namespace]`
   and two sub-routes: `severity="critical"` → one receiver, `severity="warning"`
   → another. Use a simple webhook receiver you can watch — run a throwaway
   sink:
   ```bash
   kubectl run webhook-sink -n monitoring --image=mendhak/http-https-echo --port=8080
   kubectl expose pod webhook-sink -n monitoring --port=8080
   ```
   Point a receiver's `webhook_configs.url` at
   `http://webhook-sink:8080`. Re-fire the alert and confirm it's delivered to
   the sink (`kubectl logs -n monitoring webhook-sink`) — and that because it's
   `severity: warning`, it took the warning route.

4. **(WSL2) Prove grouping collapses a flood.** Scale the demo app up and make
   *several* pods error simultaneously so multiple alert instances fire. With
   `group_by: [alertname, namespace]`, confirm Alertmanager sends **one grouped
   notification** covering all of them, not one per pod. This is the core
   anti-fatigue mechanism, demonstrated.

5. **(WSL2) Create a silence.** In the Alertmanager UI, **Silences → New
   Silence**, match `alertname="DemoHighErrorRatio"`, set a 1-hour expiry and a
   comment ("planned load test"). Re-fire the condition and confirm **no
   notification is sent** while the silence is active, but the alert still shows
   as firing (silenced, not gone). Then expire/remove the silence and confirm
   notifications resume. This is muting-on-purpose vs. deleting the alert.

6. **Diagnose and fix: an alert that never pages because of a routing/label
   mismatch.** A subtle, real failure: the alert *fires* in Prometheus but
   nobody's notified. Reproduce by giving the rule `labels: {severity:
   critical}` while your route only has a sub-route for `severity="warning"`
   (and a `default` receiver that goes nowhere useful, or a matcher typo like
   `severity="crtical"`). Fire it: the Prometheus **Alerts** tab shows
   **Firing**, but the webhook sink gets **nothing**. Diagnose the real way — in
   the Alertmanager UI the alert *is present* but you trace the routing tree and
   see it fell through to the wrong/dead receiver because no `matchers` matched
   its labels. **Fix** by aligning the rule's `severity` label with a route
   matcher (or fixing the typo). Lesson: **"firing in Prometheus" ≠ "someone
   got paged" — the label on the rule must match a route matcher, or the alert
   fires into the void.** This is the alerting cousin of every silent
   selector-mismatch in this track (ServiceMonitor, LogQL, trace context).

7. **(WSL2) Write down the good-vs-noisy judgment.** For three candidate
   alerts — (a) `node CPU > 80%`, (b) `checkout error ratio > 5% for 10m`, (c)
   `a pod restarted once` — decide for each: page, ticket, or neither, and why.
   (Reference answer: (a) neither/ticket — cause not symptom, high CPU that
   isn't hurting users isn't an incident; (b) page — user-facing symptom,
   actionable; (c) neither — one restart is normal noise. Alert on symptoms
   users feel.)

8. **(WSL2) Clean up the test bits** (keep the stack):
   ```bash
   kubectl delete pod webhook-sink -n monitoring; kubectl delete svc webhook-sink -n monitoring
   ```
   Revert the rule's threshold/severity if you changed them for testing.

## Independent challenge

No config given — write it yourself using this module plus
[module 02](../02-promql-in-depth/README.md) (authoring the rule) and
[module 00](../00-observability-concepts-and-three-pillars/README.md)
(symptom vs. cause thinking). Design a *small, deliberately curated* alerting
setup for the demo app — no more than **three** alerting rules — where every
alert is **symptom-based and actionable**, each carries a `severity` label, and
the Alertmanager routing sends `critical` to one receiver and `warning` to
another, with sensible `group_by`. Then *prove the whole thing works*: force
the `critical` alert's condition, watch it travel rule → firing → routed →
delivered to the correct receiver, and separately create a time-boxed silence
for it and confirm the notification stops. Finally, write one paragraph
justifying *why you chose those three alerts and rejected others* — this
written justification is the actual deliverable, because curating *what not to
alert on* is the skill that prevents alert fatigue. Draw explicitly on the RED
(Rate/Errors/Duration) shape from module 03's dashboard.

<details>
<summary>Stuck? One hint</summary>

Three good alerts for a web service are almost always the RED symptoms: high
**error ratio** (5xx fraction, `critical`), high **latency** (p99 over a
threshold, `warning` or `critical`), and **traffic gone to zero** when you
expect some (`== 0` for a duration — the corrected version of module 02's
never-fires trap). Reject cause-based alerts (CPU, memory, restart counts)
unless they're the *only* signal of a user-facing problem. For routing, the
rule's `labels.severity` must exactly match a route `matchers` entry (module
06's exercise-6 trap) or it pages nobody; test the bad path by mismatching them
on purpose first.

</details>

## Common mistakes & troubleshooting

- **Firing ≠ paged.** An alert can be `Firing` in Prometheus yet notify no one
  because its labels match no route (or match a dead receiver). Trace the
  routing tree in the Alertmanager UI; align the rule's `severity` label with a
  route matcher.
- **No grouping → pager flood.** Without `group_by`, one incident affecting 40
  pods sends 40 notifications. Group by `alertname` + a service/namespace label
  so one incident is one notification.
- **Cause-based alerts.** Paging on CPU/memory/restart counts that aren't
  hurting users trains people to ignore the pager. Alert on user-facing
  *symptoms* (errors, latency, availability).
- **Deleting a noisy alert instead of silencing it.** If an alert keeps crying
  wolf during known work, create a time-boxed **silence**; deleting the rule
  loses it for the day it matters.
- **Everything is `critical`.** If every alert pages at 3am, none of them mean
  anything. Reserve `critical`/page for actionable user-facing incidents; route
  `warning` to a ticket/Slack channel.
- **No `for:` duration.** Alerting on an instantaneous condition flaps on every
  blip. Use a `for:` so a momentary spike doesn't page (module 02).
- **Untested routing.** A routing tree you never fired an alert through is a
  guess. Force each severity path once and confirm it lands where you intended.

## Checkpoint quiz

Write down your answer to each question before expanding it — checking without attempting first is the single easiest way to fool yourself into thinking you've learned this.

<details>
<summary>Show questions</summary>

1. What's the division of labor between Prometheus and Alertmanager for
   alerting?
2. What does `group_by` do, and what failure does it prevent?
3. Silencing vs. inhibition — how do they differ and when do you use each?
4. Give the three-part test for whether something should be a paging alert.
5. Why is a symptom-based alert (error ratio) usually better than a cause-based
   one (high CPU)?
6. An alert shows `Firing` in Prometheus but no one is notified. What's the most
   likely cause and where do you diagnose it?
7. What is alert fatigue, and name two concrete mechanisms in this module that
   fight it.

</details>

<details>
<summary>Show answers</summary>

1. Prometheus evaluates the alerting rules (the PromQL + `for:`) and sends
   firing alerts to Alertmanager; Alertmanager evaluates no PromQL — it handles
   routing, grouping, deduplication/inhibition, and silencing of the alerts it
   receives.
2. `group_by` bundles alerts sharing the given labels into a single
   notification; it prevents a pager flood where one incident affecting many
   pods sends one notification per pod.
3. A **silence** is a manual, time-boxed mute you create for a known issue (via
   label matchers with an expiry); **inhibition** is a standing rule that
   automatically suppresses smaller alerts when a bigger related one is firing.
   Silence for planned/known noise now; inhibition for "the big alert obviously
   causes these small ones."
4. When it fires: (1) is there something a human must *do* (actionable), (2) is
   it a user-facing symptom worth acting on, and (3) is it worth waking someone
   *now* (else make it a `warning`/ticket). If any answer is no, it shouldn't
   page.
5. Because a symptom (elevated errors/latency) means users are actually being
   hurt and there's something to do; high CPU that isn't degrading anything is
   not an incident, and paging on it desensitizes people to the pager (and it's
   the SLO thinking track 20 formalizes).
6. Its labels don't match any route (or match a dead/wrong receiver) — e.g. a
   `severity` label with no matching route matcher, or a matcher typo. Diagnose
   in the Alertmanager UI by tracing the routing tree; the alert is present but
   routes to nowhere useful. Fix by aligning the rule's labels with a route
   matcher.
7. Alert fatigue is desensitization from too many noisy/non-actionable/
   duplicated alerts, causing people to ignore all of them including the real
   one. Fighters: grouping (`group_by`) to collapse floods, symptom-based
   alerting, severity routing (page vs. ticket), and silencing known noise —
   any two.

</details>

## Next

[07-correlating-the-three-pillars](../07-correlating-the-three-pillars/README.md)
— you can now collect all three pillars and alert on them. The final skill is
the payoff: using a trace ID to jump from a metric spike to the exact logs to
the specific trace, turning three separate tools into one debugging flow.
