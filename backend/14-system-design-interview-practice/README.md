# 14 - System Design Interview Practice

This is the capstone track of the whole curriculum. Everything you built in the
previous thirteen tracks — request/response, APIs, auth, the data layer, caching,
background processing, search, observability, security, distributed-systems
patterns, advanced API paradigms, testing, and devops — was a *component*. This
track teaches you to assemble those components into whole systems on a whiteboard,
under time pressure, the way a real system-design interview demands: estimate the
capacity, scope a deliberately vague prompt, and drive a complete design through
requirements, data model, architecture, a deep-dive on the genuinely hard part,
and an honest accounting of the tradeoffs. It's less about learning new
technology and more about *synthesis and judgment* — recognizing which of the
patterns you already know applies, why, and what it costs.

## How this track works

- It assumes you've worked through **the earlier tracks** — this is where their
  concepts get *used*, not re-taught. Modules cross-reference earlier tracks by
  name constantly (the idempotency-key pattern from **10-distributed-systems-
  patterns**, cache-aside from **05-caching-and-performance**, the inverted index
  from **07-search-with-elasticsearch**, and so on) so you can see each piece slot
  into a larger design. You don't need to re-read those tracks first, but the
  cross-references will land harder if you have.
- Unlike the other tracks, this one is mostly **prose, diagrams, and estimation
  math rather than heavy code** — that's correct for system design. Where code
  clarifies a contract or an algorithm (a token-bucket rate limiter, a base62
  encoder, an idempotent API), it's **Python/FastAPI**, but most of the work is
  reasoning, sketching architectures in ASCII, and doing back-of-envelope
  arithmetic out loud.
- The track builds deliberately: module 00 gives you the estimation math and 01
  gives you the interview framework, and every problem module (02–07) then *runs
  that framework* on a canonical system, reinforcing the same seven steps until
  they're a reflex. Go in order; each problem assumes the vocabulary and habits of
  the ones before it.
- Each standard module has the same shape: why it matters, concepts, a command
  reference (formulas, checklists, and reference architectures for this track),
  progressive hands-on design exercises (do them — including a "diagnose and fix a
  flawed design" scenario each), an independent challenge with no solution, common
  mistakes, and a checkpoint quiz. Two **cumulative reviews** (in **modules 03 and
  06**) mix questions from everything so far, closed-book.
- The last module is an open-ended **capstone** with no solution given — a full
  mock interview on a problem the track never worked directly — the integration
  test for the whole track *and* the whole curriculum.

## Modules

| # | Module | What you'll be able to do | Time |
|---|--------|---------------------------|------|
| 00 | [Capacity estimation and back-of-envelope math](00-capacity-estimation-and-back-of-envelope-math/README.md) | Estimate QPS, storage, bandwidth, and memory from a DAU figure using a repeatable recipe and a handful of memorized numbers, and turn every estimate into an architectural decision | 60-90 min |
| 01 | [The system design interview framework](01-the-system-design-interview-framework/README.md) | Run a structured seven-step whiteboard session — requirements, estimation, API, data model, high-level design, deep-dive, bottlenecks — and talk tradeoffs the way interviewers score | 60-90 min |
| 02 | [Designing a URL shortener](02-designing-a-url-shortener/README.md) | Drive the full framework on a read-heavy storage problem: unique-id generation, cache-aside redirects, key-based partitioning, and the 301/302 tradeoff | 60-90 min |
| 03 | [Designing a rate limiter](03-designing-a-rate-limiter/README.md) | Design distributed rate limiting: token bucket vs. sliding window, atomic shared counters, race conditions, and fail-open vs. fail-closed — plus the first cumulative review | 75-100 min |
| 04 | [Designing a distributed cache and key-value store](04-designing-a-distributed-cache-and-key-value-store/README.md) | Design the storage substrate itself: consistent hashing, replication, quorum consistency (CAP made real), eviction policies, and write policies | 75-100 min |
| 05 | [Designing a news feed or social timeline](05-designing-a-news-feed-or-social-timeline/README.md) | Solve the fan-out problem: push vs. pull, the celebrity problem, the hybrid model, async fan-out, and feed caching at scale | 75-100 min |
| 06 | [Designing a chat and notification system](06-designing-a-chat-and-notification-system/README.md) | Design real-time delivery: websockets and the connection layer, presence/routing, ordering, at-least-once delivery, store-and-forward, and multi-channel notifications — plus the second cumulative review | 75-100 min |
| 07 | [Designing a video streaming or large-scale search system](07-designing-a-video-streaming-or-large-scale-search-system/README.md) | Design two large-scale specializations: video (object storage, CDNs, transcoding, adaptive bitrate) and search (inverted index, relevance ranking, distributed scatter-gather query) | 75-100 min |
| 08 | [Capstone project](08-capstone-project/README.md) | Run a full mock interview on a payments/ledger system — a correctness-and-consistency-critical problem that synthesizes estimation, data modeling, idempotency, atomicity, and observability from across all 14 tracks | 4-6 hrs |

Start here → [00-capacity-estimation-and-back-of-envelope-math/README.md](00-capacity-estimation-and-back-of-envelope-math/README.md)

Back to the master index: [../README.md](../README.md)

## How to work through this

- **Go in order.** Modules 00 and 01 are the foundation — the estimation math and
  the framework — and every problem module (02–07) applies them. Skipping ahead to
  a problem before you own the framework means you'll drift into buzzword-listing,
  which is exactly the failure mode this track trains out of you.
- **Do the exercises out loud.** These are *written and spoken* design exercises,
  not code to run. Talk through them at a whiteboard (or to a rubber duck), narrate
  your reasoning, and time yourself — because that's the actual skill being built.
  Silent reading builds recognition; talking builds recall.
- **Attempt every quiz question in writing before expanding the answer**, and do
  each independent challenge with zero peeking. Struggling for 10-15 minutes before
  checking a hint is the point.
- **Take the two cumulative reviews closed-book.** They're in **module 03** (mixing
  00-03) and **module 06** (mixing 00-06). If you can't answer something from three
  modules back, go redo that module's exercises.
- **Before starting a new problem module, re-run the previous one cold** — blank
  whiteboard, no notes, out loud, timed. Cold repetition is what turns the
  framework into the reflex you'll have in a real interview.

---

This is the **final track of the 14-track backend engineering curriculum** — there
is no next track. Completing it means you've gone from how a single HTTP request
travels from browser to backend all the way to designing complete distributed
systems end to end on a whiteboard. From here, the work is practice and
integration: re-run this track's designs cold, revisit the earlier tracks'
capstones now that you can see each as a component inside a larger system, and
take a real system you use or want to build and drive the full framework on it.
You have the whole toolkit now — go build things.
