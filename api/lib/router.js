// Every route file builds its router here, so each handler's `c.env` is typed as the Worker's bindings
// (api/types.d.ts) and `npm run typecheck` can catch a misspelt secret or a missing await on the database.

import { Hono } from 'hono';

/** @returns {Hono<import('../types.js').AppEnv>} */
export function createRouter() {
  return new Hono();
}
