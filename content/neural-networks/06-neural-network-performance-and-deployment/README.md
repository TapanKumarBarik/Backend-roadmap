# Track 06: Neural Network Performance & Deployment

Making neural networks fast and cheap in real workloads: AMP mixed precision, torch.compile fusion, DDP scaling, pruning, knowledge distillation, INT8 quantization, and ONNX/TensorRT export.

## Modules

1. [Automatic Mixed Precision (AMP): FP16, BF16, and GradScaler](00-mixed-precision-amp-fp16-bf16-and-grad-scaling/README.md)
2. [PyTorch Profiler, Memory Snapshots, and torch.compile Operator Fusion](01-torch-compile-operator-fusion-and-profiling/README.md)
3. [Distributed Data Parallel (DDP) and Gradient Accumulation](02-distributed-data-parallel-ddp-and-gradient-accumulation/README.md)
4. [Magnitude Pruning, Structured Sparsity, and Lottery Tickets](03-model-compression-pruning-and-lottery-tickets/README.md)
5. [Knowledge Distillation: Soft Targets, Logit Matching, and Feature Distillation](04-knowledge-distillation-teacher-student-training/README.md)
6. [Post-Training Quantization and Quantization-Aware Training (INT8)](05-post-training-quantization-and-qat-int8/README.md)
7. [Exporting Neural Models: ONNX Runtime and TensorRT Compilation](06-exporting-models-onnx-torchscript-and-tensorrt/README.md)
8. [Hardware-Aware Design: Arithmetic Intensity and SLA Budgets](07-hardware-aware-architecture-design-and-latency-budgets/README.md)
9. [Capstone: Distilled and Quantized ONNX Inference Service](08-capstone-profiled-distilled-and-quantized-onnx-service/README.md)
