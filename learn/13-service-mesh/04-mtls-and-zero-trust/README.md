# 04 - mTLS and Zero-Trust Networking

## Why this matters

In track 03, NetworkPolicy could say "frontend may reach backend," but the
traffic on that allowed path was still **plaintext**, and "frontend" was
identified only by a spoofable Pod label/IP. A service mesh closes both gaps
at once: every call is encrypted *and* both ends are cryptographically
identified, with certificates issued and rotated for you. This module makes
the mTLS that's already been running under your exercises explicit, teaches
you to enforce it STRICTly, and — critically — shows the failure mode where
turning on STRICT mTLS breaks calls from a service that isn't in the mesh.

## Concepts

### mTLS, and what it adds over NetworkPolicy

Plain TLS (like HTTPS) encrypts traffic and proves the *server's* identity to
the client. **Mutual TLS (mTLS)** additionally proves the *client's* identity
to the server — both ends present certificates. In a mesh, the sidecars do
this on every hop automatically, so you get two things NetworkPolicy never
provided:

- **Encryption in transit** — an attacker who sniffs the Pod network sees
  ciphertext, not your requests.
- **Strong workload identity** — each workload's certificate encodes a
  verifiable identity (in Istio, a SPIFFE identity derived from its
  ServiceAccount), so "this call is from the checkout service" is
  cryptographically proven, not inferred from an easily-spoofed label or IP.

This is the "same mTLS idea" you saw ACA's Dapr provide between apps (track 06
module 05) — except here Istio issues and rotates the certificates for *every*
meshed workload with no per-app setup, instead of you wiring TLS by hand.

### It's already on — Istio's default

Here's the part that surprises people: **you've been using mTLS since module
01.** Every `frontend`→`backend` call in modules 01-03 was already encrypted
and mutually authenticated by the sidecars, because Istio enables mTLS in
**PERMISSIVE** mode by default. You didn't configure it; it just happened.
This module is about making that explicit and *tightening* it — the mesh's
"secure by default" posture is the opposite of NetworkPolicy's "open by
default until you restrict it" (track 03 module 11).

### PERMISSIVE vs. STRICT

`PeerAuthentication` controls the mTLS *mode* for a workload or namespace:

- **PERMISSIVE** (the default): meshed workloads accept *both* mTLS and
  plaintext. This is what lets a not-yet-meshed or external service still talk
  to your meshed services during a migration — encryption where possible,
  compatibility where necessary. The catch: because plaintext is still
  accepted, you don't yet have a *guarantee* of encryption.
- **STRICT**: the workload accepts *only* mTLS; any plaintext connection is
  rejected. This is the real "zero-trust" posture — nothing on the network is
  trusted unless it presents a valid mesh certificate. STRICT is the goal, but
  flipping it on will **break** any caller that isn't presenting mesh mTLS
  (i.e. any non-meshed Pod), which is the central hazard of this module.

The migration pattern this enables: mesh everything under PERMISSIVE (nothing
breaks), verify all real traffic is already mTLS, *then* flip to STRICT to
forbid the plaintext you've confirmed nobody needs.

### `PeerAuthentication` scope: mesh, namespace, workload

A `PeerAuthentication` applies at one of three scopes, most-specific-wins:

- **Mesh-wide** — in the Istio root namespace (`istio-system`), no selector:
  the default for everything.
- **Namespace-wide** — in a namespace, no selector: overrides mesh default for
  that namespace.
- **Workload-specific** — in a namespace *with* a `selector`: overrides the
  namespace default for matching Pods.

This mirrors the layering you already know from RBAC (Role vs. ClusterRole,
track 11) and from NetworkPolicy's per-Pod selectors — coarse defaults,
refined by more specific rules. It lets you keep one legacy service PERMISSIVE
while the rest of the namespace is STRICT.

### How mTLS *layers with* NetworkPolicy (not replaces it)

These are different layers and you want both. NetworkPolicy (L3/4) decides
*whether a connection is allowed to exist at all* — it can drop a packet
before it's even a TLS handshake. mTLS (L7-ish, in the proxies) decides
*whether an allowed connection is encrypted and who's on each end*. A robust
setup uses NetworkPolicy to keep unrelated Pods from even reaching a service's
port, *and* STRICT mTLS so that whatever does reach it is encrypted and
identified. One is the outer fence, the other is the locked door — defence in
depth, and neither makes the other redundant. (Authorization of *which
identity may call which* is a third layer — `AuthorizationPolicy`, module 05.)

### Certificate issuance and rotation, conceptually

You never touched a certificate in modules 01-03, yet every call was mTLS.
That's because `istiod` runs a **certificate authority**: when a sidecar
starts, it proves its identity (via its ServiceAccount token) and `istiod`
issues it a short-lived workload certificate, then **automatically rotates**
it (re-issues a fresh one) long before it expires — typically every 24 hours,
with no restart and no human involved. Compare this to the hand-managed TLS of
track 03/04: certificates that expire and page you at 2am because someone
forgot to renew. The mesh turning cert lifecycle into an invisible,
self-healing background process is one of its highest-value features — you get
short-lived, frequently-rotated certs (a security best practice that's
painful to do by hand) essentially for free.

## Command reference

| Field / command | What it does | Notes |
|---|---|---|
| `kind: PeerAuthentication` | Sets the mTLS mode for a scope | Mesh/namespace/workload scope by placement + selector |
| `spec.mtls.mode` | `STRICT`, `PERMISSIVE`, or `DISABLE` | STRICT = mTLS-only; PERMISSIVE = both; DISABLE = plaintext |
| `spec.selector` (on PeerAuthentication) | Narrows the policy to matching workloads | Omit for namespace/mesh-wide |
| `istioctl authn tls-check <pod> <host>` | Reports whether a call would use mTLS and the effective mode | Best "is mTLS actually on?" check |
| `istioctl proxy-config secret <pod>` | Shows the workload's issued certificate | Inspect identity + validity/rotation |
| `kubectl get peerauthentication -A` | Lists all mTLS policies and their scopes | Find what's overriding what |
| `istioctl analyze -n <ns>` | Flags conflicting or dangerous mTLS config | Run before flipping STRICT |

## Hands-on exercises

Continue in `mesh-demo` with the meshed `frontend`/`backend` app. You'll also
create a deliberately *non-meshed* namespace to trigger the STRICT-breaks-
legacy scenario.

### 1. Prove mTLS is already on (PERMISSIVE default)

```bash
BACKEND_POD=$(kubectl get pod -n mesh-demo -l app=backend -o jsonpath='{.items[0].metadata.name}')
istioctl authn tls-check deploy/frontend.mesh-demo backend.mesh-demo.svc.cluster.local
```

Expected: the check reports the effective policy as PERMISSIVE and that the
connection uses mTLS — confirming the calls you've been making since module 01
were already encrypted and mutually authenticated without any config from you.

### 2. Look at a workload's certificate

```bash
istioctl proxy-config secret deploy/backend -n mesh-demo -o json | \
  jq -r '.dynamicActiveSecrets[0].secret.tlsCertificate.certificateChain.inlineBytes' 2>/dev/null | head -c 40; echo
istioctl proxy-config secret deploy/backend -n mesh-demo
```

Expected: a certificate exists with a short validity window — the one `istiod`
issued to this workload and rotates automatically. You never created it. Note
the short lifetime: that's the frequent-rotation property from Concepts.

### 3. Enforce STRICT mTLS namespace-wide

```yaml
# strict-mtls.yaml
apiVersion: security.istio.io/v1
kind: PeerAuthentication
metadata:
  name: default
  namespace: mesh-demo
spec:
  mtls:
    mode: STRICT
```

```bash
kubectl apply -f strict-mtls.yaml
kubectl exec -n mesh-demo deploy/frontend -- curl -s http://backend
```

Expected: still works — both `frontend` and `backend` are meshed, so both ends
present mesh certificates and STRICT is satisfied. Nothing looks different from
the client's side, but plaintext is now *forbidden*, which the next exercises
prove.

### 4. Confirm the mode really changed

```bash
istioctl authn tls-check deploy/frontend.mesh-demo backend.mesh-demo.svc.cluster.local
kubectl get peerauthentication -n mesh-demo
```

Expected: `tls-check` now reports STRICT for backend; the PeerAuthentication
is listed. You've moved from "encrypted but plaintext still accepted" to
"encrypted, plaintext rejected."

### 5. Create a non-meshed (legacy) caller

Make a namespace *without* the injection label and put a client in it:

```bash
kubectl create namespace legacy
# deliberately NOT labelling it for injection
kubectl -n legacy run legacy-client --image=curlimages/curl:8.10.1 --command -- sleep 3600
kubectl get pod legacy-client -n legacy
```

Expected: `legacy-client` is `1/1` — no sidecar, so it will speak *plaintext*
when it calls into `mesh-demo`. This is the migration reality: not everything
is meshed at once.

### 6. Diagnose and fix: STRICT mTLS breaks the legacy service's calls

```bash
kubectl exec -n legacy legacy-client -- curl -s -m 5 http://backend.mesh-demo || echo "FAILED (connection reset)"
```

Expected: **it fails** — `backend` is STRICT and `legacy-client` has no
sidecar, so it can only offer plaintext, which STRICT rejects. This is the
canonical "mTLS broke a legacy non-meshed service" incident: nothing in
`mesh-demo` changed, the legacy caller just can't speak mTLS. Diagnose — prove
the meshed path still works so you know it's specifically the non-meshed
caller:

```bash
kubectl exec -n mesh-demo deploy/frontend -- curl -s http://backend    # still works
kubectl get pod legacy-client -n legacy                                # 1/1 = not meshed
istioctl authn tls-check deploy/frontend.mesh-demo backend.mesh-demo.svc.cluster.local  # STRICT
```

Expected: meshed caller succeeds, legacy caller is `1/1`, backend is STRICT —
the diagnosis is complete: STRICT plus a non-meshed caller. You have three
legitimate fixes; pick based on intent:

**Fix A (right long-term): mesh the legacy caller.**

```bash
kubectl label namespace legacy istio-injection=enabled
kubectl delete pod legacy-client -n legacy
kubectl -n legacy run legacy-client --image=curlimages/curl:8.10.1 --command -- sleep 3600
kubectl get pod legacy-client -n legacy   # now 2/2
kubectl exec -n legacy legacy-client -- curl -s http://backend.mesh-demo
```

Expected: `2/2`, and the call now succeeds — the caller presents a mesh cert.
This is the migration-done-right outcome: mesh the stragglers, keep STRICT.

**Fix B (bridge during migration): relax just backend to PERMISSIVE.** If you
*can't* mesh the caller yet, scope a PERMISSIVE override to backend so it
accepts both while you migrate — deliberately less secure, temporary:

```yaml
# backend-permissive.yaml
apiVersion: security.istio.io/v1
kind: PeerAuthentication
metadata:
  name: backend-permissive
  namespace: mesh-demo
spec:
  selector:
    matchLabels: {app: backend}
  mtls:
    mode: PERMISSIVE
```

This is the workload-scoped override from Concepts (most-specific-wins). Don't
apply it now — Fix A is what you want here. The point is knowing this bridge
exists so a migration doesn't force an all-or-nothing cutover.

### 7. Verify STRICT still holds for everyone else

With the legacy namespace now meshed (Fix A), confirm STRICT is still enforced
and there's no plaintext path left:

```bash
istioctl authn tls-check deploy/backend.mesh-demo backend.mesh-demo.svc.cluster.local
kubectl get peerauthentication -n mesh-demo
```

Expected: still STRICT, no PERMISSIVE override — the ideal end state: every
caller meshed, plaintext forbidden mesh-wide.

### 8. See mTLS and NetworkPolicy as different layers

Reason about (and, if your kind cluster has a policy-enforcing CNI like the
Calico setup from track 03 module 11, test): STRICT mTLS encrypts and
identifies allowed traffic, but does it stop an *unauthorized* meshed Pod from
*connecting* to backend's port? No — that's NetworkPolicy's job (L3/4), and
authz of *which identity* may call is module 05's job. Write down which of the
three layers (NetworkPolicy / mTLS / AuthorizationPolicy) would stop each of:
a packet from an unrelated Pod reaching backend's port at all; an eavesdropper
reading backend traffic; a meshed-but-unauthorized service successfully
calling backend.

Expected: NetworkPolicy stops the first (drops the connection), mTLS stops the
second (encryption), AuthorizationPolicy (module 05) stops the third — three
distinct layers, all wanted.

### 9. Clean up the legacy namespace

```bash
kubectl delete namespace legacy
```

Leave `mesh-demo` STRICT — module 05 adds authorization on top of it.

## Independent challenge

No YAML given — draw on this module,
[track 03 NetworkPolicy](../../03-kubernetes/11-security-rbac-and-network-policies/README.md),
and the injection mechanics from
[module 01](../01-installing-istio-and-sidecar-injection/README.md).

**Task:** Simulate a realistic "tighten security without an outage" migration.
Start with two meshed services (`web`→`orders`) plus one *non-meshed* batch
job that also calls `orders` over plaintext, all working under PERMISSIVE.
Now reach a fully zero-trust end state — `orders` STRICT, every real caller on
mTLS — *without ever breaking the batch job's traffic mid-migration*. Prove at
each step that both the meshed and (until you mesh it) the non-meshed caller
keep working, then flip STRICT only once nothing needs plaintext, and confirm
a fresh non-meshed Pod is now rejected. Finally, explain in three sentences why
you'd keep a NetworkPolicy on `orders` even after STRICT mTLS is fully
enforced.

<details>
<summary>Stuck? One hint</summary>

The safe order is: mesh everything first (label + restart, so the batch job
becomes `2/2` and starts speaking mTLS while PERMISSIVE still tolerates any
stragglers), verify with `istioctl authn tls-check` that real traffic is
already mTLS, *then* apply STRICT last. If you truly can't mesh the batch job
in time, a workload-scoped PERMISSIVE `PeerAuthentication` on `orders` is the
temporary bridge. Keep the NetworkPolicy because mTLS doesn't stop an
unauthorized Pod from *reaching the port* — it only encrypts/identifies
traffic that's allowed to connect.

</details>

## Common mistakes & troubleshooting

- **Flipping STRICT before everything is meshed.** Any non-meshed caller
  speaks plaintext and gets rejected the instant backend goes STRICT — the
  exact incident in exercise 6. Mesh first (PERMISSIVE tolerates stragglers),
  verify all real traffic is mTLS, then STRICT.
- **Assuming mTLS replaces NetworkPolicy.** It doesn't — mTLS encrypts and
  identifies *allowed* traffic but doesn't decide whether a connection may
  exist. Keep NetworkPolicy (L3/4) and mTLS (encryption/identity) as separate
  layers.
- **Thinking "no config" means "no mTLS."** Istio is mTLS-PERMISSIVE by
  default, so meshed traffic is already encrypted before you write any
  `PeerAuthentication` — the opposite default from NetworkPolicy's open-by-
  default.
- **Debugging cert errors as app bugs.** A `connection reset`/`RST` on a
  meshed call after enabling STRICT is almost always a non-meshed caller or a
  DISABLE/STRICT mismatch, not the application — check the caller's `READY`
  count and `istioctl authn tls-check` first.
- **Forgetting most-specific-wins for PeerAuthentication.** A workload-scoped
  PERMISSIVE override silently beats a namespace STRICT for those Pods — great
  for a migration bridge, dangerous if you forget it's there. `kubectl get
  peerauthentication -A` shows the full picture.
- **Worrying about certificate expiry.** You don't manage mesh certs — `istiod`
  issues and rotates short-lived ones automatically. If you find yourself
  hand-renewing a mesh workload cert, you've misunderstood who owns them.

## Checkpoint quiz

Write down your answer to each question before expanding it — checking without attempting first is the single easiest way to fool yourself into thinking you've learned this.

1. What does mTLS add over plain TLS, and what does it add over a
   NetworkPolicy that already allows the traffic?
2. Were your module 01-03 calls encrypted? Why or why not, given you never
   wrote a `PeerAuthentication`?
3. Explain PERMISSIVE vs. STRICT and why PERMISSIVE is the safe default during
   a migration.
4. You flip a namespace to STRICT and a batch job's calls immediately start
   failing with connection resets. What's the cause and the two ways to fix
   it?
5. mTLS and NetworkPolicy — do you keep both, and what does each stop that the
   other doesn't?
6. Who issues and rotates a meshed workload's certificate, and how does that
   compare to the hand-managed TLS of earlier tracks?
7. A workload-scoped PERMISSIVE `PeerAuthentication` exists in a STRICT
   namespace. Which wins for the selected Pods, and why might that be both
   useful and dangerous?

<details>
<summary>Show answers</summary>

1. Plain TLS encrypts and proves the *server's* identity; mTLS additionally
   proves the *client's* identity, so both ends are authenticated. Over a
   NetworkPolicy (which only allows/denies a connection), mTLS adds encryption
   in transit and cryptographic workload identity — the allowed traffic is now
   private and both ends are provably who they claim to be.
2. Yes, they were encrypted and mutually authenticated. Istio enables mTLS in
   PERMISSIVE mode by default, so meshed sidecars already do mTLS between
   themselves without any `PeerAuthentication` from you.
3. PERMISSIVE accepts both mTLS and plaintext; STRICT accepts only mTLS and
   rejects plaintext. PERMISSIVE is safe during migration because not-yet-
   meshed or external callers (which can only do plaintext) keep working while
   you mesh them, so you don't force an all-at-once cutover.
4. The batch job isn't meshed (no sidecar → plaintext only), and STRICT
   rejects plaintext. Fix by meshing the job (label its namespace + restart so
   it gets a sidecar and speaks mTLS), or, as a temporary bridge, scope a
   PERMISSIVE `PeerAuthentication` to the target workload until the job is
   meshed.
5. Yes, keep both — different layers. NetworkPolicy (L3/4) stops an
   unauthorized Pod from reaching the port at all; mTLS encrypts the allowed
   traffic and proves both ends' identity. Neither substitutes for the other.
6. `istiod` acts as the CA: it issues each meshed workload a short-lived
   certificate (identity from its ServiceAccount) and automatically rotates it
   before expiry, with no restart or human action — versus earlier tracks'
   hand-managed certs that expire and require manual renewal.
7. The workload-scoped PERMISSIVE wins for the selected Pods (most-specific-
   wins). Useful as a temporary migration bridge for one legacy service;
   dangerous because it silently punches a plaintext-allowed hole in an
   otherwise-STRICT namespace that's easy to forget.

</details>

## Next

[05-authorization-policies](../05-authorization-policies/README.md) — mTLS
proves *who* a caller is; now use that proven identity to decide *which*
services are allowed to call *which*, with `AuthorizationPolicy`.
