# Lesson 02: Singleton: Where to Use It, How, and When Not To

*Content for this module has not been written yet — content will come up soon.*

This lesson is part of [Track 25: Design Patterns, One at a Time](../README.md) in the [Low-Level Design](../../README.md) course. Every example will be written twice, in Python and in C#.

**After this lesson you will be able to:** Build a thread-safe Singleton in both languages, say where it fits (and where it does not), and prefer a DI singleton.

## What it will cover

- The intent: exactly one instance, one global point of access
- Good uses (configuration, a logger, a connection pool) and bad uses (hidden global state)
- C#: `static readonly` field, `Lazy<T>`, double-checked locking, and why `Lazy<T>` is the answer
- Python: a module is already a singleton; `__new__`, a decorator, a metaclass
- Thread safety in both languages
- Singleton versus static class versus `AddSingleton` in dependency injection
- Why Singletons make unit tests hard, and how DI fixes it

## Interview questions it will answer

1. Where would you use a Singleton? Give a real example.
2. How do you make a Singleton thread-safe in C#?
3. How do you write a Singleton in Python?
4. What is the difference between a Singleton and a static class?
5. Why is Singleton called an anti-pattern?
6. What is the difference between the Singleton pattern and `AddSingleton`?

---

Previous: [How to Answer Any Design Pattern Question](../01-how-to-answer-any-pattern-question/README.md) · Next: [Factory Method and Simple Factory](../03-factory-method-and-simple-factory/README.md)
