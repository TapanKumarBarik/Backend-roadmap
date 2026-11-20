// The Consistent Hashing Lab (webapp/tools/consistent-hashing/index.html):
// interactive circular hash ring, virtual nodes slider, live key routing, and partition balance metrics.
// Plain DOM & SVG, zero external dependencies.

import './shell.js';
import { HASHRINGLAB } from '../config/hashringlab.js';
import { buildRing, analyzeDistribution, calculateMigration, normalize, toQuery, fromQuery } from '../lib/netlab/hashring.js';

const { availableNodes, presets, sampleKeyPool, ui, advice } = HASHRINGLAB;

const $ = (id) => document.getElementById(id);
const make = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

const SVG_NS = 'http://www.w3.org/2000/svg';
const draw = (tag, attributes = {}, text) => {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [name, value] of Object.entries(attributes)) {
    node.setAttribute(name, String(value));
  }
  if (text !== undefined) node.textContent = text;
  return node;
};

let state = fromQuery(location.search);
let keys = [...sampleKeyPool];
let previousRing = null;

/* ------------------------------------------------------------------------------------------------ Controls */

const vnodesInput = $('hr-vnodes');
vnodesInput.min = '1';
vnodesInput.max = '30';
vnodesInput.value = String(state.vnodes);
$('hr-vnodes-out').textContent = ui.vnodesUnit(state.vnodes);

vnodesInput.addEventListener('input', () => {
  state = normalize({ ...state, vnodes: Number(vnodesInput.value) });
  $('hr-vnodes-out').textContent = ui.vnodesUnit(state.vnodes);
  update();
});

// Physical Node Checkboxes
const nodesContainer = $('hr-nodes-group');
availableNodes.forEach((node) => {
  const label = make('label', 'hr-node-chip');
  label.style.setProperty('--chip-color', node.color);

  const checkbox = make('input');
  checkbox.type = 'checkbox';
  checkbox.value = node.id;
  checkbox.checked = state.nodes.includes(node.id);

  checkbox.addEventListener('change', () => {
    const nextNodes = state.nodes.filter((id) => id !== node.id);
    if (checkbox.checked) nextNodes.push(node.id);
    if (nextNodes.length < 2) {
      checkbox.checked = true; // Minimum 2 nodes
      return;
    }
    state = normalize({ ...state, nodes: nextNodes });
    update();
  });

  label.append(checkbox, document.createTextNode(` ${node.label}`));
  nodesContainer.append(label);
});

// Presets
const presetContainer = $('hr-presets');
presets.forEach((preset) => {
  const btn = make('button', 'tool-btn', preset.label);
  btn.type = 'button';
  btn.title = preset.desc;
  btn.addEventListener('click', () => {
    state = normalize({ ...state, nodes: preset.nodes, vnodes: preset.vnodes });
    syncControls();
    update();
  });
  presetContainer.append(btn);
});

// Custom Key Input
$('hr-add-key-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const input = $('hr-new-key');
  const val = input.value.trim();
  if (val && !keys.includes(val)) {
    keys.unshift(val);
    input.value = '';
    update();
  }
});

$('hr-reset-keys').addEventListener('click', () => {
  keys = [...sampleKeyPool];
  update();
});

function syncControls() {
  vnodesInput.value = String(state.vnodes);
  $('hr-vnodes-out').textContent = ui.vnodesUnit(state.vnodes);

  const inputs = nodesContainer.querySelectorAll('input[type="checkbox"]');
  inputs.forEach((input) => {
    input.checked = state.nodes.includes(input.value);
  });
}

/* ------------------------------------------------------------------------------------------------ SVG Ring Drawing */

const RING = {
  cx: 260,
  cy: 260,
  r: 190,
  keyR: 155
};

function renderRing(ring, analysis) {
  const container = $('hr-ring-container');
  container.replaceChildren();

  const svg = draw('svg', {
    viewBox: '0 0 520 520',
    role: 'img',
    'aria-label': ui.chartAria,
    class: 'hr-svg'
  });

  const { cx, cy, r, keyR } = RING;

  // Background Outer Circle & Hash Axis
  svg.append(draw('circle', { cx, cy, r, class: 'hr-ring-track' }));
  svg.append(draw('circle', { cx, cy, r: keyR, class: 'hr-key-track' }));

  // Angle helpers: 0 degrees is 12 o'clock (-90 deg in Cartesian coordinates)
  const toCoords = (angleDeg, radius) => {
    const rad = ((angleDeg - 90) * Math.PI) / 180;
    return {
      x: cx + radius * Math.cos(rad),
      y: cy + radius * Math.sin(rad)
    };
  };

  // Cardinal Tick Marks (0, 90, 180, 270 degrees)
  [0, 90, 180, 270].forEach((deg) => {
    const p1 = toCoords(deg, r - 6);
    const p2 = toCoords(deg, r + 6);
    svg.append(draw('line', { x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y, class: 'hr-ring-tick' }));
  });

  // Draw Virtual Node Tokens
  ring.forEach((vnode) => {
    const pt = toCoords(vnode.angle, r);
    const dot = draw('circle', {
      cx: pt.x,
      cy: pt.y,
      r: state.vnodes > 15 ? 3.5 : 5,
      class: 'hr-vnode-dot',
      fill: vnode.color
    });
    dot.append(draw('title', {}, `${vnode.nodeLabel} (${vnode.vnodeId})\nToken: ${vnode.token}\nAngle: ${Math.round(vnode.angle)}°`));
    svg.append(dot);
  });

  // Draw Keys & Connectors to Successor Tokens
  analysis.keyPlacements.forEach((placement) => {
    const kp = toCoords(placement.angle, keyR);

    // Key dot
    const keyDot = draw('circle', {
      cx: kp.x,
      cy: kp.y,
      r: 4,
      class: 'hr-key-dot',
      fill: placement.assignedColor
    });
    keyDot.append(draw('title', {}, `Key: "${placement.key}"\nAssigned to: ${placement.assignedNodeLabel}\nToken: ${placement.token}`));

    svg.append(keyDot);
  });

  // Center Info Summary
  const centerText1 = draw('text', { x: cx, y: cy - 8, class: 'hr-center-title', 'text-anchor': 'middle' }, `${state.nodes.length} Nodes`);
  const centerText2 = draw('text', { x: cx, y: cy + 16, class: 'hr-center-sub', 'text-anchor': 'middle' }, `${ring.length} Tokens`);
  svg.append(centerText1, centerText2);

  container.append(svg);
}

/* ------------------------------------------------------------------------------------------------ Metrics & Table */

function renderStats(analysis, currentRing) {
  $('hr-keys-count').textContent = String(analysis.totalKeys);
  $('hr-nodes-count').textContent = String(state.nodes.length);
  $('hr-tokens-count').textContent = String(analysis.tokensTotal);
  $('hr-stddev').textContent = `σ = ${analysis.stdDev}`;

  // Migration banner
  const banner = $('hr-migration-note');
  if (previousRing && previousRing.length !== currentRing.length) {
    const mig = calculateMigration(keys, previousRing, currentRing);
    banner.hidden = false;
    banner.textContent = advice.migrationEfficiency(mig.moved, mig.total, mig.naivePct);
  } else {
    banner.hidden = true;
  }

  // Diagnostic advice list
  const adviceList = $('hr-advice');
  adviceList.replaceChildren();

  const maxNode = analysis.nodeStats.reduce((max, n) => (n.count > max.count ? n : max), analysis.nodeStats[0]);
  const expectedShare = Math.round(100 / state.nodes.length);
  if (maxNode && maxNode.sharePct >= expectedShare * 1.6) {
    adviceList.append(make('li', null, advice.hotspotWarning(maxNode.sharePct, expectedShare)));
  } else if (analysis.stdDev <= 2.5) {
    adviceList.append(make('li', null, advice.balancedSuccess(analysis.stdDev)));
  }

  // Table
  const tbody = $('hr-table-body');
  tbody.replaceChildren();

  analysis.nodeStats.forEach((stat) => {
    const tr = make('tr');

    const nameCell = make('td', 'hr-node-name');
    const badge = make('span', 'hr-color-badge');
    badge.style.backgroundColor = stat.color;
    nameCell.append(badge, document.createTextNode(stat.label));

    const tokenCell = make('td', 'is-number', String(state.vnodes));
    const keysCell = make('td', 'is-number', String(stat.count));

    const shareCell = make('td');
    const bar = make('div', 'hr-share-bar-track');
    const fill = make('div', 'hr-share-bar-fill');
    fill.style.width = `${stat.sharePct}%`;
    fill.style.backgroundColor = stat.color;
    bar.append(fill);
    shareCell.append(bar, make('span', 'hr-share-text', `${stat.sharePct}%`));

    tr.append(nameCell, tokenCell, keysCell, shareCell);
    tbody.append(tr);
  });
}

/* ------------------------------------------------------------------------------------------------ Main Loop */

function update() {
  const ring = buildRing(state.nodes, state.vnodes);
  const analysis = analyzeDistribution(keys, ring, state.nodes);

  renderRing(ring, analysis);
  renderStats(analysis, ring);

  previousRing = ring;

  const query = toQuery(state);
  history.replaceState(null, '', query ? `?${query}` : location.pathname);
}

$('hr-copy').addEventListener('click', async () => {
  const note = $('hr-copy-note');
  try {
    await navigator.clipboard.writeText(location.href);
    note.textContent = 'Link copied to clipboard.';
  } catch {
    note.textContent = 'Could not copy link.';
  }
});

update();
