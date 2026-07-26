# Conditional Access and Identity Protection

## Why this matters

Everything so far answered "who is this identity and what may it do." This module
answers a different question: **under what conditions is a sign-in even
permitted?** Conditional access, MFA, and risk-based access are the controls that
sit *in front of* authentication — deciding whether to allow a login, require a
second factor, or block it outright based on *who, from where, on what device,
and how risky*. As a platform engineer you rarely *author* these policies (that
is an identity-admin role), but they constantly *affect your workflows* — a
conditional access policy is why your `az login` suddenly demands MFA, or why a
service principal keeps working from a pipeline where an interactive login would
be challenged. This is a **survey**: enough to recognize these controls, work
with them, and know their blast radius, not a full identity-governance course.

## Concepts

### MFA: something you have on top of something you know

**Multi-factor authentication (MFA)** requires a second proof of identity beyond
a password — an authenticator app prompt, a hardware token, a passkey — so a
stolen password alone is not enough to sign in. Conceptually it strengthens the
**authentication** step (module 00): even a correct password yields no token
until the second factor is satisfied. For a platform engineer the practical
points are: (1) MFA applies to **human/interactive** sign-ins, which is why your
`az login` may prompt for it; (2) it generally does **not** apply to
**non-interactive** service principal or managed identity or workload-identity-
federation authentication, because those present cryptographic proof rather than
a password — one more reason machine workloads should use those mechanisms rather
than a human-style credential; and (3) requiring MFA is one of the most common
*conditional access* controls, below.

### Conditional access: if-this-then-require-that

A **conditional access (CA) policy** is a rule of the form *"**if** a sign-in
matches these conditions, **then** grant/require/block."* The **conditions**
(signals) can include: which **users/groups**, which **cloud app** is being
accessed, **location** (IP range / country), **device state** (managed/compliant
or not), **client app** (browser vs. legacy protocol), and **sign-in risk**
(below). The **controls** can include: require **MFA**, require a **compliant/
hybrid-joined device**, **block** access, or require a **password change**.

Example policies you will encounter: *"require MFA for all admins,"* *"block
legacy authentication protocols,"* *"require a compliant device to reach the
Azure portal,"* *"block sign-ins from outside approved countries."* CA is
enforced at the **authentication** boundary — it decides whether a token is
issued at all — which is *before* the RBAC authorization from module 04 ever runs.
So a CA block and an RBAC `403` are different failures at different stages, and
telling them apart matters (module 07).

### Identity protection and risk-based access

**Identity Protection** adds **risk signals** to conditional access. It
continuously evaluates sign-ins and users for anomalies and assigns a **risk
level**:

- **Sign-in risk** — is *this particular sign-in* suspicious? (impossible travel,
  anonymous/Tor IP, unfamiliar sign-in properties, a password seen in a known
  leak).
- **User risk** — is *this account* likely compromised overall? (leaked
  credentials found, a pattern of risky activity).

**Risk-based conditional access** then acts on those signals: *"if sign-in risk
is high, require MFA,"* or *"if user risk is high, require a secure password
change or block until an admin reviews."* This is the "risk-based access" from
the track outline — automated responses to *likelihood of compromise*, not just
static conditions. (These capabilities require the appropriate Entra ID premium
licensing; the concepts matter regardless of whether your tenant has them
enabled.)

### How this affects you as a platform engineer

You will mostly *encounter* these policies rather than write them, so know the
practical implications:

- **Your interactive `az login` may be challenged** — MFA prompts, device-code
  flows, or outright blocks from a disallowed network. This is a CA policy doing
  its job, not a broken CLI.
- **Break-glass / emergency-access accounts** are deliberately *excluded* from CA
  policies so an over-aggressive policy cannot lock every admin out of the tenant.
  Knowing they exist explains why "MFA required for all users" usually has a
  carve-out.
- **Automation should not depend on interactive human auth.** A pipeline that
  logs in as a human user will eventually be broken by an MFA or device
  requirement. This is *another* argument for the machine mechanisms from modules
  01-03 — a service principal, managed identity, or workload identity federation
  is not subject to interactive MFA, so it keeps working non-interactively (which
  is exactly why it must be least-privileged, per module 04).
- **A CA block looks different from an RBAC `403`.** CA failures happen at
  *sign-in* ("access has been blocked by conditional access policy" /
  `AADSTS53003`), before any resource call. RBAC `403`s happen *after* a
  successful sign-in, on a specific resource action. Same instinct as every prior
  module: figure out whether you failed to authenticate or failed to be
  authorized.

## Command reference

> Conditional access and Identity Protection are primarily configured in the
> Entra admin center (portal) or via Microsoft Graph, and typically require an
> Identity administrator role and premium licensing — as a platform engineer you
> mostly *read* and *diagnose* these. The commands below are the read/diagnose
> surface you will actually use.

| Command | What it does | Example |
|---|---|---|
| `az ad signed-in-user show` | Confirms which identity you authenticated as (after any CA/MFA challenge) | `az ad signed-in-user show --query userPrincipalName -o tsv` |
| `az login` | Interactive login — the thing CA/MFA policies challenge | `az login --tenant <tenant-id>` |
| `az login --use-device-code` | Device-code flow, used when the default browser flow is blocked/unavailable | `az login --use-device-code` |
| `az login --service-principal` | Non-interactive SP login — generally *not* subject to interactive MFA | `az login --service-principal -u <appId> -p <secret> --tenant <tenant>` |
| `az rest --url <graph-url>` | Reads Graph resources (e.g. CA policies) when you have permission | `az rest --method GET --url "https://graph.microsoft.com/v1.0/identity/conditionalAccess/policies"` |

Flag-by-flag breakdowns:

`az login --tenant <tenant-id>`
- `--tenant` — forces authentication against a specific tenant. If a CA policy scoped to that tenant requires MFA, this is where you get prompted; specifying the tenant avoids landing in the wrong directory and misreading a policy block.

`az login --use-device-code`
- `--use-device-code` — switches to a code-you-paste-into-a-browser flow. Useful when the automatic browser handoff fails (headless/remote/WSL sessions), and it still honors MFA/CA challenges — the challenge just happens in the browser you complete the code in.

`az rest --method GET --url "https://graph.microsoft.com/v1.0/identity/conditionalAccess/policies"`
- `--method` / `--url` — a raw Microsoft Graph call. Reading CA policies requires directory permission (e.g. an Identity Reader/admin role); on a restricted tenant this returns a `403`, which is itself informative about your directory rights.

## Hands-on exercises

> These exercises are **survey/observation** oriented — several depend on your
> tenant's licensing and your directory role. Where you cannot perform an action,
> the exercise says what to *observe or reason about* instead. None create
> billable resources.

1. **Observe your own sign-in requirements.** Run `az logout` then `az login`.
   Verify: note whether you are prompted for MFA, a device, or a specific
   browser flow. Whatever happens is a conditional-access-and-authentication
   experience — write down which factors you were asked for.

2. **Contrast interactive vs. non-interactive auth.** If you still have a service
   principal from module 01 (or create a throwaway), log in with it
   (`az login --service-principal ...`). Verify: the SP login completes with **no
   MFA prompt** even if your user login required one — non-interactive machine
   auth is not subject to interactive MFA. Reason about why this makes SP/managed-
   identity/WIF the right choice for automation (and why they must therefore be
   least-privileged).

3. **Try the device-code flow.** Run `az login --use-device-code`. Verify: you
   get a code and a URL instead of an automatic browser handoff, complete it, and
   note that any MFA/CA challenge still applies inside that browser step. This is
   the flow to know for headless/WSL/remote sessions.

4. **Read the conditional access policies (if permitted).** Run
   `az rest --method GET --url "https://graph.microsoft.com/v1.0/identity/conditionalAccess/policies" -o jsonc`.
   Verify one of two outcomes: either you see policy objects (each with
   `conditions` and `grantControls` — the if/then structure from the concepts), or
   you get a `403` because your account lacks the directory role. **Both are
   informative:** the `403` here is an *authorization* failure on the *directory*,
   the same authn/authz split as always, just against Microsoft Graph.

5. **Map a policy to its if/then, on paper.** Whether you read a real policy in
   exercise 4 or use the example "require MFA for all admins," decompose it into
   its **conditions** (users = admins group; cloud app = all) and its **controls**
   (require MFA). Verify: you can state, for any CA policy, "if these signals,
   then require/block this."

6. **Predict the failure signature of a CA block vs. an RBAC 403.** Without
   triggering a real block, write down the exact difference: a CA block appears at
   **sign-in** (e.g. "access blocked by conditional access policy" /
   `AADSTS53003`) with no resource call attempted; an RBAC `403` appears **after**
   a successful sign-in on a specific resource action. Verify against module 04's
   `403` experience — you already produced the RBAC side.

7. **Diagnose-and-fix: automation broken by an interactive requirement (reasoned
   scenario).** Scenario: a scheduled job authenticated as a *human user* worked
   for months, then started failing at login with a conditional-access/MFA error
   after a new "require MFA for all users" policy shipped. **Diagnose:** the job
   depends on **interactive** human auth, which a CA/MFA policy now challenges — a
   non-interactive job cannot satisfy an interactive second factor, so it fails at
   the **authentication** stage (not a `403`). **Fix:** stop using a human
   identity for automation — switch the job to a **service principal, managed
   identity, or workload identity federation** (modules 01-03), which are not
   subject to interactive MFA, and grant that identity the least-privilege role it
   needs (module 04). Write out why this is the correct fix rather than
   "exempt the user from MFA," which would weaken security for a human account.

8. **Locate where a real sign-in failure would be recorded.** Note (for module 07)
   that CA/MFA outcomes are captured in **Entra ID sign-in logs**, where each
   sign-in shows the applied CA policies and the result. Verify you know the
   destination: the sign-in logs are where you confirm *"was this a CA block?"*
   before assuming an app bug — the exact skill module 07 develops.

## Independent challenge

Design (on paper — you are not expected to have admin rights to deploy it) a
minimal conditional-access posture for a small platform team, and justify every
policy in terms of blast radius and the automation implications from this module.
Decide: which human roles must have MFA, whether you would require compliant
devices for portal access, what you would do about a high-risk sign-in, and —
critically — how you keep all of it from breaking the machine identities your
pipelines and clusters depend on (drawing on modules 01-03 for why those are not
subject to interactive challenges, and module 04 for why they must still be
least-privileged). Include a **break-glass account** in your design and explain
why it is excluded from the policies. The deliverable is a short policy table
(policy → conditions → control → who/what it must NOT break) plus a paragraph on
why over-aggressive conditional access can be its own outage risk.

<details>
<summary>Stuck? One hint</summary>

The trap in this design is locking out either yourself or your automation. Two
guardrails prevent it: (1) a **break-glass** admin account explicitly *excluded*
from every CA policy, so a bad policy can never lock all admins out of the
tenant; and (2) routing all automation through **non-interactive** machine
identities (SP/managed identity/WIF), which interactive MFA and device controls
do not challenge — so a "require MFA for all users" policy scoped to *humans*
never touches your pipelines. Every policy row should name what it must not
break.

</details>

## Common mistakes & troubleshooting

- **Mistaking a conditional-access block for an application or RBAC error.** A CA
  block happens at **sign-in** (`AADSTS53003`, "blocked by conditional access"),
  before any resource call — not a `403` on a resource. Check the sign-in logs,
  not the app.
- **Running automation as a human identity.** It will eventually be broken by an
  MFA/device/CA requirement. Use a service principal, managed identity, or WIF for
  anything non-interactive.
- **"Fixing" a broken automation by weakening a human's MFA.** Exempting a human
  account from MFA to unblock a job trades security for convenience on the wrong
  identity. The fix is a machine identity, not a weaker human one.
- **Forgetting break-glass accounts.** A "require MFA for all users" policy with
  no exclusions can lock every admin out if MFA infrastructure fails. Excluded,
  monitored emergency-access accounts are standard practice.
- **Assuming machine identities are MFA-protected.** They are not subject to
  *interactive* MFA — which is exactly why their role assignments must be tight
  (module 04) and their credentials modern (managed identity / WIF over stored
  secrets).
- **Expecting CLI access to CA policies on a locked-down tenant.** Reading CA
  policies needs a directory role; a `403` from Graph means your account lacks it,
  not that no policies exist.

## Checkpoint quiz

Write down your answer to each question before expanding it — checking without attempting first is the single easiest way to fool yourself into thinking you've learned this.

1. What does MFA add to the authentication step, and does it typically apply to
   non-interactive service principal / managed identity sign-ins?
2. State the general form of a conditional access policy, and name three
   conditions and two controls it can use.
3. At which stage — authentication or authorization — is conditional access
   enforced, and how does a CA block therefore differ from an RBAC `403`?
4. What is the difference between **sign-in risk** and **user risk** in Identity
   Protection?
5. A scheduled job that logged in as a human user starts failing after a new MFA
   policy ships. What is the root cause, and what is the correct fix (and the
   tempting wrong one)?
6. Why do "require MFA for all users" policies usually exclude a break-glass
   account?
7. Give the practical reason a platform engineer prefers machine identities
   (SP/managed identity/WIF) for automation, framed in terms of conditional
   access.

<details>
<summary>Show answers</summary>

1. MFA requires a **second proof of identity** beyond a password, so a stolen
   password alone yields no token. It typically **does not** apply to
   non-interactive SP/managed-identity/WIF auth, because those present
   cryptographic proof rather than an interactive password + factor.
2. Form: **"if a sign-in matches these conditions, then grant/require/block."**
   Conditions (any three): users/groups, cloud app, location, device state,
   client app, sign-in risk. Controls (any two): require MFA, require a compliant
   device, block access, require password change.
3. It is enforced at the **authentication** boundary (whether a token is issued
   at all), *before* RBAC runs. So a CA block appears at **sign-in**
   (`AADSTS53003`) with no resource call, whereas an RBAC `403` appears **after**
   a successful sign-in on a specific resource action.
4. **Sign-in risk** = how suspicious *this particular sign-in* is (impossible
   travel, anonymous IP, leaked password). **User risk** = how likely *the
   account overall* is compromised (leaked credentials, pattern of risky
   activity).
5. Root cause: the job relies on **interactive human auth**, which the new MFA/CA
   policy now challenges and a non-interactive job cannot satisfy — an
   **authentication**-stage failure. Correct fix: move the job to a **machine
   identity** (SP/managed identity/WIF) with a least-privilege role. Tempting
   wrong fix: exempt the human user from MFA, weakening a human account's security.
6. So that a failure or misconfiguration in MFA/CA cannot lock **every** admin out
   of the tenant — the excluded, closely monitored emergency-access account is the
   way back in.
7. Machine identities are **not subject to interactive MFA/device conditional
   access**, so they keep working non-interactively when human-oriented CA
   policies ship — which is exactly why their permissions must be tightly scoped
   (module 04).

</details>

## Next

[06-cross-resource-identity-patterns](../06-cross-resource-identity-patterns/README.md)
— assembling everything from modules 00-05 into one mental map: a Terraform
pipeline, an AKS pod, and a Container App each authenticating correctly across
resource boundaries.
