# Capstone Project

## Why this matters

Every earlier module drilled one capability in isolation. Real systems combine
them, and the combining is where the subtle failures live: a VNet that's fine
until Dapr needs to cross it, a scale rule that works until traffic splitting
changes which revision gets load, a managed identity that authenticates until
the role assignment is scoped wrong. This capstone forces you to integrate the
whole track into one working deployment, verify it behaves, and then tear it
down cleanly — the same loop you'll run in production.

## The project

Build a small but complete Container Apps system, entirely with real
`az containerapp ...` commands against your subscription, that satisfies every
acceptance criterion below. Design it yourself; there is no full solution here,
only the requirements and hints.

**Scenario.** A two-service app: a public **frontend** that, per request,
invokes a private **backend** over Dapr; the backend reads a secret (e.g. a
"license key" or connection string) from Key Vault via managed identity. The
frontend autoscales on HTTP load. You ship a v2 of the frontend and run it as a
canary. Everything lives in a VNet you built, and all logs/metrics are
observable.

Suggested resource group: `rg-aca-capstone` in a single region. Use the
quickstart image (`mcr.microsoft.com/k8se/quickstart:latest`) or any small HTTP
image; the wiring, not the app code, is the point.

### Acceptance criteria

- [ ] A **VNet** you created, with a correctly-sized dedicated subnet, hosts the
      Environment (module 04). Verify the subnet size meets the minimum for your
      plan.
- [ ] A single **Container Apps Environment** integrated into that VNet, using a
      **Log Analytics workspace you created** (not auto-generated) (modules 01,
      04).
- [ ] A **frontend** app with **external ingress** reachable over HTTPS on its
      FQDN (modules 02, 04).
- [ ] A **backend** app with **internal ingress** only, not reachable from the
      public internet (modules 02, 04).
- [ ] **Dapr enabled** on both apps with stable app-ids; the frontend invokes
      the backend **by app-id** (not IP/FQDN), and you can demonstrate the call
      succeeds (module 05).
- [ ] The backend reads a secret from **Key Vault** using a **managed identity**
      with a **role assignment scoped to the vault**; the secret value never
      appears in the app's plaintext config (module 06).
- [ ] The frontend has a **KEDA scale rule** (HTTP concurrency, or a queue-based
      rule if you add a queue) and scales up under load and back toward zero when
      idle (module 03).
- [ ] The frontend runs in **multiple-revision mode** with **two revisions** and
      a **traffic split** (e.g. 80/20 canary), and you can shift the split and
      roll back instantly (module 05).
- [ ] **Monitoring is wired up**: you can produce (a) the Replicas metric
      climbing under load, (b) a KQL query over the console table showing
      requests, and (c) a system-log entry explaining a revision's state
      (module 07).
- [ ] **Verification under load**: you drive traffic, observe the frontend scale
      up (metrics + system logs correlated), and observe the traffic split
      distributing requests across the two revisions.
- [ ] **Teardown**: everything is deleted with `az group delete` and you confirm
      no lingering billable resources (Environment, Log Analytics workspace,
      Key Vault, any VM/NAT/firewall you added).

### Hints

- Build outside-in: resource group → VNet + subnet → Log Analytics workspace →
  Environment (on the subnet, reusing the workspace) → backend → frontend →
  identity + Key Vault + role → scale rule → second revision + traffic split →
  monitoring queries. Verifying each layer before adding the next saves hours.
- Backend internal ingress plus Dapr is the right combination: the frontend
  reaches it by Dapr app-id over the Environment's internal network; it never
  needs a public endpoint.
- For the managed-identity-to-Key-Vault step, remember identity **and** role
  assignment **and** propagation time — grant the role, wait, then roll the
  revision (module 06's failure mode is the thing to avoid here).
- Give revisions readable suffixes (`--revision-suffix v1`/`v2`) so your
  `ingress traffic set --revision-weight` commands are legible.
- To *prove* scaling and splitting rather than assume it: correlate the
  `Replicas` metric (per-minute) with `ContainerAppSystemLogs_CL` scaling
  events, and hit each revision's dedicated FQDN to confirm both are live before
  trusting the weighted split.
- If the frontend can reach the backend directly but Dapr invocation fails,
  check the app-ids and that both apps share the one Environment (module 01/04
  boundary), not the network path.
- Keep an eye on cost the whole time: the Environment idles cheap on
  Consumption, but the Log Analytics workspace bills by volume and any VM/NAT/
  firewall you add for the VNet bills per hour. Don't leave the capstone
  running overnight "to finish tomorrow" without deleting the pricey bits.

### Before you move on

Tear it all down, then rebuild the entire thing from memory a few days from now
without rereading the earlier modules — that second, unaided pass is what
converts "I followed the steps" into "I can design this." If you get stuck on a
specific layer, that's precisely the module to revisit.

Completing this capstone closes out the **Azure Container Apps** track, and
with it the whole arc from general networking through Azure networking to a
real deployed platform. This track kept raising one honest question it
deliberately left open — **when would AKS be the better choice?**
(fine-grained control, cluster-wide operators, DaemonSets, complex
networking, or existing heavy Kubernetes investment) — and that's exactly
what the next track answers. Everything here that felt automatic (an
Environment, a revision, a scale rule, a managed identity) has a raw,
hand-operated equivalent in Kubernetes that AKS will have you build and run
yourself. Knowing what Container Apps abstracted away for you is the best
possible preparation for appreciating what AKS gives back.

## Next

Continue to
[07-aks](../../07-aks/README.md), where you'll run the same kinds of
workloads on a cluster you operate directly, and see firsthand everything
Container Apps was quietly doing for you here.
</content>
