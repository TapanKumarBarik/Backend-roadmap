# Module 10: Model and Tensor Parallelism

## Roadmap

You are in **Track 05: GPUs & GenAI Hardware**. Module 09 copied the whole model onto every GPU. This module covers the case where one copy does not fit, and the next one adds pipeline parallelism and ZeRO.

**Before this module**
- [Module 05: Calculating a Model's Memory Requirements](../05-calculating-a-models-memory-requirements/README.md) and [Module 04: VRAM: The Real Constraint](../04-vram-the-real-constraint/README.md) - how to tell that a model will not fit.
- [Module 09: Data Parallelism](../09-data-parallelism/README.md) - the all-reduce and ring cost formula reused here.
- [Module 08: Multi-Head Attention](../../02-transformer-architecture/08-multi-head-attention/README.md) and [Module 12: The Feed-Forward Network](../../02-transformer-architecture/12-the-feed-forward-network/README.md) (Track 02) - the two blocks this module cuts up.

**After this module you can**
- show when training states exceed one GPU and why simply stacking layers on different GPUs wastes them;
- split a linear layer by columns or rows, and state which one needs a sum afterwards;
- lay out the Megatron-style MLP and attention block so that each needs exactly one all-reduce, and prove numerically that the split reproduces the full output;
- explain why tensor parallelism belongs on the fastest links (NVLink within a server) and not across slow ones.

**Why it matters.** Models with billions of parameters cannot be trained or served on one card. Tensor parallelism is how a single layer's matrix multiplications get spread over several GPUs, and it is the reason GPU servers are built with fast GPU-to-GPU links.

## Concept

> [!key] Tensor parallelism splits each weight matrix across GPUs so every GPU computes a slice of every layer: a column-parallel layer followed by a row-parallel layer needs just one all-reduce per block, which is only affordable on very fast links such as NVLink.

## Explanation

### When the model does not fit on one GPU

Training with mixed precision and Adam keeps, per parameter: 2 bytes of 16-bit weights, 2 bytes of 16-bit gradients, and 12 bytes of optimizer state (a 32-bit copy of the weights plus Adam's two moments). That is 16 bytes per parameter, the accounting used in the ZeRO paper (section 3.1) and revisited in module 11. Activations, buffers and fragmentation come on top.

```
model states = 16 bytes/parameter; one GPU has 80 GB

  params   model states  fits on 1 GPU?   min GPUs (states only)
    1.3B          21 GB            True                        1
      7B         112 GB           False                        2
     13B         208 GB           False                        3
     70B       1,120 GB           False                       14

(activations, buffers and fragmentation come on top of this, so the real minimum is higher)
```

A 7B-parameter model's states alone already exceed an 80 GB card, so something other than data parallelism (which keeps a full copy per GPU) must split the model.

### Naive layer-wise model parallelism

The simplest split: layers 0-7 on GPU 0, layers 8-15 on GPU 1, and so on. It fits the model, but a single batch flows through the GPUs one after another, so only one is busy at any moment:

```
4 GPUs, one batch (F = forward, B = backward, . = idle):
  GPU 0: F.........BB
  GPU 1: .F......BB..
  GPU 2: ..F...BB....
  GPU 3: ...FBB......

 GPUs  busy ticks / GPU  total ticks  utilization
    1                 3            3      100.0%
    2                 3            6       50.0%
    4                 3           12       25.0%
    8                 3           24       12.5%
   16                 3           48        6.2%
```

With G GPUs each is busy 1/G of the time (the table is the simulation's count: 25% for 4 GPUs, 6.2% for 16). This is a correct way to *store* a big model and a poor way to *run* it. Splitting the batch into micro-batches that follow each other down the line fixes much of the idling; that is pipeline parallelism, in module 11.

### Tensor parallelism: split inside each layer

Instead of giving each GPU different layers, give each GPU a slice of every layer. A linear layer is `Y = X A`. There are two ways to cut `A` across t GPUs:

- **Column-parallel**: split `A` by columns, `A = [A1 | A2 | ...]`. Every GPU receives the full input `X`, computes `X Ai`, and holds its own slice of the output columns. Gluing the slices together gives `Y`. **No summation is needed.**
- **Row-parallel**: split `A` by rows and the input by columns, `X = [X1 | X2 | ...]`, so `Y = X1 A1 + X2 A2 + ...`. Each GPU produces a full-size but *incomplete* result; the true output is their sum. **An all-reduce is needed.**

### The Megatron MLP: column-parallel, then row-parallel

A transformer MLP is `Z = GeLU(X A) B`, with `A` of size h x 4h and `B` of size 4h x h. The Megatron-LM paper's arrangement:

1. Split `A` by **columns**. Each GPU computes its slice of `X A` and applies GeLU to it locally. This works because GeLU acts element by element, so it can run on a slice.
2. Split `B` by **rows**. Each GPU's slice of GeLU output is exactly the input slice its rows of `B` need, so no communication happens between the two matrix multiplies.
3. Each GPU now holds a partial `Z`. One **all-reduce** sums them.

> [!pitfall]
> The order is not interchangeable. GeLU is nonlinear, so `GeLU(X1A1 + X2A2)` is not `GeLU(X1A1) + GeLU(X2A2)`. Splitting `A` by rows would force an all-reduce *before* the GeLU, on the 4h-wide tensor, four times larger than the h-wide tensor of the Megatron layout. The snippet below measures both: a mismatch of 1.23 if you apply GeLU to partial sums, and 768 versus 192 numbers to reduce in the toy shapes.

In the backward pass the roles mirror: the paper defines two conjugate operators, `f` (identity going forward, all-reduce going backward) and `g` (all-reduce going forward, identity going backward). Each block therefore costs one all-reduce forward and one backward.

### Attention: split the heads

Attention heads are independent of one another. The Megatron layout gives each GPU a group of heads: the Q, K, V projections are column-parallel (each GPU's columns belong to its heads), each GPU runs attention for its heads without any communication, and the output projection is row-parallel, ending in one all-reduce. In total a transformer layer needs two all-reduces in the forward pass (attention, MLP) and two in the backward pass. The number of heads and the MLP width must be divisible by t.

### What it costs: communication and interconnect

Tensor parallelism communicates **activations, inside every layer**: each all-reduce moves a tensor of `tokens x hidden` elements, and that happens four times per layer per step (two forward, two backward). Data parallelism, by contrast, communicates gradients once per step. So tensor-parallel traffic is far more frequent and sits directly on the critical path: a layer cannot start its next matmul until the all-reduce finishes.

That makes link speed decisive. NVIDIA's A100 datasheet lists NVLink at 600 GB/s and PCIe Gen4 at 64 GB/s for the same GPU, a ratio of about 9.4x. The last snippet turns this into per-layer numbers under stated assumptions.

> [!pitfall]
> Do not stretch a tensor-parallel group across servers. With these assumptions a PCIe-class link spends more time communicating than computing at 8-way (128% of compute time), while NVLink spends 14%. Megatron-LM drew the same line: its 8-way groups sat inside one DGX-2H server (300 GB/s between GPUs via NVSwitch) and data parallelism ran across servers (100 GB/s of InfiniBand between servers, per the paper). The paper reports 76% scaling efficiency at 512 GPUs (8.3B parameters) against a strong single-GPU baseline.

In practice: **tensor parallelism inside a node, data parallelism (and pipeline parallelism) across nodes.** Tensor parallelism also shrinks per-GPU weight, gradient and optimizer memory by about t for the layers it splits, but it does not speed up a model that already fits comfortably on one GPU, because it adds communication to every layer.

> [!model]
> Think of t cooks sharing one very large recipe step. Each takes some ingredients, they work simultaneously, then they must combine their bowls before anyone can continue. If the cooks stand at one counter (NVLink) combining is quick; if they are in different buildings (PCIe, a network) the combining time swamps the cooking.

## Code

Python 3.13, numpy 2.4.6 only. "GPUs" are list entries; an all-reduce is a Python `sum`.

**Step 1 - does it fit?** (`s0_does_it_fit.py`, output shown above)

```python
import math

# Mixed-precision training with Adam keeps, per parameter (ZeRO paper, section 3.1):
#   2 bytes fp16/bf16 weights + 2 bytes gradients + 12 bytes optimizer state (fp32 weights, momentum, variance)
BYTES_PER_PARAM = 2 + 2 + 12
GPU_MEMORY_GB = 80            # A100 80GB, per NVIDIA's datasheet

print(f"model states = {BYTES_PER_PARAM} bytes/parameter; one GPU has {GPU_MEMORY_GB} GB\n")
print(f"{'params':>8} {'model states':>14} {'fits on 1 GPU?':>15} {'min GPUs (states only)':>24}")
for billions in (1.3, 7, 13, 70):
    gb = billions * 1e9 * BYTES_PER_PARAM / 1e9
    print(f"{billions:>7}B {gb:>11,.0f} GB {str(gb <= GPU_MEMORY_GB):>15} {math.ceil(gb / GPU_MEMORY_GB):>24}")
print("\n(activations, buffers and fragmentation come on top of this, so the real minimum is higher)")
```

**Step 2 - naive layer-wise parallelism idles the GPUs.** (`s3_naive_layerwise.py`, output shown above.) F is a forward tick, B a backward tick (twice as long), `.` is idle.

```python
# Naive layer-wise model parallelism: GPU g owns layers g*L/G .. (g+1)*L/G - 1, one batch flows
# through GPU 0 -> 1 -> ... -> G-1 (forward), then the gradients flow back G-1 -> ... -> 0.
# Time unit: one forward pass through one GPU's layers = 1 tick; its backward = 2 ticks.
T_F, T_B = 1, 2


def timeline(G):
    width = G * T_F + G * T_B
    grid = [["."] * width for _ in range(G)]
    for g in range(G):                                  # forward ripples down the GPUs
        for t in range(g * T_F, (g + 1) * T_F):
            grid[g][t] = "F"
    start = G * T_F                                     # backward starts after the last forward
    for g in reversed(range(G)):                        # ... and ripples back up
        for t in range(start, start + T_B):
            grid[g][t] = "B"
        start += T_B
    return grid


print("4 GPUs, one batch (F = forward, B = backward, . = idle):")
for g, row in enumerate(timeline(4)):
    print(f"  GPU {g}: {''.join(row)}")

print(f"\n{'GPUs':>5} {'busy ticks / GPU':>17} {'total ticks':>12} {'utilization':>12}")
for G in (1, 2, 4, 8, 16):
    grid = timeline(G)
    busy = sum(c != "." for c in grid[0])
    total = len(grid[0])
    print(f"{G:>5} {busy:>17} {total:>12} {busy / total:>11.1%}")
```

**Step 3 - column-parallel, row-parallel and the Megatron MLP, verified against the unsplit computation.**

```python
import numpy as np

rng = np.random.default_rng(0)


def gelu(x):                                    # tanh approximation used by GPT-2 / Megatron
    return 0.5 * x * (1 + np.tanh(np.sqrt(2 / np.pi) * (x + 0.044715 * x ** 3)))


def all_reduce_sum(partials):                   # what NCCL would do across GPUs: sum, give everyone the result
    return sum(partials)


batch, h, k = 6, 32, 128                        # hidden size h, MLP inner size k = 4h
X = rng.standard_normal((batch, h))
A = rng.standard_normal((h, k)) / np.sqrt(h)    # first MLP weight  (h x 4h)
B = rng.standard_normal((k, h)) / np.sqrt(k)    # second MLP weight (4h x h)

# 1) Column-parallel: split A by COLUMNS. Each "GPU" computes its slice of the output; no summing.
t = 4
A_cols = np.split(A, t, axis=1)
Y_parts = [X @ A_i for A_i in A_cols]                              # each (batch, k/t)
print("column-parallel, concat == X@A :", np.allclose(np.concatenate(Y_parts, axis=1), X @ A))

# 2) Row-parallel: split B by ROWS and the input by columns. Each GPU produces a PARTIAL SUM.
B_rows = np.split(B, t, axis=0)
Y = X @ A
Y_cols = np.split(Y, t, axis=1)
Z_parts = [Y_i @ B_i for Y_i, B_i in zip(Y_cols, B_rows)]          # each (batch, h), incomplete
print("row-parallel, sum == Y@B       :", np.allclose(all_reduce_sum(Z_parts), Y @ B))
print("one partial alone is wrong     :", not np.allclose(Z_parts[0], Y @ B))

# 3) Megatron MLP: column-parallel -> GeLU (local) -> row-parallel -> ONE all-reduce.
full = gelu(X @ A) @ B
print("\nMLP  t  max |sharded - full|")
for t in (1, 2, 4, 8, 16):
    A_cols, B_rows = np.split(A, t, axis=1), np.split(B, t, axis=0)
    partials = [gelu(X @ A_i) @ B_i for A_i, B_i in zip(A_cols, B_rows)]   # runs independently per GPU
    out = all_reduce_sum(partials)                                          # the single communication
    print(f"     {t:>2}  {np.abs(out - full).max():.2e}")
    assert np.allclose(out, full)

# 4) Why column FIRST: GeLU is nonlinear, so you cannot apply it to partial sums.
t = 2
X_cols, A_rows = np.split(X, t, axis=1), np.split(A, t, axis=0)             # row-parallel first matmul
wrong = sum(gelu(X_i @ A_i) for X_i, A_i in zip(X_cols, A_rows))            # GeLU on each partial sum
print("\nGeLU(X1A1) + GeLU(X2A2) vs GeLU(X1A1 + X2A2): max diff =", f"{np.abs(wrong - gelu(X @ A)).max():.3f}")

# 5) How much data the single all-reduce moves, vs the alternative that must sum BEFORE GeLU.
print(f"all-reduce after the row-parallel layer: {batch * h} numbers (batch x h)")
print(f"all-reduce before GeLU instead         : {batch * k} numbers (batch x 4h) -> {k // h}x more")
```

```
column-parallel, concat == X@A : True
row-parallel, sum == Y@B       : True
one partial alone is wrong     : True

MLP  t  max |sharded - full|
      1  0.00e+00
      2  6.66e-16
      4  8.88e-16
      8  6.66e-16
     16  8.88e-16

GeLU(X1A1) + GeLU(X2A2) vs GeLU(X1A1 + X2A2): max diff = 1.231
all-reduce after the row-parallel layer: 192 numbers (batch x h)
all-reduce before GeLU instead         : 768 numbers (batch x 4h) -> 4x more
```

> [!example]
> The 1e-16-level differences are float64 rounding from adding partial sums in a different order, so equality is checked with `np.allclose`. A single partial result alone (`one partial alone is wrong: True`) is not the answer: the all-reduce is part of the algorithm. The last two lines are the quantitative reason for the Megatron ordering: 4x less data in the one required all-reduce.

**Step 4 - attention heads split across GPUs.** Eight heads, causal mask; each "GPU" runs its own heads with column slices of the Q/K/V weights, and the output projection is row-sliced.

```python
import numpy as np

rng = np.random.default_rng(1)
n_heads, d_head, seq = 8, 8, 10
d_model = n_heads * d_head
X = rng.standard_normal((seq, d_model))
Wq, Wk, Wv, Wo = (rng.standard_normal((d_model, d_model)) / np.sqrt(d_model) for _ in range(4))
causal = np.triu(np.full((seq, seq), -np.inf), k=1)


def attention_heads(X, Wq, Wk, Wv, heads):
    """Causal attention for `heads` heads whose weights are the given column slices; returns (seq, heads*d_head)."""
    outs = []
    for hd in range(heads):
        sl = slice(hd * d_head, (hd + 1) * d_head)
        q, k, v = X @ Wq[:, sl], X @ Wk[:, sl], X @ Wv[:, sl]
        s = q @ k.T / np.sqrt(d_head) + causal
        p = np.exp(s - s.max(-1, keepdims=True))
        p /= p.sum(-1, keepdims=True)
        outs.append(p @ v)
    return np.concatenate(outs, axis=1)


full = attention_heads(X, Wq, Wk, Wv, n_heads) @ Wo                   # all heads on one GPU

print("GPUs  heads/GPU  max |tensor-parallel - full|")
for t in (1, 2, 4, 8):
    hp = n_heads // t                                                  # heads per GPU
    partials = []
    for g in range(t):                                                 # each loop pass = one GPU
        cols = slice(g * hp * d_head, (g + 1) * hp * d_head)
        local = attention_heads(X, Wq[:, cols], Wk[:, cols], Wv[:, cols], hp)   # column-parallel Q,K,V
        partials.append(local @ Wo[cols, :])                           # row-parallel output projection
    out = sum(partials)                                                # the one all-reduce
    print(f"{t:>4} {hp:>10}  {np.abs(out - full).max():.2e}")
    assert np.allclose(out, full)
```

```
GPUs  heads/GPU  max |tensor-parallel - full|
   1          8  0.00e+00
   2          4  8.88e-16
   4          2  8.88e-16
   8          1  8.88e-16
```

**Step 5 - communication versus compute per layer.** All sizes are illustrative assumptions (stated in the code). FLOPs are counted from matmul shapes: 12h² weights per layer (QKV 3h², output h², MLP 8h²) at 2 FLOPs per weight per token, plus the attention scores. The 312 TFLOPS peak and the two link speeds come from NVIDIA's A100 datasheet (checked Oct 2026); the link speeds are treated as usable one-way bandwidth, which is optimistic, but the NVLink/PCIe ratio does not depend on that convention.

```python
# How much does tensor parallelism communicate, and how long does that take on each link?
# All sizes are ASSUMED illustrative values; hardware figures come from NVIDIA's A100 datasheet.
batch, seq, hidden = 4, 2048, 4096          # tokens per step = batch * seq
BYTES = 2                                   # bf16 activations
PEAK_FLOPS = 312e12                         # A100 BF16 dense peak (datasheet)
ACHIEVED = 0.5 * PEAK_FLOPS                 # assume the matmuls reach 50% of peak
LINKS = {"NVLink 600 GB/s": 600e9, "PCIe4 64 GB/s": 64e9}

tokens = batch * seq
msg_bytes = tokens * hidden * BYTES                              # one activation tensor: (tokens, hidden)
# Forward FLOPs of one transformer layer, counted from the matmul shapes:
#   QKV 3h^2 + out-proj h^2 + MLP 8h^2 = 12 h^2 weights, 2 FLOPs per weight per token,
#   plus attention scores/values 4 * batch * seq^2 * hidden.
layer_flops = 2 * tokens * 12 * hidden ** 2 + 4 * batch * seq ** 2 * hidden
print(f"activation tensor to all-reduce: {msg_bytes / 2**20:.0f} MiB;  layer forward = {layer_flops / 1e12:.2f} TFLOP")

print("\nForward pass of ONE layer: 2 all-reduces (attention output, MLP output), per Megatron-LM")
print(f"{'t':>3} {'compute/GPU':>12} " + " ".join(f"{name + ' comm':>22} {'comm/compute':>13}" for name in LINKS))
for t in (2, 4, 8):
    compute = layer_flops / t / ACHIEVED
    volume = 2 * (t - 1) / t * msg_bytes * 2                      # ring volume per GPU, two all-reduces
    cells = []
    for bw in LINKS.values():
        comm = volume / bw
        cells.append(f"{comm * 1000:>19.2f} ms {comm / compute:>12.0%}")
    print(f"{t:>3} {compute * 1000:>9.2f} ms " + " ".join(cells))
print(f"\nbandwidth ratio NVLink / PCIe = {600 / 64:.1f}x")
```

```
activation tensor to all-reduce: 64 MiB;  layer forward = 3.57 TFLOP

Forward pass of ONE layer: 2 all-reduces (attention output, MLP output), per Megatron-LM
  t  compute/GPU   NVLink 600 GB/s comm  comm/compute     PCIe4 64 GB/s comm  comm/compute
  2     11.45 ms                0.22 ms           2%                2.10 ms          18%
  4      5.73 ms                0.34 ms           6%                3.15 ms          55%
  8      2.86 ms                0.39 ms          14%                3.67 ms         128%

bandwidth ratio NVLink / PCIe = 9.4x
```

Compute per GPU falls as 1/t, while the communication volume per GPU does not (it even rises slightly, as 2(t-1)/t), so the communication share of a layer grows as you add tensor-parallel GPUs. On NVLink it stays small at 8-way; on PCIe it exceeds the compute time.

**Step 6 - the two operators in a framework.** *Not executed in this module's verification (needs PyTorch and a multi-GPU `torch.distributed` process group).* This is the paper's Code 1 written as a modern autograd function; `f` goes in front of a column-parallel layer, `g` after a row-parallel one.

```python
import torch
import torch.distributed as dist

class F(torch.autograd.Function):          # Megatron "f": identity forward, all-reduce backward
    @staticmethod
    def forward(ctx, x):
        return x
    @staticmethod
    def backward(ctx, grad):
        dist.all_reduce(grad)               # sum the gradients of X coming from every shard
        return grad

class G(torch.autograd.Function):          # Megatron "g": all-reduce forward, identity backward
    @staticmethod
    def forward(ctx, x):
        dist.all_reduce(x)                  # sum the partial outputs of the row-parallel layer
        return x
    @staticmethod
    def backward(ctx, grad):
        return grad
```

## Visual diagram

```
MEGATRON MLP ON 2 GPUs:   Z = GeLU(X A) B      A (h x 4h) split by COLUMNS,  B (4h x h) split by ROWS

                 column-parallel        local        row-parallel
                 (slices, no sum)       GeLU         (partial sums)
  GPU 0:  X ──►  [ A1  h x 2h ]  ──►  GeLU  ──►  [ B1  2h x h ]  ──►  Z0 ──┐
                                                                            ├─► all-reduce ─► Z = Z0 + Z1
  GPU 1:  X ──►  [ A2  h x 2h ]  ──►  GeLU  ──►  [ B2  2h x h ]  ──►  Z1 ──┘

  every GPU gets the same X; nothing is communicated between the two matmuls;
  forward cost: ONE all-reduce of a (tokens x h) tensor
```

```
NAIVE LAYER-WISE SPLIT (4 GPUs, one batch)        TENSOR-PARALLEL SPLIT (4 GPUs)

  GPU 0: F.........BB                              every GPU works on every layer, at the same time
  GPU 1: .F......BB..                              GPU 0: layer1 slice | layer2 slice | ...
  GPU 2: ..F...BB....                              GPU 1: layer1 slice | layer2 slice | ...
  GPU 3: ...FBB......                              (cost: all-reduces inside every layer)
  one GPU busy at a time -> 25% utilization
```

```
WHERE TENSOR PARALLELISM BELONGS

  ┌───────────── server A ─────────────┐                  ┌───────────── server B ─────────────┐
  │ GPU0 ═ GPU1 ═ GPU2 ... GPU7        │                  │ GPU0 ═ GPU1 ═ GPU2 ... GPU7        │
  │ NVLink / NVSwitch (fast)           │ ══ network ══    │ NVLink / NVSwitch (fast)           │
  │ tensor-parallel group of 8         │  (much slower)   │ tensor-parallel group of 8         │
  └────────────────────────────────────┘                  └────────────────────────────────────┘
   tensor parallelism INSIDE a server;   data parallelism (same weights) ACROSS servers
   A100 datasheet: NVLink 600 GB/s vs PCIe Gen4 64 GB/s (about 9.4x apart)
```

## Practice

### 1. Which tensor-parallel degrees are legal?

In `s1_column_row_parallel.py` the inner width is 128. Try `t = 3`. What happens, and which values of t work for an MLP with h = 32 and a 4h = 128 inner width?

<details><summary>Answer</summary>

`np.split` raises `ValueError: array split does not result in an equal division`: 128 columns cannot be cut into 3 equal slices. Equal slices need t to divide 128, so t in {1, 2, 4, 8, 16, 32, 64, 128}. Real implementations also need the number of attention heads to be divisible by t, so the usable degrees are the common divisors of both; in practice t is a small power of two, bounded by the GPUs in one server.

</details>

### 2. Where does the bias go?

Add bias vectors to the Megatron MLP: `Z = GeLU(X A + bA) B + bB`. Shard `bA` with the columns of `A`. Try adding `bB` on every GPU before the all-reduce, then try adding it once after. What goes wrong with the first?

<details><summary>Answer</summary>

`bA` splits with the columns of `A` (each GPU's slice of the pre-activation gets its slice of the bias), but `bB` belongs to the *summed* output. Adding it on every GPU before the all-reduce counts it t times: with t = 2 and t = 4 I measured an output off by exactly (t-1) x bB (to 1e-15). Adding `bB` once after the all-reduce (or on one GPU only) matches the unsplit result to 1e-15.

</details>

### 3. Price a layer on your own shapes

Change the assumptions in `s4_tp_communication_cost.py` to hidden = 8192, batch x seq = 2048 tokens (set `batch = 1, seq = 2048`). For t = 4, what is the activation tensor, the ring volume per GPU for the two forward all-reduces of one layer, and the time on NVLink versus PCIe?

<details><summary>Answer</summary>

Activation tensor: 2048 x 8192 x 2 bytes = 32 MiB (33.55 MB). Each ring all-reduce moves 2(t-1)/t = 1.5 times that per GPU, and there are two per forward layer: 2 x 1.5 x 33.55 MB = 100.7 MB. At 600 GB/s that is about 0.17 ms; at 64 GB/s about 1.57 ms. The script prints the layer's compute time next to it: 5.51 ms per GPU at t = 4, so communication is 3% of compute on NVLink and 29% on PCIe.

</details>

### Checkpoint quiz

1. Why can't plain data parallelism train a model whose states exceed one GPU?
2. In the Megatron MLP, which matrix is split by columns, which by rows, and where is the single forward all-reduce?
3. Why can't the first MLP matrix be split by rows?
4. Why does naive layer-wise parallelism keep GPUs idle?
5. Why is tensor parallelism normally confined to one server?

<details><summary>Answers</summary>

1. Every data-parallel GPU holds a full copy of parameters, gradients and optimizer state, so the per-GPU requirement does not shrink as GPUs are added.
2. The first matrix (h x 4h) by columns, the second (4h x h) by rows; the all-reduce sums the second layer's partial outputs. Nothing is communicated between the two matmuls.
3. A row split yields partial sums that must be added before the nonlinear GeLU (GeLU of a sum is not the sum of GeLUs), forcing an all-reduce on the 4h-wide tensor instead of the h-wide one.
4. One batch passes through the stages sequentially, so only one stage is active at a time: utilization 1/G.
5. It all-reduces activations four times per layer per step on the critical path, which needs NVLink-class bandwidth; across servers the link is far slower and communication would exceed compute.

</details>

> [!check]
> - I can compute 16 bytes per parameter x model size and compare it with one GPU's memory.
> - I can say which of column-parallel and row-parallel needs an all-reduce, and why.
> - I can draw the Megatron MLP and mark the one forward all-reduce.
> - I can explain why attention heads split naturally across GPUs.
> - I can justify "tensor parallelism inside a node" using bandwidth numbers.

## Project

Simulate a **tensor-parallel transformer block** in numpy, with no starting code. One block = layer norm, multi-head causal attention, residual, layer norm, MLP, residual, with weights initialised randomly.

Deliver:
1. An unsplit reference block and a version where the weights are sharded across t simulated GPUs (heads split, MLP column-then-row) and every cross-GPU sum is an explicit all-reduce function.
2. A check that the outputs agree to float tolerance for t = 1, 2, 4, 8, and a count of how many all-reduce calls and how many bytes each GPU moves per forward pass (confirm it matches 2 per block).
3. A deliberately broken variant (for example, GeLU on partial sums, or the output-projection bias added on every shard) with the measured error.
4. A short cost model showing, for your block's shapes, at what t the communication time on a 64 GB/s link exceeds the compute time but not on a 600 GB/s link, with all assumptions written down.

## Interview questions

> [!interview]
> Explain column-parallel and row-parallel linear layers and how Megatron composes them in an MLP.

<details><summary>What a strong answer covers</summary>

- Column-parallel: each GPU gets all of X and a slice of the output columns; no sum needed. Row-parallel: each GPU gets a slice of X's columns and the matching rows of the weights; outputs are partial sums that need an all-reduce.
- MLP: first matrix column-parallel, GeLU applied locally, second matrix row-parallel, one all-reduce at the end; the conjugate `f`/`g` operators give one all-reduce in the backward pass too.
- Why not the other order: GeLU is nonlinear and would need the sum first, on a 4x wider tensor.
- Constraint: t must divide the matrix width and the head count.

</details>

> [!interview]
> Why is tensor parallelism usually kept within a single node?

<details><summary>What a strong answer covers</summary>

- Four activation all-reduces per layer per step, on the critical path; volume scales with tokens x hidden.
- NVLink-class links (hundreds of GB/s) versus PCIe or network links (tens of GB/s or less): the communication share of a layer grows with t and with a slower link.
- Typical layout: tensor parallel inside a server, data and pipeline parallel across servers; cites Megatron-LM's 8-way-in-a-server design.

</details>

> [!interview]
> How is tensor parallelism different from naive model parallelism, and when would you use neither?

<details><summary>What a strong answer covers</summary>

- Naive (layer-wise) places different layers on different GPUs: little communication, but one GPU active at a time (1/G utilization) unless micro-batching (pipeline) is added.
- Tensor parallelism splits every layer: all GPUs busy together, but with frequent collectives.
- If the model fits on one GPU, plain data parallelism is simpler and has far less communication; also mention ZeRO/FSDP as the alternative that shards states while keeping the model code unsplit (module 11).

</details>

## Common mistakes & troubleshooting

- **Applying the activation to partial sums.** Symptom: outputs differ from the single-GPU model by O(1) (1.23 in the snippet) even though every shape matches. The nonlinearity must run on complete values: column-parallel first matrix, or all-reduce before it.
- **Bias added once per GPU.** Symptom: output off by exactly (t-1) x bias (practice 2). Add row-parallel biases after the all-reduce.
- **`ValueError: array split does not result in an equal division`** (or the equivalent shape error in a framework). t does not divide the sharded dimension or the head count. Pick a degree that divides both.
- **Tensor-parallel group spanning servers, and throughput collapsing.** Communication exceeds compute (step 5 shows 128% at 8-way over a PCIe-class link). Keep the group within an NVLink domain.
- **Verifying with exact equality.** Sums in a different order differ at 1e-16; use `np.allclose`.

## Further reading & sources

- [Megatron-LM: Training Multi-Billion Parameter Language Models Using Model Parallelism](https://arxiv.org/abs/1909.08053) - the paper that defines the column-then-row MLP split, the head-split attention, the `f`/`g` operators and the 8-way-in-a-server scaling results quoted here.
- [Efficient Large-Scale Language Model Training on GPU Clusters Using Megatron-LM](https://arxiv.org/abs/2104.04473) - how tensor, pipeline and data parallelism are combined across servers; read it after module 11.
- [ZeRO: Memory Optimizations Toward Training Trillion Parameter Models](https://arxiv.org/abs/1910.02054) - source of the 2 + 2 + 12 = 16 bytes-per-parameter accounting for mixed-precision Adam (section 3.1).
- [NVIDIA A100 Tensor Core GPU datasheet](https://www.nvidia.com/content/dam/en-zz/Solutions/Data-Center/a100/pdf/nvidia-a100-datasheet-us-nvidia-1758950-r4-web.pdf) - source of the 80 GB memory, 312 TFLOPS BF16, NVLink 600 GB/s and PCIe Gen4 64 GB/s figures (checked Oct 2026).
- [NCCL documentation: Collective Operations](https://docs.nvidia.com/deeplearning/nccl/user-guide/docs/usage/collectives.html) - definitions of the all-reduce and related collectives that tensor parallelism is built on.

## Next

[Module 11: Pipeline Parallelism and ZeRO](../11-pipeline-parallelism-and-zero/README.md)
