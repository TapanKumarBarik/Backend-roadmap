# Platform Observability and SLOs

## Why this matters

The moment other teams depend on your platform, the platform *is* production — and
if the scaffolder, the portal, or the provisioning pipeline is down or slow, you
don't block one team, you block *all* of them. Yet platform teams routinely
monitor the workloads they host meticulously while flying blind on their own
services. This module fixes that by turning the SRE discipline of
[track 20](../../20-sre-practices/README.md) inward: the platform gets its own
SLIs, SLOs, error budgets, and burn-rate alerts, with **your internal developers
as the customers** whose experience those SLOs protect. This is
platform-as-a-product (module 00) made operationally real — you don't just *say*
developers are customers, you get paged when you fail them.

## Concepts

### The platform is a production service to its customers

Every argument from [track 20](../../20-sre-practices/README.md) applies to the
platform, only the "users" are internal engineers. When a developer clicks
"create a new service" and the scaffolder times out, that's an outage — to them,
indistinguishable from any other production failure, and it stops their work. When
a self-service database request (module 03) hangs for twenty minutes, that's a
latency SLO breach. The platform's components — the portal, the scaffolder, the
provisioning pipeline, the CI templates, the golden-path controller — are
*services*, and services that many teams depend on are *critical* services.

This reframing is the operational half of platform-as-a-product. Module 00 said
developers are customers; this module says: then measure whether you're keeping
your promises to them, the same rigorous way track 20 taught you to measure
promises to end users. A platform team that doesn't know its own scaffolder's
success rate is exactly the "hope is not a strategy" failure from
[track 20 module 00](../../20-sre-practices/00-sre-concepts-and-the-reliability-mindset/README.md)
— it's up because nothing's broken *yet*.

### Platform SLIs — what "working" means for a developer

Defining an SLI ([track 20 module 01](../../20-sre-practices/01-slis-and-slos/README.md))
means picking a good-events/valid-events ratio that reflects what the *customer*
experiences. For the platform, the customer is a developer, so the SLIs are about
*their* interactions:

- **Scaffolder success rate** — fraction of "create new service" requests that
  succeed end to end (repo created, CI wired, catalog registered). A developer who
  gets a half-scaffolded service experienced a failure even if no component
  crashed.
- **Provisioning latency** — fraction of self-service infra requests (module 03)
  that complete within a target (e.g. 95% under 5 minutes). Slow self-service is a
  broken promise even when it eventually succeeds.
- **Portal availability** — fraction of portal page loads / catalog queries that
  succeed. If developers can't find or act on their services, the front door is
  down.
- **Golden-path deploy success** — fraction of deploys *through the platform's
  path* (track 10 GitOps) that reach `Healthy`. This measures the paved road's
  own reliability, not the app's.

Notice these are all built on the exact instrumentation you learned in
[track 12](../../12-observability-deep-dive/README.md) — the platform's own
services export metrics, get scraped by Prometheus, and traces flow through OTel,
just like any workload. The platform monitors itself with its own product.

### Platform SLOs and error budgets — with internal customers

Once you have SLIs, you set **SLOs** — targets over a window — and derive an
**error budget** ([track 20 module 02](../../20-sre-practices/02-error-budgets/README.md)),
exactly as before, but now the budget governs *platform* decisions. If the
scaffolder's SLO is 99.5% success and you've burned the month's budget, that's the
signal to *freeze risky platform changes and stabilize* — the same
velocity-vs-reliability tradeoff, now applied to the platform team's own shipping.
The error budget makes "should we ship this risky scaffolder refactor this week?"
a number, not an argument.

Setting the *right* target matters as much as before: 100% is still the wrong
target (module 00 of both this track and track 20), and an SLO so loose it never
bites doesn't constrain anything. But there's a platform-specific nuance: because
the platform is a *dependency* of every team on it, its SLO effectively caps the
reliability those teams can offer *their* users — a team can't run a 99.9% service
on a 99% platform without absorbing the difference. The platform's SLO is a
promise other teams build their own promises on, which is a strong argument for
setting it deliberately high on the critical paths (portal read, deploy pipeline)
and being honest about the rest.

### Burn-rate alerts — paging the platform team on customer pain

The alerting discipline from
[track 20 module 03](../../20-sre-practices/03-slo-dashboards-and-burn-rate-alerts/README.md)
transfers directly: multi-window, multi-burn-rate alerts on the platform's error
budget, routed through the exact Alertmanager tree from
[track 12 module 06](../../12-observability-deep-dive/06-alerting-and-on-call-basics/README.md).
A fast-burn alert on scaffolder success rate pages the platform on-call; a
slow-burn alert files a ticket. The rule from track 12 still governs: **alert on
symptoms the customer feels** (scaffolds failing, provisioning hanging), not on
causes (a pod restarted) that no developer noticed.

This is where "developers are our customers" stops being a slogan and becomes a
2am page. The platform team goes on-call *for its internal customers* — runs
incident response ([track 20 module 05](../../20-sre-practices/05-incident-response-process/README.md))
when the golden path is broken, writes blameless postmortems
([track 20 module 06](../../20-sre-practices/06-blameless-postmortems/README.md))
when a scaffolder change broke every new service for six hours, and tracks action
items to real backlog work. The whole SRE loop from track 20's capstone runs
again, this time with the platform itself as the service.

### Observability *of* the platform vs. *provided by* the platform

There's a subtle duality worth naming. The platform **provides** observability to
app teams (the golden path pre-wires OTel and a dashboard from
[track 12](../../12-observability-deep-dive/README.md) — module 01), *and* the
platform **has** observability of itself (this module). These are different
concerns with the same tooling. A common failure is doing the first and forgetting
the second: the platform lovingly instruments every hosted app while its own
scaffolder emits no metrics at all.

A related duality is *whose* SLO is whose. When a developer's service is slow, is
it the *app's* SLO breaching or the *platform's*? The platform is responsible for
the paved road (the deploy pipeline reached Healthy, the mesh routed the request,
the node had capacity — tracks 07/13/23) but *not* for the app team's business
logic. Drawing that line clearly — in dashboards, in on-call scope, in
postmortems — is essential, or every app incident becomes a platform page and the
platform team burns out owning problems that aren't theirs. The platform's SLIs
must measure *the platform's* contribution, not the aggregate of everything
running on it.

## Command reference

The tooling is exactly track 12's Prometheus/Grafana/Alertmanager and track 20's
SLO machinery, now pointed at the platform's own services. Nothing new to
install.

| Command | What it does | From |
|---|---|---|
| `curl -s localhost:8080/metrics` | Confirm the platform's own service exports metrics | track 12 |
| `promtool query instant <expr>` | Test an SLI expression against the platform's metrics | track 12/20 |
| `promtool check rules platform-slo.yaml` | Validate the platform's recording/alerting rules | track 20 |
| `amtool config routes test` | Verify a platform burn-rate alert routes to the right receiver | track 12 |
| `argocd app list -o json` | Source data for a golden-path deploy-success SLI | track 10 |

Multi-part examples (the platform's own SLI and alert, as PromQL — know each
part):

A scaffolder success-rate SLI as a recording rule (a good/valid ratio, track 20):

```yaml
# platform-slo.yaml — the platform's OWN SLO, monitored with its OWN product
groups:
- name: platform-scaffolder-slo
  rules:
  - record: platform:scaffolder_success:ratio_rate5m
    # good = completed scaffolds; valid = all scaffold attempts (track 20 module 01)
    expr: |
      sum(rate(scaffolder_runs_total{status="success"}[5m]))
      /
      sum(rate(scaffolder_runs_total[5m]))
```

A fast-burn alert on that SLO (multi-burn-rate, track 20 module 03):

```yaml
  - alert: ScaffolderErrorBudgetFastBurn
    # firing means new services are failing to scaffold NOW — a customer-felt symptom
    expr: |
      (1 - platform:scaffolder_success:ratio_rate5m) > (14.4 * 0.005)
      and
      (1 - platform:scaffolder_success:ratio_rate1h) > (14.4 * 0.005)
    for: 2m
    labels: { severity: critical }          # pages the platform on-call
    annotations:
      summary: "Scaffolder burning error budget fast — new services are failing"
      runbook_url: "https://backstage.acme.io/docs/platform/runbooks/scaffolder"
```

| Part | Meaning |
|---|---|
| `14.4 * 0.005` | 14.4× burn against a 0.5% budget (99.5% SLO) — the fast-burn threshold from track 20 module 03 |
| two-window `and` | requires both the 5m *and* 1h windows to breach, so a brief blip doesn't page (track 20) |
| `severity: critical` | routes to the pager via track 12's Alertmanager tree; `warning` would file a ticket |
| `runbook_url` | links the runbook (track 20 module 04) — a platform alert needs a runbook like any other |

## Hands-on exercises

You need the track 12 Prometheus/Grafana/Alertmanager stack on your kind cluster
and a platform service to instrument (the Backstage from module 02, a scaffolder
script, or any stand-in that emits metrics).

1. **Instrument a platform service.** Take your scaffolder (or a stand-in script)
   and make it emit a `scaffolder_runs_total{status=...}` counter — success and
   failure. Confirm `curl localhost:<port>/metrics` shows it and Prometheus
   scrapes it. The platform now monitors itself with track 12's own tooling.

2. **Define a platform SLI.** Write the scaffolder success-rate SLI as a
   good/valid ratio (track 20 module 01) and test it with `promtool query
   instant`. Justify why "success" is measured *end to end* (repo + CI + catalog),
   not "the process didn't crash" — a half-scaffold is a customer-felt failure.

3. **Set a platform SLO and derive its budget.** Choose an SLO target for the
   scaffolder you can *justify from measured performance* (track 20 module 02),
   and compute the error budget in a concrete unit (failed scaffolds per month).
   Write one sentence on what "spending" this budget looks like (a bad scaffolder
   deploy that broke creates for an afternoon).

4. **Record the SLI + budget as rules.** Load `platform-slo.yaml` recording rules
   into your Prometheus (correct `release` label, track 20 module 03) and build a
   Grafana panel showing scaffolder SLI-vs-target and budget remaining. The
   platform now has an SLO dashboard for *itself*.

5. **Add multi-burn-rate alerts and force one to fire.** Add the fast-burn
   (`critical`) and slow-burn (`warning`) alerts. Then *break the scaffolder on
   purpose* (make it fail a fraction of runs) and watch the fast-burn go
   `Inactive → Pending → Firing → routed` through your Alertmanager tree
   (track 12 module 06), while the slow-burn stays silent. An alert you've never
   seen fire is a guess (track 20 module 03).

6. **Write a platform runbook.** For the scaffolder alert, write a runbook
   (track 20 module 04) a *stranger* to the platform could follow: what the alert
   means to a developer, dashboard link, the exact queries/commands to diagnose
   (is it GitHub API rate limits? the catalog registration step? the template
   render?), likely causes with fixes, and escalation. Link it from the alert's
   `runbook_url` and store it in TechDocs (module 02).

7. **Draw the ownership line.** For a scenario where a developer's *service* is
   slow, write down which parts are the *platform's* SLO (deploy reached Healthy,
   mesh routed, node capacity — tracks 07/13/23) and which are the *app team's*
   (their business logic, their query). Then design the dashboard/on-call scope
   so an app-logic problem does *not* page the platform team. This line is what
   keeps the platform from owning everyone's incidents.

8. **Diagnose-and-fix: the platform that monitors everyone but itself.** You
   inherit a platform whose golden path beautifully instruments every hosted app
   (OTel, dashboards, SLOs — module 01) but whose *own* scaffolder and portal emit
   zero metrics; the team finds out the scaffolder is down only when developers
   complain in Slack. Reproduce the gap (a platform service with no metrics and no
   SLO). Then fix it: instrument the service, define its SLI/SLO, add a burn-rate
   alert that would have paged *before* the Slack complaints, and — importantly —
   write down *why* the team fell into this (they treated observability as
   something the platform *provides* to others, not something it *has* of itself).
   The lesson is the duality: providing observability and having observability are
   different jobs, and skipping the second is how a platform blindsides its own
   customers.

## Independent challenge

Drawing on this module and tracks 12 and 20 (and the SRE capstone,
[20-sre-practices/08-capstone-project](../../20-sre-practices/08-capstone-project/README.md)),
run the **complete SRE loop on one platform service of your choice** (the
scaffolder, the provisioning pipeline, or the portal): define a customer-centric
SLI and a justified SLO with an error budget, build multi-burn-rate alerts routed
through Alertmanager, *force a realistic incident* (break the service so the
fast-burn fires), run it as a real incident with a timeline and a mitigation
(roll back the bad platform change first, understand later), and write a blameless
postmortem whose action items close the systemic gap — with at least one action
item being a guardrail in the platform's *own* CI/golden-path (tracks 10/11) so
the same platform change can't break every new service again. The deliverable is
the loop turning once, with the *platform itself* as the service and internal
developers as the customers — proving you can operate the platform to the same
standard you'd hold any production service.

<details>
<summary>Stuck? One hint</summary>

This is track 20's capstone re-run with one swap: the "service" is now a piece of
the platform, and the "users" are your fellow engineers. Everything else is
identical, so lean on what you already did there — the hardest platform-specific
judgment is *choosing the SLI so it measures the developer's experience, not your
process health*. "The scaffolder process had 99.9% uptime" is a vanity metric if
30% of scaffolds silently produced a half-wired repo; the real SLI is
end-to-end success from the developer's point of view. And for the postmortem's
action item, remember the highest-leverage fix for a platform is almost always a
guardrail in the golden path or its CI (tracks 10/11), because that one fix
protects every future service the path produces — the same leverage that makes
the golden path powerful makes a bug in it catastrophic.

</details>

## Common mistakes & troubleshooting

- **Monitoring hosted apps but not the platform.** The classic gap: the golden
  path instruments every app while the scaffolder/portal emit nothing. Providing
  observability (module 01) and *having* observability (this module) are different
  jobs; do both.
- **Vanity SLIs (process health, not customer experience).** "The scaffolder was
  up 99.9%" while a third of scaffolds produce broken repos is measuring the wrong
  thing. Measure end-to-end success from the developer's point of view (track 20).
- **Owning everyone's incidents.** If every app-logic problem pages the platform
  team, the ownership line is blurred and the team burns out. The platform's SLIs
  measure the platform's contribution (deploy, routing, capacity), not the apps'
  business logic.
- **An SLO with no teeth (or 100%).** A platform SLO so loose it never bites
  constrains nothing; 100% is unachievable and forbids ever shipping. Set it from
  measured performance so the error budget can actually gate risky platform
  changes (track 20 module 02).
- **Alerts on causes, not symptoms.** Paging on "a scaffolder pod restarted" that
  no developer noticed is noise; page on "scaffolds are failing" that they feel
  (track 12 module 06).
- **No runbook for platform alerts.** A platform page with no runbook is as bad as
  any other; platform on-call needs runbooks (track 20 module 04), ideally in
  TechDocs (module 02) so they're findable.
- **Forgetting the platform SLO caps its customers' SLOs.** A team can't run a
  99.9% service on a 99% platform. The platform's reliability is a floor others
  build on — set the critical-path SLOs deliberately.

## Checkpoint quiz

Write down your answer to each question before expanding it — checking without attempting first is the single easiest way to fool yourself into thinking you've learned this.

<details>
<summary>Show questions</summary>

1. Why is the platform itself a "production service," and who are its users?
2. Give two examples of platform SLIs and explain why each measures the
   *developer's* experience rather than process health.
3. How does the error budget govern the *platform team's* own decisions?
4. Why does the platform's SLO effectively cap the SLOs its customer teams can
   offer *their* users?
5. Explain the duality between observability the platform *provides* and
   observability the platform *has* — and the common failure it produces.
6. When a developer's hosted service is slow, how do you decide whether it's the
   platform's SLO breaching or the app team's — and why does the line matter?
7. Which parts of the track 20 SRE loop apply to the platform, and what's the one
   thing that changes?

</details>

<details>
<summary>Show answers</summary>

1. Because many teams depend on it: when the scaffolder, portal, or provisioning
   pipeline is down or slow, it blocks *all* of them, indistinguishable from any
   other outage. Its users are the internal engineers (platform-as-a-product made
   operational).
2. E.g. scaffolder end-to-end success rate and self-service provisioning latency.
   Each measures what the developer *experiences* — a half-scaffolded repo or a
   20-minute hang is a failure they feel — rather than whether a process stayed
   up, which they may never notice.
3. It gates the platform team's own shipping: if the platform's error budget is
   spent, that's the signal to freeze risky platform changes and stabilize — the
   same velocity-vs-reliability tradeoff (track 20 module 02) turned inward.
4. Because the platform is a dependency of every team on it, so its reliability is
   a ceiling: a team can't run a 99.9% service on a 99% platform without absorbing
   the difference. The platform's SLO is a floor others build their promises on.
5. The platform *provides* observability to app teams (the golden path pre-wires
   OTel/dashboards — module 01) *and* must *have* observability of itself (its own
   SLIs/SLOs). Same tooling, different jobs. The common failure is doing the first
   and forgetting the second — instrumenting every hosted app while the scaffolder
   emits nothing.
6. Attribute to the platform only what the platform is responsible for — deploy
   reached Healthy, mesh routing, node capacity (tracks 07/13/23) — and to the app
   team their business logic/queries. The line matters because without it every
   app incident pages the platform team, which owns problems that aren't theirs
   and burns out.
7. All of it — SLIs/SLOs, error budgets, burn-rate alerts, on-call, incident
   response, blameless postmortems, action items. The one thing that changes: the
   "service" is a piece of the platform and the "users" are internal engineers.

</details>

## Cumulative review

Closed book. Cover the answers and write each out before checking. These mix the
whole track so far — concepts (00), golden paths (01), portals (02), self-service
infra (03), abstractions (04), and platform SLOs (05) — and the earlier tracks
they compose.

1. A director asks "isn't this just DevOps with extra steps?" Give the crisp
   distinction and name what platform engineering adds on top of DevOps, SRE, and
   infra. (module 00)
2. Walk the full path of a developer clicking "Create → New HTTP Service": name
   each artifact produced and the track it comes from. (modules 01-02, tracks
   02/09/10/11/12/20/21)
3. A self-service request for a public-endpoint database is rejected with a raw
   Azure Policy JSON error. Diagnose the DX failure and rewrite the rejection as
   it *should* be. (module 03)
4. Your `service.yaml` abstraction has a field for `nodeAffinity`. What's wrong
   with that, and what's the principle it violates? (module 04)
5. Distinguish "too little" from "too much" abstraction, give the tell for each,
   and explain why the law of leaky abstractions makes over-abstraction hurt.
   (module 04)
6. Write, in PromQL, a scaffolder success-rate SLI as a good/valid ratio, and say
   why "the process was up 99.9%" is the wrong SLI. (module 05, track 20)
7. Why does the platform need its *own* SLOs, and how does its SLO relate to the
   SLOs its customer teams can offer their users? (module 05, track 20)
8. A guardrail (track 17) blocks a legitimate need. Describe the exception path
   that keeps the guardrail meaningful without becoming a wall — or a loophole.
   (module 03, track 17)
9. Your golden-path template improves from v1 to v2, and your `service.yaml`
   abstraction goes from v1 to v2. Explain the *shared* problem across both and
   the options to solve it. (modules 01, 04)
10. Draw the ownership line: a hosted app is slow — which parts are the platform's
    responsibility (and SLO) and which are the app team's, and why does drawing
    this line matter? (module 05, tracks 07/13/23)

<details>
<summary>Show answers</summary>

1. DevOps is a culture/practice, SRE a reliability discipline, infra the
   underlying resources; platform engineering sits on all three and adds a
   *self-service product with an abstraction layer* so app teams get the benefit
   without the expertise. The tell is self-service + product thinking.
2. Fill form → `fetch:template` renders skeleton (Dockerfile track 02, scan config
   track 11, OTel track 12) → `publish:github` creates repo with CI + GitOps
   Application (track 10) → Terraform provisions namespace + managed identity
   (tracks 09/16) → `catalog:register` adds it to the catalog (module 02); starter
   SLO (track 20) and cost tags (track 21) applied by default.
3. DX failure: a raw policy error tells the developer nothing actionable and pushes
   them to route around the platform. Rewrite: "Databases must use private
   endpoints (policy SEC-014) — public endpoints are a data-exfiltration risk.
   Choose the 'private' networking option, or request a scoped exception in
   #platform."
4. `nodeAffinity` is *mechanism*, not intent — a Kubernetes knob the developer
   shouldn't have to understand. It violates "expose intent, hide mechanism"; it
   belongs in platform defaults (or an `overrides:` escape hatch), not the primary
   interface.
5. Too little = a re-skin with as many concepts as the tool it wraps (tell:
   concept count ≈ the underlying tool). Too much = an undebuggable black box that
   can't express real variation (tell: failures surface as deep errors developers
   can't act on). The law of leaky abstractions means all non-trivial abstractions
   leak, so the more you hide, the more painful the inevitable leak.
6. `sum(rate(scaffolder_runs_total{status="success"}[5m])) /
   sum(rate(scaffolder_runs_total[5m]))`. "Process up 99.9%" is wrong because a
   scaffold can complete-but-produce-a-broken-repo; the SLI must measure
   end-to-end success as the *developer* experiences it, not process liveness.
7. Because it's a critical dependency of every team on it, so it needs measured
   reliability (track 20 turned inward). Its SLO is a ceiling on what its customer
   teams can promise their users — a 99.9% app can't run on a 99% platform.
8. A scoped, time-boxed exception: the developer requests it, a real owner
   (track 16) approves, it's recorded as an Azure Policy exemption (track 17)
   limited in scope and duration, and it's audited so exceptions don't silently
   become the norm. Without one the guardrail is a wall; with a loose one it's no
   guardrail at all.
9. Shared problem: both are versioned contracts, and improving the *template/spec*
   doesn't retroactively update artifacts already produced from the old version
   (services scaffolded from v1; `service.yaml`s written against v1). Options:
   rescaffold/rewrite, backport manually, run an automated update bot, or support
   both versions with a deprecation timeline (track 19-style).
10. Platform owns: deploy reached Healthy (track 10), mesh routing/mTLS (track 13),
    node capacity/autoscaling (tracks 07/23) — the paved road. App team owns:
    business logic, their queries, their code. The line matters because without it
    every app incident pages the platform team, blurring accountability and
    burning the team out on problems that aren't theirs.

</details>

## Next

[06-multi-tenancy-and-platform-security](../06-multi-tenancy-and-platform-security/README.md)
— your platform is reliable; now make it *safely shared*. Multiple teams run on
the same AKS/Container Apps infrastructure, so you'll design tenant isolation
(namespaces, quotas, network policy), apply the security patterns of tracks 11,
13, and 16 at the platform level so one tenant can't reach another's data or
starve their resources, and attribute cost back to each tenant with the tagging
discipline from [track 21](../../21-cost-management-and-finops/README.md).
