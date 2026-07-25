# Security on AKS: Azure AD, RBAC, and Key Vault

## Why this matters

You already know Kubernetes-native RBAC (`Role`/`RoleBinding`) from the
local Kubernetes track, and Kubernetes `Secret` objects. On a real cloud
cluster with real people and real credentials, two gaps show up: first,
you want cluster access tied to actual Azure user identities (not shared
kubeconfig files), and second, Kubernetes `Secret` objects are only
base64-encoded, not encrypted-at-rest-by-default-with-strong-guarantees,
and don't rotate — a real secrets story means pulling from **Azure Key
Vault** instead. This module covers both.

## Concepts

**Kubernetes RBAC vs. Azure AD-integrated Kubernetes RBAC.** Plain
Kubernetes RBAC (what you used locally) authorizes based on identities
the API server is told about — often static service account tokens or
client certs, with no central directory. **Azure AD-integrated RBAC**
lets you bind Kubernetes `Role`/`ClusterRole` objects to real Azure AD
users/groups, so cluster access follows your organization's actual
identity system: someone leaving the team loses cluster access when
their Azure AD account is disabled, without you touching kubeconfigs.
AKS also offers **Azure RBAC for Kubernetes Authorization**, which goes a
step further and lets you manage Kubernetes permissions as Azure role
assignments (`az role assignment create`) instead of `RoleBinding` YAML
at all — useful when you want one consistent permissions model across
Azure and Kubernetes.

**Managed identities, recap and extension.** You met the cluster's
managed identity in module 03 (for ACR pulls). Individual **workloads**
can also get their own scoped identity via **workload identity** (Azure
AD Workload Identity federation), letting a specific Pod authenticate to
Azure services (like Key Vault) as itself, rather than the whole cluster
sharing one broad identity.

**Azure Key Vault + the Secrets Store CSI Driver.** Instead of
`kubectl create secret` storing values inside the cluster's etcd, the
**Azure Key Vault Provider for Secrets Store CSI Driver** mounts secrets
*from* Key Vault into a Pod as files (and can optionally sync them into a
regular Kubernetes Secret too), at pod-start time. The secret's source of
truth stays in Key Vault — with its own access policies, rotation, and
audit log — rather than being duplicated and frozen inside the cluster.

**What AKS manages vs. what you own:** Azure AD-integration and workload
identity federation plumbing is managed by Azure once enabled; you still
own which users/groups get which `Role`/`ClusterRole` bindings (or Azure
role assignments), what secrets live in Key Vault and their access
policies, and — critically — you still need to design least-privilege
roles yourself. None of this is automatic just because it's "AKS."

## Command reference

| Command | What it does | Example |
|---|---|---|
| `az aks update --enable-aad` | Enables Azure AD integration for Kubernetes RBAC on an existing cluster | `az aks update --resource-group rg-aks-learn --name aks-learn --enable-aad` |
| `az aks update --enable-azure-rbac` | Enables Azure RBAC for Kubernetes Authorization (manage K8s permissions as Azure role assignments) | `az aks update --resource-group rg-aks-learn --name aks-learn --enable-azure-rbac` |
| `az role assignment create` | Grants an Azure role (e.g. a built-in AKS RBAC role) to a user/group scoped to the cluster | `az role assignment create --assignee <user-or-group-object-id> --role "Azure Kubernetes Service RBAC Reader" --scope <cluster-resource-id>` |
| `az aks get-credentials` | Same as before, but now triggers interactive Azure AD login (via `kubelogin`) instead of a static cert | `az aks get-credentials --resource-group rg-aks-learn --name aks-learn --overwrite-existing` |
| `kubectl apply -f role.yaml` / `rolebinding.yaml` | Native Kubernetes RBAC objects, now bindable to Azure AD group object IDs as `subjects` | `kubectl apply -f rolebinding.yaml` |
| `az keyvault create` | Creates a Key Vault | `az keyvault create --resource-group rg-aks-learn --name kv-aks-learn --location eastus` |
| `az keyvault secret set` | Stores a secret value in Key Vault | `az keyvault secret set --vault-name kv-aks-learn --name db-password --value "s3cr3t"` |
| `az aks addon enable -a azure-keyvault-secrets-provider` | Enables the Secrets Store CSI Driver + Azure Key Vault provider add-on | `az aks enable-addons --resource-group rg-aks-learn --name aks-learn --addons azure-keyvault-secrets-provider` |
| `az aks show --query addonProfiles.azureKeyvaultSecretsProvider` | Confirms the add-on and its managed identity | `az aks show --resource-group rg-aks-learn --name aks-learn --query addonProfiles.azureKeyvaultSecretsProvider` |
| `az keyvault set-policy` | Grants an identity access to a Key Vault | `az keyvault set-policy --name kv-aks-learn --object-id <identity-object-id> --secret-permissions get list` |
| `kubectl apply -f secretproviderclass.yaml` | Declares which Key Vault secrets to mount, via the `SecretProviderClass` CRD | `kubectl apply -f spc.yaml` |

## Hands-on exercises

1. **Enable Azure AD integration on your cluster.** Run
   `az aks update --resource-group rg-aks-learn --name aks-learn --enable-aad`.
   This takes a few minutes. Verify:
   `az aks show --resource-group rg-aks-learn --name aks-learn --query aadProfile`
   shows a populated AAD profile.

2. **Re-fetch credentials and observe the login change.** Run
   `az aks get-credentials --resource-group rg-aks-learn --name aks-learn --overwrite-existing`,
   then run any `kubectl` command, e.g. `kubectl get nodes`. Verify: you
   get prompted to authenticate interactively via a device-code/browser
   flow (through `kubelogin`) the first time — this is Azure AD auth
   replacing the old static credential.

3. **Create (or identify) an Azure AD group for a role, and bind it.**
   If you have access to create one, create an Azure AD security group
   for "aks-viewers" (via portal or `az ad group create` if available to
   your account); otherwise use your own user's object ID for this
   exercise (`az ad signed-in-user show --query id -o tsv`). Write a
   `ClusterRoleBinding` whose `subjects` references that Azure AD
   group/user object ID with `kind: Group` or `kind: User`, bound to the
   built-in `view` ClusterRole. Apply it and verify with
   `kubectl auth can-i list pods --as=<object-id>` (or test directly by
   authenticating as that identity) that read access works but write
   access doesn't (`kubectl auth can-i delete pods --as=<object-id>`
   should say `no`).

4. **Create a Key Vault and a secret.** Run
   `az keyvault create --resource-group rg-aks-learn --name kv-aks-learn --location eastus`
   (name must be globally unique), then
   `az keyvault secret set --vault-name kv-aks-learn --name db-password --value "s3cr3t-value"`.
   Verify: `az keyvault secret show --vault-name kv-aks-learn --name db-password --query value -o tsv`
   returns the value.

5. **Enable the Key Vault CSI driver add-on.** Run
   `az aks enable-addons --resource-group rg-aks-learn --name aks-learn --addons azure-keyvault-secrets-provider`.
   Verify: `kubectl get pods -n kube-system -l app=secrets-store-csi-driver`
   shows driver pods running, and
   `az aks show --resource-group rg-aks-learn --name aks-learn --query addonProfiles.azureKeyvaultSecretsProvider.enabled`
   returns `true`.

6. **Grant the add-on's identity access to your vault.** Find the
   identity's object/client ID from
   `az aks show --resource-group rg-aks-learn --name aks-learn --query addonProfiles.azureKeyvaultSecretsProvider.identity`,
   then run
   `az keyvault set-policy --name kv-aks-learn --object-id <identity-object-id> --secret-permissions get`.
   Verify the policy exists:
   `az keyvault show --name kv-aks-learn --query properties.accessPolicies`.

7. **Mount the secret into a Pod.** Write a `SecretProviderClass`
   referencing `kv-aks-learn` and the `db-password` secret, and a Pod
   spec mounting it via the CSI volume. Apply both, then verify:
   `kubectl exec <pod-name> -- cat /mnt/secrets-store/db-password`
   prints the value — pulled live from Key Vault, not stored as a
   Kubernetes Secret you created by hand.

8. **Diagnose and fix: access denied pulling the secret.** Deliberately
   remove the access policy
   (`az keyvault delete-policy --name kv-aks-learn --object-id <identity-object-id>`),
   delete and recreate the Pod, and verify it fails to start (check
   `kubectl describe pod` for a mount/CSI error mentioning access
   denied/`Forbidden`). Fix it by re-running the `az keyvault set-policy`
   command from exercise 6, recreate the pod, and confirm the mount
   succeeds again.

9. **Clean up.** Delete the test Pod/SecretProviderClass/RoleBinding:
   `kubectl delete pod <name>`, `kubectl delete secretproviderclass <name>`,
   `kubectl delete clusterrolebinding <name>`. Key Vault has a low
   ongoing cost per vault/operation, but delete it if you don't need it
   beyond this module:
   `az keyvault delete --name kv-aks-learn --resource-group rg-aks-learn`
   (note Key Vault has soft-delete by default — also consider
   `az keyvault purge --name kv-aks-learn` if you want it fully gone and
   your subscription permits purging, otherwise it lingers in a
   recoverable-but-still-billed-lightly state for a retention period).
   Disable the CSI driver add-on if unused going forward:
   `az aks disable-addons --resource-group rg-aks-learn --name aks-learn --addons azure-keyvault-secrets-provider`.

## Independent challenge

No commands given here — figure it out yourself using what you know from this module and earlier ones.

**Task:** Get a real secret into a running Pod without ever creating a Kubernetes `Secret` object by hand, and then prove the access control is what's actually gating it. Put a secret value into a Key Vault, enable the Key Vault CSI driver add-on, and mount that secret into a Pod as a file so the container can read it live from the vault. Then deliberately break it: revoke the add-on identity's access to the vault, force the Pod to be recreated, and confirm from the Pod's own status that it now fails to start with an access/authorization error rather than any image or scheduling problem — a useful contrast with the `ImagePullBackOff` authentication failures you diagnosed back in module 03 (conceptually building on that module's "which identity is allowed to do what" thinking). Restore access, confirm the mount succeeds again, then clean up: delete the test Pod and its `SecretProviderClass`, and remember Key Vault's soft-delete means a deleted vault may linger unless you purge it.

<details>
<summary>Stuck? One hint</summary>

The add-on's own managed identity (find it under `az aks show --query addonProfiles.azureKeyvaultSecretsProvider.identity`) must be granted `get` on the vault's secrets via `az keyvault set-policy`; removing that policy is what turns a working mount into a `Forbidden`/access-denied failure visible in `kubectl describe pod`.

</details>

## Common mistakes & troubleshooting

- **Enabling Azure AD RBAC and then locking yourself out.** Always bind
  at least one role (ideally an admin-equivalent one) to your own user
  identity before relying solely on Azure AD auth, or you can end up
  authenticated but authorized for nothing.
- **Confusing Kubernetes-native RBAC objects with Azure RBAC for
  Kubernetes Authorization.** If you enabled `--enable-azure-rbac`,
  permissions are managed via `az role assignment create` against
  built-in roles like "Azure Kubernetes Service RBAC Reader" — applying a
  Kubernetes `RoleBinding` YAML won't have the effect you expect in that
  mode. Know which mode your cluster is in.
- **Forgetting the access policy step for Key Vault.** The CSI driver
  add-on being "enabled" doesn't imply it can read your specific vault —
  it needs its identity explicitly granted `get`/`list` on secrets via
  `az keyvault set-policy` (or an Azure RBAC role assignment on the
  vault, depending on the vault's permission model).
- **Treating Key Vault-mounted secrets as fire-and-forget.** The CSI
  driver's default behavior mounts secrets as files at pod-start; some
  configurations need explicit rotation-poll settings to pick up
  Key-Vault-side changes without a pod restart — don't assume live
  updates happen automatically unless you've configured it.
- **Cost pitfall: soft-deleted Key Vaults lingering.** Key Vault's
  default soft-delete retention means a "deleted" vault can still exist
  (and in some configurations still incur minor charges/hold your unique
  name) for a retention window. If you're cleaning up permanently and
  your account has purge protection off, purge it explicitly rather than
  assuming `delete` alone is final.

## Checkpoint quiz

Write down your answer to each question before expanding it — checking without attempting first is the single easiest way to fool yourself into thinking you've learned this.

1. What's the difference between plain Kubernetes RBAC and Azure
   AD-integrated Kubernetes RBAC?
2. What's the difference between Azure AD-integrated RBAC (still using
   `RoleBinding` YAML) and Azure RBAC for Kubernetes Authorization
   (`--enable-azure-rbac`)?
3. Why is pulling a secret from Key Vault via the CSI driver generally
   preferable to a plain Kubernetes `Secret` for sensitive values?
4. What two things does the Key Vault CSI driver's managed identity need
   before it can mount a secret into a pod?
5. What real risk do you run by enabling Azure AD RBAC without first
   binding a role to your own identity?
6. What does Key Vault's soft-delete behavior mean for cleanup, cost-wise?

<details>
<summary>Show answers</summary>

1. Plain Kubernetes RBAC authorizes based on identities the API server
   knows about directly (certs, static tokens, service accounts) with no
   central directory; Azure AD-integrated RBAC lets `Role`/`RoleBinding`
   subjects reference real Azure AD users/groups, so access follows your
   organization's actual identity system and login goes through Azure AD
   authentication.
2. With Azure AD-integrated RBAC, you still author Kubernetes
   `Role`/`RoleBinding` YAML, just with Azure AD identities as subjects.
   With Azure RBAC for Kubernetes Authorization enabled, you instead
   manage Kubernetes permissions entirely as Azure role assignments
   (`az role assignment create` with built-in roles), and Kubernetes-native
   RoleBindings are no longer the enforcement mechanism.
3. Because the secret's source of truth and lifecycle (rotation, access
   policies, audit logging) stay in Key Vault, a purpose-built secrets
   service, rather than being duplicated as a base64-encoded value stored
   inside the cluster with no built-in rotation.
4. The add-on's managed identity needs to be granted access on the
   specific Key Vault (via `az keyvault set-policy` or an Azure RBAC role
   assignment on the vault), and a `SecretProviderClass` must correctly
   reference the vault name and secret names to mount.
5. You could authenticate successfully via Azure AD but have no
   Kubernetes permissions bound to your identity at all, effectively
   locking yourself out of an otherwise-working cluster.
6. A "deleted" Key Vault isn't necessarily gone immediately — it can be
   retained in a recoverable, soft-deleted state for a retention period
   (and may still hold its unique name / incur minor effects), so full
   cleanup sometimes requires an explicit purge rather than relying on
   `delete` alone.

</details>

## Cumulative review

Closed-book. Don't reopen earlier modules while attempting these — the
point is to find out what actually stuck.

1. You expose two apps to the internet through one Ingress, put an HPA on
   one of them, and drive load until the Cluster Autoscaler adds a node.
   Explain how many public IPs this whole setup uses and why, and why the
   new node appearing does *not* change that IP count.
2. Three different failures all surface as a Pod that won't run correctly:
   an Ingress whose `ADDRESS` stays empty, a Pod stuck `Pending` during an
   HPA-driven scale-up, and a Pod that won't start because it can't mount a
   Key Vault secret. For each, name the layer at fault and the single
   command whose output points you at the real cause.
3. `--max-count` on the Cluster Autoscaler and verbose application logging
   under Container Insights are both described as "cost knobs" distinct
   from node/disk cost. Explain what each one actually bills you for and
   why each is easy to leave running unnoticed.
4. Your HPA won't scale under load and its target shows `<unknown>`. What's
   the most likely cause, and how does that same missing piece also affect
   whether the Cluster Autoscaler makes correct decisions?
5. Compare the three managed identities you've touched by module 07: the
   cluster's identity used for ACR pulls (module 03), the Key Vault CSI
   add-on's identity, and a user's Azure AD identity used for cluster
   access. For each, what grant makes it actually able to do its job?
6. You enable Azure AD-integrated RBAC on a cluster and immediately can't
   do anything even though login succeeds. What happened, and how does this
   failure mode differ conceptually from being unable to *authenticate* at
   all?
7. Container Insights and a Key Vault can both outlive an
   `az group delete` on the cluster's resource group. Explain why each can
   survive, and what you'd run during final cleanup to catch each one.
8. Walk the request path for a user hitting one of your apps through
   Ingress: from the public IP, to the ingress controller, to the backing
   Service type, to the Pod. Why is the backing Service a `ClusterIP` and
   not a `LoadBalancer`, and where would monitoring let you see this
   traffic historically rather than live?
9. You want to prove, after the fact, that a Pod OOM-killed or crash-looped
   last night and was then replaced. Why is `kubectl logs --previous`
   insufficient, and what module-06 capability answers the question
   instead?
10. Rank these by how quickly they react to a sudden traffic spike, fastest
    first, and say which two work together to fully absorb the spike: the
    HPA adding replicas, the Cluster Autoscaler adding a node, an Azure AD
    role assignment taking effect. Explain the one that's a distractor.

<details>
<summary>Show answers</summary>

1. One public IP — owned by the single ingress controller's own
   `LoadBalancer` Service, which fronts both apps by host/path routing. The
   Cluster Autoscaler adds a *node* (a VM) so more pods can schedule; nodes
   are not public IPs, and Ingress routing is unchanged, so the IP count
   stays at one.
2. Empty Ingress `ADDRESS`: the ingress/networking layer — `kubectl
   describe ingress <name>` (check the `ingressClassName` matches an
   existing `IngressClass`). `Pending` during scale-up: the
   scheduling/capacity layer — `kubectl describe pod <name>` (Events show
   "Insufficient cpu" until the autoscaler adds a node). Key Vault mount
   failure: the secrets/identity layer — `kubectl describe pod <name>`
   (Events show a CSI mount `Forbidden`/access-denied).
3. `--max-count` bills you for every additional node VM the autoscaler is
   *allowed* to add and does add under load or a misconfiguration; it's
   easy to miss because a runaway HPA or a load test left running can push
   you to the ceiling silently. Container Insights bills for log/metric
   data ingested and retained; verbose logging that was free and ephemeral
   under `kubectl logs` now accrues ongoing ingestion cost the moment it's
   shipped to Log Analytics.
4. The target Deployment is missing a CPU `request`, so HPA has no
   denominator to compute a CPU percentage against and reports `<unknown>`.
   The same requests drive the Cluster Autoscaler's scheduling-fit
   decisions, so absent or wrong requests break correct node-scaling
   decisions too — both layers depend on requests, not raw usage.
5. The cluster's identity needs the `AcrPull` role assignment on the ACR
   (via `--attach-acr`). The Key Vault CSI add-on's identity needs a vault
   access grant (`az keyvault set-policy` for `get`/`list`, or an
   equivalent Azure RBAC role on the vault). A user's Azure AD identity
   needs a Kubernetes `Role`/`ClusterRole` binding (or an Azure RBAC role
   assignment, if the cluster uses Azure RBAC for Kubernetes
   Authorization) to be authorized on the cluster.
6. You authenticated successfully via Azure AD but have no Kubernetes
   permissions bound to your identity, so you're authorized for nothing —
   an *authorization* gap. That's different from an *authentication*
   failure, where you can't even prove who you are; here login works, you
   just can't do anything until a role is bound to you.
7. A Log Analytics workspace is a separate Azure resource, sometimes in a
   different resource group, so deleting the cluster's group doesn't remove
   it — check `az monitor log-analytics workspace list`. A Key Vault has
   soft-delete, so a "deleted" vault can linger recoverably (and hold its
   name) — check `az keyvault list` / `az keyvault list-deleted` and purge
   if needed.
8. Public IP → ingress controller's `LoadBalancer` Service → the app's
   `ClusterIP` Service → Pods. The backing Service is `ClusterIP` because
   the ingress controller is the single external entry point; backends only
   need to be reachable *inside* the cluster, so giving each its own
   `LoadBalancer`/public IP would waste money. Historical view of that
   traffic/behavior lives in Container Insights / Log Analytics, versus
   live `kubectl`.
9. Once the crashed Pod has been deleted and replaced, `kubectl logs
   --previous` has no prior container instance left to read from — it's
   live-only. Container Insights retains the shipped logs and pod inventory
   (queryable via KQL against `ContainerLogV2`/pod inventory tables), so
   the crash history survives the Pod's deletion.
10. Fastest first: HPA adding replicas (seconds to a couple minutes) →
    Cluster Autoscaler adding a node (minutes, real VM provisioning). Those
    two work together to absorb the spike — HPA reacts first, and when the
    replicas don't fit, the autoscaler adds capacity. The Azure AD role
    assignment is the distractor: it governs *who is allowed to do what*,
    not runtime capacity, and has nothing to do with absorbing traffic
    load.

</details>

## Next

[08-cicd-github-actions-to-aks](../08-cicd-github-actions-to-aks/README.md)
— automate building, pushing, and deploying to AKS instead of running
every step by hand.
