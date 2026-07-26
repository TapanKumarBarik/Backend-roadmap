# Track 16: Identity Deep Dive

You have already *used* Azure identity several times without ever making it
the subject. On Container Apps you attached a managed identity and gave it a
**Key Vault Secrets User** role to read a secret
([06-azure-container-apps/06-secrets-managed-identity-and-config](../06-azure-container-apps/06-secrets-managed-identity-and-config/README.md)).
On AKS you attached ACR with a managed identity for image pulls, and you
mounted Key Vault secrets through the CSI driver's identity while binding
real Azure AD users to Kubernetes roles
([07-aks/07-security-aks-aad-rbac-and-keyvault](../07-aks/07-security-aks-aad-rbac-and-keyvault/README.md)).
In CI/CD you authenticated GitHub Actions to Azure over OIDC federation
instead of a stored secret
([10-cicd-and-gitops/07-pipeline-security-and-secrets](../10-cicd-and-gitops/07-pipeline-security-and-secrets/README.md)).

Each of those touched *one slice* of identity in service of some other goal.
This track makes **identity itself the discipline**. It generalizes every
one of those moments into a single mental model — Entra ID (Azure AD) as the
directory, service principals vs. managed identity vs. workload identity
federation as three ways an application proves who it is, and RBAC role
assignments at the right scope as the thing that turns "authenticated" into
"allowed." By the end you should be able to look at any Azure resource — an
AKS pod, a Container App, a Terraform pipeline, a GitHub Actions job — and
answer: *what identity is this, how does it authenticate, and exactly what is
it authorized to do?*

> This track assumes you have already done the identity-adjacent work in
> tracks **06** (Container Apps managed identity), **07** (AKS AAD-RBAC and
> Key Vault), **09** (Terraform on Azure — you will write
> `azurerm_role_assignment` and `azurerm_user_assigned_identity` here), and
> **11** (security fundamentals and least-privilege thinking). We do not
> re-teach the basics from 06/07 — we go much deeper and generalize them
> across every resource type.

> **Cost warning:** Entra ID identities (users, groups, app registrations,
> service principals, managed identities) and role assignments are **free** —
> the identity plane itself does not bill. What costs money is the
> *resources* you attach them to: Key Vaults, AKS clusters, Container Apps
> Environments and their Log Analytics workspaces. Every module that creates
> a billable resource ends with a cleanup step. Delete resource groups when
> you are done: `az group delete --name <rg> --yes --no-wait`.

## How this track works

- Go in order — module 01 assumes the Entra ID vocabulary from module 00,
  module 03 (workload identity federation) assumes the service principal and
  managed identity mechanics from 01 and 02, and so on.
- Every module (except this index and the capstone) follows the same shape:
  **Why this matters → Concepts → Command reference → Hands-on exercises →
  Independent challenge → Common mistakes & troubleshooting → Checkpoint quiz
  → Next**. Two modules (02 and 05) additionally carry a closed-book
  **Cumulative review**.
- All exercises use real `az ad`, `az identity`, `az role`, and Terraform
  commands against your actual Azure subscription. Several are
  **diagnose-and-fix** exercises: you deliberately break an identity or a
  role assignment and learn to read the failure.
- Module 08 is a capstone with no quiz — it asks you to wire a GitHub Actions
  pipeline, a Terraform apply, an AKS workload, and a Key Vault together using
  workload identity federation and least-privilege role assignments, with a
  written audit trail of every grant.

## Modules

| # | Module | What it covers | Rough time |
|---|--------|-----------------|------------|
| 00 | [entra-id-and-identity-fundamentals](00-entra-id-and-identity-fundamentals/README.md) | Tenants, users/groups, app registrations vs. enterprise apps, authn vs. authz, OAuth2/OIDC conceptually | 60-75 min |
| 01 | [service-principals-in-depth](01-service-principals-in-depth/README.md) | `az ad sp create-for-rbac`, client secret vs. certificate auth, why long-lived secrets are a liability | 60-90 min |
| 02 | [managed-identity-in-depth](02-managed-identity-in-depth/README.md) | System- vs. user-assigned, which resources support it, one identity across many resources, identity lifecycle | 75-90 min |
| 03 | [workload-identity-federation](03-workload-identity-federation/README.md) | Federated credentials, subject claims, GitHub Actions and Kubernetes service accounts to Azure with no stored secret | 90 min |
| 04 | [rbac-and-role-assignments](04-rbac-and-role-assignments/README.md) | Built-in vs. custom roles, assignment scope (MG/sub/RG/resource), least privilege, vs. Kubernetes RBAC | 75-90 min |
| 05 | [conditional-access-and-identity-protection](05-conditional-access-and-identity-protection/README.md) | MFA, conditional access policies, risk-based access — survey level for platform engineers | 60 min |
| 06 | [cross-resource-identity-patterns](06-cross-resource-identity-patterns/README.md) | One mental map: Terraform via WIF, AKS pod to Key Vault, Container App to a database | 75-90 min |
| 07 | [auditing-and-troubleshooting-identity](07-auditing-and-troubleshooting-identity/README.md) | Sign-in logs, diagnosing 403s: missing role vs. missing federated credential vs. propagation delay | 75 min |
| 08 | [capstone-project](08-capstone-project/README.md) | End-to-end: GitHub Actions → WIF → Terraform → user-assigned identity → AKS → Key Vault, all least-privilege, with an audit trail | 3-6 hours |

## Prerequisites

- An active Azure subscription (already confirmed for this curriculum), and —
  importantly — **enough directory permission to create app registrations and
  role assignments**. Some corporate tenants restrict this; if `az ad app
  create` or `az role assignment create` is denied for your account, do the
  exercises in a personal/pay-as-you-go tenant where you are an owner.
- Everything from [06-azure-container-apps](../06-azure-container-apps/README.md)
  and [07-aks](../07-aks/README.md): you have attached managed identities and
  granted them roles before.
- Everything from [09-terraform-on-azure](../09-terraform-on-azure/README.md):
  the `azurerm` provider, `terraform apply`, and reading HCL resource blocks.
- Everything from [11-security-deep-dive](../11-security-deep-dive/README.md):
  threat-modeling and the least-privilege mindset that this whole track applies
  to identity specifically.

[Back to main curriculum](../README.md)

Start here → [00-entra-id-and-identity-fundamentals/README.md](00-entra-id-and-identity-fundamentals/README.md)
