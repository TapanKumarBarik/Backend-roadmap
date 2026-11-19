# Track 25: Design Patterns, One at a Time

One lesson for each pattern, in Python and in C#: the problem it solves, where to use it, how to build it, when not to, and where you already use it in .NET and in the Python standard library. Modules 06 to 09 survey the patterns family by family; this track goes deep on each one, because interviewers ask about one pattern at a time ("where would you use a Singleton? how do you make it thread-safe?").

## How this track works

- Every pattern lesson has the same sections: intent, the problem, when to use it, when not to, the structure as a diagram, the code in Python and in C#, where the frameworks already use it, variants and pitfalls, and the interview questions.
- Start with lesson 01: a template for answering any pattern question. Then Singleton, Factory, Strategy, Observer and Decorator, the five asked most often.
- Lesson 29 compares the patterns that are easy to confuse; lesson 30 maps the patterns inside ASP.NET Core and Python frameworks.
- Every example is written twice, in Python and in C#, as switchable tabs.
- The track has thirty lessons. Lessons whose text is not ready yet are marked *Soon* in the sidebar; their page already lists what they will cover and the interview questions they will answer.

## Lessons

| # | Lesson | What you'll be able to do |
|---|--------|---------------------------|
| 01 | [How to Answer Any Design Pattern Question](01-how-to-answer-any-pattern-question/README.md) | Answer any pattern question with the same five steps, and pick a pattern from the symptom in front of you |
| 02 | [Singleton: Where to Use It, How, and When Not To](02-singleton/README.md) | Build a thread-safe Singleton in both languages, say where it fits (and where it does not), and prefer a DI singleton |
| 03 | [Factory Method and Simple Factory](03-factory-method-and-simple-factory/README.md) | Replace a type switch with a factory, and tell a simple factory from the Factory Method pattern |
| 04 | [Abstract Factory](04-abstract-factory/README.md) | Create families of related objects that must match, and explain how it differs from Factory Method |
| 05 | [Builder](05-builder/README.md) | Build complex objects step by step with a fluent builder, and recognise `WebApplicationBuilder` and `StringBuilder` as builders |
| 06 | [Prototype](06-prototype/README.md) | Clone objects safely, and explain shallow versus deep copy in both languages |
| 07 | [Object Pool](07-object-pool/README.md) | Reuse expensive objects with a pool, and recognise the pools .NET and Python already give you |
| 08 | [Adapter](08-adapter/README.md) | Wrap an incompatible interface so existing code can use it, for example a third-party payment SDK |
| 09 | [Bridge](09-bridge/README.md) | Separate an abstraction from its implementation so both can vary, and avoid a class explosion |
| 10 | [Composite](10-composite/README.md) | Treat single objects and groups the same way, for trees such as menus, file systems and org charts |
| 11 | [Decorator (and Why It Is Not the Same as a Python @decorator)](11-decorator/README.md) | Add behaviour to an object without changing its class, and explain how the pattern relates to Python decorators |
| 12 | [Facade](12-facade/README.md) | Give a complex subsystem one simple entry point, without hiding what callers still need |
| 13 | [Flyweight](13-flyweight/README.md) | Share common state between many small objects to save memory, and spot it in string interning |
| 14 | [Proxy](14-proxy/README.md) | Control access to an object with a proxy: lazy loading, caching, access checks, remote calls |
| 15 | [Strategy](15-strategy/README.md) | Replace a growing if/else on a type with interchangeable strategies, chosen at run time |
| 16 | [Observer (Events, Delegates and Callbacks)](16-observer/README.md) | Notify many listeners of a change without coupling to them, using C# events and Python callbacks |
| 17 | [Command](17-command/README.md) | Turn a request into an object so it can be queued, logged, retried or undone |
| 18 | [Template Method](18-template-method/README.md) | Fix the steps of an algorithm in a base class and let subclasses fill in the details |
| 19 | [State](19-state/README.md) | Model an object whose behaviour depends on its state, such as an order or a vending machine |
| 20 | [Chain of Responsibility and the Middleware Pipeline](20-chain-of-responsibility-and-middleware/README.md) | Pass a request along a chain of handlers, and see that ASP.NET Core middleware is exactly this pattern |
| 21 | [Iterator (IEnumerable and Generators)](21-iterator/README.md) | Walk a collection without exposing how it is stored, with `IEnumerable` and `yield return` in C# and generators in Python |
| 22 | [Mediator](22-mediator/README.md) | Make objects talk through a mediator instead of to each other, and explain what `MediatR` does |
| 23 | [Memento](23-memento/README.md) | Save and restore an object's state without breaking its encapsulation |
| 24 | [Visitor](24-visitor/README.md) | Add operations to a class hierarchy without changing it, and explain double dispatch |
| 25 | [Interpreter](25-interpreter/README.md) | Represent a small grammar as classes, and know when to reach for a parser library instead |
| 26 | [Dependency Injection and Inversion of Control](26-dependency-injection-and-inversion-of-control/README.md) | Explain DI, IoC and the dependency inversion principle as three different things, and wire DI by hand and with a container |
| 27 | [Repository and Unit of Work](27-repository-and-unit-of-work/README.md) | Put data access behind a repository, group changes in a unit of work, and argue whether EF Core already does both |
| 28 | [Null Object and Specification](28-null-object-and-specification/README.md) | Remove null checks with a Null Object, and compose business rules with specifications |
| 29 | [Pattern Comparison Drills](29-pattern-comparison-drills/README.md) | Tell apart the patterns interviewers like to confuse, with one sentence and one example each |
| 30 | [Patterns Inside ASP.NET Core and Python](30-patterns-inside-aspnet-core-and-python/README.md) | Point to the patterns inside the frameworks you use every day, the best way to show you understand them |

## Sources

- Gamma, Helm, Johnson, Vlissides: Design Patterns: Elements of Reusable Object-Oriented Software (Addison-Wesley, 1994)
- [Refactoring.Guru: the design pattern catalog](https://refactoring.guru/design-patterns/catalog)
- [Brandon Rhodes: Python Design Patterns](https://python-patterns.guide/)
- [Martin Fowler: Inversion of Control Containers and the Dependency Injection pattern](https://martinfowler.com/articles/injection.html)
- [Martin Fowler: Repository](https://martinfowler.com/eaaCatalog/repository.html)
- [Martin Fowler: Unit of Work](https://martinfowler.com/eaaCatalog/unitOfWork.html)
- [Microsoft Learn: ASP.NET Core middleware](https://learn.microsoft.com/en-us/aspnet/core/fundamentals/middleware/)

Start here → [01-how-to-answer-any-pattern-question/README.md](01-how-to-answer-any-pattern-question/README.md)

Back to the course index: [../README.md](../README.md)
