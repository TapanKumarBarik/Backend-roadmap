# Module 09: What LLMs Are Genuinely Good At

## Why this matters

Most failed GenAI projects fail at the *task selection* step, before a
single line of code is written. Someone picks a use case the technology
is structurally bad at, spends three months on prompt engineering, and
concludes "LLMs aren't ready." The model was fine; the task was wrong.

This module gives you a taxonomy for making that judgment in five
minutes. The single most useful principle in it:

> **An LLM is far more reliable at transforming text you give it than at
> recalling text it was trained on.**

"Summarize this document" ships. "What's our refund policy?" hallucinates
— unless you *give* it the policy, converting recall into transformation.
That one reframing is the seed of RAG (track 09), and it will save you
more grief than any prompting trick in track 07.

## Concepts

### The reliability gradient

Sort every LLM task by how much the answer depends on information
*present in the prompt* versus *stored in the weights*.

```
 MOST RELIABLE                                      LEAST RELIABLE
 ◄────────────────────────────────────────────────────────────────►

 TRANSFORM        EXTRACT        GENERATE          RECALL
 the answer is    the answer is  the answer is     the answer must
 IN the prompt,   IN the prompt, judged on         come from
 restated         located        quality, not      TRAINING DATA
                                 correctness
 ─────────────    ───────────    ────────────      ──────────────
 summarize        pull dates     write marketing   "what is our
 translate        find entities  copy              refund policy?"
 rewrite tone     parse invoice  brainstorm        "who won X in
 reformat         classify       draft an email    1987?"
 fix grammar      route ticket   name a product    "cite a study"

 ✓ verifiable      ✓ verifiable   ~ subjective     ✗ silently wrong
   against the      against the     but low stakes    with total
   input            input                             confidence

         └──────────────────────────┬──────────────────────┘
                                    │
                    RAG (track 09) works by DRAGGING tasks
                    from the right end to the left end:
                    retrieve the policy, paste it in the prompt,
                    and "recall" becomes "transform"
```

Internalize the arrow. When a stakeholder proposes a use case, locate it
on this line first. If it lands on the right, your job is not prompt
engineering — it's finding a way to put the needed information into the
prompt.

### The four task families, concretely

**Transformation** — input text in, altered text out. Summarization,
translation, tone rewriting, format conversion, grammar correction, code
explanation. The source material is right there; the model restructures
it. This is where LLMs are genuinely excellent and where most durable
production value lives.

**Extraction** — pull structured data out of unstructured text. Dates,
names, amounts, sentiment labels, categories. Reliable *and* verifiable,
because you can check the extracted value appears in the source. Track 07's
structured outputs make this robust enough to build on.

**Generation** — produce new content judged on quality rather than
correctness. Marketing copy, brainstormed names, first drafts. Low risk
precisely because there's no fact to get wrong — but a human is normally
in the loop.

**Recall** — answer from training data alone. The model has no index, no
citation mechanism, and no ability to distinguish "I learned this" from
"this is a plausible-sounding sentence." This is where hallucination
lives, covered in module 10.

### Where LLMs beat the classical alternative

Traditional NLP didn't disappear. It's still faster and cheaper for
well-defined, high-volume, stable tasks. The honest comparison:

| Situation | Reach for |
|---|---|
| Fixed label set, thousands of training examples, millions of predictions/day | Classical classifier (cheaper, faster, deterministic) |
| Labels change monthly; no labeled data; hundreds of predictions/day | LLM (no training set needed) |
| Exact string/pattern matching | Regex — genuinely, don't call a model |
| Messy input, many edge cases, needs "understanding" | LLM |
| Sub-10ms latency budget | Not an LLM |
| Novel task, need a prototype today | LLM, then measure |

The LLM's real superpower here is **zero marginal cost per new task.**
A sentiment classifier took weeks of labeling; now it's a prompt. That
economics shift, not raw accuracy, is why LLMs took over.

### The capability nobody expected: code

Code turned out to be an unusually good fit, for reasons worth knowing:

```
 WHY CODE WORKS SO WELL

  ✓ enormous, high-quality public training corpus (GitHub)
  ✓ rigid, learnable syntax -- fewer ambiguities than prose
  ✓ VERIFIABLE -- it compiles, tests pass, or it doesn't
      └── this is the big one: an automatic correctness oracle
          that no other LLM task has
  ✓ strong local structure -- the next line is highly predictable
    from the surrounding lines
```

That verifiability point matters beyond code. Any task where you can
*mechanically check* the output is a task where an LLM's unreliability
becomes manageable — you retry, or you fall back. Track 15 is largely
about manufacturing such checks for tasks that don't come with one.

### A practical decision procedure

```
 ┌─────────────────────────────────────────────┐
 │ 1. Is the information needed IN the prompt?  │
 │        no ──► can I retrieve it and put it   │
 │               there? (RAG, track 09)         │
 │                 no ──► reconsider the task   │
 ├─────────────────────────────────────────────┤
 │ 2. Can I verify the output mechanically?     │
 │        yes ──► strong candidate              │
 │        no  ──► need human review or eval     │
 │                harness (track 15)            │
 ├─────────────────────────────────────────────┤
 │ 3. What's the cost of being wrong?           │
 │        high ──► human in the loop, always    │
 ├─────────────────────────────────────────────┤
 │ 4. Would a regex / classifier / SQL query    │
 │    do this?                                  │
 │        yes ──► use that instead              │
 └─────────────────────────────────────────────┘
```

Step 4 gets skipped constantly and is the cheapest win in the list.

## Reference

| Term | Means |
|---|---|
| Transformation task | Answer derived from text in the prompt |
| Extraction task | Structured data pulled from unstructured input |
| Generation task | New content judged on quality, not correctness |
| Recall task | Answer must come from training weights — highest risk |
| Grounding | Supplying source material in the prompt so recall becomes transformation |
| Verifiability | Whether output correctness can be checked mechanically |
| Zero marginal task cost | A new task is a new prompt, not a new training run |

| Task | Approach |
|---|---|
| Summarize / translate / rewrite | LLM, low temperature |
| Extract fields | LLM + structured outputs (track 07) |
| Classify into a stable label set at scale | Classical classifier or a small fine-tune |
| Answer from private documents | RAG (track 09), never bare recall |
| Answer about live data | Tool calling (track 10) |
| Exact pattern match | Regex |

## Hands-on exercises

Install once: `pip install openai` (or use any chat model's web UI — the
point of these exercises is judgment, not plumbing).

### 1. Place tasks on the reliability gradient

For each, name the family (transform / extract / generate / recall) and
predict reliability before testing:

1. "Summarize this 2-page contract."
2. "What was the closing price of AAPL yesterday?"
3. "Rewrite this error message to be friendlier."
4. "Extract every email address from this text."
5. "What does our company's PTO policy say?"
6. "Suggest ten names for a dog-walking app."
7. "Translate this README to Spanish."
8. "Which section of the attached policy covers refunds?"

<details><summary>Answer</summary>

Transform: 1, 3, 7. Extract: 4, 8 (note 8 is extraction *because* the
policy is attached — the same question without the attachment would be
recall). Generate: 6. Recall — highest risk: 2, 5.

Item 2 is unfixable by any model, at any scale, because the information
postdates training — it needs a tool call (track 10). Item 5 is fixable
by retrieving the policy and pasting it in, which converts it to
extraction — that is exactly what RAG does, and the contrast between 5
and 8 is the whole idea in one pair.
</details>

### 2. Demonstrate the transform-vs-recall gap

Pick a document you have locally — a README from this repo works well.
Ask a chat model two questions:

- **Recall version:** "In the Backend-roadmap curriculum, what does track
  09 cover?" (no context given)
- **Transform version:** paste the contents of `genai/README.md`, then
  ask the identical question.

Record both answers and verify against the real file. Write one paragraph
on the difference — this is the single most important empirical result in
track 00, and doing it yourself beats reading about it.

### 3. Exploit verifiability

```python
# The task: generate a function, then MECHANICALLY check it.
task = """Write a Python function `is_palindrome(s: str) -> bool` that
ignores case, spaces and punctuation. Return only the code."""

# ... call your LLM of choice, put the result in `code` ...
code = """
def is_palindrome(s: str) -> bool:
    cleaned = ''.join(c.lower() for c in s if c.isalnum())
    return cleaned == cleaned[::-1]
"""

ns = {}
exec(code, ns)
fn = ns["is_palindrome"]

cases = [("racecar", True), ("A man, a plan, a canal: Panama", True),
         ("hello", False), ("", True), ("No 'x' in Nixon", True)]

passed = sum(fn(inp) == want for inp, want in cases)
print(f"{passed}/{len(cases)} tests passed")
```

Now the key exercise: **write the retry loop.** If tests fail, feed the
failures back to the model and ask for a fix, up to 3 attempts. You've
just built the simplest possible agent (track 10) — a generate-verify-
retry loop — and the only reason it works is that this task has an
automatic correctness oracle.

### 4. Prove the regex point

```python
import re, time

text = "Contact alice@example.com or bob.smith@company.co.uk for details."

t0 = time.perf_counter()
found = re.findall(r"[\w.+-]+@[\w-]+\.[\w.-]+", text)
dt = time.perf_counter() - t0

print(f"regex: {found}  in {dt*1e6:.0f} microseconds, $0.00")
```

Time an LLM call doing the same extraction and compare on three axes:
latency, cost, and determinism. Then write one sentence on when the LLM
*would* be the right choice for extraction (hint: think about what
happens when the input format varies unpredictably).

### 5. Build a task-suitability scorecard

Score five real tasks from your own work or a plausible product on this
rubric, 1-5 each:

- Information is in the prompt (5) vs. must be recalled (1)
- Output is mechanically verifiable (5) vs. purely subjective (1)
- Cost of an error is trivial (5) vs. severe (1)
- No simpler tool would do (5) vs. a regex would do (1)

Total 16-20 means build it now. Below 10 means either reshape the task
(usually by adding retrieval or tools) or don't use an LLM.

### 6. Diagnose and fix: the doomed project

A team is building "an AI assistant that answers employee HR questions."
Their plan: a carefully engineered system prompt listing company policies
in summary form, then let the model answer.

They're four weeks in, and it confidently invents specifics — leave day
counts, eligibility windows — that aren't in the summary. Diagnose using
this module's framework and prescribe a fix.

<details><summary>Answer</summary>

They've built a recall task and are trying to fix it with prompting. A
policy *summary* in the system prompt doesn't contain the specifics
employees ask about, so when a detail is missing the model does what
next-token prediction does: it produces a plausible continuation. A
number is expected there, so a number appears. No amount of "do not make
things up" instruction reliably fixes this, because the model has no
mechanism to distinguish recalled fact from plausible completion (module
10).

The fix is to move the task left along the gradient — retrieve the
*actual policy text* relevant to each question and put it in the prompt,
then require the answer to quote or cite it, and have it say "not covered
in the provided documents" when retrieval returns nothing relevant. That
is RAG (track 09), plus the citation and refusal behaviours from track 15.

The secondary fix: eligibility calculations (dates, tenure, accrual)
should be *computed*, not generated — a tool call to real HR data
(tracks 10 and 13), not a language model doing arithmetic on a summary.
</details>

## Independent challenge

Take a real workflow you or a colleague performs weekly that involves
text — triaging emails, reviewing PRs, writing status updates, processing
invoices. Decompose it into atomic steps.

For each step produce: the task family, its position on the reliability
gradient, whether output is mechanically verifiable, and your build
recommendation (LLM / LLM+retrieval / LLM+tool / classical / don't
automate).

Then build the **single highest-scoring step only** and measure it on 10
real inputs: how many outputs were correct, and how many needed human
correction.

The deliverable is the measurement, not the demo. Most people build the
flashiest step; this exercise is practice in building the one that
actually works.

## Common mistakes & troubleshooting

- **Treating recall tasks as prompt-engineering problems.** No prompt
  makes a model reliably retrieve facts it may not have stored. Move the
  task left on the gradient instead (exercise 6).
- **Skipping the "would a regex do this?" check.** Deterministic, free,
  microseconds. A shocking amount of production LLM spend is doing what
  `str.split()` would.
- **Using an LLM for high-volume stable classification.** If the label
  set is fixed and you have data, a classifier is cheaper by orders of
  magnitude and gives you a confusion matrix.
- **Assuming code generation quality generalizes.** Code is unusually
  well-suited (huge corpus, rigid syntax, automatic verification). Don't
  infer prose-task reliability from a good Copilot experience.
- **Not exploiting verifiability where it exists.** If you can check the
  output, you can retry — which turns an 80%-reliable model into a
  99%-reliable system for free.
- **Evaluating on the demo case.** Try the ambiguous, the malformed and
  the adversarial input before deciding a task works.

## Checkpoint quiz

1. State the reliability gradient in one sentence.
2. Why is "summarize this document" more reliable than "what does our
   policy say?"
3. How does RAG change a task's position on the gradient?
4. Name the four task families and give an example of each.
5. Why is code generation unusually reliable, and which property matters
   most?
6. Give two situations where a classical ML model beats an LLM.
7. What makes verifiability so valuable in a GenAI system?

<details><summary>Answers</summary>

1. LLMs are far more reliable at transforming information present in the
   prompt than at recalling information stored in their weights.
2. The document is *in the prompt* — the model restructures material it
   can see, and the output can be checked against the input. The policy
   question depends on training-data recall, where the model cannot
   distinguish a stored fact from a plausible-sounding completion.
3. It moves it left: retrieval fetches the relevant source text and puts
   it into the prompt, converting a recall task into a transformation or
   extraction task.
4. Transformation (summarize/translate), extraction (pull dates from an
   invoice), generation (brainstorm product names), recall (answer a
   trivia question from memory).
5. Huge high-quality corpus, rigid syntax, strong local structure — and
   most importantly, it is *automatically verifiable*: it compiles and
   the tests pass, or they don't.
6. Any two of: fixed label set with plenty of labeled data at high
   volume (cheaper, faster, deterministic); sub-10ms latency budgets;
   exact pattern matching where a regex suffices.
7. It converts an unreliable component into a reliable system — you can
   check, retry on failure, and fall back, which is also the foundation
   of the generate-verify loop that agents (track 10) are built on.
</details>

## Further reading & sources

- [Sparks of Artificial General Intelligence: Early experiments with GPT-4 (Bubeck et al., Microsoft Research, 2023)](https://arxiv.org/abs/2303.12712) - the broadest survey of what GPT-4-class models can do, with the caveat that it is an enthusiastic paper; read it alongside module 10's limitations.
- [Evaluating Large Language Models Trained on Code (Codex paper, Chen et al., 2021)](https://arxiv.org/abs/2107.03374) - the paper behind Copilot, and the source of the `pass@k` metric that formalizes exercise 3's verify-and-retry idea.
- [Anthropic: Define your success criteria](https://docs.anthropic.com/en/docs/build-with-claude/define-success) - a practical framework for deciding whether a task is LLM-appropriate before you build it, from a provider with an incentive to say yes.
- [OpenAI Cookbook](https://cookbook.openai.com/) - working recipes organized by task type; the fastest way to see which task families have well-trodden paths.
- [Emerging Architectures for LLM Applications (a16z, 2023)](https://a16z.com/emerging-architectures-for-llm-applications/) - the reference diagram for how these task types get assembled into real systems; previews module 11.
- [Task Contamination: Language Models May Not Be Few-Shot Anymore (Li & Flanigan, 2023)](https://arxiv.org/abs/2312.06256) - why benchmark performance overstates real-world capability, and why exercise 5's own-task scorecard beats trusting a leaderboard.
- [Prompt Engineering Guide: LLM task taxonomy](https://www.promptingguide.ai/introduction/examples) - worked examples across each task family covered here.

## Next

[Module 10: Limitations — Hallucination, Knowledge Cutoff, Reasoning](../10-limitations-hallucination-knowledge-cutoff-reasoning/README.md)
