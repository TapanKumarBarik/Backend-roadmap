// The Rate Limiting Lab (webapp/tools/rate-limiting/index.html):
// interactive controls, dual time series chart, live throttling statistics, and breakdown table.
// Plain DOM & SVG, zero external dependencies.

import './shell.js';
import { RATELIMITLAB } from '../config/ratelimitlab.js';
import { simulate, normalize, toQuery, fromQuery } from '../lib/netlab/ratelimit.js';

const { inputs, algorithms, trafficProfiles, ui } = RATELIMITLAB;

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

/* ------------------------------------------------------------------------------------------------ Controls */

const algoSelect = $('rl-algo');
for (const algo of algorithms) {
  algoSelect.append(new Option(algo.label, algo.id));
}
algoSelect.addEventListener('change', () => {
  state = normalize({ ...state, algorithm: algoSelect.value });
  update();
});

const profileSelect = $('rl-profile');
for (const prof of trafficProfiles) {
  profileSelect.append(new Option(prof.label, prof.id));
}
profileSelect.addEventListener('change', () => {
  state = normalize({ ...state, profile: profileSelect.value });
  update();
});

const SLIDERS = [
  { key: 'rate', id: 'rl-rate', show: ui.rateUnit },
  { key: 'burst', id: 'rl-burst', show: ui.burstUnit }
];

for (const slider of SLIDERS) {
  const input = $(slider.id);
  const spec = inputs[slider.key];
  input.min = String(spec.min);
  input.max = String(spec.max);
  input.step = String(spec.step || 1);
  input.addEventListener('input', () => {
    state = normalize({ ...state, [slider.key]: Number(input.value) });
    update();
  });
}

function syncControls() {
  algoSelect.value = state.algorithm;
  profileSelect.value = state.profile;
  for (const slider of SLIDERS) {
    const input = $(slider.id);
    input.value = String(state[slider.key]);
    $(`${slider.id}-out`).textContent = slider.show(state[slider.key]);
  }
}

/* ------------------------------------------------------------------------------------------------ Stats Cards */

function renderSummary(res) {
  const { summary } = res;
  $('rl-total').textContent = summary.totalIncoming.toLocaleString('en-US');
  $('rl-accepted').textContent = summary.totalAccepted.toLocaleString('en-US');
  $('rl-rejected').textContent = summary.totalRejected.toLocaleString('en-US');
  $('rl-pct').textContent = `${summary.acceptancePct}%`;
  $('rl-buffer').textContent = `${summary.peakState} / ${res.config.burst}`;
}

function renderAdvice(res) {
  const list = $('rl-advice');
  list.replaceChildren();
  for (const tip of res.advice) {
    list.append(make('li', null, tip));
  }
}

/* ------------------------------------------------------------------------------------------------ SVG Chart */

const CHART = {
  width: 760,
  height: 280,
  pad: { top: 30, right: 30, bottom: 40, left: 50 }
};

function renderChart(res) {
  const holder = $('rl-chart');
  holder.replaceChildren();

  const { timeline } = res;
  const { width, height, pad } = CHART;
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;

  const maxVal = Math.max(16, ...timeline.map((d) => Math.max(d.incoming, d.accepted + d.rejected, d.stateVal)));
  const maxY = Math.ceil(maxVal / 4) * 4;

  const xScale = (t) => pad.left + ((t - 1) / (timeline.length - 1)) * plotW;
  const yScale = (v) => pad.top + plotH - (Math.max(0, v) / maxY) * plotH;

  const svg = draw('svg', {
    viewBox: `0 0 ${width} ${height}`,
    role: 'img',
    'aria-label': ui.chart.ariaLabel,
    class: 'rl-svg'
  });

  // Background Grid Lines
  for (let i = 0; i <= 4; i++) {
    const val = Math.round((maxY / 4) * i);
    const y = yScale(val);
    svg.append(draw('line', { x1: pad.left, y1: y, x2: width - pad.right, y2: y, class: 'chart-grid' }));
    svg.append(draw('text', { x: pad.left - 10, y: y + 4, class: 'chart-tick', 'text-anchor': 'end' }, String(val)));
  }

  // Sustained Rate Threshold Line
  const yRate = yScale(res.config.rate);
  svg.append(draw('line', { x1: pad.left, y1: yRate, x2: width - pad.right, y2: yRate, class: 'rl-line-rate' }));
  svg.append(draw('text', { x: width - pad.right, y: yRate - 6, class: 'rl-label-rate', 'text-anchor': 'end' }, `Rate Limit (${res.config.rate} req/s)`));

  // Time Ticks
  for (let t = 1; t <= timeline.length; t += 2) {
    const x = xScale(t);
    svg.append(draw('line', { x1: x, y1: pad.top, x2: x, y2: height - pad.bottom, class: 'chart-grid' }));
    svg.append(draw('text', { x, y: height - pad.bottom + 20, class: 'chart-tick', 'text-anchor': 'middle' }, `${t}s`));
  }

  // Draw Bars: Accepted (Green) and Rejected (Red)
  const barWidth = Math.max(6, Math.floor(plotW / timeline.length) - 8);
  timeline.forEach((d) => {
    const x = xScale(d.time) - barWidth / 2;

    const accH = (d.accepted / maxY) * plotH;
    const rejH = (d.rejected / maxY) * plotH;

    // Accepted bar
    if (accH > 0) {
      svg.append(draw('rect', {
        x,
        y: pad.top + plotH - accH,
        width: barWidth,
        height: accH,
        class: 'rl-bar-accepted'
      }));
    }

    // Rejected bar (stacked on top of accepted)
    if (rejH > 0) {
      svg.append(draw('rect', {
        x,
        y: pad.top + plotH - accH - rejH,
        width: barWidth,
        height: rejH,
        class: 'rl-bar-rejected'
      }));
    }
  });

  // State Path (Tokens remaining or Queue depth)
  let statePath = `M ${xScale(1)} ${yScale(timeline[0].stateVal)}`;
  for (let i = 1; i < timeline.length; i++) {
    statePath += ` L ${xScale(timeline[i].time)} ${yScale(timeline[i].stateVal)}`;
  }
  svg.append(draw('path', { d: statePath, class: 'rl-path-state' }));

  timeline.forEach((d) => {
    svg.append(draw('circle', {
      cx: xScale(d.time),
      cy: yScale(d.stateVal),
      r: 3,
      class: 'rl-dot-state'
    }));
  });

  holder.append(svg);
}

/* ------------------------------------------------------------------------------------------------ Table */

function renderTable(res) {
  const tbody = $('rl-table-body');
  tbody.replaceChildren();

  res.timeline.forEach((d) => {
    const tr = make('tr');
    if (d.rejected > 0) tr.className = 'rl-row-throttled';

    tr.append(
      make('td', 'is-number', `${d.time}s`),
      make('td', 'is-number', String(d.incoming)),
      make('td', 'is-number', String(d.accepted)),
      make('td', 'is-number', String(d.rejected)),
      make('td', 'is-number', String(d.stateVal))
    );
    tbody.append(tr);
  });
}

/* ------------------------------------------------------------------------------------------------ Main Loop */

function update() {
  syncControls();
  const res = simulate(state);
  renderSummary(res);
  renderChart(res);
  renderAdvice(res);
  renderTable(res);

  const query = toQuery(state);
  history.replaceState(null, '', query ? `?${query}` : location.pathname);
}

$('rl-copy').addEventListener('click', async () => {
  const note = $('rl-copy-note');
  try {
    await navigator.clipboard.writeText(location.href);
    note.textContent = 'Link copied to clipboard.';
  } catch {
    note.textContent = 'Could not copy link.';
  }
});

update();
