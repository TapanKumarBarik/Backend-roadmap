import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { config } from './config.mjs';
import { buildDocsIndex } from './docsIndex.mjs';
import { buildSearchIndex, tokenize } from './searchIndex.mjs';

const lines = (n) => Array.from({ length: n }, () => 'a lesson sentence about kafka partitions').join('\n');

// backend/
//   README.md                  the curriculum overview
//   01-intro/README.md         a track overview
//   01-intro/01-first/         a written module
//   01-intro/02-second/        a planned module
//   01-intro/NOTES.md          a loose page
//   STATUS.md                  the author's note, never indexed
// empty/                       nothing in it
function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'index-'));
  const write = (rel, text) => {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), text);
  };
  write('backend/README.md', '# Backend\n\nstart here\n');
  write('backend/01-intro/README.md', '# Track 1: Intro\n');
  write('backend/01-intro/01-first/README.md', `# First module\n\n${lines(500)}\n`);
  write('backend/01-intro/02-second/README.md', `# Second module\n\nThis module ${config.content.placeholderMarker}.\n`);
  write('backend/01-intro/NOTES.md', '# Notes\n\nloose page\n');
  write('backend/STATUS.md', '# Status\n\nsecret author notes\n');
  fs.mkdirSync(path.join(root, 'empty'));
  return root;
}

test('the tree follows the folders, with the README as each folder\'s page', () => {
  const { index } = buildDocsIndex(fixture(), ['backend', 'empty', 'missing']);
  assert.deepEqual(index.tree.map((n) => n.name), ['backend'], 'a folder with no pages and a missing folder are left out');

  const [backend] = index.tree;
  assert.equal(backend.file, 'backend/README.md');
  assert.equal(backend.title, 'Backend');

  const [intro] = backend.children;
  assert.deepEqual(backend.children.map((n) => n.name), ['01-intro'], 'STATUS.md is not listed');
  assert.deepEqual(intro.children.map((n) => n.name), ['01-first', '02-second', 'NOTES.md']);
});

test('only a lesson carries a reading time or the planned flag', () => {
  const { index } = buildDocsIndex(fixture(), ['backend']);
  const [intro] = index.tree[0].children;
  const [first, second, notes] = intro.children;

  assert.ok(first.min >= 1 && !('planned' in first));
  assert.equal(second.planned, true);
  assert.ok(!('min' in second));
  assert.ok(!('min' in intro) && !('planned' in intro), 'a track overview is a signpost, not a lesson');
  assert.ok(!('min' in notes) && !('planned' in notes), 'a loose page is not a lesson');
  assert.equal(notes.path, 'backend/01-intro', 'a loose page\'s path is its folder');
});

test('the tag catalogue counts every tag once per page, most used first', () => {
  const { index, files, untagged } = buildDocsIndex(fixture(), ['backend']);
  assert.equal(files, 5, 'five pages: overview, track, two modules, one loose page');
  assert.equal(index.tags.backend, 5);
  assert.deepEqual(Object.values(index.tags), [...Object.values(index.tags)].sort((a, b) => b - a));
  assert.deepEqual(untagged, []);
});

test('searching sees the words of lessons only, in a stable order', () => {
  const { files, index } = buildSearchIndex(fixture(), ['backend']);
  assert.deepEqual(files, [
    'backend/01-intro/01-first/README.md',
    'backend/01-intro/02-second/README.md',
    'backend/01-intro/NOTES.md',
    'backend/01-intro/README.md',
    'backend/README.md'
  ]);
  assert.deepEqual(index.kafka, [0], 'only the first module mentions kafka');
  assert.ok(!('secret' in index), 'STATUS.md is not searched');
  assert.deepEqual(Object.keys(index), [...Object.keys(index)].sort());
});

test('words that cannot tell one lesson from another are not indexed', () => {
  const words = tokenize('The HTTP request and 2024 returned 404 for a TCP connection; it is up');
  assert.deepEqual([...words].sort(), ['connection', 'http', 'request', 'returned', 'tcp']);
});
