# Platform Engineering Concepts and the Paved Road

## Why this matters

You just spent 23 tracks learning to build a modern cloud platform *by hand* —
and that is precisely the problem platform engineering exists to solve. No
application developer at a real company can hold Terraform, GitOps, OPA, OTel,
SLOs, landing zones, and Entra workload identity in their head at once, and if
every team has to reassemble all of it from scratch for every new service, the
organization drowns in inconsistency and toil. A platform team's job is to take
everything you now know and turn it into a **paved road**: an opinionated,
self-service default path that other engineers travel without needing to
understand every layer underneath. This module is the mindset shift — from "I
can build this stack" to "I build the *product* that lets others build on this
stack without me."

## Concepts

### What a platform team actually does — and what it does not

A platform team builds and operates an **internal developer platform (IDP)**:
the tooling, templates, automation, and defaults that other engineering teams
use to ship and run software. Concretely, it owns the answer to questions like
"how does a new service get a CI/CD pipeline, a Kubernetes namespace, an SLO,
and a cost tag?" — and it makes that answer a *self-service action* rather than
a ticket to a human. Crucially, a platform team's customers are **other
engineers inside the same company**, not end users. That single fact reframes
everything: the deliverable is not a feature users click, it's a *capability
other teams build on*.

What it is *not*: it is not a rebranded ops team that runs everyone's
infrastructure for them (that's the "ticket ops" model platform engineering
replaces), and it is not a gatekeeper that reviews every change (that's the
bottleneck it removes). The distinction from a traditional DevOps or SRE team
is real and we return to it below. If you ever catch a "platform team" doing
manual provisioning on behalf of app teams for every request, they've built a
service desk, not a platform.

### The paved road / golden path

The central metaphor of the discipline is the **paved road** (also called the
**golden path**): the single, opinionated, well-supported way to do a common
thing, made so easy and so good that teams *choose* it over rolling their own.
A golden path for "create a new service" might scaffold the repo, wire up the
CI pipeline from [track 10](../../10-cicd-and-gitops/README.md), register a
GitOps Application, provision a namespace via the Terraform module from
[track 09](../../09-terraform-on-azure/README.md), attach vulnerability scanning
from [track 11](../../11-security-deep-dive/README.md), and pre-instrument
OpenTelemetry from [track 12](../../12-observability-deep-dive/README.md) — all
by default, without the developer assembling any of it.

The word "paved" matters: the road is not a *wall*. Teams with genuinely
unusual needs can still go off-road (build something bespoke), but they take on
the maintenance burden themselves and lose the platform's support. The paved
road wins adoption by being the *path of least resistance*, not by being
mandated. A golden path you have to force people onto is a sign the path isn't
actually good yet — which is a product problem, and we cover measuring it in
[module 07](../07-platform-adoption-and-measuring-success/README.md).

### Platform-as-a-product thinking

The defining mental model of modern platform engineering is that **the platform
is a product and its developers are your customers**. This is not a cute
framing — it changes how you work. Products have a roadmap, not a ticket queue.
Products have users you interview, not requesters you serve. Products have
adoption metrics, versioning, deprecation policies, changelogs, and docs.
Products can *fail in the market*: you can build a beautiful platform nobody
uses, which is the single most common failure mode in the field ("build it and
they won't come").

Treating the platform as a product means you do product discovery — you find
out what app teams actually struggle with before building — and you measure
success by *adoption and developer outcomes*, not by how much infrastructure you
shipped. It also means the platform has its own reliability obligations: if the
scaffolder or the CI templates are down, dozens of teams are blocked, so the
platform needs its own SLOs. That's a direct application of
[track 20](../../20-sre-practices/README.md)'s SRE discipline, turned inward,
and it's the whole of [module 05](../05-platform-observability-and-slos/README.md).

### Developer experience (DX) as a first-class metric

Because developers are the customers, **developer experience is the product's
core quality metric** — and platform engineering insists on *measuring* it
rather than intuiting it. Concrete DX signals include: time-to-first-deploy for
a brand-new engineer, lead time from commit to production (the DORA metric you
met around CI/CD in [track 10](../../10-cicd-and-gitops/README.md)), how many
steps and how much context a developer needs to create a new service, and how
often they have to file a ticket to a human versus self-serving. A platform that
technically works but makes developers fight it every day has failed as a
product even if every component is green.

DX is not the same as "make everything one click." Sometimes the best DX is a
sensible default that a developer can override; sometimes it's a clear error
message instead of a cryptic stack trace (a graceful-rejection UX, which you'll
build in [module 03](../03-self-service-infrastructure-provisioning/README.md)).
The skill is treating friction as a bug to be found and fixed, the same way
[track 20](../../20-sre-practices/README.md) treats toil — and
[module 07](../07-platform-adoption-and-measuring-success/README.md) turns DX
into numbers you track over time.

### How this differs from "just DevOps" or "just infra"

Platform engineering is often confused with DevOps, SRE, or infrastructure, and
the distinctions are worth getting precise because they shape what you build.
**DevOps** is a *culture and set of practices* (breaking down the dev/ops wall,
automating delivery) — it's a "how you work," not a team you can point at.
**SRE** ([track 20](../../20-sre-practices/README.md)) is a specific discipline
for *operating services reliably* with SLOs and error budgets. **Infrastructure
/ cloud engineering** is about *building the underlying resources* — the VNets,
clusters, and Terraform of tracks [05](../../05-azure-networking/README.md),
[07](../../07-aks/README.md), and [09](../../09-terraform-on-azure/README.md).

Platform engineering *sits on top of all three* and adds the missing piece: it
packages DevOps practices, SRE discipline, and infrastructure into a
**self-service product with an abstraction layer** so that app teams get the
benefit without the expertise. The tell is self-service and product thinking:
a DevOps engineer might build one team a great pipeline; a platform engineer
builds the *template* that lets a hundred teams build their own great pipeline
without asking. When people say platform engineering is "DevOps done at scale
with a product mindset," this is what they mean — and everything in tracks
02-23 becomes raw material for that product.

## Command reference

This is a concepts and vocabulary module — the "commands" here are the terms
and mental models you'll apply hands-on from module 01 onward, plus a few
`kubectl`/`gh` reads to inspect real platform primitives you already have.

| Term | What it means | Where you'll use it |
|---|---|---|
| IDP | Internal Developer Platform — the self-service product a platform team builds | whole track |
| Paved road / golden path | The opinionated, well-supported default way to do a common task | module 01 |
| Platform-as-a-product | Treating the platform as a product with customers, roadmap, and adoption metrics | modules 05, 07 |
| Developer experience (DX) | The measured quality of a developer's interaction with the platform | module 07 |
| Self-service | Developers provision/act without a human in the loop | module 03 |
| Golden-path template | A scaffolding template that emits a fully wired new service | modules 01, 02 |
| Software catalog | The registry of all services/components the platform knows about | module 02 |
| Cognitive load | The total mental burden a developer must carry to ship — platform engineering minimizes it | module 04 |

Reads that show you the raw material a golden path automates (nothing new to
install — these are things you already have from earlier tracks):

| Command | Flag / part | What it does |
|---|---|---|
| `kubectl get namespaces --show-labels` | `--show-labels` | Lists namespaces with labels — the tenancy unit a platform hands out (module 06) |
| `gh repo list <org> --json name,createdAt` | `--json name,createdAt` | Lists an org's repos as JSON — the inventory a software catalog would ingest |
| `az group list --query "[].tags" -o json` | `--query "[].tags"` | Extracts resource-group tags — the cost-attribution data (track 21) a platform enforces |
| `terraform output -json` | `-json` | Emits module outputs as JSON — how a self-service layer consumes track 09 modules (module 03) |

## Hands-on exercises

No new tooling to install — these build the mindset and vocabulary you'll apply
from module 01 on. Write your answers down; several are deliberately judgment
calls.

1. **Inventory your own reassembly toil.** From memory, list every distinct
   thing you had to set up by hand across tracks 09-20 to get *one* service to
   production (Terraform for a namespace, a CI pipeline, a GitOps Application,
   an image scan, OTel wiring, an SLO, a cost tag, an API gateway route...).
   Count them. That count is the cognitive load a golden path removes — write
   the number down; you'll compare against your module 01 golden-path design.

2. **Classify four teams as platform vs. not.** For each, decide whether it's a
   *platform* team or something else, and say why: (a) a team that runs
   everyone's Terraform applies from a ticket queue; (b) a team that publishes
   a scaffolder template every team uses to create services; (c) a team that
   operates the company's Prometheus and is paged for it; (d) a team that
   reviews and approves every production deploy. Only one is cleanly a platform
   team — identify it and name what the others actually are.

3. **Draw the paved road for "new service."** On paper, sketch the golden path
   for creating a brand-new service at a company. At each step, annotate which
   earlier track supplies that capability (scaffold → ?, CI → track 10, scan →
   track 11, and so on). You are drafting module 01's design in miniature.

4. **Find the off-ramp.** For the paved road you just drew, name one realistic
   team whose needs the default path *won't* fit (e.g. a team needing a stateful
   database from [track 14](../../14-databases-and-stateful-workloads/README.md),
   or an event-driven service from
   [track 15](../../15-messaging-and-event-driven-architecture/README.md)).
   Decide: do you widen the paved road to include them, or let them go off-road
   and own it themselves? Write the reasoning — this is a real platform product
   decision.

5. **Measure a DX baseline.** Estimate, honestly, how long it took *you* to go
   from "empty repo" to "service running in AKS with CI/CD, monitoring, and an
   SLO" across the earlier tracks — hours, days? That number is your
   before-platform time-to-first-deploy. Write down what a golden path would
   need to shave it to for you to call the platform a success.

6. **Inspect real catalog material.** Run
   `gh repo list <your-org-or-user> --json name,createdAt --limit 20` and
   `az group list --query "[].{name:name,tags:tags}" -o json`. Look at the
   output as a platform would: these are the services and the cost tags a
   software catalog (module 02) and cost-attribution system (module 06) would
   ingest. Note how much of it is *inconsistent* — that inconsistency is the
   problem the platform standardizes away.

7. **Write the elevator pitch.** In three sentences, explain to a skeptical
   engineering director why the company should fund a platform team, using the
   toil number from exercise 1 and the DX baseline from exercise 5 — not
   buzzwords. If you can't make the case with those numbers, you don't yet
   understand the value proposition.

8. **Diagnose the mindset failure: the platform nobody uses.** A platform team
   spent a year building a beautiful IDP; six months after launch, only 2 of 40
   teams use it and the rest still hand-roll their pipelines. The team insists
   the platform is technically excellent. Write down: (a) which core concept
   from this module they violated; (b) at least three concrete things they
   likely skipped (hint: product discovery, DX measurement, making the road the
   path of *least* resistance); and (c) what they should have done differently
   in month one. Then write the *inverse* failure — a team that mandates the
   platform with no off-ramp and no product thinking — and why that's equally
   broken. Both extremes fail; the discipline lives in building a product good
   enough that teams choose it.

## Independent challenge

Drawing on this module and everything you built in tracks 09-20, write a
one-page **"platform vision brief"** for a fictional company with ~15
engineering teams who today each hand-roll their own infrastructure, pipelines,
and monitoring (inconsistently). Without designing any specific template yet
(that's module 01), state in plain language: who the platform's *customers*
are and what they struggle with today; what the *first* golden path you'd build
would be and why that one first; how you'd know in six months whether the
platform succeeded (name 2-3 DX/adoption metrics, not "it works"); and one
explicit *non-goal* — something you would deliberately *not* build, to keep the
platform focused. The deliverable is the product reasoning, not a tech stack —
you're practicing platform-as-a-product thinking before you touch a scaffolder.

<details>
<summary>Stuck? One hint</summary>

Start from the developers' pain, not from the technology you want to use. The
best "first golden path" is almost always the thing *every* team does, does
often, and does badly today — which at most companies is "stand up a new
service and get it to production." Pick the metric that would prove you removed
that pain: time-to-first-deploy for a new service, or the number of teams who
adopted the path without being told to. And for the non-goal, remember that a
product that tries to serve every edge case on day one serves no one well —
naming what you *won't* build is how a platform stays a paved road instead of
sprawling into a swamp.

</details>

## Common mistakes & troubleshooting

- **Building a service desk and calling it a platform.** If app teams file
  tickets and humans do the provisioning, you have ticket ops, not self-service.
  The test is: can a developer get the thing *without* waiting on a person?
- **Building infrastructure instead of a product.** Shipping more Terraform,
  clusters, and dashboards is not the goal; a *product other teams adopt* is.
  Measure adoption, not output.
- **Skipping product discovery.** Building the golden path you find interesting
  instead of the one teams actually need is the fastest route to a platform
  nobody uses. Interview your customers first.
- **Mandating the road instead of paving it.** Forcing adoption hides the fact
  that the path isn't good enough to be chosen. A good paved road wins on merit.
- **Confusing platform engineering with DevOps or SRE.** They're complementary,
  not the same. Platform engineering *packages* DevOps practices and SRE
  discipline into a self-service product; if there's no self-service and no
  product thinking, it's just DevOps or ops with a new title.
- **Ignoring DX as unmeasurable.** DX absolutely can be measured
  (time-to-first-deploy, lead time, ticket volume, self-service rate). Treating
  it as a vibe is how friction accumulates unnoticed.
- **No off-ramp.** A paved road with no way to go off-road becomes a wall, and
  walls breed shadow platforms. Support the common case beautifully; let the
  rare case leave, and own its own maintenance.

## Checkpoint quiz

Write down your answer to each question before expanding it — checking without attempting first is the single easiest way to fool yourself into thinking you've learned this.

<details>
<summary>Show questions</summary>

1. Who are a platform team's *customers*, and why does that single fact reframe
   everything the team does?
2. Explain the "paved road" metaphor, including why it's a road and not a wall.
3. What does "platform-as-a-product" change in practice — name three things a
   product has that a ticket queue doesn't.
4. Name three concrete, measurable developer-experience signals.
5. In one sentence each, distinguish platform engineering from (a) DevOps, (b)
   SRE, and (c) infrastructure engineering.
6. A platform is technically excellent but only 2 of 40 teams use it. Name the
   most likely root cause and two things the team probably skipped.
7. Why does a platform need its *own* SLOs, and which earlier track supplies the
   discipline for that?

</details>

<details>
<summary>Show answers</summary>

1. Its customers are *other engineers inside the same company*. Because the
   deliverable is a capability other teams build on (not a feature end users
   click), success is measured by their adoption and outcomes, you interview
   them like customers, and you owe them reliability — it turns the work into
   product work.
2. The paved road is the single opinionated, well-supported default way to do a
   common task, made so good that teams choose it. It's a road not a wall
   because teams with genuinely unusual needs can still go off-road and build
   bespoke — they just own the maintenance and lose platform support. Forcing
   people onto it signals the road isn't good enough yet.
3. A roadmap (not a ticket queue), users you interview (not requesters you
   serve), and adoption/DX metrics, versioning, deprecation policy, changelogs,
   and the ability to *fail in the market* — any three.
4. Time-to-first-deploy for a new engineer/service; lead time from commit to
   production (a DORA metric); number of steps/tickets to create a new service
   (self-service rate) — among others.
5. (a) DevOps is a culture/set of practices, not a team. (b) SRE is the
   discipline of operating services reliably with SLOs/error budgets. (c)
   Infrastructure engineering builds the underlying resources. Platform
   engineering sits on all three and packages them into a self-service product
   with an abstraction layer.
6. Root cause: it wasn't treated as a product — no product discovery, so it
   solved a problem teams didn't feel, and/or it wasn't the path of least
   resistance. Likely skipped: interviewing customers first, measuring DX, and
   making adoption easier than the status quo (plus a migration story).
7. Because if the platform's shared services (scaffolder, CI templates, portal)
   are down, *every* team on it is blocked — so the platform is a critical
   service to its customers and needs measured reliability. The discipline comes
   from [track 20](../../20-sre-practices/README.md) (SRE), applied inward.

</details>

## Next

[01-designing-a-golden-path](../01-designing-a-golden-path/README.md) — you have
the mindset and the product framing; now design the artifact itself. You'll
specify exactly what a self-service golden path for a new service *contains*,
pulling the Terraform module (track 09), the CI/CD pipeline and GitOps
Application (track 10), the security defaults (track 11), and the observability
wiring (track 12) into one opinionated default that a developer gets for free.
