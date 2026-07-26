# Image Scanning and Supply-Chain Basics

## Why this matters

Module 00's threat model flagged the image and the pipeline that builds it as
trust boundaries: everything an attacker can smuggle into a running container
usually rides in through the image. Docker module 02/09 introduced
`docker scout` as a one-off developer convenience. That's not enough for a
real system — scanning has to happen *automatically, in CI, before an image
is ever pushed or deployed*, so a vulnerable image is stopped at the door
rather than discovered in production. This module makes scanning a gate, not
a suggestion, and previews the deeper supply-chain topic (signing and SBOMs)
that track 18 owns in full.

## Concepts

### What a scanner actually does (and the SBOM underneath it)

Recall from 02/09 that a scanner compares the packages installed in an image
against databases of known CVEs. Under the hood, every scanner first builds a
**Software Bill of Materials (SBOM)** — a complete inventory of every OS
package and language dependency in the image, with versions — and *then*
cross-references that inventory against vulnerability feeds. The SBOM is the
"what's in the box" list; the scan is "which of those things has a known
problem." `docker scout` did both invisibly; **Trivy** (the tool this module
uses) exposes them as separate ideas, which matters because the SBOM is
independently useful (module 18 goes deep on generating and *attesting* to
SBOMs — here you just meet the concept).

### Trivy: an open-source scanner you run anywhere

Trivy is a widely-used, single-binary scanner that works on images,
filesystems, IaC files, and running clusters. Its key properties:

- It scans **OS packages *and* language dependencies** (npm, pip, Go modules,
  etc.), catching application-layer CVEs that OS-only scanners miss.
- It's **CI-friendly**: an `--exit-code` flag makes it *fail the build* when
  it finds vulnerabilities at or above a severity you choose — this is what
  turns scanning from a report into a gate.
- It runs locally with no account, so you can practice for real on this
  machine, unlike a paid cloud scanner.

### Microsoft Defender for Containers: the Azure-native option

Trivy is the tool you *run*; **Microsoft Defender for Containers** (part of
Defender for Cloud) is a *managed* alternative that Azure runs *for* you. Once
enabled on a subscription, it automatically scans images in ACR on push (and
periodically re-scans), assesses your AKS clusters for misconfigurations, and
surfaces runtime threat alerts — all reported into Defender for Cloud
(which you'll meet again in module 07 for incident signals). The trade-off is
the familiar one from module 00's shared-responsibility model: Trivy gives you
control and runs free/local but you must wire it into your own pipeline;
Defender is a paid plan but integrates scanning, posture, and runtime
detection into the platform with no pipeline work. Real teams often use both —
Trivy as the CI gate, Defender as the always-on registry/runtime backstop.

### Scan in CI, before push — shift left

The whole point is *timing*. A vulnerability caught on a developer's laptop or
in a CI job costs minutes to fix; the same vulnerability caught in production
is an incident. "Shift left" means moving the check as early as possible. The
canonical pipeline order (building on your CI knowledge from track 10):

1. Build the image.
2. **Scan it with Trivy, failing the job on high/critical findings.**
3. Only if the scan passes, push to ACR.
4. Deploy.

The scan sits *between* build and push, so a failing image never reaches the
registry. This is the same gate logic as a failing test blocking a merge —
security findings are just another quality gate.

### Base-image hygiene is the highest-leverage fix

02/09 showed slimmer base images have fewer CVEs simply by shipping fewer
packages. Supply-chain hygiene extends that into ongoing discipline:

- **Pin to specific, current base-image tags**, not `latest` — `latest` is a
  moving target you can't reason about, and it silently changes what you ship.
- **Rebuild regularly** so patched base images flow into your image; a CVE
  fixed upstream doesn't help you until you rebuild.
- **Prefer minimal/distroless bases** so most of the OS-package attack surface
  (and therefore most OS CVEs) simply isn't present to be flagged.
- Most scanner findings are in the **base image, not your code** — choosing a
  better base is often the single biggest reduction in your report.

### A light preview of signing and provenance (track 18 owns this)

Scanning answers "is what's in the image safe?" It does *not* answer "is this
the image I actually built, unmodified?" — that's **integrity/provenance**,
STRIDE's Tampering category from module 00. The supply-chain answer is
**signing**: after building, you cryptographically sign the image (e.g. with
Cosign), and admission control later *refuses to run any image that isn't
validly signed*, so an attacker who swaps in a tampered image is blocked even
if it would pass a scan. Paired with a signed, attested SBOM, this proves both
*what's* in the image and *that it came from your pipeline*. **That's all you
need here** — module 18 covers generating signatures/SBOMs, keyless signing,
and admission-time verification in depth. In this track, just hold the mental
model: scanning = "is it safe," signing = "is it authentic."

## Command reference

| Command | What it does | Example |
|---|---|---|
| `trivy image <image>` | Scans an image for OS + language CVEs | `trivy image myapp:latest` |
| `trivy image --severity HIGH,CRITICAL <image>` | Reports only findings at the given severities | `trivy image --severity HIGH,CRITICAL myapp:latest` |
| `trivy image --exit-code 1 --severity CRITICAL <image>` | Exits non-zero if any CRITICAL is found — the CI gate | `trivy image --exit-code 1 --severity CRITICAL myapp:latest` |
| `trivy image --ignore-unfixed <image>` | Hides CVEs that have no fix available yet | `trivy image --ignore-unfixed myapp:latest` |
| `trivy image --format sbom --output sbom.json <image>` | Emits the SBOM (inventory) rather than the CVE report | `trivy image --format cyclonedx --output sbom.json myapp:latest` |
| `trivy fs <path>` | Scans a filesystem/source tree (e.g. lockfiles) instead of an image | `trivy fs .` |
| `trivy config <path>` | Scans IaC (Dockerfile, Kubernetes YAML, Terraform) for misconfigurations | `trivy config .` |
| `az security pricing create -n Containers --tier Standard` | Enables the Defender for Containers plan on the subscription | see exercise 8 |
| `az acr repository show-tags -n <registry> --repository <repo>` | Lists tags in ACR (to point Defender/Trivy at real pushed images) | `az acr repository show-tags -n myreg --repository myapp` |

Flag breakdown for `trivy image --exit-code 1 --severity CRITICAL --ignore-unfixed myapp:latest`:

- `image` — scan mode: an OCI/Docker image (vs. `fs`, `config`, `k8s`).
- `--exit-code 1` — return exit status `1` (a CI failure) if *any* finding
  matches the filters below; without this, Trivy always exits `0` and merely
  prints a report, which CI would treat as success.
- `--severity CRITICAL` — only CRITICAL findings count toward that exit code
  (and the report). You'd typically use `HIGH,CRITICAL` in practice; CRITICAL-
  only is a gentler starting gate.
- `--ignore-unfixed` — excludes CVEs that have no upstream fix yet, so the
  gate blocks only on things you can *actually* remediate by rebuilding —
  avoiding a build that can never pass because of an unpatchable base CVE.

Flag breakdown for `az security pricing create -n Containers --tier Standard`:

- `security pricing create` — sets the Defender for Cloud plan for one
  resource type.
- `-n Containers` — the plan name; `Containers` is Defender for Containers
  (image scanning + AKS posture + runtime threat detection).
- `--tier Standard` — the paid tier that actually turns protection on (`Free`
  is effectively off). **This bills** — disable it after the lab with
  `--tier Free`.

## Hands-on exercises

Trivy exercises run locally and for real. The Defender exercise touches a paid
Azure plan — it's optional/observational and includes teardown.

1. **(WSL2) Install Trivy.**
   ```bash
   sudo apt-get install -y wget apt-transport-https gnupg
   wget -qO - https://aquasecurity.github.io/trivy-repo/deb/public.key | gpg --dearmor | sudo tee /usr/share/keyrings/trivy.gpg > /dev/null
   echo "deb [signed-by=/usr/share/keyrings/trivy.gpg] https://aquasecurity.github.io/trivy-repo/deb generic main" | sudo tee /etc/apt/sources.list.d/trivy.list
   sudo apt-get update && sudo apt-get install -y trivy
   trivy --version
   ```
   Expect a version string. (If the apt repo gives you trouble, the
   `install.sh` from Trivy's docs or a `brew install trivy` in WSL both work.)

2. **(WSL2) Scan a deliberately old, vulnerable image.**
   ```bash
   trivy image python:3.9-slim
   ```
   Expect a table grouped by target (the OS layer, then any language
   packages), each row a CVE with severity, installed version, and fixed
   version. Read the shape: note how many are `CRITICAL`/`HIGH` and how many
   already have a fixed version available.

3. **(WSL2) Compare base images — hygiene made visible.**
   ```bash
   trivy image --severity HIGH,CRITICAL python:3.9-slim
   trivy image --severity HIGH,CRITICAL python:3.12-slim
   ```
   Expect the older `3.9` base to carry more high/critical findings than the
   current `3.12`. This is the base-image-hygiene lesson from Concepts as a
   number: *just updating the base tag* removed vulnerabilities, no code
   change.

4. **(WSL2) Filter to what you can actually fix.**
   ```bash
   trivy image --severity HIGH,CRITICAL --ignore-unfixed python:3.9-slim
   ```
   Expect a shorter list than exercise 3 — the ones removed are CVEs with no
   available fix. Note the trade-off: `--ignore-unfixed` keeps your gate
   actionable, but you're accepting (and should track) the unfixable ones.

5. **(WSL2) Turn scanning into a CI gate locally.** Simulate the pipeline
   check on your own machine:
   ```bash
   trivy image --exit-code 1 --severity CRITICAL --ignore-unfixed python:3.9-slim
   echo "exit code was: $?"
   ```
   Expect a non-zero exit code if any fixable CRITICAL exists (this is what
   would fail a CI job). Now run the same against a current base:
   ```bash
   trivy image --exit-code 1 --severity CRITICAL --ignore-unfixed python:3.12-slim
   echo "exit code was: $?"
   ```
   The pass/fail difference *is* the gate — a real pipeline would push only
   when exit code is `0`.

6. **(WSL2) Generate an SBOM and read it.**
   ```bash
   trivy image --format cyclonedx --output sbom.json python:3.12-slim
   grep -o '"name":"[^"]*"' sbom.json | head -20
   ```
   Expect a JSON inventory of components. This is the "what's in the box" list
   that scanning runs against — and the artifact module 18 will teach you to
   *sign and attest to*. You're only generating it here.

7. **(WSL2) Scan your own Dockerfile for misconfigurations.** Reuse a
   Dockerfile from the Docker track (or write a small one that runs as root),
   then:
   ```bash
   trivy config .
   ```
   Expect findings like "image runs as root" or "no `USER` instruction" —
   Trivy checking the *configuration* (a different axis from CVEs), catching
   exactly the 02/09 hardening lessons as automated warnings.

8. **(Azure, optional/observational) Enable Defender for Containers, then
   disable it.** This is a paid plan — do this only to *see* it, and turn it
   off immediately after:
   ```bash
   az security pricing show -n Containers --query pricingTier -o tsv   # baseline
   az security pricing create -n Containers --tier Standard
   az security pricing show -n Containers --query pricingTier -o tsv   # now Standard
   ```
   In the portal, Defender for Cloud → Recommendations will (after images are
   pushed and scanned) show container image findings similar to Trivy's, but
   assessed automatically on ACR push. **Teardown — do not skip:**
   ```bash
   az security pricing create -n Containers --tier Free
   az security pricing show -n Containers --query pricingTier -o tsv   # back to Free
   ```
   Expect the tier to read `Free` again. (Compare the experience: Trivy was
   free and instant but you wired it in yourself; Defender was managed and
   automatic but billable — the shared-responsibility trade-off from module
   00, applied to scanning.)

9. **Diagnose and fix: a build that can never pass its own gate.** A teammate
   set a CI gate at `--severity HIGH,CRITICAL` with no `--ignore-unfixed`, and
   the build now fails forever because the chosen base image has an
   unfixable HIGH CVE. Reproduce the failure:
   ```bash
   trivy image --exit-code 1 --severity HIGH,CRITICAL python:3.9-slim; echo "exit: $?"
   ```
   Diagnose: rerun with `--ignore-unfixed` and compare — if the *only* thing
   blocking is unfixable, the gate is unsatisfiable by rebuilding. There are
   two legitimate fixes: (a) switch to a base image where the CVE *is* fixed
   (`python:3.12-slim`), or (b) add `--ignore-unfixed` so the gate blocks only
   on remediable findings, while separately tracking the accepted risk.
   Verify fix (a):
   ```bash
   trivy image --exit-code 1 --severity HIGH,CRITICAL python:3.12-slim; echo "exit: $?"
   ```
   Expect exit `0`. The lesson: a gate that can't be satisfied by any action
   the developer can take gets disabled by frustrated teams — a good gate must
   be *achievable*, which is why base-image choice and `--ignore-unfixed`
   matter together.

10. **(WSL2) Clean up.**
    ```bash
    rm -f sbom.json
    docker rmi python:3.9-slim 2>/dev/null; true
    ```
    (Confirm you ran the Defender teardown in exercise 8 if you did that one.)

## Independent challenge

No commands given — build it yourself using this module plus your CI
knowledge from track 10 and the hardening from 02/09. Take a small app image
that currently runs as root on an outdated base, and produce a *repeatable
gate*: write (in prose or as a real workflow file) the ordered CI steps that
build, scan, and only-then-push the image, choosing a severity threshold you
can justify and deciding explicitly how you handle unfixable CVEs. Prove the
gate works by showing the same pipeline *failing* on the bad image and
*passing* after you harden it (newer minimal base, non-root). Then, in two or
three sentences, describe what signing would add on top of your scan gate that
scanning alone can never provide — naming the STRIDE category from module 00 it
addresses and which later track owns the full topic.

<details>
<summary>Stuck? One hint</summary>

The gate is `trivy image --exit-code 1 --severity <your-threshold>
--ignore-unfixed` placed *between* the build step and the push step, so a
non-zero exit stops the pipeline before the image reaches ACR. For the last
part: scanning proves the contents are (currently) free of *known* CVEs;
signing proves the image is the authentic, unmodified artifact your pipeline
produced — that's Tampering/integrity, owned in depth by track 18.

</details>

## Common mistakes & troubleshooting

- **Scanning only on a laptop, never in CI.** A manual scan you sometimes
  remember to run is not a control. The gate has to be automatic and
  *blocking* (`--exit-code`), or vulnerable images will slip through the times
  you forget.
- **Putting the scan after the push.** If the scan runs after the image is
  already in ACR, a bad image is already available to be pulled. Scan
  *between* build and push so a failing image never gets published.
- **Setting an unsatisfiable gate.** A threshold that blocks on unfixable
  CVEs (exercise 9) can't be passed by any developer action, so teams disable
  it. Combine a sensible severity with `--ignore-unfixed`, and track accepted
  unfixables separately.
- **Blaming your code for base-image CVEs.** Most findings live in the base
  image's OS packages, not your app. Reach for a newer/minimal base *before*
  auditing your own dependencies — it usually clears most of the report.
- **Trusting a clean scan as "secure."** As 02/09 warned, scanning finds
  *known, published* CVEs only — nothing about your own logic bugs, zero-days,
  or whether the image was tampered with after building (that's signing's
  job).
- **Confusing scanning with signing.** They answer different questions — "is
  it safe?" vs. "is it authentic?" A validly signed image can still be
  vulnerable; a freshly-scanned image can still be a tampered impostor. You
  need both.
- **Leaving the Defender plan on Standard after a lab.** It bills per
  resource. If you enabled it to look around, set it back to `Free`.

## Checkpoint quiz

Write down your answer to each question before expanding it — checking without attempting first is the single easiest way to fool yourself into thinking you've learned this.

<details>
<summary>Show questions</summary>

1. What is an SBOM, and how does it relate to what a vulnerability scan does?
2. Where in a CI pipeline should the image scan run, and what flag makes it
   actually block a bad image?
3. What's the difference between running Trivy yourself and enabling Defender
   for Containers, in shared-responsibility terms?
4. Why does `--ignore-unfixed` make a CI gate more sustainable, and what's the
   trade-off?
5. Why is choosing a newer/minimal base image often the single biggest
   reduction in a scan report?
6. What question does image *signing* answer that image *scanning* never can,
   and which STRIDE category (module 00) does it address?
7. A scan comes back completely clean. Name two distinct classes of risk that
   still tells you nothing about.

</details>

<details>
<summary>Show answers</summary>

1. An SBOM (Software Bill of Materials) is a complete inventory of every OS
   package and language dependency in an image, with versions. A scanner
   builds the SBOM first, then cross-references that inventory against known-
   CVE databases — the SBOM is "what's in the box," the scan is "which of
   those have known problems."
2. Between the build step and the push step, so a failing image never reaches
   the registry. `--exit-code 1` (with a `--severity` filter) makes Trivy
   return a non-zero status that fails the CI job, turning a report into a
   gate.
3. Running Trivy yourself is free and fully under your control, but you must
   wire it into your own pipeline (your responsibility). Defender for
   Containers is a managed, paid Azure plan that scans ACR images on push and
   assesses clusters automatically with no pipeline work — more of the job
   shifts to the platform, at a cost.
4. It excludes CVEs with no available upstream fix, so the gate blocks only on
   things a developer can actually remediate by rebuilding — keeping the gate
   achievable so teams don't disable it. The trade-off is that you're
   accepting (and should separately track) the unfixable vulnerabilities
   rather than being blocked on them.
5. Because most findings live in the base image's OS packages rather than your
   application code, and a newer or minimal/distroless base ships fewer (and
   more-patched) packages — so swapping the base can clear the bulk of the
   report with no code change.
6. Signing answers "is this the authentic, unmodified image my pipeline
   produced?" — integrity/provenance — which scanning (which only inspects
   contents for known CVEs) cannot. It addresses STRIDE's **Tampering**
   category. Track 18 owns the full signing/SBOM-attestation topic.
7. Among others: vulnerabilities in your own application logic (not published
   CVEs), unpublished/zero-day vulnerabilities, and whether the image was
   tampered with after being built (integrity). A clean scan only means no
   *known, published* CVEs in the *packages it inventoried*.

</details>

## Next

Continue to
[02-secrets-management-in-depth](../02-secrets-management-in-depth/README.md)
— now that you can trust *what's in* an image, tackle the secrets it needs at
runtime without baking, leaking, or long-lived-credential liabilities.
