# Low-Level Design: OOP Foundations → Design Patterns → Classic Interview Problems

A hands-on curriculum in Low-Level Design (LLD/OOD) — the "given a
requirement, design the classes" discipline that shows up as its own
interview round at most product companies. Every code example in this
track is written **twice**, in **Python and C#**, shown side by side as
switchable tabs (click "Python" or "C#" — your choice is remembered as you
move between pages). **Zero prior programming in either language is
assumed.** Modules 00–01 teach both languages from the ground up — plain
variables and control flow first, then classes and OOP building blocks —
before any design content begins.

This is a large curriculum, being built out one module at a time. Modules
are added in dependency order; if a module's folder doesn't exist yet, it
hasn't been built out yet — check back.

This folder is a sibling to [`../backend/`](../backend/README.md) and
[`../learn/`](../learn/README.md), not a replacement for either. `learn/`
is operating infrastructure. `backend/` is building and operating a
networked application end to end. `lld/` is narrower and deeper on one
thing both of those touch only briefly: **how you design the classes and
objects inside a single component** — the skill tested directly in an LLD
interview round, independent of any framework, network, or database.

## Naming convention

Same convention as `backend/` and `learn/`:

- **Modules** are top-level folders directly under `lld/`, named
  `NN-module-name` — a zero-padded two-digit sequence number (the order you
  do them in) plus a lowercase kebab-case slug.
- Every module folder contains exactly one `README.md`. No separate
  exercise files or scripts — everything a module needs is written inline.
- The **last module is always `22-capstone-project`** — an open-ended,
  no-solution-given project. It skips the quiz, interview-question, and
  independent-challenge scaffolding — it *is* the open-ended integration
  test.
- This file (`lld/README.md`) is the single index for the whole track.

## How code samples work: tabs, not two separate walls of code

Every non-trivial snippet appears as a tabbed block:

```
{{tabs}}
{{tab Python}}
...python code...
{{tab C#}}
...C# code...
{{/tabs}}
```

The browser viewer renders this as clickable **Python | C#** tabs. Read a
concept once; see it expressed idiomatically in both languages; pick
whichever you're actively practicing.

## How to use this

- Go in order — later modules assume every pattern and principle taught
  earlier. Modules 00–01 are not optional even if you already write code
  elsewhere; they're where both languages get taught from scratch, and
  every later module's tabs assume you can read both.
- Every standard module has: concepts explained plainly with a class
  diagram or code reference, **hands-on exercises** (do these, in *both*
  languages if the module says so), an **independent challenge** with no
  code given, common mistakes, a checkpoint quiz, and **interview
  questions** — real/likely questions asked on this exact topic, each with
  a model answer. Every 3–4 modules there's also a **cumulative review**
  mixing questions from everything so far.
- Modules 11–17 (the classic problems: parking lot, elevator, library,
  vending machine, tic-tac-toe, chess, Splitwise, ticket booking,
  ride-sharing, LRU/LFU cache, rate limiter) get a **full worked solution**
  — requirements → class diagram → complete Python and C# implementation →
  tradeoffs and extensions. Their independent challenge is a scoped
  *extension* to the already-solved problem, not the base problem itself.

## How to actually retain this (read this once, seriously)

- **Attempt every quiz and interview question in writing before opening
  the answer.** LLD interviews are verbal and whiteboard-based — if you
  can't articulate the answer out loud or on paper, you don't have it yet.
- **Implement the independent challenge in both languages**, not just the
  one you're more comfortable in. The point of the dual-language format is
  to prove the *design* is language-independent — if you can only build it
  in one language, you've memorized code, not learned design.
- **Redraw the class diagram from memory** before starting a new classic
  problem, using the previous problem's diagram as a warm-up.
- **Take the cumulative reviews closed-book.**

## Modules

| # | Module | What you'll be able to do after | Depends on |
|---|--------|-----------------------------------|------------|
| 00 | [00-programming-basics-python-and-csharp](00-programming-basics-python-and-csharp/README.md) | Write and run a simple program in both Python and C#: variables, data types, operators, `if`/loops, functions | nothing |
| 01 | [01-classes-objects-and-oop-building-blocks](01-classes-objects-and-oop-building-blocks/README.md) | Define classes, constructors, access modifiers, properties, and static members, and use each language's basic collections | programming-basics |
| 02 | [02-oop-foundations-and-uml](02-oop-foundations-and-uml/README.md) | Explain and apply encapsulation, abstraction, inheritance, and polymorphism, and read/draw a UML class and sequence diagram | classes-objects-and-oop-building-blocks |
| 03 | [03-generics-exceptions-and-value-objects](03-generics-exceptions-and-value-objects/README.md) | Write generic/type-safe classes and methods, design a sane exception hierarchy, and model immutable value objects (enums, records/dataclasses) | oop-foundations-and-uml |
| 04 | [04-solid-principles](04-solid-principles/README.md) | Apply all five SOLID principles and recognize violations in real code | oop-foundations-and-uml |
| 05 | [05-core-design-principles](05-core-design-principles/README.md) | Apply DRY, KISS, YAGNI, the Law of Demeter, composition-over-inheritance, and reason about coupling/cohesion | solid-principles |
| 06 | [06-creational-patterns](06-creational-patterns/README.md) | Implement and choose correctly between Singleton, Factory Method, Abstract Factory, Builder, and Prototype | core-design-principles |
| 07 | [07-structural-patterns](07-structural-patterns/README.md) | Implement and choose correctly between Adapter, Decorator, Facade, Composite, Proxy, Bridge, and Flyweight | creational-patterns |
| 08 | [08-behavioral-patterns-i](08-behavioral-patterns-i/README.md) | Implement and choose correctly between Strategy, Observer, Command, State, and Template Method | structural-patterns |
| 09 | [09-behavioral-patterns-ii](09-behavioral-patterns-ii/README.md) | Implement and choose correctly between Iterator, Chain of Responsibility, Mediator, Memento, and Visitor | behavioral-patterns-i |
| 10 | [10-concurrency-safe-design](10-concurrency-safe-design/README.md) | Design thread-safe singletons, producer-consumer pipelines, and immutable objects, and reason about where locks belong in a design | behavioral-patterns-ii |
| 11 | [11-requirements-to-class-diagrams](11-requirements-to-class-diagrams/README.md) | Turn a vague prompt into actors, use cases, entities, relationships, and a first-draft class + sequence diagram — the actual method used in an LLD interview | concurrency-safe-design |
| 12 | [12-parking-lot-and-elevator](12-parking-lot-and-elevator/README.md) | Design and fully implement a Parking Lot and an Elevator System | requirements-to-class-diagrams |
| 13 | [13-library-and-vending-machine](13-library-and-vending-machine/README.md) | Design and fully implement a Library Management system and a Vending Machine | parking-lot-and-elevator |
| 14 | [14-tic-tac-toe-and-chess](14-tic-tac-toe-and-chess/README.md) | Design and fully implement Tic-Tac-Toe and a Chess move/board engine | library-and-vending-machine |
| 15 | [15-splitwise-expense-sharing](15-splitwise-expense-sharing/README.md) | Design and fully implement an expense-splitting system (Splitwise-style) | tic-tac-toe-and-chess |
| 16 | [16-movie-ticket-booking](16-movie-ticket-booking/README.md) | Design and fully implement a seat-selection ticket-booking system (BookMyShow-style) | splitwise-expense-sharing |
| 17 | [17-ride-sharing](17-ride-sharing/README.md) | Design and fully implement a ride-matching system (Uber-style) | movie-ticket-booking |
| 18 | [18-lru-lfu-cache-and-rate-limiter](18-lru-lfu-cache-and-rate-limiter/README.md) | Design and fully implement an LRU cache, an LFU cache, and a rate limiter | ride-sharing |
| 19 | [19-api-library-design-and-di](19-api-library-design-and-di/README.md) | Design a clean, versioned, fluent public API/SDK, and apply dependency injection for testability | lru-lfu-cache-and-rate-limiter |
| 20 | [20-anti-patterns-and-code-smells](20-anti-patterns-and-code-smells/README.md) | Recognize and fix God Objects, anemic domain models, spaghetti coupling, and other common LLD code smells | api-library-design-and-di |
| 21 | [21-lld-interview-playbook](21-lld-interview-playbook/README.md) | Run a structured 45-minute LLD interview: clarify requirements, whiteboard a design, communicate tradeoffs under time pressure | everything above |
| 22 | [22-capstone-project](22-capstone-project/README.md) | Design and build a larger combined system end to end with no guidance given | everything above |

## Prerequisites already confirmed

- **Zero prior programming assumed, in either language** — not Python,
  not C#. Modules 00–01 start from `print("hello")` and build up to
  classes; nothing before module 02 assumes you've written code before.
- Practicing wherever's convenient — unlike `learn/`, nothing here depends
  on WSL2, Docker, or Azure; a Python interpreter and a C# environment
  (`dotnet` CLI or an IDE) are all you need.

Start here → [00-programming-basics-python-and-csharp/README.md](00-programming-basics-python-and-csharp/README.md)
