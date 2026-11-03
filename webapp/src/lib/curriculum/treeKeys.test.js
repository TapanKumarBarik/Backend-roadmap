import test from 'node:test';
import assert from 'node:assert/strict';
import { treeKey } from './treeKeys.js';

const at = (over) => ({ index: 2, count: 5, isDir: false, isOpen: false, hasParent: true, isModule: true, ...over });

test('the arrow keys, Home and End move between the rows that are showing, and stop at the ends', () => {
  assert.deepEqual(treeKey('ArrowDown', at({})), { do: 'move', to: 3 });
  assert.deepEqual(treeKey('ArrowUp', at({})), { do: 'move', to: 1 });
  assert.equal(treeKey('ArrowDown', at({ index: 4 })), null);
  assert.equal(treeKey('ArrowUp', at({ index: 0 })), null);
  assert.deepEqual(treeKey('Home', at({})), { do: 'move', to: 0 });
  assert.deepEqual(treeKey('End', at({})), { do: 'move', to: 4 });
});

test('Right opens a track and then goes into it; Left closes it and then goes to the track it is in', () => {
  assert.deepEqual(treeKey('ArrowRight', at({ isDir: true })), { do: 'open' });
  assert.deepEqual(treeKey('ArrowRight', at({ isDir: true, isOpen: true })), { do: 'child' });
  assert.equal(treeKey('ArrowRight', at({})), null, 'a module has nothing to open');
  assert.deepEqual(treeKey('ArrowLeft', at({ isDir: true, isOpen: true })), { do: 'close' });
  assert.deepEqual(treeKey('ArrowLeft', at({ isDir: true })), { do: 'parent' });
  assert.deepEqual(treeKey('ArrowLeft', at({})), { do: 'parent' });
  assert.equal(treeKey('ArrowLeft', at({ hasParent: false })), null, 'a curriculum has nothing above it');
});

test('Space changes the progress of a module, and of nothing else; other keys are left alone', () => {
  assert.deepEqual(treeKey(' ', at({})), { do: 'progress' });
  assert.equal(treeKey(' ', at({ isModule: false })), null);
  assert.equal(treeKey('a', at({})), null);
  assert.equal(treeKey('Enter', at({})), null, 'Enter is the link\'s own');
});
