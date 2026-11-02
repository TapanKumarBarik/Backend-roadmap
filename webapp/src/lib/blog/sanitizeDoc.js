import { BLOG, CALLOUT_TONES, LANGUAGE_PATTERN, VIDEO_ID_PATTERN } from './limits.js';

// A post is stored as a ProseMirror document (JSON), never as HTML. Whatever a client sends is rebuilt here from an
// allow-list: only the node types and marks below survive, only the attributes each is allowed, with values coerced to
// their type. Anything else is dropped, and listed in `dropped` so the author is told rather than quietly losing text.
// Links are limited to a few schemes, images to the places our own uploads live, videos to a YouTube id. There is no raw
// HTML in a document, so there is none to inject; renderDoc.js only ever writes out what this keeps.
//
// This file must stay free of the DOM and of anything that needs a browser: it runs in the API (a Worker) and in tests.

/**
 * @typedef {{ type: string, attrs?: Record<string, any>, content?: Node[], text?: string, marks?: Mark[] }} Node
 * @typedef {{ type: string, attrs?: Record<string, any> }} Mark
 * @typedef {{ imageOrigins?: string[] }} Options
 */

export class DocError extends Error {}

const BLOCKS = new Set(['paragraph', 'heading', 'blockquote', 'bulletList', 'orderedList', 'taskList', 'codeBlock', 'horizontalRule', 'image', 'callout', 'video', 'table']);
// What each container may hold. A child of any other type is dropped.
const CHILDREN = {
  doc: BLOCKS,
  paragraph: new Set(['text', 'hardBreak']),
  heading: new Set(['text', 'hardBreak']),
  blockquote: BLOCKS,
  callout: BLOCKS,
  bulletList: new Set(['listItem']),
  orderedList: new Set(['listItem']),
  taskList: new Set(['taskItem']),
  listItem: BLOCKS,
  taskItem: BLOCKS,
  codeBlock: new Set(['text']),
  table: new Set(['tableRow']),
  tableRow: new Set(['tableCell', 'tableHeader']),
  tableCell: BLOCKS,
  tableHeader: BLOCKS
};
const LEAVES = new Set(['horizontalRule', 'image', 'video', 'hardBreak']);
const NEEDS_A_BLOCK = new Set(['blockquote', 'callout', 'listItem', 'taskItem', 'tableCell', 'tableHeader']);
const NEEDS_CHILDREN = new Set(['bulletList', 'orderedList', 'taskList', 'table', 'tableRow']);
const MARKS = new Set(['bold', 'italic', 'underline', 'strike', 'code', 'link']);

const CONTROL = (ch) => ch.charCodeAt(0) < 32 || ch.charCodeAt(0) === 127;
const stripControl = (s) => [...s].filter((ch) => !CONTROL(ch) || ch === '\n' || ch === '\t').join('');
const clip = (s, max) => (s.length > max ? s.slice(0, max) : s);
const text = (value, max = BLOG.attributeMax) => (typeof value === 'string' ? clip(stripControl(value), max).trim() : '');
const integer = (value, min, max, fallback) => {
  const n = Number(value);
  return Number.isInteger(n) ? Math.min(max, Math.max(min, n)) : fallback;
};

const SAFE_SCHEMES = new Set(['https:', 'http:', 'mailto:']);

/**
 * A link target we are willing to write into a page: a web address, an e-mail address, a path on this site or a fragment.
 * Returns the cleaned address, or null. Everything with another scheme (javascript:, data:, vbscript:, file:) is refused,
 * including the forms that hide it in whitespace or control characters.
 * @param {unknown} value
 * @returns {string | null}
 */
export function safeHref(value) {
  if (typeof value !== 'string') return null;
  const href = value.trim();
  if (!href || href.length > BLOG.hrefMax || [...href].some(CONTROL) || href.includes(String.fromCharCode(92))) return null;
  if (href.startsWith('#')) return href;
  if (href.startsWith('/')) return href.startsWith('//') ? null : href;
  try {
    // The parser's own form: spaces and quotes are percent-encoded, the host is lower-cased.
    const url = new URL(href);
    return SAFE_SCHEMES.has(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}

/**
 * An image address, only if it is under one of the upload locations ("https://host/container/"). A same-origin path is
 * refused on purpose: the site's own API has addresses that change state when loaded.
 * @param {unknown} value
 * @param {string[]} origins
 * @returns {string | null}
 */
export function safeImageSrc(value, origins) {
  if (typeof value !== 'string' || value.length > BLOG.hrefMax || [...value].some(CONTROL) || value.includes(String.fromCharCode(92))) return null;
  let url;
  try { url = new URL(value.trim()); } catch { return null; }
  if (url.protocol !== 'https:' || url.username || url.password) return null;
  for (const origin of origins || []) {
    const base = new URL(origin);
    // The address is compared after the URL parser has resolved any "..", so a path cannot climb out of the container.
    if (url.origin === base.origin && url.pathname.startsWith(base.pathname) && url.pathname.length > base.pathname.length) return url.href;
  }
  return null;
}

function cleanMarks(marks, dropped) {
  if (!Array.isArray(marks)) return undefined;
  const clean = [];
  const seen = new Set();
  for (const mark of marks) {
    if (!mark || typeof mark.type !== 'string' || !MARKS.has(mark.type)) { if (mark && mark.type) dropped.add(`mark:${String(mark.type).slice(0, 30)}`); continue; }
    if (seen.has(mark.type)) continue;
    if (mark.type === 'link') {
      const href = safeHref(mark.attrs && mark.attrs.href);
      if (!href) { dropped.add('link:unsafe'); continue; }
      clean.push({ type: 'link', attrs: { href } });
    } else {
      clean.push({ type: mark.type });
    }
    seen.add(mark.type);
  }
  return clean.length ? clean : undefined;
}

/**
 * Rebuilds a document from an allow-list. Throws DocError for a document that is not one at all or that is beyond the
 * limits; otherwise returns the clean document and the kinds of thing that were left out.
 * @param {unknown} input
 * @param {Options} [options]
 * @returns {{ doc: Node, dropped: string[] }}
 */
export function sanitizeDoc(input, options = {}) {
  if (!input || typeof input !== 'object' || /** @type {any} */ (input).type !== 'doc') throw new DocError('the document must be a doc');
  const dropped = new Set();
  let nodes = 0;

  /** @returns {Node | null} */
  function clean(node, parentType, depth) {
    if (!node || typeof node !== 'object' || typeof node.type !== 'string') { dropped.add('node:invalid'); return null; }
    if (++nodes > BLOG.nodesMax) throw new DocError('the document has too many parts');
    if (depth > BLOG.depthMax) throw new DocError('the document is nested too deeply');
    const type = node.type;
    const allowed = CHILDREN[parentType];
    if (!allowed || !allowed.has(type)) { dropped.add(`node:${type.slice(0, 30)}`); return null; }

    if (type === 'text') {
      if (typeof node.text !== 'string') return null;
      const value = clip(stripControl(node.text), BLOG.textMax);
      if (!value) return null;
      // A code block holds plain text: marks inside it would be rendered as markup.
      const marks = parentType === 'codeBlock' ? undefined : cleanMarks(node.marks, dropped);
      return marks ? { type, text: value, marks } : { type, text: value };
    }
    if (type === 'hardBreak') return { type };

    /** @type {Record<string, any> | undefined} */
    let attrs;
    const given = node.attrs && typeof node.attrs === 'object' ? node.attrs : {};
    switch (type) {
      case 'heading': attrs = { level: integer(given.level, 2, 4, 2) }; break;
      case 'orderedList': attrs = { start: integer(given.start, 1, 9999, 1) }; break;
      case 'taskItem': attrs = { checked: given.checked === true }; break;
      case 'codeBlock': attrs = { language: typeof given.language === 'string' && LANGUAGE_PATTERN.test(given.language) ? given.language : null }; break;
      case 'callout': attrs = { tone: CALLOUT_TONES.includes(given.tone) ? given.tone : 'note' }; break;
      case 'tableCell':
      case 'tableHeader': attrs = { colspan: integer(given.colspan, 1, 12, 1), rowspan: integer(given.rowspan, 1, 12, 1) }; break;
      case 'image': {
        const src = safeImageSrc(given.src, options.imageOrigins || []);
        if (!src) { dropped.add('image:unsafe'); return null; }
        attrs = { src, alt: text(given.alt), title: text(given.title) };
        break;
      }
      case 'video': {
        if (given.provider !== 'youtube' || typeof given.id !== 'string' || !VIDEO_ID_PATTERN.test(given.id)) { dropped.add('video:unsafe'); return null; }
        attrs = { provider: 'youtube', id: given.id };
        break;
      }
      default: break;
    }

    if (LEAVES.has(type)) return attrs ? { type, attrs } : { type };
    const content = [];
    for (const child of Array.isArray(node.content) ? node.content : []) {
      const kept = clean(child, type, depth + 1);
      if (kept) content.push(kept);
    }
    if (!content.length) {
      // A quote, a callout, a list item or a table cell must hold a block (the editor's schema says so): give it an empty paragraph.
      if (NEEDS_A_BLOCK.has(type)) content.push({ type: 'paragraph' });
      // A list without items or a table without rows carries nothing: leave it out rather than render an empty shell.
      else if (NEEDS_CHILDREN.has(type)) return null;
    }
    const result = { type };
    if (attrs) result.attrs = attrs;
    if (content.length) result.content = content;
    return result;
  }

  const content = [];
  for (const child of Array.isArray(/** @type {any} */ (input).content) ? /** @type {any} */ (input).content : []) {
    const kept = clean(child, 'doc', 1);
    if (kept) content.push(kept);
  }
  return { doc: { type: 'doc', content: content.length ? content : [{ type: 'paragraph' }] }, dropped: [...dropped].sort() };
}

/** True when a document has nothing in it a reader would see: no text, no image, no video, no rule. */
export function isEmptyDoc(doc) {
  const visit = (node) => {
    if (node.text && node.text.trim()) return false;
    if (node.type === 'image' || node.type === 'video' || node.type === 'horizontalRule') return false;
    return (node.content || []).every(visit);
  };
  return visit(doc);
}
