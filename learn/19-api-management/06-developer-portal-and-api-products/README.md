# Developer Portal & API Products

## Why this matters

You've built the machinery — a fronted, versioned, policy-protected, privately
integrated API. But nobody *consumes* an API by reading your `az` history. A
**product** packages one or more APIs with a subscription model and limits, and
the **developer portal** is the self-service storefront where consumers discover
the API, read docs, accept terms, get a subscription key, and try calls — all
without you provisioning anything by hand. This is the packaging-and-distribution
layer. It's covered survey-level here: enough to publish a working product and
portal, since this is a platform-ops track, not a full API-product-management
one.

## Concepts

### Products: packaging APIs for consumers

A **product** is a named bundle of one or more APIs plus a policy and a
subscription model — think "Starter plan" or "Partner tier." Products are how you
say "these three APIs, together, at 1000 calls/day, are a thing partners can
subscribe to." A product has: the APIs it contains, a **product-scope policy**
(module 03's broadest-but-one scope — a great place to put a shared quota that
applies across every API in the bundle), a published/unpublished state, and
whether it requires a **subscription** and/or **approval**. The same API can live
in multiple products at different limits (a Free product at 100/day and a Pro
product at 100000/day, both fronting the same backend) — the product, not the
API, carries the plan.

### Subscriptions and subscription keys, properly

A **subscription** is the relationship between a consumer and a product: it's what
issues the **subscription key** you've been using since module 01. When a
developer subscribes to a product (self-service in the portal, or created by you
via CLI), APIM mints a subscription with a primary and secondary key. The
**two keys** exist for zero-downtime rotation — rotate one while the other keeps
working, then swap. A subscription is scoped to a product (so the key is only
valid for that product's APIs), which is exactly what makes per-consumer metering
and quotas meaningful: the key *is* the consumer identity for the product layer
(distinct from the JWT identity layer in module 04).

### Approval and terms of use

Products can gate subscriptions two ways. **Approval required** means a
developer's subscription request sits pending until a publisher approves it —
appropriate for partner/paid tiers where you vet consumers. **Terms of use** is
text a developer must accept before subscribing — your acceptable-use policy, rate
expectations, data handling. For an open Free tier you might require neither; for
a partner product you'd require both. These are product settings, not code, and
they're the difference between "anyone can self-serve instantly" and "consumers
onboard through a controlled gate."

### The developer portal: the self-service storefront

The **developer portal** is an auto-generated, brandable website APIM hosts for
you. Out of the box it lists published products and their APIs, renders the
OpenAPI-derived docs, provides an interactive **"Try it"** console (which calls
through the real gateway with the developer's key), and lets developers sign up,
subscribe, and manage their keys. You publish it once; it stays in sync with your
APIs. **Tier note:** the managed developer portal is a **classic-tier** feature
(Developer and above) — the **Consumption** tier does **not** include the managed
portal, so this is one of the two modules (with module 05) where you need a
classic instance, with the same cost/time caveats. You can customize branding and
content, but that's beyond this survey — the goal is to publish a working portal
and watch a self-service subscription flow end to end.

### Where products sit relative to everything else

Tie it together with the pipeline from module 03. At request time the scopes
evaluate global → **product** → API → operation. So a **product-scope quota**
applies to *every* API in the product uniformly — the natural home for "this plan
gets N calls/day." The subscription key identifies which product subscription the
call belongs to, so `context.Subscription.Id` (your `-by-key` counter-key from
module 03) is meaningful *because* products and subscriptions exist. Products
aren't a separate feature bolted on; they're the layer that makes per-consumer
policy and self-service distribution work.

## Command reference

| Command | What it does | Example |
|---------|--------------|---------|
| `az apim product create` | Create a product (plan) | see below |
| `az apim product api add` | Add an API to a product | `az apim product api add --resource-group rg --service-name <inst> --product-id starter --api-id orders` |
| `az apim product policy create` | Apply a product-scope policy (e.g. shared quota) | `az apim product policy create --resource-group rg --service-name <inst> --product-id starter --policy-format xml --value "@prod.xml"` |
| `az apim product show` | Inspect a product's settings | `az apim product show --resource-group rg --service-name <inst> --product-id starter -o jsonc` |
| `az apim subscription list` | List subscriptions (and their keys) | `az apim subscription list --resource-group rg --service-name <inst> -o table` |

Flag-by-flag breakdowns:

`az apim product create --resource-group rg-apim-m06 --service-name <inst> --product-id starter --product-name "Starter" --subscription-required true --approval-required false --state published --legal-terms "Fair use only."`
- `--product-id starter` — the id you reference when adding APIs / scoping policy.
- `--subscription-required true` — consumers need a subscription (and thus a key)
  to call the product's APIs.
- `--approval-required false` — subscriptions are granted instantly (self-serve).
  Set `true` for a vetted/partner product where you approve each request.
- `--state published` — makes the product visible in the developer portal.
  `notPublished` hides it while you set it up.
- `--legal-terms "..."` — the **terms of use** a developer must accept before
  subscribing.

`az apim product policy create --resource-group rg-apim-m06 --service-name <inst> --product-id starter --policy-format xml --value "@prod.xml"` where `prod.xml`:
```xml
<policies>
  <inbound>
    <base />
    <quota calls="1000" renewal-period="86400" />
  </inbound>
  <backend><base /></backend>
  <outbound><base /></outbound>
  <on-error><base /></on-error>
</policies>
```
- A **product-scope** quota of 1000 calls/day applied uniformly across every API
  in the Starter product — the plan's volume cap. (Counts per the product scope;
  use `quota-by-key` keyed by `context.Subscription.Id` if you want it per
  subscription rather than per product total.)

## Hands-on exercises

> **Time note:** the managed **developer portal** needs a **classic tier**
> (Developer+), so this module provisions a Developer instance — expect the
> **30-45 minute** create and the **continuous bill**, and **delete it the same
> day**. Exercises 1-5 (products, subscriptions, product policy) also work on
> **Consumption**; only the portal steps (6-7) require the classic tier. If you
> want to avoid the classic-tier cost, do 1-5 on Consumption and read 6-7.

1. **Provision and import a base API.** Stand up an instance (Developer if you'll
   do the portal steps; else Consumption), a backend Container App, and an
   `orders` API — the now-familiar base. Kick off a Developer create with
   `--no-wait` and continue while it provisions.

2. **Create two products at different limits over the same API.**
   ```powershell
   az apim product create --resource-group rg-apim-m06 --service-name $apim --product-id free `
     --product-name "Free" --subscription-required true --approval-required false --state published --legal-terms "Fair use only."
   az apim product create --resource-group rg-apim-m06 --service-name $apim --product-id partner `
     --product-name "Partner" --subscription-required true --approval-required true --state published --legal-terms "Partner agreement applies."
   az apim product api add --resource-group rg-apim-m06 --service-name $apim --product-id free --api-id orders
   az apim product api add --resource-group rg-apim-m06 --service-name $apim --product-id partner --api-id orders
   ```
   Same backend API, two plans — one open/self-serve, one vetted/approval-gated.

3. **Attach a product-scope quota to Free.** Save `prod.xml` (1000 calls/day from
   the command reference) and apply it to `free`. Confirm the quota is at
   **product** scope (`az apim product policy show ...`) — it now governs every API
   in the Free product uniformly.

4. **Create a subscription and call with its key.**
   ```powershell
   az apim subscription create --resource-group rg-apim-m06 --service-name $apim `
     --name free-sub-1 --display-name "Free consumer 1" --scope "/products/free"
   $subkey = az apim subscription show --resource-group rg-apim-m06 --service-name $apim --sid free-sub-1 --query primaryKey -o tsv
   $gw = az apim show --name $apim --resource-group rg-apim-m06 --query gatewayUrl -o tsv
   curl -H "Ocp-Apim-Subscription-Key: $subkey" "$gw/orders/"
   ```
   A 200 with a **product-scoped** key (not the master key) — this is the real
   per-consumer credential the portal would hand out.

5. **Prove product scoping.** Try the Free subscription key against an API that is
   **not** in the Free product (add a second API to the instance but only to
   `partner`). Expect **401** — the key is only valid for its product's APIs. This
   is what makes per-product metering meaningful.

6. **Publish and open the developer portal (classic tier).** Once the Developer
   instance is `Succeeded`, publish the portal:
   ```powershell
   $portal = az apim show --name $apim --resource-group rg-apim-m06 --query "portalUrl" -o tsv
   $portal
   ```
   In the Azure Portal, open the APIM instance → **Developer portal** → **Publish**
   (the managed portal must be published once before it's live). Browse to the
   portal URL and confirm the Free and Partner products appear, with the Orders
   API docs rendered from the OpenAPI import.

7. **Walk the self-service flow.** In the developer portal, **sign up** as a
   developer, **subscribe** to the **Free** product (instant, no approval), copy
   the issued key, and use the portal's **"Try it"** console to call
   `GET /orders/` — watch it succeed through the real gateway. Then request a
   subscription to **Partner** and observe it sits **pending approval** (because
   `--approval-required true`); approve it from the Azure Portal and see it
   activate. You've now watched a consumer onboard with zero manual key-minting on
   your side.

8. **Diagnose and fix: consumer can't call despite "having a key" (wrong product
   scope).** A developer subscribed to **Free** tries to call an API that's only
   in **Partner** and gets 401 — and assumes their key is broken. **Diagnose:**
   `az apim subscription show --sid <sid> --query scope` reveals the key is scoped
   to `/products/free`, and the target API isn't in Free. **Fix:** either add the
   API to the Free product (if it belongs in that plan) or have the consumer
   subscribe to the product that contains it. Lesson: a subscription key is
   **product-scoped**; "my key doesn't work" is often "wrong product," not "bad
   key."

9. **Cleanup — same day for the Developer tier.**
   ```powershell
   az group delete --name rg-apim-m06 --yes --no-wait
   ```
   Verify with `az apim list -o table` once deletion finishes.

## Independent challenge

Design and publish a two-tier product offering over a single backend API: a
self-service **Free** product (no approval, terms of use required, a modest
product-scope daily quota) and an approval-gated **Partner** product (higher
quota, terms accepted). Then act as a consumer end to end through the developer
portal: sign up, subscribe to Free instantly, call the API from the "Try it"
console, and request Partner access so you can watch the approval gate work.
Reproduce the "wrong product scope → 401" confusion and resolve it. Explain how
the **product-scope quota** relates to module 03's policy scopes and how the
**subscription key** relates to module 04's identity layer (key = product/metering
identity; JWT = authenticated user/app identity). Because the portal needs a
classic tier, **tear it all down the same day** and confirm the instance is gone.

<details><summary>Stuck? One hint</summary>

Two knobs define the onboarding experience per product: `--approval-required`
(instant self-serve vs. a pending gate you approve) and `--legal-terms` (text the
developer must accept). Set Free to `false`/short-terms and Partner to
`true`/real-terms, publish both, and the portal renders the two flows for you.
For the 401 confusion, always check `subscription show --query scope` — the key
is only valid for the product it was issued against.

</details>

## Common mistakes & troubleshooting

- **Expecting the developer portal on Consumption.** The managed portal is a
  classic-tier feature. On Consumption you can create products/subscriptions via
  CLI but there's no managed portal to publish.
- **Forgetting to publish the portal.** The managed portal must be **published**
  once (a distinct action) before it's live and reflects your APIs; an
  unpublished portal shows nothing or a default.
- **Product not published → invisible.** A product in `notPublished` state won't
  appear in the portal even though it exists. Set `--state published`.
- **Wrong-product-scoped key → 401.** Subscription keys are valid only for their
  product's APIs. "My key doesn't work" is frequently a product-scope mismatch,
  not a bad key — check `subscription show --query scope`.
- **Putting a per-consumer limit at product scope by accident.** A plain product
  `quota` counts the product's *total* traffic; for per-subscriber limits use
  `quota-by-key`/`rate-limit-by-key` keyed by `context.Subscription.Id` (module
  03).
- **Cost pitfall.** This module (like module 05) requires a **classic tier** for
  the portal — it bills continuously and is slow to create/delete. Don't stand it
  up "to look around" and walk away; delete the resource group the same day and
  verify with `az apim list -o table`.

## Checkpoint quiz

Write down your answer to each question before expanding it — checking without
attempting first is the single easiest way to fool yourself into thinking
you've learned this.

1. What is a product, and what does it carry that an individual API does not?
2. What is the relationship between a subscription, a subscription key, and a
   product? Why are there two keys?
3. How do `--approval-required` and `--legal-terms` change the consumer
   onboarding experience?
4. Which tier is required for the managed developer portal, and what's the extra
   step after provisioning before it's live?
5. A consumer with a valid Free-product key gets 401 calling a certain API.
   What's the likely cause and how do you confirm it?
6. Where does a product-scope quota sit in module 03's scope order, and what does
   it govern?
7. Contrast the identity a subscription key provides with the identity a JWT
   (module 04) provides.
8. You want the same backend API offered at 100/day and 100000/day. How do you
   model that?

<details><summary>Show answers</summary>

1. A product is a named bundle of one or more APIs plus a subscription model and a
   product-scope policy. It carries the **plan** — subscription/approval
   requirements, terms, and shared limits — which an individual API doesn't.
2. A subscription is a consumer's relationship to a product; it issues the
   subscription key(s). The key is valid only for that product's APIs. **Two
   keys** (primary/secondary) allow zero-downtime rotation.
3. `--approval-required true` makes subscriptions pending until a publisher
   approves (vetted onboarding); `--legal-terms` requires the developer to accept
   your terms before subscribing. Together they turn instant self-serve into a
   controlled gate.
4. A **classic tier** (Developer or above). After provisioning you must
   **publish** the managed portal once before it's live and reflects your APIs.
5. The key is **scoped to a different product** than the API being called. Confirm
   with `az apim subscription show --sid <sid> --query scope` and check whether the
   API is in that product.
6. It's the **product** scope, evaluated after global and before API/operation. It
   governs every API in the product uniformly.
7. The subscription key identifies **which product subscription/consumer** is
   calling (metering/throttling layer); the JWT identifies the **authenticated
   user/app** and their scopes (authorization layer). Different layers, often used
   together.
8. Create **two products** (e.g. Free and Pro) both containing the **same API**,
   each with its own product-scope quota (100/day and 100000/day). The product,
   not the API, carries the plan.

</details>

## Next

[07-observability-for-apis](../07-observability-for-apis/README.md)
— see what's actually flowing: built-in analytics, Azure Monitor metrics and
diagnostic logs, and Application Insights integration to correlate APIM with the
backend traces from track 12.
