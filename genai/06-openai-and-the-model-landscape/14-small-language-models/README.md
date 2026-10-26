# Module 14: Small Language Models (SLMs)

## Roadmap

**Where this sits.** [Module 12: Open-Weight Models: Llama, Mistral, Qwen](../12-open-weight-models-llama-mistral-qwen/README.md) showed how to size a model from its `config.json`, and [Module 13: The Hugging Face Ecosystem](../13-the-hugging-face-ecosystem/README.md) showed how to fetch it safely. This module is about the decision those two enable: when a smaller model is good enough, how to prove it before you ship it, and how to keep a bigger model as a safety net. [Module 15: On-Device and Edge Inference](../15-on-device-and-edge-inference/README.md) then takes small models onto phones, laptops and embedded devices.

**Prerequisites.** [Track 05 Module 05: Calculating a Model's Memory Requirements](../../05-gpus-and-genai-hardware/05-calculating-a-models-memory-requirements/README.md) and [Track 05 Module 14: Running Models on CPU and Apple Silicon](../../05-gpus-and-genai-hardware/14-running-models-on-cpu-and-apple-silicon/README.md) (the memory and decode-speed formulas used below), Module 12's cost and licence ideas, and basic probability (a proportion and its uncertainty).

**After this module you can:**

- Define "small" by deployability (memory, speed, cost) instead of by a parameter count that goes out of date.
- Name why teams choose small models and where small models tend to fail, and treat the failure modes as hypotheses to test on your own data.
- Describe how small models get good (data quality, distillation, pruning, quantisation) as far as the primary sources support, and link to the course modules that teach each.
- Write an evaluation harness that scores a large and a small model on a labelled task set, slices the result, puts confidence intervals on it, and reports accuracy per cost.
- Build a cascade (try small, escalate when confidence is low), measure its cost-accuracy trade-off in a seeded simulation, and explain when it saves nothing.
- Estimate weight memory, KV-cache memory and speed ceilings for several parameter counts, with the assumptions written down.

**Why it matters.** Model size is the largest single lever on cost and latency, and downsizing on a hunch is the largest single source of silent quality loss. Both halves are measurable before launch.

**Ground rules.** There are no model calls in this module. The two "models" in the harness are *scripted stand-ins*: each knows the gold answer and returns it with a probability that this module **assumes**; every price, latency, bandwidth and capability figure in the listings is **ILLUSTRATIVE** and marked as such. The harness, scoring, statistics, cascade logic and memory arithmetic are real and executed; the results say how the method behaves, not how any real model performs. Source papers were fetched on 2026-10-26 and are described only as far as their abstracts support. This module makes no claim about which current model is better than another.

## Concept

> [!key] "Small" means "fits the memory, speed and cost budget of where it must run", not a number of parameters. A small model is the right choice exactly where your own labelled evaluation shows it clears your accuracy bar on the slices you care about. A cascade that escalates low-confidence requests to a bigger model can keep most of the accuracy for a fraction of the cost, but only if the confidence signal really separates right answers from wrong ones.

## Explanation

### What "small" means

There is no standard cut-off. A model that counted as large a few years ago can run on a laptop today, because hardware, quantisation and architectures keep moving. So define "small" by what you can deploy:

- **Memory**: do weights plus KV cache plus overhead fit the device or GPU you have? ([Track 05 Module 05](../../05-gpus-and-genai-hardware/05-calculating-a-models-memory-requirements/README.md); Listing 1 computes it for seven sizes.)
- **Speed**: does decoding reach the tokens per second you need, and does the first token arrive soon enough? ([Track 05 Module 14](../../05-gpus-and-genai-hardware/14-running-models-on-cpu-and-apple-silicon/README.md): decode is limited by memory bandwidth divided by bytes read per token.)
- **Money**: does the cost per request fit the product's margin?

> [!model] A deployability funnel, applied in this order. First fix the budgets (memory, latency, cost per request). Then find the largest model that clears all three. Only then ask whether it is accurate enough on your task. If it is not, the answer is a different design (retrieval, fine-tuning, a cascade), not simply a bigger model. Choosing the model first and discovering the budget later is how projects end up with a demo that cannot ship.

### Why choose a small model

- **Latency.** Decode speed scales inversely with the bytes streamed per token, so fewer parameters means more tokens per second on the same machine (Listing 1: the same hardware has a speed ceiling about 23 times higher for the 3B size than for the 72B size).
- **Cost.** Serving cost per token grows with model size. Training cost grows with parameters times training tokens (the `C ≈ 6ND` approximation in [Track 04 Module 04](../../04-training-fine-tuning-and-alignment/04-compute-budgets-and-chinchilla-optimality/README.md)), but a deployed model pays its serving cost on every request, which is why a smaller model can be the better product even when it was not the cheapest to train.
- **Privacy and offline use.** A model that fits on a device never sends data anywhere ([Module 15](../15-on-device-and-edge-inference/README.md)).
- **Specialisation.** For a narrow task a small model plus a small adapter ([Track 04 Module 12: LoRA](../../04-training-fine-tuning-and-alignment/12-lora-low-rank-adaptation/README.md)) or good prompts can be enough; [Track 04 Module 16](../../04-training-fine-tuning-and-alignment/16-when-to-fine-tune-vs-prompt-vs-rag/README.md) covers choosing between those.
- **Control.** Open weights can be pinned to a commit (Module 13), so behaviour does not change until you decide.

### Where small models tend to fail

Three weak spots recur in practice. Treat them as hypotheses to test with slices, not as facts about a given model:

- **Reasoning depth.** Multi-step problems compound errors; a task that needs five correct steps punishes a model that is right 90% of the time on each.
- **Long context.** A model's configuration can declare a long context window, but how well it uses a long input is a separate question, and the memory cost of the KV cache grows linearly with context (Module 12: KV cache per token times tokens).
- **Knowledge breadth.** Fewer parameters leave less room for rarely seen facts; questions about obscure entities are where recall tends to break first.

Others to slice for: output-format reliability, instruction following under unusual prompts, non-English text ([Track 01 Module 14](../../01-tokens-and-language-modeling/14-multilingual-tokenization/README.md) shows why tokenization alone changes cost and length), and robustness to prompt rewording. The stand-in "small" model in this module is built to mirror the first three, so the harness has something to find. That is a design choice, not evidence about any real model.

### How small models get good

Four levers, each with a primary source or a course module:

- **Data quality.** *Textbooks Are All You Need* (arXiv 2306.11644; abstract fetched 2026-10-26) introduces phi-1, "a new large language model for code" with 1.3B parameters "trained for 4 days on 8 A100s, using a selection of 'textbook quality' data from the web (6B tokens) and synthetically generated textbooks and exercises with GPT-3.5 (1B tokens)". The abstract reports 50.6% pass@1 on HumanEval and 55.5% on MBPP, and 45% on HumanEval for a 350M-parameter variant. That is one paper's claim for a code model in its own setting; the lesson to take is that curation and synthetic data are a lever, not a leaderboard. Data cleaning is [Track 04 Module 01](../../04-training-fine-tuning-and-alignment/01-pretraining-data-collection-and-cleaning/README.md) and building training sets is [Module 07](../../04-training-fine-tuning-and-alignment/07-building-a-fine-tuning-dataset/README.md).
- **Distillation.** Hinton, Vinyals and Dean (arXiv 1503.02531) start from the observation that an ensemble of models is expensive to deploy, and describe how it is possible to "compress the knowledge in an ensemble into a single model which is much easier to deploy"; the abstract reports results on MNIST and on the acoustic model of a heavily used commercial system. DistilBERT (arXiv 1910.01108) applies knowledge distillation during pre-training and, per its abstract, reduces "the size of a BERT model by 40%, while retaining 97% of its language understanding capabilities and being 60% faster". Both are about much older model families than today's chat models. For large language models the practice often means training a small model on a larger model's outputs, and that is exactly where **licences bite**: Module 12 showed that the Llama 2 and Llama 3 licence texts contain a clause against using outputs "to improve any other large language model" while the Llama 3.1 text instead requires the "Llama" name prefix and the later releases in Module 12's Listing 2 no longer contain that clause; other providers' terms differ again. Check the terms of whatever you distil from. The TRL documentation index (fetched 2026-10-26) lists a `DistillationTrainer` under "Knowledge distillation"; Track 04 has no module on distillation, so use the papers and the TRL docs.
- **Pruning.** Structured pruning removes whole components (layers, attention heads, hidden dimensions) from a trained model and then trains to recover. *Sheared LLaMA* (arXiv 2310.06694) studies "structured pruning as an effective means to develop smaller LLMs from pre-trained, larger models", pruning LLaMA2-7B to 1.3B and 2.7B parameters with "targeted structured pruning" and "dynamic batch loading", and states that this needs "only 3% of compute compared to training such models from scratch" (the paper's claim, in its setting).
- **Quantisation.** Storing weights in fewer bits shrinks memory and bytes streamed per token: [Track 04 Module 15](../../04-training-fine-tuning-and-alignment/15-quantization-int8-int4-gguf/README.md), and Module 12's Listing 5 measured about 4.9 bits per weight for a real 4-bit GGUF file. It costs some quality, which you measure with the harness below.

### The "evaluate, then downsize" method

1. **Write the requirement first.** The metric (here exact-match accuracy), the bar (for example 0.85), the latency target and the cost envelope.
2. **Build a labelled set from the real task.** Sample from production-like inputs, label them, and tag each with the slice it belongs to (task type, language, length bucket). Keep the slices in proportion to real traffic, or weight them back to it.
3. **Measure the big model first.** If it cannot clear the bar, a smaller one is unlikely to without extra work such as fine-tuning, so look at the task definition, the labels and retrieval before shopping for models.
4. **Run candidates through the same scorer** with the same prompts, deterministic decoding ([Track 01 Module 16](../../01-tokens-and-language-modeling/16-sampling-strategies-greedy-temperature-top-k-top-p/README.md)) and pinned model versions.
5. **Report intervals, not just means,** overall and per slice. A 100-item slice cannot distinguish 0.85 from 0.92 (Listing 3 prints the widths).
6. **Decide with a rule written in advance:** the smallest model whose lower confidence bound clears the bar on the slices that matter, under your traffic mix. Cost per correct answer is a tie-breaker among models that already clear the bar, not a replacement for the bar.
7. **Re-run on every change** (new model version, new prompt, new traffic) and keep scoring a sample of production traffic ([Track 15](../../15-evaluation-observability-and-safety/README.md) covers building eval datasets, judges and monitoring).

> [!pitfall] Three ways to fool yourself: tuning the prompt on the eval set (then it is no longer held out), evaluating on tidy examples that production never sends, and reading a 2-point difference between models on a few hundred items as real. Also remember that an LLM used as a grader has its own errors; the harness here uses exact match so that the scorer is not a source of noise.

### Cascades and fallbacks

A **cascade** sends each request to the small model first and escalates to the large model when the small answer looks unreliable. FrugalGPT (arXiv 2305.05176) names "LLM cascade" as one of three cost-reduction strategies (with prompt adaptation and LLM approximation) and reports, in its own experiments (the paper is dated May 2023), matching the best individual model's performance with "up to 98% cost reduction". Take from this that the idea is studied and works in some settings, not that it will work in yours; your own harness decides.

The arithmetic is simple. With `c_s` and `c_l` the average cost per request of the small and large model, `p` the share of requests escalated, and `t_s`, `t_l` the latencies:

- cost per request `= c_s + p x c_l` (the small model always runs, so escalated requests pay twice);
- mean latency `= t_s + p x t_l`;
- the cascade is cheaper than always using the large model only while `p < 1 - c_s / c_l`;
- accuracy depends on how well the confidence signal picks the right requests. If escalation were random, accuracy would sit on the straight line between "always small" and "always large". A useful signal bends the curve above that line, and the **AUROC** of confidence as a predictor of correctness (the probability that a random right answer has higher confidence than a random wrong one; 0.5 means no information) measures how much.

Where does confidence come from? Options, each needing its own validation: token probabilities when the API exposes them; a cheap verifier (schema validation, unit tests, a rule or lookup that can confirm the answer); agreement between several samples; a trained router; or the model's own stated confidence, which can be badly calibrated and must be measured before it is trusted. A **fallback** is the same mechanism triggered by hard failures rather than low confidence: invalid output format, a timeout, a refusal, an error from the small model.

> [!pitfall] A cascade has three hidden costs. Escalated requests pay both models' latency, so the tail gets slower even when the mean improves. The threshold is tuned on one data set and drifts when traffic changes, so choose it on a tuning split and report on a held-out one, as Listing 4 does. And the escalated share is concentrated in exactly the hard slices, so cost per request is not the average the formula suggests.

### Memory and latency by size

Listing 1 reuses Track 05's formulas for seven parameter counts taken from fetched configs (an open-weight family, used only because its sizes span a wide range; Module 12 shows the same arithmetic reproduces each repo's reported parameter count exactly). Everything about the machines is an assumption you replace with your own.

## Code

All listings use only the Python standard library and were run on 2026-10-26 with Python 3.13. Save Listing 2 as `evalkit.py` in a working folder; Listings 3 and 4 import it. Outputs are deterministic (seeded, hash-based), so you will get identical numbers.

### Listing 1: memory, speed and what fits (ILLUSTRATIVE machines)

```python
GIB = 1024 ** 3

# Architecture numbers copied from the config.json files of the Qwen2.5 base repositories (fetched 2026-10-26), plus the
# parameter totals the Hub reported for each. One open-weight family is used only because its sizes span a wide range.
#           name   layers hidden heads kv_heads  ffn    vocab  tied   Hub total
FAMILY = [("0.5B", 24,  896, 14, 2,  4864, 151936, True,    494_032_768),
          ("1.5B", 28, 1536, 12, 2,  8960, 151936, True,  1_543_714_304),
          ("3B",   36, 2048, 16, 2, 11008, 151936, True,  3_085_938_688),
          ("7B",   28, 3584, 28, 4, 18944, 152064, False, 7_615_616_512),
          ("14B",  48, 5120, 40, 8, 13824, 152064, False, 14_770_033_664),
          ("32B",  64, 5120, 40, 8, 27648, 152064, False, 32_763_876_352),
          ("72B",  80, 8192, 64, 8, 29568, 152064, False, 72_706_203_648)]

# ASSUMPTIONS (illustrative, not specifications of any product): bandwidth in GB/s, sustained compute in TFLOP/s
MACHINES = {"CPU box": (90, 1.0), "laptop": (200, 4.0), "GPU": (2000, 200.0)}
BITS = {"bf16": 16.0, "~Q4": 4.919}      # 4.919 = bits/weight measured on a Q4_K_M GGUF file in Module 12, Listing 5
CONTEXT, PROMPT, REPLY, OVERHEAD = 8192, 1000, 300, 0.20


def params(layers, d, a, g, f, v, tied):
    dh = d // a
    attn = d * a * dh + 2 * d * g * dh + a * dh * d + a * dh + 2 * g * dh          # + Qwen2 q/k/v biases
    return layers * (attn + 3 * d * f + 2 * d) + v * d + (0 if tied else v * d) + d


print("ARCHITECTURE CHECK (formula of Track 05 Module 05 vs the Hub's reported totals)")
for name, L, d, a, g, f, v, tied, hub in FAMILY:
    assert params(L, d, a, g, f, v, tied) == hub, name
print("all 7 sizes match the Hub totals exactly\n")

print(f"MEMORY, context {CONTEXT} tokens, one sequence, bf16 KV cache, overhead {OVERHEAD:.0%} of weights (a guess)")
print(f"{'size':5} {'params':>8} | {'bf16 GiB':>9} {'~Q4 GiB':>8} | {'KV KiB/tok':>10} {'KV GiB':>7} | {'total bf16':>10} {'total ~Q4':>10}")
rows = []
for name, L, d, a, g, f, v, tied, hub in FAMILY:
    kv_tok = 2 * L * g * (d // a) * 2
    w16, w4 = hub * BITS["bf16"] / 8, hub * BITS["~Q4"] / 8
    kv = kv_tok * CONTEXT
    rows.append((name, hub, w16, w4, kv_tok))
    print(f"{name:5} {hub / 1e9:>7.2f}B | {w16 / GIB:>9.2f} {w4 / GIB:>8.2f} | {kv_tok / 1024:>10.0f} {kv / GIB:>7.2f} | "
          f"{(w16 * (1 + OVERHEAD) + kv) / GIB:>10.2f} {(w4 * (1 + OVERHEAD) + kv) / GIB:>10.2f}")

print("\nWHAT FITS (largest size in this family whose total above fits the memory budget)")
for budget in (4, 8, 16, 24, 48, 80):
    best = {}
    for key, w_idx in (("bf16", 2), ("~Q4", 3)):
        fit = [r[0] for r in rows if (r[w_idx] * (1 + OVERHEAD) + r[4] * CONTEXT) / GIB <= budget]
        best[key] = fit[-1] if fit else "none"
    print(f"  {budget:>2} GiB: bf16 -> {best['bf16']:>4}   ~Q4 -> {best['~Q4']:>4}")

print(f"\nSPEED CEILINGS at ~Q4 (decode tokens/s <= bandwidth / bytes read per token; prefill seconds = 2 x params x prompt / FLOP/s)")
print(f"prompt {PROMPT} tokens, reply {REPLY} tokens; machines (ASSUMED GB/s, TFLOP/s): " +
      ", ".join(f"{m} {bw}/{tf}" for m, (bw, tf) in MACHINES.items()))
head = f"{'size':5} " + " | ".join(f"{m:^26}" for m in MACHINES)
print(head)
print(f"{'':5} " + " | ".join(f"{'tok/s':>7} {'1st tok s':>9} {'reply s':>8}" for _ in MACHINES))
for name, n, w16, w4, kv_tok in rows:
    cells = []
    for m, (bw, tf) in MACHINES.items():
        bytes_per_token = w4 + kv_tok * (PROMPT + REPLY / 2)                  # weights + average KV read while decoding
        tps = bw * 1e9 / bytes_per_token
        ttft = 2 * n * PROMPT / (tf * 1e12)
        cells.append(f"{tps:>7.1f} {ttft:>9.2f} {ttft + REPLY / tps:>8.1f}")
    print(f"{name:5} " + " | ".join(cells))
```

Output (executed 2026-10-26):

```text
ARCHITECTURE CHECK (formula of Track 05 Module 05 vs the Hub's reported totals)
all 7 sizes match the Hub totals exactly

MEMORY, context 8192 tokens, one sequence, bf16 KV cache, overhead 20% of weights (a guess)
size    params |  bf16 GiB  ~Q4 GiB | KV KiB/tok  KV GiB | total bf16  total ~Q4
0.5B     0.49B |      0.92     0.28 |         12    0.09 |       1.20       0.43
1.5B     1.54B |      2.88     0.88 |         28    0.22 |       3.67       1.28
3B       3.09B |      5.75     1.77 |         36    0.28 |       7.18       2.40
7B       7.62B |     14.19     4.36 |         56    0.44 |      17.46       5.67
14B     14.77B |     27.51     8.46 |        192    1.50 |      34.51      11.65
32B     32.76B |     61.03    18.76 |        256    2.00 |      75.23      24.51
72B     72.71B |    135.43    41.63 |        320    2.50 |     165.01      52.46

WHAT FITS (largest size in this family whose total above fits the memory budget)
   4 GiB: bf16 -> 1.5B   ~Q4 ->   3B
   8 GiB: bf16 ->   3B   ~Q4 ->   7B
  16 GiB: bf16 ->   3B   ~Q4 ->  14B
  24 GiB: bf16 ->   7B   ~Q4 ->  14B
  48 GiB: bf16 ->  14B   ~Q4 ->  32B
  80 GiB: bf16 ->  32B   ~Q4 ->  72B

SPEED CEILINGS at ~Q4 (decode tokens/s <= bandwidth / bytes read per token; prefill seconds = 2 x params x prompt / FLOP/s)
prompt 1000 tokens, reply 300 tokens; machines (ASSUMED GB/s, TFLOP/s): CPU box 90/1.0, laptop 200/4.0, GPU 2000/200.0
size           CPU box           |           laptop           |            GPU
        tok/s 1st tok s  reply s |   tok/s 1st tok s  reply s |   tok/s 1st tok s  reply s
0.5B    283.1      0.99      2.0 |   629.1      0.25      0.7 |  6291.3      0.00      0.1
1.5B     91.6      3.09      6.4 |   203.6      0.77      2.2 |  2036.3      0.02      0.2
3B       46.4      6.17     12.6 |   103.1      1.54      4.5 |  1031.0      0.03      0.3
7B       19.0     15.23     31.1 |    42.1      3.81     10.9 |   421.2      0.08      0.8
14B       9.7     29.54     60.6 |    21.5      7.39     21.3 |   214.9      0.15      1.5
32B       4.4     65.53    133.7 |     9.8     16.38     47.1 |    97.8      0.33      3.4
72B       2.0    145.41    295.7 |     4.4     36.35    104.0 |    44.4      0.73      7.5
```

Read it with the caveats. The first block is an exact check, not an estimate: the formula reproduces the Hub's reported parameter total for all seven repos. The memory table is weights plus one 8,192-token bf16 KV cache plus a 20% overhead guess (the same guess as Track 05); `~Q4` uses 4.919 bits per weight, measured on a real GGUF file in Module 12. "What fits" turns the table into a deployability statement: at 8 GiB, bf16 reaches the 3B size and 4-bit reaches 7B. The speed block prints ceilings from `bandwidth / bytes read per token`; real decoding is lower. The measured llama.cpp rows in Track 05 Module 14 reached between 45% and 86% of their ceilings, so read these as upper bounds. The three machines' bandwidths and compute rates are **assumptions** chosen to span "ordinary PC", "laptop with unified memory" and "datacenter GPU", not specifications of any product. The first-token column assumes prefill is compute-bound at `2 x params x prompt` operations and ignores attention cost, which makes long prompts look better than they are.

### Listing 2: a small evaluation harness with two scripted stand-in models (`evalkit.py`)

The stand-ins never read the prompt: each returns the gold answer with its **assumed** probability for that kind of task, and otherwise a plausible wrong answer, deterministically per (model, item) like temperature-0 decoding. Everything else is the code you would keep: answer extraction from free text, normalisation, exact-match scoring, token-based cost, latency, Wilson confidence intervals. To evaluate real models, replace `StandIn` with a callable that has a `name` (`"small"` or `"large"`, or extend `PRICE` and `LATENCY`) and returns a `Response` built from the provider's reply and usage fields. All the capability numbers, prices and latencies at the top are **ILLUSTRATIVE ASSUMPTIONS**.

```python
"""evalkit.py - a tiny evaluation harness plus two SCRIPTED stand-in 'models'.

The stand-ins never read the prompt: each one knows the gold answer and returns it with a configured probability
(its ASSUMED capability on that kind of task), otherwise a plausible wrong answer. They are deterministic per
(model, item), like temperature-0 decoding. Everything downstream (answer extraction, normalisation, scoring,
confidence intervals, cost and latency accounting, slicing) is the real harness code you would keep when you swap
the stand-ins for calls to real models.
"""
import hashlib
import math
import random
import re
from dataclasses import dataclass

# ---- ASSUMPTIONS: replace every number below with measurements from your own task ------------------------------
CATEGORIES = {   # name: (prompt tokens, answer tokens, P(correct) small, P(correct) large)   ASSUMED, not measured
    "intent_classification": (120, 6, 0.94, 0.97),
    "field_extraction":      (300, 14, 0.88, 0.96),
    "multi_step_reasoning":  (250, 350, 0.42, 0.86),
    "obscure_knowledge":     (60, 20, 0.30, 0.78),
    "long_context_lookup":   (6000, 12, 0.55, 0.92),
}
# ILLUSTRATIVE prices in USD per 1M tokens (input, output) and latency; not any provider's price list.
PRICE = {"small": (0.50, 1.50), "large": (10.00, 30.00)}
LATENCY = {"small": (0.15, 150.0), "large": (0.60, 60.0)}   # (seconds to first token, output tokens per second)
SHARED = 0.7    # ASSUMED: how often a model's success on an item follows a difficulty shared by both models (errors correlate)
# -------------------------------------------------------------------------------------------------------------------


@dataclass(frozen=True)
class Item:
    id: int
    category: str
    prompt: str
    gold: str


@dataclass(frozen=True)
class Response:
    text: str
    confidence: float
    tokens_in: int
    tokens_out: int


@dataclass(frozen=True)
class Result:
    item: Item
    correct: bool
    confidence: float
    cost: float          # USD
    seconds: float


def make_eval_set(counts, seed=0):
    """A labelled set: counts = {category: number of items}. Synthetic, reproducible, ids are 0..N-1."""
    rng = random.Random(seed)
    labels = ["billing", "shipping", "returns", "technical", "other"]
    items = []
    for category, n in counts.items():
        for _ in range(n):
            k = len(items)
            if category == "intent_classification":
                gold, prompt = rng.choice(labels), f"Classify support message #{k} into one of {labels}"
            elif category == "field_extraction":
                gold, prompt = f"ORD-{rng.randint(10000, 99999)}", f"Extract the order id from ticket #{k}"
            elif category == "multi_step_reasoning":
                gold, prompt = str(rng.randint(100, 999)), f"Work out the total for scenario #{k} (5 steps)"
            elif category == "obscure_knowledge":
                gold, prompt = f"VX-{rng.randint(1000, 9999)}", f"What is the code name of internal project #{k}?"
            else:
                gold, prompt = str(rng.randint(1000, 9999)), f"In the attached 6,000-token log #{k}, what is key K?"
            items.append(Item(k, category, prompt, gold))
    rng.shuffle(items)
    return [Item(i, it.category, it.prompt, it.gold) for i, it in enumerate(items)]       # renumber after shuffle


def _u(*parts):
    """Deterministic uniform number in [0, 1) from the parts (same inputs, same output, any call order)."""
    digest = hashlib.sha256("|".join(map(str, parts)).encode()).digest()
    return int.from_bytes(digest[:8], "big") / 2**64


def _wrong(item):
    if item.category == "intent_classification":
        labels = ["billing", "shipping", "returns", "technical", "other"]
        return labels[(labels.index(item.gold) + 1) % len(labels)]
    digits = [c for c in item.gold if c.isdigit()]
    i = item.gold.rindex(digits[-1])                    # change the last digit
    return item.gold[:i] + str((int(item.gold[i]) + 1) % 10) + item.gold[i + 1:]


class StandIn:
    """A scripted model. signal = how well its confidence separates right from wrong (0 = not at all)."""
    def __init__(self, name, signal=0.5):
        self.name, self.signal = name, signal

    def __call__(self, item):
        t_in, t_out, p_small, p_large = CATEGORIES[item.category]
        p = p_small if self.name == "small" else p_large
        shared = _u(self.name, "pick", item.id) < SHARED               # hard items tend to be hard for both models
        ok = (_u("shared", item.id) if shared else _u(self.name, "answer", item.id)) < p
        answer = item.gold if ok else _wrong(item)
        style = int(_u(self.name, "style", item.id) * 4)             # answers come back in different shapes
        text = [f"Answer: {answer}", f"{answer}", f"The answer is {answer}.", f"ANSWER: {answer.upper()}"][style]
        z = sum(_u(self.name, "noise", item.id, j) for j in range(6)) - 3.0        # roughly normal, sd ~ 0.7
        conf = 0.65 + self.signal * (0.5 if ok else -0.5) + 0.2 * z
        return Response(text, min(1.0, max(0.0, conf)), t_in, t_out)


def extract_answer(text):
    m = re.search(r"answer(?: is)?:?\s*(.+)$", text, re.I)
    return (m.group(1) if m else text).strip().rstrip(".")


def normalise(s):
    return re.sub(r"[^a-z0-9\-]", "", s.casefold())


def run(model, item):
    """Call one model on one item and score it. Returns a Result."""
    r = model(item)
    correct = normalise(extract_answer(r.text)) == normalise(item.gold)
    p_in, p_out = PRICE[model.name]
    ttft, tps = LATENCY[model.name]
    return Result(item, correct, r.confidence,
                  (r.tokens_in * p_in + r.tokens_out * p_out) / 1e6,
                  ttft + r.tokens_out / tps)


def wilson(k, n, z=1.96):
    """95% Wilson score interval for k successes in n trials."""
    if n == 0:
        return (0.0, 1.0)
    p = k / n
    centre = (p + z * z / (2 * n)) / (1 + z * z / n)
    half = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / (1 + z * z / n)
    return (centre - half, centre + half)


def summarise(results):
    n = len(results)
    k = sum(r.correct for r in results)
    lo, hi = wilson(k, n)
    cost = sum(r.cost for r in results)
    return {"n": n, "acc": k / n, "lo": lo, "hi": hi, "usd_per_1k": 1000 * cost / n,
            "usd_per_correct": cost / k if k else float("inf"), "seconds": sum(r.seconds for r in results) / n}
```

### Listing 3: compare the two models, slice the result, and decide

```python
from evalkit import CATEGORIES, PRICE, StandIn, make_eval_set, run, summarise, wilson

small, large = StandIn("small"), StandIn("large")
BROAD = {"intent_classification": 350, "field_extraction": 250, "multi_step_reasoning": 150,
         "obscure_knowledge": 100, "long_context_lookup": 150}
NARROW = {"intent_classification": 600, "field_extraction": 400}          # a ticket-triage workload
TARGET = 0.85                                                             # the accuracy this product needs

items = make_eval_set(BROAD, seed=7)
print("sample items:")
for it in items[:3]:
    print(f"  #{it.id} [{it.category}] gold={it.gold!r}  small says {small(it).text!r}  large says {large(it).text!r}")

print(f"\n1. Whole eval set, {len(items)} items (illustrative prices: small ${PRICE['small'][0]}/{PRICE['small'][1]}, "
      f"large ${PRICE['large'][0]}/{PRICE['large'][1]} per 1M tokens in/out)")
print(f"{'model':6} {'accuracy':>9} {'95% CI':>15} {'$ / 1k requests':>16} {'$ / correct answer':>19} {'mean seconds':>13}")
results = {}
for model in (small, large):
    results[model.name] = [run(model, it) for it in items]
    s = summarise(results[model.name])
    ci = f"[{s['lo']:.3f}, {s['hi']:.3f}]"
    print(f"{model.name:6} {s['acc']:>9.3f} {ci:>15} {s['usd_per_1k']:>16.2f} "
          f"{s['usd_per_correct']:>19.5f} {s['seconds']:>13.2f}")

print("\n2. Per slice: the average hides where the small model fails")
print(f"{'slice':24} {'n':>4} {'small acc [95% CI]':>24} {'large acc [95% CI]':>24} {'gap':>6}")
for cat in CATEGORIES:
    row = {}
    for name in ("small", "large"):
        sub = [r for r in results[name] if r.item.category == cat]
        row[name] = summarise(sub)
    fmt = lambda s: f"{s['acc']:.2f} [{s['lo']:.2f}, {s['hi']:.2f}]"
    print(f"{cat:24} {row['small']['n']:>4} {fmt(row['small']):>24} {fmt(row['large']):>24} {row['large']['acc'] - row['small']['acc']:>6.2f}")

print(f"\n3. Same two models, two traffic mixes, target accuracy {TARGET}: smallest model whose CI lower bound clears it")
for label, counts in (("broad (5 task types)", BROAD), ("narrow (triage only)", NARROW)):
    its = make_eval_set(counts, seed=11)
    chosen = None
    cells = []
    for model in (small, large):
        s = summarise([run(model, it) for it in its])
        cells.append(f"{model.name}: {s['acc']:.3f} (lower {s['lo']:.3f}, ${s['usd_per_1k']:.2f}/1k)")
        if chosen is None and s["lo"] >= TARGET:
            chosen = model.name
    print(f"  {label:22} {' | '.join(cells)}  -> choose: {chosen or 'neither'}")

print("\n4. How big must the eval set be? 95% interval width for a measured accuracy of 0.90")
for n in (50, 100, 300, 1000, 3000):
    lo, hi = wilson(round(0.9 * n), n)
    print(f"  n={n:>4}: [{lo:.3f}, {hi:.3f}]  width {hi - lo:.3f}")
```

Output (executed 2026-10-26; accuracies are what the harness measured on the seeded stand-ins, so they scatter around the assumed probabilities):

```text
sample items:
  #0 [long_context_lookup] gold='7493'  small says '7493'  large says 'Answer: 7493'
  #1 [intent_classification] gold='shipping'  small says 'ANSWER: SHIPPING'  large says 'ANSWER: SHIPPING'
  #2 [obscure_knowledge] gold='VX-6909'  small says 'Answer: VX-6900'  large says 'VX-6900'

1. Whole eval set, 1000 items (illustrative prices: small $0.5/1.5, large $10.0/30.0 per 1M tokens in/out)
model   accuracy          95% CI  $ / 1k requests  $ / correct answer  mean seconds
small      0.736  [0.708, 0.762]             0.62             0.00085          0.56
large      0.930  [0.912, 0.944]            12.46             0.01340          1.63

2. Per slice: the average hides where the small model fails
slice                       n       small acc [95% CI]       large acc [95% CI]    gap
intent_classification     350        0.93 [0.90, 0.96]        0.97 [0.94, 0.98]   0.03
field_extraction          250        0.89 [0.85, 0.92]        0.97 [0.94, 0.98]   0.08
multi_step_reasoning      150        0.44 [0.36, 0.52]        0.85 [0.79, 0.90]   0.41
obscure_knowledge         100        0.35 [0.26, 0.45]        0.81 [0.72, 0.87]   0.46
long_context_lookup       150        0.57 [0.49, 0.64]        0.93 [0.88, 0.96]   0.37

3. Same two models, two traffic mixes, target accuracy 0.85: smallest model whose CI lower bound clears it
  broad (5 task types)   small: 0.730 (lower 0.702, $0.62/1k) | large: 0.930 (lower 0.912, $12.46/1k)  -> choose: large
  narrow (triage only)   small: 0.918 (lower 0.899, $0.11/1k) | large: 0.967 (lower 0.954, $2.20/1k)  -> choose: small

4. How big must the eval set be? 95% interval width for a measured accuracy of 0.90
  n=  50: [0.786, 0.957]  width 0.170
  n= 100: [0.826, 0.945]  width 0.119
  n= 300: [0.861, 0.929]  width 0.068
  n=1000: [0.880, 0.917]  width 0.037
  n=3000: [0.889, 0.910]  width 0.021
```

What the four blocks show. (1) On the broad set the small model costs about one twentieth as much per request (the assumed price gap) and is about 19 points less accurate, so its cost per correct answer is lower while failing the bar. (2) The overall number hides the shape: the gap is 3 and 8 points on the two easy task types and 37 to 46 points on reasoning, obscure knowledge and long-context lookup. With 100 to 150 items per slice the intervals are wide (the knowledge slice's small-model interval spans 26% to 45%). (3) The same two models, tested on two traffic mixes against a bar of 0.85, give different decisions: with narrow triage traffic the small model's lower bound clears the bar and it is the choice, with broad traffic only the large one does. The decision belongs to the mix, not to the model. (4) Interval width falls roughly with the square root of the number of items, which is why a few dozen examples cannot settle a close call.

### Listing 4: a cascade, a tuning split, and three confidence signals

```python
from bisect import bisect_left, bisect_right

from evalkit import StandIn, make_eval_set, run

BROAD_X4 = {"intent_classification": 1400, "field_extraction": 1000, "multi_step_reasoning": 600,
            "obscure_knowledge": 400, "long_context_lookup": 600}
items = make_eval_set(BROAD_X4, seed=21)                       # 4,000 labelled items
tune = [it for it in items if it.id % 2 == 0]                  # pick the threshold here ...
test = [it for it in items if it.id % 2 == 1]                  # ... and report here, on items it never saw
large = StandIn("large")
large_res = {it.id: run(large, it) for it in items}


def auroc(scores_right, scores_wrong):
    """P(a random right answer has higher confidence than a random wrong one); 0.5 = no information."""
    wrong = sorted(scores_wrong)
    total = sum(bisect_left(wrong, s) + 0.5 * (bisect_right(wrong, s) - bisect_left(wrong, s)) for s in scores_right)
    return total / (len(scores_right) * len(wrong))


def cascade(small_res, subset, tau):
    """Try the small model; if its confidence is below tau, pay for the large model too and use its answer."""
    n = len(subset)
    correct = cost = seconds = escalated = 0
    for it in subset:
        s = small_res[it.id]
        cost += s.cost
        seconds += s.seconds
        if s.confidence >= tau:
            correct += s.correct
        else:
            l = large_res[it.id]
            escalated += 1
            correct += l.correct
            cost += l.cost
            seconds += l.seconds
    return {"acc": correct / n, "esc": escalated / n, "usd_per_1k": 1000 * cost / n, "seconds": seconds / n}


curves = {}
for label, signal in (("good confidence signal", 0.25), ("weak signal", 0.10), ("no signal (random)", 0.0)):
    small = StandIn("small", signal=signal)
    small_res = {it.id: run(small, it) for it in items}
    right = [small_res[it.id].confidence for it in tune if small_res[it.id].correct]
    wrong = [small_res[it.id].confidence for it in tune if not small_res[it.id].correct]
    never, always = cascade(small_res, test, 0.0), cascade(small_res, test, 1.01)
    curves[label[0].upper()] = [cascade(small_res, test, t / 20) for t in range(0, 22)]     # G, W, N
    always_large = {"acc": sum(large_res[it.id].correct for it in test) / len(test),
                    "usd_per_1k": 1000 * sum(large_res[it.id].cost for it in test) / len(test),
                    "seconds": sum(large_res[it.id].seconds for it in test) / len(test)}
    print(f"== {label}: AUROC of small-model confidence for 'is this answer right' = {auroc(right, wrong):.3f}")
    print(f"   {'policy':26} {'escalated':>9} {'accuracy':>9} {'$/1k':>8} {'mean s':>7} {'accuracy if escalation were random':>36}")
    print(f"   {'always small':26} {0:>9.0%} {never['acc']:>9.3f} {never['usd_per_1k']:>8.2f} {never['seconds']:>7.2f}")
    for tau in (0.5, 0.6, 0.7, 0.8, 0.9):
        r = cascade(small_res, test, tau)
        random_acc = never["acc"] + r["esc"] * (always_large["acc"] - never["acc"])
        print(f"   {f'cascade, escalate if conf<{tau}':26} {r['esc']:>9.0%} {r['acc']:>9.3f} {r['usd_per_1k']:>8.2f} {r['seconds']:>7.2f} {random_acc:>36.3f}")
    print(f"   {'always large':26} {1:>9.0%} {always_large['acc']:>9.3f} {always_large['usd_per_1k']:>8.2f} {always_large['seconds']:>7.2f}")

    # choose tau on the tune half: cheapest threshold whose accuracy is within 0.02 of always-large on that half
    large_tune = sum(large_res[it.id].correct for it in tune) / len(tune)
    grid = [t / 100 for t in range(0, 101, 5)]
    ok = [t for t in grid if cascade(small_res, tune, t)["acc"] >= large_tune - 0.02]
    if ok:
        tau = min(ok)                                       # lowest threshold = fewest escalations = cheapest
        r = cascade(small_res, test, tau)
        print(f"   tuned on the tune half: tau={tau:.2f}; on the test half it escalates {r['esc']:.0%} of requests, "
              f"accuracy {r['acc']:.3f} (always-large {always_large['acc']:.3f}), "
              f"cost ${r['usd_per_1k']:.2f}/1k = {r['usd_per_1k'] / always_large['usd_per_1k']:.0%} of always-large")
    else:
        print("   no threshold on the tune half gets within 0.02 of always-large: this cascade cannot meet the target")
    print()

# the break-even escalation rate, from the cost formula  cascade = c_small + p_escalate * c_large
c_small = sum(run(StandIn("small"), it).cost for it in test) / len(test)
c_large = sum(large_res[it.id].cost for it in test) / len(test)
print(f"average cost per request: small ${c_small:.6f}, large ${c_large:.6f}")
print(f"a cascade is cheaper than always-large only while p_escalate < 1 - c_small/c_large = {1 - c_small / c_large:.3f}")

# ---- a text plot of the three curves: x = share of requests escalated, y = accuracy (test half) ----
ROWS, COLS, Y0, Y1 = 11, 51, 0.70, 0.95
grid = [[" "] * COLS for _ in range(ROWS)]
never_acc = curves["G"][0]["acc"]
large_acc = sum(large_res[it.id].correct for it in test) / len(test)
for c in range(COLS):                                       # the 'random escalation' line between the two endpoints
    y = never_acc + (c / (COLS - 1)) * (large_acc - never_acc)
    grid[ROWS - 1 - round((y - Y0) / (Y1 - Y0) * (ROWS - 1))][c] = "."
for mark in ("N", "W", "G"):                                # later marks overwrite earlier ones
    for p in curves[mark]:
        c = round(p["esc"] * (COLS - 1))
        r = ROWS - 1 - round((min(max(p["acc"], Y0), Y1) - Y0) / (Y1 - Y0) * (ROWS - 1))
        grid[r][c] = mark
print()
print("accuracy vs share escalated   G good signal   W weak signal   N no signal   . random escalation")
for i, row in enumerate(grid):
    y = Y1 - i * (Y1 - Y0) / (ROWS - 1)
    print(f"{y:5.3f} |" + "".join(row))
print("      +" + "-" * COLS)
print("       0%" + " " * 20 + "50%" + " " * 21 + "100%  of requests escalated")
```

Output (executed 2026-10-26):

```text
== good confidence signal: AUROC of small-model confidence for 'is this answer right' = 0.882
   policy                     escalated  accuracy     $/1k  mean s   accuracy if escalation were random
   always small                      0%     0.726     0.62    0.57
   cascade, escalate if conf<0.5       13%     0.814     2.58    0.89                                0.751
   cascade, escalate if conf<0.6       27%     0.877     4.92    1.19                                0.780
   cascade, escalate if conf<0.7       47%     0.920     7.52    1.52                                0.819
   cascade, escalate if conf<0.8       69%     0.932    10.05    1.82                                0.862
   cascade, escalate if conf<0.9       86%     0.931    11.84    2.02                                0.897
   always large                    100%     0.925    12.48    1.65
   tuned on the tune half: tau=0.70; on the test half it escalates 47% of requests, accuracy 0.920 (always-large 0.925), cost $7.52/1k = 60% of always-large

== weak signal: AUROC of small-model confidence for 'is this answer right' = 0.676
   policy                     escalated  accuracy     $/1k  mean s   accuracy if escalation were random
   always small                      0%     0.726     0.62    0.57
   cascade, escalate if conf<0.5       12%     0.779     2.38    0.84                                0.751
   cascade, escalate if conf<0.6       31%     0.829     4.62    1.16                                0.787
   cascade, escalate if conf<0.7       58%     0.884     8.31    1.62                                0.841
   cascade, escalate if conf<0.8       81%     0.916    11.06    1.93                                0.886
   cascade, escalate if conf<0.9       93%     0.926    12.46    2.12                                0.911
   always large                    100%     0.925    12.48    1.65
   tuned on the tune half: tau=0.80; on the test half it escalates 81% of requests, accuracy 0.916 (always-large 0.925), cost $11.06/1k = 89% of always-large

== no signal (random): AUROC of small-model confidence for 'is this answer right' = 0.492
   policy                     escalated  accuracy     $/1k  mean s   accuracy if escalation were random
   always small                      0%     0.726     0.62    0.57
   cascade, escalate if conf<0.5       15%     0.756     2.55    0.83                                0.756
   cascade, escalate if conf<0.6       36%     0.797     4.90    1.19                                0.799
   cascade, escalate if conf<0.7       63%     0.850     8.28    1.62                                0.852
   cascade, escalate if conf<0.8       85%     0.901    11.22    1.97                                0.895
   cascade, escalate if conf<0.9       96%     0.917    12.57    2.15                                0.918
   always large                    100%     0.925    12.48    1.65
   tuned on the tune half: tau=0.85; on the test half it escalates 91% of requests, accuracy 0.912 (always-large 0.925), cost $12.02/1k = 96% of always-large

average cost per request: small $0.000624, large $0.012483
a cascade is cheaper than always-large only while p_escalate < 1 - c_small/c_large = 0.950
```

Read the three blocks against each other. With a good signal (AUROC 0.88) escalating about 47% of requests keeps accuracy within half a point of always-large at 60% of its cost, and the last column shows what random escalation at the same rate would have scored (0.82): the gap between the two is the value of the signal. With a weak signal (AUROC 0.68) the threshold chosen on the tuning half must escalate 81% of requests to get close, saving 11% of the cost. With no signal the cascade tracks the random-escalation column, loses accuracy and saves almost nothing. The last two lines confirm the cost arithmetic: with these illustrative prices the cascade stays cheaper than always-large until it escalates 95% of requests, so here the binding constraint is accuracy, not the cost formula. With a smaller price gap the cost bound would bite first (Exercise 1). The script ends by drawing the same curves as a text plot, shown under "Visual diagram" below: points on the dotted line are what random escalation earns.

Two honest limits of this simulation. The stand-ins' errors are partly independent (`SHARED = 0.7`, an assumption in Listing 2): real errors correlate more, since hard items are hard for every model, and the more they correlate the less a cascade can add (Exercise 4 measures this). And the confidence strengths (`signal`) are knobs, not properties of any real model: measure the AUROC of your own signal on your own data before you believe a cascade will help.

## Visual diagram

The deployability funnel:

```
   1. fix the budgets             2. biggest model that fits them all        3. check accuracy
   ──────────────────             ───────────────────────────────────        ─────────────────
   memory (GiB on the device)     weights + KV cache + overhead <= memory    does the labelled eval clear the
   speed (tokens/s, 1st token)    decode ceiling >= speed target             bar on the slices that matter,
   money ($ per request)          cost per request <= envelope               under your real traffic mix?
                                                                                   yes │              │ no
                                                                                       ▼                  ▼
                                                                                   ship it            change the design (retrieval, adapter,
                                                                                                      cascade), not just "a bigger model"
```

The cascade and what each path costs:

```
                      request
                         │
                         ▼
                ┌──────────────────┐   cost c_s, time t_s    (always paid)
                │   small model    │
                └────────┬─────────┘
                         │ confidence >= tau ?
             ┌───────────┴───────────┐
          yes│                       │no  (a hard failure, e.g. bad format, takes this branch too)
             ▼                       ▼
        return small          ┌──────────────────┐   cost c_l, time t_l   (paid only with probability p)
        answer                │   large model    │
                              └────────┬─────────┘
                                       ▼
                                 return large answer

   cost per request = c_s + p * c_l        cheaper than always-large only if  p < 1 - c_s / c_l
   mean latency     = t_s + p * t_l        escalated requests wait for BOTH models
```

Accuracy against the share of requests escalated, as printed by Listing 4 (the dotted line is random escalation; each letter is one threshold, from 0 to 1.05 in steps of 0.05):

```
accuracy vs share escalated   G good signal   W weak signal   N no signal   . random escalation
0.950 |
0.925 |                       G     G    G    GW  GW GWGWG
0.900 |                  G                W     .N...N
0.875 |             G               W     ...N..
0.850 |         G            W      ...N..
0.825 |      G        W      ...N...
0.800 |    G     W     ..N...
0.775 |   G  W   ..N...
0.750 | GGWN...N.
0.725 |GNN
0.700 |
      +---------------------------------------------------
       0%                    50%                     100%  of requests escalated
```

## Practice

### 1. Move the price gap

In Listing 4, the cascade stays cheaper than always-large while `p < 1 - c_s / c_l`. If the small model cost half as much as the large one per request instead of one twentieth, what is the break-even escalation rate, and what does that mean for the "good signal" cascade that escalated 47% of requests?

<details><summary>Answer</summary>

`c_s / c_l = 0.5`, so the break-even escalation rate is `1 - 0.5 = 0.5`. A cascade that escalates 47% of requests would cost `c_s + 0.47 c_l = 0.97 c_l`, which is almost exactly the cost of always using the large model: it saves only about 3%, so accuracy gains from the small model's confident answers would barely pay for the extra latency. The price ratio decides whether a cascade is worth building before accuracy is even considered.

</details>

### 2. How many items do I need?

A small model scores 0.92 on your labelled set and the product bar is 0.88. Using `wilson` from Listing 2, about how many items do you need before the lower bound of the 95% interval is above 0.88 (assuming the observed accuracy stays at 0.92)?

<details><summary>Answer</summary>

Evaluating `wilson(round(0.92 * n), n)`: at n = 200 the interval is [0.874, 0.950] (lower bound below 0.88), at n = 300 it is [0.884, 0.946] (above), so roughly 300 items. A real observed accuracy will fluctuate, so plan for more, and remember this is per slice: each slice you need to certify separately needs its own 300.

</details>

### 3. Does it fit with a long context?

Using Listing 1's numbers, which family size at 4-bit fits in an 8 GiB budget at an 8,192-token context? What happens to the 7B size at a 32,768-token context, and to the 14B size?

<details><summary>Answer</summary>

At 8,192 tokens the 7B size at `~Q4` needs 5.67 GiB (4.36 GiB weights x 1.2 + 0.44 GiB KV), so it fits; the 14B size needs 11.65 GiB and does not. At 32,768 tokens the 7B KV cache grows to 56 KiB x 32,768 = 1.75 GiB and the total becomes 4.36 x 1.2 + 1.75 = 6.98 GiB, still within 8 GiB; the 14B KV cache is 192 KiB x 32,768 = 6 GiB and its total is 16.15 GiB. Long contexts hit the KV cache first, which is why GQA models with few KV heads matter on small devices.

</details>

### 4. Correlate the errors

In Listing 2 set `SHARED` to `0.0` (errors independent) and to `1.0` (the large model is right on every item the small one is right on), keep the good signal and `tau = 0.7`, and compare the cascade's accuracy with always-large. What do you find, and why does it matter?

<details><summary>Answer</summary>

In our run (same 4,000-item set, test half): with `SHARED = 0.0` always-large scored 0.912 and the cascade at `tau = 0.7` scored 0.925, better than the large model alone because the small model is sometimes right where the large one is wrong and the signal can tell. With the default `0.7` the cascade scored 0.920 against 0.925, and with `1.0` it scored 0.905 against 0.925. As errors become more shared, a cascade can at best approach the large model; it can no longer beat it. Real models' errors are correlated to an unknown degree, so assuming independence flatters a cascade, and you must measure on real outputs.

</details>

### 5. A critical slice

The business says field extraction must be at least 0.95 accurate. Using Listing 3's slice table, can the small stand-in take that traffic? What would you try before giving up on small models for it?

<details><summary>Answer</summary>

No: its extraction accuracy is 0.89 with interval [0.85, 0.92], below 0.95 even at the upper end, while the large stand-in measures 0.97. Before routing extraction to the large model, try cheap changes and re-measure on a fresh held-out set: a tighter prompt with a format example, structured output so the answer can be validated, a validator that triggers the fallback path on malformed fields, or a small adapter trained on labelled extractions ([Track 04 Module 12](../../04-training-fine-tuning-and-alignment/12-lora-low-rank-adaptation/README.md)). Each is an experiment judged by the same harness, not an assumption.

</details>

### Checkpoint quiz

1. Why does this module define "small" by deployability, and what three budgets does it use?
2. Name the three failure modes this module expects small models to show, and say why they are hypotheses rather than facts.
3. In Listing 3, why did the same two models lead to different choices on the two traffic mixes?
4. What does an AUROC of 0.5 for a cascade's confidence signal mean for the cascade?
5. Write the cost per request and the break-even escalation rate for a cascade.
6. Why is the threshold chosen on one half of the data and reported on the other?

<details><summary>Answers</summary>

1. Parameter counts that count as "small" keep changing with hardware, quantisation and architecture; what is stable is whether the model fits where it must run. The budgets are memory, speed (decode rate and time to first token) and cost per request.
2. Reasoning depth, long context and knowledge breadth. They are common weak spots but depend on the model, the task and the prompt, so you slice your own evaluation to see whether they apply.
3. The traffic mixes weight the task types differently. The small model is close to the large one on the easy types (triage-style traffic) and far behind on reasoning, obscure knowledge and long context (broad traffic), so the lower confidence bound clears the bar on one mix and not the other.
4. The confidence carries no information about correctness, so escalating on low confidence is the same as escalating at random: accuracy follows the straight line between always-small and always-large, and the cascade pays both models' cost for it.
5. Cost per request `= c_s + p x c_l`. It is cheaper than always-large while `p < 1 - c_s / c_l`.
6. A threshold picked on the same data it is judged on is optimistically biased (it has been fitted to that data's noise). Choosing on a tuning split and reporting on held-out items gives an honest estimate.

</details>

> [!check]
> - I can define "small" by memory, speed and cost, and compute a model's fit for a budget
> - I can name where small models tend to fail and why those are hypotheses to slice for
> - I can describe distillation, pruning, quantisation and data quality as far as their sources support
> - I can score two models on a labelled set, with per-slice results and confidence intervals
> - I can explain why the traffic mix changes the downsizing decision
> - I can simulate a cascade, tune its threshold on a split, and say when it saves nothing

## Project

Run the "evaluate, then downsize" method on a task of your own. Choose something you can label: ticket routing, field extraction from your own documents, classifying commit messages, short Q&A over a fixed document. Build a labelled set of at least 200 items with at least three slices, and write the scorer first (what counts as correct, how you extract the answer). Implement two real callables with the same interface as Listing 2's stand-ins (two sizes of an open-weight model served locally, or two tiers of a hosted API, with the pinned version recorded) and run the harness.

Then write a one-page decision memo with: the requirement, per-slice accuracy with intervals, cost per 1,000 requests and per correct answer using your real token counts and a price you looked up (with its date), the decision rule you committed to before running, and the decision. Finally add a cascade using a confidence signal you can actually compute for your task (token probabilities if your server returns them, a validator, or agreement between samples), report its AUROC, choose its threshold on a tuning split and report the held-out cost-accuracy trade-off against both single models. State what in your result would change if the traffic mix changed. There is no reference solution.

## Interview questions

> [!interview] Our product sends every request to a large hosted model and the bill is high. How would you decide what can move to a smaller model?

<details><summary>What a strong answer covers</summary>

Start from the requirement (metric, bar, latency, cost envelope) and a labelled sample of real traffic split into slices, not from a benchmark. Measure the current model as the baseline, then candidates with the same scorer, prompts and deterministic decoding, reporting per-slice accuracy with confidence intervals and cost per correct answer. Decide with a rule fixed in advance (smallest model whose lower bound clears the bar on the slices that matter, under the real traffic mix). Expect easy slices to move first and hard ones (multi-step reasoning, long context, rare knowledge) to stay, which leads to routing or a cascade. Mention monitoring after launch, re-running on every model or prompt change, and licence checks if distillation or fine-tuning is involved.

</details>

> [!interview] When does a cascade not save money, and how would you find out before building it?

<details><summary>What a strong answer covers</summary>

Cost: it is cheaper than always-large only while the escalation rate is below `1 - c_s / c_l`, so a small price gap makes it a poor deal even with a good signal, and escalated requests pay both models. Signal: if the confidence has AUROC near 0.5, escalation is effectively random and accuracy follows the straight line between the endpoints. Correlated errors cap the gain. Latency: escalated requests wait for both models, so tail latency worsens. To find out: log both models' outputs and the confidence on a labelled sample, compute the AUROC, simulate thresholds on a tuning split, report on a held-out split, and compare cost and accuracy with each single model, as in Listing 4, using real prices and token counts.

</details>

> [!interview] What does "small language model" mean, and how would you choose a size for a device with 8 GiB of memory?

<details><summary>What a strong answer covers</summary>

It is not a fixed parameter count; it is a model small enough to meet the memory, speed and cost budgets of where it runs, and the threshold moves as hardware and quantisation improve. For the device: compute weights at the chosen precision (parameters times bytes per parameter, using real file sizes for quantised formats rather than nominal bits), add the KV cache for the target context and number of concurrent sequences (layers x KV heads x head size x 2 x bytes x tokens), add an overhead margin, and check the decode ceiling `bandwidth / bytes per token` and the first-token time against the product's latency target, remembering real speeds are below the ceiling. Then verify accuracy on a labelled sample, since fitting in memory says nothing about whether it is good enough.

</details>

## Common mistakes & troubleshooting

| Symptom | Likely cause | What to do |
|---|---|---|
| The small model passes your eval but disappoints in production | the eval set is cleaner or narrower than real traffic, or the prompt was tuned on it | sample real inputs, keep a held-out set you never tune on, and score a slice of live traffic |
| Two models look different but the intervals overlap | too few items, especially per slice | compute Wilson intervals; collect more items for the slices that decide the question |
| The cascade escalates almost everything | the confidence signal is weak or the threshold is too high | measure AUROC; fix or replace the signal; retune on a tuning split |
| The cascade is as expensive as the large model | the price gap is small, or the escalation rate is high | compare `p` with `1 - c_s / c_l` before building it |
| Cascade accuracy is below always-large and you expected parity | errors are correlated or the signal is overconfident on its mistakes | evaluate on real outputs; check calibration per slice |
| Mean latency improves but users complain about slow requests | escalated requests wait for both models | report p95/p99 latency, not only the mean; consider routing before the small call |
| Memory estimate fits but the process is killed | KV cache for long contexts or many users, overhead, a quantised file bigger than `params x bits / 8` | use real file sizes, budget the cache for your longest context, measure peak memory |
| The cost estimate is off by a large factor | only output tokens counted, or long prompts ignored | count input and output tokens from real usage fields; long-context requests dominate |
| Threshold chosen last month stops working | traffic or model version changed | re-tune on fresh data; alert on the escalation rate drifting |

## Further reading & sources

- [Distilling the Knowledge in a Neural Network](https://arxiv.org/abs/1503.02531) - Hinton, Vinyals and Dean: compressing an ensemble's knowledge into one model that is easier to deploy; the origin of the term as used here.
- [DistilBERT, a distilled version of BERT: smaller, faster, cheaper and lighter](https://arxiv.org/abs/1910.01108) - applies distillation during pre-training; the abstract reports the size, speed and retained-capability figures quoted in this module.
- [Textbooks Are All You Need](https://arxiv.org/abs/2306.11644) - the phi-1 paper: a 1.3B-parameter code model trained on curated and synthetic "textbook quality" data; cited for the data-quality lever.
- [Sheared LLaMA: Accelerating Language Model Pre-training via Structured Pruning](https://arxiv.org/abs/2310.06694) - structured pruning of a larger model into smaller ones; cited for the pruning lever.
- [FrugalGPT: How to Use Large Language Models While Reducing Cost and Improving Performance](https://arxiv.org/abs/2305.05176) - names prompt adaptation, LLM approximation and LLM cascade as cost strategies and evaluates a cascade; cited for the cascade idea.
- [Qwen2.5 Technical Report](https://arxiv.org/abs/2412.15115) - describes the open-weight Qwen2.5 family whose fetched configurations supply the seven sizes in Listing 1.
- [TRL documentation](https://huggingface.co/docs/trl/index) - the training library whose index lists a `DistillationTrainer` under knowledge distillation, alongside the SFT and preference trainers.

## Next

[Module 15: On-Device and Edge Inference](../15-on-device-and-edge-inference/README.md)
