import test from 'node:test';
import assert from 'node:assert/strict';
import { rng, dailySeed, LEVELS, boundaryOctet, makeQuestion, round, check } from './questions.js';
import { parseIp, parseCidr, describe, contains, overlaps, prefixForHosts } from './cidr.js';

test('the same seed gives the same numbers, another seed other ones', () => {
  const a = rng('x'); const b = rng('x'); const c = rng('y');
  const first = [a(), a(), a()];
  assert.deepEqual([b(), b(), b()], first);
  assert.notDeepEqual([c(), c(), c()], first);
  for (const n of first) assert.ok(n >= 0 && n < 1);
});

test('the daily seed is the UTC date, so the whole world has one puzzle a day', () => {
  assert.equal(dailySeed(new Date('2026-11-10T23:59:59Z')), 'daily-2026-11-10');
  assert.equal(dailySeed(new Date('2026-11-11T00:00:00Z')), 'daily-2026-11-11');
});

test('a round is the same every time for a seed and a level, and differs between levels and seeds', () => {
  const prompts = (r) => r.map((q) => q.prompt);
  assert.deepEqual(prompts(round('s', 2, 10)), prompts(round('s', 2, 10)));
  assert.notDeepEqual(prompts(round('s', 2, 10)), prompts(round('t', 2, 10)));
  assert.notDeepEqual(prompts(round('s', 2, 10)), prompts(round('s', 3, 10)));
  assert.equal(round('s', 1, 7).length, 7);
  assert.deepEqual(round('s', 1, 3).map((q) => q.number), [1, 2, 3]);
});

test('every question of every level has a prompt, an answer that checks, and its working', () => {
  for (const { level } of LEVELS) {
    for (let i = 0; i < 300; i++) {
      const q = makeQuestion(level, rng(`all-${level}-${i}`));
      assert.ok(q.prompt.endsWith('?'), q.prompt);
      assert.ok(q.explain.length >= 2, `${q.kind}: ${q.prompt}`);
      assert.ok(q.explain.every((line) => typeof line === 'string' && line.length > 10));
      assert.equal(check(q, q.answer), true, `${q.kind}: ${q.prompt} -> ${q.answer}`);
      assert.equal(check(q, ''), false);
      assert.equal(check(q, 'banana'), false);
    }
  }
});

test('a level asks only the kinds and the prefixes it says', () => {
  for (const spec of LEVELS) {
    const seen = new Set();
    for (let i = 0; i < 400; i++) {
      const q = makeQuestion(spec.level, rng(`kinds-${spec.level}-${i}`));
      seen.add(q.kind);
      assert.ok(spec.kinds.includes(q.kind));
      for (const [, prefix] of q.prompt.matchAll(/\/(\d+)/g)) {
        if (['network', 'broadcast', 'hosts', 'first', 'last'].includes(q.kind)) assert.ok(spec.prefixes.includes(Number(prefix)), `${q.prompt} is not one of ${spec.prefixes}`);
      }
    }
    assert.deepEqual([...seen].sort(), [...spec.kinds].sort(), `level ${spec.level} asks every kind it lists`);
  }
});

// The answers are checked against the arithmetic done another way: by counting and comparing addresses, not by the formulas the generator uses.
test('the answers are right: network, broadcast, hosts, first and last by brute force', () => {
  for (let i = 0; i < 400; i++) {
    const q = makeQuestion(4, rng(`brute-${i}`));
    const block = parseCidr((/(\d+\.\d+\.\d+\.\d+\/\d+)/.exec(q.prompt) || [])[1] || '');
    if (!block) continue;
    const size = 2 ** (32 - block.prefix);
    const start = block.ip - (block.ip % size); // the block that holds the address, found by division
    if (q.kind === 'network') assert.equal(parseIp(q.answer), start);
    if (q.kind === 'broadcast') assert.equal(parseIp(q.answer), start + size - 1);
    if (q.kind === 'first') assert.equal(parseIp(q.answer), start + 1);
    if (q.kind === 'last') assert.equal(parseIp(q.answer), start + size - 2);
    if (q.kind === 'hosts') assert.equal(Number(q.answer), size - 2);
  }
});

test('the answers are right: inside, overlap and the smallest subnet, by counting', () => {
  let inside = 0; let overlap = 0; let size = 0;
  for (let i = 0; i < 800; i++) {
    const q = makeQuestion(4, rng(`logic-${i}`));
    if (q.kind === 'inside') {
      inside++;
      const [, ip, cidr] = /Is ([\d.]+) inside ([\d./]+)\?/.exec(q.prompt);
      const block = parseCidr(cidr);
      const low = block.ip - (block.ip % 2 ** (32 - block.prefix));
      const truth = parseIp(ip) >= low && parseIp(ip) < low + 2 ** (32 - block.prefix);
      assert.equal(q.answer, truth ? 'yes' : 'no', q.prompt);
    }
    if (q.kind === 'overlap') {
      overlap++;
      const [, a, b] = /Do ([\d./]+) and ([\d./]+) overlap\?/.exec(q.prompt);
      const range = (text) => { const c = parseCidr(text); const s = 2 ** (32 - c.prefix); const lo = c.ip - (c.ip % s); return [lo, lo + s - 1]; };
      const [a0, a1] = range(a); const [b0, b1] = range(b);
      assert.equal(q.answer, a0 <= b1 && b0 <= a1 ? 'yes' : 'no', q.prompt);
    }
    if (q.kind === 'size') {
      size++;
      const wanted = Number(/hold ([\d,]+) hosts/.exec(q.prompt)[1].replace(/,/g, ''));
      const prefix = Number(q.answer);
      assert.ok(describe(0, prefix).usable >= wanted, 'it holds them');
      assert.ok(describe(0, prefix + 1).usable < wanted, 'the next smaller does not');
      assert.equal(prefixForHosts(wanted), prefix);
    }
  }
  assert.ok(inside > 20 && overlap > 20 && size > 20, `kinds all appear: ${inside}, ${overlap}, ${size}`);
});

test('both answers occur for yes/no questions, so guessing "yes" every time does not work', () => {
  const answers = new Set();
  for (let i = 0; i < 300; i++) {
    const q = makeQuestion(4, rng(`yn-${i}`));
    if (q.kind === 'inside' || q.kind === 'overlap') answers.add(q.answer);
  }
  assert.deepEqual([...answers].sort(), ['no', 'yes']);
});

test('the checker forgives spaces, a leading slash, commas and yes/y, and not wrong answers', () => {
  const net = { kind: 'network', answer: '10.0.5.40' };
  assert.equal(check(net, ' 10.0.5.40 '), true);
  assert.equal(check(net, '10.0.5.41'), false);
  assert.equal(check(net, '10.0.5'), false);
  const hosts = { kind: 'hosts', answer: '16382' };
  assert.equal(check(hosts, '16,382'), true);
  assert.equal(check(hosts, '16 382'), true);
  assert.equal(check(hosts, '16384'), false);
  const prefix = { kind: 'size', answer: '26' };
  assert.equal(check(prefix, '/26'), true);
  assert.equal(check(prefix, '26'), true);
  assert.equal(check(prefix, '27'), false);
  const yes = { kind: 'inside', answer: 'yes' };
  for (const said of ['yes', 'Y', ' YES ', 'true']) assert.equal(check(yes, said), true, said);
  for (const said of ['no', 'n', 'false', 'maybe']) assert.equal(check(yes, said), false, said);
  assert.equal(check({ kind: 'inside', answer: 'no' }, 'N'), true);
  const mask = { kind: 'mask', answer: '26' };
  assert.equal(check(mask, '255.255.255.192'), true, 'a mask is accepted where a prefix is asked');
  assert.equal(check(mask, '255.255.255.224'), false);
  assert.equal(check({ kind: 'mask', answer: '255.255.255.192' }, '255.255.255.192'), true);
  assert.equal(check(net, null), false);
  assert.equal(check(net, undefined), false);
});

test('the block size shortcut: where the boundary falls and how big a block is there', () => {
  assert.equal(boundaryOctet(24), null);
  assert.equal(boundaryOctet(8), null);
  assert.deepEqual(boundaryOctet(26), { index: 3, size: 64 });
  assert.deepEqual(boundaryOctet(29), { index: 3, size: 8 });
  assert.deepEqual(boundaryOctet(20), { index: 2, size: 16 });
  assert.deepEqual(boundaryOctet(9), { index: 1, size: 128 });
  assert.deepEqual(boundaryOctet(25), { index: 3, size: 128 });
});

test('the working names the real numbers: a worked /26 says block size 64 and the right network', () => {
  const random = rng('worked');
  let q;
  for (let i = 0; i < 500 && !(q && q.kind === 'network' && /\/26\?/.test(q.prompt)); i++) q = makeQuestion(2, random);
  assert.ok(/\/26\?/.test(q.prompt), 'found a /26 network question');
  assert.match(q.explain.join(' '), /block size is 256 - 192 = 64/);
  assert.match(q.explain.join(' '), new RegExp(`network address is ${q.answer.replace(/\./g, '\\.')}`));
});

test('contains and overlaps agree with the generator on a worked example', () => {
  const block = parseCidr('10.0.5.40/29');
  assert.equal(contains(block, parseIp('10.0.5.47')), true);
  assert.equal(overlaps(block, parseCidr('10.0.5.0/24')), true);
});
