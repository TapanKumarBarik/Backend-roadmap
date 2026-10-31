# 00 - Service Mesh Concepts

## Why this matters

By the end of track 03 you could route traffic with Services and Ingress,
restrict it with NetworkPolicy, and secure the API server with RBAC — all
real, all sufficient for a lot of systems. A **service mesh** exists because
those tools stop scaling well once you have dozens of services that all need
encryption, retries, fine-grained routing, and a live picture of who calls
whom. This module builds the mental model — the sidecar pattern, the data
plane / control plane split, and the honest question of when a mesh is
worth its weight — before you install anything in module 01.

## Concepts

### The problem: cross-cutting concerns duplicated in every service

Think about what every service in a real system needs: TLS to its
neighbours, retries on transient failures, timeouts so one slow dependency
doesn't hang the caller, metrics on every call, and a way to say "only the
checkout service may call the payments service." In track 03 you solved
pieces of this per-object: a `Service` for discovery, a `NetworkPolicy` for
coarse allow/deny, hand-configured TLS if you bothered. The trouble is these
are **cross-cutting concerns** — every service needs them, so without a mesh
every *team* re-implements them in application code, in a different library,
in a different language, slightly wrong each time. A mesh's core idea is to
lift all of that *out* of the application and into infrastructure.

### The sidecar proxy pattern

A service mesh does this by putting a **proxy container** (Istio uses Envoy)
into every application Pod, alongside your app container — a **sidecar**.
This is the exact same Pod-with-two-containers shape you first saw as an
"init/sidecar" idea in track 03, and it's the same shape ACA's Dapr sidecar
took in track 06's revisions module — one process for your code, one
alongside it for the platform's concerns. All traffic in and out of the app
container is transparently redirected through its sidecar proxy (via iptables
rules the mesh installs), so:

- your app makes a plain `http://payments` call, unaware anything changed;
- its sidecar intercepts the outbound call, encrypts it (mTLS), applies
  retry/timeout/routing rules, and records metrics;
- the payments Pod's sidecar receives it, decrypts it, checks authorization,
  records metrics, and hands plaintext to the payments app container.

Your application code is untouched. That transparency is the whole selling
point — and also the whole cost, because now there are twice as many
containers to run and one more network hop each way.

### Data plane vs. control plane

The set of all those sidecar proxies — the things actually carrying and
acting on your traffic — is the **data plane**. But the proxies don't decide
policy on their own; something has to tell every proxy "route 10% to v2,"
"require mTLS here," "allow checkout→payments." That something is the
**control plane** (in Istio, a component called `istiod`). You write
Kubernetes objects (CRDs like `VirtualService`, `PeerAuthentication`); the
control plane watches them, computes the right configuration for each proxy,
and pushes it out. This is the same **declared-desired-state / a-controller-
reconciles-it** loop behind every controller you've met since track 03 — a
Deployment controller reconciles ReplicaSets, `istiod` reconciles Envoy
configs. The data plane is on the request path; the control plane is not, so
if `istiod` is briefly down, existing traffic keeps flowing on the last
config it pushed.

### What a mesh solves that plain Kubernetes doesn't

Line the mesh up against the track 03 tools you already know:

- **Encryption in transit.** NetworkPolicy controls *whether* Pod A may
  reach Pod B, but the traffic itself is plaintext on the wire. A mesh gives
  you **mTLS everywhere** automatically (module 04) — every call encrypted
  *and* both ends cryptographically identified, with certificates issued and
  rotated for you.
- **Traffic routing by request content.** A `Service` load-balances across
  all matching Pods equally by label selector — it cannot send 5% of traffic
  to a canary, or route requests with header `x-user: beta` to v2. A mesh's
  `VirtualService` can (modules 02-03).
- **Identity-based authorization.** RBAC governs who can call the *Kubernetes
  API*; it says nothing about which service may call which *at runtime*. A
  mesh's `AuthorizationPolicy` does that, keyed on the cryptographic identity
  mTLS establishes (module 05).
- **Uniform L7 observability.** In track 12 you instrumented apps for metrics
  and traces. A mesh gives you golden-signal metrics (request rate, error
  rate, latency) and a service dependency graph for *every* call with zero
  app changes, because the proxy sees every request (module 06).
- **Resilience without code.** Retries, timeouts, and circuit breaking become
  configuration instead of client-library code (module 07).

### Where a mesh is overkill

A mesh is not free and not always worth it. The honest counsel:

- **A handful of services** get most of these benefits more cheaply from
  Ingress + NetworkPolicy + a decent HTTP client library; the mesh's fixed
  cost (a proxy per Pod, a control plane, a steeper operational learning
  curve, extra latency and CPU) dominates when you have three services, not
  thirty.
- **Latency-critical paths** pay for the extra hop through two proxies on
  every call — usually small, but real.
- **Small teams** take on a genuinely complex new system to operate; an
  outage in the mesh is an outage in everything.

The rule of thumb: reach for a mesh when the *number of services* and the
*need for uniform mTLS/authz/observability across all of them* is what hurts —
not as a default first move. This is exactly why the curriculum put tracks
03 and 12 first: you should feel the pain the mesh removes before adopting it.

### Istio vs. Linkerd (one paragraph, deliberately)

**Istio** is the most feature-complete mesh (rich traffic management, Envoy-
based, huge surface area) and is what this track teaches in depth.
**Linkerd** is the notable lighter-weight alternative: a purpose-built Rust
"micro-proxy" instead of Envoy, dramatically simpler to operate and lower
overhead, at the cost of fewer knobs (less elaborate traffic-routing and
extensibility than Istio). The tradeoff in one line: **Istio buys you power
and pays in complexity; Linkerd buys you simplicity and pays in flexibility.**
Everything you learn here about the *concepts* — sidecars, data/control
plane, mTLS, traffic splitting, authz — applies to Linkerd too; only the CRDs
and tooling differ. We go deep on Istio because the mechanics it exposes make
the concepts concrete.

## Command reference

This module is conceptual — you install nothing yet. These are the terms and
the objects you'll meet, so the vocabulary is set before module 01.

| Term / object | What it is | Where it shows up |
|---|---|---|
| Sidecar proxy | Envoy container injected into each Pod; carries all its traffic | Every meshed Pod (module 01) |
| Data plane | The set of all sidecar proxies actually moving traffic | Modules 02-07 |
| Control plane (`istiod`) | Watches CRDs, computes and pushes proxy config | Installed in module 01 |
| `istioctl` | Istio's CLI: install, inject, diagnose | Module 01 onward |
| `VirtualService` | Rules for *how* to route requests to a service | Modules 02-03 |
| `DestinationRule` | Defines subsets (versions) and per-destination policy | Modules 02-03, 07 |
| `PeerAuthentication` | Requires/relaxes mTLS between proxies | Module 04 |
| `AuthorizationPolicy` | Allow/deny rules on service-to-service calls | Module 05 |
| mTLS | Mutual TLS: both ends encrypt *and* prove identity | Module 04 |

## Hands-on exercises

No cluster changes yet — these exercises make the concepts concrete by
inspecting what you already have and reasoning about the gaps. Work in a
notebook; several answers are things you'll verify hands-on in later modules.

### 1. Inventory what track 03 already gives you

On any existing kind cluster (or on paper), list, for a two-service
`frontend`→`backend` app, exactly which track-03 object provides each of:
service discovery, load balancing, coarse allow/deny between Pods, and
external exposure.

Expected: `Service` (discovery + L4 load balancing), `NetworkPolicy` (coarse
allow/deny), `Ingress` (external exposure). Note that *encryption*,
*percentage routing*, and *service-to-service authz* are on nobody's list —
those are the mesh's gaps to fill.

### 2. Find the gaps a Service can't cover

For that same app, write down what you would have to do *today*, without a
mesh, to (a) encrypt frontend→backend traffic, and (b) send 5% of frontend
traffic to a second version of backend.

Expected: (a) terminate TLS in each app or run your own sidecar/cert
tooling — non-trivial and per-app; (b) approximate it with replica ratios
(coarse, as track 10 module 04 warned) because a `Service` splits evenly by
label. Both are exactly what modules 02-04 make one-liners.

### 3. Draw the request path, twice

Sketch a single `frontend`→`backend` HTTP request as it flows **today** (app
→ Service/kube-proxy → app), then sketch it again **with a mesh** (app →
its sidecar → network → backend's sidecar → backend app). Count the hops and
mark where encryption, retries, and metrics get applied in the meshed version.

Expected: the meshed path has two extra proxy hops; encryption/retries/metrics
all live in the sidecars, not the app — this is the transparency *and* the
overhead in one picture.

### 4. Separate the planes

Given the statement "we deploy a new routing rule and 30 seconds later
traffic shifts," identify which plane the rule is *written to* and which
plane *acts on* traffic, and answer: if the control plane crashed the moment
after the rule was accepted, would already-flowing traffic stop?

Expected: you write to the control plane (a CRD `istiod` reads); the data
plane (sidecars) acts on traffic. Existing traffic keeps flowing on the last
pushed config even if `istiod` is down — only *new* config changes stall.

### 5. Map each mesh feature to the track-03 tool it surpasses

Make a two-column table: left, the mesh feature (mTLS, weighted routing,
service authz, L7 metrics); right, the closest track-03/12 tool and the one
thing it *can't* do that the mesh can.

Expected: mTLS vs. NetworkPolicy (policy allows/denies but doesn't encrypt);
weighted routing vs. Service (even split only); service authz vs. RBAC (RBAC
is API-server access, not runtime call authz); L7 metrics vs. app
instrumentation (mesh needs no app changes).

### 6. Decide: mesh or not?

For each system, decide "mesh" or "not yet," and justify in one sentence:
(a) three services behind one Ingress, one team; (b) forty microservices,
six teams, a compliance requirement that all internal traffic be encrypted;
(c) two latency-critical trading services where every millisecond counts.

Expected: (a) not yet — Ingress + NetworkPolicy + a good HTTP client is
cheaper than a mesh; (b) mesh — uniform mTLS + authz + observability across
forty services is exactly the pain a mesh removes; (c) probably not, or
Linkerd if anything — the per-hop latency tax is hardest to justify where
milliseconds are the product.

### 7. Istio or Linkerd?

For system (b) above, argue in three sentences which mesh you'd pick and why,
naming one concrete factor that would flip your choice.

Expected: a defensible answer either way — Istio for rich traffic-routing and
extensibility if you'll use those knobs; Linkerd for lower overhead and
operational simplicity if you mostly want mTLS + basic splitting. A flipping
factor: needing header-based routing / elaborate `VirtualService` rules
pushes toward Istio; a tiny platform team pushes toward Linkerd.

## Independent challenge

No commands here — this is a reasoning task drawing on
[track 03 Services](../../03-kubernetes/04-services-and-networking/README.md),
[track 03 NetworkPolicy/RBAC](../../03-kubernetes/11-security-rbac-and-network-policies/README.md),
and the canary discussions in
[track 10 module 06](../../10-cicd-and-gitops/06-progressive-delivery-canary-and-blue-green/README.md)
and [track 06 module 05](../../06-azure-container-apps/05-revisions-traffic-splitting-and-dapr/README.md).

**Task:** Write a one-page "should we adopt a service mesh?" recommendation
for a hypothetical platform team running twelve services on AKS. Cover: which
specific problems they have today that a mesh solves (be concrete — name the
track-03 tool that currently half-solves each), what new operational cost and
failure modes they take on, whether their canary needs are already met by the
mechanisms they know (Argo Rollouts from track 10, ACA revisions from track
06) or genuinely need mesh-based weighting, and a final go/no-go with the one
condition that would change your answer. No YAML — this is the judgment call
the rest of the track assumes you can make.

<details>
<summary>Stuck? One hint</summary>

Structure it as a table of "concern → what half-solves it today → what the
mesh adds → is the delta worth it here." The honest recommendation for
*twelve* services often hinges on the encryption/compliance requirement and
the team size, not on the traffic-routing features — decide which of those is
load-bearing for your imaginary team and let it drive the go/no-go.

</details>

## Common mistakes & troubleshooting

- **Treating the mesh as a router replacement.** It doesn't replace Services,
  Ingress, or DNS — it layers on top of them. Your `Service` objects still
  exist and still do discovery; the mesh adds routing *rules* over that.
- **Thinking NetworkPolicy and mTLS are the same layer.** NetworkPolicy is L3/4
  allow/deny (can Pod A reach Pod B at all); mTLS is encryption + identity on
  the traffic that's allowed. They compose — you'll use both (module 04).
- **Assuming a mesh is a security feature you can bolt on for free.** It's a
  distributed system you now operate. The proxies, the control plane, and the
  certificate machinery are all things that can break and page you.
- **Believing "sidecarless" or "ambient" modes make the concepts moot.** Newer
  Istio "ambient" mode moves some functions out of per-Pod sidecars, but the
  data-plane/control-plane split, mTLS identity, and routing concepts are
  identical — learn them with sidecars first; they transfer.
- **Adopting a mesh to get *one* feature.** If all you need is percentage
  canaries, Argo Rollouts (track 10) does that without a mesh. Adopt the mesh
  when *several* of its features are needed uniformly across many services.

## Checkpoint quiz

Write down your answer to each question before expanding it — checking without attempting first is the single easiest way to fool yourself into thinking you've learned this.

1. In one sentence, what does the sidecar proxy pattern let a mesh do that
   editing the application couldn't do as cleanly?
2. Which plane is on the request path — data or control — and what does that
   mean if the control plane briefly goes down?
3. NetworkPolicy already controls Pod-to-Pod traffic. Name two things a mesh
   adds that a NetworkPolicy fundamentally can't.
4. Why can't a plain `Service` send 5% of traffic to a canary version?
5. Give two concrete situations where adopting a mesh would be overkill.
6. State the Istio-vs-Linkerd tradeoff in one sentence each.
7. Which mesh feature relates to Kubernetes RBAC, and why is it a *different
   layer* rather than a replacement?

<details>
<summary>Show answers</summary>

1. It moves cross-cutting concerns (mTLS, retries, routing, metrics) into an
   injected proxy that intercepts all traffic transparently, so every service
   in every language gets them uniformly without any application code change.
2. The **data plane** (the sidecars) is on the request path; the control
   plane is not. If the control plane goes down briefly, existing traffic
   keeps flowing on the last configuration already pushed to the proxies —
   only new config changes stall until it's back.
3. Encryption in transit (mTLS) and cryptographic identity of each end; also
   request-level (L7) routing and authorization. NetworkPolicy is L3/4
   allow/deny only — it never encrypts or identifies, and can't route by
   header/weight.
4. A `Service` load-balances evenly across *all* Pods matching its label
   selector; "5%" is a traffic weight, not a pod ratio, and the Service has
   no concept of weighting — you need a mesh (or an ingress/mesh traffic
   provider) to set a real percentage independent of pod count.
5. E.g. a three-service app behind one Ingress with one team (fixed mesh cost
   dominates), and a latency-critical path where the extra proxy hop each way
   is unacceptable. (Also: a small team that can't absorb operating another
   distributed system.)
6. Istio: maximum features/flexibility, higher complexity and overhead.
   Linkerd: much simpler to operate with lower overhead, fewer traffic-
   management and extensibility knobs.
7. `AuthorizationPolicy`. RBAC governs access to the *Kubernetes API server*
   (who can `kubectl get pods`); `AuthorizationPolicy` governs *runtime
   service-to-service calls* (may checkout call payments). Different layer,
   same least-privilege principle.

</details>

## Next

[01-installing-istio-and-sidecar-injection](../01-installing-istio-and-sidecar-injection/README.md) —
put the concepts on a real cluster: install Istio, label a namespace for
injection, and prove the sidecars actually attached.
