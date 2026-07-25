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

## Next

[08-cicd-github-actions-to-aks](../08-cicd-github-actions-to-aks/README.md)
— automate building, pushing, and deploying to AKS instead of running
every step by hand.
