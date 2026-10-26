# Module 01: GPU Architecture for Software Engineers

## Roadmap

[Module 00](../00-why-gpus-not-cpus/README.md) argued that a GPU wins by running a huge number of independent
operations at once. This module opens the box far enough to see *how*, using the vocabulary a software engineer
meets in CUDA docs, profiler output and library source: streaming multiprocessors (SMs), threads, warps, blocks,
grids, occupancy and kernel launches.

**Before this module:** Module 00 (latency versus throughput, data-parallel work). No CUDA knowledge is assumed.

**After this module** you can:

- map a kernel launch (`grid` and `block` sizes) onto the hardware and compute which thread owns which element;
- explain SIMT execution and predict what warp divergence costs, with a number;
- work out an SM's occupancy from a kernel's resource use and name the limiting resource;
- explain why too few blocks, odd-sized blocks, or many tiny kernels waste a GPU.

**Why it matters:** the same few ideas explain why matmul libraries tile their work, why FlashAttention
([Module 08](../08-flashattention-and-memory-efficient-kernels/README.md)) fuses operations into one kernel, and why a
model that "should" be fast sometimes is not. Deliberately left out: the memory hierarchy
([Module 03](../03-memory-hierarchy-and-bandwidth/README.md)) and tensor cores
([Module 02](../02-cuda-cores-vs-tensor-cores/README.md)).

## Concept

> [!key]
> A GPU is a farm of independent multiprocessors (SMs). You launch a grid of thread blocks; each block lives on one SM, its threads run in groups of 32 called warps that execute one instruction in lockstep, and the SM hides slow operations by switching among many resident warps.

## Explanation

### The hardware in one paragraph

A GPU is a collection of **streaming multiprocessors (SMs)**, grouped into graphics processing clusters, all
connected to the GPU's memory. The CUDA Programming Guide describes each SM as having a local register file, a unified
data cache and a number of functional units that perform computation. The SM is the unit that matters to you: it is
where blocks run, where warps are scheduled and where resources run out.

| Per-SM facts (vendor documents, checked Oct 2026) | A100 (Ampere) | H100 SXM5 (Hopper) |
| --- | --- | --- |
| SMs on the GPU | 108 | 132 |
| FP32 "CUDA cores" per SM | 64 | 128 |
| Register file per SM | 256 KB | 256 KB |
| Shared memory per SM (configurable maximum) | 164 KB | 228 KB |
| Max resident threads / warps / blocks per SM | 2048 / 64 / 32 | 2048 / 64 / 32 |

The first four rows come from the Hopper architecture whitepaper (v1.04), Table 3; the last row is from the CUDA
Programming Guide (v13.4.2) compute-capability tables for 8.0 and 9.0. Other GPUs differ (compute capability 8.6
allows 1536 resident threads and 16 resident blocks per SM), so treat the table as orders of magnitude and look up
your own device.

### The software model: kernel, thread, block, grid

A **kernel** is a function that runs on the GPU; **launching** it starts many threads executing that function at
once. Threads come in two levels:

- A **thread block** is a group of up to 1024 threads. All threads of a block run on **one SM**, so they can synchronize and share fast on-chip memory.
- A **grid** is all the blocks of one launch. A grid can hold millions of blocks while the GPU has tens or hundreds of SMs; the hardware hands blocks to SMs as room appears. **There is no guarantee about block order, and a block cannot rely on another block's results.** That rule lets one program run unchanged on a small GPU or a huge one.

Each thread finds its own work from built-in variables. The standard 1-D idiom in CUDA C++, from the CUDA guide, is
`int workIndex = threadIdx.x + blockDim.x * blockIdx.x;` followed by a bounds check `if (workIndex < vectorLength)`,
launched as `vecAdd<<<blocks, threads>>>(...)` with `blocks = (vectorLength + threads - 1) / threads` (a ceiling
division). Experiment 2 simulates exactly this.

> [!model]
> Think of a launch as a very large `for` loop whose iterations are independent. The grid is the loop, each thread is one iteration, and a block is a chunk of iterations that must stay together because they share an SM. You write the loop *body*; the hardware decides which SM runs which chunk, and in what order.

(The current CUDA Programming Guide, v13.4.2, also describes a *tile* programming model in which you write per-block code on tiles of
data and the compiler maps it to threads, so warp divergence does not arise there. The per-thread SIMT model in this module is still the foundation
the hardware is built on, and what most kernel code and documentation use.)

### Warps and SIMT

Inside a block the hardware groups threads into **warps** of 32 consecutive threads. A warp executes under **SIMT**
(Single Instruction, Multiple Threads): it issues one instruction and all 32 lanes execute it together, each on its own
data and registers. One instruction fetch and decode serves 32 lanes, which is how an SM drives many math units cheaply.

Two practical consequences:

- **Block sizes should be a multiple of 32.** A 100-thread block still occupies 4 warps and leaves 28 lanes of the last one idle for the whole kernel (Experiment 2 prints this).
- **Threads in a warp may take different branches, at a price.** That is divergence.

### Warp divergence

SIMT lets each thread follow its own control flow, but the warp still issues one instruction at a time. If some lanes
take the `if` path and others the `else` path, the hardware runs one path with the other lanes **masked off**, then
runs the other. The paths execute one after the other, and the warp pays the sum. Experiment 1 shows the numbers:

- One lane out of 32 needing the other path costs the same as a 16/16 split: both paths are issued.
- If each element independently needs a rare path with probability `p`, a warp must issue it with probability `1 - (1 - p)^32`. At `p = 2%` that is about 47% of warps: a branch that is rare for threads is common for warps.

To reduce the cost, arrange data so neighbours branch the same way (Experiment 1 groups the data and cuts the cost
roughly 4x), make the condition depend on the block or warp instead of the lane, or compute both results and select
(predication) when both paths are short. Divergence only exists between lanes of the same warp; different warps may
take different branches freely.

> [!pitfall]
> "32 lanes in lockstep" is a performance model, not a correctness guarantee. NVIDIA's guide says hardware execution may differ (newer GPUs have independent thread execution) and that exploiting knowledge of how warps map to real hardware is discouraged. Use the picture to reason about speed; use explicit synchronization for correctness.

### Latency hiding and occupancy

A memory load can take hundreds of clock cycles (Module 03). A CPU fights that with big caches and out-of-order
execution; a GPU fights it with **many resident warps**. When one warp stalls, the SM's scheduler issues from another,
so the math units stay busy. NVIDIA's performance guide puts it this way: GPUs hide dependent-instruction latency by
switching to other threads, so the threads needed to use a GPU well far outnumber its cores.

**Occupancy** is active warps divided by the maximum an SM supports. How many blocks fit on an SM is the smallest of
four limits:

| Limit | Formula (per SM) |
| --- | --- |
| Threads | `max_threads // threads_per_block` |
| Block slots | the hardware cap on resident blocks |
| Registers | `registers // (registers_per_thread * threads_per_block)` |
| Shared memory | `shared_memory // shared_memory_per_block` |

The compiler picks registers per thread; you pick block size and shared memory. A kernel that needs many registers per
thread fits few warps per SM and hides less latency. Experiment 3 implements the calculation and reproduces the CUDA
guide's worked examples.

> [!pitfall]
> Occupancy is a means, not a score. The CUDA guide says higher occupancy generally helps hide latency, but a kernel at 100% occupancy can still be slow (for example if it is limited by memory bandwidth, Module 03), and a well-tuned kernel at lower occupancy can be fast. Measure with a profiler.

### Waves and the tail effect

Blocks are handed to SMs as slots free up. A set of blocks running at the same time is a **wave**. If the block count is
not a multiple of the slot count, the last wave leaves SMs idle. NVIDIA's guide gives an 8-SM GPU running 12 blocks at
one block per SM: two waves, the second only half full. Its rule of thumb is to launch at least roughly four times as
many blocks as SMs, with a few hundred threads each.

### Kernel launches as the host sees them

From your Python process, launching a kernel is **asynchronous**: the call enqueues work and returns, and operations in
one stream run in the order queued. The CUDA guide says launches return immediately and you must synchronize before
relying on results. Three consequences:

- **Timing needs a synchronize.** PyTorch's documentation says timing without synchronization is not accurate; call `torch.cuda.synchronize()` before reading the clock.
- **Errors show up late.** A failing kernel may be reported at a later call; PyTorch documents `CUDA_LAUNCH_BLOCKING=1` to force synchronous execution when debugging.
- **Every launch has a fixed host-side cost.** The CUDA guide notes that this setup overhead can be a significant fraction of the time of short kernels, which is why CUDA Graphs exist and one reason frameworks fuse many small operations into one kernel.

### Connecting back to LLM code

A matmul kernel typically gives each **block** one tile of the output matrix: the independent tiles of Module 00's
Experiment 2. An elementwise op gives each thread one element. A reduction such as softmax has the threads of a block
cooperate through shared memory. Library docs use this vocabulary when they say "one thread block per output tile".

## Code

Everything below is pure Python and NumPy (Python 3.13, NumPy 2.4.6). These are **simulations** of the execution model,
not GPU measurements: cycle counts are made-up units that make the effect visible, and the hardware limits are the
documented ones named in the comments.

> [!example]
> **Experiment 1.** A warp runs both sides of a branch. The simulator checks its masked-lockstep result against what 32 independent scalar threads compute, then scales up to 4096 warps with a rare expensive branch.

```python
import numpy as np

WARP = 32

def run_warp(x, pred, then_fn, else_fn, then_cost=10, else_cost=10):
    """One warp in lockstep: if ANY lane wants a path, the whole warp spends that path's cycles."""
    mask = pred(x)
    out = np.empty_like(x)
    cycles = busy = 0
    for take, fn, cost in ((mask, then_fn, then_cost), (~mask, else_fn, else_cost)):
        if take.any():
            out[take] = fn(x[take])          # only the lanes in `take` are active; the rest are masked off
            cycles += cost
            busy += cost * int(take.sum())
    return out, cycles, busy / (cycles * len(x))

pred, then_fn, else_fn = (lambda v: v % 2 == 0), (lambda v: v * 3), (lambda v: v + 100)
lanes = np.arange(WARP)
cases = {"all lanes agree (all even)":   lanes * 2,
         "even/odd split (16 vs 16)":    lanes,
         "one lane disagrees (31 vs 1)": np.where(lanes == 5, 1, lanes * 2)}
print(f"{'case':<30}{'cycles':>7}{'lane utilization':>19}")
for name, x in cases.items():
    out, cycles, util = run_warp(x, pred, then_fn, else_fn)
    assert np.array_equal(out, np.array([then_fn(v) if pred(v) else else_fn(v) for v in x]))  # same answer as 32 scalar threads
    print(f"{name:<30}{cycles:>7}{util:>19.1%}")

# Scale up: 4096 warps; 2% of elements need an expensive path (40 cycles), the rest a cheap one (5).
THEN_COST, ELSE_COST = 40, 5
def kernel_cycles(takes_then):               # element i runs on lane i % 32 of warp i // 32
    w = takes_then.reshape(-1, WARP)
    any_then, any_else = w.any(axis=1), (~w).any(axis=1)
    return int((any_then * THEN_COST + any_else * ELSE_COST).sum()), any_then.mean()

rng = np.random.default_rng(0)
takes_then = rng.random(WARP * 4096) < 0.02
for label, data in (("random order", takes_then), ("grouped by branch", np.sort(takes_then)[::-1].copy())):
    cycles, frac = kernel_cycles(data)
    print(f"{label:<18} warps issuing the expensive path: {frac:5.1%}   total warp-cycles: {cycles:,}")

print("\nP(at least 1 of 32 lanes takes a path that each lane takes with probability p) = 1 - (1 - p)^32")
for p in (0.01, 0.02, 0.10):
    sim = (rng.random((20000, WARP)) < p).any(axis=1).mean()
    print(f"  p={p:.2f}: formula {1 - (1 - p) ** WARP:6.1%}   simulated {sim:6.1%}")
```

Output (seeded, reproduces exactly):

```
case                           cycles   lane utilization
all lanes agree (all even)         10             100.0%
even/odd split (16 vs 16)          20              50.0%
one lane disagrees (31 vs 1)       20              50.0%
random order       warps issuing the expensive path: 47.0%   total warp-cycles: 97,520
grouped by branch  warps issuing the expensive path:  2.0%   total warp-cycles: 23,320

P(at least 1 of 32 lanes takes a path that each lane takes with probability p) = 1 - (1 - p)^32
  p=0.01: formula  27.5%   simulated  27.4%
  p=0.02: formula  47.6%   simulated  48.0%
  p=0.10: formula  96.6%   simulated  96.9%
```

One odd lane out of 32 costs as much as sixteen. The `assert` passes in every case: masking changes the *time*, never
the *answer*. Only 2% of elements want the expensive path, yet 47% of warps must issue it; grouping the same data cuts
the total to about a quarter. The formula matches simulation to within sampling noise.

> [!example]
> **Experiment 2.** Simulate `kernel<<<grid, block>>>`: the index arithmetic, the bounds check, block-order independence, and a too-small grid.

```python
import numpy as np

def launch(kernel, grid_dim, block_dim, *args, block_order=None):
    """Simulate kernel<<<grid_dim, block_dim>>>(*args). Real GPUs give no block-order guarantee."""
    for block_idx in (range(grid_dim) if block_order is None else block_order):
        for thread_idx in range(block_dim):
            kernel(thread_idx, block_idx, block_dim, *args)

def vec_add(threadIdx, blockIdx, blockDim, A, B, C, n, touched):
    i = threadIdx + blockDim * blockIdx        # the CUDA guide's `workIndex`
    if i < n:                                  # bounds check: surplus threads do nothing
        C[i] = A[i] + B[i]
        touched[i] += 1

n, threads = 1000, 256
rng = np.random.default_rng(0)
A, B = rng.standard_normal(n), rng.standard_normal(n)
blocks = (n + threads - 1) // threads          # ceiling division, as in the CUDA guide
print(f"{n} elements, {threads} threads/block -> {blocks} blocks, {blocks * threads - n} surplus threads")

def run(grid, order=None):
    C, touched = np.zeros(n), np.zeros(n, dtype=int)
    launch(vec_add, grid, threads, A, B, C, n, touched, block_order=order)
    return C, touched

C, touched = run(blocks)
print("in-order blocks :", "correct" if np.array_equal(C, A + B) else "WRONG", "| every element touched once:", bool((touched == 1).all()))
order = rng.permutation(blocks).tolist()
C, _ = run(blocks, order)
print(f"blocks as {order}:", "correct" if np.array_equal(C, A + B) else "WRONG")
_, touched = run(blocks - 1)                   # classic off-by-one in the grid size
print(f"grid of {blocks - 1} blocks: {int((touched == 0).sum())} elements never computed, first at index {int(np.argmax(touched == 0))}")

for tpb in (100, 128):                         # block sizes that are / are not multiples of 32
    warps = -(-tpb // 32)
    print(f"{tpb} threads/block -> {warps} warps, {warps * 32 - tpb} idle lanes in the last warp")
```

Output (seeded):

```
1000 elements, 256 threads/block -> 4 blocks, 24 surplus threads
in-order blocks : correct | every element touched once: True
blocks as [1, 2, 0, 3]: correct
grid of 3 blocks: 232 elements never computed, first at index 768
100 threads/block -> 4 warps, 28 idle lanes in the last warp
128 threads/block -> 4 warps, 0 idle lanes in the last warp
```

A too-small grid fails *silently* on a real GPU too: nothing errors, the tail of the output simply stays untouched.

> [!example]
> **Experiment 3.** An occupancy and wave calculator. The limits are the device used in the CUDA Programming Guide's own worked example (v13.4.2, checked Oct 2026); the first three lines reproduce that example.

```python
from math import ceil

# Per-SM limits from the CUDA Programming Guide (v13.4.2): the guide's own worked-example device.
GUIDE = dict(max_threads=2048, max_blocks=32, regs=65536, smem=233472)

def occupancy(threads_per_block, regs_per_thread, smem_per_block, lim=GUIDE):
    """Blocks that fit on one SM, the fraction of warp slots they fill, and the limiting resource.
    Simplified: ignores the hardware's register/shared-memory allocation granularity."""
    caps = {"threads":       lim["max_threads"] // threads_per_block,
            "block slots":   lim["max_blocks"],
            "registers":     lim["regs"] // (regs_per_thread * threads_per_block),
            "shared memory": lim["smem"] // smem_per_block if smem_per_block else 10**9}
    limiter = min(caps, key=caps.get)
    blocks = caps[limiter]
    warps = blocks * ceil(threads_per_block / 32)
    return blocks, warps / (lim["max_threads"] // 32), limiter

print("Checks against the CUDA guide's worked examples:")
for tpb, regs, smem, expect in [(768, 32, 0, "2 blocks, 75%"), (32, 32, 0, "32 blocks, 50%"), (256, 32, 100 * 1024, "2 blocks")]:
    b, occ, why = occupancy(tpb, regs, smem)
    print(f"  {tpb:>3} threads/block, {smem // 1024:>3} KB smem -> blocks/SM = {b:>2}, occupancy {occ:4.0%}, limited by {why:<13} (guide: {expect})")

print("\n256 threads/block, rising register use:")
for regs in (32, 64, 96, 128, 255):
    b, occ, why = occupancy(256, regs, 0)
    print(f"  {regs:>3} regs/thread -> blocks/SM = {b}, occupancy {occ:5.1%}, limited by {why}")

def waves(num_blocks, num_sms, blocks_per_sm):
    slots = num_sms * blocks_per_sm
    w = ceil(num_blocks / slots)
    return w, num_blocks / (w * slots)

print("\nWaves (guide's 8-SM example, then 132 SMs at an assumed 2 blocks/SM):")
w, u = waves(12, 8, 1)
print(f"  {12:>7} blocks on   8 SMs: {w:>3} wave(s), {u:5.1%} of slots used")
for nb in (264, 265, 1000, 100_000):
    w, u = waves(nb, 132, 2)
    print(f"  {nb:>7} blocks on 132 SMs: {w:>3} wave(s), {u:5.1%} of slots used")
```

Output (deterministic):

```
Checks against the CUDA guide's worked examples:
  768 threads/block,   0 KB smem -> blocks/SM =  2, occupancy  75%, limited by threads       (guide: 2 blocks, 75%)
   32 threads/block,   0 KB smem -> blocks/SM = 32, occupancy  50%, limited by block slots   (guide: 32 blocks, 50%)
  256 threads/block, 100 KB smem -> blocks/SM =  2, occupancy  25%, limited by shared memory (guide: 2 blocks)

256 threads/block, rising register use:
   32 regs/thread -> blocks/SM = 8, occupancy 100.0%, limited by threads
   64 regs/thread -> blocks/SM = 4, occupancy 50.0%, limited by registers
   96 regs/thread -> blocks/SM = 2, occupancy 25.0%, limited by registers
  128 regs/thread -> blocks/SM = 2, occupancy 25.0%, limited by registers
  255 regs/thread -> blocks/SM = 1, occupancy 12.5%, limited by registers

Waves (guide's 8-SM example, then 132 SMs at an assumed 2 blocks/SM):
       12 blocks on   8 SMs:   2 wave(s), 75.0% of slots used
      264 blocks on 132 SMs:   1 wave(s), 100.0% of slots used
      265 blocks on 132 SMs:   2 wave(s), 50.2% of slots used
     1000 blocks on 132 SMs:   4 wave(s), 94.7% of slots used
   100000 blocks on 132 SMs: 379 wave(s), 99.9% of slots used
```

At 32 registers per thread the register and thread limits tie at 8 blocks; the code reports the first one it finds. The
"2 blocks per SM" in the wave rows is an assumption for illustration; the real figure depends on the kernel.

The real thing in PyTorch follows. **Not executed in this module's verification (needs an NVIDIA GPU and a CUDA build
of PyTorch).** No output is shown because none was produced.

```python
import time
import torch

x = torch.randn(4096, 4096, device="cuda")
torch.cuda.synchronize()                 # make sure setup is finished before timing

t0 = time.perf_counter()
y = x @ x                                # returns almost immediately: the kernel is only queued
t_launch = time.perf_counter() - t0

torch.cuda.synchronize()                 # wait for the kernel to actually finish
t_total = time.perf_counter() - t0
print(f"launch returned after {t_launch*1e3:.2f} ms; finished after {t_total*1e3:.2f} ms")
```

## Visual diagram

From the code you write to the silicon that runs it:

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│ GRID  = one kernel launch                         runs on: the whole GPU            │
│   blocks run in ANY order; no block may depend on another                           │
│                                                                                     │
│   BLOCK 0        BLOCK 1        BLOCK 2   ...     each block is placed on ONE SM    │
│   ┌─────────┐    ┌─────────┐    ┌─────────┐       and stays there until it finishes │
│   │ warp 0  │    │ warp 0  │    │ warp 0  │       (up to 1024 threads per block)    │
│   │ warp 1  │    │ warp 1  │    │ warp 1  │                                         │
│   │ warp 2  │    │ warp 2  │    │ warp 2  │       WARP = 32 consecutive threads;    │
│   │  ...    │    │  ...    │    │  ...    │       one instruction is issued for     │
│   └─────────┘    └─────────┘    └─────────┘       all 32 lanes at once              │
│                                                                                     │
│          │ the hardware scheduler hands out blocks as SMs have room                 │
│          ▼                                                                          │
│   ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐                                      │
│   │ SM 0 │ │ SM 1 │ │ SM 2 │ │ SM 3 │ │ ...  │   132 SMs on an H100 SXM5            │
│   │ B0 B5│ │ B1 B6│ │ B2 B7│ │ B3 B8│ │      │   (Hopper whitepaper v1.04)          │
│   └──────┘ └──────┘ └──────┘ └──────┘ └──────┘                                      │
│   each SM: register file, shared memory/L1, warp schedulers, math units             │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

What divergence costs:

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│ if (x % 2 == 0) { path A } else { path B }        lanes:  0 1 2 3 4 5 6 7 ... 31    │
│                                                                                     │
│ cycles  0-9   issue path A     active lanes:  ■ □ ■ □ ■ □ ■ □ ... □                 │
│ cycles 10-19  issue path B     active lanes:  □ ■ □ ■ □ ■ □ ■ ... ■                 │
│                                                                                     │
│ ■ = lane doing useful work     □ = lane masked off (idle, still occupying its slot) │
│                                                                                     │
│ this warp: 20 cycles, 50% of lane-cycles useful.                                    │
│ If all 32 lanes had agreed on one path: 10 cycles, 100% useful.                     │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

The tail effect (the NVIDIA guide's example: 8 SMs, 12 blocks, one block per SM at a time):

```
time ─────────────────────────────────────────────►
SM0  │████ block 0  ████│████ block 8  ████│
SM1  │████ block 1  ████│████ block 9  ████│
SM2  │████ block 2  ████│████ block 10 ████│
SM3  │████ block 3  ████│████ block 11 ████│
SM4  │████ block 4  ████│░░░░░ idle ░░░░░░░│
SM5  │████ block 5  ████│░░░░░ idle ░░░░░░░│
SM6  │████ block 6  ████│░░░░░ idle ░░░░░░░│
SM7  │████ block 7  ████│░░░░░ idle ░░░░░░░│
                   wave 1             wave 2
                (8 of 8 SMs busy)  (4 of 8 SMs busy)
```

## Practice

### 1. Find the limiting resource

A kernel runs with 192 threads per block, 40 registers per thread and 16 KB of shared memory per block. With
`occupancy()` from Experiment 3, how many blocks fit per SM, what is the occupancy, and which resource limits it? What
happens if the compiler gets the kernel down to 32 registers per thread?

<details><summary>Answer</summary>

`occupancy(192, 40, 16 * 1024)` returns `(8, 0.75, 'registers')`. The limits are: threads `2048 // 192 = 10`, block
slots 32, registers `65536 // (40 * 192) = 8`, shared memory `233472 // 16384 = 14`. The smallest is 8 (registers), so
`8 * 6 = 48` of 64 warp slots fill: **75%**. At 32 registers the register limit becomes 10, tying with the thread limit:
`occupancy(192, 32, 16 * 1024)` returns `(10, 0.9375, 'threads')`, about 94%.

</details>

### 2. Make the branch warp-uniform

In Experiment 1, replace `takes_then` with a condition that is true for every element of every 50th *warp*, i.e.
`(np.arange(32 * 4096) // 32) % 50 == 0` (again about 2% of elements). What does `kernel_cycles` return, and how does it
compare to the ideal?

<details><summary>Answer</summary>

Because the decision depends on the warp index and never on the lane, no warp diverges. `kernel_cycles` returns 23,350
warp-cycles, exactly equal to the ideal count for that data (`sum(then) / 32 * 40 + sum(else) / 32 * 5 = 23,350`),
versus 97,520 for the random layout at the same 2%. A branch that is uniform across each warp is free.

</details>

### 3. How many blocks are enough?

For a 132-SM GPU at 2 blocks per SM (264 slots), above what block count does overall slot utilization never fall below
95%? Use `waves()`.

<details><summary>Answer</summary>

Looping `n` upward and recording the last `n` whose utilization is under 95% gives 4,765, so from 4,766 blocks upward
utilization is always at least 95%. The worst case is always "one block more than a full wave". That is about 18 waves,
comfortably above the "several times the SM count" guidance.

</details>

### Checkpoint quiz

1. What is the difference between a thread block and a warp, and which one is guaranteed to run on a single SM?
2. A warp's lanes split 31 versus 1 across an `if/else`. Why does that cost almost as much as a 16/16 split?
3. If each element has a 1% chance of needing a rare path, about what fraction of warps issue it?
4. Name the four resources that cap how many blocks an SM can hold at once.
5. Why does `y = x @ x` followed immediately by `time.perf_counter()` under-report the time of a GPU matmul?

<details><summary>Answers</summary>

1. A block is a programmer-chosen group of up to 1024 threads placed on one SM (so its threads can share memory and synchronize). A warp is the hardware's group of 32 consecutive threads that execute one instruction together. The block is guaranteed to stay on one SM.
2. The warp still issues both paths one after the other, with the other lanes masked off; the cost is the sum of both paths however the lanes split.
3. `1 - 0.99^32`, about 27.5% (Experiment 1 simulates 27.4%).
4. Threads per SM, block slots per SM, registers per SM, and shared memory per SM.
5. The launch is asynchronous: it only queues the kernel and returns. Without `torch.cuda.synchronize()` the clock stops before the GPU finishes.

</details>

> [!check]
> - I can compute `workIndex` from `threadIdx`, `blockIdx` and `blockDim` and write the ceiling division for the grid size
> - I can explain why one divergent lane costs a whole warp both paths, and name two ways to avoid it
> - I can compute occupancy from threads, registers and shared memory per block and say which limit bites
> - I can explain waves and why a grid of "just over a full wave" wastes the GPU
> - I can say why GPU timing needs a synchronize and why many tiny kernels are slow

## Project

**Build an occupancy and launch advisor.** Without copying this module's code, write a small tool that takes a kernel
description (registers per thread, shared memory per block, number of elements) and a device-limits dictionary, and then:

1. for each block size in `{32, 64, 96, 128, 192, 256, 384, 512, 768, 1024}`, reports blocks per SM, occupancy and the limiting resource;
2. for the same block sizes, computes how many blocks the launch needs and the wave utilization on a GPU with a given SM count;
3. recommends a block size using a rule you state explicitly (for example highest occupancy, ties broken by fewest idle lanes and best wave utilization), and prints where your rule disagrees with "highest occupancy wins";
4. checks your numbers against the worked occupancy examples in the CUDA Programming Guide.

No solution is provided. Test with at least two different device-limit dictionaries and write down one case where the
highest-occupancy block size is not the one you would pick, and why.

## Interview questions

> [!interview]
> Explain warp divergence. When does it cost performance, and how would you restructure code to avoid it?

<details><summary>What a strong answer covers</summary>

- A warp is 32 threads issuing one instruction at a time; divergent branches execute serially with lanes masked off, so the cost is the sum of the paths.
- Divergence is only among lanes of one warp; different warps branching differently is free.
- The rare-branch effect: probability `p` per thread becomes `1 - (1 - p)^32` per warp.
- Fixes: group or sort data so neighbours agree, make conditions warp- or block-uniform, use predication for short paths.
- A caveat: lockstep is a performance model; newer hardware has independent thread scheduling, so correctness needs explicit synchronization.

</details>

> [!interview]
> What is occupancy, what limits it, and is higher always better?

<details><summary>What a strong answer covers</summary>

- Active warps divided by the maximum an SM supports.
- Limits: threads, block slots, registers, shared memory; the minimum wins.
- It helps hide latency by giving the scheduler other warps, but it is a means, not a goal: memory-bound or already-saturated kernels may not speed up, and sometimes trading occupancy for more registers or shared memory per thread makes a kernel faster.
- Good answers mention measuring with a profiler rather than assuming.

</details>

> [!interview]
> You launch a CUDA kernel from Python and time it with `time.time()`. The result looks implausibly fast. What happened, and how do you fix it?

<details><summary>What a strong answer covers</summary>

- Kernel launches are asynchronous; the host returns once work is queued.
- Synchronize before reading the clock (`torch.cuda.synchronize()`) or use CUDA events.
- Related: errors surface at a later call, and `CUDA_LAUNCH_BLOCKING=1` helps when debugging.
- A bonus point: also warm up, since the first call includes one-time setup.

</details>

## Common mistakes & troubleshooting

- **Some output elements are zero or stale.** The grid is too small or the bounds check is missing or wrong. Compute `blocks` with a ceiling division and compare against a CPU reference (Experiment 2 shows both failure shapes).
- **Slow kernel, low occupancy in the profiler.** Check registers per thread and shared memory per block against the SM limits, then reduce either or change the block size. Experiment 3's register sweep shows how fast occupancy falls.
- **Performance cliff when the input grows a few percent.** You may have crossed a wave boundary (264 to 265 blocks in the example). Prefer launches with many waves.
- **Measured GPU time is near zero.** You timed a launch, not its completion; synchronize first.
- **An error is reported on a line that looks fine.** Asynchronous error reporting; rerun with `CUDA_LAUNCH_BLOCKING=1` to localise it.

## Further reading & sources

- [CUDA Programming Guide, 1.2 Programming Model](https://docs.nvidia.com/cuda/cuda-programming-guide/01-introduction/programming-model.html) - NVIDIA's definition of SMs, thread blocks, grids, warps and SIMT, including the masking behaviour behind divergence and the "no ordering between blocks" rule.
- [CUDA Programming Guide, 2.1 Intro to CUDA C++](https://docs.nvidia.com/cuda/cuda-programming-guide/02-basics/intro-to-cuda-cpp.html) - the `vecAdd` kernel, `<<<grid, block>>>` launch syntax, `workIndex` arithmetic and ceiling-division idiom that Experiment 2 simulates.
- [CUDA Programming Guide, 2.3 Writing SIMT Kernels](https://docs.nvidia.com/cuda/cuda-programming-guide/02-basics/writing-cuda-kernels.html) - defines occupancy and works the examples that Experiment 3 reproduces.
- [CUDA Programming Guide, 5.1 Compute Capabilities](https://docs.nvidia.com/cuda/cuda-programming-guide/05-appendices/compute-capabilities.html) - the per-SM limits (resident threads, warps, blocks, registers, shared memory) used in the occupancy table.
- [NVIDIA Deep Learning Performance: GPU Performance Background](https://docs.nvidia.com/deeplearning/performance/dl-performance-gpu-background/index.html) - the wave and tail-effect explanation and the "several times more blocks than SMs" guidance.
- [CUDA Programming Guide, 4.2 CUDA Graphs](https://docs.nvidia.com/cuda/cuda-programming-guide/04-special-topics/cuda-graphs.html) - states that per-kernel launch overhead can be a significant fraction of short kernels' time and how graphs amortize it.
- [PyTorch notes: CUDA semantics](https://docs.pytorch.org/docs/stable/notes/cuda.html) - documents that GPU operations are asynchronous, why timing needs `torch.cuda.synchronize()`, and `CUDA_LAUNCH_BLOCKING=1`.
- [NVIDIA H100 Tensor Core GPU Architecture whitepaper (Hopper, v1.04)](https://resources.nvidia.com/en-us-hopper-architecture/nvidia-h100-tensor-c) - source of the A100 and H100 SM counts, FP32 cores per SM, register file and shared memory sizes in the table above.

## Next

[Module 02: CUDA Cores vs. Tensor Cores](../02-cuda-cores-vs-tensor-cores/README.md)
