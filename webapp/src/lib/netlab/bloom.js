// The Bloom Filter arithmetic and sizing engine (webapp/tools/bloom-filter/index.html).
// Implements Kirsch-Mitzenmacher double-hashing for interactive bit arrays and standard
// asymptotic sizing equations for optimal capacity planning.

import { BLOOMLAB } from '../../config/bloomlab.js';

const { model } = BLOOMLAB;

/**
 * 32-bit FNV-1a hash with customizable initial seed.
 */
function fnv1a(str, seed = 2166136261) {
  let hash = seed >>> 0;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash >>> 0;
}

/**
 * Derives k bit indices in range [0, m - 1] using Kirsch-Mitzenmacher optimization:
 * g_i(x) = (h1(x) + i * h2(x)) mod m
 */
export function getBitIndices(key, m, k) {
  const h1 = fnv1a(key, 2166136261);
  const h2 = fnv1a(key, 3735928559);
  const indices = [];

  for (let i = 0; i < k; i++) {
    const idx = (h1 + Math.imul(i, h2)) >>> 0;
    indices.push(idx % m);
  }
  return indices;
}

/**
 * Creates an in-memory bit array filter.
 */
export function createFilter(m = model.visualBitSize, k = model.defaultHashes) {
  return {
    m,
    k,
    bits: new Uint8Array(m),
    insertedKeys: new Set()
  };
}

/**
 * Inserts a key into the filter, returning the modified bit indices.
 */
export function insert(filter, key) {
  const indices = getBitIndices(key, filter.m, filter.k);
  for (const idx of indices) {
    filter.bits[idx] = 1;
  }
  filter.insertedKeys.add(key);
  return indices;
}

/**
 * Queries whether key is in the filter.
 * Returns: { probablyPresent: boolean, indices: number[], missingIndices: number[] }
 */
export function query(filter, key) {
  const indices = getBitIndices(key, filter.m, filter.k);
  const missingIndices = indices.filter((idx) => filter.bits[idx] === 0);
  return {
    probablyPresent: missingIndices.length === 0,
    indices,
    missingIndices
  };
}

/**
 * Computes live operational statistics and theoretical false positive probability.
 */
export function getFilterStats(filter) {
  let bitsSet = 0;
  for (let i = 0; i < filter.m; i++) {
    if (filter.bits[i] === 1) bitsSet += 1;
  }

  const fillPct = Math.round((bitsSet / filter.m) * 100);
  const n = filter.insertedKeys.size;

  // Theoretical FP rate: p = (1 - e^(-k*n/m))^k
  const exponent = (-filter.k * n) / filter.m;
  const theoreticalFp = n === 0 ? 0 : Math.pow(1 - Math.exp(exponent), filter.k);
  const fpPct = Math.round(theoreticalFp * 1000) / 10;

  return {
    itemsCount: n,
    bitsSet,
    fillPct,
    fpPct
  };
}

/**
 * Calculates optimal bit array size (m) and hash count (k) given item count (n) and target error rate (p).
 * Equations:
 *   m = - (n * ln(p)) / ((ln 2)^2)
 *   k = (m / n) * ln(2)
 */
export function calculateOptimal(n, p) {
  const safeN = Math.max(1, Math.round(Number(n) || 1000));
  const safeP = Math.max(0.000001, Math.min(0.5, Number(p) || 0.01));

  const ln2 = Math.LN2;
  const lnP = Math.log(safeP);

  const m = Math.round((-safeN * lnP) / (ln2 * ln2));
  const bitsPerItem = Math.round((m / safeN) * 10) / 10;
  const k = Math.max(1, Math.round(bitsPerItem * ln2));

  const totalBytes = Math.ceil(m / 8);
  const totalKb = Math.round((totalBytes / 1024) * 10) / 10;
  const totalMb = Math.round((totalBytes / (1024 * 1024)) * 100) / 100;

  return {
    n: safeN,
    p: safeP,
    optimalM: m,
    optimalK: k,
    bitsPerItem,
    totalBytes,
    totalKb,
    totalMb
  };
}
