import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkRateLimit } from '../lib/rateLimit.js';
import { createEnv } from './helpers.js';

const WINDOW = 10 * 60 * 1000;

test('a reader gets the allowed number of writes in a window, and the next one is refused', async () => {
  const env = createEnv();
  for (let i = 0; i < 3; i++) assert.equal(await checkRateLimit(env, 'u1', 'feed', WINDOW, 3), true, `write ${i + 1}`);
  assert.equal(await checkRateLimit(env, 'u1', 'feed', WINDOW, 3), false);
  assert.equal(await checkRateLimit(env, 'u1', 'feed', WINDOW, 3), false, 'and it stays refused');
});

test('the limit is per reader and per kind of write', async () => {
  const env = createEnv();
  assert.equal(await checkRateLimit(env, 'u1', 'feed', WINDOW, 1), true);
  assert.equal(await checkRateLimit(env, 'u1', 'feed', WINDOW, 1), false);
  assert.equal(await checkRateLimit(env, 'u2', 'feed', WINDOW, 1), true, 'another reader is not affected');
  assert.equal(await checkRateLimit(env, 'u1', 'books', WINDOW, 1), true, 'nor is another kind of write');
});

test('when the window has passed the count starts again', async () => {
  const env = createEnv();
  await checkRateLimit(env, 'u1', 'feed', WINDOW, 1);
  assert.equal(await checkRateLimit(env, 'u1', 'feed', WINDOW, 1), false);

  const longAgo = new Date(Date.now() - WINDOW - 1000).toISOString();
  env.DB.raw.prepare('UPDATE rate_limits SET window_start = ? WHERE user_id = ?').run(longAgo, 'u1');
  assert.equal(await checkRateLimit(env, 'u1', 'feed', WINDOW, 1), true);
});
