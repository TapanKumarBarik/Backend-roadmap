import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { codeProblems, generatedText, loadPractice, quizProblems } from './practice.mjs';
import { isCase, testParts } from '../../webapp/src/lib/practice/validate.js';

const question = (over = {}) => ({
  id: 'q1', type: 'single', text: 'Which?', explanation: 'Because.',
  options: [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }], answer: ['a'], ...over
});
const quiz = (questions = [question()]) => ({ title: 'T', topic: 't', difficulty: 'beginner', description: 'D', questions });

test('a good quiz has no problems', () => {
  assert.deepEqual(quizProblems('x', quiz()), []);
  assert.deepEqual(quizProblems('x', quiz([question({ type: 'multiple', answer: ['a'] }), question({ id: 'q2', type: 'truefalse', options: [{ id: 'true', text: 'True' }, { id: 'false', text: 'False' }], answer: ['true'] })])), []);
});

test('a question whose answer is not one of its options, or that has the wrong number of answers, is a problem', () => {
  assert.match(quizProblems('x', quiz([question({ answer: ['z'] })]))[0], /option ids/);
  assert.match(quizProblems('x', quiz([question({ answer: ['a', 'b'] })]))[0], /exactly one right answer/);
  assert.match(quizProblems('x', quiz([question({ type: 'multiple', answer: ['a', 'b'] })]))[0], /every option is right/);
  assert.match(quizProblems('x', quiz([question({ type: 'truefalse' })]))[0], /"true" and "false"/);
  assert.match(quizProblems('x', quiz([question({ explanation: '' })]))[0], /no explanation/);
  assert.match(quizProblems('x', quiz([question(), question()]))[0], /repeated id/);
  assert.match(quizProblems('x', quiz([]))[0], /no questions/);
  assert.match(quizProblems('x', { ...quiz(), difficulty: 'hard' })[0], /difficulty/);
});

const problem = (over = {}) => ({
  title: 'Add', topic: 'math-and-bits', difficulty: 'beginner', description: 'Add two numbers.', statement: 'Return `a + b`.',
  starter: 'def add(a, b):\n    ...\n', solution: 'def add(a, b):\n    return a + b\n', explanation: 'Add them.',
  tests: ['assert add(1, 2) == 3', 'assert add(0, 0) == 0', { name: 'negatives', code: 'assert add(-1, -1) == -2' }], ...over
});

test('a good coding problem has no problems, and one that cannot be judged is found', () => {
  assert.deepEqual(codeProblems('x', problem()), []);
  assert.deepEqual(codeProblems('x', problem({ hints: ['Think.', 'Again.'] })), []);
  assert.match(codeProblems('x', problem({ statement: '' }))[0], /statement is missing/);
  assert.match(codeProblems('x', problem({ starter: ' ' }))[0], /starter is missing/);
  assert.match(codeProblems('x', problem({ solution: undefined }))[0], /solution is missing/);
  assert.match(codeProblems('x', problem({ difficulty: 'hard' }))[0], /difficulty/);
  assert.match(codeProblems('x', problem({ tests: [] }))[0], /tests must be a list/);
  assert.match(codeProblems('x', problem({ tests: ['assert 1', 7] }))[0], /tests must be a list/);
  assert.match(codeProblems('x', problem({ tests: ['assert add(1, 2) == 3', 'x = 1', 'assert add(0, 0) == 0'] }))[0], /at least 3 tests with an assert/);
  assert.match(codeProblems('x', problem({ hints: ['a', 'b', 'c', 'd', 'e', 'f'] }))[0], /hints must be a list/);
  assert.match(codeProblems('x', problem({ hints: [''] }))[0], /hints must be a list/);
});

test('a test is a case only when it has an assert of its own, not one inside a helper it defines', () => {
  assert.equal(isCase('assert f(1) == 2'), true);
  assert.equal(isCase('x = 1\nassert x'), true);
  assert.equal(isCase('for i in range(3):\n    assert f(i) == i'), true);
  assert.equal(isCase({ code: 'assert f(1)' }), true);
  assert.equal(isCase('x = f(1)'), false);
  assert.equal(isCase('def check(v):\n    assert v == 1\n    return True'), false, 'a helper that asserts is set-up');
  assert.equal(isCase('class T:\n    def run(self):\n        assert 1'), false);
  assert.equal(isCase('def check(v):\n    assert v\n\nassert check(1)'), true, 'the assert after the helper is a case');
  assert.equal(isCase('async def check(v):\n    assert v'), false);
  assert.deepEqual(testParts('assert 1'), { name: null, code: 'assert 1' });
  assert.deepEqual(testParts({ name: 'one', code: 'assert 1' }), { name: 'one', code: 'assert 1' });
});

test('the files of a content folder are read, checked, and written in a fixed order', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'practice-'));
  const put = (file, data) => { fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true }); fs.writeFileSync(path.join(dir, file), typeof data === 'string' ? data : JSON.stringify(data)); };
  put('lessons/a/README.md', '# A');
  put('practice/quizzes/zeta.json', { ...quiz(), module: 'lessons/a/README.md' });
  put('practice/quizzes/alpha.json', quiz());
  put('practice/exercises/e.json', { title: 'E', topic: 't', difficulty: 'beginner', brief: 'B', deliverables: ['one'] });
  put('practice/interview/i.json', { title: 'I', topic: 't', difficulty: 'beginner', questions: [{ q: 'Q?', a: 'A.' }] });
  put('practice/interview/c.json', { title: 'C', topic: 't', difficulty: 'beginner', section: 'coding', questions: [{ q: 'Q?', a: 'A.' }] });
  put('practice/code/b-add.json', problem());
  put('practice/code/a-add.json', problem());

  const { content, problems } = loadPractice(dir);
  assert.deepEqual(problems, []);
  assert.deepEqual(Object.keys(content.quizzes), ['alpha', 'zeta']);
  assert.deepEqual(Object.keys(content.interview), ['c', 'i']);
  assert.deepEqual(Object.keys(content.code), ['a-add', 'b-add']);
  assert.equal(generatedText(content), generatedText(loadPractice(dir).content));

  put('practice/quizzes/zeta.json', { ...quiz(), module: 'lessons/missing/README.md' });
  put('practice/interview/wrong.json', { title: 'W', topic: 't', difficulty: 'beginner', section: 'tutorial', questions: [{ q: 'Q?', a: 'A.' }] });
  put('practice/quizzes/broken.json', '{ not json');
  put('practice/code/wrong.json', problem({ tests: ['assert 1'] }));
  const bad = loadPractice(dir).problems.join('\n');
  assert.match(bad, /module "lessons\/missing\/README.md" is not a lesson/);
  assert.match(bad, /section must be one of concepts, coding/);
  assert.match(bad, /broken.json/);
  assert.match(bad, /code wrong: tests must be a list|code wrong: needs at least 3 tests/);
  fs.rmSync(dir, { recursive: true, force: true });
});
