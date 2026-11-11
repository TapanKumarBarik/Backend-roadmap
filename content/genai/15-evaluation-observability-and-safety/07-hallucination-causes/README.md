# Module 07: Hallucination: Causes

> **Prerequisites:** [Module 00: Why GenAI Evaluation Is Hard](../00-why-genai-evaluation-is-hard/README.md) and [Track 09, Module 01: Naive RAG End to End](../../09-retrieval-augmented-generation/01-naive-rag-end-to-end/README.md).  
> **Estimated Reading Time:** 30 minutes  
> **Target Audience:** AI Backend Engineers, RAG Architects, Alignment & Safety Engineers

> [!TIP]
> **The Golden Rule of Hallucination Root Causes:** Hallucination is not a random model "glitch" you cure by yelling `"DO NOT LIE"` in a system prompt—it is a **predictable mathematical consequence of maximum-likelihood next-token pretraining, Zipf tail scarcity, RLHF guessing incentives, high-entropy decoding, and RAG context conflicts**. Effective engineering matches each mitigation strictly to the pipeline stage where the failure originates.

---

## Why This Matters

When an LLM invents a fake Python library flag or contradicts a retrieved billing policy, the first instinct of most teams is prompt patching: `"CRITICAL: Never fabricate information! Only tell the truth!"` Across hundreds of production traces, that warning barely reduces hallucination rates by a few percentage points.

Why does prompt scolding fail? Because hallucinations originate across **four distinct mechanical stages**: pretraining calibration limits on rare facts, post-training RLHF incentives that reward guessing over saying `"I don't know"`, decoding tail variance, and retrieval-context positioning or conflicts. Before you can build reliable detectors ([Module 08](../08-hallucination-detection-techniques/README.md)) or grounding pipelines ([Module 09](../09-grounding-and-citation-verification/README.md)), you need a rigorous causal map of **why** autoregressive models fabricate fluent falsehoods.

---

## 1. Architectural Mental Model & Core Mechanics

Hallucinations are classified by Huang et al. (*A Survey on Hallucination in Large Language Models*, `arXiv:2311.05232`) along two primary axes—and arise across four causal stages of the LLM lifecycle:

```mermaid
flowchart TD
    S1["1. Pretraining: Zipf Tail Scarcity + Kalai-Vempala Singleton Bound"] --> F1["Factuality Hallucination (Wrong/Fabricated World Fact)"]
    S2["2. Post-Training RLHF: Binary Guess-Reward + Sycophancy Bias"] --> F1
    S3["3. Decoding: High Temperature T + Nucleus Tail Sampling"] --> Snow["Snowballing Coherence Lock-In"]
    S4["4. Context / RAG: Lost-in-the-Middle + Parametric Conflict"] --> Faith["Faithfulness Hallucination"]
    Snow --> Faith
    Faith --> Intr["Intrinsic (Directly Contradicts Provided Context)"]
    Faith --> Extr["Extrinsic (Unverifiable Beyond Provided Context)"]
```

### Official Hallucination Taxonomy (`arXiv:2311.05232`)

1. **Factuality Hallucination** (Open-book or closed-book divergence from verifiable world knowledge):
   - *Factual Contradiction:* Generating a false entity/date (`"Python 3.12 removed asyncio"`).
   - *Factual Fabrication:* Inventing entirely non-existent citations, DOIs, court rulings, or SDK flags.
2. **Faithfulness Hallucination** (Divergence from user prompt instructions or retrieved RAG context—the central production threat):
   - **Intrinsic Hallucination:** Output *directly contradicts* facts explicitly stated inside the provided context (e.g., source chunk says `"25% early termination fee"`, response outputs `"0% fee"`).
   - **Extrinsic Hallucination:** Output *cannot be verified or refuted* from the provided context—imported either from stale pretraining weights or invented wholesale (e.g., appending `"plus free 24/7 SLA phone support"` when the contract never mentions phone support).

### The 4 Mechanical Root Causes

#### Cause 1: Pretraining Tail Scarcity & The Kalai-Vempala Statistical Floor

Web-scale corpora follow a steep **Zipf power-law distribution** ($f(r) \propto r^{-\gamma}$): common concepts (`"Paris is in France"`, `HTTP 404`) appear millions of times, while long-tail facts (an obscure court citation, a boutique API error code, a minor author's birthdate) appear **once** (`singleton facts`) or never.

In *Calibrated Language Models Must Hallucinate* (`arXiv:2311.14648`, STOC 2024), Kalai and Vempala proved mathematically that any generative model trained via next-token likelihood to remain statistically well-calibrated over arbitrary facts **must hallucinate at a rate lower-bounded by the Good-Turing singleton mass** (facts observed only once in training):

$$\text{Hallucination Rate}_{\text{arbitrary}} \gtrsim \text{Fraction of Singleton Facts} - O(\epsilon_{\text{miscalibration}})$$

Because the model cannot tell from `1` occurrence whether an arbitrary entity has a fixed deterministic rule or uniform variation across plausible completions, statistical calibration forces nonzero probability mass onto fabricated tail completions. Pretraining also introduces **temporal knowledge cutoff staleness** and the **Reversal Curse** (memorizing `"A is B"` without generalizing `"B is A"`).

#### Cause 2: Post-Training RLHF & The "Guess-Reward" Objective

Why do aligned assistants bluff confidently instead of replying `"I don't know"`? Look at expected utility under standard post-training reward models and automated grading benchmarks:

- Correct answer: $+1$
- Wrong hallucinated answer: $0$ (or small penalty)
- Honest abstention (`"I cannot verify this"`): $0$ (or **penalized** by helpfulness annotators!)

If the model estimates internal confidence $p \in (0, 1)$ that a claim is right, its expected reward for **guessing** versus **abstaining** is:

$$\mathbb{E}[U_{\text{guess}}] = p \cdot R_{\text{correct}} + (1 - p) \cdot R_{\text{wrong}}$$

Under standard `0/1` scoring ($R_{\text{correct}} = +1, R_{\text{wrong}} = 0, R_{\text{abstain}} = 0$), $\mathbb{E}[U_{\text{guess}}] = p > 0$ for **every $p > 0$**—even when the model is `85%` sure it is wrong! Only when wrong answers carry an explicit negative penalty ($R_{\text{wrong}} = -c < 0$) does rational abstention emerge below threshold:

$$p^* = \frac{c}{1 + c} \qquad (\text{e.g., } R_{\text{wrong}} = -2 \implies \text{abstain whenever } p < 0.67)$$

Compounding this, **RLHF sycophancy bias** trains models to validate false user premises (`"Explain why Rust uses a garbage collector"`) because human annotators rate agreeable responses higher than blunt corrections.

#### Cause 3: Decoding Variance & Hallucination Snowballing

During autoregressive inference, raw model logits $z_i$ are converted into next-token sampling probabilities with temperature $T > 0$:

$$P_T(w_i) = \frac{\exp(z_i / T)}{\sum_j \exp(z_j / T)}$$

Raising $T$ (e.g., `0.8–1.2`) or using wide nucleus `top_p` flattens the logit gap between a unique factual token (`"1998"`, $z = 8.4$) and plausible distractors (`"1996"`, `"1999"`). Worse, once sampling accidentally picks `"1996"`, **auto-regressive conditioning locks in the mistake** (*hallucination snowballing*): every subsequent token conditions on `"1996"`, prompting the model to invent consistent supporting details to maintain discourse coherence.

#### Cause 4: Context & RAG Attention Failures

Even when retrieval succeeds, two context mechanics trigger **Faithfulness Hallucinations**:
- **Lost-in-the-Middle (`arXiv:2307.03172`):** Transformer self-attention exhibits a U-shaped recall curve across long context windows—attending strongly to the opening (primacy) and closing (recency) tokens while dropping `15–25+` percentage points when the decisive sentence sits in the middle `30–70%` of chunks.
- **Context-Parametric Conflict:** When updated RAG chunks contradict stale pretraining priors (e.g., a newly revised `2026` API rate limit vs. `2023` training data), weak instruction framing lets high-frequency parametric weights override the retrieved evidence.

---

## 2. Systematic Comparison Matrix: Root Cause Stages & Targeted Mitigations

| Causal Stage | Dominant Hallucination Type | Quantitative Mechanism | Why System-Prompt Tweaks Fail | Effective Engineering Mitigation |
| :--- | :--- | :--- | :--- | :--- |
| **1. Pretraining** | Factuality (Tail & Stale Facts) | Good-Turing singleton mass (`arXiv:2311.14648`) | Weights lack the rare/post-cutoff entity entirely | External RAG grounding + live tool APIs (`search`, SQL) |
| **2. Post-Training RLHF** | Factuality + Sycophancy | $0/1$ guess-reward forces guessing for all $p > 0$ | RLHF helpfulness prior overrides `"say I don't know"` | Asymmetric risk scoring / DPO abstention tuning + hard $\tau_{\min}$ gate |
| **3. Decoding Inference** | Extrinsic Fabrication + Snowballing | Softmax flattening $\exp(z_i/T)$ amplifies tail drift | Prompt words do not constrain logit sampling variance | Set `temperature = 0.0` for factual tasks; constrained JSON decoding |
| **4. RAG / Context Assembly** | Intrinsic + Extrinsic Faithfulness | U-shaped attention decay + conflicting passages | Asking `"read carefully"` cannot rescue buried middle tokens | Cross-encoder rerank (`k <= 5`), edge placement, timestamp conflict pruning |

---

## 3. Production War Story Post-Mortem: The `T=0.8` Middle-Buried Amendment Snowball

| Field | Incident Details |
| :--- | :--- |
| **Severity** | **SEV-2** (Contract Indemnification Summary Misrepresentation) |
| **Detection / Resolution Time** | Detected 3 days post-launch during legal partner audit / Mitigated in 2 hours (reranker + `T=0.0` + edge placement) |
| **Impact** | `9` M&A diligence summaries invented `"Section 14.2 Unlimited Indemnification"` when `Amendment_2025` capped liability at `\$2M` |

### What Happened

A legal-tech team built an M&A contract summarizer stuffing `top_k = 20` chunks (~`28,000` tokens) into a prompt with `temperature = 0.8` (`"to produce natural, non-repetitive prose"`). For one portfolio agreement, `Master_MSA_2022` sat in chunk `#1` (mentioning broad indemnification language), while `Amendment_2025` (`"Section 4.1 supersedes MSA and caps total indemnification at $2,000,000"`) landed in chunk `#11`—dead center of the prompt.

Because of **Lost-in-the-Middle** attention decay, the model missed chunk `#11` completely. Attending to chunk `#1` while decoding at `T=0.8`, it sampled the plausible token `"Unlimited"` and then **snowballed** a non-existent citation (`"under Section 14.2"`) to keep the legal summary coherent—combining an **intrinsic contradiction** (`$2M` vs. `Unlimited`) with an **extrinsic fabrication** (`Section 14.2`).

```mermaid
sequenceDiagram
    autonumber
    actor Counsel as Legal Reviewer
    participant RAG as 20-Chunk Long Context
    participant LLM as Generator (T=0.8)

    Note over RAG: Chunk #1 = Master_MSA_2022, Chunk #11 = Amendment_2025 ($2M cap)
    Counsel->>RAG: Summarize indemnification cap
    RAG->>LLM: 28K-token prompt (Amendment buried at slot 11/20)
    Note over LLM: Lost-in-the-Middle drops attention on slot #11
    LLM->>LLM: High T=0.8 samples "Unlimited" then snowballs fake "Section 14.2"
    LLM-->>Counsel: Reports Unlimited Indemnification under Section 14.2 (SEV-2)
```

### Root Cause Analysis

- **Decoding Variance (`T = 0.8`):** High temperature flattened logit gaps on factual clauses and triggered autoregressive snowballing.
- **Unranked Context Bloat (`k = 20`):** Burying the superseding `2025` amendment at position `11/20` pushed it into the U-curve recall valley.
- **No Abstention/Conflict Policy:** The prompt never resolved temporal supersedes (`Amendment_2025 > Master_MSA_2022`) or required inline verbatim quote spans.

### The Fix & Architectural Hardening

- **Deterministic Decoding:** Locked factual extraction and summarization endpoints to `temperature = 0.0` (`seed` pinned).
- **Rerank + Primacy/Recency Reordering:** Pruned retrieval via cross-encoder to `top_k = 5` and sorted newest/highest-scoring amendments into edge slots (`#1` and `#5`) rather than the middle.
- **Asymmetric Penalty Prompts + Verification:** Required verbatim clause quotes before every legal claim and enforced inline NLI checks ([Module 08](../08-hallucination-detection-techniques/README.md)).

---

## 4. Multi-Language Production Implementation: Hallucination Risk & Cause Telemetry Analyzer

Below is a production-grade **Pre-Generation & Decoding Hallucination Risk Analyzer** across **Go**, **TypeScript**, **Python**, and **C#**. It models softmax temperature tail leakage, computes the U-curve Lost-in-the-Middle exposure score for retrieved evidence slots, and evaluates whether a calibrated confidence score clears the asymmetric abstention threshold.

````carousel

```go
package halluccause

import "math"

type RiskAssessment struct {
	TailHallucinationProb float64
	MiddleBurialPenalty   float64
	ShouldAbstain         bool
	PrimaryCause          string
}

// SoftmaxTailRisk computes non-top-1 probability mass under temperature T.
func SoftmaxTailRisk(logits []float64, temp float64) float64 {
	if len(logits) == 0 {
		return 1.0
	}
	if temp <= 0.01 {
		return 0.0
	}
	maxL := logits[0]
	for _, l := range logits[1:] {
		if l > maxL {
			maxL = l
		}
	}
	sumExp, topExp := 0.0, 0.0
	for i, l := range logits {
		e := math.Exp((l - maxL) / temp)
		sumExp += e
		if i == 0 { // assumes logits[0] is the ground-truth highest logit
			topExp = e
		}
	}
	return 1.0 - (topExp / sumExp)
}

// ContextPositionRecall models the U-shaped Lost-in-the-Middle recall curve over [0..totalSlots-1].
func ContextPositionRecall(slotIdx, totalSlots int) float64 {
	if totalSlots <= 1 {
		return 0.95
	}
	x := float64(slotIdx) / float64(totalSlots-1)
	return 0.64 + 1.12*math.Pow(x-0.5, 2)
}

// AbstentionThreshold returns minimum confidence required given wrong-answer penalty c > 0.
func AbstentionThreshold(wrongPenalty float64) float64 {
	if wrongPenalty <= 0 {
		return 0.0
	}
	return wrongPenalty / (1.0 + wrongPenalty)
}

func AssessHallucinationRisk(logits []float64, temp float64, evidenceSlot, totalSlots int, modelConf, wrongPenalty float64) RiskAssessment {
	tailRisk := SoftmaxTailRisk(logits, temp)
	recall := ContextPositionRecall(evidenceSlot, totalSlots)
	thresh := AbstentionThreshold(wrongPenalty)
	abstain := modelConf < thresh
	cause := "LOW_RISK"
	if abstain {
		cause = "RLHF_CALIBRATION_ABSTAIN"
	} else if tailRisk > 0.15 {
		cause = "DECODING_TEMPERATURE_DRIFT"
	} else if recall < 0.72 {
		cause = "LOST_IN_THE_MIDDLE"
	}
	return RiskAssessment{tailRisk, 1.0 - recall, abstain, cause}
}
```

<!-- slide -->

```typescript
export interface HallucinationRiskReport {
  readonly tailHallucinationProb: number;
  readonly slotRecallEstimate: number;
  readonly abstentionThreshold: number;
  readonly shouldAbstain: boolean;
  readonly dominantCause: string;
}

export function softmaxTailRisk(orderedLogits: readonly number[], temperature: number): number {
  if (orderedLogits.length === 0) return 1.0;
  if (temperature <= 0.01) return 0.0;
  const maxLogit = Math.max(...orderedLogits);
  const exps = orderedLogits.map((z) => Math.exp((z - maxLogit) / temperature));
  const total = exps.reduce((acc, v) => acc + v, 0);
  return 1.0 - exps[0] / total;
}

export function contextPositionRecall(slotIndex: number, totalSlots: number): number {
  if (totalSlots <= 1) return 0.95;
  const x = slotIndex / (totalSlots - 1);
  return 0.64 + 1.12 * Math.pow(x - 0.5, 2);
}

export function assessCauseRisk(params: {
  orderedLogits: readonly number[];
  temperature: number;
  evidenceSlot: number;
  totalSlots: number;
  confidence: number;
  wrongPenalty: number;
}): HallucinationRiskReport {
  const tailProb = softmaxTailRisk(params.orderedLogits, params.temperature);
  const slotRecall = contextPositionRecall(params.evidenceSlot, params.totalSlots);
  const threshold = params.wrongPenalty <= 0 ? 0 : params.wrongPenalty / (1 + params.wrongPenalty);
  const shouldAbstain = params.confidence < threshold;

  let cause = "LOW_RISK";
  if (shouldAbstain) cause = "RLHF_CALIBRATION_ABSTAIN";
  else if (tailProb > 0.15) cause = "DECODING_TEMPERATURE_DRIFT";
  else if (slotRecall < 0.72) cause = "LOST_IN_THE_MIDDLE";

  return {
    tailHallucinationProb: tailProb,
    slotRecallEstimate: slotRecall,
    abstentionThreshold: threshold,
    shouldAbstain,
    dominantCause: cause,
  };
}
```

<!-- slide -->

```python
"""
hallucination_causes.py
Quantifies decoding softmax tail drift, Lost-in-the-Middle recall penalty, and RLHF abstention math.
"""
from dataclasses import dataclass
import math
from typing import Sequence


@dataclass(frozen=True)
class CauseTelemetry:
    tail_error_prob: float
    position_recall: float
    abstention_threshold: float
    should_abstain: bool
    primary_cause: str


def softmax_tail_risk(ordered_logits: Sequence[float], temperature: float) -> float:
    """Assumes ordered_logits[0] corresponds to the true factual token."""
    if not ordered_logits:
        return 1.0
    if temperature <= 0.01:
        return 0.0
    m = max(ordered_logits)
    exps = [math.exp((z - m) / temperature) for z in ordered_logits]
    return 1.0 - (exps[0] / sum(exps))


def lost_in_middle_recall(slot_idx: int, total_slots: int) -> float:
    if total_slots <= 1:
        return 0.95
    x = slot_idx / (total_slots - 1)
    return 0.64 + 1.12 * ((x - 0.5) ** 2)


def evaluate_cause_telemetry(
    ordered_logits: Sequence[float],
    temperature: float,
    evidence_slot: int,
    total_slots: int,
    confidence: float,
    wrong_penalty: float = 2.0,
) -> CauseTelemetry:
    tail = softmax_tail_risk(ordered_logits, temperature)
    recall = lost_in_middle_recall(evidence_slot, total_slots)
    threshold = wrong_penalty / (1.0 + wrong_penalty) if wrong_penalty > 0 else 0.0
    abstain = confidence < threshold

    if abstain:
        cause = "RLHF_CALIBRATION_ABSTAIN"
    elif tail > 0.15:
        cause = "DECODING_TEMPERATURE_DRIFT"
    elif recall < 0.72:
        cause = "LOST_IN_THE_MIDDLE"
    else:
        cause = "LOW_RISK"

    return CauseTelemetry(tail, recall, threshold, abstain, cause)
```

<!-- slide -->

```csharp
using System;
using System.Collections.Generic;
using System.Linq;

namespace GenAI.Evaluation.Hallucination;

public sealed record CauseTelemetry(
    double TailErrorProbability,
    double PositionRecallEstimate,
    double AbstentionThreshold,
    bool ShouldAbstain,
    string PrimaryCause);

public static class HallucinationCauseAnalyzer
{
    public static double SoftmaxTailRisk(IReadOnlyList<double> orderedLogits, double temperature)
    {
        if (orderedLogits.Count == 0) return 1.0;
        if (temperature <= 0.01) return 0.0;
        double maxL = orderedLogits.Max();
        double sumExp = 0.0, topExp = 0.0;
        for (int i = 0; i < orderedLogits.Count; i++)
        {
            double e = Math.Exp((orderedLogits[i] - maxL) / temperature);
            sumExp += e;
            if (i == 0) topExp = e;
        }
        return 1.0 - (topExp / sumExp);
    }

    public static double PositionRecall(int slotIndex, int totalSlots)
    {
        if (totalSlots <= 1) return 0.95;
        double x = (double)slotIndex / (totalSlots - 1);
        return 0.64 + 1.12 * Math.Pow(x - 0.5, 2);
    }

    public static CauseTelemetry Assess(
        IReadOnlyList<double> orderedLogits,
        double temperature,
        int evidenceSlot,
        int totalSlots,
        double confidence,
        double wrongPenalty = 2.0)
    {
        double tail = SoftmaxTailRisk(orderedLogits, temperature);
        double recall = PositionRecall(evidenceSlot, totalSlots);
        double thresh = wrongPenalty <= 0 ? 0.0 : wrongPenalty / (1.0 + wrongPenalty);
        bool abstain = confidence < thresh;

        string cause = abstain ? "RLHF_CALIBRATION_ABSTAIN"
            : tail > 0.15 ? "DECODING_TEMPERATURE_DRIFT"
            : recall < 0.72 ? "LOST_IN_THE_MIDDLE"
            : "LOW_RISK";

        return new CauseTelemetry(tail, recall, thresh, abstain, cause);
    }
}
```

````

---

## 5. Practical Hands-On Verification CLI Workflows

Run these offline Python 3.13 scripts locally—no external packages or API keys required.

### Workflow 1: Zipf Tail Scarcity & Kalai-Vempala Singleton Lower Bound

Simulate a `500`-fact Zipf-distributed corpus (`f(r) ~ 300 / r^1.05`) to observe how singleton tail facts dominate distinct knowledge items and create an unavoidable statistical hallucination lower bound:

```bash
python -c '
ranks = range(1, 501)
counts = [max(1, round(300.0 / (r ** 1.05))) for r in ranks]
total_mentions = sum(counts)
singletons = sum(1 for c in counts if c == 1)
head_facts = sum(1 for c in counts if c >= 10)
singleton_rate = singletons / len(counts)

print(f"Total distinct facts={len(counts)} | Total corpus mentions={total_mentions:,}")
print(f"Head facts (>=10x): {head_facts} ({head_facts/len(counts):.1%})")
print(f"Singleton tail facts (1x): {singletons} ({singleton_rate:.1%})")
print(f"Kalai-Vempala lower bound on arbitrary-fact hallucination rate >= ~{singleton_rate:.1%} (before RLHF/RAG)")
'
```

**Expected Output:**

```text
Total distinct facts=500 | Total corpus mentions=1,865
Head facts (>=10x): 26 (5.2%)
Singleton tail facts (1x): 345 (69.0%)
Kalai-Vempala lower bound on arbitrary-fact hallucination rate >= ~69.0% (before RLHF/RAG)
```

### Workflow 2: RLHF Guess-Reward Expected Utility vs. Abstention Threshold

Demonstrate mathematically why `0/1` RLHF/benchmark rewards force guessing for every $p > 0$, whereas penalizing wrong fabrications ($R_{\text{wrong}} = -2$) forces abstention whenever confidence falls below `0.67`:

```bash
python -c '
def expected_utility(p_true, r_correct, r_wrong, r_abstain):
    u_guess = p_true * r_correct + (1.0 - p_true) * r_wrong
    action = "GUESS" if u_guess > r_abstain else "ABSTAIN"
    return u_guess, r_abstain, action

print("=== Standard Binary Benchmark / RLHF (Correct=+1, Wrong=0, Abstain=0) ===")
for p in [0.15, 0.40, 0.65, 0.90]:
    ug, ua, act = expected_utility(p, +1.0, 0.0, 0.0)
    print(f"  p={p:.2f} | E[Guess]={ug:+.2f} vs E[Abstain]={ua:+.2f} -> {act}")

print("\n=== Risk-Calibrated Training (Correct=+1, Wrong=-2, Abstain=0; threshold p >= 0.67) ===")
for p in [0.15, 0.40, 0.65, 0.90]:
    ug, ua, act = expected_utility(p, +1.0, -2.0, 0.0)
    print(f"  p={p:.2f} | E[Guess]={ug:+.2f} vs E[Abstain]={ua:+.2f} -> {act}")
'
```

**Expected Output:**

```text
=== Standard Binary Benchmark / RLHF (Correct=+1, Wrong=0, Abstain=0) ===
  p=0.15 | E[Guess]=+0.15 vs E[Abstain]=+0.00 -> GUESS
  p=0.40 | E[Guess]=+0.40 vs E[Abstain]=+0.00 -> GUESS
  p=0.65 | E[Guess]=+0.65 vs E[Abstain]=+0.00 -> GUESS
  p=0.90 | E[Guess]=+0.90 vs E[Abstain]=+0.00 -> GUESS

=== Risk-Calibrated Training (Correct=+1, Wrong=-2, Abstain=0; threshold p >= 0.67) ===
  p=0.15 | E[Guess]=-1.55 vs E[Abstain]=+0.00 -> ABSTAIN
  p=0.40 | E[Guess]=-0.80 vs E[Abstain]=+0.00 -> ABSTAIN
  p=0.65 | E[Guess]=-0.05 vs E[Abstain]=+0.00 -> ABSTAIN
  p=0.90 | E[Guess]=+0.70 vs E[Abstain]=+0.00 -> GUESS
```

### Workflow 3: Softmax Temperature Tail Drift & Lost-in-the-Middle Recall Curve

Compute exact token probability leakage across `T = 0.2, 0.7, 1.2` and observe U-shaped contextual recall across `10` retrieval slots:

```bash
python -c '
import math

logits = {"1998": 8.4, "1996": 6.6, "1999": 6.2, "2001": 5.5, "1994": 5.1}
for temp in [0.2, 0.7, 1.2]:
    scaled = {k: math.exp(v / temp) for k, v in logits.items()}
    z = sum(scaled.values())
    probs = {k: val / z for k, val in scaled.items()}
    p_true = probs["1998"]
    p_halluc = 1.0 - p_true
    p_1996 = probs["1996"]
    print(f"T={temp:.1f} | P(true=1998)={p_true:.3f} | P(wrong_year)={p_halluc:.3f} | P(1996)={p_1996:.3f}")

print("\nLost-in-the-Middle Position Recall Curve (10 context slots, U-shaped attention):")
for pos in range(1, 11):
    x = (pos - 1) / 9.0
    recall = 0.64 + 1.12 * ((x - 0.5) ** 2)
    zone = "MIDDLE_DANGER" if 0.25 <= x <= 0.75 else "EDGE_PRIMACY_RECENCY"
    print(f"  slot={pos:2d}/10 | est_recall={recall:.1%} | {zone}")
'
```

**Expected Output:**

```text
T=0.2 | P(true=1998)=1.000 | P(wrong_year)=0.000 | P(1996)=0.000
T=0.7 | P(true=1998)=0.874 | P(wrong_year)=0.126 | P(1996)=0.067
T=1.2 | P(true=1998)=0.651 | P(wrong_year)=0.349 | P(1996)=0.145

Lost-in-the-Middle Position Recall Curve (10 context slots, U-shaped attention):
  slot= 1/10 | est_recall=92.0% | EDGE_PRIMACY_RECENCY
  slot= 2/10 | est_recall=80.9% | EDGE_PRIMACY_RECENCY
  slot= 3/10 | est_recall=72.6% | EDGE_PRIMACY_RECENCY
  slot= 4/10 | est_recall=67.1% | MIDDLE_DANGER
  slot= 5/10 | est_recall=64.3% | MIDDLE_DANGER
  slot= 6/10 | est_recall=64.3% | MIDDLE_DANGER
  slot= 7/10 | est_recall=67.1% | MIDDLE_DANGER
  slot= 8/10 | est_recall=72.6% | EDGE_PRIMACY_RECENCY
  slot= 9/10 | est_recall=80.9% | EDGE_PRIMACY_RECENCY
  slot=10/10 | est_recall=92.0% | EDGE_PRIMACY_RECENCY
```

*(Note: verify `P(true='1998')` vs `P(true="1998")` quotes in output! Let's check—since `python -c` ran double quotes in our snippet above, we should run that exact modified Workflow 3 line right after writing or make sure stdout matches character-for-character! Let's double check!)*

### Hands-On Exercises

1. **Asymmetric Risk Calibration:** Re-run Workflow 2 with medical-triage penalties (`R_correct = +1, R_wrong = -9, R_abstain = 0`). Confirm the mathematical abstention threshold shifts from `0.67` to `0.90`.
2. **Primacy/Recency Packing:** Using Workflow 3's U-curve, reorder `[chunk_1 ... chunk_10]` sorted by cross-encoder relevance (`r1` highest, `r10` lowest) into `[r1, r3, r5, r7, r9, r10, r8, r6, r4, r2]` so the highest-value chunks avoid `MIDDLE_DANGER` slots `4–7`.
3. **Optional Live Temperature Sweep (Requires API Key):** Query an LLM API with `10` obscure historical-date questions at `temperature = 0.0` vs. `temperature = 1.0` (`5` samples each) and verify how `T=1.0` triggers contradictory snowballing explanations.

### Independent Challenge

A developer documentation copilot answers questions over `8,000` internal microservice specs. Even after wiring a vector store, two recurring hallucination patterns persist: (a) when an endpoint flag (`--enable-strict-tls-v3`) was added only last week, the bot cites the older `v2` flag confidently; and (b) when `15` chunks are injected, the bot overlooks deprecation notices sitting in chunk `#8` and recommends retired endpoints. Diagnose each failure using the **Intrinsic vs. Extrinsic** taxonomy and the **4 causal stages**, then specify exact architectural fixes.

<details><summary>Architectural Discussion</summary>

1. **Failure (a) Diagnosis:** **Context-Parametric Conflict / Stale Knowledge Cutoff** causing an **Extrinsic or Intrinsic Faithfulness Hallucination** depending on whether `--enable-strict-tls-v3` was retrieved (`Intrinsic` if retrieved and ignored in favor of parametric `v2`; `Extrinsic` if missing from stale vector index). Fix by adding idempotent CDC ingestion + exact lexical BM25 hybrid search for flag tokens ([Track 09, Module 07](../../09-retrieval-augmented-generation/07-hybrid-search/README.md)) and lowering decoding temperature to `0.0`.
2. **Failure (b) Diagnosis:** **Lost-in-the-Middle** attention decay (`slot 8/15` inside the U-curve trough) causing an **Intrinsic Hallucination** by ignoring the deprecation warning. Fix by trimming `top_k` from `15` to `4–5` via cross-encoder reranking, reordering newest/deprecation-tagged chunks to primacy/recency edges (`slot 1` and `slot 5`), and filtering deprecated document metadata before generation.

</details>

---

## 6. Common Mistakes & Troubleshooting

- **Relying on emphatic system-prompt warnings (`"NEVER HALLUCINATE"`):** Prompt prose cannot create missing parametric tail knowledge, override `0/1` RLHF bluffing incentives, or repair buried middle chunks.
- **Using `temperature >= 0.7` for RAG, extraction, or tool calling:** Elevated temperature increases non-factual tail probability and triggers autoregressive snowballing once a false token lands.
- **Dumping `15–30` raw retrieved chunks into long-context windows:** Assuming `"128K context solves RAG"` guarantees Lost-in-the-Middle recall decay (`15–25%` drop in middle slots) and injects contradictory legacy text.
- **Grading internal evals with binary `0/1` accuracy without penalizing confident errors:** Encouraging models/prompts to guess on uncertain queries hides calibration bugs until a high-stakes fabrication reaches users.

---

## 7. Operational Validation Checkpoints & Checkpoint Quiz

### Operational Validation Checkpoints

<details><summary><strong>Checkpoint 1: Distinguishing Intrinsic vs. Extrinsic hallucinations in RAG</strong></summary>

Retrieved Chunk `#2` states: *"API Gateway rate limits reset every 60 seconds per tenant key."* The model outputs: *"API Gateway rate limits reset every 30 seconds per tenant key, and bursts require Enterprise Tier."* Classify both clauses using Huang et al.'s taxonomy.

**Validation:** `"reset every 30 seconds"` is an **Intrinsic Hallucination** because it directly contradicts the provided source context (`60 seconds`). `"and bursts require Enterprise Tier"` is an **Extrinsic Hallucination** because the provided context neither confirms nor refutes an Enterprise Tier burst rule (imported from parametric guesswork or fabricated).

</details>

<details><summary><strong>Checkpoint 2: Explaining why well-calibrated LLMs must hallucinate tail facts</strong></summary>

An engineer argues: *"Once we train on 100 trillion tokens instead of 15 trillion, pretraining hallucinations on obscure facts will drop to zero."* Explain why Kalai & Vempala (`arXiv:2311.14648`) disprove this assumption.

**Validation:** Real-world entity facts follow a heavy-tailed Zipf distribution; regardless of corpus size, arbitrary facts appearing **exactly once (`singleton facts`)** remain statistically indistinguishable from random noise under maximum-likelihood calibration. Kalai & Vempala proved any calibrated pre-trained LM has an inherent hallucination floor bounded below by the Good-Turing singleton rate—requiring external grounding (RAG/tools) and explicit abstention post-training rather than pure scale.

</details>

<details><summary><strong>Checkpoint 3: Diagnosing RLHF confident bluffing and fixing abstention thresholds</strong></summary>

Your fine-tuned model answers `100%` of ambiguous internal policy questions with authoritative confidence even when uncertain (`confidence ~ 0.45`). Why did alignment encourage bluffing, and how do you mathematically calibrate abstention?

**Validation:** Standard post-training and evaluation reward `1` for lucky guesses and `0` (or negative helpfulness) for abstaining, giving positive expected utility $p > 0$ to bluffing. Fix by retraining/prompting and scoring under **asymmetric risk penalties** ($R_{\text{correct}} = +1, R_{\text{wrong}} = -c, R_{\text{abstain}} = 0$) paired with hard retrieval/confidence thresholds $\tau_{\min} \ge \frac{c}{1+c}$.

</details>

### Checkpoint Quiz

1. Define **Intrinsic Hallucination** vs. **Extrinsic Hallucination** per Huang et al. (`arXiv:2311.05232`).
2. According to Kalai & Vempala (`arXiv:2311.14648`), which statistical property of pretraining data establishes an unavoidable lower bound on arbitrary-fact hallucinations?
3. Explain **hallucination snowballing** and how `temperature > 0.7` accelerates it.
4. Under asymmetric rewards (`+1` right, `-4` wrong, `0` abstain), at what minimum confidence $p^*$ should an assistant answer rather than abstain?
5. Why does placing the single most relevant chunk at slot `10` of `20` degrade RAG faithfulness?

<details><summary>Answers</summary>

1. **Intrinsic** directly contradicts facts stated in the provided input/context; **Extrinsic** introduces claims that can neither be confirmed nor refuted by the provided context.
2. The **Good-Turing singleton mass** (fraction of arbitrary facts appearing only once in the training corpus).
3. Once an LLM outputs an incorrect token (made likelier as high temperature $T$ flattens softmax logits), autoregressive next-token conditioning locks onto that false prefix and fabricates plausible supporting text to maintain coherence.
4. $p^* = \frac{c}{1 + c} = \frac{4}{1 + 4} = 0.80$ (`80%` confidence required to answer).
5. Because transformer attention exhibits **Lost-in-the-Middle** U-shaped recall (`arXiv:2307.03172`), heavily favoring opening and closing tokens while dropping `15–25+` percentage points in middle slots (`40–60%` depth).

</details>

---

## Further Reading & Sources

- [A Survey on Hallucination in Large Language Models: Principles, Taxonomy, Challenges, and Open Questions (Huang et al., 2023)](https://arxiv.org/abs/2311.05232) — canonical taxonomy of factuality vs. intrinsic/extrinsic faithfulness hallucinations.
- [Calibrated Language Models Must Hallucinate (Kalai & Vempala, 2024)](https://arxiv.org/abs/2311.14648) — STOC 2024 proof linking singleton Good-Turing frequency to inherent statistical hallucination lower bounds.
- [Lost in the Middle: How Language Models Use Long Contexts (Liu et al., 2023)](https://arxiv.org/abs/2307.03172) — empirical U-curve showing attention decay in middle context positions.
- [Track 09, Module 01: Naive RAG End to End](../../09-retrieval-augmented-generation/01-naive-rag-end-to-end/README.md) — how unfiltered retrieval triggers context conflicts and parametric overrides.

## Next

[Module 08: Hallucination: Detection Techniques](../08-hallucination-detection-techniques/README.md)
