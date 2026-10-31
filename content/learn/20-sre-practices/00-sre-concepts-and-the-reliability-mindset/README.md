# SRE Concepts and the Reliability Mindset

## Why this matters

Every prior track taught you to *build and observe* systems; this track teaches
you to *decide how reliable they should be and prove they are*. Site Reliability
Engineering (SRE) is the discipline that turns "we hope it stays up" into a
measured, budgeted, engineering problem — and its whole toolkit sits directly on
the Prometheus/Grafana/Alertmanager stack you stood up in
[track 12](../../12-observability-deep-dive/README.md). Before you can define an
SLO or run an incident, you need the mindset: reliability is a *feature you spend
resources on*, not an absolute, and the tension between shipping fast and staying
up is something you manage deliberately rather than argue about.

## Concepts

### What SRE actually is — operations as a software problem

SRE is an approach, coined at Google, that treats operations as if it were a
software problem: instead of a separate ops team manually keeping services alive,
engineers use software engineering and measurement to run production. Its
premises are concrete and testable, not slogans. First, **100% reliability is the
wrong target** — the extra nines cost exponentially more and, past a point, your
users can't even tell (their own network drops more requests than your service
does). Second, **reliability is measurable**, so you can set a *target* and know
whether you're meeting it. Third, the gap between the target and 100% is a
*budget you get to spend*. Everything else in this track — SLIs, SLOs, error
budgets, incident response, postmortems — is machinery built on those three
ideas. The alerting judgment from
[track 12 module 06](../../12-observability-deep-dive/06-alerting-and-on-call-basics/README.md)
("alert on symptoms users feel, not causes") was the first hint of this mindset;
this track makes it formal.

### "Hope is not a strategy" — reliability as an engineered property

The unofficial SRE motto is **"hope is not a strategy."** It means: if the only
reason your service is up is that nothing has gone wrong yet, you don't have a
reliable service — you have a lucky one, and luck is not repeatable. The
alternative is to *engineer* reliability as a measured property: you decide what
"working" means for users (an SLI), set a target for it (an SLO), instrument it
so you can see it in real time (track 12's metrics), alert when you're burning
through your margin (module 03 of this track), and rehearse what you do when it
breaks (incident response, module 05). Each of those replaces a hope with a
mechanism. This is the same shift the security track made from "we think we're
secure" to threat-modeling and scanning — turning a vibe into evidence.

### Dev velocity vs. reliability — the tension SRE manages, not resolves

Developers are rewarded for **shipping features**; every change risks breaking
production. Traditional ops teams are rewarded for **stability**; the safest
change is no change. Left alone, these two pull in opposite directions and the
argument gets settled by whoever is more senior or louder in the room. SRE's key
insight is that this is a **quantifiable trade-off, not a values dispute**: if you
have a reliability target with margin to spare, you can afford to ship faster and
take more risk; if you've used up your margin, you slow down and stabilize. The
*error budget* (module 02) is the number that makes this decision mechanical
instead of political — it's the single most important idea in the whole track,
and the next two modules exist to build up to it. Notice this directly governs
the CI/CD velocity you built in
[track 10](../../10-cicd-and-gitops/README.md): the error budget is what tells
you whether today is a "deploy freely" day or a "freeze and fix" day.

### Toil vs. engineering work — and why SRE caps it

**Toil** is operational work that is *manual, repetitive, automatable, tactical,
devoid of lasting value, and scales linearly with the service* — restarting a
stuck pod by hand every night, manually copying a config to ten clusters,
re-running a failed job. It's not the same as "overhead" (email, meetings) and
it's not the same as "work I dislike"; it's specifically the toil that a machine
could do and that grows as your system grows. **Engineering work** is durable:
automation, tooling, and design changes that *reduce future toil* or add
capability. SRE's structural response is to **cap toil** — the well-known Google
figure is a 50% ceiling, meaning at least half an SRE's time must go to
engineering that reduces toil, or the team slowly drowns as the service scales.
Module 07 makes this a budget you track, the same way the error budget tracks
reliability.

### The SRE feedback loop — measure, budget, respond, learn

Put the pieces in order and SRE is a loop. You **measure** what users experience
(SLIs, module 01). You **set a target and derive a budget** (SLOs and error
budgets, modules 01-02). You **watch the budget burn** and page a human only when
the burn is fast enough to matter (burn-rate alerts, module 03). When something
breaks, you **respond** with a defined process — roles, severities,
communication (on-call and incident response, modules 04-05). Afterward you
**learn** without blame and turn lessons into real backlog work (postmortems,
module 06). And continuously you **reduce toil and plan capacity** so the system
doesn't degrade as it grows (module 07). This module is the mental model; every
following module is one station on the loop, and the capstone runs the entire
loop once end to end.

## Command reference

This is a concepts module — the "commands" here are the vocabulary and the
formulas you'll compute by hand before automating them in module 03. No cluster
work yet; you'll reconnect to the track 12 stack starting in module 01.

| Term / formula | What it means | Where it's used |
|---|---|---|
| SLI | Service Level *Indicator* — a measured ratio of good events to valid events | module 01 |
| SLO | Service Level *Objective* — your internal target for an SLI over a window | module 01 |
| SLA | Service Level *Agreement* — a contractual promise to a customer, with penalties | module 01 |
| Error budget | `1 − SLO` — the allowed fraction of failure over the window | module 02 |
| Toil | Manual, repetitive, automatable, no-lasting-value operational work | module 07 |
| Toil cap | The ceiling (often 50%) on how much of an SRE's time may be toil | module 07 |
| "Nines" | Shorthand for availability targets: 99% = "two nines", 99.9% = "three nines" | module 01 |
| Burn rate | How fast you're consuming the error budget vs. the steady-state rate | module 03 |

Availability "nines" translated to allowed downtime (memorize the shape, not the
digits — you'll re-derive these in module 02):

| SLO | "Nines" | Downtime / 30 days | Downtime / year |
|---|---|---|---|
| 99% | two | ~7.2 hours | ~3.65 days |
| 99.9% | three | ~43 minutes | ~8.76 hours |
| 99.95% | three-and-a-half | ~21.6 minutes | ~4.38 hours |
| 99.99% | four | ~4.3 minutes | ~52.6 minutes |

- Each extra nine cuts allowed downtime by ~10× — and typically costs far more
  than 10× the engineering effort. This exponential cost is *why* 100% is the
  wrong target.
- "Per 30 days" is the rolling window most SLOs actually use; "per year" is how
  SLAs are usually written. You'll compute both directly in module 02.

## Hands-on exercises

No cluster is required for this module — these build the mindset and vocabulary
you'll apply hands-on from module 01 onward. Write your answers down; several are
deliberately judgment calls with no single right number.

1. **Sort work into toil vs. engineering.** List ten things you (or a team you've
   seen) do to keep a service running. For each, mark it **toil** (manual,
   repetitive, automatable, no lasting value, scales with the service) or
   **engineering** (durable, reduces future toil). Then for your top three toil
   items, write one sentence on what automation would eliminate it. This is the
   raw material for module 07's toil budget.

2. **Translate nines to downtime, by hand.** Without looking at the table above,
   compute the allowed monthly downtime for 99%, 99.9%, and 99.99% over a 30-day
   window (`30 days × 24 × 60 = 43,200 minutes`; multiply by `1 − SLO`). Check
   against the reference table. Notice how *little* room 99.99% leaves — this is
   the intuition module 02 turns into an error budget.

3. **Find the "hope" in a system you know.** Pick a service (yours, a past job's,
   or the demo app from track 12). Write down every reason it's currently "up"
   that is really *hope* — "nobody's pushed a bad deploy lately," "the one person
   who understands it hasn't quit," "traffic hasn't spiked." For each, name the
   *mechanism* from this track's loop that would replace the hope.

4. **Argue both sides of the velocity/reliability tension.** Write a short case
   *for shipping a risky feature this week* and a short case *for freezing and
   stabilizing*, for the same service. Then write one sentence describing what
   objective number would let you decide between them without seniority winning.
   (You're describing the error budget before you've learned it — that's the
   point.)

5. **Map your service onto the SRE loop.** Draw the five-station loop from the
   last concept (measure → budget → respond → learn → reduce toil) and, for a
   real service, write what you currently have at each station and what's
   missing. Most teams have "measure" (track 12) and nothing else — that gap is
   what tracks 20-22 fill.

6. **Diagnose the mindset failure: the 100%-reliability request.** A product
   manager says "our SLO should be 100% — any downtime is unacceptable." Write
   the SRE rebuttal covering: (a) why 100% is both unachievable and *undesirable*
   as a target, (b) what the user's own connectivity means for the marginal nine,
   and (c) what you'd propose instead and how you'd pick the number. Then write
   the *inverse* failure — a team with **no** target at all — and why that's
   equally broken (you can't tell whether you're doing well, and every
   reliability decision becomes an argument). The skill is recognizing that
   *both* extremes are mindset failures; the discipline lives in the measured
   middle.

## Independent challenge

Drawing on this module and the alerting judgment from
[track 12 module 06](../../12-observability-deep-dive/06-alerting-and-on-call-basics/README.md),
write a one-page **"reliability charter"** for a single service you know well (the
track 12 demo app is fine). Without using any of the later modules' machinery yet,
state in plain language: what "working" means to a *user* of this service (not an
internal metric); roughly how reliable it realistically needs to be and *why that
number and not 100%*; what you would be willing to trade to ship features faster;
and which recurring operational chores on it are toil you'd automate first. The
deliverable is the *reasoning*, not the numbers — this is the informal version of
everything modules 01-07 formalize, and you'll return to it and sharpen it as you
learn each mechanism.

<details>
<summary>Stuck? One hint</summary>

Start from the user, not the system. Ask "what would make a user of this service
angry?" — that answer is your future SLI (module 01). Ask "how often could that
happen before they'd leave?" — that bounds your future SLO. Ask "which of my
2am pages was actually a symptom a user felt vs. a cause that hurt no one?"
(track 12 module 06) — the symptoms are what belongs in the charter, the causes
are noise. You're not expected to get numbers right; you're practicing pointing
the whole discipline at *what users experience*.

</details>

## Common mistakes & troubleshooting

- **Treating reliability as binary (up/down).** It's a *continuous, measured*
  property with a target. "Is it up?" is the wrong question; "are we meeting our
  SLO?" is the right one.
- **Chasing 100%.** The most expensive nines buy reliability users can't perceive
  and forbid you from ever shipping. 100% is a mindset failure, not a stretch
  goal.
- **Having no target at all.** The opposite failure: with no SLO, you can't tell
  a good week from a bad one, and every ship-vs-stabilize call becomes politics.
- **Confusing toil with "work I dislike" or "overhead."** Toil is specifically
  *automatable, repetitive, no-lasting-value* work that scales with the service.
  Meetings are overhead, not toil; a fascinating but manual nightly restart *is*
  toil.
- **Thinking SRE is a tool you install.** It's a discipline and a set of
  decisions. The Prometheus stack is the *substrate*; SRE is what you do with it.
- **Framing velocity vs. reliability as a values fight.** It's a quantifiable
  trade-off. If you're arguing it with opinions instead of an error budget, you
  haven't adopted the mindset yet.

## Checkpoint quiz

Write down your answer to each question before expanding it — checking without attempting first is the single easiest way to fool yourself into thinking you've learned this.

<details>
<summary>Show questions</summary>

1. In one sentence, what does SRE mean by "treating operations as a software
   problem"?
2. Why is 100% reliability the *wrong* target — give both the cost reason and the
   user-perception reason.
3. What does "hope is not a strategy" mean concretely, and give one example of
   replacing a hope with a mechanism.
4. Define toil precisely. Which of these is toil: (a) a weekly planning meeting,
   (b) manually restarting a wedged pod every night, (c) writing a script to
   auto-restart it?
5. Why does SRE frame dev velocity vs. reliability as a trade-off rather than a
   values disagreement, and what number makes the decision mechanical?
6. What is the toil cap, and what failure does it prevent as a service grows?

</details>

<details>
<summary>Show answers</summary>

1. Using software engineering and measurement — automation, SLOs, error budgets,
   instrumentation — to run production, instead of keeping services alive by
   manual human effort.
2. **Cost:** each extra nine costs exponentially more engineering effort for a
   ~10× smaller downtime reduction. **User perception:** past a point the user's
   own network/device loses more requests than your service does, so the extra
   nine buys reliability they literally cannot perceive.
3. It means a service that's up only because nothing has gone wrong yet is lucky,
   not reliable, and luck doesn't repeat. Replacing a hope with a mechanism:
   instead of *hoping* no bad deploy lands, you have a burn-rate alert + error
   budget policy that catches and gates it.
4. Toil is operational work that is manual, repetitive, automatable, tactical,
   of no lasting value, and scales linearly with the service. (b) is toil; (c) is
   the *engineering* that eliminates it; (a) is overhead, not toil.
5. Because with a reliability *target and margin* the choice becomes "do we have
   budget to spend on risk or not," which is a number, not an opinion. The
   **error budget** (`1 − SLO`) is that number.
6. A ceiling (often 50%) on how much of an SRE's time may be spent on toil,
   forcing the rest into engineering that *reduces* toil. It prevents the team
   from drowning as the service scales, since toil grows with the system while
   engineering work pays it back down.

</details>

## Next

[01-slis-and-slos](../01-slis-and-slos/README.md) — you have the mindset; now
make it measurable. You'll turn "what working means to a user" into a concrete
**SLI** (a good-events/valid-events ratio built on track 12's metrics) and set an
**SLO** target that's neither a meaningless 100% nor so loose it never bites.
