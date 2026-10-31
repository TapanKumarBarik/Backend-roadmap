# Module 07: Building a Fine-Tuning Dataset

## Why this matters

Modules 05 and 06 established what SFT and instruction tuning *are* —
supervised training on (instruction, response) pairs. Neither module
answered the practical question a team actually building a dataset
must answer: **what exactly gets computed a loss over?** The naive
answer — "train on the whole example, prompt and response together" —
is wrong, and it's wrong in a way that doesn't throw an error; it
silently trains the model to do something you didn't intend: predict
the *prompt* itself, token by token, in addition to the response. This
module makes the fix concrete and numeric: **loss masking**, the
practice of setting the prompt portion's labels to a sentinel value
(`-100`) that `CrossEntropyLoss` is instructed to ignore, so gradient
signal flows only from the tokens the model was actually supposed to
generate. This module builds a real example with the `gpt2` tokenizer,
constructs both a masked and an unmasked label tensor, and verifies
with real computed loss values that the two differ — and by exactly
the amount the masked-out prompt tokens contribute.

## Concepts

### Prompt/response formatting: what the model actually sees

A fine-tuning example is not free-form text; it's built from an
explicit template that separates the parts the model should condition
on (the prompt — instruction, and optionally input) from the part it
should learn to *produce* (the response):

```
 RAW EXAMPLE (what a dataset row conceptually contains)
 ──────────────────────────────────────────────────────
 instruction: "Translate to French."
 input:       "Good morning"
 response:    "Bonjour"

 FORMATTED / TEMPLATED TEXT (what actually gets tokenized)
 ──────────────────────────────────────────────────────
 "Instruction: Translate to French.
  Input: Good morning
  Response:" <- PROMPT (model conditions on this)
  " Bonjour"                        <- RESPONSE (model must learn to predict THIS)
```

Chat-formatted datasets (module 06's territory) do the same thing with
role markers instead of an "Instruction:/Input:/Response:" template,
but the underlying question is identical either way: **once tokenized
into one sequence, which token positions is the model actually being
trained to predict?**

### Verified: building a real labels tensor with the prompt masked out

`CrossEntropyLoss` (what causal language models use, including inside
`transformers`' own `model(..., labels=...)` call) accepts an
`ignore_index` — by convention and by default in `transformers`,
`-100` — meaning: **skip this position entirely; contribute zero loss
and zero gradient from it.** Building both a real "no masking" labels
tensor and a real "masked" one on the same tokenized example:

```python
import torch
from transformers import AutoTokenizer, AutoModelForCausalLM

torch.manual_seed(0)
tok = AutoTokenizer.from_pretrained("gpt2")
model = AutoModelForCausalLM.from_pretrained("gpt2")
model.eval()

prompt = "Instruction: Translate to French.\nInput: Good morning\nResponse:"
response = " Bonjour"
full_text = prompt + response

prompt_ids = tok(prompt, return_tensors="pt")["input_ids"]
full_ids = tok(full_text, return_tensors="pt")["input_ids"]
n_prompt = prompt_ids.shape[1]

print("prompt token count:", n_prompt)
print("full token count:", full_ids.shape[1])
print("response token count:", full_ids.shape[1] - n_prompt)
print("decoded response tokens:", [tok.decode([t]) for t in full_ids[0, n_prompt:]])
```

Verified output:

```
prompt token count: 16
full token count: 19
response token count: 3
decoded response tokens: [' Bon', 'j', 'our']
```

Note "Bonjour" is not one token to GPT-2's tokenizer — it splits into
three subword pieces. This matters directly for masking: the mask
boundary has to be drawn at the *token* index where the response
starts, not at a character or word boundary.

```python
# labels WITHOUT masking: every token, including the prompt, is a training target
labels_unmasked = full_ids.clone()

# labels WITH masking: prompt tokens set to -100, ignored by CrossEntropyLoss
labels_masked = full_ids.clone()
labels_masked[0, :n_prompt] = -100

print("labels_unmasked:", labels_unmasked.tolist())
print("labels_masked  :", labels_masked.tolist())
```

Verified output:

```
labels_unmasked: [[6310, 2762, 25, 3602, 17660, 284, 4141, 13, 198, 20560, 25, 4599, 3329, 198, 31077, 25, 7979, 73, 454]]
labels_masked  : [[-100, -100, -100, -100, -100, -100, -100, -100, -100, -100, -100, -100, -100, -100, -100, -100, 7979, 73, 454]]
```

Sixteen `-100`s — exactly the prompt's token count — followed by the
three real token ids for "Bonjour". Now the actual computed loss,
passing each labels tensor to the same model call:

```python
out_unmasked = model(input_ids=full_ids, labels=labels_unmasked)
out_masked = model(input_ids=full_ids, labels=labels_masked)
print("loss WITHOUT masking (trains on prompt+response):", out_unmasked.loss.item())
print("loss WITH masking (trains on response only):", out_masked.loss.item())
```

Verified output:

```
loss WITHOUT masking (trains on prompt+response): 5.127345085144043
loss WITH masking (trains on response only): 4.225435733795166
```

The two losses are genuinely different real numbers, computed from
the identical input and the identical model weights — the only
difference is which label positions were allowed to contribute.
`transformers`' `CrossEntropyLoss` averages loss *only over
non-ignored positions*, so the unmasked loss (5.127) is really an
average over all 18 predicted positions (prompt tokens included),
while the masked loss (4.225) is the average over only the 3 response
positions — a different, and for this purpose more meaningful, number:
it reflects specifically how well the model predicts the *response*,
which is the only thing SFT is meant to teach it to generate.

### Verified: recomputing the masked loss manually confirms the mechanism

To confirm this isn't a magic library number but does exactly what
`ignore_index=-100` is documented to do, the masked loss can be
recomputed by hand from the raw logits, with the standard causal-LM
label shift (predict token *t+1* from the logits at position *t*):

```python
import torch.nn.functional as F

logits = model(input_ids=full_ids).logits
shift_logits = logits[0, :-1, :]         # drop the last position's logits (nothing to predict after it)
shift_labels = labels_masked[0, 1:]      # drop the first label (nothing predicts the very first token)
manual_loss = F.cross_entropy(shift_logits, shift_labels, ignore_index=-100)
print("manual masked loss (recomputed from logits):", manual_loss.item())

contributing = (shift_labels != -100).sum().item()
print("label positions contributing to the loss:", contributing, "out of", shift_labels.shape[0])
```

Verified output:

```
manual masked loss (recomputed from logits): 4.225435733795166
label positions contributing to the loss: 3 out of 18
```

The manually recomputed loss matches `transformers`' internal
`out_masked.loss` exactly (4.225435733795166 both times), and only 3
of the 18 shifted label positions actually contribute — the response
tokens, and nothing else. This is the mechanism, made fully visible:
masking isn't a heuristic trick, it's `ignore_index` doing exactly
what a plain `cross_entropy` call does when told to skip certain
positions.

### Why this matters in practice, not just in theory

Training on unmasked prompts doesn't crash and doesn't obviously look
wrong in a loss curve — it just means part of the gradient signal
during every training step is spent teaching the model to predict
*your own instructions back to you*, rather than exclusively teaching
it to produce good responses. At small scale this dilutes signal; at
scale, with prompts that are much longer than responses (a common real
shape — a long input document, a short summary), the great majority of
every unmasked example's loss could come from prompt tokens the model
never needs to generate at inference time, actively working against
the goal of the fine-tune.

## Reference

```
 Term                Meaning
 ──────────────────  ──────────────────────────────────────────────────
 Prompt               The portion of a formatted example the model
                      conditions on but is not trained to generate
                      (instruction + optional input)
 Response / target    The portion the model IS trained to generate —
                      the only tokens that should contribute to loss
 Labels               The tensor passed alongside input_ids telling the
                      loss function what the "correct" next token is
                      at each position
 ignore_index (-100)  The sentinel label value CrossEntropyLoss is told
                      to skip — verified above: 16 prompt positions set
                      to -100 contributed exactly zero to the loss
 Loss masking          The practice of setting prompt-token labels to
                      -100 so only response tokens produce gradient —
                      verified numerically to change the computed loss
                      (5.127 unmasked vs. 4.225 masked, same input)
 Label shift          Causal LM convention: the logits at position t
                      predict the token at position t+1, so labels are
                      shifted by one position relative to input_ids
                      before computing cross-entropy
```

## Hands-on exercises

### 1. Vary the prompt length and confirm the mask boundary tracks it

Rebuild the example with a much longer prompt (add several extra
sentences of irrelevant instruction text before "Response:") and a
short response. Recompute `n_prompt`, rebuild `labels_masked`, and
confirm the count of non-`-100` positions still equals exactly the
response's token count, regardless of how long the prompt became.

### 2. Compute the unmasked-vs-masked loss gap for a much longer response

Use a longer, multi-sentence response instead of "Bonjour" and rerun
both the masked and unmasked loss computation. Report both losses and
discuss whether the gap between them (unmasked minus masked) grows,
shrinks, or stays roughly the same as the response gets longer relative
to the prompt, and explain why using this module's manual recomputation
approach.

### 3. Build a multi-turn masked example

Construct a three-turn conversation (user, assistant, user, assistant)
formatted with role markers, and build a `labels` tensor that masks
*every* user turn's tokens (and system tokens, if included) but leaves
*both* assistant turns' tokens unmasked. Verify with a printed labels
tensor that both assistant spans, and only those spans, are non-`-100`.

## Independent challenge

A teammate trained a summarization model and is confused: "the
training loss looks great, low and steadily decreasing, but at
inference time the model sometimes just repeats parts of the input
document back to me instead of summarizing it." They show you their
data-loading code, and it constructs `labels = input_ids.clone()` with
no masking at all. Using this module's verified findings, diagnose the
likely cause and prescribe the fix.

<details><summary>Discussion</summary>

Unmasked labels mean every token — including the entire source
document the model is meant to summarize, not just the target summary
— contributes to the training loss and gradient. This module's own
verified unmasked-vs-masked comparison (5.127 vs. 4.225, on the exact
same input and weights) shows concretely that an unmasked loss is
computed over the prompt tokens too, and a "good" loss curve in that
setup partly reflects how well the model predicts the *source
document itself*, which is a nearly trivial task once the model has
seen the document as input — it's not evidence the model is learning
to summarize well. Worse, actively training the model to predict the
input document's own tokens as if they were the desired output teaches
a bad habit: producing output that echoes the input rather than
condensing it, which matches the reported symptom exactly. The fix is
loss masking: set every source-document (and instruction-template)
token's label to `-100`, leaving only the target summary's tokens
unmasked, exactly as this module's `labels_masked` tensor did with the
16 prompt tokens. After the fix, the loss curve's absolute numbers will
likely look different (it's now measuring only summary-token
prediction, a harder and more meaningful number) — that's expected and
correct, not a regression.

</details>

## Common mistakes & troubleshooting

- **Constructing labels as a plain clone of input_ids with no
  masking.** This module's verified numbers show it produces a
  genuinely different (and less meaningful) loss than masking does —
  it's not a cosmetic difference.
- **Masking at the wrong token index because of subword
  tokenization.** This module's own example shows "Bonjour" is 3
  tokens, not 1 — computing the mask boundary from character or word
  counts instead of actually tokenizing the prompt alone first
  (`tok(prompt)`) and using *its* token count is a common off-by-many
  bug.
- **Forgetting the label shift when computing loss manually.** As
  shown in the manual recomputation, `cross_entropy` needs
  `logits[:, :-1]` matched against `labels[:, 1:]` — comparing
  same-index logits and labels without the shift silently computes a
  different (wrong) loss that happens to still run without error.
  `transformers`' `model(..., labels=...)` call handles this shift for
  you internally, which is worth confirming rather than assuming.
- **Masking the wrong span in multi-turn data.** Once a conversation
  has more than one assistant turn, every user/system turn must be
  masked and every assistant turn must be left unmasked — masking only
  the *first* prompt and leaving all subsequent turns (including later
  user turns) unmasked silently reintroduces the same problem this
  module fixes, just partway through the sequence.
- **Assuming a lower loss number always means a better fine-tune.**
  Masked and unmasked losses are not comparable to each other (they're
  averaged over different numbers and different kinds of positions) —
  a masked loss of 4.2 is not "worse" than an unmasked loss of 5.1
  computed on the same data; they're measuring different things
  entirely, as this module's manual recomputation makes concrete.

## Checkpoint quiz

1. What does setting a label position to `-100` actually do inside
   `CrossEntropyLoss`, and what did this module verify about how many
   of the 19 total label positions in its example ended up contributing
   to the masked loss?
2. Why did this module's masked and unmasked loss come out to two
   different real numbers (5.127 vs. 4.225) on the exact same
   `input_ids` and model weights?
3. Why is "Bonjour" split into 3 tokens relevant to how the mask
   boundary must be computed?
4. What is the label shift, and why does the manual recomputation use
   `logits[:, :-1]` against `labels[:, 1:]`?
5. Give one concrete symptom a fine-tuned model can exhibit at
   inference time if its training labels were never masked, and
   explain the causal link using this module's findings.

<details><summary>Answers</summary>

1. It marks that position as ignored by the loss — no gradient signal
   is computed from it. This module verified that of the 18 shifted
   label positions in its example, exactly 3 (the response tokens for
   "Bonjour") contributed to the masked loss; the 15 masked prompt
   positions among them contributed zero.
2. Because the unmasked loss averages cross-entropy over all 18
   shifted positions (16 prompt-adjacent positions plus response),
   while the masked loss averages only over the 3 response positions —
   different sets of positions being averaged produce different real
   numbers even though the underlying model and input are identical.
3. Because the mask boundary must be drawn at the correct *token*
   index, and if "Bonjour" is 3 tokens rather than 1, computing the
   boundary from character or word counts rather than actually
   tokenizing the prompt separately and using its real token count
   would place the mask in the wrong position — potentially masking
   part of the intended response, or leaving part of the prompt
   unmasked.
4. The label shift reflects that a causal LM's logits at position t
   predict the token at position t+1, not the token at position t
   itself. The manual recomputation drops the last position's logits
   (nothing follows it to predict) and the first position's label
   (nothing predicts it), aligning `shift_logits[i]` with
   `shift_labels[i]` as "logits that should predict this label."
5. A model trained on unmasked source-document tokens can learn to
   echo or repeat parts of the input back at inference time instead of
   producing the intended transformation (e.g. a summary), because
   part of its training gradient explicitly rewarded reproducing the
   input's own tokens as if they were correct output — exactly the
   mechanism this module's independent challenge diagnoses.

</details>

## Further reading & sources

- [Hugging Face: Fine-tuning a language model documentation](https://huggingface.co/docs/transformers/main/en/tasks/language_modeling) - documents `transformers`' `labels` argument and its internal shift-and-cross-entropy behavior this module recomputes manually.
- [PyTorch: torch.nn.CrossEntropyLoss documentation](https://docs.pytorch.org/docs/stable/generated/torch.nn.CrossEntropyLoss.html) - the official documentation of the `ignore_index` parameter this module's masking relies on.
- [Training language models to follow instructions with human feedback (Ouyang et al., 2022)](https://arxiv.org/abs/2203.02155) - Appendix details on the SFT dataset construction (prompt/response formatting) this module's practical concerns are drawn from.
- [Stanford Alpaca: An Instruction-following LLaMA Model (project page)](https://crfm.stanford.edu/2023/03/13/alpaca.html) - a widely-cited real example of instruction/input/response-formatted fine-tuning data, matching this module's template shape.

## Next

[Module 08: RLHF: Reward Models](../08-rlhf-reward-models/README.md)
