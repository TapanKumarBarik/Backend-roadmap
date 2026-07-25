# ACR Integration with AKS

## Why this matters

You already build images and push them to Azure Container Registry from
the Docker track. Now you need AKS to be able to **pull** those private
images to run them as Pods. Getting the authentication wrong here is one
of the most common real-world AKS failures (`ImagePullBackOff`), so this
module covers the correct managed-identity approach first, and the
fallback approach second.

## Concepts

**Why a private registry needs authentication for pulls.** A registry
like Docker Hub's public library needs no auth; your own ACR registry is
private by default. Every node's kubelet needs *some* credential to pull
from it, or every Pod referencing your private image sits in
`ImagePullBackOff`.

**The modern way: `az aks update --attach-acr`.** AKS clusters run with a
managed identity (an Azure AD identity Azure manages the credentials for,
with no secrets for you to store or rotate). Attaching an ACR to a
cluster grants that cluster's identity the `AcrPull` role on the
registry, scoped just to pulling images — no image pull secret, no
credential to expire, no YAML to maintain. This is the recommended
approach whenever the ACR and the AKS cluster are reachable under
role-assignment permissions you control (almost always true for a single
subscription you own, which is your situation in this track).

**The fallback: Kubernetes `imagePullSecrets`.** Before managed-identity
attachment existed (and still today for some cross-tenant/cross-subscription
scenarios where you can't or don't want to grant a role assignment), you
authenticate the old way: create a Docker-registry-type Secret holding
ACR credentials, and reference it in a Pod/Deployment's
`imagePullSecrets`. This works everywhere but means a credential exists
that can expire or leak, and must be kept in sync per-namespace.

**What AKS manages vs. what you own here:** attaching ACR is a one-time
role assignment Azure manages afterward (rotation, propagation to all
nodes) — you don't touch node-level Docker/containerd credential files
yourself, unlike the fallback secret approach where you own the secret's
lifecycle (creation, rotation, revocation) directly.

## Command reference

| Command | What it does | Example |
|---|---|---|
| `az acr create` | Creates a new Azure Container Registry | `az acr create --resource-group rg-aks-learn --name acraskslearn --sku Basic` |
| `az acr list` | Lists ACR registries in the subscription | `az acr list --output table` |
| `az acr login` | Authenticates your local Docker CLI to an ACR (for pushing) | `az acr login --name acraskslearn` |
| `docker tag` / `docker push` | Tags and pushes a local image to ACR | `docker push acraskslearn.azurecr.io/demo-app:v1` |
| `az aks update --attach-acr` | Grants an existing AKS cluster's managed identity `AcrPull` on an ACR registry | `az aks update --resource-group rg-aks-learn --name aks-learn --attach-acr acraskslearn` |
| `az aks update --detach-acr` | Revokes that role assignment | `az aks update --resource-group rg-aks-learn --name aks-learn --detach-acr acraskslearn` |
| `az role assignment list` | Lists Azure role assignments, useful to confirm `AcrPull` exists | `az role assignment list --scope $(az acr show --name acraskslearn --query id -o tsv) --output table` |
| `kubectl create secret docker-registry` | Creates a Kubernetes Secret holding registry credentials (fallback method) | `kubectl create secret docker-registry acr-secret --docker-server=acraskslearn.azurecr.io --docker-username=<user> --docker-password=<pass>` |
| `az acr credential show` | Shows the admin username/password for an ACR (must have admin user enabled) | `az acr credential show --name acraskslearn` |
| `kubectl describe pod` | Shows pull errors in the `Events` section | `kubectl describe pod <name>` |

## Hands-on exercises

1. **Create an ACR registry** (skip if you already have one from the
   Docker track you'd like to reuse — registry names must be globally
   unique):
   `az acr create --resource-group rg-aks-learn --name acraskslearn --sku Basic`.
   Verify: `az acr list --output table` shows it with `Basic` SKU.

2. **Build and push an image to it.** Using any small app from earlier
   tracks (or a trivial `Dockerfile` with a one-line web server), build,
   then authenticate and push:
   ```
   az acr login --name acraskslearn
   docker tag demo-app:latest acraskslearn.azurecr.io/demo-app:v1
   docker push acraskslearn.azurecr.io/demo-app:v1
   ```
   Verify: `az acr repository list --name acraskslearn --output table`
   shows `demo-app`.

3. **Try deploying it to AKS *before* attaching ACR** (deliberately, to
   see the failure). Write a Deployment referencing
   `acraskslearn.azurecr.io/demo-app:v1` and `kubectl apply -f` it.
   Verify: `kubectl get pods` shows the pod stuck in `ImagePullBackOff`
   or `ErrImagePull`.

4. **Diagnose it properly.** Run `kubectl describe pod <name>` and read
   the `Events` section — you should see a message like `unauthorized:
   authentication required` or `401 Unauthorized` pulling from the ACR
   login server. This is the exact real-world symptom of a missing
   `AcrPull` role assignment — confirm there's no role assignment yet:
   `az role assignment list --scope $(az acr show --name acraskslearn --query id -o tsv) --output table`
   (should be empty or missing an `AcrPull` entry for your cluster's
   identity).

5. **Fix it with `--attach-acr`.** Run
   `az aks update --resource-group rg-aks-learn --name aks-learn --attach-acr acraskslearn`.
   This can take a minute to propagate. Verify: re-run the role
   assignment list command from exercise 4 — you should now see an
   `AcrPull` entry. Then delete and recreate the pod (or just wait — the
   kubelet retries pulls with backoff):
   `kubectl delete pod <name>` (a Deployment will recreate it), and
   confirm with `kubectl get pods` that it reaches `Running`.

6. **Try the fallback method for comparison.** Enable the ACR admin user
   temporarily to get credentials for a demo (`az acr update --name
   acraskslearn --admin-enabled true`, then
   `az acr credential show --name acraskslearn`), then create an
   `imagePullSecret`:
   ```
   kubectl create secret docker-registry acr-secret \
     --docker-server=acraskslearn.azurecr.io \
     --docker-username=<username-from-credential-show> \
     --docker-password=<password-from-credential-show>
   ```
   Reference `imagePullSecrets: [{name: acr-secret}]` in a *new* test
   Deployment (leave your `--attach-acr`-based Deployment as-is), apply
   it, and verify it also pulls successfully. Afterward, turn the admin
   user back off (`az acr update --name acraskslearn --admin-enabled
   false`) since it's a weaker, shared credential you don't want lingering
   — the managed-identity approach from exercise 5 doesn't need it at
   all, which is why it's preferred.

7. **Confirm which nodes/pods use which method.** Run
   `kubectl get pods -o yaml | grep -A2 imagePullSecrets` — note that
   only the fallback Deployment's pods reference a secret; the
   `--attach-acr` based Deployment's pods have no `imagePullSecrets` at
   all, because authentication happens transparently via the cluster's
   managed identity at the node/kubelet level.

8. **Clean up.** Delete the test Deployment and secret from exercise 6:
   `kubectl delete deployment <fallback-deployment-name>` and
   `kubectl delete secret acr-secret`. Leave the `--attach-acr` based
   Deployment if you're continuing to module 04, or
   `kubectl delete namespace demo` if you created one and are done for
   now. ACR registries on the `Basic` SKU are inexpensive but not free —
   if you don't need the registry beyond this track, remove it later with
   `az acr delete --name acraskslearn --resource-group rg-aks-learn --yes`,
   or let the eventual `az group delete` for `rg-aks-learn` take care of
   it along with the cluster.

## Common mistakes & troubleshooting

- **Confusing `az acr login` (your local Docker CLI's auth, for
  pushing) with cluster-to-registry auth (for pulling).** They're
  unrelated — logging in locally does nothing for the cluster's ability
  to pull.
- **Attaching the wrong ACR or forgetting the registry name is globally
  unique.** `az acr create` fails immediately if the name is taken;
  double-check `az acr list` output before assuming attachment failed for
  a permissions reason instead.
- **Not waiting for propagation.** `--attach-acr` role assignment can
  take up to a minute or so to be usable; if a pod created *immediately*
  after still fails, wait and retry (`kubectl delete pod` to force a
  fresh pull attempt) before assuming the attach didn't work.
- **Leaving the ACR admin user enabled after a fallback-secret demo.**
  The admin account is a single shared credential with full pull/push
  rights — leaving it on is a standing security exposure with no
  corresponding benefit once you've moved to managed-identity auth.
- **Cost pitfall: creating multiple ACR registries "just to try things"
  and forgetting about them.** Even Basic-tier ACR has a small ongoing
  cost plus storage cost per image layer. Reuse one registry per track
  rather than creating a new one per exercise, and delete ones you're
  not using.

## Checkpoint quiz

1. Why does a private ACR registry need explicit authentication for AKS
   to pull from it, unlike a public registry?
2. What role does `az aks update --attach-acr` actually grant, and to
   whom?
3. What's the concrete symptom in `kubectl describe pod` output when a
   pull fails due to missing authentication, versus a pull failure from a
   typo'd image name?
4. Why is `--attach-acr` preferred over `imagePullSecrets` when both the
   ACR and AKS cluster are in a subscription you control?
5. When might you still need `imagePullSecrets` instead of
   `--attach-acr`?
6. What Kubernetes Secret type does `kubectl create secret docker-registry`
   produce, and where does a Pod reference it?

<details>
<summary>Show answers</summary>

1. Because ACR registries are private by default — pulling requires a
   credential of some kind, whereas a public registry allows anonymous
   pulls.
2. It grants the AKS cluster's managed identity the `AcrPull` role,
   scoped to that specific ACR registry — pull-only access, nothing else.
3. Missing authentication shows an `Events` message like `unauthorized:
   authentication required` / `401 Unauthorized`; a typo'd image name or
   tag typically shows a `manifest unknown` / `not found` style error
   instead — both surface as `ImagePullBackOff`/`ErrImagePull` states,
   but the underlying message differs.
4. Because it needs no stored credential, nothing to rotate or leak, and
   is managed automatically by Azure via the role assignment — strictly
   less operational burden for the common single-subscription case.
5. When the ACR and AKS cluster live in different tenants/subscriptions
   where you can't or don't want to grant a cross-boundary role
   assignment, or in automation contexts that specifically require an
   explicit credential.
6. `docker-registry` type Secret; a Pod (or its Deployment's pod
   template) references it via `spec.imagePullSecrets: [{name:
   <secret-name>}]`.

</details>

## Next

[04-aks-networking-loadbalancer-and-ingress](../04-aks-networking-loadbalancer-and-ingress/README.md)
— expose your workloads to the internet with real public IPs and Ingress.
