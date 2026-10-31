# Module 17: Capstone Project — Fine-Tune, Align, and Document a Real Model

## What this capstone is

This track built, with real verified code, the full mechanics of
taking a pretrained model somewhere new: SFT and instruction tuning
(modules 05-07), RLHF and DPO as ways to align a model toward human
preferences (modules 08-11), LoRA as a way to do any of that while
training a genuinely tiny fraction of the model's parameters (module
12, verified: 0.24% of gpt2 trainable), quantization as a way to make
the frozen majority of a model cheap to hold (modules 13 and 15,
verified: real INT8 size reductions), a complete real fine-tuning run
with a real loss curve (module 14), and a framework for knowing when
any of this is even the right tool (module 16). This capstone asks you
to combine several of those pieces into one real, small project: a
model you actually fine-tune with LoRA, a preference-alignment step
you actually run on top of it, and a short, honest model-card-style
writeup of what changed and what it cost.

There is no dataset provided, no solution given, and no fixed expected
outcome — the point is running real, small experiments and reporting
real results, including surprising or disappointing ones, exactly as
this track's own modules did throughout.

## The project

### 1. Pick a small base model and a narrow custom task

Use a small, cached, CPU-feasible checkpoint (`gpt2`, `gpt2-medium`, or
`Qwen/Qwen2.5-0.5B-Instruct` are all reasonable). Define a narrow task
with a clear right answer — module 14's note-to-structured-record
conversion is one template; a different format-conversion, classification-
as-generation, or style-transfer task is equally valid. Write down
exactly how many examples you're using and how they're split between
LoRA fine-tuning and held-out evaluation.

### 2. LoRA fine-tune the base model on your task (module 12 + 14's pattern)

Using `peft`'s `LoraConfig` and `get_peft_model`, attach real LoRA
adapters to your chosen model and run a real training loop on your
task, the way module 14 did. Report your model's real
`print_trainable_parameters()` output, your real per-step loss values,
and a real before/after generation comparison on a held-out example
your model never trained on.

### 3. Apply a real preference-alignment step on top: DPO

After your LoRA fine-tune converges, take it one step further: write a
small set of preference pairs for your task (a handful of `(prompt,
chosen_response, rejected_response)` triples — e.g., a correctly
formatted output vs. a plausible but wrong one) and run a real DPO
step on top of your already-fine-tuned model, using `trl`'s `DPOTrainer`
if it's available in your environment, or a minimal hand-written DPO
loss (module 10 covers its closed-form loss directly) if it isn't. DPO
is specifically chosen here, as module 10 covers, because it needs no
separate reward model and no RL loop (module 09's PPO), making it the
most tractable real alignment step to run end-to-end in a small,
CPU-only setup. Report whether your model's preferred-vs-rejected
output ranking actually shifted after this step, with real evidence
(e.g., real log-probabilities or a real relative-likelihood comparison
between chosen and rejected responses, before and after).

### 4. Quantize the result and measure the real memory story, end to end

Using module 13/15's verified pattern, apply real INT8 dynamic
quantization (`torch.quantization.quantize_dynamic`) to your final
model and report real, measured numbers: parameter byte-size before
and after, and which fraction of that footprint was ever trainable in
the first place (your LoRA adapter's parameter count from step 2,
against the frozen base's full count). If your base model's real
architecture doesn't expose plain `nn.Linear` layers for its heavy
weights (as module 13 found for gpt2's `Conv1D` layers), report that
honestly rather than reporting a size reduction that didn't actually
happen.

### 5. Write a short model-card-style writeup

Following module 15's honest-reporting spirit, write a short markdown
summary of what you built: the task and data, your real trainable-
parameter count and percentage, your real training loss curve, your
real before/after generation example, whether your DPO step measurably
changed the model's chosen-vs-rejected preference, and your real
quantized-vs-full memory footprint numbers. State plainly anything
that didn't work as expected — a DPO step that didn't move the
preference ranking, or a quantization pass that (as module 13 found
for gpt2) barely changed anything, is a valid and useful real finding
to report.

## Constraints

- Every number in your writeup must come from a real run on your own
  setup — no illustrative, assumed, or "typically expected" values.
  This capstone is specifically about generating your own evidence,
  the way every module in this track did.
- Keep the whole project CPU-scale: a small base model, a handful to
  a few dozen training examples, and a handful of DPO preference
  pairs are enough to produce real, honest, measurable results without
  needing a GPU.
- If a step doesn't work the way you expected (loss doesn't drop
  cleanly, DPO doesn't shift the preference, quantization barely
  changes size for your specific architecture), report that as your
  actual result — a correctly diagnosed non-result is more valuable
  than a fabricated clean success.

## How to know you've done it well

- Someone who's read this track but not run your experiments could
  follow your writeup and understand your task, your real numbers at
  each step, and why each step's real outcome does or doesn't match
  what modules 12-15 would predict.
- Your LoRA trainable-parameter count and percentage (step 2) are your
  own measured values from your own model and task, not module 12 or
  14's numbers restated.
- Your DPO comparison (step 3) reports a real before/after measurement
  of preference ranking, even if the shift is small or absent —
  not an assumed improvement.
- Your quantization numbers (step 4) are real, measured byte counts on
  your actual final model, including an honest report if your model's
  architecture limits how much quantization actually helps (module
  13's gpt2/`Conv1D` finding is exactly this kind of honest limitation).
- Your model-card writeup (step 5) states at least one thing that
  didn't go as expected, alongside what did.

## Next

[Track 05: GPUs & GenAI Hardware](../../05-gpus-and-genai-hardware/README.md)
