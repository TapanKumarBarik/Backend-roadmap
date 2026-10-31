# Module 03: Scaling Laws

## Why this matters

Module 02 established that pretraining loss is a real, measurable
number — verified directly on real text. This module asks the question
that made pretraining loss into an entire research program rather than
just a training diagnostic: **as you make the model bigger, give it
more data, or spend more compute, does loss keep improving — and is
that improvement predictable in advance?** Kaplan et al. (2020) and
Hoffmann et al. (2022, covered in Module 04) showed the answer is yes,
in a specific, quantifiable way: pretraining loss follows a smooth
**power-law** relationship with model size, dataset size, and compute,
each held roughly fixed while the other varies. This is what let labs
justify spending tens of millions of dollars on a training run *before*
it finished — because a much smaller, much cheaper run's loss curve
predicted, with real accuracy, what the large run's loss would be. This
module cannot reproduce that at real scale on a CPU — nobody could
without a real cluster — so it builds a small, honest, real proxy
instead: three tiny transformer language models of genuinely different
parameter counts, trained on the identical small dataset for the same
number of steps, with real, measured final losses. The qualitative
trend (bigger really does mean lower loss, even at this toy scale) is
real and verified. The actual power-law exponents are not something
this module's tiny experiment can honestly claim to measure — that
distinction is the whole point of this module's caveats.

## Concepts

### The scaling laws claim, precisely

Kaplan et al. (2020), training real GPT-family transformers across
many orders of magnitude of parameter count, dataset size, and compute,
found that test loss `L` decreases as a **power law** in each of these
quantities when the other two are not the bottleneck:

```
 L(N)  ~  (N_c / N) ^ alpha_N        (N = number of non-embedding parameters)
 L(D)  ~  (D_c / D) ^ alpha_D        (D = number of training tokens)
 L(C)  ~  (C_c / C) ^ alpha_C        (C = compute, in FLOPs)
```

The specific values Kaplan et al. reported: `alpha_N ~ 0.076`,
`alpha_D ~ 0.095`, `alpha_C ~ 0.050` (exact figures from their Table 1
sweep). The *practically* important claim is not any single exponent —
it's that these relationships are **smooth and predictable across many
orders of magnitude**: plotting log(loss) against log(N) with data and
compute held ample gives a straight line, not a noisy scatter, over a
range from small models up to (at the time) GPT-3-scale. That
smoothness is what makes small-scale experiments a legitimate way to
forecast large-scale outcomes.

```
   log(loss)
       │╲
       │ ╲
       │  ╲___                    <- a real power law: a straight
       │      ╲___                    line in log-log space
       │          ╲____
       │               ╲______
       │                       ╲________
       └───────────────────────────────────► log(N), log(D), or log(C)

   this module's toy experiment below checks only the SHAPE of this
   curve (down and to the right, roughly) at 3 points — not its slope
```

### Why a CPU toy experiment cannot reproduce the real result

Kaplan et al.'s power laws were fit across roughly seven orders of
magnitude of parameter count, using real natural-language data at a
scale where noise averages out and the smoothness of the trend becomes
visible. A CPU-only, few-hundred-step experiment on a few thousand
characters of synthetic text has none of that: three data points is
not enough to fit a power law with any statistical confidence, the
dataset is small enough that a bigger model can partly *memorize* it
rather than generalize (a qualitatively different regime than the
paper's), and a few hundred optimizer steps is far short of
convergence. What this module's proxy experiment *can* honestly show
is the qualitative direction of the effect — loss going down as
parameter count goes up, on a fixed dataset and step budget — without
pretending to measure `alpha_N` or claiming this is a real scaling-law
fit.

### Verified: a real proxy — three transformer sizes, same data, same steps

A tiny character-level transformer language model, trained from
scratch at three different sizes on the identical synthetic corpus for
the identical number of optimizer steps:

```python
import torch
import torch.nn as nn

torch.manual_seed(0)

base_text = (
    "the quick brown fox jumps over the lazy dog. "
    "the lazy dog sleeps while the quick fox runs. "
    "a small transformer learns to predict the next character. "
)
text = base_text * 40
chars = sorted(set(text))
stoi = {c: i for i, c in enumerate(chars)}
vocab_size = len(chars)
data = torch.tensor([stoi[c] for c in text], dtype=torch.long)

SEQ_LEN, BATCH_SIZE, STEPS, LR = 32, 16, 300, 3e-3

def get_batch():
    ix = torch.randint(0, len(data) - SEQ_LEN - 1, (BATCH_SIZE,))
    x = torch.stack([data[i:i + SEQ_LEN] for i in ix])
    y = torch.stack([data[i + 1:i + SEQ_LEN + 1] for i in ix])
    return x, y

class TinyTransformerLM(nn.Module):
    def __init__(self, vocab_size, d_model, n_layers, n_heads, seq_len):
        super().__init__()
        self.tok_emb = nn.Embedding(vocab_size, d_model)
        self.pos_emb = nn.Embedding(seq_len, d_model)
        layer = nn.TransformerEncoderLayer(
            d_model=d_model, nhead=n_heads, dim_feedforward=4 * d_model,
            batch_first=True, activation='relu')
        self.encoder = nn.TransformerEncoder(layer, num_layers=n_layers)
        self.head = nn.Linear(d_model, vocab_size)

    def forward(self, x):
        B, T = x.shape
        pos = torch.arange(T).unsqueeze(0).expand(B, T)
        h = self.tok_emb(x) + self.pos_emb(pos)
        mask = nn.Transformer.generate_square_subsequent_mask(T)
        h = self.encoder(h, mask=mask, is_causal=True)
        return self.head(h)

configs = [
    ("small",  dict(d_model=16, n_layers=1, n_heads=2)),
    ("medium", dict(d_model=32, n_layers=2, n_heads=2)),
    ("large",  dict(d_model=64, n_layers=3, n_heads=4)),
]

for name, cfg in configs:
    torch.manual_seed(0)  # identical init recipe and identical data stream across sizes
    model = TinyTransformerLM(vocab_size, seq_len=SEQ_LEN, **cfg)
    n_params = sum(p.numel() for p in model.parameters())
    opt = torch.optim.Adam(model.parameters(), lr=LR)
    loss_fn = nn.CrossEntropyLoss()

    for step in range(STEPS):
        x, y = get_batch()
        logits = model(x)
        loss = loss_fn(logits.reshape(-1, vocab_size), y.reshape(-1))
        opt.zero_grad(); loss.backward(); opt.step()

    model.eval()
    with torch.no_grad():
        losses = []
        for _ in range(10):
            x, y = get_batch()
            l = loss_fn(model(x).reshape(-1, vocab_size), y.reshape(-1))
            losses.append(l.item())
    print(f"{name:>6}: params={n_params:6d}  final_loss(avg of 10 eval batches)={sum(losses)/len(losses):.4f}")
```

Verified output:

```
vocab_size=28  corpus_chars=5960  steps=300  seq_len=32  batch_size=16

 small: params=  4716  step0_loss=3.3319  final_loss(avg of 10 eval batches)=0.9098  time=3.4s
medium: params= 28252  step0_loss=3.5292  final_loss(avg of 10 eval batches)=0.1435  time=8.9s
 large: params=155612  step0_loss=3.5756  final_loss(avg of 10 eval batches)=0.0814  time=22.7s
```

(The code above is condensed for readability; the actual run also
timed each size and printed `step0_loss`, included here for full
honesty about what was measured.) All three models started from a
similar, near-random loss around 3.3-3.6 (as expected — before any
training, loss should be close to `log(vocab_size) = log(28) ≈ 3.33`
regardless of model size, since an untrained model's output is close to
uniform over the vocabulary). After the identical 300 training steps on
the identical data, final loss dropped monotonically as parameter count
increased: **0.91 → 0.14 → 0.08** for **4,716 → 28,252 → 155,612**
parameters. That is the qualitative scaling-laws trend, verified with
real numbers from a real (if tiny) training run: more parameters, same
data and step budget, lower loss.

### What this toy result does and does not prove

**Does show:** on a fixed dataset and fixed step budget, a bigger
model (of this architecture family) achieved lower loss — directly
consistent with `L(N)` decreasing in `N`. **Does not show:** the actual
power-law exponent (three points, from a training run that has likely
partly memorized a 5,960-character repeating corpus by the "large"
model's stage, is not a scaling-law fit); what happens with *more*
distinct data (this experiment fixed D, deliberately, and swept N —
Kaplan et al.'s real result required varying all three); or that this
trend continues indefinitely (real scaling laws break down at some
point too — see Module 04's Chinchilla finding, which is precisely
about getting the N-vs-D balance right rather than just "bigger is
always better for a fixed compute budget").

## Reference

```
 Term                Meaning
 ──────────────────  ──────────────────────────────────────────────────
 Scaling law           A power-law relationship between pretraining
                      loss and model size (N), dataset size (D), or
                      compute (C), holding the others ample
 Power law              L ~ (constant / X) ^ alpha — a straight line
                      when both loss and X are plotted on log-log axes
 alpha_N, alpha_D,       Kaplan et al.'s measured exponents (~0.076,
 alpha_C               ~0.095, ~0.050 respectively) — NOT something
                      this module's toy proxy attempts to reproduce
 Non-embedding          The parameter count Kaplan et al. used for
 parameters            their N-scaling fits, excluding embedding
                      tables specifically
 This module's proxy    3 real transformer sizes (4,716 / 28,252 /
                      155,612 params), same data, same 300 steps;
                      verified: loss 0.91 -> 0.14 -> 0.08 — a real,
                      qualitative trend, not a power-law measurement
```

## Hands-on exercises

### 1. Add a fourth, even larger size and check the trend continues

Add a fourth config (e.g. `d_model=128, n_layers=4, n_heads=4`) to the
verified script and re-run. Report the real parameter count and final
loss. Does the monotonic downward trend continue, or does it flatten
or reverse (a real possibility once a model is large enough to fully
memorize a small, repeating corpus)?

### 2. Hold N fixed and vary D instead

Pick the "medium" config and train it on three different corpus sizes
(e.g. `base_text * 5`, `base_text * 40`, `base_text * 200`) for the
same 300 steps each. Report the three real final losses. Does more
data (D), holding model size fixed, also produce lower loss in your
run — consistent with `L(D)` decreasing in `D`?

### 3. Plot your results on log-log axes

Using the parameter counts and final losses from the verified example
(or your own re-run), plot `log(params)` on the x-axis and
`log(final_loss)` on the y-axis using `matplotlib`. With only 3 points
this cannot be a real power-law fit, but check by eye whether the
points are roughly consistent with a straight line, and write one
honest sentence about why 3 points from a toy run isn't sufficient
evidence for a real scaling-law claim even if they happen to look
linear.

## Independent challenge

A colleague sees this module's verified numbers (0.91 → 0.14 → 0.08
loss as params go 4,716 → 28,252 → 155,612) and says: "Great, this
proves scaling laws — let's compute `alpha_N` from these three points
and use it to predict how big we'd need to go to hit loss 0.01." What's
wrong with doing this, using this module's own stated caveats?

<details><summary>Discussion</summary>

Several real problems, all named explicitly in this module's "what this
toy result does and does not prove" section. First, three points is
not enough to distinguish a real power law from any other smoothly
decreasing curve — Kaplan et al.'s actual fits used many model sizes
across several orders of magnitude specifically because a handful of
points can't establish that the relationship is a power law rather
than, say, an exponential or a curve that will flatten out. Second, and
more specific to this exact experiment: the corpus is a repeating
5,960-character synthetic text; the "large" model (155,612 parameters)
almost certainly has enough capacity to substantially memorize a
corpus this small and repetitive, which is a fundamentally different
regime from the paper's real setting (large, non-repeating natural
text where the model must generalize, not memorize) — extrapolating a
memorization-regime curve as if it were a generalization-regime power
law would be actively misleading. Third, this experiment deliberately
held D and compute-per-step fixed and swept N alone; a real
compute-optimal prediction (module 04's whole topic) requires jointly
reasoning about N *and* D, not extrapolating an N-only curve in
isolation. The right use of this module's result is exactly what it
claims: real evidence that the *qualitative direction* holds at toy
scale, and a pointer to Kaplan et al.'s actual published exponents (in
Further Reading) for anyone who needs the real numbers.

</details>

## Common mistakes & troubleshooting

- **Treating this module's 3-point toy result as a real power-law
  fit.** It isn't, and the module says so explicitly — it demonstrates
  direction, not a measured exponent. Use Kaplan et al.'s own published
  `alpha_N/D/C` values (Further Reading) for real numbers.
- **Ignoring the memorization-vs-generalization regime difference.**
  A small, repeating synthetic corpus lets a bigger toy model partly
  memorize it — a different mechanism from the paper's large-scale
  generalization result, and it's why this module's caveats explicitly
  call this out rather than presenting the trend as unqualified
  evidence of "bigger is smarter."
- **Assuming "bigger is always better" without a fixed compute
  budget.** This module fixed the number of *steps*, not compute — a
  bigger model did more FLOPs per step to reach its lower loss. Module
  04 (Chinchilla) is specifically about what happens when you instead
  fix total compute and ask how to split it between size and data.
- **Confusing model-size scaling (`L(N)`) with the compute-optimal
  question.** They're related but distinct: `L(N)` (this module) asks
  "does a bigger model get better loss, data/compute ample?"; Chinchilla
  (module 04) asks "for a FIXED compute budget, what's the best split
  between N and D?" — a bigger model is not automatically the right
  choice once compute, not model size, is the constraint.
- **Forgetting that near-random initial loss should be close to
  `log(vocab_size)`.** All three configs verified above started around
  loss 3.3-3.6, close to `log(28) ≈ 3.33` — if a from-scratch model's
  initial loss is wildly different from this, something about the
  setup (e.g. a broken loss computation) is likely wrong, independent
  of model size.

## Checkpoint quiz

1. What three quantities do Kaplan et al.'s scaling laws relate
   pretraining loss to, and what functional form (in log-log space)
   does that relationship take?
2. What real parameter counts and final losses did this module's
   verified 3-size proxy experiment produce, and in what direction did
   loss move as parameter count increased?
3. Name two specific reasons this module gives for why its toy
   experiment cannot be treated as a real scaling-law measurement.
4. Why did all three model sizes in the verified experiment start
   training at a similar loss, around 3.3-3.6, regardless of their
   very different parameter counts?
5. What question does Module 04 (Chinchilla) ask that this module's
   `L(N)`-only experiment deliberately does not answer?

<details><summary>Answers</summary>

1. Model size (N), dataset size (D), and compute (C). Each relates to
   loss via a power law: `L ~ (constant / X) ^ alpha`, which appears as
   a straight line when both loss and X are plotted on log-log axes.
2. 4,716 params -> loss 0.9098; 28,252 params -> loss 0.1435; 155,612
   params -> loss 0.0814. Loss decreased monotonically as parameter
   count increased, on the identical dataset and step budget.
3. Any two of: only 3 data points, insufficient to distinguish a real
   power law from any other decreasing curve; the small, repeating
   synthetic corpus lets larger models partly memorize rather than
   generalize, a different regime than the paper's; the experiment
   swept N alone with D and steps fixed, unlike the paper's joint
   N/D/C analysis; a few hundred steps is far short of real convergence
   at the scale the actual paper studied.
4. Because an untrained (or very early-training) model's output
   distribution is close to uniform over the vocabulary regardless of
   its parameter count, and the cross-entropy loss of a uniform guess
   over a vocabulary of size V is `log(V)` — here `log(28) ≈ 3.33` —
   independent of how many parameters the model has.
5. Whether, for a FIXED total compute budget, it is better to spend
   that compute on a bigger model (more N) or more training data (more
   D) — the compute-optimal split — rather than this module's question
   of "does a bigger model reach lower loss when data and steps are
   simply held constant."

</details>

## Further reading & sources

- [Scaling Laws for Neural Language Models (Kaplan et al., 2020)](https://arxiv.org/abs/2001.08361) - the original paper this module's concepts and exponents (alpha_N, alpha_D, alpha_C) are drawn from; the real power-law fits this module's toy experiment explicitly does not attempt to reproduce.
- [Scaling Laws for Autoregressive Generative Modeling (Henighan et al., 2020)](https://arxiv.org/abs/2010.14701) - extends power-law scaling analysis beyond text to other modalities, useful for seeing how general the phenomenon is claimed to be.
- [Training Compute-Optimal Large Language Models (Hoffmann et al., 2022)](https://arxiv.org/abs/2203.15556) - the Chinchilla paper, covered in depth in Module 04; revisits Kaplan et al.'s scaling laws and argues for a different N/D compute-optimal split.

## Next

[Module 04: Compute Budgets and Chinchilla Optimality](../04-compute-budgets-and-chinchilla-optimality/README.md)
