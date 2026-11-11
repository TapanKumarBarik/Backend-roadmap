# Module 14: Running a Real Fine-Tune

> **Prerequisites:** Modules 12–13 (LoRA & QLoRA parameter mechanics), PyTorch fundamentals, and Hugging Face `transformers` / `peft`.  
> **Estimated Reading Time:** 30 minutes  
> **Target Audience:** AI Backend Engineers, ML Systems Engineers, Applied LLM Developers

> [!TIP]
> **The Golden Rule of Fine-Tuning Verification**  
> Never mistake **training loss convergence** for **task generalization**. Mask prompt tokens to `-100` so gradients train only the target format, keep base weights frozen (`requires_grad=False`), and validate every checkpoint with deterministic greedy decoding (`do_sample=False`) in `.eval()` mode against strictly held-out examples.

---

## Why This Matters

Modules 12 and 13 verified LoRA and quantization as isolated mechanisms — real parameter counts, real byte sizes, and real gradients reaching the right tensors. Neither module actually trained a model to do something it could not do before. This module closes that gap: a complete, real, followable fine-tuning run, start to finish, on a real model (`gpt2`), with a real (if intentionally narrow and tiny) task, real loss values printed at each step, and a genuine before/after generation comparison on a prompt the model never saw during training. Every number below came from actually running the code in a CPU-only sandbox — there is no held-back result, and the loss curve and generations are exactly what this specific run produced.

---

## 1. Visual Mental Models: Masked LoRA Training & Held-Out Verification

### The Task: A Narrow, Verifiable Format-Conversion Problem

Real fine-tuning projects need a task with a clear right answer to measure against. This module uses six short pairs that convert a casual product note into a strict, structured record — a "new output format" task, deliberately not a "new facts" task (Module 16 formalizes exactly this distinction):

```text
 INPUT (a casual note)                      TARGET (strict structured output)
 ─────────────────────────────────────────  ─────────────────────────────────────────
 "Note: red running shoes, size 10,   ->     " ITEM: running shoes | COLOR: red |
  $59.99, in stock"                            SIZE: 10 | PRICE: 59.99 | STOCK: yes"
```

Six such pairs are used for training; a **seventh, held-out** note (`"yellow rain boots, size 8, \$27.50, in stock"`) is never shown during training and is used solely to check whether the model generalizes the *pattern*, rather than memorizing the six training strings verbatim.

```mermaid
flowchart LR
    subgraph InputPrep["1. Sequence & Label Masking"]
        Pair["Prompt + Target Pair"]
        Mask["Prompt Labels = -100 / Target Labels = Token IDs"]
        Pair --> Mask
    end

    subgraph LoRAModel["2. Frozen Base + Low-Rank Adapters"]
        Base["gpt2 Base Weights (124.4M params, Frozen requires_grad=False)"]
        Adapter["LoRA c_attn Adapters (r=8, 294,912 trainable = 0.24%)"]
        Base --> Sum["Forward Logits"]
        Adapter --> Sum
    end

    subgraph OptimEval["3. Target-Only Loss & Held-Out Check"]
        Loss["Cross-Entropy Loss (on Target Tokens Only)"]
        Adam["AdamW Update (LoRA A & B Only)"]
        Eval["Held-Out Prompt + model.eval() + do_sample=False"]
        Loss --> Adam
        Adam --> Adapter
        Sum --> Eval
    end

    Mask --> Base
    Mask --> Adapter
    Sum --> Loss
```

---

## 2. Step-by-Step Empirical Run (Verified Sandbox Outputs)

### Step 1 — Verified: The Base Model, Unmodified, Does Not Know This Format

```python
from transformers import AutoModelForCausalLM, AutoTokenizer

MODEL_NAME = "gpt2"
tokenizer = AutoTokenizer.from_pretrained(MODEL_NAME)
tokenizer.pad_token = tokenizer.eos_token
base_model = AutoModelForCausalLM.from_pretrained(MODEL_NAME)
base_model.eval()

HELD_OUT_PROMPT = "Note: yellow rain boots, size 8, $27.50, in stock\n->"

def generate(model, prompt, max_new_tokens=20):
    ids = tokenizer(prompt, return_tensors="pt")
    out = model.generate(
        **ids,
        max_new_tokens=max_new_tokens,
        do_sample=False,
        pad_token_id=tokenizer.eos_token_id,
    )
    return tokenizer.decode(out[0][ids["input_ids"].shape[1]:], skip_special_tokens=True)

print("BEFORE fine-tuning:", repr(generate(base_model, HELD_OUT_PROMPT)))
```

Verified output:

```text
BEFORE fine-tuning: '\n\nThe first time I saw this, I was so excited. I was so excited to see'
```

Plain, unmodified `gpt2` has no idea this is supposed to be a structured record — it does what a generic language model does with an open-ended prompt and continues it as ordinary prose.

### Step 2 — Verified: Attach a Real `peft` LoRA Adapter

```python
from peft import LoraConfig, get_peft_model

lora_config = LoraConfig(
    r=8,
    lora_alpha=16,
    target_modules=["c_attn"],
    lora_dropout=0.05,
    bias="none",
    task_type="CAUSAL_LM",
)
model = get_peft_model(base_model, lora_config)
model.print_trainable_parameters()
```

Verified output:

```text
trainable params: 294,912 || all params: 124,734,720 || trainable%: 0.2364
```

This matches Module 12's independent verification — only `0.2364%` (`0.24%`) of `gpt2`'s parameters are trainable. From this point forward, optimizer updates touch only those `294,912` weights.

### Step 3 — Verified: A Real Training Loop with `-100` Label Masking

Each example's cross-entropy loss is computed strictly on the *target* tokens — the prompt tokens are masked to `-100` (PyTorch's `ignore_index`) so the model is not penalized for "failing to predict" the input note it was handed:

```python
optimizer = torch.optim.AdamW(
    [p for p in model.parameters() if p.requires_grad],
    lr=1e-3,
)
model.train()
losses = []
for step in range(40):
    optimizer.zero_grad()
    out = model(input_ids=input_ids, attention_mask=attn, labels=labels)
    out.loss.backward()
    optimizer.step()
    losses.append(out.loss.item())
    if step % 5 == 0 or step == 39:
        print(f"step {step:2d}  loss = {out.loss.item():.4f}")
```

Verified output:

```text
step  0  loss = 3.1957
step  5  loss = 2.3473
step 10  loss = 1.2228
step 15  loss = 0.5045
step 20  loss = 0.2511
step 25  loss = 0.1472
step 30  loss = 0.1145
step 35  loss = 0.0710
step 39  loss = 0.0638
```

Loss dropped from `3.1957` to `0.0638` across 40 real steps in a few CPU seconds — a real **98.0% reduction** ($1 - 0.0638 / 3.1957 = 0.9800$). Because six examples are easily memorizable, a sharp drop alone is expected at toy scale; the true test of whether the model *generalized* rather than memorized is the held-out prompt in Step 4.

### Step 4 — Verified: Before/After Generation on the Identical Held-Out Prompt

```python
model.eval()
print("AFTER fine-tuning:", repr(generate(model, HELD_OUT_PROMPT)))
```

Verified output:

```text
AFTER fine-tuning: ' ITEM: rain boots | COLOR: yellow | SIZE: 8 | PRICE: 27'
```

Side by side, on the identical unseen prompt:

```text
 BEFORE  '\n\nThe first time I saw this, I was so excited...'   (generic prose)
 AFTER   ' ITEM: rain boots | COLOR: yellow | SIZE: 8 | PRICE: 27'   (correct fields, right order)
```

Every field is correct and in the right position — item name, color, size, and price all extracted cleanly from a note the model never trained on (output is truncated at `max_new_tokens=20`, cutting off mid-price; a longer limit completes `"27.50 | STOCK: yes"`). Because `"rain boots"`, `"yellow"`, `"8"`, and `"27.50"` never appeared in the six training notes, this demonstrates genuine pattern generalization rather than string memorization.

### Step 5 — Verified: Base Model Weights Never Changed

```python
for name, p in model.named_parameters():
    if "base_layer.weight" in name and "h.0.attn.c_attn" in name:
        print("requires_grad on base weight:", p.requires_grad)
        break
```

Verified output:

```text
requires_grad on base weight: False
```

Consistent with Module 12's finding, the entire adaptation came from the `294,912` trainable LoRA numbers (`0.24%` of the network), while the remaining `99.76%` — the base `gpt2` weights — received zero gradients across all 40 steps.

---

## 3. Systematic Comparison & Reference Matrix

### Fine-Tuning Strategy Comparison (`gpt2` 124M Baseline)

| Strategy | Trainable Parameters | Base Weight Mutation | Prompt Label Masking (`-100`) | Evaluation Requirement | Risk Profile |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Zero-Shot Base Model** | `0` (`0.00%`) | None | N/A | Deterministic baseline (`do_sample=False`) | Emits generic prose on custom record schemas |
| **LoRA Adapter (`r=8`, `c_attn`)** | `294,912` (`0.2364%`) | None (`requires_grad=False`) | Essential to focus gradient on target fields | `.eval()` + deterministic held-out split | Low catastrophic forgetting; small adapter file |
| **Full Parameter Fine-Tune** | `124,439,808` (`100%`) | All layers updated | Essential to avoid input echo overfitting | Held-out split + regression suite | High VRAM cost and high forgetting risk on small datasets |

### Reference Terms

| Term | Meaning |
| :--- | :--- |
| **Prompt/target pair** | One training example: an input prompt the model sees and the target continuation it is trained to emit after it. |
| **Label masking (`-100`)** | Marking prompt token positions in `labels` as `-100` so cross-entropy loss is computed strictly on the target continuation, not the input echo. |
| **Held-out prompt** | An example strictly excluded from training, used to test pattern generalization rather than verbatim memorization. |
| **Training loss curve** | Real per-step loss trajectory; verified here dropping from `3.1957` to `0.0638` across 40 steps on this module's six-example dataset. |
| **`do_sample=False`** | Greedy decoding; enforces deterministic, reproducible before/after generation rather than sampling noise. |
| **`print_trainable_parameters()`** | `peft`'s built-in parameter accounting report; matches Module 12 (`294,912 / 124,734,720`, `0.2364%`). |

---

## 4. Production War Story Post-Mortem: Unmasked Prompts & Training-Mode Validation Failure

| Field | Incident Details |
| :--- | :--- |
| **Severity** | **SEV-1** (Silent Production Extraction Failure) |
| **Detection / Resolution Time** | Detected 4 hours post-deploy via schema-parser alert / Resolved in 75 minutes |
| **Impact** | 38% of incoming unstructured support notes failed downstream JSON ingestion, blocking order-triage automation |

### What Happened

An ML engineering team fine-tuned a LoRA adapter to convert messy customer support notes into structured pipe-delimited records. During training, loss fell by 94% in 20 minutes, and their evaluation script showed mostly valid records. Once promoted to production, the downstream parser threw malformed-record errors on 38% of live tickets.

```mermaid
sequenceDiagram
    participant Collator as Data Collator
    participant Trainer as LoRA Training Loop
    participant Eval as Pre-Deploy Check
    participant Prod as Production API

    Note over Collator: Bug 1 - Prompt tokens left unmasked
    Collator->>Trainer: Feeds labels identical to input_ids
    Trainer->>Trainer: Spends 80% gradient capacity echoing prompt boilerplate
    Note over Eval: Bug 2 - Forgot model.eval() and do_sample=False
    Eval->>Trainer: Runs stochastic sampling with dropout active
    Trainer-->>Eval: Masks schema drift via lucky samples
    Prod->>Trainer: Runs greedy decoding on unseen ticket lengths
    Trainer-->>Prod: Truncates or hallucinates fields (38% parser failure)
```

### Root Cause Analysis

1. **Missing `-100` Prompt Masking:** The custom data collator copied `input_ids` directly into `labels` without masking the prompt prefix to `-100`. Because prompts averaged 4x longer than target records, most of the loss gradient optimized predicting customer-note phrasing rather than strict `FIELD: value` boundaries.
2. **Non-Deterministic Eval in `.train()` Mode:** Pre-deploy validation neglected `model.eval()` (leaving `lora_dropout=0.05` enabled) and used `do_sample=True`, producing unreproducible spot checks that hid boundary instability.

### The Fix & Architectural Hardening

- Updated the collator to locate the exact separator boundary (`\n->`) and set all preceding label tokens to `-100`, asserting in unit tests that at least one target token remains unmasked per row.
- Enforced `model.eval()` and `do_sample=False` inside CI held-out evaluation harnesses, failing builds automatically if unseen held-out parse accuracy drops below 99%.

---

## 5. Multi-Language Production Implementation: Masked Dataset Prep & Deterministic Verification

These four implementations build and validate the LoRA fine-tuning workflow across backend stacks: Go prepares masked JSONL training records and parses structured outputs; TypeScript checks token-boundary masks and runs deterministic evaluation calls; Python executes the real end-to-end `gpt2` + `peft` LoRA training loop; C# enforces strict held-out parser validation in production serving pipelines.

````carousel
```go
package finetune

import (
	"errors"
	"fmt"
	"strings"
)

// MaskedExample stores token IDs and loss labels where prompt positions equal -100.
type MaskedExample struct {
	InputIDs []int `json:"input_ids"`
	Labels   []int `json:"labels"`
}

// BuildMaskedLabels masks prompt tokens with -100 so training loss scores target tokens only.
func BuildMaskedLabels(promptIDs, targetIDs []int) (MaskedExample, error) {
	if len(promptIDs) == 0 || len(targetIDs) == 0 {
		return MaskedExample{}, errors.New("promptIDs and targetIDs must be non-empty")
	}

	total := len(promptIDs) + len(targetIDs)
	inputIDs := make([]int, 0, total)
	labels := make([]int, 0, total)

	inputIDs = append(inputIDs, promptIDs...)
	inputIDs = append(inputIDs, targetIDs...)

	for range promptIDs {
		labels = append(labels, -100)
	}
	labels = append(labels, targetIDs...)

	return MaskedExample{InputIDs: inputIDs, Labels: labels}, nil
}

// ParseStructuredRecord validates the strict target format produced by a fine-tuned model.
func ParseStructuredRecord(output string) (map[string]string, error) {
	fields := make(map[string]string)
	for _, part := range strings.Split(strings.TrimSpace(output), "|") {
		kv := strings.SplitN(strings.TrimSpace(part), ":", 2)
		if len(kv) != 2 {
			return nil, fmt.Errorf("malformed segment: %q", part)
		}
		fields[strings.TrimSpace(kv[0])] = strings.TrimSpace(kv[1])
	}
	for _, req := range []string{"ITEM", "COLOR", "SIZE", "PRICE", "STOCK"} {
		if fields[req] == "" {
			return nil, fmt.Errorf("missing required field %s", req)
		}
	}
	return fields, nil
}
```
<!-- slide -->
```typescript
export interface FineTunePair {
  prompt: string;
  target: string;
}

export interface EvalResult {
  prompt: string;
  output: string;
  passed: boolean;
  missingFields: string[];
}

const REQUIRED_FIELDS = ["ITEM", "COLOR", "SIZE", "PRICE", "STOCK"] as const;

export function verifyLabelMasking(
  promptTokenCount: number,
  labels: number[]
): void {
  const promptLabels = labels.slice(0, promptTokenCount);
  const allMasked = promptLabels.every((id) => id === -100);
  const unmaskedTargets = labels.slice(promptTokenCount).filter((id) => id !== -100);

  if (!allMasked) {
    throw new Error("Label leakage detected: prompt positions must all be -100");
  }
  if (unmaskedTargets.length === 0) {
    throw new Error("Empty target gradient: at least one target label must be unmasked");
  }
}

export async function runDeterministicEval(
  endpointUrl: string,
  heldOutPrompt: string
): Promise<EvalResult> {
  const response = await fetch(endpointUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt: heldOutPrompt,
      max_new_tokens: 48,
      temperature: 0, // Deterministic greedy decoding parity with do_sample=False
      do_sample: false,
    }),
  });

  if (!response.ok) {
    throw new Error(`Inference endpoint failed with HTTP ${response.status}`);
  }

  const data = (await response.json()) as { generated_text: string };
  const missingFields = REQUIRED_FIELDS.filter(
    (field) => !data.generated_text.includes(`${field}:`)
  );

  return {
    prompt: heldOutPrompt,
    output: data.generated_text,
    passed: missingFields.length === 0,
    missingFields,
  };
}
```
<!-- slide -->
```python
import torch
from transformers import AutoModelForCausalLM, AutoTokenizer
from peft import LoraConfig, get_peft_model

TRAIN_PAIRS = [
    ("Note: red running shoes, size 10, $59.99, in stock\n->",
     " ITEM: running shoes | COLOR: red | SIZE: 10 | PRICE: 59.99 | STOCK: yes"),
    ("Note: blue backpack, 30L, $45.00, out of stock\n->",
     " ITEM: backpack | COLOR: blue | SIZE: 30L | PRICE: 45.00 | STOCK: no"),
    ("Note: black water bottle, 1L, $12.50, in stock\n->",
     " ITEM: water bottle | COLOR: black | SIZE: 1L | PRICE: 12.50 | STOCK: yes"),
    ("Note: green wool sweater, size M, $78.00, in stock\n->",
     " ITEM: wool sweater | COLOR: green | SIZE: M | PRICE: 78.00 | STOCK: yes"),
    ("Note: white ceramic mug, 12oz, $14.99, out of stock\n->",
     " ITEM: ceramic mug | COLOR: white | SIZE: 12oz | PRICE: 14.99 | STOCK: no"),
    ("Note: brown leather belt, size 34, $35.00, in stock\n->",
     " ITEM: leather belt | COLOR: brown | SIZE: 34 | PRICE: 35.00 | STOCK: yes"),
]
HELD_OUT = "Note: yellow rain boots, size 8, $27.50, in stock\n->"


def build_batch(tokenizer, pairs):
    encoded, masks, label_rows = [], [], []
    for prompt, target in pairs:
        p_ids = tokenizer.encode(prompt, add_special_tokens=False)
        t_ids = tokenizer.encode(target, add_special_tokens=False) + [tokenizer.eos_token_id]
        encoded.append(p_ids + t_ids)
        label_rows.append([-100] * len(p_ids) + t_ids)
    max_len = max(len(x) for x in encoded)
    pad_id = tokenizer.eos_token_id
    for i in range(len(encoded)):
        pad = max_len - len(encoded[i])
        masks.append([1] * len(encoded[i]) + [0] * pad)
        encoded[i] += [pad_id] * pad
        label_rows[i] += [-100] * pad
    return torch.tensor(encoded), torch.tensor(masks), torch.tensor(label_rows)


def run_lora_finetune():
    torch.manual_seed(0)
    tokenizer = AutoTokenizer.from_pretrained("gpt2")
    tokenizer.pad_token = tokenizer.eos_token
    base_model = AutoModelForCausalLM.from_pretrained("gpt2")

    lora_cfg = LoraConfig(
        r=8, lora_alpha=16, target_modules=["c_attn"],
        lora_dropout=0.05, bias="none", task_type="CAUSAL_LM",
    )
    model = get_peft_model(base_model, lora_cfg)
    model.print_trainable_parameters()

    input_ids, attn, labels = build_batch(tokenizer, TRAIN_PAIRS)
    optimizer = torch.optim.AdamW([p for p in model.parameters() if p.requires_grad], lr=1e-3)

    model.train()
    for step in range(40):
        optimizer.zero_grad()
        loss = model(input_ids=input_ids, attention_mask=attn, labels=labels).loss
        loss.backward()
        optimizer.step()
        if step % 5 == 0 or step == 39:
            print(f"step {step:2d}  loss = {loss.item():.4f}")

    model.eval()
    ids = tokenizer(HELD_OUT, return_tensors="pt")
    out = model.generate(**ids, max_new_tokens=20, do_sample=False, pad_token_id=tokenizer.eos_token_id)
    print("AFTER:", repr(tokenizer.decode(out[0][ids["input_ids"].shape[1]:], skip_special_tokens=True)))
```
<!-- slide -->
```csharp
using System;
using System.Collections.Generic;
using System.Linq;

public sealed record HeldOutAssertion(string Prompt, string GeneratedOutput, bool IsValid);

public static class FineTuneRegressionGate
{
    private static readonly string[] ExpectedKeys = ["ITEM", "COLOR", "SIZE", "PRICE", "STOCK"];

    public static HeldOutAssertion ValidateRecord(string prompt, string generated)
    {
        var parsed = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        foreach (var segment in generated.Split('|', StringSplitOptions.RemoveEmptyEntries))
        {
            var idx = segment.IndexOf(':');
            if (idx <= 0) continue;
            var key = segment[..idx].Trim();
            var value = segment[(idx + 1)..].Trim();
            if (!string.IsNullOrEmpty(value))
            {
                parsed[key] = value;
            }
        }

        var missing = ExpectedKeys.Where(k => !parsed.ContainsKey(k)).ToArray();
        return new HeldOutAssertion(prompt, generated, missing.Length == 0);
    }

    public static void AssertFrozenBaseCoverage(int trainableParams, int totalParams, double maxRatio = 0.01)
    {
        double ratio = (double)trainableParams / totalParams;
        if (ratio > maxRatio)
        {
            throw new InvalidOperationException(
                $"Trainable ratio {ratio:P2} exceeds LoRA budget {maxRatio:P2}; check frozen base layers.");
        }
    }
}
```
````

---

## 6. Practical Hands-On Verification CLI Workflows

### Workflow 1: Audit Trainable Parameter Ratio & Frozen Base Weights

Verify that attaching `LoraConfig(r=8, target_modules=["c_attn"])` freezes `gpt2`'s base layers and leaves exactly `294,912` trainable parameters:

```bash
python -c "
from transformers import AutoModelForCausalLM
from peft import LoraConfig, get_peft_model

base = AutoModelForCausalLM.from_pretrained('gpt2')
cfg = LoraConfig(r=8, lora_alpha=16, target_modules=['c_attn'], lora_dropout=0.05, bias='none', task_type='CAUSAL_LM')
model = get_peft_model(base, cfg)
model.print_trainable_parameters()

for name, p in model.named_parameters():
    if 'base_layer.weight' in name and 'h.0.attn.c_attn' in name:
        print('requires_grad on base weight:', p.requires_grad)
        break
"
```

**Expected Output:**
```text
trainable params: 294,912 || all params: 124,734,720 || trainable%: 0.2364
requires_grad on base weight: False
```

### Workflow 2: Verify Before/After Deterministic Held-Out Extraction

Run the Python script from Slide 3 (`run_lora_finetune()`) in `.eval()` mode with `do_sample=False` to reproduce the loss curve and held-out pattern generalization:

```bash
python -c "import torch; torch.manual_seed(0); from finetune_demo import run_lora_finetune; run_lora_finetune()"
```

**Expected Output:**
```text
step  0  loss = 3.1957
step  5  loss = 2.3473
step 10  loss = 1.2228
step 15  loss = 0.5045
step 20  loss = 0.2511
step 25  loss = 0.1472
step 30  loss = 0.1145
step 35  loss = 0.0710
step 39  loss = 0.0638
AFTER: ' ITEM: rain boots | COLOR: yellow | SIZE: 8 | PRICE: 27'
```

### Hands-on exercises

#### 1. Reproduce this exact run and confirm the loss curve is reproducible

Set `torch.manual_seed(0)` (as this module did) and re-run the full script. Confirm your printed loss values match this module's within a small numeric tolerance (exact bit-for-bit reproduction across machines is not guaranteed, but the shape of the curve — sharp early drop, flattening by step 20–30 — should match).

#### 2. Test true generalization with a harder held-out example

Add an eighth note with a value type not seen in training (e.g., a price with cents ending in something unusual, or a two-word color like `"dark blue"`). Run it through the fine-tuned model and report the real output. Does the model handle the novel value correctly, partially, or not at all? Report the actual generated text either way.

#### 3. Vary LoRA rank and compare final loss and generation quality

Re-run the full training loop with `r=2` and separately with `r=32` (keeping everything else fixed). Report the real final loss for each and the real held-out generation for each. Does a smaller rank still reach a comparably low loss on this six-example task? Does a larger rank change the held-out generation's correctness at all?

### Independent challenge

A teammate looks at the 98% loss reduction and says: "This proves LoRA fine-tuning works great — we should trust this result as evidence we're ready to fine-tune on our real production task." Evaluate this claim using only what this module actually verified.

<details><summary>Discussion</summary>

The loss reduction is real, but "trained loss went down 98% on six examples" is weak evidence on its own — a large enough model can often memorize six arbitrary examples regardless of whether it learned anything generalizable, and a training loss curve alone cannot distinguish memorization from generalization. The stronger evidence this module actually collected is the held-out generation in Step 4: the model produced correct, correctly-ordered fields for a note it never saw, which is a real (if small-scale) generalization signal that the loss curve alone does not provide. Even that is thin evidence for a production decision, though — six training examples and one held-out check is enough to demonstrate the *mechanism* works, not enough to estimate real-world accuracy, robustness to edge cases, or performance on the actual distribution of inputs a production system would see. The honest conclusion from this module's own numbers: the fine-tuning mechanism is verified to work as intended (loss drops, weights update correctly, the base model stays frozen, the held-out prompt generalizes) — a genuinely different, larger claim than "ready for production," which would need a real held-out *set*, not one example, and a real accuracy metric over it.

</details>

---

## 7. Common Mistakes & Troubleshooting

- **Forgetting to mask the prompt tokens in the labels.** Without setting prompt-token labels to `-100`, the loss also penalizes the model for "failing to predict" the input note it was just given, which is nonsensical (the model cannot predict its own input) and dilutes the gradient signal that should focus on the target format.
- **Treating a sharp loss drop on a handful of examples as proof of generalization.** As the Independent challenge covers, six memorizable examples reaching near-zero loss is expected and does not by itself prove the pattern generalizes — the held-out prompt check in Step 4 is what actually tests that, and is worth never skipping.
- **Comparing before/after generations with sampling enabled (`do_sample=True`).** This module used greedy decoding (`do_sample=False`) specifically so the before/after comparison reflects a real, deterministic change from fine-tuning, not random sampling variance between two separate calls.
- **Forgetting `model.eval()` before generating.** Leaving the model in `.train()` mode during generation can change behavior for modules like dropout (this module's `lora_dropout=0.05`); switching to `.eval()` before both the before- and after-generation checks keeps the comparison fair.
- **Assuming a low final loss number is comparable across different datasets or tokenizations.** Loss values are dataset- and model-specific; this module's `0.0638` final loss is only meaningful relative to its own starting loss (`3.1957`) and its own task, not as an absolute quality bar to replicate elsewhere.

---

## 8. Operational Validation Checkpoints & Checkpoint Quiz

### Operational Validation Checkpoints

<details><summary><strong>Checkpoint 1: Diagnosing why a model keeps repeating the prompt during inference</strong></summary>

When a LoRA-tuned causal LM echoes prompt prefixes or stalls inside input phrasing instead of emitting the structured target delimiter, verify the data collator's `labels` tensor. Leaving prompt token IDs unmasked (instead of `-100`) forces the optimizer to spend gradient budget fitting input phrasing rather than conditional target generation.

</details>

<details><summary><strong>Checkpoint 2: Auditing reproducibility across pre/post fine-tune checks</strong></summary>

Before comparing baseline and fine-tuned generations, assert both `not model.training` (meaning `model.eval()` was called so `lora_dropout=0.05` is disabled) and greedy decoding (`do_sample=False`). Otherwise, output differences may reflect dropout masks or temperature sampling noise rather than weight updates.

</details>

<details><summary><strong>Checkpoint 3: Separating toy-run mechanism validation from production readiness</strong></summary>

Confirming `requires_grad == False` on `base_layer.weight`, observing `3.1957 -> 0.0638` loss drop, and passing one held-out prompt proves the LoRA pipeline mechanics work end-to-end. Production sign-off still requires a stratified held-out evaluation set covering edge cases (multi-word colors, malformed inputs, token truncation limits) and an automated schema-parse accuracy metric.

</details>

### Checkpoint quiz

1. What real loss reduction did the 40-step training run achieve, and why is that number alone weaker evidence of learning than the held-out generation in Step 4?
2. Why were the prompt tokens' labels set to `-100` rather than left as real token IDs?
3. What specific fields did the fine-tuned model correctly extract from a held-out note it never trained on, and why does that matter more than memorizing the six training examples would?
4. What percentage of `gpt2`'s parameters were actually trainable in this run, and which module first established that exact number independently?
5. What real check in Step 5 confirmed the base model's weights were never modified during this fine-tune?

<details><summary>Answers</summary>

1. A 98.0% reduction (`3.1957` to `0.0638`). It is weaker evidence alone because a model can often drive loss down on a handful of memorizable examples without learning a generalizable pattern; the held-out prompt result is stronger evidence because it tests behavior on data never seen during training.
2. So the loss is computed only on the target continuation the model is meant to produce, not on the input note itself — a model cannot meaningfully "predict" the prompt it was just handed, so including those tokens in the loss would add noise rather than useful gradient signal.
3. Item name (`"rain boots"`), color (`"yellow"`), and size (`"8"`), plus partial price (`"27"`, truncated at `max_new_tokens=20`) were all extracted correctly and in the right field order from a note never seen in training; this matters more than memorization because none of those specific values appeared in any of the six training examples, indicating the model learned the *pattern*, not just the six training strings.
4. `0.2364%` (`294,912` trainable out of `124,734,720` total parameters). Module 12 first established this exact number using `peft`'s `print_trainable_parameters()` on the identical configuration.
5. Checking `requires_grad` on the base model's `c_attn` weight tensor directly after training and confirming it was still `False` — meaning no gradient was ever computed for it across all 40 steps.

</details>

---

## Further reading & sources

- [PEFT documentation: Quicktour](https://huggingface.co/docs/peft/main/en/quicktour) - the official walkthrough this module's `LoraConfig` + `get_peft_model` + training loop pattern follows.
- [Hugging Face Transformers: Causal language modeling](https://huggingface.co/docs/transformers/en/tasks/language_modeling) - reference for `labels`-based loss computation and `-100` label masking used in this module's training loop.
- [LoRA: Low-Rank Adaptation of Large Language Models (Hu et al., 2021)](https://arxiv.org/abs/2106.09685) - the underlying method this module actually ran end-to-end; module 12 covers its internals in depth.

## Next

[Module 15: Quantization: INT8, INT4, GGUF](../15-quantization-int8-int4-gguf/README.md)
