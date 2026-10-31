# Incident Response Process

## Why this matters

A page fired, a rested on-call engineer opened a good runbook
([module 04](../04-on-call-in-depth/README.md)) — and it's a real, spreading
outage bigger than one person can handle. Without a *process*, that's when things
go wrong the expensive way: three people fix the same thing, nobody tells
customers, and the "fix" makes it worse. Incident response is the pre-agreed
structure — severity levels, defined roles, a communication discipline, and a
clear declare/resolve boundary — that turns a chaotic outage into a coordinated
one. It's the counterpart to
[track 11 module 07](../../11-security-deep-dive/README.md)'s security incident
response, generalized to *any* reliability incident and fed by the burn-rate
signals from [module 03](../03-slo-dashboards-and-burn-rate-alerts/README.md).

## Concepts

### Severity levels — a shared scale for "how bad is this"

A **severity level** (SEV) is a pre-agreed classification of an incident's impact
that tells everyone how to respond *without re-litigating it each time*. A typical
scale: **SEV1** — critical, user-facing outage or data loss, all-hands, wake
people up, notify leadership and customers; **SEV2** — major degradation,
significant user impact but not total, urgent but not everyone; **SEV3** — minor,
limited impact, handle in business hours. The exact number of tiers matters less
than that the scale is **written down and shared**, so "this is a SEV1" instantly
conveys who to page, how fast to respond, and whether to tell customers — no
debate mid-incident. Severity should be judged on **user impact**, not on how
technically alarming the cause looks; and it can be **revised up or down** as you
learn more (a "SEV3" that turns out to be losing orders becomes a SEV1). Your
burn-rate alerts from module 03 map naturally onto this: a fast-burn page is
usually a SEV1/SEV2, a slow-burn ticket a SEV3.

### The incident commander — one person coordinates, and doesn't fix

The single most important role is the **Incident Commander (IC)**. The IC's job is
**coordination, not fixing** — and separating those is the whole point. In an
unmanaged incident, everyone dives into the technical problem and *nobody* is
tracking the big picture, deciding priorities, or talking to stakeholders. The IC
owns the incident: they hold the current state ("what do we know, what are we
trying"), assign work to responders, decide when to escalate or pull more people
in, and are the single point of coordination — deliberately staying *out* of the
hands-on debugging so their attention stays global. Crucially, **the IC is a role,
not a rank**: it can be whoever declared the incident, often the on-call engineer
at first, and it can be *handed off* explicitly ("you are now IC") when someone
more appropriate is available or the current IC needs a break. The IC being a
clear, single, hand-off-able role is what prevents the two classic failures:
nobody coordinating, or several people thinking they're in charge.

### Supporting roles — comms and ops, so the IC can stay global

On a larger incident the IC delegates two supporting roles so they aren't doing
everything. The **Communications Lead** owns *external and stakeholder*
communication — status-page updates, customer notifications, keeping leadership
informed — on a regular cadence, so the responders aren't interrupted every five
minutes by "any update?" and customers aren't left in the dark. The **Operations
Lead** (or "ops/tech lead") directs the *hands-on* technical work — the people
actually running commands — freeing the IC from having to track every keystroke.
On a small incident one person may wear all these hats; the value is knowing the
*functions* exist so that as an incident grows you *split them out* rather than
overloading the IC. This mirrors how you'd never let one process in a distributed
system be coordinator, worker, and reporter at once — you separate concerns so
each stays responsive.

### Communication during an incident — the incident channel and cadence

How you communicate *during* the fire determines how well it goes. The disciplines:
open a **single dedicated incident channel** (a Slack/Teams channel or bridge) so
all coordination is in one place with a timeline you can reconstruct later (this
becomes raw material for the postmortem, module 06); keep a **running timeline** —
timestamped facts, what was tried, what happened — because human memory of an
incident is unreliable and the postmortem needs facts; communicate on a **regular
cadence** even when there's nothing new ("still investigating, next update in 15
min") so stakeholders don't panic-poll the responders; and **separate facts from
speculation** ("error rate is 40%" vs. "we *think* it's the deploy") so the team
doesn't chase a guess as if it were confirmed. The `trace_id`-driven correlation
from track 12 module 07 is how you *get* the facts fast; the incident channel is
where you record and coordinate on them.

### Declaring and resolving — the two boundaries that bracket an incident

An incident needs a clear **start** and **end**, both deliberate. **Declaring**
one — saying out loud "this is an incident, I'm IC, here's the SEV" — is
undervalued: teams routinely *under-declare*, treating a spreading outage as
"just a glitch" and losing the coordination that a declaration triggers. The rule
is **declare early; it's cheap to stand one down and expensive to have started
coordinating late**. **Resolving** is the other boundary: an incident is over when
**user impact has stopped** — service is back within SLO — which is *not* the same
as "root cause fully understood." You **mitigate first** (stop the bleeding — roll
back, fail over, scale up, even if you don't yet know *why*) and resolve the
incident on mitigation; the *understanding* and permanent fix come afterward in
the **postmortem** (module 06). Conflating "resolved" with "root-caused" keeps
people fighting a fire that's already out, or worse, delays mitigation while
someone insists on understanding first. Mitigate, resolve, *then* learn.

## Command reference

Incident response is process, but it's anchored on the real signals and tools from
prior tracks — the burn-rate alerts that declare it, the correlation flow that
diagnoses it, and the mitigations that resolve it.

| Action / concept | What it does | Reuses |
|---|---|---|
| Severity (SEV1-3) | Pre-agreed impact scale → who/how fast/tell customers | this module |
| Incident Commander | Single coordinator, does not fix | this module |
| Comms Lead / Ops Lead | Split-out roles as an incident grows | this module |
| Declare | Explicitly start the incident, assign IC + SEV | declare early |
| `kubectl rollout undo deployment/<app>` | **Mitigate** by rolling back a bad deploy | track 03/07 |
| `kubectl rollout status deployment/<app>` | Confirm the rollback took effect | track 03/07 |
| Grafana SLO dashboard + burn rate | Confirm user impact and when it stops | module 03 |
| `trace_id` metric→log→trace flow | Get *facts* fast for the timeline | track 12 module 07 |
| Resolve | End the incident when user impact stops (≠ root-caused) | mitigate-first |

Mitigate-first, the most common reliability mitigation — roll back a bad deploy:

```bash
kubectl rollout undo deployment/demo -n demo
kubectl rollout status deployment/demo -n demo --timeout=120s
```
- `rollout undo` — reverts the Deployment to its previous ReplicaSet (track 03/07)
  — the fastest way to *stop the bleeding* when a burn-rate spike started right
  after a deploy, **before** you understand exactly what the deploy broke.
- `rollout status` — blocks until the rollback is fully rolled out, so you can
  confirm on the SLO dashboard (module 03) that the burn rate is dropping — your
  signal that user impact is ending and you can **resolve** the incident.
- The *why* — what the bad deploy actually changed — is deliberately deferred to
  the postmortem. Resolution follows mitigation, not root-cause.

## Hands-on exercises

Continue on the **kind** cluster with the burn-rate alerts and SLO dashboard from
[module 03](../03-slo-dashboards-and-burn-rate-alerts/README.md) and the runbook
from [module 04](../04-on-call-in-depth/README.md). Several exercises are
simulations — run them for real (a solo "incident" against the demo app) so the
process is muscle memory, not theory.

1. **(paper) Write a severity rubric.** Define SEV1/SEV2/SEV3 for the demo service
   in terms of *user impact* (not cause): what qualifies, who's paged, response
   speed, and whether customers are told, for each. Then map your module 03
   burn-rate alerts onto it (fast-burn → ?, slow-burn → ?).

2. **(paper) Classify incidents by severity.** Given five scenarios — (a) checkout
   fully down, (b) 5% of requests slow, (c) an internal dashboard broken, (d)
   data being written incorrectly but silently, (e) one region degraded — assign a
   SEV to each and justify by *user impact*. Note that (d) should be high despite
   looking minor: severity is impact, not how alarming the symptom seems.

3. **(WSL2 + paper) Run a full simulated incident, solo.** Trigger the fast-burn
   alert (inject 5xx as in module 03). Now run the whole process out loud/on paper:
   **declare** ("this is a SEV2, I'm IC"), open an incident channel (a text file is
   fine), start a **timeline** with timestamps, **mitigate** by rolling back
   (`kubectl rollout undo`), watch the SLO dashboard confirm impact stopping, post
   a **stakeholder update** on cadence, and **resolve** when user impact ends.
   Save the timeline — module 06 turns it into a postmortem.

4. **(paper) Practice the mitigate-vs-root-cause split.** For your simulated
   incident, write two lists: what you did to *mitigate* (stop bleeding) and what
   questions about *root cause* you deliberately deferred. Then write one sentence
   on why resolving on mitigation (not understanding) was correct here.

5. **(paper) Write the IC's running commentary.** Replay your incident and write
   what a *good IC* would say at each step — assigning work, holding state,
   deciding to escalate, separating fact from speculation. Explicitly note the
   moments the IC should *not* be typing `kubectl` themselves and why.

6. **(paper) Role-split a growing incident.** Take your SEV2 and imagine it grows
   to SEV1 spanning two services. Split out a Comms Lead and an Ops Lead: write
   exactly what each now owns that the IC was doing alone, and the cadence the
   Comms Lead posts on. Show how splitting keeps the IC global.

7. **Diagnose and fix: the unmanaged incident (no IC, no declaration).** Reproduce
   the classic chaos. Scenario transcript: an outage where three engineers all
   start "fixing" independently — one rolls back while another rolls forward,
   nobody has declared an incident or claimed IC, customers hear nothing for 40
   minutes, and two people apply conflicting changes that extend the outage.
   **Diagnose** every process failure: no declaration (so no coordination kicked
   in), no IC (so no single coordinator, conflicting actions), no comms (customers
   in the dark), mitigation and root-cause conflated (someone insisted on
   understanding before stopping the bleeding). **Fix** by replaying it *with* the
   process: someone declares and becomes IC, the IC assigns *one* person to
   mitigate and holds everyone else, a comms update goes out on cadence, and the
   incident resolves on mitigation. Lesson: **the process isn't bureaucracy — it's
   the specific thing that stops three people making it worse; declaring an
   incident and naming one IC is cheaper than the 40 minutes of chaos it
   prevents.** Under-declaring is the single most common and most expensive
   incident-response failure.

8. **(WSL2) Clean up and preserve the timeline.** Revert the injected errors and
   any experimental config. **Keep** the incident timeline text file from exercise
   3 — module 06 is where it becomes a blameless postmortem, and the capstone
   requires a real one.

## Independent challenge

Drawing on this module, the burn-rate alerts from
[module 03](../03-slo-dashboards-and-burn-rate-alerts/README.md), the runbook and
on-call system from [module 04](../04-on-call-in-depth/README.md), and the
correlation flow from
[track 12 module 07](../../12-observability-deep-dive/07-correlating-the-three-pillars/README.md),
run a *complete, realistic incident from declaration to resolution* against the
demo app and produce the incident record — no script given. Simulate a bad deploy
that trips your fast-burn alert, then: declare the incident with a severity from
your own rubric and take IC; open an incident channel and keep a timestamped
timeline separating fact from speculation; use the metric→log→trace flow to find
what's happening (facts, fast); mitigate to stop user impact *before* you fully
understand root cause; post stakeholder updates on a cadence; and resolve the
moment user impact ends. The deliverable is the *incident timeline you produced* —
because module 06 turns exactly this record into a blameless postmortem, and a
timeline you didn't actually keep during the fire is one you'll fabricate
afterward, which defeats the point.

<details>
<summary>Stuck? One hint</summary>

Do it solo but play every role out loud so the boundaries are real. The mitigation
for a deploy-triggered burn is almost always `kubectl rollout undo` (track
03/07) — do that *first* and confirm on the module 03 SLO dashboard that the burn
rate drops, which is your "user impact stopped → resolve" signal; the "why did the
deploy break it" investigation is deliberately deferred to the postmortem. For the
timeline, timestamp every action and every observation, and mark each line as fact
("error ratio 38% at 14:03") or hypothesis ("suspect the config change"). That
fact/speculation split and the timestamps are exactly what makes module 06's
postmortem writeable.

</details>

## Common mistakes & troubleshooting

- **Under-declaring.** Treating a spreading outage as "a glitch" loses the
  coordination a declaration triggers. Declare early — standing an incident down is
  cheap; coordinating late is expensive.
- **No incident commander (or several).** Without one clear IC, nobody holds the
  big picture or people give conflicting orders. One IC, explicitly named,
  hand-off-able.
- **The IC also fixing.** If the coordinator has their head in a terminal, nobody's
  tracking priorities or stakeholders. The IC coordinates and delegates the
  hands-on work.
- **Conflating resolved with root-caused.** An incident ends when *user impact*
  stops, not when you understand why. Mitigate first; defer understanding to the
  postmortem.
- **Root-causing before mitigating.** Insisting on understanding before stopping
  the bleeding extends the outage. Stop the bleeding first (roll back / fail over),
  understand later.
- **No timeline, or memory-based one.** Reconstructing an incident from memory
  afterward produces a fiction. Keep a timestamped, fact-vs-speculation timeline
  *during* the incident.
- **Severity judged on cause, not impact.** A scary-looking cause with no user
  impact is low sev; a quiet symptom silently losing data is high sev. Grade on
  user impact and revise as you learn.
- **Silent responders.** Conflicting fixes happen when people act without saying
  so in the incident channel. All coordination in one channel, out loud.

## Checkpoint quiz

Write down your answer to each question before expanding it — checking without attempting first is the single easiest way to fool yourself into thinking you've learned this.

<details>
<summary>Show questions</summary>

1. What is a severity level *for*, and on what should severity be judged?
2. What does the Incident Commander do and, just as importantly, *not* do? Why
   "role, not rank"?
3. Name the two supporting roles you split out as an incident grows and what each
   owns.
4. Give three communication disciplines during an incident and why each matters.
5. When is an incident *resolved*, and how is that different from *root-caused*?
   What's the ordering rule?
6. Why is under-declaring the most common and expensive incident-response failure?
7. In the unmanaged-incident scenario (no IC, no declaration), name three distinct
   failures and the single fix that addresses most of them.

</details>

<details>
<summary>Show answers</summary>

1. A severity level is a pre-agreed impact classification so everyone knows who to
   page, how fast to respond, and whether to tell customers — without debating it
   mid-incident. Judge it on **user impact**, not how alarming the cause looks, and
   revise it as you learn more.
2. The IC **coordinates**: holds current state, assigns work, decides escalation,
   owns/ delegates stakeholder comms. They deliberately do **not** do the hands-on
   debugging, so their attention stays global. "Role, not rank" so anyone
   (often the on-call) can be IC and the role can be handed off — preventing
   nobody-in-charge or multiple-in-charge.
3. **Comms Lead** — external/stakeholder communication on a cadence (status page,
   customers, leadership). **Ops/Tech Lead** — directs the hands-on technical work
   — freeing the IC from tracking every command.
4. Any three: single incident channel (one place, reconstructable timeline);
   running timestamped timeline (memory is unreliable; postmortem needs facts);
   regular cadence even with no news (stakeholders don't panic-poll responders);
   separate fact from speculation (don't chase a guess as if confirmed).
5. Resolved when **user impact stops** (back within SLO). That's different from
   root-caused — you may not yet know *why*. Ordering rule: **mitigate first**
   (stop the bleeding), resolve on mitigation, defer root cause and permanent fix
   to the postmortem.
6. Because a declaration is what triggers coordination (IC, roles, comms), and
   teams routinely treat a real outage as "just a glitch," losing that
   coordination while the outage spreads. Standing an incident down is cheap;
   coordinating late is expensive — so declare early.
7. Any three: no declaration (no coordination kicked in), no IC (conflicting
   actions, nobody holds the picture), no comms (customers in the dark),
   mitigate/root-cause conflated (someone insisted on understanding before
   stopping the bleeding). The single fix that addresses most: declare and name
   one IC, who assigns *one* mitigator and holds everyone else.

</details>

## Cumulative review

Closed book. Cover the answers and write each out before checking. These mix the
whole track so far — mindset (00), SLIs/SLOs (01), error budgets (02), burn-rate
alerting (03), on-call (04), and incident response (this module) — and the
track 12 stack underneath.

1. A metric is proposed as an SLI: node memory usage %. Is it a good SLI? Give the
   test and the verdict, and what you'd use instead. (modules 00-01)
2. Write the PromQL for a burn rate over 1h for a 99.9% availability SLO, and say
   what a value of 1 vs. 14.4 means. (modules 02-03)
3. Your fast-burn alert never fires despite an obvious outage. Give two
   window-related causes and how you'd confirm each. (module 03)
4. Distinguish SLO from SLA and error budget from burn rate — one sentence each.
   (modules 01-03)
5. An on-call engineer is paged 18 times in one night for a single bad deploy.
   Name the two Alertmanager mechanisms that fix this and the process that
   prevents recurrence. (modules 03-04, track 12 module 06)
6. What does the Incident Commander do, what do they deliberately *not* do, and
   why is "role, not rank" important? (module 05)
7. When is an incident *resolved*, and why is that different from *root-caused*?
   What do you do first? (module 05)
8. The error budget is exhausted and someone proposes relaxing the SLO to 99% so
   the dashboard turns green. Walk through the correct response. (module 02)
9. Give three properties of a good runbook and explain runbook-as-code in one
   sentence. (module 04)
10. Sequence the SRE loop for one incident from detection to learning, naming the
    module that owns each stage. (all modules 00-06)

<details>
<summary>Show answers</summary>

1. Test: does it move when and only when users are hurt? Memory % fails — it can
   be high with happy users or low while the service errors, so it's a cause, not
   a symptom. Use a user-felt SLI instead: request success ratio and/or
   latency-under-threshold.
2. `(sum(rate(http_requests_total{code=~"5.."}[1h])) /
   sum(rate(http_requests_total[1h]))) / (1 - 0.999)`. **1** = spending the budget
   at exactly the sustainable rate (all of it over the window); **14.4** = burning
   14.4× that fast, whole 30-day budget gone in ~2 days (a page).
3. (a) Long window ≤ short window / pair inverted, so the two-window `and` never
   agrees; (b) rate window too short for the scrape interval (e.g. `[15s]` at 30s
   scrape) returning nothing. Confirm by graphing each leg of the `and` alone —
   one is always empty or never crosses.
4. **SLO** = internal reliability target; **SLA** = contractual promise with
   penalties (SLO stricter). **Error budget** = total allowed failure (`1 − SLO`)
   over the window; **burn rate** = how fast you're consuming that budget right
   now.
5. `group_by: [alertname, service]` (collapse one incident to one page) and
   `inhibit_rules` (bigger alert suppresses redundant smaller ones). The process:
   the weekly on-call review, which treats a page storm as an alerting bug to fix
   and tracks pages-per-shift.
6. The IC **coordinates** — holds state, assigns work, decides escalation, talks
   to stakeholders (or delegates comms) — and deliberately does **not** do the
   hands-on fixing, so their attention stays global. "Role, not rank" lets whoever
   declared it be IC and lets the role be handed off, preventing both
   nobody-in-charge and several-people-in-charge.
7. Resolved when **user impact stops** (back within SLO) — which is *not* the same
   as understanding root cause. You **mitigate first** (roll back / fail over /
   scale) to stop the bleeding, resolve on mitigation, and defer the root cause and
   permanent fix to the postmortem.
8. Recognize the budget is overspent; relaxing the SLO just hides the breach
   (users still hurt). Correct response: trigger the error-budget policy (feature
   freeze + reliability investment), *or* honestly re-derive the SLO with data if
   it was never achievable (module 01's "measure first") — never silently move the
   target.
9. Any three: user-terms meaning + impact; exact diagnostic steps (dashboard
   link, specific queries, commands); named causes with specific fixes;
   escalation guidance; SLO/budget context. Runbook-as-code: runbooks live in the
   service's Git repo, versioned and PR-reviewed, and linked from the alert via
   `runbook_url`.
10. **Detect** (burn-rate alert, module 03) → **page** the on-call with a runbook
    (module 04) → **declare + coordinate** under an IC with a severity (module 05)
    → **mitigate + resolve** on user-impact-stopped (module 05) → **learn** via a
    blameless postmortem with action items (module 06) — all sitting on track 12's
    metrics/alerting, and governed by the SLO/error budget (modules 01-02) and
    reliability mindset (module 00).

</details>

## Next

[06-blameless-postmortems](../06-blameless-postmortems/README.md) — the incident
is resolved and you kept a timeline. Now close the loop: write a *blameless*
postmortem that finds the real (systemic) root cause, turns lessons into action
items that actually reach the backlog, and explains why blame quietly destroys the
whole practice.
