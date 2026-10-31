# Budgets and Alerts

## Why this matters

Cost Analysis (module 01) is *reactive* — you have to go look. A **budget** is
*proactive*: it watches spend against a threshold and tells you the moment you're
off-plan, ideally *before* the month is blown rather than after. This is the
guardrail that turns "we discovered the bill was 3x normal at month-end" into "we
got paged at 80% of plan on the 12th and fixed it." But budgets have a notorious
failure mode: a budget scoped or filtered wrong that **silently never fires** —
giving you false confidence while spend runs away. You'll build real budgets tied
to action groups, use forecast-based alerts to get warned early, and deliberately
break and fix a budget that never fires — the single most important
troubleshooting skill in this track.

## Concepts

### A budget is a threshold plus alert rules on a scope

An Azure **budget** is three things bound together: a **scope** (the same
MG/subscription/RG/tag-filter tree from module 01), an **amount** over a **reset
period** (monthly/quarterly/annually), and one or more **alert rules** that fire
when spend crosses a **percentage of that amount**. Critically, a budget in Azure
Cost Management is a **notification tool, not a spending cap** — crossing 100%
does **not** stop resources or block new deployments; it sends alerts. (This
surprises everyone from an AWS or a prepaid-card mental model. There's no built-in
"hard stop" — enforcement is something *you* build on top, e.g. an alert that
triggers an automation runbook to deallocate dev VMs.) A budget can have several
thresholds (e.g. alert at 50%, 80%, 100%, 110%), each with its own recipients,
so you can warn a team at 80% and escalate to a manager at 100%. The amount is a
plan, not a physics limit — its job is to make *off-plan* visible early.

### Actual vs. forecasted alerts — get warned before the money's gone

Each budget alert rule is one of two **types**, and understanding both is the
heart of this module:

- **Actual** alerts fire when *spend already incurred* crosses the threshold —
  e.g. "you have actually spent 80% of the budget." Reliable but **lagging**: by
  the time an actual alert at 100% fires, the money is already gone.
- **Forecasted** alerts fire when Azure's **projection** of end-of-period spend
  crosses the threshold — e.g. "at the current run rate you're *predicted* to hit
  100% by month-end." This warns you **while you can still act**, which is the
  whole point of the Inform phase (module 00). The trade-off: forecasts are built
  on the lagging, trend-based data from module 01, so early in a period they can
  be jumpy or over/under-shoot, and a forecasted alert can fire and then "un-fire"
  as the projection settles.

The mature pattern is **both**: a **forecasted** alert at 100% (early warning
— "you're on track to blow the budget") *and* an **actual** alert at 80-90%
(ground truth — "you really have spent this much"). Forecast tells you where
you're heading; actual tells you where you are.

### Action groups: turning an alert into a response (track 07 callback)

A budget alert is only useful if it *reaches someone* or *does something*. The
delivery mechanism is an **action group** — the same Azure Monitor construct you
first met wiring AKS metric alerts in **track 07 module 06** (and again in track
12's alerting and track 20's on-call). An action group is a reusable named bundle
of **actions**: send email, SMS, push to the Azure mobile app, post to a webhook
(Slack/Teams/PagerDuty), or — the powerful one — **trigger an Azure Function,
Logic App, or Automation runbook**. That last option is how you build the
"spending cap" Azure doesn't give you natively: a budget's 100% threshold calls
an action group whose runbook **deallocates dev VMs or scales a node pool to
zero**. Reusing action groups (rather than re-typing recipients per budget) is
the same DRY discipline as everywhere else — define "the platform on-call group"
once and attach it to budgets, metric alerts, and SLO burn alerts alike. Note a
CLI wrinkle: the older `az consumption budget` supports simple **email** contacts
directly, but wiring a budget to a full **action group** (for webhooks/runbooks)
is done through the Cost Management budget API / portal — the command reference
shows both.

### Scope and filter: where budgets silently go wrong

A budget inherits module 01's scope model, and this is where budgets fail *quietly*.
A budget can be scoped to a subscription, a resource group, or a management group,
**and** further narrowed with **filters** (by tag, by resource group, by service).
The trap: a filter that matches **nothing** — or matches far less than you think —
produces a budget whose measured spend is always near zero, so it **never crosses
its threshold and never fires**, while you feel protected. Classic causes: a tag
filter of `CostCenter=CC-1001` when resources are actually tagged `CC1001` (no
dash) or are **untagged** (the module 01 allocation gap strikes again); a
resource-group filter naming an RG that was renamed; or a budget scoped to an
empty/wrong subscription. Because a never-firing budget looks identical to a
"we're under budget" budget, the only way to trust one is to **prove it fires** —
which is exactly this module's diagnose-and-fix, and a hard requirement of the
capstone ("a budget alert *proven* to fire").

### Budgets are for the Inform loop, not a one-time setup

A budget isn't "set it and forget it." Spend patterns change — a new workload
lands, a team scales up, a reservation is bought — and a budget amount set six
months ago becomes either a constant false alarm (too low) or useless (too high).
The Operate phase (module 00) treats budgets as **living plans** reviewed each
period: did we hit it, why, and does next period's number need to change? A budget
that's been firing every month for a quarter isn't "broken," it's telling you the
*plan* is wrong — either spend needs optimizing (modules 03-05) or the budget
needs raising with a documented reason. Tie this to showback (module 06): a
per-team budget only works if the team can *see* their own spend (Cost Management
Reader at their scope) and *owns* the number — otherwise it's just the platform
team getting alerts about spend they can't influence.

## Command reference

Budgets are **free**. The two CLI surfaces are `az consumption budget` (simple,
email-based, quick) and the Cost Management budget API / portal (full action-group
wiring). Action groups are `az monitor action-group`.

| Command | What it does | Example |
|---|---|---|
| `az consumption budget create` | Creates a subscription/RG budget with email contacts and threshold(s) | see breakdown below |
| `az consumption budget list` / `show` | Inspects existing budgets and their current spend vs. amount | `az consumption budget list -o table` |
| `az consumption budget delete` | Removes a budget | `az consumption budget delete --budget-name bdg-dev` |
| `az monitor action-group create` | Creates a reusable action group (email/SMS/webhook/runbook) — track 07 | see breakdown below |
| `az monitor action-group show` | Inspects an action group's actions | `az monitor action-group show -n ag-finops -g rg-cost` |
| Cost Management budget API (portal / REST) | Creates a budget wired to a full **action group** (webhooks/runbooks), forecasted alerts | portal: Cost Management → Budgets → Add |

Flag breakdown — `az consumption budget create --budget-name bdg-dev-monthly --amount 200 --time-grain Monthly --category Cost --start-date 2026-07-01 --end-date 2027-06-30 --resource-group rg-dev`:

- `--budget-name` — a stable name you'll reference to update/delete it.
- `--amount 200` — the plan, in your billing currency, per reset period.
- `--time-grain Monthly` — the reset period (`Monthly`/`Quarterly`/`Annually`);
  the budget zeroes and re-measures each period.
- `--category Cost` — budget on **cost** (vs. `Usage`); Cost is what you want.
- `--start-date` / `--end-date` — the window the budget is active for. Start must
  be the first of a month for monthly grain; the window can span years.
- `--resource-group rg-dev` — **scopes** the budget to one RG. Omit it to scope to
  the whole subscription. This scope choice is the thing that goes wrong (see the
  diagnose-and-fix). Tag/other filters are added via `--filter` or the API.

Flag breakdown — `az monitor action-group create --name ag-finops --resource-group rg-cost --short-name finops --action email finance-lead finance@contoso.com --action webhook slack https://hooks.slack.com/services/XXX`:

- `--name` / `--short-name` — the action group's full and 12-char SMS-prefix names.
- `--action email <name> <address>` — an email receiver; add more `--action`
  clauses for more recipients.
- `--action webhook <name> <url>` — a webhook receiver (Slack/Teams/PagerDuty),
  the hook that turns a budget alert into a chat notification or an incident. Swap
  for `--action automation-runbook ...` to *act* (deallocate dev VMs) rather than
  just notify — the DIY spending cap.

## Hands-on exercises

Budgets and action groups are **free**. You'll create a real budget on your real
subscription; the only "cost" is the tiny RG you may create to hold an action
group. Remember the 8-24h data lag — a budget won't reflect brand-new spend
instantly.

1. **Create a reusable action group.** Make an RG to hold cost-management
   plumbing, then an action group that emails you:
   ```bash
   az group create -n rg-cost -l eastus
   az monitor action-group create --name ag-finops -g rg-cost --short-name finops \
     --action email me "$(az account show --query user.name -o tsv)"
   ```
   This is the exact construct from track 07 module 06, now used for cost instead
   of CPU. Confirm with `az monitor action-group show -n ag-finops -g rg-cost -o json`.

2. **Create a subscription-level monthly budget with email alerts.** Set an
   amount a little *below* your typical month-to-date so a threshold will actually
   trip (you want to see it fire):
   ```bash
   TODAY_FIRST=$(date +%Y-%m-01)
   az consumption budget create --budget-name bdg-sub-monthly --amount 50 \
     --time-grain Monthly --category Cost --start-date "$TODAY_FIRST" --end-date 2027-12-31 \
     2>/dev/null || echo "some subscription types require creating the budget via the Cost Management portal/API instead"
   ```
   Adjust `--amount` so it's below your real month-to-date spend. Confirm with
   `az consumption budget list -o table`.

3. **Add both an actual and a forecasted threshold (portal).** In the portal
   (Cost Management → Budgets → your budget), add two alert conditions: **Actual
   ≥ 80%** and **Forecasted ≥ 100%**, and attach the `ag-finops` action group to
   both. Write down which one you expect to fire *first* and why (forecasted, if
   your run-rate projects over — it warns before actual crosses).

4. **Scope a budget to a resource group.** Create a second budget scoped to a
   single busy RG (e.g. an AKS node RG or an app's RG):
   ```bash
   az consumption budget create --budget-name bdg-rg-app --amount 100 \
     --time-grain Monthly --category Cost --start-date "$TODAY_FIRST" --end-date 2027-12-31 \
     --resource-group <your-busy-rg>
   ```
   Now the budget only measures that RG's spend — a per-app guardrail. Compare its
   current spend (`az consumption budget show --budget-name bdg-rg-app`) to the
   RG's Cost Analysis total from module 01; they should match.

5. **Scope a budget by tag (the track-17 allocation tie-in).** Via the portal or
   API, create a budget **filtered to `Environment=dev`** (or a `CostCenter`
   value). This is a per-team/per-environment budget built purely on the tags from
   track 17 module 06 — no subscription split needed. Note how much spend it sees
   vs. the unfiltered subscription budget.

6. **Prove a budget actually fires.** The capstone requires a budget *proven* to
   fire — practice it now. Set a budget's amount **deliberately below** current
   month-to-date spend (e.g. amount = 50% of what you've already spent). Within a
   budget-evaluation cycle (they evaluate periodically, not instantly — allow up
   to a day) the **actual** threshold should trip and the action group should
   email you. Save that email/notification as evidence. *A budget you haven't seen
   fire is a budget you can't trust.*

7. **Diagnose and fix: the budget that never fires.** This is the most important
   exercise in the module. Reproduce a silently-broken budget, then fix it:
   ```bash
   # A budget filtered to a tag value that (almost) nothing actually carries:
   az consumption budget create --budget-name bdg-broken --amount 1 \
     --time-grain Monthly --category Cost --start-date "$TODAY_FIRST" --end-date 2027-12-31 \
     --resource-group <your-busy-rg> 2>/dev/null
   # (In the portal, add a filter CostCenter = CC-DOES-NOT-EXIST — a value no resource has.)
   ```
   Even with a $1 amount it **never fires**, because the filter matches ~zero
   spend. **Diagnose** by comparing the budget's measured spend
   (`az consumption budget show --budget-name bdg-broken --query currentSpend`) to
   what you *expect* — near-zero measured spend against a busy scope means the
   **filter/scope is wrong**, not that you're under budget. Common real causes:
   a `CostCenter` typo (`CC-1001` vs `CC1001`), filtering on a tag most resources
   **don't carry** (the module 01 allocation gap), a **renamed RG**, or the wrong
   subscription selected. **Fix:** correct the filter to a tag value that actually
   exists (verify with a module 01 `--dataset-grouping type=Tag` query first), or
   remove the bad filter — then re-prove it fires (exercise 6). Lesson: **a budget
   that never fires and a budget that's under plan look identical; the only proof
   is watching it fire.**

8. **(DIY spending cap, design-level.)** You don't have to build it, but sketch
   it: a budget at 100% → action group → **Automation runbook** that runs
   `az vm deallocate` on all `Environment=dev` VMs. Write the two or three
   sentences of caveats (idempotency, don't deallocate prod, the runbook needs its
   own identity/permissions — track 16). This is how teams *simulate* the hard cap
   Azure won't give them.

9. **Clean up.**
   ```bash
   az consumption budget delete --budget-name bdg-sub-monthly 2>/dev/null; true
   az consumption budget delete --budget-name bdg-rg-app 2>/dev/null; true
   az consumption budget delete --budget-name bdg-broken 2>/dev/null; true
   az group delete -n rg-cost --yes --no-wait
   ```
   Budgets and action groups are free, but leave your subscription as you found it.
   (Keep any budget you genuinely want as an ongoing guardrail.)

## Independent challenge

No commands given. Drawing on this module, the tag-based scoping from **track 17
module 06**, the action-group mechanics from **track 07 module 06**, and the
cost-analysis views from **module 01**, design and build a **two-tier budget
alerting setup** for one environment on your real subscription: a **team-level
budget** filtered by a `CostCenter` (or `Environment`) tag with a **forecasted
100%** alert to the team's channel, *and* a **subscription-level guardrail budget**
with an **actual 90%** alert escalating to a second (manager/platform) action
group. Then **prove the team-level one fires** by setting its amount below current
tagged spend and capturing the notification. Finally, write two or three sentences
explaining why you chose forecasted for one tier and actual for the other, and how
you'd know if the tag filter were silently matching nothing. Clean up afterward.

<details>
<summary>Stuck? One hint</summary>

Build the action groups first (two of them — `ag-team` and `ag-escalation`), then
the budgets that reference them, exactly as track 07 built the action group before
the metric alert. For the tag-filtered team budget, **verify the tag value exists
before you filter on it** — run a module 01 `az costmanagement query
--dataset-grouping type=Tag name=CostCenter` and copy an *actual* value from the
output, so you don't recreate the never-fires trap. Use **forecasted** on the team
tier because you want to warn the team early enough to change behavior; use
**actual** on the subscription guardrail because that's the ground-truth "we
really have spent this" backstop. To prove firing, set the team budget's amount to
roughly half its current measured spend and wait a budget-evaluation cycle.

</details>

## Common mistakes & troubleshooting

- **Expecting a budget to stop spending.** Azure budgets **notify**, they don't
  cap. Crossing 100% sends alerts; it doesn't block deployments. Build enforcement
  yourself (action group → runbook) if you need a hard stop.
- **The silently-never-firing budget.** A wrong scope or a filter matching
  ~nothing measures ~zero spend and never trips. It's indistinguishable from
  "under budget" until you prove it fires. Always verify with a real threshold
  crossing.
- **Only using actual alerts.** Actual alerts lag — a 100% actual alert fires
  after the money's spent. Pair with a **forecasted** alert to get warned while
  you can still act.
- **Filtering on a tag value that doesn't exist / has a typo.** `CC-1001` vs
  `CC1001`, or filtering on a tag most resources don't carry (the module 01
  allocation gap), yields a dead budget. Copy the tag value from a real Cost
  Analysis grouping first.
- **Re-typing recipients per budget instead of reusing action groups.** Define
  the on-call/team group once (track 07) and attach it everywhere — same DRY
  discipline as the rest of the platform.
- **Treating a budget as set-and-forget.** Spend patterns change. A budget firing
  every month means the *plan* is wrong — optimize (modules 03-05) or raise it
  with a documented reason; don't just mute the alert.
- **Per-team budgets with no team visibility.** A budget the team can't *see*
  (no Cost Management Reader at their scope) and doesn't *own* is just the platform
  team getting alerts it can't act on. Pair budgets with showback (module 06).

## Checkpoint quiz

Write down your answer to each question before expanding it — checking without attempting first is the single easiest way to fool yourself into thinking you've learned this.

<details>
<summary>Show questions</summary>

1. What are the three things a budget binds together, and does hitting 100% stop
   any spending? What does it actually do?
2. Explain actual vs. forecasted alerts. Which warns you *before* the money's
   spent, and what's the downside of relying on it alone?
3. What's the mature pattern combining the two alert types, and why use both?
4. What is an action group, which earlier track did you first use one in, and
   what's the action-group option that lets you build a DIY spending cap?
5. Describe the "budget that never fires" failure and three concrete causes. Why
   is it so dangerous compared to a budget that's genuinely under plan?
6. How do you *prove* a budget works, and why is that a hard requirement rather
   than a nice-to-have?
7. How do tags from track 17 module 06 let you build a per-team budget without
   giving each team its own subscription?
8. A budget has fired every month for a quarter. Is it broken? What are your two
   legitimate responses?

</details>

<details>
<summary>Show answers</summary>

1. A **scope**, an **amount over a reset period**, and **alert rules** at
   percentage thresholds. Hitting 100% **does not stop spending** — a budget is a
   **notification tool**; it sends alerts. Any hard stop is something you build on
   top (action group → runbook).
2. **Actual** fires when already-incurred spend crosses the threshold (reliable but
   lagging — the money's already gone at 100%). **Forecasted** fires when the
   *projected* end-of-period spend crosses it, warning you **while you can still
   act**. Downside of forecast alone: it's built on lagging trend data, so early
   in a period it can be jumpy and fire/un-fire as the projection settles.
3. A **forecasted 100%** alert (early warning) plus an **actual 80-90%** alert
   (ground truth). Forecast says where you're heading; actual says where you are —
   together you get early warning *and* a reliable backstop.
4. A reusable Azure Monitor bundle of actions (email/SMS/webhook/runbook), first
   used in **track 07 module 06** for AKS metric alerts. The **Automation
   runbook / Function / Logic App** action lets a 100% budget alert *act* (e.g.
   deallocate dev VMs) — the DIY spending cap Azure doesn't provide natively.
5. A budget whose scope/filter matches ~zero spend measures near-zero and **never
   crosses its threshold**. Causes: a tag-value typo (`CC-1001` vs `CC1001`),
   filtering on a tag most resources don't carry (allocation gap), a renamed RG,
   or the wrong subscription. It's dangerous because it looks *identical* to
   "we're under budget" — false confidence while spend runs away.
6. You **set a threshold below current spend and watch it actually fire** (capture
   the notification). It's a hard requirement because a never-firing broken budget
   is indistinguishable from a healthy one until you've seen it trip — an unproven
   budget provides no real protection.
7. A budget can be **filtered by tag** (`CostCenter`/`Environment`). With the
   track-17 taxonomy you scope a budget to a team's tagged spend inside a shared
   subscription — per-team guardrails without a subscription per team.
8. **Not necessarily broken** — it's telling you the *plan* is wrong. Two
   legitimate responses: **optimize** the spend down (modules 03-05) to fit the
   plan, or **raise the budget with a documented reason**. Just muting the alert is
   not one of them.

</details>

## Cumulative review

Closed-book. Don't reopen modules 00-02 or earlier tracks while attempting these
— the point is to find out what actually stuck. These mix this track's first
three modules with the tagging/governance baseline from track 17 and the
alerting mechanics from track 07.

1. Walk the FinOps loop end to end on a single scenario: a team's dev spend
   doubled last month. Which **phase** (module 00) is each of these — noticing it,
   diagnosing which resource, and preventing recurrence — and which module of this
   track handles each?
2. You're asked "what did the Payments team spend on prod last month?" Name every
   ingredient you need: the tag(s) from track 17 module 06, the cost **view**
   (amortized/actual) and why, the **scope**, and the one thing about the tags
   that could make your answer silently wrong.
3. Explain why a backfilled tag doesn't fix last month's allocation *and* why that
   same fact means enforcing tags at create time (track 17 module 06's `Deny`) is
   what makes both showback and unit economics possible.
4. Compare a **forecasted** budget alert and Cost Management's **forecast** line
   from module 01 — what data are both built on, and why can both swing early in a
   period?
5. A budget scoped to `CostCenter=CC-1001` shows near-zero spend, but you know
   that team is busy. Give the three most likely causes (spanning modules 01 and
   02) and exactly how you'd confirm which one it is.
6. You need cost visibility for a finance analyst without letting them touch or
   read resource *contents*. Name the specific RBAC role (module 01) and the scope
   concept (track 17) you'd use, and why this is cleaner than a subscription split.
7. Why is "total spend went up 20%" a bad thing to escalate on, and what unit-
   economics reframe (module 00) turns it into a real signal? Give a denominator.
8. Tie action groups together across three tracks: name what you attached one to
   in track 07, what you'd attach one to here, and one thing (module 07 preview)
   you might attach one to later — and the DRY reason you define it once.
9. Someone shows two numbers for "prod cost last month" that differ by a few
   hundred dollars and concludes the bill is wrong. Give the one-line diagnosis
   and the convention that prevents the confusion.
10. From a blank page: list, in order, the minimum steps to give a new team
    *trustworthy* per-team cost visibility and a working guardrail — starting from
    tags and ending at a proven-firing budget — naming the track/module for each.

<details>
<summary>Show answers</summary>

1. Noticing = **Inform** (module 01 cost analysis / module 02 budget alert that
   should have caught it); diagnosing which resource = still **Inform** (module 01
   grouping by RG/resource); preventing recurrence = **Optimize** (modules 03-05,
   rightsize/cleanup/commit) plus **Operate** (module 02 budget, module 07 gate).
   The loop is Inform → Optimize → Operate, continuously.
2. The **`CostCenter`/`Owner`** tag(s) to isolate Payments and the `Environment=prod`
   filter (track 17 module 06); **amortized** cost (true daily run-cost for
   allocation, module 01); the **scope** (the subscription/RG under Payments in the
   track-17 tree); and the silent-error risk is the **(untagged)** bucket — spend
   that was untagged at usage time can't be attributed to Payments at all.
3. Cost Management allocates each usage record by the tags it had **at the time of
   usage**, so a tag added later never re-labels past months. Therefore only
   **create-time enforcement** (the `Deny`) guarantees spend is tagged *while it's
   being incurred* — which is the precondition for a complete showback total and a
   correct unit-cost numerator.
4. Both are built on the same **lagging, trend-based** cost data (module 01's
   8-24h lag + historical run-rate). Early in a period there's little actual data
   to project from, so both the budget's forecasted alert and the forecast line
   can swing/over- or under-shoot until the period fills in.
5. (a) Tag **typo/format** — resources tagged `CC1001`/`cc-1001` not `CC-1001`;
   (b) resources **untagged** (allocation gap) so they're excluded by the filter;
   (c) **wrong scope/subscription** or a renamed RG. Confirm by running a module 01
   `az costmanagement query --dataset-grouping type=Tag name=CostCenter` at the
   scope and reading the *actual* tag values and the (untagged) size.
6. **Cost Management Reader** (module 01) assigned at the team's **scope** node in
   the track-17 MG/subscription/RG tree. Cleaner than a subscription split because
   it's pure RBAC on the existing hierarchy — no re-homing resources, and it
   separates *cost* visibility from *resource* access (track 16).
7. Because a 20% rise could be healthy growth or pure waste — the number alone
   can't tell you. Reframe as a **unit cost**: cost **per active customer** (or per
   request/transaction). If cost-per-customer is flat, the rise is scaling; if it's
   climbing, it's an efficiency problem worth escalating.
8. Track 07: an **AKS metric alert** (e.g. node CPU). Here: a **budget threshold**.
   Later (module 07 preview): a **cost-gate / policy** notification, or an SLO
   burn alert (track 20). Define it once (`ag-finops`/on-call group) and attach
   everywhere so recipients and webhooks aren't re-typed per alert — the platform
   DRY habit.
9. **Diagnosis:** one number is **amortized**, the other **actual** — a reservation/
   savings plan is being spread across usage in one and billed on the purchase day
   in the other (module 01). **Convention:** always state which view a figure came
   from; use amortized for allocation, actual for the invoice.
10. (1) Enforce the tag taxonomy at create time — `Deny` on required tags, track 17
    module 06. (2) Verify allocation — group cost by `CostCenter` and shrink the
    (untagged) bucket, module 01. (3) Grant the team **Cost Management Reader** at
    their scope, module 01 / track 16. (4) Create a **tag-filtered budget** with a
    forecasted + actual alert wired to their action group, module 02 / track 07.
    (5) **Prove it fires**, module 02.

</details>

## Next

Continue to
[03-rightsizing-compute](../03-rightsizing-compute/README.md)
— you can now see, allocate, and guard spend (the Inform phase). Time to enter the
**Optimize** phase and actually change the bill, starting with the biggest lever
for most orgs: rightsizing over-provisioned compute — AKS node pools, VM SKUs, and
Container Apps allocations — using Azure Advisor, plus the recommendation that's
*wrong* for a bursty workload.
