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

## Next

[12-capstone-project](../12-capstone-project/README.md) — bring every
concept from this track together into one deployed, autoscaled, packaged
application.
