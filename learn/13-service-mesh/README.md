# Track 13: Service Mesh

You can already stand up Kubernetes Services and Ingress (track 03), lock
Pod-to-Pod traffic down with NetworkPolicy (track 03), and run a full
metrics/tracing/logging stack (track 12). This track is about what a
**service mesh** adds *on top of* all of that: mutual TLS between every
service without touching application code, traffic routing far finer than a
Service selector can express, authorization at the request layer, and
mesh-native observability that gives you a live map of who calls whom. We
use **Istio** as the primary teaching example and go deep on it; **Linkerd**
is mentioned as a lighter-weight alternative with an explicit tradeoff, but
you learn one mesh well rather than two shallowly.

The recurring theme: almost everything the mesh does, you *could* do by hand
with the tools you already have (hand-rolled TLS, replica-ratio canaries,
NetworkPolicy, RBAC). The mesh's value is that it does all of it uniformly,
declaratively, and out of the application's code path — and its cost is a
proxy next to every Pod and a control plane to run. Knowing when that trade
is worth it is as important as knowing the YAML.

## How this track works

- Go in order — module 01 assumes you installed nothing yet, module 03
  assumes you can write a `VirtualService` from module 02, and so on.
- Every module (except this index and the capstone) follows the same shape:
  **Why this matters → Concepts → Command reference → Hands-on exercises →
  Independent challenge → Common mistakes & troubleshooting → Checkpoint
  quiz → Next**. Two modules also carry a **Cumulative review**.
- All exercises run against a **local `kind` cluster with Istio installed** —
  no Azure spend required for this track. The mesh concepts transfer directly
  to AKS (track 07), and where AKS differs is called out.
- Module 08 is a capstone with no quiz — it asks you to combine STRICT mTLS,
  a weighted canary, an `AuthorizationPolicy`, and a fault-injection test
  into one meshed multi-service app.

## Modules

| # | Module | What it covers | Rough time |
|---|--------|-----------------|------------|
| 00 | [service-mesh-concepts](00-service-mesh-concepts/README.md) | The sidecar proxy pattern, data plane vs. control plane, what a mesh solves that Services/NetworkPolicy don't — and when it's overkill | 45-60 min |
| 01 | [installing-istio-and-sidecar-injection](01-installing-istio-and-sidecar-injection/README.md) | `istioctl install`, namespace injection labels, verifying sidecars are actually attached | 60-75 min |
| 02 | [traffic-management-basics](02-traffic-management-basics/README.md) | `VirtualService`, `DestinationRule`, subsets, routing by header and by weight | 60-90 min |
| 03 | [canary-and-blue-green-traffic-splitting](03-canary-and-blue-green-traffic-splitting/README.md) | Weighted canary and blue/green with Istio, compared to Argo Rollouts (track 10) and ACA revisions (track 06) | 60-90 min |
| 04 | [mtls-and-zero-trust](04-mtls-and-zero-trust/README.md) | `PeerAuthentication`, STRICT vs. PERMISSIVE, how mesh mTLS layers with NetworkPolicy, certificate rotation | 60-90 min |
| 05 | [authorization-policies](05-authorization-policies/README.md) | `AuthorizationPolicy` allow/deny rules, identity-based access, compared to Kubernetes RBAC | 60-75 min |
| 06 | [mesh-observability](06-mesh-observability/README.md) | Istio's built-in metrics, the Kiali dashboard, and wiring distributed tracing into track 12's OpenTelemetry/Grafana | 60-90 min |
| 07 | [resilience-patterns](07-resilience-patterns/README.md) | Retries, timeouts, circuit breaking/outlier detection, and fault injection for testing | 60-90 min |
| 08 | [capstone-project](08-capstone-project/README.md) | End-to-end: meshed multi-service app, STRICT mTLS, weighted canary, `AuthorizationPolicy`, and a proven retry/timeout under fault injection | 3-5 hours |

## Prerequisites

- Everything from [03-kubernetes](../03-kubernetes/README.md): comfortable
  with `kubectl`, Deployments, Services, Ingress, and especially
  [Services and networking](../03-kubernetes/04-services-and-networking/README.md)
  and [RBAC and NetworkPolicy](../03-kubernetes/11-security-rbac-and-network-policies/README.md).
- Everything from [12-observability-deep-dive](../12-observability-deep-dive/README.md):
  Prometheus/Grafana and OpenTelemetry tracing — module 06 plugs the mesh
  into that stack rather than standing up a new one.
- A local `kind` cluster and `kubectl`, as used throughout track 03.

[Back to main curriculum](../README.md)

Start here → [00-service-mesh-concepts/README.md](00-service-mesh-concepts/README.md)
