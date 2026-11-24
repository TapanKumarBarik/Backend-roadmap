PROBLEMS = [
P(
    slug='lld-vending-machine', title='Vending Machine', topic='lld-machine-coding', difficulty='intermediate',
    module='lld/13-library-and-vending-machine/README.md',
    description='Build a vending machine that takes coins, sells items, gives change and refunds on cancel.',
    statement=r'''Write a class `VendingMachine` for a machine that sells items for coins. Money is whole **cents**, so a price of `65` is 65 cents.

**Creating one:** `VendingMachine(stock, coins=(100, 25, 10, 5))`

- `stock` maps a slot code to `(name, price, quantity)`, for example `{"A1": ("Chips", 65, 2)}`.
- `coins` is the list of coin values the machine accepts, **in any order**. Every price is a multiple of the smallest coin.
- The machine keeps **its own copy** of the stock. It must not change the dictionary it was given, and two machines built from the same dictionary must not share their quantities.

**Methods and properties**

- `insert(coin)` adds a coin to the credit. A coin that is not in `coins` raises `ValueError("Unsupported coin")` and changes nothing.
- `credit` is the total cents inserted so far.
- `state` is `"idle"` while nothing is inserted and `"has_money"` once at least one coin is in.
- `select(code)` buys one item and returns `(name, change)`, where `change` is a list of coin values, **largest coin first**, that adds up to what is left over (`[]` for none). The machine has all the change it needs. After a sale the credit is `0` and the state is `"idle"`.
- `cancel()` returns the coins inserted so far, **in the order they were inserted**, and goes back to `"idle"`. With nothing inserted it returns `[]`.

**What `select` refuses.** Check in this order, raise `ValueError` with exactly this message, and **change nothing** (the credit stays, so the buyer can insert more and try again):

1. the code is not in the stock: `"Unknown item"`
2. the item is out of stock (quantity 0): `"Sold out"`
3. the credit is less than the price: `"Insufficient funds"`

**Example**

```
vm = VendingMachine({"A1": ("Chips", 65, 2)})
vm.insert(100)
vm.state                 # "has_money"
vm.select("A1")          # ("Chips", [25, 10])    100 - 65 = 35 = 25 + 10
vm.state                 # "idle"
```''',
    starter=r'''class VendingMachine:
    def __init__(self, stock, coins=(100, 25, 10, 5)):
        """Keep your own copy of `stock`; accept only these coins."""
        ...

    @property
    def credit(self):
        """The cents inserted so far."""
        ...

    @property
    def state(self):
        """"idle" when no money is inserted, otherwise "has_money"."""
        ...

    def insert(self, coin):
        """Add a coin, or raise ValueError("Unsupported coin")."""
        ...

    def select(self, code):
        """Sell one item: return (name, change), or raise ValueError and change nothing."""
        ...

    def cancel(self):
        """Hand back the inserted coins, in the order they went in."""
        ...''',
    tests=r'''def error_of(action, *args):
    """What a call raises, as 'Type: message', or None when it does not."""
    try:
        action(*args)
    except Exception as error:
        return type(error).__name__ + ": " + str(error)
    return None
stock = {"A1": ("Chips", 65, 2), "B2": ("Soda", 100, 1), "C3": ("Gum", 35, 0)}
vm = VendingMachine(stock)
assert (vm.state, vm.credit) == ("idle", 0)
vm.insert(25)
vm.insert(100)
assert (vm.state, vm.credit) == ("has_money", 125)
assert error_of(vm.insert, 50) == "ValueError: Unsupported coin"
assert vm.credit == 125
assert vm.select("A1") == ("Chips", [25, 25, 10])
assert (vm.state, vm.credit) == ("idle", 0)
assert error_of(vm.select, "A1") == "ValueError: Insufficient funds"
vm.insert(25)
vm.insert(25)
assert error_of(vm.select, "A1") == "ValueError: Insufficient funds"
assert vm.credit == 50
vm.insert(10)
vm.insert(5)
assert vm.select("A1") == ("Chips", [])
assert error_of(vm.select, "A1") == "ValueError: Sold out"
assert error_of(vm.select, "C3") == "ValueError: Sold out"
assert error_of(vm.select, "Z9") == "ValueError: Unknown item"
vm.insert(100)
vm.insert(5)
assert error_of(vm.select, "A1") == "ValueError: Sold out"
assert vm.cancel() == [100, 5]
assert (vm.state, vm.credit) == ("idle", 0)
assert vm.cancel() == []
assert stock == {"A1": ("Chips", 65, 2), "B2": ("Soda", 100, 1), "C3": ("Gum", 35, 0)}
other = VendingMachine(stock)
other.insert(100)
assert other.select("A1") == ("Chips", [25, 10])
euro = VendingMachine({"X": ("Tea", 130, 1)}, coins=(10, 200, 20, 50))
assert error_of(euro.insert, 25) == "ValueError: Unsupported coin"
euro.insert(200)
assert euro.select("X") == ("Tea", [50, 20])
big = VendingMachine({"Q": ("Pen", 5, 3)})
for _ in range(3):
    big.insert(100)
    assert big.select("Q") == ("Pen", [25, 25, 25, 10, 10])
big.insert(100)
assert error_of(big.select, "Q") == "ValueError: Sold out"
assert big.credit == 100''',
    solution=r'''class VendingMachine:
    def __init__(self, stock, coins=(100, 25, 10, 5)):
        self._stock = {code: [name, price, quantity] for code, (name, price, quantity) in stock.items()}
        self._coins = tuple(sorted(coins, reverse=True))
        self._inserted = []

    @property
    def credit(self):
        return sum(self._inserted)

    @property
    def state(self):
        return "has_money" if self._inserted else "idle"

    def insert(self, coin):
        if coin not in self._coins:
            raise ValueError("Unsupported coin")
        self._inserted.append(coin)

    def select(self, code):
        if code not in self._stock:
            raise ValueError("Unknown item")
        slot = self._stock[code]
        name, price, quantity = slot
        if quantity == 0:
            raise ValueError("Sold out")
        if self.credit < price:
            raise ValueError("Insufficient funds")
        left = self.credit - price
        slot[2] -= 1
        self._inserted = []
        change = []
        for coin in self._coins:
            while left >= coin:
                change.append(coin)
                left -= coin
        return name, change

    def cancel(self):
        refund, self._inserted = self._inserted, []
        return refund''',
    hints=[
        r'''Keep one list of the coins inserted. The credit is its sum, `state` is "is the list empty?", and `cancel()` can hand back exactly those coins in the order they went in.''',
        r'''Check in the order the statement gives (unknown, sold out, insufficient) and raise **before** you change anything, so a refused purchase leaves the machine exactly as it was.''',
        r'''Build your own dictionary from `stock` in `__init__`, with the quantity in something you can change. If you keep the caller's dictionary you will edit it, and two machines will share their quantities. Change is greedy: for each coin, largest first, take as many as fit.''',
    ],
    explanation=r'''**The idea.** A vending machine is a small *state machine*. It is idle until a coin goes in, then it holds money until it either sells something or is cancelled.

```mermaid
stateDiagram-v2
    [*] --> idle
    idle --> has_money: insert(coin)
    has_money --> has_money: insert(coin) or a refused select
    has_money --> idle: select succeeds
    has_money --> idle: cancel()
```

You do not need a class per state to get this right. The state is *derived*: it is `"idle"` exactly when no coins are held, so storing a separate state variable would only give you a second thing that can disagree with the first. In an interview, say that out loud: the State pattern earns its classes when each state has **different behaviour** worth separating, not when a flag would do.

**Validate, then change.** `select` runs three checks in a fixed order and only then touches the stock and the credit. A refused purchase must leave everything as it found it; that is what lets the buyer insert another coin and try again.

**Copy what you are given.** The most common bug here is `self.stock = stock`. It works until a test builds a second machine from the same dictionary and finds half the chips already gone. Treat constructor arguments you will change as input to copy, not as storage.

**Change.** Greedy (largest coin first) is exact when every price is a multiple of the smallest coin and each coin divides the next, as with `100, 25, 10, 5`. For coin systems where greedy is wrong (`4, 3, 1` making `6`) you would need dynamic programming; the statement rules that out.

**Complexity.** Every operation is O(number of coin types), so effectively O(1).

**Going further.** Real machines run out of change. What would you have to store, and what should `select` do when it cannot make exact change?''',
),

P(
    slug='lld-tic-tac-toe', title='Tic-Tac-Toe', topic='lld-machine-coding', difficulty='intermediate',
    module='lld/14-tic-tac-toe-and-chess/README.md',
    description='Build an n by n Tic-Tac-Toe game that reports a win or a draw the moment it happens, in constant time per move.',
    statement=r'''Write a class `TicTacToe` for an `n` by `n` board where **X moves first** and the players then alternate.

**Creating one:** `TicTacToe(n=3)`. Rows and columns are numbered from `0`.

**Methods and properties**

- `move(row, col)` puts the current player's mark on that cell and returns:
  - `"X"` or `"O"` when this move completes a whole row, a whole column, the main diagonal (`row == col`) or the other diagonal (`row + col == n - 1`) with that player's marks;
  - `"draw"` when the board is now full and nobody won;
  - `None` otherwise.
  A winning move on the last empty cell is a **win**, not a draw.
- `current` is the player whose turn it is (`"X"` or `"O"`). It is only tested while the game is still going.
- `winner` is `"X"`, `"O"` or `None` (a draw has no winner).
- `over` is `True` once someone has won or the board is full.
- `board()` returns a list of `n` strings, one per row, with `"X"`, `"O"` or `"."` for an empty cell, e.g. `["X.O", "...", "..."]`.

**What `move` refuses.** Check in this order, raise `ValueError` with exactly this message, and change **nothing** (the same player is still to move):

1. the game is over: `"Game over"`
2. the cell is off the board (any coordinate below `0` or `n` and above): `"Out of board"`
3. the cell already has a mark: `"Cell taken"`

**Speed.** A test plays a full game on a 600 by 600 board. Looking at the whole board after every move is too slow; each move should cost O(1).

**Example**

```
game = TicTacToe()
game.move(0, 0)     # None   (X)
game.move(1, 0)     # None   (O)
game.move(0, 1)     # None   (X)
game.move(1, 1)     # None   (O)
game.move(0, 2)     # "X"    the top row is X X X
```''',
    starter=r'''class TicTacToe:
    def __init__(self, n=3):
        """An empty n by n board; X to move."""
        ...

    @property
    def current(self):
        """The player to move: "X" or "O"."""
        ...

    @property
    def winner(self):
        """"X", "O", or None."""
        ...

    @property
    def over(self):
        """True once someone has won or the board is full."""
        ...

    def move(self, row, col):
        """Play the current player's mark; return the winner, "draw" or None; or raise ValueError."""
        ...

    def board(self):
        """The rows as strings of X, O and dots."""
        ...''',
    tests=r'''def error_of(action, *args):
    try:
        action(*args)
    except Exception as error:
        return type(error).__name__ + ": " + str(error)
    return None
def play(game, moves):
    """Play the moves in order and return what each one returned."""
    return [game.move(r, c) for r, c in moves]
g = TicTacToe()
assert (g.current, g.winner, g.over) == ("X", None, False)
assert g.board() == ["...", "...", "..."]
assert g.move(0, 0) is None
assert (g.current, g.board()[0]) == ("O", "X..")
assert error_of(g.move, 0, 0) == "ValueError: Cell taken"
assert error_of(g.move, 3, 0) == "ValueError: Out of board"
assert error_of(g.move, 0, -1) == "ValueError: Out of board"
assert error_of(g.move, -1, 2) == "ValueError: Out of board"
assert g.current == "O"
row = TicTacToe()
assert play(row, [(0, 0), (1, 0), (0, 1), (1, 1), (0, 2)]) == [None, None, None, None, "X"]
assert (row.winner, row.over) == ("X", True)
assert error_of(row.move, 2, 2) == "ValueError: Game over"
col = TicTacToe()
assert play(col, [(0, 0), (0, 1), (0, 2), (1, 1), (1, 0), (2, 1)]) == [None, None, None, None, None, "O"]
assert col.winner == "O"
diag = TicTacToe()
assert play(diag, [(0, 0), (0, 1), (1, 1), (0, 2), (2, 2)])[-1] == "X"
anti = TicTacToe()
assert play(anti, [(0, 2), (0, 0), (1, 1), (0, 1), (2, 0)])[-1] == "X"
draw = TicTacToe()
assert play(draw, [(0, 0), (0, 1), (0, 2), (1, 1), (1, 0), (1, 2), (2, 1), (2, 0), (2, 2)]) == [None] * 8 + ["draw"]
assert (draw.winner, draw.over) == (None, True)
assert draw.board() == ["XOX", "XOO", "OXX"]
assert error_of(draw.move, 0, 0) == "ValueError: Game over"
last = TicTacToe()
assert play(last, [(0, 0), (0, 1), (0, 2), (1, 0), (2, 1), (1, 2), (1, 1), (2, 0), (2, 2)])[-1] == "X"
assert last.winner == "X"
one = TicTacToe(1)
assert one.move(0, 0) == "X"
four = TicTacToe(4)
assert play(four, [(0, 3), (0, 0), (1, 2), (0, 1), (2, 1), (0, 2), (3, 0)])[-1] == "X"
import time
n = 600
huge = TicTacToe(n)
results = []
started = time.perf_counter()
for i in range(n - 1):
    results.append(huge.move(i, i))
    results.append(huge.move(i, i + 1))
results.append(huge.move(n - 1, n - 1))
elapsed = time.perf_counter() - started
assert results[:-1] == [None] * (2 * n - 2)
assert results[-1] == "X"
assert elapsed < 2.5, "a 600 by 600 game took %.1f s: each move should cost O(1), not a scan of the board" % elapsed''',
    solution=r'''class TicTacToe:
    def __init__(self, n=3):
        self.n = n
        self._cells = [["."] * n for _ in range(n)]
        self._rows = {"X": [0] * n, "O": [0] * n}
        self._cols = {"X": [0] * n, "O": [0] * n}
        self._diag = {"X": 0, "O": 0}
        self._anti = {"X": 0, "O": 0}
        self._moves = 0
        self.current = "X"
        self.winner = None

    @property
    def over(self):
        return self.winner is not None or self._moves == self.n * self.n

    def move(self, row, col):
        n = self.n
        if self.over:
            raise ValueError("Game over")
        if not (0 <= row < n and 0 <= col < n):
            raise ValueError("Out of board")
        if self._cells[row][col] != ".":
            raise ValueError("Cell taken")
        player = self.current
        self._cells[row][col] = player
        self._moves += 1
        self._rows[player][row] += 1
        self._cols[player][col] += 1
        if row == col:
            self._diag[player] += 1
        if row + col == n - 1:
            self._anti[player] += 1
        if n in (self._rows[player][row], self._cols[player][col], self._diag[player], self._anti[player]):
            self.winner = player
            return player
        self.current = "O" if player == "X" else "X"
        return "draw" if self._moves == n * n else None

    def board(self):
        return ["".join(row) for row in self._cells]''',
    hints=[
        r'''Do not scan the board to look for a line. A line is only completed by the cell you just played, and only its row, its column and (if it sits on them) the two diagonals can have changed.''',
        r'''Keep a counter per player for each row, each column and each diagonal. When a player's counter for any line the move touched reaches `n`, that line is theirs.''',
        r'''Two traps: Python accepts a negative index, so `board[-1][0]` does not fail on its own (check the range yourself), and the order of the checks matters (a finished game refuses every move, even one on an empty cell). A refused move must not pass the turn.''',
    ],
    explanation=r'''**The idea.** The obvious solution re-reads the whole board after each move, which is O(n²) per move. But a move can only complete a line that goes through the cell just played, and a cell lies on at most four lines: its row, its column, and possibly the two diagonals. So keep a counter for each line and per player. Adding a mark is four increments, and checking for a win is four comparisons against `n`: **O(1) per move**.

```mermaid
classDiagram
    class TicTacToe {
        +int n
        +current
        +winner
        +over
        +move()
        +board()
    }
    class LineCounters {
        rows[player][n]
        cols[player][n]
        diag[player]
        anti[player]
    }
    TicTacToe --> LineCounters : updates 4 counters per move
```

**Why a counter works.** A row is won by `X` exactly when `X` has `n` marks in it. Because a cell holds one mark, no extra bookkeeping is needed to stop `O`'s marks from being counted.

**Order of checks.** "Game over" first, then "Out of board", then "Cell taken". The test for a board with the game finished but an empty cell left checks the first one; the tests with `-1` check that you do not let Python's negative indexing through.

**A win on the last cell.** On a full 3 by 3 board the ninth move can still complete a line. Return the winner before you test for a draw.

**Going further.** How would you support a different win length (five in a row on a 15 by 15 board)? The counters no longer work; you would count along four directions from the new cell instead.''',
),

P(
    slug='lld-in-memory-file-system', title='In-Memory File System', topic='lld-machine-coding', difficulty='intermediate',
    module='lld/07-structural-patterns/README.md',
    description='Build a file system in memory with directories, files, sizes and removal, using the Composite idea.',
    statement=r'''Write a class `FileSystem` that stores directories and text files in memory.

**Paths** are absolute and use `/`: `/` is the root, `/docs/notes.txt` is a file inside the directory `docs`. A path must start with `/` (otherwise raise `ValueError("Path must start with /")`). Empty parts are ignored, so `/docs//notes.txt/` is the same as `/docs/notes.txt`.

**Methods**

- `mkdir(path)` creates the directory and any missing parent directories. A directory that exists already is fine.
- `write(path, text)` appends `text` to the file, creating the file (and any missing parent directories) if it does not exist.
- `read(path)` returns the file's whole text.
- `ls(path)` returns the **sorted** names inside a directory, or `[name]` (just the file's own name) for a file.
- `size(path)` returns the number of characters in a file, or in all the files below a directory (any depth). An empty directory has size `0`.
- `rm(path)` removes a file, or a directory with everything below it. Removing `/` raises `ValueError("Cannot remove root")`.

**What goes wrong.** Raise these built-in exceptions (the message is not tested):

- `FileNotFoundError` when a part of the path does not exist (for `mkdir` and `write`, missing parents are created, so this is for `read`, `ls`, `size` and `rm`);
- `NotADirectoryError` when a path goes **through** a file (`/a.txt/b`), or when `mkdir` meets a file where it needs a directory;
- `IsADirectoryError` when `read` or `write` is given a directory.

**Example**

```
fs = FileSystem()
fs.write("/docs/notes.txt", "hello")
fs.write("/docs/notes.txt", " world")
fs.read("/docs/notes.txt")     # "hello world"
fs.ls("/")                     # ["docs"]
fs.size("/docs")               # 11
```''',
    starter=r'''class FileSystem:
    def __init__(self):
        """An empty file system: just the root directory."""
        ...

    def mkdir(self, path):
        """Create the directory and any missing parents."""
        ...

    def write(self, path, text):
        """Append text to the file, creating it (and its parents) if needed."""
        ...

    def read(self, path):
        """The file's text."""
        ...

    def ls(self, path):
        """Sorted names in a directory, or [name] for a file."""
        ...

    def size(self, path):
        """Characters in a file, or in every file below a directory."""
        ...

    def rm(self, path):
        """Remove a file, or a directory and everything in it."""
        ...''',
    tests=r'''def error_of(action, *args):
    try:
        action(*args)
    except Exception as error:
        return type(error).__name__
    return None
fs = FileSystem()
assert fs.ls("/") == []
assert fs.size("/") == 0
fs.write("/docs/notes.txt", "hello")
fs.write("/docs/notes.txt", " world")
assert fs.read("/docs/notes.txt") == "hello world"
assert fs.ls("/") == ["docs"]
assert fs.ls("/docs") == ["notes.txt"]
assert fs.ls("/docs/notes.txt") == ["notes.txt"]
assert fs.size("/docs/notes.txt") == 11
fs.mkdir("/docs/img/icons")
fs.write("/docs/img/icons/a.png", "12345")
fs.write("/docs/readme", "xy")
assert fs.ls("/docs") == ["img", "notes.txt", "readme"]
assert fs.size("/docs") == 18
assert fs.size("/docs/img") == 5
assert fs.size("/") == 18
fs.mkdir("/docs/img")
assert fs.ls("/docs/img") == ["icons"]
assert fs.read("/docs//notes.txt/") == "hello world"
assert fs.ls("/docs/img/") == ["icons"]
assert error_of(fs.read, "/nope") == "FileNotFoundError"
assert error_of(fs.ls, "/docs/missing") == "FileNotFoundError"
assert error_of(fs.size, "/missing/x") == "FileNotFoundError"
assert error_of(fs.read, "/docs") == "IsADirectoryError"
assert error_of(fs.write, "/docs", "x") == "IsADirectoryError"
assert error_of(fs.write, "/", "x") == "IsADirectoryError"
assert error_of(fs.ls, "/docs/notes.txt/more") == "NotADirectoryError"
assert error_of(fs.write, "/docs/notes.txt/more", "x") == "NotADirectoryError"
assert error_of(fs.mkdir, "/docs/notes.txt") == "NotADirectoryError"
assert error_of(fs.mkdir, "/docs/notes.txt/deeper") == "NotADirectoryError"
assert fs.read("/docs/notes.txt") == "hello world"
assert error_of(fs.ls, "docs") == "ValueError"
assert error_of(fs.rm, "/") == "ValueError"
fs.rm("/docs/img")
assert fs.ls("/docs") == ["notes.txt", "readme"]
assert fs.size("/") == 13
assert error_of(fs.rm, "/docs/img") == "FileNotFoundError"
fs.rm("/docs/readme")
assert fs.ls("/docs") == ["notes.txt"]
fs.rm("/docs")
assert fs.ls("/") == []
other = FileSystem()
assert other.ls("/") == []
deep = "/" + "/".join(["d"] * 100)
other.write(deep + "/f", "abc")
assert other.size("/") == 3
assert other.ls(deep) == ["f"]
for i in range(1000):
    other.write("/many/file%04d" % i, "x")
names = other.ls("/many")
assert len(names) == 1000 and names == sorted(names)
assert other.size("/many") == 1000''',
    solution=r'''class _File:
    def __init__(self):
        self.text = ""

    def size(self):
        return len(self.text)


class _Directory:
    def __init__(self):
        self.children = {}

    def size(self):
        return sum(child.size() for child in self.children.values())


class FileSystem:
    def __init__(self):
        self._root = _Directory()

    @staticmethod
    def _parts(path):
        if not path.startswith("/"):
            raise ValueError("Path must start with /")
        return [part for part in path.split("/") if part]

    def _step(self, node, part, create):
        """The child of a directory called `part`, creating a directory when asked."""
        if not isinstance(node, _Directory):
            raise NotADirectoryError(part)
        if part not in node.children:
            if not create:
                raise FileNotFoundError(part)
            node.children[part] = _Directory()
        return node.children[part]

    def _find(self, path, create=False):
        node = self._root
        for part in self._parts(path):
            node = self._step(node, part, create)
        return node

    def mkdir(self, path):
        node = self._find(path, create=True)
        if not isinstance(node, _Directory):
            raise NotADirectoryError(path)

    def write(self, path, text):
        parts = self._parts(path)
        if not parts:
            raise IsADirectoryError(path)
        node = self._root
        for part in parts[:-1]:
            node = self._step(node, part, create=True)
        if not isinstance(node, _Directory):
            raise NotADirectoryError(path)
        name = parts[-1]
        target = node.children.get(name)
        if target is None:
            target = node.children[name] = _File()
        if isinstance(target, _Directory):
            raise IsADirectoryError(path)
        target.text += text

    def read(self, path):
        node = self._find(path)
        if isinstance(node, _Directory):
            raise IsADirectoryError(path)
        return node.text

    def ls(self, path):
        node = self._find(path)
        if isinstance(node, _File):
            return [self._parts(path)[-1]]
        return sorted(node.children)

    def size(self, path):
        return self._find(path).size()

    def rm(self, path):
        parts = self._parts(path)
        if not parts:
            raise ValueError("Cannot remove root")
        parent = self._root
        for part in parts[:-1]:
            parent = self._step(parent, part, create=False)
        if not isinstance(parent, _Directory):
            raise NotADirectoryError(path)
        if parts[-1] not in parent.children:
            raise FileNotFoundError(path)
        del parent.children[parts[-1]]''',
    hints=[
        r'''A file and a directory are both "something with a size". Give them two small classes with the same `size()` method, and let a directory answer by asking its children: that is the Composite pattern, and it makes `size` and `rm` almost free.''',
        r'''Write one helper that walks a path part by part and use it everywhere. Decide in one place what happens when a part is missing (create it, or raise `FileNotFoundError`) and when you try to step *into* a file (`NotADirectoryError`).''',
        r'''Appending is the default for `write`, so do not replace the text. Sort `ls` yourself (a dictionary keeps insertion order, not name order), and ignore empty path parts so `"/a//b/"` works.''',
    ],
    explanation=r'''**The idea.** A directory contains files *and* other directories, and you want to treat them the same way when you ask for a size. That is the **Composite** pattern: one interface (`size()`), two implementations, and the directory's implementation just adds up its children's.

```mermaid
classDiagram
    class Node {
        <<interface>>
        +size()
    }
    class File {
        +text
        +size()
    }
    class Directory {
        +children
        +size()
    }
    Node <|.. File
    Node <|.. Directory
    Directory o-- Node : children
```

**One walker.** `mkdir`, `write`, `read`, `ls`, `size` and `rm` all begin the same way: turn the path into parts and walk down. Putting that in one helper (`_step`) means the rules about missing parts and about stepping through a file are written once. The usual way to get this wrong is to write the walk six times and have two of them disagree.

**Which error?** It is the same set Python's own `open`, `os.listdir` and `os.mkdir` use: `FileNotFoundError`, `NotADirectoryError`, `IsADirectoryError`. Reusing the standard exceptions means callers can handle your file system like a real one.

**Mistakes that the tests catch:** `write` that overwrites instead of appending; `ls` that returns names in insertion order; `size` of a directory that counts only its direct files; `rm("/")` that clears the root instead of refusing.

**Complexity.** Every operation is O(depth of the path), except `size` and `rm` of a directory, which visit each node below it once. (The tests nest 100 levels deep, so avoid one Python call per path part if you can.)

**Going further.** Real file systems cache sizes so `size("/")` is not a full walk. What would you have to update on every write, and on every `rm`?''',
),

P(
    slug='lld-meeting-room-booking', title='Meeting Room Booking', topic='lld-machine-coding', difficulty='intermediate',
    module='lld/11-requirements-to-class-diagrams/README.md',
    description='Book the smallest free meeting room that fits a group, with cancellations and back-to-back bookings.',
    statement=r'''Write a class `RoomBooking` for an office with meeting rooms.

**Creating one:** `RoomBooking(rooms)` where `rooms` maps a room name to its capacity, for example `{"Alpha": 10, "Beta": 4}`.

**Methods**

- `book(start, end, people)` books a room for the time `[start, end)` (whole numbers, like minutes since midnight) and returns `(booking_id, room_name)`.
  - Choose the room with the **smallest capacity that still holds `people`** and is **free for the whole time**. If two rooms have the same capacity, pick the one whose name comes first alphabetically.
  - If no room qualifies, return `None` and change nothing.
  - Booking ids are `1, 2, 3, ...` in the order of **successful** bookings; a failed attempt does not use up an id.
  - `end` is not included: a booking that ends at `10` does not clash with one that starts at `10`.
  - Raise `ValueError("Bad time range")` when `start >= end`, then `ValueError("Bad group size")` when `people < 1` (check them in that order, before looking at any room).
- `cancel(booking_id)` frees the booking and returns `True`; it returns `False` for an id that never existed or was already cancelled. The id is not reused.
- `schedule(room_name)` returns the room's current bookings as a list of `(start, end)` pairs, **sorted by start time**. An unknown room raises `ValueError("Unknown room")`.

**Example**

```
rb = RoomBooking({"Alpha": 10, "Beta": 4, "Gamma": 4})
rb.book(9, 10, 3)     # (1, "Beta")     smallest room that fits, "Beta" before "Gamma"
rb.book(9, 10, 3)     # (2, "Gamma")    Beta is busy at 9
rb.book(10, 11, 3)    # (3, "Beta")     back to back with booking 1 is fine
```''',
    starter=r'''class RoomBooking:
    def __init__(self, rooms):
        """`rooms` maps a room name to its capacity."""
        ...

    def book(self, start, end, people):
        """Book the smallest free room that fits; return (booking_id, room) or None."""
        ...

    def cancel(self, booking_id):
        """Free a booking. True if it existed, False otherwise."""
        ...

    def schedule(self, room_name):
        """The room's bookings as (start, end) pairs sorted by start."""
        ...''',
    tests=r'''def error_of(action, *args):
    try:
        action(*args)
    except Exception as error:
        return type(error).__name__ + ": " + str(error)
    return None
rb = RoomBooking({"Delta": 20, "Alpha": 10, "Gamma": 4, "Beta": 4})
assert rb.book(9, 10, 3) == (1, "Beta")
assert rb.book(9, 10, 3) == (2, "Gamma")
assert rb.book(9, 10, 3) == (3, "Alpha")
assert rb.book(9, 10, 3) == (4, "Delta")
assert rb.book(9, 10, 3) is None
assert rb.book(10, 11, 3) == (5, "Beta")
assert rb.book(9, 11, 5) is None
assert rb.book(11, 12, 15) == (6, "Delta")
assert rb.book(8, 9, 1) == (7, "Beta")
assert rb.book(8, 10, 1) is None
assert rb.schedule("Beta") == [(8, 9), (9, 10), (10, 11)]
assert rb.schedule("Gamma") == [(9, 10)]
assert rb.cancel(1) is True
assert rb.cancel(1) is False
assert rb.cancel(99) is False
assert rb.schedule("Beta") == [(8, 9), (10, 11)]
assert rb.book(9, 10, 2) == (8, "Beta")
assert rb.schedule("Beta") == [(8, 9), (9, 10), (10, 11)]
assert rb.book(100, 200, 21) is None
assert rb.book(100, 200, 20) == (9, "Delta")
assert error_of(rb.book, 5, 5, 2) == "ValueError: Bad time range"
assert error_of(rb.book, 6, 5, 2) == "ValueError: Bad time range"
assert error_of(rb.book, 5, 6, 0) == "ValueError: Bad group size"
assert error_of(rb.book, 6, 5, 0) == "ValueError: Bad time range"
assert rb.book(300, 301, 4) == (10, "Beta")
assert error_of(rb.schedule, "Nope") == "ValueError: Unknown room"
assert rb.cancel(10) is True
late = RoomBooking({"R": 5})
assert late.book(20, 30, 1) == (1, "R")
assert late.book(10, 20, 1) == (2, "R")
assert late.book(15, 25, 1) is None
assert late.book(25, 26, 1) is None
assert late.book(5, 35, 1) is None
assert late.book(0, 10, 1) == (3, "R")
assert late.schedule("R") == [(0, 10), (10, 20), (20, 30)]
busy = RoomBooking({"R": 5})
for i in range(1500):
    assert busy.book(i * 2, i * 2 + 2, 1) == (i + 1, "R")
assert busy.book(1000, 1001, 1) is None
assert len(busy.schedule("R")) == 1500''',
    solution=r'''class RoomBooking:
    def __init__(self, rooms):
        # smallest capacity first, ties by name
        self._order = sorted(rooms, key=lambda name: (rooms[name], name))
        self._capacity = dict(rooms)
        self._slots = {name: [] for name in rooms}
        self._by_id = {}
        self._next_id = 1

    def book(self, start, end, people):
        if start >= end:
            raise ValueError("Bad time range")
        if people < 1:
            raise ValueError("Bad group size")
        for name in self._order:
            if self._capacity[name] < people:
                continue
            if any(s < end and start < e for s, e, _ in self._slots[name]):
                continue
            booking_id = self._next_id
            self._next_id += 1
            self._slots[name].append((start, end, booking_id))
            self._by_id[booking_id] = name
            return booking_id, name
        return None

    def cancel(self, booking_id):
        name = self._by_id.pop(booking_id, None)
        if name is None:
            return False
        self._slots[name] = [slot for slot in self._slots[name] if slot[2] != booking_id]
        return True

    def schedule(self, room_name):
        if room_name not in self._slots:
            raise ValueError("Unknown room")
        return sorted((s, e) for s, e, _ in self._slots[room_name])''',
    hints=[
        r'''Sort the rooms once, in `__init__`, by `(capacity, name)`. Then "smallest room that fits and is free" is just the first room in that order that passes two checks.''',
        r'''Two time ranges `[a, b)` and `[c, d)` overlap exactly when `a < d` and `c < b`. Because the end is excluded, that comparison is already right for back-to-back bookings: do not use `<=`.''',
        r'''Hand out an id only when a booking actually succeeds, and keep a map from id to room so `cancel` knows where to look and can tell "already cancelled" from "never existed".''',
    ],
    explanation=r'''**The idea.** Most of the work is choosing the right data to keep. Two small structures do it: the rooms in a fixed order (smallest capacity first, then name), and for each room the list of bookings it holds. Booking is then a scan in that order for the first room that fits the group and has no overlapping booking.

**Overlap, once.** Two half-open ranges `[a, b)` and `[c, d)` overlap when `a < d and c < b`. Memorise that; it is the building block of every scheduling problem. Because the end is excluded there is no special case for back-to-back bookings, and it also handles one range containing the other.

**Best fit, not first fit.** Always offering the biggest free room would work but wastes it: a group of two should not take the 20-person room while a four-seat room is free. The tests check this with four rooms that fill up in order.

**Ids.** Handing out ids from a counter that only moves on success is what the statement asks. Two common slips: incrementing before you know the booking will succeed, and reusing an id after a cancel.

**Complexity.** `book` is O(rooms × bookings per room) here, because it scans each room's list. That is fine for an office; at scale you would keep each room's bookings sorted and binary-search for the neighbour, or use an interval tree, to get O(log n) per room.

**Going further.** Recurring bookings ("every Monday at 9") break the "list of ranges" idea. What would you store instead, and how would overlap checking change?''',
),
]
