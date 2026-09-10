// Small runtime helpers shared across the ported API. The Azure version leaned
// on Node's Buffer and crypto.randomBytes; on the Workers runtime we have
// Buffer (via nodejs_compat) but random comes from the Web Crypto global.

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
