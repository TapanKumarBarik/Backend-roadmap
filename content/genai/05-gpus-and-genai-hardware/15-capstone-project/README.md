# Module 15: Capstone Project

## Roadmap

**What this capstone is.** Track 05 gave you the parts of a hardware decision one at a time: why GPUs and not CPUs
([Module 00](../00-why-gpus-not-cpus/README.md)), how a GPU is built and where its time goes
([Module 01](../01-gpu-architecture-for-software-engineers/README.md), [Module 02](../02-cuda-cores-vs-tensor-cores/README.md),
[Module 03](../03-memory-hierarchy-and-bandwidth/README.md)), why VRAM binds first
([Module 04](../04-vram-the-real-constraint/README.md)) and how to compute a model's memory
([Module 05](../05-calculating-a-models-memory-requirements/README.md)), which number formats and tricks shrink it
([Module 06](../06-numeric-formats-fp32-fp16-bf16/README.md), [Module 07](../07-mixed-precision-training/README.md),
[Module 08](../08-flashattention-and-memory-efficient-kernels/README.md)), how to split what still does not fit
([Module 09](../09-data-parallelism/README.md), [Module 10](../10-model-and-tensor-parallelism/README.md),
[Module 11](../11-pipeline-parallelism-and-zero/README.md)), how to choose the card
([Module 12](../12-choosing-gpus-consumer-vs-datacenter/README.md)), what it costs
([Module 13](../13-cloud-gpu-economics/README.md)), and what to do without a GPU
([Module 14](../14-running-models-on-cpu-and-apple-silicon/README.md)).
This capstone asks you to run all of it once, end to end, on a model you choose, and write the result as a
hardware sizing report.

There is no dataset, no solution, no code given and no single correct answer. Two good reports for the same model
can recommend different hardware, because they assume different workloads and utilization. What makes a report good
is that every number is traceable, every decision names the gate that forced it, and the report says what would
change its mind.

## Concept

> [!key]
> A hardware recommendation is only as good as its weakest labelled number: separate what you sourced, what you
> measured, what you estimated and what you assumed, then show which assumption would flip the decision.

## Visual diagram

```
  model fact sheet ──► two workloads ──► memory tables ──► precision +   ──► hardware gates ──► cost model ──► report
  (sourced, dated)     (serve, adapt)    (inference and    parallelism       (Module 12:         (Module 13:    (decision
                                          fine-tuning)      (Modules          shortlist and       on-demand /    first,
                                          Modules 05-08     06, 07, 09-11)    rejections)         spot / buy)    caveats
                                                                                                                  last)
        ▲                                                                                              │
        └────── validate the estimate you trust least (measure it or find a published measurement) ◄───┘
                every number in the report carries a tag:  [sourced]  [measured]  [estimated]  [assumed]
```

## Project

### 1. Choose a model and write its fact sheet

Pick an open-weights language model whose configuration is published, in the range where decisions are not trivial
(a few billion up to roughly seventy billion parameters is a sensible window). Record, each with a source URL and
the date you read it: parameter count, number of layers, hidden size, attention heads and key/value heads,
maximum context length, whether it is dense or mixture-of-experts, and the precision it was released in.

### 2. Define two workloads

- **Serving.** Target context length, number of concurrent requests, tokens per second each user should see, and
  how bursty the traffic is.
- **Adaptation.** One fine-tuning run on a dataset size and sequence length you choose, and whether you will
  update all weights or use an adapter method from Track 04.

Write both down as numbers. Everything later is computed from them.

### 3. Compute memory for both workloads

For serving and for the fine-tuning run, and at several precisions, produce a table of weights, KV cache,
activations, and (for fine-tuning) gradients and optimizer state. Show the formulas and the arithmetic with units,
including the GB versus GiB distinction. Identify which component binds at each precision, and show how the answer
moves when you change context length or batch size.

### 4. Choose precision and a parallelism strategy

State the number format you would use for each workload and why. Decide between a single GPU, data parallelism,
tensor parallelism, pipeline parallelism and optimizer-state sharding, or none, and tie that choice to your memory
table. If you split across cards, say what traffic that creates and what link it needs; if you do not, show that
capacity suffices.

### 5. Choose hardware and justify it

Build a shortlist of at least three candidates spanning at least two classes (for example a consumer or workstation
card, a datacenter card, and a non-GPU option from Module 14). Take every specification from a datasheet or product
page you fetch yourself, with its URL and the date. Apply the gates from Module 12 and show each rejected
candidate with the gate that rejected it, including the driver-licence and terms question for the setting you
chose. For serving, estimate the decode ceiling from bandwidth and label it as an estimate.

### 6. Cost it

Build a cost model for both workloads with at least three ways of paying (for example on-demand, spot or
committed capacity, and buying). Give cost per million generated tokens for serving and cost per run for
fine-tuning, with your utilization and throughput assumptions stated. Include storage, egress, and load time.
Compute a rent-versus-buy break-even and run a sensitivity analysis on the two inputs you trust least. Prices must
be inputs with a source URL and date, or clearly labelled placeholders.

### 7. Validate one estimate

Choose the estimate you trust least and test it against something real: a measurement you take yourself (a small
model on your own CPU is enough), or a published measurement for similar hardware. Report the gap between estimate
and evidence, and what you think causes it.

### 8. Write the report

At most four pages. Decision first, in one paragraph. Then the fact sheet, the workloads, the memory tables, the
precision and parallelism decisions, the shortlist with rejections, the cost table with the sensitivity
result, the validation, the risks, and an assumption register. Close with a list of what would change your
recommendation and the first thing you would measure before spending money.

### Constraints

- No GPU is required. Everything can be done with arithmetic, vendor documents, and optionally a CPU.
- Every number carries one tag: sourced (with URL and date), measured (by you, with the setup), estimated (with the
  formula), or assumed (with the reason). A number with no tag is a defect.
- Do not present a provider price as fact unless you fetched it and dated it. Do not claim any option is "the best"
  or "the latest"; say what it was compared against and when.
- Show arithmetic and units. A result that cannot be recomputed from the report does not count.
- If your estimate and your evidence disagree, report the disagreement. A diagnosed gap is worth more than a
  forced match.

### How to know you've done it well

| Criterion | Needs work | Meets | Strong |
|---|---|---|---|
| Memory arithmetic | Missing components, mixed units, or unshown work | Weights, KV cache, activations, gradients and optimizer state computed with units for both workloads; binding component named | Also shows how the answer moves with context, batch and precision, and where it would stop fitting |
| Precision and parallelism | Asserted without reference to the memory table | Each choice tied to a number in the table and to a link requirement | Also quantifies the communication cost, or shows convincingly why none is needed |
| Hardware selection | A single favourite, or specifications from memory | Three or more candidates in two classes, dated sources, each rejection tied to a named gate | Also applies the terms and licence gate to the stated deployment and includes a non-GPU option |
| Cost model | One price, no utilization | Three payment options, stated utilization, cost per million tokens and per run, break-even computed | Sensitivity analysis names the assumption that flips the winner |
| Evidence discipline | Untagged numbers, estimates presented as measurements | Every number tagged and dated; sources are primary | One estimate checked against evidence, with the gap and its likely cause reported |
| Communication | Reader cannot find the decision | Decision first, four pages or fewer, assumption register present | States what would change the decision and what to measure next |

A report with at least one surprising or disappointing result honestly reported (an estimate that missed, a
cheaper option that failed a gate) is stronger than one where everything worked.

## Interview questions

> [!interview]
> Walk me through how you would size the hardware to serve a 70-billion-parameter model to 50 concurrent users.

<details><summary>What a strong answer covers</summary>

- Start from the workload numbers (context length, tokens/s per user), then weights at a chosen precision, then
  KV cache for 50 sequences at that context, plus overhead.
- Check capacity per card, decide whether the model must be split, and what link that split needs.
- Estimate the decode ceiling from bandwidth and bytes per token, and say it is an upper bound.
- Then terms (licence for the deployment setting), operations (power, cooling), and only then cost per million
  tokens at a realistic utilization, with the assumptions labelled.

</details>

> [!interview]
> Your sizing says the model fits, but it runs out of memory in production. What did you most likely miss?

<details><summary>What a strong answer covers</summary>

- KV cache growth with real context lengths and concurrency, not the average case.
- Usable memory below the printed capacity, framework and CUDA overhead, fragmentation, activation peaks.
- Decimal versus binary units, or a precision assumption the stack was not actually using.
- How you would find it: measure memory on the real hardware at the real load, and update the register.

</details>

> [!interview]
> How would you justify a GPU purchase to a finance team when future utilization is uncertain?

<details><summary>What a strong answer covers</summary>

- Present the break-even utilization (hours per month at which owning beats renting) rather than one forecast.
- Show the sensitivity analysis and which assumption flips the decision.
- Include costs outside the formula (operations, power, obsolescence, licence limits) and the option value of
  renting.
- Propose a measurement or pilot that reduces the most uncertain input before committing.

</details>

## Further reading & sources

- [ZeRO: Memory Optimizations Toward Training Trillion Parameter Models](https://arxiv.org/abs/1910.02054) - the accounting of weights, gradients and optimizer state that your fine-tuning memory table needs, and how sharding changes it.
- [FlashAttention: Fast and Memory-Efficient Exact Attention with IO-Awareness](https://arxiv.org/abs/2205.14135) - why the full attention matrix does not have to be stored, relevant to the activation memory in step 3.
- [QLoRA: Efficient Finetuning of Quantized LLMs](https://arxiv.org/abs/2305.14314) - the memory story for adapting a large model on one card, relevant to the adaptation workload.
- [Efficient Memory Management for Large Language Model Serving with PagedAttention](https://arxiv.org/abs/2309.06180) - KV-cache memory and batching for the serving workload.
- [License for Customer use of GeForce Software (NVIDIA Driver License Agreement)](https://www.nvidia.com/en-us/drivers/geforce-license/) - the primary text behind the terms gate in step 5.
- [nccl-tests: Performance reported by NCCL tests](https://github.com/NVIDIA/nccl-tests/blob/master/doc/PERFORMANCE.md) - the all-reduce time formula for estimating communication in step 4.
- [Amazon EC2 pricing](https://aws.amazon.com/ec2/pricing/) - one provider's own description of on-demand, committed and spot purchase options for step 6 (structure only; fetch current prices yourself and date them).
- [Performance of llama.cpp on Apple Silicon M-series](https://github.com/ggml-org/llama.cpp/discussions/4167) - an example of published measurements you can set your own estimates against in step 7.

## Next

[Track 06: OpenAI & the Model Landscape](../../06-openai-and-the-model-landscape/README.md)
