import { test } from 'node:test';
import assert from 'node:assert/strict';
import { importedModules, isRunnable } from './runnable.js';

test('the modules a piece of Python imports are found, whichever way it writes them', () => {
  assert.deepEqual([...importedModules('import json\nfrom collections import Counter\nimport os.path, sys as system\nx = 1')].sort(), ['collections', 'json', 'os', 'sys']);
  assert.deepEqual([...importedModules('    from typing import List  # not "import torch"\nprint("import numpy")')], ['typing']);
  assert.deepEqual([...importedModules('print(1)')], []);
});

test('an example runs when it is Python that needs only what the browser has', () => {
  assert.equal(isRunnable('python', 'import json\nprint(json.dumps({"a": 1}))'), true);
  assert.equal(isRunnable('py', 'from dataclasses import dataclass\n\n@dataclass\nclass P:\n    x: int\nprint(P(1))'), true);
  assert.equal(isRunnable('python', 'print("no imports")'), true);
});

test('an example that needs a package, or is not a program, or is not Python, has no Run button', () => {
  assert.equal(isRunnable('python', 'import numpy as np\nprint(np.arange(3))'), false);
  assert.equal(isRunnable('python', 'from fastapi import FastAPI\napp = FastAPI()'), false);
  assert.equal(isRunnable('python', 'import json\nimport requests'), false, 'one missing package is enough');
  assert.equal(isRunnable('python', '>>> 1 + 1\n2'), false, 'a console session');
  assert.equal(isRunnable('python', '# only a comment\n'), false);
  assert.equal(isRunnable('bash', 'echo hi'), false);
  assert.equal(isRunnable('', 'print(1)'), false, 'a block with no language is not assumed to be Python');
  assert.equal(isRunnable('javascript', 'console.log(1)'), false);
});
