<div align="center">

<img src="https://backendroadmap.com/icon-512.png" alt="Backend Roadmap logo" width="110" height="110">

# Backend Roadmap

### The free, open-source, hands-on curriculum for **backend engineering, system design, cloud / DevOps and GenAI**.
**Built in the open. Learn from it. Improve it. Teach with it.**

[**Start learning →**](https://backendroadmap.com/) &nbsp;·&nbsp; [**Contribute**](#contribute) &nbsp;·&nbsp; [**Claim a module**](#claim-a-module) &nbsp;·&nbsp; [**Report a problem**](https://github.com/TapanKumarBarik/Backend-roadmap/issues)

[![Live site](https://img.shields.io/website?url=https%3A%2F%2Fbackendroadmap.com&label=backendroadmap.com&style=for-the-badge)](https://backendroadmap.com/)
[![License: MIT](https://img.shields.io/github/license/TapanKumarBarik/Backend-roadmap?style=for-the-badge)](LICENSE)
[![PRs welcome](https://img.shields.io/badge/PRs-welcome-brightgreen?style=for-the-badge)](#contribute)
[![Contributors](https://img.shields.io/github/contributors/TapanKumarBarik/Backend-roadmap?style=for-the-badge)](https://github.com/TapanKumarBarik/Backend-roadmap/graphs/contributors)

[![Stars](https://img.shields.io/github/stars/TapanKumarBarik/Backend-roadmap?style=social)](https://github.com/TapanKumarBarik/Backend-roadmap/stargazers)
[![Forks](https://img.shields.io/github/forks/TapanKumarBarik/Backend-roadmap?style=social)](https://github.com/TapanKumarBarik/Backend-roadmap/fork)
[![Deploy](https://github.com/TapanKumarBarik/Backend-roadmap/actions/workflows/cloudflare-pages.yml/badge.svg)](https://github.com/TapanKumarBarik/Backend-roadmap/actions/workflows/cloudflare-pages.yml)
[![Last commit](https://img.shields.io/github/last-commit/TapanKumarBarik/Backend-roadmap)](https://github.com/TapanKumarBarik/Backend-roadmap/commits/main)

</div>

---

## Why this exists

Most backend learning material is either a **list of topics** ("learn Redis") or a **pile of tutorials** with no order. This project is a **structured path**: every topic is a hands-on module with a concrete mental model, runnable examples, exercises, a quiz, and real sources, arranged so each module builds on the last.

It's also **a community project, not a product**. The curriculum is plain markdown in this repository, the app that serves it is open source too, and anyone can fix a mistake, write a missing module, or build a better way to learn. **If you're learning backend engineering, you're exactly the kind of person who should be helping shape it.**

## At a glance

| | |
|---|---|
| **Curricula** | 4 — Backend Engineering · Learn (Linux → Cloud) · GenAI Engineering · Low-Level Design |
| **Modules** | **734** — 58 tracks across three curricula, plus the 24-module LLD course¹ |
| **Written today** | **524** modules — over **220,000 lines** of content |
| **Waiting for an author** | **210** modules — [claim one](#claim-a-module) |
| **Cost / login to read** | Free, no account needed |
| **License** | [MIT](LICENSE) — code **and** content |

<sub>¹ The app's sidebar shows a slightly larger number (796) because it also counts each track's and curriculum's overview page.</sub>

## What you can learn

<table>
<tr>
<td width="50%" valign="top">

### Backend Engineering
*Fundamentals → distributed systems → system design* — **17 tracks, 172 modules**

HTTP and request lifecycle · APIs · authentication & authorization · databases · caching · queues, background jobs & realtime · Elasticsearch · observability · security · distributed-systems patterns · GraphQL/gRPC/advanced APIs · testing · DevOps for backend engineers · **system design interview practice** · multi-tenancy & SaaS · Kafka & streaming

[`backend/`](backend/README.md)

</td>
<td width="50%" valign="top">

### Learn — Linux → Platform Engineering
*The infrastructure every backend engineer ends up needing* — **24 tracks, 241 modules**

Linux · Docker · Kubernetes · networking · Azure networking, Container Apps & **AKS** · Git · **Terraform** · CI/CD & GitOps · security · observability · service mesh · stateful workloads · messaging · identity · governance · supply-chain security · SRE · FinOps · DR & chaos engineering · load testing · platform engineering

[`learn/`](learn/README.md)

</td>
</tr>
<tr>
<td width="50%" valign="top">

### GenAI Engineering
*Python → agents, MCP & production LLM systems* — **17 tracks, 297 modules** (210 still to be written)

Foundations · tokens & language modeling · the transformer · BERT/GPT/MoE · training, fine-tuning & alignment · GPUs & hardware · the model landscape · prompt engineering · embeddings & vector DBs · **RAG** · **AI agents** · **LangChain / LangGraph** · multi-agent orchestration · **Model Context Protocol (MCP)** · **vLLM** inference & serving · evaluation, observability & safety · speech & multimodal

[`genai/`](genai/README.md)

</td>
<td width="50%" valign="top">

### Low-Level Design
*OOP foundations → design patterns → classic interview problems* — **24 modules**

Python **and** C# side by side · OOP & UML · SOLID · design principles · all the GoF patterns · concurrency-safe design · requirements → class diagrams · parking lot, elevator, library, vending machine, chess, Splitwise, movie booking, ride-sharing, LRU/LFU cache & rate limiter · anti-patterns · the LLD interview playbook

[`lld/`](lld/README.md)

</td>
</tr>
</table>

<details>
<summary><b>See every track</b></summary>

**Backend** — `01` Request/Response · `02` API layer · `03` AuthN/AuthZ · `04` Databases · `05` Caching & performance · `06` Background processing & realtime · `07` Search (Elasticsearch) · `08` Observability · `09` Security · `10` Distributed-systems patterns · `11` Advanced API paradigms · `12` Testing & code quality · `13` DevOps for backend · `14` System design interviews · `15` Multi-tenancy & SaaS · `16` gRPC · `17` Kafka & streaming

**Learn** — `01` Linux · `02` Docker · `03` Kubernetes · `04` Networking · `05` Azure networking · `06` Azure Container Apps · `07` AKS · `08` Git · `09` Terraform on Azure · `10` CI/CD & GitOps · `11` Security · `12` Observability · `13` Service mesh · `14` Databases & stateful workloads · `15` Messaging & event-driven · `16` Identity · `17` Governance at scale · `18` Supply-chain security · `19` API Management · `20` SRE · `21` FinOps · `22` DR & chaos · `23` Performance & load testing · `24` Platform engineering

**GenAI** — `00` Foundations · `01` Tokens · `02` Transformers · `03` BERT/GPT/MoE · `04` Training & alignment · `05` GPUs · `06` Model landscape · `07` Prompt engineering · `08` Embeddings & vector DBs · `09` RAG · `10` Agents · `11` LangChain/LangGraph · `12` Multi-agent · `13` MCP · `14` vLLM serving · `15` Eval, observability & safety · `16` Speech & multimodal

**LLD** — see [`lld/README.md`](lld/README.md)

</details>

## The learning app

The curriculum is read through a purpose-built web app (React + Vite) at **[backendroadmap.com](https://backendroadmap.com/)** — also in this repo, also open source:

- **Search everything** — a command palette (<kbd>Ctrl</kbd>+<kbd>K</kbd>) over titles, tags and the *full text* of every module
- **Progress that follows you** — mark modules done or in-progress, resume where you left off, keep a streak. Works signed-out (stored locally); syncs across devices when you sign in with Google. Export/import as JSON
- **Bookmarks and private notes** on any module
- **Discussion on every module** — comments, replies, upvotes, @mentions, "mark as answer", emoji reactions
- **Community** — a feed (posts, files, links), a shared books/resources shelf, and a suggestions board with voting
- **A private workspace** — a Notion-style page tree with a block editor, to-dos and tables
- **Real URLs for every module** — `backendroadmap.com/backend/04-databases-and-data-layer/…`, so you can link to and index individual modules
- **Dark mode, mobile layout, and offline reading** of anything you've opened
- **Rich module formatting** — callout blocks, tabbed code samples, Mermaid diagrams, syntax highlighting
- **An admin dashboard** — moderation, analytics, and a content editor that commits straight to this repo

---

## Contribute

> **You do not need to be an expert.** If you're learning backend engineering and want to contribute *while* learning, that's welcome — writing a module is one of the best ways to understand a topic. If you're experienced, your review is worth more than you think.

> **Nothing here is set in stone.** If you think a module is wrong, a better structure exists, or **the whole app should be built differently**, say so. Better ideas are the point — [see how to propose one](#open-to-better-ideas--including-the-architecture).

This project is run on a simple idea:

> **"Let's build this properly."** &nbsp;— not a drive-by PR and then silence, but a few people who care about making this the best free resource for backend engineers.

### Where help is needed

| If you are a… | Good places to start |
|---|---|
| **Backend / system design engineer** | [Write a module](#claim-a-module) in your specialty · review an existing module for accuracy · add real-world failure stories and war-stories · improve a track's capstone project |
| **GenAI / ML engineer** | **210 unwritten GenAI modules** — RAG, agents, MCP, vLLM, evaluation… [claim a track](#claim-a-module) |
| **DevOps / cloud / SRE** | Add runnable labs to `learn/` · verify every command still works on current versions · write the missing sections of the Azure / Kubernetes / Terraform tracks |
| **Frontend (React) developer** | Accessibility pass · performance (a few chunks exceed 500 kB) · keyboard navigation · mobile polish · tests for the markdown pipeline |
| **UI / UX designer** | Learning-flow ideas, diagrams that teach, a design pass on the module page, a better progress dashboard |
| **Backend dev (the app's API)** | Tests for the API · suggestion status tracking · scheduled backups · pagination · OpenAPI docs |
| **Technical writer / editor** | Clarity edits, consistent terminology, shorter explanations, better examples |
| **Senior engineer / architect** | **Challenge the existing content and the architecture** — [propose a better approach](#open-to-better-ideas--including-the-architecture) |
| **Teacher / mentor / student** | Tell us where you got stuck — **a confusing paragraph is a bug**. [Open an issue](https://github.com/TapanKumarBarik/Backend-roadmap/issues/new) |
| **Translator** | Open an issue to discuss translating a track before starting |
| **Anyone with 5 minutes** | Fix a typo, a broken link, or an outdated command |

### Claim a module

**210 modules are placeholders** — their `README.md` literally says *"Content for this module has not been written yet."* They're the clearest, most valuable thing you can pick up. All of them are in the GenAI curriculum:

| Track | Unwritten | What it covers |
|---|:---:|---|
| [`05-gpus-and-genai-hardware`](genai/05-gpus-and-genai-hardware/) | 16 | Why GPUs, GPU architecture for software engineers, VRAM, mixed precision, distributed training |
| [`06-openai-and-the-model-landscape`](genai/06-openai-and-the-model-landscape/) | 19 | The OpenAI API, choosing models, function calling, Anthropic/Google/open-weight, small & on-device models |
| [`07-prompt-engineering`](genai/07-prompt-engineering/) | 17 | Anatomy of a prompt, few-shot, chain-of-thought, structured outputs, prompt injection |
| [`08-embeddings-and-vector-databases`](genai/08-embeddings-and-vector-databases/) | 18 | Embedding models, chunking, vector DBs, approximate nearest-neighbour search |
| [`09-retrieval-augmented-generation`](genai/09-retrieval-augmented-generation/) | 18 | RAG architecture, hybrid search, reranking, evaluating RAG, failure modes |
| [`10-ai-agents`](genai/10-ai-agents/) | 18 | What an agent is, the ReAct loop, tool calling, planning & memory — built by hand |
| [`11-langchain-and-langgraph`](genai/11-langchain-and-langgraph/) | 19 | Core abstractions, chains & memory, tools & retrievers, LangGraph state/cycles/checkpointing |
| [`12-agent-orchestration-and-multi-agent-systems`](genai/12-agent-orchestration-and-multi-agent-systems/) | 17 | Orchestrator-worker, supervisor/swarm patterns, inter-agent communication |
| [`13-model-context-protocol-mcp`](genai/13-model-context-protocol-mcp/) | 18 | MCP architecture, building an MCP server, MCP vs function calling, the ecosystem |
| [`14-inference-and-serving-vllm`](genai/14-inference-and-serving-vllm/) | 16 | KV cache, continuous batching, PagedAttention, vLLM, quantized & multi-GPU serving |
| [`15-evaluation-observability-and-safety`](genai/15-evaluation-observability-and-safety/) | 18 | Evaluating LLM output, hallucination detection, guardrails, tracing, cost monitoring |
| [`16-speech-and-multimodal-models`](genai/16-speech-and-multimodal-models/) | 16 | Speech-to-text, text-to-speech, realtime voice agents, vision/multimodal LLMs |

Each track's own `README.md` lists its modules in order, and the [GenAI overview](genai/README.md) explains how the tracks fit together. See them all at once:

```bash
git grep -l "has not been written yet" -- genai
```

**How to claim one (so two people don't write the same module):**

1. **Pick** a module — or a whole track if you're feeling ambitious.
2. **Claim it** — click **Claim this module** on the module's page on the site, or [open an issue](https://github.com/TapanKumarBarik/Backend-roadmap/issues/new?template=claim-a-module.yml) titled `Claim: genai/09-retrieval-augmented-generation/01-naive-rag-end-to-end` — so others can see it's taken. Say roughly when you expect to have a draft.
3. **Write it** using the [module recipe](#what-a-great-module-looks-like) below. Replace the placeholder file's content entirely.
4. **Open a pull request.** One module per PR is the easiest to review. A draft PR early is welcome — you'll get feedback before you've sunk a weekend into it.

Claimed something and life got busy? No problem — just say so on the issue and someone else can pick it up.

### Improve existing content

**Making a module that exists better is just as valuable as writing a new one** — often more, because many people have already read it. The ~520 written modules aren't finished or sacred; if you know a better way to explain something, change it.

What improvement looks like:

- **Correct it.** A wrong claim, an outdated version, a command that no longer works, a number that's off. If you're disagreeing with what a module says, link the source that backs you up.
- **Explain it better.** A clearer analogy, a shorter path to the idea, a diagram that replaces three paragraphs, a worked example where there was only theory.
- **Deepen it.** Add the failure mode people hit in production, the trade-off the module glossed over, the "why" behind a default.
- **Complete it.** Bring older modules up to the [module recipe](#what-a-great-module-looks-like) — add the missing exercises, quiz, interview question, project, or *Further reading & sources*.
- **Restructure it.** Split a module that's too long, merge two that overlap, reorder a track so concepts arrive in the right sequence. (For anything that moves or renames files, [open an issue](https://github.com/TapanKumarBarik/Backend-roadmap/issues/new) first — module URLs are shared and bookmarked.)
- **Tighten it.** Cut what doesn't teach.

**How to do it well:** keep each PR focused on one module or one idea, say *what* you changed and *why* in the description, and cite a source for factual changes. Disagreement is welcome — a respectful "I think this is wrong, here's why" is a contribution.

### Easy first contributions

- **Add "Further reading & sources" to `learn/`** — most modules in `learn/` tracks 04–24 are missing this section. Each one needs a handful of *real, authoritative* links (official docs, RFCs, papers, well-known talks) with a one-line reason each. Perfect first PR; no deep expertise needed beyond judging a good source.
- **Check the commands.** Run the shell commands and code in a module on a clean machine. If something fails or is outdated, fix it and say what you tested on.
- **Add a diagram or an exercise** where a module has a wall of text.
- **Fix a typo, a broken link, or a confusing sentence.** Click **Edit this page on GitHub** at the bottom of any module on the site — GitHub walks you through forking and opening the PR in your browser, no setup needed.

### What a great module looks like

Every module teaches in the same order, so learners always know where they are:

> **Roadmap → Concept → Explanation → Code → Visual diagram → Practice → Project → Interview question**

| Stage | In the module |
|---|---|
| **Roadmap** | Where this sits in the track, prerequisites, and what you'll be able to do afterwards (*Why this matters*) |
| **Concept** | The core idea in a sentence or two — a `> [!key]` block |
| **Explanation** | The depth: mental models, how it actually works, common traps (*Concepts*, with `###` subheadings) |
| **Code** | Real, runnable examples — not pseudo-code |
| **Visual diagram** | A diagram that *teaches* (ASCII box-drawing in `backend/`, `genai/`, `lld/`; Mermaid is welcome in `learn/`) |
| **Practice** | Hands-on exercises with answers hidden in `<details>`, plus a short checkpoint quiz |
| **Project** | A small build that uses the module (*Independent challenge*); each track ends with a capstone |
| **Interview question** | What a strong answer sounds like — an `> [!interview]` block |

Every module also ends with **Further reading & sources** — *real, authoritative links* (primary sources, official docs, papers; not blog roundups), each with a one-line reason — and a **Next** link to the following module.

Modules are plain markdown. Seven **content blocks** give technical prose structure readers can navigate by. They use [GitHub's alert syntax](https://docs.github.com/get-started/writing-on-github/getting-started-with-writing-and-formatting-on-github/basic-writing-and-formatting-syntax#alerts), so the files still read correctly right here on GitHub:

```markdown
> [!key] The one sentence the rest of the module follows from.

> [!check]
> - Explain why a queue is not a thread pool
> - Describe what happens when a worker dies mid-job
```

| Block | Renders as | For |
| --- | --- | --- |
| `[!key]` | Key idea | The claim the module rests on |
| `[!example]` | Example | A worked, concrete case |
| `[!model]` | Mental model | A diagram or analogy to think with |
| `[!pitfall]` | Pitfall | The mistake people actually make |
| `[!interview]` | Interview | What you should be able to explain out loud |
| `[!exercise]` | Exercise | Something to try yourself |
| `[!check]` | Check your understanding | Closes the module |

GitHub's own `[!NOTE]`, `[!TIP]`, `[!IMPORTANT]`, `[!WARNING]` and `[!CAUTION]` render too. Anything else stays an ordinary blockquote, and a module using no blocks renders exactly as before — so retrofitting is optional and incremental. A few house rules:

- **One `README.md` per module folder**, folders named `NN-kebab-case`.
- **Don't wrap a single short value in its own code fence** — use inline code. Fences are for real commands and multi-line diagrams.
- **Link to files explicitly** (`../02-next-module/README.md`), never a bare directory.
- **Every command and snippet should be something you actually ran.**
- Tabbed code samples (`{{tabs}}` … `{{/tabs}}`) exist for showing the same thing in several languages — see any `lld/` module.

<details>
<summary><b>Copy-paste module skeleton</b></summary>

````markdown
# Module NN: Title

## Why this matters
Where this fits in the track, what you'll be able to do afterwards, and why it's worth your time.

> [!key] The one sentence the rest of the module follows from.

## Concepts

### The first idea
Explain it. Build a mental model before any syntax.

> [!model]
> An analogy or a diagram that makes the idea stick.

```
┌────────┐   request   ┌────────┐
│ client │ ──────────► │ server │
└────────┘ ◄────────── └────────┘
             response
```

> [!pitfall]
> The mistake people actually make here, and how to avoid it.

## Command reference
| Command / API | What it does |
|---|---|
| `example --flag` | Real, verified behaviour |

## Hands-on exercises

### 1. Do the thing
Concrete steps a learner can run.

<details><summary>Answer</summary>

The expected output and why.

</details>

## Independent challenge
A small project that uses everything above. No solution given.

## Common mistakes & troubleshooting
The errors people hit, what they mean, how to fix them.

> [!interview]
> A question an interviewer would ask — and what a strong answer covers.

## Checkpoint quiz
1. Question?

<details><summary>Answers</summary>

1. Answer, with the reasoning.

</details>

> [!check]
> - I can explain X
> - I can do Y

## Further reading & sources
- [Exact Title](https://example.com/primary-source) - what it is and why this module cites it.

## Next
[Module NN+1: Title](../NN-next-module/README.md)
````

</details>

### Contributing to the app (code)

The app and API are a real, live codebase, so changes there are reviewed a little more carefully. Good areas to dig into:

- **Tests** — there's no automated test suite yet. Adding one for the markdown pipeline (`webapp/src/lib/markdown/`) or the API (`api/`) would be a huge help to everyone after you
- **Accessibility & keyboard navigation** audit of the module page
- **Performance** — code-splitting the heaviest bundles (the Mermaid and editor chunks)
- **Suggestion status tracking** (planned / in progress / done) on the suggestions board
- **Scheduled D1 backups**, API pagination, an OpenAPI description of the API
- **Ideas on the table** — pick one and open an issue to talk it through first:

  > interactive labs and in-browser code exercises · a system-design playground · architecture visualisations · personalised learning paths · an AI study assistant · interview-prep mode · richer progress analytics · community-written modules · real-world project walkthroughs

For anything bigger than a small fix, **open an issue first** so we can agree on the direction before you invest the time — larger changes are much easier to align on before the code is written than after. [CONTRIBUTING.md](CONTRIBUTING.md) has the full guide and checklist; [ROADMAP.md](ROADMAP.md) lists what's shipped and what's planned.

### Open to better ideas — including the architecture

**If you have a better way to build this, I want to hear it** — for the content, the learning experience, or the whole stack. This started as one person's project and it's deliberately not precious about its own design. Big changes are on the table, as long as they're argued well and nothing breaks for learners along the way.

Here's how it works today, and *why*, so you can argue with it properly:

- **Markdown is the source of truth.** One `README.md` per module, readable on GitHub with no tooling, so contributing content needs no setup.
- **One React single-page app renders everything**, with a build step that pre-renders every module to its own real page for search engines.
- **The API is small and serverless** — Hono on Cloudflare Pages Functions with D1 — chosen because it's free to run and needs no servers to babysit.

Things I'd genuinely like opinions on (not a promise — a list of open questions):

- Should the site move to a **content-first framework** (Astro and similar) instead of a single-page app plus a pre-render script?
- Is there a better **search** story than the current in-browser index?
- A **content pipeline** that validates every module (required sections, working links, runnable code) in CI
- A **test strategy** for the app, the API and the markdown pipeline
- **Monorepo / workspace** structure, shared tooling, developer experience
- Where **interactive learning** (labs, in-browser code, playgrounds) should live architecturally
- How to support **translations** without forking the curriculum
- **Anything else** you'd do differently

**To propose something**, [open an issue](https://github.com/TapanKumarBarik/Backend-roadmap/issues/new) titled `RFC: <your idea>` and cover:

1. **The problem** — what's wrong or missing today, and who feels it
2. **Your proposal** — enough detail to evaluate
3. **Trade-offs** — what gets worse, what it costs, what alternatives you considered
4. **Migration** — how we get there without breaking module URLs, learner progress, or existing contributions

A prototype or a proof-of-concept branch beats a long argument, but a sharp critique of the current design is a contribution too. Strong disagreement is fine; contempt isn't ([see Community](#community)).

### The 5-step workflow

1. **Fork** the repo and create a branch (`git switch -c claim-genai-09-01` or `fix-typo-http-caching`)
2. **Make your change** — content edits need no setup at all (just edit the markdown)
3. **Preview it** — [run it locally](#run-it-locally) to see the module the way a learner will
4. **Open a pull request** — say what you changed and how you checked it
5. **Respond to review** — this is a one-maintainer project, so allow a few days; thank you for your patience

Not sure where to start? **[Open an issue](https://github.com/TapanKumarBarik/Backend-roadmap/issues/new) and say what you're interested in** — I'll help you find something that fits.

---

## Run it locally

### Content or frontend work — no secrets needed

You need **Node 20+** and **Python 3**.

```bash
git clone https://github.com/<you>/Backend-roadmap.git
cd Backend-roadmap

npm install --prefix webapp
python scripts/gen-docs-index.py         # use python3 on macOS / Linux
python scripts/gen-search-index.py       # use python3 on macOS / Linux
npm run dev --prefix webapp -- --port 4173
```

Open **<http://localhost:4173>**. Edit any `.md` file under `backend/`, `learn/`, `genai/` or `lld/`, refresh, and see it rendered. Re-run the two generator scripts after you **add or rename** a module so it appears in the tree and in search.

### The whole site, including the API

The account features (sign-in, comments, notes, progress sync) need the API plus a local database. Because Google sign-in only redirects to registered addresses, you'll create your own free Google OAuth client for local use. Everything is in **[LOCAL-SETUP.md](LOCAL-SETUP.md)**.

```bash
npm install                  # repo root (the API's dependencies)
npm run build                # builds the complete site into dist/
npx wrangler pages dev --port 8788
```

Before opening a PR that touches `api/` or `webapp/`, run `npm run check` and `npm run build`.

## How it's built

| Layer | What |
|---|---|
| **Content** | Plain markdown in `backend/`, `learn/`, `genai/`, `lld/` — one `README.md` per module |
| **Frontend** | React 18 + Vite; `marked`, highlight.js, Mermaid, Tiptap (workspace editor) |
| **API** | [Hono](https://hono.dev) on **Cloudflare Pages Functions** |
| **Database** | **Cloudflare D1** (SQLite at the edge) |
| **File uploads** | Azure Blob Storage |
| **Auth** | Google OAuth, signed `HttpOnly` session cookies |
| **Hosting & CI** | Cloudflare Pages, deployed from GitHub Actions on every push to `main` |
| **SEO** | Every module is pre-rendered to its own real page at build time, with a generated sitemap |

```text
backend/ learn/ genai/ lld/   the curriculum — one markdown file per module
webapp/                       the React app
  src/components/<feature>/     one folder per screen or area
  src/hooks/                    shared React hooks
  src/lib/{markdown,curriculum,search}/   rendering, tree/progress logic, search
api/                          the Hono API
  routes/  lib/  schema.sql     endpoints, shared helpers, the D1 schema
functions/api/[[path]].js     the Cloudflare entry point that hands /api/* to api/
scripts/                      build steps (index generators, prerender) and checks
dist/                         the built site (gitignored) — the only thing deployed
```

## Community

- **Be kind.** Assume good intent, critique ideas and content rather than people, and help newcomers the way you'd want to be helped. We follow the [Code of Conduct](CODE_OF_CONDUCT.md); harassment and discrimination aren't tolerated, and maintainers may remove comments or contributions that cross that line.
- **Questions, ideas, "I'd like to help with…"** → [open an issue](https://github.com/TapanKumarBarik/Backend-roadmap/issues/new). There are no silly questions here.
- **Found a security problem?** Please don't file it publicly — see [SECURITY.md](SECURITY.md).
- **Found something wrong in a module?** Use the [content-issue template](https://github.com/TapanKumarBarik/Backend-roadmap/issues/new?template=content-issue.md), or just fix it and send a PR.

## Contributors

Everyone who has improved this project:

<a href="https://github.com/TapanKumarBarik/Backend-roadmap/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=TapanKumarBarik/Backend-roadmap" alt="Contributors" />
</a>

*Your avatar could be next.*

## Support the project

The best support is free: **⭐ star the repo, share it with someone learning backend, and send a PR.**

[![Star history](https://api.star-history.com/svg?repos=TapanKumarBarik/Backend-roadmap&type=Date)](https://star-history.com/#TapanKumarBarik/Backend-roadmap&Date)

## License

[MIT](LICENSE) © 2026 Tapan Kumar Barik.

That covers **everything** — the code *and* the curriculum. Read it, fork it, teach a class with it, translate it, build a company training program on it. Attribution is appreciated, never required. If you build something good on top of it, we'd love to hear about it.
