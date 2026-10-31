# Admission Control Enforcement of Supply-Chain Policy

## Why this matters

Everything before this module produced *proofs*: an SBOM (01), a signature (02),
provenance (03), and a triage discipline that keeps them trustworthy over time
(04). But a proof nobody checks is theater. Module 00's whole point was that a
supply-chain attack lands *before* runtime — so the last line of defense is the
cluster **refusing to run any image that can't present valid proof**. This is
the exact "the system won't let you" shift track 11 module 04 made with
Gatekeeper for labels and registries, now aimed at signatures and attestations:
an unsigned image, or one signed by the wrong identity, or lacking provenance,
simply **cannot start a Pod**. This module turns your pipeline's proofs into an
enforced gate at the cluster door.

## Concepts

### The same admission-control mechanism, a new check

Track 11 module 03 introduced admission control (the API server consulting a
controller before persisting an object), and module 04 generalized it with
Gatekeeper's validating admission webhook running *your* logic. Signature
enforcement is **the same mechanism with a different question**. Where track
11's `K8sAllowedRepos` ConstraintTemplate checked "is this image's registry in
the allowed list?", a supply-chain policy checks "does this image carry a valid
cosign signature from *our* identity?" — a validating webhook intercepts every
Pod create, and *rejects* it if verification fails. If you understood
`ConstraintTemplate` + `Constraint` (track 11 module 04), you already understand
the shape; only the predicate changed from a labeling rule to a
cryptographic-verification rule.

### The tools: Sigstore Policy Controller and Kyverno

Two policy engines do image-signature verification at admission; both are
"a validating webhook that runs cosign-style verification":

- **Sigstore Policy Controller** — the Sigstore project's own admission
  controller, purpose-built for cosign signatures and attestations. You express
  a `ClusterImagePolicy` naming which images it covers and which
  identities/issuers are authorized to have signed them (the same
  `--certificate-identity`/`--certificate-oidc-issuer` pins from module 02, now
  as policy fields).
- **Kyverno** — a general Kubernetes policy engine (a YAML-native alternative to
  Gatekeeper's Rego) with a first-class `verifyImages` rule that runs cosign
  verification. One tool for both generic policy *and* signature verification.

They relate to track 11's Gatekeeper exactly as Concepts framed: layering, not
replacing. Gatekeeper enforces custom structural rules; a signature-verifying
controller enforces cryptographic supply-chain rules. Many clusters run a
policy engine that does both. This module uses the **Policy Controller** for the
canonical signature case and shows the **Kyverno** equivalent, so you recognize
both in the wild.

### What the policy actually asserts (identity is still the policy)

Module 02 hammered that keyless verification means pinning *identity* and
*issuer*, and module 03 added *check the predicate contents*. A supply-chain
admission policy encodes all of that as cluster config:

- **Which images** the policy governs — a glob like `myreg.azurecr.io/**`, so
  you don't accidentally block `kube-system` infra images (the exclude-infra
  discipline from track 11 module 04).
- **A valid cosign signature must exist**, and it must be from an **authorized
  identity + issuer** (e.g. your GitHub workflow + GitHub's OIDC issuer). A
  signature from the wrong identity is rejected — the identity-mismatch failure
  from module 02, now enforced automatically.
- **Optionally, required attestations** — "must also carry SLSA provenance whose
  source repo is ours" (module 03), so the gate checks *how it was built*, not
  just that it's signed.

The result: the cluster admits an image only if it can cryptographically prove
authenticity (and, optionally, provenance) from an identity you trust — the
whole track's proofs, verified at the door.

### Audit before enforce, exemptions, and mutate-to-digest

The rollout discipline is *identical* to track 11 module 04's, because the
failure mode is identical — a `deny` policy shipped blind can block every
legitimate deployment:

- **`warn`/`audit` mode first.** Policy Controller and Kyverno both support a
  non-blocking mode that *reports* what would be rejected without blocking. This
  is track 11's `dryrun`/audit pass: measure blast radius (how many running
  workloads use unsigned images?) before switching to `enforce`.
- **Narrow, explicit exemptions.** A legitimate third-party image with no
  signature you control needs an exemption — scoped by namespace or image glob,
  *visible in the policy*, exactly the narrow-and-reviewable exemption pattern
  from track 11 module 04, not a global off-switch.
- **Resolve tags to digests at admission.** Because signatures bind to digests
  (module 00/02), a strong policy also *mutates* the Pod's image reference from
  a mutable tag to the verified `@sha256:` digest, so what runs is exactly what
  was verified — closing the "verified `:1.0`, but the tag moved before the
  kubelet pulled" gap.

### Where this sits with the rest of your enforcement stack

Layer this onto what track 11 already gave you, so you see it's additive:

- **Pod Security Admission** (track 11 module 03) — enforces the Pod-hardening
  baseline (non-root, no privilege escalation).
- **Gatekeeper** (track 11 module 04) — enforces custom structural rules
  (allowed registries, required labels, no `:latest`).
- **Signature/attestation verification** (this module) — enforces
  *supply-chain* rules (valid signature from our identity, required provenance).
- **Azure Policy for AKS** (track 11 module 05) — the managed, Azure-side
  version; Azure Policy's image-integrity/`verifyImages` built-ins are this same
  check delivered as a managed guardrail across many clusters.

A Pod that would run must satisfy *all* applicable layers. This module adds the
one axis track 11 explicitly deferred to track 18: does the image carry
verifiable proof it's the authentic output of your pipeline?

## Command reference

| Command | What it does | Example |
|---|---|---|
| `kubectl apply -f policy-controller.yaml` | Installs Sigstore Policy Controller (webhook + CRDs) | see exercise 1 |
| `kubectl label namespace <ns> policy.sigstore.dev/include=true` | Opts a namespace into Policy Controller enforcement | `kubectl label namespace apps policy.sigstore.dev/include=true` |
| `kubectl apply -f clusterimagepolicy.yaml` | Applies a `ClusterImagePolicy` (which images, which identities) | see exercise 3 |
| `kubectl get clusterimagepolicy` | Lists installed image policies | `kubectl get cip` |
| `helm install kyverno kyverno/kyverno` | Installs Kyverno (alternative engine) | see exercise 7 |
| `kubectl apply -f verify-images-policy.yaml` | Applies a Kyverno `verifyImages` policy | see exercise 7 |
| `cosign verify --certificate-identity ... <img>` | The same check the controller runs, by hand (module 02) | `cosign verify --certificate-identity ... myreg.azurecr.io/app:1.0` |

Key fields of a Sigstore `ClusterImagePolicy` (from exercise 3):

- `spec.images[].glob: "myreg.azurecr.io/**"` — *which* images this policy
  governs; scope narrowly so you don't intercept infra images (the
  exclude-`kube-system` discipline from track 11 module 04).
- `spec.authorities[].keyless.identities[].issuer` — the OIDC issuer that must
  have vouched (e.g. `https://token.actions.githubusercontent.com`) — the
  `--certificate-oidc-issuer` pin from module 02, as policy.
- `spec.authorities[].keyless.identities[].subject` (or `subjectRegExp`) — *who*
  must have signed (your workflow identity) — the `--certificate-identity` pin,
  as policy.
- `spec.authorities[].attestations` — optionally require a named attestation
  (e.g. `slsaprovenance`) and a policy over its predicate (module 03).
- `spec.mode: warn` — audit-only mode; switch to enforce (remove/`enforce`)
  after measuring blast radius.

Key fields of a Kyverno `verifyImages` rule:

- `rules[].verifyImages[].imageReferences: ["myreg.azurecr.io/*"]` — image glob
  this rule covers.
- `attestors[].entries[].keyless.subject` / `.issuer` — the identity + issuer
  pins (same semantics as above).
- `mutateDigest: true` — rewrite the admitted image reference to the verified
  `@sha256:` digest, so what runs equals what was verified.
- `validationFailureAction: Audit` (vs `Enforce`) — Kyverno's audit-first
  switch, the direct analogue of Gatekeeper `dryrun`.

## Hands-on exercises

All on your **local kind cluster** from track 03 — no Azure cost, exactly like
track 11 module 04's Gatekeeper exercises. You'll use the key-based signatures
from module 02 locally (keyless needs a real OIDC identity — that's the
capstone's CI job).

1. **(WSL2) Install the Sigstore Policy Controller.**
   ```bash
   kubectl apply -f https://github.com/sigstore/policy-controller/releases/latest/download/policy-controller.yaml
   kubectl get pods -n cosign-system
   ```
   Expect the `policy-controller-webhook` Pod to reach `Running`. This installs
   the validating webhook and the `ClusterImagePolicy` CRD — the same webhook
   idea as Gatekeeper, purpose-built for signatures.

2. **(WSL2) Opt a namespace in and watch the default deny-unsigned behavior.**
   ```bash
   kubectl create namespace signed-apps
   kubectl label namespace signed-apps policy.sigstore.dev/include=true
   kubectl run unsigned --image=nginx:latest -n signed-apps; echo "exit: $?"
   ```
   Expect the Pod to be **rejected** — with no policy allowing it, an included
   namespace denies images that can't be verified. You just saw "unsigned can't
   run" as the default posture.

3. **(WSL2) Sign an image and write a policy that authorizes *your* key.** Reuse
   module 02's local registry + key:
   ```bash
   docker run -d -p 5000:5000 --name registry registry:2 2>/dev/null; true
   docker pull alpine:3.20 && docker tag alpine:3.20 localhost:5000/app:1.0 && docker push localhost:5000/app:1.0
   COSIGN_PASSWORD="" cosign generate-key-pair
   cosign sign --key cosign.key --yes localhost:5000/app:1.0
   kubectl apply -f - <<EOF
   apiVersion: policy.sigstore.dev/v1beta1
   kind: ClusterImagePolicy
   metadata:
     name: signed-by-us
   spec:
     images:
       - glob: "localhost:5000/**"
     authorities:
       - key:
           data: |
$(sed 's/^/            /' cosign.pub)
   EOF
   kubectl get clusterimagepolicy
   ```
   Expect the policy listed. It says: images from the local registry must carry
   a signature made by *this* public key.

4. **(WSL2) Prove the happy path and the rejection path.**
   ```bash
   kubectl run signed-ok --image=localhost:5000/app:1.0 -n signed-apps; echo "signed exit: $?"
   docker tag nginx:latest localhost:5000/unsigned:1.0 && docker push localhost:5000/unsigned:1.0
   kubectl run unsigned-blocked --image=localhost:5000/unsigned:1.0 -n signed-apps; echo "unsigned exit: $?"
   ```
   Expect `signed-ok` to be **admitted** and `unsigned-blocked` to be
   **rejected** ("no matching signatures"). This is the entire track in one
   result: the signed image runs, the unsigned one cannot. (Adjust registry
   reachability from kind as needed — the pass/fail *contrast* is the lesson.)

5. **(WSL2) Roll out audit-first, the track 11 way.** Add a second, stricter
   policy in `warn` mode and see it report without blocking:
   ```bash
   kubectl apply -f - <<'EOF'
   apiVersion: policy.sigstore.dev/v1beta1
   kind: ClusterImagePolicy
   metadata:
     name: must-have-provenance
   spec:
     mode: warn
     images:
       - glob: "localhost:5000/**"
     authorities:
       - key: {data: "PLACEHOLDER"}
         attestations:
           - name: must-have-slsa
             predicateType: slsaprovenance
   EOF
   kubectl run warn-test --image=localhost:5000/app:1.0 -n signed-apps
   ```
   Expect the Pod to be **admitted with a warning** that it lacks the required
   provenance attestation — `warn` measures impact without blocking, exactly
   track 11's `dryrun`. You'd fix the pipeline (attach provenance, module 03)
   *before* switching this to enforce.

6. **Diagnose and fix: a legitimate signed image blocked by an
   identity/issuer mismatch.** This is module 02's identity bug, now at
   admission. A teammate's *validly signed* image is rejected by the policy.
   Reproduce with a policy that pins the wrong identity:
   ```bash
   kubectl apply -f - <<'EOF'
   apiVersion: policy.sigstore.dev/v1beta1
   kind: ClusterImagePolicy
   metadata: {name: wrong-identity}
   spec:
     images: [{glob: "localhost:5000/**"}]
     authorities:
       - keyless:
           identities:
             - issuer: https://accounts.google.com
               subject: someone-else@example.com
   EOF
   kubectl run should-run --image=localhost:5000/app:1.0 -n signed-apps; echo "exit: $?"
   ```
   Expect rejection. Diagnose: the image is signed, but the policy authorizes
   the *wrong identity/issuer* — the admission-time twin of module 02's exercise
   8. Wrong fix: delete the policy (removes protection). Right fix: correct the
   authorized identity/issuer to match who *actually* signs (your CI workflow +
   GitHub's issuer), or, for this local key-based image, authorize the key
   instead:
   ```bash
   kubectl delete clusterimagepolicy wrong-identity
   # (the correct `signed-by-us` key policy from exercise 3 already admits it)
   kubectl run should-run --image=localhost:5000/app:1.0 -n signed-apps; echo "exit: $?"
   ```
   The lesson: at admission as at the CLI, a rejection is usually *policy
   pinning the wrong identity*, not a bad signature — align the policy's
   authorized identity/issuer to the real signer rather than weakening the gate.

7. **(WSL2, alternative engine) The Kyverno equivalent.** So you recognize the
   other common tool, express the same rule in Kyverno:
   ```bash
   helm repo add kyverno https://kyverno.github.io/kyverno/ 2>/dev/null; helm repo update >/dev/null
   helm install kyverno kyverno/kyverno -n kyverno --create-namespace --wait
   kubectl apply -f - <<'EOF'
   apiVersion: kyverno.io/v1
   kind: ClusterPolicy
   metadata: {name: verify-signature}
   spec:
     validationFailureAction: Audit
     rules:
       - name: check-signature
         match: {any: [{resources: {kinds: ["Pod"]}}]}
         verifyImages:
           - imageReferences: ["localhost:5000/*"]
             mutateDigest: true
             attestors:
               - entries:
                   - keyless:
                       subject: "https://github.com/YOURORG/YOURREPO/*"
                       issuer: "https://token.actions.githubusercontent.com"
   EOF
   kubectl get clusterpolicy verify-signature
   ```
   Note `validationFailureAction: Audit` (track 11's audit-first) and
   `mutateDigest: true` (rewrite tag→digest so what runs equals what was
   verified). Same job as Policy Controller, YAML-native like Gatekeeper's
   cousin.

8. **(WSL2) Clean up.**
   ```bash
   kubectl delete namespace signed-apps 2>/dev/null; true
   kubectl delete clusterimagepolicy --all 2>/dev/null; true
   kubectl delete clusterpolicy verify-signature 2>/dev/null; true
   helm uninstall kyverno -n kyverno 2>/dev/null; true
   kubectl delete -f https://github.com/sigstore/policy-controller/releases/latest/download/policy-controller.yaml 2>/dev/null; true
   docker rm -f registry 2>/dev/null; true
   rm -f cosign.key cosign.pub
   ```

## Independent challenge

No commands given — build it using this module plus track 11 module 04
(Gatekeeper rollout discipline and exemptions), module 02 (identity pins), and
module 03 (attestation predicates). On your kind cluster, author a
supply-chain admission policy (Policy Controller *or* Kyverno) that admits a Pod
only if its image (a) carries a valid signature from an authorized identity and
(b) carries a SLSA-provenance attestation. Roll it out the disciplined way:
`warn`/`Audit` first, enumerate what it *would* block among existing workloads,
then switch to enforce and prove both paths — a compliant image is **admitted**
and a non-compliant one (unsigned, or missing provenance) is **rejected** (not
just "the good one runs" — track 11 module 04's fail-open warning applies).
Finally, introduce one legitimate third-party image you *can't* sign and grant
it a **narrow, visible exemption** (by namespace or image glob) rather than
weakening the policy, proving an unexempted unsigned image is still blocked.

<details>
<summary>Stuck? One hint</summary>

This is track 11 module 04's exact rollout, with a cryptographic predicate
instead of a label check. Policy Controller: a `ClusterImagePolicy` with
`spec.mode: warn` first, `authorities[].keyless.identities[]` pinning your
workflow `subject` + GitHub `issuer`, and `authorities[].attestations` requiring
`predicateType: slsaprovenance`; flip to enforce after the audit pass. The
exemption is a *separate, narrowly-scoped* image `glob`/namespace the strict
policy doesn't cover — visible and reviewable, never a global off-switch. Prove
the bad path by deploying an unsigned image and seeing it **rejected**, exactly
like track 11's "test the known-bad object, not just the good one."

</details>

## Common mistakes & troubleshooting

- **Verifying in CI but never enforcing at admission.** A `cosign verify` step
  in the pipeline is bypassable — anyone with cluster access can `kubectl run`
  an unsigned image. The cluster-side admission policy is what makes the check
  unavoidable.
- **Shipping `enforce` blind.** A deny-unsigned policy applied cluster-wide can
  block every deployment (including infra). Run `warn`/`Audit` first, measure
  blast radius, then enforce — track 11 module 04's discipline, identically.
- **Intercepting infra images.** A too-broad image glob can block
  `kube-system`/system Pods. Scope the policy to your registry/namespaces and
  exempt infra, exactly the `excludedNamespaces` habit from track 11.
- **Pinning the wrong identity/issuer in the policy.** The #1 rejection cause is
  the policy authorizing an identity that isn't the real signer (exercise 6) —
  the admission twin of module 02's CLI bug. Align policy to the actual signer;
  don't delete the policy.
- **Verifying a tag but running whatever the tag later points to.** Without
  `mutateDigest`/digest resolution, a tag can move between verification and pull.
  Resolve to the verified `@sha256:` digest so what runs equals what was
  verified.
- **Only testing the happy path.** "My signed image runs" doesn't prove the gate
  enforces — a broken policy can fail open. Always confirm a known-bad
  (unsigned/wrong-identity) image is actually **rejected** (track 11 module 04).
- **Treating this as a replacement for PSA/Gatekeeper/Azure Policy.** It's an
  additional layer (supply-chain axis); a running Pod must satisfy all
  applicable controls.

## Checkpoint quiz

Write down your answer to each question before expanding it — checking without attempting first is the single easiest way to fool yourself into thinking you've learned this.

<details>
<summary>Show questions</summary>

1. How is a signature-verifying admission policy the *same* mechanism as track
   11 module 04's Gatekeeper, and what changed?
2. Why is enforcing at admission necessary even if your CI already runs
   `cosign verify`?
3. What three things can a `ClusterImagePolicy` (or Kyverno `verifyImages`)
   assert about an image?
4. What is the correct rollout order for a deny-unsigned policy, and which track
   11 concept is it identical to?
5. What does `mutateDigest`/digest resolution at admission protect against, and
   why does it matter given how signatures bind (module 00/02)?
6. A validly signed image is rejected by the policy. What's the most likely
   cause and the right fix (not "delete the policy")?
7. Where does this control sit relative to PSA, Gatekeeper, and Azure Policy —
   replacement or layer? What unique axis does it add?

</details>

<details>
<summary>Show answers</summary>

1. It's the same validating admission webhook intercepting Pod creates and
   returning admit/reject (track 11 module 04). What changed is the *predicate*:
   instead of checking a label or registry, it runs cosign verification of a
   signature/attestation. The `ConstraintTemplate`/`Constraint` shape maps onto
   `ClusterImagePolicy`/`verifyImages`.
2. Because a CI `cosign verify` step is bypassable — anyone who can `kubectl
   run`/apply a manifest can deploy an unsigned image directly, skipping CI. The
   admission policy makes verification unavoidable at the cluster door, which is
   the actual trust boundary for what runs.
3. (1) That a **valid signature exists**, (2) from an **authorized
   identity + issuer** (the module-02 pins), and (3) optionally that a
   **required attestation** (e.g. SLSA provenance whose predicate matches
   policy, module 03) is present.
4. `warn`/`audit` first — report what it *would* block, enumerate legitimate
   breakages, fix/exempt — *then* switch to `enforce`/`Deny`. It's identical to
   track 11 module 04's Gatekeeper `dryrun`-then-`deny` (and PSA's
   `warn`-then-`enforce`).
5. It protects against a tag moving between verification and the kubelet's pull:
   without resolving to the verified `@sha256:` digest, you could verify `:1.0`
   and then run whatever `:1.0` points to later. Since signatures bind to
   digests, running the digest guarantees what runs equals what was verified.
6. Most likely the policy pins the **wrong identity/issuer** (or wrong key) — not
   a bad signature (exercise 6, the admission twin of module 02's CLI mismatch).
   Right fix: correct the policy's authorized identity/issuer to the real signer;
   deleting the policy removes protection for everything.
7. It's a **layer**, not a replacement: PSA enforces Pod hardening, Gatekeeper
   enforces custom structural rules, Azure Policy is the managed guardrail, and
   this adds the **supply-chain axis** — cryptographic proof the image is the
   authentic, provenance-backed output of your pipeline. A Pod must satisfy all
   applicable layers.

</details>

## Next

Continue to
[06-dependency-and-base-image-hygiene-at-scale](../06-dependency-and-base-image-hygiene-at-scale/README.md)
— enforcement is only as good as what you feed it; next, keep the *inputs*
clean at scale with automated dependency and base-image updates, and revisit
pinning through a supply-chain lens.
