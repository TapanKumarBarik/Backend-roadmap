# 04 - Services and Networking

## Why this matters

Pods are disposable — every rolling update or self-heal replaces them
with new ones that get new IP addresses. If your frontend Pods had to
track individual backend Pod IPs, everything would break on every
deploy. A Service gives you one stable address that always routes to
whichever Pods are currently healthy, no matter how many times they're
replaced underneath it. This is what makes the Deployment model from
module 03 actually usable.

## Concepts

**The problem Services solve**: every Pod gets its own IP, but that IP
is not stable — delete and recreate a Pod (which happens constantly:
rollouts, self-healing, scaling) and it gets a new one. A Service is a
stable virtual IP plus DNS name that always routes to the current set of
matching Pods, decided fresh every time via the same label selector idea
from module 03.

**How a Service finds its Pods**: exactly like a Deployment's ReplicaSet,
a Service has a `spec.selector` of labels. Any Pod with matching labels
becomes an **Endpoint** of that Service, tracked automatically and
continuously — no manual registration. Get the selector wrong (typo, or
doesn't match your Deployment's Pod template labels) and the Service has
zero endpoints — it exists, but routes nowhere, which is one of the most
common real-world Kubernetes networking bugs.

```
   Service (selector: app=web)          Pods
   ┌───────────────────────┐    match   ┌───────────────┐
   │ stable ClusterIP + DNS│ ─────────► │ app=web  Pod A │──► endpoint
   │  web.demo.svc...      │ ─────────► │ app=web  Pod B │──► endpoint
   └───────────────────────┘ ─────────► │ app=web  Pod C │──► endpoint
                              ╳ no match │ app=db   Pod X │   (ignored)
                                         └───────────────┘
   endpoints are recomputed continuously as Pods come and go
```

**ClusterIP** (the default type) gives the Service a virtual IP reachable
only from *inside* the cluster. This is what you use for internal
service-to-service traffic (e.g. a frontend Pod calling a backend
Service) — analogous to how, in Docker Compose, containers on the same
network could reach each other by service name.

**Cluster DNS**: every Service automatically gets a DNS name of the form
`<service-name>.<namespace>.svc.cluster.local` (usually you can just use
`<service-name>` from within the same namespace, or
`<service-name>.<namespace>` from another namespace). CoreDNS (the
`coredns` Pods you saw in `kube-system` in module 01) serves these
records — this is what replaces hardcoded IPs in your application config
with a name that always resolves to the current, healthy set of Pods.

**NodePort** opens the *same* port on every node in the cluster, and
traffic hitting that port on any node is forwarded to the Service (and
from there, to a Pod). This is a simple way to expose something outside
the cluster without cloud load-balancer support (which you don't have
locally) — useful for local testing, rarely used directly in production.

**LoadBalancer** asks the cloud provider to provision an external load
balancer that points at the Service. On a local kind/minikube cluster
there's no cloud provider to fulfill this request, so a `LoadBalancer`
Service typically sits with its `EXTERNAL-IP` stuck at `<pending>`
forever — this is expected locally, not a bug (the AKS track shows this
working for real, since Azure *does* provision one). For local access to
a `LoadBalancer` Service, minikube's `minikube tunnel` or kind's port
mappings are used as workarounds; in this track we mainly use
`port-forward` and NodePort for local access, and Ingress (module 08) for
the realistic pattern.

```
   the three Service types, by how far traffic can reach in:

   ClusterIP    [ inside cluster only ]
                   client Pod ──► ClusterIP ──► Pod

   NodePort     [ any node's IP : 30000-32767 ]
                   host ──► node:30080 ──► ClusterIP ──► Pod

   LoadBalancer [ external IP from cloud provider ]
                   internet ──► cloud LB ──► node ──► ClusterIP ──► Pod
                   (EXTERNAL-IP stays <pending> locally — no cloud LB)
```

**kube-proxy**, introduced in module 01, is what actually implements a
Service's routing on every node — it watches the API server for
Service/Endpoint changes and programs networking rules (iptables or
IPVS) so traffic to the Service's virtual IP gets transparently sent to
one of the healthy backing Pods.

**Only `Ready` Pods receive traffic.** This is the payoff of readiness
probes from module 02: a Pod that's `Running` but not yet `Ready` (or
that becomes not-`Ready`) is automatically excluded from a Service's
Endpoints, without needing to touch the Service at all.

## Command reference

| Command | What it does | Example |
|---|---|---|
| `kubectl expose deployment <name> --port=<p>` | Imperatively creates a Service for a Deployment | `kubectl expose deployment web --port=80` |
| `kubectl get services` | Lists Services, their type, cluster IP, and ports | `kubectl get svc` |
| `kubectl get endpoints <name>` | Shows which Pod IPs a Service currently routes to | `kubectl get endpoints web` |
| `kubectl describe service <name>` | Shows selector, endpoints, and ports in detail | `kubectl describe svc web` |
| `kubectl port-forward svc/<name> <local>:<svc>` | Forwards a local port to a Service | `kubectl port-forward svc/web 8080:80` |
| `kubectl run <name> --image=<img> -it --rm` | Quick disposable Pod, useful for testing DNS/connectivity from inside the cluster | `kubectl run test --image=busybox:1.36 -it --rm -- sh` |
| `spec.type` | Service type: `ClusterIP` (default), `NodePort`, `LoadBalancer`, `ExternalName` | `type: NodePort` |
| `spec.selector` | Labels a Pod must have to become an endpoint | `selector: {app: web}` |
| `spec.ports[].port` | Port the Service itself listens on | `port: 80` |
| `spec.ports[].targetPort` | Port on the Pod traffic is forwarded to | `targetPort: 80` |
| `spec.ports[].nodePort` | (NodePort type) fixed port opened on every node (30000-32767) | `nodePort: 30080` |

## Hands-on exercises

Continue in namespace `demo`. Recreate the `web` Deployment from module
03 if you deleted it:

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
          ports:
            - containerPort: 80
          resources:
            requests: {cpu: "50m", memory: "64Mi"}
            limits: {cpu: "200m", memory: "128Mi"}
```

```bash
kubectl apply -f deploy-web.yaml
```

### 1. Create a ClusterIP Service

```yaml
# svc-web.yaml
apiVersion: v1
kind: Service
metadata:
  name: web
spec:
  type: ClusterIP
  selector:
    app: web
  ports:
    - port: 80
      targetPort: 80
```

```bash
kubectl apply -f svc-web.yaml
kubectl get svc web
kubectl get endpoints web
```

Expected: `get svc` shows a `CLUSTER-IP` (no `EXTERNAL-IP`);
`get endpoints` lists 3 Pod IPs on port 80, matching your 3 Deployment
replicas.

### 2. Reach it from inside the cluster

```bash
kubectl run test --image=busybox:1.36 -it --rm -n demo -- sh
```

Inside that shell:

```sh
wget -qO- http://web
wget -qO- http://web.demo.svc.cluster.local
nslookup web
exit
```

Expected: nginx's HTML both times; `nslookup` resolves `web` to a
`ClusterIP` address — proof of cluster DNS working.

### 3. Reach it from your machine with port-forward

```bash
kubectl port-forward svc/web 8080:80
```

In another terminal:

```bash
curl localhost:8080
```

Expected: nginx HTML. Ctrl+C the port-forward when done.

### 4. Prove the Service tracks Pod churn automatically

```bash
kubectl get endpoints web
kubectl get pods -l app=web
kubectl delete pod <one-pod-name>
kubectl get endpoints web --watch
```

Expected: the deleted Pod's IP briefly disappears from Endpoints, a new
Pod is created (ReplicaSet self-heal, module 03), and once it passes any
readiness checks its new IP appears — no changes made to the Service
itself. Ctrl+C the watch.

### 5. NodePort

```yaml
# svc-web-nodeport.yaml
apiVersion: v1
kind: Service
metadata:
  name: web-nodeport
spec:
  type: NodePort
  selector:
    app: web
  ports:
    - port: 80
      targetPort: 80
      nodePort: 30080
```

```bash
kubectl apply -f svc-web-nodeport.yaml
kubectl get svc web-nodeport
```

Expected: `PORT(S)` column shows `80:30080/TCP`. Because kind runs nodes
as containers without automatically publishing arbitrary ports to your
host, reaching this from your WSL2 terminal directly typically requires
either a kind cluster config with `extraPortMappings`, or simply using
`kubectl port-forward svc/web-nodeport 8080:80` as a stand-in — do that
now and confirm it still works, and note *why* NodePort needs extra kind
configuration that a real cloud node wouldn't.

### 6. LoadBalancer (and why it stays pending locally)

```yaml
# svc-web-lb.yaml
apiVersion: v1
kind: Service
metadata:
  name: web-lb
spec:
  type: LoadBalancer
  selector:
    app: web
  ports:
    - port: 80
      targetPort: 80
```

```bash
kubectl apply -f svc-web-lb.yaml
kubectl get svc web-lb --watch
```

Expected: `EXTERNAL-IP` stays `<pending>` indefinitely — there's no
cloud controller locally to fulfill the request. Confirm this is
expected:

```bash
kubectl describe svc web-lb
```

You won't see an error, just no external IP ever assigned. Ctrl+C the
watch, then clean up:

```bash
kubectl delete svc web-lb web-nodeport
```

### 7. Multiple Services, one Deployment, different selectors

Add a second Deployment to see selector precision matter:

```yaml
# deploy-web-canary.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: web-canary
  labels:
    app: web
    track: canary
spec:
  replicas: 1
  selector:
    matchLabels:
      app: web
      track: canary
  template:
    metadata:
      labels:
        app: web
        track: canary
    spec:
      containers:
        - name: nginx
          image: nginx:1.28
          ports:
            - containerPort: 80
```

```bash
kubectl apply -f deploy-web-canary.yaml
kubectl get endpoints web
```

Expected: the `web` Service's endpoints now include all 4 Pods (3 stable
+ 1 canary) because its selector (`app: web`) matches both — a reminder
that selectors match on label sets, not on which Deployment "owns" a
Pod. Clean up the canary:

```bash
kubectl delete deployment web-canary
```

### 8. Diagnose and fix: Service with zero endpoints (selector mismatch)

```yaml
# svc-broken.yaml
apiVersion: v1
kind: Service
metadata:
  name: web-broken
spec:
  selector:
    app: webb
  ports:
    - port: 80
      targetPort: 80
```

```bash
kubectl apply -f svc-broken.yaml
kubectl get svc web-broken
kubectl get endpoints web-broken
```

Expected: the Service exists (`get svc` shows a ClusterIP), but
`get endpoints web-broken` shows `<none>` — a typo (`webb` vs `web`)
means it matches no Pods. Confirm with a port-forward attempt:

```bash
kubectl port-forward svc/web-broken 8081:80
```

In another terminal:

```bash
curl localhost:8081
```

Expected: `curl` hangs or errors — there is nowhere for the forwarded
traffic to go. Diagnose:

```bash
kubectl describe svc web-broken
```

Expected: `Endpoints: <none>` and a `Selector` line showing `app=webb` —
compare against your Deployment's actual Pod labels
(`kubectl get pods --show-labels -l app=web`) to spot the mismatch. Fix:

```bash
kubectl patch svc web-broken -p '{"spec":{"selector":{"app":"web"}}}'
kubectl get endpoints web-broken
```

Expected: endpoints populate immediately. Clean up:

```bash
kubectl delete svc web-broken
```

### 9. Diagnose and fix: targetPort mismatch

```yaml
# svc-wrong-port.yaml
apiVersion: v1
kind: Service
metadata:
  name: web-wrongport
spec:
  selector:
    app: web
  ports:
    - port: 80
      targetPort: 8080
```

```bash
kubectl apply -f svc-wrong-port.yaml
kubectl port-forward svc/web-wrongport 8082:80
```

In another terminal:

```bash
curl -m 5 localhost:8082
```

Expected: a timeout/connection reset — the Service has endpoints (Pods
match the selector fine), but it's forwarding to port 8080 inside the
Pod, while nginx only listens on 80. Diagnose:

```bash
kubectl get endpoints web-wrongport
kubectl describe svc web-wrongport
```

Expected: endpoints show `<pod-ip>:8080` — confirming traffic is being
sent to the wrong port inside otherwise-healthy Pods. Fix:

```bash
kubectl patch svc web-wrongport -p '{"spec":{"ports":[{"port":80,"targetPort":80}]}}'
curl -m 5 localhost:8082    # after restarting the port-forward
```

Clean up everything from this module:

```bash
kubectl delete svc web-wrongport web
kubectl delete deployment web
```

## Independent challenge

No YAML or commands given here — figure it out yourself using what you
know from this module and earlier ones.

**Task:** Run two independent Deployments in `demo` — call them `blue` and
`green` — each serving a different response, then create a single
ClusterIP Service whose selector currently routes only to `blue`. From a
throwaway Pod inside the cluster, confirm by DNS name that you reach only
`blue`. Now, without deleting or recreating the Service, cut over all its
traffic to `green` and re-confirm from inside the cluster that the same
DNS name now reaches only `green`. Explain to yourself why the Service's
virtual IP and DNS name never changed even though the backing Pods did.
This builds on the label-selector and Deployment mechanics from module 03.

<details>
<summary>Stuck? One hint</summary>

The cutover is a change to the Service's `spec.selector` (the labels are
the only thing binding it to Pods); verify which Pod IPs it currently
targets with `kubectl get endpoints <svc>` before and after.

</details>

## Common mistakes & troubleshooting

- **Selector typos or mismatches**: the single most common Service bug —
  the Service is created successfully (the API server doesn't validate
  that a selector matches anything), but routes nowhere. Always check
  `kubectl get endpoints <svc>` first when a Service "isn't working."
- **Confusing `port` and `targetPort`**: `port` is what clients (and
  other Pods) connect to on the Service; `targetPort` is what the
  container actually listens on. They can differ, and mixing them up
  sends traffic to a port nothing is listening on inside the Pod.
- **Expecting `LoadBalancer` to get an external IP locally**: it won't,
  without extra local tooling (`minikube tunnel`, or manual kind port
  mappings) — this is expected on kind/minikube, and is exactly the gap
  the AKS track fills in with a real cloud load balancer.
- **Forgetting readiness gates traffic**: a Pod that's `Running` but not
  `Ready` (module 02) is automatically excluded from `Endpoints` — if
  traffic "isn't reaching" some Pods, check their readiness state before
  assuming a Service bug.
- **Assuming Service DNS names are cluster-wide by default**: from a
  different namespace you need `<service>.<namespace>` (or the full
  `.svc.cluster.local` form); plain `<service>` only resolves within the
  same namespace.

## Checkpoint quiz

Write down your answer to each question before expanding it — checking without attempting first is the single easiest way to fool yourself into thinking you've learned this.

1. Why do Pods need a Service in front of them at all, given each Pod
   already has an IP?
2. How does a Service decide which Pods are its current endpoints?
3. What's the difference between `port` and `targetPort` on a Service?
4. Why does a `LoadBalancer` Service stay `<pending>` on a local
   kind cluster, and what would be different on AKS?
5. If `kubectl get endpoints <svc>` shows `<none>`, what are the two
   most likely causes to check first?
6. From a Pod in namespace `demo`, what DNS name reaches a Service named
   `api` running in namespace `billing`?
7. Does a Service route traffic to a Pod that's `Running` but failing
   its readiness probe?

<details>
<summary>Show answers</summary>

1. Pod IPs are not stable — Pods get replaced constantly (rollouts,
   self-healing, scaling) and each replacement gets a new IP. A Service
   provides one stable virtual IP/DNS name that always points at the
   currently-healthy set of Pods.
2. By continuously matching its `spec.selector` labels against Pod
   labels — any Pod with matching labels becomes an endpoint
   automatically.
3. `port` is the port the Service itself exposes (what clients connect
   to); `targetPort` is the port on the Pod/container the traffic is
   actually forwarded to.
4. Locally there's no cloud provider to provision a real load balancer,
   so the request just never gets fulfilled; on AKS, the Azure cloud
   controller provisions an actual Azure Load Balancer and populates
   `EXTERNAL-IP`.
5. A selector that doesn't match any Pod's labels (typo or mismatch), or
   the matching Pods not existing/not being scheduled yet.
6. `api.billing` (or the fully qualified `api.billing.svc.cluster.local`).
7. No — a Pod that fails its readiness probe is removed from the
   Service's Endpoints until it passes again, even though it's still
   `Running`.

</details>

## Further reading & sources

- [Service](https://kubernetes.io/docs/concepts/services-networking/service/) - the definitive reference for ClusterIP, NodePort, and LoadBalancer types.
- [DNS for Services and Pods](https://kubernetes.io/docs/concepts/services-networking/dns-pod-service/) - how the `<svc>.<ns>.svc.cluster.local` names resolve.
- [Connecting Applications with Services](https://kubernetes.io/docs/tutorials/services/connect-applications-service/) - a walkthrough tying Deployments, Services, and endpoints together.
- [Debug Services](https://kubernetes.io/docs/tasks/debug/debug-application/debug-service/) - the official checklist for the zero-endpoints and wrong-port bugs in this module.
- [Virtual IPs and Service Proxies (kube-proxy)](https://kubernetes.io/docs/reference/networking/virtual-ips/) - how kube-proxy programs the routing that makes a Service's virtual IP work.

## Next

[05-configmaps-and-secrets](../05-configmaps-and-secrets/README.md) — stop
hardcoding configuration and credentials into images and manifests, and
externalize them properly.
