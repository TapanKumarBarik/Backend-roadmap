# Module 15: On-Device and Edge Inference

## Roadmap

You are in Track 06, **OpenAI & the Model Landscape**. The previous modules were about calling models that live on someone else's servers. Module 12 covered [open-weight models](../12-open-weight-models-llama-mistral-qwen/README.md), module 13 the [Hugging Face ecosystem](../13-the-hugging-face-ecosystem/README.md) and module 14 [small language models](../14-small-language-models/README.md). This module puts those pieces together on the other side of the network: running a model on the phone, laptop, browser tab or small board that your user already owns.

It builds on three earlier modules and does not re-teach them: [Track 04, Module 15](../../04-training-fine-tuning-and-alignment/15-quantization-int8-int4-gguf/README.md) (what quantisation does to a model), [Track 05, Module 05](../../05-gpus-and-genai-hardware/05-calculating-a-models-memory-requirements/README.md) (the memory formulas) and [Track 05, Module 14](../../05-gpus-and-genai-hardware/14-running-models-on-cpu-and-apple-silicon/README.md) (the bandwidth-bound decode estimate, checked against measured llama.cpp numbers). Module 16 then looks at what the cloud side of a hybrid costs, and module 17 at routing between providers.

After this module you can:

- name the real constraints on an edge device (memory, memory bandwidth, heat, battery, download size, storage) and compute which of them stops a given model;
- use a small calculator to answer "does model X at quantisation Y fit device Z with context C, and how fast will it decode?";
- place the main on-device runtimes into categories using what their own documentation says, and know what to check before picking one;
- design the hybrid pattern (on-device first, cloud fallback) with explicit rules for privacy, offline use, battery and escalation;
- read a simulation of such a router and say which trade-offs it shows and which it cannot.

Why it matters: "run it locally" is the answer to three different problems (privacy, offline use, per-token cost) and a wrong answer to several others (quality, long context, battery). Knowing the arithmetic lets you say which problem you actually have before you commit to shipping a multi-gigabyte file to every user.

## Concept

> [!key] On-device inference is a budgeting problem. The model file must fit in the memory your app may use, every generated token streams roughly the whole file through the memory bus (so tokens per second is at most bandwidth divided by bytes per token), and heat, battery and download size cap what is sustainable. Quantisation moves all of those budgets at once; a hybrid router decides, request by request, when the device is enough and when to ask the cloud.

## Explanation

### Why run a model on the device at all

Three honest reasons, and each has a cost:

- **Privacy.** If the model runs on the device, the text need not leave it. Apple's `coremltools` README states the general case: "Running a model strictly on the user's device removes any need for a network connection, which helps keep the user's data private and your app responsive." Note what this does not say: your app can still log, sync or upload the text. Privacy is a property of the whole data path, not of where the matrix multiplications run.
- **Offline use and latency independence.** No network means no outage, no round trip and no dependence on a provider's availability. The price is that you now own latency: a phone decodes far slower than a datacenter GPU (the simulation below shows it).
- **Marginal cost.** Tokens generated on the user's hardware do not appear on your API bill. They still cost something: battery, heat, a large download, and engineering for every device tier you support.

Reasons that sound right but usually are not: "it will be faster" (usually not for decode), "it will be better" (a model small enough to fit a phone is a small model; see [module 14](../14-small-language-models/README.md)) and "it is free" (see above).

### The constraints, in the order they usually bite

**1. Memory capacity.** The weights, the KV cache (which grows with context) and runtime buffers must fit in what the operating system lets your app keep. That is a fraction of installed RAM, and the fraction varies by platform and by what else is running; the calculator below takes it as a parameter (`app_fraction`) because there is no portable number. The formulas are the ones in [Track 05, Module 05](../../05-gpus-and-genai-hardware/05-calculating-a-models-memory-requirements/README.md):

```
weights   = parameters x bits per weight / 8
KV cache  = 2 x layers x kv_heads x head_dim x bytes per value x tokens in context
need      = weights + KV cache + runtime overhead        (must be <= the app's memory budget)
```

llama.cpp's [quantize README](https://github.com/ggml-org/llama.cpp/blob/master/tools/quantize/README.md) is blunt about the loading side: "As the models are currently fully loaded into memory, you will need adequate disk space to save them and sufficient RAM to load them. At the moment, memory and disk requirements are the same" (page checked Oct 2026; it may have changed). The [GGUF specification](https://github.com/ggml-org/ggml/blob/master/docs/gguf.md) lists `mmap` compatibility as a design goal, which helps load time; how many pages the operating system keeps resident while you decode is not something to count on, so budget for the whole file.

**2. Memory bandwidth.** This is the limit on decode speed, derived in [Track 05, Module 14](../../05-gpus-and-genai-hardware/14-running-models-on-cpu-and-apple-silicon/README.md) and only restated here. Producing one token at batch size one reads (almost) every weight once, plus the KV cache so far:

```
tokens per second  <=  memory bandwidth (bytes/s) / (weight bytes + KV-cache bytes at the current context)
```

Real speed is lower: the measured llama.cpp rows compared in that module reached 45% to 86% of this ceiling. The calculator below applies an `EFFICIENCY` of 0.60 as an explicit assumption. Two consequences carry over: halving the bits per weight roughly doubles the ceiling, and a long context makes every token slower because the cache is read too. Prompt processing (prefill) is a different regime: it reuses each weight many times and is limited by arithmetic, not bandwidth, so time to first token for a long prompt is its own estimate.

**3. Heat and battery.** A phone or thin laptop can run at full speed for a short burst and then slows down to protect itself. [Android's Thermal API documentation](https://developer.android.com/games/optimize/adpf/thermal) says it plainly: "Devices can only maintain a high level of performance for a limited amount of time before being thermally throttled." That page is written for games, but the mechanism is the same for an LLM that keeps every core busy for minutes. It describes a status scale (from `THERMAL_STATUS_NONE` up through `THERMAL_STATUS_SEVERE` and beyond) and `getThermalHeadroom()`, a value from 0.0 (no throttling) to 1.0 (heavy throttling), and advises calling it no more than once every 10 seconds (checked Oct 2026). The design lesson is to plan on the sustained speed, not the first-seconds speed, and to read the device's thermal state so the app can shorten outputs or hand the request to the cloud before it becomes unusable. Energy follows from power over time: joules per token is watts divided by tokens per second, so a slower, hotter device also spends more battery per answer.

**4. Download size and storage.** The file size is the weight bytes. It has to be downloaded once (first-run experience), stored (a quota in a browser, free space on a phone), updated when you ship a better model, and verified. A 2 GB file is a very different product decision from a 20 MB one.

> [!model] Think of the device as a small apartment with a narrow doorway. Capacity is the floor area (will the furniture fit), bandwidth is the doorway (how fast you can carry things past the person who needs them), heat is the air conditioning (you can sprint for a minute, not an hour), and the download is the moving truck. Quantisation shrinks the furniture; it helps with all four at once, which is why it is the first lever.

### Quantisation choices (link, do not re-teach)

[Track 04, Module 15](../../04-training-fine-tuning-and-alignment/15-quantization-int8-int4-gguf/README.md) explains how quantisation works. What matters here is the menu and the trade. llama.cpp's quantize README tabulates, for Llama-3.1-8B, bits per weight and file size for each format; four rows (page checked Oct 2026):

| Format | Bits per weight | File size (GiB, 8B model) |
| --- | --- | --- |
| F16 | 16.0005 | 14.96 |
| Q8_0 | 8.5008 | 7.95 |
| Q4_K_M | 4.8944 | 4.58 |
| Q2_K | 3.1593 | 2.95 |

Bits per weight sit above the nominal 16, 8, 4 and 2 because block formats store scale factors next to the weights. The same README says quantization "may introduce some accuracy loss" which is "usually measured in Perplexity (ppl) and/or Kullback-Leibler Divergence (kld)". So the table above prices the memory side only; whether your task still works at Q2_K is something you measure on your own evaluation set. The calculator below uses exactly these bits-per-weight values for every model, which is an approximation for models other than the one in the table.

> [!pitfall] Two different "bits" mistakes. First, treating "4-bit" as 4.0 bits per weight: use the published figure (4.89 for Q4_K_M). Second, quantising the weights and forgetting the KV cache: at long context the cache can be a large part of the memory and of the bytes read per token. Runtimes can often store the cache in fewer bits too; the calculator takes `kv_bytes` for this, and block 3 shows the effect.

### The runtime landscape, by category (docs read Oct 2026)

A runtime is the program that loads a model file and executes it on your hardware. They differ by target (CPU, GPU, NPU, browser), by file format, and by how much they assume about the model. The list below covers only runtimes whose own documentation or README I fetched and read for this module (all checked Oct 2026; docs change, so treat the official pages as the source of truth). It is a map of categories, not a ranking.

- **C/C++ engine with its own file format: [llama.cpp](https://github.com/ggml-org/llama.cpp) and GGUF.** The README describes it as "LLM inference in C/C++", a "Plain C/C++ implementation without any dependencies" with "Apple silicon ... a first-class citizen", 1.5-bit to 8-bit integer quantization, and "CPU+GPU hybrid inference to partially accelerate models larger than the total VRAM capacity". Its backend table names (among others) CUDA, Metal (Apple silicon), Vulkan, OpenCL (Adreno GPU), Hexagon (Snapdragon) and WebGPU. GGUF is "a file format for storing models for inference with GGML and executors based on GGML", designed for single-file deployment. An [Android guide](https://github.com/ggml-org/llama.cpp/blob/master/docs/android.md) covers an Android Studio binding and building the CLI under Termux. Think: a very wide list of hardware backends and one quantised file per model.
- **Apple-silicon array framework: [MLX](https://github.com/ml-explore/mlx) and [mlx-lm](https://github.com/ml-explore/mlx-lm).** MLX is "an array framework for machine learning on Apple silicon" with a unified memory model: "Arrays in MLX live in shared memory. Operations on MLX arrays can be performed on any of the supported device types without transferring data." The `mlx-lm` package is for "generating text and fine-tuning large language models on Apple silicon" and can quantize models; it exposes `--max-kv-size` for a rotating fixed-size KV cache ("Smaller values like 512 will use very little RAM but result in worse quality") and prompt caching. Think: Python-first on a Mac.
- **Graph runtime with pluggable hardware backends: [ONNX Runtime](https://onnxruntime.ai/docs/execution-providers/).** The README calls it "a cross-platform inference and training machine-learning accelerator". Its execution-provider (EP) page explains the design: ONNX Runtime "works with the execution provider(s) using the GetCapability() interface to allocate specific nodes or sub-graphs for execution by the EP library in supported hardware", and a provider list "is ordered by Priority. For example ['CUDAExecutionProvider', 'CPUExecutionProvider'] means execute a node using CUDAExecutionProvider if capable, otherwise execute using CPUExecutionProvider." The page lists providers for NVIDIA, Intel, DirectML, Qualcomm QNN, WebGPU, Apple CoreML (marked preview there), and Android NNAPI and XNNPACK among the IoT/edge/mobile ones. Think: the "export once to ONNX, choose hardware per deployment" route, also used under the hood by Transformers.js.
- **Platform-native framework: Core ML.** Apple's framework, reached from other ecosystems through [`coremltools`](https://github.com/apple/coremltools), which converts models from TensorFlow and PyTorch. Its README: "Core ML optimizes on-device performance by leveraging the CPU, GPU, and Neural Engine while minimizing its memory footprint and power consumption." Think: the route for an iOS or macOS app that wants the Neural Engine and system integration. (I read the `coremltools` README; I did not read Apple's framework pages.)
- **PyTorch-native export for phones to microcontrollers: [ExecuTorch](https://github.com/pytorch/executorch).** "PyTorch's open source stack for running AI locally on phones, wearables, laptops, browsers, embedded systems, and microcontrollers": start from a PyTorch model, capture it with `torch.export`, lower it to a backend, run it through C++, Python, Swift/Objective-C, Kotlin/Java or JavaScript APIs. Its README warns that a `.pte` is specialised: "a `.pte` built for one hardware delegate is not a universal model file", and that you must "validate numerical accuracy, memory use, and performance on the target". Think: when you need one PyTorch source model shipped inside a native mobile or embedded app.
- **Google's on-device stack: [LiteRT](https://github.com/google-ai-edge/LiteRT), [LiteRT-LM](https://developers.google.com/edge/litert-lm/overview) and MediaPipe.** LiteRT is "Google's on-device runtime for high-performance ML & GenAI deployment on edge platforms" and "continues the legacy of TensorFlow Lite". For language models the docs point to LiteRT-LM: "the production-ready orchestration layer to run LLMs with LiteRT", with "Cross-Platform Support: Run on Android, iOS, Web, Desktop, and IoT (e.g. Raspberry Pi)" and CPU, GPU and NPU acceleration. The older [MediaPipe LLM Inference API](https://developers.google.com/edge/mediapipe/solutions/genai/llm_inference) page now carries this notice: it "is now in maintenance-only mode. New features and optimizations will be focused on LiteRT-LM." That is a live example of why you isolate the runtime behind your own interface.
- **In the browser on WebGPU: [WebLLM](https://github.com/mlc-ai/web-llm) and [Transformers.js](https://github.com/huggingface/transformers.js).** WebLLM is a "high-performance in-browser LLM inference engine"; "Everything runs inside the browser with no server support and is accelerated with WebGPU", with an OpenAI-style chat API. It warns that "loading models requires downloading and it can take a significant amount of time for the very first run without caching", and offers cache backends (the browser Cache API by default, IndexedDB, OPFS). Transformers.js runs Hugging Face models through ONNX Runtime; in the browser it runs on the CPU (WASM) by default and on the GPU with `device: 'webgpu'`, with `dtype` choices of `fp32`, `fp16`, `q8` and `q4`, and its README warns that "The WebGPU API is still experimental in many browsers". [MDN](https://developer.mozilla.org/en-US/docs/Web/API/WebGPU_API) lists WebGPU as available only in secure contexts (HTTPS) and as "Limited availability" (not Baseline), so feature-detect `navigator.gpu` and keep a fallback.

What the landscape tells you to check, whichever runtime you pick: which hardware backends it supports on your target devices; which file format it needs and whether your model converts without losing an operator you use; which quantisation formats it supports; whether its API gives you streaming, a chat template and cancellation; how it behaves under memory pressure; and how often its interface changes. The llama.cpp README as fetched uses `llama cli` and `llama serve` command names, while its own `docs/development/token_generation_performance_tips.md` still shows `./llama-cli`; older tutorials use yet other names. Always read `--help` for the build you have.

### The hybrid pattern: on-device first, cloud fallback

Most real products do not pick one side. The pattern has four decisions, each a rule you write down and test:

1. **Can the device do this at all?** Decided before trying: the prompt exceeds the device's context budget, the model file is not downloaded yet, the device tier is too weak, the task needs a tool that is only reachable over the network.
2. **Should it, right now?** Battery low, thermal state serious, app in the background, user set "never use mobile data". Read these from the platform and treat them as inputs to routing.
3. **Was the answer good enough?** Known only after the device answers. A confidence signal (self-reported probability, a validator, a schema check, a verifier model) triggers escalation. Be honest about how weak such signals are: the simulation below gives the router a noisy-but-informative confidence by assumption, and getting that in reality is hard.
4. **Is the data allowed to leave?** A privacy rule is a constraint, not a preference: for data marked sensitive the router must fail closed (a degraded local answer or an explicit error), never silently call the cloud.

Cost shows up three ways: cloud dollars for escalated requests, wasted device time for answers that were then thrown away, and added latency for those requests (device time plus cloud time). Module 16 covers pricing and rate limits for the cloud half; [module 17](../17-provider-abstraction-and-model-routing/README.md) generalises the routing idea to several providers.

## Code

Blocks 1 to 4 are cumulative: copy them in order into one file (`edge_budget.py`) and run it. They use the standard library, plus `numpy` for the simulation in block 4. Outputs below were produced by running exactly this code with Python 3.13; everything is seeded or deterministic. **Every device in this file is ILLUSTRATIVE: invented round numbers chosen to make the arithmetic visible, not specifications of any real product.** The model shapes are also illustrative, except the 8B row, which is the Llama-3-8B shape from Track 05, Module 05. Nothing here runs a model; it is budgeting arithmetic and a simulation.

### 1. The device-budget calculator

The memory formulas are Track 05, Module 05's, re-stated in a few lines so this file stands alone. The two assumptions that are mine, not a source's, are labelled in the code: the runtime overhead and the decode efficiency.

```python
"""edge_budget.py - does model X at quantisation Y fit device Z with context C?  Standard library only.
ESTIMATES. Every device spec in this file is ILLUSTRATIVE (made-up round numbers), not a real product."""
from dataclasses import dataclass

GIB, GB = 2**30, 1e9

# Bits per weight, copied from the llama.cpp quantize README table for Llama-3.1-8B (checked Oct 2026).
# Block formats store scales next to the weights, so they sit above the nominal 16 / 8 / 4 / 2.
BITS_PER_WEIGHT = {"f16": 16.0005, "q8_0": 8.5008, "q4_k_m": 4.8944, "q2_k": 3.1593}


@dataclass(frozen=True)
class Arch:
    """The architecture numbers that decide memory (same symbols as Track 05, module 05)."""
    name: str
    layers: int
    hidden: int
    heads: int
    kv_heads: int
    ffn: int
    vocab: int
    tied: bool = False          # input embedding and output head share one table

    @property
    def head_dim(self):
        return self.hidden // self.heads

    def params(self):           # Llama-style block: no biases, 3-matrix MLP, 2 norms per layer
        attn = 2 * self.hidden * self.hidden + 2 * self.hidden * self.kv_heads * self.head_dim
        per_layer = attn + 3 * self.hidden * self.ffn + 2 * self.hidden
        embed = self.vocab * self.hidden
        return self.layers * per_layer + embed * (1 if self.tied else 2) + self.hidden

    def kv_bytes_per_token(self, kv_bytes=2):       # 2 (K and V) x layers x kv_heads x head_dim x bytes
        return 2 * self.layers * self.kv_heads * self.head_dim * kv_bytes


@dataclass(frozen=True)
class Device:
    name: str
    ram_gb: float
    app_fraction: float         # share of RAM your app can realistically use (OS and other apps take the rest)
    bandwidth_gbs: float        # memory bandwidth, GB/s
    free_storage_gb: float
    sustained: float            # fraction of burst speed kept once the device heats up (1.0 = no throttling)
    watts: float                # power drawn while decoding
    battery_wh: float           # 0 = mains powered


OVERHEAD_FRAC, OVERHEAD_FIXED = 0.10, 0.25 * GIB    # ASSUMPTION: runtime buffers = 10% of weights + 0.25 GiB
EFFICIENCY = 0.60           # ASSUMPTION: real decode reaches ~45-86% of the ceiling (Track 05, module 14)


def check(arch, quant, dev, ctx, kv_bytes=2):
    """Everything the budget question needs, in one dict."""
    weights = arch.params() * BITS_PER_WEIGHT[quant] / 8               # = model file size, roughly
    kv = arch.kv_bytes_per_token(kv_bytes) * ctx
    overhead = OVERHEAD_FRAC * weights + OVERHEAD_FIXED
    need, budget = weights + kv + overhead, dev.ram_gb * dev.app_fraction * GIB
    ceiling = dev.bandwidth_gbs * GB / (weights + kv)                  # tokens/s <= bandwidth / bytes per token
    burst = ceiling * EFFICIENCY
    sustained = burst * dev.sustained
    j_per_token = dev.watts / sustained
    batt_pct_1k = 1000 * j_per_token / (dev.battery_wh * 3600) * 100 if dev.battery_wh else 0.0
    verdict = ("RAM" if need > budget else "DISK" if weights / GB > dev.free_storage_gb else
               "tight" if need > 0.85 * budget else "ok")
    return dict(weights=weights, kv=kv, need=need, budget=budget, burst=burst, sustained=sustained,
                batt_pct_1k=batt_pct_1k, verdict=verdict)


def max_context(arch, quant, dev, kv_bytes=2):
    """Longest context whose KV cache still fits in what is left after weights and overhead."""
    r = check(arch, quant, dev, 0, kv_bytes)
    spare = r["budget"] - r["need"]
    return max(0, int(spare // arch.kv_bytes_per_token(kv_bytes)))
```

### 2. Which model fits which device? (and a cross-check against a published number)

The first printed line checks the calculator against the llama.cpp quantize README's sizes for the 8B model (14.96 and 4.58 GiB); the 0.01 GiB differences come from the rounded vocabulary size that Track 05 uses. The grids then use context 4096.

```python
# Shapes are ILLUSTRATIVE except the 8B one, which is the Llama-3-8B row of Track 05, module 05 (Llama 3 paper, Table 3).
MODELS = [
    Arch("0.5B-shape", layers=24, hidden=896,  heads=14, kv_heads=2, ffn=4864,  vocab=150_000, tied=True),
    Arch("1.5B-shape", layers=28, hidden=1536, heads=12, kv_heads=2, ffn=8960,  vocab=150_000, tied=True),
    Arch("3B-shape",   layers=36, hidden=2048, heads=16, kv_heads=2, ffn=11008, vocab=150_000, tied=True),
    Arch("8B",         layers=32, hidden=4096, heads=32, kv_heads=8, ffn=14336, vocab=128_000),
]
# ILLUSTRATIVE devices: invented round numbers so the arithmetic is visible. Replace with your real targets.
DEVICES = [
    Device("phone-6GB",        ram_gb=6,  app_fraction=0.40, bandwidth_gbs=25, free_storage_gb=12,  sustained=0.60, watts=4,  battery_wh=15),
    Device("phone-12GB",       ram_gb=12, app_fraction=0.50, bandwidth_gbs=60, free_storage_gb=60,  sustained=0.65, watts=6,  battery_wh=17),
    Device("laptop-16GB-cpu",  ram_gb=16, app_fraction=0.60, bandwidth_gbs=70, free_storage_gb=200, sustained=0.80, watts=25, battery_wh=60),
    Device("laptop-32GB-unif", ram_gb=32, app_fraction=0.65, bandwidth_gbs=200, free_storage_gb=300, sustained=0.85, watts=30, battery_wh=70),
    Device("browser-tab",      ram_gb=16, app_fraction=0.25, bandwidth_gbs=60, free_storage_gb=2,  sustained=0.70, watts=15, battery_wh=60),
    Device("sbc-4GB",          ram_gb=4,  app_fraction=0.70, bandwidth_gbs=8,  free_storage_gb=20,  sustained=0.80, watts=5,  battery_wh=0),
]

# Cross-check against a published number: llama.cpp's quantize README lists Llama-3.1-8B at 14.96 GiB (F16)
# and 4.58 GiB (Q4_K_M). Our shape-based count should land close.
eight = MODELS[3]
f16 = eight.params() * BITS_PER_WEIGHT["f16"] / 8 / GIB
q4 = eight.params() * BITS_PER_WEIGHT["q4_k_m"] / 8 / GIB
print(f"8B shape: {eight.params()/1e9:.2f}B params | F16 {f16:.2f} GiB (README 14.96) | Q4_K_M {q4:.2f} GiB (README 4.58)")
print(f"KV cache per token, 8B, fp16 cache: {eight.kv_bytes_per_token()/1024:.0f} KiB\n")

CTX = 4096
print(f"Can it run? context {CTX}, fp16 KV cache. Cell = sustained tokens/s, or the reason it cannot run.")
print("(RAM = over the app's memory budget, DISK = file bigger than free storage, * = fits but over 85% of budget)\n")
quants = list(BITS_PER_WEIGHT)
for dev in DEVICES:
    budget = dev.ram_gb * dev.app_fraction
    print(f"{dev.name}  (app budget {budget:.1f} GiB, {dev.bandwidth_gbs} GB/s, free storage {dev.free_storage_gb} GB)")
    print(f"  {'model':<11}" + "".join(f"{q:>9}" for q in quants))
    for m in MODELS:
        cells = []
        for q in quants:
            r = check(m, q, dev, CTX)
            cells.append(r["verdict"] if r["verdict"] in ("RAM", "DISK") else
                         f"{r['sustained']:.1f}" + ("*" if r["verdict"] == "tight" else ""))
        print(f"  {m.name:<11}" + "".join(f"{c:>9}" for c in cells))
    print()
```

```
8B shape: 8.03B params | F16 14.95 GiB (README 14.96) | Q4_K_M 4.57 GiB (README 4.58)
KV cache per token, 8B, fp16 cache: 128 KiB

Can it run? context 4096, fp16 KV cache. Cell = sustained tokens/s, or the reason it cannot run.
(RAM = over the app's memory budget, DISK = file bigger than free storage, * = fits but over 85% of budget)

phone-6GB  (app budget 2.4 GiB, 25 GB/s, free storage 12 GB)
  model            f16     q8_0   q4_k_m     q2_k
  0.5B-shape       8.7     15.7     25.6     36.8
  1.5B-shape       RAM      5.1      8.5     12.4
  3B-shape         RAM      RAM     4.4*      6.6
  8B               RAM      RAM      RAM      RAM

phone-12GB  (app budget 6.0 GiB, 60 GB/s, free storage 60 GB)
  model            f16     q8_0   q4_k_m     q2_k
  0.5B-shape      22.6     40.8     66.6     95.6
  1.5B-shape       7.3     13.3     22.1     32.2
  3B-shape         RAM      6.8     11.5     17.1
  8B               RAM      RAM     4.3*      6.3

laptop-16GB-cpu  (app budget 9.6 GiB, 70 GB/s, free storage 200 GB)
  model            f16     q8_0   q4_k_m     q2_k
  0.5B-shape      32.5     58.6     95.6    137.3
  1.5B-shape      10.5     19.1     31.7     46.3
  3B-shape         5.3      9.8     16.5     24.6
  8B               RAM     3.7*      6.2      9.1

laptop-32GB-unif  (app budget 20.8 GiB, 200 GB/s, free storage 300 GB)
  model            f16     q8_0   q4_k_m     q2_k
  0.5B-shape      98.6    177.9    290.2    416.8
  1.5B-shape      31.9     58.1     96.2    140.5
  3B-shape        16.2     29.8     50.1     74.6
  8B               6.1     11.2     18.7     27.5

browser-tab  (app budget 4.0 GiB, 60 GB/s, free storage 2 GB)
  model            f16     q8_0   q4_k_m     q2_k
  0.5B-shape      24.4     43.9     71.7    103.0
  1.5B-shape      DISK     14.4     23.8     34.7
  3B-shape         RAM     DISK     12.4     18.4
  8B               RAM      RAM      RAM     DISK

sbc-4GB  (app budget 2.8 GiB, 8 GB/s, free storage 20 GB)
  model            f16     q8_0   q4_k_m     q2_k
  0.5B-shape       3.7      6.7     10.9     15.7
  1.5B-shape       RAM      2.2      3.6      5.3
  3B-shape         RAM      RAM      1.9      2.8
  8B               RAM      RAM      RAM      RAM
```

Reading the grid: bigger models drop out of the small devices first on `RAM`; `DISK` marks files that exceed free storage even though RAM would do (the browser-tab row uses a deliberately small storage quota); a `*` means it fits but leaves under 15% of the budget as headroom, which is thin if the operating system takes memory back or your context grows. The tokens-per-second numbers are the bandwidth ceiling times the 0.60 efficiency times the device's sustained fraction. They are estimates from invented devices; use them to see how the budgets trade against each other, not to predict a phone.

### 3. Context length, KV precision, battery and download size

```python
# What changes with context length, KV-cache precision, battery and download size (same ILLUSTRATIVE devices).
by_name = {d.name: d for d in DEVICES}
phone, model = by_name["phone-12GB"], MODELS[2]                      # 3B-shape at Q4_K_M
print(f"{model.name} Q4_K_M on {phone.name}: {model.params()/1e9:.2f}B params, file ~{check(model,'q4_k_m',phone,0)['weights']/GB:.2f} GB")
print(f"KV per token: fp16 cache {model.kv_bytes_per_token(2)/1024:.0f} KiB, int8 cache {model.kv_bytes_per_token(1)/1024:.0f} KiB\n")
print(f"{'context':>8} {'KV GiB':>7} {'need GiB':>9} {'verdict':>8} {'tok/s sustained':>16}")
for ctx in (512, 4096, 16384, 32768, 65536):
    r = check(model, "q4_k_m", phone, ctx)
    print(f"{ctx:>8} {r['kv']/GIB:>7.2f} {r['need']/GIB:>9.2f} {r['verdict']:>8} {r['sustained']:>16.1f}")
print(f"\nlongest context that fits the {phone.ram_gb*phone.app_fraction:.1f} GiB budget: "
      f"fp16 cache {max_context(model,'q4_k_m',phone,2):,} tokens, int8 cache {max_context(model,'q4_k_m',phone,1):,} tokens")

print("\nBattery and heat (ILLUSTRATIVE watts), 3B-shape Q4_K_M, context 4096:")
print(f"{'device':<18}{'burst tok/s':>12}{'sustained':>10}{'battery % per 1k tokens':>25}")
for d in DEVICES:
    r = check(model, "q4_k_m", d, 4096)
    if r["verdict"] in ("RAM", "DISK"):
        print(f"{d.name:<18}{'does not run (' + r['verdict'] + ')':>47}")
    else:
        batt = f"{r['batt_pct_1k']:.2f}" if d.battery_wh else "mains"
        print(f"{d.name:<18}{r['burst']:>12.1f}{r['sustained']:>10.1f}{batt:>25}")

print("\nDownload size of the 3B-shape file by quantisation (time at ILLUSTRATIVE 20 and 100 Mbit/s):")
print(f"{'quant':<8}{'GB':>6}{'min @20Mbps':>13}{'min @100Mbps':>14}")
for q in BITS_PER_WEIGHT:
    gb = check(model, q, phone, 0)["weights"] / GB
    print(f"{q:<8}{gb:>6.2f}{gb*8e9/20e6/60:>13.1f}{gb*8e9/100e6/60:>14.1f}")
```

```
3B-shape Q4_K_M on phone-12GB: 3.08B params, file ~1.89 GB
KV per token: fp16 cache 36 KiB, int8 cache 18 KiB

 context  KV GiB  need GiB  verdict  tok/s sustained
     512    0.02      2.20       ok             12.3
    4096    0.14      2.32       ok             11.5
   16384    0.56      2.74       ok              9.4
   32768    1.12      3.31       ok              7.6
   65536    2.25      4.43       ok              5.4

longest context that fits the 6.0 GiB budget: fp16 cache 111,218 tokens, int8 cache 222,437 tokens

Battery and heat (ILLUSTRATIVE watts), 3B-shape Q4_K_M, context 4096:
device             burst tok/s sustained  battery % per 1k tokens
phone-6GB                  7.4       4.4                     1.68
phone-12GB                17.7      11.5                     0.85
laptop-16GB-cpu           20.6      16.5                     0.70
laptop-32GB-unif          58.9      50.1                     0.24
browser-tab               17.7      12.4                     0.56
sbc-4GB                    2.4       1.9                    mains

Download size of the 3B-shape file by quantisation (time at ILLUSTRATIVE 20 and 100 Mbit/s):
quant       GB  min @20Mbps  min @100Mbps
f16       6.16         41.1           8.2
q8_0      3.27         21.8           4.4
q4_k_m    1.89         12.6           2.5
q2_k      1.22          8.1           1.6
```

Three things to notice. Context costs speed: at 65,536 tokens the same model decodes at less than half the speed it does at 512, because the cache is read for every token. "Longest context that fits" is a memory answer only: it says nothing about the context the model was trained for or how long the prefill takes, so a model's documented context window is a second, separate limit. And the download table is the reason first-run experience matters: the same model is 6 GB at F16 and under 2 GB at Q4_K_M.

### 4. A seeded simulation of the hybrid router

Policies compared: `cloud_only`; `device_only`; `hybrid` (device first, escalate on low confidence, or when the prompt is too long, or the battery is low); and `hybrid_private` (the same, but sensitive requests never go to the cloud). **Every parameter is an assumption** (skill levels, latencies, prices, outage rate, the confidence signal); the point is the shape of the trade-offs and a harness you can re-run with your own numbers.

```python
import numpy as np

# A seeded simulation of "on-device first, cloud fallback". EVERY number below is an ASSUMPTION chosen to make the
# trade-offs visible; nothing here is measured on a real phone or a real API.
rng = np.random.default_rng(7)
N = 4000

# --- the workload -------------------------------------------------------------------------------------------
prompt = np.clip(rng.lognormal(np.log(400), 1.2, N), 20, 12000).astype(int)    # prompt tokens
output = np.clip(rng.lognormal(np.log(150), 0.7, N), 10, 800).astype(int)       # answer tokens
difficulty = rng.beta(2, 3, N)                                                  # 0 = trivial, 1 = very hard
sensitive = rng.random(N) < 0.25                                                # contains data that should not leave
hot = rng.random(N) < 0.15                                                      # device is thermally throttled now
battery_low = rng.random(N) < 0.10
online = np.empty(N, bool); state = True                                        # two-state network: runs of outages
for i in range(N):
    state = (rng.random() > 0.02) if state else (rng.random() < 0.20)
    online[i] = state

# --- the two "models": a skill number each, and P(correct) = sigmoid(8 * (skill - difficulty)) -----------------
SKILL_DEVICE, SKILL_CLOUD = 0.40, 0.75
p_dev = 1 / (1 + np.exp(-8 * (SKILL_DEVICE - difficulty)))
p_cloud = 1 / (1 + np.exp(-8 * (SKILL_CLOUD - difficulty)))
dev_correct, cloud_correct = rng.random(N) < p_dev, rng.random(N) < p_cloud
# the device model's own confidence: informative but noisy (ASSUMPTION; real confidence signals are hard to get)
confidence = np.clip(1 - difficulty + rng.normal(0, 0.15, N), 0, 1)

# --- latency and cost models (seconds, USD) --------------------------------------------------------------------
DEV_CTX, DEV_PREFILL, DEV_TPS = 4096, 300.0, 12.0           # device: max context, prompt tok/s, decode tok/s (cf. block 3)
CLOUD_RTT, CLOUD_TTFT, CLOUD_TPS = 0.12, 0.45, 70.0
PRICE_IN, PRICE_OUT = 0.50, 1.50                              # USD per 1M tokens, ILLUSTRATIVE
cloud_jitter = rng.lognormal(np.log(0.15), 0.8, N)            # network and queueing noise

def device_time(i):
    k = 0.6 if hot[i] else 1.0
    return prompt[i] / (DEV_PREFILL * k) + output[i] / (DEV_TPS * k)

def cloud_time(i):
    return CLOUD_RTT + CLOUD_TTFT + cloud_jitter[i] + output[i] / CLOUD_TPS

def cloud_cost(i):
    return (prompt[i] * PRICE_IN + output[i] * PRICE_OUT) / 1e6

def run(policy, threshold=0.5):
    lat, cost, correct, answered, on_dev, leaked = [], 0.0, 0, 0, 0, 0
    for i in range(N):
        fits = prompt[i] <= DEV_CTX
        t, used_cloud, ok = None, False, None
        if policy == "cloud_only":
            if online[i]: t, used_cloud, ok = cloud_time(i), True, cloud_correct[i]
        elif policy == "device_only":
            if fits: t, ok = device_time(i), dev_correct[i]
        else:                                                  # the two hybrid policies
            must_cloud = (not fits) or battery_low[i]          # known BEFORE trying: too long, or save the battery
            low_conf = confidence[i] < threshold               # known only AFTER the device has answered
            keep_local = policy == "hybrid_private" and sensitive[i]
            if keep_local: must_cloud = low_conf = False       # sensitive data never leaves the device
            if online[i] and (must_cloud or low_conf):
                wasted = 0.0 if must_cloud else device_time(i) # a low-confidence answer cost the device's full time
                t, used_cloud, ok = wasted + cloud_time(i), True, cloud_correct[i]
            elif fits:
                t, ok = device_time(i), dev_correct[i]         # offline or kept local: answer on the device
        if t is None:
            continue                                           # no answer at all
        answered += 1; lat.append(t); correct += bool(ok)
        if used_cloud: cost += cloud_cost(i); leaked += bool(sensitive[i])
        else: on_dev += 1
    lat = np.array(lat)
    return dict(answered=answered / N, correct=correct / N, p50=np.percentile(lat, 50), p95=np.percentile(lat, 95),
                usd_1k=cost / N * 1000, on_device=on_dev / N, leaked=leaked / sensitive.sum())

print(f"{N} requests | {online.mean():.1%} online | {sensitive.mean():.1%} sensitive | "
      f"{(prompt > DEV_CTX).mean():.1%} prompts exceed the device context | {hot.mean():.0%} throttled\n")
print(f"{'policy':<16}{'answered':>9}{'correct':>9}{'p50 s':>7}{'p95 s':>7}{'$/1k req':>9}{'on-device':>10}{'sensitive sent':>15}")
for pol in ("cloud_only", "device_only", "hybrid", "hybrid_private"):
    r = run(pol)
    print(f"{pol:<16}{r['answered']:>9.1%}{r['correct']:>9.1%}{r['p50']:>7.2f}{r['p95']:>7.2f}"
          f"{r['usd_1k']:>9.4f}{r['on_device']:>10.1%}{r['leaked']:>15.1%}")

print("\nConfidence threshold sweep for the 'hybrid_private' policy (higher = escalate to the cloud more often):")
print(f"{'threshold':>9}{'correct':>9}{'p95 s':>7}{'$/1k req':>9}{'on-device':>10}")
for th in (0.2, 0.4, 0.5, 0.6, 0.8):
    r = run("hybrid_private", th)
    print(f"{th:>9.1f}{r['correct']:>9.1%}{r['p95']:>7.2f}{r['usd_1k']:>9.4f}{r['on_device']:>10.1%}")
```

```
4000 requests | 90.4% online | 24.0% sensitive | 2.8% prompts exceed the device context | 15% throttled

policy           answered  correct  p50 s  p95 s $/1k req on-device sensitive sent
cloud_only          90.4%    78.7%   2.92   7.21   0.6093      0.0%          90.8%
device_only         97.2%    49.1%  15.72  45.23   0.0000     97.2%           0.0%
hybrid              99.7%    67.8%  15.02  46.29   0.3044     60.8%          39.3%
hybrid_private      99.0%    63.1%  15.15  46.27   0.2259     69.5%           0.0%

Confidence threshold sweep for the 'hybrid_private' policy (higher = escalate to the cloud more often):
threshold  correct  p95 s $/1k req on-device
      0.2    54.8%  44.44   0.1226     87.1%
      0.4    59.4%  45.29   0.1768     77.5%
      0.5    63.1%  46.27   0.2259     69.5%
      0.6    66.8%  46.69   0.2813     60.6%
      0.8    73.1%  47.85   0.3819     43.4%
```

In the table, `correct` is the share of all requests answered correctly (a request with no answer counts as wrong), and `sensitive sent` is the share of sensitive requests that reached the cloud. What the run shows, under these assumptions:

- `cloud_only` is the most accurate and fastest per request, leaks every sensitive request that goes through, and cannot answer during outages (it answers 90.4% of requests, exactly the online share).
- `device_only` never leaks and never goes offline, but it is the slowest (the median is over five times the cloud's) and the least accurate.
- `hybrid` recovers about two thirds of the accuracy gap between the device and the cloud for about half the cloud spend of `cloud_only`, at the device's latency (an escalated request pays for both attempts), and still sends 39.3% of sensitive requests to the cloud.
- `hybrid_private` sends none, at an accuracy cost of about 4.7 points relative to `hybrid`. That gap is the price of the privacy rule, and it is a number you can show a product owner.
- The threshold sweep is a dial: more escalation buys accuracy and costs dollars and on-device share. Where to set it depends on the value of a wrong answer, which no simulation knows.

### Runtime commands (NOT EXECUTED)

None of these were run for this module: no models were downloaded and no runtime was installed. They are copied from the official READMEs and docs fetched Oct 2026; command names and defaults change between releases, so check `--help` on your install.

```bash
# llama.cpp (README quick start): run a GGUF model straight from Hugging Face, or start an OpenAI-compatible server
llama cli -hf ggml-org/Qwen3.5-0.8B-GGUF
llama serve -hf ggml-org/Qwen3.5-0.8B-GGUF
# llama.cpp (quantize README): convert a GGUF to a smaller quantisation
./build/bin/llama-quantize gemma-4-E2B-it-bf16.gguf gemma-4-E2B-it-Q4_K_M.gguf Q4_K_M

# MLX LM on a Mac (mlx-lm README)
pip install mlx-lm
mlx_lm.generate --prompt "How tall is Mt Everest?"
mlx_lm.convert --model mistralai/Mistral-7B-Instruct-v0.3 -q
```

```python
# ONNX Runtime: choose execution providers in priority order (EP page, checked Oct 2026).
# NOT EXECUTED: needs onnxruntime and a model.onnx file.
import onnxruntime as rt
sess = rt.InferenceSession("model.onnx", providers=["CUDAExecutionProvider", "CPUExecutionProvider"])
# a node runs on the first provider that supports it, otherwise on the next one
```

```javascript
// WebLLM in the browser (adapted from the README example). NOT EXECUTED: needs a WebGPU-capable browser; first load downloads the model.
import { CreateMLCEngine } from "@mlc-ai/web-llm";
const engine = await CreateMLCEngine("Llama-3.1-8B-Instruct-q4f32_1-MLC", { initProgressCallback: console.log });
const reply = await engine.chat.completions.create({ messages: [{ role: "user", content: "Hello!" }] });
```

For ExecuTorch, LiteRT-LM and Core ML the export step is model- and platform-specific; follow each project's current getting-started guide (linked in Further reading) rather than a snippet copied into a curriculum.

## Visual diagram

```
  DEVICE BUDGET: four gates a model must pass                      (block 1 computes these)

  model file ──► [ 1. DISK / DOWNLOAD ]  file <= free storage?  first-run download time?
      │
      ▼
  [ 2. RAM ]   weights + KV cache(ctx) + overhead  <=  app budget (a fraction of installed RAM)
      │            │
      │            └── KV cache grows linearly with context; int8 KV halves it
      ▼
  [ 3. BANDWIDTH ]   tokens/s <= bandwidth / (weight bytes + KV bytes)      x efficiency (~0.45-0.86 measured)
      │
      ▼
  [ 4. HEAT / BATTERY ]   burst speed ──► sustained speed (throttling)      joules/token = watts / (tokens/s)


  HYBRID ROUTER: one request

  request ──► sensitive? ──yes──► stay on device (fail closed: degrade or error, never call the cloud)
      │ no
      ▼
  device can't (prompt > ctx, no model yet, battery low, hot) ──────────────┐
      │ can                                                                  │
      ▼                                                                      │
  run on device ──► confident? ──yes──► answer (no cloud cost)              │
                        │ no                                                 │
                        ▼                                                    ▼
                     online? ──no──► keep the device answer          ┌────────────────┐
                        │ yes                                        │  cloud model   │──► answer
                        └──────────────────────────────────────────► │ (device time   │    ($ + RTT,
                                                                     │  is wasted if  │     + the wasted
                                                                     │  escalated     │     device time)
                                                                     │  after trying) │
                                                                     └────────────────┘
```

## Practice

### 1. Pick the best quantisation for a new device

Add an illustrative `phone-8GB` (8 GB RAM, 45% usable by the app, 40 GB/s, 30 GB free, 60% sustained, 5 W, 16 Wh). For each model, find the highest-quality format (the order in `BITS_PER_WEIGHT`, F16 first) that fits and sustains at least 6 tokens/s at context 4096.

<details><summary>Answer</summary>

```python
# Exercise 1: a new (ILLUSTRATIVE) device. For each model, the highest-quality quantisation that fits and
# sustains at least 6 tokens/s at context 4096.
phone8 = Device("phone-8GB", ram_gb=8, app_fraction=0.45, bandwidth_gbs=40, free_storage_gb=30,
                sustained=0.60, watts=5, battery_wh=16)
for m in MODELS:
    pick = None
    for q in BITS_PER_WEIGHT:                       # dicts keep insertion order: f16 first, q2_k last
        r = check(m, q, phone8, 4096)
        if r["verdict"] in ("ok", "tight") and r["sustained"] >= 6:
            pick = (q, r); break
    print(f"{m.name:<11}", f"{pick[0]} at {pick[1]['sustained']:.1f} tok/s ({pick[1]['need']/GIB:.2f} of {pick[1]['budget']/GIB:.1f} GiB)"
          if pick else "nothing fits at >= 6 tok/s")
```

```
0.5B-shape  f16 at 13.9 tok/s (1.31 of 3.6 GiB)
1.5B-shape  q8_0 at 8.2 tok/s (2.04 of 3.6 GiB)
3B-shape    q4_k_m at 7.1 tok/s (2.32 of 3.6 GiB)
8B          nothing fits at >= 6 tok/s
```

The larger the model, the more bits you have to give up: the 0.5B shape stays at F16, the 1.5B shape needs Q8_0, the 3B shape needs Q4_K_M, and the 8B model does not fit this device's memory budget in any format (even at Q2_K its weights, cache and overhead need about 4 GiB against a 3.6 GiB budget). This is the "smaller model or fewer bits" decision made explicit; whether the 0.5B model at F16 is better than the 3B at Q4_K_M for your task is an evaluation question, not an arithmetic one.

</details>

### 2. Predict first, then check: bandwidth against bits

For the 1.5B shape at Q4_K_M on the `sbc-4GB`, predict what happens to tokens per second if you (a) double the memory bandwidth, (b) switch to Q2_K. Then run it. Why is (b) a smaller gain than the ratio of the bit widths?

<details><summary>Answer</summary>

```python
# Exercise 2: the decode ceiling is bandwidth / bytes per token. Predict, then check.
m, sbc = MODELS[1], by_name["sbc-4GB"]
base = check(m, "q4_k_m", sbc, 4096)["sustained"]
faster = check(m, "q4_k_m", Device(**{**sbc.__dict__, "bandwidth_gbs": sbc.bandwidth_gbs * 2}), 4096)["sustained"]
smaller = check(m, "q2_k", sbc, 4096)["sustained"]
print(f"{m.name} Q4_K_M on sbc-4GB       : {base:.2f} tok/s")
print(f"  double the bandwidth            : {faster:.2f} tok/s  (x{faster/base:.2f})")
print(f"  Q2_K instead (fewer bits)       : {smaller:.2f} tok/s  (x{smaller/base:.2f}; bits ratio {BITS_PER_WEIGHT['q4_k_m']/BITS_PER_WEIGHT['q2_k']:.2f})")
```

```
1.5B-shape Q4_K_M on sbc-4GB       : 3.62 tok/s
  double the bandwidth            : 7.25 tok/s  (x2.00)
  Q2_K instead (fewer bits)       : 5.29 tok/s  (x1.46; bits ratio 1.55)
```

Doubling bandwidth doubles the ceiling exactly, because bandwidth is the numerator of the formula. Q2_K has 1.55 times fewer bits per weight than Q4_K_M but speeds decoding up by only 1.46 times, because bytes per token are `weights + KV cache`, and the KV cache (4096 tokens in fp16) did not shrink. The longer the context, the more the cache dilutes the gain from quantising the weights, which is why runtimes also offer cache quantisation and a capped cache (the `--max-kv-size` option in `mlx-lm`).

</details>

### 3. What a smaller on-device context does to a privacy rule

Re-run the `hybrid_private` policy with the device context limit set to 4096, 1024 and 512 tokens. Which columns change, and what does the unchanged `correct` figure hide?

<details><summary>Answer</summary>

```python
# Exercise 3: what does a smaller on-device context window do to the privacy-pinned hybrid policy?
for ctx in (4096, 1024, 512):
    DEV_CTX = ctx                                       # run() reads this global each time it is called
    r = run("hybrid_private")
    print(f"device context {ctx:>4}: answered {r['answered']:.1%}  correct {r['correct']:.1%}  "
          f"on-device {r['on_device']:.1%}  sensitive sent {r['leaked']:.1%}")
DEV_CTX = 4096
```

```
device context 4096: answered 99.0%  correct 63.1%  on-device 69.5%  sensitive sent 0.0%
device context 1024: answered 93.3%  correct 62.7%  on-device 56.1%  sensitive sent 0.0%
device context  512: answered 87.3%  correct 62.3%  on-device 42.6%  sensitive sent 0.0%
```

The sensitive-sent figure stays at 0.0% because the rule is a hard constraint. Accuracy barely moves (63.1%, 62.7%, 62.3%) but `answered` falls from 99.0% to 87.3%: long prompts that are sensitive cannot go to the cloud and do not fit on the device, so they get no answer. Meanwhile the non-sensitive long prompts move to the cloud (more accurate), which partly offsets the loss in the single `correct` number. Never judge a router by one metric: the unanswered sensitive requests are exactly the ones a product owner will ask about.

</details>

### Checkpoint quiz

1. Write the inequality that bounds decode speed on a device, and name the two terms in the denominator.
2. Why does a 4096-token context slow decoding even though the weights did not change?
3. A model fits in RAM on a phone and decodes at 12 tokens/s in a short test. Name two reasons real users may see worse.
4. In the router, why must a privacy rule "fail closed"?
5. Why is Q2_K not simply "2 bits per weight" when you compute the file size?
6. Give one reason to keep the on-device runtime behind your own interface, citing something from this module.

<details><summary>Answers</summary>

1. `tokens/s <= memory bandwidth / (weight bytes + KV-cache bytes at the current context)`. The two terms are the bytes of weights read per token and the bytes of KV cache read per token.
2. Each new token reads the whole KV cache as well as the weights, so more context means more bytes per token (block 3: 11.5 tokens/s at 4096 vs 5.4 at 65,536 in the invented phone).
3. Thermal throttling after the first seconds (sustained speed is lower than burst), battery saver or background limits, other apps using memory, and long prompts whose prefill dominates time to first token.
4. Because the alternative is silently sending data you promised not to send whenever the device cannot cope. Failing closed means returning a degraded local answer or an explicit error, which is visible and testable.
5. Block formats store scale factors with the weights: the llama.cpp README lists 3.1593 bits per weight for Q2_K, not 2.
6. The MediaPipe LLM Inference API page now says it is in maintenance-only mode with new work going to LiteRT-LM; runtimes and their commands change (llama.cpp's own docs show different CLI names), so isolating them limits the blast radius.

</details>

> [!check]
> - I can compute weights, KV cache and decode ceiling for a model on a device, and say which limit binds.
> - I can explain why sustained speed, not burst speed, is the number to plan on.
> - I can place each runtime category and name what to check before choosing one.
> - I can state the four decisions in a hybrid router and why privacy must fail closed.
> - I can read a router simulation and say what it does not know.

## Project

Build `edge_plan.py`, a command-line tool that takes a JSON file of devices (RAM, usable fraction, bandwidth, free storage, sustained fraction, watts, battery) and a JSON file of candidate models (architecture numbers, plus one bits-per-weight value per format you intend to ship), and prints, per device, the best model and format under a minimum tokens-per-second and a minimum context, with the reason every other combination was rejected. Fill the device file only with numbers you can source (a vendor spec sheet you read, or a measurement you made on hardware you own) and mark each as `measured` or `sourced`. Add an `explain` mode that shows the arithmetic for one cell. Then add a second command that takes your own request log (or a synthetic one) and your own latency and price assumptions, and evaluates a routing policy with a privacy rule, reporting accuracy, unanswered requests, cloud spend and sensitive requests sent. Test it with: a hand-computed example that matches to three digits, a case where only DISK fails, a case where only RAM fails, and a router test proving the privacy rule never lets a sensitive request reach the cloud even when the device cannot answer. No code is given; decide the data formats yourself.

## Interview questions

> [!interview] A product manager wants a 7-8B model running inside the mobile app "for privacy". How do you decide whether that is feasible?

<details><summary>What a strong answer covers</summary>

- Turns it into budgets: weights at the chosen quantisation, KV cache at the needed context, overhead, against the memory the OS lets the app keep on the weakest supported device tier; storage and first-run download size.
- Decode ceiling from bandwidth over bytes per token, with a realistic efficiency and a sustained (throttled) figure rather than a burst one; time to first token for long prompts.
- Questions the premise: is "privacy" really about data leaving the device, what else leaves it (logs, sync), and would a smaller model plus a cloud fallback for non-sensitive requests meet the need.
- Asks for an evaluation on the real task at the target quantisation, since the quantisation menu prices memory, not quality.
- Proposes device tiers and a fallback, and measures on real hardware before committing.

</details>

> [!interview] Your on-device model answers well in demos but users complain that it is slow after a minute of use and drains the battery. What is happening and what do you change?

<details><summary>What a strong answer covers</summary>

- Thermal throttling: sustained throughput is lower than burst; energy per token rises as speed falls (joules per token is watts over tokens per second).
- Reads the platform thermal and battery signals and routes or truncates accordingly: shorter outputs, smaller context, a smaller model, or escalate to the cloud when allowed.
- Reduces work per answer (stop sequences, output caps, prompt caching, a capped KV cache) and chooses a cheaper quantisation if quality holds.
- Tests with a sustained load script on a real device, not a ten-second demo.

</details>

> [!interview] Design the fallback logic of a hybrid on-device/cloud assistant. What are the rules, and what do you log?

<details><summary>What a strong answer covers</summary>

- Separates pre-decided routing (capability, battery, thermal, context length, offline) from post-hoc escalation (confidence, validator failure), and notes the wasted device time of the latter.
- Treats privacy as a hard constraint that fails closed, with a visible degraded path.
- Gives the escalation threshold a cost/accuracy sweep, and uses outcome data to tune it, being clear that confidence signals are noisy.
- Logs route chosen, reason, latency split, tokens, and escalation outcome, while respecting the privacy policy in the logs themselves.
- Keeps the runtime and the cloud client behind one interface so either can change.

</details>

## Common mistakes & troubleshooting

- **The model "fits" on paper but the app is killed.** The memory budget used the installed RAM instead of what the OS lets your app keep, or ignored the KV cache and runtime buffers. Use the app's real budget, keep 15% or more headroom, and test with other apps open.
- **Fast in the first seconds, slow afterwards.** Thermal throttling. Measure over minutes; plan on the sustained figure; read the platform's thermal state.
- **Quantised to 2-3 bits for size and answers got noticeably worse.** The quantize README says accuracy loss is possible and measured by perplexity or KL divergence; the size table does not measure it. Evaluate on your task before shipping.
- **A long context makes everything slow or out of memory.** The KV cache grows with context. Cap the context, quantise or cap the cache, or route long prompts to the cloud.
- **The router escalates almost everything (or almost nothing).** The confidence threshold is untested against real outcomes. Sweep it as in block 4 and set it from data.
- **Browser demo works on your machine only.** WebGPU is not available in every browser or context (MDN: secure contexts only, limited availability); feature-detect `navigator.gpu` and provide a fallback. Cache the multi-gigabyte download and show progress.
- **A runtime upgrade broke the app.** Pin the runtime and model file versions, and wrap the runtime behind your own interface and tests.

## Further reading & sources

- [llama.cpp](https://github.com/ggml-org/llama.cpp) - the README read for the C/C++ engine category: supported backends, quantisation range, CPU+GPU hybrid inference, quick-start commands.
- [GGUF specification](https://github.com/ggml-org/ggml/blob/master/docs/gguf.md) - the single-file model format, including `mmap` compatibility, behind the bits-per-weight and file-size discussion.
- [llama.cpp quantize README](https://github.com/ggml-org/llama.cpp/blob/master/tools/quantize/README.md) - source of the bits-per-weight and file-size table, the accuracy-loss caveat and the memory/disk statement used by the calculator.
- [MLX LM](https://github.com/ml-explore/mlx-lm) - the Apple-silicon Python package whose README documents quantization, the rotating KV cache and prompt caching.
- [ONNX Runtime execution providers](https://onnxruntime.ai/docs/execution-providers/) - how a graph runtime partitions a model across hardware backends and falls back by priority order.
- [ExecuTorch](https://github.com/pytorch/executorch) - the PyTorch-native route to phones, embedded boards and microcontrollers, including its warning that a `.pte` is specific to its hardware delegate.
- [LiteRT-LM overview](https://developers.google.com/edge/litert-lm/overview) - Google's LLM layer on LiteRT, and the page the maintenance-mode notice on the MediaPipe LLM Inference API points to.
- [WebGPU API (MDN)](https://developer.mozilla.org/en-US/docs/Web/API/WebGPU_API) - what WebGPU is, its secure-context requirement and availability status, the basis of in-browser runtimes such as WebLLM.

## Next

[Module 16: Pricing, Rate Limits and Quotas](../16-pricing-rate-limits-and-quotas/README.md)
