import { test } from 'node:test';
import assert from 'node:assert/strict';
import { commentParts, sharedCode } from './commentText.js';

test('a comment of plain words is one piece of text, as it was written', () => {
  assert.deepEqual(commentParts('Why does this need an index?\n\nIt is slow.'), [{ type: 'text', text: 'Why does this need an index?\n\nIt is slow.' }]);
  assert.deepEqual(commentParts('one line'), [{ type: 'text', text: 'one line' }]);
  assert.deepEqual(commentParts(''), []);
});

test('code in a fence is shown as code, with the words around it kept in order', () => {
  const text = 'My solution:\n```python\ndef add(a, b):\n    return a + b\n```\nIt works because of closures.';
  assert.deepEqual(commentParts(text), [
    { type: 'text', text: 'My solution:' },
    { type: 'code', lang: 'python', code: 'def add(a, b):\n    return a + b' },
    { type: 'text', text: 'It works because of closures.' }
  ]);
});

test('a fence needs a line of its own, and an open fence with no end is just words', () => {
  assert.deepEqual(commentParts('use ```code``` inline'), [{ type: 'text', text: 'use ```code``` inline' }]);
  const open = 'look:\n```python\nx = 1';
  assert.deepEqual(commentParts(open), [{ type: 'text', text: open }]);
  assert.deepEqual(commentParts('```\nno language\n```'), [{ type: 'code', lang: '', code: 'no language' }]);
});

test('several blocks, empty blocks, blank lines and Windows line endings', () => {
  const text = 'a\r\n```js\r\none\r\n```\r\n\r\nb\r\n```\r\n```\r\n';
  assert.deepEqual(commentParts(text), [
    { type: 'text', text: 'a' },
    { type: 'code', lang: 'js', code: 'one' },
    { type: 'text', text: 'b' },
    { type: 'code', lang: '', code: '' }
  ]);
});

test('what is shared is a line of words and the code in a fence, and reads back as the same two pieces', () => {
  const shared = sharedCode('My solution:', 'def f():\n    return 1\n\n');
  assert.equal(shared, 'My solution:\n```python\ndef f():\n    return 1\n```');
  assert.deepEqual(commentParts(shared), [
    { type: 'text', text: 'My solution:' },
    { type: 'code', lang: 'python', code: 'def f():\n    return 1' }
  ]);
});
