"""Runs the Python examples of lessons the way the browser's Run button does, and fills in or checks the output shown under each one.

A lesson that shows what a program prints should show what it really prints. This runs every ```python block of the lessons you name with the very
harness the browser loads into Pyodide (webapp/public/runner/harness.py), one block at a time, as the Run button does, and compares the result with the
```text block that follows it.

    python scripts/dev/lesson-snippets.py content/learn/00-python-refresher/*/README.md            # check: an example that fails, or prints something other than shown, is reported
    python scripts/dev/lesson-snippets.py content/learn/00-python-refresher/*/README.md --write    # fill in: a ```text block that holds the single word OUTPUT becomes the real output

Conventions
- Each example must run on its own (the Run button runs one block, not the page), and import only what the browser's Python has (site.config.json -> runner.modules):
  an example that imports anything else would show no Run button, and is reported.
- An example that is meant to fail starts with the line `# raises`. The ```text block after it holds the LAST LINE of the error ("ValueError: invalid literal ...").
- A ```text block directly after a ```python block (only blank lines between) must show what that example printed. A ```text block that says OUTPUT takes
  what the nearest example above it printed, wherever it sits, so an answer hidden in a <details> block can be filled in too.
Exit status 1 when anything is wrong, so it can be a gate.
"""
import importlib.util
import json
import os
import re
import shutil
import sys
import tempfile

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))
sys.dont_write_bytecode = True
NL = chr(10)

spec = importlib.util.spec_from_file_location('harness', os.path.join(ROOT, 'webapp', 'public', 'runner', 'harness.py'))
harness = importlib.util.module_from_spec(spec)
spec.loader.exec_module(harness)

ALLOWED = set(json.load(open(os.path.join(ROOT, 'site.config.json'), encoding='utf-8'))['runner']['modules'].split())
FENCE = re.compile(r'^(`{3,}|~{3,})([A-Za-z0-9_+-]*)\s*$')
IMPORT = re.compile(r'^[ \t]*(?:from[ \t]+([A-Za-z_]\w*)|import[ \t]+([^\n#;]+))', re.M)


def imported(code):
    names = set()
    for frm, lst in IMPORT.findall(code):
        if frm:
            names.add(frm)
        else:
            for part in lst.split(','):
                name = part.strip().split()[0].split('.')[0] if part.strip() else ''
                if name:
                    names.add(name)
    return names


def blocks(lines):
    """The fenced blocks of a file: (language, first body line, last body line + 1), body lines being those between the fences."""
    found = []
    i = 0
    while i < len(lines):
        m = FENCE.match(lines[i])
        if m:
            fence, lang = m.group(1), m.group(2).lower()
            j = i + 1
            while j < len(lines) and not (lines[j].startswith(fence) and lines[j].strip() == fence):
                j += 1
            found.append((lang, i + 1, j))
            i = j + 1
        else:
            i += 1
    return found


def run(code):
    """Runs one example in an empty folder of its own, so files an example writes do not land in the repo and one example cannot lean on another's files."""
    scratch = tempfile.mkdtemp(prefix='lesson-snippet-')
    here = os.getcwd()
    os.chdir(scratch)
    try:
        result = harness.run_snippet(code)
    finally:
        os.chdir(here)
        shutil.rmtree(scratch, ignore_errors=True)
    return result.get('stdout') or '', result.get('error')


def squash(text):
    return NL.join(line.rstrip() for line in text.split(NL))


def main():
    files = [a for a in sys.argv[1:] if not a.startswith('--')]
    write = '--write' in sys.argv
    if not files:
        sys.exit(__doc__)
    problems = []
    ran = 0
    for path in files:
        name = os.path.relpath(path, ROOT)
        lines = open(path, encoding='utf-8').read().replace('\r\n', NL).split(NL)
        found = blocks(lines)
        edits = []
        last = None   # what the most recent example printed
        for index, (lang, start, end) in enumerate(found):
            body = NL.join(lines[start:end]).rstrip()
            if lang == 'text' and body == 'OUTPUT':
                if last is None:
                    problems.append(f'{name}:{start}: an OUTPUT block with no example above it to take the output from')
                elif write:
                    edits.append((start, end, last.split(NL) if last else ['']))
                else:
                    problems.append(f'{name}:{start}: the output block still says OUTPUT (run with --write)')
                continue
            if lang not in ('python', 'py'):
                continue
            where = f'{name}:{start}'
            raises = body.lstrip().startswith('# raises')
            extra = imported(body) - ALLOWED
            if extra:
                problems.append(f'{where}: imports {", ".join(sorted(extra))}, which the browser does not have, so the example would have no Run button')
            stdout, error = run(body)
            ran += 1
            last = None
            if error and not raises:
                problems.append(f'{where}: the example fails: {error.strip().splitlines()[-1]}')
                continue
            if raises and not error:
                problems.append(f'{where}: marked "# raises" but it ran without an error')
                continue
            actual = (error.strip().splitlines()[-1] if raises else stdout).rstrip()
            last = actual
            nxt = found[index + 1] if index + 1 < len(found) else None
            if nxt and nxt[0] == 'text' and all(not l.strip() for l in lines[end + 1:nxt[1] - 1]):
                shown = NL.join(lines[nxt[1]:nxt[2]]).rstrip()
                if shown != 'OUTPUT' and squash(shown) != squash(actual):
                    if write:
                        edits.append((nxt[1], nxt[2], actual.split(NL) if actual else ['']))
                    else:
                        problems.append(f'{where}: it prints{NL}    {actual!r}{NL}  but the lesson shows{NL}    {shown!r}')
        if write and edits:
            for s, e, new in sorted(edits, reverse=True):
                lines[s:e] = new
            with open(path, 'w', encoding='utf-8', newline='') as f:
                f.write(NL.join(lines))
            print(f'wrote {len(edits)} output block(s) in {name}')
    if problems:
        print(f'{len(problems)} problem(s) in the examples:')
        for p in problems:
            print('  - ' + p)
        sys.exit(1)
    print(f'ok: {ran} example(s) run, and what they print is what the lessons show')


if __name__ == '__main__':
    main()
