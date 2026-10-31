# Module 14: Running Models on CPU and Apple Silicon

## Roadmap

**Where this sits.** Modules 00-13 assumed a discrete GPU with its own fast memory. This module covers the other
path: running a model on ordinary CPU memory, or on Apple silicon's unified memory, with no GPU rental at all.
It builds on [Module 03: Memory Hierarchy and Bandwidth](../03-memory-hierarchy-and-bandwidth/README.md) (why
bandwidth is the speed limit), [Module 05](../05-calculating-a-models-memory-requirements/README.md) (how many
bytes a model needs), and the quantization module of the previous track
([Track 04, Module 15: Quantization: INT8, INT4, GGUF](../../04-training-fine-tuning-and-alignment/15-quantization-int8-int4-gguf/README.md)),
which this module does not re-teach. [Module 13](../13-cloud-gpu-economics/README.md) is the rental alternative.

**After this module you can** estimate how fast a model will decode on a given machine from two numbers
(memory bandwidth and bytes per token), check that estimate against published measurements, describe the
GGUF and llama.cpp route and the MLX route on a Mac, and say honestly what a CPU or laptop will and will not do.

**Why it matters.** Small and quantized models are good enough for many development, privacy-sensitive and
offline uses, and a machine you already own costs nothing extra per token. Knowing the limit in advance tells you
which models are realistic there and which are not.

## Concept

> [!key]
> Generating text one token at a time is a memory-streaming job: every token needs (roughly) every weight read
> once, so tokens per second cannot exceed memory bandwidth divided by the bytes read per token. CPU and
> unified-memory machines work for small or quantized models because they have little bandwidth but a lot of cheap
> memory, and quantization shrinks the bytes that must stream.

## Explanation

### Why this works at all

A discrete GPU is fast at decoding because its memory is fast (Module 03). A CPU's memory is much slower, but there
is a lot of it and it is cheap, and a quantized model is small. An Apple-silicon Mac has one pool of memory that the
CPU and GPU both use, with bandwidth between a PC's DDR memory and a datacenter GPU's. For a model that fits, the
question is only how fast the bytes can be streamed.

### Deriving the decode ceiling

At batch size one, producing a token multiplies one vector by each weight matrix. Every weight is touched once
and used for about 2 floating-point operations (a multiply and an add). So the work per token is about 2 x
`params` operations, but the bytes read are `params x bits per weight / 8`. The ratio is the arithmetic intensity:

- 16-bit weights: 2 operations per 2 bytes, about 1 operation per byte.
- 4.89 bits per weight (llama.cpp's `Q4_K_M`, see the table below): 2 / (4.89 / 8), about 3.3 operations per byte.

A machine can do far more operations per byte than that. The prompt-processing measurements below imply about
4 TFLOP/s sustained on an M1 Pro against 200 GB/s of bandwidth, roughly 20 operations per byte available. Decode
asks for 1 to 3, so the arithmetic units wait for memory. Time per token is therefore about
`bytes read / bandwidth`, which gives the ceiling:

```
tokens per second  <=  bandwidth (bytes/s) / bytes read per token
bytes read per token  ~  params x bits per weight / 8   +   KV cache bytes at the current context
```

> [!model]
> Think of each token as one full walk past a shelf holding the entire model. The walking speed is memory
> bandwidth, the length of the shelf is the model's bytes, and you must walk it for every token. A 4-bit model
> is a shorter shelf. Faster arithmetic does not help a walker who is limited by walking speed.

Three consequences. A faster-arithmetic chip with the same bandwidth decodes at about the same speed. Halving the
bits per weight roughly doubles the ceiling (but see the measurements). And prompt processing is different: a
prompt of 512 tokens reuses each weight read 512 times, which raises the intensity until the machine is
compute-bound instead. That is why a machine's prompt-processing rate in tokens/s is many times its generation
rate. For a mixture-of-experts model the same argument reads only the experts used for each token, so the
bytes per token follow the *active* parameters while the *total* parameters must still fit in memory.

> [!pitfall]
> Units. Bandwidth is quoted in GB/s (10^9 bytes) while model files and tool output are often in GiB (2^30
> bytes). Mixing them is a 7% error in every estimate. The code below converts explicitly.

### Checking the estimate against measurements

The llama.cpp project keeps a public benchmark thread,
[Performance of llama.cpp on Apple Silicon M-series](https://github.com/ggml-org/llama.cpp/discussions/4167)
(fetched Oct 2026). Its table gives, for each chip, a bandwidth column and measured prompt-processing (`pp512`) and
text-generation (`tg128`, batch 1) rates for Llama-2-7B in F16, Q8_0 and Q4_0, all on one fixed build (`8e672ef`,
2023 Nov 21) "in order to keep all performance factors even". The model files are 12.55, 6.67 and 3.56 GiB for
6.74 billion parameters. The Code section compares those measured rates with the ceiling formula.

What the comparison shows (numbers from the Code output):

- **The ceiling holds.** In the rows compared in the Code section no measured rate exceeds
  `bandwidth / file size`; they reach 45-86% of it.
- **The shortfall grows as the model shrinks and the memory gets faster.** The 7-core M1 at 68 GB/s reaches 80-83%;
  the M2 Ultra at 800 GB/s reaches 45% on Q4_0. Plausible reading: per-token costs that are not weight streaming
  (attention, dequantization, synchronisation) are a larger share when the streaming part is short. The table does
  not prove that cause; it is a hypothesis to test with a measurement.
- **Tokens/s follows bandwidth, not GPU core count.** For the two M2 Ultra rows (both 800 GB/s), F16 generation
  is 39.86 tokens/s on 60 GPU cores and 41.02 on 76, while `pp512` rises from 1128.59 to 1401.85.
- **Prompt processing is far faster per token.** In those rows the `pp / tg` ratio runs from 7 to 34.
- **Numbers age with the software.** The same page shows M2 Ultra Q4_0 generation going from 94.27 tokens/s on the
  2023 build to 125.21 on a build dated 2026 Aug 25. Always state the build next to a benchmark.

### Apple unified memory and Metal

Apple's MLX documentation says: "Apple silicon has a unified memory architecture. The CPU and GPU have direct
access to the same memory pool." There is no copy across a PCIe bus, and the model's "VRAM" is simply system
memory, so capacity is whatever RAM the Mac has. Two practical limits appear in the sources:

- The GPU may only use part of that memory. In the benchmark thread a note says F16 "does not run on this config:
  model weights (13.5 GiB) exceed recommendedMaxWorkingSetSize (12.7 GB), matching the blank F16 cells on other
  base chips". The `mlx-lm` README adds that models large relative to RAM "can be slow", and on macOS 15 or newer
  you can raise the wired-memory limit with `sudo sysctl iogpu.wired_limit_mb=N` (see commands below).
- Bandwidth differs by tier. The benchmark table lists 68 GB/s for an M1, 200 for an M1 Pro, 400 for an M1 Max and
  800 for an M1 Ultra, a spread of about 12 times. Decode speed follows the tier, though less than proportionally:
  Q4_0 generation is 14.19 tokens/s on the 7-core M1 and 83.73 on the 64-core M1 Ultra, about 5.9 times.

Software on Apple silicon: `llama.cpp` says "Apple silicon is a first-class citizen - optimized via ARM NEON,
Accelerate and Metal frameworks", and its build guide says "On MacOS, Metal is enabled by default" (disable GPU
inference at run time with `--n-gpu-layers 0`). **MLX** is "an array framework for machine learning on Apple
silicon" from Apple machine learning research; `mlx-lm` is its Python package for "generating text and
fine-tuning large language models on Apple silicon", including quantization and LoRA fine-tuning.

### GGUF and llama.cpp: the practical path

GGUF is "a file format for storing models for inference with GGML and executors based on GGML", designed as a
single file that contains everything needed to load the model, with `mmap` compatibility for fast loading
([GGUF spec](https://github.com/ggml-org/ggml/blob/master/docs/gguf.md)). llama.cpp's quantize tool converts a
model to GGUF and then to a quantized format; its README tabulates the options for Llama-3.1-8B. A few rows
(bits per weight, file size, as printed there):

| Format | Bits per weight | Size (GiB, 8B model) |
|---|---|---|
| F16 | 16.0005 | 14.96 |
| Q8_0 | 8.5008 | 7.95 |
| Q4_K_M | 4.8944 | 4.58 |
| Q2_K | 3.1593 | 2.95 |

Those bits-per-weight values sit above the nominal 4, 8 or 2 because block quantization stores scaling
information alongside the weights. The README also states that quantization "may introduce some accuracy loss",
measured in perplexity or KL divergence, so the format is a quality trade, not only a size one. The same README lists
text-generation rates for those files (F16 29.17, Q8_0 50.93, Q4_K_M 71.93 tokens/s) without naming the machine:
the speed-up from F16 to Q4_K_M is 2.5 times for a 3.3 times smaller file, which matches the pattern above.

### What to expect, and not expect

- **Expect** speed to scale with bandwidth and inversely with file size. A 7B `Q4_0` file (3.56 GiB) generated
  14 to 94 tokens/s across the five chips compared in the Code section; a model twice the size will be roughly
  half as fast on the same machine, before the context-length penalty.
- **Expect long prompts to be slow.** Time to first token is prompt length over the prompt-processing rate (Code
  section), and long contexts also slow decode because the KV cache adds bytes to every token.
- **Do not expect** GPU-class throughput for many concurrent users. The bandwidths here (68-800 GB/s in the
  benchmark thread) are far below the 864-4800 GB/s of the datacenter cards in
  [Module 12](../12-choosing-gpus-consumer-vs-datacenter/README.md)'s table, and batching (Module 13) can only
  multiply what the machine has.
- **Do not expect to skip measuring.** Numbers depend on quantization, context, thread count and software build.

## Code

All three blocks are standard-library Python, run with the local Python 3.13, and print **estimates** unless a
column says "measured". Bandwidths in block 1 are assumptions.

### 1. The decode ceiling for a 7B model on several machines (estimates)

```python
# ESTIMATES. Decode ceiling = memory bandwidth / bytes that must be read per generated token.
GB = 1e9

def model_bytes(params_billion, bits_per_weight):
    return params_billion * 1e9 * bits_per_weight / 8

def decode_ceiling_tps(bandwidth_gbs, bytes_per_token):
    return bandwidth_gbs * GB / bytes_per_token

# Peak DDR5 bandwidth is simple arithmetic: transfers/s x 8 bytes per 64-bit channel x channels.
ddr5_5600_dual = 5600e6 * 8 * 2 / GB
print(f"dual-channel DDR5-5600 peak (theoretical): {ddr5_5600_dual:.1f} GB/s")

MACHINES = {                      # ASSUMED bandwidths, in GB/s
    "dual-channel DDR5-5600 (peak)": ddr5_5600_dual,
    "200 GB/s unified memory":       200,
    "400 GB/s unified memory":       400,
    "800 GB/s unified memory":       800,
}
# bits/weight: 16 for FP16; 8.5008 for Q8_0 and 4.8944 for Q4_K_M are the values in llama.cpp's
# quantize README table (Llama-3.1-8B); applied here to a generic 7B model as an approximation.
FORMATS = {"FP16": 16.0, "Q8_0": 8.5008, "Q4_K_M": 4.8944}
PARAMS_B = 7.0

print(f"\n{PARAMS_B:.0f}B dense model, weights only, tokens/s CEILING (real speed is lower):")
print(f"{'machine':<32}" + "".join(f"{f:>9}" for f in FORMATS))
for name, bw in MACHINES.items():
    row = "".join(f"{decode_ceiling_tps(bw, model_bytes(PARAMS_B, b)):>9.1f}" for b in FORMATS.values())
    print(f"{name:<32}{row}")
print("\nbytes per token:", {f: f"{model_bytes(PARAMS_B, b)/GB:.2f} GB" for f, b in FORMATS.items()})
```

```
dual-channel DDR5-5600 peak (theoretical): 89.6 GB/s

7B dense model, weights only, tokens/s CEILING (real speed is lower):
machine                              FP16     Q8_0   Q4_K_M
dual-channel DDR5-5600 (peak)         6.4     12.0     20.9
200 GB/s unified memory              14.3     26.9     46.7
400 GB/s unified memory              28.6     53.8     93.4
800 GB/s unified memory              57.1    107.6    186.8

bytes per token: {'FP16': '14.00 GB', 'Q8_0': '7.44 GB', 'Q4_K_M': '4.28 GB'}
```

> [!example]
> Check one cell by hand. 7B at Q4_K_M is 7e9 x 4.8944 / 8 = 4.28e9 bytes. On 200 GB/s: 200e9 / 4.28e9 = 46.7
> tokens/s, which is the table's value. Dual-channel DDR5-5600 is 5600e6 transfers/s x 8 bytes x 2 channels =
> 89.6 GB/s peak; sustained bandwidth is lower, so its real numbers sit below the ceiling.

### 2. The ceiling against measured llama.cpp numbers

```python
# Compare the bandwidth ceiling with MEASURED llama.cpp numbers.
# Source: ggml-org/llama.cpp discussion #4167 (page checked Oct 2026), Llama-2-7B GGUF, Metal backend,
# llama-bench pp512 / tg128, one fixed build (8e672ef) for every chip. BW is the table's own column.
# Five of the thread's chips, with rates copied from the data list it publishes for that build.
GIB = 2**30
PARAMS = 6.74e9
SIZES_GIB = {"F16": 12.55, "Q8_0": 6.67, "Q4_0": 3.56}       # model sizes printed by llama-bench

# chip: (BW GB/s, {fmt: (pp512 t/s, tg128 t/s)})
ROWS = {
    "M1 (7 GPU cores)":      (68,  {"Q8_0": (108.21, 7.92),  "Q4_0": (107.81, 14.19)}),
    "M1 Pro (16 cores)":     (200, {"F16": (302.14, 12.75),  "Q8_0": (270.37, 22.34),  "Q4_0": (266.25, 36.41)}),
    "M4 (10 cores)":         (120, {"F16": (230.18, 7.43),   "Q8_0": (223.64, 13.54),  "Q4_0": (221.29, 24.11)}),
    "M4 Max (40 cores)":     (546, {"F16": (922.83, 31.64),  "Q8_0": (891.94, 54.05),  "Q4_0": (885.68, 83.06)}),
    "M2 Ultra (76 cores)":   (800, {"F16": (1401.85, 41.02), "Q8_0": (1248.59, 66.64), "Q4_0": (1238.48, 94.27)}),
}

print(f"{'chip':<22}{'fmt':<5}{'BW GB/s':>8}{'ceiling':>9}{'measured':>9}{'achieved':>9}{'PP/TG':>7}{'PP implied TFLOP/s':>20}")
for chip, (bw, fmts) in ROWS.items():
    for fmt, (pp, tg) in fmts.items():
        ceiling = bw * 1e9 / (SIZES_GIB[fmt] * GIB)      # tokens/s if every weight byte is read once per token
        implied_tflops = pp * 2 * PARAMS / 1e12          # ~2 FLOPs per parameter per prompt token
        print(f"{chip:<22}{fmt:<5}{bw:>8}{ceiling:>9.1f}{tg:>9.2f}{tg/ceiling:>9.0%}{pp/tg:>7.1f}{implied_tflops:>20.1f}")
```

```
chip                  fmt   BW GB/s  ceiling measured achieved  PP/TG  PP implied TFLOP/s
M1 (7 GPU cores)      Q8_0       68      9.5     7.92      83%   13.7                 1.5
M1 (7 GPU cores)      Q4_0       68     17.8    14.19      80%    7.6                 1.5
M1 Pro (16 cores)     F16       200     14.8    12.75      86%   23.7                 4.1
M1 Pro (16 cores)     Q8_0      200     27.9    22.34      80%   12.1                 3.6
M1 Pro (16 cores)     Q4_0      200     52.3    36.41      70%    7.3                 3.6
M4 (10 cores)         F16       120      8.9     7.43      83%   31.0                 3.1
M4 (10 cores)         Q8_0      120     16.8    13.54      81%   16.5                 3.0
M4 (10 cores)         Q4_0      120     31.4    24.11      77%    9.2                 3.0
M4 Max (40 cores)     F16       546     40.5    31.64      78%   29.2                12.4
M4 Max (40 cores)     Q8_0      546     76.2    54.05      71%   16.5                12.0
M4 Max (40 cores)     Q4_0      546    142.8    83.06      58%   10.7                11.9
M2 Ultra (76 cores)   F16       800     59.4    41.02      69%   34.2                18.9
M2 Ultra (76 cores)   Q8_0      800    111.7    66.64      60%   18.7                16.8
M2 Ultra (76 cores)   Q4_0      800    209.3    94.27      45%   13.1                16.7
```

The `achieved` column is measured / ceiling. The last column is `pp512 x 2 x params`, an estimate of sustained
arithmetic during prompt processing (about 2 operations per parameter per token, ignoring attention).

### 3. Long contexts and time to first token (estimates)

```python
# ESTIMATES with ASSUMED model shape. KV-cache bytes per token: 2 (K and V) x layers x kv_width x bytes.
LAYERS, KV_WIDTH, CACHE_BYTES = 32, 4096, 2     # ASSUMPTION: 7B-class dense model, no GQA, FP16 cache
kv_per_token = 2 * LAYERS * KV_WIDTH * CACHE_BYTES
print(f"KV cache per token: {kv_per_token:,} bytes ({kv_per_token/2**20:.2f} MiB)")

WEIGHTS_BYTES = 3.56 * 2**30                    # the Q4_0 7B file size from the llama-bench table
BW = 546e9                                      # the M4 Max row's bandwidth (GB/s column of the table)
print(f"\nweights {WEIGHTS_BYTES/1e9:.2f} GB, bandwidth {BW/1e9:.0f} GB/s")
print(f"{'context':>8} {'KV GB':>7} {'bytes/token GB':>15} {'ceiling tok/s':>14}")
for ctx in (0, 2048, 8192, 32768):
    kv = kv_per_token * ctx
    total = WEIGHTS_BYTES + kv
    print(f"{ctx:>8} {kv/1e9:>7.2f} {total/1e9:>15.2f} {BW/total:>14.1f}")

print("\ntime to first token = prompt tokens / prompt-processing rate (measured pp512, Q4_0 rows):")
for chip, pp in (("M1 Pro (200 GB/s)", 266.25), ("M4 Max (546 GB/s)", 885.68)):
    for prompt in (512, 4096, 16384):
        print(f"  {chip:<18} {prompt:>6}-token prompt: {prompt/pp:6.1f} s")
```

```
KV cache per token: 524,288 bytes (0.50 MiB)

weights 3.82 GB, bandwidth 546 GB/s
 context   KV GB  bytes/token GB  ceiling tok/s
       0    0.00            3.82          142.8
    2048    1.07            4.90          111.5
    8192    4.29            8.12           67.3
   32768   17.18           21.00           26.0

time to first token = prompt tokens / prompt-processing rate (measured pp512, Q4_0 rows):
  M1 Pro (200 GB/s)     512-token prompt:    1.9 s
  M1 Pro (200 GB/s)    4096-token prompt:   15.4 s
  M1 Pro (200 GB/s)   16384-token prompt:   61.5 s
  M4 Max (546 GB/s)     512-token prompt:    0.6 s
  M4 Max (546 GB/s)    4096-token prompt:    4.6 s
  M4 Max (546 GB/s)   16384-token prompt:   18.5 s
```

The KV shape is an **assumption** (a 7B-class dense model without grouped-query attention); Module 05 shows how
to read the real shape from a model's configuration. The time-to-first-token figures extend the measured `pp512`
rate to longer prompts, which is optimistic because attention cost grows with context.

### 4. Commands (shown, NOT executed in this module's verification)

Needs llama.cpp or MLX installed, a model download and suitable hardware; none of it was run here, so no output is
claimed. They are taken from the project documents linked in Further reading. llama.cpp's command names have
changed across versions (current docs show both `llama cli` and `llama-cli`; check `--help` on your build).

```bash
# --- llama.cpp (quantize README, llama-bench README, build guide) ---
python convert_hf_to_gguf.py --outfile model-bf16.gguf --outtype bf16 --remote <hf-org>/<hf-model>
./build/bin/llama-quantize model-bf16.gguf model-Q4_K_M.gguf Q4_K_M
./build/bin/llama cli -m model-Q4_K_M.gguf
./build/bin/llama-bench -m model-Q4_K_M.gguf -p 512 -n 128 -ngl 99   # pp512 / tg128, like the thread above
./build/bin/llama-bench -m model-Q4_K_M.gguf -ngl 0 -t 8              # CPU only; try -t = physical cores

# --- MLX LM on a Mac (mlx-lm README) ---
pip install mlx-lm
mlx_lm.generate --prompt "How tall is Mt Everest?"
mlx_lm.convert --model mistralai/Mistral-7B-Instruct-v0.3 -q          # quantize to 4-bit
sudo sysctl iogpu.wired_limit_mb=N   # macOS 15+, N above the model's size in MB and below RAM size
```

## Visual diagram

```
  three ways to hold the model                         what limits tokens per second
  ──────────────────────────────                       ──────────────────────────────
  discrete GPU box                                          weights (bytes)
  ┌────────────┐  PCIe   ┌─────────────┐                   ┌─────────────────────┐
  │ system RAM │◄───────►│ VRAM        │                   │ model on the "shelf"│
  │ (CPU side) │  slow   │ weights live│                   └──────────┬──────────┘
  └────────────┘         │ here, fast  │                              │ streamed once per token
                         └─────────────┘                              ▼
                                                              ┌──────────────┐
  Apple silicon (unified memory)                              │ memory bus   │  <-- the bottleneck
  ┌───────────────────────────────────┐                       │ GB/s         │
  │ one memory pool                   │                       └──────┬───────┘
  │  CPU cores      GPU cores         │                              │
  │  both read the same bytes (Metal) │                              ▼
  └───────────────────────────────────┘                        ┌───────────┐
                                                                │ cores     │ mostly waiting
  CPU + DDR memory                                              └─────┬─────┘
  ┌─────┐   DDR channels    ┌──────────────┐                          ▼
  │ CPU │◄─────────────────►│ system RAM   │                    one new token
  └─────┘   ~tens of GB/s   │ large, cheap │
                            └──────────────┘          tokens/s <= bandwidth / (weight bytes + KV bytes)
```

## Practice

### 1. Estimate

A 13B model at `Q4_K_M` (4.8944 bits per weight) on a machine with 400 GB/s. What is the decode ceiling, and what
range would you expect if real machines reach 45-86% of it?

<details><summary>Answer</summary>

Bytes = 13e9 x 4.8944 / 8 = 7.953e9. Ceiling = 400e9 / 7.953e9 = 50.3 tokens/s. At 45-86%: about 23 to 43 tokens/s.
The range comes from the measured table above, not from a law; measure on your own machine and build.

</details>

### 2. Does it fit?

A 70B model on a Mac with 64 GB of unified memory. Assume (an assumption, not a measured value) the GPU may use 70%
of it, 44.8 GB. Which of F16, Q8_0 (8.5008 bits) and Q4_K_M (4.8944 bits) fit as weights, and how much is left?

<details><summary>Answer</summary>

F16: 70e9 x 2 = 140 GB, no. Q8_0: 70e9 x 8.5008 / 8 = 74.4 GB, no. Q4_K_M: 70e9 x 4.8944 / 8 = 42.8 GB, yes, with
about 2.0 GB left for KV cache and everything else, so a long context may not fit. Verify the real limit on the
machine; the 70% figure is only a placeholder for it.

</details>

### 3. Read the table

Which row of the Code block 2 output reaches the smallest fraction of its ceiling, and what pattern across rows
does it suggest?

<details><summary>Answer</summary>

M2 Ultra, Q4_0: 45%. Across rows the fraction falls as the model gets smaller and the bandwidth larger (M1 Pro
F16 86%, M4 Max Q4_0 58%, M2 Ultra Q4_0 45%). That fits per-token costs other than weight streaming taking a
larger share when streaming is quick, but it is a hypothesis; confirming it needs profiling.

</details>

### 4. Time to first token

An 8,000-token prompt on the M1 Pro at its measured Q4_0 `pp512` rate of 266.25 tokens/s: how long, and in which
direction is the real figure likely to be wrong?

<details><summary>Answer</summary>

8000 / 266.25 = 30.0 seconds. Real prompt processing slows as context grows (attention work rises with length), so
the real figure is likely longer than 30 s.

</details>

### Checkpoint quiz

1. State the decode ceiling formula and say what each term is.
2. Why is prompt processing so much faster per token than generation?
3. What did the benchmark thread show about tokens/s versus GPU core count at fixed bandwidth?
4. Why can a Mac run a model that does not fit a 24 GB GPU, and what limit still applies?
5. Why is the speed-up from F16 to `Q4_K_M` smaller than the size reduction?

<details><summary>Answers</summary>

1. `tokens/s <= bandwidth / bytes read per token`; bytes are weights (params x bits / 8) plus KV cache at the
   current context.
2. A batch of prompt tokens reuses each weight read many times, so the machine becomes compute-bound instead of
   memory-bound; generation reads all weights per token.
3. At 800 GB/s, generation barely moved between 60 and 76 cores (39.86 vs 41.02 tokens/s) while prompt processing
   rose (1128.59 vs 1401.85).
4. Unified memory is large and cheap relative to VRAM. The GPU can still use only part of it
   (`recommendedMaxWorkingSetSize`), and bandwidth, not capacity, then sets the speed.
5. Other per-token costs do not shrink with the weights, and quantization metadata adds bits; llama.cpp's own
   table shows 2.5x faster for a 3.3x smaller file.

</details>

> [!check]
> - I can state the decode ceiling and convert GB/s and GiB correctly
> - I can explain why prompt processing and generation run at different rates
> - I can say what GGUF and `llama-quantize` do, and where MLX fits on a Mac
> - I can estimate whether a quantized model fits and roughly how fast it would run
> - I know to state the software build when quoting a benchmark

## Project

Predict, then measure, on your own machine. No code or solution is given here.

1. Pick a small GGUF model that fits in your RAM. Find your machine's memory bandwidth from its specification (or
   measure it with a tool of your choice) and write it down with its source.
2. Before running anything, predict the generation ceiling from the formula and write a predicted range using
   the 45-86% band from this module.
3. Run llama.cpp's benchmark tool for prompt processing and generation, note the build, and compare with your
   prediction. Convert GB and GiB correctly.
4. Sweep the thread count and one more variable (quantization level, or context length) and report what changed.
5. Write half a page: where the prediction was right, where it was wrong, and what you would profile next.

Success looks like: the prediction is recorded before the measurement, units are consistent, the build and
settings are stated, and at least one result you did not expect is reported rather than smoothed over.

## Interview questions

> [!interview]
> Why is LLM decoding memory-bound, and how would you estimate tokens per second for a model on a laptop?

<details><summary>What a strong answer covers</summary>

- At batch one, each weight is used for about 2 operations per token, so arithmetic intensity is 1-3 operations
  per byte, far below what the chip can do: memory limits speed.
- The formula `bandwidth / bytes per token`, with KV cache bytes added at long context, and the GB/GiB care.
- The estimate is a ceiling; real machines reached about 45-86% in the llama.cpp thread; measure on the target.
- Prompt processing is compute-bound and much faster per token.

</details>

> [!interview]
> A teammate says quantizing to 4 bits makes inference four times faster on a CPU. Is that right?

<details><summary>What a strong answer covers</summary>

- The bound says the *ceiling* scales with bytes per token, so up to about 3.3x going from F16 to `Q4_K_M` by file
  size (14.96 to 4.58 GiB in llama.cpp's table), not 4x, because block quantization stores scaling data.
- Measured speed-up is lower still (2.5x in the same README table) because other per-token costs remain.
- The earlier quantization module measured mixed CPU latency results too: measure, do not assume.
- Quality cost: perplexity or KL divergence rises as bits fall.

</details>

> [!interview]
> A Mac with 64 GB can load a model that will not fit on a 24 GB GPU. What is the catch?

<details><summary>What a strong answer covers</summary>

- Fitting is not speed: decode speed follows memory bandwidth, which on unified memory is lower than on a
  datacenter GPU's HBM.
- Only part of unified memory is usable by the GPU (`recommendedMaxWorkingSetSize`); wired-memory settings
  exist; large models relative to RAM are slow.
- Prompt processing for long contexts is slow, and concurrency is limited by compute and bandwidth.

</details>

## Common mistakes & troubleshooting

- **Too many threads on CPU.** llama.cpp's performance tips say the thread count must not be too large and to
  set it to the number of *physical* cores; if generation is extremely slow, try 1 and double until it stops
  improving. Memory-bound work does not scale with threads.
- **Mixing GB and GiB**, giving a 7% error in every estimate.
- **"It loads but it crawls."** The model may be too large for the memory the GPU may use, or too large relative
  to RAM (the `mlx-lm` README warns such models can be slow). Choose a smaller quantization or raise the
  wired-memory limit where supported.
- **Comparing numbers across builds.** The benchmark thread's own numbers moved by about a third in three years.
- **Expecting prompt speed from generation speed, or the reverse.** They are different regimes.

## Further reading & sources

- [llama.cpp](https://github.com/ggml-org/llama.cpp) - the project README: LLM inference in C/C++, Apple silicon via ARM NEON, Accelerate and Metal, and the supported backends and quantization range.
- [llama.cpp quantize tool README](https://github.com/ggml-org/llama.cpp/blob/master/tools/quantize/README.md) - the GGUF conversion and `llama-quantize` workflow, and the bits-per-weight and size table used here.
- [Performance of llama.cpp on Apple Silicon M-series](https://github.com/ggml-org/llama.cpp/discussions/4167) - the measured prompt-processing and generation rates, with bandwidth per chip, used to check the ceiling formula.
- [GGUF specification](https://github.com/ggml-org/ggml/blob/master/docs/gguf.md) - what the file format contains and why it is single-file and mmap-friendly.
- [llama.cpp build guide](https://github.com/ggml-org/llama.cpp/blob/master/docs/build.md) - confirms Metal is on by default on macOS and how to disable GPU inference.
- [llama.cpp token generation performance tips](https://github.com/ggml-org/llama.cpp/blob/master/docs/development/token_generation_performance_tips.md) - the thread-count guidance cited in the troubleshooting section.
- [MLX documentation: Unified Memory](https://ml-explore.github.io/mlx/build/html/usage/unified_memory.html) - Apple's description of the CPU and GPU sharing one memory pool.
- [MLX LM](https://github.com/ml-explore/mlx-lm) - Apple's Python package for running, quantizing and fine-tuning LLMs on Apple silicon, including the large-model wired-memory note.

## Next

[Module 15: Capstone Project](../15-capstone-project/README.md)
