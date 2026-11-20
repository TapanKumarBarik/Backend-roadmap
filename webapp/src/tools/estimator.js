// Interactive UI controller for the System Design Capacity Estimator (/tools/system-design-estimator/).
// Plain DOM, zero external dependencies.

import './shell.js';
import { ESTIMATOR_CONFIG } from '../config/estimatorlab.js';
import {
  formatBytes,
  formatBitsPerSec,
  formatCount,
  estimateCapacity,
  generateMarkdownReport
} from '../lib/netlab/estimator.js';

const $ = (id) => document.getElementById(id);
const make = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

let currentPresetKey = 'urlShortener';
let currentParams = { ...ESTIMATOR_CONFIG.presets.urlShortener };

function calculateAndRender() {
  const results = estimateCapacity(currentParams);

  // QPS Stats
  $('est-stat-total-qps').textContent = `${formatCount(results.qps.totalPeakQps)} /s`;
  $('est-stat-read-qps').textContent = `${formatCount(results.qps.peakReadQps)} /s (avg: ${formatCount(results.qps.avgReadQps)})`;
  $('est-stat-write-qps').textContent = `${formatCount(results.qps.peakWriteQps)} /s (avg: ${formatCount(results.qps.avgWriteQps)})`;

  // Bandwidth Stats
  $('est-stat-total-bw').textContent = formatBitsPerSec(results.bandwidth.totalBandwidthBps);
  $('est-stat-ingress').textContent = `${formatBytes(results.bandwidth.writeBytesPerSec)}/s (${formatBitsPerSec(results.bandwidth.writeBandwidthBps)})`;
  $('est-stat-egress').textContent = `${formatBytes(results.bandwidth.readBytesPerSec)}/s (${formatBitsPerSec(results.bandwidth.readBandwidthBps)})`;

  // Storage Stats
  $('est-stat-daily-storage').textContent = `${formatBytes(results.storage.dailyWriteBytes)} / day`;
  $('est-stat-replicated-storage').textContent = formatBytes(results.storage.storageTotalReplicatedBytes);
  $('est-stat-raw-storage').textContent = `${formatBytes(results.storage.storageTotalRawBytes)} (${currentParams.retentionYears} yrs)`;

  // Cache & Hardware
  $('est-stat-cache-ram').textContent = formatBytes(results.cache.cacheRamBytes);
  $('est-stat-db-shards').textContent = `${results.hardware.recommendedDbShards} shards (2TB SSD)`;
  $('est-stat-cache-nodes').textContent = `${results.hardware.recommendedCacheNodes} nodes (64GB RAM)`;

  // Update Markdown Preview
  const presetName = ESTIMATOR_CONFIG.presets[currentPresetKey]?.name || 'Custom Architecture';
  const mdReport = generateMarkdownReport(presetName, currentParams, results);
  const previewBox = $('est-markdown-preview');
  if (previewBox) {
    previewBox.textContent = mdReport;
  }
}

function syncInputsFromParams() {
  $('est-input-dau').value = currentParams.dau;
  $('est-input-reads').value = currentParams.readsPerUser;
  $('est-input-writes').value = currentParams.writesPerUser;
  $('est-input-read-size').value = currentParams.readSizeKb;
  $('est-input-write-size').value = currentParams.writeSizeKb;
  $('est-input-retention').value = currentParams.retentionYears;
  $('est-input-replication').value = currentParams.replicationFactor;
  $('est-input-peak-multiplier').value = currentParams.peakMultiplier;
}

function readParamsFromInputs() {
  currentParams.dau = Math.max(1, Number($('est-input-dau').value) || 100_000_000);
  currentParams.readsPerUser = Math.max(0, Number($('est-input-reads').value) || 10);
  currentParams.writesPerUser = Math.max(0.001, Number($('est-input-writes').value) || 1);
  currentParams.readSizeKb = Math.max(0.1, Number($('est-input-read-size').value) || 1);
  currentParams.writeSizeKb = Math.max(0.1, Number($('est-input-write-size').value) || 1);
  currentParams.retentionYears = Math.max(1, Number($('est-input-retention').value) || 5);
  currentParams.replicationFactor = Math.max(1, Number($('est-input-replication').value) || 3);
  currentParams.peakMultiplier = Math.max(1, Number($('est-input-peak-multiplier').value) || 3);
}

function applyPreset(presetKey) {
  currentPresetKey = presetKey;
  const preset = ESTIMATOR_CONFIG.presets[presetKey];
  if (!preset) return;
  currentParams = { ...preset };
  syncInputsFromParams();
  calculateAndRender();
}

function setupControls() {
  // Setup Preset Buttons
  const presetsContainer = $('est-presets-bar');
  if (presetsContainer) {
    presetsContainer.replaceChildren();
    Object.entries(ESTIMATOR_CONFIG.presets).forEach(([key, p]) => {
      const btn = make('button', `tool-btn tool-btn-sm ${key === currentPresetKey ? 'is-active' : ''}`, p.name);
      btn.addEventListener('click', () => {
        presetsContainer.querySelectorAll('button').forEach((b) => b.classList.remove('is-active'));
        btn.classList.add('is-active');
        applyPreset(key);
      });
      presetsContainer.appendChild(btn);
    });
  }

  // Setup Live Input Event Listeners
  const inputIds = [
    'est-input-dau',
    'est-input-reads',
    'est-input-writes',
    'est-input-read-size',
    'est-input-write-size',
    'est-input-retention',
    'est-input-replication',
    'est-input-peak-multiplier'
  ];

  inputIds.forEach((id) => {
    const el = $(id);
    if (el) {
      el.addEventListener('input', () => {
        readParamsFromInputs();
        calculateAndRender();
      });
    }
  });

  // Copy Markdown Button
  const copyBtn = $('est-btn-copy-md');
  if (copyBtn) {
    copyBtn.addEventListener('click', async () => {
      const previewBox = $('est-markdown-preview');
      if (!previewBox) return;
      try {
        await navigator.clipboard.writeText(previewBox.textContent);
        const originalText = copyBtn.textContent;
        copyBtn.textContent = 'Copied to Clipboard!';
        copyBtn.classList.add('is-copied');
        setTimeout(() => {
          copyBtn.textContent = originalText;
          copyBtn.classList.remove('is-copied');
        }, 2000);
      } catch (err) {
        copyBtn.textContent = 'Press Ctrl+C to copy';
      }
    });
  }
}

function init() {
  setupControls();
  applyPreset('urlShortener');
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
