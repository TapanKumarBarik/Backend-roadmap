// Port of api/src/lib/adminAuth.js. Same rules: the owner is decided from an
// env var without touching storage (so a broken admins table can never lock
// them out), granted admins come from the `admins` D1 table, and the result
// is cached briefly per isolate.

import { all, first, run } from './d1.js';
import { SESSION_COOKIE, parseCookies, verify } from './session.js';

const CACHE_TTL_MS = 60 * 1000;
let cache = { at: 0, emails: null };

export function normalize(email) {
  return String(email || '').trim().toLowerCase();
}

function adminEmail(env) {
  return normalize(env.ADMIN_EMAIL || 'tapankumarbarik7@gmail.com');
}

// Reads and verifies our own signed session cookie. Async because the HMAC
// verify is async on Web Crypto.
export async function getSession(c) {
  const cookies = parseCookies(c.req.header('cookie'));
  return verify(cookies[SESSION_COOKIE], c.env.SESSION_SECRET);
}

export function isRootAdmin(env, session) {
  return !!(session && session.email && normalize(session.email) === adminEmail(env));
}

export function invalidateAdminCache() {
  cache = { at: 0, emails: null };
}

async function grantedAdminEmails(env) {
  if (cache.emails && Date.now() - cache.at < CACHE_TTL_MS) return cache.emails;
  const emails = new Set();
  try {
    for (const row of await all(env, 'SELECT email FROM admins')) {
      emails.add(normalize(row.email));
    }
  } catch {
    cache = { at: Date.now(), emails: new Set() };
    return cache.emails;
  }
  cache = { at: Date.now(), emails };
  return emails;
}

export async function isAdmin(env, session) {
  if (!session || !session.email) return false;
  if (isRootAdmin(env, session)) return true;
  return (await grantedAdminEmails(env)).has(normalize(session.email));
}

export async function listAdmins(env) {
  const out = [];
  try {
    for (const row of await all(env, 'SELECT email, granted_by, granted_at FROM admins')) {
      out.push({
        email: normalize(row.email),
        grantedBy: row.granted_by || null,
        grantedAt: row.granted_at || null,
        root: false
      });
    }
  } catch { /* no rows yet — root is still an admin */ }
  return [{ email: adminEmail(env), grantedBy: null, grantedAt: null, root: true }, ...out];
}

export async function grantAdmin(env, email, byEmail) {
  const normalized = normalize(email);
  await run(
    env,
    `INSERT INTO admins (email, granted_by, granted_at) VALUES (?1, ?2, ?3)
     ON CONFLICT(email) DO UPDATE SET granted_by = ?2, granted_at = ?3`,
    normalized,
    normalize(byEmail),
    new Date().toISOString()
  );
  invalidateAdminCache();
}

export async function revokeAdmin(env, email) {
  await run(env, 'DELETE FROM admins WHERE email = ?1', normalize(email));
  invalidateAdminCache();
}

// Guard used by admin-only routes: returns a Response to short-circuit with,
// or null to proceed.
export async function requireAdmin(c) {
  const session = await getSession(c);
  if (!session) return c.json({ error: 'unauthenticated' }, 401);
  if (!(await isAdmin(c.env, session))) return c.json({ error: 'forbidden' }, 403);
  return null;
}

export { adminEmail, first };
