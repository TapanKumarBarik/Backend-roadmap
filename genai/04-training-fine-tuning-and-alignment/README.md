# Track 04: Training, Fine-Tuning & Alignment

How a raw transformer becomes a model that follows instructions and
prefers helpful, honest answers over merely statistically likely ones:
pretraining, supervised fine-tuning, RLHF and its simpler successors,
and the practical techniques (LoRA, QLoRA, quantization) that make
fine-tuning affordable on one GPU instead of a datacenter. Ends with the
decision that matters most in practice: fine-tune, prompt, or RAG?

## Modules

1. The Training Pipeline End to End
2. Pretraining Data: Collection and Cleaning
3. The Pretraining Objective and Loss
4. Scaling Laws
5. Compute Budgets and Chinchilla Optimality
6. Supervised Fine-Tuning (SFT)
7. Instruction Tuning
8. Building a Fine-Tuning Dataset
9. RLHF: Reward Models
10. RLHF: PPO and the Training Loop
11. DPO and Simpler Alternatives
12. Constitutional AI and RLAIF
13. LoRA: Low-Rank Adaptation
14. QLoRA and Quantized Fine-Tuning
15. Running a Real Fine-Tune
16. Quantization: INT8, INT4, GGUF
17. When to Fine-Tune vs. Prompt vs. RAG
18. Capstone Project
