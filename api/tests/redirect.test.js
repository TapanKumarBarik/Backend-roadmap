import { test } from 'node:test';
import assert from 'node:assert/strict';
import app from '../app.js';
import { safeRedirect } from '../lib/util.js';
import { createEnv } from './helpers.js';

// After signing in or out the browser is sent back to where it was. That address comes from the query string, so it must
// never be able to point anywhere but this site.
const BACKSLASH = String.fromCharCode(92);

test('a path on this site is kept, with its query and its fragment', () => {
  assert.equal(safeRedirect('/'), '/');
  assert.equal(safeRedirect('/backend/03-auth/01-sessions/'), '/backend/03-auth/01-sessions/');
  assert.equal(safeRedirect('/#__feed'), '/#__feed', 'a screen of the app lives in the fragment');
  assert.equal(safeRedirect('/?a=1#__feed@123'), '/?a=1#__feed@123');
});

test('anything that could leave the site becomes the home page', () => {
  const hostile = [
    'https://evil.example/',
    '//evil.example',
    '///evil.example',
    `/${BACKSLASH}evil.example`,
    `${BACKSLASH}${BACKSLASH}evil.example`,
    'javascript:alert(1)',
    'evil.example',
    '/ok\r\nSet-Cookie: x=1',
    `/ok${String.fromCharCode(0)}`,
    '/' + 'a'.repeat(2001),
    undefined, null, 42, {}
  ];
  for (const value of hostile) assert.equal(safeRedirect(value), '/', `${String(value).slice(0, 40)}`);
  assert.equal(safeRedirect('https://evil.example/', '/home'), '/home', 'a fallback can be given');
});

test('the sign-in link remembers only a safe address', async () => {
  const env = createEnv({ GOOGLE_CLIENT_ID: 'id' });
  for (const [asked, kept] of [['/#__feed', '/#__feed'], ['//evil.example', '/'], ['https://evil.example', '/']]) {
    const res = await app.request(`/api/auth/login?redirect=${encodeURIComponent(asked)}`, {}, env);
    assert.equal(res.status, 302);
    const state = JSON.parse(decodeURIComponent(/oauth_state=([^;]+)/.exec(res.headers.get('set-cookie'))[1]));
    assert.equal(state.redirect, kept, `asked for ${asked}`);
  }
});

test('signing out goes back to a safe address only', async () => {
  const env = createEnv();
  const back = await app.request(`/api/auth/logout?redirect=${encodeURIComponent('/#__books')}`, {}, env);
  assert.equal(back.headers.get('location'), '/#__books');
  const away = await app.request(`/api/auth/logout?redirect=${encodeURIComponent('https://evil.example')}`, {}, env);
  assert.equal(away.headers.get('location'), '/');
});
