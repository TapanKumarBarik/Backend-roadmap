# IaC Concepts & Terraform Setup

## Why this matters
Every Azure resource you've built in tracks 5-7 was created by typing an
`az` command — imperative, one-off, and invisible the moment the command
scrolled off your screen. Infrastructure as Code (IaC) replaces that with a
**declarative source file** that describes what should exist, versioned in
Git and applied by a tool. This module explains why that shift is worth
making, installs Terraform, and gets the `azurerm` provider authenticated
against the same Azure login you already use — the foundation for
everything else in this track.

## Concepts

### Imperative vs. declarative — what actually changes
In track 5 you ran `az network vnet create -g rg -n hub-vnet
--address-prefixes 10.0.0.0/16`. That's **imperative**: you told Azure the
exact steps, in order, right now. If you run it twice you get an error (it
already exists) or a second resource. There's no file that represents "the
VNet we want" — only the side effects of commands you've already run.

Terraform is **declarative**: you write a block that says "a VNet named
`hub-vnet` with address space `10.0.0.0/16` should exist," and Terraform
compares that desired state to reality and makes only the changes needed to
close the gap. Run it once, it creates the VNet. Run it again with no
changes, it does nothing (**idempotent**). Change the address space in the
file, it updates just that. The file *is* the infrastructure's definition.

### Why declarative wins for infrastructure
Four concrete payoffs, each of which you've felt the absence of already:

- **Repeatability.** Standing up an identical dev/test/prod environment is
  `terraform apply` three times against three configs, not re-typing dozens
  of `az` commands hoping you got every flag the same.
- **Reviewability.** Because it's code in Git (track 8), an infrastructure
  change is a pull request: someone can read the diff, see exactly which
  resources change, and approve it *before* it touches Azure.
- **Auditability.** `git log` on your Terraform repo is a complete history
  of who changed what infrastructure and when — something no amount of
  `az` command history gives you.
- **Drift detection.** Terraform can tell you when someone changed a
  resource in the portal behind your back (you'll see this in module 01).

### HCL: the language you'll write
Terraform configs are written in **HCL** (HashiCorp Configuration
Language), in files ending `.tf`. The core building block is a **block**:

```hcl
resource "azurerm_resource_group" "main" {
  name     = "rg-tf-learn"
  location = "eastus"
}
```

`resource` is the block type; `"azurerm_resource_group"` is the resource
type (which provider + which kind of thing); `"main"` is a local name *you*
choose to refer to it elsewhere in your code; and the `{ ... }` body holds
the arguments. You'll dissect this fully in module 02 — for now, just
recognize the shape.

### Providers: how Terraform talks to Azure
Terraform's core knows nothing about Azure specifically. A **provider** is
a plugin that translates HCL resource blocks into API calls against a
particular platform. For Azure that's the **`azurerm`** provider
(maintained by HashiCorp), which under the hood calls the same Azure
Resource Manager APIs that `az` does. You declare which providers you need
and pin their versions in a `terraform { required_providers { ... } }`
block, then Terraform downloads them during `terraform init` (module 01).

There are actually several Azure providers — `azurerm` (the main one, and
all this track uses), `azuread` (Entra ID objects), and `azapi` (raw ARM
for brand-new resources `azurerm` hasn't added yet). Stick with `azurerm`.

### Authenticating the azurerm provider
The `azurerm` provider needs credentials to call Azure. There are several
methods; two matter here:

- **Azure CLI auth (what you'll use for learning).** If you've run
  `az login`, the provider reuses that session automatically — no secrets
  in your config. This is the recommended path for a human running
  Terraform locally, and it's what every exercise in this track assumes.
- **Service principal auth (what pipelines use).** A non-human identity
  (an Entra ID app registration) with a client ID + secret, or — better —
  OIDC federation with no stored secret at all. You'll set this direction
  up conceptually in module 07 (CI/CD). Never hard-code a service
  principal secret into a `.tf` file; it would end up in Git.

> One azurerm v4 gotcha up front: the provider now requires a
> **subscription ID** to be set explicitly (via the provider block, or the
> `ARM_SUBSCRIPTION_ID` environment variable). With Azure CLI auth it will
> often pick up your CLI's default subscription, but setting it explicitly
> avoids "which subscription am I even deploying to?" surprises.

### A minimal, complete config
Putting it together, the smallest real Terraform config for Azure is two
blocks — a `terraform` block declaring the provider, and a `provider`
block configuring it:

```hcl
terraform {
  required_version = ">= 1.9.0"
  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 4.0"
    }
  }
}

provider "azurerm" {
  features {}
  subscription_id = "00000000-0000-0000-0000-000000000000"
}
```

The `features {}` block is **mandatory and must be present even when
empty** — it's where per-resource-type behavior overrides live. Leaving it
out is the single most common first-config error. You'll add actual
resources to this skeleton in module 01.

## Command reference

| Command | What it does | Example |
|---|---|---|
| `terraform version` | Prints the Terraform CLI version (and provider versions once initialized) | `terraform version` |
| `terraform -help` | Lists top-level subcommands | `terraform -help` |
| `az login` | Logs the Azure CLI in; the azurerm provider reuses this session | `az login` |
| `az account show` | Shows the currently active subscription | `az account show -o table` |
| `az account set` | Sets the active subscription | `az account set --subscription "<sub-id-or-name>"` |
| `az account list` | Lists subscriptions your login can see | `az account list -o table` |

Flag/field breakdown — the `terraform` block above:
- `required_version = ">= 1.9.0"` — refuses to run if the Terraform CLI is
  older than this. Guards against a teammate on an ancient version.
- `source = "hashicorp/azurerm"` — the provider's address in the public
  registry (`registry.terraform.io/hashicorp/azurerm`).
- `version = "~> 4.0"` — a **pessimistic constraint**: allows `4.x` (any
  `4.y` ≥ `4.0`) but not `5.0`. Pinning is covered fully in module 02.

Flag/field breakdown — the `provider "azurerm"` block:
- `features {}` — required container for behavior overrides; must be
  present even if empty.
- `subscription_id` — which subscription to deploy into. Can instead be
  supplied via the `ARM_SUBSCRIPTION_ID` environment variable (preferred,
  so the ID isn't hard-coded).

## Hands-on exercises

You'll run these in **WSL2** (your Linux environment), the same shell you
use for `az`. Terraform is a single static binary, so installing it there
is quick.

1. **Confirm your Azure CLI login works.** Terraform is going to piggyback
   on this session, so make sure it's healthy first:
   ```bash
   az login
   az account show -o table
   ```
   > Verify: `az account show` prints a subscription with `IsDefault`
   > true. Note its **SubscriptionId** — you'll need it in exercise 4.

2. **Install Terraform in WSL2.** Add HashiCorp's apt repository and
   install (this is the current documented method for Debian/Ubuntu):
   ```bash
   wget -O - https://apt.releases.hashicorp.com/gpg | \
     sudo gpg --dearmor -o /usr/share/keyrings/hashicorp-archive-keyring.gpg
   echo "deb [signed-by=/usr/share/keyrings/hashicorp-archive-keyring.gpg] \
     https://apt.releases.hashicorp.com $(lsb_release -cs) main" | \
     sudo tee /etc/apt/sources.list.d/hashicorp.list
   sudo apt update && sudo apt install terraform
   ```
   > If apt gives you trouble, the alternative is to download the zip from
   > the HashiCorp releases page, unzip it, and move the single `terraform`
   > binary onto your `$PATH` — that's all "installing" Terraform is.

3. **Verify the install.** Run:
   ```bash
   terraform version
   ```
   > Verify: it prints something like `Terraform v1.9.x` (or newer). If
   > you get "command not found," the binary isn't on your `$PATH`.

4. **Create your first config.** Make a clean directory and a single file:
   ```bash
   mkdir -p ~/tf-labs/00-setup && cd ~/tf-labs/00-setup
   ```
   Create `main.tf` with exactly the minimal config from the "A minimal,
   complete config" section above, but replace the placeholder
   `subscription_id` with your real subscription ID from exercise 1.

5. **Initialize the working directory.** This downloads the `azurerm`
   provider named in your config:
   ```bash
   terraform init
   ```
   > Verify: output ends with `Terraform has been successfully
   > initialized!` and a note that it installed `hashicorp/azurerm`. A new
   > hidden `.terraform/` directory and a `.terraform.lock.hcl` file now
   > exist. You'll learn what those are in module 01 — for now, confirm
   > they appeared.

6. **Confirm the provider version.** Now that the directory is
   initialized, run:
   ```bash
   terraform version
   ```
   > Verify: it now *also* lists `+ provider registry.terraform.io/
   > hashicorp/azurerm vX.Y.Z` — proof the provider downloaded and your
   > `~> 4.0` constraint resolved to a real `4.x` version.

7. **Diagnose and fix: the missing `features` block.** Deliberately break
   your config to learn its most common error. Delete the `features {}`
   line from your `provider "azurerm"` block, save, and run:
   ```bash
   terraform validate
   ```
   > Verify: it errors with something like `Insufficient features blocks;
   > at least 1 "features" block is required`. This is *the* error new
   > Terraform-on-Azure users hit. Put the `features {}` line back and run
   > `terraform validate` again — it should now report `Success! The
   > configuration is valid.`

8. **Set the subscription via environment variable instead (better
   practice).** Remove the hard-coded `subscription_id` line from your
   provider block, then export it from the shell:
   ```bash
   export ARM_SUBSCRIPTION_ID="$(az account show --query id -o tsv)"
   terraform validate
   ```
   > Verify: `terraform validate` still succeeds. You've now kept the
   > subscription ID out of the file entirely — the pattern you'll use for
   > the rest of the track. (This export lasts only for the current shell
   > session; you'd re-run it, or add it to your shell profile, next time.)

9. **No cleanup needed — nothing was created.** Everything so far is local
   config and a provider download; you have **not** created any Azure
   resource yet (no `apply`), so there's nothing billing and nothing to
   destroy. That changes in module 01.

## Independent challenge
Without copying the exercise commands, get a *second*, completely separate
Terraform working directory initialized and validating against a
**different** subscription than your default one (if you only have one
subscription, use the same one but prove to yourself you could target
another). Your config should hard-code neither the subscription ID nor any
secret in a `.tf` file. Confirm with `terraform validate` that it's valid,
and confirm with the right `az` command which subscription that ID actually
belongs to. This draws on this module's auth and provider-config concepts
plus the subscription-switching you learned with `az` back in track 5/7.

<details><summary>Stuck? One hint</summary>

`terraform validate` only checks that your config is internally
consistent — it does **not** contact Azure, so it will pass even against a
subscription you can't actually reach. To confirm the subscription ID is
real and yours, resolve it with
`az account list --query "[?id=='<the-id>']" -o table`. The clean way to
feed the ID to Terraform without hard-coding is the `ARM_SUBSCRIPTION_ID`
environment variable from exercise 8.
</details>

## Common mistakes & troubleshooting
- **Omitting the empty `features {}` block.** The provider refuses to
  initialize without it. It must be present even when it contains nothing.
- **Assuming `terraform validate` talks to Azure.** It doesn't — it only
  checks syntax and internal references. A config can `validate` fine and
  still fail at `plan`/`apply` because a subscription or permission is
  wrong. Validation is necessary, not sufficient.
- **Hard-coding the subscription ID (or worse, a secret) in `.tf` files.**
  These files go in Git. Use `ARM_SUBSCRIPTION_ID` / the other `ARM_*`
  environment variables, or CLI auth, so nothing sensitive is committed.
- **Not being logged into `az` first.** With CLI auth, `az login` is what
  gives the provider its credentials. If you're not logged in, `plan`
  (module 01) fails with an authentication error, not a config error.
- **Editing files on the Windows side but running Terraform in WSL.** Keep
  your Terraform project inside the WSL filesystem (e.g. `~/tf-labs/...`),
  not under `/mnt/c/...`, to avoid line-ending and file-watching quirks.
- **Cost note:** nothing in this module bills — you never ran `apply`.
  Installing Terraform and running `init`/`validate` create only local
  files and a provider download. The cost warnings start in module 01, the
  moment you first `apply`.

## Checkpoint quiz
Write down your answer to each question before expanding it — checking
without attempting first is the single easiest way to fool yourself into
thinking you've learned this.

1. In one sentence each, what's the difference between an imperative
   `az network vnet create` and a declarative Terraform `resource` block?
2. Name two concrete advantages of declarative IaC that you personally felt
   the *absence* of while doing tracks 5-7 by hand.
3. What is a Terraform "provider," and which one does this track use for
   Azure?
4. What does the empty `features {}` block do, and what happens if you omit
   it?
5. When you run Terraform locally with Azure CLI auth, where do its
   credentials come from?
6. What does `~> 4.0` mean as a version constraint, and what would it
   *not* allow?
7. You've run `terraform init` and `terraform validate` with no errors.
   Have you created anything in Azure yet? How do you know?

<details><summary>Show answers</summary>

1. Imperative: you tell Azure the exact action to perform *now*, and
   re-running errors or duplicates. Declarative: you describe the desired
   end state, and Terraform makes only the changes needed to reach it,
   idempotently.
2. Any two of: repeatability (rebuilding an identical environment),
   reviewability (infra change as a reviewable PR diff), auditability
   (`git log` of infra history), drift detection (knowing when someone
   changed a resource out-of-band).
3. A plugin that translates HCL resource blocks into API calls against a
   specific platform. This track uses the `azurerm` provider.
4. It's a required container for per-resource-type behavior overrides;
   it must be present even when empty. Omitting it makes the provider
   refuse to initialize (`at least 1 "features" block is required`).
5. From the `az login` session — the provider reuses the Azure CLI's
   cached credentials, so no secret is stored in your config.
6. It allows any `4.x` version at or above `4.0` but not `5.0` or higher
   (a "pessimistic" constraint locking the major version).
7. No. `init` only downloads providers and `validate` only checks config
   syntax/references — neither contacts Azure to create anything. Nothing
   is created until `terraform apply`, which you haven't run.

</details>

## Next
[01 — The core workflow & state](../01-core-workflow-and-state/README.md):
run your first real `plan`/`apply`/`destroy`, create an actual resource
group in Azure, and meet the state file that makes it all work.
