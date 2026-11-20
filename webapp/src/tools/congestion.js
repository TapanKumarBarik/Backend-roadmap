// The TCP Congestion and Flow Control Lab (webapp/tools/tcp-congestion/index.html):
// interactive controls, dynamic SVG sawtooth chart, queue occupancy visualizer, and step-by-step
// breakdown table. Built with plain DOM and SVG for minimal footprint and zero external dependencies.

import './shell.js';
import { CONGESTIONLAB } from '../config/congestionlab.js';
import { simulate, normalize, toQuery, fromQuery } from '../lib/netlab/congestion.js';

const { inputs, algorithms, presets, ui } = CONGESTIONLAB;

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

// State initialized from URL query string if present
let state = fromQuery(location.search);

/* ------------------------------------------------------------------------------------------------ Controls */

const SLIDERS = [
  { key: 'bdp', id: 'tc-bdp', show: ui.segmentsUnit },
  { key: 'buffer', id: 'tc-buffer', show: ui.segmentsUnit },
  { key: 'rwnd', id: 'tc-rwnd', show: ui.segmentsUnit },
  { key: 'lossPct', id: 'tc-loss', show: ui.pctUnit },
  { key: 'rounds', id: 'tc-rounds', show: ui.roundsUnit }
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

const algoSelect = $('tc-algo');
for (const algo of algorithms) {
  algoSelect.append(new Option(algo.label, algo.id));
}
algoSelect.addEventListener('change', () => {
  state = normalize({ ...state, algorithm: algoSelect.value });
  update();
});

const presetContainer = $('tc-presets');
const presetButtons = presets.map((preset) => {
  const btn = make('button', 'tool-btn', preset.label);
  btn.type = 'button';
  btn.title = preset.desc;
  btn.addEventListener('click', () => {
    state = normalize({
      ...state,
      bdp: preset.bdp,
      buffer: preset.buffer,
      rwnd: preset.rwnd,
      lossPct: preset.lossPct,
      algorithm: preset.algorithm
    });
    update();
  });
  presetContainer.append(btn);
  return { preset, btn };
});

function syncControls() {
  for (const slider of SLIDERS) {
    const input = $(slider.id);
    input.value = String(state[slider.key]);
    $(`${slider.id}-out`).textContent = slider.show(state[slider.key]);
  }
  algoSelect.value = state.algorithm;

  for (const { preset, btn } of presetButtons) {
    const isCurrent =
      state.bdp === preset.bdp &&
      state.buffer === preset.buffer &&
      state.rwnd === preset.rwnd &&
      state.lossPct === preset.lossPct &&
      state.algorithm === preset.algorithm;
    btn.setAttribute('aria-pressed', String(isCurrent));
  }
}

/* ------------------------------------------------------------------------------------------------ Summary Cards */

function renderSummary(res) {
  const { summary, config } = res;
  $('tc-delivered').textContent = summary.totalDelivered.toLocaleString('en-US');
  $('tc-dropped').textContent = summary.totalDropped.toLocaleString('en-US');
  $('tc-util').textContent = `${summary.avgUtilization}%`;
  $('tc-events').textContent = String(summary.lossEventsCount);
  $('tc-queue-stat').textContent = `${summary.maxQueue} / ${config.buffer}`;
}

/* ------------------------------------------------------------------------------------------------ Diagnostic Advice */

function renderAdvice(res) {
  const list = $('tc-advice');
  list.replaceChildren();
  for (const tip of res.advice) {
    list.append(make('li', null, tip));
  }
}

/* ------------------------------------------------------------------------------------------------ SVG Sawtooth Chart */

const CHART = {
  width: 780,
  height: 380,
  pad: { top: 35, right: 35, bottom: 45, left: 55 }
};

function renderChart(res) {
  const holder = $('tc-chart');
  holder.replaceChildren();

  const { rounds, config } = res;
  const { width, height, pad } = CHART;
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;

  const maxRounds = config.rounds;
  const maxCapacity = config.bdp + config.buffer;
  const highestVal = Math.max(
    maxCapacity,
    config.rwnd,
    ...rounds.map((r) => Math.max(r.cwnd, r.ssthresh, r.inFlight))
  );
  const maxY = Math.ceil((highestVal + 4) / 5) * 5;

  const xScale = (rtt) => pad.left + ((rtt - 1) / (maxRounds - 1)) * plotW;
  const yScale = (val) => pad.top + plotH - (Math.max(0, val) / maxY) * plotH;

  const svg = draw('svg', {
    viewBox: `0 0 ${width} ${height}`,
    role: 'img',
    'aria-label': ui.chart.ariaLabel,
    class: 'tc-svg'
  });

  // Background Grid and Y-Axis Ticks
  const ySteps = 5;
  for (let i = 0; i <= ySteps; i++) {
    const val = Math.round((maxY / ySteps) * i);
    const y = yScale(val);
    svg.append(draw('line', { x1: pad.left, y1: y, x2: width - pad.right, y2: y, class: 'chart-grid' }));
    svg.append(draw('text', { x: pad.left - 10, y: y + 4, class: 'chart-tick', 'text-anchor': 'end' }, String(val)));
  }

  // X-Axis Ticks
  const xStepSize = maxRounds > 30 ? 5 : 2;
  for (let r = 1; r <= maxRounds; r += xStepSize) {
    const x = xScale(r);
    svg.append(draw('line', { x1: x, y1: pad.top, x2: x, y2: height - pad.bottom, class: 'chart-grid' }));
    svg.append(draw('text', { x, y: height - pad.bottom + 20, class: 'chart-tick', 'text-anchor': 'middle' }, `RTT ${r}`));
  }

  // Capacity Threshold Lines
  const yBdp = yScale(config.bdp);
  const yCap = yScale(maxCapacity);
  const yRwnd = yScale(config.rwnd);

  // Buffer Overflow Ceiling (BDP + Buffer)
  svg.append(draw('line', { x1: pad.left, y1: yCap, x2: width - pad.right, y2: yCap, class: 'tc-line-limit' }));
  svg.append(draw('text', { x: width - pad.right, y: yCap - 6, class: 'tc-label-limit', 'text-anchor': 'end' }, `Tail Drop Ceiling (${maxCapacity})`));

  // Ideal Pipe Capacity (BDP)
  svg.append(draw('line', { x1: pad.left, y1: yBdp, x2: width - pad.right, y2: yBdp, class: 'tc-line-bdp' }));
  svg.append(draw('text', { x: width - pad.right, y: yBdp - 6, class: 'tc-label-bdp', 'text-anchor': 'end' }, `BDP Capacity (${config.bdp})`));

  // Receiver Window (rwnd) if within plot range
  if (config.rwnd <= maxY) {
    svg.append(draw('line', { x1: pad.left, y1: yRwnd, x2: width - pad.right, y2: yRwnd, class: 'tc-line-rwnd' }));
    svg.append(draw('text', { x: pad.left + 10, y: yRwnd - 6, class: 'tc-label-rwnd', 'text-anchor': 'start' }, `rwnd (${config.rwnd})`));
  }

  // ssthresh Step Path
  let ssthreshPath = `M ${xScale(1)} ${yScale(rounds[0].ssthresh)}`;
  for (let i = 1; i < rounds.length; i++) {
    ssthreshPath += ` H ${xScale(rounds[i].rtt)} V ${yScale(rounds[i].ssthresh)}`;
  }
  svg.append(draw('path', { d: ssthreshPath, class: 'tc-path-ssthresh' }));

  // cwnd Sawtooth Curve Path
  let cwndPath = `M ${xScale(rounds[0].rtt)} ${yScale(rounds[0].cwnd)}`;
  for (let i = 1; i < rounds.length; i++) {
    cwndPath += ` L ${xScale(rounds[i].rtt)} ${yScale(rounds[i].cwnd)}`;
  }
  svg.append(draw('path', { d: cwndPath, class: 'tc-path-cwnd' }));

  // Data Points and Loss Markers
  rounds.forEach((pt) => {
    const cx = xScale(pt.rtt);
    const cy = yScale(pt.cwnd);

    if (pt.event === 'buffer-overflow' || pt.event === 'random-loss') {
      // Congestion Loss marker (Red halo + cross)
      svg.append(draw('circle', { cx, cy, r: 8, class: 'tc-loss-halo' }));
      svg.append(draw('circle', { cx, cy, r: 4, class: 'tc-loss-dot' }));
      svg.append(draw('text', { x: cx, y: cy - 12, class: 'tc-loss-text', 'text-anchor': 'middle' }, 'LOSS'));
    } else {
      svg.append(draw('circle', { cx, cy, r: 3, class: 'tc-cwnd-dot' }));
    }
  });

  holder.append(svg);
}

/* ------------------------------------------------------------------------------------------------ Queue Visualizer */

function renderQueueMeter(res) {
  const { summary, config } = res;
  const pct = Math.min(100, Math.round((summary.maxQueue / config.buffer) * 100));
  const fill = $('tc-queue-fill');
  fill.style.width = `${pct}%`;
  fill.className = pct >= 95 ? 'tc-queue-bar is-overflow' : pct >= 50 ? 'tc-queue-bar is-bloated' : 'tc-queue-bar';
  $('tc-queue-desc').textContent = `${summary.maxQueue} of ${config.buffer} segments (${pct}% max queue capacity)`;
}

/* ------------------------------------------------------------------------------------------------ Breakdown Table */

function renderTable(res) {
  const tbody = $('tc-table-body');
  tbody.replaceChildren();

  for (const r of res.rounds) {
    const tr = make('tr');
    if (r.event === 'buffer-overflow' || r.event === 'random-loss') {
      tr.className = 'tc-row-loss';
    }

    const eventDesc =
      r.event === 'buffer-overflow'
        ? `Tail Drop (-${r.dropped})`
        : r.event === 'random-loss'
          ? 'Random Drop'
          : r.event === 'rwnd-limit'
            ? 'Capped by rwnd'
            : 'OK';

    tr.append(
      make('td', 'is-number', String(r.rtt)),
      make('td', null, CONGESTIONLAB.phases[r.phase] || r.phase),
      make('td', 'is-number', String(r.cwnd)),
      make('td', 'is-number', String(r.ssthresh)),
      make('td', 'is-number', String(r.inFlight)),
      make('td', 'is-number', `${r.queue} / ${res.config.buffer}`),
      make('td', 'is-number', `${r.utilization}%`),
      make('td', null, eventDesc)
    );
    tbody.append(tr);
  }
}

/* ------------------------------------------------------------------------------------------------ Main Loop */

function update() {
  syncControls();
  const res = simulate(state);
  renderSummary(res);
  renderChart(res);
  renderQueueMeter(res);
  renderAdvice(res);
  renderTable(res);

  const query = toQuery(state);
  history.replaceState(null, '', query ? `?${query}` : location.pathname);
}

$('tc-form').addEventListener('submit', (e) => e.preventDefault());
$('tc-copy').addEventListener('click', async () => {
  const note = $('tc-copy-note');
  try {
    await navigator.clipboard.writeText(location.href);
    note.textContent = ui.copied;
  } catch {
    note.textContent = ui.copyFailed;
  }
});

update();
