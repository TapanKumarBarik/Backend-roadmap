// The arithmetic of the page load lab (webapp/tools/page-load-latency/index.html): how long a browser waits, on a given distance, for a lookup, a connection,
// an encrypted handshake, a request and a page of a given size, and the messages that make it up. Pure: numbers in, a plan out; every number the model uses
// and every word it shows is in config/loadlab.js, so what is taught can be read and argued with in one place.
//
// A teaching model, not a prediction. A round trip costs the same every time, nothing is lost, the window doubles every round trip from the initial window, and the
// browser asks for one resource. The page says what that leaves out.
import { LOADLAB } from '../../config/loadlab.js';

const { model, inputs, dns: DNS_STATES, stacks: STACKS, connections: CONNECTIONS, defaults, params, notAdvised } = LOADLAB;
const NUMBERS = ['rttMs', 'resolverRttMs', 'upstreamRttMs', 'serverMs', 'sizeKb', 'bandwidthMbps'];
const PHASES = ['dns', 'connect', 'secure', 'request', 'transfer'];

/** The bytes the server may send in its first flight, before it has heard anything back: ten segments (RFC 6928). */
export const initialWindowBytes = () => model.segmentBytes * model.initialWindowSegments;

/**
 * How many round trips after the first flight it takes to send `bytes` when the window starts at the initial window and doubles every round trip.
 * The first flight is already on its way with the first byte, so a page that fits in it needs none.
 */
export function slowStartRounds(bytes) {
  let window = initialWindowBytes();
  let sent = window;
  let rounds = 0;
  while (sent < bytes) {
    window *= model.windowGrowth;
    sent += window;
    rounds += 1;
  }
  return rounds;
}

/** Any input at all, made safe: numbers kept inside their range, a name that is not one of the choices replaced by the default. */
export function normalize(raw = {}) {
  const out = {};
  for (const key of NUMBERS) {
    const spec = inputs[key];
    const given = raw[key];
    const n = given === '' || given === null || given === undefined ? NaN : Number(given);
    out[key] = Number.isFinite(n) ? Math.min(spec.max, Math.max(spec.min, n)) : spec.value;
  }
  out.dns = DNS_STATES.some((d) => d.id === raw.dns) ? raw.dns : defaults.dns;
  out.stack = STACKS.some((s) => s.id === raw.stack) ? raw.stack : defaults.stack;
  out.connection = CONNECTIONS.some((c) => c.id === raw.connection) ? raw.connection : defaults.connection;
  return out;
}

/**
 * The timeline of one page load. `events` are what is drawn: a message goes from one side to the other (`at` to `arrive`), a wait is a side busy for a while.
 * `phases` are what the bar shows, in order, each with its milliseconds and the round trips to the server it costs. Message words are keys into config/loadlab.js.
 */
export function plan(raw) {
  const o = normalize(raw);
  const stack = STACKS.find((s) => s.id === o.stack);
  const lookup = DNS_STATES.find((d) => d.id === o.dns);
  const open = o.connection === 'open';
  const resumed = o.connection === 'resumed';
  const state = resumed ? 'resumed' : 'new';
  const half = o.rttMs / 2;

  const events = [];
  let t = 0;
  const message = (phase, from, to, key, oneWay) => { events.push({ phase, kind: 'message', from, to, key, at: t, arrive: t + oneWay }); t += oneWay; };
  const wait = (phase, on, key, args, ms) => { events.push({ phase, kind: 'wait', on, key, args, at: t, arrive: t + ms }); t += ms; };
  const phases = {};
  const close = (id, from, trips) => { phases[id] = { id, ms: t - from, trips }; };

  // The lookup: out to the resolver, perhaps the resolver asking name servers, and back. Nothing when the name is known or the connection is already open.
  let from = t;
  if (!open && lookup.resolverTrips > 0) {
    message('dns', 'browser', 'resolver', 'dnsQuery', o.resolverRttMs / 2);
    if (lookup.upstreamTrips > 0) wait('dns', 'resolver', 'dnsUpstream', [lookup.upstreamTrips], lookup.upstreamTrips * o.upstreamRttMs);
    message('dns', 'resolver', 'browser', 'dnsAnswer', o.resolverRttMs / 2);
  }
  close('dns', from, 0);

  // The connection: TCP's handshake, or QUIC's, which is the transport and the encryption together.
  from = t;
  const connectKeys = open ? [] : stack.transport === 'tcp' ? ['syn', 'synAck'] : (stack.connect && stack.connect[state]) || [];
  connectKeys.forEach((key, i) => message('connect', i % 2 === 0 ? 'browser' : 'server', i % 2 === 0 ? 'server' : 'browser', key, half));
  close('connect', from, connectKeys.length / 2);

  // The encryption: TLS's handshake over TCP (QUIC has done its own).
  from = t;
  const secureKeys = open ? [] : stack.secure[state] || [];
  secureKeys.forEach((key, i) => message('secure', i % 2 === 0 ? 'browser' : 'server', i % 2 === 0 ? 'server' : 'browser', key, half));
  close('secure', from, secureKeys.length / 2);

  // The request, the server's own work, and the first bytes coming back.
  from = t;
  const early = resumed && stack.earlyData && !open;
  const afterHandshake = secureKeys.length > 0 || (stack.transport === 'quic' && connectKeys.length > 0);
  message('request', 'browser', 'server', early ? 'requestEarly' : afterHandshake ? 'requestAfterHandshake' : 'requestPlain', half);
  if (o.serverMs > 0) wait('request', 'server', 'serverWork', [o.serverMs], o.serverMs);
  message('request', 'server', 'browser', 'firstBytes', half);
  close('request', from, 1);
  const firstByteMs = t;

  // The rest of the page: the window doubles every round trip, or the link's speed is the limit, whichever takes longer.
  from = t;
  const bytes = o.sizeKb * model.bytesPerKb;
  const extraRounds = slowStartRounds(bytes);
  const serializationMs = (bytes * 8) / (o.bandwidthMbps * 1000);
  const windowMs = extraRounds * o.rttMs;
  const limit = serializationMs > windowMs ? 'link' : 'window';
  const longest = Math.max(windowMs, serializationMs);
  const transferMs = longest >= model.minVisibleMs ? longest : 0; // under half a millisecond is not a stretch worth drawing
  if (transferMs > 0) wait('transfer', 'server', 'transfer', [extraRounds, limit], transferMs);
  close('transfer', from, extraRounds);

  const ordered = PHASES.map((id) => phases[id]);
  const tripsToFirstByte = phases.connect.trips + phases.secure.trips + phases.request.trips;
  return { input: o, events, phases: ordered, firstByteMs, loadedMs: t, tripsToFirstByte, extraRounds, serializationMs, transferMs, limit };
}

/** The same scenario on every stack: the round trips before the first byte, the first byte and the whole page. */
export function compare(raw) {
  const o = normalize(raw);
  return STACKS.map((s) => {
    const p = plan({ ...o, stack: s.id });
    return { id: s.id, label: s.label, trips: p.tripsToFirstByte, firstByteMs: p.firstByteMs, loadedMs: p.loadedMs };
  });
}

/** What is worth saying about the scenario, in order, as keys with their numbers (config/loadlab.js has the sentences). */
export function advice(raw) {
  const p = plan(raw);
  const o = p.input;
  /** @type {Array<{ key: string, [field: string]: any }>} */
  const out = [{ key: 'travel', trips: p.tripsToFirstByte, rttMs: o.rttMs, ms: p.tripsToFirstByte * o.rttMs }];

  const rows = compare(o);
  const current = rows.find((r) => r.id === o.stack);
  const best = rows.filter((r) => r.id !== notAdvised && r.id !== o.stack).sort((a, b) => a.firstByteMs - b.firstByteMs)[0];
  if (best && current.firstByteMs - best.firstByteMs >= 1) out.push({ key: 'betterStack', from: current.label, to: best.label, savedMs: current.firstByteMs - best.firstByteMs });

  const setup = p.phases[0].ms + p.phases[1].ms + p.phases[2].ms;
  if (o.connection !== 'open' && setup >= 1) out.push({ key: 'reuse', savedMs: setup });

  const windowKb = initialWindowBytes() / model.bytesPerKb;
  if (p.extraRounds > 0) out.push({ key: 'slowStart', rounds: p.extraRounds, ms: p.extraRounds * o.rttMs, windowKb });
  else out.push({ key: 'fits', windowKb });

  if (p.serializationMs >= 1 && p.serializationMs > p.extraRounds * o.rttMs) out.push({ key: 'bandwidth', ms: p.serializationMs });
  return out;
}

/** The scenario as the query of an address, with only what differs from the starting scenario, so the common link is short. */
export function toQuery(raw) {
  const o = normalize(raw);
  const base = normalize({});
  const query = new URLSearchParams();
  for (const [key, name] of Object.entries(params)) if (o[key] !== base[key]) query.set(name, String(o[key]));
  return query.toString();
}

/** The scenario an address's query holds (anything missing or wrong falls back to the starting scenario). */
export function fromQuery(search) {
  const query = new URLSearchParams(search);
  const raw = {};
  for (const [key, name] of Object.entries(params)) if (query.has(name)) raw[key] = query.get(name);
  return normalize(raw);
}
