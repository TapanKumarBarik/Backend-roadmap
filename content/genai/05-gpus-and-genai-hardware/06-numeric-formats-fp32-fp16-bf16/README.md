# Module 06: Numeric Formats: FP32, FP16, BF16

## Roadmap

You are in Track 05, GPUs & GenAI Hardware. [Module 05](../05-calculating-a-models-memory-requirements/README.md) multiplied parameter counts by "bytes per parameter" (4, 2, 1, 0.5) without saying what those bytes contain. This module opens them up: how a 32-bit or 16-bit floating-point number is laid out, what each field buys, and what goes wrong at the edges. [Module 07](../07-mixed-precision-training/README.md) uses this to explain why training mixes formats.

Prerequisites: Module 05, and comfort with binary numbers and powers of two. No ML knowledge needed.

After this module you can:

- Read the sign, exponent and mantissa fields of an FP32, FP16 or BF16 value and rebuild the number from them.
- Explain the trade-off: exponent bits buy range, mantissa bits buy precision.
- Predict overflow, underflow and rounding behavior, including why FP16 turns a harmless number into `inf` where BF16 does not.
- Emulate BF16 with plain numpy and explain what machine epsilon means.

Why it matters: most "mysterious" NaNs and stalled losses in GPU code are one of three things, overflow, underflow, or a value too small to register next to a big one. All three come straight from this layout.

## Concept

> [!key] A floating-point number is a sign, an exponent and a mantissa packed into a fixed number of bits. Exponent bits set the range (how large and small a number can get); mantissa bits set the precision (how finely the numbers between two powers of two are spaced). FP16 has 5 exponent and 10 mantissa bits; BF16 keeps FP32's 8 exponent bits and cuts the mantissa to 7. FP16 is more precise, BF16 has FP32's range.

## Explanation

### A float is scientific notation in binary

Scientific notation writes a number as `1.234 x 10^5`. A binary float does the same with powers of two:

Each normal number's value is `(-1)^sign x 1.mantissa x 2^(exponent - bias)`, where `1.mantissa` is read in binary.

The stored fields are a **sign bit**, an **exponent** (stored with an offset called the *bias*, so it can represent negative powers), and a **mantissa** (also called the fraction or significand): the digits after the point. For a normal number the leading `1.` is *implicit*: it is not stored, which gives one free bit of precision.

| Format | Sign | Exponent | Mantissa | Bias | Bytes | Defined by |
|--------|------|----------|----------|------|-------|------------|
| FP32 (binary32) | 1 | 8 | 23 | 127 | 4 | IEEE 754 |
| FP16 (binary16) | 1 | 5 | 10 | 15 | 2 | IEEE 754 |
| BF16 ("brain float") | 1 | 8 | 7 | 127 | 2 | industry format, see the BF16 paper below |

Two exponent patterns are reserved. All zeros means *zero or a subnormal number*: there is no implicit `1.`, so values fade gently toward zero instead of dropping off a cliff (gradual underflow). All ones means *infinity* (mantissa zero) or *NaN* (not a number, mantissa non-zero). Everything else is a normal number.

**BF16 is the top half of an FP32.** Same sign, same 8 exponent bits, and the first 7 of FP32's 23 mantissa bits. Converting FP32 to BF16 is dropping the low 16 bits (ideally with rounding), which is why it is so cheap in hardware and why the range matches exactly.

### Range versus precision

**Range** comes from the exponent. FP16's exponent covers about 30 binary orders of magnitude: the largest finite value is 65,504 and the smallest normal value is about 6.1e-5 (subnormals reach down to 6.0e-8). FP32 and BF16 cover about 254: up to roughly 3.4e38 and down to about 1.2e-38.

**Precision** comes from the mantissa. Between any two neighboring powers of two (a *binade*) every format has the same number of evenly spaced values: 2^10 = 1,024 for FP16, 2^7 = 128 for BF16, 2^23 = 8,388,608 for FP32. Within `[1, 2)` the spacing is `2^-mantissa_bits`. That spacing at 1.0 is the **machine epsilon**:

- FP32: `2^-23`, about 1.19e-7, roughly 7 decimal digits.
- FP16: `2^-10`, about 9.77e-4, roughly 3 digits.
- BF16: `2^-7`, about 7.81e-3, roughly 2 digits.

Epsilon is the gap, so a number smaller than half of it vanishes when added to 1.0: `1 + eps/2` rounds back to `1` (an exact tie goes to the neighbor with an even last bit).

The spacing is *relative*. In `[2^k, 2^(k+1))` it is `2^(k - mantissa_bits)`, so it doubles every time the magnitude doubles. FP16 values near 2,048 are 2 apart, so 2,049 cannot be stored; BF16 values near 256 are 2 apart, so 257 cannot be stored.

> [!model] A ruler whose tick marks get sparser as you move away from zero, with the same number of ticks between every pair of powers of two. Exponent bits decide how many powers of two the ruler spans; mantissa bits decide how many ticks sit between them. FP16 has a short ruler with fine ticks; BF16 has a long ruler with coarse ticks; FP32 has a long ruler with fine ticks.

### Overflow and underflow

**Overflow** is a result larger than the largest finite value; it becomes `inf`, and arithmetic on `inf` soon yields NaN (`inf - inf`, `0 * inf`, `inf / inf`). FP16 tops out at 65,504, which is small: `300 * 300` already overflows, and `exp(12)` does too. Attention scores, logits and activations in big models can reach such magnitudes. This is why softmax implementations subtract the maximum before exponentiating (listing 4), and why softmax is kept in FP32 under mixed precision (Module 07).

**Underflow** is a result smaller than the smallest representable value; it becomes `0`. FP16 subnormals reach down to about 6.0e-8, and values between that and the smallest normal number (6.1e-5) keep only a few significant bits. Gradients are often tiny, so they underflow first; this is the problem loss scaling solves (Module 07).

BF16 sidesteps both because its range equals FP32's. The price is precision: at 7 mantissa bits it has only about 2 decimal digits, so `90,000` becomes `90,112` and sums of many small numbers drift.

> [!pitfall] BF16 does not have "more accuracy". It has less precision than FP16 and the same range as FP32. Whether that trade is good depends on what breaks first, and for neural-network training range usually does. The BF16 study cited below reports that BF16 removes the need for loss scaling that FP16 mixed precision requires.

### Rounding and accumulation

Every arithmetic result is rounded to the nearest representable value (ties to even). Two consequences show up all the time:

- **Absorption.** Adding a small number to a large one can change nothing: if the small number is under half the local spacing it is rounded away. Adding `1.0` repeatedly stalls once the running sum reaches the point where the spacing is 2: at 2,048 in FP16 and at 256 in BF16. Listing 4 runs this.
- **Conversion mode matters a little.** Going from FP32 to BF16 you can truncate (just zero the low 16 bits, which always rounds toward zero and so is biased) or round to nearest. The BF16 study reports the rounded version essentially matching FP32 accuracy and truncation losing about 0.02% in its recommendation-model experiments. Listing 5 shows the bias directly.

This is the reason large sums (reductions, softmax denominators, optimizer updates) are accumulated in FP32 even when the inputs are 16-bit (Module 07).

### FP8 and INT8, briefly

This is a signpost, not a lesson, and nothing here is demonstrated in the listings. **FP8** has two 8-bit layouts, E4M3 (4 exponent, 3 mantissa bits; largest finite value 448) and E5M2 (5 exponent, 2 mantissa bits; largest finite value 57,344), described in the FP8 formats paper below; the usual pattern is E4M3 for weights and activations and E5M2 for gradients. **INT8** is an integer with evenly spaced values, so it needs a per-tensor or per-group scale factor to cover real-valued weights. Both are about shrinking memory and speeding inference further, and how weights are quantized to INT8 and INT4 is the subject of the [quantization module](../../04-training-fine-tuning-and-alignment/15-quantization-int8-int4-gguf/README.md) in Track 04.

### Which format to use

- **Training:** BF16 where the hardware supports it (the A100 datasheet lists BF16 and FP16 Tensor Core throughput as equal), because its FP32-sized range means you usually do not need loss scaling. FP16 works too, with loss scaling (Module 07).
- **Inference:** FP16 or BF16 are both normal. Published checkpoints say which they were saved in: the `config.json` files of Mistral-7B-v0.1 and Qwen2.5-7B list `"torch_dtype": "bfloat16"`. A model whose values exceed FP16's range can produce `inf` if forced into FP16, so prefer the format the model was trained in.
- **The 2-byte formats are the same size**, so for the memory formulas of Module 05 they are interchangeable; they differ in what can go wrong.

## Code

Everything here uses numpy only (numpy has no BF16 type, so BF16 is emulated). Outputs were produced by running the listings with Python 3.13 and numpy 2.4. Save listing 1 as `floatbits.py`; the rest import it.

### Listing 1: a small toolkit

`to_bf16` keeps the float32 sign, exponent and top 7 mantissa bits, rounding to nearest even by adding half of the dropped part before clearing the low 16 bits. `fields` pulls the three bit fields out of a value. `decode` rebuilds a value from the fields with the textbook formula, so it works as a check on your understanding.

```python
"""floatbits.py - look inside FP32 / FP16 / BF16 (BF16 is emulated on top of float32)."""
import numpy as np


def to_bf16(x, mode="nearest"):
    """Round float32 values to bfloat16 precision, returned as float32.
    mode='nearest': round-to-nearest-even on the dropped 16 bits; mode='truncate': just zero them."""
    a = np.array(x, dtype=np.float32)                  # copy, so the caller's data is untouched
    u = a.view(np.uint32).astype(np.uint64)
    if mode == "nearest":
        u = u + 0x7FFF + ((u >> 16) & 1)               # add half an ULP; ties go to even
    out = ((u >> 16) << 16).astype(np.uint32).view(np.float32)
    out = np.where(np.isnan(a), np.float32("nan"), out)
    return out.astype(np.float32)


def fields(x, fmt):
    """Return (sign, exponent bits, mantissa bits) as strings."""
    if fmt == "fp32":
        s = f"{int(np.float32(x).view(np.uint32)):032b}"
        return s[0], s[1:9], s[9:]
    if fmt == "fp16":
        s = f"{int(np.float16(x).view(np.uint16)):016b}"
        return s[0], s[1:6], s[6:]
    if fmt == "bf16":
        s = f"{int(to_bf16(x).view(np.uint32)):032b}"[:16]
        return s[0], s[1:9], s[9:]
    raise ValueError(fmt)


SPEC = {"fp32": (8, 23), "fp16": (5, 10), "bf16": (8, 7)}   # (exponent bits, mantissa bits)


def decode(sign, exp, man, fmt):
    """Rebuild the value from the three bit fields using the textbook formula."""
    ebits, mbits = SPEC[fmt]
    bias = 2 ** (ebits - 1) - 1
    e, m = int(exp, 2), int(man, 2)
    sgn = -1.0 if sign == "1" else 1.0
    if e == 2 ** ebits - 1:                            # all-ones exponent: inf or NaN
        return sgn * float("inf") if m == 0 else float("nan")
    if e == 0:                                         # subnormal: no implicit leading 1
        return sgn * (m / 2 ** mbits) * 2.0 ** (1 - bias)
    return sgn * (1 + m / 2 ** mbits) * 2.0 ** (e - bias)
```

### Listing 2: the bit fields, and a check of the formula on every FP16 and BF16 pattern

Four values in all three formats, rebuilt from their fields. Then the decoder is compared against numpy for all 65,536 FP16 bit patterns, and against a float32 reading of the top-16-bit pattern for all 65,536 BF16 patterns.

```python
import numpy as np
from floatbits import *

print("value        fmt   sign exponent  mantissa                 decoded by the formula")
for x in (1.0, -2.5, 0.1, 65504.0):
    for fmt in ("fp32", "fp16", "bf16"):
        s, e, m = fields(x, fmt)
        print(f"{x:<12} {fmt}   {s}    {e:<9} {m:<23}  {decode(s, e, m, fmt)!r}")
    print()

# Exhaustive check of the decoder against numpy: every one of the 65,536 FP16 bit patterns
bad = 0
for pattern in range(2 ** 16):
    s = f"{pattern:016b}"
    mine = decode(s[0], s[1:6], s[6:], "fp16")
    ref = float(np.array([pattern], dtype=np.uint16).view(np.float16)[0])
    if not (mine == ref or (np.isnan(mine) and np.isnan(ref))):
        bad += 1
print("fp16: patterns where decoder disagrees with numpy:", bad, "of 65536")

# Same for bf16: a bf16 pattern is the top 16 bits of a float32
bad = 0
for pattern in range(2 ** 16):
    s = f"{pattern:016b}"
    mine = decode(s[0], s[1:9], s[9:], "bf16")
    ref = float(np.array([pattern << 16], dtype=np.uint32).view(np.float32)[0])
    if not (mine == ref or (np.isnan(mine) and np.isnan(ref))):
        bad += 1
print("bf16: patterns where decoder disagrees with float32 reading:", bad, "of 65536")
```

Output:

```
value        fmt   sign exponent  mantissa                 decoded by the formula
1.0          fp32   0    01111111  00000000000000000000000  1.0
1.0          fp16   0    01111     0000000000               1.0
1.0          bf16   0    01111111  0000000                  1.0

-2.5         fp32   1    10000000  01000000000000000000000  -2.5
-2.5         fp16   1    10000     0100000000               -2.5
-2.5         bf16   1    10000000  0100000                  -2.5

0.1          fp32   0    01111011  10011001100110011001101  0.10000000149011612
0.1          fp16   0    01011     1001100110               0.0999755859375
0.1          bf16   0    01111011  1001101                  0.10009765625

65504.0      fp32   0    10001110  11111111110000000000000  65504.0
65504.0      fp16   0    11110     1111111111               65504.0
65504.0      bf16   0    10001111  0000000                  65536.0

fp16: patterns where decoder disagrees with numpy: 0 of 65536
bf16: patterns where decoder disagrees with float32 reading: 0 of 65536
```

> [!example] Read the rows. `1.0` is exponent `01111111` (127, which is the bias, so `2^0`) with an all-zero mantissa. `0.1` is not exactly representable in any of them: FP32 gives 0.10000000149, FP16 0.09997559, BF16 0.10009766, each a different nearest neighbor. And `65504`, the largest finite FP16 value, rounds *up* to `65536` in BF16, because BF16 has only 7 mantissa bits to describe it. The zero disagreements confirm that the formula in the Explanation section is exactly what numpy's `float16` and `float32` do.

### Listing 3: the format table

BF16's numbers are derived from its layout (numpy has no BF16 `finfo`); the FP32 and FP16 rows come from `numpy.finfo`.

```python
import numpy as np

f32, f16 = np.finfo(np.float32), np.finfo(np.float16)
# numpy has no bfloat16 dtype, so derive its numbers from the layout: 8 exponent bits, 7 mantissa bits
bf = {"max": (2 - 2 ** -7) * 2.0 ** 127, "min_normal": 2.0 ** -126,
      "min_subnormal": 2.0 ** -133, "eps": 2.0 ** -7}

rows = [
    ("FP32", "1/8/23", float(f32.max), float(f32.tiny), float(f32.smallest_subnormal), float(f32.eps)),
    ("FP16", "1/5/10", float(f16.max), float(f16.tiny), float(f16.smallest_subnormal), float(f16.eps)),
    ("BF16", "1/8/7",  bf["max"], bf["min_normal"], bf["min_subnormal"], bf["eps"]),
]
print(f"{'fmt':5s} {'s/e/m':8s} {'max':>10s} {'min normal':>11s} {'min subnormal':>14s} {'epsilon':>10s}  {'~decimal digits':>16s}")
for name, bits, mx, mn, sub, eps in rows:
    digits = np.log10(1 / eps)
    print(f"{name:5s} {bits:8s} {mx:10.4e} {mn:11.4e} {sub:14.4e} {eps:10.4e}  {digits:16.1f}")

print()
print("positive finite values per power-of-two interval (binade):")
for name, (e, m) in (("FP32", (8, 23)), ("FP16", (5, 10)), ("BF16", (8, 7))):
    print(f"  {name}: 2^{m} = {2**m:>9,}   normal binades: {2**e - 2}")
```

Output:

```
fmt   s/e/m           max  min normal  min subnormal    epsilon   ~decimal digits
FP32  1/8/23   3.4028e+38  1.1755e-38     1.4013e-45 1.1921e-07               6.9
FP16  1/5/10   6.5504e+04  6.1035e-05     5.9605e-08 9.7656e-04               3.0
BF16  1/8/7    3.3895e+38  1.1755e-38     9.1835e-41 7.8125e-03               2.1

positive finite values per power-of-two interval (binade):
  FP32: 2^23 = 8,388,608   normal binades: 254
  FP16: 2^10 =     1,024   normal binades: 30
  BF16: 2^7 =       128   normal binades: 254
```

These agree with Table 1 of "A Study of BFLOAT16 for Deep Learning Training" to within the rounding the paper uses (FP32 3.40e38 / 1.17e-38 / 1.40e-45; FP16 6.55e4 / 6.10e-5 / 5.96e-8; BF16 about 3.4e38 and 1.17e-38; the paper prints 3.38e38 where the exact BF16 maximum is 3.3895e38). The paper's table lists no subnormal value for BF16, while the figure above is what the bit layout allows; hardware differs on whether it honors subnormals.

### Listing 4: overflow, underflow, precision and accumulation

```python
import numpy as np
from floatbits import to_bf16

np.seterr(all="ignore")          # we WANT to see inf/NaN, not warnings

print("--- overflow: 300 squared (true value 90,000) ---")
x = 300.0
print("fp32:", np.float32(x) * np.float32(x))
print("fp16:", np.float16(x) * np.float16(x), "   (max finite fp16 = 65504)")
print("bf16:", to_bf16(np.float32(x) * np.float32(x)), "  (finite, but only ~3 significant digits: 90000 -> 90112)")

print("\n--- overflow inside softmax: logits [10, 11, 12] ---")
logits32 = np.array([10, 11, 12], dtype=np.float32)
for name, z in (("fp32", logits32), ("fp16", logits32.astype(np.float16))):
    e = np.exp(z)
    print(f"{name}: exp = {e},  naive softmax = {e / e.sum()}")
z16 = logits32.astype(np.float16)
e = np.exp(z16 - z16.max())
print("fp16 with max subtracted:", e / e.sum())

print("\n--- underflow: tiny positive numbers ---")
for v in (1e-4, 1e-5, 1e-7, 1e-8):
    print(f"{v:8.0e} -> fp16 {float(np.float16(v)):.4e}   bf16 {float(to_bf16(np.float32(v))):.4e}   fp32 {float(np.float32(v)):.4e}")

print("\n--- precision: epsilon and spacing ---")
for name, eps, add in (("fp32", 2.0 ** -23, lambda d: np.float32(1) + np.float32(d)),
                       ("fp16", 2.0 ** -10, lambda d: np.float16(1) + np.float16(d)),
                       ("bf16", 2.0 ** -7,  lambda d: to_bf16(np.float32(1) + np.float32(d)))):
    print(f"{name}  epsilon = 2^{int(np.log2(eps))}:  1+eps == 1 ? {bool(add(eps) == 1)}    1+eps/2 == 1 ? {bool(add(eps / 2) == 1)}")
print("fp16 spacing near 2048:", np.spacing(np.float16(2048)), "  -> np.float16(2049) =", float(np.float16(2049)))
print("fp16 spacing near 1   :", np.spacing(np.float16(1)))

print("\n--- accumulation: add 1.0 over and over (true answer: 20000) ---")
a32, a16, abf = np.float32(0), np.float16(0), np.float32(0)
for _ in range(20000):
    a32 = a32 + np.float32(1)
    a16 = np.float16(a16 + np.float16(1))
    abf = to_bf16(abf + np.float32(1))
print("fp32:", float(a32), "  fp16:", float(a16), "  bf16:", float(abf))

print("\n--- accumulation: sum of 10,000 copies of 0.1 (true answer: 1000) ---")
vals = np.full(10000, 0.1, dtype=np.float32)
acc16 = np.float16(0)
for v in vals.astype(np.float16):
    acc16 = np.float16(acc16 + v)
print("fp16 running sum        :", float(acc16))
print("fp16 inputs, fp32 accum :", float(vals.astype(np.float16).astype(np.float32).sum()))
```

Output:

```
--- overflow: 300 squared (true value 90,000) ---
fp32: 90000.0
fp16: inf    (max finite fp16 = 65504)
bf16: 90112.0   (finite, but only ~3 significant digits: 90000 -> 90112)

--- overflow inside softmax: logits [10, 11, 12] ---
fp32: exp = [ 22026.467  59874.14  162754.78 ],  naive softmax = [0.09003058 0.24472848 0.66524094]
fp16: exp = [2.203e+04 5.987e+04       inf],  naive softmax = [ 0.  0. nan]
fp16 with max subtracted: [0.0901 0.2448 0.6655]

--- underflow: tiny positive numbers ---
   1e-04 -> fp16 1.0002e-04   bf16 1.0014e-04   fp32 1.0000e-04
   1e-05 -> fp16 1.0014e-05   bf16 1.0014e-05   fp32 1.0000e-05
   1e-07 -> fp16 1.1921e-07   bf16 1.0012e-07   fp32 1.0000e-07
   1e-08 -> fp16 0.0000e+00   bf16 1.0012e-08   fp32 1.0000e-08

--- precision: epsilon and spacing ---
fp32  epsilon = 2^-23:  1+eps == 1 ? False    1+eps/2 == 1 ? True
fp16  epsilon = 2^-10:  1+eps == 1 ? False    1+eps/2 == 1 ? True
bf16  epsilon = 2^-7:  1+eps == 1 ? False    1+eps/2 == 1 ? True
fp16 spacing near 2048: 2.0   -> np.float16(2049) = 2048.0
fp16 spacing near 1   : 0.000977

--- accumulation: add 1.0 over and over (true answer: 20000) ---
fp32: 20000.0   fp16: 2048.0   bf16: 256.0

--- accumulation: sum of 10,000 copies of 0.1 (true answer: 1000) ---
fp16 running sum        : 256.0
fp16 inputs, fp32 accum : 999.755859375
```

> [!example] The softmax block is the whole module in miniature. The same three logits give a perfect answer in FP32, and in FP16 `exp(12)` (162,754) is above the 65,504 limit, so it becomes `inf`, `inf / inf` is NaN, and the other two probabilities come out as zero. Subtracting the maximum first keeps every exponent at or below `exp(0)`; the FP16 answer is then right to about three digits. At the other end of the range, `1e-7` survives FP16 only as a subnormal with a 19% error (1.19e-7) and `1e-8` flushes to zero, while BF16 keeps both at its coarse precision. The last two blocks show absorption: a running FP16 sum of ones stops at 2,048 and BF16's stops at 256. Summing 0.1 ten thousand times in FP16 gets stuck at 256, because once the sum is large the spacing is bigger than twice the increment; with FP32 accumulation the sum is 999.76. The remaining 0.24 error comes from storing each 0.1 as the FP16 value 0.09997559 first, not from the accumulation.

### Listing 5: BF16 conversion, truncation versus rounding

```python
import numpy as np
from floatbits import to_bf16

x = np.array([3.14159265, 1.0 + 2.0 ** -8, 1.0 + 3 * 2.0 ** -8, 65504.0, 3.0e38], dtype=np.float32)
print("x            :", x)
print("bf16 nearest :", to_bf16(x))
print("bf16 truncate:", to_bf16(x, "truncate"))

rng = np.random.default_rng(0)
data = rng.uniform(1.0, 2.0, 1_000_000).astype(np.float32)
for mode in ("nearest", "truncate"):
    err = to_bf16(data, mode) - data
    print(f"{mode:9s} mean error = {err.mean():+.6f}   mean |error| = {np.abs(err).mean():.6f}   max |error| = {np.abs(err).max():.6f}")
```

Output:

```
x            : [3.1415927e+00 1.0039062e+00 1.0117188e+00 6.5504000e+04 3.0000000e+38]
bf16 nearest : [3.1406250e+00 1.0000000e+00 1.0156250e+00 6.5536000e+04 3.0040553e+38]
bf16 truncate: [3.1406250e+00 1.0000000e+00 1.0078125e+00 6.5280000e+04 2.9907630e+38]
nearest   mean error = -0.000003   mean |error| = 0.001952   max |error| = 0.003906
truncate  mean error = -0.003903   mean |error| = 0.003903   max |error| = 0.007812
```

Rounding to nearest is unbiased (mean error near zero) and has half the average and worst-case error of truncation, which always rounds toward zero and so has a systematic bias of about half a spacing (-0.0039 here). The second input, `1 + 2^-8`, is exactly halfway between two BF16 values; ties go to the one with an even last bit, `1.0`.

## Visual diagram

Layouts, with BF16 as the top half of an FP32:

```
  FP32  ┌─┬──────────┬───────────────────────────┐
        │S│ EEEEEEEE │ MMMMMMM MMMMMMMMMMMMMMMM  │   1 + 8 + 23 = 32 bits
        └─┴──────────┴────────┬──────────────────┘
        └──── BF16 keeps ─────┘└──── dropped ────┘

  BF16  ┌─┬──────────┬─────────┐
        │S│ EEEEEEEE │ MMMMMMM │                        1 + 8 + 7  = 16 bits   (same range as FP32)
        └─┴──────────┴─────────┘

  FP16  ┌─┬───────┬────────────┐
        │S│ EEEEE │ MMMMMMMMMM │                        1 + 5 + 10 = 16 bits   (more precise, much shorter range)
        └─┴───────┴────────────┘
```

Range (the span of positive values each format can represent, log scale):

```
 value 1e-45     1e-25     1e-5      1e15      1e35
       │         │         │         │         │
 FP32  ├───┼─────────────────────────────────────┤    1.4e-45 .. 3.4e38
 BF16    ├─┼─────────────────────────────────────┤    9.2e-41 .. 3.4e38
 FP16                     ├┼────┤                     6.0e-8 .. 65,504
```

One character is two powers of ten. `├` and `┤` mark the smallest and largest positive value; `┼` marks where normal numbers begin (to its left are subnormals). FP16 tops out at 65,504, so `x * x` already overflows to `inf` for any `x` above 255.

Precision (the spacing of representable values just above 1.0):

```
             1.0                                     1.0078125 (= 1 + 2^-7)
 BF16 ticks  │                                       │   gap 2^-7  = 0.0078
 FP16 ticks  │    │    │    │    │    │    │    │    │   gap 2^-10 = 0.00098  (8 per BF16 gap)
 FP32 ticks  │││││││││││││││││││││││││││││││││││││││││   gap 2^-23 = 1.2e-7   (65,536 per BF16 gap)
```

## Practice

### 1. Decode by hand

An FP16 value has the bits `0 10001 1010000000` (sign, exponent, mantissa). What number is it? Check with `decode` from listing 1.

<details><summary>Answer</summary>

The exponent field `10001` is 17; subtract the bias 15 to get 2. The mantissa `1010000000` after the implicit `1.` is `1.101` in binary, which is 1 + 1/2 + 1/8 = 1.625. Value = 1.625 x 2^2 = 6.5. Running `decode("0", "10001", "1010000000", "fp16")` returns `6.5`, and the 16-bit pattern is `0x4680`.

</details>

### 2. Convert FP32 pi to BF16

`float32(pi)` has the bit pattern `0x40490FDB`. By hand, what is its BF16 value, and what is the error? Verify with `to_bf16`.

<details><summary>Answer</summary>

BF16 keeps the top 16 bits, `0x4049`, and the dropped part `0x0FDB` (4,059) is less than half of `0x10000` (32,768), so rounding goes down: the result is `0x4049`, which is 3.140625. The error is pi - 3.140625 = 0.000968, a relative error of about 3.1e-4, below the 2^-8 (about 3.9e-3) half-spacing bound. `to_bf16(np.float32(np.pi))` prints `3.140625`.

</details>

### 3. Predict overflow and underflow

What do you get for: (a) 70,000 stored in FP16, (b) 70,000 in BF16, (c) 1e-9 in FP16, (d) 1e-9 in BF16, (e) `3e38 * 2` in FP32 and in BF16?

<details><summary>Answer</summary>

(a) `inf`: above 65,504. (b) 70,144: representable in BF16's range, rounded to 7 mantissa bits. (c) `0.0`: below half the smallest subnormal (about 3e-8). (d) about 9.97e-10: BF16 has FP32's range, with 7 bits of precision. (e) `inf` in both: 6e38 exceeds 3.4e38, and BF16's range equals FP32's. All five confirmed by running them with numpy and `to_bf16`.

</details>

### 4. Find the largest exactly-stored integer range

For each format, what is the largest `N` such that every integer from 1 to `N` is exactly representable? Find it by search with numpy and `to_bf16`, then explain the pattern from the mantissa width.

<details><summary>Answer</summary>

FP16: 2,048 (2,049 rounds to 2,048). BF16: 256 (257 is missing). FP32: 16,777,216 = 2^24 (16,777,217 rounds to 16,777,216). In each case it is `2^(mantissa_bits + 1)`: with `m` stored mantissa bits plus the implicit 1 you have `m + 1` bits of integer precision, so spacing reaches 2 at `2^(m+1)`. Verified by running: the first missing integers found were 2,049 (FP16), 257 (BF16) and 16,777,217 (FP32).

</details>

### Checkpoint quiz

1. Which field of a float sets its range, and which sets its precision?
2. Why do FP32 and BF16 have the same range, and how is BF16 made from FP32?
3. What is machine epsilon, and why does `1 + eps/2 == 1`?
4. Name the two failure modes FP16 hits that BF16 mostly avoids, and the price BF16 pays.
5. Why does a running sum of 1.0s stop growing in FP16?

<details><summary>Answers</summary>

1. The exponent sets the range; the mantissa sets the precision.
2. Both have an 8-bit exponent. BF16 is the top 16 bits of an FP32 (sign, exponent, first 7 mantissa bits), with the low 16 bits rounded away.
3. The gap between 1.0 and the next representable number, `2^-m` for `m` mantissa bits. Half of it is a tie between 1.0 and the next value, and ties go to the even neighbor, which is 1.0.
4. Overflow (above 65,504) and underflow (below about 6e-8, with precision already degraded below 6.1e-5). BF16 pays with precision: 7 mantissa bits, about 2 decimal digits.
5. Once the sum reaches 2,048 the spacing between FP16 numbers is 2, so adding 1 is exactly a tie that rounds back to the even neighbor, 2,048.

</details>

> [!check]
> - I can read the sign, exponent and mantissa of an FP32, FP16 or BF16 value and rebuild the number
> - I can say which fields control range and which control precision, and what machine epsilon is
> - I can predict whether a value overflows, underflows or loses precision in each format
> - I can emulate BF16 in numpy and explain truncation versus rounding
> - I can explain why sums are accumulated in a wider format than their inputs

## Project

Write `float_explorer.py`, a numpy-only program that treats FP16 and BF16 as complete sets of 65,536 bit patterns.

Requirements:

- For each format, enumerate every 16-bit pattern and classify it: zero, subnormal, normal, infinity or NaN. Print the counts. Before you run it, derive from the layouts what each count should be, and check the program agrees. (Hint: the NaN patterns are every combination of sign, an all-ones exponent and a non-zero mantissa.)
- Histogram the finite positive values by binade (power-of-two interval). Print how many values sit in each, and confirm the "same count per binade" claim from the Explanation.
- Draw a text plot of the *gap to the next value* against magnitude on a log scale for both formats, showing the ruler getting sparser.
- Given any decimal number, report for each format the nearest representable value, the absolute and relative error, and whether it overflowed or underflowed.
- Stretch: add a function that lists all the integers below 4,096 that FP16 cannot represent exactly, and explain the pattern.

There is no reference solution.

## Interview questions

> [!interview] Why do large-model training runs prefer BF16 over FP16 on hardware that supports both, even though FP16 has more precision?

<details><summary>What a strong answer covers</summary>

BF16 has FP32's exponent range, so activations and especially small gradients do not overflow or underflow the way they do in FP16, which means no loss scaling and fewer NaN incidents. Neural-network training is tolerant of low mantissa precision (noise from rounding averages out), but not of out-of-range values. The cost is fewer significant digits, which is why master weights and accumulations stay in FP32. A strong answer notes FP16 can work with loss scaling and that hardware support matters.

</details>

> [!interview] Define machine epsilon and explain, with an example, why adding a small number to a large one can have no effect.

<details><summary>What a strong answer covers</summary>

Epsilon is the gap between 1.0 and the next float, `2^-m`. Spacing scales with magnitude, so near a number `x` the gap is about `x * eps`; an addend smaller than half that gap rounds away. Example: in FP16, `2048 + 1` stays 2048, so a loop adding 1.0 stalls at 2,048 (256 in BF16). Consequences: accumulate sums and optimizer updates in FP32, sum small values first or use pairwise or Kahan summation, and keep a high-precision master copy of weights.

</details>

> [!interview] A model that runs fine in BF16 produces NaNs when you load it in FP16. What is probably happening and how would you confirm and fix it?

<details><summary>What a strong answer covers</summary>

Some intermediate values exceed 65,504 and overflow to `inf`, then NaN through `inf - inf` or `0 * inf`. The model was trained and validated in BF16, whose range does not have this limit. Confirm by hooking activations (or logits) and checking maxima against the FP16 limit, or by running in BF16 and seeing the NaNs disappear. Fixes: run in BF16 or FP32; keep the overflowing operations (often softmax, norms or specific projections) in FP32; rescale the offending weights if the architecture allows it.

</details>

## Common mistakes & troubleshooting

| Symptom | Likely cause | What to do |
|---------|--------------|------------|
| Loss becomes `nan` after a few hundred steps in FP16 | An intermediate overflowed to `inf` | Check maxima of activations and gradients; use loss scaling and keep softmax and norms in FP32 (Module 07), or switch to BF16 |
| Loss plateaus oddly early; weights seem frozen | Updates are smaller than the local spacing and round away | Keep FP32 master weights (Module 07) |
| Softmax output is NaN or all zeros | `exp` of a large logit overflowed | Subtract the maximum before `exp` and compute softmax in FP32 |
| A sum comes out far too small | Accumulating in a 16-bit type, so small terms are absorbed | Accumulate in FP32 (`dtype=np.float32` in numpy, or autocast's FP32 reductions) |
| Results differ by tiny amounts between runs or devices | Addition is not associative in floating point; order of reduction changes the rounding | Compare with a tolerance, never `==`; fix the reduction order if bitwise reproducibility is required |
| `np.float16(2049) == 2049` is `False` | 2,049 is not representable; it rounded to 2,048 | Expected: integers above `2^(m+1)` are not all exact |
| Emulated BF16 values look slightly different from a GPU's | Conversion mode (truncate versus round) or subnormal handling differs | Match the rounding mode; compare with a tolerance |

## Further reading & sources

- [A Study of BFLOAT16 for Deep Learning Training](https://arxiv.org/abs/1905.12322) - defines BF16 (1 sign, 8 exponent, 7 mantissa bits), compares it with FP32 and FP16 in its Table 1, and reports the rounding-versus-truncation result cited here.
- [Mixed Precision Training](https://arxiv.org/abs/1710.03740) - the paper that established FP16 training with FP32 master weights and loss scaling; the source of the "values below 2^-24 become zero in FP16" statement and the motivation for Module 07.
- [FP8 Formats for Deep Learning](https://arxiv.org/abs/2209.05433) - defines the E4M3 and E5M2 FP8 encodings whose largest values (448 and 57,344) are quoted in the signpost section.
- [What Every Computer Scientist Should Know About Floating-Point Arithmetic](https://docs.oracle.com/cd/E19957-01/806-3568/ncg_goldberg.html) - David Goldberg's classic on rounding, machine epsilon, and why floating-point addition surprises people.
- [numpy.finfo](https://numpy.org/doc/stable/reference/generated/numpy.finfo.html) - documentation of the machine-limit attributes (`max`, `tiny`, `eps`, `smallest_subnormal`) used in listing 3.
- [NVIDIA A100 datasheet](https://www.nvidia.com/content/dam/en-zz/Solutions/Data-Center/a100/pdf/nvidia-a100-datasheet-us-nvidia-1758950-r4-web.pdf) - lists BF16 and FP16 Tensor Core throughput side by side (checked Oct 2026), the basis for the hardware-support statement.

## Next

[Module 07: Mixed Precision Training](../07-mixed-precision-training/README.md)
