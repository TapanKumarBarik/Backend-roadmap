# Module 13: QLoRA and Quantized Fine-Tuning

## Why this matters

Module 12 verified that LoRA trains a tiny fraction of a model's
parameters — but it did not change what the *frozen* 99%+ of the model
costs to hold in memory during fine-tuning. That frozen majority still
sits in full 16- or 32-bit precision, and for anything past toy scale
it is that frozen base model's memory footprint, not the small LoRA
adapter, that decides whether a fine-tune fits on the hardware
available. QLoRA (Dettmers et al., 2023) is the fix: quantize the
frozen base model down to a much smaller numeric format *before*
attaching LoRA adapters, so the expensive, unchanging part of the
model gets dramatically cheaper to hold while the small trainable part
stays in full precision where its gradients need the range. This
module verifies the quantization half of that combination directly
with real, measured byte counts — real QLoRA uses 4-bit NF4
quantization via `bitsandbytes`, which needs a CUDA GPU and is not
available in this CPU-only sandbox, so the numbers below are measured
with real INT8 dynamic quantization instead. INT8 is a different
bit-width from NF4, but it demonstrates the identical combination
principle with numbers that are genuinely real rather than assumed.

## Concepts

### The combination: a quantized frozen base + full-precision trainable adapters

```
 QLoRA'S ARCHITECTURE
 ─────────────────────────────────────────────────────────────
 x -> [ W, FROZEN, QUANTIZED (4-bit NF4 in the real paper) ] ─┐
                                                                ├─► + ─► y
      x -> [ A ] -> [ B ]   (LoRA adapters, module 12,
                              kept in higher precision;
                              these are what training updates)

 The frozen path is cheap to STORE (fewer bits per weight).
 The trainable path is cheap to TRAIN (module 12's tiny param count).
 Together: fine-tune a model whose full-precision form would not fit.
```

The two halves are independent techniques doing different jobs:
quantization (this module) shrinks the frozen base's memory footprint;
LoRA (module 12) shrinks the trainable parameter count. QLoRA is
simply running both at once, on the same model, at the same time.

### Verified: real INT8 dynamic quantization of a linear layer, real byte counts

`torch.quantization.quantize_dynamic` performs genuine weight-only
INT8 quantization on CPU — no GPU or `bitsandbytes` required. One real
gotcha worth knowing before trusting the numbers: it only converts the
exact module types you list, and only as *submodules* of whatever
model object you hand it — passing a bare top-level `nn.Linear`
directly returns it completely unchanged, since there are no child
modules for it to walk and replace. Wrapping it in a tiny container
module first makes conversion actually happen:

```python
import io
import torch
import torch.nn as nn

class Wrap(nn.Module):
    def __init__(self, in_features, out_features):
        super().__init__()
        self.fc = nn.Linear(in_features, out_features)
    def forward(self, x):
        return self.fc(x)

in_features, out_features = 768, 768
model = Wrap(in_features, out_features)
model.eval()

fp32_bytes = sum(p.element_size() * p.nelement() for p in model.parameters())
print("fp32 layer weight+bias bytes (in-memory params):", fp32_bytes)

quantized_model = torch.quantization.quantize_dynamic(model, {nn.Linear}, dtype=torch.qint8)
print("submodule type after quantize_dynamic:", type(quantized_model.fc))

buf_fp32 = io.BytesIO(); torch.save(model.state_dict(), buf_fp32)
buf_int8 = io.BytesIO(); torch.save(quantized_model.state_dict(), buf_int8)
print("fp32 state_dict serialized size (bytes):", buf_fp32.tell())
print("INT8 quantized state_dict serialized size (bytes):", buf_int8.tell())
print("real size reduction:", f"{(1 - buf_int8.tell()/buf_fp32.tell())*100:.1f}%")

qweight = quantized_model.fc.weight()
print("quantized weight tensor dtype:", qweight.dtype)
print("quantized weight qscheme:", qweight.qscheme())
```

Verified output:

```
fp32 layer weight+bias bytes (in-memory params): 2362368
submodule type after quantize_dynamic: <class 'torch.ao.nn.quantized.dynamic.modules.linear.Linear'>
fp32 state_dict serialized size (bytes): 2364261
INT8 quantized state_dict serialized size (bytes): 595485
real size reduction: 74.8%
quantized weight tensor dtype: torch.qint8
quantized weight qscheme: torch.per_tensor_affine
```

A real, measured **74.8% size reduction** for one layer — larger than
the naive "32-bit to 8-bit should be ~75%" back-of-envelope estimate
would predict exactly, which lines up almost precisely (fp32 is 4
bytes/weight, int8 is 1 byte/weight, a theoretical 75% reduction), with
the small remaining difference coming from per-tensor quantization
metadata (scale and zero-point values) stored alongside the packed
INT8 weights.

### Verified: quantization has a real, measurable accuracy cost, not just a size benefit

```python
x = torch.randn(4, in_features)
with torch.no_grad():
    fp32_out = model(x)
    int8_out = quantized_model(x)
max_diff = (fp32_out - int8_out).abs().max().item()
mean_diff = (fp32_out - int8_out).abs().mean().item()
rel = mean_diff / fp32_out.abs().mean().item()
print("max abs output difference (fp32 vs INT8), same input:", max_diff)
print("mean abs output difference:", mean_diff)
print("relative mean error:", f"{rel*100:.3f}%")
```

Verified output:

```
max abs output difference (fp32 vs INT8), same input: 0.03947964310646057
mean abs output difference: 0.007799370680004358
relative mean error: 1.691%
```

Quantization is lossy — a real, measured 1.7% relative error on this
layer's output, from the same input, comparing fp32 against INT8. This
is exactly why QLoRA freezes the *quantized* weights rather than
training on top of them directly: the small LoRA adapters (module 12,
kept in higher precision) can absorb and correct for this quantization
error during training, while the frozen quantized base stays cheap to
store throughout.

### Verified: quantization only helps if the model's real layers match the module types you target

```python
from transformers import AutoModelForCausalLM, AutoModel

gpt2 = AutoModelForCausalLM.from_pretrained("gpt2")
n_linear_gpt2 = sum(1 for m in gpt2.modules() if isinstance(m, nn.Linear))
print("nn.Linear modules found in gpt2:", n_linear_gpt2)

bert = AutoModel.from_pretrained("distilbert-base-uncased")
n_linear_bert = sum(1 for m in bert.modules() if isinstance(m, nn.Linear))
print("nn.Linear modules found in distilbert:", n_linear_bert)
```

Verified output:

```
nn.Linear modules found in gpt2: 1
nn.Linear modules found in distilbert: 36
```

Running `quantize_dynamic(gpt2, {nn.Linear}, ...)` on gpt2 barely
changes anything — its state dict came back at 536,410,769 bytes
(measured), *larger* than the original 497,812,375 bytes, because
gpt2's real weight-heavy attention and MLP projections are implemented
as Hugging Face's `Conv1D` class (the same detail module 12 noted
triggers a `fan_in_fan_out` warning in `peft`), not `nn.Linear` — so
`{nn.Linear}` matches almost nothing real in the model, and the tiny
bit of quantization metadata added to the one real `nn.Linear` module
present made the file marginally bigger, not smaller. Running the
identical code against `distilbert-base-uncased`, which genuinely uses
`nn.Linear` for its 36 attention/feed-forward projections, produced a
real, substantial reduction:

```
distilbert fp32 state_dict serialized bytes: 265487991 (~265.5 MB)
distilbert INT8 state_dict serialized bytes: 138113767 (~138.1 MB)
real whole-model size reduction: 48.0%
```

All 36 `nn.Linear` modules were confirmed converted, and the whole
model's real serialized size dropped by 48% — the honest lesson: a
quantization tool's benefit depends entirely on whether the module
types you're targeting are the ones the model actually uses for its
heavy weights. This exact same caveat applies to real 4-bit/NF4 QLoRA
tooling: it targets specific layer types and dtypes, and checking that
match against your actual model's implementation is a real,
non-optional step, not a formality.

## Reference

```
 Term                  Meaning
 ────────────────────  ─────────────────────────────────────────────
 Frozen quantized base  The pretrained weights, held in a low-bit
                        format, never updated during fine-tuning
 NF4 (4-bit NormalFloat) The real QLoRA paper's quantization format;
                        needs bitsandbytes + CUDA; not run in this
                        module (CPU sandbox) — INT8 stands in here
 INT8 dynamic quant.    What this module actually ran and measured;
                        real 8-bit weight-only quantization, CPU-native
 Double quantization     Real QLoRA detail (not verified here): the
                        paper also quantizes the quantization
                        constants themselves for further savings
 Dequantize-on-the-fly   How a quantized frozen layer computes its
                        forward pass: weights are dequantized to do
                        the matmul, then discarded again, never
                        stored back in full precision
 Quantization error      The real, measured difference between a
                        quantized layer's output and its fp32
                        original (verified: 1.7% relative error here)
 Module-type targeting   Which layer classes get converted; verified
                        directly to matter (gpt2's Conv1D vs.
                        distilbert's real nn.Linear)
```

## Hands-on exercises

### 1. Reproduce the size-reduction measurement on `gpt2-medium`

Run the `Wrap`-based size comparison against `gpt2-medium`'s real
weight-heavy layers instead — since gpt2-family models use `Conv1D`,
you'll need to either target `Conv1D` directly in `quantize_dynamic`'s
module set, or repeat the whole-model comparison on a real
`nn.Linear`-based model like `distilbert-base-uncased` at a different
size. Report the real before/after byte counts you measure.

### 2. Measure the quantization error at a different layer width

Repeat the "real accuracy cost" measurement (max/mean abs diff,
relative error) using `in_features=out_features=128` instead of 768.
Report whether the relative error percentage is meaningfully different
at this smaller width, and describe, from the numbers alone, whether
quantization error appears to scale with layer size in your
measurement.

### 3. Combine module 12's LoRA count with this module's quantized size, for one concrete example

Using module 12's verified `peft` cross-check (gpt2, `r=8`,
`target_modules=["c_attn"]`: 294,912 trainable parameters, full model
124,439,808 parameters) and this module's real INT8 size reduction on
distilbert (48.0%), write out — in your own numbers, not a restatement
of either module — what a QLoRA-style setup would look like for one
specific model of your choosing: state the frozen base's real
parameter count, what fraction would be trainable at some LoRA rank,
and what the real (or, if not run, honestly estimated) memory
footprint of the frozen base would be at 4-bit versus its native
precision.

## Independent challenge

A colleague says: "QLoRA is basically just LoRA — the quantization
part is a minor implementation detail, since the paper's main
contribution is the low-rank adapters." Using this module's and module
12's verified findings, evaluate that claim.

<details><summary>Discussion</summary>

This gets the relationship backwards. Module 12 verified LoRA trains a
genuinely tiny fraction of a model's parameters (0.24% for gpt2 at
r=8) — but that number describes *trainable* parameters, not the
memory required to *hold* the model during fine-tuning. The frozen
majority (99.76% in that example) still has to sit in memory in
whatever precision it's stored at, and that's exactly the cost QLoRA's
quantization half addresses: this module measured a real 48% size
reduction on a real model's real weights from INT8 alone, and the
actual QLoRA paper's 4-bit NF4 format goes further still. Without
quantizing the frozen base, LoRA alone reduces the *training* cost
(fewer optimizer states, fewer gradients) but does nothing about the
cost of holding the frozen weights themselves — for a model large
enough that its full-precision weights don't fit in available memory
at all, LoRA's parameter-efficiency alone doesn't solve that problem;
quantization does. QLoRA's real contribution is precisely that it
found a way to combine both cost reductions (memory to hold the frozen
base, and separately, compute/memory to train the adapters) without
either canceling out the other's benefit — calling the quantization
half "a minor detail" ignores the actual problem statement in the
QLoRA paper's title, "Efficient Finetuning of Quantized LLMs," which
should be read literally.

</details>

## Common mistakes & troubleshooting

- **Assuming this module's INT8 numbers are what real QLoRA reports.**
  They are not — real QLoRA uses 4-bit NF4 via `bitsandbytes`, which
  needs a CUDA GPU unavailable in this sandbox. INT8 (verified: 74.8%
  single-layer size reduction, 48.0% whole-distilbert reduction) is a
  different, more conservative bit-width used here specifically
  because it's genuinely runnable and verifiable on CPU — treat these
  as "the same principle, a different real data point," not
  substitutes for the paper's own reported numbers.
- **Passing a bare `nn.Linear` directly to `quantize_dynamic` and
  concluding quantization "did nothing."** This module verified
  exactly that failure mode — a top-level `nn.Linear` with no child
  modules is returned unchanged. Wrap it in a container module (or use
  a real multi-layer model) so `quantize_dynamic`'s internal recursion
  has submodules to actually replace.
- **Targeting `{nn.Linear}` on a model that doesn't use `nn.Linear` for
  its heavy layers.** Verified directly: gpt2's real projections are
  `Conv1D`, so `{nn.Linear}` quantizes essentially nothing there
  (state dict size went up slightly, not down) — always check what
  module types a specific model's architecture actually uses before
  trusting a size-reduction claim.
- **Ignoring quantization's real accuracy cost.** This module measured
  a genuine 1.7% relative output error from real INT8 quantization on
  one layer — not zero. Real QLoRA setups rely on the LoRA adapters
  training on top of (and partially compensating for) this kind of
  quantization error, not on the assumption that quantization is
  numerically free.
- **Confusing "frozen and quantized" with "untrainable forever."** The
  base is frozen for the duration of *this* fine-tune; quantization is
  a storage/compute choice about the frozen weights, unrelated to
  whether a different training run could later update them in full
  precision.

## Checkpoint quiz

1. What two independent cost reductions does QLoRA combine, and which
   module (this one or module 12) verified each one with real numbers?
2. Why did passing a bare `nn.Linear` directly into
   `torch.quantization.quantize_dynamic` fail to quantize anything,
   and what fixed it?
3. What real, measured percentage size reduction did this module find
   for a single INT8-quantized linear layer, and how did that compare
   for the whole `distilbert-base-uncased` model?
4. Why did running the same `quantize_dynamic({nn.Linear}, ...)` call
   on gpt2 fail to meaningfully shrink its state dict, despite working
   well on distilbert?
5. What real bit-width does actual QLoRA use, and why was it not run
   directly in this module?

<details><summary>Answers</summary>

1. A quantized, memory-cheap frozen base (this module: verified 74.8%
   single-layer and 48.0% whole-model real INT8 size reductions) and a
   tiny trainable adapter (module 12: verified 0.24% trainable
   parameters for gpt2 at r=8 via real `peft`). QLoRA is both applied
   together to the same model.
2. `quantize_dynamic`'s internal `convert()` step only replaces named
   *submodules* of the model object it's given by walking
   `named_children()` — a bare top-level `nn.Linear` has no children
   for it to find and swap. Wrapping the layer in a small container
   module gave it a submodule to actually convert.
3. 74.8% for the single wrapped linear layer; 48.0% for the whole
   distilbert model's real serialized state dict (265.5 MB down to
   138.1 MB) — smaller than the single-layer number because
   distilbert's total size includes embeddings, LayerNorms, and other
   non-`nn.Linear` parameters that `quantize_dynamic({nn.Linear}, ...)`
   never touches.
4. gpt2's attention and MLP projections are implemented as Hugging
   Face's `Conv1D` class, not `nn.Linear` — verified directly (only 1
   real `nn.Linear` module found in the whole model) — so targeting
   `{nn.Linear}` matches almost none of gpt2's actual weight-heavy
   layers.
5. 4-bit NF4 (NormalFloat), via the `bitsandbytes` library, which
   requires a CUDA GPU — unavailable in this CPU-only sandbox, so this
   module used real INT8 dynamic quantization (a different, runnable
   bit-width) to verify the same combination principle instead.

</details>

## Further reading & sources

- [QLoRA: Efficient Finetuning of Quantized LLMs (Dettmers et al., 2023)](https://arxiv.org/abs/2305.14314) - the paper this module's entire framing is drawn from, including 4-bit NF4 quantization and double quantization, neither of which is run in this CPU sandbox.
- [PyTorch Quantization documentation](https://docs.pytorch.org/docs/stable/quantization.html) - official reference for `torch.quantization.quantize_dynamic` and the eager-mode quantization API this module's verified numbers actually come from.
- [bitsandbytes documentation](https://huggingface.co/docs/bitsandbytes/main/en/index) - the real library real QLoRA setups use for 4-bit NF4 quantization on CUDA GPUs; honestly not runnable in this sandbox, linked here for the real path this module's INT8 numbers stand in for.

## Next

[Module 14: Running a Real Fine-Tune](../14-running-a-real-fine-tune/README.md)
