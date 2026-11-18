// content/study-packs.json: the PDF books and lab workbooks the site gives away, as the page at /study-packs/ lists them (webapp/study-packs/). The files are in
// webapp/public/<folder>, so the build copies them to the same address on the site, and no address can change after it is published (docs/URL_MIGRATION_REGISTRY.md).
// This reads the catalogue, checks it against the files on disk, and writes the cards the page carries, so a reader and a search engine see every download without a script.
// A book is added by putting its PDF in the folder and an entry in the catalogue: the check fails on a PDF with no entry and on an entry with no PDF.
import fs from 'node:fs';
import path from 'node:path';
import { CONTENT_ROOT, ROOT } from './config.mjs';

export const STUDY_PACKS_FILE = path.join(CONTENT_ROOT, 'study-packs.json');
export const PUBLIC_ROOT = path.join(ROOT, 'webapp', 'public');

/** What each kind of file is called on the page. */
export const KINDS = { guide: 'Guide', labs: 'Lab workbook', book: 'Book' };

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const FILE_NAME = /^[a-z0-9]+(-[a-z0-9]+)*\.pdf$/;
const isCount = (n) => Number.isInteger(n) && n > 0;
const isText = (s) => typeof s === 'string' && s.trim().length > 0;

/** The catalogue, or an empty one when the file is not there. */
export function loadStudyPacks(file = STUDY_PACKS_FILE) {
  if (!fs.existsSync(file)) return { folder: '', sections: [] };
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

/** The size in bytes of a catalogued file on disk, 0 when it is not there. */
export const diskSizeOf = (data) => (file) => {
  try { return fs.statSync(path.join(PUBLIC_ROOT, data.folder, file)).size; } catch { return 0; }
};

/** The PDFs that are in the folder on disk. */
export const diskFolderListing = (data) => () => {
  try { return fs.readdirSync(path.join(PUBLIC_ROOT, data.folder)); } catch { return []; }
};

/** Every pack of every section, in order. */
export const allPacks = (data) => data.sections.flatMap((section) => section.packs);

/**
 * What is wrong with the catalogue, as sentences that name the entry. `sizeOf(file)` is the file's size in bytes (0 when it is missing) and `listing()` the names in the folder.
 * @param {any} data
 * @param {{ sizeOf: (file: string) => number, listing: () => string[] }} options
 */
export function validateStudyPacks(data, { sizeOf, listing }) {
  const problems = [];
  if (!data || typeof data !== 'object') return ['the catalogue is not an object'];
  if (!isText(data.folder) || /^\/|\/$|\.\./.test(data.folder)) problems.push('"folder" must be a path under webapp/public, with no slash at either end');
  if (!Array.isArray(data.sections) || data.sections.length === 0) return [...problems, 'there are no sections'];
  const ids = new Set();
  const files = new Set();
  const claim = (set, value, what) => { if (set.has(value)) problems.push(`${what} "${value}" is used twice`); set.add(value); };
  for (const section of data.sections) {
    const at = `section "${section && section.id}"`;
    if (!section || !SLUG.test(section.id || '')) problems.push(`${at}: "id" must be lower-case words joined by hyphens`);
    else claim(ids, section.id, 'the id');
    for (const field of ['title', 'intro']) if (!isText(section && section[field])) problems.push(`${at}: "${field}" is missing or empty`);
    if (!section || !Array.isArray(section.packs) || section.packs.length === 0) { problems.push(`${at}: it has no packs`); continue; }
    for (const pack of section.packs) {
      const name = `pack "${pack && pack.id}"`;
      if (!SLUG.test(pack.id || '')) problems.push(`${name}: "id" must be lower-case words joined by hyphens`);
      else claim(ids, pack.id, 'the id');
      for (const field of ['title', 'summary']) if (!isText(pack[field])) problems.push(`${name}: "${field}" is missing or empty`);
      if (pack.code !== undefined && !isText(pack.code)) problems.push(`${name}: "code" is empty`);
      if (!Array.isArray(pack.files) || pack.files.length === 0) { problems.push(`${name}: it has no files`); continue; }
      for (const f of pack.files) {
        const at2 = `${name}, file "${f && f.file}"`;
        if (!(f.kind in KINDS)) problems.push(`${at2}: "kind" must be one of ${Object.keys(KINDS).join(', ')}`);
        if (!isText(f.title)) problems.push(`${at2}: "title" is missing or empty`);
        if (!FILE_NAME.test(f.file || '')) problems.push(`${at2}: the file name must be lower-case words joined by hyphens, ending in .pdf`);
        else {
          claim(files, f.file, 'the file');
          if (sizeOf(f.file) <= 0) problems.push(`${at2}: there is no such file in ${data.folder}`);
        }
        if (!isCount(f.pages)) problems.push(`${at2}: "pages" must be a whole number above 0`);
        if (f.labs !== undefined && (f.kind !== 'labs' || !isCount(f.labs))) problems.push(`${at2}: "labs" is for a lab workbook, and a whole number above 0`);
      }
    }
  }
  for (const name of listing()) if (!files.has(name)) problems.push(`${data.folder}/${name} is in the folder but not in the catalogue, so the page would not offer it`);
  return problems;
}

// A percent sign is written as an entity too: the build replaces %NAME% placeholders in a page, and text with two percent signs in it must not look like one.
const esc = (text) => String(text).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/%/g, '&#37;');
const count = (n) => new Intl.NumberFormat('en-GB').format(n);
const plural = (n, word) => `${count(n)} ${word}${n === 1 ? '' : 's'}`;

/** A size the way a download link says it: 4.5 MB (megabytes of a million bytes). */
export const formatSize = (bytes) => `${(bytes / 1e6).toFixed(1)} MB`;

/** The page's address for a file. */
export const addressOf = (data, file) => `/${data.folder}/${file}`;

/** What one file's line says besides its title: what it is, how many labs, pages and megabytes. */
export function fileFacts(f, sizeOf) {
  return [KINDS[f.kind], f.labs ? plural(f.labs, 'lab') : '', plural(f.pages, 'page'), formatSize(sizeOf(f.file))].filter(Boolean).join(' · ');
}

/** The totals line: how much there is to download. */
export function totalsText(data, sizeOf) {
  const files = allPacks(data).flatMap((pack) => pack.files);
  return `${plural(files.length, 'PDF')} · ${plural(files.reduce((sum, f) => sum + f.pages, 0), 'page')} · ${formatSize(files.reduce((sum, f) => sum + sizeOf(f.file), 0))} in all`;
}

/** The catalogue as HTML for the page: the totals, then each section with a card for each pack and a link for each of its files. */
export function studyPacksHtml(data, sizeOf = diskSizeOf(data)) {
  if (!data.sections.length) return '';
  const card = (pack) => [
    `<article class="tool-card study-pack" id="${esc(pack.id)}">`,
    `<h3>${pack.code ? `<span class="study-code">${esc(pack.code)}</span> ` : ''}${esc(pack.title)}</h3>`,
    `<p>${esc(pack.summary)}</p>`,
    '<ul class="study-files">',
    ...pack.files.map((f) => `<li><a href="${esc(addressOf(data, f.file))}" type="application/pdf">${esc(f.title)}</a><span class="study-meta">${esc(fileFacts(f, sizeOf))}</span></li>`),
    '</ul>',
    '</article>'
  ].join('');
  const section = (s) => [
    `<section class="study-section" aria-labelledby="section-${esc(s.id)}">`,
    `<h2 id="section-${esc(s.id)}">${esc(s.title)}</h2>`,
    `<p>${esc(s.intro)}</p>`,
    ...s.packs.map(card),
    '</section>'
  ].join('\n    ');
  return [`<p class="tool-note study-totals">${esc(totalsText(data, sizeOf))}</p>`, ...data.sections.map(section)].join('\n\n    ');
}
