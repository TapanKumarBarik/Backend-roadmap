# Policy as Code: OPA/Gatekeeper

## Why this matters

Module 03 ended on a hard limit: Pod Security Admission enforces exactly three
fixed Standards and can't express a rule like "images must come from *our*
ACR" or "every Pod must carry a `team` label." Real organizations have dozens
of such rules, and writing them into a wiki that humans are supposed to
remember is how they get ignored. **Policy as code** means those rules live as
version-controlled, automatically-enforced admission logic — the same shift
from "please remember to" to "the system won't let you" that PSA made, but for
*arbitrary* rules you define. OPA/Gatekeeper is the de-facto Kubernetes tool
for this, and it's also the engine underneath Azure Policy for AKS (module
05), so learning it here pays off twice.

## Concepts

### The admission-controller idea, generalized

03 introduced admission control via PSA — the API server consulting a
controller before persisting an object. **Gatekeeper** is a *validating
admission webhook*: the API server sends every create/update to Gatekeeper,
which evaluates your policies and returns admit-or-reject. Where PSA has three
built-in profiles, Gatekeeper runs *your* logic. It's built on **OPA (Open
Policy Agent)**, a general-purpose policy engine, and its rules are written in
a language called **Rego**. You rarely need deep Rego for common cases —
Gatekeeper's `ConstraintTemplate`/`Constraint` split (below) lets you reuse
parameterized templates — but knowing Rego sits underneath demystifies what's
happening.

### ConstraintTemplate vs. Constraint: the reusable-rule split

Gatekeeper deliberately separates *the rule's logic* from *the rule's
application*, mirroring the Role/RoleBinding split you already know from 03/11:

- A **ConstraintTemplate** defines the *logic* (in Rego) and a *schema* of
  parameters — e.g. "reject any Pod using a container image whose registry
  isn't in an allowed list," with `allowedRegistries` as a parameter. It's a
  reusable definition; on its own it enforces nothing (inert until used —
  exactly like a `Role` with no binding, or an Ingress with no controller).
- A **Constraint** is an *instance* of a template that turns it on: it picks
  the template, supplies the parameter values (`allowedRegistries:
  ["myreg.azurecr.io"]`), and scopes *which* resources it applies to (via
  `match` on kinds/namespaces). This is what actually enforces.

So one `ConstraintTemplate` ("allowed registries") can back many `Constraint`s
(a strict one for `prod`, a lax one for `dev`) — write the logic once, apply it
many ways. This is the whole reason Gatekeeper scales where hand-written
webhooks don't.

### Enforcement actions: deny, dryrun, warn — audit before you block

Just like PSA's `enforce`/`audit`/`warn`, a Constraint has an
`enforcementAction`:

- `deny` (default) — reject violating resources at admission (hard block).
- `dryrun` — *don't* block; only record violations in the Constraint's
  `status` (visible via `kubectl get <constraint> -o yaml`). This is how you
  measure "what would this policy break?" against a live cluster *before*
  turning it on.
- `warn` — allow but return a warning to the applier.

The disciplined rollout is identical to module 03's: deploy a new policy as
`dryrun`, look at the audit results to find legitimate workloads it would
wrongly block, adjust the policy or add exemptions, *then* switch to `deny`.
Shipping a `deny` policy straight to prod without a `dryrun` pass is how you
cause an outage with a security control — the irony every platform team learns
once.

### Audit mode: continuous evaluation of *existing* objects

Admission only checks objects *as they're created or updated*. But a policy
you add today should also tell you about the violating objects *already* in the
cluster. Gatekeeper's **audit** runs periodically, evaluates all existing
resources against every Constraint, and writes violations into each
Constraint's `status.violations`. So `dryrun` + audit together answer "how bad
is it right now?" without blocking anything — essential for adopting policy on
a cluster that's already running real workloads.

### Exemptions: when a legitimate workload must break the rule

Real clusters always have a legitimate exception — the monitoring agent that
genuinely needs `hostPath`, the ingress controller that genuinely needs a
privileged port. Blanket policies that can't be exempted get disabled. The
right pattern is a *narrow, explicit, auditable* exemption rather than turning
the policy off. In Gatekeeper you scope exemptions through the Constraint's
`match` block:

- `match.namespaces` / `excludedNamespaces` — apply to (or skip) specific
  namespaces (commonly exclude `kube-system` and other infra namespaces).
- `match.labelSelector` — apply only to resources with (or without) a label,
  so you can exempt a specific workload by labeling it explicitly.

The key security principle: an exemption should be *specific and visible in the
policy*, so it's reviewable, not a global "off switch." This module's
diagnose-and-fix exercise is exactly this scenario.

### Where Gatekeeper fits with PSA and Azure Policy

Layering, not replacing: **PSA** cheaply enforces the common Pod-hardening
baseline (module 03). **Gatekeeper** enforces your *custom* rules PSA can't
express. **Azure Policy for AKS** (module 05) is Gatekeeper *managed by Azure*
— Azure installs the Gatekeeper add-on and ships a library of built-in
ConstraintTemplates you assign as Azure policies, giving you the same
enforcement plus central Azure-side reporting across many clusters. So the
Rego/Constraint concepts here are the exact foundation module 05 builds on;
you're learning the engine before you learn its managed wrapper.

## Command reference

| Command | What it does | Example |
|---|---|---|
| `kubectl apply -f gatekeeper.yaml` | Installs Gatekeeper (CRDs + controller) into the cluster | see exercise 1 |
| `kubectl get constrainttemplates` | Lists installed policy *templates* (the reusable logic) | `kubectl get constrainttemplates` |
| `kubectl get constraints` | Lists all Constraint instances across every template kind | `kubectl get constraints` |
| `kubectl get <ConstraintKind> <name> -o yaml` | Shows a Constraint's config *and* its audit `status.violations` | `kubectl get K8sAllowedRepos repo-is-acr -o yaml` |
| `kubectl describe <ConstraintKind> <name>` | Human-readable view including current violations | `kubectl describe K8sRequiredLabels must-have-team` |
| `enforcementAction: dryrun` | Makes a Constraint report-only (audit) instead of blocking | see exercise 5 |
| `spec.match.kinds` / `match.namespaces` / `match.excludedNamespaces` | Scopes which resources a Constraint applies to (and exemptions) | see exercise 6 |
| `spec.parameters` | Supplies the template's parameter values (allowed repos, required labels) | see exercise 3 |

Flag breakdown for a `Constraint`'s key fields (from exercise 3/6):

- `apiVersion: constraints.gatekeeper.sh/v1beta1` + `kind: K8sAllowedRepos` —
  the Constraint's kind is *the name declared by its ConstraintTemplate*, not a
  generic `Constraint` — installing a template creates a new CRD kind.
- `spec.enforcementAction: deny` — reject violations at admission (`dryrun` =
  report only, `warn` = allow with warning).
- `spec.match.kinds: [{apiGroups: [""], kinds: ["Pod"]}]` — evaluate this
  Constraint only against `Pod` objects.
- `spec.match.namespaces` / `excludedNamespaces` — restrict enforcement to (or
  exempt) named namespaces; excluding `kube-system` is standard so you don't
  block cluster infra.
- `spec.match.labelSelector` — further narrow by label, the mechanism for
  exempting a specifically-labeled workload.
- `spec.parameters` — the values the template's Rego reads (e.g. `repos:
  ["myreg.azurecr.io/"]`).

## Hands-on exercises

All on your local kind cluster from track 03 — no Azure cost. Gatekeeper
installs as a set of Pods.

1. **(WSL2) Install Gatekeeper.**
   ```bash
   kubectl apply -f https://raw.githubusercontent.com/open-policy-agent/gatekeeper/v3.16.0/deploy/gatekeeper.yaml
   kubectl get pods -n gatekeeper-system
   ```
   Expect the `gatekeeper-controller-manager` and `gatekeeper-audit` Pods to
   reach `Running`. This installs the CRDs (`ConstraintTemplate`, plus the
   machinery to create Constraint kinds) and the admission webhook.

2. **(WSL2) Create a namespace and a policy-free baseline.**
   ```bash
   kubectl create namespace policy-lab
   kubectl run pre-policy --image=nginx:latest -n policy-lab
   kubectl get pod pre-policy -n policy-lab
   ```
   Expect it to run — `nginx:latest` from Docker Hub, no policy yet. You'll
   block exactly this kind of "not from our registry / uses `latest`" image
   next.

3. **(WSL2) Write a ConstraintTemplate that requires a `team` label.** This is
   a rule PSA cannot express:
   ```bash
   kubectl apply -f - <<'EOF'
   apiVersion: templates.gatekeeper.sh/v1
   kind: ConstraintTemplate
   metadata:
     name: k8srequiredlabels
   spec:
     crd:
       spec:
         names: {kind: K8sRequiredLabels}
         validation:
           openAPIV3Schema:
             type: object
             properties:
               labels: {type: array, items: {type: string}}
     targets:
       - target: admission.k8s.gatekeeper.sh
         rego: |
           package k8srequiredlabels
           violation[{"msg": msg}] {
             required := input.parameters.labels
             provided := input.review.object.metadata.labels
             missing := required[_]
             not provided[missing]
             msg := sprintf("missing required label: %v", [missing])
           }
   EOF
   kubectl get constrainttemplates
   ```
   Expect `k8srequiredlabels` listed. Note it enforces *nothing* yet — it's the
   reusable logic, inert until a Constraint uses it (the Role-without-binding
   pattern).

4. **(WSL2) Create the Constraint that turns the rule on.**
   ```bash
   kubectl apply -f - <<'EOF'
   apiVersion: constraints.gatekeeper.sh/v1beta1
   kind: K8sRequiredLabels
   metadata:
     name: pods-must-have-team
   spec:
     enforcementAction: deny
     match:
       kinds: [{apiGroups: [""], kinds: ["Pod"]}]
       namespaces: ["policy-lab"]
     parameters:
       labels: ["team"]
   EOF
   ```
   Now test both paths:
   ```bash
   kubectl run no-label --image=nginx:latest -n policy-lab
   kubectl run with-label --image=nginx:latest -n policy-lab --labels team=payments
   ```
   Expect `no-label` to be *rejected* with `missing required label: team`, and
   `with-label` to succeed. You just enforced a rule PSA has no concept of.

5. **(WSL2) See dryrun/audit mode measure impact without blocking.** Switch the
   Constraint to `dryrun` and check what it *would* flag among existing Pods:
   ```bash
   kubectl patch K8sRequiredLabels pods-must-have-team --type merge -p '{"spec":{"enforcementAction":"dryrun"}}'
   kubectl run would-fail --image=nginx:latest -n policy-lab   # succeeds now, under dryrun
   sleep 60   # let the audit loop run
   kubectl get K8sRequiredLabels pods-must-have-team -o jsonpath='{.status.violations}' | head
   ```
   Expect `would-fail` (and `pre-policy` from exercise 2) to be *admitted* but
   *listed in `status.violations`*. This is the pre-enforcement measurement:
   you can see everything the policy would block, on a running cluster, without
   blocking anything.

6. **Diagnose and fix: a policy blocking a legitimate deployment, resolved with
   a targeted exemption.** Write an allowed-registry policy in `deny` mode:
   ```bash
   kubectl apply -f - <<'EOF'
   apiVersion: templates.gatekeeper.sh/v1
   kind: ConstraintTemplate
   metadata: {name: k8sallowedrepos}
   spec:
     crd:
       spec:
         names: {kind: K8sAllowedRepos}
         validation:
           openAPIV3Schema:
             type: object
             properties:
               repos: {type: array, items: {type: string}}
     targets:
       - target: admission.k8s.gatekeeper.sh
         rego: |
           package k8sallowedrepos
           violation[{"msg": msg}] {
             container := input.review.object.spec.containers[_]
             satisfied := [good | repo := input.parameters.repos[_]; good := startswith(container.image, repo)]
             not any(satisfied)
             msg := sprintf("image %v is not from an allowed registry", [container.image])
           }
   EOF
   kubectl apply -f - <<'EOF'
   apiVersion: constraints.gatekeeper.sh/v1beta1
   kind: K8sAllowedRepos
   metadata: {name: only-acr}
   spec:
     enforcementAction: deny
     match:
       kinds: [{apiGroups: [""], kinds: ["Pod"]}]
       namespaces: ["policy-lab"]
     parameters:
       repos: ["myreg.azurecr.io/"]
   EOF
   ```
   Now a *legitimate* need arises: you must run the official `ingress-nginx`
   controller image (from `registry.k8s.io`, not your ACR) in this namespace.
   Reproduce the block:
   ```bash
   kubectl run legit-ingress --image=registry.k8s.io/ingress-nginx/controller:v1.11.0 -n policy-lab --labels team=platform
   ```
   Expect rejection: `image ... is not from an allowed registry`. **Wrong
   fix:** delete the policy (removes protection for everything). **Right fix:**
   a narrow, explicit exemption — label the legitimate workload and exclude
   that label from the Constraint's `match`:
   ```bash
   kubectl patch K8sAllowedRepos only-acr --type merge -p '{"spec":{"match":{"labelSelector":{"matchExpressions":[{"key":"registry-exempt","operator":"DoesNotExist"}]}}}}'
   kubectl run legit-ingress --image=registry.k8s.io/ingress-nginx/controller:v1.11.0 -n policy-lab --labels team=platform,registry-exempt=true
   ```
   Expect the exempted Pod (carrying `registry-exempt=true`) to be admitted,
   while any *un*labeled off-registry Pod is still blocked:
   ```bash
   kubectl run still-blocked --image=docker.io/library/redis:7 -n policy-lab --labels team=data
   ```
   Expect `still-blocked` rejected. The policy stayed on; only a specific,
   labeled, reviewable workload was let through — exemption, not off-switch.

7. **(WSL2) Confirm the audit view of remaining violations.**
   ```bash
   kubectl get K8sAllowedRepos only-acr -o jsonpath='{.status.violations}' | head
   ```
   Expect any still-non-compliant existing Pods listed — Gatekeeper's audit
   continuously reporting drift, not just blocking new creates.

8. **(WSL2) Clean up.**
   ```bash
   kubectl delete namespace policy-lab
   kubectl delete K8sRequiredLabels pods-must-have-team 2>/dev/null; true
   kubectl delete K8sAllowedRepos only-acr 2>/dev/null; true
   kubectl delete constrainttemplate k8srequiredlabels k8sallowedrepos
   # Optional: remove Gatekeeper entirely
   # kubectl delete -f https://raw.githubusercontent.com/open-policy-agent/gatekeeper/v3.16.0/deploy/gatekeeper.yaml
   ```

## Independent challenge

No full policy given — build it yourself using this module plus 02/09 (why
`latest` and unknown registries are risks) and module 03 (audit-before-enforce
discipline). On your Gatekeeper-enabled cluster, author a policy that blocks
container images using the `:latest` tag (or no tag) in a target namespace —
a real misconfiguration, since `latest` is a moving target you can't reason
about or roll back. Roll it out the disciplined way: deploy it in `dryrun`
first, use the audit `status.violations` to enumerate every existing Pod it
would break, then switch to `deny` and prove a `:latest` Pod is rejected while
a pinned-tag Pod is admitted. Finally, introduce one legitimate workload that
*must* use `latest` (pretend it's a vendor image with no pinned tag) and grant
it a narrow, labeled exemption rather than weakening the policy — proving the
exemption works while an unlabeled `:latest` Pod is still blocked.

<details>
<summary>Stuck? One hint</summary>

The Rego check is roughly: for each container, `endswith(container.image,
":latest")` OR the image contains no `:` at all (untagged defaults to
`latest`) → violation. Structure it as a ConstraintTemplate (the logic) plus a
Constraint (matching `Pod` in your namespace, `enforcementAction: dryrun`
first). For the exemption, reuse exercise 6's pattern: a `labelSelector` with
`operator: DoesNotExist` on an exemption label, and put that label only on the
one blessed workload.

</details>

## Common mistakes & troubleshooting

- **Creating a ConstraintTemplate and expecting enforcement.** The template is
  inert logic — nothing happens until you create a Constraint *instance* of it
  (the Role-without-binding trap from 03/11, again).
- **Shipping a `deny` policy straight to prod.** Without a `dryrun`/audit pass
  you can't see which legitimate workloads it breaks — and a security control
  causing an outage is how policy-as-code gets a bad reputation. Always
  `dryrun` first.
- **Disabling a whole policy to unblock one workload.** That removes protection
  for everything. Use a narrow, labeled, reviewable exemption via `match`
  instead — specific and visible in the policy.
- **Forgetting to exclude infra namespaces.** A cluster-wide `deny` policy that
  also selects `kube-system`/`gatekeeper-system` can block the very system
  Pods that keep the cluster (and Gatekeeper) running. Exclude infra
  namespaces explicitly.
- **Expecting audit results instantly.** Gatekeeper's audit runs on an
  interval (tens of seconds by default); `status.violations` populates after
  the next cycle, not the moment you apply the Constraint.
- **Assuming Gatekeeper replaces PSA.** They layer: PSA for the cheap built-in
  Pod-hardening baseline, Gatekeeper for custom rules PSA can't express. Most
  clusters run both.
- **Rego typos failing open, not closed.** A broken Rego rule may evaluate to
  "no violation" and silently admit everything — always *test that a known-bad
  object is actually rejected*, not just that a good one passes.

## Checkpoint quiz

Write down your answer to each question before expanding it — checking without attempting first is the single easiest way to fool yourself into thinking you've learned this.

<details>
<summary>Show questions</summary>

1. What does Gatekeeper add that Pod Security Admission (module 03) cannot do?
2. What's the relationship between a ConstraintTemplate and a Constraint, and
   which one actually enforces anything?
3. What does `enforcementAction: dryrun` do, and why is it the right first step
   for any new policy?
4. What does Gatekeeper's audit provide beyond admission-time checks?
5. A legitimate workload must violate a policy. What's the right way to let it
   through, and what's the wrong way?
6. Why should a cluster-wide `deny` Constraint usually exclude `kube-system`?
7. How does Gatekeeper relate to Azure Policy for AKS (a preview of module 05)?
8. Why is "the good Pod was admitted" an insufficient test of a new policy?

</details>

<details>
<summary>Show answers</summary>

1. Custom, arbitrary admission rules PSA has no concept of — e.g. "images must
   come from our ACR", "every Pod must have a `team` label", "no `:latest`
   tags". PSA only enforces its three fixed Pod Security Standards; Gatekeeper
   runs your own Rego logic.
2. A ConstraintTemplate defines the reusable rule logic (in Rego) plus a
   parameter schema and declares a new Constraint *kind*; a Constraint is an
   instance of that template that supplies parameter values and a `match`
   scope. Only the Constraint enforces — the template alone is inert (like a
   Role with no RoleBinding).
3. `dryrun` makes the Constraint report-only: it records what it *would* block
   in `status.violations` without rejecting anything. It's the right first step
   because it measures the policy's real blast radius against live workloads,
   so you can fix or exempt legitimate breakages before switching to `deny`.
4. Audit periodically re-evaluates *existing* resources (not just newly
   created/updated ones) against every Constraint and writes matches into
   `status.violations` — so it surfaces already-running non-compliant objects
   and ongoing drift, which admission-time checks alone would never catch.
5. Right: a narrow, explicit exemption scoped in the Constraint's `match`
   (e.g. an exemption label the workload carries, or an excluded namespace) so
   it's specific, reviewable, and leaves the policy protecting everything else.
   Wrong: deleting or disabling the whole policy, which removes protection for
   all workloads to accommodate one.
6. Because a cluster-wide `deny` that also selects `kube-system` can reject the
   system Pods that keep the cluster (and Gatekeeper itself) running,
   potentially breaking the cluster. Infra namespaces host workloads that
   legitimately need powers your policy forbids, so they're normally excluded.
7. Azure Policy for AKS *is* Gatekeeper managed by Azure — Azure installs the
   Gatekeeper add-on and provides a library of built-in ConstraintTemplates you
   assign as Azure policies, adding central Azure-side reporting across
   clusters. The Rego/Constraint concepts here are exactly what module 05
   builds on.
8. Because a broken or too-narrow Rego rule can fail *open* — evaluate to "no
   violation" and admit everything, including bad objects. You must verify a
   known-bad object is actually *rejected*; only testing that a good object
   passes can hide a policy that isn't really enforcing anything.

</details>

## Next

Continue to
[05-azure-policy-and-governance-guardrails](../05-azure-policy-and-governance-guardrails/README.md)
— take the admission-control idea up to the Azure control plane, enforcing
guardrails across whole subscriptions, not just one cluster.
