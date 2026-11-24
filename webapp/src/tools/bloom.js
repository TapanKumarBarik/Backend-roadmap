// The Bloom Filter Lab (webapp/tools/bloom-filter/index.html):
// interactive 64-bit array visualization, live membership testing, and asymptotic dimensioning calculator.
// Plain DOM, zero external dependencies.

import './shell.js';
import { BLOOMLAB } from '../config/bloomlab.js';
import { createFilter, insert, query, getFilterStats, calculateOptimal } from '../lib/netlab/bloom.js';

const { model, sampleKeys, presets, advice } = BLOOMLAB;

const $ = (id) => document.getElementById(id);
const make = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

// State: interactive filter and calculator inputs
let filter = createFilter(model.visualBitSize, model.defaultHashes);
let activeHighlight = new Set();
const calcState = { n: model.defaultN, p: model.defaultP };

/* ------------------------------------------------------------------------------------------------ Bit Array Render */

function renderBitGrid() {
  const grid = $('bf-grid');
  grid.replaceChildren();

  for (let i = 0; i < filter.m; i++) {
    const isSet = filter.bits[i] === 1;
    const isHighlighted = activeHighlight.has(i);

    let cls = 'bf-bit';
    if (isSet) cls += ' is-set';
    if (isHighlighted) cls += ' is-active is-flash';

    const cell = make('div', cls);
    cell.title = `Bit #${i}: ${isSet ? 1 : 0}`;

    const num = make('span', 'bf-bit-idx', String(i));
    const val = make('strong', 'bf-bit-val', String(filter.bits[i]));

    cell.append(num, val);
    grid.append(cell);
  }
}

function renderStats() {
  const stats = getFilterStats(filter);
  $('bf-count').textContent = String(stats.itemsCount);
  $('bf-set-count').textContent = `${stats.bitsSet} / ${filter.m}`;
  $('bf-fill').textContent = `${stats.fillPct}%`;
  $('bf-fp').textContent = `${stats.fpPct}%`;

  const warning = $('bf-warning');
  if (stats.fillPct >= 75) {
    warning.hidden = false;
    warning.textContent = advice.saturationWarning(stats.fillPct);
  } else {
    warning.hidden = true;
  }
}

/* ------------------------------------------------------------------------------------------------ Key Actions */

$('bf-insert-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const input = $('bf-key-input');
  const key = input.value.trim();
  if (key) {
    const indices = insert(filter, key);
    activeHighlight = new Set(indices);
    input.value = '';
    renderBitGrid();
    renderStats();

    const resultBox = $('bf-query-result');
    resultBox.className = 'bf-result-box is-hit';
    resultBox.textContent = `Inserted "${key}" -> Bits set: [${indices.join(', ')}]`;
    resultBox.hidden = false;
  }
});

$('bf-query-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const input = $('bf-query-input');
  const key = input.value.trim();
  if (key) {
    const res = query(filter, key);
    activeHighlight = new Set(res.indices);
    renderBitGrid();

    const resultBox = $('bf-query-result');
    resultBox.hidden = false;
    if (res.probablyPresent) {
      resultBox.className = 'bf-result-box is-hit';
      const stats = getFilterStats(filter);
      resultBox.textContent = advice.probablyIn(key, stats.fpPct);
    } else {
      resultBox.className = 'bf-result-box is-miss';
      resultBox.textContent = `${advice.definitelyNot(key)} (Unset bits: [${res.missingIndices.join(', ')}])`;
    }
  }
});

$('bf-clear').addEventListener('click', () => {
  filter = createFilter(model.visualBitSize, model.defaultHashes);
  activeHighlight.clear();
  $('bf-query-result').hidden = true;
  renderBitGrid();
  renderStats();
});

// Sample key quick-insert buttons
const sampleContainer = $('bf-samples');
sampleKeys.forEach((k) => {
  const btn = make('button', 'tool-btn', k);
  btn.type = 'button';
  btn.addEventListener('click', () => {
    insert(filter, k);
    renderBitGrid();
    renderStats();
  });
  sampleContainer.append(btn);
});

/* ------------------------------------------------------------------------------------------------ Math Calculator */

const nSlider = $('bf-calc-n');
const pSlider = $('bf-calc-p');

function updateCalculator() {
  const calc = calculateOptimal(calcState.n, calcState.p);

  $('bf-calc-n-out').textContent = Number(calcState.n).toLocaleString('en-US');
  $('bf-calc-p-out').textContent = `${(calcState.p * 100).toFixed(1)}%`;

  $('bf-out-m').textContent = `${calc.optimalM.toLocaleString('en-US')} bits`;
  $('bf-out-k').textContent = `k = ${calc.optimalK} hashes`;
  $('bf-out-bits-item').textContent = `${calc.bitsPerItem} bits/key`;
  $('bf-out-mem').textContent = calc.totalMb >= 1 ? `${calc.totalMb} MB` : `${calc.totalKb} KB`;

  const tip = $('bf-calc-tip');
  tip.textContent = advice.optimalDimensionTip(calc.totalKb, calc.bitsPerItem, calc.optimalK);
}

nSlider.addEventListener('input', () => {
  calcState.n = Number(nSlider.value);
  updateCalculator();
});

pSlider.addEventListener('input', () => {
  calcState.p = Number(pSlider.value) / 1000;
  updateCalculator();
});

// Calculator presets
const presetContainer = $('bf-presets');
presets.forEach((preset) => {
  const btn = make('button', 'tool-btn', preset.label);
  btn.type = 'button';
  btn.title = preset.desc;
  btn.addEventListener('click', () => {
    calcState.n = preset.n;
    calcState.p = preset.p;
    nSlider.value = String(preset.n);
    pSlider.value = String(Math.round(preset.p * 1000));
    updateCalculator();
  });
  presetContainer.append(btn);
});

// Initialize
renderBitGrid();
renderStats();
updateCalculator();
