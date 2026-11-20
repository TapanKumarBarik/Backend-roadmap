// The consistent hashing arithmetic and ring partition logic for webapp/tools/consistent-hashing/index.html.
// Pure functions: calculates 32-bit hash tokens, builds the circular ring, routes keys to successor nodes,
// and evaluates key migration and load balance metrics.

import { HASHRINGLAB } from '../../config/hashringlab.js';

const { model, defaultNodes, availableNodes, params } = HASHRINGLAB;

/**
 * 32-bit FNV-1a non-cryptographic hash function.
 * Produces an unsigned 32-bit integer in range [0, 2^32 - 1].
 */
export function fnv1a32(str) {
  let hash = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash >>> 0;
}

/**
 * Normalizes user configuration, ensuring at least 2 nodes and safe vnode counts.
 */
export function normalize(raw = {}) {
  const givenNodes = Array.isArray(raw.nodes) ? raw.nodes : [];
  const validNodeIds = availableNodes.map((n) => n.id);
  const nodes = givenNodes.filter((id) => validNodeIds.includes(id));
  const finalNodes = nodes.length >= 2 ? nodes : defaultNodes.map((n) => n.id);

  const rawV = Number(raw.vnodes);
  const vnodes = Number.isFinite(rawV)
    ? Math.max(model.minVnodes, Math.min(model.maxVnodes, Math.round(rawV)))
    : model.defaultVnodes;

  return {
    nodes: finalNodes,
    vnodes
  };
}

/**
 * Builds the sorted circular hash ring with virtual nodes.
 * @param {string[]} nodeIds Active physical node IDs
 * @param {number} vnodesPerNode Virtual nodes per physical node
 * @returns {Array<{ token: number, angle: number, nodeId: string, vnodeId: string, nodeLabel: string, color: string }>}
 */
export function buildRing(nodeIds, vnodesPerNode) {
  const ring = [];
  const nodeMap = new Map(availableNodes.map((n) => [n.id, n]));

  for (const nodeId of nodeIds) {
    const info = nodeMap.get(nodeId) || { label: nodeId, color: '#888' };
    for (let v = 0; v < vnodesPerNode; v++) {
      const vnodeKey = `${nodeId}#v${v}`;
      const token = fnv1a32(vnodeKey);
      const angle = (token / model.ringSize) * 360;
      ring.push({
        token,
        angle,
        nodeId,
        vnodeId: vnodeKey,
        nodeLabel: info.label,
        color: info.color
      });
    }
  }

  ring.sort((a, b) => a.token - b.token);
  return ring;
}

/**
 * Finds the primary successor node on the circular ring for a given hash token (or key string).
 */
export function routeKey(key, ring) {
  if (ring.length === 0) return null;
  const token = typeof key === 'number' ? key : fnv1a32(key);

  // Binary search for the first token >= key token
  let low = 0;
  let high = ring.length - 1;
  let idx = 0;

  if (token > ring[high].token) {
    // Circular wrap: key falls after the last token, belongs to the first token on the ring
    idx = 0;
  } else {
    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      if (ring[mid].token >= token) {
        idx = mid;
        high = mid - 1;
      } else {
        low = mid + 1;
      }
    }
  }

  const assigned = ring[idx];
  return {
    key: typeof key === 'string' ? key : String(key),
    token,
    angle: (token / model.ringSize) * 360,
    assignedNodeId: assigned.nodeId,
    assignedNodeLabel: assigned.nodeLabel,
    assignedVnodeId: assigned.vnodeId,
    assignedColor: assigned.color
  };
}

/**
 * Analyzes key allocation across active physical nodes and computes balance metrics.
 */
export function analyzeDistribution(keys, ring, activeNodeIds) {
  const nodeMap = new Map(availableNodes.map((n) => [n.id, n]));
  const counts = {};
  for (const id of activeNodeIds) counts[id] = 0;

  const keyPlacements = keys.map((k) => {
    const placement = routeKey(k, ring);
    if (placement && counts[placement.assignedNodeId] !== undefined) {
      counts[placement.assignedNodeId] += 1;
    }
    return placement;
  });

  const totalKeys = keys.length;
  const nodeStats = activeNodeIds.map((id) => {
    const info = nodeMap.get(id);
    const count = counts[id] || 0;
    const sharePct = totalKeys > 0 ? Math.round((count / totalKeys) * 100) : 0;
    return {
      nodeId: id,
      label: info ? info.label : id,
      color: info ? info.color : '#888',
      count,
      sharePct
    };
  });

  // Calculate standard deviation of key counts
  const mean = totalKeys / Math.max(1, activeNodeIds.length);
  const variance =
    nodeStats.reduce((sum, item) => sum + Math.pow(item.count - mean, 2), 0) /
    Math.max(1, activeNodeIds.length);
  const stdDev = Math.round(Math.sqrt(variance) * 10) / 10;

  return {
    keyPlacements,
    nodeStats,
    mean: Math.round(mean * 10) / 10,
    stdDev,
    totalKeys,
    tokensTotal: ring.length
  };
}

/**
 * Simulates adding or removing a node, calculating how many keys migrate compared to modulo hashing.
 */
export function calculateMigration(keys, originalRing, modifiedRing) {
  if (!originalRing.length || !modifiedRing.length) return { moved: 0, movedPct: 0, naivePct: 0 };

  let moved = 0;
  for (const k of keys) {
    const prev = routeKey(k, originalRing);
    const curr = routeKey(k, modifiedRing);
    if (prev && curr && prev.assignedNodeId !== curr.assignedNodeId) {
      moved += 1;
    }
  }

  const total = Math.max(1, keys.length);
  const movedPct = Math.round((moved / total) * 100);

  // Naive modulo hashing would invalidate ~ (N-1)/N of all keys on node addition/removal
  const naivePct = Math.round(((originalRing.length - 1) / Math.max(1, originalRing.length)) * 100);

  return {
    moved,
    total,
    movedPct,
    naivePct: Math.min(90, Math.max(50, naivePct))
  };
}

/**
 * Encodes ring parameters to URL query string.
 */
export function toQuery(state) {
  const parts = [];
  if (state.vnodes !== undefined) parts.push(`${params.vnodes}=${state.vnodes}`);
  if (Array.isArray(state.nodes)) parts.push(`${params.nodes}=${state.nodes.join(',')}`);
  return parts.join('&');
}

/**
 * Decodes ring parameters from URL query string.
 */
export function fromQuery(search) {
  const query = new URLSearchParams(search);
  const raw = {};
  if (query.has(params.vnodes)) raw.vnodes = Number(query.get(params.vnodes));
  if (query.has(params.nodes)) raw.nodes = query.get(params.nodes).split(',').filter(Boolean);
  return normalize(raw);
}
