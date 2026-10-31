# 02 - Traffic Management Basics

## Why this matters

A Kubernetes `Service` can only do one thing with traffic: spread it evenly
across every matching Pod. The moment you want "send beta users to v2,"
"route mobile clients differently," or "5% to the canary," the `Service`
selector runs out of expressiveness — this is the gap module 00 promised the
mesh would fill. This module introduces the two objects that do all of Istio's
routing, `VirtualService` and `DestinationRule`, and the subset concept that
ties routing to specific versions. Every later module (canary, mTLS scoping,
resilience) builds on these two CRDs.

## Concepts

### The `Service` still exists — the mesh routes *within* it

Nothing you learned in track 03 goes away. Your `Service` (say `backend`)
still provides the stable name and the set of endpoints. What changes is that
a meshed request to `backend` is intercepted by the caller's sidecar, and the
sidecar consults Istio's routing rules to decide *which* of those endpoints
(and with what policy) to send to. So the mental model is: **`Service` =
"here are all the Pods called backend"; `VirtualService` = "here's how to
choose among them per request."** The `Service` does discovery; the mesh does
routing.

### `DestinationRule`: naming subsets (versions)

Before you can route "to v2," Istio needs a name for "v2." A
**`DestinationRule`** defines **subsets** of a Service's Pods, each subset a
label match:

```yaml
subsets:
  - name: v1
    labels: {version: v1}
  - name: v2
    labels: {version: v2}
```

This requires your Pods to carry a `version` label (a convention, not
magic) — the same label-selector idea as everywhere in track 03, now used to
carve one Service's Pods into named groups. The `DestinationRule` is also
where per-destination *policy* lives (load-balancing algorithm, connection
pool limits, outlier detection — module 07, and mTLS mode — module 04); for
now we use it only to declare subsets. **A subset name is inert until a
`VirtualService` routes to it** — same "definition object does nothing until
something references it" pattern as a Role without a binding (track 11).

### `VirtualService`: the routing rules

A **`VirtualService`** attaches to a host (usually a `Service` name) and lists
**routes** evaluated top-to-bottom. Each route has optional **match**
conditions (on headers, URI, method, etc.) and a **destination** (a Service +
subset, optionally with a **weight**). The first matching rule wins, so
**order matters** and you almost always end a `VirtualService` with a
catch-all default route. Two headline capabilities:

- **Match-based routing:** "if header `x-user: beta`, go to subset `v2`;
  otherwise `v1`." The `Service` selector could never express a per-request
  condition like this.
- **Weighted routing:** "90% to `v1`, 10% to `v2`" — real traffic percentages
  independent of pod count, which is the precise knob track 10 module 06 said
  needed a mesh (module 03 uses it for canaries).

### Match order and the catch-all

Because routes are first-match-wins, a broad rule placed above a specific one
shadows it. The classic bug — which you'll fix by hand in the exercises — is a
default/weighted rule sitting *above* a header-match rule, so 100% of traffic
takes the default and the header rule never runs. The discipline: **specific
matches first, catch-all last.** This is the same ordering hazard as firewall
rules or NGINX `location` blocks — most-specific-first, default-last.

### The `Gateway`: routing traffic entering the mesh

`VirtualService` routes traffic *inside* the mesh. To route traffic *entering*
from outside, you bind a `VirtualService` to a **`Gateway`** — the config
object for the ingress gateway Envoy from module 01. A `Gateway` declares
which ports/hosts the edge proxy accepts; the `VirtualService` then says where
that traffic goes. This is the mesh's replacement for a track-03 `Ingress`
object: `Gateway` ≈ the listener, `VirtualService` ≈ the routing rules, and
unlike `Ingress` it reuses the exact same routing primitives you use
internally.

## Command reference

| Field / command | What it does | Notes |
|---|---|---|
| `kind: VirtualService` | Defines routing rules for a host | The "how to route" object |
| `spec.hosts` | Which service name(s) these rules apply to | Usually the short Service name for in-mesh |
| `spec.http[].match` | Conditions (headers, uri, method) for a route | Omit for an unconditional route |
| `spec.http[].match[].headers` | Match on request headers | `headers: {x-user: {exact: beta}}` |
| `spec.http[].route[].destination.host` | Target Service | `host: backend` |
| `spec.http[].route[].destination.subset` | Target subset (from a DestinationRule) | Must exist in a DestinationRule |
| `spec.http[].route[].weight` | Percentage of traffic to this destination | Weights in one route array must sum to 100 |
| `kind: DestinationRule` | Declares subsets and per-destination policy | Subsets are label matches |
| `spec.subsets[].labels` | Labels selecting the Pods in this subset | Pods must actually carry these labels |
| `kind: Gateway` | Configures the ingress-gateway Envoy's listeners | Bound to by a VirtualService for edge traffic |
| `istioctl analyze -n <ns>` | Flags routing that references a missing subset/host | Catches typos before they bite |
| `istioctl proxy-config routes <pod>` | Dumps the actual routes programmed into a proxy | Ground truth of what a sidecar will do |
| `kubectl get virtualservice,destinationrule -n <ns>` | Lists the routing objects | `vs`/`dr` are the short names |

## Hands-on exercises

Continue in `mesh-demo` from module 01, with injection enabled. These
exercises build a two-version backend and steer traffic between the versions.

### 1. Deploy two versions of the backend, both labelled

```yaml
# backend-v1-v2.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: backend-v1
  namespace: mesh-demo
spec:
  replicas: 1
  selector: {matchLabels: {app: backend, version: v1}}
  template:
    metadata: {labels: {app: backend, version: v1}}
    spec:
      containers:
        - name: app
          image: hashicorp/http-echo:1.0
          args: ["-text=backend v1", "-listen=:5678"]
          ports: [{containerPort: 5678}]
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: backend-v2
  namespace: mesh-demo
spec:
  replicas: 1
  selector: {matchLabels: {app: backend, version: v2}}
  template:
    metadata: {labels: {app: backend, version: v2}}
    spec:
      containers:
        - name: app
          image: hashicorp/http-echo:1.0
          args: ["-text=backend v2", "-listen=:5678"]
          ports: [{containerPort: 5678}]
```

If you still have the single `backend` Deployment from module 01, delete it
so only these two version-labelled Deployments back the `backend` Service:

```bash
kubectl delete deployment backend -n mesh-demo --ignore-not-found
kubectl apply -f backend-v1-v2.yaml
kubectl get pods -n mesh-demo --show-labels
```

Expected: two backend Pods, `2/2`, one labelled `version=v1` and one
`version=v2`. The existing `backend` Service (selector `app: backend`) now
has *both* as endpoints — so calls currently hit either at random.

### 2. See the un-routed default: random split

```bash
for i in $(seq 1 10); do kubectl exec -n mesh-demo deploy/frontend -- curl -s http://backend; echo; done
```

Expected: a roughly random mix of `backend v1` and `backend v2` — the plain
`Service` behaviour, evenly across all endpoints, with no way to control the
ratio. This is the baseline the mesh improves on.

### 3. Declare subsets with a DestinationRule

```yaml
# dr-backend.yaml
apiVersion: networking.istio.io/v1
kind: DestinationRule
metadata:
  name: backend
  namespace: mesh-demo
spec:
  host: backend
  subsets:
    - name: v1
      labels: {version: v1}
    - name: v2
      labels: {version: v2}
```

```bash
kubectl apply -f dr-backend.yaml
istioctl analyze -n mesh-demo
```

Expected: `analyze` may warn that the subsets aren't referenced by any
VirtualService yet — that's the "inert until referenced" point from Concepts,
not an error.

### 4. Pin all traffic to v1 with a VirtualService

```yaml
# vs-backend-v1.yaml
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
```

```bash
kubectl apply -f vs-backend-v1.yaml
for i in $(seq 1 10); do kubectl exec -n mesh-demo deploy/frontend -- curl -s http://backend; echo; done
```

Expected: **all ten** responses are `backend v1` — the VirtualService now
pins every request to the v1 subset regardless of the even endpoint set. You
just did something a `Service` cannot.

### 5. Route by header

Send beta users to v2 while everyone else stays on v1:

```yaml
# vs-backend-header.yaml
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
            x-user:
              exact: beta
      route:
        - destination: {host: backend, subset: v2}
    - route:
        - destination: {host: backend, subset: v1}
```

```bash
kubectl apply -f vs-backend-header.yaml
kubectl exec -n mesh-demo deploy/frontend -- curl -s http://backend
kubectl exec -n mesh-demo deploy/frontend -- curl -s -H "x-user: beta" http://backend
```

Expected: the first (no header) returns `backend v1`; the second (with
`x-user: beta`) returns `backend v2`. Per-request routing on request content —
the capability module 00 said a `Service` fundamentally lacks.

### 6. Weighted routing (a preview of canary)

```yaml
# vs-backend-weighted.yaml
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
          weight: 80
        - destination: {host: backend, subset: v2}
          weight: 20
```

```bash
kubectl apply -f vs-backend-weighted.yaml
for i in $(seq 1 20); do kubectl exec -n mesh-demo deploy/frontend -- curl -s http://backend; echo; done | sort | uniq -c
```

Expected: roughly 16 `v1` and 4 `v2` (80/20) — a *real* traffic weight, not a
pod ratio (both subsets have one Pod each). Module 03 turns this into a
disciplined canary.

### 7. Inspect what the proxy actually got

```bash
istioctl proxy-config routes deploy/frontend -n mesh-demo | head -20
```

Expected: the routes programmed into `frontend`'s Envoy reflect your
VirtualService (the weighted/subset destinations for `backend`). This is
ground truth — what the sidecar will really do, distinct from the YAML you
wrote.

### 8. Diagnose and fix: a typo sending 100% traffic the wrong way

This reproduces the classic ordering bug from Concepts. Apply a
VirtualService whose catch-all is *above* the header match, plus a subset
typo:

```yaml
# vs-backend-broken.yaml
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
    - match:
        - headers:
            x-user:
              exact: beta
      route:
        - destination: {host: backend, subset: v2}
```

```bash
kubectl apply -f vs-backend-broken.yaml
kubectl exec -n mesh-demo deploy/frontend -- curl -s -H "x-user: beta" http://backend
```

Expected: `backend v1` **even with the beta header** — 100% of traffic,
including the traffic that was supposed to reach v2, takes the first
(unconditional) route because first-match-wins and the catch-all was placed
first. The header rule below it is dead code. Diagnose:

```bash
istioctl proxy-config routes deploy/frontend -n mesh-demo
istioctl analyze -n mesh-demo
```

Expected: the routes show the unconditional route ordered before the match
route. Fix by moving the specific match *above* the catch-all (re-apply the
correct `vs-backend-header.yaml` from exercise 5):

```bash
kubectl apply -f vs-backend-header.yaml
kubectl exec -n mesh-demo deploy/frontend -- curl -s -H "x-user: beta" http://backend
```

Expected: `backend v2` again. Lesson: **specific matches first, catch-all
last** — the single most common VirtualService bug, and it fails by silently
routing everything the wrong way rather than erroring.

### 9. Diagnose and fix: routing to a subset that doesn't exist

```yaml
# vs-backend-badsubset.yaml
apiVersion: networking.istio.io/v1
kind: VirtualService
metadata:
  name: backend
  namespace: mesh-demo
spec:
  hosts: [backend]
  http:
    - route:
        - destination: {host: backend, subset: v3}
```

```bash
kubectl apply -f vs-backend-badsubset.yaml
kubectl exec -n mesh-demo deploy/frontend -- curl -s -m 5 http://backend
istioctl analyze -n mesh-demo
```

Expected: the call fails (no healthy upstream), and `analyze` reports that
subset `v3` is referenced but not defined in any DestinationRule. Fix by
routing to a real subset or adding `v3` to the DestinationRule; for now,
restore the good header VirtualService:

```bash
kubectl apply -f vs-backend-header.yaml
kubectl exec -n mesh-demo deploy/frontend -- curl -s http://backend
```

Expected: `backend v1`. Leave the header VirtualService and DestinationRule
in place for module 03.

## Independent challenge

No YAML given — draw on this module and
[track 03 Services](../../03-kubernetes/04-services-and-networking/README.md).

**Task:** Stand up a `catalog` Service with two versions (`stable` and
`experimental`, labelled accordingly) and write routing that satisfies three
rules simultaneously: (1) any request carrying header `x-tester: true` always
goes to `experimental`; (2) all other traffic is split 95% `stable` / 5%
`experimental`; (3) requests with URI prefix `/admin` always go to `stable`
regardless of any header. Prove each rule with `curl` from a meshed client,
then explain — referencing the first-match-wins ordering — why you had to
place the three routes in the order you did, and what breaks if `/admin` and
the `x-tester` rules are swapped.

<details>
<summary>Stuck? One hint</summary>

You need a DestinationRule with `stable`/`experimental` subsets and one
VirtualService with three `http` entries. Ordering is the whole puzzle: the
two unconditional-override rules (`/admin` and `x-tester`) must come before
the weighted catch-all, and between those two, place the one that must win
when *both* conditions are true first — decide which of "admin path" and
"tester header" should dominate and let first-match-wins encode it.

</details>

## Common mistakes & troubleshooting

- **Catch-all route placed first.** First-match-wins means an unconditional
  route above a match route shadows it, silently sending 100% of traffic the
  wrong way (exercise 8). Specific matches first, default last.
- **Routing to a subset with no matching DestinationRule.** The subset name is
  just a string; if no DestinationRule defines it, the route has no
  destination and calls fail. `istioctl analyze` catches this.
- **Pods missing the `version` label.** Subsets select on labels; a Pod
  without the label belongs to no subset and gets no traffic from subset
  routes — the same selector-mismatch failure as a Service with a typo'd
  selector (track 03 module 04).
- **Weights that don't sum to 100.** Istio treats the weights as proportions,
  but writing them to sum to 100 keeps the intent readable and avoids
  surprises when you edit one.
- **Confusing `VirtualService` (how to route) with `DestinationRule` (what the
  subsets/policies are).** They're a pair: the DestinationRule names the
  targets, the VirtualService chooses among them. Forgetting one leaves the
  other inert.
- **Expecting a VirtualService to route external traffic without a Gateway.**
  In-mesh routing works with just the Service host; edge traffic needs a
  `Gateway` bound in the VirtualService's `gateways` list.

## Checkpoint quiz

Write down your answer to each question before expanding it — checking without attempting first is the single easiest way to fool yourself into thinking you've learned this.

1. What does a `VirtualService` do that a plain `Service` cannot?
2. What is a subset, which object defines it, and what must the Pods have for
   a subset to match them?
3. Routes in a `VirtualService` are evaluated in what order, and what's the
   most common bug that causes?
4. You route to `subset: v2` but no DestinationRule defines `v2`. What
   happens, and how do you catch it before it hits users?
5. How is weighted routing here fundamentally different from faking a canary
   with replica counts (track 10 module 06)?
6. What's the division of labour between `VirtualService` and
   `DestinationRule`?
7. What object routes traffic *entering* the mesh from outside, and what
   track-03 object does it replace?

<details>
<summary>Show answers</summary>

1. Route per-request based on content (headers, URI, method) and split traffic
   by real weight (percentages) — neither of which a `Service`, which only
   spreads evenly across matching endpoints, can express.
2. A subset is a named group of a Service's Pods, defined in a
   `DestinationRule` by a label match; the Pods must carry the labels the
   subset selects on (e.g. `version: v2`).
3. Top-to-bottom, first-match-wins. The most common bug is putting an
   unconditional/catch-all route above a specific match, so the specific rule
   never runs and 100% of traffic takes the default.
4. The route has no valid destination and calls fail (no healthy upstream).
   `istioctl analyze` flags the referenced-but-undefined subset before it
   affects users.
5. Weighted routing sets a real traffic percentage independent of pod count
   (both subsets can have one Pod and still get 80/20), whereas replica-ratio
   canaries conflate pod count with traffic share and are coarse.
6. `DestinationRule` names the subsets and holds per-destination policy;
   `VirtualService` chooses among those destinations per request. They're a
   pair — one is inert without the other.
7. A `Gateway` (configuring the ingress-gateway Envoy), bound to by a
   `VirtualService`. It replaces the track-03 `Ingress` object, but reuses the
   same routing primitives used inside the mesh.

</details>

## Next

[03-canary-and-blue-green-traffic-splitting](../03-canary-and-blue-green-traffic-splitting/README.md) —
turn weighted routing into a disciplined canary and blue/green process, and
compare it head-to-head with Argo Rollouts and ACA revisions.
