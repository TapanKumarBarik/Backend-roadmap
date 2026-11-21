# System Design Curriculum Rewrite & PDF Standardization Tracker

This tracker monitors the modernization of all Backend Roadmap System Design lectures to match the high-fidelity study pack notes (`webapp/public/notes/system-design/SD-*.pdf`).

> **Governing Skill:** [`lecture-pdf-standardizer`](../.gemini/skills/lecture-pdf-standardizer/SKILL.md)  
> **Source PDF Notes Directory:** `webapp/public/notes/system-design/`  
> **Target Markdown Modules Directory:** `content/system-design/`

---

## The 16-Point Quality Rubric

Every module must fulfill all 16 canonical components before being marked as **Completed**:

1. [x] **Metadata & Free PDF Links:** Links to `SD-X-YYY.pdf`, estimated reading time, prerequisites, target audience.
2. [x] **In-One-Line & Golden Rule Alert:** Punchy summary with `[!NOTE]` and `[!TIP]` alerts.
3. [x] **What It Is vs. What It Isn't Table:** 3-4 related concepts contrasted (`Term`, `Precise Meaning`, `Production Example`).
4. [x] **Physical Decomposition / Taxonomy:** Breakdown of parts (e.g. 4 parts of latency, throughput units).
5. [x] **The Observability Gap:** Clarifies where metrics are captured (client vs. load balancer vs. server handler).
6. [x] **Mathematical Model & Saturation Curves:** Formal equations, $M/M/1$ queueing behavior, utilization vs. latency multipliers.
7. [x] **Percentiles & Statistical Distributions:** $p_{50}, p_{95}, p_{99}, p_{99.9}$ breakdown and worked mathematical counter-examples.
8. [x] **Compounding Scale Mathematics:** Compounding formulas (e.g. $P(\text{Slow Page}) = 1 - 0.99^N$).
9. [x] **Numbers Every Engineer Must Know:** Log-scale comparisons and relative hardware multipliers.
10. [x] **Protocol & Network Deep Dive:** Sequence diagrams of connection lifecycles (cold setup vs. persistent connection reuse).
11. [x] **Hierarchical Budgets & Sizing:** Splitting targets across components with derived timeouts.
12. [x] **Top Engineering Mitigations:** 4-5 actionable architectural solutions.
13. [x] **Production War Story (SEV-1 Post-Mortem):** Concrete incident with code, impact, Mermaid sequence diagram, RCA, and 3-step fix.
14. [x] **Multi-Language Production Code Tabs:** ````carousel with Go, TypeScript, Python, and Java/C#.
15. [x] **Complete 12 Interview Questions & Answers:** Categorized into `[BASIC]`, `[SCENARIO]`, and `[TRICKY]` with collapsible `<details>` tags.
16. [x] **One-Page Master Cheat Sheet:** Monospaced ASCII summary card.

---

## Phase 1: Core Fundamentals Tracking Table

Path: `content/system-design/01-core-fundamentals/`

| Lesson Slug | Title | PDF Note | Status | Commit / Notes |
| :--- | :--- | :--- | :---: | :--- |
| `01-what-is-system-design` | What is System Design? | `SD-A-001.pdf` | 🟡 Pending | Ready for extraction |
| `02-client-server-and-multi-tier-architecture` | Client-Server & Multi-Tier Architecture | `SD-A-002.pdf` | 🟡 Pending | Ready for extraction |
| `03-functional-requirements` | Functional Requirements | `SD-A-003.pdf` | 🟡 Pending | Ready for extraction |
| `04-non-functional-requirements` | Non-Functional Requirements | `SD-A-004.pdf` | 🟡 Pending | Ready for extraction |
| `05-trade-offs-and-how-to-justify-a-design` | Trade-offs & Design Justification | `SD-A-005.pdf` | 🟡 Pending | Ready for extraction |
| `06-vertical-scaling` | Vertical Scaling | `SD-A-006.pdf` | 🟡 Pending | Ready for extraction |
| `07-horizontal-scaling` | Horizontal Scaling | `SD-A-007.pdf` | 🟡 Pending | Ready for extraction |
| `08-latency` | Latency: Anatomy, Budgets, and Mitigation | `SD-A-008.pdf` | 🟢 **Completed** | Commit `2f00d41` (All 16 points implemented) |
| `09-throughput-and-littles-law` | Throughput & Little's Law | `SD-A-009.pdf` | 🟢 **Completed** | Commit `2f00d41` (All 16 points implemented) |
| `10-availability` | Availability: Nines, MTBF vs MTTR, and Redundancy | `SD-A-010.pdf` | 🟢 **Completed** | Upgraded with full 16-point rubric (Commit `0be2f1a`) |
| `11-reliability-availability-and-durability` | Reliability, Availability, and Durability | `SD-A-011.pdf` | 🟢 **Completed** | Upgraded with full 16-point rubric (Commit `0be2f1a`) |
| `12-scalability` | Scalability Dimensions | `SD-A-012.pdf` | 🟢 **Completed** | Upgraded with full 16-point rubric (Commit `0be2f1a`) |
| `13-cap-theorem` | CAP Theorem in Practice | `SD-A-013.pdf` | 🟢 **Completed** | Upgraded with full 16-point rubric |
| `14-pacelc-theorem` | PACELC Theorem | `SD-A-014.pdf` | 🟢 **Completed** | Upgraded with full 16-point rubric |
| `15-consistency-models` | Consistency Models: Strong to Eventual | `SD-A-015.pdf` | 🟢 **Completed** | Upgraded with full 16-point rubric |
| `16-fault-tolerance` | Fault Tolerance & Blast Radius | `SD-A-016.pdf` | 🚀 **Next Up** | Ready for immediate rewrite |
| `17-single-point-of-failure` | Single Points of Failure (SPOF) | `SD-A-017.pdf` | 🟡 Pending | Ready for extraction |
| `18-simple-beats-clever` | Simple Beats Clever | `SD-A-018.pdf` | 🟡 Pending | Ready for extraction |
| `19-stateless-vs-stateful` | Stateless vs. Stateful Architecture | `SD-A-019.pdf` | 🟡 Pending | Ready for extraction |

---

## Phase Roadmap Overview

| Phase Name | PDF Note Prefix | Total PDFs | Target Content Directory | Status |
| :--- | :---: | :---: | :--- | :---: |
| **Phase 1: Core Fundamentals** | `SD-A-*` | 19 | `content/system-design/01-core-fundamentals/` | **In Progress (2/19)** |
| **Phase 2: Networking & APIs** | `SD-B-*` | 20 | `content/system-design/02-networking-and-apis/` | 🟡 Pending |
| **Phase 2: Databases & Storage** | `SD-C-*` | 23 | `content/system-design/03-databases-and-storage/` | 🟡 Pending |
| **Phase 2: Estimation & Math** | `SD-D-*` | 14 | `content/system-design/04-estimation-and-numbers/` | 🟡 Pending |
| **Phase 3: Caching & Traffic** | `SD-E-*` | 33 | `content/system-design/05-caching-and-traffic/` | 🟡 Pending |
| **Phase 4: Distributed Systems** | `SD-F-*` to `SD-I-*` | 75 | `content/system-design/06-distributed-systems/` | 🟡 Pending |
| **Phase 5: Reliability & SRE** | `SD-J-*` to `SD-M-*` | 75 | `content/system-design/07-reliability-and-sre/` | 🟡 Pending |

---

## How to Execute the Next Module Rewrite

1. **Extract PDF Data:**
   ```bash
   python -c "
   import pypdf
   reader = pypdf.PdfReader('webapp/public/notes/system-design/SD-A-010.pdf')
   for i, page in enumerate(reader.pages):
       print(f'=== Page {i+1} ===\n', page.extract_text())
   "
   ```
2. **Draft / Enhance `README.md`:**
   Adhere strictly to the 16-point anatomy in [`lecture-pdf-standardizer`](../.gemini/skills/lecture-pdf-standardizer/SKILL.md).
3. **Verify Integrity:**
   ```bash
   npm run check; npm run lint
   ```
4. **Update This Tracker:**
   Change status to `🟢 Completed` and log commit hash.
