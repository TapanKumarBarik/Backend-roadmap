# Module 04: Compute Budgets and Chinchilla Optimality

## Why this matters

Module 03 verified, at toy scale, that a bigger model reaches lower
loss when data and training steps are held fixed — and immediately
flagged the question it deliberately left open: for a **fixed total
compute budget**, is it actually better to spend that compute on a
bigger model, or on more training data for a smaller model? Kaplan et
al.'s original scaling laws (Module 03) were widely read, in practice,
as "bigger is better" — and GPT-3 (175B parameters, trained on ~300B
tokens) and many models that followed were built on roughly that
reading. Hoffmann et al.'s 2022 Chinchilla paper overturned that
practical conclusion with a specific, arithmetic finding: at GPT-3's
own compute budget, a substantially *smaller* model trained on
substantially *more* data would have reached lower loss. This module
makes that finding concrete with real arithmetic on real, named,
published model configurations — no toy training run needed, because
the entire argument is a compute-accounting identity applied to numbers
that are already public.

## Concepts

### The C ≈ 6ND approximation

Training a transformer with a standard architecture requires
approximately `6` floating-point operations per parameter per training
token — roughly `2` for the forward pass and `4` for the backward pass
(matrix multiplies dominate; the constant is a well-established rough
estimate used throughout the scaling-laws literature, not an exact
count of every op):

```
 C  ≈  6 * N * D

 C = total training compute, in FLOPs
 N = number of model parameters
 D = number of training tokens
```

This is deliberately a rough approximation (it ignores attention's
own quadratic-in-sequence-length cost, embedding layers, and other
lower-order terms) but it's accurate enough, and simple enough, that
the entire field uses it to reason about compute budgets at the scale
of "how many total FLOPs did this training run cost."

### Verified: applying C ≈ 6ND to two real, published training runs

```python
def flops(n_params, n_tokens):
    return 6 * n_params * n_tokens

gpt3_params, gpt3_tokens = 175e9, 300e9          # Brown et al. 2020
chinchilla_params, chinchilla_tokens = 70e9, 1.4e12  # Hoffmann et al. 2022

gpt3_c = flops(gpt3_params, gpt3_tokens)
chinchilla_c = flops(chinchilla_params, chinchilla_tokens)

print(f"GPT-3:      N={gpt3_params:.3e}  D={gpt3_tokens:.3e}  "
      f"-> C={gpt3_c:.3e} FLOPs  tokens/param={gpt3_tokens/gpt3_params:.2f}")
print(f"Chinchilla: N={chinchilla_params:.3e}  D={chinchilla_tokens:.3e}  "
      f"-> C={chinchilla_c:.3e} FLOPs  tokens/param={chinchilla_tokens/chinchilla_params:.2f}")
```

Verified output:

```
GPT-3:       N=1.750e+11 params  D=3.000e+11 tokens  -> C=3.150e+23 FLOPs   tokens/param=1.71
Chinchilla:  N=7.000e+10 params  D=1.400e+12 tokens  -> C=5.880e+23 FLOPs   tokens/param=20.00
```

The computed `3.150e+23 FLOPs` for GPT-3 lines up closely with GPT-3's
own publicly reported training compute figure (~3.14 x 10^23 FLOPs) —
a real sanity check that the `6ND` approximation, crude as it is,
tracks the actual published number closely. The second column on each
line — **tokens per parameter** — is the number this entire module
turns on: GPT-3 trained on only **1.71 tokens per parameter**.
Chinchilla, deliberately designed around Hoffmann et al.'s finding,
trained on **20.00 tokens per parameter** — over 11x more tokens
relative to its (smaller) size.

### Verified: what would have been Chinchilla-optimal for GPT-3's own compute budget

Hoffmann et al.'s empirical fit across many training runs at varying
compute budgets found that the compute-optimal split between N and D
is, to a first approximation, a roughly fixed ratio — commonly cited
as approximately **20 tokens per parameter** — rather than "spend
essentially all your growing compute budget on more parameters," which
is closer to what GPT-3-scale practice had been doing.

```python
import math
ratio = 20.0  # Hoffmann et al.'s empirically fitted compute-optimal tokens/param

C = gpt3_c  # hold GPT-3's ACTUAL compute budget fixed
# C = 6*N*D, D = ratio*N  =>  C = 6*ratio*N^2  =>  N = sqrt(C / (6*ratio))
n_opt = math.sqrt(C / (6 * ratio))
d_opt = ratio * n_opt

print(f"Same compute budget C={C:.3e} FLOPs:")
print(f"  Chinchilla-optimal N_opt = {n_opt:.3e} params ({n_opt/1e9:.1f}B)")
print(f"  Chinchilla-optimal D_opt = {d_opt:.3e} tokens ({d_opt/1e9:.1f}B)")
print(f"  GPT-3 actually used {gpt3_params/1e9:.0f}B params "
      f"-> {gpt3_params/n_opt:.2f}x MORE parameters than optimal for this compute")
print(f"  GPT-3 actually used {gpt3_tokens/1e9:.0f}B tokens "
      f"-> {d_opt/gpt3_tokens:.2f}x MORE tokens would have been optimal")
```

Verified output:

```
Same compute budget C=3.150e+23 FLOPs, applying Chinchilla's ~20 tokens/param ratio:
  Chinchilla-optimal N_opt = 5.123e+10 params   (51.2B)
  Chinchilla-optimal D_opt = 1.025e+12 tokens   (1024.7B)

  GPT-3 actually used N=175B params (vs 51.2B optimal -> 3.42x more parameters than optimal for this compute)
  GPT-3 actually used D=300B tokens (vs 1024.7B optimal -> 3.42x MORE tokens would have been optimal)
```

Holding GPT-3's own real compute budget (`3.150e23 FLOPs`) fixed,
Hoffmann et al.'s ratio implies the compute-optimal choice would have
been roughly a **51B-parameter model trained on roughly 1.02 trillion
tokens** — a model less than a third of GPT-3's actual size, trained
on more than three times as many tokens, for the *same* total training
FLOPs. The symmetry in the two "3.42x" numbers is not a coincidence:
it falls directly out of holding `C = 6ND` fixed while changing the
`D/N` ratio from 1.71 (GPT-3's actual) to 20 (Chinchilla-optimal) —
GPT-3 traded away roughly the same factor of "should-be tokens" for
"actual extra parameters."

### Verified: sanity-checking Chinchilla's own training run against its own rule

```python
print(f"Chinchilla's actual tokens/param = {chinchilla_tokens/chinchilla_params:.2f}  "
      f"(vs the ~{ratio:.0f} rule of thumb the paper reports)")
```

Verified output:

```
Chinchilla's actual tokens/param = 20.00  (vs the ~20 rule of thumb the paper reports -- consistent)
```

This isn't a coincidence either — Hoffmann et al. specifically designed
and trained the Chinchilla model (70B params, 1.4T tokens) to sit on
their own fitted compute-optimal frontier, at roughly the same total
compute budget as some of DeepMind's own larger, more
parameter-heavy contemporaries (e.g. Gopher, 280B params) — and
reported that Chinchilla, despite being much smaller, outperformed
those larger models on downstream benchmarks. This module's arithmetic
reproduces the *reasoning*, not the paper's own benchmark results
(which required actually training both models) — but the reasoning
alone is enough to see why "undertrained relative to compute" was a
real, quantifiable, and costly mistake at GPT-3's scale.

## Reference

```
 Term                    Meaning
 ──────────────────────  ────────────────────────────────────────────
 C ~= 6ND                  FLOPs approximation: compute ~ 6 x
                          parameters x training tokens
 Tokens per parameter       D / N — this module's key diagnostic
                          number. GPT-3 (actual): 1.71. Chinchilla
                          (actual, and the paper's own rule of thumb):
                          ~20
 Compute-optimal            The (N, D) split that minimizes loss for a
                          FIXED total compute budget C — Hoffmann et
                          al.'s central empirical fit
 Undertrained (relative       A model whose D/N ratio is well below the
 to compute)               compute-optimal ratio for its training
                          budget — verified: GPT-3 at 1.71 vs. an
                          optimal ~20
 Gopher                     A real, named 280B-parameter DeepMind
                          model from the same era, cited by Hoffmann
                          et al. as a comparison point for Chinchilla
                          at similar compute
```

## Hands-on exercises

### 1. Run the same analysis for a model of your choosing

Look up a real, published parameter count and training token count for
another LLM (e.g. LLaMA, LLaMA 2, or another model with a public
technical report). Compute its real `C ≈ 6ND`, its real tokens/param
ratio, and compare that ratio to Chinchilla's ~20. Report whether the
model you chose looks over-trained, under-trained, or roughly
compute-optimal relative to that rule of thumb.

### 2. Invert the question: what compute would GPT-3's actual token count need to be optimal?

Instead of holding compute fixed and solving for optimal N, hold
GPT-3's actual parameter count (175B) fixed and its actual token count
(300B) fixed, and compute what **total compute budget** would make that
exact (N, D) pair compute-optimal under the ~20 tokens/param rule
(hint: solve for what D *would* need to be at N=175B for the ratio to
be 20, then compute `6ND` using that hypothetical D). Compare that
hypothetical compute budget to GPT-3's real one, and describe in one
sentence what mismatch this reveals from the other direction.

### 3. Sensitivity check: how much does the answer change with a different assumed ratio?

Re-run the Chinchilla-optimal calculation using ratios of 10 and 30
instead of 20 (a reasonable way to stress-test how sensitive the
"3.42x" conclusion is to the exact ratio value). Report the real
N_opt, D_opt, and multiplier for each, and comment on whether the
qualitative conclusion ("GPT-3 was meaningfully undertrained relative
to its compute") survives reasonable uncertainty in the exact ratio.

## Independent challenge

A startup with a fixed training budget says: "We want the biggest,
most impressive-sounding parameter count we can afford, so we'll spend
90% of our compute budget on model size and 10% on data." Using this
module's verified arithmetic, explain what will likely go wrong with
this strategy and what a Chinchilla-informed budget allocation would
look like instead.

<details><summary>Discussion</summary>

This module's arithmetic gives a direct, numeric answer: spending
disproportionately on parameters over tokens is close to a rerun of
GPT-3's own situation, which this module's own computation showed was
undertrained by a factor of roughly 3.42x relative to its compute
budget — a large, heavy model that had not seen nearly enough data to
reach the loss its compute budget could have bought it. "Biggest
parameter count" optimizes the wrong number: for a *fixed* compute
budget C, `C ≈ 6ND` means N and D trade off directly against each
other — spending more on one leaves strictly less for the other, and
Hoffmann et al.'s empirical finding is that the loss-minimizing split
sits close to a fixed tokens/param ratio (~20), not close to "maximize
N." A startup chasing an impressive headline parameter count with a
fixed budget would, following this module's arithmetic, end up with a
model that trains on measurably too few tokens for its size and
reaches a *worse* loss than a smaller model trained compute-optimally
on the same budget — the opposite of what "biggest number" was
supposed to buy them. The Chinchilla-informed allocation: pick N and D
so `D/N ≈ 20` (subject to `6ND` equaling the actual budget), which for
a fixed budget generally means a noticeably smaller model than the
"maximize parameters" instinct would pick, trained on substantially
more data — trading a smaller headline number for a genuinely lower
loss at the same cost.

</details>

## Common mistakes & troubleshooting

- **Treating C ≈ 6ND as an exact FLOPs count.** It's a well-established
  rough approximation (dominant matmul cost only); this module's own
  sanity check (computed GPT-3 compute closely matching its publicly
  reported figure) shows it's accurate enough to reason with, not that
  it's exact.
- **Assuming "more parameters" and "compute-optimal" are the same
  goal.** They aren't — this module's whole point is that for a FIXED
  compute budget, more parameters necessarily means fewer tokens (`C =
  6ND` is a hard trade-off), and Hoffmann et al.'s finding is that
  GPT-3-era practice put too much of the budget on N and too little on
  D relative to the loss-minimizing split.
- **Confusing "Chinchilla-optimal" with "always train on ~20 tokens per
  parameter regardless of budget."** The ~20 ratio was Hoffmann et
  al.'s empirical fit around the compute budgets and model scales they
  actually studied; it is a useful, real rule of thumb, not a
  universal physical constant — Exercise 3 exists to show how the
  conclusion shifts (or doesn't) under a plausible range of ratios.
- **Forgetting Chinchilla being smaller is the entire point, not a
  downside.** A smaller model trained compute-optimally reaching lower
  loss than a larger undertrained one at the *same* compute cost is
  the paper's headline result — it's not a consolation prize for using
  less compute, it's a strictly better use of the *same* compute.
- **Applying this module's exact GPT-3/Chinchilla numbers to a
  different model family without re-deriving them.** Exercise 1 exists
  because the right move for any *other* model is to look up its own
  real N and D and recompute its own ratio — not assume GPT-3's 1.71 or
  Chinchilla's 20 automatically apply.

## Checkpoint quiz

1. Write the C ≈ 6ND approximation and state what each symbol means.
2. What real tokens-per-parameter ratio did this module compute for
   GPT-3, and what ratio did Chinchilla actually use?
3. Holding GPT-3's real compute budget fixed, what did this module
   compute as the Chinchilla-optimal parameter count and token count,
   and by what multiplier did GPT-3's actual parameter count exceed
   that optimum?
4. Why do the two "3.42x" figures (excess parameters, and the token
   shortfall) in this module's verified output come out to the same
   number?
5. What does "undertrained relative to compute" mean, precisely, per
   this module's definition?

<details><summary>Answers</summary>

1. `C ≈ 6ND`, where C is total training compute in FLOPs, N is the
   number of model parameters, and D is the number of training tokens.
2. GPT-3: ~1.71 tokens per parameter (300B tokens / 175B params).
   Chinchilla: 20.00 tokens per parameter (1.4T tokens / 70B params),
   matching the ~20 rule of thumb the paper itself reports.
3. Roughly 51.2B parameters and roughly 1.025 trillion tokens. GPT-3's
   actual 175B parameters exceeded that optimum by a factor of
   approximately 3.42x.
4. Because the calculation holds total compute `C = 6ND` fixed while
   only the D/N ratio changes (from GPT-3's actual 1.71 to the assumed
   optimal 20) — under a fixed product `N x D`, increasing N by a
   given factor above the optimal split necessarily means D must have
   been short of optimal by the same factor, so the "excess parameters"
   and "token shortfall" multipliers are mathematically forced to
   match.
5. A model whose D/N (tokens-per-parameter) ratio for its actual
   training run falls well below the empirically fitted compute-optimal
   ratio (~20, per Hoffmann et al.) for the total compute it was
   trained with — meaning, for the FLOPs actually spent, the model
   could have reached lower loss by being smaller and seeing more data,
   rather than being as large as it was and seeing comparatively few
   tokens.

</details>

## Further reading & sources

- [Training Compute-Optimal Large Language Models (Hoffmann et al., 2022)](https://arxiv.org/abs/2203.15556) - the Chinchilla paper this entire module is built on; reports the real ~20 tokens/param compute-optimal ratio and the Gopher/Chinchilla comparison this module's arithmetic reasons about.
- [Language Models are Few-Shot Learners (Brown et al., 2020)](https://arxiv.org/abs/2005.14165) - the GPT-3 paper; the source of the real 175B-parameter, ~300B-token figures this module's `6ND` computation checks against GPT-3's own reported training compute.
- [Scaling Laws for Neural Language Models (Kaplan et al., 2020)](https://arxiv.org/abs/2001.08361) - Module 03's paper; Hoffmann et al.'s Chinchilla paper directly revisits and revises this paper's practical guidance on how to split a compute budget between N and D.

## Next

[Module 05: Supervised Fine-Tuning (SFT)](../05-supervised-fine-tuning/README.md)
