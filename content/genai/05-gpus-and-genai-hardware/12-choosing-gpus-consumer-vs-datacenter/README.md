# Module 12: Choosing GPUs: Consumer vs. Datacenter

## Roadmap

**Where this sits.** Track 05 so far taught you to *size* a workload: what a GPU is
([Module 01](../01-gpu-architecture-for-software-engineers/README.md), [Module 02](../02-cuda-cores-vs-tensor-cores/README.md)),
why bandwidth and VRAM bind ([Module 03](../03-memory-hierarchy-and-bandwidth/README.md),
[Module 04](../04-vram-the-real-constraint/README.md)), how to compute a model's memory
([Module 05](../05-calculating-a-models-memory-requirements/README.md)), which number formats shrink it
([Module 06](../06-numeric-formats-fp32-fp16-bf16/README.md)), and how to split what still does not fit
([Module 09](../09-data-parallelism/README.md), [Module 10](../10-model-and-tensor-parallelism/README.md),
[Module 11: Pipeline Parallelism and ZeRO](../11-pipeline-parallelism-and-zero/README.md)).
This module turns "I need N GB and M GB/s" into "which card, and am I allowed to run it there?".
[Module 13](../13-cloud-gpu-economics/README.md) prices the answer;
[Module 14](../14-running-models-on-cpu-and-apple-silicon/README.md) covers hardware that is not a discrete GPU.

**After this module you can** read a GPU datasheet for the rows that matter, run a checklist that rejects
candidates with a stated reason, explain why two cards of the same architecture generation can suit different
jobs, and quote the licence term that separates a consumer card from a datacenter card.

**Why it matters.** A wrong choice fails in one of two ways: it cannot run the workload (not enough VRAM, no
fast link between cards), or it runs and you learn later you were not permitted to run it there. Both are cheaper
to catch on paper than on an invoice.

## Concept

> [!key]
> Choose a GPU by passing gates in order: does the model fit (VRAM), does it stream fast enough (bandwidth),
> does the hardware support your number format, can the cards talk to each other if you need several
> (interconnect), will it survive where it lives (ECC, power, cooling), and are you permitted to run it there
> (licence). Price is the last gate, not the first.

## Explanation

### Six gates, in order

> [!model]
> Treat a GPU choice as a row of gates, not a leaderboard. A card that fails an early gate cannot be rescued by
> excelling at a later one: huge TFLOPS do not help if the weights do not fit, and 96 GB does not help if the
> licence forbids the place you must run it. You want the cheapest card that passes *all* gates, not the one that
> wins a column.

| Gate | Question | Datasheet row | Background |
|---|---|---|---|
| 1. Capacity | Do weights + KV cache + overhead fit? | GPU memory | [Module 05](../05-calculating-a-models-memory-requirements/README.md) |
| 2. Bandwidth | How fast can it stream those bytes? | Memory bandwidth | [Module 03](../03-memory-hierarchy-and-bandwidth/README.md) |
| 3. Precision | Do tensor cores support my number format? | Tensor-core rows (FP8, FP4, ...) | [Module 06](../06-numeric-formats-fp32-fp16-bf16/README.md) |
| 4. Interconnect | If one card is not enough, how fast is card-to-card? | NVLink / PCIe lines | [Module 10](../10-model-and-tensor-parallelism/README.md) |
| 5. Operations | ECC, board power, cooling, form factor | ECC, power, thermal | this module |
| 6. Terms | May I run it in that setting? | Not on the datasheet: the driver licence | this module |

### Gate 1: capacity, and why the datasheet number is not your budget

Module 05 owns the sizing. This module restates only its first line: weight bytes = parameters x bytes per
parameter, so a 32-billion-parameter model at one byte per weight is 32 GB before one token of KV cache. The
scorer below adds a KV-cache figure you bring from Module 05 and a flat 10% overhead.

> [!pitfall]
> The datasheet number is an upper bound. Vendors print "24 GB" or "96 GB", and the H100 NVL product brief
> defines "GiB" as the power-of-two notation yet prints its own memory size as "94 GB", so the unit is
> ambiguous. Part of the memory also goes to the CUDA context and driver. The scorer takes the conservative
> reading (decimal GB) and reserves 1 GB per card, both labelled assumptions. `nvidia-smi` on the real card
> is the arbiter.

### Gate 2: bandwidth sets the decode ceiling

Generating one token at batch size one reads every weight once (Module 03; Module 14 derives the consequence).
A model of `W` bytes on a card with bandwidth `B` cannot exceed `B / W` tokens per second, whatever the TFLOPS
row says. The scorer prints that ceiling, as an estimate, for single-card fits. Bandwidth-to-capacity ratios
differ a lot between cards, so a big-memory card is not automatically a fast-decoding card (Exercise 2).

### Gate 3: which number formats the tensor cores accelerate

Support depends on the architecture generation, and the vendor documents say so (checked Oct 2026):

- The [A100 page](https://www.nvidia.com/en-us/data-center/a100/) lists FP64, TF32, BF16, FP16 and INT8 tensor
  rows and no FP8 row. The H100 page lists TF32, BF16, FP16, FP8 and INT8; the L40S page adds INT4.
- The RTX Blackwell whitepaper: "The RTX Blackwell Tensor Cores support FP16, BF16, TF32, INT8, and Hopper's FP8
  Transformer Engine. RTX Blackwell adds new support for FP4 and FP6 Tensor Core operations".

A format the hardware lacks is not forbidden: weights are stored small and expanded to a supported format
before the multiply (mechanics in
[Track 04, Module 15](../../04-training-fine-tuning-and-alignment/15-quantization-int8-int4-gguf/README.md)).
You keep the memory saving and lose the arithmetic speed-up. Whether your framework *uses* a hardware format is
a separate question: "the chip supports FP8" is necessary, not sufficient.

### Gate 4: interconnect, the difference between "fits" and "fast"

When the model does not fit one card you split it, and the pieces must exchange data. The vendor pages quote the
paths below. The L40S page labels its PCIe figure "bidirectional" and the NVLink page calls its sixth-generation
link "3 TB/s bidirectional"; I assume the same convention for the H100 page's 128 GB/s (twice the Gen4 figure) and
for the 900 GB/s fourth-generation NVLink figure:

- PCIe Gen4 x16: 64 GB/s (L40S page). PCIe Gen5: 128 GB/s (H100 page).
- NVLink 4 on Hopper: 900 GB/s per GPU ([NVLink page](https://www.nvidia.com/en-us/data-center/nvlink/)). Against
  the 128 GB/s Gen5 figure that is 900 / 128, about 7 times.
- Some cards have none: the L40S page says "NVIDIA NVLink Support: No". The GeForce and RTX PRO sources I
  fetched list PCIe only and never mention NVLink, so the table below says "not listed", not "no".

How much it matters depends on the split. Tensor parallelism
([Module 10](../10-model-and-tensor-parallelism/README.md)) exchanges activations inside every layer, so link
speed is on every token's critical path. Pipeline splits ([Module 11](../11-pipeline-parallelism-and-zero/README.md))
pass activations only at stage boundaries, and independent replicas pass nothing. The all-reduce snippet below
puts numbers on it.

### Gate 5: ECC, power, cooling, form factor

- **ECC.** The L40S and RTX PRO 6000 sources say "ECC"; the H100 NVL brief lists "ECC support: Enabled". For
  GeForce cards with GDDR7 the whitepaper says something narrower: "ECC (Error Correction Code) capability is
  built into the DRAM die itself and is always enabled ... Single-bit error correction (SEC) is supported."
  On-die ECC is not the same promise as a card whose page lists ECC memory; read which one you are offered. It
  matters most for long unattended jobs, which have more chances to hit a flipped bit than a short request.
- **Power.** The RTX 4090 page: 450 W total graphics power, 850 W required system power. RTX 5090: 575 W and
  1000 W. RTX PRO 6000 datasheet: 600 W total board power. H100 SXM: "up to 700 W (configurable)". Eight such
  cards are a power-and-cooling project, not a shopping list.
- **Cooling and form factor.** The L40S page lists "Thermal: Passive"; the H100 NVL brief says its passive heat
  sink "requires system airflow to operate the card properly". SXM parts are modules for a server baseboard, not
  cards for a PC slot.

### Gate 6: the licence, quoted rather than paraphrased

NVIDIA publishes the GeForce driver licence at
[nvidia.com/en-us/drivers/geforce-license](https://www.nvidia.com/en-us/drivers/geforce-license/) (page title
"License for Customer use of GeForce Software"; agreement headed "NVIDIA Driver License Agreement"; version line
"v. February 25, 2025"; fetched Oct 2026). Under "2. Limitations", verbatim:

> 2.7 Except as expressly granted in this Agreement, you may not sell, rent, sublicense, distribute or transfer
> the SOFTWARE or provide commercial hosting services with the SOFTWARE. 2.8 You agree that GeForce or Titan
> SOFTWARE: (i) is licensed for use only on GeForce or Titan hardware products you own, and (ii) is not
> licensed for datacenter deployment.

- It is a term of the *driver software licence*, not a hardware limit. The card still runs; the exposure is
  contractual and in support.
- The text I fetched does not define "datacenter deployment". Whether an office closet, a colocation cage or a
  rented server counts is a legal question. This is not legal advice.
- The clause names GeForce and Titan software. Workstation and datacenter parts install drivers under their own
  terms, which I did not fetch, so the scorer marks them `None` ("not checked here"), never "allowed".

> [!pitfall]
> Do not read "not licensed for datacenter deployment" as "will not work", and do not read silence on a product
> page as permission. The page is marketing; the licence is the contract. Check the licence of the driver
> version you will deploy, and re-check on updates: the text carries a version date.

### Spec table (per vendor pages, datasheets and whitepaper, checked Oct 2026)

Figures are as printed by the vendor. "Not listed" means the pages I fetched do not state it, not that the feature
is absent. Newer parts exist than the ones below; no prices or rankings are given on purpose.

| Card (class) | Memory | Memory bandwidth | ECC | Card-to-card link on source | Board power | Cooling / form |
|---|---|---|---|---|---|---|
| GeForce RTX 4090 (consumer) | 24 GB GDDR6X | 1008 GB/s | not listed | PCIe Gen 4; NVLink not listed | 450 W TGP | page: 850 W system power |
| GeForce RTX 5090 (consumer) | 32 GB GDDR7 | 1792 GB/s | on-die, always on | PCIe Gen 5; NVLink not listed | 575 W TGP | page: 1000 W system power |
| RTX PRO 6000 Blackwell Workstation | 96 GB GDDR7 | 1792 GB/s | ECC | PCIe 5.0 x16; NVLink not listed | 600 W | dual slot, double-flow-through |
| L40S (datacenter, PCIe) | 48 GB GDDR6 | 864 GB/s | ECC | PCIe Gen4 x16; NVLink: No | 350 W | dual slot, passive |
| H100 NVL (datacenter, PCIe) | 94 GB | 3.9 TB/s | ECC enabled | NVLink bridge 600 GB/s; PCIe Gen5 128 GB/s | 350-400 W | dual slot, passive heat sink |
| H100 SXM (datacenter) | 80 GB | 3.35 TB/s | not listed | NVLink 900 GB/s; PCIe Gen5 128 GB/s | up to 700 W | SXM module |
| H200 SXM (datacenter) | 141 GB | 4.8 TB/s | not listed | NVLink 900 GB/s; PCIe Gen5 128 GB/s | up to 700 W | SXM module |

Sources: [RTX 4090](https://www.nvidia.com/en-us/geforce/graphics-cards/40-series/rtx-4090/) and
[RTX 5090](https://www.nvidia.com/en-us/geforce/graphics-cards/50-series/rtx-5090/) pages (capacity, power) with
the [RTX Blackwell whitepaper](https://images.nvidia.com/aem-dam/Solutions/geforce/blackwell/nvidia-rtx-blackwell-gpu-architecture.pdf)
(bandwidth, PCIe generation, ECC text); the
[RTX PRO 6000 datasheet](https://www.nvidia.com/content/dam/en-zz/Solutions/data-center/rtx-pro-6000-blackwell-workstation-edition/workstation-blackwell-rtx-pro-6000-workstation-edition-nvidia-us-3519208-web.pdf);
the [L40S page](https://www.nvidia.com/en-us/data-center/l40s/); the
[H100 page](https://www.nvidia.com/en-us/data-center/h100/) and
[H100 NVL product brief](https://www.nvidia.com/content/dam/en-zz/Solutions/Data-Center/h100/PB-11773-001_v01.pdf);
the [H200 page](https://www.nvidia.com/en-us/data-center/h200/).

> [!pitfall]
> Read the footnotes. The H100 page marks its tensor figures with an asterisk whose footnote reads "With
> sparsity", and the L40S page prints tensor rows as two numbers (FP8: "733 | 1,466") where the second assumes
> structured sparsity. A headline TFLOPS number is not what a dense model gets.

### Multi-GPU scaling realities

- **Capacity adds; speed does not add the same way.** Two 48 GB cards hold a 90 GB model, but every token now
  includes communication one big card would not have needed.
- **Fits is not fast.** A 70B model can "fit" across several PCIe-only cards and still decode more slowly than on
  fewer cards joined by NVLink, because the split forces per-layer traffic over the slower path. The ratio in the
  all-reduce snippet shows the size of the gap.
- **Replicas scale cleanly; shards do not.** If the model fits on one card, N copies serve roughly N times the
  requests with no card-to-card traffic. Sharding buys capacity; replication buys throughput.
- **More cards, more failures, more power, more engine constraints.** Check that your serving or training stack
  supports the card count your split needs; some engines restrict shard counts (Modules 10 and 14).

## Code

### A scorer that rejects candidates with a reason

Candidate data is copied from the table above (vendor-sourced, checked Oct 2026); the model scenarios are
illustrative inputs. Standard library only. Per card it asks: how many cards does this model need, and does that
configuration pass the gates you switch on?

```python
import math
from dataclasses import dataclass

@dataclass(frozen=True)
class GPU:
    name: str
    mem_gb: float      # vendor "GB"; treated as decimal 1e9 bytes (the conservative reading)
    bw_gbs: float      # memory bandwidth, GB/s
    watts: float       # board power figure from the source page (TGP / max / TDP)
    sxm: bool          # True = SXM module (needs a server baseboard), False = PCIe card
    ecc: str           # "listed" | "on-die" | "not listed"  (as stated on the source pages)
    nvlink: object     # True / False / None  (None = not listed on the source pages)
    dc_licence: object # False = driver licence forbids datacenter deployment; None = not checked here

# Values from the "checked Oct 2026" table above.
CANDIDATES = [
    GPU("RTX 4090",          24, 1008, 450, False, "not listed", None,  False),
    GPU("RTX 5090",          32, 1792, 575, False, "on-die",     None,  False),
    GPU("RTX PRO 6000 WS",   96, 1792, 600, False, "listed",     None,  None),
    GPU("L40S",              48,  864, 350, False, "listed",     False, None),
    GPU("H100 NVL 94GB",     94, 3900, 400, False, "listed",     True,  None),
    GPU("H100 SXM 80GB",     80, 3350, 700, True,  "not listed", True,  None),
    GPU("H200 SXM 141GB",   141, 4800, 700, True,  "not listed", True,  None),
]

def weights_gb(params_billion, bytes_per_param):
    """The one memory formula used here (module 05 owns the rest, incl. KV cache and training):
    weight bytes = parameters x bytes per parameter. Billions x bytes = decimal GB."""
    return params_billion * bytes_per_param

def evaluate(g, w_gb, kv_gb, overhead=0.10, reserve_gb=1.0, max_gpus=8, datacenter=False,
             need_ecc=False, tensor_parallel=True, power_budget_w=None, pcie_cards_only=False):
    need = (w_gb + kv_gb) * (1 + overhead)      # ASSUMPTION: flat 10% for activations etc.
    n = math.ceil(need / (g.mem_gb - reserve_gb))  # ASSUMPTION: ~1 GB per GPU lost to CUDA context
    why = []
    if n > max_gpus:                                   why.append(f"needs {n} GPUs")
    if datacenter and g.dc_licence is False:           why.append("driver licence 2.8")
    if need_ecc and g.ecc != "listed":                 why.append(f"ECC {g.ecc}")
    if n > 1 and tensor_parallel and g.nvlink is not True:
        why.append("NVLink absent" if g.nvlink is False else "NVLink not listed")
    if pcie_cards_only and g.sxm:                      why.append("SXM needs server board")
    if power_budget_w and n * g.watts > power_budget_w:
        why.append(f"{n}x{g.watts:.0f}W > {power_budget_w}W")
    ceiling = g.bw_gbs / w_gb if n == 1 else None      # decode tokens/s ceiling (an estimate)
    return need, n, why, ceiling

def report(title, params_b, bytes_pp, kv_gb, **kw):
    w = weights_gb(params_b, bytes_pp)
    print(f"\n{title}\n  weights {w:.0f} GB, KV {kv_gb:.0f} GB, options {kw}")
    print(f"  {'GPU':<17}{'need GB':>8}{'GPUs':>5}{'ceil t/s':>9}  verdict")
    for g in CANDIDATES:
        need, n, why, ceil_ = evaluate(g, w, kv_gb, **kw)
        c = f"{ceil_:.0f}" if ceil_ else "-"
        print(f"  {g.name:<17}{need:>8.1f}{n:>5}{c:>9}  {'pass' if not why else 'FAIL: ' + '; '.join(why)}")

report("A. 32B model, 8-bit weights", 32, 1.0, 6)
report("B. 70B model, 16-bit weights, tensor-parallel", 70, 2.0, 10)
report("C. 70B 16-bit, layer-split, PCIe cards in a datacenter rack, 1600 W for GPUs",
       70, 2.0, 10, tensor_parallel=False, datacenter=True, pcie_cards_only=True, power_budget_w=1600)
```

Output of this exact script (local Python 3.13, standard library only):

```
A. 32B model, 8-bit weights
  weights 32 GB, KV 6 GB, options {}
  GPU               need GB GPUs ceil t/s  verdict
  RTX 4090             41.8    2        -  FAIL: NVLink not listed
  RTX 5090             41.8    2        -  FAIL: NVLink not listed
  RTX PRO 6000 WS      41.8    1       56  pass
  L40S                 41.8    1       27  pass
  H100 NVL 94GB        41.8    1      122  pass
  H100 SXM 80GB        41.8    1      105  pass
  H200 SXM 141GB       41.8    1      150  pass

B. 70B model, 16-bit weights, tensor-parallel
  weights 140 GB, KV 10 GB, options {}
  GPU               need GB GPUs ceil t/s  verdict
  RTX 4090            165.0    8        -  FAIL: NVLink not listed
  RTX 5090            165.0    6        -  FAIL: NVLink not listed
  RTX PRO 6000 WS     165.0    2        -  FAIL: NVLink not listed
  L40S                165.0    4        -  FAIL: NVLink absent
  H100 NVL 94GB       165.0    2        -  pass
  H100 SXM 80GB       165.0    3        -  pass
  H200 SXM 141GB      165.0    2        -  pass

C. 70B 16-bit, layer-split, PCIe cards in a datacenter rack, 1600 W for GPUs
  weights 140 GB, KV 10 GB, options {'tensor_parallel': False, 'datacenter': True, 'pcie_cards_only': True, 'power_budget_w': 1600}
  GPU               need GB GPUs ceil t/s  verdict
  RTX 4090            165.0    8        -  FAIL: driver licence 2.8; 8x450W > 1600W
  RTX 5090            165.0    6        -  FAIL: driver licence 2.8; 6x575W > 1600W
  RTX PRO 6000 WS     165.0    2        -  pass
  L40S                165.0    4        -  pass
  H100 NVL 94GB       165.0    2        -  pass
  H100 SXM 80GB       165.0    3        -  FAIL: SXM needs server board; 3x700W > 1600W
  H200 SXM 141GB      165.0    2        -  FAIL: SXM needs server board
```

> [!example]
> Scenario A line by line. The 32B model needs (32 + 6) x 1.10 = 41.8 GB. An RTX 4090 offers 24 - 1 = 23 GB
> usable, so `ceil(41.8 / 23) = 2` cards; scenario A assumes tensor parallelism and no NVLink is listed, so it
> fails. The L40S offers 47 usable GB, passes with one card, and its ceiling is 864 / 32 = 27 tokens/s. In
> scenario C the layer-split switch lets four L40S pass where B rejected them: "pass" means "passes the gates
> you turned on", never "good choice". The scorer knows nothing about latency, price, or whether your engine
> supports the card count. H100 NVL's `nvlink=True` reflects its bridge between *pairs*; four-way bridging is
> not claimed.

### What the interconnect costs: a best-case all-reduce

The NCCL test documentation derives the best-case time of a ring all-reduce of `S` bytes over `n` GPUs with
per-GPU link bandwidth `B`: `t = (S / B) * 2(n - 1) / n`
([nccl-tests, PERFORMANCE.md](https://github.com/NVIDIA/nccl-tests/blob/master/doc/PERFORMANCE.md)). The snippet
applies it to the gradients of a data-parallel step ([Module 09](../09-data-parallelism/README.md)). Inputs are
assumptions; the link figures are the table's, halved on the assumption that they are bidirectional totals.

```python
def allreduce_seconds(size_gb, n_gpus, link_gbs_per_direction):
    """Best-case ring all-reduce time: t = (S / B) * 2(n-1)/n  (nccl-tests PERFORMANCE.md)."""
    return (size_gb / link_gbs_per_direction) * 2 * (n_gpus - 1) / n_gpus

SIZE_GB = 14.0      # ASSUMPTION: 7B parameters of BF16 gradients (7e9 x 2 bytes)
COMPUTE_S = 1.0     # ASSUMPTION: 1.0 s of compute per optimizer step, nothing overlapped
# Vendor link figures are quoted bidirectional, so one direction is half of the listed number.
LINKS = {
    "PCIe Gen4 x16 (L40S page: 64 GB/s bidirectional)": 64 / 2,
    "PCIe Gen5 x16 (H100 page: 128 GB/s)":              128 / 2,
    "NVLink 4 (NVLink page: 900 GB/s per GPU)":         900 / 2,
}
print(f"gradient size {SIZE_GB} GB, 8 GPUs, compute {COMPUTE_S} s/step, no compute/comm overlap")
for name, b in LINKS.items():
    t = allreduce_seconds(SIZE_GB, 8, b)
    eff = COMPUTE_S / (COMPUTE_S + t)
    print(f"{name:<50} B={b:>5.0f} GB/s  all-reduce {t*1000:7.1f} ms  step efficiency {eff:5.1%}")
```

```
gradient size 14.0 GB, 8 GPUs, compute 1.0 s/step, no compute/comm overlap
PCIe Gen4 x16 (L40S page: 64 GB/s bidirectional)   B=   32 GB/s  all-reduce   765.6 ms  step efficiency 56.6%
PCIe Gen5 x16 (H100 page: 128 GB/s)                B=   64 GB/s  all-reduce   382.8 ms  step efficiency 72.3%
NVLink 4 (NVLink page: 900 GB/s per GPU)           B=  450 GB/s  all-reduce    54.4 ms  step efficiency 94.8%
```

The absolute efficiencies depend on the assumed 1.0 s of compute and zero overlap. Real trainers overlap
communication with compute, and real PCIe topologies are often worse than this ideal, so read the output as an
illustration of the *ratio* (about 7x between Gen5 and NVLink 4, as the vendor figures imply), not a prediction.

## Visual diagram

```
  workload + model + precision chosen  (Modules 05-07)
                    │
                    ▼
  ┌─────────────────────────────────────────────┐
  │ 1. CAPACITY  weights + KV + ~10% <= usable? │─── one card? ──► single-card shortlist
  └─────────────────────────────────────────────┘        │ no
                    │                                    ▼
                    │                     shard across N cards (Modules 09-11)
                    │                        │                      │
                    │             tensor-parallel?           pipeline / layer split
                    │                        │                      │
                    │           NVLink-class link is a      PCIe may be acceptable,
                    │           hard filter (gate 4)        more latency per token
                    ▼
  ┌─────────────────────────────────────────────┐
  │ 2. TERMS   where will it run?               │── datacenter / hosting for others?
  └─────────────────────────────────────────────┘     yes ──► consumer driver clause 2.8 applies:
                    │                                        datacenter-class part, or read the
                    │                                        workstation / server licence first
                    ▼
  ┌─────────────────────────────────────────────┐
  │ 3. RELIABILITY  multi-week job / regulated? │── yes ──► require ECC listed (not just on-die)
  └─────────────────────────────────────────────┘
                    │
                    ▼
  ┌─────────────────────────────────────────────┐
  │ 4. SPEED  bandwidth / weight bytes          │── below target tokens/s? ──► reject (an estimate)
  └─────────────────────────────────────────────┘
                    │
                    ▼
  ┌─────────────────────────────────────────────┐
  │ 5. OPERATIONS  watts x N, PSU, airflow,     │── passive card? needs chassis airflow
  │    SXM vs PCIe, engine supports N cards?    │── SXM? needs a server baseboard
  └─────────────────────────────────────────────┘
                    │
                    ▼
  survivors ──► price them (Module 13): cost per useful token, not dollars per GB
```

## Practice

### 1. Find the margin

For scenario A's model (32B parameters, 1 byte each, 10% overhead, 1 GB reserved), what is the largest KV cache,
in GB, that still lets one L40S (48 GB) hold it? Check by changing `kv_gb` in the scorer.

<details><summary>Answer</summary>

Solve `(32 + kv) x 1.10 <= 47`: `kv <= 47 / 1.10 - 32 = 10.727...`. The scorer agrees: `kv_gb=10.7` gives need
46.97 GB and one card; `kv_gb=10.8` gives need 47.08 GB and two cards. Module 05's KV formula converts that
margin into tokens of context times concurrent users.

</details>

### 2. Bandwidth per gigabyte

For each card in the table, compute `bandwidth / capacity`. Which are highest and lowest, and what does that say
about a model that fills the card?

<details><summary>Answer</summary>

From the scorer's data: RTX 5090 56.0, RTX 4090 42.0, H100 SXM 41.9, H100 NVL 41.5, H200 34.0, RTX PRO 6000
18.7, L40S 18.0 (full-memory sweeps per second). For a model that fills the card this is the decode ceiling in
tokens/s. The RTX PRO 6000 and L40S hold the most data per unit of bandwidth, so a model that fills them decodes
slowest; the small-memory RTX 5090 tops the list. Capacity and speed are different gates, and this ignores KV
cache and every real overhead: an upper bound, not a prediction.

</details>

### 3. Read the licence

A start-up plans eight RTX 5090 cards in a colocation facility to sell API access to a hosted model. Which
quoted clauses are relevant, and what do you still not know after reading them?

<details><summary>Answer</summary>

2.8(ii): GeForce software "is not licensed for datacenter deployment", and 2.7 restricts providing "commercial
hosting services with the SOFTWARE". Both point at this plan. The text does not tell you how "datacenter
deployment" is defined, whether a colocation cage counts, what follows from a breach, or whether another
driver or agreement could apply. Those are questions for NVIDIA or counsel; the safe engineering move is to
price a datacenter-class part next to the consumer option.

</details>

### Checkpoint quiz

1. Name the six gates in order and the datasheet row that answers the first two.
2. Why can a 24 GB card fail a 24 GB model?
3. When is interconnect speed on the critical path, and when does it not matter?
4. What is the difference between on-die ECC and a page that lists ECC memory?
5. What does `None` for `dc_licence` mean, and why is it not `True`?

<details><summary>Answers</summary>

1. Capacity (GPU memory), bandwidth (memory bandwidth), precision, interconnect, operations, terms.
2. The datasheet figure is an upper bound: the CUDA context, driver, KV cache and activations also need memory,
   and the vendor's "GB" may be decimal. The scorer reserves 1 GB and adds 10%, both labelled assumptions.
3. Under tensor parallelism, activations move inside every layer, so the link is on every token's path. Under
   independent replicas nothing crosses between cards. Pipeline splits are in between.
4. On-die ECC is built into the DRAM die and corrects single-bit errors there; a page listing ECC memory
   describes the card-level feature. They are different promises.
5. "Not checked here". The fetched clause covers GeForce/Titan software only; terms for other drivers were not
   fetched, so "allowed" would be unsupported.

</details>

> [!check]
> - I can list the six gates and the datasheet row behind each
> - I can compute weight bytes and say why the datasheet capacity is not my budget
> - I can explain why NVLink matters for tensor parallelism but not for independent replicas
> - I can quote the driver-licence clause and say what it does not tell me
> - I check a TFLOPS row's footnote for sparsity before trusting it

## Project

Build a small decision tool and a memo. No code or solution is given here.

1. Extend the scorer into a command-line tool taking a model description (parameters, bytes per parameter, a
   KV-cache figure computed with Module 05, a target tokens/s) and a deployment setting (home office, own server
   room, rented cloud). It prints every candidate with every reason it fails.
2. Add at least two candidates from datasheets you fetch yourself. Record each number's URL and the date you
   read it; omit any field you cannot source.
3. Add one gate this module did not implement, for example a minimum bandwidth-per-capacity ratio, or a check
   that the shard count divides the model's attention-head count.
4. Write a one-page memo choosing hardware for a stated scenario, such as "serve a 70B model to 20 concurrent
   users inside a company data centre". Name the binding gate, the runner-up you rejected and why, and the one
   fact you would measure before buying.

Success looks like: a candidate is rejected for a different, stated reason in two different scenarios; every
spec has a source and date; and your recommendation changes if you flip one stated assumption (say,
tensor-parallel to layer-split), and the memo says so.

## Interview questions

> [!interview]
> A teammate proposes building an inference cluster from RTX 4090s because "it is the same silicon as the
> datacenter cards for a third of the price." How do you respond?

<details><summary>What a strong answer covers</summary>

- Separate architecture from product: the RTX 4090 and L40S pages both name Ada Lovelace, so the generation is
  shared, but the products differ in memory (24 GB GDDR6X vs 48 GB GDDR6 with ECC), power, cooling, form factor.
- Run the gates: capacity per card, NVLink not listed on the consumer page, ECC not listed, power numbers.
- Raise the licence: quote clause 2.8(ii), say it is a contract term not a hardware limit, and send the
  specific deployment to counsel rather than guessing.
- Replace "a third of the price" with cost per useful token at expected utilization (Module 13); no price was
  sourced in this comparison.

</details>

> [!interview]
> A model needs about 90 GB. One 96 GB card or two 48 GB cards, and what would change your mind?

<details><summary>What a strong answer covers</summary>

- One card avoids sharding: no per-layer communication, simpler serving, one failure domain.
- Two cards need a split and, if tensor-parallel, a fast link; the L40S page says NVLink is not supported, so
  that pair would communicate over PCIe.
- Margin: 90 GB on a 96 GB card leaves little for KV cache once overhead is counted; do the arithmetic.
- Bandwidth per card, power, availability, and whether two smaller quantized replicas would serve better.

</details>

## Common mistakes & troubleshooting

- **Out-of-memory on a card the datasheet says is big enough.** Usable memory is below the printed number and the
  KV cache grows with context and concurrency. Compare `nvidia-smi` memory use on the real card with the
  scorer's `need` and recompute with Module 05's KV formula at your real context.
- **Two GPUs are slower than one.** The split is putting traffic on a slow path. On Linux, `nvidia-smi topo -m`
  prints how GPUs connect to each other and to CPUs ([nvidia-smi documentation](https://docs.nvidia.com/deploy/nvidia-smi/index.html)
  describes `topo`); measure real collective speed with `nccl-tests`. Neither command is executed in this
  module's verification (no GPU here).
- **Card throttles or the machine powers off under load.** Compare your PSU and airflow with the product-page
  numbers (450 W graphics power with 850 W system power for the RTX 4090; passive cards need chassis airflow).
  Sustained load is not a benchmark burst.
- **Treating a missing spec as a missing feature.** "NVLink not listed" means the fetched pages are silent, not
  that the answer is no. Read the full datasheet before ruling a card out.

## Further reading & sources

- [License for Customer use of GeForce Software (NVIDIA Driver License Agreement)](https://www.nvidia.com/en-us/drivers/geforce-license/) - the primary text quoted in Gate 6, including clauses 2.7 and 2.8 and the version line.
- [NVIDIA RTX Blackwell GPU Architecture (whitepaper v1.1)](https://images.nvidia.com/aem-dam/Solutions/geforce/blackwell/nvidia-rtx-blackwell-gpu-architecture.pdf) - source for RTX 4090/5090 bandwidth, PCIe generation, the GDDR7 on-die ECC text, and the FP4/FP6 tensor-core statement.
- [NVIDIA H100 Tensor Core GPU](https://www.nvidia.com/en-us/data-center/h100/) - SXM and NVL specifications, NVLink and PCIe figures, and the sparsity footnote.
- [NVIDIA L40S GPU](https://www.nvidia.com/en-us/data-center/l40s/) - a PCIe datacenter card with ECC, passive cooling and explicitly no NVLink.
- [NVIDIA RTX PRO 6000 Blackwell Workstation Edition datasheet](https://www.nvidia.com/content/dam/en-zz/Solutions/data-center/rtx-pro-6000-blackwell-workstation-edition/workstation-blackwell-rtx-pro-6000-workstation-edition-nvidia-us-3519208-web.pdf) - the 96 GB ECC workstation card's memory, bandwidth, power and PCIe figures.
- [NVLink and NVLink Switch](https://www.nvidia.com/en-us/data-center/nvlink/) - NVIDIA's per-generation NVLink bandwidth table and its bidirectional convention.
- [nccl-tests: Performance reported by NCCL tests](https://github.com/NVIDIA/nccl-tests/blob/master/doc/PERFORMANCE.md) - derivation of the ring all-reduce time formula used in the Code section.
- [nvidia-smi documentation](https://docs.nvidia.com/deploy/nvidia-smi/index.html) - reference for the `topo` command that shows how GPUs are connected.

## Next

[Module 13: Cloud GPU Economics](../13-cloud-gpu-economics/README.md)
