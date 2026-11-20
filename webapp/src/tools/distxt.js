// Interactive UI controller for the Distributed Transactions & Saga Simulator (/tools/distributed-transactions/).
// Plain DOM, zero external dependencies.

import './shell.js';
import { DIST_TX_CONFIG } from '../config/distxtlab.js';
import { run2PC, runSaga } from '../lib/netlab/distxt.js';

const $ = (id) => document.getElementById(id);
const make = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

let currentMode = 'sagaOrchestrated';
let currentScenario = 'inventoryShortage';

function renderSimulation() {
  const scenario = DIST_TX_CONFIG.scenarios[currentScenario];
  const failAt = scenario ? scenario.failAt : null;

  let result;
  if (currentMode === 'twoPhaseCommit') {
    result = run2PC(DIST_TX_CONFIG.services, failAt);
  } else {
    result = runSaga(DIST_TX_CONFIG.services, failAt, currentMode === 'sagaOrchestrated');
  }

  // Update Status Banner
  const statusEl = $('distxt-status-badge');
  if (statusEl) {
    statusEl.textContent = result.outcome;
    statusEl.className = 'sql-plan-pill';
    if (result.success) {
      statusEl.classList.add('is-index-only');
    } else {
      statusEl.classList.add('is-seq-scan');
    }
  }

  // Update Mode & Scenario Description
  const modeDesc = $('distxt-mode-desc');
  if (modeDesc) modeDesc.textContent = DIST_TX_CONFIG.modes[currentMode].description;

  const scenDesc = $('distxt-scen-desc');
  if (scenDesc) scenDesc.textContent = scenario.description;

  // Render Service Cards
  const cardsContainer = $('distxt-services-grid');
  if (cardsContainer) {
    cardsContainer.replaceChildren();

    DIST_TX_CONFIG.services.forEach((s, idx) => {
      const state = result.serviceStates[s.id] || 'PENDING';
      const card = make('div', `distxt-service-card state-${state.toLowerCase()}`);

      const header = make('div', 'distxt-card-header');
      const stepBadge = make('span', 'distxt-step-num', `Step ${idx + 1}`);
      const stateBadge = make('span', `distxt-state-badge state-${state.toLowerCase()}`, state);
      header.appendChild(stepBadge);
      header.appendChild(stateBadge);
      card.appendChild(header);

      const name = make('h4', 'distxt-service-name', s.name);
      const action = make('div', 'distxt-service-action', `Forward: ${s.action}`);
      const comp = make('div', 'distxt-service-comp', `Compensate: ${s.compensate}`);
      card.appendChild(name);
      card.appendChild(action);
      card.appendChild(comp);

      cardsContainer.appendChild(card);
    });
  }

  // Render Log Console
  const consoleEl = $('distxt-console');
  if (consoleEl) {
    consoleEl.replaceChildren();

    result.log.forEach((entry) => {
      const row = make('div', 'distxt-log-row');
      const tag = make('span', 'distxt-log-tag', `[${entry.phase || entry.step}] `);
      const msg = make('span', 'distxt-log-msg', entry.message);
      row.appendChild(tag);
      row.appendChild(msg);
      consoleEl.appendChild(row);
    });
  }
}

function setupControls() {
  // Mode selection pills
  const modePills = $('distxt-mode-pills');
  if (modePills) {
    modePills.replaceChildren();
    Object.entries(DIST_TX_CONFIG.modes).forEach(([key, mode]) => {
      const btn = make('button', `tool-btn tool-btn-sm ${key === currentMode ? 'is-active' : ''}`, mode.name);
      btn.addEventListener('click', () => {
        modePills.querySelectorAll('button').forEach((b) => b.classList.remove('is-active'));
        btn.classList.add('is-active');
        currentMode = key;
        renderSimulation();
      });
      modePills.appendChild(btn);
    });
  }

  // Scenario selection pills
  const scenPills = $('distxt-scen-pills');
  if (scenPills) {
    scenPills.replaceChildren();
    Object.entries(DIST_TX_CONFIG.scenarios).forEach(([key, sc]) => {
      const btn = make('button', `tool-btn tool-btn-sm ${key === currentScenario ? 'is-active' : ''}`, sc.name);
      btn.addEventListener('click', () => {
        scenPills.querySelectorAll('button').forEach((b) => b.classList.remove('is-active'));
        btn.classList.add('is-active');
        currentScenario = key;
        renderSimulation();
      });
      scenPills.appendChild(btn);
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
