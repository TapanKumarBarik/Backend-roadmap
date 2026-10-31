# Module 08: FlashAttention and Memory-Efficient Kernels

## Roadmap

You are in **Track 05: GPUs & GenAI Hardware**. This module applies the hardware facts of modules 03-07 to the one operation that dominates long-context transformers: attention.

**Before this module**
- [Module 03: Memory Hierarchy and Bandwidth](../03-memory-hierarchy-and-bandwidth/README.md) - fast-but-tiny on-chip memory versus big-but-slower HBM. This module restates only the two numbers it needs.
- [Module 07: Mixed Precision Training](../07-mixed-precision-training/README.md) - why activations and attention run in fp16/bf16.
- [Module 06: Scaled Dot-Product Attention](../../02-transformer-architecture/06-scaled-dot-product-attention/README.md) and [Module 07: Attention Masks and Causal Masking](../../02-transformer-architecture/07-attention-masks-and-causal-masking/README.md) (Track 02) - the formula and the mask. Not re-taught here.

**After this module you can**
- explain why standard attention is limited by memory traffic rather than arithmetic;
- write an online (streaming) softmax and a tiled attention loop, and prove they match standard attention;
- count the HBM traffic of both and say what FlashAttention changes (memory, traffic) and what it does not (matmul FLOPs, the O(N^2) growth of compute);
- recognise when a framework call such as PyTorch's `scaled_dot_product_attention` is doing this for you.

**Why it matters.** At long context lengths the N x N score matrix, not the weights, decides whether attention fits in memory and how fast it runs. The remedy (work in tiles that stay on chip, write results once) is the template for most hand-written GPU kernels.

## Concept

> [!key] Standard attention is slow mostly because it writes a huge N x N matrix out to GPU memory and reads it back; FlashAttention computes the exact same result tile by tile in fast on-chip memory, using an online softmax so that matrix is never stored.

## Explanation

### Where the time goes in standard attention

Attention is three steps (see Track 02 for the derivation): `S = QKᵀ/√d`, `P = softmax(S)` row by row, `O = PV`. Q, K, V and O are N x d, where N is the sequence length and d the head dimension (typically 64-128). `S` and `P` are **N x N**.

On a GPU each step is a separate *kernel* (a program launched on the GPU). A kernel reads its inputs from HBM (the GPU's main memory), computes, and writes its outputs back to HBM. So in the textbook implementation `S` is written and read back, then `P` is written and read back. The first snippet below puts numbers on that (per head, per sequence, fp16):

```
      N    Q,K,V,O      S (N*N)        S + P  (S+P)/QKVO
   1024     0.5 MiB        2 MiB        4 MiB          8x
   4096     2.0 MiB       32 MiB       64 MiB         32x
  16384     8.0 MiB      512 MiB    1,024 MiB        128x
  65536    32.0 MiB    8,192 MiB   16,384 MiB        512x

A100 balance point: 153 FLOPs per HBM byte
softmax over S: ~1.25 FLOPs per HBM byte (assumed 5 FLOPs/element)
-> at most ~0.8% of peak compute is usable; memory sets the time
```

At N = 4096 the two N x N matrices are 32 times the size of Q, K, V and O combined; at N = 65,536 they are 512 times. That is a memory-capacity problem (the matrices must fit) and a speed problem (every byte takes a trip through HBM).

**Compute-bound vs memory-bound.** An operation is *compute-bound* if the time is set by arithmetic and *memory-bound* if it is set by moving bytes. The yardstick is **arithmetic intensity**: FLOPs per byte moved. Using NVIDIA's A100 80GB (SXM) datasheet figures, the chip can do about 153 FLOPs for every byte it reads from HBM, so any operation doing much less work per byte than that waits on memory. A big matrix multiply does plenty of work per byte; softmax does a handful of FLOPs per element, so it is memory-bound. The FlashAttention paper makes the same classification: matrix multiply with a large inner dimension is compute-bound, while elementwise and reduction operations such as softmax are memory-bound.

> [!model]
> HBM is a warehouse across town: huge, but every trip is slow. On-chip SRAM is the desk in front of you: tiny, but instant. Standard attention drives the entire N x N pile of paper to the warehouse and back, twice. FlashAttention works one desk-sized stack at a time and never ships the pile anywhere.

### IO-awareness: count bytes moved, not just FLOPs

An **IO-aware** algorithm is designed around how much data crosses the slow boundary, because on modern GPUs that count, not the FLOP count, predicts run time. The paper's A100 numbers: 40-80 GB of HBM at 1.5-2.0 TB/s, and 192 KB of on-chip SRAM per streaming multiprocessor (108 of them) at roughly 19 TB/s (the paper's estimate). SRAM is about an order of magnitude faster than HBM and many orders of magnitude smaller.

The paper proves (its Theorem 2) that standard attention needs Θ(Nd + N²) HBM accesses while FlashAttention needs Θ(N²d²/M), where M is the SRAM size. With d around 64-128 and M around 100 KB, d² is many times smaller than M, so the second number is many times smaller. Note the shape: both are still proportional to N² (see the pitfall below); FlashAttention shrinks the constant, not the exponent.

### Tiling and the online softmax

The obvious plan is tiling: load a block of K and V into SRAM, and compute against blocks of Q. The obstacle is softmax. Each output row needs the **max** of the whole row (for numerical stability) and the **sum** of `e^(score - max)` over the whole row, and a tile only sees part of the row.

The fix is the **online softmax**: keep two running numbers per row, the maximum seen so far `m` and the sum of exponentials so far `l`, and repair them as each new chunk arrives.

```
new chunk of scores c:
    m_new = max(m, max(c))
    l_new = l * e^(m - m_new)  +  sum(e^(c - m_new))     <- old sum is rescaled to the new max
```

If the maximum did not change, `e^(m - m_new)` is 1 and nothing happens; if a bigger score appears, everything accumulated so far is multiplied down to the new scale. The output row gets the same treatment: the partial result `O` built from earlier tiles is rescaled by `e^(m - m_new)` before the new tile's contribution `P·V` is added, and a final division by `l` yields the exact softmax-weighted average. The idea is older than FlashAttention (Milakov and Gimelshein, 2018) and FlashAttention's tiling rests on the same algebra: softmax of a concatenation can be computed from the maxima and sums of its pieces.

The kernel loops (the paper's Algorithm 1): for each block of K and V (loaded into SRAM once), sweep over all blocks of Q: compute the small `S` tile on chip, update `m`, `l` and the output block, write them back. Block sizes are chosen so the K, V, Q, O tiles and the score tile fit in SRAM: `Bc = ceil(M / 4d)` and `Br = min(Bc, d)`.

### What FlashAttention changes, and what it does not

| Quantity | Standard attention | FlashAttention |
| --- | --- | --- |
| Output | exact | exact (same value up to float rounding) |
| Extra memory beyond inputs and output | O(N²) (S and P) | O(N) (running `m`, `l`) |
| HBM accesses | Θ(Nd + N²) | Θ(N²d²/M) |
| Matmul FLOPs, forward | 4N²d | 4N²d (identical, verified below) |
| What the backward pass keeps | the N x N matrix `P` | O and per-row statistics (N numbers); `S`, `P` are recomputed |

For scale, the paper's own measurement (Figure 2, GPT-2 medium shapes, N = 1024, d = 64, 16 heads, batch 64, forward plus backward on an A100): standard attention 66.6 GFLOPs, 40.3 GB of HBM reads/writes, 41.7 ms; FlashAttention 75.2 GFLOPs, 4.4 GB, 7.3 ms. FlashAttention does *more* FLOPs there and is still faster, because HBM traffic is what the clock was measuring.

> [!pitfall]
> "FlashAttention makes attention linear in sequence length" is wrong. Its **memory** is linear in N. Its **compute** is still quadratic (4N²d FLOPs), and its HBM traffic still grows with N² (the snippets below show a 3.94x increase per doubling). It makes long sequences fit and run several times faster; it does not make them cheap.

### The backward pass: recompute instead of store

Training needs gradients, and the textbook backward pass wants `P` (N x N) from the forward pass. FlashAttention instead saves only `O` and the per-row softmax statistics: the first paper stores the row maximum and denominator, and the FlashAttention-2 paper notes that one number per row, the log-sum-exp `L = m + log(l)`, is enough (that is what the snippet below keeps). In the backward pass it rebuilds each tile of `P` on chip as `exp(S_tile - L)` from Q and K. This is a form of gradient checkpointing, aimed at one operation: it costs extra FLOPs (the paper reports 66.6 to 75.2 GFLOPs above) and saves much more HBM traffic, a good trade when the kernel is memory-bound.

### Related ideas

- **Kernel fusion** is the general principle: if several operations touch the same data, load it once, do all the work, write once. FlashAttention fuses matmul, softmax and matmul into one kernel.
- **FlashAttention-2** (Dao, 2023) keeps the idea but swaps the loop order (outer loop over blocks of Q, which parallelises across the sequence), keeps the running output un-scaled until a single division at the end, and partitions work across thread blocks and warps differently, so the kernel reaches a larger share of the GPU's peak matmul throughput. Its abstract reports about a 2x speedup over the first version on A100.
- **Rabe and Staats (2021)** ("Self-attention Does Not Need O(n²) Memory") showed that attention can be computed in chunks with far less than O(n²) memory, while the time complexity stays quadratic.
- In PyTorch, `torch.nn.functional.scaled_dot_product_attention` may dispatch to such fused kernels on CUDA; the docs list FlashAttention and memory-efficient attention as backends you can enable or disable.

> [!pitfall]
> The numpy code below runs on a CPU through a Python loop over tiles, so its run time says nothing about a GPU kernel. The real speed-up comes from running the whole loop inside one CUDA kernel with tiles held in SRAM. What numpy can show honestly is the algorithm: it is exact, and the data movement it implies is smaller.

## Code

Everything runs with numpy only (Python 3.13, numpy 2.4.6 were used). Save the first listing as `attention_lib.py`; the other scripts import it and sit in the same folder.

**Step 1 - the library: standard attention and tiled attention with traffic counters.** `flash_attention` follows the paper's Algorithm 1: `O`, `l`, `m` are the arrays that would live in HBM; every tile is copied into local variables (the "SRAM"), processed, and written back. The `stats` dictionary counts elements moved and matmul FLOPs.

```python
import numpy as np


def softmax(x, axis=-1):
    z = x - x.max(axis=axis, keepdims=True)      # subtract the row max for stability
    e = np.exp(z)
    return e / e.sum(axis=axis, keepdims=True)


def standard_attention(Q, K, V, causal=False):
    """Three separate steps, each of which would be its own kernel on a GPU:
    S = QK^T/sqrt(d), P = softmax(S), O = PV.  S and P are N x N."""
    N, d = Q.shape
    S = (Q @ K.T) / np.sqrt(d)
    if causal:
        S = np.where(np.tril(np.ones((N, N), dtype=bool)), S, -np.inf)
    P = softmax(S)
    return P @ V, S, P


def block_sizes(M, d):
    """Block sizes from the FlashAttention paper (Algorithm 1): M is the
    on-chip SRAM size measured in elements, d is the head dimension."""
    Bc = -(-M // (4 * d))            # ceil(M / 4d)
    Br = min(Bc, d)
    return Br, Bc


def flash_attention(Q, K, V, Br, Bc, causal=False, stats=None):
    """Tiled exact attention with an online softmax (paper's Algorithm 1).
    O, l, m live in 'HBM' (ordinary arrays); every tile is copied into locals
    ('SRAM'), worked on, and written back.  `stats` counts element traffic."""
    N, d = Q.shape
    scale = 1.0 / np.sqrt(d)
    O = np.zeros((N, d), dtype=Q.dtype)           # output so far
    l = np.zeros(N, dtype=Q.dtype)                # running softmax denominator
    m = np.full(N, -np.inf, dtype=Q.dtype)        # running row maximum
    for j in range(0, N, Bc):                     # outer loop: blocks of K and V
        Kj, Vj = K[j:j + Bc], V[j:j + Bc]
        if stats is not None:
            stats["reads"] += Kj.size + Vj.size
        for i in range(0, N, Br):                 # inner loop: blocks of Q
            if causal and j > i + Br - 1:
                continue                          # whole tile is above the diagonal
            Qi, Oi, li, mi = Q[i:i + Br], O[i:i + Br], l[i:i + Br], m[i:i + Br]
            S = (Qi @ Kj.T) * scale               # Br x Bc tile, never leaves SRAM
            if causal:
                rows = np.arange(i, i + Qi.shape[0])[:, None]
                cols = np.arange(j, j + Kj.shape[0])[None, :]
                S = np.where(cols <= rows, S, -np.inf)
            m_new = np.maximum(mi, S.max(axis=1))             # new running max
            P = np.exp(S - m_new[:, None])                    # tile of softmax numerators
            alpha = np.exp(mi - m_new)                        # rescales everything seen so far
            l_new = alpha * li + P.sum(axis=1)
            O[i:i + Br] = (alpha[:, None] * li[:, None] * Oi + P @ Vj) / l_new[:, None]
            l[i:i + Br], m[i:i + Br] = l_new, m_new
            if stats is not None:
                br, bc = Qi.shape[0], Kj.shape[0]
                stats["reads"] += 2 * Qi.size + 2 * br          # Q_i, O_i, l_i, m_i
                stats["writes"] += Qi.size + 2 * br             # O_i, l_i, m_i
                stats["matmul_flops"] += 4 * br * bc * d        # QK^T and PV for this tile
    return O, l, m
```

**Step 2 - the problem in numbers** (`s1_score_matrix_size.py`, output shown above):

```python
# How big is the N x N score matrix, compared with the Q/K/V/O it is computed from?
d = 64                      # head dimension
bytes_per_elem = 2          # fp16 / bf16
MiB = 2 ** 20

print(f"{'N':>7} {'Q,K,V,O':>10} {'S (N*N)':>12} {'S + P':>12} {'(S+P)/QKVO':>11}")
for N in (1024, 4096, 16384, 65536):
    qkvo = 4 * N * d * bytes_per_elem
    s = N * N * bytes_per_elem
    print(f"{N:>7} {qkvo / MiB:>7,.1f} MiB {s / MiB:>8,.0f} MiB {2 * s / MiB:>8,.0f} MiB {2 * s / qkvo:>10.0f}x")

# Arithmetic intensity = FLOPs of work per byte moved to or from HBM.
# A100 80GB SXM datasheet: 312 TFLOPS BF16 (dense), 2,039 GB/s memory bandwidth.
balance = 312e12 / 2039e9
print(f"\nA100 balance point: {balance:.0f} FLOPs per HBM byte")

# Softmax, illustrative assumption: ~5 FLOPs per element (subtract max, exp, sum, divide),
# 2 bytes read + 2 bytes written per element.
softmax_intensity = 5 / (2 + 2)
print(f"softmax over S: ~{softmax_intensity:.2f} FLOPs per HBM byte (assumed 5 FLOPs/element)")
print(f"-> at most ~{softmax_intensity / balance * 100:.1f}% of peak compute is usable; memory sets the time")
```

**Step 3 - the online softmax.** Process one row in chunks of four, track `(m, l)`, compare with the ordinary softmax, then deliberately drop the rescale term to see what breaks.

```python
import numpy as np
from attention_lib import softmax

rng = np.random.default_rng(0)
x = rng.standard_normal(12) * 3          # one row of scores
ref = softmax(x)                         # reference: needs the WHOLE row at once

# Online: see the row in chunks of 4; keep only a running max m and running denominator l.
m, l = -np.inf, 0.0
for start in range(0, len(x), 4):
    chunk = x[start:start + 4]
    m_new = max(m, chunk.max())
    l = l * np.exp(m - m_new) + np.exp(chunk - m_new).sum()   # rescale old sum, add new chunk
    m = m_new
    print(f"after chunk {start // 4}: m = {m:7.4f}   l = {l:8.4f}")
print("max |online - reference|:", np.abs(np.exp(x - m) / l - ref).max())

# Drop the rescale term and the answer is wrong whenever the max changes.
m, l_bad = -np.inf, 0.0
for start in range(0, len(x), 4):
    chunk = x[start:start + 4]
    m = max(m, chunk.max())
    l_bad += np.exp(chunk - m).sum()     # forgot: l * exp(m_old - m_new)
print("without rescaling, max error:", np.abs(np.exp(x - m) / l_bad - ref).max())

with np.errstate(invalid="ignore"):      # a fully masked row: -inf minus -inf is NaN
    print("exp(-inf - (-inf)) =", np.exp(-np.inf - -np.inf))
```

```
after chunk 0: m =  1.9213   l =   1.5126
after chunk 1: m =  3.9120   l =   1.6125
after chunk 2: m =  3.9120   l =   1.6411
max |online - reference|: 0.0
without rescaling, max error: 0.2700173732766699
exp(-inf - (-inf)) = nan
```

The last line is the reason real kernels guard fully-masked rows: `-inf` minus `-inf` is NaN.

**Step 4 - verify the tiled result equals standard attention**, in float64 and float32, with and without a causal mask, and with an N that is not a multiple of the block size. It also counts matmul FLOPs for both.

```python
import numpy as np
from attention_lib import standard_attention, flash_attention, block_sizes

d = 64
M = 50_000                       # SRAM budget in elements (~100 KB at 2 bytes each)
Br, Bc = block_sizes(M, d)
print(f"block sizes from M={M}, d={d}:  Br={Br}, Bc={Bc}")

rng = np.random.default_rng(0)
print(f"\n{'N':>5} {'dtype':>8} {'causal':>7} {'max |tiled - standard|':>24} {'allclose':>9}")
for N, dtype, causal in [(256, np.float64, False), (1000, np.float64, False),
                         (1000, np.float64, True), (1000, np.float32, False),
                         (1000, np.float32, True), (2048, np.float32, True)]:
    Q, K, V = (rng.standard_normal((N, d)).astype(dtype) for _ in range(3))
    O_ref, _, _ = standard_attention(Q, K, V, causal)
    O_tiled, _, _ = flash_attention(Q, K, V, Br, Bc, causal)
    err = np.abs(O_ref - O_tiled).max()
    tol = dict(rtol=1e-9, atol=1e-10) if dtype == np.float64 else dict(rtol=1e-4, atol=1e-5)
    ok = np.allclose(O_ref, O_tiled, **tol)
    print(f"{N:>5} {np.dtype(dtype).name:>8} {str(causal):>7} {err:>24.3e} {str(ok):>9}")
    assert ok

# Same arithmetic: count the matmul FLOPs both versions perform (non-causal, N=1000).
N = 1000
Q, K, V = (rng.standard_normal((N, d)) for _ in range(3))
stats = {"reads": 0, "writes": 0, "matmul_flops": 0}
flash_attention(Q, K, V, Br, Bc, stats=stats)
standard_flops = 2 * N * N * d + 2 * N * N * d       # QK^T and PV
print(f"\nmatmul FLOPs, standard: {standard_flops:,}")
print(f"matmul FLOPs, tiled   : {stats['matmul_flops']:,}")
```

```
block sizes from M=50000, d=64:  Br=64, Bc=196

    N    dtype  causal   max |tiled - standard|  allclose
  256  float64   False                5.551e-16      True
 1000  float64   False                2.012e-16      True
 1000  float64    True                7.772e-16      True
 1000  float32   False                7.661e-08      True
 1000  float32    True                2.157e-07      True
 2048  float32    True                2.671e-07      True

matmul FLOPs, standard: 256,000,000
matmul FLOPs, tiled   : 256,000,000
```

> [!example]
> Reading the table: in float64 the two methods differ by about 1e-16 (rounding noise), in float32 by about 1e-7, which is float32's own precision. Different summation order gives slightly different rounding, so "equal" means "equal to float tolerance", never bit-for-bit. The FLOP counts are identical because tiling regroups the same multiplications.

**Step 5 - count HBM traffic.** The standard tally is my own count of the idealised three-kernel version (read Q,K / write S / read S / write P / read P,V / write O = 4Nd + 4N²). The tiled count comes from the counters inside `flash_attention`, and it is asserted equal to the closed form 2Nd + Tc·(3Nd + 4N) with Tc = ceil(N / Bc).

```python
import math
import numpy as np
from attention_lib import flash_attention, block_sizes

d = 64
M = 50_000
Br, Bc = block_sizes(M, d)


def standard_traffic(N, d):
    """Elements moved to/from HBM by the three-step forward pass.
    read Q,K | write S | read S | write P | read P,V | write O"""
    return 2 * N * d + N * N + N * N + N * N + (N * N + N * d) + N * d     # = 4Nd + 4N^2


def flash_traffic(N, d, Bc):
    """K,V are read once; for each of the Tc outer iterations every Q block, O block,
    l and m is read and O, l, m written back:  2Nd + Tc * (3Nd + 4N)."""
    Tc = math.ceil(N / Bc)
    return 2 * N * d + Tc * (3 * N * d + 4 * N)


rng = np.random.default_rng(0)
print(f"d={d}, Br={Br}, Bc={Bc}, fp16 (2 bytes/element)\n")
print(f"{'N':>6} {'standard':>14} {'tiled (counted)':>16} {'tiled (formula)':>16} {'standard/tiled':>15}")
for N in (512, 1024, 2048, 4096):
    Q, K, V = (rng.standard_normal((N, d)).astype(np.float32) for _ in range(3))
    stats = {"reads": 0, "writes": 0, "matmul_flops": 0}
    flash_attention(Q, K, V, Br, Bc, stats=stats)
    counted = stats["reads"] + stats["writes"]
    assert counted == flash_traffic(N, d, Bc)            # instrumented count == closed form
    std = standard_traffic(N, d)
    print(f"{N:>6} {std * 2 / 2**20:>11,.1f} MiB {counted * 2 / 2**20:>13,.1f} MiB "
          f"{flash_traffic(N, d, Bc) * 2 / 2**20:>13,.1f} MiB {std / counted:>14.1f}x")

# Traffic is still quadratic in N for both; the tiled version just has a smaller constant.
a, b = flash_traffic(4096, d, Bc), flash_traffic(8192, d, Bc)
print(f"\ntiled traffic, N 4096 -> 8192 grows {b / a:.2f}x (2x would be linear, 4x quadratic)")

# Bigger SRAM -> bigger blocks -> fewer passes over Q -> less traffic.
print("\nvarying the on-chip budget M at N=4096:")
for M2 in (12_500, 25_000, 50_000, 100_000, 200_000):
    _, Bc2 = block_sizes(M2, d)
    print(f"  M={M2:>7} elements -> Bc={Bc2:>4}, tiled traffic = {flash_traffic(4096, d, Bc2) * 2 / 2**20:7.1f} MiB")
```

```
d=64, Br=64, Bc=196, fp16 (2 bytes/element)

     N       standard  tiled (counted)  tiled (formula)  standard/tiled
   512         2.2 MiB           0.7 MiB           0.7 MiB            3.2x
  1024         8.5 MiB           2.5 MiB           2.5 MiB            3.3x
  2048        33.0 MiB           8.9 MiB           8.9 MiB            3.7x
  4096       130.0 MiB          33.2 MiB          33.2 MiB            3.9x

tiled traffic, N 4096 -> 8192 grows 3.94x (2x would be linear, 4x quadratic)

varying the on-chip budget M at N=4096:
  M=  12500 elements -> Bc=  49, tiled traffic =   129.6 MiB
  M=  25000 elements -> Bc=  98, tiled traffic =    65.3 MiB
  M=  50000 elements -> Bc= 196, tiled traffic =    33.2 MiB
  M= 100000 elements -> Bc= 391, tiled traffic =    17.8 MiB
  M= 200000 elements -> Bc= 782, tiled traffic =    10.2 MiB
```

Two honest readings. First, the tiled column grows about 4x when N doubles, so traffic is still quadratic; the gain is a constant factor (about 4x here). The paper reports a larger ratio (about 9x: 40.3 GB versus 4.4 GB in the figure above, forward plus backward) because real unfused implementations also run separate kernels for scaling, masking and dropout, which this idealised tally leaves out. Second, the last table shows the knob: a bigger SRAM budget `M` means bigger blocks, fewer passes over Q and O, and less traffic. At the smallest budget the tiled version has already lost its advantage.

**Step 6 - memory footprint and recomputation.** `tracemalloc` measures the actual peak allocation of the numpy code (float32, extra memory beyond Q, K, V). Then the backward-pass idea: keep one number per row and rebuild tiles of `P`.

```python
import tracemalloc
import numpy as np
from attention_lib import standard_attention, flash_attention, block_sizes

d = 64
Br, Bc = block_sizes(50_000, d)
rng = np.random.default_rng(0)


def peak_extra_mib(fn, *args):
    """Peak memory allocated by fn, beyond what was already allocated (numpy reports to tracemalloc)."""
    tracemalloc.start()
    base = tracemalloc.get_traced_memory()[0]
    tracemalloc.reset_peak()
    fn(*args)
    peak = tracemalloc.get_traced_memory()[1]
    tracemalloc.stop()
    return (peak - base) / 2**20


print(f"{'N':>6} {'standard peak':>15} {'tiled peak':>12}")
for N in (1024, 2048, 4096, 8192):
    Q, K, V = (rng.standard_normal((N, d)).astype(np.float32) for _ in range(3))
    p_std = peak_extra_mib(standard_attention, Q, K, V)
    p_tile = peak_extra_mib(lambda Q, K, V: flash_attention(Q, K, V, Br, Bc), Q, K, V)
    print(f"{N:>6} {p_std:>11.1f} MiB {p_tile:>8.2f} MiB")

# Recomputation: the backward pass needs P. Instead of saving the N x N matrix,
# save one number per row -- L = m + log(l), the log of the softmax denominator --
# and rebuild any tile of P on demand from Q and K.
N = 1000
Q, K, V = (rng.standard_normal((N, d)) for _ in range(3))
_, _, P_saved = standard_attention(Q, K, V)
_, l, m = flash_attention(Q, K, V, Br, Bc)
L = m + np.log(l)                                     # N numbers, not N*N

worst = 0.0
for i in range(0, N, Br):
    for j in range(0, N, Bc):
        S_tile = Q[i:i + Br] @ K[j:j + Bc].T / np.sqrt(d)     # recomputed from Q and K
        P_tile = np.exp(S_tile - L[i:i + Br, None])
        worst = max(worst, np.abs(P_tile - P_saved[i:i + Br, j:j + Bc]).max())
print(f"\nrecomputed P tiles vs stored P: max difference {worst:.2e}")
print(f"numbers to keep for backward: standard {N * N:,}  vs  tiled {N:,}")
```

```
     N   standard peak   tiled peak
  1024        32.1 MiB     0.66 MiB
  2048       128.1 MiB     0.92 MiB
  4096       512.1 MiB     1.43 MiB
  8192      2048.1 MiB     2.46 MiB

recomputed P tiles vs stored P: max difference 5.20e-17
numbers to keep for backward: standard 1,000,000  vs  tiled 1,000
```

Standard attention's peak grows 4x per doubling of N (quadratic); the tiled version's grows roughly with N (it holds the output and the running statistics, plus one tile). The recomputed tiles match the stored `P` to rounding error while storing 1,000 numbers instead of 1,000,000.

**Step 7 - the framework call** (not executed in this module's verification: needs torch and a CUDA GPU):

```python
import torch
import torch.nn.functional as F

# shapes: (batch, heads, sequence, head_dim)
q = torch.randn(2, 16, 4096, 64, device="cuda", dtype=torch.bfloat16)
k = torch.randn_like(q)
v = torch.randn_like(q)

# One call. On CUDA, PyTorch may route this to a fused FlashAttention-style kernel (depending on
# dtype, shapes and hardware); if it does, the 4096 x 4096 score matrix is never materialised in HBM.
out = F.scaled_dot_product_attention(q, k, v, is_causal=True)
```

## Visual diagram

```
STANDARD ATTENTION - three kernels, two N x N round trips through HBM

  HBM (large, slower)                                       compute
 ┌───────────┐   read Q, K                              ┌──────────────┐
 │ Q, K      │ ───────────────────────────────────────► │ S = Q.K^T    │
 └───────────┘                                          └──────┬───────┘
 ┌───────────┐   write S  (N x N)                              │
 │ S         │ ◄───────────────────────────────────────────────┘
 └─────┬─────┘   read S                                 ┌──────────────┐
       └───────────────────────────────────────────────► │ P = softmax  │
 ┌───────────┐   write P  (N x N)                       └──────┬───────┘
 │ P         │ ◄───────────────────────────────────────────────┘
 └─────┬─────┘   read P, V                              ┌──────────────┐
       └───────────────────────────────────────────────► │ O = P.V      │
 ┌───────────┐   write O                                └──────┬───────┘
 │ O         │ ◄───────────────────────────────────────────────┘
 └───────────┘
```

```
FLASHATTENTION - one fused kernel; S and P exist only as small tiles on chip

  HBM                                           SRAM (on chip, ~100 KB)
 ┌─────────────────────────┐                   ┌─────────────────────────────┐
 │ K, V     read once      │ ── block j ─────► │ K_j, V_j         (Bc x d)   │
 │ Q, O, m, l  re-read for │ ── block i ─────► │ Q_i, O_i         (Br x d)   │
 │ each outer step j       │                   │ S_ij = Q_i.K_j^T (Br x Bc)  │
 │                         │ ◄─ O_i, m, l ──── │ online update of m, l, O_i  │
 └─────────────────────────┘                   └─────────────────────────────┘
 never stored in HBM: S and P (N x N)

              K/V block:  j=0      j=1      j=2      j=3
  Q block i=0          ┌────────┬────────┬────────┬────────┐
                       │ S(0,0) │ S(0,1) │ S(0,2) │ S(0,3) │  tile = Br x Bc scores,
           i=1         ├────────┼────────┼────────┼────────┤  computed in SRAM,
                       │ S(1,0) │ S(1,1) │ S(1,2) │ S(1,3) │  used once, discarded
                       └────────┴────────┴────────┴────────┘

  online update for one row when the next tile c arrives:
     m' = max(m, max(c))            l' = l * e^(m-m') + sum(e^(c-m'))
     O' = ( l * e^(m-m') * O + e^(c-m') . V_tile ) / l'
     max unchanged -> e^(m-m') = 1, nothing is rescaled; bigger score -> older work shrinks
```

## Practice

### 1. Find the break-even SRAM size

Using the closed-form `flash_traffic` and `standard_traffic` from step 5, find the smallest on-chip budget `M` (in elements, d = 64) at which the tiled version moves no more data than the standard one at N = 4096. Convert it to KB assuming 2 bytes per element and compare it with the ~100 KB the paper calls typical.

<details><summary>Answer</summary>

Loop `M` upward, call `block_sizes(M, 64)` to get `Bc`, and compare `flash_traffic(4096, 64, Bc)` with `standard_traffic(4096, 64)` (68,157,440 elements). The first `M` that works is **12,289** (`Bc = 49`, tiled traffic 67,960,832 elements). That is about 24 KB at 2 bytes per element, a quarter of the ~100 KB SRAM budget the paper cites, so on real hardware the tiled version is comfortably on the winning side. The table in step 5 shows the same thing: at `M = 12,500` the two are nearly tied.

</details>

### 2. Break the causal case on purpose

Copy `flash_attention` and change the outer loop to visit K/V blocks in **reverse** (`for j in reversed(range(0, N, Bc))`), keeping the causal mask. Use N = 300, Br = 64, Bc = 100. Predict how many output rows come out as NaN, then run it. Why does it happen, and what does a production kernel do about it?

<details><summary>Answer</summary>

200 of the 300 rows are NaN. The first block visited is columns 200-299; rows 0-199 may not look at any of those columns, so their whole score row is `-inf`, `m_new` stays `-inf`, and `S - m_new` is `-inf - (-inf) = NaN` (step 3 printed exactly that). In the forward-order loop used in the module every row sees column 0 in its first block, so the running max is finite before any fully-masked block appears. Production kernels either guarantee that order, skip blocks that are completely masked, or replace an all-`-inf` maximum with 0 before exponentiating.

</details>

### 3. Price the recomputation

Counting matrix multiplies of size N x N x d: the standard forward has 2 (`QKᵀ`, `PV`) and the standard backward has 4. FlashAttention's backward recomputes `QKᵀ` once more. By matmul count, how much extra work is that, and how does it compare with the paper's 66.6 to 75.2 GFLOPs? Why is the kernel faster anyway?

<details><summary>Answer</summary>

By matmul count it is 7 instead of 6, about 17% more (the FlashAttention-2 paper likewise counts 5 matrix multiplies in the backward pass against 2 in the forward). The paper's measured totals rose from 66.6 to 75.2 GFLOPs, about 13% (the other operations are unchanged, which dilutes the matmul-only figure). The kernel is still faster (41.7 ms down to 7.3 ms in the paper) because its time is set by HBM traffic, which fell from 40.3 GB to 4.4 GB. Spending a few percent more arithmetic to avoid writing and reading an N x N matrix is a good trade when the hardware is waiting on memory.

</details>

### Checkpoint quiz

1. In standard attention, which two intermediate tensors have N x N entries, and where do they live?
2. Why can't you tile the softmax by simply applying it to each tile separately?
3. In the online softmax, what two quantities are carried per row, and what is the rescale factor when a larger maximum shows up?
4. Name two things FlashAttention does not change.
5. What does FlashAttention store for the backward pass instead of `P`?

<details><summary>Answers</summary>

1. The score matrix `S` and the probability matrix `P`; in the standard implementation both are written to and read from HBM.
2. Softmax normalises over the whole row. A tile sees only part of it, so its local max and sum are wrong for the full row; the online update fixes this by rescaling earlier partial results to the new maximum.
3. The running maximum `m` and the running sum of exponentials `l`. When the maximum grows from `m` to `m_new`, the old sum (and the partially built output) is multiplied by `e^(m - m_new)`.
4. The result (it is exact, up to float rounding), the matmul FLOP count (4N²d forward), and the quadratic growth of compute and HBM traffic with N.
5. The output `O` and per-row softmax statistics (a single log-sum-exp `L = m + log l` per row is enough), from which tiles of `P` are recomputed on chip.

</details>

> [!check]
> - I can compute the size of the N x N score matrix for a given N, head count and dtype.
> - I can explain, in two sentences, why softmax makes attention memory-bound.
> - I can write the online-softmax update from memory and say why the rescale term is needed.
> - I can state what FlashAttention changes (memory, HBM traffic) and what it leaves alone (FLOPs, quadratic growth).
> - I can explain why recomputation in the backward pass makes the kernel faster despite more FLOPs.

## Project

Build the **loop-swapped** variant from scratch, with no starting code: make the *outer* loop run over blocks of Q and the *inner* loop over blocks of K and V, keeping the output block and its running `(m, l)` in local variables across the inner loop and dividing by `l` only once, after the last K/V block (the arrangement the FlashAttention-2 paper describes: swapped loops, an un-scaled running output, one final division).

Deliver, in one script and a short write-up:
1. A correct forward pass, verified against standard attention in float32 for several N (including ones that are not multiples of your block sizes), with and without a causal mask.
2. Instrumented element counters, and a closed-form formula for this variant's HBM traffic that your counters match exactly.
3. A comparison table against the Algorithm 1 variant for the same `M`, and your explanation of which moves fewer elements and why.
4. One sentence on why a GPU implementation might still prefer the variant that moves *more* data (hint: what runs in parallel?).

## Interview questions

> [!interview]
> Attention does the same number of FLOPs in a FlashAttention kernel as in a naive implementation, yet FlashAttention is several times faster. How?

<details><summary>What a strong answer covers</summary>

- Standard attention is memory-bound: softmax and the N x N intermediates cost HBM reads/writes, not arithmetic.
- FlashAttention is IO-aware: it tiles Q, K, V so `S` and `P` live only in on-chip SRAM, and fuses matmul-softmax-matmul into one kernel; HBM accesses drop from Θ(Nd + N²) to Θ(N²d²/M).
- Matmul FLOPs are unchanged in the forward pass; the backward pass even adds some by recomputing, and it is still faster because traffic dominates.
- Mentions the caveat: traffic and compute are still O(N²); only memory becomes O(N).

</details>

> [!interview]
> Walk me through the online softmax. Why does it need to rescale?

<details><summary>What a strong answer covers</summary>

- Softmax needs the row max (stability) and the row sum, which a streaming algorithm does not have up front.
- Keep running `m` and `l`; on a new chunk, `m_new = max(m, chunk max)` and `l_new = l · e^(m - m_new) + Σ e^(chunk - m_new)`; the partially built output gets the same factor.
- Without the factor, old terms are on the wrong scale whenever the max changes (the module measured an error of 0.27 on a 12-element row).
- Final division by `l` gives the exact result; exactness holds up to float rounding, not bit-for-bit.
- Bonus: fully-masked rows produce `-inf - (-inf) = NaN` and need a guard.

</details>

> [!interview]
> What does FlashAttention store for the backward pass, and what is the trade-off?

<details><summary>What a strong answer covers</summary>

- It stores the output and per-row softmax statistics (one number per row suffices: `L = m + log l`), not the N x N probability matrix.
- The backward pass recomputes `S` and `P` tile by tile in SRAM: selective gradient checkpointing for one operator.
- Costs extra FLOPs (about one more QKᵀ-sized matmul), saves O(N²) memory and a large amount of HBM traffic; net faster because the kernel is memory-bound.

</details>

## Common mistakes & troubleshooting

- **NaN in the output of a hand-written tiled causal kernel.** A row whose entire tile is masked yields `-inf - (-inf)`. Process blocks so every row meets a visible key first, skip fully masked blocks, or clamp an infinite running max to 0 (practice exercise 2).
- **Results differ from the reference by about 1e-7 and the test fails.** That is float32 rounding, not a bug. Compare with a tolerance (`np.allclose` with `rtol` around 1e-4 in float32) or run the check in float64, where the difference is about 1e-16.
- **Tiled output is wrong only for some inputs, and wrong by a lot.** The rescale term `e^(m - m_new)` was dropped or applied to the wrong quantity. Step 3 shows the symptom: a wrong answer exactly when the running maximum changes.
- **Reading speed off the numpy version.** It runs on a CPU through a Python loop, so a stopwatch tells you nothing about a GPU kernel (see the pitfall in the explanation). Judge the algorithm by its counted traffic and memory, and judge real speed with a GPU profiler.

## Further reading & sources

- [FlashAttention: Fast and Memory-Efficient Exact Attention with IO-Awareness](https://arxiv.org/abs/2205.14135) - the paper behind this module: Algorithm 1, the IO-complexity theorem, and the A100 measurements quoted above.
- [FlashAttention-2: Faster Attention with Better Parallelism and Work Partitioning](https://arxiv.org/abs/2307.08691) - the follow-up that changes work partitioning to approach matmul-level throughput; cited for the loop-swapped variant in the project.
- [Online normalizer calculation for softmax](https://arxiv.org/abs/1805.02867) - the streaming softmax with fewer memory accesses that the tiled algorithm builds on.
- [Self-attention Does Not Need O(n^2) Memory](https://arxiv.org/abs/2112.05682) - shows the memory saving is possible with chunked attention while compute stays quadratic; context for the pitfall box.
- [NVIDIA A100 Tensor Core GPU datasheet](https://www.nvidia.com/content/dam/en-zz/Solutions/Data-Center/a100/pdf/nvidia-a100-datasheet-us-nvidia-1758950-r4-web.pdf) - source of the 312 TFLOPS BF16 (dense) and 2,039 GB/s figures used for the balance-point calculation (checked Oct 2026).
- [torch.nn.functional.scaled_dot_product_attention](https://docs.pytorch.org/docs/stable/generated/torch.nn.functional.scaled_dot_product_attention.html) - official PyTorch documentation of the framework entry point and its FlashAttention / memory-efficient backends.

## Next

[Module 09: Data Parallelism](../09-data-parallelism/README.md)
