import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { generatedText, loadPractice, quizProblems } from './practice.mjs';

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

test('the files of a content folder are read, checked, and written in a fixed order', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'practice-'));
  const put = (file, data) => { fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true }); fs.writeFileSync(path.join(dir, file), typeof data === 'string' ? data : JSON.stringify(data)); };
  put('lessons/a/README.md', '# A');
  put('practice/quizzes/zeta.json', { ...quiz(), module: 'lessons/a/README.md' });
  put('practice/quizzes/alpha.json', quiz());
  put('practice/exercises/e.json', { title: 'E', topic: 't', difficulty: 'beginner', brief: 'B', deliverables: ['one'] });
  put('practice/interview/i.json', { title: 'I', topic: 't', difficulty: 'beginner', questions: [{ q: 'Q?', a: 'A.' }] });
  put('design-lab/lld/c.json', { kind: 'lld', title: 'C', summary: 'S', problem: 'P', reference: 'R', functional: ['f'], nonFunctional: ['n'], constraints: ['c'], deliverables: ['d'], hints: ['h'] });

  const { content, problems } = loadPractice(dir);
  assert.deepEqual(problems, []);
  assert.deepEqual(Object.keys(content.quizzes), ['alpha', 'zeta']);
  assert.deepEqual(Object.keys(content.challenges), ['lld/c']);
  assert.equal(generatedText(content), generatedText(loadPractice(dir).content));

  put('practice/quizzes/zeta.json', { ...quiz(), module: 'lessons/missing/README.md' });
  put('design-lab/hld/wrong.json', { kind: 'lld', title: 'W' });
  put('practice/quizzes/broken.json', '{ not json');
  const bad = loadPractice(dir).problems.join('\n');
  assert.match(bad, /module "lessons\/missing\/README.md" is not a lesson/);
  assert.match(bad, /kind is "lld" but the file is in hld/);
  assert.match(bad, /broken.json/);
  fs.rmSync(dir, { recursive: true, force: true });
});
