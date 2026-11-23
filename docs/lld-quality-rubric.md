# LLD quality rubric (interview coach)

Governing standard for rewriting `content/lld/**`. Different from the System Design 16-point rubric: LLD wins on **clear design decisions + code you can write in 45 minutes**, not queueing math.

**Voice:** interview coach. Plain English first. Jargon only when you would say it in a real round. Target read time 15–25 minutes for foundations/patterns; 25–35 for classic problems.

Every rewritten module must hit all 12 points before status is **Completed**.

| # | Component | Pass criteria |
|---|-----------|----------------|
| 1 | **Metadata** | Prerequisites (real links), honest reading time, audience |
| 2 | **In one line + golden rule** | `[!NOTE]` one sentence; `[!TIP]` when to use / what breaks if you ignore it |
| 3 | **Smell / when** | Concrete failure mode or interview prompt that motivates the topic |
| 4 | **Mental model** | One Mermaid (class, sequence, or state) readable on a phone |
| 5 | **Walkthrough** | Requirements → entities → key methods → extension point (no walls of theory) |
| 6 | **Polyglot code** | Working example in **Python + at least one of** C# / Go / TypeScript (carousel). Prefer runnable Python |
| 7 | **Edges** | Concurrency, nulls, or “when *not* to use this” — only where it matters |
| 8 | **Interview script** | 2-minute spoken answer: what you’d say on the whiteboard |
| 9 | **Anti-patterns** | One short section: common wrong design and the fix |
| 10 | **Q&A** | 6–8 questions tagged BASIC / SCENARIO / TRICKY in `<details>` |
| 11 | **Try it** | Link to LLD Studio, a practice problem, or a runnable block |
| 12 | **Cheat sheet** | One monospace card you could glance at before an interview |

## Explicit cuts (do not keep in rewrites)

- Marketing / “masterclass / FAANG excellence” filler in the body
- Formalisms that do not change how you design (e.g. long Main Sequence derivations) — one paragraph max if useful
- Four-language carousels for every trivial snippet — use all four only when idioms diverge
- Duplicate essays already covered in another module — link instead

## Wave order

See [`lld-rewrite-tracker.md`](lld-rewrite-tracker.md).
