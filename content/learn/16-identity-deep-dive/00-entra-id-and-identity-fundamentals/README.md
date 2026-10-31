# Entra ID and Identity Fundamentals

## Why this matters

Every `az login`, every managed identity you attached, every `az role
assignment create` you ran in tracks 06, 07, and 10 was talking to one thing:
your **Entra ID tenant** (the service formerly and still often called Azure
Active Directory / Azure AD). Until now it was invisible plumbing. This module
makes the plumbing explicit, because you cannot reason about service
principals, managed identity, or workload identity federation without a solid
mental model of tenants, the difference between *proving who you are* and
*being allowed to do something*, and what an app registration actually is.

## Concepts

### The tenant is your directory

An **Entra ID tenant** is a dedicated instance of the directory service — the
authoritative database of *who and what* exists in your organization: users,
groups, and application identities. It has a globally unique **tenant ID** (a
GUID) and one or more domains (e.g. `contoso.onmicrosoft.com`). Every Azure
subscription **trusts exactly one tenant** for authentication; when you ran
`az login` in the AKS track and picked a subscription, you were authenticating
against that subscription's tenant. A crucial split to hold onto from the
start: **the tenant is the identity plane, the subscription is the resource
plane.** A tenant can trust many subscriptions; a subscription trusts one
tenant. Deleting a resource group never touches the tenant; deleting a user
never touches your VMs. This is the same conceptual boundary you saw when the
07-aks module 07 cleanup noted that a Key Vault (a resource) can outlive an
`az group delete` — identities and resources have separate lifecycles.

### Users and groups

A **user** is a human (or a break-glass admin account) that signs in with
credentials. A **group** is a named collection of users (and sometimes other
groups or service principals). You met groups already: in
[07-aks/07](../../07-aks/07-security-aks-aad-rbac-and-keyvault/README.md) you
bound an Entra ID *group* object ID to a Kubernetes `ClusterRoleBinding` so
that team membership — not a hand-edited kubeconfig — controlled cluster
access. The reason groups matter for a platform engineer is **you assign
permissions to groups, not individuals**: role assignments to a group flow to
every member automatically, and revoking access is a matter of removing
someone from the group. This is exactly the least-privilege, minimize-blast-
radius thinking from [11-security-deep-dive](../../11-security-deep-dive/README.md),
applied to who-can-do-what.

### App registrations vs. enterprise applications vs. service principals

This is the single most confusing corner of Entra ID, so pin it down now — it
recurs in every later module. When you register an application you get **two
linked objects**:

- An **app registration** (also called the *application object*) is the global
  *definition* of your app: its name, its client ID, what secrets/certificates
  it can authenticate with, what API permissions it requests, and — critically
  for module 03 — its **federated credentials**. There is exactly one app
  registration per application, and it lives in the tenant where the app was
  registered.
- A **service principal** (also called the *enterprise application* in the
  portal) is the *local representation* of that app **inside a specific
  tenant** — the thing that actually gets **role assignments** and can be
  granted access to resources. When an app is used in a tenant, a service
  principal for it is created there.

Analogy: the **app registration is the class, the service principal is the
instance**. You define the app once (registration); each tenant that uses it
gets its own service principal to hang permissions on. For single-tenant apps
(everything you will build in this track) there is one registration and one
service principal, one-to-one, in your tenant — but knowing they are separate
objects explains why `az ad app` and `az ad sp` are different command families
in module 01.

### Authentication vs. authorization

You saw this split named in [07-aks/07](../../07-aks/07-security-aks-aad-rbac-and-keyvault/README.md)
(you could *authenticate* via Azure AD yet be *authorized* for nothing). Make
it a reflex:

- **Authentication (authn) = proving who you are.** The tenant checks your
  credential (password, certificate, a federated OIDC token) and, if valid,
  issues you a **token**. Output: "yes, you are this identity." That is *all*
  it says.
- **Authorization (authz) = deciding what you may do.** A separate system —
  Azure **RBAC** (module 04) — checks whether your identity has a **role
  assignment** granting the action you attempted on the resource you attempted
  it on. Output: "allowed" or "Forbidden / 403."

Almost every identity failure you will diagnose in module 07 is one of these
two failing, and the whole skill is knowing *which*. A wrong secret or an
expired token or a subject-claim mismatch is an **authn** failure (you never
get a valid token). A valid token but a missing role assignment is an **authz**
failure — the `403`/`Forbidden` you saw crash-loop a Container App in
[06/06](../../06-azure-container-apps/06-secrets-managed-identity-and-config/README.md)
when the role was missing.

### OAuth2 and OIDC, just enough

You do not need to implement these, but you need the vocabulary because every
later mechanism is built on them:

- **OAuth2** is the framework for *delegated authorization* — how a client
  gets an **access token** to call an API (like the Azure Resource Manager
  API, or Microsoft Graph) on behalf of some identity. The token is a signed,
  time-limited credential (a **JWT**) that the resource validates.
- **OIDC (OpenID Connect)** is a thin authentication layer on top of OAuth2
  that adds an **ID token** — a JWT asserting *who* the identity is, with
  standard **claims** like `iss` (issuer — who minted the token), `sub`
  (subject — which identity), and `aud` (audience — who the token is for).
- The **`sub` (subject) claim** is the one to remember: in workload identity
  federation (module 03), Azure decides whether to trust an external token by
  matching *its* `sub` claim (e.g. GitHub's
  `repo:my-org/my-repo:ref:refs/heads/main`) against a **federated credential**
  you configured. When the OIDC login in module 03 fails, it is almost always
  a `sub` mismatch. You will hear "subject claim" again and again — this is
  where it comes from.

## Command reference

| Command | What it does | Example |
|---|---|---|
| `az account show` | Shows the current subscription **and** its tenant ID | `az account show --query "{sub:id, tenant:tenantId, user:user.name}" -o jsonc` |
| `az ad signed-in-user show` | Shows the Entra ID object for the currently logged-in user | `az ad signed-in-user show --query "{name:displayName, id:id, upn:userPrincipalName}" -o jsonc` |
| `az ad user list` | Lists users in the tenant | `az ad user list --query "[].{name:displayName, upn:userPrincipalName}" -o table` |
| `az ad group create` | Creates a security group | `az ad group create --display-name "platform-admins" --mail-nickname "platform-admins"` |
| `az ad group member add` | Adds a member to a group | `az ad group member add --group "platform-admins" --member-id <user-object-id>` |
| `az ad group member list` | Lists group members | `az ad group member list --group "platform-admins" -o table` |
| `az ad app list` | Lists app registrations (application objects) | `az ad app list --query "[].{name:displayName, appId:appId}" -o table` |
| `az ad sp list` | Lists service principals (enterprise apps) | `az ad sp list --show-mine -o table` |

Flag-by-flag breakdowns:

`az ad group create --display-name "platform-admins" --mail-nickname "platform-admins"`
- `--display-name` — the human-readable group name shown in the portal and used by `--group` in later commands.
- `--mail-nickname` — a mail alias Entra ID requires even for non-mail-enabled security groups; use the same slug as the display name. It must be unique-ish and mail-safe (no spaces).

`az ad group member add --group "platform-admins" --member-id <user-object-id>`
- `--group` — the group's display name **or** object ID.
- `--member-id` — the **object ID** (a GUID) of the user/SP/group being added, *not* the display name or UPN. Get a user's object ID with `az ad user show --id <upn> --query id -o tsv`.

`az account show --query "{sub:id, tenant:tenantId, user:user.name}" -o jsonc`
- `--query` — a JMESPath projection pulling out just the subscription ID, tenant ID, and signed-in user in one object; the whole point of this exercise is to *see* the sub-vs-tenant split on your own account.

## Hands-on exercises

1. **See your tenant and subscription split.** Run
   `az account show --query "{sub:id, tenant:tenantId, user:user.name}" -o jsonc`.
   Write down which GUID is the **subscription** and which is the **tenant**.
   Verify: the two GUIDs are different, and re-running after `az account set
   --subscription <other-sub>` (if you have a second subscription) changes the
   `sub` but very likely keeps the same `tenant`.

2. **Look at yourself as a directory object.** Run
   `az ad signed-in-user show --query "{name:displayName, id:id, upn:userPrincipalName}" -o jsonc`.
   Note your **object ID** — this is the GUID you would pass as `--assignee` to
   a role assignment or as a `subjects` object ID in a Kubernetes binding.
   Verify: the `id` here is a *different* GUID from both your subscription and
   tenant IDs. Identity objects have their own IDs.

3. **List the app registrations and service principals already in your
   tenant.** Run `az ad app list --query "[].{name:displayName, appId:appId}" -o table`
   and `az ad sp list --show-mine -o table`. Verify: you almost certainly
   already have service principals from earlier tracks (for example, ones
   created by `az ad sp create-for-rbac`, or the CLI's own first-party apps).
   Notice the SP list is longer — every managed identity and first-party
   Microsoft app also shows up as a service principal.

4. **Create a security group.** Run
   `az ad group create --display-name "platform-admins" --mail-nickname "platform-admins"`,
   then capture its object ID:
   `az ad group show --group "platform-admins" --query id -o tsv`. Verify: the
   group appears in `az ad group list --query "[?displayName=='platform-admins']" -o table`.

5. **Add yourself to the group.** Get your object ID
   (`az ad signed-in-user show --query id -o tsv`), then
   `az ad group member add --group "platform-admins" --member-id <your-object-id>`.
   Verify: `az ad group member list --group "platform-admins" -o table` lists
   you. (Later modules assign roles to this group, not to you directly — that
   is the point of using a group.)

6. **Inspect a token's claims (conceptual, no secret).** Run
   `az account get-access-token --query "{expires:expiresOn}" -o jsonc`. This is
   an OAuth2 access token the CLI holds for the ARM API. Verify: it has an
   expiry a short time in the future — tokens are **time-limited**, which is
   exactly why a stored, long-lived *secret* (module 01) is a different and
   worse thing than a short-lived *token*. (Do not paste the raw token
   anywhere; treat it as a live credential.)

7. **Distinguish authn from authz on purpose.** Pick any resource group you own
   and run a harmless read, e.g. `az group show --name <some-rg>`. It works
   because you are both authenticated *and* authorized (Owner/Contributor).
   Now run something you are almost certainly not authorized for, like creating
   a role assignment at **subscription** scope for a random principal
   (`az role assignment create --assignee <your-id> --role Owner --scope /subscriptions/<sub-id>` —
   expect this to be **denied** unless you are a subscription Owner/User Access
   Administrator). Verify: the failure is a `403`/authorization error, **not**
   a login prompt — you were authenticated fine; you just were not authorized.
   That distinction is the whole module.

8. **Diagnose-and-fix: "member-id" rejected.** Deliberately run
   `az ad group member add --group "platform-admins" --member-id "platform-admins"`
   (passing a *name* where an object ID is required). Observe the error.
   **Diagnose:** `--member-id` needs a GUID object ID, not a display name.
   **Fix:** resolve the name to an ID first
   (`az ad user show --id <your-upn> --query id -o tsv`) and pass that. Verify
   the member is added. This is the same class of mistake — name vs. object ID
   — that trips up `--assignee` in later role-assignment exercises.

## Independent challenge

Without copying any command block above, model your own two-tier access story
in the directory. Create two security groups representing two real teams — say
`app-developers` and `platform-admins` — put your own user in both, then design
(on paper, or in a scratch note) which of the Azure resource types you have
already worked with in tracks 06, 07, and 09 each group *should* be able to
touch and at what level, citing the least-privilege reasoning from
[11-security-deep-dive](../../11-security-deep-dive/README.md). Do not assign
any roles yet — that is module 04 — but produce a table mapping *group →
resource → intended permission → why*. The point is to practice thinking in
terms of **groups and intent** before you touch RBAC mechanics, so that when
module 04 gives you `az role assignment create` you already know *what* you
mean to grant and to *whom*.

<details>
<summary>Stuck? One hint</summary>

Start from the boundary this module opened with: the **tenant is the identity
plane, the subscription is the resource plane**. Your groups live in the
tenant; the things you want to gate (a Key Vault, an AKS cluster, an ACR) live
in subscriptions/resource groups. So every row in your table is "this tenant
group should get this role *scoped to* this resource-plane object" — which is
exactly the shape of an `az role assignment create` you will write in module
04. You are just writing the intent now.

</details>

## Common mistakes & troubleshooting

- **Confusing tenant ID, subscription ID, and object ID.** They are three
  different GUIDs for three different things (directory instance, billing/
  resource container, a specific identity object). Mixing them up is the root
  of most "wrong ID" errors in later modules. When a command wants
  `--assignee`, it wants an **object ID**; when it wants `--scope`, it wants a
  **resource ID** (which contains the subscription ID).
- **Treating app registration and service principal as one thing.** They are
  linked but distinct objects (`az ad app` vs. `az ad sp`). Deleting the app
  registration also removes its service principal, but editing one via the
  wrong command family silently does nothing useful.
- **Assigning permissions to individual users instead of groups.** It works,
  but it does not scale and it makes offboarding error-prone. Prefer groups
  from day one — it is the identity-plane version of the least-privilege
  discipline from track 11.
- **Passing display names where object IDs are required.** `--member-id`,
  `--assignee`, and Kubernetes `subjects` object IDs all want GUIDs. Resolve
  names to IDs explicitly (`... --query id -o tsv`) and pass the ID.
- **Assuming `az login` picked the tenant you meant.** If you belong to more
  than one tenant, `az login --tenant <tenant-id>` (and `az account set`) puts
  you where you intend. A "resource not found" that makes no sense is often
  "you are authenticated against the wrong tenant."

## Checkpoint quiz

Write down your answer to each question before expanding it — checking without attempting first is the single easiest way to fool yourself into thinking you've learned this.

1. What is the difference between a **tenant** and a **subscription**, and
   which one does authentication happen against?
2. An app registration and a service principal are two linked objects. In the
   "class vs. instance" analogy, which is which, and which one receives **role
   assignments**?
3. State the difference between **authentication** and **authorization** in one
   sentence each, and say which one a `403`/`Forbidden` is.
4. Why do you assign permissions to **groups** rather than to individual users?
5. In an OIDC token, what does the **`sub` (subject)** claim assert, and which
   later module makes matching it the whole game?
6. You run a read command and it succeeds; you run a role-assignment-create
   command and get a `403`. Were you authenticated in the second case? How do
   you know?
7. A command asks for `--member-id` and you pass a group's display name; it
   fails. What kind of value did it actually want, and how do you get it?

<details>
<summary>Show answers</summary>

1. A **tenant** is the directory/identity instance (users, groups, app
   identities) with its own tenant ID; a **subscription** is a resource/billing
   container. **Authentication happens against the tenant** — the subscription
   just trusts one tenant to vouch for identities.
2. The **app registration** is the class (the global definition of the app);
   the **service principal** is the instance (its local representation in a
   tenant). The **service principal** is what receives role assignments and
   access grants.
3. **Authentication** = proving who you are (you get a token or you do not).
   **Authorization** = deciding what you may do (you have a role assignment or
   you do not). A `403`/`Forbidden` is an **authorization** failure — you were
   authenticated fine.
4. Because permissions assigned to a group flow to all members automatically,
   and access is granted/revoked by group membership rather than by editing
   every individual's assignments — it scales and it makes offboarding safe.
5. The **`sub` claim** asserts *which identity* the token is for. **Module 03
   (workload identity federation)** makes matching that subject claim against a
   configured federated credential the whole game.
6. **Yes**, you were authenticated in the second case — you got far enough to be
   *evaluated* for authorization and denied. An authentication failure would
   have blocked you with a login/credential error before any permission check.
7. It wanted an **object ID** (a GUID), not a display name. Resolve it first,
   e.g. `az ad group show --group <name> --query id -o tsv` (or `az ad user
   show --id <upn> --query id -o tsv` for a user), and pass that GUID.

</details>

## Next

[01-service-principals-in-depth](../01-service-principals-in-depth/README.md)
— the first concrete application identity: creating a service principal, the
choice between a client secret and a certificate, and why long-lived secrets
are the liability that motivates everything after it.
