// The logic of the Prep Tracker (webapp/tracker/index.html, drawn by webapp/src/tools/tracker.js): what a row's state is, when it is due again, which rows a filter
// keeps, the counts of the progress bar, and the files a reader can save (a CSV of a sheet, a backup of everything) and load again. Pure: no DOM, no clock (the
// day is passed in), so it is tested in model.test.js. Every number and word it needs is in config/tracker.js and is passed in as `config`.
//
// A reader's state for one row is a record: { s: status, c: confidence 0-5, n: notes, d: the day it was last studied, YYYY-MM-DD }, or for a design problem
// { p: one digit for each step (0 not done, 1 partly, 2 done), c, n, d }. A record holds only what differs from the blank one.

const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** True for a real calendar day written YYYY-MM-DD (not 2026-02-30). */
export function isDay(text) {
  const m = typeof text === 'string' ? DAY.exec(text) : null;
  if (!m) return false;
  const date = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return date.getUTCFullYear() === +m[1] && date.getUTCMonth() === +m[2] - 1 && date.getUTCDate() === +m[3];
}

/** The day `days` after `day`, both YYYY-MM-DD. */
export function addDays(day, days) {
  const [y, m, d] = day.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + days));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

/** A row nobody has touched, for a sheet. */
export const blankRecord = (tab, config) => ({ ...config.tabs[tab].blank });

/** The record of a row: what is stored for it on top of the blank one. */
export const recordOf = (tab, stored, config) => ({ ...config.tabs[tab].blank, ...stored });

/** Only what differs from the blank record: what is worth keeping. An empty object means the row is untouched. */
export function compact(tab, record, config) {
  const blank = config.tabs[tab].blank;
  const out = {};
  for (const key of Object.keys(blank)) if (record[key] !== undefined && record[key] !== blank[key]) out[key] = record[key];
  return out;
}

/** The steps of a design problem as `count` digits, the ones not written down being "not done". */
export const stepsOf = (record, count) => String(record.p || '').padEnd(count, '0').slice(0, count);

/** What a design problem scores: a step done is 1, partly done 0.5. */
export function scoreOf(record, count) {
  return stepsOf(record, count).split('').reduce((sum, digit) => sum + (digit === '2' ? 1 : digit === '1' ? 0.5 : 0), 0);
}

/** 'done', 'wip', 'revise' or 'none': what the status of a row (or the steps of a design problem) comes to. */
export function kindOf(tab, record, config, stepCount = 0) {
  if (tab === 'pr') {
    const steps = stepsOf(record, stepCount);
    return steps && !/[01]/.test(steps) ? 'done' : /[12]/.test(steps) ? 'wip' : 'none';
  }
  const found = config.tabs[tab].statuses.find((status) => status[0] === record.s);
  return found ? found[1] : 'none';
}

/** The day a row is due again: its last day plus what its confidence earns, or '' when it has no day or no confidence yet. */
export function nextReview(record, config) {
  const days = config.reviewAfterDays[record.c];
  return record.d && isDay(record.d) && days ? addDays(record.d, days) : '';
}

/** Whether a row should be looked at again today: called back by its status, or past the day its confidence earned. */
export function isDue(tab, record, today, config, stepCount = 0) {
  const next = nextReview(record, config);
  if (tab === 'pr') return !!next && next <= today && kindOf(tab, record, config, stepCount) !== 'none';
  const spec = config.tabs[tab];
  if (record.s === spec.revise) return true;
  return !!next && next <= today && record.s !== spec.blank.s;
}

const RANGE = /^([A-Z]{2,3}-[A-Z]{1,2}-\d{3})(?: to ([A-Z]{2,3}-[A-Z]{1,2}-\d{3}))?$/;

/** The checklist items a design problem covers, from its text ("SD-U-280 to SD-U-288", or one id): { from, to }, or null when the text is not one of those. */
export function parseRange(text) {
  const m = RANGE.exec(String(text || '').trim());
  return m ? { from: m[1], to: m[2] || m[1] } : null;
}

/** Whether an item id is one of the ids of a range: the same group (everything before the last three digits) and a number from the first to the last. */
export function inRange(id, range) {
  return !!id && id.slice(0, -3) === range.from.slice(0, -3) && id >= range.from && id <= range.to;
}

/** The text a search looks in: the id, the title, the topic and what the row says about its own prerequisites. */
export const haystack = (row) => [row.i || row.id, row.n, row.t, row.st, row.ids].filter(Boolean).join(' ').toLowerCase();

/**
 * Whether a row passes the filters: { q, ph, st, pri, df, tr, lesson ('has' | 'none' | ''), due, notes, range }. `st` is a status for a checklist and a kind (done, wip, none)
 * for a design problem, and `range` ({ from, to } or null) keeps only the checklist items of those ids.
 */
export function matches(tab, row, record, filters, today, config, stepCount = 0) {
  if (filters.range && !inRange(row.i, filters.range)) return false;
  if (filters.ph !== '' && String(row.ph) !== filters.ph) return false;
  if (filters.pri && row.p !== filters.pri) return false;
  if (filters.df && row.df !== filters.df) return false;
  if (filters.tr && row.tr !== filters.tr) return false;
  const hasLesson = Boolean(row.u) || (Array.isArray(row.ls) && row.ls.length > 0);
  if (filters.lesson === 'has' && !hasLesson) return false;
  if (filters.lesson === 'none' && hasLesson) return false;
  if (filters.st && (tab === 'pr' ? kindOf(tab, record, config, stepCount) !== filters.st : record.s !== filters.st)) return false;
  if (filters.notes && !record.n) return false;
  if (filters.due && !isDue(tab, record, today, config, stepCount)) return false;
  const q = String(filters.q || '').trim().toLowerCase();
  if (q && haystack(row).indexOf(q) < 0 && record.n.toLowerCase().indexOf(q) < 0) return false;
  return true;
}

/**
 * The counts behind the progress bar of a sheet: how many rows are in each status (by label), how many are done and due, and for each phase how many rows there
 * are and how many are done.
 * @param {Array<{ id: string, ph?: number }>} rows
 * @param {Map<string, object>} records  stored records by row id
 */
export function summarize(tab, rows, records, today, config, stepCount = 0) {
  const spec = config.tabs[tab];
  const labels = {};
  const phases = {};
  let done = 0;
  let due = 0;
  for (const row of rows) {
    const record = recordOf(tab, records.get(row.id), config);
    const kind = kindOf(tab, record, config, stepCount);
    const label = tab === 'pr' ? config.practiceLabels[kind] : record.s;
    labels[label] = (labels[label] || 0) + 1;
    if (kind === 'done') done += 1;
    if (isDue(tab, record, today, config, stepCount)) due += 1;
    if (row.ph !== undefined) {
      const phase = (phases[row.ph] = phases[row.ph] || { total: 0, done: 0 });
      phase.total += 1;
      if (kind === 'done') phase.done += 1;
    }
  }
  return { total: rows.length, done, due, labels, phases, statuses: tab === 'pr' ? [[config.practiceLabels.done, 'done'], [config.practiceLabels.wip, 'wip'], [config.practiceLabels.none, 'none']] : spec.statuses };
}

/* ------------------------------------------------------------------------------------------------ files */

// A spreadsheet reads a cell that begins with one of these as a formula, and a note or a title can begin with anything.
const FORMULA_START = /^[=+\-@\t\r]/;

function csvCell(value) {
  let text = String(value == null ? '' : value);
  if (FORMULA_START.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** One sheet as CSV (RFC 4180, with a byte-order mark so a spreadsheet reads the accents), with a row for every item. */
export function toCsv(tab, rows, records, config, stepCount = 0, stepNames = []) {
  const head = config.csvColumns;
  const header = [head.id, head.item, head.status, head.confidence, head.studied, head.next, head.notes];
  if (tab === 'pr') header.push(config.tabs.pr.label);
  const lines = [header.map(csvCell).join(',')];
  for (const row of rows) {
    const record = recordOf(tab, records.get(row.id), config);
    const kind = kindOf(tab, record, config, stepCount);
    const status = tab === 'pr' ? config.practiceLabels[kind] : record.s;
    const cells = [row.i || row.id, row.n, status, record.c || '', record.d || '', nextReview(record, config), record.n];
    if (tab === 'pr') cells.push(stepsOf(record, stepCount).split('').map((digit, i) => `${stepNames[i] || i + 1}: ${config.ui.stepWords[digit]}`).join('; '));
    lines.push(cells.map(csvCell).join(','));
  }
  return '﻿' + lines.join('\r\n') + '\r\n';
}

/**
 * One record from what was stored or loaded from a backup, or null when there is nothing valid in it: a status the sheet does not have, a confidence outside 1 to 5,
 * a note that is not text and a day that is not a day are dropped, and a note is cut at the limit. A malformed file must never reach the page.
 */
export function sanitize(tab, raw, config, stepCount = 0) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const spec = config.tabs[tab];
  const record = {};
  if (tab === 'pr') {
    if (typeof raw.p === 'string' && /^[012]*$/.test(raw.p) && raw.p.length <= stepCount) record.p = raw.p;
  } else if (spec.statuses.some((status) => status[0] === raw.s)) {
    record.s = raw.s;
  }
  if (Number.isInteger(raw.c) && raw.c >= 1 && raw.c <= 5) record.c = raw.c;
  if (typeof raw.n === 'string') record.n = raw.n.slice(0, config.maxNoteChars);
  if (isDay(raw.d)) record.d = raw.d;
  const kept = compact(tab, { ...spec.blank, ...record }, config);
  return Object.keys(kept).length ? kept : null;
}

/** The text of the browser's own copy: { version, items }. */
export const serialize = (records, config) => JSON.stringify({ version: config.storageVersion, items: Object.fromEntries(records) });

/** The text of a backup a reader saves: { tracker, exportedAt, items }. */
export const backupText = (records, now, config) => JSON.stringify({ tracker: config.backupVersion, exportedAt: now, items: Object.fromEntries(records) }, null, 1);

/**
 * The records in a stored copy or a backup. `known` maps each item id to its sheet (and a design problem's step count); ids that are not items of the tracker, and
 * records with nothing valid in them, are counted in `ignored` and left out. `{ error }` when the text is not one of ours.
 * @param {string} text
 * @param {Map<string, { tab: string, steps: number }>} known
 * @param {'tracker' | 'version'} marker  the field that says what kind of file it is: `tracker` for a backup, `version` for the browser's own copy
 */
export function readRecords(text, known, config, marker = 'tracker') {
  if (typeof text !== 'string' || text.length > config.maxBackupBytes) return { error: 'size' };
  let data;
  try { data = JSON.parse(text); } catch { return { error: 'format' }; }
  const expected = marker === 'tracker' ? config.backupVersion : config.storageVersion;
  if (!data || typeof data !== 'object' || data[marker] !== expected || !data.items || typeof data.items !== 'object' || Array.isArray(data.items)) return { error: 'format' };
  const records = new Map();
  let ignored = 0;
  for (const [id, raw] of Object.entries(data.items)) {
    const where = known.get(id);
    const record = where ? sanitize(where.tab, raw, config, where.steps) : null;
    if (record) records.set(id, record);
    else ignored += 1;
  }
  return { records, ignored };
}
