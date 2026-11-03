import test from 'node:test';
import assert from 'node:assert/strict';
import { folderNode, listFolders, listPages, modulesUnder, pageFiles, pageFolders } from './modules.js';
import { TREE } from './fixtures.js';

test('a folder is found by its path, and a loose page or a missing folder is not one', () => {
  assert.equal(folderNode(TREE, 'backend/01-http').title, 'Track 01: HTTP');
  assert.equal(folderNode(TREE, 'lld').title, 'Low-level design');
  assert.equal(folderNode(TREE, 'backend/NOTES.md'), null, 'a loose page');
  assert.equal(folderNode(TREE, 'backend/09-nothing'), null);
  assert.equal(folderNode(TREE, 'backend/01-http/01-requests/extra'), null);
});

test('the modules under a folder are its README folders with no module folders inside, in reading order', () => {
  assert.deepEqual(modulesUnder(folderNode(TREE, 'backend')).map((m) => m.path), [
    'backend/01-http/01-requests', 'backend/01-http/02-caching', 'backend/01-http/03-soon', 'backend/02-planned-only/01-later'
  ]);
  assert.deepEqual(modulesUnder(folderNode(TREE, 'backend/01-http/01-requests')).map((m) => m.path), ['backend/01-http/01-requests'], 'a module is its own');
});

test('pages, folders and files are listed for the pickers and the checks', () => {
  assert.equal(listPages(TREE).length, 9, 'every README, signposts included, and not the loose page');
  assert.ok(pageFiles(TREE).has('backend/01-http/02-caching/README.md'));
  assert.ok(!pageFiles(TREE).has('backend/NOTES.md'));
  assert.ok(pageFolders(TREE).has('backend/01-http'));
  assert.deepEqual(listFolders(TREE).slice(0, 3), ['backend', 'backend/01-http', 'backend/01-http/01-requests']);
  assert.equal(listPages(TREE).find((p) => p.folder === 'backend/01-http/03-soon').planned, true);
});
