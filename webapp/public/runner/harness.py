"""How a learner's Python is judged against the tests of a practice problem.

This file is the one source of truth for it. The browser (py-worker.js) loads it into Pyodide, which is CPython compiled to WebAssembly, and the
scripts that check the problems themselves (scripts/dev/check-code-problems.mjs) run the very same code with ordinary Python, so a problem that passes
its own check passes in the browser. It uses only the standard library.

run_all(user_code, codes, names, progress) -> {
    "loaded":  None, or what went wrong running the learner's own code (a syntax error, an exception at the top level),
    "line":    the line of their code it happened on, when known,
    "stdout":  what their code printed (cut short),
    "results": [{ "name": ..., "ok": True/False, "message": ... }]  one for each test that has an assert in it
}

A test is a piece of code run, after the learner's code, in the same namespace. One with an `assert` of its own in it is a case that passes or fails; one
without (a helper function that asserts inside is still set-up) makes what the next test uses. An `assert a == b` is rewritten so that, when it fails, the message says what each side was
("got [1, 2], expected [2, 1]") without calling anything a second time.
"""
import ast
import contextlib
import io

MAX_OUTPUT = 4000
MAX_REPR = 220
MAX_NAME = 110
USER_FILE = "<your code>"

_OPS = {ast.Eq: "==", ast.NotEq: "!=", ast.Lt: "<", ast.LtE: "<=", ast.Gt: ">", ast.GtE: ">=", ast.Is: "is", ast.IsNot: "is not", ast.In: "in", ast.NotIn: "not in"}


class _Failed(AssertionError):
    """An assert that knows both sides of its comparison."""

    def __init__(self, left, op, right):
        super().__init__()
        self.left, self.op, self.right = left, op, right


def _short(value):
    text = repr(value)
    return text if len(text) <= MAX_REPR else text[: MAX_REPR - 1] + "…"


class _Rewrite(ast.NodeTransformer):
    """assert a == b  becomes  two assignments and a check, so the failure carries both values."""

    def __init__(self):
        self.count = 0

    def visit_Assert(self, node):
        test = node.test
        if not (isinstance(test, ast.Compare) and len(test.ops) == 1 and type(test.ops[0]) in _OPS and node.msg is None):
            return node
        self.count += 1
        left, right = "__left%d" % self.count, "__right%d" % self.count
        out = [
            ast.Assign(targets=[ast.Name(id=left, ctx=ast.Store())], value=test.left),
            ast.Assign(targets=[ast.Name(id=right, ctx=ast.Store())], value=test.comparators[0]),
            ast.If(
                test=ast.UnaryOp(op=ast.Not(), operand=ast.Compare(left=ast.Name(id=left, ctx=ast.Load()), ops=test.ops, comparators=[ast.Name(id=right, ctx=ast.Load())])),
                body=[ast.Raise(exc=ast.Call(func=ast.Name(id="_Failed", ctx=ast.Load()), args=[ast.Name(id=left, ctx=ast.Load()), ast.Constant(value=_OPS[type(test.ops[0])]), ast.Name(id=right, ctx=ast.Load())], keywords=[]), cause=None)],
                orelse=[],
            ),
        ]
        for part in out:
            ast.copy_location(part, node)
        return out


_SCOPES = (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef, ast.Lambda)


def _asserts(tree):
    """The asserts a test runs itself: not the ones inside a function or class it defines (a helper that checks something is set-up, not a case)."""
    found, stack = [], [tree]
    while stack:
        node = stack.pop()
        for child in ast.iter_child_nodes(node):
            if isinstance(child, _SCOPES):
                continue
            if isinstance(child, ast.Assert):
                found.append(child)
            stack.append(child)
    return sorted(found, key=lambda n: (n.lineno, n.col_offset))


def _name_of(source, tree):
    found = _asserts(tree)
    text = ast.get_source_segment(source, found[0]) if found else source.strip().splitlines()[0]
    text = " ".join((text or "").split())
    if text.startswith("assert "):
        text = text[len("assert "):]
    return text if len(text) <= MAX_NAME else text[: MAX_NAME - 1] + "…"


def _line_in_user_code(error):
    """The line of the learner's code an exception came from, when it did."""
    line = None
    tb = error.__traceback__
    while tb is not None:
        if tb.tb_frame.f_code.co_filename == USER_FILE:
            line = tb.tb_lineno
        tb = tb.tb_next
    return line


def _describe(error):
    if isinstance(error, _Failed):
        if error.op == "==":
            return "got %s, expected %s" % (_short(error.left), _short(error.right))
        return "%s %s %s is not true" % (_short(error.left), error.op, _short(error.right))
    if isinstance(error, AssertionError):
        return str(error) or "the assertion is not true"
    text = "%s: %s" % (type(error).__name__, error)
    line = _line_in_user_code(error)
    return text + (" (line %d of your code)" % line if line else "")


class _Printed(io.TextIOBase):
    """What the learner's code prints, kept only up to MAX_OUTPUT characters: a loop that prints without end must not use up the browser's memory."""

    def __init__(self):
        self.parts = []
        self.size = 0
        self.cut = False

    def writable(self):
        return True

    def write(self, text):
        room = MAX_OUTPUT - self.size
        if room > 0:
            self.parts.append(text[:room])
            self.size += min(len(text), room)
        if len(text) > room:
            self.cut = True
        return len(text)

    def text(self):
        return "".join(self.parts) + ("\n… (cut short)" if self.cut else "")


def run_all(user_code, codes, names, progress=None):
    namespace = {"__name__": "__main__", "_Failed": _Failed}
    printed = _Printed()
    results = []
    with contextlib.redirect_stdout(printed), contextlib.redirect_stderr(printed):
        try:
            exec(compile(user_code, USER_FILE, "exec"), namespace)
        except SyntaxError as error:
            return {"loaded": "SyntaxError: %s" % error.msg, "line": error.lineno, "stdout": printed.text(), "results": []}
        except BaseException as error:  # the learner's own code ran at the top level and failed
            return {"loaded": "%s: %s" % (type(error).__name__, error), "line": _line_in_user_code(error), "stdout": printed.text(), "results": []}
        rewrite = _Rewrite()
        for index, source in enumerate(codes):
            tree = ast.parse(source)
            is_case = bool(_asserts(tree))
            name = (names[index] if names and names[index] else None) or _name_of(source, tree)
            if progress is not None and is_case:
                progress(index, name)
            tree = ast.fix_missing_locations(rewrite.visit(tree))
            try:
                exec(compile(tree, "<test>", "exec"), namespace)
            except BaseException as error:
                # a failed set-up is a failure too: the tests after it cannot mean anything
                results.append({"name": name, "ok": False, "message": _describe(error)})
                continue
            if is_case:
                results.append({"name": name, "ok": True, "message": ""})
    return {"loaded": None, "line": None, "stdout": printed.text(), "results": results}
