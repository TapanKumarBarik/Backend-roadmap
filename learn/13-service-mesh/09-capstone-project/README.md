# 09 - Capstone Project

## Why this matters

The previous nine modules each drilled one mesh capability in isolation. Real
mesh work is making them hold *together*: a namespace where injection is on,
every service is meshed under STRICT mTLS, one service is mid-canary between
two versions, an `AuthorizationPolicy` enforces who may call whom, and a
resilience policy you can *prove* works under injected failure. This capstone
asks you to stand all of that up at once, with no full solution given — the
integration is the test. If you can build and verify this, you can operate a
service mesh, not just recite its objects.

## The project

Build a meshed multi-service application on your local `kind` cluster and prove
every mesh property end to end. Design the app yourself (three small services
is plenty — e.g. an edge `storefront` calling an `orders` service, which calls
a `catalog` service). Use throwaway images you already know from this track
(`hashicorp/http-echo`, `curlimages/curl`) — the point is the mesh, not the
app code.

### Acceptance checklist

Your project is complete when all of the following are true and you can
*demonstrate* each with a command, not just assert it:

- [ ] **Istio installed and a namespace meshed.** A dedicated namespace
  (e.g. `shop`) is labelled for sidecar injection, and every application Pod
  in it comes up `2/2` and appears in `istioctl proxy-status` as `SYNCED`.
- [ ] **Multi-service app, all meshed.** At least three services, each with its
  own ServiceAccount (so they have distinct mTLS identities), deployed and
  serving traffic through the mesh.
- [ ] **STRICT mTLS across the namespace.** A `PeerAuthentication` enforces
  STRICT; you can show with `istioctl authn tls-check` that calls use mTLS, and
  demonstrate that a freshly-created *non-meshed* Pod is rejected when it tries
  to call a meshed service.
- [ ] **Weighted canary on one service.** One service (e.g. `catalog`) has two
  versions (`v1`/`v2`) with a `DestinationRule` defining subsets and a
  `VirtualService` splitting traffic by weight; you can step the weight
  (e.g. 90/10 → 50/50 → 0/100) and show the observed split tracks the weights.
- [ ] **AuthorizationPolicy restricting calls.** An `AuthorizationPolicy` keyed
  on mTLS principals enforces a real access matrix — e.g. `orders` may call
  `catalog`, but the edge `storefront` may *not* call `catalog` directly. You
  can show the allowed call returns `200` and the forbidden one returns `403`.
- [ ] **Fault-injection test proving a retry/timeout works.** One route has a
  timeout and/or a bounded retry policy, and you use `VirtualService` fault
  injection to *prove* it: inject a delay longer than the timeout and show the
  timeout fires at the expected time, and/or inject a retryable abort and show
  the retry policy drops the caller-visible error rate. The proof is the
  measured before/after, not the YAML.
- [ ] **Observability confirming it all.** You can point to the Kiali graph (or
  Istio metrics in Prometheus) showing the meshed topology, the mTLS padlocks,
  the canary split as weighted edges, and the authz denial as a red edge.

### Hints (not a solution)

- **Order of operations matters.** Mesh everything *first* (label + create Pods,
  verify `2/2`) before turning on STRICT mTLS — flipping STRICT with an
  unmeshed Pod still around is the module-04 outage you already met. Add
  `AuthorizationPolicy` after mTLS is working, since principals depend on mTLS
  identity (module 05).
- **Distinct ServiceAccounts are the linchpin.** Principal-based authz only
  works if each caller runs as its own ServiceAccount (module 05); if
  everything uses `default`, you can't tell callers apart. Set
  `serviceAccountName` on every Deployment.
- **Verify each layer before adding the next.** After injection, `curl` works
  and Pods are `2/2`; after routing, the canary split is observable; after
  mTLS, `authn tls-check` says STRICT and meshed callers still work; after
  authz, the allow/deny matrix holds; after resilience, fault injection proves
  the policy. Don't stack an unverified layer on another — that's how you get a
  failure you can't localise (the whole point of the module-06 review).
- **Prove, don't assume, the resilience policy.** A timeout/retry that's never
  been exercised is a guess. Inject the fault, measure the behaviour, then
  remove the fault — never leave a `fault` block on your steady-state config
  (module 07).
- **Watch the silent-typo class.** Every diagnose-and-fix in this track was the
  same bug shape — a schema-valid selector/label/weight/principal that matches
  the wrong thing and fails silently (Service selector, injection label,
  VirtualService order, inverted weight, authz principal). When something
  "applies cleanly but does nothing," suspect this first and compare the
  configured string against reality.
- **Clean up when done.** Delete the namespace (`kubectl delete ns shop`) to
  remove the app; the Istio control plane can stay for future tracks or be
  removed with `istioctl uninstall --purge`.

## Before you move on

You've now taken a plain-Kubernetes app and given it — without changing a line
of application code — encryption and identity on every hop, request-level
routing and canaries, identity-based authorization, and provable resilience,
all observable in one graph. Just as importantly, you can articulate when this
machinery earns its cost and when Ingress + NetworkPolicy + a good client
library would have been the wiser, cheaper choice (module 00). That judgement —
not the YAML — is what separates "used a mesh once" from "can decide whether to
run one."

This track secured and steered *stateless* service-to-service traffic. The
next track turns to the harder problem the mesh deliberately doesn't solve:
**state**. Databases, persistent volumes, StatefulSets, and knowing when to run
your own data store versus reaching for a managed Azure database are the
subject of
[14-databases-and-stateful-workloads](../../14-databases-and-stateful-workloads/README.md) —
where "just reschedule the Pod" stops being a safe answer and durability
becomes the whole game.

## Next

[14-databases-and-stateful-workloads](../../14-databases-and-stateful-workloads/README.md) —
run stateful workloads on Kubernetes properly, and know when a managed Azure
database is the right call instead.
