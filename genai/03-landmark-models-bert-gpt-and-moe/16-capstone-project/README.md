# Module 16: Capstone Project — Fine-Tune, Route, and Document a Real Model

## What this capstone is

Modules 00-15 verified, with real code, three distinct architecture
families (encoder-only, decoder-only, and MoE-augmented decoder-only),
a real fine-tuning run (module 03), real in-context learning (module
08), a from-scratch MoE layer with a working load-balancing loss
(modules 12-13), a real large-model parameter derivation checked
against a lab's own published figures (module 14), and how to read —
and independently verify — a model card's claims (module 15). This
capstone asks you to combine several of those skills into one small
project with a real artifact at the end: a model you actually
fine-tuned or built, a genuine experiment comparing two approaches to
the same task, and a model card you write yourself, honestly, for what
you actually produced.

There is no dataset provided, no solution given, and no fixed
expected outcome — the point is running real experiments on a real
(if small) task and reporting real, possibly disappointing or
surprising results, exactly as this track's own modules did throughout.

## The project

### 1. Pick a real, small text classification or QA task

Something with a clear right answer you can measure accuracy or F1
against — a small labeled dataset you create yourself (even 40-60
labeled examples is enough for a real, honest comparison at this
scale), a public-domain dataset, or a genuinely useful task drawn from
this repository's own content (e.g., classifying genai module excerpts
by which track they belong to). State exactly what the task is, how
many examples you're using, and how you're splitting train/test.

### 2. Fine-tune a real encoder-only model on it (module 03's pattern)

Using module 03's fine-tuning approach, fine-tune a real, small,
open BERT-family checkpoint (`bert-base-uncased`, `distilbert-base-
uncased`, or similar) on your task. Report your actual training loss
curve and your actual held-out accuracy/F1 — not an assumed or
illustrative number.

### 3. Attempt the same task via prompting a decoder-only model, zero real training

Using module 08's in-context-learning pattern, attempt the identical
task by prompting a real, small, open decoder-only model (GPT-2 or
similar) with a handful of labeled examples in the prompt — zero
gradient updates, the same "zero weight changes" property module 08
verified via checksum. Report the same accuracy/F1 metric on the same
held-out set, so the two approaches are genuinely comparable.

### 4. Compare the two approaches honestly

Report both numbers side by side. If fine-tuning wins, say by how much
and speculate why, grounded in this track's actual findings (module 03:
fine-tuning directly updates weights toward the task; module 08: in-
context learning updates nothing). If prompting comes surprisingly
close — or wins — report that too, and don't discard or bury a result
that contradicts what you expected going in.

### 5. Extend your fine-tuned model with a small MoE layer, and measure the real trade-off

Using modules 12-13's from-scratch MoE mechanism, replace (or augment)
one feed-forward layer of a small model you control — this can be a
simplified setup rather than your full fine-tuned checkpoint if that's
more tractable, but it must be a real model you run, not a restatement
of modules 12-14's own numbers. Report your own measured total-vs-
active parameter counts (module 12's `count_params` pattern) and, if
you train it at all, whether adding the load-balancing auxiliary loss
(module 13) measurably changes your own router's expert-usage
distribution versus leaving it out — the same before/after comparison
module 13 ran, but on your own setup.

### 6. Write a real model card for what you built

Following module 15's verified anatomy, write an actual model card
(a markdown file) for your fine-tuned model from step 2: Intended
uses & limitations, a genuine Limitations and bias section (run at
least one probe for a failure mode specific to your task and report
what you actually find, the way module 15 reproduced BERT's own bias
claim rather than assuming it), Training data (what you used, how
much), and Evaluation results (your real accuracy/F1 from step 2, not
a rounded-up or idealized number).

## Constraints

- Every reported number must come from a real run on your actual task
  and data — no illustrative, assumed, or "typically expected" results.
  This capstone is specifically about generating your own evidence.
- Keep total compute reasonable — small checkpoints (BERT-base/
  DistilBERT, GPT-2-small), a small dataset (tens to low hundreds of
  examples), and a CPU-trainable MoE toy layer (module 12/13's own
  scale) are enough to produce real, honest, measurable results without
  needing GPU-scale training.
- Report your zero-shot/few-shot prompt exactly as used for step 3 —
  the specific examples and their order can genuinely change results,
  and reproducibility here means showing the actual prompt, not just
  the final number.

## How to know you've done it well

- Someone who's read this track but not run your experiments could
  follow your report and understand your task, both approaches you
  compared, and both real outcomes — including if one surprised you.
- Your step-4 comparison is honest even if the result isn't the one you
  expected going in — a close or reversed result, correctly reported
  and explained, is a more valuable finding than an assumed clean win
  for fine-tuning.
- Your step-5 MoE numbers are your own measured values (parameter
  counts, expert-usage distribution with vs. without the load-balancing
  loss), not module 12-14's numbers restated.
- Your model card (step 6) contains at least one Limitations/bias
  finding you actually checked yourself on your own model and task —
  not a generic disclaimer copied from another model's card.

## Next

[Track 04: Training, Fine-Tuning, and Alignment](../../04-training-fine-tuning-and-alignment/README.md)
