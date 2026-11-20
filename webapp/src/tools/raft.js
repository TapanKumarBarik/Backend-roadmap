// Interactive UI controller for the Raft Consensus Simulator (webapp/tools/raft-consensus/index.html).
// Plain DOM, zero external dependencies.

import './shell.js';
import { RAFT_CONFIG } from '../config/raftlab.js';
import {
  createCluster,
  startElection,
  replicateLog,
  crashNode,
  recoverNode,
  sendHeartbeats
} from '../lib/netlab/raft.js';

const $ = (id) => document.getElementById(id);

let cluster = createCluster(RAFT_CONFIG.nodeCount);
let activeMessages = [];

/* ------------------------------------------------------------------------------------------------ SVG Render */

function getNodeCoords(nodeId, total = 5) {
  const center = RAFT_CONFIG.svgSize / 2;
  const radius = RAFT_CONFIG.layoutRadius;
  // Node 1 at top (-PI/2)
  const angle = (2 * Math.PI * (nodeId - 1)) / total - Math.PI / 2;
  return {
    x: center + radius * Math.cos(angle),
    y: center + radius * Math.sin(angle)
  };
}

function renderClusterSvg() {
  const container = $('raft-canvas');
  if (!container) return;

  const size = RAFT_CONFIG.svgSize;
  let linesSvg = '';
  let nodesSvg = '';

  // Inter-node network lines
  for (let i = 1; i <= cluster.nodeCount; i++) {
    for (let j = i + 1; j <= cluster.nodeCount; j++) {
      const p1 = getNodeCoords(i, cluster.nodeCount);
      const p2 = getNodeCoords(j, cluster.nodeCount);
      linesSvg += `
        <line x1="${p1.x}" y1="${p1.y}" x2="${p2.x}" y2="${p2.y}" stroke="var(--border-subtle, #3f3f46)" stroke-width="1" stroke-dasharray="2 3" opacity="0.6" />
      `;
    }
  }

  // Active message animations
  for (const msg of activeMessages) {
    const fromP = getNodeCoords(msg.from, cluster.nodeCount);
    const toP = getNodeCoords(msg.to, cluster.nodeCount);
    linesSvg += `
      <g>
        <line x1="${fromP.x}" y1="${fromP.y}" x2="${toP.x}" y2="${toP.y}" stroke="${msg.color || 'var(--signal, #06b6d4)'}" stroke-width="2" />
        <circle cx="${(fromP.x + toP.x) / 2}" cy="${(fromP.y + toP.y) / 2}" r="4" fill="${msg.color || 'var(--signal, #06b6d4)'}" />
      </g>
    `;
  }

  // Node circles
  for (const node of cluster.nodes) {
    const coords = getNodeCoords(node.id, cluster.nodeCount);
    const roleConfig = RAFT_CONFIG.roles[node.role] || RAFT_CONFIG.roles.follower;
    const isLeader = node.role === 'leader';

    nodesSvg += `
      <g class="raft-node" data-id="${node.id}" style="cursor: pointer;">
        <circle cx="${coords.x}" cy="${coords.y}" r="${RAFT_CONFIG.nodeRadius}" fill="var(--bg, #ffffff)" stroke="${roleConfig.stroke}" stroke-width="${isLeader ? 3.5 : 2}" />
        ${isLeader ? `<circle cx="${coords.x}" cy="${coords.y}" r="${RAFT_CONFIG.nodeRadius + 4}" fill="none" stroke="${roleConfig.stroke}" stroke-width="1.5" stroke-dasharray="3 3" />` : ''}
        <text x="${coords.x}" y="${coords.y - 6}" font-size="12" font-weight="700" fill="var(--fg, #09090b)" text-anchor="middle" font-family="system-ui, sans-serif">Node ${node.id}</text>
        <text x="${coords.x}" y="${coords.y + 10}" font-size="10" font-weight="600" fill="${roleConfig.color}" text-anchor="middle" font-family="system-ui, sans-serif">${roleConfig.label}</text>
        <text x="${coords.x}" y="${coords.y + 22}" font-size="9" fill="var(--fg-muted, #71717a)" text-anchor="middle" font-family="monospace">T:${node.term} | Log:${node.commitIndex}</text>
      </g>
    `;
  }

  container.innerHTML = `
    <svg viewBox="0 0 ${size} ${size}" class="raft-svg" role="img" aria-label="Raft 5-node cluster state">
      <rect width="100%" height="100%" fill="transparent" />
      <g class="raft-network">${linesSvg}</g>
      <g class="raft-nodes">${nodesSvg}</g>
    </svg>
  `;

  // Attach node click handlers to toggle crash/election
  container.querySelectorAll('.raft-node').forEach((el) => {
    el.addEventListener('click', () => {
      const id = parseInt(el.getAttribute('data-id'), 10);
      const target = cluster.nodes.find((n) => n.id === id);
      if (!target) return;

      if (target.isCrashed) {
        recoverNode(cluster, id);
        logStatus(`Node ${id} recovered back online.`);
      } else if (target.role === 'leader') {
        crashNode(cluster, id);
        logStatus(`Leader Node ${id} crashed! Cluster lost its leader.`);
      } else {
        triggerElection(id);
      }
      renderAll();
    });
  });
}

/* ------------------------------------------------------------------------------------------------ Logs & Metrics */

function logStatus(msg, isSuccess = false) {
  const box = $('raft-log-box');
  if (!box) return;
  const time = new Date().toLocaleTimeString();
  const line = document.createElement('div');
  line.className = `raft-log-entry ${isSuccess ? 'is-success' : ''}`;
  line.textContent = `[${time}] ${msg}`;
  box.prepend(line);
}

function updateStats() {
  const leaderNode = cluster.nodes.find((n) => n.id === cluster.leaderId);
  const activeCount = cluster.nodes.filter((n) => !n.isCrashed).length;

  $('raft-stat-leader').textContent = leaderNode ? `Node ${leaderNode.id}` : 'None (Electing)';
  $('raft-stat-term').textContent = cluster.term;
  $('raft-stat-quorum').textContent = `${cluster.quorum} of ${cluster.nodeCount} nodes`;
  $('raft-stat-active').textContent = `${activeCount} / ${cluster.nodeCount} alive`;

  renderLogTable();
}

function renderLogTable() {
  const tbody = $('raft-log-tbody');
  if (!tbody) return;
  tbody.replaceChildren();

  // Find max log length across any node
  const maxLen = Math.max(...cluster.nodes.map((n) => n.log.length), 0);
  if (maxLen === 0) {
    const tr = document.createElement('tr');
    tr.innerHTML = '<td colspan="6" class="tool-note" style="text-align:center;">No entries appended yet. Click "Append Log Entry" below.</td>';
    tbody.appendChild(tr);
    return;
  }

  for (let idx = 1; idx <= maxLen; idx++) {
    const tr = document.createElement('tr');
    const leaderNode = cluster.nodes.find((n) => n.id === cluster.leaderId);
    const sampleEntry = leaderNode?.log[idx - 1] || cluster.nodes.find((n) => n.log[idx - 1])?.log[idx - 1];
    const cmd = sampleEntry ? sampleEntry.command : '-';
    const term = sampleEntry ? sampleEntry.term : '-';

    let cells = `<td><strong>#${idx}</strong> (T:${term})</td><td><code>${cmd}</code></td>`;
    for (const node of cluster.nodes) {
      const has = node.log[idx - 1];
      const isCommitted = node.commitIndex >= idx;
      let badge = '<span class="tool-unit">-</span>';
      if (has) {
        badge = isCommitted
          ? '<span style="color: var(--done); font-weight:700;">✓ Committed</span>'
          : '<span style="color: var(--warn); font-weight:600;">Pending</span>';
      }
      cells += `<td>${badge}</td>`;
    }
    tr.innerHTML = cells;
    tbody.appendChild(tr);
  }
}

/* ------------------------------------------------------------------------------------------------ Actions */

function triggerElection(candidateId = 1) {
  const res = startElection(cluster, candidateId);
  activeMessages = cluster.nodes
    .filter((n) => n.id !== candidateId && !n.isCrashed)
    .map((n) => ({ from: n.id, to: candidateId, color: '#eab308' }));

  setTimeout(() => {
    activeMessages = [];
    renderClusterSvg();
  }, 600);

  if (res.elected) {
    logStatus(`Node ${candidateId} won election in Term ${res.term} with ${res.votes}/${cluster.nodeCount} votes (Quorum: ${res.quorum}).`, true);
  } else {
    logStatus(`Election for Node ${candidateId} failed (Received ${res.votes}/${cluster.quorum} required votes).`);
  }
}

function handleHeartbeat() {
  const beats = sendHeartbeats(cluster);
  if (!beats.length) {
    logStatus('Cannot send heartbeats: no active leader.');
    return;
  }
  activeMessages = beats.map((b) => ({ from: b.from, to: b.to, color: 'var(--signal, #06b6d4)' }));
  logStatus(`Leader Node ${cluster.leaderId} dispatched heartbeat RPCs to ${beats.length} followers.`);

  setTimeout(() => {
    activeMessages = [];
    renderClusterSvg();
  }, 400);
}

function handleAppendEntry() {
  const input = $('raft-cmd-input');
  const cmd = input?.value.trim() || `SET val = ${Math.floor(Math.random() * 100)}`;
  if (input) input.value = '';

  const res = replicateLog(cluster, cmd);
  if (!res.committed) {
    logStatus(`Log replication failed: ${res.reason || 'No quorum'}`);
    return;
  }

  logStatus(`Entry "${cmd}" replicated to ${res.acks} nodes and COMMITTED (Quorum: ${res.quorum}).`, true);
}

function renderAll() {
  renderClusterSvg();
  updateStats();
}

/* ------------------------------------------------------------------------------------------------ Scenarios */

function setupScenarios() {
  const container = $('raft-scenarios');
  if (!container) return;

  const scenarios = [
    {
      name: 'Normal Election',
      run: () => {
        cluster = createCluster(RAFT_CONFIG.nodeCount);
        triggerElection(1);
        renderAll();
      }
    },
    {
      name: 'Leader Crash & Failover',
      run: () => {
        if (!cluster.leaderId) triggerElection(1);
        const oldLeader = cluster.leaderId;
        crashNode(cluster, oldLeader);
        logStatus(`Leader Node ${oldLeader} crashed. Starting failover election on Node 2...`);
        setTimeout(() => {
          triggerElection(2);
          renderAll();
        }, 300);
        renderAll();
      }
    },
    {
      name: 'Split Vote Tie',
      run: () => {
        cluster = createCluster(RAFT_CONFIG.nodeCount);
        // Simulate two nodes claiming votes concurrently
        cluster.nodes[0].role = 'candidate';
        cluster.nodes[0].term = 1;
        cluster.nodes[0].votedFor = 1;
        cluster.nodes[0].votesReceived = 2; // Node 1 + Node 3

        cluster.nodes[1].role = 'candidate';
        cluster.nodes[1].term = 1;
        cluster.nodes[1].votedFor = 2;
        cluster.nodes[1].votesReceived = 2; // Node 2 + Node 4

        cluster.nodes[4].votedFor = null; // Node 5 dropped
        cluster.term = 1;
        cluster.leaderId = null;

        logStatus('Split vote occurred: Node 1 has 2 votes, Node 2 has 2 votes. Neither reached quorum (3). Term expires.');
        renderAll();
      }
    },
    {
      name: 'Replicate Entries',
      run: () => {
        if (!cluster.leaderId) triggerElection(1);
        handleAppendEntry();
        renderAll();
      }
    }
  ];

  container.replaceChildren();
  scenarios.forEach((sc, idx) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `tool-pill ${idx === 0 ? 'is-active' : ''}`;
    btn.textContent = sc.name;
    btn.addEventListener('click', () => {
      container.querySelectorAll('.tool-pill').forEach((p) => p.classList.remove('is-active'));
      btn.classList.add('is-active');
      sc.run();
    });
    container.appendChild(btn);
  });
}

function init() {
  setupScenarios();

  $('raft-btn-election')?.addEventListener('click', () => {
    const alive = cluster.nodes.filter((n) => !n.isCrashed);
    if (alive.length) triggerElection(alive[0].id);
    renderAll();
  });

  $('raft-btn-heartbeat')?.addEventListener('click', () => {
    handleHeartbeat();
    renderAll();
  });

  $('raft-btn-append')?.addEventListener('click', () => {
    handleAppendEntry();
    renderAll();
  });

  $('raft-btn-crash')?.addEventListener('click', () => {
    if (cluster.leaderId) {
      const l = cluster.leaderId;
      crashNode(cluster, l);
      logStatus(`Crashed current leader Node ${l}.`);
    } else {
      const alive = cluster.nodes.filter((n) => !n.isCrashed);
      if (alive.length) {
        crashNode(cluster, alive[0].id);
        logStatus(`Crashed Node ${alive[0].id}.`);
      }
    }
    renderAll();
  });

  $('raft-btn-recover-all')?.addEventListener('click', () => {
    for (const n of cluster.nodes) recoverNode(cluster, n.id);
    logStatus('All nodes recovered.');
    renderAll();
  });

  // Start with normal election
  triggerElection(1);
  renderAll();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
