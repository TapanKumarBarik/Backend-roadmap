# Capstone Project: A Defensible Deployment, End to End

## Why this matters

Every module in this track added one layer of defense in isolation — a
scanned image, a hardened `securityContext`, a Gatekeeper policy, an Azure
guardrail, an incident runbook. Real security is none of those alone; it's all
of them *stacked and working together* so that the failure of any one is
caught by another (defense in depth, module 00). This capstone is where you
prove you can assemble the whole stack on a real cluster and — just as
important — write down what you'd do when it's breached anyway. There's no
solution given and no quiz. Finishing this is what "you can secure the stack"
means: you build it, you defend it, and you have a plan for the day a defense
fails.

## The project

Take a small containerized web application (reuse one from the Docker or
Kubernetes tracks, or write a trivial Flask/Node app) and stand it up on a
cluster such that it is scanned, hardened, policy-constrained at both the
Kubernetes and Azure layers, and backed by a written incident-response plan.
You may do this on your **AKS cluster** from track 07 (for the Azure Policy and
Defender pieces you'll need it) — but you can develop and test the
Kubernetes-layer pieces (Gatekeeper, Pod Security Admission) on a local
**kind** cluster first to save cost, then reproduce on AKS. Clean up billable
resources when done.

The five required pillars, each drawing on a specific module:

1. **A scanned-and-hardened image** (modules 01, 02/09) — built from a current,
   minimal base, running non-root, with no secrets baked into layers, and
   passing a Trivy scan gate at a severity threshold you can justify.
2. **A Gatekeeper policy enforced on the cluster** (module 04) — a real
   `ConstraintTemplate` + `Constraint` that blocks a real misconfiguration
   (e.g. disallowed registries, missing required labels, or `:latest` tags),
   rolled out audit-first then set to `deny`, with a narrow exemption for any
   legitimate infra workload that needs one.
3. **Pod Security Admission at the `restricted` level** (module 03) — your
   application's namespace enforcing the `restricted` Pod Security Standard,
   with your app's Pod actually admitted and running under it (proper
   `securityContext`: non-root, no privilege escalation, all capabilities
   dropped, seccomp `RuntimeDefault`, read-only root FS with writable volumes
   only where needed).
4. **An Azure Policy guardrail assigned** (module 05) — at least one built-in
   Azure policy definition assigned to a scope covering your environment
   (e.g. "AKS clusters should not allow privileged containers", "allowed
   locations", or "storage accounts should disallow public access"),
   promoted from `Audit` to `Deny` (or left in `Audit` with a written
   justification), with compliance verified.
5. **A written incident-response runbook** (module 07) for a specific,
   realistic scenario — use: *"a container in this cluster starts making
   outbound connections to an unknown external IP — what do you do, in
   order?"* The runbook must give the ordered steps (detect → preserve
   evidence → isolate → rotate → root-cause → remediate), the exact command
   for each step, who is responsible, and the check that tells you it's
   contained.

### Acceptance checklist

Work isn't done until you can demonstrate every one of these:

- [ ] The application image is built from a current, minimal base and runs as
      a non-root user; `docker inspect`/`whoami` confirms non-root.
- [ ] No secret appears in `docker history` / the image layers; any secret the
      app needs is injected at runtime (env/mounted file), not baked in.
- [ ] A Trivy scan runs as a **gate** (`--exit-code 1 --severity <threshold>
      --ignore-unfixed`) and the image **passes** it; you can articulate why
      you chose that threshold and how you handle unfixable CVEs.
- [ ] A Gatekeeper `ConstraintTemplate` + `Constraint` is installed, was rolled
      out in `dryrun`/audit first, and is now in `deny`; a **known-bad** object
      is actually **rejected** (not just a good one admitted).
- [ ] The Gatekeeper policy has a **narrow, labeled/namespaced exemption** for
      at least one legitimate workload — not a global off-switch — and an
      unexempted violation is still blocked.
- [ ] The app's namespace is labeled `pod-security.kubernetes.io/enforce=
      restricted`; the app Pod is admitted and `Running` under it, and a
      deliberately non-compliant Pod (e.g. privileged) is **rejected**.
- [ ] The app's `securityContext` satisfies `restricted`: `runAsNonRoot`, no
      privilege escalation, `capabilities.drop: ["ALL"]`, seccomp
      `RuntimeDefault`, and `readOnlyRootFilesystem` with writable volumes only
      where the app genuinely writes.
- [ ] At least one Azure Policy built-in is **assigned** to a scope covering
      your environment, its **compliance state** is visible, and either it's in
      `Deny` (with a blocked create demonstrated) or in `Audit` with a written
      reason.
- [ ] The incident-response runbook exists in writing, is scenario-specific,
      lists the steps **in the correct order**, gives the exact command per
      step, and ends with the single detection signal you'd add so the scenario
      fires an alert automatically next time.
- [ ] You can point at your module-00 data-flow diagram and name which layer
      each of the five pillars defends — demonstrating you understand *why*
      they stack, not just that they're present.
- [ ] All billable Azure resources (AKS cluster, any Defender plan, any
      firewall) are cleaned up or accounted for when you're done.

### Hints (not a solution)

- **Sequence it the way the track was ordered.** Harden and scan the image
  first (you can't deploy what won't pass its own gate), then get it running
  under `restricted` PSA (fix the `securityContext` until it's admitted), then
  layer Gatekeeper on top, then the Azure guardrail, then write the runbook
  last — by then you understand the system well enough to write a good one.
- **Develop the Kubernetes pillars on kind first.** PSA and Gatekeeper behave
  the same locally and cost nothing; move to AKS only when you need the Azure
  Policy and (optional) Defender pieces. Azure Policy's AKS add-on (module 05)
  is *managed Gatekeeper* — if you enable it, don't also hand-install a
  conflicting Gatekeeper for the same rule.
- **Test the bad path, not just the good one.** For every control, the proof is
  a *rejected* known-bad object (module 04's "fail-open" warning). "My good Pod
  runs" tells you nothing about whether the policy actually enforces.
- **Roll out every enforcing control audit-first.** PSA `warn`/`--dry-run`,
  Gatekeeper `dryrun`, Azure Policy `Audit` — measure blast radius before you
  block, so a security control doesn't cause your own outage.
- **Build the runbook from your threat model.** The rotation checklist in the
  runbook *is* the list of everything the compromised Pod's identity could
  reach (its SA token, mounted secrets, Key Vault access) — that's a module-00
  blast-radius exercise, not guesswork. Order matters: preserve evidence and
  isolate before you rotate or delete (module 07).
- **Exemptions should be visible and narrow.** A labeled exemption on one
  workload that a reviewer can see in the policy is right; disabling the policy
  to unblock something is wrong (modules 03/04).
- **Don't gold-plate.** Five solid, demonstrably-enforcing pillars beat ten
  half-configured ones. Depth on each acceptance item is the goal.

## Next

**Before you move on:** if any acceptance item is checked only because "it
applied without error," go back and prove it the hard way — reject a known-bad
object, show the blocked create, watch the isolation actually cut the Pod's
egress. A control you haven't seen *stop something* is a control you haven't
verified. When every box is genuinely ticked and your billable resources are
cleaned up, you've finished the track: you can threat-model, scan, harden,
enforce policy at both the Kubernetes and Azure layers, and respond to a breach
in the right order.

This track built the *defenses*. The next one gives you the *visibility* to
know when they're being tested:
[12-observability-deep-dive](../../12-observability-deep-dive/README.md) —
because you can only respond to what you can detect, and every detection signal
this track leaned on (audit logs, unexpected-egress alerts, Defender findings)
is something observability teaches you to collect, query, and trust. And the
signing/SBOM topic this track only *previewed* in module 01 gets its full,
end-to-end treatment much later in
[18-supply-chain-security](../../18-supply-chain-security/README.md) — image
signing, SBOM generation and attestation, and admission control that refuses
anything unsigned. You now have the foundation both of those build on.

[Back to the track index](../README.md) · [Back to main curriculum](../../README.md)
