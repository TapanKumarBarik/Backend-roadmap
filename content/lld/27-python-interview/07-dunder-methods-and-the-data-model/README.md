# Lesson 07: Dunder Methods and the Data Model

*Content for this module has not been written yet — content will come up soon.*

This lesson is part of [Track 27: Python Interview Questions](../README.md) in the [Low-Level Design](../../README.md) course. The examples will be in Python, with the C# way beside them where the comparison helps.

**After this lesson you will be able to:** Make your own classes work with `print`, `==`, `len`, `[]`, `with` and `+`, by implementing the right dunder methods.

## What it will cover

- `__repr__` versus `__str__`
- `__eq__` and `__hash__` together
- `__len__`, `__getitem__`, `__contains__`, `__iter__`
- `__call__` and callable objects
- `__enter__` and `__exit__`
- Operator overloading: `__add__`, `__lt__`, `functools.total_ordering`

## Interview questions it will answer

1. What is the difference between `__str__` and `__repr__`?
2. What are dunder (magic) methods?
3. Why must `__hash__` change when you define `__eq__`?
4. How do you make an object callable?

---

Previous: [Classes: How an Object Is Made, Class Attributes and Slots](../06-classes-init-new-and-slots/README.md) · Next: [Inheritance, super() and the MRO](../08-inheritance-super-and-the-mro/README.md)
