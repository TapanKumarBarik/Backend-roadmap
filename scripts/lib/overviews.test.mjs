import test from 'node:test';
import assert from 'node:assert/strict';
import { config } from './config.mjs';
import { overviewsMarkedUnwritten } from './overviews.mjs';

const marker = config.content.placeholderMarker;
const tree = [
  { file: 'a/README.md', children: [
    { file: 'a/01-t/README.md', children: [{ file: 'a/01-t/00-m/README.md' }, { file: 'a/01-t/01-n/README.md' }] },
    { file: 'a/02-u/README.md', children: [{ file: 'a/02-u/00-m/README.md' }] }
  ] }
];

test('an overview that says the placeholder sentence in passing is found, at any depth', () => {
  const texts = {
    'a/README.md': `# A\n\nA lecture whose text ${marker} still has its video.`,
    'a/01-t/README.md': '# T\n\nThe first track.',
    'a/02-u/README.md': `# U\n\nA track that ${marker} either.`
  };
  assert.deepEqual(overviewsMarkedUnwritten(tree, (file) => texts[file]), ['a/README.md', 'a/02-u/README.md']);
});

test('modules are not overviews: an unwritten module is meant to carry the sentence', () => {
  const texts = { 'a/README.md': '# A', 'a/01-t/README.md': '# T', 'a/02-u/README.md': '# U', 'a/01-t/00-m/README.md': `*Content ${marker}.*` };
  assert.deepEqual(overviewsMarkedUnwritten(tree, (file) => texts[file] ?? ''), []);
});
