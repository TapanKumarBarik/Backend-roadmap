# 01 - Installing Istio and Sidecar Injection

## Why this matters

Everything else in this track — mTLS, routing, authorization, observability —
is delivered by the sidecar proxies, and a Pod only gets a sidecar if
injection is set up correctly. The single most common "the mesh isn't
working" bug is a Pod that was never actually meshed because a namespace
label was missing, so it silently behaves like a plain track-03 Pod. This
module installs Istio and, more importantly, teaches you to *verify* that
sidecars really attached rather than assuming they did.

## Concepts

### `istioctl` and installation profiles

Istio ships a CLI, **`istioctl`**, that installs the control plane, injects
sidecars, and diagnoses the mesh. You install with `istioctl install`, which
lays down `istiod` (the control plane) and the mesh's CRDs. Installs come in
**profiles** — `demo` (all features on, verbose, for learning — what we use),
`default` (production-leaning), `minimal` (control plane only). A profile is
just a bundle of defaults; picking `demo` here is the mesh analogue of using
the verbose `demo`-grade settings you used for local learning in earlier
tracks rather than a hardened production config.

### The injection model: how a sidecar gets into a Pod

Your Deployment YAML says one container; a meshed Pod runs two. Where did the
second come from? Istio registers a **mutating admission webhook** with the
API server. When a Pod is created in a namespace marked for injection, the
API server calls out to `istiod`, which *rewrites the Pod spec on the way in*
to add the Envoy sidecar container (and an init container that sets up the
iptables redirect). This is the same admission-webhook mechanism that policy
enforcement used in track 11 — a hook that inspects and mutates objects at
create time — here used to add a container instead of to validate one. Your
stored Deployment is unchanged; the *Pods* it creates come out with two
containers.

### Namespace labels: the injection switch

Injection is opt-in **per namespace**, controlled by a label on the
Namespace:

```
istio-injection=enabled
```

(Newer revision-based installs use `istio.io/rev=<revision>` instead, but the
idea is identical — a label that flips injection on.) A Pod created in a
labelled namespace gets a sidecar; a Pod in an unlabelled namespace does not.
This is deliberately the same label-selector philosophy from track 03:
behaviour is driven by labels, and a *missing* label is a silent no-op, not
an error — exactly the failure class you saw with Service selector typos in
track 03 module 04 and NetworkPolicy typos in module 11. **Labelling the
namespace does not retroactively inject already-running Pods** — injection
happens at Pod *creation*, so existing Pods must be restarted (rolled) to
pick up a sidecar.

### Verifying sidecars actually attached

Because a missing label fails silently, verification is a skill, not an
afterthought. Three independent checks:

- **`READY` column count.** `kubectl get pods` on a meshed Pod shows `2/2`
  (app + sidecar) instead of `1/1`. A meshed-namespace Pod stuck at `1/1` was
  not injected.
- **`istioctl proxy-status`.** Lists every proxy the control plane knows
  about and whether its config is in sync (`SYNCED`). A Pod you expected to
  be meshed but that's absent from this list has no proxy.
- **`kubectl describe pod`.** A meshed Pod's container list includes
  `istio-proxy` and an `istio-init` init container.

Building the habit of checking `2/2` first will save you from debugging
"mTLS isn't working" when the real problem is "this Pod isn't in the mesh."

### The ingress gateway: getting traffic *into* the mesh

Sidecars handle traffic *between* meshed Pods, but external traffic has to
enter the mesh somewhere. Istio's **ingress gateway** is a standalone Envoy
(a `LoadBalancer`/`NodePort` Service at the edge, not a per-Pod sidecar) that
external clients hit; it applies mesh routing on the way in. It plays the
role Ingress played in track 03, but it's mesh-aware and driven by a
`Gateway` + `VirtualService` (module 02) rather than an `Ingress` object.
On kind there's no cloud load balancer (same reason `LoadBalancer` stayed
`<pending>` in track 03 module 04), so we reach it via `port-forward` or
NodePort.

## Command reference

| Command / field | What it does | Notes |
|---|---|---|
| `istioctl install --set profile=demo -y` | Installs control plane + CRDs with the demo profile | `-y` skips the confirm prompt; `demo` = all features on for learning |
| `istioctl version` | Shows client and control-plane versions | Control-plane line blank until installed |
| `istioctl verify-install` | Checks the install is complete and healthy | Run right after install |
| `kubectl label namespace <ns> istio-injection=enabled` | Turns on sidecar injection for that namespace | The core injection switch; missing = no sidecars |
| `kubectl label namespace <ns> istio-injection-` | Removes the label (trailing `-` deletes it) | Disables injection for *new* Pods |
| `kubectl get namespace -L istio-injection` | Lists namespaces with the injection label shown as a column | Fast way to see which are meshed |
| `istioctl proxy-status` | Lists all known proxies and their config sync state | `SYNCED` = healthy; absence = not meshed |
| `kubectl get pods -n <ns>` | `READY 2/2` means app + sidecar; `1/1` means no sidecar | First check when "the mesh isn't working" |
| `istioctl kube-inject -f <file>` | Prints the Pod spec with the sidecar added, without applying | Shows exactly what injection *would* add |
| `istioctl analyze -n <ns>` | Static analysis of mesh config in a namespace | Flags missing labels, bad routing refs |
| `kubectl rollout restart deployment <name>` | Recreates Pods so a newly-labelled namespace injects them | Injection only happens at Pod creation |

## Hands-on exercises

You need a running `kind` cluster and `kubectl` (as in track 03) plus
`istioctl` installed locally (download from the Istio release and put it on
your `PATH`; `istioctl version` should print a client version).

### 1. Install Istio

```bash
istioctl install --set profile=demo -y
istioctl verify-install
kubectl get pods -n istio-system
```

Expected: `verify-install` reports success; `istio-system` shows `istiod`
and the ingress/egress gateway Pods reaching `Running`. This is the control
plane from module 00, now real.

### 2. Confirm nothing is meshed yet

```bash
kubectl create namespace mesh-demo
kubectl get namespace -L istio-injection
```

Expected: `mesh-demo` appears with an *empty* `ISTIO-INJECTION` column — no
label yet, so any Pod you create here will not get a sidecar. Prove it:

```bash
kubectl -n mesh-demo run tmp --image=nginx:1.27
kubectl get pod tmp -n mesh-demo
```

Expected: `READY 1/1` — one container, no sidecar. Delete it:

```bash
kubectl delete pod tmp -n mesh-demo
```

### 3. Turn on injection and deploy a meshed app

```bash
kubectl label namespace mesh-demo istio-injection=enabled
kubectl get namespace -L istio-injection
```

Expected: the column now shows `enabled` for `mesh-demo`. Deploy a two-tier
app:

```yaml
# app.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: backend
  namespace: mesh-demo
spec:
  replicas: 1
  selector: {matchLabels: {app: backend}}
  template:
    metadata: {labels: {app: backend}}
    spec:
      containers:
        - name: app
          image: hashicorp/http-echo:1.0
          args: ["-text=backend v1", "-listen=:5678"]
          ports: [{containerPort: 5678}]
---
apiVersion: v1
kind: Service
metadata:
  name: backend
  namespace: mesh-demo
spec:
  selector: {app: backend}
  ports: [{port: 80, targetPort: 5678}]
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: frontend
  namespace: mesh-demo
spec:
  replicas: 1
  selector: {matchLabels: {app: frontend}}
  template:
    metadata: {labels: {app: frontend}}
    spec:
      containers:
        - name: app
          image: curlimages/curl:8.10.1
          command: ["sh", "-c", "sleep 3600"]
```

```bash
kubectl apply -f app.yaml
kubectl get pods -n mesh-demo
```

Expected: both Pods reach `READY 2/2` — the sidecar attached because the
namespace was labelled *before* the Pods were created.

### 4. Verify with the mesh's own tooling

```bash
istioctl proxy-status
kubectl describe pod -n mesh-demo -l app=backend | grep -A2 "istio-proxy"
```

Expected: `proxy-status` lists both `frontend` and `backend` proxies as
`SYNCED`; `describe` shows the `istio-proxy` container present. These are the
three independent checks from Concepts — get in the habit of using all three.

### 5. Confirm traffic flows through the mesh

```bash
kubectl exec -n mesh-demo deploy/frontend -- curl -s http://backend
```

Expected: `backend v1`. The call looks identical to a track-03 call, but it
now traverses two Envoy sidecars — which you'll *see* in module 06's Kiali
graph and which is already carrying mTLS by default (module 04).

### 6. Preview what injection actually added

```bash
kubectl get pod -n mesh-demo -l app=backend -o jsonpath='{.spec.containers[*].name}{"\n"}'
kubectl get pod -n mesh-demo -l app=backend -o jsonpath='{.spec.initContainers[*].name}{"\n"}'
```

Expected: containers list includes `app` and `istio-proxy`; init containers
include `istio-init` (the one that programs the iptables redirect). This is
the mutating webhook's work from Concepts, made visible.

### 7. Diagnose and fix: a Pod missing its sidecar (the missing-label bug)

This is the canonical mesh bug. Create a namespace, *forget* to label it, and
deploy:

```bash
kubectl create namespace legacy-demo
```

```yaml
# legacy.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: reports
  namespace: legacy-demo
spec:
  replicas: 1
  selector: {matchLabels: {app: reports}}
  template:
    metadata: {labels: {app: reports}}
    spec:
      containers:
        - name: app
          image: hashicorp/http-echo:1.0
          args: ["-text=reports", "-listen=:5678"]
          ports: [{containerPort: 5678}]
```

```bash
kubectl apply -f legacy.yaml
kubectl get pods -n legacy-demo
istioctl proxy-status | grep reports || echo "reports NOT in proxy list"
```

Expected: `reports` is `READY 1/1` and does **not** appear in
`proxy-status` — it looks like a normal running Pod, which is exactly why
this is so easy to miss. Diagnose:

```bash
kubectl get namespace legacy-demo -L istio-injection
istioctl analyze -n legacy-demo
```

Expected: the label column is empty, and `analyze` flags that the namespace
is not enabled for injection. Fix — label the namespace *and* restart, since
injection only happens at Pod creation:

```bash
kubectl label namespace legacy-demo istio-injection=enabled
kubectl rollout restart deployment reports -n legacy-demo
kubectl get pods -n legacy-demo -w
```

Expected: a new `reports` Pod comes up `READY 2/2` and now appears in
`istioctl proxy-status`. Ctrl+C the watch. The lesson: labelling alone did
nothing to the *existing* Pod — you had to recreate it.

### 8. Diagnose the reverse: labelled namespace, still 1/1

Sometimes a Pod stays `1/1` even in a labelled namespace because of an
explicit opt-*out* annotation. Reproduce it:

```yaml
# opted-out.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: noproxy
  namespace: mesh-demo
spec:
  replicas: 1
  selector: {matchLabels: {app: noproxy}}
  template:
    metadata:
      labels: {app: noproxy}
      annotations:
        sidecar.istio.io/inject: "false"
    spec:
      containers:
        - name: app
          image: hashicorp/http-echo:1.0
          args: ["-text=noproxy", "-listen=:5678"]
```

```bash
kubectl apply -f opted-out.yaml
kubectl get pods -n mesh-demo -l app=noproxy
```

Expected: `1/1` despite the namespace being labelled — the pod-level
annotation `sidecar.istio.io/inject: "false"` overrides the namespace label.
This is the second thing to check (after the namespace label) when a Pod
won't mesh. Clean up:

```bash
kubectl delete deployment noproxy -n mesh-demo
```

### 9. Clean up the legacy namespace

```bash
kubectl delete namespace legacy-demo
```

Keep `mesh-demo` and its `frontend`/`backend` — module 02 builds on them.

## Independent challenge

No YAML given — use this module plus
[track 03 Deployments/Services](../../03-kubernetes/04-services-and-networking/README.md).

**Task:** Starting from a fresh namespace, deploy a three-container-Pod-free
two-service app (`web` calling `api`) such that *only* `api` is meshed and
`web` is not, without using two namespaces — do it with pod-level injection
control. Then prove your setup: show that `api`'s Pod is `2/2` and appears in
`istioctl proxy-status` while `web`'s Pod is `1/1` and does not, and confirm
`web` can still reach `api` over the network. Finally, flip it: mesh `web`
too, and verify both are now `2/2` — remembering what you learned in exercise
7 about why a label change alone isn't enough.

<details>
<summary>Stuck? One hint</summary>

With the namespace labelled `istio-injection=enabled`, use the pod-template
annotation `sidecar.istio.io/inject: "false"` on `web`'s Deployment to opt it
out while `api` (no annotation) gets injected — the annotation overrides the
namespace default per-Pod. To flip `web` on, remove the annotation and
`kubectl rollout restart` it so new Pods are injected.

</details>

## Common mistakes & troubleshooting

- **Forgetting the namespace label.** The number-one mesh bug: Pods run fine
  at `1/1` and behave like plain Pods — no mTLS, no routing, invisible to
  Kiali. Always check `kubectl get ns -L istio-injection` and the Pod's
  `READY` count first.
- **Labelling but not restarting.** Injection happens at Pod *creation*.
  Labelling a namespace does nothing to Pods already running — you must
  `kubectl rollout restart` (or delete/recreate) them.
- **A pod-level `sidecar.istio.io/inject: "false"` annotation.** This
  overrides the namespace label, so a Pod stays `1/1` even in a meshed
  namespace. Check pod annotations when the namespace label looks right.
- **Expecting the ingress gateway to get an external IP on kind.** Like any
  `LoadBalancer` Service locally (track 03 module 04), it stays `<pending>` —
  use `port-forward` or NodePort for local access.
- **Injecting system namespaces.** Never label `kube-system` or `istio-system`
  for injection — you can wedge cluster components. Mesh only your app
  namespaces.
- **Assuming `istioctl version` proving the client works means the mesh is
  installed.** The client is local; check the *control-plane* line and
  `istio-system` Pods to confirm the server side is actually up.

## Checkpoint quiz

Write down your answer to each question before expanding it — checking without attempting first is the single easiest way to fool yourself into thinking you've learned this.

1. What exact mechanism adds the sidecar container to a Pod, and at what
   moment in the Pod's life does it happen?
2. You label a namespace `istio-injection=enabled` but the already-running
   Pods stay `1/1`. Why, and what's the fix?
3. Name the three independent ways to verify a Pod actually has its sidecar.
4. A Pod is `1/1` in a namespace whose injection label is correctly set. What
   pod-level setting should you suspect?
5. Why does the Istio ingress gateway's Service stay `<pending>` on kind, and
   what did you learn in track 03 that explains it?
6. What does `istioctl proxy-status` tell you that `kubectl get pods` alone
   doesn't?
7. Why is a missing injection label such a dangerous bug compared to, say, a
   syntax error in a manifest?

<details>
<summary>Show answers</summary>

1. A mutating admission webhook: when a Pod is created in an injection-enabled
   namespace, the API server calls `istiod`, which rewrites the Pod spec to
   add the `istio-proxy` sidecar and `istio-init` container. It happens at Pod
   *creation* time, not to already-running Pods.
2. Injection only occurs when a Pod is created; existing Pods predate the
   label. Fix: `kubectl rollout restart` the Deployment (or delete the Pods)
   so new, injected Pods are created.
3. `kubectl get pods` showing `READY 2/2`; `istioctl proxy-status` listing the
   proxy as `SYNCED`; `kubectl describe pod` showing the `istio-proxy`
   container (and `istio-init` init container).
4. A `sidecar.istio.io/inject: "false"` annotation on the pod template, which
   overrides the namespace-level injection label.
5. There's no cloud provider on kind to fulfil a `LoadBalancer` Service, so
   its `EXTERNAL-IP` stays `<pending>` — the exact behaviour track 03 module
   04 showed for any `LoadBalancer` Service locally. Use `port-forward`/
   NodePort instead.
6. It reports whether each proxy exists and has the control plane's latest
   config (`SYNCED`) — i.e. that the Pod is actually part of the mesh and up
   to date. `get pods` shows the Pod is running but not whether it's meshed or
   in sync.
7. Because it fails *silently*: the Pod runs perfectly at `1/1`, so nothing
   errors — it just quietly isn't in the mesh, so all the mTLS/routing/authz
   you configure later has no effect on it, and you debug the wrong layer. A
   syntax error stops you immediately; this doesn't.

</details>

## Next

[02-traffic-management-basics](../02-traffic-management-basics/README.md) —
now that Pods are meshed, start steering their traffic with `VirtualService`
and `DestinationRule`: route by header and by weight.
