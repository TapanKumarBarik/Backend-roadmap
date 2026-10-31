# Capstone Project: A Signed, Attested, Enforced Supply Chain

## Why this matters

Every module in this track produced one artifact or one control in isolation —
an SBOM, a signature, a provenance attestation, an admission policy, a triage
practice, a response runbook. A real supply-chain defense is none of those
alone; it's the whole chain wired together so that a proof is *generated* in CI,
*travels with the image*, and is *checked at the cluster door* before anything
runs — and so that the day it fails, the artifacts you produced are what let you
respond. This capstone is where you prove you can assemble the entire chain
end to end on real infrastructure and — the part that separates "it applied
without error" from "it actually works" — demonstrate both the **happy path**
(a properly signed image runs) and the **rejection path** (an unsigned image is
blocked). There's no solution given and no quiz. Finishing this is what "you can
secure the software supply chain end to end" means: you build the proofs, you
enforce them, and you've seen the gate stop something.

## The project

Take a small containerized application (reuse one from the Docker or Kubernetes
tracks, or a trivial Flask/Node app) and build a complete supply-chain pipeline
around it, then enforce that pipeline's guarantees at a cluster. The pipeline is
a **CI workflow from track 10** (GitHub Actions) using **keyless OIDC signing**
(the same `id-token: write` OIDC identity you used for secretless Azure login in
track 10). You can develop and test the enforcement layer on a local **kind**
cluster first (as in modules 05/07) to save cost, then optionally reproduce on
your **AKS cluster** from track 07. Clean up billable resources when done.

The required chain, each piece drawing on a specific module:

1. **A CI pipeline that builds the image** (track 10) — triggered on push,
   building your app image and pushing it to a registry (ACR or GHCR),
   referenced by **digest** thereafter (module 00).
2. **SBOM generation** (module 01) — the pipeline generates an SBOM (Syft or
   BuildKit `--sbom`) for the exact built image, bound to its digest, and
   stores/attaches it — not a throwaway.
3. **Keyless signing with cosign** (module 02) — the pipeline signs the image
   digest via **keyless OIDC** (no stored key), so the signature is bound to the
   CI workflow's identity via Fulcio/Rekor.
4. **A build-provenance attestation** (module 03) — the pipeline attaches SLSA
   provenance (cosign `attest --type slsaprovenance`, BuildKit
   `--provenance=mode=max`, or the SLSA GitHub generator), targeting **SLSA
   Level 2** (provenance signed by the hosted builder, not forgeable off
   platform).
5. **A cluster-level admission policy that rejects unsigned images** (module
   05) — a Sigstore `ClusterImagePolicy` or Kyverno `verifyImages` policy that
   admits an image *only* if it carries a valid signature from **your** workflow
   identity (and, for full marks, the required provenance attestation), rolled
   out audit-first then set to enforce.
6. **Proof of both paths** — you demonstrate that the **signed image from your
   pipeline is admitted and runs**, *and* that an **unsigned (or wrong-identity)
   image is rejected** at admission. The rejection is the proof the gate
   actually enforces — a good Pod running proves nothing on its own (track 11
   module 04's fail-open warning).

### Acceptance checklist

Work isn't done until you can demonstrate every one of these:

- [ ] A CI workflow (track 10) builds the app image on push and references it by
      **digest** (`@sha256:...`), not a floating tag, downstream.
- [ ] The pipeline generates an **SBOM** for the built image (Syft or
      `--sbom=true`), bound to the image digest, and the SBOM is stored or
      attached — you can retrieve it and it accurately lists the app's
      dependencies (no stale-SBOM drift, module 01).
- [ ] The pipeline **signs the image keyless** via OIDC (`cosign sign` with
      `id-token: write`, **no stored key/secret**); `cosign tree` shows the
      signature attached in the registry.
- [ ] The pipeline attaches a **SLSA provenance attestation** signed by the
      hosted builder (targeting **Level 2**); `cosign verify-attestation --type
      slsaprovenance` succeeds against your workflow identity.
- [ ] `cosign verify` with the correct `--certificate-identity` (your workflow
      + ref) and `--certificate-oidc-issuer`
      (`https://token.actions.githubusercontent.com`) **succeeds** for the
      pipeline-built image.
- [ ] A `ClusterImagePolicy`/Kyverno `verifyImages` policy is installed, was
      rolled out **audit/warn first**, and is now **enforcing**, scoped to your
      registry/namespace (infra images not intercepted).
- [ ] **Happy path proven:** a Pod using the **signed** pipeline image is
      **admitted and reaches `Running`** under the enforcing policy.
- [ ] **Rejection path proven:** a Pod using an **unsigned** image (or one signed
      by a different/wrong identity) is **rejected** at admission with a
      verification error — you can show the rejection message.
- [ ] The admission policy pins the **correct identity/issuer** — you can explain
      why a wrong-identity pin would reject your own valid image (modules 02/05)
      and confirm yours matches the real signer.
- [ ] (Full marks) The policy also **requires the provenance attestation**, and a
      signed-but-provenance-less image is **rejected** — proving the gate checks
      *how it was built*, not just that it's signed.
- [ ] (Full marks) You can state your honest **SLSA level** for the pipeline and
      the one change that would raise it (module 00), and you have a one-page
      **incident runbook** (module 07) for "a dependency in this signed image is
      disclosed as compromised" — scoping via the SBOM you generated.
- [ ] All billable resources (ACR/AKS if used) are cleaned up or accounted for.

### Hints (not a solution)

- **Sequence it the way the track was ordered.** Get the app building in CI
  first, then add SBOM, then signing, then provenance, then stand up the
  admission policy last — each step builds on a working previous one, exactly
  how the modules were laid out. Don't try to write the whole workflow at once.
- **Keyless needs `id-token: write`.** The GitHub Actions job must request the
  OIDC token permission (the same one track 10 used for secretless Azure login).
  With it, `cosign sign` and `cosign attest` need **no** `--key` and **no**
  secret — the workflow identity is the signer (module 02).
- **Sign and attest the digest the build just produced**, not a tag — capture
  the `@sha256:` from the build/push step and pass it to `cosign` (modules
  00/02), so the proofs bind to exactly what shipped.
- **Roll the policy out audit-first, then flip to enforce** — modules 05 and
  track 11 module 04. Measure what it would block (is anything in your target
  namespace unsigned?) before it blocks for real, so you don't wedge your own
  cluster.
- **Test the bad path deliberately.** Push a plain `nginx`/unsigned image and
  confirm admission **rejects** it. If you can't produce a rejection, your
  policy isn't actually enforcing (fail-open, track 11 module 04) — fix that
  before you call the gate done.
- **If your own signed image is rejected, suspect the identity pin, not the
  signature** (modules 02/05). Check that the policy's authorized
  `subject`/`issuer` matches your real workflow identity and ref (`main` vs
  `master`, GitHub's issuer vs anything else) before assuming the signature is
  broken.
- **Resolve to the verified digest at admission** (`mutateDigest`/digest
  resolution, module 05) so what runs equals what was verified — closing the
  tag-moved gap.
- **Don't gold-plate.** One app, one clean pipeline that genuinely signs and
  attests, one enforcing policy, and *both paths demonstrably proven* beats a
  sprawling setup where nothing is verified end to end. Depth on the acceptance
  items — especially the rejection path — is the goal.

## Next

**Before you move on:** if any acceptance item is checked only because "it
applied without error," go back and prove it the hard way — retrieve and read
the SBOM, run `cosign verify` yourself with the exact identity pins, and above
all **watch the admission policy reject an unsigned image**. A supply-chain gate
you haven't seen *block something* is a gate you haven't verified — the entire
point of this track is that unsigned, unverified, un-attested images *cannot
run*, and you only know that's true when you've seen the rejection with your own
eyes. When every box is genuinely ticked and your billable resources are cleaned
up, you've finished the track: you can generate SBOMs, sign and attest images
keyless in CI, and enforce all of it at the cluster door, end to end.

This track secured the *artifacts and the pipeline* — what runs, and the proof
it's authentic. The next track moves up to the *front door of your services*:
[19-api-management](../../19-api-management/README.md) — fronting real APIs with
Azure API Management (gateways, versioning, rate limiting, auth). Where this
track made sure only trusted images run, the next makes sure only trusted, shaped,
governed traffic reaches the APIs those images serve. You now have the secure
supply chain those APIs are built and deployed through.

[Back to the track index](../README.md) · [Back to main curriculum](../../README.md)
