# 01 - Kubernetes Architecture and Concepts

## Why this matters

You can memorize `kubectl` commands without understanding what's behind
them, but the moment something breaks — a Pod stuck `Pending`, a rollout
that never finishes — you need a mental model of what's actually talking
to what. This module builds that model before you touch any workload
objects, so every later module's troubleshooting steps make sense instead
of feeling like magic incantations.

## Concepts

**Control plane vs. nodes.** A Kubernetes cluster has two kinds of
machines (in kind, they're containers acting as machines): the **control
plane**, which makes decisions ("what should be running, and where?"),
and **worker nodes**, which actually run your containers. This is similar
to how a Docker Compose file describes intent and the Docker daemon
executes it — except in Kubernetes, the "brain" (control plane) and the
"muscle" (nodes) are separate components, possibly on separate machines,
constantly talking to each other over the network.

```
        CONTROL PLANE ("brain")              WORKER NODE ("muscle")
┌─────────────────────────────────┐   ┌──────────────────────────────┐
│  ┌───────────┐   ┌───────────┐   │   │  ┌──────────┐                 │
│  │ API server│◄─►│   etcd    │   │   │  │ kubelet  │──► containers   │
│  └─────┬─────┘   └───────────┘   │   │  └────┬─────┘   (via runtime) │
│        │  ▲                      │◄─►│       │                       │
│  ┌─────▼──┴──┐   ┌───────────┐   │   │  ┌────▼─────┐   ┌──────────┐  │
│  │ scheduler │   │controller │   │   │  │kube-proxy│   │containerd│  │
│  └───────────┘   │ manager   │   │   │  └──────────┘   └──────────┘  │
│                  └───────────┘   │   │                               │
└─────────────────────────────────┘   └──────────────────────────────┘
       everything goes THROUGH the API server — nothing bypasses it
```

**The API server** is the single front door to everything in the
cluster. Every `kubectl` command, every internal component, every change
to the cluster's state goes *through* the API server — nothing talks to
etcd or a node directly. Think of it like a REST API in front of a
database: you never edit the database directly, you always go through
the API, which validates and records your request.

**etcd** is the cluster's database — a key-value store holding the
desired and observed state of everything (every Pod, Service, ConfigMap
you create is a record in etcd). You never interact with etcd directly;
the API server is the only thing that reads/writes it. If etcd is lost
with no backup, the cluster loses all memory of what should exist.

**The scheduler** watches the API server for Pods that have no node
assigned yet, decides which node has the resources to run them, and
writes that decision back through the API server. It doesn't run
anything itself — it just makes the placement decision, similar to a
dispatcher assigning delivery jobs to drivers without ever driving.

**Controllers and the control loop** are the heart of how Kubernetes
"just works." A controller is a small loop that constantly compares
*desired state* (what you asked for, e.g. "3 replicas of this Pod") to
*observed state* (what's actually running) and takes action to close any
gap. This is the single most important idea in Kubernetes: **you declare
what you want, and controllers continuously reconcile reality toward
it** — you never issue one-time imperative commands like "start this
container" the way you do with `docker run`. If a Pod dies, the
corresponding controller notices the gap and creates a replacement,
without you doing anything.

```
        the reconciliation loop, running forever:

   ┌──────────────┐      compare      ┌──────────────┐
   │ DESIRED state│ ───────────────►  │ OBSERVED state│
   │ (what you    │                   │ (what is      │
   │  declared)   │  ◄─── gap? ────   │  actually     │
   └──────────────┘                   │  running)     │
          ▲                           └───────┬───────┘
          │                                   │ gap found
          │         ┌───────────────────┐     │
          └─────────│ controller acts to │◄────┘
                    │  close the gap     │
                    └───────────────────┘
```

**The kubelet** is the agent running on every node. It watches the API
server for Pods assigned to *its* node and makes sure the containers
described in each Pod are actually running there, using the node's
container runtime (Docker's underlying runtime, containerd, is common —
this is the same containerd that's been running your `docker run`
containers all along).

**kube-proxy** runs on every node and maintains the network rules that
let traffic reach the right Pod when you talk to a Service (covered in
depth in module 04) — it's why a Service's virtual IP quietly "just
works" no matter which node a Pod lands on.

**The declarative model, end to end.** When you run
`kubectl apply -f deployment.yaml`:

1. `kubectl` sends the YAML to the **API server**.
2. The API server validates it and stores the desired state in **etcd**.
3. A **controller** (the Deployment controller) notices new desired state
   and creates Pod objects to match it.
4. The **scheduler** notices unscheduled Pods and assigns each to a node.
5. The **kubelet** on that node notices a Pod assigned to it and asks the
   container runtime to actually start the containers.

Nothing in this chain happens because you told a specific machine "run
this container" — every step is a component noticing a *gap between
desired and observed state* and closing it. This is why Kubernetes
self-heals: kill a container, and the kubelet notices observed state no
longer matches desired state and restarts it, with no controller loop
involved at all for that particular repair.

**Namespaces** are a way to partition one cluster into multiple virtual
clusters for organizational purposes — similar to how you might use
separate folders instead of separate hard drives. Every object you create
lives in exactly one namespace (`default` if you don't specify one).
They don't provide hard security isolation by themselves (that comes from
RBAC and NetworkPolicy, module 11), but they're the basic unit for naming
and organizing resources.

## Command reference

| Command | What it does | Example |
|---|---|---|
| `kubectl get nodes` | Lists cluster nodes and their status/role | `kubectl get nodes -o wide` |
| `kubectl describe node <name>` | Shows detailed node info: capacity, allocated resources, conditions, events | `kubectl describe node learning-control-plane` |
| `kubectl get componentstatuses` | (Older clusters) shows control plane component health | `kubectl get componentstatuses` |
| `kubectl get namespaces` | Lists all namespaces in the cluster | `kubectl get ns` |
| `kubectl create namespace <name>` | Creates a new namespace | `kubectl create namespace demo` |
| `kubectl config set-context --current --namespace=<ns>` | Changes the default namespace for the current context | `kubectl config set-context --current --namespace=demo` |
| `kubectl get all -n <namespace>` | Lists common object types in a given namespace | `kubectl get all -n kube-system` |
| `kubectl api-resources` | Lists every object type (kind) the API server understands | `kubectl api-resources` |
| `kubectl explain <kind>` | Shows the schema/fields of an object type, pulled from the live API server | `kubectl explain pod.spec` |
| `kubectl cluster-info dump` | Dumps extensive cluster state for debugging (verbose) | `kubectl cluster-info dump \| head -100` |
| `kubectl get events -A` | Lists cluster-wide events (scheduling, pulls, restarts) | `kubectl get events -A --sort-by=.lastTimestamp` |

## Hands-on exercises

Use your `kind-learning` cluster from module 00 (`kubectl config
use-context kind-learning` if needed).

### 1. Inspect your node in detail

```bash
kubectl get nodes -o wide
kubectl describe node learning-control-plane
```

Look for the `Capacity` and `Allocatable` sections (CPU/memory the node
has vs. what's available for scheduling) and the `Conditions` section
(`Ready: True` means the kubelet is healthy and reporting in).

### 2. Find the control plane's own Pods

The control plane components (API server, scheduler, etcd, controller
manager) run as Pods themselves, in the `kube-system` namespace:

```bash
kubectl get pods -n kube-system
```

Expected: pods named roughly `etcd-...`, `kube-apiserver-...`,
`kube-controller-manager-...`, `kube-scheduler-...`, plus `kube-proxy-...`
and a DNS pod (`coredns-...`). This is Kubernetes running Kubernetes.

### 3. Look at the API server Pod's own describe output

```bash
kubectl describe pod -n kube-system -l component=kube-apiserver
```

Note the `Command` / args section — this is the literal binary and flags
the API server was started with.

### 4. List every namespace and everything in one

```bash
kubectl get namespaces
kubectl get all -n kube-system
```

Confirm you see Pods, and (for some components) Services, all scoped to
`kube-system`.

### 5. Create and use a namespace

```bash
kubectl create namespace demo
kubectl get namespaces
kubectl config set-context --current --namespace=demo
kubectl config view --minify | grep namespace
```

Expected: the last command shows `namespace: demo` — your context now
defaults to `demo` instead of `default`. Switch back when done exploring:

```bash
kubectl config set-context --current --namespace=default
```

### 6. Explore the API's object catalog

```bash
kubectl api-resources | head -20
kubectl explain pod
kubectl explain pod.spec.containers
```

Expected: `kubectl explain` prints the live schema documentation for that
field, pulled directly from the API server — this is a faster reference
than searching docs when you forget a field name later in this track.

### 7. Watch events as they happen

In one terminal:

```bash
kubectl get events -A --watch
```

In a second terminal, create some churn:

```bash
kubectl run test-pod --image=nginx -n demo
```

Back in the first terminal, expected: a stream of events —
`Scheduled`, `Pulling`, `Pulled`, `Created`, `Started` — showing the
exact reconciliation chain described in the Concepts section actually
happening. Clean up:

```bash
kubectl delete pod test-pod -n demo
```

(Use Ctrl+C in the first terminal to stop the `--watch` before moving on.)

### 8. Trace one `kubectl apply` end to end

```bash
kubectl run trace-demo --image=nginx -n demo --dry-run=client -o yaml > /tmp/trace-demo.yaml
cat /tmp/trace-demo.yaml
kubectl apply -f /tmp/trace-demo.yaml
kubectl get pod trace-demo -n demo -o wide
kubectl describe pod trace-demo -n demo
```

In the `describe` output, find the `Events` section at the bottom and
match each line to a step in the "declarative model, end to end" list
above: which event corresponds to the scheduler acting, and which to the
kubelet/container runtime acting? Clean up:

```bash
kubectl delete pod trace-demo -n demo
```

### 9. Prove the control loop self-heals

```bash
kubectl run heal-demo --image=nginx -n demo
kubectl get pod heal-demo -n demo -o jsonpath='{.status.containerStatuses[0].containerID}'
```

Copy the container ID (strip the `containerd://` prefix), then kill that
container directly through Docker/containerd underneath Kubernetes'
back:

```bash
docker exec learning-control-plane crictl stop <container-id-without-prefix>
kubectl get pod heal-demo -n demo --watch
```

Expected: the kubelet notices the container is gone and restarts it —
`RESTARTS` count increments, but the Pod itself is never recreated (a
bare Pod has no controller to recreate the whole Pod object, only the
kubelet keeping its containers alive — module 03 introduces Deployments,
which *do* recreate the whole Pod). Clean up:

```bash
kubectl delete pod heal-demo -n demo
```

### 10. Diagnose and fix: node NotReady

Simulate a node problem by stopping the kind node container directly
(never do this to a real production node without a very good reason —
here it's safe, it's just a container):

```bash
docker stop learning-control-plane
kubectl get nodes
```

Expected: this `kubectl get nodes` call may hang or time out — the API
server itself runs on that same node, so with your only node down, there
is nothing to talk to. This demonstrates why production clusters need
multiple control-plane nodes for high availability, and why a single-node
kind cluster is a learning tool, not a production pattern. Recover:

```bash
docker start learning-control-plane
```

Wait about 15-30 seconds for components to come back up, then:

```bash
kubectl get nodes
kubectl get pods -n demo
```

Expected: `Ready` returns, and Pods that existed before are still there
(their desired state was safely recorded in etcd, which lives on disk in
that same node container).

## Independent challenge

No YAML or commands given here — figure it out yourself using what you
know from this module and earlier ones.

**Task:** Create a fresh namespace called `arch-lab`, run a single nginx
Pod in it, and then demonstrate — end to end, using only observation
commands — the reconciliation chain this module describes. Specifically:
find the concrete evidence that the scheduler placed the Pod on a node,
that the kubelet then started its container, and that etcd's record of the
Pod survives a control-plane restart. Prove the last part by taking the
node down and bringing it back (as you did with the kind node container),
then confirming the Pod is still there afterward. Clean up the namespace
when done. This builds on the context/namespace switching from module 00.

<details>
<summary>Stuck? One hint</summary>

The `Events` section of `kubectl describe pod` shows the `Scheduled` and
`Started` lines you need; stopping/starting the kind node container is the
same `docker stop`/`docker start` move from this module's node-NotReady
exercise.

</details>

## Common mistakes & troubleshooting

- **Trying to "log into" the control plane to fix things**: almost
  everything should be done by changing desired state via `kubectl
  apply`/`edit`/`delete`, not by manually poking at nodes. Reach for
  `docker exec` into a kind node only for genuine learning/debugging, not
  as a habit.
- **Confusing "no node assigned yet" with "broken"**: a Pod briefly
  showing no node in `kubectl get pod -o wide` right after creation is
  normal — the scheduler hasn't run yet. Only worry if it stays that way
  (see the Pending diagnosis exercise in module 02).
  Forgetting that `kubectl` operates on the current namespace: commands
  silently show nothing (or the wrong things) if you forgot
  `-n <namespace>` and your context defaults elsewhere.
- **Assuming a single-node kind cluster reflects production HA**:
  production clusters typically run 3+ control-plane nodes precisely so
  losing one node doesn't take down the API server, unlike what you just
  saw in exercise 10.
- **Editing etcd or node state directly**: there is no supported way to
  do this in normal operation, and everything you need is exposed through
  the API server / `kubectl`.

## Checkpoint quiz

Write down your answer to each question before expanding it — checking without attempting first is the single easiest way to fool yourself into thinking you've learned this.

1. What is the one component that everything else — including
   `kubectl` — talks to, and never bypasses?
2. What does the scheduler actually do, and what does it *not* do?
3. In your own words, describe the "control loop" pattern and why it's
   central to Kubernetes' self-healing behavior.
4. Which component on a node is responsible for actually starting
   containers there?
5. What's stored in etcd, and what talks to it directly?
6. If you delete a container underneath a plain Pod's back (as in
   exercise 9), what recreates it — and what does *not* get recreated?
7. Why did `kubectl get nodes` hang when you stopped the only node in
   exercise 10, and how does production avoid this?

<details>
<summary>Show answers</summary>

1. The API server.
2. It decides *which node* an unscheduled Pod should run on based on
   resource requests/availability and constraints; it does not create
   containers or run anything itself.
3. A controller continuously compares desired state (from etcd, via the
   API server) to observed state and takes action to close any gap —
   this means recovery from failures happens automatically and
   continuously, not through anyone running a one-off fix command.
4. The kubelet (using the node's container runtime).
5. The desired and observed state of every object in the cluster
   (Pods, Services, ConfigMaps, etc.); only the API server reads/writes
   it directly.
6. The kubelet on that node restarts the container (because the Pod is
   still assigned there and the kubelet's job is to keep its containers
   running); the Pod object itself is not recreated — that requires a
   higher-level controller like a Deployment's ReplicaSet.
7. The API server itself was running on that one node, so with it down,
   there was nothing to answer the request; production clusters run
   multiple control-plane nodes so the API server survives the loss of
   any single one.

</details>

## Further reading & sources

- [Kubernetes Components](https://kubernetes.io/docs/concepts/overview/components/) - the official breakdown of control-plane and node components this module walks through.
- [The Kubernetes API](https://kubernetes.io/docs/concepts/overview/kubernetes-api/) - how the API server acts as the single front door to cluster state.
- [Controllers](https://kubernetes.io/docs/concepts/architecture/controller/) - the reconciliation/control-loop model that underpins Kubernetes self-healing.
- [Nodes](https://kubernetes.io/docs/concepts/architecture/nodes/) - what a node is and how the kubelet reports its status.
- [Namespaces](https://kubernetes.io/docs/concepts/overview/working-with-objects/namespaces/) - partitioning a cluster into virtual clusters for organization.
- [etcd documentation](https://etcd.io/docs/) - the key-value store that holds all cluster state.

## Next

[02-pods-and-workloads](../02-pods-and-workloads/README.md) — now that you
understand the machinery reconciling state, start actually defining the
workloads it reconciles: Pods.
