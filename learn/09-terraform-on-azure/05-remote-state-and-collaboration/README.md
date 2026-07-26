# Remote State & Collaboration

## Why this matters
Everything so far kept `terraform.tfstate` as a file on your laptop. That's
fine for solo learning and catastrophic for a team: two people can't share
it, it's a single point of loss, it holds plaintext secrets, and nothing
stops two applies from running at once and corrupting it. This module moves
state into an **Azure Storage backend** with **locking** — the setup every
real Terraform-on-Azure team uses, and a prerequisite for the CI/CD in
module 07 and the capstone in module 08.

## Concepts

### Why local state breaks in a team
Local state has four failure modes that all appear the instant a second
person (or a CI runner) is involved:

- **No sharing.** Your teammate's Terraform has no idea what yours created —
  their state file is empty, so their `plan` wants to create duplicates of
  everything.
- **No locking.** If you and a colleague `apply` at the same time, two
  processes write the same state file and one clobbers the other, corrupting
  it. There's no coordination.
- **Single point of loss.** State lives on one laptop. Lose the laptop (or
  the file), and Terraform forgets it manages your entire production
  estate.
- **Secret exposure.** State is plaintext and can contain secrets; a file on
  a laptop or in Git is a leak waiting to happen.

Remote state solves all four: one shared, durable, access-controlled,
lockable copy.

### Backends: where state lives
A **backend** determines where Terraform reads and writes state. The
default is `local` (the file you've been using). For Azure the standard
choice is the **`azurerm` backend**, which stores the state file as a
**blob** in an Azure Storage account container:

```hcl
terraform {
  backend "azurerm" {
    resource_group_name  = "rg-tfstate"
    storage_account_name = "sttfstate12345"
    container_name       = "tfstate"
    key                  = "network/terraform.tfstate"
  }
}
```

- `resource_group_name` / `storage_account_name` / `container_name` — where
  the blob lives.
- `key` — the blob name; effectively the path/identity of *this* config's
  state. Different configs (or environments) use different keys in the same
  container so their states never collide.

### The chicken-and-egg problem (and how to solve it)
The storage account that holds your state can't itself be created by the
same Terraform config that *uses* it as a backend — the backend must exist
before `init` can configure it. The standard solution is **bootstrap the
backend storage once with `az`** (or a tiny separate Terraform config with
local state), then point every other config's backend at it. You'll do
exactly this in the exercises: create the storage account with `az`, then
configure the `azurerm` backend to use it.

### State locking with the azurerm backend
The `azurerm` backend acquires a **blob lease** on the state blob for the
duration of any state-modifying operation (`apply`, `destroy`, some
`state` commands). While the lease is held, a second Terraform run against
the same state **blocks / fails** rather than corrupting it — that's the
locking. Locking is automatic with the `azurerm` backend; you don't
configure anything extra. If a run is interrupted (killed mid-apply, lost
network), the lease can be left dangling, and the next run reports the
state as locked — which you fix with `terraform force-unlock <LOCK_ID>`
(carefully — only when you're sure no other apply is actually running).

### Migrating existing local state to a backend
When you add a `backend` block to a config that already has local state,
the next `terraform init` detects the change and offers to **copy your
existing state up** to the new backend:

```
terraform init -migrate-state
```

Answer `yes` and your local `terraform.tfstate` contents are uploaded to
the blob; from then on Terraform reads/writes the remote copy. Get this
step right and you keep managing your existing resources; skip it and
Terraform starts from an empty remote state (thinking it manages nothing).

### Reading another config's state
Teams often split infrastructure across configs (a "network" config, an
"AKS" config). The AKS config can read the network config's outputs via a
`terraform_remote_state` data source pointing at the network config's state
blob — a read-only way to consume another team's outputs without managing
their resources. It's the cross-config sibling of the `data`-source pattern
from module 03; you'll see the direction of it here and can lean on it in
the capstone.

## Command reference

| Command | What it does | Example |
|---|---|---|
| `terraform init -migrate-state` | Initializes and copies existing state into a newly configured backend | `terraform init -migrate-state` |
| `terraform init -reconfigure` | Re-initializes the backend *without* migrating (start fresh against it) | `terraform init -reconfigure` |
| `terraform force-unlock <ID>` | Releases a stuck state lock by its lock ID | `terraform force-unlock 3f2a...` |
| `terraform state pull` | Prints the current remote state to stdout | `terraform state pull` |
| `terraform state push` | Overwrites remote state from a local file (dangerous) | `terraform state push errored.tfstate` |
| `az storage account create` | Creates the storage account for the backend | see exercises |
| `az storage container create` | Creates the blob container that holds state | see exercises |

Flag breakdown — `terraform init -migrate-state`:
- `-migrate-state` — when the backend config changed (e.g. local → azurerm),
  copies the existing state into the new backend after prompting. Use this
  the first time you point an already-applied config at a remote backend.

Flag breakdown — `terraform force-unlock <LOCK_ID>`:
- `<LOCK_ID>` — the ID Terraform prints when it reports state is locked.
  This *only* releases the lock; it does not roll back a partial apply. Run
  it **only** when you're certain no other Terraform process is actually
  operating on that state — force-unlocking a genuinely-in-progress apply
  reintroduces the corruption locking exists to prevent.

## Hands-on exercises

The storage account is nearly free (a state blob is tiny), but you'll clean
it up at the end anyway. Storage account names must be **globally unique**
and lowercase alphanumeric — append random digits.

1. **Bootstrap the backend storage with `az`.** State can't create its own
   backend, so use `az`:
   ```bash
   SUFFIX=$RANDOM
   az group create -n rg-tfstate -l eastus
   az storage account create -n "sttfstate${SUFFIX}" -g rg-tfstate \
     -l eastus --sku Standard_LRS --min-tls-version TLS1_2
   az storage container create -n tfstate \
     --account-name "sttfstate${SUFFIX}"
   echo "Your storage account name is: sttfstate${SUFFIX}"
   ```
   > Verify: note the printed account name — you'll paste it into the
   > backend block. Confirm with
   > `az storage account show -n sttfstate${SUFFIX} -g rg-tfstate -o table`.

2. **Create a config with local state first.** New directory:
   ```bash
   mkdir -p ~/tf-labs/05-remote-state && cd ~/tf-labs/05-remote-state
   export ARM_SUBSCRIPTION_ID="$(az account show --query id -o tsv)"
   ```
   Create `main.tf` with the provider skeleton and a simple resource group
   named `rg-tf-remote-demo` in `eastus`. Then:
   ```bash
   terraform init
   terraform apply
   ```
   > Verify: a local `terraform.tfstate` file now exists (`ls`), and the
   > group exists in Azure. This is the state you'll migrate.

3. **Add the azurerm backend block.** Add to the `terraform { ... }` block
   in `main.tf` (using *your* account name from exercise 1):
   ```hcl
   terraform {
     backend "azurerm" {
       resource_group_name  = "rg-tfstate"
       storage_account_name = "sttfstateNNNNN"   # your name here
       container_name       = "tfstate"
       key                  = "remote-demo/terraform.tfstate"
     }
     # ... keep your required_providers here too
   }
   ```

4. **Migrate the state to the backend.** Run:
   ```bash
   terraform init -migrate-state
   ```
   Answer `yes` when it asks to copy existing state.
   > Verify: it reports `Successfully configured the backend "azurerm"!`
   > and that it copied state. Confirm the blob exists:
   > `az storage blob list --account-name sttfstateNNNNN -c tfstate -o table`
   > shows `remote-demo/terraform.tfstate`. Your local `terraform.tfstate`
   > is now just a leftover — the real state lives in the blob.

5. **Prove state is now remote.** Run `terraform state pull | head` — it
   fetches state from the blob. Then run `terraform plan`.
   > Verify: `No changes` — Terraform read the migrated remote state, sees
   > the resource group already exists, and knows it manages it. Migration
   > preserved everything.

6. **Observe locking in action.** In your terminal, start a
   long-running-ish operation and, in a *second* terminal (same directory),
   try to run another. The simplest reliable demo: run
   `terraform plan` in one shell while... actually, `plan` doesn't lock for
   long. Instead, observe the lock message directly:
   ```bash
   terraform apply -auto-approve &   # backgrounded apply grabs the lease
   terraform plan                    # immediately try another op
   ```
   > Verify: the second command may print `Error acquiring the state lock`
   > with a `Lock Info` block (ID, who, when) if it hits the window while
   > the lease is held. This is the backend refusing concurrent state
   > access. (If the apply finishes too fast to catch it, that's fine —
   > you've seen what the lock error looks like; on a real multi-resource
   > apply the window is much wider.)

7. **Diagnose and fix: a stuck lock.** Simulate a dangling lease. Manually
   acquire a lease on the state blob with `az` so Terraform thinks it's
   locked (this mimics an apply that was killed mid-run):
   ```bash
   az storage blob lease acquire \
     --account-name sttfstateNNNNN -c tfstate \
     -b remote-demo/terraform.tfstate --lease-duration -1
   ```
   Now run `terraform plan`.
   > Verify: Terraform fails with `Error acquiring the state lock` and
   > shows a `Lock Info` block. **Fix it** — first make absolutely sure no
   > real Terraform run is in progress (there isn't; you faked it), then
   > break the lease:
   > ```bash
   > az storage blob lease break \
   >   --account-name sttfstateNNNNN -c tfstate \
   >   -b remote-demo/terraform.tfstate
   > ```
   > Run `terraform plan` again — it now succeeds. (In a *real* Terraform
   > -created lock you'd use `terraform force-unlock <ID>` with the ID from
   > the error; here the lease was created out-of-band by `az`, so you
   > release it the same way you made it. The lesson is identical: only
   > break a lock when you're certain nothing legitimate holds it.)

8. **See why the `key` matters.** Imagine a second config for AKS. It would
   use the **same** storage account and container but a **different** key
   (e.g. `aks/terraform.tfstate`), so the two states never collide. Confirm
   your understanding by listing blobs — there's exactly one so far, at
   your key:
   ```bash
   az storage blob list --account-name sttfstateNNNNN -c tfstate -o table
   ```

9. **Clean up in the right order.** Destroy the managed resource first
   (while the backend still works), *then* remove the backend storage:
   ```bash
   terraform destroy
   az group delete -n rg-tfstate --yes --no-wait
   ```
   > Verify: `terraform destroy` removes `rg-tf-remote-demo`. Deleting
   > `rg-tfstate` removes the storage account and the state blob with it.
   > Order matters: if you delete the backend storage *first*, Terraform
   > can't read state to destroy the managed resources. Confirm both groups
   > are gone with `az group list -o table`.

## Independent challenge
Without copying the exercises, stand up a **shared backend** and use it for
**two separate configs** that share one storage account/container but
different `key`s — a "network" config (a resource group + VNet) and a
"compute" config (just a second resource group). Migrate each to the
backend, confirm from the storage account that there are now **two** state
blobs at two keys, and then — the real goal — make the compute config read
an output from the network config's state using a
`terraform_remote_state` data source, proving one team's config can consume
another's outputs without managing its resources. Destroy both configs and
delete the backend storage last. This draws on this module's backend/key
concepts, module 03's data-source thinking, and module 04's multi-config
organization.

<details><summary>Stuck? One hint</summary>

The `terraform_remote_state` data source points at the *other* config's
backend and exposes its `outputs`:
```hcl
data "terraform_remote_state" "network" {
  backend = "azurerm"
  config = {
    resource_group_name  = "rg-tfstate"
    storage_account_name = "sttfstateNNNNN"
    container_name       = "tfstate"
    key                  = "network/terraform.tfstate"
  }
}
```
Then reference `data.terraform_remote_state.network.outputs.<name>` — which
means the network config must actually *declare* that `output`. Give each
config a distinct `key` in its own backend block so their state blobs don't
overwrite each other.
</details>

## Common mistakes & troubleshooting
- **Trying to create the backend storage account inside the config that
  uses it.** Chicken-and-egg — the backend must exist before `init`.
  Bootstrap it with `az` (or a separate local-state config) first.
- **Skipping `-migrate-state` when adding a backend to an applied config.**
  Without migration, the remote state starts empty and Terraform thinks it
  manages nothing — a subsequent apply tries to recreate everything. Always
  migrate when moving existing state.
- **Reusing the same `key` for two different configs.** They'd share one
  state blob and stomp on each other. Every distinct config/environment
  gets its own `key`.
- **Force-unlocking a genuinely-running apply.** `force-unlock` (or breaking
  the lease) while another apply is truly in progress reintroduces exactly
  the corruption locking prevents. Only unlock when you're certain nothing
  legitimate holds the lock.
- **Committing the leftover local `terraform.tfstate` after migrating.**
  It's stale and still plaintext. Keep it `.gitignore`d; the source of
  truth is now the blob.
- **Cost pitfall:** the state storage account is tiny and cheap, but it's a
  *persistent* resource that outlives your ephemeral labs — it won't get
  swept up by a `terraform destroy` of your workload config. Track it
  separately and delete `rg-tfstate` when you're truly done, or it lingers
  (cheaply, but forgotten) forever.

## Checkpoint quiz
Write down your answer to each question before expanding it — checking
without attempting first is the single easiest way to fool yourself into
thinking you've learned this.

1. Name three distinct ways local state breaks the moment a second person
   joins the project.
2. What is a "backend," and what does the `azurerm` backend use to store
   state?
3. What does the `key` field in an `azurerm` backend block identify, and why
   must two different configs use different keys?
4. Why can't the storage account that holds your state be created by the
   same config that uses it as a backend? What do you do instead?
5. How does the `azurerm` backend implement state locking, and is it
   automatic or something you configure?
6. You added a backend block to an already-applied config. What flag do you
   pass to `init`, and what happens if you forget it?
7. Terraform reports the state is locked, but you're sure no apply is
   running. What command releases it, and what's the one condition you must
   verify first?
8. How can an "AKS" config read an output from a separate "network" config's
   remote state without managing the network's resources?

<details><summary>Show answers</summary>

1. Any three of: no sharing (teammates' state is empty and they recreate
   duplicates); no locking (concurrent applies corrupt the file); single
   point of loss (one laptop holds it); secret exposure (plaintext state on
   a laptop/Git).
2. A backend determines where Terraform stores and reads state. The
   `azurerm` backend stores it as a blob in an Azure Storage container.
3. `key` is the blob name — the identity/path of *this* config's state.
   Different configs need different keys so their state blobs don't
   overwrite each other in the same container.
4. The backend must exist before `terraform init` can configure it
   (chicken-and-egg). Bootstrap the storage account/container first with
   `az` (or a small separate local-state config), then point the backend at
   it.
5. It takes a blob lease on the state blob for the duration of
   state-modifying operations, so a concurrent run blocks/fails instead of
   corrupting state. It's automatic — no extra configuration.
6. `terraform init -migrate-state` (and answer `yes` to copy state up). If
   you forget, the remote state starts empty and Terraform thinks it
   manages nothing, so the next apply tries to recreate everything.
7. `terraform force-unlock <LOCK_ID>` (using the ID from the error). First
   verify that no other Terraform process is genuinely operating on that
   state — unlocking a real in-progress apply reintroduces corruption.
8. With a `terraform_remote_state` data source pointing at the network
   config's backend/key, then referencing
   `data.terraform_remote_state.network.outputs.<name>` — read-only, no
   management of the other config's resources.

</details>

## Cumulative review
Closed-book. Cover the answers and write each out first — this mixes
everything from modules 00-05, the halfway mark of the track.

1. Give the imperative-vs-declarative distinction in one sentence, and name
   the file that makes Terraform's declarative reconciliation possible.
2. What two blocks are mandatory in any minimal Azure config, and what
   empty block must the provider block contain?
3. Walk the full first-time lifecycle of a resource: which commands, in
   order, from nothing to created-and-recorded to torn down?
4. In a plan you see `-/+` on an `azurerm_kubernetes_cluster`. Explain what
   that means and why you'd stop and investigate before applying.
5. What's the difference between a `variable`, a `local`, an `output`, and a
   `data` source — one clause each?
6. You want to deploy *into* a VNet another team owns and manages, without
   taking it over. Which construct do you use, and how does the plan show
   it?
7. What's the difference between a child module declaring
   `required_providers` and configuring a `provider` block, and which
   should it do?
8. A single `terraform apply` proposes creating 40 resources when you
   expected 4. Name the two most likely causes and the one habit that
   catches it.
9. Why does local state break for a team, and what specifically does the
   `azurerm` backend add to fix locking?
10. You migrated a config to a remote backend but a later `plan` wants to
    recreate everything. What did you most likely skip?

<details><summary>Show answers</summary>

1. Imperative tells Azure the exact actions to run now; declarative
   describes desired end state and Terraform reconciles reality to it
   idempotently. The **state file** makes that reconciliation possible.
2. The `terraform` block (with `required_providers`) and the `provider
   "azurerm"` block; the provider block must contain an empty `features {}`.
3. `terraform init` → `terraform plan` → `terraform apply` (creates and
   records in state) → `terraform destroy` (tears down).
4. `-/+` is destroy-and-recreate: an immutable attribute changed, so
   Terraform would delete the cluster and build a new one — for AKS that
   means downtime and a brand-new cluster, so you investigate what's
   forcing replacement first.
5. `variable` = caller-supplied input; `local` = internally-derived named
   value; `output` = value surfaced after apply for consumers; `data`
   source = read-only reference to something that already exists.
6. A `data` source (or `terraform_remote_state` for another config's
   outputs). It shows in the plan as a read (`<=`), never a create/destroy,
   because Terraform doesn't manage it.
7. `required_providers` declares which providers/versions the module needs;
   a `provider` block configures auth/features/subscription. A child module
   should declare `required_providers` only and let the root configure the
   provider.
8. Likely causes: a `count`/`for_each` wired to the wrong or
   larger-than-expected collection, or a change that forced widespread
   replacement. The habit that catches it: reading the plan's `N to add`
   summary before confirming.
9. Local state can't be shared, isn't locked (concurrent applies corrupt
   it), lives on one machine, and leaks secrets. The `azurerm` backend adds
   locking via a blob lease so concurrent state writes block instead of
   corrupting.
10. `terraform init -migrate-state` (answering yes to copy existing state up)
    — without it the remote state started empty, so Terraform thinks it
    manages nothing.

</details>

## Next
[06 — Provisioning real Azure infrastructure](../06-provisioning-azure-infrastructure/README.md):
put it all together and rebuild, declaratively, the VNet+NSG from track 5
and the AKS cluster + ACR from track 7 — the by-hand work now as code.
