# 00 - Performance Testing Concepts

## Why this matters

You've configured autoscaling twice in this curriculum — HPA in
[track 03 module 09](../../03-kubernetes/09-scaling-hpa-and-vpa/README.md) and
KEDA in [track 06 module 03](../../06-azure-container-apps/03-scaling-with-keda/README.md)
— and both times you "proved" it worked by throwing a loop of requests at it
and watching a number go up. That's a demo, not a measurement. Before you
write a single line of k6, you need the vocabulary to say *what question a
test is answering*: whether the system meets its targets at expected load,
where it breaks, whether it degrades over hours, or how it handles a sudden
spike. Those are four different tests answering four different questions, and
"it feels fast to me" answers none of them.

## Concepts

### "It feels fast to me" is not a performance strategy

The single most common performance "strategy" is a developer loading the app
in a browser on a fast laptop next to the server, deciding it's snappy, and
shipping. This fails for reasons that are obvious once stated: you are **one
user**, not the thousand concurrent ones production sees; your latency
excludes the real network path; and "feels fast" has no number attached, so
you can't tell whether the next change made it slower. Performance testing
replaces a feeling with a **reproducible measurement under controlled load** —
a specific number of virtual users, doing specific things, producing latency
and error-rate numbers you can compare across runs. Everything in this track
is in service of that one shift: from anecdote to measurement.

### The four test types — each answers a different question

These names get used loosely; the useful way to hold them is by the *question*
each answers:

- **Load test** — "Does the system meet its targets at *expected* load?" You
  ramp to a realistic peak (say, your busiest normal hour) and hold it,
  checking latency and error rate stay within targets. This is the default
  test and the one your CI gate (module 07) runs.
- **Stress test** — "*Where* does it break, and *how*?" You push past expected
  load, increasing until something fails, to find the ceiling and observe the
  failure mode (does it shed load gracefully, or fall over and corrupt data?).
- **Soak test** (a.k.a. endurance test) — "Does it survive *sustained* load
  over *time*?" You hold a moderate load for hours, hunting slow problems that
  don't show up in a ten-minute run: memory leaks, disk filling, connection
  pools slowly leaking, caches growing unbounded.
- **Spike test** — "Can it handle a *sudden* jump?" You go from low load to
  very high load almost instantly (a flash sale, a link going viral, a cron
  job waking 10,000 devices at once) and watch whether autoscaling reacts
  fast enough or whether the spike causes errors before capacity catches up.

A system can pass a load test and fail a soak test (a leak), or pass a load
test and fail a spike test (autoscaling too slow) — which is exactly why you
don't get to run one test and call it "performance tested."

### Latency, throughput, and why the average lies

Two numbers describe a system under load, and you need both. **Throughput** is
how much work per unit time — requests per second (RPS). **Latency** is how
long each request takes. The trap is summarizing latency with an **average**:
one slow request among a thousand fast ones barely moves the mean, yet that
one slow request is a real user having a bad time. Always look at
**percentiles** instead — p95 ("95% of requests were faster than this") and
p99 are the standard, because they describe the *tail*, which is where users
actually notice pain. A p50 of 40ms with a p99 of 4s is a system that feels
fine in a demo and is quietly failing 1% of real users. You'll set k6
thresholds on percentiles, never on averages, for exactly this reason.

### Performance tests are how you *verify* SLOs, not invent them

In [track 20](../../20-sre-practices/README.md) you define **SLOs** — Service
Level Objectives — the explicit targets your service commits to, like "99% of
requests complete in under 300ms" or "error rate stays below 0.1%." An SLO is
a *promise*; a performance test is how you find out whether you can keep it
*before* real users do. The relationship is directional and important: **the
SLO comes first and the test's pass/fail thresholds are derived from it.** You
don't run a load test, see p95 = 280ms, and declare 280ms your target — that's
just enshrining whatever you happened to measure. You take the SLO ("p95 <
300ms at peak load") and write a test that ramps to peak load and *fails* if
p95 exceeds 300ms. If you haven't done track 20 yet, hold this idea: a good
threshold answers "what did we promise?", not "what did we happen to get?".

### Open vs. closed models, and why your test client can lie to you

There are two ways to generate load, and confusing them produces wrong
conclusions. A **closed model** has a fixed number of virtual users, each of
which sends a request, *waits for the response*, then sends the next. A
**open model** injects requests at a fixed *arrival rate* regardless of how
fast responses come back. The difference matters under stress: in a closed
model, when the system slows down, your virtual users *also* slow down (they're
waiting for responses), so you unintentionally back off exactly when you meant
to keep pushing — the system's own slowness throttles your test. Real internet
traffic is closer to open (users keep arriving whether or not your server is
keeping up). k6 supports both; module 03 covers choosing. For now, hold the
warning: a naive closed-model test can *hide* a system's failure by politely
waiting for it.

### The load generator is part of the system under test

A result is only as trustworthy as the machine producing the load. If your k6
process is pinned at 100% CPU on a tiny laptop, or saturating a home
connection's uplink, then the latency you measure includes *your own client's*
queueing — you're measuring your laptop, not the server. This is the "false
bottleneck" you'll deliberately reproduce in module 05: a test that shows the
system "maxing out" at 200 RPS when really the test *client* maxed out. The
fix is either a beefier generator, distributed load generation, or the managed
Azure Load Testing service (module 02) that runs the load from cloud engines
sized for the job. Rule of thumb: before trusting a ceiling, confirm the
*generator* wasn't the thing that hit the ceiling.

## Command reference

This module is concepts-first — there's no tool to run yet (module 01
installs k6). The "commands" here are the mental checklist you apply before
*any* test:

| Question to ask | Why it matters | Where it's covered |
|---|---|---|
| Which of the four test types is this? | Determines the load shape (ramp, hold, spike) and what "pass" means | This module; module 01 stages |
| What SLO is this verifying? | The threshold must come from a target, not from a prior measurement | Module 03; track 20 |
| Am I measuring percentiles, not averages? | The average hides the tail where users hurt | This module; module 01 thresholds |
| Open or closed model? | A closed model can throttle itself and hide failure | Module 03 |
| Is my load generator itself the bottleneck? | A saturated client fakes a server ceiling | Module 02; module 05 |
| Is the traffic realistic, or a uniform flood? | A uniform test scales a system that would fall over on real traffic | Module 03 |

## Hands-on exercises

No k6 yet — these are analysis exercises. Do them in writing; a performance
engineer's core skill is choosing the *right* test before touching a tool.

### 1. Classify the question

For each scenario below, name which of the four test types answers it, in
writing, before reading the next:

1. "Our Black Friday sale starts at midnight and traffic 20×'s in under a
   minute — will we survive the opening?"
2. "The service seems fine when we deploy but gets sluggish by the third day
   — is something leaking?"
3. "We expect 800 RPS at peak. Do we stay under 300ms p95 at 800 RPS?"
4. "How many RPS can this thing actually take before it falls over, and does
   it fail cleanly or corrupt data?"

Expected: 1 = spike, 2 = soak, 3 = load, 4 = stress. If you called #1 a load
test, re-read "The four test types" — the *suddenness* is the whole point.

### 2. Turn a feeling into a measurement

Write down a service you've built or used. Now write a single sentence that
would make "it's fast" falsifiable — it must contain a percentile, a latency
number, and a load level. Example: "p95 latency stays under 250ms at 500
concurrent users." Expected: if your sentence has no number in it, you've
just re-described the feeling, not replaced it.

### 3. Catch the lying average

A test reports: mean latency 60ms, p50 45ms, p95 90ms, p99 3200ms, over
100,000 requests. Answer in writing: roughly how many requests were slower
than 3.2 seconds, and would a dashboard showing only the *mean* have told you?
Expected: ~1% of 100,000 ≈ 1,000 requests over 3.2s; the 60ms mean completely
hides them — this is why you alert on p99, not mean.

### 4. Derive a threshold from an SLO

Given the SLO "99.5% of checkout requests complete within 400ms during
business hours," write the load test's pass condition as a threshold on a
percentile. Expected: something like `p(99.5) < 400ms` while holding
business-hours peak load — note that you did *not* invent 400ms; you copied it
from the SLO. If you wrote a threshold on the *average*, re-read the SLO
concept.

### 5. Spot the self-throttling test

A colleague's test uses 50 virtual users, each looping "send request → wait
for response → repeat." They report "the system handled 50 users at 200ms and
never errored, even under our worst case." Explain in writing why this result
can't tell you the system's real capacity. Expected: closed model — as the
server slows, the 50 users slow with it, so the offered load *drops* exactly
when you wanted it to stay constant; the test can't push past the point where
the server starts struggling because the users politely wait.

### 6. Indict the generator

A test on a 2-core laptop over home WiFi reports the API "plateaus at 300 RPS
— that's our ceiling." List two things you'd check before believing 300 RPS is
the *server's* limit. Expected: (a) was the k6/laptop CPU saturated at 300 RPS
— check `top` on the client; (b) was the home uplink saturated — 300 RPS of
large responses can max a residential connection. Either makes 300 RPS the
*client's* ceiling, not the server's.

## Independent challenge

Pick a real service you can name — the demo app from
[track 07's AKS capstone](../../07-aks/09-capstone-project/README.md), or any
API you've deployed. Without writing any k6 yet, produce a one-page **test
plan** in prose: state the SLO you're verifying (invent a plausible one if you
haven't done track 20), which of the four test types you'd run *first* and
why, the specific percentile-based pass/fail threshold derived from that SLO,
the load shape in words (ramp to what, hold how long), and one sentence on how
you'll make sure the load generator itself isn't the bottleneck. This draws on
this module's whole vocabulary plus the SLO idea from
[track 20](../../20-sre-practices/README.md). The goal is to prove you can
frame a test *before* you know the tool — because a test framed wrong runs
perfectly and tells you nothing.

<details>
<summary>Stuck? One hint</summary>

Start from the SLO and work backwards. "p95 < 300ms at 800 RPS" almost writes
the plan for you: the test type is a *load* test (you're verifying expected
peak, not finding the ceiling or testing a spike), the threshold is
`p(95) < 300ms`, the load shape is "ramp to 800 RPS over a few minutes, hold
for 10." The generator check is one line: confirm the box running k6 has
headroom (CPU well under 100%) at 800 RPS, or you're measuring the wrong thing.

</details>

## Common mistakes & troubleshooting

- **Running one test and calling it "performance tested."** A passing load
  test says nothing about spikes or soak behavior. Name the question before
  claiming coverage.
- **Reporting averages.** The mean hides the tail. If a result summary shows
  only "average response time," it is hiding its p99 — ask for percentiles.
- **Inventing thresholds from measurements.** Setting the pass bar to "a bit
  above whatever we measured" enshrines the status quo and makes the test
  incapable of catching a regression down to that level. Thresholds come from
  SLOs.
- **Trusting a closed-model test under stress.** If offered load *drops* as
  the server slows, you're measuring a negotiation between your client and the
  server, not the server's capacity.
- **Ignoring the generator.** A saturated laptop or uplink produces a
  confident, wrong "ceiling." Always check client-side resource use before
  believing a plateau.
- **Confusing "it scaled in a demo" with "it scales."** The whole point of
  module 04: the track-03/06 demos proved the *mechanism*, not that your real
  app and real thresholds behave under realistic load.

## Checkpoint quiz

Write down your answer to each question before expanding it — checking without attempting first is the single easiest way to fool yourself into thinking you've learned this.

1. Name the four test types and the one-sentence question each answers.
2. Why is p99 latency a better thing to alert on than mean latency?
3. What is the correct direction of the relationship between an SLO and a
   load test's pass/fail threshold?
4. In a closed-model test, what happens to the offered load when the server
   slows down, and why is that a problem for a stress test?
5. Give one concrete way the *load generator* can produce a misleading
   "ceiling," and how you'd detect it.
6. A service passes its load test but users complain it gets slow after a few
   days of uptime. Which test type would have caught this, and what class of
   bug does it hunt?
7. Why is "it feels fast to me" not a performance strategy — name two distinct
   reasons.

<details>
<summary>Show answers</summary>

1. **Load** — does it meet targets at *expected* load? **Stress** — *where*
   and *how* does it break past expected load? **Soak** — does it survive
   *sustained* load over time? **Spike** — can it handle a *sudden* jump?
2. The mean is dominated by the many fast requests and hides the slow tail;
   p99 describes the slowest 1%, which is real users having a bad time. A fine
   mean can coexist with a terrible p99.
3. The SLO comes *first*; the test threshold is *derived from* the SLO. You do
   not measure first and then declare the measurement your target.
4. The virtual users wait for responses, so as the server slows they send
   fewer requests — offered load drops. For a stress test that's fatal: you
   wanted to keep pushing past the breaking point, but the test backs off on
   its own and never finds the real ceiling.
5. Any of: the k6 process saturates the client CPU; the client's network
   uplink is maxed. Detect by watching client-side CPU/network (`top`, network
   graphs) during the run — if the *client* is at 100%, the "ceiling" is the
   client's.
6. A **soak/endurance test** — it hunts slow, time-dependent bugs like memory
   leaks, connection-pool leaks, disks filling, unbounded caches.
7. Any two of: you're one user, not the concurrent thousands; your path
   excludes the real network latency; "fast" has no number, so you can't
   compare runs or catch a regression.

</details>

## Next

[01-k6-fundamentals](../01-k6-fundamentals/README.md) — now that you can frame
a test, learn the tool: writing a k6 script, virtual users, ramping stages,
checks, and thresholds, run for real against a live app.
