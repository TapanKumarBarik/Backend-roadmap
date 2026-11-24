OUT = r'''import io
import contextlib
def out(action, *args):
    """The lines a call prints."""
    buffer = io.StringIO()
    with contextlib.redirect_stdout(buffer):
        action(*args)
    return buffer.getvalue().splitlines()
def error_of(action, *args, **kwargs):
    try:
        action(*args, **kwargs)
    except Exception as error:
        return type(error).__name__ + ": " + str(error)
    return None
'''
MODULE = 'lld/01-classes-objects-and-oop-building-blocks/README.md'

PROBLEMS = [
P(
    slug='oop-movie-ticket-counter', title='Movie Ticket Counter', topic='oop-and-classes', difficulty='beginner', module=MODULE,
    description='Write a Movie class that books tickets, refuses a booking when the seats run out, and prints its status.',
    statement=r'''Create a class `Movie`.

**Attributes**

- `movie_name`: the name of the movie
- `total_seats`: total seats in the theatre
- `ticket_price`: price of one ticket
- `booked_seats`: starts at `0`

Create it with `Movie(movie_name, total_seats, ticket_price)`.

**Methods**

- `book_ticket(num_tickets)` books the given number of tickets. The method **prints** its answer (it returns nothing):
  - fewer than 1 ticket: `Please book at least 1 ticket`
  - enough seats left: the booking is confirmed (`booked_seats` goes up) and it prints `Booked <num_tickets> ticket(s). Total amount: <amount>` where `amount = num_tickets * ticket_price`
  - not enough seats left: it prints `Sorry, not enough seats available` and **changes nothing**
- `show_status()` prints three lines: `Movie: <movie_name>`, `Seats available: <seats left>` and `Seats booked: <booked_seats>`.

**Example**

```
movie = Movie("Leo", 5, 150)
movie.book_ticket(2)    # Booked 2 ticket(s). Total amount: 300
movie.book_ticket(4)    # Sorry, not enough seats available
movie.show_status()     # Movie: Leo / Seats available: 3 / Seats booked: 2
```''',
    starter=r'''class Movie:
    def __init__(self, movie_name, total_seats, ticket_price):
        ...

    def book_ticket(self, num_tickets):
        ...

    def show_status(self):
        ...''',
    tests=OUT + r'''movie = Movie("Leo", 5, 150)
assert (movie.movie_name, movie.total_seats, movie.ticket_price, movie.booked_seats) == ("Leo", 5, 150, 0)
assert out(movie.show_status) == ["Movie: Leo", "Seats available: 5", "Seats booked: 0"]
assert out(movie.book_ticket, 2) == ["Booked 2 ticket(s). Total amount: 300"] and movie.booked_seats == 2
assert out(movie.book_ticket, 4) == ["Sorry, not enough seats available"] and movie.booked_seats == 2
assert out(movie.show_status) == ["Movie: Leo", "Seats available: 3", "Seats booked: 2"]
assert out(movie.book_ticket, 3) == ["Booked 3 ticket(s). Total amount: 450"] and movie.booked_seats == 5
assert out(movie.book_ticket, 1) == ["Sorry, not enough seats available"]
assert out(movie.show_status) == ["Movie: Leo", "Seats available: 0", "Seats booked: 5"]
other = Movie("Jawan", 10, 200)
assert out(other.book_ticket, 0) == ["Please book at least 1 ticket"] and out(other.book_ticket, -2) == ["Please book at least 1 ticket"] and other.booked_seats == 0
assert out(other.book_ticket, 1) == ["Booked 1 ticket(s). Total amount: 200"] and movie.booked_seats == 5 and other.booked_seats == 1
assert other.book_ticket(1) is None''',
    solution=r'''class Movie:
    def __init__(self, movie_name, total_seats, ticket_price):
        self.movie_name = movie_name
        self.total_seats = total_seats
        self.ticket_price = ticket_price
        self.booked_seats = 0

    def book_ticket(self, num_tickets):
        if num_tickets < 1:
            print("Please book at least 1 ticket")
        elif num_tickets <= self.total_seats - self.booked_seats:
            self.booked_seats += num_tickets
            print(f"Booked {num_tickets} ticket(s). Total amount: {num_tickets * self.ticket_price}")
        else:
            print("Sorry, not enough seats available")

    def show_status(self):
        print(f"Movie: {self.movie_name}")
        print(f"Seats available: {self.total_seats - self.booked_seats}")
        print(f"Seats booked: {self.booked_seats}")''',
    hints=[
        r'''`__init__` just stores the three arguments on `self` and sets `self.booked_seats = 0`. Every object gets its own copy of each attribute.''',
        r'''Seats left is not stored: it is `self.total_seats - self.booked_seats`. Check the bad-input case first, then "enough seats", and put the "sorry" message in the `else`.''',
        r'''Only the *successful* branch changes `booked_seats`. A refused booking must leave the object exactly as it was.''',
    ],
    explanation=r'''**The idea.** A class bundles data (`booked_seats`) with the actions that are allowed to change it (`book_ticket`). The rule "never sell more seats than exist" lives in *one* method, so no caller can forget it.

**Derive, do not store.** Seats left is `total_seats - booked_seats`. Storing it as a fourth attribute would mean two numbers that must always agree.

**Print versus return.** These methods *print* because the exercise is about what the user sees. In real code you would return a value (or raise an error) and let the caller decide how to show it; that is easier to test and to reuse.

**Going further.** What should happen if `num_tickets` is `2.5`? Where would you put that check?''',
),
P(
    slug='oop-person-student-teacher', title='Person, Student and Teacher', topic='oop-and-classes', difficulty='beginner', module=MODULE,
    description='Inheritance: a base class Person and two derived classes that reuse its attributes and override introduce().',
    statement=r'''Create a base class `Person`.

**Attributes:** `name` and `age`, set by `Person(name, age)`.
**Method:** `introduce()` prints `Hi, I am <name> and I am <age> years old`.

Create a derived class `Student` that **inherits** from `Person`.

- `Student(name, age, student_id, course)` has the extra attributes `student_id` and `course`.
- `introduce()` **overrides** the parent method and prints `Hi, I am <name>, student ID <student_id>, studying <course>`.
- `study(hours)` prints `<name> studied for <hours> hours`.

Create another derived class `Teacher` that inherits from `Person`.

- `Teacher(name, age, employee_id, subject)` has the extra attributes `employee_id` and `subject`.
- `introduce()` overrides the parent method and prints `Hi, I am <name>, employee ID <employee_id>, teaching <subject>`.
- `teach(hours)` prints `<name> taught <subject> for <hours> hours`.

Reuse the parent's `__init__` (with `super().__init__`) instead of setting `name` and `age` again.

**Example**

```
student = Student("Ravi", 20, "S101", "Python")
student.introduce()   # Hi, I am Ravi, student ID S101, studying Python
student.study(3)      # Ravi studied for 3 hours
```''',
    starter=r'''class Person:
    def __init__(self, name, age):
        ...

    def introduce(self):
        ...


class Student(Person):
    ...


class Teacher(Person):
    ...''',
    tests=OUT + r'''person = Person("Asha", 30)
assert (person.name, person.age) == ("Asha", 30)
assert out(person.introduce) == ["Hi, I am Asha and I am 30 years old"]
student = Student("Ravi", 20, "S101", "Python")
teacher = Teacher("Meena", 35, "T501", "Mathematics")
assert isinstance(student, Person) and isinstance(teacher, Person) and issubclass(Student, Person) and issubclass(Teacher, Person)
assert not isinstance(student, Teacher) and not isinstance(teacher, Student)
assert (student.name, student.age, student.student_id, student.course) == ("Ravi", 20, "S101", "Python")
assert (teacher.name, teacher.age, teacher.employee_id, teacher.subject) == ("Meena", 35, "T501", "Mathematics")
assert out(student.introduce) == ["Hi, I am Ravi, student ID S101, studying Python"]
assert out(teacher.introduce) == ["Hi, I am Meena, employee ID T501, teaching Mathematics"]
assert out(student.study, 3) == ["Ravi studied for 3 hours"]
assert out(teacher.teach, 2) == ["Meena taught Mathematics for 2 hours"]
assert not hasattr(person, "study") and not hasattr(student, "teach") and not hasattr(teacher, "study")
assert Student.introduce is not Person.introduce and Teacher.introduce is not Person.introduce
people = [person, student, teacher]
assert [out(p.introduce)[0][:5] for p in people] == ["Hi, I", "Hi, I", "Hi, I"]
assert sum(len(out(p.introduce)) for p in people) == 3
class Intern(Student):
    pass
intern = Intern("Kim", 19, "S9", "Go")
assert out(intern.introduce) == ["Hi, I am Kim, student ID S9, studying Go"] and isinstance(intern, Person)
second = Student("Zoe", 22, "S2", "SQL")
assert second.name == "Zoe" and student.name == "Ravi"''',
    solution=r'''class Person:
    def __init__(self, name, age):
        self.name = name
        self.age = age

    def introduce(self):
        print(f"Hi, I am {self.name} and I am {self.age} years old")


class Student(Person):
    def __init__(self, name, age, student_id, course):
        super().__init__(name, age)
        self.student_id = student_id
        self.course = course

    def introduce(self):
        print(f"Hi, I am {self.name}, student ID {self.student_id}, studying {self.course}")

    def study(self, hours):
        print(f"{self.name} studied for {hours} hours")


class Teacher(Person):
    def __init__(self, name, age, employee_id, subject):
        super().__init__(name, age)
        self.employee_id = employee_id
        self.subject = subject

    def introduce(self):
        print(f"Hi, I am {self.name}, employee ID {self.employee_id}, teaching {self.subject}")

    def teach(self, hours):
        print(f"{self.name} taught {self.subject} for {hours} hours")''',
    hints=[
        r'''`class Student(Person):` makes `Student` a child of `Person`. Its own `__init__` takes all four values, passes `name` and `age` to the parent with `super().__init__(name, age)`, and stores the two new ones itself.''',
        r'''Defining a method with the **same name** in the child *overrides* the parent's. When you call `student.introduce()`, Python looks in `Student` first and finds your version.''',
        r'''`study` belongs only to `Student` and `teach` only to `Teacher`: a child may add methods, but a sibling does not get them.''',
    ],
    explanation=r'''**Inheritance** means "a `Student` *is a* `Person`": the child starts with everything the parent has (`name`, `age`) and adds or changes what is special.

```mermaid
classDiagram
    class Person {
        +name
        +age
        +introduce()
    }
    class Student {
        +student_id
        +course
        +introduce()
        +study()
    }
    class Teacher {
        +employee_id
        +subject
        +introduce()
        +teach()
    }
    Person <|-- Student
    Person <|-- Teacher
```

**`super()`** gives you the parent's version. Calling `super().__init__(name, age)` reuses the parent's setup instead of copying its lines, so a change to `Person` reaches both children.

**Overriding** replaces a parent method for the child. That is the seed of *polymorphism*: `for p in people: p.introduce()` prints a different sentence for each kind of person without an `if`.

**Going further.** What would `Student.introduce` look like if it printed the parent's sentence first and then added the course (hint: `super().introduce()`)?''',
),
P(
    slug='oop-rectangle-basics', title='Rectangle Class', topic='oop-and-classes', difficulty='beginner', module=MODULE,
    description='A first class with attributes, methods that compute values, a method that changes the object and a validation rule.',
    statement=r'''Create a class `Rectangle` with `Rectangle(width, height)`.

- Both sides must be above 0, otherwise raise `ValueError("Sides must be positive")`.
- Attributes: `width` and `height`.
- `area()` returns `width * height`; `perimeter()` returns `2 * (width + height)`.
- `is_square()` returns `True` when both sides are equal.
- `scale(factor)` multiplies **both** sides by `factor` (the same object changes; it returns nothing). A `factor` of 0 or less raises `ValueError("Factor must be positive")` and changes nothing.
- `describe()` **prints** `Rectangle <width> x <height>: area <area>, perimeter <perimeter>`.''',
    starter=r'''class Rectangle:
    def __init__(self, width, height):
        ...

    def area(self):
        ...

    def perimeter(self):
        ...

    def is_square(self):
        ...

    def scale(self, factor):
        ...

    def describe(self):
        ...''',
    tests=OUT + r'''r = Rectangle(3, 4)
assert (r.width, r.height, r.area(), r.perimeter()) == (3, 4, 12, 14)
assert r.is_square() is False and Rectangle(5, 5).is_square() is True
assert out(r.describe) == ["Rectangle 3 x 4: area 12, perimeter 14"]
assert r.scale(2) is None and (r.width, r.height) == (6, 8) and r.area() == 48
assert out(r.describe) == ["Rectangle 6 x 8: area 48, perimeter 28"]
assert error_of(r.scale, 0) == "ValueError: Factor must be positive" and error_of(r.scale, -1) == "ValueError: Factor must be positive" and (r.width, r.height) == (6, 8)
assert error_of(Rectangle, 0, 5) == "ValueError: Sides must be positive" and error_of(Rectangle, 5, -1) == "ValueError: Sides must be positive"
a, b = Rectangle(1, 2), Rectangle(1, 2)
a.scale(3)
assert (a.width, b.width) == (3, 1)
assert Rectangle(2, 3).area() == 6 and Rectangle(2.5, 2).area() == 5.0''',
    solution=r'''class Rectangle:
    def __init__(self, width, height):
        if width <= 0 or height <= 0:
            raise ValueError("Sides must be positive")
        self.width = width
        self.height = height

    def area(self):
        return self.width * self.height

    def perimeter(self):
        return 2 * (self.width + self.height)

    def is_square(self):
        return self.width == self.height

    def scale(self, factor):
        if factor <= 0:
            raise ValueError("Factor must be positive")
        self.width *= factor
        self.height *= factor

    def describe(self):
        print(f"Rectangle {self.width} x {self.height}: area {self.area()}, perimeter {self.perimeter()}")''',
    hints=[
        r'''Store only `width` and `height`. `area()` and `perimeter()` calculate from them every time, so they can never be out of date after `scale`.''',
        r'''Validate in `__init__` *before* storing anything, so a bad rectangle is never created. `scale` checks the factor before it changes either side.''',
        r'''`describe()` can call `self.area()` and `self.perimeter()` instead of repeating the formulas.''',
    ],
    explanation=r'''**The idea.** Methods that *ask* (`area`, `is_square`) return a value and change nothing; methods that *change* (`scale`) alter the object and usually return nothing. Keeping the two kinds apart makes a class easy to reason about.

**Validate at the door.** A `Rectangle(-3, 4)` that existed would poison every later calculation. Refusing it in `__init__` means every rectangle you ever hold is valid.

**Reuse inside the class.** `describe` calls `area()`; if the formula changes, only one place needs to.''',
),
P(
    slug='oop-employee-payroll', title='Employees and Payroll', topic='oop-and-classes', difficulty='beginner', module=MODULE,
    description='Inheritance plus overriding: three kinds of employee are paid differently, and one payroll function works for all of them.',
    statement=r'''Create a class `Employee` with `Employee(name, base_salary)`.

- Attributes `name` and `base_salary`.
- `calculate_pay()` returns the base salary.
- `show()` prints `<name> earns <pay>` where `<pay>` is what `calculate_pay()` returns **for that kind of employee** (write `show` once, in `Employee`).

Create two subclasses that override `calculate_pay()`:

- `Manager(name, base_salary)` has a `team` (an empty list at first) and `add_member(employee)` which appends to it. Pay is the base salary plus **1000 for every team member**.
- `Developer(name, base_salary, overtime_hours=0)` has `overtime_hours`. Pay is the base salary plus **200 for every overtime hour**.

Finally write a plain function `total_payroll(employees)` that returns the sum of every employee's pay. It must **not** check which kind of employee each one is.''',
    starter=r'''class Employee:
    def __init__(self, name, base_salary):
        ...

    def calculate_pay(self):
        ...

    def show(self):
        ...


class Manager(Employee):
    ...


class Developer(Employee):
    ...


def total_payroll(employees):
    ...''',
    tests=OUT + r'''clerk = Employee("Asha", 30000)
assert (clerk.name, clerk.base_salary, clerk.calculate_pay()) == ("Asha", 30000, 30000)
assert out(clerk.show) == ["Asha earns 30000"]
boss = Manager("Ben", 50000)
assert boss.team == [] and boss.calculate_pay() == 50000 and isinstance(boss, Employee)
dev = Developer("Cy", 40000, 10)
other_dev = Developer("Dee", 45000)
assert (dev.overtime_hours, other_dev.overtime_hours) == (10, 0) and dev.calculate_pay() == 42000 and other_dev.calculate_pay() == 45000 and isinstance(dev, Employee)
assert boss.add_member(dev) is None and boss.add_member(other_dev) is None and boss.team == [dev, other_dev]
assert boss.calculate_pay() == 52000
assert out(boss.show) == ["Ben earns 52000"] and out(dev.show) == ["Cy earns 42000"]
assert Manager("Zed", 1).team is not boss.team
assert total_payroll([clerk, boss, dev, other_dev]) == 30000 + 52000 + 42000 + 45000
assert total_payroll([]) == 0
class Intern(Employee):
    def calculate_pay(self):
        return 5000
assert total_payroll([Intern("Kim", 1), clerk]) == 35000 and out(Intern("Kim", 1).show) == ["Kim earns 5000"]
dev.overtime_hours = 20
assert dev.calculate_pay() == 44000''',
    solution=r'''class Employee:
    def __init__(self, name, base_salary):
        self.name = name
        self.base_salary = base_salary

    def calculate_pay(self):
        return self.base_salary

    def show(self):
        print(f"{self.name} earns {self.calculate_pay()}")


class Manager(Employee):
    def __init__(self, name, base_salary):
        super().__init__(name, base_salary)
        self.team = []

    def add_member(self, employee):
        self.team.append(employee)

    def calculate_pay(self):
        return self.base_salary + 1000 * len(self.team)


class Developer(Employee):
    def __init__(self, name, base_salary, overtime_hours=0):
        super().__init__(name, base_salary)
        self.overtime_hours = overtime_hours

    def calculate_pay(self):
        return self.base_salary + 200 * self.overtime_hours


def total_payroll(employees):
    return sum(employee.calculate_pay() for employee in employees)''',
    hints=[
        r'''Each subclass overrides **one** method, `calculate_pay`. `show` is written once in `Employee` and calls `self.calculate_pay()`: `self` is the real object, so Python picks the right version.''',
        r'''Give `Manager` its own list in `__init__` (`self.team = []`). A list written at class level would be shared by every manager.''',
        r'''`total_payroll` just loops and calls `employee.calculate_pay()`. No `isinstance`, no `if`: that is the whole point of polymorphism, and the tests add a new `Intern` class that your function has never heard of.''',
    ],
    explanation=r'''**Runtime polymorphism in one example.** `total_payroll` is written once and works for every kind of employee, including ones that do not exist yet. Which `calculate_pay` runs is decided **when the program runs**, by the real class of each object. That is *dynamic dispatch*.

**The same for `show`.** It sits in the parent but calls `self.calculate_pay()`, so a `Manager` prints a manager's pay. Code in a base class can call methods that only the children define.

**What to avoid.** `if type(e) is Manager: ... elif ...` inside `total_payroll` would break every time a new kind is added. Let the objects decide.

**Going further.** What if every employee needs a tax? Where would you add `tax()` so that all subclasses get it for free, and one can still change it?''',
),
P(
    slug='oop-animal-sounds', title='Animal Sounds', topic='oop-and-classes', difficulty='beginner', module=MODULE,
    description='Runtime polymorphism: one loop makes every animal speak in its own way, including animals added later.',
    statement=r'''Create a class `Animal` with `Animal(name)`.

- `speak()` prints `<name> makes a sound`.

Create subclasses that **override** `speak()`:

- `Dog` prints `<name> says Woof`
- `Cat` prints `<name> says Meow`
- `Cow` prints `<name> says Moo`

Write a function `make_all_speak(animals)` that calls `speak()` on every animal in the list, in order. It must not check which kind of animal each one is.

**Example**

```
make_all_speak([Dog("Rex"), Cat("Tom"), Animal("Thing")])
# Rex says Woof
# Tom says Meow
# Thing makes a sound
```''',
    starter=r'''class Animal:
    def __init__(self, name):
        ...

    def speak(self):
        ...


class Dog(Animal):
    ...


def make_all_speak(animals):
    ...''',
    tests=OUT + r'''assert out(Animal("Thing").speak) == ["Thing makes a sound"]
assert out(Dog("Rex").speak) == ["Rex says Woof"] and out(Cat("Tom").speak) == ["Tom says Meow"] and out(Cow("Bella").speak) == ["Bella says Moo"]
assert issubclass(Dog, Animal) and issubclass(Cat, Animal) and issubclass(Cow, Animal) and Dog("Rex").name == "Rex"
herd = [Dog("Rex"), Cat("Tom"), Cow("Bella"), Animal("Thing")]
assert out(make_all_speak, herd) == ["Rex says Woof", "Tom says Meow", "Bella says Moo", "Thing makes a sound"]
assert out(make_all_speak, []) == []
class Duck(Animal):
    def speak(self):
        print(self.name + " says Quack")
assert out(make_all_speak, [Duck("Don"), Dog("Rex")]) == ["Don says Quack", "Rex says Woof"]
class Silent(Animal):
    pass
assert out(make_all_speak, [Silent("Fish")]) == ["Fish makes a sound"]
assert out(make_all_speak, [Cat("A"), Cat("B")]) == ["A says Meow", "B says Meow"]''',
    solution=r'''class Animal:
    def __init__(self, name):
        self.name = name

    def speak(self):
        print(f"{self.name} makes a sound")


class Dog(Animal):
    def speak(self):
        print(f"{self.name} says Woof")


class Cat(Animal):
    def speak(self):
        print(f"{self.name} says Meow")


class Cow(Animal):
    def speak(self):
        print(f"{self.name} says Moo")


def make_all_speak(animals):
    for animal in animals:
        animal.speak()''',
    hints=[
        r'''Only `Animal` needs an `__init__`; the children inherit it. They only override `speak`.''',
        r'''`make_all_speak` is a three-line loop: `for animal in animals: animal.speak()`. There is no `if isinstance(...)` anywhere.''',
        r'''A subclass that does not override `speak` (the tests define one called `Silent`) simply falls back to the parent's version.''',
    ],
    explanation=r'''**Polymorphism** means "many forms": the *same call* (`animal.speak()`) does *different things* depending on the object. The caller only needs to know that every animal can `speak`.

**It runs at run time.** Python decides which `speak` to run when the line executes, by looking at the object's class (and then its parents). This is called *dynamic dispatch* or *late binding*.

**Why it matters.** `make_all_speak` never changes when you add a `Duck`. Without polymorphism you would have a growing `if/elif` chain that has to be edited every time. That is the *open/closed* idea: open for new animals, closed for edits.

**Duck typing.** Python does not even require `Duck` to inherit from `Animal`: any object with a `speak()` method works. Inheritance is one way to get polymorphism, not the only one.''',
),
P(
    slug='oop-vehicle-super', title='Vehicle, Car and Bike', topic='oop-and-classes', difficulty='beginner', module=MODULE,
    description='Use super() to extend a parent constructor and a parent method instead of copying them.',
    statement=r'''Create a class `Vehicle` with `Vehicle(brand, wheels)`.

- `info()` prints `<brand> with <wheels> wheels`.

Create `Car(brand, doors)`, a `Vehicle` that always has **4** wheels and also stores `doors`.

- `info()` first prints the parent's line (call the parent's `info`) and then prints `Doors: <doors>`.

Create `Bike(brand, has_carrier=False)`, a `Vehicle` with **2** wheels that stores `has_carrier`.

- `info()` prints the parent's line and then `Carrier: yes` or `Carrier: no`.

Use `super()` in both the constructor and `info()`: do not copy the parent's lines.''',
    starter=r'''class Vehicle:
    def __init__(self, brand, wheels):
        ...

    def info(self):
        ...


class Car(Vehicle):
    ...


class Bike(Vehicle):
    ...''',
    tests=OUT + r'''v = Vehicle("Truck", 6)
assert (v.brand, v.wheels) == ("Truck", 6) and out(v.info) == ["Truck with 6 wheels"]
car = Car("Honda", 4)
assert (car.brand, car.wheels, car.doors) == ("Honda", 4, 4) and isinstance(car, Vehicle)
assert out(car.info) == ["Honda with 4 wheels", "Doors: 4"]
assert Car("Mini", 2).doors == 2 and out(Car("Mini", 2).info) == ["Mini with 4 wheels", "Doors: 2"]
bike = Bike("Hero")
assert (bike.brand, bike.wheels, bike.has_carrier) == ("Hero", 2, False) and isinstance(bike, Vehicle)
assert out(bike.info) == ["Hero with 2 wheels", "Carrier: no"]
assert out(Bike("Bajaj", True).info) == ["Bajaj with 2 wheels", "Carrier: yes"] and Bike("Bajaj", has_carrier=True).has_carrier is True
class Hybrid(Car):
    def info(self):
        super().info()
        print("Hybrid")
assert out(Hybrid("Toyota", 4).info) == ["Toyota with 4 wheels", "Doors: 4", "Hybrid"]
original = Vehicle.info
Vehicle.info = lambda self: print("changed " + self.brand)
assert out(Car("Ford", 2).info) == ["changed Ford", "Doors: 2"] and out(Bike("Hero").info) == ["changed Hero", "Carrier: no"]
Vehicle.info = original''',
    solution=r'''class Vehicle:
    def __init__(self, brand, wheels):
        self.brand = brand
        self.wheels = wheels

    def info(self):
        print(f"{self.brand} with {self.wheels} wheels")


class Car(Vehicle):
    def __init__(self, brand, doors):
        super().__init__(brand, 4)
        self.doors = doors

    def info(self):
        super().info()
        print(f"Doors: {self.doors}")


class Bike(Vehicle):
    def __init__(self, brand, has_carrier=False):
        super().__init__(brand, 2)
        self.has_carrier = has_carrier

    def info(self):
        super().info()
        print("Carrier: " + ("yes" if self.has_carrier else "no"))''',
    hints=[
        r'''`Car.__init__` takes only `brand` and `doors`: it supplies the number of wheels itself when it calls `super().__init__(brand, 4)`.''',
        r'''To *extend* a method rather than replace it, call `super().info()` first and then print the extra line. The last test even changes `Vehicle.info` to check that you really call the parent.''',
        r'''Do not copy the `"<brand> with <wheels> wheels"` text into the children: that is the copy `super()` exists to avoid.''',
    ],
    explanation=r'''**`super()` is how a child cooperates with its parent.** Overriding *replaces* a method; calling `super().info()` inside the override *extends* it: do the parent's work, then add your own.

**Why not copy the line?** If `Vehicle.info` later prints the brand in capitals, a copied line in `Car` would silently stay old. Calling the parent keeps one source of truth. The test changes `Vehicle.info` on purpose to prove you call it.

**Fixed values in the child.** A `Car` always has 4 wheels, so its constructor does not ask for them. Children can *narrow* what the parent asks for.''',
),
P(
    slug='oop-multilevel-inheritance', title='Multilevel Inheritance', topic='oop-and-classes', difficulty='beginner', module=MODULE,
    description='A chain Animal, Mammal, Dog: each level adds behaviour, and the bottom class has all of it.',
    statement=r'''Build three classes in a **chain** (multilevel inheritance).

- `Animal(name)`: `eat()` prints `<name> eats`. `lineage()` returns the list of the class names of the object's own class and all its parents, **nearest first, leaving out `object`**, for example `["Dog", "Mammal", "Animal"]`.
- `Mammal(Animal)`: `feed_milk()` prints `<name> feeds milk`.
- `Dog(Mammal)`: `bark()` prints `<name> barks`.

A `Dog` must be able to use all three methods without defining `eat` or `feed_milk` itself. A plain `Animal` has only `eat` and `lineage`.''',
    starter=r'''class Animal:
    def __init__(self, name):
        ...


class Mammal(Animal):
    ...


class Dog(Mammal):
    ...''',
    tests=OUT + r'''rex = Dog("Rex")
cow = Mammal("Bella")
fish = Animal("Nemo")
assert rex.name == "Rex" and out(rex.eat) == ["Rex eats"] and out(rex.feed_milk) == ["Rex feeds milk"] and out(rex.bark) == ["Rex barks"]
assert out(cow.eat) == ["Bella eats"] and out(cow.feed_milk) == ["Bella feeds milk"] and not hasattr(cow, "bark")
assert out(fish.eat) == ["Nemo eats"] and not hasattr(fish, "feed_milk") and not hasattr(fish, "bark")
assert issubclass(Dog, Mammal) and issubclass(Dog, Animal) and issubclass(Mammal, Animal) and not issubclass(Animal, Mammal)
assert rex.lineage() == ["Dog", "Mammal", "Animal"] and cow.lineage() == ["Mammal", "Animal"] and fish.lineage() == ["Animal"]
assert "eat" not in Dog.__dict__ and "feed_milk" not in Dog.__dict__ and "eat" not in Mammal.__dict__
class Puppy(Dog):
    pass
assert Puppy("Bit").lineage() == ["Puppy", "Dog", "Mammal", "Animal"] and out(Puppy("Bit").feed_milk) == ["Bit feeds milk"]
assert isinstance(rex, Animal) and isinstance(rex, Mammal) and isinstance(rex, Dog) and not isinstance(fish, Dog)''',
    solution=r'''class Animal:
    def __init__(self, name):
        self.name = name

    def eat(self):
        print(f"{self.name} eats")

    def lineage(self):
        return [cls.__name__ for cls in type(self).__mro__ if cls is not object]


class Mammal(Animal):
    def feed_milk(self):
        print(f"{self.name} feeds milk")


class Dog(Mammal):
    def bark(self):
        print(f"{self.name} barks")''',
    hints=[
        r'''Only `Animal` needs `__init__`. `Mammal` and `Dog` inherit it, so `Dog("Rex")` works without any constructor of its own.''',
        r'''`type(self)` is the real class of the object. Every class has `__mro__`, the tuple of the class and its parents in the order Python searches them.''',
        r'''Filter out `object` (the invisible parent of every class) so the list matches the statement.''',
    ],
    explanation=r'''**Multilevel inheritance** is a chain: grandparent, parent, child. Each level adds one thing, and the child gets all of it. Look at the tests: `Dog` does not define `eat` or `feed_milk`, yet `rex.eat()` works, because Python walks *up* the chain until it finds the method.

```mermaid
classDiagram
    Animal <|-- Mammal
    Mammal <|-- Dog
    class Animal {
        +eat()
    }
    class Mammal {
        +feed_milk()
    }
    class Dog {
        +bark()
    }
```

**The method resolution order.** `Dog.__mro__` is `(Dog, Mammal, Animal, object)`. That is exactly the order Python searches, and what `lineage()` prints.

**Caution.** Deep chains are hard to read (the "fragile base class" problem): a change high up ripples down. Prefer shallow hierarchies and composition when you can.''',
),
P(
    slug='oop-abstract-payment', title='Abstract Payment Methods', topic='oop-and-classes', difficulty='intermediate', module=MODULE,
    description='An abstract base class with an abstract method: it cannot be created, and every child must supply pay().',
    statement=r'''Use Python's `abc` module (`ABC`, `abstractmethod`).

Create an **abstract class** `Payment`.

- It has an **abstract method** `pay(amount)`.
- It has a normal (concrete) method `describe()` that returns the **class name** of the object, for example `"UPI"`.
- Trying to create a `Payment` directly raises `TypeError`, and so does creating a subclass that has not implemented `pay`.

Create these concrete payment classes:

- `CreditCard(number)`: `pay(amount)` prints `Paid <amount> by credit card ending <last 4 digits of number>`
- `UPI(upi_id)`: `pay(amount)` prints `Paid <amount> using UPI <upi_id>`
- `Wallet(balance)`: if `amount` is more than the balance it prints `Insufficient wallet balance` and changes nothing; otherwise it reduces `balance` and prints `Paid <amount> from wallet. Balance left: <balance>`

Write `checkout(payment, amount)` that calls `payment.pay(amount)`. It works for every kind of payment.''',
    starter=r'''from abc import ABC, abstractmethod


class Payment:
    ...


class CreditCard(Payment):
    ...


def checkout(payment, amount):
    ...''',
    tests=OUT + r'''assert error_of(Payment) is not None and error_of(Payment).startswith("TypeError")
class Half(Payment):
    pass
assert error_of(Half).startswith("TypeError")
card = CreditCard("1234567812345678")
upi = UPI("asha@bank")
wallet = Wallet(500)
assert isinstance(card, Payment) and isinstance(upi, Payment) and isinstance(wallet, Payment)
assert out(card.pay, 250) == ["Paid 250 by credit card ending 5678"] and out(upi.pay, 99) == ["Paid 99 using UPI asha@bank"]
assert out(wallet.pay, 200) == ["Paid 200 from wallet. Balance left: 300"] and wallet.balance == 300
assert out(wallet.pay, 301) == ["Insufficient wallet balance"] and wallet.balance == 300
assert out(wallet.pay, 300) == ["Paid 300 from wallet. Balance left: 0"] and wallet.balance == 0
assert (card.describe(), upi.describe(), wallet.describe()) == ("CreditCard", "UPI", "Wallet")
assert out(checkout, card, 10) == ["Paid 10 by credit card ending 5678"] and out(checkout, upi, 5) == ["Paid 5 using UPI asha@bank"]
class Cash(Payment):
    def pay(self, amount):
        print("Cash " + str(amount))
assert out(checkout, Cash(), 7) == ["Cash 7"] and Cash().describe() == "Cash"
assert getattr(Payment.pay, "__isabstractmethod__", False) is True''',
    solution=r'''from abc import ABC, abstractmethod


class Payment(ABC):
    @abstractmethod
    def pay(self, amount):
        """Every payment method must say how it pays."""

    def describe(self):
        return type(self).__name__


class CreditCard(Payment):
    def __init__(self, number):
        self.number = number

    def pay(self, amount):
        print(f"Paid {amount} by credit card ending {self.number[-4:]}")


class UPI(Payment):
    def __init__(self, upi_id):
        self.upi_id = upi_id

    def pay(self, amount):
        print(f"Paid {amount} using UPI {self.upi_id}")


class Wallet(Payment):
    def __init__(self, balance):
        self.balance = balance

    def pay(self, amount):
        if amount > self.balance:
            print("Insufficient wallet balance")
            return
        self.balance -= amount
        print(f"Paid {amount} from wallet. Balance left: {self.balance}")


def checkout(payment, amount):
    payment.pay(amount)''',
    hints=[
        r'''Write `class Payment(ABC):` and put `@abstractmethod` above `def pay(self, amount):`. The body can be just a docstring: it is never meant to run.''',
        r'''`describe()` is a normal method written once in `Payment`; `type(self).__name__` gives the name of the real class, so every child gets the right answer for free.''',
        r'''Python refuses to create an object whose class still has an unimplemented abstract method, and the error is a `TypeError`. You do not write that check yourself.''',
    ],
    explanation=r'''**Abstract class versus abstract method.** An *abstract method* is a promise with no body: "every payment can `pay`, but only a concrete one knows how". An *abstract class* is a class that has at least one abstract method (or is marked that way), so it **cannot be instantiated**. The abstract class can still contain normal methods such as `describe()`.

| | Abstract method | Abstract class |
|---|---|---|
| What it is | a method declared without a body | a class you cannot create objects from |
| Who fills it in | each concrete subclass | it is extended, never created |
| Enforced by | `@abstractmethod` + `ABC` | the same: `TypeError` on creation |

**Why bother?** It turns a forgotten method into an error at once (`TypeError: Can't instantiate abstract class`), instead of a crash deep inside a program. And `checkout` can rely on "everything I am given can `pay`".

**Plain Python alternative.** Many programmers just write `raise NotImplementedError` in the base method. It works, but the error appears only when `pay` is *called*, not when the object is created.''',
),
P(
    slug='oop-abstract-report', title='Abstract Class With Shared Code', topic='oop-and-classes', difficulty='intermediate', module=MODULE,
    description='An abstract class that mixes finished code (render) with holes the children must fill (title, body).',
    statement=r'''Create an abstract class `Report` (use `ABC` and `abstractmethod`).

- Abstract methods: `title()` and `body()`, each returns a string.
- A concrete method `render()` returns the finished text: the line `=== <title> ===`, then a new line, then the body. For example `"=== Sales ===\nTotal: 500"`.
- A concrete method `print_report()` prints `render()`.
- `Report` itself cannot be created (`TypeError`).

Create two concrete reports:

- `SalesReport(total)`: title `Sales`, body `Total: <total>`
- `AttendanceReport(present, total)`: title `Attendance`, body `Present: <present>/<total> (<percent>%)` where `percent` is `present * 100 / total` rounded to **1 decimal place** (`0.0` when `total` is 0).

`render` and `print_report` are written **once**, in `Report`.''',
    starter=r'''from abc import ABC, abstractmethod


class Report:
    ...


class SalesReport(Report):
    ...''',
    tests=OUT + r'''assert error_of(Report).startswith("TypeError")
class OnlyTitle(Report):
    def title(self):
        return "T"
assert error_of(OnlyTitle).startswith("TypeError")
sales = SalesReport(500)
assert sales.title() == "Sales" and sales.body() == "Total: 500" and sales.render() == "=== Sales ===\nTotal: 500"
att = AttendanceReport(45, 60)
assert att.title() == "Attendance" and att.body() == "Present: 45/60 (75.0%)" and att.render() == "=== Attendance ===\nPresent: 45/60 (75.0%)"
assert AttendanceReport(1, 3).body() == "Present: 1/3 (33.3%)" and AttendanceReport(0, 0).body() == "Present: 0/0 (0.0%)"
assert out(sales.print_report) == ["=== Sales ===", "Total: 500"] and out(att.print_report) == ["=== Attendance ===", "Present: 45/60 (75.0%)"]
assert "render" not in SalesReport.__dict__ and "render" not in AttendanceReport.__dict__ and "print_report" not in SalesReport.__dict__
assert isinstance(sales, Report) and isinstance(att, Report)
class Custom(Report):
    def title(self):
        return "Mine"
    def body(self):
        return "line one\nline two"
c = Custom()
assert c.render() == "=== Mine ===\nline one\nline two" and out(c.print_report) == ["=== Mine ===", "line one", "line two"]
assert getattr(Report.title, "__isabstractmethod__", False) and getattr(Report.body, "__isabstractmethod__", False) and not getattr(Report.render, "__isabstractmethod__", False)''',
    solution=r'''from abc import ABC, abstractmethod


class Report(ABC):
    @abstractmethod
    def title(self):
        """The heading of the report."""

    @abstractmethod
    def body(self):
        """The text under the heading."""

    def render(self):
        return f"=== {self.title()} ===\n{self.body()}"

    def print_report(self):
        print(self.render())


class SalesReport(Report):
    def __init__(self, total):
        self.total = total

    def title(self):
        return "Sales"

    def body(self):
        return f"Total: {self.total}"


class AttendanceReport(Report):
    def __init__(self, present, total):
        self.present = present
        self.total = total

    def title(self):
        return "Attendance"

    def body(self):
        percent = round(self.present * 100 / self.total, 1) if self.total else 0.0
        return f"Present: {self.present}/{self.total} ({percent}%)"''',
    hints=[
        r'''Mark `title` and `body` with `@abstractmethod`; leave `render` and `print_report` as ordinary methods.''',
        r'''`render` calls `self.title()` and `self.body()`. In the base class they have no real code, but at run time `self` is a `SalesReport` or an `AttendanceReport`, so their versions run.''',
        r'''For the percentage use `round(x, 1)`; guard against `total == 0` before dividing.''',
    ],
    explanation=r'''**An abstract class is not "empty".** `Report` holds finished code (`render`, `print_report`) *and* two blanks (`title`, `body`) that each child must fill in. The common layout is written once; only what differs is left to the children. This shape is called the **template method** pattern.

```mermaid
flowchart LR
    A[render in Report] --> B[title in the child]
    A --> C[body in the child]
```

**Abstract method versus abstract class, again.** The *methods* are the blanks; the *class* is abstract because it has blanks, so you cannot make a `Report()` that would print half a report. Python enforces both.

**Extending it.** A new report only writes `title` and `body` and gets `render` and `print_report` for free: the test defines `Custom` to prove it.''',
),
P(
    slug='oop-overloading-in-python', title='Overloading in Python', topic='oop-and-classes', difficulty='intermediate', module=MODULE,
    description='Python has no compile-time overloading: write one method that behaves differently for different arguments (default values, *args, type checks).',
    statement=r'''Java and C# let you write several methods with the same name and different parameters (*method overloading*, "compile-time polymorphism"). In Python a second `def` with the same name simply **replaces** the first, so one method has to handle every case itself.

Write a class `Greeter` with:

- `greet(name=None, title=None)` **returns** a string:
  - `greet()` gives `"Hello!"`
  - `greet("Ravi")` gives `"Hello, Ravi!"`
  - `greet("Ravi", "Dr.")` gives `"Hello, Dr. Ravi!"`
  - a `title` without a `name` is `ValueError("A title needs a name")`

Write a class `Calculator` with:

- `add(*numbers)` returns the sum of **any number** of arguments (`0` for none).
- `describe(value)` returns, depending on the **type** of `value` (check in this order): a `bool` gives `"Boolean <value>"`; an `int` gives `"Integer <value>"`; a `float` gives `"Decimal <value>"`; a `str` gives `"Text '<value>'"`; a `list` or `tuple` gives `"Collection of <n> items"`; anything else gives `"Something else"`.''',
    starter=r'''class Greeter:
    def greet(self, name=None, title=None):
        ...


class Calculator:
    def add(self, *numbers):
        ...

    def describe(self, value):
        ...''',
    tests=OUT + r'''g = Greeter()
assert g.greet() == "Hello!" and g.greet("Ravi") == "Hello, Ravi!" and g.greet("Ravi", "Dr.") == "Hello, Dr. Ravi!"
assert g.greet(name="Asha") == "Hello, Asha!" and g.greet(title="Prof.", name="Kim") == "Hello, Prof. Kim!"
assert error_of(g.greet, None, "Dr.") == "ValueError: A title needs a name" and error_of(g.greet, title="Dr.") == "ValueError: A title needs a name"
c = Calculator()
assert c.add() == 0 and c.add(5) == 5 and c.add(1, 2) == 3 and c.add(1, 2, 3, 4, 5) == 15 and c.add(1.5, 2.5) == 4.0
assert c.add(*range(101)) == 5050
assert c.describe(True) == "Boolean True" and c.describe(False) == "Boolean False"
assert c.describe(5) == "Integer 5" and c.describe(0) == "Integer 0" and c.describe(2.5) == "Decimal 2.5"
assert c.describe("hi") == "Text 'hi'" and c.describe("") == "Text ''"
assert c.describe([1, 2, 3]) == "Collection of 3 items" and c.describe((1,)) == "Collection of 1 items" and c.describe([]) == "Collection of 0 items"
assert c.describe(None) == "Something else" and c.describe({"a": 1}) == "Something else" and c.describe({1}) == "Something else"''',
    solution=r'''class Greeter:
    def greet(self, name=None, title=None):
        if name is None:
            if title is not None:
                raise ValueError("A title needs a name")
            return "Hello!"
        if title is None:
            return f"Hello, {name}!"
        return f"Hello, {title} {name}!"


class Calculator:
    def add(self, *numbers):
        return sum(numbers)

    def describe(self, value):
        if isinstance(value, bool):
            return f"Boolean {value}"
        if isinstance(value, int):
            return f"Integer {value}"
        if isinstance(value, float):
            return f"Decimal {value}"
        if isinstance(value, str):
            return f"Text '{value}'"
        if isinstance(value, (list, tuple)):
            return f"Collection of {len(value)} items"
        return "Something else"''',
    hints=[
        r'''A default value of `None` for a parameter means "the caller did not give it". Check for `None` to see which form of the call you were given.''',
        r'''`*numbers` collects every extra positional argument into a tuple, so `add` accepts any count. `sum(numbers)` works on it, including the empty tuple.''',
        r'''Order matters in the type checks: `True` is also an `int` in Python, so test for `bool` **before** `int`.''',
    ],
    explanation=r'''**Compile-time (static) polymorphism** is *method overloading*: the same name, different parameter lists, and the **compiler** picks the version while compiling, from the argument types. Java, C# and C++ have it.

**Python does not.** A class body is just a list of assignments, so a second `def greet` replaces the first. What Python gives you instead:

- **Default arguments** (`name=None`): one method, several call shapes.
- **`*args` / `**kwargs`**: any number of arguments.
- **Type checks** (`isinstance`) or `functools.singledispatch`: choose by the type of an argument at run time.
- **Duck typing**: just call the method and let the object decide.

**Which kind is it then?** All of these decisions happen when the program *runs*, so in Python even "overloading" is really run-time behaviour. That is a classic interview question: say so.

| | Compile-time (overloading) | Run-time (overriding) |
|---|---|---|
| Same name | in **one** class, different parameters | in **parent and child**, same parameters |
| Chosen | by the compiler, from the declared types | by the real class of the object |
| In Python | emulated (defaults, `*args`, `isinstance`) | built in |''',
),
]
