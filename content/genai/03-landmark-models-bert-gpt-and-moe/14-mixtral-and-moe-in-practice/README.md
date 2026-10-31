# Module 14: Mixtral and MoE in Practice

## Why this matters

Modules 12 and 13 built MoE's core mechanism from scratch, at toy
scale: 4 experts, top-1 routing, 6-64 tokens. This module verifies that
the exact same mechanism — Llama-family architecture (module 11) plus a
sparse expert FFN (module 12) plus a real load-balancing coefficient
(module 13) — is precisely what a real, publicly released, widely-used
model uses at production scale: Mistral AI's Mixtral-8x7B. Its config
is a small, fully open JSON file (no license gate, unlike Meta's Llama
checkpoints) — small enough to download and inspect directly, even
though its ~47 billion actual parameter weights are not something this
environment can feasibly download or run. This module downloads that
real config, and then does something this track hasn't done yet:
derives Mixtral's total and active parameter counts *analytically*,
purely from the config's disclosed shapes (hidden size, expert count,
top-k) — and checks the result against Mistral AI's own official
announcement. The two numbers match to within 0.1%, which is real,
checkable confirmation that the "total vs. active parameters" idea
modules 12-13 built in miniature is exactly what a real frontier lab
shipped, not an approximation of it.

## Concepts

### Verified: Mixtral's real, downloaded config

```python
from transformers import AutoConfig

cfg = AutoConfig.from_pretrained('mistralai/Mixtral-8x7B-v0.1')
for k in ['num_local_experts', 'num_experts_per_tok', 'router_aux_loss_coef',
          'hidden_size', 'intermediate_size', 'num_hidden_layers',
          'num_attention_heads', 'num_key_value_heads', 'hidden_act', 'rms_norm_eps']:
    print(f'{k} = {getattr(cfg, k)}')
```

Verified output:

```
num_local_experts = 8
num_experts_per_tok = 2
router_aux_loss_coef = 0.02
hidden_size = 4096
intermediate_size = 14336
num_hidden_layers = 32
num_attention_heads = 32
num_key_value_heads = 8
hidden_act = silu
rms_norm_eps = 1e-05
```

Read against modules 11-13, every field here is now something this
track has already verified the meaning of, not a new unexplained
number:

```
 Field                    What it confirms                         Verified in
 ───────────────────────  ────────────────────────────────────────  ───────────
 num_local_experts = 8     8 total experts per MoE layer              Module 12
 num_experts_per_tok = 2   top-2 routing (not top-1, module 12's      Module 12,
                           simplification -- Mixtral routes each        Exercise 2
                           token to its 2 highest-scoring experts)
 router_aux_loss_coef      A REAL production load-balancing            Module 13
   = 0.02                  coefficient -- the exact kind of number
                           module 13's aux loss needs weighted by
 hidden_act = silu,        SwiGLU-family activation, RMSNorm --        Module 11
 rms_norm_eps              same Llama-architecture deltas from GPT-2
 num_attention_heads=32,   Grouped-query attention: 32 query heads,   Module 11
 num_key_value_heads=8     8 KV head groups (4 queries per group)
```

Mixtral is, verifiably, Llama-family attention and normalization
(module 11) with its dense FFN swapped for a sparse, top-2-routed
mixture of 8 experts (module 12), trained with a real load-balancing
auxiliary loss (module 13) — not a fundamentally different design, but
this track's own already-verified pieces, composed.

### Verified: deriving total-vs-active parameters analytically, and checking it against the real published figures

Downloading and summing ~47 billion actual parameter tensors isn't
feasible here — but the config discloses every shape needed to compute
the count analytically, the same way module 12's toy `count_params`
worked, just at real scale. Each Mixtral layer's attention block
(module 11's GQA) and each expert (module 11's SwiGLU: gate/up/down
projections) have a fixed, known parameter count per the config's own
dimensions:

```python
hidden_size, intermediate_size, num_layers = 4096, 14336, 32
num_attention_heads, num_key_value_heads = 32, 8
num_local_experts, num_experts_per_tok, vocab_size = 8, 2, 32000
head_dim = hidden_size // num_attention_heads  # 128

q_proj = hidden_size * (num_attention_heads * head_dim)
k_proj = v_proj = hidden_size * (num_key_value_heads * head_dim)
o_proj = (num_attention_heads * head_dim) * hidden_size
attn_params_per_layer = q_proj + k_proj + v_proj + o_proj

expert_params = 3 * hidden_size * intermediate_size  # gate_proj, up_proj, down_proj (SwiGLU, module 11)
router_params = hidden_size * num_local_experts
norm_params = 2 * hidden_size  # two RMSNorms per layer, module 11

per_layer_total = attn_params_per_layer + norm_params + router_params + num_local_experts * expert_params
per_layer_active = attn_params_per_layer + norm_params + router_params + num_experts_per_tok * expert_params

embed_params = lm_head_params = vocab_size * hidden_size  # tie_word_embeddings: false -> separate tables

total_params = num_layers * per_layer_total + embed_params + lm_head_params
active_params = num_layers * per_layer_active + embed_params + lm_head_params

print(f'TOTAL params:  {total_params/1e9:.2f}B')
print(f'ACTIVE params:  {active_params/1e9:.2f}B')
print(f'ratio: {total_params/active_params:.2f}x')
```

Verified output:

```
TOTAL params:  46.70B
ACTIVE params:  12.88B
ratio: 3.63x
```

Mistral AI's own official announcement states, in its own words:
**"Mixtral has 46.7B total parameters"** and **"only uses 12.9B
parameters per token."** This module's from-scratch derivation —
computed purely from the config's disclosed shapes, using nothing but
module 11's GQA/SwiGLU parameter-counting logic and module 12's
total-vs-active distinction, scaled up — lands at **46.70B** and
**12.88B**: matching the lab's own disclosed figures to within roughly
0.1%. This is real, independently-derived confirmation, not a restated
number: the small residual gap is fully explained by rounding and minor
implementation details (e.g. exact bias handling) this derivation
simplifies, not by an error in the core method.

### Why 3.63x, not 8x: top-2 out of 8, plus non-expert layers that never shrink

Mixtral's total-to-active ratio (3.63x) is meaningfully less than the
"8 experts" headline might suggest, for two real, verified reasons:
first, routing is **top-2**, not top-1 (module 12's Exercise 2 already
previewed this) — so 2 of 8 experts run per token, not 1, meaning the
expert-FFN portion alone contributes only a 4x reduction (`8/2`), not
8x. Second, attention, normalization, embeddings, and the LM head are
**not** part of the MoE mechanism at all — module 12's own Reference
table already distinguished these — and those parameters are identical
whether or not the model uses MoE at all, further diluting the ratio
below even 4x once they're folded into the total. Both effects are
directly visible in this module's own derivation code: `expert_params`
is multiplied by `8` for the total and by `2` (not `8`) for active, and
`attn_params_per_layer` / `norm_params` / `router_params` /
`embed_params` / `lm_head_params` appear identically in both the
`total_params` and `active_params` formulas.

## Reference

```
 Fact / claim                            Status              Source
 ──────────────────────────────────────  ──────────────────  ──────────────────
 Mixtral-8x7B total parameters            Verified: 46.70B     This module's
                                           (derived) vs.        derivation vs.
                                           46.7B (official)     Mistral AI's own
                                                                 announcement
 Mixtral-8x7B active parameters per        Verified: 12.88B     same
 token                                     (derived) vs.
                                           12.9B (official)
 Mixtral uses top-2 routing (not top-1)    Verified            config:
                                                                num_experts_per_
                                                                tok = 2
 Mixtral's load-balancing coefficient      Verified            config:
                                                                router_aux_loss_
                                                                coef = 0.02
 Mixtral's attention/norm/activation       Verified            config fields,
 match Llama-architecture (module 11)                          cross-checked
                                                                against module 11
 Mixtral's full weight tensors             NOT downloaded/      (this module's
                                            summed in this       own disclosed
                                            module -- config     limitation)
                                            shapes only
```

## Hands-on exercises

### 1. Reproduce the config download and the parameter derivation yourself

Run both verified code blocks above. Confirm your own output matches:
`46.70B` total, `12.88B` active, `3.63x` ratio.

### 2. Re-derive the parameter counts assuming top-1 instead of top-2 routing

Change only `num_experts_per_tok` to `1` in the derivation code (leaving
every other config value from the real Mixtral config untouched) and
recompute `active_params` and the ratio. Confirm the active-parameter
count drops and the total-to-active ratio grows closer to the "8
experts" headline number — connecting module 12's Exercise 2 (top-1 vs.
top-2 active-compute difference) directly to this real model's actual
design choice.

### 3. Find Mixtral's official parameter figures yourself and compare

Open Mistral AI's own Mixtral announcement (cited below) and locate
the exact sentences stating the total and active parameter counts.
Confirm they match (to rounding) this module's derived `46.70B` and
`12.88B`, and write one sentence on why a small residual gap between a
from-scratch derivation and an official figure is expected and not a
sign of a mistake in the method.

## Independent challenge

A colleague, reading only that Mixtral is "8x7B," concludes: "This model
must have roughly 56 billion parameters (8 times 7 billion) and needs
GPU memory sized for that." Using this module's verified derivation,
explain what's wrong with this back-of-envelope estimate and what the
actual relevant numbers are.

<details><summary>Discussion</summary>

The "8x7B" name is a naming convention describing the *expert* count
(8) and roughly each expert's *individual* scale, not a literal
"multiply the numbers together" formula — and even setting that aside,
naively multiplying 8 x 7B ignores that experts share the same
attention, normalization, and embedding layers (module 12's own
Reference table distinction), which are not duplicated per expert.
This module's actual derivation, built directly from the model's real
disclosed config shapes, gives the two numbers that actually matter:
**~46.7B total parameters** (what has to be stored/held in memory or on
disk to serve the model at all) and **~12.9B active parameters per
token** (much closer to what predicts per-token inference compute,
following module 12's total-vs-active distinction). Neither figure is
"56B" — the naive multiplication both overcounts (it doesn't account
for shared non-expert layers) and, separately, doesn't distinguish
storage requirements from per-token compute cost at all, which is
precisely the distinction this whole track (modules 12-14) exists to
make precise.

</details>

## Common mistakes & troubleshooting

- **Reading "8x7B" as a literal multiplication giving the true parameter
  count.** This module's own derivation, from the model's real config,
  gives 46.7B total — not 56B — because attention, normalization, and
  embedding layers are shared across all experts, not duplicated per
  expert.
- **Assuming Mixtral uses top-1 routing like module 12's simplified
  example.** The real, verified config shows `num_experts_per_tok = 2`
  — top-2, not top-1. Exercise 2 walks through exactly how this changes
  the active-parameter math.
- **Forgetting that non-expert layers (attention, norms, embeddings, LM
  head) don't shrink between the total and active parameter counts.**
  This module's own derivation code includes these identically in both
  `total_params` and `active_params` — only the expert-FFN term differs
  between the two formulas.
- **Trying to download Mixtral's full weights to "properly" verify
  this module's numbers.** ~47 billion parameters at even reduced
  precision is far beyond what's practical to fetch and hold in this
  environment — this module's own approach (deriving counts from the
  small, fully open config) is the correct way to verify a real
  large-scale model's structure without needing its weights at all.
- **Treating a close-but-not-exact match to an official figure as a
  sign of a calculation error.** This module's 46.70B vs. the official
  46.7B (and 12.88B vs. 12.9B) differ only at the level of rounding —
  don't chase an exact bit-for-bit match; check instead that the
  method (shapes, multiplications, which terms are shared vs. which
  scale with expert count) is correct.

## Checkpoint quiz

1. What does Mixtral's real, downloaded config confirm about its
   routing (`num_experts_per_tok`), and how does that compare to module
   12's toy example?
2. What two numbers did this module's analytical derivation produce,
   and what did Mistral AI's own official announcement state for the
   same two quantities?
3. Why is Mixtral's total-to-active parameter ratio (3.63x) meaningfully
   less than 8x, given it has 8 experts?
4. Name three config fields this module cross-checked against module
   11's Llama-architecture findings, and what each confirms.
5. Why couldn't this module verify Mixtral's parameter count by
   directly loading and summing its real weight tensors, and what did
   it do instead?

<details><summary>Answers</summary>

1. It confirms `num_experts_per_tok = 2` — top-2 routing. Module 12's
   toy example used top-1 (the single highest-scoring expert); Mixtral
   routes each token to its two highest-scoring experts instead.
2. Roughly 46.70B total parameters and 12.88B active parameters per
   token, derived purely from the config's disclosed shapes. Mistral
   AI's own announcement states "Mixtral has 46.7B total parameters"
   and "only uses 12.9B parameters per token" — matching this module's
   derivation to within rounding.
3. Because routing is top-2 (not top-1), only 2 of 8 experts run per
   token, giving a 4x reduction from the expert-FFN portion alone
   (`8/2`), not 8x — and because attention, normalization, embedding,
   and LM-head parameters are identical in both the total and active
   counts (they don't participate in expert routing at all), diluting
   the overall ratio further below even 4x.
4. Any three of: `hidden_act = silu` and `rms_norm_eps` (confirming
   SwiGLU-family activation and RMSNorm, module 11), `rope_parameters`
   (confirming RoPE, module 11), and `num_attention_heads = 32` vs.
   `num_key_value_heads = 8` (confirming grouped-query attention,
   module 11).
5. Because Mixtral's real weights total roughly 47 billion parameters
   — far beyond what's practical to download and hold in this
   environment. Instead, this module derived the parameter counts
   analytically from the model's small, fully open config file's
   disclosed architecture shapes (hidden size, expert count, top-k,
   layer count), the same method module 12 used at toy scale.

</details>

## Further reading & sources

- [Mixtral of Experts (Mistral AI, 2024)](https://mistral.ai/news/mixtral-of-experts/) - the primary source for this module's central verification: the official "46.7B total parameters" and "12.9B parameters per token" figures this module's own analytical derivation matched independently.
- [mistralai/Mixtral-8x7B-v0.1 on Hugging Face](https://huggingface.co/mistralai/Mixtral-8x7B-v0.1) - the real, fully open config this module downloaded and inspected directly (`AutoConfig.from_pretrained`), with no license-acceptance gate.
- [Mixtral of Experts (technical report, Jiang et al., 2024)](https://arxiv.org/abs/2401.04088) - the full technical report with additional architectural and benchmark detail beyond the announcement blog post cited above.
- [Module 11: Llama and the Open-Weight Lineage](../11-llama-and-the-open-weight-lineage/README.md) - the source of the RMSNorm/RoPE/SwiGLU/GQA architectural findings this module confirmed also apply to Mixtral's real config.
- [Module 12: Mixture of Experts — The Core Idea](../12-mixture-of-experts-the-core-idea/README.md) and [Module 13: MoE Routing and Load Balancing](../13-moe-routing-and-load-balancing/README.md) - the toy-scale mechanisms (total-vs-active parameters, load-balancing auxiliary loss) this module verified at real production scale.

## Next

[Module 15: How to Read a Model Card](../15-how-to-read-a-model-card/README.md)
