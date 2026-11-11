# Module 06: Continuous Batching

> **Prerequisites:** [Module 02: Prefill and Decode Phases](../02-prefill-and-decode-phases/README.md), [Module 04: KV Cache Memory Math](../04-kv-cache-memory-math/README.md), [Module 05: Naive Batching and Its Waste](../05-naive-batching-and-its-waste/README.md).  
> **Estimated Reading Time:** 35 minutes  
> **Target Audience:** AI Backend Engineers, Inference Serving Architects, Distributed Systems & Platform Engineers

> [!TIP]
> **The Golden Rule of Continuous Batching:** Schedule at the granularity of a **single forward iteration**, never an entire request. By ejecting completed `<EOS>` sequences and admitting waiting requests on *every* decode token boundary—while flattening mixed prefill and decode tokens via **selective (ragged) batching** and bounding step tokens with `max_num_batched_tokens`—continuous batching turns `~15%–25%` static batch occupancy into **`> 95%` live slot utilization** and **`2x–10x` higher throughput** at dramatically lower tail `TTFT`.

---

## Why This Matters

In Module 05, static batching collapsed whenever `1` long request shared a batch with `7` short requests: the `7` completed slots sat dead in memory while queued arrivals waited tens of seconds for the straggler to hit `<EOS>`.

First introduced for transformers by **Orca (Yu et al., OSDI 2022)** and scaled by **vLLM** and **Sarathi-Serve**, **Continuous Batching (Iteration-Level Scheduling)** breaks that rigid lockstep barrier. Instead of waiting for every request in a batch to complete, the engine runs an event loop where **each forward pass is an atomic scheduling tick**:

- Any sequence emitting `<EOS>` (or reaching `max_tokens`) exits immediately at the end of step $t$ and releases its KV cache.
- Any queued request waiting for compute enters immediately at the start of step $t+1$—never waiting on unrelated long stragglers.
- Variable-length inputs pack into a **single flattened 2D tensor `[total_tokens, d_model]`** with **zero `<PAD>` tokens**.

However, running continuous batching safely in production introduces two critical systems questions: (1) how do you admit heavy new prefills without stalling ongoing decode streams, and (2) what happens when dynamic running requests exhaust GPU KV memory mid-generation? Mastering **chunked prefill budgets (`max_num_batched_tokens`)** and **preemption (`swap` vs. `recompute`)** separates toy schedulers from reliable serving clusters.

---

## 1. Iteration-Level Scheduling, Selective Batching & Preemption Mechanics

```mermaid
flowchart TD
    Wait["Waiting Queue (New Prompts + Preempted Seqs)"] -->|"Check KV Blocks and max_num_seqs"| Admit{"Free KV + Step Budget?"}
    Running["Running Decode Set (1 Token Each)"] -->|"Claim 1 Token/Seq First"| Budget["Compute Step Token Budget <= max_num_batched_tokens"]
    Admit -->|"Yes"| Chunk["Slice Prefill Chunk into Remaining Token Budget"]
    Admit -->|"KV Exhausted!"| Preempt["Preempt LIFO Victim (Recompute or CPU Swap)"]
    Preempt --> Wait
    Chunk --> Pack["Selective Ragged Tensor (total_tokens x d_model, Zero Padding)"]
    Running --> Pack
    Pack --> Fwd["1 Forward Pass: Fused Linear GEMM + Per-Seq Attention"]
    Fwd --> Sample["Sample Next Token per Active Sequence"]
    Sample --> CheckDone{"EOS or max_tokens?"}
    CheckDone -->|"Yes"| Eject["Stream Final Chunk and Free KV Immediately"]
    CheckDone -->|"No"| Running
```

### Iteration-Level Scheduling vs. Request-Level Lockstep

Consider `4` slots running variable requests (`R1=2` tokens, `R2=6` tokens, `R3=3` tokens, `R4=4` tokens) with `R5` and `R6` waiting in queue:

| Step | Static Batching (Locked Until Step 6) | Continuous Iteration-Level Batching |
| :---: | :--- | :--- |
| **Step 1** | `[R1, R2, R3, R4]` | `[R1, R2, R3, R4]` |
| **Step 2** | `[R1(EOS), R2, R3, R4]` | `[R1(EOS->Exit), R2, R3, R4]` -> Admit `R5` |
| **Step 3** | `[IDLE, R2, R3(EOS), R4]` | `[R5, R2, R3(EOS->Exit), R4]` -> Admit `R6` |
| **Step 4** | `[IDLE, R2, IDLE, R4(EOS)]` | `[R5, R2, R6, R4(EOS->Exit)]` |
| **Step 5** | `[IDLE, R2, IDLE, IDLE]` | `[R5, R2, R6, ...]` (`0` idle bubbles!) |
| **Step 6** | `[IDLE, R2(EOS), IDLE, IDLE]` -> Finally admits `R5, R6` | `[R5, R2(EOS->Exit), R6, ...]` (`R5` nearly done!) |

### Why Selective (Ragged) Batching Eliminates Padding

How does a single GPU forward pass mix a `500`-token prefill chunk from `R5` alongside `1`-token decode vectors from `R2` and `R6` without rectangular `[B, L_max]` padding?

Yu et al. (*Orca*, OSDI 2022) observed that **90%+ of transformer compute is token-independent**: `LayerNorm`, `QKV` projections, `O` projections, `SwiGLU/MLP` blocks, and residual additions treat every token identically! By concatenating all $N_{\text{step}}$ active tokens across all sequences into a **ragged 2D tensor of shape `[N_step, d_model]`**, every linear layer executes one dense, padding-free GEMM! Only the **Attention operator** splits tokens by sequence metadata (`seq_start_offsets` / PagedAttention `block_tables`) so each token attends strictly to its own KV history.

### Interacting with Chunked Prefill (`max_num_batched_tokens`)

Naive Orca-style continuous batching still hits a subtle stall: if a newly admitted request carries a `16,000`-token prompt, injecting all `16,000` tokens into one step freezes all active decode streams for hundreds of milliseconds (`p99 ITL` spike, Module 02). Modern schedulers (Sarathi-Serve / vLLM V1) enforce a strict per-iteration token ceiling **`max_num_batched_tokens`** ($M$, e.g., `512`–`2,048`):

$$M_{\text{step}} = \underbrace{|B_{\text{decode}}| \times 1}_{\text{1 token per active decode seq}} + \underbrace{\sum_{j} c_{j,\text{prefill}}}_{\text{bounded prefill chunk(s)}} \le \text{max\_num\_batched\_tokens}$$

1. **Decode First:** Every currently running decode request reserves `1` token first (guaranteeing uninterrupted token streaming and bounded `ITL`).
2. **Piggybacked Prefill Chunks:** Remaining budget `M - |B_decode|` pulls a slice of waiting prompt tokens, raising the linear GEMM arithmetic intensity across the Hardware Ridge Point (Module 01) **at zero `ITL` penalty**!

### Preemption Under KV Memory Pressure: `Swap` vs. `Recompute`

Because output lengths remain unknown at admission, `running` requests that all survive longer than expected can collectively fill 100% of GPU KV blocks mid-generation. When step $t+1$ needs `1` new KV block per active sequence and `free_blocks == 0`, the scheduler must **preempt** a victim:

1. **Victim Selection Policy (`LIFO`):** Modern schedulers evict the **most recently admitted request** (Last-In, First-Out). Evicting the newest sequence loses the fewest generated tokens, avoids starving long-running requests that are close to `<EOS>`, and guarantees forward progress.
2. **Eviction Mode A — `Recompute` (vLLM Default):** Immediately drop the victim's GPU KV blocks, append its already-generated tokens onto its prompt (`new_prompt = orig_prompt + output_so_far`), and push it back to `waiting`. When KV space opens, vLLM re-prefills it smoothly via chunked prefill. **Why `Recompute` usually beats `Swap`:** With chunked prefill and fast Tensor Cores (`989 TFLOP/s` H100), re-prefilling is amortized into spare prefill-budget slots without requiring pinned host RAM (`swap_space`), async PCIe block-table synchronization, or PCIe bus contention—and if **Automatic Prefix Caching** is enabled, shared prompt prefix blocks already sitting in cache are reused without recomputing!
3. **Eviction Mode B — `Swap` (CPU Offload):** Copy the victim's KV blocks asynchronously over PCIe into pinned host DRAM (`--swap-space`, e.g., `4 GiB`), freeing GPU blocks until space returns. **Trade-off:** While PCIe Gen5 (`~40–50 GB/s`) can move a single `640 MiB` (`2K` 70B) state faster than recomputing `70B` FLOPs on slow/saturated compute, `Swap` consumes gigabytes of pinned host RAM, competes with CPU-GPU weight/token PCIe transfers, and creates severe **PCIe thrashing** if preemptions occur repeatedly under sustained overload.

### Quantitative Throughput Speedup Over Static Batching

Under realistic variable-length workloads, continuous batching removes both $\eta_{\text{decode}}$ straggler bubbles and `max_queue_delay` waits while elevating sustained active concurrency $B_{\text{eff}}$:

$$\text{Speedup}_{\text{cont}} \approx \frac{\text{Throughput}_{\text{cont}}}{\text{Throughput}_{\text{static}}} \propto \frac{\eta_{\text{cont}}}{\eta_{\text{static}}} \cdot \frac{B_{\text{cont}}}{B_{\text{static}}}$$

In practice, eliminating straggler idle bubbles alone unlocks **`2x–4x`** throughput gains (and when paired with PagedAttention's higher concurrency $B_{\text{cont}}$, delivers **`4x–10x`** end-to-end throughput over naive static serving—and up to `36.9x` in Orca's extreme output-skew benchmarks).

---

## 2. Systematic Comparison Matrix: LLM Batch Scheduling Strategies

| Scheduler Architecture | Scheduling Boundary | Padding / Ragged | Prefill Interference | Preemption Support | Typical Throughput Gain vs. Static | Best Production Fit |
| :--- | :--- | :--- | :--- | :--- | :---: | :--- |
| **Static Request-Level Batching** | Whole request (until max `<EOS>`) | Left-padded `[B, L_max]` | Stalls whole queue | None (OOM or rigid admission cap) | `1.0x` (Baseline) | Offline uniform fixed-length scoring only |
| **Orca Iteration-Level (No Chunking)** | Every forward pass | Ragged `[sum(tok), d]` | Unchunked prefill spikes `ITL` | Limited / contiguous slabs | `2x–5x` (up to `36.9x` high skew) | Early continuous engines |
| **vLLM V0 Prefill-Prioritizing** | Every forward pass | Ragged + Paged KV | Prefill runs before decode (`ITL` spikes on bursts) | `Recompute` or `Swap` (LIFO) | `4x–10x` | High-throughput batch / relaxed `ITL` APIs |
| **Chunked Prefill + Continuous (`Sarathi` / vLLM V1)** | Every forward pass (`<= M` tokens) | Ragged + Paged KV | **Zero HoL stalls** (`decode` claims budget first) | **`Recompute` (LIFO + Prefix Cache)** | **`5x–12x` SLA Goodput** | Interactive chat, RAG, streaming voice & agents |

---

## 3. Production War Story Post-Mortem: The PCIe Swap Thrashing Spiral

| Field | Incident Details |
| :--- | :--- |
| **Severity** | **SEV-1** (1,800 ms `p99 ITL` Freeze, CPU Memory Exhaustion & Pod OOMKill) |
| **Detection / Resolution Time** | Detected 12 minutes into afternoon batch surge via `vllm:num_preemptions_total` & `ITL p99` alerts / Mitigated in 25 minutes |
| **Impact** | Live voice/streaming agents disconnected on `500 ms` token timeout; host nodes OOMKilled across `3` inference pods (**\$1,900** failed SLA traffic) |

### What Happened

An AI platform team deployed `Llama-3-70B` (`TP=4`) with continuous batching configured with overly permissive admission (`--max-num-seqs 256`), `--preemption-mode swap`, `--swap-space 8`, and chunked prefill **disabled**.

During normal traffic (`35` users averaging `2,000` tokens), KV usage stayed around `55%` and `TPOT` held steady at `26 ms`. At 14:00 UTC, an automated legal-analysis pipeline burst `180` concurrent `6,000`-token requests onto the same cluster. Because `max_num_seqs = 256` let the scheduler admit `110+` simultaneous requests aggressively before they had generated long outputs, KV pool utilization hit `100%` within `8` seconds as generated responses grew!

With `--preemption-mode swap`, the engine desperately began copying `1.5 GiB` victim states back and forth across PCIe into CPU RAM every few steps. Worse, whenever a swapped-out request briefly swapped back in, another active request hit `100%` KV and triggered a *new* swap (**preemption thrashing**). PCIe transfers blocked CUDA streams, `p99 ITL` exploded to **`1,840 ms`**, and when multiple worker processes pinned host buffers beyond container RAM limits, Linux OOMKiller terminated the pods.

```mermaid
sequenceDiagram
    autonumber
    actor Burst as 180 Burst Requests
    participant Sched as Scheduler (max_num_seqs=256, swap)
    participant GPU as GPU HBM (100% Full)
    participant CPU as Host RAM (--swap-space=8G)

    Burst->>Sched: Admits 115 requests while prompts are short
    loop Decode Steps Grow Contexts
        Sched->>GPU: Allocate KV blocks for 115 active streams
    end
    Note over GPU: KV reaches 100% capacity mid-generation
    Sched->>GPU: Preempt R115 -> DMA copy 1.5 GiB across PCIe
    GPU->>CPU: Swap Out stalls PCIe bus (ITL spikes to 1.8s)
    Note over Sched,CPU: Swapping R115 back in forces R114 to swap out (Thrashing)
    CPU-->>Sched: Host cgroup memory limit exceeded -> Linux OOMKill (SEV-1)
```

### Root Cause Analysis

- **Over-Aggressive `max_num_seqs = 256`:** Admitting `115+` sequences left zero slack for autoregressive output growth (`L_o`), practically guaranteeing `100%` KV saturation mid-decode.
- **Swap Thrashing Without Backpressure:** Using `--preemption-mode swap` under sustained KV oversubscription bounced blocks endlessly across PCIe, compounding `ITL` latency and host RAM pressure.

### The Fix & Architectural Hardening

- **Switch to `recompute` + Chunked Prefill:** Enabled chunked prefill (`--max-num-batched-tokens 1024`) and switched to `--preemption-mode recompute` so rare preemptions re-queue cleanly without saturating PCIe or pinning host RAM.
- **Bound Concurrency via Module 04's $B_{\max}$:** Reduced `--max-num-seqs 64` (aligned with `p90` request lengths) and configured API gateway load shedding (`HTTP 429`) whenever `vllm:num_requests_waiting > 32` or `vllm:kv_cache_usage_perc > 0.88`.
- **Alerting on Preemption Rate:** Added a PagerDuty alert on `rate(vllm:num_preemptions_total[1m]) > 2` so ops catches KV exhaustion immediately.

---

## 4. Multi-Language Production Implementation: Iteration-Level Continuous Scheduler Engine

Below is a clean, deterministic **Iteration-Level Continuous Scheduler with Decode-First Chunked Budget & LIFO Preemption** across **Go**, **TypeScript**, **Python**, and **C#**. It models waiting queues, step token budgets (`max_num_batched_tokens`), `max_num_seqs`, immediate `<EOS>` ejection, and LIFO KV preemption.

````carousel

```go
package scheduler

import "errors"

type SequenceState struct {
	ID              string
	RemainingPrefill int
	RemainingDecode int
	AllocatedKV     int
}

type StepPlan struct {
	DecodeIDs     []string
	PrefillChunks map[string]int
	PreemptedIDs  []string
	CompletedIDs  []string
	StepTokens    int
}

type ContinuousScheduler struct {
	MaxNumBatchedTokens int
	MaxNumSeqs          int
	MaxKVTokens         int
	UsedKVTokens        int
	Waiting             []*SequenceState
	Running             []*SequenceState
}

func NewContinuousScheduler(maxBatchedTokens, maxSeqs, maxKV int) (*ContinuousScheduler, error) {
	if maxBatchedTokens <= 0 || maxSeqs <= 0 || maxKV <= 0 {
		return nil, errors.New("scheduler capacities must be positive")
	}
	return &ContinuousScheduler{
		MaxNumBatchedTokens: maxBatchedTokens,
		MaxNumSeqs:          maxSeqs,
		MaxKVTokens:         maxKV,
	}, nil
}

func (s *ContinuousScheduler) Enqueue(seq *SequenceState) {
	s.Waiting = append(s.Waiting, seq)
}

func (s *ContinuousScheduler) Step() StepPlan {
	plan := StepPlan{PrefillChunks: make(map[string]int)}
	budget := s.MaxNumBatchedTokens

	// 1. Protect active decode streams (1 token each); LIFO preempt if KV full
	kept := make([]*SequenceState, 0, len(s.Running))
	for _, seq := range s.Running {
		if budget == 0 {
			break
		}
		for s.UsedKVTokens+1 > s.MaxKVTokens && len(kept) > 0 {
			victim := kept[len(kept)-1]
			kept = kept[:len(kept)-1]
			s.UsedKVTokens -= victim.AllocatedKV
			victim.RemainingPrefill += victim.AllocatedKV // Recompute on re-admit
			victim.AllocatedKV = 0
			s.Waiting = append([]*SequenceState{victim}, s.Waiting...)
			plan.PreemptedIDs = append(plan.PreemptedIDs, victim.ID)
		}
		if s.UsedKVTokens+1 <= s.MaxKVTokens {
			s.UsedKVTokens++
			seq.AllocatedKV++
			seq.RemainingDecode--
			budget--
			plan.StepTokens++
			plan.DecodeIDs = append(plan.DecodeIDs, seq.ID)
			if seq.RemainingDecode <= 0 {
				s.UsedKVTokens -= seq.AllocatedKV
				plan.CompletedIDs = append(plan.CompletedIDs, seq.ID)
			} else {
				kept = append(kept, seq)
			}
		}
	}
	s.Running = kept

	// 2. Admit waiting prefill chunks into remaining step token budget
	for len(s.Waiting) > 0 && budget > 0 && len(s.Running) < s.MaxNumSeqs {
		head := s.Waiting[0]
		freeKV := s.MaxKVTokens - s.UsedKVTokens
		if freeKV <= 0 {
			break
		}
		chunk := head.RemainingPrefill
		if chunk > budget {
			chunk = budget
		}
		if chunk > freeKV {
			chunk = freeKV
		}
		if chunk <= 0 {
			break
		}
		head.RemainingPrefill -= chunk
		head.AllocatedKV += chunk
		s.UsedKVTokens += chunk
		budget -= chunk
		plan.StepTokens += chunk
		plan.PrefillChunks[head.ID] = chunk

		if head.RemainingPrefill == 0 {
			s.Waiting = s.Waiting[1:]
			s.Running = append(s.Running, head)
		} else {
			break // Partial chunk scheduled; head stays at front for next step
		}
	}
	return plan
}
```

<!-- slide -->

```typescript
export interface SchedSeq {
  readonly id: string;
  remainingPrefill: number;
  remainingDecode: number;
  allocatedKvTokens: number;
}

export interface IterationSummary {
  readonly stepTokens: number;
  readonly decodeIds: readonly string[];
  readonly prefillChunks: ReadonlyArray<{ id: string; tokens: number }>;
  readonly preemptedIds: readonly string[];
  readonly completedIds: readonly string[];
}

export class ContinuousBatchScheduler {
  private readonly waiting: SchedSeq[] = [];
  private running: SchedSeq[] = [];
  private usedKv = 0;

  constructor(
    private readonly maxBatchedTokens: number,
    private readonly maxNumSeqs: number,
    private readonly maxKvTokens: number,
  ) {
    if (maxBatchedTokens <= 0 || maxNumSeqs <= 0 || maxKvTokens <= 0) {
      throw new RangeError("Scheduler capacities must be strictly positive");
    }
  }

  enqueue(seq: SchedSeq): void {
    this.waiting.push(seq);
  }

  step(): IterationSummary {
    let budget = this.maxBatchedTokens;
    const decodeIds: string[] = [];
    const preemptedIds: string[] = [];
    const completedIds: string[] = [];
    const prefillChunks: Array<{ id: string; tokens: number }> = [];
    const nextRunning: SchedSeq[] = [];
    let stepTokens = 0;

    for (const seq of this.running) {
      if (budget <= 0) break;
      while (this.usedKv + 1 > this.maxKvTokens && nextRunning.length > 0) {
        const victim = nextRunning.pop()!;
        this.usedKv -= victim.allocatedKvTokens;
        victim.remainingPrefill += victim.allocatedKvTokens;
        victim.allocatedKvTokens = 0;
        this.waiting.unshift(victim);
        preemptedIds.push(victim.id);
      }
      if (this.usedKv + 1 <= this.maxKvTokens) {
        this.usedKv += 1;
        seq.allocatedKvTokens += 1;
        seq.remainingDecode -= 1;
        budget -= 1;
        stepTokens += 1;
        decodeIds.push(seq.id);
        if (seq.remainingDecode <= 0) {
          this.usedKv -= seq.allocatedKvTokens;
          completedIds.push(seq.id);
        } else {
          nextRunning.push(seq);
        }
      }
    }
    this.running = nextRunning;

    while (this.waiting.length > 0 && budget > 0 && this.running.length < this.maxNumSeqs) {
      const head = this.waiting[0];
      const freeKv = this.maxKvTokens - this.usedKv;
      if (freeKv <= 0) break;
      const take = Math.min(head.remainingPrefill, budget, freeKv);
      if (take <= 0) break;

      head.remainingPrefill -= take;
      head.allocatedKvTokens += take;
      this.usedKv += take;
      budget -= take;
      stepTokens += take;
      prefillChunks.push({ id: head.id, tokens: take });

      if (head.remainingPrefill === 0) {
        this.waiting.shift();
        this.running.push(head);
      } else {
        break;
      }
    }

    return { stepTokens, decodeIds, prefillChunks, preemptedIds, completedIds };
  }
}
```

<!-- slide -->

```python
"""
continuous_scheduler.py
Iteration-level scheduler with Sarathi-style chunked prefill & LIFO recompute preemption.
"""
from collections import deque
from dataclasses import dataclass


@dataclass
class ActiveSeq:
    seq_id: str
    rem_prefill: int
    rem_decode: int
    kv_tokens: int = 0


@dataclass(frozen=True)
class StepTelemetry:
    step_tokens: int
    decode_ids: tuple[str, ...]
    prefill_chunks: tuple[tuple[str, int], ...]
    preempted_ids: tuple[str, ...]
    completed_ids: tuple[str, ...]


class ContinuousScheduler:
    def __init__(self, max_batched_tokens: int = 512, max_num_seqs: int = 16, max_kv_tokens: int = 16384):
        if max_batched_tokens <= 0 or max_num_seqs <= 0 or max_kv_tokens <= 0:
            raise ValueError("All scheduler limits must be positive")
        self.max_batched_tokens = max_batched_tokens
        self.max_num_seqs = max_num_seqs
        self.max_kv_tokens = max_kv_tokens
        self.used_kv = 0
        self.waiting: deque[ActiveSeq] = deque()
        self.running: list[ActiveSeq] = []

    def enqueue(self, seq: ActiveSeq) -> None:
        self.waiting.append(seq)

    def step(self) -> StepTelemetry:
        budget = self.max_batched_tokens
        decode_ids, preempted_ids, completed_ids, prefill_chunks = [], [], [], []
        kept: list[ActiveSeq] = []
        step_tokens = 0

        # 1. Schedule active decodes first; evict LIFO victim on KV saturation
        for seq in self.running:
            if budget <= 0:
                break
            while self.used_kv + 1 > self.max_kv_tokens and kept:
                victim = kept.pop()
                self.used_kv -= victim.kv_tokens
                victim.rem_prefill += victim.kv_tokens
                victim.kv_tokens = 0
                self.waiting.appendleft(victim)
                preempted_ids.append(victim.seq_id)
            if self.used_kv + 1 <= self.max_kv_tokens:
                self.used_kv += 1
                seq.kv_tokens += 1
                seq.rem_decode -= 1
                budget -= 1
                step_tokens += 1
                decode_ids.append(seq.seq_id)
                if seq.rem_decode <= 0:
                    self.used_kv -= seq.kv_tokens
                    completed_ids.append(seq.seq_id)
                else:
                    kept.append(seq)
        self.running = kept

        # 2. Fill remaining step token budget with chunked prefill slices
        while self.waiting and budget > 0 and len(self.running) < self.max_num_seqs:
            head = self.waiting[0]
            free_kv = self.max_kv_tokens - self.used_kv
            take = min(head.rem_prefill, budget, free_kv)
            if take <= 0:
                break
            head.rem_prefill -= take
            head.kv_tokens += take
            self.used_kv += take
            budget -= take
            step_tokens += take
            prefill_chunks.append((head.seq_id, take))
            if head.rem_prefill == 0:
                self.waiting.popleft()
                self.running.append(head)
            else:
                break

        return StepTelemetry(
            step_tokens=step_tokens,
            decode_ids=tuple(decode_ids),
            prefill_chunks=tuple(prefill_chunks),
            preempted_ids=tuple(preempted_ids),
            completed_ids=tuple(completed_ids),
        )
```

<!-- slide -->

```csharp
using System;
using System.Collections.Generic;

namespace GenAI.Inference.Scheduling;

public sealed class ScheduledSequence
{
    public required string Id { get; init; }
    public int RemainingPrefill { get; set; }
    public int RemainingDecode { get; set; }
    public int AllocatedKvTokens { get; set; }
}

public sealed record StepResult(
    int StepTokens,
    IReadOnlyList<string> DecodeIds,
    IReadOnlyList<(string Id, int Tokens)> PrefillChunks,
    IReadOnlyList<string> PreemptedIds,
    IReadOnlyList<string> CompletedIds);

public sealed class ContinuousBatchScheduler
{
    private readonly int _maxBatchedTokens;
    private readonly int _maxNumSeqs;
    private readonly int _maxKvTokens;
    private readonly LinkedList<ScheduledSequence> _waiting = new();
    private List<ScheduledSequence> _running = new();
    private int _usedKv;

    public ContinuousBatchScheduler(int maxBatchedTokens, int maxNumSeqs, int maxKvTokens)
    {
        if (maxBatchedTokens <= 0 || maxNumSeqs <= 0 || maxKvTokens <= 0)
            throw new ArgumentOutOfRangeException(nameof(maxBatchedTokens), "Limits must be positive.");
        _maxBatchedTokens = maxBatchedTokens;
        _maxNumSeqs = maxNumSeqs;
        _maxKvTokens = maxKvTokens;
    }

    public void Enqueue(ScheduledSequence seq) => _waiting.AddLast(seq);

    public StepResult Step()
    {
        int budget = _maxBatchedTokens;
        int stepTokens = 0;
        var decodeIds = new List<string>();
        var preemptedIds = new List<string>();
        var completedIds = new List<string>();
        var prefillChunks = new List<(string, int)>();
        var kept = new List<ScheduledSequence>();

        foreach (var seq in _running)
        {
            if (budget <= 0) break;
            while (_usedKv + 1 > _maxKvTokens && kept.Count > 0)
            {
                var victim = kept[^1];
                kept.RemoveAt(kept.Count - 1);
                _usedKv -= victim.AllocatedKvTokens;
                victim.RemainingPrefill += victim.AllocatedKvTokens;
                victim.AllocatedKvTokens = 0;
                _waiting.AddFirst(victim);
                preemptedIds.Add(victim.Id);
            }
            if (_usedKv + 1 <= _maxKvTokens)
            {
                _usedKv++;
                seq.AllocatedKvTokens++;
                seq.RemainingDecode--;
                budget--;
                stepTokens++;
                decodeIds.Add(seq.Id);
                if (seq.RemainingDecode <= 0)
                {
                    _usedKv -= seq.AllocatedKvTokens;
                    completedIds.Add(seq.Id);
                }
                else
                {
                    kept.Add(seq);
                }
            }
        }
        _running = kept;

        while (_waiting.Count > 0 && budget > 0 && _running.Count < _maxNumSeqs)
        {
            var head = _waiting.First!.Value;
            int freeKv = _maxKvTokens - _usedKv;
            int take = Math.Min(head.RemainingPrefill, Math.Min(budget, freeKv));
            if (take <= 0) break;

            head.RemainingPrefill -= take;
            head.AllocatedKvTokens += take;
            _usedKv += take;
            budget -= take;
            stepTokens += take;
            prefillChunks.Add((head.Id, take));

            if (head.RemainingPrefill == 0)
            {
                _waiting.RemoveFirst();
                _running.Add(head);
            }
            else
            {
                break;
            }
        }

        return new StepResult(stepTokens, decodeIds, prefillChunks, preemptedIds, completedIds);
    }
}
```

````

---

## 5. Practical Hands-On Verification CLI Workflows

Run these deterministic Python 3.13 verification scripts offline—no GPUs or external packages required.

### Workflow 1: Compare Static vs. Continuous Batching on Skewed Stream Arrivals

Simulate `24` requests (`B_max=8`) where `1` in `6` requests outputs `384` tokens vs. `32` tokens for standard queries, measuring throughput, slot occupancy, and tail `TTFT`:

```bash
python -c '
workload = [
    (i, (i // 4) * 50, 256 + (i % 4) * 128, 32 if i % 6 != 5 else 384)
    for i in range(24)
]

def sim_static(reqs, max_b=8, step_ms=25.0, prefill_ms=40.0):
    t = 0.0
    idx = 0
    ttfts = []
    total_slots = 0
    live_out = 0
    while idx < len(reqs):
        batch = reqs[idx:idx + max_b]
        idx += max_b
        batch_start = max(t, max(r[1] for r in batch))
        max_o = max(r[3] for r in batch)
        first_tok_t = batch_start + prefill_ms
        batch_end = first_tok_t + max_o * step_ms
        for _, arr, _, _ in batch:
            ttfts.append(first_tok_t - arr)
        total_slots += len(batch) * max_o
        live_out += sum(r[3] for r in batch)
        t = batch_end
    wall_s = t / 1000.0
    return wall_s, live_out / wall_s, 100.0 * live_out / total_slots, sum(ttfts) / len(ttfts), max(ttfts)

def sim_continuous(reqs, max_b=8, step_ms=25.0, chunk_prefill_ms=10.0):
    t = 0.0
    waiting = list(reqs)
    running = []
    ttfts = []
    live_out = 0
    total_slots = 0
    while waiting or running:
        admitted_new = False
        while waiting and len(running) < max_b and waiting[0][1] <= t:
            rid, arr, p_l, o_l = waiting.pop(0)
            running.append([rid, arr, p_l, o_l, None])
            admitted_new = True
        if not running:
            t = waiting[0][1]
            continue
        t += step_ms + (chunk_prefill_ms if admitted_new else 0.0)
        total_slots += len(running) if not waiting else max_b
        next_running = []
        for item in running:
            if item[4] is None:
                item[4] = t
                ttfts.append(t - item[1])
            item[3] -= 1
            live_out += 1
            if item[3] > 0:
                next_running.append(item)
        running = next_running
    wall_s = t / 1000.0
    return wall_s, live_out / wall_s, 100.0 * live_out / total_slots, sum(ttfts) / len(ttfts), max(ttfts)

s_wall, s_tps, s_util, s_ttft, s_max = sim_static(workload)
c_wall, c_tps, c_util, c_ttft, c_max = sim_continuous(workload)
print(f"Static Batching     | wall={s_wall:6.2f}s | out_tps={s_tps:6.1f} tok/s | slot_util={s_util:5.1f}% | mean_TTFT={s_ttft:7.1f}ms | max_TTFT={s_max:7.1f}ms")
print(f"Continuous Batching | wall={c_wall:6.2f}s | out_tps={c_tps:6.1f} tok/s | slot_util={c_util:5.1f}% | mean_TTFT={c_ttft:7.1f}ms | max_TTFT={c_max:7.1f}ms")
print(f"Gain: {c_tps/s_tps:.2f}x throughput | {s_max/c_max:.2f}x lower tail TTFT")
'
```

**Expected Output:**

```text
Static Batching     | wall= 28.97s | out_tps=  75.1 tok/s | slot_util= 23.6% | mean_TTFT= 9605.0ms | max_TTFT=19170.0ms
Continuous Batching | wall= 12.13s | out_tps= 179.4 tok/s | slot_util= 99.6% | mean_TTFT=  894.2ms | max_TTFT= 2305.0ms
Gain: 2.39x throughput | 8.32x lower tail TTFT
```

Slot utilization climbs from **`23.6%` to `99.6%`**, total throughput jumps **`2.39x`**, and tail `TTFT` plunges **`8.32x`** (`19.17s -> 2.30s`)—without adding a single byte of VRAM or extra GPU FLOPs!

### Workflow 2: Verify Decode-Maximal Chunked Prefill Budget Allocation

Trace how a `max_num_batched_tokens = 512` scheduler allocates `12` running decode tokens first and slices a `1,200`-token waiting prefill into the exact remaining `500`-token budget:

```bash
python -c '
def schedule_step(waiting_prompts, running_decodes, max_batched_tokens=512, max_num_seqs=16):
    decode_tokens = min(len(running_decodes), max_num_seqs)
    rem_budget = max_batched_tokens - decode_tokens
    prefill_chunks = []
    for req_id, rem_prompt in waiting_prompts:
        if rem_budget <= 0 or (decode_tokens + len(prefill_chunks)) >= max_num_seqs:
            break
        take = min(rem_prompt, rem_budget)
        prefill_chunks.append((req_id, take, rem_prompt - take))
        rem_budget -= take
    total_tokens = decode_tokens + sum(c[1] for c in prefill_chunks)
    return decode_tokens, prefill_chunks, total_tokens

d_tok, p_chunks, tot = schedule_step([("W1", 1200), ("W2", 300)], [f"D{i}" for i in range(12)], max_batched_tokens=512, max_num_seqs=16)
print(f"Step Budget=512 | decode_tokens={d_tok} | prefill_chunks={p_chunks} | total_step_tokens={tot}")
'
```

**Expected Output:**

```text
Step Budget=512 | decode_tokens=12 | prefill_chunks=[('W1', 500, 700)] | total_step_tokens=512
```

### Workflow 3: Trace LIFO Victim Preemption Under KV Memory Saturation

Simulate `4` running sequences consuming `1,990 / 2,000` KV slots when `250` additional token slots are needed—verifying that LIFO evicts newest request `R4` while protecting older nearly-finished `R1`..`R3`:

```bash
python -c '
kv_capacity = 2000
running_reqs = [
    {"id": "R1", "kv_used": 620, "rem": 10},
    {"id": "R2", "kv_used": 580, "rem": 40},
    {"id": "R3", "kv_used": 450, "rem": 80},
    {"id": "R4", "kv_used": 340, "rem": 150},
]
total_used = sum(r["kv_used"] for r in running_reqs)
before_ids = [r["id"] for r in running_reqs]
print(f"Before step: running={before_ids} | KV={total_used}/{kv_capacity}")
preempted = []
needed_extra = 250
while (total_used + needed_extra) > kv_capacity and running_reqs:
    victim = running_reqs.pop()
    total_used -= victim["kv_used"]
    preempted.append((victim["id"], victim["kv_used"]))
after_ids = [r["id"] for r in running_reqs]
print(f"Preempted (LIFO): {preempted} | Remaining running={after_ids} | Freed_KV={total_used}/{kv_capacity}")
'
```

**Expected Output:**

```text
Before step: running=['R1', 'R2', 'R3', 'R4'] | KV=1990/2000
Preempted (LIFO): [('R4', 340)] | Remaining running=['R1', 'R2', 'R3'] | Freed_KV=1650/2000
```

### Hands-On Exercises

1. **Test FIFO vs. LIFO Preemption Starvation:** Modify Workflow 3 to evict `running_reqs.pop(0)` (FIFO—oldest request `R1`) instead of LIFO (`R4`). Notice how evicting `R1` wastes `620` tokens when `R1` was just `10` tokens from `<EOS>`, and notice that if incoming traffic stays heavy, `R1` could be repeatedly evicted without ever completing (**starvation**)!
2. **Increase Skew (`24` vs `1,024` tokens) in Workflow 1:** Change `384` in Workflow 1 to `1024` (`1` in `6` requests) and re-run. Observe continuous batching's speedup climb from `2.39x` to **`~4.0x+`** as static batching's straggler bubble worsens.
3. **Optional Live Preemption Stress Test (Requires GPU + vLLM):** Launch `vllm serve` with constrained `--max-num-seqs 64 --gpu-memory-utilization 0.45`, send `40` concurrent requests with `max_tokens=1024`, and curl `/metrics` to watch `vllm:num_preemptions_total` increment live.

### Independent Challenge

A production `Llama-3-8B` service (`80 GiB` H100, `BF16` + Chunked Prefill) experiences random late-evening traffic bursts where `30` users simultaneously open `20,000`-token multi-turn coding sessions (`600,000` total KV tokens demanded > `450,887` GPU token capacity). Compare how three scheduler configurations behave during the burst: (A) `max_num_seqs=128` + `swap` (`--swap-space 4`), (B) `max_num_seqs=128` + `recompute`, and (C) `max_num_seqs=32` + `recompute` + admission queue cap. Which configuration avoids cascading `ITL` collapse, and why?

<details><summary>Architectural Discussion</summary>

- **Config A (`max_num_seqs=128`, `swap`, `4 GiB` swap):** Fails catastrophically. `4 GiB` CPU swap holds only `~32,768` tokens (`1.6` sequences worth!), quickly exhausting swap space and triggering repeated PCIe DMA copies (`p99 ITL` spikes `10x–40x`) followed by recompute fallback or OOM.
- **Config B (`max_num_seqs=128`, `recompute`):** Avoids host RAM blowup, *but* admitting too many sequences early (`128` concurrent) causes frequent mid-stream LIFO preemptions as sequences grow toward `20K`, wasting prefill FLOPs re-computing evicted contexts (**livelock risk** under heavy saturation).
- **Config C (`max_num_seqs=32`, `recompute` + admission gate):** Optimal. Bounding `running` at `32` (`<= 24` at `20K` via KV-aware block reservation or `max_num_seqs=24–32`) prevents over-admitting sequences doomed to thrash, while waiting requests wait cleanly in `waiting` *before* allocating GPU blocks—so active streams sustain smooth `ITL` and **zero preemption churn**.

</details>

---

## 6. Common Mistakes & Troubleshooting

- **Enabling continuous batching (`--max-num-seqs 256`) without chunked prefill:** Every newly admitted `8K–16K` prompt runs atomically and freezes all active decode streams (`ITL` spikes of `300–1,000+ ms`). Enable `--enable-chunked-prefill` with `--max-num-batched-tokens 512..2048`.
- **Using FIFO preemption instead of LIFO:** Evicting the oldest sequence throws away the most GPU work and risks infinite starvation under heavy load. Always evict newest-admitted sequences (LIFO) so oldest sequences drain quickly and release blocks permanently.
- **Blindly leaving `--preemption-mode swap` under tight KV memory:** Swapping multi-gigabyte KV states back and forth over PCIe competes with tensor traffic and pins host DRAM. Prefer `recompute` paired with chunked prefill + Automatic Prefix Caching, and size `max_num_seqs` conservatively.
- **Ignoring `vllm:num_preemptions_total` in Grafana:** A healthy continuous-batching cluster has **`0` preemptions/min** during steady state. Rising preemptions mean your KV pool is oversubscribed and wasting compute re-prefilling evicted requests!

---

## 7. Operational Validation Checkpoints & Checkpoint Quiz

### Operational Validation Checkpoints

<details><summary><strong>Checkpoint 1: Explaining Zero-Padding Selective Batching Across Mixed Phases</strong></summary>

An engineer asks: "If Request A is prefilling `500` new tokens while Request B is decoding `1` token, doesn't continuous batching still have to pad Request B with `499` `<PAD>` tokens so they share a batch matrix?" Explain how selective (ragged) batching avoids padding completely.

**Validation:** Linear projections (`QKV`, `O`, `MLP`) and LayerNorm operate independently per token, so the engine concatenates `500 + 1 = 501` tokens into a **flat 2D ragged tensor `[501, d_model]`** with **zero `<PAD>` tokens**. Only the **Attention** kernel reads per-sequence offset/block-table metadata so Request A's `500` tokens attend causally within A while Request B's `1` token attends solely to B's cached KV blocks.

</details>

<details><summary><strong>Checkpoint 2: Diagnosing Decode `p99 ITL` Jitter After Enabling Continuous Batching</strong></summary>

After migrating from static batching to continuous batching without chunked prefill, overall throughput triples (`3.1x`), yet `p99 ITL` suddenly spikes to `650 ms` whenever new long RAG requests arrive. Identify the cause and exact flag fix.

**Validation:** Whenever a long `12K`–`16K` queued prompt is admitted at an iteration boundary without chunked prefill, its full compute-bound prefill runs before active decode sequences can take their next token step—causing **prefill-induced decode stalls**. Enabling **chunked prefill** (`--enable-chunked-prefill` and `--max-num-batched-tokens 1024`) guarantees all running decode tokens take `1` slot first and bounds prefill work per step.

</details>

<details><summary><strong>Checkpoint 3: Resolving a Continuous-Batching KV Preemption Livelock</strong></summary>

During a traffic spike, `vllm:kv_cache_usage_perc` hits `99%`, `vllm:num_preemptions_total` climbs at `40/min`, and `TTFT` shoots past `15s` even though GPU SM utilization is `95%`. What is happening and how do you break the cycle?

**Validation:** The scheduler is over-admitting sequences into `running`, driving KV cache to `100%`, preempting LIFO victims (`recompute`), and immediately re-admitting/re-prefilling them only to run out of KV again (**preemption thrashing / livelock**). Lower `--max-num-seqs` to match peak-length $B_{\max}$, enforce gateway queue admission limits (`HTTP 429` when `num_requests_waiting` exceeds budget), and enable Automatic Prefix Caching so any recomputation skips shared prefix blocks.

</details>

### Checkpoint Quiz

1. How does **iteration-level scheduling** differ from static request-level batching at token step boundaries?
2. What is **selective batching** (`Orca`), and which transformer layer *cannot* be flattened across sequences without sequence metadata?
3. Explain **decode-maximal chunked prefill** (`Sarathi` / vLLM V1) in terms of `max_num_batched_tokens`.
4. Why do production schedulers use **LIFO** rather than **FIFO** when picking a preemption victim?
5. Contrast **`Recompute`** vs. **`Swap`** preemption—when does `Recompute` outperform `Swap` operationally?

<details><summary>Answers</summary>

1. Static batching keeps all `B` slots frozen until the slowest sequence reaches `<EOS>`. Iteration-level scheduling checks completion after *every single forward pass*, immediately ejecting finished sequences (`<EOS>`) and admitting waiting requests on the very next step.
2. Selective batching packs variable-length tokens from mixed prefill and decode requests into a single padded-free 2D tensor `[sum(tokens), d_model]`. Linear/MLP/Norm layers run identically on all tokens; only the **Attention kernel** must separate tokens by sequence offsets/block tables.
3. On each step, running decode sequences claim `1` token each first (`|running|`), and only the remaining budget `max_num_batched_tokens - |running|` is filled with a prefill chunk—keeping `ITL` smooth while piggybacking prefill compute.
4. LIFO evicts the newest request (least wasted KV work), avoids starving older near-complete requests so blocks free reliably, and prevents repeated eviction loops.
5. `Recompute` drops victim KV blocks and re-queues the sequence for chunked re-prefill, whereas `Swap` copies KV blocks to pinned CPU DRAM over PCIe. `Recompute` wins in modern engines because it requires zero host RAM pinning, avoids PCIe DMA stalls/thrashing, integrates smoothly into chunked prefill slack, and benefits from Automatic Prefix Caching.

</details>

---

## Further Reading & Sources

- [Orca: A Distributed Serving System for Transformer-Based Generative Models (Yu et al., OSDI 2022)](https://www.usenix.org/conference/osdi22/presentation/yu) — foundational paper introducing iteration-level scheduling and selective batching.
- [Taming Throughput-Latency Tradeoff in LLM Inference with Sarathi-Serve (Agrawal et al., 2024)](https://arxiv.org/abs/2403.02310) — formalizes decode-maximal chunked prefill (`max_num_batched_tokens`) eliminating `ITL` stalls under continuous batching.
- [Efficient Memory Management for Large Language Model Serving with PagedAttention (Kwon et al., SOSP 2023)](https://arxiv.org/abs/2309.06180) — analyzes `Swap` vs. `Recompute` preemption policies and LIFO eviction in vLLM.
- [vLLM Documentation: Performance & Scheduler Configuration](https://docs.vllm.ai/en/latest/) — official reference for continuous batching, preemption modes, and chunked prefill flags.

## Next

[Module 07: PagedAttention](../07-pagedattention/README.md)
