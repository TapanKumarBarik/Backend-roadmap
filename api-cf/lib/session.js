// Port of api/src/lib/session.js. Same HMAC-signed (not encrypted) cookie
// format — `<base64url(payload)>.<base64url(hmac)>` — so a session cookie
// minted by the old Azure deployment stays valid here as long as
// SESSION_SECRET is carried over unchanged. Node's crypto.createHmac /
// timingSafeEqual are swapped for Web Crypto (crypto.subtle), which is the
// only part that had to change.

export const SESSION_COOKIE = 'session';

const encoder = new TextEncoder();

export function parseCookies(header) {
  const out = {};
  (header || '').split(';').forEach((part) => {
    const idx = part.indexOf('=');
    if (idx === -1) return;
    out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
  });
  return out;
}

async function hmacKey(secret) {
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

export async function sign(payload, secret) {
  const body = Buffer.from(JSON.stringify(payload), 'utf-8').toString('base64url');
  const mac = await crypto.subtle.sign('HMAC', await hmacKey(secret), encoder.encode(body));
  return `${body}.${Buffer.from(mac).toString('base64url')}`;
}

export async function verify(token, secret) {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [body, sig] = parts;

  let ok = false;
  try {
    // crypto.subtle.verify is constant-time, so it replaces the explicit
    // timingSafeEqual the Node version needed.
    ok = await crypto.subtle.verify(
      'HMAC',
      await hmacKey(secret),
      Buffer.from(sig, 'base64url'),
      encoder.encode(body)
    );
  } catch {
    return null;
  }
  if (!ok) return null;

  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf-8'));
    if (!payload.exp || payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

export function cookieAttrs(name, value, maxAgeSeconds) {
  return `${name}=${value}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${maxAgeSeconds}`;
}
