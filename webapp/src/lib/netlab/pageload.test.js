import test from 'node:test';
import assert from 'node:assert/strict';
import { initialWindowBytes, slowStartRounds, normalize, plan, compare, advice, toQuery, fromQuery } from './pageload.js';

// A scenario that isolates one thing at a time: a round trip of 100 ms, a name already known, no server work, a page that fits in the first flight.
const BASE = { rttMs: 100, resolverRttMs: 20, upstreamRttMs: 50, serverMs: 0, sizeKb: 5, bandwidthMbps: 1000, dns: 'cached', stack: 'tls13', connection: 'new' };
const firstByte = (over) => plan({ ...BASE, ...over }).firstByteMs;
const phase = (p, id) => p.phases.find((x) => x.id === id);

test('the first flight is ten segments, and a page that fits in it needs no more round trips', () => {
  assert.equal(initialWindowBytes(), 14600);
  assert.equal(slowStartRounds(1), 0);
  assert.equal(slowStartRounds(14600), 0);
  assert.equal(slowStartRounds(14601), 1, 'one byte over needs a second flight');
  assert.equal(slowStartRounds(43800), 1, '14,600 then 29,200 is 43,800 exactly');
  assert.equal(slowStartRounds(43801), 2);
  assert.equal(slowStartRounds(102200), 2);
  assert.equal(slowStartRounds(102201), 3);
  assert.equal(slowStartRounds(1000000), 6, 'a megabyte takes six more round trips (a total of 14.6, 43.8, 102.2, 219.0, 452.6 and 919.8 kB sent is not enough; 1,854.2 kB is)');
});

test('the handshakes cost what the standards say, in round trips', () => {
  // Counted before the first byte, with the name known: TCP is 1, TLS 1.2 is 2, TLS 1.3 is 1, and the request itself is 1.
  assert.equal(firstByte({ stack: 'tls12' }), 400, 'TCP 1 + TLS 1.2 2 + request 1');
  assert.equal(firstByte({ stack: 'tls13' }), 300, 'TCP 1 + TLS 1.3 1 + request 1');
  assert.equal(firstByte({ stack: 'quic' }), 200, 'QUIC does the transport and the encryption together: 1 + request 1');
  assert.equal(firstByte({ stack: 'http' }), 200, 'TCP 1 + request 1, with nothing to encrypt');
});

test('a resumed session saves what resumption saves: a round trip of TLS 1.2, the whole TLS 1.3 handshake with 0-RTT, the whole QUIC handshake', () => {
  assert.equal(firstByte({ stack: 'tls12', connection: 'resumed' }), 300, 'the abbreviated handshake is one round trip');
  assert.equal(firstByte({ stack: 'tls13', connection: 'resumed' }), 200, 'TCP 1 + the request riding the first flight');
  assert.equal(firstByte({ stack: 'quic', connection: 'resumed' }), 100, 'the request goes with the first packet');
  assert.equal(firstByte({ stack: 'http', connection: 'resumed' }), 200, 'there is nothing to resume without encryption');
});

test('a connection that is already open costs one round trip whatever the stack', () => {
  for (const stack of ['tls12', 'tls13', 'quic', 'http']) assert.equal(firstByte({ stack, connection: 'open', dns: 'cold' }), 100, stack);
});

test('the lookup is one trip to the resolver, and each question the resolver asks is another round trip of its own', () => {
  assert.equal(firstByte({ dns: 'cached' }), 300);
  assert.equal(firstByte({ dns: 'resolver' }), 320, '+ one round trip to the resolver, 20 ms');
  assert.equal(firstByte({ dns: 'authoritative' }), 370, '+ 20 + one question of 50');
  assert.equal(firstByte({ dns: 'cold' }), 470, '+ 20 + three questions of 50');
});

test('server work adds to the request and nothing else', () => {
  const p = plan({ ...BASE, serverMs: 120 });
  assert.equal(p.firstByteMs, 420);
  assert.equal(phase(p, 'request').ms, 220);
  assert.equal(phase(p, 'connect').ms, 100);
});

test('the rest of the page waits for the window to grow, or for the link, whichever is longer', () => {
  // 150 kB: 14.6 + 29.2 + 58.4 + 116.8 kB is the fourth flight, so three more round trips after the first.
  const slow = plan({ ...BASE, rttMs: 80, sizeKb: 150, bandwidthMbps: 50 });
  assert.equal(slow.extraRounds, 3);
  assert.equal(slow.transferMs, 240);
  assert.equal(slow.loadedMs, slow.firstByteMs + 240);
  // The same page on a 1 Mbit/s link: 150,000 bytes take 1,200 ms, which is longer than the three round trips.
  const thin = plan({ ...BASE, rttMs: 80, sizeKb: 150, bandwidthMbps: 1 });
  assert.equal(thin.serializationMs, 1200);
  assert.equal(thin.transferMs, 1200);
  // A page in the first flight is delivered with the first byte, and a stretch of under half a millisecond is not drawn at all.
  const tiny = plan(BASE);
  assert.equal(tiny.extraRounds, 0);
  assert.equal(tiny.transferMs, 0);
  assert.equal(tiny.loadedMs, tiny.firstByteMs);
  assert.equal(tiny.events.some((e) => e.key === 'transfer'), false);
  // What the rest of the page waits for is said: the window growing, or the link.
  assert.equal(slow.limit, 'window');
  assert.equal(thin.limit, 'link');
  assert.deepEqual(thin.events.find((e) => e.key === 'transfer').args, [3, 'link']);
  assert.deepEqual(slow.events.find((e) => e.key === 'transfer').args, [3, 'window']);
});

test('the bar and the diagram agree: the phases add up to the page, and the last message of the request is the first byte', () => {
  for (const stack of ['tls12', 'tls13', 'quic', 'http']) {
    for (const connection of ['new', 'resumed', 'open']) {
      for (const dns of ['cached', 'resolver', 'authoritative', 'cold']) {
        const p = plan({ ...BASE, rttMs: 70, resolverRttMs: 14, serverMs: 33, sizeKb: 400, bandwidthMbps: 20, stack, connection, dns });
        const label = `${stack} ${connection} ${dns}`;
        assert.ok(Math.abs(p.phases.reduce((sum, x) => sum + x.ms, 0) - p.loadedMs) < 1e-9, `${label}: the phases add up to the page`);
        const first = p.events.find((e) => e.key === 'firstBytes');
        assert.ok(first && Math.abs(first.arrive - p.firstByteMs) < 1e-9, `${label}: the first bytes arrive at the first byte`);
        for (let i = 1; i < p.events.length; i++) assert.ok(Math.abs(p.events[i].at - p.events[i - 1].arrive) < 1e-9, `${label}: each event starts when the last one ends`);
        assert.equal(p.tripsToFirstByte, phase(p, 'connect').trips + phase(p, 'secure').trips + 1, label);
      }
    }
  }
});

test('the messages are the ones the protocols send, two to a round trip', () => {
  const messages = (over) => plan({ ...BASE, ...over }).events.filter((e) => e.kind === 'message').map((e) => e.key);
  assert.deepEqual(messages({ stack: 'tls12' }), ['syn', 'synAck', 'tls12Hello', 'tls12ServerHello', 'tls12KeyExchange', 'tls12Finished', 'requestAfterHandshake', 'firstBytes']);
  assert.deepEqual(messages({ stack: 'tls13' }), ['syn', 'synAck', 'tls13Hello', 'tls13ServerFlight', 'requestAfterHandshake', 'firstBytes']);
  assert.deepEqual(messages({ stack: 'quic' }), ['quicInitial', 'quicHandshake', 'requestAfterHandshake', 'firstBytes']);
  assert.deepEqual(messages({ stack: 'http' }), ['syn', 'synAck', 'requestPlain', 'firstBytes']);
  assert.deepEqual(messages({ stack: 'tls13', connection: 'resumed' }), ['syn', 'synAck', 'requestEarly', 'firstBytes']);
  assert.deepEqual(messages({ stack: 'quic', connection: 'resumed' }), ['requestEarly', 'firstBytes']);
  assert.deepEqual(messages({ stack: 'tls12', connection: 'resumed' }), ['syn', 'synAck', 'tls12ResumeHello', 'tls12ResumeFinished', 'requestAfterHandshake', 'firstBytes']);
  assert.deepEqual(messages({ stack: 'tls13', connection: 'open' }), ['requestPlain', 'firstBytes']);
  assert.deepEqual(messages({ dns: 'resolver' }).slice(0, 2), ['dnsQuery', 'dnsAnswer']);
});

test('TLS 1.3 saves exactly one round trip over TLS 1.2, and HTTP/3 one more over TLS 1.3 on TCP', () => {
  for (const rttMs of [1, 10, 37, 150, 400]) {
    const t = (stack) => plan({ ...BASE, rttMs, stack }).firstByteMs;
    assert.equal(t('tls12') - t('tls13'), rttMs);
    assert.equal(t('tls13') - t('quic'), rttMs);
  }
});

test('the comparison has a row for each stack and agrees with a plan of its own', () => {
  const rows = compare({ ...BASE, rttMs: 60, sizeKb: 250 });
  assert.deepEqual(rows.map((r) => r.id), ['tls12', 'tls13', 'quic', 'http']);
  for (const row of rows) {
    const p = plan({ ...BASE, rttMs: 60, sizeKb: 250, stack: row.id });
    assert.equal(row.firstByteMs, p.firstByteMs);
    assert.equal(row.loadedMs, p.loadedMs);
    assert.equal(row.trips, p.tripsToFirstByte);
  }
});

test('the advice starts with what travel costs, never tells anyone to drop encryption, and says nothing about a stack that is already best', () => {
  const tips = advice({ ...BASE, stack: 'tls12', sizeKb: 150 });
  assert.equal(tips[0].key, 'travel');
  assert.equal(tips[0].trips, 4);
  assert.equal(tips[0].ms, 400);
  const better = tips.find((x) => x.key === 'betterStack');
  assert.ok(better, 'TLS 1.2 has a better stack');
  assert.equal(better.savedMs, 200, 'HTTP/3 saves two round trips of 100 ms');
  assert.ok(tips.find((x) => x.key === 'reuse'));
  assert.equal(tips.find((x) => x.key === 'slowStart').rounds, 3);
  assert.equal(advice({ ...BASE, stack: 'quic' }).some((x) => x.key === 'betterStack'), false, 'nothing beats QUIC here, and plain HTTP is not offered');
  assert.equal(advice({ ...BASE, connection: 'open' }).some((x) => x.key === 'reuse'), false, 'nothing to reuse when the connection is open');
  assert.ok(advice(BASE).some((x) => x.key === 'fits'));
  assert.ok(advice({ ...BASE, sizeKb: 5000, bandwidthMbps: 1 }).some((x) => x.key === 'bandwidth'));
});

test('any input is made safe: numbers are held inside their range and unknown names fall back to the start', () => {
  const start = normalize({});
  assert.deepEqual(normalize(undefined), start);
  assert.equal(normalize({ rttMs: 99999 }).rttMs, 400);
  assert.equal(normalize({ rttMs: -5 }).rttMs, 1);
  assert.equal(normalize({ rttMs: 'abc' }).rttMs, start.rttMs);
  assert.equal(normalize({ rttMs: '' }).rttMs, start.rttMs);
  assert.equal(normalize({ rttMs: null }).rttMs, start.rttMs);
  assert.equal(normalize({ rttMs: '120' }).rttMs, 120, 'a number that arrives as text is a number');
  assert.equal(normalize({ serverMs: 0 }).serverMs, 0, 'zero is a value, not a missing one');
  assert.equal(normalize({ stack: 'spdy' }).stack, start.stack);
  assert.equal(normalize({ dns: 'psychic' }).dns, start.dns);
  assert.equal(normalize({ connection: 'warm' }).connection, start.connection);
  assert.doesNotThrow(() => plan({ rttMs: NaN, sizeKb: Infinity, stack: {}, dns: [] }));
});

test('a scenario goes into an address and comes back the same, and the starting scenario is an address with nothing in it', () => {
  assert.equal(toQuery({}), '');
  const scenario = normalize({ rttMs: 150, serverMs: 20, sizeKb: 500, bandwidthMbps: 10, dns: 'cold', stack: 'quic', connection: 'resumed' });
  const query = toQuery(scenario);
  assert.ok(query.length < 90, 'short enough to share');
  assert.deepEqual(fromQuery(query), scenario);
  assert.deepEqual(fromQuery('?rtt=150&stack=quic'), normalize({ rttMs: 150, stack: 'quic' }));
  assert.deepEqual(fromQuery('?rtt=banana&stack=spdy&unknown=1'), normalize({}), 'what is wrong is the starting value, and what is not ours is ignored');
});
