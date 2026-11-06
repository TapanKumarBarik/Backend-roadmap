import test from 'node:test';
import assert from 'node:assert/strict';
import { areaProblems } from './areas.mjs';

const disk = { backend: ['01-a', '02-b', '03-c'], lld: ['x', 'y'] };
const tracksOf = (id) => disk[id] || [];
const good = () => ({
  backend: { label: 'Backend', short: 'Backend', blurb: 'b', groups: [{ label: 'One', tracks: ['01-a', '02-b'] }] },
  lld: { label: 'LLD', short: 'LLD', blurb: 'l', groups: [] }
});
const check = (areas, curricula = ['backend', 'lld']) => areaProblems(areas, curricula, tracksOf);

test('a consistent config has no problems, and says which tracks no group names', () => {
  const { problems, ungrouped } = check(good());
  assert.deepEqual(problems, []);
  assert.deepEqual(ungrouped, { backend: ['03-c'] });
});

test('every curriculum has an area, every area a curriculum, in the same order', () => {
  const areas = good();
  assert.match(check({ backend: areas.backend }).problems[0], /"lld" has no entry/);
  assert.match(check(areas, ['backend']).problems[0], /"lld", which is not in content.curricula/);
  assert.match(check(areas, ['lld', 'backend']).problems[0], /different order/);
});

test('a name, a short name and a line are needed, and the short name is short', () => {
  const areas = good();
  areas.backend.label = ' ';
  areas.lld.short = 'x'.repeat(21);
  const messages = check(areas).problems.join('\n');
  assert.match(messages, /area "backend": "label" is empty/);
  assert.match(messages, /area "lld": "short" is 21 characters/);
});

test('a group names folders that exist, each in one group only', () => {
  const areas = good();
  areas.backend.groups = [{ label: 'One', tracks: ['01-a', '09-typo'] }, { label: 'Two', tracks: ['01-a'] }, { label: '', tracks: [] }];
  const messages = check(areas).problems.join('\n');
  assert.match(messages, /there is no folder content\/backend\/09-typo/);
  assert.match(messages, /"01-a" is in two groups \("One" and "Two"\)/);
  assert.match(messages, /group 3: no label/);
  assert.match(messages, /group 3.*"tracks" must be a list/);
});

test('"groups" must be a list, though it may be empty', () => {
  const areas = good();
  areas.lld.groups = undefined;
  assert.match(check(areas).problems[0], /area "lld": "groups" must be a list/);
});
