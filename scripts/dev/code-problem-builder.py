"""Writes coding problems (content/practice/code/<slug>.json) from a Python file that is easier to author than JSON.

A problem holds Python code (the starting code, the tests, the solution), which is awkward to write as JSON strings. This reads a file that defines
PROBLEMS = [P(...), ...], writes one JSON file for each, and then runs `scripts/check/check-code-problems.mjs` on them (the solution must pass every test
and the starting code must fail), so a problem is only left in the repository if it can be solved as written.

    python scripts/dev/code-problem-builder.py path/to/problems.py            # write, then check
    python scripts/dev/code-problem-builder.py path/to/problems.py --no-check # write only

Write every text field as a RAW string (r'''...''') so that backslashes in code and in Markdown survive. `tests` may be a list of strings or { "name", "code" },
or one string of Python that is split the way the browser runs it: every top-level `assert` is a test of its own, and the statements between asserts (a helper
function, a list built for the asserts that follow) are kept together as one set-up test. See docs/PRACTICE.md for what makes a good problem, and
content/practice/code/two-sum.json, reverse-linked-list.json and min-stack.json for a function, a function over a data structure, and a class.

    PROBLEMS = [
    P(
        slug='two-sum', title='Two Sum', topic='arrays-and-hashing', difficulty='beginner',
        description='Find the two numbers in a list that add up to a target, in a single pass.',
        statement=r'''...Markdown: what to build, the rules the tests rely on, examples...''',
        starter=r'''def two_sum(nums, target):\n    ...''',
        tests=r'''assert two_sum([2, 7, 11, 15], 9) == [0, 1]\n...''',
        solution=r'''...''', explanation=r'''...''', hints=[r'''a nudge''', r'''the approach''', r'''the detail people get wrong'''],
    ),
    ]
"""
import ast
import json
import os
import subprocess
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))
OUT = os.path.join(ROOT, 'content', 'practice', 'code')


def split_tests(source):
    """One string of Python -> a list of tests: every top-level `assert` is a test of its own; the statements between asserts are kept together as one set-up test."""
    source = source.strip('\n')
    tree = ast.parse(source)
    lines = source.split('\n')
    tests, setup = [], []

    def flush():
        if setup:
            tests.append('\n'.join(setup).strip('\n'))
            setup.clear()

    for node in tree.body:
        start = (node.decorator_list[0].lineno if getattr(node, 'decorator_list', None) else node.lineno) - 1
        text = '\n'.join(lines[start:node.end_lineno])
        if isinstance(node, ast.Assert):
            flush()
            tests.append(text)
        else:
            setup.append(text)
    flush()
    return tests


def P(slug, title, topic, difficulty, description, statement, starter, tests, solution, explanation, hints=(), module=None):
    if isinstance(tests, str):
        tests = split_tests(tests)
    problem = {'title': title, 'topic': topic, 'difficulty': difficulty}
    if module:
        problem['module'] = module
    problem.update({
        'description': description.strip(),
        'statement': statement.strip('\n'),
        'starter': starter.strip('\n') + '\n',
        'tests': tests,
        'hints': [h.strip() for h in hints],
        'solution': solution.strip('\n') + '\n',
        'explanation': explanation.strip('\n'),
    })
    if not problem['hints']:
        del problem['hints']
    return slug, problem


def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    if not args:
        print(__doc__)
        return 2
    os.makedirs(OUT, exist_ok=True)
    slugs = []
    for path in args:
        ns = {'P': P, '__file__': path}
        exec(compile(open(path, encoding='utf-8').read(), path, 'exec'), ns)
        for slug, problem in ns['PROBLEMS']:
            assert slug and all(c.islower() or c.isdigit() or c == '-' for c in slug), f'bad slug {slug!r}'
            with open(os.path.join(OUT, slug + '.json'), 'w', encoding='utf-8', newline='\n') as f:
                json.dump(problem, f, indent=2, ensure_ascii=False)
                f.write('\n')
            slugs.append(slug)
    print(f'wrote {len(slugs)} problem(s): {", ".join(slugs)}')
    if '--no-check' in sys.argv:
        return 0
    return subprocess.run(['node', os.path.join('scripts', 'check', 'check-code-problems.mjs'), *slugs], cwd=ROOT).returncode


if __name__ == '__main__':
    sys.exit(main())
