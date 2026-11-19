# Lesson 04: Decorators

*Content for this module has not been written yet — content will come up soon.*

This lesson is part of [Track 27: Python Interview Questions](../README.md) in the [Low-Level Design](../../README.md) course. The examples will be in Python, with the C# way beside them where the comparison helps.

**After this lesson you will be able to:** Write a decorator from scratch, with arguments, keeping the wrapped function's name with `functools.wraps`.

## What it will cover

- Functions as objects; a decorator is a function that returns a function
- `functools.wraps` and why it matters
- Decorators with arguments (three levels)
- Class decorators and decorating classes
- Real uses: timing, retry, caching (`functools.lru_cache`, `functools.cache`), access checks
- Decorators versus the Decorator pattern (see Track 25)

## Interview questions it will answer

1. What is a decorator? Write one.
2. Why use `functools.wraps`?
3. How do you write a decorator that takes arguments?
4. What does `lru_cache` do?

---

Previous: [Functions: *args, **kwargs, Closures and Scope](../03-functions-args-kwargs-closures-and-scope/README.md) · Next: [Iterators, Generators and yield](../05-iterators-generators-and-yield/README.md)
