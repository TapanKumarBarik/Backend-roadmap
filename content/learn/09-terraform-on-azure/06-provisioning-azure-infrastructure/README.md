# Provisioning Real Azure Infrastructure

## Why this matters
This is the payoff module. Everything before it was mechanics; here you
rebuild — declaratively — the exact infrastructure you created by hand in
tracks 5 and 7: a VNet with subnets and an NSG, then an AKS cluster with an
attached ACR. When you're done you'll have one `terraform apply` that stands
up what previously took a dozen carefully-ordered `az` commands, and one
`terraform destroy` that removes all of it. This is also the **first
module that creates genuinely billable resources** (an AKS cluster's node
VMs) — so the destroy discipline you've been practicing on free resources
now matters for real.

> **Cost warning.** An AKS cluster bills for its worker-node VMs (and their
> disks, and any load balancers/public IPs) for as long as it exists, whether
> or not you run workloads on it — exactly as track 7 warned. Use a small
> node count and a burstable VM size, and **`terraform destroy` the moment
> you finish**, or `az aks stop` between sessions. Read every plan's
> `N to add` before confirming.

## Concepts

### Mapping `az` resources to `azurerm` resource types
Each thing you made with `az` in tracks 5/7 has a direct `azurerm`
counterpart. The mapping you'll use in this module:

| Track 5/7 `az` command | `azurerm` resource type |
|---|---|
| `az network vnet create` | `azurerm_virtual_network` |
| `az network vnet subnet create` | `azurerm_subnet` |
| `az network nsg create` + rules | `azurerm_network_security_group` |
| (associate NSG to subnet) | `azurerm_subnet_network_security_group_association` |
| `az acr create` | `azurerm_container_registry` |
| `az aks create` | `azurerm_kubernetes_cluster` |
| `az aks update --attach-acr` | `azurerm_role_assignment` (AcrPull) |

The last two rows are the interesting ones — the AKS↔ACR attach that was a
single `az aks update --attach-acr` flag becomes an explicit **role
assignment** in Terraform, which is actually a more honest picture of what
that flag did under the hood (grant the cluster's kubelet identity `AcrPull`
on the registry).

### The VNet + subnet + NSG stack, declaratively
This is track 5 modules 01-02 as code. The NSG rule fields map one-to-one to
the `az network nsg rule create` flags you used:

```hcl
resource "azurerm_network_security_group" "web" {
  name                = "web-nsg"
  location            = azurerm_resource_group.main.location
  resource_group_name = azurerm_resource_group.main.name

  security_rule {
    name                       = "allow-https"
    priority                   = 100
    direction                  = "Inbound"
    access                     = "Allow"
    protocol                   = "Tcp"
    source_port_range          = "*"
    destination_port_range     = "443"
    source_address_prefix      = "*"
    destination_address_prefix = "*"
  }
}

resource "azurerm_subnet_network_security_group_association" "web" {
  subnet_id                 = azurerm_subnet.web.id
  network_security_group_id = azurerm_network_security_group.web.id
}
```

Note the **separate association resource**: in `azurerm`, attaching an NSG
to a subnet is its own resource (`azurerm_subnet_network_security_group_association`),
not a field on the subnet. This mirrors the fact that in track 5 the NSG and
its subnet binding were distinct steps.

### AKS as a resource
`azurerm_kubernetes_cluster` is track 7 module 01's `az aks create`. The
core arguments map directly to the flags you used:

```hcl
resource "azurerm_kubernetes_cluster" "aks" {
  name                = "aks-tf-learn"
  location            = azurerm_resource_group.main.location
  resource_group_name = azurerm_resource_group.main.name
  dns_prefix          = "akstflearn"

  default_node_pool {
    name       = "system"
    node_count = 2
    vm_size    = "Standard_B2s"
  }

  identity {
    type = "SystemAssigned"
  }
}
```

- `default_node_pool` — the system node pool (track 7's concept): `vm_size`
  is `--node-vm-size`, `node_count` is `--node-count`.
- `identity { type = "SystemAssigned" }` — gives the cluster a managed
  identity, the modern default and what the AcrPull assignment will target.
- `dns_prefix` — required; forms part of the cluster's API server FQDN.

The cluster's kubelet identity (a separate managed identity AKS creates for
pulling images) is exported as
`azurerm_kubernetes_cluster.aks.kubelet_identity[0].object_id` — you need it
for the ACR attach.

### ACR and the AcrPull attach
`azurerm_container_registry` is `az acr create`. The attach is a role
assignment granting the cluster's kubelet identity `AcrPull` on the
registry — which is literally what `az aks update --attach-acr` does:

```hcl
resource "azurerm_container_registry" "acr" {
  name                = "acrtflearn12345"   # globally unique, alphanumeric
  resource_group_name = azurerm_resource_group.main.name
  location            = azurerm_resource_group.main.location
  sku                 = "Basic"
  admin_enabled       = false
}

resource "azurerm_role_assignment" "aks_acr_pull" {
  principal_id                     = azurerm_kubernetes_cluster.aks.kubelet_identity[0].object_id
  role_definition_name             = "AcrPull"
  scope                            = azurerm_container_registry.acr.id
  skip_service_principal_aad_check = true
}
```

Because the role assignment references both the cluster's kubelet identity
*and* the ACR's ID, Terraform's dependency graph creates the cluster and
registry first, then wires them together — the ordering you had to do
manually with `az` is now automatic.

### Getting kubeconfig out via an output
Track 7's `az aks get-credentials` has a Terraform analogue: the cluster
exports `kube_config_raw` (the full kubeconfig). You surface it as a
**sensitive** output and can write it to a file:

```hcl
output "kube_config" {
  value     = azurerm_kubernetes_cluster.aks.kube_config_raw
  sensitive = true
}
```

Then `terraform output -raw kube_config > ~/.kube/aks-tf-config`. It's
sensitive because it contains cluster credentials — and, as module 03
warned, it's still stored in plaintext in state, another reason your state
belongs in the locked remote backend from module 05.

## Command reference

| Command | What it does | Example |
|---|---|---|
| `terraform apply` | Builds the whole stack after confirmation | `terraform apply` |
| `terraform output -raw kube_config` | Extracts the raw kubeconfig from a sensitive output | `terraform output -raw kube_config > ~/.kube/aks-tf` |
| `terraform state show <addr>` | Inspects a provisioned resource's recorded attributes | `terraform state show azurerm_kubernetes_cluster.aks` |
| `az aks get-credentials` | Alternative way to fetch kubeconfig for the created cluster | `az aks get-credentials -g rg-tf-infra -n aks-tf-learn` |
| `kubectl get nodes` | Confirms the Terraform-built cluster's nodes are Ready | `kubectl get nodes -o wide` |
| `az acr repository list` | Confirms images can be pushed/pulled from the ACR | `az acr repository list -n acrtflearn12345` |
| `terraform destroy` | Tears the entire billable stack down | `terraform destroy` |

Argument breakdown — `azurerm_role_assignment` for AcrPull:
- `principal_id` — *who* gets the role: the cluster's kubelet managed
  identity (`kubelet_identity[0].object_id`), the identity that actually
  pulls images.
- `role_definition_name = "AcrPull"` — *what* they can do: pull (not push)
  from the registry.
- `scope` — *where*: the specific ACR's resource ID.
- `skip_service_principal_aad_check = true` — avoids a race where the
  identity isn't yet replicated in Entra ID when the assignment is created;
  standard for freshly-created managed identities.

## Hands-on exercises

**These create billable resources.** Do them in one sitting and run the
cleanup at the end. Use a remote backend if you finished module 05, or local
state is fine for a single-sitting lab.

1. **Set up.** New directory; export subscription:
   ```bash
   mkdir -p ~/tf-labs/06-infra && cd ~/tf-labs/06-infra
   export ARM_SUBSCRIPTION_ID="$(az account show --query id -o tsv)"
   ```
   Create `main.tf` with the provider skeleton and a resource group
   `rg-tf-infra` in `eastus`. Add `variables.tf` with a variable
   `acr_name` (type `string`, no default — ACR names are globally unique,
   so you'll supply your own) and `outputs.tf` (empty for now).

2. **Build the network layer first.** Add to `main.tf` a VNet
   (`10.0.0.0/16`), one subnet `web-subnet` (`10.0.1.0/24`), an NSG
   allowing inbound TCP 443, and the subnet↔NSG association — using the
   blocks from the Concepts section. Then:
   ```bash
   terraform init
   terraform plan
   ```
   > Verify: `Plan: 5 to add` (RG, VNet, subnet, NSG, association). Apply
   > it. Confirm with
   > `az network nsg show -g rg-tf-infra -n web-nsg -o table` — the same NSG
   > you built by hand in track 5 module 02.

3. **Add the ACR.** Append the `azurerm_container_registry` block (Basic
   SKU, `admin_enabled = false`), using `var.acr_name` for its name. Plan
   and apply, supplying a unique name:
   ```bash
   terraform apply -var="acr_name=acrtflearn$RANDOM"
   ```
   > Verify: `Plan: 1 to add`. Confirm with
   > `az acr show -n <your-acr-name> -o table`. (Keep the exact name — pass
   > the same `-var` on every subsequent command, or put it in a
   > `terraform.tfvars` so it's auto-loaded.)

4. **Add the AKS cluster.** Append the `azurerm_kubernetes_cluster` block
   (2 × `Standard_B2s`, `SystemAssigned` identity, a `dns_prefix`). Plan
   and read carefully:
   ```bash
   terraform plan -var="acr_name=<same-name>"
   ```
   > Verify: `Plan: 1 to add` for the cluster. **This is the billable
   > one.** Apply it — it takes several minutes, same as `az aks create`.
   > Confirm: `az aks show -g rg-tf-infra -n aks-tf-learn -o table` shows
   > `Succeeded`.

5. **Wire up the AcrPull attach.** Append the `azurerm_role_assignment`
   block from Concepts. Plan and apply.
   > Verify: `Plan: 1 to add`. Confirm the attach worked the same way
   > track 7 module 03 did:
   > `az role assignment list --scope $(az acr show -n <acr-name> --query id -o tsv) -o table`
   > shows an `AcrPull` assignment for the cluster's kubelet identity.

6. **Get kubeconfig two ways.** Add the sensitive `kube_config` output,
   apply, then extract it:
   ```bash
   terraform output -raw kube_config > ~/.kube/aks-tf-config
   KUBECONFIG=~/.kube/aks-tf-config kubectl get nodes -o wide
   ```
   Then compare against the `az` path you know from track 7:
   ```bash
   az aks get-credentials -g rg-tf-infra -n aks-tf-learn --file ~/.kube/aks-tf-config2
   ```
   > Verify: both show two `Ready` nodes. You've reproduced
   > `az aks get-credentials` via a Terraform output.

7. **Push an image to prove the attach.** Confirm the cluster can actually
   pull from the ACR by pushing a test image (reusing track 2/7 skills):
   ```bash
   az acr import -n <acr-name> --source mcr.microsoft.com/hello-world:latest --image hello-world:v1
   az acr repository list -n <acr-name> -o table
   ```
   > Verify: `hello-world` appears. A pod referencing
   > `<acr-name>.azurecr.io/hello-world:v1` would pull without an image
   > pull secret, because the AcrPull role assignment (exercise 5) is in
   > place — the whole point of the attach.

8. **Diagnose and fix: a resource deleted out-of-band.** This is the
   classic "Terraform's confusion" scenario. Delete the NSG behind
   Terraform's back with `az`:
   ```bash
   az network nsg rule delete -g rg-tf-infra --nsg-name web-nsg -n allow-https
   ```
   Now run `terraform plan -var="acr_name=<name>"`.
   > Observe: Terraform detects the rule is gone (drift) and plans to
   > **recreate** it to match config — `Plan: 0 to add, 1 to change` (or a
   > rule re-add), reasserting your code as the source of truth. Now do a
   > harsher version — delete the whole NSG:
   > ```bash
   > az network nsg delete -g rg-tf-infra -n web-nsg
   > ```
   > `terraform plan` again. Terraform now wants to recreate the NSG *and*
   > its association (the association depended on the NSG). **Fix by
   > applying** — `terraform apply` rebuilds exactly what was deleted,
   > which is precisely the recovery superpower IaC gives you over
   > click-ops: reality is restored from code, not from memory.

9. **Diagnose and fix: an unexpected replacement.** Change the cluster's
   `dns_prefix` (an immutable field):
   ```hcl
     dns_prefix = "akstflearn2"
   ```
   Run `terraform plan -var="acr_name=<name>"`.
   > Observe: `-/+ destroy and recreate` on the *entire AKS cluster* with
   > `# forces replacement` on `dns_prefix`. Applying this would **delete
   > your cluster and build a new one** — minutes of downtime and a new
   > identity, breaking the AcrPull assignment until it's re-created. This
   > is the plan you never blind-apply. **Fix by reverting** `dns_prefix`
   > and confirming `plan` shows no changes.

10. **Clean up — this is the billable teardown.** Destroy everything in one
    command:
    ```bash
    terraform destroy -var="acr_name=<name>"
    ```
    Review the `Plan: 0 to add, 0 to change, N to destroy` summary, confirm
    it lists the AKS cluster, then `yes`. Verify nothing survives:
    ```bash
    az group show -n rg-tf-infra -o table
    az group list -o table
    ```
    > Verify: `rg-tf-infra` is gone (`ResourceGroupNotFound`), and the
    > AKS-managed `MC_*` group (track 7) is gone too — Terraform's destroy
    > removed the cluster, which cascades to the node resource group. One
    > command tore down what took a dozen `az` commands to build. **Confirm
    > `az aks list -o table` is empty** so you know nothing is still
    > billing.

## Independent challenge
Without copying the exercise blocks, reproduce the AKS + ACR setup **using
the reusable `network` module you wrote in module 04** as the source of the
cluster's networking — i.e. don't inline the VNet/subnet again; call your
module and feed the cluster into a subnet it produces (AKS with the `azure`
CNI network plugin takes a `vnet_subnet_id` on its default node pool). Build
the network via the module, an ACR, an AKS cluster placed in the module's
subnet, and the AcrPull attach, all parameterized by variables with a
`terraform.tfvars`. Prove the nodes are Ready and that an image pushed to
the ACR is visible, then destroy everything and confirm `az aks list` is
empty. This integrates module 04 (modules), module 03 (variables/outputs),
and this module's provisioning — the shape of your capstone.

<details><summary>Stuck? One hint</summary>

To place AKS in a specific subnet you set
`default_node_pool { ... vnet_subnet_id = module.network.subnet_ids[0] }`
and configure `network_profile { network_plugin = "azure" }` on the
cluster. Your module 04 network module already outputs `subnet_ids` — that's
the value you pass in. Read the `azurerm_kubernetes_cluster` registry page
for the exact `network_profile` fields (e.g. `network_plugin`,
`service_cidr`, `dns_service_ip`) rather than guessing — with `azure` CNI
some of these have interdependencies. Keep the node pool small and destroy
promptly; this is a full billable cluster.
</details>

## Common mistakes & troubleshooting
- **Forgetting the separate NSG-association resource.** In `azurerm`,
  attaching an NSG to a subnet is its own
  `azurerm_subnet_network_security_group_association` resource, not a field
  on the subnet. Leaving it out means the NSG exists but protects nothing.
- **Non-unique ACR or storage names.** ACR names are globally unique and
  alphanumeric-only. A collision fails at apply, not plan. Use a random
  suffix.
- **Referencing `kubelet_identity` wrong.** It's a list —
  `kubelet_identity[0].object_id`. Using `identity` (the cluster's control
  -plane identity) instead of `kubelet_identity` for AcrPull grants the
  wrong principal and pulls silently fail.
- **Blind-applying a cluster replacement.** Changing `dns_prefix`,
  `default_node_pool.name`, or other immutable fields forces a full
  destroy-and-recreate of AKS. Always check for `# forces replacement`
  before applying a change to a cluster.
- **Committing state with the kubeconfig in it.** `kube_config_raw` lands in
  state in plaintext. Keep state in the locked remote backend (module 05)
  and never commit it.
- **Cost pitfall — the big one for this track.** This module creates an AKS
  cluster with real VMs. Leaving it running overnight or over a weekend is
  the exact charge tracks 7 and this track keep warning about. `terraform
  destroy` when done (or `az aks stop` between sessions), and always confirm
  `az aks list -o table` is empty afterward. A `count`/`for_each` mistake
  here (e.g. a node pool count fed by the wrong variable) multiplies VM
  cost immediately — read the plan.

## Checkpoint quiz
Write down your answer to each question before expanding it — checking
without attempting first is the single easiest way to fool yourself into
thinking you've learned this.

1. What `azurerm` resource type corresponds to `az network vnet create`, and
   which corresponds to `az aks create`?
2. In `azurerm`, how do you attach an NSG to a subnet — is it a field on the
   subnet? 
3. What does `az aks update --attach-acr` become in Terraform, and what
   three things does that resource specify?
4. Which identity do you grant `AcrPull` — the cluster's `identity` or its
   `kubelet_identity` — and how is it addressed?
5. How do you get a usable kubeconfig out of a Terraform-built AKS cluster,
   and why must that output be `sensitive`?
6. You deleted the NSG in the portal by accident. What does `terraform plan`
   then show, and how do you recover the NSG?
7. A plan shows `-/+` on the whole AKS cluster after you edited its
   `dns_prefix`. What will applying do, and what should you do instead?
8. After `terraform destroy` of your infra config, which *other* resource
   group also disappears, and how do you confirm nothing is still billing?

<details><summary>Show answers</summary>

1. `az network vnet create` → `azurerm_virtual_network`; `az aks create` →
   `azurerm_kubernetes_cluster`.
2. Not a field on the subnet — it's a separate resource,
   `azurerm_subnet_network_security_group_association`, referencing both the
   subnet ID and the NSG ID.
3. An `azurerm_role_assignment` granting `AcrPull`. It specifies the
   principal (the cluster's kubelet identity), the role
   (`role_definition_name = "AcrPull"`), and the scope (the ACR's resource
   ID).
4. The `kubelet_identity` (the image-pulling identity), addressed as
   `azurerm_kubernetes_cluster.aks.kubelet_identity[0].object_id`. The
   cluster's `identity` is the control-plane identity and is the wrong
   principal for pulls.
5. Surface `azurerm_kubernetes_cluster.aks.kube_config_raw` as an output and
   write it with `terraform output -raw kube_config > file`. It must be
   `sensitive` because it contains cluster credentials (and is stored in
   state in plaintext).
6. Terraform detects the drift and plans to recreate the NSG (and its
   association) to match config; you recover by running `terraform apply`,
   which rebuilds exactly what was deleted.
7. Applying would destroy and recreate the entire cluster (downtime, new
   identity, broken AcrPull until re-created) because `dns_prefix` is
   immutable. Instead, revert the change so the plan shows no changes.
8. The AKS-managed `MC_*` node resource group disappears too (destroying the
   cluster cascades to it). Confirm with `az aks list -o table` (empty) and
   `az group list -o table` showing neither group remains.

</details>

## Next
[07 — Terraform in CI/CD & testing](../07-terraform-in-cicd-and-testing/README.md):
run `fmt`/`validate`/`plan`/`apply` from a pipeline instead of your laptop,
and add linting and policy checks (`tflint`, `checkov`, a taste of
`terraform test`).
