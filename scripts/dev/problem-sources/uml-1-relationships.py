UMLHELP = r'''import re
_OPS = {
    "<|--": ("inheritance", True), "--|>": ("inheritance", False),
    "<|..": ("realization", True), "..|>": ("realization", False),
    "*--": ("composition", False), "--*": ("composition", True),
    "o--": ("aggregation", False), "--o": ("aggregation", True),
    "-->": ("association", False), "<--": ("association", True),
    "..>": ("dependency", False), "<..": ("dependency", True),
    "--": ("link", False),
}
_REL = re.compile(r'^\s*(\w+)\s*(?:"([^"]*)"\s*)?(<\|--|--\|>|<\|\.\.|\.\.\|>|\*--|--\*|o--|--o|-->|<--|\.\.>|<\.\.|--)\s*(?:"([^"]*)"\s*)?(\w+)\s*(?::.*)?$')
def parse_uml(text):
    """(classes, relations): relations are (a, kind, b, multiplicity of a, multiplicity of b); a is the child / whole / source / user."""
    classes, relations = set(), []
    for line in text.splitlines():
        found = re.match(r'\s*class\s+(\w+)', line)
        if found:
            classes.add(found.group(1))
        match = _REL.match(line)
        if match:
            left, left_mult, op, right_mult, right = match.groups()
            kind, flipped = _OPS[op]
            if flipped:
                relations.append((right, kind, left, right_mult or "", left_mult or ""))
            else:
                relations.append((left, kind, right, left_mult or "", right_mult or ""))
            classes.update([left, right])
    return classes, relations
def kinds_between(relations, one, two):
    return {kind for a, kind, b, _, _ in relations if {a, b} == {one, two}}
def has(relations, a, kind, b):
    return any(x == a and k == kind and y == b for x, k, y, _, _ in relations)
def first_line_ok(text):
    return text.strip().splitlines()[0].strip() == "classDiagram"
def error_of(action, *args, **kwargs):
    try:
        action(*args, **kwargs)
    except Exception as error:
        return type(error).__name__ + ": " + str(error)
    return None
'''
MODULE = 'lld/02-oop-foundations-and-uml/README.md'
HOW = r'''

**How you are marked.** Write the diagram as **Mermaid** `classDiagram` text in the string `UML` (the first line must be `classDiagram`). The tests read your relationship lines (`A *-- B`, `A o-- B`, `A --> B`, `A ..> B`, `A <|-- B`, `A <|.. B`, with or without labels and multiplicities, in either direction) and also run your code.'''

PROBLEMS = [
P(
    slug='uml-class-and-objects', title='UML: One Class, Two Objects', topic='oop-uml-and-relationships', difficulty='beginner', module=MODULE,
    description='Draw a class box (attributes and methods) in Mermaid, write the class, and create two separate objects from it.',
    statement=r'''A **class** is the blueprint (one box in a class diagram); an **object** is one thing built from it. Draw one class, write it, then make two objects.

**1. The diagram.** In the string `UML` write a `classDiagram` with one class `Book` whose box lists the attributes `title`, `author`, `pages` and the methods `summary()` and `is_long()` (for example `+String title`, `+summary() String`).

**2. The class.** `Book(title, author, pages)` stores the three attributes.

- `summary()` returns `"<title> by <author> (<pages> pages)"`.
- `is_long()` returns `True` when `pages` is more than 300.

**3. Two objects.** Create `book1 = Book("Dune", "Herbert", 612)` and `book2 = Book("Emma", "Austen", 280)`.''' + HOW,
    starter=r'''UML = """classDiagram
    class Book {
    }
"""


class Book:
    ...


# create the two objects here''',
    tests=UMLHELP + r'''classes, relations = parse_uml(UML)
assert first_line_ok(UML) and "Book" in classes and relations == []
assert all(word in UML for word in ("title", "author", "pages", "summary", "is_long"))
assert isinstance(book1, Book) and isinstance(book2, Book) and book1 is not book2 and type(book1) is Book
assert (book1.title, book1.author, book1.pages) == ("Dune", "Herbert", 612) and (book2.title, book2.author, book2.pages) == ("Emma", "Austen", 280)
assert book1.summary() == "Dune by Herbert (612 pages)" and book2.summary() == "Emma by Austen (280 pages)"
assert book1.is_long() is True and book2.is_long() is False and Book("X", "Y", 300).is_long() is False and Book("X", "Y", 301).is_long() is True
book1.pages = 10
assert book2.pages == 280 and book1.is_long() is False
third = Book("Ulysses", "Joyce", 730)
assert third.summary() == "Ulysses by Joyce (730 pages)" and third is not book1''',
    solution=r'''UML = """classDiagram
    class Book {
        +String title
        +String author
        +int pages
        +summary() String
        +is_long() bool
    }
"""


class Book:
    def __init__(self, title, author, pages):
        self.title = title
        self.author = author
        self.pages = pages

    def summary(self):
        return f"{self.title} by {self.author} ({self.pages} pages)"

    def is_long(self):
        return self.pages > 300


book1 = Book("Dune", "Herbert", 612)
book2 = Book("Emma", "Austen", 280)''',
    hints=[
        r'''A Mermaid class box is `class Book { +String title +summary() String }`: one member per line, `+` means public, methods end with `()` and a return type.''',
        r'''Each `Book(...)` call builds a *new* object with its own attribute values. Changing `book1.pages` must not change `book2`.''',
        r'''The string `UML` is ordinary text in your code: use a triple-quoted string so it can span several lines.''',
    ],
    explanation=r'''**Class versus object.** The class `Book` is drawn *once* (a box with three attributes and two methods). The objects `book1` and `book2` are two separate things built from that blueprint, each holding its own values.

```mermaid
classDiagram
    class Book {
        +String title
        +String author
        +int pages
        +summary() String
        +is_long() bool
    }
```

**Reading the box.** Top: the name. Middle: attributes (what each object *knows*). Bottom: methods (what each object *does*). `+` public, `-` private.

**No arrows yet.** With a single class there are no relationships. The next problems add the arrows: association, aggregation, composition, dependency and inheritance.''',
),
P(
    slug='uml-association-students-courses', title='UML: Association', topic='oop-uml-and-relationships', difficulty='beginner', module=MODULE,
    description='Association: two classes that know each other and live independently (students and courses), drawn and coded.',
    statement=r'''An **association** is the plain "knows about / uses" relationship: both sides exist on their own and neither owns the other. Students take courses; a course exists without any student and a student exists without any course.

**1. The diagram.** Draw `Student` and `Course` joined by an **association** (`-->` or `--`), with the multiplicity `"*"` at **both** ends (many students take many courses). No aggregation or composition between them.

**2. The code.**

- `Course(name)` has `name` and `students` (a **new list** each time it is read, in enrolment order).
- `Student(name)` has `name` and `courses` (a new list, in enrolment order).
- `student.enroll(course)` links both sides (the student appears in `course.students`, the course in `student.courses`). Enrolling in a course the student already has is `ValueError("Already enrolled")`.
- `student.drop(course)` removes the link on both sides; a course the student does not have is `ValueError("Not enrolled")`.

Dropping a course or a student never destroys the other object.''' + HOW,
    starter=r'''UML = """classDiagram
"""


class Course:
    ...


class Student:
    ...''',
    tests=UMLHELP + r'''classes, relations = parse_uml(UML)
assert first_line_ok(UML) and {"Student", "Course"} <= classes
assert kinds_between(relations, "Student", "Course") <= {"association", "link"} and kinds_between(relations, "Student", "Course") != set()
assert any({a, b} == {"Student", "Course"} and ma == "*" and mb == "*" for a, k, b, ma, mb in relations)
math, physics = Course("Maths"), Course("Physics")
asha, ben = Student("Asha"), Student("Ben")
assert math.name == "Maths" and asha.name == "Asha" and asha.courses == [] and math.students == []
assert asha.enroll(math) is None and asha.enroll(physics) is None and ben.enroll(math) is None
assert asha.courses == [math, physics] and math.students == [asha, ben] and physics.students == [asha] and ben.courses == [math]
assert error_of(asha.enroll, math) == "ValueError: Already enrolled" and asha.courses == [math, physics]
assert asha.drop(math) is None and asha.courses == [physics] and math.students == [ben]
assert error_of(asha.drop, math) == "ValueError: Not enrolled" and error_of(ben.drop, physics) == "ValueError: Not enrolled"
assert physics.students == [asha] and math.students == [ben]
copy = math.students
copy.append("junk")
assert math.students == [ben]
courses = asha.courses
courses.append("junk")
assert asha.courses == [physics]
ben.drop(math)
assert math.students == [] and math.name == "Maths" and ben.courses == []
ben.enroll(math)
assert math.students == [ben]''',
    solution=r'''UML = """classDiagram
    class Student {
        +String name
        +enroll(course) void
        +drop(course) void
    }
    class Course {
        +String name
    }
    Student "*" --> "*" Course : takes
"""


class Course:
    def __init__(self, name):
        self.name = name
        self._students = []

    @property
    def students(self):
        return list(self._students)


class Student:
    def __init__(self, name):
        self.name = name
        self._courses = []

    @property
    def courses(self):
        return list(self._courses)

    def enroll(self, course):
        if course in self._courses:
            raise ValueError("Already enrolled")
        self._courses.append(course)
        course._students.append(self)

    def drop(self, course):
        if course not in self._courses:
            raise ValueError("Not enrolled")
        self._courses.remove(course)
        course._students.remove(self)''',
    hints=[
        r'''The line `Student "*" --> "*" Course : takes` is a many-to-many association: the quoted `"*"` are the multiplicities at each end.''',
        r'''Both objects keep a list of the other: `student._courses` and `course._students`. `enroll` and `drop` must change **both** lists so the two sides never disagree.''',
        r'''Expose the lists through properties that return `list(...)` copies so outside code cannot change the link without going through `enroll` and `drop`.''',
    ],
    explanation=r'''**Association** = "A knows B". Nobody owns anybody: a `Course` is created without any student and survives when its last student drops it.

```mermaid
classDiagram
    class Student {
        +String name
        +enroll(course) void
        +drop(course) void
    }
    class Course {
        +String name
    }
    Student "*" --> "*" Course : takes
```

**Multiplicity.** `"*"` at both ends: a student takes many courses and a course has many students. A relationship with `"*"` on both ends is *many-to-many*; in a database it needs a join table, in code each side keeps a list.

**Keep both sides in step.** A two-way association is two pointers that must always agree. Funnelling every change through `enroll`/`drop` is what keeps them in step.''',
),
P(
    slug='uml-aggregation-team-players', title='UML: Aggregation', topic='oop-uml-and-relationships', difficulty='intermediate', module=MODULE,
    description='Aggregation: a whole that groups parts which exist before it and after it (a team and its players), drawn and coded.',
    statement=r'''**Aggregation** is "has a" where the parts **outlive the whole**: players exist before a team is formed, and when the team is disbanded they are still there (and can join another team). Draw it with a hollow diamond on the whole.

**1. The diagram.** `Team` and `Player` joined by **aggregation** (`Team o-- Player`) and nothing stronger.

**2. The code.**

- `Player(name)` has `name` and `team` (`None` when free).
- `Team(name)` has `name` and `players` (a **new tuple** in the order they joined).
- `team.add(player)` adds a free player and sets `player.team`. A player already in a team (this or another) is `ValueError("Already in a team")`.
- `team.remove(player)` removes a member and frees them; a player not in this team is `ValueError("Not in this team")`.
- `team.disband()` frees **every** player and empties the team; the players stay valid and can join another team.''' + HOW,
    starter=r'''UML = """classDiagram
"""


class Player:
    ...


class Team:
    ...''',
    tests=UMLHELP + r'''classes, relations = parse_uml(UML)
assert first_line_ok(UML) and {"Team", "Player"} <= classes
assert has(relations, "Team", "aggregation", "Player") and kinds_between(relations, "Team", "Player") == {"aggregation"}
a, b, c = Player("Asha"), Player("Ben"), Player("Cy")
reds, blues = Team("Reds"), Team("Blues")
assert a.team is None and a.name == "Asha" and reds.name == "Reds" and reds.players == ()
assert reds.add(a) is None and reds.add(b) is None and reds.players == (a, b) and a.team is reds and b.team is reds and isinstance(reds.players, tuple)
assert error_of(reds.add, a) == "ValueError: Already in a team" and error_of(blues.add, a) == "ValueError: Already in a team" and reds.players == (a, b)
assert error_of(blues.remove, a) == "ValueError: Not in this team" and error_of(reds.remove, c) == "ValueError: Not in this team"
assert reds.remove(a) is None and reds.players == (b,) and a.team is None
assert blues.add(a) is None and a.team is blues and blues.players == (a,)
reds.add(c)
assert reds.players == (b, c)
assert reds.disband() is None and reds.players == () and b.team is None and c.team is None and b.name == "Ben" and c.name == "Cy"
assert blues.add(b) is None and blues.add(c) is None and blues.players == (a, b, c) and reds.name == "Reds"
reds.add(Player("Dee"))
assert len(reds.players) == 1 and reds.disband() is None and reds.disband() is None and reds.players == ()
assert a.team is blues''',
    solution=r'''UML = """classDiagram
    class Team {
        +String name
        +add(player) void
        +remove(player) void
        +disband() void
    }
    class Player {
        +String name
    }
    Team "1" o-- "*" Player : groups
"""


class Player:
    def __init__(self, name):
        self.name = name
        self.team = None


class Team:
    def __init__(self, name):
        self.name = name
        self._players = []

    @property
    def players(self):
        return tuple(self._players)

    def add(self, player):
        if player.team is not None:
            raise ValueError("Already in a team")
        self._players.append(player)
        player.team = self

    def remove(self, player):
        if player not in self._players:
            raise ValueError("Not in this team")
        self._players.remove(player)
        player.team = None

    def disband(self):
        for player in self._players:
            player.team = None
        self._players.clear()''',
    hints=[
        r'''`Team "1" o-- "*" Player` has the diamond on the `Team` side: the team is the whole. Aggregation draws a *hollow* diamond (`o--`); composition draws a *filled* one (`*--`).''',
        r'''The test that tells aggregation from composition: after `disband()`, are the players still usable? Here they are: you only forget them, you do not destroy them.''',
        r'''Keep the back-pointer `player.team` in step with the team's list: set it in `add`, clear it in `remove` and in `disband`.''',
    ],
    explanation=r'''**Aggregation** = "has a", parts independent. The `Team` groups `Player`s, but a `Player` is created first, lives on after the team is disbanded and can join a different team.

```mermaid
classDiagram
    class Team {
        +String name
        +add(player) void
        +remove(player) void
        +disband() void
    }
    class Player {
        +String name
    }
    Team "1" o-- "*" Player : groups
```

**The lifecycle test.** Ask: *if I delete the whole, does the part still make sense?* A player without a team: yes, so **aggregation**. (A room without a house: no, that is composition, the next problem.)

**In code the difference is ownership.** The team receives players that were created elsewhere (`team.add(player)`); it does not create them and does not destroy them. Many teams use aggregation and plain association interchangeably; the diamond just says "this is a whole made of parts".''',
),
P(
    slug='uml-composition-house-rooms', title='UML: Composition', topic='oop-uml-and-relationships', difficulty='intermediate', module=MODULE,
    description='Composition: a whole that creates and owns its parts, which cannot exist without it (a house and its rooms).',
    statement=r'''**Composition** is "owns a": the parts are **created by the whole and die with it**. A room does not exist without its house. Draw it with a filled diamond on the whole.

**1. The diagram.** `House` and `Room` joined by **composition** (`House *-- Room`) and nothing else.

**2. The code.**

- `House(address)` has `address`, `standing` (`True` until demolished) and `rooms` (a **new tuple** in creation order).
- `house.add_room(name, area)` **creates** a `Room` inside the house and returns it. Checks in order: demolished house `ValueError("The house was demolished")`; a name already used in this house `ValueError("Duplicate room")`; `area` not above 0 `ValueError("Area must be positive")`.
- `Room(house, name, area)` has `house`, `name` and `area`. Creating a room **without a house** (`house` is `None`) is `ValueError("A room needs a house")`.
- `room.alive` is a read-only property: `True` while its house is standing.
- `house.total_area` is the sum of the room areas.
- `house.demolish()` destroys every room: `rooms` becomes empty, `standing` becomes `False` and every room created earlier reports `alive == False`.''' + HOW,
    starter=r'''UML = """classDiagram
"""


class Room:
    ...


class House:
    ...''',
    tests=UMLHELP + r'''classes, relations = parse_uml(UML)
assert first_line_ok(UML) and {"House", "Room"} <= classes
assert has(relations, "House", "composition", "Room") and kinds_between(relations, "House", "Room") == {"composition"}
house = House("12 Main St")
assert house.address == "12 Main St" and house.standing is True and house.rooms == () and house.total_area == 0
kitchen = house.add_room("Kitchen", 12)
hall = house.add_room("Hall", 8.5)
assert isinstance(kitchen, Room) and (kitchen.name, kitchen.area, kitchen.house) == ("Kitchen", 12, house)
assert house.rooms == (kitchen, hall) and isinstance(house.rooms, tuple) and house.total_area == 20.5 and kitchen.alive is True
assert error_of(house.add_room, "Kitchen", 5) == "ValueError: Duplicate room" and error_of(house.add_room, "Loft", 0) == "ValueError: Area must be positive" and error_of(house.add_room, "Loft", -3) == "ValueError: Area must be positive"
assert error_of(house.add_room, "Kitchen", 0) == "ValueError: Duplicate room" and len(house.rooms) == 2
assert error_of(Room, None, "Ghost", 5) == "ValueError: A room needs a house"
assert error_of(setattr, kitchen, "alive", False) is not None and kitchen.alive is True
other = House("9 Side Rd")
assert other.add_room("Kitchen", 10).name == "Kitchen" and other.total_area == 10 and house.total_area == 20.5
assert house.demolish() is None and house.standing is False and house.rooms == () and house.total_area == 0
assert kitchen.alive is False and hall.alive is False and other.rooms[0].alive is True
assert error_of(house.add_room, "New", 5) == "ValueError: The house was demolished" and error_of(house.add_room, "Kitchen", 0) == "ValueError: The house was demolished"
assert house.demolish() is None and other.standing is True''',
    solution=r'''UML = """classDiagram
    class House {
        +String address
        +bool standing
        +add_room(name, area) Room
        +demolish() void
    }
    class Room {
        +String name
        +float area
        +bool alive
    }
    House "1" *-- "*" Room : owns
"""


class Room:
    def __init__(self, house, name, area):
        if house is None:
            raise ValueError("A room needs a house")
        self.house = house
        self.name = name
        self.area = area

    @property
    def alive(self):
        return self.house.standing


class House:
    def __init__(self, address):
        self.address = address
        self.standing = True
        self._rooms = []

    @property
    def rooms(self):
        return tuple(self._rooms)

    @property
    def total_area(self):
        return sum(room.area for room in self._rooms)

    def add_room(self, name, area):
        if not self.standing:
            raise ValueError("The house was demolished")
        if any(room.name == name for room in self._rooms):
            raise ValueError("Duplicate room")
        if area <= 0:
            raise ValueError("Area must be positive")
        room = Room(self, name, area)
        self._rooms.append(room)
        return room

    def demolish(self):
        self.standing = False
        self._rooms.clear()''',
    hints=[
        r'''`House "1" *-- "*" Room` puts the **filled** diamond on the whole. The tell-tale of composition in code: the house *creates* its rooms (`add_room` builds the `Room`), the caller never passes a finished room in.''',
        r'''A room asks its house whether it is still alive (`self.house.standing`) instead of storing its own flag: when the house is demolished, every room reports the change without anyone visiting them.''',
        r'''Do the checks of `add_room` in the order of the statement, and only create and store the room when all of them pass.''',
    ],
    explanation=r'''**Composition** = "owns a", lifecycle tied. The `House` creates its `Room`s and when it goes, they go: `demolish()` empties the list and every room reports `alive == False`.

```mermaid
classDiagram
    class House {
        +String address
        +bool standing
        +add_room(name, area) Room
        +demolish() void
    }
    class Room {
        +String name
        +float area
        +bool alive
    }
    House "1" *-- "*" Room : owns
```

**Aggregation versus composition in one sentence.** Aggregation: the parts are *given* to the whole and survive it (players and a team). Composition: the parts are *made by* the whole and die with it (rooms and a house).

**Signals in code.** The whole constructs the part; the part's constructor needs the whole; nobody else keeps the part. A `Room(None, ...)` that works would be a room with no house, which breaks the diagram's promise.''',
),
P(
    slug='uml-choose-the-relationship', title='UML: Choose the Relationship', topic='oop-uml-and-relationships', difficulty='intermediate', module=MODULE,
    description='Read six one-line stories and draw the right arrow for each: composition, aggregation, association or dependency.',
    statement=r'''Decide the relationship from the **lifecycle** (does the part survive the whole?) and from **how long one class holds the other**. Draw one line for each story in the string `UML` (a `classDiagram`).

1. A `Car` is built with its `Engine`; the engine is scrapped with the car.
2. A `Library` buys `Book`s; a book can be given to another library and keeps existing.
3. An `Order` consists of `OrderLine`s; a line means nothing without its order.
4. A `Student` takes `Course`s; both exist independently and know each other.
5. A `Teacher` uses a `Whiteboard` only during one method call (it is a parameter, never stored).
6. A `Playlist` groups `Song`s; a song stays in the catalogue when the playlist is deleted.

Use `*--` (composition), `o--` (aggregation), `-->` (association) or `..>` (dependency), with the **whole / source / user on the left**. Write exactly these six relationships and no others.''' + HOW,
    starter=r'''UML = """classDiagram
    %% one line for each of the six stories
"""''',
    tests=UMLHELP + r'''classes, relations = parse_uml(UML)
assert first_line_ok(UML)
found = {(a, k, b) for a, k, b, _, _ in relations}
assert found == {("Car", "composition", "Engine"), ("Library", "aggregation", "Book"), ("Order", "composition", "OrderLine"), ("Student", "association", "Course"), ("Teacher", "dependency", "Whiteboard"), ("Playlist", "aggregation", "Song")}
assert len(relations) == 6
assert classes >= {"Car", "Engine", "Library", "Book", "Order", "OrderLine", "Student", "Course", "Teacher", "Whiteboard", "Playlist", "Song"}
flipped = parse_uml("classDiagram\n  Engine --* Car\n  Book --o Library\n  Teacher ..> Whiteboard\n  Course <-- Student\n  Animal <|-- Dog\n  Shape <|.. Circle\n  Order \"1\" *-- \"1..*\" OrderLine : has")[1]
assert ("Car", "composition", "Engine", "", "") in flipped and ("Library", "aggregation", "Book", "", "") in flipped and ("Student", "association", "Course", "", "") in flipped
assert ("Dog", "inheritance", "Animal", "", "") in flipped and ("Circle", "realization", "Shape", "", "") in flipped and ("Order", "composition", "OrderLine", "1", "1..*") in flipped''',
    solution=r'''UML = """classDiagram
    Car *-- Engine
    Library o-- Book
    Order *-- OrderLine
    Student --> Course
    Teacher ..> Whiteboard
    Playlist o-- Song
"""''',
    hints=[
        r'''Ask the lifecycle question for each story: if the whole is deleted, does the part survive? No: composition. Yes: aggregation (or a simple association if there is no "whole").''',
        r'''Dependency is the weakest arrow: a class that only *uses* another in a method (parameter or local variable) and keeps no reference to it.''',
        r'''Mermaid: `A *-- B` filled diamond, `A o-- B` hollow diamond, `A --> B` plain arrow, `A ..> B` dotted arrow. The diamond is always on the whole.''',
    ],
    explanation=r'''**Five arrows, one question each.**

| Arrow | Mermaid | Ask | Example |
|---|---|---|---|
| Composition | `A *-- B` | does B die with A? | Car and Engine, Order and OrderLine |
| Aggregation | `A o-- B` | A groups B, B survives A | Library and Book, Playlist and Song |
| Association | `A --> B` | A holds a reference to B for a long time | Student and Course |
| Dependency | `A ..> B` | A only uses B inside a method | Teacher and Whiteboard |
| Inheritance | `B <|-- A` | A is-a B | Dog and Animal |

```mermaid
classDiagram
    Car *-- Engine
    Library o-- Book
    Order *-- OrderLine
    Student --> Course
    Teacher ..> Whiteboard
    Playlist o-- Song
```

**Strength order** (strongest first): inheritance, composition, aggregation, association, dependency. Use the *weakest* arrow that is true: a dependency drawn as composition makes the reader believe in an ownership that does not exist.''',
),
P(
    slug='uml-inheritance-vehicles', title='UML: Inheritance', topic='oop-uml-and-relationships', difficulty='beginner', module=MODULE,
    description='Draw a parent with two children (a hollow-triangle arrow) and write the three classes with overriding.',
    statement=r'''**Inheritance** (generalisation) is "is a": `Car` and `Truck` are kinds of `Vehicle`. Draw it with a hollow triangle pointing at the parent (`Vehicle <|-- Car`).

**1. The diagram.** `Vehicle`, `Car` and `Truck`, with `Car` and `Truck` each inheriting from `Vehicle`.

**2. The code.**

- `Vehicle(plate, wheels)`; `describe()` returns `"<plate> on <wheels> wheels"`.
- `Car(plate, doors)` is a `Vehicle` with 4 wheels and `doors`; `describe()` returns the parent's text followed by `", <doors> doors"`.
- `Truck(plate, load_kg)` is a `Vehicle` with 6 wheels and `load_kg`; `describe()` returns the parent's text followed by `", carries up to <load_kg> kg"`; `can_carry(kg)` returns `True` when `kg <= load_kg`.

Reuse the parent with `super()`.''' + HOW,
    starter=r'''UML = """classDiagram
"""


class Vehicle:
    ...''',
    tests=UMLHELP + r'''classes, relations = parse_uml(UML)
assert first_line_ok(UML) and {"Vehicle", "Car", "Truck"} <= classes
assert has(relations, "Car", "inheritance", "Vehicle") and has(relations, "Truck", "inheritance", "Vehicle") and not has(relations, "Vehicle", "inheritance", "Car")
assert issubclass(Car, Vehicle) and issubclass(Truck, Vehicle) and not issubclass(Car, Truck)
v = Vehicle("KA01", 2)
assert (v.plate, v.wheels) == ("KA01", 2) and v.describe() == "KA01 on 2 wheels"
car, truck = Car("KA02", 5), Truck("KA03", 900)
assert (car.plate, car.wheels, car.doors) == ("KA02", 4, 5) and (truck.plate, truck.wheels, truck.load_kg) == ("KA03", 6, 900)
assert car.describe() == "KA02 on 4 wheels, 5 doors" and truck.describe() == "KA03 on 6 wheels, carries up to 900 kg"
assert truck.can_carry(900) is True and truck.can_carry(901) is False and not hasattr(car, "can_carry")
assert [x.describe() for x in (v, car, truck)] == ["KA01 on 2 wheels", "KA02 on 4 wheels, 5 doors", "KA03 on 6 wheels, carries up to 900 kg"]
original = Vehicle.describe
Vehicle.describe = lambda self: "changed " + self.plate
assert car.describe() == "changed KA02, 5 doors" and truck.describe() == "changed KA03, carries up to 900 kg"
Vehicle.describe = original''',
    solution=r'''UML = """classDiagram
    class Vehicle {
        +String plate
        +int wheels
        +describe() String
    }
    class Car {
        +int doors
        +describe() String
    }
    class Truck {
        +int load_kg
        +describe() String
        +can_carry(kg) bool
    }
    Vehicle <|-- Car
    Vehicle <|-- Truck
"""


class Vehicle:
    def __init__(self, plate, wheels):
        self.plate = plate
        self.wheels = wheels

    def describe(self):
        return f"{self.plate} on {self.wheels} wheels"


class Car(Vehicle):
    def __init__(self, plate, doors):
        super().__init__(plate, 4)
        self.doors = doors

    def describe(self):
        return f"{super().describe()}, {self.doors} doors"


class Truck(Vehicle):
    def __init__(self, plate, load_kg):
        super().__init__(plate, 6)
        self.load_kg = load_kg

    def describe(self):
        return f"{super().describe()}, carries up to {self.load_kg} kg"

    def can_carry(self, kg):
        return kg <= self.load_kg''',
    hints=[
        r'''`Vehicle <|-- Car` reads "Car inherits from Vehicle": the triangle points at the **parent**.''',
        r'''Each child's `__init__` calls `super().__init__(plate, 4)` with its own number of wheels, then stores its extra attribute.''',
        r'''To extend `describe`, start from `super().describe()` and add the end of the sentence. The last test changes `Vehicle.describe` to prove you call the parent.''',
    ],
    explanation=r'''**Inheritance** is the arrow with the hollow triangle, pointing at the parent. In the diagram the common part (`plate`, `wheels`, `describe`) sits once in `Vehicle`; the children list only what they add or change.

```mermaid
classDiagram
    class Vehicle {
        +String plate
        +int wheels
        +describe() String
    }
    class Car {
        +int doors
        +describe() String
    }
    class Truck {
        +int load_kg
        +describe() String
        +can_carry(kg) bool
    }
    Vehicle <|-- Car
    Vehicle <|-- Truck
```

**Check the arrow in the code.** `issubclass(Car, Vehicle)` must hold, and the child must reuse the parent through `super()`.

**Use it for "is a".** A `Car` is a `Vehicle`. A `Car` is *not* a kind of `Engine`: that is composition.''',
),
P(
    slug='uml-dependency-report-printer', title='UML: Dependency', topic='oop-uml-and-relationships', difficulty='intermediate', module=MODULE,
    description='Dependency: a class that only uses another inside one method and never keeps it (a printer and a report).',
    statement=r'''A **dependency** is the weakest relationship: `ReportPrinter` *uses* a `Report` inside one method (it is a parameter) but never stores it. Draw it with a dotted arrow (`ReportPrinter ..> Report`).

**1. The diagram.** `ReportPrinter` and `Report` joined by a **dependency** and by no other relationship.

**2. The code.**

- `Report(title, lines)` has `title` and `lines` (a list stored as a copy).
- `ReportPrinter()` takes no arguments and is **stateless**: its `__dict__` stays empty, whatever you do with it.
- `printer.render(report)` **returns** the text: the title, a line of `=` signs as long as the title, then each line on its own row, all joined with `"\n"`. For example `"Sales\n=====\nnorth: 5\nsouth: 7"`.
- `printer.render` of something that is not a `Report` is `TypeError("Expected a Report")`.''' + HOW,
    starter=r'''UML = """classDiagram
"""


class Report:
    ...


class ReportPrinter:
    ...''',
    tests=UMLHELP + r'''classes, relations = parse_uml(UML)
assert first_line_ok(UML) and {"Report", "ReportPrinter"} <= classes
assert has(relations, "ReportPrinter", "dependency", "Report") and kinds_between(relations, "Report", "ReportPrinter") == {"dependency"}
rows = ["north: 5", "south: 7"]
report = Report("Sales", rows)
rows.append("west: 1")
assert report.title == "Sales" and report.lines == ["north: 5", "south: 7"]
printer = ReportPrinter()
assert printer.render(report) == "Sales\n=====\nnorth: 5\nsouth: 7"
assert printer.__dict__ == {} and vars(printer) == {}
assert printer.render(Report("A", [])) == "A\n=" and printer.render(Report("Totals", ["x"])) == "Totals\n======\nx"
assert printer.__dict__ == {}
assert error_of(printer.render, "text") == "TypeError: Expected a Report" and error_of(printer.render, None) == "TypeError: Expected a Report"
other = ReportPrinter()
assert other.render(report) == printer.render(report) and other.__dict__ == {}
assert not any(isinstance(value, Report) for value in vars(printer).values())''',
    solution=r'''UML = """classDiagram
    class Report {
        +String title
        +String[] lines
    }
    class ReportPrinter {
        +render(report) String
    }
    ReportPrinter ..> Report : uses
"""


class Report:
    def __init__(self, title, lines):
        self.title = title
        self.lines = list(lines)


class ReportPrinter:
    def render(self, report):
        if not isinstance(report, Report):
            raise TypeError("Expected a Report")
        return "\n".join([report.title, "=" * len(report.title)] + report.lines)''',
    hints=[
        r'''A dependency in code is a *parameter or a local variable*, never an attribute. If `ReportPrinter` keeps the report in `self`, the relationship has become an association.''',
        r'''Because the printer stores nothing, you do not need an `__init__` at all: an object of an empty class has an empty `__dict__`.''',
        r'''`"=" * len(title)` makes the underline; `"\n".join(list)` glues the rows together.''',
    ],
    explanation=r'''**Dependency** = "uses temporarily". The dotted arrow says: if `Report` changes, `ReportPrinter` may need to change, but the printer does not *hold* a report.

```mermaid
classDiagram
    class Report {
        +String title
        +String[] lines
    }
    class ReportPrinter {
        +render(report) String
    }
    ReportPrinter ..> Report : uses
```

**How to tell a dependency from an association in code.** Association: `self.report = report` (a field). Dependency: `def render(self, report)` (a parameter). The test `printer.__dict__ == {}` checks exactly that.

**Why it matters.** Draw dependencies sparingly: a diagram with every "uses" arrow is unreadable. Draw one when the coupling is a design decision worth showing.''',
),
P(
    slug='uml-realization-printable', title='UML: Interface and Realization', topic='oop-uml-and-relationships', difficulty='intermediate', module=MODULE,
    description='An interface drawn with a dotted triangle arrow, realised by two classes, and used through the interface only.',
    statement=r'''A **realization** says "this class keeps the promise of that interface". Draw it with a dotted line and a hollow triangle (`Printable <|.. Invoice`) and mark the interface with `<<interface>>`.

**1. The diagram.** An interface `Printable` (with the stereotype `<<interface>>` and the method `render()`), realised by `Invoice` and `Photo`.

**2. The code.**

- `Printable` is an **abstract class** (`ABC`) with the abstract method `render()`; it cannot be created.
- `Invoice(number, total)`: `render()` returns `"Invoice #<number>: <total>"`.
- `Photo(name, width, height)`: `render()` returns `"Photo <name> (<width>x<height>)"`.
- `print_all(items)` returns the list of `render()` results for the items, in order. It must not look at the kind of each item.''' + HOW,
    starter=r'''from abc import ABC, abstractmethod

UML = """classDiagram
"""


class Printable:
    ...


def print_all(items):
    ...''',
    tests=UMLHELP + r'''classes, relations = parse_uml(UML)
assert first_line_ok(UML) and {"Printable", "Invoice", "Photo"} <= classes and "<<interface>>" in UML and "render" in UML
assert has(relations, "Invoice", "realization", "Printable") and has(relations, "Photo", "realization", "Printable")
assert error_of(Printable) is not None and error_of(Printable).startswith("TypeError")
assert getattr(Printable.render, "__isabstractmethod__", False) is True
inv, pic = Invoice(7, 250), Photo("beach", 800, 600)
assert isinstance(inv, Printable) and isinstance(pic, Printable)
assert inv.render() == "Invoice #7: 250" and pic.render() == "Photo beach (800x600)"
assert print_all([inv, pic, Invoice(8, 10)]) == ["Invoice #7: 250", "Photo beach (800x600)", "Invoice #8: 10"] and print_all([]) == []
class Receipt(Printable):
    def render(self):
        return "Receipt"
assert print_all([Receipt(), inv]) == ["Receipt", "Invoice #7: 250"]
class Half(Printable):
    pass
assert error_of(Half).startswith("TypeError")''',
    solution=r'''from abc import ABC, abstractmethod

UML = """classDiagram
    class Printable {
        <<interface>>
        +render() String
    }
    class Invoice {
        +int number
        +float total
        +render() String
    }
    class Photo {
        +String name
        +render() String
    }
    Printable <|.. Invoice
    Printable <|.. Photo
"""


class Printable(ABC):
    @abstractmethod
    def render(self):
        """Return the text to print."""


class Invoice(Printable):
    def __init__(self, number, total):
        self.number = number
        self.total = total

    def render(self):
        return f"Invoice #{self.number}: {self.total}"


class Photo(Printable):
    def __init__(self, name, width, height):
        self.name = name
        self.width = width
        self.height = height

    def render(self):
        return f"Photo {self.name} ({self.width}x{self.height})"


def print_all(items):
    return [item.render() for item in items]''',
    hints=[
        r'''`Printable <|.. Invoice` has a **dotted** line (realization of an interface). Compare `Animal <|-- Dog` with a solid line (inheritance from a class).''',
        r'''Python has no `interface` keyword: an abstract class with only abstract methods plays that role. Mark the method with `@abstractmethod`.''',
        r'''`print_all` is a list comprehension that calls `item.render()`: it works for any class that keeps the promise, including `Receipt`, which the tests add later.''',
    ],
    explanation=r'''**Interface and realization.** The interface lists *what* can be done (`render()`); each class decides *how*. Callers depend on the interface only, so new classes plug in without changing them.

```mermaid
classDiagram
    class Printable {
        <<interface>>
        +render() String
    }
    class Invoice {
        +render() String
    }
    class Photo {
        +render() String
    }
    Printable <|.. Invoice
    Printable <|.. Photo
```

**Dotted versus solid.** Solid triangle line = inheritance (class from class). Dotted triangle line = realization (class implements interface). In Python both are written `class X(Base)`; in C# and Java they are different keywords (`: IPrintable` versus `: Base`).

**Why the test adds `Receipt`.** If `print_all` works for a class it has never seen, the dependency really is on the interface.''',
),
P(
    slug='uml-multiplicity-order-lines', title='UML: Multiplicity', topic='oop-uml-and-relationships', difficulty='intermediate', module=MODULE,
    description='Numbers on the ends of an arrow are rules: an order has one or more lines, and the code must enforce it.',
    statement=r'''**Multiplicity** puts numbers on the ends of a relationship: `1`, `0..1`, `*` (many), `1..*` (one or more). They are rules, so the code has to obey them.

**1. The diagram.** `Order` and `OrderLine` joined by **composition** where the `Order` end is `"1"` and the `OrderLine` end is `"1..*"`: `Order "1" *-- "1..*" OrderLine`.

**2. The code.**

- `OrderLine(product, quantity, unit_price)` has `total` (`quantity * unit_price`). `quantity` must be an `int` above 0, otherwise `ValueError("Quantity must be positive")`.
- `Order(customer)` has `customer`, `confirmed` (`False`) and `lines` (a **new tuple**).
- `order.add_line(product, quantity, unit_price)` **creates** the line (composition) and returns it; a confirmed order is `ValueError("Order is confirmed")`.
- `order.total` is the sum of the line totals.
- `order.confirm()` enforces `1..*`: with no line it is `ValueError("An order needs at least one line")`; a second `confirm` is `ValueError("Order is confirmed")`.''' + HOW,
    starter=r'''UML = """classDiagram
"""


class OrderLine:
    ...


class Order:
    ...''',
    tests=UMLHELP + r'''classes, relations = parse_uml(UML)
assert first_line_ok(UML) and {"Order", "OrderLine"} <= classes
assert has(relations, "Order", "composition", "OrderLine") and kinds_between(relations, "Order", "OrderLine") == {"composition"}
assert any(a == "Order" and k == "composition" and b == "OrderLine" and ma == "1" and mb == "1..*" for a, k, b, ma, mb in relations)
order = Order("Asha")
assert order.customer == "Asha" and order.confirmed is False and order.lines == () and order.total == 0
assert error_of(order.confirm) == "ValueError: An order needs at least one line" and order.confirmed is False
for bad in (0, -1, 1.5, True):
    assert error_of(order.add_line, "pen", bad, 10) == "ValueError: Quantity must be positive"
assert order.lines == ()
line = order.add_line("pen", 3, 10)
assert isinstance(line, OrderLine) and (line.product, line.quantity, line.unit_price, line.total) == ("pen", 3, 10, 30)
order.add_line("book", 1, 250)
assert len(order.lines) == 2 and isinstance(order.lines, tuple) and order.lines[0] is line and order.total == 280
assert order.confirm() is None and order.confirmed is True
assert error_of(order.confirm) == "ValueError: Order is confirmed" and error_of(order.add_line, "x", 1, 1) == "ValueError: Order is confirmed" and len(order.lines) == 2
second = Order("Ben")
assert second.lines == () and second.total == 0 and order.total == 280
assert error_of(OrderLine, "pen", 0, 5) == "ValueError: Quantity must be positive"
assert OrderLine("pen", 2, 2.5).total == 5.0''',
    solution=r'''UML = """classDiagram
    class Order {
        +String customer
        +bool confirmed
        +add_line(product, quantity, unit_price) OrderLine
        +confirm() void
    }
    class OrderLine {
        +String product
        +int quantity
        +float unit_price
    }
    Order "1" *-- "1..*" OrderLine : consists of
"""


class OrderLine:
    def __init__(self, product, quantity, unit_price):
        if type(quantity) is not int or quantity < 1:
            raise ValueError("Quantity must be positive")
        self.product = product
        self.quantity = quantity
        self.unit_price = unit_price

    @property
    def total(self):
        return self.quantity * self.unit_price


class Order:
    def __init__(self, customer):
        self.customer = customer
        self.confirmed = False
        self._lines = []

    @property
    def lines(self):
        return tuple(self._lines)

    @property
    def total(self):
        return sum(line.total for line in self._lines)

    def add_line(self, product, quantity, unit_price):
        if self.confirmed:
            raise ValueError("Order is confirmed")
        line = OrderLine(product, quantity, unit_price)
        self._lines.append(line)
        return line

    def confirm(self):
        if self.confirmed:
            raise ValueError("Order is confirmed")
        if not self._lines:
            raise ValueError("An order needs at least one line")
        self.confirmed = True''',
    hints=[
        r'''In Mermaid the multiplicity is a quoted string next to the class it describes: `Order "1" *-- "1..*" OrderLine`. Read it as "one order has one or more lines".''',
        r'''A multiplicity of `1..*` means "at least one": nothing stops you creating an `Order` with zero lines, so the rule must be enforced at the moment it matters, in `confirm()`.''',
        r'''Because it is composition, `Order.add_line` builds the `OrderLine` itself: callers pass the product, quantity and price, not a ready-made line.''',
    ],
    explanation=r'''**Multiplicity is a contract.** The numbers at the ends of the arrow are not decoration: `"1..*"` promises that a confirmed order has at least one line, and the code must make that true.

```mermaid
classDiagram
    class Order {
        +String customer
        +bool confirmed
        +add_line(product, quantity, unit_price) OrderLine
        +confirm() void
    }
    class OrderLine {
        +String product
        +int quantity
        +float unit_price
    }
    Order "1" *-- "1..*" OrderLine : consists of
```

| Multiplicity | Meaning | Typical code |
|---|---|---|
| `1` | exactly one | a required argument, never `None` |
| `0..1` | optional | `None` allowed |
| `*` or `0..*` | any number | a list that may be empty |
| `1..*` | at least one | a list that must not be empty when it matters |

**When to enforce.** An order is allowed to be empty while the customer is still shopping, so the rule is checked when it is *confirmed*. Deciding *when* an invariant must hold is a design decision worth saying out loud in an interview.''',
),
P(
    slug='uml-library-capstone', title='UML and Code: Mini Library', topic='oop-uml-and-relationships', difficulty='advanced', module=MODULE,
    description='A capstone: draw three different relationships for a small library and write code whose lifecycles match the arrows.',
    statement=r'''Draw and build a tiny library. Three relationships, three different arrows.

**1. The diagram.** In the string `UML` draw exactly these three relationships (and the classes `Library`, `Book`, `Author`, `Member`):

- `Library` **aggregates** `Book` (books exist on their own and can move to another library): `Library o-- Book`
- `Book` is **associated** with `Author` (a book knows its author; the author exists independently): `Book --> Author`
- `Library` **depends on** `Member` (a member is only a parameter of `lend`, never stored): `Library ..> Member`

**2. The code.**

- `Author(name)` has `name`. `Member(name)` has `name`.
- `Book(title, author)` has `title` and `author` (an `Author` object; anything else is `TypeError("Expected an Author")`).
- `Library(name)` has `name` and `books` (a **new tuple**, in the order added).
  - `add(book)` adds a book (the same book twice is `ValueError("Already in the library")`); `remove(book)` takes it out and returns it (`ValueError("Not in the library")`), so it can be added to another library.
  - `lend(title, member)` marks the book as lent and returns `"<member.name> borrowed <title>"`. Unknown title `ValueError("No such book")`; already lent `ValueError("Already lent")`. The library remembers only the **member's name** (in `lent`, a new dict from title to name): it must **not keep the `Member` object** anywhere.
  - `give_back(title)` makes the book available again (`ValueError("Not lent")` when it is not out).''' + HOW,
    starter=r'''UML = """classDiagram
"""


class Author:
    ...''',
    tests=UMLHELP + r'''classes, relations = parse_uml(UML)
assert first_line_ok(UML) and {"Library", "Book", "Author", "Member"} <= classes
assert {(a, k, b) for a, k, b, _, _ in relations} == {("Library", "aggregation", "Book"), ("Book", "association", "Author"), ("Library", "dependency", "Member")}
tolkien, orwell = Author("Tolkien"), Author("Orwell")
assert tolkien.name == "Tolkien" and Member("Asha").name == "Asha"
hobbit, nineteen = Book("The Hobbit", tolkien), Book("1984", orwell)
assert hobbit.title == "The Hobbit" and hobbit.author is tolkien
assert error_of(Book, "X", "Tolkien") == "TypeError: Expected an Author" and error_of(Book, "X", None) == "TypeError: Expected an Author"
lib, other = Library("City"), Library("Village")
assert lib.name == "City" and lib.books == () and lib.lent == {}
assert lib.add(hobbit) is None and lib.add(nineteen) is None and lib.books == (hobbit, nineteen) and isinstance(lib.books, tuple)
assert error_of(lib.add, hobbit) == "ValueError: Already in the library"
asha = Member("Asha")
assert lib.lend("1984", asha) == "Asha borrowed 1984" and lib.lent == {"1984": "Asha"}
assert error_of(lib.lend, "1984", Member("Ben")) == "ValueError: Already lent" and error_of(lib.lend, "Dune", asha) == "ValueError: No such book"
assert not any(isinstance(value, Member) for value in vars(lib).values()) and not any(isinstance(x, Member) for x in lib.lent.values())
def holds_member(value, seen=()):
    if isinstance(value, Member):
        return True
    if isinstance(value, dict):
        return any(holds_member(v) for v in list(value.keys()) + list(value.values()))
    if isinstance(value, (list, tuple, set)):
        return any(holds_member(v) for v in value)
    return False
assert not any(holds_member(value) for value in vars(lib).values())
shown = lib.lent
shown["junk"] = "x"
assert lib.lent == {"1984": "Asha"}
assert lib.give_back("1984") is None and lib.lent == {} and error_of(lib.give_back, "1984") == "ValueError: Not lent"
assert lib.lend("1984", Member("Ben")) == "Ben borrowed 1984"
assert lib.remove(hobbit) is hobbit and lib.books == (nineteen,) and error_of(lib.remove, hobbit) == "ValueError: Not in the library"
assert other.add(hobbit) is None and other.books == (hobbit,) and hobbit.title == "The Hobbit" and hobbit.author is tolkien
assert tolkien.name == "Tolkien" and nineteen.author is orwell''',
    solution=r'''UML = """classDiagram
    class Library {
        +String name
        +add(book) void
        +remove(book) Book
        +lend(title, member) String
        +give_back(title) void
    }
    class Book {
        +String title
    }
    class Author {
        +String name
    }
    class Member {
        +String name
    }
    Library o-- Book : holds
    Book --> Author : written by
    Library ..> Member : lends to
"""


class Author:
    def __init__(self, name):
        self.name = name


class Member:
    def __init__(self, name):
        self.name = name


class Book:
    def __init__(self, title, author):
        if not isinstance(author, Author):
            raise TypeError("Expected an Author")
        self.title = title
        self.author = author


class Library:
    def __init__(self, name):
        self.name = name
        self._books = []
        self._lent = {}

    @property
    def books(self):
        return tuple(self._books)

    @property
    def lent(self):
        return dict(self._lent)

    def _find(self, title):
        for book in self._books:
            if book.title == title:
                return book
        raise ValueError("No such book")

    def add(self, book):
        if book in self._books:
            raise ValueError("Already in the library")
        self._books.append(book)

    def remove(self, book):
        if book not in self._books:
            raise ValueError("Not in the library")
        self._books.remove(book)
        self._lent.pop(book.title, None)
        return book

    def lend(self, title, member):
        self._find(title)
        if title in self._lent:
            raise ValueError("Already lent")
        self._lent[title] = member.name
        return f"{member.name} borrowed {title}"

    def give_back(self, title):
        if title not in self._lent:
            raise ValueError("Not lent")
        del self._lent[title]''',
    hints=[
        r'''Three different arrows on purpose: `o--` hollow diamond (the library groups books), `-->` plain arrow (a book knows its author), `..>` dotted (the library only uses a member as a parameter).''',
        r'''A dependency leaves no trace: `lend` reads `member.name` and stores the *string*, never the `Member` object. The test looks inside the library for a `Member` and fails if it finds one.''',
        r'''Because the books are aggregated, `remove(book)` hands the same object back so another library can `add` it: the book outlives its library.''',
    ],
    explanation=r'''**One diagram, three lifecycles.**

```mermaid
classDiagram
    class Library {
        +add(book) void
        +remove(book) Book
        +lend(title, member) String
        +give_back(title) void
    }
    class Book
    class Author
    class Member
    Library o-- Book : holds
    Book --> Author : written by
    Library ..> Member : lends to
```

- **Aggregation (`o--`)**: the library groups books but does not own them; `remove` returns the book, and `other.add(hobbit)` is legal.
- **Association (`-->`)**: a `Book` keeps a reference to its `Author` for its whole life; the author is independent and one author may have many books.
- **Dependency (`..>`)**: `lend` uses a `Member` for one call and keeps only a name.

**Choosing the weakest true arrow.** Had the library stored `Member` objects, the honest arrow would be an association and the diagram (and the coupling) would change. Matching the code to the arrow, and the arrow to the code, is the whole skill.

**Going further.** Add `Loan(book, member, due)` created by the library when a book is lent. Which arrow joins `Library` and `Loan`, and why?''',
),
]
