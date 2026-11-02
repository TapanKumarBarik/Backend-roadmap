// Small runtime helpers shared across the ported API. The Azure version leaned
// on Node's Buffer and crypto.randomBytes; on the Workers runtime we have
// Buffer (via nodejs_compat) but random comes from the Web Crypto global.

/** @typedef {import('hono/utils/http-status').ContentfulStatusCode} HttpStatus */

/**
 * The status of a failed upstream (GitHub) response, handed on to our own client.
 * @param {Response} res
 * @returns {HttpStatus}
 */
export function upstreamStatus(res) {
  return /** @type {HttpStatus} */ (res.status);
}

/**
 * Where to send a browser after it signs in or out: a path on this site, and nothing else. A full address, a
 * protocol-relative one ("//elsewhere.example") or a backslash trick would turn the sign-in link into an open
 * redirect (anyone could send a victim through our Google sign-in and on to a look-alike page), so whatever is not a
 * plain path of sane length, or carries a control character, becomes the fallback. A query string and a "#" fragment
 * are fine: the app keeps its screens in the fragment.
 * @param {unknown} value
 * @param {string} [fallback]
 */
export function safeRedirect(value, fallback = '/') {
  if (typeof value !== 'string' || value.length > 2000) return fallback;
  if (!value.startsWith('/') || value.startsWith('//')) return fallback;
  if (value.includes(String.fromCharCode(92))) return fallback;
  if ([...value].some((ch) => ch.charCodeAt(0) < 32 || ch.charCodeAt(0) === 127)) return fallback;
  return value;
}

export function randomHex(bytes = 4) {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return Buffer.from(a).toString('hex');
}

// The row-key shape every table used for its time-ordered ids: a zero-padded
// millisecond timestamp so lexical sort == chronological sort, plus random
// suffix to break ties within the same millisecond.
export function timeId(randomBytes = 4) {
  return String(Date.now()).padStart(13, '0') + '-' + randomHex(randomBytes);
}

export function bytesFromBase64(b64) {
  return new Uint8Array(Buffer.from(b64, 'base64'));
}

export function base64FromBytes(bytes) {
  return Buffer.from(bytes).toString('base64');
}
