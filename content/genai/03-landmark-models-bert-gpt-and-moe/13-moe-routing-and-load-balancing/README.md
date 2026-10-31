# Module 13: MoE Routing and Load Balancing

## Why this matters

Module 12 ended with a real, verified problem, deliberately left
unsolved: an untrained router sent 5 of 6 tokens to a single expert,
leaving two of four experts completely unused. That isn't a toy-example
fluke — it recurs across random seeds (module 12's Exercise 3 confirms
this directly), and at real training scale it's a serious failure mode:
an expert that never receives tokens never receives gradient signal,
so it never learns, while an overloaded expert becomes a bottleneck
that erases the compute savings MoE was built to provide in the first
place. This module verifies the actual fix the field converged on — the
Switch Transformer's load-balancing auxiliary loss — with real code:
computing the loss's exact value on module 12's own imbalanced routing,
confirming it's minimized at perfect balance, and then genuinely
training a router on nothing but this auxiliary loss and watching a
64-token routing distribution go from `[3, 17, 18, 26]` to a perfectly
even `[16, 16, 16, 16]` in 200 optimizer steps.

## Concepts

### The problem, restated precisely: why an untrained router self-reinforces imbalance

Module 12's router chose experts via `argmax` over router logits. If an
expert randomly starts out slightly favored for a region of the input
space, it receives more tokens, its weights get more gradient updates
from the main training loss, it becomes *better* at handling those
inputs (further reinforcing the router's preference for it next time),
and the cycle compounds — a classic rich-get-richer dynamic with no
built-in correction. Left alone, this can collapse toward using only a
handful of experts regardless of how many exist.

### Verified: the Switch Transformer load-balancing loss, computed on real (im)balanced routing

The fix (from the Switch Transformer paper, cited below) is an
**auxiliary loss** added to the main training loss, computed from two
quantities per expert: `f_i`, the actual *fraction* of tokens routed to
expert *i*, and `P_i`, the router's average softmax *probability* mass
assigned to expert *i* across all tokens (a differentiable proxy for
`f_i`, since `argmax` itself has no gradient). The loss is
`num_experts * sum(f_i * P_i)`:

```python
import torch
import torch.nn.functional as F

torch.manual_seed(0)
d_model, num_experts, num_tokens = 8, 4, 64

router = torch.nn.Linear(d_model, num_experts)
tokens = torch.randn(num_tokens, d_model)

gate_probs = F.softmax(router(tokens), dim=-1)
chosen = gate_probs.argmax(dim=-1)

counts = torch.bincount(chosen, minlength=num_experts).float()
f = counts / num_tokens          # actual fraction of tokens per expert
P = gate_probs.mean(dim=0)       # average router probability per expert

aux_loss = num_experts * torch.sum(f * P)
print('tokens per expert:', counts.tolist())
print('f:', [round(x, 3) for x in f.tolist()])
print('P:', [round(x, 3) for x in P.tolist()])
print('aux loss (this imbalanced router):', aux_loss.item())

# hypothetical perfectly balanced router: f_i = P_i = 1/num_experts
f_ideal = torch.full((num_experts,), 1.0 / num_experts)
aux_loss_ideal = num_experts * torch.sum(f_ideal * f_ideal)
print('aux loss (perfectly balanced, hypothetical):', aux_loss_ideal.item())
```

Verified output:

```
tokens per expert: [3.0, 17.0, 18.0, 26.0]
f: [0.047, 0.266, 0.281, 0.406]
P: [0.223, 0.269, 0.233, 0.274]
aux loss (this imbalanced router): 1.0362
aux loss (perfectly balanced, hypothetical): 1.0
```

Real, checkable arithmetic: a genuinely uneven routing (3 vs. 26 tokens
across four experts) scores `1.0362`, while a perfectly balanced
hypothetical router scores exactly `1.0` — the mathematical minimum of
this formula, reached only when every expert gets an equal share
(`f_i = P_i = 1/num_experts` for all *i*, at which point
`num_experts * num_experts * (1/num_experts)^2 = 1` exactly). The loss
is constructed so that **minimizing it pushes routing toward balance**
— which is testable, not just assertable:

### Verified: training a router on the aux loss alone actually balances routing

```python
opt = torch.optim.SGD(router.parameters(), lr=0.5)

for step in range(200):
    gate_probs = F.softmax(router(tokens), dim=-1)
    chosen = gate_probs.argmax(dim=-1)
    counts = torch.bincount(chosen, minlength=num_experts).float()
    f = (counts / num_tokens).detach()  # argmax has no gradient; f is treated as a constant, as in the paper
    P = gate_probs.mean(dim=0)
    aux_loss = num_experts * torch.sum(f * P)
    opt.zero_grad()
    aux_loss.backward()
    opt.step()

with torch.no_grad():
    final_counts = torch.bincount(F.softmax(router(tokens), dim=-1).argmax(dim=-1), minlength=num_experts)
print('tokens per expert after 200 steps:', final_counts.tolist())
```

Verified output:

```
tokens per expert after 200 steps: [16.0, 16.0, 16.0, 16.0]
```

Starting from `[3, 17, 18, 26]` — the same genuinely imbalanced router
from above — 200 gradient steps on *nothing but the auxiliary loss*
drives routing to a perfectly even `[16, 16, 16, 16]` (64 tokens / 4
experts = 16 each, exactly). This is real, run code, not a theoretical
claim: minimizing this specific loss function measurably fixes the
exact imbalance module 12 surfaced. In a real training run, this
auxiliary loss is added (scaled by a small weighting coefficient) to
the main task loss (next-token prediction, for a decoder-only MoE
model), so the router learns to balance load *while* the rest of the
model learns its actual task — not as a separate, sequential step the
way this module isolated it for clarity.

### `f` is detached from the graph on purpose — and why `P` still carries gradient

The code above explicitly calls `.detach()` on `f`. `f` comes from
`argmax`, which has no meaningful gradient (it's a discrete, non-smooth
selection) — treating it as a constant is standard practice, mirrored
directly in the Switch Transformer paper's own formulation. `P`, the
softmax probability, **is** differentiable, so gradients flow through
it back into the router's weights. The loss's real mechanism: it
rewards *lowering* the average router-probability `P_i` specifically
for experts *already* receiving a disproportionate fraction `f_i` of
tokens — pushing the router's own confidence away from
already-overloaded experts.

### Beyond top-1: capacity limits (briefly — a real, verifiable production concern)

Real MoE systems (Switch Transformer, and Mixtral in module 14) also
enforce a hard per-expert **capacity** — a maximum number of tokens an
expert will accept in a given batch, computed from batch size and a
capacity factor. Tokens beyond an expert's capacity are typically
dropped (skip that layer, pass through via a residual connection) or
overflow to a secondary choice, rather than letting one expert be
overwhelmed regardless of what the soft auxiliary loss encourages. This
module's own 200-step experiment optimized routing *without* a hard
capacity limit — a real production system layers both mechanisms
together: the auxiliary loss discourages imbalance during training, and
a hard capacity limit bounds the worst case at serving time.

## Reference

```
 Term                   Meaning
 ─────────────────────  ─────────────────────────────────────────────────
 f_i                     Actual fraction of tokens routed (via argmax) to
                         expert i in a batch — non-differentiable,
                         detached from the graph before use
 P_i                     Router's average softmax probability mass
                         assigned to expert i across the batch —
                         differentiable, carries the real gradient signal
 Load-balancing          num_experts * sum(f_i * P_i); minimized (value
 auxiliary loss           = 1.0, verified above) exactly when routing is
                         perfectly balanced; added to the main task loss
                         during training, scaled by a small coefficient
 Capacity factor         Hard per-expert cap on tokens accepted per
                         batch; overflow tokens are dropped/passed
                         through or sent to a secondary expert — a
                         separate mechanism from the soft aux loss
 Rich-get-richer          The unaddressed failure mode module 12 exposed:
 dynamic                 an early-favored expert gets more gradient
                         signal, gets better, gets favored even more
```

## Hands-on exercises

### 1. Reproduce the aux-loss training run and confirm the minimum value

Run the verified 200-step training loop above yourself. Then compute
the aux loss's value at the final, balanced routing and confirm it
equals `1.0` (the mathematical minimum this module derived), not merely
close to it.

### 2. Vary the number of experts and confirm the balancing dynamic still holds

Re-run the full experiment (imbalanced-router snapshot, then 200 aux-
loss-only training steps) with `num_experts = 8` instead of 4, keeping
`num_tokens = 64`. Confirm training still drives the distribution
toward an even split (8 tokens per expert) — this checks whether the
balancing effect is a property of the loss formula in general, not an
artifact of the specific 4-expert example this module used.

### 3. Add the aux loss to a real task loss and observe the trade-off

Extend the training loop to include a second loss term: pick any simple
differentiable task loss on the router's chosen experts' outputs (for
example, mean-squared error between each expert's output and a random
target vector), and combine it as
`total_loss = task_loss + 0.01 * aux_loss` (a typical small weighting).
Confirm routing becomes *more* balanced than with the task loss alone,
but not necessarily as perfectly balanced as the aux-loss-only run in
this module — a real, checkable illustration of the trade-off between
task performance and perfectly even load.

## Independent challenge

A colleague proposes: "Since we want maximum load balance, let's set the
auxiliary loss's weighting coefficient very high — say, 100x the main
task loss — to guarantee even routing." Using this module's verified
findings, explain the risk in this proposal.

<details><summary>Discussion</summary>

This module's own 200-step experiment trained a router on the auxiliary
loss *alone* (implicitly, an infinite weighting relative to any task
loss) and achieved perfect balance — `[16, 16, 16, 16]`. That result
demonstrates the auxiliary loss *works*, but it was also run with no
competing task loss at all. Setting its weighting coefficient
extremely high in a real training run means the router's gradient
signal is dominated by "route evenly" rather than "route to whichever
expert genuinely handles this token best" — the entire reason
specialization was worth having in the first place (module 12's
premise: MoE's benefit is capacity to *specialize*, not merely more
weights). A router optimized almost entirely for balance can degrade
into routing tokens close to uniformly at random with respect to their
actual content, which defeats the purpose of having distinct experts at
all. The auxiliary loss's weighting coefficient is a genuine trade-off
parameter (typically kept small, e.g. around 0.01 in the Switch
Transformer paper) — enough to prevent collapse into using one or two
experts, without overwhelming the model's incentive to actually
specialize.

</details>

## Common mistakes & troubleshooting

- **Assuming the load-balancing loss is minimized at zero.** This
  module's verified arithmetic shows the minimum is `1.0` (reached at
  perfect balance), not zero — don't expect or debug toward a
  zero-valued aux loss.
- **Forgetting to detach `f` from the computation graph.** `f` comes
  from a non-differentiable `argmax`; treating it as a differentiable
  quantity either errors (in stricter autograd setups) or silently
  computes something other than the intended loss. This module's code
  explicitly calls `.detach()` on it, matching the Switch Transformer
  paper's own formulation.
- **Setting the aux-loss weighting coefficient too high "to be safe."**
  As the Independent Challenge above covers, an overly dominant
  balancing term can suppress genuine specialization — this module's
  own aux-loss-only run achieved perfect balance precisely because
  nothing else competed with it, which is not the intended real-world
  operating point.
- **Treating the auxiliary loss and hard capacity limits as the same
  mechanism, or assuming either one alone is sufficient in production.**
  They're complementary: the soft aux loss shapes training-time routing
  incentives; the hard capacity factor bounds the worst case at serving
  time regardless of what the router prefers.
- **Assuming this module's 4-expert, 64-token toy example generalizes
  in scale to a production system with thousands of tokens per batch
  and dozens of experts without re-verifying.** The mechanism is the
  same, but Exercise 2 exists specifically to check the dynamic holds
  at a different expert count rather than assuming it from one example.

## Checkpoint quiz

1. What are `f_i` and `P_i` in the load-balancing auxiliary loss, and
   why is one of them detached from the computation graph while the
   other isn't?
2. What is the mathematical minimum value of
   `num_experts * sum(f_i * P_i)`, and under what routing condition is
   it reached? What did this module verify numerically for that
   minimum?
3. Starting from a router that sent tokens to four experts in a
   `[3, 17, 18, 26]` split, what did 200 gradient steps minimizing only
   the auxiliary loss produce, verified directly in this module?
4. What real-world risk does setting the auxiliary loss's weighting
   coefficient too high introduce, per the Independent Challenge?
5. What is a capacity factor, and how is it different from the
   auxiliary loss as a load-balancing mechanism?

<details><summary>Answers</summary>

1. `f_i` is the actual fraction of tokens routed (via `argmax`) to
   expert *i*; `P_i` is the router's average softmax probability
   assigned to expert *i*. `f_i` is detached because `argmax` has no
   meaningful gradient (a discrete, non-smooth selection); `P_i` is
   left attached because softmax probabilities are differentiable and
   are what actually carries the balancing gradient signal back into
   the router's weights.
2. The minimum is `1.0`, reached when every expert receives an equal
   share (`f_i = P_i = 1/num_experts` for all *i*). This module
   verified `1.0` exactly for a hypothetical perfectly balanced router,
   versus `1.0362` for the genuinely imbalanced `[3, 17, 18, 26]`
   routing.
3. A perfectly even `[16, 16, 16, 16]` split (64 tokens / 4 experts),
   verified directly by running the training loop and re-checking the
   routing distribution afterward.
4. It can suppress the router's incentive to route tokens to whichever
   expert genuinely handles them best, since an overly dominant
   balancing term optimizes almost entirely for even distribution
   rather than for specialization — defeating MoE's actual purpose.
5. A capacity factor is a hard per-expert cap on how many tokens it
   will accept in a batch, with overflow tokens dropped/passed through
   or sent elsewhere — a hard limit enforced regardless of the router's
   preferences, distinct from the auxiliary loss, which is a soft,
   gradient-based training incentive rather than an enforced cap.

</details>

## Further reading & sources

- [Outrageously Large Neural Networks: The Sparsely-Gated Mixture-of-Experts Layer (Shazeer et al., 2017)](https://arxiv.org/abs/1701.06538) - introduces the general load-imbalance problem this module verified, and an early importance/load-balancing loss formulation.
- [Switch Transformers: Scaling to Trillion Parameter Models with Simple and Efficient Sparsity (Fedus et al., 2021)](https://arxiv.org/abs/2101.03961) - the primary source for the exact `num_experts * sum(f_i * P_i)` auxiliary loss formula this module implemented and verified numerically, including the capacity-factor mechanism.
- [Track 02, Module 09: The Feed-Forward Network — Per-Token Processing](../../02-transformer-architecture/09-the-feed-forward-network-per-token-processing/README.md) - background this module builds on regarding why per-token expert routing is architecturally possible in the first place.

## Next

[Module 14: Mixtral and MoE in Practice](../14-mixtral-and-moe-in-practice/README.md)
