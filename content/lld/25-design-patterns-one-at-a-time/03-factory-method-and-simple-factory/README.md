# Lesson 03: Factory Method and Simple Factory

*Content for this module has not been written yet — content will come up soon.*

This lesson is part of [Track 25: Design Patterns, One at a Time](../README.md) in the [Low-Level Design](../../README.md) course. Every example will be written twice, in Python and in C#.

**After this lesson you will be able to:** Replace a type switch with a factory, and tell a simple factory from the Factory Method pattern.

## What it will cover

- The problem: `new ConcreteClass()` scattered through business code
- Simple factory, Factory Method, and a registry of creators
- Python: a dict of classes, `@classmethod` constructors
- C#: factory methods, `Func<T>` factories, `IHttpClientFactory`
- Open/Closed: adding a type without editing the factory

## Interview questions it will answer

1. What is the Factory pattern and why use it?
2. What is the difference between a simple factory and the Factory Method?
3. How does a factory help with the Open/Closed principle?
4. Give a .NET example of a factory.

---

Previous: [Singleton: Where to Use It, How, and When Not To](../02-singleton/README.md) · Next: [Abstract Factory](../04-abstract-factory/README.md)
