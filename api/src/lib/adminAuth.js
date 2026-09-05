const { getTable } = require('./tableClient');
const { SESSION_COOKIE, parseCookies, verify } = require('./session');

// The owner. Hardcoded server-side, never read from a header, query or any
// other client-supplied value — that's what makes it unspoofable regardless
// of what a caller claims about themselves. It is also deliberately NOT
// revocable through the admin UI: the whole point of a root account is that
// no sequence of clicks can lock you out of your own site.
const ADMIN_EMAIL = 'tapankumarbarik7@gmail.com';

const TABLE_NAME = 'Admins';
const PARTITION = 'admin';

// Every admin-gated request would otherwise do a table read just to find out
// whether it's allowed. A short TTL keeps that off the hot path while still
// making a grant or revoke take effect within a minute — fast enough for
// "add my friend as an admin", and the granting session is corrected
// immediately anyway because a write invalidates the cache.
const CACHE_TTL_MS = 60 * 1000;
let cache = { at: 0, emails: null };

function normalize(email) {
  return String(email || '').trim().toLowerCase();
}

function getSession(request) {
  const cookies = parseCookies(request.headers.get('cookie'));
  return verify(cookies[SESSION_COOKIE]);
}

// Root is decided without touching storage, so a broken or empty Admins
// table can never lock the owner out of the site.
function isRootAdmin(session) {
  return !!(session && session.email && normalize(session.email) === ADMIN_EMAIL);
}

function invalidateAdminCache() {
  cache = { at: 0, emails: null };
}

async function grantedAdminEmails() {
  if (cache.emails && Date.now() - cache.at < CACHE_TTL_MS) return cache.emails;
  const emails = new Set();
  try {
    const table = getTable(TABLE_NAME);
    for await (const entity of table.listEntities({
      queryOptions: { filter: `PartitionKey eq '${PARTITION}'` }
    })) {
      emails.add(normalize(entity.email || decodeURIComponent(entity.rowKey)));
    }
  } catch {
    // Table missing (nobody has ever been granted) or storage briefly
    // unavailable. Falling back to "root only" is the safe direction: it
    // withholds access rather than granting it.
    cache = { at: Date.now(), emails: new Set() };
    return cache.emails;
  }
  cache = { at: Date.now(), emails };
  return emails;
}

// ASYNC. Every call site must await it — `!isAdmin(session)` on an
// un-awaited promise is always false, which would wave everyone through.
// scripts/check-admin-guards.js fails the build if any call is missing its
// await, because that mistake is invisible in review and total in effect.
async function isAdmin(session) {
  if (!session || !session.email) return false;
  if (isRootAdmin(session)) return true;
  return (await grantedAdminEmails()).has(normalize(session.email));
}

async function listAdmins() {
  const table = getTable(TABLE_NAME);
  const out = [];
  try {
    for await (const entity of table.listEntities({
      queryOptions: { filter: `PartitionKey eq '${PARTITION}'` }
    })) {
      out.push({
        email: normalize(entity.email || decodeURIComponent(entity.rowKey)),
        grantedBy: entity.grantedBy || null,
        grantedAt: entity.grantedAt || null,
        root: false
      });
    }
  } catch { /* no table yet — root is still an admin */ }
  return [{ email: ADMIN_EMAIL, grantedBy: null, grantedAt: null, root: true }, ...out];
}

async function grantAdmin(email, byEmail) {
  const normalized = normalize(email);
  const table = getTable(TABLE_NAME);
  await table.createTable().catch(() => {});
  await table.upsertEntity({
    partitionKey: PARTITION,
    rowKey: encodeURIComponent(normalized),
    email: normalized,
    grantedBy: normalize(byEmail),
    grantedAt: new Date().toISOString()
  }, 'Replace');
  invalidateAdminCache();
}

async function revokeAdmin(email) {
  const normalized = normalize(email);
  const table = getTable(TABLE_NAME);
  try {
    await table.deleteEntity(PARTITION, encodeURIComponent(normalized));
  } catch (err) {
    if (err.statusCode !== 404) throw err;
  }
  invalidateAdminCache();
}

module.exports = {
  getSession,
  isAdmin,
  isRootAdmin,
  listAdmins,
  grantAdmin,
  revokeAdmin,
  invalidateAdminCache,
  normalize,
  ADMIN_EMAIL
};
