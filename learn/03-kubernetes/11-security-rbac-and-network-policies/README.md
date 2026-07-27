# 11 - Security: RBAC and Network Policies

## Why this matters

Every exercise so far has run as a fully-privileged user against your own
learning cluster. Real clusters are shared — multiple teams, CI
pipelines, and applications all need access restricted to exactly what
they require, and Pods themselves shouldn't be able to talk to every
other Pod in the cluster by default just because the network technically
allows it. RBAC controls *who can do what* through the API server;
NetworkPolicy controls *which Pods can talk to which* over the network.
Together they're the foundation of "least privilege" in Kubernetes,
directly carried into the AKS track's Azure AD/managed-identity
integration.

## Concepts

**RBAC (Role-Based Access Control) governs every request that reaches
the API server** — recall from module 01 that the API server is the
single front door to everything; RBAC is the gate on that door. Every
`kubectl` command, every controller action, every Pod using a
ServiceAccount token to call the API is checked against RBAC rules
before it's allowed to proceed.

**Four RBAC object types, and how they compose**:
- A **Role** lists a set of permissions (verbs like `get`, `list`,
  `create`, `delete` on specific resource types like `pods`,
  `configmaps`) scoped to *one namespace*.
- A **ClusterRole** is the same idea but scoped cluster-wide (or usable
  for cluster-scoped resources like Nodes, which have no namespace at
  all).
- A **RoleBinding** grants a Role (or a ClusterRole, used in a
  namespaced way) to a specific subject (a user, group, or
  ServiceAccount) *within one namespace*.
- A **ClusterRoleBinding** grants a ClusterRole to a subject cluster-wide,
  across every namespace.

The mental model: a Role/ClusterRole is a *permission set* (a definition,
reusable); a RoleBinding/ClusterRoleBinding is what actually *grants* it
to someone. Defining a Role with no binding grants nobody anything — it's
inert until bound, the same way an Ingress object does nothing without a
controller (module 08) — a recurring Kubernetes pattern of "definition"
objects that are inert until something else activates them.

```
   permission set              the grant              the identity
   ┌──────────────┐        ┌───────────────┐      ┌────────────────┐
   │    Role      │◄───────│  RoleBinding  │─────►│ ServiceAccount │
   │ (verbs on    │ roleRef│  (connects the │subject│  (or user/    │
   │  resources)  │        │   two)         │      │   group)       │
   └──────────────┘        └───────────────┘      └───────┬────────┘
        Role alone grants NOTHING                          │ Pod runs as
        until a binding attaches it                        ▼
   ClusterRole + ClusterRoleBinding = same, but cluster-wide / cluster-scoped
```

**A ServiceAccount is an identity for a process, not a person** — every
Pod runs as some ServiceAccount (a default one, unless you specify
otherwise), and any code inside that Pod calling the Kubernetes API
(e.g. a controller watching resources) authenticates as that
ServiceAccount, subject to whatever RBAC bindings apply to it. This is
how you grant a specific application exactly the API permissions it
needs (e.g. "read ConfigMaps in this namespace") without handing it your
own full `kubectl` access.

**RBAC is additive-only and deny-by-default**: there is no "deny" rule —
access not explicitly granted by some Role/binding is simply refused. You
build up permissions by adding bindings; you cannot "subtract" access
with a more specific deny rule the way some other systems allow.

**NetworkPolicy governs traffic between Pods, not API access.** By
default, with no NetworkPolicy objects at all, every Pod can reach every
other Pod in the cluster over the network — Kubernetes networking is
fully open unless you restrict it. A NetworkPolicy selects Pods (by
label, the same selector pattern from Services and Deployments) and
defines allowed ingress (incoming) and/or egress (outgoing) traffic
rules; once *any* NetworkPolicy selects a given Pod for a given direction
(ingress or egress), that direction becomes deny-by-default for that Pod
except for what's explicitly allowed — an important asymmetry to
internalize: adding a policy can only *restrict* previously-open traffic,
never grant new traffic beyond what's listed.

```
   NO policy selects backend        policy selects backend (ingress)
   (default: open)                  (deny-by-default for that direction)

   frontend ──►┐                    frontend (app=frontend) ──► allowed
   other    ──►│ backend            other    ──────────────────► blocked
   anything ──►┘  (all reach it)    internet ─────────────────► blocked
                                    only sources listed in `from` get in
```

**NetworkPolicy requires a CNI plugin that implements it** — like
Ingress needing a controller (module 08) or HPA needing metrics-server
(module 09), a NetworkPolicy object with no enforcing CNI does nothing at
all, silently. Kind's default CNI does not enforce NetworkPolicy out of
the box, so this module's exercises install Calico specifically to make
policies actually take effect — without it, every exercise below would
apply successfully to the API but have zero real effect on traffic.

## Command reference

| Command | What it does | Example |
|---|---|---|
| `kubectl create serviceaccount <name>` | Creates a ServiceAccount | `kubectl create sa ci-bot` |
| `kubectl create role <name> --verb=<v> --resource=<r>` | Creates a namespaced Role | `kubectl create role pod-reader --verb=get,list --resource=pods` |
| `kubectl create rolebinding <name> --role=<r> --serviceaccount=<ns:sa>` | Binds a Role to a subject in a namespace | `kubectl create rolebinding read-pods --role=pod-reader --serviceaccount=demo:ci-bot` |
| `kubectl create clusterrole <name> --verb=<v> --resource=<r>` | Creates a cluster-scoped Role | `kubectl create clusterrole node-reader --verb=get,list --resource=nodes` |
| `kubectl create clusterrolebinding <name> --clusterrole=<r> --serviceaccount=<ns:sa>` | Binds a ClusterRole cluster-wide | `kubectl create clusterrolebinding read-nodes --clusterrole=node-reader --serviceaccount=demo:ci-bot` |
| `kubectl auth can-i <verb> <resource>` | Checks if the current user can do something | `kubectl auth can-i delete pods` |
| `kubectl auth can-i <verb> <resource> --as=system:serviceaccount:<ns>:<sa>` | Checks permissions as a specific ServiceAccount | `kubectl auth can-i list pods --as=system:serviceaccount:demo:ci-bot` |
| `kubectl get roles` / `rolebindings` / `clusterroles` / `clusterrolebindings` | Lists each RBAC object type | `kubectl get rolebindings -n demo` |
| `kubectl describe role/rolebinding <name>` | Shows rule/binding details | `kubectl describe role pod-reader` |
| `spec.podSelector` | Which Pods a NetworkPolicy applies to | `podSelector: {matchLabels: {app: backend}}` |
| `spec.policyTypes` | Whether the policy governs `Ingress`, `Egress`, or both | `policyTypes: [Ingress]` |
| `spec.ingress[].from` | Allowed sources for incoming traffic | see exercises |
| `spec.egress[].to` | Allowed destinations for outgoing traffic | see exercises |

## Hands-on exercises

### 1. Check your own current permissions

```bash
kubectl auth can-i create deployments -n demo
kubectl auth can-i delete nodes
```

Expected: `yes` and `yes` — as the cluster admin (the default kind
kubeconfig user), you can do essentially everything, which is exactly why
real clusters restrict other identities more tightly than this.

### 2. Create a restricted ServiceAccount and Role

```bash
kubectl create namespace demo --dry-run=client -o yaml | kubectl apply -f -
kubectl create serviceaccount ci-bot -n demo
```

```yaml
# role-pod-reader.yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: pod-reader
  namespace: demo
rules:
  - apiGroups: [""]
    resources: ["pods"]
    verbs: ["get", "list", "watch"]
```

```yaml
# rolebinding-pod-reader.yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: ci-bot-read-pods
  namespace: demo
subjects:
  - kind: ServiceAccount
    name: ci-bot
    namespace: demo
roleRef:
  kind: Role
  name: pod-reader
  apiGroup: rbac.authorization.k8s.io
```

```bash
kubectl apply -f role-pod-reader.yaml -f rolebinding-pod-reader.yaml
```

### 3. Verify the ServiceAccount's exact permissions

```bash
kubectl auth can-i list pods -n demo --as=system:serviceaccount:demo:ci-bot
kubectl auth can-i delete pods -n demo --as=system:serviceaccount:demo:ci-bot
kubectl auth can-i list pods -n kube-system --as=system:serviceaccount:demo:ci-bot
```

Expected: `yes`, `no`, `no` — it can read Pods only in `demo`, cannot
delete anything, and has zero access outside its own namespace. This is
RBAC's deny-by-default in action: nothing was explicitly denied, it's
just that nothing granted these.

### 4. Use the ServiceAccount from an actual Pod

```yaml
# pod-as-cibot.yaml
apiVersion: v1
kind: Pod
metadata:
  name: cibot-test
  namespace: demo
spec:
  serviceAccountName: ci-bot
  containers:
    - name: kubectl
      image: bitnami/kubectl:latest
      command: ["sh", "-c", "sleep 3600"]
```

```bash
kubectl apply -f pod-as-cibot.yaml
kubectl exec -it cibot-test -n demo -- kubectl get pods
kubectl exec -it cibot-test -n demo -- kubectl get configmaps
```

Expected: the first command lists Pods successfully (the Role grants
it); the second fails with a `Forbidden` error — the Role only granted
`pods`, not `configmaps`. This is exactly how a real application's
in-cluster API access is scoped: through the ServiceAccount attached to
its Pod, not your own kubeconfig identity.

### 5. ClusterRole and ClusterRoleBinding

```yaml
# clusterrole-node-reader.yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: node-reader
rules:
  - apiGroups: [""]
    resources: ["nodes"]
    verbs: ["get", "list"]
```

```yaml
# clusterrolebinding-node-reader.yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRoleBinding
metadata:
  name: ci-bot-read-nodes
subjects:
  - kind: ServiceAccount
    name: ci-bot
    namespace: demo
roleRef:
  kind: ClusterRole
  name: node-reader
  apiGroup: rbac.authorization.k8s.io
```

```bash
kubectl apply -f clusterrole-node-reader.yaml -f clusterrolebinding-node-reader.yaml
kubectl exec -it cibot-test -n demo -- kubectl get nodes
```

Expected: succeeds now — Nodes are cluster-scoped (no namespace), so
granting access to them required a ClusterRole + ClusterRoleBinding, a
plain Role could never have covered them.

### 6. Install a NetworkPolicy-enforcing CNI (Calico) on kind

NetworkPolicy needs a fresh cluster created *without* kindnet (kind's
default CNI, which doesn't enforce policies):

```yaml
# kind-calico.yaml
kind: Cluster
apiVersion: kind.x-k8s.io/v1alpha4
networking:
  disableDefaultCNI: true
  podSubnet: 192.168.0.0/16
nodes:
  - role: control-plane
```

```bash
kind delete cluster --name learning
kind create cluster --name learning --config kind-calico.yaml
kubectl apply -f https://raw.githubusercontent.com/projectcalico/calico/v3.28.0/manifests/calico.yaml
kubectl get pods -n calico-system --watch
```

Expected: Calico's Pods eventually reach `Running`. Ctrl+C once
confirmed. Recreate your namespace and workloads:

```bash
kubectl create namespace demo
kubectl config set-context --current --namespace=demo
```

### 7. Default-open networking, confirmed

```yaml
# deploy-frontend-backend.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: backend
spec:
  replicas: 1
  selector: {matchLabels: {app: backend}}
  template:
    metadata: {labels: {app: backend}}
    spec:
      containers:
        - name: app
          image: hashicorp/http-echo:1.0
          args: ["-text=backend response", "-listen=:5678"]
---
apiVersion: v1
kind: Service
metadata:
  name: backend
spec:
  selector: {app: backend}
  ports: [{port: 80, targetPort: 5678}]
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: frontend
spec:
  replicas: 1
  selector: {matchLabels: {app: frontend}}
  template:
    metadata: {labels: {app: frontend}}
    spec:
      containers:
        - name: app
          image: busybox:1.36
          command: ["sh", "-c", "sleep 3600"]
```

```bash
kubectl apply -f deploy-frontend-backend.yaml
kubectl exec -it deployment/frontend -- wget -qO- --timeout=3 http://backend
```

Expected: `backend response` — proving frontend can reach backend with
zero NetworkPolicy objects in place, exactly as Concepts described.

### 8. Restrict backend to only accept traffic from frontend

```yaml
# netpol-backend-allow-frontend.yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: backend-allow-frontend
spec:
  podSelector:
    matchLabels: {app: backend}
  policyTypes: [Ingress]
  ingress:
    - from:
        - podSelector:
            matchLabels: {app: frontend}
      ports:
        - port: 5678
```

```bash
kubectl apply -f netpol-backend-allow-frontend.yaml
kubectl exec -it deployment/frontend -- wget -qO- --timeout=3 http://backend
```

Expected: still `backend response` — frontend is explicitly allowed.

### 9. Confirm the policy actually blocks everyone else

```bash
kubectl run other --image=busybox:1.36 --restart=Never -- sh -c "sleep 3600"
kubectl exec -it other -- wget -qO- --timeout=3 http://backend
```

Expected: this one times out — `other` has no matching label
(`app: frontend`), so it's blocked, while `frontend` still works. This is
the "deny-by-default once selected" behavior from Concepts made
concrete: adding the policy didn't just add an allow rule, it flipped
`backend`'s ingress to deny-everything-except-what's-listed.

### 10. Diagnose and fix: NetworkPolicy that blocks more than intended

```yaml
# netpol-too-strict.yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: backend-too-strict
spec:
  podSelector:
    matchLabels: {app: backend}
  policyTypes: [Ingress]
  ingress:
    - from:
        - podSelector:
            matchLabels: {app: frontendd}
      ports:
        - port: 5678
```

(note the deliberate typo: `frontendd`)

```bash
kubectl delete networkpolicy backend-allow-frontend
kubectl apply -f netpol-too-strict.yaml
kubectl exec -it deployment/frontend -- wget -qO- --timeout=3 http://backend
```

Expected: this now times out too — even the legitimate frontend is
blocked, because the policy's `podSelector` under `from` has a typo and
matches nothing. Diagnose:

```bash
kubectl describe networkpolicy backend-too-strict
kubectl get pods --show-labels
```

Expected: `describe` shows the ingress rule's selector as
`app=frontendd`; comparing against `get pods --show-labels` shows the
real label is `app=frontend` — a mismatch, same class of bug as module
04's Service selector mismatch, just applied to network policy instead
of routing. Fix:

```bash
kubectl delete networkpolicy backend-too-strict
kubectl apply -f netpol-backend-allow-frontend.yaml
kubectl exec -it deployment/frontend -- wget -qO- --timeout=3 http://backend
```

Expected: `backend response` again. Clean up:

```bash
kubectl delete networkpolicy backend-allow-frontend
kubectl delete pod other cibot-test
kubectl delete deployment backend frontend
kubectl delete svc backend
kubectl delete clusterrolebinding ci-bot-read-nodes
kubectl delete clusterrole node-reader
kubectl delete rolebinding ci-bot-read-pods -n demo
kubectl delete role pod-reader -n demo
kubectl delete serviceaccount ci-bot -n demo
```

## Independent challenge

No YAML or commands given here — figure it out yourself using what you
know from this module and earlier ones.

**Task:** On a Calico-enabled kind cluster, deploy a two-tier app — a
`backend` Deployment/Service and a `frontend` Deployment — and enforce two
independent least-privilege controls. First, on the network side: lock the
backend down so it accepts traffic *only* from the frontend's Pods, then
prove both that the frontend still reaches it and that an unrelated Pod
cannot. Second, on the API side: give the frontend a dedicated
ServiceAccount that is allowed to `get`/`list` Pods in its own namespace
but nothing else, and prove from inside a Pod running as that account that
it can list Pods but is `Forbidden` from reading Secrets. This combines
this module's NetworkPolicy and RBAC with Deployments/Services (modules
03/04).

<details>
<summary>Stuck? One hint</summary>

The NetworkPolicy uses a `podSelector` for `backend` plus an `ingress
.from.podSelector` matching the frontend's labels; for the API side, a
Role + RoleBinding on a ServiceAccount, verified with `kubectl auth can-i
... --as=system:serviceaccount:<ns>:<sa>` and by `kubectl exec` into a Pod
whose `serviceAccountName` is set.

</details>

## Common mistakes & troubleshooting

- **Creating a Role/ClusterRole with no binding**: grants nobody
  anything — it's inert until a RoleBinding/ClusterRoleBinding actually
  attaches it to a subject. If a ServiceAccount "still can't do X" after
  creating a Role, check the binding exists and references the right
  subject/namespace.
- **Using a Role when you needed a ClusterRole**: Roles can't grant
  access to cluster-scoped resources (Nodes, Namespaces themselves,
  PersistentVolumes) at all — that always requires a ClusterRole (bound
  either cluster-wide or, via a RoleBinding referencing a ClusterRole,
  scoped to one namespace).
- **Assuming NetworkPolicy objects do anything without an enforcing
  CNI**: exactly like an Ingress with no controller (module 08), a
  NetworkPolicy applies successfully to the API but has zero real
  traffic effect if the cluster's CNI doesn't implement policy
  enforcement — confirm your CNI supports it before trusting any policy
  is actually protecting anything.
- **Label typos in a NetworkPolicy's selectors**: identical failure mode
  to Service/Deployment selector typos throughout this track, but the
  consequence is scarier — a typo can silently block legitimate traffic
  instead of just failing to route it, as shown in exercise 10.
- **Forgetting NetworkPolicy's deny-by-default-once-selected behavior**:
  adding *any* ingress policy to a Pod removes its previous "open to
  everyone" default for that direction — if you only intended to add one
  more allowed source, forgetting this can silently break traffic you
  didn't mean to touch.
- **Testing with `kubectl auth can-i` as yourself instead of `--as`**:
  without `--as=system:serviceaccount:<ns>:<sa>`, you're always checking
  your own (likely admin) permissions, not the identity you actually
  care about.

## Checkpoint quiz

Write down your answer to each question before expanding it — checking without attempting first is the single easiest way to fool yourself into thinking you've learned this.

1. What's the difference between a Role and a RoleBinding — which one
   actually grants access?
2. When must you use a ClusterRole instead of a Role, even if you only
   care about resources in one namespace?
3. What does RBAC do when no rule matches a given request — allow, deny,
   or ask?
4. By default, with zero NetworkPolicy objects in the cluster, can any
   Pod reach any other Pod?
5. What happens to a Pod's network traffic the moment *any* NetworkPolicy
   selects it for ingress — does it only add the specified allow rule, or
   does something else change too?
6. Why did every exercise in this module's NetworkPolicy section require
   recreating the kind cluster with a different config?
7. In exercise 10, why did even the legitimate frontend traffic get
   blocked, when the intent was only to restrict `other`?

<details>
<summary>Show answers</summary>

1. A Role defines a set of permissions (a reusable definition); a
   RoleBinding is what actually grants that Role to a specific subject
   (user, group, or ServiceAccount) — only the binding grants anything,
   the Role alone is inert.
2. When the resource is cluster-scoped (has no namespace) — e.g. Nodes,
   Namespaces, PersistentVolumes — a plain Role can never grant access
   to those regardless of binding, only a ClusterRole can.
3. Deny — RBAC has no explicit deny rule; anything not explicitly
   granted by some matching Role/ClusterRole and binding is refused by
   default.
4. Yes — Kubernetes networking is fully open between Pods by default
   until a NetworkPolicy restricts it.
5. Both: the specified traffic becomes allowed, *and* that Pod's ingress
   (or egress, per policyType) becomes deny-by-default for everything
   else not explicitly listed by some policy selecting it — it's not
   purely additive.
6. Kind's default CNI (kindnet) does not enforce NetworkPolicy at all —
   a NetworkPolicy-enforcing CNI (Calico) had to be installed instead,
   which for kind means creating the cluster with the default CNI
   disabled from the start.
7. The policy's ingress rule selector had a typo (`app: frontendd`
   instead of `app: frontend`), so it matched no real Pods — once any
   policy selects `backend` for ingress, only what its rules explicitly
   allow gets through, and a broken selector means the intended legitimate
   traffic also gets blocked, not just the unintended traffic.

</details>

## Cumulative review

Closed-book. Don't reopen earlier modules while attempting these — the
point is to find out what actually stuck.

1. Ingress (module 08), NetworkPolicy (module 11), and HPA (module 09)
   each depend on something being installed in the cluster before the
   object you write has any effect. Name what each one needs, and describe
   the identical failure symptom all three share when that dependency is
   missing.
2. You add a NetworkPolicy that locks a `backend` Pod's ingress to only
   the `frontend` Pods, and simultaneously the backend is fronted by an
   Ingress for external users. Explain why external HTTP traffic through
   the Ingress could suddenly stop, and what the policy would need to also
   allow.
3. An HPA scales a Deployment from 2 to 8 Pods under load. Explain how the
   Service in front of it (module 04) and any Ingress routing to that
   Service (module 08) both keep working across the scale-up without you
   touching either object.
4. A backend Pod that a NetworkPolicy is supposed to allow traffic to is
   unreachable, and its logs across all replicas show nothing useful. Give
   the ordered set of checks you'd run drawing on module 10 (aggregated
   logs / events), module 11 (policy selector), and module 04 (Service
   endpoints) to isolate whether it's a policy bug, a routing bug, or an
   app bug.
5. You grant a ServiceAccount a Role to `get`/`list` Pods in `demo`, and a
   Pod runs as that account. The Pod also needs to read cluster-wide Node
   metrics. Why does the Role fall short, and what RBAC objects (module
   11) plus what add-on (module 09) are both required for that to work?
6. A NetworkPolicy label typo (`app: frontendd`) and a Service selector
   typo (`app: webb`) produce different-feeling but structurally identical
   failures. Describe what each one silently breaks, and why "the object
   was created with no error" is true in both cases.
7. Your HPA is stuck at `<unknown>` targets and, separately, your
   `kubectl top pods` returns an error. Explain how these two symptoms can
   share a single root cause, and one they might not.
8. You want to observe (module 10) whether a NetworkPolicy is actually
   blocking traffic versus the backend simply being down. Which
   observability signals (logs, events, `kubectl top`, a test Pod's
   connection result) actually distinguish "blocked by policy" from
   "backend crashed," and which would mislead you?
9. RBAC is deny-by-default-and-additive (module 11); NetworkPolicy is
   open-by-default-until-selected (module 11); an Ingress with no matching
   controller is silently ignored (module 08). For a Pod that should be
   reachable only by one peer and whose ServiceAccount should read only
   ConfigMaps, state which default each control starts from and therefore
   what you must explicitly write for each.
10. You deploy the Prometheus/Grafana stack (module 10) into its own
    namespace and then apply a default-deny-ingress NetworkPolicy in the
    application namespace. Explain whether metrics scraping of your app
    Pods could break, and what the policy would need to permit for
    cross-namespace scraping to still work.

<details>
<summary>Show answers</summary>

1. Ingress needs an Ingress controller running; NetworkPolicy needs a CNI
   that enforces policy (e.g. Calico); HPA needs metrics-server. In all
   three, the object you create is accepted by the API server with no
   error but has zero real effect — a silent no-op — because nothing is
   present to act on it.
2. Once any ingress policy selects the backend, its ingress becomes
   deny-by-default except what's listed — and the Ingress controller's
   Pods are not the `frontend` Pods, so their forwarded traffic is now
   blocked. The policy would need to also allow ingress from the
   ingress-nginx controller's Pods (by their namespace/labels).
3. The Service continuously tracks endpoints by label selector, so each
   new HPA-created Pod automatically becomes an endpoint once `Ready`; the
   Ingress routes to the Service (by name/port), not to Pods, so it never
   needs updating. Both adjust to the changed Pod set on their own.
4. Aggregate logs and events first (`kubectl logs -l <label>
   --all-containers`, `kubectl get events`) to see if the app is even
   starting/crashing; check `kubectl get endpoints <svc>` to confirm the
   Service has healthy backends (module 04) — `<none>` points at a
   selector/readiness problem, not the policy; then compare the
   NetworkPolicy's `from` selector against the real Pod labels
   (`kubectl get pods --show-labels`) to spot a policy typo. App logs
   clean + endpoints populated + a test Pod timing out points at the
   policy.
5. Nodes are cluster-scoped (no namespace), so a namespaced Role can never
   grant access to them — you need a ClusterRole plus a
   ClusterRoleBinding (or a RoleBinding referencing the ClusterRole) for
   the ServiceAccount, and metrics-server must be installed for Node
   metrics to exist at all.
6. The NetworkPolicy typo makes its `from` selector match no Pods, so once
   it selects the backend for ingress the intended legitimate traffic is
   silently blocked; the Service selector typo makes the Service match no
   Pods, so it has zero endpoints and routes nowhere. Both are "created
   with no error" because the API server validates object schema, not
   whether a selector matches any real Pod.
7. Shared root cause: metrics-server is missing/unreachable — both
   `kubectl top` and a resource-metric HPA depend on it, so both fail
   together. A cause they might *not* share: an HPA can also read
   `<unknown>` because the target Deployment has no CPU `request` (a
   per-workload problem) while `kubectl top` still works fine cluster-wide.
8. A test Pod's connection *result* (times out vs. connects vs. refused)
   and the backend's own logs/events best distinguish the two: policy-
   blocked traffic times out while the backend logs show no incoming
   request and its events/`kubectl top` show a healthy, running Pod; a
   crashed backend shows CrashLoopBackOff events, restart counts, and
   empty or error logs. `kubectl top` alone can mislead — a policy-blocked
   but healthy backend looks perfectly normal there.
9. RBAC starts denied, so you must explicitly write a Role/ClusterRole
   granting ConfigMap reads plus a binding to the ServiceAccount.
   NetworkPolicy starts open, so you must explicitly write a policy
   selecting the Pod for ingress and allowing only the one peer (which
   flips the rest to denied). The Ingress needs an installed controller
   and a correct `ingressClassName`, or it's silently ignored — so you
   must ensure the controller exists and the class matches.
10. Yes, it could break — a default-deny-ingress policy in the app
    namespace blocks Prometheus (in another namespace) from scraping the
    app Pods' metrics endpoints. The policy would need to allow ingress
    from the monitoring namespace/Pods (by namespace selector and/or Pod
    labels) on the metrics port for cross-namespace scraping to continue.

</details>

## Further reading & sources

- [Using RBAC Authorization](https://kubernetes.io/docs/reference/access-authn-authz/rbac/) - the definitive reference for Roles, ClusterRoles, and their bindings.
- [Configure Service Accounts for Pods](https://kubernetes.io/docs/tasks/configure-pod-container/configure-service-account/) - how Pods get an identity for calling the API.
- [Network Policies](https://kubernetes.io/docs/concepts/services-networking/network-policies/) - the concept page for pod-to-pod traffic rules and deny-by-default-once-selected.
- [Declare Network Policy (walkthrough)](https://kubernetes.io/docs/tasks/administer-cluster/declare-network-policy/) - a hands-on tutorial requiring a policy-enforcing CNI, as this module does.
- [Calico for kind / quickstart](https://docs.tigera.io/calico/latest/getting-started/kubernetes/kind) - installing the CNI that actually enforces the policies here.

## Next

[12-capstone-project](../12-capstone-project/README.md) — bring every
concept from this track together into one deployed, autoscaled, packaged
application.
