# CI/CD: GitHub Actions to AKS

## Why this matters

Every deploy so far in this track has been you, typing `docker build`,
`docker push`, and `kubectl apply`/`kubectl set image` by hand. That's
fine for learning, but it doesn't scale to a team, and it's easy to
forget a step or push a stale tag under pressure. This module wires up a
GitHub Actions workflow that does exactly the steps you've been doing
manually — build, push to ACR, roll out to AKS — automatically on every
push to `main`, so "deploy" becomes "merge," and the actual mechanics get
consistent and auditable.

## Concepts

**What a GitHub Actions workflow is, briefly.** A YAML file in
`.github/workflows/` in your repo that GitHub runs on specified triggers
(here: `push` to `main`), executing a sequence of steps on a
GitHub-hosted (or self-hosted) runner VM. Each step is either a shell
command or a reusable "action" (a packaged step someone else wrote, like
`azure/login`).

**Two ways for the workflow to authenticate to Azure: service principal
vs. OIDC federation.**
- A **service principal (SP)** is an Azure AD application identity with a
  password/certificate you generate once (`az ad sp create-for-rbac`) and
  store as a long-lived secret in GitHub (`AZURE_CREDENTIALS`). The
  workflow logs in using that stored secret. Simple to set up, but it's a
  standing credential that can leak from GitHub secrets and must be
  manually rotated.
- **OIDC (OpenID Connect) federation** configures Azure AD to trust
  GitHub's own token issuer for a specific repo/branch, so GitHub Actions
  requests a short-lived token at run time and Azure AD verifies it
  against the trust relationship — **no password or secret is stored in
  GitHub at all**. This is the modern, recommended approach: nothing
  long-lived to leak, nothing to rotate, and the trust is scoped to
  exactly the repo (and optionally branch) you configure.

This module sets up OIDC as the primary path and explains the SP
approach only for comparison — prefer OIDC for any new setup.

**What the workflow actually does, step by step:** checkout code → log in
to Azure (via OIDC) → log in to ACR → build the Docker image → push it to
ACR tagged with the Git commit SHA (not `latest` — you want every deploy
traceable to an exact commit) → get AKS credentials → update the running
Deployment to the new image tag (`kubectl set image`, or re-applying a
manifest/Helm chart with the new tag templated in) → wait for the
rollout to finish and fail the workflow if it doesn't.

**Why tag by commit SHA, not `latest`.** `kubectl set image` (or any
redeploy) only actually triggers a rolling update if the image reference
changes. If every push builds and pushes `myapp:latest`, the Deployment's
pod spec never changes text, so Kubernetes has no way to know a new image
exists and won't roll anything out. Tagging with the immutable commit SHA
guarantees each push produces a distinct, traceable image reference that
forces a real rollout.

**What AKS/Azure manages vs. what you own here:** Azure AD handles OIDC
token validation once the federated credential trust is configured — you
don't manage any secret rotation for that path. You still own: the
workflow YAML itself, which branch/environment triggers a deploy, the
image tagging scheme, and — importantly — verifying the rollout actually
succeeded (a broken image that starts but crash-loops will not
necessarily fail a naive `kubectl apply` step unless you also check
rollout status).

## Command reference

| Command | What it does | Example |
|---|---|---|
| `az ad app create` | Creates an Azure AD application (identity) to federate with GitHub OIDC | `az ad app create --display-name gh-actions-aks-learn` |
| `az ad sp create-for-rbac` | Creates a service principal with a password/cert (the older, non-OIDC auth path) | `az ad sp create-for-rbac --name gh-actions-aks-learn --role contributor --scopes <resource-group-id> --sdk-auth` |
| `az ad app federated-credential create` | Adds a federated identity credential trusting GitHub's OIDC issuer for a specific repo/branch | `az ad app federated-credential create --id <app-id> --parameters credential.json` |
| `az role assignment create` | Grants the app's service principal a role (e.g. `Contributor` or `Azure Kubernetes Service Cluster User Role`) scoped to your resource group/cluster | `az role assignment create --assignee <app-id> --role "Azure Kubernetes Service Cluster User Role" --scope <cluster-resource-id>` |
| `az aks update --attach-acr` | (From module 03) still how the *cluster* pulls images; the workflow instead needs its own push rights on the ACR | `az aks update --resource-group rg-aks-learn --name aks-learn --attach-acr acraskslearn` |
| `az role assignment create --role AcrPush` | Grants the workflow's identity push rights on the ACR (separate from the cluster's `AcrPull`) | `az role assignment create --assignee <app-id> --role AcrPush --scope <acr-resource-id>` |
| `azure/login@v2` (GitHub Action) | Authenticates the workflow to Azure using OIDC | `uses: azure/login@v2` with `client-id`/`tenant-id`/`subscription-id` inputs |
| `az acr build` / `docker build` + `docker push` | Builds and pushes the image from the workflow | `docker push acraskslearn.azurecr.io/demo-app:${{ github.sha }}` |
| `az aks get-credentials` | Fetches kubeconfig inside the workflow runner (via the `azure/aks-set-context` action or the raw CLI call) | `az aks get-credentials --resource-group rg-aks-learn --name aks-learn` |
| `kubectl set image` | Updates a Deployment's container image and triggers a rolling update | `kubectl set image deployment/demo-app demo-app=acraskslearn.azurecr.io/demo-app:${{ github.sha }}` |
| `kubectl rollout status` | Blocks until a rollout completes or fails, giving CI a real pass/fail signal | `kubectl rollout status deployment/demo-app --timeout=180s` |

## Hands-on exercises

1. **Create an Azure AD app registration for GitHub OIDC.** Run
   `az ad app create --display-name gh-actions-aks-learn` and note the
   returned `appId`. Also create a service principal for it if one
   wasn't auto-created:
   `az ad sp create-for-rbac --name gh-actions-aks-learn` is *not*
   needed for the OIDC path (that command is for the SP-secret path) —
   instead confirm a service principal exists for the app with
   `az ad sp show --id <appId>` (create one with `az ad sp create --id <appId>`
   if it doesn't).

2. **Add a federated credential trusting your GitHub repo's `main`
   branch.** Write a small JSON file:
   ```json
   {
     "name": "gh-actions-main",
     "issuer": "https://token.actions.githubusercontent.com",
     "subject": "repo:<your-org>/<your-repo>:ref:refs/heads/main",
     "audiences": ["api://AzureADTokenExchange"]
   }
   ```
   Apply it: `az ad app federated-credential create --id <appId> --parameters credential.json`.
   Verify: `az ad app federated-credential list --id <appId> --output table`
   shows the entry.

3. **Grant the app the roles it needs.** It needs `AcrPush` on your ACR
   and `Azure Kubernetes Service Cluster User Role` (or `Contributor`,
   more broadly, for simplicity in a learning context) on the AKS
   cluster:
   ```
   az role assignment create --assignee <appId> --role AcrPush \
     --scope $(az acr show --name acraskslearn --query id -o tsv)
   az role assignment create --assignee <appId> --role "Azure Kubernetes Service Cluster User Role" \
     --scope $(az aks show --resource-group rg-aks-learn --name aks-learn --query id -o tsv)
   ```
   Verify with `az role assignment list --assignee <appId> --output table`
   — both roles listed.

4. **Store the non-secret identifiers as GitHub repo secrets/variables.**
   In your GitHub repo settings → Secrets and variables → Actions, add
   `AZURE_CLIENT_ID` (the `appId`), `AZURE_TENANT_ID`
   (`az account show --query tenantId -o tsv`), and
   `AZURE_SUBSCRIPTION_ID` (`az account show --query id -o tsv`). None of
   these are secret credentials by themselves (that's the whole point of
   OIDC) — they're just identifiers the workflow needs to know which
   identity/tenant/subscription to authenticate as.

5. **Write the workflow file.** Create
   `.github/workflows/deploy-aks.yml` in your app's repo:
   ```yaml
   name: Build and Deploy to AKS

   on:
     push:
       branches: [main]

   permissions:
     id-token: write   # required for OIDC
     contents: read

   env:
     ACR_NAME: acraskslearn
     ACR_LOGIN_SERVER: acraskslearn.azurecr.io
     IMAGE_NAME: demo-app
     RESOURCE_GROUP: rg-aks-learn
     CLUSTER_NAME: aks-learn
     DEPLOYMENT_NAME: demo-app
     CONTAINER_NAME: demo-app

   jobs:
     build-and-deploy:
       runs-on: ubuntu-latest
       steps:
         - name: Checkout
           uses: actions/checkout@v4

         - name: Azure login (OIDC)
           uses: azure/login@v2
           with:
             client-id: ${{ secrets.AZURE_CLIENT_ID }}
             tenant-id: ${{ secrets.AZURE_TENANT_ID }}
             subscription-id: ${{ secrets.AZURE_SUBSCRIPTION_ID }}

         - name: Log in to ACR
           run: az acr login --name ${{ env.ACR_NAME }}

         - name: Build and push image
           run: |
             docker build -t ${{ env.ACR_LOGIN_SERVER }}/${{ env.IMAGE_NAME }}:${{ github.sha }} .
             docker push ${{ env.ACR_LOGIN_SERVER }}/${{ env.IMAGE_NAME }}:${{ github.sha }}

         - name: Get AKS credentials
           uses: azure/aks-set-context@v4
           with:
             resource-group: ${{ env.RESOURCE_GROUP }}
             cluster-name: ${{ env.CLUSTER_NAME }}

         - name: Deploy new image
           run: |
             kubectl set image deployment/${{ env.DEPLOYMENT_NAME }} \
               ${{ env.CONTAINER_NAME }}=${{ env.ACR_LOGIN_SERVER }}/${{ env.IMAGE_NAME }}:${{ github.sha }}

         - name: Wait for rollout
           run: kubectl rollout status deployment/${{ env.DEPLOYMENT_NAME }} --timeout=180s
   ```
   Commit and push it to `main` (make sure a Deployment named `demo-app`
   with a container named `demo-app` already exists on your cluster from
   an earlier module, or adjust the names to match).

6. **Watch it run and verify the rollout.** In GitHub, open the
   **Actions** tab and watch the workflow run. Verify each step goes
   green, particularly the final `rollout status` step. Cross-check from
   your own terminal: `kubectl get deployment demo-app -o jsonpath='{.spec.template.spec.containers[0].image}'`
   should show the new `:<commit-sha>` tag, and
   `az acr repository show-tags --name acraskslearn --repository demo-app --output table`
   should list that SHA as a tag.

7. **Make a real code change and confirm end-to-end automation.** Change
   something visible in your app (a string, a response body), commit, and
   push to `main` directly (or merge a PR into it). Verify: without you
   running any `docker`/`az`/`kubectl` command yourself, the new
   behavior is live — `curl` your app's external endpoint (from module
   04) and confirm the change appears.

8. **Diagnose and fix: rollout step fails / times out.** Deliberately
   push a change that builds fine but crashes at runtime (e.g. an
   uncaught exception on startup). Watch the workflow — the
   `kubectl rollout status --timeout=180s` step should fail (non-zero
   exit) rather than the workflow reporting false success. Investigate
   with `kubectl rollout status deployment/demo-app` and
   `kubectl describe pod <new-pod-name>` locally — confirm it shows
   `CrashLoopBackOff`. Fix the code, push again to `main`, and verify the
   next run's rollout step succeeds and the bad ReplicaSet is fully
   replaced (`kubectl get replicaset -l app=demo-app` shows the old one
   scaled to 0).

## Independent challenge

No commands given here — figure it out yourself using what you know from this module and earlier ones.

**Task:** Stand up a fully hands-off deploy pipeline and then prove it protects you from a bad release. Wire a GitHub Actions workflow that, on a push to `main`, authenticates to Azure without storing any long-lived secret, builds your app image, pushes it to your ACR under a tag that guarantees a real rollout, and updates the running Deployment — reusing the ACR and cluster you set up in modules 03 and 01 (conceptually building on module 03's push-vs-pull distinction, since the pipeline's identity needs a different grant than the cluster's own pull identity). First prove the happy path end to end: make a visible code change, push, and confirm the new behavior is live at your app's public endpoint without you running a single `docker`, `az`, or `kubectl` command by hand. Then deliberately ship a build that compiles but crashes on startup, and confirm the pipeline *fails the run* rather than reporting a false success — reason about which single workflow step is what makes a crash-looping deploy show up as red. Keep the trigger scoped to `main` only so you're not burning CI minutes and piling up ACR image tags on every branch, and remember the cluster and ACR keep billing between runs.

<details>
<summary>Stuck? One hint</summary>

Two things make the difference: tagging the image by immutable commit SHA (so `kubectl set image` actually changes the pod spec and triggers a rollout) and following the deploy with `kubectl rollout status --timeout=...` (so a crash-loop produces a non-zero exit and fails the workflow instead of passing silently). The secretless auth is OIDC federation, which also needs `permissions: id-token: write`.

</details>

## Common mistakes & troubleshooting

- **Tagging every build `latest`.** As explained above, this silently
  breaks `kubectl set image`-based rollouts — the image reference string
  never changes, so no rolling update is triggered even though a new
  image was pushed. Always tag with something unique per build (commit
  SHA is simplest and most traceable).
- **Using a service-principal secret when OIDC was available.** If you
  set up `AZURE_CREDENTIALS` as a long-lived JSON secret instead of OIDC,
  you've created a standing credential in GitHub that needs manual
  rotation and is a bigger blast radius if leaked. Prefer OIDC federation
  for anything new.
- **Forgetting `permissions: id-token: write` in the workflow.** Without
  it, `azure/login@v2` with OIDC fails to obtain a token — this is a
  common first-time OIDC setup mistake and the error message
  (something like "unable to get ACTIONS_ID_TOKEN_REQUEST_URL") doesn't
  always make the missing permission obvious at first glance.
- **Scoping the federated credential's `subject` too broadly or
  incorrectly.** A typo'd `subject` (wrong org/repo/branch pattern) means
  Azure AD will reject the token exchange even though everything else is
  configured correctly — double check it matches
  `repo:<org>/<repo>:ref:refs/heads/<branch>` exactly.
- **Deploying without a rollout-status check.** A workflow that just runs
  `kubectl set image` and stops "succeeds" even if the new pods
  immediately crash-loop — always follow with `kubectl rollout status
  --timeout=...` so a bad deploy fails the workflow, not just fails
  silently in production.
- **Cost pitfall: CI building and pushing images on every commit to every
  branch, not just `main`.** If the `on:` trigger is too broad (e.g. all
  branches, all PRs) instead of scoped to `push: branches: [main]`, you
  accumulate ACR storage (many image layers/tags never cleaned up) and
  burn CI minutes for builds that were never meant to deploy anywhere —
  keep the trigger scoped, and consider an ACR retention/cleanup policy
  for old tags.

## Checkpoint quiz

Write down your answer to each question before expanding it — checking without attempting first is the single easiest way to fool yourself into thinking you've learned this.

1. What's the core security advantage of OIDC federation over a stored
   service-principal secret for GitHub Actions?
2. What GitHub Actions workflow permission is required for OIDC login to
   work, and what happens if it's missing?
3. Why must each build be tagged with something other than `latest` for
   `kubectl set image` to actually trigger a rollout?
4. What two Azure roles does the CI identity need, and why are they
   different from the roles the AKS cluster itself needs (module 03)?
5. Why is a `kubectl rollout status` step necessary even after `kubectl
   set image` succeeds?
6. What's a realistic cost consequence of triggering the build/push job
   on every branch and PR instead of only on `push` to `main`?

<details>
<summary>Show answers</summary>

1. OIDC federation requires no long-lived secret to be stored in GitHub
   at all — Azure AD trusts short-lived tokens issued by GitHub's own
   OIDC provider for a specifically scoped repo/branch, so there's
   nothing durable to leak or need to rotate, unlike a stored
   service-principal password/certificate.
2. `permissions: id-token: write` at the workflow or job level. Without
   it, the runner can't request an OIDC token from GitHub, and
   `azure/login@v2` fails to authenticate.
3. Kubernetes only triggers a rolling update when the Deployment's pod
   template actually changes (e.g. a different image reference). If
   every push reuses the tag `latest`, the stored spec never changes
   text, so no rollout happens even though a new image was pushed to the
   registry.
4. The CI identity needs `AcrPush` (to push new images to the registry)
   and a role letting it act against the AKS cluster (e.g. "Azure
   Kubernetes Service Cluster User Role" or broader `Contributor`). This
   is different from the *cluster's own* managed identity, which only
   needs `AcrPull` (module 03) to run images already in the registry —
   pushing and pulling are different operations needing different
   privilege.
5. Because `kubectl set image` only submits the change and returns
   immediately — it doesn't wait to see whether the new pods actually
   become healthy. Without `rollout status`, a deploy that crash-loops
   would still report the workflow step as "succeeded."
6. It generates and pushes container images (consuming ACR storage as
   image layers/tags) and consumes CI runner minutes for commits/branches
   that were never intended to be deployed anywhere, accumulating cost
   with no corresponding benefit.

</details>

## Next

[09-capstone-project](../09-capstone-project/README.md) — put everything
from this entire track together in one real, end-to-end AKS project.
