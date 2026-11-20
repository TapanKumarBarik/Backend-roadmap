// The LLD & Database Schema Studio (webapp/tools/lld-studio/index.html):
// Interactive UML class diagrams, ER models, design pattern inspection, and multi-language code generation.
// Plain DOM, zero external dependencies.

import './shell.js';
import { LLD_PRESETS } from '../config/lldstudio.js';
import {
  renderSvgDiagram,
  generatePythonCode,
  generateTypeScriptCode,
  generateGoCode,
  generateSqlDdl,
  generateMermaid
} from '../lib/netlab/lld.js';

const $ = (id) => document.getElementById(id);
const make = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

// Studio State
let currentPresetKey = 'parkingLot';
let currentLang = 'python';
let selectedElementId = null;

function getCurrentPreset() {
  return LLD_PRESETS[currentPresetKey] || LLD_PRESETS.parkingLot;
}

/* ------------------------------------------------------------------------------------------------ SVG Diagram Render */

function renderDiagram() {
  const preset = getCurrentPreset();
  const container = $('lld-canvas-holder');
  if (!container) return;

  const svgMarkup = renderSvgDiagram(preset, {
    selectedId: selectedElementId,
    width: 1040,
    height: preset.mode === 'er' ? 440 : 480
  });

  container.innerHTML = svgMarkup;

  // Attach click listeners to cards
  const nodes = container.querySelectorAll('.lld-node');
  nodes.forEach((node) => {
    node.addEventListener('click', () => {
      const id = node.getAttribute('data-id');
      selectedElementId = selectedElementId === id ? null : id;
      renderDiagram();
      updateInspector();
    });
  });
}

/* ------------------------------------------------------------------------------------------------ Inspector */

function updateInspector() {
  const inspector = $('lld-inspector');
  if (!inspector) return;

  const preset = getCurrentPreset();
  const items = preset.mode === 'er' ? preset.entities : preset.classes;
  const selected = items.find((it) => it.id === selectedElementId);

  if (!selected) {
    inspector.innerHTML = `
      <div class="lld-inspect-empty">
        <span class="lld-badge">${preset.pattern}</span>
        <h4>${preset.name}</h4>
        <p>${preset.description}</p>
        <p class="tool-hint">Click any class or table card in the canvas above to inspect attributes, methods, and relationships.</p>
      </div>
    `;
    return;
  }

  const isEr = preset.mode === 'er';
  const relatedRels = (preset.relationships || []).filter(
    (r) => r.from === selected.id || r.to === selected.id
  );

  let fieldsHtml = '';
  if (isEr) {
    fieldsHtml = (selected.fields || [])
      .map(
        (f) => `<li><code>${f.name}</code> <span class="tool-unit">${f.type}</span> ${f.isPk ? '<b>[PK]</b>' : ''} ${f.isFk ? `<b>[FK &rarr; ${f.ref}]</b>` : ''}</li>`
      )
      .join('');
  } else {
    fieldsHtml = (selected.fields || []).map((f) => `<li><code>${f}</code></li>`).join('') || '<li><em>None</em></li>';
  }

  let methodsHtml = '';
  if (!isEr) {
    methodsHtml = (selected.methods || []).map((m) => `<li><code>${m}</code></li>`).join('') || '<li><em>None</em></li>';
  }

  const relsHtml = relatedRels
    .map((r) => `<li><code>${r.from}</code> &rarr; <code>${r.to}</code> (${r.type}${r.label ? `: ${r.label}` : ''})</li>`)
    .join('') || '<li><em>No direct links</em></li>';

  inspector.innerHTML = `
    <div class="lld-inspect-details">
      <div class="lld-inspect-header">
        <h4>${selected.name} ${selected.stereotype ? `<small>&laquo;${selected.stereotype}&raquo;</small>` : ''}</h4>
        <button class="tool-btn-sm" id="lld-deselect-btn">Clear Selection</button>
      </div>
      <div class="lld-inspect-grid">
        <div>
          <h5>${isEr ? 'Columns & Constraints' : 'Fields'}</h5>
          <ul class="lld-prop-list">${fieldsHtml}</ul>
        </div>
        ${!isEr ? `<div><h5>Methods</h5><ul class="lld-prop-list">${methodsHtml}</ul></div>` : ''}
        <div>
          <h5>Relationships</h5>
          <ul class="lld-prop-list">${relsHtml}</ul>
        </div>
      </div>
    </div>
  `;

  const deselectBtn = $('lld-deselect-btn');
  if (deselectBtn) {
    deselectBtn.addEventListener('click', () => {
      selectedElementId = null;
      renderDiagram();
      updateInspector();
    });
  }
}

/* ------------------------------------------------------------------------------------------------ Code Generation */

function updateCodeView() {
  const codeBlock = $('lld-code-output');
  if (!codeBlock) return;

  const preset = getCurrentPreset();
  let generated = '';

  switch (currentLang) {
    case 'python':
      generated = generatePythonCode(preset);
      break;
    case 'typescript':
      generated = generateTypeScriptCode(preset);
      break;
    case 'go':
      generated = generateGoCode(preset);
      break;
    case 'sql':
      generated = generateSqlDdl(preset);
      break;
    case 'mermaid':
      generated = generateMermaid(preset);
      break;
    default:
      generated = generatePythonCode(preset);
  }

  codeBlock.textContent = generated;
}

/* ------------------------------------------------------------------------------------------------ Preset Buttons */

function setupPresets() {
  const container = $('lld-preset-pills');
  if (!container) return;

  container.replaceChildren();

  for (const [key, preset] of Object.entries(LLD_PRESETS)) {
    const btn = make('button', `tool-pill ${key === currentPresetKey ? 'is-active' : ''}`, preset.name);
    btn.type = 'button';
    btn.addEventListener('click', () => {
      currentPresetKey = key;
      selectedElementId = null;
      container.querySelectorAll('.tool-pill').forEach((p) => p.classList.remove('is-active'));
      btn.classList.add('is-active');

      renderDiagram();
      updateInspector();
      updateCodeView();
    });
    container.appendChild(btn);
  }
}

/* ------------------------------------------------------------------------------------------------ Code Tabs */

function setupCodeTabs() {
  const tabs = document.querySelectorAll('.lld-lang-tab');
  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      tabs.forEach((t) => t.classList.remove('is-active'));
      tab.classList.add('is-active');
      currentLang = tab.getAttribute('data-lang');
      updateCodeView();
    });
  });

  const copyBtn = $('lld-copy-btn');
  if (copyBtn) {
    copyBtn.addEventListener('click', async () => {
      const code = $('lld-code-output')?.textContent || '';
      try {
        await navigator.clipboard.writeText(code);
        const originalText = copyBtn.textContent;
        copyBtn.textContent = '✓ Copied!';
        setTimeout(() => {
          copyBtn.textContent = originalText;
        }, 1800);
      } catch {
        // Fallback for clipboard
      }
    });
  }

  const downloadSvgBtn = $('lld-download-svg');
  if (downloadSvgBtn) {
    downloadSvgBtn.addEventListener('click', () => {
      const preset = getCurrentPreset();
      const svgMarkup = renderSvgDiagram(preset, { width: 1040, height: preset.mode === 'er' ? 440 : 480 });
      const blob = new Blob([svgMarkup], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${preset.id}-diagram.svg`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    });
  }
}

/* ------------------------------------------------------------------------------------------------ Init */

function init() {
  setupPresets();
  setupCodeTabs();
  renderDiagram();
  updateInspector();
  updateCodeView();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
