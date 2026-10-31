# Security Mental Model and Threat Modeling

## Why this matters

Every earlier security lesson handed you a *fix* — run non-root, scope an
RBAC role, lock down a NetworkPolicy — without a framework for deciding
*which* fixes matter for *your* system. That's backwards, and it's how teams
end up hardening the wrong things while the real hole stays open. This module
gives you the thinking tools that come before any tool: how to enumerate what
an attacker could do (threat modeling), how to reason about your attack
surface and trust boundaries, and — critically for everything you've built on
Azure — exactly where the cloud provider's responsibility ends and yours
begins. Get this wrong and you'll assume "it's on AKS, so Azure secures it,"
which is false in specific, exploitable ways.

## Concepts

### Security is a property of a system, not a checklist

The Docker module (02/09) gave you a checklist: non-root, minimal image,
secrets at runtime. Checklists are useful but dangerous on their own — they
tell you what to do, never what you missed. A real security posture starts
from a different question: *what does an attacker want, and what paths could
they take to get it?* You work backward from the asset (customer data, a
signing key, cluster-admin) to the paths, and only then reach for controls.
The controls you already know are the *answers*; this module is about asking
the *questions* well enough that you pick the right answers.

### STRIDE: a vocabulary for "what could go wrong"

STRIDE is a mnemonic for six categories of threat. You don't need it to be
exhaustive — you need it to stop you forgetting a whole class of problem:

- **S**poofing — pretending to be someone/something you're not (a Pod using
  a stolen ServiceAccount token; a forged JWT). *Counter:* authentication —
  Azure AD-integrated RBAC (07/07), workload identity.
- **T**ampering — modifying data or code in transit or at rest (altering an
  image after it's built; changing a ConfigMap). *Counter:* integrity —
  image signing (previewed module 01), TLS, read-only root filesystems
  (module 03).
- **R**epudiation — doing something and being able to deny it (no audit
  trail of who deleted a Secret). *Counter:* logging and audit — Kubernetes
  audit logs, Azure Activity Log (module 07).
- **I**nformation disclosure — leaking data you shouldn't (a secret in a
  container layer from 02/09; an over-broad `list secrets` RBAC grant).
  *Counter:* confidentiality — encryption, least-privilege RBAC (03/11),
  Key Vault (module 02).
- **D**enial of service — making a system unavailable (a Pod with no
  resource limits exhausting a node). *Counter:* availability — quotas,
  limits, rate limiting.
- **E**levation of privilege — gaining rights you weren't granted (a
  container escape from a privileged Pod; a `hostPath` mount reaching the
  node). *Counter:* least privilege and isolation — Pod Security Admission
  (module 03), dropping capabilities, non-root.

Notice every control you've learned maps onto one of these six. STRIDE is
the index; the rest of this track is the content.

### Attack surface, trust boundaries, and data flow

Your **attack surface** is the sum of all points where an attacker can
interact with your system: exposed ports, the Kubernetes API server, a
public Ingress, a registry, the CI pipeline, every secret and token. Every
minimal-image and non-root lesson from 02/09 was, in this language, *attack-
surface reduction* — fewer binaries in the image means fewer things an
attacker who lands code execution can use (recall the distroless argument:
no shell means many post-exploitation techniques simply don't work).

A **trust boundary** is any line where data or control crosses from one
level of trust to another: the internet → your Ingress; a Pod → the API
server; your cluster → Key Vault; CI → your Azure subscription. Threats
cluster at trust boundaries, because that's where an attacker tries to get
something trusted to act on something untrusted. Drawing your system as a
**data-flow diagram** and marking every trust-boundary crossing is the
single most useful threat-modeling exercise — you then walk each crossing and
ask the six STRIDE questions about it.

### The shared-responsibility model: what Azure secures vs. what you own

This is the concept that most often bites people. In any managed cloud
service, security is *split* between provider and customer, and the split
moves depending on how managed the service is. The rule of thumb: **the more
the platform manages, the more it secures — but never all of it.**

- **IaaS (a bare VM in Azure):** Azure secures the physical datacenter, the
  hypervisor, and the network fabric. *You* own the guest OS, patching,
  every application, firewall rules, and identity. Most of the surface is
  yours.
- **AKS (managed Kubernetes):** Azure secures and patches the **control
  plane** (the API server, etcd, scheduler) and the physical/hypervisor
  layers. *You* still own: what runs in your Pods, node OS patching cadence
  (you trigger node image upgrades), RBAC design, NetworkPolicy, admission
  control, secrets, and workload identity. Azure running the API server does
  *not* mean Azure stops you deploying a privileged root container that
  mounts the host filesystem — that's entirely on you.
- **Azure Container Apps (ACA, track 06):** Azure manages even more — the
  cluster, the node pools, the ingress plumbing — so *more* of the surface is
  theirs. But you still own your image's contents, your app code, your
  secrets/identity configuration, and your ingress/auth settings.

The trap is assuming "managed" means "secured." Managed means *the provider
secures the layers it operates*. Everything you can still misconfigure is
still yours. A useful test: if you can break it with a `kubectl apply` or an
`az` command, it's your responsibility, not Azure's.

### Defense in depth and assume-breach

Two mindsets tie the track together. **Defense in depth** means no single
control is trusted to be sufficient — you layer them so that one failure
doesn't equal a breach (non-root *and* dropped capabilities *and*
NetworkPolicy *and* admission control, so a bypass of one still hits the
next). **Assume breach** means you design as if an attacker *will* get a
foothold, and ask "then what?" — this is what motivates the network
segmentation of module 06 and the entire incident-response discipline of
module 07. You'll see both repeatedly: every module adds a layer, and the
capstone stacks them.

### Threats are prioritized by risk, not by scariness

You cannot fix everything, so you rank. A rough, workable model is
**risk ≈ likelihood × impact**. A critical CVE in a package your app never
calls, on an internal-only Pod with no network egress, is lower risk than a
medium CVE in your public-facing Ingress controller. This is why image
scanners (module 01) report *severity* but you still apply *judgment* — a
severity score is an input to risk, not risk itself. Threat modeling's real
payoff is spending your limited hardening effort where likelihood and impact
are both high.

## Command reference

Threat modeling is mostly a thinking-and-diagramming activity, but a few
commands help you *inspect* the surface you're modeling. Real enforcement
tooling arrives in later modules.

| Command | What it does | Example |
|---|---|---|
| `kubectl auth can-i --list --as=<subject>` | Enumerates everything a subject is allowed to do — a fast attack-surface read of one identity | `kubectl auth can-i --list --as=system:serviceaccount:default:default` |
| `kubectl get pods -A -o jsonpath=...` | Scriptable inventory of what's running (privileged? hostNetwork?) — surface enumeration | see exercise 4 |
| `az account show` | Shows the subscription/tenant you're operating in — knowing your blast radius | `az account show --output table` |
| `az role assignment list --all` | Lists who has what Azure role — the identity attack surface at the cloud layer | `az role assignment list --all --output table` |
| `docker scout quickview <image>` | (From 02/09) a quick vulnerability read of an image's surface | `docker scout quickview myapp:latest` |

Flag breakdown for `kubectl auth can-i --list --as=system:serviceaccount:default:default`:

- `auth can-i` — the RBAC query subcommand (from 03/11).
- `--list` — instead of checking one verb/resource, dumps *all* verbs and
  resources the subject can access; the fastest way to see how much power an
  identity really has.
- `--as=system:serviceaccount:default:default` — impersonates the *default*
  ServiceAccount in the *default* namespace. Every Pod that doesn't name a
  ServiceAccount runs as this one, so it's a common first target — checking
  it tells you what a compromised generic Pod could reach.

Flag breakdown for `az role assignment list --all --output table`:

- `role assignment list` — lists Azure RBAC role assignments (who → what
  role → over what scope).
- `--all` — includes assignments inherited from higher scopes (management
  group, subscription), not just the current one, so you see the *full*
  identity picture rather than a partial view.
- `--output table` — human-readable columns instead of JSON.

## Hands-on exercises

These are analytical exercises with real inspection commands — the "tool" in
this module is your own reasoning. Work them in writing, not just in your head.

1. **(Paper/whiteboard) Draw a data-flow diagram** for the AKS app you built
   in track 07: internet → Ingress → Service → Pod → Key Vault, plus CI →
   ACR → cluster, plus a user → Azure AD → API server. Draw a dashed line at
   every trust boundary (internet/Ingress, Pod/API server, cluster/Key Vault,
   CI/subscription). You should find at least five crossings. Keep this
   diagram — later modules harden specific crossings on it.

2. **(Paper) Run STRIDE against one crossing.** Take the "internet → Ingress"
   boundary and write one concrete threat for each of the six STRIDE letters
   (e.g. Spoofing: a client presenting a forged auth token; DoS: a flood of
   requests with no rate limit). For each, note which control (and which
   earlier module) counters it. If you can't name a control for a letter,
   that's a real gap to remember.

3. **(WSL2) Enumerate the default ServiceAccount's power.** On your kind
   cluster from track 03:
   ```bash
   kubectl auth can-i --list --as=system:serviceaccount:default:default
   ```
   Expect a short list (mostly `selfsubjectreviews`/`selfsubjectrulesreviews`
   — near-zero real power on a well-configured cluster). Now imagine that
   ServiceAccount were bound to `cluster-admin`. Write one sentence on why
   "a compromised generic Pod" becomes catastrophic in that case — this is
   the elevation-of-privilege path you'll block in modules 03-04.

4. **(WSL2) Inventory your real attack surface.** Find every Pod that runs
   privileged or uses host namespaces — these are your highest-value targets:
   ```bash
   kubectl get pods -A -o jsonpath='{range .items[*]}{.metadata.namespace}{"\t"}{.metadata.name}{"\t"}{.spec.hostNetwork}{"\t"}{range .spec.containers[*]}{.securityContext.privileged}{" "}{end}{"\n"}{end}'
   ```
   Expect mostly `<none>`/`false`. Any `true` is a Pod that, if compromised,
   is close to owning the node. Note which they are (often CNI/monitoring
   system Pods) — knowing *why* each one legitimately needs that power is
   part of threat modeling, not a reason to panic.

5. **(Azure) Map the shared-responsibility line for AKS.** For each of these,
   write "Azure" or "You": patching the API server; patching the node OS;
   deciding a Pod runs as root; encrypting etcd; writing a NetworkPolicy;
   rotating a Key Vault secret; physical datacenter security. Then check your
   answers against the Concepts section. The pattern to internalize: control
   plane and infrastructure = Azure; workloads, config, and identity = you.

6. **(Azure) See your cloud identity surface.**
   ```bash
   az role assignment list --all --output table
   ```
   Note how many identities have `Owner` or `Contributor` at subscription
   scope. Each is a full-subscription blast radius if compromised. Write down
   whether any *service principal* (not a person) has broad rights — those
   are common long-lived-secret liabilities you'll revisit in module 02.

7. **(Paper) Prioritize by risk, not scariness.** Given three findings — (a)
   a critical CVE in a library your app imports but an internal-only Pod with
   no egress, (b) a medium CVE in your public Ingress controller, (c) a
   ServiceAccount with `list secrets` cluster-wide bound to a public-facing
   Pod — rank them by `likelihood × impact` and justify the order in one
   sentence each. There's no single right answer; the *reasoning* is the
   skill.

8. **(Paper) Assume breach.** Pick the scenario "an attacker has code
   execution inside one of your application Pods." List, in order, the next
   five things they'd try (read the SA token? scan the Pod network? reach the
   metadata endpoint? read mounted secrets? call the API server?). Each item
   you list is something a later module will teach you to block — keep the
   list.

## Independent challenge

No framework template given — build it yourself using this module plus what
you know from 02/09 (image hardening), 03/11 (RBAC and NetworkPolicy), and
07/07 (AAD-RBAC and Key Vault). Produce a one-page threat model for a
realistic system: a public-facing web app running on AKS, pulling images from
ACR, reading a database password from Key Vault via the CSI driver, deployed
by a CI pipeline. Draw the data-flow diagram, mark every trust boundary, and
for the two boundaries you judge highest-risk, enumerate STRIDE threats and
name the specific control (and the earlier module that taught it) that
counters each. Finish with an explicit shared-responsibility table for this
system: three things Azure secures for you and three things that remain
yours. The deliverable is the reasoning, not a tool output — you should be
able to hand this page to a teammate and have them understand where the real
risks are.

<details>
<summary>Stuck? One hint</summary>

Start from the assets and work outward: the database password and cluster-
admin are your crown jewels. Trace every path that reaches them (a public
request, a Pod's SA token, the CI credential, the Key Vault access policy),
and you'll find your trust boundaries are exactly those paths. For the
shared-responsibility table, use the "can I break it with `kubectl apply` or
`az`?" test — if yes, it's yours.

</details>

## Common mistakes & troubleshooting

- **Treating "managed" as "secured."** AKS securing the control plane says
  nothing about your workloads; you can still deploy a root, privileged,
  host-mounting Pod on a perfectly patched managed cluster. The provider
  secures what it *operates*, not what you *configure*.
- **Threat-modeling the whole system at once and giving up.** Model one
  trust boundary at a time. Six STRIDE questions against one crossing is a
  15-minute exercise; the whole system at once is paralysis.
- **Confusing a severity score with risk.** A critical CVE on an unreachable
  internal Pod can be lower risk than a medium one on your public edge.
  Severity is an input; risk is `likelihood × impact` in *your* context.
- **Reaching for a control before naming the threat.** "We should add
  Gatekeeper" is not a plan until you can say which threat it counters.
  Controls without a named threat are how effort gets spent in the wrong
  place.
- **Forgetting the default ServiceAccount.** Every Pod that doesn't name one
  gets `default`; if that's ever over-privileged, *every* generic Pod
  inherits the power. It's an easy blind spot in surface enumeration.
- **Assuming defense-in-depth layers are redundant, so skipping some.** They
  aren't redundant — each exists to catch the failure of another. "Non-root
  makes admission control unnecessary" is exactly the reasoning that leads to
  a single-point-of-failure posture.

## Checkpoint quiz

Write down your answer to each question before expanding it — checking without attempting first is the single easiest way to fool yourself into thinking you've learned this.

<details>
<summary>Show questions</summary>

1. What does each letter of STRIDE stand for, and name one control (from any
   earlier module) that counters each?
2. What is a trust boundary, and why do threats cluster at them?
3. On AKS, name two things Azure secures for you and three things that remain
   your responsibility.
4. Why is a critical-severity CVE not automatically higher risk than a
   medium-severity one?
5. What is the "assume breach" mindset, and how does it change how you design
   a system versus assuming your perimeter holds?
6. What's the quick test for deciding whether something on AKS is Azure's
   responsibility or yours?
7. Why is the default ServiceAccount a specific thing to check when
   enumerating attack surface?

</details>

<details>
<summary>Show answers</summary>

1. **S**poofing (counter: authentication — AAD-RBAC, workload identity);
   **T**ampering (integrity — image signing, TLS, read-only root FS);
   **R**epudiation (audit logging — Kubernetes/Azure audit logs);
   **I**nformation disclosure (confidentiality — least-privilege RBAC, Key
   Vault, no secrets in layers); **D**enial of service (availability —
   resource limits/quotas, rate limiting); **E**levation of privilege (least
   privilege/isolation — Pod Security Admission, dropped capabilities,
   non-root).
2. A trust boundary is any line where data or control crosses between
   different levels of trust (internet→Ingress, Pod→API server,
   cluster→Key Vault, CI→subscription). Threats cluster there because that's
   where an attacker tries to get a trusted component to act on untrusted
   input — it's where authentication, validation, and authorization decisions
   happen.
3. Azure secures: the control plane (API server, etcd, scheduler), the
   hypervisor, and the physical datacenter/network fabric. You own: what runs
   in Pods (including whether they're privileged/root), node OS patch
   cadence, RBAC/NetworkPolicy/admission design, secrets, and workload
   identity configuration.
4. Because risk ≈ likelihood × impact in your specific context. A critical
   CVE in a code path your app never executes, on an internal Pod with no
   network egress, has low likelihood of exploitation and limited impact; a
   medium CVE on a public-facing component may be far more reachable.
   Severity is one input to risk, not risk itself.
5. Assume breach means designing as if an attacker *will* get a foothold and
   asking "then what?" — it drives segmentation, least privilege, and
   incident-response planning. It differs from perimeter thinking by not
   trusting any single boundary to hold, so a breach of one layer is
   contained rather than total.
6. If you can break/misconfigure it with a `kubectl apply` or an `az`
   command, it's your responsibility; if it's a layer Azure operates and you
   can't touch (the API server internals, the hypervisor), it's Azure's.
7. Every Pod that doesn't explicitly name a ServiceAccount runs as `default`.
   If that account is ever over-privileged, every generic Pod silently
   inherits that power — making it a common, easily-overlooked elevation-of-
   privilege path worth checking first.

</details>

## Next

Continue to
[01-image-scanning-and-supply-chain-basics](../01-image-scanning-and-supply-chain-basics/README.md)
to start *finding* the problems your threat model says matter — beginning
with what's actually inside your images.
