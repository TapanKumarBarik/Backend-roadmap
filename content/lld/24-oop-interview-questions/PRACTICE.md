# OOP & SOLID Practice Arena

> **Track:** [Track 24: OOP Interview Questions](README.md)  
> **Target Audience:** Backend engineers preparing for Object-Oriented Design & LLD technical interviews.  
> **Format:** 11 deliberate hands-on drills with executable starter challenges and automated verification tests in Python and C#.

---

## Drill 1: The 4 Pillars in a Banking Domain ([Lesson 01](01-the-four-pillars-answered-well/README.md))
- **Prompt:** Build a `BankAccount` base class with `Deposit` and `Withdraw`. Subclass into `SavingsAccount` (requires minimum balance) and `CheckingAccount` (supports overdraft). Encapsulate `_balance` such that balance can never become negative in savings.
- **Goal:** Prove encapsulation (balance invariant), abstraction (clean public API), inheritance (shared account state), and polymorphism (virtual `Withdraw`).

## Drill 2: Constructor Chaining & Factory Methods ([Lesson 02](02-classes-objects-constructors-and-lifetime/README.md))
- **Prompt:** Create an `HttpRequest` class that accepts `endpoint`, `method`, optional `headers`, and optional `body`. Provide chained constructors (`this(...)` in C#, default factory methods in Python) and a private constructor with a static `CreateAuthenticated(token, ...)` factory.
- **Goal:** Enforce valid invariants at allocation time without leaking `this`/`self`.

## Drill 3: Abstract Class vs. Interface ([Lesson 03](03-abstract-class-vs-interface/README.md))
- **Prompt:** Model a notification engine where `INotificationChannel` is an interface (`Send(recipient, message)`) and `BaseChannel` is an abstract class providing rate limiting and audit logging hooks.
- **Goal:** Contrast contract definition vs. partial behavioral implementation.

## Drill 4: Overriding vs. Method Hiding ([Lesson 04](04-overloading-overriding-and-polymorphism/README.md))
- **Prompt:** In C#, write a base class `Printer` with a method `Print()`. Create derived class `ColorPrinter` using `override`, and `LaserPrinter` using `new`. Assign instances of both to a `Printer` variable and predict what calling `Print()` outputs. In Python, simulate method overloading using `@typing.overload` and `functools.singledispatch`.
- **Goal:** Demonstrate CLR vtable slot replacement vs. method hiding, and Python dynamic dispatch.

## Drill 5: Refactoring Inheritance to Composition ([Lesson 05](05-inheritance-composition-and-the-diamond-problem/README.md))
- **Prompt:** Take a rigid hierarchy `class FlyingSwimmingBird(FlyingBird, SwimmingBird)` and refactor it into `Bird` with injected `IFlyingBehavior` and `ISwimmingBehavior`.
- **Goal:** Eliminate the fragile base class problem and the Diamond Problem.

## Drill 6: Encapsulation & Guard Invariants ([Lesson 06](06-access-modifiers-properties-and-encapsulation/README.md))
- **Prompt:** Build a `Money` value object with `Amount` and `Currency`. Ensure that adding two money objects with different currencies throws `InvalidOperationException` / `ValueError`.
- **Goal:** Protect object consistency and prevent anemic domain models.

## Drill 7: Static Utility vs. Dependency Injection ([Lesson 07](07-static-members-and-static-classes/README.md))
- **Prompt:** Take a static `EmailSender.SendEmail(...)` call inside an `OrderService`, convert it to an injectable interface `IEmailSender`, and write a unit test with a mock that verifies an email was sent without making a network call.
- **Goal:** Remove "static cling" and introduce testable architectural seams.

## Drill 8: Value vs. Reference Equality ([Lesson 08](08-value-vs-reference-equality-and-immutability/README.md))
- **Prompt:** In C#, implement a `Point` struct/record and a custom `class CustomerId` overriding `Equals`, `GetHashCode`, `==`, and `!=`. In Python, implement `__eq__` and `__hash__` on an immutable frozen dataclass. Store instances in a hash set/dict and verify $O(1)$ lookup.
- **Goal:** Avoid hash-bucket corruption and understand value semantics.

## Drill 9: SOLID Violation Hunter ([Lesson 09](09-coupling-cohesion-and-solid-as-answers/README.md))
- **Prompt:** Review a 200-line "God Class" `InvoiceManager` that parses XML, calculates sales tax, saves to SQL, and sends an SMTP email. Deconstruct it into 4 focused classes adhering to SRP, OCP, and DIP.
- **Goal:** Translate abstract SOLID theory into measurable coupling and cohesion improvements.

## Drill 10: 60-Second Rapid-Fire Quiz ([Lesson 10](10-rapid-fire-oop-revision-sheet/README.md))
- **Prompt:** Test yourself on the 64 rapid-fire questions: explain Liskov Substitution, why multiple inheritance of state causes ambiguity, and how Python resolves MRO via C3 Linearization.
- **Goal:** Verbal fluency under interview pressure.

## Drill 11: 45-Minute Whiteboard Challenge ([Lesson 11](11-whiteboard-drills-design-a-class-hierarchy/README.md))
- **Prompt:** Given the prompt "Design a Digital Audio Workstation (DAW) audio track mixing console", draft the class hierarchy, interfaces, and sequence diagram in 30 minutes on paper.
- **Goal:** Structure and communicate requirements from scratch.

