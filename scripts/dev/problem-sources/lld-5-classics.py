PROBLEMS = [
P(
    slug='lld-atm-machine', title='ATM Machine', topic='lld-machine-coding', difficulty='intermediate',
    module='lld/13-library-and-vending-machine/README.md',
    description='Build an ATM that checks PINs, blocks a card after repeated mistakes and pays out notes from a limited cash drawer.',
    statement=r'''Write a class `ATM` for a cash machine. Money is whole units (say rupees), and the machine pays out **notes**.

**Creating one:** `ATM(cash, accounts, max_attempts=3)`

- `cash` maps a note value to how many of that note the machine holds, e.g. `{100: 5, 50: 2, 20: 10, 10: 10}`.
- `accounts` maps an account id to `{"pin": "1234", "balance": 100000}`.
- The ATM keeps **its own copy** of both: it must not change the dictionaries it was given.

**Logging in.** `balance(account_id, pin)` and `withdraw(account_id, pin, amount)` both start by checking the card, in this order, raising `ValueError` with exactly this message:

1. `"Unknown account"`
2. `"Card blocked"`: the card was blocked earlier. It stays blocked, even for the right PIN.
3. a wrong PIN: `"Wrong PIN"`. Every wrong PIN counts. When the count of **consecutive** wrong PINs reaches `max_attempts`, the card is blocked and **that attempt** raises `"Card blocked"` instead. A right PIN resets the count.

**Methods**

- `balance(account_id, pin)` returns the account balance.
- `cash_total()` returns the value of all notes in the machine.
- `withdraw(account_id, pin, amount)` returns the notes paid out as a dict `{note: count}` (only notes actually used). After the login checks it raises, in this order:
  1. `"Bad amount"`: `amount` is not a whole number above 0 that is a multiple of the **smallest note value** the machine has (even a note it has run out of);
  2. `"Insufficient funds"`: more than the balance;
  3. `"Cannot dispense"`: the machine cannot pay the amount **greedily**: take as many of the largest note as the amount and the machine's stock allow, then the next, and so on; if something is left over, it cannot dispense, even if another mix of notes would have worked.
  A refused withdrawal changes nothing (except a wrong-PIN count). A successful one reduces the balance and the machine's notes.

**Example**

```
atm = ATM({100: 5, 50: 2, 20: 10, 10: 10}, {"A": {"pin": "1234", "balance": 100000}})
atm.withdraw("A", "1234", 270)     # {100: 2, 50: 1, 20: 1}
```''',
    starter=r'''class ATM:
    def __init__(self, cash, accounts, max_attempts=3):
        """Keep your own copy of both dictionaries."""
        ...

    def balance(self, account_id, pin):
        ...

    def cash_total(self):
        ...

    def withdraw(self, account_id, pin, amount):
        """Return {note: count}, or raise ValueError and change nothing."""
        ...''',
    tests=r'''def error_of(action, *args):
    try:
        action(*args)
    except Exception as error:
        return type(error).__name__ + ": " + str(error)
    return None
accounts = {"A": {"pin": "1234", "balance": 100000}, "B": {"pin": "9999", "balance": 500}}
cash = {100: 5, 50: 2, 20: 10, 10: 10}
atm = ATM(cash, accounts)
assert atm.cash_total() == 900
assert atm.balance("A", "1234") == 100000
assert atm.withdraw("A", "1234", 270) == {100: 2, 50: 1, 20: 1}
assert atm.balance("A", "1234") == 99730
assert atm.cash_total() == 630
assert atm.withdraw("A", "1234", 20) == {20: 1}
assert error_of(atm.withdraw, "A", "1234", 5000) == "ValueError: Cannot dispense"
assert (atm.balance("A", "1234"), atm.cash_total()) == (99710, 610)
assert error_of(atm.withdraw, "A", "1234", 0) == "ValueError: Bad amount"
assert error_of(atm.withdraw, "A", "1234", -10) == "ValueError: Bad amount"
assert error_of(atm.withdraw, "A", "1234", 15) == "ValueError: Bad amount"
assert error_of(atm.withdraw, "A", "1234", 10.0) == "ValueError: Bad amount"
assert error_of(atm.withdraw, "B", "9999", 605) == "ValueError: Bad amount"
assert error_of(atm.withdraw, "B", "9999", 600) == "ValueError: Insufficient funds"
assert error_of(atm.withdraw, "Z", "0000", 10) == "ValueError: Unknown account"
assert error_of(atm.balance, "Z", "0000") == "ValueError: Unknown account"
assert error_of(atm.balance, "B", "0000") == "ValueError: Wrong PIN"
assert error_of(atm.balance, "B", "1111") == "ValueError: Wrong PIN"
assert atm.balance("B", "9999") == 500
assert error_of(atm.balance, "B", "0000") == "ValueError: Wrong PIN"
assert error_of(atm.balance, "B", "0000") == "ValueError: Wrong PIN"
assert atm.balance("B", "9999") == 500
assert error_of(atm.balance, "B", "0000") == "ValueError: Wrong PIN"
assert error_of(atm.balance, "B", "0000") == "ValueError: Wrong PIN"
assert error_of(atm.balance, "B", "0000") == "ValueError: Card blocked"
assert error_of(atm.balance, "B", "9999") == "ValueError: Card blocked"
assert error_of(atm.withdraw, "B", "9999", 10) == "ValueError: Card blocked"
assert atm.balance("A", "1234") == 99710
assert accounts == {"A": {"pin": "1234", "balance": 100000}, "B": {"pin": "9999", "balance": 500}}
assert cash == {100: 5, 50: 2, 20: 10, 10: 10}
tight = ATM({50: 1, 20: 3, 10: 0}, {"A": {"pin": "1", "balance": 1000}})
assert error_of(tight.withdraw, "A", "1", 60) == "ValueError: Cannot dispense"
assert (tight.balance("A", "1"), tight.cash_total()) == (1000, 110)
assert tight.withdraw("A", "1", 40) == {20: 2}
assert tight.withdraw("A", "1", 70) == {50: 1, 20: 1}
assert error_of(tight.withdraw, "A", "1", 10) == "ValueError: Cannot dispense"
assert (tight.balance("A", "1"), tight.cash_total()) == (890, 0)
strict = ATM({10: 5}, {"A": {"pin": "1", "balance": 100}}, max_attempts=2)
assert error_of(strict.balance, "A", "0") == "ValueError: Wrong PIN"
assert error_of(strict.balance, "A", "0") == "ValueError: Card blocked"
assert error_of(strict.balance, "A", "1") == "ValueError: Card blocked"
shared = ATM(cash, accounts)
assert shared.cash_total() == 900
assert shared.withdraw("A", "1234", 100) == {100: 1}
assert shared.cash_total() == 800
assert ATM(cash, accounts).cash_total() == 900''',
    solution=r'''class ATM:
    def __init__(self, cash, accounts, max_attempts=3):
        self._cash = dict(cash)
        self._accounts = {account_id: dict(account) for account_id, account in accounts.items()}
        self._max_attempts = max_attempts
        self._wrong = {}
        self._blocked = set()

    def _login(self, account_id, pin):
        if account_id not in self._accounts:
            raise ValueError("Unknown account")
        if account_id in self._blocked:
            raise ValueError("Card blocked")
        account = self._accounts[account_id]
        if account["pin"] != pin:
            self._wrong[account_id] = self._wrong.get(account_id, 0) + 1
            if self._wrong[account_id] >= self._max_attempts:
                self._blocked.add(account_id)
                raise ValueError("Card blocked")
            raise ValueError("Wrong PIN")
        self._wrong[account_id] = 0
        return account

    def balance(self, account_id, pin):
        return self._login(account_id, pin)["balance"]

    def cash_total(self):
        return sum(note * count for note, count in self._cash.items())

    def withdraw(self, account_id, pin, amount):
        account = self._login(account_id, pin)
        if not isinstance(amount, int) or amount <= 0 or amount % min(self._cash) != 0:
            raise ValueError("Bad amount")
        if amount > account["balance"]:
            raise ValueError("Insufficient funds")
        left = amount
        payout = {}
        for note in sorted(self._cash, reverse=True):
            take = min(left // note, self._cash[note])
            if take:
                payout[note] = take
                left -= take * note
        if left:
            raise ValueError("Cannot dispense")
        for note, count in payout.items():
            self._cash[note] -= count
        account["balance"] -= amount
        return payout''',
    hints=[
        r'''Put the card checks in one helper that both `balance` and `withdraw` call, so the order (unknown, blocked, wrong PIN) is written once. Keep a count of consecutive wrong PINs per account and a set of blocked accounts.''',
        r'''Work out the payout in a **local** dictionary first, walking the notes from largest to smallest and taking `min(left // note, stock)` of each. Only if nothing is left over do you touch the machine's notes and the balance.''',
        r'''Copy both constructor dictionaries (two levels for `accounts`: each account is a dict too), or the first withdrawal will edit the caller's data and a second ATM built from the same dictionaries will start short.''',
    ],
    explanation=r'''**The idea.** An ATM is a small *transaction*: check who you are, check the request, **work out the whole result before changing anything**, then commit. The payout is built in a local dictionary; the machine's notes and the balance are only touched after `left == 0`. A refusal at any step therefore leaves everything as it was.

```mermaid
flowchart TD
    A[withdraw] --> B[1 account known]
    B --> C[2 card not blocked]
    C --> D[3 PIN right]
    D --> E[4 amount valid]
    E --> F[5 funds enough]
    F --> G[6 notes can pay it]
    G --> H[commit: notes, then balance]
```

**Security details worth saying aloud.** The block is checked *before* the PIN, so a blocked card never reveals whether the PIN was right. The wrong-PIN count is per account and counts only *consecutive* mistakes; a correct PIN resets it.

**Greedy is a rule here, and it can fail.** With notes `{50: 1, 20: 3}` and a request for 60, greedy takes the 50 and is stuck with 10 left, though three 20s would work. The statement makes greedy the rule, because for the usual currency notes it is correct and O(number of notes); a dispenser for odd note sets would need a small dynamic-programming search over counts. Knowing *when* greedy is valid (each note a multiple of the next smaller) is the interview point.

**Copy what you are given.** Both dictionaries are copied, two levels deep for `accounts`.

**Complexity.** O(number of note values) per withdrawal.

**Going further.** Real ATMs must not lose a withdrawal if the power fails between "notes dispensed" and "balance reduced". What would you write down first, and what would you do on restart?''',
),

P(
    slug='lld-snake-and-ladder', title='Snake and Ladder', topic='lld-machine-coding', difficulty='intermediate',
    module='lld/14-tic-tac-toe-and-chess/README.md',
    description='Build a Snake and Ladder game whose dice is injected, so every game can be replayed exactly.',
    statement=r'''Write a class `SnakeAndLadder` for a race to the last square.

**Creating one:** `SnakeAndLadder(players, snakes, ladders, dice, size=100)`

- `players` is a list of player names. They take turns in that order. An empty list raises `ValueError("No players")`.
- `snakes` maps a snake's head square to its tail square (the tail is lower); `ladders` maps a ladder's bottom to its top (higher). Squares are numbered `1..size`; everyone starts **off the board at 0**.
- `dice` is a function with no arguments that returns the number rolled. The tests pass a scripted dice, so use `dice()` and never `random`.
- A snake with its tail not below its head raises `ValueError("Bad snake")`; a ladder whose top is not above its bottom raises `ValueError("Bad ladder")`; a square that is both a snake head and a ladder bottom raises `ValueError("Square used twice")`.

**Playing**

- `play_turn()` lets the player whose turn it is roll the dice and returns `(player, roll, start, end)`: the square they were on and the square they finished on.
  - A roll that is not a whole number from 1 to 6 raises `ValueError("Bad roll")` and changes nothing (the same player is still to move).
  - The player moves `roll` squares forward. **If that would pass the last square they do not move** (`end == start`).
  - If they land on a snake head they slide to its tail; on a ladder bottom they climb to its top. At most **one** snake or ladder applies per move (no chains).
  - Whoever finishes **exactly on the last square** wins. Otherwise the turn passes to the next player (also after a roll that did not move).
- `winner` is the winner's name, or `None`. After a win, `play_turn()` raises `ValueError("Game over")`.
- `current` is the player to move; `positions()` returns `{player: square}`.

**Example**

```
rolls = iter([3, 6, 5])
game = SnakeAndLadder(["A", "B"], {14: 4}, {3: 22}, lambda: next(rolls), size=30)
game.play_turn()    # ("A", 3, 0, 22)   a ladder
game.play_turn()    # ("B", 6, 0, 6)
```''',
    starter=r'''class SnakeAndLadder:
    def __init__(self, players, snakes, ladders, dice, size=100):
        """`dice()` returns a roll from 1 to 6."""
        ...

    @property
    def current(self):
        ...

    @property
    def winner(self):
        ...

    def positions(self):
        ...

    def play_turn(self):
        """Roll, move, apply a snake or ladder, and pass the turn: (player, roll, start, end)."""
        ...''',
    tests=r'''def error_of(action, *args):
    try:
        action(*args)
    except Exception as error:
        return type(error).__name__ + ": " + str(error)
    return None
def scripted(*rolls):
    queue = list(rolls)
    return lambda: queue.pop(0)
snakes = {14: 4, 27: 7}
ladders = {3: 22, 8: 12}
game = SnakeAndLadder(["A", "B"], snakes, ladders, scripted(3, 6, 5, 2, 1, 2, 6, 1, 6, 1, 6), size=30)
assert (game.current, game.winner, game.positions()) == ("A", None, {"A": 0, "B": 0})
assert game.play_turn() == ("A", 3, 0, 22)
assert game.current == "B"
assert game.play_turn() == ("B", 6, 0, 6)
assert game.play_turn() == ("A", 5, 22, 7)
assert game.play_turn() == ("B", 2, 6, 12)
assert game.play_turn() == ("A", 1, 7, 12)
assert game.play_turn() == ("B", 2, 12, 4)
assert game.positions() == {"A": 12, "B": 4}
snapshot = game.positions()
snapshot["A"] = 99
assert game.positions() == {"A": 12, "B": 4}
assert game.play_turn() == ("A", 6, 12, 18)
assert game.play_turn() == ("B", 1, 4, 5)
assert game.play_turn() == ("A", 6, 18, 24)
assert game.play_turn() == ("B", 1, 5, 6)
assert game.winner is None
assert game.play_turn() == ("A", 6, 24, 30)
assert game.winner == "A"
assert error_of(game.play_turn) == "ValueError: Game over"
over = SnakeAndLadder(["A", "B"], {}, {}, scripted(6, 2, 3, 2, 3), size=10)
assert over.play_turn() == ("A", 6, 0, 6)
assert over.play_turn() == ("B", 2, 0, 2)
assert over.play_turn() == ("A", 3, 6, 9)
assert over.play_turn() == ("B", 2, 2, 4)
assert over.play_turn() == ("A", 3, 9, 9)
assert (over.current, over.winner) == ("B", None)
chain = SnakeAndLadder(["A"], {20: 3}, {3: 20}, scripted(3, 3), size=30)
assert chain.play_turn() == ("A", 3, 0, 20)
assert chain.play_turn() == ("A", 3, 20, 23)
slide = SnakeAndLadder(["A"], {5: 2}, {}, scripted(5, 2), size=30)
assert slide.play_turn() == ("A", 5, 0, 2)
assert slide.play_turn() == ("A", 2, 2, 4)
bad = SnakeAndLadder(["A", "B"], {}, {}, scripted(7, 0, 2.5, 4, 5), size=30)
assert error_of(bad.play_turn) == "ValueError: Bad roll"
assert error_of(bad.play_turn) == "ValueError: Bad roll"
assert error_of(bad.play_turn) == "ValueError: Bad roll"
assert bad.current == "A"
assert bad.play_turn() == ("A", 4, 0, 4)
assert bad.play_turn() == ("B", 5, 0, 5)
assert error_of(SnakeAndLadder, [], {}, {}, scripted()) == "ValueError: No players"
assert error_of(SnakeAndLadder, ["A"], {4: 9}, {}, scripted()) == "ValueError: Bad snake"
assert error_of(SnakeAndLadder, ["A"], {4: 4}, {}, scripted()) == "ValueError: Bad snake"
assert error_of(SnakeAndLadder, ["A"], {}, {9: 4}, scripted()) == "ValueError: Bad ladder"
assert error_of(SnakeAndLadder, ["A"], {8: 2}, {8: 20}, scripted()) == "ValueError: Square used twice"
solo = SnakeAndLadder(["Only"], {}, {}, scripted(6, 6), size=12)
assert solo.play_turn() == ("Only", 6, 0, 6)
assert solo.play_turn() == ("Only", 6, 6, 12)
assert solo.winner == "Only"''',
    solution=r'''class SnakeAndLadder:
    def __init__(self, players, snakes, ladders, dice, size=100):
        if not players:
            raise ValueError("No players")
        for head, tail in snakes.items():
            if tail >= head:
                raise ValueError("Bad snake")
        for bottom, top in ladders.items():
            if top <= bottom:
                raise ValueError("Bad ladder")
        if set(snakes) & set(ladders):
            raise ValueError("Square used twice")
        self._players = list(players)
        self._snakes = dict(snakes)
        self._ladders = dict(ladders)
        self._dice = dice
        self._size = size
        self._square = {player: 0 for player in self._players}
        self._turn = 0
        self._winner = None

    @property
    def current(self):
        return self._players[self._turn]

    @property
    def winner(self):
        return self._winner

    def positions(self):
        return dict(self._square)

    def play_turn(self):
        if self._winner is not None:
            raise ValueError("Game over")
        roll = self._dice()
        if not isinstance(roll, int) or isinstance(roll, bool) or not 1 <= roll <= 6:
            raise ValueError("Bad roll")
        player = self._players[self._turn]
        start = self._square[player]
        end = start + roll
        if end > self._size:
            end = start
        elif end in self._snakes:
            end = self._snakes[end]
        elif end in self._ladders:
            end = self._ladders[end]
        self._square[player] = end
        if end == self._size:
            self._winner = player
        else:
            self._turn = (self._turn + 1) % len(self._players)
        return (player, roll, start, end)''',
    hints=[
        r'''Keep each player's square in a dictionary and the index of whose turn it is. The dice is just a function you call once per turn: that is what lets a test replay a game exactly.''',
        r'''Apply the roll in this order: add it, undo the move if it passes the last square, then look the landing square up in the snakes and then the ladders (one lookup each, **no loop**: chains are not part of the rules).''',
        r'''Validate the roll *before* you change anything, so a bad roll leaves the same player to move. Pass the turn on after every move that did not win, including a move that did not happen because the roll was too big.''',
    ],
    explanation=r'''**The idea.** Games are simple state machines: some state (positions, whose turn, winner) and one `play_turn` that moves it forward. What makes this a *design* problem is the **injected dice**. If `play_turn` called `random.randint` itself, no two runs would match and the game could not be tested. By taking `dice` as an argument, the same class plays a real game (`dice=lambda: random.randint(1, 6)`) and a scripted one (`dice=scripted(3, 6, 5)`) with no change.

```mermaid
stateDiagram-v2
    [*] --> InPlay
    InPlay --> InPlay: play_turn (move, snake or ladder, next player)
    InPlay --> Over: lands exactly on the last square
    Over --> Over: play_turn raises Game over
```

**Rules that need a decision.** The statement settles each of them: overshooting means "stay put", the turn still passes, and snakes/ladders do not chain. Without the last rule a ladder ending on a snake's head and that snake ending on the ladder's foot would loop forever; stating "one jump per move" removes the need to detect cycles. When a requirement is ambiguous, in an interview too, the best move is to pick a simple rule and say it out loud.

**Validate, then change.** The roll is checked before any state moves. A bad roll is the caller's mistake and must not cost the player their turn.

**Complexity.** O(1) per turn.

**Going further.** Many versions give a bonus turn for a 6, or need an exact roll to finish. Where would each change go, and which of them would make the "turn passes" line conditional?''',
),

P(
    slug='lld-elevator-scan', title='Elevator Controller (SCAN)', topic='lld-machine-coding', difficulty='advanced',
    module='lld/12-parking-lot-and-elevator/README.md',
    description='Build a one-car elevator that serves requests in sweeps (the SCAN algorithm) one step at a time.',
    statement=r'''Write a class `Elevator` for one car in a building, simulated **one step at a time**.

**Creating one:** `Elevator(floors)` for floors `0` to `floors - 1`. The car starts at floor `0`, **idle**, with no requests. `floors` below 2 raises `ValueError("Need at least two floors")`.

**State**

- `floor`: the car's current floor.
- `direction`: `"up"`, `"down"` or `"idle"`.
- `pending`: the requested floors, as a **sorted list** with no repeats.

**Methods**

- `request(floor)` asks the car to stop at a floor. Requesting a floor twice is the same as once. A floor that is not a whole number from `0` to `floors - 1` raises `ValueError("No such floor")`.
- `step()` advances time by one tick and returns one of three events:
  1. If the **current floor is requested**: remove it and return `("open", floor)`. If nothing is pending any more the direction becomes `"idle"`.
  2. Else if **nothing is pending**: the direction is `"idle"`; return `("idle", floor)`.
  3. Else the car **moves one floor** and returns `("move", new_floor)`. Which way?
     - While going **up** it keeps going up as long as some pending floor is above it; if none is, it turns **down**. Going **down** is the mirror image.
     - When **idle** it heads for the **nearest** pending floor (a tie goes **up**).

  This is the **SCAN** rule: finish the sweep in the current direction before turning round, instead of chasing whichever request is closest.

**Example**

```
lift = Elevator(10)
for f in (5, 2, 8):
    lift.request(f)
[lift.step() for _ in range(5)]
# [("move", 1), ("move", 2), ("open", 2), ("move", 3), ("move", 4)]
```''',
    starter=r'''class Elevator:
    def __init__(self, floors):
        ...

    @property
    def pending(self):
        """The requested floors, sorted, without repeats."""
        ...

    def request(self, floor):
        ...

    def step(self):
        """One tick: ("open", floor), ("idle", floor) or ("move", new_floor)."""
        ...

    # also the attributes `floor` and `direction`''',
    tests=r'''def error_of(action, *args):
    try:
        action(*args)
    except Exception as error:
        return type(error).__name__ + ": " + str(error)
    return None
def run(lift, steps):
    return [lift.step() for _ in range(steps)]
lift = Elevator(10)
assert (lift.floor, lift.direction, lift.pending) == (0, "idle", [])
assert lift.step() == ("idle", 0)
for f in (5, 2, 8, 5):
    lift.request(f)
assert lift.pending == [2, 5, 8]
assert run(lift, 12) == [("move", 1), ("move", 2), ("open", 2), ("move", 3), ("move", 4), ("move", 5), ("open", 5), ("move", 6), ("move", 7), ("move", 8), ("open", 8), ("idle", 8)]
assert (lift.floor, lift.direction, lift.pending) == (8, "idle", [])
sweep = Elevator(10)
sweep.request(6)
assert run(sweep, 3) == [("move", 1), ("move", 2), ("move", 3)]
assert sweep.direction == "up"
sweep.request(1)
sweep.request(8)
assert run(sweep, 3) == [("move", 4), ("move", 5), ("move", 6)]
assert sweep.step() == ("open", 6)
assert run(sweep, 2) == [("move", 7), ("move", 8)]
assert sweep.step() == ("open", 8)
assert sweep.direction == "up"
assert run(sweep, 8) == [("move", 7), ("move", 6), ("move", 5), ("move", 4), ("move", 3), ("move", 2), ("move", 1), ("open", 1)]
assert (sweep.floor, sweep.direction) == (1, "idle")
tie = Elevator(10)
tie.request(5)
run(tie, 5)
tie.step()
assert (tie.floor, tie.direction) == (5, "idle")
tie.request(3)
tie.request(7)
assert run(tie, 4) == [("move", 6), ("move", 7), ("open", 7), ("move", 6)]
assert tie.direction == "down"
assert run(tie, 4) == [("move", 5), ("move", 4), ("move", 3), ("open", 3)]
here = Elevator(5)
here.request(0)
assert here.step() == ("open", 0)
assert (here.direction, here.pending) == ("idle", [])
assert here.step() == ("idle", 0)
down = Elevator(10)
down.request(9)
run(down, 10)
assert down.floor == 9
down.request(4)
down.request(6)
assert run(down, 5) == [("move", 8), ("move", 7), ("move", 6), ("open", 6), ("move", 5)]
assert down.direction == "down"
assert run(down, 2) == [("move", 4), ("open", 4)]
for bad in (-1, 10, 3.5, "3", None):
    assert error_of(Elevator(10).request, bad) == "ValueError: No such floor"
assert error_of(Elevator, 1) == "ValueError: Need at least two floors"
behind = Elevator(10)
behind.request(3)
run(behind, 3)
behind.request(3)
assert behind.step() == ("open", 3)
twice = Elevator(6)
twice.request(2)
twice.request(2)
assert run(twice, 4) == [("move", 1), ("move", 2), ("open", 2), ("idle", 2)]
opened = Elevator(10)
opened.request(1)
opened.request(9)
assert run(opened, 3) == [("move", 1), ("open", 1), ("move", 2)]
assert opened.direction == "up"''',
    solution=r'''class Elevator:
    def __init__(self, floors):
        if floors < 2:
            raise ValueError("Need at least two floors")
        self._floors = floors
        self.floor = 0
        self.direction = "idle"
        self._pending = set()

    @property
    def pending(self):
        return sorted(self._pending)

    def request(self, floor):
        if not isinstance(floor, int) or isinstance(floor, bool) or not 0 <= floor < self._floors:
            raise ValueError("No such floor")
        self._pending.add(floor)

    def step(self):
        if self.floor in self._pending:
            self._pending.discard(self.floor)
            if not self._pending:
                self.direction = "idle"
            return ("open", self.floor)
        if not self._pending:
            self.direction = "idle"
            return ("idle", self.floor)
        above = any(f > self.floor for f in self._pending)
        below = any(f < self.floor for f in self._pending)
        if self.direction == "up" and above:
            pass
        elif self.direction == "down" and below:
            pass
        elif self.direction == "up":
            self.direction = "down"
        elif self.direction == "down":
            self.direction = "up"
        else:
            nearest = min(self._pending, key=lambda f: (abs(f - self.floor), f < self.floor))
            self.direction = "up" if nearest > self.floor else "down"
        self.floor += 1 if self.direction == "up" else -1
        return ("move", self.floor)''',
    hints=[
        r'''Keep the requests in a set (repeats vanish) and the direction as a plain string. `step()` is a short decision list: open the doors if this floor is requested, idle if nothing is, otherwise choose a direction and move one floor.''',
        r'''SCAN means the direction is *sticky*: keep going the same way while any request is ahead of you, and only turn round when nothing is. Ask "is there a pending floor above me?" and "below me?" separately; never pick the globally nearest request while you are moving.''',
        r'''Only an **idle** car picks a direction from scratch: toward the nearest pending floor, with ties going up. Remember that after the last stop is served, the direction becomes idle.''',
    ],
    explanation=r'''**The idea.** The **SCAN** algorithm ("the elevator algorithm", the same one disk schedulers use) serves requests in sweeps: go in one direction, stopping at every requested floor on the way, and only turn round when nothing is left ahead. It is fair and never starves a far floor, unlike *nearest request first*, which can bounce the car around the middle while the top floor waits.

```mermaid
stateDiagram-v2
    [*] --> idle
    idle --> up: nearest request is above (or a tie)
    idle --> down: nearest request is below
    up --> up: a pending floor is above
    up --> down: nothing above, something below
    down --> down: a pending floor is below
    down --> up: nothing below, something above
    up --> idle: last stop served
    down --> idle: last stop served
```

**Simulation as a design tool.** `step()` makes time explicit: one call is one tick, and the tests can replay any scenario deterministically. The same shape (state, a `request` that records intent, a `step` that advances the world) is how you would test any scheduler without sleeping or threads.

**The scenario that proves SCAN.** A request for floor 1 arrives while the car is going up past floor 3. A nearest-first car turns back at once; the SCAN car finishes its sweep (6 and 8) and only then comes down. The test pins that order.

**Edge cases the tests cover:** requesting the floor you are on, the same floor twice, a request made behind the car while it is moving, a tie when idle, and `True`/floats/strings as floors.

**Complexity.** O(pending) per step with a set; with two heaps (one for floors above, one below) it would be O(log n).

**Going further.** Real buildings have many cars and requests with a direction (an "up" button on floor 4). What does a request become, and who decides which car answers it?''',
),

P(
    slug='lld-task-scheduler', title='Task Scheduler', topic='lld-machine-coding', difficulty='intermediate',
    module='lld/18-lru-lfu-cache-and-rate-limiter/README.md',
    description='Build a scheduler with one-off and repeating tasks, priorities and an injected clock.',
    statement=r'''Write a class `Scheduler` that remembers tasks and says which are due. It does not run anything itself: it hands back the **names** of the tasks that should run now.

**Creating one:** `Scheduler(clock)` where `clock()` returns the current time as a number. Use `clock()` and nothing else for the time.

**Methods**

- `add(name, run_at, priority=0)` schedules a one-off task and returns its **task id** (`1, 2, 3, ...`, shared with `every`).
- `every(name, interval, start, priority=0)` schedules a repeating task that first runs at `start` and then every `interval` after that. `interval` must be above 0 or `ValueError("Bad interval")` is raised (and no id is used). Returns its task id.
- `pop_due()` looks at `clock()` and returns the names of every task whose time is **at or before now**, in this order: earliest `run_at` first; then **higher** `priority` first; then lower task id first.
  - A one-off task is removed once returned.
  - A repeating task is returned **once**, even if several intervals were missed, and is rescheduled to the first time of the form `run_at + k * interval` that is **after now**.
- `cancel(task_id)` removes a task and returns `True`, or `False` when there is no such task.
- `next_run()` returns the earliest scheduled time, or `None` when there are no tasks.
- `len(scheduler)` is how many tasks are scheduled.

**Example**

```
now = [0]
s = Scheduler(lambda: now[0])
s.every("tick", 10, start=5)
now[0] = 7
s.pop_due()          # ["tick"]      next run is 15
```''',
    starter=r'''class Scheduler:
    def __init__(self, clock):
        ...

    def add(self, name, run_at, priority=0):
        ...

    def every(self, name, interval, start, priority=0):
        ...

    def pop_due(self):
        """Names of the tasks due now, in order; one-offs are removed, repeating tasks are rescheduled."""
        ...

    def cancel(self, task_id):
        ...

    def next_run(self):
        ...

    def __len__(self):
        ...''',
    tests=r'''def error_of(action, *args):
    try:
        action(*args)
    except Exception as error:
        return type(error).__name__ + ": " + str(error)
    return None
now = [0]
def at(scheduler, t):
    """Set the clock to t and ask which tasks are due."""
    now[0] = t
    return scheduler.pop_due()
s = Scheduler(lambda: now[0])
assert (len(s), s.next_run(), s.pop_due()) == (0, None, [])
assert s.add("later", 20) == 1
assert s.add("soon", 5) == 2
assert s.add("soon-low", 5, priority=-1) == 3
assert s.add("soon-high", 5, priority=9) == 4
assert s.add("soon-again", 5) == 5
assert (len(s), s.next_run()) == (5, 5)
assert s.pop_due() == []
assert at(s, 5) == ["soon-high", "soon", "soon-again", "soon-low"]
assert (len(s), s.next_run()) == (1, 20)
assert s.pop_due() == []
assert at(s, 100) == ["later"]
assert (len(s), s.next_run()) == (0, None)
tick = Scheduler(lambda: now[0])
now[0] = 0
assert tick.every("tick", 10, start=5) == 1
assert tick.next_run() == 5
assert tick.pop_due() == []
assert at(tick, 5) == ["tick"]
assert tick.next_run() == 15
assert at(tick, 14) == []
assert at(tick, 17) == ["tick"]
assert tick.next_run() == 25
assert at(tick, 100) == ["tick"]
assert tick.next_run() == 105
assert tick.pop_due() == []
assert len(tick) == 1
mixed = Scheduler(lambda: now[0])
now[0] = 0
assert mixed.add("once", 10) == 1
assert mixed.every("repeat", 10, start=10) == 2
assert mixed.every("early", 3, start=1, priority=5) == 3
assert at(mixed, 10) == ["early", "once", "repeat"]
assert mixed.next_run() == 13
assert len(mixed) == 2
assert mixed.cancel(3) is True
assert mixed.cancel(3) is False
assert mixed.cancel(99) is False
assert mixed.next_run() == 20
assert at(mixed, 20) == ["repeat"]
assert mixed.cancel(2) is True
assert (len(mixed), mixed.next_run()) == (0, None)
ties = Scheduler(lambda: now[0])
now[0] = 0
ties.add("b-first", 1)
ties.add("a-second", 1)
assert at(ties, 1) == ["b-first", "a-second"]
past = Scheduler(lambda: now[0])
now[0] = 50
past.add("overdue", 10)
past.add("overdue-too", 10)
assert past.pop_due() == ["overdue", "overdue-too"]
assert error_of(past.every, "bad", 0, 1) == "ValueError: Bad interval"
assert error_of(past.every, "bad", -5, 1) == "ValueError: Bad interval"
assert past.add("next", 60) == 3
frac = Scheduler(lambda: now[0])
now[0] = 0
frac.every("half", 0.5, start=0)
assert at(frac, 0.75) == ["half"]
assert frac.next_run() == 1.0
many = Scheduler(lambda: now[0])
now[0] = 0
for i in range(2000):
    many.add("t%d" % i, i % 50)
now[0] = 49
due = many.pop_due()
assert len(due) == 2000 and due[0] == "t0" and due[-1] == "t1999"
assert len(many) == 0''',
    solution=r'''class Scheduler:
    def __init__(self, clock):
        self._clock = clock
        self._tasks = {}
        self._next_id = 1

    def _add(self, name, run_at, priority, interval):
        task_id = self._next_id
        self._next_id += 1
        self._tasks[task_id] = [name, run_at, priority, interval]
        return task_id

    def add(self, name, run_at, priority=0):
        return self._add(name, run_at, priority, None)

    def every(self, name, interval, start, priority=0):
        if interval <= 0:
            raise ValueError("Bad interval")
        return self._add(name, start, priority, interval)

    def pop_due(self):
        now = self._clock()
        due = [task_id for task_id, task in self._tasks.items() if task[1] <= now]
        due.sort(key=lambda task_id: (self._tasks[task_id][1], -self._tasks[task_id][2], task_id))
        names = []
        for task_id in due:
            name, run_at, _, interval = self._tasks[task_id]
            names.append(name)
            if interval is None:
                del self._tasks[task_id]
            else:
                missed = int((now - run_at) // interval) + 1
                self._tasks[task_id][1] = run_at + missed * interval
        return names

    def cancel(self, task_id):
        return self._tasks.pop(task_id, None) is not None

    def next_run(self):
        return min((task[1] for task in self._tasks.values()), default=None)

    def __len__(self):
        return len(self._tasks)''',
    hints=[
        r'''Store each task as `[name, run_at, priority, interval]` under its id; `interval` is `None` for a one-off. Ids come from one counter shared by both kinds of task, and a bad `interval` must be rejected **before** an id is taken.''',
        r'''`pop_due` sorts the due tasks with the key `(run_at, -priority, id)`: earliest first, then higher priority, then the older task. Compute `now = clock()` once, so every task in one call is judged by the same time.''',
        r'''For a repeating task, count how many intervals have passed since `run_at` (`(now - run_at) // interval + 1`) and add that many: the next time is always `run_at + k * interval`, which keeps the original rhythm instead of drifting from `now`.''',
    ],
    explanation=r'''**The idea.** A scheduler is a *priority queue keyed by time*. This one does not run anything: it answers "what is due?" and leaves the running to the caller. That separation (decide vs. do) keeps it deterministic and testable, and it is the shape of cron, Celery beat and every game loop.

```mermaid
classDiagram
    class Scheduler {
        +add() id
        +every() id
        +pop_due() names
        +cancel() bool
        +next_run()
    }
    class Task {
        name
        run_at
        priority
        interval
    }
    Scheduler "1" o-- "*" Task
```

**Inject the clock.** `clock` is a constructor argument, exactly like the parking lot's. The tests move `now[0]` by hand to 5, 14, 17 and 100, which would take real minutes with `time.time()` and be flaky besides.

**Drift is the classic repeating-task bug.** Rescheduling a task `interval` after *now* makes it run later every time it is late (5, then 17 + 10 = 27, ...). Rescheduling from the *planned* time keeps the rhythm: 5, 15, 25 ... The test at `now = 17` pins that.

**Catching up.** If the process was paused for an hour, should a repeating task run 360 times? This design says once and skips ahead to the next future slot. Other systems replay every missed run; the point is to choose and document.

**Ordering is a contract.** Earliest time, then higher priority, then lower id gives a total order, so two tasks can never swap places between runs.

**Complexity.** `pop_due` is O(n log n) here because it sorts the due tasks; a binary heap would make each pop O(log n) and `next_run` O(1).

**Going further.** With a heap, `cancel` is awkward (you cannot remove from the middle). The usual answer is *lazy deletion*: mark the task cancelled and skip it when it reaches the top. What does that do to `len(scheduler)`?''',
),

P(
    slug='lld-logger-framework', title='Logger Framework', topic='lld-patterns-in-use', difficulty='advanced',
    module='lld/09-behavioral-patterns-ii/README.md',
    description='Build a logging framework with levels, child loggers that propagate to their parents and handlers you can plug in.',
    statement=r'''Write a small logging framework: a `Logger` class and two handlers.

**Levels**, lowest to highest: `"DEBUG"`, `"INFO"`, `"WARNING"`, `"ERROR"`.

**A handler** is any object with a method `emit(record)`. A **record** is a dict

```
{"level": "INFO", "logger": "app.db", "message": "connected", "fields": {"host": "x"}}
```

**The two handlers you write**

- `ListHandler()` keeps every record it receives in its `records` list.
- `FormattingHandler(formatter, sink)` calls `sink(formatter(record))` for each record (`formatter` turns a record into a string; `sink` takes a string).

**`Logger(name, level="INFO", parent=None)`**

- `debug(message, **fields)`, `info(...)`, `warning(...)` and `error(...)` log at that level. A message **below the logger's effective level** is dropped.
- `add_handler(handler)` attaches a handler to this logger.
- `set_level(level)` changes the level; a level that is not one of the four names raises `ValueError("Bad level")`. `set_level(None)` means "inherit".
- `effective_level` is the level name that applies: this logger's own, or else its parent's, and so on up to the first logger that has one.
- `child(name)` returns the child logger called `"<this name>.<name>"` whose parent is this logger. It has **no level of its own** (it inherits, and follows later changes of its parent), and asking for the same child name again returns the **same object**.

**Delivering a record.** After the level check (made on the logger the call was made on, and only there), the record goes to that logger's handlers and then to the handlers of **every ancestor**, nearest first. Each handler receives **its own copy** of the record (changing it does not affect the next handler), and a handler that **raises** an exception must not stop the others: swallow it and carry on.

**Your `Logger` is tested with handlers you have never seen.** The tests write their own classes with an `emit(record)` method and attach them.

**Example**

```
app = Logger("app")
mem = ListHandler()
app.add_handler(mem)
app.child("db").info("connected", host="x")
mem.records[0]["logger"]      # "app.db"
```''',
    starter=r'''class ListHandler:
    def __init__(self):
        ...

    def emit(self, record):
        ...


class FormattingHandler:
    def __init__(self, formatter, sink):
        ...

    def emit(self, record):
        ...


class Logger:
    def __init__(self, name, level="INFO", parent=None):
        ...

    @property
    def effective_level(self):
        ...

    def set_level(self, level):
        ...

    def add_handler(self, handler):
        ...

    def child(self, name):
        ...

    def debug(self, message, **fields):
        ...

    def info(self, message, **fields):
        ...

    def warning(self, message, **fields):
        ...

    def error(self, message, **fields):
        ...''',
    tests=r'''def error_of(action, *args):
    try:
        action(*args)
    except Exception as error:
        return type(error).__name__ + ": " + str(error)
    return None
app = Logger("app")
mem = ListHandler()
app.add_handler(mem)
assert (app.name, app.effective_level) == ("app", "INFO")
app.debug("hidden")
app.info("hello", user="asha", n=2)
app.warning("careful")
app.error("boom")
assert [r["level"] for r in mem.records] == ["INFO", "WARNING", "ERROR"]
assert mem.records[0] == {"level": "INFO", "logger": "app", "message": "hello", "fields": {"user": "asha", "n": 2}}
assert mem.records[1]["fields"] == {}
app.set_level("DEBUG")
app.debug("now visible")
assert mem.records[-1]["level"] == "DEBUG"
app.set_level("ERROR")
app.warning("dropped")
assert len(mem.records) == 4
assert error_of(app.set_level, "LOUD") == "ValueError: Bad level"
assert app.effective_level == "ERROR"
app.set_level("INFO")
db = app.child("db")
assert db.name == "app.db"
assert app.child("db") is db
assert db.effective_level == "INFO"
db.info("connected", host="x")
assert mem.records[-1] == {"level": "INFO", "logger": "app.db", "message": "connected", "fields": {"host": "x"}}
pool = db.child("pool")
assert pool.name == "app.db.pool"
app.set_level("ERROR")
assert (db.effective_level, pool.effective_level) == ("ERROR", "ERROR")
before = len(mem.records)
pool.info("quiet")
db.warning("quiet")
assert len(mem.records) == before
pool.set_level("DEBUG")
assert (db.effective_level, pool.effective_level) == ("ERROR", "DEBUG")
pool.debug("from the pool")
assert mem.records[-1]["logger"] == "app.db.pool"
assert len(mem.records) == before + 1
pool.set_level(None)
assert pool.effective_level == "ERROR"
app.set_level("INFO")
own = ListHandler()
db.add_handler(own)
db.info("both")
assert [r["message"] for r in own.records] == ["both"]
assert mem.records[-1]["message"] == "both"
app.info("only parent")
assert [r["message"] for r in own.records] == ["both"]
lines = []
fmt = Logger("svc")
fmt.add_handler(FormattingHandler(lambda r: r["level"] + ":" + r["message"], lines.append))
fmt.info("up")
fmt.debug("no")
fmt.error("down")
assert lines == ["INFO:up", "ERROR:down"]
class Counter:
    def __init__(self):
        self.count = 0
    def emit(self, record):
        self.count += 1
counter = Counter()
custom = Logger("custom")
custom.add_handler(counter)
custom.info("a")
custom.child("x").info("b")
custom.child("x").debug("c")
assert counter.count == 2
class Broken:
    def emit(self, record):
        raise RuntimeError("disk full")
resilient = Logger("r")
good = ListHandler()
resilient.add_handler(Broken())
resilient.add_handler(good)
resilient.info("still delivered")
assert [r["message"] for r in good.records] == ["still delivered"]
class Vandal:
    def emit(self, record):
        record["message"] = "vandalised"
        record["fields"]["x"] = 1
safe = Logger("s")
after = ListHandler()
safe.add_handler(Vandal())
safe.add_handler(after)
safe.info("clean", y=2)
assert after.records[0]["message"] == "clean"
assert after.records[0]["fields"] == {"y": 2}
top = Logger("top", level="ERROR")
below = top.child("below")
below.set_level("DEBUG")
seen = ListHandler()
top.add_handler(seen)
below.debug("child level decides")
assert [r["message"] for r in seen.records] == ["child level decides"]
assert Logger("solo", level="WARNING").effective_level == "WARNING"''',
    solution=r'''LEVELS = {"DEBUG": 10, "INFO": 20, "WARNING": 30, "ERROR": 40}


class ListHandler:
    def __init__(self):
        self.records = []

    def emit(self, record):
        self.records.append(record)


class FormattingHandler:
    def __init__(self, formatter, sink):
        self.formatter = formatter
        self.sink = sink

    def emit(self, record):
        self.sink(self.formatter(record))


class Logger:
    def __init__(self, name, level="INFO", parent=None):
        self.name = name
        self._parent = parent
        self._handlers = []
        self._children = {}
        self._level = None
        self.set_level(level)

    def set_level(self, level):
        if level is not None and level not in LEVELS:
            raise ValueError("Bad level")
        self._level = level

    @property
    def effective_level(self):
        logger = self
        while logger._level is None and logger._parent is not None:
            logger = logger._parent
        return logger._level or "INFO"

    def add_handler(self, handler):
        self._handlers.append(handler)

    def child(self, name):
        if name not in self._children:
            self._children[name] = Logger(f"{self.name}.{name}", level=None, parent=self)
        return self._children[name]

    def _log(self, level, message, fields):
        if LEVELS[level] < LEVELS[self.effective_level]:
            return
        logger = self
        while logger is not None:
            for handler in list(logger._handlers):
                record = {"level": level, "logger": self.name, "message": message, "fields": dict(fields)}
                try:
                    handler.emit(record)
                except Exception:
                    pass
            logger = logger._parent

    def debug(self, message, **fields):
        self._log("DEBUG", message, fields)

    def info(self, message, **fields):
        self._log("INFO", message, fields)

    def warning(self, message, **fields):
        self._log("WARNING", message, fields)

    def error(self, message, **fields):
        self._log("ERROR", message, fields)''',
    hints=[
        r'''A logger has a name, an optional own level, an optional parent and a list of handlers. `effective_level` walks up the parents until it finds a logger with a level of its own, so a child follows later changes of its parent automatically (do not copy the level when you create the child).''',
        r'''Delivering is a loop: for this logger and then each ancestor, hand every handler a **new** record dict (with a copied `fields`). Wrap each `emit` in `try/except Exception` so one broken handler cannot silence the rest.''',
        r'''Check the level only once, on the logger the call was made on: the ancestors' levels are not consulted, only their handlers are used. Cache children in a dictionary so `child("db")` returns the same object every time.''',
    ],
    explanation=r'''**The idea.** This is the shape of Python's own `logging`, Log4j and every other logging library: **loggers** form a tree (by dotted name), **handlers** do the output, and a record travels from a logger up through its ancestors. Splitting *what to say* (the logger and its level) from *where it goes* (handlers) is the **Observer** pattern: a logger announces a record and any number of handlers, which it knows only as "has `emit`", receive it.

```mermaid
classDiagram
    class Logger {
        +name
        +effective_level
        +child() Logger
        +add_handler()
        +info()
    }
    class Handler {
        <<interface>>
        +emit()
    }
    Logger "1" o-- "*" Handler
    Logger --> Logger : parent
    Handler <|.. ListHandler
    Handler <|.. FormattingHandler
    Handler <|.. YourFileHandler
```

**Three rules that make it robust.**

1. **A failing handler must not hurt the application.** Logging is the last place a program should crash from. The `try/except` per handler also keeps one bad sink from silencing the others.
2. **Each handler gets its own copy.** A handler that edits the record (the `Vandal` in the tests) would otherwise corrupt what the next handler sees. Copy what you hand to code you do not control.
3. **Levels inherit dynamically.** A child with no level of its own reads its parent's at log time, so `app.set_level("ERROR")` quiets the whole subtree in one call. Copying the level when the child is made would freeze it.

**The subtle bit.** The level filter is applied once, at the logger you called. The ancestors' *levels* are not consulted, only their handlers, which is why a child set to `DEBUG` under an `ERROR` parent still delivers its debug record to the parent's handler (the last test). That is how Python's `logging` behaves too.

**Extension.** The tests plug in `Counter`, `Broken` and `Vandal`, classes you have never seen: only the `emit` interface is used.

**Complexity.** O(depth of the tree + handlers) per message.

**Going further.** Real frameworks also let a *handler* have its own minimum level and a *filter* that can drop records. Where would those go, and would they change `Logger`?''',
),
]
