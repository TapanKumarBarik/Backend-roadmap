"""Writes SQL problems (content/practice/code/<slug>.json, language "sql") from a Python file that is easier to author than JSON.

A SQL problem holds SQL (the starting query, the solution) and Markdown, which are awkward to write as JSON strings. This reads a file that defines
PROBLEMS = [S(...), ...], writes one JSON file for each, then runs `scripts/check/check-sql-problems.mjs --write` on them: the solution is run on the problem's
data and on each variant of it with the engine the browser uses, the tables it gives are written into the file as `expected` (that is what a learner's
query is judged by), and the problem is only left in the repository if it is worth solving (the starting query is not already the answer, the variants
check something new).

    python scripts/dev/sql-problem-builder.py path/to/problems.py

Write every text field as a RAW string (r'''...'''). See docs/PRACTICE.md for what makes a good problem.

    PROBLEMS = [
    S(
        slug='products-under-price', title='Cheap Products', topic='sql-querying', difficulty='beginner', dataset='shop',
        description='List the products that cost less than 20, cheapest first.',
        statement=r'''Markdown: what to return, with the column names, the order, how ties and NULLs are treated, and an example of the shape of the result...''',
        starter=r'''-- write your query below
SELECT ...''',
        solution=r'''SELECT name, price FROM products WHERE price < 20 ORDER BY price, name''',
        explanation=r'''Markdown: the idea, why it works, the usual mistakes, a follow-up...''',
        hints=[r'''a nudge''', r'''the approach''', r'''the detail people get wrong'''],
        variants=[["INSERT INTO products VALUES (99, 'Edge case', 'toys', 19.99)"]],    # statements that change the data: the query must give the right table on each
        order=True,                                                                    # the order of the rows is part of the answer
    ),
    ]
"""
import json
import os
import subprocess
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))
OUT = os.path.join(ROOT, 'content', 'practice', 'code')


def S(slug, title, topic, difficulty, dataset, description, statement, starter, solution, explanation, hints=(), variants=(), order=False, module=None):
    problem = {'title': title, 'topic': topic, 'difficulty': difficulty}
    if module:
        problem['module'] = module
    problem.update({
        'language': 'sql',
        'dataset': dataset,
        'description': description.strip(),
        'statement': statement.strip('\n'),
        'starter': starter.strip('\n') + '\n',
    })
    if variants:
        problem['variants'] = [list(v) for v in variants]
    if order:
        problem['orderMatters'] = True
    if hints:
        problem['hints'] = [h.strip() for h in hints]
    problem['solution'] = solution.strip('\n') + '\n'
    problem['explanation'] = explanation.strip('\n')
    return slug, problem


def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    if not args:
        print(__doc__)
        return 2
    os.makedirs(OUT, exist_ok=True)
    slugs = []
    for path in args:
        ns = {'S': S, '__file__': path}
        exec(compile(open(path, encoding='utf-8').read(), path, 'exec'), ns)
        for slug, problem in ns['PROBLEMS']:
            assert slug and all(c.islower() or c.isdigit() or c == '-' for c in slug), f'bad slug {slug!r}'
            target = os.path.join(OUT, slug + '.json')
            if os.path.exists(target) and json.load(open(target, encoding='utf-8')).get('language') != 'sql':
                sys.exit(f'{slug} is a Python problem already: choose another slug (this would overwrite it)')
            with open(target, 'w', encoding='utf-8', newline='\n') as f:
                json.dump(problem, f, indent=2, ensure_ascii=False)
                f.write('\n')
            slugs.append(slug)
    print(f'wrote {len(slugs)} problem(s): {", ".join(slugs)}')
    return subprocess.run(['node', os.path.join('scripts', 'check', 'check-sql-problems.mjs'), '--write', *slugs], cwd=ROOT).returncode


if __name__ == '__main__':
    sys.exit(main())
