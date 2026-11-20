// Pure simulation arithmetic for the Rate Limiting Lab (webapp/tools/rate-limiting/index.html).
// Simulates Token Bucket, Leaky Bucket, and Sliding Window algorithms under identical arrival profiles.

import { RATELIMITLAB } from '../../config/ratelimitlab.js';

const { model, inputs, algorithms, trafficProfiles, defaults, params } = RATELIMITLAB;

/**
 * Returns deterministic incoming traffic time series for a chosen profile.
 */
export function getTrafficPattern(profileId) {
  if (profileId === 'sustained-overload') {
    return [10, 12, 12, 14, 11, 10, 12, 12, 11, 10, 12, 12, 11, 10, 12, 12, 11, 10, 12, 11];
  }
  if (profileId === 'steady-flow') {
    return [4, 4, 4, 4, 5, 4, 4, 4, 5, 4, 4, 4, 5, 4, 4, 4, 5, 4, 4, 4];
  }
  // Default: bursty-spikes
  return [2, 2, 12, 14, 3, 2, 2, 2, 15, 3, 2, 1, 2, 2, 14, 3, 2, 2, 1, 1];
}

/**
 * Normalizes input parameters safely within allowed ranges.
 */
export function normalize(raw = {}) {
  const rateSpec = inputs.rate;
  const burstSpec = inputs.burst;

  const rawRate = Number(raw.rate);
  const rate = Number.isFinite(rawRate) ? Math.min(rateSpec.max, Math.max(rateSpec.min, Math.round(rawRate))) : defaults.rate;

  const rawBurst = Number(raw.burst);
  const burst = Number.isFinite(rawBurst) ? Math.min(burstSpec.max, Math.max(burstSpec.min, Math.round(rawBurst))) : defaults.burst;

  const algo = algorithms.some((a) => a.id === raw.algorithm) ? raw.algorithm : defaults.algorithm;
  const profile = trafficProfiles.some((p) => p.id === raw.profile) ? raw.profile : defaults.profile;

  return {
    algorithm: algo,
    rate,
    burst,
    profile
  };
}

/**
 * Simulates rate limiting across discrete 1-second time intervals.
 */
export function simulate(raw = {}) {
  const config = normalize(raw);
  const traffic = getTrafficPattern(config.profile);
  const { algorithm, rate, burst } = config;

  const timeline = [];
  let totalIncoming = 0;
  let totalAccepted = 0;
  let totalRejected = 0;
  let peakState = 0;

  let tokens = burst; // Token Bucket begins with full token capacity
  let queue = 0; // Leaky Bucket begins with empty buffer queue

  for (let t = 0; t < model.durationSeconds; t++) {
    const incoming = traffic[t] || 0;
    totalIncoming += incoming;

    let accepted = 0;
    let rejected = 0;
    let stateVal = 0;

    if (algorithm === 'token-bucket') {
      // Refill tokens up to burst capacity
      tokens = Math.min(burst, tokens + rate);
      accepted = Math.min(incoming, tokens);
      rejected = incoming - accepted;
      tokens -= accepted;
      stateVal = tokens;
      peakState = Math.max(peakState, burst - tokens);
    } else if (algorithm === 'leaky-bucket') {
      // Traffic shaper: requests enter buffer queue; buffer drips at constant rate
      const freeQueue = burst - queue;
      const enqueued = Math.min(incoming, freeQueue);
      rejected = incoming - enqueued;
      queue += enqueued;
      peakState = Math.max(peakState, queue);

      // Drain from queue at constant leak rate
      accepted = Math.min(queue, rate);
      queue -= accepted;
      stateVal = queue;
    } else {
      // Sliding window / fixed rate baseline
      accepted = Math.min(incoming, rate);
      rejected = incoming - accepted;
      stateVal = accepted;
    }

    totalAccepted += accepted;
    totalRejected += rejected;

    timeline.push({
      time: t + 1,
      incoming,
      accepted,
      rejected,
      stateVal
    });
  }

  const acceptancePct = totalIncoming > 0 ? Math.round((totalAccepted / totalIncoming) * 100) : 100;

  return {
    config,
    timeline,
    summary: {
      totalIncoming,
      totalAccepted,
      totalRejected,
      acceptancePct,
      peakState
    },
    advice: generateAdvice(config, totalAccepted, totalRejected, totalIncoming)
  };
}

function generateAdvice(config, accepted, rejected, total) {
  const tips = [];
  const { advice } = RATELIMITLAB;

  if (config.algorithm === 'token-bucket' && accepted >= config.burst) {
    tips.push(advice.tokenBurst(accepted, config.burst));
  } else if (config.algorithm === 'leaky-bucket') {
    tips.push(advice.leakySmoothing(config.rate));
  }

  if (rejected > 0) {
    tips.push(advice.sustainedThrottle(rejected, total));
  }

  return tips;
}

export function toQuery(state) {
  const parts = [];
  for (const [key, param] of Object.entries(params)) {
    if (state[key] !== undefined && state[key] !== defaults[key]) {
      parts.push(`${param}=${encodeURIComponent(state[key])}`);
    }
  }
  return parts.join('&');
}

export function fromQuery(search) {
  const query = new URLSearchParams(search);
  const out = {};
  for (const [key, param] of Object.entries(params)) {
    const val = query.get(param);
    if (val !== null) {
      out[key] = ['rate', 'burst'].includes(key) ? Number(val) : val;
    }
  }
  return normalize(out);
}
