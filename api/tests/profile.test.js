// Opt-in public profiles, end to end on the real app and an in-memory database: nothing is public until a reader publishes, what they publish is cut to what the game
// has, a handle is theirs alone, they can take it down, and deleting the account takes it down too.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import app from '../app.js';
import game from '../../game.config.json' with { type: 'json' };
import { createEnv, signedInAs } from './helpers.js';

let env;
let ada;
let grace;
beforeEach(async () => {
  env = createEnv();
  ada = await signedInAs('ada@example.com', { name: 'Ada Lovelace' });
  grace = await signedInAs('grace@example.com', { name: 'Grace Hopper' });
});

async function call(cookie, method, path, body) {
  const res = await app.request(`/api${path}`, {
    method,
    headers: { ...(cookie ? { cookie } : {}), ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
    body: body === undefined ? undefined : JSON.stringify(body)
  }, env);
  const raw = await res.text();
  return { status: res.status, json: raw ? JSON.parse(raw) : null };
}

const SNAPSHOT = { level: 4, xp: 320, streak: 5, longest: 9, problems: 12, modules: 30, quizzes: 3, drills: 7, mocks: 1, plans: 0, badges: ['first-step', 'problem-solver'] };
const profile = (extra = {}) => ({ handle: 'ada', displayName: 'Ada', snapshot: SNAPSHOT, ...extra });

test('nothing is public until a reader publishes, then anyone can read it, and it is what they sent', async () => {
  assert.equal((await call(null, 'GET', '/profiles/ada')).status, 404);
  assert.equal((await call(ada, 'GET', '/profile')).json, null, 'signed in, with nothing published');

  const made = await call(ada, 'PUT', '/profile', profile());
  assert.equal(made.status, 200);
  assert.deepEqual([made.json.handle, made.json.displayName], ['ada', 'Ada']);

  const read = await call(null, 'GET', '/profiles/ada');
  assert.equal(read.status, 200);
  assert.deepEqual(read.json.snapshot, SNAPSHOT);
  assert.equal(read.json.displayName, 'Ada');
  assert.deepEqual(Object.keys(read.json).sort(), ['displayName', 'handle', 'snapshot', 'updatedAt'], 'no user id, no e-mail address');
  assert.equal((await call(null, 'GET', '/profiles/ADA')).status, 200, 'a handle is read in lower case');
  assert.deepEqual((await call(ada, 'GET', '/profile')).json.snapshot, SNAPSHOT);
  assert.equal((await call(grace, 'GET', '/profile')).json, null, "somebody else's profile is not Grace's");
});

test('publishing again updates the same profile, and the handle can change', async () => {
  await call(ada, 'PUT', '/profile', profile());
  await call(ada, 'PUT', '/profile', profile({ handle: 'ada-lovelace', displayName: 'Ada L', snapshot: { ...SNAPSHOT, xp: 400 } }));
  assert.equal((await call(null, 'GET', '/profiles/ada')).status, 404, 'the old handle is free again');
  const now = await call(null, 'GET', '/profiles/ada-lovelace');
  assert.deepEqual([now.json.displayName, now.json.snapshot.xp], ['Ada L', 400]);
  assert.equal(env.DB.raw.prepare('SELECT COUNT(*) AS n FROM public_profiles').get().n, 1);
});

test('a handle is one reader\'s: taken is refused, a bad or reserved one is refused, and the name is bounded', async () => {
  await call(ada, 'PUT', '/profile', profile());
  assert.equal((await call(grace, 'PUT', '/profile', profile({ displayName: 'Grace' }))).status, 409, 'taken');
  for (const handle of ['ab', 'a'.repeat(31), 'Has Space', '-start', 'end-', 'two--hyphens', 'ünï', 'admin', 'api', 'ME', '', 5]) {
    assert.equal((await call(grace, 'PUT', '/profile', profile({ handle }))).status, 400, `handle ${JSON.stringify(handle)}`);
  }
  assert.equal((await call(grace, 'PUT', '/profile', profile({ handle: 'grace', displayName: '' }))).status, 400);
  assert.equal((await call(grace, 'PUT', '/profile', profile({ handle: 'grace', displayName: 'x'.repeat(41) }))).status, 400);
  assert.equal((await call(grace, 'PUT', '/profile', profile({ handle: 'grace', displayName: '  Grace   Hopper ' }))).json.displayName, 'Grace Hopper', 'spaces are tidied');
  assert.equal((await call(null, 'PUT', '/profile', profile())).status, 401, 'signed in only');
});

test('the snapshot is cut to what the game has: numbers within bounds, and badges that exist', async () => {
  const bad = [{ ...SNAPSHOT, xp: -1 }, { ...SNAPSHOT, xp: 1.5 }, { ...SNAPSHOT, level: 101 }, { ...SNAPSHOT, streak: '5' }, { ...SNAPSHOT, badges: 'all' }, { ...SNAPSHOT, badges: Array(101).fill('first-step') }, null, [], 'text'];
  for (const snapshot of bad) assert.equal((await call(ada, 'PUT', '/profile', profile({ snapshot }))).status, 400, JSON.stringify(snapshot));
  const { problems: dropped, ...missing } = SNAPSHOT;
  assert.equal((await call(ada, 'PUT', '/profile', profile({ snapshot: missing }))).status, 400, `a snapshot without ${Object.keys({ dropped })}`);

  const made = await call(ada, 'PUT', '/profile', profile({ snapshot: { ...SNAPSHOT, extra: 'free text <script>', badges: ['first-step', 'first-step', 'not-a-badge', '<b>x</b>', game.badges[1].id] } }));
  assert.equal(made.status, 200);
  assert.deepEqual(made.json.snapshot.badges, ['first-step', game.badges[1].id], 'only real badges, once');
  assert.equal(made.json.snapshot.extra, undefined, 'nothing else is kept');
});

test('a reader takes the profile down, and deleting the account takes it down too', async () => {
  await call(ada, 'PUT', '/profile', profile());
  assert.equal((await call(ada, 'DELETE', '/profile')).status, 204);
  assert.equal((await call(null, 'GET', '/profiles/ada')).status, 404);
  assert.equal((await call(ada, 'GET', '/profile')).json, null);

  await call(ada, 'PUT', '/profile', profile());
  await call(grace, 'PUT', '/profile', profile({ handle: 'grace', displayName: 'Grace' }));
  assert.equal((await call(ada, 'DELETE', '/account')).status, 204);
  assert.equal((await call(null, 'GET', '/profiles/ada')).status, 404, 'her profile is gone with her account');
  assert.equal((await call(null, 'GET', '/profiles/grace')).status, 200, "and Grace's is not touched");
});

test('publishing is rate limited', async () => {
  let last = 200;
  for (let i = 0; i < 31 && last === 200; i++) last = (await call(ada, 'PUT', '/profile', profile({ snapshot: { ...SNAPSHOT, xp: i } }))).status;
  assert.equal(last, 429);
});
