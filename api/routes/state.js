// A reader's own state, kept so it follows them from one device to another (migration 0009: user_state). The Prep Tracker is the first: its progress lives in the
// browser, and a signed-in reader who chooses to also keeps a copy here. The server does not read it: it keeps what was sent (a JSON object, at most as large as
// webapp/src/config/sync.js allows for that name) and the moment it was kept, and the browser does the merging (webapp/src/lib/tracker/sync.js).
//
// A write quotes the `updatedAt` it was based on (`base`, null for the first): when someone else has written since, it is refused with 409 and what is there now,
// so two devices never overwrite each other without the second one seeing the first. Everything is private to the signed-in reader.

import { createRouter } from '../lib/router.js';
import { first, run } from '../lib/d1.js';
import { getSession } from '../lib/admin.js';
import { checkRateLimit } from '../lib/rateLimit.js';
import { SYNC } from '../../webapp/src/config/sync.js';

const state = createRouter();

const unauthenticated = (c) => c.json({ error: 'unauthenticated' }, 401);
const specOf = (name) => (Object.prototype.hasOwnProperty.call(SYNC.names, name) ? SYNC.names[name] : null);
const shape = (row) => ({ updatedAt: row ? row.updated_at : null, data: row ? JSON.parse(row.data) : null });
const isObject = (value) => !!value && typeof value === 'object' && !Array.isArray(value);

// What is kept under a name for the signed-in reader: { updatedAt, data }, both null when there is nothing.
state.get('/state/:name', async (c) => {
  const session = await getSession(c);
  if (!session) return unauthenticated(c);
  if (!specOf(c.req.param('name'))) return c.json({ error: 'not found' }, 404);
  const row = await first(c.env, 'SELECT data, updated_at FROM user_state WHERE user_id = ?1 AND name = ?2', session.sub, c.req.param('name'));
  return c.json(shape(row));
});

// Keeps `data` under a name: { data, base }. 200 { updatedAt }; 409 { error, updatedAt, data } when what is there is not what `base` says.
state.put('/state/:name', async (c) => {
  const session = await getSession(c);
  if (!session) return unauthenticated(c);
  const name = c.req.param('name');
  const spec = specOf(name);
  if (!spec) return c.json({ error: 'not found' }, 404);

  /** @type {any} */
  let body = null;
  try { body = await c.req.json(); } catch { body = null; }
  if (!isObject(body) || !isObject(body.data) || !(body.base === null || typeof body.base === 'string')) return c.json({ error: 'send { data, base }' }, 400);
  const text = JSON.stringify(body.data);
  if (text.length > spec.maxChars) return c.json({ error: 'This is too large to keep. Save a backup file instead.' }, 413);
  if (!(await checkRateLimit(c.env, session.sub, 'state', 60 * 60 * 1000, SYNC.writesPerHour))) return c.json({ error: 'Too many saves: wait a little and try again.' }, 429);

  // Strictly later than the copy it replaces, so a browser that quotes the old stamp is never mistaken for one that quotes the new (two saves in the same millisecond).
  const based = body.base === null ? 0 : Date.parse(body.base);
  const now = new Date(Math.max(Date.now(), Number.isNaN(based) ? 0 : based + 1)).toISOString();
  const result = body.base === null
    ? await run(c.env, 'INSERT INTO user_state (user_id, name, data, updated_at) VALUES (?1, ?2, ?3, ?4) ON CONFLICT(user_id, name) DO NOTHING', session.sub, name, text, now)
    : await run(c.env, 'UPDATE user_state SET data = ?3, updated_at = ?4 WHERE user_id = ?1 AND name = ?2 AND updated_at = ?5', session.sub, name, text, now, body.base);
  if (result.meta && result.meta.changes) return c.json({ updatedAt: now });

  const current = await first(c.env, 'SELECT data, updated_at FROM user_state WHERE user_id = ?1 AND name = ?2', session.sub, name);
  return c.json({ error: 'Another device saved first.', ...shape(current) }, 409);
});

// Stops keeping it: what is there is deleted.
state.delete('/state/:name', async (c) => {
  const session = await getSession(c);
  if (!session) return unauthenticated(c);
  if (!specOf(c.req.param('name'))) return c.json({ error: 'not found' }, 404);
  await run(c.env, 'DELETE FROM user_state WHERE user_id = ?1 AND name = ?2', session.sub, c.req.param('name'));
  return c.body(null, 204);
});

export default state;
