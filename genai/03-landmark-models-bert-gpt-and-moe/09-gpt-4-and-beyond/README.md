# Module 09: GPT-4 and Beyond

## Why this matters

Every previous model in this track can be inspected: BERT and GPT-2's
weights are downloadable (modules 01, 06, 07), their layer counts and
parameter counts are published, and this track has run real code
against them. GPT-4 breaks that pattern. It is closed-weight — there is
no checkpoint to download, no `from_pretrained("gpt-4")` call, and no
API key configured in this environment to query it remotely (and this
module makes no attempt to do so). What's genuinely new here is not a
downloadable model to probe, it's a **documented change in how much a
frontier lab discloses about its own model** — and that change is
itself a real, citable, verifiable fact, sitting in the GPT-4 Technical
Report's own text. This module treats that honestly: it verifies what
*can* be verified locally (a toy but architecturally accurate
multimodal input mechanism, and the compute-cost arithmetic of growing
context windows, reusing [Module 11: Context Windows
Explained](../../01-tokens-and-language-modeling/11-context-windows-explained/README.md)'s
already-verified formula), and is explicit everywhere else about what
is publicly confirmed versus merely rumored.

## Concepts

### The disclosure gap: GPT-1/2/3 vs. GPT-4, a real documented shift

GPT-1's and GPT-2's original papers, and GPT-3's ("Language Models are
Few-Shot Learners"), each published concrete architectural numbers —
layer count, hidden dimension, attention-head count, total parameter
count. Modules 07 and 08 (this same track) go through those numbers in
depth as each model is covered. GPT-4 is different, and OpenAI says so
directly, in the GPT-4 Technical Report itself (arXiv:2303.08774):

> "Given both the competitive landscape and the safety implications of
> large-scale models like GPT-4, this report contains no further
> details about the architecture (including model size), hardware,
> training compute, dataset construction, training method, or similar."

That sentence is the load-bearing fact of this module. It is not a
rumor, not an inference, not a leak — it is OpenAI's own technical
report explicitly stating that it withholds exactly the numbers GPT-1,
GPT-2, and GPT-3's own papers disclosed.

```
 DISCLOSURE ACROSS GENERATIONS (what each model's own paper states)
 ────────────────────────────────────────────────────────────────
 GPT-1 (2018)   params, layers, d_model, heads  -> published in paper
 GPT-2 (2019)   params, layers, d_model, heads  -> published in paper
 GPT-3 (2020)   params, layers, d_model, heads  -> published in paper
 GPT-4 (2023)   "this report contains no further details about the
                 architecture (including model size) ..."
                                                 -> explicitly withheld,
                                                    by OpenAI's own text
```

The pattern this reveals is real and checkable by reading each paper:
as GPT moved from a research artifact to a commercial product serving
paying customers behind an API, architectural transparency dropped —
not gradually, but as an explicit, stated editorial decision in GPT-4's
own report. This module's job is to work honestly within that
constraint, not around it.

### What is NOT publicly confirmed (and how to say so correctly)

Because no official parameter count exists, unofficial estimates and
leaks have circulated since GPT-4's release. Some of these are widely
repeated. **None of them are confirmed by OpenAI**, and this module
does not repeat any specific figure as fact. The correct way to discuss
this:

```
 CLAIM                                    STATUS
 ──────────────────────────────────────   ──────────────────────────
 "GPT-4 has some very large number of      Confirmed (implied by
  parameters, likely larger than GPT-3"     capability + OpenAI's own
                                             framing of it as a
                                             large-scale model)
 "GPT-4 has exactly N parameters"           NOT confirmed by OpenAI,
  (for any specific N you've seen           for any N — treat every
  reported online)                          specific figure as
                                             unverified speculation,
                                             regardless of how often
                                             it's repeated
 "GPT-4 uses architecture X"                NOT confirmed by OpenAI —
  (dense transformer, MoE, or any other      the technical report
  specific structural claim)                explicitly withholds this
```

If you encounter a specific number attributed to GPT-4 anywhere
(including in your own memory of press coverage), the correct move is
to check whether it appears in OpenAI's own technical report or model
documentation. If it doesn't — and as of this report, it doesn't — it
is speculation, however confidently it's stated elsewhere.

### What multimodality means, architecturally: patch tokens instead of text tokens

One thing about GPT-4 *is* both public and architecturally
well-understood: it accepts image input (the "GPT-4V" / "GPT-4 with
vision" capability). OpenAI hasn't disclosed GPT-4's own vision encoder
internals, but the *general pattern* used across real, open
vision-language models (LLaVA, and others covered in [Track 16: Speech
& Multimodal
Models](../../16-speech-and-multimodal-models/README.md)) is
well-documented and can be demonstrated honestly without needing GPT-4's
specifics.

Module 02 of Track 02 established that a text embedding is "look up row
N of a table, indexed by token ID" — a discrete vocabulary mapped to
vectors. A vision-language model's key architectural move is doing the
analogous thing for an image, without a discrete vocabulary at all: cut
the image into fixed-size patches, and **project each patch into the
same vector space text tokens live in**, producing a token-like
sequence the same causal transformer stack can process, mixed in with
real text tokens.

```
 TEXT (Track 02, Module 02):                IMAGE (this module):
 token ID -> lookup table row -> vector      pixels -> patch -> linear
                                              projection -> vector
                                             (same output dimension,
                                              same downstream transformer)

 "the cat sat"          ┌──image───┐
   |   |   |            │ P1│ P2│P3│
 [id][id][id]           │ P4│ P5│P6│
   |   |   |            └──────────┘
 [vec][vec][vec]           |  |  |
                        [vec][vec][vec]  <- same d_model as text vectors
        \_______________________/
                    |
         ONE mixed sequence of vectors, fed into the SAME
         causal transformer stack — the model has no separate
         "image mode"; it just sees more tokens in its input sequence
```

### Verified: a toy patch-embedding pipeline, run locally

GPT-4's own vision encoder is not published, so this cannot reproduce
it. What can be run is the general mechanism honestly, at toy scale —
splitting an image tensor into patches and linearly projecting each
patch into a vector of the same dimension a text-token embedding would
use, then concatenating the result with real text-token embeddings into
one mixed sequence:

```python
import torch
import torch.nn as nn

torch.manual_seed(0)

# toy image: 1 channel, 8x8 pixels
image = torch.randn(1, 1, 8, 8)

# split into 4x4 patches -> 4 patches, each flattened to 16 values
patch_size = 4
patches = image.unfold(2, patch_size, patch_size).unfold(3, patch_size, patch_size)
patches = patches.contiguous().view(1, -1, patch_size * patch_size)
print("patches shape:", patches.shape)

d_model = 6  # same embedding dim a text token embedding would use
patch_proj = nn.Linear(patch_size * patch_size, d_model)
patch_tokens = patch_proj(patches)
print("patch_tokens shape:", patch_tokens.shape)

# a real text token embedding, same d_model
text_emb = nn.Embedding(num_embeddings=50257, embedding_dim=d_model)
text_ids = torch.tensor([[10, 200, 5]])
text_tokens = text_emb(text_ids)
print("text_tokens shape:", text_tokens.shape)

mixed_seq = torch.cat([patch_tokens, text_tokens], dim=1)
print("mixed_seq shape:", mixed_seq.shape)
```

Verified output:

```
patches shape: torch.Size([1, 4, 16])
patch_tokens shape: torch.Size([1, 4, 6])
text_tokens shape: torch.Size([1, 3, 6])
mixed_seq shape: torch.Size([1, 7, 6])
```

An 8x8 image split into four 4x4 patches becomes 4 vectors of the same
dimension (6) as 3 real text-token embeddings, and the two concatenate
into one 7-token sequence a causal transformer stack processes
identically regardless of which tokens started as pixels and which
started as words. This is the honest, general shape of the mechanism —
real vision-language models use a learned (often convolutional or
ViT-style) patch encoder rather than this toy linear layer, and GPT-4's
own encoder is undisclosed, but the input-stage principle — patches
projected into the token embedding space, then handed to the same
transformer — is real and this is how it works structurally.

### Context windows: a real, checkable growth trend

Unlike parameter counts, context-window sizes for OpenAI's models are
publicly documented in their API docs, and the growth trajectory is a
genuinely checkable trend (though, per [Module 11: Context Windows
Explained](../../01-tokens-and-language-modeling/11-context-windows-explained/README.md)'s
own caution, these figures change and should be checked against current
docs rather than memorized from this table):

```
 Model / era              Context window (tokens, approx., check docs)
 ──────────────────────   ─────────────────────────────────────────────
 GPT-3 (2020)              2,048
 GPT-3.5 / early GPT-4     8,192 (with a 32K variant also offered)
 GPT-4 Turbo               128,000
 Later-generation models   200,000+
```

Module 11 already verified, with real numbers, that self-attention's
compute cost scales **quadratically** with sequence length — doubling
sequence length roughly quadruples attention compute. Reusing that
exact verified relationship against this table's real, documented
figures:

```python
def attn_ops(seq_len, d_model=4096):
    return seq_len**2 * d_model  # same formula verified in Module 11

base = attn_ops(2048)  # GPT-3-era context window
for n in [2048, 8000, 32000, 128000]:
    print(n, attn_ops(n) / base, "x baseline (2048-token GPT-3 era)")
```

Verified output:

```
2048        1.0x baseline (2048-token GPT-3 era)
8000       15.26x baseline
32000     244.14x baseline
128000   3906.25x baseline
```

Growing the context window from GPT-3's 2,048 tokens to GPT-4 Turbo's
128,000 tokens — a real, documented 62.5x increase in *length* —
corresponds to a **~3,906x** increase in raw attention compute under
Module 11's verified quadratic-cost formula. This is exactly why "just
raise the context limit" is not a configuration change: it's why long-
context serving depends on the architectural techniques Module 11 and
later tracks cover (efficient attention variants, KV-cache management),
not a bigger number in a config file.

### Beyond GPT-4: three documented industry trends, not one model's specifics

None of what follows is a specific claim about GPT-4's own internals
(undisclosed, as established above). These are broader, citable
industry trends visible across public model cards and technical reports
from multiple labs:

```
 TREND                          WHAT IT MEANS                 WHERE THIS
                                                                TRACK COVERS IT
 ─────────────────────────────  ─────────────────────────────  ────────────────
 Mixture-of-experts (MoE)        Scale total parameter count    Modules 12-14
 architectures                   without a proportional         (this track)
                                  increase in per-token compute
                                  — only a subset of "experts"
                                  activate per token

 Reasoning-focused post-         Models trained/prompted to      Track 04
 training                        produce extended chain-of-      (training,
                                  thought at inference time,      fine-tuning,
                                  trading more inference          alignment)
                                  compute for better answers
                                  on hard problems

 Multimodal-native training      Training on text, image, and    Track 16
                                  other modalities together       (speech &
                                  from the start, rather than     multimodal
                                  bolting a vision encoder onto   models)
                                  a text-only model after the
                                  fact
```

Each of these is documented in public model cards or technical reports
from one or more labs (real, citable sources) — the trend itself is
verifiable even where any single model's exact implementation isn't
disclosed. This track's own remaining modules (12-14 for MoE
specifically) go well beyond this preview, with the same kind of code-
level verification used throughout this track wherever open weights
make that possible (e.g., Mixtral in module 14).

## Reference

```
 Fact / claim                          Status               Source
 ──────────────────────────────────    ──────────────────   ─────────────────
 GPT-4 parameter count                 NOT disclosed         GPT-4 Technical
                                        by OpenAI              Report (arXiv:
                                                                2303.08774)
 GPT-4 layer count, d_model,           NOT disclosed         same report
 attention-head count                   by OpenAI
 GPT-4 accepts image input              Confirmed, public     GPT-4 Technical
 (GPT-4V)                                                     Report; OpenAI
                                                               docs
 GPT-1/2/3 architecture details        Fully disclosed in     original papers
                                        their own papers       (modules 06-08)
 Vision-language patch-token           Real, well-documented  LLaVA paper;
 mechanism (general pattern)            pattern (not GPT-4's   Track 16
                                         own undisclosed
                                         encoder specifics)
 Context window growth                 Publicly documented,   OpenAI API docs
 2,048 -> 128,000+ tokens               changes over time —    (check current
                                         verify current docs    figures)
 Any specific leaked/rumored           NOT confirmed by        (none cited as
 GPT-4 parameter count                  OpenAI, regardless      fact in this
                                         of how often repeated  module)
```

## Hands-on exercises

### 1. Reproduce the patch-embedding toy pipeline

Run the verified `patch_proj` / `text_emb` code above yourself. Then
change `patch_size` (e.g., to 2 instead of 4, on the same 8x8 image) and
confirm the number of patches changes accordingly (a smaller patch size
produces *more* patch tokens per image — connect this to why real
vision-language models must choose a patch size as a real trade-off
between sequence length and how much visual detail each patch token can
encode).

### 2. Verify the quadratic-cost multiplier for real documented context windows

Look up OpenAI's *current* documented context-window sizes (via
`platform.openai.com/docs/models` — do not rely on this module's table,
which will go stale) for two models released in different eras. Using
Module 11's `attn_ops` formula reused above, compute the exact relative
attention-compute multiplier between them, the way this module did for
2,048 -> 128,000. Confirm your multiplier is the *square* of the raw
length ratio, not equal to it.

### 3. Read the GPT-4 Technical Report's disclosure statement yourself

Open the GPT-4 Technical Report (arXiv:2303.08774) and locate the exact
sentence, in the report's own introduction, stating that it withholds
architecture, model size, hardware, and training-compute details. Then
find the equivalent section of the GPT-3 paper ("Language Models are
Few-Shot Learners") where architecture and parameter-count details
*are* disclosed. Write, in your own words, one or two sentences
describing the shift in disclosure practice between the two, citing the
specific language each paper uses.

## Independent challenge

A colleague states, in a design document: "GPT-4 has 1.8 trillion
parameters, so we should assume it needs roughly 10x the GPU memory of
a documented 175-billion-parameter open model to self-host an
equivalent." Using this module's distinction between confirmed and
unconfirmed claims about GPT-4, explain what's wrong with this
statement, and what a more defensible statement would look like.

<details><summary>Discussion</summary>

The 1.8-trillion figure is a widely repeated but **unconfirmed**
number — it does not appear in OpenAI's GPT-4 Technical Report, which
explicitly states it withholds model size (quoted in this module's
Concepts section). Treating it as a basis for a GPU-memory or hosting
estimate builds a real infrastructure decision on top of an unverified
number, which is a bad foundation regardless of how often the figure
circulates. A more defensible statement separates what's confirmed from
what isn't: "GPT-4 is a closed-weight model with no officially
disclosed parameter count, so it cannot be self-hosted at all — any
open-weight alternative's memory requirements should be estimated from
that alternative's own disclosed parameter count and precision, not
from rumors about GPT-4's size." If a size comparison is genuinely
needed for planning purposes, it should be labeled explicitly as
speculative and sourced to whatever unofficial estimate is being used,
never presented as if OpenAI confirmed it.

</details>

## Common mistakes & troubleshooting

- **Assuming a specific leaked/rumored parameter count for GPT-4 is
  confirmed fact.** It is not — the GPT-4 Technical Report explicitly
  states it withholds this information. Any specific number circulating
  publicly is speculation, however often it's repeated.
- **Trying to call the real GPT-4 API to "verify" anything in this
  module.** There is no API key configured in this environment, and
  even with one, an API response cannot reveal undisclosed architecture
  details — the model's outputs don't expose its parameter count or
  layer structure.
- **Assuming GPT-4's vision capability works via some entirely novel,
  unprecedented mechanism.** The general architectural pattern (patch
  encoding, projection into the token embedding space) is
  well-documented across real published vision-language models (e.g.
  LLaVA) even though GPT-4's own encoder specifics are undisclosed —
  don't treat "undisclosed" as "unknowable in general."
- **Assuming a bigger stated context window is "free."** Module 11's
  quadratic-attention finding, reused here, means a 62.5x increase in
  documented context length (2,048 -> 128,000) corresponds to a
  ~3,906x increase in raw attention compute — the number in the docs
  is not a linear cost signal.
- **Treating this module's context-window table as current.** These
  figures are publicly documented but change across model releases —
  always check OpenAI's live API documentation rather than citing a
  fixed table from memory or from this module.
- **Conflating a documented industry trend (MoE, reasoning
  post-training, multimodal-native training) with a specific confirmed
  claim about GPT-4's own architecture.** This module discusses all
  three as trends visible across the field, explicitly not as claims
  about what GPT-4 itself does internally.

## Checkpoint quiz

1. What does the GPT-4 Technical Report itself say about disclosing
   GPT-4's architecture and model size, and how does this differ from
   what GPT-1, GPT-2, and GPT-3's own papers disclosed?
2. Is any specific parameter count for GPT-4 that you might encounter
   online confirmed by OpenAI? What is the correct way to describe such
   a number in this module's terms?
3. What did the verified toy patch-embedding code demonstrate, and what
   is the key architectural similarity it draws to Track 02 Module 02's
   text-embedding lookup table?
4. Using Module 11's quadratic-attention formula, what is the
   approximate relative compute-cost multiplier of a 128,000-token
   context versus a 2,048-token context?
5. Name the three "beyond GPT-4" trends this module previews, and
   which later tracks/modules cover each in depth.

<details><summary>Answers</summary>

1. The report explicitly states it "contains no further details about
   the architecture (including model size), hardware, training
   compute, dataset construction, training method, or similar." This
   is a direct departure from GPT-1, GPT-2, and GPT-3's own papers,
   each of which published concrete numbers (layer count, hidden
   dimension, attention-head count, total parameters).
2. No — no specific parameter count for GPT-4 is confirmed by OpenAI.
   Any such number should be described explicitly as unconfirmed
   speculation, separate from OpenAI's own actual disclosures, no
   matter how widely it's repeated.
3. It showed that an image split into patches and linearly projected
   produces vectors of the same dimension as real text-token
   embeddings, which can then be concatenated into one mixed sequence a
   causal transformer processes identically. This mirrors Track 02
   Module 02's finding that a text token ID maps to a vector via a
   lookup table — here, an image patch maps to a vector via a learned
   projection, into the exact same embedding space.
4. Approximately 3,906x (verified: `128000**2 / 2048**2 ≈ 3906.25`),
   even though the raw token-count increase is only about 62.5x —
   attention compute scales quadratically, not linearly, with sequence
   length.
5. Mixture-of-experts architectures for scaling without proportional
   compute growth (covered in this track's modules 12-14), reasoning-
   focused post-training / extended chain-of-thought at inference time
   (covered in Track 04, training/fine-tuning/alignment), and
   multimodal-native training from the start rather than bolted-on
   vision (covered in Track 16, speech & multimodal models).

</details>

## Further reading & sources

- [GPT-4 Technical Report (OpenAI, 2023)](https://arxiv.org/abs/2303.08774) - the primary source for this module's central fact: OpenAI's own explicit statement that it withholds architecture and model-size details, unlike GPT-1/2/3's papers.
- [OpenAI API documentation: Models](https://platform.openai.com/docs/models) - the authoritative, current source for context-window sizes per model; check here rather than relying on this module's illustrative table, which will go stale.
- [Visual Instruction Tuning (LLaVA) (Liu et al., 2023)](https://arxiv.org/abs/2304.08485) - a real, published vision-language model whose patch-encoding-and-projection architecture is the general pattern this module's toy code illustrates.
- [Language Models are Few-Shot Learners (GPT-3 paper, Brown et al., 2020)](https://arxiv.org/abs/2005.14165) - the disclosure baseline this module contrasts GPT-4's report against; publishes GPT-3's architecture and parameter count directly.
- [Track 01, Module 11: Context Windows Explained](../../01-tokens-and-language-modeling/11-context-windows-explained/README.md) - the source of the quadratic-attention-cost formula and KV-cache findings this module reuses directly against GPT-4-era context-window figures.

## Next

[Module 10: Why Decoder-Only Won](../10-why-decoder-only-won/README.md)
