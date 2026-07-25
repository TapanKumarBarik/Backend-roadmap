# Application Gateway & WAF

## Why this matters
Application Gateway is Azure's L7 (HTTP) load balancer — the thing you reach for
when you need path-based routing, host-based routing, TLS termination, or a Web
Application Firewall, none of which the L4 Load Balancer from module 04 can do.
It's also one of the two resources in this track that **bill hourly even when
idle** (Azure Firewall is the other), so this module is where cost discipline
stops being optional. You'll build a working gateway, route by URL path, and
turn on the WAF.

## Concepts

### L7 load balancing vs. the L4 Load Balancer
Application Gateway is the **L7 reverse proxy / load balancer** from track 1: it
terminates the HTTP(S) connection, reads the request (host header, URL path,
cookies), and makes routing decisions based on Layer-7 content — things the
Azure Load Balancer (L4, module 04) fundamentally can't see. Rule of thumb: if
the decision depends on the URL, host header, or requires TLS termination or a
WAF, you need Application Gateway; if it's raw TCP/UDP flow distribution, the
L4 Load Balancer is cheaper and simpler.

### The Application Gateway components
App Gateway wires together a chain of pieces, and the terminology is worth
memorizing because errors reference them: a **frontend IP** (public and/or
private), one or more **listeners** (a frontend IP + port + protocol, optionally
a hostname and TLS cert), **backend pools** (the servers/IPs/FQDNs receiving
traffic), **HTTP settings** (backend port, protocol, probe, timeouts), a
**health probe**, and **routing rules** that tie a listener to a backend pool
via HTTP settings. Path-based rules add a **URL path map** that sends different
paths to different backend pools.

### Its own subnet, and the SKU/tier choice
App Gateway must live in its **own dedicated subnet** (nothing else in it),
which is why module 01 had you pre-create `appgw-subnet`. It comes in
**Standard_v2** (load balancing only) and **WAF_v2** (adds the Web Application
Firewall) tiers, both on the v2 autoscaling engine. v2 bills a fixed hourly
gateway charge **plus** a capacity-unit charge — meaning even an idle WAF_v2
gateway accrues cost every hour it exists. Pick WAF_v2 when you want the
firewall; otherwise Standard_v2.

### TLS termination
App Gateway can **terminate TLS**: clients connect over HTTPS to a listener that
holds the certificate, the gateway decrypts, inspects (needed for path routing
and WAF), and then forwards to the backend over HTTP or a re-encrypted HTTPS
(end-to-end TLS). Terminating at the gateway centralizes certificate management
and is what lets the WAF and path-based routing see request content. This is the
"TLS termination at the edge" pattern from track 1's HTTP/TLS material.

### The Web Application Firewall (WAF)
The WAF (on the WAF_v2 tier) inspects HTTP requests against managed rule sets
(OWASP Core Rule Set) to block common attacks — SQL injection, XSS, path
traversal, and so on. It runs in two modes: **Detection** (logs matches, blocks
nothing) and **Prevention** (actively blocks). This is the "web application
firewall / OWASP filtering" concept from track 1, operating at L7 — distinct
from an NSG, which filters at L3/L4 on IP and port and has no idea what HTTP is.
Start in Detection mode to find false positives before switching to Prevention.

## Command reference

| Command | What it does | Example |
|---|---|---|
| `az network application-gateway create` | Creates an App Gateway (frontend, listener, pool, rule) | `az network application-gateway create -g agw-lab-rg -n web-agw --sku WAF_v2 --capacity 2 --vnet-name lab-vnet --subnet appgw-subnet --public-ip-address agw-pip --frontend-port 80 --http-settings-port 80 --http-settings-protocol Http --priority 100` |
| `az network application-gateway address-pool create` | Adds a backend pool | `az network application-gateway address-pool create -g agw-lab-rg --gateway-name web-agw -n api-pool --servers 10.0.2.10 10.0.2.11` |
| `az network application-gateway url-path-map create` | Creates a path-based routing map | `az network application-gateway url-path-map create -g agw-lab-rg --gateway-name web-agw -n pathmap --paths /api/* --address-pool api-pool --default-address-pool appGatewayBackendPool --http-settings appGatewayBackendHttpSettings --default-http-settings appGatewayBackendHttpSettings` |
| `az network application-gateway probe create` | Adds a custom health probe | `az network application-gateway probe create -g agw-lab-rg --gateway-name web-agw -n api-probe --protocol Http --path /health --host 127.0.0.1` |
| `az network application-gateway waf-config set` | Configures the WAF mode/ruleset | `az network application-gateway waf-config set -g agw-lab-rg --gateway-name web-agw --enabled true --firewall-mode Prevention --rule-set-type OWASP --rule-set-version 3.2` |
| `az network application-gateway show` | Shows gateway config | `az network application-gateway show -g agw-lab-rg -n web-agw` |
| `az network application-gateway show-backend-health` | Shows backend health status | `az network application-gateway show-backend-health -g agw-lab-rg -n web-agw` |

Flag breakdown — `az network application-gateway create ... --sku WAF_v2 --capacity 2 --vnet-name lab-vnet --subnet appgw-subnet --public-ip-address agw-pip --frontend-port 80 --http-settings-port 80 --http-settings-protocol Http --priority 100`:
- `--sku`: `Standard_v2` or `WAF_v2` (WAF_v2 adds the firewall; both bill
  hourly + capacity units).
- `--capacity`: number of instances / capacity units (min for v2 autoscale).
- `--vnet-name` / `--subnet`: the **dedicated** subnet the gateway lives in.
- `--public-ip-address`: the frontend public IP (must be Standard SKU for v2).
- `--frontend-port`: the port the listener accepts on (e.g. 80/443).
- `--http-settings-port` / `--http-settings-protocol`: how the gateway talks to
  the backend.
- `--priority`: routing-rule priority (required for v2; unique per gateway).

Flag breakdown — `az network application-gateway waf-config set ... --enabled true --firewall-mode Prevention --rule-set-type OWASP --rule-set-version 3.2`:
- `--enabled`: turns the WAF on/off.
- `--firewall-mode`: `Detection` (log only) or `Prevention` (block).
- `--rule-set-type` / `--rule-set-version`: managed rule set (OWASP) and its
  version.

## Hands-on exercises

> Cost warning: App Gateway v2 bills hourly + capacity units from the moment
> it's created. Do these exercises in one sitting and delete the group
> immediately after. Provisioning a gateway takes several minutes.

Set up the group, VNet, gateway subnet, and a frontend public IP:
```
az group create --name agw-lab-rg --location eastus
az network vnet create -g agw-lab-rg -n lab-vnet --address-prefixes 10.0.0.0/16 \
  --subnet-name appgw-subnet --subnet-prefixes 10.0.1.0/24
az network vnet subnet create -g agw-lab-rg --vnet-name lab-vnet \
  -n backend-subnet --address-prefixes 10.0.2.0/24
az network public-ip create -g agw-lab-rg -n agw-pip \
  --sku Standard --allocation-method Static
```

1. **Create the Application Gateway (WAF_v2).**
   ```
   az network application-gateway create -g agw-lab-rg -n web-agw \
     --sku WAF_v2 --capacity 2 --vnet-name lab-vnet --subnet appgw-subnet \
     --public-ip-address agw-pip --frontend-port 80 \
     --http-settings-port 80 --http-settings-protocol Http --priority 100
   ```
   This takes several minutes. > Verify: `az network application-gateway show
   -g agw-lab-rg -n web-agw --query operationalState` returns `Running`.

2. **Check the default backend health.** With no real backends yet, the default
   pool is empty:
   ```
   az network application-gateway show-backend-health -g agw-lab-rg -n web-agw
   ```
   > Verify: you see the default backend pool and HTTP settings; health is
   > empty/unknown because there are no servers.

3. **Add a backend pool.** Point it at two IPs in `backend-subnet` (in a full
   lab these would be web servers or `az container create` instances serving
   HTTP):
   ```
   az network application-gateway address-pool create -g agw-lab-rg \
     --gateway-name web-agw -n api-pool --servers 10.0.2.10 10.0.2.11
   ```

4. **Add a custom health probe.**
   ```
   az network application-gateway probe create -g agw-lab-rg \
     --gateway-name web-agw -n api-probe --protocol Http --path /health \
     --host 127.0.0.1
   ```
   Note the probe path `/health` — the backend must actually serve 200 on that
   path or it'll be marked unhealthy (see exercise 7).

5. **Add path-based routing.** Send `/api/*` to `api-pool`, everything else to
   the default pool:
   ```
   az network application-gateway url-path-map create -g agw-lab-rg \
     --gateway-name web-agw -n pathmap --paths "/api/*" \
     --address-pool api-pool \
     --default-address-pool appGatewayBackendPool \
     --http-settings appGatewayBackendHttpSettings \
     --default-http-settings appGatewayBackendHttpSettings
   ```
   You'd then create a path-based routing rule that uses this map. > Verify:
   `az network application-gateway url-path-map list -g agw-lab-rg
   --gateway-name web-agw -o table` shows `pathmap`.

6. **Enable the WAF in Detection mode first.**
   ```
   az network application-gateway waf-config set -g agw-lab-rg \
     --gateway-name web-agw --enabled true --firewall-mode Detection \
     --rule-set-type OWASP --rule-set-version 3.2
   ```
   Detection logs would-be blocks without breaking anything — the right way to
   find false positives before enforcing. Then switch to enforcing:
   ```
   az network application-gateway waf-config set -g agw-lab-rg \
     --gateway-name web-agw --enabled true --firewall-mode Prevention \
     --rule-set-type OWASP --rule-set-version 3.2
   ```

7. **Diagnose and fix: all backends unhealthy (probe path returns 404).** This
   is App Gateway's signature failure. Your probe checks `/health`, but the
   backend app only serves `/`. The probe gets a 404, marks every backend
   unhealthy, and clients get **502 Bad Gateway** from the frontend even though
   the app is up. **Diagnose:**
   ```
   az network application-gateway show-backend-health -g agw-lab-rg -n web-agw
   ```
   shows the pool `Unhealthy` with a reason like "received 404". **Fix:** point
   the probe at a path the backend actually serves (or add a `/health` route to
   the app):
   ```
   az network application-gateway probe update -g agw-lab-rg \
     --gateway-name web-agw -n api-probe --path /
   ```
   > Verify: after the probe interval, `show-backend-health` flips the pool to
   > `Healthy` and the frontend stops returning 502. **Lesson: App Gateway
   > returns 502 when no backend is probe-healthy; a probe path the backend
   > doesn't serve is the usual cause — distinct from the backend being down.**

8. **Cleanup — do not skip.** The gateway bills hourly + capacity units. Delete
   the entire group now:
   ```
   az group delete --name agw-lab-rg --yes --no-wait
   ```
   > Verify: `az group show -n agw-lab-rg` eventually returns not-found.
   > Double-check in the portal's Cost Management that no App Gateway lingers.

## Independent challenge
Combine this module with **module 04 (Load Balancer)** and articulate the
division of labor. Deploy a small HTTP backend (two `az container create`
instances or two tiny VMs serving different content on `/` and `/api`), front
them with an Application Gateway doing **path-based routing** (`/api/*` to one
pool, everything else to another) with a health probe that matches what the
backends actually serve, and enable the WAF in Detection mode. Then explain, in
writing, exactly which parts of this design an L4 Azure Load Balancer could
*not* do and why you needed L7. Delete the resource group the moment you finish
— the gateway is billing the entire time it exists.

<details><summary>Stuck? One hint</summary>

Path-based routing (`/api/*` vs `/`) requires reading the URL, which lives at
Layer 7 — an L4 Load Balancer sees only IP and port and can't distinguish
paths, so it physically cannot route by URL, terminate TLS to inspect content,
or run a WAF. Make sure your probe path returns 200 from the backends, or every
pool shows unhealthy and you get 502s regardless of the routing config.
</details>

## Common mistakes & troubleshooting
- **Probe path mismatch → 502.** The most common App Gateway failure: the probe
  hits a path the backend doesn't serve (or wrong host/port), all backends go
  unhealthy, and clients get 502. Check `show-backend-health` first.
- **Not giving App Gateway its own subnet.** It requires a dedicated subnet;
  sharing one with other resources fails or is unsupported.
- **Using a Basic public IP.** v2 gateways require a Standard SKU public IP.
- **Turning on WAF Prevention blind.** Go through Detection mode first to catch
  false positives; enforcing straight away can block legitimate traffic.
- **Confusing NSG and WAF.** An NSG filters L3/L4 (IP/port) and can't see HTTP;
  the WAF filters L7 request content. You often want both.
- **Cost pitfall (the big one):** Standard_v2 and WAF_v2 bill a fixed hourly
  charge plus capacity units **whether or not any traffic flows**. An idle
  gateway left over a weekend is real money. Provisioning also takes minutes,
  so people leave them up "to save time" — don't. Delete the group as soon as
  the exercise is done.

## Checkpoint quiz
Write down your answer to each question before expanding it — checking without
attempting first is the single easiest way to fool yourself into thinking
you've learned this.

1. Give three things Application Gateway can do that the L4 Azure Load Balancer
   cannot, and say why (what layer).
2. Your App Gateway frontend returns 502 Bad Gateway but the backend app is
   running fine when hit directly. What's the most likely cause and how do you
   confirm?
3. What is the difference between WAF Detection and Prevention mode, and which
   should you enable first?
4. Why must Application Gateway have its own dedicated subnet?
5. What does "TLS termination at the gateway" enable that end-to-end
   pass-through TLS to the backend would not?
6. Which tier gives you the Web Application Firewall, and what's the cost
   implication of running it idle?
7. How does the WAF differ from an NSG in what it inspects?

<details><summary>Show answers</summary>

1. Path/URL-based routing, host header-based routing, TLS termination, and a
   WAF — all require reading Layer-7 (HTTP) content, which the L4 LB (transport
   layer) can't see.
2. No backend is probe-healthy — usually the probe targets a path/port/host the
   backend doesn't serve, so it's marked unhealthy and the gateway has nowhere
   to send traffic. Confirm with
   `az network application-gateway show-backend-health`.
3. Detection logs rule matches but blocks nothing; Prevention actively blocks.
   Enable Detection first to find false positives, then switch to Prevention.
4. It needs an exclusive subnet for its own instances/infrastructure; sharing
   the subnet with other resources isn't supported.
5. Terminating TLS lets the gateway decrypt and inspect the request, which is
   required for path-based routing and the WAF to work; pure pass-through would
   hide the content from the gateway.
6. The WAF_v2 tier. It bills a fixed hourly charge plus capacity units even
   when idle — leaving it running costs money regardless of traffic.
7. The WAF inspects L7 HTTP request content against OWASP rules (SQLi, XSS,
   etc.); an NSG filters L3/L4 on IP/port/protocol and has no HTTP awareness.
</details>

## Next
[07 — Azure Firewall & hub-spoke](../07-azure-firewall-and-hub-spoke/README.md):
centralize egress control with route tables and assemble the full
hub-and-spoke topology.
