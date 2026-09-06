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
generative model that's "wrong" can produce a perfectly fluent,
confident, *completely fabricated* citation — because fluency and
correctness are two separate things it learned somewhat independently,
and it was never trained to say "I don't know." Everything in track 15
(evaluation, hallucination, guardrails) traces back to this one root
cause, so it's worth sitting with now rather than later.

## Concepts

### The core reframe: language modeling as a generation task

At its heart, a large language model (LLM) is trained to do one
deceptively simple thing: **given some text, predict what token comes
next.** ("Token" gets its own full treatment in track 01 — for now, think
"roughly a word or word-piece.")

```
   "The capital of France is"
              │
              ▼
   ┌──────────────────────┐
   │        model         │
   └──────────────────────┘
              │
              ▼
   a probability for EVERY token in the vocabulary
   ┌─────────────┬────────┐
   │ " Paris"    │  0.87  │  ◄── most likely
   │ " located"  │  0.04  │
   │ " a"        │  0.03  │
   │ " Lyon"     │  0.01  │
   │ ...         │  ...   │  (~50,000 more, summing to 1.0)
   └─────────────┴────────┘
              │
              ▼  pick one, append it, ask again
   "The capital of France is Paris"
```

Trained on trillions of tokens of real text, a model good enough at "what
comes next" turns out to be able to answer questions, write code,
summarize documents, translate languages, and hold a conversation — all
as instances of the same underlying skill: predicting plausible
continuations.

This is why the field says "generative" rather than "conversational" or
"question-answering" — chat is one *interface* built on top of next-token
prediction, not a separate capability. GPT itself stands for
**G**enerative **P**re-trained **T**ransformer; the name literally
describes what tracks 02-04 build up in detail.

### Generative vs. discriminative, side by side

```
DISCRIMINATIVE                        GENERATIVE
                                      
  input                                 prompt
    │                                     │
    ▼                                     ▼
┌────────┐                          ┌──────────┐
│ model  │                          │  model   │◄──┐
└────────┘                          └──────────┘   │ feeds
    │                                     │        │ its own
    ▼                                     ▼        │ output
 one label                            one token ───┘ back in
 {spam, not spam}                         │
                                          ▼
 ── done, one step ──              a sequence, N steps
```

| | Discriminative | Generative |
|---|---|---|
| Job | Map input to one of a fixed set of labels/scores | Produce new content, token by token, from an effectively unbounded space |
| Example | Email to {spam, not spam} | Prompt to a full essay, function, or image |
| Typical output | A number or a class | A sequence (text, code, audio, pixels) |
| Classic failure | Wrong label, but the *kind* of answer is always valid | A fluent, structurally valid answer that is factually wrong (hallucination) |
| Pre-LLM examples | Logistic regression, SVM, CNN classifier | Markov-chain generators, GANs, earlier RNN language models |

Both kinds can use neural networks — "generative" describes the *task*,
not the math. Modern LLMs are also used *as* discriminators (classifying
sentiment, routing a support ticket) by asking them to generate one word
from a constrained set; you'll do exactly this in track 07.

### Not every "generative" system is a large language model

Generative AI is the umbrella; LLMs are the sub-field this curriculum is
about.

```
                    GENERATIVE AI
                          │
      ┌───────────────┬───┴────────┬──────────────┐
      ▼               ▼            ▼              ▼
 ┌─────────┐   ┌────────────┐  ┌───────┐   ┌────────────┐
 │  LLMs   │   │ Diffusion  │  │ GANs  │   │ Multimodal │
 │ (text)  │   │ (images)   │  │(older)│   │ (text+img) │
 └─────────┘   └────────────┘  └───────┘   └────────────┘
  GPT, Llama    Stable Diff.    mostly       GPT-4o,
  Claude        Midjourney      superseded   Gemini
      ▲
      └── tracks 01-15 are here;  track 16 covers speech + vision
```

- **Diffusion models** generate images/video by learning to reverse a
  noise-adding process — different architecture and training objective
  from an LLM.
- **GANs** (2014-era) pit a generator against a discriminator. Mostly
  superseded by diffusion for images; never used for text at LLM scale.
- **Multimodal LLMs** handle text, images and sometimes audio as
  different "token" types through largely the same transformer machinery
  from track 02.

### Why now: the ingredients that had to line up

Nothing about attention was conceptually new to the 2020s. What changed,
roughly 2017-2022, was three things arriving together:

```
 ARCHITECTURE          DATA                 COMPUTE
 transformer (2017)    internet-scale       GPU throughput +
 parallelizes across   corpora: Common      training economics
 GPUs; RNNs did not    Crawl, books, code   crossed a threshold
      │                     │                     │
      └─────────────────────┼─────────────────────┘
                            ▼
              models big enough, trained on enough
              data, to be surprisingly general
                            │
                            ▼
                    GPT-3 (2020) ──► ChatGPT (2022)
```

None of the three alone would have produced ChatGPT — which is why
earlier, architecturally similar research-lab models didn't cause the
same shift: they were smaller, trained on less data, or both.

## Reference

| Term | Means |
|---|---|
| LLM | Large Language Model — a network trained to predict the next token, at billions+ parameters |
| Generative AI | The broader category: any model producing new content rather than a label |
| GPT | Generative Pre-trained Transformer — OpenAI's family name, and a description of the recipe |
| Discriminative model | Classifies/scores fixed-set inputs (contrast with generative) |
| Diffusion model | Generative architecture for images/audio/video, distinct from transformer LLMs |
| Multimodal model | One model handling more than one content type |
| Token | The unit an LLM actually reads and writes (track 01) |
| Hallucination | Fluent, confident, factually incorrect output (track 15) |

## Hands-on exercises

No API key or installs needed for this module — it's the conceptual
foundation. Write your answer down before opening each solution.

### 1. Classify the task

For each, decide: discriminative or generative, and why?

- Deciding whether a photo contains a cat.
- Writing a photo caption describing what's in it.
- Deciding whether a support message is urgent.
- Drafting a reply to that support message.
- Translating a sentence from French to English.

<details><summary>Answer</summary>

Discriminative: "contains a cat" (fixed label), "is urgent" (fixed
label). Generative: "write a caption", "draft a reply" — and the
instructive one, **translation is generative**, even though it feels like
the answer already exists somewhere. The model isn't consulting a
translation table; it generates the target-language token sequence most
likely to follow the source, learned from parallel-text statistics. That
is exactly why an LLM can mistranslate a rare idiom fluently and
confidently — the same failure mode as any other hallucination.
</details>

### 2. Watch next-token prediction happen live

The single best way to *feel* this module is OpenAI's own interactive
tokenizer plus a next-token visualizer.

1. Open [Tiktokenizer](https://tiktokenizer.vercel.app/) and type
   `The capital of France is`. Note how many tokens it becomes.
2. Open [transformer-explainer](https://poloclub.github.io/transformer-explainer/)
   (runs a real GPT-2 in your browser). Enter the same phrase and look at
   the output probability bar chart.

Record the top 3 predicted tokens and their probabilities. Then change
the prompt to `The capital of Australia is` and note whether the model's
top answer is correct — and how confident it is either way. Write one
sentence about what the confidence number does *not* tell you.

### 3. Spot the fabrication

Ask any chat LLM a question you know the precise answer to, but phrase it
to invite a specific-sounding, obscure detail — e.g. "What page of [a
real book] does [a real claim] appear on?" Verify the answer against the
actual source.

Write a paragraph: was it fluent? Confident? Correct? This is the
generative/discriminative distinction made concrete — nothing in the
architecture stopped it from sounding right.

### 4. Trace the three ingredients

Pick three LLM products you've heard of (ChatGPT, GitHub Copilot, an IDE
assistant). For each, find the underlying model and its launch date. Line
those dates up against the architecture/data/compute timeline above and
note whether each product's timing is consistent with the story.

### 5. Explain it to a skeptic

In 3-4 sentences, explain to someone who thinks "AI" means "a computer
that thinks" why next-token prediction is a fundamentally different — and
more limited, in a specific way — claim than "the computer understands
what it's saying." Don't use the word "hallucination"; explain the
*mechanism*.

## Independent challenge

Produce a one-page **capability decision table** for a real or plausible
product idea (support-ticket triager, document summarizer, code-review
assistant — your choice). For every discrete capability the product
needs, classify it discriminative or generative and justify why.

If you finish and *every* capability is generative, that's a signal worth
questioning — go back and find the discriminative sub-tasks (routing,
flagging, scoring, ranking) hiding inside it. Real production systems
almost always mix both, and the discriminative parts are usually far
cheaper to run and easier to evaluate.

## Common mistakes & troubleshooting

- **Treating "generative" and "conversational" as synonyms.** Chat is a
  UI convention layered on next-token prediction, not a model capability.
  This matters concretely in track 10: an agent is *not* a chat UI, it's
  the same generation loop wired to tools instead of a human.
- **Assuming fluency implies correctness.** The single most expensive
  misconception in production GenAI — the root cause of shipping an
  unguarded bot that confidently invents a refund policy.
- **Assuming "AI" is one technology.** A résumé classifier, a Netflix
  recommendation and ChatGPT solve different problems with different
  architectures. Conflating them leads to both overestimating LLMs (not a
  reasoning oracle) and underestimating plain classifiers (you don't need
  an LLM call to match ten known spam phrases).
- **Reading a model's probability as real-world confidence.** It's a
  distribution over the vocabulary, normalized to sum to 1 — "most likely
  next token given my training," never "I am sure this is true."

## Checkpoint quiz

1. What is the one-sentence definition of what an LLM is trained to do?
2. Why is translation a generative task rather than a lookup?
3. Name the three ingredients that had to arrive together for today's
   LLMs, and roughly when each became practical.
4. What's the structural difference between a discriminative model's
   typical failure and a generative model's?
5. Is a diffusion model an LLM? Why or why not?
6. Why does the model output a probability for *every* token in the
   vocabulary rather than just the answer?

<details><summary>Answers</summary>

1. Given a sequence of tokens, predict the most probable next token —
   repeated to generate arbitrarily long output.
2. The model generates the target sequence token by token from learned
   statistical patterns rather than retrieving a stored translation,
   which is also why it can mistranslate fluently and confidently.
3. Architecture (the transformer, 2017), data (internet-scale corpora),
   compute (GPU throughput and training economics) — converging roughly
   between the late 2010s and early 2020s.
4. A discriminative failure is a wrong label from a bounded set, still
   recognizably "an answer of the right shape." A generative failure can
   be fluent, well-formed and entirely fabricated — harder to detect
   precisely because it doesn't look wrong.
5. No. It's generative, but for images/audio/video, using a different
   architecture and objective (reversing a noising process) than a
   transformer language model.
6. Because generation is *sampling* from a distribution, not lookup. The
   full distribution is what lets you control output via temperature and
   top-p (track 01), and what makes more than one valid continuation
   possible.
</details>

## Further reading & sources

- [Attention Is All You Need (Vaswani et al., 2017)](https://arxiv.org/abs/1706.03762) - the transformer paper that supplied the "architecture" ingredient; skim it now, build it in track 02.
- [Language Models are Few-Shot Learners (GPT-3 paper, Brown et al., 2020)](https://arxiv.org/abs/2005.14165) - the "compute + data" ingredient demonstrated; the paper that showed scale alone unlocks new capabilities.
- [Transformer Explainer (Georgia Tech / Polo Club)](https://poloclub.github.io/transformer-explainer/) - runs a real GPT-2 in the browser and visualizes next-token probabilities live; used in exercise 2.
- [Tiktokenizer](https://tiktokenizer.vercel.app/) - interactive view of how text splits into tokens for each OpenAI model; used in exercise 2 and throughout track 01.
- [Andrej Karpathy — Intro to Large Language Models (1hr talk)](https://www.youtube.com/watch?v=zjkBMFhNj_g) - the single best plain-language overview of what an LLM is and how it's built; worth watching before track 01.
- [The Unreasonable Effectiveness of Recurrent Neural Networks (Karpathy, 2015)](https://karpathy.github.io/2015/05/21/rnn-effectiveness/) - the pre-transformer classic that makes "predict the next character" viscerally concrete; sets up module 04.
- [OpenAI Platform Docs — Introduction](https://platform.openai.com/docs/introduction) - the API surface you'll start calling in track 06; skim for orientation only.
- [ELIZA (Weizenbaum, 1966)](https://dl.acm.org/doi/10.1145/365153.365168) - the original chatbot paper, and the origin of the "ELIZA effect" covered in module 02.

## Next

[Module 01: Discriminative vs. Generative Models](../01-discriminative-vs-generative-models/README.md)
