# 03 - Canary and Blue/Green Traffic Splitting

## Why this matters

You've now met the *same problem* — ship a new version safely by shifting a
controlled slice of traffic to it — in three different worlds: ACA revisions
(track 06), Argo Rollouts (track 10), and now Istio. This module makes you
fluent in the Istio mechanism (weighted `VirtualService` routing) and, just
as importantly, able to say *why you'd reach for each of the three*. Canary
and blue/green are the highest-value everyday use of the traffic-management
you learned in module 02.

## Concepts

### Canary vs. blue/green, in Istio terms

Both are just weight schedules over the `v1`/`v2` subsets from module 02:

- **Canary**: gradually shift weight — `100/0 → 95/5 → 80/20 → 50/50 → 0/100`,
  pausing at each step to watch metrics, so only a small blast radius is
  exposed to a bad version at any moment. In Istio this is editing the
  `weight` fields of a `VirtualService` between steps.
- **Blue/green**: keep both versions fully deployed but send 100% to one
  ("blue"), then flip 100% to the other ("green") in a single step, with an
  instant flip back if it misbehaves. In Istio this is `100/0` then `0/100` on
  the same VirtualService — no redeploy, because both subsets are already
  running (exactly the "old revision is still there" instant-rollback property
  you saw with ACA revisions in track 06 module 05).

The key Istio property: because weight is a *routing* decision made by the
sidecars, changing it is a config edit that takes effect in seconds, and
**rollback is just restoring the previous weights** — no image pull, no
rescheduling.

### Mesh weighting vs. replica-ratio weighting (the track 10 tie-in)

Track 10 module 06 built canaries with **Argo Rollouts** and, without a
traffic provider, used **replica-based weighting** — approximating "10%" with
pod counts, which it explicitly warned "lies to you" because pod count isn't
traffic share. It also said the fix was a traffic provider such as a **service
mesh**, and that *track 13 would upgrade it to true mesh-based weighting*.
This module *is* that upgrade. With Istio, `weight: 10` means 10% of requests
regardless of how many Pods back each subset — one v2 Pod can take exactly 10%
while ten v1 Pods share the other 90%. That precision is the entire reason
Rollouts integrates with a mesh.

Crucially, the two compose rather than compete: **Argo Rollouts can drive the
Istio VirtualService weights for you**, adding automated, metric-gated
promotion on top of the precise weighting Istio provides. Istio gives the
accurate knob; Rollouts (track 10) turns the knob automatically based on
analysis. This module turns the knob by hand so you understand what Rollouts
would be automating.

### Three mechanisms, one problem — when to use which

You now know three ways to do a weighted rollout. They are not
interchangeable; they live at different layers:

| Mechanism | Layer | How you set weight | Reach for it when |
|---|---|---|---|
| **ACA revisions** (track 06) | Managed platform | `az containerapp ingress traffic set` | You're on Azure Container Apps and want zero mesh to operate |
| **Argo Rollouts** (track 10) | K8s controller / GitOps | `setWeight` steps in a `Rollout`, auto-gated by analysis | You want *automated* metric-gated promotion/rollback, with or without a mesh |
| **Istio VirtualService** (this track) | Service mesh data plane | `weight` in a `VirtualService` | You already run a mesh and want precise weighting (and to combine it with mTLS/authz/routing) |

The honest guidance: if you already run a mesh, its weighting is the natural
choice and it's *precise*; if you want the rollout to promote itself based on
metrics, that's Argo Rollouts' job (which can drive the mesh); if you're on
ACA, the platform already does this and you don't operate a mesh at all. The
skill this module builds is recognising which world you're in.

### Metric-gating: what the mesh gives you for free

A canary is only useful if you *watch* the canary's health at each step.
Track 10's Argo Rollouts automated this with `AnalysisTemplate` queries. Even
by hand, Istio helps: because every request flows through the sidecars, you
get per-subset request rate, error rate, and latency **without instrumenting
the app** (module 06 is the full treatment). So the manual canary loop is:
bump weight → watch the v2 subset's error rate and latency in the mesh
metrics → promote or roll back. This is the same decision Rollouts' analysis
automates; doing it by hand here teaches you what "good" and "bad" look like.

## Command reference

| Field / command | What it does | Notes |
|---|---|---|
| `spec.http[].route[].weight` | Percentage to each destination in a canary step | Edit between steps to advance the canary |
| `kubectl apply -f <vs>.yaml` | Applies the next weight step | Takes effect in seconds; the rollout "step" |
| `kubectl patch virtualservice <n> --type=merge -p '...'` | Adjust weights without re-applying the whole file | Handy for quick step changes |
| `istioctl proxy-config routes <pod>` | Confirm the weights the proxy actually holds | Ground truth per step |
| `kubectl rollout undo` | *Not* how you roll back an Istio canary | Rollback is restoring previous VirtualService weights, not a Deployment undo |
| `watch -n1 'kubectl exec ... curl ...'` | Sample the live split during a step | Quick, crude health/ratio check |

## Hands-on exercises

Continue in `mesh-demo`. You should have `backend-v1` and `backend-v2`
Deployments, the `backend` Service, and the `backend` DestinationRule with
`v1`/`v2` subsets from module 02.

### 1. Start from a clean 100/0 (all on v1)

```yaml
# canary-step0.yaml
apiVersion: networking.istio.io/v1
kind: VirtualService
metadata:
  name: backend
  namespace: mesh-demo
spec:
  hosts: [backend]
  http:
    - route:
        - destination: {host: backend, subset: v1}
          weight: 100
        - destination: {host: backend, subset: v2}
          weight: 0
```

```bash
kubectl apply -f canary-step0.yaml
for i in $(seq 1 20); do kubectl exec -n mesh-demo deploy/frontend -- curl -s http://backend; echo; done | sort | uniq -c
```

Expected: 20 `backend v1`, 0 `v2` — the stable starting point of a canary.

### 2. Step the canary to 5%

```bash
kubectl patch virtualservice backend -n mesh-demo --type=merge -p \
  '{"spec":{"http":[{"route":[{"destination":{"host":"backend","subset":"v1"},"weight":95},{"destination":{"host":"backend","subset":"v2"},"weight":5}]}]}}'
for i in $(seq 1 40); do kubectl exec -n mesh-demo deploy/frontend -- curl -s http://backend; echo; done | sort | uniq -c
```

Expected: roughly 38 `v1` / 2 `v2` — about 5% on the canary. Note this is a
*precise 5%*, not "one pod out of twenty," even though both subsets have one
Pod. This is the difference from replica-ratio weighting.

### 3. Progress through the canary

Repeat the patch with weights `80/20`, then `50/50`, sampling 40 requests
after each and confirming the ratio tracks the weights. At each step you would,
in production, be watching the v2 subset's error rate/latency (module 06)
before advancing.

```bash
# 20%:
kubectl patch virtualservice backend -n mesh-demo --type=merge -p \
  '{"spec":{"http":[{"route":[{"destination":{"host":"backend","subset":"v1"},"weight":80},{"destination":{"host":"backend","subset":"v2"},"weight":20}]}]}}'
```

Expected: sampled ratios follow 80/20 then 50/50 as you step. This is the
manual version of the `setWeight` steps a `Rollout` walks automatically.

### 4. Complete the canary: 0/100

```bash
kubectl patch virtualservice backend -n mesh-demo --type=merge -p \
  '{"spec":{"http":[{"route":[{"destination":{"host":"backend","subset":"v1"},"weight":0},{"destination":{"host":"backend","subset":"v2"},"weight":100}]}]}}'
for i in $(seq 1 20); do kubectl exec -n mesh-demo deploy/frontend -- curl -s http://backend; echo; done | sort | uniq -c
```

Expected: 20 `v2`, 0 `v1` — v2 is now stable. The canary is complete; v1 can
be retired.

### 5. Instant rollback (the payoff)

Imagine v2 misbehaves after full promotion. Roll back with a single weight
restore — no redeploy, because v1 is still running:

```bash
kubectl apply -f canary-step0.yaml
for i in $(seq 1 20); do kubectl exec -n mesh-demo deploy/frontend -- curl -s http://backend; echo; done | sort | uniq -c
```

Expected: back to 100% `v1` in seconds. This is the same instant-rollback
property as ACA revisions (track 06 module 05) — the old version never left,
so rollback is a routing change, not a deployment.

### 6. Blue/green flip

Blue/green is the degenerate canary: no intermediate steps, just flip. With
`canary-step0.yaml` (blue=v1 at 100%) applied, flip green in one shot:

```bash
kubectl patch virtualservice backend -n mesh-demo --type=merge -p \
  '{"spec":{"http":[{"route":[{"destination":{"host":"backend","subset":"v1"},"weight":0},{"destination":{"host":"backend","subset":"v2"},"weight":100}]}]}}'
```

Expected: 100% cut to v2 instantly, with an instant flip back available. The
difference from canary is purely the *schedule* (one big step vs. many small
ones), not the mechanism.

### 7. Header-pinned "canary for me only"

A subtler pattern: keep 100% of *public* traffic on v1, but let *you* reach v2
by header — a canary you can dogfood before exposing anyone. Combine module
02's header match with the weighted default:

```yaml
# canary-dogfood.yaml
apiVersion: networking.istio.io/v1
kind: VirtualService
metadata:
  name: backend
  namespace: mesh-demo
spec:
  hosts: [backend]
  http:
    - match:
        - headers:
            x-canary: {exact: "true"}
      route:
        - destination: {host: backend, subset: v2}
    - route:
        - destination: {host: backend, subset: v1}
          weight: 100
        - destination: {host: backend, subset: v2}
          weight: 0
```

```bash
kubectl apply -f canary-dogfood.yaml
kubectl exec -n mesh-demo deploy/frontend -- curl -s http://backend
kubectl exec -n mesh-demo deploy/frontend -- curl -s -H "x-canary: true" http://backend
```

Expected: default request → `v1`; `x-canary: true` → `v2`. You can validate
v2 in production with zero public exposure — something replica-ratio canaries
can't do at all. (Remember module 02's lesson: the header match must come
*before* the weighted default.)

### 8. Diagnose and fix: weights that send everyone to the wrong version

A colleague "adjusted the canary to 10%" but everyone's on v2. Reproduce:

```yaml
# canary-broken.yaml
apiVersion: networking.istio.io/v1
kind: VirtualService
metadata:
  name: backend
  namespace: mesh-demo
spec:
  hosts: [backend]
  http:
    - route:
        - destination: {host: backend, subset: v1}
          weight: 10
        - destination: {host: backend, subset: v2}
          weight: 90
```

```bash
kubectl apply -f canary-broken.yaml
for i in $(seq 1 20); do kubectl exec -n mesh-demo deploy/frontend -- curl -s http://backend; echo; done | sort | uniq -c
```

Expected: ~18 `v2` / 2 `v1` — the weights are *inverted*. The intent was "10%
to the new v2," but the weights read "10% to v1, 90% to v2," so the canary is
actually a near-full rollout. This is the weighted-routing analogue of module
02's ordering typo — it applies cleanly and fails silently by routing the
wrong ratio. Diagnose by reading the actual weights:

```bash
kubectl get virtualservice backend -n mesh-demo -o yaml | grep -A2 weight
```

Expected: you see `subset: v1 weight: 10` and `subset: v2 weight: 90` — the
numbers are on the wrong subsets. Fix by restoring the correct 90/10 split:

```bash
kubectl patch virtualservice backend -n mesh-demo --type=merge -p \
  '{"spec":{"http":[{"route":[{"destination":{"host":"backend","subset":"v1"},"weight":90},{"destination":{"host":"backend","subset":"v2"},"weight":10}]}]}}'
for i in $(seq 1 20); do kubectl exec -n mesh-demo deploy/frontend -- curl -s http://backend; echo; done | sort | uniq -c
```

Expected: ~18 `v1` / 2 `v2` — a real 10% canary. Lesson: always confirm which
*subset* each weight is attached to, not just that the numbers sum to 100.

### 9. Reset for the next module

```bash
kubectl apply -f canary-step0.yaml
```

Expected: 100% v1. Leave the app and DestinationRule in place — module 04 adds
mTLS on top.

## Independent challenge

No step-by-step given — draw on this module,
[track 10 module 06](../../10-cicd-and-gitops/06-progressive-delivery-canary-and-blue-green/README.md),
and [track 06 module 05](../../06-azure-container-apps/05-revisions-traffic-splitting-and-dapr/README.md).

**Task:** Run a full five-step canary (`100/0 → 95/5 → 75/25 → 50/50 →
0/100`) of a `payments` service from v1 to v2, sampling the live split at each
step to confirm it tracks the weights, and practise a mid-canary abort:
partway through (say at 50/50), pretend v2's error rate spiked and roll all
the way back to `100/0` in one action, then explain why that rollback needed
no redeploy. Finally, write three sentences contrasting how you'd have done
this *same* rollout with Argo Rollouts (track 10) and with ACA revisions
(track 06), naming the one thing each mechanism does that the other two don't.

<details>
<summary>Stuck? One hint</summary>

The rollback is just re-applying the step-0 VirtualService (or a patch back to
`100/0`) — the whole point is that v1 never stopped running, so it's a routing
change, not a deploy. For the contrast: Argo Rollouts' distinguishing feature
is *automated metric-gated promotion/rollback*; ACA revisions' is *zero mesh
to operate on a managed platform*; Istio's is *precise weighting composable
with mTLS/authz on a mesh you already run*.

</details>

## Common mistakes & troubleshooting

- **Inverting the weights.** Attaching the small weight to the wrong subset
  turns a 10% canary into a 90% rollout (exercise 8). Always check which
  *subset* each weight sits on, not just that they sum to 100.
- **Thinking rollback needs a redeploy.** With both subsets running, rollback
  is restoring the previous VirtualService weights — seconds, no image pull.
  Reaching for `kubectl rollout undo` here is the wrong tool.
- **Canary weight without health-watching.** Stepping weights without watching
  the canary subset's error rate/latency (module 06) is just a slow blind
  rollout — the point of a canary is the *gate*, which by hand you supply.
- **Header canary rule ordered after the weighted default.** Same first-match
  hazard as module 02 — the header match must come before the catch-all or it
  never runs.
- **Confusing the three mechanisms' layers.** Istio weighting, Argo Rollouts,
  and ACA revisions solve the same problem at different layers; using Istio's
  weights doesn't give you Rollouts' *automated* gating, and vice versa —
  combine them if you want both.
- **Assuming precise weight means precise for tiny sample sizes.** `weight: 5`
  is 5% over many requests; a handful of `curl`s can look off just from
  randomness — sample enough to see the ratio.

## Checkpoint quiz

Write down your answer to each question before expanding it — checking without attempting first is the single easiest way to fool yourself into thinking you've learned this.

1. In Istio terms, what is the only difference between a canary and a
   blue/green rollout?
2. Why is rolling back an Istio canary instant and redeploy-free?
3. Track 10's Argo Rollouts used replica-based weighting by default. What does
   Istio weighting give you that replica ratios can't, and how do the two
   tools *combine* rather than compete?
4. You have three ways to do a weighted rollout (ACA revisions, Argo Rollouts,
   Istio). Give the one deciding factor that would send you to each.
5. What does a mesh give you "for free" that makes metric-gating a canary
   possible without touching the app?
6. In exercise 8, the weights summed to 100 and the YAML applied cleanly, yet
   the canary was wrong. What was the bug, and why didn't anything error?
7. What is the header-pinned "dogfood" canary pattern, and what can it do that
   a purely weighted canary cannot?

<details>
<summary>Show answers</summary>

1. The weight *schedule*: canary shifts weight gradually through intermediate
   steps with health checks between them; blue/green flips 100% in a single
   step. Same VirtualService mechanism, different step plan.
2. Both subsets stay fully deployed the whole time, so rollback is just
   restoring the previous `weight` values in the VirtualService — a routing
   change the sidecars apply in seconds, with no image pull or rescheduling.
3. Istio sets a real traffic percentage independent of pod count (one canary
   Pod can take exactly 5%), whereas replica ratios conflate pods with traffic
   and are coarse. They combine: Argo Rollouts can drive the Istio
   VirtualService weights, adding automated metric-gated promotion on top of
   Istio's precise knob.
4. ACA revisions: you're on Azure Container Apps and don't want to operate a
   mesh. Argo Rollouts: you want automated, metric-gated promotion/rollback.
   Istio: you already run a mesh and want precise weighting composable with
   mTLS/authz/routing.
5. Per-request golden-signal metrics (request rate, error rate, latency) for
   each subset, because every request passes through the sidecars — so you can
   judge the canary's health with no app instrumentation.
6. The weights were attached to the wrong subsets (10% to v1, 90% to v2
   instead of the reverse), so a "10% canary" was actually a 90% rollout. The
   API only validates schema, not intent — the object was structurally valid,
   so it applied silently, exactly like the ordering typo in module 02.
7. A VirtualService that routes requests with a chosen header (e.g.
   `x-canary: true`) to v2 while keeping 100% of default traffic on v1. It
   lets you validate the new version in production with zero public exposure —
   something a purely weighted canary, which always exposes *some* real users,
   cannot do.

</details>

## Cumulative review

Closed-book. Don't reopen earlier modules while attempting these — the point
is to find out what actually stuck, across this track *and* the tracks it
builds on.

1. A meshed Pod is `2/2` and appears in `istioctl proxy-status`, but a
   `VirtualService` routing 100% to `subset: v2` sends everyone to v1 anyway.
   Give the two most likely causes (one from module 01, one from module 02)
   and how you'd tell them apart.
2. Explain, using the data-plane/control-plane split from module 00, why
   editing a `VirtualService` weight takes effect in seconds and why traffic
   keeps flowing even if `istiod` is briefly down.
3. A `Service` selector typo (track 03 module 04), a NetworkPolicy label typo
   (track 03 module 11), a missing injection label (module 01), and an
   inverted canary weight (module 03) are all the "same class" of bug. State
   the class in one sentence and what all four share at the moment of failure.
4. You need "5% of traffic to v2." Describe how you'd achieve it with (a) a
   plain `Service` (track 03), (b) Argo Rollouts without a mesh (track 10),
   and (c) Istio — and rank the three by how truthfully each delivers exactly
   5%.
5. A DestinationRule defines subsets `v1`/`v2`, but a Pod meant to be `v2` is
   labelled `version: V2` (capital V). What breaks, what doesn't error, and
   which command surfaces it?
6. Blue/green in ACA revisions (track 06) and blue/green in Istio both give
   "instant rollback." Explain the shared reason rollback is instant in both,
   despite the completely different underlying platforms.
7. Why does a canary without watching per-subset metrics reduce to "a slow
   blind rollout," and which module gives you the metrics that make it a real
   canary — with no app code change?
8. You want *only your own* requests to hit the new version while 100% of
   public traffic stays on the old one. Which two module-02/03 primitives do
   you combine, in which order, and why does the order matter?
9. A teammate says "just use `kubectl rollout undo` to roll back the canary."
   Explain why that's the wrong tool for an Istio weighted canary and what the
   correct rollback actually is.
10. Map each of these to the right layer: `Service`, `VirtualService`,
    `DestinationRule`, NetworkPolicy, injection label. For each, one sentence
    on what stops working if it's misconfigured.

<details>
<summary>Show answers</summary>

1. (module 02) The VirtualService routes are mis-ordered or the subset doesn't
   match — e.g. a catch-all above the intended route, or the `v2` subset's
   label doesn't match the Pods; (module 01) the *client* Pod isn't actually
   meshed (`1/1`, absent from `proxy-status`) so its sidecar applies no
   routing. Tell them apart: confirm the *caller* is `2/2` and in
   `proxy-status` (rules out module 01), then `istioctl proxy-config routes`
   on the caller to see the actual programmed routes (finds the module-02
   issue).
2. You write the weight to the control plane (a CRD `istiod` watches); `istiod`
   computes and pushes new Envoy config to the sidecars (data plane) within
   seconds. Traffic is carried by the sidecars using their last pushed config,
   so if `istiod` is briefly down, existing traffic keeps flowing — only new
   config changes stall until it returns.
3. The class: a label/selector/weight mismatch that is schema-valid, so it
   applies with no error but silently does the wrong thing. All four share
   that at failure time nothing errors — the object was accepted — and the
   symptom is "traffic goes nowhere / the wrong place," found only by
   comparing the configured selector/weight against reality.
4. (a) You can't set 5% with a `Service` — it splits evenly across endpoints;
   the closest is a replica ratio, which is coarse. (b) Argo Rollouts without
   a mesh approximates 5% with pod counts — also coarse. (c) Istio sets
   `weight: 5` as a true 5% of requests. Truthfulness ranking: Istio (exact) >
   Rollouts/replica (approximate) ≈ Service/replica (approximate); the two
   replica-based ones can't be exactly 5% unless pod counts happen to allow
   it.
5. The `v2` subset selects `version: v2` but the Pod carries `version: V2`, so
   the Pod belongs to no subset and any route to `v2` has no endpoints — calls
   to `v2` fail, but nothing errors at apply time because labels are free-form
   strings. `istioctl analyze` (or checking `get pods --show-labels` against
   the subset) surfaces it; same selector-mismatch class as track 03.
6. In both, the old version stays fully deployed and running the whole time,
   so "rollback" is just redirecting 100% of traffic back to it — a routing
   change (weights in Istio, `ingress traffic set` in ACA), not a redeploy or
   image pull — which is why it's near-instant on both platforms.
7. Because the whole value of a canary is the *decision gate* at each step;
   without watching the canary's error rate/latency you just advance on a
   timer, exposing more users to a possibly-bad version blindly. Module 06
   (mesh observability) supplies per-subset golden-signal metrics with no app
   change, because every request crosses the sidecars.
8. A header `match` route to the new subset placed *before* a weighted default
   route (100% old). Order matters because VirtualService routes are
   first-match-wins — if the weighted default came first it would catch every
   request and the header rule would never run.
9. `kubectl rollout undo` reverts a *Deployment's* pod template to a previous
   revision; an Istio canary doesn't change the Deployment at all — both
   versions stay deployed and only the VirtualService weights change. Correct
   rollback: restore the previous VirtualService weights (e.g. back to
   `100/0`).
10. `Service` — discovery/endpoints; misconfig (selector typo) → no endpoints,
    routes nowhere. `VirtualService` — per-request routing; misconfig
    (ordering/weights) → traffic to the wrong version. `DestinationRule` —
    subset/policy definitions; misconfig (bad labels/missing subset) → routes
    have no valid target. NetworkPolicy — L3/4 allow/deny; misconfig → legit
    traffic blocked or everything open. Injection label — mesh membership;
    missing → Pod runs unmeshed and all mesh config silently ignores it.

</details>

## Next

[04-mtls-and-zero-trust](../04-mtls-and-zero-trust/README.md) — everything
you've routed so far has *already* been encrypted with mTLS by default; now
make that explicit, enforce it STRICTly, and see how it layers with the
NetworkPolicy you know from track 03.
