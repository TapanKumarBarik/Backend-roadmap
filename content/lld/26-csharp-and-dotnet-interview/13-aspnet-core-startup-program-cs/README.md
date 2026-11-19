# Lesson 13: ASP.NET Core Startup: Program.cs, the Builder and the Host

*Content for this module has not been written yet — content will come up soon.*

This lesson is part of [Track 26: C# and .NET Interview Questions](../README.md) in the [Low-Level Design](../../README.md) course. The examples will be in C#, with the Python way beside them where the comparison helps.

**After this lesson you will be able to:** Read a `Program.cs` line by line: CreateBuilder, `builder.Services`, Build, the pipeline, `app.Run`.

## What it will cover

- `WebApplication.CreateBuilder`: configuration, logging, DI, Kestrel
- `builder.Services` (registration) versus app (the pipeline)
- `builder.Build()` and what changes after it
- `app.Run()` at the end of `Program.cs` versus `app.Run(delegate)` in the pipeline
- Minimal hosting versus the old Startup class

## Interview questions it will answer

1. Walk me through `Program.cs`.
2. What does `WebApplication.CreateBuilder` do?
3. What is the difference between `builder.Services` and app?
4. What is Kestrel?

---

Previous: [Extension Methods, Partial Classes, Attributes and Reflection](../12-extension-methods-attributes-and-reflection/README.md) · Next: [The Middleware Pipeline: app.Use, app.Run and app.Map](../14-middleware-pipeline-use-run-map/README.md)
