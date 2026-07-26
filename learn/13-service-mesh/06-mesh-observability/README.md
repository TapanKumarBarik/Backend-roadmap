# 06 - Mesh Observability

## Why this matters

In track 12 you instrumented applications to emit metrics and traces — real
work, per app, in code. Because a service mesh puts a proxy on every request,
it can hand you the golden signals (request rate, error rate, latency) and a
live map of who-calls-whom for *every* service with **zero application
changes**. This module plugs that mesh telemetry into the Prometheus/Grafana/
OpenTelemetry stack you already run, and introduces Kiali, the mesh's service-
graph dashboard — the tool that would have made every "which caller is this?"
question in modules 03-05 a glance instead of a `curl` loop.

## Concepts

### The mesh sees every request — so it measures every request

Every meshed call crosses two Envoy sidecars, and each sidecar records the
request: its source, destination, response code, and duration. That's the raw
material of the **four golden signals** (traffic, errors, latency, saturation)
from track 12 — and the mesh produces them for *all* traffic automatically,
because the proxy is on the path whether or not the app was instrumented. So
the mesh doesn't replace track 12's app-level instrumentation (which still
gives you business metrics the proxy can't see, like "orders placed"); it adds
a uniform L7 layer of infrastructure metrics underneath it, for free.

### Istio metrics feed the *same* Prometheus you already run

Istio's sidecars expose their metrics (e.g. `istio_requests_total`,
`istio_request_duration_milliseconds`) in **Prometheus format** on a metrics
port. This means the Prometheus you stood up in track 12 scrapes them exactly
like any other target — no new monitoring system, just new metric names from a
new source. The Grafana you already run visualizes them (Istio ships ready-
made dashboards). This is the deliberate payoff of doing track 12 first: the
mesh is a *producer* into your existing observability stack, not a parallel
one. (Note the track 05 module 11 lesson: if you've applied a default-deny
NetworkPolicy or an `AuthorizationPolicy`, you must allow Prometheus to scrape
the sidecar metrics endpoints, or the mesh metrics silently vanish.)

### Kiali: the service graph

**Kiali** is Istio's console: it reads the Istio metrics from Prometheus and
draws a **live topology graph** of your mesh — every service as a node, every
call as an edge, annotated with request rate, error percentage, and whether
the edge is mTLS-secured (a padlock). It also visualizes your
`VirtualService`/`DestinationRule` config and flags misconfigurations. Kiali
is where the abstract things you built become visible: the 80/20 canary split
from module 03 shows as two weighted edges; the STRICT mTLS from module 04
shows as padlocks on every edge; the module 05 authz denials show as red error
edges. It's the single best "is the mesh doing what I think?" tool.

### Distributed tracing: the mesh propagates, your app must forward

Tracing is the one place the mesh needs a little help from the app. Each
sidecar will **start or continue a trace span** for the request it handles and
report it to a tracing backend (the OpenTelemetry/Jaeger-style setup from track
12). But for the spans of a single user request to link into one **trace**
across services, each app must **propagate the trace headers** (`traceparent`/
the B3 headers) from its inbound request to its outbound calls. The mesh
generates and collects the spans; it cannot guess that your inbound request
and your outbound call belong together unless your code forwards the headers.
So mesh tracing is *mostly* free — you get per-hop spans automatically — but
end-to-end traces still require the lightweight header-forwarding you learned
to do in track 12. This is the key nuance: metrics are fully free, tracing is
free *per hop* but needs header propagation to be *end-to-end*.

### Telemetry has a cost, and you tune it

The proxies generating all this cost CPU and produce a lot of data. Two knobs
worth knowing: **trace sampling** (record 1% or 100% of requests — you rarely
trace everything in production because of volume/cost, exactly the sampling
tradeoff from track 12), and the mesh's **`Telemetry` API**, which lets you
tune which metrics/traces/logs are produced per workload or namespace. The
mesh's observability is powerful precisely because it's on every request —
which is also why you sample and scope it rather than firehose everything.

## Command reference

| Command / concept | What it does | Notes |
|---|---|---|
| `istioctl dashboard kiali` | Opens the Kiali service-graph UI | Port-forwards for you |
| `istioctl dashboard grafana` | Opens Grafana with Istio dashboards | Uses the Prometheus data source |
| `istioctl dashboard jaeger` | Opens the tracing UI | Where end-to-end traces land |
| `istioctl dashboard prometheus` | Opens Prometheus directly | Query `istio_requests_total` etc. |
| `istio_requests_total` | Counter of requests, labelled by source/dest/response code | The mesh's core traffic/error metric |
| `istio_request_duration_milliseconds` | Request latency histogram | Latency golden signal |
| `kind: Telemetry` | Tune metrics/traces/logs per scope | e.g. set trace sampling rate |
| `istioctl analyze` | Also flags observability/config issues Kiali surfaces | Complementary to Kiali |
| `kubectl -n istio-system get pods` | Confirm Kiali/Prometheus/Grafana addons are running | Demo profile installs sample addons |

## Hands-on exercises

Continue in `mesh-demo` with the meshed app, STRICT mTLS, and the
`checkout`/`reporting` callers from module 05. The Istio `demo` profile ships
sample Prometheus/Grafana/Kiali/Jaeger addons; if they aren't installed, apply
the `samples/addons` manifests from your Istio release (in a real setup you'd
point Istio at the track-12 Prometheus/Grafana instead — the sample addons are
the local stand-in).

### 1. Install the observability addons (if not present)

```bash
kubectl apply -f samples/addons/          # from your downloaded Istio release dir
kubectl -n istio-system get pods -l app.kubernetes.io/part-of=istio | grep -E "kiali|prometheus|grafana|jaeger"
```

Expected: `kiali`, `prometheus`, `grafana`, and a tracing Pod reach
`Running`. These are the same *kinds* of components as your track-12 stack —
here bundled for convenience.

### 2. Generate traffic to observe

The graph is empty without traffic. Drive a steady stream from both callers:

```bash
for i in $(seq 1 100); do
  kubectl exec -n mesh-demo deploy/checkout -- curl -s -o /dev/null http://backend
  kubectl exec -n mesh-demo deploy/frontend -- curl -s -o /dev/null http://backend
done
```

Expected: 200 successful calls generated — enough for the graph and metrics to
populate.

### 3. Query the mesh metrics in Prometheus directly

```bash
istioctl dashboard prometheus
```

In the Prometheus UI, run:

```
sum by (destination_service_name, response_code) (istio_requests_total)
```

Expected: a row for `backend` with `response_code="200"` and a count matching
your traffic — request rate and error rate, per service, with *zero* app
instrumentation. Compare mentally to the manual work this was in track 12.

### 4. Open the Kiali service graph

```bash
istioctl dashboard kiali
```

In Kiali, select the `mesh-demo` namespace and the Graph view (set it to show
traffic over the last few minutes).

Expected: nodes for `frontend`, `checkout`, `backend` (and the two backend
versions), with edges showing request rate and — because module 04's STRICT
mTLS is on — **padlock icons** on the edges. This is your whole mesh at a
glance: routing, traffic, and security in one picture.

### 5. See the canary split as weighted edges

Re-apply the 80/20 canary from module 03 and drive traffic, then watch Kiali:

```bash
kubectl patch virtualservice backend -n mesh-demo --type=merge -p \
  '{"spec":{"http":[{"route":[{"destination":{"host":"backend","subset":"v1"},"weight":80},{"destination":{"host":"backend","subset":"v2"},"weight":20}]}]}}'
for i in $(seq 1 100); do kubectl exec -n mesh-demo deploy/checkout -- curl -s -o /dev/null http://backend; done
```

Expected: in Kiali (versioned-graph view) the `backend-v1` and `backend-v2`
nodes show roughly an 80/20 traffic split — the canary you drove blind in
module 03 is now *visible*, which is exactly what makes a real metric-gated
canary possible.

### 6. Watch an error edge appear (authz denial made visible)

Re-apply the checkout-only authz policy from module 05, drive `reporting`
traffic, and watch Kiali:

```bash
kubectl apply -f authz-backend-checkout.yaml   # from module 05
for i in $(seq 1 50); do kubectl exec -n mesh-demo deploy/reporting -- curl -s -o /dev/null http://backend; done
```

Expected: the `reporting → backend` edge turns red with a high error
percentage (the 403s), while `checkout → backend` stays green. The module-05
denial you confirmed with HTTP codes is now a visible red edge — this is how
you'd *spot* an authz misconfiguration in production. Clean up:

```bash
kubectl delete authorizationpolicy backend-allow-checkout -n mesh-demo --ignore-not-found
```

### 7. Explore per-hop traces

```bash
istioctl dashboard jaeger
```

Drive a few requests, then in Jaeger search for traces to `backend`.

Expected: traces with spans for the sidecar hops. Note that spans across
*different* services only link into one end-to-end trace if the apps propagate
the trace headers — with these simple echo/curl workloads you'll mostly see
per-hop spans, illustrating the Concepts point: metrics are fully free, but
end-to-end traces need app header propagation (track 12).

### 8. Diagnose and fix: mesh metrics missing because scraping is blocked

This ties module 05 and track 12 together. Simulate the trap where an
over-broad authz/deny setup hides your own metrics. Apply a namespace-wide
default-deny authz policy (an empty ALLOW that matches nothing):

```yaml
# authz-denyall.yaml
apiVersion: security.istio.io/v1
kind: AuthorizationPolicy
metadata:
  name: default-deny
  namespace: mesh-demo
spec:
  {}
```

```bash
kubectl apply -f authz-denyall.yaml
for i in $(seq 1 20); do kubectl exec -n mesh-demo deploy/checkout -- curl -s -o /dev/null -w "%{http_code}\n" http://backend; done
```

Expected: every call is `403` — an empty `AuthorizationPolicy` (no rules)
selecting the whole namespace denies *all* traffic, and in Kiali the graph
goes red/empty as legitimate edges disappear. This is the deny-by-default trap
from module 05 at its most extreme, and it also demonstrates how observability
*reveals* it: the graph collapsing is your signal. Diagnose and fix:

```bash
kubectl get authorizationpolicy -n mesh-demo
kubectl delete authorizationpolicy default-deny -n mesh-demo
for i in $(seq 1 20); do kubectl exec -n mesh-demo deploy/checkout -- curl -s -o /dev/null -w "%{http_code}\n" http://backend; done
```

Expected: back to `200`, and the Kiali graph recovers. Lesson: your
observability stack is only as good as its access to the data — an authz/deny
policy that's too broad can blind you to the very outage it caused.

### 9. Reset

```bash
kubectl patch virtualservice backend -n mesh-demo --type=merge -p \
  '{"spec":{"http":[{"route":[{"destination":{"host":"backend","subset":"v1"},"weight":100},{"destination":{"host":"backend","subset":"v2"},"weight":0}]}]}}'
```

Leave the app and STRICT mTLS in place for module 07.

## Independent challenge

No step-by-step — draw on this module and
[track 12 observability](../../12-observability-deep-dive/README.md).

**Task:** Using only the mesh's telemetry (no app changes), produce a one-page
"golden-signals" readout for the `backend` service: its request rate, error
rate, and p50/p99 latency over a traffic run you generate, sourced from the
Istio metrics in Prometheus and cross-checked against the Kiali graph. Then run
a canary (module 03) from v1 to v2 and use *only* the mesh metrics to decide,
at each weight step, whether you'd promote or roll back — writing down the
specific metric threshold that would trigger an abort. Finally, explain in
three sentences which signals the mesh gives you for free versus which still
require the app-level instrumentation from track 12, and why end-to-end traces
fall in the second category.

<details>
<summary>Stuck? One hint</summary>

Request rate and error rate come from `sum by (...) (rate(istio_requests_total
[1m]))` split on `response_code`; latency from a histogram quantile over
`istio_request_duration_milliseconds_bucket`. The promote/abort decision is
just watching the v2 subset's error-rate and p99 during each weight step — pick
a threshold (e.g. "abort if v2 error rate > 1% or p99 > 2× v1"). The mesh gives
traffic/error/latency per hop for free; business metrics ("orders placed") and
*linked* end-to-end traces still need app instrumentation, the latter because
only your code can propagate the trace headers between inbound and outbound
calls.

</details>

## Common mistakes & troubleshooting

- **Empty Kiali graph.** Almost always "no recent traffic" — the graph shows a
  time window, so generate requests first. Second cause: Prometheus can't
  scrape the sidecars (a NetworkPolicy or authz policy blocking the metrics
  port).
- **Expecting end-to-end traces for free.** The mesh emits per-hop spans
  automatically, but they only link into one trace if the apps forward the
  trace headers between inbound and outbound calls (track 12). Metrics are
  free; end-to-end tracing needs app cooperation.
- **Standing up a second monitoring stack.** Istio metrics are Prometheus-
  format; point your existing track-12 Prometheus/Grafana at them rather than
  running a parallel system. The sample addons are a local convenience, not a
  second production stack.
- **Tracing everything in production.** 100% sampling is fine locally but
  expensive at scale — tune the sampling rate (via the `Telemetry` API), the
  same volume/cost tradeoff as track 12.
- **Trusting the graph while an authz/deny policy blinds it.** An over-broad
  `AuthorizationPolicy` (or default-deny NetworkPolicy) can block metric
  scraping so the graph looks *healthy-but-empty* — confirm scraping works
  before concluding "no traffic."
- **Reading a red edge as an app bug.** In a meshed cluster a red (error) edge
  can be an authz denial (403), an mTLS mismatch, or a routing error — not
  necessarily the application. Correlate with the response codes and
  `istioctl analyze` before blaming the code.

## Checkpoint quiz

Write down your answer to each question before expanding it — checking without attempting first is the single easiest way to fool yourself into thinking you've learned this.

1. Why can the mesh give you request rate, error rate, and latency for every
   service without any application instrumentation?
2. Does mesh observability replace the app-level metrics/tracing you built in
   track 12? What's the division of labour?
3. In what format does Istio expose its metrics, and why does that matter for
   the stack you already run?
4. What does Kiali show you at a glance, and how would the module-04 STRICT
   mTLS and a module-03 canary each appear in it?
5. Metrics come free from the mesh; end-to-end *traces* need one thing from
   your app. What, and why can't the mesh do it alone?
6. You applied an empty `AuthorizationPolicy` to the namespace and the Kiali
   graph went red/empty. What happened, and what does it teach about trusting
   dashboards?
7. Why do you sample traces rather than record 100% in production?

<details>
<summary>Show answers</summary>

1. Every meshed request passes through Envoy sidecars, and each sidecar records
   the request's source, destination, response code, and duration — so the
   golden signals are a byproduct of being on the request path, no app code
   required.
2. No — it adds to it. The mesh gives uniform L7 infrastructure signals
   (traffic/errors/latency per hop) for free; app-level instrumentation still
   provides business metrics the proxy can't see (e.g. "orders placed") and is
   required for linked end-to-end traces.
3. Prometheus format. That means the Prometheus/Grafana you already run in
   track 12 scrapes and visualizes Istio's metrics like any other target — the
   mesh is a producer into your existing stack, not a separate monitoring
   system.
4. A live topology graph — every service as a node, every call as an edge
   annotated with request rate, error %, and mTLS status. STRICT mTLS shows as
   padlocks on the edges; a canary shows as two weighted edges to the v1/v2
   version nodes reflecting the split.
5. Trace-header propagation: each app must forward the trace headers
   (`traceparent`/B3) from its inbound request to its outbound calls. The mesh
   emits per-hop spans but can't know your inbound and outbound calls belong to
   the same user request unless your code carries the headers across.
6. An empty `AuthorizationPolicy` selecting the whole namespace denies all
   traffic (deny-by-default with nothing allowed), so every call became 403 and
   the graph collapsed. Lesson: a dashboard showing "empty/healthy" can mean
   "blocked/blind," not "fine" — verify the data path before trusting the
   picture.
7. Because the mesh sees every request, tracing 100% produces enormous data
   volume and cost at scale; sampling (e.g. 1%) keeps enough signal to debug
   while controlling overhead — the same sampling tradeoff as track 12.

</details>

## Cumulative review

Closed-book. Don't reopen earlier modules while attempting these — mix across
this track and the tracks it builds on.

1. Trace one `frontend`→`backend` request end to end in your current
   `mesh-demo` setup, naming every mesh mechanism it passes through: injection
   (module 01), routing (module 02/03), mTLS (module 04), authz (module 05),
   and telemetry (module 06). For each, say what would happen to the request
   if that mechanism were misconfigured.
2. A meshed call returns `403`. List, in order, the checks you'd run to decide
   whether it's an `AuthorizationPolicy` denial (module 05), a routing problem
   (module 02), or something else — and which single tool (Kiali) would have
   shown you the answer fastest.
3. Four different bugs across this track and track 03 share one class: a
   Service selector typo, a NetworkPolicy label typo, a missing injection
   label, and an `AuthorizationPolicy` principal typo. State the class, and for
   each, what silently breaks and which command surfaces it.
4. Explain how mTLS (module 04), NetworkPolicy (track 03), and
   `AuthorizationPolicy` (module 05) are three distinct layers, and which one
   stops each of: an eavesdropper reading traffic; an unrelated Pod reaching a
   port at all; a meshed-but-unauthorized service making a call.
5. You run an 80/20 canary (module 03) and want to gate promotion on metrics.
   Which module-06 signals do you watch, which track-12 signals can the mesh
   *not* give you, and how does this relate to what Argo Rollouts (track 10)
   automates?
6. STRICT mTLS (module 04) plus an ALLOW `AuthorizationPolicy` (module 05) are
   both on backend, and now Prometheus (track 12) can't scrape backend's
   metrics and Kiali shows an empty graph. Give the two independent things
   that could be blocking the scrape and how you'd fix each.
7. Compare the "deny-by-default once you add the first rule" behaviour of
   NetworkPolicy (track 03), `AuthorizationPolicy` (module 05), and the
   "open-by-default" behaviour of a plain meshed service. State which starts
   open and which starts closed, and the practical trap each creates.
8. A VirtualService weighted 10/90 sends almost everyone to the new version,
   and Kiali confirms it. Is this a bug or intended? Describe how you'd tell,
   and the module-03 mistake that most commonly produces this exact picture.
9. Your teammate proposes replacing NetworkPolicy entirely with STRICT mTLS
   plus `AuthorizationPolicy`, arguing "the mesh does security now." Give the
   strongest argument for keeping NetworkPolicy anyway, referencing the layer
   each control operates at.
10. End to end: describe how you'd take a two-service app from "plain
    Kubernetes" (track 03) to "meshed, STRICT-mTLS, authz-restricted, canary-
    deployable, and observable" — naming the object you'd add at each step and
    the one verification you'd run before moving on.

<details>
<summary>Show answers</summary>

1. Injection (the sidecars carry it — misconfig: Pod unmeshed, none of the
   below applies); routing (VirtualService/DestinationRule pick the subset —
   misconfig: wrong version or no destination); mTLS (sidecars encrypt/
   identify — misconfig: STRICT rejects a non-meshed caller); authz
   (destination sidecar checks the principal — misconfig: legitimate caller
   gets 403); telemetry (sidecars record the request — misconfig: metrics
   missing/scrape blocked). Each misconfiguration fails the request or hides it
   at that specific stage.
2. Confirm the caller is meshed (`2/2`, in `proxy-status`); check for an
   `AuthorizationPolicy` selecting the destination and whether the caller's
   principal is allowed (403 = authz, most likely); check `istioctl
   proxy-config routes`/`analyze` for a routing/subset problem (which usually
   yields 503/no-healthy-upstream, not 403); Kiali's red edge with the response
   code would have pointed at authz fastest.
3. Class: a schema-valid label/selector/identity mismatch that applies with no
   error but silently does the wrong thing. Service selector typo → Service has
   no endpoints, routes nowhere (`get endpoints`); NetworkPolicy label typo →
   legitimate traffic blocked (`describe netpol` + `get pods --show-labels`);
   missing injection label → Pod runs unmeshed at `1/1` (`get ns -L
   istio-injection` / `proxy-status`); authz principal typo → all selected
   traffic denied (`get authorizationpolicy -o jsonpath` vs. the real SA).
4. mTLS (encryption + identity on allowed traffic) stops the eavesdropper;
   NetworkPolicy (L3/4 allow/deny) stops the unrelated Pod from reaching the
   port; `AuthorizationPolicy` (request-layer, identity-based) stops the
   meshed-but-unauthorized service's call. Three layers, all wanted.
5. Watch `istio_requests_total` (error rate) and
   `istio_request_duration_milliseconds` (latency) for the v2 subset; the mesh
   can't give you business metrics like "orders completed" or linked
   end-to-end traces without app instrumentation. Argo Rollouts automates
   exactly this gate — querying such metrics at each step and promoting/
   aborting automatically.
6. Either a NetworkPolicy is blocking the metrics port from Prometheus's
   namespace (allow ingress from monitoring), or the ALLOW
   `AuthorizationPolicy` made backend deny-by-default and doesn't permit the
   monitoring principal/namespace (add an allow rule for it). Fix whichever
   applies; both can independently blind the scrape.
7. NetworkPolicy and `AuthorizationPolicy` start *open* until the first policy
   selects the workload, then flip to deny-by-default (trap: adding one allow
   rule silently denies everything else). A plain meshed service is open by
   default too (any meshed caller allowed). The trap in all three is that "add
   one allow" is really "deny all except this one."
8. Almost certainly a bug: the weights were attached to the wrong subsets
   (10% to the old, 90% to the new) — the inverted-weight mistake from module
   03. Tell by reading which subset each weight sits on; the intended "10%
   canary" should have the *small* weight on the *new* version.
9. NetworkPolicy operates at L3/4 and can drop a connection before it's even a
   TLS handshake — it stops an unauthorized or compromised Pod from *reaching
   the port at all*, reducing attack surface, whereas mTLS+authz only act once
   a connection/handshake is underway. Defence in depth: keep the outer L3/4
   fence *and* the mesh's encryption/identity/authz.
10. Add the injection label + restart (verify `2/2`); add
    Service/VirtualService/DestinationRule for subsets and routing (verify with
    `curl`/`proxy-config routes`); add STRICT `PeerAuthentication` (verify
    `istioctl authn tls-check` and that meshed callers still work); add an
    ALLOW `AuthorizationPolicy` on principals (verify the allow/deny matrix
    with response codes); add a weighted VirtualService for canary (verify the
    split in Kiali); confirm metrics/graph in Kiali/Prometheus at the end.

</details>

## Next

[07-resilience-patterns](../07-resilience-patterns/README.md) — with full
visibility in place, make the mesh handle failure gracefully: retries,
timeouts, circuit breaking, and fault injection to *prove* those policies
actually work.
