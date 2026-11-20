// The TCP Congestion and Flow Control Lab (webapp/tools/tcp-congestion/index.html, script in webapp/src/tools/congestion.js,
// arithmetic in webapp/src/lib/netlab/congestion.js): every number the simulation uses and every word the UI displays.

export const CONGESTIONLAB = {
  // Core protocol parameters and default ranges
  model: {
    initialCwnd: 2, // segments (standard conservative or RFC 5681 default initial window)
    defaultSsthresh: 32, // segments
    minCwnd: 1, // segments
    segmentBytes: 1460 // typical TCP MSS over Ethernet
  },

  // Input boundaries and defaults
  inputs: {
    bdp: { value: 24, min: 6, max: 60, step: 1 }, // Bandwidth-Delay Product (pipe capacity) in segments
    buffer: { value: 12, min: 2, max: 40, step: 1 }, // Bottleneck router queue size in segments
    rwnd: { value: 48, min: 8, max: 80, step: 1 }, // Receiver advertised flow control window in segments
    lossPct: { value: 0, min: 0, max: 8, step: 0.5 }, // Random packet loss percentage
    rounds: { value: 30, min: 15, max: 50, step: 1 } // Total RTT rounds to simulate
  },

  algorithms: [
    { id: 'reno', label: 'TCP Reno (AIMD with Fast Recovery)' },
    { id: 'tahoe', label: 'TCP Tahoe (Reset to 1 MSS on any loss)' }
  ],

  defaults: {
    algorithm: 'reno',
    bdp: 24,
    buffer: 12,
    rwnd: 48,
    lossPct: 0,
    rounds: 30
  },

  // Presets mapping real-world network links
  presets: [
    {
      id: 'broadband',
      label: 'Broadband / WAN',
      desc: 'Balanced pipe and router queue with zero random loss. Demonstrates the clean AIMD sawtooth.',
      bdp: 24,
      buffer: 12,
      rwnd: 50,
      lossPct: 0,
      algorithm: 'reno'
    },
    {
      id: 'bufferbloat',
      label: 'Severe Bufferbloat',
      desc: 'Huge bottleneck router queue (2× BDP). Window inflates far past capacity before dropping, multiplying latency.',
      bdp: 16,
      buffer: 32,
      rwnd: 60,
      lossPct: 0,
      algorithm: 'reno'
    },
    {
      id: 'flow-limited',
      label: 'Receiver Flow Constrained',
      desc: 'Small receiver buffer (rwnd < BDP). Flow control clamps throughput before the network ever congests.',
      bdp: 30,
      buffer: 12,
      rwnd: 14,
      lossPct: 0,
      algorithm: 'reno'
    },
    {
      id: 'wireless',
      label: 'Lossy Wireless / 4G',
      desc: 'Random packet drops trigger premature multiplicative decreases, preventing TCP from filling the link.',
      bdp: 24,
      buffer: 10,
      rwnd: 50,
      lossPct: 2.5,
      algorithm: 'reno'
    },
    {
      id: 'tahoe-legacy',
      label: 'TCP Tahoe (Legacy)',
      desc: 'Cuts cwnd to 1 MSS on every loss event and restarts slow start, suffering heavy throughput penalties.',
      bdp: 24,
      buffer: 12,
      rwnd: 50,
      lossPct: 0,
      algorithm: 'tahoe'
    }
  ],

  // URL query parameter abbreviations for shareable scenarios
  params: {
    algorithm: 'algo',
    bdp: 'bdp',
    buffer: 'buf',
    rwnd: 'rwnd',
    lossPct: 'loss',
    rounds: 'r'
  },

  phases: {
    'slow-start': 'Slow Start',
    'congestion-avoidance': 'Congestion Avoidance',
    'fast-recovery': 'Fast Recovery',
    'flow-capped': 'Flow Capped (rwnd)'
  },

  events: {
    none: 'Normal transmission',
    'buffer-overflow': 'Buffer overflow (Tail Drop)',
    'random-loss': 'Random wireless packet loss',
    'rwnd-limit': 'Clamped by receive window'
  },

  ui: {
    title: 'TCP Congestion & Flow Control Simulator',
    subtitle: 'See how TCP probes network capacity, climbs in Slow Start, cuts back on packet loss (AIMD), and adapts to bottleneck buffers and flow control limits.',
    presetsLabel: 'Pre-configured network links',
    algoLabel: 'Congestion control algorithm',
    bdpLabel: 'Bandwidth-Delay Product (BDP)',
    bufferLabel: 'Bottleneck router queue capacity',
    rwndLabel: 'Receiver window (rwnd)',
    lossLabel: 'Random packet loss rate',
    roundsLabel: 'Simulation rounds (RTTs)',
    segmentsUnit: (n) => `${n} segments`,
    pctUnit: (n) => `${n}%`,
    roundsUnit: (n) => `${n} RTTs`,
    copyLink: 'Copy shareable link',
    copied: 'Link copied to clipboard.',
    copyFailed: 'Could not copy link.',
    stats: {
      delivered: 'Packets delivered',
      dropped: 'Packets dropped',
      avgUtilization: 'Average link utilization',
      lossEvents: 'Congestion loss events',
      peakQueue: 'Peak router queue'
    },
    chart: {
      ariaLabel: 'Chart showing TCP congestion window over round trips',
      xAxis: 'Round Trip Time (RTT)',
      yAxis: 'Segments (MSS)',
      legendCwnd: 'Congestion window (cwnd)',
      legendInFlight: 'Actual in-flight packets',
      legendSsthresh: 'Slow Start Threshold (ssthresh)',
      legendBdp: 'Ideal pipe capacity (BDP)',
      legendCapacity: 'Total capacity ceiling (BDP + Buffer)',
      legendDrop: 'Packet loss event'
    },
    table: {
      heading: 'Round-by-round state transitions',
      headers: {
        rtt: 'RTT',
        phase: 'Phase',
        cwnd: 'cwnd',
        ssthresh: 'ssthresh',
        inFlight: 'In flight',
        queue: 'Queue',
        utilization: 'Link util.',
        event: 'Event'
      }
    }
  },

  advice: {
    aimdSawtooth: (drops, avgUtil) =>
      `The classic AIMD sawtooth: ${drops} packet loss ${drops === 1 ? 'event occurred' : 'events occurred'}. TCP kept the link ${avgUtil}% utilized by probing until buffer saturation and halving back.`,
    bufferbloat: (queuePackets, bdp) =>
      `Bufferbloat warning: The router queue held up to ${queuePackets} segments (${Math.round((queuePackets / bdp) * 100)}% of the BDP). Packets waited in the bloated buffer before dropping, heavily inflating latency.`,
    flowLimited: (rwnd, bdp) =>
      `Receiver constrained: The receiver's buffer (${rwnd} segments) is smaller than the network pipe (${bdp} segments). Flow control (rwnd) stops TCP from ever causing congestion or fully utilizing the bandwidth.`,
    wirelessLoss: (drops) =>
      `Loss sensitivity: ${drops} random packet ${drops === 1 ? 'drop' : 'drops'} occurred without router queue saturation. TCP mistook link unreliability for congestion and halved its window needlessly.`,
    tahoeCollapse: (drops) =>
      `Tahoe restart penalty: Because Tahoe drops cwnd to 1 MSS on every loss, ${drops} loss ${drops === 1 ? 'event' : 'events'} forced slow start restarts and caused significant throughput dips.`
  }
};
