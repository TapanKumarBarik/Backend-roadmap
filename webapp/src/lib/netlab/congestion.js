// The simulation engine of the TCP Congestion & Flow Control Lab (webapp/tools/tcp-congestion/index.html).
// Pure arithmetic: takes network and transport parameters, returns the exact round-by-round time series,
// queue occupancy, AIMD window dynamics, and aggregate metrics.

import { CONGESTIONLAB } from '../../config/congestionlab.js';

const { model, inputs, algorithms, defaults, params } = CONGESTIONLAB;
const NUMERIC_KEYS = ['bdp', 'buffer', 'rwnd', 'lossPct', 'rounds'];

/**
 * Normalizes user input or URL query params, keeping numeric values safely clamped within specification bounds.
 */
export function normalize(raw = {}) {
  const out = {};
  for (const key of NUMERIC_KEYS) {
    const spec = inputs[key];
    const given = raw[key];
    const n = given === '' || given === null || given === undefined ? NaN : Number(given);
    out[key] = Number.isFinite(n) ? Math.min(spec.max, Math.max(spec.min, n)) : spec.value;
  }
  out.algorithm = algorithms.some((a) => a.id === raw.algorithm) ? raw.algorithm : defaults.algorithm;
  return out;
}

/**
 * Simulates TCP congestion control and flow control over a given number of RTT rounds.
 * @param {Object} raw User inputs
 * @param {Function} [randomFn=Math.random] Deterministic random number generator for loss simulation
 * @returns {Object} Full simulation report with rounds, aggregate stats, and diagnostic tips
 */
export function simulate(raw = {}, randomFn = Math.random) {
  const config = normalize(raw);
  const { algorithm, bdp, buffer, rwnd, lossPct, rounds } = config;
  const maxCapacity = bdp + buffer;

  let cwnd = model.initialCwnd;
  let ssthresh = model.defaultSsthresh;
  let phase = cwnd < ssthresh ? 'slow-start' : 'congestion-avoidance';

  const history = [];
  let totalDelivered = 0;
  let totalDropped = 0;
  let lossEventsCount = 0;
  let maxQueue = 0;
  let totalUtil = 0;
  let bufferbloatRounds = 0;
  let randomLossCount = 0;

  for (let r = 1; r <= rounds; r++) {
    const startCwnd = cwnd;
    const startSsthresh = ssthresh;

    // Actual packets in flight is bounded by receiver advertised window (rwnd)
    const inFlight = Math.min(cwnd, rwnd);

    // Physical link capacity and bottleneck buffer calculation
    const isBufferOverflow = inFlight > maxCapacity;
    const isRandomLoss = !isBufferOverflow && lossPct > 0 && randomFn() * 100 < lossPct;
    const hasLoss = isBufferOverflow || isRandomLoss;

    let delivered = 0;
    let dropped = 0;
    let queueOccupancy = 0;
    let event = 'none';

    if (isBufferOverflow) {
      delivered = maxCapacity;
      dropped = inFlight - maxCapacity;
      queueOccupancy = buffer;
      event = 'buffer-overflow';
      lossEventsCount += 1;
    } else if (isRandomLoss) {
      delivered = inFlight - 1;
      dropped = 1;
      queueOccupancy = Math.max(0, inFlight - bdp);
      event = 'random-loss';
      lossEventsCount += 1;
      randomLossCount += 1;
    } else {
      delivered = inFlight;
      dropped = 0;
      queueOccupancy = Math.max(0, inFlight - bdp);
      if (rwnd < cwnd) {
        event = 'rwnd-limit';
      }
    }

    if (queueOccupancy > bdp * 0.5) bufferbloatRounds += 1;
    maxQueue = Math.max(maxQueue, queueOccupancy);
    totalDelivered += delivered;
    totalDropped += dropped;

    const utilization = Math.min(100, Math.round((Math.min(inFlight, bdp) / bdp) * 100));
    totalUtil += utilization;

    let currentPhase = phase;
    if (inFlight === rwnd && rwnd <= cwnd) {
      currentPhase = 'flow-capped';
    }

    history.push({
      rtt: r,
      cwnd: startCwnd,
      ssthresh: startSsthresh,
      rwnd,
      inFlight,
      queue: queueOccupancy,
      utilization,
      delivered,
      dropped,
      phase: currentPhase,
      event
    });

    // Update TCP state for next round
    if (hasLoss) {
      ssthresh = Math.max(2, Math.floor(cwnd / 2));
      if (algorithm === 'reno') {
        // TCP Reno Fast Recovery (AIMD): halving window upon loss
        cwnd = ssthresh;
        phase = 'congestion-avoidance';
      } else {
        // TCP Tahoe: collapse window to 1 MSS and restart Slow Start
        cwnd = model.minCwnd;
        phase = 'slow-start';
      }
    } else {
      // Normal ACK progression
      if (cwnd < ssthresh) {
        // Slow Start: doubles every RTT up to ssthresh
        cwnd = Math.min(ssthresh, cwnd * 2);
        phase = cwnd < ssthresh ? 'slow-start' : 'congestion-avoidance';
      } else {
        // Congestion Avoidance: additive increase (+1 MSS per RTT)
        cwnd += 1;
        phase = 'congestion-avoidance';
      }
    }
  }

  const avgUtilization = Math.round(totalUtil / rounds);

  return {
    config,
    rounds: history,
    summary: {
      totalDelivered,
      totalDropped,
      avgUtilization,
      lossEventsCount,
      maxQueue,
      bufferbloatRounds,
      randomLossCount
    },
    advice: generateAdvice({
      config,
      lossEventsCount,
      avgUtilization,
      maxQueue,
      randomLossCount
    })
  };
}

/**
 * Generates actionable educational diagnostic takeaways for the scenario.
 */
function generateAdvice({ config, lossEventsCount, avgUtilization, maxQueue, randomLossCount }) {
  const tips = [];
  const { advice } = CONGESTIONLAB;

  if (config.rwnd < config.bdp) {
    tips.push(advice.flowLimited(config.rwnd, config.bdp));
  } else if (lossEventsCount > 0 && randomLossCount === 0) {
    tips.push(advice.aimdSawtooth(lossEventsCount, avgUtilization));
  }

  if (maxQueue >= config.bdp * 0.5) {
    tips.push(advice.bufferbloat(maxQueue, config.bdp));
  }

  if (randomLossCount > 0) {
    tips.push(advice.wirelessLoss(randomLossCount));
  }

  if (config.algorithm === 'tahoe' && lossEventsCount > 0) {
    tips.push(advice.tahoeCollapse(lossEventsCount));
  }

  return tips;
}

/**
 * Encodes simulation parameters into a compact URL query string.
 */
export function toQuery(state) {
  const parts = [];
  for (const [key, param] of Object.entries(params)) {
    if (state[key] !== undefined && state[key] !== defaults[key]) {
      parts.push(`${param}=${encodeURIComponent(state[key])}`);
    }
  }
  return parts.join('&');
}

/**
 * Decodes simulation parameters from a URL query string.
 */
export function fromQuery(search) {
  const query = new URLSearchParams(search);
  const out = {};
  for (const [key, param] of Object.entries(params)) {
    const val = query.get(param);
    if (val !== null) {
      out[key] = NUMERIC_KEYS.includes(key) ? Number(val) : val;
    }
  }
  return normalize(out);
}
