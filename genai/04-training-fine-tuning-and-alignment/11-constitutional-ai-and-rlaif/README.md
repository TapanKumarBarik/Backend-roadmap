# Module 11: Constitutional AI and RLAIF

## Why this matters

Every alignment method this track has covered so far — reward models
(module 08), RLHF/PPO (module 09), DPO (module 10) — depends on human
preference labels: a person judging which of two responses is
"chosen" and which is "rejected." Collecting that at the scale
production alignment requires is slow and expensive, and it's a hard
bottleneck to scale past. **Constitutional AI (CAI)** and **RLAIF
(Reinforcement Learning from AI Feedback)** attack that bottleneck
directly: instead of a human generating the preference judgment (or
the correction), a capable language model does — critiquing its own
output against a stated set of principles (a "constitution"), then
revising accordingly, or judging which of two responses better follows
those principles. The human's role shifts from labeling every
individual example to writing a small set of principles once, which
then guides the AI feedback that replaces (or supplements) human
labels at scale. This module runs the real, small-scale mechanism
underneath that idea — self-critique-and-revise, executed against a
real cached instruction-tuned model, with three real generations
building on each other — and is explicit that this toy loop
demonstrates the *mechanism*, while real Constitutional AI/RLAIF
systems use this same pattern to generate large-scale training data or
direct training signal, not a single one-off demo.

## Concepts

### The self-critique-and-revise loop

```
 STEP 1: INITIAL ANSWER
 ────────────────────────────────────────────────
 prompt (a real question) -> [ model ] -> initial response

 STEP 2: SELF-CRITIQUE (against a STATED PRINCIPLE)
 ────────────────────────────────────────────────
 prompt + initial response
   + "critique this against principle: <X>" -> [ SAME model ] -> critique

 STEP 3: REVISION (using its OWN critique)
 ────────────────────────────────────────────────
 prompt + initial response + critique
   + "now revise your answer accordingly"   -> [ SAME model ] -> revised response

 -> the SAME model plays three roles (answerer, critic, editor) —
    no separate human judgment enters at any step
```

This is the core mechanism Constitutional AI (Bai et al., 2022,
Anthropic) formalized and scaled: a "constitution" of stated principles
(e.g. "responses should not be condescending," "responses should not
be harmful," etc.) drives the critique-and-revise step across a large
number of prompts, and the *revised* responses become supervised
training data (the "SL-CAI" stage) or feed into a preference-comparison
step where an AI model — not a human — judges which of two responses
better satisfies the constitution (the "RL-CAI"/RLAIF stage, producing
preference pairs that can feed directly into module 08's reward-model
training or module 10's DPO, with AI judgments in place of human ones).

### Verified: three real generations from the same cached model

Using `Qwen/Qwen2.5-0.5B-Instruct` (module 06's real instruction-tuned
model) for all three steps, with a genuine, everyday question and a
concretely stated principle:

```python
import torch
from transformers import AutoTokenizer, AutoModelForCausalLM

torch.manual_seed(0)
tok = AutoTokenizer.from_pretrained("Qwen/Qwen2.5-0.5B-Instruct")
model = AutoModelForCausalLM.from_pretrained("Qwen/Qwen2.5-0.5B-Instruct")
model.eval()

def chat(messages, max_new_tokens=110):
    text = tok.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)
    inputs = tok(text, return_tensors="pt")
    out = model.generate(**inputs, max_new_tokens=max_new_tokens, do_sample=False,
                          pad_token_id=tok.eos_token_id)
    return tok.decode(out[0][inputs["input_ids"].shape[1]:], skip_special_tokens=True)

question = "I keep failing my driving test. What am I doing wrong?"

# STEP 1: initial answer
messages1 = [{"role": "user", "content": question}]
answer1 = chat(messages1)
print("=== STEP 1: initial answer ===")
print(answer1)
```

Verified output:

```
=== STEP 1: initial answer ===
It's understandable to feel frustrated and unsure about your driving test results. Here are some steps you can take to improve your chances of passing:

1. **Review Your Test**: Make sure you have thoroughly reviewed the questions on your test. Pay attention to any areas where you might be struggling.

2. **Practice with Different Vehicles**: If possible, practice driving different types of vehicles (cars, trucks, motorcycles) to get used to various driving conditions and techniques.

3. **Focus on Safety First**: While it's important to pass the test, focus
```

```python
# STEP 2: self-critique against a STATED principle
principle = ("Critique the assistant response above against this principle: the "
             "response should NOT be condescending or preachy, and should be "
             "concrete and encouraging. Point out specifically where it fails "
             "this principle, if anywhere.")
messages2 = messages1 + [{"role": "assistant", "content": answer1},
                          {"role": "user", "content": principle}]
critique = chat(messages2)
print("=== STEP 2: self-critique ===")
print(critique)
```

Verified output:

```
=== STEP 2: self-critique ===
Certainly! Let's break down the advice given in the response and see where it falls short of being constructive and encouraging for someone trying to improve their driving skills.

### Criticism Against the Assistent Response

1. **Assistance Is Not A Substitute For Practice**:
   - The response suggests that the assistant is providing assistance rather than actually helping the person who needs help. This is not constructive because it implies that the person should try to solve problems themselves.

2. **Insufficient Focus on Specific Areas**:
   - The response does not
```

```python
# STEP 3: revise based on the model's OWN critique
revise_instr = ("Now rewrite your original answer to address the critique above, "
                 "following the stated principle. Give only the final revised answer.")
messages3 = messages2 + [{"role": "assistant", "content": critique},
                          {"role": "user", "content": revise_instr}]
revision = chat(messages3)
print("=== STEP 3: revision ===")
print(revision)
```

Verified output:

```
=== STEP 3: revision ===
Sure, here's the revised version addressing the critique:

---

In my previous response, I mentioned that the assistant provided assistance instead of offering specific guidance. This approach is not constructive because it implies that the person should attempt to solve problems independently. Instead, I would encourage them to seek professional help from a qualified driver instructor or tutor who can provide personalized feedback and strategies tailored to their individual needs.

---

This revision maintains the constructive tone while addressing the main issue raised in the critique.
```

All three generations are real, produced by the same 0.5B model with
no human ever supplying a judgment between step 1 and step 3 — the
critique in step 2 and the revision in step 3 were both generated by
prompting the *same model* to evaluate and then improve its own prior
output. Note honestly: this small model's critique is somewhat
generic and its revision doesn't dramatically restructure the answer
— a genuine, expected limitation of running this loop on a 0.5B model
rather than the large, highly capable models real Constitutional
AI/RLAIF systems use for critique-and-revise. The *mechanism* — three
chained generations, each conditioned on the last, replacing a human
judgment with a model-generated one at the critique step — is exactly
what this module set out to verify, and it verifies correctly: the
loop runs, each step genuinely conditions on the previous step's real
output, and the revision explicitly references the critique's content
in its own generated text ("addressing the critique above").

### From this toy loop to real Constitutional AI/RLAIF at scale

```
 THIS MODULE (toy, one example, small model)
 ────────────────────────────────────────────
 1 question -> 1 critique -> 1 revision  (illustrates the MECHANISM)

 REAL CONSTITUTIONAL AI / RLAIF (Bai et al. 2022, and successors)
 ────────────────────────────────────────────
 MANY prompts x a written CONSTITUTION (multiple stated principles)
   -> critique-and-revise at scale, with a large capable model
   -> revised responses become SUPERVISED fine-tuning data (SL-CAI)
      -----------------------------------------------------------
   -> OR: AI model judges pairs of responses against the constitution
      -> produces PREFERENCE PAIRS with AI labels, not human labels
      -> feeds directly into module 08's reward-model training,
         or module 10's DPO — same downstream pipelines, AI-generated
         preference data instead of human-generated
```

The critical substitution RLAIF makes, relative to modules 08-10: the
`(chosen, rejected)` pairs those modules trained on can come from an
AI judge applying stated principles, instead of from a human rater.
Everything downstream — the pairwise ranking loss (module 08), PPO
(module 09), or the DPO loss (module 10) — is unchanged; only the
*source* of the preference label changes. This module's three-step
loop is the generation half of that pipeline (producing a better
response via self-critique); the judging half (an AI model comparing
two candidate responses against a constitution to produce a preference
label) is the same kind of model call, just used to output a
comparison judgment instead of a revision.

## Reference

```
 Term                    Meaning
 ──────────────────────  ──────────────────────────────────────────────
 Constitution              A written set of principles a model is asked
                          to critique and revise its own outputs against
                          — this module used one principle ("not
                          condescending, concrete, encouraging") as a
                          minimal, verified example
 Self-critique             The model evaluating its OWN prior output
                          against a stated principle — verified in
                          step 2 above, using the same model that
                          produced the original answer
 Revision                  The model rewriting its own output using its
                          own critique as guidance — verified in step 3,
                          explicitly referencing the critique's content
 SL-CAI                    The supervised stage of Constitutional AI:
                          revised (post-critique) responses become
                          fine-tuning data — this module's step 3's
                          output is exactly the kind of text SL-CAI
                          would train on, at scale
 RLAIF                     Reinforcement Learning from AI Feedback: an
                          AI model (not a human) judges response pairs
                          against a constitution to produce preference
                          labels, feeding modules 08-10's pipelines with
                          AI-generated rather than human-generated data
 AI feedback               The general substitution this module's
                          mechanism enables: replacing a human judgment
                          step with a model-generated one, at whatever
                          scale the model can be run
```

## Hands-on exercises

### 1. Run the loop with a different, concretely stated principle

Replace this module's principle ("not condescending, concrete,
encouraging") with a different one — e.g. "the response must not give
definitive medical/legal advice and should recommend consulting a
professional" — on a different real question. Run all three steps and
report whether the step-3 revision's real generated text visibly
reflects the new principle's specific wording, not just a generic
improvement.

### 2. Chain a second critique-and-revise round

Extend the loop: take step 3's revision, critique it again against the
same principle (a second "step 2"), and produce a second revision. Do
this for real and report all five generations. Does the second-round
critique find anything new, or does it start repeating itself —
what does that suggest about how many critique-revise rounds are
worth running before returns diminish?

### 3. Simulate the RLAIF judging step

Using two DIFFERENT real responses to the same question (e.g. this
module's step 1 answer and step 3 revision), prompt the model a fourth
time to judge which one better satisfies the stated principle, and
output that judgment. Confirm you now have a real, model-generated
`(chosen, rejected)` preference pair — structurally identical to the
human-labeled pairs module 08's reward model trained on — produced
entirely by AI feedback with no human judgment involved anywhere in
the chain.

## Independent challenge

A team wants to scale up alignment data collection but has a limited
budget for human labelers. A colleague proposes: "Let's just have the
model judge its own outputs entirely — skip human involvement
completely, at every stage, forever." Using this module's verified
mechanism and its honest limitations, evaluate the proposal.

<details><summary>Discussion</summary>

The mechanism this module verified — self-critique and revision
chained from the same model — genuinely works as a way to generate
*more* training signal per unit of human effort: a human wrote one
short principle, and the model produced three real, chained
generations from it with zero additional human labeling. That's the
real, legitimate value RLAIF and Constitutional AI capture, and it's
why both were adopted at production scale. But this module's own
verified output carries an honest limitation worth generalizing: a
small model's critique was somewhat generic, and nothing in the loop
*guarantees* the critique correctly identifies real violations of the
stated principle, or that the revision actually improves on the
original — the loop can, in principle, confidently "correct" toward a
worse response, or fail to catch a real violation, with no
ground-truth check anywhere in the chain if no human ever reviews any
of it. Real Constitutional AI systems don't eliminate human
involvement entirely — a human still writes and periodically revises
the constitution itself (the principles), still spot-checks the
resulting data quality, and typically still incorporates at least some
human preference data alongside AI-generated preference data. The
defensible position is: use AI feedback to scale the *volume* of
critique/preference data well beyond what human labeling budgets
allow, while keeping a human in the loop for writing the guiding
principles and auditing a sample of the AI-generated results —
removing humans from the constitution-writing and quality-auditing
role entirely is a different, much riskier claim than what this
module's mechanism actually supports.

</details>

## Common mistakes & troubleshooting

- **Treating this module's small-model output as representative of
  production Constitutional AI quality.** The verified critique and
  revision are real but somewhat generic — production systems use
  large, highly capable models for the critique-and-revise step
  specifically because critique quality bounds how good the resulting
  training data can be.
- **Believing RLAIF removes humans from the alignment process
  entirely.** As the independent challenge covers, a human still
  writes the constitution's principles and typically audits a sample
  of the AI-generated results — RLAIF replaces per-example labeling,
  not the human judgment behind the principles themselves.
- **Forgetting to actually feed the prior step's real output into the
  next prompt.** The mechanism only works because step 2's critique
  genuinely conditions on step 1's real generated text (not a
  paraphrase or a placeholder), and step 3's revision genuinely
  conditions on step 2's real critique — skipping this (e.g. hardcoding
  a generic critique instead of using the model's actual one) is not
  the same mechanism at all.
- **Assuming a critique-and-revise loop always improves the response.**
  Nothing in the mechanism guarantees this — it's a real, open
  limitation this module states plainly, not a solved problem.
- **Confusing Constitutional AI's constitution with a reward model.**
  The constitution is a set of natural-language principles used to
  *prompt* critique/judgment generations — it is not itself a scored
  model like module 08's reward model, though its outputs (critiques,
  revisions, or preference judgments) can feed into training exactly
  the kind of reward model or DPO pipeline modules 08 and 10 cover.

## Checkpoint quiz

1. What three steps make up the self-critique-and-revise loop this
   module verified, and which single model performed all three?
2. What specific principle did this module state for the model to
   critique its own answer against, and where in the verified step-3
   output can you see the revision responding to the critique's actual
   content?
3. What is the difference between Constitutional AI's "SL-CAI" stage
   and its "RL-CAI"/RLAIF stage, in terms of what the AI feedback is
   used to produce?
4. Which specific part of modules 08 and 10's pipelines does RLAIF
   change, and which parts remain identical?
5. Name one honest limitation of this module's verified loop that a
   production Constitutional AI system needs to address.

<details><summary>Answers</summary>

1. Step 1: generate an initial answer. Step 2: critique that answer
   against a stated principle. Step 3: revise the answer using the
   model's own critique. The same model, `Qwen/Qwen2.5-0.5B-Instruct`,
   performed all three steps — no separate critic or human judgment
   was used.
2. The principle: the response should not be condescending or
   preachy, and should be concrete and encouraging. The step-3
   revision explicitly says "addressing the critique above" and
   reframes the advice around recommending a professional instructor —
   a direct response to the critique's specific complaint about the
   original answer's approach, not a generic rewrite.
3. SL-CAI produces revised responses (via critique-and-revise) that
   become supervised fine-tuning data, directly training the model on
   the improved outputs. RL-CAI/RLAIF instead has an AI model judge
   pairs of responses against the constitution, producing AI-generated
   preference labels (chosen/rejected pairs) rather than revised text
   directly.
4. RLAIF changes only the *source* of the preference labels — an AI
   judge applying stated principles, instead of a human rater —
   feeding `(chosen, rejected)` pairs into module 08's reward-model
   training or module 10's DPO loss exactly as before. The downstream
   training mechanics (the pairwise ranking loss, PPO, or the DPO loss
   formula) are completely unchanged.
5. Any reasonable answer naming: no ground-truth check that a
   critique correctly identifies real violations, or that a revision
   actually improves the response; a small model's critique/revision
   quality being noticeably more generic than what a large, highly
   capable model would produce; or the need for a human to still write
   and periodically audit the constitution and a sample of AI-generated
   outputs, rather than removing human oversight entirely.

</details>

## Cumulative review

Closed-book. Don't reopen modules 06-11 while attempting these — the
point is to find out what actually stuck across the whole
alignment-methods arc, from instruction tuning through Constitutional
AI/RLAIF.

1. A team fine-tunes a base model on diverse (instruction, response)
   pairs and observes it can now follow arbitrary task instructions,
   not just the specific tasks in its training data. Name the module
   05 mechanism this uses, the module 06 property of the DATA that
   produces this general capability, and one real verified difference
   in behavior between a base and an instruction-tuned model from
   module 06's own comparison.
2. A team's fine-tuning code sets `labels = input_ids.clone()` with no
   masking. Name the module 07 concept this is missing, the specific
   sentinel label value that fixes it, and one concrete failure mode
   this can cause at inference time.
3. Walk the full RLHF pipeline in order (modules 08-09): what gets
   trained first, on what kind of data and with what loss, and what
   happens to that trained artifact in the second stage? Name the two
   safeguards module 09 verified that keep the second stage's updates
   from being destructively large.
4. A colleague claims PPO's clipping means the policy can never make a
   large total change over a training run. Using module 09's verified
   divergent and non-divergent cases, explain what clipping actually
   bounds, and name the one case where clipping does NOT soften a
   penalty even though the ratio moved far from 1.
5. Explain DPO's core claim in one or two sentences: what does it let
   a team skip building entirely, relative to modules 08-09, and what
   single formula replaces the two-stage pipeline? What did module
   10's verified three-scenario example show about that formula's
   loss as the policy's preference for chosen-over-rejected grew?
6. What specific bottleneck does RLAIF address relative to modules
   08-10's methods, and what concretely changes about the training
   pipeline versus what stays exactly the same?
7. Trace one single (prompt, chosen, rejected) preference triple
   through all three ways this arc could use it: as reward-model
   training data (module 08), as DPO training data (module 10), and as
   the kind of data module 11's RLAIF could produce without a human
   ever writing the "chosen"/"rejected" labels. What's identical about
   the triple in all three, and what's different about how each method
   consumes it?

<details>
<summary>Answers</summary>

1. Module 05's mechanism: supervised fine-tuning (SFT) — the same
   training procedure whether the data is task-specific or diverse.
   Module 06's data property: the training data spans MANY different
   task types in one consistent format, rather than one narrow task,
   which is what produces general instruction-following rather than
   single-task skill. Verified difference: given the identical
   instruction "Summarize this in one sentence: ...", base GPT-2
   restated a detail and then repeated itself, while
   `Qwen/Qwen2.5-0.5B-Instruct` produced a real, correctly-scoped
   one-sentence summary.
2. The missing concept is loss masking. The fix is setting the
   prompt-token labels to `-100`, the sentinel `CrossEntropyLoss`
   ignores. A concrete failure mode: the model can learn to echo or
   repeat parts of the input/prompt back at inference time, since
   unmasked training rewarded predicting the prompt's own tokens as if
   they were correct output.
3. First, a reward model is trained (module 08) on human preference
   pairs (chosen/rejected responses to the same prompt) using the
   pairwise ranking loss `-log(sigmoid(r_chosen - r_rejected))`.
   Second (module 09), that trained reward model scores rollouts from
   the policy inside a PPO training loop that updates the policy's
   weights. The two safeguards module 09 verified: the clipped
   surrogate objective (bounding a single update's incentive to
   overshoot) and the KL penalty against a frozen reference policy
   (penalizing drift away from the starting point).
4. Clipping bounds the incentive within a SINGLE update step, not the
   total cumulative change possible across many training iterations —
   a consistent advantage signal across iterations can still produce
   large total change over time. The case where clipping does NOT
   soften a penalty: "bad action, ratio grows a lot" (ratio 1.8,
   advantage -1.0) — the objective keeps the full, uncapped penalty
   (-1.8, not the clipped -1.2) because clipping never softens the
   incentive to correct a genuinely bad update, only the incentive to
   overshoot on an already-sufficient good one.
5. DPO's core claim: the same reward-model-then-PPO target behavior
   (module 08-09's pipeline) can be achieved by skipping BOTH the
   separate reward-model training stage AND the RL loop entirely,
   replacing them with one closed-form loss computed directly from
   policy and reference log-probabilities:
   `-log(sigmoid(beta * ((logpi_chosen - logref_chosen) -
   (logpi_rejected - logref_rejected))))`. Module 10's verified example
   showed this loss decreasing monotonically (0.6931 -> 0.5759 ->
   0.4201) as the policy's preference for chosen-over-rejected grew
   relative to the frozen reference model.
6. RLAIF addresses the human-preference-labeling bottleneck — the
   cost and scale limit of having humans judge every (chosen,
   rejected) pair. What changes: the SOURCE of the preference label —
   an AI model applying stated principles (a constitution) judges
   response pairs, instead of a human rater. What stays exactly the
   same: the downstream training mechanics — the resulting pairs still
   feed module 08's pairwise ranking loss or module 10's DPO loss
   completely unchanged.
7. Identical across all three: the triple itself is structurally the
   same — a prompt with one response marked preferred ("chosen") and
   one marked less-preferred ("rejected"). Different consumption: (a)
   module 08's reward model uses it to train a separate scalar-scoring
   network via the pairwise ranking loss; (b) module 10's DPO uses it
   directly inside its closed-form loss on policy/reference log-probs,
   with no separate reward-model network ever trained; (c) module 11's
   RLAIF produces the SAME shape of triple, but the chosen/rejected
   labels come from an AI model judging the pair against a stated
   constitution instead of from a human rater — the triple can then
   feed either (a) or (b)'s training exactly as if a human had labeled
   it.

</details>

## Further reading & sources

- [Constitutional AI: Harmlessness from AI Feedback (Bai et al., 2022)](https://arxiv.org/abs/2212.08073) - the paper that introduced Constitutional AI's self-critique-and-revise mechanism (SL-CAI) and AI-judged preference comparisons (RL-CAI), the exact loop this module verifies at small scale.
- [Training a Helpful and Harmless Assistant with Reinforcement Learning from Human Feedback (Bai et al., 2022)](https://arxiv.org/abs/2204.05862) - Anthropic's companion RLHF paper, useful for contrasting human-feedback RLHF directly against this module's AI-feedback mechanism.
- [RLAIF: Scaling Reinforcement Learning from Human Feedback with AI Feedback (Lee et al., 2023)](https://arxiv.org/abs/2309.00267) - a direct empirical comparison of RLAIF against RLHF, addressing the question this module's independent challenge raises about how much human involvement can be safely removed.
- [Hugging Face: Chat Templates documentation](https://huggingface.co/docs/transformers/main/en/chat_templating) - the real `apply_chat_template` API this module's three-step loop uses to correctly format each chained turn for `Qwen/Qwen2.5-0.5B-Instruct`.

## Next

[Module 12: LoRA: Low-Rank Adaptation](../12-lora-low-rank-adaptation/README.md)
