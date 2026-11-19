# Lesson 27: Repository and Unit of Work

*Content for this module has not been written yet — content will come up soon.*

This lesson is part of [Track 25: Design Patterns, One at a Time](../README.md) in the [Low-Level Design](../../README.md) course. Every example will be written twice, in Python and in C#.

**After this lesson you will be able to:** Put data access behind a repository, group changes in a unit of work, and argue whether EF Core already does both.

## What it will cover

- Repository: a collection-like interface over storage
- Unit of Work: one transaction for many changes
- EF Core: `DbSet` as a repository, `DbContext` as a unit of work, and the debate about wrapping them
- Python: repositories over SQLAlchemy sessions
- Generic versus specific repositories

## Interview questions it will answer

1. What is the Repository pattern?
2. What is a Unit of Work?
3. Should you wrap EF Core in a repository?
4. What is wrong with a generic repository?

---

Previous: [Dependency Injection and Inversion of Control](../26-dependency-injection-and-inversion-of-control/README.md) · Next: [Null Object and Specification](../28-null-object-and-specification/README.md)
