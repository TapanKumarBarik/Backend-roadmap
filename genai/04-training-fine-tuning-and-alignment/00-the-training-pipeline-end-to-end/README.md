# Module 00: The Training Pipeline End to End

## Why this matters

Track 03 ended with a capstone that built, fine-tuned, and compared real
architectures — an encoder-only model fine-tuned on a real task, a
decoder-only model doing the same task through pure in-context
learning with zero weight updates, and a from-scratch MoE layer with a
working load-balancing loss. That capstone's whole premise was that you
already had *architectures that work* — the question was how to apply
them. This track asks a different, earlier question: how does a
transformer with **freshly initialized, random weights** — the same
shape of model Track 02 built from scratch, before any of it had ever
seen a real sentence — become a model that can do any of that in the
first place?

The honest answer is a pipeline with several distinct stages, each
solving a different problem, and each covered by its own module in this
track. Skipping straight to "fine-tune it on your task" without
understanding what came before makes half of this track's later
decisions (why does LoRA work at all? why does DPO need a
reference model? why is instruction-tuned GPT-2 still not
"aligned"?) look arbitrary instead of load-bearing. This module's job
is to lay out the whole pipeline once, name every stage precisely, and
prove — with a real, run model — exactly why the first stage
(pretraining) alone is not enough to produce something you'd want to
actually talk to.

## Concepts

### The full pipeline, stage by stage

A large language model as most people use it today (a chat assistant
answering questions) is the product of several distinct training
stages stacked on top of each other, not one training run:

```
 STAGE 0: random init            STAGE 1: PRETRAINING
 ┌──────────────────┐            ┌──────────────────────────┐
 │ random weights,   │  ───────► │ next-token prediction on │
 │ no language       │           │ raw internet-scale text  │
 │ ability at all    │           │ (modules 01-04)           │
 └──────────────────┘            └──────────────────────────┘
                                              │
                                              ▼
                                   "BASE MODEL" / "FOUNDATION MODEL"
                                   fluent, knowledgeable, but NOT an
                                   assistant — completes text, doesn't
                                   follow instructions reliably
                                              │
                                              ▼
                          STAGE 2: SUPERVISED FINE-TUNING (SFT)
                          ┌──────────────────────────────────┐
                          │ train on (instruction, response)  │
                          │ pairs written/curated by humans   │
                          │ (modules 05-07)                    │
                          └──────────────────────────────────┘
                                              │
                                              ▼
                                   "INSTRUCT MODEL" / "CHAT MODEL"
                                   follows instructions, but its
                                   notion of "good response" is
                                   whatever the SFT data happened
                                   to contain
                                              │
                                              ▼
                       STAGE 3: PREFERENCE ALIGNMENT (RLHF / DPO)
                       ┌──────────────────────────────────────┐
                       │ train a reward model on human         │
                       │ preference pairs, then optimize        │
                       │ the policy against it (RLHF/PPO) —      │
                       │ or skip the reward model and optimize   │
                       │ preferences directly (DPO)               │
                       │ (modules 08-11)                          │
                       └──────────────────────────────────────┘
                                              │
                                              ▼
                                   "ALIGNED MODEL"
                                   prefers responses humans (or an
                                   AI proxy, module 11) actually rate
                                   as helpful/honest/harmless — not
                                   just "some valid instruction
                                   response"
                                              │
                                              ▼
              STAGE 4 (OPTIONAL, FOR DEPLOYMENT): PEFT / QUANTIZATION
              ┌────────────────────────────────────────────────┐
              │ LoRA/QLoRA to fine-tune cheaply (modules 12-14),  │
              │ INT8/INT4/GGUF quantization to serve cheaply       │
              │ (module 15)                                          │
              └────────────────────────────────────────────────┘
```

Every arrow is a real, separate training run with its own objective,
its own data format, and its own failure modes — this track dedicates
at least one module to each stage. Nothing about the pipeline is
optional in practice if the goal is a usable assistant: a raw
pretrained base model, run through none of stages 2-3, is what the
verified example below shows.

### Vocabulary this whole track uses

Four terms get used precisely and often from here on, and they are not
interchangeable:

- **Foundation model** — the broadest term. Any large model
  pretrained on broad data that serves as a starting point for further
  training or adaptation. A foundation model can be a base model, an
  instruct model, or an aligned model — "foundation model" describes
  its role (a foundation to build on), not which stage it's at.
- **Base model** — specifically, a model that has been through
  pretraining (Stage 1) and **nothing else**. It has broad knowledge
  and fluent language ability, but no training signal that ever told
  it "when given an instruction, produce a helpful response in this
  format." `gpt2` (as loaded from the Hugging Face Hub, with no
  further fine-tuning applied) is a base model. So is raw GPT-3 before
  InstructGPT's SFT/RLHF stages were applied to it.
- **Instruct model / chat model** — a base model that has additionally
  been through SFT (Stage 2): trained on (instruction, response) pairs
  so it reliably produces an on-format response to an instruction-
  shaped prompt, rather than just continuing the text statistically.
  Module 05 (this track) produces a small, real instance of exactly
  this transition.
- **Aligned model** — an instruct model that has additionally been
  through preference alignment (Stage 3: RLHF, DPO, or a related
  method). "Aligned" here means something specific and narrower than
  its colloquial use: the model's outputs have been optimized against
  a signal of human (or AI, per module 11) *preference* between
  candidate responses — not merely "produces a validly-formatted
  response," which SFT alone already achieves.

### Verified: a base model asked to follow an instruction

`gpt2` as distributed is a **base model** in the precise sense above —
pretrained (Stage 1) only, never fine-tuned on instructions. Prompting
it with an instruction-shaped prompt, exactly the way you'd prompt a
real chat model:

```python
import torch
from transformers import AutoTokenizer, AutoModelForCausalLM

torch.manual_seed(0)
tok = AutoTokenizer.from_pretrained('gpt2')
model = AutoModelForCausalLM.from_pretrained('gpt2')
model.eval()

prompt = (
    "Instruction: Write a short, polite email to a colleague asking to "
    "reschedule tomorrow's meeting to Thursday.\nResponse:"
)
inputs = tok(prompt, return_tensors='pt')
with torch.no_grad():
    out = model.generate(
        **inputs, max_new_tokens=40, do_sample=False, num_beams=1,
        pad_token_id=tok.eos_token_id,
    )
print(tok.decode(out[0], skip_special_tokens=True))
```

Verified output:

```
Instruction: Write a short, polite email to a colleague asking to reschedule tomorrow's meeting to Thursday.
Response: I'm sorry, but I'm not sure how to respond to your email. I'm not sure how to respond to your email.
I'm sorry, but I'm not sure how to respond
```

This is exactly what the vocabulary above predicts, verified rather
than asserted: `gpt2` did not refuse, and it did not produce garbage —
pretraining (Stage 1) gave it real, fluent English and the general
shape of "a Response: follows an Instruction:". But it did not write an
email. It produced a generic, repetitive, non-answering continuation,
because nothing in pretraining ever taught it "instructions should be
*satisfied*," only "predict what text plausibly follows this text."
124,439,808 real parameters (this is the real GPT-2-small parameter
count, loaded and counted, not a spec-sheet number) of fluent language
modeling, and still no email — that gap is precisely what modules
05-11 exist to close, and Module 05 later in this same track closes
the first, smallest piece of it directly: fine-tuning this exact model
on a handful of instruction/response pairs and checking, with real
before/after output, that its completions change shape.

### Why the stages can't be reordered or skipped

Each stage depends on what the previous one already established:

- SFT (Stage 2) needs a model that already has broad language and
  world knowledge to fine-tune *toward* a response format — training
  the instruction-following behavior from random weights, on the
  comparatively tiny amount of curated instruction data that SFT
  datasets contain (module 07), would not produce a competent model;
  there simply isn't enough data at that stage to teach language from
  scratch.
- Preference alignment (Stage 3) needs a model that already reliably
  produces on-format, on-topic responses (from SFT) before "which of
  these two valid responses do humans prefer" is even a coherent
  question to optimize — you cannot meaningfully rank the "helpfulness"
  of two responses if the model doesn't yet reliably produce responses
  at all.
- PEFT/quantization (Stage 4) is an optional, orthogonal concern about
  *how* you run Stages 2-3 cheaply (LoRA, module 12) or how you serve
  the final result cheaply (quantization, module 15) — it is not a
  stage that produces new capabilities, which is why it's marked
  optional in the diagram rather than a required fourth step.

## Reference

```
 Term                    Meaning
 ──────────────────────  ────────────────────────────────────────────
 Foundation model         Broadest term: any large model pretrained
                          on broad data as a starting point for
                          further use — role, not pipeline stage
 Base model                A model that has been through pretraining
                          only (Stage 1) — fluent, knowledgeable, not
                          instruction-following. Verified above: gpt2
 Pretraining               Stage 1: next-token prediction on raw,
                          massive text (modules 01-04)
 SFT (supervised           Stage 2: fine-tuning on curated
 fine-tuning)              (instruction, response) pairs (modules
                          05-07) — produces an instruct/chat model
 Instruct / chat model     A base model + SFT: reliably follows
                          instruction-shaped prompts
 Preference alignment      Stage 3: RLHF (reward model + PPO,
                          modules 08-09) or DPO/simpler alternatives
                          (modules 10-11) — optimizes toward
                          preferred, not just valid, responses
 Aligned model              An instruct model + preference alignment
 PEFT                       Parameter-efficient fine-tuning — LoRA
                          (module 12), QLoRA (module 13): fine-tune
                          by training a small fraction of parameters
 Quantization               Reducing numerical precision of trained
                          weights (INT8/INT4/GGUF, module 15) to
                          shrink memory/compute at inference time
```

## Hands-on exercises

### 1. Reproduce the base-model instruction gap on a different prompt

Using the verified code above, swap the prompt for a different
instruction shape — e.g. "Instruction: Summarize the plot of Romeo and
Juliet in two sentences.\nResponse:". Run it against `gpt2` with
`do_sample=False` and record the real output. Confirm it shows the same
pattern (fluent but non-answering, or repetitive) rather than a
correct summary.

### 2. Compare `gpt2` and `gpt2-medium` on the same instruction prompt

Load `gpt2-medium` (a larger base model, also never instruction-tuned)
and run the exact same prompt from the verified example. Record its
real output alongside `gpt2`'s. Confirm that a larger base model is
*not* automatically an instruction-follower — size alone doesn't
substitute for the SFT stage this module identifies as missing.

### 3. Map every stage to this track's module numbers, from memory

Without looking back at this module's diagram, write out the four
pipeline stages in order and, for each, name which module(s) in this
track cover it. Then check your answer against the Reference table and
diagram above. Getting this right is what makes the rest of this
track's modules feel like a connected sequence rather than 18
disconnected topics.

## Independent challenge

A teammate says: "GPT-2 is a language model, ChatGPT is a language
model, so fine-tuning GPT-2 on some chat transcripts should turn it
into a mini-ChatGPT." Using this module's verified finding and its
four-stage pipeline, evaluate this claim: what's right about it, what's
missing, and what would you actually need to do (naming the specific
stages) to get closer to what your teammate is imagining?

<details><summary>Discussion</summary>

What's right: both are decoder-only transformer language models, and
fine-tuning GPT-2 on chat-formatted (instruction, response) transcripts
is a real, correct description of Stage 2 (SFT) — this is exactly
module 05's exercise later in this track, and it does measurably shift
GPT-2's completions toward the target style, as its own verified
before/after generations show. What's missing: "some chat transcripts"
alone gets you an instruct/chat model, not what most people mean by
"ChatGPT-like" — a model whose responses have additionally been
optimized against human *preference* judgments (Stage 3: RLHF or DPO),
which is a separate training stage requiring separate data (preference
comparisons between candidate responses, module 08) and a separate
objective (module 09's PPO loop or module 10's DPO loss) beyond plain
next-token prediction on transcripts. This module's own verified
result — a base GPT-2 producing fluent but non-answering text on an
instruction prompt — is the "before" state; SFT alone (module 05)
closes the "does it follow instructions at all" gap; it does not, by
itself, close the "does it prefer helpful/honest/harmless responses
over merely valid ones" gap, which is what Stage 3 exists for. A
faithful answer names both stages and is honest that "some chat
transcripts" alone reproduces only the first.

</details>

## Common mistakes & troubleshooting

- **Treating "base model" and "foundation model" as synonyms for
  "pretrained-only."** Foundation model is the broader umbrella term
  (any model, at any pipeline stage, meant as a starting point); base
  model specifically means pretraining-only, nothing further applied.
  An instruct model is still built on a foundation model, but it is not
  a base model anymore.
- **Assuming a bigger base model automatically follows instructions
  better.** Exercise 2 exists specifically to test and refute this —
  scale improves pretraining's own objective (fluency, knowledge
  recall), it does not substitute for the SFT stage that teaches
  "satisfy the instruction" as a behavior.
- **Assuming SFT alone produces an "aligned" model.** SFT (Stage 2)
  and preference alignment (Stage 3) are different training stages
  with different data and different objectives. An instruct model can
  reliably follow instructions and still not be what most people mean
  by "aligned" — that's specifically Stage 3's job (modules 08-11).
- **Assuming pretraining "already contains" instruction-following,
  just waiting to be unlocked by prompting.** The verified example
  shows the opposite for `gpt2`: prompting alone, with no fine-tuning,
  produced a generic non-answer. (Very large modern base models can
  sometimes follow simple instructions somewhat via in-context
  learning/few-shot prompting — a separate phenomenon from Track 03 —
  but that's not what plain zero-shot prompting of `gpt2` demonstrates
  here, and it's not a substitute for SFT at any scale for reliable
  behavior.)
- **Treating PEFT/quantization (Stage 4) as a required pipeline
  stage.** It's marked optional in this module's diagram deliberately —
  it's a *how to do Stages 2-3 cheaply / how to serve the result
  cheaply* concern, not a stage that changes what the model has
  learned to do.

## Checkpoint quiz

1. Name the four pipeline stages in order, and which module range in
   this track covers each.
2. What precisely distinguishes a "base model" from a "foundation
   model" as this module defines the terms?
3. In the verified example, `gpt2` produced fluent, grammatical, but
   non-answering text for an instruction prompt. What does that
   specifically demonstrate about what pretraining does and does not
   teach a model?
4. Why can't preference alignment (Stage 3) be run before SFT (Stage
   2), per this module's dependency argument?
5. Is quantization (module 15) a required stage in the pipeline
   diagram? Why or why not?

<details><summary>Answers</summary>

1. Stage 1: Pretraining (modules 01-04). Stage 2: Supervised
   fine-tuning / SFT (modules 05-07). Stage 3: Preference alignment —
   RLHF or DPO/alternatives (modules 08-11). Stage 4 (optional):
   PEFT/quantization for cheap fine-tuning and deployment (modules
   12-15).
2. "Foundation model" is the broad umbrella term for any large
   pretrained model used as a starting point, regardless of what
   further training (if any) has been applied to it. "Base model" is
   the narrower, specific claim that a model has been through
   pretraining *only* — no SFT, no preference alignment. Every base
   model is a foundation model; not every foundation model is a base
   model (an instruct or aligned model is also a foundation model in
   the broad sense, but not a base model).
3. It shows pretraining teaches fluent language production and broad
   world/text knowledge (the output was grammatical English, not
   garbage), but does not teach the model to *satisfy* an instruction
   — the model continued the text plausibly rather than producing the
   requested email, because next-token prediction on raw text never
   trained it that "Response:" should contain a response that actually
   does what "Instruction:" asked.
4. Because preference alignment optimizes *which of several candidate
   responses* is preferred, which presupposes the model already
   reliably produces on-format, on-topic candidate responses in the
   first place — a capability only SFT establishes. Without SFT first,
   there isn't yet a coherent "which valid response do you prefer"
   comparison to optimize against.
5. No — it's explicitly marked optional in the diagram. It doesn't
   teach the model any new capability the way Stages 1-3 do; it's a
   parameter-efficiency (LoRA/QLoRA, modules 12-13) or deployment-
   efficiency (INT8/INT4/GGUF, module 15) concern about *how* to run
   fine-tuning or inference cheaply, layered on top of whatever the
   required stages already produced.

</details>

## Further reading & sources

- [Language Models are Few-Shot Learners (Brown et al., 2020)](https://arxiv.org/abs/2005.14165) - the GPT-3 paper; documents a large base model's behavior before any instruction-tuning or RLHF stage was applied, the same "base model" category this module's verified `gpt2` example illustrates at small scale.
- [Training language models to follow instructions with human feedback (Ouyang et al., 2022)](https://arxiv.org/abs/2203.02155) - the InstructGPT paper: the canonical description of the SFT-then-RLHF pipeline this module's diagram summarizes, applied at production scale.
- [Hugging Face: `gpt2` model card](https://huggingface.co/openai-community/gpt2) - the exact base-model checkpoint this module loads and prompts; its own model card documents it as pretrained-only, with no instruction-tuning applied.

## Next

[Module 01: Pretraining Data: Collection and Cleaning](../01-pretraining-data-collection-and-cleaning/README.md)
