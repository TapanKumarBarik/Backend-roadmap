# Module 11: Pipeline Parallelism and ZeRO

## Roadmap

You are in **Track 05: GPUs & GenAI Hardware**, at the end of the parallelism arc. Module 09 replicated the model, module 10 split each layer. This module covers the two remaining tools: slicing the model into stages that work on a stream of micro-batches (pipeline parallelism), and removing the redundancy from data parallelism (ZeRO, and PyTorch's FSDP).

**Before this module**
- [Module 09: Data Parallelism](../09-data-parallelism/README.md) - all-reduce, replicas, and what data parallelism leaves redundant.
- [Module 10: Model and Tensor Parallelism](../10-model-and-tensor-parallelism/README.md) - the 16-bytes-per-parameter accounting and why naive layer-wise splitting idles GPUs.
- [Module 07: Mixed Precision Training](../07-mixed-precision-training/README.md) - where the fp32 master weights and Adam states come from.

**After this module you can**
- derive the pipeline bubble fraction `(p-1)/(m+p-1)`, reproduce it with a schedule simulation, and say how micro-batches and the 1F1B schedule change it (and what they do not change);
- compute per-GPU model-state memory under ZeRO stages 1, 2 and 3 and reproduce the ZeRO paper's 7.5B-parameter example;
- explain the communication cost of each ZeRO stage, and how FSDP relates to ZeRO-3;
- pick a first-guess parallelism strategy for a model that does not fit on one GPU.

**Why it matters.** Large training runs combine all of these. Knowing what each one shards (layers, matrices, or redundant state) is how you read a training configuration, and how you predict out-of-memory errors before renting the GPUs.

## Concept

> [!key] Pipeline parallelism puts consecutive layers on different GPUs and streams micro-batches through them, wasting a fraction (p-1)/(m+p-1) of the time to the pipeline bubble; ZeRO keeps data parallelism but shards optimizer states, then gradients, then parameters across the GPUs, so each holds only about 1/N of the model state.

## Explanation

### Pipeline parallelism: stages and micro-batches

Split the model's layers into **p stages**, one per GPU. To stop all but one GPU idling (module 10), cut the batch into **m micro-batches** and feed them in one after another: while stage 2 works on micro-batch 1, stage 1 can already start micro-batch 2. The simplest schedule, from the GPipe paper, runs all m forward passes, then all m backward passes, then a **pipeline flush**: the optimizer steps once everyone has finished, which keeps the update identical to ordinary training.

The idle time is unavoidable at the start (stages waiting for the first micro-batch to reach them) and at the end (stages that have finished waiting for the last backward pass). That idle time is the **pipeline bubble**.

### Deriving the bubble

Assume equal stages, with forward time `t_f` and backward time `t_b` per micro-batch per stage.

- The first micro-batch needs p stage-slots to leave the pipeline; each later micro-batch follows one slot behind. The forward phase takes `m + p - 1` slots of `t_f`; the backward phase takes `m + p - 1` slots of `t_b`.
- Total time: `(m + p - 1)(t_f + t_b)`.
- Useful work per stage: `m (t_f + t_b)`. Idle time per stage: `(p - 1)(t_f + t_b)`.

```
bubble fraction (idle share of the timeline) = (p - 1) / (m + p - 1)
pipeline efficiency                          =  m / (m + p - 1)
```

`t_f` and `t_b` cancel, so the ratio of backward to forward time does not matter (the simulation below tries three ratios). Be aware of a second convention: the Megatron-LM scaling paper measures the bubble against the *ideal* time and writes `(p-1)/m`; the GPipe paper writes the overhead as `O((K-1)/(M+K-1))`. They differ only in the denominator: `(p-1)/m = x` converts to `x / (1 + x)` as an idle share of the timeline.

What the formula says: with m = 1 the bubble is `(p-1)/p`, nearly everything (that is module 10's naive case). To make it small you need **many more micro-batches than stages**. The GPipe authors report the overhead was negligible once M is at least about 4 times K; the numbers in step 2 below show how steep that is (under 5% idle needs 58 micro-batches at p = 4, 134 at p = 8).

The cost of many micro-batches: each one is smaller, which can leave a GPU's matrix units less well fed (not measured here), and in the all-forward-then-all-backward schedule every in-flight micro-batch's activations must be held at once.

### 1F1B: same bubble, less memory

In the **1F1B** schedule (called PipeDream-Flush in the Megatron-LM scaling paper), each stage does a short warm-up of forward passes and then alternates **one forward, one backward**. Backward passes start earlier, so a micro-batch's activations are freed sooner. The paper's description: it limits the number of in-flight micro-batches to the pipeline depth instead of the number of micro-batches, while "the time spent in the bubble is the same". The simulation confirms both: identical idle fraction, and at most `p` micro-batches held instead of `m`.

> [!pitfall]
> 1F1B does **not** shrink the bubble; it shrinks activation memory. To shrink the bubble itself, the same paper's *interleaved* schedule gives each GPU several smaller chunks of layers, which divides the bubble by the number of chunks per GPU but multiplies pipeline communication by the same factor. It is not simulated here.

Large runs combine the three kinds: tensor parallelism inside a server (module 10), pipeline stages across servers, and data parallelism over replicas of the whole arrangement.

### ZeRO: stop storing the same thing on every GPU

Plain data parallelism stores the same model states on every GPU. With mixed-precision Adam and Ψ parameters, per GPU: 2Ψ bytes of 16-bit weights, 2Ψ of 16-bit gradients and KΨ of optimizer state, K = 12 (32-bit weights, momentum and variance), a total of 16Ψ. The **ZeRO** paper (Rajbhandari et al.) removes the redundancy in three cumulative stages, which DeepSpeed calls stages 1-3 and the paper writes P_os, P_os+g, P_os+g+p, for a data-parallel degree N_d:

| Stage | Shards across the N_d GPUs | Per-GPU model-state memory | Communication per step |
| --- | --- | --- | --- |
| baseline DP | nothing | (2 + 2 + K)Ψ = 16Ψ | 2Ψ |
| 1 | optimizer states | (2 + 2 + K/N_d)Ψ | 2Ψ (same) |
| 2 | + gradients | (2 + (2+K)/N_d)Ψ | 2Ψ (same) |
| 3 | + parameters | (2 + 2 + K)Ψ / N_d | 3Ψ (1.5x) |

How each works, in plain terms:
- **Stage 1.** Each GPU owns a 1/N_d slice of the optimizer state, so it updates only that slice of the parameters; then an all-gather shares the updated parameters.
- **Stage 2.** Since a GPU only updates its slice, it only needs that slice of the averaged gradient: the all-reduce becomes a reduce-scatter and the rest of the gradient memory is freed.
- **Stage 3.** Parameters are sharded too. A layer's weights are gathered (all-gather) just before that layer runs, in the forward and again in the backward pass, then dropped. Memory shrinks in proportion to N_d, at the price of 1.5x the communication.

The floors: stage 1 can never get below 4Ψ per GPU (a 4x reduction at most) and stage 2 never below 2Ψ (8x at most); stage 3 has no such floor. The snippets below reproduce the paper's table and verify that stage 1-2 style sharding leaves the training maths unchanged.

> [!pitfall]
> These are **model-state** numbers only. Activations, temporary buffers and fragmentation are extra (the ZeRO paper handles them separately; its own example is a 1.5B-parameter GPT-2 at sequence length 1K and batch 32 needing about 60 GB of activations before checkpointing). Treat the formulas as a floor on memory, not a prediction of it.

### FSDP: ZeRO-3 inside PyTorch

PyTorch's **Fully Sharded Data Parallel (FSDP)** shards parameters, gradients and optimizer states across the data-parallel group. The FSDP paper says ZeRO and cross-replica sharding inspired it, and PyTorch's FSDP tutorial describes the same cycle as stage 3: parameters stay sharded outside computation; before forward and backward they are all-gathered into full parameters; gradients are reduce-scattered into shards; the optimizer updates its shard. You wrap each block and then the root module (current API: `fully_shard`); the code is below, labelled as not executed.

> [!model]
> Eight students share one set of textbooks. Plain data parallelism buys eight complete sets. ZeRO-1 keeps one copy of the answer key (optimizer state) split into eighths, one eighth per student. ZeRO-2 also splits the working notes (gradients). ZeRO-3 splits the textbooks themselves: a student borrows a chapter from the others right before needing it, then gives it back. Shelf space drops sharply; the corridor traffic goes up.

### Which tool when (first-guess rules, not measured here)

| Situation | Reasonable first choice |
| --- | --- |
| Model and states fit on one GPU | Data parallelism (optionally ZeRO-1/2 to free optimizer memory) |
| States do not fit on one GPU but a node's GPUs share fast links | ZeRO-3/FSDP, and/or tensor parallelism inside the node |
| Model too large for one node, or slow links between nodes | Add pipeline stages across nodes (with tensor parallelism inside nodes) and data parallelism over replicas |

## Code

Python 3.13, numpy 2.4.6 only.

**Step 1 - a pipeline simulator.** Each stage has an ordered list of operations (GPipe or 1F1B order); an operation starts when its stage is free and its input from the neighbouring stage has arrived. `simulate` returns the makespan, the idle fraction, and the peak number of micro-batches held; `draw` renders the timeline. No formula is used anywhere in it.

```python
def schedule_ops(p, m, kind):
    """Per-stage ordered list of ops. ('F', i) = forward of micro-batch i, ('B', i) = backward."""
    ops = []
    for s in range(p):
        if kind == "gpipe":                       # all forwards, then all backwards
            ops.append([("F", i) for i in range(m)] + [("B", i) for i in range(m)])
        else:                                     # "1f1b": warm-up, alternate 1F/1B, cool-down
            warm = min(p - s - 1, m)
            seq = [("F", i) for i in range(warm)]
            f, b = warm, 0
            while b < m:
                if f < m:
                    seq.append(("F", f)); f += 1
                seq.append(("B", b)); b += 1
            ops.append(seq)
    return ops


def simulate(p, m, kind="gpipe", t_f=1, t_b=2):
    """Event simulation: an op starts when its stage is free AND its input has arrived.
    F(i,s) needs F(i,s-1);  B(i,s) needs B(i,s+1) (last stage: needs its own F)."""
    ops = schedule_ops(p, m, kind)
    end, free, nxt, timeline = {}, [0] * p, [0] * p, [[] for _ in range(p)]
    remaining = sum(len(o) for o in ops)
    while remaining:
        progressed = False
        for s in range(p):
            while nxt[s] < len(ops[s]):
                op, i = ops[s][nxt[s]]
                dep = ((op, i, s - 1) if s > 0 else None) if op == "F" else \
                      ((op, i, s + 1) if s < p - 1 else ("F", i, s))
                if dep is not None and dep not in end:
                    break                                            # input not ready yet
                start = max(free[s], end[dep] if dep else 0)
                dur = t_f if op == "F" else t_b
                end[(op, i, s)] = free[s] = start + dur
                timeline[s].append((op, i, start, start + dur))
                nxt[s] += 1; remaining -= 1; progressed = True
        assert progressed, "deadlock"
    makespan = max(free)
    busy = p * m * (t_f + t_b)
    # peak number of micro-batches whose forward is done but backward is not (activations held), per stage
    peak = 0
    for s in range(p):
        live = 0
        for op, i, a, b in timeline[s]:
            live += 1 if op == "F" else -1
            peak = max(peak, live)
    return makespan, 1 - busy / (p * makespan), peak, timeline


def draw(timeline, makespan):
    rows = []
    for s, ops in enumerate(timeline):
        line = ["."] * makespan
        for op, i, a, b in ops:
            for t in range(a, b):
                line[t] = str(i % 10) if op == "F" else chr(ord("a") + i % 26)
        rows.append(f"  stage {s}: {''.join(line)}")
    return "\n".join(rows)
```

**Step 2 - compare the simulated bubble with the formula** over 84 combinations (four values of p, seven of m, three forward/backward time ratios):

```python
from pipeline_sim import simulate, draw


def bubble_formula(p, m):
    """Idle fraction of the whole timeline for a flushed pipeline: (p-1) / (m+p-1)."""
    return (p - 1) / (m + p - 1)


print("tiny schedule, p=4 stages, m=4 micro-batches (digits = forward of micro-batch i, letters = backward;")
print("forward takes 1 tick, backward 2 ticks, '.' = idle):")
makespan, bubble, peak, tl = simulate(4, 4, "gpipe")
print(draw(tl, makespan))
print(f"makespan = {makespan} ticks, ideal = {4 * (1 + 2)} ticks, idle fraction = {bubble:.4f}, "
      f"formula = {bubble_formula(4, 4):.4f}")

print(f"\n{'p':>3} {'m':>4} {'formula (p-1)/(m+p-1)':>22} {'simulated':>10} {'(p-1)/m':>9}")
worst, checked = 0.0, 0
for p in (2, 4, 8, 16):
    for m in (1, 4, 8, 16, 32, 64, 128):
        sim = simulate(p, m, "gpipe")[1]
        if p in (4, 8) and m in (1, 4, 16, 64):
            print(f"{p:>3} {m:>4} {bubble_formula(p, m):>22.4f} {sim:>10.4f} {(p - 1) / m:>9.4f}")
        for t_f, t_b in ((1, 2), (1, 1), (2, 3)):       # the backward/forward time ratio should not matter
            sim = simulate(p, m, "gpipe", t_f, t_b)[1]
            worst = max(worst, abs(sim - bubble_formula(p, m)))
            checked += 1
print(f"\nlargest |simulated - formula| over {checked} (p, m, t_f, t_b) combinations: {worst:.1e}")

# How many micro-batches does it take to get the idle fraction under 5%?
for p in (4, 8, 16):
    m = next(m for m in range(1, 10_000) if bubble_formula(p, m) < 0.05)
    print(f"p={p:>2}: need m >= {m} micro-batches for < 5% idle")
```

```
tiny schedule, p=4 stages, m=4 micro-batches (digits = forward of micro-batch i, letters = backward;
forward takes 1 tick, backward 2 ticks, '.' = idle):
  stage 0: 0123.........aabbccdd
  stage 1: .0123......aabbccdd..
  stage 2: ..0123...aabbccdd....
  stage 3: ...0123aabbccdd......
makespan = 21 ticks, ideal = 12 ticks, idle fraction = 0.4286, formula = 0.4286

  p    m  formula (p-1)/(m+p-1)  simulated   (p-1)/m
  4    1                 0.7500     0.7500    3.0000
  4    4                 0.4286     0.4286    0.7500
  4   16                 0.1579     0.1579    0.1875
  4   64                 0.0448     0.0448    0.0469
  8    1                 0.8750     0.8750    7.0000
  8    4                 0.6364     0.6364    1.7500
  8   16                 0.3043     0.3043    0.4375
  8   64                 0.0986     0.0986    0.1094

largest |simulated - formula| over 84 (p, m, t_f, t_b) combinations: 5.6e-17
p= 4: need m >= 58 micro-batches for < 5% idle
p= 8: need m >= 134 micro-batches for < 5% idle
p=16: need m >= 286 micro-batches for < 5% idle
```

The first block is the GPipe schedule for p = 4, m = 4 (digits are forward passes of micro-batch 0-3, letters are backward passes `a`-`d`, `.` is idle). The simulated and formula columns agree to within 6e-17 in every combination, whatever `t_b / t_f` is. The last column is the other convention, `(p-1)/m`.

**Step 3 - 1F1B versus GPipe.**

```python
from pipeline_sim import simulate, draw

p, m = 4, 8
for kind in ("gpipe", "1f1b"):
    makespan, bubble, peak, tl = simulate(p, m, kind)
    print(f"{kind}: p={p}, m={m}  (digits = forward, letters = backward)")
    print(draw(tl, makespan))
    print(f"  makespan {makespan} ticks, idle fraction {bubble:.4f}, "
          f"max micro-batches held at once on one stage: {peak}\n")

print(f"{'p':>3} {'m':>4} | {'GPipe idle':>10} {'held':>5} | {'1F1B idle':>10} {'held':>5}")
for p in (4, 8):
    for m in (8, 16, 32, 64):
        _, b_g, held_g, _ = simulate(p, m, "gpipe")
        _, b_o, held_o, _ = simulate(p, m, "1f1b")
        print(f"{p:>3} {m:>4} | {b_g:>10.4f} {held_g:>5} | {b_o:>10.4f} {held_o:>5}")
```

```
gpipe: p=4, m=8  (digits = forward, letters = backward)
  stage 0: 01234567.........aabbccddeeffgghh
  stage 1: .01234567......aabbccddeeffgghh..
  stage 2: ..01234567...aabbccddeeffgghh....
  stage 3: ...01234567aabbccddeeffgghh......
  makespan 33 ticks, idle fraction 0.2727, max micro-batches held at once on one stage: 8

1f1b: p=4, m=8  (digits = forward, letters = backward)
  stage 0: 0123......aa4bb5cc6dd7ee.ff.gg.hh
  stage 1: .012....aa3bb4cc5dd6ee7ff.gg.hh..
  stage 2: ..01..aa2bb3cc4dd5ee6ff7gg.hh....
  stage 3: ...0aa1bb2cc3dd4ee5ff6gg7hh......
  makespan 33 ticks, idle fraction 0.2727, max micro-batches held at once on one stage: 4

  p    m | GPipe idle  held |  1F1B idle  held
  4    8 |     0.2727     8 |     0.2727     4
  4   16 |     0.1579    16 |     0.1579     4
  4   32 |     0.0857    32 |     0.0857     4
  4   64 |     0.0448    64 |     0.0448     4
  8    8 |     0.4667     8 |     0.4667     8
  8   16 |     0.3043    16 |     0.3043     8
  8   32 |     0.1795    32 |     0.1795     8
  8   64 |     0.0986    64 |     0.0986     8
```

Same makespan and idle fraction (33 ticks, 27.3%); different memory behaviour. The 1F1B timeline for stage 0 shows the warm-up `0123`, then alternating `a 4 b 5 ...`. The "held" column stays at p (or m, if smaller) for 1F1B while it grows with m under GPipe.

**Step 4 - ZeRO per-GPU memory, checked against the paper's Table 1.** The formulas are those of the table above; `paper` holds the 7.5B-parameter column of Table 1 of the ZeRO paper (fetched from arXiv:1910.02054) for comparison.

```python
# Per-GPU memory for model states (parameters, gradients, optimizer states) under ZeRO-DP.
# Formulas are from the ZeRO paper (Rajbhandari et al., 2019), section 5 / Figure 1:
#   psi = number of parameters, K = optimizer-state bytes per parameter (12 for mixed-precision Adam),
#   nd  = data-parallel degree.  2 bytes/param fp16 weights, 2 bytes/param fp16 gradients.
PSI = 7.5e9
K = 12


def baseline(psi, nd):  return (2 + 2 + K) * psi                 # everything replicated
def stage1(psi, nd):    return (2 + 2 + K / nd) * psi            # P_os:     optimizer states sharded
def stage2(psi, nd):    return (2 + (2 + K) / nd) * psi          # P_os+g:   + gradients sharded
def stage3(psi, nd):    return (2 + 2 + K) / nd * psi            # P_os+g+p: + parameters sharded


# Table 1 of the paper, 7.5B-parameter column (GB): (P_os, P_os+g, P_os+g+p) per DP degree.
paper = {1: (120, 120, 120), 4: (52.5, 41.3, 30), 16: (35.6, 21.6, 7.5),
         64: (31.4, 16.6, 1.88), 256: (30.4, 15.4, 0.47), 1024: (30.1, 15.1, 0.12)}

print(f"psi = {PSI / 1e9:.1f}B parameters, K = {K}  (GB = 10^9 bytes)\n")
print(f"{'Nd':>5} | {'baseline DP':>11} | {'stage 1':>8} {'stage 2':>8} {'stage 3':>8} | within 0.06 GB of the paper's Table 1?")
for nd, expected in paper.items():
    row = (stage1(PSI, nd) / 1e9, stage2(PSI, nd) / 1e9, stage3(PSI, nd) / 1e9)
    ok = all(abs(a - b) < 0.06 for a, b in zip(row, expected)) and abs(baseline(PSI, nd) / 1e9 - 120) < 1e-9
    print(f"{nd:>5} | {baseline(PSI, nd) / 1e9:>8.1f} GB | {row[0]:>6.2f}GB {row[1]:>6.2f}GB {row[2]:>6.2f}GB | {ok}")

print("\nreduction vs baseline at Nd = 64:",
      f"stage 1 {baseline(PSI, 64) / stage1(PSI, 64):.1f}x,",
      f"stage 2 {baseline(PSI, 64) / stage2(PSI, 64):.1f}x,",
      f"stage 3 {baseline(PSI, 64) / stage3(PSI, 64):.1f}x")
print("limits as Nd -> infinity: stage 1 -> 4x, stage 2 -> 8x, stage 3 -> unbounded (it scales with Nd)")
print(f"  check with Nd=10^9: stage 1 {baseline(PSI, 1e9) / stage1(PSI, 1e9):.2f}x, stage 2 {baseline(PSI, 1e9) / stage2(PSI, 1e9):.2f}x")

# Communication per training step, in multiples of psi (ZeRO paper, section 7)
print("\ncommunication volume per step (multiples of psi): baseline DP 2, stage 1 2, stage 2 2, stage 3 3")

# Another model: does it fit on 80 GB cards?
print("\n70B parameters on 64 x 80 GB GPUs (states only):")
for name, f in (("baseline DP", baseline), ("stage 1", stage1), ("stage 2", stage2), ("stage 3", stage3)):
    gb = f(70e9, 64) / 1e9
    print(f"  {name:<12} {gb:>8.1f} GB per GPU  fits in 80 GB: {gb <= 80}")
```

```
psi = 7.5B parameters, K = 12  (GB = 10^9 bytes)

   Nd | baseline DP |  stage 1  stage 2  stage 3 | within 0.06 GB of the paper's Table 1?
    1 |    120.0 GB | 120.00GB 120.00GB 120.00GB | True
    4 |    120.0 GB |  52.50GB  41.25GB  30.00GB | True
   16 |    120.0 GB |  35.62GB  21.56GB   7.50GB | True
   64 |    120.0 GB |  31.41GB  16.64GB   1.88GB | True
  256 |    120.0 GB |  30.35GB  15.41GB   0.47GB | True
 1024 |    120.0 GB |  30.09GB  15.10GB   0.12GB | True

reduction vs baseline at Nd = 64: stage 1 3.8x, stage 2 7.2x, stage 3 64.0x
limits as Nd -> infinity: stage 1 -> 4x, stage 2 -> 8x, stage 3 -> unbounded (it scales with Nd)
  check with Nd=10^9: stage 1 4.00x, stage 2 8.00x

communication volume per step (multiples of psi): baseline DP 2, stage 1 2, stage 2 2, stage 3 3

70B parameters on 64 x 80 GB GPUs (states only):
  baseline DP    1120.0 GB per GPU  fits in 80 GB: False
  stage 1         293.1 GB per GPU  fits in 80 GB: False
  stage 2         155.3 GB per GPU  fits in 80 GB: False
  stage 3          17.5 GB per GPU  fits in 80 GB: True
```

> [!example]
> The Nd = 64 row is the paper's Figure 1 example: 120 GB baseline, 31.4 GB (stage 1), 16.6 GB (stage 2) and 1.88 GB (stage 3; the paper's running text rounds this to 1.9 GB). Check one by hand: stage 1 is (4 + 12/64) x 7.5 GB = 4.1875 x 7.5 = 31.4 GB. The paper rounds 41.25 to 41.3 and 35.625 to 35.6; the script prints two decimals. The last block shows why the stage matters in practice: for a 70B model on 64 x 80 GB GPUs, only stage 3 fits (states only).

**Step 5 - sharding the optimizer leaves the maths unchanged.** Plain data-parallel Adam against ZeRO stage 1/2-style Adam (reduce-scatter gradients, update your shard, all-gather parameters), on a toy problem with a different gradient per rank:

```python
import numpy as np

rng = np.random.default_rng(0)
N_PARAMS, WORLD, STEPS = 1000, 4, 50
LR, B1, B2, EPS = 0.05, 0.9, 0.999, 1e-8
target = rng.standard_normal(N_PARAMS)
theta0 = np.zeros(N_PARAMS)
noise = rng.standard_normal((STEPS, WORLD, N_PARAMS)) * 0.1      # each rank sees different data -> different gradient


def local_gradient(theta, step, rank):                           # gradient of 0.5*|theta-target|^2 plus per-rank noise
    return (theta - target) + noise[step, rank]


def adam_update(theta, g, m, v, t):                              # element-wise Adam; works on any slice
    m[:] = B1 * m + (1 - B1) * g
    v[:] = B2 * v + (1 - B2) * g * g
    return theta - LR * (m / (1 - B1 ** t)) / (np.sqrt(v / (1 - B2 ** t)) + EPS)


# --- Plain data parallelism: every rank keeps full theta, full m, full v; gradients all-reduced (averaged).
theta_dp = [theta0.copy() for _ in range(WORLD)]
m_dp = [np.zeros(N_PARAMS) for _ in range(WORLD)]
v_dp = [np.zeros(N_PARAMS) for _ in range(WORLD)]
for step in range(STEPS):
    g_avg = np.mean([local_gradient(theta_dp[r], step, r) for r in range(WORLD)], axis=0)
    for r in range(WORLD):
        theta_dp[r] = adam_update(theta_dp[r], g_avg, m_dp[r], v_dp[r], step + 1)

# --- ZeRO stage 1/2 style: rank r owns shard r of the optimizer state (m, v) and of the gradient.
shards = np.array_split(np.arange(N_PARAMS), WORLD)
theta_z = [theta0.copy() for _ in range(WORLD)]                  # parameters still replicated (stage 1/2)
m_z = [np.zeros(len(s)) for s in shards]                         # only 1/WORLD of the Adam state per rank
v_z = [np.zeros(len(s)) for s in shards]
for step in range(STEPS):
    grads = [local_gradient(theta_z[r], step, r) for r in range(WORLD)]
    new_shards = []
    for r, idx in enumerate(shards):
        g_shard = np.mean([g[idx] for g in grads], axis=0)       # reduce-scatter: rank r gets ONLY its shard, averaged
        new_shards.append(adam_update(theta_z[r][idx], g_shard, m_z[r], v_z[r], step + 1))
    full = np.empty(N_PARAMS)
    for idx, piece in zip(shards, new_shards):                   # all-gather: everyone receives every updated shard
        full[idx] = piece
    theta_z = [full.copy() for _ in range(WORLD)]

print("plain DP: all ranks identical      :", all(np.array_equal(theta_dp[0], t) for t in theta_dp))
print("ZeRO-style: all ranks identical    :", all(np.array_equal(theta_z[0], t) for t in theta_z))
print("max |ZeRO-style - plain DP|        :", f"{np.abs(theta_z[0] - theta_dp[0]).max():.2e}")
print("mean |theta - target|, start -> end :", f"{np.abs(theta0 - target).mean():.3f} -> {np.abs(theta_dp[0] - target).mean():.3f}")
print(f"Adam state per rank (m + v), plain DP : {m_dp[0].size + v_dp[0].size:,} numbers")
print(f"Adam state per rank (m + v), ZeRO-style: {m_z[0].size + v_z[0].size:,} numbers")
```

```
plain DP: all ranks identical      : True
ZeRO-style: all ranks identical    : True
max |ZeRO-style - plain DP|        : 0.00e+00
mean |theta - target|, start -> end : 0.777 -> 0.056
Adam state per rank (m + v), plain DP : 2,000 numbers
Adam state per rank (m + v), ZeRO-style: 500 numbers
```

The final parameters are bit-for-bit equal (`0.00e+00`), because Adam acts element by element, so splitting its state by elements changes nothing numerically. Each rank stores a quarter of the optimizer state. Optimizer steps that mix elements across a tensor, such as clipping by the global gradient norm, need one extra small communication under ZeRO.

**Step 6 - the real configurations.** *Not executed in this module's verification (needs PyTorch, DeepSpeed and multiple GPUs).*

```python
# DeepSpeed: ZeRO is a config switch.  ds_config.json fragment (the stage field is the one
# used in DeepSpeed's ZeRO tutorial):
#   { "zero_optimization": { "stage": 2 } }          # 1, 2 or 3

# PyTorch FSDP2, following PyTorch's FSDP tutorial.  Launch: torchrun --nproc_per_node=8 train.py
import torch
import torch.distributed as dist
from torch.distributed.fsdp import fully_shard

dist.init_process_group("nccl")
model = Transformer(...)                 # placeholder: any model with a list of blocks, model.layers
for layer in model.layers:
    fully_shard(layer)                   # shard each block: gathered just before it runs, freed after
fully_shard(model)                       # then the root, which covers the remaining parameters
opt = torch.optim.AdamW(model.parameters(), lr=3e-4)    # the optimizer sees only this rank's shards
# the training loop is the ordinary one: loss.backward(); opt.step(); opt.zero_grad()
```

## Visual diagram

```
GPipe SCHEDULE, p = 4 stages, m = 4 micro-batches (forward: digits, backward: letters, . = idle)

  stage 0: 0123.........aabbccdd
  stage 1: .0123......aabbccdd..          bubble = the dots
  stage 2: ..0123...aabbccdd....          idle share = (p-1)/(m+p-1) = 3/7 = 43%
  stage 3: ...0123aabbccdd......
           (output of this simulation: forward = 1 tick, backward = 2 ticks)
```

```
1F1B, p = 4, m = 8: same bubble, but a stage never holds more than p micro-batches

  stage 0: 0123......aa4bb5cc6dd7ee.ff.gg.hh      warm-up forwards, then alternate F/B
  stage 1: .012....aa3bb4cc5dd6ee7ff.gg.hh..
  stage 2: ..01..aa2bb3cc4dd5ee6ff7gg.hh....       GPipe would hold all 8 micro-batches at once;
  stage 3: ...0aa1bb2cc3dd4ee5ff6gg7hh......       1F1B holds at most 4
```

```
PER-GPU MODEL-STATE MEMORY, 7.5B parameters, N_d = 64   (one # = 1 byte per parameter; slivers rounded up to one #)

                params 2Ψ   grads 2Ψ   optimizer state KΨ = 12Ψ
  baseline DP   [##]        [##]       [############]                    120 GB
  ZeRO-1        [##]        [##]       [#]   (12Ψ/64)                     31.4 GB
  ZeRO-2        [##]        [#]        [#]   (grads and optimizer / 64)   16.6 GB
  ZeRO-3        [.]         [.]        [.]   (everything / 64)             1.88 GB
                                                                         (paper, Fig. 1)

COMMUNICATION PER STEP     2Ψ  (DP)  ->  2Ψ  (ZeRO-1)  ->  2Ψ  (ZeRO-2)  ->  3Ψ  (ZeRO-3)
```

```
ZeRO-3 / FSDP LAYER CYCLE (each GPU stores a 1/N shard of every layer)

   forward layer k :   all-gather shards ─► full weights ─► compute ─► free the full copy
   backward layer k:   all-gather again  ─► compute grads ─► reduce-scatter grads ─► each GPU keeps its shard
   optimizer       :   each GPU updates only its own shard of weights and Adam state
```

## Practice

### 1. How many micro-batches for a 10% bubble?

With p = 8 stages, how many micro-batches does the GPipe schedule need for at most 10% idle time? Check it with `simulate` from step 1.

<details><summary>Answer</summary>

(p-1)/(m+p-1) <= 0.1 gives 7 / (m + 7) <= 0.1, so m >= 63. At m = 63 the idle share is exactly 7/70 = 10%. Call `simulate(8, 63, "gpipe")[1]` to confirm (about 0.1000). Compare step 2's output: even m = 64 leaves about 9.9% at p = 8.

</details>

### 2. Which ZeRO stage can ever fit a 70B model on 80 GB cards?

Using the formulas in step 4: for a 70B-parameter model, what is the smallest data-parallel degree at which ZeRO-3 fits the model states in 80 GB? Can ZeRO-2 ever fit, however many GPUs you use?

<details><summary>Answer</summary>

ZeRO-3 needs 16 x 70 GB / N_d <= 80 GB, so N_d >= 1120 / 80 = 14. (At N_d = 64 the script gives 17.5 GB.) ZeRO-2 keeps the 16-bit parameters on every GPU: 2Ψ = 140 GB, which already exceeds 80 GB, so no number of GPUs can make it fit. ZeRO-1 is worse still (its floor is 4Ψ = 280 GB). Only stage 3 (or combining with tensor/pipeline parallelism) reduces the parameter term. States only: activations are extra.

</details>

### 3. Price the memory saving of 1F1B

At p = 4 and m = 16, suppose one micro-batch's activations on one stage take 1 GB. What does stage 0 hold at its peak under GPipe versus 1F1B, and what happens to the idle fraction?

<details><summary>Answer</summary>

Step 3's table gives "held" 16 for GPipe and 4 for 1F1B, so 16 GB versus 4 GB, with the same idle fraction of 0.1579 in both. 1F1B is a memory optimisation, not a speed one.

</details>

### 4. Convert between bubble definitions

A paper says the bubble is `(p-1)/m` of ideal time. For p = 4 and m = 16, what idle share of the whole timeline is that? Compare with the table in step 2.

<details><summary>Answer</summary>

x = 3/16 = 0.1875; as a share of the timeline it is x / (1 + x) = 0.1875 / 1.1875 = 0.1579, which equals 3/19 and matches the `p = 4, m = 16` row (0.1579).

</details>

### Checkpoint quiz

1. In the GPipe schedule with p stages and m micro-batches, how many time slots does the forward phase take, and why?
2. Why does increasing m shrink the bubble, and what does it cost?
3. What does 1F1B change and what does it leave alone?
4. What is sharded at ZeRO stages 1, 2 and 3?
5. Why does stage 3 cost 1.5x the communication while stages 1 and 2 cost nothing extra?

<details><summary>Answers</summary>

1. `m + p - 1`: the first micro-batch needs p slots to traverse the stages and each of the other m-1 follows one slot behind.
2. The fixed `p-1` slots of fill and drain are spread over more useful work (idle share `(p-1)/(m+p-1)`); costs are smaller micro-batches and, in the all-forward schedule, more activations held at once.
3. It changes the order so at most p micro-batches are in flight (lower activation memory); the bubble and the total time are unchanged.
4. Optimizer states; plus gradients; plus parameters (cumulative).
5. Baseline DP moves 2Ψ (reduce-scatter plus all-gather inside the all-reduce). Stages 1-2 replace that with a reduce-scatter of gradients plus an all-gather of updated parameters: also 2Ψ. Stage 3 adds a parameter all-gather in the forward and another in the backward pass: 3Ψ in total.

</details>

> [!check]
> - I can derive (p-1)/(m+p-1) and state what each term means.
> - I can say what 1F1B changes and what it does not.
> - I can compute per-GPU model-state memory for ZeRO stages 1, 2 and 3 from Ψ, K and N_d.
> - I can state the communication volume of each stage relative to plain data parallelism.
> - I can explain FSDP as PyTorch's ZeRO-3-style sharding and say what it gathers and when.

## Project

Build a **parallelism planner** in Python, with no starting code. Inputs: parameter count, number of layers, hidden size, number of GPUs G, GPU memory, and a global batch size. Enumerate every factorisation G = t x p x d (tensor, pipeline, data degrees) and, for each, report:

1. Per-GPU model-state memory under each ZeRO stage applied across the data-parallel dimension (state your assumption about how tensor and pipeline parallelism divide the parameters), and whether it fits.
2. The micro-batch count m implied by your global batch and per-GPU micro-batch size, and the pipeline bubble `(p-1)/(m+p-1)`.
3. A tensor-parallel communication-to-compute estimate from module 10's method, flagging configurations whose tensor-parallel group is larger than one server.

Validate the planner by reproducing the ZeRO paper's 7.5B / N_d = 64 numbers, and by checking its bubble numbers against the simulator from step 1. Finish with a short written recommendation for one model size of your choice, listing every assumption.

## Interview questions

> [!interview]
> Derive the pipeline bubble. What can you do about it?

<details><summary>What a strong answer covers</summary>

- p stages, m micro-batches: fill and drain cost `p-1` slots each way, total `(m+p-1)(t_f+t_b)`, useful `m(t_f+t_b)`, idle share `(p-1)/(m+p-1)`; independent of `t_b/t_f`.
- Remedies: more micro-batches (m much greater than p; mention the smaller-micro-batch efficiency and activation-memory costs), interleaved stages (divides the bubble by chunks per GPU, more communication), fewer stages.
- 1F1B reduces activation memory, not the bubble. Mentions the `(p-1)/m` convention difference.

</details>

> [!interview]
> Explain ZeRO stages 1, 2 and 3: what is sharded, what is the memory per GPU, and what does it cost?

<details><summary>What a strong answer covers</summary>

- Cumulative sharding of optimizer states, then gradients, then parameters across data-parallel ranks; formulas `(4 + K/N_d)Ψ`, `2Ψ + (2+K)Ψ/N_d`, `(2+2+K)Ψ/N_d` with K = 12 for mixed-precision Adam.
- Worked example: 7.5B at N_d = 64 gives 120 → 31.4 → 16.6 → 1.88 GB.
- Communication: stages 1-2 equal baseline DP (2Ψ), stage 3 is 1.5x (3Ψ).
- Caveats: model states only (activations separate); the maths is unchanged (same updates).

</details>

> [!interview]
> When would you choose FSDP/ZeRO-3 over tensor plus pipeline parallelism?

<details><summary>What a strong answer covers</summary>

- FSDP/ZeRO-3 needs no model rewrite and works with data parallelism's simple structure, but communicates parameters every step (about 1.5x DP) and relies on good interconnect.
- Tensor parallelism needs fast intra-node links and model-code changes; pipeline needs micro-batching and tolerates slower inter-node links with a bubble to manage.
- For moderately large models inside one well-connected node FSDP is often the simplest; at the largest scales these are combined. A good answer states this as a trade-off and says to measure.

</details>

## Common mistakes & troubleshooting

- **Too few micro-batches and a pipeline that sits idle.** Symptom: throughput far below the single-stage rate. Check m against p; step 2 shows m = 4, p = 8 idles 64% of the time.
- **Expecting 1F1B to be faster.** It has the same idle fraction; the benefit is lower activation memory (step 3).
- **Reading ZeRO memory as total memory and still hitting out-of-memory errors.** The numbers cover parameters, gradients and optimizer states only; activations and buffers come on top.
- **Choosing ZeRO-2 for a model whose 16-bit weights alone exceed GPU memory.** Stage 2 keeps full parameters on every GPU (2Ψ floor); you need stage 3 or model splitting.
- **Wrapping only the root module in FSDP.** The tutorial says to apply `fully_shard` to submodules as well as the root, so parameters are gathered layer by layer rather than all at once.
- **Mixing up bubble definitions.** `(p-1)/m` and `(p-1)/(m+p-1)` are both correct; check which denominator a source uses.

## Further reading & sources

- [ZeRO: Memory Optimizations Toward Training Trillion Parameter Models](https://arxiv.org/abs/1910.02054) - the source of the stage definitions, the memory formulas, Table 1 (the 7.5B example reproduced above) and the 2Ψ / 3Ψ communication analysis.
- [GPipe: Efficient Training of Giant Neural Networks using Pipeline Parallelism](https://arxiv.org/abs/1811.06965) - micro-batch pipelining with a flush, and the O((K-1)/(M+K-1)) bubble overhead.
- [Efficient Large-Scale Language Model Training on GPU Clusters Using Megatron-LM](https://arxiv.org/abs/2104.04473) - the 1F1B (PipeDream-Flush) and interleaved schedules, the (p-1)/m bubble convention, and combining tensor, pipeline and data parallelism.
- [PyTorch FSDP: Experiences on Scaling Fully Sharded Data Parallel](https://arxiv.org/abs/2304.11277) - the FSDP paper, which credits ZeRO as an inspiration and describes the all-gather / reduce-scatter design.
- [Getting Started with Fully Sharded Data Parallel (FSDP2)](https://docs.pytorch.org/tutorials/intermediate/FSDP_tutorial.html) - official tutorial for the `fully_shard` API and the gather / reduce-scatter cycle used in the (unexecuted) snippet.
- [DeepSpeed ZeRO tutorial](https://www.deepspeed.ai/tutorials/zero/) - official description of ZeRO stages 1-3 and the `zero_optimization` / `stage` configuration.

## Next

[Module 12: Choosing GPUs: Consumer vs. Datacenter](../12-choosing-gpus-consumer-vs-datacenter/README.md)
