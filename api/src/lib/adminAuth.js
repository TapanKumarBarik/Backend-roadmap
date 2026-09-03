const { SESSION_COOKIE, parseCookies, verify } = require('./session');

// Hardcoded server-side, never read from a header/query/client-supplied
// value — that's what makes this unspoofable regardless of what a caller
// claims about themselves.
const ADMIN_EMAIL = 'tapankumarbarik7@gmail.com';

function getSession(request) {
  const cookies = parseCookies(request.headers.get('cookie'));
  return verify(cookies[SESSION_COOKIE]);
}

function isAdmin(session) {
  return !!(session && session.email && session.email.toLowerCase() === ADMIN_EMAIL);
}

module.exports = { getSession, isAdmin, ADMIN_EMAIL };
