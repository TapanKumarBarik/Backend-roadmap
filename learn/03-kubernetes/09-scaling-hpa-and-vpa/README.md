# 09 - Scaling: HPA and VPA

## Why this matters

Module 03 showed you how to scale a Deployment manually with `kubectl
scale`. In production, load changes constantly and unpredictably —
manually watching dashboards and typing `kubectl scale` all day isn't
realistic. Autoscalers close that loop automatically: the Horizontal Pod
Autoscaler adds/removes Pod replicas based on observed metrics, and the
Vertical Pod Autoscaler adjusts a Pod's own resource requests/limits
instead. Understanding both — and when each applies — is core to running
anything at real scale.

## Concepts

**Horizontal scaling vs. vertical scaling**: horizontal means more
copies (more Pods, module 03's replica count); vertical means bigger
copies (more CPU/memory per Pod, module 02's resource requests/limits).
Kubernetes automates both, but with two different, independent objects —
they solve different problems and, as you'll see, generally shouldn't
target CPU/memory on the same workload simultaneously.

**The Horizontal Pod Autoscaler (HPA)** watches a metric (by default,
average CPU utilization across a Deployment/ReplicaSet/StatefulSet's
Pods, compared against their resource *requests* — not limits) and
adjusts `spec.replicas` up or down to keep that metric near a target you
set. This is why module 02's resource requests aren't optional busywork
— the HPA's CPU-percentage target is meaningless without a request to
calculate the percentage *of*.

**metrics-server** is a lightweight cluster add-on that collects
resource usage (CPU/memory) from every kubelet and exposes it through
the Kubernetes API's metrics endpoints — the HPA (and `kubectl top`)
depend on it. It doesn't ship by default on kind, so this module installs
it explicitly — the same idea as module 08 needing an Ingress controller
installed before any Ingress object does anything.

**How the HPA control loop actually works** (same control-loop pattern
from module 01): periodically, it fetches current metric values, computes
`desiredReplicas = ceil(currentReplicas * (currentMetricValue /
targetMetricValue))`, and updates the target Deployment's `replicas` —
which then flows through the exact same ReplicaSet mechanics from module
03. The HPA never talks to Pods directly; it only ever changes a number
on the Deployment, same as if you'd typed `kubectl scale` yourself, just
continuously and automatically.

**Scale-up and scale-down behavior**: HPA scales up fairly readily but
deliberately scales down cautiously (a default stabilization window
delays scale-down decisions) to avoid "flapping" — rapidly adding and
removing Pods in response to noisy, short-lived metric spikes.

**The Vertical Pod Autoscaler (VPA)** is a separate, non-core add-on
(not built into Kubernetes the way HPA is) that observes a Pod's actual
resource usage over time and recommends — or, in `Auto`/`Recreate`
update modes, actively applies — new `requests`/`limits` values. Because
changing a running container's resource allocation isn't something you
can do in place, applying a VPA recommendation requires **recreating the
Pod** with the new values — which briefly disrupts that Pod, unlike
HPA's scaling which just adds/removes whole Pods without touching
existing ones.

**Why HPA and VPA don't mix well on CPU/memory for the same workload**:
if VPA is resizing a Pod's resource requests while HPA is simultaneously
counting replicas based on CPU percentage *of* those same requests, the
two can fight each other's signal. In practice, teams either pick one per
workload, or configure VPA in recommendation-only mode alongside HPA.

**Cluster Autoscaler**, worth knowing by name only, is a separate concept
from both: it adds or removes entire *nodes* from the cluster based on
whether Pods are unschedulable due to insufficient capacity. It has no
local equivalent (kind's node count is fixed) — this becomes relevant on
AKS, which can add/remove real VMs.

## Command reference

| Command | What it does | Example |
|---|---|---|
| `kubectl top nodes` | Shows current CPU/memory usage per node (needs metrics-server) | `kubectl top nodes` |
| `kubectl top pods` | Shows current CPU/memory usage per Pod | `kubectl top pods` |
| `kubectl autoscale deployment <name> --min=<n> --max=<n> --cpu-percent=<p>` | Imperatively creates an HPA | `kubectl autoscale deployment web --min=2 --max=6 --cpu-percent=50` |
| `kubectl get hpa` | Lists HorizontalPodAutoscalers and current/target metrics | `kubectl get hpa` |
| `kubectl describe hpa <name>` | Shows HPA conditions, current metrics, and scaling events | `kubectl describe hpa web` |
| `kubectl delete hpa <name>` | Deletes an HPA (Deployment keeps its current replica count) | `kubectl delete hpa web` |
| `spec.minReplicas` / `spec.maxReplicas` | Bounds on how far the HPA can scale a workload | `minReplicas: 2, maxReplicas: 10` |
| `spec.metrics[].resource.target.averageUtilization` | Target average CPU/memory % (of requests) across Pods | `averageUtilization: 50` |
| `spec.scaleTargetRef` | Which workload (Deployment, etc.) this HPA controls | `{apiVersion: apps/v1, kind: Deployment, name: web}` |
| `kubectl apply -f vpa.yaml` (VPA CRD) | Creates a VerticalPodAutoscaler (requires VPA installed separately) | see exercises |
| `spec.updatePolicy.updateMode` | VPA mode: `Off` (recommend only), `Initial`, `Recreate`, `Auto` | `updateMode: "Off"` |

## Hands-on exercises

Continue in namespace `demo` on your `learning` cluster.

### 1. Install metrics-server

kind clusters need metrics-server's TLS verification relaxed since kind
uses self-signed certificates internally:

```bash
kubectl apply -f https://github.com/kubernetes-sigs/metrics-server/releases/latest/download/components.yaml
kubectl patch deployment metrics-server -n kube-system --type=json \
  -p '[{"op":"add","path":"/spec/template/spec/containers/0/args/-","value":"--kubelet-insecure-tls"}]'
kubectl get pods -n kube-system -l k8s-app=metrics-server --watch
```

Expected: the `metrics-server` Pod reaches `Running`/`1/1`. Ctrl+C once
confirmed, then:

```bash
kubectl top nodes
```

Expected: real CPU/memory numbers per node (may take a minute after the
Pod starts before data is available).

### 2. Deploy a workload with requests set (required for HPA)

```yaml
# deploy-loadtest.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: loadtest
spec:
  replicas: 1
  selector:
    matchLabels: {app: loadtest}
  template:
    metadata:
      labels: {app: loadtest}
    spec:
      containers:
        - name: app
          image: vish/stress
          args: ["-cpus", "1"]
          resources:
            requests:
              cpu: "100m"
              memory: "64Mi"
            limits:
              cpu: "300m"
              memory: "128Mi"
---
apiVersion: v1
kind: Service
metadata:
  name: loadtest
spec:
  selector: {app: loadtest}
  ports: [{port: 80, targetPort: 80}]
```

```bash
kubectl apply -f deploy-loadtest.yaml
kubectl top pods -l app=loadtest
```

Expected: CPU usage climbing toward its 300m limit (the `vish/stress`
image deliberately burns CPU) — a controlled way to trigger autoscaling
without writing your own load generator.

### 3. Create an HPA

```bash
kubectl autoscale deployment loadtest --min=1 --max=5 --cpu-percent=50
kubectl get hpa loadtest
```

Expected: a row showing `TARGETS` like `<something>%/50%`, `MINPODS: 1`,
`MAXPODS: 5`.

### 4. Watch it scale up

```bash
kubectl get hpa loadtest --watch
```

In another terminal:

```bash
kubectl get pods -l app=loadtest --watch
```

Expected: within a couple of minutes, `TARGETS` shows CPU usage well
above 50% of the 100m request, and replica count climbs (up to 5) as the
HPA reacts. Ctrl+C both watches once you've seen it scale up.

### 5. Inspect the HPA's own reasoning

```bash
kubectl describe hpa loadtest
```

Expected: an `Events` section with lines like
`New size: 3; reason: cpu resource utilization (percentage of request)
above target` — the HPA's control loop decisions, made visible.

### 6. Remove the load and watch it scale back down (slowly, by design)

```bash
kubectl delete deployment loadtest
kubectl apply -f deploy-loadtest.yaml   # recreate without the stress args to simulate load stopping
```

Actually, to simulate load stopping while keeping the HPA attached,
instead patch the args down to something idle:

```bash
kubectl set image deployment/loadtest app=busybox:1.36
kubectl patch deployment loadtest --type=json -p '[{"op":"replace","path":"/spec/template/spec/containers/0/command","value":["sh","-c","sleep 3600"]},{"op":"remove","path":"/spec/template/spec/containers/0/args"}]'
kubectl get hpa loadtest --watch
```

Expected: `TARGETS` CPU usage drops toward 0%, but replica count only
decreases gradually, not instantly — this is the stabilization window
mentioned in Concepts, preventing rapid flapping. Ctrl+C the watch once
you've confirmed it's trending down.

### 7. Autoscale via YAML instead of the imperative command

```yaml
# hpa-explicit.yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: loadtest-explicit
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: loadtest
  minReplicas: 2
  maxReplicas: 4
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 60
```

```bash
kubectl delete hpa loadtest
kubectl apply -f hpa-explicit.yaml
kubectl get hpa loadtest-explicit
```

Expected: same mechanism as `kubectl autoscale`, now version-controllable
as a manifest — this is the form you'd actually keep in a repo/Helm
chart.

### 8. Vertical Pod Autoscaler (recommendation mode)

Installing the VPA controller itself is a heavier multi-component install
(not bundled with Kubernetes or kind). If you want to see it for real:

```bash
git clone https://github.com/kubernetes/autoscaler.git /tmp/autoscaler
cd /tmp/autoscaler/vertical-pod-autoscaler
./hack/vpa-up.sh
kubectl get pods -n kube-system | grep vpa
```

Expected: `vpa-recommender`, `vpa-updater`, `vpa-admission-controller`
Pods running. Then:

```yaml
# vpa-loadtest.yaml
apiVersion: autoscaling.k8s.io/v1
kind: VerticalPodAutoscaler
metadata:
  name: loadtest-vpa
spec:
  targetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: loadtest
  updatePolicy:
    updateMode: "Off"
```

```bash
kubectl apply -f vpa-loadtest.yaml
kubectl describe vpa loadtest-vpa
```

Expected (after a few minutes of the recommender observing usage): a
`Recommendation` section suggesting `Target`/`Lower Bound`/`Upper Bound`
CPU and memory values based on actual observed usage —
`updateMode: "Off"` means it only recommends, never actually changes
anything, which is the safest way to use VPA alongside an HPA on the same
workload. (If the VPA install is impractical in your environment, reading
this exercise and understanding what `updateMode: "Off"` buys you is
enough — it's not required to physically run it.)

### 9. Diagnose and fix: HPA showing `<unknown>` targets

```yaml
# deploy-norequests.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: norequests
spec:
  replicas: 1
  selector:
    matchLabels: {app: norequests}
  template:
    metadata:
      labels: {app: norequests}
    spec:
      containers:
        - name: app
          image: nginx:1.27
```

```bash
kubectl apply -f deploy-norequests.yaml
kubectl autoscale deployment norequests --min=1 --max=3 --cpu-percent=50
kubectl get hpa norequests
```

Expected: `TARGETS` column shows `<unknown>/50%` indefinitely. Diagnose:

```bash
kubectl describe hpa norequests
```

Expected: an event like `missing request for cpu` or `unable to compute
utilization ratio` — the HPA can't calculate a percentage without a CPU
`request` to be a percentage *of*. Fix by adding a CPU request:

```bash
kubectl patch deployment norequests --type=json -p '[{"op":"add","path":"/spec/template/spec/containers/0/resources","value":{"requests":{"cpu":"100m"}}}]'
kubectl get hpa norequests
```

Expected: within a minute or two, `TARGETS` shows a real percentage
instead of `<unknown>`.

### 10. Clean up

```bash
kubectl delete hpa loadtest-explicit norequests
kubectl delete vpa loadtest-vpa 2>/dev/null
kubectl delete deployment loadtest norequests
kubectl delete svc loadtest
```

## Common mistakes & troubleshooting

- **No resource requests set on the target workload**: the single most
  common HPA failure — CPU-based HPA has nothing to compute a percentage
  against, and sits at `<unknown>` forever, exactly as reproduced above.
- **metrics-server not installed (or unreachable)**: `kubectl top`
  returns an error, and any HPA targeting resource metrics stays
  `<unknown>` too — always confirm `kubectl top nodes` works before
  debugging an HPA further.
- **Expecting instant scale-down**: HPA deliberately delays scale-down
  decisions to avoid flapping; a metric dropping to zero doesn't mean
  replica count drops to `minReplicas` immediately.
- **Running HPA and VPA on CPU/memory for the same workload in `Auto`
  mode**: the two can fight each other's signal (VPA changing what
  "100%" even means while HPA is counting against it) — prefer VPA in
  `Off` (recommendation-only) mode if you also have an HPA on CPU/memory
  for that workload.
- **Setting `maxReplicas` without considering node capacity**: locally,
  a kind cluster has a small, fixed amount of CPU/memory total — an HPA
  can scale replicas up to `maxReplicas` on paper while new Pods sit
  `Pending` because there's genuinely no room; check `kubectl describe
  node` and `kubectl get pods` for `Pending` Pods if scaling seems
  "stuck."

## Checkpoint quiz

1. What metric does a basic HPA use by default, and what does it
   compare that metric against to compute a percentage?
2. Why is it a hard requirement to set CPU `requests` on a workload
   before attaching a CPU-based HPA to it?
3. What's the fundamental difference in *how* HPA and VPA each respond to
   high resource usage on a workload?
4. Why does applying a VPA recommendation require recreating a Pod,
   unlike an HPA scaling event?
5. Why does HPA scale down more cautiously than it scales up?
6. What add-on do both `kubectl top` and a resource-metric-based HPA
   depend on, and does kind ship it by default?

<details>
<summary>Show answers</summary>

1. Average CPU utilization across the target's Pods, by default,
   computed as a percentage of each Pod's CPU `request` (not `limit`).
2. Without a CPU `request`, there is no baseline denominator to compute
   "current usage as a percentage of" — the HPA cannot produce a
   percentage at all and reports `<unknown>`.
3. HPA changes the *number* of Pods (horizontal — more/fewer replicas of
   the same size); VPA changes the *size* of a Pod (vertical — more/less
   CPU/memory per replica), without changing replica count.
4. A running container's resource allocation (cgroup limits) generally
   can't be changed in place; applying a new value requires the
   container (and its Pod) to be recreated with the new
   requests/limits.
5. To avoid "flapping" — rapidly adding and removing Pods in response to
   short-lived, noisy metric spikes — HPA applies a stabilization window
   that biases toward caution on scale-down specifically.
6. metrics-server; no, it is not installed by default on a kind cluster
   and must be applied explicitly (with the `--kubelet-insecure-tls`
   flag added, since kind's kubelets use self-signed certs).

</details>

## Next

[10-observability-logging-and-metrics](../10-observability-logging-and-metrics/README.md) —
now that workloads scale automatically, learn to observe what they're
actually doing: logs and metrics across an entire cluster, not just one
Pod at a time.
