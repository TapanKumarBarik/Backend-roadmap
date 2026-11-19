# Track 26: C# and .NET Interview Questions

The C#, .NET and ASP.NET Core questions asked in developer interviews, from the type system to async/await, the garbage collector, dependency injection lifetimes and the middleware pipeline (`app.Use`, `app.Run`, `app.Map`). Each answer is short enough to say out loud, with code you can run.

## How this track works

- Lessons 01 to 12 are the language and runtime; lessons 13 to 21 are ASP.NET Core and EF Core; lesson 22 is the revision sheet.
- Every code sample targets current .NET and runs as a console app or a minimal API, so you can check each answer yourself.
- If you have an interview this week: lessons 02, 05, 09, 10, 14, 15 and 22 first.
- The examples are in C#. Where Python does the same thing differently and the comparison helps, a second tab shows the Python way.
- The track has twenty-two lessons. Lessons whose text is not ready yet are marked *Soon* in the sidebar; their page already lists what they will cover and the interview questions they will answer.

## Lessons

| # | Lesson | What you'll be able to do |
|---|--------|---------------------------|
| 01 | [How .NET Runs Your Code: CLR, IL and JIT](01-how-dotnet-runs-your-code/README.md) | Explain what happens between `dotnet build` and your code running: IL, the CLR, JIT, assemblies |
| 02 | [Value and Reference Types, Structs and Records](02-value-and-reference-types-structs-records/README.md) | Explain the stack and the heap honestly, choose `struct`, `class` or `record`, and spot boxing |
| 03 | [Strings, Constants and Immutability](03-strings-constants-and-immutability/README.md) | Explain why strings are immutable, when to use `StringBuilder`, and `const` versus `readonly` versus `static readonly` |
| 04 | [Parameters: ref, out, in and params](04-parameters-ref-out-in-and-params/README.md) | Use `ref`, `out`, `in`, `params`, optional and named arguments, and say what each does to the caller's variable |
| 05 | [Delegates, Events and Lambdas](05-delegates-events-and-lambdas/README.md) | Explain delegates, `Func`, `Action` and `Predicate`, events, and lambdas with captured variables |
| 06 | [Generics, Constraints and Variance](06-generics-constraints-and-variance/README.md) | Write generic types with constraints, and explain covariance and contravariance (`in` and `out`) |
| 07 | [Collections, LINQ and Deferred Execution](07-collections-linq-and-deferred-execution/README.md) | Choose the right collection interface, and explain deferred execution and `IEnumerable` versus `IQueryable` |
| 08 | [Exceptions Done Right](08-exceptions-done-right/README.md) | Handle, rethrow and design exceptions correctly, including `throw` versus `throw ex` |
| 09 | [Memory, Garbage Collection and IDisposable](09-memory-garbage-collection-and-idisposable/README.md) | Explain the generational GC, implement `IDisposable` correctly, and find a .NET memory leak |
| 10 | [async/await, Tasks and the Deadlock Trap](10-async-await-and-tasks/README.md) | Explain what await does, avoid `async void` and `.Result` deadlocks, and run work in parallel safely |
| 11 | [Threading, Locks and Thread Safety](11-threading-locks-and-thread-safety/README.md) | Make code thread-safe with `lock`, `Interlocked`, `SemaphoreSlim` and concurrent collections |
| 12 | [Extension Methods, Partial Classes, Attributes and Reflection](12-extension-methods-attributes-and-reflection/README.md) | Write extension methods, read and define attributes, and say when reflection is worth its cost |
| 13 | [ASP.NET Core Startup: Program.cs, the Builder and the Host](13-aspnet-core-startup-program-cs/README.md) | Read a `Program.cs` line by line: CreateBuilder, `builder.Services`, Build, the pipeline, `app.Run` |
| 14 | [The Middleware Pipeline: app.Use, app.Run and app.Map](14-middleware-pipeline-use-run-map/README.md) | Explain the request pipeline, the difference between `app.Use`, `app.Run`, `app.Map`, `MapWhen` and `UseWhen`, and why order matters |
| 15 | [Dependency Injection Lifetimes: Singleton, Scoped and Transient](15-dependency-injection-lifetimes/README.md) | Choose `AddSingleton`, `AddScoped` or `AddTransient` correctly, and spot a captive dependency |
| 16 | [Routing, Controllers vs Minimal APIs, Model Binding and Filters](16-routing-controllers-minimal-apis-and-filters/README.md) | Build endpoints both ways, explain model binding and validation, and choose between filters and middleware |
| 17 | [Configuration, Logging and Environments](17-configuration-logging-and-environments/README.md) | Explain how appsettings, environment variables and secrets layer, and log with ILogger properly |
| 18 | [Error Handling and ProblemDetails](18-error-handling-and-problem-details/README.md) | Handle errors globally with `UseExceptionHandler`, `IExceptionHandler` and `ProblemDetails` |
| 19 | [Authentication and Authorization in ASP.NET Core](19-authentication-and-authorization/README.md) | Explain authentication versus authorization, configure JWT bearer auth, and write a policy |
| 20 | [EF Core Interview Questions](20-ef-core-interview-questions/README.md) | Answer the EF Core questions that always come up: `DbContext` lifetime, tracking, loading strategies, N+1, migrations |
| 21 | [Testing: xUnit, Mocks and Integration Tests](21-testing-xunit-mocks-and-integration-tests/README.md) | Unit test with xUnit and a mocking library, and integration test an API with `WebApplicationFactory` |
| 22 | [Rapid Fire: the C# and .NET Revision Sheet](22-rapid-fire-csharp-and-dotnet/README.md) | Answer about eighty C# and .NET questions in one or two sentences each |

## Sources

- [Microsoft Learn: C# documentation](https://learn.microsoft.com/en-us/dotnet/csharp/)
- [Microsoft Learn: ASP.NET Core middleware](https://learn.microsoft.com/en-us/aspnet/core/fundamentals/middleware/)
- [Microsoft Learn: write custom ASP.NET Core middleware](https://learn.microsoft.com/en-us/aspnet/core/fundamentals/middleware/write)
- [Microsoft Learn: dependency injection in ASP.NET Core](https://learn.microsoft.com/en-us/aspnet/core/fundamentals/dependency-injection)
- [Microsoft Learn: dependency injection guidelines](https://learn.microsoft.com/en-us/dotnet/core/extensions/dependency-injection-guidelines)
- [Microsoft Learn: the options pattern](https://learn.microsoft.com/en-us/aspnet/core/fundamentals/configuration/options)
- [Microsoft Learn: implement a Dispose method](https://learn.microsoft.com/en-us/dotnet/standard/garbage-collection/implementing-dispose)
- [Microsoft Learn: asynchronous programming with async and await](https://learn.microsoft.com/en-us/dotnet/csharp/asynchronous-programming/)
- [Microsoft Learn: Entity Framework Core](https://learn.microsoft.com/en-us/ef/core/)

Start here → [01-how-dotnet-runs-your-code/README.md](01-how-dotnet-runs-your-code/README.md)

Back to the course index: [../README.md](../README.md)
