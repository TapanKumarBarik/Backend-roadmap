# Module 04: VRAM: The Real Constraint

## Roadmap

You are in Track 05, GPUs & GenAI Hardware. [Module 03](../03-memory-hierarchy-and-bandwidth/README.md) explained how *fast* data moves between a GPU's memory levels. This module is about the other half of the memory story: how *much* fits. The next module turns the ideas here into exact formulas.

Prerequisites: Module 03 (VRAM is the large, off-chip memory on the card) and a rough picture of a transformer's layers from [Track 02](../../02-transformer-architecture/README.md). Nothing else.

After this module you can:

- Name the six things that occupy GPU memory and say which exist in inference, which in training, and which grow with batch size and sequence length.
- Explain why running out of VRAM kills a job instead of slowing it down.
- Read an out-of-memory (OOM) error as a clue about *which* category ran out.
- Pick a lever (precision, batch, context, checkpointing, offload, parallelism) and say what it costs.

Why it matters: every later hardware decision (which GPU, how many, whether to quantize, how many users one GPU can serve) is a memory decision first and a speed decision second.

## Concept

> [!key] Running out of compute makes a GPU job slower; running out of VRAM makes it fail. Everything that must be resident at the same moment (weights, plus gradients and optimizer states in training, plus activations or the KV cache, plus runtime overhead) has to fit in one fixed-size pool, so capacity is usually the first wall you hit.

## Explanation

### Why you hit the memory wall before the compute wall

A compute shortage is a *soft* limit. If a GPU has half the arithmetic throughput you wanted, the same program runs in twice the time. A memory shortage is a *hard* limit. If the program asks for one more byte than the card has, the allocation fails and the process stops. There is no "run at half memory" mode.

Three facts make the hard limit bite early:

1. **Weights must be resident.** Every forward pass reads every weight. Parking them in CPU RAM and fetching on demand crosses a far slower link than the GPU's own memory (the numbers are in Module 03), so in practice the weights live on the card.
2. **Memory per model grows faster than memory per card.** A 7-billion-parameter model in 16-bit numbers is about 13 GiB of weights alone (Module 05 does the arithmetic). The cards below hold between 24 and 94 GB.
3. **Training multiplies the footprint.** Gradients, optimizer states and activations come on top of the weights (listing 1 below puts a number on it).

| Card | GPU memory | Source (checked Oct 2026) |
|------|-----------|---------------------------|
| GeForce RTX 4090 | 24 GB GDDR6X | [NVIDIA product page](https://www.nvidia.com/en-us/geforce/graphics-cards/40-series/rtx-4090/) |
| A100 | 40 GB (HBM2) or 80 GB (HBM2e) | [NVIDIA A100 datasheet](https://www.nvidia.com/content/dam/en-zz/Solutions/Data-Center/a100/pdf/nvidia-a100-datasheet-us-nvidia-1758950-r4-web.pdf) |
| H100 | 80 GB (SXM) or 94 GB (NVL) | [NVIDIA H100 page](https://www.nvidia.com/en-us/data-center/h100/) |

These are marketed capacities; the usable amount on a real card is a little lower because the driver and runtime take their share first. Specs change with each hardware generation, so treat the table as an illustration of scale and check the vendor page before you buy or rent.

### The six things that live in VRAM

1. **Weights.** The model's parameters. Always present. Size = number of parameters x bytes per parameter. Does not change with batch size or sequence length.
2. **Gradients.** Training only. One gradient per trainable parameter, produced by the backward pass and consumed by the optimizer. Frozen parameters (for example, the base model under [LoRA](../../04-training-fine-tuning-and-alignment/12-lora-low-rank-adaptation/README.md)) have none.
3. **Optimizer states.** Training only. The Adam optimizer keeps two extra numbers per parameter (a running average of the gradient and of its square), and mixed-precision training adds a full-precision master copy of the weights (Module 07). The ZeRO paper observes that, among the parameter-sized tensors, the optimizer states usually consume the most memory.
4. **Activations.** Training: the intermediate results of the forward pass that the backward pass needs, kept for *every layer* until backward reaches them. They scale with batch x sequence length x layers. Inference: nothing needs to be kept, so only a couple of working buffers are alive at once (listing 2 measures the difference).
5. **KV cache.** Inference of autoregressive models. To produce each new token the model needs the attention keys and values of all earlier tokens; storing them avoids recomputing them. The cache scales with batch x sequence length x layers and *grows while the model generates*. In the vLLM paper's example (a 13B model on a 40 GB A100), roughly 65% of memory is weights and close to 30% is this dynamic request state.
6. **Runtime overhead and fragmentation.** The CUDA context, temporary workspace buffers for kernels, and the framework's caching allocator, which holds on to freed blocks and can leave unusable gaps between live ones. This category is the hardest to predict, which is why capacity planning always adds a margin.

> [!model] Fixed cost versus variable cost. Weights, gradients and optimizer states are *fixed* by the model: they decide whether the model fits at all. Activations and the KV cache are *variable* with the work: batch x tokens decides how much you can do per GPU. When someone says "it fits but I can't raise the batch size", the fixed costs are eating the pool and leaving no room for the variable ones.

| Category | Inference | Training | Grows with |
|----------|-----------|----------|------------|
| Weights | yes | yes | parameters x bytes per parameter |
| Gradients | no | yes | trainable parameters |
| Optimizer states | no | yes | trainable parameters |
| Activations | transient only | yes, all layers kept | batch x sequence x layers |
| KV cache | yes | no | batch x sequence x layers (and KV width) |
| Overhead / fragmentation | yes | yes | roughly fixed, plus allocator behaviour |

### What "out of memory" actually means

PyTorch raises `torch.cuda.OutOfMemoryError` when its allocator asks CUDA for a block and cannot get one. Three things are worth knowing about that moment.

**The failing request is the last straw, not the culprit.** The error names the allocation that did not fit, but the memory was already taken by everything allocated earlier. *When* it fails is the clue:

- During model load: the weights themselves are too big (check the precision they are loaded in).
- On the first forward pass or the first larger batch: activations (training) or the prompt's KV cache (inference).
- In the backward pass: gradients plus the activations still held.
- At the first optimizer step: optimizer states. PyTorch's built-in optimizers typically create their state tensors lazily on the first `step()`, so a job that survives forward and backward and then dies there is often a sign that optimizer states did not fit.
- In a server, after minutes or hours of fine behaviour: the KV cache grew as requests arrived or lengthened.

**"Free" and "reserved" are different.** PyTorch uses a caching allocator: memory it has finished with stays reserved so the next allocation is fast. The PyTorch documentation notes that this unused-but-cached memory still shows as used in `nvidia-smi`; `memory_allocated()` reports bytes occupied by tensors and `memory_reserved()` reports what the allocator is holding.

**Fragmentation can fail an allocation that "should" fit.** The PyTorch documentation describes how a workload whose batch size changes slightly from step to step leaves slivers of unusable free memory inside existing segments; its `expandable_segments` allocator option exists to reduce this. Some GPU memory is also taken outside PyTorch's allocator entirely (the docs name NCCL, the multi-GPU communication library, as an example), so PyTorch's own counters can sit below what `nvidia-smi` reports.

> [!pitfall] "The model is 14 GB and the card has 24 GB, so it fits." Weights are the floor, not the total. Add the KV cache for the number of users and context length you want, add overhead, and for training multiply by roughly 8 or more (Module 05 derives the factor).

### The levers

Once you know which category is too big, you know which lever to pull. Every lever trades memory against something else.

| Lever | What it shrinks | What it costs |
|-------|-----------------|---------------|
| Lower-precision weights (FP16 to INT8 to INT4) | weights (and the KV cache, if you quantize it too) | some accuracy; needs kernel support. See [Module 06](../06-numeric-formats-fp32-fp16-bf16/README.md) and [Track 04 quantization](../../04-training-fine-tuning-and-alignment/15-quantization-int8-int4-gguf/README.md) |
| Smaller batch | activations, KV cache | fewer sequences processed at once, so lower throughput |
| Shorter context | KV cache, activations | less history the model can attend to |
| Activation checkpointing | activations | recomputes part of the forward pass (the ZeRO paper cites about 33% extra compute); see Module 05 |
| Freeze most parameters (LoRA) | gradients, optimizer states | limits what can be learned; see [Module 12](../../04-training-fine-tuning-and-alignment/12-lora-low-rank-adaptation/README.md) of Track 04 |
| Memory-efficient attention kernels | attention-score activations | none in the result; see [Module 08](../08-flashattention-and-memory-efficient-kernels/README.md) |
| Offload to CPU RAM or disk | weights, optimizer states | much slower, because data now crosses a slower link (Module 03) |
| Parallelism across GPUs | each GPU's share of everything | more GPUs plus communication; see Modules 09 to 11 |
| A bigger or more numerous GPU | everything | money; see Modules 12 and 13 |

The cheapest levers (in quality and in money) are the ones that remove waste: a lower-precision format that does not hurt accuracy, or a kernel that computes the same result with less scratch memory. The expensive ones change what the system can do: shorter context, smaller batch, slower offload.

## Code

All numbers below come from running the listings with Python 3.13 and numpy 2.4. No GPU is involved: a byte is a byte whether it sits in VRAM or in CPU RAM, so counting bytes on the CPU shows the same accounting.

### Listing 1: a ledger of the six categories

This is a table of byte counts. The KV-cache-per-token figure (`512 * 1024`) is the value for a Llama-2-7B-shaped model in FP16, taken as given here; Module 05 derives it. The overhead line uses a rule of thumb from the Hugging Face Accelerate documentation (inference needs up to about 20% more than the loaded weights, a figure they attribute to EleutherAI). Activations are marked `n/a` because they depend on batch x sequence and are measured in listing 2.

```python
import numpy as np

GIB = 1024 ** 3
P = 7e9                          # a "7B-class" model; the exact count does not change the picture
KV_PER_TOKEN = 512 * 1024        # bytes of KV cache per token: Llama-2-7B-shaped, FP16 (module 05 derives it)
OVERHEAD = 0.20                  # runtime overhead as a fraction of the weights: a rule of thumb, see text

categories = ["weights", "gradients", "optimizer states", "KV cache", "activations", "runtime overhead"]
scenarios = ["serve x1", "serve x16", "serve x16", "train"]
details   = ["FP16", "FP16", "INT4", "mixed Adam"]
nan = np.nan

# rows = categories, columns = scenarios, bytes. NaN = depends on batch x sequence; not counted here.
table = np.array([
    [2 * P,            2 * P,             0.5 * P,           2 * P ],   # weights: 2 B (FP16), 0.5 B (INT4), 16-bit copy in training
    [0,                0,                 0,                 2 * P ],   # gradients, 16-bit
    [0,                0,                 0,                 12 * P],   # fp32 master copy + Adam m + Adam v = 4 + 4 + 4 B
    [KV_PER_TOKEN * 4096 * 1, KV_PER_TOKEN * 4096 * 16, KV_PER_TOKEN * 4096 * 16, 0],   # 4096-token contexts
    [nan,              nan,               nan,               nan   ],   # activations: measured in the next listing
    [OVERHEAD * 2 * P, OVERHEAD * 2 * P,  OVERHEAD * 0.5 * P, nan  ],
])
total = np.nansum(table, axis=0)

print(f"{'GiB':18s}" + "".join(f"{s:>12s}" for s in scenarios))
print(f"{'':18s}" + "".join(f"{d:>12s}" for d in details))
for name, row in zip(categories, table / GIB):
    print(f"{name:18s}" + "".join(f"{'n/a' if np.isnan(v) else f'{v:.1f}':>12s}" for v in row))
print(f"{'counted total':18s}" + "".join(f"{v / GIB:12.1f}" for v in total))
for budget in (24, 80):
    print(f"{f'fits in {budget} GiB?':18s}" + "".join(f"{'yes' if v / GIB <= budget else 'NO':>12s}" for v in total))
```

Output:

```
GiB                   serve x1   serve x16   serve x16       train
                          FP16        FP16        INT4  mixed Adam
weights                   13.0        13.0         3.3        13.0
gradients                  0.0         0.0         0.0        13.0
optimizer states           0.0         0.0         0.0        78.2
KV cache                   2.0        32.0        32.0         0.0
activations                n/a         n/a         n/a         n/a
runtime overhead           2.6         2.6         0.7         n/a
counted total             17.6        47.6        35.9       104.3
fits in 24 GiB?            yes          NO          NO          NO
fits in 80 GiB?            yes         yes         yes          NO
```

> [!example] Read the table column by column. One user on a 24 GiB card: fits, with room to spare. Sixteen users: the weights did not change, but the KV cache went from 2 GiB to 32 GiB and the 24 GiB card is out. Quantizing the weights to INT4 (third column) saved about 10 GiB but did nothing for the 32 GiB cache, so it still does not fit. Training the same model: gradients and optimizer states add up to seven times the 16-bit weights, bringing the total to 104 GiB before a single activation is counted, which does not fit even an 80 GiB card.

The INT4 column uses 0.5 bytes per parameter. Real 4-bit formats also store scale factors, so their true size is a little larger; Track 04's quantization module covers that.

### Listing 2: activations scale with the work, weights do not

A toy stack of 8 dense layers (width 512, FP32) run on `tokens` rows. "Train" keeps each layer's input for the backward pass, as training must. "Infer" keeps only what the current layer needs: its input and its output. The sizes are the real `nbytes` of the real arrays.

```python
import numpy as np

rng = np.random.default_rng(0)
D, LAYERS = 512, 8                                   # width and depth of a toy stack of dense layers
weights = [(rng.normal(size=(D, D)) / np.sqrt(D)).astype(np.float32) for _ in range(LAYERS)]
weight_bytes = sum(w.nbytes for w in weights)

def forward(x, keep_for_backward):
    """Run the stack. Training must keep every layer's input for the backward pass; inference may drop it."""
    saved, peak_live = [], 0
    for w in weights:
        if keep_for_backward:
            saved.append(x)                          # held until backward runs
        y = np.maximum(x @ w, 0)
        peak_live = max(peak_live, x.nbytes + y.nbytes)   # input and output are alive together
        x = y
    return sum(a.nbytes for a in saved), peak_live

MIB = 1024 ** 2
print(f"weights: {weight_bytes / MIB:.1f} MiB (same in every row)")
print(f"{'tokens':>8s} {'train: saved acts':>19s} {'infer: peak live':>18s} {'saved / weights':>16s}")
for tokens in (128, 1024, 4096, 16384):
    x = rng.normal(size=(tokens, D)).astype(np.float32)
    saved, _ = forward(x, keep_for_backward=True)
    _, live = forward(x, keep_for_backward=False)
    print(f"{tokens:8d} {saved / MIB:16.1f} MiB {live / MIB:15.1f} MiB {saved / weight_bytes:15.1f}x")
```

Output:

```
weights: 8.0 MiB (same in every row)
  tokens   train: saved acts   infer: peak live  saved / weights
     128              2.0 MiB             0.5 MiB             0.2x
    1024             16.0 MiB             4.0 MiB             2.0x
    4096             64.0 MiB            16.0 MiB             8.0x
   16384            256.0 MiB            64.0 MiB            32.0x
```

The weights stay at 8 MiB. Training's saved activations grow in lockstep with `tokens` and pass the weights' size around 512 tokens; here they reach 32 times the weights at 16,384 tokens. The inference working set also grows with tokens, but it does not grow with the number of layers: it is two buffers, not eight. A real transformer layer stores several tensors per layer rather than one, so real activation memory is larger than this toy's; Module 05 gives a published estimate.

### Listing 3: look at real GPU memory (not executed in this module's verification)

This listing needs PyTorch and a CUDA GPU, neither of which was available when this module was written, so it was **not executed** and no output is shown. The function names were checked against the PyTorch documentation index.

```python
import torch

free, total = torch.cuda.mem_get_info()                  # bytes the driver reports for the current GPU
print(f"driver: {free / 2**30:.1f} GiB free of {total / 2**30:.1f} GiB")

x = torch.empty(1024, 1024, 256, device="cuda")          # 1 GiB of float32
print("allocated by tensors :", torch.cuda.memory_allocated() / 2**30, "GiB")
print("reserved by allocator:", torch.cuda.memory_reserved() / 2**30, "GiB")

del x
print("after del, allocated :", torch.cuda.memory_allocated() / 2**30, "GiB")
print("after del, reserved  :", torch.cuda.memory_reserved() / 2**30, "GiB   (cached, still shows in nvidia-smi)")

torch.cuda.reset_peak_memory_stats()
# ... run one training step or one generation here ...
print("peak allocated       :", torch.cuda.max_memory_allocated() / 2**30, "GiB")
```

For a time-line of what held memory when, the PyTorch guide "Understanding CUDA Memory Usage" (linked below) shows how to record a snapshot with `torch.cuda.memory._record_memory_history()` and view it.

## Visual diagram

The same 7B-class model under four workloads, drawn from listing 1. One character is about 2 GiB. `W` weights, `G` gradients, `O` optimizer states, `K` KV cache, `H` overhead. Activations are not drawn because they depend on batch and sequence.

```
                      24 GiB card                 80 GiB card
                                ▼                           ▼
                    ············│···························│···············
 serve x1,  FP16    WWWWWWKH   17.6 GiB
 serve x16, FP16    WWWWWWKKKKKKKKKKKKKKKKH   47.6 GiB
 serve x16, INT4    WWKKKKKKKKKKKKKKKKH   35.9 GiB
 train, mixed Adam  WWWWWWGGGGGGOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOO   104.3 GiB + activations
```

And the question to ask when an OOM appears: *where in the run did it die?*

```
 where did it die?                         most likely category
 ─────────────────────────────────────     ─────────────────────────────────
 while loading the model             ───►  weights (too big, or loaded in a wider format)
 first forward / first long prompt   ───►  activations or prompt KV cache
 inside backward()                   ───►  gradients + activations held so far
 at the first optimizer.step()       ───►  optimizer states
 in a server, only under load        ───►  KV cache growing with users x length
 later, after hours, in a loop       ───►  fragmentation / memory leak (steady growth in memory_reserved)
```

## Practice

### 1. Classify the footprint (no code)

For each situation, list which of the six categories are present and which one will grow if you double the batch size: (a) chatting with a model through a local server, one user; (b) full fine-tuning of a 1B-parameter model; (c) LoRA fine-tuning of the same model; (d) running a model's forward pass once to compute embeddings, with no generation.

<details><summary>Answer</summary>

(a) Weights, KV cache, overhead. Doubling the batch (more simultaneous users) doubles the KV cache. (b) All six: weights, gradients, optimizer states, activations, overhead; no KV cache. Doubling the batch doubles activations. (c) Weights (all of them, frozen), plus gradients and optimizer states for the small adapter only, activations (still needed to backpropagate through the frozen layers), overhead. Doubling the batch still doubles activations; the adapter's gradient and optimizer memory is tiny. (d) Weights, overhead, and a couple of transient working buffers. There is no KV cache because nothing is generated token by token, and no gradients because nothing is trained. Doubling the batch doubles only the transient buffers.

</details>

### 2. Predict, then run

In listing 2, change `D` from 512 to 1024 and predict two things before running: the weight size, and the "saved / weights" ratio at 4096 tokens. Then run it.

<details><summary>Answer</summary>

Each weight matrix is D x D, so weights grow 4x: 8 layers x 1024 x 1024 x 4 bytes = 32 MiB. Saved activations are tokens x D x 4 bytes per layer, so they grow only 2x (64 MiB becomes 128 MiB at 4096 tokens). The ratio therefore halves, from 8.0x to 4.0x. Running the modified listing gave exactly this: `weights: 32.0 MiB`, and at 4096 tokens `128.0 MiB` saved, ratio `4.0x`. The lesson: wider models put proportionally more memory into weights and less into activations per token; more tokens push the other way.

</details>

### 3. Diagnose from the symptom

(a) A fine-tuning script runs at batch size 1 but dies inside `backward()` at batch size 8. (b) A chat server starts fine and serves one request after another happily, then dies when many users connect at once. (c) A job survives forward and backward and dies on the first `optimizer.step()`. Name the category for each and one lever.

<details><summary>Answer</summary>

(a) Activations: they scale with batch, and backward is where they are all held at once. Levers: smaller batch (use gradient accumulation to keep the effective batch), activation checkpointing. (b) KV cache: it scales with concurrent users x context length. Levers: cap concurrent sequences or context length, quantize or page the cache, use a model with fewer KV heads (Module 05). (c) Optimizer states, which are typically allocated on the first step. Levers: freeze most parameters (LoRA), lower-memory optimizer variants, shard the states across GPUs (Module 11).

</details>

### 4. Add a scenario to the ledger

Add a fifth column to listing 1: "serve x16 with INT4 weights and an INT8 KV cache" (the cache needs half the bytes per token). Does it fit in 24 GiB?

<details><summary>Answer</summary>

Weights 0.5 x 7e9 bytes = 3.26 GiB; KV cache: half of 512 KiB per token is 256 KiB, x 4096 tokens x 16 users = 16.0 GiB; overhead 20% of the weights = 0.65 GiB. Total = 19.9 GiB (computed with Python), which fits in 24 GiB, though with little spare room. The point: weight quantization alone did not rescue the 16-user case, but quantizing weights *and* the cache did.

</details>

### Checkpoint quiz

1. Why does running out of VRAM end a job while running out of compute only slows it?
2. Which categories exist in inference but not in training, and the reverse?
3. A server's memory climbs steadily as users arrive. Which category is growing, and with what?
4. `nvidia-smi` shows the card full after you `del` a large model in a notebook. Is that necessarily a leak?
5. Name two levers that shrink activations and say what each costs.

<details><summary>Answers</summary>

1. Compute is a rate: less of it means the same work takes longer. Memory is a capacity: the data must all be resident, and an allocation beyond the capacity fails.
2. Inference only: the KV cache. Training only: gradients, optimizer states, and the full set of saved activations. Weights and overhead exist in both.
3. The KV cache, growing with the number of concurrent sequences times their lengths.
4. No. PyTorch's caching allocator keeps freed memory reserved for reuse, and `nvidia-smi` shows reserved memory as used. `memory_allocated()` shows what tensors really hold; `torch.cuda.empty_cache()` releases the unused cache.
5. A smaller batch (costs throughput) and activation checkpointing (costs recomputation, roughly an extra forward pass); memory-efficient attention kernels (cost nothing in the result, Module 08) are a third.

</details>

> [!check]
> - I can name the six categories of GPU memory and say which exist in inference, in training, or both
> - I can say which categories grow with batch size and sequence length and which do not
> - I can explain why an OOM is a hard failure and why `nvidia-smi` can overstate real use
> - I can map "where did it die" to the likely category
> - I can name a lever for each category and what it costs

## Project

Write `vram_ledger.py`, a small command-line tool that takes a scenario and prints a memory ledger in the style of listing 1, then helps you fix a scenario that does not fit.

Requirements:

- Input (command-line flags or a small JSON file): parameter count, bytes per parameter for the weights, mode (`infer` or `train`), batch size, context length, KV bytes per token, and the GPU's memory in GiB.
- Output: a ledger with the six categories. Categories you cannot compute from the inputs must print as "not counted", never as zero. End with `fits` or `does not fit` and the headroom or shortfall in GiB.
- If the scenario does not fit, try each lever from the table in this module (lower weight precision, halve the batch, halve the context, quantize the KV cache, freeze 99% of parameters) one at a time, recompute, and print the levers that make it fit, cheapest first by your own judgement of cost. Say what you ranked by.
- Stretch: add a `--gpus N` flag that divides weights, gradients and optimizer states perfectly across N GPUs and report the smallest N that fits. State clearly in the output that real sharding is never perfect.

There is no reference solution. Test it on the four columns of listing 1 and check that your totals match.

## Interview questions

> [!interview] A 7B-parameter model needs about 14 GB in 16-bit weights. A team tries to fine-tune it fully on a 24 GB GPU and gets an out-of-memory error. Explain why, using the categories of GPU memory, and propose two fixes.

<details><summary>What a strong answer covers</summary>

Weights are only the floor. Training also needs gradients (same size as the trainable weights), optimizer states (Adam keeps two more values per parameter, plus a full-precision master copy in mixed precision), and activations (scaling with batch x sequence x layers). The standard accounting is about 16 bytes per parameter for the first three, which is more than 100 GiB for 7B parameters before activations. Fixes: freeze most parameters with LoRA or QLoRA so gradients and optimizer states cover a tiny adapter; shard states across several GPUs; shrink activations with checkpointing and a smaller micro-batch; or move to a bigger card. A strong answer names what each fix costs.

</details>

> [!interview] An inference server works in testing but runs out of memory in production under load. What do you suspect first, and how do you confirm and mitigate it?

<details><summary>What a strong answer covers</summary>

Suspect the KV cache: it grows with concurrent requests and with context length, while the weights are constant. Confirm by logging allocated versus reserved memory and the number of active sequences over time; steady growth that tracks load points to the cache, and growth in reserved-but-unallocated memory points to fragmentation. Mitigate with a cap on concurrent sequences or context, a cache-aware scheduler or paged cache (the vLLM paper's subject; Track 14), a model with grouped-query attention, a quantized cache, or more/larger GPUs. Mentioning that weights quantization alone does not shrink the cache is a good sign.

</details>

> [!interview] People say "LLMs are memory-bound, not compute-bound". Is that precise? What are the two different senses of "memory" in that claim?

<details><summary>What a strong answer covers</summary>

Two separate constraints: capacity (does everything fit in VRAM at all, the subject of this module) and bandwidth (how fast data moves between memory and the compute units, Module 03, which limits token-by-token generation speed). They are related but different: you can fit a model and still be slow because every token reads all the weights, and you can be bandwidth-rich and still OOM. A strong answer also notes that capacity is a hard cliff while bandwidth and compute are soft limits that set speed.

</details>

## Common mistakes & troubleshooting

| Symptom | Likely cause | What to do |
|---------|--------------|------------|
| `nvidia-smi` still shows many GiB used after `del model` | The caching allocator keeps freed blocks reserved | Compare `memory_allocated()` with `memory_reserved()`; call `torch.cuda.empty_cache()` if another process needs the memory |
| Works at batch 1, fails at batch 2 | Activations or KV cache scale with batch | Lower the batch, use gradient accumulation (training), or cap concurrent sequences (serving) |
| OOM appears at step 300, not step 1 | Variable sequence lengths grew a batch; or fragmentation from changing shapes | Pad or bucket to a fixed maximum length; try the allocator option `expandable_segments` described in the PyTorch CUDA notes |
| OOM message says plenty of memory is free | Free memory is scattered in pieces too small for the request | Same as above; also check memory used outside PyTorch's allocator (for example NCCL buffers) |
| Total memory in `nvidia-smi` is higher than PyTorch's `memory_reserved()` | Some libraries allocate GPU memory outside PyTorch's allocator | Expect a gap; leave headroom |
| Server dies after a few hours | KV cache growth under load, or a reference that keeps tensors alive | Log memory against active sequences; look for tensors stored in lists or globals |

## Further reading & sources

- [ZeRO: Memory Optimizations Toward Training Trillion Parameter Models](https://arxiv.org/abs/1910.02054) - the clearest published accounting of training memory (weights, gradients, optimizer states, activations, buffers, fragmentation); this module's categories and the "optimizer states dominate" observation come from it.
- [Efficient Memory Management for Large Language Model Serving with PagedAttention](https://arxiv.org/abs/2309.06180) - quantifies the KV cache's share of serving memory and the waste from fragmentation; cited for the 65% / 30% split.
- [PyTorch notes: CUDA semantics, memory management](https://docs.pytorch.org/docs/stable/notes/cuda.html) - official description of the caching allocator, allocated versus reserved memory, and the `expandable_segments` option.
- [PyTorch: Understanding CUDA Memory Usage](https://docs.pytorch.org/docs/stable/torch_cuda_memory.html) - how to record and visualize a memory snapshot, including OOM events; the tool to reach for in the code listing 3 scenario.
- [Hugging Face Accelerate: Model memory estimator](https://huggingface.co/docs/accelerate/usage_guides/model_size_estimator) - a practical estimator and the source of the "up to 20% more for inference" rule of thumb used in listing 1.
- [NVIDIA A100 datasheet](https://www.nvidia.com/content/dam/en-zz/Solutions/Data-Center/a100/pdf/nvidia-a100-datasheet-us-nvidia-1758950-r4-web.pdf) - source for the A100 memory capacities in the table.
- [NVIDIA H100 Tensor Core GPU](https://www.nvidia.com/en-us/data-center/h100/) - source for the H100 SXM and NVL capacities.
- [NVIDIA GeForce RTX 4090](https://www.nvidia.com/en-us/geforce/graphics-cards/40-series/rtx-4090/) - source for the 24 GB consumer-card figure.

## Next

[Module 05: Calculating a Model's Memory Requirements](../05-calculating-a-models-memory-requirements/README.md)
