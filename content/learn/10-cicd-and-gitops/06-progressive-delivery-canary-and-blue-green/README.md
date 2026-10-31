# Progressive Delivery: Canary and Blue/Green in Practice

## Why this matters

Module 04 taught canary and blue/green *conceptually* and made you fake a
canary with replica ratios — which you saw is coarse and lies to you (pod
count isn't traffic share). Module 05 gave you GitOps, where deploys happen
by committing to Git. This module closes the loop: **progressive delivery** —
automating a real, metric-gated canary or blue/green rollout so the
promotion from 5% → 100% is driven by the new version's measured health, not
a human watching a dashboard. You'll use **Argo Rollouts** (a sibling to
ArgoCD that replaces the Deployment object with one that understands
canaries) and compare it against the managed traffic-splitting you already
met in track 06's Azure Container Apps revisions. This is the capability
that makes true continuous *deployment* (module 00) safe: bad versions get
caught and aborted automatically before they reach everyone.

## Concepts

### What "progressive delivery" adds over module 04

Module 04's strategies were *manual*: you flipped a selector, you scaled
replicas, you watched `curl` output and decided. **Progressive delivery**
automates the *progression* and the *decision*: the system advances the
canary through defined steps (weights and pauses) and, at each step,
consults **analysis** — real metrics (error rate, latency, success rate) —
to decide whether to promote to the next step or **automatically abort and
roll back**. So the human isn't in the loop for a healthy rollout, and a
degrading rollout is caught by data, not vigilance. This is the difference
between "a canary strategy" and "a canary that a robot supervises."

### Argo Rollouts: a Deployment that understands canaries

**Argo Rollouts** is a controller and a custom resource, `Rollout`, that is
a **drop-in replacement for a Kubernetes Deployment** (same pod template,
same selectors) but with a `strategy` block that natively expresses canary
and blue/green. Instead of `spec.strategy.rollingUpdate` (module 04), a
`Rollout` has:

- `strategy.canary` with a list of **steps**: `setWeight: 20`, `pause:
  {duration: 60s}`, `setWeight: 50`, `pause: {}` (pause indefinitely for
  manual promotion), etc. The controller walks these steps on each new image.
- `strategy.blueGreen` with `activeService`/`previewService` and an
  `autoPromotionEnabled` flag — it manages two ReplicaSets and the Service
  cutover for you (what you did by hand in module 04, automated).

You still deploy it the GitOps way (module 05): commit a new image tag to
the `Rollout` manifest in Git, ArgoCD syncs it, and Argo Rollouts executes
the progressive strategy. The two tools compose — ArgoCD delivers the desired
state; Argo Rollouts controls *how* it rolls out.

### Traffic weighting: replica-based vs. provider-based

How does a `Rollout` send exactly 20% of traffic to the canary? Two modes:

- **Basic (replica-based) weighting**: without a traffic provider, Argo
  Rollouts approximates the weight with replica counts — the same coarse
  approach as module 04's manual ratio, but managed for you. Fine for
  learning; still conflates pods with traffic.
- **Traffic-provider weighting**: integrated with an ingress controller
  (nginx, ALB) or a **service mesh** (Istio, SMI — track 13), the `Rollout`
  sets a *real* traffic weight independent of pod count, so `setWeight: 5`
  means 5% of requests regardless of how many pods exist. This is the
  precise knob module 04 said you needed a mesh for. This module uses
  replica-based weighting to stay mesh-free; track 13 upgrades it to true
  mesh-based weighting.

### Analysis and automated promotion/rollback

The feature that makes it *progressive* rather than just *timed* is
**AnalysisTemplate**/**AnalysisRun**: a query against a metrics source
(Prometheus — track 12, a cloud monitor, or a simple HTTP check) run at each
canary step. It defines success criteria (e.g. "HTTP success rate ≥ 95% over
the last 5 minutes"). If the metric passes, the rollout advances to the next
`setWeight`; if it fails, the rollout **aborts and rolls back** to the stable
version automatically. This is the automated decision that replaces a human
watching Grafana. Without analysis, a canary is just a slow, timed rollout
(pauses give a human *time* to look, but nothing gates automatically). With
analysis, you have the auto-rollback backstop that makes gate-free continuous
deployment (module 00) defensible.

### Blue/green with Argo Rollouts

The `blueGreen` strategy automates module 04's manual selector-flip: you
declare an `activeService` (live) and a `previewService` (points at the new
version for out-of-band smoke tests), the controller brings up the green
ReplicaSet fully, and then either auto-promotes (`autoPromotionEnabled:
true`) or waits for you to run `kubectl argo rollouts promote` (a manual gate
— continuous *delivery*). Rollback is instant because, like module 04, the
old ReplicaSet is kept until you scale it down. This is your manual module-04
blue/green, made declarative, repeatable, and integrated with GitOps.

### Compare and contrast: Container Apps revisions (track 06)

You've *already done* managed progressive delivery — in track 06's Azure
Container Apps, module 05 (revisions, traffic-splitting, Dapr). There, each
deploy created a **revision**, and you split traffic across revisions by
percentage (`--traffic-weight revision=xx=20`) with the platform handling
the real weighting — no mesh, no Argo Rollouts, no cluster to manage. That's
the same *idea* (weighted traffic across versions, gradual promotion) but
delivered by the **managed platform** rather than a controller you install
and operate. The trade-off is the recurring theme from track 07: Container
Apps gives you weighted revisions for free but hides the machinery and
constrains you to its model; Argo Rollouts on AKS gives you full control
(custom steps, analysis against any metric, mesh integration) at the cost of
installing, configuring, and operating it yourself. Same capability, opposite
ends of the managed-vs-self-hosted spectrum — exactly the choice track 06 vs.
track 07 framed.

## Command reference

Argo Rollouts install, the `kubectl argo rollouts` plugin, and the `Rollout`
spec fields.

| Command / field | What it does | Notes |
|---|---|---|
| `kubectl create namespace argo-rollouts` | Namespace for the controller | Convention |
| `kubectl apply -n argo-rollouts -f https://github.com/argoproj/argo-rollouts/releases/latest/download/install.yaml` | Installs the Argo Rollouts controller | Separate from ArgoCD (they compose) |
| `kubectl argo rollouts version` | Confirms the kubectl plugin is installed | Install the plugin separately from the controller |
| `kind: Rollout` | The Deployment-replacement resource | Same pod template; adds `strategy.canary`/`blueGreen` |
| `strategy.canary.steps[].setWeight: 20` | Send 20% of traffic to the canary | Replica-based unless a traffic provider is configured |
| `strategy.canary.steps[].pause: {duration: 60s}` | Hold at the current weight for 60s | Timed pause |
| `strategy.canary.steps[].pause: {}` | Pause indefinitely until manually promoted | The manual gate (continuous delivery) |
| `strategy.canary.analysis` / `AnalysisTemplate` | Metric-based gate for promotion | Fails → auto-abort and rollback |
| `strategy.blueGreen.activeService` | Service pointing at the live version | Cut over on promotion |
| `strategy.blueGreen.previewService` | Service pointing at the new version for testing | Smoke-test green out-of-band |
| `strategy.blueGreen.autoPromotionEnabled: false` | Require manual promotion of green | The blue/green manual gate |
| `kubectl argo rollouts get rollout <name> --watch` | Live view of the rollout's steps and weights | The primary progress view |
| `kubectl argo rollouts promote <name>` | Advance past a manual pause / promote green | The human "go" for a gated step |
| `kubectl argo rollouts abort <name>` | Abort the rollout, revert to stable | Manual emergency stop |
| `kubectl argo rollouts undo <name>` | Roll back to a previous revision | Post-rollout rollback |
| `kubectl argo rollouts set image <name> <c>=<img>` | Trigger a new rollout to a new image | The canary-aware analogue of `kubectl set image` |

## Hands-on exercises

Use your AKS cluster with ArgoCD already installed (module 05). Install Argo
Rollouts and the `kubectl argo rollouts` plugin. Use your `demo` app with
distinguishable v1/v2 images (SHA-tagged, module 03).

1. **Install Argo Rollouts and convert a Deployment.** Install the
   controller and the kubectl plugin. Take your `demo` Deployment and
   convert it to a `Rollout` (change `kind: Deployment` → `kind: Rollout`,
   add a `strategy.canary` with a couple of `setWeight`/`pause` steps).
   Apply it (via ArgoCD/GitOps, module 05) and confirm
   `kubectl argo rollouts get rollout demo` shows it healthy at 100% stable.

2. **Run a timed canary.** Define canary steps: `setWeight: 20`, `pause:
   {duration: 60s}`, `setWeight: 50`, `pause: {duration: 60s}`,
   `setWeight: 100`. Trigger a rollout to v2
   (`kubectl argo rollouts set image demo demo=<acr>/demo:<sha-v2>`) and
   watch `kubectl argo rollouts get rollout demo --watch` step through the
   weights automatically, pausing at each. `curl`-loop the Service and watch
   the v2 proportion rise 20% → 50% → 100%.

3. **A manual-promotion gate.** Change one pause to `pause: {}` (indefinite).
   Trigger a rollout and confirm it stops at that step and *waits*. Promote
   it deliberately with `kubectl argo rollouts promote demo` and watch it
   continue. This is continuous *delivery* (human gate) at the rollout level.

4. **Abort a canary mid-rollout.** Start a canary to a v3, and while it's
   paused at 20%, run `kubectl argo rollouts abort demo`. Confirm traffic
   snaps back to 100% stable (v2) and the canary pods are removed. Note how
   much smaller the blast radius was than a rolling update that had already
   gone to 100%.

5. **Metric-gated automatic promotion.** Add an `AnalysisTemplate` with a
   simple success check (an HTTP probe against the canary, or a Prometheus
   query if you have monitoring from track 07 module 06 / track 12) and
   reference it from a canary step. Roll out a *healthy* v-next and confirm
   analysis passes and it auto-promotes. Then roll out a *broken* v-next
   (returns 500s) and confirm analysis **fails and the rollout aborts
   automatically** — no human intervention. This is the auto-rollback
   backstop for gate-free deployment.

6. **Blue/green with Argo Rollouts.** Reconfigure the `Rollout` to
   `strategy.blueGreen` with an `activeService` and `previewService` and
   `autoPromotionEnabled: false`. Roll out v-next; confirm the preview
   Service serves the new version while the active Service still serves the
   old. Smoke-test via the preview Service, then
   `kubectl argo rollouts promote demo` and confirm the active Service cuts
   over. This is module 04's manual blue/green, now declarative.

7. **Compare with Container Apps revisions (track 06).** Without deploying
   anything new, write a side-by-side comparison: deploy the *same* 80/20
   split on (a) Argo Rollouts on AKS and (b) how you did it in track 06
   module 05 with `az containerapp ingress traffic set --traffic-weight`.
   For each, note: who does the traffic weighting, whether it's pod-count-
   dependent, what you had to install/operate, and what you gave up. Conclude
   with when you'd pick each — the managed-vs-self-hosted trade-off from
   track 06/07.

8. **Diagnose and fix: a canary that won't progress.** You'll reproduce the
   most common Argo Rollouts stall. Trigger a canary and observe
   `kubectl argo rollouts get rollout demo` shows it *stuck* — not
   progressing past a step. Reproduce one of: (a) the canary pods aren't
   becoming `Ready` (bad image/probe — track 03/module 04), so the rollout
   correctly refuses to advance; (b) an `AnalysisRun` is failing (the metric
   query is wrong or the endpoint is down), so promotion is gated forever; or
   (c) the rollout is paused at a `pause: {}` step and simply awaiting a
   manual `promote`. Investigate with
   `kubectl argo rollouts get rollout demo` (step + message), `kubectl
   describe rollout demo`, `kubectl get analysisrun` and its logs, and pod
   readiness. Fix the actual cause (fix the image/probe; fix the analysis
   query; or run `promote`), and confirm the rollout completes. Write one
   sentence distinguishing "stuck because something is wrong" (a, b — the
   gate is protecting you) from "stuck because it's waiting for you" (c — the
   gate is working as designed).

## Independent challenge

No YAML given — build it from module 04's strategy concepts, module 05's
GitOps delivery, this module's Argo Rollouts machinery, and track 06 module
05's managed-revision comparison. On your AKS cluster, set up a fully
automated, metric-gated canary for your demo app delivered through GitOps,
and prove it both promotes good releases and rejects bad ones without a
human in the loop. The `Rollout` must live in your GitOps config repo so a
deploy is triggered by committing a new SHA-tagged image (module 03/05); the
canary must progress through at least three weight steps with an
`AnalysisTemplate` gating each promotion on a real health signal; a healthy
release must auto-promote to 100% with no manual action; and a deliberately
broken release must be automatically aborted and rolled back to stable, which
you prove by showing users never saw more than the canary weight's worth of
errors. Then write a one-paragraph decision doc: for this exact app, would
you run this self-managed Argo Rollouts canary on AKS, or the managed
weighted-revision approach from track 06's Container Apps — justify it on
control, operational burden, and what each hides, the same axis track 07's
capstone had you reasoning about.

<details>
<summary>Stuck? One hint</summary>

Two failure modes trip people up, and they look identical from the outside
("the rollout isn't moving"). One is *healthy stall*: a `pause: {}` step or a
still-running analysis window — the rollout is correctly waiting. The other
is *unhealthy stall*: canary pods not `Ready`, or an `AnalysisRun` failing —
the rollout is correctly refusing to promote something broken. Always run
`kubectl argo rollouts get rollout <name>` first; its per-step message tells
you which it is, and `kubectl get analysisrun` + its logs tell you *why* an
analysis failed. Build the analysis against a signal you can deliberately
break (make v-next return 500s) so you can *see* the auto-abort fire — a
canary gate you've never watched reject a bad release is as untrustworthy as
a required check you've never seen go red (module 02).

</details>

## Common mistakes & troubleshooting

- **Expecting `setWeight` to be exact without a traffic provider.** With
  replica-based weighting, `setWeight: 5` is approximated by pod counts (same
  coarseness as module 04's manual ratio). For true pod-count-independent
  weighting you need an ingress/mesh traffic provider (track 13).
- **A canary with no analysis is just a slow rollout.** Pauses give a human
  *time* to look but gate nothing automatically. Without an
  `AnalysisTemplate`, there's no automatic abort — don't mistake timed pauses
  for a safety gate.
- **Analysis query that can't fail (or always fails).** A metric query
  pointing at the wrong service, or with criteria that can never be met,
  either rubber-stamps every release or blocks every release. Test the
  analysis against a known-bad release to confirm it actually rejects.
- **Confusing "waiting for promote" with "stuck".** A `pause: {}` step
  intentionally waits for `kubectl argo rollouts promote`. It's not broken;
  it's a manual gate. `get rollout` distinguishes this from a failed step.
- **Canary pods not Ready stalling the rollout.** If the new version fails
  readiness (bad probe/image, track 03/module 04), the rollout correctly
  refuses to advance — fix the pod, not the rollout.
- **Leaving a `Rollout` and a `Deployment` for the same app.** A `Rollout`
  *replaces* the Deployment; running both (same selector) makes two
  controllers fight over the pods. Convert, don't duplicate.
- **Forgetting Argo Rollouts and ArgoCD are different tools.** ArgoCD
  delivers desired state from Git; Argo Rollouts controls how a `Rollout`
  progresses. You install both; they compose. Confusing their roles leads to
  looking in the wrong controller's logs.

## Checkpoint quiz

Write down your answer to each question before expanding it — checking without attempting first is the single easiest way to fool yourself into thinking you've learned this.

1. What does "progressive delivery" automate that module 04's manual canary
   did not?
2. What is a `Rollout` and how does it relate to a Kubernetes Deployment?
3. What's the difference between replica-based and traffic-provider weighting
   in Argo Rollouts, and which gives you an exact percentage regardless of
   pod count?
4. What does an `AnalysisTemplate` do, and what turns a canary from "a slow
   timed rollout" into "an auto-rollback-protected rollout"?
5. A rollout is stuck at 20%. Give two fundamentally different reasons and
   how you'd tell them apart with one command.
6. In blue/green with Argo Rollouts, what are the `activeService` and
   `previewService` for, and what does `autoPromotionEnabled: false` give you?
7. How does track 06's Container Apps revision traffic-splitting achieve the
   same outcome, and what's the core trade-off versus Argo Rollouts on AKS?
8. Why is metric-gated progressive delivery a prerequisite for safe,
   gate-free continuous *deployment* (module 00)?

<details>
<summary>Show answers</summary>

1. It automates both the *progression* (walking through weight steps with
   pauses) and the *decision* (consulting metrics via analysis to promote or
   auto-abort), so a healthy rollout needs no human and a degrading one is
   caught by data rather than by someone watching a dashboard.
2. A `Rollout` is an Argo Rollouts custom resource that replaces a
   Deployment — same pod template and selectors — but adds a `strategy`
   block natively expressing canary and blue/green (weight steps, analysis,
   active/preview services) instead of just `rollingUpdate`.
3. Replica-based weighting approximates the percentage with pod counts (coarse,
   pod-count-dependent — like module 04's manual ratio). Traffic-provider
   weighting (via ingress/mesh) sets a real traffic weight independent of pod
   count, so `setWeight: 5` means 5% of requests regardless of replica count.
4. An `AnalysisTemplate` runs a metric query at canary steps with success
   criteria; if it fails, the rollout auto-aborts and rolls back. Adding
   analysis is exactly what turns a merely timed/paused rollout into one with
   an automatic rollback backstop.
5. (a) The canary is *waiting for you* — a `pause: {}` manual gate. (b) The
   canary is *blocked because something is wrong* — pods not Ready or an
   analysis failing. `kubectl argo rollouts get rollout <name>` shows the
   current step and a message that distinguishes them (awaiting promotion vs.
   degraded/failed analysis).
6. `activeService` points at the live version; `previewService` points at the
   new version so you can smoke-test it out-of-band before cutover.
   `autoPromotionEnabled: false` makes the cutover wait for a manual
   `kubectl argo rollouts promote` — a human gate (continuous delivery).
7. Container Apps creates a revision per deploy and splits traffic across
   revisions by weight (`--traffic-weight`), with the managed platform doing
   the real weighting — no cluster, mesh, or controller to operate. Trade-off:
   Container Apps is zero-ops but constrains you to its model and hides the
   machinery; Argo Rollouts on AKS gives full control (custom steps, arbitrary
   metric analysis, mesh integration) at the cost of installing and operating
   it — the managed-vs-self-hosted axis from tracks 06/07.
8. Gate-free continuous deployment removes the human backstop, so you need the
   system itself to limit blast radius (small canary weight) and to detect and
   undo a bad release automatically (metric analysis → auto-abort). Without
   that automated detect-and-rollback, nothing catches a bad deploy before it
   reaches all users.

</details>

## Next

[07-pipeline-security-and-secrets](../07-pipeline-security-and-secrets/README.md)
— secure the whole pipeline: OIDC over long-lived secrets, least-privilege
service connections, and protecting production with required reviewers.
