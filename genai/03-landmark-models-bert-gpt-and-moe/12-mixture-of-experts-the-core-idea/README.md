# Module 12: Mixture of Experts — The Core Idea

## Why this matters

Every model this track has run code against so far — BERT, GPT-2,
Llama's architecture family — is **dense**: every parameter
participates in every forward pass, for every token. Module 09 named
mixture-of-experts (MoE) as one of three real, documented
industry trends beyond GPT-4, and Module 11's Reference table listed
"total parameter count" and "active compute per token" as two
different numbers for the first time without fully explaining why they
can differ. This module makes that concrete: it builds a tiny MoE
layer from scratch, counts its actual parameters, and — critically —
counts how many of them a single token's forward pass actually
*touches*. The verified result is the entire selling point of MoE in
one number: total parameters roughly quadruple with four experts, but
a single token's forward pass still only calls one expert — the same
amount of compute as the plain dense feed-forward layer it replaced.
This module also surfaces, honestly, the problem this creates and
leaves unsolved: an untrained router's expert choices are not evenly
distributed, which is exactly what Module 13 (routing and load
balancing) exists to fix.

## Concepts

### Where MoE lives: replacing the feed-forward block, not attention

Track 02, Module 09 established that a transformer block's feed-forward
network (FFN) processes each token independently — no mixing across
positions, unlike attention. That per-token independence is exactly
what makes the FFN swappable for a mixture-of-experts layer: instead of
one FFN every token passes through, an MoE layer has **several** FFNs
("experts") of identical shape, plus a small **router** (a linear layer
mapping each token's vector to a score per expert) that decides which
expert(s) handle each token.

```
 DENSE FFN (every token, every module so far)
 ──────────────────────────────────────────────
 token -> [ FFN ] -> output          (ONE set of FFN weights,
                                       used by every token)

 MIXTURE OF EXPERTS (this module)
 ──────────────────────────────────────────────
 token -> [ router ] -> picks expert -> [ Expert_2 ] -> output
                                          (Expert_0, 1, 3 NOT
                                           touched for this token)
          router = a small linear layer scoring every expert;
          this module uses top-1: the single highest-scoring expert
```

### Verified: total parameters scale with expert count, active-per-token compute does not

Building four small expert FFNs (identical shape to a single dense FFN)
plus a router, and comparing real parameter counts:

```python
import torch
import torch.nn as nn

torch.manual_seed(0)
d_model, d_ff, num_experts = 8, 16, 4

class Expert(nn.Module):
    def __init__(self):
        super().__init__()
        self.fc1 = nn.Linear(d_model, d_ff)
        self.fc2 = nn.Linear(d_ff, d_model)
    def forward(self, x):
        return self.fc2(torch.relu(self.fc1(x)))

experts = nn.ModuleList([Expert() for _ in range(num_experts)])
router = nn.Linear(d_model, num_experts)
dense = Expert()  # identical shape, used as the "plain FFN" baseline

def count_params(m):
    return sum(p.numel() for p in m.parameters())

total_moe_params = sum(count_params(e) for e in experts) + count_params(router)
print('single expert params:', count_params(experts[0]))
print('single dense FFN params (same shape):', count_params(dense))
print('total MoE params (4 experts + router):', total_moe_params)
print('MoE total / dense ratio:', total_moe_params / count_params(dense))
```

Verified output:

```
single expert params: 280
single dense FFN params (same shape): 280
total MoE params (4 experts + router): 1156
MoE total / dense ratio: 4.128571428571429
```

Four experts of identical shape to the dense baseline produce roughly
4.13x the parameters (4x from the experts themselves, plus a small
router overhead) — this part is unsurprising: more weight matrices
means more parameters. The actually interesting question is how much
compute a **single token's forward pass** uses:

```python
tokens = torch.randn(6, d_model)
gate_logits = router(tokens)
chosen = gate_logits.argmax(dim=-1)  # top-1 routing: highest-scoring expert wins

out = torch.zeros(tokens.shape[0], d_model)
active_expert_calls = 0
for i in range(tokens.shape[0]):
    out[i] = experts[chosen[i].item()](tokens[i])
    active_expert_calls += 1

print('tokens:', tokens.shape[0], ' active expert calls:', active_expert_calls)
print('chosen expert per token:', chosen.tolist())
```

Verified output:

```
tokens: 6  active expert calls: 6
chosen expert per token: [2, 2, 1, 2, 2, 2]
```

**Six tokens produced exactly six expert calls — not 24** (which is
what `num_experts x num_tokens` would be if every expert ran on every
token, the way an ensemble would). Each token invokes exactly one
expert, the same as it would through the single dense FFN baseline.
This is the whole idea verified in two numbers from the same code: **~4x
the total parameters, but the same per-token active compute as the
dense baseline it replaced.** More total capacity to specialize into,
without a proportional increase in the cost of processing any single
token — exactly the trade-off Module 09 named without yet
demonstrating it.

### Verified: an untrained router's expert choices are not evenly distributed

The `chosen` list above — `[2, 2, 1, 2, 2, 2]` — is not a coincidence of
this random seed being unusual; it's the router's real, current
behavior on this input. Tallying it:

```python
import collections
print(dict(collections.Counter(chosen.tolist())))
```

Verified output:

```
{2: 5, 1: 1}
```

Five of six tokens went to expert 2. Experts 0 and 3 received **zero**
tokens. With an untrained, randomly initialized router, there is
nothing yet steering tokens toward balanced usage — some experts can
end up starved of tokens (and therefore of gradient signal during
training) while one dominates. This is a genuinely open problem this
module does **not** solve — it is exactly what Module 13 (MoE routing
and load balancing) exists to address, with real auxiliary losses
designed to push routing toward balance. This module's job was to make
the problem concretely visible with real numbers, not to solve it
prematurely.

## Reference

```
 Term                Meaning
 ──────────────────  ──────────────────────────────────────────────────
 Expert               One feed-forward network among several, identical
                      in shape to a dense FFN it could otherwise be
 Router / gate        A small linear layer scoring every token against
                      every expert; its argmax (top-1, this module) or
                      top-k (module 13/14) picks which expert(s) run
 Sparse activation    Only a subset of experts run per token — the
                      property this module verified numerically
                      (6 tokens -> 6 expert calls, not 24)
 Total parameters     Sum across ALL experts + router — what a MoE
                      checkpoint's file size / "parameter count"
                      headline reflects (verified: ~4.13x a dense
                      baseline with 4 experts)
 Active parameters    What a SINGLE token's forward pass actually
                      touches — router + one chosen expert (or top-k
                      experts) — the number that matters for inference
                      compute cost, not the headline total
 Load imbalance        Some experts receiving many more tokens than
                       others — verified above with an untrained router
                       (5 of 6 tokens to one expert); module 13's topic
```

## Hands-on exercises

### 1. Reproduce the parameter-count and active-compute comparison at a different expert count

Re-run the verified code above with `num_experts = 8` instead of 4.
Confirm the total-params-to-dense ratio moves toward roughly 8x (plus
router overhead) while the number of active expert calls for the same
6 tokens stays exactly 6 — the ratio scales with expert count, the
active-compute count does not.

### 2. Switch from top-1 to top-2 routing and recount active calls

Modify the routing loop to select each token's **top-2** highest-scoring
experts (`gate_logits.topk(2, dim=-1)`) instead of the single argmax,
and run both chosen experts per token (a common real-world choice —
covered further in module 14's Mixtral). Confirm the active expert
calls for 6 tokens becomes 12, not 6 — twice the per-token compute of
top-1, still far less than running all `num_experts` experts on every
token.

### 3. Observe load imbalance across several random seeds

Re-run the six-token routing example with three different
`torch.manual_seed()` values. Confirm that an uneven distribution (some
experts near-zero, one or two dominant) appears repeatedly with an
untrained router, rather than being a one-off property of seed 0 — this
is what motivates module 13's load-balancing losses as a real training
concern, not a hypothetical one.

## Independent challenge

A colleague reviewing a MoE model's spec sheet says: "This model has 8x
more parameters than our current dense model, so it must need roughly
8x the GPU memory and 8x the inference latency to serve." Using this
module's verified findings, explain what's right and what's wrong about
this statement.

<details><summary>Discussion</summary>

The memory claim is largely right: serving a model means holding (or
being able to page in) all of its weights, so an 8x-larger total
parameter count does mean roughly 8x more storage/memory footprint for
the weights themselves — this module's own parameter count (1156 vs.
280, roughly 4x with 4 experts) confirms total params scale directly
with expert count. The latency claim is wrong, and this module verified
exactly why: a single token's forward pass through a top-1-routed MoE
layer calls only **one** expert, the same active compute as the dense
baseline — verified directly (6 tokens, 6 expert calls, not
`num_experts x 6`). Per-token inference latency for the MoE layer
itself is much closer to the dense model's latency than to "8x the
compute," which is the entire trade-off MoE architectures are designed
around: more capacity (and more memory to hold it) without a
proportional per-token compute cost. The one caveat worth raising back:
if experts are unevenly loaded (this module's own verified finding),
real-world serving batches may not distribute perfectly evenly across
experts, which can matter for actual measured throughput — a nuance
worth flagging, but a separate concern from the "8x latency" claim
itself, which this module's active-compute count directly contradicts.

</details>

## Common mistakes & troubleshooting

- **Assuming "N experts" means N times the compute per token.** This
  module's own verified numbers show active expert calls equal the
  number of tokens processed (times top-k, if k>1), not
  `num_experts x num_tokens` — total *parameters* scale with expert
  count; per-token active *compute* does not.
- **Assuming a randomly initialized router already balances load.**
  This module's own verified tally (`{2: 5, 1: 1}` out of 4 possible
  experts, on 6 tokens) shows the opposite — real load balancing needs
  a mechanism, which module 13 covers. Don't assume it's automatic.
- **Confusing "total parameters" and "active parameters" when reading
  a MoE model's spec sheet.** A headline parameter count for a MoE
  model reflects every expert's weights combined (this module's
  ~4.13x-a-dense-baseline number); the number that predicts per-token
  inference compute is the much smaller active-parameter count (the
  router plus whichever expert(s) it chose).
- **Assuming MoE replaces attention.** It doesn't — this module's MoE
  layer replaces the feed-forward block specifically, reusing Track 02
  Module 09's finding that the FFN processes each token independently
  (which is exactly what makes per-token expert routing possible in the
  first place; attention's cross-token mixing has no equivalent
  per-token routing decision to make).
- **Treating this module's top-1 routing as the only real-world
  choice.** Top-2 (or higher) routing is common and covered in
  Exercise 2 and Module 14 (Mixtral); this module used top-1
  specifically because it's the simplest version to verify the core
  parameter-vs-compute trade-off cleanly.

## Checkpoint quiz

1. What did the verified parameter-count comparison show about total
   MoE parameters versus a same-shape dense FFN, using 4 experts?
2. For 6 input tokens routed top-1 across 4 experts, how many total
   expert calls were verified — and how does that number relate to
   `num_experts x num_tokens`?
3. What did the verified expert-usage tally show about an untrained
   router's load distribution, and which later module addresses this
   directly?
4. What specific transformer sub-layer does an MoE layer typically
   replace, and what property of that sub-layer (established in Track
   02) makes per-token expert routing possible?
5. Why is "total parameter count" alone a misleading number for
   predicting a MoE model's per-token inference cost, per this module's
   own verified findings?

<details><summary>Answers</summary>

1. Four experts (plus a small router) produced roughly 4.13x the
   parameters of a single same-shape dense FFN (1156 vs. 280) — close
   to the expected 4x from four full-sized expert FFNs, plus router
   overhead.
2. Exactly 6 — one expert call per token, verified directly in code.
   This is far less than `num_experts x num_tokens` (which would be 24
   for 4 experts and 6 tokens) — top-1 routing means each token only
   ever touches one expert, not all of them.
3. It showed a real, uneven distribution: 5 of 6 tokens routed to one
   expert, 1 to another, and 2 of the 4 experts receiving zero tokens
   at all. Module 13 (MoE Routing and Load Balancing) covers the
   auxiliary losses designed to fix this.
4. The feed-forward network (FFN). Track 02 Module 09 established that
   the FFN processes each token independently with no cross-token
   mixing, which is exactly what allows different tokens to be routed
   to different experts without disturbing each other.
5. Total parameter count reflects every expert's weights combined, but
   a single token's forward pass only activates the router plus its
   chosen expert(s) — this module verified active expert calls equal
   the token count (times top-k), not the expert count times the token
   count, so per-token compute stays close to a single dense FFN's cost
   regardless of how many total experts exist.

</details>

## Further reading & sources

- [Outrageously Large Neural Networks: The Sparsely-Gated Mixture-of-Experts Layer (Shazeer et al., 2017)](https://arxiv.org/abs/1701.06538) - the paper that introduced the sparsely-gated MoE layer this module's verified top-1 routing example is modeled on, including the load-imbalance problem this module surfaced and module 13 addresses.
- [Switch Transformers: Scaling to Trillion Parameter Models with Simple and Efficient Sparsity (Fedus et al., 2021)](https://arxiv.org/abs/2101.03961) - simplifies routing to top-1 (exactly this module's choice) and reports real total-vs-active parameter trade-offs at much larger scale than this module's toy example.
- [Track 02, Module 09: The Feed-Forward Network — Per-Token Processing](../../02-transformer-architecture/09-the-feed-forward-network-per-token-processing/README.md) - the source of the "FFN processes each token independently" finding this module relies on to explain why per-token expert routing is architecturally possible.

## Next

[Module 13: MoE Routing and Load Balancing](../13-moe-routing-and-load-balancing/README.md)
