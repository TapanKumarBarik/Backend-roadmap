# Track 19: Azure API Management (APIM)

By now you can put a backend service on the internet: a Container App with
external ingress (track 06), or an AKS workload behind an Ingress controller
(track 07). That gives you a reachable URL — but a raw URL is not the same
thing as a *managed API product*. It has no subscription keys, no rate limits,
no per-consumer analytics, no versioning story, no developer portal, and no
place to centrally enforce authentication. This track adds the layer that sits
**in front of** those backends and turns them into products: **Azure API
Management (APIM)**.

You'll front the exact Container Apps and AKS backends you built earlier with a
real API gateway, import an OpenAPI spec, version and revise APIs safely, write
policies (rate limiting, quotas, IP filtering, request/response transformation),
validate Entra ID JWTs at the gateway (tying directly into the identity work
from track 16), integrate backends over a VNet, group APIs into products with
subscription keys, and wire APIM's analytics into Application Insights alongside
the observability stack from track 12.

> **Cost warning:** APIM's classic tiers — **Developer, Basic, Standard, and
> Premium** — bill **continuously for as long as the instance exists**, whether
> or not a single request flows through it, because they provision dedicated
> capacity ("units"). This is *not* like a Container App that scales to zero.
> The **Consumption** tier is pay-per-call and idles at effectively no cost, so
> most of this track uses it. When you do spin up a non-Consumption instance for
> an exercise (VNet integration and the developer portal need one), **delete it
> the same day** — `az group delete --name <rg> --yes --no-wait`. A forgotten
> Developer-tier instance left running over a weekend is a real, avoidable bill.

## How this track works

- Go in order — each module assumes the ones before it. Module 01 provisions
  the instance every later module reuses conceptually; module 04's JWT work
  assumes the policy language from module 03.
- Every module except this index and the capstone follows the same shape:
  **Why this matters → Concepts → Command reference → Hands-on exercises →
  Independent challenge → Common mistakes & troubleshooting → Checkpoint quiz →
  Next**. Two modules also carry a **Cumulative review**.
- All exercises run real `az apim` / `az apim api` commands (and raw policy
  XML) against your actual Azure subscription. **APIM provisioning is slow** —
  creating a classic-tier instance can take **30–45 minutes**, and even a
  Consumption instance takes several minutes. Every module that creates an
  instance calls this out so you aren't left wondering if a command hung.
- Each module ends with an explicit cleanup step. Don't skip it — see the cost
  warning above.
- The capstone (module 08) has no quiz or challenge scaffolding — it asks you to
  combine everything: APIM fronting a Container App over VNet integration, a
  versioned API, a rate-limit policy, JWT validation against a real Entra ID
  token, a product with a subscription key, and analytics showing real traffic.

## Modules

| # | Module | What it covers | Rough time |
|---|--------|-----------------|------------|
| 00 | [api-gateway-concepts-and-where-apim-fits](00-api-gateway-concepts-and-where-apim-fits/README.md) | The gateway pattern; why a raw Ingress/Container App URL isn't a managed API product; what APIM adds (policies, developer portal, subscription keys, analytics) | 45-60 min |
| 01 | [provisioning-apim-and-importing-a-first-api](01-provisioning-apim-and-importing-a-first-api/README.md) | APIM tiers/SKUs (incl. Consumption), provisioning an instance, importing an OpenAPI spec, fronting a Container App / AKS Ingress backend | 60-90 min |
| 02 | [api-versioning-and-revisions](02-api-versioning-and-revisions/README.md) | Version sets, path/header/query versioning schemes, revisions for safe iteration, deprecation strategy | 60-75 min |
| 03 | [policies-in-depth](03-policies-in-depth/README.md) | Policy XML and expression language; inbound/backend/outbound/on-error sections; rate limiting, quota, IP filtering, request/response transformation | 75-90 min |
| 04 | [authentication-and-authorization-at-the-gateway](04-authentication-and-authorization-at-the-gateway/README.md) | Subscription keys vs OAuth2/JWT; `validate-jwt` against an Entra ID token (track 16); client certificate auth | 75-90 min |
| 05 | [backend-integration-patterns](05-backend-integration-patterns/README.md) | Named backends, VNet integration to a private Container App, load balancing across backends, backend pools & circuit breaker (cousin of track 13 mesh resilience) | 75-90 min |
| 06 | [developer-portal-and-api-products](06-developer-portal-and-api-products/README.md) | Products, grouping APIs, self-service subscriptions, terms of use, publishing the developer portal (survey level) | 45-60 min |
| 07 | [observability-for-apis](07-observability-for-apis/README.md) | Built-in analytics, Azure Monitor metrics/diagnostic logs, Application Insights integration, correlating APIM with backend traces (track 12) | 60 min |
| 08 | [kong-and-traefik-oss-gateways](08-kong-and-traefik-oss-gateways/README.md) | The same gateway pattern on a self-hosted, open-source gateway: Kong services/routes/plugins, key-auth, rate limiting, DB-less config | 60-90 min |
| 09 | [capstone-project](09-capstone-project/README.md) | End-to-end: APIM over VNet to a Container App, versioned API, rate limiting, Entra ID JWT validation, a product with a subscription key, live analytics | 3-5 hours |

## Prerequisites

- An active Azure subscription (already confirmed for this curriculum).
- Everything from [06-azure-container-apps](../06-azure-container-apps/README.md):
  external vs internal ingress, VNet integration, and managed identity — this
  track fronts those Container Apps backends.
- Ingress fundamentals from [07-aks](../07-aks/README.md): an AKS workload
  behind an Ingress controller is one of the backends you'll front.
- [16-identity-deep-dive](../16-identity-deep-dive/README.md): Entra ID,
  app registrations, and the anatomy of a JWT (issuer, audience, signature).
  Module 04's JWT validation builds directly on it. *(If track 16 isn't built
  out yet, module 04 re-states the token facts it depends on.)*

[Back to main curriculum](../README.md)

Start here → [00-api-gateway-concepts-and-where-apim-fits/README.md](00-api-gateway-concepts-and-where-apim-fits/README.md)
