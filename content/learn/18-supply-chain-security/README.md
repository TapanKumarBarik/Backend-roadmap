# Track 18: Supply Chain Security

You already met the supply chain in pieces. Track 11 module 01 taught you to
*scan* an image, generate a throwaway SBOM, and hold the mental model
"scanning = is it safe, signing = is it authentic" — but it deliberately
stopped at a preview and said track 18 owns the full topic. Track 11 module 04
taught you admission control with Gatekeeper (`ConstraintTemplate` +
`Constraint`, audit-then-enforce, narrow exemptions), and track 10 gave you
CI/CD pipelines and OIDC-based, secretless CI. This track takes all of that and
goes the whole distance on **securing the software supply chain end to end**.

It's a genuine deep dive: how a supply-chain attack actually works and the
**SLSA** maturity model for defending against it; generating real **SBOMs**
with Syft; **signing images** keyless with cosign/Sigstore; attaching **build
provenance** attestations; running **vulnerability management** as an ongoing
practice rather than a one-time scan; **enforcing** all of it via admission
control so unsigned or unverified images simply can't run; keeping
**dependencies and base images** clean at scale; and finally **responding** to
the day a signed image turns out to be built from a compromised dependency. The
capstone assembles the whole chain: a CI pipeline that builds, SBOMs, signs, and
attests an image, plus a cluster that admits the signed image and rejects the
unsigned one.

> **What this track assumes and won't re-teach.** You already know how to
> *scan* an image and what an SBOM is at survey level (track 11 module 01), how
> Kubernetes admission control and Gatekeeper's `ConstraintTemplate`/`Constraint`
> work (track 11 modules 03–04), and how to build a CI pipeline with OIDC-based
> secretless authentication (track 10). This track cites those and builds past
> them — it does not repeat their basics. If any feel shaky, redo them first;
> everything here compounds on them.

> **Cost warning:** the enforcement and capstone modules run on a **local kind
> cluster** wherever possible (free), exactly like track 11's Gatekeeper
> exercises. The capstone optionally reproduces on your **AKS cluster** (track
> 07) and may push to **ACR** — a running AKS cluster bills for its node VMs, so
> clean up with `az group delete` when you're done for the day. cosign, Syft,
> Grype, and the local registry are all free and local.

## How this track works

- Go in order — module 00's threat model and SLSA framing set up every module
  after it, and the capstone integrates all of them.
- Every module (except this index and the capstone) follows the same shape:
  **Why this matters → Concepts → Command reference → Hands-on exercises →
  Independent challenge → Common mistakes & troubleshooting → Checkpoint quiz →
  Next**. Two modules (02 and 06) also carry a **Cumulative review**.
- Exercises use real tools: Syft/Grype for SBOMs and scanning, cosign against a
  local registry for signing and attestation, and Sigstore Policy Controller /
  Kyverno on a local kind cluster for admission enforcement.
- Module 08 is a capstone with no quiz or challenge — it asks you to assemble a
  CI pipeline that builds, SBOMs, keyless-signs, and attests an image, with a
  cluster admission policy that proves both the happy path (signed image runs)
  and the rejection path (unsigned image is blocked).

## Modules

| # | Module | What it covers | Rough time |
|---|--------|-----------------|------------|
| 00 | [supply-chain-attacks-and-the-slsa-framework](00-supply-chain-attacks-and-the-slsa-framework/README.md) | What supply-chain attacks look like (compromised dep, poisoned base, tampered build), the three questions an image must answer, SLSA levels as a maturity model | 60-75 min |
| 01 | [software-bills-of-materials-sboms](01-software-bills-of-materials-sboms/README.md) | Generating real SBOMs with Syft, SPDX vs CycloneDX, format conversion, digest-binding, the stale-SBOM failure | 75-90 min |
| 02 | [image-signing-with-cosign-and-sigstore](02-image-signing-with-cosign-and-sigstore/README.md) | cosign/Sigstore, keyless OIDC signing (Fulcio/Rekor), key-based vs keyless, verifying by identity | 90 min |
| 03 | [provenance-and-build-attestations](03-provenance-and-build-attestations/README.md) | in-toto attestations, SLSA provenance format, attaching signed SBOM/provenance to an image, verifying predicate contents | 75-90 min |
| 04 | [vulnerability-management-as-an-ongoing-practice](04-vulnerability-management-as-an-ongoing-practice/README.md) | Continuous scanning of stored SBOMs, CVE data sources, triage by exploitability (KEV/EPSS/VEX), false positives | 75-90 min |
| 05 | [admission-control-enforcement-of-supply-chain-policy](05-admission-control-enforcement-of-supply-chain-policy/README.md) | Sigstore Policy Controller / Kyverno verifying signatures + attestations at admission, audit-first, exemptions, digest resolution | 90 min |
| 06 | [dependency-and-base-image-hygiene-at-scale](06-dependency-and-base-image-hygiene-at-scale/README.md) | Digest-pinning, pinning vs floating through a security lens, Dependabot/Renovate automation, curated base images | 75-90 min |
| 07 | [incident-response-for-supply-chain-compromise](07-incident-response-for-supply-chain-compromise/README.md) | Responding when a signed image is built from a compromised dependency: SBOM blast-radius, revocation/re-signing, Rekor/provenance forensics | 75-90 min |
| 08 | [capstone-project](08-capstone-project/README.md) | End-to-end: CI builds + SBOM + keyless sign + provenance attestation, admission policy proving both signed-runs and unsigned-blocked paths | 3-5 hours |

## Prerequisites

- Everything from [11-security-deep-dive](../11-security-deep-dive/README.md)
  module 01 (Trivy scanning, the SBOM concept, base-image hygiene, the
  signing/SBOM preview) and modules 03–04 (Pod Security Admission, OPA/Gatekeeper
  `ConstraintTemplate`/`Constraint`, audit-then-enforce, exemptions).
- Everything from [10-cicd-and-gitops](../10-cicd-and-gitops/README.md): CI
  pipelines, container image pipelines, and OIDC-based, secretless
  authentication (the identity that keyless signing reuses).
- A local **kind** cluster from [03-kubernetes](../03-kubernetes/README.md) for
  the admission-control exercises.
- Familiarity with [02-docker](../02-docker/README.md): building images,
  digests vs tags, pushing to a registry.
- (Optional) An active Azure subscription with an AKS cluster
  ([07-aks](../07-aks/README.md)) and ACR to reproduce the capstone on managed
  infrastructure.

[Back to main curriculum](../README.md)

Start here → [00-supply-chain-attacks-and-the-slsa-framework/README.md](00-supply-chain-attacks-and-the-slsa-framework/README.md)
