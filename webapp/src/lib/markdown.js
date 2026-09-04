import { marked } from 'marked';
import { renderTabs } from './tabs.js';
import { renderBlocks } from './contentBlocks.js';
import { createStash, restore } from './htmlStash.js';

// Blocks first, then tabs, then the document. Both generators produce HTML
// before marked sees the page, and both put that HTML into a shared stash
// in place of a one-line placeholder — marked ends an HTML block at the
// first blank line, so anything multi-line spliced inline gets torn apart
// and its remainder re-parsed as markdown. The stash is restored after the
// document is parsed. See htmlStash.js.
export function renderMarkdownDoc(rawText) {
  const store = createStash();
  const prepared = renderTabs(renderBlocks(rawText, store), store);
  return restore(marked.parse(prepared), store);
}

export function stripFencedCode(md) {
  return md.replace(/```[\s\S]*?```/g, ' ');
}

export function readTimeStats(md) {
  const words = stripFencedCode(md).split(/\s+/).filter(Boolean).length;
  const minutes = Math.max(1, Math.round(words / 210));
  return { words, minutes };
}

export function slugify(s) {
  return s.toLowerCase().trim().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-').slice(0, 60);
}
