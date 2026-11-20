// Interactive UI controller for Kafka & Event Streaming Simulator (/tools/event-streaming/).
// Plain DOM, zero external dependencies.

import './shell.js';
import { STREAM_CONFIG } from '../config/eventstreamlab.js';
import {
  createBroker,
  createConsumerGroup,
  publish,
  rebalanceGroup,
  calculateLag,
  consumeBatch
} from '../lib/netlab/eventstream.js';

const $ = (id) => document.getElementById(id);
const make = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

// Simulation State
let partitionCount = STREAM_CONFIG.defaultPartitions;
let broker = createBroker(partitionCount);
let consumerGroup = createConsumerGroup('order-workers', 2, partitionCount);
let currentSemantics = 'atLeastOnce';
let currentScenario = 'balanced';
const activityLog = [];

function logActivity(text, isHighlight = false) {
  const time = new Date().toLocaleTimeString();
  activityLog.unshift({ time, text, isHighlight });
  if (activityLog.length > 50) activityLog.pop();
  renderLogs();
}

function renderLogs() {
  const consoleEl = $('stream-console');
  if (!consoleEl) return;
  consoleEl.replaceChildren();

  activityLog.forEach((entry) => {
    const item = make('div', `stream-log-entry ${entry.isHighlight ? 'is-highlight' : ''}`);
    const timeSpan = make('span', 'stream-log-time', `[${entry.time}] `);
    const textSpan = make('span', 'stream-log-msg', entry.text);
    item.appendChild(timeSpan);
    item.appendChild(textSpan);
    consoleEl.appendChild(item);
  });
}

/* ------------------------------------------------------------------------------------------------ Render Partitions */

function renderPartitions() {
  const container = $('stream-partitions-list');
  if (!container) return;
  container.replaceChildren();

  const lagInfo = calculateLag(broker, consumerGroup);
  $('stream-stat-total-lag').textContent = lagInfo.totalLag.toLocaleString();
  $('stream-stat-total-msgs').textContent = broker.partitions
    .reduce((acc, p) => acc + p.messages.length, 0)
    .toLocaleString();

  broker.partitions.forEach((part) => {
    const committed = consumerGroup.committedOffsets[part.id] || 0;
    const lag = lagInfo.partitionLag[part.id] || 0;

    const card = make('div', 'stream-partition-card');

    const header = make('div', 'stream-partition-header');
    const title = make('span', 'stream-partition-title', `Partition P${part.id}`);
    const badge = make('span', `stream-lag-badge ${lag > 0 ? 'has-lag' : 'zero-lag'}`, `Lag: ${lag}`);
    header.appendChild(title);
    header.appendChild(badge);
    card.appendChild(header);

    const meta = make('div', 'stream-partition-meta', `Log Head: ${part.nextOffset} | Committed Offset: ${committed}`);
    card.appendChild(meta);

    // Messages queue visualization
    const queue = make('div', 'stream-messages-queue');
    if (part.messages.length === 0) {
      const empty = make('div', 'stream-queue-empty', 'Log empty');
      queue.appendChild(empty);
    } else {
      part.messages.forEach((msg) => {
        const isCommitted = msg.offset < committed;
        const msgPill = make(
          'div',
          `stream-msg-pill ${isCommitted ? 'is-committed' : 'is-uncommitted'}`
        );
        msgPill.title = `Key: ${msg.key} | Value: ${JSON.stringify(msg.value)}`;
        msgPill.textContent = `@${msg.offset} [${msg.key}]`;
        queue.appendChild(msgPill);
      });
    }
    card.appendChild(queue);

    container.appendChild(card);
  });
}

/* ------------------------------------------------------------------------------------------------ Render Consumers */

function renderConsumers() {
  const container = $('stream-consumers-list');
  if (!container) return;
  container.replaceChildren();

  $('stream-stat-consumers').textContent = `${consumerGroup.consumers.filter((c) => c.isAlive).length} active / ${consumerGroup.consumers.length} total`;

  consumerGroup.consumers.forEach((c) => {
    const card = make('div', `stream-consumer-card ${c.isAlive ? 'is-alive' : 'is-crashed'}`);

    const header = make('div', 'stream-consumer-header');
    const name = make('span', 'stream-consumer-name', `${c.id} (${c.isAlive ? 'Active' : 'CRASHED'})`);
    header.appendChild(name);

    const toggleBtn = make(
      'button',
      `tool-btn tool-btn-sm ${c.isAlive ? 'stream-btn-crash' : 'stream-btn-revive'}`,
      c.isAlive ? 'Crash' : 'Revive'
    );
    toggleBtn.addEventListener('click', () => {
      c.isAlive = !c.isAlive;
      const active = consumerGroup.consumers.filter((cons) => cons.isAlive);
      rebalanceGroup(consumerGroup, active, partitionCount);
      logActivity(
        c.isAlive
          ? `Consumer ${c.id} revived! Rebalance completed.`
          : `Consumer ${c.id} failed/crashed! Coordinator rebalanced remaining consumers.`,
        true
      );
      renderAll();
    });
    header.appendChild(toggleBtn);
    card.appendChild(header);

    const assignedText = c.assignedPartitions.length > 0
      ? c.assignedPartitions.map((p) => `P${p}`).join(', ')
      : 'None (Idle)';

    const partitionsRow = make('div', 'stream-consumer-partitions', `Assigned: ${assignedText}`);
    const processedRow = make('div', 'stream-consumer-meta', `Processed: ${c.processedCount} msgs`);
    card.appendChild(partitionsRow);
    card.appendChild(processedRow);

    container.appendChild(card);
  });
}

function renderAll() {
  renderPartitions();
  renderConsumers();
  renderSemanticsDescription();
}

function renderSemanticsDescription() {
  const descEl = $('stream-semantics-desc');
  if (!descEl) return;
  const cfg = STREAM_CONFIG.deliverySemantics[currentSemantics];
  if (cfg) {
    descEl.textContent = cfg.description;
  }
}

/* ------------------------------------------------------------------------------------------------ Actions */

function publishSingle(key, val) {
  const sampleKey = key || STREAM_CONFIG.sampleKeys[Math.floor(Math.random() * STREAM_CONFIG.sampleKeys.length)];
  const payload = val || { id: Math.floor(Math.random() * 10000), ts: Date.now() };

  const res = publish(broker, sampleKey, payload);
  logActivity(`Published key "${sampleKey}" -> Partition P${res.partitionId} (Offset ${res.offset})`);
  renderAll();
}

function consumeNextBatch() {
  const activeCount = consumerGroup.consumers.filter((c) => c.isAlive).length;
  if (activeCount === 0) {
    logActivity('Cannot consume: All consumers in group are down!', true);
    return;
  }

  const processed = consumeBatch(consumerGroup, broker, currentSemantics);
  if (processed.length === 0) {
    logActivity('Consumer group polled: 0 new messages available (caught up).');
  } else {
    logActivity(
      `Batch consumed: ${processed.length} messages processed across ${activeCount} active consumers [Semantics: ${currentSemantics}]`,
      true
    );
  }
  renderAll();
}

function applyScenario(scenarioKey) {
  currentScenario = scenarioKey;
  if (scenarioKey === 'balanced') {
    partitionCount = 4;
    broker = createBroker(4);
    consumerGroup = createConsumerGroup('order-workers', 2, 4);
  } else if (scenarioKey === 'scaleOut') {
    partitionCount = 4;
    broker = createBroker(4);
    consumerGroup = createConsumerGroup('order-workers', 4, 4);
  } else if (scenarioKey === 'overProvisioned') {
    partitionCount = 4;
    broker = createBroker(4);
    consumerGroup = createConsumerGroup('order-workers', 5, 4);
  } else if (scenarioKey === 'consumerFailure') {
    partitionCount = 4;
    broker = createBroker(4);
    consumerGroup = createConsumerGroup('order-workers', 3, 4);
    consumerGroup.consumers[1].isAlive = false;
    const active = consumerGroup.consumers.filter((c) => c.isAlive);
    rebalanceGroup(consumerGroup, active, 4);
  }

  // Pre-seed a few messages for immediate interaction
  publish(broker, 'order:101', { amount: 120 });
  publish(broker, 'user:42', { action: 'login' });
  publish(broker, 'payment:999', { status: 'authorized' });
  publish(broker, 'order:101', { status: 'shipped' });

  logActivity(`Scenario applied: "${STREAM_CONFIG.scenarios[scenarioKey].name}"`, true);
  renderAll();
}

/* ------------------------------------------------------------------------------------------------ Setup Event Listeners */

function setupControls() {
  // Scenario Pills
  const scenContainer = $('stream-scenario-pills');
  if (scenContainer) {
    scenContainer.replaceChildren();
    Object.entries(STREAM_CONFIG.scenarios).forEach(([key, sc]) => {
      const btn = make('button', `tool-btn tool-btn-sm ${key === currentScenario ? 'is-active' : ''}`, sc.name);
      btn.addEventListener('click', () => {
        scenContainer.querySelectorAll('button').forEach((b) => b.classList.remove('is-active'));
        btn.classList.add('is-active');
        applyScenario(key);
      });
      scenContainer.appendChild(btn);
    });
  }

  // Semantics selector
  const semanticsSelect = $('stream-semantics-select');
  if (semanticsSelect) {
    semanticsSelect.addEventListener('change', (e) => {
      currentSemantics = e.target.value;
      logActivity(`Delivery semantics changed to: ${currentSemantics}`);
      renderSemanticsDescription();
    });
  }

  // Publish button
  const pubBtn = $('stream-btn-publish');
  if (pubBtn) {
    pubBtn.addEventListener('click', () => {
      const keySelect = $('stream-publish-key');
      const selectedKey = keySelect ? keySelect.value : null;
      publishSingle(selectedKey);
    });
  }

  // Publish Burst (5 msgs)
  const burstBtn = $('stream-btn-burst');
  if (burstBtn) {
    burstBtn.addEventListener('click', () => {
      for (let i = 0; i < 5; i++) {
        publishSingle();
      }
    });
  }

  // Consume button
  const consumeBtn = $('stream-btn-consume');
  if (consumeBtn) {
    consumeBtn.addEventListener('click', () => {
      consumeNextBatch();
    });
  }

  // Add Consumer
  const addConsumerBtn = $('stream-btn-add-consumer');
  if (addConsumerBtn) {
    addConsumerBtn.addEventListener('click', () => {
      if (consumerGroup.consumers.length >= STREAM_CONFIG.maxConsumers) {
        logActivity(`Maximum consumers (${STREAM_CONFIG.maxConsumers}) reached.`, true);
        return;
      }
      const newId = `C${consumerGroup.consumers.length + 1}`;
      consumerGroup.consumers.push({
        id: newId,
        assignedPartitions: [],
        isAlive: true,
        processedCount: 0
      });
      const active = consumerGroup.consumers.filter((c) => c.isAlive);
      rebalanceGroup(consumerGroup, active, partitionCount);
      logActivity(`Added consumer ${newId} to group. Rebalance executed!`, true);
      renderAll();
    });
  }

  // Clear Logs
  const clearLogsBtn = $('stream-btn-clear-logs');
  if (clearLogsBtn) {
    clearLogsBtn.addEventListener('click', () => {
      activityLog.length = 0;
      renderLogs();
    });
  }
}

function init() {
  setupControls();
  applyScenario('balanced');
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
