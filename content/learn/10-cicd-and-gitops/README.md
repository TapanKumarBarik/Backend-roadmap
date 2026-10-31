# Track 10: CI/CD and GitOps

You've now built infrastructure by hand (AKS, track 07) and declaratively
(Terraform, track 09), and you can drive Git fluently through branches,
rebases, and pull requests (track 08). This track is about the *other*
half of a real platform: automating the software delivery pipeline
itself — build, test, package, and deploy — so that shipping a change is
a `git push` and a merge, not a sequence of manual `docker` and `kubectl`
commands. Then it takes you one step further, from **push-based CI/CD**
(a pipeline reaches into the cluster and applies changes) to **pull-based
GitOps** (a controller inside the cluster continuously reconciles the
cluster against a Git repo as the single source of truth).

Track 07's module 08 already built one small GitHub-Actions-to-AKS
workflow — build an image, push to ACR, `kubectl set image`. This track
does not repeat that; it assumes you did it, briefly recaps it, and then
goes much deeper and much broader: the anatomy of a pipeline, GitHub
Actions as a real tool (reusable workflows, matrix builds, environments),
testing and required status checks gating PR merges, image tagging
strategy, deployment strategies (rolling, blue/green, canary), ArgoCD and
GitOps, progressive delivery with Argo Rollouts, and pipeline security
with OIDC federation and protected environments.

> **Cost warning:** several modules deploy to a real AKS cluster and push
> to a real ACR. An idle AKS cluster still bills for its node VMs. Reuse a
> single small cluster across the track where you can, and tear it down
> with `az group delete --name <rg> --yes --no-wait` when you stop for the
> day. GitHub Actions minutes on public repos are free; on private repos
> you get a monthly allowance — keep triggers scoped so you don't burn it.

## How this track works

- Go in order — module 01 assumes the pipeline vocabulary from module 00,
  module 05 (GitOps) assumes the deployment strategies from module 04, and
  the capstone assumes all of it.
- Every module except this index and the capstone follows the same shape:
  **Why this matters → Concepts → Command reference → Hands-on
  exercises → Independent challenge → Common mistakes & troubleshooting →
  Checkpoint quiz → Next**. Two modules (02 and 05) add a **Cumulative
  review** before their Next link.
- Exercises use real GitHub Actions workflows in a real GitHub repo, and a
  real AKS cluster with ArgoCD installed on it. This is not a simulator —
  wiring the real thing together is the point.
- The capstone (module 08) drops the quiz/challenge/review scaffolding and
  asks you to build one complete pipeline end to end: PR triggers tests,
  merge to `main` builds and pushes a SHA-tagged image to ACR, and ArgoCD
  syncs a Git-committed manifest change to AKS with a progressive rollout.

## Modules

| # | Module | What it covers | Rough time |
|---|--------|-----------------|------------|
| 00 | [cicd-concepts-and-pipeline-anatomy](00-cicd-concepts-and-pipeline-anatomy/README.md) | CI vs. CD vs. continuous deployment, pipeline stages, triggers, artifacts, environments, push vs. pull delivery | 45-60 min |
| 01 | [github-actions-deep-dive](01-github-actions-deep-dive/README.md) | Workflows/jobs/steps/runners, expressions and contexts, matrix builds, reusable workflows, composite actions, secrets and environments | 90-120 min |
| 02 | [building-and-testing-in-ci](02-building-and-testing-in-ci/README.md) | Running unit/integration tests, dependency caching, fail-fast, required status checks gating a PR merge (ties to track 08) | 75-90 min |
| 03 | [container-image-pipelines](03-container-image-pipelines/README.md) | Building and pushing images from CI, tagging strategy (semver vs. SHA vs. `latest`), Buildx caching, pushing to Terraform-provisioned ACR | 75-90 min |
| 04 | [continuous-deployment-strategies](04-continuous-deployment-strategies/README.md) | Rolling update, blue/green, and canary — conceptually and applied to Kubernetes/AKS Deployments | 75-90 min |
| 05 | [gitops-and-argocd](05-gitops-and-argocd/README.md) | Push vs. pull, Git-as-source-of-truth, installing ArgoCD, Applications, sync policies, drift detection and self-healing | 90-120 min |
| 06 | [progressive-delivery-canary-and-blue-green](06-progressive-delivery-canary-and-blue-green/README.md) | Argo Rollouts canary/blue-green in practice, analysis-gated promotion, compared with track 06 Container Apps revision traffic-splitting | 90-120 min |
| 07 | [pipeline-security-and-secrets](07-pipeline-security-and-secrets/README.md) | OIDC vs. long-lived secrets, least-privilege service connections, protecting `main`/production with required reviewers | 75-90 min |
| 08 | [capstone-project](08-capstone-project/README.md) | End-to-end: PR-triggered tests, merge builds a SHA-tagged image to ACR, ArgoCD syncs a manifest change to AKS with a canary/blue-green rollout | 4-6 hours |

## Prerequisites

- [02-docker](../02-docker/README.md): building images, Dockerfiles,
  pushing to ACR.
- [03-kubernetes](../03-kubernetes/README.md): Deployments, Services,
  ReplicaSets, rollouts, Helm.
- [07-aks](../07-aks/README.md): a real AKS cluster, ACR attach, and
  especially [module 08](../07-aks/08-cicd-github-actions-to-aks/README.md),
  the single GitHub-Actions-to-AKS workflow this track builds on.
- [08-git-and-version-control](../08-git-and-version-control/README.md):
  branching, rebasing, and the pull-request workflow that required status
  checks gate.
- [09-terraform-on-azure](../09-terraform-on-azure/README.md): the ACR and
  AKS this track deploys to are the ones you provision declaratively there.

## Start here

Start with [00-cicd-concepts-and-pipeline-anatomy](00-cicd-concepts-and-pipeline-anatomy/README.md).

[Back to main curriculum](../README.md)
