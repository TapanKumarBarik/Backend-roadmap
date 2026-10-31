import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tagsFor } from './tags.mjs';

const repeat = (text, times) => Array.from({ length: times }, () => text).join('\n');

test('the folders alone give the curriculum and track tags', () => {
  const tags = tagsFor('', 'backend/04-databases-and-data-layer/01-indexes/README.md');
  assert.deepEqual(tags, ['backend', 'databases', 'sql']);
});

test('a folder named like an object property does not produce a tag', () => {
  assert.deepEqual(tagsFor('', 'constructor/valueof/README.md'), []);
});

test('the structure of a page gives format tags', () => {
  const text = '# Module\n\n## Checkpoint quiz\n\n## Hands-on exercises\n\n## Interview questions\n';
  assert.deepEqual(tagsFor(text, 'x/y/README.md'), ['quiz', 'exercises', 'interview']);
});

test('a track overview is an index; a capstone says so in its path', () => {
  assert.ok(tagsFor('', 'genai/README.md').includes('index'));
  assert.ok(!tagsFor('', 'genai/01-foundations/README.md').includes('index'));
  assert.ok(tagsFor('', 'backend/20-capstone/README.md').includes('capstone'));
});

test('a code language needs two fences to count', () => {
  const fence = '```python\nprint(1)\n```';
  assert.ok(!tagsFor(fence, 'x/y/README.md').includes('python'));
  assert.ok(tagsFor(`${fence}\n\n${fence}`, 'x/y/README.md').includes('python'));
});

test('a word needs several mentions to earn a tag, but a topic heading counts triple', () => {
  assert.ok(!tagsFor('one udp mention', 'x/y/README.md').includes('udp'));
  assert.ok(tagsFor(repeat('udp is connectionless', 4), 'x/y/README.md').includes('udp'));
  assert.ok(tagsFor('# UDP\n\nsome text', 'x/y/README.md').includes('udp'), 'in a heading: 1 + 3 hits');
});

test('on equal scores the tag that sorts last comes first, as the site\'s existing tag lists were built', () => {
  const tags = tagsFor(`${repeat('udp', 4)}\n${repeat('websocket', 4)}`, 'x/y/README.md');
  assert.ok(tags.indexOf('websocket') < tags.indexOf('udp'), tags.join(', '));
});

test('tags are not repeated when two sources give the same one', () => {
  const tags = tagsFor(repeat('docker build with a Dockerfile', 6), 'learn/02-docker/README.md');
  assert.equal(new Set(tags).size, tags.length);
});
