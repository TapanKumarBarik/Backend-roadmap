# LLD interview prep: OOP, design patterns, C# and Python

The writing plan for four new tracks in the Low-Level Design course (`content/lld/24` to `27`). Made 2026-11-19. The files exist as
planned lessons: each one carries the placeholder sentence, so the site marks it *Soon*, keeps it out of search and the sitemap, and shows
what it will cover. Writing a lesson means replacing its stub with the lesson and deleting the placeholder sentence.

## 1. What the course already has

| Area | Where | What is there | Verdict |
|---|---|---|---|
| OOP basics | `lld/01`, `lld/02`, `lld/03` | Classes, access modifiers, the four pillars, UML, generics, value objects | Teaches it; does not drill it as interview answers |
| SOLID and principles | `lld/04`, `lld/05` | SOLID, DRY, KISS, YAGNI, Law of Demeter | Good; no two-minute answers |
| Design patterns | `lld/06` to `lld/09` | One module per family: a comparison table, one war story, code for two patterns, in Python, C#, Go and TypeScript | **Thin per pattern.** Singleton, Factory, Strategy, Observer are not each explained as "where to use it, how, when not, how to make it thread-safe" |
| Concurrency | `lld/10` | Thread-safe singletons, producer-consumer, locks | Good |
| DI | `lld/19` | DI for testable libraries | No ASP.NET Core lifetimes (Singleton, Scoped, Transient) |
| Interview method | `lld/21` | The 45-minute LLD round | Good for the design round; no OOP or language Q&A |
| C# and .NET language questions | nowhere | Delegates, events, async/await, GC, IDisposable, LINQ, boxing appear only in passing | **Missing** |
| ASP.NET Core pipeline | nowhere | `app.Use` / `app.Run` / `app.Map` appear only in sample code in backend lessons; `UseMiddleware` and `app.Map` nowhere | **Missing** |
| Python language questions | nowhere | Decorators, generators, dunder methods, MRO, GIL, `__new__`, `__slots__`, context managers appear only in passing | **Missing** |
| Practice question sets | `content/practice/interview/` | 25 sets (system design, backend, GenAI, coding) | **None** for OOP, design patterns, C# or Python |

## 2. What is added

| Track | Folder | Lessons | Write first |
|---|---|---|---|
| 24. OOP Interview Questions | `content/lld/24-oop-interview-questions/` | 11 | 6 |
| 25. Design Patterns, One at a Time | `content/lld/25-design-patterns-one-at-a-time/` | 30 | 12 |
| 26. C# and .NET Interview Questions | `content/lld/26-csharp-and-dotnet-interview/` | 22 | 10 |
| 27. Python Interview Questions | `content/lld/27-python-interview/` | 20 | 10 |
| **Total** | | **83** | **38** |

Why tracks inside `lld/` and not a new course: the LLD course already promises "every example in Python and in C#", and these questions are
asked in the same interviews. Why new lessons and not longer modules 06 to 09: interviewers ask about one pattern at a time, and a reader who
searches "singleton C# thread safe" should land on a page about exactly that. Modules 06 to 09 stay as they are (the family overview).

## 3. How to write a lesson

Follow the lesson format the site already uses (the newest lessons, for example `content/ml/02-math-for-machine-learning/00-*`):

1. **Header:** `# Lesson NN: Title`, then prerequisites, reading time, and a `> [!TIP]` with the one rule to remember.
2. **Why this matters:** the interview question in its real form, and what a weak and a strong answer sound like.
3. **The idea:** a diagram (`mermaid`) and a short explanation.
4. **Code** as a carousel, one slide per language: Python and C# in Tracks 24 and 25; in Track 26 C# first, and in Track 27 Python
   first, with the other language as a second slide only where the comparison helps:

   ````text
   ````carousel
   ```python
   ...
   ```
   <!-- slide -->
   ```csharp
   ...
   ```
   ````
   ````

   Run every block, and paste the real output under it. Both versions print the same thing.
5. **Where you already use it:** the .NET type or Python module that does this (for example `Lazy<T>`, `WebApplicationBuilder`, `functools.wraps`).
6. **Pitfalls and when not to use it.**
7. **Exercises** with answers in `<details>`.
8. **Interview questions:** the stub's list, each as a `> [!interview]` block with what a strong answer covers.
9. **Sources:** official documentation first (Microsoft Learn, docs.python.org, PEPs). A real incident only if it is real and you can link it;
   no invented "war stories".
10. Delete the placeholder sentence, then run `npm run check` and look at the page in `npm run dev`.

## 4. Writing order

**Phase 1, write first (38 lessons).** The questions asked in almost every OOP, .NET or Python round:

- [24.01 The Four Pillars, Answered Well](../content/lld/24-oop-interview-questions/01-the-four-pillars-answered-well/README.md)
- [24.03 Abstract Class vs Interface](../content/lld/24-oop-interview-questions/03-abstract-class-vs-interface/README.md)
- [24.04 Overloading, Overriding and Polymorphism](../content/lld/24-oop-interview-questions/04-overloading-overriding-and-polymorphism/README.md)
- [24.08 Value vs Reference, Equality and Immutability](../content/lld/24-oop-interview-questions/08-value-vs-reference-equality-and-immutability/README.md)
- [24.09 Coupling, Cohesion and SOLID as Interview Answers](../content/lld/24-oop-interview-questions/09-coupling-cohesion-and-solid-as-answers/README.md)
- [24.10 Rapid Fire: the OOP Revision Sheet](../content/lld/24-oop-interview-questions/10-rapid-fire-oop-revision-sheet/README.md)
- [25.01 How to Answer Any Design Pattern Question](../content/lld/25-design-patterns-one-at-a-time/01-how-to-answer-any-pattern-question/README.md)
- [25.02 Singleton: Where to Use It, How, and When Not To](../content/lld/25-design-patterns-one-at-a-time/02-singleton/README.md)
- [25.03 Factory Method and Simple Factory](../content/lld/25-design-patterns-one-at-a-time/03-factory-method-and-simple-factory/README.md)
- [25.05 Builder](../content/lld/25-design-patterns-one-at-a-time/05-builder/README.md)
- [25.08 Adapter](../content/lld/25-design-patterns-one-at-a-time/08-adapter/README.md)
- [25.11 Decorator (and Why It Is Not the Same as a Python @decorator)](../content/lld/25-design-patterns-one-at-a-time/11-decorator/README.md)
- [25.15 Strategy](../content/lld/25-design-patterns-one-at-a-time/15-strategy/README.md)
- [25.16 Observer (Events, Delegates and Callbacks)](../content/lld/25-design-patterns-one-at-a-time/16-observer/README.md)
- [25.20 Chain of Responsibility and the Middleware Pipeline](../content/lld/25-design-patterns-one-at-a-time/20-chain-of-responsibility-and-middleware/README.md)
- [25.26 Dependency Injection and Inversion of Control](../content/lld/25-design-patterns-one-at-a-time/26-dependency-injection-and-inversion-of-control/README.md)
- [25.27 Repository and Unit of Work](../content/lld/25-design-patterns-one-at-a-time/27-repository-and-unit-of-work/README.md)
- [25.29 Pattern Comparison Drills](../content/lld/25-design-patterns-one-at-a-time/29-pattern-comparison-drills/README.md)
- [26.02 Value and Reference Types, Structs and Records](../content/lld/26-csharp-and-dotnet-interview/02-value-and-reference-types-structs-records/README.md)
- [26.05 Delegates, Events and Lambdas](../content/lld/26-csharp-and-dotnet-interview/05-delegates-events-and-lambdas/README.md)
- [26.07 Collections, LINQ and Deferred Execution](../content/lld/26-csharp-and-dotnet-interview/07-collections-linq-and-deferred-execution/README.md)
- [26.09 Memory, Garbage Collection and IDisposable](../content/lld/26-csharp-and-dotnet-interview/09-memory-garbage-collection-and-idisposable/README.md)
- [26.10 async/await, Tasks and the Deadlock Trap](../content/lld/26-csharp-and-dotnet-interview/10-async-await-and-tasks/README.md)
- [26.13 ASP.NET Core Startup: Program.cs, the Builder and the Host](../content/lld/26-csharp-and-dotnet-interview/13-aspnet-core-startup-program-cs/README.md)
- [26.14 The Middleware Pipeline: app.Use, app.Run and app.Map](../content/lld/26-csharp-and-dotnet-interview/14-middleware-pipeline-use-run-map/README.md)
- [26.15 Dependency Injection Lifetimes: Singleton, Scoped and Transient](../content/lld/26-csharp-and-dotnet-interview/15-dependency-injection-lifetimes/README.md)
- [26.20 EF Core Interview Questions](../content/lld/26-csharp-and-dotnet-interview/20-ef-core-interview-questions/README.md)
- [26.22 Rapid Fire: the C# and .NET Revision Sheet](../content/lld/26-csharp-and-dotnet-interview/22-rapid-fire-csharp-and-dotnet/README.md)
- [27.02 Mutability, Identity and Copying](../content/lld/27-python-interview/02-mutability-identity-and-copying/README.md)
- [27.03 Functions: *args, **kwargs, Closures and Scope](../content/lld/27-python-interview/03-functions-args-kwargs-closures-and-scope/README.md)
- [27.04 Decorators](../content/lld/27-python-interview/04-decorators/README.md)
- [27.05 Iterators, Generators and yield](../content/lld/27-python-interview/05-iterators-generators-and-yield/README.md)
- [27.06 Classes: How an Object Is Made, Class Attributes and Slots](../content/lld/27-python-interview/06-classes-init-new-and-slots/README.md)
- [27.07 Dunder Methods and the Data Model](../content/lld/27-python-interview/07-dunder-methods-and-the-data-model/README.md)
- [27.08 Inheritance, super() and the MRO](../content/lld/27-python-interview/08-inheritance-super-and-the-mro/README.md)
- [27.14 The GIL, Threads, Processes and asyncio](../content/lld/27-python-interview/14-the-gil-threads-processes-and-asyncio/README.md)
- [27.18 Web Apps: app.run, WSGI, ASGI, Middleware and FastAPI Depends](../content/lld/27-python-interview/18-web-apps-app-run-wsgi-asgi-and-fastapi/README.md)
- [27.20 Rapid Fire: the Python Revision Sheet](../content/lld/27-python-interview/20-rapid-fire-python/README.md)

**Phase 2, next (32 lessons):**

- [24.02 Classes, Objects, Constructors and Object Lifetime](../content/lld/24-oop-interview-questions/02-classes-objects-constructors-and-lifetime/README.md)
- [24.05 Inheritance, Composition and the Diamond Problem](../content/lld/24-oop-interview-questions/05-inheritance-composition-and-the-diamond-problem/README.md)
- [24.06 Access Modifiers, Properties and Encapsulation](../content/lld/24-oop-interview-questions/06-access-modifiers-properties-and-encapsulation/README.md)
- [24.07 Static Members, Static Classes, and When Static Is a Smell](../content/lld/24-oop-interview-questions/07-static-members-and-static-classes/README.md)
- [25.04 Abstract Factory](../content/lld/25-design-patterns-one-at-a-time/04-abstract-factory/README.md)
- [25.10 Composite](../content/lld/25-design-patterns-one-at-a-time/10-composite/README.md)
- [25.12 Facade](../content/lld/25-design-patterns-one-at-a-time/12-facade/README.md)
- [25.14 Proxy](../content/lld/25-design-patterns-one-at-a-time/14-proxy/README.md)
- [25.17 Command](../content/lld/25-design-patterns-one-at-a-time/17-command/README.md)
- [25.18 Template Method](../content/lld/25-design-patterns-one-at-a-time/18-template-method/README.md)
- [25.19 State](../content/lld/25-design-patterns-one-at-a-time/19-state/README.md)
- [25.21 Iterator (IEnumerable and Generators)](../content/lld/25-design-patterns-one-at-a-time/21-iterator/README.md)
- [25.22 Mediator](../content/lld/25-design-patterns-one-at-a-time/22-mediator/README.md)
- [25.30 Patterns Inside ASP.NET Core and Python](../content/lld/25-design-patterns-one-at-a-time/30-patterns-inside-aspnet-core-and-python/README.md)
- [26.01 How .NET Runs Your Code: CLR, IL and JIT](../content/lld/26-csharp-and-dotnet-interview/01-how-dotnet-runs-your-code/README.md)
- [26.03 Strings, Constants and Immutability](../content/lld/26-csharp-and-dotnet-interview/03-strings-constants-and-immutability/README.md)
- [26.04 Parameters: ref, out, in and params](../content/lld/26-csharp-and-dotnet-interview/04-parameters-ref-out-in-and-params/README.md)
- [26.06 Generics, Constraints and Variance](../content/lld/26-csharp-and-dotnet-interview/06-generics-constraints-and-variance/README.md)
- [26.08 Exceptions Done Right](../content/lld/26-csharp-and-dotnet-interview/08-exceptions-done-right/README.md)
- [26.11 Threading, Locks and Thread Safety](../content/lld/26-csharp-and-dotnet-interview/11-threading-locks-and-thread-safety/README.md)
- [26.16 Routing, Controllers vs Minimal APIs, Model Binding and Filters](../content/lld/26-csharp-and-dotnet-interview/16-routing-controllers-minimal-apis-and-filters/README.md)
- [26.17 Configuration, Logging and Environments](../content/lld/26-csharp-and-dotnet-interview/17-configuration-logging-and-environments/README.md)
- [26.18 Error Handling and ProblemDetails](../content/lld/26-csharp-and-dotnet-interview/18-error-handling-and-problem-details/README.md)
- [26.19 Authentication and Authorization in ASP.NET Core](../content/lld/26-csharp-and-dotnet-interview/19-authentication-and-authorization/README.md)
- [27.01 How Python Runs Your Code: Objects, Names and Bytecode](../content/lld/27-python-interview/01-how-python-runs-your-code/README.md)
- [27.09 ABCs, Protocols, Duck Typing and Type Hints](../content/lld/27-python-interview/09-abcs-protocols-duck-typing-and-type-hints/README.md)
- [27.10 dataclasses, NamedTuple, Enum and pydantic](../content/lld/27-python-interview/10-dataclasses-namedtuples-enums-and-pydantic/README.md)
- [27.11 Context Managers and with](../content/lld/27-python-interview/11-context-managers/README.md)
- [27.12 Exceptions Done Right](../content/lld/27-python-interview/12-exceptions-done-right/README.md)
- [27.13 Memory, Garbage Collection and Performance](../content/lld/27-python-interview/13-memory-garbage-collection-and-performance/README.md)
- [27.15 asyncio in Depth](../content/lld/27-python-interview/15-asyncio-in-depth/README.md)
- [27.17 Modules, Packages and Imports](../content/lld/27-python-interview/17-modules-packages-and-imports/README.md)

**Phase 3, later (13 lessons):**

- [24.11 Whiteboard Drills: Design a Class Hierarchy](../content/lld/24-oop-interview-questions/11-whiteboard-drills-design-a-class-hierarchy/README.md)
- [25.06 Prototype](../content/lld/25-design-patterns-one-at-a-time/06-prototype/README.md)
- [25.07 Object Pool](../content/lld/25-design-patterns-one-at-a-time/07-object-pool/README.md)
- [25.09 Bridge](../content/lld/25-design-patterns-one-at-a-time/09-bridge/README.md)
- [25.13 Flyweight](../content/lld/25-design-patterns-one-at-a-time/13-flyweight/README.md)
- [25.23 Memento](../content/lld/25-design-patterns-one-at-a-time/23-memento/README.md)
- [25.24 Visitor](../content/lld/25-design-patterns-one-at-a-time/24-visitor/README.md)
- [25.25 Interpreter](../content/lld/25-design-patterns-one-at-a-time/25-interpreter/README.md)
- [25.28 Null Object and Specification](../content/lld/25-design-patterns-one-at-a-time/28-null-object-and-specification/README.md)
- [26.12 Extension Methods, Partial Classes, Attributes and Reflection](../content/lld/26-csharp-and-dotnet-interview/12-extension-methods-attributes-and-reflection/README.md)
- [26.21 Testing: xUnit, Mocks and Integration Tests](../content/lld/26-csharp-and-dotnet-interview/21-testing-xunit-mocks-and-integration-tests/README.md)
- [27.16 Metaclasses, Descriptors and How @property Works](../content/lld/27-python-interview/16-metaclasses-descriptors-and-property/README.md)
- [27.19 Testing: pytest, Fixtures and Mocking](../content/lld/27-python-interview/19-testing-pytest-fixtures-and-mocking/README.md)

## 5. Every lesson, with the questions it must answer

### Track 24: OOP Interview Questions

**01. The Four Pillars, Answered Well** (Write first) `content/lld/24-oop-interview-questions/01-the-four-pillars-answered-well/README.md`
- What are the four pillars of OOP? Give an example of each.
- What is the difference between abstraction and encapsulation?
- Is OOP possible without inheritance?
- Which pillar does an interface give you?

**02. Classes, Objects, Constructors and Object Lifetime** (Next) `content/lld/24-oop-interview-questions/02-classes-objects-constructors-and-lifetime/README.md`
- What is the difference between a class and an object?
- What is constructor chaining?
- What is a static constructor and when does it run?
- What is the difference between `__new__` and `__init__`?
- Can a constructor be private? Why would you want one?

**03. Abstract Class vs Interface** (Write first) `content/lld/24-oop-interview-questions/03-abstract-class-vs-interface/README.md`
- What is the difference between an abstract class and an interface?
- When would you choose an abstract class over an interface?
- Can an interface have a method body in C#?
- Does Python have interfaces?
- Can you instantiate an abstract class?

**04. Overloading, Overriding and Polymorphism** (Write first) `content/lld/24-oop-interview-questions/04-overloading-overriding-and-polymorphism/README.md`
- What is the difference between overloading and overriding?
- What is the difference between `override` and `new` in C#?
- Does Python support method overloading?
- What is runtime polymorphism, and how does the language find the right method?
- Can you override a static method?

**05. Inheritance, Composition and the Diamond Problem** (Next) `content/lld/24-oop-interview-questions/05-inheritance-composition-and-the-diamond-problem/README.md`
- Why is composition often preferred to inheritance?
- What is the diamond problem?
- Does C# support multiple inheritance?
- How does `super()` decide which method to call in Python?
- What is a mixin?

**06. Access Modifiers, Properties and Encapsulation** (Next) `content/lld/24-oop-interview-questions/06-access-modifiers-properties-and-encapsulation/README.md`
- What access modifiers does C# have?
- What is the default access modifier of a class member in C#?
- How do you make an attribute private in Python?
- What is the difference between a field and a property?
- What is name mangling?

**07. Static Members, Static Classes, and When Static Is a Smell** (Next) `content/lld/24-oop-interview-questions/07-static-members-and-static-classes/README.md`
- What is the difference between a static class and a Singleton?
- What is the difference between `@staticmethod` and `@classmethod`?
- Can a static method access instance members?
- When is static a bad idea?

**08. Value vs Reference, Equality and Immutability** (Write first) `content/lld/24-oop-interview-questions/08-value-vs-reference-equality-and-immutability/README.md`
- What is the difference between a struct and a class?
- Why must `GetHashCode` change when you override `Equals`?
- What is the difference between `is` and `==` in Python?
- Why is a list a bad default argument?
- What is a `record` in C#?

**09. Coupling, Cohesion and SOLID as Interview Answers** (Write first) `content/lld/24-oop-interview-questions/09-coupling-cohesion-and-solid-as-answers/README.md`
- Explain SOLID with an example of each.
- What is the difference between dependency inversion and dependency injection?
- Give an example of a Liskov violation.
- What do high cohesion and low coupling mean?
- How does the Open/Closed principle show up in real code?

**10. Rapid Fire: the OOP Revision Sheet** (Write first) `content/lld/24-oop-interview-questions/10-rapid-fire-oop-revision-sheet/README.md`
- All of the questions above, in rapid-fire form.

**11. Whiteboard Drills: Design a Class Hierarchy** (Later) `content/lld/24-oop-interview-questions/11-whiteboard-drills-design-a-class-hierarchy/README.md`
- Design classes for a notification system that sends email, SMS and push.
- Model employees with different pay rules.
- Design a shape hierarchy where new shapes do not change existing code.

Sources for this track: [Microsoft Learn: object-oriented programming in C#](https://learn.microsoft.com/en-us/dotnet/csharp/fundamentals/tutorials/oop); [Python tutorial: classes](https://docs.python.org/3/tutorial/classes.html); [Python: the method resolution order (MRO)](https://docs.python.org/3/howto/mro.html); [PEP 544: Protocols (structural subtyping)](https://peps.python.org/pep-0544/).

### Track 25: Design Patterns, One at a Time

**01. How to Answer Any Design Pattern Question** (Write first) `content/lld/25-design-patterns-one-at-a-time/01-how-to-answer-any-pattern-question/README.md`
- What is a design pattern?
- What are the three categories of GoF patterns?
- Which patterns have you used in a real project?
- Can overusing patterns be a problem?

**02. Singleton: Where to Use It, How, and When Not To** (Write first) `content/lld/25-design-patterns-one-at-a-time/02-singleton/README.md`
- Where would you use a Singleton? Give a real example.
- How do you make a Singleton thread-safe in C#?
- How do you write a Singleton in Python?
- What is the difference between a Singleton and a static class?
- Why is Singleton called an anti-pattern?
- What is the difference between the Singleton pattern and `AddSingleton`?

**03. Factory Method and Simple Factory** (Write first) `content/lld/25-design-patterns-one-at-a-time/03-factory-method-and-simple-factory/README.md`
- What is the Factory pattern and why use it?
- What is the difference between a simple factory and the Factory Method?
- How does a factory help with the Open/Closed principle?
- Give a .NET example of a factory.

**04. Abstract Factory** (Next) `content/lld/25-design-patterns-one-at-a-time/04-abstract-factory/README.md`
- What is the difference between Factory Method and Abstract Factory?
- When would you use an Abstract Factory?
- Give a real-world example.

**05. Builder** (Write first) `content/lld/25-design-patterns-one-at-a-time/05-builder/README.md`
- What problem does the Builder pattern solve?
- What is the difference between Builder and Factory?
- Where is the Builder pattern used in ASP.NET Core?
- Do you need a Builder in Python?

**06. Prototype** (Later) `content/lld/25-design-patterns-one-at-a-time/06-prototype/README.md`
- What is the Prototype pattern?
- What is the difference between a shallow and a deep copy?
- Why is `ICloneable` discouraged in .NET?

**07. Object Pool** (Later) `content/lld/25-design-patterns-one-at-a-time/07-object-pool/README.md`
- What is an object pool and when is it worth it?
- How does database connection pooling work?
- What goes wrong if an object is returned to the pool in a dirty state?

**08. Adapter** (Write first) `content/lld/25-design-patterns-one-at-a-time/08-adapter/README.md`
- What is the Adapter pattern? Give a real example.
- What is the difference between Adapter and Facade?
- Why wrap a third-party library behind your own interface?

**09. Bridge** (Later) `content/lld/25-design-patterns-one-at-a-time/09-bridge/README.md`
- What problem does the Bridge pattern solve?
- What is the difference between Bridge and Adapter?

**10. Composite** (Next) `content/lld/25-design-patterns-one-at-a-time/10-composite/README.md`
- What is the Composite pattern?
- Give an example of a Composite in a real system.

**11. Decorator (and Why It Is Not the Same as a Python @decorator)** (Write first) `content/lld/25-design-patterns-one-at-a-time/11-decorator/README.md`
- What is the Decorator pattern?
- Is a Python `@decorator` the Decorator pattern?
- Give a .NET example of the Decorator pattern.
- Decorator or inheritance: which and why?

**12. Facade** (Next) `content/lld/25-design-patterns-one-at-a-time/12-facade/README.md`
- What is the Facade pattern?
- What is the difference between Facade and Adapter?

**13. Flyweight** (Later) `content/lld/25-design-patterns-one-at-a-time/13-flyweight/README.md`
- What is the Flyweight pattern?
- What is string interning?

**14. Proxy** (Next) `content/lld/25-design-patterns-one-at-a-time/14-proxy/README.md`
- What is the Proxy pattern?
- What is the difference between Proxy and Decorator?
- How does lazy loading use a proxy?

**15. Strategy** (Write first) `content/lld/25-design-patterns-one-at-a-time/15-strategy/README.md`
- What is the Strategy pattern? Give an example.
- How does Strategy help with the Open/Closed principle?
- What is the difference between Strategy and State?
- Can a strategy just be a function?

**16. Observer (Events, Delegates and Callbacks)** (Write first) `content/lld/25-design-patterns-one-at-a-time/16-observer/README.md`
- What is the Observer pattern?
- How do C# events implement the Observer pattern?
- How can an event handler cause a memory leak?
- What is the difference between Observer and Pub/Sub?

**17. Command** (Next) `content/lld/25-design-patterns-one-at-a-time/17-command/README.md`
- What is the Command pattern?
- How would you implement undo?
- Where is the Command pattern used in real systems?

**18. Template Method** (Next) `content/lld/25-design-patterns-one-at-a-time/18-template-method/README.md`
- What is the Template Method pattern?
- What is the difference between Template Method and Strategy?

**19. State** (Next) `content/lld/25-design-patterns-one-at-a-time/19-state/README.md`
- What is the State pattern?
- What is the difference between State and Strategy?
- How would you model order status changes?

**20. Chain of Responsibility and the Middleware Pipeline** (Write first) `content/lld/25-design-patterns-one-at-a-time/20-chain-of-responsibility-and-middleware/README.md`
- What is the Chain of Responsibility pattern?
- How is ASP.NET Core middleware an example of it?
- What happens if a handler does not call the next one?

**21. Iterator (IEnumerable and Generators)** (Next) `content/lld/25-design-patterns-one-at-a-time/21-iterator/README.md`
- What is the Iterator pattern?
- How does `yield return` work?
- What is the difference between an iterable and an iterator in Python?

**22. Mediator** (Next) `content/lld/25-design-patterns-one-at-a-time/22-mediator/README.md`
- What is the Mediator pattern?
- What does `MediatR` do?
- What is the difference between Mediator and Observer?

**23. Memento** (Later) `content/lld/25-design-patterns-one-at-a-time/23-memento/README.md`
- What is the Memento pattern?
- How would you implement undo with a memento?

**24. Visitor** (Later) `content/lld/25-design-patterns-one-at-a-time/24-visitor/README.md`
- What is the Visitor pattern?
- What is double dispatch?

**25. Interpreter** (Later) `content/lld/25-design-patterns-one-at-a-time/25-interpreter/README.md`
- What is the Interpreter pattern, and when is it a good fit?

**26. Dependency Injection and Inversion of Control** (Write first) `content/lld/25-design-patterns-one-at-a-time/26-dependency-injection-and-inversion-of-control/README.md`
- What is dependency injection, and why use it?
- What is the difference between IoC, DI and DIP?
- What is a DI container?
- Why is the service locator called an anti-pattern?

**27. Repository and Unit of Work** (Write first) `content/lld/25-design-patterns-one-at-a-time/27-repository-and-unit-of-work/README.md`
- What is the Repository pattern?
- What is a Unit of Work?
- Should you wrap EF Core in a repository?
- What is wrong with a generic repository?

**28. Null Object and Specification** (Later) `content/lld/25-design-patterns-one-at-a-time/28-null-object-and-specification/README.md`
- What is the Null Object pattern?
- What is the Specification pattern?

**29. Pattern Comparison Drills** (Write first) `content/lld/25-design-patterns-one-at-a-time/29-pattern-comparison-drills/README.md`
- Strategy or State?
- Decorator, Proxy or Adapter?
- Factory, Abstract Factory or Builder?
- Observer or Mediator?

**30. Patterns Inside ASP.NET Core and Python** (Next) `content/lld/25-design-patterns-one-at-a-time/30-patterns-inside-aspnet-core-and-python/README.md`
- Which design patterns does ASP.NET Core use?
- Which design patterns can you find in the Python standard library?

Sources for this track: Gamma, Helm, Johnson, Vlissides: Design Patterns: Elements of Reusable Object-Oriented Software (Addison-Wesley, 1994); [Refactoring.Guru: the design pattern catalog](https://refactoring.guru/design-patterns/catalog); [Brandon Rhodes: Python Design Patterns](https://python-patterns.guide/); [Martin Fowler: Inversion of Control Containers and the Dependency Injection pattern](https://martinfowler.com/articles/injection.html); [Martin Fowler: Repository](https://martinfowler.com/eaaCatalog/repository.html); [Martin Fowler: Unit of Work](https://martinfowler.com/eaaCatalog/unitOfWork.html); [Microsoft Learn: ASP.NET Core middleware](https://learn.microsoft.com/en-us/aspnet/core/fundamentals/middleware/).

### Track 26: C# and .NET Interview Questions

**01. How .NET Runs Your Code: CLR, IL and JIT** (Next) `content/lld/26-csharp-and-dotnet-interview/01-how-dotnet-runs-your-code/README.md`
- What is the CLR?
- What is IL, and what does the JIT do?
- What is the difference between .NET and .NET Framework?
- What is managed code?

**02. Value and Reference Types, Structs and Records** (Write first) `content/lld/26-csharp-and-dotnet-interview/02-value-and-reference-types-structs-records/README.md`
- What is the difference between a value type and a reference type?
- When would you use a struct?
- What is boxing?
- What is a `record`, and how is its equality different?
- What does the `?` after a type mean?

**03. Strings, Constants and Immutability** (Next) `content/lld/26-csharp-and-dotnet-interview/03-strings-constants-and-immutability/README.md`
- Why are strings immutable in C#?
- When should you use `StringBuilder`?
- What is the difference between `const` and `readonly`?
- What is the difference between `string` and `String`?

**04. Parameters: ref, out, in and params** (Next) `content/lld/26-csharp-and-dotnet-interview/04-parameters-ref-out-in-and-params/README.md`
- What is the difference between `ref` and `out`?
- What does the `in` keyword do?
- What happens when you pass an object to a method without `ref`?

**05. Delegates, Events and Lambdas** (Write first) `content/lld/26-csharp-and-dotnet-interview/05-delegates-events-and-lambdas/README.md`
- What is a delegate?
- What is the difference between a delegate and an event?
- What are `Func` and `Action`?
- What is a closure?

**06. Generics, Constraints and Variance** (Next) `content/lld/26-csharp-and-dotnet-interview/06-generics-constraints-and-variance/README.md`
- What are generics, and why use them?
- What generic constraints does C# have?
- What is covariance and contravariance?

**07. Collections, LINQ and Deferred Execution** (Write first) `content/lld/26-csharp-and-dotnet-interview/07-collections-linq-and-deferred-execution/README.md`
- What is the difference between `IEnumerable` and `IQueryable`?
- What is deferred execution in LINQ?
- What is the difference between `First`, `FirstOrDefault` and `Single`?
- Which collection gives O(1) lookup?

**08. Exceptions Done Right** (Next) `content/lld/26-csharp-and-dotnet-interview/08-exceptions-done-right/README.md`
- What is the difference between `throw` and `throw ex`?
- Does `finally` always run?
- When should you create a custom exception?
- What is an exception filter?

**09. Memory, Garbage Collection and IDisposable** (Write first) `content/lld/26-csharp-and-dotnet-interview/09-memory-garbage-collection-and-idisposable/README.md`
- How does garbage collection work in .NET?
- What is the difference between Dispose and Finalize?
- What does the `using` statement do?
- Can you have a memory leak in .NET?

**10. async/await, Tasks and the Deadlock Trap** (Write first) `content/lld/26-csharp-and-dotnet-interview/10-async-await-and-tasks/README.md`
- What does async/await do?
- What is the difference between a Task and a Thread?
- Why should you avoid `async void`?
- What causes a deadlock with `.Result`?
- What does `ConfigureAwait(false)` do?

**11. Threading, Locks and Thread Safety** (Next) `content/lld/26-csharp-and-dotnet-interview/11-threading-locks-and-thread-safety/README.md`
- What is a race condition?
- What does the `lock` keyword do?
- Why can you not use `await` inside a `lock`?
- When would you use `ConcurrentDictionary`?

**12. Extension Methods, Partial Classes, Attributes and Reflection** (Later) `content/lld/26-csharp-and-dotnet-interview/12-extension-methods-attributes-and-reflection/README.md`
- What is an extension method?
- What is a partial class?
- What is reflection, and what does it cost?

**13. ASP.NET Core Startup: Program.cs, the Builder and the Host** (Write first) `content/lld/26-csharp-and-dotnet-interview/13-aspnet-core-startup-program-cs/README.md`
- Walk me through `Program.cs`.
- What does `WebApplication.CreateBuilder` do?
- What is the difference between `builder.Services` and app?
- What is Kestrel?

**14. The Middleware Pipeline: app.Use, app.Run and app.Map** (Write first) `content/lld/26-csharp-and-dotnet-interview/14-middleware-pipeline-use-run-map/README.md`
- What is middleware in ASP.NET Core?
- What is the difference between `app.Use` and `app.Run`?
- What do `app.Map` and `app.MapWhen` do?
- Why does the order of middleware matter? Give the right order.
- How do you write custom middleware?
- What is the difference between middleware and filters?

**15. Dependency Injection Lifetimes: Singleton, Scoped and Transient** (Write first) `content/lld/26-csharp-and-dotnet-interview/15-dependency-injection-lifetimes/README.md`
- What is the difference between `AddSingleton`, `AddScoped` and `AddTransient`?
- What is a captive dependency?
- How do you use a scoped service in a singleton or a background service?
- Which lifetime should a `DbContext` have?
- What is the difference between `IOptions` and `IOptionsMonitor`?

**16. Routing, Controllers vs Minimal APIs, Model Binding and Filters** (Next) `content/lld/26-csharp-and-dotnet-interview/16-routing-controllers-minimal-apis-and-filters/README.md`
- What is the difference between controllers and minimal APIs?
- How does model binding work?
- What is the difference between a filter and a middleware?
- What are the kinds of filters in MVC?

**17. Configuration, Logging and Environments** (Next) `content/lld/26-csharp-and-dotnet-interview/17-configuration-logging-and-environments/README.md`
- How does configuration work in ASP.NET Core?
- Which configuration source wins?
- How do you keep secrets out of `appsettings.json`?
- What is structured logging?

**18. Error Handling and ProblemDetails** (Next) `content/lld/26-csharp-and-dotnet-interview/18-error-handling-and-problem-details/README.md`
- How do you handle exceptions globally in ASP.NET Core?
- What is `ProblemDetails`?

**19. Authentication and Authorization in ASP.NET Core** (Next) `content/lld/26-csharp-and-dotnet-interview/19-authentication-and-authorization/README.md`
- What is the difference between authentication and authorization?
- How does JWT authentication work in ASP.NET Core?
- What is policy-based authorization?

**20. EF Core Interview Questions** (Write first) `content/lld/26-csharp-and-dotnet-interview/20-ef-core-interview-questions/README.md`
- What is `DbContext`, and what lifetime should it have?
- What is the N+1 problem, and how do you fix it in EF Core?
- What is the difference between eager and lazy loading?
- What does `AsNoTracking` do?
- Code first or database first?

**21. Testing: xUnit, Mocks and Integration Tests** (Later) `content/lld/26-csharp-and-dotnet-interview/21-testing-xunit-mocks-and-integration-tests/README.md`
- How do you unit test a class that depends on a database?
- What is the difference between a mock and a stub?
- How do you integration test an ASP.NET Core API?

**22. Rapid Fire: the C# and .NET Revision Sheet** (Write first) `content/lld/26-csharp-and-dotnet-interview/22-rapid-fire-csharp-and-dotnet/README.md`
- All of the questions above, in rapid-fire form.

Sources for this track: [Microsoft Learn: C# documentation](https://learn.microsoft.com/en-us/dotnet/csharp/); [Microsoft Learn: ASP.NET Core middleware](https://learn.microsoft.com/en-us/aspnet/core/fundamentals/middleware/); [Microsoft Learn: write custom ASP.NET Core middleware](https://learn.microsoft.com/en-us/aspnet/core/fundamentals/middleware/write); [Microsoft Learn: dependency injection in ASP.NET Core](https://learn.microsoft.com/en-us/aspnet/core/fundamentals/dependency-injection); [Microsoft Learn: dependency injection guidelines](https://learn.microsoft.com/en-us/dotnet/core/extensions/dependency-injection-guidelines); [Microsoft Learn: the options pattern](https://learn.microsoft.com/en-us/aspnet/core/fundamentals/configuration/options); [Microsoft Learn: implement a Dispose method](https://learn.microsoft.com/en-us/dotnet/standard/garbage-collection/implementing-dispose); [Microsoft Learn: asynchronous programming with async and await](https://learn.microsoft.com/en-us/dotnet/csharp/asynchronous-programming/); [Microsoft Learn: Entity Framework Core](https://learn.microsoft.com/en-us/ef/core/).

### Track 27: Python Interview Questions

**01. How Python Runs Your Code: Objects, Names and Bytecode** (Next) `content/lld/27-python-interview/01-how-python-runs-your-code/README.md`
- Is Python interpreted or compiled?
- What does "everything is an object" mean?
- What happens when you write a = b?

**02. Mutability, Identity and Copying** (Write first) `content/lld/27-python-interview/02-mutability-identity-and-copying/README.md`
- What is the difference between `is` and `==`?
- Why is a list a bad default argument?
- What is the difference between copy and deepcopy?
- Is Python pass by value or pass by reference?
- Can a tuple be changed?

**03. Functions: *args, **kwargs, Closures and Scope** (Write first) `content/lld/27-python-interview/03-functions-args-kwargs-closures-and-scope/README.md`
- What are `*args` and `**kwargs`?
- What is a closure?
- What is the LEGB rule?
- What does `nonlocal` do?

**04. Decorators** (Write first) `content/lld/27-python-interview/04-decorators/README.md`
- What is a decorator? Write one.
- Why use `functools.wraps`?
- How do you write a decorator that takes arguments?
- What does `lru_cache` do?

**05. Iterators, Generators and yield** (Write first) `content/lld/27-python-interview/05-iterators-generators-and-yield/README.md`
- What is the difference between an iterable and an iterator?
- What is a generator?
- What does `yield` do?
- List comprehension or generator expression: when which?

**06. Classes: How an Object Is Made, Class Attributes and Slots** (Write first) `content/lld/27-python-interview/06-classes-init-new-and-slots/README.md`
- What is the difference between `__new__` and `__init__`?
- What is `self`?
- What is the difference between a class attribute and an instance attribute?
- What does `__slots__` do?

**07. Dunder Methods and the Data Model** (Write first) `content/lld/27-python-interview/07-dunder-methods-and-the-data-model/README.md`
- What is the difference between `__str__` and `__repr__`?
- What are dunder (magic) methods?
- Why must `__hash__` change when you define `__eq__`?
- How do you make an object callable?

**08. Inheritance, super() and the MRO** (Write first) `content/lld/27-python-interview/08-inheritance-super-and-the-mro/README.md`
- What is the MRO?
- How does `super()` work with multiple inheritance?
- How does Python solve the diamond problem?
- What is a mixin?

**09. ABCs, Protocols, Duck Typing and Type Hints** (Next) `content/lld/27-python-interview/09-abcs-protocols-duck-typing-and-type-hints/README.md`
- Does Python have interfaces?
- What is duck typing?
- What is the difference between an ABC and a Protocol?
- Are type hints enforced at run time?

**10. dataclasses, NamedTuple, Enum and pydantic** (Next) `content/lld/27-python-interview/10-dataclasses-namedtuples-enums-and-pydantic/README.md`
- What is a dataclass?
- What is the difference between a dataclass and a `NamedTuple`?
- When would you use pydantic instead of a dataclass?

**11. Context Managers and with** (Next) `content/lld/27-python-interview/11-context-managers/README.md`
- What is a context manager?
- How do you write one?
- What does the `with` statement guarantee?

**12. Exceptions Done Right** (Next) `content/lld/27-python-interview/12-exceptions-done-right/README.md`
- What is the difference between EAFP and LBYL?
- What does the `else` clause of `try` do?
- What does `raise ... from` do?
- Why should you not catch a bare `except`?

**13. Memory, Garbage Collection and Performance** (Next) `content/lld/27-python-interview/13-memory-garbage-collection-and-performance/README.md`
- How does Python manage memory?
- What is reference counting?
- Why can two equal integers or strings sometimes be the same object and sometimes not?
- How do you find what is slow?

**14. The GIL, Threads, Processes and asyncio** (Write first) `content/lld/27-python-interview/14-the-gil-threads-processes-and-asyncio/README.md`
- What is the GIL?
- Threading or `multiprocessing`: when which?
- When is asyncio the right choice?
- Does Python support true parallelism?

**15. asyncio in Depth** (Next) `content/lld/27-python-interview/15-asyncio-in-depth/README.md`
- What is the event loop?
- What is the difference between a coroutine and a task?
- What happens if you call a blocking function inside async code?

**16. Metaclasses, Descriptors and How @property Works** (Later) `content/lld/27-python-interview/16-metaclasses-descriptors-and-property/README.md`
- What is a metaclass?
- What is a descriptor?
- How does `@property` work?
- What is `__init_subclass__`?

**17. Modules, Packages and Imports** (Next) `content/lld/27-python-interview/17-modules-packages-and-imports/README.md`
- What does `if __name__ == "__main__"` do?
- What is the difference between a module and a package?
- How do you fix a circular import?
- Why use a virtual environment?

**18. Web Apps: app.run, WSGI, ASGI, Middleware and FastAPI Depends** (Write first) `content/lld/27-python-interview/18-web-apps-app-run-wsgi-asgi-and-fastapi/README.md`
- What does `app.run` do in Flask?
- Why should you not use `app.run` in production?
- What is the difference between WSGI and ASGI?
- How does middleware work in FastAPI?
- How does dependency injection work in FastAPI?

**19. Testing: pytest, Fixtures and Mocking** (Later) `content/lld/27-python-interview/19-testing-pytest-fixtures-and-mocking/README.md`
- What is a pytest fixture?
- Where should you `patch`?
- What is the difference between `Mock` and `MagicMock`?

**20. Rapid Fire: the Python Revision Sheet** (Write first) `content/lld/27-python-interview/20-rapid-fire-python/README.md`
- All of the questions above, in rapid-fire form.

Sources for this track: [Python documentation: the data model](https://docs.python.org/3/reference/datamodel.html); [Python documentation: Descriptor HowTo Guide](https://docs.python.org/3/howto/descriptor.html); [Python documentation: the method resolution order](https://docs.python.org/3/howto/mro.html); [Python documentation: functools](https://docs.python.org/3/library/functools.html); [Python documentation: contextlib](https://docs.python.org/3/library/contextlib.html); [Python documentation: asyncio](https://docs.python.org/3/library/asyncio.html); [PEP 557: Data Classes](https://peps.python.org/pep-0557/); [PEP 703: Making the Global Interpreter Lock Optional](https://peps.python.org/pep-0703/); [PEP 3333: the WSGI specification](https://peps.python.org/pep-3333/); [FastAPI: dependencies](https://fastapi.tiangolo.com/tutorial/dependencies/); [Flask: deploying to production](https://flask.palletsprojects.com/en/stable/deploying/).

## 6. After the lessons are written

These need the written answers, so they come after Phase 1:

- **Practice question sets** in `content/practice/interview/`: `oop-fundamentals.json`, `design-patterns.json`, `csharp-and-dotnet.json`,
  `aspnet-core.json`, `python-language.json`, each with `module` pointing at its lesson. Concept sets also show as flip cards.
- **A learning path** in `content/paths.json`: "OOP, patterns and C#/Python interview prep", Phase 1 lessons in order.
- **Links from modules 06 to 09, 19 and 21** to the per-pattern lessons ("go deeper: Singleton"). Those are existing lessons, so this is
  done only when you say so.
- **Videos:** a lesson with a video in `content/videos.json` is shown and indexed even before its text is written.
