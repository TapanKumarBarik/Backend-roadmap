import test from 'node:test';
import assert from 'node:assert/strict';
import { parseIp, formatIp, maskOf, prefixOfMask, parseCidr, describe, contains, overlaps, split, prefixForHosts, privateRange, bits } from './cidr.js';

test('an address is four numbers from 0 to 255, and reads back the same', () => {
  assert.equal(parseIp('192.168.1.130'), 3232235906);
  assert.equal(formatIp(3232235906), '192.168.1.130');
  assert.equal(parseIp('0.0.0.0'), 0);
  assert.equal(formatIp(parseIp('255.255.255.255')), '255.255.255.255');
  for (const bad of ['', '1.2.3', '1.2.3.4.5', '256.0.0.1', '1.2.3.04', '1.2.3.-1', 'a.b.c.d', '1.2.3. 4x', ' ']) assert.equal(parseIp(bad), null, bad);
  assert.equal(parseIp(' 10.0.0.1 '), parseIp('10.0.0.1'), 'spaces around it are forgiven');
});

test('a prefix and its mask are the same thing', () => {
  assert.equal(formatIp(maskOf(26)), '255.255.255.192');
  assert.equal(formatIp(maskOf(0)), '0.0.0.0');
  assert.equal(formatIp(maskOf(32)), '255.255.255.255');
  assert.equal(formatIp(maskOf(19)), '255.255.224.0');
  assert.equal(maskOf(33), null);
  assert.equal(maskOf(-1), null);
  assert.equal(maskOf(2.5), null);
  assert.equal(prefixOfMask('255.255.255.192'), 26);
  assert.equal(prefixOfMask('255.0.0.0'), 8);
  assert.equal(prefixOfMask('255.255.255.193'), null, 'its ones are not all on the left');
  assert.equal(prefixOfMask('0.255.0.0'), null);
  for (let p = 0; p <= 32; p++) assert.equal(prefixOfMask(formatIp(maskOf(p))), p);
});

test('a block is written address/length, and the address may have host bits set', () => {
  assert.deepEqual(parseCidr('10.0.5.40/29'), { ip: parseIp('10.0.5.40'), prefix: 29 });
  assert.deepEqual(parseCidr('10.0.5.43/29').prefix, 29);
  for (const bad of ['10.0.5.40', '10.0.5.40/', '10.0.5.40/33', '10.0.5.40/-1', '10.0.5.40/2/3', '10.0.5/24', 'x/8', '10.0.5.40/ 8']) assert.equal(parseCidr(bad), null, bad);
});

test('worked blocks: the ones a quiz asks about', () => {
  const a = describe(parseIp('10.0.5.40'), 29);
  assert.deepEqual([a.text.network, a.text.broadcast, a.text.first, a.text.last, a.usable, a.total], ['10.0.5.40', '10.0.5.47', '10.0.5.41', '10.0.5.46', 6, 8]);
  const b = describe(parseIp('192.168.1.130'), 26);
  assert.deepEqual([b.text.mask, b.text.network, b.text.broadcast, b.usable], ['255.255.255.192', '192.168.1.128', '192.168.1.191', 62]);
  const c = describe(parseIp('172.16.37.9'), 20);
  assert.deepEqual([c.text.network, c.text.broadcast, c.text.wildcard, c.usable], ['172.16.32.0', '172.16.47.255', '0.0.15.255', 4094]);
  const d = describe(parseIp('10.1.2.3'), 8);
  assert.deepEqual([d.text.network, d.text.broadcast, d.usable], ['10.0.0.0', '10.255.255.255', 16777214]);
});

test('the ends: /31 uses both addresses, /32 is one host, /0 is everything', () => {
  const p2p = describe(parseIp('10.0.0.4'), 31);
  assert.deepEqual([p2p.text.first, p2p.text.last, p2p.usable, p2p.total], ['10.0.0.4', '10.0.0.5', 2, 2]);
  const host = describe(parseIp('10.0.0.9'), 32);
  assert.deepEqual([host.text.first, host.text.last, host.usable, host.total], ['10.0.0.9', '10.0.0.9', 1, 1]);
  const all = describe(parseIp('1.2.3.4'), 0);
  assert.deepEqual([all.text.network, all.text.broadcast, all.total], ['0.0.0.0', '255.255.255.255', 4294967296]);
  assert.equal(describe(parseIp('10.0.0.1'), 30).usable, 2);
});

test('an address is in a block when the prefix bits agree', () => {
  const block = parseCidr('10.0.5.40/29');
  assert.equal(contains(block, parseIp('10.0.5.47')), true);
  assert.equal(contains(block, parseIp('10.0.5.40')), true);
  assert.equal(contains(block, parseIp('10.0.5.48')), false, 'the next block');
  assert.equal(contains(block, parseIp('10.0.5.39')), false);
  assert.equal(contains(parseCidr('0.0.0.0/0'), parseIp('203.0.113.9')), true);
});

test('two blocks overlap when one holds the other, never otherwise', () => {
  const c = (t) => parseCidr(t);
  assert.equal(overlaps(c('10.0.0.0/16'), c('10.0.5.0/24')), true);
  assert.equal(overlaps(c('10.0.5.0/24'), c('10.0.0.0/16')), true, 'either order');
  assert.equal(overlaps(c('10.0.0.0/16'), c('10.1.0.0/16')), false);
  assert.equal(overlaps(c('10.0.0.0/24'), c('10.0.0.0/24')), true);
  assert.equal(overlaps(c('192.168.0.0/25'), c('192.168.0.128/25')), false, 'two halves of a /24');
  assert.equal(overlaps(c('10.0.5.7/24'), c('10.0.5.200/25')), true, 'host bits are ignored');
});

test('a block splits into equal smaller ones, and not into larger ones', () => {
  const parts = split(parseCidr('10.0.0.0/24'), 26);
  assert.deepEqual(parts.map((b) => `${formatIp(b.ip)}/${b.prefix}`), ['10.0.0.0/26', '10.0.0.64/26', '10.0.0.128/26', '10.0.0.192/26']);
  assert.equal(split(parseCidr('10.0.0.0/24'), 24), null);
  assert.equal(split(parseCidr('10.0.0.0/24'), 16), null);
  assert.equal(split(parseCidr('10.0.0.0/24'), 33), null);
  assert.equal(split(parseCidr('10.0.0.0/8'), 24), null, 'too many pieces (65,536) is refused');
  assert.equal(split(parseCidr('10.0.0.0/8'), 20).length, 4096, 'the most that is allowed');
});

test('the smallest block that holds N hosts', () => {
  assert.equal(prefixForHosts(1), 30, 'a /31 and /32 are for links and single hosts; a LAN needs a /30 at least');
  assert.equal(prefixForHosts(2), 30);
  assert.equal(prefixForHosts(3), 29);
  assert.equal(prefixForHosts(6), 29);
  assert.equal(prefixForHosts(7), 28);
  assert.equal(prefixForHosts(62), 26);
  assert.equal(prefixForHosts(63), 25);
  assert.equal(prefixForHosts(254), 24);
  assert.equal(prefixForHosts(255), 23);
  assert.equal(prefixForHosts(0), null);
  assert.equal(prefixForHosts(-5), null);
  assert.equal(prefixForHosts(1.5), null);
  assert.equal(prefixForHosts(2 ** 31), 0, 'a /0 holds it');
  assert.equal(prefixForHosts(2 ** 32), null, 'more than the whole address space');
});

test('the private ranges, and a public address is none of them', () => {
  assert.equal(privateRange(parseIp('10.200.1.1')), '10.0.0.0/8');
  assert.equal(privateRange(parseIp('172.16.0.1')), '172.16.0.0/12');
  assert.equal(privateRange(parseIp('172.31.255.255')), '172.16.0.0/12');
  assert.equal(privateRange(parseIp('172.32.0.1')), null, 'just past the range');
  assert.equal(privateRange(parseIp('192.168.255.1')), '192.168.0.0/16');
  assert.equal(privateRange(parseIp('8.8.8.8')), null);
});

test('the bits of an address, in four groups of eight', () => {
  const b = bits(parseIp('192.168.1.130'), 26);
  assert.deepEqual(b.groups, ['11000000', '10101000', '00000001', '10000010']);
  assert.equal(b.prefix, 26);
  assert.deepEqual(bits(0, 0).groups, ['00000000', '00000000', '00000000', '00000000']);
});
