// The page load lab (webapp/tools/page-load-latency/index.html): the controls, the bar, the sequence diagram and the table, drawn from the plan that lib/netlab/pageload.js
// makes. Plain DOM, no React, so the page is small and quick. The page's explanation is already in the HTML; this adds the behaviour. Nothing leaves the browser.
import './shell.js';
import { LOADLAB } from '../config/loadlab.js';
import { plan, compare, advice, normalize, toQuery, fromQuery } from '../lib/netlab/pageload.js';

const { inputs, ui } = LOADLAB;
const $ = (id) => document.getElementById(id);
const make = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};
const SVG = 'http://www.w3.org/2000/svg';
const draw = (tag, attributes = {}, text) => {
  const node = document.createElementNS(SVG, tag);
  for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, String(value));
  if (text !== undefined) node.textContent = text;
  return node;
};

// The words of a message: a plain sentence, or a function of its numbers.
const say = (key, args = []) => {
  const text = LOADLAB.messages[key];
  return typeof text === 'function' ? text(...args) : text;
};

// The numbers the controls hold. A slider either moves through a range, or through the stops of a list (page size and speed span orders of magnitude).
const SLIDERS = [
  { key: 'rttMs', id: 'll-rtt', show: ui.ms },
  { key: 'serverMs', id: 'll-server', show: ui.ms },
  { key: 'sizeKb', id: 'll-size', show: ui.size, steps: inputs.sizeKb.steps },
  { key: 'bandwidthMbps', id: 'll-bw', show: ui.speed, steps: inputs.bandwidthMbps.steps },
  { key: 'resolverRttMs', id: 'll-dnsrtt', show: ui.ms },
  { key: 'upstreamRttMs', id: 'll-up', show: ui.ms }
];
const CHOICES = [
  { key: 'stack', id: 'll-stack', options: LOADLAB.stacks },
  { key: 'connection', id: 'll-conn', options: LOADLAB.connections },
  { key: 'dns', id: 'll-dns', options: LOADLAB.dns }
];
const nearest = (steps, value) => steps.reduce((best, step, i) => (Math.abs(step - value) < Math.abs(steps[best] - value) ? i : best), 0);

let state = fromQuery(location.search);

/* ------------------------------------------------------------------------------------------------ the controls */

for (const slider of SLIDERS) {
  const input = $(slider.id);
  const spec = inputs[slider.key];
  input.min = slider.steps ? '0' : String(spec.min);
  input.max = slider.steps ? String(slider.steps.length - 1) : String(spec.max);
  input.step = '1';
  input.addEventListener('input', () => {
    state = normalize({ ...state, [slider.key]: slider.steps ? slider.steps[Number(input.value)] : Number(input.value) });
    update();
  });
}
for (const choice of CHOICES) {
  const select = $(choice.id);
  for (const option of choice.options) select.append(new Option(option.label, option.id));
  select.addEventListener('change', () => { state = normalize({ ...state, [choice.key]: select.value }); update(); });
}
$('ll-presets-label').textContent = ui.presetsLabel;
$('ll-more-label').textContent = ui.moreInputs;
$('ll-first-label').textContent = ui.firstByte;
$('ll-loaded-label').textContent = ui.loaded;
$('ll-trips-label').textContent = ui.trips;
$('ll-working-label').textContent = ui.stepsHeading;
$('ll-messages-label').textContent = ui.messagesHeading;
$('ll-compare-h').textContent = ui.compareHeading;
$('ll-copy').textContent = ui.copyLink;
$('ll-scroll').textContent = ui.scrollHint;

const presetButtons = LOADLAB.presets.map((preset) => {
  const button = make('button', 'tool-btn', preset.label);
  button.type = 'button';
  button.addEventListener('click', () => {
    state = normalize({ ...state, rttMs: preset.rttMs, resolverRttMs: preset.resolverRttMs, bandwidthMbps: preset.bandwidthMbps });
    update();
  });
  $('ll-presets').append(button);
  return { preset, button };
});

function syncControls() {
  for (const slider of SLIDERS) {
    const input = $(slider.id);
    input.value = String(slider.steps ? nearest(slider.steps, state[slider.key]) : state[slider.key]);
    $(`${slider.id}-out`).textContent = slider.show(state[slider.key]);
  }
  for (const choice of CHOICES) $(choice.id).value = state[choice.key];
  for (const { preset, button } of presetButtons) {
    button.setAttribute('aria-pressed', String(state.rttMs === preset.rttMs && state.resolverRttMs === preset.resolverRttMs && state.bandwidthMbps === preset.bandwidthMbps));
  }
}

/* ------------------------------------------------------------------------------------------------ the results */

function renderSummary(p) {
  $('ll-first').textContent = ui.ms(p.firstByteMs);
  $('ll-loaded').textContent = ui.ms(p.loadedMs);
  $('ll-trips').textContent = String(p.tripsToFirstByte);
}

// The bar is to scale; the longest stretch is in the accent and the others are neutral, and every stretch is named in the list under it.
function renderBar(p) {
  const longest = p.phases.reduce((best, phase) => (phase.ms > best.ms ? phase : best), p.phases[0]);
  const bar = $('ll-bar');
  bar.replaceChildren();
  bar.setAttribute('role', 'img');
  bar.setAttribute('aria-label', p.phases.filter((phase) => phase.ms > 0).map((phase) => `${LOADLAB.phases[phase.id]} ${ui.ms(phase.ms)}`).join(', '));
  for (const phase of p.phases) {
    if (phase.ms <= 0) continue;
    const part = make('span', phase.id === longest.id ? 'll-bar__part is-longest' : 'll-bar__part');
    part.style.flexGrow = String(phase.ms);
    bar.append(part);
  }
  const legend = $('ll-legend');
  legend.replaceChildren();
  for (const phase of p.phases) {
    const item = make('li', phase.ms > 0 ? (phase.id === longest.id ? 'is-longest' : '') : 'is-none');
    item.append(make('span', 'll-legend__name', LOADLAB.phases[phase.id]), make('strong', null, ui.ms(phase.ms)));
    if (phase.id === 'transfer' && p.limit === 'link' && phase.ms > 0) item.append(make('small', null, ui.linkLimited));
    else if (phase.trips > 0) item.append(make('small', null, ui.tripCount(phase.trips)));
    legend.append(item);
  }
}

function renderAdvice(o) {
  const list = $('ll-advice');
  list.replaceChildren();
  const words = LOADLAB.advice;
  for (const tip of advice(o)) {
    let line = '';
    if (tip.key === 'travel') line = words.travel(tip.trips, tip.rttMs, tip.ms);
    else if (tip.key === 'betterStack') line = words.betterStack(tip.from, tip.to, tip.savedMs);
    else if (tip.key === 'reuse') line = words.reuse(tip.savedMs);
    else if (tip.key === 'slowStart') line = words.slowStart(tip.rounds, tip.ms, tip.windowKb);
    else if (tip.key === 'fits') line = words.fits(tip.windowKb);
    else if (tip.key === 'bandwidth') line = words.bandwidth(tip.ms);
    if (line) list.append(make('li', null, line));
  }
}

function renderSteps(p) {
  const o = p.input;
  const lookup = LOADLAB.dns.find((d) => d.id === o.dns);
  const [dns, connect, secure, request, transfer] = p.phases;
  const words = LOADLAB.steps;
  const open = o.connection === 'open';
  const list = $('ll-steps');
  list.replaceChildren();
  const lines = [
    words.dns(open ? 0 : lookup.resolverTrips, o.resolverRttMs, open ? 0 : lookup.upstreamTrips, o.upstreamRttMs, dns.ms),
    words.connect(connect.trips, o.rttMs, connect.ms),
    words.secure(secure.trips, o.rttMs, secure.ms),
    words.request(o.rttMs, o.serverMs, request.ms),
    words.firstByte(p.firstByteMs),
    words.transfer(p.extraRounds, o.rttMs, p.serializationMs, transfer.ms),
    words.loaded(p.loadedMs)
  ];
  for (const line of lines) list.append(make('li', null, line));
}

// The messages as a list, for anyone who reads the diagram with a screen reader and anyone who wants to copy it.
function renderList(p) {
  const list = $('ll-list');
  list.replaceChildren();
  for (const event of p.events) {
    const who = event.kind === 'message' ? `${LOADLAB.lanes[event.from]} to ${LOADLAB.lanes[event.to]}` : LOADLAB.lanes[event.on];
    const words = event.kind === 'message' ? say(event.key) : say(event.key, event.args);
    list.append(make('li', null, `${ui.at(event.at)}, ${who}: ${words}, arrives ${ui.at(event.arrive)}`));
  }
}

/* ------------------------------------------------------------------------------------------------ the diagram */

// The sequence diagram: the browser, perhaps the resolver, and the server, with one row for each message or wait, in the order they happen. The rows are evenly spaced so that
// every label can be read; the times are in the labels and in the bar above, which is to scale.
const SIZE = { width: 760, row: 42, top: 52, bottom: 20, lanes: { browser: 150, resolver: 400, server: 650 }, tagX: 10, bracketX: 74 };

function renderDiagram(p) {
  const holder = $('ll-diagram');
  holder.replaceChildren();
  const rows = p.events.length;
  const height = SIZE.top + rows * SIZE.row + SIZE.bottom;
  const svg = draw('svg', { viewBox: `0 0 ${SIZE.width} ${height}`, role: 'img', 'aria-label': ui.diagramLabel(p.events.filter((e) => e.kind === 'message').length, Math.round(p.firstByteMs)), class: 'll-svg' });

  const defs = draw('defs');
  const marker = draw('marker', { id: 'll-head', viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 7, markerHeight: 7, orient: 'auto-start-reverse' });
  marker.append(draw('path', { d: 'M 0 0 L 10 5 L 0 10 z', class: 'll-head' }));
  defs.append(marker);
  svg.append(defs);

  const usesResolver = p.events.some((e) => e.from === 'resolver' || e.to === 'resolver' || e.on === 'resolver');
  const lanes = usesResolver ? ['browser', 'resolver', 'server'] : ['browser', 'server'];
  for (const lane of lanes) {
    const x = SIZE.lanes[lane];
    svg.append(draw('text', { x, y: 20, class: 'll-lane-name', 'text-anchor': 'middle' }, LOADLAB.lanes[lane]));
    svg.append(draw('line', { x1: x, y1: 30, x2: x, y2: height - 8, class: 'll-lane' }));
  }

  // A bracket and a tag for each phase, down the left.
  let start = 0;
  while (start < rows) {
    let end = start;
    while (end + 1 < rows && p.events[end + 1].phase === p.events[start].phase) end += 1;
    const phase = p.events[start].phase;
    const quic = phase === 'connect' && p.input.stack === 'quic';
    const tag = LOADLAB.phaseTags[quic ? 'connectQuic' : phase];
    const y1 = SIZE.top + start * SIZE.row + 4;
    const y2 = SIZE.top + (end + 1) * SIZE.row - 4;
    svg.append(draw('line', { x1: SIZE.bracketX, y1, x2: SIZE.bracketX, y2, class: 'll-bracket' }));
    svg.append(draw('text', { x: SIZE.tagX, y: (y1 + y2) / 2 + 4, class: 'll-tag' }, tag));
    start = end + 1;
  }

  p.events.forEach((event, i) => {
    const y0 = SIZE.top + i * SIZE.row;
    if (event.kind === 'message') {
      const x1 = SIZE.lanes[event.from];
      const x2 = SIZE.lanes[event.to];
      const y1 = y0 + 10;
      const y2 = y0 + SIZE.row - 12;
      const first = event.key === 'firstBytes';
      svg.append(draw('line', { x1, y1, x2, y2, class: first ? 'll-msg ll-msg--first' : 'll-msg', 'marker-end': 'url(#ll-head)' }));
      svg.append(draw('text', { x: (x1 + x2) / 2, y: (y1 + y2) / 2 - 9, class: 'll-label', 'text-anchor': 'middle' }, say(event.key)));
      const toLeft = x2 < x1;
      svg.append(draw('text', { x: x2 + (toLeft ? -12 : 12), y: y2 + 4, class: first ? 'll-time ll-time--first' : 'll-time', 'text-anchor': toLeft ? 'end' : 'start' }, ui.at(event.arrive)));
    } else {
      const x = SIZE.lanes[event.on];
      svg.append(draw('rect', { x: x - 7, y: y0 + 5, width: 14, height: SIZE.row - 10, rx: 3, class: 'll-wait' }));
      const onServer = event.on === 'server';
      svg.append(draw('text', { x: x + (onServer ? -16 : 16), y: y0 + SIZE.row / 2 + 4, class: 'll-label', 'text-anchor': onServer ? 'end' : 'start' }, say(event.key, event.args)));
      svg.append(draw('text', { x: x + (onServer ? 16 : -16), y: y0 + SIZE.row / 2 + 4, class: 'll-time', 'text-anchor': onServer ? 'start' : 'end' }, ui.waitDuration(event.arrive - event.at)));
    }
  });

  holder.append(svg);
}

/* ------------------------------------------------------------------------------------------------ the comparison */

function renderCompare(o) {
  const table = $('ll-compare');
  table.replaceChildren();
  const rows = compare(o);
  const fastest = Math.min(...rows.map((r) => r.firstByteMs));
  table.append(make('caption', 'tool-sr', ui.compareCaption));
  const head = make('tr');
  for (const name of ['stack', 'trips', 'firstByte', 'loaded']) {
    const cell = make('th', name === 'stack' ? null : 'is-number', ui.compareHeaders[name]);
    cell.scope = 'col';
    head.append(cell);
  }
  const thead = make('thead');
  thead.append(head);
  table.append(thead);
  const body = make('tbody');
  for (const row of rows) {
    const tr = make('tr', row.id === o.stack ? 'is-current' : '');
    if (row.id === o.stack) tr.setAttribute('aria-current', 'true');
    const name = make('th', null, row.label);
    name.scope = 'row';
    tr.append(name, make('td', 'is-number', String(row.trips)), make('td', row.firstByteMs === fastest ? 'is-number is-best' : 'is-number', ui.ms(row.firstByteMs)), make('td', 'is-number', ui.ms(row.loadedMs)));
    body.append(tr);
  }
  table.append(body);
}

/* ------------------------------------------------------------------------------------------------ the whole page */

function update() {
  syncControls();
  const p = plan(state);
  renderSummary(p);
  renderBar(p);
  renderAdvice(state);
  renderDiagram(p);
  renderSteps(p);
  renderList(p);
  renderCompare(state);
  const query = toQuery(state);
  history.replaceState(null, '', query ? `?${query}` : location.pathname);
}

$('ll-form').addEventListener('submit', (event) => event.preventDefault());
$('ll-copy').addEventListener('click', async () => {
  const note = $('ll-copy-note');
  try { await navigator.clipboard.writeText(location.href); note.textContent = ui.copied; } catch { note.textContent = ui.copyFailed; }
});

update();
