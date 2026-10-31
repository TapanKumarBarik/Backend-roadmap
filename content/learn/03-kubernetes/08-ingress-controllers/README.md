# 08 - Ingress Controllers

## Why this matters

Module 04 showed you that `LoadBalancer` Services don't work locally
(no cloud provider to fulfill them) and that NodePort is clunky for real
HTTP routing. Real applications usually have many Services (frontend,
API, admin panel) that all need to be reachable over HTTP(S) from
outside the cluster, ideally through one entry point with proper
hostnames/paths — not one external IP per Service. Ingress is the object
that describes that routing, and an Ingress controller is what actually
implements it.

## Concepts

**An Ingress is a routing rule, not a running process.** It's a
Kubernetes object that says "requests for host X, path Y should go to
Service Z" — but on its own, an Ingress object does absolutely nothing.
It needs an **Ingress controller** — an actual running workload (Pods, a
Service, usually a reverse proxy like NGINX or Traefik) that watches
Ingress objects and configures itself to implement the rules they
describe. This is the same relationship as a Deployment's YAML
describing desired state and a controller reconciling it — except here
the "reconciliation" is programming a real HTTP proxy's routing table.

**Why this matters practically**: creating an Ingress object with no
Ingress controller installed does nothing — no error, just no effect,
because nothing is watching for it. This trips up nearly everyone the
first time; always confirm a controller is actually running before
debugging an Ingress object itself.

**Host-based and path-based routing**: an Ingress can route based on the
HTTP `Host` header (`app.example.com` → Service A, `api.example.com` →
Service B) and/or URL path (`/api` → Service B, `/` → Service A) — all
through one external entry point (one IP, one set of ports 80/443),
unlike giving every Service its own LoadBalancer.

```
                       one entry point (ports 80/443)
                                   │
   internet ──► Ingress controller (NGINX reverse proxy)
                                   │  reads Ingress rules, routes by
                                   │  Host header and/or URL path
              ┌────────────────────┼────────────────────┐
        Host: app.example.com   /api path          Host: admin.example.com
              ▼                    ▼                     ▼
        Service app          Service api           Service admin
              ▼                    ▼                     ▼
           Pods                  Pods                  Pods
```

**IngressClass** tells Kubernetes which controller should handle a given
Ingress, useful when a cluster has more than one controller installed.
Most single-controller setups (including what you'll install here) mark
one IngressClass as default, so you can often omit
`spec.ingressClassName` — but it's good practice to set it explicitly.

**On a local kind cluster, an Ingress controller's Service is typically
exposed via a `NodePort`-like mechanism configured at cluster-creation
time**, because — same as module 04's LoadBalancer problem — there's no
cloud load balancer to provision. The install steps below configure kind
itself to forward host ports 80/443 straight into the node, specifically
so the ingress-nginx controller running inside is reachable at
`localhost` without any extra port-forwarding.

**TLS termination**: an Ingress can also terminate HTTPS, referencing a
Secret (module 05!) holding a TLS certificate and key
(`kubernetes.io/tls` type) via `spec.tls`. The controller uses that
certificate to serve HTTPS and typically forwards plain HTTP to the
backend Service internally. This track sets up plain HTTP only, to keep
focus on routing concepts — TLS/cert-manager is a natural next step once
you reach a real domain in the AKS track.

## Command reference

| Command | What it does | Example |
|---|---|---|
| `kubectl get ingressclass` | Lists available IngressClasses | `kubectl get ingressclass` |
| `kubectl get ingress` | Lists Ingress objects and their hosts/addresses | `kubectl get ingress` |
| `kubectl describe ingress <name>` | Shows rules, backends, and events for an Ingress | `kubectl describe ingress web-ingress` |
| `spec.ingressClassName` | Which IngressClass/controller should implement this Ingress | `ingressClassName: nginx` |
| `spec.rules[].host` | Hostname this rule applies to | `host: app.local.test` |
| `spec.rules[].http.paths[].path` | URL path this rule matches | `path: /` |
| `spec.rules[].http.paths[].pathType` | How the path is matched: `Prefix`, `Exact`, `ImplementationSpecific` | `pathType: Prefix` |
| `spec.rules[].http.paths[].backend.service.name/port` | Which Service (and port) traffic is routed to | see exercises |
| `spec.tls[].hosts` / `spec.tls[].secretName` | Hosts covered by TLS, and the Secret holding the cert/key | see Concepts |
| `spec.defaultBackend` | Fallback backend for requests matching no rule | `defaultBackend: {service: {name: fallback, port: {number: 80}}}` |

## Hands-on exercises

### 1. Recreate a kind cluster configured for ingress

Ingress on kind needs the cluster created with specific port mappings and
a node label, so start fresh (this is safe — nothing critical lives on
your `learning` cluster):

```yaml
# kind-ingress.yaml
kind: Cluster
apiVersion: kind.x-k8s.io/v1alpha4
nodes:
  - role: control-plane
    kubeadmConfigPatches:
      - |
        kind: InitConfiguration
        nodeRegistration:
          kubeletExtraArgs:
            node-labels: "ingress-ready=true"
    extraPortMappings:
      - containerPort: 80
        hostPort: 80
        protocol: TCP
      - containerPort: 443
        hostPort: 443
        protocol: TCP
```

```bash
kind delete cluster --name learning
kind create cluster --name learning --config kind-ingress.yaml
kubectl cluster-info
kubectl create namespace demo
kubectl config set-context --current --namespace=demo
```

### 2. Install the ingress-nginx controller

```bash
kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/main/deploy/static/provider/kind/deploy.yaml
kubectl get pods -n ingress-nginx --watch
```

Expected: a `ingress-nginx-controller-...` Pod eventually reaches
`Running`/`1/1`. Ctrl+C once it does.

```bash
kubectl get ingressclass
```

Expected: an `nginx` IngressClass listed.

### 3. Deploy two simple apps to route between

```yaml
# apps-for-ingress.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: app-one
spec:
  replicas: 1
  selector:
    matchLabels: {app: app-one}
  template:
    metadata:
      labels: {app: app-one}
    spec:
      containers:
        - name: app
          image: hashicorp/http-echo:1.0
          args: ["-text=response from app-one", "-listen=:5678"]
          ports: [{containerPort: 5678}]
---
apiVersion: v1
kind: Service
metadata:
  name: app-one
spec:
  selector: {app: app-one}
  ports: [{port: 80, targetPort: 5678}]
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: app-two
spec:
  replicas: 1
  selector:
    matchLabels: {app: app-two}
  template:
    metadata:
      labels: {app: app-two}
    spec:
      containers:
        - name: app
          image: hashicorp/http-echo:1.0
          args: ["-text=response from app-two", "-listen=:5678"]
          ports: [{containerPort: 5678}]
---
apiVersion: v1
kind: Service
metadata:
  name: app-two
spec:
  selector: {app: app-two}
  ports: [{port: 80, targetPort: 5678}]
```

```bash
kubectl apply -f apps-for-ingress.yaml
kubectl get pods,svc
```

Expected: both Deployments `1/1` Running, both Services with endpoints.

### 4. Path-based routing

```yaml
# ingress-path.yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: path-ingress
  annotations:
    nginx.ingress.kubernetes.io/rewrite-target: /
spec:
  ingressClassName: nginx
  rules:
    - http:
        paths:
          - path: /one
            pathType: Prefix
            backend:
              service:
                name: app-one
                port:
                  number: 80
          - path: /two
            pathType: Prefix
            backend:
              service:
                name: app-two
                port:
                  number: 80
```

```bash
kubectl apply -f ingress-path.yaml
kubectl get ingress path-ingress
curl localhost/one
curl localhost/two
```

Expected: `response from app-one` and `response from app-two`
respectively, both through plain `localhost` — one entry point, two
backends, routed by path.

### 5. Host-based routing

```yaml
# ingress-host.yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: host-ingress
spec:
  ingressClassName: nginx
  rules:
    - host: one.local.test
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: app-one
                port: {number: 80}
    - host: two.local.test
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: app-two
                port: {number: 80}
```

```bash
kubectl apply -f ingress-host.yaml
curl --resolve one.local.test:80:127.0.0.1 http://one.local.test/
curl --resolve two.local.test:80:127.0.0.1 http://two.local.test/
```

Expected: `response from app-one` and `response from app-two`
respectively — `--resolve` fakes DNS for the test without editing
`/etc/hosts`. (In a real setup you'd add entries to `/etc/hosts` or use
real DNS instead.)

### 6. Inspect what the controller is doing

```bash
kubectl describe ingress host-ingress
```

Expected: a `Rules` section listing both hosts, their paths, and backend
Service:port — this is the routing table the controller derived from
your Ingress object.

### 7. Default backend for unmatched requests

```bash
curl localhost/nowhere
```

Expected: nginx's own default 404 page (no Ingress rule matches
`/nowhere` on the default host). Optionally add a `defaultBackend` to one
Ingress pointing at `app-one` and confirm unmatched requests now return
`response from app-one` instead of a 404 — then remove it again if you
don't want that behavior.

### 8. Diagnose and fix: Ingress created but nothing routes (no controller)

Simulate the most common Ingress mistake by targeting a controller that
doesn't exist:

```yaml
# ingress-noclass.yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: broken-ingress
spec:
  ingressClassName: traefik
  rules:
    - http:
        paths:
          - path: /broken
            pathType: Prefix
            backend:
              service:
                name: app-one
                port: {number: 80}
```

```bash
kubectl apply -f ingress-noclass.yaml
kubectl get ingress broken-ingress
curl localhost/broken
```

Expected: the Ingress object is created successfully (no error!), but
`curl` gets a 404 from the nginx controller — because this Ingress
specifies `ingressClassName: traefik`, and no Traefik controller is
installed, so *no* controller is implementing this particular Ingress's
rules; ingress-nginx correctly ignores it. Diagnose:

```bash
kubectl get ingressclass
kubectl describe ingress broken-ingress
```

Expected: `get ingressclass` shows only `nginx` exists, confirming
`traefik` isn't a valid/installed class. Fix:

```bash
kubectl patch ingress broken-ingress --type=merge -p '{"spec":{"ingressClassName":"nginx"}}'
curl localhost/broken
```

Expected: `response from app-one`.

### 9. Diagnose and fix: Ingress pointing at the wrong Service port

```yaml
# ingress-wrongport.yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: wrongport-ingress
spec:
  ingressClassName: nginx
  rules:
    - http:
        paths:
          - path: /wrongport
            pathType: Prefix
            backend:
              service:
                name: app-one
                port:
                  number: 5678
```

```bash
kubectl apply -f ingress-wrongport.yaml
curl localhost/wrongport
```

Expected: a `503 Service Temporarily Unavailable` from nginx — the
Ingress references port `5678` on the `app-one` **Service**, but that
Service only exposes port `80` (which maps to `targetPort: 5678` on the
Pod). Diagnose:

```bash
kubectl get svc app-one
kubectl describe ingress wrongport-ingress
```

Expected: `get svc` shows `PORT(S): 80/TCP` — confirming 5678 isn't a
port the Service itself listens on. Fix:

```bash
kubectl patch ingress wrongport-ingress --type=json -p '[{"op":"replace","path":"/spec/rules/0/http/paths/0/backend/service/port/number","value":80}]'
curl localhost/wrongport
```

Expected: `response from app-one`.

### 10. Clean up

```bash
kubectl delete ingress path-ingress host-ingress broken-ingress wrongport-ingress
kubectl delete deployment app-one app-two
kubectl delete svc app-one app-two
```

## Independent challenge

No YAML or commands given here — figure it out yourself using what you
know from this module and earlier ones.

**Task:** With the ingress-nginx controller running on your kind cluster,
expose two different backend applications through a single entry point so
that `shop.local.test/` reaches one app and `shop.local.test/admin`
reaches the other — same host, two paths — and confirm both from your
machine without editing `/etc/hosts`. Each backend should be a Deployment
with its own Service (the Ingress must target the Service's port, not the
container's). Then break it on purpose by pointing one path's backend at a
port the Service doesn't expose, observe the exact HTTP status the
controller returns, and fix it. This combines this module's routing with
Deployments (module 03) and Service port mechanics (module 04).

<details>
<summary>Stuck? One hint</summary>

One Ingress with a single `host` and two `paths` (each `pathType: Prefix`)
does the routing; `curl --resolve shop.local.test:80:127.0.0.1 ...` fakes
DNS, and a wrong backend port surfaces as a `503` because the Ingress
backend port refers to the Service's `port`.

</details>

## Common mistakes & troubleshooting

- **Creating an Ingress with no controller installed**: the object is
  accepted with no error, but nothing routes — always confirm
  `kubectl get pods -n ingress-nginx` (or your controller's namespace)
  shows a running controller before debugging the Ingress object itself.
- **`ingressClassName` referencing a controller that isn't installed**:
  same silent-no-effect failure mode as above, just per-object instead of
  cluster-wide — `kubectl get ingressclass` to confirm what actually
  exists.
- **Ingress backend port confusion**: the Ingress backend port refers to
  the **Service's** port (`spec.ports[].port`), not the Pod's
  `targetPort` or `containerPort` — mixing these up gives a `503` even
  though the Service itself works fine via `kubectl port-forward`.
- **Forgetting `pathType`**: omitting it is rejected by newer clusters;
  `Prefix` (matches by path segment) and `Exact` (exact match only)
  behave differently for trailing content — test with `curl` rather than
  assuming.
- **Expecting Ingress to work without the kind port-mapping setup**: on a
  plain `kind create cluster` (no `extraPortMappings`), the
  ingress-nginx controller's Service has no path from your host machine
  to it — this is why exercise 1 recreated the cluster with a dedicated
  config.

## Checkpoint quiz

Write down your answer to each question before expanding it — checking without attempting first is the single easiest way to fool yourself into thinking you've learned this.

1. What's the difference between an Ingress object and an Ingress
   controller?
2. Why did creating `broken-ingress` (exercise 8) produce no error at
   all, despite doing nothing?
3. What two ways can an Ingress route requests to different backends?
4. In exercise 9, why did the request get a 503 even though the `app-one`
   Service and Pod were both healthy?
5. Why did the kind cluster need to be recreated with a custom config
   before Ingress worked at all?
6. What object type does an Ingress's `spec.tls[].secretName` reference,
   and what's inside it?

<details>
<summary>Show answers</summary>

1. An Ingress is just a declarative routing rule (an object stored via
   the API server, like everything else); an Ingress controller is an
   actual running workload that watches Ingress objects and configures a
   real proxy to implement their rules — without a controller, an
   Ingress object has no effect.
2. Kubernetes validates the Ingress object's schema, not whether the
   `ingressClassName` it references corresponds to an installed,
   running controller — an Ingress for a nonexistent/uninstalled class
   is simply never picked up by anything, silently.
3. Host-based routing (matching the HTTP `Host` header) and path-based
   routing (matching the URL path).
4. The Ingress's backend port (5678) didn't match any port the `app-one`
   **Service** actually exposes (only 80) — the backend port field
   refers to the Service's port, not the Pod's container port.
5. Ingress-nginx's Service needs a path from the host machine into the
   cluster; on a local kind cluster there's no cloud load balancer to
   provide that automatically, so the cluster must be created with
   explicit `extraPortMappings` (and the `ingress-ready` node label) so
   host ports 80/443 reach the controller.
6. A Secret of type `kubernetes.io/tls`, holding a TLS certificate and
   private key.

</details>

## Further reading & sources

- [Ingress](https://kubernetes.io/docs/concepts/services-networking/ingress/) - the concept page for routing rules, hosts, paths, and pathType.
- [Ingress Controllers](https://kubernetes.io/docs/concepts/services-networking/ingress-controllers/) - why an Ingress needs a running controller to do anything.
- [ingress-nginx on kind](https://kind.sigs.k8s.io/docs/user/ingress/) - the exact kind port-mapping setup this module uses to reach the controller.
- [ingress-nginx documentation](https://kubernetes.github.io/ingress-nginx/) - the controller's own docs, including annotations like rewrite-target.
- [DigitalOcean: Kubernetes Ingress with nginx](https://www.digitalocean.com/community/tutorials/how-to-set-up-an-nginx-ingress-on-digitalocean-kubernetes-using-helm) - a well-known end-to-end ingress tutorial for extra practice.

## Next

[09-scaling-hpa-and-vpa](../09-scaling-hpa-and-vpa/README.md) — now that
traffic can reach your app through one entry point, learn to scale the
number of Pods (and their resource allocations) automatically based on
load.
