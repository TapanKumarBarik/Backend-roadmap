# Image Signing with cosign and Sigstore

## Why this matters

Module 00's second question was **is it authentic and unmodified?** — STRIDE's
Tampering category, the exact gap track 11 module 01 previewed and said track
18 owns. A signature is the answer: after building, you cryptographically prove
*this exact image came from us and hasn't been altered*, and later (module 05)
admission control refuses to run anything that can't prove it. This is the
control that stops the poisoned-base and tampered-image attacks from module 00
even when the image would scan clean, because a swapped image no longer carries
a valid signature. This module makes signing real with **cosign**, and
introduces the idea that changed the practice entirely — **keyless signing**,
where you never manage a private key at all.

## Concepts

### What signing an image actually does

Signing binds a cryptographic signature to an image's **digest** — the
immutable `sha256:` content identifier from module 00, *not* its tag. The
signer computes a signature over the digest with a private key; anyone with the
corresponding public key (or, for keyless, the transparency-log record) can
**verify** that:

- the image content is exactly what was signed (integrity — any byte change
  breaks it), and
- it was signed by a specific identity you trust (authenticity).

Crucially, signing says **nothing** about whether the image is *safe* — a
validly signed image can be riddled with CVEs. This is the "scanning vs
signing" split track 11 drew, now from the signing side: scan answers "is it
safe," signature answers "is it authentic." You need both, and module 05
enforces both at admission time.

### cosign and the Sigstore project

**cosign** (from the **Sigstore** project, an OpenSSF effort) is the de-facto
tool for signing container images and other OCI artifacts. It stores signatures
**in the registry, alongside the image** — a signature is itself a small OCI
object tagged by the image's digest — so your existing ACR/registry is also
your signature store; there's no separate infrastructure. Sigstore has three
pieces you'll meet:

- **cosign** — the CLI you run to sign and verify.
- **Fulcio** — a certificate authority that issues *short-lived* signing
  certificates tied to an identity (the heart of keyless, below).
- **Rekor** — a public, append-only **transparency log** that records every
  signature, so a signature can be verified later even though the certificate
  that made it has long expired.

This mirrors track 10/11's OIDC theme: just as secretless CI traded long-lived
credentials for short-lived, identity-scoped tokens, keyless signing trades a
long-lived signing key for a short-lived, identity-bound certificate.

### Traditional key-based signing (and why the key is the problem)

The classic model: `cosign generate-key-pair` produces a private key
(`cosign.key`) and public key (`cosign.pub`). You sign with the private key and
distribute the public key to verifiers.

- **Pro:** conceptually simple, no external services required, works air-gapped.
- **Con — and it's the big one:** you now own a **long-lived private key**. It
  must be stored somewhere (a KMS, a secret in CI), rotated, access-controlled,
  and *never leaked*. A leaked signing key is catastrophic: an attacker can sign
  malicious images that pass every verification. This is the same long-lived-
  credential liability track 10 module 07 and track 11 module 02 warned about,
  now applied to signing keys.

cosign supports key-based signing backed by a KMS (including Azure Key Vault),
which mitigates but doesn't eliminate the "there is a standing key to protect"
problem. Keyless removes the standing key entirely.

### Keyless signing via OIDC identity

**Keyless signing** eliminates the long-lived key. The flow, when your CI job
signs:

1. cosign obtains an **OIDC identity token** — from GitHub Actions this is the
   same workflow OIDC token you used in track 10 for secretless Azure login; for
   a human it's an interactive "log in with Google/GitHub" flow.
2. cosign sends that token to **Fulcio**, which verifies the identity and issues
   a **short-lived certificate** (valid ~10 minutes) binding a freshly-generated
   ephemeral key to that identity (e.g.
   `repo:myorg/myrepo:ref:refs/heads/main` for a GitHub workflow).
3. cosign signs the image digest with the ephemeral key and records the
   signature + certificate in **Rekor**, the transparency log.
4. The ephemeral private key is **discarded**. There is no key to leak, store,
   or rotate.

Verification later checks: the signature is valid, the certificate was issued by
Fulcio, the signing **identity matches what you expect**, and the entry is in
Rekor. This is the model this track and the capstone standardize on, because it
matches the OIDC-based, keyless CI you already built in track 10 — the CI job's
*identity* is what signs, not a secret it holds.

### Verifying: identity is the policy

For keyless, verification isn't "do I have the right public key?" — there's no
standing key. Instead you assert **which identity** was allowed to sign, via two
required checks:

- `--certificate-identity` (or `--certificate-identity-regexp`) — *who* signed,
  e.g. the exact GitHub workflow URL/ref, or `you@example.com`.
- `--certificate-oidc-issuer` — *which issuer* vouched for that identity, e.g.
  `https://token.actions.githubusercontent.com` for GitHub Actions or
  `https://accounts.google.com` for a Google login.

Both must be pinned. A signature that's cryptographically valid but was made by
the *wrong* identity (or vouched for by the wrong issuer) must be **rejected** —
otherwise anyone who can get *any* Fulcio certificate could sign your images.
This identity-is-the-policy idea is exactly what module 05's admission controller
encodes: "only images signed by *this* workflow identity may run." You'll
deliberately trigger an identity-mismatch failure in the exercises, because
getting this wrong is the most common keyless-verification bug.

## Command reference

| Command | What it does | Example |
|---|---|---|
| `cosign generate-key-pair` | Creates a `cosign.key`/`cosign.pub` pair (key-based mode) | `cosign generate-key-pair` |
| `cosign sign --key cosign.key <img@digest>` | Signs an image with a private key | `cosign sign --key cosign.key myreg.azurecr.io/app@sha256:...` |
| `cosign verify --key cosign.pub <img>` | Verifies a key-based signature | `cosign verify --key cosign.pub myreg.azurecr.io/app:1.0` |
| `cosign sign <img@digest>` | **Keyless** sign (prompts OIDC / uses CI token) | `COSIGN_EXPERIMENTAL=1 cosign sign myreg.azurecr.io/app@sha256:...` |
| `cosign verify --certificate-identity ... --certificate-oidc-issuer ... <img>` | Verifies a keyless signature against an expected identity | see breakdown below |
| `cosign tree <img>` | Shows all signatures/attestations attached to an image | `cosign tree myreg.azurecr.io/app:1.0` |
| `cosign triangulate <img>` | Prints the registry ref where the signature is stored | `cosign triangulate myreg.azurecr.io/app:1.0` |
| `cosign initialize` | Refreshes Sigstore trust roots (TUF) locally | `cosign initialize` |
| `crane digest <img>` | Resolves a tag to the digest you should sign | `crane digest myreg.azurecr.io/app:1.0` |

Flag breakdown for keyless verify:
`cosign verify --certificate-identity-regexp 'https://github.com/myorg/.+' --certificate-oidc-issuer https://token.actions.githubusercontent.com myreg.azurecr.io/app:1.0`

- `verify` — check signatures on an image and print the verified payload; exits
  non-zero if no signature satisfies the checks (this is the gate module 05
  automates).
- `--certificate-identity-regexp 'https://github.com/myorg/.+'` — *who* is
  allowed to have signed. Use the exact identity with `--certificate-identity`
  when you can; the regexp form is for "any workflow in my org." Getting this
  wrong (too loose, or not matching) is the #1 keyless failure.
- `--certificate-oidc-issuer https://token.actions.githubusercontent.com` —
  *which* OIDC issuer must have vouched for that identity. Pins the trust to
  GitHub Actions' issuer specifically; a signature from the same identity string
  but a different issuer is rejected.
- `<image>` — the image to verify; cosign resolves its digest and looks up the
  signature stored alongside it in the registry.

Flag breakdown for `cosign sign --key azurekms://<vault>.vault.azure.net/<key> <img@digest>`:

- `--key azurekms://...` — sign using a key held in **Azure Key Vault** instead
  of a local file, so the private key never leaves the KMS (the track 07/11 Key
  Vault pattern applied to signing). Still a *standing* key — better protected
  than a file, but not keyless.
- `<img@digest>` — always sign the **digest**, not a tag, so the signature binds
  to immutable content (module 00).

## Hands-on exercises

cosign runs locally. You'll sign against a **local registry** so there's no
Azure cost; the keyless-in-CI flow is demonstrated and explained (a real GitHub
Actions run is the capstone).

1. **(WSL2) Install cosign and start a local registry.**
   ```bash
   curl -sSfL https://github.com/sigstore/cosign/releases/latest/download/cosign-linux-amd64 -o /tmp/cosign
   sudo install /tmp/cosign /usr/local/bin/cosign
   cosign version
   docker run -d -p 5000:5000 --name registry registry:2
   ```
   Expect a cosign version and a running local registry on `localhost:5000`.

2. **(WSL2) Push an image and resolve its digest.**
   ```bash
   docker pull alpine:3.20
   docker tag alpine:3.20 localhost:5000/alpine:3.20
   docker push localhost:5000/alpine:3.20
   DIGEST=$(crane digest localhost:5000/alpine:3.20 2>/dev/null || docker inspect --format '{{index .RepoDigests 0}}' localhost:5000/alpine:3.20)
   echo "$DIGEST"
   ```
   Expect a `sha256:...` digest. This is what you sign — never the tag.

3. **(WSL2) Key-based signing: generate a key pair and sign.**
   ```bash
   COSIGN_PASSWORD="" cosign generate-key-pair
   cosign sign --key cosign.key --yes localhost:5000/alpine@${DIGEST#*@} 2>/dev/null || \
   cosign sign --key cosign.key --yes localhost:5000/alpine:3.20
   ```
   Expect the signature to be pushed to the local registry next to the image.
   You now hold `cosign.key` — a long-lived private key you must protect. Feel
   the liability.

4. **(WSL2) Verify the key-based signature — and watch it fail with the wrong
   key.**
   ```bash
   cosign verify --key cosign.pub localhost:5000/alpine:3.20
   # Now generate a DIFFERENT key and verify with it:
   COSIGN_PASSWORD="" cosign generate-key-pair --output-key-prefix other
   cosign verify --key other.pub localhost:5000/alpine:3.20; echo "exit: $?"
   ```
   Expect the first verify to **succeed** and the second to **fail** (non-zero
   exit) — the signature was made by a different key. That pass/fail *is* the
   integrity/authenticity check module 05 will automate.

5. **(WSL2) Inspect where the signature lives.**
   ```bash
   cosign tree localhost:5000/alpine:3.20
   cosign triangulate localhost:5000/alpine:3.20
   ```
   Expect `tree` to show a `Signatures` entry and `triangulate` to print a
   `...sha256-<digest>.sig` ref. Signatures are ordinary OCI objects in your
   registry — no separate signature server, exactly as Concepts said.

6. **(WSL2) Break the signature by tampering, prove verify catches it.** Push a
   *different* image to the same tag and re-verify against the old signature:
   ```bash
   docker pull alpine:3.19
   docker tag alpine:3.19 localhost:5000/alpine:3.20
   docker push localhost:5000/alpine:3.20
   cosign verify --key cosign.pub localhost:5000/alpine:3.20; echo "exit: $?"
   ```
   Expect verification to **fail** — the tag now points at content the signature
   doesn't cover. This is the tampered/poisoned-image attack from module 00
   being *caught by the signature*, precisely the thing scanning could not do.

7. **(WSL2) Read the keyless flow you'll run in CI.** You won't run Fulcio/Rekor
   against a local registry, so study the exact commands the capstone's GitHub
   Actions job uses. In CI, with `id-token: write` permission (the track-10 OIDC
   setup), signing is just:
   ```bash
   # In GitHub Actions — no key, no secret:
   cosign sign --yes myreg.azurecr.io/app@${DIGEST}
   ```
   and verification anywhere is:
   ```bash
   cosign verify \
     --certificate-identity-regexp 'https://github.com/YOURORG/YOURREPO/.+' \
     --certificate-oidc-issuer https://token.actions.githubusercontent.com \
     myreg.azurecr.io/app:1.0
   ```
   Write down *why* there's no `--key` on either side: the CI job's OIDC
   identity is what signs (Fulcio issues a 10-minute cert), and verification
   trusts an *identity*, not a stored key.

8. **Diagnose and fix: a keyless verification failing on identity mismatch.**
   This is the #1 keyless bug. A teammate's verify fails even though the image
   *is* validly signed by the CI workflow:
   ```bash
   # Their (failing) command — wrong identity assumptions:
   cosign verify \
     --certificate-identity 'https://github.com/YOURORG/YOURREPO/.github/workflows/ci.yml@refs/heads/master' \
     --certificate-oidc-issuer https://accounts.google.com \
     myreg.azurecr.io/app:1.0
   ```
   Two things are wrong; diagnose both: (a) the branch is `main`, not `master`,
   so the exact `--certificate-identity` string doesn't match the signer; and
   (b) the issuer is Google, but the image was signed by a **GitHub Actions**
   workflow, so `--certificate-oidc-issuer` must be
   `https://token.actions.githubusercontent.com`. The correct command:
   ```bash
   cosign verify \
     --certificate-identity 'https://github.com/YOURORG/YOURREPO/.github/workflows/ci.yml@refs/heads/main' \
     --certificate-oidc-issuer https://token.actions.githubusercontent.com \
     myreg.azurecr.io/app:1.0
   ```
   The lesson: keyless verification failing is *usually not* a bad signature —
   it's an identity/issuer expectation that doesn't match who actually signed.
   When it fails, inspect the real signer with `cosign verify` output (or the
   Rekor entry) and align your `--certificate-identity`/`--certificate-oidc-issuer`
   to it, rather than assuming the signature is broken.

9. **(WSL2) Clean up.**
   ```bash
   docker rm -f registry 2>/dev/null; true
   rm -f cosign.key cosign.pub other.key other.pub
   docker rmi localhost:5000/alpine:3.20 alpine:3.19 alpine:3.20 2>/dev/null; true
   ```

## Independent challenge

No commands given — build it using this module plus track 10's OIDC-based
secretless CI and module 00's digest reasoning. In prose or as a real workflow
snippet, design the *signing step* of a pipeline: state exactly where signing
belongs in the build → SBOM → scan → **sign** → push order (and why it signs a
digest, not a tag), choose **keyless over key-based** and justify it in terms of
the long-lived-credential liability from track 10/11, and write the precise
`cosign verify` command a *consumer* would run — with the exact
`--certificate-identity` and `--certificate-oidc-issuer` values for your repo.
Then explain, in two sentences, what an attacker who compromised your registry
(but not your CI identity) could and could not do — and why the signature is
what limits them.

<details>
<summary>Stuck? One hint</summary>

Signing goes *after* build/SBOM/scan and against the just-built `@sha256:`
digest, so the thing you push is already signed. Keyless wins because there is
no standing private key to leak, store, or rotate — the CI job's OIDC identity
(track 10) is the signer, and Fulcio issues a 10-minute cert per run. The
consumer's verify pins `--certificate-identity` to your exact workflow file+ref
and `--certificate-oidc-issuer` to
`https://token.actions.githubusercontent.com`. A registry-only attacker can
swap or delete images, but can't produce a *valid signature for the new image*
without your CI identity — so verification (and module 05's admission gate)
rejects the swap.

</details>

## Common mistakes & troubleshooting

- **Signing a tag instead of a digest.** Signatures bind to immutable content;
  sign `app@sha256:...`. Signing `app:1.0` is ambiguous the moment the tag
  moves.
- **Verifying keyless without pinning identity *and* issuer.** A
  cryptographically valid signature from the *wrong* identity must be rejected.
  Both `--certificate-identity`/`-regexp` and `--certificate-oidc-issuer` are
  required — omitting either is a hole an attacker walks through.
- **Assuming a verify failure means a bad signature.** For keyless it's usually
  an identity/issuer mismatch (exercise 8): wrong branch in the ref, or the
  wrong issuer URL. Check who *actually* signed before assuming tampering.
- **Treating a valid signature as "safe."** Signing proves authenticity, not
  absence of CVEs. A signed image can be fully vulnerable — you still need the
  scan gate (track 11). Different axes.
- **Keeping a long-lived signing key in a CI secret.** That reintroduces exactly
  the leak-prone credential keyless was designed to remove (track 10/11). Prefer
  keyless; if you must use a key, put it in a KMS (Azure Key Vault), never a
  plaintext secret.
- **Forgetting signatures are OCI objects your registry GC can delete.** A
  registry cleanup that prunes "untagged" manifests can delete signatures. Use
  signature-aware retention so you don't orphan images from their proofs.

## Checkpoint quiz

Write down your answer to each question before expanding it — checking without attempting first is the single easiest way to fool yourself into thinking you've learned this.

<details>
<summary>Show questions</summary>

1. What two things does verifying a signature prove, and what does it deliberately
   *not* tell you?
2. What are cosign, Fulcio, and Rekor, and what does each contribute to keyless
   signing?
3. Walk through the four steps of keyless signing from a CI job, and say what
   happens to the private key at the end.
4. Why is a long-lived signing key a liability, and how does keyless remove it?
   Tie it to a concept from track 10 or 11.
5. In keyless verification, what do `--certificate-identity` and
   `--certificate-oidc-issuer` assert, and why must both be pinned?
6. Why do you sign an image's digest rather than its tag?
7. An attacker compromises your registry but not your CI's OIDC identity. What
   can't they achieve, and which control stops them?

</details>

<details>
<summary>Show answers</summary>

1. It proves **integrity** (the image content is exactly what was signed — any
   byte change breaks it) and **authenticity** (a specific trusted identity
   signed it). It does *not* tell you the image is **safe/free of CVEs** —
   that's scanning's job (track 11), a separate axis.
2. **cosign** is the CLI that signs/verifies and stores signatures in the
   registry beside the image. **Fulcio** is a CA that issues short-lived certs
   binding an ephemeral key to a verified OIDC identity. **Rekor** is a public
   append-only transparency log recording every signature so it's verifiable
   after the cert expires.
3. (1) cosign gets an OIDC identity token (the CI workflow token); (2) sends it
   to Fulcio, which issues a ~10-minute cert binding an ephemeral key to that
   identity; (3) cosign signs the image digest and records signature+cert in
   Rekor; (4) the ephemeral private key is **discarded** — there's no key to
   store, rotate, or leak.
4. A long-lived key must be stored, rotated, and protected, and a leak lets an
   attacker sign malicious images that pass verification — the same long-lived-
   credential liability track 10 module 07 / track 11 module 02 flagged.
   Keyless removes it by using a per-run ephemeral key tied to a short-lived,
   identity-bound Fulcio cert, discarded after signing — mirroring OIDC
   secretless CI.
5. `--certificate-identity` asserts *who* signed (the exact workflow/ref or
   email); `--certificate-oidc-issuer` asserts *which issuer* vouched for that
   identity. Both must be pinned because a cryptographically valid signature
   from the wrong identity or issuer must be rejected — otherwise anyone who can
   obtain any Fulcio cert could sign your images.
6. Because a signature binds to immutable content, and only the `sha256:` digest
   names exact bytes; a tag is mutable (module 00) and can be repointed after
   signing, so a tag-bound signature is ambiguous/forgeable-by-repoint.
7. They can't produce a **valid signature for the swapped image** without your
   CI OIDC identity, so `cosign verify` (and module 05's admission gate) rejects
   the tampered image. The signature is the control that limits a registry-only
   attacker.

</details>

## Cumulative review

Closed-book. Don't reopen modules 00–02 while attempting these — the point is
to find out what actually stuck. These mix this track's first three modules with
the baseline from track 11 (scanning, admission control) and track 10 (OIDC CI).

<details>
<summary>Show questions</summary>

1. Name the three shapes of a supply-chain attack (module 00) and, for each,
   whether an SBOM (01), a signature (02), or provenance (03) is the *primary*
   defense.
2. Track 11 said "scanning = is it safe, signing = is it authentic." Give a
   concrete image that would *pass* one check and *fail* the other, in both
   directions.
3. State the three questions an image should answer for itself and the exact
   artifact that answers each. Which have you built so far in this track?
4. Explain why an SBOM generated by hand after the build, against a tag, can be
   *stale*, and how binding to a digest and generating in CI fixes it.
5. Contrast key-based and keyless signing on the single axis that matters most —
   the standing private key — and connect keyless to the OIDC pattern you used
   in track 10.
6. A `cosign verify` keyless command fails. Give the two *most common* causes
   from module 02 that are **not** "the signature is invalid," and how you'd
   confirm each.
7. Map each SLSA level (0–3, module 00) to what you'd have to *add* to your
   pipeline to reach it, using the tools from modules 01–03.
8. You're handed an image with a valid cosign signature and a clean Trivy scan.
   Name two distinct supply-chain risks this *still* doesn't rule out, and which
   later module (03/04/06/07) addresses each.

</details>

<details>
<summary>Show answers</summary>

1. **Compromised dependency** → primarily the **SBOM** (know it's present) plus
   continuous scanning (04); **poisoned base image** → primarily the
   **signature** + digest-pinning (reject unsigned/altered) and base hygiene
   (06); **tampered build** → primarily **provenance** (03), which reveals a
   subverted build a signature alone doesn't.
2. Passes-scan-fails-signature: a freshly-built, CVE-free but *unsigned or
   tampered* image (authentic? no). Passes-signature-fails-scan: an image your
   CI validly signed months ago that now has newly-disclosed CRITICAL CVEs
   (authentic yes, safe no). The two axes are independent.
3. **What's in it?** → SBOM (built in 01). **Is it authentic/unmodified?** →
   signature (built in 02). **How was it built?** → provenance attestation (03,
   next). First two done, third pending.
4. It's stale because the tag may point at a different image than the one the
   SBOM was generated against, or the image changed after generation, so the
   SBOM under/over-reports contents. Generating in the same CI step that builds
   the final image and binding to its immutable `sha256:` digest guarantees the
   SBOM describes exactly what shipped.
5. Key-based leaves a **long-lived private key** you must store, rotate, and
   protect — a leak lets an attacker forge signatures. Keyless has *no standing
   key*: a per-run ephemeral key is bound to a short-lived Fulcio cert issued
   against the CI job's OIDC identity, then discarded — the same "short-lived,
   identity-scoped credential instead of a stored secret" idea as track 10's
   OIDC login to Azure.
6. (a) **Wrong `--certificate-identity`** — e.g. `master` vs `main`, or wrong
   workflow path; (b) **wrong `--certificate-oidc-issuer`** — e.g. Google's
   issuer when the signer was GitHub Actions. Confirm by inspecting the actual
   Rekor/verify output to see the real signer identity and issuer, then align
   your flags to it.
7. **L0:** nothing (no provenance). **L1:** generate a provenance document at
   build (module 03) — e.g. `--provenance` / a provenance attestation. **L2:**
   have a *hosted* builder sign that provenance (GitHub's generator / keyless),
   so it's unforgeable. **L3:** run the build in an isolated, hardened
   environment so scripts can't falsify provenance. SBOM (01) and signature (02)
   support these but the *level* is about provenance integrity.
8. Among others: it could be built from a **compromised dependency** whose
   payload isn't a published CVE (04 continuous scanning / 06 hygiene / 07
   response), and its **provenance** could be absent so you can't prove *which*
   build produced it (03). A valid signature + clean scan covers authenticity
   and known-CVEs only.

</details>

## Next

Continue to
[03-provenance-and-build-attestations](../03-provenance-and-build-attestations/README.md)
— answer the third question, *how was it built?*, by generating SLSA provenance
and attaching signed attestations (including your module-01 SBOM) to the image.
