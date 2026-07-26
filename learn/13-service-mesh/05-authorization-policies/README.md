# 05 - Authorization Policies

## Why this matters

mTLS (module 04) proves *who* every caller is, but by itself it lets any
meshed workload call any other — a strong identity that nobody is checking.
`AuthorizationPolicy` is where you actually *use* that identity to enforce
"only checkout may call payments," at the request layer, keyed on the
cryptographic identity rather than a spoofable IP. This is the mesh's answer
to the least-privilege principle you learned as RBAC in tracks 03/11 — same
principle, different layer — and the exercise you'll spend the most time on is
the one where a policy accidentally blocks legitimate traffic, because that's
the failure that pages real teams.

## Concepts

### What an `AuthorizationPolicy` governs (and how it differs from RBAC)

Track 11's **RBAC** answered "may this *user/ServiceAccount* perform this
action on the *Kubernetes API server*?" — it gates `kubectl` and controllers.
An **`AuthorizationPolicy`** answers a completely different question: "may this
*workload* send this *request* to that *workload* at runtime?" — it gates
service-to-service traffic inside the mesh, enforced by the destination's
sidecar. Same underlying idea (least privilege: deny by default, grant
explicitly), different layer:

- RBAC subject = a user or ServiceAccount calling the API; AuthZ policy
  principal = a *workload identity* (from mTLS, derived from the caller's
  ServiceAccount).
- RBAC protects the control plane (the API server); `AuthorizationPolicy`
  protects the data plane (your services' request paths).

They compose: RBAC stops a compromised token from creating Pods; an
`AuthorizationPolicy` stops a compromised *service* from calling payments.

### It depends on mTLS identity

An `AuthorizationPolicy` rule like "allow principal `checkout`" only means
anything because mTLS (module 04) cryptographically established that the caller
*is* checkout. Without mTLS you'd be authorizing based on spoofable source IPs.
So authz sits *on top of* mTLS: module 04 provides trustworthy identities;
this module decides what each identity is allowed to do. This is why the
curriculum ordered them this way — you can't do meaningful zero-trust authz
without trustworthy identity first.

### Allow-by-default until the first policy — then deny-by-default

The behaviour has a crucial asymmetry, deliberately echoing NetworkPolicy from
track 03 module 11:

- With **no** `AuthorizationPolicy` selecting a workload, **all** requests to
  it are allowed (subject to mTLS).
- The moment **any ALLOW policy** selects that workload, it flips to
  **deny-by-default**: only requests matching some allow rule get through,
  everything else is denied.

So — exactly like adding your first NetworkPolicy — writing one allow rule
doesn't just *add* an allowance, it *removes the open default* for everything
not listed. This is the single most common way an `AuthorizationPolicy`
accidentally blocks legitimate traffic: you write "allow checkout," forgetting
that this now *denies* the monitoring scraper, the health checker, and every
other legitimate caller you didn't list.

### ALLOW vs. DENY policies, and how they combine

Policies come in two `action`s:

- **ALLOW** (the common one): once any ALLOW policy selects a workload, a
  request needs to match at least one ALLOW rule.
- **DENY**: explicitly denies matching requests, and **DENY is evaluated first
  and wins** over ALLOW. Useful for carving an exception ("deny everything
  from the `dev` namespace, even if an ALLOW rule would permit it").

Evaluation order: **DENY rules checked first (deny if matched) → then, if any
ALLOW policy applies, require an ALLOW match → otherwise allow.** Most designs
use ALLOW policies for the allowlist and reserve DENY for hard exceptions.

### What a rule can match on

An `AuthorizationPolicy` rule has three parts, all optional (omitting one means
"any"):

- **`from.source`** — *who*: principals (mTLS identities like
  `cluster.local/ns/<ns>/sa/<serviceaccount>`), namespaces, or IP blocks.
- **`to.operation`** — *what*: HTTP methods, paths, ports.
- **`when`** — *conditions*: arbitrary attributes (headers, JWT claims, etc.).

The most robust rules key on **principal** (the mTLS ServiceAccount identity),
not namespace or IP, because principal is the thing mTLS actually proves. A
rule that allows `from.namespaces: [frontend]` trusts the network topology; a
rule that allows `from.principals: [.../sa/frontend]` trusts cryptographic
identity — prefer the latter.

## Command reference

| Field / command | What it does | Notes |
|---|---|---|
| `kind: AuthorizationPolicy` | Defines allow/deny rules for selected workloads | Enforced by the destination sidecar |
| `spec.selector` | Which workloads the policy protects | Omit for namespace-wide |
| `spec.action` | `ALLOW` (default) or `DENY` | DENY is evaluated first and wins |
| `spec.rules[].from.source.principals` | Allowed mTLS identities | `cluster.local/ns/<ns>/sa/<sa>` — the robust key |
| `spec.rules[].from.source.namespaces` | Allowed source namespaces | Weaker than principals (trusts topology) |
| `spec.rules[].to.operation.methods` | Allowed HTTP methods | e.g. `["GET"]` |
| `spec.rules[].to.operation.paths` | Allowed URI paths | e.g. `["/api/*"]` |
| `spec.rules[].when` | Extra conditions (headers, claims) | Fine-grained matching |
| `kubectl get authorizationpolicy -A` | Lists all authz policies and scopes | Find what selects a workload |
| `istioctl analyze -n <ns>` | Flags authz config issues | Run after any policy change |

## Hands-on exercises

Continue in `mesh-demo` with STRICT mTLS from module 04. You'll build a small
three-workload setup with distinct ServiceAccounts so identity-based rules are
meaningful.

### 1. Give the callers distinct identities

Authz on principals only works if callers run as different ServiceAccounts.
Create two and point two client Deployments at them:

```bash
kubectl create serviceaccount checkout -n mesh-demo
kubectl create serviceaccount reporting -n mesh-demo
```

```yaml
# callers.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: checkout
  namespace: mesh-demo
spec:
  replicas: 1
  selector: {matchLabels: {app: checkout}}
  template:
    metadata: {labels: {app: checkout}}
    spec:
      serviceAccountName: checkout
      containers:
        - name: app
          image: curlimages/curl:8.10.1
          command: ["sh", "-c", "sleep 3600"]
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: reporting
  namespace: mesh-demo
spec:
  replicas: 1
  selector: {matchLabels: {app: reporting}}
  template:
    metadata: {labels: {app: reporting}}
    spec:
      serviceAccountName: reporting
      containers:
        - name: app
          image: curlimages/curl:8.10.1
          command: ["sh", "-c", "sleep 3600"]
```

```bash
kubectl apply -f callers.yaml
kubectl get pods -n mesh-demo -l app=checkout
kubectl get pods -n mesh-demo -l app=reporting
```

Expected: both `2/2`. Each now has a distinct mTLS identity
(`.../sa/checkout` and `.../sa/reporting`) that an authz rule can match.

### 2. Confirm the open default (no policy yet)

```bash
kubectl exec -n mesh-demo deploy/checkout -- curl -s http://backend
kubectl exec -n mesh-demo deploy/reporting -- curl -s http://backend
```

Expected: both get `backend v1` — with no `AuthorizationPolicy` selecting
backend, every meshed caller is allowed. This is the open-until-first-policy
default from Concepts.

### 3. Lock backend to only checkout

```yaml
# authz-backend-checkout.yaml
apiVersion: security.istio.io/v1
kind: AuthorizationPolicy
metadata:
  name: backend-allow-checkout
  namespace: mesh-demo
spec:
  selector:
    matchLabels: {app: backend}
  action: ALLOW
  rules:
    - from:
        - source:
            principals: ["cluster.local/ns/mesh-demo/sa/checkout"]
```

```bash
kubectl apply -f authz-backend-checkout.yaml
kubectl exec -n mesh-demo deploy/checkout -- curl -s http://backend
kubectl exec -n mesh-demo deploy/reporting -- curl -s -m 5 -o /dev/null -w "%{http_code}\n" http://backend
```

Expected: `checkout` still gets `backend v1`; `reporting` now gets **`403`**
(RBAC: access denied by the mesh). The first ALLOW policy flipped backend to
deny-by-default; only the listed principal gets through. This is exactly the
NetworkPolicy asymmetry from track 03 module 11, at the request layer.

### 4. Verify it's identity-based, not network-based

The block is on the cryptographic identity, not the IP or namespace. Confirm
`reporting`'s denial persists even though it's in the same namespace and can
reach the port — the sidecar rejects it *after* the mTLS handshake, based on
principal:

```bash
kubectl exec -n mesh-demo deploy/reporting -- curl -s -m 5 -o /dev/null -w "%{http_code}\n" http://backend
```

Expected: `403` — same-namespace, meshed, reachable, but the wrong identity.
This is what "trust identity, not topology" looks like.

### 5. Restrict by method and path too

Tighten so checkout may only `GET`:

```yaml
# authz-backend-getonly.yaml
apiVersion: security.istio.io/v1
kind: AuthorizationPolicy
metadata:
  name: backend-allow-checkout
  namespace: mesh-demo
spec:
  selector:
    matchLabels: {app: backend}
  action: ALLOW
  rules:
    - from:
        - source:
            principals: ["cluster.local/ns/mesh-demo/sa/checkout"]
      to:
        - operation:
            methods: ["GET"]
```

```bash
kubectl apply -f authz-backend-getonly.yaml
kubectl exec -n mesh-demo deploy/checkout -- curl -s -o /dev/null -w "%{http_code}\n" http://backend
kubectl exec -n mesh-demo deploy/checkout -- curl -s -o /dev/null -w "%{http_code}\n" -X POST http://backend
```

Expected: `GET` → `200`; `POST` → `403`. Even the authorized principal is now
limited to the allowed operation — fine-grained, request-level least
privilege.

### 6. A DENY exception that overrides ALLOW

Add a hard DENY that beats the ALLOW (e.g. block a specific path even for
checkout):

```yaml
# authz-backend-deny-admin.yaml
apiVersion: security.istio.io/v1
kind: AuthorizationPolicy
metadata:
  name: backend-deny-admin
  namespace: mesh-demo
spec:
  selector:
    matchLabels: {app: backend}
  action: DENY
  rules:
    - to:
        - operation:
            paths: ["/admin*"]
```

```bash
kubectl apply -f authz-backend-deny-admin.yaml
kubectl exec -n mesh-demo deploy/checkout -- curl -s -o /dev/null -w "%{http_code}\n" http://backend/admin
kubectl exec -n mesh-demo deploy/checkout -- curl -s -o /dev/null -w "%{http_code}\n" http://backend
```

Expected: `/admin` → `403` even for checkout (DENY wins and is evaluated
first); the normal path still `200`. DENY is your hard-exception tool on top
of an allowlist.

### 7. Diagnose and fix: an AuthorizationPolicy accidentally blocking legitimate traffic

The classic incident. A well-meaning "allow the frontend" policy is written
with the *namespace* misspelled in the principal, so it matches nobody and —
because it's still an ALLOW policy that selects backend — denies *everyone*,
including the legitimate checkout traffic:

```yaml
# authz-backend-broken.yaml
apiVersion: security.istio.io/v1
kind: AuthorizationPolicy
metadata:
  name: backend-allow-checkout
  namespace: mesh-demo
spec:
  selector:
    matchLabels: {app: backend}
  action: ALLOW
  rules:
    - from:
        - source:
            principals: ["cluster.local/ns/mesh-demo/sa/chekout"]
```

(note the deliberate typo: `chekout`)

```bash
kubectl delete authorizationpolicy backend-deny-admin -n mesh-demo --ignore-not-found
kubectl apply -f authz-backend-broken.yaml
kubectl exec -n mesh-demo deploy/checkout -- curl -s -m 5 -o /dev/null -w "%{http_code}\n" http://backend
```

Expected: **`403` even for the legitimate checkout caller** — the ALLOW policy
selects backend (flipping it to deny-by-default) but its one rule matches a
principal that doesn't exist (`chekout`), so nothing is actually allowed. This
is the same silent selector-typo class as the Service selector (track 03
module 04), NetworkPolicy selector (track 03 module 11), and VirtualService
subset (module 02) bugs — schema-valid, applies cleanly, blocks legitimate
traffic. Diagnose:

```bash
kubectl get authorizationpolicy backend-allow-checkout -n mesh-demo -o jsonpath='{.spec.rules[0].from[0].source.principals}{"\n"}'
kubectl get serviceaccount -n mesh-demo | grep checkout
```

Expected: the policy allows principal `.../sa/chekout` but the real
ServiceAccount is `checkout` — a one-character mismatch. (Enabling Istio proxy
access logs or checking the sidecar's `rbac` stats would also show the denial
reason.) Fix by correcting the principal:

```bash
kubectl apply -f authz-backend-checkout.yaml
kubectl exec -n mesh-demo deploy/checkout -- curl -s -o /dev/null -w "%{http_code}\n" http://backend
kubectl exec -n mesh-demo deploy/reporting -- curl -s -m 5 -o /dev/null -w "%{http_code}\n" http://backend
```

Expected: checkout `200`, reporting `403` — the intended policy restored. The
lesson matches every prior selector-typo module: an authz policy that "matches
nobody" doesn't fail open, it denies everyone it selects.

### 8. Reason about the deny-by-default trap

Without applying anything, answer: you have backend working with the checkout
ALLOW policy, and now the monitoring stack from track 12 needs to scrape
backend's metrics endpoint. Will it work? What must you add, and why is this
the *same* trap as adding a default-deny NetworkPolicy that then blocks
Prometheus scraping (track 03 module 11's cumulative review)?

Expected: it will be **denied** — the ALLOW policy made backend deny-by-
default, and the monitoring principal isn't listed. You must add an allow rule
for the monitoring identity/namespace. It's the same trap because in both
cases adding one allow rule silently removed the open default for every
unlisted legitimate caller, monitoring included.

### 9. Clean up authz for the next module

```bash
kubectl delete authorizationpolicy backend-allow-checkout -n mesh-demo --ignore-not-found
kubectl delete authorizationpolicy backend-deny-admin -n mesh-demo --ignore-not-found
```

Leave the `checkout`/`reporting` Deployments and STRICT mTLS — module 06
observes this traffic.

## Independent challenge

No YAML given — draw on this module, module 04's mTLS identity, and
[track 11 RBAC](../../03-kubernetes/11-security-rbac-and-network-policies/README.md).

**Task:** Model a realistic three-tier authorization: a `gateway` service may
call `orders`; `orders` may call `payments`; and `payments` may be called by
*nothing except* `orders`. Enforce it with `AuthorizationPolicy` keyed on mTLS
principals (distinct ServiceAccounts per tier), then prove the full matrix —
gateway→orders allowed, orders→payments allowed, gateway→payments denied,
reporting→anything denied. Deliberately introduce, then find and fix, the
"first ALLOW flips deny-by-default" trap by adding a health-check caller that
your initial policies forgot to allow. Finally, write three sentences on how
this differs from — and layers with — the RBAC you'd write to control who can
`kubectl` these same workloads.

<details>
<summary>Stuck? One hint</summary>

One ALLOW `AuthorizationPolicy` per protected service, each listing only the
principal(s) permitted to call it (`cluster.local/ns/<ns>/sa/<sa>`). The trap
appears the moment you apply the first one: any caller you didn't list —
including a health checker — starts getting `403`, so add its principal to the
relevant allow rule. RBAC (track 11) governs API-server access to these
objects (who can edit the Deployments); `AuthorizationPolicy` governs runtime
calls between them — different layer, same deny-by-default-once-you-start
least-privilege discipline.

</details>

## Common mistakes & troubleshooting

- **Forgetting the first ALLOW flips deny-by-default.** Writing "allow
  checkout" silently denies every other legitimate caller (monitoring, health
  checks) you didn't list — the exact trap in exercises 7-8, identical to
  adding your first NetworkPolicy.
- **Typo'd principals denying everyone.** An ALLOW rule whose principal
  matches nobody doesn't fail open — it selects the workload (deny-by-default)
  and then allows nothing, blocking legitimate traffic. Verify the exact
  ServiceAccount string.
- **Authorizing on namespace/IP instead of principal.** Namespace and IP rules
  trust network topology, which is spoofable; principal rules trust the mTLS
  identity, which isn't. Prefer principals — and remember they only work
  because module 04's mTLS is on.
- **Expecting authz to work without mTLS identity.** Principal-based rules need
  the caller to present a mesh certificate; a non-meshed caller has no
  principal to match. Authz sits on top of mTLS, not beside it.
- **Confusing `AuthorizationPolicy` with RBAC.** RBAC gates the Kubernetes API
  server; `AuthorizationPolicy` gates runtime service-to-service calls. A
  workload can be fully RBAC-locked and still call any service unless an
  `AuthorizationPolicy` restricts it.
- **Forgetting DENY is evaluated first.** A DENY rule beats any ALLOW; if
  authorized traffic is unexpectedly blocked, check for a broad DENY policy
  before debugging the ALLOW rules.

## Checkpoint quiz

Write down your answer to each question before expanding it — checking without attempting first is the single easiest way to fool yourself into thinking you've learned this.

1. What question does an `AuthorizationPolicy` answer that RBAC (track 11)
   does not?
2. Why does identity-based authz depend on module 04's mTLS being in place?
3. With no `AuthorizationPolicy` selecting a service, who can call it? What
   changes the instant you apply your first ALLOW policy?
4. In exercise 7, the policy applied cleanly but blocked the legitimate
   caller. What was the bug and why didn't it fail open?
5. You allow `checkout` to call `backend`, and now the monitoring scraper
   (track 12) can't reach backend's metrics. Why, and what's the fix?
6. Which is more robust to key an allow rule on — source namespace or source
   principal — and why?
7. If a request matches both a DENY rule and an ALLOW rule, what happens?

<details>
<summary>Show answers</summary>

1. "May this *workload* send this *request* to that *workload* at runtime?" —
   authorization of service-to-service calls in the data plane. RBAC answers
   "may this user/ServiceAccount perform this action on the Kubernetes API
   server?" — a different layer (control-plane access), same least-privilege
   principle.
2. Because the rules match on *principals* — the caller's cryptographic mTLS
   identity. Without mTLS you'd be authorizing on spoofable source IPs;
   module 04's mTLS is what makes "this call is from checkout" trustworthy
   enough to authorize on.
3. With no policy selecting it, every meshed caller is allowed (subject to
   mTLS). The instant you apply the first ALLOW policy, the workload flips to
   deny-by-default: only requests matching an allow rule get through,
   everything else is denied.
4. The ALLOW rule's principal was misspelled (`chekout`), so it matched no
   real identity — but the policy still selected backend, flipping it to
   deny-by-default. With nothing actually allowed, every caller (including the
   real checkout) got `403`. It didn't fail open because an ALLOW policy that
   matches nobody denies everyone it selects.
5. The ALLOW policy made backend deny-by-default, and the monitoring
   scraper's identity/namespace isn't in the allowlist, so it's denied. Fix:
   add an allow rule permitting the monitoring principal (or namespace) to the
   metrics path/port — the same trap as a default-deny NetworkPolicy blocking
   Prometheus.
6. Source **principal** — it's the mTLS-proven workload identity, which can't
   be spoofed. Source namespace (and IP) trust network topology, which can be
   spoofed and doesn't survive workloads moving around; prefer principals.
7. The request is denied. DENY policies are evaluated first and win over any
   ALLOW match — DENY is the hard-exception tool that overrides the allowlist.

</details>

## Next

[06-mesh-observability](../06-mesh-observability/README.md) — you've routed,
encrypted, and authorized traffic; now *see* all of it: Istio's built-in
golden-signal metrics, the Kiali service graph, and wiring traces into track
12's OpenTelemetry/Grafana stack.
