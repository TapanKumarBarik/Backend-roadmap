# Design Patterns Practice Arena: 30 Pattern Challenges

> **Track:** [Track 25: Design Patterns, One at a Time](README.md)  
> **Target Audience:** Engineers mastering the 23 Gang of Four patterns and modern backend architectural patterns.  
> **Rule:** Implement each pattern in Python and C# without looking at the reference code. Run unit tests to verify behavior.

---

## 🏗️ Creational Patterns Practice

| # | Pattern | Practice Challenge | Verification Test |
|---|---|---|---|
| 01 | **[Singleton](02-singleton/README.md)** | Build a thread-safe database connection pool counter using `Lazy<T>` in C# and double-checked locking / metaclass in Python. | Assert that 100 concurrent threads receive the exact same memory address. |
| 02 | **[Factory Method](03-factory-method-and-simple-factory/README.md)** | Build an extensible payment creator where adding ApplePay requires creating only a new creator subclass without modifying the core checkout engine. | Assert Open/Closed Principle adherence. |
| 03 | **[Abstract Factory](04-abstract-factory/README.md)** | Build a cross-platform UI factory creating matching Families of Widgets (`DarkButton` + `DarkModal`, `LightButton` + `LightModal`). | Prevent mismatching light buttons inside dark modals at compile/runtime. |
| 04 | **[Builder](05-builder/README.md)** | Construct an immutable `SqlQuery` object with fluent `.Select()`, `.Where()`, `.OrderBy()`, and validate invariants in `.Build()`. | Assert missing `FROM` clause throws `InvalidOperationException`. |
| 05 | **[Prototype](06-prototype/README.md)** | Build an NPC game spawner that clones complex Monster prototypes (`deep copy` vs `shallow copy`) to avoid reloading high-poly mesh textures from disk. | Assert altering cloned monster weapon doesn't alter prototype weapon. |
| 06 | **[Object Pool](07-object-pool/README.md)** | Implement a reusable `SocketConnectionPool` with a max capacity of 5, lease timeout, and reset-on-return mechanics. | Assert thread 6 blocks until a connection is returned. |

---

## 🧩 Structural Patterns Practice

| # | Pattern | Practice Challenge | Verification Test |
|---|---|---|---|
| 07 | **[Adapter](08-adapter/README.md)** | Bridge a legacy XML-based third-party weather API into your modern internal JSON `IWeatherService`. | Assert consumer receives clean DTOs without XML dependencies. |
| 08 | **[Bridge](09-bridge/README.md)** | Decouple `RemoteControl` abstractions (`BasicRemote`, `AdvancedRemote`) from `Device` implementations (`SonyTv`, `SamsungTv`). | Add a `VoiceRemote` and `LgTv` without creating $M \times N$ class explosion. |
| 09 | **[Composite](10-composite/README.md)** | Build a file-system directory tree (`File` and `Directory`) where `.GetSize()` recursively calculates total bytes. | Assert a directory holding sub-directories and files calculates accurate aggregate size. |
| 10 | **[Decorator](11-decorator/README.md)** | Wrap a core `EmailSender` with `LoggingDecorator`, `RateLimitingDecorator`, and `GZipCompressionDecorator`. | Verify layers execute in Russian-doll nesting order. |
| 11 | **[Facade](12-facade/README.md)** | Provide a unified `VideoConverterFacade` simplifying audio extraction, codec transcoding, and bitrate compression into a single `.Convert(file, format)`. | Assert caller code is decoupled from 4 underlying codec subsystems. |
| 12 | **[Flyweight](13-flyweight/README.md)** | Render 500,000 forest trees sharing extrinsic position coordinates while sharing intrinsic texture, mesh, and leaf geometry flyweights. | Benchmark RAM: assert memory consumption is under 5MB instead of 500MB. |
| 13 | **[Proxy](14-proxy/README.md)** | Build a `DocumentServiceProxy` combining Protection Proxy (RBAC role check), Caching Proxy, and Virtual Proxy (lazy disk load). | Assert unauthorized role triggers zero disk I/O. |

---

## ⚡ Behavioral Patterns Practice

| # | Pattern | Practice Challenge | Verification Test |
|---|---|---|---|
| 14 | **[Strategy](15-strategy/README.md)** | Build an e-commerce checkout accepting interchangeable tax calculation strategies (`UsSalesTax`, `EuVatTax`, `NoTax`). | Dynamically swap tax strategy at runtime based on shipping address. |
| 15 | **[Observer](16-observer/README.md)** | Build a stock price ticker publishing ticks to `EmailAlertListener`, `MobilePushListener`, and `AlgorithmicTraderListener`. | Ensure unsubscribing a listener stops its notification immediately. |
| 16 | **[Command](17-command/README.md)** | Implement a text editor with `InsertTextCommand` and `DeleteTextCommand` supporting multi-level Undo and Redo stacks. | Type "Hello", Delete "o", Undo, Redo, assert text integrity. |
| 17 | **[Template Method](18-template-method/README.md)** | Create a data ingestion pipeline (`Extract`, `Transform`, `Validate`, `Load`) where sub-steps are customized by `CsvPipeline` and `JsonPipeline`. | Ensure invariant execution order cannot be bypassed by derived classes. |
| 18 | **[State](19-state/README.md)** | Model an `Order` lifecycle state machine (`Pending`, `Paid`, `Shipped`, `Delivered`, `Cancelled`). | Assert illegal transition (e.g., `Shipped` to `Cancelled`) throws `InvalidOperationException`. |
| 19 | **[Chain of Responsibility](20-chain-of-responsibility-and-middleware/README.md)** | Build an HTTP request middleware pipeline (`AuthenticationMiddleware` -> `RateLimitMiddleware` -> `LoggingMiddleware`). | Assert authentication failure short-circuits subsequent middleware. |
| 20 | **[Iterator](21-iterator/README.md)** | Implement a custom binary search tree iterator performing in-order traversal using `yield return` in C# and `__iter__`/`yield` in Python. | Verify `foreach` / `for in` traverses nodes in sorted order. |
| 21 | **[Mediator](22-mediator/README.md)** | Build an Air Traffic Control tower mediating communications between 5 aircraft to prevent direct $O(N^2)$ aircraft-to-aircraft coupling. | Changing runway status notifies all landing aircraft via mediator. |
| 22 | **[Memento](23-memento/README.md)** | Implement a canvas snapshot memento preserving historical stroke state without violating encapsulation of canvas internal private data. | Roll back canvas to state from 3 steps ago. |
| 23 | **[Visitor](24-visitor/README.md)** | Write an AST expression evaluator using double-dispatch to compute arithmetic equations without altering node classes. | Add an `XmlExportVisitor` without editing `NumberNode` or `BinaryOpNode`. |
| 24 | **[Interpreter](25-interpreter/README.md)** | Build a mini Boolean expression evaluator parsing expressions like `(true AND false) OR true`. | Parse and evaluate string syntax tree to correct boolean result. |

---

## 🏛️ Modern Framework Patterns Practice

| # | Pattern | Practice Challenge | Verification Test |
|---|---|---|---|
| 25 | **[Dependency Injection](26-dependency-injection-and-inversion-of-control/README.md)** | Build a mini IoC container resolving recursive constructor dependencies. | Detect circular dependency loop (`A -> B -> A`) and throw descriptive error. |
| 26 | **[Repository & Unit of Work](27-repository-and-unit-of-work/README.md)** | Implement a bank account balance transfer wrapped in a Unit of Work coordinating atomic commit and rollback. | Simulate failure on step 2; assert step 1 balance mutation is rolled back. |
| 27 | **[Specification Pattern](28-null-object-and-specification/README.md)** | Build composable business rule filters (`InStockSpec.And(PriceUnderFiftySpec)`) for product searches. | Filter catalog of 1,000 products with composite specifications. |
| 28 | **[Null Object Pattern](28-null-object-and-specification/README.md)** | Replace defensive `if (logger != null)` null checks with a `NullLogger` singleton. | Verify zero `NullReferenceException` / `AttributeError` when unconfigured. |
| 29 | **[Pattern Comparison Drills](29-pattern-comparison-drills/README.md)** | Given 4 production scenarios, select the correct pattern: Strategy vs State, Decorator vs Proxy vs Adapter. | Complete the 4 comparison drills with 100% accuracy. |
| 30 | **[Framework Internals](30-patterns-inside-aspnet-core-and-python/README.md)** | Identify and deconstruct the GoF patterns running inside ASP.NET Core (`WebApplicationBuilder`, middleware, DI) and Python (`logging`, `@property`). | Write a functional middleware pipeline that replicates ASP.NET Core pipeline in Python. |

