# Provisioning APIM & Importing a First API

## Why this matters

This is where APIM stops being a diagram and becomes a real resource with a
gateway URL. The two decisions you make here — **which tier** and **how you
import the API** — set both your bill and your workflow for the rest of the
track. Tier choice is the single biggest cost lever in APIM (classic tiers bill
continuously; Consumption is pay-per-call), and importing an OpenAPI spec is how
a backend you built in track 06/07 becomes a set of real operations you can
govern. Get comfortable here and every later module is "add one more thing to an
instance that already exists."

## Concepts

### APIM tiers, and why Consumption is the learner's default

APIM comes in tiers ("SKUs") that differ in capacity model, features, and
billing shape:

- **Consumption** — serverless, **pay per call**, scales to effectively zero
  when idle. No fixed hourly charge. Fastest to provision (minutes). Missing
  some features (no built-in dev portal on older configs, no VNet injection, no
  built-in cache), but perfect for learning and for genuinely spiky/low-volume
  APIs. **This is what most of this track uses.**
- **Developer** — a full-featured *non-production* instance (has the developer
  portal, VNet integration, caching) but **no SLA** and **bills continuously**.
  Slow to provision (**30-45 min**). Use it only when you specifically need a
  feature Consumption lacks (module 05's VNet integration, module 06's portal),
  and **delete it the same day**.
- **Basic / Standard / Premium** — production tiers with SLAs, increasing
  scale ("units"), and — in Premium — multi-region and VNet *injection*. All
  bill continuously. You won't need these to learn; know they exist and that
  they're the expensive end.

The mental model: **Consumption is a function-app-shaped bill (per execution);
the classic tiers are a VM-shaped bill (per hour the thing exists).** You met
exactly this trade-off in track 06 (Container Apps scale-to-zero vs. an AKS
node pool that bills while idle in track 07). Same instinct applies.

### Provisioning is slow — plan for it

Creating an APIM instance is one of the slower operations in Azure. A
Consumption instance takes a few minutes; a Developer/classic instance commonly
takes **30 to 45 minutes** because Azure provisions dedicated gateway
infrastructure and a publisher/portal stack behind it. This is normal and not a
hung command. Use `--no-wait` and poll `provisioningState`, or kick it off and
go do something else. Deleting a classic instance is also slow. Build this into
your expectations so you don't cancel a create that's working fine.

### API, operation, backend — the three objects you're creating

Importing gives you three related things. An **API** in APIM is a named facade
with a **path** (the URL suffix consumers use, e.g. `/orders`) and a **backend**
(where APIM forwards, e.g. your Container App FQDN). Each API has **operations** —
individual method+URL-template entries (`GET /orders/{id}`, `POST /orders`) that
map to backend routes and are the unit you attach per-operation policies to.
When you import an **OpenAPI (Swagger) spec**, APIM reads the spec and creates
the API plus one operation per documented path/method automatically — this is
the fastest, most faithful way to onboard an API, and it's why teams keep an
OpenAPI document as the contract. You can also create an API by hand or as a
"pass-through" that forwards everything under a path.

### The API URL suffix and the backend URL are different things

A constant source of confusion: the URL a consumer calls and the URL APIM
forwards to are unrelated strings. Consumers call
`https://<instance>.azure-api.net/<api-path>/<operation>`; APIM strips the
gateway host + API path and forwards the rest to the **backend URL** (a.k.a.
"web service URL" / `serviceUrl`) you configured — your Container App FQDN or
AKS Ingress. So `--path orders` + backend `https://orders.<env>.azurecontainerapps.io`
means `GET .../orders/42` reaches `https://orders.<env>.azurecontainerapps.io/42`.
Getting the path/backend split wrong is the number-one cause of a first import
returning 404s from the backend, and you'll deliberately break and fix exactly
that in the exercises.

### Fronting a track-06/07 backend

The backend can be any HTTP endpoint APIM can reach. For now, the simplest is a
Container App with **external** ingress (track 06) — its public FQDN is directly
reachable, so APIM forwards to it with no networking setup. An AKS Service behind
an **Ingress controller** (track 07) works identically: point the backend at the
Ingress's public address (and set the `Host` header if the Ingress routes by
host). This module keeps the backend **public** for simplicity; making it
**internal-only** and reaching it privately over VNet integration is module 05's
job — the more secure end state, but one thing at a time.

## Command reference

| Command | What it does | Example |
|---------|--------------|---------|
| `az apim create` | Provision an APIM instance | see below |
| `az apim show` | Read instance state / URLs / SKU | `az apim show --name <inst> --resource-group rg-apim-m01 --query "{state:provisioningState, gw:gatewayUrl, sku:sku.name}" -o jsonc` |
| `az apim api import` | Create an API from an OpenAPI spec | see below |
| `az apim api create` | Create an API by hand (no spec) | `az apim api create --resource-group rg-apim-m01 --service-name <inst> --api-id orders --path orders --display-name "Orders" --service-url https://orders...azurecontainerapps.io` |
| `az apim api list` | List APIs on an instance | `az apim api list --resource-group rg-apim-m01 --service-name <inst> -o table` |
| `az apim api operation list` | List operations of an API | `az apim api operation list --resource-group rg-apim-m01 --service-name <inst> --api-id orders -o table` |
| `az apim api update` | Change an API's path/backend | `az apim api update --resource-group rg-apim-m01 --service-name <inst> --api-id orders --service-url https://correct-backend...` |

Flag-by-flag breakdowns:

`az apim create --name apim-m01-<unique> --resource-group rg-apim-m01 --location eastus --publisher-name "You" --publisher-email you@example.com --sku-name Consumption`
- `--name apim-m01-<unique>` — becomes the gateway host `<name>.azure-api.net`, so it must be **globally unique**. Append random digits.
- `--publisher-name` / `--publisher-email` — the API publisher shown in the
  developer portal and used for notification emails. Required even on Consumption.
- `--sku-name Consumption` — the tier. **Consumption = pay-per-call, provisions
  in minutes, idles free.** Swap to `Developer` only when you need a feature it
  lacks (and expect a 30-45 min create + a continuous bill).

`az apim api import --resource-group rg-apim-m01 --service-name apim-m01-<unique> --api-id petstore --path petstore --specification-format OpenApi --specification-url https://raw.githubusercontent.com/OAI/OpenAPI-Specification/main/examples/v3.0/petstore.yaml`
- `--api-id petstore` — the internal identifier for the API resource (used in
  later CLI calls and policy scoping).
- `--path petstore` — the **URL suffix** consumers use: `<gateway>/petstore/...`.
- `--specification-format OpenApi` — the spec dialect (also `Swagger` for 2.0,
  `Wadl`, etc.).
- `--specification-url` — where to fetch the spec; use `--specification-path`
  for a local file. APIM creates one operation per path/method in the spec.

`az apim api create --resource-group rg-apim-m01 --service-name <inst> --api-id orders --path orders --display-name "Orders API" --service-url https://orders.<env>.azurecontainerapps.io --protocols https`
- `--service-url` — the **backend URL** APIM forwards to (your Container App /
  AKS Ingress). Distinct from `--path`, which is the consumer-facing suffix.
- `--protocols https` — which schemes the gateway accepts for this API.

## Hands-on exercises

> **Heads-up on time:** exercise 1 with `--sku-name Consumption` completes in a
> few minutes. If you (optionally) try a Developer-tier instance, expect
> **30-45 minutes** — that's normal, not a hang. Poll `provisioningState`.

1. **Provision a Consumption instance.**
   ```powershell
   az group create --name rg-apim-m01 --location eastus
   $apim = "apimm01$((Get-Random -Max 99999))"
   az apim create --name $apim --resource-group rg-apim-m01 --location eastus `
     --publisher-name "You" --publisher-email you@example.com --sku-name Consumption
   az apim show --name $apim --resource-group rg-apim-m01 --query "{state:provisioningState, gw:gatewayUrl, sku:sku.name}" -o jsonc
   ```
   Wait for `provisioningState` to read `Succeeded`. Record the `gatewayUrl`.

2. **Deploy the backend (reuse track 06).**
   ```powershell
   az containerapp env create --name env-m01 --resource-group rg-apim-m01 --location eastus
   az containerapp create --name orders --resource-group rg-apim-m01 --environment env-m01 `
     --image mcr.microsoft.com/k8se/quickstart:latest --target-port 80 --ingress external
   $backend = "https://" + (az containerapp show --name orders --resource-group rg-apim-m01 --query properties.configuration.ingress.fqdn -o tsv)
   curl "$backend"
   ```
   Confirm a 200 directly from the backend before putting APIM in front of it.

3. **Import a public OpenAPI spec (fast win).**
   ```powershell
   az apim api import --resource-group rg-apim-m01 --service-name $apim --api-id petstore --path petstore `
     --specification-format OpenApi `
     --specification-url https://raw.githubusercontent.com/OAI/OpenAPI-Specification/main/examples/v3.0/petstore.yaml
   az apim api operation list --resource-group rg-apim-m01 --service-name $apim --api-id petstore -o table
   ```
   Verify multiple operations were created automatically from the spec's paths.

4. **Create an API that fronts your own backend.**
   ```powershell
   az apim api create --resource-group rg-apim-m01 --service-name $apim --api-id orders --path orders `
     --display-name "Orders API" --service-url $backend --protocols https
   az apim api operation create --resource-group rg-apim-m01 --service-name $apim --api-id orders `
     --url-template "/" --method GET --display-name "Get root" --operation-id get-root
   ```

5. **Call through the gateway.** Consumption APIs still require a subscription key
   by default. Get the built-in "all-access" subscription key, then call:
   ```powershell
   $key = az apim subscription show --resource-group rg-apim-m01 --service-name $apim --sid master --query primaryKey -o tsv
   $gw = az apim show --name $apim --resource-group rg-apim-m01 --query gatewayUrl -o tsv
   curl -H "Ocp-Apim-Subscription-Key: $key" "$gw/orders/"
   ```
   A 200 that matches the backend's response proves the full path: consumer →
   gateway → backend → back.

6. **Prove the key is enforced.** Repeat the call **without** the header:
   ```powershell
   curl -i "$gw/orders/"
   ```
   Expect `401 Access Denied` with a message about a missing subscription key.
   This is the first thing APIM added that the raw FQDN never had.

7. **Diagnose and fix: wrong path/backend split → 404 from backend.** Break it
   deliberately by pointing the backend at a wrong sub-path:
   ```powershell
   az apim api update --resource-group rg-apim-m01 --service-name $apim --api-id orders `
     --service-url "$backend/does-not-exist"
   curl -i -H "Ocp-Apim-Subscription-Key: $key" "$gw/orders/"
   ```
   You now get a **404 or 502 that originates from the backend**, not from APIM —
   the tell is that the key check passed (no 401) but the path doesn't exist on
   the backend. **Diagnose** by comparing the effective forwarded URL
   (`serviceUrl` + remainder after the API path) to what the backend actually
   serves. **Fix** by restoring the correct backend:
   ```powershell
   az apim api update --resource-group rg-apim-m01 --service-name $apim --api-id orders --service-url $backend
   curl -H "Ocp-Apim-Subscription-Key: $key" "$gw/orders/"
   ```
   Confirm the 200 returns. Lesson: 401 = gateway auth; 404/5xx after a passing
   key = look at the path/backend mapping, not the key.

8. **Inspect the API as data.** Dump the API definition and locate the fields you
   set:
   ```powershell
   az apim api show --resource-group rg-apim-m01 --service-name $apim --api-id orders -o jsonc
   ```
   Find `path`, `serviceUrl`, and `subscriptionRequired`. These three fields are
   the skeleton of every API you'll build.

9. **Cleanup.**
   ```powershell
   az group delete --name rg-apim-m01 --yes --no-wait
   ```
   The Consumption instance idles cheap, but delete it anyway. **If you created a
   Developer-tier instance to experiment, deleting it is essential** — that one
   bills continuously.

## Independent challenge

Provision a fresh Consumption APIM instance and, without using the CLI's
`import` shortcut this time, hand-build an API that fronts a **new** Container
App you deploy (external ingress, track 06) — create the API, add at least two
operations with proper `url-template` and methods, wire the backend URL, and
prove an authenticated call reaches the backend while an unauthenticated one is
rejected. Then export/inspect the resulting API definition and compare its shape
to the auto-generated Petstore API from the exercises: note what importing an
OpenAPI spec gave you "for free" that you had to specify by hand. This draws on
**module 00** (the request-path model) and **track 06** (deploying the backend).
Delete the resource group — and, critically, the APIM instance — when finished.

<details><summary>Stuck? One hint</summary>

The two failure modes to distinguish are (a) a **401 from APIM** (missing/invalid
subscription key — a gateway-side auth problem) and (b) a **404/5xx from the
backend** (the request got past the gateway but the forwarded path doesn't exist
on the backend — a `path`/`serviceUrl` mapping problem). Reproduce each on
purpose so you can tell them apart instantly; that single skill saves you the
most time in every later module.

</details>

## Common mistakes & troubleshooting

- **Cancelling a slow create.** A Developer/classic `az apim create` legitimately
  takes 30-45 minutes. Poll `provisioningState`; don't assume it hung and retry
  (you'll just start a second slow create).
- **Non-unique instance name.** `--name` becomes the global `azure-api.net`
  hostname; a name collision fails the create. Append random digits.
- **Path vs. backend-URL confusion.** `--path` is the consumer-facing suffix;
  `--service-url` is where APIM forwards. Mixing them up yields 404s from the
  backend even though the gateway/key are fine.
- **Forgetting the subscription key.** By default APIs require a key; calling
  without `Ocp-Apim-Subscription-Key` returns 401. That's not a bug — it's the
  gateway doing its job (you can disable it per-API with `subscriptionRequired`,
  but usually you don't want to).
- **Cost pitfall — spinning up Developer/Standard "just to try it."** Those bill
  continuously and are slow to both create and delete. Use **Consumption** for
  every exercise that doesn't specifically require a classic-only feature, and
  when you must use Developer, **delete it the same day**. A forgotten classic
  instance is the most common surprise APIM bill.
- **Region availability.** Consumption isn't offered in every region. If
  `--sku-name Consumption` errors, pick a supported region (e.g. `eastus`,
  `westeurope`) rather than switching tiers.

## Checkpoint quiz

Write down your answer to each question before expanding it — checking without
attempting first is the single easiest way to fool yourself into thinking
you've learned this.

1. Contrast the billing shape of the Consumption tier vs. the Developer/classic
   tiers, and which prior-track trade-off it mirrors.
2. Roughly how long does a Developer/classic APIM instance take to provision, and
   why does that matter operationally?
3. What three objects does importing an OpenAPI spec create, and what does one
   operation correspond to?
4. Distinguish an API's `--path` from its `--service-url` with a concrete
   example of the resulting forwarded request.
5. You call through the gateway and get a `401 Access Denied`. What's almost
   certainly missing, and is that a gateway problem or a backend problem?
6. You call through the gateway, the key is accepted, but you get a `404` — where
   do you look?
7. Why is Consumption the recommended tier for this track, and when would you
   deliberately switch to Developer?

<details><summary>Show answers</summary>

1. Consumption is **pay-per-call** and idles at ~zero (function-app-shaped bill);
   Developer/classic **bill continuously** for the provisioned capacity
   (VM-shaped bill). Mirrors Container Apps scale-to-zero (track 06) vs. an AKS
   node pool that bills while idle (track 07).
2. Roughly **30-45 minutes**. It matters because you must not assume the command
   hung and cancel/retry it — you'll just start another slow create.
3. An **API** (with a path + backend), its **operations**, and the backend
   linkage. One operation = one method + URL-template entry (e.g. `GET /pets/{id}`).
4. `--path orders` is the consumer suffix (`<gw>/orders/...`); `--service-url
   https://orders.<env>...` is the backend. So `GET <gw>/orders/42` forwards to
   `https://orders.<env>.../42`.
5. The `Ocp-Apim-Subscription-Key` header (a valid subscription key). It's a
   **gateway** problem — the request never reached the backend.
6. At the **path/backend mapping** (`--path` vs `--service-url`) — the key passed,
   so the request reached the backend but hit a path that doesn't exist there.
7. It's pay-per-call, idles free, and provisions in minutes — cheap and fast for
   learning. Switch to Developer only when you need a feature Consumption lacks:
   VNet integration (module 05) or the developer portal (module 06).

</details>

## Next

[02-api-versioning-and-revisions](../02-api-versioning-and-revisions/README.md)
— now that an API exists, learn to evolve it safely: version sets and versioning
schemes for breaking changes, revisions for non-breaking iteration, and a
deprecation strategy.
