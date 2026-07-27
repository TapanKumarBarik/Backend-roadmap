# Module 01: The System Design Interview Framework

## Why this matters

A system-design interview is not a knowledge quiz — it's a simulation of you
doing the actual job of designing a system with a colleague at a whiteboard. The
single most common way strong engineers fail it is not lack of knowledge; it's
lack of *structure*. They hear "design Twitter," panic, and immediately start
naming technologies ("we'll use Kafka and Cassandra and…") before they've
established what the system even needs to do. Forty-five minutes later they've
got a pile of buzzwords, no coherent design, and an interviewer who couldn't
follow the reasoning. The knowledge was there; the process wasn't.

The fix is a repeatable framework you run *every single time*, so that under
pressure you're following a script instead of improvising. A good framework does
three things: it keeps you from freezing (you always know the next step), it
makes your reasoning *legible* to the interviewer (they're scoring how you
think, not just the final diagram), and it forces you to nail down scope before
you spend time on details that might not matter. This module gives you that
framework — requirements, estimation, API, data model, high-level design,
deep-dive, bottlenecks — and, just as importantly, teaches you how to *drive the
conversation*: it's a dialogue, not a monologue. Master the process here and
every remaining module in this track is just applying it to a specific problem.

## Concepts

### The interview is a conversation, not a monologue

The interviewer is playing the role of a teammate and a stakeholder. They have
information you need (the real requirements, which are deliberately vague at the
start) and they're evaluating *how you collaborate*, not just what you output.
This reframes everything:

- **Ask before you assume.** "Design a chat app" could mean 1:1 messaging or
  Slack-scale group chat with 100K-member channels — wildly different systems.
  Clarifying questions aren't a stalling tactic; they're the first thing you're
  scored on.
- **Think out loud.** A silent candidate drawing boxes is unscoreable. Narrate
  the *why*: "I'm putting a cache here because the read:write ratio is 100:1, so
  reads dominate and the DB will be the bottleneck."
- **Take signals.** If the interviewer says "let's assume writes are the hard
  part" or "don't worry about auth," that's them steering you toward what they
  want to probe. Follow it. Fighting the steer to show off a different area is a
  classic mistake.
- **Manage the clock, out loud.** "We have about 40 minutes; I'll spend ~5 on
  requirements, ~5 on estimation and API, ~10 on the high-level design, then go
  deep on whatever you're most interested in." This shows seniority immediately.

### The framework: seven steps in order

Run these in order every time. The times assume a ~45-minute interview; scale
proportionally.

1. **Requirements & scope (~5 min).** Nail down *functional* requirements (what
   the system does — the 2–4 core features) and *non-functional* requirements
   (how it must behave — scale, latency, availability, consistency). Explicitly
   state what's **out of scope** ("no payments, no analytics for now"). This is
   the most important step; getting it wrong wastes the whole interview.
2. **Capacity estimation (~5 min).** The back-of-envelope math from module 00:
   DAU, QPS (read and write, peak), storage, bandwidth. Do just enough to *drive
   decisions* — you need to know if you're at "one database" scale or "shard
   everything" scale.
3. **API design (~5 min).** Sketch the core endpoints — the contract between
   client and system. A handful of REST (or gRPC/GraphQL) signatures. This forces
   concreteness and reveals the data flow.
4. **Data model (~5 min).** The main entities, their key fields, and the
   relationships. Critically: *SQL vs. NoSQL* and *how you'll shard/partition* —
   these are driven by your access patterns and the numbers from step 2.
5. **High-level design (~10 min).** The boxes-and-arrows diagram: clients → load
   balancer → app servers → caches → databases → queues → workers. Draw the
   *happy path* of a core request end to end. Keep it high-level; resist diving
   deep yet.
6. **Deep-dive (~10 min).** Pick the 1–2 hardest/most interesting components (or
   follow the interviewer's steer) and go deep: the sharding scheme, the caching
   strategy, the consistency model, the fan-out approach. This is where senior
   candidates separate themselves.
7. **Bottlenecks, scaling & wrap-up (~5 min).** Identify single points of
   failure, the component that breaks first under load, and how you'd scale it.
   Discuss tradeoffs you made and what you'd revisit with more time.

You will rarely finish all seven perfectly, and that's fine — the framework
ensures that whenever time runs out, you've spent it on the highest-value things
in the right order.

### Functional vs. non-functional requirements

This distinction structures step 1 and quietly drives every later decision.

- **Functional requirements** are *what the system does* — the features, phrased
  as user-visible capabilities. For a URL shortener: "create a short URL from a
  long one," "redirect a short URL to its original," "optional custom alias,"
  "optional expiration." Keep it to the 2–4 that matter; the interviewer will
  tell you if you've missed one.
- **Non-functional requirements (NFRs)** are *how the system must behave* — the
  qualities that shape the architecture far more than the features do:
  - **Scale:** how many users, requests, how much data (your step-2 numbers).
  - **Latency:** how fast must a request be? (A redirect must be <100 ms; a
    nightly report can take minutes.)
  - **Availability:** what uptime? Is brief downtime acceptable or is this a
    payment system where it isn't?
  - **Consistency:** must every reader see the latest write immediately (strong),
    or is eventual consistency acceptable? This is the deepest fork — recall the
    CAP theorem from **10-distributed-systems-patterns**.
  - **Durability:** can you ever lose data? (A tweet losing one like: tolerable.
    A financial ledger losing a transaction: never.)

The NFRs are where designs actually diverge. Two candidates asked to "design a
feed" produce completely different systems depending on whether they decided the
feed must be strongly consistent and sub-100 ms, or eventually consistent and
best-effort.

### Driving the design: high-level first, then deep-dive

The most common structural error after skipping requirements is going deep too
early — spending fifteen minutes on the perfect sharding key before there's even
a diagram. Resist it. Work **outside-in and top-down**:

- **Start with the simplest thing that could work**, then scale it. It's
  completely legitimate — encouraged, even — to first say "at small scale this is
  one app server and one database," draw that, confirm it satisfies the
  functional requirements, and *then* apply your capacity numbers to break it and
  evolve it. This narrates the reasoning that produced the complex design instead
  of presenting the complex design as a fait accompli.
- **Draw the happy path of one core request end to end** before adding any
  secondary features. For a feed: "user opens app → request hits LB → app server
  → checks feed cache → cache hit returns pre-computed feed." One clean path
  first; edge cases and other features after.
- **Then pick where to go deep.** You cannot deep-dive everything in ten minutes.
  Choose the component that's (a) the actual bottleneck per your numbers, or (b)
  what the interviewer signaled interest in. Announce the choice: "The
  interesting problem here is feed generation — let me go deep on fan-out."

### Talking tradeoffs (the thing actually being scored)

Senior signal in a design interview is almost entirely about **tradeoffs**.
There is no "correct" architecture — every choice buys something and costs
something, and your job is to make the cost/benefit explicit and tie it to the
requirements. The pattern to internalize: *"I'll do X, which gives us [benefit],
at the cost of [downside]; that's the right call here because [requirement]."*

- "I'll denormalize the feed into a per-user cache (fan-out on write). That makes
  reads O(1) and fast — right for a 100:1 read-heavy system — at the cost of
  expensive writes and a hard problem for celebrity accounts, which I'll handle
  with a hybrid pull model."
- "I'll use eventual consistency for the like count. A user seeing a like count
  that's stale by a second is fine (the NFR says so), and it lets me avoid a
  distributed transaction on every like."
- "I'll shard by user_id, which co-locates a user's data for fast reads but makes
  cross-user queries scatter-gather — acceptable because our access pattern is
  overwhelmingly single-user."

Every strong answer is a chain of these. When you catch yourself asserting a
technology with no tradeoff attached ("we'll use Kafka"), stop and add the
*why*: what does it buy, what does it cost, which requirement justifies it.

## Command reference

The framework as a whiteboard checklist. Memorize this; it's the spine of every
remaining module.

| Step | Time (of ~45) | Deliverable | Key questions |
|---|---|---|---|
| 1. Requirements & scope | ~5 min | Functional (2–4) + NFRs + out-of-scope | What must it do? At what scale/latency/consistency? |
| 2. Capacity estimation | ~5 min | QPS (r/w, peak), storage, bandwidth | Are we at one-box or shard-everything scale? |
| 3. API design | ~5 min | Core endpoint signatures | What's the client↔system contract? |
| 4. Data model | ~5 min | Entities, keys, SQL/NoSQL, shard key | What are the access patterns? |
| 5. High-level design | ~10 min | Boxes-and-arrows, one happy path | How does one core request flow end to end? |
| 6. Deep-dive | ~10 min | 1–2 hardest components in detail | Where's the real difficulty / interviewer's interest? |
| 7. Bottlenecks & wrap-up | ~5 min | SPOFs, scaling plan, tradeoffs | What breaks first? What would you revisit? |

The requirements checklist (step 1), expanded:

```
FUNCTIONAL (what it does)
  - core feature 1, 2, 3 (keep to 2-4)
  - explicitly OUT of scope: ___

NON-FUNCTIONAL (how it behaves)
  - Scale:         DAU, QPS, data volume
  - Latency:       target for the critical read/write path
  - Availability:  uptime target; is downtime acceptable?
  - Consistency:   strong vs eventual (per operation)
  - Durability:    can we ever lose data?
```

A reusable high-level reference architecture (most designs are a subset of this):

```
                    ┌─────────────┐
   Clients ───────► │ Load Balancer│
                    └──────┬───────┘
                           ▼
                   ┌───────────────┐        ┌───────────┐
                   │  App Servers  │ ─────► │   Cache   │ (read path, hot data)
                   │ (stateless)   │        └───────────┘
                   └───┬───────┬───┘
                       │       │
             (sync)    ▼       ▼   (async)
              ┌──────────────┐ ┌──────────────┐
              │  Database(s) │ │ Message Queue│──► Workers ──► (email, feed
              │ (sharded/    │ └──────────────┘              fan-out, indexing…)
              │  replicated) │
              └──────────────┘
                       │
                       ▼
                 Object store / CDN (blobs, media, static)
```

The tradeoff sentence template (use it constantly in step 6):

```
"I'll do <choice>, which gives us <benefit> at the cost of <downside>;
 that's right here because <specific requirement>."
```

## Hands-on exercises

These are written/spoken exercises — do them out loud or on paper, timed where
noted, exactly as you would in a real interview.

### 1. Split requirements for three prompts

For each prompt — "design a URL shortener," "design a ride-hailing app," "design
Instagram" — write **2–4 functional requirements** and **the five NFRs** (scale,
latency, availability, consistency, durability), plus one explicit **out-of-
scope** item. Keep functional lists short. Notice how the NFRs, not the features,
are what make these three systems architecturally different.

### 2. Write the clarifying questions

For "design a chat application," write the **six clarifying questions** you'd ask
in the first two minutes, before drawing anything. Rank them by how much each
answer would change your architecture. (Hint: "1:1 or group?" and "how large can
a group get?" reshape the whole design; "what color is the send button?" does
not.)

### 3. Time-box a full pass

Set a 20-minute timer. Out loud (record yourself or talk to a rubber duck), do a
compressed pass over "design a pastebin/text-sharing service": requirements,
rough estimation, three API endpoints, the main entity, and a high-level
diagram. The goal isn't depth — it's *hitting every step in order under a clock*.
Note which step you rushed or skipped.

### 4. Turn assertions into tradeoffs

Each of these is a bare technology assertion. Rewrite each using the tradeoff
template ("...which gives us X at the cost of Y; right here because Z"):
(a) "We'll use Redis." (b) "We'll shard the database." (c) "We'll use a message
queue." (d) "We'll go with eventual consistency." Invent a plausible requirement
to justify each.

### 5. Sequence a derailed interview

A candidate, given "design Twitter," immediately starts with: "So we'll use
Cassandra because it scales writes, and Kafka for the timeline, and…". List, in
order, the **four steps they skipped**, and write the one sentence you'd use to
pull the conversation back to step 1 gracefully.

### 6. Read the interviewer's steer

You're 15 minutes into "design a news feed," mid-way through drawing the data
model, when the interviewer says: "Let's assume you have 100M users and some
accounts have 50M followers — how does the feed get built?" What are they
signaling, which framework step should you jump to, and what's the specific
problem they want you to address? Write your next two sentences.

### 7. Scope creep defense

Given "design a photo-sharing app," a candidate's requirements list is: upload
photos, view feed, follow users, comment, like, direct messages, stories,
explore/discovery, ads, and analytics. Explain why this list is a *problem* for a
45-minute interview, then cut it to a defensible core and state what you'd
explicitly defer.

### 8. Diagnose and fix a flawed design process

Critique this candidate's **process** (not their technology). Identify every
process error and rewrite the opening five minutes correctly.

> The candidate hears "design a video streaming service," nods, and immediately
> draws: a CDN, an S3 bucket, a transcoding pipeline with six worker types, a
> recommendation ML service, and a GraphQL gateway. They spend twelve minutes
> perfecting the transcoding fan-out diagram in silence. They never mention
> scale, never write an API, and never ask whether the focus is upload, playback,
> or recommendations. At minute 20 the interviewer asks "how many users?" and the
> candidate says "lots, it'll scale."

<details>
<summary>Solution</summary>

The technology choices might even be fine — the *process* is broken in at least
five ways:

1. **No requirements or scope.** They never established functional requirements
   or asked what to focus on (upload? playback? recommendations?). "Design a
   video streaming service" is deliberately vague; the first job is to bound it.
   A recommendation ML service may be entirely out of scope.
2. **No capacity estimation.** "Lots, it'll scale" is a non-answer. Without
   numbers there's no justification for a CDN, for the transcoding fleet's size,
   or for any sharding decision — the whole design is unmotivated.
3. **Silent for twelve minutes.** An unscoreable stretch. The interviewer can't
   follow the reasoning, and reasoning is what's being graded.
4. **Deep-dived before a high-level design existed.** Perfecting the transcoding
   fan-out before there's an end-to-end happy path is going deep too early — on a
   component that might not even be the focus.
5. **No API, no data model, no tradeoffs voiced.** Nothing concrete tied the
   design to actual behavior, and no choice was justified against a requirement.

Corrected opening five minutes: "Let me clarify scope first — is the focus on the
upload/transcoding path, the playback/streaming path, or recommendations? …
Okay, playback. Functional requirements: upload a video, transcode it to
multiple resolutions, stream it smoothly to viewers worldwide. Out of scope for
now: recommendations, comments, monetization. NFRs: this is massively read-heavy
and latency-sensitive on playback — buffering is the enemy — global audience so
we'll need edge delivery, availability high, consistency can be eventual
(a newly uploaded video appearing a minute late is fine). Let me put rough
numbers on it before I draw anything…" — narrated, scoped, and numbers-first,
*then* the diagram.

</details>

## Independent challenge

No solution given. Take a prompt you have *not* seen worked in this track —
**"design a collaborative document editor like Google Docs"** — and run the full
seven-step framework end to end, out loud, in 40 minutes, as if it were a real
interview. Produce, in order: a scoped requirements list (functional + five
NFRs + out-of-scope), a rough capacity estimate, 3–5 API endpoints, the core
data model, a high-level diagram of one happy-path edit, one deep-dive of your
choosing, and a bottleneck/wrap-up. Then, drawing on the estimation discipline
from **00-capacity-estimation-and-back-of-envelope-math**, verify that every
architectural decision you made traces back to a specific number or NFR — if any
box in your diagram has no requirement behind it, you added it out of habit, not
reasoning.

<details>
<summary>Hint</summary>

Real-time collaborative editing lives or dies on the *consistency* NFR, so spend
your requirements time there: what happens when two users edit the same
paragraph at the same instant? That single question forces you toward conflict
resolution (operational transforms or CRDTs) and toward a persistent low-latency
connection per client (websockets — recall real-time transport from
**06-background-processing-and-realtime**). If you find yourself designing a
plain request/response CRUD API, you've mis-scoped the hardest requirement; the
interesting system is the concurrent-edit path, and your deep-dive almost
certainly belongs there.

</details>

## Common mistakes & troubleshooting

- **Skipping requirements and diving into the diagram.** The number-one failure.
  Spend the first five minutes bounding the problem or the rest is unmoored.
- **Naming technologies with no tradeoff.** "We'll use Kafka/Cassandra/Redis"
  with no *why* reads as buzzword bingo. Always attach benefit, cost, and the
  requirement that justifies it.
- **Going deep too early.** Perfecting one component before an end-to-end
  high-level design exists. Breadth first, then depth on the part that matters.
- **Going silent.** Unnarrated whiteboarding is unscoreable. Think out loud; the
  reasoning *is* the deliverable.
- **Ignoring the interviewer's steer.** When they nudge you toward writes, or
  toward the celebrity-follower problem, follow it — that's the part they want to
  evaluate. Insisting on your own agenda loses points.
- **Not managing the clock.** Spending 25 of 45 minutes on requirements, then
  having no diagram. Announce a time budget and keep glancing at it.
- **Unbounded scope.** Accepting or generating a ten-feature requirements list
  guarantees you finish nothing. Ruthlessly cut to a core and defer the rest out
  loud.
- **Presenting the complex design as a given.** Jumping straight to the sharded,
  cached, queued monster with no story of how you got there. Start simple, break
  it with your numbers, evolve it — the evolution is the reasoning.

## Checkpoint quiz

Write down your answer to each question before expanding it — checking without attempting first is the single easiest way to fool yourself into thinking you've learned this.

1. List the seven steps of the framework in order, with a rough time budget for
   each in a 45-minute interview.
2. What's the difference between a functional and a non-functional requirement?
   Give two examples of each for a URL shortener.
3. Why is the requirements-and-scope step the most important one, and what
   specifically goes wrong if you rush or skip it?
4. Name the five non-functional requirements you should always establish, and
   explain which one most often causes two designs of the "same" system to
   diverge.
5. What does "start with the simplest thing that works, then scale it" buy you in
   an interview, versus presenting the fully-scaled design immediately?
6. Give the tradeoff-sentence template and use it to justify a single concrete
   choice of your own.
7. The interviewer says "assume some accounts have tens of millions of
   followers." What are they signaling, and which framework step and specific
   problem should you move to?

<details>
<summary>Answers</summary>

1. (1) Requirements & scope ~5 min, (2) capacity estimation ~5, (3) API design
   ~5, (4) data model ~5, (5) high-level design ~10, (6) deep-dive ~10, (7)
   bottlenecks & wrap-up ~5.
2. Functional = *what it does* (create a short URL from a long one; redirect a
   short code to its original). Non-functional = *how it behaves* (redirects must
   be <100 ms and highly available; the system handles ~100:1 read:write at large
   scale). Features vs. qualities.
3. Because every later decision depends on scope and requirements; getting them
   wrong means you design the wrong system, and you waste the interview on
   details that don't matter. Rushing it typically means solving a harder or
   different problem than the interviewer intended.
4. Scale, latency, availability, consistency, durability. **Consistency**
   (strong vs. eventual) most often forks the design — it determines whether you
   can denormalize/cache freely and avoid distributed transactions, or must
   coordinate every write.
5. It narrates the *reasoning* — you show how the numbers and NFRs break the
   simple version and force each added component, so the complex design is
   justified step by step. Presenting the finished monster gives the interviewer
   no window into your thinking and often includes boxes you can't defend.
6. "I'll do <choice>, which gives us <benefit> at the cost of <downside>; that's
   right here because <requirement>." Example: "I'll cache feeds per-user
   (fan-out on write), giving O(1) reads at the cost of expensive writes; right
   here because the system is 100:1 read-heavy."
7. They're signaling the **celebrity / high-fan-out problem** and steering you to
   the **deep-dive** step on feed generation — specifically that pure fan-out-on-
   write explodes for accounts with tens of millions of followers, and they want
   to see your hybrid (fan-out on write for most, fan-out on read/pull for
   celebrities) solution.

</details>

## Next

[02-designing-a-url-shortener](../02-designing-a-url-shortener/README.md) — you
have the framework; now you'll run it on the classic warm-up problem. A URL
shortener looks trivial but touches unique-id generation, the read-heavy caching
pattern, storage estimation, and a genuine consistency question — the perfect
first system to take through all seven steps end to end.
