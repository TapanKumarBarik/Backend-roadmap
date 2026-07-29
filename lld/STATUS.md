# LLD Track — Build Status

This file exists so work can resume correctly even in a brand-new chat
session with no memory of this one. If you're picking this up cold: read
this file, then `lld/README.md` for the full curriculum shape, then
continue from "Next up" below.

## What this track is

A 24-module (00–23) Low-Level Design curriculum — OOP, SOLID, design
patterns, classic LLD interview problems, and a closing pair of
open-ended capstones (22: generic, 23: a themed Supply Chain Platform
project, added by explicit user request) — with **every code sample shown
in both Python and C#** as clickable tabs (nobody assumed to know either
language beforehand). Sibling to `backend/` and `learn/`, same
one-`README.md`-per-module convention. Full module list and dependency
order live in [`lld/README.md`](README.md) — don't duplicate that list
here, it will drift out of sync; this file only tracks *progress*.

## How the dual-language tabs work (viewer feature)

Implemented in `index.html` (repo root), not something to redo per module:

```
{{tabs}}
{{tab Python}}
```python
...
```
{{tab C#}}
```csharp
...
```
{{/tabs}}
```

`renderTabs()` in `index.html` preprocesses this into a clickable
button+pane widget before `marked.parse()` runs. The reader's last-picked
language is remembered in `localStorage` across every page. This already
works — just use the `{{tabs}}`/`{{tab Label}}` syntax in new module
content, nothing else to build.

## Workflow being followed

One module at a time: write the module → regenerate the index
(`python scripts/gen-docs-index.py`) → commit and push → **stop and wait
for explicit approval** before starting the next module. Do not batch
multiple modules without checking in — that was an explicit instruction
from the user, not a suggestion.

## Progress

| # | Module | Status |
|---|--------|--------|
| — | Track index (`lld/README.md`) | ✅ Done |
| — | Tab-rendering feature + generator update (`index.html`, `scripts/gen-docs-index.py`) | ✅ Done |
| 00 | Programming Basics (Python & C#, zero prior coding assumed) | ✅ Done |
| 01 | Classes, Objects & OOP Building Blocks | ✅ Done |
| 02 | OOP Foundations & UML | ✅ Done |
| 03 | Generics, Exceptions & Value Objects | ✅ Done |
| 04 | SOLID Principles | ✅ Done |
| 05 | Core Design Principles (DRY/KISS/YAGNI/Law of Demeter/Composition/Coupling-Cohesion) — incl. cumulative review 03-05 | ✅ Done |
| 06 | Creational Patterns | ✅ Done |
| 07 | Structural Patterns | ✅ Done |
| 08 | Behavioral Patterns I — incl. cumulative review 06-08 | ✅ Done |
| 09 | Behavioral Patterns II | ✅ Done |
| 10 | Concurrency-Safe Design | ✅ Done |
| 11 | Requirements to Class Diagrams — incl. cumulative review 09-11 | ✅ Done |
| 12 | Parking Lot & Elevator (full guided solution) | ✅ Done |
| 13 | Library & Vending Machine (full guided solution) | ✅ Done |
| 14 | Tic-Tac-Toe & Chess (full guided solution) | ✅ Done |
| 15 | Splitwise Expense Sharing (full guided solution) | ✅ Done |
| 16 | Movie Ticket Booking (full guided solution) | ✅ Done |
| 17 | Ride-Sharing (full guided solution) | ✅ Done |
| 18 | LRU/LFU Cache & Rate Limiter (full guided solution) | ✅ Done |
| 19 | API/Library Design & Dependency Injection | ✅ Done |
| 20 | Anti-Patterns & Code Smells | ⬜ Not started |
| 21 | LLD Interview Playbook | ⬜ Not started |
| 22 | Capstone Project | ⬜ Not started |
| 23 | Capstone Project 2: Supply Chain Platform (added by user request) | ⬜ Not started |

## Next up

**Module 20: Anti-Patterns & Code Smells** — conceptual format, same
template as module 19 (which is now done — see its note below).
User has given blanket go-ahead to proceed through module 23 without
stopping for per-module approval — continuing the per-module
commit/push workflow regardless, since STATUS.md's resumability
depends on it.

Modules 12–18 are the classic-problem, full-worked-solution modules.
**19, 20, and 21 go back to the conceptual format used in modules
00–11**: concepts explained with reference/example code (not two full
worked problems), hands-on exercises, independent challenge, common
mistakes, checkpoint quiz, interview questions. Before writing each of
these, re-read an early module (e.g. module 04 or 05) as the template
reference, not module 12–18 — the structure genuinely differs (no
"Problem 1/2" wrapper, no full class-diagram-driven implementation
section in the same way).

Module 19 note: confirmed module 04's exact VIOLATION/FIXED-pair-within-
one-{{tabs}}-block convention, and — important gotcha caught by
verification — **each fence must be fully self-contained**, including
its own imports, even if that means repeating an `import` that also
appears in the paired VIOLATION fence above it. First draft shared one
`from abc import ABC, abstractmethod` across both fences in the DI
section and the FIXED fence failed with `NameError` when extracted and
run alone — module 04's actual convention (checked directly) is that
VIOLATION and FIXED never share state or imports, since a reader
copies one fence at a time, not the whole tab as one script. Also
caught: a first draft had the FIXED fluent-builder's `build()` return
the VIOLATION section's `HttpRequestBad` class — fixed by giving FIXED
its own independent `HttpRequest` class, matching module 04's pattern
where FIXED never reuses a class defined in VIOLATION. Verification
method for conceptual modules going forward: extract and run **each
individual fence separately** (not concatenated per-tab-section) —
VIOLATION fences are allowed/expected to demonstrate their failure
(e.g., raising the exact exception named in a comment), FIXED fences
should run clean and their claimed output should be asserted, not just
"didn't crash."

Note for future sessions: module 12's C# code is split as top-level
statements (Program.cs) + class definitions (a separate file) because
C# requires top-level statements to precede type declarations in the
same file — every classic-problem module from here on should follow
that same real-project layout, and ideally spot-check that runnable
code snippets actually compile/run. Module 12's Python and C# were both
verified with a real interpreter/dotnet run. Modules 13 and 14's Python
were verified with a real interpreter run (module 14: extracted the
exact code blocks from the finished README with a script and re-ran
them, rather than trusting an earlier scratch-file version — catches
transcription drift, worth doing as standard practice going forward).
No dotnet SDK has been available in this session's environment on any
of modules 12–16, so C# has been hand-reviewed for correctness instead
of compiled — worth running it through `dotnet run` when next on a
machine that has the SDK. Modules 15–18's Python were also verified by
extracting the exact code block(s) from the finished file and
re-running them (same transcription-drift check as module 14).

Module 18 note: three sub-problems (LRU cache, LFU cache, rate
limiter), back to the 12–14-style multi-problem format after 15–17's
single-problem stretch. Pedagogical hook: for LRU/LFU, the driving
requirement is an O(1) complexity bound, not a behavior — worth
continuing to name "what data structures combined give the required
complexity" as its own kind of design question, distinct from "which
GOF pattern applies," when a future module is genuinely
complexity-driven rather than behavior-driven. The rate limiter's
injected clock (for deterministic fake-clock testing, no real `sleep`)
is an intentional preview of module 19's DI theme — worth continuing to
plant small previews like this rather than treating each module as
fully isolated. All three sub-problems verified: LRU and LFU against
their classic LeetCode test sequences (146 and 460) including LFU's
zero-capacity edge case and frequency-tie-break case; rate limiter with
both a deterministic fake-clock test and a 100-thread concurrency
stress test (capacity 10, no refill, exactly 10 allowed).

Module 16 note: this is the first module where the concurrency-safe
lock-per-owning-class pattern (module 10) is the *core* mechanism
instead of an independent-challenge extension (contrast with modules 12
and 13, where it was optional). Verified with an actual multi-threaded
stress test (20 threads racing for the same 2 seats on one `Show`), run
3 times, asserting exactly 1 success each time — not just a
single-threaded functional check like earlier modules. Worth repeating
this stress-test-not-just-functional-test habit for any future module
where concurrency is load-bearing rather than an add-on.

Module 15 note: this is the first **single-problem** classic module
(15–17 are each one problem, not two like 12–14; 18 goes back to
multiple — LRU cache, LFU cache, rate limiter). Structural difference
to preserve: no "Problem 1/2" wrapper heading — Requirements, Entities
and relationships, Class diagram, Implementation, and Tradeoffs and
extensions all sit directly under the module as `##` headings instead
of nested `###` under a `## Problem N` header. Caught and fixed a
heading-level slip in this module's first draft (Tradeoffs was left at
`###` from copy-pasting the two-problem pattern) — worth double-checking
heading levels specifically on every single-problem module (17) before
considering it done. (Module 16 checked clean on this.)

Module 13 note: pedagogical hook was contrasting a plain enum-with-guards
(Library's `BookStatus`) against a full State-pattern implementation
(Vending Machine) in the same module, to teach *when* State is worth its
ceremony.

Module 14 note (kept for reference): class diagrams for both modules 13 and 14 are generated
with a small Python script (box-drawing + fork/tree layout, computed
column widths) rather than hand-drawn — a hand-drawn multi-branch tree
in an early draft of module 13 came out visibly broken (mismatched box
borders), and the fix was to compute alignment instead of eyeballing it.
Worth continuing this for any future diagram with more than two boxes
or a branching hierarchy (module 14's Chess piece hierarchy is 4-plus
branches deep). The pedagogical hook for module 14: Chess is the one
module so far where plain polymorphism (module 02), not a named GOF
pattern, is presented as the correct answer — worth continuing to name
"no pattern needed here, polymorphism alone is enough" as its own
lesson in future modules, not just always reaching for a pattern name.

## Decisions already made (don't re-litigate these)

- Classic-problem modules (12–18) get a **full worked solution**
  (requirements → class diagram → complete Python+C# implementation →
  tradeoffs/extensions), not left as an exercise. Their independent
  challenge is a scoped *extension* to the solved problem.
- Extra topics folded in per user request: generics/templates, exception
  hierarchy design, and enums/records/dataclasses as value objects — these
  live in module 03, not scattered elsewhere.
- Every module (except the capstone) has an **Interview questions**
  section after the checkpoint quiz — this is the one addition beyond the
  `backend`/`learn` template, since LLD content is interview-driven.
- Full plan/rationale, if needed, is also saved at
  `C:\Users\tapan\.claude\plans\sunny-forging-wigderson.md` on this
  machine (not in the repo, so not portable across machines — this file
  is the portable source of truth).
