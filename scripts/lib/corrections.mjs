// content/corrections.json: the public log of what was wrong on a page and what was changed, newest first (it is the page at /corrections/, webapp/corrections/).
// This reads it, checks it against the content folder, and writes the entries as the HTML the page carries, so a reader and a search engine see the log without a script.
// An entry is added by hand when a mistake is fixed: the date, the lesson (its folder under content/), what was wrong, and what changed.
import fs from 'node:fs';
import path from 'node:path';
import { CONTENT_ROOT } from './config.mjs';
import { TRUST } from '../../webapp/src/config/trust.js';

export const CORRECTIONS_FILE = path.join(CONTENT_ROOT, 'corrections.json');

/** The entries of the log, or none when the file is not there. */
export function loadCorrections(file = CORRECTIONS_FILE) {
  if (!fs.existsSync(file)) return [];
  return JSON.parse(fs.readFileSync(file, 'utf8')).corrections;
}

const FIELDS = ['date', 'page', 'title', 'wrong', 'changed'];
const isoDay = (text) => /^\d{4}-\d{2}-\d{2}$/.test(text) && !Number.isNaN(Date.parse(`${text}T00:00:00Z`)) && new Date(`${text}T00:00:00Z`).toISOString().startsWith(text);

/**
 * What is wrong with the log, as sentences that name the entry. `hasPage(folder)` says whether a lesson exists; the log is newest first and names each lesson once a day.
 * @param {Array<Record<string, string>>} entries
 * @param {{ hasPage: (folder: string) => boolean }} options
 */
export function validateCorrections(entries, { hasPage }) {
  const problems = [];
  if (!Array.isArray(entries)) return ['corrections is not a list'];
  const seen = new Set();
  entries.forEach((entry, i) => {
    const name = `entry ${i + 1}${entry && entry.title ? ` (${entry.title})` : ''}`;
    for (const field of FIELDS) {
      if (typeof entry[field] !== 'string' || !entry[field].trim()) problems.push(`${name}: "${field}" is missing or empty`);
    }
    if (typeof entry.date === 'string' && !isoDay(entry.date)) problems.push(`${name}: "${entry.date}" is not a date written YYYY-MM-DD`);
    if (typeof entry.page === 'string' && entry.page && !hasPage(entry.page)) problems.push(`${name}: there is no lesson at "${entry.page}"`);
    if (i > 0 && typeof entry.date === 'string' && typeof entries[i - 1].date === 'string' && entry.date > entries[i - 1].date) problems.push(`${name}: entries must be newest first`);
    const key = `${entry.date}|${entry.page}`;
    if (seen.has(key)) problems.push(`${name}: this lesson is already corrected on ${entry.date}; put both in one entry`);
    seen.add(key);
  });
  return problems;
}

/** The checks against the real content folder. */
export const validateAgainstContent = (entries) => validateCorrections(entries, { hasPage: (folder) => fs.existsSync(path.join(CONTENT_ROOT, folder, 'README.md')) });

// A percent sign is written as an entity too: the build replaces %NAME% placeholders in a page, and text with two percent signs in it must not look like one.
const esc = (text) => String(text).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/%/g, '&#37;');

/** A day written the way a reader says it: 13 November 2026. */
export const formatDay = (iso) => new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${iso}T00:00:00Z`));

/** The log as HTML for the page: one card for each entry, newest first. */
export function correctionsHtml(entries) {
  return entries.map((e) => [
    `<article class="tool-card correction" id="${esc(e.date)}-${esc(e.page.split('/').pop())}">`,
    `<h2><a href="/${esc(e.page)}/">${esc(e.title)}</a></h2>`,
    `<p class="tool-note"><time datetime="${esc(e.date)}">${esc(formatDay(e.date))}</time></p>`,
    `<dl class="correction__text"><dt>${esc(TRUST.entry.wrong)}</dt><dd>${esc(e.wrong)}</dd><dt>${esc(TRUST.entry.changed)}</dt><dd>${esc(e.changed)}</dd></dl>`,
    '</article>'
  ].join('')).join('\n    ');
}
