# Track 04: Training, Fine-Tuning & Alignment

How a raw transformer becomes a model that follows instructions and
prefers helpful, honest answers over merely statistically likely ones:
pretraining, supervised fine-tuning, RLHF and its simpler successors,
and the practical techniques (LoRA, QLoRA, quantization) that make
fine-tuning affordable on one GPU instead of a datacenter. Ends with the
decision that matters most in practice: fine-tune, prompt, or RAG?

## Modules

1. [The Training Pipeline End to End](00-the-training-pipeline-end-to-end/README.md)
2. [Pretraining Data: Collection and Cleaning](01-pretraining-data-collection-and-cleaning/README.md)
3. [The Pretraining Objective and Loss](02-the-pretraining-objective-and-loss/README.md)
4. [Scaling Laws](03-scaling-laws/README.md)
5. [Compute Budgets and Chinchilla Optimality](04-compute-budgets-and-chinchilla-optimality/README.md)
6. [Supervised Fine-Tuning (SFT)](05-supervised-fine-tuning/README.md)
7. [Instruction Tuning](06-instruction-tuning/README.md)
8. [Building a Fine-Tuning Dataset](07-building-a-fine-tuning-dataset/README.md)
9. [RLHF: Reward Models](08-rlhf-reward-models/README.md)
10. [RLHF: PPO and the Training Loop](09-rlhf-ppo-and-the-training-loop/README.md)
11. [DPO and Simpler Alternatives](10-dpo-and-simpler-alternatives/README.md)
12. [Constitutional AI and RLAIF](11-constitutional-ai-and-rlaif/README.md)
13. [LoRA: Low-Rank Adaptation](12-lora-low-rank-adaptation/README.md)
14. [QLoRA and Quantized Fine-Tuning](13-qlora-and-quantized-fine-tuning/README.md)
15. [Running a Real Fine-Tune](14-running-a-real-fine-tune/README.md)
16. [Quantization: INT8, INT4, GGUF](15-quantization-int8-int4-gguf/README.md)
17. [When to Fine-Tune vs. Prompt vs. RAG](16-when-to-fine-tune-vs-prompt-vs-rag/README.md)
18. [Capstone Project](17-capstone-project/README.md)
