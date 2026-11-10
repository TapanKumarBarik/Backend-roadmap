// IPv4 addressing and CIDR arithmetic, for the networking practice tools. Pure functions on plain numbers and strings: an address is an unsigned
// 32-bit number (0 to 4294967295) inside, and the dotted text outside. Nothing here reads the clock or the page, so the same code serves the
// calculator, the drills and the tests.

const MAX = 0xffffffff;

/** "192.168.1.130" -> 3232235906, or null when it is not four numbers from 0 to 255 (no leading zeros, no spaces). */
export function parseIp(text) {
  const parts = String(text).trim().split('.');
  if (parts.length !== 4) return null;
  let value = 0;
  for (const part of parts) {
    if (!/^(0|[1-9]\d{0,2})$/.test(part)) return null;
    const n = Number(part);
    if (n > 255) return null;
    value = value * 256 + n;
  }
  return value;
}

/** 3232235906 -> "192.168.1.130". */
export function formatIp(value) {
  return [value >>> 24, (value >>> 16) & 255, (value >>> 8) & 255, value & 255].join('.');
}

/** The mask of a prefix length as a number: /26 -> 0xffffffc0. A prefix outside 0 to 32 gives null. */
export function maskOf(prefix) {
  if (!Number.isInteger(prefix) || prefix < 0 || prefix > 32) return null;
  return prefix === 0 ? 0 : (MAX << (32 - prefix)) >>> 0;
}

/** "255.255.255.192" -> 26; null when the text is not a mask (its ones are not all on the left). */
export function prefixOfMask(text) {
  const mask = parseIp(text);
  if (mask === null) return null;
  for (let prefix = 0; prefix <= 32; prefix++) if (maskOf(prefix) === mask) return prefix;
  return null;
}

/** "10.0.5.40/29" -> { ip, prefix }, or null. An address with host bits set is fine: it is how a host is written down. */
export function parseCidr(text) {
  const [address, length, ...rest] = String(text).trim().split('/');
  if (length === undefined || rest.length || !/^\d{1,2}$/.test(length)) return null;
  const ip = parseIp(address);
  const prefix = Number(length);
  return ip === null || prefix > 32 ? null : { ip, prefix };
}

/** Everything a person is asked about a block, from an address and a prefix. */
export function describe(ip, prefix) {
  const mask = maskOf(prefix);
  const network = (ip & mask) >>> 0;
  const broadcast = (network | (~mask >>> 0)) >>> 0;
  const total = 2 ** (32 - prefix);
  // /31 (a point-to-point link, RFC 3021) uses both addresses and /32 is one host; every other block loses the network and the broadcast address.
  const usable = prefix === 32 ? 1 : prefix === 31 ? 2 : total - 2;
  const first = prefix >= 31 ? network : network + 1;
  const last = prefix >= 31 ? broadcast : broadcast - 1;
  return {
    ip, prefix, mask, wildcard: (~mask) >>> 0, network, broadcast, total, usable, first, last,
    text: { ip: formatIp(ip), mask: formatIp(mask), wildcard: formatIp((~mask) >>> 0), network: formatIp(network), broadcast: formatIp(broadcast), first: formatIp(first), last: formatIp(last) }
  };
}

/** Whether an address lies inside a block. */
export function contains(block, ip) {
  return ((ip & maskOf(block.prefix)) >>> 0) === ((block.ip & maskOf(block.prefix)) >>> 0);
}

/** Whether two blocks share any address. Blocks are aligned, so one contains the other's network address or they are apart. */
export function overlaps(a, b) {
  const shorter = a.prefix <= b.prefix ? a : b;
  const other = shorter === a ? b : a;
  return contains(shorter, other.ip);
}

/** The block cut into smaller ones of `newPrefix`: 10.0.0.0/24 into /26 gives four. Null when the new prefix is not longer or too many (over 4096) would result. */
export function split(block, newPrefix) {
  if (!Number.isInteger(newPrefix) || newPrefix <= block.prefix || newPrefix > 32 || newPrefix - block.prefix > 12) return null;
  const start = (block.ip & maskOf(block.prefix)) >>> 0;
  const size = 2 ** (32 - newPrefix);
  const count = 2 ** (newPrefix - block.prefix);
  return Array.from({ length: count }, (_, i) => ({ ip: start + i * size, prefix: newPrefix }));
}

/** The longest prefix (smallest block) that holds `hosts` usable addresses, or null for nothing or more than a /1 can hold. */
export function prefixForHosts(hosts) {
  if (!Number.isInteger(hosts) || hosts < 1) return null;
  for (let prefix = 30; prefix >= 0; prefix--) if (describe(0, prefix).usable >= hosts) return prefix;
  return null;
}

/** The address space a private network may use (RFC 1918), or null for a public address. */
export function privateRange(ip) {
  if (contains({ ip: parseIp('10.0.0.0'), prefix: 8 }, ip)) return '10.0.0.0/8';
  if (contains({ ip: parseIp('172.16.0.0'), prefix: 12 }, ip)) return '172.16.0.0/12';
  if (contains({ ip: parseIp('192.168.0.0'), prefix: 16 }, ip)) return '192.168.0.0/16';
  return null;
}

/** An address as 32 bits in four groups, with the index where the network part ends: for showing which bits a prefix fixes. */
export function bits(ip, prefix) {
  const text = ip.toString(2).padStart(32, '0');
  return { groups: [text.slice(0, 8), text.slice(8, 16), text.slice(16, 24), text.slice(24)], prefix };
}
