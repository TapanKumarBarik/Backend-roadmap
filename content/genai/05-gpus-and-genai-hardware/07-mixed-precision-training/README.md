# Module 07: Mixed Precision Training

## Roadmap

You are in Track 05, GPUs & GenAI Hardware. [Module 05](../05-calculating-a-models-memory-requirements/README.md) showed that training needs about 16 bytes per parameter, including an FP32 "master" copy of the weights, and promised an explanation. [Module 06](../06-numeric-formats-fp32-fp16-bf16/README.md) showed what FP16 and BF16 can and cannot represent. This module puts the two together: why training mixes precisions, what the three standard tricks do (FP32 master weights, loss scaling, FP32 for sensitive operations), and how to use them. [Module 08](../08-flashattention-and-memory-efficient-kernels/README.md) then attacks the other big training cost, attention memory.

Prerequisites: Modules 05 and 06 (you will reuse `floatbits.py` from Module 06), and the idea of a training step: forward pass, loss, backward pass, optimizer update.

After this module you can:

- Explain why mixed precision exists and what it does and does not save.
- Demonstrate, with numbers, why a pure-FP16 weight update stalls and why small FP16 gradients become zero.
- Explain loss scaling, including the dynamic version, and why BF16 usually does not need it.
- Say which operations stay in FP32 under autocast and why.
- Write a PyTorch autocast training step for FP16 and for BF16.

## Concept

> [!key] Mixed-precision training does the heavy matrix math in a fast 16-bit format and keeps the numerically fragile parts in FP32: a master copy of the weights so tiny updates are not lost, FP32 for reductions, softmax and the loss, and (for FP16 only) a loss scale that lifts tiny gradients into FP16's range so they do not underflow to zero. BF16 has FP32's range, so it usually needs no loss scale.

## Explanation

### Why mixed precision exists

Two payoffs, one real cost.

- **Speed.** GPU Tensor Cores run 16-bit matrix multiplies far faster than FP32 ones. The A100 datasheet (checked Oct 2026) lists 19.5 TFLOPS for FP32 and 312 TFLOPS for FP16 and BF16 Tensor Core math, dense: a peak ratio of 16. Real speedups are smaller, because not all time is spent in matrix multiplies.
- **Memory and bandwidth.** Activations stored in 16 bits take half the space and half the memory traffic. The original mixed-precision paper notes that training memory is dominated by activations, so the overall footprint is roughly halved.
- **The cost: it does not shrink the model-state bill.** From Module 05, mixed-precision Adam needs 2 + 2 + 4 + 4 + 4 = 16 bytes per parameter, the same 16 as plain FP32 Adam (4 + 4 + 4 + 4). The master copy actually increases weight storage by 50% compared with FP32-only training, as the paper points out, but the saving on activations outweighs it.

Why not train entirely in FP16? Because three things break, and each trick below fixes one.

### Trick 1: an FP32 master copy of the weights

Training updates weights by tiny amounts: `w = w - lr * grad`. A weight near 1.0 stored in FP16 has neighbors about 0.00049 apart (below 1.0), so any update smaller than half that is rounded away. The paper gives two reasons this bites: updates can fall below FP16's smallest representable magnitude (anything under 2^-24 becomes zero), and when the weight is at least about 2,048 times larger than the update, the update can be shifted out of the 10-bit mantissa entirely.

The fix is to keep the real weights in FP32. Each step: cast the FP32 master weights to 16 bits, run forward and backward with the 16-bit copy, then apply the update to the FP32 master. The 16-bit copy is just a view of the master for the fast math. The paper's Mandarin speech experiment shows the stakes: updating FP16 weights directly lost 80% relative accuracy, while the FP32 master copy matched FP32 training.

### Trick 2: loss scaling (for FP16)

During the backward pass the gradients flowing back are often tiny, with magnitudes far below FP16's smallest normal value (6.1e-5) and, for many entries, below its smallest subnormal (6.0e-8), where they flush to zero. The paper observes that gradient values tend to be dominated by small magnitudes, shows a histogram where much of FP16's range goes unused while many gradients fall below its floor, and notes that gradient values in the range 2^-27 to 2^-24 mattered for the network it studied.

**Loss scaling** multiplies the loss by a constant `S` before the backward pass. By the chain rule every gradient in the network is then multiplied by `S` too, which slides the whole distribution up into the representable range. Then, before the optimizer or any clipping, the weight gradients are divided by `S` again (in FP32). If `S` is a power of two the multiplication and division are exact. No extra work is done during the backward pass itself.

Too large an `S` is just as bad: scaled values can exceed 65,504 and become `inf`, and an `inf` in a gradient would wreck the weights. So:

- A **static** scale is one constant chosen by trial, or so that `S` times the largest gradient stays under 65,504. The paper used constants from 8 to 32K.
- A **dynamic** scale starts high, checks every step whether any gradient is `inf` or NaN, and if so skips the weight update and lowers `S`; after a streak of clean steps it raises `S` again. PyTorch's `GradScaler` defaults are an initial scale of 65,536, growth factor 2, backoff factor 0.5, and a growth interval of 2,000 steps. NVIDIA's guide notes, in a TensorFlow FAQ entry, that most skipped steps occur at the beginning of training (usually fewer than ten).

### Why BF16 usually does not need it

BF16 has the same 8-bit exponent as FP32, so its range runs down to about 1e-38. Gradients that would underflow in FP16 are ordinary numbers in BF16, and there is nothing to scale up into range. The BF16 study reports FP32-equivalent results across image, speech, language and recommendation workloads in the same number of iterations and with no hyperparameter changes, and contrasts that with FP16's need to tune a loss-scaling hyperparameter.

The trade-off, as Module 06 showed, is precision: 7 mantissa bits instead of 10. You still keep FP32 master weights and FP32 accumulation, because absorbing small updates is a precision problem, not a range problem. Listing 2 measures both effects.

> [!model] Range and precision are different budgets. Loss scaling fixes a range problem (tiny gradients below the floor) by shifting the numbers, which costs nothing in precision. Master weights fix a precision problem (small updates vanishing next to big weights) by using a wider format where the arithmetic happens. FP16 has a range problem and a precision problem; BF16 has only the precision problem, so it needs only the second fix.

### Autocast: a per-operation dtype policy

In practice you do not hand-convert tensors. PyTorch's `torch.autocast` is a context manager that chooses a dtype *per operation* while the model's parameters stay in FP32 (the PyTorch documentation warns against calling `.half()` or `.bfloat16()` on the model when using autocast). From the documentation for CUDA:

- Ops that run in 16 bits because they are matrix-multiply shaped and benefit most: `linear`, `matmul`, `mm`, `bmm`, `addmm`, and the convolutions.
- Ops that autocast to FP32 because they are range- or accumulation-sensitive: `softmax`, `log_softmax`, `cross_entropy`, `nll_loss`, `layer_norm`, `group_norm`, `exp`, `log`, `pow`, `sum`, `prod`, `cumsum`, `norm`, `mse_loss`, and others.
- Ops that take several inputs and "promote to the widest": if any input is FP32 the op runs in FP32.

Why those in FP32? You have seen the reasons: `exp` overflows in FP16 (Module 06's softmax example), long sums absorb small terms (the accumulation example), and the loss combines both. The mixed-precision paper says the same about reductions: large sums, such as those in batch-norm statistics and softmax, should be carried out in FP32, and matrix products should accumulate their 16-bit products into FP32, which Tensor Cores do.

The documentation also records that backward ops run in the same dtype autocast chose for the corresponding forward ops, and recommends running only the forward pass and the loss inside the autocast region, with `backward()` outside it.

| Stays in FP32 | Why |
|---------------|-----|
| Master weights, optimizer states (Adam `m` and `v`) | tiny updates must not be absorbed |
| Matmul accumulators | thousands of products are summed per output element |
| Softmax, log-softmax, cross-entropy, loss value | `exp` overflow and long sums |
| Layer-norm statistics | mean and variance are reductions |
| The loss scale and the overflow check | they must hold values far outside FP16's range |

> [!pitfall] Four traps. (1) Clipping before unscaling: gradients are still multiplied by `S`, so your clip threshold is wrong by that factor; call `scaler.unscale_(optimizer)` first (the PyTorch docs show this). (2) Calling `.half()` on the model and using autocast: the parameters are then 16-bit and the master-weight protection is gone. (3) Using `binary_cross_entropy` under autocast: PyTorch raises an error because its backward can produce gradients that FP16 cannot represent; use `binary_cross_entropy_with_logits`. (4) Expecting loss scaling to rescue a *forward-pass* overflow: it rescales gradients only, so a forward `inf` needs FP32 for that op or BF16.

## Code

Listings 1 and 2 use numpy only and import `floatbits.py` from [Module 06, listing 1](../06-numeric-formats-fp32-fp16-bf16/README.md). Outputs were produced by running them with Python 3.13 and numpy 2.4. Listing 3 needs PyTorch and a GPU and was **not executed**.

### Listing 1: why FP16 weights need an FP32 master copy

A weight of 1.0 receives 1,000 updates of 1e-4 each; the ideal result is 0.9.

```python
import numpy as np
from floatbits import to_bf16

update = 1e-4          # what one optimizer step wants to subtract from a weight of 1.0
steps = 1000           # ideal result: 1.0 - 1000 * 1e-4 = 0.9

w32 = np.float32(1.0)
w16 = np.float16(1.0)
wbf = np.float32(1.0)  # holds a value that is always rounded to bf16 precision
for _ in range(steps):
    w32 = w32 - np.float32(update)
    w16 = np.float16(w16 - np.float16(update))
    wbf = to_bf16(wbf - np.float32(update))

print("ideal result      : 0.9")
print("fp32 weight       :", float(w32))
print("fp16 weight       :", float(w16), "  <- stuck: each update is below half the fp16 spacing near 1")
print("bf16 weight       :", float(wbf), "  <- stuck too: bf16 spacing near 1 is even coarser")
print("fp16 spacing below 1.0:", float(np.float16(1.0) - np.nextafter(np.float16(1.0), np.float16(0))))
```

Output:

```
ideal result      : 0.9
fp32 weight       : 0.8999834060668945
fp16 weight       : 1.0   <- stuck: each update is below half the fp16 spacing near 1
bf16 weight       : 1.0   <- stuck too: bf16 spacing near 1 is even coarser
fp16 spacing below 1.0: 0.00048828125
```

> [!example] The FP32 weight reaches about 0.9 (the 1.7e-5 shortfall is FP32's own rounding over 1,000 steps). The FP16 and BF16 weights never move: the 1e-4 update is below half the spacing (0.00049 for FP16) and rounds back to 1.0 every time. A master copy in FP32 removes the problem.

### Listing 2: gradient underflow, loss scaling, and a dynamic scaler

The setup: linear regression `y = X w` on 2^20 rows, with a loss that is the *mean* over all rows, so each row's gradient `dL/dy = 2 * residual / N` is tiny (about 1e-8 late in training). This mimics why per-token gradients are tiny in LLM training, where one step averages over a very large number of tokens. FP16 and BF16 matrix products accumulate in FP32 and round their results to 16 bits, like Tensor Cores. Part 1 isolates the backward pass: it measures what happens to the gradient at one late-training snapshot as the loss scale changes (the forward residual is computed exactly here, so only the gradient's trip through 16 bits is measured). Part 2 trains for 60 steps with FP32 master weights in every row. It takes about 20 seconds.

```python
import numpy as np
from floatbits import to_bf16

np.seterr(all="ignore")                       # inf/NaN are part of the story; don't print warnings
f16, f32 = np.float16, np.float32

# Linear regression y = X @ w on 2**20 rows. The loss is a MEAN over all rows, so each row's
# gradient dL/dy = 2*residual/N is tiny: the same reason per-token gradients are tiny in LLM training.
N, D = 2 ** 20, 8
rng = np.random.default_rng(0)
X = rng.normal(size=(N, D)).astype(f32)
w_true = rng.normal(size=D).astype(f32)
T = X @ w_true
X16, Xbf = X.astype(f16), to_bf16(X)


def backward(w, scale, fmt):
    """One forward+backward. Returns (loss, gradient in fp32 after unscaling, all finite?)."""
    if fmt == "fp32":
        r = X @ w - T
        return float((r ** 2).mean()), X.T @ (2 * r / N), True
    if fmt == "fp16":                                       # fp16 storage, fp32 accumulation
        y = (X16.astype(f32) @ w.astype(f16).astype(f32)).astype(f16)
        r = y.astype(f32) - T                               # loss math stays in fp32
        dy = (2 * r / N * scale).astype(f16)                # scale first, THEN squeeze into fp16
        g = (X16.astype(f32).T @ dy.astype(f32)).astype(f16).astype(f32)
    else:                                                   # emulated bf16
        y = to_bf16(Xbf @ to_bf16(w))
        r = y - T
        dy = to_bf16(2 * r / N * scale)
        g = to_bf16(Xbf.T @ dy)
    return float((r ** 2).mean()), g / scale, bool(np.isfinite(g).all())


# ---- Part 1: one late-training snapshot, many loss scales -----------------------------------
# To isolate the BACKWARD pass, the forward residual r is computed exactly (fp32); only the
# gradient tensors are squeezed into the low-precision format.
w = (w_true + 0.003 * rng.normal(size=D)).astype(f32)       # weights already close to the answer
r = X @ w - T
g_ref = X.T @ (2 * r / N)
print("Part 1: gradient quality at one snapshot (relative error vs the fp32 gradient)")
print(f"{'format':>6s} {'scale':>6s} {'dy == 0':>9s} {'finite?':>8s} {'rel. error':>11s}")
for fmt, ks in (("fp16", (0, 4, 8, 10, 16, 20, 24)), ("bf16", (0, 24))):
    for k in ks:
        s = 2.0 ** k
        if fmt == "fp16":
            dy = (2 * r / N * s).astype(f16)
            g = (X16.astype(f32).T @ dy.astype(f32)).astype(f16).astype(f32)
        else:
            dy = to_bf16(2 * r / N * s)
            g = to_bf16(Xbf.T @ dy)
        ok = bool(np.isfinite(g).all())
        err = np.linalg.norm(g / s - g_ref) / np.linalg.norm(g_ref) if ok else float("nan")
        print(f"{fmt:>6s} {'2^' + str(k):>6s} {100 * (dy == 0).mean():8.1f}% {str(ok):>8s} {err:11.4f}")


# ---- Part 2: full training runs, with a dynamic loss scaler ---------------------------------
class DynamicLossScaler:
    """Same idea as torch.amp.GradScaler: back off on inf/NaN (skip the step), grow after a streak
    of clean steps. torch's defaults are init_scale=65536, growth_interval=2000; this toy uses
    2**24 and 10 so that both behaviours are visible in 60 steps."""
    def __init__(self, init_scale=2.0 ** 24, growth_factor=2.0, backoff_factor=0.5, growth_interval=10):
        self.scale, self.gf, self.bf, self.interval = init_scale, growth_factor, backoff_factor, growth_interval
        self.good, self.skipped = 0, 0

    def update(self, grads_finite):
        if not grads_finite:
            self.scale *= self.bf; self.good = 0; self.skipped += 1
        else:
            self.good += 1
            if self.good == self.interval:
                self.scale *= self.gf; self.good = 0


def train(fmt, scaling, steps=60, lr=0.25):
    w = np.zeros(D, dtype=f32)                              # these ARE the fp32 master weights
    scaler = DynamicLossScaler() if scaling == "dynamic" else None
    scale = {"none": 1.0, "static": 1024.0}.get(scaling)
    losses = []
    for _ in range(steps):
        s = scaler.scale if scaler else scale
        loss, g, ok = backward(w, s, fmt)
        losses.append(loss)
        if scaler:
            scaler.update(ok)
        if ok:
            w -= lr * g                                     # update happens in fp32
    skipped = scaler.skipped if scaler else 0
    return losses, skipped, float(np.abs(w - w_true).max())


print()
print("Part 2: 60 SGD steps from w = 0 (fp32 master weights in every row)")
print(f"{'format':>6s} {'loss scaling':>13s} {'loss@10':>10s} {'loss@30':>10s} {'loss@59':>10s} {'skipped':>8s} {'max|w-w*|':>10s}")
for fmt, scaling in (("fp32", "none"), ("fp16", "none"), ("fp16", "static"), ("fp16", "dynamic"), ("bf16", "none")):
    L, skipped, err = train(fmt, scaling)
    print(f"{fmt:>6s} {scaling:>13s} {L[10]:10.2e} {L[30]:10.2e} {L[59]:10.2e} {skipped:8d} {err:10.2e}")
```

Output:

```
Part 1: gradient quality at one snapshot (relative error vs the fp32 gradient)
format  scale   dy == 0  finite?  rel. error
  fp16    2^0     94.8%     True      0.5327
  fp16    2^4      9.7%     True      0.0002
  fp16    2^8      0.6%     True      0.0002
  fp16   2^10      0.2%     True      0.0002
  fp16   2^16      0.0%     True      0.0002
  fp16   2^20      0.0%     True      0.0002
  fp16   2^24      0.0%    False         nan
  bf16    2^0      0.0%     True      0.0011
  bf16   2^24      0.0%     True      0.0011

Part 2: 60 SGD steps from w = 0 (fp32 master weights in every row)
format  loss scaling    loss@10    loss@30    loss@59  skipped  max|w-w*|
  fp32          none   1.19e-05   1.74e-13   1.74e-13        0   2.38e-07
  fp16          none   3.91e-05   1.26e-05   1.26e-05        0   2.47e-03
  fp16        static   1.99e-05   2.23e-06   3.51e-06        0   3.20e-04
  fp16       dynamic   1.20e+01   2.23e-06   2.23e-06       11   3.21e-04
  bf16          none   1.05e-04   1.22e-04   1.20e-04        0   5.44e-03
```

How to read it:

- **Underflow (Part 1, `dy == 0`).** With no scaling, 94.8% of the per-row gradients are exactly zero in FP16, and the gradient the optimizer would see is 53% wrong. A scale of just 2^4 brings the zeros down to 9.7% and the error to 0.0002; from 2^4 up, the result is as good as FP16 can make it.
- **Overflow (Part 1, last FP16 row).** At 2^24 the scaled weight gradient exceeds 65,504 and becomes `inf`. A back-of-envelope bound agrees: the largest entry of the reference gradient is 0.0085, and 65,504 / 0.0085 is about 7.7 million, between 2^22 and 2^23. (Rerunning at those two scales gave finite results at 2^22 and `inf` at 2^23.) There is a window of safe scales, and a dynamic scaler's job is to ride its upper edge.
- **BF16 (Part 1).** No zeros at scale 1, and scaling by 2^24 changes nothing, because a power-of-two scale only shifts the exponent, which BF16 has room for. Its error (0.0011) is larger than properly scaled FP16's (0.0002): fewer mantissa bits.
- **Training (Part 2).** Without scaling, FP16 stalls at a loss of about 1.3e-5 and ends 2.5e-3 from the true weights; with a static scale of 1024 or the dynamic scaler it gets to about 2 to 4e-6 and 3.2e-4. The dynamic run started at 2^24, skipped its first 11 steps while backing off (its loss stays at 12.0 through step 10), and then trained normally. None of the FP16 runs reaches FP32's 1.7e-13, because the *forward* pass in FP16 has rounding noise that scaling cannot touch. BF16 needed no scaling but settles at a higher loss (about 1.2e-4) from its coarser mantissa. This toy regression has a noise-free target, which is the harshest test of precision; real training losses are far above these floors.

### Listing 3: the same ideas in PyTorch (not executed)

This listing needs `torch` and a CUDA GPU. Neither was available when this module was written, so it was **not executed** and no output is shown. It follows the patterns in the official PyTorch AMP documentation (checked Oct 2026).

```python
import torch

model = MyModel().cuda()                          # parameters stay in FP32: these are the master weights
optimizer = torch.optim.AdamW(model.parameters(), lr=1e-4)
scaler = torch.amp.GradScaler("cuda")             # defaults: init_scale=65536, growth_interval=2000

for inputs, targets in loader:
    optimizer.zero_grad()
    with torch.autocast(device_type="cuda", dtype=torch.float16):
        outputs = model(inputs)                   # matmuls in FP16; softmax, norms and loss in FP32
        loss = loss_fn(outputs, targets)
    scaler.scale(loss).backward()                 # backward is called outside the autocast block
    scaler.unscale_(optimizer)                    # gradients back to real units, in place
    torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)   # now the clip threshold means what you think
    scaler.step(optimizer)                        # skips optimizer.step() if any gradient is inf/NaN
    scaler.update()                               # lower or raise the scale for the next step

# BF16 variant: no scaler is needed. The loop body becomes
#   with torch.autocast(device_type="cuda", dtype=torch.bfloat16):
#       loss = loss_fn(model(inputs), targets)
#   loss.backward()
#   optimizer.step()
```

## Visual diagram

One FP16 mixed-precision training step. Boxes marked `FP32` stay wide; the 16-bit lane is where the speed comes from.

```
   FP32 master weights ───── cast ─────► 16-bit weights
          ▲                                   │
          │                                   ▼  forward (autocast)
          │                      matmuls in 16 bits; softmax / norms / loss in FP32
          │                                   │
          │                                   ▼
          │                          loss (FP32)  ──►  × S  (loss scale)
          │                                   │
          │                                   ▼  backward: every gradient is × S
          │                         16-bit gradients, now lifted above the underflow floor
          │                                   │
          │                                   ▼
          │                  ÷ S in FP32 ("unscale")  ──►  any inf / NaN ?
          │                                                 │            │
          │                                       no: clip, step      yes: skip step,
          └────── optimizer updates FP32 weights ◄──────────┘          S ← S / 2
                  (Adam m, v also FP32)
                                                every N clean steps:  S ← S × 2
```

Where gradient magnitudes sit relative to FP16's range (one character is one power of two; listing 2's late-training per-row gradients are around 2^-26 and its largest weight-gradient entries around 2^-7):

```
 power of two          -32     -24     -16     -8      0       8       16
                       │       │       │       │       │       │       │
 FP16 can store        0000000sssssssssssnnnnnnnnnnnnnnnnnnnnnnnnnnnnnn!!!
                       0 flushed to zero · s subnormal (few bits) · n normal · ! overflow to inf

 per-row dy, S = 1       ▓▓▓▓▓▓▓▓▓
 per-row dy, S = 2^10              ▓▓▓▓▓▓▓▓▓
 biggest weight-grad                           ███
  entry, S = 2^22 (ok)                                               ███
  entry, S = 2^23 (inf)                                               ███
```

## Practice

### 1. A bigger update

In listing 1, change `update` to `1e-3` and `steps` to 500 (ideal result 0.5). Predict first: does the FP16 weight still get stuck? Then run it.

<details><summary>Answer</summary>

It does not get stuck: 1e-3 is larger than half the FP16 spacing near 1 (0.00049 / 2), so each update registers, but it is rounded to a multiple of the spacing, so the result drifts. Running it gave an FP16 weight of 0.5117 against 0.5000 in FP32 (ideal 0.5): a 2.3% error that accumulates. Stalling happens when updates are under half the spacing; rounding error appears when they are merely close to it. A master copy avoids both.

</details>

### 2. Pick a constant loss scale

The largest entry of the fp32 weight gradient in listing 2's snapshot is 0.0085. Using the rule "choose `S` so that `S` times the largest gradient stays below 65,504", what is the largest power-of-two scale? Confirm against listing 2.

<details><summary>Answer</summary>

65,504 / 0.0085 is about 7.7e6. Powers of two: 2^22 = 4.19e6 is below that and 2^23 = 8.39e6 is above, so the largest safe power of two is 2^22. Re-running Part 1's gradient computation at 2^21, 2^22 and 2^23 gave a largest scaled gradient entry of about 17,800, 35,600 and 71,200: finite for the first two and over the FP16 limit (`inf`) at 2^23. In practice you would stay well below this edge, because gradients change during training, which is why dynamic scaling exists.

</details>

### 3. Starting scale of the dynamic scaler

Run the dynamic scaler from listing 2 with initial scales 2^10, 2^16 (PyTorch's default) and 2^24, and count the skipped steps in 60 steps. Why do the counts differ and why do skips happen early?

<details><summary>Answer</summary>

Observed: initial 2^10 skips 0 steps; 2^16 skips 3 (steps 0, 1, 2); 2^24 skips 11 (steps 0 to 10). Early in training the residuals, and so the gradients, are largest (the loss is about 12 at the start), so a high scale overflows immediately; each skip halves the scale until it fits. Later the gradients shrink, and the scaler grows `S` again after every 10 clean steps. NVIDIA's guide makes the same point in a TensorFlow FAQ entry: skips mostly happen at the start. A skipped step does not update the weights, so a few skips are harmless; a scale that never stops collapsing indicates a real problem (see troubleshooting).

</details>

### 4. Which ops run in FP32?

Under CUDA autocast, which of these run in 16 bits and which in FP32: `linear`, `softmax`, `matmul`, `layer_norm`, `conv2d`, `cross_entropy`, `sum`, `exp`?

<details><summary>Answer</summary>

16 bits: `linear`, `matmul`, `conv2d` (matrix-multiply-shaped, benefit most). FP32: `softmax`, `layer_norm`, `cross_entropy`, `sum`, `exp` (range- or accumulation-sensitive). This follows the op lists in the PyTorch autocast documentation, which are version-specific, so check them for your release.

</details>

### Checkpoint quiz

1. Why does a pure-FP16 weight update stall, and what is the fix?
2. What does loss scaling do mathematically, and why must gradients be unscaled before the optimizer and before clipping?
3. What does a dynamic loss scaler do on an overflow, and after a streak of clean steps?
4. Why does BF16 usually not need loss scaling, and what does it give up?
5. Does mixed precision reduce the 16 bytes per parameter of model states? What does it reduce?

<details><summary>Answers</summary>

1. Updates smaller than half the spacing between FP16 values near the weight round away. Keep FP32 master weights, update those, and cast to 16 bits for the forward and backward passes.
2. It multiplies the loss by `S`; by the chain rule every gradient is multiplied by `S`, lifting small gradients above FP16's underflow floor. The optimizer and clipping must see true-scale gradients, so divide by `S` first (in FP32) or learning rates, weight decay and clip thresholds are all off by a factor of `S`.
3. On overflow (`inf` or NaN in the gradients) it skips the weight update and lowers the scale (by 0.5 in PyTorch by default); after a streak of clean steps (2,000 by default) it raises it (by 2).
4. BF16 has FP32's exponent range, so small gradients do not underflow. It gives up mantissa precision (7 bits versus 10), so FP32 master weights and accumulation are still used.
5. No: 16 bytes per parameter either way (Module 05). It reduces activation memory (16-bit storage) and speeds up matrix math.

</details>

> [!check]
> - I can explain why FP16 training needs master weights and loss scaling, and which problem each fixes
> - I can describe how dynamic loss scaling reacts to overflow and to a clean streak
> - I can explain why BF16 usually needs no scaler, and what it costs
> - I can name the operations autocast keeps in FP32 and say why
> - I can write the PyTorch loop for FP16 (autocast plus `GradScaler`, with `unscale_` before clipping) and for BF16

## Project

Build a small mixed-precision trainer in numpy that makes each trick visible by breaking it.

Requirements:

- A model of your choice (a two-layer MLP on a synthetic classification or regression task is enough), written with explicit forward and backward passes, using `floatbits.to_bf16` and `np.float16` to emulate 16-bit storage with FP32 accumulation.
- Four ablations, reported in one table of final loss: (a) full FP32; (b) FP16 compute with FP32 master weights and dynamic loss scaling; (c) the same but with the loss scale fixed at 1; (d) FP16 weights updated directly with no master copy. Add BF16 with no scaler as a fifth row.
- A `DynamicLossScaler` you write yourself that logs every skipped step, with the scale before and after.
- An experiment that injects an overflow (for example a large input in a single batch) and shows the scaler skipping that step and recovering.
- Choose sizes and learning rates so that the ablations *differ*; if (c) and (b) give the same loss, your gradients are not small enough to underflow, and you should explain how you changed that.

There is no reference solution.

## Interview questions

> [!interview] Walk through one iteration of FP16 mixed-precision training. Say where the loss scale and the master weights appear.

<details><summary>What a strong answer covers</summary>

Cast the FP32 master weights to FP16 and run the forward pass under autocast (matmuls in FP16, softmax, norms and loss in FP32). Multiply the loss by the scale `S` and run backward, so FP16 gradients are lifted above the underflow floor. Unscale (divide by `S`, in FP32), check for `inf` or NaN; if found, skip the update and lower `S`. Otherwise clip if desired and apply the optimizer step to the FP32 master weights, whose Adam state is also FP32. Every so often raise `S`. A strong answer says why each step exists, not just what it is.

</details>

> [!interview] Why does FP16 training need loss scaling while BF16 training usually does not?

<details><summary>What a strong answer covers</summary>

It is a range problem. FP16's 5-bit exponent puts its floor near 6e-8 (subnormal) and 6e-5 (normal); gradients are often smaller, so they flush to zero. Multiplying the loss shifts them up. BF16 shares FP32's 8-bit exponent, so those gradients are representable as they are. BF16's cost is precision, which is why master weights and FP32 accumulation remain. A strong answer also mentions the limit on the other side: too large a scale overflows to `inf`, hence the dynamic scheme.

</details>

> [!interview] Mixed precision "halves memory", yet people say training still needs about 16 bytes per parameter. Reconcile the two.

<details><summary>What a strong answer covers</summary>

Mixed precision halves *activation* memory and the cost of 16-bit tensors, but it adds a master copy of the weights. The parameter-sized tensors still add up to 2 (16-bit weights) + 2 (gradients) + 4 (master) + 4 + 4 (Adam) = 16 bytes, the same as FP32 Adam's 4 + 4 + 4 + 4. So the saving is in activations (large at big batch and sequence length) and in speed, not in model states; reducing those needs sharding, freezing parameters, or lower-memory optimizers.

</details>

## Common mistakes & troubleshooting

| Symptom | Likely cause | What to do |
|---------|--------------|------------|
| Loss is NaN from the first steps in FP16 but fine in FP32 | A forward-pass overflow; loss scaling does not rescale the forward pass | Find the op that produces `inf` (check activation maxima), keep it in FP32, or use BF16 |
| The loss scale keeps shrinking toward 1 and almost every step is skipped | A persistent source of `inf` or NaN in the gradients or inputs (bad batch, exploding activations, learning rate too high) | Inspect the first skipped step; check the data and the learning rate; a handful of skips at the start is normal |
| Loss stalls in FP16 but not in FP32 | Gradients underflowing (scale too small or no scaler) or weights updated in 16 bits | Enable or raise the loss scale; make sure the optimizer updates FP32 master weights |
| Gradient clipping seems to do nothing, or too much | Clipping scaled gradients | Call `scaler.unscale_(optimizer)` before `clip_grad_norm_` |
| `RuntimeError` mentioning `unscale_` called twice | `unscale_` called more than once per optimizer step | Call it once, after all gradients are accumulated |
| `binary_cross_entropy` raises an error inside autocast | Its backward can produce gradients FP16 cannot represent | Use `binary_cross_entropy_with_logits` |
| Training with BF16 and a `GradScaler` | Unnecessary machinery | For BF16 use autocast alone, as the PyTorch docs' CPU bfloat16 example does |
| Little or no speedup from autocast | The model is small or dominated by memory-bound operations, not large matrix multiplies | Profile; autocast speeds up Tensor Core matmuls, not everything |

## Further reading & sources

- [Mixed Precision Training](https://arxiv.org/abs/1710.03740) - the original FP16 recipe: FP32 master weights, loss scaling, FP32 accumulation; the source of the update-underflow and gradient-histogram arguments used throughout.
- [A Study of BFLOAT16 for Deep Learning Training](https://arxiv.org/abs/1905.12322) - the evidence that BF16 trains to FP32 accuracy with no loss scaling and no hyperparameter changes.
- [Train With Mixed Precision (NVIDIA Deep Learning Performance guide)](https://docs.nvidia.com/deeplearning/performance/mixed-precision-training/index.html) - NVIDIA's practical guide, including constant and dynamic loss scaling and the FAQ on skipped steps.
- [PyTorch: Automatic Mixed Precision package, torch.amp](https://docs.pytorch.org/docs/stable/amp.html) - official reference for `autocast` and `GradScaler`, including the op lists by precision and the `GradScaler` defaults.
- [PyTorch: Automatic Mixed Precision examples](https://docs.pytorch.org/docs/stable/notes/amp_examples.html) - official training-loop patterns, including `unscale_` before gradient clipping, which listing 3 follows.
- [ZeRO: Memory Optimizations Toward Training Trillion Parameter Models](https://arxiv.org/abs/1910.02054) - the 2 + 2 + K accounting that shows mixed precision leaves model-state memory at 16 bytes per parameter.
- [NVIDIA A100 datasheet](https://www.nvidia.com/content/dam/en-zz/Solutions/Data-Center/a100/pdf/nvidia-a100-datasheet-us-nvidia-1758950-r4-web.pdf) - source of the FP32 versus FP16 and BF16 Tensor Core peak figures quoted in the speed paragraph.

## Next

[Module 08: FlashAttention and Memory-Efficient Kernels](../08-flashattention-and-memory-efficient-kernels/README.md)
