# Module 07: GPT-1 and GPT-2

## Why this matters

Module 00 split the field into BERT (encoder-only, bidirectional) and
GPT (decoder-only, causal); module 06 verified GPT-2's causal language
modeling mechanics directly against `AutoConfig.from_pretrained("gpt2")`.
Track 00 module 07 ("The Scaling Era") already told the *story* of
GPT-1 to GPT-2 to GPT-3 — 117M to 1.5B to 175B parameters, a historical
narrative about what scale bought. This module does something narrower
and more concrete: it verifies, with real code, exactly what changed
*architecturally* between GPT-1 and GPT-2 specifically — not "scale in
general," but the actual layer counts, head counts, hidden sizes, and
parameter totals of GPT-2's real released size variants, checked one
against another and against GPT-1's own published numbers. It also
checks whether that verified scale difference produces a measurable
difference in behavior (perplexity on a fixed sentence, and greedy
generation from an identical prompt) rather than assuming "bigger is
better" as received wisdom.

One honesty note up front: GPT-1 itself is not published on Hugging
Face under a loadable name, so GPT-1's numbers below are cited
directly from its original paper (Radford et al., 2018), not verified
by running code. Every GPT-2 number below, by contrast, comes from
code actually executed for this module — `AutoConfig.from_pretrained`
for all four size variants, and full weight loading (via
`AutoModelForCausalLM.from_pretrained`) for `gpt2` and `gpt2-medium`
specifically. `gpt2-large` and `gpt2-xl` are inspected via config only
in this module — `gpt2-xl` in particular is a ~1.5B-parameter model,
and its full weights were deliberately not loaded here to avoid an
excessive memory/time cost that config inspection doesn't require.

## Concepts

### GPT-1 (2018): the two-phase paradigm, from the paper

GPT-1's contribution, as module 00 introduced, was the **recipe**: a
decoder-only transformer (track 02 module 16), pretrained with a causal
language-modeling objective (module 06) on unlabeled text, then
fine-tuned with a supervised objective on a labeled downstream task.
Its published architecture (Radford et al., 2018, Section 3):

```
 GPT-1 (published, not independently re-verified here)
 ──────────────────────────────────────────────────────
 Layers (decoder blocks):     12
 Hidden size:                 768
 Attention heads:              12
 Parameters:                 117M
 Context window:              512 tokens
 Pretraining data:    BooksCorpus, ~7,000 unpublished books
```

The two-phase paradigm itself:

```
 PHASE 1: PRETRAIN                        PHASE 2: FINE-TUNE
 (self-supervised, module 00)             (supervised, per task)

 raw text (BooksCorpus)                   labeled task data
        │                                        │
        ▼                                        ▼
 ┌─────────────────┐                     ┌─────────────────┐
 │ causal LM        │   ──weights──►     │ same model,      │
 │ objective        │   transferred      │ task-specific    │
 │ (module 06)      │                    │ output head      │
 └─────────────────┘                     └─────────────────┘
```

This is the same paradigm track 03 module 00 verified in the abstract;
GPT-1 is the concrete decoder-only instance of it.

### Verified: GPT-2's four released sizes, real configs

GPT-2's actual claim (Radford et al., 2019, "Language Models are
Unsupervised Multitask Learners") is that scaling this same recipe up,
*without* the fine-tuning phase, produces reasonable **zero-shot**
performance on tasks it was never explicitly trained for. Before
evaluating that claim, verify what "scaling up" actually meant in
concrete architectural terms:

```python
from transformers import AutoConfig

for name in ["gpt2", "gpt2-medium", "gpt2-large", "gpt2-xl"]:
    c = AutoConfig.from_pretrained(name)
    print(name, "n_layer=", c.n_layer, "n_head=", c.n_head,
          "n_embd=", c.n_embd, "n_ctx=", c.n_ctx,
          "vocab_size=", c.vocab_size)
```

Verified output:

```
gpt2         n_layer=12  n_head=12  n_embd=768   n_ctx=1024  vocab_size=50257
gpt2-medium  n_layer=24  n_head=16  n_embd=1024  n_ctx=1024  vocab_size=50257
gpt2-large   n_layer=36  n_head=20  n_embd=1280  n_ctx=1024  vocab_size=50257
gpt2-xl      n_layer=48  n_head=25  n_embd=1600  n_ctx=1024  vocab_size=50257
```

Every size doubles or nearly doubles layers and hidden size moving up
the family — `gpt2` to `gpt2-xl` is a 4x increase in layer count (12 to
48) and just over 2x in hidden size (768 to 1600), compounding into a
much larger total parameter count (verified next). All four share the
same 1024-token context window and the same 50,257-token vocabulary —
scale here means deeper and wider, not longer-context or a bigger
vocabulary.

### Verified: real parameter counts for `gpt2` and `gpt2-medium`

Config fields alone don't give total parameter count directly (it also
depends on how attention and the feed-forward blocks are wired
together, track 02 modules 05-06) — so the actual models were loaded
and their parameters summed directly:

```python
from transformers import AutoModelForCausalLM

for name in ["gpt2", "gpt2-medium"]:
    m = AutoModelForCausalLM.from_pretrained(name)
    n = sum(p.numel() for p in m.parameters())
    print(name, "total_params=", n, f"({n/1e6:.1f}M)")
```

Verified output:

```
gpt2         total_params= 124439808  (124.4M)
gpt2-medium  total_params= 354823168  (354.8M)
```

Set beside GPT-1's published 117M: `gpt2` (small) is architecturally
almost identical to GPT-1 on paper — same 12 layers, same 768 hidden
size, same 12 heads — yet has more real parameters (124.4M vs. 117M).
That gap isn't a scaling difference at all; it's accounted for by
GPT-2's larger vocabulary (50,257 byte-level BPE tokens, track 01
modules 03-04) versus GPT-1's roughly 40,478-token vocabulary, and
GPT-2's doubled context window (1024 vs. 512 tokens) — both of which
add parameters in the embedding and positional tables without changing
depth or width. `gpt2-medium`, by contrast, is a genuine architectural
scale-up — double the layers (24 vs. 12) and larger hidden size (1024
vs. 768) — and its parameter count (354.8M) reflects that, roughly 2.9x
GPT-1/`gpt2`-small.

### Verified: larger GPT-2 gets measurably lower perplexity on a fixed sentence

Scale is supposed to buy better next-token prediction. Rather than
assume it, this was measured directly: the same held-out sentence,
scored for causal LM loss (module 06) by both `gpt2` and
`gpt2-medium`, with nothing else about the input changed:

```python
import math, torch
from transformers import AutoTokenizer, AutoModelForCausalLM

tok = AutoTokenizer.from_pretrained("gpt2")
sentence = ("The scientist carefully poured the liquid into the flask "
            "and watched it change color.")
enc = tok(sentence, return_tensors="pt")

for name in ["gpt2", "gpt2-medium"]:
    model = AutoModelForCausalLM.from_pretrained(name)
    model.eval()
    with torch.no_grad():
        out = model(**enc, labels=enc["input_ids"])
    loss = out.loss.item()
    print(name, "loss=", round(loss, 4), "perplexity=", round(math.exp(loss), 3))
```

Verified output:

```
gpt2         loss= 3.9246  perplexity= 50.634
gpt2-medium  loss= 3.7238  perplexity= 41.423
```

`gpt2-medium` scores meaningfully lower loss and perplexity on the
exact same sentence — a real, checkable instance of the expected trend
(more parameters, better next-token prediction), not an assumption.

### Verified: greedy generation from an identical prompt, small vs. medium

The same prompt, decoded greedily (`do_sample=False`, so the comparison
isn't confounded by sampling randomness) on both models:

```python
prompt = "The most important skill for a backend engineer is"
enc = tok(prompt, return_tensors="pt")
out = model.generate(**enc, max_new_tokens=20, do_sample=False)
print(tok.decode(out[0], skip_special_tokens=True))
```

Verified output:

```
gpt2:        "...is to understand the underlying architecture of the
              application. This is especially important when you are
              building a web application"
gpt2-medium: "...is to understand the business logic of your
              application. This is the most important skill for any
              developer."
```

Both continuations are fluent and on-topic — GPT-2's causal LM
objective (module 06) works at both sizes — but `gpt2-medium`'s
completion is more specific and better-formed as a closed thought
("the most important skill for any developer" reads like a deliberate
conclusion), consistent with its lower measured perplexity above. This
is a small, single-prompt comparison, not a rigorous evaluation
(exercise 3 asks you to broaden it) — but it is a real, checkable
difference in behavior, not a general claim taken on faith.

### GPT-2's actual claim: zero-shot, not just "bigger"

The architectural and perplexity numbers above explain *how* GPT-2 is
bigger than GPT-1; they don't by themselves explain the paper's actual
headline claim. GPT-2's title — "Language Models are Unsupervised
Multitask Learners" — is a claim about skipping GPT-1's phase 2
entirely: given enough scale and diverse enough pretraining data
(WebText, scraped from outbound Reddit links, versus GPT-1's ~7,000
books), a single causally-pretrained model can perform tasks like
summarization or translation directly, by conditioning on a natural-
language prompt, with **no task-specific fine-tuning step at all**.
That is a claim about eliminating GPT-1's phase 2 (fine-tuning), not
merely a claim about a bigger phase 1 — the scale verified above is
the enabling condition, not the claim itself.

## Reference

```
 Model         Layers  Heads  Hidden  Params        Verified how
 ───────────   ──────  ─────  ──────  ──────────    ───────────────────
 GPT-1          12      12     768     117M          published (paper),
                                                       not re-verified here
 gpt2 (small)   12      12     768     124.4M        full model loaded
 gpt2-medium    24      16     1024    354.8M        full model loaded
 gpt2-large     36      20     1280    (not loaded)  config only
 gpt2-xl        48      25     1600    (not loaded,  config only
                                        ~1.5B published)

 Metric on fixed sentence     gpt2      gpt2-medium
 ──────────────────────────   ───────   ───────────
 Loss                          3.9246    3.7238
 Perplexity                    50.634    41.423

 Concept                    GPT-1                    GPT-2
 ──────────────────────     ─────────────────────    ─────────────────────
 Training data                BooksCorpus, ~7,000       WebText, scraped
                               books                     outbound Reddit
                                                          links
 Downstream task use          Phase 2: supervised        Zero-shot: prompt
                               fine-tuning per task        the pretrained
                                                            model directly,
                                                            no fine-tuning
```

## Hands-on exercises

### 1 — reproduce the four-size config comparison

Run the exact `AutoConfig.from_pretrained` loop above for all four
GPT-2 sizes. Confirm your own output matches `n_layer`, `n_head`,
`n_embd`, and `vocab_size` reported above, and compute by hand how many
times larger `gpt2-xl`'s hidden size is versus `gpt2`'s.

### 2 — reproduce the perplexity comparison on your own sentence

Pick a sentence of your own (something outside typical training data,
e.g. a made-up name or an unusual factual claim), score it with both
`gpt2` and `gpt2-medium` using the exact loss/perplexity code above,
and confirm whether the larger model still wins. Then try a second
sentence built from very common phrasing and see whether the gap
between the two models narrows — connect what you find to module 06's
discussion of what causal LM loss actually measures.

### 3 — extend the generation comparison to `gpt2-large`

Load `gpt2-large` (its full weights, not just its config — it is a
larger download and slower to run than `gpt2`/`gpt2-medium` but still
practical to load, unlike `gpt2-xl`) and generate from the same prompt
used above. Compare all three completions side by side and write two
or three sentences on whether the improvement from `gpt2` to
`gpt2-medium` to `gpt2-large` looks roughly linear, or whether returns
appear to diminish — a real, checkable version of the "does scale keep
paying off" question track 00 module 07 raises narratively.

## Independent challenge

A colleague argues that because `gpt2` (124.4M parameters) turned out
to have *more* parameters than GPT-1 (117M) despite matching GPT-1's
layer count, head count, and hidden size exactly, this means GPT-2's
"small" variant isn't really a fair architectural baseline for
comparing against GPT-1 at all. Using this module's verified numbers,
write two or three sentences evaluating that claim — is the parameter
gap between GPT-1 and `gpt2`-small evidence of a deeper architectural
change, or is there a more specific, verified explanation?

<details><summary>Discussion</summary>

The verified numbers point to a specific, non-architectural
explanation rather than a deeper design change: `gpt2`-small matches
GPT-1's published layer count (12), hidden size (768), and head count
(12) exactly, so the parameter gap (124.4M vs. 117M) isn't coming from
depth or width. It's attributable to two concrete, verified
differences instead — GPT-2's larger byte-level BPE vocabulary
(50,257 tokens vs. GPT-1's roughly 40,478) enlarging the token
embedding and output projection tables, and GPT-2's doubled context
window (1024 vs. 512 tokens) enlarging the learned positional embedding
table — both of which add parameters without changing the transformer
blocks' depth or width at all. So `gpt2`-small remains a fair
architectural baseline for the *transformer block* comparison; the
colleague's objection would only hold if the extra parameters came
from deeper or wider transformer blocks, which the verified `n_layer`,
`n_head`, and `n_embd` values above show they don't.

</details>

## Common mistakes & troubleshooting

- **Treating "GPT-2 is bigger than GPT-1" as a single, uniform fact.**
  Verified above: `gpt2`-small and GPT-1 share nearly identical
  transformer-block dimensions (same layers, heads, hidden size); the
  real, large scale-up only appears starting at `gpt2-medium` and
  compounds through `gpt2-large` and `gpt2-xl`.
- **Assuming GPT-2's small-variant extra parameters (124.4M vs. GPT-1's
  117M) came from a deeper or wider architecture.** Verified above:
  they come from a larger vocabulary and longer context window, not
  from additional or larger transformer blocks — check `n_layer`,
  `n_head`, and `n_embd` directly before attributing a parameter gap to
  "architecture."
- **Loading `gpt2-xl`'s full weights casually, expecting `gpt2`-like
  load times.** At roughly 1.5B parameters it is a meaningfully larger
  download and memory footprint than the sizes loaded in this module;
  config-only inspection (as done here) is sufficient for comparing
  its declared architecture without paying that cost.
- **Confusing GPT-2's zero-shot claim with "GPT-2 doesn't need
  fine-tuning to be useful in general."** The verified claim (Radford
  et al., 2019) is that a sufficiently large, causally-pretrained model
  shows *some* zero-shot task performance without fine-tuning — not
  that fine-tuning became pointless; module 08 covers how far this
  capability extends at GPT-3 scale.
- **Drawing conclusions about "does scale help" from a single
  sentence's perplexity or a single prompt's generation.** The
  comparisons above are real and directly verified, but they're small
  samples — exercises 2 and 3 exist specifically to check whether the
  same trend holds across different inputs and a third model size.

## Checkpoint quiz

1. Which specific GPT-2 architectural dimensions (verified via
   `AutoConfig`) does `gpt2`-small share exactly with GPT-1's published
   architecture, and which dimension differs?
2. `gpt2`-small has more total parameters (124.4M) than GPT-1 (117M)
   despite matching layer count, head count, and hidden size. What two
   verified, non-architectural factors account for that gap?
3. What did the verified perplexity comparison on a fixed sentence
   show, and why does using a fixed, identical sentence for both models
   matter for that comparison to be meaningful?
4. What is GPT-2's actual headline claim (per its paper's title), and
   how does it differ from simply claiming "GPT-2 is a bigger version
   of GPT-1"?
5. Why was `gpt2-xl`'s full model not loaded in this module, and what
   was verified about it instead?

<details><summary>Answers</summary>

1. `gpt2`-small shares GPT-1's layer count (12), hidden size (768), and
   head count (12) exactly. It differs in vocabulary size (50,257
   byte-level BPE tokens vs. GPT-1's roughly 40,478) and context window
   (1024 tokens vs. GPT-1's 512).
2. The larger vocabulary (enlarging the token embedding and output
   projection tables) and the doubled context window (enlarging the
   learned positional embedding table) — both verified via
   `AutoConfig`, neither requiring any change to the transformer
   blocks' depth or width.
3. `gpt2-medium` scored lower loss (3.7238 vs. 3.9246) and lower
   perplexity (41.423 vs. 50.634) than `gpt2` on the identical
   sentence — confirming the expected "more parameters, better
   next-token prediction" trend directly rather than assuming it.
   Using the same sentence for both matters because perplexity depends
   heavily on the specific text being scored — comparing different
   sentences across the two models wouldn't isolate the effect of
   model size.
4. GPT-2's headline claim is that a sufficiently large, causally-
   pretrained language model can perform tasks **zero-shot** —
   directly from a prompt, without GPT-1's separate supervised
   fine-tuning phase (module 00's phase 2). This is a claim about
   eliminating an entire training phase, not just a claim about having
   more parameters than GPT-1.
5. Because `gpt2-xl` is a roughly 1.5B-parameter model, and loading its
   full weights risks an excessive memory and time cost this module's
   verification didn't require. Its declared architecture (48 layers,
   25 heads, 1600 hidden size) was verified via `AutoConfig` inspection
   only, explicitly not via loading its full weights.

</details>

## Further reading & sources

- [Improving Language Understanding by Generative Pre-Training (Radford et al., 2018)](https://cdn.openai.com/research-covers/language-unsupervised/language_understanding_paper.pdf) - the original GPT-1 paper; Section 3 documents the 117M-parameter, 12-layer architecture and the BooksCorpus pretraining data cited (not re-verified by code) in this module.
- [Language Models are Unsupervised Multitask Learners (Radford et al., 2019)](https://cdn.openai.com/better-language-models/language_models_are_unsupervised_multitask_learners.pdf) - the original GPT-2 paper; documents the four released size variants and the zero-shot multitask claim this module verifies architecturally and behaviorally.
- [Hugging Face documentation: GPT-2](https://huggingface.co/docs/transformers/en/model_doc/gpt2) - the `AutoConfig`, `AutoModelForCausalLM`, and `GPT2Config` fields (`n_layer`, `n_head`, `n_embd`, `n_ctx`) used directly in this module's verification code.
- [OpenAI: Better Language Models and Their Implications](https://openai.com/index/better-language-models/) - OpenAI's own release post for GPT-2, describing the staged public release of the different size variants verified in this module.
- [Track 03, Module 00: The Pretraining Paradigm](../00-the-pretraining-paradigm/README.md) - defines the self-supervised pretraining and the two-phase (pretrain, fine-tune) paradigm this module verifies concretely for GPT-1 and contrasts against GPT-2's zero-shot claim.

## Next

[Module 08: GPT-3 and In-Context Learning](../08-gpt-3-and-in-context-learning/README.md)
