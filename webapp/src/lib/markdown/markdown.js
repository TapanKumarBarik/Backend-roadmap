import { renderTabs } from './tabs.js';
import { renderBlocks } from './contentBlocks.js';
import { renderVideos } from './video.js';
import { createStash, restore } from './htmlStash.js';
import { parseInlineMarkdown, parseMarkdown } from './math.js';

// Videos and blocks first, then tabs, then the document. Each generator
// produces HTML before marked sees the page, and each puts that HTML into a
// shared stash in place of a one-line placeholder — marked ends an HTML block
// at the first blank line, so anything multi-line spliced inline gets torn
// apart and its remainder re-parsed as markdown. The stash is restored after
// the document is parsed. See htmlStash.js.
export function renderMarkdownDoc(rawText) {
  const store = createStash();
  const prepared = renderTabs(renderBlocks(renderVideos(normalizeNewlines(rawText), store), store), store);
  return restore(parseMarkdown(prepared), store);
}

// Windows line endings (a checkout made there, a file edited there) must not change how a page renders: the callout,
// tab and video syntaxes are all matched line by line, and a stray "\r" at the end of a line stops them matching.
export const normalizeNewlines = (text) => text.replace(/\r\n?/g, '\n');

// A module's title as the page heading shows it: the index keeps the heading's raw text, which may hold a little
// inline markdown (`code`), so the header can draw the same heading before the module itself has arrived.
export function inlineTitleHtml(title) {
  return parseInlineMarkdown(title || '');
}

// A module's title is its first heading. The page lifts it out of the body so the header can put what is known about
// the module (reading time, status, tags) under the title, where a reader looks for it, instead of stacking all of it
// above. A document that does not open with a heading keeps its body whole and has no title to show.
export function splitTitle(html) {
  const match = /^\s*<h1\b[^>]*>([\s\S]*?)<\/h1>\s*/i.exec(html || '');
  return match ? { title: match[1], body: html.slice(match[0].length) } : { title: null, body: html };
}

export function stripFencedCode(md) {
  return md.replace(/```[\s\S]*?```/g, ' ');
}

// The reading speed is passed in (site.config.json content.wordsPerMinute) rather than imported: the build's
// pre-render step loads this file in plain Node, which cannot import the config JSON the way Vite does.
export function readTimeStats(md, wordsPerMinute) {
  const words = stripFencedCode(md).split(/\s+/).filter(Boolean).length;
  const minutes = Math.max(1, Math.round(words / wordsPerMinute));
  return { words, minutes };
}

export function slugify(s) {
  return s.toLowerCase().trim().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-').slice(0, 60);
}
