# Module 14: Running a Real Fine-Tune

## Why this matters

Modules 12 and 13 verified LoRA and quantization as isolated
mechanisms — real parameter counts, real byte sizes, real gradients
reaching the right tensors. Neither module actually trained a model to
do something it couldn't do before. This module closes that gap: a
complete, real, followable fine-tuning run, start to finish, on a real
model, with a real (if intentionally narrow and tiny) task, real loss
values printed at each step, and a genuine before/after generation
comparison on a prompt the model never saw during training. Every
number below came from actually running the code in this CPU-only
sandbox — there is no held-back result, and the loss curve and
generations are exactly what this specific run produced.

## Concepts

### The task: a narrow, verifiable format-conversion problem

Real fine-tuning projects need a task with a clear right answer to
measure against. This module hand-writes six short examples that
convert a casual product note into a strict, structured record — a
"new output format" task, deliberately not a "new facts" task (module
16 formalizes exactly this distinction):

```
 INPUT (a casual note)                      TARGET (strict structured output)
 ─────────────────────────────────────────  ─────────────────────────────────────────
 "Note: red running shoes, size 10,   ->     " ITEM: running shoes | COLOR: red |
  $59.99, in stock"                            SIZE: 10 | PRICE: 59.99 | STOCK: yes"
```

Six such pairs are used for training; a **seventh, held-out** note
("yellow rain boots, size 8, $27.50, in stock") is never shown during
training and is used only to check whether the model generalizes the
*pattern*, not just memorizes the six training strings verbatim.

### Step 1 — verified: the base model, unmodified, does not know this format

```python
from transformers import AutoModelForCausalLM, AutoTokenizer

MODEL_NAME = "gpt2"
tokenizer = AutoTokenizer.from_pretrained(MODEL_NAME)
tokenizer.pad_token = tokenizer.eos_token
base_model = AutoModelForCausalLM.from_pretrained(MODEL_NAME)
base_model.eval()

HELD_OUT_PROMPT = "Note: yellow rain boots, size 8, $27.50, in stock\n->"

def generate(model, prompt, max_new_tokens=20):
    ids = tokenizer(prompt, return_tensors="pt")
    out = model.generate(**ids, max_new_tokens=max_new_tokens, do_sample=False,
                          pad_token_id=tokenizer.eos_token_id)
    return tokenizer.decode(out[0][ids["input_ids"].shape[1]:], skip_special_tokens=True)

print("BEFORE fine-tuning:", repr(generate(base_model, HELD_OUT_PROMPT)))
```

Verified output:

```
BEFORE fine-tuning: '\n\nThe first time I saw this, I was so excited. I was so excited to see'
```

Plain, unmodified gpt2 has no idea this is supposed to be a structured
record — it does what a generic language model does with an
open-ended prompt: continues it as ordinary prose.

### Step 2 — verified: attach a real `peft` LoRA adapter (module 12's mechanism, in practice)

```python
from peft import LoraConfig, get_peft_model

lora_config = LoraConfig(
    r=8, lora_alpha=16, target_modules=["c_attn"], lora_dropout=0.05,
    bias="none", task_type="CAUSAL_LM",
)
model = get_peft_model(base_model, lora_config)
model.print_trainable_parameters()
```

Verified output:

```
trainable params: 294,912 || all params: 124,734,720 || trainable%: 0.2364
```

The exact same number module 12 verified independently — 0.24% of
gpt2's parameters are trainable here. Everything from this point
forward trains only those 294,912 numbers.

### Step 3 — verified: a real training loop, real loss printed every few steps

Each example's loss is computed only on the *target* tokens (the
prompt tokens are masked to `-100` so the model isn't penalized for
"failing to predict" the note it was given):

```python
optimizer = torch.optim.AdamW([p for p in model.parameters() if p.requires_grad], lr=1e-3)
model.train()
losses = []
for step in range(40):
    optimizer.zero_grad()
    out = model(input_ids=input_ids, attention_mask=attn, labels=labels)
    out.loss.backward()
    optimizer.step()
    losses.append(out.loss.item())
    if step % 5 == 0 or step == 39:
        print(f"step {step:2d}  loss = {out.loss.item():.4f}")
```

Verified output:

```
step  0  loss = 3.1957
step  5  loss = 2.3473
step 10  loss = 1.2228
step 15  loss = 0.5045
step 20  loss = 0.2511
step 25  loss = 0.1472
step 30  loss = 0.1145
step 35  loss = 0.0710
step 39  loss = 0.0638
```

Loss dropped from 3.1957 to 0.0638 across 40 real steps on a handful
of CPU seconds — a real **98.0% reduction** (`1 - 0.0638/3.1957`). This
is a genuinely small, memorizable dataset (six examples), so a sharp
loss drop like this is expected and appropriate for a toy-scale
demonstration — the real test of whether anything useful was *learned*
(versus simply memorized) is the held-out prompt in step 4, which the
model never saw during any of these 40 steps.

### Step 4 — verified: before/after generation on the exact same held-out prompt

```python
model.eval()
print("AFTER fine-tuning:", repr(generate(model, HELD_OUT_PROMPT)))
```

Verified output:

```
AFTER fine-tuning: ' ITEM: rain boots | COLOR: yellow | SIZE: 8 | PRICE: 27'
```

Side by side, on the identical unseen prompt:

```
 BEFORE  '\n\nThe first time I saw this, I was so excited...'   (generic prose)
 AFTER   ' ITEM: rain boots | COLOR: yellow | SIZE: 8 | PRICE: 27'   (correct fields, right order)
```

Every field is correct and in the right position — item name, color,
size, and price all extracted correctly from a note the model never
trained on (the output is truncated at 20 generated tokens, cutting
off mid-price; a longer `max_new_tokens` would complete "27.50 |
STOCK: yes"). This is real evidence of pattern generalization from six
training examples, not memorization of those six examples, because the
seventh note's specific words ("rain boots," "yellow," "8," "27.50")
never appeared in training.

### Step 5 — verified: the base model's weights genuinely never changed

```python
for name, p in model.named_parameters():
    if "base_layer.weight" in name and "h.0.attn.c_attn" in name:
        print("requires_grad on base weight:", p.requires_grad)
        break
```

Verified output:

```
requires_grad on base weight: False
```

Consistent with module 12's finding: the entire generalization
observed in step 4 came from 294,912 trained numbers (0.24% of the
model), while the other 99.76% — the base gpt2 weights — never
received a gradient across all 40 steps.

## Reference

```
 Term                 Meaning
 ───────────────────  ──────────────────────────────────────────────
 Prompt/target pair    One training example: an input the model sees
                       and a target it's trained to produce after it
 Label masking (-100)  Marking prompt tokens so loss is computed only
                       on the target continuation, not the input echo
 Held-out prompt       An example never included in training, used to
                       check generalization rather than memorization
 Training loss curve   Real per-step loss values; verified: 3.1957 ->
                       0.0638 across 40 steps on this module's dataset
 do_sample=False        Greedy decoding; used for before/after
                       generation so outputs are deterministic and
                       reproducible, not a sampling artifact
 print_trainable_parameters()  peft's own reporting of trainable vs.
                       total parameters; matches module 12's number
                       exactly (294,912 / 124,734,720, 0.2364%)
```

## Hands-on exercises

### 1. Reproduce this exact run and confirm the loss curve is reproducible

Set `torch.manual_seed(0)` (as this module did) and re-run the full
script. Confirm your printed loss values match this module's within a
small numeric tolerance (exact bit-for-bit reproduction across
machines is not guaranteed, but the shape of the curve — sharp early
drop, flattening by step 20-30 — should match).

### 2. Test true generalization with a harder held-out example

Add an eighth note with a value type not seen in training (e.g. a
price with cents ending in something unusual, or a two-word color like
"dark blue"). Run it through the fine-tuned model and report the real
output. Does the model handle the novel value correctly, partially, or
not at all? Report the actual generated text either way.

### 3. Vary LoRA rank and compare final loss and generation quality

Re-run the full training loop with `r=2` and separately with `r=32`
(keeping everything else fixed). Report the real final loss for each
and the real held-out generation for each. Does a smaller rank still
reach a comparably low loss on this six-example task? Does a larger
rank change the held-out generation's correctness at all?

## Independent challenge

A teammate looks at the 98% loss reduction and says: "This proves LoRA
fine-tuning works great — we should trust this result as evidence
we're ready to fine-tune on our real production task." Evaluate this
claim using only what this module actually verified.

<details><summary>Discussion</summary>

The loss reduction is real, but "trained loss went down 98% on six
examples" is weak evidence on its own — a large enough model can often
memorize six arbitrary examples regardless of whether it learned
anything generalizable, and a training loss curve alone can't
distinguish memorization from generalization. The stronger evidence
this module actually collected is the held-out generation in step 4:
the model produced correct, correctly-ordered fields for a note it
never saw, which is a real (if small-scale) generalization signal that
the loss curve alone doesn't provide. Even that is thin evidence for a
production decision, though — six training examples and one held-out
check is enough to demonstrate the *mechanism* works, not enough to
estimate real-world accuracy, robustness to edge cases, or performance
on the actual distribution of inputs a production system would see.
The honest conclusion from this module's own numbers: the fine-tuning
mechanism is verified to work as intended (loss drops, weights update
correctly, the base model stays frozen, the held-out prompt
generalizes) — a genuinely different, larger claim than "ready for
production," which would need a real held-out *set*, not one example,
and a real accuracy metric over it.

</details>

## Common mistakes & troubleshooting

- **Forgetting to mask the prompt tokens in the labels.** Without
  setting prompt-token labels to `-100`, the loss also penalizes the
  model for "failing to predict" the input note it was just given,
  which is nonsensical (the model can't predict its own input) and
  dilutes the gradient signal that should focus on the target format.
- **Treating a sharp loss drop on a handful of examples as proof of
  generalization.** As the Independent challenge covers, six
  memorizable examples reaching near-zero loss is expected and doesn't
  by itself prove the pattern generalizes — the held-out prompt check
  in step 4 is what actually tests that, and is worth never skipping.
- **Comparing before/after generations with sampling enabled
  (`do_sample=True`).** This module used greedy decoding
  (`do_sample=False`) specifically so the before/after comparison
  reflects a real, deterministic change from fine-tuning, not random
  sampling variance between two separate calls.
- **Forgetting `model.eval()` before generating.** Leaving the model
  in `.train()` mode during generation can change behavior for modules
  like dropout (this module's `lora_dropout=0.05`); switching to
  `.eval()` before both the before- and after-generation checks keeps
  the comparison fair.
- **Assuming a low final loss number is comparable across different
  datasets or tokenizations.** Loss values are dataset- and
  model-specific; this module's 0.0638 final loss is only meaningful
  relative to its own starting loss (3.1957) and its own task, not as
  an absolute quality bar to replicate elsewhere.

## Checkpoint quiz

1. What real loss reduction did the 40-step training run achieve, and
   why is that number alone weaker evidence of learning than the
   held-out generation in step 4?
2. Why were the prompt tokens' labels set to `-100` rather than left
   as real token IDs?
3. What specific fields did the fine-tuned model correctly extract
   from a held-out note it never trained on, and why does that matter
   more than memorizing the six training examples would?
4. What percentage of gpt2's parameters were actually trainable in
   this run, and which module first established that exact number
   independently?
5. What real check in step 5 confirmed the base model's weights were
   never modified during this fine-tune?

<details><summary>Answers</summary>

1. A 98.0% reduction (3.1957 to 0.0638). It's weaker evidence alone
   because a model can often drive loss down on a handful of
   memorizable examples without learning a generalizable pattern; the
   held-out prompt result is stronger evidence because it tests
   behavior on data never seen during training.
2. So the loss is computed only on the target continuation the model
   is meant to produce, not on the input note itself — a model can't
   meaningfully "predict" the prompt it was just handed, so including
   those tokens in the loss would add noise rather than useful
   gradient signal.
3. Item name ("rain boots"), color ("yellow"), and size ("8") were all
   extracted correctly and in the right field order from a note never
   seen in training; this matters more than memorization because none
   of those specific values appeared in any of the six training
   examples, indicating the model learned the *pattern*, not just the
   six training strings.
4. 0.2364% (294,912 trainable out of 124,734,720 total parameters).
   Module 12 first established this exact number using `peft`'s
   `print_trainable_parameters()` on the identical configuration.
5. Checking `requires_grad` on the base model's `c_attn` weight tensor
   directly after training and confirming it was still `False` —
   meaning no gradient was ever computed for it across all 40 steps.

</details>

## Further reading & sources

- [PEFT documentation: Quicktour](https://huggingface.co/docs/peft/main/en/quicktour) - the official walkthrough this module's `LoraConfig` + `get_peft_model` + training loop pattern follows.
- [Hugging Face Transformers: Causal language modeling](https://huggingface.co/docs/transformers/en/tasks/language_modeling) - reference for `labels`-based loss computation and `-100` label masking used in this module's training loop.
- [LoRA: Low-Rank Adaptation of Large Language Models (Hu et al., 2021)](https://arxiv.org/abs/2106.09685) - the underlying method this module actually ran end-to-end; module 12 covers its internals in depth.

## Next

[Module 15: Quantization: INT8, INT4, GGUF](../15-quantization-int8-int4-gguf/README.md)
