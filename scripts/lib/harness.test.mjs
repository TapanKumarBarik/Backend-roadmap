// The harness (webapp/public/runner/harness.py) decides whether a learner's code passes a problem, in the browser's Python (Pyodide) and, for the checks, in
// ordinary Python. These tests drive it both ways with small jobs, so what a learner is told ("got [1, 2], expected [2, 1]") and what counts as a test cannot
// change without a test saying so. The ordinary-Python half needs Python 3 on the PATH (PYTHON overrides which) and is skipped without it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { ROOT } from './config.mjs';
import { createPyodideJudge } from './pyodideJudge.mjs';

const PYTHON = process.env.PYTHON || (process.platform === 'win32' ? 'python' : 'python3');
const JUDGE = path.join(ROOT, 'scripts/lib/judge_problem.py');
const havePython = spawnSync(PYTHON, ['--version']).status === 0;

/** Runs `code` against `tests` (strings) with ordinary Python. */
function run(code, tests) {
  const out = spawnSync(PYTHON, ['-I', '-B', JUDGE], { input: JSON.stringify({ code, tests: tests.map((t) => ({ name: null, code: t })) }), encoding: 'utf8' });
  return JSON.parse(out.stdout);
}

/** Runs a piece of code from a lesson with ordinary Python (harness.py run_snippet). */
function snippet(code) {
  const out = spawnSync(PYTHON, ['-I', '-B', JUDGE], { input: JSON.stringify({ snippet: code }), encoding: 'utf8' });
  const { seconds: _seconds, ...answer } = JSON.parse(out.stdout); // how long it took is not what these tests are about
  return answer;
}

const ADD = 'def add(a, b):\n    return a + b\n';

test('a failing comparison says what came back and what was expected, and a passing one is named by its assert', { skip: !havePython }, () => {
  const r = run(ADD, ['assert add(1, 2) == 3', 'assert add(1, 2) == 4', 'assert add(1, 2) != 3', 'assert add(1, 2) in (1, 2)']);
  assert.deepEqual(r.results.map((x) => [x.name, x.ok]), [['add(1, 2) == 3', true], ['add(1, 2) == 4', false], ['add(1, 2) != 3', false], ['add(1, 2) in (1, 2)', false]]);
  assert.equal(r.results[1].message, 'got 3, expected 4');
  assert.equal(r.results[2].message, '3 != 3 is not true');
  assert.equal(r.results[3].message, '3 in (1, 2) is not true');
  assert.equal(r.loaded, null);
});

test('an assert with a message of its own keeps it, one without says only that it is not true', { skip: !havePython }, () => {
  const r = run(ADD, ['assert add(1, 2) > 5, "needs to be more than 5"', 'assert add(1, 2) == 3 and False']);
  assert.deepEqual(r.results.map((x) => x.message), ['needs to be more than 5', 'the assertion is not true']);
});

test('a test is a case only when it has an assert of its own: a helper that asserts inside is set-up', { skip: !havePython }, () => {
  const helper = 'def accepts(v):\n    assert v == 3, f"expected 3, got {v}"\n    return True';
  const r = run(ADD, [helper, 'assert accepts(add(1, 2))', 'assert accepts(add(1, 1))', 'x = 5']);
  assert.deepEqual(r.results.map((x) => [x.name, x.ok]), [['accepts(add(1, 2))', true], ['accepts(add(1, 1))', false]], 'the helper and the plain statement are not tests');
  assert.equal(r.results[1].message, 'expected 3, got 2', "the helper's own message is what the learner reads");
});

test('a syntax error, or an exception when the code is first run, is reported with its line and no test is run', { skip: !havePython }, () => {
  const syntax = run('def add(a, b)\n    return a + b\n', ['assert add(1, 2) == 3']);
  assert.equal(syntax.line, 1);
  assert.equal(syntax.results.length, 0);
  assert.match(syntax.loaded, /^SyntaxError/);
  const boom = run('x = 1\nraise ValueError("boom")\n', ['assert True']);
  assert.deepEqual([boom.loaded, boom.line, boom.results.length], ['ValueError: boom', 2, 0]);
});

test('an exception inside a test names the line of the learner\'s code it came from', { skip: !havePython }, () => {
  const r = run('def divide(a, b):\n    return a / b\n', ['assert divide(1, 0) == 0']);
  assert.equal(r.results[0].ok, false);
  assert.equal(r.results[0].message, 'ZeroDivisionError: division by zero (line 2 of your code)');
});

test('set-up that fails is a failure, and the tests after it still run', { skip: !havePython }, () => {
  const r = run(ADD, ['values = undefined_name', 'assert add(1, 2) == 3']);
  assert.equal(r.results.length, 2);
  assert.equal(r.results[0].ok, false);
  assert.match(r.results[0].message, /NameError/);
  assert.equal(r.results[1].ok, true);
});

test('what the code prints is kept, and kept short: a loop that prints without end cannot use up the memory', { skip: !havePython }, () => {
  const r = run('def noisy():\n    print("hello")\n    for _ in range(50000):\n        print("x" * 80)\n    return 1\n', ['assert noisy() == 1']);
  assert.ok(r.stdout.startsWith('hello\nxxxx'));
  assert.ok(r.stdout.length < 4100, `${r.stdout.length} characters kept`);
  assert.match(r.stdout, /\(cut short\)$/);
});

test('every run starts clean: nothing the last one defined is there', { skip: !havePython }, () => {
  run('LEFT_BEHIND = 1\n', ['assert LEFT_BEHIND == 1']);
  assert.match(run('def f():\n    return 1\n', ['assert LEFT_BEHIND == 1']).results[0].message, /NameError/);
});

test('Pyodide, the Python of the browser, gives the same answers as ordinary Python', { skip: !havePython }, async () => {
  const judge = await createPyodideJudge();
  /** @type {[string, string[]][]} */
  const jobs = [
    [ADD, ['assert add(1, 2) == 3', 'assert add(1, 2) == 4', 'assert add(1, 2) > 5, "too small"']],
    ['def accepts(v):\n    assert v == 3, "no"\n    return True\n', ['assert accepts(3)', 'assert accepts(4)']],
    ['def divide(a, b):\n    return a / b\n', ['assert divide(1, 0) == 0']],
    ['def f(x)\n    pass\n', ['assert True']]
  ];
  for (const [code, tests] of jobs) {
    const here = run(code, tests);
    const there = await judge.run(code, tests);
    assert.deepEqual({ loaded: there.loaded === null ? null : there.loaded.split(':')[0], results: there.results }, { loaded: here.loaded === null ? null : here.loaded.split(':')[0], results: here.results }, code);
  }
});

test('Pyodide runs out of stack when a very long chain of linked objects is freed, and the judge starts a new interpreter and carries on', async () => {
  const judge = await createPyodideJudge();
  const chain = 'class Node:\n    def __init__(self, value, next=None):\n        self.value = value\n        self.next = next\n\ndef build(n):\n    head = None\n    for value in range(n):\n        head = Node(value, head)\n    return head\n';
  const fine = await judge.run(chain, ['assert build(800).value == 799']);
  assert.deepEqual(fine.results.map((x) => x.ok), [true], 'a chain of 800 nodes is no trouble');
  const quiet = console.error; // Pyodide reports its own fatal error on the console; it is the expected result here
  console.error = () => {};
  const crashed = await judge.run(chain, ['assert build(60000).value == 59999']).finally(() => { console.error = quiet; });
  assert.ok(crashed.crashed, 'a chain of 60,000 nodes kills the interpreter');
  const after = await judge.run(ADD, ['assert add(1, 2) == 3']);
  assert.deepEqual(after.results.map((x) => x.ok), [true], 'and the next run is on a fresh one');
});

test('a lesson example is run on its own: what it prints comes back, and a failure says what and where', { skip: !havePython }, () => {
  assert.deepEqual(snippet('print("hello")\nprint(1 + 2)\n'), { stdout: 'hello\n3\n', error: null, line: null });
  assert.deepEqual(snippet('x = 1\n'), { stdout: '', error: null, line: null }, 'an example that prints nothing is fine');
  const failed = snippet('print("before")\nvalue = 1 / 0\nprint("after")\n');
  assert.deepEqual([failed.stdout, failed.error, failed.line], ['before\n', 'ZeroDivisionError: division by zero', 2]);
  const syntax = snippet('def broken(:\n    pass\n');
  assert.match(syntax.error, /^SyntaxError/);
  assert.equal(syntax.line, 1);
  assert.equal(snippet('import not_a_module_anywhere\n').error, "ModuleNotFoundError: No module named 'not_a_module_anywhere'");
});

test('an example sees itself as the main program, and runs in a namespace of its own each time', { skip: !havePython }, () => {
  assert.equal(snippet('if __name__ == "__main__":\n    print("main")\n').stdout, 'main\n');
  snippet('LEFT = 1\n');
  assert.match(snippet('print(LEFT)\n').error, /NameError/);
  const noisy = snippet('for _ in range(50000):\n    print("x" * 80)\n');
  assert.ok(noisy.stdout.length < 4100 && /\(cut short\)$/.test(noisy.stdout), 'what it prints is kept short');
});

test('Pyodide runs a lesson example the same way', { skip: !havePython }, async () => {
  const judge = await createPyodideJudge();
  for (const code of ['print("hello")\nprint(sum(range(5)))\n', 'print("before")\nvalue = 1 / 0\n', 'def broken(:\n    pass\n', 'import not_a_module_anywhere\n']) {
    const here = snippet(code);
    const there = await judge.snippet(code);
    assert.deepEqual({ ...there, error: there.error && there.error.split(':')[0] }, { ...here, error: here.error && here.error.split(':')[0] }, code);
  }
});
