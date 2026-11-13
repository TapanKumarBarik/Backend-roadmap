// The page load lab (webapp/tools/page-load-latency/index.html, script in webapp/src/tools/pageload.js, arithmetic in webapp/src/lib/netlab/pageload.js): every number the
// model uses and every word the script draws with. The words that are on the page before any script runs, which a search engine reads, are in the HTML.

export const LOADLAB = {
  // The model, and where each number comes from.
  model: {
    segmentBytes: 1460, // a 1,500-byte Ethernet payload less 20 bytes of IP header and 20 of TCP header
    initialWindowSegments: 10, // RFC 6928: the server may send ten segments before it hears anything back
    windowGrowth: 2, // in slow start the window doubles every round trip (RFC 5681)
    bytesPerKb: 1000, // the way a browser's network panel counts: 1 kB is 1,000 bytes
    minVisibleMs: 0.5 // a stretch shorter than this is left out of the timeline
  },

  // The inputs: where each starts, how far it goes, and for the two that span orders of magnitude, the stops the slider moves through.
  inputs: {
    rttMs: { value: 80, min: 1, max: 400 },
    resolverRttMs: { value: 15, min: 1, max: 100 },
    upstreamRttMs: { value: 40, min: 1, max: 300 },
    serverMs: { value: 50, min: 0, max: 1000 },
    sizeKb: { value: 150, min: 1, max: 20000, steps: [5, 10, 14.6, 30, 50, 100, 150, 250, 500, 1000, 2000, 5000, 10000] },
    bandwidthMbps: { value: 50, min: 0.5, max: 1000, steps: [1, 2, 5, 10, 20, 50, 100, 250, 500, 1000] }
  },

  // How the name is found. A trip to the resolver is one round trip of resolverRttMs; each ask of a name server is one of upstreamRttMs.
  dns: [
    { id: 'cached', label: 'Already known to this device', resolverTrips: 0, upstreamTrips: 0 },
    { id: 'resolver', label: 'Cached by the resolver', resolverTrips: 1, upstreamTrips: 0 },
    { id: 'authoritative', label: 'The resolver asks the domain’s name server', resolverTrips: 1, upstreamTrips: 1 },
    { id: 'cold', label: 'The resolver starts at a root server', resolverTrips: 1, upstreamTrips: 3 }
  ],

  // The protocol stacks. `connect` and `secure` are the messages of each handshake, in order, alternating browser to server and server to browser, so two messages are one
  // round trip. `earlyData` says the request can ride the first flight of a resumed connection (0-RTT).
  stacks: [
    { id: 'tls12', label: 'HTTPS, TLS 1.2 (HTTP/1.1 or HTTP/2)', transport: 'tcp', earlyData: false,
      secure: { new: ['tls12Hello', 'tls12ServerHello', 'tls12KeyExchange', 'tls12Finished'], resumed: ['tls12ResumeHello', 'tls12ResumeFinished'] } },
    { id: 'tls13', label: 'HTTPS, TLS 1.3 (HTTP/2)', transport: 'tcp', earlyData: true,
      secure: { new: ['tls13Hello', 'tls13ServerFlight'], resumed: [] } },
    { id: 'quic', label: 'HTTP/3 over QUIC', transport: 'quic', earlyData: true,
      connect: { new: ['quicInitial', 'quicHandshake'], resumed: [] }, secure: { new: [], resumed: [] } },
    { id: 'http', label: 'Plain HTTP, no encryption', transport: 'tcp', earlyData: false,
      secure: { new: [], resumed: [] } }
  ],

  // A connection that is new, one that resumes an earlier session (TLS session resumption, or 0-RTT where the stack has it), or one that is already open.
  connections: [
    { id: 'new', label: 'A new connection' },
    { id: 'resumed', label: 'A new connection that resumes an earlier session' },
    { id: 'open', label: 'A connection that is already open' }
  ],

  // The stack to leave out when saying which one would be faster: nobody is told to give up encryption.
  notAdvised: 'http',

  defaults: { dns: 'resolver', stack: 'tls13', connection: 'new' },

  // Where the reader might be, as a starting point. The round-trip times are typical, not measured: a real one depends on the route.
  presets: [
    { id: 'same-city', label: 'Same city, fibre', rttMs: 10, resolverRttMs: 5, bandwidthMbps: 500 },
    { id: 'same-country', label: 'Same country, broadband', rttMs: 40, resolverRttMs: 10, bandwidthMbps: 100 },
    { id: 'ocean', label: 'Across an ocean', rttMs: 150, resolverRttMs: 15, bandwidthMbps: 100 },
    { id: 'mobile-far', label: 'Phone on 4G, far away', rttMs: 300, resolverRttMs: 50, bandwidthMbps: 10 }
  ],

  // The short names the page's address carries a scenario in, so a link can show exactly what its sender saw.
  params: {
    rttMs: 'rtt', resolverRttMs: 'dnsrtt', upstreamRttMs: 'up', serverMs: 'server', sizeKb: 'kb', bandwidthMbps: 'mbps', dns: 'dns', stack: 'stack', connection: 'conn'
  },

  // The words of the messages in the diagram, by key (the arithmetic returns keys, never text).
  messages: {
    dnsQuery: 'DNS query',
    dnsAnswer: 'DNS answer',
    dnsUpstream: (n) => `The resolver asks name servers: ${n} round ${n === 1 ? 'trip' : 'trips'}`,
    syn: 'SYN',
    synAck: 'SYN-ACK',
    tls12Hello: 'ClientHello',
    tls12ServerHello: 'ServerHello, certificate, ServerHelloDone',
    tls12KeyExchange: 'ClientKeyExchange, ChangeCipherSpec, Finished',
    tls12Finished: 'ChangeCipherSpec, Finished',
    tls12ResumeHello: 'ClientHello with the session ticket',
    tls12ResumeFinished: 'ServerHello, ChangeCipherSpec, Finished',
    tls13Hello: 'ClientHello with a key share',
    tls13ServerFlight: 'ServerHello, certificate, Finished',
    quicInitial: 'QUIC Initial: ClientHello',
    quicHandshake: 'QUIC Initial and Handshake: ServerHello, certificate, Finished',
    requestPlain: 'HTTP request',
    requestAfterHandshake: 'Finished, then the HTTP request',
    requestEarly: 'HTTP request as 0-RTT early data, sent with the ClientHello',
    serverWork: 'The server builds the response',
    firstBytes: 'The first bytes of the response',
    // `limit` says what the rest of the page waits for: the window growing round trip by round trip, or the speed of the connection.
    transfer: (rounds, limit) => (limit === 'link' ? 'The rest of the page, at the speed of the connection' : rounds > 0 ? `${rounds} more round ${rounds === 1 ? 'trip' : 'trips'} as the window grows` : 'The rest of the response')
  },

  // What each stretch of the timeline is called, in the bar and its legend.
  phases: {
    dns: 'DNS lookup',
    connect: 'Connection',
    secure: 'Encryption',
    request: 'Request and first byte',
    transfer: 'The rest of the page'
  },
  phaseTags: { dns: 'DNS', connect: 'TCP', connectQuic: 'QUIC', secure: 'TLS', request: 'HTTP', transfer: 'DATA' },
  lanes: { browser: 'Browser', resolver: 'Resolver', server: 'Server' },

  ui: {
    firstByte: 'First byte',
    loaded: 'Page loaded',
    trips: 'Round trips to the server before the first byte',
    tripCount: (n) => `${n} round ${n === 1 ? 'trip' : 'trips'}`,
    linkLimited: 'limited by the connection',
    ms: (n) => `${formatMs(n)} ms`,
    size: (kb) => (kb >= 1000 ? `${trim(kb / 1000)} MB` : `${trim(kb)} kB`),
    speed: (mbps) => (mbps >= 1000 ? `${trim(mbps / 1000)} Gbit/s` : `${trim(mbps)} Mbit/s`),
    presetsLabel: 'Start from',
    moreInputs: 'More inputs',
    stepsHeading: 'Show the working',
    messagesHeading: 'The messages, in order',
    compareHeading: 'The same page on each stack',
    compareCaption: 'First byte and page loaded for the same distance, server and page, on each stack',
    compareHeaders: { stack: 'Stack', trips: 'Round trips to first byte', firstByte: 'First byte', loaded: 'Page loaded' },
    diagramLabel: (n, ms) => `A sequence diagram of ${n} messages between the browser and the server; the first byte arrives after ${ms} ms`,
    copyLink: 'Copy a link to this scenario',
    copied: 'Copied. The link holds every setting.',
    copyFailed: 'Could not copy. The address in the bar holds every setting.',
    at: (ms) => `${formatMs(ms)} ms`,
    waitDuration: (ms) => `+${formatMs(ms)} ms`,
    scrollHint: 'Swipe the diagram sideways to see all of it.'
  },

  // What it says about the scenario. Each takes the plan's numbers; the page shows the ones that apply.
  advice: {
    travel: (trips, rttMs, ms) => `Before the first byte you wait for ${trips} round ${trips === 1 ? 'trip' : 'trips'} to the server. At ${rttMs} ms each that is ${formatMs(ms)} ms spent only travelling, and no server can make it shorter.`,
    betterStack: (from, to, savedMs) => `${to} would save ${formatMs(savedMs)} ms to the first byte compared with ${from}.`,
    reuse: (savedMs) => `A connection that is already open skips the lookup and both handshakes: ${formatMs(savedMs)} ms saved.`,
    slowStart: (rounds, ms, windowKb) => `The page is bigger than the first flight (about ${trim(windowKb)} kB), so it needs ${rounds} more round ${rounds === 1 ? 'trip' : 'trips'} while the window grows: ${formatMs(ms)} ms.`,
    fits: (windowKb) => `The whole page fits in the first flight (about ${trim(windowKb)} kB), so nothing waits for the window to grow.`,
    bandwidth: (ms) => `At this speed the bytes alone take ${formatMs(ms)} ms to arrive; the link, not the round trips, is the limit.`
  },

  // The working, line by line.
  steps: {
    dns: (resolverTrips, resolverRttMs, upstreamTrips, upstreamRttMs, ms) => (resolverTrips === 0 ? 'DNS: no lookup, 0 ms.' : `DNS: ${resolverTrips} × ${resolverRttMs} ms to the resolver${upstreamTrips ? ` + ${upstreamTrips} × ${upstreamRttMs} ms for the resolver’s own questions` : ''} = ${formatMs(ms)} ms.`),
    connect: (trips, rttMs, ms) => (trips === 0 ? 'Connection: none to make, 0 ms.' : `Connection: ${trips} × ${rttMs} ms = ${formatMs(ms)} ms.`),
    secure: (trips, rttMs, ms) => (trips === 0 ? 'Encryption: no extra round trip, 0 ms.' : `Encryption: ${trips} × ${rttMs} ms = ${formatMs(ms)} ms.`),
    request: (rttMs, serverMs, ms) => `Request: 1 × ${rttMs} ms + ${serverMs} ms of server work = ${formatMs(ms)} ms.`,
    firstByte: (ms) => `First byte: ${formatMs(ms)} ms.`,
    transfer: (rounds, rttMs, serializationMs, ms) => `The rest: ${rounds} × ${rttMs} ms in slow start, or ${formatMs(serializationMs)} ms of bytes at this speed, whichever is longer = ${formatMs(ms)} ms.`,
    loaded: (ms) => `Page loaded: ${formatMs(ms)} ms.`
  }
};

/** A whole number of milliseconds with a thin grouping, or one decimal below ten. */
function formatMs(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '0';
  return n < 10 && n !== Math.round(n) ? n.toFixed(1) : Math.round(n).toLocaleString('en-US');
}

/** A number without trailing zeros: 14.6, 150, 2. */
function trim(value) {
  return String(Math.round(Number(value) * 10) / 10);
}
