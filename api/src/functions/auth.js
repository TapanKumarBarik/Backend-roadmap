const { app } = require('@azure/functions');
const crypto = require('crypto');
const { SESSION_COOKIE, parseCookies, sign, verify, cookieAttrs } = require('../lib/session');
const { isAdmin } = require('../lib/adminAuth');
const { getTable } = require('../lib/tableClient');

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const STATE_COOKIE = 'oauth_state';
const SESSION_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

// Trailing whitespace in these has bitten us before: a value pasted into the
// portal on Windows can carry a stray \r, which then travels in the OAuth
// request and, worse, makes the claims.aud equality check below fail.
function clientId() {
  return (process.env.GOOGLE_CLIENT_ID || '').trim();
}

function clientSecret() {
  return (process.env.GOOGLE_CLIENT_SECRET || '').trim();
}

// The public origins this app answers on, most-canonical first.
// SITE_ORIGINS is comma-separated; SITE_ORIGIN is the older single-value
// name, still honoured so the setting can be migrated without a flag day.
function allowedOrigins() {
  const raw = process.env.SITE_ORIGINS || process.env.SITE_ORIGIN || '';
  return raw
    .split(',')
    .map((s) => s.trim().replace(/\/+$/, ''))
    .filter(Boolean);
}

// request.headers.get('host') is no use here: through the SWA managed-Functions
// proxy it names the Function App's internal *.azurewebsites.net host rather
// than the site the browser actually asked for. SWA does forward the original
// public URL as x-ms-original-url, which is what lets one deployment serve
// several domains.
//
// This matters beyond cosmetics. The oauth_state cookie is host-only (no
// Domain attribute, see lib/session.js), so if login starts on domain A and
// Google is told to call back on domain B, the cookie never reaches the
// callback and every sign-in dies on the state check. The redirect_uri has to
// name whichever domain the user is actually on.
//
// Derived origins are checked against the allowlist before use: a forged Host
// header must not be able to aim redirect_uri at someone else's domain. Google
// rejecting unregistered redirect_uris is a second line of defence, not the
// only one.
function siteOrigin(request) {
  const allowed = allowedOrigins();
  const fallback = allowed[0] || '';
  if (!request) return fallback;

  let candidate = null;

  // Prefer the full origin: it carries the scheme and any port, which matters
  // for local dev on http://localhost.
  const originalUrl = request.headers.get('x-ms-original-url');
  if (originalUrl) {
    try { candidate = new URL(originalUrl).origin; } catch { /* not a usable URL */ }
  }

  if (!candidate) {
    // x-forwarded-host can accumulate a comma-separated list; the first entry
    // is the original client-facing host. No scheme here, and anything
    // reaching SWA publicly is https.
    const fwd = request.headers.get('x-forwarded-host');
    if (fwd) candidate = `https://${fwd.split(',')[0].trim()}`;
  }

  if (!candidate) return fallback;
  return allowed.includes(candidate) ? candidate : fallback;
}

const USERS_TABLE = 'Users';

// There was no user directory: progress, notes and bookmarks are keyed by
// Google's `sub`, while page views record an email, and nothing anywhere held
// a name or an avatar. The admin screens had no way to show who anyone is.
//
// Sign-in is the one moment the app holds all of it at once, so record it
// here. Best-effort by design — a storage hiccup must never cost someone their
// sign-in, which is why this is caught and dropped rather than awaited into
// the response path.
async function recordUser(claims) {
  try {
    const table = getTable(USERS_TABLE);
    await table.createTable().catch(() => {});
    const now = new Date().toISOString();
    const row = {
      partitionKey: 'user',
      rowKey: claims.sub,
      email: String(claims.email || '').toLowerCase(),
      name: claims.name || claims.email || '',
      picture: claims.picture || '',
      lastSeen: now
    };
    // firstSeen is set only when the row is new, so it survives every
    // subsequent sign-in rather than being reset to "now" each time.
    try {
      await table.getEntity('user', claims.sub);
      await table.updateEntity(row, 'Merge');
    } catch (err) {
      if (err.statusCode !== 404) throw err;
      await table.createEntity({ ...row, firstSeen: now });
    }
  } catch {
    // Directory is a nicety; signing in is not.
  }
}

app.http('authLogin', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'auth/login',
  handler: async (request) => {
    const origin = siteOrigin(request);
    const state = crypto.randomBytes(16).toString('hex');
    const redirect = request.query.get('redirect') || '/';
    const params = new URLSearchParams({
      client_id: clientId(),
      redirect_uri: `${origin}/api/auth/callback`,
      response_type: 'code',
      scope: 'openid email profile',
      state,
      prompt: 'select_account'
    });
    const headers = new Headers();
    headers.set('Location', `${GOOGLE_AUTH_URL}?${params.toString()}`);
    // The origin rides along in the state cookie so the callback can reuse the
    // exact redirect_uri that was sent to Google, rather than re-deriving it
    // and risking a mismatch the token exchange would reject.
    headers.set('Set-Cookie', cookieAttrs(STATE_COOKIE, encodeURIComponent(JSON.stringify({ state, redirect, origin })), 600));
    return { status: 302, headers };
  }
});

app.http('authCallback', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'auth/callback',
  handler: async (request) => {
    const cookies = parseCookies(request.headers.get('cookie'));
    let stateData = {};
    try { stateData = JSON.parse(cookies[STATE_COOKIE] || '{}'); } catch { /* ignore */ }

    const code = request.query.get('code');
    const state = request.query.get('state');
    if (!code || !state || !stateData.state || state !== stateData.state) {
      return { status: 400, body: 'Sign-in link expired or invalid. Go back and try again.' };
    }

    // Whatever redirect_uri authLogin sent to Google has to be repeated
    // verbatim in the token exchange, so prefer the one it recorded.
    const origin = stateData.origin || siteOrigin(request);

    const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId(),
        client_secret: clientSecret(),
        redirect_uri: `${origin}/api/auth/callback`,
        grant_type: 'authorization_code'
      })
    });
    if (!tokenRes.ok) return { status: 401, body: 'Google sign-in failed.' };
    const tokens = await tokenRes.json();

    const idParts = (tokens.id_token || '').split('.');
    if (idParts.length !== 3) return { status: 401, body: 'Google sign-in failed.' };
    const claims = JSON.parse(Buffer.from(idParts[1], 'base64url').toString('utf-8'));
    const validIssuer = claims.iss === 'https://accounts.google.com' || claims.iss === 'accounts.google.com';
    if (claims.aud !== clientId() || !validIssuer || !claims.email_verified) {
      return { status: 401, body: 'Token validation failed.' };
    }

    await recordUser(claims);

    const session = sign({
      sub: claims.sub,
      email: claims.email,
      name: claims.name || claims.email,
      picture: claims.picture || null,
      exp: Date.now() + SESSION_MAX_AGE * 1000
    });

    // A single Set-Cookie here, deliberately: the SWA managed-Functions proxy
    // has been unreliable forwarding multiple Set-Cookie headers on one
    // response. The state cookie is short-lived (Max-Age=600) and doesn't
    // need explicit clearing.
    const headers = new Headers();
    headers.set('Location', stateData.redirect || '/');
    headers.set('Set-Cookie', cookieAttrs(SESSION_COOKIE, session, SESSION_MAX_AGE));
    return { status: 302, headers };
  }
});

app.http('authMe', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'auth/me',
  handler: async (request) => {
    const cookies = parseCookies(request.headers.get('cookie'));
    const session = verify(cookies[SESSION_COOKIE]);
    if (!session) return { jsonBody: { user: null } };
    return { jsonBody: { user: { userId: session.sub, email: session.email, name: session.name, picture: session.picture || null, isAdmin: await isAdmin(session) } } };
  }
});

app.http('authLogout', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'auth/logout',
  handler: async (request) => {
    const redirect = request.query.get('redirect') || '/';
    const headers = new Headers();
    headers.set('Location', redirect);
    headers.set('Set-Cookie', cookieAttrs(SESSION_COOKIE, '', 0));
    return { status: 302, headers };
  }
});
