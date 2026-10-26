# Module 05: Calculating a Model's Memory Requirements

## Roadmap

You are in Track 05, GPUs & GenAI Hardware. [Module 04](../04-vram-the-real-constraint/README.md) named the categories of GPU memory (weights, gradients, optimizer states, activations, KV cache, overhead) and said which grow with what. This module turns each category into a formula, builds a small reusable calculator, and runs it on real published model architectures. [Module 06](../06-numeric-formats-fp32-fp16-bf16/README.md) then explains the number formats behind the "bytes per parameter" column, and [Module 07](../07-mixed-precision-training/README.md) explains why training keeps several copies of the weights.

Prerequisites: Module 04, and a picture of a transformer block (attention with query/key/value projections, then an MLP) from [Track 02](../../02-transformer-architecture/README.md). You need only arithmetic.

After this module you can:

- Compute a model's weight memory from its parameter count and precision, and count the parameters from its config.
- Derive and use the KV-cache formula, including the effect of grouped-query attention.
- Derive the "16 bytes per parameter" figure for mixed-precision Adam training instead of memorizing it.
- Estimate activation memory and say what activation checkpointing trades for it.
- Run a calculator on any model card's config and say honestly how far to trust the answer.

## Concept

> [!key] Memory is arithmetic on a few architecture numbers. Weights = parameters x bytes per parameter. KV cache = 2 x layers x KV heads x head dimension x tokens x batch x bytes. Mixed-precision Adam training needs 2 + 2 + 4 + 4 + 4 = 16 bytes per parameter before activations. These are estimates: they tell you the right order of magnitude and which term dominates, not the exact number `nvidia-smi` will print.

## Explanation

### The numbers you need from a model's config

Almost every formula below uses the same handful of values, all found in a model's `config.json` or in its paper's architecture table:

| Symbol | Meaning | Typical config name |
|--------|---------|---------------------|
| `L` | number of transformer layers | `num_hidden_layers` |
| `d` | hidden size (width of the residual stream) | `hidden_size` |
| `a` | number of query heads | `num_attention_heads` |
| `g` | number of key/value heads | `num_key_value_heads` (absent means `g = a`) |
| `d_h` | head dimension, normally `d / a` | `head_dim`, or derived |
| `f` | width of the MLP's inner layer | `intermediate_size` |
| `V` | vocabulary size | `vocab_size` |

### Weights: parameters x bytes per parameter

`weight bytes = number of parameters x bytes per parameter`

Bytes per parameter: FP32 is 4, FP16 and BF16 are 2, INT8 is 1, INT4 is 0.5 (plus a little extra for scale factors that real 4-bit formats store; see the [quantization module](../../04-training-fine-tuning-and-alignment/15-quantization-int8-int4-gguf/README.md) in Track 04). Module 06 explains why FP16 and BF16 both take 2 bytes.

> [!pitfall] GB versus GiB. A 7-billion-parameter model in 16-bit numbers is 7e9 x 2 = 14e9 bytes = 14 GB (decimal) = 13.04 GiB (binary, 1 GiB = 2^30 bytes). Tools disagree about which they print. This module uses GiB for memory because that is what operating systems and GPU tools usually report.

**Counting parameters from the config.** For a Llama-style decoder (no bias terms, a three-matrix gated MLP called SwiGLU, RMSNorm layers), one transformer layer holds:

- Attention: `W_q` is `d x (a * d_h)` = `d x d`; `W_k` and `W_v` are each `d x (g * d_h)`; `W_o` is `(a * d_h) x d` = `d x d`. Together: `2*d*d + 2*d*g*d_h`.
- MLP: three matrices of shape `d x f` (gate, up) and `f x d` (down): `3*d*f`.
- Two norm weight vectors: `2*d`.

Add the token embedding table (`V*d`), the output projection (`V*d` again, unless the model ties it to the embedding), and a final norm (`d`):

`P = L * (2*d*d + 2*d*g*d_h + 3*d*f + 2*d) + 2*V*d + d`

Models differ in details (some add bias terms to the attention projections, some tie embeddings, mixture-of-experts models multiply the MLP), so treat the result as a check against the published size, not as gospel.

### Inference: weights + KV cache + overhead

#### Why there is a KV cache

An autoregressive model generates one token at a time. To produce token `t`, attention in every layer needs the keys and values of all tokens `1..t-1`. Those do not change once computed (each token only attends to earlier tokens), so the engine stores them instead of recomputing the whole prefix at every step. That stored state is the KV cache. It makes generation fast and makes memory grow with every token.

#### Deriving the formula

Build it from the inside out:

1. In one layer, one token produces one key vector and one value vector per KV head, each `d_h` numbers long. That is `2 * g * d_h` numbers (the 2 is "K and V").
2. Every layer keeps its own: multiply by `L`.
3. Each number takes `b` bytes (2 for FP16/BF16, 1 for INT8).
4. The cache holds every token so far, `s` tokens (prompt plus generated), for each of `B` sequences served at once.

**`KV cache bytes = 2 * L * g * d_h * s * B * b`**

For ordinary multi-head attention `g * d_h = a * d_h = d`, so the cost per token is `2 * L * d * b`, which is exactly the expression in the vLLM paper: for OPT-13B it states 2 (key and value) x 5120 (hidden state size) x 40 (layers) x 2 (bytes per FP16) = 800 KB per token. The calculator reproduces it below.

#### What GQA and MQA change

In standard multi-head attention (MHA) every query head has its own key and value head (`g = a`). Multi-query attention (MQA, Shazeer 2019) shares one key/value head across all query heads (`g = 1`). Grouped-query attention (GQA, Ainslie et al. 2023) is the middle ground: query heads are split into `g` groups, each group sharing one key/value head. The number of query heads, and so most of the compute, stays the same; only `g` in the formula shrinks. The cache gets smaller by a factor of `a / g`. The GQA paper reports quality close to MHA with speed comparable to MQA; Llama 2 uses GQA with 8 KV heads for its 70B model, and Llama 3 uses 8 KV heads at both 8B and 70B.

> [!model] Every term in these formulas is a count multiplied by a byte width, so each lever scales its term linearly: halve the bytes and that term halves, halve `g` and the KV cache halves, double the context and it doubles. When you are unsure which lever matters, compute each term at your target and look for the one that dominates.

#### Overhead, and how many users fit

Activations during generation are small, but the CUDA context, kernel workspaces and allocator slack are not zero. The calculator below adds a flat 20% of the weights as a stand-in. That figure is the "up to about 20% more for inference" rule of thumb in the Hugging Face Accelerate documentation (which attributes it to EleutherAI). It is a rule of thumb, not a law.

Once the weights and overhead are subtracted from the card, the rest is cache budget:

`sequences that fit = floor( (GPU memory - weights x (1 + overhead)) / KV bytes per sequence )`

### Training: where 16 bytes per parameter comes from

Training with the Adam optimizer in mixed precision keeps five parameter-sized tensors. Add up the bytes per parameter:

| Tensor | Precision | Bytes | Why it exists |
|--------|-----------|-------|---------------|
| Working weights | 16-bit | 2 | what the forward and backward passes actually multiply |
| Gradients | 16-bit | 2 | output of the backward pass |
| Master weights | FP32 | 4 | the accurate copy the optimizer updates (Module 07 explains why) |
| Adam first moment `m` | FP32 | 4 | running average of the gradient |
| Adam second moment `v` | FP32 | 4 | running average of the squared gradient |

2 + 2 + 4 + 4 + 4 = 16 bytes per parameter. The ZeRO paper writes the same thing as `(2 + 2 + K) x P` with `K = 12` for mixed-precision Adam, and uses it to say that a 1.5-billion-parameter GPT-2 needs at least 24 GB for these states even though its 16-bit weights are only 3 GB.

Two consequences worth seeing:

- **Mixed precision does not shrink this bill.** Plain FP32 training with Adam is 4 (weights) + 4 (gradients) + 4 + 4 (Adam) = 16 bytes too. The Accelerate estimator's "training using Adam" column is four times the FP32 weight size, which for `bert-base-cased` is 413.18 MB x 4, reported as 1.61 GB. Mixed precision saves *activation* memory and time, not model-state memory (Module 07). The bookkeeping can differ: PyTorch's autocast recipe keeps the parameters themselves in FP32, so there the 16 bytes are FP32 weights, FP32 gradients and 8 bytes of Adam, plus temporary 16-bit casts.
- **Only trainable parameters pay 16 bytes.** A frozen parameter costs just its weight. With LoRA (Track 04) the base model is frozen and only the small adapter pays, which is why LoRA fits on a card where full fine-tuning does not (listing 4 puts numbers on it).

### Activations: a rough estimate, and what checkpointing trades

Activations are the intermediate results the backward pass needs. Korthikanti et al. (2022) derive how many bytes a standard GPT-style transformer layer keeps, assuming 16-bit activations and counting by sequence length `s`, micro-batch `b`, hidden size `h`, heads `a`:

- Attention block: `11*s*b*h + 5*a*s*s*b` bytes. The second term is the attention scores: the softmax output (2 bytes per score), its dropout mask (1 byte) and the dropout output (2 bytes) for each of the `a*s*s*b` scores.
- MLP block: `19*s*b*h` bytes. Layer norms: `4*s*b*h` bytes.

Adding up, `34*s*b*h + 5*a*s*s*b`, which the paper writes as one layer's cost: `activation bytes per layer = s * b * h * (34 + 5 * a * s / h)`.

Multiply by `L` layers and add a smaller term for embeddings and the output layer, including the logits (the paper computes cross entropy on FP32 logits: `4*s*b*V` bytes). Two things in this formula deserve attention:

- **It grows with `s` twice.** The `34` part is linear in sequence length; the `5*a*s/h` part is quadratic, because attention compares every token with every other. Memory-efficient attention kernels such as FlashAttention avoid storing the score matrix, which removes this term (Module 08).
- **Activation checkpointing (recomputation) trades compute for memory.** Instead of keeping everything, keep only each layer's input (`2*s*b*h` bytes per layer) and re-run the forward pass of a layer when the backward pass needs it. [Chen et al. (2016)](https://arxiv.org/abs/1604.06174) show this brings the memory of an `n`-layer network down to roughly the square root of `n` at the cost of one extra forward pass; the ZeRO paper quotes about 33% extra compute for the standard setting. The calculator adds one layer's full activations on top, because one layer is re-materialized at a time during backward.

> [!pitfall] The activation formula is derived for a specific block design (GeLU MLP, dropout, standard multi-head attention). Llama-style blocks (SwiGLU, no dropout, GQA) store somewhat different amounts. Use the formula to see the shape of the cost (linear and quadratic in `s`, linear in batch and layers) and its rough size, and measure the real number with `torch.cuda.max_memory_allocated()` before committing to a batch size.

### Where the estimate is wrong

The calculator does not model: the CUDA context and kernel workspaces (folded into the flat overhead), allocator fragmentation, peak activations during the prefill of a long prompt, speculative-decoding draft models, serving engines that pre-allocate a fixed fraction of memory for the cache, mixture-of-experts models (all experts must be resident even though few are active per token, so use the *total* parameter count for memory), and sliding-window attention (the Mistral 7B paper describes a rolling-buffer cache capped at the window size, so a stack that implements it holds less cache than the formula says for long sequences). Treat the output as a planning number, then measure.

## Code

Save the first listing as `memcalc.py`; the other listings import it. Everything uses only the Python standard library. All outputs below were produced by running these listings with Python 3.13.

### Listing 1: the calculator

```python
"""memcalc.py - back-of-envelope GPU memory calculator for decoder-only transformers.

Estimates, not measurements. Standard library only.
"""
from dataclasses import dataclass

GIB = 1024 ** 3
BYTES = {"fp32": 4.0, "fp16": 2.0, "bf16": 2.0, "int8": 1.0, "int4": 0.5}


@dataclass(frozen=True)
class Cfg:
    """The handful of architecture numbers that decide memory."""
    name: str
    layers: int
    hidden: int
    heads: int           # query heads
    kv_heads: int        # key/value heads (== heads for MHA, 1 for MQA, in between for GQA)
    ffn: int             # SwiGLU intermediate size
    vocab: int
    tied_embeddings: bool = False

    @property
    def head_dim(self) -> int:
        return self.hidden // self.heads


def param_count(c: Cfg) -> int:
    """Llama-style block: no biases, SwiGLU MLP (3 matrices), RMSNorm weights."""
    attn = (c.hidden * c.heads * c.head_dim              # W_q
            + 2 * c.hidden * c.kv_heads * c.head_dim     # W_k and W_v
            + c.heads * c.head_dim * c.hidden)           # W_o
    mlp = 3 * c.hidden * c.ffn                           # gate, up, down
    norms = 2 * c.hidden                                 # two RMSNorms per layer
    per_layer = attn + mlp + norms
    embed = c.vocab * c.hidden
    lm_head = 0 if c.tied_embeddings else c.vocab * c.hidden
    return c.layers * per_layer + embed + lm_head + c.hidden   # + final norm


def weights_bytes(n_params: float, dtype: str = "fp16") -> float:
    return n_params * BYTES[dtype]


def kv_bytes_per_token(c: Cfg, dtype: str = "fp16") -> float:
    # 2 (K and V) x layers x kv_heads x head_dim x bytes
    return 2 * c.layers * c.kv_heads * c.head_dim * BYTES[dtype]


def kv_cache_bytes(c: Cfg, seq_len: int, batch: int = 1, dtype: str = "fp16") -> float:
    return kv_bytes_per_token(c, dtype) * seq_len * batch


def inference_bytes(c: Cfg, weight_dtype="fp16", kv_dtype="fp16",
                    seq_len=4096, batch=1, overhead_frac=0.20) -> dict:
    """weights + KV cache + a flat overhead (activations workspace, CUDA context,
    fragmentation) taken as a fraction of the weights."""
    w = weights_bytes(param_count(c), weight_dtype)
    kv = kv_cache_bytes(c, seq_len, batch, kv_dtype)
    ov = overhead_frac * w
    return {"weights": w, "kv_cache": kv, "overhead": ov, "total": w + kv + ov}


def training_state_bytes(n_params: float, mode="mixed_adam") -> dict:
    """Bytes for the parameter-sized tensors (no activations)."""
    if mode == "mixed_adam":      # 16-bit working copy + grads, fp32 master copy + Adam m, v
        parts = {"weights_16bit": 2, "grads_16bit": 2,
                 "master_weights_fp32": 4, "adam_m_fp32": 4, "adam_v_fp32": 4}
    elif mode == "fp32_adam":     # everything fp32
        parts = {"weights_fp32": 4, "grads_fp32": 4, "adam_m_fp32": 4, "adam_v_fp32": 4}
    else:
        raise ValueError(mode)
    out = {k: v * n_params for k, v in parts.items()}
    out["total"] = sum(parts.values()) * n_params
    return out


def activation_bytes(c: Cfg, seq_len: int, batch: int,
                     flash: bool = False, recompute: str = "none") -> float:
    """Rough training-activation estimate after Korthikanti et al. 2022 (16-bit activations, no
    tensor/pipeline parallelism). Per layer: s*b*h*(34 + 5*a*s/h) bytes; flash=True drops the
    5*a*s/h attention-score term. recompute='full' keeps only each layer's input (2*s*b*h) plus one
    layer re-materialised during backward. Written for GPT-style blocks: a ballpark for Llama-style."""
    s, b, h, a, L, v = seq_len, batch, c.hidden, c.heads, c.layers, c.vocab
    one_layer = s * b * h * (34 + (0 if flash else 5 * a * s / h))
    body = L * 2 * s * b * h + one_layer if recompute == "full" else L * one_layer
    extra = s * b * (5 * h + 4 * v)    # embedding dropout, last norm, output layer, fp32 logits
    return body + extra


def max_concurrent_seqs(c: Cfg, gpu_gib: float, seq_len: int, weight_dtype="fp16",
                        kv_dtype="fp16", overhead_frac=0.20) -> int:
    w = weights_bytes(param_count(c), weight_dtype) * (1 + overhead_frac)
    free = gpu_gib * GIB - w
    return max(0, int(free // kv_cache_bytes(c, seq_len, 1, kv_dtype)))


def gib(n_bytes: float) -> str:
    return f"{n_bytes / GIB:8.2f} GiB"
```

### Listing 2: check the calculator against arithmetic you can do by hand, and against published numbers

Three hand checks first. For Llama-2-7B (`d=4096`, `L=32`, `f=11008`, `V=32000`, MHA): attention is `4 x 4096 x 4096` = 67,108,864; the MLP is `3 x 4096 x 11008` = 135,266,304; two norms add 8,192; one layer is 202,383,360. Times 32 layers is 6,476,267,520; the embedding and the output head add `2 x 32000 x 4096` = 262,144,000; the final norm adds 4,096. Total 6,738,415,616 parameters, so 13,476,831,232 bytes in FP16, which is 12.55 GiB. Mistral-7B's KV cache per token is `2 x 32 x 8 x 128 x 2` = 131,072 bytes = 128 KiB. Llama-3-70B's mixed-precision Adam states are `P x 16` bytes. The listing redoes these in plain arithmetic, asserts the calculator agrees, then compares with figures published in papers.

```python
from memcalc import *

l2_7b = Cfg("Llama-2-7B", layers=32, hidden=4096, heads=32, kv_heads=32, ffn=11008, vocab=32000)
mistral = Cfg("Mistral-7B", layers=32, hidden=4096, heads=32, kv_heads=8, ffn=14336, vocab=32000)
l3_70 = Cfg("Llama-3-70B", layers=80, hidden=8192, heads=64, kv_heads=8, ffn=28672, vocab=128000)

print("== Hand checks (plain arithmetic, no calculator code) ==")
# 1. Llama-2-7B parameters and FP16 weight bytes
d, L, f, V = 4096, 32, 11008, 32000
attn = 4 * d * d                        # W_q, W_k, W_v, W_o are all d x d when kv_heads == heads
mlp = 3 * d * f                         # gate, up, down
per_layer = attn + mlp + 2 * d          # + two norm weight vectors
total = L * per_layer + 2 * V * d + d   # + input embedding + untied output head + final norm
print(f"per layer {per_layer:,}  x {L} layers + embeddings/head/norm = {total:,} parameters")
assert total == param_count(l2_7b)
print(f"FP16 weights = {total * 2:,} bytes = {total * 2 / GIB:.2f} GiB")

# 2. Mistral-7B KV cache: 2 * 32 layers * 8 kv heads * 128 head_dim * 2 bytes
per_token = 2 * 32 * 8 * 128 * 2
assert per_token == kv_bytes_per_token(mistral)
print(f"Mistral-7B KV cache = {per_token:,} bytes/token = {per_token // 1024} KiB; at 4096 tokens = {per_token * 4096 / GIB:.2f} GiB")

# 3. Llama-3-70B training states: 16 bytes per parameter
P = param_count(l3_70)
print(f"Llama-3-70B: {P:,} parameters x 16 bytes = {P * 16 / GIB:.1f} GiB")
assert abs(P * 16 - training_state_bytes(P)["total"]) < 1

print()
print("== Published numbers the calculator should reproduce ==")
opt13 = Cfg("OPT-13B", layers=40, hidden=5120, heads=40, kv_heads=40, ffn=0, vocab=0)
per_tok = kv_bytes_per_token(opt13)
print(f"OPT-13B KV per token : {per_tok:,.0f} bytes = {per_tok / 1024:.0f} KiB      (vLLM paper: 800 KB)")
print(f"OPT-13B 2048 tokens  : {kv_cache_bytes(opt13, 2048) / GIB:.2f} GiB            (vLLM paper: 1.6 GB)")
st = training_state_bytes(1.5e9)
print(f"GPT-2 1.5B 16-bit weights: {st['weights_16bit'] / 1e9:.1f} GB, all training states: {st['total'] / 1e9:.1f} GB   (ZeRO paper: 3 GB, 24 GB)")
for cfg, published in ((l2_7b, "6.7B (LLaMA paper, Table 2)"),
                       (Cfg("Qwen2.5-7B", 28, 3584, 28, 4, 18944, 152064), "7.61B (Qwen2.5-7B model card)")):
    print(f"{cfg.name:11s} computed {param_count(cfg) / 1e9:.3f}B parameters    (published: {published})")
```

Output:

```
== Hand checks (plain arithmetic, no calculator code) ==
per layer 202,383,360  x 32 layers + embeddings/head/norm = 6,738,415,616 parameters
FP16 weights = 13,476,831,232 bytes = 12.55 GiB
Mistral-7B KV cache = 131,072 bytes/token = 128 KiB; at 4096 tokens = 0.50 GiB
Llama-3-70B: 70,549,512,192 parameters x 16 bytes = 1051.3 GiB

== Published numbers the calculator should reproduce ==
OPT-13B KV per token : 819,200 bytes = 800 KiB      (vLLM paper: 800 KB)
OPT-13B 2048 tokens  : 1.56 GiB            (vLLM paper: 1.6 GB)
GPT-2 1.5B 16-bit weights: 3.0 GB, all training states: 24.0 GB   (ZeRO paper: 3 GB, 24 GB)
Llama-2-7B  computed 6.738B parameters    (published: 6.7B (LLaMA paper, Table 2))
Qwen2.5-7B  computed 7.615B parameters    (published: 7.61B (Qwen2.5-7B model card))
```

The hand arithmetic matches the calculator (the `assert` lines passed), and the calculator reproduces the three published figures. Note the unit: the vLLM paper's "800 KB" is 800 x 1024 bytes, and its "1.6 GB" for 2,048 tokens is 1.56 GiB, so the paper uses binary units loosely.

### Where the model architectures come from

| Model | `L` | `d` | `a` | `g` | `f` | `V` | Source |
|-------|-----|-----|-----|-----|-----|-----|--------|
| Llama-2-7B | 32 | 4096 | 32 | 32 | 11008 | 32000 | `L`, `d`, `a`: [LLaMA paper](https://arxiv.org/abs/2302.13971) Table 2 (Llama 2 reuses the architecture). `g`: the [Llama 2 paper](https://arxiv.org/abs/2307.09288) says only its 34B and 70B models use GQA. `V`: same paper, 32k tokens. `f`: derived, see below |
| Mistral-7B-v0.1 | 32 | 4096 | 32 | 8 | 14336 | 32000 | [Mistral 7B paper](https://arxiv.org/abs/2310.06825) Table 1; identical values in the model's [config.json](https://huggingface.co/mistralai/Mistral-7B-v0.1/blob/main/config.json) |
| Llama-3-8B | 32 | 4096 | 32 | 8 | 14336 | 128000* | [Llama 3 paper](https://arxiv.org/abs/2407.21783) Table 3 |
| Llama-3-70B | 80 | 8192 | 64 | 8 | 28672 | 128000* | [Llama 3 paper](https://arxiv.org/abs/2407.21783) Table 3 |

The Llama 2 checkpoints' own `config.json` files are gated on Hugging Face, so the Llama-2-7B MLP width `f` is derived from Meta's [official `llama/model.py`](https://github.com/meta-llama/llama/blob/main/llama/model.py): the MLP receives `hidden_dim = 4*d`, shrinks it to `int(2*hidden_dim/3)` = 10,922, then rounds up to a multiple of `multiple_of` (default 256), giving 11,008. The resulting total of 6.74B parameters agrees with the 6.7B in the LLaMA paper, which is a good consistency check.

\* The Llama 3 paper lists a vocabulary of 128,000. The released checkpoints' exact figure was not verified for this module (their repositories are gated). A difference of a few hundred tokens changes an 8B model's parameter count by about two million, 0.03%.

### Listing 3: run it on real architectures

```python
from dataclasses import replace
from memcalc import *

MODELS = [
    Cfg("Llama-2-7B",  layers=32, hidden=4096, heads=32, kv_heads=32, ffn=11008, vocab=32000),
    Cfg("Mistral-7B",  layers=32, hidden=4096, heads=32, kv_heads=8,  ffn=14336, vocab=32000),
    Cfg("Llama-3-8B",  layers=32, hidden=4096, heads=32, kv_heads=8,  ffn=14336, vocab=128000),
    Cfg("Llama-3-70B", layers=80, hidden=8192, heads=64, kv_heads=8,  ffn=28672, vocab=128000),
]

print("A. Weights")
print(f"{'model':12s} {'params':>8s} | {'FP16/BF16':>10s} {'INT8':>10s} {'INT4':>10s}")
for c in MODELS:
    n = param_count(c)
    print(f"{c.name:12s} {n / 1e9:7.2f}B | " + " ".join(f"{gib(weights_bytes(n, dt)):>10s}" for dt in ("fp16", "int8", "int4")))

print("\nB. KV cache (FP16)")
print(f"{'model':12s} {'kv heads':>8s} {'KiB/token':>10s} {'if MHA':>8s} {'saving':>7s} | {'4K x 1':>10s} {'32K x 8':>11s}")
for c in MODELS:
    mha = replace(c, kv_heads=c.heads)
    print(f"{c.name:12s} {c.kv_heads:>3d}/{c.heads:<4d} {kv_bytes_per_token(c) / 1024:10.0f} {kv_bytes_per_token(mha) / 1024:8.0f} "
          f"{c.heads // c.kv_heads:6d}x | {gib(kv_cache_bytes(c, 4096, 1)):>10s} {gib(kv_cache_bytes(c, 32768, 8)):>11s}")

print("\nC. Inference totals, 4096-token context, batch 1: FP16 weights + FP16 KV cache + 20% of weights as overhead")
for c in MODELS:
    t = inference_bytes(c, seq_len=4096, batch=1)
    print(f"  {c.name:12s} weights {t['weights'] / GIB:7.2f}  kv {t['kv_cache'] / GIB:6.2f}  "
          f"overhead {t['overhead'] / GIB:6.2f}  TOTAL {t['total'] / GIB:8.2f} GiB")

print("\nD. Training states, mixed-precision Adam (16 bytes/param). Activations NOT included.")
for c in MODELS:
    st = training_state_bytes(param_count(c))["total"]
    print(f"  {c.name:12s} {st / GIB:9.1f} GiB = {st / GIB / 80:5.1f} x 80 GiB")
```

Output:

```
A. Weights
model          params |  FP16/BF16       INT8       INT4
Llama-2-7B      6.74B |    12.55 GiB     6.28 GiB     3.14 GiB
Mistral-7B      7.24B |    13.49 GiB     6.74 GiB     3.37 GiB
Llama-3-8B      8.03B |    14.95 GiB     7.48 GiB     3.74 GiB
Llama-3-70B    70.55B |   131.41 GiB    65.70 GiB    32.85 GiB

B. KV cache (FP16)
model        kv heads  KiB/token   if MHA  saving |     4K x 1     32K x 8
Llama-2-7B    32/32          512      512      1x |     2.00 GiB   128.00 GiB
Mistral-7B     8/32          128      512      4x |     0.50 GiB    32.00 GiB
Llama-3-8B     8/32          128      512      4x |     0.50 GiB    32.00 GiB
Llama-3-70B    8/64          320     2560      8x |     1.25 GiB    80.00 GiB

C. Inference totals, 4096-token context, batch 1: FP16 weights + FP16 KV cache + 20% of weights as overhead
  Llama-2-7B   weights   12.55  kv   2.00  overhead   2.51  TOTAL    17.06 GiB
  Mistral-7B   weights   13.49  kv   0.50  overhead   2.70  TOTAL    16.69 GiB
  Llama-3-8B   weights   14.95  kv   0.50  overhead   2.99  TOTAL    18.44 GiB
  Llama-3-70B  weights  131.41  kv   1.25  overhead  26.28  TOTAL   158.94 GiB

D. Training states, mixed-precision Adam (16 bytes/param). Activations NOT included.
  Llama-2-7B       100.4 GiB =   1.3 x 80 GiB
  Mistral-7B       107.9 GiB =   1.3 x 80 GiB
  Llama-3-8B       119.6 GiB =   1.5 x 80 GiB
  Llama-3-70B     1051.3 GiB =  13.1 x 80 GiB
```

> [!example] Reading the tables. Llama-2-7B and Mistral-7B have the same width, depth and head size; the only big difference for the cache is `g`, 32 versus 8, and the cache per token drops from 512 KiB to 128 KiB. At eight 32K-token sequences that is 128 GiB versus 32 GiB: one fits on a data-center card next to the weights, the other does not. Llama-3-70B has 8 KV heads against 64 query heads, so its cache is 8x smaller than the same model with plain MHA would need (320 KiB versus 2,560 KiB per token). In FP16 the 70B model's weights alone (131 GiB) exceed one 80 GB card; INT4 brings them to about 33 GiB. Mistral-7B-v0.1 uses a sliding window of 4,096 tokens, so a stack with a rolling-buffer cache would hold less than the 32K row shows: that cell is an upper bound.

### Listing 4: activations, concurrency, and LoRA

```python
from memcalc import *

l2_7b = Cfg("Llama-2-7B", layers=32, hidden=4096, heads=32, kv_heads=32, ffn=11008, vocab=32000)
mistral = Cfg("Mistral-7B", layers=32, hidden=4096, heads=32, kv_heads=8, ffn=14336, vocab=32000)
l3_70 = Cfg("Llama-3-70B", layers=80, hidden=8192, heads=64, kv_heads=8, ffn=28672, vocab=128000)

print("1. Activation estimate, Llama-2-7B shape, sequence length 4096 (GiB):")
print(f"{'batch':>5s} {'stored (naive)':>15s} {'flash attn':>11s} {'recompute':>10s} {'both':>6s}")
for b in (1, 2, 4):
    cols = [activation_bytes(l2_7b, 4096, b, flash=fl, recompute=rc) / GIB
            for fl, rc in ((False, "none"), (True, "none"), (False, "full"), (True, "full"))]
    print(f"{b:5d} {cols[0]:15.1f} {cols[1]:11.1f} {cols[2]:10.1f} {cols[3]:6.1f}")

print("\n2. How many 4096-token sequences fit next to the weights on one 80 GiB card?")
for c, wd in ((l2_7b, "fp16"), (mistral, "fp16"), (l3_70, "int4")):
    n = max_concurrent_seqs(c, 80, 4096, weight_dtype=wd)
    print(f"  {c.name:12s} weights={wd:5s} kv_heads={c.kv_heads:2d} -> {n} sequences")

print("\n3. Fine-tuning Llama-2-7B: full versus LoRA (rank 8 on W_q, W_k, W_v, W_o), states only:")
P = param_count(l2_7b)
full = training_state_bytes(P)["total"]
r, d = 8, l2_7b.hidden
adapter = l2_7b.layers * 4 * r * (d + d)           # LoRA adds r*(d_in + d_out) parameters per adapted matrix
lora = 2 * P + 16 * adapter                          # frozen 16-bit base weights + full 16 B/param on the adapter only
print(f"  full fine-tune : {full / GIB:7.2f} GiB")
print(f"  LoRA r=8       : {lora / GIB:7.2f} GiB   ({adapter:,} adapter parameters = {100 * adapter / P:.2f}% of the model)")
```

Output:

```
1. Activation estimate, Llama-2-7B shape, sequence length 4096 (GiB):
batch  stored (naive)  flash attn  recompute   both
    1            97.6        17.6        4.6    2.1
    2           195.1        35.1        9.2    4.2
    4           390.3        70.3       18.4    8.4

2. How many 4096-token sequences fit next to the weights on one 80 GiB card?
  Llama-2-7B   weights=fp16  kv_heads=32 -> 32 sequences
  Mistral-7B   weights=fp16  kv_heads= 8 -> 127 sequences
  Llama-3-70B  weights=int4  kv_heads= 8 -> 32 sequences

3. Fine-tuning Llama-2-7B: full versus LoRA (rank 8 on W_q, W_k, W_v, W_o), states only:
  full fine-tune :  100.41 GiB
  LoRA r=8       :   12.68 GiB   (8,388,608 adapter parameters = 0.12% of the model)
```

The first block is the whole story of why FlashAttention and checkpointing exist. Taken literally, the naive column says one 4096-token sequence of a 7B model needs about 98 GiB of activations: the quadratic score term is most of it. Dropping it (flash) leaves 17.6 GiB, and recomputing layers instead of storing them drops it to 4.6 GiB (2.1 GiB with both). These are estimates from a formula derived for another block design, so read them as "tens of GiB versus a few GiB", not as measurements. Block 2 is the GQA payoff in users: 4x fewer KV heads is 4x more concurrent sequences (127 versus 32, since the 7B weights are almost the same size). Block 3 is the LoRA payoff: 100 GiB of states becomes under 13.

## Visual diagram

Where each factor of the KV-cache formula comes from, then what GQA changes:

```
 KV cache bytes = 2  x  L  x  g  x  d_h  x  s  x  B  x  b
                  │     │     │     │      │     │     │
                  │     │     │     │      │     │     └ bytes per number: 2 (FP16/BF16), 1 (INT8)
                  │     │     │     │      │     └ sequences served at the same time
                  │     │     │     │      └ tokens so far (prompt + generated)
                  │     │     │     └ numbers per head: 128 in every model above
                  │     │     └ KV heads: the GQA/MQA knob
                  │     └ layers (each keeps its own cache)
                  └ one key and one value per token

 8 query heads Q1..Q8, three attention designs:

  MHA, g = 8             GQA, g = 2              MQA, g = 1
  Q1 Q2 Q3 Q4 Q5 Q6 Q7 Q8   Q1 Q2 Q3 Q4 Q5 Q6 Q7 Q8   Q1 Q2 Q3 Q4 Q5 Q6 Q7 Q8
  │  │  │  │  │  │  │  │    └──┴──┴──┘  └──┴──┴──┘    └──┴──┴──┴──┴──┴──┴──┘
  K  K  K  K  K  K  K  K        KV1         KV2                  KV
  V  V  V  V  V  V  V  V
  cache: 8 units            cache: 2 units (4x less)   cache: 1 unit (8x less)
```

Bytes per parameter during mixed-precision Adam training, and how the pieces group:

```
 one parameter
 ┌────────┬────────┬────────────────┬────────────────┬────────────────┐
 │ weight │  grad  │ master weight  │   Adam m       │   Adam v       │
 │  2 B   │  2 B   │  4 B (FP32)    │   4 B (FP32)   │   4 B (FP32)   │
 └────────┴────────┴────────────────┴────────────────┴────────────────┘
 └──── 2 + 2 = 4 B ───┘└────────── K = 12 B (ZeRO paper) ──────────┘     total 16 B

 model-state memory = 16 B x P         (activations are extra, and scale with batch x sequence)
```

## Practice

### 1. Size a model from its config

Qwen2.5-7B's [config.json](https://huggingface.co/Qwen/Qwen2.5-7B/blob/main/config.json) reads: `hidden_size` 3584, `intermediate_size` 18944, `num_attention_heads` 28, `num_hidden_layers` 28, `num_key_value_heads` 4, `vocab_size` 152064, `tie_word_embeddings` false. Using the calculator: (a) how many parameters and how many GiB in BF16? (b) KV bytes per token and the cache for one 32,768-token sequence? (c) how much larger would the per-token cache be if it used plain MHA?

<details><summary>Answer</summary>

Build `Cfg("Qwen2.5-7B", 28, 3584, 28, 4, 18944, 152064)`. (a) 7,615,487,488 parameters (the model card says 7.61B; the small difference from bias terms is far below rounding), so 14.18 GiB in BF16. (b) The head dimension is 3584 / 28 = 128, so `2 x 28 x 4 x 128 x 2` = 57,344 bytes = 56 KiB per token, and 32,768 tokens is 1.75 GiB. (c) With 28 KV heads instead of 4 the cache would be 28 / 4 = 7 times larger: 392 KiB per token. (All three computed with the calculator.)

</details>

### 2. Training states and the number of cards

A 13-billion-parameter model is fine-tuned with mixed-precision Adam. How much memory do the model states need, and what is the smallest number of 80 GiB cards if they could be split perfectly (ignoring activations and overhead)?

<details><summary>Answer</summary>

`13e9 x 16` bytes = 193.7 GiB. Divided by 80 GiB gives 2.42, so at least 3 cards, and that is a lower bound: real sharding is never perfect and activations and overhead come on top (Modules 09 to 11).

</details>

### 3. How many users fit?

On a 24 GiB card, how many 8,192-token sequences of Llama-3-8B (FP16 weights, FP16 cache, 20% overhead) can be served at once?

<details><summary>Answer</summary>

Weights x 1.2 = 14.95 x 1.2 = 17.94 GiB, leaving 6.06 GiB. One sequence's cache is 128 KiB x 8,192 = 1.0 GiB. So `max_concurrent_seqs(l3_8b, 24, 8192)` returns 6 sequences. With INT8 weights the answer would be larger; with MHA instead of GQA far smaller.

</details>

### 4. How much batch can checkpointing buy?

For the Llama-2-7B shape at sequence length 2,048, what is the largest micro-batch whose estimated activations fit in 20 GiB under (a) naive storage, (b) flash-style attention, (c) full recomputation, (d) both? Use `activation_bytes`.

<details><summary>Answer</summary>

Loop `b` upward until the estimate exceeds 20 GiB: (a) not even batch 1 fits (28.8 GiB), (b) 2, (c) 11, (d) 19. As always these are estimates from a formula for a different block design; the ordering and the size of the gaps are the useful result.

</details>

### Checkpoint quiz

1. Compute the KV cache per token for Llama-3-70B (`L=80`, `g=8`, `d_h=128`, FP16). How much would 8,192 tokens take?
2. List the five tensors behind "16 bytes per parameter".
3. Which term of the activation formula is quadratic in sequence length, and which technique removes it?
4. Weights of a 7B-parameter model in INT4, ignoring metadata?
5. Name three reasons the calculator's total will not exactly match `nvidia-smi`.

<details><summary>Answers</summary>

1. `2 x 80 x 8 x 128 x 2` = 327,680 bytes = 320 KiB per token; 8,192 tokens = 2.5 GiB.
2. 16-bit working weights (2), 16-bit gradients (2), FP32 master weights (4), Adam first moment (4), Adam second moment (4).
3. The `5*a*s/h` term, from the attention score matrices; memory-efficient attention such as FlashAttention (Module 08).
4. 7e9 x 0.5 = 3.5e9 bytes = 3.26 GiB.
5. Any three of: the flat overhead is a guess; the CUDA context and kernel workspaces; allocator caching and fragmentation (`nvidia-smi` shows reserved, not used); the activation formula is for a different block design; GB versus GiB; memory held outside the framework's allocator.

</details>

> [!check]
> - I can compute weight memory from a parameter count and a precision, and count parameters from a config
> - I can derive the KV-cache formula and explain what GQA and MQA change
> - I can derive 2 + 2 + 4 + 4 + 4 = 16 bytes per parameter and say which parameters pay it
> - I can say what the activation estimate depends on and what checkpointing trades
> - I can run the calculator on a new config and state its limits

## Project

Turn the calculator into a tool that works from a model card. Write `fit.py` that takes a Hugging Face model id and a GPU size, downloads that repository's public `config.json` with the standard library (`urllib`), and prints a report: parameter count (and how it compares with any size stated on the model card), weight memory at FP16/BF16, INT8 and INT4, KV cache per token and for a context length you pass in, and the number of concurrent sequences that fit.

Requirements: handle configs with no `num_key_value_heads` (it means MHA), configs that state `head_dim` explicitly, and tied embeddings; refuse politely on gated repositories rather than crashing; print which assumptions the model violates (bias terms, mixture-of-experts fields such as an expert count). Stretch: add a training mode that reports the 16-byte states and the minimum number of cards under perfect sharding. There is no reference solution. Test it on the four architectures in listing 3 and on one model you pick yourself, and compare against the published size.

## Interview questions

> [!interview] Estimate whether a 70B-parameter model can serve 10 concurrent 8K-context users on a single 80 GB GPU. Walk through the arithmetic and say what you would change.

<details><summary>What a strong answer covers</summary>

Weights: 70e9 x 2 bytes = 140 GB in FP16, far over 80 GB, so it does not fit as is. Options: INT4 weights (about 35 GB) or more than one GPU. KV cache: use the formula `2 x L x g x d_h x s x B x b`; with a GQA model such as one with 80 layers, 8 KV heads and head dimension 128 it is about 320 KiB per token, so 8K tokens x 10 users is roughly 25 GiB in FP16. A candidate who forgets GQA and uses MHA gets an 8x larger, wrong number. Add 10 to 20% overhead. With INT4 weights (about 33 GiB) the total is roughly 58 to 65 GiB: tight but plausible on one 80 GB card; with FP16 weights you need at least two cards. A strong answer states assumptions, units, and that you would measure.

</details>

> [!interview] Derive the KV-cache size formula and explain how grouped-query attention changes it, and what it does not change.

<details><summary>What a strong answer covers</summary>

Per token per layer, store one key and one value vector per KV head, each of head dimension `d_h`: `2 x g x d_h` numbers; multiply by layers, bytes per number, tokens and batch. GQA reduces `g` below the number of query heads `a`, shrinking the cache by `a / g` (MQA is `g = 1`). It does not change the number of query heads, so attention compute is similar, and it does not change the weights much (the K and V projections shrink a little). Quality is close to full multi-head attention when models are trained or uptrained that way. Also mention the second benefit: less cache to read per generated token.

</details>

> [!interview] Why does fine-tuning a 7B model in mixed precision with Adam need around 100+ GiB, and how does LoRA change that?

<details><summary>What a strong answer covers</summary>

16 bytes per trainable parameter: 2 (working weights) + 2 (gradients) + 4 (FP32 master weights) + 4 + 4 (Adam moments), so about 7e9 x 16 = 112e9 bytes. Activations come on top. LoRA freezes the base weights, so they cost only their 2 bytes each, and only the small adapter pays 16 bytes per parameter. For rank 8 on the four attention projections that is about 8.4M adapter parameters, bringing the states to roughly 12.7 GiB. Activations are still needed to backpropagate through frozen layers, so they remain, and checkpointing still helps.

</details>

## Common mistakes & troubleshooting

| Symptom | Likely cause | What to do |
|---------|--------------|------------|
| Calculator says it fits, real run runs out of memory | Overhead, prefill activations, fragmentation, or a serving engine reserving its own pool | Leave 10 to 20% headroom and measure `torch.cuda.max_memory_allocated()` and `memory_reserved()` |
| Computed parameter count is far from the published size | Wrong `intermediate_size`, MoE model, tied embeddings, extra bias terms, or `head_dim` that is not `hidden / heads` | Compare per component against the model card; set `tied_embeddings`; for MoE count all experts |
| Numbers are about 7% off from another tool | GB versus GiB | Check which unit each tool prints (1 GiB = 1.0737 GB) |
| KV cache estimate is 4x to 8x too large | Config has fewer KV heads than query heads and you used `g = a` | Read `num_key_value_heads`; if absent, `g = a` |
| Activation estimate is wildly high | Formula assumes the attention score matrices are stored | Check whether your attention implementation is memory-efficient (Module 08); recompute estimate with `flash=True` |
| Quantized model file is larger than params x bits / 8 | Scale factors and layers kept at higher precision | Use the file size as the truth; see the quantization module |

## Further reading & sources

- [ZeRO: Memory Optimizations Toward Training Trillion Parameter Models](https://arxiv.org/abs/1910.02054) - source of the `(2 + 2 + K) x P` accounting with `K = 12` for mixed-precision Adam and the 1.5B GPT-2 example (24 GB versus 3 GB).
- [Reducing Activation Recomputation in Large Transformer Models](https://arxiv.org/abs/2205.05198) - derives the per-layer activation formula `s*b*h*(34 + 5*a*s/h)` and the full and selective recomputation variants used in listing 1.
- [Efficient Memory Management for Large Language Model Serving with PagedAttention](https://arxiv.org/abs/2309.06180) - gives the worked KV-cache example (OPT-13B, 800 KB per token) the calculator is checked against.
- [GQA: Training Generalized Multi-Query Transformer Models from Multi-Head Checkpoints](https://arxiv.org/abs/2305.13245) - defines grouped-query attention and its quality/speed trade-off against MHA and MQA.
- [Fast Transformer Decoding: One Write-Head is All You Need](https://arxiv.org/abs/1911.02150) - the multi-query attention paper: one shared key/value head and why it speeds up incremental decoding.
- [The Llama 3 Herd of Models](https://arxiv.org/abs/2407.21783) - Table 3 provides the layers, widths, heads and KV heads used for the 8B and 70B rows.
- [Mistral 7B](https://arxiv.org/abs/2310.06825) - Table 1 gives the architecture used here and describes the sliding-window rolling-buffer cache.
- [Hugging Face Accelerate: Model memory estimator](https://huggingface.co/docs/accelerate/usage_guides/model_size_estimator) - a ready-made estimator and the source of the "up to 20% more for inference" rule of thumb; useful as a cross-check against this module's calculator.

## Next

[Module 06: Numeric Formats: FP32, FP16, BF16](../06-numeric-formats-fp32-fp16-bf16/README.md)
