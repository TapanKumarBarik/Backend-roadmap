# Module 02: CUDA Cores vs. Tensor Cores

## Roadmap

[Module 01](../01-gpu-architecture-for-software-engineers/README.md) showed how an SM schedules warps onto
"math units". This module says what those units are. A modern NVIDIA GPU has two kinds of math hardware, and the
difference between them is the largest single factor in how fast a transformer runs.

**Before this module:** [Module 00](../00-why-gpus-not-cpus/README.md) (FLOP/s, matmul as the core workload) and
[Module 01](../01-gpu-architecture-for-software-engineers/README.md) (SMs, warps).

**After this module** you can:

- say what a CUDA core does per clock and what a tensor core does per instruction;
- explain why tensor cores are what make transformer matmuls fast, and why inputs are low precision while the running sum is higher precision;
- read a datasheet's peak-throughput table correctly: precision, tensor versus CUDA core, **dense versus sparse**, form factor;
- do the arithmetic that connects "cores x clock" to the headline TFLOPS figure.

**Why it matters:** headline TFLOPS numbers drive purchasing, capacity planning and cost estimates (Tracks 05 and 06).
Reading them wrong, for example by taking the sparse figure for the dense one, overstates a GPU's real capability by 2x
before anything else goes wrong. Numeric formats themselves (FP16, BF16, FP8) get their own
module ([Module 06](../06-numeric-formats-fp32-fp16-bf16/README.md)); here we only need the idea.

## Concept

> [!key]
> A CUDA core performs one scalar multiply-add per clock. A tensor core performs a whole small matrix multiply-accumulate, `D = A x B + C` on a tile, in one operation, and transformer layers are made of exactly that operation, so tensor cores deliver roughly an order of magnitude more throughput than the FP32 CUDA cores on the work that matters.

## Explanation

### What a CUDA core does

"CUDA core" is NVIDIA's name for one lane of an SM's FP32 arithmetic hardware (Module 01's table: 128 per H100 SM, 64
per A100 SM). It executes a scalar **fused multiply-add**, `d = a*b + c`, once per clock; a multiply plus an add counts
as 2 FLOPs. That gives a first formula, and it works:

```
peak FP32 FLOP/s  =  (number of CUDA cores)  x  2  x  (clock in Hz)
```

Experiment 1 checks it against the datasheets: the formula reproduces 19.5 TFLOPS for the A100 and 66.9 TFLOPS for
the H100 SXM5 to the printed precision. CUDA cores are general purpose: they run any scalar code, including the
elementwise operations (activations, layer norm, residual adds) that tensor cores cannot help with. NVIDIA's
performance guide makes this exact point: adding two half-precision tensors runs on CUDA cores, not tensor cores.

### What a tensor core does

A tensor core is specialized hardware for **matrix multiply-accumulate (MMA)**: given small tiles `A`, `B` and `C`
it produces `D = A x B + C`. Tensor cores first appeared in the Volta generation. NVIDIA's own description of the
first version: each tensor core performs a 4x4x4 matrix multiply-accumulate (64 fused multiply-adds per clock), with
FP16 inputs and FP16 or FP32 accumulation, and the threads of a warp together drive a larger 16x16x16 tile through
the CUDA WMMA API. Later generations changed tile sizes and added formats, but the contract is the same: one
instruction, many multiply-adds, on a tile.

Why that is so much faster: a CUDA core pays for instruction issue, register reads and result writes on every
multiply-add. A tensor core amortizes that over an entire tile. Experiment 2 counts it: multiplying two 64 x 64
matrices takes 262,144 scalar multiply-adds, or just 64 tile operations of 4096 multiply-adds each.

Working backwards from the datasheet (Experiment 1) gives the per-clock capability. Dense FP16 tensor throughput
implies **512 FLOPs per clock per tensor core on the A100 and 1,024 on the H100**; the H100 whitepaper says its tensor
cores deliver double the A100's matrix math per SM, clock for clock, and the arithmetic agrees. With 4 tensor cores per
SM, an H100 SM does 4,096 dense FP16 FLOPs per clock against 256 for its 128 CUDA cores: 16x.

> [!model]
> A CUDA core is a person with a calculator doing one sum at a time. A tensor core is a person with a printing press that stamps out a whole 16 x 16 page of sums at once, provided you hand it pages in the right format. Matmul is made of pages; softmax and layer norm are single sums, so they stay on the calculators.

### Why this fits transformers

Every big operation in a transformer layer is a matmul (Module 00's table): the Q/K/V and output projections, the two
feed-forward matrices, and the attention score and value products. A matmul decomposes into tile products added
together, so it maps directly onto repeated MMA operations:

```
C_tile(i,j) = sum over k of  A_tile(i,k) x B_tile(k,j)         # one MMA per k, accumulating
```

The inputs can be stored and multiplied in a low precision (FP16, BF16, FP8) because the products are accumulated in a
higher one. Experiment 2 shows why that matters: summing 4096 FP16 products in FP16 gives an error of roughly 0.5
on results of size about 50, while accumulating the same products in FP32 gives an error near `5e-5`. Hardware that
multiplies in FP16 but accumulates in FP32 gets the speed and bandwidth benefit of small inputs without the drift.

### Supported precisions

The CUDA Programming Guide (v13.4.2, Table 33, checked Oct 2026) lists the tensor-core input types per compute
capability. For the two generations used in this module's examples: compute capability 8.0 (A100) supports FP64, TF32,
BF16, FP16, INT8 and INT4; compute capability 9.0 (H100) supports FP64, TF32, BF16, FP16, FP8 and INT8. Newer
capabilities add more (the guide's table also lists FP6 and FP4 on later chips). The H100 whitepaper describes two FP8
variants, E4M3 and E5M2, and states that FP8 halves storage and doubles throughput compared with FP16 or BF16.

The datasheet pattern is the same on every generation: **each step to a narrower format roughly doubles the peak**.
Experiment 1 prints the ladder: on the H100 SXM5, dense TF32 is 7.4x the FP32 CUDA-core peak, BF16 14.8x and FP8 29.6x.
What the formats actually are (sign, exponent, mantissa) is Module 06; mixed-precision training is Module 07.

### How to read a peak-throughput table

Peak figures in a datasheet are **theoretical ceilings**: the number of units, times operations per clock, times the
boost clock, with perfect data delivery and no stalls. Six questions turn a number into something meaningful:

1. **Which precision?** TFLOPS at FP64, FP32, TF32, BF16/FP16, FP8 and INT8 differ by up to 50x on one chip.
2. **Tensor core or CUDA core?** The H100's FP16 rate is 133.8 TFLOPS on CUDA cores and 989.4 dense on tensor cores (Experiment 1).
3. **Dense or sparse?** Tensor cores can exploit fine-grained *structured sparsity* (a fixed pattern of zeros in the weights), which NVIDIA says doubles the throughput of standard tensor-core operations. Datasheets often print both figures or footnote one. The sparse number is exactly 2x the dense one in every row of Experiment 1, and it is only reachable if your weights have been pruned to the supported pattern and your kernels use it. **For an ordinary dense model, use the dense figure.**
4. **Which part?** SXM and PCIe/NVL variants of the same chip have different clocks and power limits and so different numbers.
5. **What accumulator?** Check whether the number assumes FP16 or FP32 accumulation.
6. **Peak or achieved?** Real kernels reach a fraction of peak; Module 03 explains the main reason (they cannot be fed data fast enough).

> [!pitfall]
> Do not copy a headline number into a capacity plan. NVIDIA's H100 product page, fetched for this module on 26 Oct 2026, lists BFLOAT16 Tensor Core at **1,979 teraFLOPS** for the H100 SXM, with an asterisk pointing to the footnote "With sparsity". The Hopper whitepaper's Table 1 shows both figures for the same chip: **989.4 dense**, 1,978.9 with sparsity. A dense training run can never exceed the 989.4 ceiling, and will land well below it.

### What tensor cores do not fix

Tensor cores speed up matmul-shaped work only. Everything else (activations, normalization, softmax, embedding lookups)
still runs on CUDA cores and is often limited by memory rather than math. NVIDIA's matrix-multiplication guide adds a
practical rule: tensor-core efficiency is best when matrix dimensions are aligned to multiples of 16 bytes (128 bytes
on the A100), which for FP16 means dimensions that are multiples of 8 (or 64 on the A100); odd sizes can leave the
tensor cores underused. And because tensor cores are so fast, the limiting factor is increasingly how quickly operands
can be delivered, which is the subject of the next module.

## Code

The code runs on any machine with NumPy (Python 3.13, NumPy 2.4.6). It does **not** use a GPU: Experiment 1 is
arithmetic on transcribed datasheet values, and Experiment 2 is a software illustration of tile-based
multiply-accumulate, not a model of any specific chip's circuitry.

> [!example]
> **Experiment 1.** Datasheet numbers as data, with consistency checks: peak = cores x 2 x clock, implied FLOPs per clock per tensor core, sparse = 2x dense, and the speedup of tensor cores over CUDA cores. Values are per NVIDIA documents, checked Oct 2026 (sources named in the comments).

```python
# Peak throughput in TFLOPS (TOPS for INT8), transcribed from NVIDIA documents, checked Oct 2026:
#   H100 SXM5: "NVIDIA H100 Tensor Core GPU Architecture" whitepaper v1.04, Tables 1 and 3
#   A100:      "NVIDIA A100 Tensor Core GPU" datasheet (Jun21), SXM column; core counts and clocks from the
#              same Hopper whitepaper's Table 3.  Tuples are (dense, with-sparsity).
GPUS = {
    "A100 SXM":  dict(fp32_cores=6912,  tensor_cores=432, fp32_ghz=1.41, tc_ghz=1.41,
                      fp32=19.5, fp16_cuda=78.0,
                      tc={"TF32": (156, 312), "BF16": (312, 624), "FP16": (312, 624), "INT8": (624, 1248)}),
    "H100 SXM5": dict(fp32_cores=16896, tensor_cores=528, fp32_ghz=1.98, tc_ghz=1.83,
                      fp32=66.9, fp16_cuda=133.8,
                      tc={"TF32": (494.7, 989.4), "BF16": (989.4, 1978.9), "FP16": (989.4, 1978.9),
                          "FP8": (1978.9, 3957.8), "INT8": (1978.9, 3957.8)}),
}

for name, g in GPUS.items():
    print(f"== {name}")
    # 1) A CUDA core does one fused multiply-add (2 FLOPs) per clock, so peak = cores * 2 * clock.
    calc_fp32 = g["fp32_cores"] * 2 * g["fp32_ghz"] * 1e9 / 1e12
    print(f"  FP32 (CUDA cores): cores*2*clock = {calc_fp32:6.1f} TFLOPS   datasheet = {g['fp32']}")
    # 2) Work backwards from the datasheet: FLOPs per clock per tensor core (dense FP16).
    dense16 = g["tc"]["FP16"][0]
    per_tc = dense16 * 1e12 / (g["tensor_cores"] * g["tc_ghz"] * 1e9)
    print(f"  FP16 tensor core : implied {per_tc:6.0f} FLOPs/clock/tensor core ({per_tc/2:.0f} FMAs)")
    # 3) The sparse figure is exactly 2x the dense figure in every row.
    assert all(abs(s - 2 * d) / s < 0.01 for d, s in g["tc"].values())
    print(f"  FP16 on CUDA cores: {g['fp16_cuda']} TFLOPS vs {dense16} on tensor cores = {dense16 / g['fp16_cuda']:.1f}x")
    # 4) How much faster is the best dense tensor-core mode than the FP32 CUDA cores?
    for fmt, (dense, sparse) in g["tc"].items():
        print(f"  {fmt:>5}: dense {dense:7.1f} | sparse {sparse:7.1f} TFLOPS | dense = {dense / g['fp32']:5.1f}x the FP32 CUDA-core peak")
```

Output (deterministic):

```
== A100 SXM
  FP32 (CUDA cores): cores*2*clock =   19.5 TFLOPS   datasheet = 19.5
  FP16 tensor core : implied    512 FLOPs/clock/tensor core (256 FMAs)
  FP16 on CUDA cores: 78.0 TFLOPS vs 312 on tensor cores = 4.0x
   TF32: dense   156.0 | sparse   312.0 TFLOPS | dense =   8.0x the FP32 CUDA-core peak
   BF16: dense   312.0 | sparse   624.0 TFLOPS | dense =  16.0x the FP32 CUDA-core peak
   FP16: dense   312.0 | sparse   624.0 TFLOPS | dense =  16.0x the FP32 CUDA-core peak
   INT8: dense   624.0 | sparse  1248.0 TFLOPS | dense =  32.0x the FP32 CUDA-core peak
== H100 SXM5
  FP32 (CUDA cores): cores*2*clock =   66.9 TFLOPS   datasheet = 66.9
  FP16 tensor core : implied   1024 FLOPs/clock/tensor core (512 FMAs)
  FP16 on CUDA cores: 133.8 TFLOPS vs 989.4 on tensor cores = 7.4x
   TF32: dense   494.7 | sparse   989.4 TFLOPS | dense =   7.4x the FP32 CUDA-core peak
   BF16: dense   989.4 | sparse  1978.9 TFLOPS | dense =  14.8x the FP32 CUDA-core peak
   FP16: dense   989.4 | sparse  1978.9 TFLOPS | dense =  14.8x the FP32 CUDA-core peak
    FP8: dense  1978.9 | sparse  3957.8 TFLOPS | dense =  29.6x the FP32 CUDA-core peak
   INT8: dense  1978.9 | sparse  3957.8 TFLOPS | dense =  29.6x the FP32 CUDA-core peak
```

Every internal check passes: the formula reproduces both FP32 peaks; the implied per-clock rates (512 versus 1,024
FLOPs per tensor core) match the whitepaper's "double per SM, clock for clock"; and the `assert` confirms every sparse
figure is 2x its dense figure. INT8 is in TOPS (integer operations), not TFLOPS, so the INT8 "x FP32" ratio compares
operation counts of different kinds.

The table form, with the same values:

| Peak throughput (TFLOPS; TOPS for INT8), checked Oct 2026 | A100 SXM dense | A100 sparse | H100 SXM5 dense | H100 SXM5 sparse |
| --- | --- | --- | --- | --- |
| FP64 (CUDA cores) | 9.7 | n/a | 33.5 | n/a |
| FP64 tensor core | 19.5 | n/a | 66.9 | n/a |
| FP32 (CUDA cores) | 19.5 | n/a | 66.9 | n/a |
| FP16 (CUDA cores) | 78 | n/a | 133.8 | n/a |
| TF32 tensor core | 156 | 312 | 494.7 | 989.4 |
| BF16 tensor core | 312 | 624 | 989.4 | 1,978.9 |
| FP16 tensor core | 312 | 624 | 989.4 | 1,978.9 |
| FP8 tensor core | not supported | - | 1,978.9 | 3,957.8 |
| INT8 tensor core | 624 | 1,248 | 1,978.9 | 3,957.8 |

Sources: A100 columns from the NVIDIA A100 Tensor Core GPU datasheet (Jun21 edition, SXM4 column; the FP16 CUDA-core
row is from the Hopper whitepaper's comparison table); H100 SXM5 columns from the NVIDIA H100 Tensor Core GPU
Architecture whitepaper v1.04, Tables 1 and 3. Newer GPUs have newer datasheets; the reading method does not change, but
the numbers do.

> [!example]
> **Experiment 2.** A tile-based multiply-accumulate in NumPy: FP16 tiles in, FP32 accumulator, a tiled matmul built from it and checked against `np.matmul`, then the FP16-versus-FP32 accumulator comparison.

```python
import numpy as np

TILE = 16   # CUDA's WMMA API exposes 16x16x16 tiles to a warp (NVIDIA, "Programming Tensor Cores in CUDA 9")

def mma(a_tile, b_tile, c_tile):
    """One 'tensor core operation': D = A @ B + C on small tiles.
    A and B are float16; each product is exact in float32; the running sum is float32."""
    return a_tile.astype(np.float32) @ b_tile.astype(np.float32) + c_tile

def tiled_matmul(A16, B16, tile=TILE):
    (M, K), (K2, N) = A16.shape, B16.shape
    assert K == K2 and M % tile == 0 and N % tile == 0 and K % tile == 0
    C = np.zeros((M, N), dtype=np.float32)
    n_mma = 0
    for i in range(0, M, tile):
        for j in range(0, N, tile):
            acc = np.zeros((tile, tile), dtype=np.float32)       # the accumulator tile stays in registers
            for k in range(0, K, tile):
                acc = mma(A16[i:i+tile, k:k+tile], B16[k:k+tile, j:j+tile], acc)
                n_mma += 1
            C[i:i+tile, j:j+tile] = acc
    return C, n_mma

rng = np.random.default_rng(0)
M = N = K = 64
A16 = rng.standard_normal((M, K)).astype(np.float16)
B16 = rng.standard_normal((K, N)).astype(np.float16)

C_tiled, n_mma = tiled_matmul(A16, B16)
C_fp32 = np.matmul(A16.astype(np.float32), B16.astype(np.float32))
C_exact = np.matmul(A16.astype(np.float64), B16.astype(np.float64))   # high-precision reference

print("tiled result == np.matmul on float32 copies:", np.allclose(C_tiled, C_fp32, rtol=1e-5, atol=1e-5))
print(f"max |tiled - float64 reference| = {np.abs(C_tiled - C_exact).max():.2e}")
print(f"tensor-core-style ops: {n_mma} tile operations of {TILE}x{TILE}x{TILE} = {TILE**3} multiply-adds each")
print(f"scalar CUDA-core-style ops: {M*N*K:,} multiply-adds  ({M*N*K // n_mma} per tile operation)")

# Why accumulate in float32? Same fp16 inputs, long dot products, two accumulator precisions.
def dot_accumulate(a16, b16, acc_dtype):
    acc = np.zeros(a16.shape[0], dtype=acc_dtype)
    for k in range(a16.shape[1]):
        prod = a16[:, k].astype(acc_dtype) * b16[:, k].astype(acc_dtype)   # product rounded to acc precision
        acc = (acc + prod).astype(acc_dtype)                                 # sum rounded to acc precision
    return acc

print(f"\n{'K':>6}{'typical |result|':>18}{'mean abs err, fp16 acc':>24}{'fp32 acc':>12}")
for K in (64, 512, 4096):
    a = rng.standard_normal((256, K)).astype(np.float16)
    b = rng.standard_normal((256, K)).astype(np.float16)
    exact = (a.astype(np.float64) * b.astype(np.float64)).sum(axis=1)
    err = lambda r: float(np.mean(np.abs(r.astype(np.float64) - exact)))
    print(f"{K:>6}{np.abs(exact).mean():>18.2f}{err(dot_accumulate(a, b, np.float16)):>24.2e}{err(dot_accumulate(a, b, np.float32)):>12.2e}")
```

Output (seeded, reproduces exactly):

```
tiled result == np.matmul on float32 copies: True
max |tiled - float64 reference| = 3.21e-06
tensor-core-style ops: 64 tile operations of 16x16x16 = 4096 multiply-adds each
scalar CUDA-core-style ops: 262,144 multiply-adds  (4096 per tile operation)

     K  typical |result|  mean abs err, fp16 acc    fp32 acc
    64              6.32                6.25e-03    7.98e-07
   512             19.99                5.92e-02    7.35e-06
  4096             51.70                4.62e-01    5.33e-05
```

The tile loop agrees with `np.matmul` (to float32 rounding) and with a float64 reference to about `3e-6`. With 4096-long
dot products, FP16 accumulation is off by about 0.46 on results near 52, while FP32 accumulation is off by `5e-5`:
about four orders of magnitude better for the same FP16 inputs. (The FP16-accumulate loop rounds the product and the sum
separately, a deliberately simple emulation.)

## Visual diagram

One multiply-add versus one tile operation:

```
CUDA core (one lane)                Tensor core (one tile operation)
┌──────────────────────────────┐    ┌────────────────────────────────────────────────────┐
│ a ──┐                        │    │ A tile 16x16     B tile 16x16     C tile 16x16     │
│     ├─► × ──► + ──► d        │    │ ┌──────────┐       ┌──────────┐       ┌──────────┐ │
│ b ──┘          ▲             │    │ │ ■ ■ ■ ■  │   ×   │ ■ ■ ■ ■  │   +   │ ■ ■ ■ ■  │ │
│ c ─────────────┘             │    │ │ ■ ■ ■ ■  │       │ ■ ■ ■ ■  │       │ ■ ■ ■ ■  │ │
│                              │    │ └──────────┘       └──────────┘       └──────────┘ │
│ d = a*b + c                  │    │                                                    │
│ 1 multiply-add per clock     │    │ D = A × B + C                                      │
│ = 2 FLOPs                    │    │ 16 x 16 x 16 = 4096 multiply-adds,                 │
│                              │    │ issued as one warp-level operation                 │
│ inputs: scalar               │    │                                                    │
└──────────────────────────────┘    │ inputs: FP16 / BF16 / FP8 / INT8 ...               │
                                    │ accumulator: typically FP32                        │
                                    └────────────────────────────────────────────────────┘
```

A matmul as a loop of tile operations (what Experiment 2 runs):

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│ for each output tile (i, j):                                                        │
│     acc = 0                                   # accumulator tile stays in registers │
│     for k in range(K // 16):                                                        │
│         acc = MMA(A[i, k], B[k, j], acc)      # one tensor-core operation per step  │
│     C[i, j] = acc                                                                   │
│                                                                                     │
│ 64x64 @ 64x64 with 16x16x16 tiles:  4 x 4 output tiles x 4 k-steps = 64 MMAs        │
│ same product on scalar CUDA cores:  64 x 64 x 64 = 262,144 multiply-adds            │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

The six questions to ask of any peak-TFLOPS number:

```
┌─────────────────────────┬──────────────────────────────────────────────────┐
│ 1. Which precision?     │ FP64 / FP32 / TF32 / BF16 / FP16 / FP8 / INT8    │
│ 2. Tensor or CUDA core? │ tensor cores only help matmul-shaped work        │
│ 3. Dense or sparse?     │ sparse = 2x dense; needs pruned weights          │
│ 4. Which part?          │ SXM vs PCIe/NVL: different clocks and power      │
│ 5. Which accumulator?   │ FP16 vs FP32 accumulate                          │
│ 6. Peak or achieved?    │ peak = ideal, boost clock, data always ready     │
└─────────────────────────┴──────────────────────────────────────────────────┘
```

## Practice

### 1. Peak from first principles

A hypothetical GPU has 100 SMs with 4 tensor cores each, every tensor core does 512 FLOPs per clock in dense FP16, and
the tensor clock is 1.5 GHz. What is its peak dense FP16 throughput? Then reproduce the H100 SXM5's 989.4 TFLOPS from
its tensor-core count (528) and clock (1.83 GHz).

<details><summary>Answer</summary>

`100 * 4 * 512 * 1.5e9 = 3.072e14` FLOP/s, i.e. **307.2 TFLOPS**. For the H100 SXM5, `528 * 1024 * 1.83e9` is about
`9.894e14`, i.e. 989.4 TFLOPS dense (the 1,024 FLOPs per clock per tensor core is the implied figure Experiment 1
prints).

</details>

### 2. Spot the sparse number

A vendor page says "up to 1,979 TFLOPS BF16" for an H100 SXM. You plan to train a dense model. What is the most you can
hope the tensor cores to deliver, and what fraction of your plan's budget does the headline number overstate?

<details><summary>Answer</summary>

1,979 is the with-sparsity figure; the dense ceiling is 989.4 TFLOPS (half). The headline overstates the ceiling by
2x, and real utilization will be a fraction of even 989.4. A plan built on 1,979 would underestimate the time by at
least half.

</details>

### 3. Change the tile size

In Experiment 2, change `TILE` to 8 and then 32 (keeping 64 x 64 matrices). How many tile operations does each use, and
does the result still match `np.matmul`?

<details><summary>Answer</summary>

Calling `tiled_matmul(A16, B16, tile)` with tile 8, 16 and 32 gives 512, 64 and 8 tile operations respectively, and
`np.allclose` against the float32 reference is `True` in all three cases. Bigger tiles mean fewer, larger operations; the
total multiply-adds (262,144) is unchanged, and the answer does not depend on the tile size.

</details>

### Checkpoint quiz

1. How many FLOPs does one CUDA core perform per clock when it executes a fused multiply-add?
2. What operation does a tensor core perform, and on what kind of object?
3. Why do tensor cores take FP16/BF16 inputs but accumulate in FP32?
4. A datasheet row reads "BF16 Tensor Core 1,979 TFLOPS" with a footnote "With sparsity". What is the dense figure?
5. Name two operations in a transformer layer that tensor cores cannot accelerate.

<details><summary>Answers</summary>

1. Two (one multiply and one add per clock).
2. A matrix multiply-accumulate, `D = A x B + C`, on a small tile (for example 16 x 16 x 16 at the warp level).
3. Low-precision inputs save memory bandwidth and allow higher throughput; accumulating many products in FP32 prevents the rounding drift that FP16 accumulation causes (Experiment 2: error about 0.46 versus `5e-5`).
4. Half of it, about 989 TFLOPS (the whitepaper lists 989.4).
5. Elementwise operations such as activations, residual adds, layer norm and softmax, which run on CUDA cores.

</details>

> [!check]
> - I can state what a CUDA core and a tensor core each do per clock or per instruction
> - I can derive a peak FLOP/s figure from unit count, operations per clock and clock speed
> - I can explain why FP16 inputs are paired with an FP32 accumulator
> - I can find the dense figure on a datasheet and say when the sparse one applies
> - I can list the questions to ask before trusting a headline TFLOPS number

## Project

**Audit a datasheet you did not read in this module.** Pick one NVIDIA data-center GPU datasheet or whitepaper other than
the A100 and H100 SXM5 (for example, a different generation or a PCIe variant), download it, and record its peak-throughput
table in a Python dictionary with the document title, version/date and page. Then write a short script, with no GPU
needed, that:

1. normalizes every row to dense TFLOPS/TOPS and flags rows the datasheet reports only with sparsity;
2. computes each tensor-core format's ratio to the FP32 CUDA-core peak;
3. if core counts and clocks are available, checks `cores x 2 x clock` against the FP32 figure and reports the implied FLOPs per clock per tensor core;
4. runs consistency checks (sparse = 2x dense? narrower format = 2x wider format?) and prints any row that fails, with your best explanation.

Finish with five sentences describing what surprised you. No solution is provided.

## Interview questions

> [!interview]
> What is the difference between a CUDA core and a tensor core, and why do transformers care?

<details><summary>What a strong answer covers</summary>

- CUDA core: scalar FP32 fused multiply-add per clock (2 FLOPs), general purpose; tensor core: a matrix multiply-accumulate on a tile per operation, specialized.
- Transformers are dominated by matmuls, which decompose into tile MMAs, so the tensor-core path delivers roughly an order of magnitude more throughput than CUDA cores on the same chip.
- Elementwise and reduction ops do not use tensor cores, so they stay on CUDA cores and are usually memory-bound.
- Mention low-precision inputs with higher-precision accumulation.

</details>

> [!interview]
> A vendor claims 1,979 TFLOPS for a GPU, but your training job sustains 300. Is something wrong?

<details><summary>What a strong answer covers</summary>

- Check precision, dense versus sparse (1,979 is the sparse BF16 figure; dense is about 989), and form factor.
- Peak assumes boost clock, perfect data delivery and no stalls; real jobs spend time on memory-bound ops, communication and launch overhead.
- Define utilization as achieved divided by dense peak and say what range counts as healthy for the workload, without inventing a number.
- Point to profiling rather than guessing.

</details>

> [!interview]
> Why is accumulation done in FP32 when the inputs are FP16 or BF16?

<details><summary>What a strong answer covers</summary>

- A matmul sums many products; each FP16 addition rounds, and rounding errors grow with the length of the sum.
- Products of two FP16 values fit exactly in FP32, so the multiply loses nothing and only the sum needs the wider format.
- Evidence: a quantitative example such as Experiment 2's four-orders-of-magnitude gap at K = 4096.
- It gets the bandwidth and throughput benefits of 16-bit storage without the accuracy loss.

</details>

## Common mistakes & troubleshooting

- **Planning with the sparse number.** Re-read the footnotes; use the dense figure unless your model is pruned to the supported structured-sparsity pattern.
- **FP32 matmuls run far below the tensor-core numbers.** Plain FP32 arithmetic runs at the FP32 rate; the big tensor-core figures need a lower-precision path. Frameworks gate that behind a setting. PyTorch documents it as `torch.set_float32_matmul_precision`: `"highest"` uses full float32 internally, while `"high"` and `"medium"` allow faster, lower-precision internal arithmetic. Use it knowingly, and check your version's default.
- **Tensor cores seem idle for odd shapes.** Pad matrix dimensions to multiples of 8 for FP16 (64 on A100) as NVIDIA's guide recommends.
- **Datasheet numbers do not match between sources.** Check that they are the same part (SXM versus PCIe versus NVL), the same precision and the same dense/sparse basis, and note the document version and date.

## Further reading & sources

- [NVIDIA H100 Tensor Core GPU Architecture whitepaper (Hopper, v1.04)](https://resources.nvidia.com/en-us-hopper-architecture/nvidia-h100-tensor-c) - primary source for the H100 SXM5 and A100 dense/sparse peak tables (Tables 1 and 3), core counts, clocks, the FP8 formats and the sparsity statement.
- [NVIDIA A100 Tensor Core GPU datasheet](https://www.nvidia.com/content/dam/en-zz/Solutions/Data-Center/a100/pdf/nvidia-a100-datasheet-us-nvidia-1758950-r4-web.pdf) - the A100 specification table with dense and `*` with-sparsity columns, memory sizes and bandwidth (Jun21 edition).
- [NVIDIA H100 GPU product page](https://www.nvidia.com/en-us/data-center/h100/) - the web version of the H100 specification table, which prints the with-sparsity figures under a `* With sparsity` footnote; the pitfall example in this module.
- [Programming Tensor Cores in CUDA 9 (NVIDIA Technical Blog)](https://developer.nvidia.com/blog/programming-tensor-cores-cuda-9/) - NVIDIA's description of the Volta tensor core (4x4x4 multiply-accumulate, 64 FMAs per clock, FP16 inputs with FP32 accumulation) and the 16x16x16 warp-level WMMA tile.
- [CUDA Programming Guide, 5.1 Compute Capabilities](https://docs.nvidia.com/cuda/cuda-programming-guide/05-appendices/compute-capabilities.html) - Table 33, the tensor-core input data types supported by each compute capability.
- [NVIDIA Deep Learning Performance: Matrix Multiplication Background](https://docs.nvidia.com/deeplearning/performance/dl-performance-matrix-multiplication/index.html) - the tensor-core alignment guidance (multiples of 8 for FP16, 64 on A100) cited in the pitfall notes.
- [PyTorch: torch.set_float32_matmul_precision](https://docs.pytorch.org/docs/stable/generated/torch.set_float32_matmul_precision.html) - documents how frameworks trade float32 matmul precision for speed using lower-precision internal arithmetic.

## Next

[Module 03: Memory Hierarchy and Bandwidth](../03-memory-hierarchy-and-bandwidth/README.md)
