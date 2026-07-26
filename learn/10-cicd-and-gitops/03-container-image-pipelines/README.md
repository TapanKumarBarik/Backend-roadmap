# Container Image Pipelines

## Why this matters

The artifact that flows through every environment (module 00's "build once,
deploy many") is the container image, and the tag you put on it is the
single most consequential decision in the whole pipeline. Track 07's module
08 already told you *tag by commit SHA, not `latest`* and showed why —
this module goes much deeper: the full taxonomy of tagging strategies and
their trade-offs, how to build images fast in CI with Buildx layer caching,
how to push to the **ACR you provisioned with Terraform in track 09**, and
how to make the built tag flow cleanly from the build job to the deploy job.
Get tagging wrong and every downstream module — rollouts, GitOps,
rollbacks — inherits an untraceable, un-rollback-able mess.

## Concepts

### Recap and generalize: why not `latest`

Track 07's module 08 established two facts about `latest`: it silently
breaks `kubectl set image` rollouts (the pod spec text never changes, so
Kubernetes triggers nothing), and it makes deploys untraceable. Generalize
those into the rule for this whole track: **a deployable image tag must be
immutable and unique per build.** Immutable so "the thing I tested" and
"the thing running in prod" are provably identical (module 00's build-once
rule); unique so every deploy is a distinct, addressable reference you can
roll back *to*. `latest` fails both — it's mutable (repointed every push)
and non-unique (every build shares it). It has exactly one legitimate use:
a convenience pointer for humans doing `docker pull` locally, never a
deploy target.

### Tagging strategies: SHA, semver, and multi-tagging

Three schemes, each answering a different question:

- **Commit SHA** (`myapp:a1b2c3d`): maximally traceable — every image maps
  to an exact commit. Perfect for CI/CD internals and rollbacks. Downside:
  meaningless to humans ("is `a1b2c3d` newer than `f4e5d6c`?" — you can't
  tell without Git). This is the default this track uses for deploys.
- **Semantic version** (`myapp:1.4.2`): human-meaningful, communicates
  compatibility (major.minor.patch), and is what you publish for *releases*
  consumed by others. Downside: requires a deliberate release process to
  assign — you don't get a new semver on every commit. Usually driven by a
  `tag`-push trigger (module 00) creating `v1.4.2`.
- **Multi-tagging**: push the *same image* under several tags at once — e.g.
  the SHA for traceability *and* a semver for humans *and* a branch/
  environment tag. One build, multiple pointers to the identical digest.
  The `docker/metadata-action` automates deriving these tags from the Git
  context.

A common, sound production setup: SHA tag for the deploy reference, semver
for released artifacts, and never a bare `latest` as a deploy target.

### The image digest: the truly immutable identity

Even a SHA *tag* is just a mutable pointer in principle — someone could
force-push a different image to `myapp:a1b2c3d`. The genuinely immutable
identity is the **digest**: `myapp@sha256:...`, a content hash of the image
itself. Two images with the same digest are byte-identical; a digest can
never point to different content. For the strongest "exactly what I tested"
guarantee (and for supply-chain security, track 18), deployments can pin to
the digest rather than a tag. This track deploys by SHA tag for readability
but you should know the digest is what makes an image *provably* immutable —
`docker buildx build` prints the pushed digest, and you can resolve a tag to
its digest with `az acr repository show --image`.

### Building fast in CI: Buildx and layer caching

Every CI build starts on a blank runner (module 01), so without help,
Docker rebuilds every layer from scratch every time — slow. **Buildx**
(Docker's BuildKit-based builder, `docker/build-push-action` in Actions)
supports **layer caching** across runs: it exports the build cache to a
registry or the GitHub Actions cache and imports it next run, so unchanged
layers (base image, dependency install) are reused and only changed layers
rebuild. This is the module-02 caching idea applied to *image layers* rather
than package directories, and it's the difference between a 30-second and a
5-minute image build. Cache scopes: `type=gha` (GitHub Actions cache,
simplest) or `type=registry` (store cache in ACR itself).

### Pushing to a Terraform-provisioned ACR

In track 09 you provisioned an ACR declaratively with Terraform (rather
than `az acr create` by hand as in track 02/07). The pipeline doesn't care
*how* the ACR was created — it needs three things: the ACR's **login
server** (`<name>.azurecr.io`, a Terraform output), an **identity with
`AcrPush`** on it (track 07 module 08's role, granted via Terraform or `az`),
and a login (`az acr login` or `docker/login-action` with a token). The
clean pattern is to expose the ACR login server as a Terraform output and
feed it to the workflow as a repository variable, so infra (track 09) and
pipeline (this track) stay decoupled but connected — change the ACR in
Terraform and the pipeline picks up the new login server without edits. The
push identity should authenticate via **OIDC** (track 07 module 08; deepened
in module 07), not a stored registry password.

### Passing the tag from build to deploy

Module 01 taught job outputs; here's their canonical use. The build job
computes the image tag once (from `github.sha`), builds and pushes under it,
and exposes it as a **job output**. The deploy job (`needs: [build]`) reads
`needs.build.outputs.image-tag` and deploys *that exact reference*. This
guarantees the deploy uses the identical tag that was built — you never
recompute it in two places (a subtle way to accidentally deploy the wrong
image). In the GitOps half of this track (module 05) the "deploy job"
instead commits that tag into a manifest in Git, but the principle is the
same: one computed tag, referenced everywhere downstream.

## Command reference

Image-pipeline actions and the `az acr` / `docker buildx` commands behind
them.

| Command / action | What it does | Notes |
|---|---|---|
| `docker/setup-buildx-action@v3` | Configures Buildx/BuildKit on the runner | Prereq for cache-aware builds |
| `docker/login-action@v3` | Logs the runner in to a registry | `registry: <name>.azurecr.io`; use a token/OIDC, not a password |
| `az acr login --name <acr>` | Alternative registry login via the Azure CLI | Works after `azure/login` OIDC (track 07 module 08) |
| `docker/metadata-action@v5` | Derives tags/labels from Git context | Emits SHA, semver, branch tags automatically |
| `docker/build-push-action@v6` | Builds and pushes in one step, with caching | `push: true`, `tags:`, `cache-from`/`cache-to` |
| `cache-from: type=gha` / `cache-to: type=gha,mode=max` | Import/export the build cache to the GH Actions cache | `mode=max` caches all layers, not just the final one |
| `tags: <acr>.azurecr.io/app:${{ github.sha }}` | The image reference(s) to push | Multiple lines = multi-tagging the same build |
| `docker buildx build --push -t ... .` | The raw CLI equivalent | Prints the pushed `sha256:` digest |
| `az acr repository show-tags --name <acr> --repository app -o table` | Lists tags in the repo | Verify the SHA tag landed (track 07 module 08) |
| `az acr repository show --name <acr> --image app:<sha> --query digest -o tsv` | Resolves a tag to its immutable digest | The truly-immutable identity |
| `az acr manifest list-metadata --registry <acr> --name app -o table` | Lists manifests/digests with timestamps | Auditing what's stored |
| `az acr repository delete --name <acr> --image app:<tag>` | Deletes a specific image/tag | For cleanup; retention policies automate this |
| `az acr config retention update` | Configures automatic untagged-manifest cleanup | Controls the storage-growth cost pitfall (track 07 module 08) |
| `echo "image-tag=..." >> "$GITHUB_OUTPUT"` | Exposes the computed tag as a job output | Consumed by the deploy job via `needs.<job>.outputs` |

## Hands-on exercises

Use a repo with a `Dockerfile` (the track 07 demo app works) and an ACR you
provisioned in track 09 (or `az acr create` one if you're doing this track
before finishing 09 — the pipeline is identical). Set repository variables
`ACR_LOGIN_SERVER` and the OIDC identity vars from track 07 module 08.

1. **Build and push a SHA-tagged image from CI.** Write
   `.github/workflows/image.yml` (trigger: `push` to `main`) that logs in to
   Azure via OIDC, sets up Buildx, and uses `docker/build-push-action` to
   build and push `${ACR_LOGIN_SERVER}/demo-app:${{ github.sha }}`. Confirm
   with `az acr repository show-tags` that the SHA tag exists.

2. **Prove `latest` breaks traceability.** Add a *second* tag line pushing
   `:latest` alongside the SHA. Push twice (two different commits) and run
   `az acr repository show-tags` — note `latest` now points at only the
   newer image while both SHA tags persist. Resolve each with
   `az acr repository show --image demo-app:latest --query digest` before
   and after the second push and watch the digest change under a fixed tag.
   This is why `latest` can't be a deploy target.

3. **Multi-tag with `metadata-action`.** Replace hand-written tags with
   `docker/metadata-action@v5` configured to emit both a SHA tag and a
   branch tag. Push and confirm both tags point to the *same digest*
   (`az acr repository show --image ...` for each). One build, multiple
   human/machine-friendly pointers to identical content.

4. **Add Buildx layer caching and measure it.** Add
   `cache-from: type=gha` and `cache-to: type=gha,mode=max` to the
   build-push step. Push once (cold — populates cache), then push a commit
   that changes *only application code* (not the dependency manifest).
   Compare build durations: the dependency-install layers should be cached
   and only your code layer should rebuild. Then change the dependency
   manifest and confirm that layer (and everything after it) rebuilds —
   Docker's layer invalidation, same principle as module 02's cache key.

5. **Pin and deploy by digest.** Take the digest of your latest build
   (`az acr repository show --image demo-app:<sha> --query digest -o tsv`)
   and deploy a pod referencing `demo-app@sha256:<digest>` instead of the
   tag. Confirm it runs. Reflect on why a digest is a stronger "exactly
   what I tested" guarantee than a tag (which is still a mutable pointer).

6. **Semver on a tag trigger.** Add a second workflow triggered on
   `push: tags: ['v*']` that builds and pushes `demo-app:${tag}` (the
   version from `github.ref_name`). Create and push a Git tag `v1.0.0`
   (`git tag v1.0.0 && git push origin v1.0.0`) and confirm a `v1.0.0`
   image tag appears — the release path, distinct from the per-commit SHA
   path (module 00's `tag` trigger).

7. **Pass the tag from build to deploy across jobs.** Split the workflow:
   job `build` computes the tag, pushes, and exposes it as an output
   (`echo "image-tag=${GITHUB_SHA}" >> "$GITHUB_OUTPUT"` + job `outputs:`);
   job `deploy` (`needs: [build]`) prints/uses
   `${{ needs.build.outputs.image-tag }}`. Confirm the exact same tag flows
   across the job boundary — the module-01 outputs mechanism doing real
   work.

8. **Wire the ACR login server as a Terraform-decoupled variable.** Instead
   of hard-coding `myacr.azurecr.io`, set a repository variable
   `ACR_LOGIN_SERVER` from your Terraform output
   (`terraform output -raw acr_login_server`, track 09) and reference
   `${{ vars.ACR_LOGIN_SERVER }}` in the workflow. Confirm a build still
   pushes correctly. Reflect: if you recreated the ACR in Terraform with a
   new name, what's the *only* thing you'd change to point the pipeline at
   it? (Answer: the one variable — the workflow YAML is untouched.)

9. **Diagnose and fix: push fails with an authorization error.** You'll hit
   and fix the most common image-pipeline failure. The build step succeeds
   but `push` fails with `denied: requested access to the resource is
   denied` (or `401 Unauthorized`). Two candidate causes: the OIDC identity
   has `AcrPull` but not `AcrPush` (it can pull but not push — the exact
   pull-vs-push distinction from track 07 module 08), or the login step
   targeted the wrong registry name. Investigate with
   `az role assignment list --assignee <client-id> --scope <acr-id> -o table`
   (is `AcrPush` present?) and by checking the login server in the logs.
   Grant `AcrPush` (`az role assignment create --assignee <client-id>
   --role AcrPush --scope <acr-id>`) or fix the registry name, push again,
   and confirm the image lands. State in one sentence why the *cluster's*
   `AcrPull` identity (track 07 module 03) is not enough for the *pipeline*
   to push.

## Independent challenge

No YAML given — build this from module 01's job/output machinery, module
02's caching mindset, this module's tagging concepts, and track 07 module
08's OIDC + push/pull distinction. Construct a two-job image pipeline that
builds an image exactly once and makes it both traceable and fast to
rebuild. The build job must authenticate to your ACR without any stored
registry password, build with layer caching so an app-code-only change
doesn't rebuild dependency layers, tag the image with the immutable commit
SHA (and, as a convenience, multi-tag it with a human-readable branch tag
pointing at the same digest), push it to the Terraform-provisioned ACR
referenced through a variable rather than a hard-coded name, and export the
exact pushed tag as a job output. The deploy job must consume *only* that
output — never recomputing the tag itself — and reference the image by that
exact SHA tag. Then prove three properties: that two consecutive builds of
an unchanged dependency manifest reuse cached layers (compare timings);
that the SHA tag and the branch tag resolve to the *same* digest; and that
nothing in the repo or the workflow contains a long-lived registry
credential. Draw on track 09 for where the ACR login server comes from and
track 07 module 08 for why the push identity needs `AcrPush` specifically.

<details>
<summary>Stuck? One hint</summary>

The trap is computing the tag in two places. If the build job builds
`:$GITHUB_SHA` and the deploy job *also* writes `:$GITHUB_SHA`, they happen
to match today but it's fragile — the instant the build job's tagging logic
gets more complex (a prefix, a shortened SHA, a semver), the two silently
diverge and you deploy an image that doesn't exist or isn't the one you
built. Compute the tag once in `build`, `echo` it to `$GITHUB_OUTPUT`,
expose it on the job's `outputs:`, and have `deploy` read
`needs.build.outputs.image-tag`. For the caching win, order your Dockerfile
so dependency install happens *before* copying application source — that's
what lets a code-only change reuse the dependency layer (a track 02
Dockerfile-layering point).

</details>

## Common mistakes & troubleshooting

- **Using `latest` as a deploy target.** Mutable and non-unique: breaks
  rollouts (track 07 module 08), destroys traceability, and makes rollback
  impossible. Reserve `latest` for human convenience pulls only; deploy by
  SHA or digest.
- **`AcrPull` where `AcrPush` is needed.** The pipeline pushes; pulling
  rights aren't enough. `denied`/`401` on push almost always means the push
  identity is missing `AcrPush` (distinct from the cluster's pull identity,
  track 07 module 03).
- **Recomputing the image tag in the deploy job.** Deriving the tag
  independently in two jobs risks them diverging; compute once, pass via job
  output.
- **No layer caching, or caching the wrong scope.** Without
  `cache-from`/`cache-to`, every build is cold. With `mode=min` you only
  cache the final layer; `mode=max` caches intermediate layers too — usually
  what you want.
- **Dockerfile ordered so caching never helps.** Copying source before
  installing dependencies invalidates the dependency layer on every code
  change. Install deps first, copy source later (track 02).
- **Hard-coding the ACR login server.** Couples the pipeline to a specific
  registry name; recreating the ACR (track 09) forces a workflow edit. Use a
  repository variable fed from a Terraform output.
- **Uncontrolled tag growth.** Pushing a SHA tag per commit forever grows
  ACR storage (the cost pitfall from track 07 module 08). Set an ACR
  retention policy for untagged manifests / old tags.
- **Confusing a tag with a digest.** A SHA *tag* is still a mutable pointer;
  the *digest* (`@sha256:...`) is the content-addressed, provably-immutable
  identity. Pin to the digest when you need a hard guarantee.

## Checkpoint quiz

Write down your answer to each question before expanding it — checking without attempting first is the single easiest way to fool yourself into thinking you've learned this.

1. State the two properties a deployable image tag must have, and explain
   how `latest` fails both.
2. What does a commit-SHA tag give you that a semver tag doesn't, and vice
   versa? When would you use each?
3. What is an image *digest*, and why is it a stronger immutability
   guarantee than a SHA tag?
4. How does Buildx layer caching in CI relate to module 02's dependency
   caching — same idea or different, and what's being cached?
5. Why should the deploy job consume the image tag as a *job output* from
   the build job rather than recomputing `github.sha` itself?
6. Your push fails with `denied: requested access to the resource is
   denied`. Give the two most likely causes and the command to check the
   first.
7. Why is hard-coding the ACR login server in the workflow a coupling
   problem, and what's the track-09-friendly alternative?
8. What's the one legitimate use of a `latest` tag, and why is it never a
   deploy target?

<details>
<summary>Show answers</summary>

1. It must be **immutable** (never repointed, so tested==deployed) and
   **unique per build** (a distinct reference you can roll back to).
   `latest` is mutable (repointed on every push) and non-unique (every
   build shares it), failing both — which is why it breaks rollouts and
   traceability.
2. A SHA tag maps to an exact commit (maximally traceable, machine-friendly,
   great for CI internals and rollback) but is meaningless to humans. A
   semver communicates compatibility and is human-readable but needs a
   deliberate release process to assign. Use SHA for internal deploy
   references, semver for published releases.
3. A digest (`@sha256:...`) is a content hash of the image — it can never
   point to different content. A SHA *tag* is still a mutable pointer that
   could in principle be force-pushed to different content; the digest is
   provably byte-identical.
4. Same idea, different target. Module 02 caches package/dependency
   *directories* keyed on a lockfile; Buildx caches Docker *image layers*
   keyed on layer content. Both restore unchanged work across blank runners
   to skip redundant rebuilds.
5. So the tag is computed exactly once. Recomputing `github.sha`
   independently in two jobs works until the tagging logic gains a prefix,
   shortening, or semver — then the two silently diverge and you deploy the
   wrong (or a nonexistent) image. One computed value passed downstream is
   robust.
6. Most likely: the push identity has `AcrPull` but not `AcrPush`, or the
   login targeted the wrong registry. Check the first with
   `az role assignment list --assignee <client-id> --scope <acr-id> -o
   table` and look for `AcrPush`.
7. Hard-coding couples the pipeline to a specific registry name; recreating
   the ACR in Terraform (new name) forces a manual workflow edit. Instead
   expose the ACR login server as a Terraform output and set it as a
   repository variable the workflow reads — infra and pipeline stay
   decoupled.
8. A convenience pointer for humans pulling locally (`docker pull app`).
   It's never a deploy target because it's mutable and non-unique — it can't
   trigger a reliable rollout, can't be traced to a commit, and can't be
   rolled back to.

</details>

## Next

[04-continuous-deployment-strategies](../04-continuous-deployment-strategies/README.md)
— now that you can produce a traceable image, deploy it safely: rolling,
blue/green, and canary strategies on Kubernetes.
