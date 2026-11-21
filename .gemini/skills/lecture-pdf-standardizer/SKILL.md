---
name: lecture-pdf-standardizer
description: Standardizes, enriches, and rewrites Backend Roadmap system design lecture modules to match high-fidelity PDF study notes (SD-*.pdf). Deconstructs PDFs into the canonical 16-section interactive curriculum anatomy including mathematical models, queueing theory curves, log-scale number grids, production incident SEV-1 post-mortems with Mermaid sequence diagrams, multi-language code carousels, CLI verification workflows, full 12-question interview Q&As ([BASIC], [SCENARIO], [TRICKY]), and 1-page master cheat sheets.
---

# Lecture PDF Standardizer Skill

This skill guides the end-to-end transformation of system design study pack PDFs (`webapp/public/notes/system-design/SD-*.pdf`) into interactive, exhaustive, and visually rich lecture markdown files (`content/system-design/**/README.md`).

---

## 1. Ground Truth Extraction Workflow

Before authoring or editing a module's `README.md`, extract the complete text, structure, tables, and Q&As from its corresponding PDF note using Python's `pypdf`:

```python
import pypdf

reader = pypdf.PdfReader("webapp/public/notes/system-design/SD-X-YYY.pdf")
print(f"Total Pages: {len(reader.pages)}")
for idx, page in enumerate(reader.pages):
    print(f"=== Page {idx + 1} ===")
    print(page.extract_text())
```

### Critical PDF Elements to Extract:
1. **The In-One-Line Summary:** Punchy executive summary of the entire concept.
2. **Taxonomic Comparison Tables:** What it is vs. what it isn't (Terms, Meanings, Examples).
3. **Decomposition Models:** Component breakdowns (e.g. 4 parts of latency, throughput tiers).
4. **Mathematical & Queueing Formulas:** E.g., Little's Law ($L = \lambda W$), $M/M/1$ queue saturation ($\frac{1}{1 - \rho}$), tail compounding ($1 - 0.99^N$).
5. **Concrete Numerical Examples:** E.g., how an average lies (90 at 40ms, 9 at 300ms, 1 at 2,000ms), why $95\%$ utilization is a cliff.
6. **Hardware & Physics Reference Grids:** Orders of magnitude comparisons (RAM vs. NVMe vs. Intra-DC vs. Transoceanic fiber).
7. **Production War Story / Incident:** The real-world breakdown scenario, metrics, sequence of events, and fix.
8. **Multi-Language Code Patterns:** Realistic implementations demonstrating the core resilience or optimization pattern.
9. **All 12 Interview Questions & Answers:** Categorized into **[BASIC]** (Q1–Q4), **[SCENARIO]** (Q5–Q8), and **[TRICKY]** (Q9–Q12).
10. **One-Page Master Cheat Sheet:** Monospaced summary card with formulas, rules of thumb, and anti-patterns.

---

## 2. Canonical 16-Section Curriculum Anatomy

Every rewritten lesson must strictly follow this 16-section structure:

### Header & Metadata
```markdown
# Lesson XX: <Title>

> **Prerequisites:** [Lesson YY: <Prereq>](../YY-prereq/README.md).  
> **Estimated Reading Time:** 28–35 minutes  
> **Target Audience:** Backend engineers, system architects, and SREs...  
> **Free PDF Notes:** [Download SD-X-YYY.pdf](https://backendroadmap.com/notes/system-design/SD-X-YYY.pdf) · [Phase X, Notes (PDF)](https://backendroadmap.com/notes/system-design/PhaseX_Notes.pdf)

> [!NOTE]
> **In one line:** <Punchy 1-2 sentence core takeaway>.

> [!TIP]
> **The Golden Rule of <Topic>:** <Actionable mental model and engineering invariant>.
```

### Section 1: Core Definition & Taxonomic Comparison Table
- What it is, and what it isn't.
- Three or four easily conflated concepts contrasted in a markdown table (`Term`, `Precise Meaning`, `Production Example`).
- Human perception, business impact, or system implications.

### Section 2: Component Breakdown & Anatomy
- Physical decomposition (e.g., Network, Queueing, Processing, I/O).
- SVG or ASCII visual diagrams depicting the end-to-end lifespan of a request.
- The **Observability Gap**: Where the metric is captured (client vs. load balancer vs. server handler) and what each point hides.

### Section 3: Mathematical Model & Exponential Saturation Curves
- Formal equations (LaTeX KaTeX: `$...$` inline, `$$...$$` block).
- Utilization vs. Latency table ($50\%, 70\%, 80\%, 85\%, 90\%, 95\%, 99\%$).
- The operational $60-70\%$ headroom rule and why $95\%$ utilization causes collapse.

### Section 4: Metrics, Percentiles & Statistical Distributions
- Percentiles table ($p_{50}, p_{95}, p_{99}, p_{99.9}$) with who each describes.
- Worked mathematical example demonstrating how arithmetic averages deceive operators.

### Section 5: Compounding Effects & System Scale
- Compounding formulas (e.g. $P(\text{Slow Page}) = 1 - 0.99^N$).
- Table evaluating $N = 1, 5, 10, 20, 50, 100$ downstream calls.

### Section 6: Numbers Every Backend Engineer Must Know
- Log-scale comparison table: Operation, Hardware Layer, Typical Latency/Throughput, Relative Multiplier, and Architectural Implication.

### Section 7: Protocol & Network Deep Dive
- Connection lifecycles: Cold connection establishment (DNS + TCP + TLS + HTTP = multiple RTTs) vs. Persistent connection reuse (HTTP/2, Keep-Alive).
- Mermaid sequence diagram showing the physical RTT breakdown.

### Section 8: Hierarchical Budgets & Capacity Sizing
- Dividing targets into per-tier budgets (Gateway, Service Logic, Cache, Database, Headroom).
- Deriving downstream timeouts directly from component budgets.

### Section 9: Top Engineering Mitigation Techniques
- The 4 to 5 proven architectural patterns to solve the problem (parallel fan-out, batching, caching, asynchronous queues, hedging, backpressure).

### Section 10: Production War Story (SEV-1 Post-Mortem)
- Concrete real-world incident post-mortem:
  - **Severity & Impact:** Detection time, resolution time, customer impact.
  - **What Happened:** Code snippet showing the flaw (e.g. N+1 loop, unbounded queue).
  - **Mermaid Sequence Diagram:** Showing the failure propagation.
  - **Root Cause Analysis (RCA):** The underlying physics or queueing failure.
  - **The Fix & Hardening:** Step-by-step remediation.

### Section 11: Multi-Language Production Code Tabs
- Use ````carousel with `<!-- slide -->` comments containing production-grade implementations in:
  1. **Go** (goroutines, channels, atomic, context).
  2. **TypeScript / Node.js** (async/await, AbortController, promises).
  3. **Python** (asyncio, Semaphore, tasks).
  4. **Java or C#** (Thread pools, Task.WhenAll, Concurrent collections).

### Section 12: Hands-On CLI Verification Workflows
- Step-by-step terminal commands (`curl`, `ping`, `python3 -c "..."`) allowing learners to simulate the physics or math locally.

### Section 13: Common Mistakes to Avoid
- Checklist of 6–8 dangerous anti-patterns frequently committed in production.

### Section 14: Key Terms Glossary
- Markdown table defining all critical concepts in clear, interview-ready phrasing.

### Section 15: Complete 12 System Design Interview Q&As
Organize all 12 questions into three collapsible categories:
- **Basic Conceptual Questions (Q1–Q4)**
- **Scenario-Based Architecture Questions (Q5–Q8)**
- **Advanced & Tricky Interview Questions (Q9–Q12)**

Use `<details><summary><strong>Q#: Question text? [TAG]</strong></summary> ... </details>` for clean interactivity.

### Section 16: One-Page Master Cheat Sheet
- Monospaced ASCII summary card covering formulas, numbers, rules of thumb, and top mitigations.

### Footer
- Further reading and academic papers.
- Free PDF download links (`[SD-X-YYY.pdf](...)`).
- Next lesson navigation link.

---

## 3. Strict Verification & Integrity Protocol

After rewriting any lesson:
1. **Carousel Validation:** Ensure every ````carousel has `<!-- slide -->` separating code blocks.
2. **Practice Build:** If any practice content references the module, run `npm run practice:build`.
3. **Full Integrity Check:** Run `npm run check; npm run lint`.
4. **Git Commit:** Commit locally with `docs(system-design): upgrade lesson XX (<Title>) to match high-fidelity PDF study notes`. Never push.
