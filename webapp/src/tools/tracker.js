// The Prep Tracker (webapp/tracker/index.html): the sheets, the progress bar, the filters and the rows, drawn from the study items (dist/tracker.json) and from what the
// reader has saved in this browser. Plain DOM, no React, so the page is small and quick. The page's explanation is already in the HTML; this adds the behaviour. The
// logic (what a row's state is, when it is due, what a filter keeps, the files) is lib/tracker/model.js, tested apart from the page; the words and numbers are
// config/tracker.js. Nothing leaves the browser.
import './shell.js';
import { TRACKER as C } from '../config/tracker.js';
import { STORAGE } from '../config/index.js';
import { readStored, writeStored } from '../lib/storage.js';
import { recordOf, compact, parseRange, kindOf, nextReview, isDue, matches, summarize, scoreOf, stepsOf, toCsv, serialize, backupText, readRecords } from '../lib/tracker/model.js';

const $ = (id) => document.getElementById(id);
const esc = (text) => String(text == null ? '' : text).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const pad = (n) => String(n).padStart(2, '0');
const today = () => { const t = new Date(); return `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}`; };
const dayFormat = (day) => {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: y === new Date().getFullYear() ? undefined : 'numeric' });
};
const ui = C.ui;

/* ------------------------------------------------------------------------------------------------ state */

let sheets = null;                // the items by sheet, once loaded
const known = new Map();            // item id -> { tab, steps } for every item
const byId = new Map();             // item id -> { tab, row }
let records = new Map();          // item id -> what this browser has saved for it (only what differs from blank)
let tab = C.defaultTab;
const filters = {};
const limit = {};
const open = new Set();
for (const key of C.tabOrder) { filters[key] = { q: '', ph: '', st: '', pri: '', df: '', tr: '', lesson: '', due: false, notes: false, range: null }; limit[key] = C.pageSize; }

const stepsCount = () => (sheets && sheets.pr ? sheets.pr.steps.length : 0);
const stepCountOf = (key) => (key === 'pr' ? stepsCount() : 0);
const recordFor = (key, id) => recordOf(key, records.get(id), C);
const kind = (key, id) => kindOf(key, recordFor(key, id), C, stepCountOf(key));
const due = (key, id) => isDue(key, recordFor(key, id), today(), C, stepCountOf(key));

/* ------------------------------------------------------------------------------------------------ saving */

let saveTimer = 0;
let dirty = false;
function setStatus(message) { $('tr-status').textContent = message; }

function flush() {
  clearTimeout(saveTimer);
  saveTimer = 0;
  if (!dirty) return;
  dirty = false;
  const saved = writeStored(STORAGE.tracker, serialize(records, C));
  setStatus(saved ? ui.saved : ui.saveFailed);
}
function changed() {
  dirty = true;
  setStatus(ui.saving);
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flush, C.saveDelayMs);
}
window.addEventListener('pagehide', flush);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });

/** Change what the reader has saved for one item, then update the row, the counts and the saved copy. */
function edit(id, patch) {
  const { tab: key } = byId.get(id);
  const next = compact(key, { ...recordFor(key, id), ...patch }, C);
  if (Object.keys(next).length) records.set(id, next); else records.delete(id);
  refreshRow(key, id);
  drawSummary();
  changed();
}

/* ------------------------------------------------------------------------------------------------ rows */

const confidenceButtons = (current) => {
  let html = `<div class="tr-conf" role="group" aria-label="${esc(ui.confidence)}"><span class="tr-mlabel">${esc(ui.confidence)}</span>`;
  for (let n = 1; n <= 5; n++) html += `<button type="button" data-act="conf" data-v="${n}" class="${n <= current ? 'is-on' : ''}" aria-pressed="${n === current}" title="${n}: ${esc(C.confidence[n])}" aria-label="${esc(ui.confidenceLabel(n, C.confidence[n]))}">${n}</button>`;
  return `${html}</div>`;
};

const whenHtml = (key, rec) => {
  if (key === 'pr') {
    const score = scoreOf(rec, stepsCount());
    const total = stepsCount();
    return `<span class="tr-score"><span class="tr-score__bar" aria-hidden="true"><b style="width:${total ? (score / total) * 100 : 0}%"></b></span><span class="tr-score__n"><span class="tool-sr">${esc(ui.scoreWord)} </span>${score} / ${total}</span></span>`;
  }
  if (!rec.d) return `<span aria-label="${esc(ui.undated)}">—</span>`;
  const next = nextReview(rec, C);
  return `${esc(dayFormat(rec.d))}${next ? `<small>${esc(ui.review(dayFormat(next)))}</small>` : ''}`;
};

function chipsHtml(key, id) {
  const rec = recordFor(key, id);
  return `${due(key, id) ? `<span class="tr-tag tr-tag--due">${esc(ui.reviseNow)}</span>` : ''}${rec.n ? `<span class="tr-tag tr-tag--has">${esc(ui.hasNotes)}</span>` : ''}`;
}

function tagsHtml(key, row) {
  let html = `<span class="tr-id">${esc(row.i || row.id)}</span>`;
  if (row.p) html += `<span class="tr-tag${row.p === C.mustKnow ? ' tr-tag--must' : ''}">${esc(row.p)}</span>`;
  if (row.df) html += `<span class="tr-tag">${esc(row.df)}</span>`;
  if (row.tr) html += `<span class="tr-tag">${esc(ui.track(row.tr))}</span>`;
  if (row.u) html += `<a class="tr-tag tr-tag--lesson" href="${esc(row.u)}">${esc(ui.openLesson)}</a>`;
  const resources = resourcesOf(row);
  if (resources.length) html += `<span class="tr-tag">${esc(ui.resourceCount(resources.length))}</span>`;
  return `${html}<span class="tr-chips" data-role="chips">${chipsHtml(key, row.id)}</span>`;
}

function stepButton(name, index, digit) {
  const word = ui.stepWords[digit];
  return `<button type="button" class="tr-step" data-act="step" data-i="${index}" data-v="${digit}" title="${esc(ui.stepLabel(name, word))}" aria-label="${esc(ui.stepLabel(name, word))}"><span class="tr-step__mark" aria-hidden="true"></span><span class="tr-step__n" aria-hidden="true">${index + 1}</span>${esc(name)}</button>`;
}

function panelHtml(key, row) {
  const rec = recordFor(key, row.id);
  const spec = C.tabs[key];
  let html = `<div class="tr-pcol"><label class="tr-lab" for="n-${esc(row.id)}">${esc(ui.notes)}</label><textarea id="n-${esc(row.id)}" class="tr-note" data-act="note" rows="5" maxlength="${C.maxNoteChars}" placeholder="${esc(key === 'qa' ? ui.answerHint : ui.notesHint)}">${esc(rec.n)}</textarea>`;
  html += `<div class="tr-pfield"><label for="d-${esc(row.id)}">${esc(spec.dateLabel)}</label><input id="d-${esc(row.id)}" class="tr-date" data-act="date" type="date" value="${esc(rec.d)}"></div>`;
  html += `<p class="tool-note">${esc(ui.confidenceLegend)}</p></div><div class="tr-dcol">`;
  if (row.pre) html += `<p><strong>${esc(ui.doFirst)}</strong> ${esc(row.pre)}</p>`;
  if (key === 'pr') {
    html += `<p>${esc(ui.covers(row.ids || '—'))}</p>`;
    if (parseRange(row.ids)) html += `<p><button type="button" class="tool-btn" data-act="range">${esc(ui.showStudyItems)}</button></p>`;
    html += `<ul class="tr-stepkey" aria-label="${esc(ui.stepsHint)}">${['0', '1', '2'].map((v) => `<li data-v="${v}"><span class="tr-step__mark" aria-hidden="true"></span>${esc(ui.stepWords[v])}</li>`).join('')}</ul><p class="tool-note">${esc(ui.stepsHint)}</p>`;
  }
  const resources = resourcesOf(row);
  if (resources.length) {
    html += `<p><strong>${esc(ui.resources)}</strong></p><ul class="tr-links">${resources.map((r) => `<li><a href="${esc(r.u)}" target="_blank" rel="noopener noreferrer">${esc(r.n)}<span class="tool-sr"> ${esc(ui.newTab)}</span></a><span class="tr-linkmeta">${esc([r.t, r.a].filter(Boolean).join(' · '))}</span></li>`).join('')}</ul>`;
  }
  return `${html}</div>`;
}

function rowHtml(key, row) {
  const id = row.id;
  const rec = recordFor(key, id);
  const spec = C.tabs[key];
  const isOpen = open.has(id);
  let html = `<li class="tr-row${key === 'pr' ? ' tr-row--pr' : ''}${isOpen ? ' is-open' : ''}" data-id="${esc(id)}" data-k="${kind(key, id)}">`;
  if (key !== 'pr') {
    const word = key === 'qa' ? ui.questionWord : row.n;
    html += `<span class="tr-tickwrap"><input type="checkbox" class="tr-tick" data-act="tick" aria-label="${esc(ui.tickLabel(word, spec.done.toLowerCase()))}"${kindOf(key, rec, C) === 'done' ? ' checked' : ''}></span>`;
  }
  const path = key === 'qa' ? row.t : [row.t, row.st].filter(Boolean).join(' › ');
  html += `<div class="tr-main"><button class="tr-head" type="button" data-act="toggle" aria-expanded="${isOpen}" aria-controls="p-${esc(id)}">${esc(row.n)}${path && key !== 'pr' ? `<span class="tr-path">${esc(path)}</span>` : ''}</button><div class="tr-tags">${tagsHtml(key, row)}</div></div>`;
  if (key !== 'pr') html += `<select class="tr-status" data-act="status" aria-label="${esc(ui.status)}">${spec.statuses.map((s) => `<option${s[0] === rec.s ? ' selected' : ''}>${esc(s[0])}</option>`).join('')}</select>`;
  html += `${confidenceButtons(rec.c)}<div class="tr-when" data-role="when">${whenHtml(key, rec)}</div>`;
  if (key === 'pr') html += `<div class="tr-steps" role="group" aria-label="${esc(ui.stepsHint)}">${sheets.pr.steps.map((name, i) => stepButton(name, i, stepsOf(rec, stepsCount())[i])).join('')}</div>`;
  return `${html}<div class="tr-panel" id="p-${esc(id)}"${isOpen ? '' : ' hidden'}>${isOpen ? panelHtml(key, row) : ''}</div></li>`;
}

const resourcesOf = (row) => ((sheets.resourceSets && sheets.resourceSets[row.rs]) || []).map((i) => sheets.resources[i]);
const rowsOf = (key) => sheets[key].rows;
const visibleRows = (key) => rowsOf(key).filter((row) => matches(key, row, recordFor(key, row.id), filters[key], today(), C, stepCountOf(key)));
const list = $('tr-list');

function renderList() {
  const rows = visibleRows(tab);
  const shown = Math.min(rows.length, limit[tab]);
  list.innerHTML = rows.length ? rows.slice(0, shown).map((row) => rowHtml(tab, row)).join('') : `<li class="tr-empty">${esc(ui.nothing)}</li>`;
  const more = $('tr-more');
  more.hidden = rows.length <= shown;
  more.textContent = ui.showMore(Math.min(C.pageSize, rows.length - shown), rows.length - shown);
  $('tr-count').textContent = ui.count(rows.length, rowsOf(tab).length, C.tabs[tab].noun);
}

/** Update one row where it stands, so focus and typing are not disturbed. */
function refreshRow(key, id) {
  if (key !== tab) return;
  const el = list.querySelector(`[data-id="${CSS.escape(id)}"]`);
  if (!el) return;
  const rec = recordFor(key, id);
  el.dataset.k = kind(key, id);
  const tick = el.querySelector('.tr-tick');
  if (tick) tick.checked = kindOf(key, rec, C) === 'done';
  const status = el.querySelector('select.tr-status');
  if (status) status.value = rec.s;
  el.querySelectorAll('.tr-conf button').forEach((button) => {
    const n = Number(button.dataset.v);
    button.classList.toggle('is-on', n <= rec.c);
    button.setAttribute('aria-pressed', String(n === rec.c));
  });
  el.querySelector('[data-role="when"]').innerHTML = whenHtml(key, rec);
  el.querySelector('[data-role="chips"]').innerHTML = chipsHtml(key, id);
  if (key === 'pr') {
    const digits = stepsOf(rec, stepsCount());
    el.querySelectorAll('.tr-step').forEach((button) => {
      const i = Number(button.dataset.i);
      button.dataset.v = digits[i];
      const label = ui.stepLabel(sheets.pr.steps[i], ui.stepWords[digits[i]]);
      button.title = label;
      button.setAttribute('aria-label', label);
    });
  }
  const note = el.querySelector('textarea.tr-note');
  if (note && document.activeElement !== note && note.value !== rec.n) note.value = rec.n;
  const date = el.querySelector('input.tr-date');
  if (date && date.value !== rec.d) date.value = rec.d;
}

/* ------------------------------------------------------------------------------------------------ the progress bar */

let summaryQueued = false;
function drawSummary() {
  if (summaryQueued) return;
  summaryQueued = true;
  requestAnimationFrame(() => { summaryQueued = false; paintSummary(); });
}

function paintSummary() {
  if (!sheets) return;
  const s = summarize(tab, rowsOf(tab), records, today(), C, stepCountOf(tab));
  const word = tab === 'qa' ? 'reviewed' : tab === 'pr' ? 'complete' : 'completed';
  $('tr-pct').textContent = `${s.total ? Math.round((s.done / s.total) * 100) : 0}%`;
  $('tr-pct-label').textContent = ui.done(s.done, s.total, word);
  $('tr-meter').innerHTML = s.statuses.map(([label, k]) => `<b class="tr-k-${k}" style="width:${s.total ? ((s.labels[label] || 0) / s.total) * 100 : 0}%"></b>`).join('');
  $('tr-legend').innerHTML = s.statuses.map(([label, k]) => `<li><i class="tr-k-${k}"></i>${esc(label)} ${s.labels[label] || 0}</li>`).join('');
  const button = $('tr-due');
  button.disabled = !s.due && !filters[tab].due;
  button.textContent = s.due ? ui.toRevise(s.due) : ui.nothingToRevise;
  button.setAttribute('aria-pressed', String(filters[tab].due));
  const phases = sheets[tab].phases;
  if (phases) {
    phases.forEach((_, i) => {
      const card = document.querySelector(`#tr-phases [data-p="${i}"]`);
      if (!card) return;
      const p = s.phases[i] || { total: 0, done: 0 };
      card.querySelector('.tr-phase__count').textContent = `${p.done}/${p.total}`;
      card.querySelector('.tr-phase__fill').style.width = `${p.total ? (p.done / p.total) * 100 : 0}%`;
    });
  }
  document.querySelectorAll('#tr-tabs .tr-tab small').forEach((el) => {
    const key = el.dataset.k;
    el.textContent = `${rowsOf(key).filter((row) => kind(key, row.id) === 'done').length}/${rowsOf(key).length}`;
  });
}

/* ------------------------------------------------------------------------------------------------ the sheet on show */

const option = (value, text) => `<option value="${esc(value)}">${esc(text)}</option>`;
function fillSelect(id, label, all, entries, value, visible) {
  const select = $(id);
  select.setAttribute('aria-label', label);
  select.innerHTML = option('', all) + entries.map(([v, t]) => option(v, t)).join('');
  select.value = value;
  select.hidden = !visible;
}

/** Show or hide the chip that says the list is held to a range of study items. */
function syncRange() {
  const range = filters[tab].range;
  $('tr-range').hidden = !range;
  if (range) $('tr-range-text').textContent = ui.rangeShowing(range.from, range.to);
}

function setupTab() {
  const spec = C.tabs[tab];
  const f = filters[tab];
  $('tr-tabs').innerHTML = C.tabOrder.map((key) => `<button type="button" class="tr-tab" data-tab="${key}" aria-pressed="${key === tab}">${esc(C.tabs[key].label)}<small data-k="${key}"></small></button>`).join('');
  $('tr-tabs').setAttribute('aria-label', ui.tabsLabel);
  const phases = sheets[tab].phases;
  $('tr-phases').setAttribute('aria-label', ui.phasesLabel);
  $('tr-phases').innerHTML = phases
    ? phases.map((phase, i) => {
      const tag = phase.match(/^(Phase \d+|G\d+)/);
      const name = phase.replace(/^(Phase \d+|G\d+):\s*/, '');
      return `<button type="button" class="tr-phase" data-p="${i}" aria-pressed="${f.ph === String(i)}" title="${esc(phase)}"><span class="tr-phase__top"><span class="tr-phase__name">${esc(tag ? `${tag[1]} · ${name}` : phase)}</span><span class="tr-phase__count"></span></span><span class="tr-phase__track"><b class="tr-phase__fill"></b></span></button>`;
    }).join('')
    : '';
  fillSelect('tr-phase', ui.filterLabels.phase, ui.phaseAll, (phases || []).map((p, i) => [String(i), p]), f.ph, !!phases);
  fillSelect('tr-st', ui.filterLabels.status, ui.statusAny, (tab === 'pr' ? [['done', C.practiceLabels.done], ['wip', C.practiceLabels.wip], ['none', C.practiceLabels.none]] : spec.statuses.map((s) => [s[0], s[0]])), f.st, true);
  fillSelect('tr-pri', ui.filterLabels.priority, ui.priorityAny, C.priorities.map((p) => [p, p]), f.pri, tab !== 'qa');
  fillSelect('tr-df', ui.filterLabels.difficulty, ui.difficultyAny, C.difficulties.map((d) => [d, d]), f.df, true);
  fillSelect('tr-trk', ui.filterLabels.track, ui.trackAll, ((sheets.gai && sheets.gai.tracks) || []).map((t) => [t, ui.track(t)]), f.tr, tab === 'gai');
  fillSelect('tr-lesson', ui.filterLabels.lesson, ui.lessonAny, [['has', ui.lessonHas], ['none', ui.lessonNone]], f.lesson, tab === 'sd' || tab === 'gai');
  $('tr-q').value = f.q;
  $('tr-notes').checked = f.notes;
  const cols = $('tr-cols');
  cols.className = `tr-cols${tab === 'pr' ? ' tr-cols--pr' : ''}`;
  cols.innerHTML = tab === 'pr'
    ? `<span>${esc(ui.columns.problem)}</span><span>${esc(ui.columns.confidence)}</span><span>${esc(ui.columns.score)}</span>`
    : `<span></span><span>${esc(tab === 'qa' ? ui.columns.question : ui.columns.item)}</span><span>${esc(ui.status)}</span><span>${esc(ui.columns.confidence)}</span><span>${esc(spec.dateLabel)}</span>`;
  syncRange();
  renderList();
  paintSummary();
}

function go(key) {
  tab = C.tabs[key] ? key : C.defaultTab;
  if (location.hash.slice(1) !== C.tabs[tab].hash) history.replaceState(null, '', `#${C.tabs[tab].hash}`);
  setupTab();
}

/* ------------------------------------------------------------------------------------------------ events */

const rowOf = (el) => el.closest('.tr-row');
const syncPhasePressed = () => document.querySelectorAll('#tr-phases .tr-phase').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.p === filters[tab].ph)));

document.addEventListener('click', (event) => {
  const target = event.target;
  const tabButton = target.closest('.tr-tab');
  if (tabButton) { go(tabButton.dataset.tab); return; }
  const phase = target.closest('.tr-phase');
  if (phase) {
    filters[tab].ph = filters[tab].ph === phase.dataset.p ? '' : phase.dataset.p;
    limit[tab] = C.pageSize;
    $('tr-phase').value = filters[tab].ph;
    syncPhasePressed();
    renderList();
    return;
  }
  if (target.closest('#tr-due')) { filters[tab].due = !filters[tab].due; limit[tab] = C.pageSize; renderList(); paintSummary(); return; }
  if (target.closest('#tr-more')) { limit[tab] += C.pageSize; renderList(); return; }
  const row = rowOf(target);
  const control = target.closest('[data-act]');
  if (!row || !control) return;
  const id = row.dataset.id;
  const { tab: key, row: item } = byId.get(id);
  const act = control.dataset.act;
  if (act === 'toggle') {
    const on = !open.has(id);
    if (on) open.add(id); else open.delete(id);
    row.classList.toggle('is-open', on);
    control.setAttribute('aria-expanded', String(on));
    const panel = row.querySelector('.tr-panel');
    if (on && !panel.firstChild) panel.innerHTML = panelHtml(key, item);
    panel.hidden = !on;
  } else if (act === 'conf') {
    const n = Number(control.dataset.v);
    const rec = recordFor(key, id);
    edit(id, { c: rec.c === n ? 0 : n, d: rec.c === n ? rec.d : today() });
  } else if (act === 'range') {
    filters.sd = { q: '', ph: '', st: '', pri: '', df: '', tr: '', lesson: '', due: false, notes: false, range: parseRange(item.ids) };
    limit.sd = C.pageSize;
    go('sd');
    window.scrollTo({ top: document.getElementById('tracker').offsetTop, behavior: 'auto' });
  } else if (act === 'step') {
    const i = Number(control.dataset.i);
    const digits = stepsOf(recordFor(key, id), stepsCount()).split('');
    digits[i] = C.stepCycle[digits[i]];
    edit(id, { p: digits.join(''), d: today() });
  }
});

document.addEventListener('change', (event) => {
  const target = event.target;
  const row = rowOf(target);
  if (!row) return;
  const id = row.dataset.id;
  const { tab: key } = byId.get(id);
  const spec = C.tabs[key];
  const act = target.dataset.act;
  if (act === 'tick') edit(id, target.checked ? { s: spec.done, d: today() } : { s: spec.blank.s });
  else if (act === 'status') edit(id, target.value === spec.blank.s ? { s: target.value } : { s: target.value, d: today() });
  else if (act === 'date') edit(id, { d: target.value });
});

let filterTimer = 0;
const FILTER_OF = { 'tr-q': 'q', 'tr-phase': 'ph', 'tr-st': 'st', 'tr-pri': 'pri', 'tr-df': 'df', 'tr-trk': 'tr', 'tr-lesson': 'lesson' };
document.addEventListener('input', (event) => {
  const target = event.target;
  if (target.dataset && target.dataset.act === 'note') {
    const id = rowOf(target).dataset.id;
    edit(id, { n: target.value });
    return;
  }
  if (target.id in FILTER_OF) {
    filters[tab][FILTER_OF[target.id]] = target.value;
    limit[tab] = C.pageSize;
    clearTimeout(filterTimer);
    filterTimer = setTimeout(() => { renderList(); syncPhasePressed(); }, target.id === 'tr-q' ? C.searchDelayMs : 0);
  } else if (target.id === 'tr-notes') {
    filters[tab].notes = target.checked;
    limit[tab] = C.pageSize;
    renderList();
  }
});

window.addEventListener('hashchange', () => {
  const key = C.tabOrder.find((k) => C.tabs[k].hash === location.hash.slice(1));
  if (key && key !== tab && sheets) go(key);
});

/* ------------------------------------------------------------------------------------------------ backups */

function download(name, type, text) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function wireBackup() {
  const labels = C.backup;
  $('tr-export').textContent = labels.export;
  $('tr-csv').textContent = labels.exportCsv;
  $('tr-import').textContent = labels.import;
  $('tr-reset').textContent = labels.reset;
  $('tr-confirm-text').textContent = labels.resetAsk;
  $('tr-confirm-yes').textContent = labels.resetConfirm;
  $('tr-confirm-no').textContent = labels.resetCancel;
  $('tr-foot').textContent = ui.footNote;
  $('tr-export').addEventListener('click', () => download(C.backupFileName(today()), 'application/json', backupText(records, new Date().toISOString(), C)));
  $('tr-csv').addEventListener('click', () => download(C.csvFileName(C.tabs[tab].hash, today()), 'text/csv;charset=utf-8', toCsv(tab, rowsOf(tab), records, C, stepCountOf(tab), tab === 'pr' ? sheets.pr.steps : [])));
  $('tr-import').addEventListener('click', () => $('tr-file').click());
  $('tr-file').addEventListener('change', async (event) => {
    const file = event.target.files && event.target.files[0];
    event.target.value = '';
    if (!file) return;
    if (file.size > C.maxBackupBytes) { setStatus(labels.importTooBig); return; }
    const read = readRecords(await file.text(), known, C);
    if (read.error) { setStatus(read.error === 'size' ? labels.importTooBig : labels.importFailed); return; }
    for (const [id, record] of read.records) records.set(id, record);
    changed();
    flush();
    renderList();
    paintSummary();
    setStatus(labels.importDone(read.records.size, read.ignored));
  });
  const confirm = $('tr-confirm');
  $('tr-reset').addEventListener('click', () => { confirm.hidden = false; $('tr-confirm-no').focus(); });
  $('tr-confirm-no').addEventListener('click', () => { confirm.hidden = true; $('tr-reset').focus(); });
  $('tr-confirm-yes').addEventListener('click', () => {
    records = new Map();
    open.clear();
    dirty = true;
    flush();
    confirm.hidden = true;
    renderList();
    paintSummary();
    setStatus(labels.resetDone);
    $('tr-reset').focus();
  });
}

/* ------------------------------------------------------------------------------------------------ start */

function setLabels() {
  $('tr-range-clear').textContent = ui.rangeClear;
  $('tr-range-clear').addEventListener('click', () => { filters[tab].range = null; limit[tab] = C.pageSize; syncRange(); renderList(); });
  $('tr-search-label').textContent = ui.searchLabel;
  $('tr-q').placeholder = ui.searchPlaceholder;
  $('tr-notes-label').textContent = ui.withNotes;
}

async function start() {
  setLabels();
  setStatus(ui.loading);
  try {
    const response = await fetch(C.dataUrl);
    if (!response.ok) throw new Error(String(response.status));
    sheets = await response.json();
  } catch {
    setStatus(ui.loadFailed);
    return;
  }
  for (const key of C.tabOrder) {
    const count = key === 'pr' ? sheets.pr.steps.length : 0;
    for (const row of sheets[key].rows) { known.set(row.id, { tab: key, steps: count }); byId.set(row.id, { tab: key, row }); }
  }
  const stored = readRecords(readStored(STORAGE.tracker), known, C, 'version');
  if (stored.records) records = stored.records;
  const fromHash = C.tabOrder.find((k) => C.tabs[k].hash === location.hash.slice(1));
  tab = fromHash || C.defaultTab;
  wireBackup();
  setStatus(stored.records && records.size ? ui.saved : ui.savedNever);
  setupTab();
}

start();
