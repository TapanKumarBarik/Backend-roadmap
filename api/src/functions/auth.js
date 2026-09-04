const { app } = require('@azure/functions');
const crypto = require('crypto');
const { SESSION_COOKIE, parseCookies, sign, verify, cookieAttrs } = require('../lib/session');
const { isAdmin } = require('../lib/adminAuth');

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const STATE_COOKIE = 'oauth_state';
const SESSION_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

// Headers seen through the SWA managed-Functions proxy point at the Function
// App's internal *.azurewebsites.net host, not the public site, so the
// redirect_uri Google sees must come from an explicit setting instead.
function siteOrigin() {
  return process.env.SITE_ORIGIN;
}

app.http('authLogin', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'auth/login',
  handler: async (request) => {
    const origin = siteOrigin();
    const state = crypto.randomBytes(16).toString('hex');
    const redirect = request.query.get('redirect') || '/';
    const params = new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID,
      redirect_uri: `${origin}/api/auth/callback`,
      response_type: 'code',
      scope: 'openid email profile',
      state,
      prompt: 'select_account'
    });
    const headers = new Headers();
    headers.set('Location', `${GOOGLE_AUTH_URL}?${params.toString()}`);
    headers.set('Set-Cookie', cookieAttrs(STATE_COOKIE, encodeURIComponent(JSON.stringify({ state, redirect })), 600));
    return { status: 302, headers };
  }
});

app.http('authCallback', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'auth/callback',
  handler: async (request) => {
    const origin = siteOrigin();
    const cookies = parseCookies(request.headers.get('cookie'));
    let stateData = {};
    try { stateData = JSON.parse(cookies[STATE_COOKIE] || '{}'); } catch { /* ignore */ }

    const code = request.query.get('code');
    const state = request.query.get('state');
    if (!code || !state || !stateData.state || state !== stateData.state) {
      return { status: 400, body: 'Sign-in link expired or invalid. Go back and try again.' };
    }

    const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
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
    if (claims.aud !== process.env.GOOGLE_CLIENT_ID || !validIssuer || !claims.email_verified) {
      return { status: 401, body: 'Token validation failed.' };
    }

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
    return { jsonBody: { user: { userId: session.sub, email: session.email, name: session.name, picture: session.picture || null, isAdmin: isAdmin(session) } } };
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
