// Arithmetic engine for estimating socket buffer RAM, file descriptor limits, and backplane bandwidth.
// Plain JS, zero external dependencies.

import { formatBytes, formatBitsPerSec } from './estimator.js';

export function calculateWebSocketScaling({
  connections = 200_000,
  bufferSizeKb = 8,
  fdLimitPerNode = 65_535,
  nodeRamGb = 16,
  msgRatePerSec = 50,
  msgSizeKb = 0.5
}) {
  const conn = Math.max(100, Number(connections) || 200_000);
  const bufKb = Math.max(1, Number(bufferSizeKb) || 8);
  const fdLimit = Math.max(1000, Number(fdLimitPerNode) || 65_535);
  const ramGb = Math.max(1, Number(nodeRamGb) || 16);
  const rate = Math.max(1, Number(msgRatePerSec) || 50);
  const sizeKb = Math.max(0.1, Number(msgSizeKb) || 0.5);

  // Total RAM needed for socket buffers (TCP rmem + wmem + application state)
  const totalSocketRamBytes = conn * bufKb * 1024;
  const nodeRamBytes = ramGb * 1024 * 1024 * 1024;

  // Nodes needed by RAM (assuming 75% usable RAM after OS/daemon overhead)
  const usableNodeRamBytes = nodeRamBytes * 0.75;
  const nodesByRam = Math.ceil(totalSocketRamBytes / usableNodeRamBytes);

  // Nodes needed by File Descriptors (assuming 85% safe utilization of ulimit -n)
  const usableFdPerNode = Math.floor(fdLimit * 0.85);
  const nodesByFd = Math.ceil(conn / usableFdPerNode);

  const recommendedNodes = Math.max(nodesByRam, nodesByFd, 2); // minimum 2 for HA redundancy

  // Connections per node
  const connsPerNode = Math.ceil(conn / recommendedNodes);

  // Network Fan-out Bandwidth
  // Total outbound messages = msgRate * total connected clients receiving the broadcast
  const egressBytesPerSec = rate * sizeKb * 1024 * conn;
  const egressBps = egressBytesPerSec * 8;

  // Recommended reconnection backoff duration to prevent thundering herd reconnection storm
  const recommendedJitterSeconds = Math.max(10, Math.round(conn / 10000));

  return {
    connections: conn,
    totalSocketRamBytes,
    totalSocketRamFormatted: formatBytes(totalSocketRamBytes),
    recommendedNodes,
    connsPerNode,
    nodesByRam,
    nodesByFd,
    limitingFactor: nodesByFd > nodesByRam ? 'File Descriptors (ulimit -n)' : 'Socket Buffer RAM',
    egressBps,
    egressFormatted: formatBitsPerSec(egressBps),
    recommendedJitterSeconds
  };
}
