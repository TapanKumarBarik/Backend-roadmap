# GenAI Engineering: Python → Agents, MCP & Production LLM Systems

A hands-on curriculum that takes someone who already knows Python from zero
GenAI knowledge to being able to design, build, evaluate, and serve real
LLM-powered systems — chatbots, RAG pipelines, tool-using agents,
multi-agent orchestration, and MCP-integrated tooling — with a working
understanding of what's actually happening underneath (tokens, transformers,
GPUs, inference serving), not just which library call to make.

This is a large curriculum, being built out in batches. Tracks are added in
dependency order; if a track's folder doesn't exist yet, it hasn't been
built out yet — check back.

This folder is a sibling to [`../backend/`](../backend/README.md) and
[`../learn/`](../learn/README.md), not a replacement for either. `backend/`
is about building conventional applications; `learn/` is about operating the
infrastructure under them. `genai/` is about the specific discipline of
building *with* large language models — a different set of concepts
(tokens, attention, embeddings, context windows) and a different set of
failure modes (hallucination, prompt injection, cost blowups) than either
of those tracks covers.

## Naming convention

Same convention as `backend/` and `learn/`:

- **Tracks** are top-level folders directly under `genai/`, named
  `NN-track-name` — a zero-padded two-digit sequence number (the order you
  do them in) plus a lowercase kebab-case slug. `NN` is sequential across
  this whole curriculum.
- **Modules** are subfolders inside a track, named the same way —
  `NN-module-name` — but `NN` restarts at `00` inside each track and is
  local to that track.
- Every module folder contains exactly one `README.md`. No separate
  exercise files or scripts — everything a module needs is written inline
  as fenced Python code blocks you copy into your own project.
- The **last module in every track is always `NN-capstone-project`** — an
  open-ended, no-solution-given project that integrates everything in that
  track.
- Every track folder's own `README.md` is that track's index. This file
  (`genai/README.md`) is the single master index for all tracks.
- Unlike `lld/`, this track does **not** use dual-language `{{tabs}}` — all
  exercises are Python (the ecosystem's working language: OpenAI's SDK,
  LangChain, vLLM, and effectively every MCP SDK are Python-first).

## How to use this

- Go in order. Track numbering reflects dependency order — you cannot
  reason well about agents (track 10) without knowing what a token and a
  context window are (track 01), and you cannot debug a RAG pipeline
  (track 09) without understanding embeddings (track 08).
- Inside each track, module folders are numbered — do them in order.
- Every standard module README has: concepts explained plainly, a code
  reference table, **hands-on exercises** (do these — don't just read), an
  **independent challenge** with no code given, common mistakes, and a
  checkpoint quiz.

## Track list

| # | Track | What it covers |
|---|-------|-----------------|
| 00 | [GenAI Foundations](00-genai-foundations/README.md) | What generative AI actually is, how we got from rule-based systems to transformers, capabilities/limits, the shape of the modern GenAI stack |
| 01 | [Tokens & Language Modeling](01-tokens-and-language-modeling/README.md) | What a token is, tokenization algorithms (BPE), vocabularies and context windows, next-token prediction, embeddings as vectors |
| 02 | Transformer Architecture | Attention, self-attention step by step, multi-head attention, positional encoding, the full transformer block, encoder-only vs. decoder-only vs. encoder-decoder |
| 03 | Landmark Models — BERT, GPT & MoE | Masked language modeling (BERT), causal language modeling (GPT), how GPT-1 through GPT-4 actually differ, why decoder-only architectures won, Mixture-of-Experts (MoE) models |
| 04 | Training, Fine-Tuning & Alignment | Pretraining at a glance, supervised fine-tuning, RLHF/DPO, parameter-efficient fine-tuning (LoRA/QLoRA), quantization |
| 05 | GPUs & GenAI Hardware | Why GPUs and not CPUs, GPU architecture for software engineers, VRAM and the real bottleneck, mixed precision, distributed training basics |
| 06 | OpenAI & the Model Landscape | The OpenAI API, model families and how to choose one, function calling/structured outputs, the wider landscape (Anthropic, Google, open-weight models), small language models (SLMs) and on-device AI, pricing and context windows |
| 07 | Prompt Engineering | Anatomy of a good prompt, few-shot and chain-of-thought, system prompts, structured/JSON outputs, prompt injection |
| 08 | Embeddings & Vector Databases | Embedding models and similarity, chunking strategies, vector database overview, approximate nearest neighbor search, picking/operating a vector DB |
| 09 | Retrieval-Augmented Generation (RAG) | RAG architecture, retrieval strategies and hybrid search, reranking, evaluating RAG systems, common failure modes |
| 10 | AI Agents | What an agent actually is, the ReAct loop, tool/function calling for agents, planning and memory, single-agent design patterns — built by hand, no framework yet |
| 11 | LangChain & LangGraph | The framework layer for what track 10 just built by hand: LangChain's core abstractions, chains and memory, tools and retrievers, LangGraph's graph model, state/cycles/checkpointing |
| 12 | Agent Orchestration & Multi-Agent Systems | Why multi-agent, orchestrator-worker patterns, supervisor/swarm patterns, inter-agent communication, framework comparison |
| 13 | Model Context Protocol (MCP) | What MCP is and why it exists, host/client/server architecture, building an MCP server, MCP vs. function calling, the ecosystem |
| 14 | Inference & Serving — vLLM | The serving problem, KV cache and continuous batching, PagedAttention and vLLM, quantized/multi-GPU serving, choosing a serving stack |
| 15 | Evaluation, Observability & Safety | Evaluating LLM outputs, hallucination detection, guardrails, observability/tracing for agents, cost monitoring |
| 16 | Speech & Multimodal Models | Speech recognition (Whisper-style STT), text-to-speech, realtime speech-to-speech voice agents, vision/multimodal LLMs |

By the end of track 15 (with track 16 as an optional modality extension), you should be able to design an agentic RAG system,
justify every architectural choice in it (retrieval strategy, agent
framework, serving stack), instrument it, and defend its safety — the
"expert in agents, MCP and all" bar this track was built for.

## Prerequisites

Comfortable Python (functions, classes, `async`/`await`, virtual
environments, calling an HTTP API from code). Nothing else — no ML
background assumed. Track 00 starts from "what is generative AI" and track
02 builds the transformer up from plain linear algebra intuition, not
research-paper notation.
