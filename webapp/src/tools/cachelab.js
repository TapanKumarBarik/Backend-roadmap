// Interactive UI controller for Cache Strategies & Stampede Protection Lab (/tools/caching-strategies/).
// Plain DOM, zero external dependencies.

import './shell.js';
import { CACHE_LAB_CONFIG } from '../config/cachelab.js';
import { simulateCacheTraffic } from '../lib/netlab/cachelab.js';

const $ = (id) => document.getElementById(id);
const make = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

let currentStrategy = 'cacheAside';
let currentMitigation = 'none';
let currentScenario = 'stampedeEvent';

function renderSimulation() {
  const sc = CACHE_LAB_CONFIG.scenarios[currentScenario];
  const results = simulateCacheTraffic({
    strategy: currentStrategy,
    mitigation: currentMitigation,
    reqCount: sc.reqCount,
    isHotKeyExpired: sc.isHotKeyExpired
  });

  // Descriptions
  $('cache-strategy-desc').textContent = CACHE_LAB_CONFIG.strategies[currentStrategy].description;
  $('cache-mitigation-desc').textContent = CACHE_LAB_CONFIG.mitigations[currentMitigation].description;

  // Stats
  $('cache-stat-hit-rate').textContent = `${results.hitRatePct}%`;
  $('cache-stat-hits').textContent = `${results.cacheHits.toLocaleString()} hits / ${results.cacheMisses.toLocaleString()} misses`;
  $('cache-stat-db-queries').textContent = results.dbQueries.toLocaleString();
  $('cache-stat-latency').textContent = `${results.avgLatencyMs} ms`;

  // DB Load Meter
  const dbLoadEl = $('cache-stat-db-load');
  if (dbLoadEl) {
    dbLoadEl.textContent = `${results.dbLoadScore}%`;
    dbLoadEl.className = 'cache-load-badge';
    if (results.dbLoadScore > 70) {
      dbLoadEl.classList.add('load-danger');
    } else if (results.dbLoadScore > 30) {
      dbLoadEl.classList.add('load-warning');
    } else {
      dbLoadEl.classList.add('load-safe');
    }
  }

  // Logs
  const consoleEl = $('cache-console');
  if (consoleEl) {
    consoleEl.replaceChildren();
    results.log.forEach((msg) => {
      const line = make('div', 'stream-log-entry', msg);
      if (msg.includes('⚠️')) line.classList.add('is-danger');
      if (msg.includes('✓')) line.classList.add('is-success');
      consoleEl.appendChild(line);
    });
  }
}

function setupControls() {
  // Strategy Pills
  const stratContainer = $('cache-strategy-pills');
  if (stratContainer) {
    stratContainer.replaceChildren();
    Object.entries(CACHE_LAB_CONFIG.strategies).forEach(([key, s]) => {
      const btn = make('button', `tool-btn tool-btn-sm ${key === currentStrategy ? 'is-active' : ''}`, s.name);
      btn.addEventListener('click', () => {
        stratContainer.querySelectorAll('button').forEach((b) => b.classList.remove('is-active'));
        btn.classList.add('is-active');
        currentStrategy = key;
        renderSimulation();
      });
      stratContainer.appendChild(btn);
    });
  }

  // Mitigation Pills
  const mitContainer = $('cache-mitigation-pills');
  if (mitContainer) {
    mitContainer.replaceChildren();
    Object.entries(CACHE_LAB_CONFIG.mitigations).forEach(([key, m]) => {
      const btn = make('button', `tool-btn tool-btn-sm ${key === currentMitigation ? 'is-active' : ''}`, m.name);
      btn.addEventListener('click', () => {
        mitContainer.querySelectorAll('button').forEach((b) => b.classList.remove('is-active'));
        btn.classList.add('is-active');
        currentMitigation = key;
        renderSimulation();
      });
      mitContainer.appendChild(btn);
    });
  }

  // Scenario Selector
  const scenContainer = $('cache-scenario-pills');
  if (scenContainer) {
    scenContainer.replaceChildren();
    Object.entries(CACHE_LAB_CONFIG.scenarios).forEach(([key, sc]) => {
      const btn = make('button', `tool-btn tool-btn-sm ${key === currentScenario ? 'is-active' : ''}`, sc.name);
      btn.addEventListener('click', () => {
        scenContainer.querySelectorAll('button').forEach((b) => b.classList.remove('is-active'));
        btn.classList.add('is-active');
        currentScenario = key;
        renderSimulation();
      });
      scenContainer.appendChild(btn);
    });
  }

  // Fire Batch Button
  const fireBtn = $('cache-btn-fire');
  if (fireBtn) {
    fireBtn.addEventListener('click', () => {
      renderSimulation();
    });
  }
}

function init() {
  setupControls();
  renderSimulation();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
