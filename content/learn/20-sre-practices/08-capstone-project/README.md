# Capstone Project: Run the Full SRE Loop End to End

## Why this matters

Every module in this track added one station of the SRE loop in isolation — the
mindset, an SLI/SLO, an error budget, burn-rate alerting, on-call, incident
response, postmortems, and capacity/toil management. Real SRE is none of those
alone; it's **the whole loop turning once around a real service**: you define what
reliable means and measure it, you get paged the instant the budget burns too
fast, you respond to the fire with a process and a runbook, and you close the loop
with a blameless postmortem whose action items actually ship. This capstone is
where you prove you can run that entire loop yourself, on the exact
Prometheus/Grafana/Alertmanager stack you built in
[track 12](../../12-observability-deep-dive/README.md) — turning "we observe our
system" into "we operate it as a measured, budgeted, engineered discipline."
There's no solution given and no quiz. Finishing this is what "you can do SRE"
means.

## The project

Take a service you can break and fix on your **kind** cluster — reuse the fully
observable app from
[track 12's capstone](../../12-observability-deep-dive/08-capstone-project/README.md)
if you built it, or any workload exposing request-count and latency-histogram
metrics — and run the **complete SRE loop** on it: define an SLO, alert on its
error budget with multi-window multi-burn-rate alerts, respond to a simulated bad
deploy as a real incident with a written runbook, and produce a blameless
postmortem with tracked action items. Everything installs via Helm and costs
nothing; you may optionally reproduce the alerting on an **AKS** cluster from
[track 07](../../07-aks/README.md) to contrast with Azure Monitor, but clean that
up with `az group delete` when done.

The five required deliverables, each drawing on specific modules:

1. **A defined SLO with a real SLI backed by track 12's Prometheus**
   (modules 01-02) — choose an SLI (availability and/or latency) built as a
   `good/valid` ratio from your app's *actual* scraped metrics, set an SLO target
   and window you can *justify from measured current performance*, and derive the
   error budget in a concrete unit. The SLI and budget must be **recording rules**
   so the dashboard and alerts run on cheap precomputed series.

2. **A multi-window multi-burn-rate alert that actually fires under a simulated
   bad deploy** (module 03) — at minimum a fast-burn (page, `critical`) and a
   slow-burn (ticket, `warning`) alert with correctly sized window pairs, routed
   through the **exact Alertmanager tree from track 12 module 06**. You must
   **force it to fire** with a simulated bad deploy (drive 5xx) and watch it travel
   `Inactive → Pending → Firing → routed → delivered` — an alert you've never seen
   fire is a guess.

3. **A written on-call runbook for that alert** (module 04) — a *genuinely good*
   runbook (a stranger to the service could resolve the incident from it): the
   alert's user-terms meaning and impact, exact diagnostic steps (dashboard link,
   specific PromQL/LogQL from track 12's correlation flow, `kubectl` commands),
   named likely causes with specific fixes, escalation guidance, and SLO/budget
   context — stored as **runbook-as-code** in a repo and linked from the alert's
   `runbook_url`.

4. **A full incident response walkthrough, simulated** (module 05) — run the bad
   deploy as a real incident: **declare** it with a severity from your own rubric,
   take **IC**, keep a timestamped **timeline** separating fact from speculation,
   **mitigate** to stop user impact (roll back) *before* fully understanding root
   cause, post a stakeholder update on cadence, and **resolve** when user impact
   ends. Keep the timeline — deliverable 5 consumes it.

5. **A blameless postmortem with concrete action items** (module 06) — from your
   incident timeline, write a complete postmortem: summary, timeline, impact
   (including **error budget spent**, computed in PromQL), systemic root cause(s)
   via an explicit **five-whys** chain (not a scapegoat), what went well / where
   you got lucky, and **action items that are every one of specific, owned, dated,
   and filed as real backlog tickets** — with at least one closing the systemic gap
   that let the bad deploy through.

### Acceptance checklist

Work isn't done until you can demonstrate every one of these:

- [ ] An **SLI** is defined as a `good/valid` ratio over your app's real scraped
      metrics (availability and/or latency-under-threshold — *not* a resource
      metric, *not* `up`), and you can justify every label as bounded.
- [ ] An **SLO target + window** is set, and you can defend the number from the
      app's *measured* performance (achievable, not aspirational) — with the
      **error budget** derived in a concrete unit (minutes or requests).
- [ ] The **SLI and error-budget** expressions exist as **recording rules** loaded
      by the Operator (correct `release` label), and an **SLO dashboard** in
      Grafana shows SLI-vs-target, budget remaining, current burn rate, and
      time-to-exhaustion.
- [ ] A **fast-burn** alert (`critical`) and a **slow-burn** alert (`warning`)
      exist with correctly sized window pairs and burn multipliers; each leg of the
      `and` can actually cross (you graphed them), and each **routes to the
      intended receiver** (verified in the Alertmanager UI or `amtool config routes
      test`).
- [ ] You **forced the fast-burn alert to fire** under a simulated bad deploy and
      watched the full `Inactive → Pending → Firing → routed → delivered`
      transition to an observable receiver — and confirmed the slow-burn stayed
      silent (it discriminates).
- [ ] A **runbook** exists as code in a repo, is linked from the alert's
      `runbook_url`, and passes the "a stranger could resolve the incident from it"
      test — exact links, queries, commands, named causes with specific fixes,
      escalation, SLO/budget context.
- [ ] You ran a **full incident**: declared with a severity, took IC, kept a
      timestamped fact-vs-speculation **timeline**, **mitigated first** (rolled
      back) and resolved on user-impact-stopped, with at least one cadenced
      stakeholder update.
- [ ] A **blameless postmortem** exists with all sections, reaches a **systemic**
      root cause via an explicit five-whys chain (no human scapegoat), quantifies
      **error budget spent** in PromQL, and honestly covers "what went well / where
      we got lucky."
- [ ] Every **action item** is specific, owned, dated, and filed as a **real
      backlog ticket**, with a named follow-up mechanism — and at least one closes
      the systemic gap that allowed the bad deploy (e.g. a CI validation/rollback
      guardrail from track 10).
- [ ] At least one **diagnose-and-fix** from the track is reproducible on your
      system: a burn-rate alert that never fires because the window is wrong
      (module 03), an exhausted error budget and the policy conversation it forces
      (module 02), or a postmortem with vague action items you then made SMART
      (module 06).
- [ ] If you built on AKS, all billable resources are cleaned up with
      `az group delete`.

### Hints (not a solution)

- **Sequence it the way the track was ordered.** Define the SLI/SLO and record
  them first (you can't alert or dashboard on a budget you haven't defined), then
  build the burn-rate alerts and SLO dashboard, then write the runbook, *then* run
  the incident, and write the postmortem **last** — the postmortem is only good if
  it's about an incident you actually ran.
- **Reuse the track 12 stack — don't rebuild it.** `kube-prometheus-stack`
  (Prometheus/Grafana/Alertmanager) and, ideally, the fully observable app from
  track 12's capstone are already on your kind cluster. This capstone is mostly
  *pointing SRE machinery at* that stack, not reinstalling it.
- **Set the SLO from measured performance, then make it bite once.** Run your SLI
  over your longest window and set the target at or just below it. An SLO that
  never triggers a conversation isn't constraining anything — the simulated bad
  deploy is how you make it bite on purpose.
- **Force the alert; don't wait for it.** Simulate the bad deploy (drive 5xx above
  14.4× your budget) so you *watch* the fast-burn fire and route — and graph each
  leg of the `and` first so you don't fall into the never-fires window trap
  (module 03).
- **Mitigate before you understand.** In the incident, roll back to stop user
  impact and resolve on that; the "why did the deploy break it" investigation is
  the postmortem's job, not the incident's (module 05). Resolving ≠ root-causing.
- **Make the postmortem blameless and its action items real.** Push the five-whys
  past any human-shaped answer to a systemic gap, and make every action item a
  tracked ticket with an owner and a due date — "improve monitoring" is how the
  same incident recurs (module 06).
- **The whole thing is the loop, not the parts.** Five polished artifacts that
  don't connect aren't the deliverable — the deliverable is one service where the
  *same* SLO drove the alert that fired the incident that produced the postmortem
  whose action item closes the gap. Depth on the loop closing beats breadth.
- **Don't gold-plate.** One SLO run cleanly through the full loop beats three
  half-run ones. The end-to-end connection — budget → burn alert → incident →
  postmortem → shipped fix — is the goal.

## Next

**Before you move on:** if any acceptance item is checked only because "it exists,"
go back and prove it the hard way — show the alert *actually firing* under the bad
deploy and *routing* to a receiver, the runbook *actually followable* by someone
who's never seen the service, the incident *actually run* with a real timeline, and
the postmortem's action items *actually filed as tickets* with owners. An SRE loop
you haven't seen turn once — budget burning, page firing, incident declared,
mitigation applied, postmortem written, fix shipped — is a loop you haven't
verified. When every box is genuinely ticked, you've finished the track: you can
define reliability formally, get paged only when it matters, run a coordinated
incident, and close the loop so the same failure doesn't return.

This track was the **operational-maturity** layer. Two later tracks build directly
on it:

- [21-cost-management-and-finops](../../21-cost-management-and-finops/README.md)
  applies the *exact same budgeting discipline* to money that this track applied to
  reliability and toil. The error budget, the toil budget, and now a **cost
  budget** are the same idea — a tracked number that forces a decision when
  breached — and FinOps is where you learn to right-size, tag, and forecast cloud
  spend as an ongoing practice, using the same historical-metrics forecasting
  (`predict_linear`) you used for capacity planning in module 07.
- [22-disaster-recovery-and-chaos-engineering](../../22-disaster-recovery-and-chaos-engineering/README.md)
  takes the incident response, runbooks, and postmortems you just practiced and
  turns them proactive — *deliberately* breaking your systems to prove they recover,
  and designing the backup/failover strategies that your SLOs and error budgets say
  you need.

You now have the operational foundation both of those build on.

[Back to the track index](../README.md) · [Back to main curriculum](../../README.md)
