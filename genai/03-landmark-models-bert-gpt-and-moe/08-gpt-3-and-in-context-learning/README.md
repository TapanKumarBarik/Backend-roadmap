# Module 08: GPT-3 and In-Context Learning

## Why this matters

Module 00 established a two-phase paradigm — pretrain, then adapt —
and named exactly one adaptation route: fine-tuning, updating the
model's weights on labeled examples (module 03 did this for BERT).
GPT-3's real contribution, and the reason it gets its own module
separate from GPT-1/GPT-2 (module 07), is a **third adaptation route
that needs neither labeled data nor a single weight update**:
**in-context learning**. Show the model a few example (input, output)
pairs *inside the prompt itself*, and its next-token predictions shift
toward continuing the pattern — no gradient step, no `optimizer.step()`,
no change to a single parameter. This module verifies that claim
literally (checksums and raw parameter values, compared before and
after generation), runs a real zero-shot vs. few-shot comparison on a
real, locally-loadable GPT-2 model, and is honest about what a demo at
this scale can and can't show: GPT-2 is dramatically smaller than
GPT-3, and the local results below are weaker and noisier than the
paper's — the mechanism is identical, the capability is not.

## Concepts

### Three ways to adapt a pretrained model, not two

```
 PHASE 2: ADAPTATION — now with a third option
 ──────────────────────────────────────────────
 1. Fine-tuning (module 03)          2. Zero-shot prompting        3. In-context learning (this module)
    Weight updates via gradient         No examples, no weight        A FEW examples placed in the
    descent on labeled examples         updates — just an              prompt, still no weight
    Changes the model permanently       instruction in the prompt      updates — the examples steer
                                                                        the SAME forward pass that
                                                                        zero-shot prompting also uses
```

Fine-tuning and in-context learning both "adapt" a pretrained model to
a task, but they differ in the one dimension that matters most for
cost and reversibility: fine-tuning permanently changes weights (module
03's BERT classifier is a genuinely different set of parameters after
training than before); in-context learning changes nothing about the
model at all — it is a single forward pass, exactly the kind module
00's causal language modeling objective already produces, just handed
a longer, structured prompt.

### Verified: literally no weight updates occur

The claim "no weight updates" is checkable, not just assumed. This
runs real generation through GPT-2-large, and directly compares a
whole-parameter checksum and individual parameter values before and
after:

```python
from transformers import GPT2LMHeadModel, GPT2TokenizerFast
import torch, hashlib

tok = GPT2TokenizerFast.from_pretrained("gpt2-large")
model = GPT2LMHeadModel.from_pretrained("gpt2-large")
model.eval()  # inference mode; nowhere below is .backward() or optimizer.step() called

def param_checksum(m):
    h = hashlib.sha256()
    for p in m.parameters():
        h.update(p.detach().numpy().tobytes())
    return h.hexdigest()

before = param_checksum(model)
before_vals = [model.transformer.h[0].mlp.c_fc.weight[0, 0].item(),
               model.transformer.h[5].attn.c_attn.weight[3, 3].item()]

prompt = "Convert the verb to past tense.\njump ->"
enc = tok(prompt, return_tensors="pt")
with torch.no_grad():
    out = model.generate(**enc, max_new_tokens=6, do_sample=False,
                          pad_token_id=tok.eos_token_id)

after = param_checksum(model)
after_vals = [model.transformer.h[0].mlp.c_fc.weight[0, 0].item(),
              model.transformer.h[5].attn.c_attn.weight[3, 3].item()]

print("checksum before == after:", before == after)
print("sample values before:", before_vals)
print("sample values after :", after_vals)
```

Verified output:

```
checksum before == after: True
sample values before: [-0.05826445296406746, 0.023709140717983246]
sample values after : [-0.05826445296406746, 0.023709140717983246]
```

A SHA-256 checksum over every one of GPT-2-large's ~774M parameters
(computed below) is bit-for-bit identical before and after a full
generation call, and two specific parameter values sampled from
different layers match to full float precision. `model.eval()` is set,
`torch.no_grad()` wraps the forward pass, and there is no `.backward()`
or `optimizer.step()` anywhere in the code — generation is pure forward
computation. Whatever "learning" in-context learning produces, it is
not stored in the weights at all; it exists only in the intermediate
activations of that one forward pass, and vanishes the moment the pass
ends.

### Verified: zero-shot vs. few-shot on the same task, same model

If nothing in the weights changes, the only thing that can shift the
model's output between zero-shot and few-shot is the **prompt itself**
— more tokens for the model to condition its next-token prediction on.
This runs the identical task (convert a verb to past tense) two ways —
once with only an instruction, once with three worked examples added
first — through the same GPT-2-large model:

```python
def generate(prompt, max_new_tokens=6):
    enc = tok(prompt, return_tensors="pt")
    with torch.no_grad():
        out = model.generate(**enc, max_new_tokens=max_new_tokens,
                              do_sample=False, pad_token_id=tok.eos_token_id)
    return tok.decode(out[0][enc["input_ids"].shape[1]:], skip_special_tokens=True)

zero_shot = "Convert the verb to past tense.\njump ->"

few_shot = (
    "Convert the verb to past tense.\n"
    "walk -> walked\n"
    "talk -> talked\n"
    "play -> played\n"
    "jump ->"
)

print("ZERO-SHOT:", repr(generate(zero_shot)))
print("FEW-SHOT :", repr(generate(few_shot)))
```

Verified output (GPT-2-large, 774M parameters, greedy decoding):

```
ZERO-SHOT: ' jump\nThe verb is a'
FEW-SHOT : ' jumped\nrun -> ran\n'
```

Zero-shot, the instruction alone, GPT-2-large fails: it echoes "jump"
back and drifts into an unrelated continuation ("The verb is a"),
never producing "jumped". Few-shot, with exactly the same model and
exactly the same weights (verified unchanged above), adding three
worked examples to the prompt is enough for the model to complete
"jump ->" with the correct "jumped" — and it even continues the
established pattern unprompted, generating a *new* example ("run ->
ran"). Nothing about the model changed between these two calls; only
the prompt did. This is in-context learning, observed directly: the
few-shot examples are functioning as a kind of implicit instruction
that pure zero-shot phrasing did not supply.

### Honest failure case: the same experiment on a much smaller model

Running the identical zero-shot/few-shot prompts through base GPT-2
(124M parameters, roughly 6x smaller than GPT-2-large) is the module's
honesty check — real capability, not just a scripted success:

```
ZERO-SHOT (gpt2, 124M): ' jump\njump -> jump\n'
FEW-SHOT  (gpt2, 124M): ' jump\ntalk -> talk\n'
```

Base GPT-2 fails **both** conditions — even with the same three
worked examples, it never produces "jumped"; it just loops back to
copying an example verb ("talk") instead of transforming the new one.
This is not a scripted result: it is exactly the kind of unimpressive,
real output this module commits to reporting honestly. Two things
follow from putting both model sizes side by side: (1) in-context
learning is not guaranteed to work — it is a capability, not a
mechanism switch that always turns on when examples are added; and (2)
the *same* few-shot prompt that failed on a 124M-parameter model
succeeded on a 774M-parameter model of otherwise identical
architecture. That single data point already points toward the paper
finding cited below: in-context learning ability itself tends to
improve with scale. GPT-3 at 175B parameters is roughly 226x larger
still than GPT-2-large — this module's local demo shows the mechanism
GPT-3 relies on, verified and real, but not GPT-3's capability, which
this environment has no way to reproduce (no GPT-3 weights are open,
and no API key is configured here).

### Why this is architecturally possible at all: it's just longer attention, not new machinery

Track 02 module 07 (Attention Masks and Causal Masking) established
that causal self-attention lets every token attend to every token
*before* it, and only those. The few-shot examples placed earlier in
the prompt are not processed by some separate "learning" subsystem —
they are ordinary tokens, sitting in ordinary positions, that the
causal self-attention computing the prediction for "jump ->" can
attend to exactly like any other preceding token (track 02 module 06's
scaled dot-product attention, computed the same way regardless of
whether the tokens being attended to are an instruction, an example,
or ordinary prose). There is no additional "in-context learning
module" bolted onto the transformer. The entire mechanism is: more
relevant tokens are now present in the context window for attention to
condition on, so the next-token distribution (track 01 module 15's
logits-to-probabilities pipeline) shifts toward continuing the pattern
those tokens establish. This is also why in-context learning is bounded
by the context window (track 02 module 07 / GPT-2's 1024-token
`n_ctx`, verified below) — examples that don't fit in the context
simply cannot be attended to at all.

### Verified: real scale numbers, GPT-2 family vs. GPT-3

```python
from transformers import AutoConfig
for name in ["gpt2", "gpt2-medium", "gpt2-large", "gpt2-xl"]:
    c = AutoConfig.from_pretrained(name)
    print(name, "n_layer=", c.n_layer, "n_embd=", c.n_embd,
          "n_head=", c.n_head, "n_ctx=", c.n_ctx)
```

Verified output:

```
gpt2        n_layer= 12  n_embd= 768   n_head= 12  n_ctx= 1024
gpt2-medium n_layer= 24  n_embd= 1024  n_head= 16  n_ctx= 1024
gpt2-large  n_layer= 36  n_embd= 1280  n_head= 20  n_ctx= 1024
gpt2-xl     n_layer= 48  n_embd= 1600  n_head= 25  n_ctx= 1024
```

Verified total parameter counts (summing `model.parameters().numel()`):
GPT-2 base is **124,439,808** parameters; GPT-2-large (used in the
demos above) is **774,030,080** parameters (~774M). GPT-3, per the
original paper ("Language Models are Few-Shot Learners", Brown et al.,
2020 — cited below), is **175 billion parameters across 96 layers** —
these two figures (175B params, 96 layers) are real, published facts
from the paper, not locally reproducible here, since GPT-3's weights
were never released and no API key is configured in this environment.
175B is roughly 1,410x GPT-2-large's parameter count, and roughly
1,400x GPT-2 base's.

### GPT-3's own published few-shot results (cited, not fabricated)

The paper's central experimental result, run at GPT-3's actual scale
rather than this module's local GPT-2 demo, is a systematic comparison
across three prompting conditions on the same benchmark tasks:
**zero-shot** (instruction only, no examples — what this module's
zero-shot demo reproduced in miniature), **one-shot** (a single
example), and **few-shot** (several examples, the same idea as this
module's three-example prompt, though the paper uses many more per
task and a much larger model). The paper reports that, across most of
the benchmark suite it evaluates, accuracy climbs from zero-shot to
one-shot to few-shot, and that the *size* of this improvement is
itself larger for bigger models — exactly the same qualitative
direction this module's own GPT-2-124M-vs-774M comparison stumbled
onto, just at a scale this environment cannot run. This module
deliberately does not restate a specific accuracy percentage from the
paper here — go to the actual paper (linked below) for exact,
per-task figures, since misremembering a specific number and
presenting it as verified would violate the same standard this module
holds its own local numbers to.

## Reference

```
 Concept                    What it means
 ─────────────────────      ────────────────────────────────────────
 In-context learning (ICL)    Adapting model behavior via examples
                               placed in the prompt; zero weight
                               updates (verified: checksum identical)
 Zero-shot                    Instruction only, no examples
 One-shot                     Exactly one example in the prompt
 Few-shot                     Several (2+) examples in the prompt
 Fine-tuning (module 03)       Adapts via gradient-based weight
                               updates — the OTHER adaptation route,
                               structurally different from ICL
 Why ICL works architecturally  Causal self-attention (track 02 module
                               06/07) attends over MORE relevant
                               preceding tokens — no separate
                               mechanism beyond a longer context
 GPT-2 (base)                  124,439,808 params; 12 layers, n_ctx=1024
 GPT-2-large                   774,030,080 params; 36 layers, n_ctx=1024
 GPT-3 (paper)                 175,000,000,000 params; 96 layers
 Local demo vs. paper claim     Local: verified real mechanism on a
                               weak model. Paper: verified real scale
                               results on GPT-3 itself, cited not run.
```

## Hands-on exercises

### 1 — reproduce the no-weight-update verification

Run the checksum-and-sample-values code above yourself (with either
`gpt2` or `gpt2-large`), but add a second checksum check *between* two
separate `generate()` calls in the same script (not just one before
and one after both). Confirm all three checksums are identical, and
explain in your own words why running generation a second time cannot
possibly change the result — connect it to the absence of any
`.backward()` or `optimizer.step()` call anywhere in the code.

### 2 — reproduce the zero-shot vs. few-shot comparison on a new task

Design your own simple pattern-completion task (an analogy task like
"big -> small, hot -> cold, up -> ?", or a simple format conversion),
and run it through `gpt2` and `gpt2-large` exactly as done above: once
zero-shot, once with 2-3 worked examples. Report the real, raw output
for all four runs, honestly — including if your task fails on both
model sizes, or succeeds on both. Either outcome is informative; do
not adjust the task after the fact just to make in-context learning
look like it worked.

### 3 — measure the effect of context length on the few-shot examples

Using the same few-shot prompt that succeeded on `gpt2-large` above,
pad the prompt with several hundred tokens of irrelevant filler text
*before* the worked examples (but still within GPT-2's 1024-token
`n_ctx`, verified above), pushing the examples further from the final
"jump ->" query. Re-run generation and report whether the correct
completion still appears. Connect whatever you find to this module's
attention-based explanation: examples still inside the context window
remain attendable, but their influence is not guaranteed to be
identical regardless of position or amount of intervening text.

## Independent challenge

A colleague argues: "If in-context learning works, we never need
fine-tuning (module 03) again — just put examples in the prompt every
time." Using this module's verified findings (the checksum/parameter
comparison, and the honest GPT-2-124M failure case), write two or
three sentences on why this claim is wrong, considering both the
per-request cost of re-sending examples and what the honest failure
case implies about reliability at smaller scale or on harder tasks.

<details><summary>Discussion</summary>

In-context learning has to re-supply its "adaptation" (the worked
examples) inside every single prompt, since nothing is ever stored in
the weights (verified above: the checksum is identical after
generation) — this means every request pays the token cost of the
examples again, unlike fine-tuning, module 03, where the adaptation is
baked into the weights once and every subsequent call is free of that
overhead. It is also not a guaranteed capability: this module's own
GPT-2-124M result showed few-shot examples failing to produce the
correct completion at all, while the same prompt succeeded on
GPT-2-large — so for a given model size or a sufficiently hard task,
in-context learning may simply not work reliably enough to replace a
fine-tuned model, which is precisely why both adaptation routes
(module 03's fine-tuning and this module's in-context learning)
coexist in practice rather than one having replaced the other.

</details>

## Common mistakes & troubleshooting

- **Assuming "in-context learning" means the model is being trained
  a little bit during the forward pass.** Verified above: the
  parameter checksum and individual sampled values are bit-for-bit
  identical before and after generation. There is no gradient step of
  any kind, however small.
- **Assuming a few-shot prompt is guaranteed to work just because it
  worked in someone else's example.** Verified above with base GPT-2
  (124M): the identical few-shot prompt that succeeded on GPT-2-large
  failed outright on the smaller model, looping back to copying an
  example rather than transforming the new input.
- **Treating GPT-2 results in this module as evidence about GPT-3's
  actual capability.** They are not — GPT-2-large (774M) is roughly
  1,410x smaller than GPT-3 (175B, per the paper). This module's local
  code verifies the *mechanism* (no weight updates, attention over a
  longer context); GPT-3's published *few-shot benchmark numbers* are
  cited from the paper, not reproduced.
- **Forgetting that in-context examples must fit inside the model's
  context window.** GPT-2's `n_ctx` is 1024 tokens (verified above via
  `AutoConfig`) — examples placed outside that window are not
  attendable at all, not merely "less influential."

## Checkpoint quiz

1. What is the one concrete, checkable difference between in-context
   learning and fine-tuning (module 03), verified directly in this
   module?
2. In the verified zero-shot vs. few-shot comparison on GPT-2-large,
   what did adding three worked examples change about the model, and
   what did it change about the output?
3. Why did the identical few-shot prompt fail on base GPT-2 (124M) but
   succeed on GPT-2-large (774M)? What does this suggest about the
   GPT-3 paper's own finding regarding scale?
4. What is the actual mechanism (in terms of a specific concept from
   track 02) that makes in-context learning possible at all?
5. Why does this module cite GPT-3's published few-shot benchmark
   results rather than running GPT-3 itself or restating a specific
   remembered percentage?

<details><summary>Answers</summary>

1. Fine-tuning changes the model's weights via gradient-based updates
   (module 03); in-context learning changes nothing in the weights at
   all — verified here via an identical SHA-256 checksum over all
   parameters, and identical individual parameter values, before and
   after a generation call that used few-shot examples.
2. It changed nothing about the model itself (checksum and parameter
   values verified identical). It changed the *prompt* the model
   conditioned on, which was enough to shift the greedy-decoded output
   from a failed continuation ("jump\nThe verb is a") to the correct
   completion plus an unprompted new example ("jumped\nrun -> ran").
3. Because in-context learning is a real capability that itself scales
   with model size, not a mechanism that's simply present or absent —
   base GPT-2 (124M) failed the same prompt that GPT-2-large (774M)
   succeeded on. This is the same qualitative direction (bigger models
   are better at few-shot) the GPT-3 paper reports as its central
   experimental finding, just observed here at a far smaller scale.
4. Causal self-attention (track 02 modules 06 and 07): the few-shot
   examples are ordinary tokens earlier in the prompt that the model's
   attention over preceding tokens can condition on when predicting
   the next token — there is no separate "learning" mechanism beyond
   attention over a longer context.
5. Because GPT-3's weights were never released and no API key is
   configured in this environment, so its actual behavior cannot be
   run or verified locally — restating a specific benchmark percentage
   from memory risks presenting an unverified, possibly wrong number
   as a "verified" fact, which this module holds itself to the same
   standard against for its own local numbers.

</details>

## Further reading & sources

- [Language Models are Few-Shot Learners (Brown et al., 2020)](https://arxiv.org/abs/2005.14165) - the original GPT-3 paper; defines zero-/one-/few-shot evaluation and reports the paper's real benchmark tables cited (not restated in specific figures) in this module.
- [Hugging Face documentation: GPT2LMHeadModel](https://huggingface.co/docs/transformers/en/model_doc/gpt2#transformers.GPT2LMHeadModel) - the real model class used in every verified code example in this module, including `generate()` and `AutoConfig`.
- [Track 02, Module 06: Scaled Dot-Product Attention](../../02-transformer-architecture/06-scaled-dot-product-attention/README.md) - the attention computation this module's "why ICL works architecturally" section grounds in, applied identically whether attended-to tokens are instructions, examples, or ordinary text.
- [Track 02, Module 07: Attention Masks and Causal Masking](../../02-transformer-architecture/07-attention-masks-and-causal-masking/README.md) - the causal-masking mechanism that restricts attention to preceding tokens, which is what few-shot examples placed earlier in the prompt rely on being attendable.
- [Track 03, Module 00: The Pretraining Paradigm](../00-the-pretraining-paradigm/README.md) - established the two-phase pretrain-then-adapt paradigm and named fine-tuning as phase 2; this module adds in-context learning as a second, weight-update-free adaptation route.

## Next

[Module 09: GPT-4 and Beyond](../09-gpt-4-and-beyond/README.md)
