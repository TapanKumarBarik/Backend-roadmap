// Interactive UI controller for the Vector Clocks & Distributed Causality Lab (webapp/tools/vector-clocks/index.html).
// Plain DOM, zero external dependencies.

import './shell.js';
import { VECTOR_CONFIG } from '../config/vectorlab.js';
import {
  createClock,
  cloneClock,
  tick,
  receive,
  compareClocks,
  formatClock
} from '../lib/netlab/vectorclock.js';

const $ = (id) => document.getElementById(id);

// Timeline State
let clocks = {
  A: createClock(),
  B: createClock(),
  C: createClock()
};

let events = [
  { id: 1, actor: 'A', type: 'init', clock: createClock(), x: 40, label: 'Start' },
  { id: 2, actor: 'B', type: 'init', clock: createClock(), x: 40, label: 'Start' },
  { id: 3, actor: 'C', type: 'init', clock: createClock(), x: 40, label: 'Start' }
];

let messages = [];
let nextX = 120;

/* ------------------------------------------------------------------------------------------------ SVG Timeline Render */

function getActorY(actorId) {
  switch (actorId) {
    case 'A': return 60;
    case 'B': return 150;
    case 'C': return 240;
    default: return 60;
  }
}

function renderTimeline() {
  const container = $('vc-timeline-canvas');
  if (!container) return;

  const width = Math.max(nextX + 100, 780);
  const height = 300;

  // Horizontal lifelines
  let linesSvg = `
    <defs>
      <marker id="vc-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
        <path d="M 0 1 L 10 5 L 0 9 z" fill="var(--signal, #06b6d4)" />
      </marker>
    </defs>
  `;

  for (const act of VECTOR_CONFIG.actors) {
    const y = getActorY(act.id);
    linesSvg += `
      <g>
        <line x1="30" y1="${y}" x2="${width - 30}" y2="${y}" stroke="var(--border-strong, #52525b)" stroke-width="1.8" />
        <text x="18" y="${y + 4}" font-size="12" font-weight="700" fill="var(--fg, #09090b)" text-anchor="end">${act.id}</text>
      </g>
    `;
  }

  // Directed message arrows
  let msgsSvg = '';
  for (const m of messages) {
    const y1 = getActorY(m.from);
    const y2 = getActorY(m.to);
    msgsSvg += `
      <g>
        <line x1="${m.fromX}" y1="${y1}" x2="${m.toX}" y2="${y2}" stroke="var(--signal, #06b6d4)" stroke-width="2" stroke-dasharray="4 3" marker-end="url(#vc-arrow)" />
        <text x="${(m.fromX + m.toX) / 2}" y="${(y1 + y2) / 2 - 6}" font-size="10" fill="var(--signal, #06b6d4)" text-anchor="middle" font-family="monospace">${m.label}</text>
      </g>
    `;
  }

  // Event dots & labels
  let eventsSvg = '';
  for (const ev of events) {
    const y = getActorY(ev.actor);
    const actorColor = VECTOR_CONFIG.actors.find((a) => a.id === ev.actor)?.color || 'var(--accent)';
    const clockText = formatClock(ev.clock);

    eventsSvg += `
      <g class="vc-event-group" data-id="${ev.id}" style="cursor: pointer;">
        <circle cx="${ev.x}" cy="${y}" r="6" fill="${actorColor}" stroke="var(--bg, #fff)" stroke-width="2" />
        <text x="${ev.x}" y="${y - 12}" font-size="9.5" font-weight="600" fill="var(--fg, #09090b)" text-anchor="middle" font-family="monospace">${clockText}</text>
        ${ev.label ? `<text x="${ev.x}" y="${y + 18}" font-size="9" fill="var(--fg-muted, #71717a)" text-anchor="middle">${ev.label}</text>` : ''}
      </g>
    `;
  }

  container.innerHTML = `
    <svg viewBox="0 0 ${width} ${height}" style="width: 100%; min-width: ${width}px; height: ${height}px;" role="img" aria-label="Vector Clocks Space-Time Diagram">
      <rect width="100%" height="100%" fill="transparent" />
      ${linesSvg}
      ${msgsSvg}
      ${eventsSvg}
    </svg>
  `;

  updateComparisonTable();
}

/* ------------------------------------------------------------------------------------------------ Comparison Matrix */

function updateComparisonTable() {
  const table = $('vc-matrix-tbody');
  if (!table) return;

  const pairs = [
    { a: 'A', b: 'B' },
    { a: 'A', b: 'C' },
    { a: 'B', b: 'C' }
  ];

  table.replaceChildren();

  for (const p of pairs) {
    const v1 = clocks[p.a];
    const v2 = clocks[p.b];
    const relation = compareClocks(v1, v2);

    let badge = '';
    let explanation = '';

    if (relation === 'EQUAL') {
      badge = '<span class="tool-unit">Identical (=)</span>';
      explanation = 'Both nodes have identical causal timestamps.';
    } else if (relation === 'BEFORE') {
      badge = `<span style="color: var(--accent); font-weight:700;">${p.a} &rarr; ${p.b} (Precedes)</span>`;
      explanation = `Every component of ${p.a} &le; ${p.b}. Node ${p.b} causally dominates ${p.a}.`;
    } else if (relation === 'AFTER') {
      badge = `<span style="color: var(--signal); font-weight:700;">${p.b} &rarr; ${p.a} (Precedes)</span>`;
      explanation = `Every component of ${p.b} &le; ${p.a}. Node ${p.a} causally dominates ${p.b}.`;
    } else {
      badge = '<span style="color: var(--danger); font-weight:800;">⚡ CONCURRENT (Conflict)</span>';
      explanation = `Neither clock dominates. Independent concurrent updates require conflict resolution (e.g. merge/LWW).`;
    }

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${p.a} vs ${p.b}</strong></td>
      <td><code>${formatClock(v1)}</code></td>
      <td><code>${formatClock(v2)}</code></td>
      <td>${badge}</td>
      <td class="tool-note">${explanation}</td>
    `;
    table.appendChild(tr);
  }
}

/* ------------------------------------------------------------------------------------------------ Actions */

function addLocalEvent(actorId) {
  clocks[actorId] = tick(clocks[actorId], actorId);
  events.push({
    id: events.length + 1,
    actor: actorId,
    type: 'local',
    clock: cloneClock(clocks[actorId]),
    x: nextX,
    label: 'Local Event'
  });
  nextX += 80;
  renderTimeline();
}

function sendMessage(fromActor, toActor) {
  clocks[fromActor] = tick(clocks[fromActor], fromActor);
  const sendX = nextX;
  events.push({
    id: events.length + 1,
    actor: fromActor,
    type: 'send',
    clock: cloneClock(clocks[fromActor]),
    x: sendX,
    label: `Send &rarr; ${toActor}`
  });

  const recvX = sendX + 90;
  clocks[toActor] = receive(clocks[toActor], toActor, clocks[fromActor]);
  events.push({
    id: events.length + 2,
    actor: toActor,
    type: 'receive',
    clock: cloneClock(clocks[toActor]),
    x: recvX,
    label: `Recv &larr; ${fromActor}`
  });

  messages.push({
    from: fromActor,
    to: toActor,
    fromX: sendX,
    toX: recvX,
    label: `msg`
  });

  nextX = recvX + 80;
  renderTimeline();
}

function resetTimeline() {
  clocks = { A: createClock(), B: createClock(), C: createClock() };
  events = [
    { id: 1, actor: 'A', type: 'init', clock: createClock(), x: 40, label: 'Start' },
    { id: 2, actor: 'B', type: 'init', clock: createClock(), x: 40, label: 'Start' },
    { id: 3, actor: 'C', type: 'init', clock: createClock(), x: 40, label: 'Start' }
  ];
  messages = [];
  nextX = 120;
  renderTimeline();
}

function runScenario(type) {
  resetTimeline();
  if (type === 'sequential') {
    sendMessage('A', 'B');
    sendMessage('B', 'C');
  } else if (type === 'concurrent') {
    addLocalEvent('A');
    addLocalEvent('C');
  } else if (type === 'merge') {
    addLocalEvent('A');
    addLocalEvent('C');
    sendMessage('A', 'B');
    sendMessage('C', 'B');
  }
}

/* ------------------------------------------------------------------------------------------------ Init */

function init() {
  $('vc-btn-event-a')?.addEventListener('click', () => addLocalEvent('A'));
  $('vc-btn-event-b')?.addEventListener('click', () => addLocalEvent('B'));
  $('vc-btn-event-c')?.addEventListener('click', () => addLocalEvent('C'));

  $('vc-btn-send-ab')?.addEventListener('click', () => sendMessage('A', 'B'));
  $('vc-btn-send-bc')?.addEventListener('click', () => sendMessage('B', 'C'));
  $('vc-btn-send-ca')?.addEventListener('click', () => sendMessage('C', 'A'));

  $('vc-btn-reset')?.addEventListener('click', resetTimeline);

  const scenarioPills = $('vc-scenarios');
  if (scenarioPills) {
    const list = [
      { id: 'sequential', name: 'Sequential Causality' },
      { id: 'concurrent', name: 'Concurrent Divergence' },
      { id: 'merge', name: 'Multi-Way Merge' }
    ];
    scenarioPills.replaceChildren();
    list.forEach((sc, i) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `tool-pill ${i === 0 ? 'is-active' : ''}`;
      btn.textContent = sc.name;
      btn.addEventListener('click', () => {
        scenarioPills.querySelectorAll('.tool-pill').forEach((p) => p.classList.remove('is-active'));
        btn.classList.add('is-active');
        runScenario(sc.id);
      });
      scenarioPills.appendChild(btn);
    });
  }

  runScenario('sequential');
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
