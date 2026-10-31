# Module 10: DPO and Simpler Alternatives

## Why this matters

Modules 08-09 built the classic RLHF pipeline in full, piece by piece:
train a separate reward model on human preference pairs (module 08),
then use it inside a genuinely complex reinforcement learning loop —
rollouts, advantage estimation, a clipped surrogate objective, a KL
penalty against a reference policy (module 09) — to update the policy
model. That pipeline works (it's what produced InstructGPT and many
production aligned models), but it is a lot of machinery: a second
full model (the reward model), a value function/critic, careful RL
hyperparameter tuning, and real training instability risks. **DPO
(Direct Preference Optimization)** asks a sharp question: can the same
target behavior — a policy that prefers chosen responses over rejected
ones, without drifting arbitrarily far from a reference model — be
produced with **no reward model and no RL loop at all**, by training
directly on preference pairs with a single closed-form loss? This
module implements that loss exactly as published (Rafailov et al.,
2023), verifies numerically that it decreases exactly when the policy
grows to prefer chosen over rejected relative to the reference model,
and lays the DPO pipeline directly alongside modules 08-09's
reward-model-then-PPO pipeline so the algorithmic difference — same
target, radically different mechanism — is concrete rather than
asserted.

## Concepts

### The two pipelines, side by side

```
 RLHF (modules 08-09): reward model + reinforcement learning
 ─────────────────────────────────────────────────────────────
 preference pairs -> [train REWARD MODEL] -> scalar reward function
                                                      │
                     policy rollouts -> reward scores │
                                              ▼        ▼
                     [PPO: clipped objective + KL penalty] -> updated policy
                     (a full RL loop: rollout, advantage, clipped update,
                      repeated over many iterations — module 09's subject)

 DPO (this module): one closed-form loss, no reward model, no RL loop
 ─────────────────────────────────────────────────────────────
 preference pairs -> [ DPO loss, computed directly from        ] -> updated
                     [ policy log-probs vs. reference log-probs ]    policy
                     (a single supervised-style loss — no rollouts,
                      no advantage estimation, no separate reward model)
```

DPO's central mathematical result (Rafailov et al. 2023) is that the
RLHF objective (maximize reward, subject to a KL penalty against a
reference policy — exactly module 09's objective) has a **closed-form
optimal solution** that can be expressed directly in terms of the
policy's own log-probabilities relative to the reference model's — no
explicit reward model needs to ever be trained or evaluated
separately. The reward is *implicit* in the policy itself.

### The DPO loss, exactly as published

```
loss = -log( sigmoid( beta * ( (logpi_chosen - logref_chosen)
                              - (logpi_rejected - logref_rejected) ) ) )
```

Reading it in pieces: `logpi_chosen - logref_chosen` is how much more
(or less) likely the *current policy* makes the chosen response,
relative to the frozen *reference* model — call this the policy's
"implicit reward" for the chosen response. The same quantity is
computed for the rejected response. The loss is minimized when the
policy's relative preference for chosen-over-rejected (compared to
what the reference model already had) grows — structurally the same
Bradley-Terry pairwise form module 08's reward model loss used
(`-log(sigmoid(r_chosen - r_rejected))`), except here the "reward
difference" is computed directly from log-probability ratios, with no
separate reward-model network anywhere in the loss.

### Verified: real log-probabilities, three scenarios

Using small, synthetic (but realistic-shaped) log-probability values —
the kind a real model would actually produce summed over a response's
tokens — for a fixed reference model and three different hypothetical
policy states:

```python
import torch
import torch.nn.functional as F

def dpo_loss(logp_pi_chosen, logp_pi_rejected, logp_ref_chosen, logp_ref_rejected, beta=0.1):
    pi_logratio = logp_pi_chosen - logp_pi_rejected
    ref_logratio = logp_ref_chosen - logp_ref_rejected
    logits = beta * (pi_logratio - ref_logratio)
    return -F.logsigmoid(logits), logits

# reference model's FIXED log-probs (frozen throughout training)
logp_ref_chosen = torch.tensor(-12.0)
logp_ref_rejected = torch.tensor(-11.5)   # reference slightly prefers "rejected" — realistic pre-alignment

# scenario A: policy identical to reference (start of training)
logp_pi_chosen_A, logp_pi_rejected_A = torch.tensor(-12.0), torch.tensor(-11.5)
# scenario B: policy has started shifting probability mass toward chosen
logp_pi_chosen_B, logp_pi_rejected_B = torch.tensor(-10.0), torch.tensor(-12.0)
# scenario C: policy has shifted even further toward chosen over rejected
logp_pi_chosen_C, logp_pi_rejected_C = torch.tensor(-8.0), torch.tensor(-14.0)

for name, lpc, lpr in [("A (== reference)", logp_pi_chosen_A, logp_pi_rejected_A),
                        ("B (moderate shift toward chosen)", logp_pi_chosen_B, logp_pi_rejected_B),
                        ("C (strong shift toward chosen)", logp_pi_chosen_C, logp_pi_rejected_C)]:
    loss, logits = dpo_loss(lpc, lpr, logp_ref_chosen, logp_ref_rejected)
    print(f"{name:38s} implicit-reward-margin={logits.item():7.3f}  DPO loss={loss.item():.4f}")
```

Verified output:

```
A (== reference)                       implicit-reward-margin=  0.000  DPO loss=0.6931
B (moderate shift toward chosen)       implicit-reward-margin=  0.250  DPO loss=0.5759
C (strong shift toward chosen)         implicit-reward-margin=  0.650  DPO loss=0.4201
```

Three real, computed numbers, monotonically decreasing exactly as the
policy's relative preference for chosen-over-rejected grows. Scenario
A's loss (0.6931) is exactly `log(2)` — expected, since a policy
identical to the reference produces a zero implicit-reward-margin, and
`-log(sigmoid(0)) = -log(0.5) = log(2)`. As the policy diverges from
the reference *specifically in the direction of preferring chosen*
(scenarios B, then C), the loss falls — 0.5759, then 0.4201 — with no
reward model ever evaluated and no RL update ever taken. This is
DPO's entire selling point verified numerically: **the same
"chosen-over-rejected, relative-to-reference" behavior RLHF's
reward-model-then-PPO pipeline is designed to produce, computed here
from a single closed-form loss on log-probabilities alone.**

### Where the reference model's log-probs come from, and why they're frozen

In a real DPO implementation, `logp_ref_chosen`/`logp_ref_rejected`
are computed once by running the frozen SFT/instruction-tuned
checkpoint (the same role module 09's reference model played inside
the KL penalty) over the chosen and rejected sequences and summing
each token's log-probability. They never change during training — only
the policy's own log-probs are updated by the optimizer. This mirrors
module 09's reference-model role exactly, but here it enters directly
into the training loss's math rather than as a separate penalty term
computed alongside a separate RL update.

### Direct contrast with modules 08-09

```
                    RLHF (08-09)                    DPO (this module)
 ─────────────────  ──────────────────────────────  ──────────────────────────
 Reward model        Trained separately (module 08)  Never trained — implicit
                                                       in the policy itself
 Training loop        Full RL loop: rollout, reward   One supervised-style loss
                      scoring, advantage, clipped      pass over preference
                      update (module 09)               pairs — no rollouts
 Reference model       Used inside the KL penalty       Used directly inside
                       term, alongside PPO's clip        the loss's log-ratio
 Stability concerns     RL training instability,        Simpler/more stable in
                       reward hacking, hyperparameter    practice, but sensitive
                       sensitivity (rollout length,      to beta and to
                       KL coefficient, clip epsilon)     preference-data quality
 Verified in this       PPO clip's divergent behavior     DPO loss's monotonic
 track                  and KL penalty computation        decrease as chosen-
                       (module 09) on real numbers        over-rejected margin
                                                          grows (real numbers)
```

Same target behavior — a policy that prefers chosen responses over
rejected ones without drifting arbitrarily far from a reference — is
approached by two structurally different mechanisms: RLHF's explicit
two-stage reward-model-then-RL pipeline, and DPO's single closed-form
loss with no reward model and no RL loop whatsoever.

## Reference

```
 Term                    Meaning
 ──────────────────────  ──────────────────────────────────────────────
 DPO (Direct Preference   A method that optimizes a policy directly on
 Optimization)            preference pairs via one closed-form loss —
                         no separate reward model, no RL loop
 Implicit reward           logpi - logref for a response — DPO's stand-in
                         for an explicit reward-model score, computed
                         directly from log-probability ratios
 beta                      DPO's temperature-like hyperparameter scaling
                         the implicit reward margin before the sigmoid —
                         plays a role loosely analogous to the KL
                         coefficient in module 09's penalty
 Reference model            The frozen pre-alignment checkpoint whose
                         log-probs anchor the implicit reward — same
                         role as module 09's reference policy, entering
                         directly into DPO's loss instead of a separate
                         penalty term
 Closed-form loss          A loss computable directly from data and
                         model outputs in one pass, with no simulation/
                         rollout/RL machinery required — DPO's defining
                         practical advantage over modules 08-09's
                         pipeline
```

## Hands-on exercises

### 1. Reproduce the monotonic decrease with your own numbers

Pick different (but still plausible, negative) log-probability values
for a reference model and three policy scenarios of your own
construction (identical-to-reference, moderate shift, strong shift
toward chosen). Verify the DPO loss still decreases monotonically
across your three scenarios and report the actual numbers.

### 2. Sweep beta and observe its effect on the loss's sensitivity

Using scenario B's numbers from the verified example, recompute the
DPO loss for `beta` values of 0.01, 0.1, 0.5, and 1.0. Report how
sharply the loss responds to the same underlying log-probability shift
as beta grows, and connect this to beta's role as a temperature-like
scaling factor on the implicit reward margin.

### 3. Construct a case where the policy prefers the WRONG response

Set `logp_pi_chosen` lower than `logp_pi_rejected` by a wide margin
(the policy has learned to prefer the rejected response) while keeping
the reference model's log-probs fixed at the verified example's
values. Compute the DPO loss and confirm it's larger than scenario A's
0.6931 baseline — verifying the loss correctly penalizes a policy that
has moved in the *wrong* preference direction, not just one that
hasn't moved at all.

## Independent challenge

A team has an existing production RLHF pipeline (reward model + PPO,
matching modules 08-09) and is deciding whether to migrate to DPO for
their next alignment run. List the concrete tradeoffs they should
weigh, grounded in this module's verified findings and the contrast
table above.

<details><summary>Discussion</summary>

In favor of migrating: DPO removes an entire model (the reward model)
and an entire class of infrastructure (rollout generation, advantage
estimation, PPO's clipped update, careful RL hyperparameter tuning) —
this module's verified DPO loss computed a real, meaningful,
monotonically-behaving training signal from nothing but preference
pairs and two models' log-probabilities, with no simulation step at
all. That's a genuine simplicity and stability win, and is exactly why
DPO saw rapid production adoption after publication. Against migrating,
or at least worth flagging: DPO is not free of hyperparameters or
failure modes of its own — `beta` plays a role roughly analogous to
module 09's KL coefficient, and the same preference-data-quality
dependency module 08 already established (a reward model trained on
mislabeled pairs learns the wrong ordering) applies just as directly
to DPO, since DPO trains on the identical preference pairs, just
without an intermediate reward-model step. A team with an already-
working, well-tuned RLHF pipeline and deep RL infrastructure investment
may reasonably decide the marginal simplicity gain doesn't justify a
migration risk; a team starting fresh, or hitting real RL training
instability, has a much stronger case for DPO. The one thing this
module's verification does NOT settle is which approach produces a
*better-aligned* model in practice on real, large-scale preference
data — that's an empirical question the published literature (cited
below) addresses with real comparative results, not something this
toy-scale module's three-scenario loss check can answer on its own.

</details>

## Common mistakes & troubleshooting

- **Believing DPO eliminates the need for preference data.** It
  doesn't — DPO trains on the exact same (prompt, chosen, rejected)
  triples module 08's reward model did; what it eliminates is the
  *intermediate reward-model training step and the RL loop*, not the
  need for human preference labels.
- **Forgetting the reference model's log-probs must stay frozen.** If
  `logp_ref_chosen`/`logp_ref_rejected` were computed from the same,
  currently-updating policy instead of a frozen snapshot, the implicit
  reward margin (`pi_logratio - ref_logratio`) would collapse toward
  zero regardless of real progress — the frozen reference is what
  gives the margin meaning, exactly as module 09's KL penalty needed a
  frozen reference for the same reason.
- **Treating beta as a free lunch with no downside.** As Exercise 2
  shows, beta scales how sharply the loss responds to a given
  log-probability shift — too small and the training signal is weak;
  too large and (per the published paper) training can become
  unstable, echoing module 09's own KL-coefficient tuning concerns.
- **Assuming a lower DPO loss always means a better-aligned model.**
  This module's verified numbers show the loss decreasing as a
  policy's chosen-over-rejected margin grows, which is the training
  signal working as intended — but as with module 08's reward model,
  the ceiling on real alignment quality is bounded by the preference
  data's quality and coverage, not by the loss mechanics alone.
- **Confusing DPO's "implicit reward" with a real deployable reward
  model.** The `logpi - logref` quantity is useful for computing the
  DPO loss during training, but it is not packaged as a standalone
  scoring model the way module 08's reward model is — DPO's whole
  point is that no such separate artifact needs to exist.

## Checkpoint quiz

1. What two things does DPO eliminate compared to modules 08-09's
   RLHF pipeline, and what does it still require exactly as much as
   RLHF does?
2. Write the DPO loss formula and identify which two quantities play
   a role analogous to module 08's `r_chosen` and `r_rejected`.
3. In this module's verified three-scenario example, what were the
   real computed DPO loss values, and why does scenario A's loss equal
   `log(2)` exactly?
4. What role does the frozen reference model's log-probabilities play
   inside the DPO loss, and what would break if they were allowed to
   update alongside the policy?
5. Name one genuine advantage and one genuine remaining risk of DPO
   relative to the reward-model-plus-PPO pipeline, grounded in this
   module's and module 09's verified findings.

<details><summary>Answers</summary>

1. It eliminates the separate reward-model training stage (module 08)
   and the full RL loop — rollouts, advantage estimation, PPO's
   clipped update (module 09). It still requires exactly the same
   human preference data (chosen/rejected pairs) that RLHF's reward
   model was trained on.
2. `loss = -log(sigmoid(beta * ((logpi_chosen - logref_chosen) -
   (logpi_rejected - logref_rejected))))`. The quantities
   `logpi_chosen - logref_chosen` and `logpi_rejected - logref_rejected`
   ("implicit rewards" for chosen and rejected) play the role module
   08's `r_chosen` and `r_rejected` played, but are computed directly
   from log-probability ratios rather than from a trained reward-model
   network.
3. The values were 0.6931 (scenario A), 0.5759 (scenario B), and
   0.4201 (scenario C) — monotonically decreasing as the policy's
   chosen-over-rejected preference grew relative to the reference.
   Scenario A's loss equals `log(2)` because a policy identical to the
   reference produces a zero implicit-reward-margin, and
   `-log(sigmoid(0)) = -log(0.5) = log(2) ≈ 0.6931`.
4. The frozen reference log-probs anchor the "implicit reward" as a
   measure of how much the *current* policy prefers a response
   *relative to where training started* — without a frozen anchor,
   `pi_logratio - ref_logratio` would trivially collapse toward zero
   as the reference "chased" the policy's own changes, destroying the
   training signal entirely (the same reason module 09's KL penalty
   needs a frozen reference).
5. Genuine advantage: no reward model or RL loop is needed — this
   module verified a real, meaningful, monotonically decreasing loss
   computed from log-probabilities alone, a simpler and more stable
   pipeline than modules 08-09's. Genuine remaining risk: DPO still
   depends entirely on preference-data quality (the same dependency
   module 08 established) and introduces its own hyperparameter
   (`beta`) with its own tuning sensitivity, echoing module 09's KL-
   coefficient concerns in a different form.

</details>

## Further reading & sources

- [Direct Preference Optimization: Your Language Model is Secretly a Reward Model (Rafailov et al., 2023)](https://arxiv.org/abs/2305.18290) - the paper that derives and introduces the exact DPO loss this module implements and verifies.
- [Training language models to follow instructions with human feedback (Ouyang et al., 2022)](https://arxiv.org/abs/2203.02155) - the reward-model-plus-PPO pipeline this module contrasts DPO against, covered in full in modules 08-09.
- [A General Theoretical Paradigm to Understand Learning from Human Preferences (Azar et al., 2023)](https://arxiv.org/abs/2310.12036) - situates DPO within a broader family of preference-optimization objectives, useful context for "simpler alternatives" beyond DPO itself.
- [Hugging Face TRL: DPOTrainer documentation](https://huggingface.co/docs/trl/main/en/dpo_trainer) - the real, production implementation of this exact loss at scale, for comparison against this module's from-scratch verification.

## Next

[Module 11: Constitutional AI and RLAIF](../11-constitutional-ai-and-rlaif/README.md)
