# Secrets, Managed Identity & Config

## Why this matters

Real apps need connection strings, API keys, and registry credentials — and
none of them belong in plaintext env vars or your shell history. Container Apps
gives you app-scoped secrets, Key Vault references resolved at runtime, and
managed identities so your app can authenticate to Azure services *without any
secret at all*. This is also where a single typo — a bad secret reference or a
missing role assignment — turns into a crash loop, so learning to diagnose it
matters as much as setting it up.

## Concepts

### App secrets and secret references

A container app can hold named **secrets** (`--secrets name=value`), stored
encrypted by the platform, not visible in the plain template. You then
**reference** a secret from an environment variable using the `secretref:`
syntax: `--env-vars "DB_CONN=secretref:db-conn"` injects the value of the
secret named `db-conn` into the `DB_CONN` env var at runtime. This is the same
pattern as a Kubernetes Secret referenced by a pod's `valueFrom.secretKeyRef` —
you already know the shape. Secrets are also what scale-rule auth and registry
auth point at (you saw `--scale-rule-auth connection=queue-conn` in module 03).

### Key Vault references

Better than storing the secret value in the app: store it in **Azure Key Vault**
and have the app reference it. A secret's value can be a Key Vault secret URI,
and ACA resolves it at runtime using the app's **managed identity**. So the app
config contains only a pointer (the Key Vault secret URI) and an identity — the
actual secret never sits in the container app resource. Rotating the secret in
Key Vault propagates without changing the app. This is the recommended pattern
for anything sensitive.

### Managed identity: system-assigned vs user-assigned

A **managed identity** is an Azure AD (Entra) identity your app *is*, so it can
call Azure services (Key Vault, Storage, ACR, Service Bus) using RBAC instead of
a stored credential. **System-assigned** identity is created with the app,
tied to its lifecycle, and unique to it (`--system-assigned`).
**User-assigned** identity is a standalone resource you create once and attach
to many apps (`--user-assigned <id>`) — better when several apps need the same
permissions or you want the identity to outlive any one app. Conceptually this
is like a Kubernetes ServiceAccount bound to a cloud IAM role (workload
identity), but managed for you.

### Role assignments: the part everyone forgets

Having an identity is necessary but not sufficient — the identity needs
**RBAC role assignments** granting it access to the target resource. To read
Key Vault secrets, the app's identity needs a role like **Key Vault Secrets
User** on the vault (or an access policy, on vaults using the legacy model). To
pull from ACR, it needs **AcrPull** on the registry. Miss the role assignment
and the identity authenticates but is denied — the app crash-loops or fails to
start with an authorization error, not a "missing secret" error. The
diagnosis skill is recognizing "403/forbidden from the identity" as "missing
role assignment," not "wrong secret."

### Registry authentication with managed identity

Pulling a private image is a special case of the same idea. Instead of storing
registry username/password as secrets, you attach a managed identity with
**AcrPull** on the Azure Container Registry and tell the app to use it for
pulls (`az containerapp registry set --identity <system-or-user-id>`). No
registry password is ever stored on the app. If the role assignment is missing,
the very first thing that fails is the image pull — the revision never leaves
provisioning.

## Command reference

| Command | What it does | Example |
|---------|--------------|---------|
| `az containerapp secret set` | Add/update app secrets | `az containerapp secret set --name web --resource-group rg-aca-m06 --secrets "db-conn=Server=..."` |
| `az containerapp secret list` | List secret names (not values) | `az containerapp secret list --name web --resource-group rg-aca-m06 -o table` |
| `az containerapp identity assign` | Attach a managed identity | `az containerapp identity assign --name web --resource-group rg-aca-m06 --system-assigned` |
| `az containerapp identity show` | Show the app's identities | `az containerapp identity show --name web --resource-group rg-aca-m06 -o jsonc` |
| `az keyvault create` / `az keyvault secret set` | Create a vault / store a secret | `az keyvault secret set --vault-name kv-m06 --name db-conn --value "Server=..."` |
| `az role assignment create` | Grant the identity a role | `az role assignment create --assignee <principalId> --role "Key Vault Secrets User" --scope <vaultId>` |
| `az containerapp registry set` | Configure ACR pull auth | `az containerapp registry set --name web --resource-group rg-aca-m06 --server myacr.azurecr.io --identity system` |

Flag-by-flag breakdowns:

`az containerapp secret set --name web --resource-group rg-aca-m06 --secrets "db-conn=Server=..." "api-key=abc123"`
- `--secrets` — space-separated `name=value` pairs; stored encrypted, referenced later via `secretref:`.

`az containerapp identity assign --name web --resource-group rg-aca-m06 --system-assigned`
- `--system-assigned` — create/attach a system-assigned identity (lifecycle tied to the app). Use `--user-assigned <resourceId>` instead to attach a standalone identity.

`az role assignment create --assignee <principalId> --role "Key Vault Secrets User" --scope <vaultId>`
- `--assignee <principalId>` — the identity's principal (object) ID; for a system-assigned identity get it from `identity show --query principalId`.
- `--role "Key Vault Secrets User"` — the RBAC role granting secret-read.
- `--scope <vaultId>` — the resource the grant applies to (the Key Vault). Scope narrowly, not at subscription level.

`az containerapp update --name web --resource-group rg-aca-m06 --set-env-vars "DB_CONN=secretref:db-conn"`
- `--set-env-vars "DB_CONN=secretref:db-conn"` — inject the secret named `db-conn` into env var `DB_CONN` at runtime. A typo in the secret name (`secretref:db-con`) yields an unresolved reference and often a crash loop.

`az containerapp registry set --name web --resource-group rg-aca-m06 --server myacr.azurecr.io --identity system`
- `--server` — the ACR login server.
- `--identity system` — use the system-assigned identity to authenticate pulls (needs AcrPull on the registry). Use a user-assigned identity's resource ID for `--identity` instead if applicable.

## Hands-on exercises

1. **Set up group, Environment, app.**
   ```powershell
   az group create --name rg-aca-m06 --location eastus
   az containerapp env create --name env-m06 --resource-group rg-aca-m06 --location eastus
   az containerapp create --name web --resource-group rg-aca-m06 --environment env-m06 `
     --image mcr.microsoft.com/k8se/quickstart:latest --target-port 80 --ingress external
   ```

2. **Set a plain secret and reference it.**
   ```powershell
   az containerapp secret set --name web --resource-group rg-aca-m06 --secrets "greeting=hello-from-secret"
   az containerapp update --name web --resource-group rg-aca-m06 --set-env-vars "GREETING=secretref:greeting"
   az containerapp secret list --name web --resource-group rg-aca-m06 -o table
   ```
   Verify the secret **name** lists (never the value), and the env var
   references it. Confirm the app is still running after the update.

3. **Enable a system-assigned identity.**
   ```powershell
   az containerapp identity assign --name web --resource-group rg-aca-m06 --system-assigned
   $pid = az containerapp identity show --name web --resource-group rg-aca-m06 --query principalId -o tsv
   $pid
   ```
   Verify a principal (object) ID prints.

4. **Create a Key Vault and store a secret.**
   ```powershell
   $kv = "kvm06$((Get-Random -Max 9999))"
   az keyvault create --name $kv --resource-group rg-aca-m06 --location eastus --enable-rbac-authorization true
   az keyvault secret set --vault-name $kv --name db-conn --value "Server=example;Password=p@ss"
   $vaultId = az keyvault show --name $kv --resource-group rg-aca-m06 --query id -o tsv
   ```

5. **Grant the app's identity read access to the vault.**
   ```powershell
   az role assignment create --assignee $pid --role "Key Vault Secrets User" --scope $vaultId
   ```
   Verify with
   `az role assignment list --assignee $pid --scope $vaultId -o table` — expect
   the role to appear. Role propagation can take a minute or two.

6. **Reference the Key Vault secret from the app.**
   ```powershell
   $secretUri = az keyvault secret show --vault-name $kv --name db-conn --query id -o tsv
   az containerapp secret set --name web --resource-group rg-aca-m06 `
     --secrets "db-conn=keyvaultref:$secretUri,identityref:system"
   az containerapp update --name web --resource-group rg-aca-m06 --set-env-vars "DB_CONN=secretref:db-conn"
   ```
   Verify the app starts a new revision and stays healthy — the value came from
   Key Vault via the identity, never stored in the app. (Syntax for the
   Key Vault reference secret may vary slightly by CLI version; confirm with
   `az containerapp secret set --help`.)

7. **Use a user-assigned identity instead (contrast).**
   ```powershell
   az identity create --name uami-m06 --resource-group rg-aca-m06
   $uamiId = az identity show --name uami-m06 --resource-group rg-aca-m06 --query id -o tsv
   $uamiPid = az identity show --name uami-m06 --resource-group rg-aca-m06 --query principalId -o tsv
   az containerapp identity assign --name web --resource-group rg-aca-m06 --user-assigned $uamiId
   az role assignment create --assignee $uamiPid --role "Key Vault Secrets User" --scope $vaultId
   ```
   Verify both identities now show on the app
   (`az containerapp identity show ... -o jsonc`). Note the user-assigned one
   could be attached to other apps too.

8. **Diagnose and fix: secret reference typo → crash loop.** Break it
   deliberately:
   ```powershell
   az containerapp update --name web --resource-group rg-aca-m06 --set-env-vars "DB_CONN=secretref:db-con"
   az containerapp revision list --name web --resource-group rg-aca-m06 -o table
   ```
   The new revision references a secret name that doesn't exist (`db-con` vs
   `db-conn`); the container fails to resolve it and can crash-loop or fail
   provisioning. **Diagnose** by listing secret names
   (`secret list`) and comparing to the `secretref:` value. **Fix** by
   updating with the correct name `secretref:db-conn` and confirm the revision
   goes healthy.

9. **Diagnose and fix: missing role assignment.** Remove the role and observe
   the failure mode:
   ```powershell
   az role assignment delete --assignee $pid --role "Key Vault Secrets User" --scope $vaultId
   az containerapp update --name web --resource-group rg-aca-m06 --set-env-vars "TRIGGER=rev$((Get-Random))"
   az containerapp logs show --name web --resource-group rg-aca-m06 --tail 40
   ```
   The identity now authenticates but is **denied** reading the Key Vault
   secret — a forbidden/authorization error, not a "missing secret" error.
   **Fix** by re-creating the role assignment (exercise 5) and rolling a fresh
   revision; wait for RBAC propagation. Lesson: identity present + role missing
   = authorization failure.

10. **Cleanup.**
    ```powershell
    az group delete --name rg-aca-m06 --yes --no-wait
    ```
    (Deletes the Key Vault too. Note: soft-delete may retain the vault name for
    a while; that's expected and free.)

## Independent challenge

Deploy an app that reads a sensitive value from **Key Vault** using a
**user-assigned** managed identity (not system-assigned), with the correct role
assignment scoped to just the vault — and prove the secret value never appears
in the app's plaintext config. Then deliberately introduce a **missing role
assignment**, capture the exact failure signature in the logs, and fix it.
Combine this module with **module 05**: do the fix as a new revision and use
traffic splitting to keep the last-good revision serving while the fixed one
comes up. Clean up the resource group afterward (the Key Vault is billable-ish
and soft-deletes on removal).

<details><summary>Stuck? One hint</summary>

The tell for "missing role assignment" vs "wrong secret" is in the logs/
provisioning error: a role problem reads as *forbidden/authorization/denied*
from the identity against the vault, while a bad `secretref:` reads as an
*unresolved/unknown secret*. Check `az role assignment list --assignee <pid>
--scope <vaultId>` — an empty list is your smoking gun.

</details>

## Common mistakes & troubleshooting

- **Secret name typos in `secretref:`.** The reference must exactly match a
  secret name (`secret list`). A typo yields an unresolved value and often a
  crash loop — with a confusing error that doesn't say "typo."
- **Identity without a role.** Attaching an identity does nothing on its own;
  it needs an RBAC role assignment on the target resource. Symptom is a
  *forbidden* error, not a missing-credential error.
- **RBAC propagation lag.** Role assignments can take a couple of minutes to
  take effect; rolling a revision immediately after granting can still fail.
  Wait and retry.
- **Wrong scope on the role.** Granting at subscription scope "to be safe"
  over-permissions the identity; scope to the specific vault/registry.
- **RBAC vs access-policy Key Vaults.** On an access-policy vault, roles won't
  work — you set an access policy instead. Prefer RBAC-authorization vaults
  (`--enable-rbac-authorization true`) for consistency.
- **Cost pitfall.** Key Vault operations and (for private setups) any
  networking you add are billable, and a forgotten Environment still carries
  its Log Analytics workspace. Delete the whole resource group.

## Checkpoint quiz

Write down your answer to each question before expanding it — checking without
attempting first is the single easiest way to fool yourself into thinking
you've learned this.

1. What's the `secretref:` syntax for and what Kubernetes construct is it like?
2. Why is a Key Vault reference better than storing the secret value directly on
   the app?
3. System-assigned vs user-assigned identity — give one reason to pick each.
4. You attached a managed identity and referenced a Key Vault secret, but the
   app crash-loops with a "forbidden" error. What's missing?
5. How do you get the principal ID needed for a role assignment on a
   system-assigned identity?
6. How does an app pull from a private ACR without storing a registry password?
7. You fixed a missing role assignment but the next revision still fails
   immediately. Most likely reason?

<details><summary>Show answers</summary>

1. It injects the value of a named app secret into an environment variable at
   runtime; like a pod referencing a Kubernetes Secret via
   `valueFrom.secretKeyRef`.
2. The app config holds only a pointer (the Key Vault secret URI) resolved via
   managed identity — the secret value never lives in the app resource, and
   rotating it in Key Vault propagates without editing the app.
3. System-assigned: simplest, lifecycle tied to the app, unique to it.
   User-assigned: reusable across multiple apps and outlives any single app;
   good for shared permissions.
4. A **role assignment** granting that identity access to the vault (e.g.
   *Key Vault Secrets User* scoped to the vault). Identity present but
   unauthorized = forbidden.
5. `az containerapp identity show --name <app> --resource-group <rg> --query
   principalId -o tsv`.
6. Attach a managed identity with **AcrPull** on the registry and configure
   `az containerapp registry set --identity <system|user-id>`; no password is
   stored.
7. RBAC **propagation lag** — the new assignment hasn't taken effect yet. Wait
   a minute or two and roll another revision.

</details>

## Next

[07-monitoring-and-log-analytics](../07-monitoring-and-log-analytics/README.md)
— see what your apps are actually doing: console vs system logs, live
streaming, KQL queries, metrics, and alerts.
</content>
