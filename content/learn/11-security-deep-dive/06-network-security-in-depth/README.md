# Network Security in Depth

## Why this matters

You've met the network-security pieces separately and never as a *stack*:
NSGs and Azure Firewall in track 05, Kubernetes NetworkPolicy in 03/11, TLS in
the networking-fundamentals track. Each was taught in isolation, as if it were
*the* control. It isn't — real network security is **defense in depth**, where
a request crossing from the internet to your database passes through several
independent filters, and no single one is trusted to be sufficient (module
00's core mindset, applied to the wire). This module assembles those layers
into one coherent model, adds the crucial *egress* dimension most people
forget, and previews service-mesh mTLS — the identity-based, in-cluster
encryption layer that track 13 owns in full.

## Concepts

### Defense in depth on the network: the layered path

Trace one request from an external user to a Pod's database call, and count
the independent filters it can pass through on Azure/AKS:

1. **Azure Firewall / NSGs at the perimeter and subnet** (track 05) — control
   what traffic can even enter (or leave) the VNet and subnets. Coarse, IP/
   port/CIDR-based, *below* Kubernetes.
2. **Ingress + WAF** — the L7 entry point; a Web Application Firewall (e.g. on
   Application Gateway, track 05) inspects HTTP for attacks.
3. **Kubernetes NetworkPolicy** (03/11) — controls which Pods may talk to which
   *inside* the cluster, by label. Fine-grained, Kubernetes-native.
4. **Service mesh mTLS** (preview below, track 13) — mutual-TLS encryption and
   *identity* between Pods, so even intra-cluster traffic is authenticated and
   encrypted.

The point: an attacker who defeats one layer still faces the next. A leaked
NSG rule doesn't expose a Pod that NetworkPolicy still isolates; a NetworkPolicy
gap doesn't expose plaintext traffic the mesh still encrypts. You *layer*
because any single control will eventually have a hole.

### Ingress vs. egress — and why egress is the one people forget

03/11 focused on *ingress* NetworkPolicy (who can reach a Pod). The
under-appreciated half is **egress** (where a Pod can *connect out to*).
Assume-breach (module 00): if an attacker gets code execution in a Pod, the
first thing they do is call *out* — to a command-and-control server, to
exfiltrate data, to download a second-stage payload. **Default-open egress
means a compromised Pod can talk to the entire internet.** Locking egress down
to only the destinations a workload legitimately needs (its database, a
specific API, DNS) turns "attacker phones home freely" into "attacker's
outbound connection is blocked" — and, as a bonus, a *blocked* unexpected
egress attempt is a high-signal alert (module 07). This is the single
highest-value network hardening most teams skip.

### NetworkPolicy egress and the default-deny pattern

Recall from 03/11 that once *any* policy selects a Pod for a direction, that
direction becomes deny-by-default for that Pod. The strongest posture applies a
**default-deny-egress** policy to a namespace (select all Pods, allow nothing),
then adds narrow allow rules for exactly what's needed. Two practical wrinkles:

- **DNS must be explicitly allowed.** A default-deny-egress policy blocks the
  Pod's DNS lookups to CoreDNS (UDP/TCP 53 in `kube-system`), so *everything*
  breaks with confusing "name resolution failed" errors until you add a DNS
  allow rule. This is the #1 gotcha and this module's diagnose-and-fix.
- **NetworkPolicy needs an enforcing CNI** (03/11) — Calico on kind, or Azure
  CNI with network policy on AKS. Without it, egress policies are silently
  inert, exactly like ingress ones.

### Where NSGs/Firewall and NetworkPolicy divide the work

They operate at different layers and aren't interchangeable:

- **NSGs / Azure Firewall** (track 05) filter at the *VNet/subnet/node* level —
  IP ranges, ports, FQDN rules (Firewall). They govern traffic in and out of
  the *cluster's nodes and subnets*, and are the right place for
  cluster-wide egress control to the internet (e.g. Azure Firewall's FQDN
  allowlist so nodes can only reach approved domains).
- **NetworkPolicy** filters at the *Pod* level, by Kubernetes label, *inside*
  the cluster — something NSGs can't see, because to the VNet all Pods on a
  node may share the node's networking.

So a common real design: Azure Firewall restricts what the *cluster* can reach
on the internet (coarse, node-level egress), while NetworkPolicy restricts what
*each Pod* can reach in-cluster and which Pods can reach it (fine, pod-level).
Both, not either — defense in depth across two layers that see different things.

### Service mesh mTLS — a preview (track 13 owns this)

NetworkPolicy answers "*may* Pod A connect to Pod B?" by label. It does **not**
answer "is the traffic *encrypted*?" or "is B *sure* it's really A and not
something that stole A's IP?" That's **mutual TLS (mTLS)**, and a **service
mesh** (Istio/Linkerd, track 13) provides it transparently: it injects a
sidecar proxy next to each Pod that automatically encrypts all Pod-to-Pod
traffic and authenticates both ends with cryptographic *workload identities*
(not just IPs/labels). The upgrade in the STRIDE terms of module 00: mTLS
counters **Spoofing** (an attacker can't impersonate a workload without its
cert) and **Information disclosure/Tampering** (traffic is encrypted and
integrity-protected in transit, even inside the cluster). NetworkPolicy and
mTLS are complementary — policy decides *if* a connection is allowed, mTLS
secures and authenticates it *when* it happens. **That's the whole preview** —
track 13 covers installing a mesh, mTLS modes (permissive vs. strict),
authorization policies, and the observability the sidecars unlock.

### Zero trust: the mindset these layers implement

All of the above is the network face of **zero trust**: never trust traffic
just because it's "inside" the network. The old model trusted anything past the
perimeter firewall; zero trust assumes the internal network is *already
hostile* (assume breach) and therefore authenticates and authorizes *every*
connection, segments aggressively (NetworkPolicy), controls egress, and
encrypts internal traffic (mTLS). You don't need a product called "zero trust";
you need these layers configured so that a foothold in one Pod doesn't grant
free movement to everything else — exactly what this module assembles.

## Command reference

| Command / field | What it does | Example |
|---|---|---|
| `NetworkPolicy spec.policyTypes: [Egress]` | Makes a policy govern outbound traffic (the half 03/11 skipped) | see exercise 3 |
| `spec.egress[].to.ipBlock.cidr` | Allow egress to an IP/CIDR range | `ipBlock: {cidr: 10.0.0.0/16}` |
| `spec.egress[].to.namespaceSelector` | Allow egress to Pods in matching namespaces (e.g. for DNS to kube-system) | see exercise 4 |
| `spec.egress[].ports` | Restrict allowed egress to specific ports/protocols (e.g. UDP 53) | `ports: [{protocol: UDP, port: 53}]` |
| `az network nsg rule create` | Adds an NSG rule at the subnet/NIC level (track 05) | `az network nsg rule create -g rg --nsg-name nsg1 -n deny-out --direction Outbound --access Deny --priority 4096` |
| `az network firewall application-rule create` | Azure Firewall FQDN egress rule (allow only named domains) | see exercise 7 |
| `az aks create --network-policy azure` (or `calico`) | Enables a NetworkPolicy-enforcing CNI on AKS | `az aks create ... --network-plugin azure --network-policy calico` |
| `kubectl exec ... -- wget/nslookup` | Tests actual connectivity/DNS from inside a Pod | see exercises |

Flag breakdown for a default-deny-egress + DNS-allow NetworkPolicy (exercises
3-4):

- `podSelector: {}` — an *empty* selector matches **every** Pod in the
  namespace, so the policy applies namespace-wide.
- `policyTypes: [Egress]` — this policy governs outbound only; combined with an
  empty `egress:` list it denies *all* egress from every Pod in the namespace.
- `egress[].to.namespaceSelector` matching `kube-system` + `ports: [{protocol:
  UDP, port: 53}, {protocol: TCP, port: 53}]` — the minimal carve-out that
  re-permits DNS lookups to CoreDNS, without which every name resolution fails.

Flag breakdown for `az network firewall application-rule create ... --target-fqdns "*.azurecr.io" "mcr.microsoft.com" --protocols Http=80 Https=443`:

- `application-rule create` — an L7 (FQDN-based) egress allow rule on Azure
  Firewall, so cluster nodes can reach only named domains.
- `--target-fqdns "*.azurecr.io" "mcr.microsoft.com"` — the allowlist; nodes
  can pull images from ACR/MCR but not arbitrary internet hosts.
- `--protocols Http=80 Https=443` — the ports/protocols the rule permits. This
  is cluster-wide (node-level) egress control, complementing per-Pod
  NetworkPolicy.

## Hands-on exercises

Exercises 1-6 run on a Calico-enabled kind cluster (the setup from 03/11 —
recreate it if needed). Exercise 7 is Azure and optional/observational. No
Azure cost unless you do 7.

1. **(WSL2) Recreate a NetworkPolicy-enforcing cluster** (from 03/11) if you
   don't have one, and deploy a test Pod:
   ```bash
   kubectl create namespace netsec 2>/dev/null; true
   kubectl run client --image=busybox:1.36 -n netsec --restart=Never -- sh -c "sleep 3600"
   kubectl exec client -n netsec -- wget -qO- --timeout=4 http://example.com | head -1
   ```
   Expect the `wget` to succeed (some HTML) — proving egress is *wide open* by
   default: this Pod can reach the entire internet.

2. **(WSL2) Confirm DNS works before you break it.**
   ```bash
   kubectl exec client -n netsec -- nslookup example.com | head
   ```
   Expect a resolved address. Remember this works — the next step breaks it on
   purpose.

3. **(WSL2) Apply default-deny-egress and watch everything break.**
   ```bash
   kubectl apply -n netsec -f - <<'EOF'
   apiVersion: networking.k8s.io/v1
   kind: NetworkPolicy
   metadata: {name: default-deny-egress}
   spec:
     podSelector: {}
     policyTypes: [Egress]
   EOF
   kubectl exec client -n netsec -- wget -qO- --timeout=4 http://example.com | head -1
   ```
   Expect a timeout/failure. The empty `podSelector` + `Egress` with no allow
   rules denies all outbound from every Pod — the assume-breach posture, but
   currently *too* strict for even legitimate use.

4. **Diagnose and fix: "name resolution failed" after locking egress.** The
   failure in exercise 3 is confusingly a *DNS* failure first. Diagnose:
   ```bash
   kubectl exec client -n netsec -- nslookup example.com 2>&1 | head
   ```
   Expect a DNS resolution error — because default-deny-egress also blocked the
   Pod's lookups to CoreDNS in `kube-system`. Fix by allowing DNS (the #1
   egress gotcha):
   ```bash
   kubectl apply -n netsec -f - <<'EOF'
   apiVersion: networking.k8s.io/v1
   kind: NetworkPolicy
   metadata: {name: allow-dns}
   spec:
     podSelector: {}
     policyTypes: [Egress]
     egress:
       - to:
           - namespaceSelector:
               matchLabels: {kubernetes.io/metadata.name: kube-system}
         ports:
           - {protocol: UDP, port: 53}
           - {protocol: TCP, port: 53}
   EOF
   kubectl exec client -n netsec -- nslookup example.com 2>&1 | head
   ```
   Expect DNS to resolve again. Note it *still* can't reach `example.com` over
   HTTP (that egress isn't allowed yet) — DNS resolving but the connection
   failing is the tell that DNS is fixed but the app egress rule is still
   missing.

5. **(WSL2) Allow exactly one legitimate egress destination.** Deploy an
   in-cluster "database" and permit the client to reach *only* it:
   ```bash
   kubectl run db --image=hashicorp/http-echo:1.0 -n netsec --labels app=db --port=5678 -- -text="db-ok" -listen=:5678
   kubectl expose pod db -n netsec --port=80 --target-port=5678
   kubectl apply -n netsec -f - <<'EOF'
   apiVersion: networking.k8s.io/v1
   kind: NetworkPolicy
   metadata: {name: allow-client-to-db}
   spec:
     podSelector: {run: client}
     policyTypes: [Egress]
     egress:
       - to: [{podSelector: {matchLabels: {app: db}}}]
         ports: [{port: 5678}]
   EOF
   kubectl exec client -n netsec -- wget -qO- --timeout=4 http://db | head -1
   kubectl exec client -n netsec -- wget -qO- --timeout=4 http://example.com | head -1
   ```
   Expect `db-ok` from the first and a *timeout* from the second — the client
   can now reach its database but nothing else outbound. This is least-
   privilege egress: exactly the assume-breach containment from Concepts.

6. **(WSL2) See the security payoff of blocked egress.** The failed
   `example.com` attempt in exercise 5 is what a *compromised* Pod trying to
   phone home would look like — and it's blocked. Note that a blocked
   unexpected egress is a high-signal event you'd want alerting on (module 07).
   Clean up:
   ```bash
   kubectl delete namespace netsec
   ```

7. **(Azure, optional) Cluster-level egress with Azure Firewall FQDN rules.**
   *Conceptually/observationally* (a full firewall + UDR setup is a track-05
   exercise): review how you'd force AKS node egress through Azure Firewall and
   allow only image registries. The rule shape:
   ```bash
   az network firewall application-rule create \
     --firewall-name fw-aks --collection-name aks-egress -g rg-net \
     --name allow-registries --action Allow --priority 100 \
     --target-fqdns "*.azurecr.io" "mcr.microsoft.com" "*.blob.core.windows.net" \
     --source-addresses "10.0.0.0/16" --protocols Https=443
   ```
   Note how this is *node-level* (subnet CIDR source), coarse, and
   internet-facing — complementary to the *pod-level* NetworkPolicy egress from
   exercises 3-5. Together they're the two-layer egress model from Concepts.
   (Don't leave a billed Azure Firewall running — tear down if you built one.)

8. **(WSL2/paper) Draw the layered path.** On the module-00 data-flow diagram,
   annotate each network control from Concepts (Firewall/NSG → WAF/Ingress →
   NetworkPolicy → mesh mTLS) at the point in the path it acts. For each, write
   one sentence on what an attacker who *defeated only that layer* would still
   be stopped by. This is defense-in-depth made explicit.

## Independent challenge

No YAML given — build it yourself using this module plus 03/11 (NetworkPolicy
ingress, Calico) and module 00 (assume-breach, defense in depth). On a
NetworkPolicy-enforcing cluster, deploy a three-tier app (frontend → backend →
"database") and impose a *zero-trust* network posture: default-deny both
ingress and egress in the namespace, then add only the minimum rules so that
the frontend can reach the backend, the backend can reach the database, DNS
works for all of them, and *nothing* can reach the internet or skip a tier
(the frontend must not reach the database directly). Prove each intended path
works and at least two unintended paths are blocked (frontend→database, and
any Pod→internet). Then, in two or three sentences, describe what service-mesh
mTLS would add on top of this policy that NetworkPolicy alone cannot provide,
naming the STRIDE categories (module 00) it addresses and which track owns it.

<details>
<summary>Stuck? One hint</summary>

Start with two namespace-wide default-deny policies (`podSelector: {}`, one
`policyTypes: [Ingress]`, one `[Egress]`), add the DNS-to-kube-system egress
allow (exercise 4), then add tier-to-tier rules pairing an *egress* allow on
the caller with an *ingress* allow on the callee (both directions must permit
it once both are default-denied). For the mTLS part: NetworkPolicy allows/denies
by IP/label but leaves traffic unencrypted and unauthenticated — mTLS
(Spoofing, Tampering, Information disclosure; track 13) encrypts it and proves
each end's cryptographic identity, so a Pod that stole another's IP still can't
present its cert.

</details>

## Common mistakes & troubleshooting

- **Forgetting to allow DNS after default-deny-egress.** Every name lookup
  fails and errors look like unrelated app bugs ("host not found"). Always add
  the UDP/TCP 53 egress allow to `kube-system` first — it's the #1 gotcha.
- **Only writing ingress policies.** Ingress-only leaves a compromised Pod free
  to phone home and exfiltrate. Egress control is the assume-breach half most
  teams skip and the higher-value one for containment.
- **Applying egress policy with a non-enforcing CNI.** Like ingress (03/11),
  egress policy is silently inert without a policy-enforcing CNI (Calico / Azure
  CNI with network policy) — confirm enforcement before trusting it.
- **Expecting NetworkPolicy to encrypt or authenticate traffic.** It only
  allows/denies by IP/label; traffic is still plaintext and unauthenticated.
  Encryption/identity is mTLS (a mesh, track 13) — a different, complementary
  layer.
- **Thinking NSGs can filter Pod-to-Pod traffic.** NSGs operate at the
  subnet/node level and often can't see traffic between Pods on the same node.
  Pod-level control needs NetworkPolicy; use NSGs/Firewall for node/subnet and
  internet egress.
- **Pairing only one direction after default-deny-both.** Once both directions
  are denied, a working connection needs an *egress* allow on the caller *and*
  an *ingress* allow on the callee — forgetting one silently blocks the path.
- **Treating "inside the cluster" as trusted.** Zero trust assumes the internal
  network is already hostile; a flat, unsegmented cluster lets one compromised
  Pod reach everything. Segment and control egress even internally.

## Checkpoint quiz

Write down your answer to each question before expanding it — checking without attempting first is the single easiest way to fool yourself into thinking you've learned this.

<details>
<summary>Show questions</summary>

1. Name the network defense-in-depth layers a request can pass through from the
   internet to a Pod's database call, and what each filters on.
2. Why is egress control (vs. ingress) especially important under an assume-
   breach mindset?
3. After applying a default-deny-egress policy, why does *DNS* break, and how do
   you fix it?
4. How do NSGs/Azure Firewall and Kubernetes NetworkPolicy divide the work —
   what can each see that the other can't?
5. What does service-mesh mTLS add that NetworkPolicy cannot, and which STRIDE
   categories does it address?
6. Once a namespace is default-deny for *both* ingress and egress, what two
   rules must exist for Pod A to reach Pod B?
7. What does "zero trust" mean on the network, and which controls from this
   track implement it?

</details>

<details>
<summary>Show answers</summary>

1. Azure Firewall/NSGs at the perimeter/subnet (IP/port/CIDR, and FQDN for
   Firewall, at node/subnet level); Ingress + WAF (L7 HTTP inspection at the
   entry point); Kubernetes NetworkPolicy (pod-to-pod by label, inside the
   cluster); service-mesh mTLS (encryption + workload identity between Pods).
   Each is independent, so defeating one still leaves the others.
2. Because a compromised Pod's first moves are usually *outbound* — phoning home
   to a C2 server, exfiltrating data, pulling a second-stage payload. Default-
   open egress lets it reach the whole internet; locking egress to only needed
   destinations contains the breach and turns unexpected outbound attempts into
   high-signal alerts.
3. A default-deny-egress policy also blocks the Pod's DNS lookups to CoreDNS in
   `kube-system`, so name resolution fails and everything looks broken. Fix by
   adding an egress allow rule to the `kube-system` namespace on UDP/TCP port
   53 before (or alongside) any other egress rules.
4. NSGs/Azure Firewall filter at the subnet/node level (IP ranges, ports, and
   FQDNs for Firewall) and govern node/subnet and internet traffic, but often
   can't see Pod-to-Pod traffic on the same node. NetworkPolicy filters at the
   Pod level by Kubernetes label inside the cluster — something NSGs can't see.
   Use both: Firewall for coarse node/internet egress, NetworkPolicy for fine
   pod-level control.
5. mTLS encrypts Pod-to-Pod traffic and authenticates both ends with
   cryptographic workload identities, which NetworkPolicy (which only
   allows/denies by IP/label, leaving traffic plaintext and unauthenticated)
   can't do. It addresses Spoofing (can't impersonate a workload without its
   cert) and Tampering/Information disclosure (traffic is encrypted and
   integrity-protected). A service mesh provides it; track 13 owns it.
6. An *egress* allow rule on Pod A permitting the connection to B, *and* an
   *ingress* allow rule on Pod B permitting the connection from A. Once both
   directions are default-denied, both halves must explicitly permit the path
   or it's blocked.
7. Zero trust means never trusting traffic just because it's "inside" the
   network — assume the internal network is already hostile and authenticate/
   authorize every connection. This track implements it via aggressive
   segmentation and egress control (NetworkPolicy), node/internet egress
   restriction (NSG/Firewall), and encrypted, identity-authenticated internal
   traffic (mesh mTLS).

</details>

## Next

Continue to
[07-incident-response-and-security-monitoring](../07-incident-response-and-security-monitoring/README.md)
— you've built the defenses; now learn what to *do* when one of them is
breached anyway, and where the signals that tell you live.
