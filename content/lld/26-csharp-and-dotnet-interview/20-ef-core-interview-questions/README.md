# Lesson 20: EF Core Interview Questions

*Content for this module has not been written yet — content will come up soon.*

This lesson is part of [Track 26: C# and .NET Interview Questions](../README.md) in the [Low-Level Design](../../README.md) course. The examples will be in C#, with the Python way beside them where the comparison helps.

**After this lesson you will be able to:** Answer the EF Core questions that always come up: `DbContext` lifetime, tracking, loading strategies, N+1, migrations.

## What it will cover

- `DbContext` as unit of work; why it is scoped
- Change tracking, `AsNoTracking`
- Eager, lazy and explicit loading; the N+1 problem
- Migrations
- `IQueryable` pitfalls: client evaluation, ToList too early
- Raw SQL and when to drop to Dapper

## Interview questions it will answer

1. What is `DbContext`, and what lifetime should it have?
2. What is the N+1 problem, and how do you fix it in EF Core?
3. What is the difference between eager and lazy loading?
4. What does `AsNoTracking` do?
5. Code first or database first?

---

Previous: [Authentication and Authorization in ASP.NET Core](../19-authentication-and-authorization/README.md) · Next: [Testing: xUnit, Mocks and Integration Tests](../21-testing-xunit-mocks-and-integration-tests/README.md)
