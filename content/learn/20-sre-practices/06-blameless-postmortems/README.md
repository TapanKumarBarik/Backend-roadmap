# Blameless Postmortems

## Why this matters

The incident from [module 05](../05-incident-response-process/README.md) is
resolved and you kept a timeline — but if you stop there, you'll have the same
outage again next month. The **postmortem** is how an incident becomes durable
organizational learning instead of a bad memory: it finds the *systemic* root
cause, and turns lessons into backlog work that actually ships. The one word that
decides whether the practice works is **blameless** — the moment a postmortem
becomes about *who* messed up, people stop being honest, and you lose the only
mechanism that makes the whole SRE loop from
[module 00](../00-sre-concepts-and-the-reliability-mindset/README.md) improve over
time. This is the "learn" station of that loop, and its output is the feedstock
for the on-call review (module 04) and the toil/reliability work (module 07).

## Concepts

### Blameless — attack the system, never the person

A **blameless postmortem** operates on a firm assumption: **everyone acted with
good intentions and the information they had at the time.** So when the postmortem
asks "why did this happen," the answer is never "because Priya ran the wrong
command" — it's "because the system *allowed* a single mistyped command to take
production down with no guardrail, no confirmation, and no staged rollout." The
human error is treated as a *symptom of a system weakness*, and the fix targets
the system, not the human. This is not about being nice; it's about **honesty as
an engineering input**. The instant people fear being named and blamed, they hide
what actually happened — they omit the risky shortcut they took, the alert they'd
silenced, the thing they didn't understand — and a postmortem built on a sanitized
story fixes the wrong problem. Blamelessness is the precondition for getting the
*true* account, which is the precondition for a fix that works. This is the same
psychological-safety principle behind the on-call review in module 04: you can
only improve what people will honestly tell you about.

### Why blame kills the practice — the mechanism, concretely

It's worth being precise about *how* blame destroys postmortems, because "be nice"
undersells it. When postmortems assign blame: (1) people **stop reporting**
near-misses and small incidents at all, so you lose early warning; (2) the
accounts you *do* get are **defensive and incomplete**, so root-cause analysis
works from fiction; (3) engineers become **risk-averse and slow** (the opposite of
the velocity the error budget was supposed to enable); and (4) the *actual*
systemic causes — missing guardrails, bad defaults, confusing tooling — go unfixed
because a person was named as "the cause" and the case was closed. Blame *feels*
like accountability but delivers the opposite: it optimizes for hiding problems
instead of fixing them. The blameless stance isn't leniency — the accountability
is real, it's just aimed at *the team fixing the system* rather than *punishing an
individual*.

### Finding the real root cause — five whys and its trap

To get from a symptom to a systemic cause, teams use structured techniques, the
best known being the **Five Whys**: repeatedly ask "why" (roughly five times),
each answer becoming the next question, until you reach a cause you can actually
*fix at the system level*. Example: *the site went down* → why? *a deploy shipped
a broken config* → why? *the config wasn't validated before deploy* → why? *there's
no validation step in the pipeline* → why? *nobody added one because there's no
standard for config validation* → **fix: add config validation to CI** (track 10).
Notice it walked from a person-shaped symptom to a *systemic, fixable* cause. Two
traps: (1) don't stop at the first human-shaped answer ("someone pushed bad
config" — keep going, that's a symptom); and (2) real incidents rarely have a
*single* root cause — they're usually a chain of contributing factors that lined
up (a bad config *and* no validation *and* an alert that fired too late *and* a
runbook that was wrong). Good postmortems capture the whole chain, not one
scapegoat cause; "five whys" is a prompt to dig, not a promise of exactly one
answer.

### Action items that actually become work — SMART and owned

A postmortem's whole *point* is the **action items** — the concrete changes that
stop this class of incident recurring. The universal failure is **vague,
un-owned, un-tracked action items** that read like good intentions and never
happen: "improve monitoring," "be more careful with deploys," "consider adding
validation." These die because nobody owns them, they're not on a backlog, and
"be more careful" isn't a task a human can do. A good action item is **specific,
assigned to a named owner, has a due date, and — critically — is filed as a real
ticket in the actual backlog** (the same JIRA/GitHub issues your team already
works from). "Improve monitoring" becomes "**@dana**: add a burn-rate alert for
the config-service SLO, ticket PLAT-4412, due next sprint." The discipline that
separates a postmortem that changes anything from one that's theater is: **every
action item is a tracked ticket with an owner, and someone follows up that they
actually get done** — un-actioned action items are how the same incident recurs.
This connects straight to the on-call review (module 04) and toil-reduction
(module 07), both of which are fed by postmortem action items.

### The postmortem document and the review meeting

A postmortem has a **standard document** so nothing important is skipped: a
**summary** (what happened, impact, duration in user terms), a **timeline** (from
the incident record you kept in module 05 — this is why you kept it), **impact**
(who/how many users, error budget spent, SLA implications), **root cause(s)** (the
systemic chain, via five-whys), **what went well / what went poorly / where we got
lucky** (the honest reflection — "we got lucky the on-call happened to know this
service" is a finding, not a comfort), and the **action items** (owned, tracked).
Then there's a **review meeting** where the team walks the document blamelessly,
sharpens the action items, and — importantly — *shares the learning* so other
teams benefit. Mature orgs treat good postmortems as valuable artifacts, sometimes
published internally, precisely because a well-written one prevents the same class
of incident across the whole organization, not just on the team that had it.

## Command reference

The postmortem is a document, but it's assembled from artifacts you produced in
earlier modules and it *emits* work into the tools you already use.

| Artifact / practice | What it is | Comes from / goes to |
|---|---|---|
| Incident timeline | Timestamped facts from the incident channel | kept in module 05 |
| Error-budget spent | How much budget this incident consumed | module 02 budget-remaining query |
| Five Whys | Iterative root-cause technique → systemic cause | this module |
| Contributing factors | The chain of causes that lined up (not one scapegoat) | this module |
| SMART action item | Specific, owned, dated, tracked ticket | filed to backlog (track 08/10) |
| Postmortem doc sections | summary / timeline / impact / root cause / what went well·poorly·lucky / action items | this module |
| Review meeting | Blameless walk-through + action-item sharpening + sharing | this module |

Quantifying incident impact for the postmortem's "impact" section — how much error
budget did it cost (reuse module 02):

```promql
# Budget consumed by this incident window (e.g. 14:00-14:40)
(
  1 - (
    sum(rate(http_requests_total{code!~"5..",job="demo"}[40m]))
      / sum(rate(http_requests_total{job="demo"}[40m]))
  )
) / (1 - 0.999)
```
- inner ratio — the SLI over the incident window (module 01).
- `1 - (SLI)` — the error fraction *during the incident*.
- `/ (1 - 0.999)` — expresses that spend as a multiple of the *budgeted* error
  fraction, i.e. how many "budget-windows" this 40-minute incident burned — a
  concrete impact number for the postmortem instead of "it felt bad."
- Put the *result* in the postmortem's impact section: "this incident spent ~X% of
  the monthly error budget," which directly informs the module 02 policy
  conversation (are we near a freeze?).

## Hands-on exercises

Use the incident timeline you saved in
[module 05](../05-incident-response-process/README.md) exercise 3/8 as the raw
material. Most of this module is writing — that's the skill; a postmortem you
critique but never write is one you can't write under pressure.

1. **(paper) Write a full postmortem from your incident.** Using your saved
   timeline, write a complete postmortem for the module 05 simulated incident:
   summary, timeline, impact (including error budget spent — compute it with the
   command-reference query), root cause(s) via five-whys, what went
   well/poorly/where you got lucky, and action items. This is the central
   deliverable of the module.

2. **(paper) Do the Five Whys, and reach a *systemic* cause.** For your incident,
   write out the five-whys chain explicitly. Check that your final answer is a
   *system* fix (a missing guardrail/validation/alert), not a human-shaped one
   ("should have been more careful"). If you stopped at a person, you didn't ask
   why enough times.

3. **(paper) Rewrite a blameful postmortem as blameless.** Take this line: *"The
   outage was caused by Sam deploying an untested config change on a Friday
   afternoon."* Rewrite the root cause blamelessly — attacking the system that
   *allowed* an untested config to reach production with no validation, no staged
   rollout, and no easy rollback. Note how the blameless version produces *fixable
   action items* while the blameful one produces only a scapegoat.

4. **Diagnose and fix: the postmortem with vague, non-actionable action items.**
   The signature diagnose-and-fix of this module. Here's a real-looking action-item
   list from a postmortem: *"1. Improve monitoring. 2. Be more careful with
   deploys. 3. Consider better testing. 4. Team to review the incident."*
   **Diagnose** why each will never happen: no owner, no due date, not a tracked
   ticket, and (for 2) not even a task a human can *do*. **Fix** by rewriting all
   four as SMART, owned, tracked items — e.g. "*@owner: add a fast-burn SLO alert
   for the config service (PLAT-XXXX), due this sprint*," "*@owner: add config
   schema validation to the deploy pipeline (PLAT-XXXX), due 2 weeks*," etc. — and
   state the follow-up mechanism that confirms they actually ship. Lesson: **an
   action item without an owner, a due date, and a backlog ticket is a wish;
   "improve monitoring" is how you guarantee the same incident recurs.** Vague
   action items are the most common way a well-run incident still teaches the org
   nothing.

5. **(paper) Separate root cause from contributing factors.** For your incident,
   list the *chain* of contributing factors that lined up (not one cause) — e.g.
   the bad change, the missing validation, the late alert, the wrong runbook. Write
   one action item per factor. This proves you understand incidents are rarely
   single-cause.

6. **(paper) Write the "what went well / where we got lucky" section honestly.**
   For your incident, name at least one thing that went *well* (worth keeping) and
   one place you got *lucky* (a latent risk that didn't bite this time but will).
   The "lucky" findings are often the most valuable action items — write the item
   that removes the luck.

7. **(paper) File the action items as real tickets.** Take your action items from
   exercise 1/4 and write them as actual backlog tickets (GitHub issues / JIRA
   format from track 08/10): title, owner, description, acceptance criteria, due
   sprint. Then describe the follow-up ritual (e.g. reviewed in the next on-call
   review, module 04) that ensures they close.

8. **(paper) Run a blameless review meeting (script it).** Write the agenda and
   ground rules for the postmortem review meeting: how you open it blamelessly, how
   you handle someone starting to blame a person, how you sharpen weak action
   items in the room, and how you share the learning beyond the team. This is the
   social process that makes the document matter.

## Independent challenge

Drawing on this module, the incident timeline you produced in
[module 05](../05-incident-response-process/README.md), the error budget from
[module 02](../02-error-budgets/README.md), and the CI/CD pipeline from
[track 10](../../10-cicd-and-gitops/README.md), write a *complete, genuinely
blameless postmortem* for a realistic incident and turn it into *tracked work* —
no template filled in for you. The postmortem must reach a systemic root cause via
an explicit five-whys chain (not a human scapegoat), quantify impact including
error-budget spent, honestly cover what went well and where you got lucky, and —
the hard part — produce action items that are every one of: specific, owned, dated,
filed as real backlog tickets, with a named follow-up mechanism, *and* where at
least one action item closes a systemic gap in your track 10 pipeline (e.g. adds
the validation whose absence let the bad change through). The deliverable is the
postmortem *plus the tickets it generated*, because a postmortem that ends at the
document is theater — the entire value is the loop closing into work that ships and
prevents recurrence.

<details>
<summary>Stuck? One hint</summary>

The blameless test for your root cause: read it and ask "does the fix change a
*person's behavior* or a *system*?" If the fix is "be more careful," keep asking
why until it's "add the guardrail that makes carefulness unnecessary" — that's a
CI validation step, a staged rollout, a confirmation prompt, a better default
(track 10/11). The SMART test for each action item: could someone who wasn't in the
incident pick up the ticket tomorrow and know exactly what "done" means? If not,
it's a wish — add the owner, the due date, the acceptance criteria, and the backlog
link. And compute the error-budget spend with the module 02 query so "impact" is a
number, not an adjective.

</details>

## Common mistakes & troubleshooting

- **Blame disguised as accountability.** Naming a person as "the cause" ends the
  investigation and teaches everyone to hide the truth next time. Attack the
  system that allowed the mistake; the accountability is the team fixing it.
- **Stopping the five-whys at a human.** "Someone pushed bad config" is a symptom.
  Keep asking why until you reach a systemic, fixable cause (missing validation, no
  guardrail).
- **Single-root-cause tunnel vision.** Real incidents are a chain of contributing
  factors lining up. Capture the whole chain and action each factor, not one
  scapegoat.
- **Vague action items.** "Improve monitoring," "be more careful" never happen —
  no owner, no ticket, and often not even a doable task. Make each SMART: specific,
  owned, dated, tracked.
- **Un-tracked action items.** Even a good action item dies if it's only in the
  doc. File it as a real backlog ticket and follow up (on-call review) that it
  closes.
- **Skipping "where we got lucky."** The luck you don't name is the latent risk
  that bites next time. Write the action item that removes the luck.
- **No timeline to work from.** If you didn't keep the incident record (module 05),
  the postmortem is reconstructed from memory — a fiction. Keep the timeline
  *during* the incident.
- **Postmortem as theater.** A beautiful document with no tickets and no follow-up
  changes nothing. The loop only closes when the action items ship.

## Checkpoint quiz

Write down your answer to each question before expanding it — checking without attempting first is the single easiest way to fool yourself into thinking you've learned this.

<details>
<summary>Show questions</summary>

1. What does "blameless" mean concretely, and why is it an *engineering* necessity
   rather than just kindness?
2. Give two distinct mechanisms by which blame *destroys* the postmortem practice.
3. What is the Five Whys, and what are its two main traps?
4. Why are most incidents *not* single-root-cause, and what should a postmortem
   capture instead?
5. What makes an action item that actually happens vs. one that dies? Give the
   properties.
6. Rewrite this action item so it will actually get done: "Improve deploy safety."
7. Why do you keep an incident timeline during the incident, and what postmortem
   section does it feed?
8. Why do mature orgs sometimes publish postmortems internally?

</details>

<details>
<summary>Show answers</summary>

1. Blameless means assuming everyone acted with good intent and the information
   they had, and treating any human error as a *symptom of a system weakness* —
   the fix targets the system, not the person. It's an engineering necessity
   because the moment people fear blame they hide what really happened, and a
   postmortem built on a sanitized story fixes the wrong problem.
2. Any two: people stop reporting near-misses/small incidents (lost early
   warning); accounts become defensive and incomplete (root-cause from fiction);
   engineers become risk-averse and slow (kills velocity); the real systemic
   causes go unfixed because a person was named and the case closed.
3. Iteratively asking "why" (~five times), each answer feeding the next, until you
   reach a systemic, fixable cause. Traps: (1) stopping at the first human-shaped
   answer (a symptom, keep digging); (2) assuming exactly one root cause when
   incidents are usually a chain of contributing factors.
4. Because they're typically a chain of factors that lined up — a bad change *and*
   missing validation *and* a late alert *and* a wrong runbook. The postmortem
   should capture the whole chain and action each factor, not pick one scapegoat
   cause.
5. It happens when it's **specific, assigned to a named owner, has a due date, and
   is filed as a real tracked backlog ticket** — with someone following up that it
   closes. It dies when it's vague, un-owned, un-tracked, or not even a doable task
   ("be more careful").
6. Something like: "*@owner: add a config-schema validation step to the deploy
   pipeline that blocks invalid configs (ticket PLAT-XXXX), acceptance = a known
   bad config fails CI, due next sprint.*" (Specific, owned, dated, tracked,
   testable.)
7. Because human memory of an incident is unreliable and defensive; a timestamped,
   fact-vs-speculation record captured live is the only accurate account. It feeds
   the postmortem's **timeline** section (and grounds the root-cause analysis).
8. Because a well-written blameless postmortem prevents the same *class* of
   incident across the whole org, not just the team that had it — it's a valuable
   learning artifact, so sharing it multiplies the value.

</details>

## Next

[07-capacity-planning-and-toil-reduction](../07-capacity-planning-and-toil-reduction/README.md)
— you can now detect, respond to, and learn from incidents. The last discipline is
staying *ahead* of them: forecasting capacity from track 12's historical metrics so
you don't fall over under growth, and systematically identifying and automating
away the toil (module 00) that consumes the time you'd rather spend on reliability.
