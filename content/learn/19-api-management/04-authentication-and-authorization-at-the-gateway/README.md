# Authentication & Authorization at the Gateway

## Why this matters

A subscription key answers "which consumer is this?" but not "is this a real,
authenticated user/app allowed to do this?" For that you validate a **token** —
and doing it at the gateway means every backend behind APIM is protected without
each one reimplementing auth. This is where the identity work from track 16 pays
off directly: the same Entra ID token you learned to reason about (issuer,
audience, scopes, signature) gets validated by a single APIM policy before any
request touches your Container App. Get the audience/issuer right and the gateway
is your auth chokepoint; get them wrong and you either reject valid callers or
wave through invalid ones.

## Concepts

### Two different questions: identification vs. authentication

Keep these apart. A **subscription key** *identifies* a consumer for metering and
throttling — it's a shared secret tied to a subscription, not proof of a user's
identity, and it's fine for "which plan is this call on." **Token
authentication** (OAuth2/JWT) *proves* the caller is a specific authenticated
user or application, with **scopes/roles** describing what they're allowed to do.
Mature APIs use **both**: the key for the product/metering layer, the token for
identity/authorization. A common design is subscription key optional-or-off for
first-party callers who present a strong Entra ID token, and required for
partners on a metered plan. Decide per API which layers apply.

### Anatomy of the token you're validating (recap from track 16)

The token is a **JWT** — three base64url parts (`header.payload.signature`). The
parts that matter to a gateway policy:

- **`iss` (issuer)** — who minted the token, e.g.
  `https://login.microsoftonline.com/<tenant-id>/v2.0`. Must match the tenant you
  trust.
- **`aud` (audience)** — who the token is *for*: your API's app ID URI or client
  id. **This is the field people get wrong most often** — a token minted for a
  different audience is a valid token but not for *you*.
- **`exp`/`nbf`** — expiry / not-before; the policy rejects expired or
  not-yet-valid tokens automatically.
- **scopes (`scp`) / roles (`roles`)** — what the caller may do; you assert
  required ones in the policy.
- **signature** — signed with Entra's keys; APIM fetches the tenant's public keys
  from the **OpenID configuration / JWKS endpoint** to verify it. This is the same
  token shape and the same Entra ID issuer you learned to dissect in **track 16** —
  the gateway just checks it mechanically on every request.

### The `validate-jwt` policy

`validate-jwt` is an **inbound** policy (module 03's pipeline) that verifies the
token before the backend is called. You give it: where to find the token
(`Authorization: Bearer` header, by default), the **OpenID metadata URL** (so it
can fetch signing keys and the issuer), the **audiences** you accept, the
**issuers** you trust, and optionally **required claims** (scopes/roles). If any
check fails, the policy short-circuits with **401** (missing/invalid token) or
**403** (valid token, insufficient claims) — and the request never reaches your
Container App. Because it runs at the gateway, your backend can trust that
anything it receives already passed token validation (defense in depth still
applies, but the edge is covered).

### The two failure modes: 401 vs. 403, and the audience/issuer trap

Distinguish crisply:

- **401 Unauthorized** — no token, malformed token, bad signature, expired, or
  **audience/issuer mismatch**. The token isn't acceptable *at all* for this API.
- **403 Forbidden** — token is valid and for you, but it lacks a **required
  scope/role** you asserted. Authenticated but not authorized.

The single most common real bug: you configure `<audience>` with the wrong value
(e.g. the client id instead of the app ID URI, or a `v1` vs `v2` audience
mismatch), and **every valid token is rejected with 401** even though nothing is
actually wrong with the tokens. You'll reproduce and fix exactly this — it's the
gateway analogue of track 16's "the token is fine, the *relying party config* is
wrong."

### Client certificate authentication (mutual TLS)

For machine-to-machine callers where you'd rather not manage tokens, APIM
supports **client certificate (mTLS)** auth: the caller presents a client cert
during the TLS handshake, and a `validate-client-certificate` policy (or context
checks on `context.Request.Certificate`) verifies its thumbprint, issuer, or
subject against values you trust. This is the same "prove identity with a
certificate rather than a bearer secret" idea behind mesh mTLS (track 13), but
here it's *north-south* at the product edge rather than *east-west* between
services. It's common for partner integrations and is a survey-level topic here —
know it exists, know when you'd reach for it (long-lived B2B callers, no user
context), and know it's configured at the gateway, not the backend.

## Command reference

Auth is mostly policy XML plus an Entra ID app registration. The registration
uses `az ad` (from track 16); the validation uses a `validate-jwt` inbound policy.

| Command | What it does | Example |
|---------|--------------|---------|
| `az ad app create` | Register an Entra ID app (the API's identity/audience) | `az ad app create --display-name "orders-api"` |
| `az account get-access-token` | Get a real Entra ID token to test with | `az account get-access-token --resource api://<app-id> --query accessToken -o tsv` |
| `az apim api policy create` | Apply the `validate-jwt` policy to the API | `az apim api policy create --resource-group rg --service-name <inst> --api-id orders --policy-format xml --value "@jwt.xml"` |
| `az apim api update` (`--subscription-required`) | Turn the subscription-key requirement on/off | `az apim api update --resource-group rg --service-name <inst> --api-id orders --subscription-required false` |

`validate-jwt` policy explained:
```xml
<inbound>
  <base />
  <validate-jwt header-name="Authorization" failed-validation-httpcode="401"
                failed-validation-error-message="Invalid or missing token">
    <openid-config url="https://login.microsoftonline.com/<tenant-id>/v2.0/.well-known/openid-configuration" />
    <audiences>
      <audience>api://<app-id></audience>
    </audiences>
    <issuers>
      <issuer>https://login.microsoftonline.com/<tenant-id>/v2.0</issuer>
    </issuers>
    <required-claims>
      <claim name="scp" match="any">
        <value>Orders.Read</value>
      </claim>
    </required-claims>
  </validate-jwt>
</inbound>
```
- `header-name="Authorization"` — where the bearer token is read from (default).
- `<openid-config url="...">` — the tenant's OpenID metadata; APIM uses it to
  fetch signing keys (JWKS) and validate the signature and issuer. Using this is
  better than hardcoding keys, which rotate.
- `<audiences><audience>` — the **`aud`** value(s) you accept; **must match** what
  the token was minted for. The #1 misconfiguration.
- `<issuers><issuer>` — the trusted `iss`; the Entra tenant's v2 issuer URL.
- `<required-claims>` with `<claim name="scp" match="any">` — assert the caller
  has at least one of the listed scopes; failing this yields **403**, not 401.
- `failed-validation-httpcode="401"` — the status returned when validation fails.

`az account get-access-token --resource api://<app-id> --query accessToken -o tsv`
- `--resource api://<app-id>` — request a token whose **audience** is your API's
  app ID URI. Point this at the *wrong* resource and you'll get a token that fails
  the audience check — exactly the diagnose-and-fix below.

## Hands-on exercises

> **Time note:** Consumption tier is fine and fast. The slow part here is Entra ID
> propagation (app registrations and token audiences can take a minute). If
> track 16 isn't built yet, the `az ad app create` / `az account get-access-token`
> steps below stand alone — you don't need track 16's modules to run them.

1. **Instance + backend + API.** Same base as before: Consumption APIM, a
   Container App `orders`, an `orders` API with a `GET /` operation, `$key`, `$gw`.

2. **Register an Entra ID app to represent the API.**
   ```powershell
   $app = az ad app create --display-name "orders-api-m04" --query appId -o tsv
   $tenant = az account show --query tenantId -o tsv
   # set an Application ID URI so tokens can target it as audience:
   az ad app update --id $app --identifier-uris "api://$app"
   ```
   Record `$app` (client/app id) and `$tenant`. The audience will be `api://$app`.

3. **Get a real token for the right audience.**
   ```powershell
   $token = az account get-access-token --resource "api://$app" --query accessToken -o tsv
   ```
   Paste the token into <https://jwt.ms> (or decode locally) and **read the `aud`
   and `iss` claims** — confirm `aud` is `api://$app` and `iss` is the v2 issuer
   for `$tenant`. This is the track-16 token you're about to validate.

4. **Apply a `validate-jwt` policy.** Save `jwt.xml` using the template from the
   command reference, substituting `$tenant` and `$app` (drop the
   `<required-claims>` block for now to isolate audience/issuer):
   ```powershell
   az apim api policy create --resource-group rg-apim-m04 --service-name $apim --api-id orders `
     --policy-format xml --value "@jwt.xml"
   ```

5. **Call with a valid token → 200.**
   ```powershell
   curl -H "Ocp-Apim-Subscription-Key: $key" -H "Authorization: Bearer $token" "$gw/orders/"
   ```
   Expect 200 — the gateway validated the signature, issuer, audience, and expiry
   before forwarding.

6. **Call with no token → 401.**
   ```powershell
   curl -i -H "Ocp-Apim-Subscription-Key: $key" "$gw/orders/"
   ```
   Expect **401** with your `failed-validation-error-message`. The subscription
   key alone is no longer enough — identity is now required.

7. **Require a scope and observe 403 vs 401.** Add the `<required-claims>` block
   asserting a scope the token *doesn't* have, re-apply, and call with the valid
   token. Expect **403** (authenticated but missing the required scope) — a
   different failure from the 401 of no token. Remove the claim to restore 200.

8. **Diagnose and fix: valid token rejected due to wrong audience.** This is the
   canonical bug. Edit `jwt.xml` so `<audience>` is a **wrong** value (e.g.
   `api://00000000-0000-0000-0000-000000000000`), re-apply, and call with your
   still-valid token:
   ```powershell
   curl -i -H "Ocp-Apim-Subscription-Key: $key" -H "Authorization: Bearer $token" "$gw/orders/"
   ```
   You get **401 Invalid token** even though the token is genuinely valid.
   **Diagnose:** decode the token (jwt.ms), read its real `aud`, and compare to
   the `<audience>` in the policy — they don't match. **Fix:** set `<audience>`
   back to `api://$app`, re-apply, and confirm 200 returns. Lesson: 401 on a token
   you *know* is valid almost always means an **audience or issuer mismatch in the
   policy**, not a bad token — the exact gateway version of track 16's
   relying-party-config bug.

9. **Bonus — wrong-resource token.** Request a token for a *different* resource
   (`--resource https://graph.microsoft.com`) and call with the correct policy.
   Confirm 401: the token is real but its `aud` is Graph, not your API. This shows
   the failure from the *token* side rather than the *policy* side.

10. **Cleanup.**
    ```powershell
    az group delete --name rg-apim-m04 --yes --no-wait
    az ad app delete --id $app
    ```
    (Delete the app registration too — it's free but leaving orphaned app regs
    around is untidy and a minor security-hygiene issue from track 16.)

## Independent challenge

Protect an API with **both** layers: a subscription key *and* a `validate-jwt`
policy that accepts only Entra ID tokens for your API's audience and issuer, and
requires a specific scope. Prove all four outcomes with real `curl` calls: (a)
valid key + valid token + right scope → 200; (b) valid key, no token → 401; (c)
valid key + valid token missing the scope → 403; (d) valid key + a token minted
for the *wrong audience* → 401. Then, drawing on **track 16**'s token model,
write a short note explaining for each 401/403 which specific claim or check
failed and where you'd look first. Finish by reproducing the wrong-audience bug
once more and fixing it from memory. Delete the resource group and the app
registration afterward.

<details><summary>Stuck? One hint</summary>

Decode every token at jwt.ms before you blame the policy. Line up three things:
the token's `aud`/`iss`/`scp` claims, the `<audiences>`/`<issuers>`/
`<required-claims>` in your policy, and the HTTP status you got. A 401 means
`aud`/`iss`/signature/expiry didn't line up (usually **audience**); a 403 means
they did but a **required scope** was absent. The bug is almost never a "bad
token" — it's a mismatch between what the token says and what the policy demands.

</details>

## Common mistakes & troubleshooting

- **Audience mismatch → 401 on valid tokens.** The most common APIM auth bug.
  The `<audience>` in the policy must equal the token's `aud`. Decode the token
  and compare; don't guess.
- **Issuer version mismatch (`v1` vs `v2`).** Entra can issue v1
  (`sts.windows.net/<tenant>/`) or v2 (`login.microsoftonline.com/<tenant>/v2.0`)
  issuers/audiences depending on the app config. Match the policy to the token
  you actually receive.
- **Confusing 401 and 403.** 401 = token unacceptable (missing/invalid/wrong
  audience/expired). 403 = valid token, missing required scope/role. They point
  at different fixes.
- **Relying on the subscription key for identity.** The key identifies a plan,
  not a user/app. Use a token for real authentication; keep the key for
  metering/throttling.
- **Hardcoding signing keys.** Use `<openid-config>` so APIM fetches current JWKS;
  Entra rotates keys and a hardcoded key breaks silently later.
- **Forgetting Entra propagation.** A new app registration or identifier URI can
  take a minute to be usable; a token request right after creating the app may
  fail transiently. Wait and retry.
- **Cost pitfall.** App registrations and `validate-jwt` are free, but this is a
  place people leave a **Developer-tier instance** running while fiddling with
  Entra config over hours. If you're on a classic tier for any reason, watch the
  clock and delete same-day; prefer Consumption, which idles free.

## Checkpoint quiz

Write down your answer to each question before expanding it — checking without
attempting first is the single easiest way to fool yourself into thinking
you've learned this.

1. What does a subscription key prove vs. what does a JWT prove? Why use both?
2. Which JWT claim is the audience, and why is it the most common source of a
   valid-token-rejected bug?
3. In `validate-jwt`, what is `<openid-config>` for, and why is it better than
   listing signing keys?
4. Distinguish the conditions that yield 401 vs. 403 from `validate-jwt`.
5. You have a token you *know* is valid but APIM returns 401. What's the first
   thing to check?
6. Where in the policy pipeline does `validate-jwt` run, and what does that mean
   for the backend?
7. When would you reach for client-certificate auth instead of JWT, and which
   prior track is it conceptually related to?
8. How do you get a real Entra ID token targeting your API's audience from the
   CLI, and how do you inspect its claims?

<details><summary>Show answers</summary>

1. A subscription key proves *which consumer/plan* is calling (metering/
   throttling); a JWT proves the *authenticated identity* of a user/app and, via
   scopes/roles, what they may do. Use both to separate the product/metering
   layer from the identity/authorization layer.
2. **`aud`**. A token minted for a different audience is otherwise valid but not
   for your API; if the policy's `<audience>` doesn't match the token's `aud`,
   every valid token is rejected with 401.
3. It points at the tenant's OpenID metadata so APIM fetches current signing keys
   (JWKS) and the issuer. Better than hardcoded keys because Entra rotates keys —
   hardcoded ones break silently.
4. **401**: missing/malformed/expired token, bad signature, or audience/issuer
   mismatch. **403**: valid token but missing a required scope/role.
5. The **audience** (and issuer) in the policy vs. the token's actual `aud`/`iss` —
   decode the token (jwt.ms) and compare. It's almost always a policy/config
   mismatch, not a bad token.
6. In **`<inbound>`**, before the backend call. The backend can therefore trust
   that anything it receives already passed token validation at the edge.
7. For machine-to-machine/partner callers with no user context where you'd rather
   present a certificate than manage bearer tokens. Conceptually related to
   **track 13**'s mesh mTLS (proving identity with a cert), but north-south at
   the product edge.
8. `az account get-access-token --resource api://<app-id> --query accessToken -o
   tsv`; inspect it by decoding at jwt.ms (or any JWT decoder) and reading `aud`,
   `iss`, `scp`, `exp`.

</details>

## Next

[05-backend-integration-patterns](../05-backend-integration-patterns/README.md)
— stop pointing at public FQDNs: reach a private Container App over VNet
integration, define named backends, load-balance across multiple backends, and
meet backend pools and circuit breakers (the gateway cousin of track 13's mesh
resilience).
