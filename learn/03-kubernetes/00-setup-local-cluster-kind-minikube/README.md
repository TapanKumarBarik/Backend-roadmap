# 00 - Setup: Local Cluster (kind/minikube)

## Why this matters

Every exercise in this track needs a running Kubernetes cluster to point
`kubectl` at. Running one locally — instead of paying for a cloud cluster
before you understand the basics — means you can break things, delete the
whole cluster, and start over in seconds, for free. This module gets you
from "Docker only" to "a real (if small) Kubernetes cluster is running on
this machine."

## Concepts

**kubectl** is the command-line client that talks to a Kubernetes
cluster's API — think of it as the `docker` CLI, but instead of talking to
the Docker daemon on one machine, it talks to a cluster's API server,
which might be managing dozens of machines. Every Kubernetes interaction
in this entire track goes through `kubectl`.

**A local Kubernetes "cluster"** is Kubernetes running on your own
machine instead of on cloud VMs. You still get a real API server, a real
scheduler, and real nodes — they're just simulated using containers (kind)
or a single VM/container (minikube) instead of a fleet of cloud machines.
It behaves the same way your production cluster will; it's just small.

**kind** ("Kubernetes IN Docker") runs each Kubernetes "node" as a Docker
container. Since you already have Docker Desktop with WSL2 integration
from the Docker track, kind is just another container workload to it —
no extra virtualization layer, fast to start, fast to tear down and
recreate. This is why we recommend it for a learning loop where you'll
create and destroy clusters often.

**minikube** runs Kubernetes inside a single VM (or, in Docker-driver
mode, a single large container) and ships with an extensive addon system
(`minikube addons enable ingress`, a built-in dashboard, metrics-server
with one command, etc.). It's a good choice if you want a batteries-included
experience or need to demo a dashboard, but it's heavier and slower to
cycle than kind.

**Which one we'll use**: this track uses **kind** for every exercise.
It's lighter, starts in seconds, and because each "node" is just a
container, deleting and recreating a cluster is nearly free — you'll do
that often while learning. Where a module needs an addon minikube would
give you for free (an Ingress controller, metrics-server), we'll install
it explicitly on kind so you understand what's actually happening.

**Nodes**: a Kubernetes cluster is made of a **control plane** (the
"brain" — decides what should run where) and **worker nodes** (where your
containers actually run). A default `kind create cluster` gives you one
node that plays both roles. You can ask for more nodes if you want to
simulate a multi-node cluster.

## Command reference

| Command | What it does | Example |
|---|---|---|
| `kind create cluster` | Creates a kind cluster (default name `kind`) using the Docker driver | `kind create cluster --name learning` |
| `kind create cluster --config <file>` | Creates a cluster with custom topology (multiple nodes, port mappings) | `kind create cluster --config kind-config.yaml` |
| `kind get clusters` | Lists all kind clusters on this machine | `kind get clusters` |
| `kind delete cluster` | Deletes a kind cluster | `kind delete cluster --name learning` |
| `kubectl cluster-info` | Shows the API server address and core service endpoints | `kubectl cluster-info` |
| `kubectl get nodes` | Lists the cluster's nodes and their status | `kubectl get nodes -o wide` |
| `kubectl config get-contexts` | Lists known clusters/contexts kubectl can talk to | `kubectl config get-contexts` |
| `kubectl config use-context <name>` | Switches which cluster kubectl targets | `kubectl config use-context kind-learning` |
| `kubectl version` | Shows client and server (cluster) Kubernetes versions | `kubectl version` |
| `minikube start` | Starts a minikube cluster (alternative to kind, covered for comparison) | `minikube start --driver=docker` |
| `minikube status` | Shows whether the minikube VM/container and cluster components are running | `minikube status` |
| `minikube delete` | Deletes the minikube cluster | `minikube delete` |

## Hands-on exercises

These assume you're in a WSL2 Ubuntu terminal, Docker Desktop is running
with WSL2 integration enabled (from the Docker track), and you have
internet access to download binaries.

### 1. Install `kubectl`

```bash
curl -LO "https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl"
chmod +x kubectl
sudo mv kubectl /usr/local/bin/
kubectl version --client
```

Expected: a client version prints (e.g. `Client Version: v1.3x.y`). No
server version yet — you have no cluster to talk to.

### 2. Install `kind`

```bash
curl -Lo ./kind https://kind.sigs.k8s.io/dl/v0.23.0/kind-linux-amd64
chmod +x ./kind
sudo mv ./kind /usr/local/bin/kind
kind version
```

Expected: `kind vX.Y.Z ...` prints.

### 3. Confirm Docker is reachable from WSL2

```bash
docker ps
```

If this fails, go back to Docker Desktop settings and confirm WSL2
integration is enabled for your Ubuntu distro (this was set up in the
Docker track) — kind needs a working Docker daemon to create its
"node" containers.

### 4. Create your first cluster

```bash
kind create cluster --name learning
```

Expected output ends with something like:

```
Set kubectl context to "kind-learning"
You can now use your cluster with:

kubectl cluster-info --context kind-learning
```

kind automatically wrote a context into your kubeconfig and switched to
it — no manual configuration needed.

### 5. Verify the cluster

```bash
kubectl cluster-info
kubectl get nodes
```

Expected:

```
NAME                     STATUS   ROLES           AGE   VERSION
learning-control-plane   Ready    control-plane   1m    v1.3x.y
```

One node, playing both control-plane and worker roles.

### 6. Look at what kind actually created

```bash
docker ps
```

Expected: you'll see a container named `learning-control-plane` — this
*is* your Kubernetes node. Kind's whole trick is running a full
Kubernetes node's worth of processes inside one Docker container.

### 7. Inspect contexts

```bash
kubectl config get-contexts
kubectl config current-context
```

Expected: a row for `kind-learning`, marked current (`*`) in the first
column.

### 8. Create a multi-node cluster with a config file

Multi-node clusters are useful later for understanding scheduling across
nodes. Create the config:

```yaml
# kind-multi.yaml
kind: Cluster
apiVersion: kind.x-k8s.io/v1alpha4
nodes:
  - role: control-plane
  - role: worker
  - role: worker
```

```bash
kind create cluster --name multi --config kind-multi.yaml
kubectl get nodes --context kind-multi
```

Expected: three nodes — one `control-plane`, two `<none>` (worker) roles.

### 9. Switch between clusters

```bash
kubectl config use-context kind-learning
kubectl get nodes
kubectl config use-context kind-multi
kubectl get nodes
```

Confirm each shows the right node count — this is how you'll manage
multiple clusters (and later, real vs. test clusters) throughout your
career.

### 10. Clean up the extra cluster

```bash
kind delete cluster --name multi
kind get clusters
```

Expected: only `learning` remains. Keep the `learning` cluster — the rest
of this track uses it.

### 11. (Optional comparison) Try minikube once

```bash
curl -LO https://storage.googleapis.com/minikube/releases/latest/minikube-linux-amd64
sudo install minikube-linux-amd64 /usr/local/bin/minikube
minikube start --driver=docker
minikube status
kubectl get nodes
kubectl config get-contexts
```

Expected: minikube also registers its own context (`minikube`) and
switches `kubectl` to it. Notice `kubectl get nodes` now shows a
minikube-named node instead of the kind one — same `kubectl`, different
cluster underneath. When you're done comparing, tear it down and switch
back:

```bash
minikube delete
kubectl config use-context kind-learning
```

### 12. Diagnose and fix: "the cluster I expect isn't the one I'm talking to"

Someone (a very believable "friend") ran this and got confused:

```bash
kind create cluster --name debug-practice
kubectl config use-context kind-learning
kubectl get pods
# (works, but they expected to see resources they created against debug-practice)
```

Reproduce it yourself, then fix it:

```bash
kind create cluster --name debug-practice
kubectl create deployment nginx --image=nginx --context kind-debug-practice
kubectl config use-context kind-learning
kubectl get deployments
```

Expected: `No resources found in default namespace.` — the deployment
exists, but on `kind-debug-practice`, not `kind-learning`. Diagnose with:

```bash
kubectl config get-contexts
```

Find the `*` (current context) and confirm it doesn't match where you
created the resource. Fix by switching:

```bash
kubectl config use-context kind-debug-practice
kubectl get deployments
```

Expected: the `nginx` deployment now shows up. Clean up:

```bash
kind delete cluster --name debug-practice
kubectl config use-context kind-learning
```

This "wrong context" mistake is one of the most common real-world
Kubernetes errors — always check `kubectl config current-context` (or use
`kubectl get nodes` as a sanity check) before assuming a command failed
for some deeper reason.

## Independent challenge

No YAML or commands given here — figure it out yourself using what you
know from this module and earlier ones.

**Task:** A teammate needs a throwaway cluster named `staging-sim` that
mimics a small production topology: one control-plane node and three
worker nodes. Stand it up, prove all four nodes reached `Ready`, and then
— without deleting `staging-sim` — make sure your `kubectl` is pointed
back at your original `learning` cluster so you don't accidentally run
later exercises against the wrong place. Finally, confirm from the Docker
side (the container-runtime view you already know from the Docker track)
that the four nodes really are just containers on your host. Tear
`staging-sim` down when you're done.

<details>
<summary>Stuck? One hint</summary>

Multiple nodes come from a cluster config file listing one
`role: control-plane` and three `role: worker` entries; `kubectl config
use-context` switches which cluster you target, and `docker ps` shows the
node containers.

</details>

## Common mistakes & troubleshooting

- **Docker not running / WSL2 integration off**: `kind create cluster`
  fails immediately with a connection error to the Docker daemon. Open
  Docker Desktop, Settings → Resources → WSL Integration, confirm your
  distro is enabled.
- **Forgetting which context is active**: commands silently succeed or
  return empty results against the wrong cluster. Always
  `kubectl config current-context` when something looks unexpectedly
  empty.
- **Port conflicts**: if another process (or another kind cluster) is
  already using a port kind wants to expose, cluster creation can fail.
  `kind delete cluster --name <name>` and retry, or check `docker ps` for
  leftover containers from a previous failed attempt.
- **Confusing kind's "node" container with a real VM**: `docker exec -it
  learning-control-plane bash` gets you a shell inside the node container,
  which is a good debugging trick, but remember it's not where your
  workload containers run — those are separate containers created by the
  kubelet inside that node.
- **Running out of disk/memory** with multiple clusters left around:
  `kind get clusters` and delete ones you're not using — each is a set of
  running containers consuming resources.

## Checkpoint quiz

Write down your answer to each question before expanding it — checking without attempting first is the single easiest way to fool yourself into thinking you've learned this.

1. What relationship does `kubectl` have to a cluster, compared to what
   `docker` has to the Docker daemon?
2. What is a kind "node," physically?
3. Name one reason kind is recommended for this track over minikube, and
   one reason you might reach for minikube instead.
4. What command tells you which cluster your next `kubectl` command will
   hit?
5. If `kubectl get pods` returns `No resources found`, does that
   necessarily mean nothing is running anywhere? Why or why not?
6. How would you create a kind cluster with 2 worker nodes instead of the
   default 1 combined node?

<details>
<summary>Show answers</summary>

1. `kubectl` is a client to a cluster's API server (potentially many
   machines); `docker` (in the local-daemon sense) talks to one machine's
   Docker daemon directly. kubectl never touches nodes directly — every
   action goes through the API server.
2. A Docker container running the Kubernetes node processes (kubelet,
   container runtime, etc.) — visible via `docker ps` on the host.
3. kind is faster to create/destroy and lighter, good for a fast learning
   loop; minikube bundles addons (dashboard, ingress, metrics-server via
   one command) which is convenient if you want those without installing
   them yourself.
4. `kubectl config current-context` (or inspect the `*` row in
   `kubectl config get-contexts`).
5. No — it only means nothing is running in the currently active context
   (and, without `-A`/`--all-namespaces`, only in the current namespace).
   The resources might exist in a different cluster/context or namespace.
6. Write a kind config YAML with one `role: control-plane` entry and two
   `role: worker` entries, then `kind create cluster --config <file>`.

</details>

## Next

[01-kubernetes-architecture-and-concepts](../01-kubernetes-architecture-and-concepts/README.md) —
now that you have a cluster running, open the hood: what's actually
happening inside it when you run a `kubectl` command.
