// Interactive UI controller for the SQL Query & Index Optimizer Playground (webapp/tools/sql-optimizer/index.html).
// Plain DOM, zero external dependencies.

import './shell.js';
import { SQL_OPT_CONFIG } from '../config/sqloptlab.js';
import { analyzePlan } from '../lib/netlab/sqlopt.js';

const $ = (id) => document.getElementById(id);
const make = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

// Optimizer State
let selectedQueryId = 'q1_composite_match';
const activeIndexes = new Set(['idx_orders_status_created']);

function getCurrentQuery() {
  return SQL_OPT_CONFIG.queries.find((q) => q.id === selectedQueryId) || SQL_OPT_CONFIG.queries[0];
}

/* ------------------------------------------------------------------------------------------------ Render Plan Tree */

function renderPlan() {
  const query = getCurrentQuery();
  const plan = analyzePlan(query, activeIndexes);

  // Update SQL Display
  const sqlBox = $('sql-query-display');
  if (sqlBox) sqlBox.textContent = query.sql;

  // Update Plan Type Badge & Explanation
  const badge = $('sql-plan-badge');
  if (badge) {
    badge.textContent = plan.planType;
    badge.className = 'sql-plan-pill';
    if (plan.isIndexOnly) {
      badge.classList.add('is-index-only');
    } else if (plan.isIndexScan) {
      badge.classList.add('is-index-scan');
    } else {
      badge.classList.add('is-seq-scan');
    }
  }

  const explanationBox = $('sql-explanation-text');
  if (explanationBox) explanationBox.textContent = plan.explanation;

  // Update Metric Summary
  $('sql-stat-cost').textContent = plan.totalCost.toLocaleString();
  $('sql-stat-time').textContent = `~${plan.estimatedTimeMs} ms`;
  $('sql-stat-heap-pages').textContent = plan.heapPagesRead.toLocaleString();
  $('sql-stat-rows').textContent = `${plan.rowsReturned.toLocaleString()} / ${plan.rowsExamined.toLocaleString()}`;

  // Render Visual Plan Tree
  const treeContainer = $('sql-plan-tree');
  if (!treeContainer) return;

  treeContainer.replaceChildren();

  (plan.nodes || []).forEach((node, idx) => {
    const card = make('div', `sql-tree-node ${idx === 0 ? 'is-root' : 'is-child'}`);
    const nameSpan = make('span', 'sql-node-name', `${idx > 0 ? '└─ ' : ''}${node.name}`);
    const metaSpan = make('span', 'sql-node-meta', `cost: ${node.cost} | rows: ${node.rows}`);

    card.appendChild(nameSpan);
    card.appendChild(metaSpan);
    treeContainer.appendChild(card);
  });
}

/* ------------------------------------------------------------------------------------------------ Query Buttons */

function setupQueryButtons() {
  const container = $('sql-query-pills');
  if (!container) return;

  container.replaceChildren();

  for (const q of SQL_OPT_CONFIG.queries) {
    const btn = make('button', `tool-pill ${q.id === selectedQueryId ? 'is-active' : ''}`, q.title);
    btn.type = 'button';
    btn.addEventListener('click', () => {
      selectedQueryId = q.id;
      container.querySelectorAll('.tool-pill').forEach((p) => p.classList.remove('is-active'));
      btn.classList.add('is-active');
      renderPlan();
    });
    container.appendChild(btn);
  }
}

/* ------------------------------------------------------------------------------------------------ Index Checkboxes */

function setupIndexToggles() {
  const container = $('sql-index-toggles');
  if (!container) return;

  container.replaceChildren();

  for (const idx of SQL_OPT_CONFIG.availableIndexes) {
    const label = make('label', 'sql-index-toggle-label');
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = activeIndexes.has(idx.id);

    checkbox.addEventListener('change', () => {
      if (checkbox.checked) {
        activeIndexes.add(idx.id);
      } else {
        activeIndexes.delete(idx.id);
      }
      renderPlan();
    });

    const textSpan = make('span', 'sql-toggle-text');
    textSpan.innerHTML = `<strong>${idx.name}</strong> <span class="tool-unit">(${idx.columns.join(', ')})</span>`;

    label.appendChild(checkbox);
    label.appendChild(textSpan);
    container.appendChild(label);
  }
}

/* ------------------------------------------------------------------------------------------------ Quick Presets */

function setupPresets() {
  $('sql-btn-enable-all')?.addEventListener('click', () => {
    for (const idx of SQL_OPT_CONFIG.availableIndexes) activeIndexes.add(idx.id);
    setupIndexToggles();
    renderPlan();
  });

  $('sql-btn-disable-all')?.addEventListener('click', () => {
    activeIndexes.clear();
    setupIndexToggles();
    renderPlan();
  });
}

/* ------------------------------------------------------------------------------------------------ Init */

function init() {
  setupQueryButtons();
  setupIndexToggles();
  setupPresets();
  renderPlan();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
