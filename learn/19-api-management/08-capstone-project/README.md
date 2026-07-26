# Capstone Project

## Why this matters

This is the last module of the API Management track. There's no new concept
section, no command reference, and no quiz — the goal is to combine everything
from modules 00-07 into one real, working API product: a private backend fronted
by APIM over VNet integration, versioned, rate-limited, protected by real Entra ID
token validation, packaged as a product with a self-service subscription key, and
observable with live analytics. Treat it as a project, not a checklist of
isolated exercises — the pieces depend on each other in the order you'd actually
build them, and being able to explain *why each layer exists* is the real test of
this track.

## The project

Take the backend patterns from track 06 and put a complete, governed API product
in front of them. Build, in roughly this order:

1. **A private backend.** Deploy a Container App into an **internal-only**
   Container Apps Environment (track 06 module 04 / module 05 here) so the backend
   is unreachable from the public internet — only APIM will reach it.
2. **APIM integrated into the VNet.** Provision a **Developer-tier** instance
   (needed for VNet integration and the developer portal) into the same VNet, with
   the environment's **private DNS zone linked** so APIM can resolve the backend's
   private FQDN. (Expect the 30-45 min provisioning; kick it off early.)
3. **A named backend** pointing at the private FQDN, routed via
   `set-backend-service` — not an inline `serviceUrl`.
4. **A versioned API** with at least **two versions** in a version set (Path
   scheme), where v2 represents a deliberate change; use a **revision** to stage a
   safe iteration on one version and promote it.
5. **A rate-limiting policy** — a **per-consumer** `rate-limit-by-key` (keyed by
   `context.Subscription.Id`) and a product-scope quota.
6. **JWT validation** — a `validate-jwt` inbound policy accepting only Entra ID
   tokens for your API's audience and issuer, requiring a specific scope (real
   token from `az account get-access-token`, track 16 / module 04).
7. **A product with a subscription key** — package the API into a published
   product (subscription required), create a subscription, and prove calls work
   with the product-scoped key and fail without it.
8. **Analytics showing real traffic** — wire diagnostic logs / App Insights,
   generate load, and produce evidence (analytics view or KQL) of real request
   data, including the gateway-vs-backend latency split.

## Acceptance criteria

Work through these in order; each depends on the previous ones actually working,
not just existing.

- [ ] A resource group contains an **internal-only** Container Apps Environment
      and a backend Container App whose FQDN resolves to a **private IP** and is
      **not reachable from your laptop** (curl from your machine fails/ times out).
- [ ] A **Developer-tier** APIM instance is integrated into the same VNet, and the
      environment's **private DNS zone is linked** to APIM's VNet
      (`az network private-dns link vnet list` shows the link).
- [ ] A **named backend** (not an inline `serviceUrl`) points at the private FQDN,
      and an API routes to it via `set-backend-service`; an authenticated call
      through the gateway returns **200** from the backend your laptop can't reach.
- [ ] The API exists in a **version set** with **at least two versions** (both
      callable at their versioned paths), and you used a **revision** to stage and
      promote a change on one version (revision history shows the release note).
- [ ] A **per-consumer** `rate-limit-by-key` (keyed by `context.Subscription.Id`)
      is in effect: two different subscription keys each get their **own** budget,
      and exceeding it returns **429** for that consumer only — not the other.
- [ ] A `validate-jwt` policy rejects a call with **no token (401)**, rejects a
      valid token **missing the required scope (403)**, rejects a token minted for
      the **wrong audience (401)**, and accepts a valid, correctly-scoped Entra ID
      token **(200)** — and you can show the token's `aud`/`iss`/`scp` decoded.
- [ ] The API is packaged into a **published product** requiring a subscription; a
      **product-scoped subscription key** succeeds, the **master key removed from
      the call** (or a wrong-product key) fails with 401, and the product carries a
      **quota**.
- [ ] **Analytics show real traffic**: the built-in analytics view (or a KQL query
      over `ApiManagementGatewayLogs`) displays your generated requests, and you
      can produce the **gateway-time vs. backend-time split** for at least one
      operation.
- [ ] You can explain, for every layer above, **what it adds that the raw
      track-06 external ingress could not** — if you can't explain a layer, that's
      a sign to revisit its module rather than having copy-pasted a policy that
      worked.

## Hints

- **Provision APIM first, build everything else while it cooks.** The Developer
  instance takes 30-45 minutes. Kick off `az apim create ... --no-wait`, then do
  the VNet, internal environment, backend, and app registration during the wait so
  you're not idle.
- **Get one authenticated call to the private backend working before adding
  policies.** Prove the hard part (VNet + private DNS + named backend) end to end
  first; layering versioning, rate limits, and JWT on top of a *working* base is
  far easier than debugging all of it at once.
- **Reproduce each failure code deliberately so you can read them instantly:**
  401 = auth/token (module 04), 404 = path/backend mapping (module 01), 429 =
  throttled (module 03), 503 = backend unreachable / DNS-routing (module 05). If a
  code surprises you, you've found the layer to debug.
- **Decode every token before blaming the policy.** For the JWT criteria, line up
  the token's `aud`/`iss`/`scp` (jwt.ms) against your `<audiences>`/`<issuers>`/
  `<required-claims>`. A 401 on a token you *know* is valid is almost always an
  audience mismatch, not a bad token.
- **Watch `<base />` placement.** If a rate limit or JWT check "doesn't run,"
  suspect a missing `<base />` or a policy attached to the wrong version/revision
  before anything else.
- **Keep analytics honest and cheap.** Use modest sampling and headers-not-bodies;
  you need *evidence* of real traffic and a latency split, not a full-body capture
  of every call.
- **Keep a running inventory** of every resource you create (APIM instance, VNet,
  internal environment, Container App, Log Analytics workspace, App Insights, Entra
  app registration) so cleanup is a checklist, not archaeology.

## Cost & cleanup

This capstone uses a **Developer-tier** APIM instance, which **bills
continuously** and is slow to both create and delete — plus a Log Analytics
workspace and App Insights that bill by ingestion. Do not leave any of it running
overnight "to finish tomorrow."

1. Confirm what exists: `az resource list --resource-group <your-capstone-rg> -o table`.
2. Delete the resource group and everything in it:
   `az group delete --name <your-capstone-rg> --yes --no-wait`.
3. Delete the **Entra ID app registration** you created for JWT validation
   (`az ad app delete --id <app-id>`) — it lives outside the resource group.
4. Sweep for stragglers that don't die with a resource group: check
   `az apim list -o table` (classic-tier deletes are slow — confirm it's gone),
   `az monitor log-analytics workspace list -o table`, and
   `az monitor app-insights component show ...`. An empty APIM list is your signal
   the continuously-billing part is truly gone.

## Before you move on

Once everything is torn down, don't consider this finished yet. Wait a few days,
then — with no notes, none of the earlier modules open, and none of the policy XML
in front of you — **rebuild the core of this capstone from memory**: a private
backend APIM reaches over VNet, a versioned API, a per-consumer rate limit, a
`validate-jwt` policy that gives you the right 200/401/403 across a valid token, a
missing-scope token, and a wrong-audience token, and a product whose subscription
key gates access. Rebuilding it cold — and noticing exactly where you stall (Was
it the private DNS linkage? The `counter-key` expression? The audience string? The
`<base />` placement?) — is the truest retention check there is. Tear it all down
again afterward and confirm the APIM instance is gone.

## Next

You've turned raw backends into a governed API product: authenticated at the edge,
throttled per consumer, versioned, privately integrated, packaged, and observable.
That last capability — **API-level observability** — is exactly the bridge into
the next track. In [20-sre-practices](../../20-sre-practices/README.md), the
5xx-rate, latency, and failed-auth signals you just lit up on your APIs stop being
dashboards and become **SLIs** you define **SLOs** and **error budgets** against —
"99.9% of Orders API requests succeed under 300ms" is measured directly on the
APIM metrics from module 07. You've built the thing that gets measured; track 20
is how you decide what "healthy enough" means and what to do when the budget runs
out.

[Back to the track index](../README.md) · [Back to main curriculum](../../README.md)
