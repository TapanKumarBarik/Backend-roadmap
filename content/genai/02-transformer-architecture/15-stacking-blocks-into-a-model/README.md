# Module 15: Stacking Blocks Into a Model

## Why this matters

Module 14 verified one complete transformer block preserves shape and
composes cleanly. This module builds the actual model: embeddings in,
`N` independent stacked blocks, a final layer norm, and an output
projection back to vocabulary logits (track 01 module 15's territory).
Along the way, it verifies a real, practically important sanity check
every model-training engineer should know — at random initialization,
a language model's loss should be close to `ln(vocab_size)` — and uses
it to catch a genuine, easy-to-make bug: PyTorch's default embedding
initialization is *wrong* for this architecture, and the sanity check
catches it directly, numerically, not as a vague warning.

## Concepts

### The full model: embeddings, stacked blocks, output head

```python
import torch
import torch.nn as nn

class MiniTransformerLM(nn.Module):
    def __init__(self, vocab_size, d_model, num_heads, d_ff, num_layers, max_len=64):
        super().__init__()
        self.tok_emb = nn.Embedding(vocab_size, d_model)   # module 02
        self.pos_emb = nn.Embedding(max_len, d_model)      # module 09-11 (simplified)
        self.blocks = nn.ModuleList(
            [TransformerBlock(d_model, num_heads, d_ff) for _ in range(num_layers)]
        )                                                   # module 14, repeated
        self.ln_f = nn.LayerNorm(d_model)                   # module 13
        self.head = nn.Linear(d_model, vocab_size, bias=False)
        self.head.weight = self.tok_emb.weight              # weight tying, module 02

    def forward(self, idx):
        n = idx.shape[1]
        pos = torch.arange(n).unsqueeze(0)
        x = self.tok_emb(idx) + self.pos_emb(pos)
        mask = torch.triu(torch.ones(n, n) * float("-inf"), diagonal=1)  # module 07
        for b in self.blocks:
            x = b(x, attn_mask=mask)
        x = self.ln_f(x)
        return self.head(x)
```

Note `self.blocks` is a list of `num_layers` **independent**
`TransformerBlock` instances — each with its own separately-initialized
`Wq`/`Wk`/`Wv`/`Wo` and FFN weights, not the same block reused. "Stacking"
means feeding the output of one block directly as the input to the
next, in sequence — exactly the loop module 14 already verified
preserves shape.

### Verified: parameter count scales linearly with depth

```python
vocab_size, d_model, num_heads, d_ff = 100, 32, 4, 128
for num_layers in [1, 2, 4, 8]:
    model = MiniTransformerLM(vocab_size, d_model, num_heads, d_ff, num_layers)
    print(num_layers, sum(p.numel() for p in model.parameters()))
```

Verified output:

```
num_layers=1:  18,016
num_layers=2:  30,720
num_layers=4:  56,128
num_layers=8:  106,944
```

Each additional layer adds a roughly constant chunk of parameters
(modules 08 and 12's attention + FFN totals, per block) — doubling the
layer count from 4 to 8 very nearly doubles the layer-contributed
parameters, with the fixed embedding/output-head cost staying constant
regardless of depth. This is the direct, checkable reason "how many
layers" is one of the primary levers for model size, alongside `d_model`
(track 01 module 08's embedding-cost lever) and vocabulary size.

### A real sanity check: loss at random initialization should be close to `ln(vocab_size)`

Before any training happens, an untrained model's predictions should be
close to uniformly random over the vocabulary — and the cross-entropy
loss of a uniform prediction over `V` possible classes has an exact,
known value: `ln(V)` (this follows directly from track 01 module 15's
entropy formula — a perfectly uniform distribution's cross-entropy
against any single correct answer is exactly its entropy, `ln(V)` for
`V` equally likely options). This is a real, widely-used practitioner
sanity check (used in, among other places, Andrej Karpathy's nanoGPT):
if a freshly initialized model's loss is wildly different from
`ln(vocab_size)`, something about initialization is likely wrong,
before a single training step has even run.

### Verified: the sanity check catches a real bug

```python
model = MiniTransformerLM(vocab_size=100, d_model=32, num_heads=4, d_ff=128, num_layers=4)
idx = torch.randint(0, 100, (2, 10))
logits = model(idx)
targets = torch.randint(0, 100, (2, 10))
loss = nn.functional.cross_entropy(logits.view(-1, 100), targets.view(-1))
print(loss.item(), "vs ln(100) =", 4.605)
```

Verified output: **`19.71`** versus an expected `~4.61` — off by more
than 4x, a real red flag. Investigating why: PyTorch's default
`nn.Embedding` initializes weights from a standard normal distribution
(`std=1.0`) — verified directly (`model.tok_emb.weight.std()` returns
`~1.0`). This is far larger than transformer implementations typically
use (GPT-2's own initialization uses `std=0.02`), and it produces wildly
large logits:

```python
print(logits.std().item())    # verified: ~6.06
```

Verified: logits with standard deviation ~6 are large enough that
softmax (track 01 module 15, module 06's scaling discussion) becomes
overconfident even on completely untrained, random weights — producing
a much higher loss than the uniform-distribution baseline predicts,
since a confidently wrong prediction is penalized far more heavily than
a uniformly uncertain one. Re-initializing the embedding with GPT-2's
actual convention:

```python
with torch.no_grad():
    model.tok_emb.weight.normal_(mean=0.0, std=0.02)

logits2 = model(idx)
loss2 = nn.functional.cross_entropy(logits2.view(-1, 100), targets.view(-1))
print(logits2.std().item(), loss2.item())
```

Verified output: logits standard deviation drops to **`~0.11`**, and
loss becomes **`4.62`** — matching `ln(100) = 4.605` almost exactly.
**This is a real, catchable bug**, caught purely by this one sanity
check: using a framework's default initialization instead of the
initialization scale a real architecture actually expects can silently
produce a model that starts training from a much worse point, and the
`ln(vocab_size)` check catches it in seconds, before wasting any real
training compute investigating why early training looks strange.

## Reference

```
 Check                              Expected            Verified in this module
 ─────────────────────────────       ────────────         ──────────────────────
 Loss at random init                  ~ln(vocab_size)       19.71 (broken default
                                                              init) vs. 4.62 (fixed,
                                                              GPT-2-style init) vs.
                                                              4.605 = ln(100) exactly
 Parameter count vs. depth            roughly linear         18,016 / 30,720 /
                                                              56,128 / 106,944 for
                                                              1/2/4/8 layers
```

```
 Default nn.Embedding init:   std = 1.0     -> logit std ~6   -> loss ~19.7  (BROKEN)
 GPT-2-style init:            std = 0.02    -> logit std ~0.11 -> loss ~4.6  (matches
                                                                    ln(vocab_size))
```

## Hands-on exercises

### Exercise 1 — reproduce the full model and the broken-initialization bug

Build the exact `MiniTransformerLM` above (reusing module 14's
`TransformerBlock`), run the loss-at-init check with the default
`nn.Embedding` initialization, and confirm it comes out far from
`ln(vocab_size)`. Then apply the `std=0.02` reinitialization and
confirm the loss lands close to the expected value.

### Exercise 2 — reproduce the parameter-count-vs-depth measurement

Run the parameter-count comparison at your own chosen `d_model` and
depths, and confirm the per-layer parameter cost stays roughly constant
as depth increases (compute the difference between consecutive depths
and confirm it's close to constant).

### Exercise 3 — find the actual initialization scale a check like this would flag

Try a few different embedding initialization standard deviations
(`0.5`, `0.1`, `0.05`, `0.02`, `0.01`) and measure the resulting
loss-at-init for each. Identify roughly which range brings the loss
close to `ln(vocab_size)`, and connect this to why real model
implementations specify an exact initialization scale rather than
relying on a framework's default.

## Independent challenge

A teammate is debugging a custom model whose training loss starts at a
value they don't recognize as unusual, and training seems to be
"working" (loss goes down over time) but the final model performs
poorly. Using this module's verified sanity check, write two or three
sentences on what you'd check first, before assuming the problem is
something more complex like a data or architecture bug.

<details><summary>Discussion</summary>

The first, cheapest check is computing `ln(vocab_size)` and comparing
it to the loss at step zero (before any training) — verified in this
module, a mismatch here (like the ~19.7 vs. ~4.6 gap found above) is a
strong, immediate signal that something about initialization (or,
separately, the loss computation itself — e.g., an off-by-one in label
indices, or missing masking) is wrong, catchable in seconds rather than
after a long, expensive training run whose "loss goes down" trend can
mask a poor starting point rather than genuinely good learning. Loss
decreasing over time doesn't confirm the model started from a sound
place — a model can improve from a badly broken initialization and
still end up performing worse than one that started well and improved
by the same relative amount.

</details>

## Common mistakes & troubleshooting

- **Using a framework's default layer initialization without checking
  whether it matches the architecture's expected scale.** Verified
  above: PyTorch's default `nn.Embedding` (`std=1.0`) is roughly 50x
  larger than GPT-2's actual convention (`std=0.02`), producing a
  measurably broken loss-at-init.
- **Not running the `ln(vocab_size)` sanity check before starting a
  real training run.** It costs a single forward pass and catches a
  real, common class of initialization bugs immediately, verified
  directly above.
- **Assuming "loss goes down during training" confirms initialization
  was fine.** It doesn't — a model can improve from a bad starting
  point and still underperform relative to one that started at the
  expected baseline.
- **Forgetting each stacked block has independent parameters.**
  "Stacking N blocks" means N separately-initialized, separately-learned
  blocks — not the same block's weights applied repeatedly (that would
  be parameter *sharing*, a different, deliberate design choice some
  models do use, but not the default assumption).

## Checkpoint quiz

1. What loss value should an untrained language model's cross-entropy
   loss be close to, and why (in terms of the underlying probability
   distribution)?
2. What did the verified experiment find wrong with PyTorch's default
   `nn.Embedding` initialization for this architecture?
3. What was the logit standard deviation under the broken versus fixed
   initialization, and how did that connect to the loss values
   observed?
4. Does parameter count scale linearly, sub-linearly, or
   super-linearly with the number of stacked blocks, based on the
   verified measurement?
5. Why is "the loss goes down during training" not sufficient evidence
   that initialization was correct?

<details><summary>Answers</summary>

1. `ln(vocab_size)` — because an untrained model's predictions should
   be close to uniformly random over the vocabulary, and the
   cross-entropy of a uniform distribution over `V` equally likely
   options against any single correct answer equals that distribution's
   entropy, `ln(V)` (track 01 module 15's entropy formula, applied
   here).
2. That its default standard deviation (`1.0`) is far too large for
   this architecture, producing logits with standard deviation ~6 —
   large enough to make softmax overconfident even on completely
   untrained weights, pushing the loss to ~19.71 instead of the
   expected ~4.605.
3. Broken initialization: logit std ~6.06, loss ~19.71. Fixed
   (`std=0.02`) initialization: logit std ~0.11, loss ~4.62 — very
   close to `ln(100) = 4.605`. The smaller, more appropriately-scaled
   logits produced a loss matching the theoretical uniform-distribution
   baseline almost exactly.
4. Roughly linearly — verified: parameter counts of 18,016 / 30,720 /
   56,128 / 106,944 for 1/2/4/8 layers show a roughly constant
   per-layer cost added at each step, consistent with each block
   contributing an independent, fixed-size chunk of parameters.
5. Because a model can improve relative to a bad starting point while
   still ending up worse overall than a model that started from the
   theoretically expected baseline and improved by a comparable
   amount — a decreasing loss curve doesn't retroactively confirm the
   starting point was sound; only a direct check like `ln(vocab_size)`
   at step zero does.

</details>

## Further reading & sources

- [Attention Is All You Need (Vaswani et al., 2017)](https://arxiv.org/abs/1706.03762) - Section 3.1's encoder/decoder stacks of `N` identical (in structure, not shared weights) layers, the pattern this module assembles and verifies.
- [nanoGPT (Andrej Karpathy, GitHub)](https://github.com/karpathy/nanoGPT) - a widely-referenced, minimal real GPT implementation using exactly this loss-at-init sanity check and the `std=0.02` initialization convention verified in this module.
- [Language Models are Unsupervised Multitask Learners (Radford et al., 2019)](https://cdn.openai.com/better-language-models/language_models_are_unsupervised_multitask_learners.pdf) - the GPT-2 paper; its released implementation uses the `std=0.02` embedding initialization referenced throughout this module.
- [Track 01, Module 15: Next-Token Prediction: From Logits to Probabilities](../../01-tokens-and-language-modeling/15-next-token-prediction-from-logits-to-probabilities/README.md) - the entropy formula this module's `ln(vocab_size)` sanity check derives from directly.
- [Track 02, Module 14: The Complete Transformer Block](../14-the-complete-transformer-block/README.md) - the `TransformerBlock` class this module stacks repeatedly to build the full model.

## Next

[Module 16: Encoder-Only vs. Decoder-Only vs. Encoder-Decoder](../16-encoder-only-vs-decoder-only-vs-encoder-decoder/README.md)
