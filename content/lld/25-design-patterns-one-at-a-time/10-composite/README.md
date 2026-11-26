# Lesson 10: Composite

> **Prerequisites:** [Bridge](../09-bridge/README.md) and [Track 25 Overview](../README.md).  
> **Estimated Reading Time:** 18 minutes  
> **Target Audience:** Engineers preparing for LLD, OOP, C#, or Python technical screening and architecture rounds.

> [!NOTE]
> **In one line:** **Composite** lets you treat a single object and a tree of objects through the same interface (file/folder, menu/submenu), so clients never ask "leaf or group?".

> [!TIP]
> **The One Rule of the Composite Pattern:** Treat individual leaf objects and composite tree branches **identically through a single shared interface**, eliminating conditional type checks (`if (item is Directory)`) when traversing, calculating, or operating on hierarchical part-whole structures.

---

## 1. Why This Matters: The Interview Trap

"How would you design a hierarchical file system, an enterprise organization chart, or a UI component tree where containers can hold both items and other nested containers, without polluting client code with `instanceof` or recursive type checks?"

Junior candidates typically respond with data-structure terminology:
> *"The Composite pattern is used for trees. You have a Component interface, Leaf classes, and a Composite class. The composite holds a list of children and loops over them."*

Interviewers push past this elementary definition to test your grasp of **polymorphism, interface design trade-offs, and failure modes**:

1. **Eliminating Type-Checking Branching Logic:** Without the Composite pattern, client code that computes total file sizes or renders UI elements becomes cluttered with cascading conditionals:
   ```csharp
   // Brittle, anti-pattern approach:
   foreach (var item in items) {
       if (item is Directory dir) totalSize += dir.CalculateDirSize();
       else if (item is File file) totalSize += file.GetSize();
   }
   ```
   If a new container type is introduced (e.g., `ArchiveItem` or `SymlinkItem`), every traversal loop across the system must be updated, violating the **Open/Closed Principle**. The Composite pattern enables clients to call `item.GetSize()` uniformly across all nodes.
2. **The Transparency vs. Type Safety Trade-Off:** The single most critical architectural debate in the Composite pattern is: *Where should child-management methods (`Add`, `Remove`, `GetChildren`) live?*
   - **Transparency (Uniformity):** Declare `Add()` and `Remove()` on the root `Component` interface. The client can treat every object identically without casting. However, this violates the **Interface Segregation Principle** and **Liskov Substitution Principle**: calling `file.Add(other)` makes no semantic sense and must throw a runtime exception (e.g., `NotSupportedException`).
   - **Type Safety:** Declare `Add()` and `Remove()` *only* on the concrete `Composite` class. Leaves remain pure and cannot be called with invalid operations, but clients lose uniform treatment when assembling or modifying the tree, as they must cast or hold explicit references to `Composite`.
   In modern backend architectures, **Type Safety is overwhelmingly preferred**.

### Structural Comparison: Composite vs. Decorator vs. Iterator vs. Visitor

| Pattern | Structural Shape | Primary Intent | Does it modify child nodes? |
| :--- | :--- | :--- | :--- |
| **Composite** | **Hierarchical Tree (Part-Whole)** | Treat single items (leaves) and collections of items (composites) uniformly. | Aggregates results across children recursively. |
| **Decorator** | **Linear Chain (Wrapping)** | Add dynamic behavior to an individual object without inheritance. | Wraps a single child conforming to the same interface. |
| **Iterator** | **Sequential Traversal** | Provide uniform sequential access to elements of an aggregate without exposing its underlying representation. | Traverses nodes one by one. |
| **Visitor** | **External Operation Carrier** | Execute new operations over an existing object structure without changing the structure classes. | Visits nodes polymorphically via double-dispatch. |

---

## 1A. The Visual Story: Problem -> Analogy -> Solution

### The Problem (Why Naive Code Explodes)

Imagine building an Amazon-style order fulfillment system with **Products** (hammer, headphones, charger) and **Boxes** (a small box containing headphones, placed inside a medium box with a charger, placed inside a master shipping box). To calculate the total order price, naive code writes nested `isinstance` / `is` loops: *"open the outer box, loop over items; if item is a Product, add its price; if item is a Box, open it and loop again..."* Every new container type (`GiftWrap`, `Pallet`, `Bundle`) forces you to rewrite every traversal loop across billing, shipping, and invoicing—a brittle mess of type checks.

### Real-World Analogy

Think of a **military army command hierarchy**. A General issues a single order: *"Move 5 km north."* The General does not personally radio every individual soldier. Instead, the order goes to **Divisions** (composite), which pass it down to **Brigades** (composite), which pass it to **Squads** (composite), which finally command individual **Soldiers** (leaf). Whether the unit is a single soldier or a 10,000-person division, it responds to the exact same `executeOrder()` command.

### Visual Problem -> Solution Diagram

```mermaid
flowchart LR
    subgraph Before["Before: Brittle Type-Checking Loops"]
        Calc["CalculateTotal()"] -->|"if isinstance(x, Box): recurse\nelif isinstance(x, Product): add"| Mess["Fragile Nested Loops"]
    end

    subgraph After["After: Uniform Composite Tree"]
        Client["Client"] -->|"GetPrice()"| Item["IOrderItem"]
        Item --> Prod["Product (Leaf)\nreturns price"]
        Item --> Box["Box (Composite)\nsums children.GetPrice()"]
        Box -->|"contains 0..*"| Item
    end
```

### Applicability & Pattern Relations

- **Use when:** You need to represent a tree-like part-whole object structure (file systems, UI widget trees, org charts, nested order boxes).
- **Use when:** You want client code to treat both simple individual elements and complex nested containers uniformly through a single interface.
- **Use when:** Operations naturally propagate recursively down a hierarchy (calculating total size, rendering, applying permissions).
- **Relations with Other Patterns:** **Builder** can be used to construct complex **Composite** trees step by step; **Iterator** traverses a **Composite** tree sequentially; **Visitor** executes new external operations across an entire **Composite** tree without modifying node classes; **Decorator** resembles a Composite with only *one* child component, but adds responsibilities rather than aggregating children.

---

## 2. Visual Mental Model / Taxonomic Comparison

A Composite tree consists of:
- **Component:** The common abstraction declaring operations common to both simple and complex objects.
- **Leaf:** Basic building blocks that contain no children (e.g., `FileItem`).
- **Composite:** Complex containers that store child components and delegate work to them recursively (e.g., `DirectoryItem`).

```mermaid
flowchart TD
    Client["Client Code"] -->|operates uniformly on| Component["<<interface>>\nFileSystemItem\n+ Name: string\n+ GetSizeInBytes(): long\n+ Display(indent: string)"]

    Component -.->|implements| Leaf["FileItem (Leaf)\n- _size: long\n+ GetSizeInBytes() -> returns _size\n+ Display() -> prints file details"]
    Component -.->|implements| CompositeNode["DirectoryItem (Composite)\n- _children: List<FileSystemItem>\n+ Add(item): DirectoryItem\n+ Remove(item): DirectoryItem\n+ GetSizeInBytes() -> sum of child sizes\n+ Display() -> prints dir and recurses"]

    CompositeNode -->|aggregates 0..*| Component

    subgraph RuntimeTree["Runtime Part-Whole Tree Example"]
        Root["+ Dir: project_root (2600 B)"]
        Src["+ Dir: src (2000 B)"]
        Docs["+ Dir: docs (450 B)"]
        F1["- File: main.py (1200 B)"]
        F2["- File: utils.py (800 B)"]
        F3["- File: README.md (450 B)"]
        F4["- File: LICENSE (150 B)"]

        Root --> Src
        Root --> Docs
        Root --> F4
        Src --> F1
        Src --> F2
        Docs --> F3
    end
```

### Component Roles in the Hierarchy

| Role | Has Children? | Implementation of Base Operations | Example |
| :--- | :--- | :--- | :--- |
| **Component** | Abstract | Declares common interface for the entire hierarchy. | `FileSystemItem` |
| **Leaf** | No | Performs the actual work directly (terminal operation). | `FileItem`, `Button`, `IndividualEmployee` |
| **Composite** | **Yes** | Dispatches work recursively to all children and aggregates the results. | `DirectoryItem`, `Panel`, `DepartmentManager` |

---

## 3. Code Implementation

In the following implementation, we model a hierarchical file system. The client can calculate total disk size or print the entire tree hierarchy starting from any arbitrary node (a single file or a deeply nested folder) without ever inspecting concrete runtime types.

````carousel
```python
from abc import ABC, abstractmethod
from typing import List


# 1. Component interface declaring operations shared by leaves and composites
class FileSystemItem(ABC):

  def __init__(self, name: str) -> None:
    self.name: str = name

  @abstractmethod
  def get_size_in_bytes(self) -> int:
    """Calculates total size in bytes recursively."""
    pass

  @abstractmethod
  def display(self, indent: str = "") -> None:
    """Renders hierarchy representation."""
    pass


# 2. Leaf: Represents terminal elements with no child items
class FileItem(FileSystemItem):

  def __init__(self, name: str, size_in_bytes: int) -> None:
    super().__init__(name)
    self._size: int = size_in_bytes

  def get_size_in_bytes(self) -> int:
    return self._size

  def display(self, indent: str = "") -> None:
    print(f"{indent}- File: {self.name} ({self._size} B)")


# 3. Composite: Represents branch elements containing children
class DirectoryItem(FileSystemItem):

  def __init__(self, name: str) -> None:
    super().__init__(name)
    self._children: List[FileSystemItem] = []

  # Type-safe child management on the Composite
  def add(self, item: FileSystemItem) -> "DirectoryItem":
    self._children.append(item)
    return self

  def remove(self, item: FileSystemItem) -> "DirectoryItem":
    self._children.remove(item)
    return self

  def get_size_in_bytes(self) -> int:
    # Uniform recursive aggregation without branching on concrete types
    return sum(child.get_size_in_bytes() for child in self._children)

  def display(self, indent: str = "") -> None:
    print(f"{indent}+ Dir: {self.name} ({self.get_size_in_bytes()} B)")
    for child in self._children:
      child.display(indent + "  ")


if __name__ == "__main__":
  # Build tree structure
  root = DirectoryItem("project_root")
  src = DirectoryItem("src")
  docs = DirectoryItem("docs")

  main_py = FileItem("main.py", 1200)
  utils_py = FileItem("utils.py", 800)
  readme = FileItem("README.md", 450)
  license_file = FileItem("LICENSE", 150)

  src.add(main_py).add(utils_py)
  docs.add(readme)
  root.add(src).add(docs).add(license_file)

  # Uniform operation on root composite
  root.display()
  print(f"Total Size: {root.get_size_in_bytes()} bytes")
```

<!-- slide -->

```csharp
using System;
using System.Collections.Generic;
using System.Linq;

// 1. Component interface declaring operations shared by leaves and composites
public interface IFileSystemItem
{
    string Name { get; }
    long GetSizeInBytes();
    void Display(string indent = "");
}

// 2. Leaf: Represents terminal elements with no child items
public sealed class FileItem : IFileSystemItem
{
    public string Name { get; }
    private readonly long _size;

    public FileItem(string name, long sizeInBytes)
    {
        Name = name;
        _size = sizeInBytes;
    }

    public long GetSizeInBytes() => _size;

    public void Display(string indent = "")
    {
        Console.WriteLine($"{indent}- File: {Name} ({_size} B)");
    }
}

// 3. Composite: Represents branch elements containing children
public sealed class DirectoryItem : IFileSystemItem
{
    public string Name { get; }
    private readonly List<IFileSystemItem> _children = new();

    public DirectoryItem(string name)
    {
        Name = name;
    }

    // Type-safe child management on the Composite
    public DirectoryItem Add(IFileSystemItem item)
    {
        _children.Add(item);
        return this;
    }

    public DirectoryItem Remove(IFileSystemItem item)
    {
        _children.Remove(item);
        return this;
    }

    public long GetSizeInBytes()
    {
        // Uniform recursive aggregation without branching on concrete types
        return _children.Sum(child => child.GetSizeInBytes());
    }

    public void Display(string indent = "")
    {
        Console.WriteLine($"{indent}+ Dir: {Name} ({GetSizeInBytes()} B)");
        foreach (var child in _children)
        {
            child.Display(indent + "  ");
        }
    }
}

public class Program
{
    public static void Main()
    {
        // Build tree structure
        var root = new DirectoryItem("project_root");
        var src = new DirectoryItem("src");
        var docs = new DirectoryItem("docs");

        var mainCs = new FileItem("main.py", 1200);
        var utilsCs = new FileItem("utils.py", 800);
        var readme = new FileItem("README.md", 450);
        var license = new FileItem("LICENSE", 150);

        src.Add(mainCs).Add(utilsCs);
        docs.Add(readme);
        root.Add(src).Add(docs).Add(license);

        // Uniform operation on root composite
        root.Display();
        Console.WriteLine($"Total Size: {root.GetSizeInBytes()} bytes");
    }
}
```
````

**Expected Output (Both Languages):**
```text
+ Dir: project_root (2600 B)
  + Dir: src (2000 B)
    - File: main.py (1200 B)
    - File: utils.py (800 B)
  + Dir: docs (450 B)
    - File: README.md (450 B)
  - File: LICENSE (150 B)
Total Size: 2600 bytes
```

---

## 3A. Where It Is Used, Why It Exists & Progressive Buildup

### Where It Is Used (Real-World Systems & LLD Interviews)

| Domain / Ecosystem | Concrete Real-World Usage | LLD Interview Problem Where You Use It |
| :--- | :--- | :--- |
| **.NET / C#** | WPF/MAUI `UIElement` & `Panel` (`Measure`/`Arrange`), ASP.NET Core `CompositeViewEngine`, `ICompositeMetadataDetailsProvider`. | Design an In-Memory File System (`File`, `Directory`, `du`, `ls`). |
| **Python** | `xml.etree.ElementTree.Element`, PyTorch `nn.Module` & `nn.Sequential`, `tkinter.Widget` container trees. | Design a Composable Rule / Feature-Flag Engine (`AND`, `OR`, `Leaf` predicates). |
| **Go** | `go/ast.Node` syntax trees, `cobra.Command` nested CLI subcommand trees, Alertmanager `Route` trees. | Design an Enterprise Org-Chart Payroll & Headcount Rollup system. |
| **TypeScript / Node.js** | DOM `Node` / `HTMLElement`, React Virtual DOM (`ReactElement` tree), Babel/ESLint AST nodes. | Design an E-Commerce Cart with Nested Gift Boxes & Product Bundles. |

### Why It Is Used — The Step-by-Step Buildup (Before -> Pain -> Pattern)

#### Stage 0: Naive Code (`isinstance` Type-Checking Everywhere)
```python
class Product:
    def __init__(self, name: str, price_cents: int) -> None:
        self.name = name
        self.price_cents = price_cents


class Box:
    def __init__(self, items: list[object]) -> None:
        self.items = items


def total_price(node: object) -> int:
    if isinstance(node, Product):
        return node.price_cents
    if isinstance(node, Box):
        return sum(total_price(child) for child in node.items)
    raise TypeError(f"Unknown item: {type(node)}")
```

#### What Breaks as Requirements Arrive
- **Requirement 2 (Add `GiftBundle`, `WarrantyAddon`, and `ShippingCrate`):** Every function (`total_price`, `total_weight`, `render_invoice`) must add new `if isinstance(...)` branches—violating the Open/Closed Principle.
- **Requirement 3 (Type safety & cycle prevention):** Calling `box.add(box)` in a naive list-based composite triggers infinite recursion (`RecursionError`), and putting `add()` on a base `Product` lets callers call `product.add(...)` nonsensically.

#### Step-by-Step Refactoring to Composite
1. **Unify via Component Interface:** Define `PricedItem` (`Protocol`/ABC) with `price_cents() -> int`.
2. **Implement Leaf & Composite:** `Product` returns its own price; `Box` delegates `sum(c.price_cents() for c in self._children)`.
3. **Keep `add()` on Composite Only (Type Safety):** Only `Box` exposes `add(child)` and rejects self-cycles.

### Progressive Real-World Examples

#### Example A: Simple Core — Nested Order Box & Product Pricing
Treats single products and arbitrarily nested boxes identically through `PricedItem`.

```python
from typing import Protocol


class PricedItem(Protocol):
    def price_cents(self) -> int: ...


class Product:
    def __init__(self, name: str, cents: int) -> None:
        self.name = name
        self._cents = cents

    def price_cents(self) -> int:
        return self._cents


class Box:
    def __init__(self, label: str) -> None:
        self.label = label
        self._children: list[PricedItem] = []

    def add(self, item: PricedItem) -> "Box":
        if item is self:
            raise ValueError("Cannot add a box to itself")
        self._children.append(item)
        return self

    def price_cents(self) -> int:
        return sum(child.price_cents() for child in self._children)


phone = Product("Phone", 70000)
charger = Product("Charger", 2500)
inner_box = Box("Accessories").add(charger)
shipment = Box("Main Order").add(phone).add(inner_box)
assert shipment.price_cents() == 72500
```

#### Example B: Production Backend — Composable Feature-Flag / Access Rule Engine
Evaluates arbitrarily nested boolean rules (`AllOf`, `AnyOf`, `AttrEquals`) against a request context without `isinstance` checks.

```python
from typing import Protocol


class Rule(Protocol):
    def evaluate(self, ctx: dict[str, object]) -> bool: ...


class AttrEquals:
    def __init__(self, key: str, expected: object) -> None:
        self._key = key
        self._expected = expected

    def evaluate(self, ctx: dict[str, object]) -> bool:
        return ctx.get(self._key) == self._expected


class AllOf:
    def __init__(self, *rules: Rule) -> None:
        self._rules = rules

    def evaluate(self, ctx: dict[str, object]) -> bool:
        return all(r.evaluate(ctx) for r in self._rules)


class AnyOf:
    def __init__(self, *rules: Rule) -> None:
        self._rules = rules

    def evaluate(self, ctx: dict[str, object]) -> bool:
        return any(r.evaluate(ctx) for r in self._rules)


rollout_rule = AllOf(
    AttrEquals("plan", "enterprise"),
    AnyOf(AttrEquals("region", "eu"), AttrEquals("beta", True)),
)
assert rollout_rule.evaluate({"plan": "enterprise", "region": "us", "beta": True}) is True
assert rollout_rule.evaluate({"plan": "free", "region": "eu", "beta": True}) is False
```

#### Example C: Classic LLD Interview Problem — Org-Chart Salary & Headcount Rollup
Computes total payroll and headcount from any node (an individual engineer or an entire VP division) uniformly.

```python
from typing import Protocol


class OrgUnit(Protocol):
    def total_salary(self) -> int: ...
    def headcount(self) -> int: ...


class Employee:
    def __init__(self, name: str, salary: int) -> None:
        self.name = name
        self._salary = salary

    def total_salary(self) -> int:
        return self._salary

    def headcount(self) -> int:
        return 1


class Department:
    def __init__(self, name: str) -> None:
        self.name = name
        self._members: list[OrgUnit] = []

    def add(self, unit: OrgUnit) -> "Department":
        self._members.append(unit)
        return self

    def total_salary(self) -> int:
        return sum(m.total_salary() for m in self._members)

    def headcount(self) -> int:
        return sum(m.headcount() for m in self._members)


platform = Department("Platform").add(Employee("Alice", 180_000)).add(Employee("Bob", 170_000))
eng = Department("Engineering").add(platform).add(Employee("VP Eng", 250_000))
assert eng.headcount() == 3
assert eng.total_salary() == 600_000
```

---

## 4. Where You Already Use It

Hierarchical part-whole trees are ubiquitous across production frameworks:

- **In .NET & C#:**
  - **WPF & WinForms UI Component Hierarchy:** `UIElement` / `FrameworkElement` and `Control`: A `Panel` or `Grid` (Composite) derives from `UIElement`, just like a `Button` or `TextBlock` (Leaf). A `Grid` contains a collection of `UIElement` children, allowing the layout engine to invoke `.Measure()` and `.Arrange()` recursively down the entire visual tree.
  - **ASP.NET Core View Engines (`CompositeViewEngine`):** Implements `IViewEngine` and aggregates multiple view engines (e.g., Razor view engine, custom template engines). When a controller returns a view, the pipeline queries `CompositeViewEngine.FindView()`, which iterates its child engines transparently.
  - **ASP.NET Core Metadata Providers (`ICompositeMetadataDetailsProvider`):** Coordinates multiple display, binding, and validation metadata providers into a unified pipeline.
  - **Composite Validation:** Enterprise validation architectures frequently use a `CompositeValidator<T>` that implements `IValidator<T>` and encapsulates a collection of individual rule validators (`EmailValidator`, `PasswordStrengthValidator`), executing all of them in a single call.

- **In Python:**
  - **XML / HTML DOM Parsers (`xml.etree.ElementTree`):** Every node in an `ElementTree` is an `Element`. An element has a tag, text, and attributes (Leaf data), and can also contain a list of sub-elements (Composite). Calling `.findall()` or `.iter()` operates identically on roots, branches, or leaves.
  - **Deep Learning Neural Networks (`torch.nn.Sequential` & `torch.nn.Module`):** In PyTorch, custom neural networks derive from `nn.Module`. A module can contain leaf layers (`nn.Linear`, `nn.Conv2d`) or composite containers (`nn.Sequential`). Invoking `model(inputs)` runs the forward pass recursively across the entire tree of layers.
  - **GUI Toolkits (`tkinter.Widget`):** Frames and windows contain widgets and other nested frames, rendering recursively.

---

## 5. Pitfalls and When Not to Use It

1. **Stack Overflow on Deep Hierarchies (Recursion Limits):**
   - Naive recursive implementations (`GetSizeInBytes()`) consume call-stack frames proportional to tree depth. In systems with 10,000+ nested directories or deeply nested ASTs, this causes stack overflow crashes.
   - *Fix:* For arbitrarily deep trees, use an **iterative traversal** with an explicit heap-allocated `Stack<T>` or `Queue<T>`.
2. **Cyclic Reference Traps (Infinite Recursion):**
   - If a directory contains a symbolic link pointing to one of its ancestor directories, or an organization chart has a cyclical managerial reference (Employee A reports to B, who reports to A), recursive traversals enter an infinite loop until memory is exhausted.
   - *Fix:* Maintain a `HashSet<T>` of visited node IDs or enforce strict Directed Acyclic Graph (DAG) validation upon child addition.
3. **Violating LSP with "Transparency":**
   - Placing `Add(item)` on the root `Component` interface forces leaf objects to implement a method they cannot support. Throwing `NotSupportedException` breaks the Liskov Substitution Principle because leaves cannot truly substitute for components in child-management contexts. Favor **Type Safety** by placing child manipulation methods exclusively on composites.
4. **Caching Invalidation Complexity:**
   - In large trees, caching aggregated values (e.g., caching folder size to avoid calculating millions of child files on every query) requires cache-invalidation signals bubbling up the tree whenever a leaf changes. If a leaf file is updated, every parent directory up to the root must invalidate its cached total.

---

## 6. Exercises & Practical Drills

### Exercise 1: Build a Composite Validator
Design a `CompositeValidator<T>` in C# or Python that implements `IValidator<T>` and aggregates multiple individual validators. If any child validator fails, the composite returns failure and aggregates all error messages.

<details>
<summary>Answer</summary>

```csharp
public interface IValidator<T>
{
    ValidationResult Validate(T entity);
}

public class ValidationResult
{
    public bool IsValid => Errors.Count == 0;
    public List<string> Errors { get; } = new();
}

public class CompositeValidator<T> : IValidator<T>
{
    private readonly List<IValidator<T>> _validators = new();

    public CompositeValidator<T> Add(IValidator<T> validator)
    {
        _validators.Add(validator);
        return this;
    }

    public ValidationResult Validate(T entity)
    {
        var aggregated = new ValidationResult();
        foreach (var validator in _validators)
        {
            var result = validator.Validate(entity);
            if (!result.IsValid)
            {
                aggregated.Errors.AddRange(result.Errors);
            }
        }
        return aggregated;
    }
}
```

The client can register individual rules (`NotEmptyRule`, `EmailFormatRule`, `AgeThresholdRule`) or nest another `CompositeValidator` without the caller ever knowing how many rules exist.
</details>

### Exercise 2: Cycle Detection Guard
How do you protect a composite directory tree against cyclic references (e.g., when a user attempts to add an ancestor folder as a child of its own subfolder)?

<details>
<summary>Answer</summary>

Before adding a child inside `DirectoryItem.Add(FileSystemItem item)`, verify that `item` is not equal to `this` and that `this` does not exist anywhere within `item`'s descendant hierarchy:

```python
def add(self, item: FileSystemItem) -> "DirectoryItem":
  if item is self:
    raise ValueError("Cannot add a composite to itself.")

  # If item is a Directory, check if 'self' is in its subtree
  if isinstance(item, DirectoryItem) and item.contains_descendant(self):
    raise ValueError("Cyclic reference detected: Cannot add ancestor as child.")

  self._children.append(item)
  return self


def contains_descendant(self, target: FileSystemItem) -> bool:
  for child in self._children:
    if child is target:
      return True
    if (
        isinstance(child, DirectoryItem)
        and child.contains_descendant(target)
    ):
      return True
  return False
```
</details>

---

## 7. Interview Questions & Model Answers

<details>
<summary><strong>1. What is the Composite pattern? [BASIC]</strong></summary>

The Composite pattern is a structural design pattern that composes objects into tree structures to represent **part-whole hierarchies**, allowing client code to treat individual leaf objects and composite collections of objects **identically**.

It consists of three primary components:
1. A **Component** interface declaring common operations (e.g., `GetSize()`, `Render()`, `Execute()`).
2. **Leaf** classes that represent terminal nodes containing business data and no children.
3. **Composite** classes that maintain a collection of child components and implement operations by delegating work recursively across their children.

The major architectural benefit is that it eliminates conditional branching logic (`if (node is Folder) ... else ...`) in client applications, adhering to the Open/Closed Principle.

</details>

<details>
<summary><strong>2. Give an example of a Composite in a real system. [SCENARIO]</strong></summary>

A classic real-world example is an **enterprise file system**:
- The component interface is `IFileSystemItem` with methods `GetSize()` and `PrintHierarchy()`.
- The leaf is `FileItem`, holding raw file byte size. Its `GetSize()` simply returns its own size.
- The composite is `DirectoryItem`, holding a collection of `IFileSystemItem` instances (which can be either files or other directories). Its `GetSize()` recursively sums the sizes of all its children.

Other prominent production examples include:
1. **UI Component Frameworks (WPF / DOM):** A `Container` or `Panel` holds buttons, text fields, and nested sub-panels, rendering the entire tree via uniform layout operations.
2. **Organization Hierarchies:** An `Employee` interface implemented by `IndividualContributor` (leaf) and `Manager` (composite holding a team), calculating total department payroll uniformly.
3. **Composite Validators:** In backend request pipelines, combining multiple independent validation rules into a single `CompositeValidator` that executes all sub-validators polymorphically.

</details>

<details>
<summary><strong>3. How would you model a pricing bundle that contains products and other bundles? [SCENARIO]</strong></summary>

A `Priceable` interface with `price()`. `Product` returns its price; `Bundle` sums its children (and may apply a discount). The cart just calls `price()` on whatever it holds.

</details>

<details>
<summary><strong>4. Should `add()` be on the Component or only on Composite? [TRICKY]</strong></summary>

Putting it on Component gives transparency (uniform) but leaves must throw or no-op, which is unsafe. Putting it only on Composite is type-safe but clients must know which node they have. Most real code chooses safety.

</details>

<details>
<summary><strong>5. Give a Composite example from a UI toolkit. [SCENARIO]</strong></summary>

A `Panel` contains buttons, labels and other panels; `render()` or `layout()` on the root recurses through the tree.

</details>

<details>
<summary><strong>6. What can go wrong in a recursive composite? [TRICKY]</strong></summary>

Cycles (a folder containing itself) cause infinite recursion, and very deep trees can overflow the stack. Guard against cycles on `add` and consider iterative traversal for large trees.

</details>

---

## Try it

Run this: `size()` works the same on a file or a nested folder. Then redraw it in [LLD Studio](/tools/lld-studio/); the [track hub](../README.md) has the pattern-choice drills.

```python
class File:
    def __init__(self, n): self.n = n
    def size(self): return self.n

class Folder:
    def __init__(self, *items): self.items = list(items)
    def add(self, i): self.items.append(i)
    def size(self): return sum(i.size() for i in self.items)

root = Folder(File(5), Folder(File(3), File(2)))
assert root.size() == 10
```

---

## One-page cheat sheet

```text
COMPOSITE  Component { op() } <- Leaf | Composite(children, op() recurses)
Uniform treatment: client calls op() on node, never checks leaf/group
Fits trees: file system, UI controls, org chart, expression trees, menus
Where do add()/remove() live? safety (Composite only) vs transparency (Component)
Watch: cycles, deep recursion, parent pointers, ordering
Combine: Visitor to run new ops over the tree
```

---

## 8. Sources & Further Reading

- [Microsoft Learn: WPF Visual Tree Architecture](https://learn.microsoft.com/en-us/dotnet/desktop/wpf/advanced/wpf-architecture)
- [Microsoft Learn: View Compilation and Custom View Engines in ASP.NET Core](https://learn.microsoft.com/en-us/aspnet/core/mvc/views/overview)
- [Python Documentation: ElementTree XML API](https://docs.python.org/3/library/xml.etree.elementtree.html)
- [Refactoring.Guru: Composite Pattern](https://refactoring.guru/design-patterns/composite)
- [Erich Gamma, Richard Helm, Ralph Johnson, John Vlissides: Design Patterns (GoF)](https://en.wikipedia.org/wiki/Design_Patterns)

---

Previous: [Bridge](../09-bridge/README.md) · Next: [Decorator (and Why It Is Not the Same as a Python @decorator)](../11-decorator/README.md)
