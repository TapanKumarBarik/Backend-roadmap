import { headingIds, plainText } from './docText.js';
import { LANGUAGE_PATTERN, VIDEO_ID_PATTERN, CALLOUTS } from './limits.js';
import { safeHref, safeImageSrc } from './sanitizeDoc.js';
import { videoCardHtml } from '../markdown/videoCard.js';

// Draws a document as HTML, for the page a reader opens and for crawlers and link previews. It writes out only the
// node types and marks sanitizeDoc.js keeps, escapes every piece of text and every attribute, and checks the addresses
// it is about to write once more (a document that skipped the sanitiser must still not be able to inject anything).
//
// The markup is the curriculum's own (the same code blocks, video cards, content blocks and tables as a module), so an
// article is styled by the CSS and brought to life by the code a module already has: highlighting, the copy button,
// the video player, diagrams. Nothing here is specific to a screen.
//
// Free of the DOM, so it runs in the API, in the Pages Function and in tests: the same HTML everywhere.

const escape = (value) => String(value)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/**
 * @param {any} doc  a sanitised document
 * @param {{ imageOrigins?: string[] }} [options]
 * @returns {string}
 */
export function renderDoc(doc, options = {}) {
  const nextId = headingIds();
  const origins = options.imageOrigins || [];

  function marked(node) {
    let html = escape(node.text);
    for (const mark of node.marks || []) {
      if (mark.type === 'bold') html = `<strong>${html}</strong>`;
      else if (mark.type === 'italic') html = `<em>${html}</em>`;
      else if (mark.type === 'underline') html = `<u>${html}</u>`;
      else if (mark.type === 'strike') html = `<s>${html}</s>`;
      else if (mark.type === 'code') html = `<code>${html}</code>`;
      else if (mark.type === 'link') {
        const href = safeHref(mark.attrs && mark.attrs.href);
        if (!href) continue;
        // A link someone else wrote is not an endorsement: search engines are told so, and the page opening in a new tab cannot reach back.
        html = /^https?:/i.test(href)
          ? `<a href="${escape(href)}" rel="nofollow ugc noopener noreferrer" target="_blank">${html}</a>`
          : `<a href="${escape(href)}">${html}</a>`;
      }
    }
    return html;
  }

  const children = (node) => (node.content || []).map(render).join('');

  function render(node) {
    switch (node.type) {
      case 'text': return marked(node);
      case 'hardBreak': return '<br>';
      case 'paragraph': return `<p>${children(node)}</p>`;
      case 'heading': {
        const level = Math.min(4, Math.max(2, Number(node.attrs && node.attrs.level) || 2));
        const id = nextId(plainText(node) || 'section');
        return `<h${level} id="${escape(id)}">${children(node)}</h${level}>`;
      }
      case 'blockquote': return `<blockquote>${children(node)}</blockquote>`;
      case 'bulletList': return `<ul>${children(node)}</ul>`;
      case 'orderedList': {
        const start = Number(node.attrs && node.attrs.start);
        return `<ol${Number.isInteger(start) && start > 1 ? ` start="${start}"` : ''}>${children(node)}</ol>`;
      }
      case 'listItem': return `<li>${children(node)}</li>`;
      case 'taskList': return `<ul class="task-list">${children(node)}</ul>`;
      case 'taskItem': {
        const done = !!(node.attrs && node.attrs.checked);
        return `<li class="task-item${done ? ' is-done' : ''}"><span class="task-box" role="img" aria-label="${done ? 'Done' : 'Not done'}"></span><div>${children(node)}</div></li>`;
      }
      case 'codeBlock': {
        const language = node.attrs && typeof node.attrs.language === 'string' && LANGUAGE_PATTERN.test(node.attrs.language) ? node.attrs.language : null;
        return `<pre><code${language ? ` class="language-${escape(language)}"` : ''}>${(node.content || []).map((n) => escape(n.text)).join('')}</code></pre>`;
      }
      case 'horizontalRule': return '<hr>';
      case 'image': {
        const src = safeImageSrc(node.attrs && node.attrs.src, origins);
        if (!src) return '';
        const alt = (node.attrs && node.attrs.alt) || '';
        const caption = (node.attrs && node.attrs.title) || '';
        return `<figure><img src="${escape(src)}" alt="${escape(alt)}" loading="lazy" decoding="async">${caption ? `<figcaption>${escape(caption)}</figcaption>` : ''}</figure>`;
      }
      case 'callout': {
        const { label, cls } = CALLOUTS[node.attrs && Object.hasOwn(CALLOUTS, node.attrs.tone) ? node.attrs.tone : 'note'];
        return `<div class="cblock cblock-${cls}"><div class="cblock-h">${label}</div><div class="cblock-b">${children(node)}</div></div>`;
      }
      case 'video': {
        const id = node.attrs && node.attrs.id;
        if (!VIDEO_ID_PATTERN.test(String(id))) return '';
        return videoCardHtml(id, '');
      }
      case 'table': {
        // A first row of header cells is the table's head, as in a module's tables (and its CSS).
        const rows = node.content || [];
        const headed = rows.length > 0 && (rows[0].content || []).length > 0 && rows[0].content.every((cell) => cell.type === 'tableHeader');
        return `<table>${headed ? `<thead>${render(rows[0])}</thead>` : ''}<tbody>${(headed ? rows.slice(1) : rows).map(render).join('')}</tbody></table>`;
      }
      case 'tableRow': return `<tr>${children(node)}</tr>`;
      case 'tableHeader':
      case 'tableCell': {
        const tag = node.type === 'tableHeader' ? 'th' : 'td';
        const span = (name) => { const n = Number(node.attrs && node.attrs[name]); return Number.isInteger(n) && n > 1 && n <= 12 ? ` ${name}="${n}"` : ''; };
        return `<${tag}${span('colspan')}${span('rowspan')}>${children(node)}</${tag}>`;
      }
      default: return ''; // not in the allow-list: nothing is written for a node this file does not know
    }
  }

  return children(doc);
}
