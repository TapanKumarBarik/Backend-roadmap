# Public IPs, Load Balancers & NAT Gateway

## Why this matters
This module covers how traffic gets **in** to a set of backends (public IP +
Load Balancer) and how it gets **out** to the internet in a controlled way
(NAT Gateway). The Azure Load Balancer is your L4 load balancer from track 1,
and its health-probe behavior is the single most common cause of "my backends
show unhealthy and nothing works" — you'll break and fix exactly that. These
are also the first resources in this track that bill hourly, so cleanup starts
mattering for real here.

## Concepts

### Public IPs and SKUs
A **public IP** is a separate Azure resource you attach to something (a Load
Balancer frontend, a NAT Gateway, a VM NIC). It comes in **Basic** and
**Standard** SKUs and **Dynamic** or **Static** allocation. Use **Standard +
Static** for anything real: Standard is zone-redundant, secure-by-default
(no inbound unless an NSG allows it), and is required by Standard Load Balancer
and NAT Gateway. Basic SKU is on a deprecation path — don't build on it.
Standard public IPs bill a small hourly rate even when idle.

### Azure Load Balancer (L4)
The Azure Load Balancer is Azure's implementation of the **L4 (TCP/UDP) load
balancer** from track 1: it distributes flows across a backend pool using a
hashing algorithm, operating at the transport layer with no awareness of HTTP.
It has four building blocks: a **frontend** (the IP clients hit — public or
internal), a **backend pool** (the NICs/IPs receiving traffic), a **health
probe** (how it decides a backend is alive), and **load-balancing rules**
(which frontend port maps to which backend port for which pool/probe). For
HTTP-aware features (path routing, TLS termination, WAF) you need Application
Gateway (module 06), not this.

### Health probes decide everything
A load-balancing rule only sends traffic to backends the **health probe**
considers healthy. A probe defines a protocol (TCP/HTTP/HTTPS), a port, an
interval, and (for HTTP) a request path expecting a 200 response. If the probe
targets a port nothing is listening on, or an HTTP path that returns non-200,
or if an NSG blocks the probe's source, **every backend shows unhealthy and the
LB sends no traffic** — even though the backends are fine. Probes originate
from Azure's infrastructure IP `168.63.129.16`, so your NSG must allow the
`AzureLoadBalancer` service tag inbound (the default rule does this).

### Internal vs public load balancers
A Load Balancer frontend can be a public IP (internet-facing) or a private IP
inside a subnet (**internal load balancer**, ILB). An ILB spreads internal
traffic — e.g. an app tier balancing across a data tier — without exposing
anything publicly. Same probe/rule model, different frontend.

### NAT Gateway for outbound
By default VMs get outbound internet via implicit SNAT, but that default is
unpredictable and being retired for new deployments. A **NAT Gateway** is the
recommended, explicit way to give a subnet outbound internet: you attach it to
the subnet, give it a Standard public IP, and all outbound flows from that
subnet source-NAT through it with a large, stable pool of SNAT ports. It's
outbound-only (it never allows unsolicited inbound) and bills hourly plus per
GB processed. This is the "controlled source NAT for egress" idea from track 1.

## Command reference

| Command | What it does | Example |
|---|---|---|
| `az network public-ip create` | Creates a public IP | `az network public-ip create -g lb-lab-rg -n lb-pip --sku Standard --allocation-method Static` |
| `az network lb create` | Creates a Load Balancer with a frontend + backend pool | `az network lb create -g lb-lab-rg -n web-lb --sku Standard --public-ip-address lb-pip --frontend-ip-name fe --backend-pool-name bepool` |
| `az network lb probe create` | Creates a health probe | `az network lb probe create -g lb-lab-rg --lb-name web-lb -n http-probe --protocol Http --port 80 --path /` |
| `az network lb rule create` | Creates a load-balancing rule | `az network lb rule create -g lb-lab-rg --lb-name web-lb -n http-rule --protocol Tcp --frontend-port 80 --backend-port 80 --frontend-ip-name fe --backend-pool-name bepool --probe-name http-probe` |
| `az network lb show` | Shows LB config | `az network lb show -g lb-lab-rg -n web-lb` |
| `az network nat gateway create` | Creates a NAT Gateway | `az network nat gateway create -g lb-lab-rg -n egress-nat --public-ip-addresses nat-pip --idle-timeout 10` |
| `az network vnet subnet update` | Attaches a NAT Gateway to a subnet | `az network vnet subnet update -g lb-lab-rg --vnet-name lab-vnet -n app-subnet --nat-gateway egress-nat` |

Flag breakdown — `az network public-ip create -g lb-lab-rg -n lb-pip --sku Standard --allocation-method Static`:
- `--sku`: `Standard` (recommended) or `Basic` (deprecated).
- `--allocation-method`: `Static` (fixed IP) or `Dynamic`. Standard SKU is
  effectively static.

Flag breakdown — `az network lb rule create ... -n http-rule --protocol Tcp --frontend-port 80 --backend-port 80 --frontend-ip-name fe --backend-pool-name bepool --probe-name http-probe`:
- `--protocol`: transport protocol (`Tcp`/`Udp`).
- `--frontend-port`: the port clients connect to on the frontend IP.
- `--backend-port`: the port traffic is delivered to on backends.
- `--frontend-ip-name`: which frontend config this rule uses.
- `--backend-pool-name`: which backend pool receives the traffic.
- `--probe-name`: the health probe that gates this rule — no healthy probe, no
  traffic.

Flag breakdown — `az network lb probe create ... -n http-probe --protocol Http --port 80 --path /`:
- `--protocol`: `Tcp`, `Http`, or `Https`.
- `--port`: the port the probe connects to on backends.
- `--path`: for HTTP/HTTPS, the URL path that must return 200 (invalid for
  TCP probes — a common misconfiguration).

Flag breakdown — `az network nat gateway create ... -n egress-nat --public-ip-addresses nat-pip --idle-timeout 10`:
- `--public-ip-addresses`: the Standard public IP(s) the NAT Gateway SNATs
  through.
- `--idle-timeout`: minutes before an idle outbound flow is dropped (4–120).

## Hands-on exercises

Set up a group and a VNet:
```
az group create --name lb-lab-rg --location eastus
az network vnet create -g lb-lab-rg -n lab-vnet \
  --address-prefixes 10.0.0.0/16 \
  --subnet-name app-subnet --subnet-prefixes 10.0.1.0/24
```

1. **Create a Standard static public IP.**
   ```
   az network public-ip create -g lb-lab-rg -n lb-pip \
     --sku Standard --allocation-method Static
   ```
   > Verify: `az network public-ip show -g lb-lab-rg -n lb-pip --query
   > ipAddress` returns an assigned address. (This IP now bills hourly.)

2. **Create a Standard Load Balancer with a frontend and backend pool.**
   ```
   az network lb create -g lb-lab-rg -n web-lb --sku Standard \
     --public-ip-address lb-pip \
     --frontend-ip-name fe --backend-pool-name bepool
   ```
   > Verify: `az network lb show -g lb-lab-rg -n web-lb -o table` shows the LB;
   > it has a frontend and an (empty) backend pool.

3. **Add an HTTP health probe.**
   ```
   az network lb probe create -g lb-lab-rg --lb-name web-lb \
     -n http-probe --protocol Http --port 80 --path /
   ```

4. **Add a load-balancing rule.**
   ```
   az network lb rule create -g lb-lab-rg --lb-name web-lb -n http-rule \
     --protocol Tcp --frontend-port 80 --backend-port 80 \
     --frontend-ip-name fe --backend-pool-name bepool --probe-name http-probe
   ```
   > Verify: `az network lb rule list -g lb-lab-rg --lb-name web-lb -o table`
   > shows `http-rule` referencing `http-probe`.

5. **Add backends.** In a full lab you'd create two small VMs running a web
   server on port 80 and add their NICs to `bepool` (via
   `az network nic ip-config address-pool add`). If you want the full effect,
   create two VMs now; otherwise reason through the probe behavior in the next
   exercises. Backends are where the real cost is, so keep them tiny (e.g.
   `Standard_B1s`) and short-lived.

6. **Diagnose and fix: backends show unhealthy (probe misconfiguration).**
   This is the flagship failure. Suppose your web server actually listens on
   port **8080**, not 80, but your probe targets port 80. The probe fails, all
   backends show unhealthy, and the LB delivers no traffic even though the app
   is running. **Diagnose:** the LB frontend IP times out; the backend pool
   health shows all-down; the app responds fine if you hit a backend's private
   IP:8080 directly. The mismatch is probe port vs. listening port. **Fix:**
   point the probe (and rule backend port) at the real port:
   ```
   az network lb probe update -g lb-lab-rg --lb-name web-lb \
     -n http-probe --port 8080
   az network lb rule update -g lb-lab-rg --lb-name web-lb \
     -n http-rule --backend-port 8080
   ```
   > Verify: after the probe interval, backend health flips to healthy and the
   > frontend IP starts serving. **Lesson: an LB only sends traffic to
   > probe-healthy backends; a probe pointed at the wrong port fails silently
   > and looks like a total outage.** (A second common variant: a TCP probe is
   > fine, but an *HTTP* probe with `--path /health` returns 404 because the
   > app has no `/health` route — same symptom, fix the path or the app.)

7. **Create a NAT Gateway for controlled egress.**
   ```
   az network public-ip create -g lb-lab-rg -n nat-pip \
     --sku Standard --allocation-method Static
   az network nat gateway create -g lb-lab-rg -n egress-nat \
     --public-ip-addresses nat-pip --idle-timeout 10
   az network vnet subnet update -g lb-lab-rg --vnet-name lab-vnet \
     -n app-subnet --nat-gateway egress-nat
   ```
   > Verify: `az network vnet subnet show ... -n app-subnet --query
   > natGateway` references `egress-nat`. Now all outbound traffic from
   > `app-subnet` SNATs through `nat-pip` — from a VM in the subnet,
   > `curl ifconfig.me` would return `nat-pip`'s address.

8. **Diagnose and fix: no outbound after removing default outbound.** Standard
   Load Balancer does not provide default outbound SNAT to its backends the way
   Basic did. If a VM in a Standard-LB backend pool has no NAT Gateway, no
   instance-level public IP, and no outbound rule, it may have **no internet
   egress at all** (secure-by-default). Symptom: `curl` from the VM hangs.
   **Fix:** attach a NAT Gateway to the subnet (as in exercise 7) — the
   recommended modern pattern — rather than relying on implicit SNAT.

9. **Cleanup (important — these bill hourly).** The public IPs, Load Balancer,
   NAT Gateway, and any VMs all cost money. Delete the whole group:
   ```
   az group delete --name lb-lab-rg --yes --no-wait
   ```
   > Verify: after a few minutes, `az group show -n lb-lab-rg` returns
   > not-found. Don't leave this lab running overnight.

## Independent challenge
Combine this module with **module 02 (NSGs)**. Stand up a Standard Load
Balancer with a public frontend and a backend pool of two tiny VMs serving a
page on port 80. Put an NSG on the subnet. First, deliberately misconfigure it
so the health probe is blocked (remove/deny the `AzureLoadBalancer` inbound
allowance) and observe all backends going unhealthy; then fix the NSG so probes
and client traffic both flow, and confirm the frontend IP serves the page.
Articulate the difference between "the probe can't reach the backend" and "the
probe reaches a backend that returns the wrong status." Tear the whole resource
group down the moment you're done — every piece here bills hourly.

<details><summary>Stuck? One hint</summary>

Health probes come from the Azure infrastructure address `168.63.129.16`,
covered by the `AzureLoadBalancer` service tag. If your NSG's custom rules
override the default `AllowAzureLoadBalancerInBound`, the probe can't reach the
backend and everything shows unhealthy — distinct from a probe that *does*
reach the backend but gets a non-200/closed-port response. Check the NSG with
`az network watcher test-ip-flow` using `168.63.129.16` as the remote source.
</details>

## Common mistakes & troubleshooting
- **Probe port/path mismatch.** The number-one LB failure: probe points at a
  port nothing listens on, or an HTTP path that isn't 200. All backends go
  unhealthy and it looks like a full outage.
- **NSG blocking the probe.** Overriding `AllowAzureLoadBalancerInBound` (or
  denying `168.63.129.16`) kills health checks. Backends fine, probe blocked.
- **Assuming Standard LB gives outbound by default.** It doesn't. Add a NAT
  Gateway (or outbound rule / instance public IP) for egress.
- **Mixing Basic and Standard SKUs.** A Standard LB needs a Standard public
  IP; Basic and Standard don't interoperate cleanly. Standardize on Standard.
- **Expecting L7 features from the LB.** No TLS termination, no path routing,
  no host-based routing — that's Application Gateway (module 06).
- **Cost pitfall:** Standard public IPs, the Load Balancer, and the NAT
  Gateway all bill hourly, and VMs bill for compute + disk. This is the first
  module where forgetting `az group delete` genuinely costs money. Delete
  promptly.

## Checkpoint quiz
Write down your answer to each question before expanding it — checking without
attempting first is the single easiest way to fool yourself into thinking
you've learned this.

1. Your Load Balancer's frontend IP times out and all backends show unhealthy,
   but hitting a backend's private IP on the app port works fine. Name two
   distinct causes and how you'd tell them apart.
2. Which OSI layer does Azure Load Balancer operate at, and name two things it
   therefore *cannot* do that Application Gateway can.
3. What are the four building blocks of an Azure Load Balancer?
4. Why might a VM behind a Standard Load Balancer have no outbound internet
   access, and what's the recommended fix?
5. From what source IP do health probes originate, and which service tag /
   default NSG rule must permit them?
6. What does a NAT Gateway do, is it inbound or outbound, and how does it bill?
7. Why should you use Standard + Static public IPs rather than Basic + Dynamic?

<details><summary>Show answers</summary>

1. (a) Probe misconfiguration — probe port/path doesn't match what the app
   serves (fix the probe). (b) NSG blocking the probe source
   (`168.63.129.16` / `AzureLoadBalancer` tag). Tell them apart with
   `az network watcher test-ip-flow` from the probe source, and by checking
   whether the probe port matches the listening port.
2. Layer 4 (transport). It can't terminate TLS, do HTTP path/host-based
   routing, or apply a WAF — those are L7 (App Gateway).
3. Frontend IP configuration, backend pool, health probe, and load-balancing
   rule(s).
4. Standard LB provides no default outbound SNAT (secure by default). Add a
   NAT Gateway to the subnet (recommended), or an outbound rule / instance
   public IP.
5. `168.63.129.16`, permitted by the `AzureLoadBalancer` service tag via the
   default `AllowAzureLoadBalancerInBound` rule.
6. It provides controlled, scalable outbound (SNAT) internet access for a
   subnet; it is outbound-only (no unsolicited inbound); it bills hourly plus
   per-GB processed.
7. Standard is zone-redundant, secure-by-default, static, and required by
   Standard LB and NAT Gateway; Basic is deprecated and Dynamic IPs can change.
</details>

## Next
[05 — VNet peering & Private Endpoints](../05-vnet-peering-and-private-endpoints/README.md):
connect VNets over Azure's backbone and reach PaaS services on private IPs.
