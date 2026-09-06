# Track 05: GPUs & GenAI Hardware

Why none of this runs practically on a CPU, what a GPU is actually doing
differently at the hardware level, why VRAM rather than raw compute is
the bottleneck you hit first, and how to calculate — before you rent
anything — whether a given model will fit on a given card. Ends with the
economics: which GPU, cloud or local, and what it costs.

## Modules

1. Why GPUs, Not CPUs
2. GPU Architecture for Software Engineers
3. CUDA Cores vs. Tensor Cores
4. Memory Hierarchy and Bandwidth
5. VRAM: The Real Constraint
6. Calculating a Model's Memory Requirements
7. Numeric Formats: FP32, FP16, BF16
8. Mixed Precision Training
9. FlashAttention and Memory-Efficient Kernels
10. Data Parallelism
11. Model and Tensor Parallelism
12. Pipeline Parallelism and ZeRO
13. Choosing GPUs: Consumer vs. Datacenter
14. Cloud GPU Economics
15. Running Models on CPU and Apple Silicon
16. Capstone Project
