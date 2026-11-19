# Lesson 08: Value vs Reference, Equality and Immutability

*Content for this module has not been written yet — content will come up soon.*

This lesson is part of [Track 24: OOP Interview Questions](../README.md) in the [Low-Level Design](../../README.md) course. Every example will be written twice, in Python and in C#.

**After this lesson you will be able to:** Explain value and reference semantics, implement equality correctly, and design an immutable object in both languages.

## What it will cover

- C# `struct` versus `class` versus `record`
- Python: everything is a reference; mutable versus immutable types
- The equality contract: == , `Equals` and `GetHashCode`; `__eq__` and `__hash__`
- `is` versus `==` in Python
- The mutable default argument trap
- Making an object immutable: `readonly`, `init`, `record`; frozen dataclasses

## Interview questions it will answer

1. What is the difference between a struct and a class?
2. Why must `GetHashCode` change when you override `Equals`?
3. What is the difference between `is` and `==` in Python?
4. Why is a list a bad default argument?
5. What is a `record` in C#?

---

Previous: [Static Members, Static Classes, and When Static Is a Smell](../07-static-members-and-static-classes/README.md) · Next: [Coupling, Cohesion and SOLID as Interview Answers](../09-coupling-cohesion-and-solid-as-answers/README.md)
