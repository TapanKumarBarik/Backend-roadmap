# Continuous Deployment Strategies

## Why this matters

You can now build a traceable image (module 03) and you know how to make a
pipeline apply it (track 07 module 08's `kubectl set image`). But *how* the
new version replaces the old one is a strategy choice with real
consequences: done naively, a bad release takes down all users at once;
done well, you can expose a new version to 1% of traffic, watch it, and
abort before anyone notices. This module covers the three core deployment
strategies — rolling update, blue/green, and canary — conceptually and
applied to Kubernetes/AKS Deployments. It's the conceptual groundwork for
GitOps (module 05) and progressive delivery (module 06): you can't
automate a canary until you understand what a canary *is*.

## Concepts

### Recap: the rolling update you already have

Track 07 module 08 used `kubectl set image`, which triggers Kubernetes'
**default** strategy: the **rolling update**. Kubernetes replaces old pods
with new ones gradually, governed by two Deployment fields: `maxUnavailable`
(how many pods can be down during the roll) and `maxSurge` (how many extra
pods can be created above the desired count). It brings up some new pods,
waits for them to pass readiness probes, then terminates some old ones, and
repeats until all pods run the new version. `kubectl rollout status`
(track 07 module 08) blocks until this finishes or fails. The rolling
update is the baseline every other strategy is compared against.

### Rolling update: strengths and the blind spot

Rolling updates are cheap (no extra infrastructure — you reuse the same
Deployment's replica budget) and zero-downtime *if* readiness probes are
correct. Their limitation: during the roll, **both versions serve real
traffic simultaneously and you can't control the ratio precisely** — the
split is a side effect of how many pods have rolled, not something you set.
And once the roll completes, 100% of traffic is on the new version — there's
no "hold at 10% and watch" step. A bad version that passes its readiness
probe but is subtly broken (returns wrong data, is slow) rolls all the way
out and hits everyone. Rolling updates change *the pods*; they don't give
you a *traffic control knob*. That knob is what blue/green and canary add.

### Blue/green: two full environments, instant cutover

**Blue/green** runs **two complete versions side by side**: "blue" (current,
live) and "green" (new, receiving no user traffic yet). You deploy green in
full, test it in isolation (smoke tests against it directly), then **flip
100% of traffic** from blue to green in one atomic switch — on Kubernetes,
by repointing a Service's selector from the blue pods to the green pods.
Advantages: the cutover is instant and complete (no mixed-version window),
and **rollback is instant** too — flip the selector back to blue, which is
still running. Cost: you run *double* the pods during the transition (both
full environments), and stateful concerns (in-flight sessions, database
schema) need care. Blue/green trades resources for a clean, instant,
reversible cutover.

### Canary: expose a small slice, then widen

A **canary** release sends a *small percentage* of real traffic (say 5%) to
the new version while the rest stays on the old one, watches the new
version's health/metrics, and — only if it looks good — progressively
widens: 5% → 25% → 50% → 100%. If metrics degrade at any step, you abort
and route everything back to old. It's named after the "canary in a coal
mine": a small, sacrificial exposure that warns you before the whole
population is affected. Canary gives you the **precise traffic knob** rolling
updates lack, and limits blast radius far better than blue/green's
all-at-once flip — at the cost of complexity: you need a way to split
traffic by percentage and, ideally, automated analysis of the canary's
metrics to decide promotion (module 06's Argo Rollouts). On plain
Kubernetes you can approximate a canary crudely with replica-count ratios
(below); doing it *properly* by traffic percentage needs a mesh or ingress
controller that supports weighting.

### Approximating canary on plain Kubernetes with replica counts

Without a service mesh, you can approximate a traffic split using the fact
that a Service load-balances evenly across all its endpoints. Run two
Deployments (v1 and v2) selected by the *same* Service via a shared label,
and set their replica counts to the ratio you want: 9 replicas of v1 + 1 of
v2 ≈ 10% canary. It's coarse (the granularity is limited by replica count,
and it conflates "how much traffic" with "how many pods"), it doesn't do
session affinity, and scaling changes the ratio — but it's a real,
mesh-free way to see the concept work, and it's the "simple manual
traffic-split" approach module 06 contrasts with Argo Rollouts. Precise,
pod-count-independent weighting needs an ingress controller (nginx canary
annotations) or a mesh (track 13).

### Choosing a strategy, and where readiness/rollback fit

No strategy is universally right:

- **Rolling** — the sensible default for most stateless services; simplest,
  no extra infra.
- **Blue/green** — when you need an instant, all-or-nothing, instantly
  reversible cutover and can afford double resources (e.g. a risky release
  where you want zero mixed-version time).
- **Canary** — when blast radius matters most and you can measure the new
  version's health to gate promotion (the highest-confidence path, and the
  prerequisite for true continuous *deployment* from module 00).

Two things every strategy depends on: correct **readiness probes** (track
03 — without them, all strategies route traffic to pods that aren't ready)
and a **rollback plan** (`kubectl rollout undo` for rolling; selector flip
for blue/green; re-weight to 0% for canary). A deployment strategy without a
tested rollback is just a slower way to break production.

## Command reference

`kubectl` for rollouts and the objects that make each strategy work.

| Command | What it does | Notes |
|---|---|---|
| `kubectl set image deployment/<d> <c>=<img>` | Triggers a rolling update to a new image | The track 07 module 08 baseline |
| `kubectl rollout status deployment/<d> --timeout=180s` | Blocks until the roll finishes or fails | The CI pass/fail signal (track 07 module 08) |
| `kubectl rollout history deployment/<d>` | Lists the Deployment's revisions | Each rolling change is a revision |
| `kubectl rollout undo deployment/<d>` | Rolls back to the previous revision | Rolling-update rollback |
| `kubectl rollout undo deployment/<d> --to-revision=3` | Rolls back to a specific revision | Targeted rollback |
| `kubectl rollout pause/resume deployment/<d>` | Pauses/resumes an in-progress roll | Pause to hold a partial rollout (a crude canary hold) |
| `spec.strategy.rollingUpdate.maxSurge` | Extra pods allowed above desired during a roll | Tunes roll speed vs. resource use |
| `spec.strategy.rollingUpdate.maxUnavailable` | Pods allowed down during a roll | `0` = never dip below capacity (needs surge headroom) |
| `spec.strategy.type: Recreate` | Kill all old pods before starting new (has downtime) | The non-rolling alternative; rarely what you want |
| `kubectl patch service <svc> -p '{"spec":{"selector":{"version":"green"}}}'` | Repoints a Service to a different pod set | The blue/green cutover |
| `kubectl scale deployment/<d> --replicas=N` | Sets replica count | Adjusts the ratio in the replica-count canary approximation |
| `kubectl get endpoints <svc>` | Shows which pods a Service currently routes to | Verify a cutover actually moved traffic (track 03) |
| `kubectl get pods -l app=demo --show-labels` | Lists pods and their labels | Confirm which version each pod runs |

## Hands-on exercises

Use your AKS cluster (track 07) or a local kind/minikube cluster from track
03 — the Kubernetes objects are identical. Have a `demo` app image with two
visibly-different versions (v1 and v2, e.g. different response strings).

1. **Observe a rolling update in slow motion.** Deploy `demo:v1` with 6
   replicas. In one terminal run `kubectl get pods -l app=demo -w`; in
   another, `kubectl set image deployment/demo demo=<acr>/demo:v2`. Watch
   pods terminate and start in waves. Then inspect
   `spec.strategy.rollingUpdate` and note the default `maxSurge`/
   `maxUnavailable`. Set `maxUnavailable: 0` and `maxSurge: 1`, roll to a
   `v3`, and observe the roll is slower but never dips below full capacity.

2. **See the mixed-version window.** During a roll (slow it with a startup
   delay or many replicas), `curl` the Service repeatedly in a loop and
   observe responses flipping between v1 and v2 — proof that a rolling
   update serves *both* versions simultaneously and you don't control the
   ratio. Note you can't hold it at, say, 20%.

3. **Roll back a bad rolling update.** Roll to a deliberately broken image
   (crash-loops on startup). Watch `kubectl rollout status` fail (track 07
   module 08). Recover with `kubectl rollout undo deployment/demo`, confirm
   with `kubectl rollout status` that it's healthy again, and use
   `kubectl rollout history` to see the revisions.

4. **Blue/green: deploy green alongside blue.** Have two Deployments,
   `demo-blue` (label `version: blue`, running v1) and `demo-green` (label
   `version: green`, running v2), plus a Service selecting
   `app: demo, version: blue`. Confirm 100% of `curl`s return v1. Smoke-test
   green directly by port-forwarding to a green pod (not through the
   Service) and confirm it serves v2.

5. **Blue/green: the atomic cutover and instant rollback.** Flip the
   Service selector to `version: green`
   (`kubectl patch service demo -p '{"spec":{"selector":{"app":"demo","version":"green"}}}'`).
   Confirm `curl` now returns v2 for *every* request (no mixed window) and
   `kubectl get endpoints demo` lists only green pods. Then simulate a bad
   green: flip the selector back to `blue` and confirm instant recovery to
   v1 — the whole point of keeping blue running.

6. **Canary by replica ratio.** Make blue and green share the *same*
   Service selector (`app: demo`, no version in the selector) so the Service
   load-balances across both. Set blue (v1) to 9 replicas and green (v2) to
   1. Loop `curl` ~50 times and tally responses — roughly 10% should be v2.
   Increase green to 3 and blue to 7 and confirm the ratio shifts toward
   ~30%. This is the coarse, mesh-free canary approximation.

7. **Feel the limits of the replica-ratio canary.** From exercise 6, scale
   the whole app up (both Deployments) and watch the *ratio* stay roughly
   the same but the *granularity* problem appear: you can't get 5% with only
   a handful of pods, and an HPA (track 07 module 05) scaling one Deployment
   would silently change your traffic split. Write two sentences on why this
   conflation of "pod count" and "traffic share" is exactly what a real
   traffic-splitting tool (module 06) fixes.

8. **Diagnose and fix: the cutover that routed nowhere.** You'll reproduce
   the classic blue/green mistake. Patch the Service selector to
   `version: green` but with a typo (`version: gren`) or before green's
   pods are `Ready`. Observe `curl` now returns connection errors / 503 and
   `kubectl get endpoints demo` shows `<none>` — the Service matches no
   pods. Diagnose by comparing the Service's `spec.selector` to the green
   pods' actual labels (`kubectl get pods --show-labels`) — the exact
   selector-must-match-labels rule from track 03. Fix the selector (or wait
   for readiness), confirm endpoints populate and traffic flows to v2, and
   note why "the deploy succeeded" (the objects all exist) didn't mean
   "traffic is flowing."

## Independent challenge

No commands given — reason it out from track 03's Services/labels/probes,
track 07 module 08's rollout mechanics, module 03's image tagging, and this
module's strategies. On a real cluster, take one app and demonstrate all
three strategies deploying the *same* v1→v2 change, then write a short
comparison of what each cost you and protected you from. For the rolling
update, tune `maxSurge`/`maxUnavailable` so capacity never drops and capture
the mixed-version window with a `curl` loop. For blue/green, stand up a full
second environment, smoke-test it out-of-band, cut over atomically by
Service selector, and prove you can roll back instantly by flipping back.
For the canary, approximate a 10%→50%→100% progression using replica ratios
across two Deployments behind one Service, tallying traffic at each step,
and explicitly note where the approximation is lying to you (pod count vs.
traffic share, HPA interference, granularity). Every version must be
referenced by an immutable SHA tag (module 03), never `latest`, and every
strategy must have a rollback you actually execute, not just describe.
Conclude with a one-paragraph recommendation: for *this* app, which
strategy would you run in production and why — and which module-06 tool
would make your chosen strategy safe enough for true continuous deployment.

<details>
<summary>Stuck? One hint</summary>

The three strategies differ in one variable: *how traffic moves from old to
new*. Rolling = traffic follows pods as they're replaced (no independent
knob). Blue/green = traffic is a Service selector you flip atomically (the
knob is binary: all-blue or all-green). Canary = traffic is a percentage you
widen gradually (the knob is continuous, but on plain Kubernetes you can
only fake continuity with replica ratios). Build each around *what controls
the traffic*, not around the pods, and the rollback for each falls out
naturally: `rollout undo`, flip the selector back, re-weight to 0%. The
place the replica-ratio canary lies to you is the same place track 07
module 05's HPA would sabotage it — anything that changes pod counts changes
your "traffic split."

</details>

## Common mistakes & troubleshooting

- **Assuming a rolling update gives you a traffic knob.** It doesn't — the
  old/new ratio during a roll is a side effect of progress, not something
  you set, and it always ends at 100% new. For a held partial exposure you
  need canary/blue-green.
- **Blue/green cutover before green is ready.** Flipping the selector to
  pods that aren't `Ready` (or don't exist) routes traffic to nothing —
  `endpoints` shows `<none>`, users get 503s. Wait for readiness; verify
  endpoints after the flip.
- **Selector/label mismatch on cutover.** A typo in the Service selector
  means it matches no pods (track 03's endpoints=`<none>` symptom). Always
  reconcile the Service `spec.selector` against actual pod labels.
- **Forgetting blue/green's double cost.** Running two full environments
  doubles resource use during the transition; on a small cluster this can
  fail to schedule. Ensure capacity (or scale down blue after a confident
  cutover).
- **Treating the replica-ratio canary as precise.** It conflates pod count
  with traffic share, can't do fine percentages, and breaks the moment an
  HPA (track 07 module 05) rescales either Deployment. It's a teaching
  approximation; real canaries weight traffic independently of pod count
  (module 06).
- **No rollback rehearsal.** Every strategy needs a tested rollback:
  `rollout undo` (rolling), selector-flip-back (blue/green), re-weight to 0
  (canary). Discovering your rollback doesn't work *during* an incident is
  the worst time.
- **Broken readiness probes undermining all of it.** If readiness probes
  pass on unhealthy pods, every strategy happily routes traffic to broken
  pods. Correct probes (track 03) are the foundation under all three.

## Checkpoint quiz

Write down your answer to each question before expanding it — checking without attempting first is the single easiest way to fool yourself into thinking you've learned this.

1. What are `maxSurge` and `maxUnavailable`, and how would you set them so a
   rolling update never drops below full capacity?
2. What can a canary or blue/green deployment do that a rolling update
   fundamentally cannot?
3. Describe the blue/green cutover on Kubernetes mechanically — what object
   changes, and why is rollback instant?
4. What's the resource cost of blue/green, and when is it worth paying?
5. How do you approximate a 20% canary on plain Kubernetes with no service
   mesh, and name two ways that approximation is inaccurate.
6. Why would an HPA (track 07 module 05) sabotage a replica-ratio canary?
7. After a blue/green cutover, `curl` returns 503 and
   `kubectl get endpoints` shows `<none>`. What's the most likely cause and
   how do you confirm it?
8. Which strategy is the prerequisite for *true continuous deployment*
   (module 00) and why?

<details>
<summary>Show answers</summary>

1. `maxSurge` is how many pods above the desired count may exist during a
   roll; `maxUnavailable` is how many below. Set `maxUnavailable: 0` and
   `maxSurge: 1` (or more) so new pods come up *before* old ones leave and
   capacity never dips below the desired count.
2. Hold a precise, partial exposure of the new version — a canary can keep
   10% of traffic on new and watch it; blue/green can do an atomic all-or-
   nothing cutover with instant rollback. A rolling update can't hold a
   set ratio and always finishes at 100% new.
3. Two full pod sets (blue and green) run; a Service selects one of them by
   label. The cutover repoints the Service's `spec.selector` from blue's
   label to green's — one atomic change. Rollback is instant because blue
   is still running, so flipping the selector back immediately restores it.
4. Blue/green runs both full environments simultaneously, roughly doubling
   pod/resource use during the transition. It's worth it when you need an
   instant, complete, instantly-reversible cutover with no mixed-version
   window and can afford the temporary capacity.
5. Put two Deployments (v1, v2) behind one Service via a shared label and
   set replica counts to the ratio — e.g. 8×v1 + 2×v2 ≈ 20%. It's
   inaccurate because granularity is limited by pod count (can't do 5% with
   few pods) and because it conflates pod count with traffic share, so any
   rescale (HPA, manual scale) changes the split.
6. An HPA independently changes a Deployment's replica count based on load;
   since the replica-ratio canary *is* the replica counts, the HPA scaling
   v1 or v2 silently shifts the traffic split away from what you intended.
7. The Service's selector no longer matches any ready pods — a label typo or
   a cutover before green's pods were `Ready`. Confirm by comparing the
   Service's `spec.selector` to the green pods' actual labels
   (`kubectl get pods --show-labels`) and checking pod readiness.
8. Canary, because true continuous deployment removes the human gate, so you
   need to limit blast radius automatically and gate promotion on the new
   version's measured health — exactly what a canary (with automated
   analysis, module 06) provides.

</details>

## Next

[05-gitops-and-argocd](../05-gitops-and-argocd/README.md) — stop pushing
deploys from the pipeline and let an in-cluster controller pull the desired
state from Git instead.
