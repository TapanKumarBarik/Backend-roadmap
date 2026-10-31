# Module 12: LoRA: Low-Rank Adaptation

## Why this matters

Modules 08-11 covered *what* to optimize a model toward after
pretraining — a reward model's preferences (module 08), PPO's RL loop
(module 09), DPO's simpler closed-form loss (module 10), or a
constitution the model critiques itself against (module 11). None of
those modules said anything about *how many of the model's weights get
touched* while doing it. That is a separate, orthogonal question, and
it is this module's entire subject: full fine-tuning updates every
parameter in the model, which for anything past toy scale means
storing a full optimizer state and gradient for billions of numbers.
LoRA (Low-Rank Adaptation, Hu et al. 2021) is the standard answer to
"what if we don't need to update all of them" — freeze the pretrained
weight matrix entirely and add a small, trainable *low-rank* detour
next to it. This module builds that detour from scratch, counts real
parameters to show exactly how small "small" is, and then
cross-checks the same finding against the actual `peft` library other
teams use in production, so the claim rests on two independent
measurements rather than one.

## Concepts

### The idea: freeze the big matrix, train a small detour next to it

A linear layer computes `y = xW + b`. Full fine-tuning updates every
entry of `W` directly. LoRA instead freezes `W` completely and adds a
correction term built from two much smaller matrices, `A` and `B`,
whose product approximates the update `W` would have needed:

```
 FULL FINE-TUNING                    LoRA
 ───────────────────                 ───────────────────────────
 x -> [ W  (d x d), TRAINABLE ] -> y  x -> [ W (d x d), FROZEN ] ─┐
                                                                   ├─► + ─► y
      every entry of W gets a        x -> [ A (r x d) ] -> [ B (d x r) ]
      gradient and an optimizer            (r << d, BOTH trainable,
      slot                                  their product has the
                                             same shape as W's update)
```

`r`, the *rank*, is a small number (4, 8, 16 — chosen by the user) far
smaller than the layer's own dimension `d`. `A` maps the input down to
an `r`-dimensional bottleneck; `B` maps it back up to the output
dimension. The product `A @ B` (or `x @ A.T @ B.T` per-input) has the
same shape as a full update to `W` would, but it is built from only
`r*(d_in + d_out)` numbers instead of `d_in*d_out`. `B` is
conventionally initialized to all zeros, so at the very start of
training the LoRA path contributes exactly nothing and the wrapped
layer's output is identical to the frozen base layer alone — training
then nudges `A` and `B` away from that no-op starting point.

### Verified, from scratch: trainable parameters vs. a frozen base layer, across ranks

```python
import torch
import torch.nn as nn

torch.manual_seed(0)

class LoRALinear(nn.Module):
    """Wraps a frozen nn.Linear and adds a trainable low-rank A @ B update."""
    def __init__(self, base: nn.Linear, r: int, alpha: float = None):
        super().__init__()
        self.base = base
        for p in self.base.parameters():
            p.requires_grad_(False)
        out_features, in_features = base.weight.shape
        self.r = r
        self.alpha = alpha if alpha is not None else r
        self.scaling = self.alpha / self.r
        self.A = nn.Parameter(torch.randn(r, in_features) * 0.01)
        self.B = nn.Parameter(torch.zeros(out_features, r))  # zero init: starts as a no-op

    def forward(self, x):
        base_out = self.base(x)
        lora_out = (x @ self.A.T) @ self.B.T
        return base_out + self.scaling * lora_out

def count_params(params):
    return sum(p.numel() for p in params)

in_features, out_features = 768, 768  # gpt2's attention projection shape
base_layer = nn.Linear(in_features, out_features)
frozen_params = count_params(base_layer.parameters())
print(f"Frozen base nn.Linear({in_features}, {out_features}) params:", frozen_params)

for r in (1, 4, 8, 16, 64):
    lora = LoRALinear(nn.Linear(in_features, out_features), r=r)
    trainable = count_params([lora.A, lora.B])
    ratio = trainable / frozen_params
    print(f"  r={r:>3}  trainable A+B params = {trainable:>7}  "
          f"ratio to frozen base = {ratio:.5f}  ({ratio*100:.3f}%)")
```

Verified output:

```
Frozen base nn.Linear(768, 768) params: 590592
  r=  1  trainable A+B params =    1536  ratio to frozen base = 0.00260  (0.260%)
  r=  4  trainable A+B params =    6144  ratio to frozen base = 0.01040  (1.040%)
  r=  8  trainable A+B params =   12288  ratio to frozen base = 0.02081  (2.081%)
  r= 16  trainable A+B params =   24576  ratio to frozen base = 0.04161  (4.161%)
  r= 64  trainable A+B params =   98304  ratio to frozen base = 0.16645  (16.645%)
```

At `r=8` — a common real-world default — this single layer trains
**about 2% of its own frozen weight's parameter count**. Even at
`r=64` (unusually large in practice), it's still under 17%. The ratio
grows linearly with `r`, but `r` stays a small, chosen constant while
the frozen layer's parameter count (`d_in * d_out`) grows
*quadratically* with the layer's width — so the trainable fraction
gets smaller, not larger, as models scale up.

### Verified: zero-init B means training starts as a true no-op, and gradients only reach A and B

```python
x = torch.randn(2, in_features)
lora = LoRALinear(base_layer, r=8)
with torch.no_grad():
    base_only = base_layer(x)
    with_lora = lora(x)
    max_abs_diff = (base_only - with_lora).abs().max().item()
print("max abs diff, base-only output vs LoRA-wrapped output at init:", max_abs_diff)

out = lora(x).sum()
out.backward()
print("base.weight.requires_grad:", lora.base.weight.requires_grad)
print("base.weight.grad is None:", lora.base.weight.grad is None)
print("A.grad is None:", lora.A.grad is None)
print("B.grad is None:", lora.B.grad is None)
```

Verified output:

```
max abs diff, base-only output vs LoRA-wrapped output at init: 0.0
base.weight.requires_grad: False
base.weight.grad is None: True
A.grad is None: False
B.grad is None: False
```

The output difference is exactly `0.0` at initialization — not
approximately zero, exactly, because `B` starts at all zeros and
`scaling * (x @ A.T @ B.T)` is therefore exactly zero regardless of
what `A` contains. After a backward pass, the frozen base weight has
no gradient at all (`grad is None`), while `A` and `B` both received
real gradients. This is the whole mechanism in two verified facts:
nothing about the base model changes, either in its forward output at
the start or in what receives gradient signal during training.

### Cross-check with the real `peft` library on a real model

The hand-rolled version above proves the concept works; it does not
prove this is what production tooling actually does. `peft`'s
`LoraConfig` + `get_peft_model` wraps real named layers of a real
Hugging Face model the same way, and reports its own trainable count
via `print_trainable_parameters()` — an independent measurement, from
different code, that should agree with the hand-rolled math above:

```python
from transformers import AutoModelForCausalLM
from peft import LoraConfig, get_peft_model

model = AutoModelForCausalLM.from_pretrained("gpt2")
print("Full gpt2 parameter count (before any wrapping):",
      sum(p.numel() for p in model.parameters()))

for r in (4, 8, 16):
    m = AutoModelForCausalLM.from_pretrained("gpt2")
    config = LoraConfig(
        r=r, lora_alpha=r, target_modules=["c_attn"],
        lora_dropout=0.0, bias="none", task_type="CAUSAL_LM",
    )
    peft_model = get_peft_model(m, config)
    print(f"--- r={r} ---")
    peft_model.print_trainable_parameters()
```

Verified output:

```
Full gpt2 parameter count (before any wrapping): 124439808

--- r=4 ---
trainable params: 147,456 || all params: 124,587,264 || trainable%: 0.1184

--- r=8 ---
trainable params: 294,912 || all params: 124,734,720 || trainable%: 0.2364

--- r=16 ---
trainable params: 589,824 || all params: 125,029,632 || trainable%: 0.4717
```

Real gpt2 has 124,439,808 parameters. Attaching real LoRA adapters
(via `peft`, not the hand-rolled version) to just its `c_attn`
projection across all 12 layers, at `r=8`, trains **294,912 parameters
— 0.24% of the model.** That is the same order of magnitude the
from-scratch section found for a single layer at `r=8` (2.08%; gpt2's
number is smaller because only one projection per block is targeted
here, out of several linear layers each block has). Two independent
implementations, two independently computed numbers, the same
conclusion: LoRA trains a genuinely tiny fraction of the base model.
One real implementation detail worth knowing if you inspect `peft`'s
output directly — running this exact code prints a `UserWarning`
about `fan_in_fan_out`, because gpt2's attention projection is
implemented as HF's `Conv1D` (a transposed-weight variant), not a
plain `nn.Linear`; `peft` detects this and adjusts automatically. It
is a real, harmless quirk of gpt2's implementation, not a bug in the
adapter math above.

## Reference

```
 Term                 Meaning
 ───────────────────  ──────────────────────────────────────────────
 Base weight W        The pretrained weight matrix; frozen entirely
                       under LoRA (verified: 0 gradient after backward)
 Rank r                Bottleneck dimension of A and B; small, chosen
                       by the user (4-64 typical); controls both
                       capacity and trainable-parameter count directly
 A, B matrices         The trainable low-rank pair; A projects down to
                       r dimensions, B projects back up to the output
                       dimension; their product approximates a full
                       weight update using far fewer numbers
 alpha / scaling       A scaling factor (alpha/r) applied to the LoRA
                       path's output; controls how strongly the
                       adapter's update contributes relative to r
 Zero-init on B        Standard convention ensuring the adapter starts
                       as an exact no-op (verified: 0.0 output diff)
 target_modules        Which named layers get wrapped with LoRA (e.g.
                       just attention projections, or also MLP layers);
                       changes total trainable count directly
 trainable%            peft's own reported ratio of trainable to total
                       parameters; this module's second, independent
                       verification of the "tiny fraction" claim
```

## Hands-on exercises

### 1. Reproduce the rank sweep on the from-scratch `LoRALinear`, then target a different `peft` layer

Re-run the from-scratch parameter sweep with `in_features=out_features
=1024` instead of 768 and confirm the frozen-parameter count and every
ratio scale accordingly (the ratios themselves should not change,
since both frozen and trainable counts scale together with r fixed).
Then modify the `peft` example's `target_modules` to `["c_attn",
"c_proj"]` (both a model's fused-attention projection and its output
projection) and confirm `print_trainable_parameters()` reports a
larger trainable count and percentage than the `c_attn`-only version
above at the same `r`.

### 2. Verify the zero-init claim breaks if you change the initialization

Modify the from-scratch `LoRALinear` to initialize `B` with
`torch.randn(...) * 0.01` instead of `torch.zeros(...)`, and re-run
the "max abs diff at init" check. Confirm the difference is no longer
exactly `0.0`. Explain, in your own words, why the standard
convention (zero-init `B`) matters for training stability — what
would change about the very first forward pass of a freshly-wrapped
pretrained model if the adapter did not start as a no-op?

### 3. Measure trainable-parameter count as a fraction of a *larger* real model

Repeat the `peft` cross-check on `gpt2-medium` instead of `gpt2` (both
are cached locally). Report the full parameter count, and the
`trainable%` at `r=8` on `target_modules=["c_attn"]`. Confirm the
absolute trainable parameter count changes very little compared to
`gpt2`, while the trainable *percentage* drops — because the model
grew but `r` did not.

## Independent challenge

A teammate says: "We should always use the largest rank we can afford,
since a bigger `r` means the adapter can express any update better —
there's no real downside except a few more trainable parameters."
Using this module's verified findings, evaluate that claim.

<details><summary>Discussion</summary>

The core fact is right but incompletely reasoned. This module's rank
sweep verified that increasing `r` from 1 to 64 increases the
trainable parameter count linearly and predictably (1,536 to 98,304 in
the from-scratch example) — so yes, a bigger `r` gives the adapter
more capacity to represent complex updates, and the "cost" in
trainable parameters is real but stays orders of magnitude below the
frozen base layer even at `r=64` (16.6% of one layer, and even less of
a whole model, per the `peft` cross-check). Where the claim oversimplifies:
"a few more trainable parameters" is not the only cost. More trainable
parameters means more optimizer state (Adam-style optimizers store two
extra numbers per trainable parameter), a larger adapter checkpoint to
store and distribute per fine-tuned task, and — practically —
diminishing returns, since the paper this module cites found accuracy
often plateaus well before `r` gets large, meaning the "better
expression" benefit doesn't scale as cleanly as the parameter count
does. The right frame, grounded in what was actually measured here: `r`
is a real capacity/cost dial, worth tuning per task rather than
maximizing by default, and this module's own numbers show exactly how
directly it's priced in trainable parameters.

</details>

## Common mistakes & troubleshooting

- **Assuming LoRA changes the base model's weights at all.** It
  doesn't, ever, during training — this module verified `base.weight
  .grad is None` after a real backward pass. Only `A` and `B` receive
  gradients. Confusing "the model behaves differently after LoRA
  fine-tuning" with "the base weights changed" is a common
  misunderstanding; the behavior change comes entirely from the added
  adapter path.
- **Forgetting to zero-init B (or an equivalent no-op start) and being
  confused why loss looks strange in step 1.** Exercise 2 shows
  directly what changes if this convention isn't followed: the
  adapter no longer starts as an identity, so the wrapped layer's very
  first forward pass on a pretrained model already differs from the
  base model's, before any training signal has had a chance to guide
  that difference usefully.
- **Comparing a from-scratch single-layer trainable ratio directly
  against a whole-model `trainable%` from `peft` without noting the
  scope difference.** This module's single wrapped layer at `r=8`
  showed ~2.08%; gpt2's whole-model `trainable%` at the same `r` was
  0.24% — both correct, but not the same measurement: one is "this one
  layer's trainable fraction," the other is "this fraction of every
  parameter in the entire model," most of which (embeddings, LayerNorm,
  other projections) was never wrapped at all.
- **Treating `target_modules` as unimportant.** Exercise 1 showed
  directly that changing which named layers get wrapped changes the
  total trainable count — LoRA's "how small is small" answer is a
  direct function of *which* layers you choose to attach adapters to,
  not a fixed property of the technique itself.
- **Assuming a higher rank is always strictly better with no
  trade-off.** See the Independent challenge — more trainable
  parameters is a real, measurable cost (optimizer state, checkpoint
  size), even though it stays small relative to the frozen base.

## Checkpoint quiz

1. In the from-scratch verification, why was the output difference
   between the base-only layer and the LoRA-wrapped layer exactly
   `0.0` at initialization, not just approximately small?
2. What did `base.weight.grad is None` after a real backward pass
   verify about which parameters receive gradient signal under LoRA?
3. At `r=8`, the from-scratch single-layer example showed a ~2.08%
   trainable ratio, while the real `peft`-wrapped gpt2 model showed a
   0.24% `trainable%` at the same `r`. Why do these two real, correct
   numbers differ?
4. What two matrices does LoRA add alongside a frozen weight, and
   which dimension (shared by both) directly controls the trainable
   parameter count?
5. Why does gpt2 specifically trigger a `fan_in_fan_out` warning when
   wrapped with `peft`'s `LoraConfig`, and does it indicate a bug?

<details><summary>Answers</summary>

1. Because `B` is initialized to all zeros, so `scaling * (x @ A.T @
   B.T)` evaluates to exactly zero regardless of what `A` contains —
   the LoRA path contributes nothing at all until training moves `B`
   away from zero.
2. That only the added `A` and `B` matrices are trainable — the frozen
   base weight's `.grad` was confirmed to be `None` after `.backward()`,
   meaning no gradient signal ever reaches it.
3. Scope: the single-layer example measured one layer's own trainable
   fraction (12,288 trainable out of that one layer's 590,592 frozen
   parameters). gpt2's `trainable%` measured the same 12-layer model's
   `c_attn`-only adapters against the *entire* model's 124M+
   parameters, most of which (embeddings, other projections,
   LayerNorm) were never wrapped and don't count toward either
   number's numerator.
4. `A` (projects down to rank `r`) and `B` (projects back up); the
   rank `r` is the shared bottleneck dimension that directly and
   linearly controls the trainable parameter count (verified: 1,536 at
   r=1 up to 98,304 at r=64 in the sweep).
5. Because gpt2's attention projection (`c_attn`) is implemented with
   Hugging Face's `Conv1D` class, which stores its weight transposed
   relative to a standard `nn.Linear` — `peft` detects this and
   automatically sets `fan_in_fan_out=True` to handle it correctly.
   It's a real, harmless quirk of gpt2's own implementation, not a bug
   in the LoRA math itself.

</details>

## Further reading & sources

- [LoRA: Low-Rank Adaptation of Large Language Models (Hu et al., 2021)](https://arxiv.org/abs/2106.09685) - the paper this module's entire mechanism (frozen W, trainable A/B, zero-init B, alpha scaling) is drawn from.
- [PEFT: State-of-the-art Parameter-Efficient Fine-Tuning](https://github.com/huggingface/peft) - the real library this module cross-checks against; source of `LoraConfig`, `get_peft_model`, and `print_trainable_parameters()`.
- [PEFT documentation: LoRA](https://huggingface.co/docs/peft/main/en/conceptual_guides/lora) - official usage guide covering `target_modules`, `lora_alpha`, and rank selection in more depth than this module's toy sweep.

## Next

[Module 13: QLoRA and Quantized Fine-Tuning](../13-qlora-and-quantized-fine-tuning/README.md)
