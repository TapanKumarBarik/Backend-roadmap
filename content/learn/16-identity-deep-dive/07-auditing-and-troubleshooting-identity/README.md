# Auditing and Troubleshooting Identity

## Why this matters

Every module ended with a diagnose-and-fix, because identity failures are where
you actually spend your time. This module makes the diagnosis a **method** rather
than a guess: where identity events are recorded (Entra ID **sign-in logs** and
Azure **activity log**), and a disciplined way to separate the three
failure classes that all *look* like "it's broken" — a missing **role
assignment** (authz), a missing/mismatched **federated credential** (authn), and
plain **propagation delay** (nothing is wrong yet). Getting fast at this
distinction is the operational payoff of the whole track, and it is what the
capstone's audit trail proves you can do.

## Concepts

### Where identity events are recorded

Two logs answer "what happened to this identity," and they are different:

- **Entra ID sign-in logs** — every **authentication** attempt: who signed in (or
  a service principal / managed identity), from where, which app, whether MFA/
  conditional access applied, and the **result with an error code**. This is
  where you confirm *"did this identity even get a token?"* — the authn side. It
  distinguishes interactive user sign-ins, non-interactive sign-ins, and **service
  principal sign-ins** (where your pipelines and managed identities show up).
- **Azure activity log** — every **control-plane operation** on resources: who
  did what to which resource and the result, including **authorization failures**.
  This is where a `403 AuthorizationFailed` on a resource action is recorded — the
  authz side. It ties an action to a principal and a role decision.

The mental split mirrors the whole track: **sign-in logs = authentication story;
activity log = authorization story.** When something breaks, you go to one or the
other depending on whether you suspect authn or authz — and often you check
sign-in logs *first* to confirm a token was even issued.

### The three failure classes, and how to tell them apart

Almost every identity failure is one of three. The skill is a fast triage:

- **Missing/mis-scoped role assignment (authz).** The identity **authenticated
  fine** (a token was issued — visible as a successful sign-in) but the action was
  **denied**: `403`, `AuthorizationFailed`, `Forbidden`. The fix is a role
  assignment at the right scope (module 04). Telltale: success in sign-in logs,
  failure in the activity log / on the resource call.
- **Missing/mismatched federated credential (authn).** The identity **never got a
  token**: `AADSTS70021` / "No matching federated identity record found," or a
  subject-claim mismatch (module 03). The fix is correcting the federated
  credential's issuer/subject/audience. Telltale: a **failed** sign-in (or no
  successful token exchange at all) — the request dies before any resource call.
- **Propagation delay (nothing is wrong).** The role assignment or the identity
  or the federated credential was **just created** and has not taken effect
  everywhere yet. The same call **succeeds a minute or two later with no change**.
  The fix is **wait and retry** — and *not* to start "fixing" a configuration that
  is already correct. Telltale: a fresh change, a `403`/failure that is
  intermittent or resolves on its own.

The single most valuable habit: **before changing anything, classify the
failure.** A `403` seconds after a correct grant is propagation, not a bug;
"no matching federated identity" is never fixed by adding a role; a
missing role is never fixed by touching federation.

### Reading a 403: role vs. scope vs. principal

When you have decided it *is* an authz `403`, three sub-causes remain (all from
module 04):

- **Wrong/no role** — the identity has no role that permits the action.
- **Right role, wrong scope** — the role exists but on a different resource than
  the one being accessed (the vault-A-vs-vault-B case from module 04).
- **Right role, wrong principal** — the grant was keyed to the `clientId` or a
  different object than the runtime identity presents (the `principalId` vs
  `clientId` trap from module 02/06).

One command settles all three:
`az role assignment list --assignee <principalId> --scope <target-resource-id> --all`.
Empty → no role at that scope. Present at a broader scope only → check
inheritance. Present but you granted a different ID → principal mismatch.

### Diagnosing federation failures specifically

A federation (authn) failure is diagnosed by comparing **what the token
presented** against **what you configured**:

- Get the **subject the workload actually used**: from the GitHub Actions run
  logs (the `azure/login` step prints the subject on failure), or for AKS from the
  projected token's claims.
- List **what you configured**: `az identity federated-credential list
  --identity-name <id> --resource-group <rg>` (or `az ad app federated-credential
  list`), and read off issuer/subject/audience.
- **They must match exactly.** A different branch, a `pull_request` vs a
  `ref:refs/heads/main`, a wrong namespace/SA, a typo, or the wrong issuer URL —
  any single mismatch means "no matching federated identity." This is the module
  03 failure, now with a repeatable diagnostic.

### Auditing: proving who can do what, after the fact

Beyond firefighting, you audit *proactively* — the capstone requires a written
trail. Two queries do most of the work:

- **"What can this identity do?"** →
  `az role assignment list --assignee <principalId> --all -o table` (every grant,
  every scope). Run it to justify or prune an identity's power.
- **"Who can touch this resource?"** →
  `az role assignment list --scope <resource-id> --all -o table` (every principal
  with access to this vault/registry/cluster). Run it to answer "who can read this
  secret?"

Together with the sign-in logs (who *actually* authenticated) and the activity
log (who *actually* did what), these let you reconstruct any identity's story —
which is what an audit trail *is*.

## Command reference

| Command | What it does | Example |
|---|---|---|
| `az monitor activity-log list` | Lists control-plane operations, incl. authorization failures | `az monitor activity-log list --resource-group rg-id-audit --max-events 20 -o table` |
| `az role assignment list --assignee` | "What can this identity do" — every grant it holds | `az role assignment list --assignee <principalId> --all -o table` |
| `az role assignment list --scope` | "Who can touch this resource" — every principal with access | `az role assignment list --scope <resourceId> --all -o table` |
| `az identity federated-credential list` | The federated credentials configured on a user-assigned identity (diagnose subject mismatch) | `az identity federated-credential list --identity-name uami --resource-group rg -o jsonc` |
| `az ad app federated-credential list` | Same, for an app registration | `az ad app federated-credential list --id <app-id> -o jsonc` |
| `az rest --url <graph sign-in logs>` | Reads Entra ID sign-in logs via Graph (needs directory permission) | `az rest --method GET --url "https://graph.microsoft.com/v1.0/auditLogs/signIns?\$top=10"` |
| `az role assignment list --include-inherited` | Shows assignments inherited from broader scopes (diagnose scope issues) | `az role assignment list --scope <resourceId> --include-inherited -o table` |

Flag-by-flag breakdowns:

`az role assignment list --assignee <principalId> --scope <target-resource-id> --all`
- `--assignee` — the runtime identity's **principalId**. An empty result here for the exact `--scope` you are debugging is the smoking gun for an authz `403`.
- `--scope` — the specific resource being accessed. Combined with `--assignee`, this answers "does *this identity* have *any* grant on *this exact resource*."
- `--all` — includes assignments at all scopes visible, not just the default filter — needed so you do not miss an inherited grant.

`az monitor activity-log list --resource-group rg-id-audit --max-events 20 --query "[?authorization.action!=null].{op:operationName.value, status:status.value, caller:caller}" -o table`
- `--resource-group` — narrows the log to the resources you are debugging.
- `--query "[?...]"` — projects operation, status, and caller so an `AuthorizationFailed` and the principal that hit it jump out — the activity-log view of an authz failure.

`az rest --method GET --url "https://graph.microsoft.com/v1.0/auditLogs/signIns?\$top=10&\$filter=status/errorCode ne 0"`
- `$filter=status/errorCode ne 0` — returns only **failed** sign-ins, i.e. authentication failures (including federation "no matching credential"). A `403` calling this endpoint means your account lacks the directory role to read sign-in logs — itself an authz answer.

## Hands-on exercises

1. **Set up an identity and a target to generate real log entries.**
   ```powershell
   az group create --name rg-id-audit --location eastus
   az identity create --name uami-audit --resource-group rg-id-audit --location eastus
   $pid = az identity show --name uami-audit --resource-group rg-id-audit --query principalId -o tsv
   $kv = "kvaudit$((Get-Random -Max 9999))"
   az keyvault create --name $kv --resource-group rg-id-audit --location eastus --enable-rbac-authorization true
   az keyvault secret set --vault-name $kv --name audit-secret --value "watch-the-logs"
   $vaultId = az keyvault show --name $kv --resource-group rg-id-audit --query id -o tsv
   ```

2. **"What can this identity do?" — before any grant.** Run
   `az role assignment list --assignee $pid --all -o table`. Verify: **empty** —
   the identity exists but is authorized for nothing. This is the baseline an
   authz `403` starts from.

3. **"Who can touch this vault?"** Run
   `az role assignment list --scope $vaultId --all -o table`. Verify: you (and
   whatever inherited admin grants exist) appear, but `uami-audit` does not — it
   has no access to this vault yet. These two queries (exercises 2 and 3) are your
   core audit tools.

4. **Grant, then re-audit both directions.** Grant `Key Vault Secrets User` on the
   vault, then re-run both queries. Verify: the identity's "what can it do" list
   now shows the vault grant, and the vault's "who can touch it" list now includes
   `uami-audit`. You can now *prove* the grant from both perspectives — the essence
   of an audit trail.

5. **Read the activity log for a control-plane operation.** Run
   `az monitor activity-log list --resource-group rg-id-audit --max-events 20 -o table`.
   Verify: your recent operations (identity create, keyvault create, role
   assignment create) appear with a caller and status. This is where authz
   *failures* would also show up as `AuthorizationFailed`.

6. **Diagnose-and-fix: classify a 403 as role vs. scope vs. propagation.** Create
   a *second* vault `kv2` with a secret, but grant the identity nothing on it.
   Now walk the method for "the identity can't read `kv2`":
   - Run `az role assignment list --assignee $pid --scope <kv2-id> --all`. **Empty
     → authz, missing role at this scope.** Contrast with `--scope $vaultId`
     (vault 1), which is populated — so it is specifically a **wrong-scope**
     situation (right role on vault 1, none on vault 2), the module-04 case.
   - **Fix** by granting `Key Vault Secrets User` on `kv2`, then immediately
     re-test. If it still `403`s *right after granting*, **do not re-fix** —
     classify it as **propagation delay**, wait ~2 minutes, and retry; it should
     then succeed with no further change. Verify you can articulate: first failure
     = wrong scope (real), second (transient) = propagation (not real).

7. **Diagnose-and-fix: federation subject mismatch, read from the config.** Add a
   GitHub federated credential to `uami-audit` for `ref:refs/heads/main`, then
   *inspect* it as if debugging a failed pipeline:
   ```powershell
   az identity federated-credential list --identity-name uami-audit --resource-group rg-id-audit -o jsonc
   ```
   **Diagnose the scenario:** a pipeline that failed with "no matching federated
   identity" was triggered from a `pull_request`, whose subject is
   `repo:<org>/<repo>:pull_request` — which does **not** match the configured
   `...:ref:refs/heads/main`. Confirm by comparing the two strings. **Fix:** either
   run the job in the federated context (`main`) or add a federated credential for
   the pull-request subject. Verify you did **not** touch any role assignment —
   this was purely an **authn** problem, and adding a role would have been the
   wrong instinct.

8. **Diagnose-and-fix: the misleading "it fixed itself."** Grant a *fresh* role
   (e.g. `Reader` at the RG scope) and *immediately* attempt an action that needs
   it. If it fails, resist changing anything: note the time, wait, retry. Verify:
   it succeeds on retry with **zero** configuration change. **Diagnose:** this was
   **propagation delay** all along — had you "fixed" it by re-granting at a broader
   scope, you would have introduced a real over-grant to solve a non-problem. Write
   down the rule: *a fresh, correct grant that fails then succeeds unchanged was
   never broken.*

9. **Attempt to read sign-in logs (permission-dependent).** Run
   `az rest --method GET --url "https://graph.microsoft.com/v1.0/auditLogs/signIns?\$top=5" -o jsonc`.
   Verify one of: you see sign-in records (each with an `appDisplayName`,
   `status.errorCode`, and any applied CA policies — where you would confirm a
   federation authn failure or a CA block), **or** a `403` because your account
   lacks the directory role. Note which, and that the `403` is itself an
   authorization answer about *your* directory rights.

10. **Clean up.** `az group delete --name rg-id-audit --yes --no-wait`; confirm
    no assignments linger for `$pid`. Purge the vaults if you want the names back.

## Independent challenge

Take any *working* identity setup you built earlier in this track (module 03's
federated pipeline, module 06's chain, or a fresh one) and deliberately introduce
**one** of the three failure classes without telling yourself which — then
practice the triage cold: reproduce the failure, capture its exact signature, and
*classify it before touching anything* as missing-role (authz), missing/mismatched-
federated-credential (authn), or propagation (non-failure). Prove your
classification with the diagnostic query for that class (`az role assignment list
--assignee ... --scope ...` for authz, `az identity federated-credential list` for
authn, a timed retry for propagation) *before* applying the fix, and write a
short incident note: signature → class → evidence → fix. Draw on module 03
(federation), module 04 (scope), and this module's method. The deliverable is the
incident note demonstrating you diagnosed by *evidence*, not by guessing — exactly
the discipline [11-security-deep-dive](../../11-security-deep-dive/README.md)'s
incident-response module asked for, applied to identity.

<details>
<summary>Stuck? One hint</summary>

Force yourself to answer one question first: **did the identity get a token?** If
the failure is "no matching federated identity" / a sign-in-log failure, it never
got a token → **authn** → look at `az identity federated-credential list` and
compare subjects. If it got a token but the resource call is `403` →
**authz** → run `az role assignment list --assignee <principalId> --scope
<resource-id>` and see whether the grant is absent (wrong role/scope) or present
(then suspect **propagation** and just wait). Never apply a fix from one class to
a failure from another.

</details>

## Common mistakes & troubleshooting

- **Adding a role to fix a federation failure.** "No matching federated identity"
  is authn — no role assignment will ever fix it. Compare configured vs. presented
  **subject** instead.
- **"Fixing" propagation delay.** A correct, fresh grant that fails then succeeds
  unchanged was never broken. Re-granting at a broader scope to "make it work"
  creates a real over-grant. Wait and retry first.
- **Checking the wrong log.** Sign-in logs = authentication; activity log =
  authorization. Looking for a `403 AuthorizationFailed` in sign-in logs (or a
  federation error in the activity log) wastes time.
- **Ignoring scope and principal when reading a 403.** A `403` can be no role,
  right role at the wrong scope, or a grant keyed to the wrong ID. Use `az role
  assignment list --assignee <principalId> --scope <resource>` to distinguish, and
  remember `--include-inherited` for scope-inheritance cases.
- **Assuming you can read sign-in logs.** It needs a directory role; a `403` from
  the Graph audit endpoint means *your* account lacks the permission, not that
  there is nothing to see.
- **Not keeping an audit trail.** Without a written record of who was granted what
  and why, every incident is archaeology. The two `role assignment list` queries
  are your reconstruction tools — but a proactive trail is far cheaper than
  reconstruction.

## Checkpoint quiz

Write down your answer to each question before expanding it — checking without attempting first is the single easiest way to fool yourself into thinking you've learned this.

1. Which log records **authentication** events and which records **authorization**
   / control-plane operations, and which do you check to confirm "did this
   identity get a token at all"?
2. Name the three failure classes that most identity problems fall into, and the
   one-line fix for each.
3. A `403 AuthorizationFailed` appears on a resource call, but the sign-in
   succeeded. Which class is it, and which single command narrows role-vs-scope-vs-
   principal?
4. A pipeline fails with "no matching federated identity record found." Which
   class, which log/command do you use, and what are you comparing?
5. A brand-new, correctly-scoped role assignment fails immediately, then succeeds
   two minutes later with no changes. What was it, and what is the danger of
   "fixing" it?
6. Give the two `az role assignment list` queries that answer "what can this
   identity do?" and "who can touch this resource?", and say why an audit needs
   both.
7. You get a `403` when calling the Microsoft Graph sign-in logs endpoint. What
   does that tell you, and is it about the resource you were originally debugging?

<details>
<summary>Show answers</summary>

1. **Entra ID sign-in logs** record authentication events; the **Azure activity
   log** records authorization/control-plane operations. Check the **sign-in
   logs** to confirm whether the identity got a token.
2. **Missing/mis-scoped role (authz)** → add/scope the role assignment.
   **Missing/mismatched federated credential (authn)** → fix the credential's
   issuer/subject/audience. **Propagation delay (not a real failure)** → wait and
   retry.
3. **Authz.** `az role assignment list --assignee <principalId> --scope
   <resource-id> --all` — empty means no role at that scope, present-at-broader
   scope means check inheritance, present-but-wrong-ID means a principal mismatch.
4. **Authentication** (federation). Use `az identity federated-credential list`
   (or the app variant) and/or the sign-in logs, and compare the **subject the
   workload presented** against the **subject you configured** (plus issuer/
   audience) — they must match exactly.
5. **Propagation delay** — the assignment was correct but not yet effective. The
   danger of "fixing" it is introducing a real misconfiguration (e.g. a broader
   grant) to solve a problem that never existed.
6. `az role assignment list --assignee <principalId> --all` ("what can this
   identity do") and `az role assignment list --scope <resource-id> --all` ("who
   can touch this resource"). An audit needs both because one proves an identity's
   total power and the other proves a resource's total exposure.
7. It tells you **your account lacks the directory role** to read sign-in logs —
   an authorization answer about *your* permissions on the directory. It is **not**
   about the resource you were originally debugging.

</details>

## Next

[08-capstone-project](../08-capstone-project/README.md) — put every mechanism
together: a secretless GitHub Actions pipeline, Terraform creating a
user-assigned identity, an AKS pod using it via workload identity federation to
read Key Vault, least-privilege roles at every step, and a written audit trail.
