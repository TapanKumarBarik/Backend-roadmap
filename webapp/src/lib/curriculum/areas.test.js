import test from 'node:test';
import assert from 'node:assert/strict';
import { areaOf, areaLabel, areaList, groupTracks, effectiveArea } from './areas.js';

const AREAS = {
  backend: { label: 'Backend Engineering', short: 'Backend', groups: [{ label: 'Path', tracks: ['02-api', '01-http'] }, { label: 'Data', tracks: ['03-db'] }] },
  lld: { label: 'Low-Level Design', short: 'Low-level design', groups: [] }
};
const track = (name) => ({ name, path: `backend/${name}`, file: `backend/${name}/README.md` });

test('a lesson belongs to the area named by its first folder, and a folder that is not an area belongs to none', () => {
  assert.equal(areaOf('backend/01-http/00-intro/README.md', AREAS), 'backend');
  assert.equal(areaOf('lld/04-solid/README.md', AREAS), 'lld');
  assert.equal(areaOf('notes/readme.md', AREAS), null);
  assert.equal(areaOf('', AREAS), null);
  assert.equal(areaOf(null, AREAS), null);
  assert.equal(areaOf('toString/x.md', AREAS), null, 'a name from Object.prototype is not an area');
});

test('the label comes from the config, else from the fallback', () => {
  assert.equal(areaLabel('lld', AREAS, 'x'), 'Low-Level Design');
  assert.equal(areaLabel('nope', AREAS, 'Fallback'), 'Fallback');
});

test('the areas are listed in the config order, each with its tree node when there is one', () => {
  const list = areaList(AREAS, [{ path: 'lld', name: 'lld' }]);
  assert.deepEqual(list.map((a) => a.id), ['backend', 'lld']);
  assert.equal(list[0].node, null);
  assert.equal(list[1].node.path, 'lld');
});

test('tracks are grouped under the config headings, in folder order inside a group, and the ones no group names go under More', () => {
  const nodes = [track('01-http'), track('02-api'), track('03-db'), track('09-new')];
  const sections = groupTracks(AREAS.backend, nodes);
  assert.deepEqual(sections.map((s) => s.label), ['Path', 'Data', 'More']);
  assert.deepEqual(sections[0].nodes.map((n) => n.name), ['01-http', '02-api']);
  assert.deepEqual(sections[2].nodes.map((n) => n.name), ['09-new']);
});

test('a group whose tracks are all missing is left out, and an area with no groups is one list with no heading', () => {
  assert.deepEqual(groupTracks(AREAS.backend, [track('03-db')]).map((s) => s.label), ['Data']);
  const flat = groupTracks(AREAS.lld, [track('a'), track('b')]);
  assert.equal(flat.length, 1);
  assert.equal(flat[0].label, null);
  assert.equal(flat[0].nodes.length, 2);
  assert.deepEqual(groupTracks(undefined, [track('a')]), [{ label: null, nodes: [track('a')] }]);
});

test('with every track in a group there is no More section, and an unlisted track in an ungrouped list has no heading either', () => {
  assert.deepEqual(groupTracks(AREAS.backend, [track('01-http'), track('03-db')]).map((s) => s.label), ['Path', 'Data']);
  assert.equal(groupTracks({ groups: [{ label: 'G', tracks: ['zz'] }] }, [track('a')])[0].label, null, 'nothing grouped: the list has no heading');
});

test('the tree shows what the reader picked; with no pick, the area being read, else every area', () => {
  assert.equal(effectiveArea('all', 'backend/01-http/README.md', AREAS), 'all');
  assert.equal(effectiveArea('lld', 'backend/01-http/README.md', AREAS), 'lld');
  assert.equal(effectiveArea(null, 'backend/01-http/README.md', AREAS), 'backend');
  assert.equal(effectiveArea(null, null, AREAS), 'all');
  assert.equal(effectiveArea('gone', 'lld/x/README.md', AREAS), 'lld', 'a pick naming an area that is gone counts as no pick');
});
