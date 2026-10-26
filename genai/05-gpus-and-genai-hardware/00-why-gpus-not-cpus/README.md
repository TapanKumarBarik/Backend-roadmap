# Module 00: Why GPUs, Not CPUs

## Roadmap

This is the first module of [Track 05: GPUs & GenAI Hardware](../README.md). Every earlier track treated
the model as software: tokens go in, matrices get multiplied, tokens come out. This track asks what that
costs in hardware, and the answer starts with one question: why are these models run on GPUs rather
than on the processor in a normal laptop or server?

**Before this module** you should have seen what a transformer layer computes
([Track 02, Module 01: The Math You Actually Need](../../02-transformer-architecture/01-the-math-you-actually-need-vectors-matrices-dot-products/README.md),
[Track 02, Module 12: The Feed-Forward Network](../../02-transformer-architecture/12-the-feed-forward-network/README.md))
and the `C ≈ 6ND` training-cost rule from
[Track 04, Module 04: Compute Budgets and Chinchilla Optimality](../../04-training-fine-tuning-and-alignment/04-compute-budgets-and-chinchilla-optimality/README.md).

**After this module** you can:

- explain the difference between a latency-optimized and a throughput-optimized processor in plain words;
- show, with a runnable experiment, why a matrix multiplication is a "do a million independent things" job;
- read the two numbers that bound almost every AI workload (FLOP/s and memory bandwidth) and measure both on your own machine;
- estimate, from those two numbers, why a CPU cannot train an LLM and where it can still run one.

**Why it matters:** every later decision in this track (which GPU, how much VRAM, whether a model fits, what a
cloud bill looks like) is a consequence of the idea in this module. The GPU internals come next, in
[Module 01](../01-gpu-architecture-for-software-engineers/README.md).

## Concept

> [!key]
> A CPU is built to finish one task as quickly as possible; a GPU is built to finish an enormous number of identical, independent tasks per second. A transformer is almost entirely matrix multiplication, which is exactly that kind of job, so the GPU wins by a margin no clock-speed tweak could close.

## Explanation

### Two ways to be fast

"Fast" means two different things.

- **Latency**: how long one task takes from start to finish. Opening a file, handling one web request, running a `for` loop where each step needs the last step's answer.
- **Throughput**: how many tasks finish per second, regardless of how long each one individually takes.

A CPU core is tuned for latency. It spends a large share of its silicon on big caches, branch prediction and
logic that reorders instructions, all so that *one* thread of ordinary, branchy, unpredictable code runs as
quickly as it can. A GPU makes the opposite trade: it spends that silicon on a huge number of simple math units
and accepts that each individual thread is slower. NVIDIA's CUDA Programming Guide describes it this way: a CPU
excels at running a serial sequence of operations as fast as possible and can run a few tens of such threads
in parallel, while a GPU runs thousands of threads in parallel, "trading off lower single-thread performance to
achieve much greater total throughput", and devotes more transistors to data processing while the CPU devotes
more to caching and flow control.

> [!model]
> A sports car and a freight train. The sports car (CPU) gets one person across town in minutes. The train (GPU) takes longer to start and is useless for a single passenger, but moves ten thousand tonnes per trip. If your job is "move one parcel", buy the car. If your job is "move a million identical parcels", the train is not slightly better; it is a different order of magnitude.

The word that matters is *identical and independent*. A GPU only wins when there are a great many tasks that do
not wait on each other.

### Why a transformer is mostly matrix multiplication

Follow one token through one transformer block (Track 02 covers each step in detail) and mark which steps are matrix multiplications ("matmuls"):

| Step in a block | Operation | Matmul? |
| --- | --- | --- |
| Compute queries, keys, values | `x @ W_q`, `x @ W_k`, `x @ W_v` | yes |
| Attention scores | `Q @ K.T` | yes |
| Softmax over the scores | elementwise exp, sum, divide | no (cheap) |
| Mix the values | `scores @ V` | yes |
| Output projection | `... @ W_o` | yes |
| Residual add, layer norm | elementwise | no (cheap) |
| Feed-forward up and down | `... @ W_1`, `... @ W_2` | yes |
| Activation function | elementwise | no (cheap) |

The weight matrices (`W_q` through `W_2`) are where a model's parameters live, and each parameter takes part in
one multiply and one add per token. The scaling-laws paper turns that into a rule of thumb: a forward pass costs
about `2N` floating-point operations per token for a model with `N` non-embedding parameters, and training
(forward plus backward) about `6N` per token. Nearly all of those operations are inside matmuls; the elementwise
steps are a rounding error in the FLOP count (though, as Module 03 shows, they are not a rounding error in the
*time*).

### Why a matmul is the perfect parallel job

Multiplying an `M x K` matrix `A` by a `K x N` matrix `B` produces an `M x N` matrix `C` where

```
C[i][j] = A[i][0]*B[0][j] + A[i][1]*B[1][j] + ... + A[i][K-1]*B[K-1][j]
```

Each of the `M x N` output cells is its own dot product. No cell needs another cell's result. So you can compute
them in any order, or all at once, and get the identical answer. A 4096 x 4096 output has about 16.8 million
independent cells; that is the "million identical parcels" a throughput machine exists to move. The code section
below proves the order-independence with a real run.

Contrast that with a recurrence such as `h = tanh(1.5*h + 0.1)` repeated 1000 times: step 1000 needs step 999's
answer. You can make that single step very fast, but you cannot spread the steps across a thousand workers. That
is the CPU's home territory, and it is why older sequence models (RNNs, [Track 00, Module 04](../../00-genai-foundations/04-rnns-lstms-and-the-sequence-problem/README.md)) were awkward to
accelerate and why the transformer's attention-plus-matmul design suited GPUs so well. The original transformer
paper makes the same point about its attention: it is "much faster and more space-efficient in practice, since it
can be implemented using highly optimized matrix multiplication code."

### The two numbers that matter

Two quantities set a ceiling on how fast any workload runs. This module introduces them; Module 03 uses them in
depth.

- **FLOP/s** (floating-point operations per second): how much arithmetic the chip can do. Written with the slash because it is a *rate*.
- **Memory bandwidth** (bytes per second, GB/s): how fast data can move between memory and the math units.

> [!pitfall]
> `FLOPs` (with a lowercase s, a count: "this matmul costs 4.2 million FLOPs") and `FLOP/s` or `FLOPS` (a rate: "this chip does 989 trillion per second") get mixed up constantly, including in vendor material. Always ask whether a number is a *quantity of work* or a *speed*. Likewise, `GB` is a size and `GB/s` is a speed.

A processor can be starved of either one. Doing a lot of arithmetic on a little data is limited by FLOP/s. Doing
a little arithmetic on a lot of data (adding two huge arrays, or generating one token from a huge set of weights)
is limited by bandwidth. The experiment below measures both on your own machine.

### What the experiment shows, and what it does not

The first code block runs the same 128 x 128 matrix multiplication three ways: a pure-Python triple loop, one
`np.dot` per output cell, and a single vectorized `A @ B`. The last is roughly a thousand times faster than the
first on the author's machine. Three things stack up behind that factor: the Python interpreter's per-operation
overhead disappears, the library (NumPy calls a BLAS library such as OpenBLAS) uses the CPU's wide vector
instructions to do several multiply-adds per instruction, and it spreads the work across the CPU's cores. All
three are possible *because* the matmul is made of independent pieces.

> [!pitfall]
> That thousand-fold speedup is **not** a CPU-versus-GPU number. Both the slow and the fast version ran on the same CPU. It shows the *idea* of data-parallel execution and how much a program leaves on the table when it ignores it. A GPU pushes the same idea much further by supplying vastly more parallel hardware; Modules 01 and 02 show how.

### Why training and serving an LLM on a CPU is impractical

Put the measured numbers to work. The second code block times a large matmul (FLOP/s) and a large array add
(bytes/s) on your machine and projects a hypothetical 7-billion-parameter model onto them:

- **Training** needs about `6 * N * D` FLOPs for `D` training tokens (Track 04 Module 04). For `N = 7e9` and `D = 1e12`, that is `4.2e22` FLOPs. At the matmul rate measured in this module's run, that is thousands of years. Even the most generous reading, a hundred CPUs of the same speed with perfect scaling, is decades. The H100 whitepaper's dense BF16 peak is over a thousand times this machine's measured matmul rate; peak is a ceiling, not what real jobs sustain, but the gap is large enough that the order of magnitude is the point.
- **Generating text (inference)** has a different bottleneck. To produce one token the model must read *every weight* once. With fp16 weights that is `2 * N` bytes. Dividing by memory bandwidth gives a time per token that is far longer than the time to do the math, so generation is limited by bytes/s rather than FLOP/s. Module 03 explains this properly; for now notice the "memory" column dwarfs the "math" column in the output below.

### What "practical on a CPU" still means

CPUs are not useless for GenAI. They are practical when the job is small and patient:

- **One user, one request at a time** (batch size 1), where latency of a few tokens per second is acceptable.
- **Small or compressed models.** Because generation is limited by bytes read per token, shrinking the weights (quantization, [Track 04, Module 15](../../04-training-fine-tuning-and-alignment/15-quantization-int8-int4-gguf/README.md)) shrinks the time almost proportionally. The 4-bit row in the output below is the same arithmetic with a quarter of the bytes.
- **Everything around the model**: tokenization, retrieval, orchestration, HTTP serving. Those are ordinary, branchy, latency-sensitive code, which is what CPUs are for.

What a CPU cannot do is train a modern LLM, or serve many users at once at a speed they would accept. Module 14
([Running Models on CPU and Apple Silicon](../14-running-models-on-cpu-and-apple-silicon/README.md)) covers
the practical side: which runtimes, which formats, and realistic expectations.

## Code

All three snippets use only NumPy. They were run with Python 3.13 and NumPy 2.4.6 on a Windows 11 machine with an
Intel CPU exposing 16 logical cores. **Your timings will differ**; run them more than once and treat the ratios, not the
absolute values, as the lesson.

> [!example]
> **Experiment 1.** The same matmul, three ways. Predict the ordering before you run it.

```python
import time
import numpy as np

def matmul_triple_loop(A, B):
    """Pure Python: one multiply-add at a time, like a single fast worker."""
    n, k = len(A), len(B)
    m = len(B[0])
    C = [[0.0] * m for _ in range(n)]
    for i in range(n):
        for j in range(m):
            s = 0.0
            for p in range(k):
                s += A[i][p] * B[p][j]
            C[i][j] = s
    return C

def matmul_dot_per_cell(A, B):
    """One numpy dot product per output cell: parallelism inside the dot, none across cells."""
    n, m = A.shape[0], B.shape[1]
    C = np.empty((n, m))
    for i in range(n):
        for j in range(m):
            C[i, j] = np.dot(A[i, :], B[:, j])
    return C

def best_of(fn, repeats):
    best = float("inf")
    for _ in range(repeats):
        t0 = time.perf_counter()
        fn()
        best = min(best, time.perf_counter() - t0)
    return best

n = 128
rng = np.random.default_rng(0)
A = rng.standard_normal((n, n))
B = rng.standard_normal((n, n))
flops = 2 * n**3          # n^3 multiply-adds, each counted as 2 FLOPs

reference = A @ B
A_list, B_list = A.tolist(), B.tolist()

t_loop = best_of(lambda: matmul_triple_loop(A_list, B_list), 1)
t_cell = best_of(lambda: matmul_dot_per_cell(A, B), 3)
t_vec  = best_of(lambda: A @ B, 200)

assert np.allclose(np.array(matmul_triple_loop(A_list, B_list)), reference)
assert np.allclose(matmul_dot_per_cell(A, B), reference)

print(f"n = {n}, FLOPs per matmul = {flops:,}")
print(f"{'method':<28}{'time (ms)':>12}{'GFLOP/s':>12}{'vs loop':>12}")
for name, t in [("pure Python triple loop", t_loop),
                ("np.dot per output cell", t_cell),
                ("vectorized A @ B", t_vec)]:
    print(f"{name:<28}{t*1e3:>12.3f}{flops/t/1e9:>12.3f}{t_loop/t:>11.0f}x")
```

Output from one run (a second run gave 1104x for the last row; yours will differ):

```
n = 128, FLOPs per matmul = 4,194,304
method                         time (ms)     GFLOP/s     vs loop
pure Python triple loop           59.452       0.071          1x
np.dot per output cell            11.325       0.370          5x
vectorized A @ B                   0.052      79.892       1132x
```

The two `assert` lines confirm all three methods compute the same matrix. Only the *execution strategy* changed.

> [!example]
> **Experiment 2.** Prove the independence claim: compute the output in 16 tiles, in a random order, and get the same answer. Then contrast with a recurrence.

```python
import numpy as np

rng = np.random.default_rng(1)
n = 64
A = rng.standard_normal((n, n))
B = rng.standard_normal((n, n))
reference = A @ B

# Split the output into 16 tiles of 16x16. Each tile needs only a strip of A's rows
# and a strip of B's columns -- no tile needs any other tile's result.
tile = 16
tiles = [(i, j) for i in range(0, n, tile) for j in range(0, n, tile)]

# Compute the tiles in a random order -- the answer cannot depend on the order.
order = rng.permutation(len(tiles))
C = np.zeros((n, n))
for idx in order:
    i, j = tiles[idx]
    C[i:i+tile, j:j+tile] = A[i:i+tile, :] @ B[:, j:j+tile]

print("tiles computed independently:", len(tiles))
print("order used:", order.tolist())
print("matches A @ B:", np.allclose(C, reference))

# Contrast: a recurrence, where step t needs step t-1. Order DOES matter here.
def recurrence(x0, steps):
    h = x0
    for _ in range(steps):
        h = np.tanh(h * 1.5 + 0.1)
    return h
print("recurrence after 10 steps:", round(float(recurrence(0.2, 10)), 6),
      "(cannot start step 10 before step 9 is done)")
```

Output (the seeded permutation and the final value reproduce exactly):

```
tiles computed independently: 16
order used: [7, 1, 11, 13, 6, 9, 12, 10, 0, 8, 14, 3, 2, 15, 4, 5]
matches A @ B: True
recurrence after 10 steps: 0.893812 (cannot start step 10 before step 9 is done)
```

Sixteen workers could each take one tile and never talk to each other. That is the entire principle behind
using thousands of GPU lanes for a transformer.

> [!example]
> **Experiment 3.** Measure your machine's two numbers, then project LLM-sized jobs onto them. The `2N` and `6N` rules come from Kaplan et al. (2020); the model size `N = 7e9`, the 1e12 training tokens and the 4-bit "0.5 byte per parameter" figure are illustrative assumptions, not measurements of any real system.

```python
import time
import numpy as np

def best_of(fn, repeats):
    best = float("inf")
    for _ in range(repeats):
        t0 = time.perf_counter()
        fn()
        best = min(best, time.perf_counter() - t0)
    return best

# --- Number 1: FLOP/s -- a big float32 matmul (lots of math per byte) ---
n = 2048
A = np.random.default_rng(0).standard_normal((n, n), dtype=np.float32)
B = np.random.default_rng(1).standard_normal((n, n), dtype=np.float32)
gflops = 2 * n**3 / best_of(lambda: A @ B, 5) / 1e9

# --- Number 2: bytes/s -- adding two big arrays (almost no math per byte moved) ---
m = 32 * 1024 * 1024                      # 32M float32 = 128 MiB per array
x = np.ones(m, dtype=np.float32)
y = np.ones(m, dtype=np.float32)
out = np.empty(m, dtype=np.float32)
gbs = 3 * m * 4 / best_of(lambda: np.add(x, y, out=out), 5) / 1e9   # read x, read y, write out

print(f"measured matmul throughput : {gflops:8.1f} GFLOP/s (float32, {n}x{n})")
print(f"measured memory bandwidth  : {gbs:8.1f} GB/s     (np.add, 3 x {m*4/2**20:.0f} MiB moved)")

# --- Project LLM-sized jobs onto THIS machine (illustrative arithmetic, not a benchmark) ---
N = 7e9                                   # hypothetical 7-billion-parameter model
math_s = 2 * N / (gflops * 1e9)           # forward pass ~ 2N FLOPs per token (Kaplan et al. 2020)
print("\nGenerating ONE token (batch size 1), limited by whichever is slower:")
for label, bytes_per_param in [("fp16 weights (2 B/param)", 2.0), ("4-bit weights (~0.5 B/param)", 0.5)]:
    mem_s = N * bytes_per_param / (gbs * 1e9)    # every weight is read once per token
    print(f"  {label:<30} math {math_s*1e3:6.1f} ms | memory {mem_s*1e3:7.1f} ms "
          f"-> at best {1/max(math_s, mem_s):5.1f} tokens/s")

D = 1e12                                  # hypothetical 1 trillion training tokens
train_flops = 6 * N * D                   # training ~ 6N FLOPs per token (Kaplan et al. 2020)
years = train_flops / (gflops * 1e9) / 3.15576e7
print(f"\nTraining 7B on 1T tokens   : {train_flops:.2e} FLOP -> {years:,.0f} years at this machine's matmul rate")

# The Hopper whitepaper lists 989.4 TFLOPS as the dense BF16 tensor-core PEAK of one H100 SXM5.
# A peak is a ceiling, not what real jobs sustain: compare orders of magnitude only.
print(f"H100 SXM5 dense BF16 peak  : {989.4e12/(gflops*1e9):,.0f}x this machine's measured matmul rate")
```

Output from one run (two runs gave 539 and 607 GFLOP/s and 22.0 and 19.2 GB/s; your hardware will give different numbers):

```
measured matmul throughput :    539.0 GFLOP/s (float32, 2048x2048)
measured memory bandwidth  :     22.0 GB/s     (np.add, 3 x 128 MiB moved)

Generating ONE token (batch size 1), limited by whichever is slower:
  fp16 weights (2 B/param)       math   26.0 ms | memory   637.1 ms -> at best   1.6 tokens/s
  4-bit weights (~0.5 B/param)   math   26.0 ms | memory   159.3 ms -> at best   6.3 tokens/s

Training 7B on 1T tokens   : 4.20e+22 FLOP -> 2,469 years at this machine's matmul rate
H100 SXM5 dense BF16 peak  : 1,836x this machine's measured matmul rate
```

Read the output carefully, because it contains three separate lessons:

1. **The CPU's matmul rate is respectable; the problem is scale.** Hundreds of GFLOP/s is a lot of arithmetic. Training the hypothetical 7B model on 1T tokens needs `4.2e22` FLOPs.
2. **At batch size 1, memory is the limit, not math.** The memory column is more than twenty times the math column for fp16. Making the weights four times smaller (4-bit) cut the memory time by four, but the job stayed memory-bound.
3. **This is an upper bound.** Real inference also reads the KV cache and pays overheads, so real tokens/s are lower. Also, `np.add` runs on one thread, so its bandwidth number understates what all of the CPU's cores together could pull from memory; treat it as a rough floor for illustration.

## Visual diagram

Where the silicon goes (schematic, not to scale):

```
LATENCY-OPTIMIZED (CPU)                   THROUGHPUT-OPTIMIZED (GPU)
finish ONE job as fast as                 finish a MILLION similar jobs
possible                                  per second

┌──────────────────────────────────┐      ┌──────────────────────────────────┐
│ control logic, branch prediction │      │ small control + small caches     │
│ ┌──────────────────────────┐     │      │ ┌──┐┌──┐┌──┐┌──┐┌──┐┌──┐┌──┐┌──┐ │
│ │  large caches            │     │      │ │▒▒││▒▒││▒▒││▒▒││▒▒││▒▒││▒▒││▒▒│ │
│ └──────────────────────────┘     │      │ └──┘└──┘└──┘└──┘└──┘└──┘└──┘└──┘ │
│ ┌────────┐ ┌────────┐            │      │ ┌──┐┌──┐┌──┐┌──┐┌──┐┌──┐┌──┐┌──┐ │
│ │  core  │ │  core  │ ... a few  │      │ │▒▒││▒▒││▒▒││▒▒││▒▒││▒▒││▒▒││▒▒│ │
│ └────────┘ └────────┘     dozen  │      │ └──┘└──┘└──┘└──┘└──┘└──┘└──┘└──┘ │
│                                  │      │ ┌──┐┌──┐┌──┐┌──┐┌──┐┌──┐┌──┐┌──┐ │
│ few threads, each one fast       │      │ │▒▒││▒▒││▒▒││▒▒││▒▒││▒▒││▒▒││▒▒│ │
└──────────────────────────────────┘      │ └──┘└──┘└──┘└──┘└──┘└──┘└──┘└──┘ │
                                          │ thousands of simple lanes        │
                                          │ many threads, each one slower    │
                                          └──────────────────────────────────┘
        ▒▒ = a small math unit (a lane that does one multiply-add at a time)
```

Why a matmul fits the right-hand machine:

```
 C = A x B      every output cell is its own dot product

 ┌──────┬──────┬──────┬──────┐
 │ w00  │ w01  │ w02  │ w03  │   worker w(i,j) reads row i of A and column j of B,
 ├──────┼──────┼──────┼──────┤   and writes exactly ONE cell of C.
 │ w10  │ w11  │ w12  │ w13  │
 ├──────┼──────┼──────┼──────┤   No worker reads another worker's output, so all
 │ w20  │ w21  │ w22  │ w23  │   M x N of them can run at once, in any order.
 └──────┴──────┴──────┴──────┘
                                A recurrence is the opposite:  h1 ─► h2 ─► h3 ─► ...
                                each step waits for the one before it.
```

## Practice

### 1. Where does vectorized matmul stop scaling?

Run the vectorized `A @ B` for `n` in `16, 64, 256, 1024, 2048` (float32) and print GFLOP/s for each. Then repeat
with the environment variable `OPENBLAS_NUM_THREADS=1` set before launching Python. What do you see, and why?

<details><summary>Answer</summary>

On the author's machine:

```
n=   16      0.001 ms       9.1 GFLOP/s
n=   64      0.006 ms      85.9 GFLOP/s
n=  256      0.158 ms     211.8 GFLOP/s
n= 1024      4.102 ms     523.5 GFLOP/s
n= 2048     29.559 ms     581.2 GFLOP/s
```

With `OPENBLAS_NUM_THREADS=1` the large sizes dropped to about 128-132 GFLOP/s, while `n=16` and `n=64` barely changed.
Small matmuls are too small to keep many cores busy (the fixed cost of starting work dominates), so extra
threads buy nothing; large ones scale with threads, though here 16 logical cores gave about 4.4x, not 16x
(probably because logical cores are not 16 independent full-speed cores, and memory limits creep in; this was not investigated further). The lesson is that
parallel hardware needs *enough work* to pay off, which is why GPUs like big matrices. If your NumPy was built
with a different BLAS (for example MKL), the variable is different; `np.show_config()` tells you which.

</details>

### 2. Count FLOPs by hand

(a) How many FLOPs does a 4096 x 4096 weight matrix times a length-4096 vector cost? (b) How many does the
128 x 128 by 128 x 128 matmul in Experiment 1 cost? (c) By the `2N` rule, how many FLOPs does one forward-pass
token cost for a 1-billion-parameter model?

<details><summary>Answer</summary>

(a) `2 * 4096 * 4096 = 33,554,432` FLOPs (one multiply and one add per matrix entry).
(b) `2 * 128**3 = 4,194,304`, which matches the `FLOPs per matmul` line in the output.
(c) `2 * 1e9 = 2e9` FLOPs, 2 GFLOP.

</details>

### 3. Predict generation speed from bandwidth alone

Using the 22.0 GB/s from the Experiment 3 output (or your own number), what is the best-case tokens/s for a
1-billion-parameter model stored in fp16, and in 4-bit (~0.5 byte per parameter)? State the assumption that
makes this an upper bound.

<details><summary>Answer</summary>

fp16: `2e9 bytes / 22.0e9 B/s = 0.0909 s` per token, so at best about 11 tokens/s. 4-bit: `0.5e9 / 22.0e9 = 0.0227 s`,
about 44 tokens/s. The assumption: every weight is read once per token, memory is the only limit, and nothing else
(KV cache reads, overheads, math time) adds cost. Real systems are slower than this bound, never faster.

</details>

### Checkpoint quiz

1. In one sentence each, define a latency-optimized and a throughput-optimized processor.
2. Why can the 16 output tiles in Experiment 2 be computed in any order, while the steps of the `tanh` recurrence cannot?
3. By the rules used in this module, roughly how many FLOPs does one forward-pass token cost for an `N`-parameter model, and how many per training token?
4. In the Experiment 3 output, which is larger for fp16 generation at batch size 1, the math time or the memory time? What does that tell you the limit is?
5. Why is the ~1,100x speedup in Experiment 1 not evidence that "GPUs are 1,100x faster than CPUs"?

<details><summary>Answers</summary>

1. A latency-optimized processor finishes one task as quickly as possible (few fast threads, big caches, heavy control logic). A throughput-optimized processor finishes as many tasks per second as possible (thousands of simpler threads, slower each).
2. Each tile is its own set of dot products that reads only inputs, so no tile needs another's result. In the recurrence each step needs the previous step's output.
3. About `2N` for a forward pass and about `6N` for a training step (forward plus backward), per token (Kaplan et al., 2020).
4. The memory time (637 ms versus 26 ms in the pasted run). Generation at batch size 1 is limited by bytes/s, not FLOP/s.
5. Both versions ran on the same CPU. The speedup comes from removing interpreter overhead, using vector instructions and using multiple cores, i.e. from data-parallel execution on CPU hardware. It illustrates the principle, not a GPU measurement.

</details>

> [!check]
> - I can explain latency versus throughput and say which one a CPU and a GPU optimize for
> - I can point to the step in a transformer block that is *not* a matmul and say why it matters less for FLOP count
> - I can state `2N` (forward) and `6N` (training) FLOPs per token and tell a FLOP count from a FLOP/s rate
> - I measured my own FLOP/s and GB/s and can explain why text generation hits the second one first
> - I can say what "practical on a CPU" means and name one job a CPU still cannot do

## Project

**Build a "does it fit on this machine" estimator for your own laptop.** Write a script, with no GPU and no
libraries beyond NumPy, that:

1. measures your machine's matmul FLOP/s and memory bandwidth, and sweeps at least four matmul sizes and two thread counts to show where parallelism starts to pay (set the BLAS thread-count environment variable for your build before importing NumPy);
2. takes a model size in parameters and a bytes-per-parameter value as inputs and prints the best-case seconds per generated token, stating which of math or memory is the limit;
3. takes a parameter count and a token count and prints the training FLOPs and the time on your machine;
4. ends with a short written paragraph, in your own words, explaining what you measured and why the result is an upper bound.

There is no provided solution. Run it twice and report how much your numbers moved.

## Interview questions

> [!interview]
> Why are GPUs better than CPUs for deep learning? Avoid "they have more cores".

<details><summary>What a strong answer covers</summary>

- Latency-optimized versus throughput-optimized design, and where each spends its transistors.
- Transformers are dominated by matrix multiplication, whose output cells are independent dot products, so the work is data-parallel.
- Higher arithmetic throughput *and* far higher memory bandwidth, both of which matter.
- The honest caveat: GPUs lose on small, serial or branchy work, and data must be moved to GPU memory first.

</details>

> [!interview]
> A teammate proposes serving a 70-billion-parameter chat model for a hundred concurrent users on a big many-core CPU server because "CPU instances are cheaper". How do you respond?

<details><summary>What a strong answer covers</summary>

- Generation reads every weight for every token step, so it is bandwidth-bound; a CPU's memory bandwidth is typically far lower than GPU HBM (an H100 SXM5 is listed at 3,352 GB/s), so per-token latency is long.
- Concurrent users need batching to amortize weight reads; a CPU runs out of FLOP/s once the batch grows.
- A concrete estimate from weight bytes divided by bandwidth, not a guess.
- Where CPU does make sense: one user, small or quantized model, offline or hobby use (Module 14).

</details>

> [!interview]
> What is the difference between FLOPs and FLOP/s, and between compute-bound and memory-bound?

<details><summary>What a strong answer covers</summary>

- FLOPs is a count of operations (work); FLOP/s is a rate (a chip's capability).
- Time is the larger of math time (ops / FLOP/s) and memory time (bytes / bandwidth); whichever is larger is the bound.
- Examples: a big matmul is compute-bound; adding two big arrays or generating one token at batch size 1 is memory-bound.
- Mentioning arithmetic intensity (FLOPs per byte) is a bonus; it is the subject of Module 03.

</details>

## Common mistakes & troubleshooting

- **Timings jump around between runs.** The first call can include one-time setup, and other programs share the CPU. Time several repeats and take the best (as `best_of` does), and run on an otherwise idle machine. Expect run-to-run swings of ten percent or more; the ratios are what matter.
- **`A @ B` is far slower than the numbers above.** Check the dtype (float64 does more work per element than float32), whether your arrays are non-contiguous views, and which BLAS your NumPy uses (`np.show_config()`). Also check whether something has pinned it to one thread (`OPENBLAS_NUM_THREADS`, `MKL_NUM_THREADS`).
- **Reading a vendor number as the wrong kind of thing.** A "TFLOPS" figure is a peak rate for a specific precision (and sometimes with a sparsity assumption); it is not the speed your code will see. Module 02 shows how to read those figures properly.

## Further reading & sources

- [CUDA Programming Guide, 1.1 Introduction](https://docs.nvidia.com/cuda/cuda-programming-guide/01-introduction/introduction.html) - NVIDIA's own statement of the CPU-versus-GPU design trade-off (few fast threads versus thousands of slower ones, transistors spent on caches versus math units) quoted in this module.
- [Scaling Laws for Neural Language Models (Kaplan et al., 2020)](https://arxiv.org/abs/2001.08361) - source of the `2N` forward and `6N` training FLOPs-per-token estimates used in Experiment 3.
- [Attention Is All You Need (Vaswani et al., 2017)](https://arxiv.org/abs/1706.03762) - the transformer paper; its attention section notes the design maps onto highly optimized matrix multiplication code.
- [NVIDIA Deep Learning Performance: GPU Performance Background](https://docs.nvidia.com/deeplearning/performance/dl-performance-gpu-background/index.html) - vendor guide to FLOP/s, memory bandwidth and why small or low-intensity operations are memory-limited; Module 03 builds on it.
- [NVIDIA H100 Tensor Core GPU Architecture whitepaper (Hopper, v1.04)](https://resources.nvidia.com/en-us-hopper-architecture/nvidia-h100-tensor-c) - the primary source for the 989.4 TFLOPS dense BF16 peak figure compared against the CPU in Experiment 3.
- [NumPy: Linear algebra (numpy.linalg)](https://numpy.org/doc/stable/reference/routines.linalg.html) - official note that NumPy's linear algebra relies on BLAS libraries such as OpenBLAS or MKL, which is where the vectorized speedup in Experiment 1 comes from.

## Next

[Module 01: GPU Architecture for Software Engineers](../01-gpu-architecture-for-software-engineers/README.md)
