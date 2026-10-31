# API Gateway Concepts & Where APIM Fits

## Why this matters

You already know how to give a backend a URL — external ingress on a Container
App (track 06), an Ingress controller in front of an AKS Service (track 07). But
a URL is plumbing, not a product: it has no way to identify who's calling, throttle
abuse, version safely, or show you per-consumer usage. An **API gateway** is the
layer that turns raw endpoints into governed, measurable API products, and Azure
API Management (APIM) is Azure's managed version of that layer. This module builds
the mental model before you provision anything, so every later command has a
place to hang.

## Concepts

### A raw endpoint is not a managed API

In track 06 you ran `az containerapp ingress enable --type external` and got an
FQDN that returned 200 from the internet. In track 07 you pointed an Ingress
controller at a Service and did the same. Both are real, working HTTP endpoints —
and that's *all* they are. There's no notion of "who is allowed to call this,"
"how often," "which version of the contract they're using," or "how many calls
did customer X make last month." The endpoint's job ends at *routing bytes to a
container*. Everything that makes an endpoint a **product** — identity of the
caller, limits, packaging, analytics, a contract you can publish — has to be
added on top. That's the gap an API gateway fills.

### The gateway pattern: one front door for many backends

An **API gateway** is a reverse proxy with opinions. Every client request hits
the gateway first; the gateway decides whether to accept it, possibly transforms
it, forwards it to the right backend, and then possibly transforms the response
on the way out. Structurally this is the same "traffic enters at one controlled
edge" idea you met twice already — the **Ingress controller** in track 07 (one
entry point routing to many Services) and the **Envoy-based ingress** fronting
Container Apps in track 06. The gateway generalizes it: instead of only routing
by host/path, it also authenticates, rate-limits, meters, versions, and
reshapes. One front door, many backends, one place to enforce cross-cutting
rules — so each backend team doesn't reinvent auth and throttling.

### Gateway vs. ingress vs. service mesh

These three overlap enough to blur, so pin them down. An **Ingress controller**
(track 07) is L7 routing *into* a cluster — host/path to Service, plus TLS
termination. A **service mesh** (track 13) governs *east-west* traffic
*between* services inside the platform — mTLS, retries, traffic splitting,
service-to-service authz. An **API gateway** governs *north-south* traffic at
the *product* edge — the boundary between your organization's APIs and their
consumers (partners, mobile apps, other teams). Ingress asks "which pod?"; the
mesh asks "can service A call service B, securely?"; the gateway asks "is this
*consumer* allowed to use this *API product*, within their quota, on this
version?" APIM is a gateway; it sits *in front of* an Ingress or Container App,
not instead of it.

### What APIM adds on top of the endpoint

Concretely, APIM layers five things onto a backend you already have:

- **Policies** — a per-API/per-operation pipeline (inbound → backend → outbound →
  on-error) where you enforce rate limits, quotas, IP filtering, JWT validation,
  and request/response rewriting. This is the heart of the product (module 03).
- **Subscription keys** — a simple issued credential (`Ocp-Apim-Subscription-Key`
  header) that identifies *which consumer* is calling, so you can meter and
  throttle per consumer (module 04/06).
- **Products** — a package that groups one or more APIs with a policy and a
  subscription model, so "the Partner API bundle, 1000 calls/day" is a first-class
  thing consumers subscribe to (module 06).
- **Developer portal** — an auto-generated, brandable website where consumers
  read your API docs, get keys, and try calls (module 06).
- **Analytics** — built-in per-API/per-consumer usage, latency, and error
  reporting, integrable with Application Insights (module 07).

The backend doesn't change. APIM wraps it.

### Where APIM sits in a request's life

Follow one call. A partner's app sends `GET https://<your-apim>.azure-api.net/orders/42`
with a subscription key header. APIM terminates TLS, matches the request to an
**API** and **operation**, runs the **inbound policies** (validate the key,
check the rate limit, validate a JWT, maybe rewrite the path), then forwards to
the configured **backend** — which is your Container App's internal FQDN or your
AKS Ingress. The backend responds; APIM runs **outbound policies** (strip an
internal header, cache the response), and returns it to the caller. Along the
way it records the call for analytics. The consumer never sees the backend URL,
never holds a backend credential, and is subject to your rules — that's the
product boundary the rest of this track builds out.

## Command reference

This module is conceptual — the only commands are read-only orientation ones you
run against resources you *already* have from tracks 06/07, plus checking that
the APIM CLI extension is present. Real provisioning starts in module 01.

| Command | What it does | Example |
|---------|--------------|---------|
| `az extension add --name apim` | Ensure the APIM CLI extension is installed | `az extension add --name apim` |
| `az apim -h` | List the APIM command groups (orientation) | `az apim -h` |
| `az containerapp show` (ingress) | Read a Container App's FQDN — a candidate backend | `az containerapp show --name web --resource-group rg-aca --query properties.configuration.ingress.fqdn -o tsv` |
| `az provider show` | Confirm the APIM resource provider is registered | `az provider show --namespace Microsoft.ApiManagement --query registrationState -o tsv` |

Flag-by-flag breakdowns:

`az apim show --name <instance> --resource-group <rg> --query "{gateway:gatewayUrl, portal:developerPortalUrl, sku:sku.name}" -o jsonc`
- `--query "{...}"` — a JMESPath projection pulling just the three fields that
  matter for orientation: the **gateway URL** (where consumers call), the
  **developer portal URL** (module 06), and the **SKU/tier** (the cost lever from
  the track intro). You'll run this for real once an instance exists in module 01.
- `-o jsonc` — colorized JSON so the shape is readable.

`az provider show --namespace Microsoft.ApiManagement --query registrationState -o tsv`
- `--namespace Microsoft.ApiManagement` — the Azure resource provider that must
  be `Registered` on your subscription before you can create an APIM instance.
- `-o tsv` — bare value, easy to test in a script. If it prints `NotRegistered`,
  run `az provider register --namespace Microsoft.ApiManagement` (module 01
  covers this).

## Hands-on exercises

No APIM instance is created here — nothing bills. These exercises cement the
mental model against resources you can stand up cheaply or already have.

1. **Confirm your tooling and provider.** Install the extension and check the
   provider:
   ```powershell
   az extension add --name apim
   az provider show --namespace Microsoft.ApiManagement --query registrationState -o tsv
   ```
   If it prints anything other than `Registered`, run
   `az provider register --namespace Microsoft.ApiManagement` and re-check in a
   few minutes. (Registration is a one-time, free, per-subscription step.)

2. **Stand up a cheap backend to think about.** Reuse the track-06 pattern —
   deploy a public Container App you'll conceptually front later:
   ```powershell
   az group create --name rg-apim-m00 --location eastus
   az containerapp env create --name env-m00 --resource-group rg-apim-m00 --location eastus
   az containerapp create --name orders --resource-group rg-apim-m00 --environment env-m00 `
     --image mcr.microsoft.com/k8se/quickstart:latest --target-port 80 --ingress external
   $fqdn = az containerapp show --name orders --resource-group rg-apim-m00 --query properties.configuration.ingress.fqdn -o tsv
   curl "https://$fqdn"
   ```
   You get a 200. **Write down** everything this endpoint does *not* give you
   from the "what APIM adds" list (identity of caller, rate limit, versioning,
   metering, portal).

3. **Prove the endpoint has no consumer identity.** From two different machines
   or two shells, `curl` the FQDN. Note that the backend cannot tell the two
   callers apart — there's no key, no per-consumer anything. This is the concrete
   thing subscription keys will fix.

4. **List the properties an API product would need.** On paper, sketch what
   "Orders API, Free tier: 100 calls/day" would require: a credential to identify
   the consumer, a counter, a limit, a rejection response, and a usage report.
   Map each to the APIM feature that provides it (subscription key, rate-limit
   policy, quota policy, `429` response, analytics).

5. **Draw the request path.** For a hypothetical
   `GET https://<apim>.azure-api.net/orders/42`, write the ordered stages:
   TLS terminate → match API/operation → inbound policies → backend forward →
   outbound policies → response → analytics. For each stage, name one thing that
   could go wrong (wrong key, over quota, backend 503, header not stripped).

6. **Contrast the three edge technologies.** In a small table, fill in
   Ingress (track 07) vs. service mesh (track 13) vs. API gateway (this track)
   across three columns: *primary traffic direction* (north-south vs east-west),
   *primary question it answers*, and *does APIM replace it or sit in front of
   it*. Confirm your answers against the "gateway vs ingress vs mesh" concept.

7. **Diagnose (paper) a misplaced responsibility.** A teammate says "we don't
   need APIM, we already have rate limiting in the Ingress controller's nginx
   config." List two things they still can't do that APIM provides (per-consumer
   metering/quotas tied to an issued key; a self-service developer portal), and
   one reason centralizing at the gateway beats per-backend config (one place to
   enforce, consistent across many backends/teams).

8. **Cleanup.**
   ```powershell
   az group delete --name rg-apim-m00 --yes --no-wait
   ```
   (This module created only a Container App and Environment — cheap, but delete
   them anyway so nothing lingers before module 01.)

## Independent challenge

Without provisioning APIM, produce a one-page written "API product proposal" for
the `orders` Container App you deployed in the exercises. It must name: the
consumers (e.g. an internal mobile team and an external partner), how each will
be identified at the gateway, at least two limits you'd enforce and why, the
versioning approach you anticipate needing, and what analytics you'd want to
report monthly. Draw explicitly on **track 06** (which ingress mode the backend
uses today and how that changes once APIM fronts it) and **track 07** (how this
gateway relates to an Ingress controller you already understand). The goal is to
be able to defend *why each APIM feature exists* before you touch a single `az
apim` command. Tear down any leftover Container App resources when done.

<details><summary>Stuck? One hint</summary>

Anchor the proposal on the "what APIM adds" list (policies, subscription keys,
products, developer portal, analytics) and, for each item, write one sentence:
"the raw Container App FQDN can't do X, so APIM's Y provides it." If you can
write that sentence honestly for all five, you've understood where APIM fits —
and you've also written the requirements for your own capstone.

</details>

## Common mistakes & troubleshooting

- **Thinking APIM replaces your Ingress/Container App.** It doesn't — it sits in
  front. The backend keeps its ingress; APIM becomes the public front door and
  the backend ideally becomes internal-only later (module 05).
- **Confusing a gateway with a mesh.** A mesh governs service-to-service
  (east-west) traffic *inside* the platform; a gateway governs consumer-to-API
  (north-south) traffic at the product edge. They coexist; APIM is the latter.
- **Assuming "it has a URL, so it's an API."** A URL routes bytes. A managed API
  adds identity, limits, versioning, packaging, and analytics — none of which a
  bare FQDN provides.
- **Cost pitfall (get ahead of it now).** The moment you create a non-Consumption
  APIM instance in later modules, it bills continuously. Nothing in *this* module
  creates one — but internalize the rule before module 01: classic tiers bill
  whether or not traffic flows; delete them the same day.
- **Skipping provider registration.** If `Microsoft.ApiManagement` isn't
  `Registered`, your first `az apim create` fails with a provider error, not a
  helpful message. Register it once, up front.

## Checkpoint quiz

Write down your answer to each question before expanding it — checking without
attempting first is the single easiest way to fool yourself into thinking
you've learned this.

1. Give three capabilities a managed API product has that a bare Container App
   external FQDN does not.
2. In one sentence each, distinguish an Ingress controller, a service mesh, and
   an API gateway by the primary question each answers.
3. Does APIM replace your AKS Ingress controller or sit in front of it? Why?
4. List, in order, the stages a request passes through inside APIM from TLS
   termination to analytics.
5. What is a subscription key for, and what problem from exercise 3 does it solve?
6. Name the five things this module said APIM layers on top of a backend.
7. Why is centralizing rate limiting at the gateway often better than
   configuring it per-backend (e.g. in each nginx Ingress)?

<details><summary>Show answers</summary>

1. Any three of: identifies the calling consumer (subscription keys); enforces
   per-consumer rate limits/quotas; versioning of the contract; a self-service
   developer portal; per-consumer/per-API analytics; centralized auth (JWT
   validation) at the edge.
2. Ingress: "which Service/pod does this host/path route to?" Mesh: "can service
   A call service B, securely (mTLS/authz), east-west?" Gateway: "is this
   *consumer* allowed to use this *API product*, within quota, on this version,
   north-south?"
3. It sits **in front of** it. APIM is the public product edge; the Ingress
   controller keeps routing inside the cluster. Ideally the backend becomes
   internal-only once APIM fronts it.
4. TLS terminate → match API/operation → inbound policies → forward to backend →
   outbound policies → return response → record analytics.
5. It's an issued credential (`Ocp-Apim-Subscription-Key`) that identifies which
   consumer is calling, so APIM can meter and throttle per consumer — solving the
   "the backend can't tell two callers apart" problem.
6. Policies, subscription keys, products, developer portal, analytics.
7. One place to enforce a consistent rule across many backends and teams (no
   per-backend reinvention), plus the gateway can tie the limit to an *issued
   consumer identity* (the subscription key), which a backend's generic nginx
   limit can't.

</details>

## Next

[01-provisioning-apim-and-importing-a-first-api](../01-provisioning-apim-and-importing-a-first-api/README.md)
— choose a tier (including the cheap Consumption tier), provision an instance
(this is the slow one — 30-45 min for classic tiers), and import an OpenAPI spec
that fronts one of your Container Apps / AKS backends.
