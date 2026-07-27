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

```
   the ownership chain (owner references point upward):

            ┌────────────────┐
            │   Deployment   │   manages rollout + history
            │      web       │
            └───────┬────────┘
                    │ owns
            ┌───────▼────────┐
            │  ReplicaSet    │   keeps exactly N pods alive
            │  web-<hash>    │
            └───┬────┬───┬───┘
          owns  │    │   │
           ┌────▼┐ ┌─▼──┐ ┌▼───┐
           │Pod │ │Pod │ │Pod │
           └────┘ └────┘ └────┘
```

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

```
   rolling update: old ReplicaSet scales down as new scales up

   start:   old RS [■ ■ ■ ■]      new RS [        ]
            step:   old RS [■ ■ ■]        new RS [□        ]  (+maxSurge)
            step:   old RS [■ ■]          new RS [□ □      ]
            step:   old RS [■]            new RS [□ □ □    ]
   done:    old RS [        ]      new RS [□ □ □ □]

   ■ = old-version Ready pod   □ = new-version Ready pod
   at every step enough Ready pods remain to serve traffic
```

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

## Independent challenge

No YAML or commands given here — figure it out yourself using what you
know from this module and earlier ones.

**Task:** Deploy a web application at 4 replicas, each container carrying
resource requests and limits, then roll it out to a new image tag under a
strategy you configure explicitly so that at no moment during the rollout
are fewer than 4 Pods available and never more than 5 exist at once.
Trigger the rollout, and while it's happening, capture evidence that your
surge/unavailability bounds were actually respected. Then deliberately
roll out a *broken* image tag, observe the rollout stall, and recover to
the last working version without looking up what that tag was. This builds
on module 02's resource requests and the self-healing model from module
01.

<details>
<summary>Stuck? One hint</summary>

`maxUnavailable: 0` with `maxSurge: 1` gives you the "never drop below
desired" guarantee; `kubectl rollout undo` restores the previous revision
without you naming the old tag, and `kubectl get pods -l <label> --watch`
during the rollout is where you see the bounds hold.

</details>

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

Write down your answer to each question before expanding it — checking without attempting first is the single easiest way to fool yourself into thinking you've learned this.

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

## Cumulative review

Closed-book. Don't reopen earlier modules while attempting these — the
point is to find out what actually stuck.

1. You run `kubectl get pods` and see `No resources found`, yet you're
   certain you created a Deployment earlier. Name the two independent
   things (one from module 00, one from module 01) that could each
   explain this even though the Deployment really does exist somewhere.
2. Trace what happens, component by component, from the instant you
   `kubectl apply` a 3-replica Deployment to the moment three containers
   are actually running — naming the API server, etcd, the Deployment/
   ReplicaSet controller, the scheduler, and the kubelet, and what each
   contributes.
3. You delete a bare Pod (module 02) and, separately, delete a Pod that
   belongs to a Deployment (module 03). Both had one container. Which
   comes back, which doesn't, and what mechanism accounts for the
   difference?
4. A Pod is stuck `Pending` right after creation on your single-node kind
   cluster. Give one module-01 reason (scheduling-related) and one
   module-02 reason (resource-related) it might be stuck, and how you'd
   tell them apart.
5. Why does a rolling update (module 03) depend on readiness probes
   (module 02) to actually deliver zero-downtime — what goes wrong during
   the rollout if the probe is missing or wrong?
6. You have a Deployment whose Pods show `Running` but `0/1` in the
   `READY` column and the rollout never completes. Explain the exact
   chain: what `READY` reflects, why the rollout waits on it, and where
   you'd look first.
7. On your kind cluster you created a second cluster earlier (module 00).
   Explain how a Deployment created "successfully" could be completely
   invisible to your current `kubectl get deployments`, and the one
   command that would reveal the mistake.
8. A ReplicaSet is a control loop (module 01) and so is the thing that
   restarted a container under a bare Pod. Both keep "observed" matching
   "desired," yet only one recreates a whole deleted Pod object. Reconcile
   these two facts precisely.
9. You scale a Deployment from 2 to 5 replicas and, seconds later, change
   its image tag. Which of these creates a new ReplicaSet and which just
   resizes the existing one, and why?

<details>
<summary>Show answers</summary>

1. Wrong context — your active `kubectl` context points at a different
   cluster than the one you created the Deployment on (module 00); and/or
   wrong namespace — the Deployment lives in a namespace other than the
   one your context defaults to, and you didn't pass `-n`/`-A` (module
   01). Either makes an existing resource invisible to a plain `get`.
2. `kubectl` sends YAML to the API server, which validates it and records
   the desired state in etcd. The Deployment controller notices new
   desired state and creates a ReplicaSet; the ReplicaSet controller
   creates three Pod objects to reach its desired count. The scheduler
   notices those unscheduled Pods and assigns each to a node. The kubelet
   on that node sees Pods assigned to it and tells the container runtime
   to start the containers.
3. The Deployment's Pod comes back (its ReplicaSet controller notices the
   count dropped below desired and creates a replacement within seconds);
   the bare Pod does not (nothing owns it — only the kubelet would restart
   its *container* if the container died, but a deleted Pod object has no
   controller to recreate it).
4. Module-01 reason: the scheduler simply hasn't run yet (normal for a
   brief moment right after creation). Module-02 reason: the Pod's
   resource requests exceed the node's allocatable capacity so no node can
   fit it. `kubectl describe pod` distinguishes them — a `FailedScheduling`
   event citing insufficient CPU/memory points to the resource cause,
   while no scheduling event yet (and quick resolution) points to normal
   timing.
5. During a rolling update Kubernetes only counts a new Pod as available
   once it's `Ready`; the readiness probe is what makes "Ready" mean
   "actually able to serve." Without it (or with a wrong probe), Pods are
   treated as ready the moment they're `Running`, so traffic can be sent
   to a Pod that isn't actually serving yet — reintroducing the downtime
   the rolling update was meant to avoid — or the rollout stalls forever
   waiting on a probe that never passes.
6. `READY` reflects whether each container's readiness probe is passing,
   not whether the process is running. A rollout waits for new Pods to
   become `Ready` before continuing (and before it reports success), so a
   never-passing readiness probe blocks it even with nothing crashing.
   Look first at `kubectl describe pod` Events for repeated readiness
   probe failures.
7. The Deployment was created against a different cluster/context (e.g.
   the second kind cluster), so it's real but on a cluster your current
   context isn't pointed at. `kubectl config get-contexts` (spotting the
   `*`) — or `kubectl config current-context` — reveals the mismatch.
8. The ReplicaSet controller reconciles the *count of Pod objects* — it
   creates a whole new Pod object when one is missing. The kubelet
   reconciles the *containers of a Pod already assigned to its node* — it
   restarts a dead container but never creates a new Pod object. A bare
   Pod has a kubelet keeping its containers alive but no controller
   watching the Pod-object count, which is why deleting the Pod itself is
   unrecoverable.
9. Changing `spec.replicas` (2→5) only resizes the existing ReplicaSet —
   no template change, so no new ReplicaSet. Changing the image is a
   change to `spec.template`, which creates a brand-new ReplicaSet with
   the new template and rolls Pods over to it.

</details>

## Further reading & sources

- [Deployments](https://kubernetes.io/docs/concepts/workloads/controllers/deployment/) - the authoritative reference for rollouts, scaling, and rollback behavior.
- [ReplicaSet](https://kubernetes.io/docs/concepts/workloads/controllers/replicaset/) - what a ReplicaSet guarantees and why you rarely create one directly.
- [Perform a Rolling Update](https://kubernetes.io/docs/tutorials/kubernetes-basics/update/update-intro/) - an interactive tutorial of the rolling-update mechanics shown here.
- [Labels and Selectors](https://kubernetes.io/docs/concepts/overview/working-with-objects/labels/) - the selector model that glues Deployments, ReplicaSets, and Pods together.
- [kubectl rollout reference](https://kubernetes.io/docs/reference/kubectl/generated/kubectl_rollout/) - the full command surface for status, history, undo, and pause/resume.

## Next

[04-services-and-networking](../04-services-and-networking/README.md) —
your Pods now self-heal and roll out safely, but nothing outside (or
between) them can reliably reach them yet; Services fix that.
