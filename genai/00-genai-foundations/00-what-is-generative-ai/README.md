# Module 00: What Is Generative AI (and What It Isn't)

## Why this matters

"AI" has meant wildly different things over the decades: a chess engine
searching a game tree, a spam filter scoring an email, a recommendation
system ranking products, a self-driving car's perception stack. All of
those are *discriminative* — given an input, they predict a label, a
score, or a decision from a fixed, finite set of possibilities.

**Generative AI is a different job: producing new, original content** —
text, code, images, audio — that didn't exist before, by learning the
statistical structure of a huge body of existing content well enough to
extend it plausibly. A generative model doesn't pick "spam" or "not spam"
from two options; given "The capital of France is", it has to produce the
*next word*, then the next, then the next, from a vocabulary of tens of
thousands of candidates, over and over, until it has written a sentence,
a paragraph, or a working Python function.

Getting this distinction precise matters because it explains *why* these
systems fail the way they do. A discriminative spam filter that's wrong
says "not spam" when it should've said "spam" — a clear, bounded error. A
generative model that's "wrong" can produce a perfectly fluent, confident,
*completely fabricated* citation — because fluency and correctness are two
separate things it learned somewhat independently, and it was never
trained to say "I don't know." Everything in track 15 (evaluation,
hallucination, guardrails) traces back to this one root cause, so it's
worth sitting with now rather than later.

## Concepts

### The core reframe: language modeling as a generation task

At its heart, a large language model (LLM) is trained to do one
deceptively simple thing: **given some text, predict what token comes
next.** ("Token" gets its own full treatment in track 01 — for now, think
"roughly a word or word-piece.") Trained on trillions of tokens of real
text, a model good enough at "what comes next" turns out to be able to
answer questions, write code, summarize documents, translate languages,
and hold a conversation — all as instances of the same underlying skill:
predicting plausible continuations.

This is why the field talks about "generative" models rather than
"conversational" or "question-answering" models — chat is one *interface*
built on top of next-token prediction, not a separate capability. GPT
itself stands for **G**enerative **P**re-trained **T**ransformer — the
name literally describes what tracks 02–04 will build up in detail.

### Generative vs. discriminative, side by side

| | Discriminative | Generative |
|---|---|---|
| Job | Map input to one of a fixed set of labels/scores | Produce new content, token by token, from an effectively unbounded space |
| Example | Email to {spam, not spam} | Prompt to a full essay, function, or image |
| Typical output | A number or a class | A sequence (text, code, audio, pixels) |
| Classic failure | Wrong label, but the *kind* of answer is always valid | A fluent, structurally valid answer that is factually wrong (hallucination) |
| Pre-LLM examples | Logistic regression, an SVM classifier, a CNN image classifier | Markov-chain text generators, GANs for images, earlier RNN language models |

Both kinds of models can use neural networks — the "generative" label is
about the *task*, not the underlying math. In fact modern LLMs are also
used *as* discriminators (classifying sentiment, routing a support ticket)
by asking a generative model to generate one word from a constrained set —
you'll do exactly this in track 07 (structured outputs).

### Not every "generative" system is a large language model

Generative AI is the umbrella; LLMs are the specific sub-field this
curriculum is about. Related-but-distinct generative systems you'll hear
about, so you don't conflate them:

- **Diffusion models** (Stable Diffusion, Midjourney, Sora) generate
  images/video by learning to reverse a noise-adding process. Different
  architecture, different training objective from an LLM, though modern
  multimodal LLMs increasingly wrap both (track 16).
- **GANs (Generative Adversarial Networks)** are an older (2014-era)
  approach: two networks, a generator and a discriminator, trained against
  each other. Mostly superseded by diffusion for images; not used for
  text generation at LLM scale.
- **Multimodal LLMs** (GPT-4o, Gemini) are a single model that natively
  handles text, images, and sometimes audio as different "token" types
  fed through largely the same transformer machinery you'll learn in
  track 02. This curriculum focuses on text/code through track 15, then
  covers speech and vision explicitly in track 16 — the underlying
  transformer concepts transfer directly.

### Why now: the ingredients that had to line up

Nothing in the transformer architecture (track 02) is conceptually new to
the 2020s — attention mechanisms existed in research papers years before
ChatGPT. What changed, roughly 2017-2022, was three things arriving
together:

1. **Architecture** — the 2017 "Attention Is All You Need" paper (track
   02) gave the field an architecture that parallelizes across GPUs far
   better than the RNNs it replaced. Training on today's data volumes
   with an RNN would take impractically long.
2. **Data** — internet-scale text corpora (Common Crawl, Wikipedia, books,
   code repositories) became practical to collect and clean at the
   trillions-of-tokens scale these models need.
3. **Compute** — GPU throughput (track 05) and the economics of training
   runs crossed a threshold where training a many-billion-parameter model
   became a corporate R&D expense rather than a research-lab moonshot.

None of the three alone would have produced ChatGPT — this is why earlier
research-lab language models (some architecturally similar) didn't cause
the same shift: they were smaller, trained on less data, or both.

## Reference

| Term | Means |
|---|---|
| LLM | Large Language Model — a neural network trained to predict the next token in a sequence, at a scale of billions+ parameters |
| Generative AI | The broader category: any model that produces new content rather than a label/score |
| GPT | Generative Pre-trained Transformer — OpenAI's model family name, also a description of the training recipe |
| Discriminative model | A model that classifies/scores fixed-set inputs (contrast with generative) |
| Diffusion model | A generative architecture for images/audio/video, distinct from transformer LLMs |
| Multimodal model | A single model handling more than one content type (text + images, etc.) |
| Hallucination | A fluent, confident, but factually incorrect generated output, previewed here, covered fully in track 15 |

## Hands-on exercises

Do these before opening the answer to each. Write your own answer down
first, even one sentence.

### 1. Classify the task

For each of the following, decide: is this a job for a discriminative
model or a generative one, and why?

- Deciding whether a photo contains a cat.
- Writing a photo caption describing what's in it.
- Deciding whether a customer support message is urgent.
- Drafting a reply to that support message.
- Translating a sentence from French to English.

<details><summary>Answer</summary>

Discriminative: "contains a cat" (fixed label: yes/no), "is urgent" (fixed
label: yes/no or a severity scale). Generative: "write a caption" (open-
ended text), "draft a reply" (open-ended text) — and, the instructive one,
**translation is generative**, even though it feels like "the answer
already exists somewhere." The model isn't looking up a translation
table; it's generating the target-language token sequence most likely to
follow the source sentence, learned from parallel-text statistics. This
is exactly why an LLM can mistranslate a rare idiom fluently and
confidently — the same failure mode as any other hallucination.
</details>

### 2. Spot the fabrication

Ask any chat-based LLM (ChatGPT, Claude, Gemini, whatever you have access
to) a question you already know the precise factual answer to, but
phrase it to invite a specific-sounding but obscure detail — for example,
"What page of [a specific real book] does [a specific claim] appear on?"
Record the model's answer, then verify it against the real source.

Write one paragraph: was the answer fluent? Was it confident-sounding?
Was it correct? This is the generative/discriminative distinction from
this module made concrete — nothing stopped the model from "sounding
right."

### 3. Three ingredients, one timeline

Pick any three consumer LLM products you've heard of (for example,
ChatGPT, GitHub Copilot, a coding-assistant IDE plugin). For each,
identify which underlying model architecture powers it (you may need to
search) and roughly when it launched. Line the launch dates up against
the "architecture / data / compute" timeline in this module and note
whether each product's timing is consistent with the story this module
tells.

### 4. Explain it to a skeptic

In 3-4 sentences, explain to someone who thinks "AI" means "a computer
that thinks" why an LLM predicting the next token is a fundamentally
different (and more limited, in a specific way) claim than "the computer
understands what it's saying." Don't use the word "hallucination" — force
yourself to explain the *mechanism*.

## Independent challenge

Build nothing yet (no API key needed for this module) — instead, produce
a one-page written artifact: **a decision table for your own use case.**
Pick a real or plausible product idea (a support-ticket triager, a
document summarizer, a code-review assistant, anything). For every
discrete capability that product needs, classify it discriminative or
generative, and briefly justify why. If you get to the end and *every*
capability is generative, that's a signal worth questioning — go back and
look for the discriminative sub-tasks (routing, flagging, scoring) hiding
inside it, since real production systems almost always mix both.

## Common mistakes & troubleshooting

- **Treating "generative" and "conversational" as synonyms.** Chat is a
  UI convention (a loop of "user turn, assistant turn") layered on top of
  next-token prediction, not a separate model capability. This matters
  concretely in track 10: an agent is *not* a chat UI, it's the same
  underlying generation loop wired to tools instead of (or alongside) a
  human.
- **Assuming fluency implies correctness.** This is the single most
  expensive misconception in production GenAI systems — it's the root
  cause of shipping an unguarded chatbot that confidently invents a
  return policy. Track 15 is built entirely around defending against
  this.
- **Assuming "AI" is one technology.** A resume-screening classifier, a
  Netflix recommendation, and ChatGPT are built on different
  architectures solving different problems. Conflating them leads to both
  overestimating what an LLM can do (it isn't a general reasoning oracle)
  and underestimating what a plain classifier can do cheaply (you don't
  need an LLM call to detect ten known spam phrases).

## Checkpoint quiz

1. What is the one-sentence definition of what an LLM is trained to do?
2. Why is translation a generative task rather than a lookup?
3. Name the three ingredients that had to arrive together for today's
   LLMs to become possible, and what era each became practical.
4. What's the key structural difference between a discriminative model's
   typical failure and a generative model's typical failure?
5. Is a diffusion model (e.g., Stable Diffusion) an LLM? Why or why not?

<details><summary>Answers</summary>

1. Given a sequence of tokens, predict the most probable next token,
   repeated to generate arbitrarily long output.
2. Because the model generates the target sequence token by token based
   on learned statistical patterns, not by looking up a fixed
   translation, which is also why it can mistranslate fluently.
3. Architecture (the transformer, ~2017), data (internet-scale corpora),
   and compute (GPU throughput/economics) — all needed to reach practical
   scale roughly together, in the late 2010s to early 2020s.
4. A discriminative model's failure is a wrong label from a bounded set
   (still recognizable as "an answer of the right shape"); a generative
   model's failure can be fluent, well-formed, and completely fabricated —
   harder to detect exactly because it doesn't *look* wrong.
5. No — it's a generative model (for images/audio/video), but it uses a
   different architecture and training objective (learning to reverse a
   noising process) than a transformer-based language model.
</details>

## Next

[Module 01: A Brief History — From Rules to Transformers](../01-a-brief-history-from-rules-to-transformers/README.md)
