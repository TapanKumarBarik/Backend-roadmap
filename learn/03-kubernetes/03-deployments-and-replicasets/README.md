# 03 - Deployments and ReplicaSets

## Why this matters

Module 02 showed you that a bare Pod isn't self-healing at the object
level — delete it, and nothing brings it back. Real workloads need a
guarantee of "N copies of this should always exist" plus a safe way to
roll out new versions without downtime. That's exactly what a Deployment
gives you, and it's the object you'll use for the overwhelming majority
of workloads for the rest of your Kubernetes career.

## Concepts

**A ReplicaSet's job is one thing**: ensure exactly N Pods matching a
label selector exist, at all times. If you delete one of its Pods, the
ReplicaSet controller (a control loop, per module 01) notices observed
count dropped below desired count and creates a replacement immediately.
If you create an extra matching Pod by hand, it deletes one to get back
to N. It's a thermostat for Pod count.

**A Deployment manages ReplicaSets, and adds rollout behavior on top.**
You almost never create a ReplicaSet directly — you create a Deployment,
and it creates and owns a ReplicaSet for you. The extra value a
Deployment adds is: when you change the Pod template (e.g. a new image
tag), it creates a *new* ReplicaSet with the new template, and gradually
shifts Pods from the old ReplicaSet to the new one — a **rolling
update** — instead of you manually juggling two ReplicaSets.

**The label selector is the glue between all three layers** (Deployment
→ ReplicaSet → Pods), and it's worth being precise about: a
Deployment's `spec.selector.matchLabels` must match the labels in its own
`spec.template.metadata.labels`. Get this wrong (selector doesn't match
the template's labels) and the Deployment is rejected outright; get it
*right* but *also* matching some unrelated existing Pods, and you get
silent, confusing adoption/fighting over those Pods. Think of the
selector as a saved search — "manage every Pod with these exact labels"
— rather than a reference to specific Pod names.

**Rolling update strategy**: by default, a Deployment replaces Pods
gradually — `maxUnavailable` controls how many old Pods can be
down at once, `maxSurge` controls how many extra new Pods can exist above
the desired count during the rollout. This is why deploying a new version
doesn't cause downtime: at every moment, enough old-or-new Pods are
`Ready` to serve traffic (once you add a Service in module 04 to route
that traffic).

**Rollout history and rollback**: every change to a Deployment's Pod
template creates a new ReplicaSet revision. Kubernetes keeps old
ReplicaSets around (scaled to 0) so you can roll back to a previous
revision if the new one is broken — instant, because the old ReplicaSet
(and its Pod template) is still right there, no need to remember what
the old image tag was.

**Scaling** a Deployment just changes `spec.replicas`; the Deployment's
ReplicaSet controller creates or deletes Pods to match. This is
independent from rolling updates — you can scale and update at the same
time, though for learning it's clearer to do one at a time.

## Command reference

| Command | What it does | Example |
|---|---|---|
| `kubectl create deployment <name> --image=<img>` | Imperatively creates a Deployment | `kubectl create deployment web --image=nginx:1.27` |
| `kubectl apply -f <file>` | Creates/updates a Deployment from YAML (preferred) | `kubectl apply -f deployment.yaml` |
| `kubectl get deployments` | Lists Deployments and their ready/up-to-date/available counts | `kubectl get deploy` |
| `kubectl get replicasets` | Lists ReplicaSets (usually one active + old revisions at 0) | `kubectl get rs` |
| `kubectl describe deployment <name>` | Shows rollout status, conditions, and events | `kubectl describe deploy web` |
| `kubectl scale deployment <name> --replicas=<n>` | Changes the desired replica count | `kubectl scale deploy web --replicas=5` |
| `kubectl set image deployment/<name> <container>=<image>` | Updates a container's image, triggering a rollout | `kubectl set image deploy/web nginx=nginx:1.28` |
| `kubectl rollout status deployment/<name>` | Watches a rollout until it completes or fails | `kubectl rollout status deploy/web` |
| `kubectl rollout history deployment/<name>` | Lists revision history | `kubectl rollout history deploy/web` |
| `kubectl rollout undo deployment/<name>` | Rolls back to the previous revision | `kubectl rollout undo deploy/web` |
| `kubectl rollout undo deployment/<name> --to-revision=<n>` | Rolls back to a specific revision | `kubectl rollout undo deploy/web --to-revision=2` |
| `kubectl rollout pause/resume deployment/<name>` | Pauses/resumes an in-progress rollout | `kubectl rollout pause deploy/web` |
| `spec.strategy.rollingUpdate.maxUnavailable` | Max Pods that can be unavailable during rollout | `maxUnavailable: 1` |
| `spec.strategy.rollingUpdate.maxSurge` | Max extra Pods allowed above desired count during rollout | `maxSurge: 1` |

## Hands-on exercises

Continue in namespace `demo`.

### 1. Your first Deployment

```yaml
# deploy-web.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: web
  labels:
    app: web
spec:
  replicas: 3
  selector:
    matchLabels:
      app: web
  template:
    metadata:
      labels:
        app: web
    spec:
      containers:
        - name: nginx
          image: nginx:1.27
          resources:
            requests:
              cpu: "50m"
              memory: "64Mi"
            limits:
              cpu: "200m"
              memory: "128Mi"
```

```bash
kubectl apply -f deploy-web.yaml
kubectl get deployments
kubectl get replicasets
kubectl get pods -o wide --show-labels
```

Expected: `web` Deployment shows `3/3` ready; one ReplicaSet with 3
Pods, all labeled `app=web`.

### 2. See the ownership chain

```bash
kubectl describe deployment web | grep -A2 "OldReplicaSets\|NewReplicaSet"
kubectl get replicasets -o wide
kubectl describe pod -l app=web | grep -A3 "Controlled By\|Owner"
```

Expected: the ReplicaSet's name is `web-<hash>`; each Pod's owner
reference points to that ReplicaSet, whose owner reference points to the
`web` Deployment — a three-level chain.

### 3. Prove the ReplicaSet self-heals a deleted Pod

```bash
kubectl get pods -l app=web
kubectl delete pod <one-pod-name-from-above>
kubectl get pods -l app=web --watch
```

Expected: a new Pod appears within seconds with a new random suffix —
count stays at 3. Ctrl+C to stop watching.

### 4. Scale

```bash
kubectl scale deployment web --replicas=5
kubectl get pods -l app=web
kubectl scale deployment web --replicas=2
kubectl get pods -l app=web
```

Expected: Pod count tracks the requested replica count each time.

### 5. Rolling update

```bash
kubectl set image deployment/web nginx=nginx:1.28
kubectl rollout status deployment/web
kubectl get replicasets
```

Expected: `rollout status` reports `Waiting for deployment "web" rollout
to finish...` then `successfully rolled out`; `get replicasets` now
shows two ReplicaSets — the new one at 3/3 (assuming you scaled back to
2 then need to check actual count, adjust expectations to whatever
`replicas` currently is) and the old one scaled to 0.

### 6. Watch a rolling update happen live

Scale back up first so the rollout has room to show its staged behavior:

```bash
kubectl scale deployment web --replicas=4
kubectl rollout status deployment/web
```

In one terminal:

```bash
kubectl get pods -l app=web --watch
```

In another:

```bash
kubectl set image deployment/web nginx=nginx:1.27
```

Expected: you'll see old Pods `Terminating` while new ones go
`ContainerCreating` → `Running`, a few at a time, never all at once —
this is `maxUnavailable`/`maxSurge` in action. Ctrl+C the watch when
settled.

### 7. Rollout history and rollback

```bash
kubectl rollout history deployment/web
kubectl set image deployment/web nginx=nginx:1.29
kubectl rollout status deployment/web
kubectl rollout history deployment/web
kubectl rollout undo deployment/web
kubectl rollout status deployment/web
kubectl get pods -l app=web -o jsonpath='{.items[0].spec.containers[0].image}'
```

Expected: the final image shown is `nginx:1.27` again (the revision
before `1.29`) — instant rollback with no need to remember the old tag
yourself.

### 8. Control the rollout strategy explicitly

```yaml
# deploy-web-strategy.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: web
  labels:
    app: web
spec:
  replicas: 4
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxUnavailable: 1
      maxSurge: 1
  selector:
    matchLabels:
      app: web
  template:
    metadata:
      labels:
        app: web
    spec:
      containers:
        - name: nginx
          image: nginx:1.28
          resources:
            requests:
              cpu: "50m"
              memory: "64Mi"
            limits:
              cpu: "200m"
              memory: "128Mi"
```

```bash
kubectl apply -f deploy-web-strategy.yaml
kubectl rollout status deployment/web
```

Expected: rollout completes as before, but now explicitly bounded to one
Pod unavailable and one extra surging at a time — useful when you need
tighter control than the defaults (25% each) on a small cluster.

### 9. Diagnose and fix: a rollout that never finishes

```yaml
# deploy-broken.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: broken
  labels:
    app: broken
spec:
  replicas: 2
  selector:
    matchLabels:
      app: broken
  template:
    metadata:
      labels:
        app: broken
    spec:
      containers:
        - name: app
          image: nginx:1.27
          readinessProbe:
            httpGet:
              path: /this-path-does-not-exist
              port: 80
            periodSeconds: 5
```

```bash
kubectl apply -f deploy-broken.yaml
kubectl rollout status deployment/broken --timeout=30s
```

Expected: the command times out — the rollout never completes. Diagnose:

```bash
kubectl get pods -l app=broken
kubectl describe deployment broken
kubectl describe pod -l app=broken
```

Expected: Pods show `0/1` `READY` forever;
`describe pod`'s Events show repeated `Readiness probe failed: HTTP
probe failed with statuscode: 404`. The Pods are `Running` (the process
is fine) but never `Ready` because the health check path is wrong. Fix:

```yaml
# fix: change readinessProbe.httpGet.path to "/"
```

```bash
kubectl apply -f deploy-broken.yaml   # after editing the path to "/"
kubectl rollout status deployment/broken
```

Expected: rollout completes, Pods show `1/1`. This exercise is also a
preview of why a broken readiness probe is one of the most common causes
of a rollout that "hangs" with no obvious crash anywhere.

### 10. Diagnose and fix: selector/template label mismatch

Try to apply this intentionally broken Deployment:

```yaml
# deploy-mismatch.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: mismatch
spec:
  replicas: 2
  selector:
    matchLabels:
      app: mismatch
      tier: frontend
  template:
    metadata:
      labels:
        app: mismatch
    spec:
      containers:
        - name: app
          image: nginx:1.27
```

```bash
kubectl apply -f deploy-mismatch.yaml
```

Expected: rejected outright —
`error: Deployment.apps "mismatch" is invalid: spec.template.metadata.labels: Invalid value: ... \`selector\` does not match template \`labels\``.
This is the API server protecting you from a Deployment that could never
find its own Pods. Fix by making the template's labels a superset
matching the selector:

```yaml
  template:
    metadata:
      labels:
        app: mismatch
        tier: frontend
```

```bash
kubectl apply -f deploy-mismatch.yaml
kubectl get deployment mismatch
```

Expected: accepted, `2/2` ready. Clean up:

```bash
kubectl delete deployment web broken mismatch
```

## Common mistakes & troubleshooting

- **Editing a ReplicaSet directly**: changes get overwritten/fought by
  the owning Deployment. Always change the Deployment; let it manage its
  ReplicaSets.
- **Selector too broad**: a selector that accidentally matches Pods from
  another Deployment causes both to fight over ownership. Keep selectors
  specific (e.g. include both `app` and a unique identifier).
- **Confusing "Running" with "Ready"**: a rollout can stall forever with
  Pods happily `Running` but never `Ready`, because of a broken readiness
  probe — always check `READY` column, not just `STATUS`.
- **Forgetting `maxUnavailable`/`maxSurge` interact with replica count**:
  with `replicas: 1`, a default rolling update can still cause a brief
  gap if `maxUnavailable` isn't explicitly set to `0` — for a single
  replica, consider `maxSurge: 1, maxUnavailable: 0` for zero-downtime.
- **Assuming `kubectl rollout undo` is free of side effects**: rollback
  itself is a rollout — it takes time and follows the same
  `maxUnavailable`/`maxSurge` rules, it doesn't happen instantly across
  all Pods.
- **Not watching `kubectl rollout status`** and assuming `kubectl apply`
  returning immediately means the rollout finished — `apply` only means
  the API accepted the new desired state, not that Pods are updated yet.

## Checkpoint quiz

1. What's the division of responsibility between a Deployment and the
   ReplicaSet it creates?
2. What two fields must match for a Deployment to be accepted by the API
   server?
3. What causes a new ReplicaSet to be created versus the existing one
   just being scaled?
4. Why can `kubectl rollout undo` restore an old image instantly without
   you specifying the image tag?
5. What do `maxUnavailable` and `maxSurge` each control?
6. A Deployment's Pods are all `Running` but the rollout never reports
   success. What's the first thing to check, and why?
7. If you delete a Pod that belongs to a Deployment, what recreates it,
   and how quickly?

<details>
<summary>Show answers</summary>

1. The Deployment manages rollout strategy and history (creating new
   ReplicaSets on template changes, rolling traffic between them); the
   ReplicaSet's only job is maintaining N Pods matching its selector at
   all times.
2. `spec.selector.matchLabels` must match the labels in
   `spec.template.metadata.labels`.
3. Any change to `spec.template` (image, env vars, etc.) creates a new
   ReplicaSet; changing only `spec.replicas` just resizes the existing
   ReplicaSet.
4. Old ReplicaSets (with their full Pod template, including the old
   image tag) are kept around scaled to 0 specifically so a rollback can
   reuse them immediately.
5. `maxUnavailable` caps how many Pods can be down at once during a
   rollout; `maxSurge` caps how many extra Pods above the desired count
   can exist at once during a rollout.
6. Check the `READY` column / readiness probes — Pods can be `Running`
   but never pass their readiness probe, which blocks the rollout from
   completing even though nothing is crashing.
7. The Deployment's ReplicaSet controller notices the Pod count dropped
   below desired and creates a replacement, typically within seconds.

</details>

## Next

[04-services-and-networking](../04-services-and-networking/README.md) —
your Pods now self-heal and roll out safely, but nothing outside (or
between) them can reliably reach them yet; Services fix that.
