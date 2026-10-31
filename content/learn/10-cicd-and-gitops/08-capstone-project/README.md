# Capstone Project: A Complete GitOps Delivery Pipeline

## Why this matters

This is where the whole track becomes one system. You've learned pipeline
anatomy (module 00), GitHub Actions in depth (01), testing that gates a
merge (02), traceable image builds (03), deployment strategies (04), GitOps
with ArgoCD (05), progressive delivery (06), and pipeline security (07) — as
separate pieces. Real delivery is all of them wired together: a pull request
runs tests that block a broken merge; merging to `main` builds and pushes a
commit-SHA-tagged image to ACR and records that tag in a Git config repo;
and ArgoCD notices the committed change and syncs it to AKS through a
progressive (canary or blue/green) rollout — with no long-lived credentials
anywhere and a human gate protecting production. Building this end to end,
and watching a single code change flow from PR to a metric-gated rollout
without you touching the cluster, is what "you can do CI/CD and GitOps"
actually means.

Treat this as a project, not a checklist of isolated exercises — each piece
depends on the ones before it, in the order you'd build them in the real
world. There is no solution YAML here; you have every technique you need from
modules 00-07.

## The project

Build a complete, automated delivery pipeline for a small application,
combining push-based CI (build/test/package) with pull-based GitOps CD, on
your real AKS cluster and ACR (tracks 07/09).

Use a **two-repo structure** (module 05): an **app repo** (source code + CI
workflows) and a **config/GitOps repo** (the Kubernetes manifests ArgoCD
watches). The app's CI writes the new image tag into the config repo; ArgoCD
delivers it.

The end-to-end flow you're building:

1. A developer opens a **pull request** in the app repo. CI runs unit and
   integration tests (module 02); a **required status check** blocks the
   merge if anything fails (module 02, track 08). Broken code cannot reach
   `main`.
2. On **merge to `main`**, CI builds a container image, tags it with the
   **commit SHA** (module 03), authenticates to ACR via **OIDC** with no
   stored secret (module 07, track 07 module 08), and pushes it to your
   **Terraform-provisioned ACR** (module 03, track 09).
3. The same workflow then **commits the new SHA tag into the deployment
   manifest** in the config repo (module 05) — CI's job ends at a Git commit;
   it never runs `kubectl`.
4. **ArgoCD** (installed on AKS, module 05), watching the config repo with
   automated sync, notices the change and deploys it — as an **Argo Rollouts
   canary or blue/green** progressive rollout (module 06), metric-gated so a
   bad version auto-aborts.
5. **Production is protected** (module 07): a human approves before a
   production deploy (protected environment / required reviewer), and no
   long-lived cloud credential exists anywhere in the pipeline.

Build it in that order — get each stage green before adding the next, exactly
as module 01's exercises taught. Don't wire the canary before the plain
GitOps sync works; don't add the manual approval before the happy path flows.

## Acceptance checklist

Work through these in order; each depends on the previous ones actually
working, not just existing.

- [ ] Two repos exist: an **app repo** (code + `.github/workflows/`) and a
      **config repo** (Kubernetes/Rollout manifests). Application code and
      deployment state are cleanly separated (module 05).
- [ ] A `pull_request`-triggered workflow runs unit **and** integration tests
      (with a service container for the integration dependency, module 02),
      caching dependencies keyed on the lockfile.
- [ ] Branch protection on the app repo's `main` marks that test workflow as
      a **required** status check and requires the branch be up to date; you
      have **proven** a PR with a failing test cannot be merged (module 02).
- [ ] A `push`-to-`main` workflow builds the image, tags it with
      **`${{ github.sha }}`** (never `latest`), and pushes it to your ACR
      using **OIDC federation** — confirm no `AZURE_CREDENTIALS`-style
      long-lived secret exists (modules 03/07).
- [ ] `az acr repository show-tags` shows the SHA-tagged image in the
      Terraform-provisioned ACR, and the ACR login server is referenced in
      the workflow via a **variable** (from a Terraform output), not
      hard-coded (module 03, track 09).
- [ ] The same workflow **commits the new SHA tag into the config repo's
      manifest** and pushes — and the workflow contains **no** `kubectl`/
      `helm` command against the cluster (module 05).
- [ ] **ArgoCD** is installed on AKS with an Application watching the config
      repo, automated sync on, and `argocd app get` shows it `Synced` and
      `Healthy` after a change (module 05).
- [ ] The deployed workload is an **Argo Rollouts `Rollout`** (canary or
      blue/green) with at least two/three progressive steps and an
      **`AnalysisTemplate`** gating promotion on a real health signal
      (module 06).
- [ ] A **healthy** release, triggered purely by a code change + merge,
      flows all the way to a fully-promoted rollout with **you running no
      `docker`/`az`/`kubectl` command by hand** — you have watched it happen.
- [ ] A **broken** release (compiles, but crashes or returns errors at
      runtime) is **automatically aborted and rolled back** by the canary
      analysis before it reaches all users — you have evidence users saw at
      most the canary weight's worth of errors (module 06).
- [ ] The **`production`** environment is protected with a **required
      reviewer**, so a production deploy pauses for human approval (module
      07); the OIDC subject is scoped to the branch or, better, the
      environment.
- [ ] You can **roll back** the last deploy purely by `git revert` on the
      config repo (module 05), and you have done it once.
- [ ] You can explain, for every piece, what is push-based vs. pull-based,
      where every credential lives and how long it's valid, and what each gate
      protects against — if you can't explain a piece, that's a signal to go
      back and understand it, not just copy a command that worked.

## Hints

- Build the spine first, decorate later. Get the dumbest possible version
  working end to end — a plain Deployment synced by ArgoCD from a manually-
  edited config repo — *before* adding CI, before the canary, before the
  approval gate. A working thin pipeline you extend beats a fully-featured
  one you can't debug (module 01's layer-by-layer lesson).
- The trickiest new integration is CI writing to the *config* repo. The app
  repo's workflow needs push access to the config repo — a deploy key or a
  scoped token, **not** cluster credentials (module 07's least-privilege
  point). Compute the SHA tag once and use it both to push the image and to
  edit the manifest (module 03's single-source-of-tag rule).
- If ArgoCD shows `OutOfSync` forever after a healthy-looking sync, suspect a
  field-ownership conflict (an HPA vs. a pinned `replicas`) or a manifest
  error — read `argocd app diff` and the sync result, not just the status
  (module 05's diagnose exercise).
- If the canary won't progress, first determine *why it's waiting*: a manual
  `pause: {}`, an analysis still running, or pods not `Ready` / analysis
  failing. `kubectl argo rollouts get rollout <name>` tells you which
  (module 06's diagnose exercise). Build your analysis against a signal you
  can deliberately break so you can watch the auto-abort actually fire.
- If a deploy authenticates locally but the pipeline gets a blank credential
  or an OIDC rejection, check secret/environment scoping and the federated-
  credential subject against the run's context (module 07's diagnose
  exercise; track 07 module 08's `id-token: write`).
- Reuse names, patterns, and the OIDC identity you already validated in
  earlier modules and track 07 rather than inventing new configuration — the
  goal is integration, not new discovery.
- Keep a running note of every resource and credential you create (ACR,
  cluster, ArgoCD Application, federated credentials, config-repo deploy key)
  so cleanup and the security review are checklists, not archaeology.

## Cleanup

- Tear down cluster spend deliberately (track 07's cost warning):
  `az group delete --name <rg> --yes --no-wait` for any resource group you
  created just for this. An idle AKS cluster keeps billing.
- Remove the federated credentials, role assignments, and any config-repo
  deploy key/token you created, so no standing access outlives the project
  (module 07).
- Confirm nothing lingers: `az aks list -o table` and `az acr list -o table`
  across your subscription; an empty result for anything you made for this
  capstone is your signal you're no longer billing or exposing it.

## Before you move on

Don't consider this finished the moment it's green. Wait a few days, then —
with no notes and none of the earlier modules open — rebuild the core of it
from memory: a PR that gates a merge on tests, a merge that builds a SHA-
tagged image to ACR via OIDC and commits the tag to a config repo, and
ArgoCD syncing that change to AKS as a metric-gated canary that auto-aborts a
bad release. Rebuilding it cold, and noticing exactly where you stall, is the
truest retention check there is — and passing it is what "you can build a
GitOps delivery pipeline" actually means. Tear it back down afterward.

One thing to notice about what you built: it delivers *whatever image the
tests pass*, but the tests only check that the code *works* — nothing here
checks that the image is *safe*. There's no scan for known-vulnerable
dependencies or base images, no signature proving the image is the one your
pipeline built, and no admission policy stopping a non-compliant image from
running on the cluster. Those are exactly the gaps the next track fills.

## Next

[11-security-deep-dive](../../11-security-deep-dive/README.md) — this exact
pipeline is the starting point. There you add image scanning (catching
vulnerable dependencies and base images before they deploy), image signing
and verification, and admission policy gates that refuse to run an image that
didn't pass — turning "the pipeline that ships working code" into "the
pipeline that ships *safe, verified, policy-compliant* code."

[Back to the track index](../README.md)
