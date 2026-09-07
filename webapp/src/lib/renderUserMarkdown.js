import { marked } from 'marked';
import DOMPurify from 'dompurify';

// Feed posts (and, unlike comments.js's plain-text choice, only feed posts —
// see that file's own comment on why comment text stays plain) get real
// markdown: bold/italic, lists, headings, blockquotes, links. Unlike
// markdown.js's renderMarkdownDoc (curriculum content, admin-authored,
// trusted), this text comes from any signed-in user, so marked's raw-HTML
// passthrough is a real XSS vector here — every render goes through
// DOMPurify before it's allowed anywhere near dangerouslySetInnerHTML.
const renderer = new marked.Renderer();

// Bare/markdown links open in a new tab with noopener/noreferrer, same as
// linkify.jsx's plain-text autolinks — a link out of the feed shouldn't
// leave the feed itself navigated away.
renderer.link = function link(tok) {
  const text = this.parser.parseInline(tok.tokens);
  return `<a href="${tok.href}" target="_blank" rel="noopener noreferrer">${text}</a>`;
};

const ALLOWED_TAGS = [
  'p', 'br', 'strong', 'em', 'del', 's', 'code', 'pre', 'blockquote',
  'ul', 'ol', 'li', 'a', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'hr'
];
const ALLOWED_ATTR = ['href', 'target', 'rel'];

export function renderUserMarkdown(text) {
  const html = marked.parse(text || '', { renderer, gfm: true, breaks: true, async: false });
  return DOMPurify.sanitize(html, { ALLOWED_TAGS, ALLOWED_ATTR });
}
