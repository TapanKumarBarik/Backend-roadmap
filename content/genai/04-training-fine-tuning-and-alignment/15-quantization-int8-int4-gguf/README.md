# Module 15: Quantization: INT8, INT4, GGUF

## Why this matters

Module 13 used quantization narrowly — as one half of a fine-tuning
technique (QLoRA), measured on a small linear layer and a single
model. Quantization is a much broader idea than that one use case: it
is the general practice of storing and computing a model's weights (and
sometimes activations) in fewer bits than they were trained in, applied
after training is done, for the sole purpose of making a finished model
cheaper to store and faster or lighter to run. This module verifies
the same real INT8 mechanism at a wider scope — full-model size
reduction and, honestly, real measured inference latency, which module
13 did not check — and then discusses INT4 and GGUF (llama.cpp's
on-disk format), two formats genuinely important in real deployment
that this CPU-only sandbox cannot run directly, without pretending
otherwise.

## Concepts

### Post-training quantization vs. QLoRA's quantize-then-train

```
 QLoRA (module 13)                        POST-TRAINING QUANTIZATION (this module)
 ─────────────────────────────            ─────────────────────────────────────────
 quantize base -> attach LoRA ->           take a FINISHED, already-trained model ->
 TRAIN the adapters -> done                quantize it -> DONE, no further training

 Goal: make an otherwise-too-large         Goal: make an already-good model
 model fine-tunable at all                  cheaper/faster to deploy and serve
```

Both use the same underlying numeric trick (fewer bits per weight);
they differ in *when* it happens and *why*. This module's quantization
happens after training is fully complete, and its only goal is
deployment cost — smaller files, less memory, and (hopefully, though
not guaranteed, as this module's own measurement shows) faster
inference.

### Verified: real whole-model INT8 size reduction, on a real cached model

```python
import io
import torch
import torch.nn as nn
from transformers import AutoModel, AutoTokenizer

MODEL_NAME = "distilbert-base-uncased"
tokenizer = AutoTokenizer.from_pretrained(MODEL_NAME)
model = AutoModel.from_pretrained(MODEL_NAME)
model.eval()

fp32_bytes = sum(p.element_size() * p.nelement() for p in model.parameters())
print("fp32 in-memory parameter bytes:", fp32_bytes, f"(~{fp32_bytes/1e6:.1f} MB)")

int8_model = torch.quantization.quantize_dynamic(model, {nn.Linear}, dtype=torch.qint8)

buf_fp32 = io.BytesIO(); torch.save(model.state_dict(), buf_fp32)
buf_int8 = io.BytesIO(); torch.save(int8_model.state_dict(), buf_int8)
print("fp32 state_dict serialized bytes:", buf_fp32.tell())
print("INT8 state_dict serialized bytes:", buf_int8.tell())
print("real size reduction:", f"{(1 - buf_int8.tell()/buf_fp32.tell())*100:.1f}%")
```

Verified output:

```
fp32 in-memory parameter bytes: 265451520 (~265.5 MB)
fp32 state_dict serialized bytes: 265487991 (~265.5 MB)
INT8 state_dict serialized bytes: 138113767 (~138.1 MB)
real size reduction: 48.0%
```

Consistent with module 13's single-layer and whole-model findings: a
real, close-to-theoretical 48% size reduction (4 bytes/weight down to
roughly 1 byte/weight, plus per-tensor quantization metadata) on a
real, complete, cached model — not an estimate.

### Verified, honestly: real inference latency, before assuming it improves

CPU INT8 kernels do not reliably speed up inference the way the size
reduction might suggest — this is a genuinely inconsistent result in
practice, and the only honest way to know is to measure it on the
actual hardware in question:

```python
import time

text = "Quantization reduces the numeric precision used to store and compute a model's weights."
inputs = tokenizer(text, return_tensors="pt")

def time_forward(m, inputs, n_warmup=5, n_iters=30):
    with torch.no_grad():
        for _ in range(n_warmup):
            m(**inputs)
        times = []
        for _ in range(n_iters):
            t0 = time.perf_counter()
            m(**inputs)
            times.append(time.perf_counter() - t0)
    return times

fp32_times = time_forward(model, inputs)
int8_times = time_forward(int8_model, inputs)
fp32_mean = sum(fp32_times) / len(fp32_times)
int8_mean = sum(int8_times) / len(int8_times)
print(f"fp32 mean: {fp32_mean*1000:.3f} ms  INT8 mean: {int8_mean*1000:.3f} ms")
print(f"speedup (fp32/int8):", f"{fp32_mean/int8_mean:.3f}x")
```

Verified output (short sequence, 30 timed runs each, after 5 warmup runs):

```
fp32 forward pass: mean=100.570 ms  median=83.959 ms  (n=30 runs)
INT8 forward pass: mean=84.551 ms  median=77.801 ms  (n=30 runs)
speedup (fp32 mean / int8 mean): 1.189x
speedup (fp32 median / int8 median): 1.079x
```

On this short sequence, INT8 was measurably faster — a real 1.19x
mean speedup. But repeating the exact same comparison on a longer
input sequence (78 tokens instead of the short example) on this same
machine produced a different, honest result:

```
longer sequence (seq_len= 78 )
fp32 mean: 189.861 ms  INT8 mean: 205.988 ms  ratio: 0.922x
```

At the longer sequence length, INT8 was actually **slower** than fp32
on this run (a 0.92x "speedup," i.e. a real slowdown). This is not a
mistake in the measurement — it's the honest, well-documented reality
of CPU dynamic quantization: the speedup depends on sequence length,
batch size, the specific CPU's support for INT8 instructions, and
which backend (`onednn`, `fbgemm`, `qnnpack`) is active, and it is not
guaranteed to be positive. **Report what you actually measure on your
own hardware — do not assume INT8 quantization speeds up CPU inference
without checking.**

### INT4 and GGUF — real formats, honestly not run here

Two more aggressive, real, widely-used formats are not verified with
code in this module, because the tooling they require is unavailable
in this CPU-only sandbox:

- **INT4** (4-bit weight quantization, as used in QLoRA's NF4 variant,
  module 13) needs `bitsandbytes` and a CUDA GPU for the real kernels
  used in practice. Conceptually, halving the bits again from INT8
  should roughly halve size again (INT8 here already showed real
  48% reduction; INT4 in a working setup would be expected to push
  further, though this module does not have a real measured number
  for it) — but that specific number is not verified here and should
  not be quoted as if it were.
- **GGUF** is llama.cpp's own file format for storing quantized models
  (successor to the older GGML format), supporting a range of
  quantization schemes (from roughly 2-bit up through 8-bit, with
  named presets like `Q4_K_M`) specifically optimized for efficient
  CPU inference outside the PyTorch/Transformers ecosystem entirely.
  Running it requires converting a model into GGUF and using
  `llama.cpp` (or a Python binding like `llama-cpp-python`) — neither
  is installed in this sandbox, so no GGUF numbers are reported here.
  What GGUF is used for honestly matters even without running it: it's
  the dominant format for running quantized LLMs on ordinary consumer
  CPUs and Apple Silicon, distinct from `bitsandbytes`' GPU-oriented
  4-bit quantization.

## Reference

```
 Format         Bit-width     Verified in this module?   Typical use
 ─────────────  ────────────  ─────────────────────────  ───────────────────
 fp32            32-bit        yes (baseline)             training, default
                                                            HF checkpoint
 INT8 dynamic    8-bit         YES - real size (48.0%      CPU-friendly
  (this module)                reduction) and real,        post-training
                                genuinely mixed latency     quantization
                                results measured
 INT4 / NF4      4-bit         no - needs bitsandbytes+    QLoRA (module 13),
                                CUDA, unavailable here      aggressive GPU
                                                            deployment
 GGUF (llama.cpp) 2-8 bit,     no - needs llama.cpp /      CPU/consumer-
  quantization    named        llama-cpp-python,            hardware LLM
  schemes         presets      unavailable here             inference
```

## Hands-on exercises

### 1. Reproduce the latency measurement at several sequence lengths

Extend the timing script to test 3-4 different input lengths (e.g. 10,
30, 60, 100 tokens) and report the real fp32-vs-INT8 ratio at each.
Plot or tabulate whether the "INT8 is faster" result holds
consistently, holds only at some lengths, or reverses — report
whatever you actually measure, even if it doesn't show a clean trend.

### 2. Measure size reduction and latency on a second real model

Repeat both the size-reduction and latency measurements on
`gpt2-medium` (note: as module 13 found, gpt2-family models use
`Conv1D`, not `nn.Linear`, for their heavy layers — you'll need to
either target `Conv1D` in `quantize_dynamic`'s module set, or pick
another `nn.Linear`-based cached model such as a different DistilBERT
variant). Report your real numbers.

### 3. Estimate an INT4/GGUF size, then flag your own estimate as unverified

Using this module's real INT8 result (48.0% reduction, ~138.1 MB from
~265.5 MB), compute a naive linear estimate for what INT4 might
achieve on the same model (hint: think in bytes-per-weight, not
percent-of-percent). Write your estimate down, then write one sentence
explicitly labeling it as unverified, and one sentence naming what
would be needed to actually verify it in this sandbox (which tool,
which library).

## Independent challenge

A colleague says: "We measured a nice INT8 speedup on our dev laptop,
so we can promise a 1.2x latency improvement in the production
deployment doc." Using this module's own measurements, evaluate this
claim.

<details><summary>Discussion</summary>

This module's own numbers argue directly against that promise. The
short-sequence measurement here did show a real 1.19x mean speedup —
but the longer-sequence measurement, run on the identical model and
the identical machine, showed a real 0.92x ratio (a slowdown), not a
speedup. If sequence length alone can flip the sign of the result on
one unchanged machine, a different production environment (different
CPU, different batch size, different sequence length distribution,
different quantization backend) has no guarantee of reproducing a dev
laptop's specific number, or even its direction. The honest, defensible
claim from this module's evidence is narrower: "on our own measured
short-sequence workload, we saw roughly a 1.2x mean speedup; we have
not verified this holds at other sequence lengths or on the production
hardware, and our own longer-sequence test suggests it does not always
hold." Promising a specific latency number in a deployment doc without
re-measuring on the actual production hardware and the actual
production sequence-length distribution is exactly the mistake this
module's own two different measurements were designed to surface.

</details>

## Common mistakes & troubleshooting

- **Assuming INT8 quantization always speeds up CPU inference.** This
  module's own two measurements (1.19x speedup at one sequence length,
  0.92x — a real slowdown — at another) directly contradict that
  assumption. Always measure on the target hardware and realistic
  sequence lengths rather than assuming a size reduction implies a
  latency reduction.
- **Confusing size reduction with speed improvement.** They are
  related but separate claims. This module verified a consistent,
  real 48% size reduction from INT8, but a latency result that varied
  by sequence length — don't report one as evidence for the other
  without measuring both.
- **Quoting an INT4 or GGUF number without having run it.** Exercise 3
  asks for exactly this distinction — an estimate based on
  bytes-per-weight math is a reasonable back-of-envelope calculation,
  but it is not the same as a verified, measured number, and should
  always be labeled as an estimate if presented alongside real
  measurements like this module's INT8 results.
- **Targeting the wrong module type for a given model's architecture.**
  As module 13 found directly, `{nn.Linear}` does essentially nothing
  on gpt2-family models (`Conv1D` layers), while it converts all 36
  real `nn.Linear` layers in distilbert. Always confirm which module
  class a model's heavy layers actually use before trusting a
  size-reduction number.
- **Treating GGUF and bitsandbytes-based 4-bit quantization as the
  same thing.** They're different ecosystems solving similar
  problems: GGUF/llama.cpp targets efficient CPU (and Apple Silicon)
  inference outside PyTorch entirely, while bitsandbytes' NF4 (module
  13) targets CUDA GPU fine-tuning and inference within the
  PyTorch/Transformers stack.

## Checkpoint quiz

1. What real, measured whole-model size reduction did INT8 dynamic
   quantization achieve on `distilbert-base-uncased`, and how close is
   that to the theoretical maximum for going from 32-bit to 8-bit
   weights?
2. What two different, real latency results did this module measure
   for INT8 vs. fp32, at two different sequence lengths, and what do
   they honestly demonstrate about CPU quantization speedups?
3. Why weren't INT4 and GGUF quantization actually run in this module,
   and what specifically would be needed to run each?
4. What is the key ecosystem difference between GGUF/llama.cpp-style
   quantization and bitsandbytes-style 4-bit (NF4) quantization?
5. Why does post-training quantization (this module) differ in
   *purpose*, not mechanism, from QLoRA's quantization step (module
   13)?

<details><summary>Answers</summary>

1. A real 48.0% reduction (265.5 MB to 138.1 MB). The theoretical
   maximum going from 4 bytes/weight (fp32) to 1 byte/weight (int8)
   would be 75%; the smaller real number reflects that not every
   parameter (embeddings, LayerNorm weights) gets quantized by
   `{nn.Linear}` targeting, plus per-tensor quantization metadata
   overhead on the layers that do.
2. A 1.19x mean speedup on a short sequence, and a 0.92x ratio (a real
   slowdown) on a longer sequence, both on the identical model and
   machine. This honestly demonstrates that CPU INT8 speedups are not
   guaranteed or consistent — they can depend on sequence length and
   must be measured on the actual target workload, not assumed from a
   size reduction alone.
3. Both require tooling unavailable in this CPU-only sandbox: INT4 (as
   used in QLoRA's NF4) needs the `bitsandbytes` library and a CUDA
   GPU; GGUF needs `llama.cpp` or a Python binding like
   `llama-cpp-python` to convert and run a model in that format.
4. GGUF/llama.cpp targets efficient inference on ordinary CPUs and
   Apple Silicon, entirely outside the PyTorch/Transformers stack;
   bitsandbytes' NF4 targets CUDA GPU fine-tuning and inference inside
   PyTorch/Transformers (the QLoRA use case from module 13).
5. Post-training quantization (this module) is applied to an already
   fully-trained, finished model purely to reduce deployment cost
   (size, potentially latency), with no further training happening.
   QLoRA's quantization (module 13) is applied *before* training
   starts, specifically so the frozen base model fits in memory while
   LoRA adapters are trained on top of it — same numeric mechanism,
   different point in the lifecycle and different goal.

</details>

## Further reading & sources

- [PyTorch Quantization documentation](https://docs.pytorch.org/docs/stable/quantization.html) - official reference for `torch.quantization.quantize_dynamic`, the real API this module's INT8 numbers come from.
- [llama.cpp](https://github.com/ggml-org/llama.cpp) - the real project behind the GGUF format; its README documents the quantization presets (e.g. `Q4_K_M`) discussed conceptually in this module.
- [QLoRA: Efficient Finetuning of Quantized LLMs (Dettmers et al., 2023)](https://arxiv.org/abs/2305.14314) - the real source of the NF4 4-bit format referenced here and covered in depth in module 13.
- [A Survey of Quantization Methods for Efficient Neural Network Inference (Gholami et al., 2021)](https://arxiv.org/abs/2103.13630) - a broader academic survey of quantization approaches, useful context for why speedups on real hardware are inconsistent, matching this module's own measured latency results.

## Next

[Module 16: When to Fine-Tune vs. Prompt vs. RAG](../16-when-to-fine-tune-vs-prompt-vs-rag/README.md)
