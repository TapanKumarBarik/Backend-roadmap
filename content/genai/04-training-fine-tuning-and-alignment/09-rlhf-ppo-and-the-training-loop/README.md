# Module 09: RLHF: PPO and the Training Loop

## Why this matters

Module 08 built a real reward model and verified it can learn to score
preferred responses above rejected ones. That reward model alone
doesn't improve anything — it only *evaluates*. The second RLHF stage
takes that scalar reward and actually updates the policy (the language
model being aligned) to produce higher-reward responses, using
reinforcement learning. The specific algorithm nearly every production
RLHF pipeline uses for this is PPO (Proximal Policy Optimization). A
full PPO training loop — sample responses from the current policy
(rollout), score them with the reward model, estimate an advantage,
and take a clipped policy-gradient update, repeated over many
iterations with an actor, a critic, a reward model, and a frozen
reference model all interacting — is genuinely too complex, too
compute-hungry, and too slow to converge to run for real on a CPU in
this format, and this module says so plainly rather than faking a toy
"RL loop" that doesn't actually demonstrate reinforcement learning.
What *is* tractable, and what this module verifies concretely with
real numbers, is PPO's mathematical core: the **clipped surrogate
objective** that bounds how far a single update can push the policy,
and the **KL penalty** against a reference model that keeps the policy
from drifting arbitrarily far from where it started. These two pieces
are the actual mechanism that makes PPO safe to use for RLHF; this
module implements and verifies both directly in code, and is explicit
throughout that it verifies the *objective's mechanics*, not a full
training run.

## Concepts

### Where PPO fits: the full loop, honestly diagrammed

```
 ONE PPO ITERATION (not run for real in this module — too expensive for CPU/toy scale)
 ─────────────────────────────────────────────────────────────────────────
 1. ROLLOUT:   current policy generates responses to a batch of prompts
 2. REWARD:    module 08's reward model scores each (prompt, response)
 3. ADVANTAGE: estimate how much better each response was than expected
               (baseline/value function — the "critic")
 4. UPDATE:    adjust policy weights using the CLIPPED SURROGATE OBJECTIVE
               (verified below) plus a KL PENALTY against a frozen
               reference policy (verified below), repeat for many steps

 THIS MODULE'S SCOPE:            ┌───────────────────────────────┐
 ───────────────────────         │ steps 1-3: acknowledged, not   │
                                  │ run for real (needs real RL    │
                                  │ infrastructure + many iterations)│
                                  ├───────────────────────────────┤
                                  │ step 4's TWO core formulas:     │
                                  │ clipped objective + KL penalty  │
                                  │ -> VERIFIED with real numbers   │
                                  └───────────────────────────────┘
```

### The clipped surrogate objective

PPO's policy update is driven by the **probability ratio** between the
new (updated) policy and the old (pre-update) policy for the action
actually taken: `ratio = pi_new(a|s) / pi_old(a|s)`. Multiplied by the
**advantage** (how much better this action was than the baseline
expected), `ratio * advantage` is the plain (unclipped) policy-gradient
surrogate objective — but taken alone, nothing stops the ratio from
growing arbitrarily large (the update could push the policy
enormously far from where it started on a single, possibly noisy,
advantage estimate). PPO's fix: clip the ratio to a fixed range
`[1-epsilon, 1+epsilon]` (commonly epsilon = 0.2) and take the
**minimum** of the clipped and unclipped objective:

```
objective = min( ratio * advantage,  clip(ratio, 1-eps, 1+eps) * advantage )
```

### Verified: implementing the clipped objective and finding a divergent case

```python
import torch

def ppo_surrogate(ratio, advantage, epsilon=0.2, clip=True):
    unclipped = ratio * advantage
    if not clip:
        return unclipped
    clipped_ratio = torch.clamp(ratio, 1 - epsilon, 1 + epsilon)
    clipped = clipped_ratio * advantage
    return torch.min(unclipped, clipped)

cases = [
    ("good action, ratio grows a lot",    torch.tensor(1.8), torch.tensor(1.0)),
    ("good action, ratio grows a little", torch.tensor(1.05), torch.tensor(1.0)),
    ("bad action, ratio grows a lot",     torch.tensor(1.8), torch.tensor(-1.0)),
    ("bad action, ratio shrinks a lot",   torch.tensor(0.3), torch.tensor(-1.0)),
    ("good action, ratio shrinks a lot",  torch.tensor(0.3), torch.tensor(1.0)),
]

for name, ratio, adv in cases:
    unclipped = ppo_surrogate(ratio, adv, clip=False).item()
    clipped = ppo_surrogate(ratio, adv, clip=True).item()
    diverge = abs(unclipped - clipped) > 1e-6
    print(f"{name:38s} ratio={ratio.item():4.2f} adv={adv.item():4.1f}  "
          f"unclipped={unclipped:7.4f}  clipped={clipped:7.4f}  diverge={diverge}")
```

Verified output:

```
good action, ratio grows a lot        ratio=1.80 adv= 1.0  unclipped= 1.8000  clipped= 1.2000  diverge=True
good action, ratio grows a little     ratio=1.05 adv= 1.0  unclipped= 1.0500  clipped= 1.0500  diverge=False
bad action, ratio grows a lot         ratio=1.80 adv=-1.0  unclipped=-1.8000  clipped=-1.8000  diverge=False
bad action, ratio shrinks a lot       ratio=0.30 adv=-1.0  unclipped=-0.3000  clipped=-0.8000  diverge=True
good action, ratio shrinks a lot      ratio=0.30 adv= 1.0  unclipped= 0.3000  clipped= 0.3000  diverge=False
```

Two real cases diverge, and both reveal exactly what clipping is for:

- **"Good action, ratio grows a lot"** (advantage positive, ratio 1.8):
  the unclipped objective (1.8) keeps rewarding the update for pushing
  the ratio ever higher — clipping caps it at 1.2, removing the
  incentive to push a genuinely good action's probability up
  arbitrarily far in one step.
- **"Bad action, ratio shrinks a lot"** (advantage negative, ratio
  0.3): the unclipped objective (-0.3) would keep rewarding further
  shrinkage of an already-corrected action's probability — clipping
  holds it at -0.8, meaning once the policy has already moved the
  ratio below `1-epsilon`, there's no further gradient incentive to
  push it down even more. In both cases clipping produces a **flat**
  region: the update stops rewarding further movement once the ratio
  has moved past the trust region, in the direction that matters.

The three non-diverging cases are equally informative: a small ratio
change (1.05) stays inside the clip range entirely, so clipping does
nothing (correctly — no restraint is needed for small updates); and the
"bad action, ratio grows a lot" case (ratio 1.8, advantage -1.0) shows
clipping deliberately does *not* soften the penalty when a policy
update is moving the *wrong* direction on a bad action — `min` selects
the more negative unclipped value here, keeping full incentive to
correct it. **This asymmetry is the actual point of PPO's clip: it
removes the incentive to overshoot in a direction that's already
"good enough," but never removes the incentive to correct a genuinely
bad update.**

### The KL penalty against a reference policy

Clipping bounds a *single* update step, but many updates in the same
direction could still walk the policy far from its starting point over
time — degrading general capability or drifting away from
instruction-following (module 06). RLHF adds a second, complementary
safeguard: an explicit penalty proportional to the KL divergence
between the current policy and a frozen **reference policy** (usually
the SFT/instruction-tuned checkpoint before RLHF began):

```
penalized_reward = reward - beta * KL(policy || reference)
```

### Verified: KL penalty on a toy example

```python
import torch.nn.functional as F

logits_policy = torch.tensor([2.0, 0.5, 0.1, -1.0])
logits_ref_close = torch.tensor([1.8, 0.6, 0.0, -0.9])   # close to policy
logits_ref_far = torch.tensor([-1.0, 2.0, 1.5, 0.8])      # very different from policy

p_policy = F.softmax(logits_policy, dim=-1)
p_ref_close = F.softmax(logits_ref_close, dim=-1)
p_ref_far = F.softmax(logits_ref_far, dim=-1)

def kl_div(p, q):
    return (p * (p.log() - q.log())).sum()

kl_close = kl_div(p_policy, p_ref_close)
kl_far = kl_div(p_policy, p_ref_far)
print("KL(policy || ref_close):", kl_close.item())
print("KL(policy || ref_far)  :", kl_far.item())

beta = 0.1
reward = torch.tensor(1.0)
print("raw reward:", reward.item())
print("KL-penalized reward (close ref):", (reward - beta * kl_close).item())
print("KL-penalized reward (far ref)  :", (reward - beta * kl_far).item())
```

Verified output:

```
KL(policy || ref_close): 0.007203917950391769
KL(policy || ref_far)  : 1.98275887966156
raw reward: 1.0
KL-penalized reward (close ref): 0.9992796182632446
KL-penalized reward (far ref)  : 0.8017240762710571
```

Same raw reward (1.0) in both cases; the penalized reward differs by
nearly 0.2 depending purely on how far the current policy's output
distribution has drifted from the reference. A policy that stays close
to its reference (KL ≈ 0.007) is barely penalized; one that has
drifted substantially (KL ≈ 1.98) loses a real, computed chunk of its
reward. In a real PPO loop this term is added at every token/step, so
sustained drift compounds into a real, ongoing training pressure to
stay near the reference policy — directly limiting how far RLHF can
walk a model away from its starting instruction-tuned behavior.

### Honest scope statement

This module verified two real, load-bearing pieces of PPO's mechanism
with real numbers: the clipped surrogate objective's actual divergent
behavior, and the KL penalty's actual computed effect on a reward. It
did **not** run rollouts from a real policy, train a critic/value
function, or execute any actual gradient update on a language model's
weights through this objective — that requires real RL infrastructure
(a policy, a frozen reference copy, a reward model, a value model, and
many iterations of environment interaction) that is out of scope for a
CPU, toy-scale module. Module 10 covers a genuinely different, and
dramatically simpler, approach (DPO) that reproduces the *target
behavior* of this pipeline without needing this RL loop at all —
directly contrasted there against this module's reward-model-then-PPO
approach.

## Reference

```
 Term                    Meaning
 ──────────────────────  ──────────────────────────────────────────────
 Rollout                 Generating responses from the CURRENT policy
                         to a batch of prompts — step 1 of a PPO
                         iteration, not run for real in this module
 Advantage                An estimate of how much better an action was
                         than a baseline/expected value — not computed
                         for real here; used symbolically in the
                         verified clipped-objective examples
 Probability ratio        pi_new(a|s) / pi_old(a|s) — how much the
                         updated policy's probability for an action
                         has shifted relative to before the update
 Clipped surrogate        min(ratio*advantage, clip(ratio,1-eps,1+eps)
 objective                *advantage) — verified above to flatten
                         (stop rewarding further movement) once the
                         ratio passes the trust region in the direction
                         that already achieved enough change
 KL penalty                reward - beta*KL(policy || reference) —
                         verified above to subtract a real, larger
                         penalty as the policy drifts further from a
                         frozen reference model
 Reference policy          A frozen copy of the pre-RLHF (usually SFT/
                         instruction-tuned) model, used only to compute
                         the KL penalty — never updated during PPO
```

## Hands-on exercises

### 1. Find the clip boundary exactly

Using `ppo_surrogate`, sweep `ratio` from 0.5 to 2.0 in steps of 0.05
with a fixed `advantage = 1.0`. Print the ratio at which `diverge`
first becomes `True` and confirm it matches `1 + epsilon` (1.2 for the
default `epsilon=0.2`) — this is the exact boundary where clipping
starts to bind for a positive advantage.

### 2. Sweep beta and observe the KL penalty's sensitivity

Using the same `logits_policy` and `logits_ref_far` from the verified
example, recompute the KL-penalized reward for `beta` values of 0.01,
0.1, 0.5, and 1.0. Report how much of the raw reward each beta value
consumes for this fixed KL divergence, and discuss (in your own words)
what a team would be trading off by choosing a larger beta in a real
RLHF run.

### 3. Construct a case where clipping produces a WORSE outcome

Advantage estimates are themselves noisy in real RL. Construct a
`(ratio, advantage)` pair where the *true* advantage (if you could know
it) would justify a large ratio change, but the *clipped* objective
caps the update's effective reward anyway. Explain, using your own
printed numbers, why PPO accepts this conservatism as a worthwhile
tradeoff against the risk of a single bad advantage estimate causing a
destructively large policy update.

## Independent challenge

A teammate says: "PPO's clipping means the policy can never make a
large change even when a genuinely large change is warranted — doesn't
that make RLHF fundamentally too conservative to work?" Using this
module's verified clipped-objective behavior, evaluate the claim.

<details><summary>Discussion</summary>

The claim overstates what clipping restricts. This module's verified
output shows clipping bounds the *objective's incentive within a
single update step*, not the *total* change a policy can undergo
across many steps of training — PPO runs many iterations, and a
consistent advantage signal in the same direction across iterations
still accumulates into a large total policy change over time, just
gradually and safely rather than in one potentially destructive jump.
The concrete risk clipping guards against is a single noisy or
overestimated advantage causing an outsized, hard-to-reverse update in
one step — this module's "good action, ratio grows a lot" case (ratio
1.8, advantage 1.0) showed the unclipped objective (1.8) rewarding an
enormous single-step push, while the clipped objective (1.2) caps that
single step's incentive without preventing further, similarly-sized
steps in subsequent iterations if the advantage signal keeps pointing
the same direction. The "bad action, ratio grows a lot" case (no
divergence — clipping did NOT soften the penalty) is the other half of
the answer: clipping is specifically asymmetric in favor of correction,
never blunting the incentive to fix a genuinely bad update. So the
honest framing is: PPO trades a small amount of per-step aggressiveness
for training stability, not overall ceiling on how much the policy can
ultimately change.

</details>

## Common mistakes & troubleshooting

- **Believing this module ran a real PPO training loop.** It verified
  the clipped objective and KL penalty formulas with toy numeric
  examples — no rollout, reward model call, or actual policy gradient
  update on real model weights was executed. Say so plainly when
  explaining this module to someone else.
- **Assuming clipping bounds total policy change across training.** As
  the independent challenge covers, clipping bounds the incentive
  *within one update step*; consistent advantage signal across many
  iterations can still produce large cumulative change.
- **Missing the asymmetry in the clipped objective.** Clipping softens
  the incentive to *overshoot on an already-sufficient good update*
  and to *over-correct on an already-sufficient bad-action fix* — it
  does not soften the incentive to correct a bad update that's moving
  the wrong direction. This module's five verified cases show both
  the diverging and non-diverging sides.
- **Forgetting the KL penalty is against a frozen reference, not a
  moving target.** The reference policy in the penalty term never
  updates during PPO — if it did, the penalty would provide no
  anchor at all, since the policy could "drift" alongside its own
  reference with zero computed KL.
- **Treating a small toy KL divergence (0.007) as proof the penalty
  doesn't matter.** This module's own numbers show the same beta
  produces a nearly 30x larger penalty (1.98 vs. 0.007) once the policy
  has actually drifted — the penalty's magnitude is designed to scale
  with real drift, not to be uniformly small.

## Checkpoint quiz

1. Why does this module not run a real end-to-end PPO training loop,
   and what two formulas does it verify instead?
2. Write the clipped surrogate objective formula and explain what role
   `epsilon` plays in it.
3. In this module's verified case "good action, ratio grows a lot"
   (ratio 1.8, advantage 1.0), what were the real unclipped and clipped
   objective values, and why do they diverge?
4. Why does the case "bad action, ratio grows a lot" (ratio 1.8,
   advantage -1.0) NOT diverge between unclipped and clipped, and what
   does that reveal about clipping's asymmetry?
5. What did this module's verified KL-penalty example show about how
   the same raw reward (1.0) is affected by a policy that has drifted
   far from its reference versus one that has stayed close?

<details><summary>Answers</summary>

1. A full PPO loop requires real rollouts from a live policy, a value
   function/critic, a reward model, and many iterations of RL
   training — too complex and too slow to converge meaningfully on
   CPU at toy scale. Instead, this module verifies the clipped
   surrogate objective and the KL penalty against a reference policy,
   the two formulas that make PPO's updates safe.
2. `objective = min(ratio * advantage, clip(ratio, 1-epsilon,
   1+epsilon) * advantage)`. `epsilon` sets the width of the trust
   region around a ratio of 1 (no change) — commonly 0.2, meaning the
   ratio is clipped to the range [0.8, 1.2] before being multiplied by
   the advantage in the clipped term.
3. Unclipped = 1.8, clipped = 1.2. They diverge because the ratio
   (1.8) exceeds `1+epsilon` (1.2), so the clipped term caps the
   ratio at 1.2 before multiplying by the positive advantage, removing
   the incentive to push a good action's probability up even further
   in this single step.
4. Here `clip(1.8, 0.8, 1.2) = 1.2`, so the clipped term is
   `1.2 * -1.0 = -1.2`, while the unclipped term is `1.8 * -1.0 =
   -1.8`. `min(-1.8, -1.2) = -1.8`, so the objective selects the
   unclipped, more negative value — the clip has no effect here. This
   reveals clipping's asymmetry: it never softens the incentive to
   correct a genuinely bad update (increasing probability on a
   negative-advantage action stays fully penalized), it only caps the
   incentive to over-push an already-sufficient good update.
5. With a close reference (KL ≈ 0.007), the penalized reward (0.9993)
   was nearly identical to the raw reward (1.0); with a far reference
   (KL ≈ 1.983), the penalized reward (0.8017) lost a real, much
   larger chunk of the same raw reward — showing the KL penalty scales
   directly with how far the policy has actually drifted from its
   frozen starting point.

</details>

## Further reading & sources

- [Proximal Policy Optimization Algorithms (Schulman et al., 2017)](https://arxiv.org/abs/1707.06347) - the original PPO paper introducing the clipped surrogate objective this module implements and verifies directly.
- [Training language models to follow instructions with human feedback (Ouyang et al., 2022)](https://arxiv.org/abs/2203.02155) - InstructGPT's RLHF stage, which applies PPO with a KL penalty against the SFT reference model, exactly the two mechanisms this module verifies.
- [Fine-Tuning Language Models from Human Preferences (Ziegler et al., 2019)](https://arxiv.org/abs/1909.08593) - an early, detailed application of PPO plus a KL penalty specifically to language model fine-tuning, the direct ancestor of this module's setup.
- [Hugging Face TRL: PPOTrainer documentation](https://huggingface.co/docs/trl/main/en/ppo_trainer) - the real, production implementation of the full PPO loop this module explicitly does not run, for anyone wanting to see the rollout/reward/advantage machinery this module scoped out.

## Next

[Module 10: DPO and Simpler Alternatives](../10-dpo-and-simpler-alternatives/README.md)
