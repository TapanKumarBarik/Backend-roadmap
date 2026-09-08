# Module 06: Instruction Tuning

## Why this matters

Module 05 established supervised fine-tuning (SFT) as the general
mechanism: take a pretrained base model and continue training it on
labeled (input, output) pairs with a supervised loss, instead of the
raw next-token prediction over unstructured text that pretraining
uses. That mechanism doesn't care what the pairs *are* — they could be
a single narrow task's examples, a specific document format, anything.
**Instruction tuning is what happens when you point that exact
mechanism at a large, deliberately diverse collection of (instruction,
response) pairs spanning many different task types** — summarization,
translation, question answering, list-making, classification, rewriting,
and so on — all formatted consistently, usually with explicit role
markers (system/user/assistant). The mechanism from module 05 doesn't
change; what changes is the *data's* diversity and structure, and the
resulting capability the model acquires: not "do this one task well,"
but "read a natural-language instruction, of essentially any shape,
and follow it." That capability is the difference between a base
language model — which only knows how to continue text plausibly —
and something that behaves like an assistant. This module makes that
difference concrete with a real, honest comparison: the exact same
instruction-shaped prompt fed to a base GPT-2 (never instruction-tuned)
and to a real cached instruction-tuned model, with real generated text
from both.

## Concepts

### SFT is the mechanism; instruction tuning is a specific data strategy applied to it

```
 Module 05 (SFT): general mechanism
 ─────────────────────────────────────────────────────────
 pretrained base model --[supervised loss on ANY (input,output) pairs]--> fine-tuned model
                                     ▲
                                     │  the exact same training procedure
                                     │
 Module 06 (instruction tuning): a specific, deliberate DATA strategy
 ─────────────────────────────────────────────────────────
 pairs drawn from MANY task types, one consistent format:
   "Summarize this: ..."          -> one-sentence summary
   "Translate to French: ..."     -> translation
   "List three ...: ..."          -> a formatted list
   "Is this review positive?: ..." -> classification label
   ...hundreds/thousands of task types, same instruction-shaped format...

 RESULT: not "good at one task" but "follows instructions in general" —
 a qualitatively different capability than task-specific SFT produces
```

The instruction-tuned model in this module, `Qwen/Qwen2.5-0.5B-Instruct`,
went through exactly this: a pretrained base Qwen2.5-0.5B was tuned on
large, diverse instruction-following datasets (and further alignment
steps this track covers in later modules — modules 08-11). The base
`gpt2` used for comparison here never went through anything like this
— it only ever saw pretraining's raw next-token objective (module 02)
on unstructured web text.

### Verified: the same instruction-shaped prompt, base model vs. instruction-tuned model

Both models get the identical instruction, worded exactly the same
way. `gpt2` gets it as plain text (it has no chat template — it was
never trained to expect one). The instruction-tuned model gets it
through its real chat template via `tokenizer.apply_chat_template`,
which is itself part of what instruction tuning teaches a model to
expect: a consistent role-marked format (`<|im_start|>system` /
`user` / `assistant`) rather than raw text.

```python
import torch
from transformers import AutoTokenizer, AutoModelForCausalLM

torch.manual_seed(0)
prompt_text = (
    "Summarize this in one sentence: The new library branch opens next "
    "Monday. It will have a childrens reading room, twenty public "
    "computers, and a cafe on the ground floor. Parking is limited to "
    "two hours."
)

# --- base GPT-2: plain text continuation, no chat template, never instruction-tuned ---
gpt2_tok = AutoTokenizer.from_pretrained("gpt2")
gpt2 = AutoModelForCausalLM.from_pretrained("gpt2")
gpt2.eval()
inputs = gpt2_tok(prompt_text, return_tensors="pt")
out = gpt2.generate(**inputs, max_new_tokens=40, do_sample=False,
                     pad_token_id=gpt2_tok.eos_token_id)
print(gpt2_tok.decode(out[0][inputs["input_ids"].shape[1]:], skip_special_tokens=True))
```

Verified output:

```
The library branch is open to the public, but the cafe is open to the public.

The library branch is open to the public, but the cafe is open to the public.
```

GPT-2 doesn't summarize. It continues the text the way a plausible
next sentence would continue in similar web text it was pretrained
on — restating a detail, then repeating itself almost verbatim. There
is no summarization *behavior* here, because nothing ever taught the
base model what "summarize this" as an instruction should cause it to
do; pretraining only ever taught it to predict likely next tokens.

Now the identical instruction, through the real cached instruction-tuned
model, using its real chat template:

```python
qwen_tok = AutoTokenizer.from_pretrained("Qwen/Qwen2.5-0.5B-Instruct")
qwen = AutoModelForCausalLM.from_pretrained("Qwen/Qwen2.5-0.5B-Instruct")
qwen.eval()

messages = [{"role": "user", "content": prompt_text}]
chat_input = qwen_tok.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)
print(chat_input)
```

Verified output (the real templated prompt actually fed to the model):

```
<|im_start|>system
You are Qwen, created by Alibaba Cloud. You are a helpful assistant.<|im_end|>
<|im_start|>user
Summarize this in one sentence: The new library branch opens next Monday. It will have a childrens reading room, twenty public computers, and a cafe on the ground floor. Parking is limited to two hours.<|im_end|>
<|im_start|>assistant

```

```python
inputs = qwen_tok(chat_input, return_tensors="pt")
out = qwen.generate(**inputs, max_new_tokens=40, do_sample=False,
                     pad_token_id=qwen_tok.eos_token_id)
print(qwen_tok.decode(out[0][inputs["input_ids"].shape[1]:], skip_special_tokens=True))
```

Verified output:

```
The new library branch opens next Monday with various amenities including a children's reading room, twenty public computers, and a cafe, but parking is limited to two hours.
```

This is a real, one-sentence summary — it compresses every fact from
the source into a single sentence, exactly what the instruction asked
for. Same weights architecture family, same decoding settings
(greedy, `do_sample=False`), same instruction wording. The only
difference between the two runs is what training the two models went
through, and the result is the entire point of instruction tuning made
concrete: one model follows the instruction's *intent and format*; the
other statistically continues the *text*.

### Verified: a second instruction, same pattern

To confirm this isn't a one-off cherry-picked example, the same
comparison with a different instruction type (list-making instead of
summarization):

```python
prompt_text2 = "List three benefits of regular exercise."
# ... same generation code as above, applied to both models
```

Verified output (GPT-2 base):

```
1. Regular exercise improves your health and well-being.

Regular exercise improves your health and well-being. It improves your overall health and well-being.

It improves
```

Verified output (Qwen2.5-0.5B-Instruct):

```
Regular exercise has numerous benefits for both physical and mental health. Here are three key advantages:

1. Improved Physical Health: Regular exercise helps to strengthen the heart, lungs, and muscles, which can lead to better cardiovascular health, lower blood pressure, and improved lung function. It also strengthens bones and muscles
```

GPT-2 produces a numbered "1." — a superficial format echo it likely
picked up statistically from list-shaped text in its pretraining data
— but then degenerates into repeating the same sentence rather than
producing three distinct items. The instruction-tuned model
recognizes "three" as a real constraint on the response's structure
and begins building a properly delineated, substantive list. Two
different instruction types, the same qualitative gap both times.

### What instruction tuning does *not* by itself guarantee

It's worth being precise about what this module has and hasn't shown.
Instruction tuning teaches format- and intent-following across diverse
task types — it does not by itself guarantee the response is *safe*,
*harmless*, *unbiased*, or optimally *helpful* by human preference
standards. Those are the specific concerns modules 08-11 (reward
models, RLHF/PPO, DPO, Constitutional AI/RLAIF) address on top of an
already instruction-tuned model. Qwen's response above is a genuinely
good summary — that's instruction tuning's contribution — but nothing
in this module's comparison touched preference alignment at all.

## Reference

```
 Term                    Meaning
 ──────────────────────  ──────────────────────────────────────────────
 Base model               A model that has only been pretrained (module
                          02's objective) — continues text statistically,
                          has no notion of "instruction" as a category
 Instruction tuning       SFT (module 05's mechanism) applied to a large,
                          diverse set of (instruction, response) pairs
                          spanning many task types in one consistent
                          format — not a different training algorithm,
                          a different DATA strategy
 Chat template            A model-specific, deterministic function
                          (`apply_chat_template`) that renders role-
                          marked messages (system/user/assistant) into
                          the exact text format the model was tuned to
                          expect — verified above for Qwen's real
                          `<|im_start|>...<|im_end|>` format
 Instruction-following    The capability this module verified directly:
                          recognizing an instruction's intent/format
                          (e.g. "one sentence," "three items") and
                          shaping the response to match it
 Task diversity           The property that separates instruction tuning
                          from ordinary task-specific SFT — many task
                          types in training produce general instruction-
                          following, not just skill at one task
```

## Hands-on exercises

### 1. Reproduce the comparison with a task type not shown above

Pick an instruction type not used in this module's verified examples —
e.g. "Rewrite this sentence in a formal tone: ...", "Classify this
review as positive or negative: ...", or "Extract the date mentioned
in this text: ...". Run it through both `gpt2` and
`Qwen/Qwen2.5-0.5B-Instruct` (via its chat template) with identical
decoding settings (`do_sample=False`, same `max_new_tokens`). Confirm
the same qualitative pattern holds: the instruction-tuned model
addresses the instruction's actual ask; the base model continues the
text.

### 2. Vary the chat template's system message and observe the effect

Change the `messages` list to prepend a custom system message (e.g.
`{"role": "system", "content": "Answer in exactly one word."}`) before
the same user instruction. Re-run generation on
`Qwen/Qwen2.5-0.5B-Instruct` and confirm the system message's
constraint is reflected in the real generated output — evidence that
the model was tuned to treat the system role as carrying real
instruction weight, not just as inert text.

### 3. Feed the raw chat-template text into GPT-2 as plain text

Take the exact rendered chat-template string (the
`<|im_start|>system...` block from the verified output above) and feed
it as plain text input to `gpt2` instead of Qwen. Confirm GPT-2's
output is no better-formed than its plain-prompt output earlier in this
module — the special tokens and role markers carry no meaning for a
model that was never trained on that format; the improvement Qwen
showed came from what it was *trained on*, not from the template text
itself being special.

## Independent challenge

A teammate says: "I don't need instruction tuning — I'll just write a
really detailed prompt, and any pretrained base model will follow it
if the prompt is clear enough." Using this module's verified
comparison, evaluate that claim.

<details><summary>Discussion</summary>

The claim conflates prompt clarity with a model's *trained capability*
to act on instructions at all. This module's verified example used an
unambiguous, clearly worded instruction — "Summarize this in one
sentence: ..." — and GPT-2 still didn't summarize; it restated and
then repeated a detail from the source text, because nothing in its
training ever associated the *word* "summarize" (or any instruction
verb) with the *behavior* of compressing text down to its key points.
A clearer prompt cannot manufacture a behavior the model was never
trained to produce — pretraining's objective (module 02) only ever
rewards predicting the next plausible token in text resembling its
training distribution, and "restate a detail from a news-like
paragraph" is a perfectly plausible continuation by that standard.
Instruction tuning is precisely what closes this gap: training on
diverse (instruction, response) pairs teaches the association between
an instruction's surface form and the expected response shape, which
is exactly what let `Qwen/Qwen2.5-0.5B-Instruct` produce a real,
correctly-scoped one-sentence summary from the identical wording. Very
large, sufficiently pretrained base models can sometimes exhibit
partial instruction-following through few-shot prompting or emergent
behavior at scale — a caveat worth raising back — but this module's
verified comparison used prompting alone (zero-shot, no examples) and
showed a clean, large gap on a small base model, which is the common
case a team actually building on a small or self-hosted base model
will hit.

</details>

## Common mistakes & troubleshooting

- **Assuming instruction tuning is a different training algorithm than
  SFT.** It is the same supervised mechanism module 05 covers, applied
  to a deliberately diverse instruction-shaped dataset. The novelty is
  in the data, not the loss function or optimizer.
- **Feeding a base model's raw pretraining-style prompt to an
  instruction-tuned model, or vice versa.** This module's Qwen prompt
  went through `apply_chat_template` — feeding plain, untemplated text
  to an instruction-tuned model (skipping the template) routinely
  produces worse, less-controlled output than following its expected
  format, because the model was tuned to expect that structure.
- **Believing a clearer prompt substitutes for instruction tuning.**
  As the independent challenge covers, prompt clarity cannot manufacture
  a trained behavior a base model never acquired — GPT-2's failure
  above used an unambiguous instruction.
- **Treating "instruction-tuned" as synonymous with "aligned" or
  "safe."** Instruction tuning teaches format/intent-following across
  task diversity; it says nothing about preference alignment,
  harmlessness, or honesty by itself — those are modules 08-11's
  concern, layered on top.
- **Forgetting `add_generation_prompt=True`.** Omitting it when calling
  `apply_chat_template` leaves off the trailing
  `<|im_start|>assistant\n` marker that tells the model it's now its
  turn to respond, which can produce degenerate or empty completions
  even from a genuinely instruction-tuned model.

## Checkpoint quiz

1. What specifically changes between plain SFT (module 05) and
   instruction tuning — the training mechanism, or the data?
2. In this module's verified summarization example, what did GPT-2
   actually produce instead of a summary, and why, given what
   pretraining's objective (module 02) actually rewards?
3. What real, concrete difference did `apply_chat_template` make to
   the text actually fed into the instruction-tuned model, verified in
   this module's output?
4. Why does a single clear instruction-shaped prompt fail to make a
   base model behave like an instruction-tuned one, per this module's
   verified comparison?
5. Name one thing instruction tuning does NOT by itself guarantee,
   and which later modules in this track address it.

<details><summary>Answers</summary>

1. The data. The training mechanism is the same supervised fine-tuning
   procedure from module 05; instruction tuning applies it to a large,
   diverse collection of (instruction, response) pairs spanning many
   task types in one consistent format, rather than to task-specific
   pairs.
2. It restated a detail from the source text and then repeated the
   same sentence almost verbatim, rather than compressing the passage
   into one sentence. This happens because pretraining only ever
   rewards predicting the next plausible token given prior text — a
   plausible continuation of a news-like paragraph, not "compress this
   down to its key point" — since GPT-2 was never trained on data that
   associated the word "summarize" with that specific behavior.
3. It rendered the plain user instruction into the model's exact
   expected format: role-marked blocks (`<|im_start|>system`, `user`,
   `assistant`) with a fixed system message, ending in an
   `<|im_start|>assistant` marker signaling it's the model's turn to
   respond — verified directly in this module's printed templated
   prompt.
4. Because prompt clarity cannot manufacture a behavior the model was
   never trained to produce; this module's summarization instruction
   was already unambiguous, and GPT-2 still didn't summarize — the gap
   is in what the model's training taught it to do with instruction-
   shaped text, not in how clearly the instruction was worded.
5. It does not guarantee safety, harmlessness, or alignment with human
   preferences. Modules 08 (reward models), 09 (RLHF/PPO), 10 (DPO),
   and 11 (Constitutional AI/RLAIF) address preference alignment on
   top of an already instruction-tuned model.

</details>

## Further reading & sources

- [Finetuned Language Models Are Zero-Shot Learners (Wei et al., 2021 — the FLAN paper)](https://arxiv.org/abs/2109.01652) - one of the original papers demonstrating that fine-tuning on a large mixture of instruction-phrased tasks produces generalized zero-shot instruction-following, the core claim this module verifies with real generations.
- [Training language models to follow instructions with human feedback (Ouyang et al., 2022 — the InstructGPT paper)](https://arxiv.org/abs/2203.02155) - the paper that popularized "instruction tuning + RLHF" as a pipeline; its SFT stage is exactly this module's subject, and its later stages are modules 08-09.
- [Qwen2.5 Technical Report](https://arxiv.org/abs/2412.15115) - documents the real training pipeline (including instruction tuning) behind `Qwen/Qwen2.5-0.5B-Instruct`, the actual model used in this module's verified comparison.
- [Hugging Face: Chat Templates documentation](https://huggingface.co/docs/transformers/main/en/chat_templating) - the real API (`apply_chat_template`) this module uses to render Qwen's instruction format, with the mechanics of how role-marked messages become model input text.

## Next

[Module 07: Building a Fine-Tuning Dataset](../07-building-a-fine-tuning-dataset/README.md)
