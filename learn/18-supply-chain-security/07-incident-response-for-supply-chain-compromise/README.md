# Incident Response for a Supply-Chain Compromise

## Why this matters

This track built prevention (signing, provenance, hygiene) and enforcement
(admission control). Track 11 module 07 taught general incident response —
isolate, preserve, rotate, root-cause. This module is the *intersection*: what
you do the day a **signed, verified, admitted** image turns out to be built from
a compromised dependency. That's the nightmare case, because every control you
built said "yes" — the image was authentic, the provenance was valid, admission
let it run — and it was malicious anyway, because the compromise was upstream of
all of it (module 00's compromised-dependency attack). The good news: the exact
artifacts this track produced — the SBOM, the signatures, the provenance,
Rekor's log — are precisely what turn this from a blind, fleet-wide panic into a
scoped, fast, evidence-driven response. This is the payoff the whole track was
setting up.

## Concepts

### Why prevention passing doesn't mean you're safe

Every control in this track answers a question honestly, and *none* of them
answers "is this dependency trustworthy?":

- The **signature** (02) proved the image is the authentic output of your CI —
  and it was. Your CI faithfully built and signed an image containing the
  poisoned dependency.
- The **provenance** (03) proved it was built by your workflow from your commit
  — and it was. The commit legitimately pulled the compromised package.
- **Admission** (05) verified all of that and admitted it — correctly.

The compromise entered *before* your trust boundary, so your integrity controls
faithfully certified a malicious artifact. This is not a failure of signing;
it's signing working as designed on a poisoned input. The lesson from module 00,
now lived: integrity ≠ safety. Which means you also need a *response* plan for
when a validly-signed thing is bad — that's this module.

### The SBOM is your blast-radius map

The single most valuable incident artifact this track produced is the **SBOM
store** (module 01), because the first question in any supply-chain incident is
*"where are we exposed?"* — and the SBOM answers it as a query, not a
fleet-wide investigation:

- **Which images contain the compromised package, at which version?** A search
  over stored SBOMs (`pkg:npm/compromised-lib@1.2.3`) returns the exact list —
  in minutes, across hundreds of images, including ones no longer in a running
  registry. Without SBOMs, this is a rebuild-and-grep of your entire fleet under
  time pressure.
- **Which of those are actually deployed, and where?** Cross-reference the
  affected-image list with what's running (the admission/deployment records).
- **What's the transitive reach?** The SBOM's dependency relationships show
  whether the bad package is a direct or transitive dependency, informing how
  many services inherit it.

This is exactly the payoff module 01 promised and module 04 reinforced:
pre-computing the answer to the worst question you'll be asked under pressure.
Your blast-radius assessment is a query because you did the SBOM work in advance.

### The response sequence, specialized for supply chain

Track 11 module 07's ordering still governs — **detect → preserve → isolate →
eradicate → recover → root-cause** — but each step has a supply-chain-specific
form:

1. **Detect** — the trigger is usually external: an upstream advisory (the
   package is announced malicious), a KEV listing (module 04), or your
   continuous re-scan flagging it. You rarely find it yourself first.
2. **Preserve evidence** — snapshot affected Pods/images *and their attestations
   and Rekor entries* before you delete anything. The signatures and provenance
   are evidence of *what was deployed and when*, and Rekor is an immutable
   timeline (below). Track 11's "don't destroy the crime scene" rule applies to
   attestations too.
3. **Isolate / contain** — stop the bleeding: cordon/quarantine affected
   workloads (NetworkPolicy egress-deny from track 11, scale to zero), and — the
   supply-chain-specific move — **tighten admission (module 05) to block the
   compromised digests** so the bad image can't be re-scheduled anywhere.
4. **Eradicate** — remove the compromised dependency: pin to a safe version, bump
   via the module-06 automation, rebuild.
5. **Recover** — rebuild → SBOM → scan → **re-sign** → re-attest → deploy the
   clean image through the normal gated pipeline (this track, end to end).
6. **Root-cause & prevent** — how did it get in, and what stops the *next* one
   (below).

The through-line: your response *uses this track's artifacts at every step* —
SBOM to scope, attestations/Rekor to preserve, admission to contain, the
pipeline to recover.

### Revocation and re-signing: what "revoke a signature" really means

A natural instinct is "revoke the signature on the bad image." Understand what
that does and doesn't mean in the Sigstore model:

- There's **no CRL-style revocation of a keyless signature** — the signature
  legitimately attests the image *was* built by you, which remains true. You
  don't un-say a true statement.
- Instead you **revoke at the *policy* layer**: update admission (module 05) to
  **deny the specific compromised digests** (a denylist / an updated
  `ClusterImagePolicy`), and remove/repoint the tags so nothing pulls them.
  Trust is withdrawn by the *verifier's policy*, not by deleting the signature.
- **Re-signing** applies to the *fixed* image: the rebuilt, clean image gets a
  fresh signature and provenance through the normal pipeline. You don't "re-sign
  the bad one" — you sign its replacement and shift traffic.
- If a **signing *key*** (key-based mode, module 02) was compromised — a
  different, worse incident — you rotate the key and must **re-sign every image
  that key signed**, and update every verifier's trusted key. This is precisely
  the pain keyless avoids (no standing key to compromise), reinforcing module
  02's argument in an incident.

So "revocation" in practice = *policy-layer denial of specific digests* +
*re-signing the fixed replacement*, not cryptographic un-signing.

### Rekor and provenance as the forensic timeline

The transparency log and attestations you built for *prevention* double as
*forensics*:

- **Rekor** (module 02) is an immutable, append-only record of every signature
  and attestation, with timestamps. During an incident it answers *"when was
  this image signed, and by which identity/workflow run?"* — an auditable
  timeline you can't get from mutable registry tags.
- **Provenance** (module 03) pinpoints the **exact build**: which commit, which
  CI run, which workflow pulled the compromised dependency. That turns "sometime
  in the last three months something went wrong" into "the compromise entered at
  commit `abc123`, build run #4471, on this date" — scoping *which* images (by
  provenance) are affected and *when* the bad dependency first entered.
- Combined with the **SBOM**, you get the full picture: *what* is affected
  (SBOM), *how it got built* (provenance), and *when it was signed/deployed*
  (Rekor) — a complete, evidence-backed incident timeline built from artifacts
  you already had.

Root-cause and prevention then close the loop: add the compromised package to a
denylist, tighten dependency review (module 06), and if the entry point was a
build-step compromise rather than a dependency, that's a SLSA-level gap (module
00) — raise the build's isolation.

## Command reference

| Command | What it does | Example |
|---|---|---|
| `grep -rl 'pkg:npm/badlib@' sboms/` | Blast radius: find every stored SBOM containing the bad package | `grep -rl 'pkg:npm/left-pad@' sboms/` |
| `grype sbom:<file>` | Re-scan a stored SBOM to confirm a newly-announced CVE hits it | `grype sbom:app-sbom.json` |
| `cosign download attestation <img>` | Retrieve provenance/SBOM attestations as evidence (preserve) | `cosign download attestation myreg.azurecr.io/app@sha256:...` |
| `rekor-cli search --sha <digest>` | Find the transparency-log entries (timeline) for an artifact | `rekor-cli search --artifact app.tar` |
| `kubectl cordon` / `kubectl scale --replicas=0` | Contain: stop scheduling / drain affected workloads | `kubectl scale deploy/app --replicas=0` |
| `kubectl apply -f deny-digest-policy.yaml` | Contain: update admission to deny the compromised digests | see exercise 5 |
| `crane digest <img:tag>` | Confirm which digest a tag currently resolves to | `crane digest myreg.azurecr.io/app:1.0` |
| `cosign copy` / re-run pipeline | Recover: re-sign/re-attest the rebuilt clean image | see exercise 6 |

Flag/field breakdown for a containment `ClusterImagePolicy` denylist (from
exercise 5):

- A dedicated policy whose `authorities` cannot be satisfied for the named
  compromised digests (or a Kyverno rule matching those digests with
  `validationFailureAction: Enforce`) — the module-05 mechanism used *in
  reverse*, to block specific known-bad content rather than require good content.
- Scope it by **digest**, not tag — the compromised artifact is defined by its
  immutable content (module 00), and denying the tag alone is bypassable by
  pulling the digest directly.
- Keep it in enforce from the moment of containment (this is not the
  audit-first case — you have a *confirmed* bad artifact), but scope it narrowly
  to the specific digests so you don't halt unrelated deploys.

## Hands-on exercises

Local and free — you'll run a tabletop-style response against real SBOMs and a
local registry, exercising the scoping and containment muscles. (A full
end-to-end incident is the capstone's implicit stress test.)

1. **(WSL2) Build a small SBOM "store" to query.** Generate SBOMs for a few
   images so you have a fleet to search:
   ```bash
   mkdir -p sboms
   for i in python:3.11-slim node:20-slim alpine:3.20; do
     syft "$i" -o spdx-json="sboms/$(echo $i | tr ':/' '__').json"
   done
   ls sboms/
   ```
   Expect several SBOM files. This is your pre-computed blast-radius index.

2. **(WSL2) Scope a blast radius by query, not rebuild.** Pretend `zlib` is
   announced compromised. Find every affected image *without touching any
   image*:
   ```bash
   grep -rl '"name":"zlib"' sboms/ || grep -rl 'zlib' sboms/
   grep -rh '"name":"zlib"' sboms/ | head
   ```
   Expect the exact list of SBOMs (images) that contain `zlib`, with versions.
   Note the speed: this is minutes over stored SBOMs vs a fleet-wide
   rebuild-and-grep. This *is* the module-01 payoff, in an incident.

3. **(WSL2) Confirm exploitability, don't just match the name.** Re-scan an
   affected SBOM to see whether the announced CVE actually applies at that
   version (module 04's triage, under incident pressure):
   ```bash
   grype db update
   grype sbom:sboms/python_3.11-slim.json | grep -i zlib || echo "no matching CVE at this version — triage as not-affected"
   ```
   Write one line: why does "contains the package" not automatically mean
   "affected"? (Version ranges, and whether the vulnerable code path is present
   — module 04.)

4. **(WSL2) Preserve evidence before touching anything.** Simulate capturing the
   attestations/timeline for an affected image before remediation:
   ```bash
   docker run -d -p 5000:5000 --name registry registry:2 2>/dev/null; true
   docker pull alpine:3.20 && docker tag alpine:3.20 localhost:5000/app:bad && docker push localhost:5000/app:bad
   COSIGN_PASSWORD="" cosign generate-key-pair
   cosign sign --key cosign.key --yes localhost:5000/app:bad
   syft localhost:5000/app:bad -o spdx-json=evidence-sbom.json
   cosign tree localhost:5000/app:bad     # record signatures/attestations as evidence
   ```
   The point: snapshot the SBOM, signatures, and (in real life) Rekor entries
   *first* — track 11 module 07's preserve-before-you-delete rule, applied to
   supply-chain artifacts.

5. **(WSL2) Contain by denying the compromised digest at admission.** Get the
   bad image's digest and write a containment policy (module 05 in reverse):
   ```bash
   BAD=$(crane digest localhost:5000/app:bad)
   echo "compromised digest: $BAD"
   cat > deny-digest.yaml <<EOF
   # Conceptual containment: an admission policy (Policy Controller/Kyverno)
   # that DENIES this specific digest cluster-wide, so it can't be re-scheduled:
   #   match image digest == ${BAD}  ->  reject
   # Scoped by DIGEST (immutable), not tag (bypassable). Enforce immediately —
   # this is a confirmed-bad artifact, not an audit-first rollout.
   EOF
   cat deny-digest.yaml
   ```
   Reason through why the denial is by digest, not tag: the compromised artifact
   is its content; denying `:bad` alone is bypassed by pulling the digest
   directly (module 00).

6. **(WSL2) Recover: rebuild clean and re-sign the *replacement*.** You don't
   un-sign the bad image — you sign its fixed successor through the normal
   pipeline:
   ```bash
   docker tag alpine:3.20 localhost:5000/app:fixed && docker push localhost:5000/app:fixed
   FIXED=$(crane digest localhost:5000/app:fixed)
   cosign sign --key cosign.key --yes localhost:5000/app@${FIXED#*@}
   syft localhost:5000/app:fixed -o spdx-json=fixed-sbom.json
   echo "shift traffic to the fixed digest; keep the deny on ${BAD}"
   ```
   Note the shape of recovery: the *fixed* image gets a fresh signature/SBOM; the
   *bad* digest stays denied. "Revocation" was a policy-layer denial plus
   re-signing the replacement — never cryptographic un-signing.

7. **Diagnose and fix: a signed, admitted image that's malicious anyway.** The
   scenario that names the module. Your continuous re-scan (module 04) flags a
   running, *validly signed and admitted* image because a dependency it contains
   was just disclosed as a backdoor. A teammate says "but it passed signature
   verification, so it must be fine." Diagnose the flaw in that reasoning and lay
   out the correct response *in order*, using this track's artifacts:
   ```bash
   # Reasoning check: signature/provenance prove AUTHENTICITY & BUILD, not SAFETY.
   # The compromise entered upstream of your trust boundary (module 00), so your
   # controls correctly certified a malicious artifact. Signing worked; it's the
   # wrong question for this failure.
   #
   # Correct order (track 11 module 07, supply-chain form):
   #   1. Detect  : re-scan/advisory already flagged it.
   #   2. Preserve: snapshot SBOM + attestations + Rekor entries (exercise 4).
   #   3. Scope   : grep stored SBOMs for the bad package -> affected image list (exercise 2).
   #   4. Isolate : cordon/scale-to-zero affected workloads; deny bad digests at admission (exercise 5).
   #   5. Eradicate: pin/bump the dependency to a safe version (module 06).
   #   6. Recover : rebuild -> SBOM -> scan -> re-sign -> re-attest -> deploy (exercise 6).
   #   7. Root-cause: how did the dep get in; add denylist + tighten review; raise SLSA level if the entry was a build compromise.
   echo "signature proves authenticity, not safety — respond, don't dismiss"
   ```
   The fix is both a *mindset* correction (a valid signature is not a clean bill
   of health) and the *ordered response* above, every step powered by an
   artifact this track produced.

8. **(WSL2) Clean up.**
   ```bash
   docker rm -f registry 2>/dev/null; true
   rm -rf sboms
   rm -f cosign.key cosign.pub evidence-sbom.json fixed-sbom.json deny-digest.yaml
   docker rmi localhost:5000/app:bad localhost:5000/app:fixed alpine:3.20 2>/dev/null; true
   ```

## Independent challenge

No commands given — build it using this module plus track 11 module 07 (the
response ordering and preserve-before-delete rule), module 01 (SBOM store),
module 03 (provenance), and module 05 (admission). Write a **supply-chain
incident-response runbook** for this exact scenario: *"an upstream advisory
announces that a package many of our images depend on was backdoored in versions
1.4.0–1.6.2; some affected images are signed, provenance-attested, and currently
running in prod."* The runbook must give the ordered steps (detect → preserve →
scope/blast-radius → isolate/contain → eradicate → recover → root-cause), the
*exact artifact or command* used at each step (which store you grep, what you
snapshot, how you deny the digests at admission, how you re-sign the fix), who
is responsible, and the check that tells you each step is done. Include a
paragraph on what "revocation" concretely means here (policy-layer digest denial
+ re-signing the replacement, *not* un-signing), and end by naming the single
detection signal you'd add so the *next* compromised-dependency disclosure pages
you automatically.

<details>
<summary>Stuck? One hint</summary>

Structure it as track 11 module 07's ordered runbook, but make every step cite a
track-18 artifact: **preserve** = snapshot SBOM + `cosign download attestation`
+ Rekor entries; **scope** = `grep` the SBOM store for the bad PURL/version range
→ affected-image list; **contain** = a module-05 `ClusterImagePolicy`/Kyverno
rule denying the *specific compromised digests* (enforce immediately, scoped by
digest not tag); **eradicate** = bump the dependency via module-06 automation;
**recover** = rebuild → SBOM → scan → re-sign → re-attest → shift traffic, keep
the deny in place. "Revocation" = withdraw trust in the verifier's *policy* and
sign the *replacement*, because a keyless signature can't be un-said. The
detection signal to add is continuous SBOM re-scanning wired to your advisory
feed (module 04), so the next disclosure auto-scopes and pages.

</details>

## Common mistakes & troubleshooting

- **Treating a valid signature as a clean bill of health.** Signing/provenance
  prove authenticity and build integrity, *not* that a dependency is
  trustworthy. A signed, admitted image can be malicious if the compromise was
  upstream — respond, don't dismiss.
- **Rebuilding the fleet to find the blast radius.** That's the slow panic the
  SBOM store exists to prevent. Query stored SBOMs for the bad package/version
  first; rebuild only the images that actually contain it.
- **Deleting the evidence first.** Destroying Pods/images/attestations before
  snapshotting loses the forensic timeline (Rekor, provenance, SBOM). Preserve
  before you eradicate — track 11 module 07's rule, extended to attestations.
- **"Contains the package" = "affected."** Version ranges and reachability
  matter (module 04). Confirm the disclosed range and exploitability before
  treating an image as compromised, or you'll over-scope and over-react.
- **Thinking you can "revoke" a keyless signature.** You can't un-say a true
  attestation. Revocation = deny the compromised digests at the *policy* layer
  and re-sign the fixed replacement. (A compromised signing *key* is the worse
  case that forces re-signing everything — the pain keyless avoids.)
- **Containing by tag instead of digest.** Denying `:bad` is bypassable by
  pulling the digest. Contain the immutable digest (module 00).
- **Skipping root-cause and prevention.** If you don't determine how the
  dependency got in (and whether it was a build-step compromise → a SLSA-level
  gap, module 00), you'll respond to the same class of incident again. Close the
  loop: denylist, tighten review (module 06), raise the build's integrity level.

## Checkpoint quiz

Write down your answer to each question before expanding it — checking without attempting first is the single easiest way to fool yourself into thinking you've learned this.

<details>
<summary>Show questions</summary>

1. How can an image that passed signature verification, provenance
   verification, *and* admission control still be malicious? What single
   distinction from module 00 explains it?
2. What is the first question in a supply-chain incident, and which artifact from
   this track answers it as a query rather than an investigation?
3. Give the supply-chain-specific form of each response step: preserve, isolate,
   recover.
4. What does "revoking" a signature concretely mean in the keyless/Sigstore
   model, and what does it *not* mean?
5. How do Rekor and provenance function as forensic tools during an incident,
   and what does each pinpoint?
6. Why do you contain by *digest* rather than tag, and why is containment the one
   case that isn't rolled out audit-first?
7. If a signing *key* (not just an image) were compromised, why is that a worse
   incident, and how does keyless signing (module 02) avoid it?

</details>

<details>
<summary>Show answers</summary>

1. Because the compromise entered *upstream of your trust boundary* — a
   dependency your CI legitimately pulled — so your integrity controls faithfully
   certified a malicious artifact. The distinction is **integrity ≠ safety**
   (module 00): signing proves the image is the authentic output of your build,
   not that its contents are trustworthy.
2. "Where are we exposed?" — the blast radius. The **stored SBOMs** (module 01)
   answer it as a query ("which images contain the compromised package, at what
   version?") in minutes, instead of a fleet-wide rebuild-and-investigate.
3. **Preserve:** snapshot affected Pods/images *and* their attestations + Rekor
   entries before deleting (the timeline is evidence). **Isolate:**
   cordon/scale-to-zero affected workloads *and* update admission to deny the
   compromised digests so they can't be re-scheduled. **Recover:** rebuild →
   SBOM → scan → re-sign → re-attest → deploy the clean image through the normal
   gated pipeline.
4. It means withdrawing trust at the *verifier's policy layer* — denying the
   specific compromised digests at admission (module 05) and repointing tags —
   plus re-signing the *fixed replacement*. It does **not** mean cryptographically
   un-signing: a keyless signature truthfully attests the image *was* built by
   you, and you can't (and don't) un-say that.
5. **Rekor** is an immutable, timestamped log answering "when was this signed and
   by which workflow run?" — a tamper-proof timeline. **Provenance** pinpoints
   the *exact build*: which commit and CI run pulled the compromised dependency,
   scoping which images are affected and when the bad dependency first entered.
   With the SBOM (what's affected) they form a complete timeline.
6. You contain by digest because the compromised artifact is defined by its
   immutable content (module 00); denying only the tag is bypassable by pulling
   the digest directly. It's not audit-first because you have a *confirmed*
   bad artifact — audit-first exists to measure uncertain blast radius before
   blocking, which doesn't apply to a known-malicious digest (though you scope
   the deny narrowly to those digests).
7. A compromised signing *key* lets an attacker forge valid signatures on
   arbitrary malicious images, and remediation forces rotating the key and
   **re-signing every image it ever signed** plus updating every verifier — huge
   blast radius. Keyless (module 02) has *no standing key*: each signature uses a
   short-lived, identity-bound ephemeral key discarded after use, so there's no
   key to steal and no fleet-wide re-signing.

</details>

## Next

Continue to
[08-capstone-project](../08-capstone-project/README.md)
— assemble the entire track into one working pipeline: build, SBOM, keyless
sign, provenance attestation, and a cluster that admits the signed image and
rejects the unsigned one, proving both paths for real.
