# Track 14: Inference & Serving — vLLM

Getting a trained model to serve many concurrent users cheaply. Starts
with the mechanics almost nobody explains — prefill vs. decode, the KV
cache and its memory math — because every serving optimization that
follows (continuous batching, PagedAttention, speculative decoding)
exists to fix a specific problem those two create.

## Modules

1. The Serving Problem
2. Inference vs. Training Workloads
3. Prefill and Decode Phases
4. The KV Cache
5. KV Cache Memory Math
6. Naive Batching and Its Waste
7. Continuous Batching
8. PagedAttention
9. vLLM: Getting Started
10. vLLM: Configuration and Tuning
11. Speculative Decoding
12. Quantized Serving: AWQ and GPTQ
13. Alternatives: TGI, TensorRT-LLM, Ollama
14. Benchmarking Throughput and Latency
15. Autoscaling and Multi-Replica Serving
16. Capstone Project
