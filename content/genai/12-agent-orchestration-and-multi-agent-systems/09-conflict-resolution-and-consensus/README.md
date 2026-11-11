# Module 09: Conflict Resolution and Consensus

> **Prerequisites:** [Module 08: Shared State and Blackboards](../08-shared-state-and-blackboards/README.md), [Track 10, Module 12: Reflection and Self-Correction](../../10-ai-agents/12-reflection-and-self-correction/README.md), and [Track 10, Module 13: Human-in-the-Loop Patterns](../../10-ai-agents/13-human-in-the-loop-patterns/README.md).  
> **Estimated Reading Time:** 34 minutes  
> **Target Audience:** AI Backend Engineers, Agent Safety Architects, Distributed Systems Engineers

> [!TIP]
> **The Golden Rule of Multi-Agent Consensus:** Never equate "three identical LLM calls agreeing" with independent fault tolerance; pair **deterministic verification first** with **heterogeneous weighted voting or evidence-gated debate**, and trigger a **margin-bounded Human Escalation (`ESCALATE_HUMAN`)** whenever consensus margins fall below $\delta_{\min}$ or sycophantic flips lack verifiable evidence.

---

## Why This Matters

Once specialist agents read and write to a shared Blackboard ([Module 08](../08-shared-state-and-blackboards/README.md)), they inevitably disagree. `PerformanceAgent` proposes removing a slow validation join; `SecurityAgent` blocks the PR for missing authorization checks; `BillingAgent` recommends a `\$450` refund while `FraudAgent` scores high risk. Leaving resolution to whichever agent wrote last degrades system safety to coin flips.

The instinct of most engineering teams is to add `"vote 3 times"` or `"let the agents debate until they agree"`. Both shortcuts fail silently in production: **majority voting across three calls to the exact same model and prompt exhibits severe error correlation**, amplifying shared pretraining blind spots instead of canceling errors; meanwhile, **unconstrained multi-agent debate suffers from inter-agent sycophancy**, where confident wrong peers bully a lone correct specialist into abandoning a valid objection by Round 2.

---

## 1. Conflict Resolution Mechanics & The Condorcet Illusion

When $N$ agents emit competing recommendations, structured patches, or verdicts, a production **Consensus Engine** executes four ordered gates before committing to the Blackboard:

1. **Deterministic Verifier Pre-Check:** Run objective non-LLM checks first (JSON schema, SQL `EXPLAIN`, unit tests, static policy rules). Any proposal failing deterministic checks is eliminated before voting or judging—never spend judge tokens arbitrating invalid code.
2. **Weighted / Heterogeneous Aggregation:** Aggregate surviving votes using empirically calibrated model weights ($w_i$) rather than self-reported LLM confidence scores, prioritizing model diversity across distinct model families/prompts.
3. **Evidence-Gated Structured Debate or Blind Arbiter:** If disagreement persists, run either (a) a structured **Society of Mind** debate (Du et al., `arXiv:2305.14325`) where agents exchange critiques *only* with citation-backed flip guards, or (b) a single **Blind Frontier Arbiter** evaluating anonymized `Option A` vs `Option B` (randomizing order to suppress position bias).
4. **Margin & Blast-Radius Escalation:** Compute consensus margin $\Delta = s_1 - s_2$. If $\Delta < \delta_{\min}$, or if high-blast-radius domains (irreversible schema drops, payouts above threshold) fail strict quorum, route directly to `ESCALATE_HUMAN`.

```mermaid
flowchart LR
    P["Competing Agent Proposals"] --> V{"1. Deterministic Verifier (Tests / Schema / Policy)"}
    V -->|"Only 1 valid"| Commit["Commit Winner to Blackboard"]
    V -->|"0 valid"| Retry["Targeted Repair or Fail"]
    V -->|"2+ valid"| Vote["2. Heterogeneous Brier-Weighted Vote"]
    Vote -->|"Margin >= delta_min"| Commit
    Vote -->|"Margin < delta_min"| Debate{"3. Mode Selection"}
    Debate -->|"Evidence-Gated Debate"| Round2["Critique Round (Block Uncited Flips)"]
    Debate -->|"Blind Frontier Arbiter"| Judge["Frontier Judge (Randomized A/B)"]
    Round2 --> Gate{"4. Quorum & Blast-Radius Gate"}
    Judge --> Gate
    Gate -->|"Resolved >= threshold"| Commit
    Gate -->|"Deadlock or High-Risk Split"| HITL["ESCALATE_HUMAN (HITL Queue)"]
```

### Quantitative Mechanics: Condorcet Jury Math vs. Correlated LLM Failure

The classical **Condorcet Jury Theorem** states that if $n$ voters make decisions **independently**, each with accuracy $p > 0.5$, the probability that an odd-sized majority vote is correct increases strictly toward `1.0` as $n$ grows:

$$P_{\text{ind}}(n, p) = \sum_{k = \lceil n/2 \rceil}^{n} \binom{n}{k} p^k (1 - p)^{n - k}$$

At $p = 0.75$ and $\rho = 0$ (strictly independent errors), increasing $n$ from `1` to `3` to `5` to `9` raises accuracy cleanly from `75.00%` $\to$ `84.38%` $\to$ `89.65%` $\to$ `95.11%`.

However, calling the **same LLM family with the same prompt** violates independence: models share pretraining corpora, RLHF sycophancy priors, and prompt blind spots, producing pairwise error correlation $\rho \in [0.35, 0.75]$. Under a **Common-Shock Correlated Jury Model**—where fraction $\rho$ of inputs trigger shared correlated reasoning across all $n$ calls and fraction $(1 - \rho)$ remain independent—majority accuracy becomes:

$$P_{\text{corr}}(n, p, \rho) = \rho \cdot p + (1 - \rho) \cdot P_{\text{ind}}(n, p)$$

When $\rho = 0.70$, running $n = 3$ homogeneous votes yields only `77.81%` (`+2.81` points over a single call) while **tripling** latency and token cost, and even $n = 9$ hits an asymptotic ceiling at `81.03%`! Breaking correlation $\rho$ requires **heterogeneous model families, orthogonal retrieval slices, or external code/tool execution**—not repeating the same call.

### Why Unconstrained Debate Fails: Majority Dominance & Sycophancy

Multi-agent debate (Du et al., `arXiv:2305.14325`) improves arithmetic and factual verification when agents cross-check intermediate reasoning steps. Yet subsequent empirical analyses exposed two critical failure modes:

- **Majority Voting Explains Most Gains (`arXiv:2508.17536`):** Choi et al. (*Debate or Vote*) proved that unguided debate frequently behaves like a martingale over belief trajectories; simple independent majority voting delivers most of the accuracy lift at a fraction of multi-round token cost unless debate explicitly injects verifier feedback.
- **Inter-Agent Sycophancy & Disagreement Collapse (`arXiv:2509.23055`):** Yao et al. (*Peacemaker or Troublemaker*) demonstrated that RLHF-trained LLMs exhibit **inter-agent sycophancy**: when 1 minority agent correctly flags a defect and 2 confident peers argue `"LGTM"`, the minority agent frequently caves in Round 2 (`Disagreement Collapse`), flipping from right to wrong just to restore conversational harmony. Guarding against this requires **Evidence-Gated Debate**: rejecting any Round-2 stance flip unless the flipping agent cites a newly surfaced verifiable artifact (`CITED:test_id` or `CITED:rule_id`).

---

## 2. Systematic Comparison Matrix: Consensus Mechanisms

| Mechanism | Token Multiplier | Handles Correlated Errors? | Sycophancy Risk | Best Production Fit |
| :--- | :--- | :--- | :--- | :--- |
| **Homogeneous Majority Vote (`Maj@k`)** | $k\times$ (parallel) | Poor ($\rho \approx 0.70$ caps gains) | None (single shot) | Low-stakes classification or discrete math with high temperature diversity |
| **Heterogeneous Weighted Consensus** | $N\times$ (parallel) | Moderate–High (diverse model families) | None (parallel votes) | Production routing/triage combining distinct models weighted by historical Brier scores |
| **Blind Frontier Arbiter (LLM Judge)** | $(N + 1)\times$ | High (stronger verifier model) | Low (one-way evaluation) | Comparing rich prose/code patches where order randomization suppresses position bias |
| **Evidence-Gated Structured Debate** | $(N \cdot R)\times$ | Moderate (only with external tools/citations) | Controlled (blocks uncited flips) | High-value architecture/security review requiring explicit cross-examination trails |
| **Deterministic Verifier + HITL Margin Gate** | $1\times$ to $N\times$ | Eliminates syntax/policy errors | Eliminates blind rubber-stamping | Regulated finance, healthcare, and irreversible infra mutations (`DROP`, payouts) |

---

## 3. Production War Story Post-Mortem: The \$140,000 Sycophantic Migration Outage

| Field | Incident Details |
| :--- | :--- |
| **Severity** | **SEV-1** (42-Minute Checkout Table Lockout During Peak Traffic) |
| **Detection / Resolution Time** | Detected in 3 minutes via p99 checkout latency alarm / Mitigated in 42 minutes (terminated blocked `ALTER TABLE` + rolled back lock) |
| **Impact** | **\$140,000** lost gross merchandise volume (GMV) when `orders` table locked under `ACCESS EXCLUSIVE` for 42 minutes |

### What Happened

A payments engineering team deployed a 3-agent SQL migration reviewer (`SecAgent`, `PerfAgent`, `DevAgent`) running a 2-round Du-style debate over PostgreSQL DDL changes before auto-merging:

1. A developer opened a PR adding a composite index on the 180M-row `orders` table *without* `CONCURRENTLY` (`CREATE INDEX idx_orders_tenant ON orders(tenant_id, created_at);`).
2. In **Round 1**, `SecAgent` flagged a blocking lock hazard (`REJECT: missing CONCURRENTLY acquires SHARE lock`), while `PerfAgent` and `DevAgent`—both instantiated on the exact same model family with `temp=0.2`—shared a blind spot and responded confidently: `"Index syntax is valid and fast; APPROVE for zero-downtime deploy."`
3. In **Round 2**, seeing two confident `"APPROVE"` peers, `SecAgent` exhibited **inter-agent sycophancy**, outputting: `"Thank you for the clarification; upon reflection, the index syntax is sound. Changing my vote to APPROVE."`
4. The `3–0` unanimous Round-2 score bypassed manual DBA review and triggered immediate production execution, blocking writes on `orders` for `42` minutes.

```mermaid
sequenceDiagram
    autonumber
    participant PR as Migration PR (Missing CONCURRENTLY)
    participant Sec as SecAgent (Minority Critic)
    participant Perf as PerfAgent (Same Model)
    participant Dev as DevAgent (Same Model)
    participant Gate as Naive Debate Consensus

    PR->>Sec: Review DDL Round 1
    PR->>Perf: Review DDL Round 1
    PR->>Dev: Review DDL Round 1
    Sec-->>Gate: REJECT (Table lock hazard)
    Perf-->>Gate: APPROVE (Correlated blind spot)
    Dev-->>Gate: APPROVE (Correlated blind spot)
    Note over Sec,Dev: Round 2 peers exchange unverified opinions
    Perf-->>Sec: Completely safe for zero-downtime deploy
    Sec-->>Gate: Sycophantic flip to APPROVE (No new evidence cited)
    Gate-->>PR: Auto-merge 3-0 unanimous -> 42-min orders table lock (SEV-1)
```

### Root Cause Analysis

- **Correlated Priors ($\rho \approx 0.7$):** `PerfAgent` and `DevAgent` shared the identical model weights and generic review prompt, producing correlated false approvals.
- **Unguarded Sycophantic Collapse:** The consensus aggregator accepted `SecAgent`'s Round-2 reversal even though zero deterministic lock analysis or policy documentation was cited to refute its Round-1 objection.
- **Missing Blast-Radius Gate:** Production DDL on core tables allowed autonomous merge without requiring an explicit deterministic linter (`squawk`) or human DBA sign-off when any Round-1 `REJECT` occurred.

### The Fix & Architectural Hardening

- **Deterministic SQL Linter Gate:** Added static AST policy validation (`require CONCURRENTLY on tables > 1M rows`) ahead of LLM consensus so syntax/lock hazards fail deterministically in `15 ms`.
- **Evidence-Gated Flip Filter:** Any Round-2 reversal (`REJECT -> APPROVE`) without a verified citation ID is automatically discarded, preserving the grounded Round-1 dissent.
- **High-Risk Escalation Rule:** Any DDL touching tier-0 tables where Round-1 disagreement occurred (`margin < 0.50` or `any_round1_reject == True`) routes automatically to `ESCALATE_HUMAN`.

---

## 4. Multi-Language Production Implementation: Calibrated Consensus & Sycophancy Guard

Below is a production-ready **Consensus & Escalation Engine** across **Go**, **TypeScript**, **Python**, and **C#**. Each implementation enforces: (1) Brier-calibrated heterogeneous weights (rejecting raw uncalibrated LLM confidence), (2) Round-2 **Sycophancy Flip Protection** requiring cited evidence, (3) **margin-bounded escalation** (`deltaMin` + `highRisk` quorum), and (4) **blind randomized pairwise judging payload** construction.

````carousel

```go
package consensus

import (
	"fmt"
	"math/rand"
	"sort"
	"strings"
)

type Vote struct {
	AgentID       string
	Choice        string
	Weight        float64 // Empirically calibrated Brier weight, NOT self-reported confidence
	CitedEvidence string
}

type Verdict struct {
	Status          string // "DECIDED" | "ESCALATE_JUDGE" | "ESCALATE_HUMAN"
	WinningChoice   string
	Margin          float64
	BlockedFlips    int
	BlindJudgeOrder []string
}

// ResolveDebateConsensus retains Round-1 dissent if a Round-2 flip cites no new evidence,
// computes weighted margins, and prepares randomized blind arbiter pairs on narrow splits.
func ResolveDebateConsensus(r1Votes, r2Votes []Vote, deltaMin float64, highRisk bool, seed int64) Verdict {
	r1ByAgent := make(map[string]Vote, len(r1Votes))
	for _, v := range r1Votes {
		r1ByAgent[v.AgentID] = v
	}

	tallies := make(map[string]float64)
	blocked := 0
	for _, v2 := range r2Votes {
		effective := v2
		if v1, ok := r1ByAgent[v2.AgentID]; ok && v1.Choice != v2.Choice {
			// Guard against inter-agent sycophancy: block flips lacking verifiable citation
			if !strings.HasPrefix(v2.CitedEvidence, "CITED:") {
				effective = v1
				blocked++
			}
		}
		tallies[effective.Choice] += effective.Weight
	}

	type kv struct {
		Choice string
		Score  float64
	}
	ranked := make([]kv, 0, len(tallies))
	for c, s := range tallies {
		ranked = append(ranked, kv{c, s})
	}
	sort.Slice(ranked, func(i, j int) bool { return ranked[i].Score > ranked[j].Score })

	if len(ranked) == 0 {
		return Verdict{Status: "ESCALATE_HUMAN", BlockedFlips: blocked}
	}
	top := ranked[0]
	secondScore := 0.0
	if len(ranked) > 1 {
		secondScore = ranked[1].Score
	}
	margin := top.Score - secondScore

	if highRisk && (margin < 0.50 || blocked > 0) {
		return Verdict{Status: "ESCALATE_HUMAN", WinningChoice: top.Choice, Margin: margin, BlockedFlips: blocked}
	}
	if margin < deltaMin && len(ranked) > 1 {
		rng := rand.New(rand.NewSource(seed))
		pair := []string{ranked[0].Choice, ranked[1].Choice}
		if rng.Intn(2) == 1 {
			pair[0], pair[1] = pair[1], pair[0] // Suppress judge position bias
		}
		return Verdict{
			Status:          "ESCALATE_JUDGE",
			WinningChoice:   top.Choice,
			Margin:          margin,
			BlockedFlips:    blocked,
			BlindJudgeOrder: []string{fmt.Sprintf("Option_A:%s", pair[0]), fmt.Sprintf("Option_B:%s", pair[1])},
		}
	}
	return Verdict{Status: "DECIDED", WinningChoice: top.Choice, Margin: margin, BlockedFlips: blocked}
}
```

<!-- slide -->

```typescript
export interface AgentVote {
  readonly agentId: string;
  readonly choice: string;
  readonly calibratedWeight: number; // Derived from historical Brier calibration
  readonly citedEvidence: string;
}

export interface ConsensusDecision {
  readonly status: "DECIDED" | "ESCALATE_JUDGE" | "ESCALATE_HUMAN";
  readonly winner?: string;
  readonly margin: number;
  readonly blockedSycophanticFlips: number;
  readonly blindJudgePair?: readonly [string, string];
}

export function resolveWithSycophancyGuard(
  round1: readonly AgentVote[],
  round2: readonly AgentVote[],
  options: { deltaMin: number; highRisk: boolean; flipRandomSeed?: number },
): ConsensusDecision {
  const r1Map = new Map(round1.map((v) => [v.agentId, v]));
  const tallies = new Map<string, number>();
  let blocked = 0;

  for (const v2 of round2) {
    const v1 = r1Map.get(v2.agentId);
    let effective = v2;
    if (v1 && v1.choice !== v2.choice && !v2.citedEvidence.startsWith("CITED:")) {
      effective = v1; // Reject uncited Round-2 conformity flip
      blocked += 1;
    }
    tallies.set(effective.choice, (tallies.get(effective.choice) ?? 0) + effective.calibratedWeight);
  }

  const ranked = [...tallies.entries()].sort((a, b) => b[1] - a[1]);
  if (ranked.length === 0) {
    return { status: "ESCALATE_HUMAN", margin: 0, blockedSycophanticFlips: blocked };
  }

  const [topChoice, topScore] = ranked[0];
  const secondScore = ranked.length > 1 ? ranked[1][1] : 0;
  const margin = topScore - secondScore;

  if (options.highRisk && (margin < 0.5 || blocked > 0)) {
    return { status: "ESCALATE_HUMAN", winner: topChoice, margin, blockedSycophanticFlips: blocked };
  }

  if (margin < options.deltaMin && ranked.length > 1) {
    const swap = ((options.flipRandomSeed ?? 1) % 2) === 1;
    const pair: [string, string] = swap
      ? [ranked[1][0], ranked[0][0]]
      : [ranked[0][0], ranked[1][0]];
    return {
      status: "ESCALATE_JUDGE",
      winner: topChoice,
      margin,
      blockedSycophanticFlips: blocked,
      blindJudgePair: pair,
    };
  }

  return { status: "DECIDED", winner: topChoice, margin, blockedSycophanticFlips: blocked };
}
```

<!-- slide -->

```python
"""
consensus_router.py
Brier-weighted multi-agent consensus with Round-2 sycophancy flip rejection and margin escalation.
"""
from dataclasses import dataclass
import random
from typing import Sequence


@dataclass(frozen=True)
class AgentVote:
    agent_id: str
    choice: str
    calibrated_weight: float  # Empirical weight, never raw self-reported confidence
    cited_evidence: str = ""


@dataclass(frozen=True)
class ConsensusVerdict:
    status: str  # "DECIDED" | "ESCALATE_JUDGE" | "ESCALATE_HUMAN"
    winner: str | None
    margin: float
    blocked_flips: int
    blind_pair: tuple[str, str] | None = None


def resolve_consensus(
    r1_votes: Sequence[AgentVote],
    r2_votes: Sequence[AgentVote],
    delta_min: float = 0.25,
    high_risk: bool = False,
    seed: int = 7,
) -> ConsensusVerdict:
    r1_by_agent = {v.agent_id: v for v in r1_votes}
    tallies: dict[str, float] = {}
    blocked = 0

    for v2 in r2_votes:
        v1 = r1_by_agent.get(v2.agent_id)
        effective = v2
        if v1 and v1.choice != v2.choice and not v2.cited_evidence.startswith("CITED:"):
            effective = v1  # Block sycophantic disagreement collapse
            blocked += 1
        tallies[effective.choice] = tallies.get(effective.choice, 0.0) + effective.calibrated_weight

    if not tallies:
        return ConsensusVerdict(status="ESCALATE_HUMAN", winner=None, margin=0.0, blocked_flips=blocked)

    ranked = sorted(tallies.items(), key=lambda kv: kv[1], reverse=True)
    top_choice, top_score = ranked[0]
    second_score = ranked[1][1] if len(ranked) > 1 else 0.0
    margin = top_score - second_score

    if high_risk and (margin < 0.50 or blocked > 0):
        return ConsensusVerdict(status="ESCALATE_HUMAN", winner=top_choice, margin=margin, blocked_flips=blocked)

    if margin < delta_min and len(ranked) > 1:
        pair = [ranked[0][0], ranked[1][0]]
        random.Random(seed).shuffle(pair)  # Anonymized & randomized to eliminate order bias
        return ConsensusVerdict(
            status="ESCALATE_JUDGE",
            winner=top_choice,
            margin=margin,
            blocked_flips=blocked,
            blind_pair=(pair[0], pair[1]),
        )

    return ConsensusVerdict(status="DECIDED", winner=top_choice, margin=margin, blocked_flips=blocked)
```

<!-- slide -->

```csharp
using System;
using System.Collections.Generic;
using System.Linq;

namespace GenAI.Consensus;

public sealed record AgentVote(
    string AgentId,
    string Choice,
    double CalibratedWeight,
    string CitedEvidence);

public sealed record ConsensusVerdict(
    string Status,
    string? Winner,
    double Margin,
    int BlockedSycophanticFlips,
    IReadOnlyList<string>? BlindJudgePair);

public static class ConsensusRouter
{
    public static ConsensusVerdict Resolve(
        IReadOnlyList<AgentVote> round1,
        IReadOnlyList<AgentVote> round2,
        double deltaMin = 0.25,
        bool highRisk = false,
        int seed = 7)
    {
        var r1Map = round1.ToDictionary(v => v.AgentId, StringComparer.Ordinal);
        var tallies = new Dictionary<string, double>(StringComparer.Ordinal);
        int blocked = 0;

        foreach (var v2 in round2)
        {
            var effective = v2;
            if (r1Map.TryGetValue(v2.AgentId, out var v1) &&
                !string.Equals(v1.Choice, v2.Choice, StringComparison.Ordinal) &&
                !v2.CitedEvidence.StartsWith("CITED:", StringComparison.Ordinal))
            {
                effective = v1; // Reject uncited Round-2 conformity flip
                blocked++;
            }

            tallies[effective.Choice] = tallies.GetValueOrDefault(effective.Choice) + effective.CalibratedWeight;
        }

        if (tallies.Count == 0)
            return new ConsensusVerdict("ESCALATE_HUMAN", null, 0.0, blocked, null);

        var ranked = tallies.OrderByDescending(kv => kv.Value).ToList();
        var top = ranked[0];
        double second = ranked.Count > 1 ? ranked[1].Value : 0.0;
        double margin = top.Value - second;

        if (highRisk && (margin < 0.50 || blocked > 0))
            return new ConsensusVerdict("ESCALATE_HUMAN", top.Key, margin, blocked, null);

        if (margin < deltaMin && ranked.Count > 1)
        {
            var rng = new Random(seed);
            var pair = rng.Next(2) == 0
                ? new[] { ranked[0].Key, ranked[1].Key }
                : new[] { ranked[1].Key, ranked[0].Key };
            return new ConsensusVerdict("ESCALATE_JUDGE", top.Key, margin, blocked, pair);
        }

        return new ConsensusVerdict("DECIDED", top.Key, margin, blocked, null);
    }
}
```

````

---

## 5. Practical Hands-On Verification CLI Workflows

Run these deterministic Python 3.13 scripts locally—no external libraries or API keys required.

### Workflow 1: Measure Condorcet Independence vs. Correlated Error Saturation

Observe how independent voters scale smoothly to `95.11%` accuracy at $n = 9$, whereas correlated homogeneous calls ($\rho = 0.70$) plateau early at `81.03%`:

```bash
python -c '
import math

def independent_majority(n, p):
    need = (n // 2) + 1
    return sum(math.comb(n, k) * (p ** k) * ((1.0 - p) ** (n - k)) for k in range(need, n + 1))

def correlated_majority(n, p, rho):
    return rho * p + (1.0 - rho) * independent_majority(n, p)

p = 0.75
for rho in (0.0, 0.35, 0.70):
    row = " | ".join(f"n={n}: {correlated_majority(n, p, rho)*100:5.2f}%" for n in (1, 3, 5, 9))
    print(f"rho={rho:.2f} -> {row}")
'
```

**Expected Output:**

```text
rho=0.00 -> n=1: 75.00% | n=3: 84.38% | n=5: 89.65% | n=9: 95.11%
rho=0.35 -> n=1: 75.00% | n=3: 81.09% | n=5: 84.52% | n=9: 88.07%
rho=0.70 -> n=1: 75.00% | n=3: 77.81% | n=5: 79.39% | n=9: 81.03%
```

### Workflow 2: Test Sycophancy Flip Blocking vs. Evidence-Backed Debate Shifts

Simulate Round-1 to Round-2 debate transitions when `SecAgent` flips without new evidence (`sycophancy`) versus when `PerfAgent` flips *after* verifying `CITED:FOR_UPDATE_LOCK`:

```bash
python -c '
rounds = [
    {"case": "SQL Lock Hazard", "r1": [("SecAgent", "REJECT", "FOR_UPDATE_LOCK"), ("PerfAgent", "APPROVE", "INDEX_OK"), ("DevAgent", "APPROVE", "SYNTAX_OK")],
     "r2_sycophant": [("SecAgent", "APPROVE", "AGREE_WITH_MAJORITY"), ("PerfAgent", "APPROVE", "INDEX_OK"), ("DevAgent", "APPROVE", "SYNTAX_OK")],
     "r2_evidenced": [("SecAgent", "REJECT", "FOR_UPDATE_LOCK"), ("PerfAgent", "REJECT", "CITED:FOR_UPDATE_LOCK"), ("DevAgent", "APPROVE", "SYNTAX_OK")]},
]

def evaluate_debate(mode_label, r1_votes, r2_votes, require_new_evidence):
    r1_map = {a: (v, ev) for a, v, ev in r1_votes}
    accepted = []
    rejected_flips = 0
    for agent, v2, ev2 in r2_votes:
        v1, ev1 = r1_map[agent]
        if v2 != v1 and require_new_evidence and not ev2.startswith("CITED:"):
            rejected_flips += 1
            accepted.append((agent, v1))
        else:
            accepted.append((agent, v2))
    rejects = sum(1 for _, v in accepted if v == "REJECT")
    approves = len(accepted) - rejects
    verdict = "REJECT" if rejects > approves else "APPROVE"
    print(f"{mode_label:<22} | R2 Rejects={rejects}, Approves={approves}, BlockedFlips={rejected_flips} -> Final={verdict}")

c = rounds[0]
evaluate_debate("Unguided Sycophancy", c["r1"], c["r2_sycophant"], False)
evaluate_debate("Sycophancy Guard On", c["r1"], c["r2_sycophant"], True)
evaluate_debate("Evidence-Gated Shift", c["r1"], c["r2_evidenced"], True)
'
```

**Expected Output:**

```text
Unguided Sycophancy    | R2 Rejects=0, Approves=3, BlockedFlips=0 -> Final=APPROVE
Sycophancy Guard On    | R2 Rejects=1, Approves=2, BlockedFlips=1 -> Final=APPROVE
Evidence-Gated Shift   | R2 Rejects=2, Approves=1, BlockedFlips=0 -> Final=REJECT
```

### Workflow 3: Calibrated Weighted Consensus & High-Risk Margin Escalation

Verify how margin thresholds ($\delta_{\min} = 0.25$ standard, $0.50$ high-risk) route clear agreements, narrow splits, and high-blast-radius disagreements:

```bash
python -c '
AGENT_WEIGHTS = {"Model_A": 0.48, "Model_B": 0.34, "Model_C": 0.18}

def route_consensus(votes, delta_min=0.25, high_risk=False):
    tallies = {}
    for agent, choice in votes.items():
        tallies[choice] = tallies.get(choice, 0.0) + AGENT_WEIGHTS[agent]
    ranked = sorted(tallies.items(), key=lambda kv: kv[1], reverse=True)
    top_choice, top_score = ranked[0]
    second_score = ranked[1][1] if len(ranked) > 1 else 0.0
    margin = top_score - second_score
    if margin < delta_min or (high_risk and margin < 0.50):
        status = "ESCALATE_JUDGE_OR_HUMAN"
    else:
        status = f"DECIDED:{top_choice}"
    return top_score, margin, status

scenarios = [
    ("Clear Agreement", {"Model_A": "REFUND_DENY", "Model_B": "REFUND_DENY", "Model_C": "REFUND_ALLOW"}, False),
    ("Narrow Split (Low Risk)", {"Model_A": "PATCH_A", "Model_B": "PATCH_B", "Model_C": "PATCH_B"}, False),
    ("High-Risk Schema Drop", {"Model_A": "DROP_OK", "Model_B": "ABORT", "Model_C": "DROP_OK"}, True),
]
for label, v, risk in scenarios:
    top_s, margin, status = route_consensus(v, delta_min=0.25, high_risk=risk)
    print(f"{label:<24} | top_w={top_s:.2f} | margin={margin:.2f} | risk={str(risk):<5} -> {status}")
'
```

**Expected Output:**

```text
Clear Agreement          | top_w=0.82 | margin=0.64 | risk=False -> DECIDED:REFUND_DENY
Narrow Split (Low Risk)  | top_w=0.52 | margin=0.04 | risk=False -> ESCALATE_JUDGE_OR_HUMAN
High-Risk Schema Drop    | top_w=0.66 | margin=0.32 | risk=True  -> ESCALATE_JUDGE_OR_HUMAN
```

### Hands-On Exercises

1. **Position-Bias Mitigation Test:** Extend Workflow 3 to invoke a simulated Arbiter twice on `("PATCH_A", "PATCH_B")` and `("PATCH_B", "PATCH_A")`; if the judge switches choice purely due to prompt ordering, force `ESCALATE_HUMAN`.
2. **Brier Weight Updater:** Write a function taking `(agent_id, predicted_prob, actual_outcome)` over `50` historical tickets, computing Brier score $B_i = \frac{1}{M}\sum (p_{ij} - y_j)^2$, and normalizing consensus weights $w_i \propto \max(0.05, 1 - B_i)$.
3. **Optional Live Debate Probe:** Prompt two distinct model families (e.g., Claude vs. GPT) on a tricky SQL lock scenario with explicit `CITED:<rule>` instructions, and run a third frontier model as an anonymized pairwise Arbiter.

### Independent Challenge

A compliance team replaces single-LLM document classification with a 3-agent debate loop using three instances of the exact same open-weight `8B` model (`temperature=0.3`). Latency tripled, token spend tripled, yet false-negative misses on subtle regulatory exemptions barely moved (`14.2% -> 13.8%`). On top of that, in `6%` of cases where one agent initially flagged the exemption in Round 1, it changed its vote to `"COMPLIANT"` in Round 2. Diagnose both root causes and propose a lower-cost architecture with higher accuracy.

<details><summary>Architectural Discussion</summary>

Two textbook consensus failures caused the waste: (1) **Correlated Error Saturation**—running three copies of the same `8B` model with the same prompt yields high pairwise correlation ($\rho \ge 0.7$), capping Condorcet jury gains near zero (`14.2% -> 13.8%`) while multiplying cost `3x`; and (2) **Inter-Agent Sycophancy (`Disagreement Collapse`)**—the lone dissent in Round 1 folded under majority peer pressure in Round 2 without new evidence. Replace the 3-way homogeneous debate with a **tiered cascade**: run `1` deterministic regex/policy rule check + `1` cheap `8B` classifier + `1` heterogeneous lightweight second model *in parallel*, enforce an **evidence-required dissent preservation rule**, and route only low-margin disagreements ($\Delta < 0.30$) to a single **Frontier Arbiter** or **HITL Compliance Queue**.

</details>

---

## 6. Common Mistakes & Troubleshooting

- **Trusting LLM self-reported confidence (`"confidence": 0.99`) as voting weight:** Frontier and open models routinely emit `0.95+` confidence on hallucinations. Weight votes using out-of-sample empirical calibration (Brier score or historical precision per domain), never self-reported floats.
- **Polling the same model/prompt 3–5 times and assuming Condorcet reliability:** Correlated failures across identical weights mean $n = 5$ adds massive latency while barely improving recall. Introduce model-family diversity or orthogonal tool verification.
- **Letting a Frontier Arbiter read unrandomized `Agent_1` vs `Agent_2` labels:** LLM judges exhibit both **position bias** (favoring Option A) and **authority/verbosity bias**. Strip agent identities, randomize presentation order (`Option_A` vs `Option_B`), and swap-test narrow ties.
- **Allowing unanimous Round-2 consensus after Round-1 dissent to skip HITL on destructive actions:** Even if an agent flips legitimately, high-blast-radius changes (`DROP TABLE`, large payouts) with initial disagreement carry elevated tail risk—always trigger human review whenever Round-1 included a safety veto.

---

## 7. Operational Validation Checkpoints & Checkpoint Quiz

### Operational Validation Checkpoints

<details><summary><strong>Checkpoint 1: Why 5 homogeneous voting agents underperform expectations</strong></summary>

An engineer upgrades a support-routing agent from `1` call to a `5`-call majority vote using the exact same model and system prompt (`temp=0.4`), expecting accuracy to jump from `75%` to ~`90%` per Condorcet math. Production evals rise only to `78.1%`. Explain why.

**Validation:** Classical Condorcet scaling ($75\% \to 89.65\%$ at $n=5$) assumes **statistically independent** errors ($\rho = 0$). Calling the identical model and prompt creates high error correlation ($\rho \approx 0.65\text{–}0.75$) due to shared pretraining and prompt blind spots. Under common-shock correlation, $P_{\text{corr}} = \rho p + (1-\rho)P_{\text{ind}}$ plateaus near `78%–80%`. Achieving Condorcet gains requires heterogeneous models, orthogonal evidence slices, or deterministic tool verification.

</details>

<details><summary><strong>Checkpoint 2: Preventing sycophantic disappearance of minority security objections</strong></summary>

During multi-agent code review, `SecurityAgent` spots an SSRF vulnerability in Round 1 while `FeatureAgent` and `StyleAgent` vote `APPROVE`. After exchanging Round-2 messages, `SecurityAgent` updates its verdict to `APPROVE`, shipping the bug. How do you harden the debate protocol?

**Validation:** This is **Inter-Agent Sycophancy / Disagreement Collapse** (`arXiv:2509.23055`). Harden the protocol by enforcing an **Evidence-Gated Flip Rule**: discard any Round-2 `REJECT -> APPROVE` reversal unless it cites a newly produced deterministic verification artifact (e.g., `CITED:unit_test_ssrf_passed`), and escalate any security veto on Round 1 directly to a **Blind Frontier Arbiter** or human reviewer rather than simple peer majority override.

</details>

<details><summary><strong>Checkpoint 3: Eliminating judge bias in Arbiter resolution</strong></summary>

When `CoderA` and `CoderB` propose conflicting bug fixes, a Frontier Arbiter chooses `CoderA`'s patch `78%` of the time even on swapped test cases. Diagnose the Arbiter defect and fix it.

**Validation:** The Arbiter is suffering from **position bias** (always favoring the first slot) and/or **author/verbosity bias** (`CoderA` writes longer prose or carries a higher-status name). Strip author metadata, format proposals neutrally as randomized `Candidate_1` / `Candidate_2`, run deterministic unit tests *before* judging, and treat bidirectional swap inconsistency (`A > B` in order 1, `B > A` in order 2) as an automatic tie triggering `ESCALATE_HUMAN`.

</details>

### Checkpoint Quiz

1. Why does the Condorcet Jury Theorem break down when applied naively to $n = 3$ calls of the same LLM and prompt?
2. What is **Disagreement Collapse** in multi-agent debate, and how does an **Evidence-Gated Flip Rule** stop it?
3. Why should deterministic verification (schemas, AST linters, unit tests) always run *before* consensus voting or Frontier Judging?
4. When using a Frontier Arbiter to break ties between two proposals, what two biases must the prompt builder neutralize?
5. Under what two conditions should a Consensus Router return `ESCALATE_HUMAN` even if one option holds a weighted plurality?

<details><summary>Answers</summary>

1. Condorcet assumes **statistically independent** errors ($\rho = 0$). Same-model, same-prompt calls share pretraining biases and prompt blind spots ($\rho \approx 0.6\text{–}0.8$), causing correlated failures that plateau well below independent majority accuracy while multiplying cost.
2. **Disagreement Collapse** occurs when an agent holding a correct minority stance sycophantically conforms to confident peer consensus in later debate rounds (`arXiv:2509.23055`). An **Evidence-Gated Flip Rule** blocks Round-2 stance changes unless the flipping agent cites a newly verified deterministic check or document ID.
3. Objective failures (invalid syntax, failing tests, policy breaches) can be eliminated deterministically in milliseconds at zero LLM token cost, preventing judges from accidentally picking polished but broken proposals.
4. **Position bias** (favoring whichever candidate appears first—mitigated by randomized order and swap checks) and **author/verbosity bias** (favoring prestigious agent names or longer text—mitigated by anonymizing agent IDs and normalizing formatting).
5. (1) When the winning weighted margin $\Delta = s_1 - s_2$ falls below threshold $\delta_{\min}$, and (2) when the action touches a high-blast-radius domain (destructive DDL, financial payout) without meeting strict quorum or after any blocked sycophantic flip.

</details>

---

## Further Reading & Sources

- [Improving Factuality and Reasoning in Language Models through Multiagent Debate (Du et al., 2023)](https://arxiv.org/abs/2305.14325) — foundational Society-of-Mind multi-agent debate formulation.
- [Debate or Vote: Which Yields Better Decisions in Multi-Agent Large Language Models? (Choi et al., 2025)](https://arxiv.org/abs/2508.17536) — empirical and theoretical separation of debate dynamics vs. majority aggregation.
- [Peacemaker or Troublemaker: How Sycophancy Shapes Multi-Agent Debate (Yao et al., 2025)](https://arxiv.org/abs/2509.23055) — formal analysis of inter-agent sycophancy and Disagreement Collapse.
- [Track 10, Module 13: Human-in-the-Loop Patterns](../../10-ai-agents/13-human-in-the-loop-patterns/README.md) — escalation queue design and interrupt/approval boundaries.
- [Module 08: Shared State and Blackboards](../08-shared-state-and-blackboards/README.md) — versioned state storage where resolved consensus outcomes commit atomically.

## Next

[Module 10: Multi-Agent With LangGraph](../10-multi-agent-with-langgraph/README.md)
