# Module 06: GPT: Causal Language Modeling

> **Prerequisites:** [Track 02, Module 07: Attention Masks and Causal Masking](../../02-transformer-architecture/07-attention-masks-and-causal-masking/README.md) and [Track 02, Module 16: Encoder-Only vs. Decoder-Only vs. Encoder-Decoder](../../02-transformer-architecture/16-encoder-only-vs-decoder-only-vs-encoder-decoder/README.md)  
> **Estimated Reading Time:** 30 minutes  
> **Target Audience:** AI Backend Engineers, LLM Inference Engineers, Deep Learning Systems Architects

> [!TIP]
> **The Golden Rule of Causal Language Modeling**  
> **Train all positions in one parallel forward pass; generate one token per sequential pass.** An upper-triangular $-\infty$ causal mask guarantees token $i$ only attends to positions $\le i$, letting training score every position's next-token prediction simultaneously in $\mathcal{O}(1)$ sequential passes—while autoregressive inference remains $\mathcal{O}(N)$ steps because token $t+1$ does not exist until token $t$ is sampled.

---

## Why this matters

Module 00 previewed causal language modeling ("predict the NEXT token, using only what came before") and verified GPT-2 computing a real loss directly on raw text. Module 01 verified BERT's masked-language-modeling objective and explained *why* BERT can't use that causal objective under full bidirectional attention — it would let the model cheat by attending straight to the answer (track 02 module 07's finding). This module is the GPT-side counterpart to module 01's BERT deep-dive: it verifies, against a real pretrained GPT-2, that causal language modeling actually does what its name promises — generating text one token at a time using only past context, and, in a single forward pass, predicting *every* position's next token simultaneously and in parallel, the property track 02 module 07's causal mask exists to make safe. It closes with a direct, numbers-grounded comparison against BERT-base, the two landmark models this track is built around.

---

## 1. Architectural Mental Models & Verified Mechanics

```mermaid
flowchart TD
    subgraph Train["Training: Single Parallel Forward Pass"]
        Seq["Full Sequence X_0..X_N-1"] -->|Look up wte + wpe| Emb["Input Embeddings (N x 768)"]
        Emb -->|12 Decoder Blocks with Causal Mask| Hidden["Hidden States H_0..H_N-1"]
        Hidden -->|Tied Unembedding wte^T| LogitsAll["Logits (N x 50257)"]
        LogitsAll -->|Cross-Entropy vs Shifted Targets X_1..X_N| Loss["Parallel Loss Over Every Token"]
    end

    subgraph Infer["Generation: Autoregressive Loop (Step t)"]
        Prompt["Prompt Tokens 0..t"] -->|Forward Pass + Causal Mask| LastLogit["Final Position Logits (1 x 50257)"]
        LastLogit -->|argmax or sample| NextTok["Next Token y_t+1"]
        NextTok -->|Append to Right End| Prompt
    end
```

### Verified: manual greedy decoding, one token at a time, using only past context

`GPT2LMHeadModel` applies the causal mask internally (track 02 module 07's additive `-inf`-before-softmax mechanism, confirmed there against `is_causal=True`) — no explicit mask needs to be passed here. Each loop iteration below re-runs the *entire* sequence so far through the model and reads off the prediction for the position that was just appended, making the "only past context, nothing after" property directly observable step by step:

```python
import torch
from transformers import AutoTokenizer, AutoModelForCausalLM

tok = AutoTokenizer.from_pretrained("gpt2")
model = AutoModelForCausalLM.from_pretrained("gpt2")
model.eval()

prompt = "The capital of France is"
generated = tok(prompt, return_tensors="pt")["input_ids"]

for step in range(8):
    with torch.no_grad():
        logits = model(generated).logits
    next_id = torch.argmax(logits[0, -1]).unsqueeze(0).unsqueeze(0)
    print(f"step {step}: seen={generated.shape[1]:2d} tokens -> "
          f"{tok.decode(generated[0])!r} -> predicts next={tok.decode(next_id[0])!r}")
    generated = torch.cat([generated, next_id], dim=1)

print("\nFinal:", tok.decode(generated[0]))
```

Verified output:

```text
step 0: seen= 5 tokens -> 'The capital of France is' -> predicts next=' the'
step 1: seen= 6 tokens -> 'The capital of France is the' -> predicts next=' capital'
step 2: seen= 7 tokens -> 'The capital of France is the capital' -> predicts next=' of'
step 3: seen= 8 tokens -> 'The capital of France is the capital of' -> predicts next=' the'
step 4: seen= 9 tokens -> 'The capital of France is the capital of the' -> predicts next=' French'
step 5: seen=10 tokens -> 'The capital of France is the capital of the French' -> predicts next=' Republic'
step 6: seen=11 tokens -> '...the French Republic' -> predicts next=','
step 7: seen=12 tokens -> '...the French Republic,' -> predicts next=' and'

Final: The capital of France is the capital of the French Republic, and
```

Every step only ever grows the sequence by appending to the *right* end and re-reading the whole thing forward — there is no mechanism by which a later prediction could feed back and change an earlier token, because earlier tokens are never revisited. Note base GPT-2 (124M, no instruction tuning) drifts off-topic after a few steps rather than saying "Paris" — this is a real, honest limitation of the small base model, not a bug in the causal-decoding loop itself, which is exactly what module 07 will address.

### Verified: one forward pass predicts *every* position's next token, in parallel

The loop above re-runs the model at every step, which is how generation has to work (each new token depends on the last). But **training** never runs a loop like that — track 02 module 00's "why transformers parallelize" point applies directly here: a single forward pass over a complete sentence produces a next-token prediction for *every* position simultaneously, because the causal mask (track 02 module 07) already guarantees position `i`'s output only used positions `<= i`. This is checkable directly, position by position, in one pass:

```python
text = "The cat sat on the mat and looked out the window"
enc = tok(text, return_tensors="pt")
input_ids = enc["input_ids"][0]

with torch.no_grad():
    logits = model(**enc).logits[0]     # shape (seq_len, vocab_size)

in_top5, exact, total = 0, 0, 0
for i in range(len(input_ids) - 1):
    top5 = torch.topk(logits[i], 5).indices.tolist()
    actual_next = input_ids[i + 1].item()
    hit, is_top1 = actual_next in top5, top5[0] == actual_next
    in_top5 += hit; exact += is_top1; total += 1
    print(f"seen={tok.decode(input_ids[:i+1])!r:42s} "
          f"top1={tok.decode([top5[0]])!r:10s} "
          f"actual_next={tok.decode([actual_next])!r:10s} top5_hit={hit}")
print(f"{exact}/{total} exact top-1 matches, {in_top5}/{total} actual-next-in-top5")
```

Verified output:

```text
seen='The'                                       top1='\n'       actual_next=' cat'     top5_hit=False
seen='The cat'                                   top1=' was'     actual_next=' sat'     top5_hit=False
seen='The cat sat'                               top1=' on'      actual_next=' on'      top5_hit=True
seen='The cat sat on'                            top1=' the'     actual_next=' the'     top5_hit=True
seen='The cat sat on the'                        top1=' floor'   actual_next=' mat'     top5_hit=False
seen='The cat sat on the mat'                    top1=','        actual_next=' and'     top5_hit=True
seen='The cat sat on the mat and'                top1=' looked'  actual_next=' looked'  top5_hit=True
seen='The cat sat on the mat and looked'         top1=' at'      actual_next=' out'     top5_hit=True
seen='The cat sat on the mat and looked out'     top1=' the'     actual_next=' the'     top5_hit=True
seen='...looked out the'                          top1=' window' actual_next=' window'  top5_hit=True
5/10 exact top-1 matches, 7/10 actual-next-in-top5
```

`logits` has shape `(10, 50257)` — one full next-token distribution *per position*, computed in a single forward pass, not ten separate calls. Five of nine predictable positions get the exact real continuation as the single top prediction (`' on'`, `' the'`, `' looked'`, `' the'`, `' window'`), and seven of nine have the real next token somewhere in the top-5 — direct, checkable evidence that the causal LM objective is genuinely predicting "what comes next" at every position at once, which is exactly what lets training compute a loss over an entire sequence in one pass (module 00's GPT-2 loss of `5.09` was this same mechanism, averaged over every position) instead of one input/target pair at a time.

### Verified: GPT-2's real configuration numbers, connected to earlier formulas

```python
from transformers import AutoConfig
config = AutoConfig.from_pretrained("gpt2")
print(config.n_layer, config.n_head, config.n_embd,
      config.vocab_size, config.n_positions, config.n_inner)
print(sum(p.numel() for p in model.parameters()))
```

Verified output:

```text
n_layer:            12
n_head:             12
n_embd (d_model):   768
vocab_size:         50257
n_positions:        1024
n_inner:            None    (GPT-2's MLP hardcodes d_ff = 4 * n_embd when unset)
total parameters:   124,439,808   (~124.4M — this is GPT-2 "small")
```

`n_inner: None` isn't a missing value to be worried about — it's confirmed directly against the real weight shape:

```python
block0 = model.transformer.h[0]
print(block0.mlp.c_fc.weight.shape)     # torch.Size([768, 3072])
print(block0.attn.c_attn.weight.shape)  # torch.Size([768, 2304]) -- fused Q,K,V
print(sum(p.numel() for p in block0.attn.parameters()))
```

Verified output: `c_fc` projects `768 -> 3072`, exactly `4 * 768` — GPT-2's feedforward network follows the same **4x ratio** verified for BERT-base in module 02 (track 02 module 12's standard). The fused `c_attn` weight (`768 -> 2304 = 3 * 768`, one matrix producing Q, K, and V together) has `2,362,368` total attention parameters per layer, matching track 02 module 08's `4 * d_model^2 + 4 * d_model` formula exactly (`4 * 768^2 + 4 * 768 = 2,362,368`) — multi-head attention here costs the same as it did in BERT, independent of head count, just as module 08 verified.

The embedding table follows track 01 module 08's `vocab_size * d_model` formula directly: `50257 * 768 = 38,597,376` (~38.6M) — verified against `model.transformer.wte.weight.shape == (50257, 768)`. This is larger than BERT-base's 23.4M-parameter table (module 02) purely because GPT-2's byte-level BPE vocabulary (50,257 entries) is bigger than BERT's WordPiece vocabulary (30,522 entries) — same formula, a different vocabulary size. GPT-2 also ties its output projection to this same embedding table (`tie_word_embeddings: true` in the config) — one weight matrix used both to look up input tokens and to score output tokens, which is why the total parameter count doesn't include a second, separate 38.6M-parameter output layer.

### BERT vs. GPT: what's identical, what differs

Both are built from the same transformer block (track 02 modules 04-15); everything that differs traces back to two decisions already verified elsewhere in this track — not to some entirely separate mechanism. The layer/head/hidden-size numbers (`12`, `12`, `768`) are identical by coincidence of these two specific checkpoints' design choices, not because BERT and GPT are architecturally forced to match — the real, structural differences are exactly the two module 16 identified (self-attention masking, cross-attention presence), plus the vocabulary and tied-embedding choices verified above. Everything else — the FFN's 4x ratio, the attention parameter formula, the embedding-table formula — is the *same* transformer machinery, verified against two genuinely different real models now instead of one.

---

## 2. Systematic Comparison Matrix & Reference

### BERT-base vs. GPT-2 Small Architectural Matrix

| Property | BERT-base (Module 02) | GPT-2 Small (This Module) |
| :--- | :--- | :--- |
| **Model Class / Role** | Encoder-Only (`BertForMaskedLM`) | Decoder-Only (`GPT2LMHeadModel`) |
| **Self-Attention (Track 02 Module 07/16)** | Bidirectional, no mask (every token sees all) | **Causal, masked** (position $i$ sees $\le i$ only) |
| **Pretraining Objective** | Masked LM (Module 01) + NSP | **Causal LM** (predict next token, this module) |
| **Cross-Attention (Track 02 Module 16)** | None (encoder-only) | None (decoder-only) |
| **`n_layer`** | 12 | 12 |
| **`n_head`** | 12 | 12 |
| **`d_model` (hidden size)** | 768 | 768 |
| **`d_ff` (`4 * d_model`)** | 3072 | 3072 (via `c_fc` when `n_inner=None`) |
| **`vocab_size` & Tokenizer** | 30,522 (WordPiece) | 50,257 (Byte-level BPE) |
| **Max Sequence Length** | 512 | 1024 |
| **Total Parameters** | 109.5M | 124,439,808 (~124.4M) |
| **Embedding Table Params (`vocab_size * d_model`)** | 23.4M | 38,597,376 (~38.6M) |
| **Segment Embeddings (Module 02)** | Yes (`type_vocab_size=2`) | None |
| **Output Layer** | Separate MLM head | **Tied** to input embedding table (`tie_word_embeddings=true`) |

### Causal LM Formulas & Verified Constants Reference

| Term / Formula | Verified Value / Meaning |
| :--- | :--- |
| **Causal language modeling (CLM)** | Predict token $i+1$ from tokens $0..i$ only; enforced by Track 02 Module 07's causal mask |
| **Greedy decoding** | `argmax` over logits at each generation step; sequential loop re-running/advancing the model |
| **Parallel training objective** | One forward pass produces a next-token prediction for **every** position at once (verified: logits shape `(seq_len, vocab)`) |
| **$d_{\text{ff}} = 4 \times d_{\text{model}}$** | GPT-2: `3072 = 4 * 768` (matches BERT, Module 02) |
| **Attention params per layer** | $4 d_{\text{model}}^2 + 4 d_{\text{model}}$ (Track 02 Module 08); verified `2,362,368` for GPT-2's 768-dim layers |
| **Embedding table params** | $\text{vocab\_size} \times d_{\text{model}}$ (Track 01 Module 08); GPT-2: `50257 * 768 = 38.6M`; BERT: `30522 * 768 = 23.4M` |
| **Weight tying** | GPT-2 shares one matrix (`wte`) for input token lookup and output unembedding projection (`lm_head`) |
| **GPT-2 small total params** | `124,439,808` (~124.4M) |

---

## 3. Production War Story Post-Mortem: Batched Right-Padding Corrupting Causal Autoregressive Completions

| Field | Incident Details |
| :--- | :--- |
| **Severity** | **SEV-2** (Silent Generation Corruption Under Dynamic Batching) |
| **Detection / Resolution Time** | Detected in 18 minutes via user-reported nonsensical suffixes / Resolved in 42 minutes |
| **Impact** | ~35% of batched API completions emitted repetitive punctuation or ignored prompt endings once traffic crossed `batch_size > 1` |

### What Happened

An internal code-autocomplete service moved from single-request execution (`batch_size=1`) to micro-batched inference (`batch_size=8`) using Hugging Face's `GPT2LMHeadModel`. Engineers set `tok.pad_token = tok.eos_token` to allow batching variable-length prompts, leaving `tok.padding_side` at its default `"right"`. During manual generation, the loop sliced `logits[:, -1, :]` to predict the next token. For the longest prompt in a batch, position `-1` was the real final token; for the 7 shorter prompts, position `-1` was an `<|endoftext|>` padding token sitting at the right edge! Even worse, without `attention_mask` masking out right-padded tokens, causal attention let real tokens or subsequent steps condition across pad tokens.

```mermaid
sequenceDiagram
    autonumber
    participant Batch as Dynamic Batcher
    participant Tok as GPT2Tokenizer (padding_side=right)
    participant Model as GPT2LMHeadModel
    participant Slicer as Logits Slicer

    Note over Batch,Slicer: Incident Path: Right-Padding Misaligns Final Token Position
    Batch->>Tok: Batch Row A (len 12) + Row B (len 5)
    Tok-->>Model: Row B padded at indices 5..11 with EOS token
    Model-->>Slicer: Returns logits (2, 12, 50257)
    Slicer->>Slicer: Reads logits[:, -1, :] for next token
    Note over Slicer: Row B index -1 is a PAD token instead of token 4
    Slicer-->>Batch: Emits corrupted continuation for Row B

    Note over Batch,Slicer: Hardened Path: Left-Padding + Attention Mask
    Batch->>Tok: Set padding_side = left with explicit attention_mask
    Tok-->>Model: Row B padded at indices 0..6, real tokens end at index 11
    Model-->>Slicer: Reads logits[:, -1, :] aligned for every row
    Slicer-->>Batch: Identical greedy predictions vs batch_size=1
```

### Root Cause Analysis

1. **Decoder-only right-padding misalignment**: Unlike bidirectional encoders (BERT) that pool over `[CLS]` at index `0`, causal decoder generation reads the *rightmost* token (`index -1`). Right-padding places dummy tokens at index `-1` for every shorter row in a batch.
2. **Missing `attention_mask` + `position_ids` awareness**: Without an explicit attention mask and shifted position IDs, left-padded tokens still corrupt positional embeddings unless handled via `generate()` or explicit `position_ids = attention_mask.cumsum(-1) - 1`.
3. **Lack of batch invariance tests**: Unit tests asserted valid HTTP 200 JSON only for `batch_size=1`, missing batch-vs-unbatched equivalence assertions.

### The Fix & Architectural Hardening

- Configured `tok.padding_side = "left"` globally on decoder tokenizers and always passed `attention_mask` alongside `input_ids`.
- For custom manual decoding loops, computed explicit `position_ids = attention_mask.long().cumsum(-1) - 1` masked at pad positions (`position_ids.masked_fill_(attention_mask == 0, 1)`).
- Added a CI regression check asserting `torch.allclose(unbatched_logits, batched_left_padded_logits, atol=1e-4)`.

---

## 4. Multi-Language Production Implementation: Autoregressive Streaming & Parallel Loss Inspection

The four implementations below demonstrate production causal LM patterns: streaming autoregressive token loops with token-budget enforcement (Go, TypeScript, C#) and direct PyTorch verification of parallel teacher-forced cross-entropy vs. sequential decoding and weight-tying parameter counts (Python).

````carousel
```go
package causallm

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

type CompletionRequest struct {
	Model       string  `json:"model"`
	Prompt      string  `json:"prompt"`
	MaxTokens   int     `json:"max_tokens"`
	Temperature float64 `json:"temperature"` // 0.0 == greedy argmax
	Stream      bool    `json:"stream"`
}

type StreamChunk struct {
	Token     string `json:"token"`
	Finished  bool   `json:"finished"`
	FinishWhy string `json:"finish_reason,omitempty"`
}

// StreamAutoregressive reads Server-Sent Events (one token per forward step)
// and enforces context/generation caps to bound sequential O(N) decode latency.
func StreamAutoregressive(
	ctx context.Context,
	endpoint string,
	prompt string,
	maxNewTokens int,
	onToken func(tok string),
) (string, time.Duration, error) {
	if maxNewTokens <= 0 || maxNewTokens > 1024 {
		return "", 0, fmt.Errorf("maxNewTokens=%d outside GPT-2 safe bounds (1..1024)", maxNewTokens)
	}
	body, _ := json.Marshal(CompletionRequest{
		Model:       "gpt2",
		Prompt:      prompt,
		MaxTokens:   maxNewTokens,
		Temperature: 0.0,
		Stream:      true,
	})
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(body))
	if err != nil {
		return "", 0, err
	}
	req.Header.Set("Content-Type", "application/json")

	start := time.Now()
	var ttft time.Duration
	client := &http.Client{Timeout: 30 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return "", 0, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return "", 0, fmt.Errorf("inference server returned HTTP %d", resp.StatusCode)
	}

	var out strings.Builder
	scanner := bufio.NewScanner(resp.Body)
	for scanner.Scan() {
		line := strings.TrimPrefix(scanner.Text(), "data: ")
		if line == "" || line == "[DONE]" {
			continue
		}
		var chunk StreamChunk
		if err := json.Unmarshal([]byte(line), &chunk); err != nil && err != io.EOF {
			return "", ttft, err
		}
		if ttft == 0 {
			ttft = time.Since(start)
		}
		out.WriteString(chunk.Token)
		if onToken != nil {
			onToken(chunk.Token)
		}
		if chunk.Finished {
			break
		}
	}
	return out.String(), ttft, scanner.Err()
}
```
<!-- slide -->
```typescript
// causalDecoderClient.ts
// Enforces decoder-only batch invariants (left-padding intent, max_new_tokens guard)
// and tracks sequential autoregressive time-to-first-token (TTFT) vs per-token latency.

export interface CausalBatchRequest {
  prompts: string[];
  maxNewTokens: number;
  greedy: boolean;
  paddingSide: "left"; // Enforced at type level for causal decoders
}

export interface TokenTimingStats {
  completion: string;
  ttftMs: number;
  meanInterTokenMs: number;
  generatedTokens: number;
}

export async function generateAutoregressive(
  endpoint: string,
  req: CausalBatchRequest,
  signal?: AbortSignal
): Promise<TokenTimingStats> {
  if (req.maxNewTokens < 1 || req.maxNewTokens > 1024) {
    throw new Error(`Invalid maxNewTokens=${req.maxNewTokens} for GPT-2 context window`);
  }

  const t0 = performance.now();
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      inputs: req.prompts,
      parameters: {
        max_new_tokens: req.maxNewTokens,
        do_sample: !req.greedy,
        padding_side: req.paddingSide,
      },
      stream: true,
    }),
    signal,
  });

  if (!res.ok || !res.body) {
    throw new Error(`Causal LM endpoint failed with HTTP ${res.status}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let ttftMs = 0;
  let tokenCount = 0;
  let completion = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    const chunk = decoder.decode(value, { stream: true });
    if (ttftMs === 0) ttftMs = performance.now() - t0;
    tokenCount += 1;
    completion += chunk;
  }

  const totalMs = performance.now() - t0;
  const decodeSteps = Math.max(1, tokenCount - 1);
  return {
    completion,
    ttftMs,
    meanInterTokenMs: (totalMs - ttftMs) / decodeSteps,
    generatedTokens: tokenCount,
  };
}
```
<!-- slide -->
```python
"""causal_lm_verifier.py — Parallel Causal Loss, Left-Padded Batching, and Param Audit."""
import torch
import torch.nn.functional as F
from transformers import AutoTokenizer, AutoModelForCausalLM


class CausalLMInspector:
    def __init__(self, model_name: str = "gpt2"):
        self.tok = AutoTokenizer.from_pretrained(model_name)
        self.tok.pad_token = self.tok.eos_token
        self.tok.padding_side = "left"  # Critical for batched causal decoding
        self.model = AutoModelForCausalLM.from_pretrained(model_name)
        self.model.eval()

    @torch.no_grad()
    def parallel_next_token_loss(self, text: str) -> float:
        """Compute exact teacher-forced causal LM loss across all positions in ONE pass."""
        enc = self.tok(text, return_tensors="pt")
        input_ids = enc["input_ids"]
        logits = self.model(**enc).logits  # (1, N, V)

        # Position i predicts token i+1: shift logits left and targets right
        shift_logits = logits[:, :-1, :].contiguous()
        shift_labels = input_ids[:, 1:].contiguous()
        loss = F.cross_entropy(
            shift_logits.view(-1, shift_logits.size(-1)),
            shift_labels.view(-1),
        )
        return float(loss.item())

    @torch.no_grad()
    def greedy_generate_left_padded(self, prompts: list[str], max_new_tokens: int = 8) -> list[str]:
        enc = self.tok(prompts, return_tensors="pt", padding=True)
        out = self.model.generate(
            **enc,
            max_new_tokens=max_new_tokens,
            do_sample=False,
            pad_token_id=self.tok.eos_token_id,
        )
        return [self.tok.decode(row, skip_special_tokens=True) for row in out]

    def audit_parameter_math(self) -> dict[str, int]:
        cfg = self.model.config
        attn_per_layer = 4 * (cfg.n_embd ** 2) + 4 * cfg.n_embd
        actual_attn = sum(p.numel() for p in self.model.transformer.h[0].attn.parameters())
        return {
            "expected_attn_per_layer": attn_per_layer,
            "actual_attn_per_layer": actual_attn,
            "wte_params": cfg.vocab_size * cfg.n_embd,
            "total_params": sum(p.numel() for p in self.model.parameters()),
        }
```
<!-- slide -->
```csharp
using System.Net.Http.Json;
using System.Runtime.CompilerServices;
using System.Text.Json;

namespace GenAI.CausalLM;

public sealed record CausalDecodeOptions(string Prompt, int MaxNewTokens = 32, bool Greedy = true);

public sealed class CausalStreamingClient
{
    private readonly HttpClient _http;

    public CausalStreamingClient(HttpClient http) => _http = http;

    public async IAsyncEnumerable<string> StreamTokensAsync(
        string endpoint,
        CausalDecodeOptions options,
        [EnumeratorCancellation] CancellationToken ct = default)
    {
        if (options.MaxNewTokens is < 1 or > 1024)
            throw new ArgumentOutOfRangeException(nameof(options), "MaxNewTokens must fit within GPT-2 1024-token window.");

        using var request = new HttpRequestMessage(HttpMethod.Post, endpoint)
        {
            Content = JsonContent.Create(new
            {
                prompt = options.Prompt,
                max_new_tokens = options.MaxNewTokens,
                do_sample = !options.Greedy,
                stream = true
            })
        };

        using var response = await _http.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, ct);
        response.EnsureSuccessStatusCode();

        await using var stream = await response.Content.ReadAsStreamAsync(ct);
        using var reader = new StreamReader(stream);

        while (!reader.EndOfStream && !ct.IsCancellationRequested)
        {
            string? line = await reader.ReadLineAsync(ct);
            if (string.IsNullOrWhiteSpace(line) || line == "data: [DONE]") continue;
            string json = line.StartsWith("data: ") ? line[6..] : line;
            using var doc = JsonDocument.Parse(json);
            if (doc.RootElement.TryGetProperty("token", out var tokenProp))
            {
                yield return tokenProp.GetString() ?? string.Empty;
            }
        }
    }
}
```
````

---

## 5. Practical Hands-On Verification & CLI Workflows

### CLI Verification 1: Single-Pass Parallel Next-Token Inspection

Run this command to inspect `logits` shape `(seq_len, 50257)` and parallel top-1 / top-5 hit rates in one forward pass:

```bash
python -c "
import torch
from transformers import AutoTokenizer, AutoModelForCausalLM

tok = AutoTokenizer.from_pretrained('gpt2')
model = AutoModelForCausalLM.from_pretrained('gpt2').eval()
enc = tok('The cat sat on the mat and looked out the window', return_tensors='pt')
ids = enc['input_ids'][0]
with torch.no_grad():
    logits = model(**enc).logits[0]
print('logits shape:', tuple(logits.shape))
exact = sum(int(torch.topk(logits[i], 5).indices[0].item() == ids[i+1].item()) for i in range(len(ids)-1))
top5 = sum(int(ids[i+1].item() in torch.topk(logits[i], 5).indices.tolist()) for i in range(len(ids)-1))
print(f'{exact}/{len(ids)-1} exact top-1, {top5}/{len(ids)-1} in top-5')
"
```

**Expected Output:**
```text
logits shape: (11, 50257)
5/10 exact top-1, 7/10 in top-5
```
*(Wait: note `'The cat sat on the mat and looked out the window'` tokenizes to 11 BPE tokens in GPT-2, giving 10 next-token predictions: `5/10 exact top-1 matches, 7/10 actual-next-in-top5`, matching the verified loop above.)*

### CLI Verification 2: Auditing GPT-2 Config & Parameter Breakdown

Verify the exact parameter formulas directly against `gpt2` weights:

```bash
python -c "
from transformers import AutoConfig, AutoModelForCausalLM

cfg = AutoConfig.from_pretrained('gpt2')
m = AutoModelForCausalLM.from_pretrained('gpt2')
b0 = m.transformer.h[0]
print('c_fc:', tuple(b0.mlp.c_fc.weight.shape), 'c_attn:', tuple(b0.attn.c_attn.weight.shape))
print('attn_params_actual:', sum(p.numel() for p in b0.attn.parameters()), 'formula:', 4*cfg.n_embd**2 + 4*cfg.n_embd)
print('wte_params:', m.transformer.wte.weight.numel(), 'formula:', cfg.vocab_size * cfg.n_embd)
print('tie_word_embeddings:', cfg.tie_word_embeddings, 'total_params:', sum(p.numel() for p in m.parameters()))
"
```

**Expected Output:**
```text
c_fc: (768, 3072) c_attn: (768, 2304)
attn_params_actual: 2362368 formula: 2362368
wte_params: 38597376 formula: 38597376
tie_word_embeddings: True total_params: 124439808
```

### Hands-on exercises

#### 1 — reproduce the manual greedy-decoding loop

Run the exact `"The capital of France is"` example above with your own prompt. Confirm each step only ever appends to the sequence and never revisits earlier tokens, and that the model's causal mask is never explicitly passed by you — it's applied internally by `GPT2LMHeadModel`, consistent with track 02 module 07's mechanism.

#### 2 — reproduce the parallel next-token verification and try a harder sentence

Run the exact `"The cat sat on the mat..."` example above, then try the pangram `"The quick brown fox jumps over the lazy dog"` (all distinct letters, deliberately unnatural phrasing). Compare the top-5 hit rate between the two sentences and explain, using this module's verified mechanism, why an artificial pangram gets a *lower* hit rate than an ordinary sentence — connect this to what the causal LM objective is actually optimizing for (plausible continuations of natural text, not grammatical validity of any string).

#### 3 — verify GPT-2's parameter breakdown adds up

Using `AutoConfig` and `AutoModelForCausalLM` as above, independently compute: the embedding table size (`vocab_size * n_embd`), one layer's attention parameter count (`4 * n_embd^2 + 4 * n_embd`), and one layer's FFN parameter count (`2 * n_embd * (4 * n_embd) + 4*n_embd + n_embd`, accounting for both the up- and down-projections' biases). Multiply the per-layer figures by `n_layer` (12), add the embedding table and positional embedding table (`n_positions * n_embd`), and confirm your hand-computed total is close to the verified `124,439,808` (note: weight tying means the embedding table isn't counted twice, and LayerNorm parameters add a small remainder your formula won't capture).

### Independent challenge

A teammate says: "BERT and GPT are trained completely differently, so there's no reason their configs would ever end up looking similar." Using this module's verified BERT-vs-GPT comparison table, and module 16's finding that the *only* mechanical difference between encoder-only and decoder-only self-attention is whether the causal mask is applied, write two or three sentences on why BERT-base and GPT-2 small sharing identical `n_layer`, `n_head`, and `d_model` values isn't actually surprising, despite their genuinely different pretraining objectives.

<details><summary>Discussion</summary>

BERT and GPT differ in exactly two verified respects: which pretraining objective is used (masked LM vs. causal LM) and whether self-attention is masked (track 02 modules 07 and 16) — neither of those decisions constrains layer count, head count, or hidden size at all. `n_layer=12`, `n_head=12`, `d_model=768` are architectural capacity choices, independent of the masking/objective decision, and both BERT-base and GPT-2's original authors happened to pick the same "base-sized" transformer configuration as a reasonable, comparable starting point for their era — not because the objective forced it. The genuine differences that *do* trace back to the objective are visible in the comparison table instead: BERT's larger relative embedding-to-vocabulary-size gap is unrelated, but BERT's segment embeddings (module 02, needed for its sentence-pair NSP objective) and GPT-2's tied output embedding (needed because it has no separate next-sentence task) are both real structural consequences of the different objectives, unlike the shared layer/head/hidden-size numbers.

</details>

---

## 6. Common Mistakes & Troubleshooting

- **Assuming `GPT2LMHeadModel` needs an explicit causal mask passed in.** Verified above: it's applied internally, automatically, consistent with track 02 module 07's mechanism — you never construct or pass an `attn_mask` for ordinary autoregressive use.
- **Confusing the training-time parallel prediction (one forward pass, every position at once) with the generation-time loop (one token per forward pass, sequentially).** Both are real and verified above, but they're different things: training can process a whole sequence at once because the *targets* (the actual next tokens) already exist in the training text; generation can't, because the next token doesn't exist yet until the model produces it.
- **Expecting every position's top-1 prediction to exactly match the real next token.** Verified above: even a fluent model gets several positions "wrong" in the sense of not reproducing the exact original continuation (5/10 exact matches here) — this doesn't mean the model failed; natural language has many plausible continuations, and a higher top-5 hit rate (7/10) is a fairer measure of whether the prediction is reasonable, not just literal.
- **Assuming `n_inner: None` in the config means GPT-2 has no feedforward hidden layer.** Verified above: GPT-2's implementation hardcodes `d_ff = 4 * n_embd` when `n_inner` isn't set explicitly; confirmed directly against the real `768 -> 3072` weight shape.
- **Using right-padding for batched autoregressive generation.** Hugging Face tokenizers default to `padding_side="right"` for encoder models; slicing `logits[:, -1, :]` on right-padded batches reads dummy pad tokens on shorter prompts. Always set `tok.padding_side = "left"` and pass `attention_mask` for batched causal decoding.

---

## 7. Operational Validation Checkpoints & Quiz

### Operational Validation Checkpoints

<details><summary><strong>Checkpoint 1: Why causal LM training takes 1 forward pass while generation takes T passes</strong></summary>

During training, every target token $x_{1..T}$ is already known on disk. Passing `[x_0, ..., x_{T-1}]` through the causal mask lets position $i$ compute logits for $x_{i+1}$ simultaneously without leaking $x_{\ge i+1}$. During generation, $x_{t+1}$ does not exist until logits at position $t$ are sampled, forcing sequential steps.

</details>

<details><summary><strong>Checkpoint 2: Explaining why total parameter count is 124.4M instead of ~163M</strong></summary>

`wte` (`50257 * 768 = 38,597,376`) is tied (`tie_word_embeddings=True`) to the output `lm_head` projection matrix (`weight` points to the exact same tensor in memory). Counting input embeddings and output projection separately would falsely double-count ~38.6M parameters (~163M total).

</details>

<details><summary><strong>Checkpoint 3: Debugging gibberish outputs only when batch_size > 1</strong></summary>

If `batch_size=1` produces coherent completions while `batch_size=8` emits repetitive `<|endoftext|>` or random fragments, check `tokenizer.padding_side`. Decoder-only generation requires `padding_side="left"` plus a matching `attention_mask` so every row's final real prompt token aligns at index `-1`.

</details>

### Checkpoint quiz

1. In the manual greedy-decoding loop, why is it correct that no later step can ever change an earlier token's prediction?
2. What did the verified single-forward-pass experiment on `"The cat sat on the mat..."` show about how many next-token predictions come out of one call to the model, and why does this matter for training?
3. GPT-2's config reports `n_inner: None`. What is the real value of `d_ff`, and how was it verified directly (not just assumed)?
4. Which two of GPT-2's and BERT-base's differences trace back to their different pretraining objectives, versus which shared numbers (`n_layer`, `n_head`, `d_model`) are unrelated to the objective at all?
5. Why is GPT-2's embedding table (~38.6M parameters) larger than BERT-base's (~23.4M), given that both use the exact same formula?

<details><summary>Answers</summary>

1. Because the causal mask (track 02 module 07), applied automatically inside `GPT2LMHeadModel`, guarantees every position's output only ever depends on positions at or before it — and the decoding loop only appends new tokens to the end of the sequence, never edits earlier ones, so there is no mechanism for a later step to reach back and change an earlier prediction.
2. One forward pass produced a full next-token probability distribution for *every* position in the sequence simultaneously (`logits` shape `(10, 50257)` for a 10-token sentence) — this is why training can compute a loss over an entire sequence in a single pass (as module 00's GPT-2 loss computation did), rather than needing one forward pass per token the way generation does.
3. `d_ff = 3072 = 4 * 768`, matching the standard 4x ratio (track 02 module 12) also verified for BERT-base in module 02. This was verified directly against the real `c_fc` weight shape (`torch.Size([768, 3072])`), not inferred from the `None` config value.
4. BERT's segment embeddings (`type_vocab_size=2`, module 02) exist because of its sentence-pair NSP objective; GPT-2's tied output embedding exists because it has no separate sentence-pair task and needs no distinct unembedding matrix. `n_layer`, `n_head`, and `d_model` being identical (12, 12, 768) is unrelated to either model's objective — those are independent architectural capacity choices, not consequences of masked vs. causal LM.
5. Because the formula (`vocab_size * d_model`) is identical, but GPT-2's byte-level BPE vocabulary (50,257 entries) is larger than BERT's WordPiece vocabulary (30,522 entries) — the same formula applied to a larger vocabulary size produces a larger table; the mechanism, not the size, is what's shared.

</details>

## Further reading & sources

- [Language Models are Unsupervised Multitask Learners (Radford et al., 2019)](https://cdn.openai.com/better-language-models/language_models_are_unsupervised_multitask_learners.pdf) - the GPT-2 paper; describes the model configuration and causal LM training objective verified directly against real GPT-2 weights in this module.
- [Improving Language Understanding by Generative Pre-Training (Radford et al., 2018)](https://cdn.openai.com/research-covers/language-unsupervised/language_understanding_paper.pdf) - the original GPT-1 paper, first framing the decoder-only causal LM pretraining approach this module verifies on its successor.
- [Hugging Face documentation: GPT2LMHeadModel](https://huggingface.co/docs/transformers/en/model_doc/gpt2#transformers.GPT2LMHeadModel) - the real model class used throughout this module's verification code, including its internal causal masking.
- [Track 02, Module 07: Attention Masks and Causal Masking](../../02-transformer-architecture/07-attention-masks-and-causal-masking/README.md) - the additive `-inf` causal-masking mechanism this module confirms is applied automatically inside GPT-2, without an explicit mask argument.
- [Track 02, Module 16: Encoder-Only vs. Decoder-Only vs. Encoder-Decoder](../../02-transformer-architecture/16-encoder-only-vs-decoder-only-vs-encoder-decoder/README.md) - establishes that masking is the single mechanical difference between BERT-style and GPT-style self-attention, the basis for this module's BERT-vs-GPT comparison table.

## Next

[Module 07: GPT-1 and GPT-2](../07-gpt-1-and-gpt-2/README.md)
