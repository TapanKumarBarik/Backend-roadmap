// Core Vector Clock mathematics, causal ordering, and conflict detection.
// Follows Fidge & Mattern vector clock algorithm and Amazon Dynamo reconciliation semantics.

/** Creates an initial empty vector clock for a given list of actor IDs */
export function createClock(actors = ['A', 'B', 'C']) {
  const clock = {};
  for (const a of actors) clock[a] = 0;
  return clock;
}

/** Returns a shallow copy of a vector clock */
export function cloneClock(clock) {
  return { ...clock };
}

/** Formats clock as human-readable string: "[A: 1, B: 2, C: 0]" */
export function formatClock(clock) {
  const entries = Object.entries(clock)
    .sort(([k1], [k2]) => k1.localeCompare(k2))
    .map(([k, v]) => `${k}: ${v}`);
  return `[${entries.join(', ')}]`;
}

/** Local event tick: increments actor's own logical counter */
export function tick(clock, actor) {
  const updated = cloneClock(clock);
  updated[actor] = (updated[actor] || 0) + 1;
  return updated;
}

/**
 * Message receive: takes component-wise maximum with incoming clock,
 * then increments actor's own counter.
 */
export function receive(localClock, actor, incomingClock) {
  const updated = cloneClock(localClock);
  for (const k of Object.keys(updated)) {
    updated[k] = Math.max(updated[k] || 0, incomingClock[k] || 0);
  }
  updated[actor] = (updated[actor] || 0) + 1;
  return updated;
}

/**
 * Compares two vector clocks v1 and v2.
 * Returns:
 * - 'EQUAL': v1 == v2
 * - 'BEFORE': v1 happened before v2 (v1 < v2, causally preceding)
 * - 'AFTER': v1 happened after v2 (v1 > v2)
 * - 'CONCURRENT': v1 and v2 are concurrent (v1 || v2, conflicting/divergent)
 */
export function compareClocks(v1, v2) {
  const keys = Array.from(new Set([...Object.keys(v1), ...Object.keys(v2)]));
  let hasLess = false;
  let hasGreater = false;

  for (const k of keys) {
    const val1 = v1[k] || 0;
    const val2 = v2[k] || 0;
    if (val1 < val2) hasLess = true;
    if (val1 > val2) hasGreater = true;
  }

  if (!hasLess && !hasGreater) return 'EQUAL';
  if (hasLess && !hasGreater) return 'BEFORE';
  if (!hasLess && hasGreater) return 'AFTER';
  return 'CONCURRENT';
}

/** True when two clocks represent concurrent divergent writes (conflict) */
export function isConflict(v1, v2) {
  return compareClocks(v1, v2) === 'CONCURRENT';
}
