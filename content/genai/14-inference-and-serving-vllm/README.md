# Track 14: Inference & Serving — vLLM

Getting a trained model to serve many concurrent users cheaply. Starts
with the mechanics almost nobody explains — prefill vs. decode, the KV
cache and its memory math — because every serving optimization that
follows (continuous batching, PagedAttention, speculative decoding)
exists to fix a specific problem those two create.

## Modules

1. [The Serving Problem](00-the-serving-problem/README.md)
2. [Inference vs. Training Workloads](01-inference-vs-training-workloads/README.md)
3. [Prefill and Decode Phases](02-prefill-and-decode-phases/README.md)
4. [The KV Cache](03-the-kv-cache/README.md)
5. [KV Cache Memory Math](04-kv-cache-memory-math/README.md)
6. [Naive Batching and Its Waste](05-naive-batching-and-its-waste/README.md)
7. [Continuous Batching](06-continuous-batching/README.md)
8. [PagedAttention](07-pagedattention/README.md)
9. [vLLM: Getting Started](08-vllm-getting-started/README.md)
10. [vLLM: Configuration and Tuning](09-vllm-configuration-and-tuning/README.md)
11. [Speculative Decoding](10-speculative-decoding/README.md)
12. [Quantized Serving: AWQ and GPTQ](11-quantized-serving-awq-and-gptq/README.md)
13. [Alternatives: TGI, TensorRT-LLM, Ollama](12-alternatives-tgi-tensorrt-llm-ollama/README.md)
14. [Benchmarking Throughput and Latency](13-benchmarking-throughput-and-latency/README.md)
15. [Autoscaling and Multi-Replica Serving](14-autoscaling-and-multi-replica-serving/README.md)
16. [Capstone Project](15-capstone-project/README.md)
