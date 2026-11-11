# Track 05: GPUs & GenAI Hardware

Why none of this runs practically on a CPU, what a GPU is actually doing
differently at the hardware level, why VRAM rather than raw compute is
the bottleneck you hit first, and how to calculate — before you rent
anything — whether a given model will fit on a given card. Ends with the
economics: which GPU, cloud or local, and what it costs.

## Modules

1. [Why GPUs, Not CPUs](00-why-gpus-not-cpus/README.md)
2. [GPU Architecture for Software Engineers](01-gpu-architecture-for-software-engineers/README.md)
3. [CUDA Cores vs. Tensor Cores](02-cuda-cores-vs-tensor-cores/README.md)
4. [Memory Hierarchy and Bandwidth](03-memory-hierarchy-and-bandwidth/README.md)
5. [VRAM: The Real Constraint](04-vram-the-real-constraint/README.md)
6. [Calculating a Model's Memory Requirements](05-calculating-a-models-memory-requirements/README.md)
7. [Numeric Formats: FP32, FP16, BF16](06-numeric-formats-fp32-fp16-bf16/README.md)
8. [Mixed Precision Training](07-mixed-precision-training/README.md)
9. [FlashAttention and Memory-Efficient Kernels](08-flashattention-and-memory-efficient-kernels/README.md)
10. [Data Parallelism](09-data-parallelism/README.md)
11. [Model and Tensor Parallelism](10-model-and-tensor-parallelism/README.md)
12. [Pipeline Parallelism and ZeRO](11-pipeline-parallelism-and-zero/README.md)
13. [Choosing GPUs: Consumer vs. Datacenter](12-choosing-gpus-consumer-vs-datacenter/README.md)
14. [Cloud GPU Economics](13-cloud-gpu-economics/README.md)
15. [Running Models on CPU and Apple Silicon](14-running-models-on-cpu-and-apple-silicon/README.md)
16. [Capstone Project](15-capstone-project/README.md)
