# 10 - Observability: Logging and Metrics

## Why this matters

You've been using `kubectl logs` and `kubectl describe` throughout this
track for one Pod at a time — fine for a single-Pod exercise, unworkable
once a Deployment has 10 replicas across several nodes and you need to
find which one is misbehaving, or understand a trend over time rather
than a single snapshot. This module covers reading logs and metrics at
the scale a real cluster actually operates at, and the cluster-native
building blocks (labels, metrics-server, resource views) that make that
possible without yet reaching for a full external observability stack.

## Concepts

**Logs in Kubernetes are per-container, not per-Pod, and definitely not
per-Deployment.** `kubectl logs` always operates on one specific
container in one specific Pod at a time — there's no built-in "logs for
my whole Deployment" command. The way you get there is by combining
`kubectl logs` with label selectors (module 03/04) across every Pod that
shares a label, or by aggregating logs into an external system —
production clusters almost always ship logs off-cluster (to something
like Azure Monitor / Log Analytics, which the AKS track covers) precisely
because `kubectl logs` doesn't scale as an interface once Pods get
deleted (their logs go with them).

**Log lifetime is tied to the container, not the Pod object.** Once a
container is restarted, its previous instance's logs are only reachable
via `--previous` (module 02) — and once the Pod itself is deleted, its
logs are gone entirely unless something already shipped them elsewhere.
This is the core reason centralized log aggregation matters for anything
beyond local learning: `kubectl logs` is a live tail into a container
that might not exist five minutes from now.

**`kubectl logs -l <selector>`** lets you tail every Pod matching a
label at once, and `--all-containers` extends that across every
container in matching Pods — this is the closest built-in equivalent to
"logs for my Deployment," by relying on the same label-selector
mechanism you've used for Services and Deployments all track.

**Metrics vs. logs**: logs are discrete event records (a line per
request, per error); metrics are numeric measurements over time (CPU %,
memory, request count) meant to be aggregated, graphed, and alerted on.
`kubectl top` (module 09) gives you current-point-in-time resource
metrics; it does not give you history — for trends over time you need a
metrics pipeline (Prometheus is the de facto standard in the Kubernetes
ecosystem) that stores samples over time, which this module introduces
at a basic level.

**Kubernetes Events** (seen constantly via `kubectl describe` throughout
this track) are a third, distinct observability signal: short-lived
records of *things that happened to an object* (scheduled, pulled image,
failed probe) rather than application output. `kubectl get events` and
`kubectl describe` are how you read them; like Pod logs, they don't live
forever (events expire from etcd after about an hour by default) — this
is exactly why `kubectl describe` right after a failure, not hours later,
is the debugging habit worth building.

**`kubectl top`** (recap from module 09) reports live CPU/memory per node
or Pod via metrics-server — the fastest way to answer "is anything
unexpectedly hot right now," but again with no history once you close the
terminal.

**A basic Prometheus + Grafana stack** is the standard next step beyond
`kubectl top`/`logs`: Prometheus periodically *scrapes* metrics endpoints
exposed by workloads and cluster components and stores them as a time
series; Grafana queries Prometheus and renders dashboards. This module's
exercises install a minimal version of this via a community Helm chart
(tying back directly to module 07) so you can see real dashboards
without hand-building the whole stack yourself.

## Command reference

| Command | What it does | Example |
|---|---|---|
| `kubectl logs <pod>` | Shows a container's logs | `kubectl logs web-7d8f9 -c nginx` |
| `kubectl logs -l <selector>` | Shows logs from every Pod matching a label selector | `kubectl logs -l app=web --tail=50` |
| `kubectl logs -l <selector> --all-containers` | Same, across every container in each matching Pod | `kubectl logs -l app=web --all-containers` |
| `kubectl logs <pod> -f` | Follows (streams) logs live | `kubectl logs web-7d8f9 -f` |
| `kubectl logs <pod> --since=<time>` | Shows only logs newer than a duration | `kubectl logs web-7d8f9 --since=10m` |
| `kubectl logs <pod> --previous` | Shows the previous (pre-restart) container instance's logs | `kubectl logs web-7d8f9 --previous` |
| `kubectl get events` / `-A` | Lists recent Events (namespace-scoped or cluster-wide) | `kubectl get events -A --sort-by=.lastTimestamp` |
| `kubectl top nodes` / `top pods` | Live resource usage snapshot | `kubectl top pods -A --sort-by=cpu` |
| `kubectl describe <kind> <name>` | Shows an object's recent Events alongside its spec/status | `kubectl describe pod web-7d8f9` |
| `helm install <release> <chart>` | Used here to install a metrics/logging stack | `helm install monitoring prometheus-community/kube-prometheus-stack` |
| `kubectl port-forward svc/<name> <local>:<remote>` | Used to reach Grafana/Prometheus UIs locally | `kubectl port-forward svc/monitoring-grafana 3000:80` |

## Hands-on exercises

Continue in namespace `demo`, using label `app=web` on a Deployment like
module 03's.

### 1. Recreate a multi-replica workload to observe

```yaml
# deploy-web.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: web
spec:
  replicas: 3
  selector:
    matchLabels: {app: web}
  template:
    metadata:
      labels: {app: web}
    spec:
      containers:
        - name: nginx
          image: nginx:1.27
          resources:
            requests: {cpu: "50m", memory: "64Mi"}
            limits: {cpu: "200m", memory: "128Mi"}
```

```bash
kubectl apply -f deploy-web.yaml
kubectl get pods -l app=web
```

### 2. Logs from one Pod vs. all matching Pods

```bash
kubectl logs -l app=web --tail=5
```

Expected: log lines prefixed with each Pod's name — you're seeing all 3
replicas' logs interleaved from one command, instead of running
`kubectl logs` three separate times.

### 3. Generate some traffic to see it in logs

```bash
kubectl port-forward deployment/web 8080:80 &
for i in 1 2 3 4 5; do curl -s localhost:8080 > /dev/null; done
kill %1
kubectl logs -l app=web --tail=20
```

Expected: access log lines (`"GET / HTTP/1.1" 200 ...`) appear across
whichever Pod(s) the port-forward happened to route to — port-forward to
a Deployment/label targets one Pod at a time per connection, worth
noticing as a contrast with a Service's load-balancing across requests.

### 4. Follow logs live while causing an event

In one terminal:

```bash
kubectl logs -l app=web -f --tail=0
```

In another:

```bash
kubectl delete pod -l app=web --field-selector=status.phase=Running 2>/dev/null
kubectl get pods -l app=web
kubectl exec -it $(kubectl get pods -l app=web -o jsonpath='{.items[0].metadata.name}') -- curl -s localhost:80 > /dev/null
```

Expected: in the first terminal, you see new log lines stream in live,
including from a freshly recreated Pod after the delete triggers
ReplicaSet self-healing (module 03). Ctrl+C the follow when done.

### 5. Read events cluster-wide, sorted by time

```bash
kubectl get events -A --sort-by=.lastTimestamp | tail -20
```

Expected: a chronological feed across every namespace — scheduling
decisions, image pulls, probe failures, everything you've been seeing
piecemeal via `describe` all track, in one place.

### 6. Point-in-time resource usage across everything

```bash
kubectl top pods -A --sort-by=cpu
kubectl top nodes
```

Expected: every Pod cluster-wide, sorted by current CPU usage — the
fastest way to spot an unexpectedly hot workload without checking Pods
one at a time.

### 7. Install a minimal Prometheus + Grafana stack via Helm

```bash
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm repo update
helm install monitoring prometheus-community/kube-prometheus-stack \
  --set grafana.adminPassword=admin \
  --set prometheus.prometheusSpec.resources.requests.cpu=100m \
  --set prometheus.prometheusSpec.resources.requests.memory=256Mi \
  -n monitoring --create-namespace
kubectl get pods -n monitoring --watch
```

Expected: several Pods (`prometheus-...`, `...-grafana-...`,
`...-kube-state-metrics-...`, etc.) reach `Running`. This can take a few
minutes and is resource-heavy for a small local cluster — reduce other
running workloads first if it stalls in `Pending`. Ctrl+C once settled.

### 8. Open Grafana and look at a real dashboard

```bash
kubectl port-forward svc/monitoring-grafana 3000:80 -n monitoring
```

In a browser, go to `http://localhost:3000`, log in with `admin`/`admin`
(as set above), and open the "Kubernetes / Compute Resources / Namespace
(Pods)" dashboard (or similar, under the prebuilt dashboard list).
Expected: real charts of CPU/memory over time for your `demo` namespace
Pods — actual history, unlike `kubectl top`'s single snapshot. Ctrl+C
the port-forward when done exploring.

### 9. Query Prometheus directly

```bash
kubectl port-forward svc/monitoring-kube-prometheus-prometheus 9090:9090 -n monitoring
```

In a browser, go to `http://localhost:9090`, and in the query box enter:

```
sum(rate(container_cpu_usage_seconds_total{namespace="demo"}[5m])) by (pod)
```

Expected: a graph of CPU usage rate per Pod in `demo` over the last
window — this is the same kind of query Grafana's dashboards run under
the hood, now visible directly. Ctrl+C the port-forward when done.

### 10. Diagnose and fix: "the logs I need are gone"

```bash
kubectl run flaky --image=busybox:1.36 --restart=Never -- sh -c "echo 'important error: disk full'; exit 1"
kubectl get pod flaky --watch
```

Expected: the Pod fails and (with `restart=Never`) does not restart, so
its logs are safe for now — but simulate the more common trap:

```bash
kubectl logs flaky
kubectl delete pod flaky
kubectl logs flaky
```

Expected: the second `kubectl logs flaky` errors —
`Error from server (NotFound): pods "flaky" not found` — the logs are
gone permanently along with the Pod object, including the "important
error" line you needed. Diagnose: this is exactly the class of problem
centralized logging (module concept above) solves — the fix isn't a
`kubectl` command after the fact (there isn't one), it's ensuring logs
are shipped off-Pod *before* this happens, e.g. via a log-shipping
sidecar/DaemonSet or, on AKS, Azure Monitor Container Insights. As a
concrete habit: when you know a Pod is about to be deleted deliberately
(a manual investigation, not a controller-driven replace), capture its
logs first:

```bash
kubectl run flaky2 --image=busybox:1.36 --restart=Never -- sh -c "echo 'important error: disk full'; exit 1"
kubectl logs flaky2 > /tmp/flaky2-logs.txt
kubectl delete pod flaky2
cat /tmp/flaky2-logs.txt
```

Expected: the captured file still has the log line even after the Pod is
gone.

### 11. Clean up

```bash
helm uninstall monitoring -n monitoring
kubectl delete namespace monitoring
kubectl delete deployment web
```

## Common mistakes & troubleshooting

- **Treating `kubectl logs` as durable storage**: once a Pod is deleted,
  its logs are gone unless something already captured/shipped them —
  don't rely on being able to go back and check logs for a Pod you
  already deleted.
- **Forgetting `-c <container>`** in multi-container Pods (recap from
  module 02) — `kubectl logs -l app=web --all-containers` sidesteps this
  when you want everything from every matching Pod's every container.
- **Not checking `kubectl describe`/Events promptly**: Events expire
  from etcd (roughly an hour by default) — the "why did this fail"
  evidence can simply be gone if you come back to investigate later.
- **Confusing metrics-server data with a metrics history**: `kubectl
  top` only shows the current moment — if you need "what did CPU usage
  look like at 3am," you need a real metrics pipeline (Prometheus, or a
  managed equivalent), not `kubectl top`.
- **Under-provisioning a local Prometheus stack**: the default
  `kube-prometheus-stack` chart requests substantial resources; on a
  small local cluster its Pods can sit `Pending` unless you reduce
  requests (as exercise 7 does) or free up capacity elsewhere first.

## Checkpoint quiz

1. Why is there no single built-in `kubectl` command to get "all logs
   for my Deployment," and what's the closest equivalent?
2. What happens to a container's logs when it's restarted? When its Pod
   is deleted entirely?
3. What's the practical difference between logs, metrics, and Events as
   three separate observability signals?
4. Why does `kubectl top` fail to answer "what did resource usage look
   like an hour ago"?
5. In exercise 10, why couldn't any `kubectl` command recover the
   deleted Pod's logs?
6. What two components does a basic Prometheus + Grafana stack add, and
   what does each one do?

<details>
<summary>Show answers</summary>

1. Kubernetes has no native "Deployment logs" concept — logs are always
   per-container; the closest built-in equivalent is `kubectl logs -l
   <selector>` (optionally `--all-containers`) to aggregate logs across
   every Pod matching a Deployment's labels.
2. On restart, the previous instance's logs remain accessible only via
   `--previous` until the next restart overwrites that slot too; once
   the Pod object itself is deleted, all of its logs are gone unless
   something already shipped them to an external system.
3. Logs are discrete event/output records per container; metrics are
   numeric measurements over time meant for aggregation/graphing/alerting;
   Events are short-lived cluster-generated records of things that
   happened to an object (scheduling, pulls, probe failures), distinct
   from application output.
4. `kubectl top` (via metrics-server) only exposes the current
   point-in-time snapshot — it stores no history, so historical
   questions require a real time-series metrics pipeline like
   Prometheus.
5. Once a Pod object is deleted, its logs are not retained anywhere by
   default — there is no `kubectl` command to retrieve logs for an
   object that no longer exists unless they were captured/shipped
   beforehand.
6. Prometheus scrapes and stores metrics over time as a queryable time
   series; Grafana queries Prometheus and renders that data as
   dashboards/graphs.

</details>

## Next

[11-security-rbac-and-network-policies](../11-security-rbac-and-network-policies/README.md) —
you can now observe your cluster in depth; next, control who and what is
allowed to do what within it.
