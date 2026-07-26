# The Core Workflow & State

## Why this matters
`init` → `plan` → `apply` → `destroy` is the loop you'll run thousands of
times. More importantly, this module introduces the **state file** — the
single most misunderstood and most dangerous part of Terraform. State is how
Terraform remembers what it created; corrupt it, lose it, or let reality
drift away from it, and Terraform gets confused in ways that can delete real
infrastructure. Understanding it now prevents expensive mistakes later.

## Concepts

### The core workflow
Four commands do the everyday work, and you'll internalize this rhythm:

- **`terraform init`** — prepares a working directory: downloads the
  providers your config declares, sets up the backend (where state lives),
  and writes the dependency lock file. Run once per directory, and again
  whenever you add a provider or module. Safe to re-run; it's idempotent.
- **`terraform plan`** — computes the difference between your config
  (desired) and state+reality (current), and prints exactly what it *would*
  do, without doing it. This is your safety check. **Read it every time.**
- **`terraform apply`** — runs a plan and, after you confirm, actually makes
  the API calls to create/update/delete resources, then records the result
  in state.
- **`terraform destroy`** — the inverse of apply: deletes everything in the
  state file. This is how you avoid leaving billable resources running.

### Reading a plan
Every plan prints a symbol per resource and a summary line. Learn to read
both at a glance:

| Symbol | Meaning |
|---|---|
| `+` | create |
| `-` | destroy |
| `~` | update in place |
| `-/+` | **destroy and recreate** (replacement — pay attention) |
| `<=` | read (data source) |

The last line is the one that matters most:
`Plan: 1 to add, 0 to change, 0 to destroy.` If those numbers don't match
your mental model of what you asked for, **stop and figure out why before
typing `yes`** — this is where a `count` mistake or an accidental
replacement gets caught.

### What the state file is
When Terraform creates a resource, it records a mapping in a JSON file
(`terraform.tfstate` by default, in your working directory) between the
**resource address in your config** (e.g.
`azurerm_resource_group.main`) and the **real object in Azure** (its
resource ID, plus every attribute's current value). State is Terraform's
memory. Without it, Terraform would have no idea that the
`azurerm_resource_group.main` in your config corresponds to the actual
`rg-tf-learn` already in Azure.

### Why state matters (and why it's dangerous)
State is what lets `plan` be fast and precise: instead of querying all of
Azure, Terraform reads state, refreshes the specific resources it tracks,
and diffs against your config. Consequences of that design:

- **State is the source of truth about what Terraform manages.** If a
  resource isn't in state, Terraform doesn't know it exists (even if it's
  in Azure). If it's in state but you delete the config block, Terraform
  will *destroy* it.
- **Deleting or corrupting state is catastrophic.** Lose the state file and
  Terraform forgets it ever created your resources — a subsequent `apply`
  would try to create duplicates, and `destroy` couldn't clean up. Never
  hand-edit state; never commit it to Git (it can contain secrets in
  plaintext); back it up (module 05 moves it to durable remote storage).
- **State can contain secrets.** Resource attributes like generated
  passwords or keys are stored in state in plaintext. This is the second
  reason (after "it's machine-managed") never to commit `terraform.tfstate`
  to Git — always `.gitignore` it.

### Drift: when reality and state disagree
**Drift** is when someone changes a Terraform-managed resource *outside*
Terraform — a colleague edits it in the portal, or an `az` command tweaks a
tag. Terraform detects drift during the refresh phase of `plan`: it queries
each resource's real current state, notices it no longer matches what's in
your config, and shows you a diff to bring it back. This is one of IaC's
superpowers — your config is the enforced source of truth, and drift shows
up as a plan that would "fix" the out-of-band change. You'll deliberately
cause and observe drift in the exercises.

### The dependency lock file
`terraform init` writes `.terraform.lock.hcl`, which pins the *exact*
provider versions (and their checksums) selected under your version
constraints. Unlike state, this file **should be committed to Git** — it
guarantees everyone on the team (and your CI) uses byte-identical provider
versions, the same idea as a `package-lock.json`. Your `~> 4.0` constraint
says "any 4.x"; the lock file records "specifically 4.37.0" so builds are
reproducible.

## Command reference

| Command | What it does | Example |
|---|---|---|
| `terraform init` | Downloads providers, configures backend, writes lock file | `terraform init` |
| `terraform plan` | Shows what apply would change; makes no changes | `terraform plan` |
| `terraform plan -out=tfplan` | Saves the plan to a file for a guaranteed-identical apply | `terraform plan -out=tfplan` |
| `terraform apply` | Applies changes after interactive confirmation | `terraform apply` |
| `terraform apply tfplan` | Applies a previously saved plan, no prompt | `terraform apply tfplan` |
| `terraform apply -auto-approve` | Applies without the `yes` prompt (dangerous; CI only) | `terraform apply -auto-approve` |
| `terraform destroy` | Destroys everything in state after confirmation | `terraform destroy` |
| `terraform apply -refresh-only` | Reconciles state with real-world drift without changing config-driven resources | `terraform apply -refresh-only` |
| `terraform state list` | Lists resource addresses tracked in state | `terraform state list` |
| `terraform state show <addr>` | Shows all recorded attributes of one resource | `terraform state show azurerm_resource_group.main` |
| `terraform show` | Prints the full current state (or a saved plan) human-readably | `terraform show` |
| `terraform fmt` | Rewrites files to canonical formatting | `terraform fmt` |

Flag breakdown — `terraform plan -out=tfplan`:
- `-out=tfplan` — writes the computed plan to a file named `tfplan`.
  `terraform apply tfplan` then applies *exactly* that plan with no
  re-computation and no prompt — the pattern used in CI (module 07) so the
  thing reviewed is exactly the thing applied.

Flag breakdown — `terraform apply -refresh-only`:
- `-refresh-only` — updates state to match real-world drift (so state
  reflects reality) *without* trying to change resources back to match
  config. Use it to accept an out-of-band change, versus a normal `apply`
  which would revert the drift.

## Hands-on exercises

Work in a fresh directory. These create **real** (but free) resources — a
resource group costs nothing, but you'll still `destroy` at the end to
practice the habit.

1. **Set up the working directory.** Create the folder and a `main.tf`:
   ```bash
   mkdir -p ~/tf-labs/01-workflow && cd ~/tf-labs/01-workflow
   ```
   Put the provider skeleton from module 00 into `main.tf` (the `terraform`
   and `provider "azurerm"` blocks), then add a resource group below it:
   ```hcl
   resource "azurerm_resource_group" "main" {
     name     = "rg-tf-workflow"
     location = "eastus"
   }
   ```
   Make sure `ARM_SUBSCRIPTION_ID` is exported (module 00, exercise 8):
   ```bash
   export ARM_SUBSCRIPTION_ID="$(az account show --query id -o tsv)"
   ```

2. **Initialize and plan.** Run:
   ```bash
   terraform init
   terraform plan
   ```
   > Verify: the plan shows `azurerm_resource_group.main` with a `+`
   > (create) and ends with `Plan: 1 to add, 0 to change, 0 to destroy.`
   > Read every line — this is the habit that saves you money.

3. **Apply and confirm in Azure.** Run `terraform apply`, review the same
   plan, and type `yes`:
   ```bash
   terraform apply
   ```
   Then confirm the resource group really exists, using the CLI you already
   know:
   ```bash
   az group show -n rg-tf-workflow -o table
   ```
   > Verify: `apply` ends with `Apply complete! Resources: 1 added` and
   > `az group show` finds the group. A `terraform.tfstate` file now
   > exists in your directory.

4. **Inspect the state.** Look at what Terraform is now tracking:
   ```bash
   terraform state list
   terraform state show azurerm_resource_group.main
   ```
   > Verify: `state list` prints `azurerm_resource_group.main`, and
   > `state show` prints its recorded attributes including the full Azure
   > resource `id`. This mapping is Terraform's memory.

5. **Prove idempotency.** Run `terraform plan` again *without changing
   anything*.
   > Verify: `No changes. Your infrastructure matches the configuration.`
   > Desired state already equals current state, so there's nothing to do —
   > the defining property of declarative IaC.

6. **Make a change and watch an in-place update.** Add a tag to the
   resource group block:
   ```hcl
   resource "azurerm_resource_group" "main" {
     name     = "rg-tf-workflow"
     location = "eastus"
     tags = {
       environment = "learning"
     }
   }
   ```
   Run `terraform plan`, then `terraform apply`.
   > Verify: the plan shows `~` (update in place) for the resource group
   > and `Plan: 0 to add, 1 to change, 0 to destroy.` — not a
   > destroy-and-recreate. Tags update in place.

7. **Diagnose and fix: drift from an out-of-band change.** Simulate a
   colleague editing the resource in the portal by using `az` to add a tag
   Terraform doesn't know about:
   ```bash
   az group update -n rg-tf-workflow --set tags.owner=someone-else
   ```
   Now run `terraform plan`.
   > Observe: Terraform detects the drift during refresh and shows a plan
   > that would **remove** the `owner` tag (because your config doesn't
   > mention it) — reasserting your config as the source of truth. You have
   > two correct fixes depending on intent:
   > - **Revert the drift** (config wins): run `terraform apply` and let it
   >   remove the `owner` tag.
   > - **Accept the drift** (adopt it): add `owner = "someone-else"` to your
   >   config's `tags` block, then `terraform plan` shows no changes —
   >   reality and config now agree.
   >
   > Do the *revert* path here so you've seen Terraform enforce config.

8. **Diagnose and fix: an unexpected destroy-and-recreate.** Some
   attributes can't be changed in place — changing them forces
   replacement. Change the resource group's `location`:
   ```hcl
   location = "westus"
   ```
   Run `terraform plan`.
   > Observe: the plan now shows `-/+ destroy and recreate` and
   > `Plan: 1 to add, 1 to change... 1 to destroy` (look for the
   > `# forces replacement` annotation on the `location` line). A resource
   > group's location is immutable, so Terraform would delete and
   > re-create it. **This is exactly the plan you must never blindly
   > `yes`.** Fix it by reverting `location` back to `eastus` and confirm
   > `terraform plan` shows no changes.

9. **Look at the lock file.** Open `.terraform.lock.hcl`:
   ```bash
   cat .terraform.lock.hcl
   ```
   > Verify: it pins an exact `azurerm` version and checksums. Note this is
   > the file you *commit* to Git — unlike `terraform.tfstate`, which you
   > never commit.

10. **Create a `.gitignore` and clean up.** Protect yourself from ever
    committing state, then destroy everything:
    ```bash
    printf '*.tfstate\n*.tfstate.*\n.terraform/\n*.tfplan\n' > .gitignore
    terraform destroy
    ```
    Review the destroy plan (`Plan: 0 to add, 0 to change, 1 to destroy`),
    type `yes`, then confirm it's gone:
    ```bash
    az group show -n rg-tf-workflow -o table
    ```
    > Verify: `destroy` reports `Destroy complete! Resources: 1 destroyed`
    > and `az group show` now errors with `ResourceGroupNotFound`. Nothing
    > is left billing.

## Independent challenge
Starting from an empty directory and *without* copying exercise commands,
create a config with **two** resource groups (in different regions), apply
it, then use only state-inspection commands to answer: how many objects is
Terraform tracking, and what are their full Azure resource IDs? Then make a
single change that causes a plan of exactly "1 to change" (not add, not
destroy, not replace), verify the plan matches that expectation before
applying, and finally destroy everything and prove with an `az` command
that both groups are gone. This draws on this module's workflow, state
inspection, and plan-reading, plus module 00's provider setup.

<details><summary>Stuck? One hint</summary>

To get a clean "1 to change" plan, modify an attribute that updates
**in place** rather than one that forces replacement — a `tags` change is
in-place (`~`), a `location` change is a replacement (`-/+`). Use
`terraform state list` to count tracked objects and
`terraform state show <address>` (or `terraform show`) to read each one's
`id`.
</details>

## Common mistakes & troubleshooting
- **Typing `yes` without reading the plan.** The entire safety model of
  Terraform is the plan. If you auto-approve habitually, you *will*
  eventually destroy-and-recreate something important. Read the summary
  line every single time.
- **Committing `terraform.tfstate` to Git.** State can contain secrets in
  plaintext and is machine-managed — never commit it. Add a `.gitignore`
  before your first commit (exercise 10).
- **Hand-editing `terraform.tfstate`.** It's valid JSON, which tempts
  people, but a wrong edit desynchronizes state from reality and can cause
  Terraform to destroy or duplicate resources. Use `terraform state`
  subcommands (module 04+) instead of a text editor.
- **Losing state entirely.** With default *local* state, deleting the file
  (or losing the machine) means Terraform forgets everything it manages.
  This is exactly why teams use remote state (module 05).
- **Ignoring `-/+` in a plan.** A destroy-and-recreate on a database, a
  public IP, or anything stateful can mean data loss or a changed IP
  address. Always investigate what's forcing replacement before applying.
- **Cost pitfall:** a resource group is free, but you `destroy`ed anyway to
  build the habit. From module 06 on, the resources are billable — the
  same `terraform destroy` discipline is what keeps an idle AKS cluster
  from running up a bill over a weekend.

## Checkpoint quiz
Write down your answer to each question before expanding it — checking
without attempting first is the single easiest way to fool yourself into
thinking you've learned this.

1. What does each of `init`, `plan`, `apply`, `destroy` do, in one phrase
   each?
2. What does the plan symbol `-/+` mean, and why should it make you stop
   and look?
3. What is the state file, and what mapping does it hold?
4. Give two reasons you must never commit `terraform.tfstate` to Git.
5. What is drift, and how does Terraform detect it?
6. You changed a resource in the portal by hand and want Terraform to
   *accept* that change rather than revert it. What do you do?
7. Which file should you commit — `.terraform.lock.hcl` or
   `terraform.tfstate` — and why that one and not the other?
8. A plan shows `Plan: 1 to add, 0 to change, 1 to destroy` for a resource
   you only meant to *modify*. What has probably happened?

<details><summary>Show answers</summary>

1. `init`: download providers / set up backend + lock file. `plan`: show
   what would change without changing anything. `apply`: make the changes
   after confirmation and record them in state. `destroy`: delete
   everything tracked in state.
2. Destroy-and-recreate (replacement): Terraform will delete the resource
   and make a new one because an immutable attribute changed. It can mean
   data loss or a changed IP/identity, so never apply it blindly.
3. A JSON file mapping each resource address in your config to the real
   Azure object (its resource ID and current attribute values) —
   Terraform's memory of what it manages.
4. It can contain secrets (passwords, keys) in plaintext, and it's
   machine-managed state that doesn't belong under manual version control;
   committing it risks leaking secrets and causing merge conflicts on a
   file you must never hand-edit.
5. Drift is a Terraform-managed resource being changed outside Terraform.
   Terraform detects it during the refresh phase of `plan` by querying each
   resource's real current state and diffing it against config.
6. Add the changed attribute to your config so config matches reality (or
   use `terraform apply -refresh-only` to record the current real state) —
   then `plan` shows no changes. A plain `apply` would instead revert it.
7. `.terraform.lock.hcl` — it pins exact provider versions/checksums so the
   team and CI build reproducibly, and it's safe to share. `terraform.tfstate`
   must *not* be committed (secrets, machine-managed).
8. An attribute that forces replacement (an immutable field like a
   resource group's `location` or a resource's `name`) was changed, turning
   your intended in-place update into a destroy-and-recreate.

</details>

## Next
[02 — Providers, resources & the azurerm provider](../02-providers-resources-and-the-azurerm-provider/README.md):
go deeper on resource blocks, how resources reference each other, and how
version pinning keeps your infrastructure reproducible.
