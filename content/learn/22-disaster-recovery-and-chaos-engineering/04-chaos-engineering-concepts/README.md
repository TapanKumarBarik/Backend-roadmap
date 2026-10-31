# 04 - Chaos Engineering Concepts

## Why this matters

Everything in modules 00-03 is a recovery mechanism you *believe* works:
failover you configured, backups you scheduled, runbooks you wrote. Belief is
not evidence. Chaos engineering is the discipline of turning belief into
evidence by injecting real failure into a system, in a controlled way, and
watching whether it survives the way you think it will. It's the empirical
counterpart to DR planning: instead of waiting for an outage to discover your
retry logic has a bug or your "highly available" service has a hidden single
point of failure, you find out on a Tuesday afternoon with a rollback ready.
This module is the concepts; module 05 is the tooling.

## Concepts

### The core principle: experiments, not breakage

Chaos engineering is often misheard as "randomly break production for fun." It
is the opposite — it's the **scientific method applied to resilience**. An
experiment has a specific structure:

1. **Define steady state** — a measurable output that means "the system is
   healthy": a track-20 SLI like request success rate or p99 latency, or an
   error-budget burn rate. You must be able to *see* steady state on the track
   12 observability stack before you break anything.
2. **Form a hypothesis** — "if we kill one replica of the checkout service,
   success rate stays above 99.9% and p99 latency stays under 300ms, because
   the other replicas absorb the load." A hypothesis is a falsifiable claim
   about how the system tolerates a specific failure.
3. **Inject the failure** — the smallest real fault that tests the hypothesis
   (kill a pod, add latency, exhaust CPU).
4. **Observe and compare** — did steady state hold? If yes, you've gained
   evidence (not proof — one experiment) of resilience. If no, you've found a
   weakness *before* it found you.
5. **Learn and fix** — a disproved hypothesis is the win; it's a resilience
   gap you now fix (module 07) and re-test.

The deliverable of a chaos experiment is a *validated or invalidated
hypothesis*, not "we broke something." "We killed a pod and nothing obviously
caught fire" with no defined steady state and no hypothesis is not an
experiment — it's just poking.

### Blast radius: the thing that makes it engineering, not recklessness

The difference between chaos *engineering* and chaos *arson* is **blast radius
control** — deliberately bounding how much of the system a failure can affect
so a surprising result is a contained incident, not an outage:

- **Scope the target** — inject into one pod, one node, one namespace, one
  availability zone — not "the whole service."
- **Scope the traffic** — run against a subset of users/requests (a canary
  slice, one region of an active-active setup) so most users are never
  exposed.
- **Time-box it** — a short experiment window with an automatic stop, not an
  open-ended fault.
- **Have an abort switch (a "big red button")** — a pre-decided, fast way to
  halt the experiment and undo the fault the instant steady state degrades
  past a threshold. Deciding the abort criteria *before* you start is
  non-negotiable.

Blast radius is what lets you run experiments against systems that matter: you
cap the downside so the *worst* case of a falsified hypothesis is small and
reversible.

### Start small, in non-prod, and earn your way to production

Chaos in production is the goal — production is the only environment with real
traffic, real data, real dependencies — but it's the *last* step, not the
first. The maturity ramp:

1. **Non-prod, one fault, tiny blast radius.** Kill a single pod in a dev
   namespace. Confirm your *tooling*, your *observability*, and your *abort
   switch* all work when nothing is at stake. Most first chaos experiments
   fail because the observability wasn't actually showing steady state, or the
   abort didn't undo cleanly — find that in dev.
2. **Non-prod, realistic scenarios.** Bigger faults (a zone, a dependency
   outage) in a staging environment under synthetic load.
3. **Production, minimal blast radius, business hours, humans watching.** Only
   once the experiment is well-understood in non-prod, run it in production
   with the smallest possible scope, during working hours (not 3am), with the
   team watching dashboards and an abort ready. Production chaos at 2am
   unattended is how you cause the outage you were trying to prevent.

The instruction in this track's brief — *start small in non-prod before ever
touching prod* — is this ramp. Skipping to production is the single most
common way chaos engineering gets banned at a company after one bad day.

### Common failure types you inject

The vocabulary of faults, each testing a different resilience assumption:

- **Pod / instance failure** — kill a replica. Tests redundancy and
  self-healing (does Kubernetes reschedule, do other replicas absorb load?).
- **Resource exhaustion** — pin CPU, fill memory, fill a disk. Tests limits,
  requests, and OOM behaviour (does one greedy pod starve its neighbours?).
- **Network faults** — latency, packet loss, DNS failure, blocking a
  dependency. Tests timeouts, retries, and circuit breakers (the track 13
  service-mesh patterns) — does a slow dependency cascade into a total
  outage?
- **Zone / node failure** — drain or kill a node or a whole AZ. Tests
  anti-affinity, pod disruption budgets, and zone redundancy.
- **Dependency / region failure** — take out a downstream service or a whole
  region. This is where chaos meets DR (modules 01-02) — a region-loss
  experiment *is* a DR drill, which is the game-day synthesis in module 06.

### Why you observe with the stack you already built

A chaos experiment is only as good as your ability to *see* its effect. This
is the direct payoff of track 12 and track 20:

- Track 12's **Prometheus/Grafana** gives you the steady-state metric and the
  during-experiment view — success rate, latency, saturation.
- Track 12's **distributed tracing** shows *where* an injected latency or
  failure propagates — which downstream call cascaded.
- Track 20's **SLOs and error-budget burn rate** give the pass/fail line: the
  experiment's hypothesis is usually phrased in SLO terms, and a burn-rate
  spike is your abort signal.

If you can't see steady state on these before the experiment, you're not ready
to run it — you'd have no way to know if the hypothesis held. "Can I observe
the effect?" is a precondition, and confirming it is often the first real bug
chaos engineering surfaces (a metric that wasn't actually wired up).

## Command reference

This module is conceptual; the "commands" are the artifacts of a disciplined
experiment. You'll run real fault-injection tooling in module 05. The
reference here is the **experiment design template** and the observability
checks that gate it.

| Artifact / check | What it is | Example |
|---|---|---|
| Steady-state SLI query | The PromQL that defines "healthy" (track 12) | `sum(rate(http_requests_total{code=~"2.."}[5m])) / sum(rate(http_requests_total[5m]))` |
| Hypothesis statement | Falsifiable claim about tolerance to one fault | "Killing 1 of 3 replicas keeps success rate ≥ 99.9%" |
| Blast-radius scope | Target + traffic + time bound | "1 pod, dev namespace, 5 min, auto-abort on >1% error" |
| Abort criteria | Pre-decided stop condition | "Error-budget burn > 2× or p99 > 500ms → abort" |
| `kubectl delete pod` | The crudest real fault (redundancy test) | `kubectl delete pod <one-replica>` |
| Grafana dashboard | Where you watch steady state before/during/after | track 12 stack |

Experiment design template (write this out for *every* experiment, before
running it):

```
Title:            <what you're testing>
Steady state:     <measurable SLI + its normal value, e.g. success ≥ 99.9%>
Hypothesis:       <the system tolerates FAULT because MECHANISM>
Blast radius:     <target scope + traffic scope + time box>
Abort criteria:   <the threshold at which you hit the big red button>
Environment:      <non-prod first; prod only when proven>
Observation:      <which track-12 dashboards / track-20 SLOs you watch>
Result:           <held / did not hold — filled in after>
Learning / fix:   <the resilience gap found and the fix (module 07)>
```

## Hands-on exercises

No paid multi-region infra is required here — a local kind cluster (track 03)
or a single small AKS cluster with the track 12 observability stack is enough.
The goal is to internalize the *discipline* before module 05's tooling. Deploy
a simple multi-replica app with a `/healthz` and metrics you can scrape.

### 1. Establish and see steady state

Deploy an app with 3 replicas behind a Service, generate steady traffic, and
open a Grafana panel (track 12) showing request success rate and p99 latency.

```bash
kubectl create deployment web --image=<your-metrics-app> --replicas=3
kubectl expose deployment web --port=80
# generate load and watch success rate + p99 on Grafana
```

Write down the steady-state numbers. **You cannot do chaos engineering
without this baseline** — it's the "before."

### 2. Write a full experiment design (before breaking anything)

Fill in the template above for: "kill one of three `web` replicas." State the
steady-state SLI and value, a falsifiable hypothesis, the blast radius (1 pod,
this namespace, 2 min), abort criteria, and which dashboard you'll watch. Do
*not* run it yet — the design is the exercise here.

### 3. Run the experiment and compare to the hypothesis

```bash
kubectl get pods -l app=web
kubectl delete pod <one-pod>          # the fault
# watch Grafana: did success rate stay above your threshold? did p99 spike?
kubectl get pods -l app=web -w        # observe reschedule/self-heal
```

Fill in Result and Learning. If steady state held, you have evidence the
redundancy works. If success rate dipped (e.g. the Service kept routing to the
dying pod for a few seconds), you've found a gap — record it.

### 4. Practice blast-radius control

Re-run, but this time deliberately bound and abort. Set a rule: "if success
rate drops below 99% for 15s, abort by stopping the fault." Kill a pod, watch,
and if your abort condition trips, recreate/scale immediately:

```bash
kubectl scale deployment web --replicas=3   # your "big red button" — restore capacity
```

The exercise is *practising the abort*, not the kill. An abort you've never
rehearsed won't work when you need it.

### 5. Test whether you can even observe the fault

Inject a fault your dashboards *should* show and confirm they do. If you can't
see it, that's the bug:

```bash
# make one replica unhealthy (e.g. exec in and stop the app) and watch:
kubectl exec <pod> -- sh -c "kill 1" 2>/dev/null
# Does Grafana show reduced healthy endpoints? Does the SLI move?
```

Expected: the observability stack visibly reflects the fault. If it doesn't,
your first resilience fix isn't in the app — it's fixing observability so
future experiments are meaningful.

### 6. Escalate the fault type (resource exhaustion)

Move up the fault vocabulary. Stress one pod's CPU and observe whether it
harms its neighbours (tests limits/requests from track 03):

```bash
kubectl exec <pod> -- sh -c "yes > /dev/null &"    # peg a core
# watch: does p99 for the whole Service rise, or is the noisy pod isolated?
```

Record whether the blast radius stayed within the one pod (good — limits
work) or leaked to the Service (a gap — missing/oversized limits). Kill the
stressor when done.

### 7. Diagnose-and-fix: a chaos experiment reveals a hidden single point of failure

The module's core lesson. Deploy the app so it *looks* redundant (3 replicas)
but has a hidden SPOF — e.g. all 3 replicas on **one node**, or all depending
on a single non-replicated backing service. Form the hypothesis "killing one
replica is survivable" (true), then run the *bigger* honest experiment the
hypothesis implies — drain the node (or kill the backing service):

```bash
kubectl get pods -l app=web -o wide      # notice all 3 on the same node — the SPOF
kubectl drain <that-node> --ignore-daemonsets --delete-emptydir-data
# watch success rate crater: "3 replicas" was 1 fault domain all along
```

**Finding:** the system that reported "3/3 replicas Ready" had no real
redundancy — one node (or one backing dependency) failing takes it all down.
The replica count was resilience theatre. **Fix:** spread replicas across
nodes/zones with `topologySpreadConstraints` / pod anti-affinity, add a
PodDisruptionBudget, and replicate the backing dependency — then re-run the
node-drain experiment and confirm steady state now holds. This is exactly the
kind of untested SPOF chaos engineering exists to surface, and it feeds
directly into module 07's gap analysis.

### 8. Uncordon and clean up

```bash
kubectl uncordon <node>
kubectl delete deployment web svc web
```

Expected: node back in service, app removed. No billable resources if you used
kind; if on AKS, this is the same cleanup discipline — nothing left running.

## Independent challenge

Design — and run in a non-prod environment — a complete chaos experiment
against a system with a real dependency (e.g. an app that calls a database or
another service). Write the full experiment design (steady state as a track-12
SLI, a falsifiable hypothesis phrased in track-20 SLO terms, a bounded blast
radius, explicit abort criteria), then inject a **network fault** (latency or
an outright block) on the dependency rather than a pod kill — testing whether
the app's timeouts/retries (foreshadowing track 13's patterns) keep steady
state or whether a slow dependency cascades into a full outage. Record whether
the hypothesis held and the specific gap if it didn't. Draws on track 12
(observing steady state), track 20 (SLO as the pass/fail line), and this
module's blast-radius discipline. Keep it in non-prod; if you used any billable
resources, tear them down.

<details>
<summary>Stuck? One hint</summary>

A network fault on a dependency is the most revealing chaos experiment because
it tests the failure mode people never handle: not "the dependency is down"
(easy — you get a fast error) but "the dependency is *slow*." Inject latency
(e.g. 5s) on the call, and watch whether the app's client has a timeout
shorter than that. If it doesn't, requests pile up waiting, threads/connections
exhaust, and the *whole app* becomes unavailable even though only a downstream
dependency slowed down — a cascading failure. The hypothesis "a slow
dependency degrades gracefully" is the one that's most often false, and the
fix (a sensible timeout + circuit breaker) is precisely track 13's material,
which module 07 audits.

</details>

## Common mistakes & troubleshooting

- **"Chaos" without a hypothesis or steady state.** Killing things with no
  defined "healthy" metric and no falsifiable claim isn't an experiment — you
  learn nothing whether it "works" or not. Always write the design first.
- **No blast-radius control or abort switch.** Unbounded fault injection is
  just causing an outage. Scope the target, the traffic, and the time; decide
  the abort criteria *before* you start and rehearse the abort.
- **Starting in production.** Prove the experiment, the observability, and the
  abort in non-prod first. Production chaos is the last step, minimal blast
  radius, business hours, humans watching — never the first, unattended, at
  night.
- **Can't observe the effect.** If your dashboards don't show steady state
  moving under the fault, the experiment is meaningless — fix observability
  (track 12) first; that's often the first real finding.
- **Treating a held hypothesis as proof.** One experiment is evidence, not a
  guarantee — systems change, and yesterday's resilience regresses. Chaos is a
  repeated practice (module 06's recurring game days), not a one-off
  certificate.
- **Cost pitfall — chaos infrastructure and blast radius that leaks spend
  (ties to track 21).** The experiments themselves are cheap, but running them
  against a full multi-region setup you spun up just to break, or leaving
  stress-test load generators running, quietly bills. Run chaos against the
  smallest environment that still tests the hypothesis, and tear down any
  infra you provisioned only for the experiment — the same right-sizing
  instinct as the DR standby.

## Checkpoint quiz

Write down your answer to each question before expanding it — checking without attempting first is the single easiest way to fool yourself into thinking you've learned this.

1. What are the five steps of a chaos experiment, and what is its actual
   deliverable?
2. Why is "we killed a pod and nothing broke" not a chaos experiment?
3. Define blast radius and name three ways you bound it.
4. Why must you have an abort switch and its criteria decided *before*
   starting, not during?
5. Give the maturity ramp for where to run chaos, and why production is last
   rather than first.
6. Name four fault types you can inject and one resilience assumption each
   tests.
7. Why is the track-12 observability stack a *precondition* for a chaos
   experiment, not just a nice-to-have?
8. In exercise 7, "3 replicas" turned out not to be redundant. Explain how,
   and the fix.

<details>
<summary>Show answers</summary>

1. Define steady state (a measurable SLI) → form a falsifiable hypothesis →
   inject the smallest real fault → observe and compare to the hypothesis →
   learn and fix. The deliverable is a validated or invalidated hypothesis (a
   resilience gap found or confidence gained), not "we broke something."
2. There's no defined steady-state metric and no falsifiable hypothesis, so
   neither "nothing broke" nor "something broke" teaches you anything
   measurable — it's poking, not an experiment.
3. Blast radius is how much of the system a fault can affect. Bound it by
   scoping the target (one pod/node/zone), scoping the traffic (a canary/user
   subset), and time-boxing with an automatic stop — plus an abort switch.
4. Because during a degrading experiment you won't reason clearly about when
   to stop; a pre-decided threshold and a rehearsed undo make aborting
   automatic and fast, which is what keeps a falsified hypothesis a contained
   incident.
5. Non-prod one small fault (prove tooling/observability/abort) → non-prod
   realistic scenarios → production minimal blast radius, business hours,
   watched. Production is last because it's the only place with real stakes;
   you earn it by proving the experiment is safe and observable first.
6. Pod/instance failure (redundancy/self-healing); resource exhaustion
   (limits/requests, noisy-neighbour isolation); network fault
   (timeouts/retries/circuit breakers); zone/node failure
   (anti-affinity/PDB/zone redundancy); dependency/region failure (DR).
7. Because a chaos experiment's whole value is comparing steady state before
   and during the fault; without being able to *see* the SLI move you can't
   tell if the hypothesis held, so if you can't observe it you're not ready to
   run it.
8. All three replicas were in one fault domain (same node, or sharing one
   non-replicated dependency), so a single node drain / dependency failure
   took them all down — the replica count was theatre. Fix: spread across
   nodes/zones (topology spread / anti-affinity), add a PodDisruptionBudget,
   and replicate the backing dependency; then re-run the node-drain
   experiment.

</details>

## Next

[05-chaos-engineering-with-azure-chaos-studio](../05-chaos-engineering-with-azure-chaos-studio/README.md) —
you have the discipline: hypotheses, blast radius, abort switches, and
observation through the track-12 stack. Now pick up the real tooling — Azure
Chaos Studio and Chaos Mesh — to inject pod, network, and resource faults as
managed, repeatable, permissioned experiments.
