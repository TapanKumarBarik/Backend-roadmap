# Module 17: Capstone Project — Train, Benchmark, and Report on a Domain Tokenizer

## What this capstone is

Modules 00-16 built four tokenization algorithms from scratch and by
library, measured real vocabulary-size and multilingual tradeoffs,
found genuine security-relevant special-token behaviors, and quantified
cost and context-window consequences. This capstone asks you to put all
of it together on one real, self-chosen text domain: **train your own
tokenizer, benchmark it honestly against production tokenizers, and
write up what you found — including the results that don't flatter your
own tokenizer.**

There is no toy corpus provided. The value of this exercise depends
entirely on using real text with real quirks.

## The project

### 1. Pick a real domain corpus

Something with genuine internal structure and enough volume to train
on meaningfully (a few hundred KB to a few MB of plain text is enough):
your own codebase's source files, a technical field you work in
(medical, legal, a specific programming ecosystem), a language other
than English, or a mix of code and prose (e.g., this very repository's
`genai/` markdown files). Do not use a generic English corpus — the
whole point is testing whether a *domain-specific* tokenizer earns its
keep, which only shows up against domain-specific text.

### 2. Train a tokenizer, and justify the algorithm choice

Using `sentencepiece` (module 05, module 06) or the `tokenizers`
library, train a BPE **and** a Unigram LM tokenizer on your corpus at a
vocabulary size you choose and justify (module 08's tradeoffs). Report:

- Why you picked that vocabulary size (tie it to module 08's
  embedding-cost tradeoff, not just "it seemed reasonable").
- The measured tokens-per-word (or tokens-per-line, for code) for both
  algorithms on a **held-out** sample of your corpus not used in
  training.
- Which algorithm won on this specific corpus, and your best explanation
  for why, grounded in modules 03-06's mechanics — not a guess.

### 3. Benchmark against real production tokenizers

Using `tiktoken`'s `cl100k_base` and at least one Hugging Face tokenizer
(module 07's pattern), measure tokens-per-word on the **same held-out
sample** for every tokenizer, your own included. Build a table like
module 07's, and answer honestly: did your domain-specific tokenizer
actually beat the general-purpose ones on your own corpus? By how much?
If it didn't win, say so — a negative result reported honestly is more
valuable than a flattering one, and is common: general-purpose
tokenizers trained on enormous, diverse corpora are a genuinely high
bar to beat with a small custom training run.

### 4. Stress-test for the pitfalls from module 13

Run your own tokenizer against:

- A handful of numbers, and check whether digit-chunking is
  place-value-aligned or exhibits the same context-dependent
  inconsistency verified in module 13.
- A handful of rare/unusual strings from your corpus (proper nouns,
  identifiers, or symbols that appear only once or twice) — check
  whether any produce disproportionately many tokens (a sign of
  under-coverage) or, for WordPiece specifically, an outright `[UNK]`
  (module 05's whole-word failure mode).
- If your corpus includes any non-Latin-script text, measure and
  report its chars-per-token ratio (module 14) alongside the
  Latin-script portion's, and compare the gap to what `cl100k_base`
  showed in module 14's cross-language experiment.

### 5. Cost and context-window impact, quantified

Using module 12's cost-calculator pattern and module 11's context-window
arithmetic, compute: for a realistic request against your domain (a
prompt built from a chunk of your corpus, sent to a real API), how much
does the tokenizer choice change the actual token count, and therefore
the actual cost and the fraction of a real context window consumed?
Express this as a concrete number ("switching from `cl100k_base` to my
trained tokenizer changes a typical 2,000-word document from N tokens
to M tokens, a K% difference") — not a general impression.

### 6. Write-up

A short document (1-3 pages) covering, in order: the corpus and why you
chose it, the vocabulary-size decision and its justification, the
benchmark table (your tokenizer vs. at least two production ones), the
pitfall stress-test findings, the cost/context-window impact, and a
final honest verdict: was training a custom tokenizer worth it for this
specific corpus, or would you recommend using an off-the-shelf one in
practice? Both answers are legitimate outcomes.

## Constraints

- Every quantitative claim must come from code you actually ran on your
  actual corpus — no illustrative or assumed numbers. This capstone is
  specifically about replacing every earlier module's example numbers
  with your own, freshly measured ones.
- Use a held-out sample (text your tokenizer wasn't trained on) for
  every benchmark comparison in sections 2-3 — training-set performance
  overstates real-world tokenization quality and would make the
  comparison meaningless.
- Keep the write-up under 3 pages. Compressing your findings into a
  clear verdict is part of the exercise.

## How to know you've done it well

- Someone who hasn't read this track could follow your benchmark table
  and reach the same conclusion you did.
- You can point to a specific module (03-16) that explains *why* each
  of your measured results came out the way it did — not just what the
  number was.
- Your write-up includes at least one result that surprised you, or
  didn't go the way you expected before running the experiment.
- The final verdict is a real recommendation, not a hedge — "it depends"
  is only acceptable if you specify exactly what it depends on, backed
  by the numbers you measured.

## Next

[Track 02: Transformer Architecture](../../02-transformer-architecture/README.md)
