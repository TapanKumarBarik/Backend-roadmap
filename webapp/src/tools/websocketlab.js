// Interactive UI controller for Real-Time Connection & WebSocket Scaling Lab (/tools/websocket-scaling/).
// Plain DOM, zero external dependencies.

import './shell.js';
import { WS_LAB_CONFIG } from '../config/websocketlab.js';
import { calculateWebSocketScaling } from '../lib/netlab/websocketlab.js';

const $ = (id) => document.getElementById(id);
const make = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

let currentPresetKey = 'liveChat';
let currentParams = { ...WS_LAB_CONFIG.presets.liveChat };

function renderCalculations() {
  const result = calculateWebSocketScaling(currentParams);

  $('ws-stat-total-nodes').textContent = `${result.recommendedNodes} Gateway Servers`;
  $('ws-stat-conns-node').textContent = `${result.connsPerNode.toLocaleString()} conns/server`;
  $('ws-stat-total-ram').textContent = result.totalSocketRamFormatted;
  $('ws-stat-bottleneck').textContent = result.limitingFactor;
  $('ws-stat-egress').textContent = result.egressFormatted;
  $('ws-stat-jitter').textContent = `${result.recommendedJitterSeconds}s Jitter Window`;

  // Visual Nodes Cluster
  const clusterEl = $('ws-cluster-grid');
  if (clusterEl) {
    clusterEl.replaceChildren();
    for (let i = 0; i < Math.min(24, result.recommendedNodes); i++) {
      const nodeCard = make('div', 'ws-node-card');
      const title = make('span', 'ws-node-title', `Gateway #${i + 1}`);
      const conns = make('span', 'ws-node-conns', `${result.connsPerNode.toLocaleString()} conns`);
      nodeCard.appendChild(title);
      nodeCard.appendChild(conns);
      clusterEl.appendChild(nodeCard);
    }
    if (result.recommendedNodes > 24) {
      const more = make('div', 'ws-node-card is-more', `+${result.recommendedNodes - 24} more nodes`);
      clusterEl.appendChild(more);
    }
  }
}

function syncInputsFromParams() {
  $('ws-input-conns').value = currentParams.connections;
  $('ws-input-buffer').value = currentParams.bufferSizeKb;
  $('ws-input-fd').value = currentParams.fdLimitPerNode;
  $('ws-input-ram').value = currentParams.nodeRamGb;
  $('ws-input-rate').value = currentParams.msgRatePerSec;
  $('ws-input-size').value = currentParams.msgSizeKb;
}

function readParamsFromInputs() {
  currentParams.connections = Math.max(100, Number($('ws-input-conns').value) || 200_000);
  currentParams.bufferSizeKb = Math.max(1, Number($('ws-input-buffer').value) || 8);
  currentParams.fdLimitPerNode = Math.max(1024, Number($('ws-input-fd').value) || 65_535);
  currentParams.nodeRamGb = Math.max(1, Number($('ws-input-ram').value) || 16);
  currentParams.msgRatePerSec = Math.max(1, Number($('ws-input-rate').value) || 50);
  currentParams.msgSizeKb = Math.max(0.1, Number($('ws-input-size').value) || 0.5);
}

function applyPreset(key) {
  currentPresetKey = key;
  const p = WS_LAB_CONFIG.presets[key];
  if (!p) return;
  currentParams = { ...p };
  syncInputsFromParams();
  renderCalculations();
}

function setupControls() {
  const presetsContainer = $('ws-presets-bar');
  if (presetsContainer) {
    presetsContainer.replaceChildren();
    Object.entries(WS_LAB_CONFIG.presets).forEach(([key, p]) => {
      const btn = make('button', `tool-btn tool-btn-sm ${key === currentPresetKey ? 'is-active' : ''}`, p.name);
      btn.addEventListener('click', () => {
        presetsContainer.querySelectorAll('button').forEach((b) => b.classList.remove('is-active'));
        btn.classList.add('is-active');
        applyPreset(key);
      });
      presetsContainer.appendChild(btn);
    });
  }

  const ids = ['ws-input-conns', 'ws-input-buffer', 'ws-input-fd', 'ws-input-ram', 'ws-input-rate', 'ws-input-size'];
  ids.forEach((id) => {
    const el = $(id);
    if (el) {
      el.addEventListener('input', () => {
        readParamsFromInputs();
        renderCalculations();
      });
    }
  });
}

function init() {
  setupControls();
  applyPreset('liveChat');
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
