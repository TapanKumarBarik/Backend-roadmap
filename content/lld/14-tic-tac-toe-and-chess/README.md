# Module 14: Tic-Tac-Toe & Chess

## Why this matters

Two more classic LLD interview problems, and another deliberate
contrast like module 13's. **Tic-Tac-Toe** is small enough that its win
condition genuinely benefits from being pulled out as a `WinningStrategy`
(module 08) — a tiny, swappable rule instead of logic buried in `Board`
or `Game`. **Chess** is the module where plain polymorphism, not a GOF
pattern, does the heavy lifting: each piece type's `validMoves()`
implements wildly different movement rules, and the *lack* of a shared
pattern name is itself the lesson — sometimes "one interface, many
implementations" (module 02's abstraction + polymorphism) is the whole
answer, no named pattern required. Chess is also where naming
simplifications out loud (module 11, step 1) matters most: no engine
answers "did you implement check, castling, and en passant?" by
accident — you scope those out on purpose and say so.

---

## Problem 1: Tic-Tac-Toe

### Requirements

**Functional**: two players alternate placing their symbol on an N×N
board (3×3 by default); a player wins by owning every cell of a
complete row, column, or diagonal; the game ends in a draw if the board
fills with no winner.

**Non-functional**: win-checking must be swappable without touching
`Game` or `Board` — a variant board size or win-length requirement
should be a new strategy, not a rewrite (DIP, module 04; Strategy,
module 08).

**Assumptions stated up front** (module 11, step 1): exactly two
players; board size is fixed at construction; `Board` only enforces
bounds and cell-emptiness — it has no idea what "winning" means, that
knowledge lives entirely in `WinningStrategy`.

### Entities and relationships

Applying module 11's steps 3–4: `Game o-- Board` (composition — one
game owns exactly one board); `Game --> Player` (association, two,
ordered by turn); `Game --> WinningStrategy` (association, injected —
DIP, module 04); `LineWinStrategy ..|> WinningStrategy` (realizes —
Strategy, module 08).

### Class diagram

```
┌───────────────┐        ┌────────────┐
│      Game     │  o──   │   Board    │
├───────────────┤        ├────────────┤
│ - board       │        │ - grid     │
│ - players     │        │ - size     │
│ - winStrategy │        ├────────────┤
│ - turnIndex   │        │ + place()  │
│ - winner      │        │ + isFull() │
├───────────────┤        └────────────┘
│ + playTurn()  │
└───────────────┘

Game --> Player   (two, turn order by index)
WinningStrategy (interface) <── LineWinStrategy   (Strategy, module 08)
```

### Implementation

{{tabs}}
{{tab Python}}
```python
from abc import ABC, abstractmethod
from enum import Enum

class Symbol(Enum):
    X = "X"
    O = "O"
    EMPTY = "-"

class Board:
    def __init__(self, size=3):
        self.size = size
        self.grid = [[Symbol.EMPTY for _ in range(size)] for _ in range(size)]

    def place(self, row: int, col: int, symbol: Symbol) -> bool:
        if not (0 <= row < self.size and 0 <= col < self.size):
            return False
        if self.grid[row][col] != Symbol.EMPTY:
            return False
        self.grid[row][col] = symbol
        return True

    def is_full(self) -> bool:
        return all(cell != Symbol.EMPTY for row in self.grid for cell in row)

class WinningStrategy(ABC):                    # Strategy, module 08
    @abstractmethod
    def check_winner(self, board: Board) -> "Symbol | None": ...

class LineWinStrategy(WinningStrategy):
    def check_winner(self, board):
        lines = []
        lines.extend(board.grid)                                       # rows
        lines.extend([list(col) for col in zip(*board.grid)])           # columns
        lines.append([board.grid[i][i] for i in range(board.size)])     # main diagonal
        lines.append([board.grid[i][board.size - 1 - i] for i in range(board.size)])  # anti-diagonal

        for line in lines:
            if line[0] != Symbol.EMPTY and all(cell == line[0] for cell in line):
                return line[0]
        return None

class Player:
    def __init__(self, name: str, symbol: Symbol):
        self.name = name
        self.symbol = symbol

class Game:
    def __init__(self, players: list[Player], win_strategy: WinningStrategy, size=3):
        self.board = Board(size)
        self.players = players
        self.win_strategy = win_strategy
        self.turn_index = 0
        self.winner: "Player | None" = None

    def play_turn(self, row: int, col: int) -> bool:
        if self.winner is not None or self.board.is_full():
            return False
        player = self.players[self.turn_index]
        if not self.board.place(row, col, player.symbol):
            return False

        winning_symbol = self.win_strategy.check_winner(self.board)
        if winning_symbol is not None:
            self.winner = player
        else:
            self.turn_index = (self.turn_index + 1) % len(self.players)
        return True

# usage
game = Game([Player("Alice", Symbol.X), Player("Bob", Symbol.O)], LineWinStrategy())
moves = [(0, 0), (1, 0), (0, 1), (1, 1), (0, 2)]   # Alice takes the top row -> X wins
for r, c in moves:
    game.play_turn(r, c)
print(f"Winner: {game.winner.name if game.winner else 'none yet'}")
```
{{tab C#}}
```csharp
public enum Symbol { X, O, Empty }

public class Board {
    public int Size;
    public Symbol[,] Grid;

    public Board(int size = 3) {
        Size = size;
        Grid = new Symbol[size, size];
        for (int r = 0; r < size; r++)
            for (int c = 0; c < size; c++)
                Grid[r, c] = Symbol.Empty;
    }

    public bool Place(int row, int col, Symbol symbol) {
        if (row < 0 || row >= Size || col < 0 || col >= Size) return false;
        if (Grid[row, col] != Symbol.Empty) return false;
        Grid[row, col] = symbol;
        return true;
    }

    public bool IsFull() {
        for (int r = 0; r < Size; r++)
            for (int c = 0; c < Size; c++)
                if (Grid[r, c] == Symbol.Empty) return false;
        return true;
    }
}

public interface IWinningStrategy {                 // Strategy, module 08
    Symbol? CheckWinner(Board board);
}

public class LineWinStrategy : IWinningStrategy {
    public Symbol? CheckWinner(Board board) {
        var lines = new List<List<Symbol>>();

        for (int r = 0; r < board.Size; r++) {
            var row = new List<Symbol>();
            for (int c = 0; c < board.Size; c++) row.Add(board.Grid[r, c]);
            lines.Add(row);
        }
        for (int c = 0; c < board.Size; c++) {
            var col = new List<Symbol>();
            for (int r = 0; r < board.Size; r++) col.Add(board.Grid[r, c]);
            lines.Add(col);
        }
        var diag1 = new List<Symbol>();
        var diag2 = new List<Symbol>();
        for (int i = 0; i < board.Size; i++) {
            diag1.Add(board.Grid[i, i]);
            diag2.Add(board.Grid[i, board.Size - 1 - i]);
        }
        lines.Add(diag1);
        lines.Add(diag2);

        foreach (var line in lines) {
            if (line[0] != Symbol.Empty && line.TrueForAll(s => s == line[0]))
                return line[0];
        }
        return null;
    }
}

public class Player {
    public string Name;
    public Symbol Symbol;
    public Player(string name, Symbol symbol) { Name = name; Symbol = symbol; }
}

public class Game {
    public Board Board;
    public List<Player> Players;
    public Player Winner;
    private IWinningStrategy _winStrategy;
    private int _turnIndex = 0;

    public Game(List<Player> players, IWinningStrategy winStrategy, int size = 3) {
        Board = new Board(size);
        Players = players;
        _winStrategy = winStrategy;
    }

    public bool PlayTurn(int row, int col) {
        if (Winner != null || Board.IsFull()) return false;
        var player = Players[_turnIndex];
        if (!Board.Place(row, col, player.Symbol)) return false;

        var winningSymbol = _winStrategy.CheckWinner(Board);
        if (winningSymbol != null) {
            Winner = player;
        } else {
            _turnIndex = (_turnIndex + 1) % Players.Count;
        }
        return true;
    }
}

// usage
var game = new Game(
    new List<Player> { new Player("Alice", Symbol.X), new Player("Bob", Symbol.O) },
    new LineWinStrategy());
var moves = new (int, int)[] { (0, 0), (1, 0), (0, 1), (1, 1), (0, 2) };  // Alice takes the top row -> X wins
foreach (var (r, c) in moves) game.PlayTurn(r, c);
Console.WriteLine($"Winner: {(game.Winner != null ? game.Winner.Name : "none yet")}");
```
{{/tabs}}

### Tradeoffs and extensions

- **`WinningStrategy` generalizes to N×N with a configurable win length**
  with zero changes to `Board` or `Game` — swap in a
  `KInARowStrategy(k)` and the rest of the design is untouched. This is
  the entire payoff of pulling win-checking out as a Strategy (module
  08) instead of hardcoding it into `Board`.
- **`Board` has no idea what "winning" means** — it only enforces
  bounds and cell-emptiness. That's Single Responsibility (module 04):
  grid bookkeeping and win-condition logic are two different reasons to
  change, so they're two different classes.
- **`turn_index % len(players)` generalizes past two players
  mechanically**, but the win rules and standard 3×3 board don't
  meaningfully extend to N-player variants without further design —
  named here as a boundary, not a promise the code already handles it.

---

## Problem 2: Chess (Move/Board Engine)

### Requirements

**Functional**: an 8×8 move engine that validates and executes legal
moves for all six piece types (pawn, knight, bishop, rook, queen,
king), enforces turn order (White/Black alternating), prevents
capturing your own piece, and blocks sliding pieces (rook, bishop,
queen) on an obstructed path.

**Non-functional**: move-legality must live on each piece type itself
(polymorphism, module 02), not as `if pieceType == ...` branching
inside `Board` — adding a rule to one piece must never require editing
another piece's class (OCP, module 04).

**Assumptions stated up front** (module 11, step 1 — named
simplifications, not omissions): **no check, checkmate, or stalemate
detection**; **no castling, en passant, or pawn promotion**; standard
starting position only. Every one of these is a scoping call a real
interview expects you to state out loud, not hide.

### Class diagram

```
┌──────────┐      ┌───────────────┐
│   Game   │ -->  │     Board     │
├──────────┤      ├───────────────┤
│ - board  │      │ - squares     │
│ - turn   │      ├───────────────┤
├──────────┤      │ + getPiece()  │
│ + move() │      │ + movePiece() │
└──────────┘      └───────────────┘

Board o── Piece   (abstract — one instance per occupied square)

                ┌───────────────────┐
                │       Piece       │
                ├───────────────────┤
                │ - color, position │
                ├───────────────────┤
                │ + validMoves()    │
                └───────────────────┘
                          │
        ┬────────────────┬┼───────────┬───────────┬
        │                │            │           │
┌──────────────┐    ┌────────┐    ┌──────┐    ┌──────┐
│ SlidingPiece │    │ Knight │    │ King │    │ Pawn │
└──────────────┘    └────────┘    └──────┘    └──────┘

        │
    ┬───┼────────┬────────────┬
    │            │            │
┌──────┐    ┌────────┐    ┌───────┐
│ Rook │    │ Bishop │    │ Queen │
└──────┘    └────────┘    └───────┘
```

### Implementation

{{tabs}}
{{tab Python}}
```python
from abc import ABC, abstractmethod
from enum import Enum, auto
from dataclasses import dataclass

class Color(Enum):
    WHITE = auto()
    BLACK = auto()

@dataclass(frozen=True)                        # value object, module 03 — immutable, compared by value
class Position:
    row: int
    col: int

    def in_bounds(self) -> bool:
        return 0 <= self.row < 8 and 0 <= self.col < 8

class Piece(ABC):
    def __init__(self, color: Color, position: Position):
        self.color = color
        self.position = position

    @abstractmethod
    def valid_moves(self, board: "Board") -> set[Position]: ...

class SlidingPiece(Piece):                     # shared logic for Rook/Bishop/Queen — stops at the first blocker
    DIRECTIONS: list[tuple[int, int]] = []

    def valid_moves(self, board: "Board") -> set[Position]:
        moves = set()
        for d_row, d_col in self.DIRECTIONS:
            row, col = self.position.row + d_row, self.position.col + d_col
            while Position(row, col).in_bounds():
                target = Position(row, col)
                occupant = board.get_piece(target)
                if occupant is None:
                    moves.add(target)
                else:
                    if occupant.color != self.color:
                        moves.add(target)       # capture — square is reachable, but path stops here
                    break
                row, col = row + d_row, col + d_col
        return moves

class Rook(SlidingPiece):
    DIRECTIONS = [(1, 0), (-1, 0), (0, 1), (0, -1)]

class Bishop(SlidingPiece):
    DIRECTIONS = [(1, 1), (1, -1), (-1, 1), (-1, -1)]

class Queen(SlidingPiece):
    DIRECTIONS = Rook.DIRECTIONS + Bishop.DIRECTIONS

class Knight(Piece):
    OFFSETS = [(2, 1), (2, -1), (-2, 1), (-2, -1), (1, 2), (1, -2), (-1, 2), (-1, -2)]

    def valid_moves(self, board: "Board") -> set[Position]:
        moves = set()
        for d_row, d_col in self.OFFSETS:
            target = Position(self.position.row + d_row, self.position.col + d_col)
            if target.in_bounds():
                occupant = board.get_piece(target)
                if occupant is None or occupant.color != self.color:
                    moves.add(target)
        return moves

class King(Piece):                             # SIMPLIFICATION: no castling
    OFFSETS = [(r, c) for r in (-1, 0, 1) for c in (-1, 0, 1) if (r, c) != (0, 0)]

    def valid_moves(self, board: "Board") -> set[Position]:
        moves = set()
        for d_row, d_col in self.OFFSETS:
            target = Position(self.position.row + d_row, self.position.col + d_col)
            if target.in_bounds():
                occupant = board.get_piece(target)
                if occupant is None or occupant.color != self.color:
                    moves.add(target)
        return moves

class Pawn(Piece):                             # SIMPLIFICATION: no en passant, no promotion
    def valid_moves(self, board: "Board") -> set[Position]:
        moves = set()
        forward = -1 if self.color == Color.WHITE else 1
        start_row = 6 if self.color == Color.WHITE else 1

        one_step = Position(self.position.row + forward, self.position.col)
        if one_step.in_bounds() and board.get_piece(one_step) is None:
            moves.add(one_step)
            two_step = Position(self.position.row + 2 * forward, self.position.col)
            if self.position.row == start_row and board.get_piece(two_step) is None:
                moves.add(two_step)

        for d_col in (-1, 1):
            capture = Position(self.position.row + forward, self.position.col + d_col)
            if capture.in_bounds():
                occupant = board.get_piece(capture)
                if occupant is not None and occupant.color != self.color:
                    moves.add(capture)
        return moves

class Board:
    def __init__(self):
        self.squares: dict[Position, Piece] = {}
        self._setup_standard_position()

    def _setup_standard_position(self):
        back_rank = [Rook, Knight, Bishop, Queen, King, Bishop, Knight, Rook]
        for col, piece_cls in enumerate(back_rank):
            self.squares[Position(0, col)] = piece_cls(Color.BLACK, Position(0, col))
            self.squares[Position(7, col)] = piece_cls(Color.WHITE, Position(7, col))
        for col in range(8):
            self.squares[Position(1, col)] = Pawn(Color.BLACK, Position(1, col))
            self.squares[Position(6, col)] = Pawn(Color.WHITE, Position(6, col))

    def get_piece(self, position: Position) -> "Piece | None":
        return self.squares.get(position)

    def move_piece(self, start: Position, end: Position) -> bool:
        piece = self.get_piece(start)
        if piece is None or end not in piece.valid_moves(self):
            return False
        del self.squares[start]
        self.squares[end] = piece
        piece.position = end
        return True

class Game:                                    # SIMPLIFICATION: no check/checkmate detection
    def __init__(self):
        self.board = Board()
        self.turn = Color.WHITE

    def move(self, start: Position, end: Position) -> bool:
        piece = self.board.get_piece(start)
        if piece is None or piece.color != self.turn:
            return False
        if not self.board.move_piece(start, end):
            return False
        self.turn = Color.BLACK if self.turn == Color.WHITE else Color.WHITE
        return True

# usage
game = Game()
print("White pawn e2->e4:", game.move(Position(6, 4), Position(4, 4)))   # standard opening
print("Black pawn e7->e5:", game.move(Position(1, 4), Position(3, 4)))
print("White bishop f1->c4 (path now clear):", game.move(Position(7, 5), Position(4, 2)))
print("Wrong turn (white moving again):", game.move(Position(7, 6), Position(5, 5)))  # should fail
```
{{tab C#}}
```csharp
public enum Color { White, Black }

public readonly struct Position : IEquatable<Position> {   // value object, module 03 — immutable, compared by value
    public readonly int Row, Col;
    public Position(int row, int col) { Row = row; Col = col; }
    public bool InBounds() => Row >= 0 && Row < 8 && Col >= 0 && Col < 8;
    public bool Equals(Position other) => Row == other.Row && Col == other.Col;
    public override bool Equals(object obj) => obj is Position p && Equals(p);
    public override int GetHashCode() => HashCode.Combine(Row, Col);
}

public abstract class Piece {
    public Color Color;
    public Position Position;
    protected Piece(Color color, Position position) { Color = color; Position = position; }
    public abstract HashSet<Position> ValidMoves(Board board);
}

public abstract class SlidingPiece : Piece {    // shared logic for Rook/Bishop/Queen — stops at the first blocker
    protected abstract (int, int)[] Directions { get; }
    protected SlidingPiece(Color color, Position position) : base(color, position) { }

    public override HashSet<Position> ValidMoves(Board board) {
        var moves = new HashSet<Position>();
        foreach (var (dRow, dCol) in Directions) {
            int row = Position.Row + dRow, col = Position.Col + dCol;
            while (new Position(row, col).InBounds()) {
                var target = new Position(row, col);
                var occupant = board.GetPiece(target);
                if (occupant == null) {
                    moves.Add(target);
                } else {
                    if (occupant.Color != Color) moves.Add(target);   // capture — reachable, but path stops here
                    break;
                }
                row += dRow; col += dCol;
            }
        }
        return moves;
    }
}

public class Rook : SlidingPiece {
    public Rook(Color color, Position position) : base(color, position) { }
    protected override (int, int)[] Directions => new[] { (1, 0), (-1, 0), (0, 1), (0, -1) };
}

public class Bishop : SlidingPiece {
    public Bishop(Color color, Position position) : base(color, position) { }
    protected override (int, int)[] Directions => new[] { (1, 1), (1, -1), (-1, 1), (-1, -1) };
}

public class Queen : SlidingPiece {
    public Queen(Color color, Position position) : base(color, position) { }
    protected override (int, int)[] Directions =>
        new[] { (1, 0), (-1, 0), (0, 1), (0, -1), (1, 1), (1, -1), (-1, 1), (-1, -1) };
}

public class Knight : Piece {
    private static readonly (int, int)[] Offsets =
        { (2, 1), (2, -1), (-2, 1), (-2, -1), (1, 2), (1, -2), (-1, 2), (-1, -2) };
    public Knight(Color color, Position position) : base(color, position) { }

    public override HashSet<Position> ValidMoves(Board board) {
        var moves = new HashSet<Position>();
        foreach (var (dRow, dCol) in Offsets) {
            var target = new Position(Position.Row + dRow, Position.Col + dCol);
            if (!target.InBounds()) continue;
            var occupant = board.GetPiece(target);
            if (occupant == null || occupant.Color != Color) moves.Add(target);
        }
        return moves;
    }
}

public class King : Piece {                     // SIMPLIFICATION: no castling
    private static readonly (int, int)[] Offsets =
        { (-1, -1), (-1, 0), (-1, 1), (0, -1), (0, 1), (1, -1), (1, 0), (1, 1) };
    public King(Color color, Position position) : base(color, position) { }

    public override HashSet<Position> ValidMoves(Board board) {
        var moves = new HashSet<Position>();
        foreach (var (dRow, dCol) in Offsets) {
            var target = new Position(Position.Row + dRow, Position.Col + dCol);
            if (!target.InBounds()) continue;
            var occupant = board.GetPiece(target);
            if (occupant == null || occupant.Color != Color) moves.Add(target);
        }
        return moves;
    }
}

public class Pawn : Piece {                      // SIMPLIFICATION: no en passant, no promotion
    public Pawn(Color color, Position position) : base(color, position) { }

    public override HashSet<Position> ValidMoves(Board board) {
        var moves = new HashSet<Position>();
        int forward = Color == Color.White ? -1 : 1;
        int startRow = Color == Color.White ? 6 : 1;

        var oneStep = new Position(Position.Row + forward, Position.Col);
        if (oneStep.InBounds() && board.GetPiece(oneStep) == null) {
            moves.Add(oneStep);
            var twoStep = new Position(Position.Row + 2 * forward, Position.Col);
            if (Position.Row == startRow && board.GetPiece(twoStep) == null) moves.Add(twoStep);
        }

        foreach (int dCol in new[] { -1, 1 }) {
            var capture = new Position(Position.Row + forward, Position.Col + dCol);
            if (!capture.InBounds()) continue;
            var occupant = board.GetPiece(capture);
            if (occupant != null && occupant.Color != Color) moves.Add(capture);
        }
        return moves;
    }
}

public class Board {
    private Dictionary<Position, Piece> _squares = new Dictionary<Position, Piece>();

    public Board() => SetupStandardPosition();

    private void SetupStandardPosition() {
        PlaceBackRank(Color.Black, row: 0);
        PlaceBackRank(Color.White, row: 7);
        for (int col = 0; col < 8; col++) {
            _squares[new Position(1, col)] = new Pawn(Color.Black, new Position(1, col));
            _squares[new Position(6, col)] = new Pawn(Color.White, new Position(6, col));
        }
    }

    private void PlaceBackRank(Color color, int row) {
        _squares[new Position(row, 0)] = new Rook(color, new Position(row, 0));
        _squares[new Position(row, 1)] = new Knight(color, new Position(row, 1));
        _squares[new Position(row, 2)] = new Bishop(color, new Position(row, 2));
        _squares[new Position(row, 3)] = new Queen(color, new Position(row, 3));
        _squares[new Position(row, 4)] = new King(color, new Position(row, 4));
        _squares[new Position(row, 5)] = new Bishop(color, new Position(row, 5));
        _squares[new Position(row, 6)] = new Knight(color, new Position(row, 6));
        _squares[new Position(row, 7)] = new Rook(color, new Position(row, 7));
    }

    public Piece GetPiece(Position position) => _squares.GetValueOrDefault(position);

    public bool MovePiece(Position start, Position end) {
        var piece = GetPiece(start);
        if (piece == null || !piece.ValidMoves(this).Contains(end)) return false;
        _squares.Remove(start);
        _squares[end] = piece;
        piece.Position = end;
        return true;
    }
}

public class Game {                              // SIMPLIFICATION: no check/checkmate detection
    public Board Board = new Board();
    public Color Turn = Color.White;

    public bool Move(Position start, Position end) {
        var piece = Board.GetPiece(start);
        if (piece == null || piece.Color != Turn) return false;
        if (!Board.MovePiece(start, end)) return false;
        Turn = Turn == Color.White ? Color.Black : Color.White;
        return true;
    }
}

// usage
var game = new Game();
Console.WriteLine($"White pawn e2->e4: {game.Move(new Position(6, 4), new Position(4, 4))}");
Console.WriteLine($"Black pawn e7->e5: {game.Move(new Position(1, 4), new Position(3, 4))}");
Console.WriteLine($"White bishop f1->c4 (path now clear): {game.Move(new Position(7, 5), new Position(4, 2))}");
Console.WriteLine($"Wrong turn (white moving again): {game.Move(new Position(7, 6), new Position(5, 5))}");
```
{{/tabs}}

### Tradeoffs and extensions

- **`SlidingPiece` captures Rook/Bishop/Queen's shared "walk a direction
  until blocked" logic exactly once** — and `Queen.DIRECTIONS` is
  *literally* `Rook.DIRECTIONS + Bishop.DIRECTIONS`, since a queen moves
  like both combined. That's DRY (module 05) via inheritance, not
  three copies of the same scanning loop.
- **`Knight`, `King`, and `Pawn` deliberately do *not* inherit from
  `SlidingPiece`** — their movement isn't "walk until blocked," it's
  fixed-offset or forward-only. Forcing them under `SlidingPiece` "for
  consistency" would be the wrong abstraction (module 05: prefer
  duplication over a shared base that doesn't actually fit).
- **Named simplifications (no check/checkmate, no castling, en
  passant, or promotion) are exactly module 11's step-1 discipline** —
  a real engine adds each as an isolated extension on top of this same
  `Piece` hierarchy (e.g., promotion is just "replace the `Pawn` at the
  back rank with a `Queen`," touching only `Board`/`Game`, not the
  piece classes).
- **`Board.move_piece`/`MovePiece` is the single choke point** that
  calls `piece.valid_moves(board)`/`ValidMoves(board)` — `Game` never
  inspects piece-specific rules itself, keeping turn/ownership checks
  (`Game`'s job) cleanly separate from movement legality (`Piece`'s
  job).

## Hands-on exercises

### 1. Tic-Tac-Toe: generalize the win condition

Add a `win_length` parameter to `LineWinStrategy` (default 3) so a 4×4
board can be won with 3-in-a-row instead of 4 — confirm it needs no
changes to `Board` or `Game`.

### 2. Tic-Tac-Toe: a simple AI opponent

Implement a `MoveStrategy` interface with one method,
`choose_move(board)`/`ChooseMove(board)`, and a `FirstEmptyCellStrategy`
implementation. Have `Game` call it for one of the two players instead
of a human-supplied move.

### 3. Chess: lift the promotion simplification

Implement pawn promotion: when `Board.move_piece`/`MovePiece` completes
a pawn's move onto the opposite back rank (row 0 for White, row 7 for
Black), replace it with a `Queen` of the same color and position.
Confirm no changes are needed to `Pawn`, `Knight`, `Bishop`, `Rook`, or
`King`.

### 4. Chess: verify path-blocking

Write a short test that places an enemy piece directly between a rook
and a square further along its file, and confirms
`valid_moves()`/`ValidMoves()` does **not** include any square beyond
the blocker — then confirm the blocker's own square *is* included
(it's a legal capture).

### 5. Chess: track captures

Add a `captured_pieces`/`CapturedPieces` list to `Game`, appended to
whenever `Board.move_piece`/`MovePiece` overwrites an occupied enemy
square, without changing any `Piece` subclass.

## Independent challenge

No code given.

**Task:** Add basic check detection to the Chess engine: after each
move, determine whether the side that just moved has put the *opposing*
king in check — i.e., whether the king's `Position` appears in the
union of every remaining piece's `valid_moves()`/`ValidMoves()` on the
mover's side. Expose it as `Game.is_check(color)`/`Game.IsCheck(color)`.
Do this **without modifying any individual `Piece` subclass** —
`valid_moves()`/`ValidMoves()` already tells you every square a piece
attacks; check detection is a question `Game` or `Board` can answer by
reading that, not something that belongs inside `Pawn` or `Rook`.

<details>
<summary>Hint</summary>

Loop over every piece of the attacking color still on the board, union
their `valid_moves(board)`/`ValidMoves(board)` results into one set,
and test whether the defending king's current `Position` is a member of
that set. This is the same "read the existing abstraction, don't add a
new one" instinct as module 09's Iterator — you already have the
information you need, from a method that exists for an unrelated
reason (move legality), and check detection is just a new question
asked of the same data.

</details>

## Common mistakes & troubleshooting

- **Hardcoding piece-move validation as `if pieceType == "rook": ...`
  chains inside `Board`.** This is the single most common Chess LLD
  mistake — it defeats polymorphism entirely and violates OCP (module
  04): adding a new piece type means editing `Board`, not adding a
  class.
- **Letting a sliding piece "peek past" the first occupied square in
  its path.** The loop must `break` the moment it hits *any* piece,
  friendly or enemy — only add the blocker's own square if it's an
  enemy (a legal capture), then stop regardless.
- **Calling `Board.move_piece`/`MovePiece` without checking the
  destination is actually in `piece.valid_moves()`/`ValidMoves()`
  first.** Skipping that check silently allows illegal moves — the
  validation and the mutation must happen in the same method, not
  trusted to the caller.
- **Tic-Tac-Toe: checking rows and columns but forgetting one or both
  diagonals** (or checking a diagonal with the wrong index formula).
  Always verify against the full set of `2N + 2` lines for an N×N
  board, not just the ones that come to mind first.
- **Treating `WinningStrategy` as unnecessary ceremony for "just a
  simple 3×3 game."** Removing it (YAGNI-ing it away, module 05) also
  removes the exact extension point exercise 1 needs — the generalized
  win-length variant is *why* it's a separate class.

## Checkpoint quiz

1. Why does `Queen.DIRECTIONS` work as `Rook.DIRECTIONS +
   Bishop.DIRECTIONS`, and what design principle does that reuse
   demonstrate?
2. Why do `Knight`, `King`, and `Pawn` *not* inherit from
   `SlidingPiece`?
3. In Tic-Tac-Toe, which class decides whether the board currently has
   a winner, and why isn't that logic inside `Board`?
4. What causes a sliding piece's `valid_moves()`/`ValidMoves()` loop to
   stop scanning further squares in a given direction?
5. Name two of the Chess engine's named simplifications, and explain
   why stating them out loud matters in an interview.

<details>
<summary>Answers</summary>

1. A queen's legal directions are exactly a rook's four straight
   directions plus a bishop's four diagonal directions — since
   `SlidingPiece.valid_moves`/`ValidMoves` already generalizes over
   whatever `DIRECTIONS` a subclass provides, combining the two lists
   is enough. This demonstrates DRY (module 05) via inheritance: the
   scanning algorithm is written once, in the shared base class.
2. Their movement isn't "walk in a straight line until blocked" —
   `Knight` jumps to fixed offsets ignoring anything in between,
   `King` moves one square in any direction, and `Pawn`'s forward and
   capture rules are asymmetric and direction-dependent. Inheriting
   from `SlidingPiece` for the sake of reuse would be the wrong
   abstraction (module 05) — none of them share its actual behavior.
3. `WinningStrategy` (`LineWinStrategy`), injected into `Game`. It's
   not inside `Board` because `Board` has one responsibility — grid
   bookkeeping (bounds, emptiness) — and win-condition logic is a
   separate reason to change (SRP, module 04).
4. Hitting any occupied square, friendly or enemy. If it's an enemy
   piece, that square is added as a legal capture before stopping; if
   it's a friendly piece, the loop stops without adding it. Either way,
   nothing beyond that square in the same direction is reachable.
5. Any two of: no check/checkmate/stalemate detection, no castling, no
   en passant, no pawn promotion, standard starting position only.
   Naming them out loud matters because an LLD interview is testing
   whether you can scope a design deliberately (module 11, step 1) —
   silently omitting a well-known chess rule reads as an oversight,
   while stating it as a scoping decision reads as engineering
   judgment.

</details>

## Interview questions

1. **"How would you design the class hierarchy for chess pieces?"**
   An abstract `Piece` base holding shared state (color, position) and
   one abstract method, `validMoves(board)`. Each concrete piece
   implements its own movement rule via polymorphism (module 02).
   Rook, Bishop, and Queen additionally share an intermediate
   `SlidingPiece` base for their common "scan a direction until
   blocked" logic, since duplicating that loop three times would
   violate DRY (module 05).
2. **"How do you prevent a rook from jumping over another piece?"**
   `SlidingPiece.validMoves` scans one square at a time in each
   direction and stops the instant it hits any occupied square —
   adding that square only if it's an enemy piece (a legal capture)
   before breaking. Nothing beyond the first blocker in a direction is
   ever considered reachable.
3. **"Would you add check and checkmate detection? How?"**
   Yes, as an addition on top of the existing `Piece.validMoves`
   abstraction rather than a new one: check is "is the defending king's
   position in the union of every attacking piece's `validMoves()`,"
   computable entirely from data the pieces already expose. Checkmate
   layers on top of that: no legal move exists that removes the check.
   Neither requires modifying a single `Piece` subclass.
4. **"Why does Tic-Tac-Toe use a Strategy for win-checking instead of a
   method on `Board`?"**
   So `Board` stays responsible only for grid bookkeeping (SRP, module
   04) and the win condition can change independently — a different
   board size or win-length requirement becomes a new
   `WinningStrategy` implementation, with zero changes to `Board` or
   `Game` (DIP, module 04; Strategy, module 08).
5. **"What did you deliberately leave out of your Chess design, and
   why?"**
   Check/checkmate/stalemate detection, castling, en passant, and pawn
   promotion — each named as a scoping decision (module 11, step 1),
   not an oversight, and each is addable later as an isolated extension
   on the existing `Piece`/`Board`/`Game` split without restructuring
   what's already there.

## Further reading & sources

- [Refactoring.Guru: Strategy pattern](https://refactoring.guru/design-patterns/strategy) - revisit module 08's pattern, used here for Tic-Tac-Toe's win-checking.
- [Python `dataclasses` — `frozen=True`](https://docs.python.org/3/library/dataclasses.html#frozen-instances) - the immutable value-object technique (module 03) backing `Position`.
- [Microsoft Learn: `readonly struct`](https://learn.microsoft.com/en-us/dotnet/csharp/language-reference/builtin-types/struct#readonly-struct) - the C# equivalent used for `Position`'s immutability.

## Next

[15-splitwise-expense-sharing](../15-splitwise-expense-sharing/README.md)
— a full guided solution for an expense-splitting system, Splitwise-style.
