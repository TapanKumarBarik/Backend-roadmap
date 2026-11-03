import test from 'node:test';
import assert from 'node:assert/strict';
import { pathListProblems, pathsFileProblems, pathsProblems, serializePaths, stepInTree, stepProblem } from './paths.js';
import { CURRICULA, TREE } from './fixtures.js';

const path = (extra = {}) => ({
  id: 'http-basics', title: 'HTTP basics', topic: 'Backend', difficulty: 'beginner', goal: 'Learn HTTP.', audience: 'Beginners.',
  prerequisites: ['Programming'], skills: ['HTTP'], steps: ['backend/01-http'], ...extra
});
const file = (...paths) => ({ _about: 'Notes.', paths });
const where = { tree: TREE, curricula: CURRICULA };

test('a well-formed paths file has nothing wrong with it', () => {
  assert.deepEqual(pathsProblems(file(path(), path({ id: 'next-one', next: 'http-basics', steps: ['lld', 'backend/01-http/02-caching'] })), where), []);
});

test('every kind of mistake in a path is reported in words that name the path', () => {
  /** @type {Array<[any, RegExp]>} */
  const cases = [
    [path({ title: '' }), /path "http-basics": "title" is missing/],
    [path({ goal: undefined }), /"goal" is missing/],
    [path({ id: 'Not An Id' }), /"id" is part of the address/],
    [path({ difficulty: 'hard' }), /"difficulty" must be beginner, intermediate or advanced/],
    [path({ prerequisites: [] }), /"prerequisites" must be a list of texts/],
    [path({ skills: ['ok', ' '] }), /"skills" must be a list of texts/],
    [path({ steps: [] }), /"steps" is empty/],
    [path({ steps: ['backend/01-http/'] }), /step 1 must be a folder under content\/ like/],
    [path({ steps: ['../api'] }), /step 1 must be a folder/],
    [path({ steps: ['backend/01-http', 'backend/01-http'] }), /listed twice/],
    [path({ next: 'nowhere' }), /next "nowhere" is not another path/],
    [path({ next: 'http-basics' }), /next "http-basics" is not another path/],
    [path({ colour: 'red' }), /unknown field "colour"/]
  ];
  for (const [bad, expected] of cases) {
    assert.match(pathsProblems(file(bad), where).join('\n'), expected, JSON.stringify(bad));
  }
});

test('the list as a whole: not empty, no id twice, an object with a paths list and nothing else', () => {
  assert.deepEqual(pathListProblems([]), ['paths.json has no paths']);
  assert.match(pathListProblems([path(), path()]).join(' '), /two paths with the same id/);
  assert.match(pathListProblems(['x']).join(' '), /every path must be an object/);
  assert.match(pathsFileProblems(null)[0], /must be an object/);
  assert.match(pathsFileProblems({ paths: [path()], extra: 1 })[0], /unknown field "extra"/);
  assert.deepEqual(pathsFileProblems({ paths: [path()] }), [], '_about is optional');
});

test('a step is checked against the deployed index: it must be a folder, with modules, some of them written', () => {
  assert.deepEqual(stepInTree(TREE, 'backend/01-http'), { modules: 3, written: 2 });
  assert.deepEqual(stepInTree(TREE, 'lld'), { modules: 1, written: 1 });
  assert.equal(stepInTree(TREE, 'backend/NOTES.md'), null);
  assert.match(pathsProblems(file(path({ steps: ['backend/09-missing'] })), where)[0], /step "backend\/09-missing" is not a folder/);
  assert.match(pathsProblems(file(path({ steps: ['backend/02-planned-only'] })), where)[0], /only planned modules/);
  assert.match(pathsProblems(file(path({ steps: ['elsewhere/01-x'] })), where)[0], /not inside a curriculum \(backend, learn, lld\)/);
});

test('stepProblem speaks the checker words for what was found', () => {
  assert.equal(stepProblem('backend/x', CURRICULA, { modules: 2, written: 1 }), null);
  assert.match(stepProblem('backend/x', CURRICULA, null), /is not a folder/);
  assert.match(stepProblem('backend/x', CURRICULA, { modules: 0, written: 0 }), /has no modules in it/);
});

test('the file is written in one layout', () => {
  assert.equal(serializePaths({ paths: [] }), '{\n  "paths": []\n}\n');
});
