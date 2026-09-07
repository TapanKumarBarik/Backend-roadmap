# Module 11: Llama and the Open-Weight Lineage

## Why this matters

Module 09 established a real, documented fact: GPT-4's own technical
report explicitly withholds architecture and parameter-count details.
Meta's Llama family is the industry's clearest counterpoint — real
downloadable weights, real published architecture numbers, and a real
paper trail (Llama 1, February 2023; Llama 2, July 2023; Llama 3,
2024). This module verifies Llama's actual architectural deltas from
GPT-2 (module 07) using a real, runnable config from a fully open
Llama-architecture checkpoint — not Meta's own gated release, which
requires accepting a license before download, but an open community
reproduction of the identical architecture (`TinyLlama-1.1B`, disclosed
as such throughout). It also verifies, with actual tensor math, the
one normalization detail every Llama architecture diagram mentions but
rarely demonstrates numerically: RMSNorm is not "LayerNorm with a
different name" — it verifiably skips mean-centering entirely, and
this module proves that with real numbers rather than asserting it.

## Concepts

### "Open-weight" is a precise term, not a synonym for "open source"

Llama's weights are downloadable — genuinely open in that sense. But
Meta's Llama 2 license (cited below) is **not** an OSI-approved
open-source license: it imposes a specific commercial restriction.
Quoting the license's actual text:

> "If, on the Llama 2 version release date, the monthly active users of
> the products or services made available by or for Licensee...is
> greater than 700 million monthly active users in the preceding
> calendar month, you must request a license from Meta, which Meta may
> grant to you in its sole discretion."

This is a real, checkable clause, not a paraphrase. It means: below 700
million MAU, use freely under the license terms; above it, a company
needs Meta's explicit separate permission. **"Open-weight" describes
what you can download and run; it says nothing on its own about what
you're legally permitted to do with it at scale.** This distinction
matters for exactly the kind of "can we build on this" question a real
engineering team has to answer correctly, not casually.

```
 "OPEN SOURCE" (OSI sense)         "OPEN-WEIGHT" (Llama's actual status)
 ──────────────────────────        ──────────────────────────────────────
 Code, weights, AND training       Weights downloadable; training
   data/recipe all open,             data/full recipe not fully
   unrestricted use                  released; usage restricted above
                                     700M MAU (Llama 2 license, quoted
                                     above) without Meta's separate
                                     permission
```

### Verified: Llama's real architectural deltas from GPT-2, via a real config

Rather than describe Llama's architecture from a diagram, this
inspects a real, fully open Llama-architecture checkpoint's actual
config object side by side with GPT-2's (module 07's own model):

```python
from transformers import AutoConfig

llama = AutoConfig.from_pretrained('TinyLlama/TinyLlama-1.1B-Chat-v1.0')
gpt2 = AutoConfig.from_pretrained('gpt2')

print('--- Llama-architecture config (TinyLlama-1.1B) ---')
for k in ['hidden_act', 'rms_norm_eps', 'num_attention_heads', 'num_key_value_heads',
          'rope_parameters']:
    print(f'  {k} = {getattr(llama, k, "MISSING")}')
print('  attention_bias =', llama.attention_bias, ' mlp_bias =', llama.mlp_bias)

print('--- GPT-2 config (module 07) ---')
for k in ['activation_function', 'layer_norm_epsilon', 'n_head', 'n_positions']:
    print(f'  {k} = {getattr(gpt2, k, "MISSING")}')
```

Verified output:

```
--- Llama-architecture config (TinyLlama-1.1B) ---
  hidden_act = silu
  rms_norm_eps = 1e-05
  num_attention_heads = 32
  num_key_value_heads = 4
  rope_parameters = {'rope_theta': 10000.0, 'rope_type': 'default'}
  attention_bias = False  mlp_bias = False
--- GPT-2 config (module 07) ---
  activation_function = gelu_new
  layer_norm_epsilon = 1e-05
  n_head = 12
  n_positions = 1024
```

Four real, checkable deltas, straight from these two live config
objects — not asserted, printed:

```
 DELTA                    GPT-2 (module 07)          Llama-architecture
 ───────────────────────  ─────────────────────────  ──────────────────
 Normalization             LayerNorm                  RMSNorm
                            (layer_norm_epsilon)        (rms_norm_eps)
 Activation                gelu_new                   silu (SwiGLU's
                                                          gating component)
 Position encoding          learned absolute            RoPE (rope_theta
                            (n_positions, a fixed        = 10000.0,
                            embedding table size)        rope_type field
                                                          exists at all --
                                                          GPT-2's config
                                                          has NO rope
                                                          field whatsoever)
 Attention heads vs         no such distinction --      num_attention_heads
 KV heads                   n_head=12 covers both        (32) != num_key_
                            queries and keys/values      value_heads (4):
                                                          grouped-query
                                                          attention (GQA)
 Bias terms in linear       has them (GPT-2's           attention_bias and
 layers                     Conv1D layers include        mlp_bias both
                            biases by default)            explicitly False
```

The `num_attention_heads=32` vs `num_key_value_heads=4` split is
grouped-query attention: 32 separate query heads share only 4 distinct
sets of key/value projections (8 query heads per KV group), trading a
small amount of representational flexibility for a real, measurable cut
in the size of the KV cache module 10 just benchmarked — fewer
distinct K/V tensors to store per generated token. GPT-2's single
`n_head=12` has no such split; every query head gets its own K/V.

### Verified: RMSNorm skips mean-centering — LayerNorm does not

The config confirms Llama uses `rms_norm_eps`, not `layer_norm_epsilon`
— but what does that actually change numerically? Computing both from
scratch on the same input:

```python
import torch

torch.manual_seed(0)
x = torch.randn(1, 4)

# LayerNorm: subtract the mean, THEN divide by (a function of) variance
mean = x.mean(dim=-1, keepdim=True)
var = x.var(dim=-1, keepdim=True, unbiased=False)
layernorm_out = (x - mean) / torch.sqrt(var + 1e-5)

# RMSNorm: NO mean subtraction -- only rescale by root-mean-square
rms = torch.sqrt((x**2).mean(dim=-1, keepdim=True) + 1e-5)
rmsnorm_out = x / rms

print('LayerNorm output:', layernorm_out, ' mean =', layernorm_out.mean().item())
print('RMSNorm output:  ', rmsnorm_out, ' mean =', rmsnorm_out.mean().item())

ln = torch.nn.LayerNorm(4, eps=1e-5, elementwise_affine=False)
print('manual LayerNorm matches torch.nn.LayerNorm:', torch.allclose(ln(x), layernorm_out, atol=1e-6))
```

Verified output:

```
LayerNorm output: tensor([[ 1.1918, -0.1481, -1.5251,  0.4814]])  mean = 2.24e-08
RMSNorm output:   tensor([[ 1.1231, -0.2138, -1.5879,  0.4143]])  mean = -0.0661
manual LayerNorm matches torch.nn.LayerNorm: True
```

This is the concrete, numeric proof: LayerNorm's output mean is
`2.24e-08` — zero, up to floating-point noise, exactly as Track 02
Module 12 verified. RMSNorm's output mean is `-0.0661` — genuinely
**not** zero, because RMSNorm never subtracted a mean in the first
place; it only rescales by the root-mean-square of the input. The
manual LayerNorm implementation matching `torch.nn.LayerNorm` to six
decimal places confirms the reference calculation itself is correct,
which makes RMSNorm's non-zero mean a real finding rather than a bug in
the comparison. The practical payoff (not independently re-benchmarked
here, but the documented reason Llama adopted it): skipping the
mean-computation step is one less reduction per normalization call,
compounding across every layer of a large model.

### The three generations, briefly — what actually changed and when

```
 Llama 1 (Feb 2023)         Llama 2 (Jul 2023)          Llama 3 (2024)
 ─────────────────────      ──────────────────────      ─────────────────
 arXiv:2302.13971           arXiv:2307.09288             arXiv:2407.21783
 Research-only license      Commercial use allowed       Commercial use
                             below 700M MAU (quoted        allowed (same
                             above)                        MAU-threshold
                                                            structure)
 Up to 65B params           Up to 70B params              Up to 405B params
                                                            ("herd of
                                                             models")
```

Each generation's paper is real and citable (below) — this table is
intentionally brief because the paper-to-paper deltas in training data
scale and fine-tuning recipe are covered by those papers directly, and
this module's own verified contribution is the architecture-level
comparison against GPT-2 above, not a restatement of each paper's
benchmark tables.

## Reference

```
 Fact / claim                          Status                Source
 ──────────────────────────────────    ───────────────────   ──────────────────
 Llama uses RMSNorm, not LayerNorm     Verified (config       TinyLlama config;
                                        field + numeric        RMSNorm output
                                        proof above)           mean != 0
 Llama uses RoPE, GPT-2 uses           Verified (config:       rope_parameters
 learned absolute position              rope_parameters        field present/
 embeddings                             present vs. absent)    absent
 Llama (some variants) uses            Verified (config:       num_attention_
 grouped-query attention                32 query heads vs.     heads vs. num_
                                        4 KV head groups)       key_value_heads
 Llama's linear layers drop bias        Verified (config:       attention_bias,
 terms                                  both explicitly         mlp_bias fields
                                        False)
 Llama 2 license is NOT an OSI          Verified (exact         Meta's Llama 2
 open-source license                    700M-MAU clause         license text
                                        quoted above)
 TinyLlama-1.1B is Meta's own           NOT true — disclosed    (this module's
 official release                       explicitly: it's a      own framing)
                                        third-party open
                                        reproduction of the
                                        Llama architecture
```

## Hands-on exercises

### 1. Reproduce the GPT-2-vs-Llama config comparison yourself

Run the verified `AutoConfig.from_pretrained` code above. Then load a
second Llama-architecture checkpoint of your choice from Hugging Face
Hub (any fully open one, not a gated Meta repo) and confirm the same
four deltas (RMSNorm, SwiGLU/silu, RoPE, no-bias linear layers) hold —
this checks whether they're properties of "the Llama architecture
family" in general or an artifact of the one checkpoint this module
happened to load.

### 2. Verify the RMSNorm finding holds on a larger, random input

Re-run the RMSNorm-vs-LayerNorm comparison with a larger random tensor
(e.g., `torch.randn(1, 512)` instead of `torch.randn(1, 4)`). Confirm
LayerNorm's output mean stays effectively zero and RMSNorm's does not,
the same qualitative pattern this module verified on a 4-element
example — this rules out "it only happens to work out that way on a
tiny example."

### 3. Read the Llama 2 license's exact commercial-use clause yourself

Open Meta's Llama 2 license page (cited below) and locate the 700
million MAU clause quoted in this module. Then check whether Llama 3's
license (also cited below) uses the same threshold and structure, or a
different one — write one or two sentences confirming what you found,
citing the specific text.

## Independent challenge

A colleague states, in a build-vs-buy document: "Llama is open source,
so there's no licensing review needed before we ship a product built on
it." Using this module's verified distinction between open-weight and
open-source, explain what's wrong with this statement and what should
actually happen before shipping.

<details><summary>Discussion</summary>

"Open source" in the OSI sense implies no usage restrictions beyond
attribution/copyleft terms that don't gate scale of use. Llama's actual
license (quoted directly in this module, from Meta's own license text)
imposes a specific commercial restriction tied to monthly active users
— 700 million, as of the Llama 2 license — above which a company must
request separate permission from Meta, granted at Meta's sole
discretion. Calling this "open source" and skipping licensing review
conflates "I can download the weights" with "I have unrestricted legal
permission to use them at any scale," which the license text directly
contradicts. The correct action: check the specific license version
attached to whichever Llama generation/checkpoint is actually being
used (Llama 1's research-only license differs from Llama 2/3's
commercial-permitting-below-a-threshold license), and if the product's
projected user base is anywhere near the stated MAU threshold, involve
legal review rather than assuming "open-weight" settles the question.

</details>

## Common mistakes & troubleshooting

- **Calling Llama "open source" without qualification.** Its weights
  are downloadable ("open-weight"), but Meta's actual license text
  (quoted in this module) imposes a real commercial-use threshold —
  not an OSI-approved open-source license.
- **Assuming every Llama-family model uses grouped-query attention.**
  This module's own verified config shows TinyLlama-1.1B does
  (`num_attention_heads=32` vs `num_key_value_heads=4`) — but GQA was
  introduced as an optimization for larger models specifically; not
  every historical Llama checkpoint at every size necessarily uses it.
  Check the specific checkpoint's own config rather than assuming.
- **Treating TinyLlama's config as Meta's own official numbers.** This
  module explicitly discloses TinyLlama as a third-party open
  reproduction of the Llama architecture, used precisely because it's
  inspectable without a license-acceptance gate — it demonstrates the
  *architecture family's* real properties, not Meta's own specific
  released checkpoint's exact numbers.
- **Assuming RMSNorm and LayerNorm are numerically interchangeable
  because both are "a normalization layer."** This module's verified
  output shows RMSNorm's output mean is not zero (`-0.0661` in the
  worked example) — it structurally skips the mean-centering step
  LayerNorm performs.
- **Assuming Llama 1, 2, and 3 share one license.** They don't — Llama
  1 was research-only; Llama 2 and 3 permit commercial use below a
  stated MAU threshold. Check the license attached to the specific
  generation being used.

## Checkpoint quiz

1. What does "open-weight" mean, and how is it different from "open
   source" in the OSI sense? Cite the specific clause from Llama 2's
   license that makes this distinction concrete.
2. Name three architectural deltas this module verified between GPT-2's
   config and a real Llama-architecture config, and the specific config
   field(s) that revealed each one.
3. What did the verified RMSNorm-vs-LayerNorm numeric comparison show
   about each method's output mean, and why does that difference occur?
4. What does `num_attention_heads=32` combined with
   `num_key_value_heads=4` in a config indicate, and what benefit does
   it provide (reusing module 10's own finding)?
5. Is TinyLlama-1.1B, the checkpoint this module inspected, an official
   Meta release? Why was it used instead of a Meta Llama checkpoint?

<details><summary>Answers</summary>

1. "Open-weight" means the model's trained weights are downloadable;
   it says nothing about usage restrictions. Llama 2's actual license
   text states that above 700 million monthly active users, a licensee
   "must request a license from Meta, which Meta may grant...in its
   sole discretion" — a real commercial restriction an OSI-approved
   open-source license would not impose.
2. Any three of: RMSNorm vs. LayerNorm (`rms_norm_eps` vs.
   `layer_norm_epsilon`), SwiGLU/silu activation vs. `gelu_new`
   (`hidden_act`), RoPE vs. learned absolute position embeddings
   (`rope_parameters` present vs. absent, `n_positions` in GPT-2), and
   grouped-query attention vs. uniform per-head K/V
   (`num_attention_heads` vs. `num_key_value_heads` differing vs.
   GPT-2's single `n_head`), plus no-bias linear layers
   (`attention_bias`/`mlp_bias` both `False`).
3. LayerNorm's output mean was effectively zero (`2.24e-08`, floating-
   point noise); RMSNorm's was `-0.0661`, genuinely non-zero. This
   happens because RMSNorm never subtracts the input's mean — it only
   divides by the root-mean-square of the input, whereas LayerNorm
   first centers the input by subtracting its mean.
4. It indicates grouped-query attention: 32 separate query heads share
   only 4 distinct sets of key/value projections. Per module 10's own
   KV-cache finding, fewer distinct K/V tensors per token means a
   smaller cache to store and move during autoregressive generation.
5. No — this module explicitly discloses TinyLlama-1.1B as a
   third-party open reproduction of the Llama architecture, not a Meta
   release. It was used because it's inspectable without accepting a
   license gate, while still exhibiting the same architectural family
   properties (RMSNorm, RoPE, SwiGLU, GQA) this module verifies.

</details>

## Further reading & sources

- [LLaMA: Open and Efficient Foundation Language Models (Touvron et al., 2023)](https://arxiv.org/abs/2302.13971) - the original Llama 1 paper, the first of this lineage.
- [Llama 2: Open Foundation and Fine-Tuned Chat Models (Touvron et al., 2023)](https://arxiv.org/abs/2307.09288) - the Llama 2 paper, the generation that introduced the commercial-use-permitting license this module quotes directly.
- [The Llama 3 Herd of Models (Meta AI, 2024)](https://arxiv.org/abs/2407.21783) - the Llama 3 technical report, confirming the up-to-405B-parameter "herd" and continued multilingual/tool-use/reasoning focus.
- [Meta Llama 2 License](https://ai.meta.com/llama/license/) - the primary source for this module's central legal claim: the exact 700-million-MAU commercial-use clause quoted verbatim above. Always check the specific license text for whichever Llama generation is actually in use.
- [Root Mean Square Layer Normalization (Zhang & Sennrich, 2019)](https://arxiv.org/abs/1910.07467) - the paper introducing RMSNorm, the normalization scheme this module verified numerically against LayerNorm.

## Next

[Module 12: Mixture of Experts — The Core Idea](../12-mixture-of-experts-the-core-idea/README.md)
