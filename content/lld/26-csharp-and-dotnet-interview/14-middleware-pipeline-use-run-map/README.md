# Lesson 14: The Middleware Pipeline: app.Use, app.Run and app.Map

*Content for this module has not been written yet — content will come up soon.*

This lesson is part of [Track 26: C# and .NET Interview Questions](../README.md) in the [Low-Level Design](../../README.md) course. The examples will be in C#, with the Python way beside them where the comparison helps.

**After this lesson you will be able to:** Explain the request pipeline, the difference between `app.Use`, `app.Run`, `app.Map`, `MapWhen` and `UseWhen`, and why order matters.

## What it will cover

- The pipeline as a chain of delegates (Chain of Responsibility)
- `app.Use`: do work, call next, do work on the way back
- `app.Run`: a terminal middleware that never calls next
- `app.Map` and `app.MapWhen`: branch the pipeline; `app.UseWhen`: branch and rejoin
- Order: exception handling, HTTPS, static files, routing, CORS, authentication, authorization, endpoints
- Writing custom middleware: inline, as a class, `UseMiddleware<T>`, `IMiddleware`
- Short-circuiting and what happens after the response has started

## Interview questions it will answer

1. What is middleware in ASP.NET Core?
2. What is the difference between `app.Use` and `app.Run`?
3. What do `app.Map` and `app.MapWhen` do?
4. Why does the order of middleware matter? Give the right order.
5. How do you write custom middleware?
6. What is the difference between middleware and filters?

---

Previous: [ASP.NET Core Startup: Program.cs, the Builder and the Host](../13-aspnet-core-startup-program-cs/README.md) · Next: [Dependency Injection Lifetimes: Singleton, Scoped and Transient](../15-dependency-injection-lifetimes/README.md)
