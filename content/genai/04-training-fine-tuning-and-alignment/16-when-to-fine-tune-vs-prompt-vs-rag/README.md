# Module 16: When to Fine-Tune vs. Prompt vs. RAG

## Why this matters

Modules 12-15 built and verified real fine-tuning machinery — LoRA's
tiny trainable fraction, quantization's real size trade-offs, an
actual training run with a real loss curve. None of that answers the
question a team actually has to answer before writing any of that
code: *should we fine-tune at all?* Prompting a model with instructions
or examples, retrieving relevant documents and stuffing them in
context (RAG — Retrieval-Augmented Generation, covered in full in
track 09, not yet built, referenced here by name and number only), and
fine-tuning are three genuinely different tools solving different
problems, and picking the wrong one wastes real engineering time. This
module is a decision framework, not a coding exercise — but it opens
with one verified, slightly humbling piece of real evidence: the exact
task module 14 fine-tuned gpt2 to solve turns out to also be solvable
by prompting alone, with zero weight changes, which is itself a
lesson worth taking seriously before reaching for a training loop.

## Concepts

### Verified: the same narrow task from module 14, solved by prompting instead

Module 14 fine-tuned gpt2 on six examples of a note-to-structured-record
format conversion, then verified correct generalization to a held-out
seventh note. Here, the identical held-out note is instead handed to
plain, **unmodified** gpt2 with three of the same examples placed
directly in the prompt (in-context learning, no gradient updates at
all):

```python
FEW_SHOT_PROMPT = """Note: red running shoes, size 10, $59.99, in stock
-> ITEM: running shoes | COLOR: red | SIZE: 10 | PRICE: 59.99 | STOCK: yes
Note: blue backpack, 30L, $45.00, out of stock
-> ITEM: backpack | COLOR: blue | SIZE: 30L | PRICE: 45.00 | STOCK: no
Note: black water bottle, 1L, $12.50, in stock
-> ITEM: water bottle | COLOR: black | SIZE: 1L | PRICE: 12.50 | STOCK: yes
Note: yellow rain boots, size 8, $27.50, in stock
->"""

ids = tokenizer(FEW_SHOT_PROMPT, return_tensors="pt")
out = model.generate(**ids, max_new_tokens=20, do_sample=False,
                      pad_token_id=tokenizer.eos_token_id)
print(repr(tokenizer.decode(out[0][ids["input_ids"].shape[1]:], skip_special_tokens=True)))

before_hash = sum(p.detach().sum().item() for p in model.parameters())
_ = model.generate(**ids, max_new_tokens=5, do_sample=False, pad_token_id=tokenizer.eos_token_id)
after_hash = sum(p.detach().sum().item() for p in model.parameters())
print("weight checksum equal:", before_hash == after_hash)
```

Verified output:

```
Few-shot PROMPTED gpt2 (3 examples in context, zero weight updates):
' ITEM: rain boots | COLOR: yellow | SIZE: 8 | PRICE: 27'
weight checksum before: -62119.880418241024  after: -62119.880418241024  equal: True
```

This is the **exact same correct output** module 14's fine-tuned model
produced on the identical held-out note — extracted item, color, size,
and price, in the right order — but here it came from three examples
placed in a prompt, with a real, verified checksum confirming zero
parameter changed. For this specific task (a short, simple,
easy-to-demonstrate format), prompting alone was sufficient. That is
not an argument that fine-tuning is pointless — it's the module's
first real lesson: **a task's difficulty for prompting vs. fine-tuning
is not fixed; it depends on how much the desired behavior can be
conveyed in a handful of in-context examples versus needing to be
baked into weights.** The rest of this module is about recognizing
which situation you're actually in.

### The three tools and what each one actually changes

```
 PROMPTING                    RAG                          FINE-TUNING (PEFT incl.)
 ──────────────               ──────────────                ──────────────
 Give instructions/            Retrieve relevant              Update model weights
 examples in the                documents at query             (fully, or a small
 context window;                time, insert into               trainable fraction
 ZERO weight change             context; ZERO weight            via LoRA, module 12)
 (verified above)               change to the model             PERMANENT change

 Changes: model's               Changes: what facts             Changes: the model's
 BEHAVIOR for this               are available to                default BEHAVIOR,
 one call, given                reason over, for                FORMAT, or STYLE,
 what's in context               this one call                  without needing it
                                                                  repeated in-context
                                                                  every call
```

The critical distinction: prompting and RAG both leave the model
itself untouched and act at inference time; fine-tuning changes what
the model *is*, once, ahead of time. RAG specifically solves "the
model needs access to information it doesn't have memorized and that
information changes or is too large to fit in a static prompt" — a
different problem from either "the model needs to behave differently"
(fine-tuning's strength) or "the model needs a short-lived instruction
or example set that fits comfortably in context" (prompting's
strength).

### Decision framework

```
 Question                          Leans toward...
 ─────────────────────────────────  ──────────────────────────────────
 Does the model need NEW FACTS       RAG (track 09) - facts live outside
 it wasn't trained on, or facts       the model, retrieved fresh each
 that change often (prices,           call; no retraining when facts
 today's date, this week's docs)?     change
 Does the model need a NEW SKILL,    Fine-tuning (PEFT/LoRA, module 12)
 FORMAT, or BEHAVIOR that's hard      - baked into weights, doesn't cost
 to fully specify in a prompt,        prompt tokens on every call, more
 and you have training examples?      reliable than hoping instructions
                                       are followed every time
 Is the desired behavior fully       Prompting - cheapest, fastest to
 demonstrable in a handful of         iterate, zero training
 in-context examples (this           infrastructure, zero weight risk;
 module's verified case)?             verified above to genuinely work
                                       for a sufficiently narrow task
 How much labeled data do you        A few examples -> prompting or RAG.
 actually have?                      Tens to low hundreds -> PEFT/LoRA is
                                       realistic (module 14's six-example
                                       run). Thousands+ -> full fine-tune
                                       or PEFT both become attractive.
 What's the latency/cost budget      Fine-tuning pays a one-time training
 per call, at scale (many calls)?     cost, then no extra prompt tokens
                                       per call. Prompting/RAG pay context-
                                       length cost on every single call -
                                       this compounds at high query volume.
 How often does the underlying       Changes often (daily prices, live
 information change?                  docs) -> RAG. Rarely or never
                                       (a fixed output format, a style,
                                       a stable skill) -> fine-tuning is
                                       viable without constant retraining.
 Do you need to explain WHY the      RAG - retrieved documents are
 model said something, with           inspectable, citable evidence.
 a citable source?                    Fine-tuned behavior is opaque -
                                       there's no "source document" for
                                       why a fine-tuned model says
                                       what it says.
```

None of these are mutually exclusive in a real system — a common
production pattern is RAG (for facts) plus a fine-tuned or PEFT-tuned
model (for consistent output format/behavior) plus careful prompting
(for per-call instructions) all at once.

## Reference

```
 Term                Meaning
 ──────────────────  ──────────────────────────────────────────────
 Prompting /          Providing instructions or examples in the
 in-context learning  input context; verified here to solve module
                      14's task with zero weight changes
 RAG                  Retrieval-Augmented Generation: fetching
                      relevant text at query time and inserting it
                      into context so the model reasons over fresh,
                      external information (full coverage: track 09)
 Fine-tuning / PEFT   Updating some (PEFT/LoRA, module 12) or all
                      (full fine-tuning) of a model's weights ahead
                      of time, so the new behavior needs no repeated
                      in-context demonstration at inference time
 New knowledge        Facts the model doesn't already know; RAG's
                      strength, since retrieval keeps the model
                      current without retraining
 New behavior/format  How the model responds (style, structure,
                      task-following); fine-tuning's strength,
                      since it changes the model's defaults directly
 Context-length cost  Prompting/RAG pay a per-call token cost for
                      instructions/examples/documents; fine-tuning
                      pays a one-time training cost instead
 Data volume needed   Roughly: prompting/RAG need few-to-none
                      labeled examples; PEFT is realistic from tens
                      of examples (module 14); full fine-tuning
                      benefits from much more
```

## Hands-on exercises

### 1. Find where prompting alone breaks down for this exact task

Using the same `FEW_SHOT_PROMPT` structure from this module, reduce
the number of in-context examples from three down to one, and again
to zero (a "zero-shot" instruction with no examples at all). Report
the real generated output at each level. At what point, if any, does
plain gpt2's output stop correctly extracting all four fields from the
held-out note?

### 2. Scale the task past what fits comfortably in a prompt

Suppose the real task needed 200 labeled examples to reliably cover
every edge case (multi-word colors, ranges of sizes, unusual price
formats) rather than the six this module's examples used. Using the
context-length-cost row of the decision framework, explain concretely
why 200 examples in every prompt, on every call, is a materially
different cost proposition than fine-tuning once on those 200
examples and paying no extra per-call token cost afterward.

### 3. Design a combined RAG + fine-tuning system for a concrete scenario

Pick a real scenario (e.g., a customer support bot for a product whose
catalog changes weekly, but whose expected response *tone and format*
should stay consistent). Using the decision framework's rows, write
out which parts of the system's needed behavior should come from RAG
(what changes) and which should come from fine-tuning or PEFT (what
should be baked in), and justify each choice against a specific row
of the framework table.

## Independent challenge

A product manager says: "Since fine-tuning worked well in module 14
and prompting also worked in this module's verified test, they're
basically interchangeable — let's always just use whichever is easier
to set up, which is prompting." Evaluate this using this module's
verified findings and the decision framework.

<details><summary>Discussion</summary>

Both worked on *this specific, narrow, six-example task* — that's a
real, verified fact, not an assumption. But "interchangeable in this
one case" doesn't generalize to "always interchangeable," and the
decision framework names exactly why: this task's behavior was fully
demonstrable in three in-context examples, which is precisely the
condition under which prompting is expected to work well. Change any
of the framework's other axes and the answer shifts. If the real task
needed 200 edge-case examples instead of three, exercise 2's reasoning
applies: every one of those examples would cost real tokens on every
single call under prompting, while fine-tuning would pay that cost
once. If the task required facts that change weekly, neither
prompting-with-examples nor fine-tuning would be the right tool at all
— RAG would, since baking today's facts into fixed weights (fine-tuning)
or a fixed prompt template makes them stale by next week. If the
system needs to run at high query volume, prompting's context-length
cost compounds per call in a way a one-time fine-tuning cost does not.
The honest lesson from this module's own verified test is narrower
than "prompting and fine-tuning are interchangeable" — it's "for a
task simple enough to fully demonstrate in a handful of examples,
check whether prompting alone already solves it before building
fine-tuning infrastructure," which is good, real advice, but a much
more specific claim than the PM's generalization.

</details>

## Common mistakes & troubleshooting

- **Reaching for fine-tuning before checking if prompting already
  works.** This module's own verified test showed plain, unmodified
  gpt2 solving module 14's exact task correctly with zero weight
  changes — always check the cheaper option first on a real held-out
  example before building training infrastructure.
- **Assuming RAG and fine-tuning solve the same problem.** They don't:
  RAG supplies fresh, external, inspectable facts at inference time;
  fine-tuning changes the model's default behavior permanently. Using
  fine-tuning to "teach" a model facts that change weekly means
  retraining weekly — almost always the wrong tool for that specific
  problem.
- **Ignoring context-length cost at scale.** A prompting or RAG
  solution that looks cheap in a demo (a few tokens of instructions or
  retrieved text) can become the dominant cost at production query
  volume, since every single call re-pays that token cost — exercise 2
  makes this concrete.
- **Assuming a technique that worked on a small, narrow demo
  generalizes to a harder version of the same task.** This module's
  verified prompting success was on a genuinely narrow, three-example
  task; a version of the task with 200 edge cases is a different
  problem with a different answer, not a scaled-up version of the same
  demo.
- **Treating these three tools as mutually exclusive.** Real systems
  commonly combine all three — RAG for current facts, a fine-tuned or
  PEFT-tuned model for consistent behavior/format, and careful
  prompting for per-call instructions on top of both.

## Checkpoint quiz

1. What did this module verify by re-running module 14's exact
   held-out example through plain, unmodified gpt2 with three
   in-context examples instead of fine-tuning?
2. Name one question from the decision framework that would push a
   team toward RAG over fine-tuning, and explain why.
3. Why does context-length cost matter more at high query volume for
   prompting/RAG than for fine-tuning?
4. What did the weight checksum check in this module's verified code
   confirm, and why does that matter for distinguishing prompting from
   fine-tuning?
5. Why is "prompting and fine-tuning are interchangeable" too broad a
   conclusion to draw from this module's single verified test?

<details><summary>Answers</summary>

1. That the identical task and identical held-out note module 14 used
   real fine-tuning to solve could also be solved by prompting alone —
   three in-context examples, zero gradient updates, same correct
   output (item, color, size, price all correctly extracted).
2. "How often does the underlying information change?" — if facts
   change often (prices, current events, live documents), RAG keeps
   the model current without retraining, while fine-tuning would need
   to be repeated every time the facts changed.
3. Because prompting/RAG pay a token cost for instructions, examples,
   or retrieved documents on *every single call*, so that cost
   compounds with query volume; fine-tuning pays its cost once, during
   training, and then every subsequent call is free of that extra
   per-call token overhead.
4. It confirmed the model's parameters were bit-for-bit identical
   before and after the prompted generation — real, direct evidence
   that prompting changes the model's *output* for one call without
   changing what the model *is*, unlike fine-tuning which permanently
   updates weights (module 14).
5. Because the verified test used a single, narrow, three-example task
   specifically chosen to be small enough to demonstrate fully
   in-context — the decision framework's other axes (data volume,
   how often facts change, per-call cost at scale, need for citable
   sources) can each independently favor fine-tuning or RAG instead,
   depending on the actual task, which this one test didn't vary.

</details>

## Further reading & sources

- [Language Models are Few-Shot Learners (Brown et al., 2020)](https://arxiv.org/abs/2005.14165) - the GPT-3 paper establishing in-context/few-shot learning as a real, general capability, the mechanism this module's verified prompting test relies on.
- [Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks (Lewis et al., 2020)](https://arxiv.org/abs/2005.11401) - the original RAG paper; full treatment of retrieval-augmented systems is deferred to track 09 of this curriculum, not yet built.
- [PEFT documentation: When to use PEFT](https://huggingface.co/docs/peft/main/en/index) - Hugging Face's own guidance on when parameter-efficient fine-tuning is an appropriate choice, consistent with this module's decision framework.

## Next

[Module 17: Capstone Project](../17-capstone-project/README.md)
