// Interactive UI controller for Production Incident Debugger (/tools/incident-debugger/).
// Plain DOM, zero external dependencies.

import './shell.js';
import { INCIDENT_CONFIG } from '../config/incidentlab.js';
import { createIncidentSession, runDiagnostic, applyMitigation } from '../lib/netlab/incidentlab.js';

const $ = (id) => document.getElementById(id);
const make = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

let currentSession = createIncidentSession('dbConnExhaustion');

function renderSession() {
  const scenario = INCIDENT_CONFIG.scenarios[currentSession.scenarioId];

  // Title and Status
  $('inc-scenario-title').textContent = currentSession.title;
  $('inc-scenario-summary').textContent = currentSession.summary;

  const statusBadge = $('inc-status-badge');
  if (statusBadge) {
    statusBadge.textContent = currentSession.metrics.status;
    statusBadge.className = 'sql-plan-pill';
    if (currentSession.resolved) {
      statusBadge.classList.add('is-index-only');
    } else {
      statusBadge.classList.add('is-seq-scan');
    }
  }

  // Live Metrics
  $('inc-stat-errors').textContent = `${currentSession.metrics.errorRatePct}%`;
  $('inc-stat-p99').textContent = `${currentSession.metrics.p99LatencyMs} ms`;
  $('inc-stat-cpu').textContent = `${currentSession.metrics.cpuUsagePct}%`;
  $('inc-stat-conns').textContent = `${currentSession.metrics.dbConnections} / 100`;

  // Render Diagnostics Buttons
  const diagContainer = $('inc-diagnostics-list');
  if (diagContainer) {
    diagContainer.replaceChildren();
    scenario.diagnostics.forEach((diag) => {
      const card = make('div', 'inc-action-card');
      const btn = make('button', 'tool-btn tool-btn-sm', `Run: ${diag.label}`);
      const isRun = Boolean(currentSession.diagnosticsRun[diag.id]);
      if (isRun) btn.classList.add('is-active');

      btn.addEventListener('click', () => {
        runDiagnostic(currentSession, diag.id);
        renderSession();
      });

      card.appendChild(btn);

      if (isRun) {
        const out = make('div', 'inc-output-box', currentSession.diagnosticsRun[diag.id]);
        card.appendChild(out);
      }
      diagContainer.appendChild(card);
    });
  }

  // Render Mitigations Buttons
  const mitContainer = $('inc-mitigations-list');
  if (mitContainer) {
    mitContainer.replaceChildren();
    scenario.mitigations.forEach((mit) => {
      const card = make('div', 'inc-action-card');
      const btn = make(
        'button',
        `tool-btn tool-btn-sm ${currentSession.resolved ? 'tool-btn-disabled' : 'tool-btn-primary'}`,
        `Apply: ${mit.label}`
      );
      if (currentSession.resolved) btn.disabled = true;

      btn.addEventListener('click', () => {
        applyMitigation(currentSession, mit.id);
        renderSession();
      });

      card.appendChild(btn);
      mitContainer.appendChild(card);
    });
  }

  // Render Incident Timeline Console
  const consoleEl = $('inc-timeline-console');
  if (consoleEl) {
    consoleEl.replaceChildren();
    currentSession.historyLog.forEach((entry) => {
      const line = make('div', 'stream-log-entry');
      if (entry.text.includes('🎉')) line.classList.add('is-success');
      if (entry.text.includes('❌') || entry.text.includes('🚨')) line.classList.add('is-danger');

      const time = make('span', 'stream-log-time', `[${entry.time}] `);
      const text = make('span', 'stream-log-msg', entry.text);
      line.appendChild(time);
      line.appendChild(text);
      consoleEl.appendChild(line);
    });
  }
}

function selectScenario(scenarioId) {
  currentSession = createIncidentSession(scenarioId);
  renderSession();
}

function setupControls() {
  const scenContainer = $('inc-scenario-pills');
  if (scenContainer) {
    scenContainer.replaceChildren();
    Object.entries(INCIDENT_CONFIG.scenarios).forEach(([key, sc]) => {
      const btn = make('button', `tool-btn tool-btn-sm ${key === currentSession.scenarioId ? 'is-active' : ''}`, sc.title.split(':')[0]);
      btn.addEventListener('click', () => {
        scenContainer.querySelectorAll('button').forEach((b) => b.classList.remove('is-active'));
        btn.classList.add('is-active');
        selectScenario(key);
      });
      scenContainer.appendChild(btn);
    });
  }

  const resetBtn = $('inc-btn-reset');
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      selectScenario(currentSession.scenarioId);
    });
  }
}

function init() {
  setupControls();
  renderSession();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
