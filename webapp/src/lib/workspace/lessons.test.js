import test from 'node:test';
import assert from 'node:assert/strict';
import { findLessons } from './lessons.js';

const files = ['a/01-http/README.md', 'a/02-sessions/README.md', 'a/03-http-caching/README.md', 'b/01-cookies/README.md'];
const nodeByFile = {
  'a/01-http/README.md': { title: 'Module 01: HTTP Basics', min: 5 },
  'a/02-sessions/README.md': { title: 'Module 02: Sessions and Cookies', min: 5 },
  'a/03-http-caching/README.md': { title: 'Module 03: Caching over HTTP', min: 5 },
  'b/01-cookies/README.md': { title: 'Module 01: Cookies', min: 5 }
};

test('nothing is offered until something is typed', () => {
  assert.deepEqual(findLessons(files, nodeByFile, '', 8), []);
  assert.deepEqual(findLessons(files, nodeByFile, '   ', 8), []);
});

test('every word typed must be in the title or the folder, in any case', () => {
  assert.deepEqual(findLessons(files, nodeByFile, 'COOKIES sessions', 8).map((m) => m.file), ['a/02-sessions/README.md']);
  assert.deepEqual(findLessons(files, nodeByFile, 'http', 8).map((m) => m.title), ['HTTP Basics', 'Caching over HTTP']);
  assert.deepEqual(findLessons(files, nodeByFile, 'no such thing', 8), []);
});

test('lessons whose title starts with the word come first, and there are no more than the limit', () => {
  assert.deepEqual(findLessons(files, nodeByFile, 'cookies', 8).map((m) => m.file), ['b/01-cookies/README.md', 'a/02-sessions/README.md']);
  assert.equal(findLessons(files, nodeByFile, 'a', 2).length, 2);
});

test('a lesson already on the list is not offered', () => {
  assert.deepEqual(findLessons(files, nodeByFile, 'http', 8, new Set(['a/01-http/README.md'])).map((m) => m.file), ['a/03-http-caching/README.md']);
});
