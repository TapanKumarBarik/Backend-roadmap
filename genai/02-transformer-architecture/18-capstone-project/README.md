# Module 18: Capstone Project — Build, Break, and Report on a Mini Transformer

## What this capstone is

Modules 00-17 built and verified every piece of a transformer in
isolation — path length, dot products, Q/K/V, masking, positional
encoding, the FFN, residual connections, layer normalization — then
assembled them into a model that actually trains (module 17). This
capstone asks you to do something none of the previous modules did:
**deliberately break individual architectural components, one at a
time, and measure what actually happens** — turning this track's many
individually-verified claims ("residual connections prevent gradient
collapse," "positional encoding is necessary for order-sensitivity")
into a single, coherent set of ablation experiments run on one model
you build and train yourself.

There is no toy corpus provided, no solution given, and no fixed list
of ablations you must run beyond the required set below — the point is
running real experiments and reporting real, possibly surprising
results.

## The project

### 1. Pick a real, small text corpus

Something with genuine structure worth learning: your own writing, a
public-domain book (a few chapters), a technical document, or — a good
option if nothing else is at hand — this repository's own `genai/`
markdown content. A few hundred KB is enough. Character-level or a
simple word-level tokenizer (track 01) both work; state which you used
and why.

### 2. Build and train a working baseline model

Using module 17's pattern (module 15's `MiniTransformerLM` plus a
training loop), train a baseline model on your corpus until loss drops
substantially and clearly below the `ln(vocab_size)` sanity-check value
(module 15). Report: your architecture's `d_model`, `num_heads`,
`num_layers`, `d_ff`; your final training loss; and a sample of
generated text, honestly reported (including any repetition or
incoherence you observe, not just a cherry-picked good example).

### 3. Run the required ablations, and measure real numbers for each

For each ablation, train an otherwise-identical model (same
hyperparameters, same corpus, same number of training steps, same
random seed where possible) with exactly one change, and report the
resulting training loss curve and a generated sample:

- **No positional encoding.** Remove the positional embedding entirely
  (module 09-11). Predict, before running it, what you expect to
  happen, then run it and compare against your prediction.
- **No residual connections.** Remove the `x +` in each sub-layer
  (module 13). Predict the expected effect on training (module 13's
  verified gradient-collapse finding at depth) before running it.
- **No causal mask (bidirectional self-attention on a next-token
  prediction task).** Remove the mask (module 07) while keeping the
  next-token-prediction training objective. Predict what you expect —
  this is a genuinely interesting case, since the "cheating" module 07
  warned about becomes directly measurable here.
- **A meaningfully shallower or deeper model** (module 15's depth
  experiment, but on your own real corpus instead of a toy one).

### 4. Write up what actually happened, including surprises

For each ablation, report: what you predicted before running it (using
this track's verified findings from the relevant module), what
actually happened, and — where they differ — your best explanation for
the gap. A prediction that turned out wrong is a more valuable finding
than one that matched perfectly; report both kinds honestly.

### 5. One deliberate architectural change of your own choosing

Beyond the required ablations, make one change this track didn't
explicitly test — a different `d_ff`/`d_model` ratio (module 12), a
different positional scheme (RoPE instead of sinusoidal, or vice versa,
modules 10-11), tied vs. untied embeddings (module 02), or something
else you're curious about. Measure and report its effect the same way.

## Constraints

- Every reported number must come from a real run on your actual
  corpus — no illustrative or assumed results. This capstone is
  specifically about generating your own evidence, not reusing this
  track's example numbers.
- Keep total compute reasonable — a CPU-trainable model (module 17's
  scale, or modestly larger) run for a few hundred to a few thousand
  steps per configuration is enough to see real, measurable
  differences; there's no need for GPU-scale training to get honest
  results.
- State your prediction for each required ablation **before** running
  it, in your write-up, so the comparison between prediction and
  outcome is genuine rather than reconstructed after the fact.

## How to know you've done it well

- Someone who's read this track but not run your experiments could
  follow your report and understand both what you expected and what
  actually happened, for every ablation.
- At least one ablation's actual result surprised you relative to your
  stated prediction — and you can offer a real explanation for the gap,
  grounded in a specific module's mechanics, not a guess.
- Your report distinguishes between "this ablation made training
  fail outright" (loss stays near `ln(vocab_size)` or diverges) and
  "this ablation made training measurably worse but still functional"
  (loss decreases, just less than the baseline) — these are different
  outcomes worth reporting precisely, not collapsed into "it got worse."
- The no-causal-mask ablation specifically addresses whether the model
  is visibly "cheating" (module 07) — reaching an unusually low loss
  very quickly, precisely because it can see the answer it's supposed
  to predict.

## Next

[Track 03: Landmark Models — BERT, GPT & Mixture-of-Experts](../../03-landmark-models-bert-gpt-and-moe/README.md)
