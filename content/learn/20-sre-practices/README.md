# Track 20: SRE Practices

You can already *build* systems (Docker, Kubernetes, AKS), *ship* them (CI/CD and
GitOps), and *observe* them deeply — in
[12-observability-deep-dive](../12-observability-deep-dive/README.md) you stood up
Prometheus, Grafana, Loki, and OpenTelemetry yourself and even wrote your first
Alertmanager routing and on-call hygiene in module 06. This track is the layer on
top of all of that: **operational maturity**. It formalizes the full Site
Reliability Engineering discipline — defining and *measuring* reliability with
SLIs/SLOs, turning the gap to 100% into a spendable **error budget**, alerting on
that budget's *burn rate* instead of static thresholds, running real **incident
response**, and closing the loop with **blameless postmortems** and toil reduction.

Where track 12 gave you the *signals*, this track gives you the *discipline* that
decides how reliable a service should be, proves whether it is, and coordinates
what happens when it isn't. The alerting/on-call *basics* from
[track 12 module 06](../12-observability-deep-dive/06-alerting-and-on-call-basics/README.md)
are the baseline this track assumes and formalizes — "alert on symptoms, not
causes" becomes SLO-based alerting; "don't burn out on-call" becomes rotation
design, escalation, and a measured fix for alert fatigue.

> **Cost note:** like track 12, almost all of this track runs on your **local
> kind cluster** — the same `kube-prometheus-stack` (Prometheus/Grafana/
> Alertmanager) you already installed, now driving SLOs and burn-rate alerts,
> costs nothing. A couple of exercises *optionally* point the same alerting at an
> **AKS** cluster to contrast with Azure Monitor; if you spin up AKS for those,
> clean it up with `az group delete` when done, exactly as track 07 drilled into
> you.

## How this track works

- Go in order — module 00 sets the mindset, 01-02 make reliability measurable
  (SLIs/SLOs then error budgets), 03 is the technical payoff (burn-rate alerting
  on track 12's stack), 04-05 are the human response system (on-call then incident
  response), 06 closes the loop (blameless postmortems), and 07 keeps you ahead of
  failure (capacity and toil). The capstone runs the whole loop once, end to end.
- Every module (except this index and the capstone) follows the same shape:
  **Why this matters → Concepts → Command reference → Hands-on exercises →
  Independent challenge → Common mistakes & troubleshooting → Checkpoint quiz →
  Next**. Two modules (02 and 05) also carry a **Cumulative review**.
- Exercises build on the *real* Prometheus/Grafana/Alertmanager stack from
  track 12: real SLI PromQL, real recording rules, real multi-window
  multi-burn-rate alerts that fire under a simulated bad deploy, and real
  `amtool` routing checks. Several modules include a deliberate
  **diagnose-and-fix** — a burn-rate alert that never fires because the window is
  wrong, an already-exhausted error budget and the policy conversation it forces,
  a page storm that's really one incident, an unmanaged incident with no IC, and a
  postmortem full of vague non-actionable action items.
- Module 08 is a capstone with no quiz or challenge — it asks you to run the
  entire SRE loop on one service: a defined SLO, a burn-rate alert that actually
  fires under a bad deploy, a written runbook, a full simulated incident response,
  and a blameless postmortem with concrete action items.

## Modules

| # | Module | What it covers | Rough time |
|---|--------|-----------------|------------|
| 00 | [sre-concepts-and-the-reliability-mindset](00-sre-concepts-and-the-reliability-mindset/README.md) | What SRE is as a discipline, dev velocity vs. reliability, "hope is not a strategy," toil vs. engineering work, the SRE loop | 45-60 min |
| 01 | [slis-and-slos](01-slis-and-slos/README.md) | Choosing a good SLI (availability/latency/error rate) as a good/valid ratio, SLA vs. SLO, picking a target that's neither too loose nor too tight | 75-90 min |
| 02 | [error-budgets](02-error-budgets/README.md) | Computing an error budget from an SLO, spending it, error-budget policies, using it for a real ship-vs-slow-down decision | 75-90 min |
| 03 | [slo-dashboards-and-burn-rate-alerts](03-slo-dashboards-and-burn-rate-alerts/README.md) | Multi-window multi-burn-rate alerting on track 12's Prometheus/Grafana/Alertmanager — the payoff of that track | 90-120 min |
| 04 | [on-call-in-depth](04-on-call-in-depth/README.md) | Rotation design, escalation policies, good vs. useless runbooks (runbook-as-code), a formal fix for alert fatigue | 75-90 min |
| 05 | [incident-response-process](05-incident-response-process/README.md) | Severity levels, the incident commander role, communication during an incident, declaring and resolving | 75-90 min |
| 06 | [blameless-postmortems](06-blameless-postmortems/README.md) | Writing one, five-whys root-cause, turning action items into real backlog work, why blame kills the practice | 75-90 min |
| 07 | [capacity-planning-and-toil-reduction](07-capacity-planning-and-toil-reduction/README.md) | Forecasting capacity from track 12's historical metrics (`predict_linear`), identifying and automating toil, the toil budget | 75-90 min |
| 08 | [capstone-project](08-capstone-project/README.md) | End-to-end: a defined SLO, a burn-rate alert that fires under a bad deploy, a runbook, a full incident walkthrough, and a blameless postmortem | 4-6 hours |

## Prerequisites

- Everything from
  [12-observability-deep-dive](../12-observability-deep-dive/README.md): comfortable
  with Prometheus, PromQL (`rate`, histograms, `histogram_quantile`, recording and
  alerting rules), Grafana dashboards, and especially the Alertmanager
  routing/grouping/silencing and on-call basics from its module 06. This track
  drives SLOs and burn-rate alerts on exactly that stack.
- Everything from [07-aks](../07-aks/README.md): comfortable operating a real
  cluster with `kubectl`, Deployments/rollouts (for mitigation via
  `kubectl rollout undo`), and the Cluster Autoscaler/HPA (module 07's capacity
  planning sets the limits those scale within).
- Useful from [10-cicd-and-gitops](../10-cicd-and-gitops/README.md): CI/CD and
  GitOps — the error budget governs release decisions here, and postmortem action
  items land as pipeline guardrails and tracked backlog work.
- An Azure subscription is optional — only the AKS-contrast exercises use it; the
  whole track runs on the local kind cluster.

[Back to main curriculum](../README.md)

Start here → [00-sre-concepts-and-the-reliability-mindset/README.md](00-sre-concepts-and-the-reliability-mindset/README.md)
