# LLD Track — Build Status

This file exists so work can resume correctly even in a brand-new chat
session with no memory of this one. If you're picking this up cold: read
this file, then `lld/README.md` for the full curriculum shape, then
continue from "Next up" below.

## What this track is

A 23-module (00–22) Low-Level Design curriculum — OOP, SOLID, design
patterns, classic LLD interview problems — with **every code sample shown
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
| 03 | Generics, Exceptions & Value Objects | ⬜ Not started |
| 04 | SOLID Principles | ⬜ Not started |
| 05 | Core Design Principles (DRY/KISS/YAGNI/Law of Demeter/Composition/Coupling-Cohesion) | ⬜ Not started |
| 06 | Creational Patterns | ⬜ Not started |
| 07 | Structural Patterns | ⬜ Not started |
| 08 | Behavioral Patterns I | ⬜ Not started |
| 09 | Behavioral Patterns II | ⬜ Not started |
| 10 | Concurrency-Safe Design | ⬜ Not started |
| 11 | Requirements to Class Diagrams | ⬜ Not started |
| 12 | Parking Lot & Elevator (full guided solution) | ⬜ Not started |
| 13 | Library & Vending Machine (full guided solution) | ⬜ Not started |
| 14 | Tic-Tac-Toe & Chess (full guided solution) | ⬜ Not started |
| 15 | Splitwise Expense Sharing (full guided solution) | ⬜ Not started |
| 16 | Movie Ticket Booking (full guided solution) | ⬜ Not started |
| 17 | Ride-Sharing (full guided solution) | ⬜ Not started |
| 18 | LRU/LFU Cache & Rate Limiter (full guided solution) | ⬜ Not started |
| 19 | API/Library Design & Dependency Injection | ⬜ Not started |
| 20 | Anti-Patterns & Code Smells | ⬜ Not started |
| 21 | LLD Interview Playbook | ⬜ Not started |
| 22 | Capstone Project | ⬜ Not started |

## Next up

**Module 03: Generics, Exceptions & Value Objects** — generic/type-safe
classes and methods, designing an exception hierarchy, and modeling
immutable value objects (enums, records/dataclasses). Waiting on explicit
go-ahead before writing it (per the one-module-at-a-time workflow above).

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
