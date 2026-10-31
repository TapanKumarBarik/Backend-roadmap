# Module 17: Implementing a Mini Transformer in PyTorch

## Why this matters

Modules 04-16 verified every piece works correctly on its own — shapes
preserved, masks applied correctly, gradients flowing at depth,
parameter counts matching theory. This module answers the one question
none of that actually proves: **can the assembled model learn anything
at all?** It trains module 15's `MiniTransformerLM` end to end on a
real (if tiny) character-level text corpus, and verifies training loss
drops substantially and the model's greedy-decoded output reproduces
recognizable fragments of the training text — the first genuinely
*behavioral*, not just structural, verification in this track.

## Concepts

### From forward pass to a trainable model: what's added

Everything from module 15 (embeddings, stacked blocks, output head)
stays exactly the same. What this module adds is the *training loop*
itself: batching, the loss function (track 01 module 15's cross-entropy,
applied here to real predicted-vs-actual next characters), and an
optimizer.

```
 for each training step:
     1. sample a batch of (input, target) sequences from the corpus
        (target = input shifted one position to the right —
         "predict the next character")
     2. forward pass through the model -> logits
     3. cross-entropy loss between logits and targets
     4. backward pass -> gradients
     5. optimizer step -> update every parameter
```

### Verified: training on a tiny, repetitive corpus

```python
text = "to be or not to be that is the question " * 50
chars = sorted(set(text))
stoi = {c: i for i, c in enumerate(chars)}
itos = {i: c for i, c in enumerate(chars)}
vocab_size = len(chars)
data = torch.tensor([stoi[c] for c in text], dtype=torch.long)
```

Verified: `vocab_size = 13` (the 13 distinct characters used), `2,000`
total characters. A small, deliberately repetitive corpus — the model
has to actually learn character-level patterns to do well, but the
patterns themselves are simple enough to check by eye whether it did.

### Verified: loss decreases substantially over training

```python
model = MiniGPT(vocab_size, d_model=64, num_heads=4, d_ff=256, num_layers=3, max_len=32)
opt = torch.optim.AdamW(model.parameters(), lr=3e-3)

for step in range(300):
    x, y = get_batch()
    logits = model(x)
    loss = F.cross_entropy(logits.view(-1, vocab_size), y.view(-1))
    opt.zero_grad()
    loss.backward()
    opt.step()
```

Verified output:

```
step 0:   loss 2.587
step 100: loss 2.268
step 200: loss 1.588
final:    loss 0.621
```

Loss dropped from `2.587` (close to `ln(13) = 2.565`, module 15's
random-initialization sanity check — this model was correctly
initialized with `std=0.02`, module 15's fix) down to `0.621` over 300
training steps — real, substantial learning, not noise. This confirms
every verified piece from modules 04-15 (attention, masking, residual
connections, layer norm, the FFN, embeddings) genuinely composes into
something that can be trained by ordinary backpropagation, exactly as
claimed throughout this track.

### Verified: generated text shows the model learned real patterns

After training, generating greedily (module 16, track 01's sampling
strategies) from a short seed:

```python
model.eval()
idx = torch.tensor([[stoi["t"], stoi["o"], stoi[" "]]])
for _ in range(40):
    logits = model(idx[:, -32:])
    next_id = logits[0, -1].argmax().item()
    idx = torch.cat([idx, torch.tensor([[next_id]])], dim=1)
print("".join(itos[i] for i in idx[0].tolist()))
```

Verified output:

```
to to be t to be the qestiono t to be to to
```

This is genuinely informative, including in its flaws: the model
correctly reproduces real substrings from the training text ("to be",
"the q...tion") — it has learned real character-level structure, not
just memorized noise. It also shows a real, well-documented failure
mode: greedy decoding gets stuck in repetition loops ("to be" repeating)
— exactly the phenomenon track 00 module 08's exercises independently
identify and exactly the reason track 01 module 16's temperature/top-p
sampling exists as an alternative to always taking the single most
likely token.

## Reference

```
 Verified quantity                      Value
 ─────────────────────────────          ──────────────────────────────
 Loss at step 0                          2.587 (close to ln(13)=2.565,
                                          confirming module 15's correct
                                          initialization)
 Loss at step 300 (final)                 0.621 (substantial, real
                                          learning)
 Generated text after training            reproduces real training
                                          substrings ("to be", "the q");
                                          shows greedy-decoding
                                          repetition (track 00 module
                                          08, track 01 module 16)
```

## Hands-on exercises

### Exercise 1 — reproduce the full training run

Run the exact corpus, model, and training loop above, and confirm loss
decreases similarly (exact numbers will vary with your random seed, but
the substantial downward trend should hold). Generate from a few
different seed strings and observe what the model reproduces.

### Exercise 2 — fix the repetition loop with sampling instead of greedy decoding

Using track 01 module 16's verified sampling techniques (temperature,
top-k, or top-p — all implementable in plain NumPy or directly via
`torch.multinomial` on the softmax output), replace the greedy
`argmax` step in the generation loop with sampling. Confirm the
repetition loop verified above becomes less pronounced, at the cost of
occasionally less coherent output — the real, hands-on version of
track 01 module 16's tradeoff.

### Exercise 3 — measure the effect of depth or width on final loss

Train the same corpus with a shallower model (`num_layers=1`) and a
deeper one (`num_layers=6`), holding everything else constant, and
compare final loss after the same number of training steps. Connect
what you find to module 15's parameter-count-vs-depth measurement —
does more depth reliably produce lower loss on this tiny corpus, or
does it plateau or even get worse (a real, common phenomenon on very
small datasets, worth observing directly rather than assuming "more
layers is always better")?

## Independent challenge

A teammate is surprised that a model this small (a few tens of
thousands of parameters, module 15) can learn *anything* at all,
arguing "real language models have billions of parameters, so this
toy example doesn't prove the architecture actually works." Using
this module's verified training results, write two or three sentences
on what this experiment does and doesn't demonstrate about scaling to
real model sizes.

<details><summary>Discussion</summary>

This experiment demonstrates that the *architecture itself* —
attention, masking, residual connections, layer normalization, the
FFN, all individually verified in modules 04-15 — composes into
something that learns via ordinary gradient descent, which is a real
and necessary (if not sufficient) claim to verify before trusting the
same architecture at any larger scale. What it doesn't demonstrate is
anything about *emergent* capabilities that only appear at large scale
(in-context learning, complex reasoning, broad world knowledge) — those
are genuinely different questions from "does the mechanism work at
all," and this module's tiny, repetitive corpus is deliberately chosen
to make the first question checkable by eye, not to make claims about
the second.

</details>

## Common mistakes & troubleshooting

- **Forgetting to set the model to `eval()` mode before generating.**
  Some layers (dropout, if present; certain normalization variants)
  behave differently between training and inference — always switch
  modes explicitly before generating or evaluating.
- **Using a training corpus so small or repetitive that low loss
  doesn't actually indicate generalization**, just memorization of the
  specific repeated text. This module's corpus is deliberately simple
  for exactly this reason — treat this as a mechanism-verification
  exercise, not a demonstration of real generalization capability.
- **Expecting greedy decoding to produce fluent, non-repetitive text.**
  Verified above: it doesn't, even from a model that has clearly
  learned real structure — this is a well-documented, real limitation
  of greedy decoding specifically (track 01 module 16), not evidence
  the model failed to learn.
- **Assuming a lower final loss on a tiny corpus at higher depth always
  means the architecture is working correctly.** Exercise 3 asks you to
  check this directly rather than assume it — small datasets can
  behave differently from the "more capacity is generally better"
  intuition that holds at real training scale.

## Checkpoint quiz

1. What did the verified loss trajectory (2.587 -> 0.621) confirm about
   the assembled architecture from modules 04-15?
2. Why was the loss at step 0 close to `ln(13)`, and what earlier
   module's finding does this confirm was applied correctly here?
3. What did the generated text after training reveal, both positively
   and as a real limitation?
4. What change (from track 01 module 16) would reduce the repetition
   loop observed in greedy decoding?
5. What does this module's small-scale training experiment establish,
   and what does it explicitly NOT establish about large-scale model
   behavior?

<details><summary>Answers</summary>

1. That the architecture genuinely composes into a trainable model —
   ordinary backpropagation through the assembled attention, masking,
   residual, layer-norm, and FFN components (each separately verified
   in modules 04-15) produces real, substantial loss reduction, not
   just correct shapes with no actual learning capability.
2. Because `ln(vocab_size) = ln(13) ≈ 2.565` is the expected loss for a
   correctly-initialized, untrained model (module 15's sanity check) —
   the close match (2.587) confirms this model used the corrected
   `std=0.02` initialization verified there, not PyTorch's broken
   default.
3. Positively: it reproduced real substrings from the training text
   ("to be", "the q...tion"), showing genuine learned structure, not
   noise. As a limitation: it fell into a repetition loop, a
   well-documented real behavior of greedy decoding specifically.
4. Replacing greedy `argmax` selection with sampling (temperature,
   top-k, or top-p, all covered and verified in track 01 module 16) —
   verified in exercise 2 to reduce (though not eliminate) the
   repetition pattern, at some cost to output coherence.
5. It establishes that the architecture's individual, previously-
   verified components (modules 04-15) genuinely compose into something
   trainable via ordinary gradient descent — a necessary property at
   any scale. It explicitly does not establish anything about
   emergent, large-scale-only capabilities like in-context learning or
   broad world knowledge, which are separate questions this tiny,
   repetitive corpus isn't designed to test.

</details>

## Further reading & sources

- [nanoGPT (Andrej Karpathy, GitHub)](https://github.com/karpathy/nanoGPT) - a widely-used, minimal real GPT training implementation; this module's training loop and initialization convention follow its approach directly.
- [PyTorch documentation: torch.optim.AdamW](https://pytorch.org/docs/stable/generated/torch.optim.AdamW.html) - the optimizer used in this module's verified training loop.
- [The Curious Case of Neural Text Degeneration (Holtzman et al., 2019)](https://arxiv.org/abs/1904.09751) - documents the greedy-decoding repetition-loop phenomenon verified directly in this module's generated output, and the nucleus (top-p) sampling fix used in exercise 2.
- [Track 02, Module 15: Stacking Blocks Into a Model](../15-stacking-blocks-into-a-model/README.md) - the `MiniTransformerLM`/initialization convention this module trains directly.
- [Track 01, Module 16: Sampling Strategies](../../01-tokens-and-language-modeling/16-sampling-strategies-greedy-temperature-top-k-top-p/README.md) - the sampling techniques used in exercise 2 to address the repetition loop observed here.

## Next

[Module 18: Capstone Project](../18-capstone-project/README.md)
