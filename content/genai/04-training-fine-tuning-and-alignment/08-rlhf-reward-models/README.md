# Module 08: RLHF: Reward Models

## Why this matters

Modules 05-07 covered how to train a model to produce *a* response
given an instruction — SFT, instruction tuning, and correctly-masked
training data. None of that teaches the model which of several
plausible responses humans actually *prefer*. Two responses can both
be fluent, on-topic, and correctly formatted, and still differ sharply
in helpfulness, tone, or safety — SFT's loss (predict the one
reference response in the dataset) has no mechanism for expressing
"and this other response would have been worse." RLHF (Reinforcement
Learning from Human Feedback) closes that gap in two stages: first
train a **reward model** that takes a (prompt, response) pair and
outputs a single scalar score approximating "how much would a human
prefer this," using real human preference judgments; then use that
reward model to actually improve the policy model via reinforcement
learning (module 09's subject, PPO). This module is entirely about the
first stage. It builds a real, small reward model, trains it on real
synthetic preference pairs with the exact pairwise ranking loss used
in production RLHF pipelines, and verifies numerically — real scores,
before and after training — that an untrained reward model does not
reliably rank preferred responses above rejected ones, and a trained
one does.

## Concepts

### From SFT's single-target loss to a preference-ranking signal

```
 SFT (modules 05-07): ONE correct response per example
 ────────────────────────────────────────────────────────
 prompt -> [ model ] -> response      loss: how far is THIS from the
                                             one reference response?
                                       (no notion of "worse alternatives")

 REWARD MODEL (this module): a PAIR, ranked
 ────────────────────────────────────────────────────────
 prompt -> chosen response   ──┐
 prompt -> rejected response ──┤-> [ reward model ] -> r_chosen, r_rejected
                                     loss: push r_chosen ABOVE r_rejected
                                     (no single "correct" response needed —
                                      only a relative preference judgment)
```

Crucially, the reward model doesn't need to know what the *ideal*
response looks like — only which of two real responses a human judged
better. That's a much easier, and much more scalable, thing to collect
from humans than writing a perfect reference response for every
prompt, which is exactly why production RLHF pipelines (InstructGPT
and its successors) built their preference data this way.

### Architecture: a scalar reward head on a pretrained encoder

A reward model is usually a pretrained transformer with its language
modeling head replaced by a **single linear layer producing one
scalar** per input — not a distribution over the vocabulary, a single
number: the model's estimate of overall response quality/preference.
This module builds one on top of `distilbert-base-uncased`:

```python
import torch
import torch.nn as nn
import torch.nn.functional as F
from transformers import AutoTokenizer, AutoModel

torch.manual_seed(3)
tok = AutoTokenizer.from_pretrained("distilbert-base-uncased")
backbone = AutoModel.from_pretrained("distilbert-base-uncased")

class RewardModel(nn.Module):
    def __init__(self, backbone, hidden_size=768):
        super().__init__()
        self.backbone = backbone
        self.head = nn.Linear(hidden_size, 1)   # scalar reward, not a vocab distribution
    def forward(self, input_ids, attention_mask, **kwargs):
        out = self.backbone(input_ids=input_ids, attention_mask=attention_mask)
        cls = out.last_hidden_state[:, 0, :]     # [CLS] token's final representation
        return self.head(cls).squeeze(-1)

model = RewardModel(backbone)
```

The `[CLS]` token's final hidden state is used as a summary of the
whole (prompt, response) text — the same pooling convention
`bert-base-uncased`/`distilbert-base-uncased` use for classification
heads, repurposed here to output a single continuous reward instead of
class logits.

### The pairwise ranking loss

Given `r_chosen` and `r_rejected` (real scalar outputs of the reward
model on a chosen and a rejected response to the same prompt), the
loss used across RLHF papers (Christiano et al. 2017; the InstructGPT
reward model) is a direct application of the Bradley-Terry preference
model:

```
loss = -log( sigmoid( r_chosen - r_rejected ) )
```

This is minimized exactly when `r_chosen - r_rejected` is large and
positive — `sigmoid` of a large positive number approaches 1, and
`-log(1) = 0`. When `r_chosen < r_rejected` (the model ranks them
backwards), the loss is large. This is the same functional form module
10 (DPO) reuses directly inside a single end-to-end loss — worth
watching for.

### Verified: synthetic preference pairs, before training

Five synthetic (prompt, chosen, rejected) triples — each chosen
response is genuinely more helpful/appropriate than its rejected
counterpart:

```python
pairs = [
    ("How do I reset my password?",
     "To reset your password, go to Settings > Security and click Reset Password.",
     "Figure it out yourself, not my problem."),
    ("What is the capital of France?",
     "The capital of France is Paris.",
     "Who cares, look it up."),
    ("Can you help me debug this error?",
     "Sure, can you share the error message and the code that produced it?",
     "Your code is probably just bad."),
    ("How does photosynthesis work?",
     "Plants convert sunlight, water, and CO2 into glucose and oxygen using chlorophyll.",
     "I do not know and I do not want to explain."),
    ("Give me a tip for better sleep.",
     "Try keeping a consistent sleep schedule, even on weekends.",
     "Just stop being lazy and sleep, idiot."),
]

def encode(texts):
    enc = tok(texts, return_tensors="pt", padding=True, truncation=True)
    return {"input_ids": enc["input_ids"], "attention_mask": enc["attention_mask"]}

chosen_enc = encode([p[1] for p in pairs])
rejected_enc = encode([p[2] for p in pairs])

with torch.no_grad():
    r_chosen = model(**chosen_enc)
    r_rejected = model(**rejected_enc)
print("r_chosen  :", [round(x, 3) for x in r_chosen.tolist()])
print("r_rejected:", [round(x, 3) for x in r_rejected.tolist()])
print("chosen > rejected count:", int((r_chosen > r_rejected).sum()), "/", len(pairs))
```

Verified output:

```
r_chosen  : [0.347, 0.029, 0.148, 0.121, 0.049]
r_rejected: [0.117, 0.1, 0.109, 0.098, 0.141]
chosen > rejected count: 3 / 5
```

Before any preference training, this reward model — its backbone
pretrained on plain masked-language-modeling, its reward head randomly
initialized — gets it right on only 3 of 5 pairs. This is exactly the
honest starting point RLHF's reward-model stage begins from: a
pretrained language backbone has no built-in notion of "which response
is preferred," because nothing about masked-language-modeling
pretraining ever supplied that signal.

### Verified: training on the pairwise ranking loss

```python
optimizer = torch.optim.AdamW(model.parameters(), lr=1e-4)

for step in range(60):
    model.train()
    r_chosen = model(**chosen_enc)
    r_rejected = model(**rejected_enc)
    loss = -F.logsigmoid(r_chosen - r_rejected).mean()
    optimizer.zero_grad()
    loss.backward()
    optimizer.step()
    if step % 15 == 0 or step == 59:
        print(f"step {step:2d}  pairwise ranking loss: {loss.item():.4f}")
```

Verified output:

```
step  0  pairwise ranking loss: 0.6598
step 15  pairwise ranking loss: 0.0001
step 30  pairwise ranking loss: 0.0000
step 45  pairwise ranking loss: 0.0000
step 59  pairwise ranking loss: 0.0000
```

The loss at step 0 (0.6598) is close to `-log(sigmoid(0)) = log(2) ≈
0.693` — expected, since the untrained head starts near a near-zero
preference margin — and collapses to essentially zero within 15 steps
on this small, clearly-separable toy set.

### Verified: real scores after training confirm the preference ordering

```python
model.eval()
with torch.no_grad():
    r_chosen2 = model(**chosen_enc)
    r_rejected2 = model(**rejected_enc)
print("r_chosen  :", [round(x, 3) for x in r_chosen2.tolist()])
print("r_rejected:", [round(x, 3) for x in r_rejected2.tolist()])
print("chosen > rejected count:", int((r_chosen2 > r_rejected2).sum()), "/", len(pairs))
```

Verified output:

```
r_chosen  : [7.022, 6.763, 6.932, 6.794, 7.016]
r_rejected: [-4.905, -4.989, -4.732, -4.872, -4.74]
chosen > rejected count: 5 / 5
```

Every chosen response now scores far above every rejected one — real
margins around 11-12 points, not a marginal win. This is the reward
model doing exactly its one job: given a (prompt, response) pair,
output a scalar that a downstream RL algorithm (module 09) can treat
as "how good was this response," learned entirely from relative
preference judgments rather than any single ground-truth response.

### What this toy example doesn't show, honestly

Five hand-written pairs with an obviously large quality gap is a
best-case setup — real reward-model training uses tens of thousands of
human-labeled comparisons, on much subtler distinctions than "helpful
vs. actively rude," and faces real, documented failure modes
(reward hacking, where a policy later exploits reward-model blind
spots — module 09's territory once the reward model is plugged into
an RL loop). This module's job was to verify the loss and training
mechanism concretely, not to claim toy-scale training produces a
production-grade reward model.

## Reference

```
 Term                    Meaning
 ──────────────────────  ──────────────────────────────────────────────
 Reward model (RM)        A model outputting one scalar score per
                          (prompt, response) pair, estimating human
                          preference — this module's RewardModel class
 Preference pair          A (prompt, chosen, rejected) triple where a
                          human (or in this toy module, construction)
                          judged chosen better than rejected
 Pairwise ranking loss     -log(sigmoid(r_chosen - r_rejected)) —
                          verified above to drop from 0.66 to ~0.0000
                          as the model learns to separate the pairs
 Bradley-Terry model       The underlying statistical model of pairwise
                          preference (probability chosen beats rejected
                          = sigmoid of their score difference) that the
                          ranking loss is a maximum-likelihood fit to
 [CLS] pooling             Using the final hidden state at the
                          classification token as a fixed-size summary
                          of the whole input, fed to the scalar head
 Reward hacking            A downstream RL policy exploiting a reward
                          model's blind spots rather than genuinely
                          improving — named honestly here, addressed
                          operationally in module 09
```

## Hands-on exercises

### 1. Add a genuinely ambiguous pair and observe the effect

Add a sixth (prompt, chosen, rejected) pair where both responses are
similarly reasonable (e.g. two different but equally valid phrasings
of a correct answer). Retrain and report `r_chosen` vs. `r_rejected`
for that pair specifically — does the model separate it as cleanly as
the other five, and what does that suggest about how much preference
signal (and how many examples) real reward-model training needs for
subtle distinctions?

### 2. Swap chosen and rejected for one pair and watch the loss

Deliberately mislabel one pair (swap which response is "chosen" and
which is "rejected") before training. Retrain and report the final
loss and that pair's `r_chosen`/`r_rejected` scores. Confirm the model
learns to satisfy the (wrong) label it was given — a concrete
demonstration of why real reward-model quality is bounded by label
quality.

### 3. Measure the reward margin's growth over training

Modify the training loop to record `(r_chosen - r_rejected).mean()`
at every step (not just the loss) across all 60 steps. Plot or print
the margin's trajectory and confirm it grows monotonically (or nearly
so) as the loss falls — connecting the loss's decrease directly to a
growing, real preference margin.

## Independent challenge

A colleague proposes skipping the reward model entirely: "Why not just
have humans directly score each response 1-10, and train the policy to
maximize the average score with plain SFT-style regression?" Using
this module's setup, evaluate the proposal.

<details><summary>Discussion</summary>

Absolute 1-10 scores from different human raters are a substantially
noisier and less consistent signal than pairwise comparisons: what one
rater calls a "7" another might call a "5," and the same rater's scale
can drift across a labeling session — a well-documented problem in
human annotation literature, which is exactly why RLHF's actual data
collection asks raters for relative judgments ("which of these two is
better") rather than absolute scores. This module's pairwise ranking
loss sidesteps the need for a consistent absolute scale entirely — it
only ever asks the reward model to satisfy `r_chosen > r_rejected` by
a margin, and the verified before/after scores (starting near 0.03-0.35
for both, ending near +7 for chosen and -5 for rejected) show the
model can find *some* consistent scalar scale that separates them,
without ever being told what the "right" absolute score was. A
regression-to-absolute-scores approach could still work in principle,
and is sometimes used, but it inherits label-consistency problems this
module's pairwise design was specifically chosen to avoid — the
question worth asking back is whether the team can actually collect
consistent absolute scores at the volume and quality pairwise
comparisons already achieve in practice.

</details>

## Common mistakes & troubleshooting

- **Assuming an untrained reward model already prefers "obviously
  better" responses.** This module's own before-training numbers show
  otherwise (3/5, not 5/5) — a pretrained backbone's representations
  are useful, but the reward *head* starts randomly initialized with
  no preference signal at all.
- **Confusing the reward model's scalar output with a probability or a
  classification logit.** It's an unbounded real number (this module's
  trained scores range roughly -5 to +7) — only the *difference*
  between two scores, passed through sigmoid, has a probabilistic
  interpretation (the Bradley-Terry preference probability).
  Comparing raw reward-model scores across different prompts as if
  they were calibrated to a fixed scale is a common misuse.
- **Training the reward model on mislabeled pairs without realizing
  it.** As Exercise 2 shows directly, the model dutifully learns
  whatever ordering the labels specify, correct or not — reward model
  quality is bounded by preference-label quality, not by the training
  procedure catching bad labels.
- **Believing this toy setup is representative of production
  reward-model training.** Five pairs with a large, obvious quality
  gap converge to near-zero loss in 15 steps; real reward models train
  on much larger, subtler preference datasets and still face open
  problems like reward hacking (module 09).
- **Forgetting `**kwargs` in the model's `forward` when using a
  tokenizer that emits `token_type_ids`.** `distilbert-base-uncased`'s
  tokenizer and `AutoModel` calling conventions can pass extra keyword
  arguments the reward head doesn't need — accepting and discarding
  them keeps the forward signature robust.

## Checkpoint quiz

1. What single scalar does a reward model output, and what does the
   reward head replace compared to a standard language modeling head?
2. Write the pairwise ranking loss formula this module trained with,
   and explain in one sentence why it is minimized when `r_chosen` is
   much larger than `r_rejected`.
3. What did this module's verified before-training scores show about
   an untrained reward model's ability to rank chosen above rejected
   responses?
4. After 60 training steps on this module's five synthetic pairs, what
   was the real verified margin between chosen and rejected scores,
   approximately, and what did the training loss converge to?
5. Name one honest limitation of this module's toy setup relative to
   production RLHF reward-model training.

<details><summary>Answers</summary>

1. A single scalar score estimating how much a human would prefer a
   given (prompt, response) pair. It replaces a standard language
   modeling head (which outputs a distribution over the entire
   vocabulary) with a single linear layer producing one number.
2. `loss = -log(sigmoid(r_chosen - r_rejected))`. It's minimized when
   `r_chosen - r_rejected` is large and positive, because `sigmoid` of
   a large positive number approaches 1 and `-log(1) = 0` — the loss
   only vanishes when the model ranks chosen clearly above rejected.
3. It correctly ranked chosen above rejected on only 3 of 5 pairs
   before any preference training — an untrained reward head has no
   reliable preference signal, even though the backbone is pretrained.
4. Chosen scores landed around +6.8 to +7.2 and rejected scores around
   -4.6 to -5.0 — a margin of roughly 11-12 points — while the training
   loss fell from about 0.66 at step 0 to effectively 0.0000 by step
   15 and stayed there.
5. Any reasonable answer naming: the small number of hand-written
   pairs with an unusually large/obvious quality gap (real datasets
   are much larger and subtler); the absence of any test of
   generalization to unseen prompts; or that this module doesn't
   demonstrate or address reward hacking, which only surfaces once a
   reward model is plugged into an actual RL training loop (module 09).

</details>

## Further reading & sources

- [Deep Reinforcement Learning from Human Preferences (Christiano et al., 2017)](https://arxiv.org/abs/1706.03741) - the paper that introduced learning a reward model from pairwise human preference comparisons, the exact mechanism (and loss form) this module verifies.
- [Training language models to follow instructions with human feedback (Ouyang et al., 2022)](https://arxiv.org/abs/2203.02155) - InstructGPT's reward-model stage, trained on real large-scale human preference comparisons with this same pairwise ranking loss, directly preceding module 09's PPO stage.
- [Learning to summarize from human feedback (Stiennon et al., 2020)](https://arxiv.org/abs/2009.01325) - a detailed, widely-cited study of reward-model training and its downstream use in RLHF, including early documentation of reward-model limitations.
- [Hugging Face TRL: Reward Modeling documentation](https://huggingface.co/docs/trl/main/en/reward_trainer) - the real, production `RewardTrainer` implementing this exact pairwise loss at scale, for comparison against this module's from-scratch version.

## Next

[Module 09: RLHF: PPO and the Training Loop](../09-rlhf-ppo-and-the-training-loop/README.md)
