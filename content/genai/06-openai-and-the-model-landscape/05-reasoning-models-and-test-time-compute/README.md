# Module 05: Reasoning Models and Test-Time Compute

## Roadmap

You are in Track 06, **OpenAI & the Model Landscape**. [Module 03: Streaming Responses](../03-streaming-responses/README.md) showed how a response is delivered and defined time to first token; [Module 04: Model Families and Generations](../04-model-families-and-generations/README.md) taught you to describe a model on a few axes, one of which, *reasoning or not*, is this module's subject. Sampling (why the same prompt can give different answers) is Track 01's [Module 16: Sampling Strategies: Greedy, Temperature, Top-k, Top-p](../../01-tokens-and-language-modeling/16-sampling-strategies-greedy-temperature-top-k-top-p/README.md). Function calling, which interacts with reasoning, is [Module 06: Function Calling Basics](../06-function-calling-basics/README.md).

After this module you can:

- explain *test-time compute*: spending more inference compute on a question to get a better answer, either by thinking longer in one sample or by drawing several samples and choosing among them;
- say exactly what the API documentation says about reasoning tokens (generated, billed as output, not shown), the `reasoning.effort` control, the parameters that change, and the prompting advice;
- read the reasoning-token counts out of a usage object, price a request, and project a month from observed usage;
- predict, with a closed-form check, when extra samples or extra thinking pay off and when they are wasted, including when errors agree with each other or the verifier is imperfect.

Why it matters: a reasoning model changes what a request costs and how long it takes, in ways that are invisible in the response text. Teams that treat it as "the same API with a smarter model" get surprising bills, empty answers and long silences. Teams that treat extra compute as a free accuracy dial build voting schemes that make answers worse.

> [!note] How the claims here are sourced. API behaviour comes from the Reasoning, Reasoning best practices and Using GPT-6 guides, the OpenAPI spec (`openai/openai-openapi`, version `2.3.0`) and the `openai-python` source, all read on 26 Oct 2026. Claims about the research come from the abstracts of the cited arXiv papers (each page opened and its title confirmed on 26 Oct 2026) and, for one point about verifiers, the text of Cobbe et al. **No API call was made.** The responses in the code are stand-ins in the documented shapes with scripted token counts; the simulations model selection strategies with success probabilities that *I chose*; prices and decode speed are illustrative placeholders. None of it measures a real model. The official docs are the source of truth and may have changed since.

## Concept

> [!key] Test-time compute is the inference compute you spend per question: a reasoning model spends it on hidden reasoning tokens in one sample, and you can also spend it on several samples plus a way to choose. It buys accuracy with latency and money, but only where a single try succeeds some of the time, failures are not all the same wrong answer, and something can reliably recognise a good answer; elsewhere it is waste, or makes things worse.

## Explanation

### Test-time compute: two ways to spend it

Training makes a model; *test time* is every time you use it. Test-time compute is how much work the model does to answer one question. There are two basic ways to spend more:

| | Sequential: think longer | Parallel: sample several, then choose |
|---|---|---|
| What happens | One generation spends more tokens reasoning before it answers | `n` independent generations, then a selection step |
| Selection | None needed; the model decides when it is done | Best-of-n with a verifier, majority vote, a reranker, or a search procedure |
| Where the cost shows | In that request's output tokens, mostly hidden | In `n` times the tokens, visible in your own bill and code |
| Latency | Adds to the serial time before the answer | Samples can run concurrently: latency near one sample plus selection, cost near `n` times |
| Typical failure | Runs out of its token cap while still thinking; overthinks easy tasks | Wrong answers that agree with each other; a weak verifier |

The API's reasoning models do the first kind inside the model. The second kind you build yourself (or, on the Chat Completions endpoint, request with the `n` parameter, about which the spec says "you will be charged based on the number of generated tokens across all of the choices. Keep `n` as `1` to minimize costs").

The research behind both is public. Each line below is what the paper's abstract says, nothing more:

- **Cobbe et al. 2021, [Training Verifiers to Solve Math Word Problems](https://arxiv.org/abs/2110.14168).** Introduces GSM8K (8.5K grade-school math word problems) and proposes "training verifiers to judge the correctness of model completions. At test time, we generate many candidate solutions and select the one ranked highest by the verifier." Verification "significantly improves performance". In the body, they note that the verifier's test performance improved with more completions "up to 400" at their scale and then decreased, "which suggests that the benefits of search are eventually outweighed by the risk of finding adversarial solutions that fool the verifier."
- **Wang et al. 2022, [Self-Consistency Improves Chain of Thought Reasoning in Language Models](https://arxiv.org/abs/2203.11171).** Samples "a diverse set of reasoning paths instead of only taking the greedy one", then selects "the most consistent answer", reporting gains such as +17.9% on GSM8K.
- **Lightman et al. 2023, [Let's Verify Step by Step](https://arxiv.org/abs/2305.20050).** Finds that process supervision (feedback on each intermediate step) "significantly outperforms outcome supervision for training models to solve problems from the challenging MATH dataset", and releases PRM800K, the step-level labels it used.
- **Brown et al. 2024, [Large Language Monkeys](https://arxiv.org/abs/2407.21787).** Repeated sampling: coverage (the fraction of problems solved by *any* sample) "scales with the number of samples over four orders of magnitude" and is "often log-linear". Where answers can be checked automatically (code, formal proofs) coverage becomes accuracy; "in domains without automatic verifiers, we find that common methods for picking from a sample collection (majority voting and reward models) plateau beyond several hundred samples and fail to fully scale with the sample budget."
- **Snell et al. 2024, [Scaling LLM Test-Time Compute Optimally can be More Effective than Scaling Model Parameters](https://arxiv.org/abs/2408.03314).** The effectiveness of test-time methods "critically varies depending on the difficulty of the prompt", which motivates a "compute-optimal" allocation per prompt, reported as more than 4x more efficient than a best-of-N baseline, and, in a FLOPs-matched comparison, a smaller model with test-time compute outperforming a 14x larger one "on problems where a smaller base model attains somewhat non-trivial success rates".

> [!pitfall] Do not read the papers as a description of an API model. OpenAI's documentation says only that reasoning models "use internal reasoning tokens before producing a response"; it does not say how they are trained or whether they sample and select internally. The papers are the best public account of what *spending test-time compute* can and cannot buy; they are not documentation for any particular product.

### What the documentation says about reasoning models

Quoted or closely paraphrased from the Reasoning guide, checked 26 Oct 2026 (the official page is the source of truth):

- **Reasoning tokens.** "Reasoning models introduce reasoning tokens in addition to input and output tokens. The models use these reasoning tokens to 'think'". They are generated, they are not returned: "While reasoning tokens are not visible via the API, they still occupy space in the model's context window and are billed as output tokens." Depending on the problem, "anywhere from a few hundred to tens of thousands of reasoning tokens".
- **Where to read the count.** In the usage object, `output_tokens_details.reasoning_tokens` on the Responses API and `completion_tokens_details.reasoning_tokens` on Chat Completions. The guide's example is `input_tokens` 75, `output_tokens` 1186, `reasoning_tokens` 1024, `total_tokens` 1261: the reasoning tokens are *part of* the output tokens (75 + 1186 = 1261), so the visible text is 162 tokens. Block 2 reads exactly this object.
- **The raw reasoning is not exposed.** "We don't expose the raw reasoning tokens emitted by the model"; you can opt in to a summary with `reasoning.summary` (`auto`, `concise` or `detailed`, depending on the model). With persisted reasoning, "the reasoning items remain opaque, and the API does not return their reasoning text." The event list includes reasoning-summary events (for example `response.reasoning_summary_text.delta`), which carry a summary only if you asked for one.
- **The cap includes the thinking.** `max_output_tokens` (Responses) limits "the total number of tokens the model generates, including reasoning tokens, visible output tokens, and non-visible formatting tokens"; on Chat Completions `max_completion_tokens` is "an upper bound for the number of tokens that can be generated for a completion, including visible output tokens and reasoning tokens". If generation reaches the cap you get `status: "incomplete"` with `incomplete_details.reason: "max_output_tokens"`, and "this might occur before any visible output tokens are produced, meaning you could incur costs for input and reasoning tokens without receiving a visible response". The guide recommends "reserving at least 25,000 tokens for reasoning and outputs when you start experimenting".
- **Reasoning effort.** `reasoning.effort` (Responses) or `reasoning_effort` (Chat Completions) takes values among `none`, `minimal`, `low`, `medium`, `high`, `xhigh` and `max`; the set is "model-dependent", as are the defaults ("Defaults are also model-dependent rather than universal"). "Lower effort favors speed and lower token usage, while at higher effort the model thinks more completely to provide higher quality responses." The guide adds that the models "reason adaptively across reasoning efforts, using fewer tokens for simpler tasks and thinking harder for complex tasks". For `xhigh` it says: "Only use when your evals show a clear benefit that justifies the extra latency and cost." For some models, GPT-5.6 and GPT-6 per the guide, a separate `reasoning.mode: pro` runs more model work, "increasing token usage and cost", billed "at the selected model's standard token rates".
- **Thinking and tools.** Some models support "interleaved thinking", producing visible output between reasoning steps and thinking between tool calls. With function calling, the guide recommends passing back the reasoning items from the last call; Module 06 covers the loop. On Chat Completions, which is stateless, the reasoning best-practices guide says reasoning items "are never included in the context of the model", which "will result in slightly degraded model performance and greater reasoning token usage in complex agentic cases".

### Parameter differences, as the docs state them

Every row is model-specific and date-stamped; check the page for the model you use.

| Topic | What the documentation says (checked 26 Oct 2026) |
|---|---|
| Output cap | Chat Completions `max_tokens` is deprecated and "not compatible with o-series models"; use `max_completion_tokens`, which includes reasoning tokens. Responses uses `max_output_tokens`, which includes them too |
| Effort | `reasoning.effort` / `reasoning_effort`, values and defaults vary by model. The reasoning guide: GPT-6 Astra "does not support `none`... returns HTTP 400" |
| Sampling parameters | Per the Using GPT-6 migration notes: when effort is not `none`, remove `temperature`, `top_p` and `top_logprobs`; on Chat Completions also `logprobs` |
| Instructions | "Developer messages are the new system messages" for reasoning models (from `o1-2024-12-17`) |
| Tools | Some models require the Responses API for function calling, or allow it on Chat Completions only at one effort setting (read the model page) |
| State | The Responses API with stored responses can carry reasoning items between calls; the reasoning guide describes `reasoning.context` for choosing which earlier reasoning is rendered back |
| Visibility | Raw reasoning is not returned; summaries are opt-in |

> [!pitfall] Changing the model string and nothing else. Moving to a reasoning model can mean a different cap parameter, removed sampling parameters, a different default effort, and a different tool endpoint. Module 04's registry should record these per model, and its canary should run before the switch.

### Latency and cost

For a reasoning request the cost formula is the ordinary one, with one trap:

```
cost = ((input - cached) x price_in + cached x price_cached + output x price_out) / 1,000,000
output = visible answer tokens + reasoning tokens      <- reasoning is billed once, as output
```

Adding the reasoning tokens to `output_tokens` double counts them. In the guide's own example that mistake overstates the cost by 85% at block 2's illustrative prices. Because reasoning tokens are generated one after another like any others, the **time to the first visible token** includes the thinking: roughly the network and queue time plus `reasoning_tokens / decode_speed`. With streaming ([Module 03](../03-streaming-responses/README.md)) that is the silence before the first visible delta. The guide suggests asking the model "to generate a short preamble before continuing with deeper reasoning" when the first visible token matters, and the background mode described in Module 03 exists for work that takes minutes. Provider pricing and rate limits are covered in [Module 16: Pricing, Rate Limits and Quotas](../16-pricing-rate-limits-and-quotas/README.md).

### When reasoning helps, and when it is wasted

The documentation's own guidance (Reasoning best practices and the effort table) can be summarised like this. The best-practices page is written around the earlier o-series models, so read it as a statement of the trade-off rather than of today's model list; it says plainly: "One model family isn't better than the other—they're just different."

- **Helps:** ambiguous or multi-step tasks, planning, analysis across a lot of unstructured information, code review and debugging, and tasks where you can state what "done" means and how the model should verify its work. Higher effort levels are described for "deep research, asynchronous workflows" and long agentic runs.
- **Wasted:** "latency-critical tasks that do not benefit from any reasoning", for which the effort table names voice, fast information retrieval and classification; and well-defined, straightforward tasks, where the guide says non-reasoning models "are faster and tend to cost less".
- **Decide with an eval.** `xhigh` is for when "your evals show a clear benefit", and `reasoning.effort` is "a tuning knob, not the primary way to recover quality".

The simulations below explain *why* the benefit depends on the task, and they apply equally to extra samples.

### Prompting reasoning models

From the best-practices and reasoning guides: keep prompts "simple and direct"; give "a clear goal, strong constraints, and an explicit output contract without prescribing every intermediate step"; use delimiters to separate parts of the input; "try zero shot first, then few shot if needed"; be specific about the end goal and what a successful answer looks like. And: "Some prompt engineering techniques, like instructing the model to 'think step by step,' may not enhance performance (and can sometimes hinder it)", because "these models perform reasoning internally". Prompt engineering in general is Track 07's subject.

### The arithmetic of buying accuracy with samples

Block 1 simulates the parallel strategy for tasks where one sample succeeds with probability `p`, with a seed, 200,000 simulated questions per cell, and a closed-form check wherever one exists. What it shows (the numbers are in the output below):

1. **Best-of-n with a perfect verifier** follows `1 - (1 - p)^n`. At `p = 0.3`, eight samples reach 0.942. At `p = 0.6` four already reach 0.974; beyond that the extra samples are pure cost. (A)
2. **A vote amplifies whichever answer is likelier.** For a yes/no question with independent samples, majority vote is the binomial sum `P = sum over k > n/2 of C(n, k) p^k (1-p)^(n-k)`. At `p = 0.55` it climbs from 0.55 to 0.87 with 129 samples; at `p = 0.40` it falls to 0.011. (B)
3. **With many possible wrong answers, the right one only has to be the most common.** At `p = 0.30`, if the wrong answers are spread over nine options (0.078 each), plurality voting reaches 0.994 with 65 samples. If the wrong answers agree, it goes the other way: one popular wrong answer at 0.50 gives 0.035 at 65 samples, and a single wrong answer at 0.70 gives 0.000. **Correlated errors turn more samples into more confidence in the wrong answer.** (C; the engine is checked against exact enumeration and against the binomial formula.)
4. **Difficulty varies.** If `p` differs from question to question (Beta(0.4, 0.8) here, mean 0.333, with 14.1% of questions below 0.01), coverage after 64 samples is 0.851, not the 1.000 that `1 - (1 - 0.333)^64` predicts. It grows slowly because some questions are almost never solved, which is the same shape of problem Snell et al. describe when they say effectiveness depends on difficulty. (D, closed form `1 - prod (b + i)/(a + b + i)`)
5. **The verifier is the ceiling.** A verifier that accepts a right sample with probability `tpr` and a wrong one with probability `fpr` gives `acc(n) = (1 - r^n) a + p (1 - tpr) r^(n-1)`, where `r = 1 - p tpr - (1 - p) fpr` and `a = p tpr / (p tpr + (1 - p) fpr)` is its precision. As `n` grows, accuracy tends to `a`: 0.885 for `tpr = 0.9, fpr = 0.05`, and only 0.659 for `fpr = 0.20`. (E, matched by simulation to within 0.0015)
6. **A noisy score can get worse with more candidates.** In the toy of F (right samples score N(1, 1), wrong ones N(0, 1.6)), picking the highest score peaks at 0.533 with 4 samples and falls to 0.238 with 128. This is a made-up model, but it is the same effect as the one Cobbe et al. report when "the benefits of search are eventually outweighed by the risk of finding adversarial solutions that fool the verifier".
7. **Cost per right answer rises with `n`** even while accuracy saturates, and a stronger single call can beat many samples when the verifier is imperfect: with the illustrative numbers in G, best-of-8 with a verifier of `tpr = 0.9, fpr = 0.20` reaches 0.650, below a single call at 0.800 that costs the same. (G)

> [!model] More compute is a dial with three hidden conditions: the single-try success rate must be neither near 0 nor near 1, the failures must not all be the *same* failure, and something must be able to tell good from bad. Remove any one and the dial stops working or turns the wrong way.

## Code

Two executed blocks and one SDK snippet. Python 3.13 and numpy 2.4.6, seeded; every output below was produced by running exactly this code on 26 Oct 2026.

### 1. Simulating best-of-n, voting and verifiers

> [!example] **A model of selection strategies, not of any language model.** The per-sample success probabilities, the wrong-answer distributions, the verifier rates and the cost figures are numbers I chose to make a point; replace them with measurements from your own task. The token counts and prices in section G are illustrative placeholders, not any provider's.

```python
"""sim.py - how accuracy and cost move with the number of samples n drawn per question.

numpy + standard library, seeded. Everything here is a MODEL of selection strategies (best-of-n, voting, a
verifier), with success probabilities you choose. It is not a measurement of any real model.
"""
import math
from itertools import product

import numpy as np

T = 200_000                                   # simulated questions per cell
rng = np.random.default_rng(20261026)
NS = [1, 2, 4, 8, 16, 32, 64]
ODD = [1, 3, 5, 9, 17, 33, 65, 129]


def show(title, header, rows):
    print(title)
    print("  %-30s" % "" + "".join("%8s" % h for h in header))
    for name, vals in rows:
        print("  %-30s" % name + "".join("%8.3f" % v for v in vals))
    print()


# A. Best-of-n with a PERFECT verifier (pass@n): the question is solved if ANY sample is right ------------------
print("seed 20261026, %d simulated questions per cell, numpy %s\n" % (T, np.__version__))
rows, worst = [], 0.0
for p in (0.1, 0.3, 0.6):
    draws = rng.random((T, max(NS))) < p
    sim = [draws[:, :n].any(axis=1).mean() for n in NS]
    exact = [1 - (1 - p) ** n for n in NS]
    worst = max(worst, max(abs(s - e) for s, e in zip(sim, exact)))
    rows += [("p=%.1f simulated" % p, sim), ("p=%.1f 1-(1-p)^n" % p, exact)]
show("A. best-of-n, perfect verifier: P(at least one of n samples is right)", NS, rows)
print("  largest |simulated - closed form| in A: %.4f\n" % worst)


# B. Majority vote when there is ONE wrong answer (a yes/no question) ----------------------------------------
def majority_exact(p, n):                     # n odd: P(more than half of the n samples are right)
    return sum(math.comb(n, k) * p ** k * (1 - p) ** (n - k) for k in range(n // 2 + 1, n + 1))


rows, worst = [], 0.0
for p in (0.4, 0.55, 0.7):
    sim = [(rng.binomial(n, p, T) > n / 2).mean() for n in ODD]
    exact = [majority_exact(p, n) for n in ODD]
    worst = max(worst, max(abs(s - e) for s, e in zip(sim, exact)))
    rows += [("p=%.2f simulated" % p, sim), ("p=%.2f closed form" % p, exact)]
show("B. majority vote, one wrong answer: P(the vote is right)", ODD, rows)
print("  largest |simulated - closed form| in B: %.4f\n" % worst)


# C. Plurality vote when wrong answers can be spread out, or agree with each other ----------------------------
def vote_sim(pvals, n):                       # pvals[0] = P(right); the rest = the wrong answers
    counts = rng.multinomial(n, pvals, size=T)
    top = counts.max(axis=1)
    tied = (counts == top[:, None]).sum(axis=1)
    return np.where(counts[:, 0] == top, 1.0 / tied, 0.0).mean()    # a tie counts 1/(number tied)


def vote_exact(pvals, n):                     # add up every way n samples can fall across the answers
    k, total = len(pvals), 0.0
    for head in product(range(n + 1), repeat=k - 1):
        if sum(head) > n:
            continue
        counts = head + (n - sum(head),)
        prob = math.factorial(n) * math.prod(q ** c / math.factorial(c) for q, c in zip(pvals, counts))
        top = max(counts)
        total += prob * (1.0 / counts.count(top) if counts[0] == top else 0.0)
    return total


check = [0.4, 0.35, 0.25]
print("C0. engine check, p=0.4 and wrong answers 0.35 / 0.25, n=5: exact %.4f, simulated %.4f"
      % (vote_exact(check, 5), vote_sim(check, 5)))
print("    one wrong answer, n=5: exact %.4f, binomial closed form %.4f\n"
      % (vote_exact([0.55, 0.45], 5), majority_exact(0.55, 5)))
p = 0.30
settings = [("wrong answers spread over 9", [p] + [(1 - p) / 9] * 9),
            ("close race (0.25/0.25/0.20)", [p, 0.25, 0.25, 0.20]),
            ("one popular wrong (0.50)", [p, 0.50, 0.05, 0.05, 0.05, 0.05]),
            ("all wrong answers agree", [p, 1 - p])]
rows = [(name, [vote_sim(pv, n) for n in ODD]) for name, pv in settings]
rows.append(("best-of-n, perfect verifier", [1 - (1 - p) ** n for n in ODD]))
show("C. plurality vote at p=0.30 per sample, by how the wrong answers are distributed", ODD, rows)


# D. Problems differ in difficulty: p varies from question to question ----------------------------------------
a, b = 0.4, 0.8                               # Beta(a, b): many questions near p=0, many near p=1; mean a/(a+b)
ps = rng.beta(a, b, T)
draws = rng.random((T, max(NS))) < ps[:, None]
sim = [draws[:, :n].any(axis=1).mean() for n in NS]
exact = [1 - math.prod((b + i) / (a + b + i) for i in range(n)) for n in NS]
naive = [1 - (1 - a / (a + b)) ** n for n in NS]
show("D. best-of-n coverage when p varies by question, Beta(%.1f, %.1f), mean p = %.3f" % (a, b, a / (a + b)), NS,
     [("simulated", sim), ("closed form (Beta mixture)", exact), ("naive 1-(1-mean p)^n", naive)])
print("  share of questions with p < 0.01 (all but unsolvable): %.3f\n" % (ps < 0.01).mean())


# E. An imperfect verifier: accepts a right sample w.p. tpr, a wrong one w.p. fpr; take the first accepted --------
def verifier_exact(p, tpr, fpr, n):
    r = 1 - p * tpr - (1 - p) * fpr           # P(a single sample is rejected)
    a_ = p * tpr / (p * tpr + (1 - p) * fpr)  # P(right | accepted): the verifier's precision
    return (1 - r ** n) * a_ + p * (1 - tpr) * r ** (n - 1)    # (none accepted) -> fall back to the first sample


def verifier_sim(p, tpr, fpr, n):
    right = rng.random((T, n)) < p
    accept = np.where(right, rng.random((T, n)) < tpr, rng.random((T, n)) < fpr)
    pick = np.where(accept.any(axis=1), accept.argmax(axis=1), 0)
    return right[np.arange(T), pick].mean()


rows, worst = [], 0.0
for label, tpr, fpr in (("perfect verifier", 1.0, 0.0), ("tpr=0.9 fpr=0.05", 0.9, 0.05), ("tpr=0.9 fpr=0.20", 0.9, 0.20)):
    sim = [verifier_sim(0.3, tpr, fpr, n) for n in NS]
    exact = [verifier_exact(0.3, tpr, fpr, n) for n in NS]
    worst = max(worst, max(abs(s - e) for s, e in zip(sim, exact)))
    rows += [(label + " simulated", sim), (label + " closed form", exact)]
show("E. best-of-n with an accept/reject verifier, p=0.30", NS, rows)
for tpr, fpr in ((0.9, 0.05), (0.9, 0.20)):
    print("  limit as n grows (the verifier's precision), tpr=%.1f fpr=%.2f: %.3f"
          % (tpr, fpr, 0.3 * tpr / (0.3 * tpr + 0.7 * fpr)))
print("  largest |simulated - closed form| in E: %.4f\n" % worst)


# F. A noisy SCORE as the verifier: pick the highest score. Wrong samples score lower on average but more erratically
def score_pick(p, n, mu_right=1.0, sd_right=1.0, sd_wrong=1.6):
    right = rng.random((T, n)) < p
    score = np.where(right, rng.normal(mu_right, sd_right, (T, n)), rng.normal(0.0, sd_wrong, (T, n)))
    return right[np.arange(T), score.argmax(axis=1)].mean()


ns = [1, 2, 4, 8, 16, 32, 64, 128]
show("F. pick the highest verifier score, p=0.40 (toy: right ~ N(1,1), wrong ~ N(0,1.6))", ns,
     [("accuracy of the picked sample", [score_pick(0.4, n) for n in ns])])

# G. What the samples cost (ILLUSTRATIVE token counts and prices, NOT any provider's) ---------------------------
IN_TOK, OUT_TOK, PRICE_IN, PRICE_OUT = 800, 600, 1.0, 4.0           # tokens per sample; dollars per million tokens
per_sample = (IN_TOK * PRICE_IN + OUT_TOK * PRICE_OUT) / 1e6
print("G. cost of best-of-n with a perfect verifier, p=0.30, per 1000 questions "
      "(ILLUSTRATIVE: %d in + %d out tokens per sample, $%.2f / $%.2f per 1M tokens)" % (IN_TOK, OUT_TOK, PRICE_IN, PRICE_OUT))
print("  %6s %10s %14s %20s" % ("n", "accuracy", "cost ($)", "cost per right ($)"))
for n in NS:
    acc = 1 - (1 - 0.3) ** n
    print("  %6d %10.3f %14.2f %20.4f" % (n, acc, 1000 * n * per_sample, n * per_sample / acc))
one_big = 8 * per_sample
print("\n  Same spend, two uses (ILLUSTRATIVE): best-of-8 samples vs ONE call to a stronger model costing 8x, right 80% of the time:")
print("    best-of-8, perfect verifier:             accuracy %.3f" % (1 - 0.7 ** 8))
print("    best-of-8, verifier tpr=0.9 fpr=0.20:    accuracy %.3f" % verifier_exact(0.3, 0.9, 0.20, 8))
print("    one stronger call:                       accuracy 0.800 at the same cost ($%.4f per question)" % one_big)
```

Output:

```
seed 20261026, 200000 simulated questions per cell, numpy 2.4.6

A. best-of-n, perfect verifier: P(at least one of n samples is right)
                                       1       2       4       8      16      32      64
  p=0.1 simulated                  0.100   0.191   0.344   0.569   0.814   0.965   0.999
  p=0.1 1-(1-p)^n                  0.100   0.190   0.344   0.570   0.815   0.966   0.999
  p=0.3 simulated                  0.300   0.509   0.760   0.943   0.997   1.000   1.000
  p=0.3 1-(1-p)^n                  0.300   0.510   0.760   0.942   0.997   1.000   1.000
  p=0.6 simulated                  0.599   0.840   0.974   0.999   1.000   1.000   1.000
  p=0.6 1-(1-p)^n                  0.600   0.840   0.974   0.999   1.000   1.000   1.000

  largest |simulated - closed form| in A: 0.0007

B. majority vote, one wrong answer: P(the vote is right)
                                       1       3       5       9      17      33      65     129
  p=0.40 simulated                 0.400   0.351   0.318   0.266   0.199   0.120   0.051   0.011
  p=0.40 closed form               0.400   0.352   0.317   0.267   0.199   0.121   0.051   0.011
  p=0.55 simulated                 0.548   0.576   0.593   0.621   0.664   0.721   0.792   0.874
  p=0.55 closed form               0.550   0.575   0.593   0.621   0.663   0.719   0.791   0.873
  p=0.70 simulated                 0.698   0.784   0.838   0.901   0.959   0.992   1.000   1.000
  p=0.70 closed form               0.700   0.784   0.837   0.901   0.960   0.992   1.000   1.000

  largest |simulated - closed form| in B: 0.0024

C0. engine check, p=0.4 and wrong answers 0.35 / 0.25, n=5: exact 0.4434, simulated 0.4428
    one wrong answer, n=5: exact 0.5931, binomial closed form 0.5931

C. plurality vote at p=0.30 per sample, by how the wrong answers are distributed
                                       1       3       5       9      17      33      65     129
  wrong answers spread over 9      0.299   0.345   0.456   0.592   0.769   0.929   0.994   1.000
  close race (0.25/0.25/0.20)      0.300   0.314   0.335   0.361   0.402   0.463   0.544   0.649
  one popular wrong (0.50)         0.300   0.284   0.286   0.244   0.176   0.096   0.035   0.005
  all wrong answers agree          0.299   0.216   0.164   0.099   0.040   0.008   0.000   0.000
  best-of-n, perfect verifier      0.300   0.657   0.832   0.960   0.998   1.000   1.000   1.000

D. best-of-n coverage when p varies by question, Beta(0.4, 0.8), mean p = 0.333
                                       1       2       4       8      16      32      64
  simulated                        0.334   0.455   0.569   0.666   0.744   0.805   0.851
  closed form (Beta mixture)       0.333   0.455   0.568   0.665   0.743   0.804   0.851
  naive 1-(1-mean p)^n             0.333   0.556   0.802   0.961   0.998   1.000   1.000

  share of questions with p < 0.01 (all but unsolvable): 0.141

E. best-of-n with an accept/reject verifier, p=0.30
                                       1       2       4       8      16      32      64
  perfect verifier simulated       0.301   0.509   0.759   0.942   0.997   1.000   1.000
  perfect verifier closed form     0.300   0.510   0.760   0.942   0.997   1.000   1.000
  tpr=0.9 fpr=0.05 simulated       0.300   0.479   0.689   0.841   0.883   0.885   0.885
  tpr=0.9 fpr=0.05 closed form     0.300   0.479   0.689   0.839   0.883   0.885   0.885
  tpr=0.9 fpr=0.20 simulated       0.299   0.448   0.585   0.650   0.658   0.660   0.659
  tpr=0.9 fpr=0.20 closed form     0.300   0.447   0.585   0.650   0.658   0.659   0.659

  limit as n grows (the verifier's precision), tpr=0.9 fpr=0.05: 0.885
  limit as n grows (the verifier's precision), tpr=0.9 fpr=0.20: 0.659
  largest |simulated - closed form| in E: 0.0015

F. pick the highest verifier score, p=0.40 (toy: right ~ N(1,1), wrong ~ N(0,1.6))
                                       1       2       4       8      16      32      64     128
  accuracy of the picked sample    0.399   0.496   0.533   0.511   0.463   0.393   0.316   0.238

G. cost of best-of-n with a perfect verifier, p=0.30, per 1000 questions (ILLUSTRATIVE: 800 in + 600 out tokens per sample, $1.00 / $4.00 per 1M tokens)
       n   accuracy       cost ($)   cost per right ($)
       1      0.300           3.20               0.0107
       2      0.510           6.40               0.0125
       4      0.760          12.80               0.0168
       8      0.942          25.60               0.0272
      16      0.997          51.20               0.0514
      32      1.000         102.40               0.1024
      64      1.000         204.80               0.2048

  Same spend, two uses (ILLUSTRATIVE): best-of-8 samples vs ONE call to a stronger model costing 8x, right 80% of the time:
    best-of-8, perfect verifier:             accuracy 0.942
    best-of-8, verifier tpr=0.9 fpr=0.20:    accuracy 0.650
    one stronger call:                       accuracy 0.800 at the same cost ($0.0256 per question)
```

### 2. A budgeting helper that reads reasoning tokens

> [!example] **The responses below are stand-ins in the documented shapes with scripted token counts; the prices and decode speed are illustrative.** Example 1 uses the usage object printed in the Reasoning guide. Example 5's accuracies per effort level are *hypothetical*: measure them.

```python
"""budget.py - read token usage (including reasoning tokens) from a response, price it, and project a month.

The responses are STAND-INS in the documented shapes and the usage counts are scripted; the prices are
ILLUSTRATIVE placeholders, not any provider's. The cost FORMULA and the field handling are what is real.
"""
from dataclasses import dataclass

import numpy as np

PRICES = {"input": 2.00, "cached": 0.50, "output": 8.00}    # dollars per 1M tokens (ILLUSTRATIVE)


@dataclass(frozen=True)
class Usage:
    input: int
    cached: int
    output: int       # everything generated, INCLUDING reasoning tokens
    reasoning: int

    @property
    def visible(self):
        return self.output - self.reasoning


def read_usage(resp):
    """Normalise the two documented usage shapes and refuse inconsistent ones."""
    u = resp["usage"]
    if "input_tokens" in u:           # Responses API names
        inp, out = u["input_tokens"], u["output_tokens"]
        cached = (u.get("input_tokens_details") or {}).get("cached_tokens", 0)
        reasoning = (u.get("output_tokens_details") or {}).get("reasoning_tokens", 0)
    else:                             # Chat Completions names
        inp, out = u["prompt_tokens"], u["completion_tokens"]
        cached = (u.get("prompt_tokens_details") or {}).get("cached_tokens", 0)
        reasoning = (u.get("completion_tokens_details") or {}).get("reasoning_tokens", 0)
    if u["total_tokens"] != inp + out:
        raise ValueError("total_tokens %d != input %d + output %d" % (u["total_tokens"], inp, out))
    if reasoning > out or cached > inp:
        raise ValueError("reasoning must be part of output, and cached part of input")
    return Usage(inp, cached, out, reasoning)


def cost(u, prices=PRICES):
    """Dollars. Reasoning tokens are billed as output tokens, so they are inside u.output: do not add them again."""
    return ((u.input - u.cached) * prices["input"] + u.cached * prices["cached"] + u.output * prices["output"]) / 1e6


def responses_object(inp, visible, reasoning, status="completed", reason=None, cached=0):
    out = visible + reasoning
    return {"object": "response", "status": status, "incomplete_details": {"reason": reason} if reason else None,
            "output": [{"type": "reasoning", "summary": []}] + ([{"type": "message", "role": "assistant"}] if visible else []),
            "usage": {"input_tokens": inp, "input_tokens_details": {"cached_tokens": cached}, "output_tokens": out,
                      "output_tokens_details": {"reasoning_tokens": reasoning}, "total_tokens": inp + out}}


if __name__ == "__main__":
    # 1. The usage object printed in the reasoning guide (checked 26 Oct 2026)
    docs_example = {"usage": {"input_tokens": 75, "input_tokens_details": {"cached_tokens": 0}, "output_tokens": 1186,
                              "output_tokens_details": {"reasoning_tokens": 1024}, "total_tokens": 1261}}
    u = read_usage(docs_example)
    wrong = cost(u) + u.reasoning * PRICES["output"] / 1e6
    print("1. the guide's example: input %d, output %d (reasoning %d, visible %d), reasoning share of output %.1f%%"
          % (u.input, u.output, u.reasoning, u.visible, 100 * u.reasoning / u.output))
    print("   cost $%.6f; adding reasoning on top of output would give $%.6f (%.0f%% too high)"
          % (cost(u), wrong, 100 * (wrong / cost(u) - 1)))

    # 2. The same numbers in the Chat Completions field names
    chat = {"usage": {"prompt_tokens": 75, "completion_tokens": 1186, "total_tokens": 1261,
                      "prompt_tokens_details": {"cached_tokens": 0},
                      "completion_tokens_details": {"reasoning_tokens": 1024}}}
    print("2. chat-shaped usage reads as the same: %s" % (read_usage(chat) == u))

    # 3. Out of tokens during reasoning: billed, and nothing visible
    r = responses_object(inp=900, visible=0, reasoning=300, status="incomplete", reason="max_output_tokens")
    u3 = read_usage(r)
    print("3. status=%s reason=%s: visible output tokens %d, cost $%.6f  -> paid for thinking, got no answer"
          % (r["status"], r["incomplete_details"]["reason"], u3.visible, cost(u3)))

    # 4. Inconsistent usage is refused, not priced
    try:
        read_usage({"usage": {"input_tokens": 10, "output_tokens": 20, "total_tokens": 99}})
    except ValueError as e:
        print("4. refused:", e)

    # 5. Project a month from observed usage at three effort levels.
    #    Token counts are SCRIPTED (seeded lognormal), accuracy per level is HYPOTHETICAL: replace both with your own
    #    measurements. 150 tokens/s is an ILLUSTRATIVE decode speed; the docs give no figure.
    rng = np.random.default_rng(5)
    LEVELS = {"low": (400, 0.55), "medium": (1500, 0.70), "high": (5000, 0.78)}     # (median reasoning tokens, accuracy)
    CAP, N, DECODE, OVERHEAD, REQUESTS = 4000, 20_000, 150.0, 0.4, 1_000_000
    print("\n5. projection from %d scripted requests per level; max_output_tokens cap = %d" % (N, CAP))
    print("   out = output tokens the model would produce with no cap; a request over the cap is cut off while thinking")
    print("   (priced at the cap, no visible text); eff.acc = HYPOTHETICAL accuracy x share not cut off")
    print("   %-7s %9s %9s %9s %8s %9s %12s %9s %8s %9s" % ("effort", "med.reas", "mean out", "p95 out", ">cap",
                                                           "$/request", "$/1M req", "1st text", "eff.acc", "$/correct"))
    for name, (median, acc) in LEVELS.items():
        reasoning = np.rint(rng.lognormal(np.log(median), 0.6, N)).astype(int)
        visible = np.rint(rng.normal(150, 30, N)).clip(20).astype(int)
        usages = [read_usage(responses_object(1200, v, r)) for v, r in zip(visible.tolist(), reasoning.tolist())]
        out = np.array([x.output for x in usages])
        over = (out > CAP).mean()
        capped = [x if x.output <= CAP else Usage(x.input, x.cached, CAP, CAP) for x in usages]
        per_req = np.mean([cost(x) for x in capped])
        first_text = OVERHEAD + np.mean([x.reasoning for x in usages]) / DECODE
        good = acc * (1 - over)                             # an answer cut off by the cap is not an answer
        print("   %-7s %9d %9.0f %9.0f %7.1f%% %9.4f %12.0f %8.1fs %8.3f %9.4f"
              % (name, median, out.mean(), np.percentile(out, 95), 100 * over, per_req, per_req * REQUESTS,
                 first_text, good, per_req / good))
```

Output:

```
1. the guide's example: input 75, output 1186 (reasoning 1024, visible 162), reasoning share of output 86.3%
   cost $0.009638; adding reasoning on top of output would give $0.017830 (85% too high)
2. chat-shaped usage reads as the same: True
3. status=incomplete reason=max_output_tokens: visible output tokens 0, cost $0.004200  -> paid for thinking, got no answer
4. refused: total_tokens 99 != input 10 + output 20

5. projection from 20000 scripted requests per level; max_output_tokens cap = 4000
   out = output tokens the model would produce with no cap; a request over the cap is cut off while thinking
   (priced at the cap, no visible text); eff.acc = HYPOTHETICAL accuracy x share not cut off
   effort   med.reas  mean out   p95 out     >cap $/request     $/1M req  1st text  eff.acc $/correct
   low           400       634      1243     0.0%    0.0075         7474      3.6s    0.550    0.0136
   medium       1500      1940      4177     5.8%    0.0174        17354     12.3s    0.659    0.0263
   high         5000      6145     13606    66.9%    0.0314        31384     40.4s    0.258    0.1214
```

Read example 5 as a method, not a result: the median reasoning tokens are scripted, so the table shows how the pieces combine. The cap of 4,000 output tokens is fine for `low`, cuts off 5.8% of `medium` requests and 66.9% of `high` requests, and a cut-off request is paid for and useless, so the effective cost per correct answer is not the cost per request divided by the nominal accuracy. The point is to compute `p95 output + headroom` from your own usage before you choose `max_output_tokens`.

### 3. The official SDK (not executed)

> [!note] **NOT EXECUTED (needs the `openai` package and an API key).** Parameter and attribute names were checked against the Reasoning guide, the OpenAPI spec and the SDK's type definitions (`ResponseUsage.output_tokens_details.reasoning_tokens`, `CompletionUsage.completion_tokens_details.reasoning_tokens`, which is optional) on 26 Oct 2026. `MODEL_ID` is a placeholder for an ID from the Models page, and it must support the effort you choose. No output is shown because none was produced.

```python
import os
from openai import OpenAI

client = OpenAI()                                   # reads OPENAI_API_KEY from the environment
MODEL = os.environ["MODEL_ID"]                      # a model that supports the effort below

# Responses API
resp = client.responses.create(
    model=MODEL,
    input=[{"role": "user", "content": "Write a bash script that transposes a matrix given as '[1,2],[3,4]'."}],
    reasoning={"effort": "low"},
    max_output_tokens=4000,                         # counts reasoning tokens too
)
print(resp.status)
if resp.status == "incomplete" and resp.incomplete_details.reason == "max_output_tokens":
    print("cut off by the cap; visible text so far:", repr(resp.output_text))
print("reasoning tokens:", resp.usage.output_tokens_details.reasoning_tokens, "of", resp.usage.output_tokens)

# Chat Completions
comp = client.chat.completions.create(
    model=MODEL,
    messages=[{"role": "user", "content": "Say hello."}],
    reasoning_effort="low",
    max_completion_tokens=4000,                     # not max_tokens
)
details = comp.usage.completion_tokens_details      # optional in the type definitions
print("reasoning tokens:", details.reasoning_tokens if details else None)
```

### What these results do and do not show

They show how the arithmetic of sampling, voting and verification behaves for the success probabilities, error structures and verifier rates I chose, that each closed form matches its simulation, and how to read and price the usage fields. They do not show how often real tasks look like any of these settings, how a particular reasoning model uses its hidden tokens, how effort level maps to accuracy for your task, or what any provider charges. Measuring those on your own task is the project.

## Visual diagram

```
 TWO WAYS TO SPEND TEST-TIME COMPUTE

 SEQUENTIAL: one sample, thinks longer
   ┌────────────────────────────────────────────┐
   │ prompt ──► [ reasoning tokens ] ──► answer │   hidden, billed as output tokens, counted against
   └────────────────────────────────────────────┘   max_output_tokens, steered by reasoning.effort

 PARALLEL: several samples, then choose
   ┌──────────┐  ┌──────────┐         ┌──────────┐
   │ sample 1 │  │ sample 2 │   ...   │ sample n │     you build this part; cost is about n x one sample
   └────┬─────┘  └────┬─────┘         └────┬─────┘
        └─────────────┴──────────┬─────────┘
                                 ▼
              select: verifier | majority vote | reranker

 READING THE USAGE OBJECT (Responses field names; the guide's example numbers)

   output_tokens = 1186 ──┬── output_tokens_details.reasoning_tokens = 1024   hidden, billed as output
                          └── visible answer tokens = 1186 - 1024    =  162
   total_tokens  = input_tokens 75 + output_tokens 1186 = 1261         (reasoning is INSIDE output: never add it again)

 WHAT THE USER WAITS FOR (one streamed request to a reasoning model)

   send ──► queue + read prompt ──► reasoning, no visible text ──► first visible token ──► rest of the answer
            ◄───────────── time to first visible token ──────────►
                                    grows with reasoning.effort, task difficulty and your max_output_tokens room

 WHEN DO EXTRA SAMPLES (OR EXTRA THINKING) PAY?

   p near 0 ...... little: the right answer is almost never produced, so there is nothing to pick
   p mid-range ... most: with a good verifier, coverage 1-(1-p)^n climbs fast; a vote needs the right answer to be the mode
   p near 1 ...... little: already right, the extra samples are only cost
   errors agree .. voting converges on the wrong answer (simulation C); only a verifier can help
   weak verifier . accuracy is capped near the verifier's precision, and a noisy score can even get worse as n grows (E, F)
   cost .......... n samples cost ~n x; cost per right answer rises with n even when accuracy saturates (G)
```

## Practice

### 1. Read the usage object

A Responses call returns `input_tokens` 1,500, `output_tokens` 5,200 and `output_tokens_details.reasoning_tokens` 4,800. (a) How many tokens of visible answer is that? (b) What share of the output is reasoning? (c) With the illustrative prices of block 2 (input $2.00, output $8.00 per million tokens, no caching), what does the request cost? (d) The same request was made with `max_output_tokens` 5,000 and came back with `status: "incomplete"` and no visible text. How is that possible?

<details><summary>Answer</summary>

(a) `5,200 - 4,800 = 400` tokens. (b) `4,800 / 5,200 = 92.3%`. (c) `(1,500 x 2.00 + 5,200 x 8.00) / 1,000,000 = $0.0446`; the 4,800 reasoning tokens are already inside the 5,200. (d) The cap counts reasoning plus visible tokens. If the model's reasoning alone reached 5,000 tokens, generation stopped with `incomplete_details.reason` of `max_output_tokens` before it wrote any visible text, and you still pay for the input and the 5,000 reasoning tokens (block 2, example 3). Raise the cap, lower the effort, or both.

</details>

### 2. Predict, then run

Without running anything: (a) a task with `p = 0.2` per sample, best-of-10 with a perfect verifier; (b) a yes/no task with `p = 0.45`, majority vote over 5 samples, and over 9. Then check with two lines of Python.

<details><summary>Answer</summary>

(a) `1 - 0.8^10 = 0.893`. (b) The vote is below the single-sample rate and gets worse: over 5 samples `P = C(5,3) 0.45^3 0.55^2 + C(5,4) 0.45^4 0.55 + 0.45^5 = 0.407`, and over 9 samples 0.379. Check: `1 - 0.8**10` and `sum(math.comb(n, k) * 0.45**k * 0.55**(n - k) for k in range(n // 2 + 1, n + 1))`. A vote helps only when the right answer is more likely than the wrong one.

</details>

### 3. Pick a strategy

For each task, say whether you would start with no reasoning, low, medium or high effort, whether you would add sampling, and what you would measure first: (a) routing a spoken request to one of twelve intents; (b) overnight review of 200-page contracts for a risky clause, with a human reading every flagged item; (c) code review comments on pull requests, where unit tests can validate a suggested fix.

<details><summary>Answer</summary>

There is no single right answer; the reasons matter. (a) Start with the lowest effort the model supports (`none` or `low`), no sampling: the guide names voice and classification as latency-critical, and the first visible token matters most (Module 03). Measure intent accuracy and time to first visible token at each effort. (b) Latency is not the constraint, so try `medium` and `high` (the guide says to "evaluate both"), in background mode for long runs; sampling is optional because a human is the verifier, so measure recall of the risky clause and the cost per reviewed document. (c) Code with tests is the setting where a verifier exists, which is where repeated sampling is reported to pay (Brown et al.): sample several fixes and keep the ones whose tests pass, after checking that test coverage makes the "verifier" reliable (a weak test suite is a weak verifier, simulation E). Measure fixes accepted per dollar at each effort and `n`.

</details>

### 4. Break the vote

Design a wrong-answer distribution for which a plurality vote over many samples is *worse* than a single sample, although the single-sample success rate is 0.4. Check it with `vote_exact` or `vote_sim` from block 1.

<details><summary>Answer</summary>

Any distribution in which some wrong answer is more probable than the right one. With a single wrong answer, `[0.4, 0.6]`, the vote over 65 samples is right only 5.1% of the time (table B, `p = 0.40`); with `[0.4, 0.5, 0.1]` (one popular wrong answer and a rare one) it falls more slowly, to about 0.20 at 65 samples and toward 0 as `n` grows, against 0.40 for one sample. It needs only that the right answer is not the mode. In practice a popular wrong answer comes from a shared cause, such as the same misreading of the question across samples, which is why measuring the distribution of wrong answers matters more than measuring `p` alone.

</details>

### Checkpoint quiz

1. Are reasoning tokens counted inside `output_tokens` or in addition to them, and how does that affect cost?
2. A reasoning request returns `status: "incomplete"` and an empty answer. Give two likely causes and two remedies.
3. Why can majority voting make accuracy worse as you add samples?
4. What caps the accuracy of best-of-n with an imperfect verifier?
5. Name two prompt techniques the documentation says are unnecessary or unhelpful with reasoning models.

<details><summary>Answers</summary>

1. Inside: the guide's example has 1,186 output tokens of which 1,024 are reasoning, and total 1,261 = 75 + 1,186. They are billed as output tokens, so adding them again double counts.
2. The cap (`max_output_tokens` or `max_completion_tokens`) was reached during reasoning, because the effort is high or the task is hard, and the cap is too small to cover both reasoning and answer. Remedies: raise the cap or reserve more room, lower `reasoning.effort`, simplify the task, or use background mode with a larger budget.
3. When the most common answer among the samples is wrong, adding samples makes the vote more certain of that wrong answer. This happens when errors are correlated, or the right answer is below 0.5 in a yes/no task.
4. The verifier's precision: the chance that an accepted sample is right (0.659 and 0.885 in the examples). More samples cannot exceed it, and a noisy score can do worse as candidates increase.
5. "Think step by step" or asking the model to explain its reasoning (the guide says it "may not enhance performance (and can sometimes hinder it)"), and, as a default, few-shot examples (try zero-shot first). Long step-by-step prescriptions for every intermediate step fall in the same category.

</details>

> [!check]
> - I can define test-time compute and name its sequential and parallel forms.
> - I can say what the docs state about reasoning tokens: generated, billed as output, counted in the window, not shown, summaries opt-in.
> - I can read `reasoning_tokens` from a usage object without double counting, and set `max_output_tokens` with headroom for thinking.
> - I can list the parameter and prompting differences the docs give for reasoning models, and check them per model.
> - I can predict how best-of-n, majority vote and an imperfect verifier behave, including when voting hurts.
> - I can decide per task whether more reasoning or more samples is worth its latency and cost, by measuring.

## Project

Build a **reasoning budget lab** for a task of your own that can be scored automatically (arithmetic word problems, unit-testable code, schema-valid extraction). Collect at least 100 questions with known answers. For each of three settings that your model supports (for example three reasoning efforts, or a non-reasoning model with `n` samples), measure the single-sample success rate per question over several repeated runs, so you have a per-question `p`; the usage fields (input, cached, output, reasoning) and the end-to-end and first-visible-token times; and the share of requests that end `incomplete` at your chosen cap. Then simulate best-of-n and majority vote from your *measured* per-question rates, and compare the simulation with a real run of the same strategy. Report accuracy, cost per correct answer, and latency for each setting using the provider's current prices (cite the page and date), identify the questions for which extra compute never helped and those for which it did, and state in a paragraph what your sample size cannot tell you. If you have no API access, build the same lab against a stand-in with scripted per-question success probabilities and say so plainly. No code is given: design the harness, the data format and the report yourself.

## Interview questions

> [!interview] A product manager asks why the monthly bill went up five-fold after moving to a reasoning model, although the prompts did not change. How do you investigate and what do you recommend?

<details><summary>What a strong answer covers</summary>

- Reasoning tokens are generated and billed as output tokens, are not visible in the response text, and can be hundreds to tens of thousands per request; read `output_tokens_details.reasoning_tokens` (or `completion_tokens_details.reasoning_tokens`) from the usage objects, split cost into input, cached input, visible output and reasoning, and look at the distribution (p50, p95), not only the mean.
- Possible levers: lower `reasoning.effort` where the task allows (some models accept `none`), a smaller tier, shorter outputs, caching, a sensible `max_output_tokens`, routing easy requests to a non-reasoning path.
- Measures cost per *successful task* on an eval set at each setting, since the answer may justify the cost for some tasks and not for others; and warns that a low cap trades cost for incomplete, useless answers.
- Avoids the double counting of reasoning tokens in the cost model.

</details>

> [!interview] Would you run a best-of-n or majority-vote layer on top of an LLM for an extraction task? What would make you say yes or no?

<details><summary>What a strong answer covers</summary>

- Asks first whether there is a reliable check (schema validation, unit tests, a database lookup): with one, best-of-n turns coverage into accuracy and the closed form `1 - (1 - p)^n` guides `n`; without one, voting depends on the right answer being the mode, and the research reports plateaus.
- Raises correlated errors: if the samples share a misreading, voting reinforces it; checks with the measured distribution of wrong answers, not just `p`.
- Notes diminishing returns and the cost per correct answer rising with `n`, and compares against a single call to a stronger model or a higher effort setting.
- Mentions verifier quality as the ceiling and the risk of over-optimising against it; and that temperature or other sampling settings must allow diverse samples (and may not be available on a reasoning model).

</details>

> [!interview] Users complain that a feature "hangs for 30 seconds" with a reasoning model, even though streaming is on. What is going on and what are your options?

<details><summary>What a strong answer covers</summary>

- The first visible token waits for the thinking; the reasoning tokens are not streamed as text, so a stream can be silent until reasoning ends. Time to first visible token grows with effort and task difficulty.
- Options: lower effort or a smaller tier for latency-critical paths, ask for a short preamble before deeper reasoning (the guide's suggestion), opt in to reasoning summaries and stream them to show progress, show progress in the UI, move long work to background mode with polling or a resumable stream, and cache or precompute.
- Measures time to first visible token and total time per effort with the Module 03 methods, and sets expectations in the UI.
- Does not promise a cause without data: checks the usage object for the reasoning-token count of the slow requests.

</details>

## Common mistakes & troubleshooting

- **`status: "incomplete"` and empty `output_text`.** The cap was spent on reasoning. Raise `max_output_tokens` (the guide suggests reserving at least 25,000 tokens while you experiment), lower the effort, and read `incomplete_details.reason`.
- **HTTP 400 after switching models or effort.** The effort value or a parameter is unsupported for that model (for example `none` on a model that does not support it, or `temperature` with reasoning on). Check the model page and the migration notes, and keep supported efforts in the registry.
- **The cost estimate is 80% higher than the invoice.** Reasoning tokens were added to output tokens. They are already inside them.
- **The output looks fine but the bill is high.** Most of the output tokens were hidden reasoning. Log `reasoning_tokens` on every request.
- **"Think step by step" made things worse.** The documentation warns it may not help and can hinder. State the goal, constraints and output format instead.
- **Adding samples lowered accuracy.** The wrong answers agree, or the verifier is weak. Look at the distribution of wrong answers, or replace voting with a real check.
- **The first token takes ten times longer than before.** The model is thinking before the first visible token. Lower the effort, stream summaries, or restructure the UI.
- **Function-calling quality dropped on Chat Completions.** The guide notes that reasoning items are not carried between calls on that stateless endpoint; use the Responses API where the model requires or recommends it.

## Further reading & sources

- [OpenAI: Reasoning models](https://developers.openai.com/api/docs/guides/reasoning) - the guide behind every API statement here: reasoning tokens, effort, caps and incomplete responses, summaries, and prompting advice.
- [OpenAI: Reasoning best practices](https://developers.openai.com/api/docs/guides/reasoning-best-practices) - when to choose a reasoning model, how to prompt it, and how reasoning items interact with function calling.
- [OpenAI: Using GPT-6](https://developers.openai.com/api/docs/guides/latest-model) - an example of per-generation migration notes, including which parameters to remove when reasoning is on.
- [Scaling LLM Test-Time Compute Optimally can be More Effective than Scaling Model Parameters](https://arxiv.org/abs/2408.03314) - Snell et al., on allocating test-time compute per prompt difficulty.
- [Training Verifiers to Solve Math Word Problems](https://arxiv.org/abs/2110.14168) - Cobbe et al., verifier-based selection among many candidates, and its limit at large candidate counts.
- [Let's Verify Step by Step](https://arxiv.org/abs/2305.20050) - Lightman et al., process versus outcome supervision for reward models.
- [Self-Consistency Improves Chain of Thought Reasoning in Language Models](https://arxiv.org/abs/2203.11171) - Wang et al., sampling several reasoning paths and keeping the most consistent answer.
- [Large Language Monkeys: Scaling Inference Compute with Repeated Sampling](https://arxiv.org/abs/2407.21787) - Brown et al., coverage versus the number of samples, and where verification limits the gain.

## Next

[Module 06: Function Calling Basics](../06-function-calling-basics/README.md)
