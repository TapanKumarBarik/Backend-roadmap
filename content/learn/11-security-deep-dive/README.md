# Track 11: Security Deep Dive

You've already met security in pieces across this curriculum: non-root
containers, minimal images, and build-time secret handling in
[02-docker](../02-docker/README.md); Kubernetes RBAC and NetworkPolicy in
[03-kubernetes](../03-kubernetes/README.md); Azure AD-integrated cluster
RBAC and Key Vault via the CSI driver in [07-aks](../07-aks/README.md);
and OIDC-based, secretless CI in [10-cicd-and-gitops](../10-cicd-and-gitops/README.md).
Each of those taught security *as a footnote to another topic*. This track
makes security the topic.

It's a genuine deep dive across the whole stack: how to **think** about
security (threat modeling and the shared-responsibility model), how to
**find** problems (image scanning, supply-chain hygiene), how to **protect**
secrets (Key Vault patterns, rotation, why long-lived CI credentials are a
liability), how to **constrain** what runs (Pod Security Admission,
`securityContext`), how to **enforce** policy as code (OPA/Gatekeeper and
Azure Policy), how to build **defense in depth** across the network, and
finally what to actually **do** when something is compromised (incident
response and where the signals live).

> **What this track assumes and won't re-teach.** You already know *why*
> non-root and minimal images matter (track 02), *how* Kubernetes RBAC and
> NetworkPolicy objects work (track 03), and *how* AAD-RBAC and the Key
> Vault CSI driver are wired up on AKS (track 07). This track cites those
> modules and builds past them — it does not repeat their basics. If any of
> those feel shaky, redo them first; everything here compounds on them.

> **What this track only previews.** Two topics get a deliberate light
> touch here because later tracks own them: image **signing and SBOMs**
> (previewed in module 01, owned by
> [18-supply-chain-security](../18-supply-chain-security/README.md)) and
> **governance at scale** across management groups and landing zones
> (previewed in module 05, owned by
> [17-governance-at-scale](../17-governance-at-scale/README.md)). Service
> mesh **mTLS** is likewise previewed in module 06 and owned by
> [13-service-mesh](../13-service-mesh/README.md). When you see "preview,"
> it means *enough to connect the dots, not the full treatment.*

> **Cost warning:** several modules touch real Azure resources (Defender for
> Cloud plans, Azure Policy assignments, an AKS cluster for the admission and
> policy exercises). Azure Policy assignments themselves are free, but a
> running AKS cluster bills for its node VMs and Defender for Containers is a
> paid plan — clean up clusters with `az group delete` when you're done for
> the day, and disable any Defender plan you enabled for a lab.

## How this track works

- Go in order — the mental model in module 00 frames every module after it,
  and the capstone integrates all of them.
- Every module (except this index and the capstone) follows the same shape:
  **Why this matters → Concepts → Command reference → Hands-on exercises →
  Independent challenge → Common mistakes & troubleshooting → Checkpoint
  quiz → Next**. Two modules also carry a **Cumulative review**.
- Exercises use real tools wherever feasible: Trivy against real images, a
  real Gatekeeper `ConstraintTemplate` on a local kind cluster, Pod Security
  Admission on a real namespace, and a real Azure Policy assignment.
- Module 08 is a capstone with no quiz or challenge — it asks you to combine
  a scanned-and-hardened image, an enforced Gatekeeper policy, restricted
  Pod Security Admission, an Azure Policy guardrail, and a written
  incident-response runbook into one coherent, defensible deployment.

## Modules

| # | Module | What it covers | Rough time |
|---|--------|-----------------|------------|
| 00 | [security-mental-model-and-threat-modeling](00-security-mental-model-and-threat-modeling/README.md) | STRIDE, attack-surface thinking, trust boundaries, the shared-responsibility model for AKS/ACA | 60-75 min |
| 01 | [image-scanning-and-supply-chain-basics](01-image-scanning-and-supply-chain-basics/README.md) | Trivy and Defender for Containers, scanning in CI before push, base-image hygiene, a light signing/SBOM preview | 75-90 min |
| 02 | [secrets-management-in-depth](02-secrets-management-in-depth/README.md) | CSI Secrets Store rotation, Key Vault vs. HashiCorp Vault, why long-lived CI secrets are a liability, OIDC recap | 75-90 min |
| 03 | [pod-security-and-admission-control](03-pod-security-and-admission-control/README.md) | Pod Security Standards/Admission, `securityContext` deep dive — capabilities, seccomp, read-only root FS | 75-90 min |
| 04 | [policy-as-code-opa-gatekeeper](04-policy-as-code-opa-gatekeeper/README.md) | OPA/Gatekeeper: ConstraintTemplates, Constraints, writing a real blocking policy, audit vs. enforce | 90 min |
| 05 | [azure-policy-and-governance-guardrails](05-azure-policy-and-governance-guardrails/README.md) | Built-in definitions, assignments, Deny/Audit/DeployIfNotExists effects, initiatives, a governance-at-scale preview | 75-90 min |
| 06 | [network-security-in-depth](06-network-security-in-depth/README.md) | Defense in depth across NSGs, Azure Firewall, NetworkPolicy egress, and a service-mesh mTLS preview | 75-90 min |
| 07 | [incident-response-and-security-monitoring](07-incident-response-and-security-monitoring/README.md) | Isolate/snapshot/rotate/root-cause, Defender for Cloud, Azure Monitor alerts, audit logs | 75-90 min |
| 08 | [hashicorp-vault-in-depth](08-hashicorp-vault-in-depth/README.md) | Run Vault for real: KV versioning, the database secrets engine, dynamic credentials, and lease revocation | 75-90 min |
| 09 | [capstone-project](09-capstone-project/README.md) | End-to-end: hardened image, Gatekeeper policy, restricted PSA, Azure Policy guardrail, incident-response runbook | 3-5 hours |

## Prerequisites

- Everything from [02-docker](../02-docker/README.md) module 09
  (non-root, minimal images, secrets not in layers, `docker scout`).
- Everything from [03-kubernetes](../03-kubernetes/README.md) module 11
  (RBAC, ServiceAccounts, NetworkPolicy, Calico on kind).
- Everything from [07-aks](../07-aks/README.md) module 07 (Azure
  AD-integrated RBAC, managed/workload identity, Key Vault CSI driver).
- Familiarity from [10-cicd-and-gitops](../10-cicd-and-gitops/README.md)
  with CI pipelines and OIDC-based, secretless authentication to Azure.
- An active Azure subscription with permission to create Azure Policy
  assignments and (for one module) enable a Defender for Cloud plan.

[Back to main curriculum](../README.md)

Start here → [00-security-mental-model-and-threat-modeling/README.md](00-security-mental-model-and-threat-modeling/README.md)
