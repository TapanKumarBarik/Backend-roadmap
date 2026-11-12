// Opt-in public profiles: a reader who chooses to can publish a handle, a name and a snapshot of their game (level, XP, streak, problems solved, badges)
// at an address anyone can open. The game is computed in the reader's browser from their own progress, so a snapshot is what they sent and the page says so;
// nothing here is a score to rank anyone by. The snapshot is cut to the numbers and badge ids the game has, so a profile cannot hold free text of its own
// beyond the name. Nothing is public until the reader publishes one, and it is gone when they remove it or delete their account (routes/study.js).

import { createRouter } from '../lib/router.js';
import { first, run } from '../lib/d1.js';
import { getSession } from '../lib/admin.js';
import { checkRateLimit } from '../lib/rateLimit.js';
import game from '../../game.config.json' with { type: 'json' };
import { NAME_MAX, SNAPSHOT_BADGES_MAX, SNAPSHOT_NUMBERS, handleProblem } from '../../webapp/src/lib/profile.js';

const profile = createRouter();

const SAVES = { window: 60 * 60 * 1000, max: 30 };
const BADGES = new Set(game.badges.map((b) => b.id));
const unauthenticated = (c) => c.json({ error: 'unauthenticated' }, 401);

/** The snapshot as the API keeps it: only the numbers it knows, as whole numbers within their bounds, and only the badges the game has; or null when it is not one. */
function cleanSnapshot(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const snapshot = {};
  for (const [field, max] of Object.entries(SNAPSHOT_NUMBERS)) {
    const value = input[field];
    if (!Number.isInteger(value) || value < 0 || value > max) return null;
    snapshot[field] = value;
  }
  if (!Array.isArray(input.badges) || input.badges.length > SNAPSHOT_BADGES_MAX) return null;
  snapshot.badges = [...new Set(input.badges.filter((id) => typeof id === 'string' && BADGES.has(id)))];
  return snapshot;
}

const shape = (row) => ({ handle: row.handle, displayName: row.display_name, snapshot: JSON.parse(row.snapshot), updatedAt: row.updated_at });

// The profile at a handle, for anyone.
profile.get('/profiles/:handle', async (c) => {
  const row = await first(c.env, 'SELECT * FROM public_profiles WHERE handle = ?1', c.req.param('handle').toLowerCase());
  return row ? c.json(shape(row)) : c.json({ error: 'not found' }, 404);
});

// The signed-in reader's own profile, or null when they have not published one.
profile.get('/profile', async (c) => {
  const session = await getSession(c);
  if (!session) return unauthenticated(c);
  const row = await first(c.env, 'SELECT * FROM public_profiles WHERE user_id = ?1', session.sub);
  return c.json(row ? shape(row) : null);
});

// Publishes, or updates, the signed-in reader's profile: { handle, displayName, snapshot }.
profile.put('/profile', async (c) => {
  const session = await getSession(c);
  if (!session) return unauthenticated(c);
  let body;
  try { body = await c.req.json(); } catch { return c.json({ error: 'invalid body' }, 400); }

  const handle = typeof body.handle === 'string' ? body.handle.trim().toLowerCase() : '';
  const problem = handleProblem(handle);
  if (problem) return c.json({ error: problem === 'reserved' ? 'that handle is not available' : 'a handle is 3 to 30 lower-case letters, digits and hyphens' }, 400);
  const displayName = typeof body.displayName === 'string' ? body.displayName.trim().replace(/\s+/g, ' ') : '';
  if (!displayName || displayName.length > NAME_MAX) return c.json({ error: `a name is 1 to ${NAME_MAX} characters` }, 400);
  const snapshot = cleanSnapshot(body.snapshot);
  if (!snapshot) return c.json({ error: 'the snapshot is not one' }, 400);

  if (!(await checkRateLimit(c.env, session.sub, 'profile', SAVES.window, SAVES.max))) return c.json({ error: 'Too many changes: wait a little and try again.' }, 429);
  const taken = await first(c.env, 'SELECT user_id FROM public_profiles WHERE handle = ?1', handle);
  if (taken && taken.user_id !== session.sub) return c.json({ error: 'that handle is taken' }, 409);

  const now = new Date().toISOString();
  await run(
    c.env,
    `INSERT INTO public_profiles (user_id, handle, display_name, snapshot, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?5)
     ON CONFLICT(user_id) DO UPDATE SET handle = ?2, display_name = ?3, snapshot = ?4, updated_at = ?5`,
    session.sub, handle, displayName, JSON.stringify(snapshot), now
  );
  const row = await first(c.env, 'SELECT * FROM public_profiles WHERE user_id = ?1', session.sub);
  return c.json(shape(row));
});

// Takes the profile down: back to private.
profile.delete('/profile', async (c) => {
  const session = await getSession(c);
  if (!session) return unauthenticated(c);
  await run(c.env, 'DELETE FROM public_profiles WHERE user_id = ?1', session.sub);
  return c.body(null, 204);
});

export default profile;
