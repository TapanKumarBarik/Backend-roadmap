import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCookies, sign, verify } from '../lib/session.js';
import { SESSION_SECRET } from './helpers.js';

const payload = (exp = Date.now() + 60_000) => ({ sub: 'u1', email: 'a@example.com', name: 'A', exp });

test('a signed session verifies and returns what was signed', async () => {
  const token = await sign(payload(), SESSION_SECRET);
  const session = await verify(token, SESSION_SECRET);
  assert.equal(session.email, 'a@example.com');
  assert.equal(session.sub, 'u1');
});

test('a session signed with another secret is refused', async () => {
  assert.equal(await verify(await sign(payload(), 'some-other-secret'), SESSION_SECRET), null);
});

test('a session whose contents were edited is refused (someone granting themselves another email)', async () => {
  const token = await sign(payload(), SESSION_SECRET);
  const [body, mac] = token.split('.');
  const edited = Buffer.from(JSON.stringify({ ...payload(), email: 'owner@example.com' })).toString('base64url');
  assert.equal(await verify(`${edited}.${mac}`, SESSION_SECRET), null);
  assert.equal(await verify(`${body}.${Buffer.from('forged').toString('base64url')}`, SESSION_SECRET), null);
});

test('an expired session is refused', async () => {
  assert.equal(await verify(await sign(payload(Date.now() - 1), SESSION_SECRET), SESSION_SECRET), null);
});

test('a session with no expiry is refused', async () => {
  const { exp: _exp, ...withoutExpiry } = payload();
  assert.equal(await verify(await sign(withoutExpiry, SESSION_SECRET), SESSION_SECRET), null);
});

test('anything that is not a session is refused without throwing', async () => {
  for (const junk of [undefined, null, '', 'abc', 'a.b.c', '.', 'a.', '.b', '%%%.%%%']) {
    assert.equal(await verify(junk, SESSION_SECRET), null, JSON.stringify(junk));
  }
});

test('cookies are read from the header, values decoded, malformed parts skipped', () => {
  assert.deepEqual(parseCookies('a=1; b=hello%20world;broken; c=x=y'), { a: '1', b: 'hello world', c: 'x=y' });
  assert.deepEqual(parseCookies(undefined), {});
});
