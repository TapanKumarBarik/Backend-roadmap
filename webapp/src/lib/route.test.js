import test from 'node:test';
import assert from 'node:assert/strict';
import { routeFromLocation } from './route.js';

const MODULE = 'backend/01-intro/01-first/README.md';

test('a module is read from its own address, and the hash is a heading on it', () => {
  assert.deepEqual(routeFromLocation('/backend/01-intro/01-first/', ''), { path: MODULE, heading: null, fromHash: false });
  assert.deepEqual(routeFromLocation('/backend/01-intro/01-first/', '#some-heading'), { path: MODULE, heading: 'some-heading', fromHash: false });
  assert.equal(routeFromLocation('/backend/01-intro/01-first/', '#__init__').path, MODULE, 'a heading that looks like a screen is still a heading');
});

test('the old all-hash links still open the module', () => {
  assert.deepEqual(routeFromLocation('/', `#${encodeURIComponent(MODULE)}@intro`), { path: MODULE, heading: 'intro', fromHash: true });
  assert.deepEqual(routeFromLocation('/', '#backend/x/README.md'), { path: 'backend/x/README.md', heading: null, fromHash: true });
});

test('a screen of the app is read from the hash', () => {
  assert.deepEqual(routeFromLocation('/', '#__feed'), { path: '__feed', heading: null, fromHash: true });
  assert.deepEqual(routeFromLocation('/', '#__feed@post-1'), { path: '__feed', heading: 'post-1', fromHash: true });
  assert.deepEqual(routeFromLocation('/', ''), { path: null, heading: null, fromHash: false }, 'the home page');
});

test('the community\'s pages are read from their addresses, before any module reading', () => {
  assert.deepEqual(routeFromLocation('/blog/', ''), { path: '__blog', heading: null, fromHash: false });
  assert.deepEqual(routeFromLocation('/blog/why-retries', ''), { path: '__blog', heading: 'why-retries', fromHash: false });
  assert.deepEqual(routeFromLocation('/authors/ada-l', ''), { path: '__author', heading: 'ada-l', fromHash: false });
  assert.deepEqual(routeFromLocation('/write/17-ab', ''), { path: '__write', heading: '17-ab', fromHash: false });
});

test('a section link on an article keeps its address; the hash stays a section', () => {
  assert.deepEqual(routeFromLocation('/blog/why-retries', '#caching'), { path: '__blog', heading: 'why-retries', fromHash: false });
});

test('an address that does not decode is not a crash', () => {
  assert.equal(routeFromLocation('/', '#%E0%A4%A').path, null);
  assert.equal(routeFromLocation('/%E0%A4%A/', '').path, null);
});
