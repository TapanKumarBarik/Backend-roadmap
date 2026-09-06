# Module 04: RNNs, LSTMs and the Sequence Problem

## Why this matters

Module 03 gave us good word representations. But a representation of
individual words isn't a model of *language* — you still need something
that processes a **sequence**, where order matters and the meaning of a
word depends on what came before it.

Recurrent neural networks were the answer for roughly a decade, and they
genuinely worked: RNNs and LSTMs powered Google Translate, speech
recognition, and autocomplete through the mid-2010s. Then they were
almost entirely replaced.

Understanding *why* they were replaced is the most important thing in
this module, because the two reasons are the exact design requirements
that produced the transformer:

1. **Information bottleneck** — an RNN compresses everything it has read
   into one fixed-size hidden state. Long-range dependencies get crushed.
   Attention (module 05) exists to fix this.
2. **Sequential computation** — an RNN must process token 1 before token
   2 before token 3. This cannot be parallelized, so it cannot exploit a
   GPU's thousands of cores (track 05), which caps how much data you can
   train on. The transformer's headline advantage isn't accuracy — it's
   that it parallelizes.

Every architectural choice in track 02 is a response to one of these two.
Meet the problems first and that track stops feeling arbitrary.

## Concepts

### The core RNN idea: a loop with memory

A feed-forward network maps one fixed-size input to one output. Language
isn't fixed-size. An RNN handles variable length by processing tokens one
at a time while carrying a **hidden state** — a vector that acts as a
running summary of everything seen so far.

At each timestep `t`:

```
hₜ = tanh(W_h · hₜ₋₁  +  W_x · xₜ  +  b)
yₜ = W_y · hₜ
```

```
UNROLLED THROUGH TIME — note every arrow is a hard dependency

  x₁          x₂          x₃          x₄
   │           │           │           │
   ▼           ▼           ▼           ▼
 ┌────┐  h₁  ┌────┐  h₂  ┌────┐  h₃  ┌────┐  h₄
 │RNN │─────►│RNN │─────►│RNN │─────►│RNN │────►
 └────┘      └────┘      └────┘      └────┘
   │           │           │           │
   ▼           ▼           ▼           ▼
  y₁          y₂          y₃          y₄

 SAME weights W_h, W_x reused at every step
 ────────────────────────────────────────────────
 t=4 CANNOT start until t=3 finishes  ──►  no parallelism
```

Read that as: *new memory = f(old memory, current input)*. The same
weight matrices `W_h`, `W_x` are reused at every timestep — that weight
sharing is what lets one network handle a sequence of any length.

The output `yₜ` at each step can be a distribution over the next token —
which is exactly the language modeling task from module 01, now with a
learned, unbounded-context summary instead of a fixed n-gram window.

### Why this beat n-grams

Compare against module 02's wall:

| | n-gram | RNN |
|---|---|---|
| Context | Fixed, tiny (`n-1` tokens) | In principle, unlimited |
| Similar words | Unrelated symbols | Share evidence via embeddings |
| Unseen sequences | Probability zero | Generalizes |
| Parameters | Grows as `V^n` | Fixed regardless of sequence length |

That "in principle, unlimited" is doing a lot of work, and the rest of
this module is about how it fails in practice.

### The vanishing gradient problem

Training uses **backpropagation through time**: unroll the network across
all timesteps and propagate the error backwards. Because the same weight
matrix is applied at every step, the gradient flowing back across `k`
timesteps involves multiplying by that matrix roughly `k` times.

The consequence is the same numerical issue as module 01's probability
products, in a different costume:

- Multiply numbers `< 1` many times → the gradient **vanishes** toward
  zero. Early timesteps receive essentially no learning signal, so the
  network never learns long-range dependencies.
- Multiply numbers `> 1` many times → the gradient **explodes** to
  infinity, producing `NaN` weights. (This one is easier to fix — clip
  the gradient norm.)

Vanishing is the killer. In practice a plain RNN struggles to connect
information more than ~10 timesteps apart. Consider:

> *"The **keys** that I left on the kitchen counter next to the pile of
> unopened mail from last week **are** missing."*

To choose "are" over "is", the model must remember that the subject was
plural, 14 words back. A vanilla RNN typically can't.

### LSTMs: gates to protect memory

The Long Short-Term Memory cell (Hochreiter & Schmidhuber, 1997, widely
adopted ~2014) addresses this with an explicit **cell state** that runs
through the sequence with only minor linear modification, plus three
learned **gates** controlling it:

- **Forget gate** — what to discard from the cell state.
- **Input gate** — what new information to write in.
- **Output gate** — what part of the cell state to expose as the hidden
  state.

The point is that the cell state's path is mostly additive rather than
repeatedly multiplied by a weight matrix, so gradients can flow across
many timesteps without vanishing. GRUs are a simpler two-gate variant
with broadly similar performance.

LSTMs genuinely extended usable context to roughly 100s of tokens and
were state of the art for years. But they **mitigate** the problem rather
than removing it, and they leave the second problem completely untouched.

### The two walls that killed recurrence

```
WALL 1 — the seq2seq bottleneck

 "le  chat  noir  s'est  assis  sur  le  tapis  hier  soir"
   │    │     │     │      │     │    │    │     │     │
   ▼    ▼     ▼     ▼      ▼     ▼    ▼    ▼     ▼     ▼
 ┌──────────────── ENCODER RNN ────────────────────────┐
 └─────────────────────────┬───────────────────────────┘
                           ▼
                    ┌─────────────┐
                    │   ONE 1024- │   ◄── EVERYTHING must fit here
                    │  dim vector │       50 words or 5, same size
                    └──────┬──────┘
                           ▼
 ┌──────────────── DECODER RNN ────────────────────────┐
 └─────────────────────────────────────────────────────┘
   │    │     │     │      │     │     │     │
   ▼    ▼     ▼     ▼      ▼     ▼     ▼     ▼
 "the black cat sat on the mat last night"

 attention's fix: let the decoder look back at ALL encoder
 states, not just the final squeezed one
```

**Wall 1 — the fixed-size bottleneck.** In a sequence-to-sequence model
(the standard translation setup), an encoder RNN reads the entire source
sentence and compresses it into a single final hidden state, which the
decoder then expands into the translation. Every word of a 50-word
sentence must survive in one ~1000-dimensional vector. Translation
quality measurably degraded as sentences got longer. Attention (module
05) was invented precisely to let the decoder look back at *all* encoder
states instead of just the last one.

**Wall 2 — no parallelism.** This is the one that actually ended the era.
`hₜ` depends on `hₜ₋₁`, which depends on `hₜ₋₂`. Computing timestep 500
*requires* having computed 1 through 499. A GPU with thousands of cores
sits mostly idle. Training time scales with sequence length no matter how
much hardware you buy.

The transformer's central claim is that you can drop recurrence entirely,
process every position simultaneously, and let attention handle the
relationships between positions. That converts an inherently sequential
algorithm into a big matrix multiplication — the thing GPUs are built
for. It's why the paper is called *"Attention Is All You Need"*: the
"all" means *you don't need recurrence*.

## Reference

| Term | Means |
|---|---|
| RNN | Network with a loop, carrying a hidden state across timesteps |
| Hidden state | Running summary vector of everything processed so far |
| BPTT | Backpropagation through time — unrolling the loop to train it |
| Vanishing gradient | Learning signal decays to ~0 over many timesteps |
| Exploding gradient | Learning signal grows without bound; fixed by clipping |
| LSTM | Gated cell (forget/input/output) with a protected cell state |
| GRU | Simpler 2-gate recurrent cell |
| seq2seq | Encoder RNN → fixed vector → decoder RNN |
| Bottleneck | Forcing a whole sequence through one fixed-size vector |

| Task | Code (PyTorch) |
|---|---|
| An RNN layer | `nn.RNN(input_size, hidden_size, batch_first=True)` |
| An LSTM layer | `nn.LSTM(input_size, hidden_size, batch_first=True)` |
| Run a sequence | `out, hidden = rnn(x)` |
| Clip exploding gradients | `nn.utils.clip_grad_norm_(model.parameters(), 1.0)` |
| Embedding layer | `nn.Embedding(vocab_size, embed_dim)` |

## Hands-on exercises

Install once: `pip install torch` (CPU build is fine — everything here is
tiny).

### 1. Implement an RNN cell by hand

The equation is short enough to write directly. No framework.

```python
import numpy as np

def rnn_cell(x_t, h_prev, W_x, W_h, b):
    return np.tanh(W_x @ x_t + W_h @ h_prev + b)

rng = np.random.default_rng(0)
hidden_size, input_size = 4, 3
W_x = rng.normal(0, 0.5, (hidden_size, input_size))
W_h = rng.normal(0, 0.5, (hidden_size, hidden_size))
b = np.zeros(hidden_size)

h = np.zeros(hidden_size)
sequence = [rng.normal(0, 1, input_size) for _ in range(5)]

for t, x in enumerate(sequence):
    h = rnn_cell(x, h, W_x, W_h, b)
    print(f"t={t}  h={np.round(h, 3)}")
```

Note that `h` at each step depends on the previous `h`. Write one
sentence explaining why this loop cannot be run in parallel across `t`.

### 2. Watch a gradient vanish

```python
import numpy as np

def gradient_over_time(w, steps=30):
    """Crude model of the repeated multiplication in BPTT."""
    return [w ** k for k in range(1, steps + 1)]

for w in [0.5, 0.9, 1.0, 1.1]:
    g = gradient_over_time(w)
    print(f"w={w}:  after 10 steps={g[9]:.2e}   after 30 steps={g[29]:.2e}")
```

Look at `w=0.5` and `w=1.1` after 30 steps. State which is the vanishing
case and which is exploding, and which of the two is easier to fix in
practice (and how).

### 3. Train a real RNN to count parity

A clean test of memory: given a binary sequence, output whether it
contains an odd number of 1s. This *requires* remembering across the
whole sequence.

```python
import torch
import torch.nn as nn

torch.manual_seed(0)

def make_batch(n, length):
    x = torch.randint(0, 2, (n, length, 1)).float()
    y = (x.sum(dim=1) % 2)
    return x, y

class ParityRNN(nn.Module):
    def __init__(self, hidden=16, cell="rnn"):
        super().__init__()
        Cell = nn.RNN if cell == "rnn" else nn.LSTM
        self.rnn = Cell(1, hidden, batch_first=True)
        self.fc = nn.Linear(hidden, 1)
    def forward(self, x):
        out, _ = self.rnn(x)
        return self.fc(out[:, -1, :])      # only the final hidden state

def train(cell, length, epochs=300):
    model = ParityRNN(cell=cell)
    opt = torch.optim.Adam(model.parameters(), lr=0.01)
    lossf = nn.BCEWithLogitsLoss()
    for _ in range(epochs):
        x, y = make_batch(64, length)
        opt.zero_grad()
        loss = lossf(model(x), y)
        loss.backward()
        nn.utils.clip_grad_norm_(model.parameters(), 1.0)
        opt.step()
    x, y = make_batch(500, length)
    acc = ((model(x) > 0).float() == y).float().mean().item()
    return acc

for length in [5, 15, 40]:
    print(f"len={length:3d}   RNN acc={train('rnn', length):.2f}   "
          f"LSTM acc={train('lstm', length):.2f}")
```

This takes a minute or two on CPU. Expect both to handle length 5, the
plain RNN to degrade toward chance (0.5) as length grows, and the LSTM to
hold up longer. Record your numbers — this is the vanishing gradient
problem measured, not described.

### 4. Time the sequential bottleneck

```python
import torch, torch.nn as nn, time

lstm = nn.LSTM(64, 128, batch_first=True)
linear = nn.Linear(64, 128)     # a parallelizable comparison

for length in [10, 100, 1000]:
    x = torch.randn(32, length, 64)

    t0 = time.perf_counter()
    lstm(x)
    t_rnn = time.perf_counter() - t0

    t0 = time.perf_counter()
    linear(x)                    # all positions at once
    t_lin = time.perf_counter() - t0

    print(f"len={length:5d}  LSTM={t_rnn*1000:7.2f}ms  "
          f"parallel-linear={t_lin*1000:6.2f}ms  ratio={t_rnn/t_lin:6.1f}x")
```

Watch the ratio grow with sequence length. The linear layer touches all
positions simultaneously; the LSTM cannot. Write one sentence connecting
this measurement to why the field abandoned recurrence despite LSTMs
working reasonably well.

### 5. Feel the seq2seq bottleneck

```python
import torch, torch.nn as nn
torch.manual_seed(0)

encoder = nn.LSTM(32, 64, batch_first=True)

for length in [5, 20, 100]:
    x = torch.randn(1, length, 32)
    out, (h_n, c_n) = encoder(x)
    print(f"input: {length} timesteps x 32 dims = {length*32:5d} numbers"
          f"  ->  final state: {h_n.numel()} numbers")
```

Every sequence, regardless of length, is compressed into the same 64
numbers before the decoder ever sees it. Answer: what specifically would
you expect to degrade first as input length grows, and what would you
change about the decoder's access to fix it? (Your answer is module 05.)

### 6. Diagnose and fix: NaN loss

A colleague's RNN training loop prints a normal loss for ~40 steps, then
`nan` forever. They have no gradient clipping. Name the problem, explain
which multiplication causes it, and give the one-line fix.

<details><summary>Answer</summary>

Exploding gradients. In BPTT the gradient is propagated back through the
same recurrent weight matrix once per timestep; if its effective scale
exceeds 1, repeated multiplication grows the gradient exponentially with
sequence length until it overflows to `inf`, and the subsequent weight
update produces `nan` — which then contaminates every later step.

Fix: `nn.utils.clip_grad_norm_(model.parameters(), 1.0)` between
`loss.backward()` and `opt.step()`.

Worth noting the asymmetry: exploding gradients are loud (obvious `nan`)
and easy to fix. Vanishing gradients are silent — training completes,
loss decreases, and the model simply never learned long-range
dependencies. Silent failure is the more dangerous of the two, and it's
what motivated LSTMs.
</details>

## Independent challenge

Build a **character-level language model** with an LSTM, trained on a
text file of your choice (~100KB is plenty). Requirements: an embedding
layer, an LSTM, a linear output over the character vocabulary, and a
sampling loop that generates text one character at a time.

Then write up:

1. Generated samples after 1, 10, and 100 epochs — watch structure
   emerge (first spaces and letter frequencies, then word-like tokens,
   then quotes/newlines matching).
2. A comparison against module 02's bigram model on the same text. Which
   produces more coherent output, and over what distance?
3. A paragraph on where the LSTM's coherence breaks down, and which of
   this module's two walls you think you're hitting.

This is the direct ancestor of GPT — same autoregressive sampling loop,
just a recurrent core instead of a transformer.

## Common mistakes & troubleshooting

- **Forgetting gradient clipping.** Exploding gradients will produce
  `nan` and waste a training run (exercise 6).
- **Assuming an LSTM "solved" long-range dependencies.** It extended
  usable range substantially; it did not remove the limit, and it did
  nothing at all about parallelism.
- **Using only the final hidden state when you have all of them.** `out`
  from `nn.LSTM` contains every timestep's hidden state. Collapsing to
  `out[:, -1, :]` is right for classification but throws away exactly the
  information attention will exploit.
- **Confusing hidden state with cell state in an LSTM.** `nn.LSTM`
  returns `(h_n, c_n)`; `h_n` is the exposed output, `c_n` is the
  protected internal memory. Passing the wrong one when initializing a
  decoder is a common silent bug.
- **Benchmarking recurrence on short sequences and concluding it's fast
  enough.** The parallelism gap widens with length (exercise 4) — that's
  where the argument actually lives.

## Checkpoint quiz

1. Write the RNN hidden-state update equation and say what each term is.
2. Why can't RNN timesteps be computed in parallel?
3. What causes vanishing gradients in BPTT, and why is vanishing more
   dangerous than exploding?
4. What are an LSTM's three gates, and what protects the cell state from
   the vanishing problem?
5. Describe the seq2seq bottleneck in one sentence.
6. Which of the two walls does attention address, and which does dropping
   recurrence address?

<details><summary>Answers</summary>

1. `hₜ = tanh(W_h·hₜ₋₁ + W_x·xₜ + b)` — new hidden state from the
   previous hidden state, the current input, and a bias, squashed by
   `tanh`. The same weights are reused at every timestep.
2. Each step's hidden state depends on the previous step's, so step `t`
   cannot begin until `t-1` finishes — an inherently serial dependency
   chain.
3. The gradient is propagated back through the same recurrent weight
   matrix once per timestep, so it is effectively raised to a power;
   scales below 1 decay toward zero. Vanishing is more dangerous because
   it fails silently — training appears to succeed while long-range
   dependencies simply never get learned — whereas exploding produces an
   obvious `nan` and is fixed by clipping.
4. Forget, input, output. The cell state is modified mostly additively
   rather than by repeated matrix multiplication, so gradients can flow
   across many timesteps.
5. An encoder must compress an entire input sequence of any length into
   one fixed-size vector, which the decoder alone must work from.
6. Attention addresses the fixed-size bottleneck (the decoder can look at
   every encoder state). Dropping recurrence addresses the parallelism
   wall, which is what made training at internet scale feasible.
</details>

## Further reading & sources

- [Understanding LSTM Networks (Christopher Olah, 2015)](https://colah.github.io/posts/2015-08-Understanding-LSTMs/) - the single best explanation of LSTM gates ever written, with the diagrams everyone else copies. Read this if the forget/input/output gates haven't clicked.
- [Long Short-Term Memory (Hochreiter & Schmidhuber, 1997)](https://www.bioinf.jku.at/publications/older/2604.pdf) - the original LSTM paper, written 17 years before the hardware existed to make it matter.
- [On the difficulty of training Recurrent Neural Networks (Pascanu et al., 2013)](https://arxiv.org/abs/1211.5063) - the formal treatment of vanishing/exploding gradients and where gradient clipping comes from.
- [The Unreasonable Effectiveness of Recurrent Neural Networks (Karpathy, 2015)](https://karpathy.github.io/2015/05/21/rnn-effectiveness/) - character-level RNNs generating Shakespeare, LaTeX and C code. This is the independent challenge, done by the person who popularized it.
- [Sequence to Sequence Learning with Neural Networks (Sutskever et al., 2014)](https://arxiv.org/abs/1409.3215) - the encoder-decoder architecture whose bottleneck exercise 5 measures.
- [PyTorch nn.LSTM documentation](https://pytorch.org/docs/stable/generated/torch.nn.LSTM.html) - API reference, including the `(h_n, c_n)` return values that are a common source of silent bugs.
- [Empirical Evaluation of Gated Recurrent Neural Networks (Chung et al., 2014)](https://arxiv.org/abs/1412.3555) - the GRU-vs-LSTM comparison, if you want to know when the simpler cell suffices.

## Next

[Module 05: The Attention Breakthrough](../05-the-attention-breakthrough/README.md)
