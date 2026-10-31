# Software Bills of Materials (SBOMs)

## Why this matters

Module 00 named the first of the three questions an image must answer for
itself: **what is in it?** Track 11 module 01 already told you a scanner builds
an SBOM under the hood and let you dump one with `trivy image --format
cyclonedx` — but there it was a throwaway byproduct of scanning. Here the SBOM
is the *product*. A first-class SBOM is the thing you'll later sign, attach to
the image, and hand to admission control; it's also what turns a future
"is-package-X-in-any-of-our-images?" incident question (module 07) from a
frantic rebuild-and-grep into a fast query against artifacts you already have.
This module makes the SBOM a real, durable artifact, generated the way a
supply-chain pipeline generates it.

## Concepts

### What an SBOM actually contains

An SBOM is a structured inventory of every **component** in an artifact. For a
container image, that means, per component:

- **Name and version** — `openssl 3.0.11`, `express 4.18.2`.
- **Type/ecosystem** — OS package (apk/deb/rpm), language library (npm, pip,
  Go module, Maven), or the image itself.
- **A unique identifier** — a **PURL** (package URL, e.g.
  `pkg:npm/express@4.18.2`) and/or a **CPE**, so tools can match it against
  vulnerability databases unambiguously (this is the join key module 04's
  continuous scanning relies on).
- **Location/provenance hints** — which layer or file it came from.
- Often **licenses** and **checksums** for each component.

That's the "what's in the box" list module 00 promised, made machine-readable.
Note what it is *not*: an SBOM is not a vulnerability report. It lists
components; a scanner *joins* that list against CVE feeds. Same split track 11
drew — the SBOM is the noun, the scan is the verb.

### The two dominant formats: SPDX and CycloneDX

You'll meet two standards at a survey level; you don't need to author either by
hand, but you must recognize them and know when each is used:

- **SPDX** (Software Package Data Exchange) — an ISO standard (ISO/IEC 5962),
  originally license-compliance-focused, now general-purpose. It's the format
  GitHub, `docker buildx`, and much of the Linux Foundation world default to.
  Verbose, relationship-rich.
- **CycloneDX** — an OWASP standard, security-first from the start, compact,
  strong at expressing vulnerability and dependency relationships. Widely used
  in security tooling (Trivy defaults to it, Dependency-Track consumes it).

They express the same core idea (a component inventory with identifiers); they
differ in schema, verbosity, and lineage. The practical rule: **produce
whichever format the consumer expects.** Your admission controller, your
scanner, and your registry may each prefer one — good SBOM tools convert
between them, and you'll do that conversion in the exercises. Don't religious-war
this; treat format as an interop detail.

### Syft: a dedicated SBOM generator

Track 11 used Trivy, which *also* emits SBOMs. This track adds **Syft**
(from Anchore) — a tool whose *single job* is SBOM generation, which makes it
the natural fit for a pipeline where the SBOM is a first-class deliverable
rather than a scan side-effect. Key properties, echoing why track 11 liked
Trivy:

- **Single binary, no account, runs locally** — practice for real on this
  machine.
- **Many catalogers** — it inventories OS packages *and* language dependencies
  across dozens of ecosystems, and can scan an image, a directory, or an
  archive.
- **Multi-format output** — SPDX (JSON/tag-value), CycloneDX (JSON/XML), and
  its own native format, selectable with one flag. This is what makes the
  "produce whichever the consumer wants" rule practical.

Syft pairs with **Grype** (its sibling scanner) exactly the way an SBOM pairs
with a scan: `syft` produces the inventory, `grype` consumes it to find CVEs.
You'll use that pairing in module 04.

### Generating the SBOM at the right moment (and pinning by digest)

*When* you generate the SBOM matters as much as *that* you do. Two rules:

- **Generate it in CI, against the exact image you're about to ship**, right
  after build — the same "shift left, in the pipeline" timing track 11 module
  01 drilled for scanning, and the same slot you'll later add signing (module
  02) and provenance (module 03). An SBOM generated later, by hand, against a
  re-pulled tag, can drift from what actually shipped — the "stale SBOM"
  failure you'll deliberately reproduce below.
- **Bind the SBOM to the image's digest, not its tag.** Module 00's
  digest-vs-tag point applies directly: an SBOM is only trustworthy if it's tied
  to the immutable `sha256:` content it describes. Attach-by-digest is how
  module 03 makes the binding cryptographic; here you at least record the
  digest the SBOM was generated against.

### What an SBOM buys you later (why this isn't busywork)

An SBOM sitting in a drawer is useless; an SBOM wired into your pipeline pays
off three times over, each in a later module:

- **Attestation (module 03):** you sign the SBOM and attach it to the image, so
  a consumer can verify *this inventory really describes this image and came
  from us*.
- **Continuous scanning (module 04):** when a new CVE lands tomorrow, you
  re-scan *the stored SBOMs* of every image instead of re-pulling and
  re-analyzing every image — much faster, and it works even for images no
  longer in a running registry.
- **Incident blast-radius (module 07):** when `xz-utils` is announced
  vulnerable, "which of our 400 images contain it, at what version?" is a query
  over your SBOM store, answerable in minutes instead of a fleet-wide rebuild.

That third one is the payoff that makes SBOMs worth the pipeline cost — you're
pre-computing the answer to the worst question you'll ever be asked under
pressure.

## Command reference

| Command | What it does | Example |
|---|---|---|
| `syft <image>` | Generates an SBOM, printing a component table | `syft python:3.12-slim` |
| `syft <image> -o spdx-json` | Emits SPDX in JSON | `syft myapp:1.0 -o spdx-json` |
| `syft <image> -o cyclonedx-json` | Emits CycloneDX in JSON | `syft myapp:1.0 -o cyclonedx-json` |
| `syft <image> -o spdx-json=sbom.spdx.json` | Writes SBOM to a file (format=path form) | `syft myapp:1.0 -o spdx-json=sbom.spdx.json` |
| `syft <dir-or-archive>` | SBOMs a filesystem/source tree instead of an image | `syft dir:.` |
| `syft scan <ref>@sha256:<digest>` | SBOMs a specific immutable digest | `syft myreg.azurecr.io/app@sha256:abc...` |
| `syft convert <sbom> -o cyclonedx-json` | Converts an existing SBOM between formats | `syft convert sbom.spdx.json -o cyclonedx-json` |
| `docker buildx build --sbom=true ...` | Has BuildKit generate and attach an SBOM at build time | see exercise 7 |
| `trivy image --format spdx-json -o s.json <image>` | Trivy's SBOM output, for comparison with Syft | `trivy image --format spdx-json -o s.json myapp:1.0` |

Flag breakdown for `syft python:3.12-slim -o spdx-json=sbom.spdx.json --scope all-layers`:

- (subject) `python:3.12-slim` — the scan target. Can be an image ref, a
  `dir:` path, or an archive; prefer `image@sha256:<digest>` when the binding
  to exact content matters.
- `-o spdx-json=sbom.spdx.json` — output selector in `format=path` form:
  `spdx-json` picks the SPDX-in-JSON format; the part after `=` is the file to
  write. Omit the `=path` to print to stdout. You can pass `-o` multiple times
  to emit several formats at once.
- `--scope all-layers` — catalog packages in *every* layer, including files
  deleted in later layers (default `squashed` sees only the final filesystem).
  `all-layers` catches things that were installed then removed but may still
  matter for provenance.

Flag breakdown for `docker buildx build --sbom=true --provenance=mode=max -t app:1.0 --push .`:

- `--sbom=true` — BuildKit generates an SPDX SBOM *during the build* and
  attaches it to the image as an OCI attestation (no separate Syft step).
- `--provenance=mode=max` — also attach SLSA provenance (module 03's topic);
  shown here only so you see SBOM and provenance are attached the same way.
- `--push` — attestations live in the registry alongside the image manifest, so
  attaching only makes sense when pushing.

## Hands-on exercises

Syft runs locally and for real, like Trivy in track 11.

1. **(WSL2) Install Syft (and Grype for later).**
   ```bash
   curl -sSfL https://raw.githubusercontent.com/anchore/syft/main/install.sh | sh -s -- -b /usr/local/bin
   curl -sSfL https://raw.githubusercontent.com/anchore/grype/main/install.sh | sh -s -- -b /usr/local/bin
   syft version && grype version
   ```
   Expect version strings for both. (If the install script is blocked, a
   `brew install syft grype` in WSL works too.)

2. **(WSL2) Generate your first real SBOM and read it.**
   ```bash
   syft python:3.12-slim
   ```
   Expect a table of components: OS packages (deb) *and* the Python packages
   present, each with a name, version, and type. Note the count — this is the
   full "what's in the box" list module 00 had you build by hand.

3. **(WSL2) Emit both standard formats and eyeball the difference.**
   ```bash
   syft python:3.12-slim -o spdx-json=sbom.spdx.json
   syft python:3.12-slim -o cyclonedx-json=sbom.cdx.json
   grep -o '"name"' sbom.spdx.json | wc -l
   grep -o '"purl"' sbom.cdx.json | wc -l
   ```
   Open both briefly. Same components, different schema (SPDX's
   `packages`/`relationships` vs CycloneDX's `components`). This is the
   format-is-interop-detail lesson made concrete.

4. **(WSL2) Convert between formats without regenerating.**
   ```bash
   syft convert sbom.spdx.json -o cyclonedx-json=converted.cdx.json
   diff <(grep -o '"name":"[^"]*"' sbom.cdx.json | sort) \
        <(grep -o '"name":"[^"]*"' converted.cdx.json | sort) | head
   ```
   Expect the component *set* to match (minor field differences are fine). This
   is why you don't fight over formats — one SBOM converts to whatever a
   consumer wants.

5. **(WSL2) SBOM your own image, pinned by digest.** Build a tiny image (reuse
   any Dockerfile from track 02, or the one below), then SBOM the exact digest:
   ```bash
   printf 'FROM python:3.12-slim\nRUN pip install requests==2.32.3\n' > Dockerfile
   docker build -t sbom-lab:1.0 .
   DIGEST=$(docker inspect --format '{{index .RepoDigests 0}}' sbom-lab:1.0 2>/dev/null)
   syft sbom-lab:1.0 -o spdx-json=app-sbom.json
   grep -o '"name":"requests"' app-sbom.json
   ```
   Expect `requests` to appear in the SBOM — your added dependency is now
   inventoried. (If `RepoDigests` is empty because you never pushed, that's
   expected locally; module 03 pins by digest against a real registry.)

6. **(WSL2) Feed the SBOM to a scanner — the noun/verb split, for real.**
   ```bash
   grype sbom:app-sbom.json
   ```
   Expect Grype to report CVEs *derived from the SBOM you already made*, without
   re-analyzing the image. This is exactly module 04's continuous-scanning
   pattern in miniature: scan the stored inventory, not the image.

7. **(WSL2, optional) Let BuildKit attach the SBOM at build time.** If you have
   `docker buildx`:
   ```bash
   docker buildx build --sbom=true -t sbom-lab:2.0 --load .
   docker buildx imagetools inspect sbom-lab:2.0 --format '{{json .SBOM}}' 2>/dev/null | head -c 300; echo
   ```
   Expect an SBOM attestation to be attached to the image itself — the SBOM
   travels *with* the image, previewing module 03's attach-to-image model.

8. **Diagnose and fix: a stale SBOM.** Reproduce the classic supply-chain
   footgun — an SBOM that no longer matches the image it claims to describe:
   ```bash
   # Generate an SBOM against the current image
   syft sbom-lab:1.0 -o spdx-json=stale-sbom.json
   grep -c '"name":"flask"' stale-sbom.json    # expect 0 — flask isn't installed
   # Now change the image WITHOUT regenerating the SBOM
   printf 'FROM python:3.12-slim\nRUN pip install requests==2.32.3 flask==3.0.3\n' > Dockerfile
   docker build -t sbom-lab:1.0 .
   ```
   The image now contains Flask, but `stale-sbom.json` still doesn't mention it.
   Prove the drift and fix it:
   ```bash
   syft sbom-lab:1.0 -o spdx-json=fresh-sbom.json
   grep -c '"name":"flask"' stale-sbom.json     # 0 — the lie
   grep -c '"name":"flask"' fresh-sbom.json      # >=1 — the truth
   ```
   Diagnose: the SBOM was generated *before* the image changed, so it
   under-reports contents — a scanner trusting it would miss Flask's CVEs
   entirely. The fix is process, not a flag: **generate the SBOM in the same CI
   step that produces the final image, bound to its digest**, so an SBOM can
   never describe a different build than the one that shipped (module 03 makes
   this binding cryptographic).

9. **(WSL2) Clean up.**
   ```bash
   rm -f sbom.spdx.json sbom.cdx.json converted.cdx.json app-sbom.json stale-sbom.json fresh-sbom.json Dockerfile
   docker rmi sbom-lab:1.0 sbom-lab:2.0 2>/dev/null; true
   ```

## Independent challenge

No commands given — build it using this module plus the CI knowledge from track
10 and the digest-vs-tag reasoning from module 00. Take one of your own images
and produce a *repeatable SBOM step*: describe (in prose or as a real workflow
snippet) where in a build-scan-push pipeline the SBOM generation belongs so it
can never go stale, which format you'd emit and *why* given a named downstream
consumer, and how you'd bind the SBOM to the image's digest rather than its tag.
Then demonstrate the payoff: generate the SBOM, feed it to Grype to produce a
vulnerability report *from the SBOM alone*, and write two sentences on how this
same stored SBOM would let you answer "which of our images contain
`openssl < 3.0.12`?" during an incident (module 07) without touching any image.

<details>
<summary>Stuck? One hint</summary>

The SBOM step goes immediately after the build and against the *just-built
digest*, before or alongside the scan gate — same slot as track 11's Trivy
step, so build → **SBOM(digest)** → scan → sign → push. Emit whatever your
consumer needs (CycloneDX if it's a security tool like Dependency-Track, SPDX
if it's GitHub/`buildx`), and you can always `syft convert` later. For the
incident query, remember the SBOM already contains a PURL per component
(`pkg:deb/openssl@...`), so answering "who has vulnerable openssl?" is a
`grep`/query over stored SBOM files, not a rebuild.

</details>

## Common mistakes & troubleshooting

- **Treating the SBOM as a vulnerability report.** It's the *inventory* (noun);
  a scanner *joins* it against CVE feeds (verb). An SBOM with zero CVEs listed
  isn't "clean" — it simply hasn't been scanned yet.
- **Generating the SBOM by hand, later, against a re-pulled tag.** That's how it
  drifts from what shipped (exercise 8). Generate it in CI, in the build step,
  bound to the digest.
- **Binding the SBOM to a tag.** A tag is mutable (module 00); an SBOM tied to
  `:1.0` can silently describe a different image tomorrow. Bind to `sha256:`.
- **Fighting over SPDX vs CycloneDX.** They express the same inventory; produce
  what the consumer wants and `syft convert` for the rest. Format is an interop
  detail, not a decision worth blocking on.
- **Using `--scope squashed` and wondering where a removed package went.** The
  default sees only the final filesystem; use `--scope all-layers` if you need
  packages that were installed then deleted in a later layer.
- **Assuming an SBOM proves authenticity.** It describes contents, nothing more.
  An attacker can generate a perfectly accurate SBOM for a malicious image.
  Authenticity comes from *signing* the SBOM and the image (modules 02–03) —
  the SBOM alone is claims, not proof.

## Checkpoint quiz

Write down your answer to each question before expanding it — checking without attempting first is the single easiest way to fool yourself into thinking you've learned this.

<details>
<summary>Show questions</summary>

1. List four things an SBOM records per component, and name the identifier that
   lets a scanner match a component to a CVE database.
2. What is the difference between an SBOM and a vulnerability scan report?
3. Name the two dominant SBOM formats, their lineage/focus, and the practical
   rule for choosing between them.
4. Why should the SBOM be generated in CI against the image's *digest* rather
   than by hand later against its tag?
5. Describe the stale-SBOM failure from exercise 8 and the *process* fix for it.
6. Give the three later-module payoffs an SBOM enables, one sentence each.
7. Does having an accurate SBOM prove an image is authentic? Why or why not?

</details>

<details>
<summary>Show answers</summary>

1. Per component: **name**, **version**, **type/ecosystem** (OS package vs
   language library), a **unique identifier** (PURL and/or CPE), and often
   **license** and **checksum** plus a location hint. The **PURL/CPE** is the
   identifier scanners join against CVE databases.
2. An SBOM is the *inventory* of components (the noun); a scan report is the
   result of *cross-referencing* that inventory against known-CVE feeds (the
   verb). The SBOM lists what's present; the scan says which of those have known
   problems.
3. **SPDX** (Linux Foundation / ISO standard, originally license-focused, the
   GitHub/`buildx` default) and **CycloneDX** (OWASP, security-first, the Trivy
   default). Practical rule: produce whichever format the *consumer* expects,
   and convert between them with `syft convert` — format is an interop detail.
4. Because a hand-generated, later SBOM against a mutable tag can drift from what
   actually shipped (the tag may point elsewhere, or the image may have
   changed), so it can under- or over-report contents. Generating in CI against
   the immutable `sha256:` digest guarantees the SBOM describes exactly the
   bytes that shipped.
5. The SBOM was generated *before* the image changed (Flask was added after),
   so it under-reported contents and any scanner trusting it would miss Flask's
   CVEs. The fix is process, not a flag: generate the SBOM in the same CI step
   that produces the final image, bound to its digest, so it can't describe a
   different build.
6. **Attestation (03):** sign and attach the SBOM so consumers can verify it
   describes this image and came from you. **Continuous scanning (04):** re-scan
   stored SBOMs when new CVEs land, without re-pulling images. **Incident
   blast-radius (07):** answer "which images contain vulnerable package X?" as a
   fast query over stored SBOMs instead of a fleet-wide rebuild.
7. No. An SBOM only *describes contents* — an attacker can produce an accurate
   SBOM for a malicious image. Authenticity requires *signing* the image and
   attesting the SBOM (modules 02–03); the SBOM by itself is an unverified
   claim.

</details>

## Next

Continue to
[02-image-signing-with-cosign-and-sigstore](../02-image-signing-with-cosign-and-sigstore/README.md)
— you can now say *what's in* an image; next, answer the second question, *is it
authentic?*, by signing it with cosign and Sigstore's keyless flow.
