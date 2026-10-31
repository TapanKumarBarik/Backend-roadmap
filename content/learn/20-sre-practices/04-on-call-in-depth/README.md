# On-Call in Depth

## Why this matters

[Track 12 module 06](../../12-observability-deep-dive/06-alerting-and-on-call-basics/README.md)
taught you to make alerts *actionable* and named alert fatigue as the enemy; this
module builds the human system that receives those alerts and formalizes the fix.
A great alert that pages a burned-out engineer with no runbook at 3am still ends
in a slow, error-prone response. On-call done well — humane rotations, clear
escalation, and runbooks that genuinely help — is what turns your burn-rate pages
from [module 03](../03-slo-dashboards-and-burn-rate-alerts/README.md) into fast,
repeatable incident response instead of a lottery on who's awake and what they
remember.

## Concepts

### Rotation design — sustainable, not heroic

An **on-call rotation** is the schedule deciding who's responsible for responding
to pages at any given time. The goal is *sustainability*: on-call must be a normal
part of the job, not a punishment or an act of heroism, or your best people burn
out and leave. Practical rules that make a rotation humane: a **big enough pool**
(6-8 engineers so any one person is on-call roughly one week in 6-8, not every
other week); **follow-the-sun** across time zones where you have them, so nobody is
routinely paged at 3am local; **primary and secondary** on-call simultaneously
(the secondary is backup if the primary doesn't ack); **reasonable shift length**
(a week is common; longer burns people out, much shorter fragments context); and
**compensation or time-off-in-lieu** so on-call is recognized work, not unpaid
availability. A rotation designed for heroics — two people, always on — is a
resignation generator.

### Escalation policies — what happens when nobody acks

An **escalation policy** defines what happens to a page that *isn't acknowledged*.
A page fires to the primary on-call; if they don't **ack** within N minutes (say
5), it **escalates** to the secondary; if they don't ack either, it escalates
further — to the team lead, then an engineering manager, then a broader group.
This is the safety net that ensures a page is never silently dropped because the
one person it went to is asleep, driving, or has a dead phone. It's the human
counterpart to the Alertmanager routing tree from track 12 module 06 (which
decided *which receiver* got the alert); escalation decides *what happens when
that receiver doesn't respond*. Every escalation policy needs a defined **ack**
action (a way for the responder to say "I've got it," stopping the escalation) and
a final tier that is guaranteed to reach *someone* — the escalation must never run
off the end into nobody.

### Runbooks — the difference between a good one and a useless one

A **runbook** (or playbook) is the document a paged engineer opens to know what to
do about *this specific alert*. Most runbooks are useless, and the difference is
stark. A **useless runbook** restates the alert ("HighErrorRate means the error
rate is high") and offers vague advice ("investigate the issue, check the logs").
A **good runbook** is written for a stressed engineer at 3am who may not own this
service and assumes nothing: it states **what the alert means in user terms** and
its **severity/impact**; gives the **exact first diagnostic steps** — the specific
Grafana dashboard link, the exact PromQL/LogQL queries to run (reusing your track
12 correlation flow), the specific `kubectl` commands; lists the **most common
causes and their specific fixes** ("if X, roll back with this command; if Y,
scale this deployment"); says **when and how to escalate** and who owns the
service; and links the relevant **SLO/error-budget** context. The test: *could
someone who has never seen this service follow it to a resolution?* If not, it's
prose, not a runbook. The `runbook:` annotation you added to the burn-rate alert
in module 03 should point at exactly this.

### Runbook as code — keeping runbooks alive and linked

A runbook that drifts out of date is worse than none — it confidently sends the
responder down a path that no longer works. The durable pattern is **runbook as
code**: store runbooks in the same Git repo as the service (track 08), version
them alongside the code, review changes in PRs, and **link them directly from the
alert** via the `runbook`/`runbook_url` annotation so the paged engineer is one
click from the right document — never hunting a wiki at 3am. Some teams go further
and make runbook steps *executable* (scripts or "you can safely run this command"
blocks), but the baseline discipline is: runbooks live with the code, are reviewed
when the service changes, and every paging alert links to exactly one. This closes
the loop with the postmortem process (module 06): a common, high-value action item
is "the runbook was wrong/missing — fix it," and if runbooks are code, that's a
reviewable PR, not a lost intention.

### Alert fatigue, formally fixed — the operational-review loop

Track 12 module 06 named alert fatigue and gave tactical fixes (grouping,
symptom-based alerting, severity routing). The *formal* fix is a standing process:
a **regular on-call review** (often weekly) where the team looks at **every page
from the last shift** and asks, for each: was it *actionable*? did it require a
*human*? was the runbook *useful*? If a page was non-actionable or auto-resolved,
it gets **fixed or deleted** — tuned threshold, converted to a ticket, silenced, or
removed — and that fix becomes a tracked action item. You also watch a metric:
**pages per shift**. If on-call is being woken more than a small handful of times
a night, that's a *bug in the alerting*, treated with the same seriousness as a
bug in the code. This is the systemic version of module 03's burn-rate philosophy:
you don't just make individual alerts good, you run a loop that keeps the whole
alert set healthy over time — and it feeds directly from the postmortem action
items in module 06.

## Command reference

On-call is mostly process, but it touches real tooling: Alertmanager
grouping/inhibition (track 12 module 06) reduces page volume, and `amtool` lets
you inspect and silence from the CLI during a shift.

| Command / concept | What it does | Notes |
|---|---|---|
| Primary / secondary | Two simultaneous on-call responders; secondary backs up the primary | rotation design |
| Ack | Responder action that stops escalation ("I've got it") | escalation policy |
| Escalation policy | What happens when a page isn't acked in N minutes | pager tool (PagerDuty/Opsgenie/etc.) |
| `amtool silence add` | Create a silence from the CLI during a shift | reuse track 12 module 06 silencing |
| `amtool silence query` | List active silences | audit what's muted before you leave a shift |
| Alertmanager `inhibit_rules` | Suppress child alerts when a parent fires | reduces page volume (track 12 module 06) |
| `group_by` | Collapse a multi-instance incident into one page | primary anti-flood (track 12 module 06) |
| Runbook `runbook_url` annotation | Links an alert straight to its runbook | added in module 03 |

`amtool` during a shift — silence known noise without opening the UI:

```bash
amtool --alertmanager.url=http://localhost:9093 silence add \
  alertname=ErrorBudgetSlowBurn service=demo \
  --duration=2h --comment="known slow burn, fix tracked in JIRA-123" --author=oncall
amtool --alertmanager.url=http://localhost:9093 silence query
```
- `silence add alertname=... service=...` — label matchers selecting exactly what
  to mute (the same matcher model as the UI silences in track 12 module 06).
- `--duration=2h` — time-boxed; the silence auto-expires so muted noise doesn't
  become permanently invisible (module 06's "silence, don't delete" discipline).
- `--comment=... --author=...` — *mandatory hygiene*: a silence with no reason is
  how alerts vanish forever. Always record why and who.
- `silence query` — list active silences; run it before you hand off a shift so
  the next on-call knows what's muted and why.

## Hands-on exercises

Continue on the **kind** cluster with the Alertmanager stack and the burn-rate
alerts from [module 03](../03-slo-dashboards-and-burn-rate-alerts/README.md).
Several exercises are written artifacts (rotation, runbook) — those are the point;
on-call quality is judgment, not commands.

1. **(paper) Design a humane rotation.** For a team of 7 engineers across two time
   zones, design a rotation: shift length, pool size, primary/secondary,
   follow-the-sun handoff, and comp/time-off policy. Then compute how often each
   person is on-call. Contrast with a 2-person always-on rotation and write one
   sentence on why the latter causes attrition.

2. **(paper) Design an escalation policy.** Write the escalation chain for a
   `critical` page: primary → (N min, no ack) → secondary → (N min) → team lead →
   manager. Specify the ack timeout, the ack action, and the guaranteed final
   tier. Then identify the failure mode of a policy whose last tier is a single
   person who might be unreachable.

3. **(WSL2) Wire the escalation intuition into Alertmanager timing.** You may not
   have a full pager tool, but you can model the "re-notify if unacked" behavior
   with Alertmanager's `repeat_interval` (track 12 module 06). Set a short
   `repeat_interval` on the `critical` route, force the fast-burn alert from
   module 03, and observe the receiver get re-notified until you silence/resolve
   it — the local analog of "escalate if not acked."

4. **(paper → repo) Write a *good* runbook for your fast-burn alert.** For the
   `ErrorBudgetFastBurn` alert from module 03, write a runbook that a stranger to
   the service could follow: what it means in user terms, impact/severity, the
   exact first dashboard link and PromQL/LogQL queries (reuse your track 12
   correlation flow), the top 2-3 likely causes with *specific* fixes (e.g. "if
   the burn started right after a deploy, roll back with `kubectl rollout undo
   deployment/demo`"), when to escalate, and the SLO/budget context. Store it in a
   repo (track 08) and set the alert's `runbook_url` to point at it.

5. **(paper) Grade a useless runbook.** Take this runbook: *"HighErrorRate: the
   error rate is high. Investigate the issue and check the logs. Escalate if
   needed."* List every way it fails the "could a stranger resolve the incident?"
   test, and rewrite one step of it concretely. This trains you to spot the
   difference under pressure.

6. **(WSL2) Silence hygiene during a shift.** Using `amtool silence add`, silence
   the slow-burn alert with a duration, comment, and author, then `silence query`
   to confirm. Then deliberately create a *bad* silence (no comment, no expiry
   analog) and articulate why an un-commented, open-ended silence is how a real
   alert disappears for the day it matters (track 12 module 06's "silence, don't
   delete" — now the failure is the silence itself).

7. **(paper) Run an on-call review.** Given this fake shift log — [12 pages: 4 ×
   `NodeCPUHigh` (auto-resolved, no action), 3 × `PodRestarted` (normal), 2 ×
   `ErrorBudgetSlowBurn` (real, ticketed), 1 × `ErrorBudgetFastBurn` (real
   incident), 2 × `DiskWarning` (acked, nothing done)] — classify each page as
   *keep / tune / delete*, propose the specific fix for each non-actionable one,
   and compute pages-per-shift before and after your changes. This is the formal
   alert-fatigue fix in action.

8. **Diagnose and fix: alert fatigue from a page storm that's really one
   incident.** Reproduce the failure track 12 module 06 warned about, now from the
   on-call seat: remove `group_by` (or set it wrong) so a single bad deploy makes
   20 pods each fire the fast-burn alert, and the on-call gets *20 pages for one
   incident* — the definition of fatigue. **Diagnose:** in the Alertmanager UI the
   20 alerts are the *same* incident (same `alertname`, same service) but arrived
   as 20 separate notifications because nothing grouped them; the responder can't
   tell it's one problem. **Fix:** set `group_by: [alertname, service]` so the 20
   collapse into one page, add an `inhibit_rule` so the fast-burn `critical`
   suppresses the redundant slow-burn `warning` for the same service, and file the
   "why did 20 pods break at once" question for the postmortem (module 06). Lesson:
   **on-call health is a systems property — the fix for being paged 20 times isn't
   to answer faster, it's to make one incident produce one page** (grouping +
   inhibition + the review loop), which is exactly why the weekly review treats a
   page storm as a bug to fix, not a night to survive.

## Independent challenge

Drawing on this module, the Alertmanager grouping/inhibition/silencing from
[track 12 module 06](../../12-observability-deep-dive/06-alerting-and-on-call-basics/README.md),
the burn-rate alerts from
[module 03](../03-slo-dashboards-and-burn-rate-alerts/README.md), and the Git
workflow from [track 08](../../08-git-and-version-control/README.md), design a
*complete on-call system* for the demo service and prove one part of it works
end to end — no templates given. Produce: a humane rotation (with the math on
how often each person is paged), an escalation policy with a guaranteed final
tier, a *genuinely good* runbook-as-code for your fast-burn alert (stored in a
repo and linked via `runbook_url`), and a written weekly-review procedure that
would keep pages-per-shift low over time. Then demonstrate the alert-fatigue fix
live: cause a multi-instance incident, show it producing a page storm without
grouping, and show it collapsing to a single page with grouping + inhibition. The
deliverable is the *system plus the demonstrated fix* — a rotation and runbook on
paper that you've never proven reduce noise are still hope, not strategy
(module 00).

<details>
<summary>Stuck? One hint</summary>

The runbook is where most of the marks are — write it for a stranger at 3am and
test it against "could someone who's never seen this service reach a resolution?"
Every step should be a specific link, query, or command, not "investigate."
Reuse the exact metric→log→trace correlation flow from track 12 module 07 as the
runbook's diagnostic section, and reuse track 12 module 06's `group_by:
[alertname, service]` + an `inhibit_rules` entry (critical suppresses warning,
`equal: [service]`) as the live anti-fatigue demonstration. The weekly review is
just: list every page, mark each keep/tune/delete, turn every "tune/delete" into a
tracked action item, and watch pages-per-shift as the health metric.

</details>

## Common mistakes & troubleshooting

- **Heroic rotations.** Two people always on-call burns out your best engineers.
  Build a pool of 6-8, primary+secondary, reasonable shifts, and recognized comp.
- **Escalation that runs off the end.** A policy whose last tier is one
  possibly-unreachable person can drop a page silently. Guarantee a final tier
  that always reaches someone.
- **No ack mechanism.** Without an explicit ack that stops escalation, either the
  page escalates when it shouldn't or nobody knows it's being handled.
- **Useless runbooks.** "Investigate the issue, check the logs" helps no one at
  3am. A runbook must be followable by a stranger: exact links, queries, commands,
  named causes and fixes, and escalation guidance.
- **Runbooks that drift.** A stale runbook confidently misleads. Keep runbooks as
  code, reviewed in PRs alongside the service, and linked from the alert.
- **Open-ended, un-commented silences.** A silence with no expiry and no reason is
  how a real alert vanishes. Always time-box, comment, and record the author.
- **No on-call review loop.** If nobody audits pages, alert fatigue accrues
  forever. Run a weekly review, treat non-actionable pages as bugs, track
  pages-per-shift.
- **Answering a page storm faster instead of fixing it.** 20 pages for one
  incident is a grouping/inhibition bug, not a test of stamina.

## Checkpoint quiz

Write down your answer to each question before expanding it — checking without attempting first is the single easiest way to fool yourself into thinking you've learned this.

<details>
<summary>Show questions</summary>

1. Name three properties of a *sustainable* on-call rotation and one property of
   one that generates attrition.
2. What does an escalation policy define, what's the ack action for, and what must
   its final tier guarantee?
3. Give three things a *good* runbook contains that a useless one ("investigate,
   check the logs") lacks.
4. What is runbook-as-code and what two problems does it solve?
5. What's the *formal* fix for alert fatigue (beyond track 12's per-alert
   tactics), and what single metric does it watch?
6. An on-call engineer gets 20 pages for one bad deploy. Is the fix to respond
   faster? What actually fixes it?
7. Why must a shift silence always have a comment, author, and expiry?

</details>

<details>
<summary>Show answers</summary>

1. Any three sustainable: a big enough pool (~6-8, so ~1 week in 6-8);
   primary+secondary; reasonable shift length (~a week); follow-the-sun to avoid
   routine 3am local pages; recognized comp/time-off. Attrition property: a tiny
   always-on pool (e.g. 2 people) run as heroics.
2. It defines what happens when a page *isn't acknowledged* — escalate to the next
   tier after N minutes. The **ack** lets a responder say "I've got it," stopping
   escalation. The final tier must guarantee the page always reaches *someone*
   (never run off the end into nobody).
3. Any three: what the alert means in user terms + impact; exact first diagnostic
   steps (dashboard link, specific PromQL/LogQL, `kubectl` commands); named common
   causes with *specific* fixes; when/how to escalate and who owns the service;
   SLO/budget context. The test: a stranger could follow it to resolution.
4. Storing runbooks in the service's Git repo, versioned and reviewed in PRs, and
   linked from the alert via `runbook_url`. It solves drift (runbooks reviewed
   when the service changes) and findability (one click from the page, not hunting
   a wiki at 3am).
5. A standing on-call review (e.g. weekly) that examines *every* page and marks it
   keep/tune/delete, turning non-actionable pages into tracked fixes. The metric
   it watches is **pages per shift** — too many is treated as a bug in the
   alerting.
6. No — responding faster doesn't fix it. It's a grouping/inhibition bug: set
   `group_by: [alertname, service]` so one incident is one page, add inhibition so
   the bigger alert suppresses redundant smaller ones, and file the underlying
   "why did 20 pods break" for the postmortem.
7. So muting is deliberate and temporary: the expiry stops a mute from becoming
   permanently-invisible, the comment records *why* it's safe to mute, and the
   author records *who* did it — otherwise a real alert silently disappears for
   the day it matters (track 12 module 06's "silence, don't delete").

</details>

## Next

[05-incident-response-process](../05-incident-response-process/README.md) — the
page reached a rested on-call engineer with a good runbook. Now formalize what
happens next when it's a *real incident*: severity levels, the incident commander
role, communication while the fire is burning, and how you declare and resolve.
