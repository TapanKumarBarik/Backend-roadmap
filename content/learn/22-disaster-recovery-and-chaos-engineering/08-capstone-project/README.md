# Capstone Project

## Why this matters

This is where the whole track converges from paper into proof. Across modules
00-07 you learned, in isolation, to set RTO/RPO targets, build a second region,
write and execute a failover drill, back up a platform, run disciplined chaos
experiments, hold a game day, and prioritize resilience gaps. The capstone asks
the only question that ultimately matters: for a *specific real system*, can you
put it all together into a DR plan with honest targets, provision a
multi-region failover in Terraform, **actually fail over** and record what
happened, **actually break the system** with chaos and observe it, and hand
someone a prioritized list of what to fix? There is no new concept and no quiz
here — the deliverable is evidence that your system recovers, not a claim that
it should.

Treat this as a project, not a checklist of isolated exercises. The pieces
depend on each other in the order a real resilience engagement would run: you
can't drill a failover you haven't built, and you can't prioritize gaps you
haven't discovered by breaking things.

## The project

Take a real system — ideally the AKS + ACR + database environment from your
track 07 or track 14 capstone, or the multi-module Terraform environment from
track 09's capstone — and produce a complete, *executed* disaster-recovery and
resilience engagement for it. Five deliverables, each building on the last:

1. **A written DR plan with real RTO/RPO targets.** For your specific system,
   decomposed per component/tier, with defensible RTO and RPO numbers
   reconciled against a plausible SLO (track 20) and a chosen position on the
   strategy spectrum (backup/restore → pilot light → warm standby →
   active-active) for each — including an explicit, cost-justified reason for
   *not* choosing a more expensive strategy where you didn't (module 00, track
   21). This is the document everything else is measured against.

2. **A multi-region, Terraform-provisioned failover setup.** Using the
   reusable modules from track 09, stand the system up in a **second Azure
   region** with a global traffic router (Traffic Manager or Front Door),
   geo-redundant data, and a geo-replicated ACR — the second region being a
   second module invocation, not new code (module 01). The standby's size must
   match the strategy you chose in deliverable 1 (don't run active-active if
   you specified warm standby).

3. **An actually-executed failover drill with results recorded.** Write the
   regional-outage runbook (module 02), then *run it* against your two regions:
   trigger the failover, cut traffic over, promote data, verify real user
   journeys, and record a drill report with the achieved RTO decomposed by
   phase and the achieved RPO — plus every runbook defect you found and fixed.
   The recorded results, including the DNS-TTL behaviour you observed, are the
   deliverable — not "it worked."

4. **At least two real chaos experiments run against the system.** Using
   Chaos Studio and/or Chaos Mesh (module 05), run at least two *different*
   fault types (e.g. a pod failure and a dependency network fault) as designed
   experiments — each with a steady-state SLI, a falsifiable hypothesis in SLO
   terms, a bounded blast radius, and a rehearsed abort — and capture
   observations from your **track-12 observability stack** (Grafana
   steady-state-vs-during, and a distributed trace showing where a fault
   propagated). Record whether each hypothesis held.

5. **A prioritized resilience gap-analysis document.** From the drill and the
   chaos findings plus a structured audit (module 07), produce a *ranked* list
   of the system's resilience gaps — timeouts, retries, circuit breakers (track
   13), health probes, graceful degradation, SPOFs — each scored by
   likelihood×impact against your SLOs, with a defensible one-line
   justification for the top items and a note on which you'd deliberately not
   fix and why (track 21). Fixing at least the top gap and *verifying* it by
   re-running the experiment that exposed it is the strongest version.

Then **prove** it and **tear it down** — see the acceptance checklist.

## Acceptance checklist

Work top to bottom; each item depends on the previous ones actually working,
not merely existing.

- [ ] **DR plan exists and is specific.** A document naming your real system's
      components, each with a tier, a defensible RTO and RPO, a reconciled SLO,
      and a chosen strategy — including at least one explicit, cost-justified
      "we did *not* go active-active here because…" (module 00, track 21).
- [ ] **Second region is real and Terraform-provisioned.** `terraform state
      list` shows the system's resources in a second region created by
      re-invoking your track-09 modules with a different `location` and a
      **non-overlapping** address space — not hand-built, not copy-pasted HCL.
- [ ] **A global router fronts both regions.** Traffic Manager or Front Door
      resolves/routes to the primary while healthy, with a health probe hitting
      a *real* health endpoint; `dig`/`curl` confirms steady-state routing to
      the primary.
- [ ] **The standby's size matches the chosen strategy.** If you specified
      warm standby, the secondary runs small; if pilot light, it's scaled to
      near-zero until needed — not a full active-active clone you didn't call
      for (module 01, track 21).
- [ ] **A failover drill was executed and recorded.** A `dr-runbook.md` plus a
      drill report showing achieved RTO *decomposed by phase* (detect →
      declare → promote → cutover → scale-up → verify), achieved RPO, the
      observed DNS-TTL/client-cutover behaviour, and ≥2 runbook defects found
      and fixed. Verification was a real user journey, not "pods Running."
- [ ] **Data promotion was part of the drill.** The drill promoted a
      geo-replicated data store and you measured the *real* RPO (the
      replication gap), not just shifted traffic (module 02, track 14).
- [ ] **≥2 chaos experiments were designed, run, and observed.** Two different
      fault types, each with a written design (steady state, falsifiable
      hypothesis in SLO terms, bounded blast radius, rehearsed abort),
      executed via Chaos Studio/Mesh, with track-12 evidence (Grafana
      before/during, a trace) and a recorded held/not-held result.
- [ ] **At least one chaos experiment disproved a hypothesis (or you can
      explain why none did).** The value is the gap found; if everything held,
      show the experiments were non-trivial (a real dependency fault, a
      node/zone loss), not just a single-replica kill of an over-provisioned
      service.
- [ ] **A prioritized gap-analysis document exists.** A ranked list scored by
      likelihood×impact against your SLOs, top items justified, at least one
      SPOF identified, and at least one gap explicitly deprioritized with a
      cost/impact reason (module 07, track 21).
- [ ] **At least one top gap was fixed and verified.** You remediated it (a
      timeout + circuit breaker, a zone spread, a replicated dependency) and
      *re-ran the chaos experiment that exposed it*, with before/after
      dashboards showing the system now degrades gracefully.
- [ ] **Terraform state itself is protected.** The remote state backend has
      versioning + soft-delete + geo-redundancy, so "redeploy from Terraform"
      is genuinely a recovery mechanism (module 03).
- [ ] **You can explain every RTO/RPO number and every strategy choice** in
      terms of the failure domain it addresses and the SLO/cost that justifies
      it. If you can't defend a number, that's a signal to redo the analysis,
      not to leave a plausible-looking figure in the plan.
- [ ] **Everything billable is torn down** and confirmed: the second region,
      the router, any geo-replica, vaults/recovery points, and chaos-enabled
      targets are gone (`az aks list`, `az group list`, `az backup vault list`
      all clean).

## Hints

- **Write the DR plan first, and let it constrain the build.** The plan's
  strategy choice per component decides how big the standby is, which router
  you need, and which data-replication option — build to the plan, don't build
  first and rationalize. If the plan says warm standby, you are *not* allowed
  to stand up active-active "because it's easier to test."
- **Reuse, don't rewrite, the second region.** The whole point of track 09 was
  that "add a DR region" is a second module block with a different `location`
  and CIDR. If you find yourself hand-writing region-two resources, stop and
  parameterize — that reuse *is* also your "redeploy from Terraform" recovery
  mechanism (module 03).
- **Measure the human and DNS time, not just the machine time.** Your achieved
  RTO includes detection, declaration, and the DNS-TTL cutover tail — the parts
  that blow paper RTOs. Time them separately; a fast failover behind a slow
  detection or a long TTL still breaches the target (modules 02, 06).
- **Design chaos experiments to *possibly fail*.** An experiment you're sure
  will pass teaches nothing. Point a network fault at a real single dependency,
  or drain a node your "replicas" secretly share — the disproved hypothesis is
  the deliverable (modules 04, 05).
- **Prioritize ruthlessly; don't fix everything.** The gap analysis's value is
  the ranked top few tied to real SLOs, plus the honesty to leave low-impact
  gaps unfixed for cost reasons (module 07, track 21). A flat list of 50
  findings is a non-deliverable.
- **Verify the fix with the same experiment that found the gap.** "We added a
  timeout" is a claim; "the latency experiment that used to cascade now sheds
  load gracefully, here are the before/after dashboards" is proof.
- **The second region is the expensive part — scope and schedule it.** Stand
  it up, run the drill and the chaos in one sitting, and destroy it the same
  day. Don't let a warm standby or a duplicated cluster idle across days while
  you write up notes (track 21).

## Final cleanup

This track ran real duplicated infrastructure — the most expensive teardown in
the curriculum so far. Clean up deliberately.

1. Confirm what exists: `terraform state list`, `az group list -o table`, `az
   aks list -o table`, `az backup vault list -o table`.
2. `terraform destroy` the whole multi-region environment — review the destroy
   plan, confirm it includes *both* regions' clusters and the router, then
   `yes`.
3. Delete any resources Terraform doesn't manage: the Recovery Services/Backup
   Vault and its recovery points, disk snapshots from Velero/volume snapshots,
   the ACR geo-replica if you added one, and — separately — the state-backend
   storage group if you stood one up for this.
4. Disable any Chaos Studio targets so nothing remains chaos-enabled, and
   `kubectl delete` any lingering chaos objects if a cluster survived.
5. Final sweep: `az aks list -o table` (empty), `az group list -o table`
   (nothing from this project), `az backup vault list -o table` (empty), `az
   snapshot list -o table` (no orphans). Empty results across all of these are
   your signal you're no longer being billed for any of it.

## Before you move on

Once everything is torn down, don't consider this finished at the moment the
resources are gone. Wait a few days, then — with none of the earlier modules
open, no runbook and no HCL in front of you — **rebuild the core of this
capstone from memory**: stand a system up in two regions from your Terraform
modules, put a router in front, execute a failover and *record the decomposed
RTO/RPO*, run one chaos experiment that could genuinely fail and observe it on
your dashboards, and produce a three-line prioritized gap list. Rebuilding it
cold — and noticing exactly where you stall (Was it the non-overlapping CIDR?
The data-promotion step? Wiring the burn-rate alert as the chaos abort? Phrasing
a falsifiable hypothesis?) — is the truest retention check there is, and it's
the same closed-book discipline the whole curriculum is built on. Tear it all
down again afterward and confirm the subscription is clean.

The deeper habit this track leaves you with: **resilience is a claim until it's
tested, and a test is worthless unless you recorded what it told you.** Failover
you've run, chaos you've observed, and gaps you've ranked — that's the
difference between "we have DR" and knowing you do.

## Next

You've now proven a system recovers from disaster and survives deliberate
failure — the reliability side of running a platform. The natural next question
is the *performance* side: does the system actually hold up under the load
you'll subject it to, and does the autoscaling you configured back in tracks
05-07 really kick in when it should? That's
**[23-performance-and-load-testing](../../23-performance-and-load-testing/README.md)**,
which puts real, measured load on your system — the complement to this track's
failure-injection, and the tool that turns "it should scale" into "here's the
load curve where it does." Many of this track's habits carry straight over: a
load test is an experiment with a hypothesis, blast radius, and observation
through the track-12 stack — you'll recognize the shape immediately.

[Back to track index](../README.md) · [Back to main curriculum](../../README.md)
