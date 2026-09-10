// Port of api/src/functions/auth.js — custom Google OAuth. The one real
// simplification: on Cloudflare Pages the request URL is the true public URL,
// so siteOrigin() no longer has to dig the original host out of SWA's
// x-ms-original-url / x-forwarded-host proxy headers.

import { Hono } from 'hono';
import { run } from '../lib/d1.js';
import { SESSION_COOKIE, parseCookies, sign, verify, cookieAttrs } from '../lib/session.js';
import { isAdmin } from '../lib/admin.js';
import { randomHex } from '../lib/util.js';

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const STATE_COOKIE = 'oauth_state';
const SESSION_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

const auth = new Hono();

function clientId(env) {
  return (env.GOOGLE_CLIENT_ID || '').trim();
}
function clientSecret(env) {
  return (env.GOOGLE_CLIENT_SECRET || '').trim();
}

function allowedOrigins(env) {
  const raw = env.SITE_ORIGINS || env.SITE_ORIGIN || '';
  return raw.split(',').map((s) => s.trim().replace(/\/+$/, '')).filter(Boolean);
}

// The origin the browser is actually on, checked against the allowlist so a
// forged Host can't aim redirect_uri at another domain. Falls back to the
// first configured origin.
function siteOrigin(c) {
  const allowed = allowedOrigins(c.env);
  const fallback = allowed[0] || '';
  let candidate;
  try { candidate = new URL(c.req.url).origin; } catch { return fallback; }
  return allowed.includes(candidate) ? candidate : fallback;
}

// Sign-in is the one moment we hold id + email + name + avatar at once, so
// record the user directory row here. Best-effort — a DB hiccup must never
// cost someone their sign-in.
async function recordUser(env, claims) {
  try {
    const now = new Date().toISOString();
    await run(
      env,
      `INSERT INTO users (user_id, email, name, picture, first_seen, last_seen)
       VALUES (?1, ?2, ?3, ?4, ?5, ?5)
       ON CONFLICT(user_id) DO UPDATE SET email = ?2, name = ?3, picture = ?4, last_seen = ?5`,
      claims.sub,
      String(claims.email || '').toLowerCase(),
      claims.name || claims.email || '',
      claims.picture || '',
      now
    );
  } catch { /* directory is a nicety; signing in is not */ }
}

auth.get('/auth/login', (c) => {
  const origin = siteOrigin(c);
  const state = randomHex(16);
  const redirect = c.req.query('redirect') || '/';
  const params = new URLSearchParams({
    client_id: clientId(c.env),
    redirect_uri: `${origin}/api/auth/callback`,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    prompt: 'select_account'
  });
  c.header('Set-Cookie', cookieAttrs(
    STATE_COOKIE,
    encodeURIComponent(JSON.stringify({ state, redirect, origin })),
    600
  ));
  return c.redirect(`${GOOGLE_AUTH_URL}?${params.toString()}`, 302);
});

auth.get('/auth/callback', async (c) => {
  const cookies = parseCookies(c.req.header('cookie'));
  let stateData = {};
  try { stateData = JSON.parse(cookies[STATE_COOKIE] || '{}'); } catch { /* ignore */ }

  const code = c.req.query('code');
  const state = c.req.query('state');
  if (!code || !state || !stateData.state || state !== stateData.state) {
    return c.text('Sign-in link expired or invalid. Go back and try again.', 400);
  }

  const origin = stateData.origin || siteOrigin(c);

  const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId(c.env),
      client_secret: clientSecret(c.env),
      redirect_uri: `${origin}/api/auth/callback`,
      grant_type: 'authorization_code'
    })
  });
  if (!tokenRes.ok) return c.text('Google sign-in failed.', 401);
  const tokens = await tokenRes.json();

  const idParts = (tokens.id_token || '').split('.');
  if (idParts.length !== 3) return c.text('Google sign-in failed.', 401);
  let claims;
  try { claims = JSON.parse(Buffer.from(idParts[1], 'base64url').toString('utf-8')); }
  catch { return c.text('Google sign-in failed.', 401); }

  const validIssuer = claims.iss === 'https://accounts.google.com' || claims.iss === 'accounts.google.com';
  if (claims.aud !== clientId(c.env) || !validIssuer || !claims.email_verified) {
    return c.text('Token validation failed.', 401);
  }

  await recordUser(c.env, claims);

  const session = await sign({
    sub: claims.sub,
    email: claims.email,
    name: claims.name || claims.email,
    picture: claims.picture || null,
    exp: Date.now() + SESSION_MAX_AGE * 1000
  }, c.env.SESSION_SECRET);

  c.header('Set-Cookie', cookieAttrs(SESSION_COOKIE, session, SESSION_MAX_AGE));
  return c.redirect(stateData.redirect || '/', 302);
});

auth.get('/auth/me', async (c) => {
  const cookies = parseCookies(c.req.header('cookie'));
  const session = await verify(cookies[SESSION_COOKIE], c.env.SESSION_SECRET);
  if (!session) return c.json({ user: null });
  return c.json({
    user: {
      userId: session.sub,
      email: session.email,
      name: session.name,
      picture: session.picture || null,
      isAdmin: await isAdmin(c.env, session)
    }
  });
});

auth.get('/auth/logout', (c) => {
  const redirect = c.req.query('redirect') || '/';
  c.header('Set-Cookie', cookieAttrs(SESSION_COOKIE, '', 0));
  return c.redirect(redirect, 302);
});

export default auth;
