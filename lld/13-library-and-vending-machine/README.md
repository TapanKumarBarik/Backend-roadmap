# Module 13: Library & Vending Machine

## Why this matters

Two more classic LLD interview problems, each chosen for a specific
contrast this module wants to make explicit. The **Library** system's
book status (available/loaned/reserved/lost) is modeled as a plain enum
with guard checks — deliberately *not* the State pattern (module 08) —
because the transitions are few and the behavior at each status barely
differs. The **Vending Machine** is the canonical State pattern example
for a reason: its behavior *genuinely* differs per state (what
`insertCoin` and `selectProduct` do changes completely depending on
whether the machine is idle, has money in it, or is sold out), so it
gets the full State class hierarchy. Seeing both side by side, in the
same module, is the point — knowing *when not to reach for a pattern* is
as much a design skill as knowing the pattern itself.

---

## Problem 1: Library Management System

### Requirements

**Functional**: the library holds books, where each title (`Book`) may
have multiple physical copies (`BookItem`), each independently
trackable by barcode. A member can check out an available copy, return
a copy (which may incur a late fine), and reserve a title when every
copy is currently on loan — reservations are honored FIFO, and the
member at the front of the queue is notified the moment a copy comes
back.

**Non-functional**: notifying waiting members must not require
`Library` to know *how* a member is reached (email, push, console
print) — that decision belongs to `Member`, not `Library` (module 04's
DIP, via Observer, module 08).

**Assumptions stated up front** (module 11, step 1): one library
instance manages the whole catalog (no Singleton here, unlike
`ParkingLot` in module 12 — nothing about *this* problem requires
exactly-one-instance enforcement, only convenience, so it's left as an
ordinary object); a fixed 14-day loan period and a flat per-day late
fine; a reserved copy is held only for the member it was assigned to
until they check it out — no expiry timer (named as a simplification
below).

### Entities and relationships

Applying module 11's steps 3–4: `Library o-- BookItem` (aggregation —
`BookItem`s are tracked by the library but conceptually belong to the
collection, not manufactured/destroyed by it); `BookItem --> Book`
(association — many copies reference one title's metadata); `Library
--> Loan` (creates, on checkout); `Loan --> Member`, `Loan --> BookItem`
(association); `Member ..|> LibraryObserver` (realizes — Observer,
module 08, so `Library` depends only on the interface).

### Class diagram

```
┌────────────────┐        ┌───────────────┐        ┌───────────────────────┐
│    Library     │  o──   │    BookItem   │  -->   │          Book         │
├────────────────┤        ├───────────────┤        ├───────────────────────┤
│ - catalog      │        │ - status      │        │ - isbn, title, author │
│ - reservations │        │ - reservedFor │        └───────────────────────┘
├────────────────┤        └───────────────┘
│ + checkout()   │
│ + reserve()    │
│ + returnBook() │
└────────────────┘
                          │
                          │ --> creates, on checkout
                          ┌────────────────┐        ┌────────────┐
                          │      Loan      │  -->   │   Member   │
                          ├────────────────┤        ├────────────┤
                          │ - checkoutDate │        │ - loans    │
                          │ - dueDate      │        ├────────────┤
                          └────────────────┘        │ + notify() │
                                                     └────────────┘

LibraryObserver (interface) <── Member   (Observer, module 08 — Library depends
                                           only on the interface, never on Member)
```

### Implementation

{{tabs}}
{{tab Python}}
```python
from enum import Enum, auto
from datetime import datetime, timedelta
from collections import deque
from abc import ABC, abstractmethod

class BookStatus(Enum):
    AVAILABLE = auto()
    LOANED = auto()
    RESERVED = auto()
    LOST = auto()

class Book:                                   # metadata shared by every physical copy
    def __init__(self, isbn: str, title: str, author: str):
        self.isbn = isbn
        self.title = title
        self.author = author

class BookItem:                               # one physical, barcoded copy of a Book
    def __init__(self, barcode: str, book: Book):
        self.barcode = barcode
        self.book = book
        self.status = BookStatus.AVAILABLE
        self.reserved_for: "Member | None" = None

class LibraryObserver(ABC):                   # Observer, module 08
    @abstractmethod
    def notify(self, book_item: "BookItem"): ...

class Member(LibraryObserver):
    def __init__(self, member_id: str, name: str):
        self.member_id = member_id
        self.name = name
        self.loans: list["Loan"] = []

    def notify(self, book_item: "BookItem"):
        print(f"[notify] {self.name}: '{book_item.book.title}' is ready for pickup")

class Loan:
    def __init__(self, book_item: BookItem, member: Member, days=14):
        self.book_item = book_item
        self.member = member
        self.checkout_date = datetime.now()
        self.due_date = self.checkout_date + timedelta(days=days)

class Library:
    DAILY_FINE = 0.5

    def __init__(self):
        self.catalog: dict[str, list[BookItem]] = {}          # isbn -> copies
        self.reservations: dict[str, deque[Member]] = {}      # isbn -> waiting members, FIFO

    def add_book_item(self, item: BookItem):
        self.catalog.setdefault(item.book.isbn, []).append(item)

    def _find_checkoutable_item(self, isbn: str, member: Member):
        for item in self.catalog.get(isbn, []):
            if item.status == BookStatus.AVAILABLE:
                return item
            if item.status == BookStatus.RESERVED and item.reserved_for is member:
                return item
        return None

    def checkout(self, member: Member, isbn: str):
        item = self._find_checkoutable_item(isbn, member)
        if item is None:
            return None                        # nothing checkoutable by this member right now
        item.status = BookStatus.LOANED
        item.reserved_for = None
        loan = Loan(item, member)
        member.loans.append(loan)
        return loan

    def reserve(self, member: Member, isbn: str):
        self.reservations.setdefault(isbn, deque()).append(member)

    def return_book(self, loan: Loan) -> float:
        item = loan.book_item
        loan.member.loans.remove(loan)
        fine = self._late_fine(loan)

        queue = self.reservations.get(item.book.isbn)
        if queue:                              # someone's waiting — hand it to them, don't reopen to everyone
            next_member = queue.popleft()
            item.status = BookStatus.RESERVED
            item.reserved_for = next_member
            next_member.notify(item)           # Observer notification, module 08
        else:
            item.status = BookStatus.AVAILABLE
        return fine

    def _late_fine(self, loan: Loan) -> float:
        days_late = (datetime.now() - loan.due_date).days
        return max(0, days_late) * self.DAILY_FINE

# usage
library = Library()
book = Book("978-0132350884", "Clean Code", "Robert C. Martin")
library.add_book_item(BookItem("BC-001", book))

alice = Member("M1", "Alice")
bob = Member("M2", "Bob")

loan = library.checkout(alice, book.isbn)
print(f"Alice checked out: {loan is not None}")

failed = library.checkout(bob, book.isbn)      # only copy is out
print(f"Bob's immediate checkout (should fail): {failed is None}")

library.reserve(bob, book.isbn)
library.return_book(loan)                      # triggers reservation notify to Bob

bobs_loan = library.checkout(bob, book.isbn)   # now succeeds — item was RESERVED for Bob
print(f"Bob checked out after reservation: {bobs_loan is not None}")
```
{{tab C#}}
```csharp
public enum BookStatus { Available, Loaned, Reserved, Lost }

public class Book {                                    // metadata shared by every physical copy
    public string Isbn, Title, Author;
    public Book(string isbn, string title, string author) { Isbn = isbn; Title = title; Author = author; }
}

public class BookItem {                                 // one physical, barcoded copy of a Book
    public string Barcode;
    public Book Book;
    public BookStatus Status = BookStatus.Available;
    public Member ReservedFor;
    public BookItem(string barcode, Book book) { Barcode = barcode; Book = book; }
}

public interface ILibraryObserver {                     // Observer, module 08
    void Notify(BookItem item);
}

public class Member : ILibraryObserver {
    public string MemberId, Name;
    public List<Loan> Loans = new List<Loan>();
    public Member(string id, string name) { MemberId = id; Name = name; }

    public void Notify(BookItem item) =>
        Console.WriteLine($"[notify] {Name}: '{item.Book.Title}' is ready for pickup");
}

public class Loan {
    public BookItem BookItem; public Member Member; public DateTime CheckoutDate, DueDate;
    public Loan(BookItem item, Member member, int days = 14) {
        BookItem = item; Member = member;
        CheckoutDate = DateTime.Now; DueDate = CheckoutDate.AddDays(days);
    }
}

public class Library {
    private const double DailyFine = 0.5;
    private Dictionary<string, List<BookItem>> _catalog = new Dictionary<string, List<BookItem>>();
    private Dictionary<string, Queue<Member>> _reservations = new Dictionary<string, Queue<Member>>();

    public void AddBookItem(BookItem item) {
        if (!_catalog.ContainsKey(item.Book.Isbn)) _catalog[item.Book.Isbn] = new List<BookItem>();
        _catalog[item.Book.Isbn].Add(item);
    }

    private BookItem FindCheckoutableItem(string isbn, Member member) {
        foreach (var item in _catalog.GetValueOrDefault(isbn, new List<BookItem>())) {
            if (item.Status == BookStatus.Available) return item;
            if (item.Status == BookStatus.Reserved && item.ReservedFor == member) return item;
        }
        return null;
    }

    public Loan Checkout(Member member, string isbn) {
        var item = FindCheckoutableItem(isbn, member);
        if (item == null) return null;                  // nothing checkoutable by this member right now
        item.Status = BookStatus.Loaned;
        item.ReservedFor = null;
        var loan = new Loan(item, member);
        member.Loans.Add(loan);
        return loan;
    }

    public void Reserve(Member member, string isbn) {
        if (!_reservations.ContainsKey(isbn)) _reservations[isbn] = new Queue<Member>();
        _reservations[isbn].Enqueue(member);
    }

    public double ReturnBook(Loan loan) {
        var item = loan.BookItem;
        loan.Member.Loans.Remove(loan);
        double fine = LateFine(loan);

        if (_reservations.TryGetValue(item.Book.Isbn, out var queue) && queue.Count > 0) {
            var next = queue.Dequeue();                  // someone's waiting — hand it to them, don't reopen to everyone
            item.Status = BookStatus.Reserved;
            item.ReservedFor = next;
            next.Notify(item);                            // Observer notification, module 08
        } else {
            item.Status = BookStatus.Available;
        }
        return fine;
    }

    private double LateFine(Loan loan) {
        int daysLate = (DateTime.Now - loan.DueDate).Days;
        return Math.Max(0, daysLate) * DailyFine;
    }
}

// usage
var library = new Library();
var book = new Book("978-0132350884", "Clean Code", "Robert C. Martin");
library.AddBookItem(new BookItem("BC-001", book));

var alice = new Member("M1", "Alice");
var bob = new Member("M2", "Bob");

var loan = library.Checkout(alice, book.Isbn);
Console.WriteLine($"Alice checked out: {loan != null}");

var failed = library.Checkout(bob, book.Isbn);            // only copy is out
Console.WriteLine($"Bob's immediate checkout (should fail): {failed == null}");

library.Reserve(bob, book.Isbn);
library.ReturnBook(loan);                                 // triggers reservation notify to Bob

var bobsLoan = library.Checkout(bob, book.Isbn);           // now succeeds — item was Reserved for Bob
Console.WriteLine($"Bob checked out after reservation: {bobsLoan != null}");
```
{{/tabs}}

### Tradeoffs and extensions

- **`BookStatus` is a plain enum with guard checks, not the State
  pattern (module 08) — a deliberate contrast with the Vending Machine
  below.** The behavior at each status barely differs (checkout mostly
  just checks "is this status one I can hand out?"), so a full State
  class hierarchy would be ceremony without payoff. Compare this to the
  Vending Machine's states, where `selectProduct` does something
  *completely different* depending on state — that's when State earns
  its complexity.
- **`Book` vs `BookItem` is the single most important modeling decision
  here.** One title, many physical copies — collapsing them into one
  class would make it impossible to track that copy #2 is loaned while
  copy #1 sits on the shelf.
- **Reservations held indefinitely once assigned is a named
  simplification.** A real system would expire an unclaimed reservation
  after N days and offer the copy to the next member in queue — this is
  a natural extension, not a design flaw, since the queue structure
  already supports it.
- **`Library` depends on `LibraryObserver`, never on `Member`
  directly** — swapping console-print notification for email or push
  requires a new class implementing `notify()`/`Notify()`, zero changes
  to `Library` (DIP, module 04; Observer, module 08).

---

## Problem 2: Vending Machine

### Requirements

**Functional**: a machine holds products in labeled slots, each with a
price and remaining quantity. A buyer inserts coins (possibly more than
one, before selecting), then selects a slot; if the balance covers the
price and stock remains, the machine dispenses the product and returns
change, otherwise it explains why not. A buyer may request a refund of
their inserted balance at any point before selecting.

**Non-functional**: the *set* of valid actions and what each one does
must change correctly based on the machine's current state (no
coins-in-progress vs. mid-transaction vs. out of stock) without
`if`/`elif` chains checking a status flag scattered across every
method — this is the canonical State pattern (module 08) use case.

**Assumptions**: a single machine, no multi-currency handling; "sold
out" means every slot is at zero quantity (a machine with stock
remaining in *some* slot stays operational, just refuses picks on empty
ones).

### Class diagram

```
┌───────────────────┐        ┌───────────────┐
│   VendingMachine  │  o──   │    Product    │   (many, in inventory)
├───────────────────┤        ├───────────────┤
│ - inventory       │        │ - name, price │
│ - balance         │        │ - quantity    │
├───────────────────┤        └───────────────┘
│ + insertCoin()    │
│ + selectProduct() │
│ + refund()        │
└───────────────────┘
        │ --> delegates every call to current state
                       ┌─────────────────────┐
                       │ VendingMachineState │   (State, module 08)
                       ├─────────────────────┤
                       │ (interface)         │
                       └─────────────────────┘
                                  │
              ┬──────────────────┬┼───────────────────┬
              │                   │                    │
        ┌───────────┐    ┌───────────────┐    ┌──────────────┐
        │ IdleState │    │ HasMoneyState │    │ SoldOutState │
        └───────────┘    └───────────────┘    └──────────────┘
```

### Implementation

{{tabs}}
{{tab Python}}
```python
from abc import ABC, abstractmethod

class Product:
    def __init__(self, name: str, price: float, quantity: int):
        self.name = name
        self.price = price
        self.quantity = quantity

class VendingMachineState(ABC):               # State, module 08
    @abstractmethod
    def insert_coin(self, machine: "VendingMachine", amount: float): ...
    @abstractmethod
    def select_product(self, machine: "VendingMachine", slot: str): ...
    @abstractmethod
    def refund(self, machine: "VendingMachine"): ...

class IdleState(VendingMachineState):
    def insert_coin(self, machine, amount):
        machine.balance += amount
        machine.set_state(machine.has_money_state)

    def select_product(self, machine, slot):
        print("Insert coins before selecting a product")

    def refund(self, machine):
        print("Nothing to refund")

class HasMoneyState(VendingMachineState):
    def insert_coin(self, machine, amount):
        machine.balance += amount             # stays in HasMoneyState — coins can stack

    def select_product(self, machine, slot):
        product = machine.inventory.get(slot)
        if product is None or product.quantity == 0:
            print(f"Slot {slot} is empty")
            return
        if machine.balance < product.price:
            print(f"Insufficient balance: need {product.price}, have {machine.balance}")
            return

        product.quantity -= 1
        change = machine.balance - product.price
        machine.balance = 0.0
        print(f"Dispensing {product.name}. Change: {change:.2f}")

        machine.set_state(machine.sold_out_state if machine.is_sold_out() else machine.idle_state)

    def refund(self, machine):
        print(f"Refunding {machine.balance:.2f}")
        machine.balance = 0.0
        machine.set_state(machine.idle_state)

class SoldOutState(VendingMachineState):
    def insert_coin(self, machine, amount):
        print("Machine is sold out — coin returned")

    def select_product(self, machine, slot):
        print("Machine is sold out")

    def refund(self, machine):
        print("Nothing to refund")

class VendingMachine:                          # context, module 08
    def __init__(self, inventory: dict[str, Product]):
        self.inventory = inventory
        self.balance = 0.0

        self.idle_state = IdleState()
        self.has_money_state = HasMoneyState()
        self.sold_out_state = SoldOutState()

        self.state: VendingMachineState = (
            self.sold_out_state if self.is_sold_out() else self.idle_state
        )

    def set_state(self, state: VendingMachineState):
        self.state = state

    def is_sold_out(self) -> bool:
        return all(p.quantity == 0 for p in self.inventory.values())

    def insert_coin(self, amount: float):
        self.state.insert_coin(self, amount)

    def select_product(self, slot: str):
        self.state.select_product(self, slot)

    def refund(self):
        self.state.refund(self)

# usage
machine = VendingMachine({
    "A1": Product("Chips", 1.50, 2),
    "A2": Product("Soda", 2.00, 0),
})

machine.select_product("A1")                   # rejected: no coins yet
machine.insert_coin(1.00)
machine.select_product("A1")                   # rejected: insufficient balance
machine.insert_coin(1.00)
machine.select_product("A2")                   # rejected: empty slot, balance kept
machine.select_product("A1")                   # dispenses, change 0.50
machine.insert_coin(1.50)
machine.select_product("A1")                   # dispenses last chip -> machine goes SoldOut
machine.insert_coin(1.00)                      # refused, machine sold out
```
{{tab C#}}
```csharp
public class Product {
    public string Name; public double Price; public int Quantity;
    public Product(string name, double price, int quantity) { Name = name; Price = price; Quantity = quantity; }
}

public interface IVendingMachineState {                  // State, module 08
    void InsertCoin(VendingMachine machine, double amount);
    void SelectProduct(VendingMachine machine, string slot);
    void Refund(VendingMachine machine);
}

public class IdleState : IVendingMachineState {
    public void InsertCoin(VendingMachine machine, double amount) {
        machine.Balance += amount;
        machine.SetState(machine.HasMoney);
    }
    public void SelectProduct(VendingMachine machine, string slot) =>
        Console.WriteLine("Insert coins before selecting a product");
    public void Refund(VendingMachine machine) => Console.WriteLine("Nothing to refund");
}

public class HasMoneyState : IVendingMachineState {
    public void InsertCoin(VendingMachine machine, double amount) => machine.Balance += amount;  // stays here — coins stack

    public void SelectProduct(VendingMachine machine, string slot) {
        machine.Inventory.TryGetValue(slot, out var product);
        if (product == null || product.Quantity == 0) { Console.WriteLine($"Slot {slot} is empty"); return; }
        if (machine.Balance < product.Price) {
            Console.WriteLine($"Insufficient balance: need {product.Price}, have {machine.Balance}");
            return;
        }

        product.Quantity--;
        double change = machine.Balance - product.Price;
        machine.Balance = 0.0;
        Console.WriteLine($"Dispensing {product.Name}. Change: {change:F2}");

        machine.SetState(machine.IsSoldOut() ? machine.SoldOut : machine.Idle);
    }

    public void Refund(VendingMachine machine) {
        Console.WriteLine($"Refunding {machine.Balance:F2}");
        machine.Balance = 0.0;
        machine.SetState(machine.Idle);
    }
}

public class SoldOutState : IVendingMachineState {
    public void InsertCoin(VendingMachine machine, double amount) => Console.WriteLine("Machine is sold out — coin returned");
    public void SelectProduct(VendingMachine machine, string slot) => Console.WriteLine("Machine is sold out");
    public void Refund(VendingMachine machine) => Console.WriteLine("Nothing to refund");
}

public class VendingMachine {                             // context, module 08
    public Dictionary<string, Product> Inventory;
    public double Balance = 0.0;
    public IVendingMachineState Idle = new IdleState();
    public IVendingMachineState HasMoney = new HasMoneyState();
    public IVendingMachineState SoldOut = new SoldOutState();
    private IVendingMachineState _state;

    public VendingMachine(Dictionary<string, Product> inventory) {
        Inventory = inventory;
        _state = IsSoldOut() ? SoldOut : Idle;
    }

    public void SetState(IVendingMachineState state) => _state = state;
    public bool IsSoldOut() => Inventory.Values.All(p => p.Quantity == 0);

    public void InsertCoin(double amount) => _state.InsertCoin(this, amount);
    public void SelectProduct(string slot) => _state.SelectProduct(this, slot);
    public void Refund() => _state.Refund(this);
}

// usage
var machine = new VendingMachine(new Dictionary<string, Product> {
    ["A1"] = new Product("Chips", 1.50, 2),
    ["A2"] = new Product("Soda", 2.00, 0),
});

machine.SelectProduct("A1");                               // rejected: no coins yet
machine.InsertCoin(1.00);
machine.SelectProduct("A1");                               // rejected: insufficient balance
machine.InsertCoin(1.00);
machine.SelectProduct("A2");                               // rejected: empty slot, balance kept
machine.SelectProduct("A1");                               // dispenses, change 0.50
machine.InsertCoin(1.50);
machine.SelectProduct("A1");                               // dispenses last chip -> machine goes SoldOut
machine.InsertCoin(1.00);                                  // refused, machine sold out
```
{{/tabs}}

### Tradeoffs and extensions

- **This is the full State pattern, not a status enum with guards** —
  the direct contrast with `BookStatus` above. Justify the difference
  out loud in an interview: here, *the same method call* (`selectProduct`)
  does entirely different things depending on state (dispense vs. "insert
  coins first" vs. "sold out"), which is exactly when a class per state
  pays for itself.
- **Adding a new state is OCP-friendly (module 04)**: a
  `MaintenanceState` that refuses every buyer action except a restock
  call is one new class implementing `VendingMachineState`, with zero
  changes to `IdleState`, `HasMoneyState`, or `SoldOutState`.
- **`VendingMachine` holds only data and delegates** — it never contains
  an `if state == ...` chain anywhere. If you find yourself adding one,
  that logic belongs inside a state class instead.
- **Concurrency (module 10)**: exactly like `Level.find_and_assign` in
  module 12, `balance` and `product.quantity` are shared mutable state.
  A single machine is usually accessed by one buyer at a time physically,
  but if this were extended to a networked machine accepting a mobile
  payment *and* physical coins simultaneously, `selectProduct`'s
  check-then-decrement sequence would need the same lock-encapsulated
  treatment.

## Hands-on exercises

### 1. Library: handle a lost book

Add a `report_lost(loan)`/`ReportLost(loan)` method to `Library` that
marks the item `LOST`, removes it from the member's active loans, and
does **not** enter the reservation-notify path — a lost copy never
becomes available again; a librarian must add a replacement `BookItem`
separately.

### 2. Library: cap checkouts per member

Enforce a max of 5 concurrently-checked-out books per member inside
`checkout`/`Checkout`. Return `None`/`null` with a printed reason if the
member is at the limit — without adding any new field or method to
`Member` itself (count `member.loans`/`Member.Loans` directly).

### 3. Library: search the catalog

Add a `search(title_substring)`/`Search(...)` method to `Library`
returning every `Book` whose title contains the substring
(case-insensitive), scanning `catalog` — confirm it needs no changes to
`BookItem` or `Loan`.

### 4. Vending Machine: add a maintenance state

Implement `MaintenanceState`, reachable via a new
`machine.enter_maintenance()`/`EnterMaintenance()` method, which refuses
`insertCoin`/`selectProduct`/`refund` and only responds to a new
`restock(slot, qty)`/`Restock(slot, qty)` call; after restocking, return
to `IdleState`.

### 5. Vending Machine: verify sold-out transitions

Write a short test/script that buys every unit of every product one at
a time and asserts the machine ends in `SoldOutState` — then assert a
further `insertCoin`/`InsertCoin` call is rejected.

## Independent challenge

No code given.

**Task:** Make `Library.checkout`/`Checkout` safe when multiple members
try to check out **the last remaining copy** of the same book
concurrently. Using module 10's guidance (the same lesson `Level.
find_and_assign` in module 12 applied): identify the check-then-act
race in `_find_checkoutable_item` + the status mutation that follows it,
and protect it with a lock fully encapsulated inside `Library` — never
exposed for callers to manage themselves. Write a test that starts
several "member" threads simultaneously calling `checkout`/`Checkout`
for the same `isbn` with only one available copy, and confirm exactly
one thread receives a `Loan` and the rest correctly receive `None`/`null`.

<details>
<summary>Hint</summary>

The unsafe sequence is identical in shape to module 12's parking-lot
race: "find an item whose status is checkoutable" (check) followed by
"set its status to LOANED" (act), currently as two separate steps
(`_find_checkoutable_item` then the mutation in `checkout`). Combine
them into one method protected by a single lock owned by `Library`,
exactly like `Level.find_and_assign` combined "find" and "assign."

</details>

## Common mistakes & troubleshooting

- **Modeling `Book` and `BookItem` as a single class.** This is the
  single most common Library LLD mistake — it makes it impossible to
  represent "two physical copies of the same title, one loaned and one
  on the shelf," which is the entire point of the distinction.
- **Making the reservation queue global instead of keyed per ISBN.** A
  reservation for one title should never block or get confused with
  reservations for a different title — `reservations` must be a map,
  not a single shared queue.
- **Putting Vending Machine state logic inside `VendingMachine` itself**
  (an `if self.state == "idle": ...` chain) instead of inside the state
  classes. This defeats State entirely — the whole benefit is that each
  state class owns its own behavior, and `VendingMachine` never branches
  on what state it's in.
- **Checking only the just-purchased product's quantity to decide
  sold-out, instead of the whole inventory.** A machine with product A
  at zero but product B still in stock is *not* sold out —
  `is_sold_out`/`IsSoldOut` must check every product, not just the one
  involved in the current purchase.
- **Treating `HasMoneyState.insert_coin` as unreachable** because
  "coins are only inserted once, from Idle." Buyers routinely insert
  multiple coins before selecting — `HasMoneyState` must handle
  `insertCoin` too (by staying in `HasMoneyState` and adding to
  balance), not just `IdleState`.

## Checkpoint quiz

1. Why are `Book` and `BookItem` two separate classes instead of one?
2. What role does `LibraryObserver` play, and why does `Library` depend
   only on that interface rather than on `Member` directly?
3. In the Vending Machine, which classes actually contain the logic for
   what `selectProduct` does, and why isn't it `VendingMachine` itself?
4. What triggers the transition into `SoldOutState`, and why must it be
   checked against the *whole* inventory rather than just the product
   that was just purchased?
5. Library uses a plain enum (`BookStatus`) for status; Vending Machine
   uses full State pattern classes. What's the actual criterion that
   justifies choosing one approach over the other?

<details>
<summary>Answers</summary>

1. So one title can have multiple independently-trackable physical
   copies — copy #1 can be `LOANED` while copy #2 is `AVAILABLE` on the
   shelf, which would be impossible to represent if they were the same
   object.
2. `LibraryObserver` is the abstraction `Library` depends on for
   notifying a waiting member (Observer, module 08; DIP, module 04) —
   `Library` never needs to know *how* a member is notified (print,
   email, push), so notification mechanisms can change or multiply
   without touching `Library`.
3. `IdleState`, `HasMoneyState`, and `SoldOutState` — each implements
   `selectProduct` with entirely different behavior for its state.
   `VendingMachine` only holds data (`inventory`, `balance`) and
   delegates every call to `self.state`/`_state`; it never branches on
   what state it's in.
4. Every completed purchase checks whether *every* product's quantity
   is now zero (`is_sold_out`/`IsSoldOut`), not just the product that
   was purchased — a machine with stock remaining in even one other
   slot is still operational and must stay in `IdleState`.
5. Whether behavior actually *differs* per state/status. `BookStatus`'s
   values barely change what `checkout` does (mostly "is this one of
   the checkoutable statuses?") — a full State hierarchy would be
   ceremony without payoff. The Vending Machine's `selectProduct` does
   something completely different in each state, which is exactly when
   State earns its complexity.

</details>

## Interview questions

1. **"How do you model a library with multiple copies of the same
   book?"**
   Split metadata (`Book`: isbn, title, author) from physical inventory
   (`BookItem`: barcode, status) — one `Book` can have many `BookItem`s,
   each independently trackable, so copy-level state (loaned, available,
   lost) never gets confused with title-level metadata.
2. **"How would you handle book reservations so the right member gets
   notified when a copy becomes available?"**
   A per-ISBN FIFO queue of waiting members; on return, if the queue is
   non-empty, pop the front member, mark the returned copy `RESERVED`
   for them specifically, and call `notify()` through an
   `LibraryObserver` interface `Member` implements — `Library` never
   depends on `Member`'s concrete notification mechanism (Observer,
   module 08).
3. **"Walk me through your Vending Machine's state transitions."**
   `IdleState` on first coin moves to `HasMoneyState`; `HasMoneyState`
   accepts more coins (staying put) or a product selection, which either
   dispenses (moving to `IdleState` or `SoldOutState` depending on
   remaining stock) or is rejected for insufficient balance/empty slot
   (staying in `HasMoneyState`); a refund from `HasMoneyState` returns to
   `IdleState`. `SoldOutState` refuses every buyer action.
4. **"Why did you use the State pattern for the Vending Machine but a
   plain enum for the Library's book status?"**
   The criterion is whether behavior genuinely differs per state, not
   just data. Vending Machine's `selectProduct` does something entirely
   different in each state — that's State's use case. `BookStatus`'s
   transitions are simple guard checks with little behavioral
   difference, so a full class hierarchy would be unjustified ceremony
   (YAGNI, module 05).
5. **"How would you make either system safe under concurrent access?"**
   Identify the check-then-act sequence (find an eligible
   item/copy, then mutate its status) and wrap it in a single method
   protected by a lock owned entirely by the class managing the shared
   state (`Library` or `VendingMachine`) — never expose the lock itself,
   exactly the pattern `Level.find_and_assign` used for the Parking Lot
   in module 12.

## Further reading & sources

- [Refactoring.Guru: State pattern](https://refactoring.guru/design-patterns/state) - the Vending Machine's full state-class implementation is a textbook application of this pattern.
- [Refactoring.Guru: Observer pattern](https://refactoring.guru/design-patterns/observer) - revisit module 08's pattern, used here for real (Library reservation notification), not just as an exercise.
- [Python `collections.deque`](https://docs.python.org/3/library/collections.html#collections.deque) / [.NET `Queue<T>`](https://learn.microsoft.com/en-us/dotnet/api/system.collections.generic.queue-1) - the FIFO structures backing the reservation queue in both languages.

## Next

[14-tic-tac-toe-and-chess](../14-tic-tac-toe-and-chess/README.md)
— two more classic problems, full guided solutions: Tic-Tac-Toe and a
Chess move/board engine.
