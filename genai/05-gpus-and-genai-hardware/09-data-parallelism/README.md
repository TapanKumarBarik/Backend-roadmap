# Module 09: Data Parallelism

## Roadmap

You are in **Track 05: GPUs & GenAI Hardware**. Modules 00-08 were about one GPU; from here to module 11 the question is what to do with many.

**Before this module**
- [Module 04: VRAM: The Real Constraint](../04-vram-the-real-constraint/README.md) and [Module 05: Calculating a Model's Memory Requirements](../05-calculating-a-models-memory-requirements/README.md) - whether one copy of the model fits on one card. Data parallelism only works when it does.
- [Module 07: Mixed Precision Training](../07-mixed-precision-training/README.md) - the gradients that get communicated are usually 16-bit.
- [Module 08: FlashAttention and Memory-Efficient Kernels](../08-flashattention-and-memory-efficient-kernels/README.md) - the single-GPU speed-up that data parallelism multiplies.

**After this module you can**
- describe one data-parallel training step and say exactly what is communicated;
- explain why averaging shard gradients reproduces the full-batch gradient (and when it silently does not);
- compute effective batch size, and the per-GPU traffic of a ring all-reduce;
- reason about why scaling flattens out, and recognise DistributedDataParallel (DDP) as the real-world form.

**Why it matters.** Data parallelism is the first, simplest and most widely used way to use more than one GPU. Every other scheme in this track (modules 10 and 11) is combined with it or exists to fix its main limitation.

## Concept

> [!key] Data parallelism gives every GPU a full copy of the model and a different slice of each batch, then averages the gradients across GPUs with an all-reduce so every copy takes the identical step; it scales until the time spent communicating matches the time spent computing.

## Explanation

### One training step

Take W GPUs ("workers", "ranks"). Each holds an identical copy of the parameters and optimizer state.

1. The **global batch** is cut into W **shards**; each GPU gets one.
2. Each GPU runs forward and backward on its shard alone, producing a local gradient. No communication yet.
3. An **all-reduce** adds the W local gradients and divides by W, so every GPU ends up holding the same average gradient.
4. Each GPU applies the optimizer step. Same weights, same gradient, same optimizer: the same new weights. The copies never drift apart (the first snippet below measures a difference of exactly `0.0` between replicas after 100 steps).

The communication is a single collective per step, on a buffer the size of the model's gradients. Nothing about the model code changes, which is why this is the default way to scale training.

### Why averaging shard gradients is the full-batch gradient

A typical loss is the **mean** of per-example losses. Gradients are linear, so the gradient of the mean over 64 examples equals the mean of four shard gradients, each of which is itself a mean over 16. Data parallelism is therefore not an approximation of large-batch training; it *is* large-batch training, computed in pieces. The snippet verifies it on a small neural network with hand-written backpropagation, and then trains 100 steps both ways.

> [!pitfall]
> The equality needs **equal shard sizes**. If shards have 10, 14, 20 and 20 examples (a ragged last batch, say), the plain mean of shard means is wrong (the snippet measures an error of 0.12); weight each shard by its share of the batch (n_i / total) and it is exact again. Also check whether your loss uses a mean or a sum, since that decides what to divide by.

### Effective batch size

**Effective (global) batch = per-GPU micro-batch x gradient-accumulation steps x number of GPUs.**

Gradient accumulation means running several micro-batches and summing their gradients locally before the all-reduce, so the expensive communication happens once per optimizer step instead of once per micro-batch (DDP offers a `no_sync()` context for this). The consequence to remember: adding GPUs at a fixed per-GPU batch **changes the optimization problem**, because the global batch grows. Learning rate and warm-up usually need re-tuning when it does; that is common practice rather than something this module measures.

### The all-reduce, and why it is a ring

An **all-reduce** takes one vector per worker and leaves every worker with the elementwise sum (NCCL, NVIDIA's collective-communication library, defines it that way; it is the usual PyTorch backend for NVIDIA GPUs).

The naive design sends everything to one worker, which adds and sends the result back. That worker's link carries (W-1) full copies in and (W-1) out; it becomes the bottleneck and gets worse as W grows. The **ring all-reduce** avoids this. With buffer size S:

1. Cut each buffer into W chunks of S/W.
2. **Reduce-scatter**, W-1 steps. In every step each worker sends one chunk to its right neighbour and receives one from its left, adding what arrives. After W-1 steps worker r holds the fully summed chunk number (r+1) mod W.
3. **All-gather**, W-1 steps. The finished chunks travel once more around the ring, now overwriting instead of adding.

Every step moves S/W per worker, and there are 2(W-1) steps, so each worker sends **2(W-1)/W x S** in total: below 2S however large W is. All links in the ring are busy simultaneously, which is what makes it bandwidth-optimal (Patarasuk and Yuan, the result the Horovod paper builds on). The cost to know about is latency: 2(W-1) sequential steps, so for small messages other algorithms (the DDP paper mentions tree-based all-reduce) can win.

### Why it scales until communication dominates

A step costs roughly `compute + all-reduce`. Compute depends on the per-GPU batch; the all-reduce moves about 2S bytes per GPU **whatever W is**. So:

- adding GPUs never makes the all-reduce itself shorter;
- the slowest link in the path decides its speed, which is why the interconnect (NVLink, PCIe, network) matters as much as the GPU (module 10 goes deeper);
- if you hold the *global* batch fixed and split it ever finer, compute per GPU shrinks while communication does not, and speed-up flattens;
- if you hold the *per-GPU* batch fixed, efficiency settles at `compute / (compute + all-reduce)`; a bigger per-GPU batch or more gradient accumulation raises it.

DDP also hides communication: it groups gradients into buckets (25 MB by default, per the DDP paper) and starts the all-reduce of a bucket as soon as its gradients are ready, while the rest of the backward pass keeps running. The no-overlap model in the third snippet is therefore a pessimistic bound.

### What data parallelism does not fix

Every GPU stores the complete model, gradients and optimizer state. Mixed-precision Adam needs about 16 bytes per parameter (module 10 works it out), so adding GPUs adds speed but not capacity. When one replica does not fit, you need modules 10 and 11.

> [!model]
> Eight cooks each get a different order ticket but identical recipe books. After every dish they compare notes on what to adjust (the all-reduce), agree on one correction, and all update their books identically. More cooks means more dishes per hour, but the meeting takes just as long, and if every cook needs a bigger kitchen than you have, extra cooks do not help.

## Code

Python 3.13 with numpy 2.4.6 only; no GPU.

**Step 1 - gradient equivalence and training equivalence.** A two-layer network with hand-written backprop; (1) full-batch gradient vs the mean of four shard gradients, (2) unequal shards, (3) 100 steps of four-replica training against single-process training, (4) effective-batch arithmetic.

```python
import numpy as np

rng = np.random.default_rng(0)
D_IN, D_H = 8, 16


def init_params():
    return {"W1": rng.standard_normal((D_IN, D_H)) * 0.5, "b1": np.zeros(D_H),
            "W2": rng.standard_normal((D_H, 1)) * 0.5, "b2": np.zeros(1)}


def loss_and_grads(p, X, y):
    """Tiny 2-layer MLP, mean-squared-error loss, hand-written backprop.
    The loss and gradients are AVERAGES over the examples passed in."""
    n = len(X)
    h = np.tanh(X @ p["W1"] + p["b1"])
    err = (h @ p["W2"] + p["b2"]) - y
    loss = (err ** 2).mean()
    dpred = 2 * err / n
    dh = dpred @ p["W2"].T
    dz1 = dh * (1 - h ** 2)
    return loss, {"W1": X.T @ dz1, "b1": dz1.sum(0), "W2": h.T @ dpred, "b2": dpred.sum(0)}


def max_diff(a, b):
    return max(np.abs(a[k] - b[k]).max() for k in a)


params = init_params()
X = rng.standard_normal((64, D_IN))
y = rng.standard_normal((64, 1))

# 1) One big batch on one "GPU"  vs  4 equal shards, gradients averaged ("all-reduce, then / 4").
_, g_full = loss_and_grads(params, X, y)
shard_grads = [loss_and_grads(params, Xs, ys)[1] for Xs, ys in zip(np.split(X, 4), np.split(y, 4))]
g_avg = {k: sum(g[k] for g in shard_grads) / 4 for k in g_full}
print("equal shards (16 each): max |mean of shard grads - full-batch grad| =", f"{max_diff(g_avg, g_full):.2e}")

# 2) Unequal shards: a plain mean of shard means is NOT the full-batch mean.
sizes = [10, 14, 20, 20]
cuts = np.cumsum(sizes)[:-1]
grads_u = [loss_and_grads(params, Xs, ys)[1] for Xs, ys in zip(np.split(X, cuts), np.split(y, cuts))]
plain = {k: sum(g[k] for g in grads_u) / 4 for k in g_full}
weighted = {k: sum(n * g[k] for n, g in zip(sizes, grads_u)) / 64 for k in g_full}
print("unequal shards, plain mean    :", f"{max_diff(plain, g_full):.2e}   <- wrong")
print("unequal shards, size-weighted :", f"{max_diff(weighted, g_full):.2e}   <- correct")

# 3) Whole training runs: 4 replicas averaging gradients every step vs one process on the full batch.
POOL_X = rng.standard_normal((512, D_IN))
POOL_Y = np.sin(POOL_X.sum(1, keepdims=True))
WORLD, GLOBAL_B, LR, STEPS = 4, 64, 0.05, 100

single = {k: v.copy() for k, v in params.items()}
replicas = [{k: v.copy() for k, v in params.items()} for _ in range(WORLD)]     # same init everywhere
batch_rng = np.random.default_rng(123)
for step in range(STEPS):
    idx = batch_rng.choice(len(POOL_X), GLOBAL_B, replace=False)                 # the global batch
    Xb, yb = POOL_X[idx], POOL_Y[idx]
    loss_s, g = loss_and_grads(single, Xb, yb)                                   # single process
    for k in single:
        single[k] -= LR * g[k]
    local = [loss_and_grads(r, Xs, ys)[1]                                        # data parallel
             for r, Xs, ys in zip(replicas, np.split(Xb, WORLD), np.split(yb, WORLD))]
    for k in single:
        avg = sum(g_r[k] for g_r in local) / WORLD                               # the all-reduce
        for r in replicas:
            r[k] -= LR * avg
    if step in (0, STEPS - 1):
        print(f"step {step:>3}: loss (single process) = {loss_s:.6f}")

print("replica 0 vs replica 3 after training :", f"{max_diff(replicas[0], replicas[3]):.2e}")
print("data parallel vs single process       :", f"{max_diff(replicas[0], single):.2e}")

# 4) Effective batch size
per_gpu_micro_batch, accumulation_steps = 8, 4
print("\neffective batch =", per_gpu_micro_batch, "x", accumulation_steps, "x", WORLD, "GPUs =",
      per_gpu_micro_batch * accumulation_steps * WORLD)
```

```
equal shards (16 each): max |mean of shard grads - full-batch grad| = 4.44e-16
unequal shards, plain mean    : 1.22e-01   <- wrong
unequal shards, size-weighted : 2.22e-16   <- correct
step   0: loss (single process) = 3.128060
step  99: loss (single process) = 0.525819
replica 0 vs replica 3 after training : 0.00e+00
data parallel vs single process       : 3.33e-16

effective batch = 8 x 4 x 4 GPUs = 128
```

> [!example]
> `4.44e-16` is float64 rounding noise from summing in a different order, so the check is "equal to tolerance". The two replicas that were compared after training are *exactly* equal (`0.00e+00`) because they executed identical arithmetic on identical inputs.

**Step 2 - simulate the ring all-reduce step by step.** The trace uses the trick described in the comments: worker `r` holds `10**r`, so each cell's digits show which workers have been summed into it. Then the algorithm is checked against `np.sum` for several worker counts, the bytes sent per worker are counted, and ring traffic is compared with the send-everything-to-one-worker scheme.

```python
import numpy as np


def ring_allreduce(buffers, trace=None):
    """Simulate ring all-reduce (sum). buffers[r] is worker r's vector.
    Phase 1 (reduce-scatter): n-1 steps; afterwards worker r owns the fully summed chunk (r+1) % n.
    Phase 2 (all-gather)    : n-1 steps; the finished chunks travel around the ring.
    In every step each worker sends exactly one chunk to its right neighbour (r+1) % n."""
    n = len(buffers)
    chunks = [np.array_split(b.astype(float).copy(), n) for b in buffers]
    sent = [0] * n                                         # elements each worker has sent
    for phase in ("reduce-scatter", "all-gather"):
        for step in range(n - 1):
            if phase == "reduce-scatter":
                send = [(r, (r - step) % n) for r in range(n)]
            else:
                send = [(r, (r + 1 - step) % n) for r in range(n)]
            msgs = [(r, c, chunks[r][c].copy()) for r, c in send]      # all sends happen "at once"
            for r, c, data in msgs:
                dst = (r + 1) % n
                if phase == "reduce-scatter":
                    chunks[dst][c] = chunks[dst][c] + data             # receiver adds
                else:
                    chunks[dst][c] = data                              # receiver overwrites
                sent[r] += data.size
            if trace is not None:
                trace.append((phase, step, [[int(ch[0]) for ch in worker] for worker in chunks]))
    return [np.concatenate(c) for c in chunks], sent


# --- A traceable example: 4 workers, buffers of 4 chunks with 1 element each. Worker r holds the value
# 10**r in every chunk, so a cell reading 110 means "workers 1 and 2 have been added into this chunk".
n = 4
bufs = [np.full(n, 10 ** r) for r in range(n)]
trace = []
out, _ = ring_allreduce(bufs, trace)


def row(label, state):                                   # state[w] = worker w's four chunks
    return f"{label:<7}" + " ".join("[" + " ".join(f"{v:4d}" for v in w) + "]" for w in state)


print(f"{'':<7}" + " ".join(f"{'worker ' + str(w):<21}" for w in range(n)))
print(row("start", [b.astype(int).tolist() for b in bufs]))
for phase, step, state in trace:
    print(row(("rs " if phase == "reduce-scatter" else "ag ") + str(step + 1), state))

# --- Correctness: random vectors, several worker counts, sizes that do and do not divide evenly.
rng = np.random.default_rng(0)
print("\nworkers  length  max |ring - sum|   all workers equal")
for n, length in [(2, 10), (3, 1000), (4, 1000), (5, 1003), (8, 4096), (16, 4096)]:
    bufs = [rng.standard_normal(length) for _ in range(n)]
    out, sent = ring_allreduce(bufs)
    ref = np.sum(bufs, axis=0)
    same = all(np.array_equal(out[0], o) for o in out)
    print(f"{n:>7} {length:>7} {np.abs(out[0] - ref).max():>14.2e} {str(same):>18}")
    assert np.allclose(out[0], ref) and same

# --- Traffic: each worker sends 2(n-1)/n of the buffer, however many workers there are.
S = 1200
print("\nworkers  elements sent per worker  expected 2(n-1)/n * S  as multiple of S")
for n in (2, 3, 4, 6, 8):
    _, sent = ring_allreduce([rng.standard_normal(S) for _ in range(n)])
    expected = 2 * (n - 1) * S // n
    assert all(s == expected for s in sent)
    print(f"{n:>7} {sent[0]:>25,} {expected:>22,} {sent[0] / S:>16.3f}")

# --- Versus "everyone sends to worker 0, which adds and sends the result back".
print("\nbusiest worker's traffic, in multiples of the buffer size S:")
print(f"{'workers':>8} {'ring (any worker)':>18} {'via worker 0 (root)':>20}")
for n in (2, 4, 8, 64, 1024):
    print(f"{n:>8} {2 * (n - 1) / n:>18.3f} {2 * (n - 1):>20.0f}")
```

```
       worker 0              worker 1              worker 2              worker 3
start  [   1    1    1    1] [  10   10   10   10] [ 100  100  100  100] [1000 1000 1000 1000]
rs 1   [   1    1    1 1001] [  11   10   10   10] [ 100  110  100  100] [1000 1000 1100 1000]
rs 2   [   1    1 1101 1001] [  11   10   10 1011] [ 111  110  100  100] [1000 1110 1100 1000]
rs 3   [   1 1111 1101 1001] [  11   10 1111 1011] [ 111  110  100 1111] [1111 1110 1100 1000]
ag 1   [1111 1111 1101 1001] [  11 1111 1111 1011] [ 111  110 1111 1111] [1111 1110 1100 1111]
ag 2   [1111 1111 1101 1111] [1111 1111 1111 1011] [ 111 1111 1111 1111] [1111 1110 1111 1111]
ag 3   [1111 1111 1111 1111] [1111 1111 1111 1111] [1111 1111 1111 1111] [1111 1111 1111 1111]

workers  length  max |ring - sum|   all workers equal
      2      10       0.00e+00               True
      3    1000       8.88e-16               True
      4    1000       8.88e-16               True
      5    1003       8.88e-16               True
      8    4096       1.78e-15               True
     16    4096       3.55e-15               True

workers  elements sent per worker  expected 2(n-1)/n * S  as multiple of S
      2                     1,200                  1,200            1.000
      3                     1,600                  1,600            1.333
      4                     1,800                  1,800            1.500
      6                     2,000                  2,000            1.667
      8                     2,100                  2,100            1.750

busiest worker's traffic, in multiples of the buffer size S:
 workers  ring (any worker)  via worker 0 (root)
       2              1.000                    2
       4              1.500                    6
       8              1.750                   14
      64              1.969                  126
    1024              1.998                 2046
```

In the trace, `rs` rows are reduce-scatter steps and `ag` rows are all-gather steps. After `rs 3` each worker owns exactly one complete chunk (`1111`: worker 0 has chunk 1, worker 1 has chunk 2, and so on, matching "worker r owns chunk (r+1) mod W"). After `ag 3` everyone holds `1111` everywhere, which is the sum. The traffic table shows the point of the design: ring traffic per worker approaches 2S and stays there, while the root of the naive scheme handles 2(W-1)S.

**Step 3 - a step-time model.** Every input here is an assumption that you can change (marked in the code); the output shows the *shape* of scaling, not a prediction for your cluster. The NVLink and PCIe figures are the A100 datasheet's link numbers (checked Oct 2026), treated as usable one-way bandwidth, which is optimistic; 100 Gb/s Ethernet is converted to 12.5 GB/s.

```python
# A back-of-the-envelope model of data-parallel step time. Every input is an ASSUMPTION
# you can change; the point is the shape of the curves, not the absolute numbers.
PARAMS = 1.3e9               # model size (assumed)
GRAD_BYTES = PARAMS * 2      # bf16 gradients -> 2 bytes per parameter (assumed)
T_COMPUTE = 0.40             # seconds of forward+backward per GPU per step (assumed)

LINKS = {                    # bytes/second, treated as the usable one-way bandwidth (optimistic)
    "NVLink  600 GB/s": 600e9,     # A100 SXM datasheet figure
    "PCIe4    64 GB/s": 64e9,      # A100 datasheet figure for PCIe Gen4
    "100 GbE  12.5 GB/s": 12.5e9,  # 100 gigabit/s Ethernet = 12.5 GB/s (unit conversion)
}


def allreduce_seconds(world, bandwidth):
    """Bandwidth term of ring all-reduce only: 2(W-1)/W * S / bandwidth. Latency ignored."""
    return 0.0 if world == 1 else 2 * (world - 1) / world * GRAD_BYTES / bandwidth


worlds = (1, 2, 4, 8, 16, 32, 64)
print(f"gradient buffer = {GRAD_BYTES / 1e9:.1f} GB, compute per step = {T_COMPUTE * 1000:.0f} ms")

print("\nWEAK scaling (batch per GPU fixed): efficiency = compute / (compute + all-reduce)")
print(f"{'link':<20}" + "".join(f"{w:>7}" for w in worlds))
for name, bw in LINKS.items():
    row = [T_COMPUTE / (T_COMPUTE + allreduce_seconds(w, bw)) for w in worlds]
    print(f"{name:<20}" + "".join(f"{e * 100:>6.0f}%" for e in row))

print("\nSTRONG scaling (global batch fixed, split W ways): speedup over 1 GPU")
print(f"{'link':<20}" + "".join(f"{w:>7}" for w in worlds))
for name, bw in LINKS.items():
    row = [T_COMPUTE / (T_COMPUTE / w + allreduce_seconds(w, bw)) for w in worlds]
    print(f"{name:<20}" + "".join(f"{s:>7.1f}" for s in row))

print("\nall-reduce time per step at W=8:")
for name, bw in LINKS.items():
    print(f"  {name:<20} {allreduce_seconds(8, bw) * 1000:7.1f} ms")
```

```
gradient buffer = 2.6 GB, compute per step = 400 ms

WEAK scaling (batch per GPU fixed): efficiency = compute / (compute + all-reduce)
link                      1      2      4      8     16     32     64
NVLink  600 GB/s       100%    99%    98%    98%    98%    98%    98%
PCIe4    64 GB/s       100%    91%    87%    85%    84%    84%    83%
100 GbE  12.5 GB/s     100%    66%    56%    52%    51%    50%    49%

STRONG scaling (global batch fixed, split W ways): speedup over 1 GPU
link                      1      2      4      8     16     32     64
NVLink  600 GB/s        1.0    2.0    3.8    6.9   12.1   19.1   27.1
PCIe4    64 GB/s        1.0    1.7    2.5    3.3    4.0    4.4    4.6
100 GbE  12.5 GB/s      1.0    1.0    1.0    1.0    1.0    1.0    1.0

all-reduce time per step at W=8:
  NVLink  600 GB/s         7.6 ms
  PCIe4    64 GB/s        71.1 ms
  100 GbE  12.5 GB/s     364.0 ms
```

Read the weak-scaling table across a row: efficiency drops once, from W = 1 to W = 2 (the first time there is anything to communicate), then declines slowly and levels off, because ring traffic per GPU approaches 2S. What differs between rows is the link: roughly 98%, 83% and 49% at W = 64. The strong-scaling table shows the other regime: with a fixed global batch, speed-up saturates on PCIe-class links (4.6x at W = 64) and is nil over 100 GbE with these assumed sizes. The model pretends all W GPUs share one uniform link. A real 64-GPU job has 8 GPUs per server on a fast local fabric and servers connected by a slower network, and the slower hop dominates.

**Step 4 - the real-world form: DDP.** *Not executed in this module's verification (needs PyTorch, NCCL and at least two GPUs).* It follows PyTorch's DDP tutorial and the DDP paper; `MyModel`, `dataset` and `loss_fn` are placeholders.

```python
# train_ddp.py - launch with:  torchrun --nproc_per_node=8 train_ddp.py
import os
import torch
import torch.distributed as dist
from torch.nn.parallel import DistributedDataParallel as DDP
from torch.utils.data import DataLoader, DistributedSampler

dist.init_process_group("nccl")                    # torchrun supplies RANK, WORLD_SIZE, LOCAL_RANK
local_rank = int(os.environ["LOCAL_RANK"])
torch.cuda.set_device(local_rank)

model = MyModel().cuda(local_rank)
model = DDP(model, device_ids=[local_rank])        # broadcasts rank 0's weights; hooks all-reduce into backward

sampler = DistributedSampler(dataset)              # each rank reads a different 1/W of the data
loader = DataLoader(dataset, batch_size=32, sampler=sampler)   # batch_size is PER PROCESS
opt = torch.optim.AdamW(model.parameters(), lr=3e-4)

for epoch in range(3):
    sampler.set_epoch(epoch)                       # new shuffle each epoch
    for x, y in loader:
        loss = loss_fn(model(x.cuda(local_rank)), y.cuda(local_rank))
        loss.backward()                            # bucketed all-reduce (average) overlaps with this
        opt.step()
        opt.zero_grad()
```

With 8 processes and `batch_size=32`, the effective batch is 256 samples per optimizer step. The script contains no explicit communication call: DDP registers hooks on the gradients and runs the all-reduce during `backward()`.

## Visual diagram

```
ONE DATA-PARALLEL STEP (W = 4 GPUs)

  global batch  [ s0 | s1 | s2 | s3 ]          each GPU holds the SAME weights
                   |    |    |    |
                   v    v    v    v
              ┌──────┐┌──────┐┌──────┐┌──────┐
              │GPU 0 ││GPU 1 ││GPU 2 ││GPU 3 │   forward + backward on own shard
              │ g0   ││ g1   ││ g2   ││ g3   │   -> four DIFFERENT local gradients
              └──┬───┘└──┬───┘└──┬───┘└──┬───┘
                 └───────┴───┬───┴───────┘
                     all-reduce: (g0+g1+g2+g3) / 4
                 ┌───────┬───┴───┬───────┐
                 v       v       v       v
              every GPU now holds the SAME gradient
              -> same optimizer step -> same weights again
```

```
RING ALL-REDUCE, 4 workers, buffer cut into 4 chunks (A B C D)

  worker 0 ──► worker 1 ──► worker 2 ──► worker 3 ──┐      every step: each worker sends
      ▲                                              │      ONE chunk (S/4) to its right
      └──────────────────────────────────────────────┘      neighbour, all at the same time

  reduce-scatter (3 steps)         all-gather (3 steps)
  receiver ADDS the chunk          receiver OVERWRITES with the finished chunk
  end: worker r owns the           end: every worker has every finished chunk
       summed chunk (r+1) mod 4

  data sent per worker = 2 x 3 steps x S/4 = 1.5 S      general: 2(W-1)/W x S  (< 2S for any W)
```

```
STEP TIME

  no overlap :  |=========== backward compute ===========|=== all-reduce ===|
  with buckets: |=========== backward compute ===========|
                         |= b1 =|   |= b2 =|   |= b3 =|-|      <- each bucket's all-reduce starts as soon
                                                                  as its gradients are ready; most of it is hidden
  efficiency = compute / step time; a bigger per-GPU batch makes the compute bar longer
```

## Practice

### 1. Buy back efficiency with gradient accumulation

In `s3_scaling_model.py` keep the 100 GbE link and W = 8, but raise `T_COMPUTE` from 0.4 s to 1.6 s (a per-GPU batch four times larger, via gradient accumulation, still one all-reduce per step). What weak-scaling efficiency do you get, and why does it improve?

<details><summary>Answer</summary>

The all-reduce still takes 364 ms (it depends on the gradient size, not the batch), so efficiency becomes 1.6 / (1.6 + 0.364) = **81%**, up from 52% at 0.4 s. Four times more compute is amortised over the same communication. The price is a four times larger effective batch, which can change optimization behaviour.

</details>

### 2. Does every worker send exactly 2(W-1)/W x S?

Run `ring_allreduce` with W = 5 and a buffer of length 1003, and print `sent`. Compare with the formula. Is the algorithm still correct?

<details><summary>Answer</summary>

`sent` is `[1604, 1605, 1606, 1605, 1604]`, while the formula gives 1604.8. 1003 does not divide by 5, so `np.array_split` makes chunks of 201 or 200 elements, and different workers happen to send different chunks at different steps. The totals differ by a couple of elements, which is negligible; the result is still the exact sum (the correctness table in step 2 includes this case).

</details>

### 3. When does ring latency matter?

Add a per-step latency term: ring time is `2(W-1) x alpha + 2(W-1)/W x S / bandwidth`. For a 1 MB buffer, 100 GB/s links and an assumed `alpha` = 10 microseconds, compute the time at W = 8 and W = 64 and say which term dominates.

<details><summary>Answer</summary>

W = 8: latency term 2 x 7 x 10 us = 140 us; bandwidth term 2 x (7/8) x 1e6 / 1e11 = 17.5 us; total 157.5 us. W = 64: 1,260 us + 19.7 us = about 1,280 us. For small messages the latency term dominates and grows linearly with W, which is why gradient all-reduces are done on large fused buckets rather than per tensor,, and is one reason alternatives to the ring exist.

</details>

### 4. Choose the accumulation steps

You have 8 GPUs, each fits a micro-batch of 4, and your recipe calls for a global batch of 256. How many accumulation steps per optimizer step? How many all-reduces per optimizer step if you accumulate under `no_sync()` and only synchronise on the last micro-batch?

<details><summary>Answer</summary>

256 / (4 x 8) = 8 accumulation steps. With synchronisation only on the final micro-batch there is 1 all-reduce per optimizer step (instead of 8).

</details>

### Checkpoint quiz

1. What is exchanged between GPUs in data parallelism, and how often?
2. Why do the replicas stay identical without ever exchanging weights?
3. Per-worker traffic for a ring all-reduce of S bytes with W workers?
4. Name two reasons adding GPUs gives diminishing returns.
5. Why does data parallelism not let you train a model that does not fit on one GPU?

<details><summary>Answers</summary>

1. Gradients, via one all-reduce per optimizer step (per bucket, overlapped with backward in DDP).
2. They start from identical weights and apply an identical update (the averaged gradient with the same optimizer), so their weights stay identical; DDP broadcasts rank 0's weights at start-up to guarantee the identical start.
3. 2(W-1)/W x S sent and the same received: under 2S for any W.
4. Communication per GPU does not shrink as W grows; the slowest link (often between servers) sets its speed; with a fixed global batch the per-GPU compute shrinks; ring latency grows with W; the global batch grows and may need tuning.
5. Each GPU holds the full parameters, gradients and optimizer state, so per-GPU memory does not drop as W grows.

</details>

> [!check]
> - I can list the four stages of a data-parallel step and name the one that communicates.
> - I can explain why shard-mean-of-means equals the full-batch mean, and when it does not.
> - I can compute effective batch size from micro-batch, accumulation steps and GPU count.
> - I can derive the ring all-reduce traffic 2(W-1)/W x S and explain why it beats a single-root scheme.
> - I can say why a bigger per-GPU batch improves scaling efficiency.

## Project

Build a **mini data-parallel trainer** in numpy, with no starting code. Train logistic regression (or a small network) on synthetic data with W simulated workers, using your *own* ring all-reduce to average gradients, and show your trainer matches single-process training on the same batches.

Deliver:
1. Correct handling of a dataset size that does not divide evenly into shards (use size-weighted averaging) and a demonstration of the error if you do not.
2. A check that final parameters equal single-process full-batch training to float tolerance, and that all replicas are identical.
3. A counter for the elements each worker sends per step, matching 2(W-1)/W x S.
4. A table of modelled step time for W = 1 to 64 under a link model you define, with your assumptions written out, comparing no-overlap against an overlap bound.

## Interview questions

> [!interview]
> Explain how data parallelism works and what a training step communicates.

<details><summary>What a strong answer covers</summary>

- Full model replica per GPU, different data shard per GPU, local forward/backward, all-reduce average of gradients, identical optimizer step.
- Mathematically equal to large-batch training because the loss is a mean (equal-size shards; weight otherwise).
- One collective per step on a buffer the size of the gradients; DDP buckets it and overlaps it with backward.
- Replicas are kept consistent by identical initial weights plus identical updates, not by exchanging weights.

</details>

> [!interview]
> Why is ring all-reduce used instead of having every GPU send its gradients to one GPU?

<details><summary>What a strong answer covers</summary>

- A single root must receive and send (W-1) buffers, so it is a bottleneck that grows with W; a ring spreads the load evenly.
- Ring all-reduce = reduce-scatter + all-gather; each worker sends 2(W-1)/W x S, nearly independent of W, and all links work at once, which is bandwidth-optimal.
- Honest trade-off: 2(W-1) sequential steps means latency grows with W, so small messages can favour other algorithms such as tree-based all-reduce.

</details>

> [!interview]
> Your job scales from 8 to 64 GPUs but runs only about 3x faster. How do you diagnose it?

<details><summary>What a strong answer covers</summary>

- Check whether the added GPUs sit across a slower link (servers over a network) than the original 8.
- Compare time in compute vs communication in a profiler; look at whether all-reduce overlaps with backward and at bucket sizes.
- Per-GPU batch may have shrunk (strong scaling), cutting compute but not communication; try gradient accumulation.
- Check stragglers and data loading, and that the larger global batch has not changed convergence.
- Remember the model-size limit: if the model is large, communication volume (about 2x gradient size per step) is large too.

</details>

## Common mistakes & troubleshooting

- **Averaging shard gradients with unequal shards.** Measured error 0.12 in step 1, versus 2e-16 when weighted. A ragged last batch is the usual cause.
- **Treating `batch_size` as global.** In DDP the DataLoader batch size is per process, so the optimizer sees `batch_size x world_size`. Changing the GPU count silently changes the global batch and often the best learning rate.
- **Replicas that disagree.** If workers start from different weights, or one skips an update, they never re-synchronise. DDP broadcasts rank 0's state at construction; custom loops must do the equivalent.
- **Forgetting `sampler.set_epoch(epoch)`.** `DistributedSampler` uses the epoch to seed its shuffle; without it every epoch repeats the same order.
- **Extrapolating the toy scaling model.** Step 3 assumes one uniform link and no overlap. Measure on your own hardware before planning a run.

## Further reading & sources

- [PyTorch Distributed: Experiences on Accelerating Data Parallel Training](https://arxiv.org/abs/2006.15704) - the DDP paper: gradient bucketing (25 MB default), overlap of communication with backward, rank-0 broadcast, `no_sync`.
- [Horovod: fast and easy distributed deep learning in TensorFlow](https://arxiv.org/abs/1802.05799) - clear description of ring all-reduce (2(N-1) exchanges, bandwidth-optimal) and why it replaced parameter servers.
- [NCCL documentation: Collective Operations](https://docs.nvidia.com/deeplearning/nccl/user-guide/docs/usage/collectives.html) - the definitions of AllReduce, ReduceScatter and AllGather used throughout this module.
- [PyTorch notes: Distributed Data Parallel](https://docs.pytorch.org/docs/stable/notes/ddp.html) - official explanation of how DDP buckets and reduces gradients.
- [Getting Started with Distributed Data Parallel (PyTorch tutorial)](https://docs.pytorch.org/tutorials/intermediate/ddp_tutorial.html) - the runnable DDP / `torchrun` pattern the (unexecuted) skeleton above follows.
- [NVIDIA A100 Tensor Core GPU datasheet](https://www.nvidia.com/content/dam/en-zz/Solutions/Data-Center/a100/pdf/nvidia-a100-datasheet-us-nvidia-1758950-r4-web.pdf) - source of the 600 GB/s NVLink and 64 GB/s PCIe Gen4 figures in the step-time model (checked Oct 2026).

## Next

[Module 10: Model and Tensor Parallelism](../10-model-and-tensor-parallelism/README.md)
