# 08 - Capstone Project

## Why this matters

This is the last module of the performance track, and it exists to make you do
the one thing the whole curriculum has been building toward twice over: not
*configure* autoscaling, but *prove* it. Back in
[track 03 module 09](../../03-kubernetes/09-scaling-hpa-and-vpa/README.md) and
[track 06 module 03](../../06-azure-container-apps/03-scaling-with-keda/README.md)
you set up HPA and KEDA and watched a synthetic signal move a number. Everything
since — the four test types, k6, Azure Load Testing, realistic traffic modeling,
reading autoscaling correctly, finding bottlenecks, profiling, and CI gating —
was in service of turning that demo into a *measured, defended claim*: "under
realistic load, this system scales, holds its SLO, and I know where it breaks
and why." There's no new concept and no quiz here; the goal is to integrate
modules 00-07 into one real, end-to-end piece of performance engineering.

## The project

Take a real, multi-component application — your
[track 07 AKS capstone](../../07-aks/09-capstone-project/README.md) app, a
Container Apps deployment from [track 06](../../06-azure-container-apps/README.md),
or any real app you've built that has a database and at least two meaningfully
different endpoints — and put it through a complete performance-engineering
cycle. Treat this as a project with dependencies, in roughly this order:

1. **Deploy the app for real** on AKS or Container Apps, with autoscaling
   configured the way you'd actually run it in production (HPA on an appropriate
   metric, or KEDA scale rules) and observability wired up so you can watch it —
   Grafana fed by Prometheus (track 12), or Azure Load Testing's App Component
   correlation (module 02).

2. **Design a realistic load test** (module 03): model the real traffic *mix*
   across your endpoints in production-like proportions, with randomized think
   time, data parameterization so you're not just warming a cache, and at least
   one correlated stateful flow. Use an **open/arrival-rate** executor for the
   part that must drive scaling. State the SLO the test verifies (from
   [track 20](../../20-sre-practices/README.md), or a plausible one you define).

3. **Prove autoscaling actually works** (module 04): run the test at real scale
   (Azure Load Testing engines if a laptop can't reach the load) and produce a
   Grafana dashboard showing, on **one timeline**, offered load, the metric the
   autoscaler watches, replica count, and client-side p95 — demonstrating that
   scaling *triggers* and that latency stays within SLO through the ramp. Read
   the result correctly: distinguish "scaled and healthy" from "scaled but too
   slow" from "scaled to max and still failing."

4. **Find at least one real bottleneck** (module 05): push past the knee and
   diagnose *which* resource is the wall — a CPU/memory limit, connection-pool
   exhaustion (track 14), or a downstream dependency's rate limit — proving the
   diagnosis by changing one thing and watching the knee move. Rule out a false
   bottleneck (confirm the generator had headroom).

5. **Propose (and ideally make) a fix** for that bottleneck (module 06): decide
   whether the right response is infra scaling or a code-level fix (an N+1, a
   hot path, a pool/pooler change), justify the choice including its recurring-
   vs-one-time cost (track 21), and if it's a code fix you can make, prove the
   improvement with a re-run (more RPS-per-replica within SLO).

6. **Wire a lightweight performance gate into a CI pipeline** (module 07, on a
   track-10 pipeline): a small, fast, headroom-tuned k6 gate that deploys the
   build to an ephemeral environment, runs against it, blocks the merge on a
   threshold breach, publishes its summary, and tears the environment down — and
   demonstrate it catches a deliberately-introduced regression while staying
   stably green on unchanged code.

## Acceptance checklist

Work through these in order; each depends on the previous ones actually working,
not just existing.

- [ ] A real app with a database and ≥2 distinct endpoints is deployed on AKS or
      Container Apps with production-style autoscaling (HPA on an appropriate
      metric, or KEDA) configured.
- [ ] Observability is live: a Grafana dashboard (or Azure Load Testing App
      Component correlation) that can show offered load, the autoscaler's watched
      metric, replica count, and p95 latency together.
- [ ] A k6 load test that is genuinely *realistic*: a traffic mix in
      production-like proportions across the endpoints, randomized think time,
      at least one parameterized-from-a-dataset field (no accidental cache-only
      test), and at least one correlated stateful flow — with an **open/
      arrival-rate** executor driving the scaling-relevant load.
- [ ] The test's thresholds are **derived from a stated SLO** (not from a prior
      measurement), and include both a latency percentile and an error-rate
      bound.
- [ ] First-hand evidence (a saved Grafana dashboard / screenshot, or an Azure
      Load Testing report) that autoscaling **triggered** under the load — the
      watched metric crossed target and replica count climbed.
- [ ] A correct *reading* of that result in writing: whether latency stayed
      within SLO through the ramp, and which of the three outcomes (healthy /
      too-slow / downstream-limited) you observed.
- [ ] At least one **real bottleneck** identified by pushing past the knee, with
      the diagnosis (which resource) *proven* by changing one variable and
      showing the knee move — and the false-bottleneck (saturated generator)
      explicitly ruled out.
- [ ] A written scale-vs-fix decision for that bottleneck, justified with the
      recurring-vs-one-time cost framing; if a code fix was feasible, a re-run
      showing improved RPS-per-replica within SLO.
- [ ] A CI performance gate on a real pipeline: a small k6 test that deploys to
      an ephemeral environment, gates the merge on its exit code, publishes its
      summary as an artifact, and tears the environment down `if: always()`.
- [ ] Proof the gate works **both ways**: a deliberately-regressed change is
      red-blocked, and an unchanged/normal change passes *stably* across several
      runs (not flakily).
- [ ] Everything billable is cleaned up: the cluster/Container Apps, any Azure
      Load Testing resource, and any ephemeral namespaces are gone and no longer
      billing.
- [ ] You can explain, for each piece, what you *proved* versus what you merely
      *configured* — if you can't say what a given step demonstrated, that's a
      sign to go back rather than having copy-pasted a passing command.

## Hints

- **Reuse, don't reinvent.** The realistic script is your module-03 challenge
  script; the autoscaling proof is your module-04 setup; the gate is your
  module-07 gate. The capstone is integration, not new discovery — resist
  building fresh from scratch.
- **Develop the script locally, run it big in the cloud.** Get the k6 script
  correct with a small local `k6 run` first (module 01), *then* point Azure Load
  Testing at it with more engines (module 02). Never debug a script for the
  first time at managed scale.
- **If autoscaling "doesn't scale," check the metric before the mechanism.** The
  module-04 trap: high latency with a *calm* watched metric means you're scaling
  on the wrong signal (a CPU-HPA on an I/O-bound app), not that the HPA is
  broken. Watch the metric on Grafana, not just the replica count.
- **If scaling to max doesn't fix latency, stop scaling and look downstream.**
  That's the module-05 signal — a connection pool (track 14) or a dependency's
  rate limit that more app replicas can't help (and may worsen). "App latency
  high, DB calm" is pool exhaustion.
- **Before reporting any ceiling, run `top` on the k6 host.** The false
  bottleneck (module 05) — a saturated generator faking a server ceiling — is
  the easiest wrong conclusion to draw. Prove the client had room to push
  harder.
- **Tune the CI gate for stability, then trust it.** Measure the runner's noise
  on unchanged code, set the bar above the SLO by that margin, run ~90s, and
  keep the big peak test on a schedule — a flaky gate people bypass is worse than
  no gate (module 07).
- **Keep a running note of every billable resource** (cluster, ACR, Load
  Testing resource, ephemeral namespaces) so final cleanup is a checklist, not
  an archaeology exercise — and so a load test left running doesn't become a
  weekend bill.

## Before you move on

When the checklist is done and everything is torn down, don't consider this
finished yet. Wait a few days, then — with no notes and none of your earlier
modules open — take a *different* app and reproduce the core of it cold: a
realistic load test, a Grafana-backed proof that autoscaling triggers and holds
SLO, one diagnosed-and-explained bottleneck, and a CI gate that catches a
regression. Noticing exactly where you stall — was it modeling the traffic mix?
reading the watched metric? distinguishing a pool bottleneck from a CPU one? —
is the truest retention check there is, and it's what separates "I followed the
exercises" from "I can do performance engineering."

This is the **last track before
[24-platform-engineering](../../24-platform-engineering/README.md)** — the final
capstone-of-capstones track that ties the entire curriculum together into a
self-service internal developer platform. Everything you've built the ability to
*prove* here — that a system scales, holds its SLO, and fails in a place you
understand — is exactly what a platform has to guarantee on behalf of every team
that deploys onto it. You now have the last major operational discipline the
platform track assumes. Tear down anything still running, and go build the
platform.

## Next

[../../24-platform-engineering/README.md](../../24-platform-engineering/README.md)
— the final track: fold everything from all 23 prior tracks into one
self-service internal developer platform.
