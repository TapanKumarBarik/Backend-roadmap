# 02 - Pods and Workloads

## Why this matters

The Pod is the smallest unit Kubernetes schedules and runs — every
workload object you'll meet later (Deployments, in module 03; and beyond)
is ultimately a machine for creating and managing Pods. If you don't
understand Pods solidly — what's inside one, how it starts, how it fails
— every later module's troubleshooting will feel like guesswork.

## Concepts

**A Pod is one or more containers that are always scheduled together, on
the same node, sharing a network namespace and (optionally) storage.**
This is the key difference from plain `docker run`: with Docker Compose,
each service is usually its own container with its own IP; in a Pod,
every container inside it shares one IP address and one `localhost` —
container A can reach container B on `localhost:<port>` as if they were
two processes on the same machine. Most Pods have exactly one container;
multi-container Pods are for tightly-coupled helpers (a "sidecar," like a
log shipper that reads files the main container writes).

**A Pod is meant to be disposable.** Pods don't move between nodes, and
if a Pod dies, nothing brings back that exact Pod (as you saw in module
01's exercise 9, only its containers get restarted by the kubelet, not
the Pod object itself if the whole Pod is deleted). That's intentional —
you're not meant to create bare Pods directly in real usage; you're meant
to use a workload controller (module 03) that creates and replaces Pods
for you. We start with bare Pods here anyway because you need to
understand what's inside one before wrapping it in a controller.

**The Pod spec** describes desired state: which container image(s) to
run, what commands/args, what ports, what environment variables, what
resource requests/limits, and what health checks to run. This is the
YAML equivalent of the parts of a `docker run` command you already know
— `-p`, `-e`, `--memory`, `--entrypoint` — just expressed declaratively.

**Resource requests and limits** tell the scheduler and kubelet how much
CPU/memory a container needs (`requests`, used for scheduling decisions —
"does any node have this much spare capacity?") and how much it's allowed
to use at most (`limits`, enforced at runtime). Exceed a memory limit and
the container is killed (OOMKilled); exceed a CPU limit and the container
is throttled, not killed. Without requests, the scheduler can pack Pods
onto a node with no guarantee they'll actually fit once busy.

**Probes** are how Kubernetes checks whether a container is actually
healthy, instead of just "is the process still running":
- A **liveness probe** answers "is this container stuck/dead and should
  be restarted?" Fail it repeatedly, and the kubelet kills and restarts
  the container.
- A **readiness probe** answers "is this container ready to receive
  traffic right now?" Fail it, and the Pod is removed from any Service's
  routing (module 04) without being restarted — useful for a container
  that's alive but still warming up (loading a large model, waiting on a
  database connection).
- A **startup probe** gives a slow-starting container extra time before
  liveness probes start counting against it.

**Pod phases**: `Pending` (accepted by the API, not yet fully scheduled
or its images not yet pulled), `Running` (at least one container
running), `Succeeded`/`Failed` (all containers exited, terminally), and
`Unknown`. `kubectl get pods` also shows container-level states you'll
use constantly for debugging: `ContainerCreating`, `CrashLoopBackOff`
(a container keeps crashing and Kubernetes is backing off restart
attempts with increasing delay), `ImagePullBackOff` (the image couldn't
be pulled and it's backing off retrying), `OOMKilled` (killed for
exceeding its memory limit).

**Init containers** run to completion, in order, *before* the Pod's main
containers start — useful for "wait for the database to be reachable" or
"populate a config file" steps that must finish first.

## Command reference

| Command | What it does | Example |
|---|---|---|
| `kubectl run <name> --image=<img>` | Imperatively creates a single Pod (quick, not for real workloads) | `kubectl run nginx --image=nginx` |
| `kubectl apply -f <file>` | Creates/updates objects from a YAML manifest (declarative, preferred) | `kubectl apply -f pod.yaml` |
| `kubectl get pods` | Lists Pods and their phase/restarts/age | `kubectl get pods -o wide` |
| `kubectl describe pod <name>` | Shows full detail including events — the #1 debugging command | `kubectl describe pod nginx` |
| `kubectl logs <pod>` | Shows a container's stdout/stderr logs | `kubectl logs nginx -c app --previous` |
| `kubectl exec -it <pod> -- <cmd>` | Runs a command inside a running container | `kubectl exec -it nginx -- sh` |
| `kubectl delete pod <name>` | Deletes a Pod | `kubectl delete pod nginx` |
| `kubectl port-forward pod/<name> <local>:<pod>` | Forwards a local port to a port in the Pod | `kubectl port-forward pod/nginx 8080:80` |
| `kubectl get pods -o yaml` | Dumps the full live object as YAML (including status the cluster added) | `kubectl get pod nginx -o yaml` |
| `spec.containers[].resources.requests` | Declares minimum CPU/memory needed (scheduling hint) | `requests: {cpu: "100m", memory: "128Mi"}` |
| `spec.containers[].resources.limits` | Declares the hard cap on CPU/memory | `limits: {cpu: "250m", memory: "256Mi"}` |
| `spec.containers[].livenessProbe` | Defines how to check "is this container alive" | see exercises |
| `spec.containers[].readinessProbe` | Defines how to check "is this container ready for traffic" | see exercises |
| `spec.initContainers` | List of containers that must complete before main containers start | see exercises |

## Hands-on exercises

Use namespace `demo` on your `kind-learning` cluster (`kubectl create
namespace demo` if you deleted it in module 01;
`kubectl config set-context --current --namespace=demo` to default into
it).

### 1. Your first Pod manifest

```yaml
# pod-nginx.yaml
apiVersion: v1
kind: Pod
metadata:
  name: nginx
  labels:
    app: nginx
spec:
  containers:
    - name: nginx
      image: nginx:1.27
      ports:
        - containerPort: 80
```

```bash
kubectl apply -f pod-nginx.yaml
kubectl get pods
kubectl describe pod nginx
```

Expected: `STATUS: Running`, `1/1` ready. In `describe`, check the
`Events` section for `Pulled`, `Created`, `Started`.

### 2. Reach the Pod directly

```bash
kubectl port-forward pod/nginx 8080:80
```

In another terminal:

```bash
curl localhost:8080
```

Expected: nginx's default welcome page HTML. Ctrl+C the port-forward
when done.

### 3. Logs and exec

```bash
kubectl logs nginx
kubectl exec -it nginx -- sh -c "hostname; ls /usr/share/nginx/html"
```

Expected: logs show nginx access/startup lines; `hostname` shows the
Pod's name — proof it's the same "machine" you curled.

### 4. Resource requests and limits

```yaml
# pod-limited.yaml
apiVersion: v1
kind: Pod
metadata:
  name: limited
spec:
  containers:
    - name: app
      image: nginx:1.27
      resources:
        requests:
          cpu: "100m"
          memory: "64Mi"
        limits:
          cpu: "250m"
          memory: "128Mi"
```

```bash
kubectl apply -f pod-limited.yaml
kubectl describe pod limited
```

Expected: a `Limits`/`Requests` section in the describe output matching
the YAML. Check `kubectl describe node learning-control-plane` afterward
— the `Allocated resources` section now reflects this Pod's requests.

### 5. Liveness and readiness probes

```yaml
# pod-probes.yaml
apiVersion: v1
kind: Pod
metadata:
  name: probed
spec:
  containers:
    - name: app
      image: nginx:1.27
      ports:
        - containerPort: 80
      readinessProbe:
        httpGet:
          path: /
          port: 80
        initialDelaySeconds: 2
        periodSeconds: 5
      livenessProbe:
        httpGet:
          path: /
          port: 80
        initialDelaySeconds: 5
        periodSeconds: 10
```

```bash
kubectl apply -f pod-probes.yaml
kubectl get pod probed --watch
```

Expected: `READY` goes from `0/1` to `1/1` once the readiness probe
passes. Ctrl+C to stop watching.

### 6. Multi-container Pod (sidecar) with shared storage

```yaml
# pod-sidecar.yaml
apiVersion: v1
kind: Pod
metadata:
  name: sidecar-demo
spec:
  volumes:
    - name: shared-logs
      emptyDir: {}
  containers:
    - name: writer
      image: busybox:1.36
      command: ["sh", "-c", "while true; do date >> /var/log/app/out.log; sleep 2; done"]
      volumeMounts:
        - name: shared-logs
          mountPath: /var/log/app
    - name: reader
      image: busybox:1.36
      command: ["sh", "-c", "tail -f /var/log/app/out.log"]
      volumeMounts:
        - name: shared-logs
          mountPath: /var/log/app
```

```bash
kubectl apply -f pod-sidecar.yaml
kubectl logs sidecar-demo -c reader
```

Expected: timestamps written by `writer`, read back by `reader` — proof
the two containers share the `emptyDir` volume even though they're
separate containers. Also try:

```bash
kubectl exec -it sidecar-demo -c writer -- hostname
kubectl exec -it sidecar-demo -c reader -- hostname
```

Expected: identical hostname — same Pod, same network namespace, two
containers.

### 7. Init containers

```yaml
# pod-init.yaml
apiVersion: v1
kind: Pod
metadata:
  name: init-demo
spec:
  initContainers:
    - name: wait-for-setup
      image: busybox:1.36
      command: ["sh", "-c", "echo 'doing setup...'; sleep 5; echo 'setup done'"]
  containers:
    - name: app
      image: nginx:1.27
```

```bash
kubectl apply -f pod-init.yaml
kubectl get pod init-demo --watch
```

Expected: Pod shows `Init:0/1` for ~5 seconds, then transitions to
`PodInitializing` briefly, then `Running`. Check:

```bash
kubectl logs init-demo -c wait-for-setup
```

### 8. Diagnose and fix: CrashLoopBackOff

```yaml
# pod-crash.yaml
apiVersion: v1
kind: Pod
metadata:
  name: crasher
spec:
  containers:
    - name: app
      image: busybox:1.36
      command: ["sh", "-c", "echo 'starting up'; exit 1"]
```

```bash
kubectl apply -f pod-crash.yaml
kubectl get pod crasher --watch
```

Expected: `STATUS` cycles `ContainerCreating` → `Error`/`Completed` →
`CrashLoopBackOff`, with `RESTARTS` climbing. Diagnose:

```bash
kubectl describe pod crasher
kubectl logs crasher
kubectl logs crasher --previous
```

Expected: `describe`'s `Events` shows `Back-off restarting failed
container`; `logs` shows `starting up` then the container exits.
The fix here is understanding the command intentionally exits 1 — in
real life you'd fix the application bug or the wrong command. Fix it by
replacing the command with one that stays running, and re-apply:

```bash
kubectl delete pod crasher
```

```yaml
# pod-crash-fixed.yaml
apiVersion: v1
kind: Pod
metadata:
  name: crasher
spec:
  containers:
    - name: app
      image: busybox:1.36
      command: ["sh", "-c", "echo 'starting up'; sleep 3600"]
```

```bash
kubectl apply -f pod-crash-fixed.yaml
kubectl get pod crasher
```

Expected: `Running`, `RESTARTS: 0`.

### 9. Diagnose and fix: ImagePullBackOff

```yaml
# pod-badimage.yaml
apiVersion: v1
kind: Pod
metadata:
  name: bad-image
spec:
  containers:
    - name: app
      image: nginx:this-tag-does-not-exist
```

```bash
kubectl apply -f pod-badimage.yaml
kubectl get pod bad-image --watch
```

Expected: `STATUS` becomes `ErrImagePull` then `ImagePullBackOff`.
Diagnose:

```bash
kubectl describe pod bad-image
```

Expected: an event like `Failed to pull image ... manifest unknown`.
Fix by correcting the tag and re-applying:

```bash
kubectl delete pod bad-image
```

```yaml
# pod-badimage.yaml (corrected)
apiVersion: v1
kind: Pod
metadata:
  name: bad-image
spec:
  containers:
    - name: app
      image: nginx:1.27
```

```bash
kubectl apply -f pod-badimage.yaml
kubectl get pod bad-image
```

Expected: `Running`.

### 10. Clean up

```bash
kubectl delete pod nginx limited probed sidecar-demo init-demo crasher bad-image
kubectl get pods
```

Expected: `No resources found in demo namespace.`

## Common mistakes & troubleshooting

- **Creating bare Pods for real workloads**: if the Pod dies (node
  reboot, eviction, manual delete), nothing recreates it. Bare Pods are
  for learning/one-off debugging; module 03's Deployments are what you
  actually use.
- **Confusing liveness and readiness**: a failing liveness probe kills
  and restarts the container; a failing readiness probe just pulls it
  out of Service traffic. Using liveness where you meant readiness can
  cause a slow-starting-but-healthy app to be restarted in a loop right
  as it's about to become ready.
- **No resource requests set**: the scheduler can then pack far more
  Pods onto a node than it can actually handle once they're all under
  load, leading to node-wide slowdowns or evictions.
- **Forgetting `-c <container>` in a multi-container Pod**: `kubectl
  logs`/`exec` need `-c` to pick a container once there's more than one;
  omitting it errors or (for `logs`) fails with an ambiguous-container
  message.
- **Reading `kubectl logs` instead of `--previous` after a restart**:
  once a container has restarted, plain `logs` shows the *new* instance's
  (possibly empty) output — the crash's logs are in `--previous`.
- **Not checking `kubectl describe`'s Events section first**: it's the
  fastest way to see *why* something is stuck, before diving into logs.

## Checkpoint quiz

1. What do all containers inside the same Pod share that containers in
   separate Pods do not?
2. What's the practical difference between a failed liveness probe and
   a failed readiness probe?
3. What happens to a container that exceeds its memory `limit`? What
   happens if it exceeds its CPU `limit`?
4. What's the difference between `kubectl logs <pod>` and
   `kubectl logs <pod> --previous`?
5. Why are bare Pods generally not used directly for real workloads?
6. Given a Pod stuck in `ImagePullBackOff`, what are the two commands you
   should run first to diagnose it, and what are you looking for in
   each?
7. What do init containers guarantee about ordering?

<details>
<summary>Show answers</summary>

1. A network namespace (same IP, can reach each other on `localhost`)
   and, if configured, shared volumes.
2. A failed liveness probe causes the kubelet to kill and restart the
   container; a failed readiness probe just removes the Pod from Service
   endpoints (no restart) until it passes again.
3. Exceeding the memory limit gets the container OOMKilled (terminated);
   exceeding the CPU limit throttles it (slows it down) rather than
   killing it.
4. Plain `logs` shows the current/running container instance's output;
   `--previous` shows the output of the instance before the most recent
   restart — essential for seeing why a crash happened.
5. If a bare Pod's node fails or the Pod is deleted/evicted, nothing
   recreates it — there's no controller watching over it, unlike
   Deployments/ReplicaSets which continuously ensure a desired number of
   replicas exist.
6. `kubectl describe pod <name>` (check Events for the exact pull
   failure reason/message) and `kubectl logs <name>` if it ever did start
   (usually it won't have, for a pure image-pull failure).
7. Init containers run one at a time, in the order listed, and each must
   complete successfully before the next one (or the main containers)
   starts.

</details>

## Next

[03-deployments-and-replicasets](../03-deployments-and-replicasets/README.md) —
wrap Pods in a controller that keeps the right number running and
handles rolling updates for you.
