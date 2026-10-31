# Module 14: Capstone Project — The GenAI Feasibility Audit

## What this capstone is

Track 00 was deliberately conceptual. You haven't built a RAG pipeline or
an agent yet — those are tracks 09 and 10. So this capstone doesn't ask
you to build one.

Instead it asks for the thing that **precedes** every successful GenAI
project and that almost nobody does: a rigorous, evidence-backed
assessment of whether a proposed use case will actually work, which
architecture it needs, and what it will cost.

This is a real deliverable. It's roughly what a competent AI engineer
produces in their first two weeks on a new problem, and the reason it
matters is that the alternative — building first and discovering the
task was recall-shaped in month three — is the single most common way
these projects fail.

There is no solution given. There are no exercises. The output is a
document plus a small amount of evidence-gathering code.

## The project

Pick a **real** use case. It must be something an actual person or team
would want — from your job, a side project, an open-source project you
use, or a business you know. Do not invent a toy problem; the whole
exercise depends on the messiness being real.

Some workable shapes, if you need a starting point:

- Answering questions over a body of internal documentation
- Triaging and routing incoming support tickets or bug reports
- Turning meeting transcripts into structured action items
- Reviewing pull requests against a team's written conventions
- Extracting structured data from invoices, contracts or forms
- Summarizing a daily firehose (news, alerts, monitoring) into a digest

## What to produce

A single document, **three to five pages**, with the following sections.
Everything you learned in track 00 should appear somewhere in it.

### 1. The problem

Who has it, how they currently solve it, how long that takes, and how
often they do it. Quantify the current cost in human time — if you
cannot, you also cannot justify building anything.

### 2. Task decomposition

Break the workflow into atomic steps. For each one, state:

- Which task family it is: transform, extract, generate, or recall
  (module 09)
- Where it sits on the reliability gradient
- Whether the output can be **verified mechanically**, by a human, or
  not at all

This table is the heart of the document. Most projects die here, and
finding that out on page two is a success, not a failure.

### 3. Limitation analysis

Which of module 10's limitations apply to this use case, specifically?
For each one that does:

- How would it manifest in *this* product, concretely?
- What would the user see when it happens?
- How bad is that — annoying, expensive, or dangerous?

Be specific. "It might hallucinate" is not analysis. "It will invent a
policy clause number, the user will quote it to a customer, and we'll
have made a commitment we can't honour" is analysis.

### 4. Architecture

Using module 11's escalation ladder, state the lowest rung that works —
**and justify why the rung below it is insufficient.** That justification
is the section's real content; without it you have a preference, not a
decision.

Include a layer-by-layer diagram of the proposed system, in the ASCII
style used throughout this track.

### 5. Cost and latency model

At expected volume, estimate: cost per request, monthly cost, p50 and p95
latency. Show your working, including assumed token counts.

Then model two sensitivity cases: 10x the volume, and switching between a
small and a frontier model. State which lever moves cost most.

### 6. Evidence

This is what separates an audit from an opinion. Run **at least three
small experiments** against a real model, using real (or realistically
messy) input from the use case, and report what happened.

Suggested experiments:

- Take 10 real inputs and try the naive approach — a single
  well-written prompt. Measure how many outputs are acceptable.
- If the task is recall-shaped, run module 09 exercise 2's contrast:
  ask with and without the source material supplied, and compare.
- Try to induce the failure mode you predicted in section 3, and record
  whether you succeeded.

Report the numbers honestly, including inconvenient ones. A finding that
the naive approach already works 9 times out of 10 is extremely valuable
— it may mean you don't need most of the architecture you were about to
build.

### 7. Recommendation

One of:

- **Build it** — with the architecture from section 4 and the success
  metrics you'd hold it to.
- **Build a reduced version** — name which steps to automate and which to
  leave with a human, and why that split.
- **Don't build it** — with the specific limitation or economics that
  kills it.

All three are legitimate outcomes. The third is often the most valuable
thing an engineer can deliver, and being able to write it credibly —
with evidence rather than instinct — is a large part of what this
curriculum is for.

## Constraints

- Use real inputs. Curated examples will make the system look better than
  it is, which defeats the purpose.
- Spend under $2 on the evidence experiments. Use a small model; module
  13's budget tracker should be running.
- Every claim in sections 2-5 must trace back to a specific module in
  this track. If you can't cite the reasoning, re-read that module.
- Keep it under five pages. The discipline of compression is part of the
  exercise; a twenty-page document doesn't get read, and doesn't get
  acted on.

## How to know you've done it well

- Someone who hasn't read this curriculum could follow your reasoning and
  reach the same conclusion.
- Your section 3 predictions match what section 6's experiments actually
  found — or you explain the gap, which is more interesting.
- The recommendation would survive a skeptical question from whoever
  would fund it.
- You changed your mind about something between starting and finishing.
  If the document merely confirms your opening assumption, you probably
  weren't testing it.

## Keep this document

Return to it after track 09 (RAG) and again after track 15 (evaluation).
You'll find things you'd now argue differently — the cost model will be
sharper, the evaluation section will be far more concrete, and you'll
have opinions about chunking you don't currently have.

Revising it twice is how you'll see what the curriculum actually taught
you, and by track 15 it becomes the specification for the portfolio
project you sketched in module 12.

## Next

[Track 01: Tokens & Language Modeling](../../01-tokens-and-language-modeling/README.md)
