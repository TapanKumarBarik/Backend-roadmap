# Backend Integration Patterns

## Why this matters

Until now your backend has been a *public* Container App FQDN — convenient, but it
means anyone who discovers that FQDN can bypass the gateway entirely, defeating
the point of putting APIM in front. The secure end state is a **private** backend
that *only* APIM can reach, over VNet integration — using the exact internal
Container Apps Environment and private DNS concepts from track 06. This module
also covers routing to *multiple* backends: named backends, load balancing, and
backend pools with circuit-breaker behavior — the gateway-edge cousin of the
resilience patterns you met in the service mesh (track 13).

## Concepts

### Named backends: backends as first-class, reusable objects

So far you've set a backend by stuffing a URL into `--service-url` on the API. A
**named backend** promotes that URL into its own reusable resource with an id,
credentials, TLS settings, and (later) health/circuit-breaker config. Instead of
repeating a URL across APIs, you define backend `orders-be` once and reference it
from a policy with `set-backend-service backend-id="orders-be"`. This matters
because everything richer — load balancing, pools, per-backend auth, circuit
breakers — hangs off named backends, not off the inline `serviceUrl` string.
Think of it as the difference between hardcoding an IP and defining a Service in
Kubernetes: the named object is what you attach behavior to.

### VNet integration: reaching a private backend

To reach an **internal** backend, APIM has to be *on the network*. Two models,
mirroring what you learned about Container Apps environments in track 06:

- **VNet injection** (Developer/Premium tiers) — the whole APIM gateway is
  deployed *into* a subnet in your VNet, so it can route to private IPs directly.
  Powerful, but only on classic tiers and it's the more involved setup.
- **Private/VNet connectivity via internal mode / private endpoints** — depending
  on tier, APIM connects to backends over private networking so traffic never
  traverses the public internet.

The target this module fronts is an **internal-only Container Apps Environment**
(track 06 module 04): its apps resolve to a **private IP** via a **private DNS
zone** linked to the VNet. For APIM to reach it, APIM must be in (or peered to)
that VNet *and* able to resolve that private DNS zone — the same
private-DNS-linked-to-VNet requirement from track 06. When it can't resolve or
route, you get **503s** at the gateway, which is the diagnose-and-fix below.

### Load balancing across multiple backends (backend pools)

A **backend pool** is a named backend that fronts *several* real backends and
distributes requests across them — for scale, for blue/green, or for
multi-region. APIM supports weighted distribution (send 90% to A, 10% to B for a
canary) and priority groups (prefer group 1; fall to group 2 if all are down).
This is the gateway doing L7 load balancing at the product edge — conceptually
the same "spread traffic across replicas/versions" you saw with Kubernetes
Services and with track 06 revision traffic-splitting, but decided by APIM per
request rather than by a Service's kube-proxy.

### Circuit breaker and health: failing fast (cousin of track 13)

A named backend can carry a **circuit breaker**: rules that **trip** the backend
"open" (stop sending traffic to it) after a threshold of failures in a window,
then probe and **reset** it when it recovers. While open, requests to that
backend fail fast (or route to a healthy pool member) instead of piling onto a
struggling service. If that sounds familiar, it's because it's the **same
resilience idea as the service mesh** in track 13 (outlier detection / circuit
breaking between services) — just applied *north-south* at the gateway rather than
*east-west* in the mesh. The mental model transfers directly: don't hammer a sick
backend; shed load and let it recover.

### Backend authentication and header handling

A private backend still needs to trust the caller. APIM can present credentials to
the backend per named backend — a **managed identity** token (the same
system/user-assigned identity model from track 06 module 06), a client
certificate, or a static header/key. And because APIM terminates the client's TLS
and opens a *new* connection to the backend, you control which headers pass
through: forward a correlation id, inject an identity token for the backend,
strip the client's `Authorization` if the backend shouldn't see it. This is the
"APIM opens a fresh backend connection" consequence of the module-00 request path —
the backend leg is a separate request you shape.

## Command reference

| Command | What it does | Example |
|---------|--------------|---------|
| `az apim backend create` | Define a named backend | `az apim backend create --resource-group rg --service-name <inst> --backend-id orders-be --url https://orders.internal... --protocol http` |
| `az apim backend show` | Inspect a named backend | `az apim backend show --resource-group rg --service-name <inst> --backend-id orders-be -o jsonc` |
| `az apim api policy create` | Attach `set-backend-service` / LB policy | `az apim api policy create --resource-group rg --service-name <inst> --api-id orders --policy-format xml --value "@backend.xml"` |
| `az network vnet create` | Create the VNet APIM/backend share (track 06/2) | `az network vnet create --name vnet-apim --resource-group rg --address-prefix 10.0.0.0/16 --subnet-name apim --subnet-prefix 10.0.1.0/24` |
| `az containerapp env create` (internal) | Internal-only backend Environment (track 06) | `... --infrastructure-subnet-resource-id <id> --internal-only true` |

Flag-by-flag and XML breakdowns:

`az apim backend create --resource-group rg-apim-m05 --service-name <inst> --backend-id orders-be --url https://orders.<internal-env>.azurecontainerapps.io --protocol http`
- `--backend-id orders-be` — the reusable id you reference from policies.
- `--url` — the backend's address (a **private** FQDN once you go internal).
- `--protocol http` — how APIM speaks to it (`http`/`soap`).

Route to a named backend (inbound policy):
```xml
<inbound>
  <base />
  <set-backend-service backend-id="orders-be" />
</inbound>
```
- `set-backend-service backend-id="orders-be"` — overrides the API's default
  backend for this request, routing to the named backend (and thus its pool/
  circuit-breaker config).

Weighted load balancing across a pool (concept; pool defined as a backend of
type `Pool` referencing members with `weight`/`priority`):
- `weight` — relative share of traffic (90/10 for a canary).
- `priority` — failover order; higher-priority group is used until all its
  members are down, then the next group takes over (the "prefer A, fall back to
  B" pattern).

Circuit-breaker rule (on a named backend): a rule with a **failure threshold**,
a **window**, and a **trip duration** — e.g. "trip if >50% of calls fail over 1
minute; stay open 30s before probing." While open, the backend is skipped/fails
fast, mirroring track 13's outlier detection.

## Hands-on exercises

> **Time note:** this module needs **VNet integration**, which requires a
> **Developer-tier** (classic) instance — Consumption cannot join a VNet. That
> means a **30-45 minute** provisioning wait *and* a continuously-billing
> instance. Kick off the `az apim create` first, do the networking setup while it
> provisions, and **delete the instance the same day** (final cleanup step). If
> you want to avoid the classic-tier cost entirely, do exercises 1-4 (named
> backends, load balancing, circuit-breaker config) on **Consumption** with a
> public backend, and treat the VNet steps (5-8) as read-and-reason.

1. **Kick off the (slow) Developer instance, then build the network while it
   provisions.**
   ```powershell
   az group create --name rg-apim-m05 --location eastus
   $apim = "apimm05$((Get-Random -Max 99999))"
   az apim create --name $apim --resource-group rg-apim-m05 --location eastus `
     --publisher-name "You" --publisher-email you@example.com --sku-name Developer --no-wait
   # ^ returns immediately; provisioning continues ~30-45 min. Build the network now:
   az network vnet create --name vnet-apim --resource-group rg-apim-m05 `
     --address-prefix 10.0.0.0/16 --subnet-name aca-infra --subnet-prefix 10.0.0.0/23
   az network vnet subnet create --resource-group rg-apim-m05 --vnet-name vnet-apim `
     --name apim-subnet --address-prefix 10.0.4.0/24
   ```

2. **Create an internal-only Container Apps Environment (track 06 module 04).**
   ```powershell
   $subnet = az network vnet subnet show --resource-group rg-apim-m05 --vnet-name vnet-apim --name aca-infra --query id -o tsv
   az containerapp env create --name env-m05i --resource-group rg-apim-m05 --location eastus `
     --infrastructure-subnet-resource-id $subnet --internal-only true
   az containerapp create --name orders --resource-group rg-apim-m05 --environment env-m05i `
     --image mcr.microsoft.com/k8se/quickstart:latest --target-port 80 --ingress external
   $ifqdn = az containerapp show --name orders --resource-group rg-apim-m05 --query properties.configuration.ingress.fqdn -o tsv
   ```
   `$ifqdn` resolves to a **private** IP — unreachable from your laptop by design
   (track 06 module 04). That's the point.

3. **Define a named backend (public case first, to learn the object).** While the
   classic instance may still be provisioning, practice the concept against a
   throwaway Consumption instance or wait — then:
   ```powershell
   az apim backend create --resource-group rg-apim-m05 --service-name $apim `
     --backend-id orders-be --url "https://$ifqdn" --protocol http
   az apim backend show --resource-group rg-apim-m05 --service-name $apim --backend-id orders-be -o jsonc
   ```

4. **Point an API at the named backend.** Create an `orders` API and attach an
   inbound policy `<set-backend-service backend-id="orders-be" />` (save as
   `backend.xml`, apply with `az apim api policy create ...`). This routes the
   API through the named backend rather than an inline `serviceUrl`.

5. **Integrate APIM into the VNet.** Once the Developer instance shows
   `provisioningState=Succeeded`, place it in the `apim-subnet` (via
   `az apim update`/portal VNet configuration for the classic tier). Ensure the
   subnet and the internal env's **private DNS zone** are linked so APIM can
   resolve `$ifqdn`. (This mirrors track 06 module 04's private-DNS-linked-to-VNet
   requirement exactly.)

6. **Call through the gateway to the private backend.**
   ```powershell
   $key = az apim subscription show --resource-group rg-apim-m05 --service-name $apim --sid master --query primaryKey -o tsv
   $gw = az apim show --name $apim --resource-group rg-apim-m05 --query gatewayUrl -o tsv
   curl -H "Ocp-Apim-Subscription-Key: $key" "$gw/orders/"
   ```
   A 200 proves APIM reached a backend your laptop *cannot* reach directly — the
   secure topology: public only at the gateway, private everywhere behind it.

7. **Diagnose and fix: 503s from a backend VNet misconfiguration.** Deliberately
   break resolution/routing: unlink the internal env's private DNS zone from the
   APIM subnet's VNet (or point the named backend at the private FQDN *before*
   linking DNS). Call the gateway:
   ```powershell
   curl -i -H "Ocp-Apim-Subscription-Key: $key" "$gw/orders/"
   ```
   Expect **503 Service Unavailable** (or a backend-connection error) — the key
   passed (no 401), the API matched, but APIM **can't reach/resolve the private
   backend**. **Diagnose:** confirm APIM is in the VNet, the private DNS zone for
   the env's domain is **linked** to that VNet, and the subnet can route to the
   env's subnet. **Fix:** (re)link the private DNS zone to APIM's VNet so `$ifqdn`
   resolves to the private IP, and confirm routing; re-`curl` for 200. Lesson: a
   503 *after* a passing key is a **backend reachability** problem — DNS/routing —
   not an auth or path problem (contrast module 01's 404 and module 04's 401).

8. **Load-balancing / circuit-breaker reasoning.** Define a second backend
   (`orders-be-2`) and (conceptually, or via a Pool backend) describe an 80/20
   weighted split and a circuit-breaker rule that trips `orders-be` after >50%
   failures in 1 minute. Write down: which track-06 pattern the weighted split
   resembles (revision traffic-splitting) and which track-13 pattern the circuit
   breaker resembles (outlier detection / circuit breaking). You don't need to
   simulate real failures — the goal is to map the config to concepts you know.

9. **Cleanup — do this the same day (Developer tier bills continuously).**
   ```powershell
   az group delete --name rg-apim-m05 --yes --no-wait
   ```
   Then verify nothing lingers: `az apim list -o table` should not show the
   instance once deletion completes (classic-tier deletes are also slow).

## Independent challenge

Build the secure topology end to end: an **internal-only** Container Apps
Environment hosting a backend that is unreachable from your laptop, a
**Developer-tier** APIM integrated into the same VNet, a **named backend** (not an
inline `serviceUrl`) pointing at the private FQDN, and a successful authenticated
call through the gateway to that private backend. Then reproduce the **503 VNet
misconfiguration** (break DNS linkage or routing), capture the exact symptom, and
fix it — narrating why a 503-after-passing-key is categorically different from
module 01's 404 and module 04's 401. This draws on **track 06 module 04**
(internal environments, private DNS) and **module 04** here (the auth layer still
applies in front of the private backend). Because this uses a classic tier,
**tear the resource group down the same day** and confirm the APIM instance is
gone.

<details><summary>Stuck? One hint</summary>

The private backend only works if APIM can *resolve* its FQDN to the private IP
*and* route to it. That resolution is the same track-06-module-04 mechanism: a
**private DNS zone** named after the environment's domain, **linked to the VNet
APIM sits in**. List zones with `az network private-dns zone list` and their VNet
links with `az network private-dns link vnet list`. A 503 with a passing key is
almost always "APIM can't resolve or reach the backend" — start at DNS linkage.

</details>

## Common mistakes & troubleshooting

- **Leaving the backend public.** If the backend keeps external ingress, callers
  can bypass APIM entirely. The secure pattern is internal-only backend + APIM as
  the only public entry.
- **Using Consumption for VNet integration.** Consumption can't join a VNet — VNet
  integration needs Developer/Premium. Trying it on Consumption fails; that's a
  tier limitation, not a bug.
- **Unlinked private DNS zone → 503.** The classic track-06 mistake resurfaces:
  APIM can't resolve the internal FQDN unless the env's private DNS zone is linked
  to APIM's VNet. Symptom is 503/connection errors after a passing key.
- **Inline `serviceUrl` where you needed a named backend.** Load balancing, pools,
  circuit breakers, and per-backend credentials all require a **named backend**;
  they can't hang off an inline URL.
- **Misreading the status code.** 401 = auth (module 04); 404 = path/backend
  mapping (module 01); **503 = backend reachability** (this module). Each points
  at a different layer.
- **Cost pitfall — the classic-tier trap.** This is the module most likely to
  leave a **Developer-tier instance running** because it's slow to create and you
  step away. It bills continuously. Set a reminder and delete the resource group
  the same day; verify with `az apim list -o table`.

## Checkpoint quiz

Write down your answer to each question before expanding it — checking without
attempting first is the single easiest way to fool yourself into thinking
you've learned this.

1. Why is a public backend behind APIM a security problem, and what's the secure
   alternative?
2. What is a named backend, and what capabilities require one rather than an
   inline `serviceUrl`?
3. Why can't you use the Consumption tier for VNet integration, and which tiers
   can?
4. What track-06 mechanism must be in place for APIM to reach an internal
   Container Apps backend by its FQDN?
5. You call the gateway, the key is accepted, and you get a 503. Which layer is
   the problem, and what do you check first?
6. What is a backend pool, and give one use for weighted distribution.
7. Which track-13 pattern is APIM's circuit breaker the north-south cousin of,
   and what does "tripping open" do?
8. How can APIM authenticate *to* a private backend without a stored secret?

<details><summary>Show answers</summary>

1. A public backend can be called directly, bypassing the gateway's auth/limits/
   metering. The secure alternative is an **internal-only** backend reachable only
   by APIM, with APIM as the sole public entry point.
2. A reusable backend resource with an id, credentials, TLS, and health/circuit
   config. **Load balancing, backend pools, circuit breakers, and per-backend
   credentials** all require a named backend.
3. Consumption can't join a VNet — it's a serverless multi-tenant tier. **VNet
   integration/injection requires Developer or Premium.**
4. A **private DNS zone** named after the environment's domain, **linked to the
   VNet APIM is in**, so the internal FQDN resolves to the private IP (plus subnet
   routing) — the same track-06-module-04 requirement.
5. The **backend reachability** layer. Check that APIM is in the VNet, the env's
   private DNS zone is linked to APIM's VNet (so the FQDN resolves), and routing
   between subnets works.
6. A named backend fronting several real backends with distribution across them.
   Weighted distribution enables canary/blue-green (e.g. 90/10) or spreading load.
7. The service mesh's **outlier detection / circuit breaking** (track 13).
   Tripping open stops sending traffic to a failing backend so requests fail fast
   (or route to healthy members) until it recovers.
8. With a **managed identity** (system/user-assigned, track 06 module 06) whose
   token APIM presents to the backend — no stored secret — or a client
   certificate.

</details>

## Cumulative review

Closed-book. Don't reopen modules 03-05 while attempting these — mix across the
whole track so far and the tracks it builds on.

1. For one request, place these in the exact pipeline order and say which fails
   with which status: subscription-key check, `validate-jwt`, `rate-limit-by-key`,
   `set-backend-service` to a private backend (modules 03-05).
2. Match each status to its layer and a one-line fix: **401**, **403**, **404**,
   **429**, **503** (modules 01, 03, 04, 05).
3. A per-consumer rate limit is throttling legitimate users. Give the wrong-scope
   cause, the `-by-key` fix, and the `counter-key` expression (module 03).
4. A token you decoded and confirmed valid is rejected 401 at the gateway.
   Name the single most likely policy misconfiguration and how you'd confirm it
   against the token (module 04, track 16).
5. Explain why the same "circuit breaker" idea appears in both this track and the
   service mesh (track 13), and what differs about *where* it's applied.
6. You moved the backend to an internal-only Container Apps Environment and now
   get 503s. List, in order, the track-06/module-05 things you'd verify to
   restore reachability.
7. Justify, on cost grounds, using Consumption for modules 03-04 but Developer for
   module 05 — and state the same-day rule that follows from it (modules 01, 05).
8. You need `v2` of an API to route 10% of traffic to a new backend while `v1`
   stays stable. Combine a **module-02** concept and a **module-05** concept to
   describe the setup.
9. Where does each of these belong — inbound, backend, outbound, or on-error:
   strip a `Server` header, `validate-jwt`, `set-backend-service`, return a
   friendly error body on failure (modules 03-05)?
10. A teammate points the API's inline `serviceUrl` at the private FQDN and
    expects load balancing "later." Explain what they'll have to change and why
    (module 05).

<details><summary>Show answers</summary>

1. Order: subscription-key check → `rate-limit-by-key` → `validate-jwt` →
   `set-backend-service` → forward. Key fails **401**; rate limit fails **429**;
   JWT fails **401** (or **403** if a scope is missing); an unreachable private
   backend fails **503**.
2. **401** = auth/token (fix: valid key or matching audience/issuer). **403** =
   valid token missing scope (fix: grant/require correct scope). **404** =
   path/backend mapping (fix: `--path` vs `--service-url`). **429** = throttled
   (fix: per-consumer `-by-key` limits / raise limit). **503** = backend
   unreachable (fix: VNet/private-DNS/routing).
3. Cause: a **plain** `rate-limit` pooling all consumers at one scope. Fix: use
   `rate-limit-by-key` with `counter-key="@(context.Subscription.Id)"`.
4. An **audience (`aud`) mismatch** in `validate-jwt` (or issuer/version). Confirm
   by decoding the token (jwt.ms) and comparing its `aud`/`iss` to the policy's
   `<audiences>`/`<issuers>`.
5. Both prevent hammering a failing dependency by shedding load and letting it
   recover. The mesh applies it **east-west** between services (track 13); APIM
   applies it **north-south** at the product edge on a named backend.
6. Verify: APIM is in the VNet; the env's **private DNS zone** is **linked** to
   APIM's VNet (FQDN resolves to private IP); subnet routing allows APIM→env; then
   re-test — a passing key + 503 means reachability, not auth.
7. Modules 03-04 need no VNet, so **Consumption** (pay-per-call, idles free) is
   cheapest; module 05 needs VNet integration, which **only classic tiers**
   support, so **Developer** — which **bills continuously**, hence **delete it the
   same day**.
8. Use a **version set** (module 02) so `v2` is its own API, and a **backend pool
   with weighted distribution** (module 05) on `v2`'s backend sending ~10% to the
   new member and 90% to the stable one.
9. Strip `Server` → **outbound**. `validate-jwt` → **inbound**.
   `set-backend-service` → **inbound** (or backend). Friendly error body →
   **on-error**.
10. Inline `serviceUrl` can't carry load balancing, pools, or circuit breakers —
    they require a **named backend**. They'll have to define a named backend (or a
    Pool backend) and route to it via `set-backend-service`.

</details>

## Next

[06-developer-portal-and-api-products](../06-developer-portal-and-api-products/README.md)
— package APIs into **products** with subscription models, enable self-service
sign-up, add terms of use, and publish the auto-generated developer portal
(survey level — this is the platform-ops view, not full API-product management).
