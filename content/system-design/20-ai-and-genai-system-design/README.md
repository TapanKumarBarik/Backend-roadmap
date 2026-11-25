# Track: AI and GenAI System Design

LLM app architecture, prompts, RAG, serving, cost, agents, safety, evaluation and privacy for GenAI systems.

Part of **Phase 7** on the [YouTube playlist](https://www.youtube.com/playlist?list=PLUzoYXMCrSX4). Every lecture pairs a spoken walkthrough with a full 16-section written deep dive: architecture diagrams, mathematical models, 4-language production code tabs (`Go`, `TypeScript`, `Python`, `C#`), CLI verification workflows, 12 interview Q&As, and a one-page cheat sheet.

## How this track works

- Watch on YouTube (or from the site Videos page) first if you want the spoken version.
- Related deep modules elsewhere on the site (Backend, Learn, GenAI) may already host the same video beside a longer lesson. This track is the System Design short-lecture home for the same ideas.
- Every lesson below is **Live** with full notes, diagrams, and multi-language code.

## Lectures

| # | Lecture | What you'll be able to do | Status |
|---|---------|---------------------------|--------|
| 01 | [LLM Application Architecture: From Demo Chatbot to Production](01-llm-application-architecture/README.md) | Evolve a fragile prompt wrapper into a resilient, observable, cost-bounded GenAI platform | **Live** |
| 02 | [LLM Fundamentals for System Design: Tokens, Context, Temperature, Latency](02-llm-fundamentals-for-system-design/README.md) | Model prefill vs decode latency, KV-cache VRAM, context windows, and token economics | **Live** |
| 03 | [Prompt Management: Templates, Versioning & Safe Prompt Rollouts](03-prompt-management/README.md) | Version immutable prompt bundles, canary rollouts, and pin schemas in production | **Live** |
| 04 | [Conversation Context Management: History, Truncation & Summary Memory](04-conversation-context-management/README.md) | Bound multi-turn token growth using sliding windows, rolling summaries, and prefix caching | **Live** |
| 05 | [RAG Architecture Explained: Retrieval-Augmented Generation vs Fine-Tuning](05-rag-architecture-explained/README.md) | Architect ingest + retrieve + generate pipelines and choose RAG vs fine-tuning | **Live** |
| 06 | [Document Ingestion for RAG: Connectors, Parsing & Incremental Sync](06-document-ingestion-for-rag/README.md) | Build idempotent, content-hashed document ingestion pipelines with layout-aware parsing | **Live** |
| 07 | [Chunking Strategies for RAG: Fixed, Structural, Semantic, Parent-Child](07-chunking-strategies-for-rag/README.md) | Pick chunk sizes, overlap, structural boundaries, and parent-child retrieval pairs | **Live** |
| 08 | [Embedding Generation at Scale: Models, Batching & Re-Embedding Migrations](08-embedding-generation-at-scale/README.md) | Scale batch embedding workers and execute zero-downtime blue-green vector migrations | **Live** |
| 09 | [Vector Databases: pgvector vs Managed vs Search Engines, HNSW & Scale](09-vector-databases/README.md) | Compare pgvector, Qdrant/Pinecone, and Elasticsearch on HNSW RAM, recall, and TCO | **Live** |
| 10 | [Metadata Filtering in RAG: ACLs, Pre- vs Post-Filtering & Partitioning](10-metadata-filtering-in-rag/README.md) | Enforce document ACLs and pre-filtering without collapsing HNSW graph connectivity | **Live** |
| 11 | [Hybrid Retrieval & Reranking: BM25 + Vectors, RRF and Cross-Encoders](11-hybrid-retrieval-reranking/README.md) | Fuse lexical BM25 and dense vectors with RRF and cross-encoder reranking | **Live** |
| 12 | [Query Transformation in RAG: Condensation, Multi-Query, HyDE](12-query-transformation-in-rag/README.md) | Rewrite conversational queries with condensation, multi-query expansion, and HyDE | **Live** |
| 13 | [Retrieval Evaluation for RAG: Golden Sets, Recall@k, MRR & LLM Judges](13-retrieval-evaluation-for-rag/README.md) | Measure Recall@k, MRR, NDCG, and groundedness on curated golden datasets | **Live** |
| 14 | [RAG Index Freshness: Incremental Updates, Deletions & Tombstones](14-rag-index-freshness/README.md) | Keep vector indexes fresh via CDC, tombstone deletions, and sub-minute SLA pipelines | **Live** |
| 15 | [Tenant-Aware RAG: Isolation with Per-Tenant Indexes and Filters](15-tenant-aware-rag/README.md) | Guarantee zero cross-tenant leakage in RAG via namespaces, filters, and key isolation | **Live** |
| 16 | [LLM Token Usage & Cost Estimation: Pricing Math and Cost Reduction](16-llm-token-usage-cost-estimation/README.md) | Model input/output token spend and cut monthly bills with prompt and model optimization | **Live** |
| 17 | [Rate Limits & Quotas for LLM APIs: TPM, Backoff and Load Spreading](17-rate-limits-quotas-for-llm-apis/README.md) | Enforce dual RPM/TPM token buckets, jittered backoff, and multi-region load spreading | **Live** |
| 18 | [Streaming LLM Responses: SSE, FastAPI StreamingResponse & Cancellation](18-streaming-llm-responses/README.md) | Stream tokens via SSE with backpressure, disconnect cancellation, and accurate billing | **Live** |
| 19 | [Asynchronous LLM Inference: Job Queues, Priority Lanes & Batch APIs](19-asynchronous-llm-inference/README.md) | Offload long-running inference to priority queues and 50%-cheaper async Batch APIs | **Live** |
| 20 | [LLM Caching: Exact Response Cache, Prompt Caching & KV Cache Reuse](20-llm-caching/README.md) | Combine exact hash caches with provider prompt/KV-prefix caching to cut TTFT and cost | **Live** |
| 21 | [Semantic Caching for LLMs: Thresholds, False Hits & Tenant Scope](21-semantic-caching-for-llms/README.md) | Tune cosine similarity thresholds and tenant-scoped semantic caches safely | **Live** |
| 22 | [LLM Model Routing: Routers, Cascades & Fallbacks to Cut Cost 50%](22-llm-model-routing/README.md) | Route easy queries to small models and escalate hard ones via cascades and judges | **Live** |
| 23 | [Model-Provider Abstraction: Avoid LLM Vendor Lock-In with Adapters](23-model-provider-abstraction/README.md) | Decouple apps from OpenAI/Anthropic/Gemini/vLLM behind unified provider adapters | **Live** |
| 24 | [AI Gateway Architecture: Quotas, Routing, PII & Cost Attribution](24-ai-gateway-architecture/README.md) | Centralize auth, TPM quotas, PII redaction, failover, and chargebacks in an AI Gateway | **Live** |
| 25 | [Self-Hosted LLM Serving & Autoscaling: vLLM, GPUs, KEDA and Cold Starts](25-self-hosted-llm-serving-autoscaling/README.md) | Autoscale vLLM GPU pools on queue/KV-cache signals while mitigating weight cold starts | **Live** |
| 26 | [GPU Utilization for LLMs: Continuous Batching, KV Cache & PagedAttention](26-gpu-utilization-for-llms/README.md) | Maximize GPU throughput with continuous batching, PagedAttention, and prefix sharing | **Live** |
| 27 | [LLM Latency Optimization: TTFT, Quantisation & Speculative Decoding](27-llm-latency-optimization/README.md) | Cut TTFT and TPOT using INT8/FP8 quantization, speculative decoding, and disaggregated serving | **Live** |
| 28 | [Agentic Workflows: ReAct Loops, Planning, Limits & Workflow vs Agent](28-agentic-workflows/README.md) | Bound ReAct loops with step/token/cost budgets and pick deterministic workflows over agents | **Live** |
| 29 | [Safe LLM Tool Calling: Schemas, Validation, Sandboxing & MCP](29-safe-llm-tool-calling/README.md) | Validate JSON-schema tool arguments, enforce least-privilege RBAC, and sandbox execution | **Live** |
| 30 | [Agent State and Memory: Checkpointing, Long-Term Memory & Resumable Runs](30-agent-state-and-memory/README.md) | Persist durable checkpoints for crash recovery and separate working vs episodic memory | **Live** |
| 31 | [Multi-Agent Orchestration: Supervisors, Handoffs & When It Pays](31-multi-agent-orchestration/README.md) | Design supervisor-worker topologies and bound compounding errors and token amplification | **Live** |
| 32 | [Human-in-the-Loop AI: Approvals, Confidence Thresholds & Review Queues](32-human-in-the-loop-ai/README.md) | Gate high-risk actions with calibrated confidence thresholds and durable approval queues | **Live** |
| 33 | [LLM Guardrails: Moderation, PII, Jailbreaks & Output Checks](33-llm-guardrails/README.md) | Run low-latency parallel input/output rails and overlap-buffered streaming moderation | **Live** |
| 34 | [Prompt Injection & Data Leakage: Defending Against Indirect Injection](34-prompt-injection-data-leakage/README.md) | Defend against indirect prompt injection, Lethal Trifecta exfiltration, and markdown leaks | **Live** |
| 35 | [LLM Evaluation Pipelines: LLM-as-Judge, Faithfulness & CI Gates](35-llm-evaluation-pipelines/README.md) | Build calibrated LLM-as-Judge CI gates measuring faithfulness, relevance, and regressions | **Live** |
| 36 | [Observability for LLM Apps: Tracing, Tokens, Cost & OpenTelemetry GenAI](36-observability-for-llm-apps/README.md) | Trace multi-step RAG and agent spans with OpenTelemetry GenAI semantic conventions | **Live** |
| 37 | [AI Reliability: Timeouts, Retries, Fallback Models, Circuit Breakers](37-ai-reliability/README.md) | Survive upstream LLM outages with TTFT/stream timeouts, jittered retries, and model fallbacks | **Live** |
| 38 | [Fine-Tuning vs RAG vs Prompting: When to Use Each (and LoRA Basics)](38-fine-tuning-vs-rag-vs-prompting/README.md) | Choose between prompting, RAG, and LoRA/QLoRA fine-tuning based on knowledge vs style | **Live** |
| 39 | [AI Data Privacy & Compliance: Retention, Regions & PII Redaction](39-ai-data-privacy-compliance/README.md) | Enforce zero-data-retention agreements, regional inference, and reversible PII redaction | **Live** |

Start here → [LLM Application Architecture: From Demo Chatbot to Production](01-llm-application-architecture/README.md)

Back to the course index: [../README.md](../README.md)
