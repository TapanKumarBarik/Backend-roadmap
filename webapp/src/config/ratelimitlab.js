// The Rate Limiting Lab (webapp/tools/rate-limiting/index.html, script in webapp/src/tools/ratelimit.js,
// arithmetic in webapp/src/lib/netlab/ratelimit.js): simulation parameters, profiles, and educational advice.

export const RATELIMITLAB = {
  model: {
    durationSeconds: 20,
    timeStepSeconds: 1
  },

  inputs: {
    rate: { value: 5, min: 1, max: 20, step: 1 }, // tokens/requests processed per second
    burst: { value: 10, min: 2, max: 30, step: 1 } // token bucket capacity or leaky bucket queue depth
  },

  algorithms: [
    { id: 'token-bucket', label: 'Token Bucket (Allows bursts up to capacity)' },
    { id: 'leaky-bucket', label: 'Leaky Bucket (Strict constant outflow shaper)' },
    { id: 'sliding-window', label: 'Sliding Window Log (Strict rolling window rate)' }
  ],

  trafficProfiles: [
    {
      id: 'bursty-spikes',
      label: 'Bursty Web Traffic',
      desc: 'Normal low traffic with two sharp bursts simulating user page refreshes or webhook deliveries.'
    },
    {
      id: 'sustained-overload',
      label: 'Sustained Overload (DoS)',
      desc: 'Heavy continuous traffic exceeding processing capacity throughout the entire duration.'
    },
    {
      id: 'steady-flow',
      label: 'Steady Periodic Flow',
      desc: 'Uniform arrival rate within configured rate limits.'
    }
  ],

  defaults: {
    algorithm: 'token-bucket',
    rate: 5,
    burst: 10,
    profile: 'bursty-spikes'
  },

  params: {
    algorithm: 'algo',
    rate: 'r',
    burst: 'b',
    profile: 'p'
  },

  ui: {
    title: 'Rate Limiting & Traffic Shaping Lab',
    lead: 'How do production API gateways, Stripe, and Cloudflare protect services from abuse? Compare Token Bucket, Leaky Bucket, and Sliding Window algorithms under real-world traffic bursts.',
    algorithmLabel: 'Rate Limiting Algorithm',
    rateLabel: 'Sustained rate limit (refill / leak rate)',
    burstLabel: 'Burst capacity (bucket / queue size)',
    profileLabel: 'Traffic Pattern Profile',
    rateUnit: (n) => `${n} req/sec`,
    burstUnit: (n) => `${n} req burst`,
    stats: {
      totalRequests: 'Incoming requests',
      accepted: 'Requests accepted',
      rejected: 'Requests throttled (HTTP 429)',
      acceptanceRate: 'Acceptance rate',
      peakBuffer: 'Peak buffer / queue usage'
    },
    chart: {
      ariaLabel: 'Time series of incoming, accepted, and rejected requests',
      incoming: 'Incoming traffic',
      accepted: 'Accepted',
      rejected: 'Throttled (429)',
      bucketLevel: 'Available tokens / Queue depth'
    },
    tableHeaders: {
      time: 'Time',
      incoming: 'Incoming',
      accepted: 'Accepted',
      rejected: 'Throttled',
      bucket: 'Token / Queue State'
    }
  },

  advice: {
    tokenBurst: (acceptedBurst, burstCap) =>
      `Burst handled cleanly: Token Bucket instantly accommodated a burst of ${acceptedBurst} requests (capacity ${burstCap}) without latency or throttling. Subsequent excess requests were rejected at HTTP 429.`,
    leakySmoothing: (rate) =>
      `Smooth traffic shaping: Leaky Bucket queued bursty arrivals and drained them at an unvarying ${rate} req/sec to downstream services, shielding downstream databases from sudden load spikes.`,
    sustainedThrottle: (rejected, total) =>
      `Sustained abuse mitigation: Successfully rejected ${rejected} of ${total} requests (${Math.round((rejected / total) * 100)}%), capping backend resource consumption to configured safe limits.`
  }
};
